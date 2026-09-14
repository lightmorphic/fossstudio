// A link in the product that leads nowhere is worse than no link: the
// person clicking it has already been told something is wrong, and now
// the software has failed them twice. The studio's warning about media
// not getting through pointed at /diagnostics for a while after that
// page was removed, and Charlie found it the only way anybody could -
// by having the problem it was meant to help with.
//
//   node test/no-dead-links-test.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.join(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))), "web");
let pass = true;
const check = (label, ok) => { console.log(`${ok ? "OK  " : "FAIL"} ${label}`); pass &&= ok; };

// Every page the studio serves, by the name it is served under.
const served = new Set(["/", "/help", "/host/", "/join", "/watch"]);

// The answers the help pane actually defines. It lives in the dashboard
// now rather than in a page of its own, so the sections are read out of
// the dashboard's markup.
const dashboard = fs.readFileSync(path.join(web, "host", "index.html"), "utf8");
const anchors = new Set([...dashboard.matchAll(/class="panel help-sec" id="([^"]+)"/g)].map((m) => m[1]));

function pagesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return pagesUnder(full);
    return e.name.endsWith(".html") ? [full] : [];
  });
}

for (const file of pagesUnder(web)) {
  const html = fs.readFileSync(file, "utf8");
  const name = path.relative(web, file);
  for (const [, href] of html.matchAll(/href="(\/[^"#]*)(#[^"]*)?"/g)) {
    // Only the studio's own pages. Assets are the browser tests' job, and
    // they carry cache-busting query strings, so match on the path.
    if (/\.(css|js|json|png|jpg|svg|ico|webmanifest|woff2?)(\?|$)/.test(href)) continue;
    if (href.startsWith("/api/") || href.startsWith("/css/") || href.startsWith("/js/")) continue;
    check(`${name}: ${href} is a page the studio serves`, served.has(href) || href.endsWith(".html"));
  }
  // Two shapes point at an answer: /help#x from outside the dashboard
  // (the setup screen, a live session's media warning) and #help/x from
  // inside it, which selects the pane without reloading the page.
  for (const [, hash] of html.matchAll(/href="\/help#([^"]+)"/g)) {
    check(`${name}: /help#${hash} is a section that exists`, anchors.has(hash));
  }
  for (const [, hash] of html.matchAll(/href="#help\/([^"]+)"/g)) {
    check(`${name}: #help/${hash} is a section that exists`, anchors.has(hash));
  }
}

console.log(pass ? "ALL PASS" : "SOME CHECKS FAILED");
process.exit(pass ? 0 : 1);
