// First run: claiming the studio, and the rules for the password.
//
// A setup page anybody can reach is a studio anybody can own. Whoever
// finds the address first sets the password and the person who paid for
// the server is locked out of their own machine. So the page asks for a
// code the studio prints in its log when it starts and keeps nowhere
// else: `docker compose logs app` is a command every self-hoster can
// run, and being able to run it is the proof that the box is yours.
//
// The code lives in memory for the life of the process. It is never
// written down, so a stolen backup does not contain it, and it changes
// every time the studio restarts.
//
// The code has one job: to prove the person at the browser is the
// person who owns the machine. A request that arrives on the loopback
// address has already proved that - nothing but this machine can open a
// connection to 127.0.0.1 - so opening the studio on the machine it
// runs on skips the code entirely and goes straight to choosing a
// password. From anywhere else the code applies exactly as before.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { COMMON_PASSWORDS } from "./common-passwords.js";

const FILE = "setup.json";

let setupCode = null;
let dataDir = null;

// Where a studio's own decisions live: its address, and how it is
// reached. Read before the rest of config is settled, so like
// secrets.js it works on the directory rather than through storage.js.
async function readSetup() {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir, FILE), "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    return {};
  }
}

async function writeSetup(value) {
  await fs.mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  await fs.rename(tmp, file);
}

export function setSetupDir(dir) { dataDir = dir; }

export async function getSetup() {
  if (!dataDir) return {};
  return readSetup();
}

export async function saveSetup(patch) {
  const next = { ...(await readSetup()), ...patch };
  await writeSetup(next);
  return next;
}

// Whether this studio has an owner yet. The account file is the answer:
// an install from before any of this has one and must never be sent
// through setup again.
export async function isClaimed() {
  const { hasAccount } = await import("./account.js");
  return hasAccount();
}

// Printed once, on a start where nobody owns the studio yet. Said in
// full sentences because the person reading it is looking at a wall of
// container output and has to be able to find it.
export async function announceSetup() {
  if (await isClaimed()) return null;
  setupCode = `${crypto.randomInt(0, 1000).toString().padStart(3, "0")}-` +
    `${crypto.randomInt(0, 1000).toString().padStart(3, "0")}`;
  console.log([
    "",
    "  ------------------------------------------------------------",
    "  This studio has no owner yet.",
    "",
    "  Open it in a browser on this machine and it will simply ask you",
    "  to choose a password. Opening it from another machine, it asks",
    "  for this code first:",
    "",
    `      ${setupCode}`,
    "",
    "  The code is only in this log, so only somebody who can reach",
    "  this machine can claim the studio. It changes on every restart",
    "  and is not written to disk anywhere.",
    "  ------------------------------------------------------------",
    ""
  ].join("\n"));
  return setupCode;
}

export function currentSetupCode() { return setupCode; }

// ---------- is this request coming from the machine itself? ----------

// Headers a proxy writes in front of us. Every one of them is plain
// text that anybody can put in a request, so they are never read as an
// address - they are read only as evidence that something is relaying,
// in which case the address on the socket belongs to the relay and
// proves nothing about who is really there.
const PROXY_HEADERS = [
  "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port",
  "x-forwarded-server", "forwarded", "x-real-ip", "x-client-ip", "x-cluster-client-ip",
  "cf-connecting-ip", "true-client-ip", "fastly-client-ip", "fly-client-ip",
  "x-original-forwarded-for", "via"
];

// 127.0.0.0/8 and ::1, and nothing else. IPv4 arriving on a dual-stack
// socket wears an ::ffff: prefix, which is the same address.
export function isLoopbackAddress(address) {
  const ip = String(address || "").replace(/^::ffff:/i, "").replace(/%.*$/, "");
  if (ip === "::1" || ip === "0:0:0:0:0:0:0:1") return true;
  return /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(ip) &&
    ip.split(".").every((n) => Number(n) <= 255);
}

