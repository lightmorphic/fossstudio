// A microphone that keeps failing to deliver must not shorten the file.
//
// This is the bug FOSSNerds hit on 5 September 2026: one person's track
// came back 24.6 seconds shorter than everybody else's, in 119 separate
// losses of about a fifth of a second each, spread through 74 minutes.
// The timestamps in the file were honest about where the holes were,
// but a decoder butts the audio either side of a hole together, so the
// track slid steadily earlier against the others as the show went on.
//
// The test runs in two passes, both against a microphone that keeps
// stopping.
//
// The first pass records that microphone the old way and the new way
// side by side, with nothing else in the room, and looks at the sound
// itself: the old file is short, the new one is the full length with
// silence exactly where the losses were.
//
// The second pass goes through the whole product - a real room, a real
// take, the host's Record button - and checks the file that comes back
// is not short. It cannot check the sound, because the fake microphone
// a browser can be given only delivers its samples to the first thing
// that asks, and in a real session that is the WebRTC sender. The
// timing is faithful, which is what this bug is about.
//   node test/mic-dropout-test.mjs [url] [password]
import { chromium } from "playwright";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { makeRoom, REPO } from "./helpers.mjs";

const B = process.argv[2] || "http://127.0.0.1:3999";
const PW = process.argv[3] || "testpass123";
const DATA = process.env.DATA_DIR || path.join(REPO, "data");
const ROOM = await makeRoom(B, PW, "Dropout test");

// The take, and the holes punched in the microphone during it. Five
// losses of 400ms is two seconds gone - loud enough to measure quickly,
// and the same shape as the real fault.
const TAKE_MS = 30000;
const GAP_MS = 400;
const GAPS = [4000, 9000, 14000, 19000, 24000];
const MISSING = (GAPS.length * GAP_MS) / 1000;

let pass = true;
const check = (label, ok) => { console.log(`${ok ? "OK  " : "FAIL"} ${label}`); pass &&= ok; };

// The microphone that fails. getUserMedia hands the page a track fed by
// hand from a wall clock, and during a gap nothing at all is written to
// it - which is what a starved capture device does. Everything else on
// the page is untouched, so this exercises the real recording path.
const FAKE_MIC = ({ takeMs, gapMs, gaps }) => `
(() => {
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const RATE = 48000, FRAME = 4800;          // 100ms a frame
  const TAKE = ${takeMs} + 20000, GAP = ${gapMs}, GAPS = ${JSON.stringify(gaps)};
  window.__micStartedAt = 0;
  function starving() {
    const gen = new MediaStreamTrackGenerator({ kind: "audio" });
    const w = gen.writable.getWriter();
    const t0 = performance.now();
    window.__micStartedAt = t0;
    let n = 0, ts = 0;
    const tick = async () => {
      const now = performance.now() - t0;
      if (now > TAKE) { try { await w.close(); } catch (e) { /* already closed */ } return; }
      const want = Math.floor(now / 100);
      while (n < want) {
        const at = n * 100;
        // the gaps are measured from the moment recording starts, which
        // the page tells us when it happens
        const rel = window.__recAt ? at - (window.__recAt - t0) : -1;
        const lost = rel >= 0 && GAPS.some((g) => rel >= g && rel < g + GAP);
        if (!lost) {
          const d = new Float32Array(FRAME);
          for (let i = 0; i < FRAME; i++) d[i] = 0.25 * Math.sin(2 * Math.PI * 440 * (ts + i) / RATE);
          await w.write(new AudioData({
            format: "f32-planar", sampleRate: RATE, numberOfFrames: FRAME,
            numberOfChannels: 1, timestamp: at * 1000, data: d
          }));
        }
        ts += FRAME;
        n++;
      }
      setTimeout(tick, 20);
    };
    tick();
    return gen;
  }
  navigator.mediaDevices.getUserMedia = async (c) => {
    const s = await real(c);
    if (!c || !c.audio) return s;
    for (const t of s.getAudioTracks()) { t.stop(); s.removeTrack(t); }
    s.addTrack(starving());
    return s;
  };
})();
`;

