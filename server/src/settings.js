// The studio's settings (validated patches) and its sessions. There is
// one studio, so nothing here asks whose.
import crypto from "node:crypto";
import { readJson, writeJson } from "./storage.js";
import { legacyAccountSettings } from "./account.js";

const FILE = "settings.json";

// What a recording holds. "best" is every sample the microphone heard,
// "smaller" is Opus - very good for speech and a twenty-sixth of the
// size. Best is the default: a studio's job is to keep what was said,
// and disk is cheaper than a take nobody can improve on afterwards.
export const QUALITIES = ["best", "smaller"];

export const SETTINGS_DEFAULTS = {
  wallpaper: null,
  bg: null,
  logo: null,
  recordingQuality: "best"
};

// Installs from the days when the look was carried on an account bring
// it across the first time the settings are read, and never again.
export async function migrateSettings() {
  if (await readJson(FILE)) return;
  const old = await legacyAccountSettings();
  if (!old) return;
  await writeJson(FILE, { ...SETTINGS_DEFAULTS, ...old });
  console.log("moved the studio's look out of the account file into settings.json");
}

export async function getSettings() {
  return { ...SETTINGS_DEFAULTS, ...(await readJson(FILE, {})) };
}

export async function updateSettings(patch) {
  const clean = {};
  if (patch.wallpaper === null || typeof patch.wallpaper === "string") {
    clean.wallpaper = patch.wallpaper;
  }
  if (patch.bg === null || (typeof patch.bg === "string" && /^#[0-9a-fA-F]{6}$/.test(patch.bg))) {
    clean.bg = patch.bg ? patch.bg.toLowerCase() : null;
  }
  if (patch.logo === null || typeof patch.logo === "string") {
    clean.logo = patch.logo;
  }
  if (patch.adBanner === null || typeof patch.adBanner === "string") {
    clean.adBanner = patch.adBanner;
  }
  // FOSSCast publish API, for pushing finished recordings as episodes
  if (typeof patch.fosscastUrl === "string") {
    const u = patch.fosscastUrl.trim().replace(/\/$/, "");
    // A plain-http loopback address is allowed so the publish flow can
    // be driven against a FOSSCast running on the same machine.
    if (u === "" || /^https:\/\/[^\s]+$/.test(u) || u.startsWith("http://127.0.0.1")) {
      clean.fosscastUrl = u.slice(0, 200);
    }
  }
  if (QUALITIES.includes(patch.recordingQuality)) {
    clean.recordingQuality = patch.recordingQuality;
  }
  if (typeof patch.fosscastToken === "string") {
    clean.fosscastToken = patch.fosscastToken.trim().slice(0, 300);
  }
  const next = { ...(await getSettings()), ...clean };
  await writeJson(FILE, next);
  return next;
}

// ---------- sessions ----------
// A stored session from an install that had several accounts still
// carries the ownerId it was created with. Nothing reads it any more;
// it is left alone rather than rewritten.

export async function listSessions() {
  return readJson("sessions.json", []);
}

export async function findSession(id) {
  const sessions = await readJson("sessions.json", []);
  return sessions.find((s) => s.id === id) || null;
}

export async function createSession(title) {
  const sessions = await readJson("sessions.json", []);
  const session = {
    id: crypto.randomBytes(4).toString("hex"),
    title: String(title || "").trim().slice(0, 80) || "Untitled session",
    createdAt: new Date().toISOString()
  };
  sessions.unshift(session);
  await writeJson("sessions.json", sessions);
  return session;
}

export async function renameSession(id, title) {
  const sessions = await readJson("sessions.json", []);
  const session = sessions.find((s) => s.id === id);
  if (!session) return null;
  session.title = String(title || "").trim().slice(0, 80) || "Untitled session";
  await writeJson("sessions.json", sessions);
  return session;
}

export async function deleteSession(id) {
  const sessions = await readJson("sessions.json", []);
  await writeJson("sessions.json", sessions.filter((s) => s.id !== id));
}