// The whole of the decision, in one place, erring towards asking.
//
// The address is taken from the socket, never from a header: a header
// is written by whoever is in front and X-Forwarded-For: 127.0.0.1 costs
// a stranger nothing. Taken from the socket, a loopback address means
// the connection was opened on this machine.
//
// The one case where that is not enough is a reverse proxy running on
// this same machine and reaching the studio over loopback: then every
// request in the world arrives from 127.0.0.1 and the shortcut would
// hand the studio to the first passer-by. There is no way to see past
// a relay that says nothing about itself, so anything that looks like
// one - any of the headers above - means the code is asked for. Caddy,
// nginx, Apache and Traefik all set X-Forwarded-For by default, and the
// bundled Caddy reaches the app across the compose network rather than
// loopback, so its requests are not loopback in the first place.
//
// REQUIRE_SETUP_CODE=1 turns the shortcut off for anybody whose proxy
// strips those headers and shares this machine. It is in the
// environment rather than in the settings because there is nobody to
// have settings until the studio has been claimed.
export function isLocalRequest(req) {
  if (/^(1|true|yes|always)$/i.test(String(process.env.REQUIRE_SETUP_CODE || ""))) return false;
  if (PROXY_HEADERS.some((h) => req.headers?.[h] !== undefined)) return false;
  return isLoopbackAddress(req.socket?.remoteAddress);
}

export function clearSetupCode() { setupCode = null; }

