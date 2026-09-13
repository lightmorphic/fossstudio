// The account. A FOSSStudio install is one person's studio: one login,
// and no way to make a second. Anybody who wants their own studio runs
// their own copy - that is what the licence is for.
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
export async function ensureAccount() {
  if (account) return account;
  stored = await readJson(FILE);

  if (!stored || !stored.length) {
    // Before the file existed the password lived in auth.json and the
    // look in settings.json; both are still read here so an install
    // from those days comes forward with everything it had.
    const legacyAuth = await readJson("auth.json");
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
  return acc.username.toLowerCase() === String(username).toLowerCase().trim() ? acc : null;
}

export async function findById(id) {
  const acc = await ensureAccount();
  return acc.id === id ? acc : null;
}

export async function updateAccount(patch) {
  const acc = await ensureAccount();
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
