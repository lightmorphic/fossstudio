// Host + public HTTP API. Admins see everything; sub-admins see only
// what they own (sessions, recordings, their own settings).
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
  renameSession,
  deleteSessionsByOwner,
} from "./settings.js";
import { listUsers, createUser, deleteUser, findById, updateUser, findByUsername } from "./users.js";
import { hashPassword } from "./auth.js";
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

// Each panel names itself (X-Panel: admin|host) so account-level calls
// like /me resolve the right one of the two coexisting sessions; calls
// without the header accept either, host first.
function panelPrefer(req) {
  const p = req.headers["x-panel"];
  return p === "admin" || p === "host" ? p : "any";
}

function requireAuth(req, res, next) {
  const user = isAuthedRequest(req, panelPrefer(req));
  if (!user) return res.status(401).json({ error: "not logged in" });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = isAuthedRequest(req, "admin");
  if (!user) return res.status(401).json({ error: "not logged in" });
  if (user.role !== "admin") return res.status(403).json({ error: "admin only" });
  req.user = user;
  next();
}

// ---------- auth ----------

api.post("/login", async (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;
  const result = await tryLogin(ip, req.body.username, req.body.password, req.body.totp);
  if (!result.ok) return res.status(401).json({ error: result.error });
  setAuthCookie(res, result.user);
  // The login page sends admins to /admin/ and hosts to /host/
  res.json({ ok: true, role: result.user.role });
});

api.post("/logout", (req, res) => {
  // Only this panel's session ends; the other panel's tab stays in
  clearAuthCookie(res, panelPrefer(req) === "any" ? "both" : panelPrefer(req));
  res.json({ ok: true });
});

api.get("/me", async (req, res) => {
  const payload = isAuthedRequest(req, panelPrefer(req));
  if (!payload) return res.json({ authed: false });
  const user = await findById(payload.uid);
  res.json({ authed: !!user, uid: user?.id, role: user?.role, username: user?.username });
});

// Rename your own account (the login name). The session cookie is keyed on
// the user id, not the name, so a rename never logs you out.
api.post("/username", requireAuth, async (req, res) => {
  const name = String(req.body.username || "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,24}$/.test(name)) {
    return res.status(400).json({ error: "Names are 2-24 characters: lowercase letters, numbers, - or _." });
  }
  const existing = await findByUsername(name);
  if (existing && existing.id !== req.user.uid) {
    return res.status(400).json({ error: "That name is taken." });
  }
  await updateUser(req.user.uid, { username: name });
  res.json({ ok: true, username: name });
});

api.post("/password", requireAuth, async (req, res) => {
  const pw = String(req.body.password || "");
  if (pw.length < 10) {
    return res.status(400).json({ error: "Password needs at least 10 characters." });
  }
  await changePassword(req.user.uid, pw);
  res.json({ ok: true });
});

api.get("/2fa", requireAuth, async (req, res) => res.json(await get2faState(req.user.uid)));
api.post("/2fa/setup", requireAuth, async (req, res) => res.json(await setup2fa(req.user.uid)));
api.post("/2fa/enable", requireAuth, async (req, res) => {
  const ok = await confirm2fa(req.user.uid, req.body.code);
  ok ? res.json({ ok: true }) : res.status(400).json({ error: "That code isn't right - check your authenticator app." });
});
api.post("/2fa/disable", requireAuth, async (req, res) => {
  const ok = await disable2fa(req.user.uid, req.body.code);
  ok ? res.json({ ok: true }) : res.status(400).json({ error: "That code isn't right - check your authenticator app." });
});

// ---------- users (admin only) ----------

api.get("/users", requireAdmin, async (req, res) => res.json(await listUsers()));

