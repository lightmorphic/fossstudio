// A track is always the full length of the take.
//
// Charlie, 13 September 2026: "If a guest disconnects during the show
// and comes back, or somebody joins halfway through, the audio will
// have a big gap at the beginning when they weren't present, otherwise
// it's very difficult to put all the tracks together."
//
// It is the microphone-dropout fault in a different hat. A track that
// is not the full length of the take cannot be lined up with the
// others, and a person who drops out used to come back as a stranger
// with a second file, because they were known by their connection and
// a connection is new every time.
//
// The take here: the host records alone for five seconds, a guest
// joins, records, drops out, comes back, and everyone stops. What must
// come back is ONE audio file for that guest, the full length of the
// take, with silence in exactly two places - the front, and the middle.
//
//   node test/rejoin-track-test.mjs [url] [password]
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fsp from "node:fs/promises";
import { makeRoom, studioLogin, downloadRecordingFile, mediaSeconds, REPO } from "./helpers.mjs";
import { assembleTrack } from "../src/recording/splice.js";

const B = process.argv[2] || "http://127.0.0.1:3999";
const PW = process.argv[3] || "testpass123";
// Files are fetched over the download route rather than read out of
// the studio's data folder: a studio started with its own DATA_DIR
// keeps them somewhere this test has no business guessing, and a guess
// that misses looks exactly like a recording with no audio in it.
const DOWNLOADS = fs.mkdtempSync(path.join(os.tmpdir(), "fossstudio-rejoin-"));
const SCRATCH = path.join(DOWNLOADS, "parts");
const cookie = await studioLogin(B, PW);
const ROOM = await makeRoom(B, PW, "Rejoin test");

// The shape of the take, in milliseconds from the host pressing Record.
const GUEST_JOINS = 5000;
const GUEST_DROPS = 17000;
const GUEST_BACK = 27000;
const TAKE_ENDS = 39000;

let pass = true;
const check = (label, ok) => { console.log(`${ok ? "OK  " : "FAIL"} ${label}`); pass &&= ok; };

const probe = (file, entries) => spawnSync("ffprobe",
  ["-v", "error", "-show_entries", entries, "-of", "default=nw=1:nk=1", file],
  { encoding: "utf8" }).stdout.trim();

const silences = (file) => {
  const run = spawnSync("ffmpeg", ["-i", file, "-af", "silencedetect=n=-45dB:d=1", "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 1 << 28 });
  const starts = [...(run.stderr || "").matchAll(/silence_start: ([\d.-]+)/g)].map((m) => Number(m[1]));
  const ends = [...(run.stderr || "").matchAll(/silence_end: ([\d.-]+)/g)].map((m) => Number(m[1]));
  return starts.map((x, i) => ({ start: x, end: ends[i] ?? null }));
};

const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
         "--autoplay-policy=no-user-gesture-required"]
});

// One browser context per person: the guest's person id lives in that
// context's localStorage, which is exactly what has to survive the drop.
async function context(cam) {
  return browser.newContext({
    permissions: ["camera", "microphone"],
    viewport: { width: 1280, height: 800 }
  });
}