const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
         "--autoplay-policy=no-user-gesture-required"]
});
const ctx = await browser.newContext({ permissions: ["camera", "microphone"] });
await ctx.addInitScript(FAKE_MIC({ takeMs: TAKE_MS, gapMs: GAP_MS, gaps: GAPS }));

// Sample count of a file, the way an editor would weigh it: decode it
// and measure the audio. A container's timestamps can claim any length;
// what a listener hears is the samples.
const secondsOfBuffer = (buf) => {
  const run = spawnSync("ffmpeg", ["-v", "error", "-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", "48000", "-"],
    { input: buf, maxBuffer: 1 << 30 });
  return run.stdout.length / 2 / 48000;
};

// Where a file is quiet, so we can say a loss became silence rather
// than vanishing
const silencesIn = (file) => {
  // ffmpeg reports silencedetect on stderr, so read that rather than
  // the (empty) stdout
  const run = spawnSync("ffmpeg", ["-i", file, "-af", "silencedetect=n=-40dB:d=0.2", "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 1 << 28 });
  return [...(run.stderr || "").matchAll(/silence_start: ([\d.-]+)/g)].map((m) => Number(m[1]));
};

// ---------------------------------------------------------------
// Pass one: the two ways of recording a failing microphone, side by
// side, with nothing else in the room to take the samples first.
// ---------------------------------------------------------------
{
  const bench = await ctx.newPage();
  bench.on("pageerror", (e) => console.log("[bench] pageerror:", e.message));
  // A page of ours that asks for no media of its own, so nothing else
  // is reading the fake microphone while this pass measures it
  await bench.goto(`${B}/host/login.html`);
  const BENCH_MS = 16000;
  const BENCH_GAPS = [3000, 7000, 11000];
  const BENCH_LOST = (BENCH_GAPS.length * 400) / 1000;

  const files = await bench.evaluate(async ({ ms, gaps }) => {
    const RATE = 48000, FRAME = 4800;
    const make = () => {
      const gen = new MediaStreamTrackGenerator({ kind: "audio" });
      const w = gen.writable.getWriter();
      const t0 = performance.now();
      let n = 0, ts = 0;
      const tick = async () => {
        const now = performance.now() - t0;
        if (now > ms + 2000) return;
        const want = Math.floor(now / 100);
        while (n < want) {
          const at = n * 100;
          if (!gaps.some((g) => at >= g && at < g + 400)) {
            const d = new Float32Array(FRAME);
            for (let i = 0; i < FRAME; i++) d[i] = 0.25 * Math.sin(2 * Math.PI * 440 * (ts + i) / RATE);
            await w.write(new AudioData({ format: "f32-planar", sampleRate: RATE,
              numberOfFrames: FRAME, numberOfChannels: 1, timestamp: at * 1000, data: d }));
          }
          ts += FRAME; n++;
        }
        setTimeout(tick, 20);
      };
      tick();
      return gen;
    };

    const mime = "audio/webm;codecs=pcm";
    const record = (stream) => new Promise((resolve) => {
      const parts = [];
      const rec = new MediaRecorder(stream, { mimeType: mime });
      rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
      rec.onstop = async () => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result.split(",")[1]);
        fr.readAsDataURL(new Blob(parts, { type: mime }));
      };
      rec.start(5000);
      setTimeout(() => rec.stop(), ms);
    });

    // the old way: the device's track handed straight to the recorder
    const old = record(new MediaStream([make()]));
    // the new way: the same failing device through a Web Audio graph,
    // with a silent source running so the graph never falls idle
    const ac = new AudioContext({ sampleRate: 48000 });
    const dest = ac.createMediaStreamDestination();
    ac.createMediaStreamSource(new MediaStream([make()])).connect(dest);
    const keep = new ConstantSourceNode(ac, { offset: 0 });
    keep.connect(dest);
    keep.start();
    const fixed = record(dest.stream);
    return { old: await old, fixed: await fixed };
  }, { ms: BENCH_MS, gaps: BENCH_GAPS });

  await bench.close();

  const oldSecs = secondsOfBuffer(Buffer.from(files.old, "base64"));
  const fixedBuf = Buffer.from(files.fixed, "base64");
  const fixedSecs = secondsOfBuffer(fixedBuf);
  console.log(`    recording the track itself: ${oldSecs.toFixed(2)}s of samples; ` +
    `through the graph: ${fixedSecs.toFixed(2)}s (the take was ${(BENCH_MS / 1000).toFixed(2)}s, ` +
    `${BENCH_LOST.toFixed(2)}s was withheld)`);
  check(`recording the track itself loses the lot (${(BENCH_MS / 1000 - oldSecs).toFixed(2)}s gone)`,
    BENCH_MS / 1000 - oldSecs > BENCH_LOST * 0.8);
  check(`recording through the graph keeps the length (short by ${(BENCH_MS / 1000 - fixedSecs).toFixed(2)}s)`,
    BENCH_MS / 1000 - fixedSecs < 0.5);

  const tmp = path.join(DATA, "dropout-bench.webm");
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(tmp, fixedBuf);
  const quiet = silencesIn(tmp);
  fs.rmSync(tmp, { force: true });
  console.log(`    quiet from: ${quiet.map((t) => t.toFixed(2)).join("s, ") || "nowhere"}s`);
  const found = BENCH_GAPS.filter((g) => quiet.some((t) => Math.abs(t - g / 1000) < 1));
  check(`the lost audio is silence where it was lost (${found.length} of ${BENCH_GAPS.length})`,
    found.length === BENCH_GAPS.length);
}

