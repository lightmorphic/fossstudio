/* The programme mixer: the host's browser draws the show.
 *
 * Everything the audience will see is already in the host's browser -
 * every face, a shared screen, the lower thirds, the title block, an
 * intro, an overlay. So rather than describing that picture to the
 * server and having it draw a second copy with ffmpeg, this browser
 * paints the show onto a 1280x720 canvas thirty times a second, mixes
 * every voice into one track, and encodes the result once. The server
 * passes it on to YouTube and the watch page without touching a pixel,
 * which is what lets a live show cost it a fraction of a core instead
 * of two whole ones.
 *
 * The geometry is the recording's geometry, not the screen's: a host's
 * window is whatever shape their laptop is, but the programme is always
 * the same 16:9 frame the server compositor drew, laid out by the same
 * fractions (LAYOUT in server/src/composite.js; geometry-test.mjs keeps
 * the two in step). What the DOM contributes is the facts - who is in
 * the room, in what order, which layout is on, which banner is theirs.
 */
(() => {
  "use strict";

  const W = 1280, H = 720, FPS = 30;

  // Fractions of frame width, as in server/src/composite.js
  const PAD = Math.round(W * (24 / 1280));
  const GAP = Math.round(W * (20 / 1280));
  const RAD = Math.round(W * (16 / 1280));
  const STRIP = 0.16;
  const SHARE = 0.72;
  const TITLE_W = 286 / 1280;
  const TITLE_TOP_INSET = 14;

  const even = (v) => Math.max(2, 2 * Math.floor(v / 2));

  function gridLayout(n) {
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const availW = W - 2 * PAD, availH = H - 2 * PAD;
    const tileW = even(Math.min((availW - (cols - 1) * GAP) / cols,
      ((availH - (rows - 1) * GAP) / rows) * 16 / 9));
    const tileH = even(tileW * 9 / 16);
    const base = Math.floor(n / rows), extra = n % rows;
    const rowSizes = Array.from({ length: rows }, (_, r) => base + (r < extra ? 1 : 0));
    const blockH = rows * tileH + (rows - 1) * GAP;
    const startY = Math.round(PAD + Math.max(0, (availH - blockH) / 2));
    const tiles = [];
    rowSizes.forEach((size, r) => {
      const rowW = size * tileW + (size - 1) * GAP;
      const x0 = Math.round(PAD + (availW - rowW) / 2);
      for (let c = 0; c < size; c++) {
        tiles.push({ x: x0 + c * (tileW + GAP), y: startY + r * (tileH + GAP), w: tileW, h: tileH });
      }
    });
    return tiles;
  }

  function spotlightLayout(n) {
    const availW = W - 2 * PAD, availH = H - 2 * PAD;
    const others = n - 1;
    if (others < 1) return [{ x: PAD, y: PAD, w: even(availW), h: even(availH) }];
    const stripH = even(H * STRIP);
    const featuredH = even(availH - stripH - GAP);
    const otherW = even((availW - (others - 1) * GAP) / others);
    const stripY = PAD + featuredH + GAP;
    const tiles = [{ x: PAD, y: PAD, w: even(availW), h: featuredH }];
    for (let i = 0; i < others; i++) {
      tiles.push({ x: Math.round(PAD + i * (otherW + GAP)), y: stripY, w: otherW, h: stripH });
    }
    return tiles;
  }

  function tileLayout(n, spotIndex) {
    if (n < 1) return [];
    if (spotIndex < 0 || spotIndex >= n || n === 1) return gridLayout(n);
    const boxes = spotlightLayout(n);
    const out = new Array(n);
    out[spotIndex] = boxes[0];
    let s = 1;
    for (let i = 0; i < n; i++) if (i !== spotIndex) out[i] = boxes[s++];
    return out;
  }

  function shareLayout(nOthers) {
    const availH = H - 2 * PAD;
    const screenW = even(W * SHARE);
    const screen = { x: PAD, y: PAD, w: screenW, h: even(availH) };
    const colX = PAD + screenW + GAP;
    const colW = W - PAD - colX;
    const tiles = [];
    if (nOthers > 0) {
      const idealH = even(colW * 9 / 16);
      const tileH = even(Math.min(idealH, (availH - (nOthers - 1) * GAP) / nOthers));
      const tileW = even(tileH * 16 / 9);
      const blockH = nOthers * tileH + (nOthers - 1) * GAP;
      const y0 = Math.round(PAD + Math.max(0, (availH - blockH) / 2));
      const x0 = Math.round(colX + (colW - tileW) / 2);
      for (let i = 0; i < nOthers; i++) tiles.push({ x: x0, y: y0 + i * (tileH + GAP), w: tileW, h: tileH });
    }
    return { screen, tiles };
  }

  function clipRound(x, b) {
    x.beginPath();
    x.roundRect(b.x, b.y, b.w, b.h, RAD);
    x.clip();
  }

  // Draw a source covering the box (crop) or fitting inside it (pad)
  function drawFit(x, src, sw, sh, b, mode) {
    if (!sw || !sh) return;
    const scale = mode === "pad" ? Math.min(b.w / sw, b.h / sh) : Math.max(b.w / sw, b.h / sh);
    const w = sw * scale, h = sh * scale;
    if (mode === "pad") { x.fillStyle = "#000"; x.fillRect(b.x, b.y, b.w, b.h); }
    x.drawImage(src, b.x + (b.w - w) / 2, b.y + (b.h - h) / 2, w, h);
  }

  const ready = (v) => v && v.readyState >= 2 && v.videoWidth > 0;

  // The subscribe reminder, drawn rather than played from a file: the
  // same dark pill the screen shows, centred at the foot of the frame,
  // with the red button, the bell and the three lines. Drawing it means
  // it looks the same in every browser and needs nothing decoded.
  function drawSubscribe(x) {
    const em = 20.8;                       // 1.3rem, the DOM's size on a wide screen
    const padX = 1.6 * em, padY = 0.9 * em, gap = 1.4 * em;
    x.font = `800 ${1.25 * em}px Manrope, sans-serif`;
    const btnText = "SUBSCRIBE";
    const btnW = x.measureText(btnText).width + 2.4 * em, btnH = 1.25 * em + 1.1 * em;
    const bell = 2.1 * em;
    x.font = `700 ${em}px Manrope, sans-serif`;
    const l1 = "Enjoying the show?";
    x.font = `500 ${0.9 * em}px Manrope, sans-serif`;
    const l2 = "Subscribe and turn on";
    x.font = `800 ${0.9 * em}px Manrope, sans-serif`;
    const l3 = "ALL NOTIFICATIONS";
    x.font = `700 ${em}px Manrope, sans-serif`;
    const textW = Math.max(x.measureText(l1).width, x.measureText(l2).width, x.measureText(l3).width);
    const textH = em * 1.15 + 0.9 * em * 1.15 * 2;
    const w = padX * 2 + btnW + gap + bell + gap + textW;
    const h = padY * 2 + Math.max(btnH, bell, textH);
    const px = (W - w) / 2, py = H - 20 - h;

    x.fillStyle = "rgba(17, 19, 24, 0.92)";
    x.strokeStyle = "rgba(255, 255, 255, 0.14)";
    x.lineWidth = 1;
    x.beginPath(); x.roundRect(px, py, w, h, 1.2 * em); x.fill(); x.stroke();

    // the red button
    let cx = px + padX;
    const cy = py + h / 2;
    const grad = x.createLinearGradient(cx, cy - btnH / 2, cx + btnW, cy + btnH / 2);
    grad.addColorStop(0, "#ff3b30"); grad.addColorStop(1, "#e60023");
    x.fillStyle = grad;
    x.beginPath(); x.roundRect(cx, cy - btnH / 2, btnW, btnH, 999); x.fill();
    x.fillStyle = "#fff";
    x.font = `800 ${1.25 * em}px Manrope, sans-serif`;
    x.textBaseline = "middle"; x.textAlign = "center";
    x.fillText(btnText, cx + btnW / 2, cy + 1);
    cx += btnW + gap;

    // the bell: a dome on a rim, with a clapper
    x.strokeStyle = "#fbc711"; x.fillStyle = "#fbc711"; x.lineWidth = 0.14 * em;
    x.lineCap = "round"; x.lineJoin = "round";
    const bx = cx + bell / 2, by = cy, r = bell * 0.34;
    x.beginPath();
    x.arc(bx, by - r * 0.15, r, Math.PI, 0);
    x.lineTo(bx + r, by + r * 0.55);
    x.lineTo(bx + r * 1.25, by + r * 0.85);
    x.lineTo(bx - r * 1.25, by + r * 0.85);
    x.lineTo(bx - r, by + r * 0.55);
    x.closePath(); x.stroke();
    x.beginPath(); x.arc(bx, by + r * 1.15, r * 0.28, 0, Math.PI * 2); x.fill();
    cx += bell + gap;

    // the words
    x.fillStyle = "#fff"; x.textAlign = "left";
    let ty = cy - textH / 2 + em * 0.6;
    x.font = `700 ${em}px Manrope, sans-serif`; x.fillText(l1, cx, ty);
    ty += em * 1.15;
    x.fillStyle = "rgba(255,255,255,0.85)";
    x.font = `500 ${0.9 * em}px Manrope, sans-serif`; x.fillText(l2, cx, ty);
    ty += 0.9 * em * 1.15;
    x.fillStyle = "#fff";
    x.font = `800 ${0.9 * em}px Manrope, sans-serif`; x.fillText(l3, cx, ty);
    x.textBaseline = "alphabetic";
  }

  function create(opts) {
    const {
      grid, tiles, control, shareVideo, introOverlay, introVideo,
      audioContext, bannerImage, titleImage, tickWorkerUrl
    } = opts;

    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const x = canvas.getContext("2d", { alpha: false });
    x.imageSmoothingQuality = "high";

    let ticker = null, stream = null, dest = null;
    let wallpaper = { url: "", img: null };
    const introSources = new WeakMap();

    const mixer = {
      running: false,
      canvas,
      // Everything that should be heard connects here; session.js wires
      // guests, the host's own mic and the soundboard into it.
      get audioDest() { return dest; },
      start, stop, drawOnce: draw
    };

    function start() {
      if (mixer.running) return stream;
      dest = audioContext().createMediaStreamDestination();
      // A worker's clock, not requestAnimationFrame: page timers stop in
      // a hidden tab, and a host reading their notes in another tab must
      // not freeze the show.
      ticker = new Worker(tickWorkerUrl);
      ticker.onmessage = draw;
      draw();
      const video = canvas.captureStream(FPS).getVideoTracks()[0];
      stream = new MediaStream([video, ...dest.stream.getAudioTracks()]);
      mixer.running = true;
      return stream;
    }

    function stop() {
      if (!mixer.running) return;
      ticker?.terminate();
      ticker = null;
      for (const t of stream.getTracks()) t.stop();
      stream = null;
      dest = null;
      mixer.running = false;
    }

    // The people in the picture, in the order the compositors use:
    // hosts first, then everyone else in join order - which is the
    // order the DOM already keeps its tiles in.
    function people() {
      const list = [];
      for (const el of grid.querySelectorAll(".tile")) {
        const id = el.dataset.peerId;
        const tile = tiles.get(id);
        if (tile) list.push({ id, tile });
      }
      return list;
    }

    function draw() {
      const c = control();
      const cs = getComputedStyle(grid);

      // Background: the session colour, then the wallpaper over it
      x.fillStyle = cs.backgroundColor || "#14161a";
      x.fillRect(0, 0, W, H);
      const bgUrl = /url\("?([^")]+)"?\)/.exec(cs.backgroundImage || "")?.[1] || "";
      if (bgUrl !== wallpaper.url) {
        wallpaper = { url: bgUrl, img: null };
        if (bgUrl) {
          const img = new Image();
          img.onload = () => { if (wallpaper.url === bgUrl) wallpaper.img = img; };
          img.src = bgUrl;
        }
      }
      if (wallpaper.img) drawFit(x, wallpaper.img, wallpaper.img.naturalWidth, wallpaper.img.naturalHeight, { x: 0, y: 0, w: W, h: H }, "crop");

      const list = people();
      const sharing = !!c.sharePeerId && ready(shareVideo);
      let boxes;
      if (sharing) {
        const sl = shareLayout(list.length);
        x.save();
        clipRound(x, sl.screen);
        drawFit(x, shareVideo, shareVideo.videoWidth, shareVideo.videoHeight, sl.screen, "pad");
        x.restore();
        boxes = sl.tiles;
      } else {
        const spot = c.layout === "spotlight" ? list.findIndex((p) => p.id === c.spotlightPeerId) : -1;
        boxes = tileLayout(list.length, spot);
      }

      list.forEach(({ id, tile }, i) => {
        const b = boxes[i];
        if (!b) return;
        x.save();
        clipRound(x, b);
        if (ready(tile.video)) {
          drawFit(x, tile.video, tile.video.videoWidth, tile.video.videoHeight, b, "crop");
        } else {
          x.fillStyle = "#1e2127";
          x.fillRect(b.x, b.y, b.w, b.h);
        }
        // The lower third: the same PNG the recording overlays, at the
        // same scale (drawn for a 2000px-wide tile)
        const banner = bannerImage(id);
        if (banner && banner.naturalWidth) {
          const s = b.w / 2000;
          const bw = banner.naturalWidth * s, bh = banner.naturalHeight * s;
          x.drawImage(banner, b.x, b.y + b.h - bh, bw, bh);
        }
        x.restore();
      });

      // The episode title block, where the host dragged it - the same
      // formula as the compositors' overlay
      const title = titleImage();
      if (title && title.naturalWidth) {
        const pos = c.titlePos || { x: 0.5, y: 0 };
        const scale = Math.min(2, Math.max(0.5, Number(c.titleScale) || 1));
        const tw = Math.round(W * TITLE_W * scale / 2) * 2;
        const th = tw * title.naturalHeight / title.naturalWidth;
        const px = Number(pos.x) || 0, py = Number(pos.y) || 0;
        x.drawImage(title, (W - tw) * px, (H - th) * py + TITLE_TOP_INSET * (1 - py), tw, th);
      }

      // Subscribe reminder and sponsor banner: the DOM slides them in and
      // out; here they sit where the compositors put them, and fade with
      // the DOM's own opacity so the timing is the same
      for (const ov of grid.querySelectorAll(".live-overlay")) {
        const alpha = parseFloat(getComputedStyle(ov).opacity);
        if (!(alpha > 0)) continue;
        x.save();
        x.globalAlpha = alpha;
        if (ov.classList.contains("ad")) {
          const img = ov.querySelector("img");
          if (img && img.naturalWidth) {
            const h = 150, w = img.naturalWidth * h / img.naturalHeight;
            x.drawImage(img, W - w - 24, H - h - 24, w, h);
          }
        } else {
          drawSubscribe(x);
        }
        x.restore();
      }

      // A fullscreen intro, fading in and out as it does on screen
      if (introOverlay && !introOverlay.hidden && ready(introVideo)) {
        const alpha = parseFloat(getComputedStyle(introOverlay).opacity);
        if (alpha > 0) {
          x.save();
          x.globalAlpha = alpha;
          drawFit(x, introVideo, introVideo.videoWidth, introVideo.videoHeight, { x: 0, y: 0, w: W, h: H }, "pad");
          x.restore();
        }
        // and its sound, wired once
        if (dest && !introSources.has(introVideo)) {
          try {
            const cap = introVideo.captureStream ? introVideo.captureStream() : null;
            const at = cap && cap.getAudioTracks()[0];
            if (at) {
              const src = audioContext().createMediaStreamSource(new MediaStream([at]));
              src.connect(dest);
              introSources.set(introVideo, src);
            }
          } catch { /* no intro sound on the feed; the picture still goes out */ }
        }
      }
    }

    return mixer;
  }

  window.FSMixer = { create, W, H, FPS, tileLayout, shareLayout };
})();
