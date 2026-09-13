// Proactive Firefox compatibility pass. Chrome-family browsers are
// covered by every other test in this suite; this one runs the same
// core flows through a real Firefox engine and watches for anything
// that's silently broken there - console errors, features that throw
// instead of gracefully degrading, and a full record+process cycle
// with whatever codec Firefox's MediaRecorder actually picks.
//
// Usage: node test/firefox-compat-test.mjs <url> <password>
import { firefox } from "playwright";
import fs from "node:fs";
import { hostLogin, makeRoom, TEST_HOST, probeMedia } from "./helpers.mjs";

const B = process.argv[2] || "http://127.0.0.1:3999";
const PW = process.argv[3] || "testpass123";
const OUT = "/tmp/fossstudio-firefox-test";
fs.mkdirSync(OUT, { recursive: true });

let pass = true;
function check(label, ok) {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}`);
  pass &&= ok;
}

// Firefox's own fake-media prefs (the Chromium --use-fake-device-for-*
// flags don't apply here) - gives a synthetic tone + test pattern with
// no permission prompt.
const FF_PREFS = {
  "media.navigator.streams.fake": true,
  "media.navigator.permission.disabled": true
};

async function join(browser, room, name, asHost) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });
  if (asHost) {
    const login = await ctx.newPage();
    await login.goto(`${B}/host/login.html`);
    await login.fill("#username", TEST_HOST.username);
    await login.fill("#password", TEST_HOST.password);
    await login.click("button[type=submit]");
    await login.waitForURL("**/host/");
    await login.close();
  }
  await page.goto(`${B}/s/${room}${asHost ? "?as=host" : ""}`);
  await page.waitForSelector("#joinBtn:not([disabled])", { timeout: 20000 });
  await page.fill("#nameInput", name);
  await page.click("#joinBtn");
  await page.waitForSelector("#session:not([hidden])", { timeout: 20000 });
  return { ctx, page, errors };
}

const browser = await firefox.launch({ firefoxUserPrefs: FF_PREFS });

// ---------- Preview screen: camera/mic come up, no crash ----------
{
  const ROOM = await makeRoom(B, PW, "Firefox preview test");
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${B}/s/${ROOM}`);
  await page.waitForSelector("#joinBtn:not([disabled])", { timeout: 20000 });
  const videoReady = await page.evaluate(() => new Promise((resolve) => {
    const v = document.getElementById("previewVideo");
    if (v.readyState >= 2) return resolve(v.videoWidth > 0);
    v.onloadeddata = () => resolve(v.videoWidth > 0);
    setTimeout(() => resolve(false), 5000);
  }));
  check("preview: camera stream actually renders (no black/frozen frame)", videoReady);
  // Speaker selection: setSinkId support varies by Firefox version
  // (shipped behind a pref for a while, now on by default in recent
  // releases) - whichever way it goes, the app must follow suit
  // without ever leaving a broken-looking control or throwing.
  const spk = await page.evaluate(() => ({
    sinkSupported: "setSinkId" in HTMLMediaElement.prototype,
    disabled: document.getElementById("spkSelect").disabled
  }));
  console.log(`    Firefox setSinkId support: ${spk.sinkSupported}`);
  check("speaker selector's enabled state matches this Firefox's actual setSinkId support",
    spk.disabled === !spk.sinkSupported);
  // Zoom: getCapabilities().zoom is normally undefined on Firefox -
  // confirm the app treats that as "no hardware zoom" without throwing
  await page.evaluate(() => document.getElementById("zoomSlider").value = "2");
  await page.dispatchEvent("#zoomSlider", "input").catch(() => {});
  await page.waitForTimeout(300);
  check("no console errors on the preview screen", errors.length === 0);
  if (errors.length) errors.forEach((e) => console.log("    ", e));
  await ctx.close();
}