// ---------------------------------------------------------------
// Pass two: the one way the padding could still lose audio. The graph
// keeps time only while its audio context is running, so a context that
// gets suspended mid-take takes the recording down with it. Nothing in
// the app suspends one, but a browser may, which is why the recording
// watches for it and wakes it back up.
// ---------------------------------------------------------------
{
  const bench = await ctx.newPage();
  bench.on("pageerror", (e) => console.log("[bench] pageerror:", e.message));
  await bench.goto(`${B}/host/login.html`);
  const secs = await bench.evaluate(async ({ wake }) => {
    const ac = new AudioContext({ sampleRate: 48000 });
    const dest = ac.createMediaStreamDestination();
    const tone = new OscillatorNode(ac, { frequency: 440 });
    tone.connect(dest);
    tone.start();
    const parts = [];
    const rec = new MediaRecorder(dest.stream, { mimeType: "audio/webm;codecs=pcm" });
    rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.start(5000);
    // the same watcher the recording runs, at the same interval
    const timer = wake ? setInterval(() => {
      if (ac.state !== "running") ac.resume().catch(() => {});
    }, 500) : null;
    setTimeout(() => ac.suspend().catch(() => {}), 4000);
    await new Promise((r) => setTimeout(r, 16000));
    clearInterval(timer);
    await ac.resume().catch(() => {});
    rec.stop();
    await stopped;
    const b64 = await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result.split(",")[1]);
      fr.readAsDataURL(new Blob(parts));
    });
    return b64;
  }, { wake: true });
  await bench.close();
  const kept = secondsOfBuffer(Buffer.from(secs, "base64"));
  console.log(`    a context suspended mid-take, woken again: ${kept.toFixed(2)}s of a 16.00s take`);
  check(`a suspended audio context is woken rather than lost (short by ${(16 - kept).toFixed(2)}s)`,
    16 - kept < 1.5);
}

// ---------------------------------------------------------------
// Pass three: the whole product - a real room, a real take.
// ---------------------------------------------------------------

const dash = await ctx.newPage();
await dash.goto(`${B}/host/login.html`);
await dash.fill("#username", "testhost");
await dash.fill("#password", "testhostpass123");
await dash.click("button[type=submit]");
await dash.waitForURL("**/host/");

const host = await ctx.newPage();
host.on("pageerror", (e) => console.log("[host] pageerror:", e.message));
// Join with noise suppression off. That matters: with it on, the
// microphone already passes through a Web Audio graph on its way to
// RNNoise, which hid this fault from everyone who left the default
// alone. The page's own crash-loop breaker is the way to ask for off.
await host.addInitScript(() => {
  try { localStorage.setItem("fossstudio-joining", "rnnoise"); } catch (e) { /* private browsing */ }
});
await host.goto(`${B}/s/${ROOM}?as=host`);
await host.waitForSelector("#joinBtn:not([disabled])");
await host.fill("#nameInput", "Eric");
await host.click("#joinBtn");
await host.waitForSelector("#session:not([hidden])");
await host.waitForTimeout(2000);

