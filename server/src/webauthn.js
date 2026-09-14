// Passkeys, verified here rather than taken on the browser's word.
//
// Charlie: "A passkey would be very helpful." It is: the private key
// never leaves the person's phone or laptop, the studio stores only a
// public key, and a stolen copy of the data folder yields nothing that
// can be used to log in. There is no password to phish, either, because
// the browser will only sign for the domain the passkey was made on.
//
// That last property is also the catch, and it is why the password
// stays: move the studio to a different domain and every passkey made
// on the old one is dead. A strong password is the way back in.
//
// Written out rather than taken from a library. The verification is
// three things - the challenge is the one we issued, the domain is
// ours, and the signature checks out against the stored public key -
// and node:crypto does the only hard part. A dependency here would be a
// few hundred kilobytes of someone else's code in the one place where
// reading it yourself is the point.
//
// Attestation is deliberately not checked. It answers "what make of
// key is this", which matters to a bank deciding whether to trust a
// device model and not at all to a studio with one owner; asking for it
// would only make some authenticators refuse.
import crypto from "node:crypto";

// ---------- just enough CBOR ----------

// The attestation object and the public key inside it are CBOR. Only
// the shapes WebAuthn actually uses are decoded: unsigned and negative
// integers, byte strings, text strings, arrays and maps.
function cborDecode(buf, pos = 0) {
  const b = buf[pos];
  const major = b >> 5;
  const minor = b & 31;
  let len = minor;
  let at = pos + 1;
  if (minor === 24) { len = buf[at]; at += 1; }
  else if (minor === 25) { len = buf.readUInt16BE(at); at += 2; }
  else if (minor === 26) { len = buf.readUInt32BE(at); at += 4; }
  else if (minor === 27) { len = Number(buf.readBigUInt64BE(at)); at += 8; }
  switch (major) {
    case 0: return { value: len, at };
    case 1: return { value: -1 - len, at };
    case 2: return { value: buf.subarray(at, at + len), at: at + len };
    case 3: return { value: buf.toString("utf8", at, at + len), at: at + len };
    case 4: {
      const out = [];
      for (let i = 0; i < len; i++) { const e = cborDecode(buf, at); out.push(e.value); at = e.at; }
      return { value: out, at };
    }
    case 5: {
      const out = new Map();
      for (let i = 0; i < len; i++) {
        const k = cborDecode(buf, at);
        const v = cborDecode(buf, k.at);
        out.set(k.value, v.value);
        at = v.at;
      }
      return { value: out, at };
    }
    case 7:
      if (minor === 20) return { value: false, at };
      if (minor === 21) return { value: true, at };
      if (minor === 22) return { value: null, at };
      return { value: null, at };
    default:
      throw new Error("this passkey is in a shape we cannot read");
  }
}

// ---------- the authenticator's own data ----------

// Fixed layout: 32 bytes of hashed domain, a flags byte, a counter,
// and - on a registration - the new credential after it.
function readAuthData(buf) {
  const out = {
    rpIdHash: buf.subarray(0, 32),
    flags: buf[32],
    signCount: buf.readUInt32BE(33)
  };
  out.userPresent = !!(out.flags & 0x01);
  out.userVerified = !!(out.flags & 0x04);
  if (out.flags & 0x40) {                       // a credential is attached
    const idLen = buf.readUInt16BE(53);
    out.credentialId = buf.subarray(55, 55 + idLen);
    out.publicKeyCose = buf.subarray(55 + idLen);
  }
  return out;
}

// A COSE key is a map of small integers. Turn the two kinds a browser
// will ever offer into something node:crypto will verify with.
//
//   -7   ES256, ECDSA over P-256 - what a phone or a security key gives
//   -257 RS256, RSA - what Windows Hello gives
function coseToKey(coseBuf) {
  const cose = cborDecode(coseBuf).value;
  const kty = cose.get(1);
  const alg = cose.get(3);
  if (kty === 2 && alg === -7) {
    const x = cose.get(-2);
    const y = cose.get(-3);
    // SPKI for an uncompressed P-256 point, prefix and all. Writing the
    // twenty-six byte header out is shorter and clearer than any way of
    // generating it.
    const spki = Buffer.concat([
      Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex"),
      Buffer.from([0x04]), x, y
    ]);
    return { key: crypto.createPublicKey({ key: spki, format: "der", type: "spki" }), alg };
  }
  if (kty === 3 && alg === -257) {
    const n = cose.get(-1);
    const e = cose.get(-2);
    const jwk = {
      kty: "RSA",
      n: Buffer.from(n).toString("base64url"),
      e: Buffer.from(e).toString("base64url")
    };
    return { key: crypto.createPublicKey({ key: jwk, format: "jwk" }), alg };
  }
  throw new Error("this passkey uses a kind of key the studio does not accept");
}

