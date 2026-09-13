// The studio's HTTP API. One account is signed in or nobody is; there
// is nothing to divide up and nobody to hide anything from.
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { config } from "./config.js";
import {
  tryLogin, setAuthCookie, clearAuthCookie, isAuthedRequest,
  changePassword, get2faState, setup2fa, confirm2fa, disable2fa
} from "./auth.js";
import {
  getSettings, updateSettings, listSessions, createSession, deleteSession, findSession,
  renameSession
} from "./settings.js";
import { getAccount, updateAccount } from "./account.js";
import { getRoom } from "./rooms.js";
import {
  verifyUploadToken, appendChunk, markPeerDone,
  listRecordings, deleteRecording, deleteRecordingFile, recDir
} from "./recording/manager.js";
import {
  recentLogs, makeBackup, listBackups, backupPath,
  restoreBackup, restartApp, sendFullExport,
  getBackupKeep, setBackupKeep
} from "./ops.js";
import { publicKey, addSubscription } from "./push.js";
import { listSessionBlocked, unblockSession } from "./blocklist.js";

export const api = express.Router();
api.use(express.json({ limit: "64kb" }));

function requireAuth(req, res, next) {
  if (!isAuthedRequest(req)) return res.status(401).json({ error: "not logged in" });
  next();
}

// ---------- auth ----------

api.post("/login", async (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;
  const result = await tryLogin(ip, req.body.username, req.body.password, req.body.totp);
  if (!result.ok) return res.status(401).json({ error: result.error });
  setAuthCookie(res, result.user);
  res.json({ ok: true });
});

api.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

api.get("/me", async (req, res) => {
  if (!isAuthedRequest(req)) return res.json({ authed: false });
  const acc = await getAccount();
  res.json({ authed: true, username: acc.username });
});

// Rename the account (the login name). The session cookie is keyed on
// the account id, not the name, so a rename never logs you out.
api.post("/username", requireAuth, async (req, res) => {
  const name = String(req.body.username || "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,24}$/.test(name)) {
    return res.status(400).json({ error: "Names are 2-24 characters: lowercase letters, numbers, - or _." });
  }
  await updateAccount({ username: name });
  res.json({ ok: true, username: name });
});

api.post("/password", requireAuth, async (req, res) => {
  const pw = String(req.body.password || "");
  if (pw.length < 10) {
    return res.status(400).json({ error: "Password needs at least 10 characters." });
  }
  await changePassword(pw);
  res.json({ ok: true });
});

api.get("/2fa", requireAuth, async (req, res) => res.json(await get2faState()));
api.post("/2fa/setup", requireAuth, async (req, res) => res.json(await setup2fa()));
api.post("/2fa/enable", requireAuth, async (req, res) => {
  const ok = await confirm2fa(req.body.code);
  ok ? res.json({ ok: true }) : res.status(400).json({ error: "That code isn't right - check your authenticator app." });
});
api.post("/2fa/disable", requireAuth, async (req, res) => {
  const ok = await disable2fa(req.body.code);
  ok ? res.json({ ok: true }) : res.status(400).json({ error: "That code isn't right - check your authenticator app." });
});

// ---------- settings & theme ----------

api.get("/settings", requireAuth, async (req, res) => res.json(await getSettings()));
api.put("/settings", requireAuth, async (req, res) => {
  try {
    res.json(await updateSettings(req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Wallpaper: one file, capped size
api.post("/wallpaper", requireAuth,
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "8mb" }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "Send a JPEG, PNG, or WebP image." });
    }
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[req.headers["content-type"]];
    const name = `wallpaper.${ext}`;
    const dir = path.join(config.dataDir, "uploads");
    await fs.mkdir(dir, { recursive: true });
    // The dashed form is the old per-account name (wallpaper-<uid>.jpg);
    // matching it too means an install that came from those days does not
    // leave a stray file behind the first time this is replaced.
    for (const f of await fs.readdir(dir)) {
      if (/^wallpaper[-.]/.test(f)) await fs.unlink(path.join(dir, f));
    }
    await fs.writeFile(path.join(dir, name), req.body);
    await updateSettings({ wallpaper: name });
    res.json({ ok: true });
  });

