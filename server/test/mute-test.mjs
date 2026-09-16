// Host mute powers: mute one, mute all, guest self-unmute, indicators.
import { chromium } from "playwright";
import { makeRoom } from "./helpers.mjs";
const B = "http://127.0.0.1:3999";
const ROOM = await makeRoom(B, "test pass phrase 123");
const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
let pass = true;
const check = (label, ok) => { console.log(`${ok ? "OK  " : "FAIL"} ${label}`); pass &&= ok; };

async function join(name, asHost) {
  const ctx = await browser.newContext({ permissions: ["camera", "microphone"] });
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
  return page;
}

const host = await join("Host", true);
const g1 = await join("Greta", false);
const g2 = await join("Gus", false);
await new Promise((r) => setTimeout(r, 3000));

// Everyone arrives muted - host included
check("everyone joins muted, host included",
  (await g1.evaluate(() => document.querySelector("#muteBtn").classList.contains("off"))) &&
  (await g2.evaluate(() => document.querySelector("#muteBtn").classList.contains("off"))) &&
  (await host.evaluate(() => document.querySelector("#muteBtn").classList.contains("off"))));

// All unmute themselves so the rest of the flow starts from live mics
await host.click("#muteBtn");
await g1.click("#muteBtn");
await g2.click("#muteBtn");
await new Promise((r) => setTimeout(r, 1200));

check("host panel lists self first with you-icon",
  await host.$eval(".hp-guest .hp-name-line", (el) => !!el.querySelector(".you-ico")));
check("self row has slider plus its own Mute and Spotlight",
  await host.$eval(".hp-guest", (el) => !!el.querySelector("input[type=range]") && !!el.querySelector(".mute") && !!el.querySelector(".spot")));

// Mute Greta (second row; first is the host themself)
await host.$$eval(".hp-guest .mute", (btns) => btns[1].click());
await new Promise((r) => setTimeout(r, 1200));
check("Greta's mic producer paused",
  await g1.evaluate(() => document.querySelector("#muteBtn").classList.contains("off")));
check("everyone sees 🔇 on Greta's tile",
  await g2.evaluate(() => [...document.querySelectorAll(".tile")].some((t) =>
    t.querySelector(".name").textContent === "Greta" && t.classList.contains("muted"))));

// Greta unmutes herself
await g1.click("#muteBtn");
await new Promise((r) => setTimeout(r, 1200));
check("Greta self-unmuted and badge cleared",
  await g2.evaluate(() => ![...document.querySelectorAll(".tile")].some((t) =>
    t.querySelector(".name").textContent === "Greta" && t.classList.contains("muted"))));

// Mute everyone
await host.click("#hpMuteAllBtn");
await new Promise((r) => setTimeout(r, 1200));
const hostMuted = await host.evaluate(() => document.querySelector("#muteBtn").classList.contains("off"));
const g1Muted = await g1.evaluate(() => document.querySelector("#muteBtn").classList.contains("off"));
const g2Muted = await g2.evaluate(() => document.querySelector("#muteBtn").classList.contains("off"));
check(`mute-all mutes everyone, host included (${hostMuted},${g1Muted},${g2Muted})`,
  g1Muted && g2Muted && hostMuted);
// The button is an icon now, so its name is the aria-label and the tip
check("Mute all button lights up and flips to Unmute all",
  await host.$eval("#hpMuteAllBtn", (el) =>
    el.classList.contains("active") &&
    el.getAttribute("aria-label") === "Unmute all" && el.dataset.tip === "Unmute all"));

// Clicking again unmutes everyone
await host.click("#hpMuteAllBtn");
await new Promise((r) => setTimeout(r, 1200));
check("Unmute all unmutes everyone",
  !(await host.evaluate(() => document.querySelector("#muteBtn").classList.contains("off"))) &&
  !(await g1.evaluate(() => document.querySelector("#muteBtn").classList.contains("off"))) &&
  !(await g2.evaluate(() => document.querySelector("#muteBtn").classList.contains("off"))));
check("Mute all button back to normal",
  await host.$eval("#hpMuteAllBtn", (el) =>
    !el.classList.contains("active") &&
    el.getAttribute("aria-label") === "Mute all" && el.dataset.tip === "Mute all"));

// Mute everyone again so the unmute-one-guest check still applies
await host.click("#hpMuteAllBtn");
await new Promise((r) => setTimeout(r, 1200));

// Host unmutes one guest from the panel. The buttons are icons with
// tooltips now, so the state is in aria-pressed rather than in a word -
// which is why this check sat failing: it was looking for the text of a
// button that had not carried any since the panel was redrawn.
// The host's own row is first in the panel, so a search for "somebody
// muted" finds the host before it finds a guest. Skip it.
await host.$$eval(".hp-guest:not(:first-child) .mute", (btns) => {
  const b = btns.find((x) => x.getAttribute("aria-pressed") === "true");
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 1200));
const unmutedCount = await host.$$eval(".hp-guest:not(:first-child) .mute",
  (btns) => btns.filter((b) => b.getAttribute("aria-pressed") === "false").length);
check(`host unmuted one guest from the panel (${unmutedCount} now unmuted)`, unmutedCount >= 1);

// And the guest's own browser agrees - the panel saying so is not the
// same as their microphone actually being live again.
const guestLive = await Promise.all([g1, g2].map((p) =>
  p.evaluate(() => !document.querySelector("#muteBtn").classList.contains("off"))));
check(`the guest's own browser is unmuted too (${guestLive.filter(Boolean).length} of 2)`,
  guestLive.some(Boolean));

console.log(pass ? "ALL PASS" : "SOME CHECKS FAILED");
await browser.close();
process.exit(pass ? 0 : 1);
