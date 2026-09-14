// In-session overlays (subscribe + ad) and raise-hand, in one sitting.
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { studioLogin, makeRoom, apiLogin, CAMS } from "./helpers.mjs";
const B = process.argv[2] || "http://127.0.0.1:3999";
// Own temp dir: this used to point at one machine's scratch directory
const S = fs.mkdtempSync(path.join(os.tmpdir(), "fossstudio-overlay-test-"));
// The test ad: a plain red PNG, written here rather than kept on one
// machine or fetched from anywhere.
const RED_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64");
fs.writeFileSync(`${S}/testad.png`, RED_PNG);
let pass = true;
const check = (l, ok) => { console.log(`${ok ? "OK  " : "FAIL"} ${l}`); pass &&= ok; };

// upload the test ad as the host
const hostCookie = await studioLogin(B, "testpass123");
await fetch(`${B}/api/adbanner`, { method: "POST", headers: { "Content-Type": "image/png", Cookie: hostCookie }, body: fs.readFileSync(`${S}/testad.png`) });
const ROOM = await makeRoom(B, "testpass123");

const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${CAMS}/vcam1.y4m`, "--autoplay-policy=no-user-gesture-required"] });
async function join(name, asHost) {
  const ctx = await browser.newContext({ permissions: ["camera", "microphone"] });
  if (asHost) {
    const login = await ctx.newPage();
    await login.goto(`${B}/host/login.html`);
    await login.fill("#username", "admin");
    await login.fill("#password", "testpass123");
    await login.click("button[type=submit]");
    await login.waitForURL("**/host/");
    await login.close();
  }
  const page = await ctx.newPage();
  await page.goto(`${B}/s/${ROOM}${asHost ? "?as=host" : ""}`);
  await page.waitForSelector("#joinBtn:not([disabled])");
  await page.fill("#nameInput", name);
  await page.click("#joinBtn");
  await page.waitForSelector("#session:not([hidden])");
  return page;
}
const host = await join("Host", true);
const guest = await join("Greta", false);
await new Promise((r) => setTimeout(r, 2000));

// --- raise hand ---
await guest.click("#handBtn");
await new Promise((r) => setTimeout(r, 1200));
check("guest's hand button lights up",
  await guest.$eval("#handBtn", (el) => el.classList.contains("hand-on")));
check("host panel row highlights the raised hand",
  await host.$$eval(".hp-guest", (rows) => rows.some((r) => r.classList.contains("hand") && r.textContent.includes("Greta"))));
// host can lower the hand directly
check("host sees a Lower hand button",
  await host.$$eval(".hp-guest .lower", (btns) => btns.length === 1));
await host.$$eval(".hp-guest .lower", (btns) => btns[0].click());
await new Promise((r) => setTimeout(r, 1000));
check("lower-hand clears the highlight",
  await host.$$eval(".hp-guest", (rows) => !rows.some((r) => r.classList.contains("hand"))));
// Guest joined muted by default: start the mute/hand dance unmuted
await guest.click("#muteBtn");
await new Promise((r) => setTimeout(r, 800));
await guest.click("#handBtn"); // raise again for the unmute-clears path
await new Promise((r) => setTimeout(r, 800));
// unmuting via host clears the hand
await host.$$eval(".hp-guest .mute", (btns) => btns[1].click()); // mute...
await new Promise((r) => setTimeout(r, 800));
await guest.click("#handBtn").catch(() => {}); // re-raise while muted
await new Promise((r) => setTimeout(r, 800));
await host.$$eval(".hp-guest .mute", (btns) => btns[1].click()); // ...unmute clears hand
await new Promise((r) => setTimeout(r, 1200));
check("unmuting a guest lowers their hand",
  await host.$$eval(".hp-guest", (rows) => !rows.some((r) => r.classList.contains("hand"))));

// --- overlay without going live: everyone sees it in the session ---
await host.click("#hpSubBtn");
await new Promise((r) => setTimeout(r, 1500));
check("subscribe overlay appears in the guest's session",
  await guest.$eval(".show-overlay.subscribe", (el) => el.classList.contains("in")).catch(() => false));
await new Promise((r) => setTimeout(r, 7000));
check("subscribe overlay goes away on its own",
  await guest.evaluate(() => !document.querySelector(".show-overlay")));
// Record first, so the frame the audience keeps can be looked at too.
await host.click("#hpRecordBtn");
await new Promise((r) => setTimeout(r, 2500));
await host.click("#hpAdBtn");
await new Promise((r) => setTimeout(r, 1500));
check("ad overlay appears in the session with the uploaded image",
  await guest.$eval(".show-overlay.ad img", (el) => el.complete && el.naturalWidth > 0).catch(() => false));

// The banner has to be the same size on screen as in the recording, or a
// host sizes their artwork against one and is judged by the other. The
// mixer draws it 150 tall on a 720 frame; the page owes it the same
// share of the grid.
check("banner is the same share of the picture the recording gives it",
  await guest.evaluate(() => {
    const img = document.querySelector(".show-overlay.ad img");
    const grid = document.getElementById("grid");
    if (!img || !grid) return false;
    const share = img.getBoundingClientRect().height / grid.getBoundingClientRect().height;
    return Math.abs(share - 150 / 720) < 0.03;
  }));

// And it has to reach the frame. This went unchecked, and the mixer was
// looking for a class the page had stopped using, so no overlay reached
// a recording at all while every on-screen check passed.
check("the ad reaches the recorded frame",
  await host.evaluate(() => {
    const c = window.__mixerCanvas;
    if (!c) return false;
    const x = c.getContext("2d");
    // The test ad is plain red, drawn 150 tall in the bottom-right
    // corner 24px in. Look at the middle of where it lands.
    const d = x.getImageData(c.width - 24 - 75, c.height - 24 - 75, 1, 1).data;
    return d[0] > 180 && d[1] < 80 && d[2] < 80;
  }).catch(() => false));
await host.click("#hpRecordBtn").catch(() => {});
await new Promise((r) => setTimeout(r, 2000));
console.log(pass ? "ALL PASS" : "SOME CHECKS FAILED");
await browser.close();
process.exit(pass ? 0 : 1);