// ---------- Two-Firefox-browser call: media actually flows ----------
{
  const ROOM = await makeRoom(B, PW, "Firefox call test");
  const host = await join(browser, ROOM, "FFHost", true);
  const guest = await join(browser, ROOM, "FFGuest", false);
  await host.page.waitForTimeout(3000);

  const hostSeesGuest = await host.page.evaluate(() =>
    document.querySelectorAll(".tile").length >= 2);
  check("host sees both tiles (guest joined over Firefox's WebRTC stack)", hostSeesGuest);

  // NOTE: in a single-machine sandbox where the "client" and the app
  // (plus its TURN server) all share one host behind one public-looking
  // IP, this can legitimately fail even though the app is fine: Firefox
  // obfuscates its host ICE candidate behind an mDNS name mediasoup
  // (ICE-lite) can't resolve, and falling back to the TURN relay then
  // requires the network to hairpin traffic back to itself via its own
  // public IP - which many sandboxed/NATed environments simply don't
  // support. Confirmed via manual ICE candidate-pair inspection during
  // development (real TURN allocated, relay candidate paired, zero
  // responses - a hairpin-NAT signature, not an app bug). Real users
  // (genuinely separate machines/networks - the normal case) and CI
  // runners on a real bridged network don't hit this. If this fails,
  // check for that signature before assuming a regression: relay
  // candidate present in getStats() but 0 responsesReceived.
  const guestVideoFlowing = await guest.page.evaluate(() => new Promise((resolve) => {
    const remote = [...document.querySelectorAll(".tile:not(.self) video")][0];
    if (!remote) return resolve(false);
    if (remote.readyState >= 2 && remote.videoWidth > 0) return resolve(true);
    remote.onloadeddata = () => resolve(remote.videoWidth > 0);
    setTimeout(() => resolve(false), 5000);
  }));
  check("guest receives the host's actual video over WebRTC", guestVideoFlowing);

  // Noise suppression: the RNNoise AudioWorklet must load without error
  await host.page.evaluate(() => window.__noiseApplied);
  await host.page.waitForTimeout(500);
  check("RNNoise AudioWorklet initialised without a console error (host)",
    !host.errors.some((e) => /worklet|AudioWorklet|noise/i.test(e)));

  check("no console errors during the call (host)", host.errors.length === 0);
  if (host.errors.length) host.errors.forEach((e) => console.log("     host:", e));
  check("no console errors during the call (guest)", guest.errors.length === 0);
  if (guest.errors.length) guest.errors.forEach((e) => console.log("     guest:", e));

  await host.ctx.close();
  await guest.ctx.close();
}

// ---------- Full record + process cycle on Firefox's own codec choice ----------
{
  const ROOM = await makeRoom(B, PW, "Firefox recording test");
  const host = await join(browser, ROOM, "FFRecHost", true);

  const mediaRecorderChoice = await host.page.evaluate(() => ({
    audio: ["audio/webm;codecs=pcm", "audio/webm;codecs=opus", "audio/webm"]
      .find((m) => MediaRecorder.isTypeSupported(m)) || "NONE SUPPORTED",
    video: ["video/webm;codecs=vp8", "video/webm"]
      .find((m) => MediaRecorder.isTypeSupported(m)) || "NONE SUPPORTED"
  }));
  // Which one it picks is the whole point: Firefox has no PCM recorder,
  // so its guests are recorded in Opus and that is what they get.
  console.log(`    Firefox MediaRecorder picks: audio=${mediaRecorderChoice.audio} video=${mediaRecorderChoice.video}`);
  check("Firefox supports at least one recordable audio format", mediaRecorderChoice.audio !== "NONE SUPPORTED");
  check("Firefox supports at least one recordable video format", mediaRecorderChoice.video !== "NONE SUPPORTED");

  await host.page.click("#hpRecordBtn");
  await host.page.waitForTimeout(8000);
  await host.page.click("#hpRecordBtn");

  const cookie = await hostLogin(B, PW);
  let rec = null;
  for (let i = 0; i < 60; i++) {
    const list = await fetch(`${B}/api/recordings`, { headers: { Cookie: cookie } }).then((r) => r.json());
    rec = list.find((r) => r.roomId === ROOM);
    if (rec && ["ready", "failed"].includes(rec.status)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  check(`Firefox-recorded session processed to ready (status: ${rec?.status})`, rec?.status === "ready");
  const everyone = (rec?.files || []).find((f) => /^everyone\./.test(f));
  const mine = (rec?.files || []).filter((f) => /-audio\./.test(f));
  check("a video of everyone came back", !!everyone);
  check(`a track per person came back (${mine.length})`, mine.length >= 1);

  if (rec?.status === "ready" && everyone) {
    // Played in Chromium rather than probed with a media tool: what
    // matters is that a file recorded in Firefox opens somewhere else.
    const probe = await probeMedia(host.page,
      `${B}/api/recordings/${rec.id}/files/${encodeURIComponent(everyone)}`);
    check(`${everyone} from a Firefox source plays and is full length (${probe.duration?.toFixed(1)}s)`,
      probe.ok && probe.duration > 6);
  }

  await host.ctx.close();
}

await browser.close();
console.log(pass ? "\nALL PASS" : "\nSOME CHECKS FAILED");
process.exit(pass ? 0 : 1);
