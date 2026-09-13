// Recording orchestration. One active recording per room.
//
// Every participant's browser records itself and uploads chunks; the
// server appends them to a file and does nothing else to them. The
// host's browser also records the programme - the finished picture and
// mixed sound it drew for everyone - so the whole show arrives as one
// file too, already encoded. Nothing here converts, mixes or re-encodes
// anything: a track is served exactly as the browser wrote it.
//
// A JSON snapshot of the in-progress `rec` is written to disk on every
// meaningful change. If the process dies mid-take the snapshot and the
// chunks already uploaded both survive, so nothing is lost beyond the
// seconds nobody sent.
import crypto from "node:crypto";
import { activeBackdropPath } from "../rooms.js";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { readJson, writeJson } from "../storage.js";

const active = new Map(); // roomId -> rec

export function recDir(recId) {
  return path.join(config.dataDir, "recordings", recId);
}

function uploadToken(recId, peerId) {
  return crypto.createHmac("sha256", config.sessionSecret)
    .update(`${recId}:${peerId}`).digest("base64url");
}

export function verifyUploadToken(recId, peerId, token) {
  const expected = uploadToken(recId, peerId);
  return token?.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function activeRecording(roomId) {
  return active.get(roomId) || null;
}

function snapshotPath(recId) {
  return path.join(recDir(recId), "rec.json");
}

// Best-effort: a missed snapshot costs a little fidelity on the rare
// crash, never a recording in progress. Never let it throw.
async function saveSnapshot(rec) {
  try {
    const snap = {
      id: rec.id, roomId: rec.roomId,
      title: rec.title, startedAt: rec.startedAt,
      peers: Object.fromEntries(rec.peers)
    };
    // writeJson: atomic (temp file + rename) and owner-only (0600), same
    // as every other file under the data directory.
    await writeJson(path.join("recordings", rec.id, "rec.json"), snap);
  } catch (err) {
    console.error("recording snapshot failed:", err.message);
  }
}

async function clearSnapshot(recId) {
  await fs.unlink(snapshotPath(recId)).catch(() => {});
}

export function uploadCreds(rec, peerId) {
  return { recId: rec.id, peerId, token: uploadToken(rec.id, peerId) };
}

export async function saveIndex(entry) {
  const list = await readJson("recordings.json", []);
  const i = list.findIndex((r) => r.id === entry.id);
  i === -1 ? list.unshift(entry) : (list[i] = entry);
  await writeJson("recordings.json", list);
}

export async function listRecordings() {
  return readJson("recordings.json", []);
}

export async function startRecording(room) {
  if (active.has(room.id)) throw new Error("already recording");
  const recId = `${room.id}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  const rec = {
    id: recId,
    roomId: room.id,
    title: room.title || "",
    startedAt: Date.now(),
    peers: new Map(), // peerId -> {name, files:{}, startOffsetMs, done}
    stopping: false
  };
  await fs.mkdir(path.join(recDir(recId), "raw"), { recursive: true });
  active.set(room.id, rec);

  for (const peer of room.peers.values()) {
    if (peer.role === "viewer") continue; // view-only outputs aren't in the show
    addPeerToRecording(rec, peer);
  }

  await saveSnapshot(rec);
  return rec;
}

export function addPeerToRecording(rec, peer) {
  if (rec.peers.has(peer.id)) return;
  rec.peers.set(peer.id, {
    name: peer.name,
    role: peer.role,
    files: {},
    startOffsetMs: Date.now() - rec.startedAt,
    done: false
  });
  saveSnapshot(rec).catch(() => {});
}

// What a browser may send, and the extension each lands under. Anything
// else is refused rather than written to disk under a guessed name.
const KINDS = new Set(["audio", "video", "programme"]);
const EXTS = new Set(["webm", "mp4"]);

export async function appendChunk(recId, peerId, kind, ext, buf) {
  const rec = [...active.values()].find((r) => r.id === recId);
  if (!rec) throw new Error("no such recording");
  const p = rec.peers.get(peerId);
  if (!p) throw new Error("peer not in recording");
  // "programme" is the host's browser sending the finished picture and
  // mixed sound, already drawn and encoded there.
  if (!KINDS.has(kind)) throw new Error("bad kind");
  if (!EXTS.has(ext)) throw new Error("bad container");
  const safe = `${peerId}-${kind}.${ext}`;
  p.files[kind] = safe;
  await fs.appendFile(path.join(recDir(recId), "raw", safe), buf);
  saveSnapshot(rec).catch(() => {});
}

// A peer says its microphone is failing to keep up. The figure is that
// peer's running total for the take, so keep the largest rather than
// adding: a repeated message must not inflate it.
export function notePeerMicLoss(rec, peerId, lostMs) {
  const p = rec.peers.get(peerId);
  if (!p || !(lostMs > (p.micLostMs || 0))) return;
  p.micLostMs = lostMs;
  saveSnapshot(rec).catch(() => {});
}

export function markPeerDone(recId, peerId) {
  const rec = [...active.values()].find((r) => r.id === recId);
  if (!rec) return;
  const p = rec.peers.get(peerId);
  if (p) p.done = true;
  saveSnapshot(rec).catch(() => {});
  maybeFinalize(rec);
}

export async function stopRecording(room) {
  const rec = active.get(room.id);
  if (!rec) return null;
  rec.stopping = true;
  // Clients get the stop event and send their final chunks and a done
  // marker; finalize fires when all are in, or when the wait runs out.
  await saveSnapshot(rec);
  rec.stopTimeout = setTimeout(() => {
    for (const p of rec.peers.values()) p.done = true;
    maybeFinalize(rec);
  }, 20000);
  maybeFinalize(rec);
  return rec;
}

function maybeFinalize(rec) {
  if (!rec.stopping) return;
  if (![...rec.peers.values()].every((p) => p.done)) return;
  clearTimeout(rec.stopTimeout);
  active.delete(rec.roomId);
  finalize(rec).catch((err) => console.error("filing the recording failed:", err));
}

// A person's name, made safe for a filename and unique within the take.
function safeName(name, used) {
  const base = String(name || "").replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 30) || "guest";
  let candidate = base, i = 2;
  while (used.has(candidate)) candidate = `${base}-${i++}`;
  used.add(candidate);
  return candidate;
}

// The sentence the host reads beside a track whose microphone stalled.
// Factual, and no apology: it says whose it is, how much went, and why.
export function micLossNote(name, lostMs) {
  const secs = Math.round(lostMs / 1000);
  const who = String(name || "").trim() || "This person";
  const amount = secs >= 120
    ? `${Math.round(secs / 60)} minutes`
    : `${secs} ${secs === 1 ? "second" : "seconds"}`;
  return `${who}'s computer could not keep up. About ${amount} of this recording is ` +
    `silence where the microphone stopped delivering. The file is the full length of the take.`;
}

// No render, no conversion: give each uploaded file a name a person can
// read and list what is there. A rename inside one directory, so a long
// show costs the same as a short one.
async function finalize(rec) {
  const raw = path.join(recDir(rec.id), "raw");
  const out = path.join(recDir(rec.id), "out");
  await fs.mkdir(out, { recursive: true });
  const files = [];
  const used = new Set();
  const notes = [];

  for (const p of rec.peers.values()) {
    const who = safeName(p.name, used);
    for (const kind of ["audio", "video", "programme"]) {
      const src = p.files[kind];
      if (!src) continue;
      const ext = path.extname(src);
      const name = kind === "programme" ? `everyone${ext}` : `${who}-${kind}${ext}`;
      await fs.rename(path.join(raw, src), path.join(out, name))
        .then(() => files.push(name))
        .catch((err) => console.error(`filing ${src} failed:`, err.message));
      // If their microphone could not keep up, say so beside the file
      // it happened to, in seconds and in plain words. The file is the
      // full length of the take - the lost moments are silence in it -
      // so what the host needs to know is how much was lost, not that
      // the file is short.
      if (kind === "audio" && p.micLostMs >= 1000) {
        notes.push({ file: name, text: micLossNote(p.name, p.micLostMs) });
      }
    }
  }

  await saveIndex({
    id: rec.id, roomId: rec.roomId, title: rec.title,
    startedAt: rec.startedAt, endedAt: Date.now(), status: "ready", files, notes
  });
  await clearSnapshot(rec.id);
  const { notify } = await import("../push.js");
  notify("Recording ready",
    `Session ${rec.roomId} is done - ${files.length} files to download.`).catch(() => {});
}

export async function deleteRecording(id) {
  const list = await readJson("recordings.json", []);
  await writeJson("recordings.json", list.filter((r) => r.id !== id));
  await fs.rm(recDir(id), { recursive: true, force: true });
}

// Remove one file from a recording, leaving the rest. Returns false if
// it wasn't one of its files.
export async function deleteRecordingFile(id, file) {
  const safe = path.basename(file);
  const list = await readJson("recordings.json", []);
  const rec = list.find((r) => r.id === id);
  if (!rec || !(rec.files || []).includes(safe)) return false;
  await fs.rm(path.join(recDir(id), "out", safe), { force: true });
  rec.files = rec.files.filter((f) => f !== safe);
  await writeJson("recordings.json", list);
  return true;
}