await host.click("#hpRecordBtn");
await host.evaluate(() => { window.__recAt = performance.now(); });
// Two thirds of the way through, three stalls have happened: the host
// should already have been told, by name, without waiting for the file
await host.waitForTimeout(Math.round(TAKE_MS * 0.7));
const live = await host.$eval("#hpMicTrouble", (el) => (el.hidden ? "" : el.textContent.trim()));
check(`the host is told during the take (${live || "nothing said"})`,
  /Eric/.test(live) && /second/.test(live));

await host.waitForTimeout(TAKE_MS - Math.round(TAKE_MS * 0.7));
await host.click("#hpRecordBtn");
// How long the recorder actually ran, measured in the page rather than
// from this side of the wire
const takeSecs = await host.evaluate(() => (performance.now() - window.__recAt) / 1000);

// Wait for the last chunks to land and the take to be filed
let rec = null;
for (let i = 0; i < 60; i++) {
  const list = await dash.evaluate(() => fetch("/api/recordings").then((r) => r.json()));
  rec = list.find((r) => r.roomId === ROOM);
  if (rec && rec.status === "ready") break;
  await host.waitForTimeout(2000);
}
check(`recording filed (status: ${rec?.status})`, rec?.status === "ready");

const secondsOf = (file) => secondsOfBuffer(fs.readFileSync(file));

const dir = path.join(DATA, "recordings", rec?.id || "", "out");
const audio = (rec?.files || []).find((f) => /^Eric.*-audio\.(webm|mp4)$/.test(f));
check(`Eric's track came back (${audio})`, !!audio);

if (audio) {
  const file = path.join(dir, audio);
  const secs = secondsOf(file);
  const short = takeSecs - secs;
  console.log(`    take ${takeSecs.toFixed(2)}s, file holds ${secs.toFixed(2)}s of samples, ` +
    `short by ${short.toFixed(2)}s (${MISSING.toFixed(2)}s was withheld from the microphone)`);
  // Half a second covers the ordinary slack between clicking record and
  // the recorder's first sample. Anything beyond that is lost audio.
  check(`the file is as long as the take (short by ${short.toFixed(2)}s, allowed 0.5s)`, short < 0.5);
}

// The programme the host's browser drew carries the same microphone, so
// it would slide the same way if the graph could starve
const everyone = (rec?.files || []).find((f) => /^everyone\.(webm|mp4)$/.test(f));
if (everyone) {
  const secs = secondsOf(path.join(dir, everyone));
  console.log(`    the combined video holds ${secs.toFixed(2)}s of audio`);
  check(`the combined video is as long as the take (short by ${(takeSecs - secs).toFixed(2)}s)`,
    takeSecs - secs < 0.5);
}

// The camera track: cameras stall too, and a short video file drifts
// against the audio in exactly the same way
const video = (rec?.files || []).find((f) => /^Eric.*-video\.(webm|mp4)$/.test(f));
if (video) {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-count_packets", "-show_entries", "stream=nb_read_packets,duration", "-of", "csv=p=0",
    path.join(dir, video)], { encoding: "utf8" });
  console.log(`    Eric's camera track: ${out.trim()}`);
}

// And the same thing said again beside the file, for the host who was
// not watching the panel at the time
const note = (rec?.notes || []).find((n) => /-audio\./.test(n.file));
console.log(`    note beside the file: ${note?.text || "none"}`);
check("the dashboard says which track lost audio and how much",
  !!note && /Eric/.test(note.text) && /\d+ (second|minute)/.test(note.text));

fs.rmSync(path.join(DATA, "recordings", rec?.id || "nothing"), { recursive: true, force: true });

console.log(pass ? "ALL PASS" : "SOME CHECKS FAILED");
await browser.close();
process.exit(pass ? 0 : 1);