// ---------- challenges ----------

// One at a time, in memory, for two minutes. A challenge that is never
// used is a challenge nobody can replay, and none of this belongs on
// disk: it is worthless a moment later and it is one more thing to
// leak.
const pending = new Map();
const CHALLENGE_MS = 2 * 60 * 1000;

export function newChallenge(purpose) {
  const challenge = crypto.randomBytes(32).toString("base64url");
  pending.set(challenge, { purpose, until: Date.now() + CHALLENGE_MS });
  for (const [k, v] of pending) if (v.until < Date.now()) pending.delete(k);
  return challenge;
}

function takeChallenge(challenge, purpose) {
  const held = pending.get(challenge);
  pending.delete(challenge);
  return !!held && held.purpose === purpose && held.until > Date.now();
}

// ---------- what the browser sends back ----------

function readClientData(b64) {
  const json = Buffer.from(b64, "base64url").toString("utf8");
  return { json, data: JSON.parse(json) };
}

// The domain a passkey is bound to. A passkey made on the dashboard's
// own name works there and nowhere else, which is the whole point, so
// this is taken from the request rather than from a setting: whatever
// name the person is actually looking at is the name the key is for.
export function rpIdFor(host) {
  return String(host || "").split(":")[0].toLowerCase();
}

function hostOk(origin, rpId) {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return false;
    }
    return url.hostname.toLowerCase() === rpId;
  } catch { return false; }
}

// Registration: the browser has made a key pair and is handing over the
// public half. What is checked is that it answers the challenge we
// issued, on the domain we asked about, and that the credential is one
// we can verify signatures from later.
export function verifyRegistration({ response, rpId }) {
  const { data } = readClientData(response.clientDataJSON);
  if (data.type !== "webauthn.create") throw new Error("that is not a passkey registration");
  if (!takeChallenge(data.challenge, "register")) throw new Error("that registration has expired - start again");
  if (!hostOk(data.origin, rpId)) throw new Error("that registration came from the wrong address");

  const attestation = cborDecode(Buffer.from(response.attestationObject, "base64url")).value;
  const authData = readAuthData(attestation.get("authData"));
  if (!authData.credentialId) throw new Error("that registration carries no key");
  if (!authData.rpIdHash.equals(crypto.createHash("sha256").update(rpId).digest())) {
    throw new Error("that registration is for a different address");
  }
  if (!authData.userPresent) throw new Error("nobody confirmed that registration");
  // Read it once here so a key we could never verify with is refused now
  // rather than at the first attempt to log in with it.
  const { alg } = coseToKey(authData.publicKeyCose);
  return {
    id: Buffer.from(authData.credentialId).toString("base64url"),
    publicKey: Buffer.from(authData.publicKeyCose).toString("base64url"),
    alg,
    signCount: authData.signCount,
    rpId,
    addedAt: Date.now()
  };
}

// Signing in: the browser has signed our challenge with the private key
// it kept. The signature is over the authenticator's data followed by
// the hash of what the browser says it was asked - so a signature from
// another site, or for another challenge, cannot be replayed here.
export function verifyAssertion({ response, rpId, stored }) {
  const { data } = readClientData(response.clientDataJSON);
  if (data.type !== "webauthn.get") throw new Error("that is not a passkey signature");
  if (!takeChallenge(data.challenge, "login")) throw new Error("that sign-in has expired - try again");
  if (!hostOk(data.origin, rpId)) throw new Error("that sign-in came from the wrong address");

  const authDataBuf = Buffer.from(response.authenticatorData, "base64url");
  const authData = readAuthData(authDataBuf);
  if (!authData.rpIdHash.equals(crypto.createHash("sha256").update(rpId).digest())) {
    throw new Error("that passkey belongs to a different address");
  }
  if (!authData.userPresent) throw new Error("nobody confirmed that sign-in");

  const { key, alg } = coseToKey(Buffer.from(stored.publicKey, "base64url"));
  const signed = Buffer.concat([
    authDataBuf,
    crypto.createHash("sha256").update(Buffer.from(response.clientDataJSON, "base64url")).digest()
  ]);
  const signature = Buffer.from(response.signature, "base64url");
  const ok = alg === -7
    ? crypto.verify("sha256", signed, { key, dsaEncoding: "der" }, signature)
    : crypto.verify("sha256", signed, key, signature);
  if (!ok) throw new Error("that passkey signature does not check out");

  // A counter that goes backwards means the key has been cloned. Many
  // passkeys never count at all and report zero forever, which is fine;
  // one that counted before and counts lower now is not.
  if (stored.signCount > 0 && authData.signCount > 0 && authData.signCount <= stored.signCount) {
    throw new Error("that passkey looks like a copy of one we already know");
  }
  return { signCount: authData.signCount };
}
