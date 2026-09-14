// The recording quality setting, driven from the dashboard.
//
// Charlie, 13 September 2026: "A lot of people don't understand about
// containers - they just know it as being one file. I did not until
// today understand that you can have PCM in a WebM container, or Opus
// in a WebM container which is a lot smaller."
//
// So the setting is two named choices and never a codec name, and this
// checks the choice actually reaches the browsers' recorders: pick
// smaller files, record, and what comes back is compressed and small;
// pick best quality and it is every sample.
//
// It also records what the real browsers support, because the choice
// only means anything if the measurement behind it is true.
//   node test/quality-test.mjs [url] [password]
import { chromium, firefox } from "playwright";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { makeRoom, studioLogin, REPO } from "./helpers.mjs";

const B = process.argv[2] || "http://127.0.0.1:3999";
const PW = process.argv[3] || "testpass123";
const DATA = process.env.DATA_DIR || path.join(REPO, "data");
const cookie = await studioLogin(B, PW);

let pass = true;
const check = (label, ok) => { console.log(`${ok ? "OK  " : "FAIL"} ${label}`); pass &&= ok; };

const probe = (file, entries) => spawnSync("ffprobe",
  ["-v", "error", "-show_entries", entries, "-of", "default=nw=1:nk=1", file],
  { encoding: "utf8" }).stdout.trim();

// ---------------------------------------------------------------
// What the browsers on this machine will actually record. The sizes
// in the setting's wording rest on this, so it is measured, not
// assumed, and a change in either browser shows up here first.
// ---------------------------------------------------------------
const WANTED = ["audio/webm;codecs=pcm", "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus", "audio/mp4;codecs=opus"];
for (const [name, engine] of [["Chromium", chromium], ["Firefox", firefox]]) {
  const br = await engine.launch();
  const page = await br.newPage();
  await page.goto(`${B}/host/login.html`);
  const support = await page.evaluate((list) =>
    list.filter((m) => MediaRecorder.isTypeSupported(m)), WANTED);
  console.log(`    ${name} records: ${support.join(", ") || "nothing we asked about"}`);
  if (name === "Firefox") {
    check("Firefox still cannot record uncompressed, which the setting says",
      !support.includes("audio/webm;codecs=pcm"));
    check("Firefox can record Opus, so a guest on it is not left with nothing",
      support.includes("audio/webm;codecs=opus"));
  } else {
    check("Chromium can record uncompressed", support.includes("audio/webm;codecs=pcm"));
  }
  await br.close();
}

// ---------------------------------------------------------------
// The setting, end to end, both ways round.
// ---------------------------------------------------------------
const setQuality = (value) => fetch(`${B}/api/settings`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ recordingQuality: value })
}).then((r) => r.json());

const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
         "--autoplay-policy=no-user-gesture-required"]
});

const TAKE_MS = 14000;
const sizes = {};

