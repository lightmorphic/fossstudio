// Session blocking: one click in the host panel bars an abusive guest
// from every session on this server - by IP address and by a device
// marker their browser presents, so a changed address alone doesn't
// let them straight back in. Reversible from the dashboard, exactly
// like the chat block list, and logged the same durable way.
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";
import { readJson, writeJson } from "./storage.js";

const BLOCKLIST_FILE = "session-blocklist.json";
let blocklist = null; // [{id, name, ip, marker, by, blockedAt}]

// Append-only moderation log (data/session-modlog.jsonl): every block
// and unblock with the moment, the name and the address. Not served by
// any endpoint - the reversible list is the UI; this is the durable
// record for when one is needed.
const MODLOG_FILE = "session-modlog.jsonl";
let modlogChain = Promise.resolve();
function modlog(entry) {
  modlogChain = modlogChain.then(async () => {
    await fs.appendFile(path.join(config.dataDir, MODLOG_FILE),
      JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n",
      { mode: 0o600 });
  }).catch((err) => console.error("session modlog append failed:", err.message));
  return modlogChain;
}

async function load() {
  if (blocklist === null) blocklist = await readJson(BLOCKLIST_FILE, []);
  return blocklist;
}

export async function listSessionBlocked() {
  // Names and timestamps only ever reach the dashboard; the stored
  // address and marker stay server-side even for hosts
  return (await load()).map(({ id, name, by, blockedAt }) => ({ id, name, by, blockedAt }));
}

export async function addSessionBlock({ name, ip, marker, by }) {
  const list = await load();
  list.unshift({
    id: crypto.randomBytes(6).toString("hex"),
    name, ip: ip || null, marker: marker || null, by, blockedAt: Date.now()
  });
  await writeJson(BLOCKLIST_FILE, list);
  await modlog({ action: "block", name, ip: ip || null, marker: marker || null, by });
}

export async function unblockSession(id, by) {
  const list = await load();
  const i = list.findIndex((b) => b.id === id);
  if (i === -1) return false;
  const [gone] = list.splice(i, 1);
  await writeJson(BLOCKLIST_FILE, list);
  await modlog({ action: "unblock", name: gone.name, ip: gone.ip, by: by || null });
  return true;
}

export async function isSessionBlocked({ ip, marker }) {
  const list = await load();
  return list.some((b) =>
    (ip && b.ip && b.ip === ip) || (marker && b.marker && b.marker === marker));
}
