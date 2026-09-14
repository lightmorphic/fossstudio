import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Shared test helpers. There is one account: the suite starts a server
// with HOST_PASSWORD=testpass123 and signs in as that.
export const STUDIO = { username: "admin", password: "testpass123" };

// Paths, worked out from this file rather than written down, so a
// checkout that moves does not take the tests with it.
export const REPO = new URL("../../", import.meta.url).pathname;

// Fake camera clips (.y4m) for the tests that need moving faces. They
// are generated locally, not carried in the repo; point CAMS_DIR at
// wherever yours live.
export const CAMS = process.env.CAMS_DIR || `${REPO}server/test/cams`;

export async function apiLogin(base, password = STUDIO.password, username = STUDIO.username) {
  const res = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!res.ok) throw new Error(`test login failed for ${username}: ${res.status}`);
  return res.headers.get("set-cookie").split(";")[0];
}

export async function studioLogin(base, password = STUDIO.password) {
  return apiLogin(base, password);
}

export async function makeRoom(base, password = STUDIO.password, title = "Automated test") {
  const cookie = await studioLogin(base, password);
  const res = await fetch(`${base}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ title })
  });
  const session = await res.json();
  if (!session.id) throw new Error(`session create failed: ${JSON.stringify(session)}`);
  return session.id;
}

// A one-pixel PNG of a given color, for the tests that need an image to
// upload. Written here rather than generated, so the suite needs nothing
// installed beyond node and a browser.
export function solidPng(hex = "fbc711") {
  // A 1x1 truecolour PNG: header, IHDR, IDAT holding one raw pixel, IEND.
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const crcTable = [...Array(256)].map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit truecolour
  // one scanline: filter byte 0, then the pixel - stored uncompressed in
  // a zlib block, so there is no deflate to write
  const raw = Buffer.from([0, ...rgb]);
  const z = Buffer.concat([
    Buffer.from([0x78, 0x01, 0x01]),
    Buffer.from([raw.length & 0xff, raw.length >> 8, ~raw.length & 0xff, (~raw.length >> 8) & 0xff]),
    raw,
    (() => {
      let a = 1, b = 0;
      for (const x of raw) { a = (a + x) % 65521; b = (b + a) % 65521; }
      const ad = Buffer.alloc(4);
      ad.writeUInt32BE(((b << 16) | a) >>> 0);
      return ad;
    })()
  ]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", z), chunk("IEND", Buffer.alloc(0))
  ]);
}

// Load a recording in a real <video> element and read it back: how long
// it is, how big, and the average color of a box at a moment. The
// browser is the decoder, so the suite needs no media tools at all - and
// what it proves is the thing that matters, that the file the host
// downloads actually plays.
export async function probeMedia(page, url, { at = 5, crop = null } = {}) {
  return page.evaluate(async ({ url, at, crop }) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    // In the document, or the browser may never decode a frame to draw
    v.style.cssText = "position:fixed;left:-9999px;width:320px";
    document.body.appendChild(v);
    v.src = url;
    const ready = new Promise((resolve, reject) => {
      v.onloadeddata = resolve;
      v.onerror = () => reject(new Error("the browser could not play it"));
      setTimeout(() => reject(new Error("timed out loading")), 20000);
    });
    try {
      await ready;
    } catch (err) {
      v.remove();
      return { ok: false, error: err.message };
    }
    // Grab the frame by playing up to the moment wanted, not by seeking:
    // a WebM written by MediaRecorder has no index, so a seek can leave
    // the decoder with nothing to draw. Play, pause, draw.
    const out = { ok: true, width: v.videoWidth, height: v.videoHeight };
    if (crop && v.videoWidth) {
      try {
        await v.play();
        const until = Date.now() + 30000;
        while (v.currentTime < at && !v.ended && Date.now() < until) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        v.pause();
      } catch { /* drawn from wherever it got to */ }
      const c = document.createElement("canvas");
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext("2d").drawImage(v, 0, 0);
      const d = c.getContext("2d").getImageData(crop.x, crop.y, crop.w, crop.h).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      out.rgb = [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
      out.at = v.currentTime;
    }

    // A WebM the browser wrote while recording often has no duration in
    // its header; seeking far past the end makes the browser work it out.
    if (!isFinite(v.duration)) {
      await new Promise((resolve) => {
        v.onseeked = resolve;
        v.currentTime = 1e6;
        setTimeout(resolve, 3000);
      });
    }
    out.duration = isFinite(v.duration) ? v.duration : 0;
    v.remove();
    return out;
  }, { url, at, crop });
}

// Fetch a finished recording's file the way the host does - over the
// download route, signed in - and hand back a path on disk.
//
// Tests used to reach straight into the data directory for these,
// guessing where the studio keeps its files. That guess is wrong the
// moment a studio is started with a DATA_DIR of its own, and the
// failure was silent in the worst way: ffprobe prints nothing for a
// file that is not there, Number("") is 0, and a missing file came
// back looking exactly like a recording with no audio in it.
// Downloading is both honest and the better test, because it is the
// road a person actually uses.
export async function downloadRecordingFile(base, cookie, recId, file, intoDir) {
  const url = `${base}/api/recordings/${encodeURIComponent(recId)}/files/${encodeURIComponent(file)}`;
  const res = await fetch(url, { headers: { Cookie: cookie } });
  if (!res.ok) throw new Error(`downloading ${file} failed: ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  if (!body.length) throw new Error(`${file} downloaded as nothing at all`);
  fs.mkdirSync(intoDir, { recursive: true });
  const out = path.join(intoDir, file);
  fs.writeFileSync(out, body);
  return out;
}

// How long a media file is, according to ffprobe. Throws rather than
// returning zero when there is no file or no answer: "0.00 seconds" is
// what an empty recording looks like, and a test must never confuse the
// two.
export function mediaSeconds(file) {
  const run = spawnSync("ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
    { encoding: "utf8" });
  const text = (run.stdout || "").trim();
  if (run.status !== 0 || !text || Number.isNaN(Number(text))) {
    throw new Error(`ffprobe could not measure ${file}: ${(run.stderr || "it said nothing").trim()}`);
  }
  return Number(text);
}

// ---------- Screenshots ----------
//
// The website's pictures and the help page's pictures are taken the same
// way: real browsers with fake cameras, joining a real studio. This used
// to live only in site-shots.mjs, and the help page would have had to
// copy it; a copy is how the website's shots went a fortnight stale the
// last time, so there is one of it.

// A browser holding one person, parked on the join screen with their
// name typed in. The camera is a clip from CAMS rather than Chrome's own
// spinning ball, so the pictures have faces in them.
export async function shotStudio(chromium, base, {
  cam, name, tagline, sessionId, asHost = false,
  viewport = { width: 1560, height: 975 }
}) {
  const browser = await chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-video-capture=${CAMS}/${cam}`,
      "--autoplay-policy=no-user-gesture-required"
    ]
  });
  const ctx = await browser.newContext({
    permissions: ["camera", "microphone"],
    viewport,
    deviceScaleFactor: 2
  });
  if (asHost) {
    const login = await ctx.newPage();
    await login.goto(`${base}/host/login.html`);
    await login.fill("#username", STUDIO.username);
    await login.fill("#password", STUDIO.password);
    await login.click("button[type=submit]");
    await login.waitForURL("**/host/");
    await login.close();
  }
  const page = await ctx.newPage();
  await page.goto(`${base}/s/${sessionId}${asHost ? "?as=host" : ""}`);
  await page.waitForSelector("#joinBtn:not([disabled])");
  if (name) await page.fill("#nameInput", name);
  if (tagline) await page.fill("#taglineInput", tagline);
  return { browser, page };
}

export async function joinAll(list) {
  for (const s of list) {
    await s.page.click("#joinBtn");
    await s.page.waitForSelector("#session:not([hidden])");
  }
}

// PNG in, JPEG out, at a width we choose. The browser is the converter,
// so the suite still needs nothing installed; the PNG is removed, which
// is the step somebody used to have to remember.
export async function pngToJpeg(page, png, jpg, width = 2000, quality = 0.86) {
  const b64 = await page.evaluate(async ({ data, width, quality }) => {
    const img = new Image();
    img.src = "data:image/png;base64," + data;
    await img.decode();
    const w = Math.min(width, img.width);
    const h = Math.round(img.height * (w / img.width) / 2) * 2;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    return c.toDataURL("image/jpeg", quality).split(",")[1];
  }, { data: fs.readFileSync(png).toString("base64"), width, quality });
  fs.writeFileSync(jpg, Buffer.from(b64, "base64"));
  fs.unlinkSync(png);
}
