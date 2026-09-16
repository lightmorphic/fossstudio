// Recording orchestration. One active recording per room.
//
// Every participant's browser records itself and uploads chunks; the
// server appends them to a file and never opens one. The host's browser
// also records the program - the finished picture and mixed sound it
// drew for everyone - so the whole show arrives as one file too,
// already encoded. Nothing here converts, mixes or re-encodes anything.
//
// A take is kept per person, not per connection. Somebody who drops out
// and comes back is the same person with a second stretch of recording,
// and the two are put back together at the end with silence where they
// were away, so every track is the full length of the take and lines up
// in an editor with nothing to drag (see splice.js, which does that
// without decoding a sample).
//
// A JSON snapshot of the in-progress `rec` is written to disk on every
// meaningful change. If the process dies mid-take the snapshot and the
// chunks already uploaded both survive, so nothing is lost beyond the
// seconds nobody sent.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { readJson, writeJson } from "../storage.js";
import { assembleTrack } from "./splice.js";
import { recipe, AUDIO_IDS, VIDEO_IDS, formatLabel, formatExt } from "../formats.js";

const FORMAT_IDS = new Set([...AUDIO_IDS, ...VIDEO_IDS]);

const active = new Map(); // roomId -> rec

export function recDir(recId) {
  return path.join(config.dataDir, "recordings", recId);
}

// The upload ticket names the person, not the connection, so a browser
// that reconnects keeps uploading into the same take without the server
// having to hand out anything new mid-recording.
function uploadToken(recId, personId) {
  return crypto.createHmac("sha256", config.sessionSecret)
    .update(`${recId}:${personId}`).digest("base64url");
}

