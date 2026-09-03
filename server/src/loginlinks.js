// One-time sign-in links. Minted from the command line (admin-login-link.js)
// by whoever runs the server, redeemed once at /link/<token> within ten
// minutes, and useless afterwards. The file is read fresh on every
// redemption rather than cached, because the link is written by a
// separate process while the server runs - the one case where a cached
// store would never see the write.
import crypto from "node:crypto";
import { readJson, writeJson } from "./storage.js";

const FILE = "login-links.json";
const TTL_MS = 10 * 60 * 1000;

function hash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function live(list) {
  const now = Date.now();
  return (Array.isArray(list) ? list : []).filter((l) => l && l.exp > now);
}

export async function mintLink(userId) {
  const token = crypto.randomBytes(24).toString("base64url");
  const list = live(await readJson(FILE, []));
  list.push({ hash: hash(token), uid: userId, exp: Date.now() + TTL_MS });
  await writeJson(FILE, list);
  return token;
}

// The user id the token stands for, or null. A redeemed link is
// removed at once: it works exactly once.
export async function redeemLink(token) {
  if (!token || typeof token !== "string" || token.length > 200) return null;
  const list = live(await readJson(FILE, []));
  const h = hash(token);
  const i = list.findIndex((l) => l.hash.length === h.length &&
    crypto.timingSafeEqual(Buffer.from(l.hash), Buffer.from(h)));
  if (i === -1) { await writeJson(FILE, list); return null; }
  const [hit] = list.splice(i, 1);
  await writeJson(FILE, list);
  return hit.uid;
}
