import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));



// An address that is not this server's own is the worst kind of wrong:
// the site loads, the room opens, guests appear in the list, and no
// sound or picture ever arrives, because the media engine has handed
// every one of them an address that reaches nobody. Refusing it at the
// gate is right - but the gate is the Setup screen now, where a person
// can be told and can fix it. Here, where it is only read back, an
// unusable value is ignored with a line in the log rather than killing
// a studio that would otherwise still answer its panel.
//
// The ranges below are the ones RFC 5737 reserves for documentation -
// the example.com of IP addresses - which is what an untouched example
// file leaves behind.
export function publicIpProblem(value) {
  const ip = (value || "").trim();
  if (!ip) return "";
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip) ||
      ip.split(".").some((n) => Number(n) > 255)) {
    return "That is not an IPv4 address. It has to be four numbers with dots between them, " +
      "like the one `curl -4 https://api.ipify.org` prints.";
  }
  if (/^(192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/.test(ip)) {
    return "That is one of the addresses reserved for examples, so it is not this server's. " +
      "Find the real one with `curl -4 https://api.ipify.org`.";
  }
  return "";
}

function checkPublicIp(value) {
  const problem = publicIpProblem(value);
  if (!problem) return (value || "").trim();
  console.error(`The public address (${value}) cannot be right: ${problem}\n` +
    "Guests will send their audio and video to an address that reaches nobody and the room " +
    "will open and stay silent. Fix it in Settings.");
  return "";
}

// The domain is a setting now, not a line in a file. This is the value
// the rest of the process reads; initConfig fills it in from the store
// before anything is served, and the Setup screen writes it there.
let domain = process.env.DOMAIN || "";

// A dedicated domain for the dashboard works out of the box: the
// sibling of DOMAIN (app.example.com -> host.example.com) and the child
// (host.<DOMAIN>) are both accepted, plus any explicit HOST_DOMAIN.
// Point its DNS at this server and Caddy fetches the certificate on
// demand - nothing to configure.
export function panelDomains() {
  const out = new Set();
  if (config.hostDomain) out.add(config.hostDomain.toLowerCase());
  if (domain && domain !== "localhost") out.add(domain.toLowerCase());
  if (domain && domain !== "localhost") {
    // Sibling: replace the first label (app.example.com -> host.example.com)
    const labels = domain.split(".");
    if (labels.length >= 3) out.add(["host", ...labels.slice(1)].join(".").toLowerCase());
    // Child: prefix the whole domain (example.com -> host.example.com)
    out.add(`host.${domain}`.toLowerCase());
  }
  return out;
}

export const config = {
  domain,
  publicIp: "",
  httpPort: Number(process.env.HTTP_PORT || 3000),
  bindHost: process.env.BIND_HOST || "127.0.0.1",
  // An optional dedicated dashboard domain; the derived defaults in
  // panelDomains cover the common case with no configuration at all
  hostDomain: process.env.HOST_DOMAIN || "",
  turnHost: process.env.TURN_HOST || domain,
  // The public media range: open it in the firewall, and the compose
  // file publishes it one-to-one. It is deliberately tiny. Every
  // transport is multiplexed over these few sockets by mediasoup's
  // WebRtcServer (see media.js), so four ports carry a full room with
  // room to spare; move the range if several studios share a host.
  rtcMinPort: Number(process.env.RTC_MIN_PORT || 40000),
  rtcMaxPort: Number(process.env.RTC_MAX_PORT || 40003),
  turnMinPort: Number(process.env.TURN_MIN_PORT || 49160),
  turnMaxPort: Number(process.env.TURN_MAX_PORT || 49189),
  dataDir: process.env.DATA_DIR || path.join(root, "..", "data"),
  webDir: process.env.WEB_DIR || path.join(root, "..", "web"),
  sessionSecret: "",
  hostPassword: process.env.HOST_PASSWORD || "",
  turnSecret: ""
};

// Everything the studio needs to run, settled before a single request is
// served. Docker's business - the image, the ports, the volumes - stays
// in the environment. Everything that is a decision about this studio -
// where it lives, its public address, its login - comes from the store,
// because a person can change it there and a compose file is not a
// place to keep a secret.
//
// An install that still sets the old environment variables keeps
// working exactly as it did, and is told once where they belong now.
export async function initConfig() {
  const { ensureSecrets } = await import("./secrets.js");
  const made = await ensureSecrets(config.dataDir);
  config.sessionSecret = process.env.SESSION_SECRET || made.sessionSecret;
  config.turnSecret = process.env.TURN_SECRET || made.turnSecret;
  if (process.env.SESSION_SECRET || process.env.TURN_SECRET) {
    console.log("reading a secret from the environment. The studio makes and keeps its own now: " +
      "clear SESSION_SECRET and TURN_SECRET from your compose file and restart, and nothing is " +
      "left in a file for somebody to paste by accident.");
  }

  const { getSetup } = await import("./setup.js");
  const setup = await getSetup();
  config.domain = domain = setup.domain || process.env.DOMAIN || "localhost";
  config.hostDomain = setup.hostDomain || process.env.HOST_DOMAIN || "";
  config.turnHost = setup.turnHost || process.env.TURN_HOST || config.domain;
  config.publicIp = checkPublicIp(setup.publicIp || process.env.PUBLIC_IP);
  if (process.env.DOMAIN || process.env.PUBLIC_IP) {
    console.log("reading the domain or public address from the environment. " +
      "They are in Settings now; set them there and clear the lines from your compose file.");
  }

  const { writeRelayConfig } = await import("./secrets.js");
  await writeRelayConfig(config.dataDir, {
    turnSecret: config.turnSecret,
    publicIp: config.publicIp,
    domain: config.domain,
    minPort: config.turnMinPort,
    maxPort: config.turnMaxPort
  });
  return config;
}