for (const [value, expectExt] of [["best", "wav"], ["smaller", "opus"]]) {
  const saved = await setQuality(value);
  check(`the dashboard stores "${value}" (${saved.recordingQuality})`, saved.recordingQuality === value);
  const room = await makeRoom(B, PW, `Quality ${value}`);

  const ctx = await browser.newContext({ permissions: ["camera", "microphone"], viewport: { width: 1280, height: 800 } });
  const login = await ctx.newPage();
  await login.goto(`${B}/host/login.html`);
  await login.fill("#username", "admin");
  await login.fill("#password", PW);
  await login.click("button[type=submit]");
  await login.waitForURL("**/host/");

  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[host] pageerror:", e.message));
  await page.goto(`${B}/s/${room}?as=host`);
  await page.waitForSelector("#joinBtn:not([disabled])");
  await page.fill("#nameInput", "Eric");
  await page.click("#joinBtn");
  await page.waitForSelector("#session:not([hidden])");
  await page.waitForTimeout(1500);
  await page.click("#hpRecordBtn");
  await page.waitForTimeout(TAKE_MS);
  await page.click("#hpRecordBtn");

  let rec = null;
  for (let i = 0; i < 45; i++) {
    const list = await login.evaluate(() => fetch("/api/recordings").then((r) => r.json()));
    rec = list.find((r) => r.roomId === room);
    if (rec && rec.status === "ready") break;
    await page.waitForTimeout(2000);
  }
  const audio = (rec?.files || []).find((f) => /^Eric-audio\./.test(f));
  const file = path.join(DATA, "recordings", rec?.id || "", "out", audio || "x");
  const bytes = fs.statSync(file, { throwIfNoEntry: false })?.size || 0;
  const dur = Number(probe(file, "format=duration")) || 0;
  const codec = probe(file, "stream=codec_name");
  sizes[value] = { bytes, dur };
  console.log(`    ${value}: ${audio}, ${codec}, ${dur.toFixed(2)}s, ` +
    `${(bytes / 1e6).toFixed(2)} MB = ${(bytes / dur * 3600 / 1e6).toFixed(0)} MB per person per hour`);
  check(`"${value}" gives a .${expectExt}`, !!audio && audio.endsWith(`.${expectExt}`));
  check(`"${value}": the file is still the full length of the take ` +
    `(${dur.toFixed(2)}s against ${(TAKE_MS / 1000).toFixed(2)}s)`,
    Math.abs(dur - TAKE_MS / 1000) < 1.5);

  fs.rmSync(path.join(DATA, "recordings", rec?.id || "nothing"), { recursive: true, force: true });
  await ctx.close();
}

// The sizes in the setting's wording, measured rather than asserted.
//
// They cannot be taken from the session above: the fake microphone a
// browser can be given delivers its samples to the first thing that
// asks, and in a session that is the WebRTC sender, so what the
// recorder gets is silence - which Opus compresses to almost nothing
// and would make the smaller-files figure a flattering lie. So the
// same MediaRecorder is given a real signal on its own.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${B}/host/login.html`);
  const rates = await page.evaluate(async () => {
    const ac = new AudioContext({ sampleRate: 48000 });
    const out = {};
    for (const [name, mime] of [["best", "audio/webm;codecs=pcm"], ["smaller", "audio/webm;codecs=opus"]]) {
      const dest = ac.createMediaStreamDestination();
      // Speech is not a sine wave, and a sine wave is not what the
      // figure was measured on, so this is noise through a voice-shaped
      // filter: broadband, and as hard to compress as talking is.
      const noise = ac.createBufferSource();
      const buf = ac.createBuffer(1, 48000 * 2, 48000);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.3;
      noise.buffer = buf;
      noise.loop = true;
      const band = ac.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 1000;
      band.Q.value = 0.7;
      noise.connect(band).connect(dest);
      noise.start();
      const parts = [];
      const rec = new MediaRecorder(dest.stream, { mimeType: mime });
      rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
      const stopped = new Promise((r) => { rec.onstop = r; });
      rec.start(5000);
      await new Promise((r) => setTimeout(r, 10000));
      rec.stop();
      await stopped;
      noise.stop();
      out[name] = new Blob(parts).size / 10;    // bytes a second
    }
    return out;
  });
  await ctx.close();
  const perHour = (v) => rates[v] * 3600;
  console.log(`    measured on real signal: best quality ${(perHour("best") / 1e9).toFixed(2)} GB ` +
    `per person per hour, smaller files ${(perHour("smaller") / 1e6).toFixed(0)} MB, ` +
    `a factor of ${(perHour("best") / perHour("smaller")).toFixed(0)}`);
  // Held to the order of magnitude, not the digits: a browser may change
  // its bitrate and the sentence beside the setting would still be true.
  check(`best quality is about 1.4 GB per person per hour (${(perHour("best") / 1e9).toFixed(2)} GB)`,
    perHour("best") > 1.1e9 && perHour("best") < 1.8e9);
  check(`smaller files is about 54 MB per person per hour (${(perHour("smaller") / 1e6).toFixed(0)} MB)`,
    perHour("smaller") > 25e6 && perHour("smaller") < 110e6);
}

await setQuality("best");
console.log(pass ? "ALL PASS" : "SOME CHECKS FAILED");
await browser.close();
process.exit(pass ? 0 : 1);
