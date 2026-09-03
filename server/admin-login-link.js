// Prints a sign-in link that works once, for ten minutes, for one
// account - the admin unless a username is named. For getting into a
// studio without its password: a lost one, or a panel that manages
// many studios and signs people in on their behalf.
//
//   node admin-login-link.js            the first host account, else the admin
//   node admin-login-link.js jo         a named account
//
// Inside the container: docker compose exec app node admin-login-link.js
import { readJson } from "./src/storage.js";
import { mintLink } from "./src/loginlinks.js";
import { config } from "./src/config.js";

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
  // Shows are run from a host account, so that is the door this opens
  // by default; a studio with only an admin gets the admin panel.
  user = users.find((u) => u.role !== "admin" && u.passwordHash) || users.find((u) => u.role === "admin");
}
const token = await mintLink(user.id);
const scheme = config.domain === "localhost" ? `http://localhost:${config.httpPort}` : `https://${config.domain}`;
console.log(`${scheme}/link/${token}`);
console.log(`Signs in as ${user.username}; works once, within ten minutes.`);
