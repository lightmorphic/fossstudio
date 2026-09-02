// Locked out? Run this where the server runs (inside the container:
// docker compose exec app node reset-password.js) and it gives one
// account a new random password, printed once and stored nowhere else.
//
//   node reset-password.js            the only account, or the admin
//   node reset-password.js jo         a named account
//
// Restart the server afterwards. It keeps its accounts in memory and
// goes on accepting the old password until it starts again.
import crypto from "node:crypto";
import { readJson, writeJson } from "./src/storage.js";
import { hashPassword } from "./src/auth.js";

const users = await readJson("users.json", []);
if (!users.length) {
  console.error("No accounts yet: the first start creates 'admin' from HOST_PASSWORD.");
  process.exit(1);
}

const wanted = (process.argv[2] || "").trim().toLowerCase();
let user;
if (wanted) {
  user = users.find((u) => u.username.toLowerCase() === wanted);
  if (!user) {
    console.error(`No account called ${wanted}. Accounts: ${users.map((u) => u.username).join(", ")}`);
    process.exit(1);
  }
} else {
  user = users.length === 1 ? users[0] : users.find((u) => u.role === "admin");
  if (!user) {
    console.error(`Several accounts exist, name one: ${users.map((u) => u.username).join(", ")}`);
    process.exit(1);
  }
}

const password = crypto.randomBytes(18).toString("base64url");
user.passwordHash = hashPassword(password);
await writeJson("users.json", users);
console.log(`Password for ${user.username}: ${password}`);
if (user.totpEnabled) console.log("Two-factor is still on for this account; the authenticator app is still needed.");
console.log("Restart the server now: it keeps accepting the old password until it starts again.");
