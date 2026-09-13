// mediasoup setup: one worker process handles all media forwarding.
// The worker never decodes video - it routes encrypted packets between
// peers, which is why a small VPS can handle a 10-person session.
import * as mediasoup from "mediasoup";
import { config } from "./config.js";

export const RTC_MIN_PORT = config.rtcMinPort;
export const RTC_MAX_PORT = config.rtcMaxPort;

export const mediaCodecs = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: { "x-google-start-bitrate": 800 }
  },
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90000,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "42e01f",
      "level-asymmetry-allowed": 1
    }
  }
];

let worker;
let webRtcServer;

export function workerAlive() {
  return Boolean(worker && !worker.closed);
}

// Every transport shares these sockets. Left to itself mediasoup takes
// a fresh port per transport, and a transport is per direction: a full
// room of ten guests and four clean-feed viewers is twenty-four of them,
// each holding a UDP port and a TCP port. That is fine on a host-
// networked box and hopeless in a container, where each published port
// costs Docker a proxy process and the install has to name the whole
// range. A WebRtcServer multiplexes instead - one socket, ICE telling
// the transports apart by their username fragments - so the range can
// be four ports wide and the compose file can publish it one-to-one.
function listenInfos() {
  const infos = [];
  for (let port = RTC_MIN_PORT; port <= RTC_MAX_PORT; port++) {
    for (const protocol of ["udp", "tcp"]) {
      // announcedAddress is what makes a bridge network work at all.
      // Inside a container the engine sees Docker's own address on the
      // socket, and would hand every guest an address that reaches
      // nobody; PUBLIC_IP is the address traffic actually arrives on.
      // Without one (local development) bind loopback, because 0.0.0.0
      // would be announced as it stands.
      infos.push(config.publicIp
        ? { protocol, ip: "0.0.0.0", announcedAddress: config.publicIp, port }
        : { protocol, ip: "127.0.0.1", port });
    }
  }
  return infos;
}

export async function startMediasoup() {
  worker = await mediasoup.createWorker({
    rtcMinPort: RTC_MIN_PORT,
    rtcMaxPort: RTC_MAX_PORT,
    logLevel: "warn"
  });
  worker.on("died", () => {
    // If the media process dies the app is useless; exit and let
    // Docker's restart policy bring everything back clean.
    console.error("mediasoup worker died, exiting");
    process.exit(1);
  });
  webRtcServer = await worker.createWebRtcServer({ listenInfos: listenInfos() });
  console.log(
    `mediasoup listening on ${RTC_MIN_PORT}-${RTC_MAX_PORT} (udp+tcp)` +
    (config.publicIp ? `, announcing ${config.publicIp}` : ", loopback only")
  );
  return worker;
}

export async function createRouter() {
  return worker.createRouter({ mediaCodecs });
}

export async function createWebRtcTransport(router) {
  // The shared server above owns the sockets and the addresses; a
  // transport only says which of them it wants to be reachable on.
  const transport = await router.createWebRtcTransport({
    webRtcServer,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1_000_000
  });
  return transport;
}