export function setupCodeMatches(given) {
  const want = setupCode || "";
  const got = String(given || "").trim();
  if (!want || got.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

// ---------- the password rule ----------

// Enforced, not advised. Charlie: "I would rather people be upset with
// me for forcing a good password than complaining that we didn't force
// them to use a good password after they get hacked."
//
// Length is the rule, because length is what actually helps. There are
// deliberately no rules about capitals and symbols: they produce
// Password1! and teach nobody anything, while making a good passphrase
// harder to type. What is checked instead is whether the choice is one
// somebody would guess first, and that is checked by name so the answer
// can say why.
export const MIN_PASSWORD = 12;

export function passwordProblem(password, username = "") {
  const p = String(password || "");
  // The named refusal comes before the length one, so "password123" is
  // told what is actually wrong with it rather than that it is a
  // character short.
  const plain = p.toLowerCase().replace(/[^a-z0-9]/g, "");
  const stripped = plain.replace(/[0-9]+$/, "");
  for (const bad of COMMON_PASSWORDS) {
    if (plain === bad || stripped === bad || plain === `${bad}${bad}`) {
      return `"${bad}" is one of the first things anybody guesses, and adding numbers to the end ` +
        `of it does not change that. Try four or five unrelated words instead - they are longer, ` +
        `easier to remember, and nobody has a list of them.`;
    }
  }
  if (p.length < MIN_PASSWORD) {
    return `That is ${p.length} character${p.length === 1 ? "" : "s"}. A password here has to be at ` +
      `least ${MIN_PASSWORD}. Length is what makes one hard to guess, so four or five ordinary ` +
      `words in a row beats anything short and clever.`;
  }
  if (username && plain.includes(String(username).toLowerCase().replace(/[^a-z0-9]/g, "")) &&
      plain.length < MIN_PASSWORD + 8) {
    return "That is mostly your own username, which is the second thing anybody tries. " +
      "Four or five unrelated words work far better.";
  }
  if (/^(.)\1+$/.test(plain) || /^(0123456789|1234567890|abcdefghij)/.test(plain)) {
    return "That is one character or one run of the keyboard. It is long but it is not hard to " +
      "guess. Four or five unrelated words work far better.";
  }
  return "";
}

// A passphrase offered beside the box, for the person who would rather
// not think of one. Words only, because a password you can read out to
// yourself is a password you will still have next month. The list is
// short and ordinary on purpose; the strength is in taking five of them
// at random, which is about sixty bits however familiar the words are.
const WORDS = ("able acid aged also area army away baby back bald bank barn base bath bead beam bean bear " +
  "beat beef bell belt bend bent best bike bind bird bite blue boat bold bolt bone book boot born both " +
  "bowl brew brick bring broom brush buck bulb bulk bump bunk burn bush busy cage cake calm camp cane " +
  "card care cart case cash cast cave cell chat chef chin chip city clay clip club coal coat code coil " +
  "coin cold colt comb cook cool cope copy cord cork corn cost crab crew crop crow cube cuff curl cute " +
  "damp dark dart dash dawn deal dear debt deck deep deer dent desk dial dice dime dine disc dish dive " +
  "dock does dome done door dose dove down drag draw drew drum dual duck dull dusk dust duty each earl " +
  "earn ease east easy edge exit face fact fade fail fair fall farm fast fear feed feel fell felt fern " +
  "file fill film find fine fire firm fish fist five flag flat flax flee flew flip flow foam fold folk " +
  "font food foot fork form fort four free frog from fuel full fund gain game gate gave gear gift girl " +
  "give glad glow glue goal goat gold golf gone good gown grab gram grew gray grid grim grin grip grow " +
  "gulf hail hair half hall hand hang hard harm hate haul have hawk haze head heal heap hear heat heel " +
  "held helm help herb herd hero hide high hill hint hive hold hole holy home hood hoof hook hoop hope " +
  "horn hose host hour huge hunt hurl hurt hymn idea inch iron item jade jail jazz jean join joke jump " +
  "junk keen keep kelp kept kick kind king kiss kite knee knew knit knob knot know lace lack lake lamb " +
  "lamp land lane lard lark last late lawn lead leaf leak lean leap left lend lens lent less lift like " +
  "lily limb lime line link lion list live load loaf loan lock loft logo lone long look loom loop lord " +
  "lose loud love luck lump lung made mail main make male mall malt mane many maple march mark mask mast " +
  "mate math meal mean meat meet melt mend menu mere mesh mild mile milk mill mind mine mint mist moat " +
  "mode mold mole monk mood moon moss most moth move much mule myth nail name near neat neck need nest " +
  "news next nice nine node none noon north nose note noun oak oath oats odds okay omen once only onto " +
  "open oval oven over pace pack page paid pail pain pair pale palm pane park part pass past path pave " +
  "peak pear peat peel peer pest pick pier pile pine pink pint pipe pith plan play plea plot plug plum " +
  "poem poet pole pond pony pool poor pork port pose post pour pram prey prop pull pulp pump pure push " +
  "quay quit quiz race rack raft rage raid rail rain rake ramp rang rank rare rate rave read real reap " +
  "rear reed reef reel rent rest ribs rice rich ride ridge rife rift rime ring rink riot ripe rise risk " +
  "road roam robe rock rode role roll roof rook room root rope rose ruby rule rush rust sage said sail " +
  "salt same sand sang sank save scan scar seal seam seat seed seek seem seen self sell send sent shed " +
  "shin ship shoe shop shot show shut side sigh sign silk sill silo sing sink site size skew skin skip " +
  "slab sled slid slim slip slot slow snap snow soak soap sock soft soil sold sole solo some song soon " +
  "sore sort soul soup sour span spin spot spun spur stab star stay stem step stir stop stow stub such " +
  "suit sung sunk sure surf swan swap swim tail take tale talk tall tank tape task team tear teem tell " +
  "tend tent term test text than that thaw them then thin this thus tick tide tidy tier tile till tilt " +
  "time tiny toad toil told toll tomb tone took tool torn toss tour town trap tray tree trim trip trot " +
  "true tube tuck tune turf turn twig twin type unit upon urge used vane vary vast veal veil vein vent " +
  "verb vest view vine visa void volt vote wade wage wait wake walk wall wand want ward warm warn wash " +
  "wasp wave weak wear weed week weld well went were west what when whip whom wick wide wife wild will " +
  "wind wine wing wink wire wise wish with wolf wood wool word wore work worm worn wrap wren yard yarn " +
  "yawn year yeast yolk your zeal zero zinc zone").split(/\s+/);

export function suggestPassphrase(words = 5) {
  const picked = [];
  for (let i = 0; i < words; i++) picked.push(WORDS[crypto.randomInt(0, WORDS.length)]);
  return picked.join("-");
}