async function joinAs(ctx, name, asHost) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${name}] pageerror:`, e.message));
  await page.goto(`${B}/s/${ROOM}${asHost ? "?as=host" : ""}`);
  await page.waitForSelector("#joinBtn:not([disabled])");
  await page.fill("#nameInput", name);
  await page.click("#joinBtn");
  await page.waitForSelector("#session:not([hidden])");
  return page;
}

// ---------------------------------------------------------------
// Pass one: the silence itself, in both recording qualities.
//
// A real session cannot be measured for sound - the fake microphone a
// browser can be given delivers its samples to the first thing that
// asks, which in a session is the WebRTC sender - so the tone is
// recorded by the same MediaRecorder, in the same containers, and the
// parts are put together by the same code the server runs.
// ---------------------------------------------------------------
{
  const ctx = await browser.newContext({ permissions: ["microphone"] });
  const page = await ctx.newPage();
  await page.goto(`${B}/host/login.html`);
  fs.mkdirSync(SCRATCH, { recursive: true });

  for (const [label, mime, ext] of [
    ["best quality", "audio/webm;codecs=pcm", "wav"],
    ["smaller files", "audio/webm;codecs=opus", "opus"]
  ]) {
    const clips = await page.evaluate(async ({ mime, lengths }) => {
      const ac = new AudioContext({ sampleRate: 48000 });
      const out = [];
      for (const ms of lengths) {
        const dest = ac.createMediaStreamDestination();
        const tone = new OscillatorNode(ac, { frequency: 440 });
        tone.connect(dest);
        tone.start();
        const parts = [];
        const rec = new MediaRecorder(dest.stream, { mimeType: mime });
        rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
        const stopped = new Promise((r) => { rec.onstop = r; });
        rec.start(5000);
        await new Promise((r) => setTimeout(r, ms));
        rec.stop();
        await stopped;
        tone.stop();
        out.push(await new Promise((res) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result.split(",")[1]);
          fr.readAsDataURL(new Blob(parts, { type: mime }));
        }));
      }
      return out;
    }, { mime, lengths: [GUEST_DROPS - GUEST_JOINS, TAKE_ENDS - GUEST_BACK] });

    const files = clips.map((b64, i) => {
      const f = path.join(SCRATCH, `part-${i}.webm`);
      fs.writeFileSync(f, Buffer.from(b64, "base64"));
      return f;
    });
    const joined = path.join(SCRATCH, `joined.${ext}`);
    const built = await assembleTrack(fsp, [
      { file: files[0], offsetMs: GUEST_JOINS },
      { file: files[1], offsetMs: GUEST_BACK }
    ], joined);

    const dur = Number(probe(joined, "format=duration"));
    const quiet = silences(joined);
    console.log(`    ${label}: ${built.format}, ${dur.toFixed(2)}s, silence ` +
      `${quiet.map((q) => `${q.start.toFixed(2)}-${(q.end ?? dur).toFixed(2)}s`).join(", ") || "nowhere"}`);
    check(`${label}: the joined track is as long as the take ` +
      `(${dur.toFixed(2)}s against ${(TAKE_ENDS / 1000).toFixed(2)}s)`,
      Math.abs(dur - TAKE_ENDS / 1000) < 1.5);
    const lead = quiet.find((q) => q.start < 0.3);
    check(`${label}: ${(GUEST_JOINS / 1000).toFixed(1)}s of silence at the front ` +
      `(${lead ? (lead.end - lead.start).toFixed(2) : "none"}s)`,
      !!lead && Math.abs((lead.end - lead.start) - GUEST_JOINS / 1000) < 0.6);
    const away = (GUEST_BACK - GUEST_DROPS) / 1000;
    const middle = quiet.find((q) => q.start > 1);
    check(`${label}: ${away.toFixed(1)}s of silence in the middle, starting at ` +
      `${(GUEST_DROPS / 1000).toFixed(1)}s (${middle ? `${middle.start.toFixed(2)}s, ${(middle.end - middle.start).toFixed(2)}s` : "none"})`,
      !!middle && Math.abs(middle.start - GUEST_DROPS / 1000) < 1
        && Math.abs((middle.end - middle.start) - away) < 1);
    check(`${label}: exactly two stretches of silence, not three (${quiet.length})`, quiet.length === 2);
  }
  await ctx.close();
}

// ---------------------------------------------------------------
// Pass two: an ordinary take. Nobody joins late, nobody drops out, one
// person, stop.
//
// It goes first because if this is broken then nothing about joining
// late or reconnecting matters, and because a download that is the
// right length and full of samples is the thing every other check here
// rests on.
// ---------------------------------------------------------------
{
  const room = await makeRoom(B, PW, "Plain take");
  const ctx = await context();
  const login = await ctx.newPage();
  await login.goto(`${B}/host/login.html`);
  await login.fill("#username", "admin");
  await login.fill("#password", PW);
  await login.click("button[type=submit]");
  await login.waitForURL("**/host/");

  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[plain] pageerror:", e.message));
  await page.goto(`${B}/s/${room}?as=host`);
  await page.waitForSelector("#joinBtn:not([disabled])");
  await page.fill("#nameInput", "Solo");
  await page.click("#joinBtn");
  await page.waitForSelector("#session:not([hidden])");
  await page.waitForTimeout(1500);

  const began = Date.now();
  await page.click("#hpRecordBtn");
  await page.waitForTimeout(14000);
  await page.click("#hpRecordBtn");
  const secs = (Date.now() - began) / 1000;

  let filed = null;
  for (let i = 0; i < 45; i++) {
    const list = await login.evaluate(() => fetch("/api/recordings").then((r) => r.json()));
    filed = list.find((r) => r.roomId === room);
    if (filed && filed.status === "ready") break;
    await page.waitForTimeout(2000);
  }
  check(`a plain take is filed (status: ${filed?.status})`, filed?.status === "ready");
  const audio = (filed?.files || []).filter((f) => /-audio\./.test(f));
  check(`one audio file for the one person in the room (${audio.join(", ") || "none"})`, audio.length === 1);
  if (audio.length === 1) {
    const file = await downloadRecordingFile(B, cookie, filed.id, audio[0], DOWNLOADS);
    const bytes = fs.statSync(file).size;
    const dur = mediaSeconds(file);
    console.log(`    plain take: ${audio[0]} downloads as ${(bytes / 1e6).toFixed(1)} MB, ${dur.toFixed(2)}s`);
    // A header with nothing after it is what an assembler that never
    // wrote the recorded parts produces, so the size is checked as well
    // as the length.
    check(`the downloaded file holds actual audio, not just a header (${bytes} bytes)`, bytes > 100000);
    check(`a plain take is the full length (${dur.toFixed(2)}s against ${secs.toFixed(2)}s)`,
      Math.abs(dur - secs) < 1.5);
    check("nothing is said beside a track that had nothing happen to it",
      !(filed.notes || []).some((n) => n.file === audio[0]));
  }
  await ctx.close();
}

// ---------------------------------------------------------------
// Pass three: the whole product - a real room, a real take, a real drop.
// ---------------------------------------------------------------

const hostCtx = await context();
const login = await hostCtx.newPage();
await login.goto(`${B}/host/login.html`);
await login.fill("#username", "admin");
await login.fill("#password", PW);
await login.click("button[type=submit]");
await login.waitForURL("**/host/");

const hostPage = await joinAs(hostCtx, "Eric", true);
await hostPage.waitForTimeout(1500);

const t0 = Date.now();
await hostPage.click("#hpRecordBtn");
const since = () => Date.now() - t0;
const waitUntil = async (ms) => { const left = ms - since(); if (left > 0) await hostPage.waitForTimeout(left); };

// The guest keeps one browser context throughout, so the person id in
// its localStorage is the same on both joins - which is the whole point.
const guestCtx = await context();

await waitUntil(GUEST_JOINS);
let guest = await joinAs(guestCtx, "Nadia", false);
const joinedAt = since();

await waitUntil(GUEST_DROPS);
await guest.close();                       // the drop
const droppedAt = since();

await waitUntil(GUEST_BACK);
guest = await joinAs(guestCtx, "Nadia", false);
const backAt = since();

await waitUntil(TAKE_ENDS);
await hostPage.click("#hpRecordBtn");
const takeSecs = since() / 1000;
console.log(`    take ${takeSecs.toFixed(2)}s: Nadia joined at ${(joinedAt / 1000).toFixed(2)}s, ` +
  `dropped at ${(droppedAt / 1000).toFixed(2)}s, back at ${(backAt / 1000).toFixed(2)}s`);

let rec = null;
for (let i = 0; i < 60; i++) {
  const list = await login.evaluate(() => fetch("/api/recordings").then((r) => r.json()));
  rec = list.find((r) => r.roomId === ROOM);
  if (rec && rec.status === "ready") break;
  await hostPage.waitForTimeout(2000);
}
check(`recording filed (status: ${rec?.status})`, rec?.status === "ready");

const files = rec?.files || [];
const nadia = files.filter((f) => /^Nadia.*-audio\./.test(f));
console.log(`    Nadia's files: ${files.filter((f) => /^Nadia/.test(f)).join(", ") || "none"}`);
check(`one audio file for Nadia, not two (${nadia.length})`, nadia.length === 1);

