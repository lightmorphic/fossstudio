// The help page's pictures, taken from the real studio.
//
// Charlie, 14 September 2026: "The help page is just a wall of text ...
// Can we add images, screenshots? Make it something that makes it easier
// for people to understand."
//
// They are made the same way the website's shots are (server/test/site-shots.mjs,
// same helpers), and for the same reason: a picture drawn by hand rots
// the first time a screen changes, and nobody notices. These are the
// product itself, so running this again after a change makes them true
// again.
//
// They are written into web/img/help rather than docs/shots because the
// studio has to serve them itself - a help page that fetches an image
// from a website is no use on a box with no internet, and help-test.mjs
// fails the page if anything on it comes from another machine.
//
//   node test/help-shots.mjs [url] [password]
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { studioLogin, shotStudio, joinAll, pngToJpeg, STUDIO, REPO } from "./helpers.mjs";

const B = process.argv[2] || "http://127.0.0.1:3999";
const PW = process.argv[3] || STUDIO.password;
const OUT = `${REPO}web/img/help`;
fs.mkdirSync(OUT, { recursive: true });

const cookie = await studioLogin(B, PW);
const mk = (title) => fetch(`${B}/api/sessions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ title })
}).then((r) => r.json());

// One browser does all the converting at the end.
const shots = [];
const keep = (name, width = 1400) => {
  shots.push([name, width]);
  return `${OUT}/${name}.png`;
};

// ---------- A session: the join screen and the host panel ----------

const room = await mk("Episode 42: Live From FOSDEM");

// The join screen, where a guest picks their camera and microphone. A
// person who has never been here before sees this one first.
const joiner = await shotStudio(chromium, B, {
  cam: "vcam7.y4m", name: "Margot", tagline: "Tech author", sessionId: room.id,
  viewport: { width: 1100, height: 900 }
});
await joiner.page.waitForTimeout(1500);
// The fake camera is named after the clip file on whichever machine took
// the picture, and a device list reading /home/... is noise rather than
// product. The names are put back to ordinary ones; nothing else in the
// shot is touched.
await joiner.page.evaluate(() => {
  const rename = (id, names) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    [...sel.options].forEach((o, i) => { o.textContent = names[i] || names[names.length - 1]; });
  };
  rename("camSelect", ["Logitech StreamCam"]);
  rename("micSelect", ["Shure MV7 microphone"]);
  rename("spkSelect", ["Headphones"]);
});
await joiner.page.waitForTimeout(200);
await (await joiner.page.$(".preview-card")).screenshot({ path: keep("join", 1100) });
await joiner.browser.close();

// The host panel, open, in a room with people in it.
const hp = [
  await shotStudio(chromium, B, { cam: "vcam1.y4m", name: "Anna", tagline: "awesomepodcast.org", sessionId: room.id, asHost: true }),
  await shotStudio(chromium, B, { cam: "vcam2.y4m", name: "Dev", tagline: "Kernel maintainer", sessionId: room.id }),
  await shotStudio(chromium, B, { cam: "vcam3.y4m", name: "Rob", tagline: "selfhosted.town", sessionId: room.id })
];
await joinAll(hp);
await hp[0].page.waitForTimeout(4000);
// The panel is open by default for a host; make sure, and get the
// pointer out of the way or a tooltip lands in the middle of the shot.
if (await hp[0].page.$("#hostPanel[hidden]")) await hp[0].page.click("#hpToggle");
await hp[0].page.mouse.move(5, 5);
await hp[0].page.waitForTimeout(1200);
await hp[0].page.screenshot({ path: keep("host-panel", 1600) });

// Record a short take before everybody leaves, so the picture of the
// Recordings screen has a real take in it with a real episode title
// rather than whatever an earlier test left behind.
await hp[0].page.click("#hpRecordBtn");
await hp[0].page.waitForTimeout(9000);
await hp[0].page.click("#hpRecordBtn");
await hp[0].page.waitForTimeout(3000);
for (const s of hp) await s.browser.close();

// The take is filed once the last chunks have landed.
for (let i = 0; i < 40; i++) {
  const list = await fetch(`${B}/api/recordings`, { headers: { Cookie: cookie } }).then((r) => r.json());
  if (list.some((r) => r.roomId === room.id && r.status === "ready")) break;
  await new Promise((r) => setTimeout(r, 2000));
}

// ---------- The dashboard screens ----------

const plain = await chromium.launch();
const dctx = await plain.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
const dash = await dctx.newPage();
await dash.goto(`${B}/host/login.html`);
await dash.fill("#username", STUDIO.username);
await dash.fill("#password", PW);
await dash.click("button[type=submit]");
await dash.waitForURL("**/host/");
await dash.waitForTimeout(700);

// Only the content column: the menus are in the picture of the whole
// dashboard and repeating them in every shot wastes the width.
async function pane(hash, name, { fill = false } = {}) {
  await dash.goto(`${B}/host/${hash}`);
  await dash.waitForTimeout(fill ? 900 : 500);
  const el = await dash.$(".content section:not([hidden])");
  await el.screenshot({ path: keep(name) });
}

// Where the public address lives, which is the one setting that decides
// whether anybody hears anything.
await dash.goto(`${B}/host/#settings/place`);
await dash.waitForTimeout(700);
await dash.fill("#placeDomain", "studio.example.com");
await dash.fill("#placePublicIp", "203.0.113.10");
await dash.waitForTimeout(200);
await (await dash.$(".content section:not([hidden])")).screenshot({ path: keep("settings-address") });

// The formats, cut under the first question and the top of the second:
// that is the shape of the screen, and a screenshot shrunk into a
// column is only worth having if the words in it can still be read.
await dash.goto(`${B}/host/#settings/recording`);
await dash.waitForTimeout(800);
await dash.screenshot({
  path: keep("settings-quality"),
  clip: await dash.evaluate(() => {
    const panel = document.querySelector("#pane-recording .panel").getBoundingClientRect();
    const rows = document.querySelectorAll("#showFormat .fmt-row");
    const cut = rows[1].getBoundingClientRect().bottom;
    return { x: panel.x, y: panel.y, width: panel.width, height: cut + 20 - panel.y };
  })
});
// Recordings, cut off under the first take. A studio that has been used
// for a while has a screenful of them, and the picture only has to show
// what one take holds.
await dash.goto(`${B}/host/#recordings/library`);
await dash.waitForTimeout(1200);
const box = await dash.evaluate(() => {
  const panel = document.querySelector("#pane-library .panel").getBoundingClientRect();
  const first = document.querySelector("#pane-library .rec-card");
  const bottom = first ? first.getBoundingClientRect().bottom + 16 : panel.bottom;
  return { x: panel.x, y: panel.y, width: panel.width, height: Math.min(bottom, panel.bottom) - panel.y };
});
await dash.screenshot({ path: keep("recordings"), clip: box });

await plain.close();


// ---------- The first run, on a studio nobody owns yet ----------

// The setup screen cannot be photographed on a claimed studio - it
// redirects - so this starts one of its own with an empty folder and
// throws it away afterwards.
//
// This used to set REQUIRE_SETUP_CODE so it could photograph the code
// step. There is no code any more on any ordinary install, and a
// picture of a screen almost nobody sees would send people looking in
// a log for something that was never printed. So the shot is the first
// screen as it really is: choose a password.
const PORT = 3960 + Math.floor(Math.random() * 18) * 2;
const RTC = 41500 + Math.floor(Math.random() * 50) * 8;
const fresh = fs.mkdtempSync(path.join(os.tmpdir(), "fs-help-shot-"));
const child = spawn(process.execPath, ["src/index.js"], {
  cwd: `${REPO}server`,
  env: {
    ...process.env,
    DATA_DIR: fresh, HTTP_PORT: String(PORT), BIND_HOST: "127.0.0.1",
    WEB_DIR: `${REPO}web`, DOMAIN: "localhost",
    HOST_PASSWORD: "",
    RTC_MIN_PORT: String(RTC), RTC_MAX_PORT: String(RTC + 3)
  }
});
child.stdout.on("data", () => {});
child.stderr.on("data", () => {});
try {
  const up = `http://127.0.0.1:${PORT}`;
  for (let i = 0; i < 60; i++) {
    try { await fetch(`${up}/healthz`); break; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  const sb = await chromium.launch();
  const sctx = await sb.newContext({ viewport: { width: 900, height: 820 }, deviceScaleFactor: 2 });
  const sp = await sctx.newPage();
  await sp.goto(`${up}/host/setup.html`);
  await sp.waitForSelector("#stepLogin:not([hidden])");
  // The offered passphrase arrives a moment after the step does, and a
  // picture of an empty box beside two buttons explains nothing.
  await sp.waitForFunction(() => document.getElementById("suggestion").textContent.trim().length > 0);
  await sp.waitForTimeout(600);
  await (await sp.$("#setup")).screenshot({ path: keep("setup", 1100) });
  await sb.close();
} finally {
  child.kill("SIGKILL");
  fs.rmSync(fresh, { recursive: true, force: true });
}

// The take that was made for the picture of the Recordings screen is
// removed again, so running this a second time does not leave a pile of
// identical episodes on the studio it borrowed.
for (const r of await fetch(`${B}/api/recordings`, { headers: { Cookie: cookie } }).then((x) => x.json())) {
  if (r.roomId === room.id) {
    await fetch(`${B}/api/recordings/${encodeURIComponent(r.id)}`, { method: "DELETE", headers: { Cookie: cookie } });
  }
}

// The session goes too: it was made for the pictures and a studio that
// has had this run on it a few times should not end up with a list of
// identical episodes.
await fetch(`${B}/api/sessions/${encodeURIComponent(room.id)}`, { method: "DELETE", headers: { Cookie: cookie } });

// ---------- PNG to JPEG ----------

const conv = await chromium.launch();
const convPage = await (await conv.newContext()).newPage();
for (const [name, width] of shots) {
  const png = `${OUT}/${name}.png`;
  if (fs.existsSync(png)) await pngToJpeg(convPage, png, `${OUT}/${name}.jpg`, width, 0.88);
}
await conv.close();

console.log("help pictures:", fs.readdirSync(OUT).join(", "));
