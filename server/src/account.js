// The account. A FOSSStudio install is one person's studio: one login,
// and no way to make a second. Anybody who wants their own studio runs
// their own copy - that is what the license is for.
//
// The file on disk is still an array called users.json, because installs
// that predate this hold theirs there and nothing of theirs is thrown
// away. The first entry is the account. Any further entries are left
// exactly where they are, written back untouched, and never read.
import crypto from "node:crypto";
import { readJson, writeJson } from "./storage.js";
import { hashPassword, verifyPassword } from "./auth.js";
import { config } from "./config.js";

const FILE = "users.json";

// The whole stored array, and the entry within it that is the account.
let stored = null;
let account = null;

// The settings in the file are true on every start, never only on the
// first. A first run that failed for some unrelated reason used to
// leave an account behind, and every later correction to the compose
// file was then ignored in silence: you pasted the password the file
// told you to paste and were told it was wrong.
//
//   nothing in the file      touch nothing
//   no account yet           create it from the file
//   password no longer opens it   the file wins, and the log says so
//
// A restart that changes nothing rewrites nothing.
// Whether anybody owns this studio yet. A studio with no account is a
// studio nobody has claimed, and the Setup screen is what it serves.
export async function hasAccount() {
  if (account) return true;
  const list = await readJson(FILE);
  if (list && list.length) return true;
  // An install from before the account file also counts as claimed:
  // its password is in auth.json and ensureAccount brings it forward.
  return !!(await readJson("auth.json"))?.passwordHash;
}

// Claiming the studio: the first and only account, made by the person
// who proved they can read this machine's log. Refuses if one exists,
// so the setup screen can never be used to overwrite an owner.
export async function claimAccount({ username, password }) {
  if (await hasAccount()) throw new Error("this studio already has an owner");
  stored = (await readJson(FILE)) || [];
  account = {
    id: crypto.randomUUID(),
    username: String(username || "admin").trim().slice(0, 24) || "admin",
    passwordHash: hashPassword(password),
    totpEnabled: false,
    totpSecret: null,
    passkeys: []
  };
  stored = [account];
  await writeJson(FILE, stored);
  return account;
}

export async function ensureAccount() {
  if (account) return account;
  stored = await readJson(FILE);

  if (!stored || !stored.length) {
    // Before the file existed the password lived in auth.json and the
    // look in settings.json; both are still read here so an install
    // from those days comes forward with everything it had.
    const legacyAuth = await readJson("auth.json");
    // Nothing to bring forward and nothing in the environment: the
    // studio has no owner, and the Setup screen is what answers. Making
    // an account here with an empty password is how a studio used to
    // ship with the door open.
    if (!legacyAuth?.passwordHash && !config.hostPassword) return null;
    account = {
      id: crypto.randomUUID(),
      username: "admin",
      passwordHash: legacyAuth?.passwordHash || hashPassword(config.hostPassword),
      totpEnabled: legacyAuth?.totpEnabled || false,
      totpSecret: legacyAuth?.totpSecret || null
    };
    stored = [account];
    await writeJson(FILE, stored);
    console.log(`created the studio account (${account.username}) from the settings`);
    return account;
  }

  account = stored[0];
  // Roles are gone; a field left over from an install that had them is
  // data, not something to read, so it stays on disk and is ignored.
  if (config.hostPassword) {
    // Honored for the installs that already have it, and said out loud
    // once so nobody thinks a file is still where this belongs.
    console.log("HOST_PASSWORD is set in the environment, so it is what opens this studio. " +
      "The password lives in the panel now: set it there, clear the line from your compose " +
      "file and restart, and it stops being in a file at all.");
  }
  if (config.hostPassword && account.passwordHash &&
      !verifyPassword(config.hostPassword, account.passwordHash)) {
    account.passwordHash = hashPassword(config.hostPassword);
    await writeJson(FILE, stored);
    console.log(`reset the password for ${account.username} to the one in the settings`);
  } else if (config.hostPassword && !account.passwordHash) {
    account.passwordHash = hashPassword(config.hostPassword);
    await writeJson(FILE, stored);
    console.log(`set the password for ${account.username} from the settings`);
  }
  return account;
}

export async function getAccount() {
  return ensureAccount();
}

// The two lookups the login and the session cookie need. There is one
// account, so both are really "is this the one" - kept as questions so
// the callers read plainly.
export async function findByUsername(username) {
  const acc = await ensureAccount();
  return acc && acc.username.toLowerCase() === String(username).toLowerCase().trim() ? acc : null;
}

export async function findById(id) {
  const acc = await ensureAccount();
  return acc && acc.id === id ? acc : null;
}

export async function updateAccount(patch) {
  const acc = await ensureAccount();
  if (!acc) throw new Error("this studio has no owner yet");
  Object.assign(acc, patch);
  await writeJson(FILE, stored);
  return acc;
}

// What the stored accounts held before this became a one-account
// program, for the one-off move of the look into settings.json. The
// settings of whoever had actually set something up are the ones worth
// keeping - on a studio with an admin and a host, the look belonged to
// the host.
export async function legacyAccountSettings() {
  const list = await readJson(FILE, []);
  const filled = list.find((u) => u?.settings &&
    Object.values(u.settings).some((v) => v !== null && v !== "" &&
      !(Array.isArray(v) && v.length === 0)));
  return (filled || list[0])?.settings || null;
}
