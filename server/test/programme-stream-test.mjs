// The programme feed: the host's browser draws the show, mixes the sound
// and encodes it; the server passes it on untouched. This proves all
// three from the outside - the stream file is H.264 that ffmpeg only
// copied, the picture carries what the browser drew, and the server's
// share of the work stays under a fraction of one core.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hostLogin, makeRoom } from "./helpers.mjs";

const B = process.argv[2] || "http://127.0.0.1:3999";
const PW = process.argv[3] || "testpass123";
const ROOM = await makeRoom(B, PW);
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "fossstudio-programme-test-"));

const cookie = await hostLogin(B, PW);
await fetch(`${B}/api/settings`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ streamUrl: `file:${OUT}`, streamKey: "stream.flv" })
});

const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"]
});
let pass = true;
const check = (label, ok) => { console.log(`${ok ? "OK  " : "FAIL"} ${label}`); pass &&= ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const hostCtx = await browser.newContext({ permissions: ["camera", "microphone"] });
const login = await hostCtx.newPage();
await login.goto(`${B}/host/login.html`);
await login.fill("#username", "testhost");
await login.fill("#password", "testhostpass123");
await login.click("button[type=submit]");
await login.waitForURL("**/host/");
await login.close();

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

const host = await join(hostCtx, "Host", true);
const guestCtx = await browser.newContext({ permissions: ["camera", "microphone"] });
const guest = await join(guestCtx, "Guest", false);
await sleep(2000);

await host.click("#hpYtBtn");
await sleep(4000);
check("host sees LIVE indicator", await host.$eval("#banner", (el) => el.classList.contains("live")));
check("the host's browser is sending a programme feed",
  await host.evaluate(() => !!window.__programmeStream && window.__programmeStream.getVideoTracks().length === 1));

// What the server says it is doing
const live = await (await fetch(`${B}/api/live/${ROOM}`)).json().catch(() => ({}));
check(`server reports the programme path (mode=${live.mode})`, live.mode === "programme");

// What ffmpeg was actually asked to do: copy the video, never encode it
const ps = execFileSync("ps", ["-eo", "pid,pcpu,args"]).toString();
const ff = ps.split("\n").find((l) => /ffmpeg/.test(l) && /stream\.flv|fslive/.test(l)) || "";
check("ffmpeg is copying the video (-c:v copy)", / -c:v copy /.test(ff));
check("ffmpeg has no libx264 in its arguments", !/libx264/.test(ff));

// And what that costs: sample the ffmpeg process over eight seconds
const pid = Number(ff.trim().split(/\s+/)[0]);
function cpuTicks(p) {
  const stat = fs.readFileSync(`/proc/${p}/stat`, "utf8").split(") ")[1].split(" ");
  return Number(stat[11]) + Number(stat[12]); // utime + stime, in clock ticks
}
const hz = 100;
let cpuPct = -1;
if (pid) {
  const t0 = cpuTicks(pid), w0 = Date.now();
  await sleep(8000);
  const t1 = cpuTicks(pid), w1 = Date.now();
  cpuPct = ((t1 - t0) / hz) / ((w1 - w0) / 1000) * 100;
}
check(`server-side ffmpeg used ${cpuPct.toFixed(1)}% of one core while live (limit 30%)`, cpuPct >= 0 && cpuPct < 30);

// A guest joining mid-stream must not relaunch anything
const guest2Ctx = await browser.newContext({ permissions: ["camera", "microphone"] });
await join(guest2Ctx, "Late", false);
await sleep(4000);
const ps2 = execFileSync("ps", ["-eo", "pid,args"]).toString();
const ff2 = ps2.split("\n").find((l) => /ffmpeg/.test(l) && /stream\.flv|fslive/.test(l)) || "";
check("the same ffmpeg is still running after a late join (no relaunch)", Number(ff2.trim().split(/\s+/)[0]) === pid);

await sleep(4000);
await host.click("#hpYtBtn");
// Copying from RTP, ffmpeg can take a few seconds to notice SIGINT, and
// the server waits for it before it says the stream has stopped
await sleep(7000);
check("LIVE indicator cleared", await guest.$eval("#banner", (el) => !el.classList.contains("live")));
check("the programme feed stopped with the stream",
  await host.evaluate(() => !window.__programmeStream || window.__programmeStream.getVideoTracks()[0]?.readyState === "ended"));

const outFile = `${OUT}/stream.flv`;
check("stream file exists", fs.existsSync(outFile));
try {
  const probe = JSON.parse(execFileSync("ffprobe",
    ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", outFile]));
  const lastPts = execFileSync("ffprobe",
    ["-v", "quiet", "-select_streams", "v", "-show_entries", "packet=pts_time",
     "-of", "csv=p=0", outFile]).toString().trim().split("\n").pop();
  const dur = Number(lastPts || 0);
  const codecs = probe.streams.map((s) => `${s.codec_type}:${s.codec_name}`).join(" ");
  const video = probe.streams.find((s) => s.codec_type === "video");
  console.log(`     stream: ${codecs}, ${dur.toFixed(1)}s, ${video?.width}x${video?.height}`);
  check("stream is h264 video + aac audio and >8s", codecs.includes("video:h264") && codecs.includes("audio:aac") && dur > 8);
  check("the browser drew a 1280x720 programme", video?.width === 1280 && video?.height === 720);

  // The lower third the browser drew, bottom-left of the first tile:
  // dark pixels where the fake camera is otherwise bright
  const rgb = execFileSync("ffmpeg", [
    "-loglevel", "quiet", "-err_detect", "ignore_err", "-ss", "6", "-i", outFile,
    "-frames:v", "1", "-vf", "crop=30:8:30:690", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"
  ]);
  const n = Math.floor(rgb.length / 3);
  let r = 0, g = 0, b = 0;
  for (let i = 0; i + 2 < 3 * n; i += 3) { r += rgb[i]; g += rgb[i + 1]; b += rgb[i + 2]; }
  r /= n; g /= n; b /= n;
  check(`lower-third banner in the picture (rgb ${r.toFixed(0)},${g.toFixed(0)},${b.toFixed(0)})`, r < 90 && g < 90 && b < 90);
} catch (e) {
  check(`probe failed: ${e.message.slice(0, 80)}`, false);
}

console.log(pass ? "ALL PASS" : "SOME CHECKS FAILED");
await browser.close();
process.exit(pass ? 0 : 1);
