// American spelling, everywhere a person reads (Charlie, 14 September
// 2026: "Please use American spelling for this one. Everything should
// be in American spelling.").
//
// This walks the repository's text and fails on a British spelling. It
// needs no browser and no studio, so it runs in a second before a
// commit.
//
// The lesson from FOSSCast's words.test.js is that a blunt rule catches
// innocent words: "-ise" on its own flags promise, noise, otherwise,
// advertise, exercise, wise and raise, and "-our" flags four, hour,
// pour and your. So every pattern here spells out its endings rather
// than trusting a suffix, and the exceptions are written one by one
// rather than matched by shape.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = new URL("../../", import.meta.url).pathname;

// What a person reads. Binaries, vendored code, the licence texts and
// npm's lock file are somebody else's words, not ours.
const SKIP_DIRS = ["server/node_modules/", "web/assets/", "docs/shots/"];
const SKIP_FILES = ["LICENSE", "docs/OFL.txt", "server/package-lock.json",
  "server/test/spelling-test.mjs", "web/fonts/OFL.txt"];
const SKIP_EXT = [".png", ".jpg", ".jpeg", ".webp", ".woff2", ".mp4", ".ico"];

// The British spellings, and what to say instead.
const BRITISH = [];
const rule = (pattern, say) => BRITISH.push([pattern, say]);
rule(/\bcolour(s|ed|ing|ful)?\b/gi, "color");
rule(/\blicenc(e|es|ed)\b/gi, "license");
rule(/\bcentre(s|d)?\b|\bcentring\b/gi, "center");
rule(/\bgrey(s|ed|ish)?\b/gi, "gray");
rule(/\bbehaviour(s|al)?\b/gi, "behavior");
rule(/\bcatalogue(s|d)?\b/gi, "catalog");
rule(/\b(favour|honour|labour|neighbour|humour|flavour|endeavour|armour|harbour|vapour|rumour|odour|parlour|savour|valour|rigour|vigour)(s|ed|ing|able|ite|ites)?\b/gi,
  "the -or ending");
rule(/\b(analys|paralys|catalys)(e|es|ed|ing|er|ers)\b/gi, "the -yz- ending");
rule(/\b(defence|offence|pretence)\b/gi, "the -se ending");
rule(/\bpractis(e|es|ed|ing)\b/gi, "practice - in American English the verb too");
rule(/\bprogramme(s|d)?\b/gi, "program");
// advertise, advertising and advertisement are spelled the same on both
// sides of the Atlantic - the first draft of this rule flagged eight of
// ours, which is exactly what FOSSCast's list warns about.
rule(/\b(organis|recognis|realis|apologis|customis|optimis|minimis|maximis|summaris|authoris|emphasis|specialis|normalis|initialis|serialis|synchronis|utilis|prioritis|characteris|categoris|standardis|visualis|externalis|memoris|criticis)(e|es|ed|ing|ation|ations|able|er|ers)\b/gi,
  "the -ize ending");
rule(/\b\w+isation(s)?\b/gi, "the -ization ending");
rule(/\b(travell|labell|modell|signall|fuell|cancell|counsell|marshall)(ed|ing|er|ers)\b/gi,
  "one l");
rule(/\b(marvellous|jewellery|woollen|skilful|wilful|fulfil|fulfils|enrol|enrols|instil|distil|appal|instalment|instalments|enrolment|fulfilment)\b/gi,
  "the American form");
rule(/\bartefact(s)?\b/gi, "artifact");
rule(/\b(analogue|dialogue|monologue|epilogue|prologue)(s)?\b/gi, "the -log ending");
rule(/\b(metre|litre|fibre|theatre|sombre|calibre|spectre|centimetre|millimetre|kilometre)(s)?\b/gi,
  "the -er ending");
rule(/\bmanoeuvre(s|d)?\b/gi, "maneuver");
rule(/\b(judgement|acknowledgement|ageing|cosy|pyjamas|aeroplane|aluminium|sulphur|kerb|plough|smoulder|storey|storeys|tyre|tyres|cheque|cheques|mould|moulds|moulded|moulding|whinge)\b/gi,
  "the American form");
rule(/\bsceptic(al|ism|ally)?\b/gi, "skeptic");
rule(/\b(amongst|whilst|towards|maths|learnt|spelt|dreamt|burnt|leapt)\b/gi,
  "the American form");

