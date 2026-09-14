// The studio's own help.
//
// Charlie: "It would be great to have a help page in the back end which
// can give you information about this. So it should tell you to have a
// look in that section, or better still have a link that will take you
// to the point in the documentation ... and try to explain it in clear
// plain English."
//
// And then, 14 September 2026, having read it: "The help page is just a
// wall of text. It's about as interesting as custard ... make it wider",
// and "Don't have the Help in the top right-hand corner. Make it one of
// the tabs on the left. Make it part of the system, so it doesn't just
// open to a blank page with no menus."
//
// So it is a pane of the dashboard now, and this checks what that has to
// keep being: behind the login, in the left menu rather than the top
// bar, nothing on it fetched from another machine (a self-hosted box may
// have no internet, and a website describes whatever is current rather
// than what somebody installed), every deep link landing on its own
// answer, a real picture where a picture was promised, and no sideways
// scrolling at the three widths Charlie uses.
//
//   node test/help-test.mjs [url] [password]
import { chromium } from "playwright";
import { studioLogin } from "./helpers.mjs";

const B = process.argv[2] || "http://127.0.0.1:3999";
const PW = process.argv[3] || "testpass123";

let pass = true;
const check = (label, ok) => { console.log(`${ok ? "OK  " : "FAIL"} ${label}`); pass &&= ok; };

// Signed out, it is a login page and not a help page
const out = await fetch(`${B}/help`, { redirect: "manual" });
check(`signed out, /help sends you to the login (${out.status})`,
  out.status === 302 && /login/.test(out.headers.get("location") || ""));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const cookie = await studioLogin(B, PW);
await ctx.addCookies([{ name: "fs_host", value: cookie.split("=")[1], url: B }]);

// Anything the page asks another machine for is a page that breaks on a
// box with no internet, so every request it makes is watched - the
// pictures included, which is why they are taken by help-shots.mjs and
// served from here rather than linked to a website.
const page = await ctx.newPage();
const outside = [];
page.on("request", (r) => {
  const url = new URL(r.url());
  if (url.origin !== new URL(B).origin && url.protocol !== "data:") outside.push(r.url());
});
await page.goto(`${B}/host/#help/help`);
await page.waitForLoadState("networkidle");
console.log(`    requests to anywhere else: ${outside.join(", ") || "none"}`);
check("nothing on it is loaded from another machine", outside.length === 0);

// It is a tab in the left column, beside Account and System, and no
// longer a button in the top right
check("Help is in the main menu on the left",
  (await page.$$eval("#mainMenu button", (els) => els.map((e) => e.textContent.trim()))).includes("Help"));
check("Help is not a button in the top bar",
  (await page.$$eval(".topbar a, .topbar button", (els) => els.map((e) => e.textContent.trim()))).every((t) => t !== "Help"));
check("the dashboard's menus are still beside it",
  await page.$eval("#pane-help", (el) => !el.hidden) && await page.$eval("#mainMenu", (el) => el.offsetWidth > 0));

const sections = await page.$$eval("#pane-help .help-sec", (els) => els.map((e) => e.id));
console.log(`    answers: ${sections.join(", ")}`);
check("the pane answers questions rather than listing topics",
  (await page.$$eval("#pane-help h2", (els) => els.map((e) => e.textContent)))
    .filter((t) => /\?$/.test(t.trim())).length >= 5);

// A wall of text is not help. Every answer has to be short enough to
// read, and most of them have something beside the prose - a picture of
// the real screen, a table, or the sentence that matters most - because
// a column of prose and nothing else is what Charlie objected to.
const longest = await page.$$eval("#pane-help .help-sec", (els) =>
  Math.max(...els.map((e) => e.textContent.trim().split(/\s+/).length)));
console.log(`    longest answer: ${longest} words`);
check(`no answer is a wall of text (${longest} words, allowed 450)`, longest <= 450);

const broken = await page.$$eval("#pane-help .help-sec", (els) => els
  .filter((e) => !e.querySelector("figure.shot, table, .note"))
  .map((e) => e.id));
