// First run, driven the way a person does it.
//
// Charlie: "Instead of putting anything into a Docker compose, which I
// think is very unprofessional, can we put it into the settings? When
// you log in for the first time you create the password, and also give
// them the chance to do 2FA. People use weak passwords and then blame
// the product for being hackable. I would rather people be upset with
// me for forcing a good password than complaining that we didn't force
// them to use a good password after they get hacked."
//
// So: an empty data folder, the code out of the log, a weak password
// refused with a sentence somebody can act on, a strong one accepted, a
// passkey registered and then used to log in, two-factor set up and
// used - and an install from before all this that still logs in and is
// never sent through setup.
//
// The passkey is a real one as far as the browser and the server are
// concerned: Chrome's virtual authenticator holds the private key and
// signs with it, and the server verifies the signature it produces.
//
//   node test/setup-test.mjs
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { totpCode } from "../src/auth.js";

const REPO = new URL("../", import.meta.url).pathname;
// Ports of its own for this run. A studio left behind by an earlier run
// would answer these checks and make nonsense of them, and a run that
// picks the same numbers every time is asking for exactly that.
const PORT = 3900 + Math.floor(Math.random() * 60) * 2;
const RTC = 41000 + Math.floor(Math.random() * 100) * 8;

// Every studio this starts dies with it, however it ends.
const running = new Set();
const killAll = () => { for (const s of running) s.kill("SIGKILL"); };
process.on("exit", killAll);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { killAll(); process.exit(1); });
process.on("uncaughtException", (err) => { killAll(); console.error(err); process.exit(1); });

let pass = true;
const check = (label, ok) => { console.log(`${ok ? "OK  " : "FAIL"} ${label}`); pass &&= ok; };

