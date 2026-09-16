// Regression test for the Charlie bug: a guest who joins while the
// recording is already running must still upload their chunks.
import { chromium } from "playwright";
import { makeRoom, studioLogin, CAMS } from "./helpers.mjs";

const B = "http://127.0.0.1:3999";
const ROOM = await makeRoom(B, "test pass phrase 123");
const cookie = await studioLogin(B, "test pass phrase 123");

async function join(cam, name, asHost) {
  const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${CAMS}/${cam}`, "--autoplay-policy=no-user-gesture-required"] });
  const ctx = await browser.newContext({ permissions: ["camera", "microphone"], viewport: { width: 1400, height: 900 } });
  if (asHost) {
    const login = await ctx.newPage();
    await login.goto(`${B}/host/login.html`);
    await login.fill("#username", "admin");
    await login.fill("#password", "test pass phrase 123");
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
  return { browser, page };
}

const host = await join("vcam1.y4m", "Host", true);
await host.page.click("#hpRecordBtn");           // start recording, host alone
await host.page.waitForTimeout(3000);

const late = await join("vcam2.y4m", "Latecomer", false);  // joins mid-recording
await late.page.waitForTimeout(12000);           // long enough for 5s chunk uploads

await host.page.click("#hpRecordBtn");           // stop
await host.page.waitForTimeout(4000);

// The filed recording is what the host is handed, so that is what this
// looks at: one audio track each, named after the person.
const list = await fetch(`${B}/api/recordings`, { headers: { Cookie: cookie } }).then((r) => r.json());
const rec = list.find((r) => r.roomId === ROOM);
const audio = (rec?.files || []).filter((f) => /-audio\.(wav|opus|webm|mp4)$/i.test(f));
console.log("filed:", (rec?.files || []).join(", ") || "nothing");
const ok = audio.length === 2 && audio.some((f) => f.startsWith("Latecomer"));
console.log(ok ? "PASS  mid-recording joiner uploaded their track" : "FAIL  latecomer's track missing");
await host.browser.close();
await late.browser.close();
process.exit(ok ? 0 : 1);
