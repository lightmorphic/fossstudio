// Session blocking: the host's one-click block removes a guest, bars
// them from rejoining (IP + device marker), the dashboard lists and
// reverses it, and the stored address never reaches the browser.
import { chromium } from "playwright";
import { hostLogin, makeRoom, TEST_HOST, CAMS } from "./helpers.mjs";

const B = process.argv[2] || "http://127.0.0.1:3999";
const PW = process.argv[3] || "testpass123";
const ROOM = await makeRoom(B, PW);
const cookie = await hostLogin(B, PW);

const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-video-capture=${CAMS}/vcam1.y4m`,
    "--autoplay-policy=no-user-gesture-required"]
});
let pass = true;
const check = (label, ok) => { console.log(`${ok ? "OK  " : "FAIL"} ${label}`); pass &&= ok; };

async function join(ctx, name, asHost) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${name}] pageerror:`, e.message));
  await page.goto(`${B}/s/${ROOM}${asHost ? "?as=host" : ""}`);
  await page.waitForSelector("#joinBtn:not([disabled])");
  await page.fill("#nameInput", name);
  await page.click("#joinBtn");
  await page.waitForSelector("#session:not([hidden])");
  return page;
}

const hostCtx = await browser.newContext({ permissions: ["camera", "microphone"] });
const login = await hostCtx.newPage();
await login.goto(`${B}/host/login.html`);
await login.fill("#username", TEST_HOST.username);
await login.fill("#password", TEST_HOST.password);
await login.click("button[type=submit]");
await login.waitForURL("**/host/");
await login.close();

const host = await join(hostCtx, "Host", true);
const guestCtx = await browser.newContext({ permissions: ["camera", "microphone"] });
const guest = await join(guestCtx, "Troublemaker", false);
await host.waitForTimeout(1500);

// The block button: on the guest's row, not on the host's own
const rows = await host.$$eval(".hp-guest", (els) =>
  els.map((el) => ({ hasBlock: !!el.querySelector(".blockp") })));
check("host's own row has no block button", rows[0] && !rows[0].hasBlock);
check("guest's row has a block button", rows[1] && rows[1].hasBlock);

// First click arms, second blocks
await host.click(".hp-guest .blockp");
check("first click arms, nothing happens yet",
  await host.$eval(".hp-guest .blockp", (el) => el.classList.contains("armed")) &&
  await guest.$eval("#session", (el) => !el.hidden));
await host.click(".hp-guest .blockp");
await guest.waitForSelector("#session", { state: "hidden", timeout: 10000 });
check("guest is dropped from the session", true);
check("guest is told the host removed them",
  (await guest.textContent("body")).includes("The host has removed you"));

// Rejoining is refused, and says why
await guest.waitForSelector("#joinBtn:not([disabled])");
await guest.click("#joinBtn");
await guest.waitForTimeout(2500);
check("rejoin is refused with the block message",
  (await guest.textContent("body")).includes("You have been blocked"));

// A fresh private window (new marker, same address) is refused too
const freshCtx = await browser.newContext({ permissions: ["camera", "microphone"] });
const fresh = await freshCtx.newPage();
await fresh.goto(`${B}/s/${ROOM}`);
await fresh.waitForSelector("#joinBtn:not([disabled])");
await fresh.fill("#nameInput", "SameIpNewBrowser");
await fresh.click("#joinBtn");
await fresh.waitForTimeout(2500);
check("same address in a fresh browser is refused",
  (await fresh.textContent("body")).includes("You have been blocked"));

// The dashboard list: named, dated, address never exposed, login-gated
const listRes = await fetch(`${B}/api/session/blocked`, { headers: { Cookie: cookie } });
const list = await listRes.json();
check("block list has the one entry", list.length === 1 && list[0].name === "Troublemaker");
check("block list never exposes the address or marker",
  !("ip" in (list[0] || {})) && !("marker" in (list[0] || {})));
check("block list needs a login",
  (await fetch(`${B}/api/session/blocked`)).status === 401);

// Unblock lets them straight back in
const del = await fetch(`${B}/api/session/blocked/${list[0].id}`,
  { method: "DELETE", headers: { Cookie: cookie } });
check("unblock succeeds", (await del.json()).ok === true);
await fresh.click("#joinBtn");
await fresh.waitForSelector("#session:not([hidden])", { timeout: 15000 });
check("unblocked guest joins fine", true);

await browser.close();
console.log(pass ? "ALL PASS" : "SOME CHECKS FAILED");
process.exit(pass ? 0 : 1);
