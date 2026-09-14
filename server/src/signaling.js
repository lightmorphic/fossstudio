// WebSocket signaling: small JSON request/response protocol.
// Client sends {id, method, data}; server replies {id, ok, data|error}.
// Server-initiated events are {event, data} with no id.
import { WebSocketServer } from "ws";
import path from "node:path";
import fs from "node:fs/promises";
import { config } from "./config.js";
import { createWebRtcTransport } from "./media.js";
import {
  getOrCreateRoom, addPeer, removePeer, peerSummary, broadcast, pinTheme,
  activeBackdropUrl
} from "./rooms.js";
import { iceServers } from "./turn.js";
import { isAuthedRequest } from "./auth.js";
import { getSettings, updateSettings, findSession } from "./settings.js";
import { isSessionBlocked, addSessionBlock } from "./blocklist.js";
import { notify } from "./push.js";
import {
  startRecording, stopRecording, activeRecording,
  addPeerToRecording, uploadCreds, notePeerMicLoss,
  notePartStart, notePeerGone, personOf
} from "./recording/manager.js";

const ROOM_ID_RE = /^[a-zA-Z0-9_-]{4,32}$/;
// Mirrors BANNER_COLOURS in web/js/session.js: guests' own picks are
// validated against it, and multi-color mode deals from it
const BANNER_PALETTE = [
  "#f34236", "#fe9700", "#fbc711", "#8bc34a", "#4bae4f", "#019587",
  "#00bcd3", "#2295f1", "#3d51b4", "#9b26ae", "#e8207e", "#795649",
  "#607d8b", "#9e9d9e", "#1e2127"
];
const NAME_MAX = 24;

