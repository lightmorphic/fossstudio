// Several formats at once: the studio asks for two sound formats and
// two picture formats, and every one of them comes back as its own file
// with nothing landing on top of anything else.
//   node test/formats-test.mjs [url]
import { chromium } from "playwright";
import { makeRoom, studioLogin, downloadRecordingFile, mediaSeconds, CAMS } from "./helpers.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fossstudio-formats-test-"));

const B = process.argv[2] || "http://127.0.0.1:3999";
let pass = true;
const check = (l, ok) => { console.log(`${ok ? "OK  " : "FAIL"} ${l}`); pass &&= ok; };

const cookie = await studioLogin(B, "testpass123");
await fetch(`${B}/api/settings`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ audioFormats: ["wav", "opus"], videoFormats: ["mp4", "vp8"] })
});
const ROOM = await makeRoom(B, "testpass123");

const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-video-capture=${CAMS}/vcam1.y4m`, "--autoplay-policy=no-user-gesture-required"]
});
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
await host.click("#hpRecordBtn");
await new Promise((r) => setTimeout(r, 12000));
await host.click("#hpRecordBtn");
await new Promise((r) => setTimeout(r, 2500));

let rec = null;
for (let i = 0; i < 60; i++) {
  const list = await fetch(`${B}/api/recordings`, { headers: { Cookie: cookie } }).then((r) => r.json());
  rec = list.find((r) => r.roomId === ROOM);
  if (rec && rec.status === "ready") break;
  await new Promise((r) => setTimeout(r, 2000));
}
const files = rec?.files || [];
console.log("   ", files.join(", "));
check("recording filed", rec?.status === "ready");

// Two sound formats a person: named by format, because more than one
// was asked for, so neither can land on the other.
for (const who of ["Host", "Greta"]) {
  check(`${who} has a WAV track`, files.includes(`${who}-audio-wav.wav`));
  check(`${who} has an Opus track`, files.includes(`${who}-audio-opus.opus`));
  check(`${who}'s camera came back in both picture formats`,
    files.includes(`${who}-video-mp4.mp4`) && files.includes(`${who}-video-vp8.webm`));
}
check("the show came back in both picture formats",
  files.includes("everyone-mp4.mp4") && files.includes("everyone-vp8.webm"));
check("nothing else came back", files.length === 10);

// Every one of them has to be a real file, not a name in a list.
for (const f of files) {
  const local = await downloadRecordingFile(B, cookie, rec.id, f, DIR);
  const secs = mediaSeconds(local);
  check(`${f} plays (${secs.toFixed(1)}s)`, secs > 8);
}
// Put the studio back the way it was found. A test that leaves a
// setting behind is a test that breaks the next one, which is exactly
// how this suite wasted an afternoon.
await fetch(`${B}/api/settings`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ audioFormats: ["wav"], videoFormats: ["mp4"] })
});
console.log(pass ? "ALL PASS" : "SOME CHECKS FAILED");
await browser.close();
process.exit(pass ? 0 : 1);
