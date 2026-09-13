// Post-processing: per-participant FLAC + one combined grid MKV.
// Runs after the session ends - speed doesn't matter, so everything is
// niced right down to keep sessions in progress smooth.
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { recDir } from "./manager.js";
import { titleWidth, LAYOUT, tileLayout } from "../composite.js";
import { fileURLToPath } from "node:url";

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "assets");

function ffmpeg(args, label) {
  return new Promise((resolve, reject) => {
    const p = spawn("nice", ["-n", "15", "ffmpeg", "-nostdin", "-loglevel", "error", ...args]);
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) => code === 0
      ? resolve()
      : reject(new Error(`${label}: ffmpeg exited ${code}: ${err.slice(-400)}`)));
  });
}

async function exists(f) {
  return fs.access(f).then(() => true, () => false);
}

// Duration of a media file in seconds (0 if unknown). Used to hard-cap
// the combined render: its background is an endless looped image, and
// -shortest doesn't reliably terminate that with browser-recorded WebM.
function probeDuration(file) {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration",
      "-of", "default=nk=1:nw=1", file]);
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.on("error", () => resolve(0));
    p.on("close", () => resolve(parseFloat(out) || 0));
  });
}

function safeName(name, used) {
  let base = name.replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 30) || "guest";
  let candidate = base, i = 2;
  while (used.has(candidate)) candidate = `${base}-${i++}`;
  used.add(candidate);
  return candidate;
}