api.delete("/wallpaper", requireAuth, async (req, res) => {
  const dir = path.join(config.dataDir, "uploads");
  try {
    for (const f of await fs.readdir(dir)) {
      if (/^wallpaper[-.]/.test(f)) await fs.unlink(path.join(dir, f));
    }
  } catch { /* nothing uploaded yet */ }
  await updateSettings({ wallpaper: null });
  res.json({ ok: true });
});

api.get("/wallpaper", requireAuth, async (req, res) => {
  const s = await getSettings();
  if (!s.wallpaper) return res.status(404).end();
  res.sendFile(path.join(config.dataDir, "uploads", path.basename(s.wallpaper)));
});

// Advertising banner for the in-show overlay: per-user image
api.post("/adbanner", requireAuth,
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "4mb" }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "Send a JPEG, PNG, or WebP image." });
    }
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[req.headers["content-type"]];
    const name = `ad.${ext}`;
    const dir = path.join(config.dataDir, "uploads");
    await fs.mkdir(dir, { recursive: true });
    for (const f of await fs.readdir(dir)) {
      if (/^ad[-.]/.test(f)) await fs.unlink(path.join(dir, f));
    }
    await fs.writeFile(path.join(dir, name), req.body);
    await updateSettings({ adBanner: name });
    res.json({ ok: true });
  });

api.delete("/adbanner", requireAuth, async (req, res) => {
  const dir = path.join(config.dataDir, "uploads");
  try {
    for (const f of await fs.readdir(dir)) {
      if (/^ad[-.]/.test(f)) await fs.unlink(path.join(dir, f));
    }
  } catch { /* nothing uploaded yet */ }
  await updateSettings({ adBanner: null });
  res.json({ ok: true });
});

// The banner is drawn into everyone's session view when the host puts
// it up, so it is readable without a login - like the room theme.
api.get("/adbanner", async (req, res) => {
  const s = await getSettings();
  if (!s.adBanner) return res.status(404).end();
  res.sendFile(path.join(config.dataDir, "uploads", path.basename(s.adBanner)));
});

// ---------- sessions ----------

api.get("/sessions", requireAuth, async (req, res) => {
  const sessions = await listSessions();
  res.json(sessions.map((s) => ({
    ...s,
    active: !!getRoom(s.id),
    participants: getRoom(s.id)?.peers.size || 0
  })));
});

api.post("/sessions", requireAuth, async (req, res) => {
  const title = String(req.body.title || "").trim();
  if (!title) return res.status(400).json({ error: "Give the episode a title - it names the session and its recordings." });
  res.json(await createSession(title));
});

// Rename a session (the episode title). A room with people in it keeps
// its pinned title until it empties; the new name shows from the next
// gathering.
api.post("/sessions/:id/title", requireAuth, async (req, res) => {
  const title = String(req.body.title || "").trim();
  if (!title) return res.status(400).json({ error: "Give the episode a title - it names the session and its recordings." });
  const session = await renameSession(req.params.id, title);
  if (!session) return res.status(404).json({ error: "No such session." });
  res.json(session);
});

api.delete("/sessions/:id", requireAuth, async (req, res) => {
  await deleteSession(req.params.id);
  res.json({ ok: true });
});

// Pinned per-room theme assets (copies frozen at the room's first join).
// Link-gated like the session itself: the room id is the session id.
api.get("/room-theme/:roomId/:kind", async (req, res) => {
  if (!["logo", "wallpaper", "backdrop"].includes(req.params.kind)) return res.status(404).end();
  const p = getRoom(req.params.roomId)?.theme?.[`${req.params.kind}Path`];
  if (!p) return res.status(404).end();
  res.sendFile(p);
});

// Podcast logo (part of the theme): shown above the episode title on
// the video and baked into recordings
api.post("/logo", requireAuth,
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "2mb" }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "Send a JPEG, PNG, or WebP image." });
    }
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[req.headers["content-type"]];
    const name = `logo.${ext}`;
    const dir = path.join(config.dataDir, "uploads");
    await fs.mkdir(dir, { recursive: true });
    for (const f of await fs.readdir(dir)) {
      if (/^logo[-.]/.test(f)) await fs.unlink(path.join(dir, f));
    }
    await fs.writeFile(path.join(dir, name), req.body);
    await updateSettings({ logo: name });
    res.json({ ok: true });
  });

