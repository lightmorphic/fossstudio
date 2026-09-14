// The website's own promise, checked rather than asserted.
//
// The site now says, in the headline claim and in a whole answer of its
// own, that nothing leaves the machine. That claim is only worth making
// if it is true of the page carrying it, and a page is one careless
// <link> away from fetching a font from Google on every visit. A person
// reading the privacy answer would never know; their browser would.
//
// So this serves docs/ on a loopback port, opens every page in it, and
// fails on any request that goes anywhere but that port. It also fails
// on a request to our own server that 404s, because a missing stylesheet
// is how a page quietly stops looking like the one we screenshotted.
//
//   node test/site-test.mjs
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const REPO = new URL("../../", import.meta.url).pathname;
const DOCS = path.join(REPO, "docs");

let pass = true;
const check = (label, ok) => { console.log(`${ok ? "OK  " : "FAIL"} ${label}`); pass &&= ok; };

const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2",
  ".txt": "text/plain", ".xml": "application/xml", ".ico": "image/x-icon"
};

// GitHub Pages serves docs/ as-is, so this does the same: no rewriting,
// no index guessing beyond the one a directory gets.
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(DOCS, path.normalize(rel));
  if (!file.startsWith(DOCS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const pages = fs.readdirSync(DOCS).filter((f) => f.endsWith(".html")).sort();
check(`the site has pages to check (${pages.length})`, pages.length >= 5);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();

const offsite = [];
const missing = [];
page.on("request", (r) => {
  // A link the visitor has not clicked is not a request; only what the
  // page fetches on its own counts.
  if (!r.url().startsWith(BASE) && !r.url().startsWith("data:")) offsite.push(r.url());
});
page.on("response", (r) => {
  if (r.url().startsWith(BASE) && r.status() >= 400) missing.push(`${r.status()} ${r.url()}`);
});

for (const name of pages) {
  const res = await page.goto(`${BASE}/${name}`, { waitUntil: "networkidle" });
  check(`${name} loads (${res.status()})`, res.status() === 200);
  const title = await page.title();
  check(`${name} has a title`, title.trim().length > 0);
}

check(`nothing is fetched from another machine${offsite.length ? `: ${offsite.join(", ")}` : ""}`,
  offsite.length === 0);
check(`nothing on the site is missing${missing.length ? `: ${missing.join(", ")}` : ""}`,
  missing.length === 0);

// The claim itself, in the words the page uses. If somebody softens the
// headline the test should notice, because the rest of this file exists
// to back that sentence up.
const home = fs.readFileSync(path.join(DOCS, "index.html"), "utf8");
check("the home page still says what leaves the server", /What leaves the server\?/.test(home));
// The answer names its exceptions and counts them, so the count and the
// list cannot drift apart. There are two - notifications and the
// certificate - and a recording is not one of them, which is the part
// worth guarding: the studio has nowhere to send a recording, and the
// page is entitled to say so flatly.
check("the answer still counts its exceptions", /Two things leave/.test(home));
check("a recording is not one of them", /A recording (never leaves|is not on that list)/.test(home));
check("the home page sells meetings as well as podcasts",
  /meeting/i.test(home) && /podcast/i.test(home));

await browser.close();
server.close();
console.log(pass ? "ALL PASS" : "SOME CHECKS FAILED");
process.exit(pass ? 0 : 1);