if (nadia.length === 1) {
  const file = await downloadRecordingFile(B, cookie, rec.id, nadia[0], DOWNLOADS);
  const dur = mediaSeconds(file);
  console.log(`    ${nadia[0]} downloads as ${(fs.statSync(file).size / 1e6).toFixed(1)} MB, ` +
    `${dur.toFixed(2)}s long; the take was ${takeSecs.toFixed(2)}s`);
  // A second and a half covers the last chunk the recorder had not yet
  // handed over when Stop was pressed. Anything more is a short track.
  check(`the track is the full length of the take (short by ${(takeSecs - dur).toFixed(2)}s, allowed 1.5s)`,
    takeSecs - dur < 1.5 && dur > takeSecs - 1.5);

  const note = (rec.notes || []).find((n) => n.file === nadia[0]);
  console.log(`    note beside the file: ${note?.text || "none"}`);
  check("the dashboard says she joined late and dropped out",
    !!note && /Nadia/.test(note.text) && /joined/.test(note.text) && /dropped out/.test(note.text));
}

const eric = files.filter((f) => /^Eric.*-audio\./.test(f));
check(`one audio file for the host (${eric.length})`, eric.length === 1);
if (eric.length === 1) {
  const file = await downloadRecordingFile(B, cookie, rec.id, eric[0], DOWNLOADS);
  const dur = mediaSeconds(file);
  console.log(`    ${eric[0]} downloads as ${(fs.statSync(file).size / 1e6).toFixed(1)} MB, ${dur.toFixed(2)}s long`);
  check(`the host's track is the full length too (short by ${(takeSecs - dur).toFixed(2)}s)`,
    takeSecs - dur < 1.5);
}

// Nadia's camera comes back as one file per stretch, which is on
// purpose and not the same bug: silence can be manufactured from
// nothing and a picture cannot, and there is no encoder here to make
// one with. What the host must not have to work out for themselves is
// where each stretch belongs, so each one is told.
const nadiaVideo = files.filter((f) => /^Nadia.*-video/.test(f));
console.log(`    Nadia's camera: ${nadiaVideo.join(", ") || "none"}`);
check(`one camera file per stretch she recorded (${nadiaVideo.length})`, nadiaVideo.length === 2);
const placed = nadiaVideo.filter((f) => (rec.notes || []).some((n) => n.file === f && /into the take/.test(n.text)));
check(`each camera file is told where in the take it starts (${placed.length} of ${nadiaVideo.length})`,
  placed.length === nadiaVideo.length);

fs.rmSync(DOWNLOADS, { recursive: true, force: true });
console.log(pass ? "ALL PASS" : "SOME CHECKS FAILED");
await browser.close();
process.exit(pass ? 0 : 1);
