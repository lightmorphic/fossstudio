// Geometry shared by the two things that composite a session into
// video: the recording processor and the live stream. Both draw the
// same picture, so anything that decides how big something lands in
// the frame belongs here rather than being written out twice.

// The episode logo/title block, as a fraction of frame width. The
// browser sizes the on-screen block by the same fraction of the video
// area (see --title-w in session.css), which is what keeps the
// recording looking like the screen people were actually on.
export const TITLE_WIDTH_FRACTION = 286 / 1280;

// Host-resizable between half and double size; ffmpeg needs an even
// width for yuv420p, so round to one.
export function titleWidth(scale, frameWidth = 1280) {
  const s = Math.min(2, Math.max(0.5, Number(scale) || 1));
  return Math.round(frameWidth * TITLE_WIDTH_FRACTION * s / 2) * 2;
}

// Tile grid geometry, as fractions of frame width. session.js lays the
// live grid out with the same fractions of its video area, so the
// recording is the same picture instead of a tighter, more zoomed-in
// one. Kept in step by test/geometry-test.mjs rather than by a shared
// import, since the browser cannot load anything from server/src.
export const LAYOUT = {
  pad: 24 / 1280,
  gap: 20 / 1280,
  radius: 16 / 1280,
  // Spotlight: how much of the frame height the strip of everyone else
  // takes under the featured tile
  strip: 0.16
};

const even = (v) => Math.max(2, 2 * Math.floor(v / 2));

// Even grid: one tile size for everyone, rows as even as possible with
// fuller rows first, the block centred. Mirrors applyLayout() in
// web/js/session.js.
function gridLayout(n, W, H, PAD, GAP) {
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

// Spotlight: the featured person fills the frame above a strip of
// everyone else. Mirrors .grid.spotlight in web/css/session.css, which
// is a CSS grid of "1fr <strip>" with the featured tile spanning the
// top row and the rest sharing the bottom one.
function spotlightLayout(n, W, H, PAD, GAP) {
  const availW = W - 2 * PAD, availH = H - 2 * PAD;
  const others = n - 1;
  if (others < 1) return [{ x: PAD, y: PAD, w: even(availW), h: even(availH) }];
  const stripH = even(H * LAYOUT.strip);
  const featuredH = even(availH - stripH - GAP);
  const otherW = even((availW - (others - 1) * GAP) / others);
  const stripY = PAD + featuredH + GAP;
  // Index 0 is the featured tile; callers order their inputs to match
  const tiles = [{ x: PAD, y: PAD, w: even(availW), h: featuredH }];
  for (let i = 0; i < others; i++) {
    tiles.push({ x: Math.round(PAD + i * (otherW + GAP)), y: stripY, w: otherW, h: stripH });
  }
  return tiles;
}

// Screen share: the shared picture fills a large left pane and every
// person shrinks into a column on the right - ten of them get very
// small rather than anyone disappearing. Mirrors the share branch of
// applyLayout() in web/js/session.js, held together by the geometry
// test like the other layouts.
export const SHARE_FRACTION = 0.72; // of frame width for the screen pane

export function shareLayout(nOthers, W = 1280, H = 720) {
  const PAD = Math.round(W * LAYOUT.pad);
  const GAP = Math.round(W * LAYOUT.gap);
  const availH = H - 2 * PAD;
  const screenW = even(W * SHARE_FRACTION);
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
    for (let i = 0; i < nOthers; i++) {
      tiles.push({ x: x0, y: y0 + i * (tileH + GAP), w: tileW, h: tileH });
    }
  }
  return { screen, tiles };
}

// Where every tile sits in the frame. `spotIndex` is the position of the
// featured person in `order`, or -1 for the even grid. Returns boxes in
// the same order as the inputs, so a caller can zip them together.
export function tileLayout(n, spotIndex = -1, W = 1280, H = 720) {
  const PAD = Math.round(W * LAYOUT.pad);
  const GAP = Math.round(W * LAYOUT.gap);
  if (n < 1) return [];
  if (spotIndex < 0 || spotIndex >= n || n === 1) return gridLayout(n, W, H, PAD, GAP);
  const boxes = spotlightLayout(n, W, H, PAD, GAP);
  // boxes[0] is the featured slot: hand it to the featured input and
  // give the strip to everyone else, in their existing order
  const out = new Array(n);
  out[spotIndex] = boxes[0];
  let s = 1;
  for (let i = 0; i < n; i++) if (i !== spotIndex) out[i] = boxes[s++];
  return out;
}
