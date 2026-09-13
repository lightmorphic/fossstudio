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
      "40000-40100 and 49160-49200 have to be forwarded to this machine."
    );
    process.exit(1);
  }
  return ip;
}

const domain = process.env.DOMAIN || "localhost";

// The dedicated panel domains work out of the box: for each of
// admin/host, the sibling of DOMAIN (app.example.com -> admin.example.com)
// and the child (admin.<DOMAIN>) are both accepted, plus any explicit
// ADMIN_DOMAIN/HOST_DOMAIN. Point their DNS at this server and Caddy
// fetches their certificates on demand - nothing to configure.
export function panelDomains(kind) {
  const out = new Set();
  const explicit = kind === "admin" ? process.env.ADMIN_DOMAIN : process.env.HOST_DOMAIN;
  if (explicit) out.add(explicit.toLowerCase());
  if (domain && domain !== "localhost") {
    const labels = domain.split(".");
    // Sibling: replace the first label (app.example.com -> admin.example.com)
    if (labels.length >= 3) out.add([kind, ...labels.slice(1)].join(".").toLowerCase());
    // Child: prefix the whole domain (example.com -> admin.example.com)
    out.add(`${kind}.${domain}`.toLowerCase());
  }
  return out;
}

export const config = {
  domain,
  publicIp: checkPublicIp(process.env.PUBLIC_IP),
  httpPort: Number(process.env.HTTP_PORT || 3000),
  bindHost: process.env.BIND_HOST || "127.0.0.1",
  // Optional explicit panel domains; the derived defaults below cover
  // the common case with no configuration at all
  adminDomain: process.env.ADMIN_DOMAIN || "",
  hostDomain: process.env.HOST_DOMAIN || "",
  turnHost: process.env.TURN_HOST || domain,
  // Port ranges, so several studios can share one host under host
  // networking: the public media range (open it in the firewall) and
  // the loopback-only base for the recording capture legs
  // (base..base+900)
  rtcMinPort: Number(process.env.RTC_MIN_PORT || 40000),
  rtcMaxPort: Number(process.env.RTC_MAX_PORT || 40100),
  localPortBase: Number(process.env.LOCAL_PORT_BASE || 45000),
  dataDir: process.env.DATA_DIR || path.join(root, "..", "data"),
  webDir: process.env.WEB_DIR || path.join(root, "..", "web"),
  sessionSecret: required("SESSION_SECRET"),
  hostPassword: required("HOST_PASSWORD"),
  turnSecret: required("TURN_SECRET")
};