api.delete("/logo", requireAuth, async (req, res) => {
  const dir = path.join(config.dataDir, "uploads");
  try {
    for (const f of await fs.readdir(dir)) {
      if (/^logo[-.]/.test(f)) await fs.unlink(path.join(dir, f));
    }
  } catch { /* nothing uploaded yet */ }
  await updateSettings({ logo: null });
  res.json({ ok: true });
});

api.get("/logo", requireAuth, async (req, res) => {
  const s = await getSettings();
  if (!s.logo) return res.status(404).end();
  res.sendFile(path.join(config.dataDir, "uploads", path.basename(s.logo)));
});

// ---------- recording ----------

function chunkAuth(req, res, next) {
  const { rec, peer, token } = req.query;
  if (!rec || !peer || !verifyUploadToken(String(rec), String(peer), String(token))) {
    return res.status(403).json({ error: "bad upload token" });
  }
  next();
}

api.post("/rec/chunk", chunkAuth,
  express.raw({ type: () => true, limit: "32mb" }),
  async (req, res) => {
    try {
      await appendChunk(
        String(req.query.rec), String(req.query.peer),
        String(req.query.kind), String(req.query.ext || "webm"), req.body
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

api.post("/rec/done", chunkAuth, (req, res) => {
  markPeerDone(String(req.query.rec), String(req.query.peer));
  res.json({ ok: true });
});

// Every recording on the box belongs to the studio - including any made
// before this was a one-account program, which are all still here.
async function findRecording(id) {
  return (await listRecordings()).find((r) => r.id === id) || null;
}

api.get("/recordings", requireAuth, async (req, res) => {
  res.json(await listRecordings());
});

api.get("/recordings/:id/files/:file", requireAuth, async (req, res) => {
  const id = path.basename(req.params.id);
  if (!await findRecording(id)) return res.status(404).json({ error: "not found" });
  const file = path.basename(req.params.file);
  res.download(path.join(recDir(id), "out", file), file, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "file not found" });
  });
});

// Session moderation: the reversible list of guests blocked from
// joining sessions. Reversible from the dashboard, instant either way.
api.get("/session/blocked", requireAuth, async (req, res) => {
  res.json(await listSessionBlocked());
});
api.delete("/session/blocked/:id", requireAuth, async (req, res) => {
  const ok = await unblockSession(path.basename(req.params.id));
  if (!ok) return res.status(404).json({ error: "not found" });
  res.json({ ok: true });
});

// Publish a recording to the host's FOSSCast instance as a draft
// episode, via FOSSCast's stable publish API (studio-integration.md in
// its repo): PUT the media file, then POST the episode pointing at it.
// Drafts by design - the host reviews on FOSSCast before it goes
// public. Server-side so the publisher token never reaches a browser.
api.post("/recordings/:id/publish", requireAuth, async (req, res) => {
  const id = path.basename(req.params.id);
  const rec = await findRecording(id);
  if (!rec) return res.status(404).json({ error: "not found" });
  const settings = await getSettings();
  if (!settings.fosscastUrl || !settings.fosscastToken) {
    return res.status(400).json({ error: "Add your FOSSCast address and publisher token in Settings → Publish first." });
  }
  const file = path.basename(String(req.body.file || ""));
  if (!(rec.files || []).includes(file)) {
    return res.status(404).json({ error: "no such file in this recording" });
  }
  const full = path.join(recDir(id), "out", file);
  const stat = await fs.stat(full).catch(() => null);
  if (!stat) return res.status(404).json({ error: "file missing on disk" });
  const auth = { Authorization: `Bearer ${settings.fosscastToken}` };
  try {
    // A clean, dated filename on the FOSSCast side beats "combined.mp4"
    const date = new Date(rec.startedAt).toISOString().slice(0, 10);
    const slug = (rec.title || rec.roomId).toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "episode";
    const remoteName = `${date}-${slug}${path.extname(file)}`;
    const { Readable } = await import("node:stream");
    const up = await fetch(`${settings.fosscastUrl}/api/v1/media?filename=${encodeURIComponent(remoteName)}`, {
      method: "PUT",
      headers: { ...auth, "Content-Length": String(stat.size) },
      body: Readable.toWeb((await import("node:fs")).createReadStream(full)),
      duplex: "half"
    });
    if (!up.ok) throw new Error(`media upload failed (${up.status})`);
    const media = await up.json();
    const ep = await fetch(`${settings.fosscastUrl}/api/v1/episodes`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: rec.title || `Session ${rec.roomId}`,
        date,
        mediaUrl: media.urlPath
      })
    });
    if (!ep.ok) throw new Error(`episode create failed (${ep.status})`);
    const created = await ep.json();
    res.json({ ok: true, draft: created.draft !== false, editUrl: created.editUrl || null });
  } catch (err) {
    res.status(502).json({ error: `FOSSCast publish failed: ${err.message}` });
  }
});