export async function processRecording(rec) {
  const dir = recDir(rec.id);
  const raw = path.join(dir, "raw");
  const out = path.join(dir, "out");
  await fs.mkdir(out, { recursive: true });

  const files = [];
  const used = new Set();
  // Per participant: which input file carries their video / audio.
  // Server mode: one file has both. Browser mode: two separate files.
  const parts = []; // {name, offsetMs, videoFile, audioFile}
  let maxEnd = 0;   // latest (offset + duration) across participants, seconds

  for (const [peerId, p] of rec.peers) {
    const name = safeName(p.name, used);
    const audioFile = rec.mode === "server"
      ? (p.files.server && path.join(raw, p.files.server))
      : (p.files.audio && path.join(raw, p.files.audio));
    const videoFile = rec.mode === "server"
      ? audioFile
      : (p.files.video && path.join(raw, p.files.video));
    const bannerFile = path.join(raw, p.banner || `banner-${peerId}.png`);
    const part = {
      name,
      peerId,
      role: p.role,
      offsetMs: p.startOffsetMs || 0,
      audioFile: audioFile && await exists(audioFile) ? audioFile : null,
      videoFile: videoFile && await exists(videoFile) ? videoFile : null,
      bannerFile: await exists(bannerFile) ? bannerFile : null
    };

    // Lossless FLAC per participant
    if (part.audioFile) {
      const flac = `${name}.flac`;
      // Mono: mics are one channel, but the capture arrives as stereo
      // with the voice in the left - keep just that channel
      await ffmpeg(["-i", part.audioFile, "-map", "0:a:0", "-af", "pan=mono|c0=c0",
        "-c:a", "flac", "-y", path.join(out, flac)],
        `flac ${name}`);
      files.push(flac);
      // FLAC carries a real duration (the source WebM often doesn't) -
      // use it to cap the combined render's length
      const dur = await probeDuration(path.join(out, flac));
      if (dur > 0) maxEnd = Math.max(maxEnd, (part.offsetMs || 0) / 1000 + dur);
    }
    if (part.audioFile || part.videoFile) parts.push(part);
  }

  // The host's browser may have recorded the programme itself - the
  // very picture and sound everyone saw. Then the combined
  // file is that, copied into an MP4 with the audio turned to AAC, and
  // the grid render below never runs: no libx264, no compositing, a
  // few seconds of audio work on a machine that would otherwise spend
  // minutes of a whole core on a long show.
  const programmeFile = [...rec.peers.values()]
    .map((p) => p.files.programme && path.join(raw, p.files.programme))
    .find(Boolean);
  if (programmeFile && await exists(programmeFile)) {
    await ffmpeg(["-i", programmeFile,
      "-map", "0:v:0", "-map", "0:a:0?",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      "-y", path.join(out, "combined.mp4")], "combined (programme)");
    files.push("combined.mp4");
    // The same mix, lossless, the way the grid render provides it
    await ffmpeg(["-i", programmeFile, "-map", "0:a:0", "-vn",
      "-c:a", "flac", "-y", path.join(out, "combined.flac")], "combined.flac (programme)")
      .then(() => files.push("combined.flac"))
      .catch(() => { /* a silent programme has no audio track to keep */ });
    return files;
  }

  // Combined grid MKV: video tiles stacked, all audio mixed.
  // Host top-left, like every screen.
  const videos = parts.filter((p) => p.videoFile)
    .sort((a, b) => (b.role === "host") - (a.role === "host"));
  const audios = parts.filter((p) => p.audioFile);
  if (videos.length > 0) {
    const args = [];
    const inputIdx = new Map(); // file -> ffmpeg input index
    const addInput = (file, offsetMs) => {
      if (inputIdx.has(file)) return inputIdx.get(file);
      const idx = inputIdx.size;
      args.push("-itsoffset", (offsetMs / 1000).toFixed(3), "-i", file);
      inputIdx.set(file, idx);
      return idx;
    };
    for (const p of parts) {
      if (p.videoFile) p.vIdx = addInput(p.videoFile, p.offsetMs);
      if (p.audioFile) p.aIdx = addInput(p.audioFile, p.offsetMs);
    }

    // Presentation matches the on-screen grid: a background (the session
    // wallpaper if set, else its colour), gaps between tiles, and subtly
    // rounded corners. Canvas is a fixed 1280x720.
    const W = 1280, H = 720;
    // Same fractions the on-screen grid uses of its video area
    const PAD = Math.round(W * LAYOUT.pad);
    const GAP = Math.round(W * LAYOUT.gap);
    const RAD = Math.round(W * LAYOUT.radius);
    const n = videos.length;
    // Spotlight puts one person above a strip of everyone else, exactly
    // as the session view does; -1 means the plain even grid
    const spotIndex = rec.layout === "spotlight" && rec.spotlightPeerId
      ? videos.findIndex((p) => p.peerId === rec.spotlightPeerId)
      : -1;
    const boxes = tileLayout(n, spotIndex, W, H);

    // Rounded-corner alpha masks (white rounded rect on black). Spotlight
    // tiles are not all one size, so there is one mask per distinct size.
    const sizeKey = (b) => `${b.w}x${b.h}`;
    const maskPaths = new Map();
    for (const key of new Set(boxes.map(sizeKey))) {
      const [mw, mh] = key.split("x").map(Number);
      const file = path.join(raw, `cornermask-${key}.png`);
      await ffmpeg(["-f", "lavfi", "-i", `color=black:s=${mw}x${mh}`, "-vf",
        `format=gray,geq=lum='lte(pow(max(0\\,max(${RAD}-X\\,X-(W-${RAD})))\\,2)+pow(max(0\\,max(${RAD}-Y\\,Y-(H-${RAD})))\\,2)\\,pow(${RAD}\\,2))*255'`,
        "-frames:v", "1", "-y", file], `cornermask ${key}`);
      maskPaths.set(key, file);
    }

    // Background input: wallpaper if set, else the session colour. The
    // wallpaper is pre-scaled to the canvas once here (a single frame) so
    // the main graph doesn't re-scale a full-size image every frame.
    let bgIdx = inputIdx.size;
    if (rec.wallpaper && await exists(rec.wallpaper)) {
      const bgPre = path.join(raw, "bg.png");
      await ffmpeg(["-i", rec.wallpaper, "-vf",
        `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`,
        "-frames:v", "1", "-y", bgPre], "bg-prescale");
      args.push("-loop", "1", "-i", bgPre);
    } else {
      const hex = (rec.bg && /^#[0-9a-fA-F]{6}$/.test(rec.bg)) ? rec.bg.slice(1) : "14161a";
      args.push("-f", "lavfi", "-i", `color=c=0x${hex}:s=${W}x${H}`);
    }
    inputIdx.set("__bg", bgIdx);
    const maskIdxBySize = new Map();
    for (const [key, file] of maskPaths) {
      const idx = inputIdx.size;
      args.push("-loop", "1", "-i", file);
      inputIdx.set(`__mask_${key}`, idx);
      maskIdxBySize.set(key, idx);
    }

    // The host uploads each on-screen lower-third as a PNG (ffmpeg can't
    // draw text); overlay it bottom-left of the tile, like the DOM does
    for (const p of videos) { if (p.bannerFile) p.bnIdx = addInput(p.bannerFile, 0); }
    // Banner PNGs are drawn at 20px per cqw (tile = 2000px design width)
    // and now hug their text, so scale each by its own tile's width
    const bannerScale = (w) => `scale=w=trunc(iw*${w}/4000)*2:h=-2`;

    const gp = [];
    gp.push(`[${bgIdx}:v]setsar=1[bg]`);
    // One mask per distinct tile size, split between the tiles using it
    for (const [key, mIdx] of maskIdxBySize) {
      const users = boxes.map((b, i) => (sizeKey(b) === key ? i : -1)).filter((i) => i >= 0);
      const [mw, mh] = key.split("x").map(Number);
      gp.push(`[${mIdx}:v]format=gray,scale=${mw}:${mh},setsar=1[mk${key}];` +
        `[mk${key}]split=${users.length}${users.map((i) => `[m${i}]`).join("")}`);
    }
    videos.forEach((p, i) => {
      const b = boxes[i];
      let t = `[${p.vIdx}:v]scale=${b.w}:${b.h}:force_original_aspect_ratio=increase,` +
        `crop=${b.w}:${b.h}:(iw-${b.w})/2:(ih-${b.h})/2,setsar=1`;
      if (p.bnIdx != null) {
        t += `[tb${i}];[${p.bnIdx}:v]${bannerScale(b.w)}[bn${i}];` +
          `[tb${i}][bn${i}]overlay=x=0:y=main_h-overlay_h:eof_action=repeat[tt${i}];` +
          `[tt${i}][m${i}]alphamerge[rt${i}]`;
      } else {
        t += `[tt${i}];[tt${i}][m${i}]alphamerge[rt${i}]`;
      }
      gp.push(t);
    });
    let prev = "[bg]";
    videos.forEach((_, i) => {
      const out = i === n - 1 ? "[vout]" : `[og${i}]`;
      gp.push(`${prev}[rt${i}]overlay=${boxes[i].x}:${boxes[i].y}${out}`);
      prev = out;
    });
    const grid = gp.join(";");
    // Episode-title chip, top-centre - same as it floats over the grid
    let finalLabel = "[vout]";
    let overlayFilters = "";
    const titleFile = rec.titleFile && path.join(raw, rec.titleFile);
    if (titleFile && await exists(titleFile)) {
      const ti = addInput(titleFile, 0);
      const pos = rec.titlePos || { x: 0.5, y: 0 };
      const px = Number(pos.x).toFixed(3), py = Number(pos.y).toFixed(3);
      const tw = titleWidth(rec.titleScale);
      overlayFilters += `;[${ti}:v]scale=${tw}:-2[tls];${finalLabel}[tls]overlay=` +
        `x=(main_w-overlay_w)*${px}:y=(main_h-overlay_h)*${py}+14*(1-${py}):eof_action=repeat[vtl]`;
      finalLabel = "[vtl]";
    }
    // Bake in any overlays triggered during the recording
    (rec.overlays || []).forEach((ov, i) => {
      const t0 = (ov.offsetMs / 1000).toFixed(2);
      const dur = ov.kind === "subscribe" ? 6 : 18;
      const t1 = (Number(t0) + dur).toFixed(2);
      const oi = inputIdx.size;
      const slide = (m) =>
        `'main_h-(overlay_h+${m})*clip(min((t-${t0})/0.5\,(${t1}-t)/0.5)\,0\,1)'`;
      if (ov.kind === "subscribe") {
        args.push("-itsoffset", t0, "-i", path.join(ASSETS, "subscribe.mp4"));
        inputIdx.set(`__ov${i}`, oi);
        overlayFilters += `;[${oi}:v]scale=${W}:-2[ovs${i}];${finalLabel}[ovs${i}]overlay=x=0:y=${slide(0)}:eof_action=pass:enable='between(t\,${t0}\,${t1})'[vo${i}]`;
      } else if (ov.file) {
        args.push("-loop", "1", "-i", path.join(raw, ov.file));
        inputIdx.set(`__ov${i}`, oi);
        overlayFilters += `;[${oi}:v]scale=-2:150[ovs${i}];${finalLabel}[ovs${i}]overlay=x=main_w-overlay_w-24:y=${slide(24)}:eof_action=pass:enable='between(t\,${t0}\,${t1})'[vo${i}]`;
      } else { return; }
      finalLabel = `[vo${i}]`;
    });

    // Combined-audio mix: every participant, folded to mono first (voices
    // arrive as stereo with the sound only in the left channel), so the
    // mix and the MP4 are mono.
    let audioFilters = "";
    audios.forEach((p, i) => { audioFilters += `;[${p.aIdx}:a]pan=mono|c0=c0[pmono${i}]`; });
    const mixLabels = audios.map((_, i) => `[pmono${i}]`);
    // Split the final mix: one copy feeds the MP4's AAC track, the other
    // becomes a standalone lossless combined.flac - everyone's voice
    // merged into one file, full quality.
    const amix = mixLabels.length === 0
      ? null
      : mixLabels.length === 1
        ? `${mixLabels[0]}asplit=2[aout][aoutflac]`
        : `${mixLabels.join("")}amix=inputs=${mixLabels.length}:normalize=0[aoutmix];[aoutmix]asplit=2[aout][aoutflac]`;

    // Hard duration cap: the background is an endless looped source, and
    // -shortest doesn't reliably terminate it with browser-recorded WebM.
    // -t stops the muxer at the real session length no matter what.
    const capArgs = maxEnd > 0 ? ["-t", (maxEnd + 0.3).toFixed(2)] : [];

    await ffmpeg([
      ...args,
      "-filter_complex",
      grid + audioFilters + (amix ? ";" + amix : "") + overlayFilters,
      "-map", finalLabel, ...(amix ? ["-map", "[aout]"] : []),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k",
      // MP4 (H.264/AAC) so it plays in any browser for preview and is a
      // universal download; +faststart moves the index up front so it can
      // start playing before the whole file has arrived
      "-movflags", "+faststart",
      ...capArgs,
      "-shortest",
      "-y", path.join(out, "combined.mp4"),
      // Lossless mixdown: everyone in one file, full quality - the same
      // mix as the MP4's audio track
      ...(amix
        ? ["-map", "[aoutflac]", "-c:a", "flac", ...capArgs, "-shortest", "-y", path.join(out, "combined.flac")]
        : [])
    ], "combined");
    files.push("combined.mp4");
    if (amix) files.push("combined.flac");
  }

  return files;
}
