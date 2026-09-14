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
// So: an empty data folder, a weak password refused with a sentence
// somebody can act on, a strong one accepted, a passkey registered and
// then used to log in, two-factor set up and used - and an install from
// before all this that still logs in and is never sent through setup.
//
// And the setup code, which since 14 September 2026 is not asked for
// at all: the first person to open the studio claims it. The checks
// below are that there is no code in the log, none on the screen, and
// none wanted from a LAN address either - the case that looks like
// Docker, where the browser is outside the container and a loopback
// shortcut never applied.
//
// REQUIRE_SETUP_CODE=1 puts it back, and has a section of its own: the
// code is printed, the field is on the page, a wrong or missing one is
// refused, and a request carrying X-Forwarded-For: 127.0.0.1 is still
// asked for it. That last is the check a future change would quietly
// break, and it is why the loopback code is still here.
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
      DATA_DIR: dataDir, HTTP_PORT: String(port), BIND_HOST: env.BIND_HOST || "127.0.0.1",
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

// A tab of its own for a one-off look at a page, closed by the caller.
async function ctxPage(url) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(url);
  return { ctx, page };
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

// A line holding nothing but a code, which is how one was printed. A
// bare /\d{3}-\d{3}/ would find the port range 40000-40003 and fail on
// a log that is perfectly clean.
check("nothing in the log looks like a setup code",
  !/^\s*\d{3}-\d{3}\s*$/m.test(studio.log()) && !/setup code/i.test(studio.log()));
check("the log says the first person to open it claims it",
  /no owner yet/.test(studio.log()) && /there is no code to find/.test(studio.log()));
check("and says out loud what that leaves open until you have",
  /anybody who can reach this address/.test(studio.log()));
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

// There is no code step and no trace of one: not a disabled box, not
// a sentence explaining what it was for.
await page.waitForSelector("#stepLogin:not([hidden])", { timeout: 10000 });
check("setup starts at the password",
  await page.$eval("#stepLogin", (el) => !el.hidden));
check("and the code field is not on the page at all", (await page.$("#code")) === null);
const shown = await page.$eval("#setup", (el) => el.innerText);
check("nor is the code mentioned anywhere on it",
  !/setup code/i.test(shown) && !/compose logs/i.test(shown));
check("the studio says so too", (await fetch(`${B}/api/setup/state`, {
  headers: { Accept: "application/json" }
}).then((r) => r.json())).needsCode === false);

// A weak password
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

// One sign-up in the life of an install. The screen is gone rather
// than redirected, and the route behind it refuses whatever is sent to
// it, from this machine as much as from anywhere else.
{
  const gone = await fetch(`${B}/host/setup.html`, { redirect: "manual" });
  check(`the setup screen is gone once the studio has an owner (${gone.status})`,
    gone.status === 404);
  const again = await fetch(`${B}/api/setup/claim`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "second", password: "a-perfectly-long-password" })
  });
  check(`and claiming it again is refused from this machine too (${again.status})`,
    again.status === 409);
  check("no second account was made",
    (await fetch(`${B}/api/setup/state`).then((r) => r.json())).claimed === true);
}
studio.stop();

// ---------------------------------------------------------------
// From anywhere else - the case a Docker install actually is.
//
// A studio bound to every address, reached on this machine's own LAN
// address, is a genuinely non-loopback request: the same thing a
// browser outside a container makes, and the same thing a stranger on
// the network makes. This is where the old code lived on after it was
// supposed to be gone, so this is where its absence is proved.
// ---------------------------------------------------------------
const lanIp = Object.values(os.networkInterfaces()).flat()
  .filter((n) => n && n.family === "IPv4" && !n.internal).map((n) => n.address)[0];
if (!lanIp) check("this machine has a non-loopback address to be a stranger from", false);

const claimAt = (base, body, headers = {}) => fetch(`${base}/api/setup/claim`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify({ username: "stranger", password: "plum-lantern-vault-drift-onyx", ...body })
});
const stateAt = (base, headers = {}) =>
  fetch(`${base}/api/setup/state`, { headers }).then((r) => r.json());

