// The one-time sign-in link: login-link.js mints it, /link/<token>
// redeems it exactly once, and it opens the studio's one account. Run
// against a running server, pointed at the same data directory:
//   DATA_DIR=<the server's> node test/login-link-test.mjs http://127.0.0.1:3999
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const B = process.argv[2] || "http://127.0.0.1:3999";
let pass = true;
const check = (label, ok) => { console.log(`${ok ? "OK  " : "FAIL"} ${label}`); pass &&= ok; };
const serverDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const out = execFileSync(process.execPath, ["login-link.js"], { cwd: serverDir, env: process.env }).toString();
const link = (out.match(/https?:\/\/\S+\/link\/\S+/) || [])[0];
check(`the script prints a link (${(link || "none").slice(0, 40)}...)`, !!link);
check("the link names the account it opens", /Signs in as \w+;/.test(out));

const first = await fetch(link, { redirect: "manual" });
const cookie = first.headers.get("set-cookie") || "";
check(`first visit sets a session and sends to /host/ (${first.status} -> ${first.headers.get("location")})`,
  first.status === 302 && first.headers.get("location") === "/host/" && /fs_host=/.test(cookie));

const me = await fetch(`${B}/api/me`, { headers: { Cookie: cookie.split(";")[0] } }).then((r) => r.json());
check(`the session is the studio account (${me.username})`, me.authed === true && !!me.username);

const second = await fetch(link, { redirect: "manual" });
check(`second visit is refused (${second.headers.get("location")})`,
  second.status === 302 && second.headers.get("location") === "/host/login.html" && !second.headers.get("set-cookie"));

const bogus = await fetch(`${B}/link/${"x".repeat(32)}`, { redirect: "manual" });
check("a made-up token is refused", bogus.status === 302 && bogus.headers.get("location") === "/host/login.html");

console.log(pass ? "ALL PASS" : "SOME CHECKS FAILED");
process.exit(pass ? 0 : 1);
