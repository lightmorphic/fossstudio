// Flat-file JSON storage. Every write goes to a temp file first and is then
// renamed into place, so a crash mid-write can never corrupt existing data.
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function readJson(name, fallback = null) {
  try {
    const raw = await fs.readFile(path.join(config.dataDir, name), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

let writeSeq = 0;
export async function writeJson(name, value) {
  const file = path.join(config.dataDir, name);
  await ensureDir(path.dirname(file));
  // Two writes of the same file in flight at once (a recording's
  // snapshot is saved on every chunk, from several uploaders) must not
  // share a temp name, or the second rename finds nothing to move.
  const tmp = `${file}.${process.pid}.${(writeSeq = (writeSeq + 1) % 1e9)}.tmp`;
  // Owner-only: these files hold password hashes, SMTP credentials and
  // session state - never world-readable.
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  await fs.rename(tmp, file);
}