console.log(`    prose only: ${broken.join(", ") || "none"}`);
check("every answer but the list of links has a picture, a table or a callout",
  broken.length === 0 || (broken.length === 1 && broken[0] === "elsewhere"));

// The pictures are the product. A missing one is worse than none: it
// leaves a hole where somebody was told to look.
// The pictures load lazily, which is right for six screenshots on one
// pane and means they have to be scrolled past before they are there.
for (const fig of await page.$$("#pane-help figure.shot img")) await fig.scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
const shots = await page.$$eval("#pane-help figure.shot", (els) => els.map((e) => ({
  src: e.querySelector("img")?.getAttribute("src") || "",
  loaded: e.querySelector("img")?.naturalWidth > 0,
  alt: (e.querySelector("img")?.getAttribute("alt") || "").trim(),
  caption: (e.querySelector("figcaption")?.textContent || "").trim()
})));
console.log(`    pictures: ${shots.length}`);
for (const s of shots) {
  check(`${s.src} loads, and says what to look at`,
    s.loaded && s.alt.length > 40 && s.caption.length > 20);
}
check("there are pictures on it at all", shots.length >= 4);

// Every link in the dashboard that points at an answer
const links = await page.$$eval("a[href^='#help/']", (els) => els.map((e) => e.getAttribute("href")));
const unique = [...new Set(links)];
console.log(`    links from the dashboard: ${unique.join(", ")}`);
check("settings that need explaining link straight into it", unique.length >= 5);

async function landedOn(anchor) {
  await page.waitForTimeout(400);
  return page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el || el.offsetParent === null) return null;
    return { heading: el.querySelector("h2")?.textContent.trim() || "", top: Math.round(el.getBoundingClientRect().top) };
  }, anchor);
}

for (const href of unique) {
  const anchor = href.split("/")[1];
  await page.goto(`${B}/host/`);
  await page.waitForTimeout(300);
  // Clicked the way the browser would, not by typing the address: these
  // links sit inside Settings panes that are not the one on screen, so
  // Playwright will not click them for us.
  await page.evaluate((sel) => document.querySelector(`a[href='${sel}']`).click(), href);
  const landed = await landedOn(anchor);
  check(`${href} lands on "${landed?.heading || "nothing"}"` +
    (landed ? `, ${landed.top}px from the top of the window` : ""),
    !!landed && landed.top > -40 && landed.top < 200);
}

// And the address somebody can paste, which is also what the media
// warning in a live session points at. The fragment survives the
// redirect into the dashboard.
await page.goto(`${B}/help#public-ip`);
await page.waitForTimeout(600);
const pasted = await landedOn("public-ip");
check(`/help#public-ip lands on "${pasted?.heading || "nothing"}" (${page.url().split("/host/")[1] || ""})`,
  !!pasted && pasted.top > -40 && pasted.top < 200);

// Three widths: a desktop, a small laptop or tablet, and a phone. A page
// that scrolls sideways on a phone is a page nobody reads on one.
for (const [w, h] of [[1400, 1000], [900, 1000], [390, 844]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${B}/host/#help/help`);
  await page.waitForTimeout(600);
  const over = await page.evaluate(() => {
    const wide = [...document.querySelectorAll("#pane-help *")]
      .filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .map((e) => `${e.tagName.toLowerCase()}.${e.className}`);
    return { doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, wide: wide.slice(0, 3) };
  });
  check(`${w} wide: nothing runs off the side (${over.doc}px over${over.wide.length ? ", " + over.wide.join(", ") : ""})`,
    over.doc <= 0 && over.wide.length === 0);
  await page.screenshot({
    path: new URL(`./screens/help-${w}.png`, import.meta.url).pathname,
    fullPage: true
  });
}

console.log(pass ? "ALL PASS" : "SOME CHECKS FAILED");
await browser.close();
process.exit(pass ? 0 : 1);
