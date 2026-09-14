// The secrets the studio needs to run, made by the studio.
//
// They used to be lines in a compose file: you generated two random
// strings with openssl, pasted them in, and they sat there in plain
// text in a file that gets copied, backed up, shared while asking for
// help, and occasionally pasted into a chat window. Charlie did exactly
// that with his own two the night before this was written, which is the
// whole argument for the change.
//
// So they are made here on the first start and kept in the data folder
// with the rest of the studio's state, owner-readable only, and nobody
// ever types them. An install that still sets them in the environment
// is honored unchanged - see config.js - because breaking somebody's
// studio to make a point is not a security improvement.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const FILE = "secrets.json";

// Read-or-make. This runs before config is finished, so it cannot use
// storage.js (which reads config for the data directory) and takes the
// directory as an argument instead.
export async function ensureSecrets(dataDir) {
  const file = path.join(dataDir, FILE);
  let stored = null;
  try {
    stored = JSON.parse(await fs.readFile(file, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const next = {
    sessionSecret: stored?.sessionSecret || crypto.randomBytes(32).toString("hex"),
    turnSecret: stored?.turnSecret || crypto.randomBytes(32).toString("hex")
  };
  if (!stored || stored.sessionSecret !== next.sessionSecret || stored.turnSecret !== next.turnSecret) {
    await fs.mkdir(dataDir, { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 });
    await fs.rename(tmp, file);
    if (!stored) console.log("made this studio's session and relay secrets; they live in the data folder");
  }
  return next;
}

// The relay is a separate container and cannot read the studio's
// settings, so what it needs is written where it can: a config file in
// the data folder that its compose entry points at. It holds the same
// shared secret and the same public address the studio is using, so the
// two can never drift apart, and the compose file needs neither.
//
// Written on every start. The relay restarts until it appears, which on
// a first run is the few seconds between the container starting and the
// studio finishing its own start-up.
export async function writeRelayConfig(dataDir, { turnSecret, publicIp, domain, minPort, maxPort }) {
  const dir = path.join(dataDir, "turn");
  await fs.mkdir(dir, { recursive: true });
  const lines = [
    "# Written by FOSSStudio on every start. Edit the studio's settings,",
    "# not this file: anything changed here is overwritten.",
    `realm=${domain || "localhost"}`,
    "use-auth-secret",
    `static-auth-secret=${turnSecret}`,
    "listening-port=3478",
    `min-port=${minPort}`,
    `max-port=${maxPort}`,
    "no-multicast-peers",
    // Without this a relay on a bridge network sees only the container's
    // own address and offers guests a relay that reaches nobody.
    ...(publicIp ? [`external-ip=${publicIp}`] : []),
    ""
  ];
  const file = path.join(dir, "turnserver.conf");
  const tmp = `${file}.${process.pid}.tmp`;
  // Readable rather than owner-only, unlike everything else the studio
  // writes: the relay is another container running as another user, and
  // a file it cannot open is a relay that quietly runs on defaults with
  // no shared secret at all. Anybody who can read this directory can
  // already read the account file beside it.
  await fs.writeFile(tmp, lines.join("\n"), { encoding: "utf8", mode: 0o644 });
  await fs.rename(tmp, file);
  return file;
}
