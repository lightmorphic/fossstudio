// Prints a sign-in link that works once, for ten minutes. For getting
// into a studio without its password: a lost one, or a panel that looks
// after this studio and signs its owner in on their behalf.
//
//   node login-link.js
//
// Inside the container: docker compose exec app node login-link.js
import { ensureAccount } from "./src/account.js";
import { mintLink } from "./src/loginlinks.js";
import { config, initConfig } from "./src/config.js";
import { setSetupDir } from "./src/setup.js";

// The domain is a setting now, so this has to read the studio's own
// files before it can say where the link points.
setSetupDir(config.dataDir);
await initConfig();
const account = await ensureAccount();
if (!account) {
  console.error("This studio has no owner yet, so there is nobody to sign in as.\n" +
    "Open it in a browser and choose a password first.");
  process.exit(1);
}
const token = await mintLink(account.id);
const scheme = config.domain === "localhost" ? `http://localhost:${config.httpPort}` : `https://${config.domain}`;
console.log(`${scheme}/link/${token}`);
console.log(`Signs in as ${account.username}; works once, within ten minutes.`);