// One-click bundles: every file, or everyone's audio track, zipped
// on the fly - nothing is written to disk
api.get("/recordings/:id/zip", requireAuth, async (req, res) => {
  const id = path.basename(req.params.id);
  const rec = await findRecording(id);
  if (!rec) return res.status(404).json({ error: "not found" });
  const audioOnly = req.query.audio === "1";
  const dir = path.join(recDir(id), "out");
  const files = (await fs.readdir(dir).catch(() => []))
    .filter((f) => !audioOnly || /-audio\.(webm|mp4)$/i.test(f));
  if (files.length === 0) return res.status(404).json({ error: "no files" });
  const stem = (rec.title || `session-${rec.roomId}`)
    .replace(/[^a-zA-Z0-9 _-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || id;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition",
    `attachment; filename="${stem}${audioOnly ? "-audio" : ""}.zip"`);
  const zip = spawn("zip", ["-q", "-j", "-0", "-", ...files.map((f) => path.join(dir, f))]);
  zip.stdout.pipe(res);
  zip.on("error", () => { if (!res.headersSent) res.status(500).end(); else res.end(); });
  zip.on("close", (code) => { if (code !== 0) res.end(); });
  req.on("close", () => zip.kill("SIGKILL"));
});

// Delete a single file within a recording (one person's track, or the video of everyone)
api.delete("/recordings/:id/files/:file", requireAuth, async (req, res) => {
  const id = path.basename(req.params.id);
  if (!await findRecording(id)) return res.status(404).json({ error: "not found" });
  await deleteRecordingFile(id, path.basename(req.params.file));
  res.json({ ok: true });
});

api.delete("/recordings/:id", requireAuth, async (req, res) => {
  const id = path.basename(req.params.id);
  if (!await findRecording(id)) return res.status(404).json({ error: "not found" });
  await deleteRecording(id);
  res.json({ ok: true });
});

// ---------- ops ----------

api.get("/ops/logs", requireAuth, (req, res) => {
  res.json({ lines: recentLogs() });
});

api.get("/ops/backup-keep", requireAuth, async (req, res) => {
  res.json({ keep: await getBackupKeep() });
});
api.put("/ops/backup-keep", requireAuth, async (req, res) => {
  try {
    res.json({ keep: await setBackupKeep(req.body.keep) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

api.post("/ops/backup", requireAuth, async (req, res) => {
  res.json({ name: await makeBackup() });
});

api.get("/ops/backups", requireAuth, async (req, res) => {
  res.json(await listBackups());
});

api.get("/ops/backups/:name", requireAuth, (req, res) => {
  const name = path.basename(req.params.name);
  res.download(backupPath(name), name, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "backup not found" });
  });
});

api.post("/ops/restore", requireAuth, async (req, res) => {
  try {
    await restoreBackup(String(req.body.name || ""));
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Couldn't restore that backup." });
  }
});

api.post("/ops/restart", requireAuth, (req, res) => {
  res.json({ ok: true });
  restartApp();
});

api.get("/ops/export", requireAuth, (req, res) => {
  sendFullExport(res);
});

// ---------- push notifications ----------

api.get("/push/key", requireAuth, (req, res) => {
  res.json({ key: publicKey() });
});

api.post("/push/subscribe", requireAuth, async (req, res) => {
  const sub = req.body;
  if (!sub?.endpoint || !sub?.keys) return res.status(400).json({ error: "bad subscription" });
  await addSubscription(sub);
  res.json({ ok: true });
});
