// Stream overlays (subscribe + ad) and raise-hand, in one sitting.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hostLogin, makeRoom, apiLogin, CAMS } from "./helpers.mjs";
const B = process.argv[2] || "http://127.0.0.1:3999";
// Own temp dir: this used to point at one machine's scratch directory
const S = fs.mkdtempSync(path.join(os.tmpdir(), "fossstudio-overlay-test-"));
const OUT = `${S}/overlay-out`;
fs.mkdirSync(OUT, { recursive: true });
// The test ad: a plain red banner, made here rather than kept on one machine
execFileSync("ffmpeg", ["-loglevel", "quiet", "-f", "lavfi", "-i", "color=c=red:s=600x150",
  "-frames:v", "1", "-y", `${S}/testad.png`]);
let pass = true;
const check = (l, ok) => { console.log(`${ok ? "OK  " : "FAIL"} ${l}`); pass &&= ok; };

// stream to a file + upload the test ad as the host
const hostCookie = await hostLogin(B, "testpass123");
await fetch(`${B}/api/settings`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: hostCookie }, body: JSON.stringify({ streamUrl: `file:${OUT}`, streamKey: "live.flv" }) });
await fetch(`${B}/api/adbanner`, { method: "POST", headers: { "Content-Type": "image/png", Cookie: hostCookie }, body: fs.readFileSync(`${S}/testad.png`) });
const ROOM = await makeRoom(B, "testpass123");

const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${CAMS}/vcam1.y4m`, "--autoplay-policy=no-user-gesture-required"] });
async function join(name, asHost) {
  const ctx = await browser.newContext({ permissions: ["camera", "microphone"] });
  if (asHost) {
    const login = await ctx.newPage();
    await login.goto(`${B}/host/login.html`);
    await login.fill("#username", "testhost");
    await login.fill("#password", "testhostpass123");
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
check("subscribe overlay appears in the guest's session (no stream needed)",
  await guest.$eval(".live-overlay.subscribe", (el) => el.classList.contains("in")).catch(() => false));
await new Promise((r) => setTimeout(r, 7000));
check("subscribe overlay goes away on its own",
  await guest.evaluate(() => !document.querySelector(".live-overlay")));
await host.click("#hpAdBtn");
await new Promise((r) => setTimeout(r, 1500));
check("ad overlay appears in the session with the uploaded image",
  await guest.$eval(".live-overlay.ad img", (el) => el.complete && el.naturalWidth > 0).catch(() => false));
await guest.evaluate(() => document.querySelector(".live-overlay")?.remove());
await host.click("#hpYtBtn");
await new Promise((r) => setTimeout(r, 5000));
await host.click("#hpSubBtn");
await new Promise((r) => setTimeout(r, 19000)); // relaunch + startup + 7s window + clean tail
await host.click("#hpYtBtn"); // end stream
await new Promise((r) => setTimeout(r, 3000));
const probe = (t) => {
  // average colour of the bottom-centre region at time t, where the
  // reminder pill sits (the screen's own placement, since the host's
  // browser now draws the programme)
  const raw = execFileSync("ffmpeg",
    ["-v", "quiet", "-ss", String(t), "-i", `${OUT}/live.flv`, "-frames:v", "1",
     "-vf", "crop=640:110:320:ih-130,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
  return [raw[0], raw[1], raw[2]];
};
const lastPts = Number(execFileSync("ffprobe",
  ["-v", "quiet", "-select_streams", "v", "-show_entries", "packet=pts_time", "-of", "csv=p=0", `${OUT}/live.flv`]
).toString().trim().split("\n").pop());
const during = probe(3);
const after = probe(Math.max(7.6, lastPts - 0.4));
const dist = Math.hypot(during[0] - after[0], during[1] - after[1], during[2] - after[2]);
check(`subscribe strip visibly changes the frame (Δ=${dist.toFixed(0)}, during=${during}, after=${after})`, dist > 25);

console.log(pass ? "ALL PASS" : "SOME CHECKS FAILED");
await browser.close();
process.exit(pass ? 0 : 1);