export function attachSignaling() {
  // noServer: index.js decides which upgrades are ours by path, so the
  // HTTP server keeps ownership of the upgrade event.
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", async (socket, req) => {
    const url = new URL(req.url, "http://localhost");
    const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
      || req.socket.remoteAddress;
    const roomId = url.searchParams.get("room") || "";
    if (!ROOM_ID_RE.test(roomId)) {
      socket.close(4400, "bad room id");
      return;
    }

    // Created on join, not here: awaiting router creation before attaching
    // the message listener would drop messages from fast clients.
    let room = null;
    let peer = null;

    socket.on("message", async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      const { id, method, data = {} } = msg;
      const reply = (payload) => socket.send(JSON.stringify({ id, ok: true, data: payload }));
      const fail = (error) => socket.send(JSON.stringify({ id, ok: false, error }));

      try {
        switch (method) {
          case "join": {
            if (peer) return fail("already joined");
            // Only sessions created in a dashboard exist
            const session = await findSession(roomId);
            if (!session) return fail("This session link doesn't exist.");
            room = await getOrCreateRoom(roomId);
            // First join pins the theme for the room's whole life
            if (!room.theme) await pinTheme(room, session, await getSettings());
            const name = String(data.name || "").trim().slice(0, NAME_MAX) || "Guest";
            const tagline = String(data.tagline || "").trim().slice(0, 32);
            // Host role needs a dashboard login - never client-claimed.
            // There is one account, so being signed in is the whole of
            // the question.
            const auth = isAuthedRequest(req);
            const canHost = !!auth;
            // "viewer" is the OBS clean-feed connection: receive-only,
            // invisible to everyone else. Anyone with the session link
            // may open one (same trust level as joining as a guest).
            // Signed in means host. The link is the same one guests get,
            // so the host can copy it out of the address bar and paste it
            // into a chat without going back to the dashboard - and there
            // is nothing on the end of it for a stranger to notice and
            // try. The login was always the gate; now it is the only
            // thing that looks like one.
            const role = data.role === "viewer" ? "viewer"
              : canHost ? "host" : "guest";
            // The browser's persistent marker, sent alongside the IP:
            // together they are what a session block matches on. Hosts
            // are never blocked - their login is the gate.
            const marker = /^[a-zA-Z0-9-]{8,64}$/.test(String(data.marker || ""))
              ? data.marker : null;
            // Who this is, as far as a recording is concerned. The
            // browser keeps one of these per session link, so the same
            // browser coming back after a drop continues the same track
            // instead of arriving as a stranger with a second file. It
            // is never taken from the link itself: links get shared, and
            // two people on one link have to stay two people.
            const personId = /^[a-zA-Z0-9-]{8,64}$/.test(String(data.person || ""))
              ? String(data.person) : null;
            if (role !== "host" &&
                await isSessionBlocked({ ip: clientIp, marker })) {
              return fail("You have been blocked from this studio's sessions.");
            }
            peer = addPeer(room, { name, tagline, role, socket });
            peer.ip = clientIp;
            peer.marker = marker;
            peer.personId = personId;
            peer.uid = auth?.uid || null;
            room.control.noise[peer.id] = !!data.noiseOn;
            // Everyone arrives muted - host included, even alone; you
            // unmute yourself when you're ready to talk
            room.control.muted[peer.id] = true;
            const settings = await getSettings();
            const canServerRecord = role === "host";
            reply({
              peerId: peer.id,
              role,
              canServerRecord,
              routerRtpCapabilities: room.router.rtpCapabilities,
              iceServers: iceServers(),
              control: room.control,
              recordingSince: activeRecording(room.id)?.startedAt || null,
              theme: {
                // The pinned theme: identical for everyone until the
                // room empties, however the settings change meanwhile.
                // The backdrop within it can be switched mid-show by
                // the host, between copies pinned at first join.
                title: room.title,
                logo: room.theme.logoUrl,
                bg: room.theme.bg,
                wallpaper: activeBackdropUrl(room),
                backdrop: room.theme.active,
                backdrops: {
                  wallpaper: !!room.theme.wallpaperPath,
                  logo: !!room.theme.logoPath
                },
                hasAd: !!room.theme.hasAd
              },
              peers: [...room.peers.values()]
                .filter((p) => p.id !== peer.id && p.role !== "viewer")
                .map(peerSummary)
            });
            // One seat per person, and one host in the chair: a newer
            // window takes the seat and the older one is closed with a
            // reason it can say out loud.
            //
            // This is for the ordinary accident - a duplicated tab, a
            // window left open from an earlier take - not a guard
            // against anybody determined: another browser or a private
            // window has no person id of ours and is simply a new
            // person, which is fine. Where there is no id there is no
            // rule.
            //
            // Newest wins rather than refusing the newcomer, so a wrong
            // guess costs nothing: a browser that really went away has
            // already left room.peers and there is nothing here to
            // close, so a genuine reconnection is untouched, and a
            // connection still open is either a duplicate or a corpse
            // the network has not confessed to. Nobody is ever kept out
            // of a room they are trying to join.
            //
            // The newcomer is in room.peers and answered before anyone
            // is closed, so a handover cannot leave a room hostless,
            // and manager.js's per-person list of live connections has
            // the new one on it before the old comes off - a track
            // never goes empty. Viewers (the OBS feed) hold no seat.
            if (role !== "viewer") {
              for (const other of [...room.peers.values()]) {
                if (other.id === peer.id || other.role === "viewer") continue;
                const samePerson = personId && other.personId === personId;
                const secondHost = role === "host" && other.role === "host";
                if (!samePerson && !secondHost) continue;
                // The host message is the more useful one where both are
                // true, which is the common case of two tabs on one login
                if (secondHost) other.socket.close(4410, "hosting moved");
                else other.socket.close(4409, "joined elsewhere");
              }
            }

            // Viewers are invisible: no tile, no banner color, no
            // notification - the rest of the room never knows
            if (role === "viewer") break;
            broadcast(room, peer.id, { event: "peerJoined", data: peerSummary(peer) });
            // Multi-color banners: latecomers get the next palette color
            if (room.control.bannerMulti) {
              const used = Object.keys(room.control.bannerColors).length;
              room.control.bannerColors[peer.id] = BANNER_PALETTE[used % BANNER_PALETTE.length];
            }
            // Everyone refreshes control state (noise/color for the newcomer)
            broadcast(room, peer.id, { event: "control", data: room.control });
            const people = [...room.peers.values()].filter((p) => p.role !== "viewer");
            if (role === "guest" && people.length === 1) {
              notify("Guest waiting", `${name} just joined session ${room.id}.`).catch(() => {});
            }
            // Someone joining mid-recording starts recording too
            const rec = activeRecording(room.id);
            if (rec) {
              addPeerToRecording(rec, peer);
              socket.send(JSON.stringify({
                event: "recordingStarted",
                data: { upload: uploadCreds(rec, peer) }
              }));
            }
            break;
          }

          case "myBannerColor": {
            if (!peer) return fail("not joined");
            if (!room.control.bannerChoice) return fail("color choice is off");
            if (!BANNER_PALETTE.includes(String(data.color || ""))) return fail("pick from the palette");
            room.control.bannerColors[peer.id] = data.color;
            reply({});
            broadcast(room, null, { event: "control", data: room.control });
            break;
          }

          // A peer's own report that its microphone is not keeping up.
          // The figure is the running total for this take, so a late
          // message can never undo an earlier one; the host hears about
          // it while there is still time to do something.
          case "micTrouble": {
            if (!peer) return fail("not joined");
            const rec = activeRecording(room.id);
            const lostMs = Math.min(24 * 3600 * 1000, Math.max(0, Number(data.lostMs) || 0));
            if (rec) notePeerMicLoss(rec, personOf(peer), lostMs);
            reply({});
            for (const p of room.peers.values()) {
              if (p.role === "host" && p.socket.readyState === 1) {
                p.socket.send(JSON.stringify({
                  event: "micTrouble",
                  data: { peerId: peer.id, name: peer.name, lostMs }
                }));
              }
            }
            break;
          }

          // The browser's recorder has just started. It is a better
          // mark of where this person's stretch begins than the moment
          // they joined: a slow machine can take a few hundred
          // milliseconds to get going, and those are genuinely missing
          // from the front of what it recorded.
          case "recStarted": {
            if (!peer) return fail("not joined");
            const rec = activeRecording(room.id);
            if (rec) notePartStart(rec, peer);
            reply({});
            break;
          }

          case "raiseHand": {
            if (!peer) return fail("not joined");
            if (data.raised) room.control.hands[peer.id] = true;
            else delete room.control.hands[peer.id];
            reply({});
            broadcast(room, null, { event: "control", data: room.control });
            break;
          }

          case "selfMute": {
            if (!peer) return fail("not joined");
            // Mute is carried as silence in the track itself (the client
            // disables it); producers stay active so the recording keeps
            // receiving frames
            room.control.muted[peer.id] = !!data.muted;
            if (!data.muted) delete room.control.hands[peer.id];
            reply({});
            broadcast(room, null, { event: "control", data: room.control });
            break;
          }

          case "hostControl": {
            if (!peer || peer.role !== "host") return fail("host only");
            const c = room.control;
            switch (data.action) {
              case "layout": {
                c.layout = data.layout === "spotlight" ? "spotlight" : "grid";
                c.spotlightPeerId = c.layout === "spotlight" ? String(data.peerId || "") : null;
                break;
              }
              case "volume": {
                const v = Math.min(1.5, Math.max(0, Number(data.volume)));
                if (room.peers.has(data.peerId) && Number.isFinite(v)) c.volumes[data.peerId] = v;
                break;
              }
              case "autoGain":
                c.autoGain = !!data.enabled;
                break;
              case "bannerColor":
                if (/^#[0-9a-fA-F]{6}$/.test(String(data.color || ""))) {
                  c.bannerColor = String(data.color).toLowerCase();
                  c.bannerMulti = false;
                  c.bannerChoice = false;
                }
                break;
              case "bannerChoice": {
                // Guests choose their own from the palette; start from
                // auto-assigned colors so nobody is blank
                c.bannerChoice = true;
                c.bannerMulti = true;
                let ci2 = Object.keys(c.bannerColors).length;
                for (const p2 of room.peers.values()) {
                  if (!c.bannerColors[p2.id]) {
                    c.bannerColors[p2.id] = BANNER_PALETTE[ci2++ % BANNER_PALETTE.length];
                  }
                }
                break;
              }
              case "bannerMulti": {
                c.bannerMulti = true;
                c.bannerChoice = false;
                c.bannerColors = {};
                let ci = 0;
                for (const p2 of room.peers.values()) {
                  c.bannerColors[p2.id] = BANNER_PALETTE[ci++ % BANNER_PALETTE.length];
                }
                break;
              }
              case "lowerHand": {
                delete c.hands[data.peerId];
                break;
              }
              case "noise": {
                if (!room.peers.has(data.peerId)) return fail("no such guest");
                c.noise[data.peerId] = !!data.enabled;
                break;
              }
              case "mute": {
                const target = room.peers.get(data.peerId);
                if (!target) return fail("no such guest");
                c.muted[target.id] = !!data.muted;
                if (!data.muted) delete c.hands[target.id];
                break;
              }
              case "block": {
                // One click: bar this guest from every session on the
                // server (by IP and device marker), and drop them now.
                // Reversible from the dashboard's block list.
                const target = room.peers.get(data.peerId);
                if (!target) return fail("no such guest");
                if (target.role === "host") return fail("Hosts can't be blocked.");
                await addSessionBlock({
                  name: target.name, ip: target.ip || null,
                  marker: target.marker || null
                });
                // The close handler does the cleanup and the peerLeft
                target.socket.close(4403, "blocked");
                break;
              }
              case "titlePos": {
                // Host dragged the logo/title block; fractions of the
                // free space so every screen and the compositor agree
                const clamp = (v) => Math.min(1, Math.max(0, Number(v) || 0));
                const next = { x: clamp(data.x), y: clamp(data.y) };
                const prev = c.titlePos || { x: 0.5, y: 0 };
                if (next.x === prev.x && next.y === prev.y) break;
                c.titlePos = next;
                break;
              }
              case "titleScale": {
                c.titleScale = Math.min(2, Math.max(0.5, Number(data.scale) || 1));
                break;
              }
              case "backdrop": {
                // Switch the show's backdrop mid-show. Two ideas only:
                // color (solid, or the host's browser generates a
                // logo layout in that color and sends the PNG along,
                // like banner snapshots), or the pinned wallpaper.
                // Everyone's screen follows; a recording keeps the
                // backdrop it started with, like titlePos.
                const mode = String(data.mode || "");
                if (!["colour", "wallpaper", "generated"].includes(mode)) return fail("bad backdrop");
                const t = room.theme;
                if (mode === "wallpaper" && !t.wallpaperPath) return fail("No wallpaper uploaded in Themes.");
                if (data.colour != null) {
                  if (!/^#[0-9a-fA-F]{6}$/.test(String(data.colour))) return fail("bad color");
                  t.bg = String(data.colour).toLowerCase();
                  // The in-show pick is the color setting now - it
                  // persists as the next session's starting color
                  updateSettings({ bg: t.bg }).catch(() => {});
                }
                if (mode === "generated") {
                  const PREFIX = "data:image/png;base64,";
                  if (typeof data.png !== "string" || !data.png.startsWith(PREFIX) ||
                      data.png.length > 6_000_000) {
                    return fail("bad backdrop image");
                  }
                  const buf = Buffer.from(data.png.slice(PREFIX.length), "base64");
                  const dir = path.join(config.dataDir, "banners", room.id);
                  await fs.mkdir(dir, { recursive: true });
                  await fs.writeFile(path.join(dir, "theme-backdrop.png"), buf);
                  t.backdropPath = path.join(dir, "theme-backdrop.png");
                  t.backdropUrl = `/api/room-theme/${room.id}/backdrop`;
                }
                t.active = mode;
                t.rev++;
                c.backdrop = { mode, colour: t.bg, style: data.style || null };
                broadcast(room, null, {
                  event: "theme",
                  data: { bg: t.bg, wallpaper: activeBackdropUrl(room) }
                });
                break;
              }
              case "titleBg": {
                // Background color of the logo/title block; the host's
                // browser redraws the block PNG with it, so the recording
                // follows automatically
                if (data.color !== null && !/^#[0-9a-fA-F]{6}$/.test(String(data.color))) {
                  return fail("bad color");
                }
                c.titleBg = data.color ? String(data.color).toLowerCase() : null;
                break;
              }
              case "titleLayout": {
                // Where the logo sits relative to the title. Only the
                // host's browser needs it (it redraws and re-uploads
                // the block PNG); everyone mirrors it on screen.
                if (!["left", "right", "top", "bottom"].includes(data.layout)) {
                  return fail("unknown layout");
                }
                c.titleLayout = data.layout;
                break;
              }
              case "titleShow": {
                // Dropping the logo or the title only changes what the
                // host's browser draws into the block PNG, which it
                // re-uploads; the compositors need no say in it.
                c.titleShow = {
                  logo: data.logo !== false,
                  text: data.text !== false
                };
                break;
              }
              case "muteAll": {
                const muted = data.muted !== false; // default: mute
                for (const p2 of room.peers.values()) {
                  // Everyone means everyone - the host included
                  c.muted[p2.id] = muted;
                  if (muted) delete c.hands[p2.id];
                }
                break;
              }
              case "overlay": {
                if (!["subscribe", "ad"].includes(data.kind)) return fail("unknown overlay");
                let url = null;
                if (data.kind === "ad") {
                  const settings2 = await getSettings();
                  if (!settings2.adBanner) {
                    return fail("Upload an advertising banner in Settings → Ad Banner first.");
                  }
                  url = "/api/adbanner";
                }
                const duration = data.kind === "subscribe" ? 7 : 18;
                // Everyone sees it in the session immediately
                broadcast(room, null, { event: "overlay", data: { kind: data.kind, duration, url } });
                return reply({});
              }
              case "record": {
                if (data.start) {
                  const rec = await startRecording(room, await getSettings());
                  for (const p of room.peers.values()) {
                    if (p.socket.readyState === 1) {
                      p.socket.send(JSON.stringify({
                        event: "recordingStarted",
                        data: {
                          upload: uploadCreds(rec, p)
                        }
                      }));
                    }
                  }
                } else {
                  // Tell everyone first: their recorders need a moment to
                  // flush the last chunk
                  broadcast(room, null, { event: "recordingStopped", data: {} });
                  await stopRecording(room);
                }
                return reply({});
              }
              default:
                return fail("unknown control action");
            }
            reply({});
            broadcast(room, null, { event: "control", data: c });
            break;
          }

          case "createTransport": {
            if (!peer) return fail("not joined");
            const transport = await createWebRtcTransport(room.router);
            peer.transports.set(transport.id, transport);
            transport.on("dtlsstatechange", (s) => {
              if (s === "closed") peer.transports.delete(transport.id);
            });
            reply({
              id: transport.id,
              iceParameters: transport.iceParameters,
              iceCandidates: transport.iceCandidates,
              dtlsParameters: transport.dtlsParameters
            });
            break;
          }

          case "connectTransport": {
            if (!peer) return fail("not joined");
            const transport = peer.transports.get(data.transportId);
            if (!transport) return fail("no such transport");
            await transport.connect({ dtlsParameters: data.dtlsParameters });
            reply({});
            break;
          }

          case "produce": {
            if (!peer) return fail("not joined");
            if (peer.role === "viewer") return fail("view-only connection");
            const transport = peer.transports.get(data.transportId);
            if (!transport) return fail("no such transport");
            const source = String(data.source || data.kind).slice(0, 20);
            const producer = await transport.produce({
              kind: data.kind,
              rtpParameters: data.rtpParameters,
              appData: { source }
            });
            peer.producers.set(producer.id, producer);
            producer.on("transportclose", () => peer.producers.delete(producer.id));
            reply({ producerId: producer.id });
            broadcast(room, peer.id, {
              event: "newProducer",
              data: {
                peerId: peer.id, producerId: producer.id, kind: producer.kind,
                source: producer.appData?.source || producer.kind
              }
            });
            break;
          }

          case "closeProducer": {
            if (!peer) return fail("not joined");
            const producer = peer.producers.get(data.producerId);
            if (producer) {
              producer.close();
              peer.producers.delete(producer.id);
              broadcast(room, peer.id, {
                event: "producerClosed",
                data: { peerId: peer.id, producerId: data.producerId }
              });
            }
            reply({});
            break;
          }

          case "consume": {
            if (!peer) return fail("not joined");
            const transport = peer.transports.get(data.transportId);
            if (!transport) return fail("no such transport");
            if (!room.router.canConsume({
              producerId: data.producerId,
              rtpCapabilities: data.rtpCapabilities
            })) return fail("cannot consume");
            const consumer = await transport.consume({
              producerId: data.producerId,
              rtpCapabilities: data.rtpCapabilities,
              paused: true
            });
            peer.consumers.set(consumer.id, consumer);
            consumer.on("transportclose", () => peer.consumers.delete(consumer.id));
            consumer.on("producerclose", () => {
              peer.consumers.delete(consumer.id);
              if (socket.readyState === 1) {
                socket.send(JSON.stringify({
                  event: "consumerClosed", data: { consumerId: consumer.id }
                }));
              }
            });
            reply({
              consumerId: consumer.id,
              producerId: data.producerId,
              kind: consumer.kind,
              rtpParameters: consumer.rtpParameters
            });
            break;
          }

          case "resumeConsumer": {
            if (!peer) return fail("not joined");
            const consumer = peer.consumers.get(data.consumerId);
            if (!consumer) return fail("no such consumer");
            await consumer.resume();
            reply({});
            break;
          }

          default:
            fail(`unknown method: ${String(method).slice(0, 40)}`);
        }
      } catch (err) {
        if (err.code === "ROOM_FULL") return fail("session full");
        console.error(`signaling error in ${method}:`, err.message);
        fail("server error");
      }
    });

    socket.on("close", () => {
      if (!peer) return;
      if (peer.role === "viewer") {
        // Invisible on the way out too: no peerLeft
        removePeer(room, peer.id);
        return;
      }
      const rec = activeRecording(room.id);
      // Nothing more is coming from this connection. If it was the
      // person's last one they may still be back before the take ends,
      // and their next stretch goes into the same track.
      if (rec) notePeerGone(rec, peer);
      removePeer(room, peer.id);
      broadcast(room, null, { event: "peerLeft", data: { peerId: peer.id } });
      // Last one out stops the tape (lingering viewers don't count)
      const left = [...room.peers.values()].filter((p) => p.role !== "viewer").length;
      if (rec && left === 0) {
        stopRecording(room).catch((e) => console.error("auto-stop failed:", e.message));
      }
    });
  });

  return wss;
}
