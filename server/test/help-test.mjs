// The studio's own help page.
//
// Charlie: "It would be great to have a help page in the back end which
// can give you information about this. So it should tell you to have a
// look in that section, or better still have a link that will take you
// to the point in the documentation ... and try to explain it in clear
// plain English."
//
// It lives inside the studio because a self-hosted box may have no
// internet, and because a website describes whatever is current rather
// than what somebody installed. So this checks three things: that it is
// behind the login, that nothing on it is fetched from another machine,
// and that every link in the dashboard that points into it lands on a
// section that exists - a deep link to a heading that is not there is
// worse than no link.
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
const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
const cookie = await studioLogin(B, PW);
await ctx.addCookies([{ name: "fs_host", value: cookie.split("=")[1], url: B }]);

// Anything the page asks another machine for is a page that breaks on a
// box with no internet, so every request it makes is watched.
const page = await ctx.newPage();
const outside = [];
page.on("request", (r) => {
  const url = new URL(r.url());
  if (url.origin !== new URL(B).origin && url.protocol !== "data:") outside.push(r.url());
});
await page.goto(`${B}/help`);
await page.waitForLoadState("networkidle");
console.log(`    requests to anywhere else: ${outside.join(", ") || "none"}`);
check("nothing on the page is loaded from another machine", outside.length === 0);

const sections = await page.$$eval("section[id]", (els) => els.map((e) => e.id));
console.log(`    sections: ${sections.join(", ")}`);
check("the page answers questions rather than listing topics",
  (await page.$$eval("h2", (els) => els.map((e) => e.textContent))).filter((t) => /\?$/.test(t.trim())).length >= 5);

// A wall of text is not a help page. Every section has to be short
// enough to read, and there has to be more than one of them per screen.
const longest = await page.$$eval("section[id]", (els) =>
  Math.max(...els.map((e) => e.textContent.trim().split(/\s+/).length)));
console.log(`    longest section: ${longest} words`);
check(`no section is a wall of text (${longest} words, allowed 450)`, longest <= 450);

// Every link in the dashboard that points at the help page
const dash = await ctx.newPage();
await dash.goto(`${B}/host/`);
await dash.waitForTimeout(1500);
const links = await dash.$$eval("a[href^='/help']", (els) => els.map((e) => e.getAttribute("href")));
const unique = [...new Set(links)];
console.log(`    links from the dashboard: ${unique.join(", ")}`);
check("settings that need explaining link straight into it", unique.length >= 5);

for (const href of unique) {
  const anchor = href.split("#")[1];
  if (!anchor) {
    check(`${href} opens the page`, true);
    continue;
  }
  await page.goto(`${B}${href}`);
  await page.waitForTimeout(400);
  const landed = await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const top = el.getBoundingClientRect().top;
    return { heading: el.querySelector("h2")?.textContent.trim() || "", top: Math.round(top) };
  }, anchor);
  check(`${href} lands on "${landed?.heading || "nothing"}"` +
    (landed ? `, ${landed.top}px from the top of the window` : ""),
    !!landed && landed.top > -40 && landed.top < 200);
}

await page.goto(`${B}/help`);
await page.screenshot({ path: new URL("./screens/help.png", import.meta.url).pathname, fullPage: true });

console.log(pass ? "ALL PASS" : "SOME CHECKS FAILED");
await browser.close();
process.exit(pass ? 0 : 1);
