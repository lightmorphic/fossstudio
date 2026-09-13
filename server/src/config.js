import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function required(name) {
  const v = process.env[name];
  if (!v && process.env.NODE_ENV === "production") {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return v || "";
}

// The example config has to show the shape of a public IP address, and
// whatever we put there some people will start the studio without
// changing it. That failure is invisible in the worst way: the site
// loads, the room opens, guests appear in the list, and no sound or
// picture ever arrives, because the media engine has handed every one
// of them an address that reaches nobody. So refuse to start instead,
// and say what to do. These are the ranges RFC 5737 reserves for
// documentation - the example.com of IP addresses - plus the empty
// string, which fails the same way.
function checkPublicIp(value) {
  const ip = (value || "").trim();
  if (!ip) return ip;
  const documentation = /^(192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)/;
  const notAnAddress = !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip);
  if (documentation.test(ip) || notAnAddress) {
    console.error(
      `PUBLIC_IP is still the example value (${ip}).\n` +
      "It has to be this server's own public IPv4, or guests will send\n" +
      "their audio and video to an address that reaches nobody: the room\n" +
      "will open and stay silent.\n\n" +
      "Find it with:  curl -4 https://api.ipify.org\n" +
      "then set PUBLIC_IP to that number and start again.\n\n" +
      "Behind a home router, that is the router's address, and UDP 3478,\n" +
      "40000-40003 and 49160-49189 have to be forwarded to this machine."
    );
    process.exit(1);
  }
  return ip;
}

const domain = process.env.DOMAIN || "localhost";

// A dedicated domain for the dashboard works out of the box: the
// sibling of DOMAIN (app.example.com -> host.example.com) and the child
// (host.<DOMAIN>) are both accepted, plus any explicit HOST_DOMAIN.
// Point its DNS at this server and Caddy fetches the certificate on
// demand - nothing to configure.
export function panelDomains() {
  const out = new Set();
  if (process.env.HOST_DOMAIN) out.add(process.env.HOST_DOMAIN.toLowerCase());
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
  publicIp: checkPublicIp(process.env.PUBLIC_IP),
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
  dataDir: process.env.DATA_DIR || path.join(root, "..", "data"),
  webDir: process.env.WEB_DIR || path.join(root, "..", "web"),
  sessionSecret: required("SESSION_SECRET"),
  hostPassword: required("HOST_PASSWORD"),
  turnSecret: required("TURN_SECRET")
};
