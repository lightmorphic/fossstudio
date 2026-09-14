// Website screenshots. Two separate sessions and a solo preview so no
// generated face appears in more than one image on the site.
import { chromium } from "playwright";
import fs from "node:fs";
import { studioLogin, shotStudio, joinAll, pngToJpeg, STUDIO, REPO } from "./helpers.mjs";

const B = "http://127.0.0.1:3999";
const PW = "testpass123";
const OUT = `${REPO}docs/shots`;
fs.mkdirSync(OUT, { recursive: true });

const cookie = await studioLogin(B, PW);
const mk = (title) => fetch(`${B}/api/sessions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ title })
}).then((r) => r.json());
await mk("Episode 41: Package Managers, Ranked");
await mk("Episode 40: The systemd Episode");
const sessionA = await mk("Episode 42: Live From FOSDEM");
const sessionB = await mk("Episode 39: Homelab Horror Stories");

// A person in a browser, and the whole room joining. Both live in
// helpers.mjs, because the help page's pictures are taken the same way
// and a second copy of this is how the last set went stale.
const studio = (cam, name, tagline, sessionId, asHost) =>
  shotStudio(chromium, B, { cam, name, tagline, sessionId, asHost });

// --- Session A: the hero shot (three unique people) ---
const a1 = await studio("vcam1.y4m", "Anna", "awesomepodcast.org", sessionA.id, true);
const a2 = await studio("vcam2.y4m", "Dev", "Kernel maintainer", sessionA.id, false);
const a3 = await studio("vcam3.y4m", "Margot", "Tech author", sessionA.id, false);
await joinAll([a1, a2, a3]);
await new Promise((r) => setTimeout(r, 4000));
await a2.page.screenshot({ path: `${OUT}/session.png` });
for (const s of [a1, a2, a3]) await s.browser.close();

// --- Session B: host panel open (three different people) ---
const b1 = await studio("vcam4.y4m", "Ken", "ken.codes", sessionB.id, true);
const b2 = await studio("vcam5.y4m", "Amara", "Homelab editor", sessionB.id, false);
const b3 = await studio("vcam6.y4m", "Rob", "selfhosted.town", sessionB.id, false);
await joinAll([b1, b2, b3]);
await new Promise((r) => setTimeout(r, 4000));
await new Promise((r) => setTimeout(r, 500));
await b1.page.screenshot({ path: `${OUT}/host-panel.png` });
for (const s of [b1, b2, b3]) await s.browser.close();

// --- Preview: a seventh person, never seen elsewhere ---
const p = await studio("vcam7.y4m", "", "", sessionA.id, false);
await new Promise((r) => setTimeout(r, 800));
await p.page.screenshot({ path: `${OUT}/preview.png` });
await p.browser.close();

// --- Dashboard shots (no faces) ---
const plain = await chromium.launch();
const dctx = await plain.newContext({ viewport: { width: 1560, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark" });
const dash = await dctx.newPage();
await dash.goto(`${B}/host/login.html`);
await dash.fill("#username", STUDIO.username);
await dash.fill("#password", STUDIO.password);
await dash.click("button[type=submit]");
await dash.waitForURL("**/host/");
await dash.waitForTimeout(700);
await dash.screenshot({ path: `${OUT}/dashboard.png` });

// The System screen: backups, the log and the restart, all in the one
// dashboard now rather than behind a panel of their own.
await dash.click('#mainMenu button:has-text("Service")');
await dash.waitForTimeout(500);
await dash.screenshot({ path: `${OUT}/system.png` });

await plain.close();

// --- Spotlight, from a guest's screen ---
// These used to be taken by a separate ad-hoc script which was then lost,
// so both pictures went a fortnight stale without anybody noticing.
const spotSession = await mk("Episode 42: Live From FOSDEM");
const sHost = await studio("vcam1.y4m", "Anna", "awesomepodcast.org", spotSession.id, true);
const sG1 = await studio("vcam2.y4m", "Dev", "Kernel maintainer", spotSession.id, false);
const sG2 = await studio("vcam3.y4m", "Margot", "Tech author", spotSession.id, false);
await joinAll([sHost, sG1, sG2]);
await sHost.page.waitForTimeout(3500);
await sHost.page.click("#hpToggle").catch(() => {});
await sHost.page.waitForTimeout(600);
const spots = await sHost.page.$$(".spot");
if (spots.length > 1) await spots[1].click();
await sHost.page.waitForTimeout(2500);
// The guest's screen, because the spotlight layout is the subject and the
// host panel already has a picture of its own. Pointer off first, or a
// tooltip sits in the middle of it.
await sG1.page.mouse.move(10, 10);
await sG1.page.waitForTimeout(1500);
await sG1.page.screenshot({ path: `${OUT}/spotlight.png` });
for (const b of [sHost, sG1, sG2]) await b.browser.close();


// --- The site uses JPGs; these were saved as PNGs ---
// That gap is why five pictures aged a fortnight: the conversion was a
// manual step somebody had to remember. The browser does it now, from
// the PNG it just wrote, so the script needs nothing installed.
const conv = await chromium.launch();
const convPage = await (await conv.newContext()).newPage();
for (const name of ["session", "spotlight", "host-panel", "preview"]) {
  const png = `${OUT}/${name}.png`;
  if (fs.existsSync(png)) await pngToJpeg(convPage, png, `${OUT}/${name}.jpg`);
}
await conv.close();

console.log("shots saved:", fs.readdirSync(OUT).join(", "));