export function verifyUploadToken(recId, personId, token) {
  const expected = uploadToken(recId, personId);
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
      showFormat: rec.showFormat, separateFiles: rec.separateFiles,
      audioFormats: rec.audioFormats, cameraFormats: rec.cameraFormats,
      people: Object.fromEntries(rec.people)
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

export function uploadCreds(rec, peer) {
  const personId = personOf(peer);
  return {
    recId: rec.id, peerId: personId, token: uploadToken(rec.id, personId),
    // The exact strings this browser should try, worked out from the
    // studio's settings when the take began. A browser is never asked
    // to decide what a format is called.
    recipe: recipe(rec.showFormat, rec.separateFiles, rec.audioFormats, rec.cameraFormats)
  };
}

export async function saveIndex(entry) {
  const list = await readJson("recordings.json", []);
  const i = list.findIndex((r) => r.id === entry.id);
  if (i === -1) list.unshift(entry);
  else list[i] = entry;
  await writeJson("recordings.json", list);
}

export async function listRecordings() {
  return readJson("recordings.json", []);
}

export async function startRecording(room, want = {}) {
  const {
    showFormat = "mp4", separateFiles = true,
    audioFormats = ["wav"], cameraFormats = ["mp4"]
  } = want;
  if (active.has(room.id)) throw new Error("already recording");
  const recId = `${room.id}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  const rec = {
    id: recId,
    roomId: room.id,
    title: room.title || "",
    startedAt: Date.now(),
    // Pinned for the life of the take: a setting changed halfway through
    // must not leave one person's track in a different format from
    // everybody else's.
    showFormat,
    separateFiles,
    audioFormats: separateFiles ? audioFormats : [],
    cameraFormats: separateFiles ? cameraFormats : [],
    // personId -> one person's whole take: who they are, the stretches
    // they recorded, and what their microphone lost. Keyed by the person
    // rather than the connection, so a reconnect continues a take
    // instead of starting a stranger's.
    people: new Map(),
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

// Somebody is now recording: a person arriving for the first time, or
// the same person back after a drop. Either way this opens a new part -
// a fresh stretch of recording that starts where the take has got to.
// A new part is always opened on a join, never on the browser's word,
// because a browser that never reports back must not have its chunks
// appended to the end of the last part's file.
export function addPeerToRecording(rec, peer) {
  const id = personOf(peer);
  let p = rec.people.get(id);
  if (!p) {
    p = { name: peer.name, role: peer.role, parts: {}, joins: 0, part: 0, partOffsetMs: 0, live: [], done: false };
    rec.people.set(id, p);
  }
  p.name = peer.name;
  p.role = peer.role;
  p.joins += 1;
  p.part += 1;
  p.partOffsetMs = Date.now() - rec.startedAt;
  p.done = false;
  if (!p.live.includes(peer.id)) p.live.push(peer.id);
  saveSnapshot(rec).catch(() => {});
}

// Which person a connection belongs to. The browser keeps this id for
// the room it is in, so the same browser rejoining is recognized; a
// different browser, or one whose site data was cleared, is honestly a
// new person and gets a second track the host can see.
export function personOf(peer) {
  return peer.personId || peer.id;
}

// The browser's recorder has actually started. That is a better mark of
// where this part begins than the moment of joining, because a slow
// machine may take a few hundred milliseconds to get going and those
// milliseconds are genuinely missing from the front of the part.
export function notePartStart(rec, peer) {
  const p = rec.people.get(personOf(peer));
  if (!p) return;
  p.partOffsetMs = Date.now() - rec.startedAt;
  saveSnapshot(rec).catch(() => {});
}

// A connection has gone. If it was this person's last one, nothing more
// is coming from them until they rejoin, so stop the take waiting on it.
export function notePeerGone(rec, peer) {
  const p = rec.people.get(personOf(peer));
  if (!p) return;
  p.live = p.live.filter((id) => id !== peer.id);
  if (!p.live.length) p.done = true;
  saveSnapshot(rec).catch(() => {});
  maybeFinalize(rec);
}

// What a browser may send, and the extension each lands under. Anything
// else is refused rather than written to disk under a guessed name.
const KINDS = new Set(["audio", "video", "programme"]);
const EXTS = new Set(["webm", "mp4"]);

// A browser may be writing the same take in more than one format at
// once, so what a stretch belongs to is the kind and the format
// together. Anything else shares a file with something it is not.
function slot(kind, fmt) { return `${kind}:${fmt}`; }

export async function appendChunk(recId, personId, kind, fmt, ext, buf) {
  const rec = [...active.values()].find((r) => r.id === recId);
  if (!rec) throw new Error("no such recording");
  const p = rec.people.get(personId);
  if (!p) throw new Error("peer not in recording");
  // "programme" is the host's browser sending the finished picture and
  // mixed sound, already drawn and encoded there.
  if (!KINDS.has(kind)) throw new Error("bad kind");
  if (!EXTS.has(ext)) throw new Error("bad container");
  if (!FORMAT_IDS.has(fmt)) throw new Error("bad format");
  const key = slot(kind, fmt);
  const list = p.parts[key] || (p.parts[key] = []);
  let part = list[list.length - 1];
  // Chunks from one recorder append into one file, which is valid
  // because they are the continuation the browser meant them to be.
  // A new recorder - a rejoin - gets its own file: two recordings butted
  // together are not one recording, they are one file with a second
  // header in the middle of it.
  if (!part || part.part !== p.part) {
    part = {
      part: p.part, offsetMs: p.partOffsetMs, bytes: 0,
      file: `${personId}-${kind}-${fmt}-${p.part}.${ext}`
    };
    list.push(part);
  }
  part.bytes += buf.length;
  await fs.appendFile(path.join(recDir(recId), "raw", part.file), buf);
  saveSnapshot(rec).catch(() => {});
}

// A peer says its microphone is failing to keep up. The figure is that
// peer's running total for the take, so keep the largest rather than
// adding: a repeated message must not inflate it.
export function notePeerMicLoss(rec, personId, lostMs) {
  const p = rec.people.get(personId);
  if (!p || !(lostMs > (p.micLostMs || 0))) return;
  p.micLostMs = lostMs;
  saveSnapshot(rec).catch(() => {});
}

export function markPeerDone(recId, personId) {
  const rec = [...active.values()].find((r) => r.id === recId);
  if (!rec) return;
  const p = rec.people.get(personId);
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
    for (const p of rec.people.values()) p.done = true;
    maybeFinalize(rec);
  }, 20000);
  maybeFinalize(rec);
  return rec;
}

function maybeFinalize(rec) {
  if (!rec.stopping) return;
  if (![...rec.people.values()].every((p) => p.done)) return;
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

// No decoding, no conversion, no encoder: each person's recorded
// stretches are put end to end with silence where they were not there,
// and the video files are given names a person can read.
//
// The audio comes out as a .wav when the browser recorded every sample
// and an .opus when it recorded Opus - both of them the same audio the
// browser produced, in an envelope an editor opens without help. The
// work is copying bytes, so a long show costs disk and a little reading,
// never a core.
async function finalize(rec) {
  const raw = path.join(recDir(rec.id), "raw");
  const out = path.join(recDir(rec.id), "out");
  await fs.mkdir(out, { recursive: true });
  const files = [];
  const used = new Set();
  const notes = [];
  // Two tracks under one name means somebody came back on a different
  // browser, or after clearing their site data: honest, rare, and the
  // host has to be told rather than left to wonder at a duplicate.
  const names = new Map();
  for (const p of rec.people.values()) names.set(p.name, (names.get(p.name) || 0) + 1);

  for (const p of rec.people.values()) {
    const who = safeName(p.name, used);

    // One finished track per sound format asked for. The tag only goes
    // in the name when more than one was asked for, so a studio that
    // wants one file still gets the plain name it always had.
    const audioAsked = rec.audioFormats || ["wav"];
    const tagAudio = audioAsked.length > 1;
    for (const fmt of audioAsked) {
      const audio = p.parts[`audio:${fmt}`] || [];
      if (!audio.length) continue;
      const pending = path.join(out, `${who}-audio-${fmt}.pending`);
      const built = await assembleTrack(fs, audio.map((a) => ({ ...a, file: path.join(raw, a.file) })), pending)
        .catch((err) => { console.error(`joining ${p.name}'s track failed:`, err.message); return null; });
      if (!built) continue;
      const stem = tagAudio ? `${who}-audio-${fmt}` : `${who}-audio`;
      const name = free(files, stem, `.${built.format}`);
      await fs.rename(pending, path.join(out, name));
      files.push(name);
      for (const a of audio) await fs.rm(path.join(raw, a.file), { force: true });
      const note = trackNote(p, built, audio, fmt);
      if (note) notes.push({ file: name, text: note });
      if (names.get(p.name) > 1) {
        notes.push({ file: name, text: `There is more than one track under the name ${p.name}. ` +
          `Somebody rejoining on a different browser, or after clearing their site data, ` +
          `comes back as a new person and gets a track of their own.` });
      }
    }

    // Video cannot be padded the same way: a picture of nothing still
    // has to be encoded, and there is no encoder here. So each stretch
    // keeps its own file and is told where in the take it starts.
    const camerasAsked = rec.cameraFormats || [];
    const tagCamera = camerasAsked.length > 1;
    for (const [kind, asked] of [["video", camerasAsked], ["programme", [rec.showFormat || "mp4"]]]) {
      for (const fmt of asked) {
        const parts = p.parts[`${kind}:${fmt}`] || [];
        for (let i = 0; i < parts.length; i++) {
          const ext = path.extname(parts[i].file);
          const base = kind === "programme" ? "everyone" : `${who}-video`;
          // The show is one file and never needs telling apart; a
          // camera does, but only when more than one was asked for.
          const stem = kind === "video" && tagCamera ? `${base}-${fmt}` : base;
          const name = free(files, i === 0 ? stem : `${stem}-${i + 1}`, ext);
          await fs.rename(path.join(raw, parts[i].file), path.join(out, name))
            .then(() => files.push(name))
            .catch((err) => console.error(`filing ${parts[i].file} failed:`, err.message));
          if (parts.length > 1 || parts[i].offsetMs > 1500) {
            notes.push({ file: name, text: `This picture starts ${plainSeconds(parts[i].offsetMs)} ` +
              `into the take. The sound track beside it is the full length and needs no shifting.` });
          }
          // The show is made by the host's browser and nobody else's. A
          // host on Firefox cannot write an MP4 however the studio is
          // set, so the file that arrives says so rather than leaving
          // somebody to wonder why they asked for one and got another.
          if (kind === "programme" && ext !== `.${formatExt(fmt)}`) {
            notes.push({ file: name, text: `The studio asked for ${formatLabel(fmt)}, but the ` +
              `host's browser cannot write it, so the video of everyone is a ${ext.slice(1)} ` +
              `instead. Whoever hosts decides this one - nobody else's browser touches it.` });
          }
        }
      }
    }

    // A format nobody's browser could write is not a failure to hide.
    // Say which person and which format, so the missing file is
    // explained before it is noticed.
    for (const fmt of audioAsked) {
      if (!(p.parts[`audio:${fmt}`] || []).length) {
        notes.push({ file: "", text: `${p.name}'s browser cannot record ${formatLabel(fmt)}, ` +
          `so there is no ${formatLabel(fmt)} track for them.` });
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

// A name no other file in this recording has. Two formats can arrive in
// the same box - a browser that cannot record uncompressed gives Opus
// for both choices - and the second one must not land on the first.
function free(files, stem, ext) {
  let name = `${stem}${ext}`;
  for (let n = 2; files.includes(name); n++) name = `${stem}-${n}${ext}`;
  return name;
}

// A length in words, rounded the way a person would say it.
function plainSeconds(ms) {
  const secs = Math.round(ms / 1000);
  if (secs >= 120) return `${Math.round(secs / 60)} minutes`;
  return `${secs} ${secs === 1 ? "second" : "seconds"}`;
}

// The sentence beside a finished track: what was made up and why, and
// what the microphone lost, in one place rather than two.
function trackNote(p, built, parts, fmt) {
  const lines = [];
  // Firefox cannot record uncompressed at all, so a guest on it comes
  // back compressed however the studio is set. Say which track it was,
  // rather than leaving the host to notice the file is small.
  if (fmt === "wav" && built.format !== "wav") {
    lines.push(`${p.name}'s browser cannot record uncompressed audio, so this track is ` +
      `compressed even though the studio asked for WAV. Firefox is the usual reason. ` +
      `It is very good for speech; it is not every sample the microphone heard.`);
  }
  const lead = built.gaps.find((g) => g.atMs === 0);
  const middle = built.gaps.filter((g) => g.atMs > 0);
  if (lead && lead.lengthMs >= 1000) {
    lines.push(`${p.name} joined ${plainSeconds(lead.lengthMs)} after the take began, ` +
      `so the track starts with that much silence and lines up with the others from zero.`);
  }
  if (middle.length) {
    const total = middle.reduce((n, g) => n + g.lengthMs, 0);
    lines.push(`${p.name} dropped out ${middle.length === 1 ? "once" : `${middle.length} times`} ` +
      `and came back. The ${plainSeconds(total)} away ${middle.length === 1 ? "is" : "are"} silence ` +
      `in the middle of this one file, not a second file.`);
  }
  if (parts.length > 1 && !middle.length) {
    lines.push(`${p.name} reconnected during the take; the stretches are in this one file, in order.`);
  }
  // If their microphone could not keep up, say so beside the file it
  // happened to, in seconds and in plain words. The file is the full
  // length of the take - the lost moments are silence in it - so what
  // the host needs to know is how much was lost, not that it is short.
  if (p.micLostMs >= 1000) lines.push(micLossNote(p.name, p.micLostMs));
  return lines.join(" ");
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
