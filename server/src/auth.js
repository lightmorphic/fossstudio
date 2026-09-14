// Authentication: scrypt password hashing, an HMAC-signed session
// cookie, optional TOTP. Only node:crypto.
import crypto from "node:crypto";
import { config } from "./config.js";

const COOKIE = "fs_host";
const SESSION_HOURS = 24 * 7;

// ---------- password ----------

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const check = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), check);
}

// ---------- session tokens (stateless, HMAC-signed) ----------

function sign(data) {
  return crypto.createHmac("sha256", config.sessionSecret).update(data).digest("base64url");
}

export function makeToken(user) {
  const payload = Buffer.from(JSON.stringify({
    uid: user.id,
    exp: Date.now() + SESSION_HOURS * 3600 * 1000
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token) {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}

function cookieValue(req, name) {
  const raw = req.headers.cookie || "";
  const m = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

// Returns {uid} for a signed-in request, or null.
export function isAuthedRequest(req) {
  return verifyToken(cookieValue(req, COOKIE));
}

export function setAuthCookie(res, user) {
  res.setHeader("Set-Cookie",
    `${COOKIE}=${makeToken(user)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}`);
}

export function clearAuthCookie(res) {
  res.setHeader("Set-Cookie",
    `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

// ---------- TOTP (RFC 6238, standard authenticator apps) ----------

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  let bits = 0, value = 0;
  const out = [];
  for (const c of str.replace(/=+$/, "").toUpperCase()) {
    const idx = B32.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function totpCode(secretB32, timeStep = Math.floor(Date.now() / 30000)) {
  const key = base32Decode(secretB32);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(timeStep));
  const h = crypto.createHmac("sha1", key).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24 | h[off + 1] << 16 | h[off + 2] << 8 | h[off + 3]) % 1_000_000;
  return String(code).padStart(6, "0");
}

export function verifyTotp(secretB32, code) {
  const step = Math.floor(Date.now() / 30000);
  // Accept the neighboring steps to allow for clock drift
  return [step - 1, step, step + 1].some((s) => totpCode(secretB32, s) === String(code).trim());
}

// ---------- login with rate limiting ----------

const attempts = new Map(); // ip -> {count, until}
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

export async function tryLogin(ip, username, password, totp) {
  const a = attempts.get(ip);
  if (a && a.until > Date.now()) {
    return { ok: false, error: "Too many attempts. Try again in 15 minutes." };
  }
  const { findByUsername } = await import("./account.js");
  const user = await findByUsername(username || "");
  const passOk = user?.passwordHash ? verifyPassword(password || "", user.passwordHash) : false;
  const totpOk = user
    ? (!user.totpEnabled || (user.totpSecret && verifyTotp(user.totpSecret, totp || "")))
    : false;
  if (user && passOk && totpOk) {
    attempts.delete(ip);
    return { ok: true, user };
  }
  const next = { count: (a?.count || 0) + 1, until: 0 };
  if (next.count >= MAX_ATTEMPTS) { next.until = Date.now() + LOCK_MS; next.count = 0; }
  attempts.set(ip, next);
  return {
    ok: false,
    error: user && passOk && user.totpEnabled
      ? "That 2FA code isn't right."
      : "Wrong username or password."
  };
}

// ---------- the account's credentials ----------

export async function changePassword(newPassword) {
  const { updateAccount } = await import("./account.js");
  await updateAccount({ passwordHash: hashPassword(newPassword) });
}

export async function get2faState() {
  const { getAccount } = await import("./account.js");
  return { enabled: !!(await getAccount())?.totpEnabled };
}

export async function setup2fa() {
  const { updateAccount } = await import("./account.js");
  const secret = base32Encode(crypto.randomBytes(20));
  await updateAccount({ totpSecret: secret, totpEnabled: false });
  return {
    secret,
    otpauth: `otpauth://totp/FOSSStudio?secret=${secret}&issuer=FOSSStudio`
  };
}

export async function confirm2fa(code) {
  const { getAccount, updateAccount } = await import("./account.js");
  const acc = await getAccount();
  if (!acc?.totpSecret || !verifyTotp(acc.totpSecret, code)) return false;
  await updateAccount({ totpEnabled: true });
  return true;
}

export async function disable2fa(code) {
  const { getAccount, updateAccount } = await import("./account.js");
  const acc = await getAccount();
  if (!acc?.totpEnabled) return true;
  if (!verifyTotp(acc.totpSecret, code)) return false;
  await updateAccount({ totpEnabled: false, totpSecret: null });
  return true;
}