// A studio of its own, on its own ports, with its own empty folder.
function startStudio(dataDir, port, rtc, env = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const child = spawn(process.execPath, ["src/index.js"], {
    cwd: REPO,
    env: {
      ...process.env, ...env,
      DATA_DIR: dataDir, HTTP_PORT: String(port), BIND_HOST: "127.0.0.1",
      RTC_MIN_PORT: String(rtc), RTC_MAX_PORT: String(rtc + 3)
    }
  });
  let log = "";
  child.stdout.on("data", (b) => { log += b; });
  child.stderr.on("data", (b) => { log += b; });
  return {
    child,
    log: () => log,
    async ready() {
      for (let i = 0; i < 60; i++) {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/setup/state`);
          if (r.ok) return;
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error(`studio on ${port} never came up:\n${log}`);
    },
    stop() { child.kill("SIGKILL"); }
  };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "fossstudio-setup-"));
const FRESH = path.join(root, "fresh");
const OLD = path.join(root, "old");
const browser = await chromium.launch();

// ---------------------------------------------------------------
// A studio nobody owns yet
// ---------------------------------------------------------------
const studio = startStudio(FRESH, PORT, RTC);
await studio.ready();
// localhost rather than 127.0.0.1: a passkey is bound to a domain, and
// a bare IP address is not one, so a browser refuses to make one there.
// Every real install has a real domain, which is the case this proves.
const B = `http://localhost:${PORT}`;

const code = (studio.log().match(/\n\s+(\d{3}-\d{3})\s*\n/) || [])[1];
if (!code) console.log(studio.log());
console.log(`    the log prints a setup code: ${code || "none"}`);
check("the studio prints a one-time setup code on a first start", !!code);
check("the code is nowhere on disk",
  !fs.readdirSync(FRESH).some((f) => {
    const full = path.join(FRESH, f);
    return fs.statSync(full).isFile() && fs.readFileSync(full, "utf8").includes(code);
  }));
check("the secrets were made rather than typed",
  fs.existsSync(path.join(FRESH, "secrets.json")));
check("the secrets file is readable by its owner only",
  (fs.statSync(path.join(FRESH, "secrets.json")).mode & 0o777) === 0o600);
check("the relay's own config was written for it",
  fs.readFileSync(path.join(FRESH, "turn", "turnserver.conf"), "utf8").includes("static-auth-secret="));

const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } });
const page = await ctx.newPage();
// Chrome's virtual authenticator: a real passkey, made and signed in
// the browser, with no hardware and nobody to touch it. It belongs to
// the page it is attached to, which is why the whole of this - making
// the key and then signing in with it - happens in this one tab.
const cdp = await ctx.newCDPSession(page);
await cdp.send("WebAuthn.enable");
const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true,
             hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true }
});
page.on("pageerror", (e) => console.log("[setup] pageerror:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("[setup] console:", m.text()); });

// The login page sends an unclaimed studio to setup rather than showing
// a password box nobody can get past.
await page.goto(`${B}/host/login.html`);
await page.waitForURL("**/host/setup.html", { timeout: 10000 }).catch(() => {});
check(`the login page sends you to setup (${new URL(page.url()).pathname})`,
  page.url().endsWith("/host/setup.html"));

// A wrong code gets you no further
await page.fill("#code", "000-000");
await page.click("#codeNext");
await page.fill("#password", "a-long-enough-password-here");
await page.click("#claim");
await page.waitForTimeout(700);
const wrongCode = await page.$eval("#codeErr", (el) => el.hidden ? "" : el.textContent.trim());
console.log(`    wrong code: ${wrongCode}`);
check("a wrong setup code is refused and says where the right one is",
  /setup code/i.test(wrongCode) && /logs/.test(wrongCode));
check("a wrong code does not claim the studio",
  (await fetch(`${B}/api/setup/state`).then((r) => r.json())).claimed === false);

// The right code, then a weak password
await page.fill("#code", code);
await page.click("#codeNext");
await page.fill("#username", "charlie");
await page.fill("#password", "password123");
await page.waitForTimeout(800);
const weak = await page.$eval("#loginErr", (el) => el.hidden ? "" : el.textContent.trim());
console.log(`    weak password: ${weak}`);
check('"password123" is refused by name, while it is being typed',
  /"password"/.test(weak) && /guess/.test(weak));
await page.click("#claim");
await page.waitForTimeout(700);
check("a weak password does not claim the studio",
  (await fetch(`${B}/api/setup/state`).then((r) => r.json())).claimed === false);

// The offered passphrase is taken with one click
await page.click("#useSuggestion");
const offered = await page.inputValue("#password");
console.log(`    the studio offered: ${offered}`);
check("a passphrase is offered beside the box and one click takes it",
  /^[a-z]+(-[a-z]+){3,}$/.test(offered));
await page.waitForTimeout(700);
check("the offered passphrase passes the rule",
  await page.$eval("#loginErr", (el) => el.hidden));

await page.click("#claim");
await page.waitForSelector("#stepPasskey:not([hidden])", { timeout: 10000 });
check("a strong password claims the studio",
  (await fetch(`${B}/api/setup/state`).then((r) => r.json())).claimed === true);

// A passkey, made and verified for real
await page.click("#addPasskey");
await page.waitForTimeout(6000);
const passkeyErr = await page.$eval("#passkeyErr", (el) => el.hidden ? "" : el.textContent.trim());
if (passkeyErr) console.log(`    passkey error: ${passkeyErr}`);
const cookie = (await ctx.cookies()).find((c) => c.name === "fs_host");
const keys = await fetch(`${B}/api/passkeys`, { headers: { Cookie: `fs_host=${cookie.value}` } })
  .then((r) => r.json());
console.log(`    passkeys registered: ${keys.length}${keys[0] ? ` (alg ${keys[0].alg ?? "?"})` : ""}`);
check("a passkey is registered and the server verified it", keys.length === 1);

// Two-factor, set up and used
await page.waitForSelector("#stepTwoFactor:not([hidden])", { timeout: 10000 });
await page.click("#startTfa");
await page.waitForSelector("#tfaCodes:not([hidden])");
const secret = (await page.$eval("#tfaSecret", (el) => el.textContent)).replace(/\s+/g, "");
check("the secret is shown in a form a person can actually type", secret.length >= 30);
const link = await page.getAttribute("#tfaLink", "href");
check("the authenticator link is an otpauth: one and reaches nowhere else",
  link.startsWith("otpauth://totp/") && !/https?:/.test(link));
await page.fill("#tfaCode", totpCode(secret));
await page.click("#confirmTfa");
await page.waitForSelector("#stepPlace:not([hidden])", { timeout: 10000 });
check("two-factor is on after a correct code",
  (await fetch(`${B}/api/2fa`, { headers: { Cookie: `fs_host=${cookie.value}` } })
    .then((r) => r.json())).enabled === true);

// Where it lives
await page.fill("#domain", "studio.example.com");
await page.fill("#publicIp", "203.0.113.9");
await page.click("#savePlace");
await page.waitForTimeout(600);
const badIp = await page.$eval("#placeErr", (el) => el.hidden ? "" : el.textContent.trim());
console.log(`    an example address: ${badIp}`);
check("an address out of the documentation range is refused, with the command to find the real one",
  /examples/.test(badIp) && /ipify/.test(badIp));
await page.fill("#publicIp", "198.18.7.7");
await page.click("#savePlace");
await page.waitForSelector("#stepDone:not([hidden])", { timeout: 10000 });
const place = JSON.parse(fs.readFileSync(path.join(FRESH, "setup.json"), "utf8"));
console.log(`    stored: ${place.domain} / ${place.publicIp}`);
check("the domain and the public address are stored, not in a compose file",
  place.domain === "studio.example.com" && place.publicIp === "198.18.7.7");

// Logging in with the passkey alone
await ctx.clearCookies();
await page.goto(`${B}/host/login.html`);
await page.waitForSelector("#passkeyBtn:not([hidden])", { timeout: 10000 });
await page.click("#passkeyBtn");
await page.waitForURL("**/host/", { timeout: 20000 }).catch(() => {});
check(`the passkey logs you in with no password (${new URL(page.url()).pathname})`,
  page.url().endsWith("/host/"));

// And the password still works, with the second factor now required
const tryPassword = async (totp) => fetch(`${B}/api/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "charlie", password: offered, totp })
});
check("the password alone is not enough once two-factor is on", (await tryPassword("")).status === 401);
check("the password with the code works", (await tryPassword(totpCode(secret))).ok);

await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId }).catch(() => {});
await ctx.close();
studio.stop();

// ---------------------------------------------------------------
// Somebody's existing install. Charlie and Bill both have one, and
// neither may be dragged through setup or locked out at three in the
// morning to make a point.
// ---------------------------------------------------------------
{
  fs.mkdirSync(OLD, { recursive: true });
  // What an install from before this change has on disk
  const scrypt = (pw) => {
    const salt = crypto.randomBytes(16).toString("hex");
    return `${salt}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
  };
  fs.writeFileSync(path.join(OLD, "users.json"), JSON.stringify([{
    id: crypto.randomUUID(), username: "admin",
    passwordHash: scrypt("theoldpassword"), totpEnabled: false, totpSecret: null
  }], null, 2));

  const old = startStudio(OLD, PORT + 1, RTC + 4, { HOST_PASSWORD: "theoldpassword" });
  await old.ready();
  const O = `http://localhost:${PORT + 1}`;
  check("an existing install is not sent through setup",
    (await fetch(`${O}/api/setup/state`).then((r) => r.json())).claimed === true);
  const res = await fetch(`${O}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "theoldpassword" })
  });
  check("an existing install still logs in with the password it had", res.ok);
  check("and is told once that the password lives in the panel now",
    /HOST_PASSWORD is set in the environment/.test(old.log()) && /panel now/.test(old.log()));
  check("no setup code is printed for a studio that already has an owner",
    !/This studio has no owner yet/.test(old.log()));
  old.stop();
}

fs.rmSync(root, { recursive: true, force: true });
console.log(pass ? "ALL PASS" : "SOME CHECKS FAILED");
await browser.close();
process.exit(pass ? 0 : 1);
