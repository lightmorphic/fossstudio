// Screen sharing: host authorises, guest's button comes alive, the
// share flips every screen into the big-left/small-right layout, the
// live stream draws the same picture, and both the host and the
// presenter can end it.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hostLogin, makeRoom, TEST_HOST, CAMS } from "./helpers.mjs";

const B = process.argv[2] || "http://127.0.0.1:3999";
const PW = process.argv[3] || "testpass123";
const ROOM = await makeRoom(B, PW);
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "fs-share-"));
const cookie = await hostLogin(B, PW);
await fetch(`${B}/api/settings`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ streamUrl: `file:${OUT}`, streamKey: "stream.flv" })
});

const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-video-capture=${CAMS}/vcam1.y4m`,
    "--autoplay-policy=no-user-gesture-required"]
});
let pass = true;
const check = (label, ok) => { console.log(`${ok ? "OK  " : "FAIL"} ${label}`); pass &&= ok; };

// A deterministic "screen": solid magenta, so it is pixel-checkable at
// every hop - guest capture, host stage, and the composited stream
const FAKE_SCREEN = `
  navigator.mediaDevices.getDisplayMedia = async () => {
    const c = document.createElement("canvas");
    c.width = 1280; c.height = 720;
    const x = c.getContext("2d");
    const paint = () => { x.fillStyle = "#ff00ff"; x.fillRect(0, 0, 1280, 720); requestAnimationFrame(paint); };
    paint();
    return c.captureStream(15);
  };
`;

async function join(ctx, name, asHost, initScript) {
  const page = await ctx.newPage();
  if (initScript) await page.addInitScript(initScript);
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
const guest = await join(guestCtx, "Presenter", false, FAKE_SCREEN);
await host.waitForTimeout(1500);

check("guest's share button starts disabled",
  await guest.$eval("#shareBtn", (el) => el.disabled));

// Host allows: the guest's button comes alive
await host.click(".hp-guest .sharep");
await guest.waitForFunction(() => !document.getElementById("shareBtn").disabled);
check("host's allow arms the guest's button", true);

// Guest shares: everyone flips to the share layout
await guest.click("#shareBtn");
await host.waitForFunction(() => document.getElementById("grid").classList.contains("sharing"), null, { timeout: 10000 });
await guest.waitForFunction(() => document.getElementById("grid").classList.contains("sharing"));
check("both screens flip to the share layout", true);

await host.waitForTimeout(2000);
const m = await host.evaluate(() => {
  const grid = document.getElementById("grid").getBoundingClientRect();
  const stage = document.getElementById("shareStage").getBoundingClientRect();
  const tiles = [...document.querySelectorAll(".tile")].map((t) => t.getBoundingClientRect());
  const v = document.getElementById("shareVideo");
  const c = document.createElement("canvas");
  c.width = 32; c.height = 32;
  c.getContext("2d").drawImage(v, 0, 0, 32, 32);
  const d = c.getContext("2d").getImageData(16, 16, 1, 1).data;
  return {
    stageFrac: stage.width / grid.width,
    tilesRight: tiles.every((t) => t.left > stage.right - 2),
    tilesSmall: tiles.every((t) => t.width < grid.width * 0.25),
    px: [d[0], d[1], d[2]]
  };
});
check("stage takes most of the width (~72%)", m.stageFrac > 0.65 && m.stageFrac < 0.78);
check("tiles sit small in the right column", m.tilesRight && m.tilesSmall);
check("host sees the shared picture (magenta)", m.px[0] > 200 && m.px[1] < 80 && m.px[2] > 200);

// The stream draws the same picture: go live mid-share and probe a frame
await host.click("#hpYtBtn");
await host.waitForTimeout(12000);
await host.click("#hpYtBtn");
await host.waitForTimeout(2500);

// Host's one click back to normal
await host.hover("#shareStage");
await host.click("#shareStopBtn");
await guest.waitForFunction(() => !document.getElementById("grid").classList.contains("sharing"), null, { timeout: 10000 });
await host.waitForFunction(() => !document.getElementById("grid").classList.contains("sharing"));
check("host's stop returns everyone to normal", true);

// The presenter can start again and stop from their side
await guest.click("#shareBtn");
await host.waitForFunction(() => document.getElementById("grid").classList.contains("sharing"));
await guest.click("#shareBtn");
await host.waitForFunction(() => !document.getElementById("grid").classList.contains("sharing"));
check("presenter can stop their own share", true);

// Withdrawing permission disarms the button again
await host.click(".hp-guest .sharep");
await guest.waitForFunction(() => document.getElementById("shareBtn").disabled);
check("withdrawing permission disarms the button", true);

await browser.close();

// The composited stream: magenta fills the left pane, camera on the right
const flv = `${OUT}/stream.flv`;
check("stream file exists", fs.existsSync(flv));
try {
  const frame = `${OUT}/frame.png`;
  execFileSync("ffmpeg", ["-loglevel", "error", "-i", flv, "-ss", "5", "-frames:v", "1", "-y", frame]);
  const probe = (x, y) => {
    const raw = execFileSync("ffmpeg", ["-loglevel", "error", "-i", frame,
      "-vf", `crop=8:8:${x}:${y}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
    return [raw[0], raw[1], raw[2]];
  };
  const pane = probe(460, 360);   // middle of the left pane
  const col = probe(1150, 355);   // middle of the right column
  check("stream's left pane carries the screen (magenta)",
    pane[0] > 180 && pane[1] < 90 && pane[2] > 180);
  check("stream's right column is not the screen",
    !(col[0] > 180 && col[1] < 90 && col[2] > 180));
} catch (e) {
  check(`stream frame probe (${e.message.slice(0, 60)})`, false);
}

console.log(pass ? "ALL PASS" : "SOME CHECKS FAILED");
process.exit(pass ? 0 : 1);
