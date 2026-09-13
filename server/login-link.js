// Prints a sign-in link that works once, for ten minutes. For getting
// into a studio without its password: a lost one, or a panel that looks
// after this studio and signs its owner in on their behalf.
//
//   node login-link.js
//
// Inside the container: docker compose exec app node login-link.js
import { ensureAccount } from "./src/account.js";
import { mintLink } from "./src/loginlinks.js";
import { config } from "./src/config.js";

const account = await ensureAccount();
const token = await mintLink(account.id);
const scheme = config.domain === "localhost" ? `http://localhost:${config.httpPort}` : `https://${config.domain}`;
console.log(`${scheme}/link/${token}`);
console.log(`Signs in as ${account.username}; works once, within ten minutes.`);
