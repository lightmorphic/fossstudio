// Vendor Lock, for the watch page while the show is off air: Asteroids
// where the rocks are Big Tech logos (traced from the CC0 simple-icons
// set) and losing is "TOTAL LOCK-IN". Arrow keys turn, thrust and
// brake, space fires, H is hyperspace; on touch screens the cabinet
// grows buttons. Pure canvas plus a small DOM HUD - no assets, no
// storage, no requests; fonts are the system mono stack so the page
// stays entirely self-hosted.
window.OffAir = (() => {
  const D = Math.PI / 180;
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

  /* -------------------------------------------------------------
     Logos are traced, not redrawn: each `d` is the real logo's own
     outline (24x24 path data from the CC0 simple-icons set), stroked
     rather than filled so the line follows every edge, counter and
     letterform of the mark itself.
     ------------------------------------------------------------- */
  const BRANDS = [
    { name: "Google", d: "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" },
    { name: "Apple", d: "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" },
    { name: "Meta", d: "M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z" },
    { name: "Amazon", d: "M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.525.13.12.174.09.336-.12.48-.256.19-.6.41-1.006.654-1.244.743-2.64 1.316-4.185 1.726a17.617 17.617 0 01-10.951-.577 17.88 17.88 0 01-5.43-3.35c-.1-.074-.151-.15-.151-.22 0-.047.021-.09.051-.13zm6.565-6.218c0-1.005.247-1.863.743-2.577.495-.71 1.17-1.25 2.04-1.615.796-.335 1.756-.575 2.912-.72.39-.046 1.033-.103 1.92-.174v-.37c0-.93-.105-1.558-.3-1.875-.302-.43-.78-.65-1.44-.65h-.182c-.48.046-.896.196-1.246.46-.35.27-.575.63-.675 1.096-.06.3-.206.465-.435.51l-2.52-.315c-.248-.06-.372-.18-.372-.39 0-.046.007-.09.022-.15.247-1.29.855-2.25 1.82-2.88.976-.616 2.1-.975 3.39-1.05h.54c1.65 0 2.957.434 3.888 1.29.135.15.27.3.405.48.12.165.224.314.283.45.075.134.15.33.195.57.06.254.105.42.135.51.03.104.062.3.076.615.01.313.02.493.02.553v5.28c0 .376.06.72.165 1.036.105.313.21.54.315.674l.51.674c.09.136.136.256.136.36 0 .12-.06.226-.18.314-1.2 1.05-1.86 1.62-1.963 1.71-.165.135-.375.15-.63.045a6.062 6.062 0 01-.526-.496l-.31-.347a9.391 9.391 0 01-.317-.42l-.3-.435c-.81.886-1.603 1.44-2.4 1.665-.494.15-1.093.227-1.83.227-1.11 0-2.04-.343-2.76-1.034-.72-.69-1.08-1.665-1.08-2.94l-.05-.076zm3.753-.438c0 .566.14 1.02.425 1.364.285.34.675.512 1.155.512.045 0 .106-.007.195-.02.09-.016.134-.023.166-.023.614-.16 1.08-.553 1.424-1.178.165-.28.285-.58.36-.91.09-.32.12-.59.135-.8.015-.195.015-.54.015-1.005v-.54c-.84 0-1.484.06-1.92.18-1.275.36-1.92 1.17-1.92 2.43l-.035-.02zm9.162 7.027c.03-.06.075-.11.132-.17.362-.243.714-.41 1.05-.5a8.094 8.094 0 011.612-.24c.14-.012.28 0 .41.03.65.06 1.05.168 1.172.33.063.09.099.228.099.39v.15c0 .51-.149 1.11-.424 1.8-.278.69-.664 1.248-1.156 1.68-.073.06-.14.09-.197.09-.03 0-.06 0-.09-.012-.09-.044-.107-.12-.064-.24.54-1.26.806-2.143.806-2.64 0-.15-.03-.27-.087-.344-.145-.166-.55-.257-1.224-.257-.243 0-.533.016-.87.046-.363.045-.7.09-1 .135-.09 0-.148-.014-.18-.044-.03-.03-.036-.047-.02-.077 0-.017.006-.03.02-.063v-.06z" },
    { name: "Microsoft", d: "M0 0v11.408h11.408V0zm12.594 0v11.408H24V0zM0 12.594V24h11.408V12.594zm12.594 0V24H24V12.594z" },
    { name: "Salesforce", d: "M10.006 5.415a4.195 4.195 0 013.045-1.306c1.56 0 2.954.9 3.69 2.205.63-.3 1.35-.45 2.1-.45 2.85 0 5.159 2.34 5.159 5.22s-2.31 5.22-5.176 5.22c-.345 0-.69-.044-1.02-.104a3.75 3.75 0 01-3.3 1.95c-.6 0-1.155-.15-1.65-.375A4.314 4.314 0 018.88 20.4a4.302 4.302 0 01-4.05-2.82c-.27.062-.54.076-.825.076-2.204 0-4.005-1.8-4.005-4.05 0-1.5.811-2.805 2.01-3.51-.255-.57-.39-1.2-.39-1.846 0-2.58 2.1-4.65 4.65-4.65 1.53 0 2.85.705 3.72 1.8",
      word: { s: "salesforce", size: 0.30, y: 0.10 } },
    { name: "Adobe", d: "M13.966 22.624l-1.69-4.281H8.122l3.892-9.144 5.662 13.425zM8.884 1.376H0v21.248zm15.116 0h-8.884L24 22.624Z" },
    { name: "Evernote", d: "M8.222 5.393c0 .239-.02.637-.256.895-.257.24-.652.259-.888.259H4.552c-.73 0-1.165 0-1.46.04-.159.02-.356.1-.455.14-.04.019-.04 0-.02-.02L8.38.796c.02-.02.04-.02.02.02-.04.099-.118.298-.138.457-.04.298-.04.736-.04 1.472v2.647zm5.348 17.869c-.67-.438-1.026-1.015-1.164-1.373a2.924 2.924 0 01-.217-1.095 3.007 3.007 0 013-3.004c.493 0 .888.398.888.895a.88.88 0 01-.454.776c-.099.06-.237.1-.336.12-.098.02-.473.06-.65.218-.198.16-.356.418-.356.697 0 .298.118.577.316.776.355.358.829.557 1.342.557a2.436 2.436 0 002.427-2.447c0-1.214-.809-2.29-1.875-2.766-.158-.08-.414-.14-.651-.2a8.04 8.04 0 00-.592-.1c-.829-.1-2.901-.755-3.04-2.605 0 0-.611 2.785-1.835 3.54-.118.06-.276.12-.454.16-.177.04-.374.06-.434.06-1.993.12-4.105-.517-5.565-2.03 0 0-.987-.815-1.5-3.103-.118-.558-.355-1.553-.493-2.488-.06-.338-.08-.597-.099-.836 0-.975.592-1.631 1.342-1.73h4.026c.69 0 1.086-.18 1.342-.42.336-.317.415-.775.415-1.312V1.354C9.05.617 9.703 0 10.669 0h.474c.197 0 .434.02.651.04.158.02.296.06.533.12 1.204.298 1.46 1.532 1.46 1.532s2.27.398 3.415.597c1.085.199 3.77.378 4.282 3.104 1.204 6.487.474 12.775.415 12.775-.849 6.129-5.901 5.83-5.901 5.83a4.1 4.1 0 01-2.428-.736zm4.54-13.034c-.652-.06-1.204.2-1.402.697-.04.1-.079.219-.059.278.02.06.06.08.099.1.237.12.631.179 1.204.239.572.06.967.1 1.223.06.04 0 .08-.02.119-.08.04-.06.02-.18.02-.28-.06-.536-.553-.934-1.204-1.014z" },
    { name: "Slack", d: "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" }
  ];

  /* Measure each mark's true bounding box once, so a wide wordmark and
     a square glyph both sit correctly inside their rock. */
  function prepBrands() {
    const S = 6, N = 24 * S;
    const C = document.createElement("canvas");
    C.width = C.height = N;
    const c = C.getContext("2d");
    for (const b of BRANDS) {
      b.p = new Path2D(b.d);
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, N, N);
      c.setTransform(S, 0, 0, S, 0, 0); c.fillStyle = "#fff"; c.fill(b.p);
      const px = c.getImageData(0, 0, N, N).data;
      let minx = N, miny = N, maxx = 0, maxy = 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (px[(y * N + x) * 4 + 3] > 8) {
          if (x < minx) minx = x; if (x > maxx) maxx = x;
          if (y < miny) miny = y; if (y > maxy) maxy = y;
        }
      }
      b.bb = { x: minx / S, y: miny / S, w: (maxx - minx + 1) / S, h: (maxy - miny + 1) / S };
    }
  }

  function drawLogo(c, brand, R) {
    const bb = brand.bb, s = 2 * R / Math.max(bb.w, bb.h);
    const lw = (R * VIEW > 40 ? 2.1 : (R * VIEW > 24 ? 1.8 : 1.5)) / VIEW;
    c.save();
    c.scale(s, s);
    c.translate(-(bb.x + bb.w / 2), -(bb.y + bb.h / 2));
    c.strokeStyle = "#FFFFFF"; c.lineWidth = lw / s; c.lineJoin = "round"; c.lineCap = "round";
    c.stroke(brand.p);
    c.restore();
    if (brand.word && R > 20) {
      c.save();
      c.strokeStyle = "#FFFFFF"; c.lineWidth = Math.max(0.7, lw * 0.55);
      c.font = `500 ${R * brand.word.size}px ${MONO}`;
      c.textAlign = "center"; c.textBaseline = "middle";
      c.strokeText(brand.word.s, 0, R * brand.word.y);
      c.restore();
    }
  }

  // ---------- sound ----------
  let AC = null, soundOn = true;
  function blip(freq, dur, type, vol) {
    if (!soundOn) return;
    try {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === "suspended") AC.resume();
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = type || "square"; o.frequency.setValueAtTime(freq, AC.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.4), AC.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.05, AC.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
      o.connect(g); g.connect(AC.destination);
      o.start(); o.stop(AC.currentTime + dur + 0.02);
    } catch { /* no audio available */ }
  }

  // ---------- game state ----------
  const BLOCK_W = 976, BLOCK_H = 244;
  let box = null, cabinet = null, cv = null, ctx = null;
  let elScore, elWave, elLives, elPause, elSound, stage;
  let running = false, raf = 0;
  let W = 0, H = 0, dpr = 1, VIEW = 1;

  /* Sized for the short strip. */
  const TIER = { 3: { r: 54, score: 20, spd: [26, 62] }, 2: { r: 31, score: 50, spd: [52, 104] }, 1: { r: 18, score: 100, spd: [86, 152] } };
  const MAXSHOTS = 4;

  let state = "play", ship, rocks = [], shots = [], foe = null, foeShots = [], bits = [], notes = [], stars = [];
  let score = 0, wave = 1, lives = 3, nextLife = 10000, banner = 0, bannerText = "", foeTimer = 0;
  /* Wave 1 drifts in gently; the field speeds up as the waves go on. */
  let waveSpd = 1;
  const keys = { left: false, right: false, thrust: false, brake: false, fire: false };
  let shootCd = 0, hyperCd = 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  const wrap = (o) => {
    if (o.x < -o.r) o.x = W + o.r; if (o.x > W + o.r) o.x = -o.r;
    if (o.y < -o.r) o.y = H + o.r; if (o.y > H + o.r) o.y = -o.r;
  };

  function makeStars() {
    stars = [];
    for (let i = 0; i < 130; i++) stars.push({ x: Math.random(), y: Math.random(), a: rand(0.08, 0.5), s: rand(0.6, 1.6) });
  }
  const newShip = () => ({ x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, r: 13, inv: 2.6, alive: true, dead: 0 });

  /* Deal logos from a shuffled deck: every one of the nine flies before
     any repeats. */
  let deck = [];
  function nextBrand() {
    if (!deck.length) {
      deck = BRANDS.slice();
      for (let i = deck.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0, t = deck[i]; deck[i] = deck[j]; deck[j] = t;
      }
    }
    return deck.pop();
  }

  function spawnWave(n) {
    rocks = [];
    waveSpd = Math.min(1.25, 0.7 + 0.08 * (n - 1));
    /* The original's four-rock opener was tuned for a 4:3 screen; keep
       that density on a wider field instead of leaving it empty. */
    const dens = Math.max(1, Math.min(2, (W * H) / 900000));
    const count = Math.min(Math.round(12 * dens), Math.round((4 + n * 2) * dens));
    for (let i = 0; i < count; i++) {
      const b = nextBrand();
      let x, y, ang, tries = 0;
      if (i < 2) {
        /* The first two drop in above and below the middle so there is
           something to shoot straight away. They head into the field on
           their own line - no homing on the ship. */
        x = W / 2 + rand(-W * 0.18, W * 0.18);
        y = i === 0 ? -TIER[3].r : H + TIER[3].r;
        ang = (i === 0 ? 90 : -90) * D + rand(-1.15, 1.15);
      } else {
        do {
          /* Sample the border by edge length, so a wide field gets its
             rocks along the top and bottom rather than mostly the sides. */
          if (Math.random() < W / (W + H)) { x = rand(0, W); y = Math.random() < 0.5 ? 0 : H; }
          else { x = Math.random() < 0.5 ? 0 : W; y = rand(0, H); }
        } while (Math.hypot(x - W / 2, y - H / 2) < 200 && ++tries < 20);
        ang = undefined;
      }
      addRock(x, y, 3, b, ang, i < 2 ? 1.25 : 1);
    }
    foe = null; foeShots = []; foeTimer = rand(14, 24);
  }

  function addRock(x, y, tier, brand, ang, boost) {
    const t = TIER[tier], a = (ang === undefined) ? rand(0, Math.PI * 2) : ang;
    const sp = rand(t.spd[0], t.spd[1]) * (boost || 1) * waveSpd;
    rocks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: t.r, tier, brand,
                 rot: rand(0, 6.28), spin: rand(-1.0, 1.0) * (tier === 1 ? 1.8 : 1) });
  }

  function burst(x, y, n, pow, col) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.28), s = rand(30, pow);
      bits.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.35, 0.9), max: 0.9, c: col || "#FFFFFF" });
    }
  }

  function breakRock(i, byPlayer) {
    const k = rocks[i];
    if (byPlayer) {
      score += TIER[k.tier].score;
      notes.push({ x: k.x, y: k.y, t: 1.1, s: k.brand.name.toUpperCase() });
      if (score >= nextLife) { lives++; nextLife += 10000; blip(880, 0.3, "triangle", 0.05); }
    }
    burst(k.x, k.y, k.tier === 3 ? 22 : 14, k.tier * 90);
    blip(k.tier === 3 ? 150 : k.tier === 2 ? 230 : 330, 0.16, "square", 0.06);
    if (k.tier > 1) {
      const base = Math.atan2(k.vy, k.vx);
      addRock(k.x, k.y, k.tier - 1, k.brand, base - rand(0.4, 0.9), 1.18);
      addRock(k.x, k.y, k.tier - 1, k.brand, base + rand(0.4, 0.9), 1.18);
    }
    rocks.splice(i, 1);
  }

  function killShip() {
    if (!ship.alive || ship.inv > 0) return;
    ship.alive = false; ship.dead = 2.0;
    burst(ship.x, ship.y, 26, 220, "#63F5E4");
    blip(90, 0.5, "sawtooth", 0.07);
    lives--;
    if (lives <= 0) state = "over";
  }

  function hyperspace() {
    if (!ship.alive || hyperCd > 0) return;
    hyperCd = 1.2;
    burst(ship.x, ship.y, 10, 120, "#63F5E4");
    ship.x = rand(40, W - 40); ship.y = rand(40, H - 40); ship.vx = ship.vy = 0;
    blip(300, 0.2, "sine", 0.05);
    if (Math.random() < 0.12) { ship.inv = 0; killShip(); }
  }

  function spawnFoe() {
    const small = Math.random() < Math.min(0.7, score / 24000 + 0.15);
    const fromLeft = Math.random() < 0.5;
    foe = { x: fromLeft ? -30 : W + 30, y: rand(H * 0.15, H * 0.85),
            vx: (fromLeft ? 1 : -1) * (small ? 128 : 96), vy: 0, r: small ? 13 : 21,
            small, jink: rand(0.8, 2), shoot: rand(0.6, 1.4) };
    blip(small ? 520 : 190, 0.25, "sawtooth", 0.035);
  }

  function step(dt) {
    /* --- ship: thrust forward, retro-brake, drift like the original --- */
    if (ship.alive) {
      if (keys.left) ship.a -= 3.5 * dt;
      if (keys.right) ship.a += 3.5 * dt;
      if (keys.thrust) {
        ship.vx += Math.cos(ship.a) * 290 * dt;
        ship.vy += Math.sin(ship.a) * 290 * dt;
        if (Math.random() < 0.7) bits.push({ x: ship.x - Math.cos(ship.a) * 14, y: ship.y - Math.sin(ship.a) * 14,
          vx: -Math.cos(ship.a) * rand(60, 150) + ship.vx * 0.3, vy: -Math.sin(ship.a) * rand(60, 150) + ship.vy * 0.3,
          life: 0.3, max: 0.3, c: "#FFC24B" });
      }
      if (keys.brake) {
        const sp0 = Math.hypot(ship.vx, ship.vy), br = 220 * dt;
        if (sp0 > br) { ship.vx -= ship.vx / sp0 * br; ship.vy -= ship.vy / sp0 * br; }
        else { ship.vx = ship.vy = 0; }
      }
      const sp = Math.hypot(ship.vx, ship.vy);
      if (sp > 430) { ship.vx *= 430 / sp; ship.vy *= 430 / sp; }
      ship.vx *= Math.pow(0.90, dt); ship.vy *= Math.pow(0.90, dt);
      ship.x += ship.vx * dt; ship.y += ship.vy * dt; wrap(ship);
      if (ship.inv > 0) ship.inv -= dt;
      if (hyperCd > 0) hyperCd -= dt;
      shootCd -= dt;
      if (keys.fire && shootCd <= 0 && shots.length < MAXSHOTS) {
        shots.push({ x: ship.x + Math.cos(ship.a) * 15, y: ship.y + Math.sin(ship.a) * 15,
          vx: Math.cos(ship.a) * 540 + ship.vx * 0.4, vy: Math.sin(ship.a) * 540 + ship.vy * 0.4, life: 1.05, r: 2 });
        shootCd = 0.22; blip(620, 0.07, "square", 0.035);
      }
    } else {
      ship.dead -= dt;
      if (ship.dead <= 0 && lives > 0) ship = newShip();
    }

    let i, j;

    /* --- player shots --- */
    for (i = shots.length - 1; i >= 0; i--) {
      const b = shots[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; wrap(b);
      if (b.life <= 0) { shots.splice(i, 1); continue; }
      let gone = false;
      for (j = rocks.length - 1; j >= 0; j--) {
        if (Math.hypot(b.x - rocks[j].x, b.y - rocks[j].y) < rocks[j].r * 0.86) {
          shots.splice(i, 1); breakRock(j, true); gone = true; break;
        }
      }
      if (gone) continue;
      if (foe && Math.hypot(b.x - foe.x, b.y - foe.y) < foe.r * 1.1) {
        score += foe.small ? 1000 : 200;
        notes.push({ x: foe.x, y: foe.y, t: 1.2, s: foe.small ? "E.U.L.A. +1000" : "AUDITOR +200" });
        burst(foe.x, foe.y, 20, 200); blip(140, 0.35, "sawtooth", 0.06);
        foe = null; shots.splice(i, 1);
        if (score >= nextLife) { lives++; nextLife += 10000; }
      }
    }

    /* --- rocks --- */
    for (i = 0; i < rocks.length; i++) {
      const r = rocks[i];
      r.x += r.vx * dt; r.y += r.vy * dt; r.rot += r.spin * dt; wrap(r);
      if (ship.alive && ship.inv <= 0 && Math.hypot(ship.x - r.x, ship.y - r.y) < r.r * 0.80 + ship.r * 0.55) killShip();
    }

    /* --- saucer --- */
    if (!foe && rocks.length > 0) {
      foeTimer -= dt;
      if (foeTimer <= 0) { spawnFoe(); foeTimer = rand(18, 30); }
    }
    if (foe) {
      foe.jink -= dt;
      if (foe.jink <= 0) { foe.vy = rand(-1, 1) < 0 ? -70 : 70; if (Math.random() < 0.35) foe.vy = 0; foe.jink = rand(0.7, 1.8); }
      foe.x += foe.vx * dt; foe.y += foe.vy * dt;
      if (foe.y < foe.r) foe.y = foe.r; if (foe.y > H - foe.r) foe.y = H - foe.r;
      if (foe.x < -60 || foe.x > W + 60) foe = null;
    }
    if (foe) {
      foe.shoot -= dt;
      if (foe.shoot <= 0) {
        foe.shoot = foe.small ? rand(0.9, 1.5) : rand(1.1, 1.9);
        let aim;
        if (foe.small && ship.alive) {
          const spread = Math.max(0.06, 0.5 - score / 60000);
          aim = Math.atan2(ship.y - foe.y, ship.x - foe.x) + rand(-spread, spread);
        } else aim = rand(0, 6.28);
        foeShots.push({ x: foe.x, y: foe.y, vx: Math.cos(aim) * 330, vy: Math.sin(aim) * 330, life: 1.4, r: 2 });
        blip(400, 0.08, "square", 0.03);
      }
      if (ship.alive && ship.inv <= 0 && Math.hypot(ship.x - foe.x, ship.y - foe.y) < foe.r + ship.r * 0.6) killShip();
    }
    for (i = foeShots.length - 1; i >= 0; i--) {
      const f = foeShots[i];
      f.x += f.vx * dt; f.y += f.vy * dt; f.life -= dt; wrap(f);
      if (f.life <= 0) { foeShots.splice(i, 1); continue; }
      if (ship.alive && ship.inv <= 0 && Math.hypot(f.x - ship.x, f.y - ship.y) < ship.r * 0.7) {
        foeShots.splice(i, 1); killShip(); continue;
      }
      for (j = rocks.length - 1; j >= 0; j--) {
        if (Math.hypot(f.x - rocks[j].x, f.y - rocks[j].y) < rocks[j].r * 0.86) {
          foeShots.splice(i, 1); breakRock(j, false); break;
        }
      }
    }

    /* --- debris & labels --- */
    for (i = bits.length - 1; i >= 0; i--) {
      const p = bits[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(0.35, dt); p.vy *= Math.pow(0.35, dt);
      p.life -= dt; if (p.life <= 0) bits.splice(i, 1);
    }
    for (i = notes.length - 1; i >= 0; i--) {
      notes[i].t -= dt; notes[i].y -= 22 * dt;
      if (notes[i].t <= 0) notes.splice(i, 1);
    }
    if (banner > 0) banner -= dt;

    if (rocks.length === 0 && state === "play") {
      wave++; spawnWave(wave);
      bannerText = "WAVE " + wave; banner = 1.8;
      blip(520, 0.18, "triangle", 0.05);
    }
    syncHud();
  }

  function drawShip() {
    if (!ship.alive) return;
    if (ship.inv > 0 && Math.floor(ship.inv * 10) % 2 === 0) return;
    ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(ship.a);
    ctx.strokeStyle = "#63F5E4"; ctx.lineWidth = 2 / VIEW; ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(99,245,228,.85)"; ctx.shadowBlur = 12 / VIEW;
    ctx.beginPath();
    ctx.moveTo(16, 0); ctx.lineTo(-11, 9); ctx.lineTo(-6, 0); ctx.lineTo(-11, -9);
    ctx.closePath(); ctx.stroke();
    if (keys.brake) {
      ctx.beginPath(); ctx.moveTo(13, 4); ctx.lineTo(19, 7); ctx.moveTo(13, -4); ctx.lineTo(19, -7); ctx.stroke();
    }
    ctx.shadowBlur = 0; ctx.restore();
  }

  function drawFoe() {
    if (!foe) return;
    const R = foe.r;
    ctx.save(); ctx.translate(foe.x, foe.y);
    ctx.strokeStyle = "#FF4D7E"; ctx.lineWidth = 2 / VIEW; ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(255,77,126,.8)"; ctx.shadowBlur = 10 / VIEW;
    ctx.beginPath();
    ctx.moveTo(-R, 0); ctx.lineTo(-R * 0.45, R * 0.5); ctx.lineTo(R * 0.45, R * 0.5); ctx.lineTo(R, 0); ctx.closePath();
    ctx.moveTo(-R, 0); ctx.lineTo(-R * 0.45, -R * 0.42); ctx.lineTo(R * 0.45, -R * 0.42); ctx.lineTo(R, 0);
    ctx.moveTo(-R * 0.42, -R * 0.42);
    ctx.bezierCurveTo(-R * 0.3, -R * 0.95, R * 0.3, -R * 0.95, R * 0.42, -R * 0.42);
    ctx.stroke(); ctx.shadowBlur = 0; ctx.restore();
  }

  function draw() {
    ctx.fillStyle = "#04060B"; ctx.fillRect(0, 0, W, H);
    for (const st of stars) {
      ctx.fillStyle = "rgba(140,180,220," + st.a + ")";
      ctx.fillRect(st.x * W, st.y * H, st.s / VIEW, st.s / VIEW);
    }

    ctx.shadowColor = "rgba(255,255,255,.55)";
    for (const k of rocks) {
      ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(k.rot);
      ctx.shadowBlur = (k.tier === 1 ? 6 : 10) / VIEW;
      drawLogo(ctx, k.brand, k.r * 0.92);
      ctx.restore();
    }
    ctx.shadowBlur = 0;

    drawFoe();

    ctx.fillStyle = "#FFFFFF"; ctx.shadowColor = "#63F5E4";
    for (const b of shots) {
      ctx.shadowBlur = 10 / VIEW;
      ctx.beginPath(); ctx.arc(b.x, b.y, 2.2 / VIEW, 0, 7); ctx.fill();
    }
    ctx.shadowColor = "#FF4D7E"; ctx.fillStyle = "#FFD3DF";
    for (const f of foeShots) {
      ctx.shadowBlur = 10 / VIEW;
      ctx.beginPath(); ctx.arc(f.x, f.y, 2.2 / VIEW, 0, 7); ctx.fill();
    }
    ctx.shadowBlur = 0;

    for (const q of bits) {
      ctx.globalAlpha = Math.max(0, q.life / q.max);
      ctx.fillStyle = q.c; ctx.fillRect(q.x - 1.5 / VIEW, q.y - 1.5 / VIEW, 3 / VIEW, 3 / VIEW);
    }
    ctx.globalAlpha = 1;

    drawShip();

    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const t of notes) {
      ctx.globalAlpha = Math.min(1, t.t) * 0.85;
      ctx.fillStyle = "#C9D6E4";
      ctx.font = `500 ${11 / VIEW}px ${MONO}`;
      ctx.fillText(t.s, t.x, t.y);
    }
    ctx.globalAlpha = 1;

    if (banner > 0 && state === "play") {
      ctx.globalAlpha = Math.min(1, banner);
      ctx.fillStyle = "#63F5E4";
      ctx.font = `700 ${Math.round(Math.min(52 / VIEW, W * 0.06))}px ${MONO}`;
      ctx.fillText(bannerText, W / 2, H / 2);
      ctx.globalAlpha = 1;
    }

    if (state === "paused" || state === "over") {
      ctx.fillStyle = "rgba(4,6,11,.72)"; ctx.fillRect(0, 0, W, H);
      const big = Math.round(Math.min(46 / VIEW, W * 0.065));
      ctx.font = `700 ${big}px ${MONO}`;
      ctx.fillStyle = state === "over" ? "#FF4D7E" : "#63F5E4";
      ctx.fillText(state === "over" ? "TOTAL LOCK-IN" : "PAUSED", W / 2, H / 2 - big * 0.35);
      ctx.font = `500 ${13 / VIEW}px ${MONO}`;
      ctx.fillStyle = "#C9D6E4";
      ctx.fillText(state === "over"
        ? "final score " + score.toLocaleString() + "  ·  press ENTER to fly again"
        : "press P to resume", W / 2, H / 2 + big * 0.55);
    }
  }

  let last = 0;
  function loop(ts) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    if (state === "play") step(dt);
    draw();
  }

  // ---------- HUD ----------
  let lastLives = -1;
  function syncHud() {
    elScore.textContent = score.toLocaleString();
    elWave.textContent = wave;
    if (lives !== lastLives) {
      lastLives = lives; elLives.innerHTML = "";
      for (let i = 0; i < Math.max(0, lives); i++) {
        elLives.insertAdjacentHTML("beforeend",
          '<svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">' +
          '<path d="M5 0 L10 12 L5 9 L0 12 Z" fill="#63F5E4"/></svg>');
      }
      elLives.setAttribute("aria-label", lives + " ships remaining");
    }
  }

  function startGame() {
    score = 0; wave = 1; lives = 3; nextLife = 10000; lastLives = -1; deck = [];
    shots = []; foeShots = []; bits = []; notes = []; foe = null;
    ship = newShip(); spawnWave(wave);
    bannerText = "WAVE 1"; banner = 1.4;
    state = "play"; syncHud();
    elPause.textContent = "Pause";
  }

  function togglePause() {
    if (state === "play") { state = "paused"; elPause.textContent = "Resume"; }
    else if (state === "paused") { state = "play"; elPause.textContent = "Pause"; }
  }

  // ---------- layout ----------
  /* The cabinet is a fixed 976x244 block; --fit scales it to the width
     the offline card gives it, so the playfield keeps its proportions. */
  function resize() {
    if (!box || box.offsetParent === null) return;
    const s = Math.max(0.2, Math.min(1, box.clientWidth / BLOCK_W));
    box.style.setProperty("--fit", s);
    box.style.height = Math.round(BLOCK_H * s) + "px";
    const pxW = Math.max(320, stage.clientWidth), pxH = Math.max(120, stage.clientHeight);
    /* A 244px-tall block cannot hold arcade-sized rocks, so the world is
       kept roomy and drawn at VIEW scale instead of shrinking the game. */
    VIEW = Math.max(0.5, Math.min(1, pxH / 560));
    W = pxW / VIEW; H = pxH / VIEW;
    dpr = Math.min(2, Math.max(1, (window.devicePixelRatio || 1) * s));
    cv.width = Math.round(pxW * dpr); cv.height = Math.round(pxH * dpr);
    ctx.setTransform(dpr * VIEW, 0, 0, dpr * VIEW, 0, 0);
  }

  // ---------- input ----------
  const MAP = { ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
                ArrowUp: "thrust", KeyW: "thrust", ArrowDown: "brake", KeyS: "brake", Space: "fire" };
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || "");
  const onKeyDown = (e) => {
    if (!box || box.offsetParent === null || typing(e)) return; // page is live, game hidden
    if (e.code === "KeyP") { togglePause(); e.preventDefault(); return; }
    if (e.code === "KeyH" && state === "play") { hyperspace(); e.preventDefault(); return; }
    if (e.code === "Enter" && state !== "play") { startGame(); e.preventDefault(); return; }
    const k = MAP[e.code];
    if (k) { keys[k] = true; e.preventDefault(); }
  };
  const onKeyUp = (e) => {
    const k = MAP[e.code];
    if (k) { keys[k] = false; e.preventDefault(); }
  };
  const onBlur = () => {
    keys.left = keys.right = keys.thrust = keys.brake = keys.fire = false;
  };

  // ---------- cabinet markup ----------
  function build(el) {
    box = el;
    box.classList.add("vl");
    if ("ontouchstart" in window || navigator.maxTouchPoints > 0) box.classList.add("vl-touch");
    box.innerHTML = `
      <div class="vl-cabinet">
        <div class="vl-hud">
          <span><b>Score</b> <span class="vl-val vl-score">0</span></span>
          <span><b>Wave</b> <span class="vl-val vl-wave">1</span></span>
          <span><b>Ships</b> <span class="vl-lives"></span></span>
          <span class="vl-spacer"></span>
          <button class="vl-btn vl-sound" type="button">Sound: on</button>
          <button class="vl-btn vl-pause" type="button">Pause</button>
        </div>
        <div class="vl-stage">
          <canvas></canvas>
          <div class="vl-scan"></div>
          <div class="vl-vig"></div>
          <div class="vl-pads">
            <div class="vl-grp">
              <button data-k="left" type="button">&#9664;</button>
              <button data-k="right" type="button">&#9654;</button>
            </div>
            <div class="vl-grp">
              <button data-k="brake" type="button">&#9660;</button>
              <button data-k="thrust" type="button">&#9650;</button>
              <button data-k="fire" type="button">FIRE</button>
            </div>
          </div>
        </div>
        <div class="vl-keys">
          <span><kbd>&larr;</kbd><kbd>&rarr;</kbd> turn</span>
          <span><kbd>&uarr;</kbd> thrust</span>
          <span><kbd>&darr;</kbd> brake</span>
          <span><kbd>space</kbd> fire</span>
          <span><kbd>H</kbd> hyper</span>
          <span><kbd>P</kbd> pause</span>
          <span><kbd>enter</kbd> restart</span>
        </div>
      </div>`;
    const $ = (sel) => box.querySelector(sel);
    cabinet = $(".vl-cabinet"); stage = $(".vl-stage"); cv = $("canvas");
    elScore = $(".vl-score"); elWave = $(".vl-wave"); elLives = $(".vl-lives");
    elPause = $(".vl-pause"); elSound = $(".vl-sound");
    ctx = cv.getContext("2d");
    elPause.addEventListener("click", togglePause);
    elSound.addEventListener("click", function () {
      soundOn = !soundOn; this.textContent = "Sound: " + (soundOn ? "on" : "off");
    });
    for (const btn of box.querySelectorAll(".vl-pads button")) {
      const k = btn.getAttribute("data-k");
      const on = (e) => { e.preventDefault(); keys[k] = true; };
      const off = (e) => { e.preventDefault(); keys[k] = false; };
      btn.addEventListener("pointerdown", on);
      btn.addEventListener("pointerup", off);
      btn.addEventListener("pointerleave", off);
      btn.addEventListener("pointercancel", off);
    }
    prepBrands();
  }

  // ---------- lifecycle ----------
  function start(el) {
    if (running) return;
    if (!box) build(el);
    running = true;
    resize(); makeStars(); startGame();
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    last = 0;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    onBlur();
  }

  return { start, stop };
})();