// Names in code keep their spelling, however odd it looks beside the
// words next to them. A stored key, a value on the wire and a browser
// API are a data change to rename, and that does not belong in a
// wording change. Each entry is the exact text allowed to stand in that
// file, and why - a shape would let a new British word in behind it.
const KEEP = {
  "web/js/session.js": [
    ["backdropColour", "the client's own name for the picked backdrop"],
    ["hpBackdropColour", "the button's id, and hpBackdropColourTools' stem"],
    ["const colour = ", "the local whose shorthand property becomes the wire key"],
    ['mode: "colour"', "a backdrop mode the server validates"],
    ['= "colour"', "the same mode, assigned"],
    [': "colour"', "the same mode, chosen by a ternary"],
    ["?.colour", "the key the server sends back"],
    [".backdrop.colour", "the same key, read"],
    [", colour,", "the shorthand property that becomes data.colour"],
    [", img, colour", "that local, passed to the layout drawings"],
    ["baseColour", "the logo layouts' own parameter"],
    ["kind=programme", "the recording kind in the upload URL"],
    ['kind: "programme"', "the same kind, named for the recorder"],
    ["analyser", "the Web Audio API: createAnalyser, AnalyserNode"]
  ],
  "server/src/signaling.js": [
    ["data.colour", "what the client sends for a backdrop or title color"],
    ["colour: t.bg", "the key the client reads back"],
    ['"colour", "wallpaper", "generated"', "the backdrop modes on the wire"]
  ],
  "server/src/rooms.js": [
    ['active: "colour"', "a room's starting backdrop mode, stored"]
  ],
  "server/src/recording/manager.js": [
    ['"programme"', "the third recording kind, in stored file names"]
  ],
  "CHANGELOG.md": [
    ["`colour` key on the wire", "naming an identifier that was left alone"],
    ["`programme` recording kind", "naming another one"]
  ],
  "server/test/helpers.mjs": [
    ["truecolour", "the PNG specification's own word for the color type"]
  ]
};

const files = execFileSync("git", ["ls-files"], { cwd: REPO, encoding: "utf8" })
  .split("\n").filter(Boolean)
  .filter((f) => !SKIP_DIRS.some((d) => f.startsWith(d)))
  .filter((f) => !SKIP_FILES.includes(f))
  .filter((f) => !SKIP_EXT.includes(path.extname(f).toLowerCase()));

let pass = true;
const used = new Set();
const problems = [];
const BLANK = "-"; // stands in for an allowed name, one character per character

for (const f of files) {
  let text;
  try { text = fs.readFileSync(path.join(REPO, f), "utf8"); } catch { continue; }
  // Blank out what this file is allowed to keep, so a word inside a name
  // cannot be read as prose. Same length, so line and column still line
  // up with the file on disk.
  for (const [literal] of KEEP[f] || []) {
    if (text.includes(literal)) used.add(`${f}::${literal}`);
    text = text.split(literal).join(BLANK.repeat(literal.length));
  }
  const lines = text.split("\n");
  for (const [pattern, say] of BRITISH) {
    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i].matchAll(pattern)) {
        problems.push(`${f}:${i + 1}  "${m[0]}" - American spelling is ${say}`);
      }
    }
  }
}

if (problems.length) {
  pass = false;
  console.log(`FAIL ${problems.length} British spelling(s) where a person reads:`);
  for (const p of problems) console.log(`     ${p}`);
} else {
  console.log(`OK   no British spelling in the ${files.length} files a person reads`);
}

// An exception nobody needs any more is a lie about the code, so it
// fails too: the list stays true or it stops being worth reading.
const stale = [];
for (const [f, entries] of Object.entries(KEEP)) {
  for (const [literal, why] of entries) {
    if (!used.has(`${f}::${literal}`)) stale.push(`${f}: "${literal}" (${why})`);
  }
}
if (stale.length) {
  pass = false;
  console.log("FAIL these spelling exceptions no longer match anything - delete them:");
  for (const s of stale) console.log(`     ${s}`);
} else {
  console.log("OK   every spelling exception still names something in the code");
}

console.log(pass ? "ALL PASS" : "SOME CHECKS FAILED");
process.exit(pass ? 0 : 1);
