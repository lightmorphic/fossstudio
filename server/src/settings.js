// The studio's settings (validated patches) and its sessions. There is
// one studio, so nothing here asks whose.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { readJson, writeJson } from "./storage.js";
import { legacyAccountSettings } from "./account.js";

const FILE = "settings.json";

// The banner a fresh install starts with, so the ad button in the host
// controls does something the first time it is pressed instead of being
// gray with nothing behind it. It is an example - an advert for
// Castmorphic, which is the hosted version of this studio and what pays
// for it being free - and the Ad Banner screen says so. From the moment
// it is copied in it is an ordinary uploaded banner: replacing it and
// deleting it go down the same paths as any other, with no special case
// anywhere, which is also why deleting it sticks. It is only ever the
// starting state, laid down once when settings.json is first written.
const EXAMPLE_AD = "ad.png";
const EXAMPLE_AD_SOURCE = fileURLToPath(new URL("../assets/example-ad.png", import.meta.url));

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

// Run once at startup, before anything reads the settings.
//
// Two jobs. Installs from the days when the look was carried on an
// account bring it across. And a studio that has never had an ad banner
// gets the example one, so the ad button does something on a new studio
// instead of being gray with no way to find out what it would have done.
//
// Keying the example off settings.json existing was wrong: a studio set
// up before the example shipped has settings and no banner, so it got
// the note about an example and no example - which is how Charlie found
// it. It is keyed off `exampleAdOffered` instead. That flag is written
// the one time the example is laid down and never cleared, so deleting
// the banner deletes it for good and a restart does not bring it back.
export async function migrateSettings() {
  const current = await readJson(FILE);
  const old = current ? null : await legacyAccountSettings();
  const next = { ...SETTINGS_DEFAULTS, ...(old || {}), ...(current || {}) };
  let changed = !current;

  if (!next.exampleAdOffered && !next.adBanner) {
    next.exampleAdOffered = true;
    if (await copyExampleAd()) {
      next.adBanner = EXAMPLE_AD;
      // Says the banner on screen is ours, so the Ad Banner screen can
      // explain it - and stop explaining it the moment it is replaced.
      next.adBannerIsExample = true;
    }
    changed = true;
  }

  if (changed) await writeJson(FILE, next);
  if (old) console.log("moved the studio's look out of the account file into settings.json");
}

// Copy the shipped example into the uploads directory under the name an
// uploaded banner would have, so every other piece of code - the
// settings screen, the delete button, the overlay, the pinned theme -
// sees a banner and nothing more. Failing is not fatal: an install
// without the example works, it just starts with a gray ad button.
async function copyExampleAd() {
  const dir = path.join(config.dataDir, "uploads");
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.copyFile(EXAMPLE_AD_SOURCE, path.join(dir, EXAMPLE_AD));
    return true;
  } catch (err) {
    console.warn(`could not lay down the example ad banner: ${err.message}`);
    return false;
  }
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
  // Says whether the banner on screen is the one we ship. It is only
  // ever cleared: uploading your own or removing it both mean the note
  // explaining our example has nothing left to explain.
  if (patch.adBannerIsExample === false) {
    clean.adBannerIsExample = false;
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