api.post("/users", requireAdmin, async (req, res) => {
  try {
    res.json(await createUser(
      req.body.username, req.body.password, req.body.role,
      !!req.body.allowServerRecording
    ));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Invite a host: the reply carries the link they use to choose their
// own password. The admin passes it on however they like.
api.post("/users/invite", requireAdmin, async (req, res) => {
  try {
    const { createInvitedUser } = await import("./users.js");
    const user = await createInvitedUser(
      req.body.username, !!req.body.allowServerRecording
    );
    res.json({ ok: true, inviteUrl: `https://${config.domain}/host/invite.html?token=${user.inviteToken}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Public: accepting an invite (token is the credential)
api.get("/invite/:token", async (req, res) => {
  const { findByInviteToken } = await import("./users.js");
  const user = await findByInviteToken(req.params.token);
  user
    ? res.json({ username: user.username })
    : res.status(404).json({ error: "This invite link has expired or was already used." });
});

api.post("/invite/accept", async (req, res) => {
  try {
    const { acceptInvite } = await import("./users.js");
    await acceptInvite(String(req.body.token || ""), String(req.body.password || ""));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

api.post("/users/:id/permissions", requireAdmin, async (req, res) => {
  try {
    await updateUser(req.params.id, { allowServerRecording: !!req.body.allowServerRecording });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

api.delete("/users/:id", requireAdmin, async (req, res) => {
  try {
    const uid = String(req.params.id);
    // deleteUser enforces the "can't delete the only admin" rule and
    // removes the account first; if it throws, nothing below runs.
    await deleteUser(uid);
    // Complete deletion for privacy: purge everything the user owned -
    // recordings (and their files), sessions, uploaded media, push subs.
    for (const rec of (await listRecordings()).filter((r) => r.ownerId === uid)) {
      await deleteRecording(rec.id);
    }
    await deleteSessionsByOwner(uid);
    const udir = path.join(config.dataDir, "uploads");
    try {
      for (const f of await fs.readdir(udir)) {
        // wallpaper-/logo-/ad- files all embed the owner uid
        if (f.includes(uid)) await fs.unlink(path.join(udir, f)).catch(() => {});
      }
    } catch { /* no uploads dir */ }
    const { removeUserSubscriptions } = await import("./push.js");
    await removeUserSubscriptions(uid);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

api.post("/users/:id/password", requireAdmin, async (req, res) => {
  const pw = String(req.body.password || "");
  if (pw.length < 10) {
    return res.status(400).json({ error: "Password needs at least 10 characters." });
  }
  try {
    await updateUser(req.params.id, { passwordHash: hashPassword(pw) });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------- settings & theme ----------

api.get("/settings", requireAuth, async (req, res) => res.json(await getSettings(req.user.uid)));
api.put("/settings", requireAuth, async (req, res) => {
  try {
    res.json(await updateSettings(req.user.uid, req.body));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Public: what a guest's session page needs, resolved via the room owner
api.get("/theme", async (req, res) => {
  const session = req.query.room ? await findSession(String(req.query.room)) : null;
  const s = await getSettings(session?.ownerId);
  res.json({
    wallpaper: s.wallpaper && session ? `/api/wallpaper/${session.ownerId}` : null
  });
});

// Wallpaper: per-user file, capped size
api.post("/wallpaper", requireAuth,
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "8mb" }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "Send a JPEG, PNG, or WebP image." });
    }
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[req.headers["content-type"]];
    const name = `wallpaper-${req.user.uid}.${ext}`;
    const dir = path.join(config.dataDir, "uploads");
    await fs.mkdir(dir, { recursive: true });
    for (const f of await fs.readdir(dir)) {
      if (f.startsWith(`wallpaper-${req.user.uid}.`)) await fs.unlink(path.join(dir, f));
    }
    await fs.writeFile(path.join(dir, name), req.body);
    await updateSettings(req.user.uid, { wallpaper: name });
    res.json({ ok: true });
  });

api.delete("/wallpaper", requireAuth, async (req, res) => {
  const dir = path.join(config.dataDir, "uploads");
  try {
    for (const f of await fs.readdir(dir)) {
      if (f.startsWith(`wallpaper-${req.user.uid}.`)) await fs.unlink(path.join(dir, f));
    }
  } catch { /* nothing uploaded yet */ }
  await updateSettings(req.user.uid, { wallpaper: null });
  res.json({ ok: true });
});

api.get("/wallpaper/:uid", async (req, res) => {
  const s = await getSettings(path.basename(req.params.uid));
  if (!s.wallpaper) return res.status(404).end();
  res.sendFile(path.join(config.dataDir, "uploads", path.basename(s.wallpaper)));
});

// The dashboard preview uses the logged-in user's own wallpaper
api.get("/wallpaper", requireAuth, async (req, res) => {
  const s = await getSettings(req.user.uid);
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
    const name = `ad-${req.user.uid}.${ext}`;
    const dir = path.join(config.dataDir, "uploads");
    await fs.mkdir(dir, { recursive: true });
    for (const f of await fs.readdir(dir)) {
      if (f.startsWith(`ad-${req.user.uid}.`)) await fs.unlink(path.join(dir, f));
    }
    await fs.writeFile(path.join(dir, name), req.body);
    await updateSettings(req.user.uid, { adBanner: name });
    res.json({ ok: true });
  });

api.delete("/adbanner", requireAuth, async (req, res) => {
  const dir = path.join(config.dataDir, "uploads");
  try {
    for (const f of await fs.readdir(dir)) {
      if (f.startsWith(`ad-${req.user.uid}.`)) await fs.unlink(path.join(dir, f));
    }
  } catch { /* nothing uploaded yet */ }
  await updateSettings(req.user.uid, { adBanner: null });
  res.json({ ok: true });
});

api.get("/adbanner/:uid", async (req, res) => {
  const s = await getSettings(path.basename(req.params.uid));
  if (!s.adBanner) return res.status(404).end();
  res.sendFile(path.join(config.dataDir, "uploads", path.basename(s.adBanner)));
});

api.get("/adbanner", requireAuth, async (req, res) => {
  const s = await getSettings(req.user.uid);
  if (!s.adBanner) return res.status(404).end();
  res.sendFile(path.join(config.dataDir, "uploads", path.basename(s.adBanner)));
});

// ---------- sessions ----------

api.get("/sessions", requireAuth, async (req, res) => {
  const sessions = await listSessions(req.user);
  res.json(sessions.map((s) => ({
    ...s,
    active: !!getRoom(s.id),
    participants: getRoom(s.id)?.peers.size || 0
  })));
});

api.post("/sessions", requireAuth, async (req, res) => {
  if (req.user.role === "admin") {
    return res.status(403).json({ error: "Admins manage hosts; sessions belong to host accounts." });
  }
  const title = String(req.body.title || "").trim();
  if (!title) return res.status(400).json({ error: "Give the episode a title - it names the session and its recordings." });
  res.json(await createSession(req.user, title));
});

// Rename a session (the episode title). A room with people in it keeps
// its pinned title until it empties; the new name shows from the next
// gathering.
api.post("/sessions/:id/title", requireAuth, async (req, res) => {
  const title = String(req.body.title || "").trim();
  if (!title) return res.status(400).json({ error: "Give the episode a title - it names the session and its recordings." });
  const session = await renameSession(req.user, req.params.id, title);
  if (!session) return res.status(404).json({ error: "No such session." });
  res.json(session);
});

api.delete("/sessions/:id", requireAuth, async (req, res) => {
  await deleteSession(req.user, req.params.id);
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
    const name = `logo-${req.user.uid}.${ext}`;
    const dir = path.join(config.dataDir, "uploads");
    await fs.mkdir(dir, { recursive: true });
    for (const f of await fs.readdir(dir)) {
      if (f.startsWith(`logo-${req.user.uid}.`)) await fs.unlink(path.join(dir, f));
    }
    await fs.writeFile(path.join(dir, name), req.body);
    await updateSettings(req.user.uid, { logo: name });
    res.json({ ok: true });
  });

api.delete("/logo", requireAuth, async (req, res) => {
  const dir = path.join(config.dataDir, "uploads");
  try {
    for (const f of await fs.readdir(dir)) {
      if (f.startsWith(`logo-${req.user.uid}.`)) await fs.unlink(path.join(dir, f));
    }
  } catch { /* nothing uploaded yet */ }
  await updateSettings(req.user.uid, { logo: null });
  res.json({ ok: true });
});

// Public: guests need the logo inside the session view
api.get("/logo/:uid", async (req, res) => {
  const s = await getSettings(path.basename(req.params.uid));
  if (!s.logo) return res.status(404).end();
  res.sendFile(path.join(config.dataDir, "uploads", path.basename(s.logo)));
});

// The dashboard preview uses the logged-in user's own logo
api.get("/logo", requireAuth, async (req, res) => {
  const s = await getSettings(req.user.uid);
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
        String(req.query.kind), Number(req.query.seq), req.body
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

async function recAccess(req, id) {
  const recs = await listRecordings();
  const rec = recs.find((r) => r.id === id);
  if (!rec) return null;
  if (req.user.role !== "admin" && rec.ownerId !== req.user.uid) return null;
  return rec;
}

api.get("/recordings", requireAuth, async (req, res) => {
  const recs = await listRecordings();
  res.json(req.user.role === "admin"
    ? recs
    : recs.filter((r) => r.ownerId === req.user.uid));
});

api.get("/recordings/:id/files/:file", requireAuth, async (req, res) => {
  const id = path.basename(req.params.id);
  if (!await recAccess(req, id)) return res.status(404).json({ error: "not found" });
  const file = path.basename(req.params.file);
  res.download(path.join(recDir(id), "out", file), file, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "file not found" });
  });
});

// Session moderation: the reversible list of guests blocked from
// joining sessions. Any host can manage it, instant either direction.
api.get("/session/blocked", requireAuth, async (req, res) => {
  res.json(await listSessionBlocked());
});
api.delete("/session/blocked/:id", requireAuth, async (req, res) => {
  const ok = await unblockSession(path.basename(req.params.id), req.user.uid);
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
  const rec = await recAccess(req, id);
  if (!rec) return res.status(404).json({ error: "not found" });
  const settings = await getSettings(req.user.uid);
  if (!settings.fosscastUrl || !settings.fosscastToken) {
    return res.status(400).json({ error: "Add your FOSSCast address and publisher token in Settings → Publish first." });
  }
  const file = path.basename(String(req.body.file || "combined.mp4"));
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

// One-click bundles: every file, or just the audio (the FLACs), zipped
// on the fly - nothing is written to disk
api.get("/recordings/:id/zip", requireAuth, async (req, res) => {
  const id = path.basename(req.params.id);
  const rec = await recAccess(req, id);
  if (!rec) return res.status(404).json({ error: "not found" });
  const audioOnly = req.query.audio === "1";
  const dir = path.join(recDir(id), "out");
  const files = (await fs.readdir(dir).catch(() => []))
    .filter((f) => !audioOnly || /\.(flac|wav|mp3|ogg|m4a|aac)$/i.test(f));
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

// Delete a single file within a recording (one FLAC or the MP4)
api.delete("/recordings/:id/files/:file", requireAuth, async (req, res) => {
  const id = path.basename(req.params.id);
  if (!await recAccess(req, id)) return res.status(404).json({ error: "not found" });
  await deleteRecordingFile(id, path.basename(req.params.file));
  res.json({ ok: true });
});

api.delete("/recordings/:id", requireAuth, async (req, res) => {
  const id = path.basename(req.params.id);
  if (!await recAccess(req, id)) return res.status(404).json({ error: "not found" });
  await deleteRecording(id);
  res.json({ ok: true });
});

// ---------- ops: admin only ----------

api.get("/ops/logs", requireAdmin, (req, res) => {
  res.json({ lines: recentLogs() });
});

api.get("/ops/backup-keep", requireAdmin, async (req, res) => {
  res.json({ keep: await getBackupKeep() });
});
api.put("/ops/backup-keep", requireAdmin, async (req, res) => {
  try {
    res.json({ keep: await setBackupKeep(req.body.keep) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

api.post("/ops/backup", requireAdmin, async (req, res) => {
  res.json({ name: await makeBackup() });
});

api.get("/ops/backups", requireAdmin, async (req, res) => {
  res.json(await listBackups());
});

api.get("/ops/backups/:name", requireAdmin, (req, res) => {
  const name = path.basename(req.params.name);
  res.download(backupPath(name), name, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "backup not found" });
  });
});

api.post("/ops/restore", requireAdmin, async (req, res) => {
  try {
    await restoreBackup(String(req.body.name || ""));
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Couldn't restore that backup." });
  }
});

api.post("/ops/restart", requireAdmin, (req, res) => {
  res.json({ ok: true });
  restartApp();
});

api.get("/ops/export", requireAdmin, (req, res) => {
  sendFullExport(res);
});

// ---------- push notifications (per user) ----------

api.get("/push/key", requireAuth, (req, res) => {
  res.json({ key: publicKey() });
});

api.post("/push/subscribe", requireAuth, async (req, res) => {
  const sub = req.body;
  if (!sub?.endpoint || !sub?.keys) return res.status(400).json({ error: "bad subscription" });
  await addSubscription(req.user.uid, sub);
  res.json({ ok: true });
});