if (lanIp) {
  const LAN = path.join(root, "lan");
  const lan = startStudio(LAN, PORT + 2, RTC + 8, { BIND_HOST: "0.0.0.0" });
  await lan.ready();
  const R = `http://${lanIp}:${PORT + 2}`;          // the browser outside the box
  const L = `http://127.0.0.1:${PORT + 2}`;         // the same studio, from itself
  console.log(`    a second studio on ${lanIp}`);

  check("nothing in its log looks like a setup code either",
    !/^\s*\d{3}-\d{3}\s*$/m.test(lan.log()) && !/setup code/i.test(lan.log()));
  check("from another address the studio still wants no code",
    (await stateAt(R)).needsCode === false);

  const remote = await ctxPage(`${R}/host/setup.html`);
  await remote.page.waitForSelector("#stepLogin:not([hidden])", { timeout: 10000 });
  check("and the page opens on the password, with no code box on it",
    (await remote.page.$("#code")) === null);
  const remoteText = await remote.page.$eval("#setup", (el) => el.innerText);
  check("nor a word about a code anywhere on it",
    !/setup code/i.test(remoteText) && !/compose logs/i.test(remoteText));
  await remote.ctx.close();

  const claimed = await claimAt(R);
  check(`the first person to open it claims it, code or no code (${claimed.status})`, claimed.ok);
  check("which is the one and only sign-up",
    (await claimAt(R, { username: "third" })).status === 409 &&
    (await claimAt(L, { username: "third" })).status === 409);
  for (const [where, base] of [["from another address", R], ["from this machine", L]]) {
    const gone = await fetch(`${base}/host/setup.html`, { redirect: "manual" });
    check(`the setup screen is gone ${where} (${gone.status})`, gone.status === 404);
  }
  lan.stop();
}

// ---------------------------------------------------------------
// The escape hatch: REQUIRE_SETUP_CODE=1, for somebody whose port is
// open to the internet before they have claimed the studio.
//
// The forgery check is the one that matters here. X-Forwarded-For and
// its cousins are plain text anybody can write, and if the studio ever
// reads an address out of one of them instead of off the socket, every
// studio with the hatch on can be claimed by a stranger in one request.
// Leave this check here.
// ---------------------------------------------------------------
if (lanIp) {
  const HATCH = path.join(root, "hatch");
  const hatch = startStudio(HATCH, PORT + 3, RTC + 12,
    { BIND_HOST: "0.0.0.0", REQUIRE_SETUP_CODE: "1" });
  await hatch.ready();
  const R = `http://${lanIp}:${PORT + 3}`;
  const L = `http://127.0.0.1:${PORT + 3}`;
  const hatchCode = (hatch.log().match(/\n\s+(\d{3}-\d{3})\s*\n/) || [])[1];
  if (!hatchCode) console.log(hatch.log());
  console.log(`    a studio with the hatch on, code ${hatchCode || "none"}`);
  check("with the hatch on the code is printed again", !!hatchCode);
  check("and the log says why it is being asked for",
    /REQUIRE_SETUP_CODE is set/.test(hatch.log()));
  check("the code is nowhere on disk",
    !fs.readdirSync(HATCH).some((f) => {
      const full = path.join(HATCH, f);
      return fs.statSync(full).isFile() && fs.readFileSync(full, "utf8").includes(hatchCode);
    }));

  check("from another address the studio asks for the code",
    (await stateAt(R)).needsCode === true);

  const remote = await ctxPage(`${R}/host/setup.html`);
  await remote.page.waitForSelector("#stepCode:not([hidden])", { timeout: 10000 });
  check("and the page opens on the code step, with the box on it",
    (await remote.page.$("#code")) !== null);
  await remote.ctx.close();

  check(`no code at all is refused (${(await claimAt(R, { code: "" })).status})`,
    (await claimAt(R, { code: "" })).status === 403);
  check(`a wrong code is refused (${(await claimAt(R, { code: "000-000" })).status})`,
    (await claimAt(R, { code: "000-000" })).status === 403);

  // The forgery, three ways
  for (const [label, headers] of [
    ["X-Forwarded-For", { "X-Forwarded-For": "127.0.0.1" }],
    ["X-Real-IP", { "X-Real-IP": "127.0.0.1" }],
    ["Forwarded", { Forwarded: "for=127.0.0.1" }]
  ]) {
    const res = await claimAt(R, { code: "" }, headers);
    check(`a stranger claiming to be local with ${label} is still asked for the code (${res.status})`,
      res.status === 403);
    check(`and ${label} does not even change what the studio says it wants`,
      (await stateAt(R, headers)).needsCode === true);
  }

  // The other side of the same coin: a proxy sharing this machine
  // reaches us over loopback, and then the address on the socket is
  // the proxy's and proves nothing. Any sign of a relay puts the code
  // back, even on loopback.
  check("a loopback request that has been through a proxy is asked for the code",
    (await stateAt(L, { "X-Forwarded-For": "203.0.113.7" })).needsCode === true);
  check("a plain loopback request is not - somebody at the machine has proved it already",
    (await stateAt(L)).needsCode === false);

  check("none of that claimed the studio", (await stateAt(R)).claimed === false);

  // And the right code, from the stranger's address, still works -
  // this is somebody who read the log over SSH, which is the whole
  // point of the code.
  const ok = await claimAt(R, { code: hatchCode });
  check(`the right code claims the studio from another address (${ok.status})`, ok.ok);
  check("which is the one and only sign-up",
    (await claimAt(R, { code: hatchCode, username: "third" })).status === 409);
  hatch.stop();
}

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
