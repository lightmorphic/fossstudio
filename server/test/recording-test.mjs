// Full recording test: host and guest join, the host records for about
// twelve seconds and stops, and we check what comes back - a track per
// person and one video of everyone, each playable, with the banners and
// the title block in the picture.
//   node test/recording-test.mjs [url] [password]
import { chromium } from "playwright";
import { makeRoom, probeMedia } from "./helpers.mjs";

const B = process.argv[2] || "http://127.0.0.1:3999";
const PW = process.argv[3] || "test pass phrase 123";
const ROOM = await makeRoom(B, PW);

const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"]
});

let pass = true;
const check = (label, ok) => { console.log(`${ok ? "OK  " : "FAIL"} ${label}`); pass &&= ok; };

// Host logs in, sets the recording mode, joins as host
const hostCtx = await browser.newContext({ permissions: ["camera", "microphone"] });
const dash = await hostCtx.newPage();
await dash.goto(`${B}/host/login.html`);
await dash.fill("#username", "admin");
await dash.fill("#password", "test pass phrase 123");
await dash.click("button[type=submit]");
await dash.waitForURL("**/host/");
// The formats this test expects, said out loud rather than inherited
// from whatever ran before it.
await dash.evaluate(() => fetch("/api/settings", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    showFormat: "mp4", separateFiles: true,
    audioFormats: ["wav"], cameraFormats: ["mp4"]
  })
}));


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

const host = await join(hostCtx, "Charlie Host", true);
const guestCtx = await browser.newContext({ permissions: ["camera", "microphone"] });
const guest = await join(guestCtx, "Guest Greta", false);
await new Promise((r) => setTimeout(r, 2000));

// Turn the shared banner red so its pixels are easy to probe later
// The color tools sit behind a button since the panel redesign
await host.click('#hpBannerColorsBtn');
await host.click('.hp-swatch[aria-label="Banner color #f34236"]');
await new Promise((r) => setTimeout(r, 500));

await host.click("#hpRecordBtn");
await new Promise((r) => setTimeout(r, 2500));
check("host's recording light is on",
  await host.$eval("#recLight", (el) => el.classList.contains("on")));
check("guest's recording light is on",
  await guest.$eval("#recLight", (el) => el.classList.contains("on")));

// Record for a while, then stop
await new Promise((r) => setTimeout(r, 12000));
await host.click("#hpRecordBtn");
await new Promise((r) => setTimeout(r, 2000));
check("guest's recording light back to gray",
  await guest.$eval("#recLight", (el) => !el.classList.contains("on")));

// Wait for the last chunks to land and the take to be filed
let rec = null;
for (let i = 0; i < 60; i++) {
  const list = await dash.evaluate(() => fetch("/api/recordings").then((r) => r.json()));
  rec = list.find((r) => r.roomId === ROOM);
  if (rec && rec.status === "ready") break;
  await new Promise((r) => setTimeout(r, 2000));
}
check(`recording filed (status: ${rec?.status})`, rec?.status === "ready");
const files = rec?.files || [];
const audio = files.filter((f) => /-audio\.(wav|opus|webm|mp4)$/.test(f));
const video = files.filter((f) => /-video\.(webm|mp4)$/.test(f));
const everyone = files.find((f) => /^everyone\.(webm|mp4)$/.test(f));
check(`an audio track per person (${audio.join(", ")})`, audio.length === 2);
check(`a camera track per person (${video.join(", ")})`, video.length === 2);
check(`one video of everyone (${everyone})`, !!everyone);

// MP4 wherever the browser can write one, which is every Chromium and
// Edge. Firefox records no MP4 at all and its files end .webm, so this
// asks the browser first rather than insisting.
const canMp4 = await host.evaluate(() =>
  ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1,opus", "video/mp4;codecs=avc1"]
    .some((t) => MediaRecorder.isTypeSupported(t)));
if (canMp4) {
  check("the video files are MP4, not WebM",
    files.filter((f) => /\.(mp4|webm)$/i.test(f)).every((f) => f.endsWith(".mp4")));
}
check(`tracks are named after the people (${audio.join(", ")})`,
  audio.some((f) => f.startsWith("Charlie Host")) && audio.some((f) => f.startsWith("Guest Greta")));
check(`recording named after the episode (${rec?.title})`, rec?.title === "Automated test");

// Nothing on the server touched any of it: no leftover working
// directory, and no file the browsers did not send
if (rec) {
  const strays = files.filter((f) =>
    !/-audio\.(wav|opus|webm|mp4)$/.test(f) && !/-video\.(webm|mp4)$/.test(f) && !/^everyone\.(webm|mp4)$/.test(f));
  check(`nothing but the recorded tracks came back (${strays.join(", ") || "none"})`, strays.length === 0);
}

// Play each one back in the browser. That is the check that matters -
// the host is handed the file the browser wrote, so what proves it is
// good is that a browser opens it.
if (rec?.status === "ready") {
  const player = await hostCtx.newPage();
  await player.goto(`${B}/host/`);
  for (const f of rec.files) {
    const url = `/api/recordings/${encodeURIComponent(rec.id)}/files/${encodeURIComponent(f)}`;
    const probe = await probeMedia(player, url);
    check(`${f} plays, ${probe.duration?.toFixed(1)}s${probe.width ? `, ${probe.width}x${probe.height}` : ""}`,
      probe.ok && probe.duration > 8);
  }

  // The episode title block sits top-center of the combined picture, and
  // the lower-third is the red we picked: both drawn by the host's
  // browser, so finding them proves the mixer put them in the video.
  const url = `/api/recordings/${encodeURIComponent(rec.id)}/files/${encodeURIComponent(everyone)}`;
  // Not "anything but the camera": a frame with no block on it at all is
  // black there, and black passed that. The block's own background is a
  // dark gray, so this asks for gray - three channels close together and
  // none of them at the ends.
  const title = await probeMedia(player, url, { at: 5, crop: { x: 620, y: 40, w: 40, h: 10 } });
  const [tr, tg, tb] = title.rgb || [];
  check(`episode title drawn top-center (rgb ${title.rgb})`,
    title.ok && Math.max(tr, tg, tb) - Math.min(tr, tg, tb) < 30 && tr > 12 && tr < 120);
  const banner = await probeMedia(player, url, { at: 5, crop: { x: 40, y: 505, w: 30, h: 8 } });
  check(`name banner drawn into the video (rgb ${banner.rgb})`,
    banner.ok && banner.rgb[0] > 140 && banner.rgb[0] - banner.rgb[1] > 60 && banner.rgb[0] - banner.rgb[2] > 60);
  await player.close();
}

console.log(pass ? "ALL PASS" : "SOME CHECKS FAILED");
await browser.close();
process.exit(pass ? 0 : 1);
