/* FOSS Studio session: preview -> join -> live grid.
   Guests and the host share this page; the host (dashboard login +
   ?as=host) additionally gets the control panel. */
(() => {
  "use strict";

  const roomId = location.pathname.split("/")[2];
  const wantHost = new URLSearchParams(location.search).get("as") === "host";
  // Clean-feed mode for OBS: no join screen, no controls, receive-only.
  // Load the session link with ?output=1 as an OBS Browser Source and
  // stream the show from OBS to anywhere.
  const outputMode = new URLSearchParams(location.search).get("output") === "1";
  const $ = (id) => document.getElementById(id);

  const els = {
    preview: $("preview"), previewVideo: $("previewVideo"),
    camSelect: $("camSelect"), micSelect: $("micSelect"),
    spkSelect: $("spkSelect"), spkRow: $("spkRow"), spkTestBtn: $("spkTestBtn"),
    zoomSlider: $("zoomSlider"), zoomValue: $("zoomValue"), mirrorBtn: $("mirrorBtn"),
    nameInput: $("nameInput"), taglineInput: $("taglineInput"), joinBtn: $("joinBtn"),
    closeBtn: $("closeBtn"), previewBye: $("previewBye"), rejoinBtn: $("rejoinBtn"),
    byeTitle: $("byeTitle"), byeText: $("byeText"),
    previewCard: document.querySelector("#preview .preview-card:not(.bye)"),
    previewError: $("previewError"), micMeterFill: $("micMeterFill"),
    mediaWarning: $("mediaWarning"), mediaWarningText: $("mediaWarningText"),
    mediaWarningClose: $("mediaWarningClose"), mediaWarningLink: $("mediaWarningLink"),
    session: $("session"), banner: $("banner"), grid: $("grid"),
    bannerLogo: $("bannerLogo"), bannerTitle: $("bannerTitle"),
    titleMenu: $("titleMenu"), tmBigger: $("tmBigger"), tmSmaller: $("tmSmaller"),
    tmLogo: $("tmLogo"), tmText: $("tmText"),
    muteBtn: $("muteBtn"), camBtn: $("camBtn"), leaveBtn: $("leaveBtn"),
    dimBtn: $("dimBtn"), handBtn: $("handBtn"), hostPanel: $("hostPanel"),
    hpAutoGain: $("hpAutoGain"), hpGuests: $("hpGuests"),
    hpRecordBtn: $("hpRecordBtn"), hpMicTrouble: $("hpMicTrouble"),
    hpMuteAllBtn: $("hpMuteAllBtn"), hpSubBtn: $("hpSubBtn"), hpAdBtn: $("hpAdBtn"),
    hpBannerSwatches: $("hpBannerSwatches"), hpBannerHex: $("hpBannerHex"),
    hpBannerMulti: $("hpBannerMulti"), hpBannerChoice: $("hpBannerChoice"),
    hpBannerColorsBtn: $("hpBannerColorsBtn"), hpTitleColorsBtn: $("hpTitleColorsBtn"),
    hpBannerPop: $("hpBannerPop"), hpTitlePop: $("hpTitlePop"),
    hpTitleSwatches: $("hpTitleSwatches"), hpTitleHex: $("hpTitleHex"),
    hpBackdropBtn: $("hpBackdropBtn"), hpBackdropPop: $("hpBackdropPop"),
    hpBackdropSwatches: $("hpBackdropSwatches"), hpBackdropHex: $("hpBackdropHex"),
    myColorBtn: $("myColorBtn"), myColorPop: $("myColorPop"),
    hpTipsBtn: $("hpTipsBtn")
  };

  // Inline SVG control icons (house rule: no icon fonts, no emoji)
  const ICONS = {
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9v5a3 3 0 0 0 5.1 2.1M15 10V6a3 3 0 0 0-5.6-1.5M5 11a7 7 0 0 0 11 5.7M19 11a7 7 0 0 1-.9 3.4M12 18v3M4 4l16 16"/></svg>',
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="12" height="12" rx="3"/><path d="M15 11l6-3.5v9L15 13"/></svg>',
    camOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 11l6-3.5v9l-2.2-1.3M15 13v2a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h1M11 6h1a3 3 0 0 1 3 3v1M4 4l16 16"/></svg>',
    palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-2a2 2 0 0 0-1.5 3.3c.4.5.5 1.2 0 1.7a2.6 2.6 0 0 1-2.5 1z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/><circle cx="17.5" cy="11.5" r="1"/></svg>',
    dim: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z"/></svg>',
    hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11V6a1.5 1.5 0 0 1 3 0v4V4.5a1.5 1.5 0 0 1 3 0V10V6a1.5 1.5 0 0 1 3 0v5.5l1.6-2.2a1.5 1.5 0 0 1 2.5 1.6L17.5 17a6 6 0 0 1-5.6 4H11a6 6 0 0 1-6-6v-4z"/></svg>',
    leave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M15 16l4-4-4-4M19 12H9"/></svg>',
    recDot: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="7"/></svg>',
    // The tips switch wears the same round i as the dots it turns off,
    // struck through when they are off, so what the button governs is
    // obvious without a word next to it
    tipsOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/></svg>',
    tipsOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/><path d="M5 5l14 14"/></svg>',
  };
  // Close on the join screen wears the session's Leave button whole -
  // same round red disc, same door icon - so the way out looks the
  // same before you are in the room as it does once you are
  for (const [id, icon] of [["muteBtn", "mic"], ["camBtn", "cam"], ["dimBtn", "dim"], ["leaveBtn", "leave"], ["closeBtn", "leave"], ["myColorBtn", "palette"], ["handBtn", "hand"], ["recLight", "recDot"]]) {
    document.getElementById(id).innerHTML = ICONS[icon];
  }

  let previewStream = null;
  let audioCtx = null;
  // Noise suppression defaults on; only the host can flip it per guest.
  // The crash-loop breaker can force it off for one retry.
  let noisePref = "rnnoise";

  // ---------- Remembered choices ----------

  const PREFS_KEY = "fossstudio-prefs";
  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; }
    catch { return {}; }
  }
  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        cam: els.camSelect.value,
        mic: els.micSelect.value,
        spk: els.spkSelect.value,
        mirror: mirrored,
        name: els.nameInput.value.trim(),
        tagline: els.taglineInput.value.trim()
      }));
    } catch { /* private browsing */ }
  }

  // ---------- Preview ----------

  function showError(msg) {
    els.previewError.textContent = msg;
    els.previewError.hidden = false;
  }

  // A media transport that fails leaves every tile black and silent
  // with nothing on screen to say why, which reads as the app being
  // broken. Say what happened and point at the page that diagnoses it.
  let mediaWarningDismissed = false;
  function setMediaWarning(state) {
    if (state === "connected") {
      els.mediaWarning.hidden = true;
      return;
    }
    if (mediaWarningDismissed) return;
    els.mediaWarningText.textContent = state === "failed"
      ? "The connection to the studio was made, but no video or audio can get through it. On a self-hosted studio this is nearly always the media ports not being reachable."
      : "The connection dropped and is trying to come back. If it doesn't recover in a few seconds, rejoin.";
    // Only the host can act on the setup check, so only the host sees it
    els.mediaWarningLink.hidden = !(isHost && state === "failed");
    els.mediaWarning.hidden = false;
  }
  els.mediaWarningClose.onclick = () => {
    mediaWarningDismissed = true;
    els.mediaWarning.hidden = true;
  };

  // Either direction failing is enough to break the call, so the worst
  // state of the two is the one worth showing.
  const transportStates = new Map();
  function watchTransport(transport) {
    transport.on("connectionstatechange", (state) => {
      transportStates.set(transport.id, state);
      const states = [...transportStates.values()];
      if (states.includes("failed")) return setMediaWarning("failed");
      if (states.includes("disconnected")) return setMediaWarning("disconnected");
      if (states.every((s) => s === "connected")) setMediaWarning("connected");
    });
  }

  async function startPreview() {
    stopPreview();
    const constraints = {
      video: els.camSelect.value
        ? { deviceId: { exact: els.camSelect.value }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: els.micSelect.value ? { deviceId: { exact: els.micSelect.value } } : true
    };
    previewStream = await navigator.mediaDevices.getUserMedia(constraints);
    els.previewVideo.srcObject = previewStream;
    startMicMeter(previewStream);
    setupZoom();
  }

  // ---------- Camera zoom ----------
  // Real lens zoom when the camera supports it; otherwise a digital
  // crop-and-scale through a canvas, which everyone else sees too.

  const zoom = { hw: false, level: 1, canvas: null, canvasTrack: null, rawVideo: null, raf: 0 };

  function setupZoom() {
    stopDigitalZoom();
    zoom.level = 1;
    els.zoomSlider.value = 1;
    els.zoomValue.textContent = "1.0×";
    const track = previewStream?.getVideoTracks()[0];
    const caps = track?.getCapabilities?.() || {};
    zoom.hw = !!caps.zoom;
    if (zoom.hw) {
      els.zoomSlider.min = caps.zoom.min || 1;
      els.zoomSlider.max = caps.zoom.max || 3;
      els.zoomSlider.step = caps.zoom.step || 0.1;
      els.zoomSlider.value = track.getSettings().zoom || caps.zoom.min || 1;
    } else {
      els.zoomSlider.min = 1;
      els.zoomSlider.max = 3;
      els.zoomSlider.step = 0.1;
    }
  }

  function applyZoom() {
    const level = Number(els.zoomSlider.value);
    zoom.level = level;
    els.zoomValue.textContent = `${level.toFixed(1)}×`;
    const track = previewStream?.getVideoTracks()[0];
    if (!track) return;
    if (zoom.hw) {
      track.applyConstraints({ advanced: [{ zoom: level }] }).catch(() => {});
    } else if (level > 1.01) {
      startDigitalZoom();
    } else {
      stopDigitalZoom();
    }
  }
  els.zoomSlider.oninput = applyZoom;

  function startDigitalZoom() {
    if (zoom.canvas) return; // draw loop already running
    const raw = previewStream.getVideoTracks()[0];
    const { width = 1280, height = 720 } = raw.getSettings();
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([raw]);
    video.play().catch(() => {});
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx2d = canvas.getContext("2d");
    const draw = () => {
      if (!zoom.canvas) return;
      if (video.readyState >= 2) {
        const z = Math.max(1, zoom.level);
        const sw = video.videoWidth / z;
        const sh = video.videoHeight / z;
        ctx2d.drawImage(video,
          (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh,
          0, 0, canvas.width, canvas.height);
      }
    };
    zoom.canvas = canvas;
    zoom.rawVideo = video;
    // Drawn on a worker's clock, not requestAnimationFrame: rAF stops in
    // hidden tabs, which froze your camera whenever you checked another
    // tab mid-session. Worker timers keep ticking in the background.
    zoom.ticker = new Worker("/assets/tick-worker.js");
    zoom.ticker.onmessage = draw;
    zoom.canvasTrack = canvas.captureStream(30).getVideoTracks()[0];
    els.previewVideo.srcObject = new MediaStream([zoom.canvasTrack]);
    draw();
  }

  function stopDigitalZoom() {
    if (!zoom.canvas) return;
    zoom.ticker?.terminate();
    zoom.ticker = null;
    zoom.canvasTrack?.stop();
    zoom.rawVideo?.remove();
    zoom.canvas = null;
    zoom.canvasTrack = null;
    zoom.rawVideo = null;
    if (previewStream) els.previewVideo.srcObject = previewStream;
  }

  // Applied noise-suppression state; the host can flip it remotely
  let appliedNoise = false;
  async function setNoiseProcessing(enabled) {
    if (!micProducer || enabled === appliedNoise) return;
    try {
      if (enabled) {
        if (noiseNode) {
          noiseNode.port.postMessage({ enabled: true });
        } else {
          const processed = await noiseProcessedTrack(previewStream.getAudioTracks()[0]);
          await micProducer.replaceTrack({ track: processed });
        }
      } else if (noiseNode) {
        noiseNode.port.postMessage({ enabled: false });
      }
      appliedNoise = enabled;
      window.__noiseApplied = enabled;
    } catch (err) {
      console.error("noise toggle failed:", err.message);
    }
  }

  // The track we actually send: canvas track when digitally zoomed
  function outgoingVideoTrack() {
    return zoom.canvasTrack || previewStream.getVideoTracks()[0];
  }

  // ---------- Speaker pick + test sound ----------

  // The row always shows: even with one fixed speaker you still want
  // the test sound, and a Bluetooth speaker can appear as a second
  // choice at any moment
  const sinkSupported = "setSinkId" in HTMLMediaElement.prototype;

  els.spkTestBtn.onclick = async () => {
    const ctx = ensureAudioCtx();
    if (ctx.state === "suspended") await ctx.resume();
    const dest = ctx.createMediaStreamDestination();
    // A friendly two-note chime
    for (const [freq, at] of [[523.25, 0], [783.99, 0.35]]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.6);
      osc.connect(gain).connect(dest);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.7);
    }
    const audio = new Audio();
    audio.srcObject = dest.stream;
    try { if (els.spkSelect.value) await audio.setSinkId(els.spkSelect.value); } catch { /* default */ }
    audio.play().catch(() => {});
    setTimeout(() => { audio.srcObject = null; }, 1500);
  };

  // ---------- Mirror ----------

  let mirrored = true;
  function applyMirror() {
    // The mirror is for the preview only - checking yourself works
    // like a mirror. Your tile in the session shows your true
    // orientation, exactly what guests, the recording and the stream
    // see, so the screen and the output never disagree.
    els.previewVideo.style.transform = mirrored ? "scaleX(-1)" : "none";
    const self = tiles.get(selfId);
    if (self) self.video.style.transform = "none";
    els.mirrorBtn.classList.toggle("active", mirrored);
    els.mirrorBtn.setAttribute("aria-pressed", String(mirrored));
    els.mirrorBtn.dataset.tip = mirrored ? "Stop mirroring my preview" : "Mirror my preview";
  }
  els.mirrorBtn.onclick = () => { mirrored = !mirrored; applyMirror(); };

  function stopPreview() {
    if (previewStream) {
      for (const t of previewStream.getTracks()) t.stop();
      previewStream = null;
    }
  }

  // RNNoise works on 10ms frames at 48kHz, so pin the context rate
  function ensureAudioCtx() {
    if (!audioCtx) audioCtx = new AudioContext({ sampleRate: 48000 });
    return audioCtx;
  }

  // A microphone that stalls hands MediaRecorder nothing at all, and
  // what the recorder is never given it cannot write. The file then
  // comes back shorter than the take, and - because the holes are not
  // kept - every word after a stall sits earlier than it was said, so
  // that track slides further out of step with everybody else as the
  // evening goes on. FOSSNerds lost 24 seconds of one person that way
  // on 5 September 2026, in 119 separate stalls of about a fifth of a
  // second each.
  //
  // Recording from a Web Audio graph instead fixes it, because the graph
  // is driven by the audio context's own clock rather than by the
  // device: it goes on producing through a stall, so the loss lands in
  // the file as silence of exactly the right length and nothing after it
  // moves. A silent source is mixed in and left running so the graph
  // always has something of its own to render, even if the microphone
  // never comes back at all.
  const steadyParts = [];
  function steadyTrack(track) {
    const ctx = ensureAudioCtx();
    const dest = ctx.createMediaStreamDestination();
    ctx.createMediaStreamSource(new MediaStream([track])).connect(dest);
    const keep = new ConstantSourceNode(ctx, { offset: 0 });
    keep.connect(dest);
    keep.start();
    steadyParts.push({ keep, dest });
    return dest.stream.getAudioTracks()[0];
  }

  function releaseSteadyTracks() {
    for (const { keep, dest } of steadyParts.splice(0)) {
      try { keep.stop(); } catch { /* already stopped */ }
      keep.disconnect();
      for (const t of dest.stream.getTracks()) t.stop();
    }
  }

  // Route the mic through the RNNoise worklet; returns the cleaned track
  let noiseNode = null;
  async function noiseProcessedTrack(rawTrack) {
    const ctx = ensureAudioCtx();
    if (!noiseNode) {
      await ctx.audioWorklet.addModule("/assets/noise-worklet.js");
    }
    const src = ctx.createMediaStreamSource(new MediaStream([rawTrack]));
    noiseNode = new AudioWorkletNode(ctx, "rnnoise");
    const dest = ctx.createMediaStreamDestination();
    src.connect(noiseNode).connect(dest);
    return dest.stream.getAudioTracks()[0];
  }

  function startMicMeter(stream) {
    ensureAudioCtx();
    const src = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    (function tick() {
      // Either is enough to stop it: no stream to read, or the preview
      // gone from the screen. It used to need both, so pressing Close -
      // which stops the stream but leaves the preview showing a goodbye -
      // left this spinning on a frame timer with nothing to measure.
      if (!previewStream || els.preview.hidden) return;
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      els.micMeterFill.style.width = `${Math.min(100, (peak / 128) * 300)}%`;
      requestAnimationFrame(tick);
    })();
  }

  async function populateDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const fill = (select, kind, label) => {
      const current = select.value;
      select.innerHTML = "";
      devices.filter((d) => d.kind === kind).forEach((d, i) => {
        const opt = document.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || `${label} ${i + 1}`;
        select.appendChild(opt);
      });
      if (current) select.value = current;
    };
    fill(els.camSelect, "videoinput", "Camera");
    fill(els.micSelect, "audioinput", "Microphone");
    fill(els.spkSelect, "audiooutput", "Speaker");
    // Tablets and phones often expose no output devices (or can't
    // switch): show "Default speaker" and keep the test sound working
    if (els.spkSelect.options.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Default speaker";
      els.spkSelect.appendChild(opt);
    }
    els.spkSelect.disabled = !sinkSupported || els.spkSelect.options.length <= 1;
  }

  async function initPreview() {
    try {
      await startPreview();          // ask permission first so labels appear
      await populateDevices();
      // Show the devices actually in use (the system defaults) so the
      // dropdowns always start on the default camera and microphone
      const micId = previewStream?.getAudioTracks()[0]?.getSettings().deviceId;
      if (micId && [...els.micSelect.options].some((o) => o.value === micId)) {
        els.micSelect.value = micId;
      }
      const camId = previewStream?.getVideoTracks()[0]?.getSettings().deviceId;
      if (camId && [...els.camSelect.options].some((o) => o.value === camId)) {
        els.camSelect.value = camId;
      }
      // Bring back last time's choices where the devices still exist
      const prefs = loadPrefs();
      if (prefs.name && !els.nameInput.value) els.nameInput.value = prefs.name;
      if (prefs.tagline && !els.taglineInput.value) els.taglineInput.value = prefs.tagline;
      if (typeof prefs.mirror === "boolean") mirrored = prefs.mirror;
      applyMirror();
      if (prefs.spk && [...els.spkSelect.options].some((o) => o.value === prefs.spk)) {
        els.spkSelect.value = prefs.spk;
      }
      const camBack = prefs.cam && [...els.camSelect.options].some((o) => o.value === prefs.cam);
      const micBack = prefs.mic && [...els.micSelect.options].some((o) => o.value === prefs.mic);
      if (camBack) els.camSelect.value = prefs.cam;
      if (micBack) els.micSelect.value = prefs.mic;
      if (camBack || micBack) await startPreview();
      els.joinBtn.disabled = false;
    } catch (err) {
      showError(
        err.name === "NotAllowedError"
          ? "Camera and microphone access was blocked. Allow access in your browser and reload this page."
          : "Couldn't start your camera or microphone. Check nothing else is using them, then reload."
      );
    }
  }

  els.camSelect.onchange = () => startPreview().catch(() => showError("Couldn't switch camera."));
  els.micSelect.onchange = () => startPreview().catch(() => showError("Couldn't switch microphone."));
  navigator.mediaDevices.addEventListener("devicechange", populateDevices);

  // ---------- Signaling ----------

  let ws = null;
  let reqId = 0;
  const pending = new Map();
  const eventHandlers = {};
  const earlyEvents = []; // events that arrived before handlers existed
  function drainEarlyEvents() {
    while (earlyEvents.length) {
      const msg = earlyEvents.shift();
      try { eventHandlers[msg.event]?.(msg.data); } catch (e) { console.error(e); }
    }
  }

  function connectWs() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws?room=${roomId}`);
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("connection failed"));
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id !== undefined) {
          const p = pending.get(msg.id);
          if (!p) return;
          pending.delete(msg.id);
          msg.ok ? p.resolve(msg.data) : p.reject(new Error(msg.error));
        } else if (msg.event && eventHandlers[msg.event]) {
          eventHandlers[msg.event](msg.data);
        } else if (msg.event) {
          // Events can land between the join reply and handler
          // registration (e.g. recordingStarted for a mid-recording
          // joiner). Queue them; join() replays once it's wired up.
          // Dropping them silently cost a guest their whole track once.
          earlyEvents.push(msg);
        }
      };
      ws.onclose = (e) => {
        if (!joined) return;
        // 4409/4410: this seat was taken by a newer window of the same
        // browser or the same login. Say so rather than going dark, and
        // land on the goodbye card instead of the join form: the join
        // form invites a click that would take the seat straight back
        // and leave the two windows swapping it. The way back is still
        // on the page, one deliberate button away.
        if (e.code === 4409 || e.code === 4410) {
          steppedAside(e.code === 4410
            ? ["Hosting moved to another window",
               "You opened this session again somewhere else, and that window is the host now. Only one window can run a session: two Record buttons and two sets of controls would undo each other."]
            : ["You joined again in another window",
               "This session is open in another window of this browser, and that one has your place in the room. One window each keeps the recording usable."]);
          return;
        }
        leaveToPreview(e.code === 4403
          ? "The host has removed you from this session."
          : "The connection dropped. Rejoin when you're ready.");
      };
    });
  }

  function request(method, data = {}) {
    return new Promise((resolve, reject) => {
      const id = ++reqId;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, data }));
    });
  }

  // ---------- Session state ----------

  let device, sendTransport, recvTransport;
  let micProducer, camProducer;
  let selfId = null;
  let selfName = "";
  let isHost = false;
  let joined = false;
  let control = { layout: "grid", spotlightPeerId: null, volumes: {} };
  const tiles = new Map();     // peerId -> {el, video, stream, name, gain}
  const consumers = new Map(); // consumerId -> {consumer, peerId}

  // ---------- The program: this browser as the mixer ----------
  // When the host records, this page draws the show onto a canvas, mixes
  // every voice and encodes the result, so the finished video needs no
  // drawing on the server at all.
  let mixer = null;
  let micBus = null;                // the host's own mic into the program, muted with the button
  const bannerImgs = new Map();     // peerId -> Image, the same PNG the recording would use
  let titleImg = null;


  // Gray out a control without using the disabled attribute. A disabled
  // button fires no pointer events in any browser, so its tooltip never
  // appears - and a gray button that will not say why it is gray is
  // worse than no button. This keeps the events and refuses the click.
  function unavailable(btn, why) {
    btn.setAttribute("aria-disabled", "true");
    btn.dataset.tip = why;
  }
  function available(btn, tip) {
    btn.removeAttribute("aria-disabled");
    if (tip) btn.dataset.tip = tip;
    else btn.removeAttribute("data-tip");
  }
  function refused(btn) { return btn.getAttribute("aria-disabled") === "true"; }

  // ---------- Theme ----------

  function applyTheme(theme) {
    if (theme.backdrops) backdrops = theme.backdrops;
    // The ad button is gray and says why until a banner exists, rather
    // than being pressable and then refusing. A host should be able to
    // see what is available without trying it.
    if (isHost && els.hpAdBtn) {
      if (theme.hasAd) available(els.hpAdBtn, "Play your ad banner over the show");
      else unavailable(els.hpAdBtn, "Upload an ad banner in Settings first");
    }
    if (theme.backdrop) backdropMode = theme.backdrop === "wallpaper" ? "wallpaper" : "colour";
    if (theme.bg) backdropColour = theme.bg;
    if (isHost) renderBackdropUI();
    document.title = theme.title ? `${theme.title} - live` : "FOSSStudio - live";
    document.getElementById("bannerTitle").textContent = theme.title || "";
    const logo = document.getElementById("bannerLogo");
    if (theme.logo) {
      logo.src = theme.logo;
      logo.decode().then(() => scheduleBannerImages()).catch(() => {});
    } else {
      logo.removeAttribute("src");
    }
    // What the theme provides, and what is actually shown, are separate:
    // the host can drop either part for this session
    applyTitleShow();
    // Background color shows when there is no wallpaper; a wallpaper
    // paints over it
    if (theme.bg) els.grid.style.backgroundColor = theme.bg;
    if (theme.wallpaper) {
      els.grid.style.backgroundImage = `url(${theme.wallpaper})`;
      els.session.classList.add("wallpapered");
    } else {
      els.grid.style.backgroundImage = "";
      els.session.classList.remove("wallpapered");
    }
  }

  function applyAutoGain(enabled) {
    const track = previewStream?.getAudioTracks()[0];
    if (track) track.applyConstraints({ autoGainControl: enabled }).catch(() => {});
  }

  // ---------- Tiles & audio routing ----------
  // Remote audio plays through a per-guest GainNode so the host's
  // volume sliders affect what everyone hears, including recordings.

  function makeTile(peerId, name, isSelf, tagline = "", isHostPeer = false) {
    const el = document.createElement("div");
    el.className = "tile" + (isSelf ? " self" : "");
    el.dataset.peerId = peerId;
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true; // audio goes through the gain graph, not the element
    const third = document.createElement("div");
    third.className = "lower-third";
    const nameEl = document.createElement("div");
    nameEl.className = "name";
    nameEl.textContent = name;
    third.appendChild(nameEl);
    if (tagline) {
      const tagEl = document.createElement("div");
      tagEl.className = "tagline";
      tagEl.textContent = tagline;
      third.appendChild(tagEl);
    }
    el.append(video, third);
    // Hosts first (in join order among themselves - the compositors
    // stable-sort the same way, so screen and output agree even with
    // co-hosts), then everyone else in join order
    if (isHostPeer) {
      el.dataset.hostTile = "1";
      const hostTiles = els.grid.querySelectorAll("[data-host-tile]");
      const after = hostTiles.length ? hostTiles[hostTiles.length - 1] : els.banner;
      els.grid.insertBefore(el, after.nextSibling);
    } else {
      els.grid.appendChild(el);
    }
    const stream = new MediaStream();
    video.srcObject = stream;
    tiles.set(peerId, { el, video, stream, name, gain: null, isHostPeer });
    applyLayout();
    if (isHost) renderHostGuests();
    scheduleBannerImages();
    return tiles.get(peerId);
  }

  let masterDest = null;
  let outputEl = null;

  function audioSink() {
    const ctx = ensureAudioCtx();
    if (!masterDest) {
      masterDest = ctx.createMediaStreamDestination();
      outputEl = new Audio();
      outputEl.srcObject = masterDest.stream;
      outputEl.autoplay = true;
      if (sinkSupported && els.spkSelect.value) {
        outputEl.setSinkId(els.spkSelect.value).catch(() => {});
      }
      outputEl.play().catch(() => {});
    }
    return masterDest;
  }

  function attachAudio(peerId, track) {
    ensureAudioCtx();
    const tile = tiles.get(peerId);
    if (!tile) return;
    // Chrome quirk: a remote track must be attached to a media element
    // before WebAudio receives data - the muted tile <video> does that.
    tile.stream.addTrack(track);
    const src = audioCtx.createMediaStreamSource(new MediaStream([track]));
    const gain = audioCtx.createGain();
    gain.gain.value = control.volumes[peerId] ?? 1;
    src.connect(gain).connect(audioSink());
    if (mixer?.audioDest) gain.connect(mixer.audioDest);
    tile.gain = gain;
    const an = audioCtx.createAnalyser();
    an.fftSize = 256;
    src.connect(an);
    tile.analyser = an;
  }

  function removeTile(peerId) {
    const tile = tiles.get(peerId);
    if (!tile) return;
    tile.el.remove();
    tiles.delete(peerId);
    if (control.spotlightPeerId === peerId) {
      control.layout = "grid";
      control.spotlightPeerId = null;
    }
    applyLayout();
    if (isHost) renderHostGuests();
  }

  // Fractions of frame width, matching LAYOUT in server/test/layout.js.
  // They cannot be imported from there (the browser can't load server
  // code), so test/geometry-test.mjs asserts the two stay in step.
  const PAD_FRACTION = 24 / 1280;
  const GAP_FRACTION = 20 / 1280;
  const RADIUS_FRACTION = 16 / 1280;
  const STRIP_FRACTION = 0.16;

  function applyGridSpacing() {
    const gw = els.grid.clientWidth;
    if (matchMedia("(max-width: 700px)").matches) {
      // Phone layout is deliberately not the recording's layout: two
      // columns and tighter spacing so faces stay big enough to see.
      // Let the stylesheet have it.
      els.grid.style.removeProperty("padding");
      els.grid.style.removeProperty("gap");
    } else {
      els.grid.style.padding = `${Math.round(gw * PAD_FRACTION)}px`;
      els.grid.style.gap = `${Math.round(gw * GAP_FRACTION)}px`;
    }
    els.grid.style.setProperty("--tile-rad", `${(gw * RADIUS_FRACTION).toFixed(1)}px`);
    els.grid.style.setProperty("--strip-h", `${Math.round(els.grid.clientHeight * STRIP_FRACTION)}px`);
  }

  function applyLayout() {
    for (const t of els.grid.querySelectorAll(".tile")) {
      t.style.width = "";
      t.style.height = "";
    }
    const spot = control.layout === "spotlight" && tiles.has(control.spotlightPeerId);
    // Spacing is a fraction of the video area, the same fraction the
    // compositors use of the frame, so the recording is the same picture
    // rather than a tighter, more zoomed-in one
    applyGridSpacing();
    els.grid.classList.toggle("spotlight", spot);
    for (const [peerId, tile] of tiles) {
      tile.el.classList.toggle("featured", spot && peerId === control.spotlightPeerId);
    }
    if (spot) {
      // One column per person in the strip, so they spread across it the
      // way tileLayout() spreads them in the recording
      els.grid.style.setProperty("--strip-cols", `repeat(${Math.max(1, tiles.size - 1)}, 1fr)`);
    }
    if (!spot) {
      const mobile = matchMedia("(max-width: 700px)").matches;
      const n = Math.max(1, tiles.size); // self included everywhere
      const cols = mobile ? Math.min(2, n) : Math.ceil(Math.sqrt(n));
      // Rows as even as possible, fuller rows first: 7 people means
      // 3 + 2 + 2, 8 means 3 + 3 + 2 - never 3 + 3 + 1
      const rows = Math.ceil(n / cols);
      const base = Math.floor(n / rows), extra = n % rows;
      const rowSizes = Array.from({ length: rows }, (_, r) => base + (r < extra ? 1 : 0));
      // One tile size for everyone: as large as fits both ways
      const cs = getComputedStyle(els.grid);
      const gap = parseFloat(cs.gap) || 16;
      const padL = parseFloat(cs.paddingLeft), padT = parseFloat(cs.paddingTop);
      const availW = els.grid.clientWidth - padL - parseFloat(cs.paddingRight);
      const availH = els.grid.clientHeight - padT - parseFloat(cs.paddingBottom);
      const tileW = Math.max(120, Math.min(
        (availW - (cols - 1) * gap) / cols,
        ((availH - (rows - 1) * gap) / rows) * 16 / 9
      ));
      const tileH = tileW * 9 / 16;
      const blockH = rows * tileH + (rows - 1) * gap;
      const startY = mobile ? padT : padT + Math.max(0, (availH - blockH) / 2);
      els.grid.style.setProperty("--tile-w", `${Math.floor(tileW)}px`);
      // Place tiles by hand: same math as the recording/stream grid
      const els2 = [...els.grid.querySelectorAll(".tile")];
      let idx = 0;
      rowSizes.forEach((size, r) => {
        const rowW = size * tileW + (size - 1) * gap;
        const x0 = padL + (availW - rowW) / 2;
        for (let cix = 0; cix < size && idx < els2.length; cix++, idx++) {
          els2[idx].style.left = `${Math.round(x0 + cix * (tileW + gap))}px`;
          els2[idx].style.top = `${Math.round(startY + r * (tileH + gap))}px`;
        }
      });
    } else {
      for (const t of els.grid.querySelectorAll(".tile")) {
        t.style.left = "";
        t.style.top = "";
      }
    }
    positionTitleBlock();
  }
  window.addEventListener("resize", () => applyLayout());
  matchMedia("(max-width: 700px)").addEventListener("change", applyLayout);

  // One palette for both color tools: 15 colors laid out 6 + 6 + 3,
  // with the hex box filling the rest of the third row
  const BANNER_COLOURS = [
    "#f34236", "#fe9700", "#fbc711", "#8bc34a", "#4bae4f", "#019587",
    "#00bcd3", "#2295f1", "#3d51b4", "#9b26ae", "#e8207e", "#795649",
    "#607d8b", "#9e9d9e", "#1e2127"
  ];

  function sendBannerColor(c) {
    request("hostControl", { action: "bannerColor", color: c })
      .catch(() => {});
  }

  function renderBannerSwatches() {
    els.hpBannerSwatches.innerHTML = "";
    for (const hex of BANNER_COLOURS) {
      const b = document.createElement("button");
      b.className = "hp-swatch" + (!control.bannerMulti && hex === control.bannerColor ? " active" : "");
      b.style.background = hex;
      b.dataset.tip = hex;
      b.setAttribute("aria-label", `Banner color ${hex}`);
      b.onclick = () => sendBannerColor(hex);
      els.hpBannerSwatches.appendChild(b);
    }
  }

  // The color tools sit behind two small buttons - the panel stays
  // calm until colors are wanted
  const togglePop = (pop, ...others) => () => {
    for (const o of others) o.hidden = true;
    pop.hidden = !pop.hidden;
    els.hpBannerColorsBtn.classList.toggle("active", !els.hpBannerPop.hidden);
    els.hpTitleColorsBtn.classList.toggle("active", !els.hpTitlePop.hidden);
    els.hpBackdropBtn.classList.toggle("active", !els.hpBackdropPop.hidden);
  };
  els.hpBannerColorsBtn.onclick = togglePop(els.hpBannerPop, els.hpTitlePop, els.hpBackdropPop);
  els.hpTitleColorsBtn.onclick = togglePop(els.hpTitlePop, els.hpBannerPop, els.hpBackdropPop);
  els.hpBackdropBtn.onclick = togglePop(els.hpBackdropPop, els.hpBannerPop, els.hpTitlePop);

  // ---------- Backdrop generators (shared shapes with the old
  // dashboard generator, now living where the choice is made) ----------
  function makeStamp(img, tint) {
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height);
    let transparent = 0;
    for (let i = 3; i < d.data.length; i += 4) if (d.data[i] < 40) transparent++;
    const hasAlpha = transparent > d.data.length / 4 * 0.05;
    const tc = [parseInt(tint.slice(1, 3), 16), parseInt(tint.slice(3, 5), 16), parseInt(tint.slice(5, 7), 16)];
    for (let i = 0; i < d.data.length; i += 4) {
      const lum = (d.data[i] * 0.299 + d.data[i + 1] * 0.587 + d.data[i + 2] * 0.114) / 255;
      d.data[i] = tc[0]; d.data[i + 1] = tc[1]; d.data[i + 2] = tc[2];
      // Floor the luminance mask: a solid logo's dark backing sits
      // well under 0.3 and must map to fully transparent, or every
      // stamp carries a faint rectangular halo of its canvas
      d.data[i + 3] = hasAlpha ? d.data[i + 3]
        : Math.round(Math.max(0, (lum - 0.3) / 0.7) * 255);
    }
    x.putImageData(d, 0, 0);
    // Trim to the visible bounding box, so stamps pack by their marks
    // rather than by whatever padding the source file carried
    let minX = c.width, minY = c.height, maxX = 0, maxY = 0;
    for (let py = 0; py < c.height; py++) {
      for (let px = 0; px < c.width; px++) {
        if (d.data[(py * c.width + px) * 4 + 3] > 30) {
          if (px < minX) minX = px; if (px > maxX) maxX = px;
          if (py < minY) minY = py; if (py > maxY) maxY = py;
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return c;
    const t = document.createElement("canvas");
    t.width = maxX - minX + 1; t.height = maxY - minY + 1;
    t.getContext("2d").drawImage(c, -minX, -minY);
    return t;
  }
  function mixHex(hex, withHex, t) {
    const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const b = [1, 3, 5].map((i) => parseInt(withHex.slice(i, i + 2), 16));
    return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }
  function drawLogoCollage(canvas, img, baseColour) {
    const x = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.filter = "none";
    x.globalAlpha = 1;
    x.fillStyle = baseColour;
    x.fillRect(0, 0, W, H);
    // The logos are drawn as SHADES of the base color, not in their
    // own colors: four silhouette stamps mixed different distances
    // toward white and black, picked per copy for depth
    const shades = [
      mixHex(baseColour, "#ffffff", 0.16),
      mixHex(baseColour, "#ffffff", 0.30),
      mixHex(baseColour, "#ffffff", 0.46),
      mixHex(baseColour, "#000000", 0.22)
    ].map((t) => makeStamp(img, t));
    const ar = shades[0].width / shades[0].height;
    // Jittered grid placement: one copy per cell fills the frame with
    // no empty patches, while overlap is capped at neighbors' edges
    const cellH = 58 + Math.random() * 14;
    const cellW = cellH * Math.min(Math.max(ar, 0.7), 2.4);
    for (let row = -1; row * cellH < H + cellH; row++) {
      for (let col = -1; col * cellW < W + cellW; col++) {
        const cx = col * cellW + cellW / 2 + (Math.random() - 0.5) * cellW * 0.4;
        const cy = row * cellH + cellH / 2 + (Math.random() - 0.5) * cellH * 0.4;
        const h = cellH * (0.8 + Math.random() * 0.55);
        const w = h * ar;
        x.setTransform(1, 0, 0, 1, cx, cy);
        x.rotate((Math.random() - 0.5) * 1.6);            // up to ~46 deg
        x.transform(1, (Math.random() - 0.5) * 0.5,       // the 3D lean
                    (Math.random() - 0.5) * 0.5,
                    0.62 + Math.random() * 0.38, 0, 0);   // foreshortening
        x.globalAlpha = 0.75 + Math.random() * 0.25;      // the shade IS the color
        x.drawImage(shades[Math.floor(Math.random() * shades.length)], -w / 2, -h / 2, w, h);
      }
    }
    // Gentle vignette so tiles sit on a calmer center
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.filter = "none";
    x.globalAlpha = 1;
    const g = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.22)");
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  }
  function drawLogoPattern(canvas, img, baseColour) {
    const x = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.filter = "none";
    x.globalAlpha = 1;
    x.fillStyle = baseColour;
    x.fillRect(0, 0, W, H);
    const tint = mixHex(baseColour, "#ffffff", 0.46);
    const stamp = makeStamp(img, tint);
    const ar = stamp.width / stamp.height;
    let y = -20;
    while (y < H + 40) {
      const rowH = 36 + Math.random() * 34;
      let px = -20 + Math.random() * -30;
      while (px < W + 40) {
        const h = rowH * (0.82 + Math.random() * 0.36);
        const w = h * ar;
        x.setTransform(1, 0, 0, 1, px + w / 2, y + rowH / 2);
        x.rotate((Math.random() - 0.5) * 0.24);
        x.globalAlpha = 0.16 + Math.random() * 0.14;
        x.drawImage(stamp, -w / 2, -h / 2, w, h);
        px += w + 5 + Math.random() * 8;
      }
      y += rowH + 6 + Math.random() * 7;
    }
    // the reference's soft dark corners
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    const g = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 1.05);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.3)");
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  }
  function drawLogoGrid(canvas, img, baseColour, { offset = 0, angle = 0 } = {}) {
    const x = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.filter = "none";
    x.globalAlpha = 1;
    x.fillStyle = baseColour;
    x.fillRect(0, 0, W, H);
    const stamp = makeStamp(img, mixHex(baseColour, "#ffffff", 0.16));
    const ar = stamp.width / stamp.height;
    const h = 64;
    const w = h * ar;
    const gapX = w * 0.55, gapY = h * 0.75;
    const pitchX = w + gapX, pitchY = h + gapY;
    x.translate(W / 2, H / 2);
    if (angle) x.rotate(angle);
    // overdraw past the edges so a rotated grid still covers the frame
    const spanX = Math.ceil((Math.hypot(W, H) / 2 + pitchX) / pitchX);
    const spanY = Math.ceil((Math.hypot(W, H) / 2 + pitchY) / pitchY);
    for (let row = -spanY; row <= spanY; row++) {
      const shift = offset ? (row & 1 ? pitchX / 2 : 0) : 0;
      for (let col = -spanX; col <= spanX; col++) {
        x.drawImage(stamp, col * pitchX + shift - w / 2, row * pitchY - h / 2, w, h);
      }
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
  }
  function drawLogoWatermark(canvas, img, baseColour) {
    const x = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.filter = "none";
    x.globalAlpha = 1;
    x.fillStyle = baseColour;
    x.fillRect(0, 0, W, H);
    const stamp = makeStamp(img, mixHex(baseColour, "#ffffff", 0.12));
    const ar = stamp.width / stamp.height;
    // Bottom-right, the classic watermark corner
    const h = H * 0.52;
    const w = h * ar;
    const m = H * 0.06;
    x.drawImage(stamp, W - w - m, H - h - m, w, h);
  }

  // ---------- Backdrop: switch the show's background live ----------
  // Color, the pinned wallpaper, or the pinned logo background - a
  // segment per kind, the palette shown for color. Availability comes
  // from the pinned theme (a host without a wallpaper can't pick one).
  // Two kinds: Color (solid, or the logo laid out in the picked
  // color and style, generated right here and pushed like a banner
  // snapshot) - or the pinned Wallpaper.
  const BACKDROP_STYLES = [
    ["solid", "Solid"], ["scatter", "Scatter"], ["mosaic", "Mosaic"],
    ["grid", "Grid"], ["brick", "Brick"], ["diagonal", "Diagonal"], ["watermark", "Watermark"]
  ];
  let backdrops = { wallpaper: false, logo: false };
  let backdropMode = "colour";
  let backdropColour = null;
  let backdropStyle = "solid";
  let backdropLogoImg = null;

  function renderBackdropUI() {
    $("hpBackdropColour").setAttribute("aria-pressed", String(backdropMode !== "wallpaper"));
    const wp = $("hpBackdropWallpaper");
    wp.setAttribute("aria-pressed", String(backdropMode === "wallpaper"));
    if (backdrops.wallpaper) available(wp);
    else unavailable(wp, "Upload a wallpaper in Settings first");
    $("hpBackdropColourTools").style.display = backdropMode === "wallpaper" ? "none" : "";
    els.hpBackdropSwatches.innerHTML = "";
    for (const hex of BANNER_COLOURS) {
      const sw = document.createElement("button");
      sw.className = "hp-swatch" + (hex === backdropColour ? " active" : "");
      sw.style.background = hex;
      sw.dataset.tip = hex;
      sw.setAttribute("aria-label", `Backdrop color ${hex}`);
      sw.onclick = () => { backdropColour = hex; els.hpBackdropHex.value = hex; applyBackdropChoice(); };
      els.hpBackdropSwatches.appendChild(sw);
    }
    const row = $("hpBackdropStyles");
    row.innerHTML = "";
    for (const [id, label] of BACKDROP_STYLES) {
      const b = document.createElement("button");
      b.className = "hp-btn";
      b.textContent = label;
      b.setAttribute("aria-pressed", String(backdropStyle === id));
      const needsLogo = id !== "solid";
      b.disabled = needsLogo && !backdrops.logo;
      if (b.disabled) b.dataset.tip = "Upload a logo in Themes for the logo layouts";
      b.onclick = () => { backdropStyle = id; applyBackdropChoice(); };
      row.appendChild(b);
    }
  }

  function backdropLogo() {
    // The room's pinned logo, loaded once - the layouts draw from it
    if (backdropLogoImg) return Promise.resolve(backdropLogoImg);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { backdropLogoImg = img; resolve(img); };
      img.onerror = reject;
      img.src = document.getElementById("bannerLogo")?.src || "";
    });
  }

  async function applyBackdropChoice() {
    backdropMode = "colour";
    renderBackdropUI();
    const colour = backdropColour || control.backdrop?.colour || "#14161a";
    if (backdropStyle === "solid") {
      request("hostControl", { action: "backdrop", mode: "colour", colour, style: "solid" })
        .catch(() => {});
      return;
    }
    try {
      const img = await backdropLogo();
      const canvas = document.createElement("canvas");
      canvas.width = 1920; canvas.height = 1080;
      const draw = {
        scatter: () => drawLogoCollage(canvas, img, colour),
        mosaic: () => drawLogoPattern(canvas, img, colour),
        grid: () => drawLogoGrid(canvas, img, colour),
        brick: () => drawLogoGrid(canvas, img, colour, { offset: 1 }),
        diagonal: () => drawLogoGrid(canvas, img, colour, { offset: 1, angle: -0.32 }),
        watermark: () => drawLogoWatermark(canvas, img, colour)
      }[backdropStyle];
      draw();
      request("hostControl", {
        action: "backdrop", mode: "generated", colour, style: backdropStyle,
        png: canvas.toDataURL("image/png")
      }).catch(() => {});
    } catch { /* logo failed to load: nothing sent */ }
  }

  $("hpBackdropColour").onclick = () => { backdropMode = "colour"; renderBackdropUI(); };
  $("hpBackdropWallpaper").onclick = () => {
    backdropMode = "wallpaper";
    renderBackdropUI();
    request("hostControl", { action: "backdrop", mode: "wallpaper" }).catch(() => {});
  };
  els.hpBackdropHex.onchange = () => {
    let v = els.hpBackdropHex.value.trim();
    if (v && !v.startsWith("#")) v = "#" + v;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) { backdropColour = v.toLowerCase(); applyBackdropChoice(); }
    else els.hpBackdropHex.value = "";
  };

  // Background color of the logo/title block. The first swatch is the
  // default dark; light backgrounds flip the text dark automatically.
  const TITLE_DEFAULT_BG = "#1e2127";
  function titleBgColor() {
    return /^#[0-9a-fA-F]{6}$/.test(control?.titleBg || "") ? control.titleBg : TITLE_DEFAULT_BG;
  }
  function titleFgFor(bg) {
    const r = parseInt(bg.slice(1, 3), 16), g = parseInt(bg.slice(3, 5), 16), b = parseInt(bg.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#14161a" : "#ffffff";
  }
  function applyTitleBg() {
    const bg = titleBgColor();
    els.banner.style.setProperty("--title-bg", bg);
    els.banner.style.setProperty("--title-fg", titleFgFor(bg));
    if (isHost) renderTitleSwatches();
  }
  function sendTitleBg(c) {
    control.titleBg = c; // optimistic
    applyTitleBg();
    refreshBannerImages().catch(() => {});
    request("hostControl", { action: "titleBg", color: c }).catch(() => {});
  }
  function renderTitleSwatches() {
    els.hpTitleSwatches.innerHTML = "";
    for (const hex of BANNER_COLOURS) {
      const b = document.createElement("button");
      b.className = "hp-swatch" + (hex === titleBgColor() ? " active" : "");
      b.style.background = hex;
      b.dataset.tip = hex === TITLE_DEFAULT_BG ? "Default" : hex;
      b.setAttribute("aria-label", `Title block color ${hex}`);
      b.onclick = () => sendTitleBg(hex === TITLE_DEFAULT_BG ? null : hex);
      els.hpTitleSwatches.appendChild(b);
    }
    if (document.activeElement !== els.hpTitleHex) {
      els.hpTitleHex.value = control?.titleBg || "";
    }
  }
  els.hpTitleHex.onchange = () => {
    let v = els.hpTitleHex.value.trim();
    if (/^[0-9a-fA-F]{6}$/.test(v)) v = `#${v}`;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) sendTitleBg(v.toLowerCase());
    else if (v === "") sendTitleBg(null);
    else els.hpTitleHex.value = control?.titleBg || "";
  };

  els.hpBannerMulti.onclick = () =>
    request("hostControl", { action: "bannerMulti" }).catch(() => {});
  els.hpBannerChoice.onclick = () =>
    request("hostControl", { action: "bannerChoice" }).catch(() => {});

  // ---------- Everyone's own color picker (when the host allows) ----------

  function renderMyColors() {
    els.myColorPop.innerHTML = "";
    for (const hex of BANNER_COLOURS) {
      const b = document.createElement("button");
      b.className = "hp-swatch" + (control.bannerColors?.[selfId] === hex ? " active" : "");
      b.style.background = hex;
      b.setAttribute("aria-label", `My banner color ${hex}`);
      b.onclick = () => {
        request("myBannerColor", { color: hex }).catch(() => {});
        els.myColorPop.hidden = true;
      };
      els.myColorPop.appendChild(b);
    }
  }
  els.myColorBtn.onclick = () => {
    els.myColorPop.hidden = !els.myColorPop.hidden;
    if (!els.myColorPop.hidden) renderMyColors();
  };

  els.hpBannerHex.onchange = () => {
    let v = els.hpBannerHex.value.trim();
    if (/^[0-9a-fA-F]{6}$/.test(v)) v = "#" + v;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) sendBannerColor(v.toLowerCase());
    else els.hpBannerHex.value = control.bannerColor || "";
  };

  function bannerFg(c) {
    const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? "#14161a" : "#ffffff";
  }

  function applyBannerColor() {
    const c = control.bannerColor || "#1e2127";
    els.grid.style.setProperty("--banner-c", c);
    els.grid.style.setProperty("--banner-fg", bannerFg(c));
    // Per-person colors override the shared one on each tile
    for (const [peerId, tile] of tiles) {
      const mine = control.bannerMulti ? control.bannerColors?.[peerId] : null;
      if (mine) {
        tile.el.style.setProperty("--banner-c", mine);
        tile.el.style.setProperty("--banner-fg", bannerFg(mine));
      } else {
        tile.el.style.removeProperty("--banner-c");
        tile.el.style.removeProperty("--banner-fg");
      }
    }
    if (isHost) {
      if (document.activeElement !== els.hpBannerHex) els.hpBannerHex.value = c;
      renderBannerSwatches();
      els.hpBannerMulti.classList.toggle("active", !!control.bannerMulti && !control.bannerChoice);
      els.hpBannerChoice.classList.toggle("active", !!control.bannerChoice);
    }
    const myHand = !!control.hands?.[selfId];
    els.handBtn.classList.toggle("hand-on", myHand);
    els.handBtn.dataset.tip = myHand ? "Lower my hand" : "I want to talk";
    els.myColorBtn.hidden = !control.bannerChoice;
    if (!control.bannerChoice) els.myColorPop.hidden = true;
    else if (!els.myColorPop.hidden) renderMyColors();
  }

  function applyControl(next) {
    control = next;
    applyBannerColor();
    for (const [peerId, tile] of tiles) {
      if (tile.gain) tile.gain.gain.value = control.volumes[peerId] ?? 1;
      tile.el.classList.toggle("muted", !!control.muted?.[peerId]);
    }
    if (micProducer && selfId) {
      const mine = !!control.muted?.[selfId];
      if (mine !== micMuted) setMicMuted(mine);
      if (control.noise && selfId in control.noise) {
        setNoiseProcessing(!!control.noise[selfId]);
      }
    }
    applyAutoGain(!!control.autoGain);
    els.hpAutoGain.classList.toggle("active", !!control.autoGain);
    if (isHost) {
      // Light up "Mute all" (and offer the way back) once everyone -
      // host included - is muted
      const everyone = [...tiles.keys()];
      const allMuted = everyone.length > 0 && everyone.every((id) => control.muted?.[id]);
      els.hpMuteAllBtn.classList.toggle("active", allMuted);
      // The button is an icon, so the state change is the icon and the
      // name it carries: a struck-through microphone to mute everyone,
      // a plain one to give them back
      els.hpMuteAllBtn.innerHTML = allMuted ? ICONS.mic : ICONS.micOff;
      const muteAllName = allMuted ? "Unmute all" : "Mute all";
      els.hpMuteAllBtn.dataset.tip = muteAllName;
      els.hpMuteAllBtn.setAttribute("aria-label", muteAllName);
      updateRowTip(); // the row dot's mute line follows
    }
    if (control.backdrop) {
      backdropMode = control.backdrop.mode === "wallpaper" ? "wallpaper" : "colour";
      if (control.backdrop.colour) backdropColour = control.backdrop.colour;
      if (control.backdrop.style) backdropStyle = control.backdrop.style;
      if (isHost) renderBackdropUI();
    }
    applyLayout();
    applyTitleBg();
    applyTitleShow();
    if (isHost) renderHostGuests();
    scheduleBannerImages();
  }

  // ---------- Banner snapshots ----------
  // The mixer draws the show onto a canvas, and a canvas cannot lay out
  // HTML - so each lower-third and the logo/title block are redrawn here
  // as images, in the same font and colors as the ones on screen.

  let bannerSnapTimer = null;
  function scheduleBannerImages() {
    if (!isHost || !recording) return;
    clearTimeout(bannerSnapTimer);
    bannerSnapTimer = setTimeout(() => refreshBannerImages().catch(() => {}), 600);
  }

  async function refreshBannerImages(force) {
    if (!isHost || (!force && !recording)) return;
    await document.fonts.ready;
    const images = {};
    for (const [peerId, tile] of tiles) {
      const third = tile.el.querySelector(".lower-third");
      if (!third) continue;
      const cs = getComputedStyle(third);
      const name = third.querySelector(".name")?.textContent || tile.name;
      // Spotlight hides the tagline on the strip tiles, so the banner
      // baked into the video has to drop it there too
      const tagEl = third.querySelector(".tagline");
      const tagline = tagEl && getComputedStyle(tagEl).display !== "none"
        ? tagEl.textContent : "";
      images[peerId] = drawBannerPng(name, tagline, cs.backgroundColor, cs.color);
    }
    const titleEl = document.getElementById("bannerTitle");
    const titleText = titleEl.hidden ? "" : titleEl.textContent.trim();
    const logoEl = document.getElementById("bannerLogo");
    const hasBlock = titleText || (!logoEl.hidden && logoEl.complete && logoEl.naturalWidth > 0);
    const title = hasBlock ? drawTitlePng(titleText) : null;
    // The mixer draws from these, so keep decoded copies here
    for (const [peerId, dataUrl] of Object.entries(images)) {
      const have = bannerImgs.get(peerId);
      if (have?.src === dataUrl) continue;
      const img = new Image();
      img.src = dataUrl;
      bannerImgs.set(peerId, img);
    }
    for (const peerId of [...bannerImgs.keys()]) if (!(peerId in images)) bannerImgs.delete(peerId);
    if (title) {
      if (titleImg?.src !== title) { titleImg = new Image(); titleImg.src = title; }
    } else titleImg = null;
  }

  // The logo/title block for the composite, drawn at a 532px design
  // width. Every measurement here has a matching ratio in session.css
  // (via --title-w), including the four logo positions, and the block
  // is content-height exactly like the DOM one - so the video shows
  // the same block the session did.
  function drawTitlePng(text) {
    const logo = document.getElementById("bannerLogo");
    const hasLogo = !logo.hidden && logo.complete && logo.naturalWidth > 0;
    const layout = ["left", "right", "top", "bottom"].includes(control?.titleLayout)
      ? control.titleLayout : "left";
    const W = 532, r = 16, padX = 16, padY = 14;
    const row = hasLogo && text && (layout === "left" || layout === "right");
    const innerW = W - 2 * padX;

    // Row layouts box the logo at 30% width; column layouts let it
    // span the block - both mirror the CSS ratios exactly
    let logoW = 0, logoH = 0;
    if (hasLogo) {
      const boxW = row ? W * 0.3008 : 500;
      const boxH = row ? W * 0.1203 : 100;
      const fit = Math.min(boxW / logo.naturalWidth, boxH / logo.naturalHeight);
      logoW = logo.naturalWidth * fit;
      logoH = logo.naturalHeight * fit;
    }

    const gap = row ? W * 0.015 : 4;
    const textW = row ? innerW - logoW - gap : innerW;
    const font = hasLogo ? "700 30px Manrope, sans-serif" : "700 40px Manrope, sans-serif";
    const lineH = hasLogo ? Math.round(30 * 1.15) : Math.round(40 * 1.2);
    const meas = document.createElement("canvas").getContext("2d");
    meas.font = font;
    let lines = [];
    if (text && hasLogo) {
      lines = [ellipsize(meas, text, textW)];
    } else if (text) {
      // Text-only: wrap to at most three larger lines, like the DOM's
      // -webkit-line-clamp: 3
      let line = "";
      for (const word of text.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (meas.measureText(next).width > textW && line) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      if (line) lines.push(line);
      if (lines.length > 3) {
        lines = lines.slice(0, 3);
        lines[2] += "…";
      }
      lines = lines.map((l) => ellipsize(meas, l, textW));
    }
    const titleH = lines.length * lineH;

    const H = Math.round(row
      ? Math.max(logoH, titleH) + 2 * padY
      : padY + logoH + (logoH && titleH ? gap : 0) + titleH + padY);
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    const bg = titleBgColor();
    const fg = titleFgFor(bg);
    x.beginPath();
    x.roundRect(0, 0, W, H, r);
    x.fillStyle = bg;
    x.fill();
    x.strokeStyle = fg === "#ffffff" ? "rgba(255, 255, 255, 0.18)" : "rgba(0, 0, 0, 0.22)";
    x.lineWidth = 2;
    x.stroke();
    x.fillStyle = fg;
    x.textBaseline = "middle";

    if (row) {
      // Logo one side, title the other, both vertically centered
      const logoX = layout === "left" ? padX : W - padX - logoW;
      const textStart = layout === "left" ? padX + logoW + gap : padX;
      x.drawImage(logo, logoX, (H - logoH) / 2, logoW, logoH);
      x.font = font;
      x.textAlign = "center";
      x.fillText(lines[0], textStart + textW / 2, H / 2);
    } else {
      // Column: logo above the title, or below it for layout-bottom
      const logoFirst = layout !== "bottom";
      let yPos = padY;
      const drawLogo = () => {
        if (!hasLogo) return;
        x.drawImage(logo, (W - logoW) / 2, yPos, logoW, logoH);
        yPos += logoH + (titleH ? gap : 0);
      };
      const drawText = () => {
        if (!titleH) return;
        x.font = font;
        x.textAlign = "center";
        lines.forEach((l, i) => x.fillText(l, W / 2, yPos + i * lineH + lineH / 2));
        yPos += titleH + (hasLogo && !logoFirst ? gap : 0);
      };
      if (logoFirst) { drawLogo(); drawText(); } else { drawText(); drawLogo(); }
    }
    return c.toDataURL("image/png");
  }

  // ---------- Block position: shared via control, dragged by the host ----------

  // The compositors draw this block at 286/1280 of the frame width (see
  // server/test/layout.js). Sizing it here by the same fraction of the
  // video area is what makes the recording look like the screen: it used
  // to be a viewport-relative CSS width, which drifted up to 38% away
  // from the video on wide screens and further again for the host, whose
  // grid is narrower because of the sidebar.
  const TITLE_WIDTH_FRACTION = 286 / 1280;
  const TITLE_TOP_INSET = 14 / 720; // matches the compositors' 14px of 720

  function positionTitleBlock() {
    const pos = control.titlePos || { x: 0.5, y: 0 };
    const gw = els.grid.clientWidth, gh = els.grid.clientHeight;
    const scale = Math.min(2, Math.max(0.5, Number(control.titleScale) || 1));
    els.banner.style.setProperty("--title-w", `${gw * TITLE_WIDTH_FRACTION * scale}px`);
    // Width has to be applied before the block is measured
    const bw = els.banner.offsetWidth, bh = els.banner.offsetHeight;
    // Same formula the mixer uses, so the video matches the screen
    els.banner.style.left = `${pos.x * (gw - bw)}px`;
    els.banner.style.top = `${pos.y * (gh - bh) + TITLE_TOP_INSET * gh * (1 - pos.y)}px`;
    els.banner.style.transform = "none";
  }

  // Host dropped the logo or the title. Only this browser's drawing of
  // the block PNG needs to know: it re-uploads without the hidden part,
  // and the compositors just overlay whatever they are given.
  function applyTitleShow() {
    const show = control?.titleShow || { logo: true, text: true };
    const logoEl = els.bannerLogo, titleEl = els.bannerTitle;
    if (logoEl) logoEl.hidden = !show.logo || !logoEl.getAttribute("src");
    if (titleEl) titleEl.hidden = !show.text || !titleEl.textContent.trim();
    els.banner.classList.toggle("has-logo", !!logoEl && !logoEl.hidden);
    els.banner.classList.toggle("blank", logoEl.hidden && titleEl.hidden);
    // Where the logo sits relative to the title (left by default);
    // everyone mirrors it, and drawTitlePng() bakes the same geometry
    // into the recording and the stream
    const layout = ["left", "right", "top", "bottom"].includes(control?.titleLayout)
      ? control.titleLayout : "left";
    for (const l of ["left", "right", "top", "bottom"]) {
      els.banner.classList.toggle(`layout-${l}`, l === layout);
    }
    if (isHost) {
      const scale = Math.min(2, Math.max(0.5, Number(control?.titleScale) || 1));
      // A logo the theme never supplied is nothing to toggle or place
      const hasLogoSrc = !!logoEl.getAttribute("src");
      els.tmLogo.textContent = show.logo ? "Hide logo" : "Show logo";
      els.tmText.textContent = show.text ? "Hide title" : "Show title";
      els.tmLogo.disabled = !hasLogoSrc;
      els.tmText.disabled = !titleEl.textContent.trim();
      els.tmSmaller.disabled = scale <= 0.5;
      els.tmBigger.disabled = scale >= 2;
      for (const b of els.titleMenu.querySelectorAll(".tm-layout")) {
        b.classList.toggle("active", b.dataset.layout === layout);
        b.disabled = !hasLogoSrc || !show.logo;
      }
    }
    positionTitleBlock();
    refreshBannerImages().catch(() => {});
  }
  window.addEventListener("resize", () => positionTitleBlock());

  function enableTitleDrag() {
    els.banner.classList.add("host-drag");

    // All the block's controls live in a right-click menu: hover
    // controls kept vanishing before the pointer could reach them
    const setScale = (next) => {
      const s = Math.min(2, Math.max(0.5, Math.round(next * 10) / 10));
      control.titleScale = s; // optimistic; the broadcast confirms it
      applyTitleShow();
      request("hostControl", { action: "titleScale", scale: s }).catch(() => {});
    };
    els.tmBigger.onclick = () => setScale((control.titleScale || 1) + 0.1);
    els.tmSmaller.onclick = () => setScale((control.titleScale || 1) - 0.1);

    const toggleTitlePart = (key) => {
      const show = { logo: true, text: true, ...(control.titleShow || {}) };
      show[key] = !show[key];
      control.titleShow = show;
      applyTitleShow();
      request("hostControl", { action: "titleShow", ...show }).catch(() => {});
      hideTitleMenu();
    };
    els.tmLogo.onclick = () => toggleTitlePart("logo");
    els.tmText.onclick = () => toggleTitlePart("text");

    for (const b of els.titleMenu.querySelectorAll(".tm-layout")) {
      b.onclick = () => {
        control.titleLayout = b.dataset.layout; // optimistic
        applyTitleShow();
        request("hostControl", { action: "titleLayout", layout: b.dataset.layout }).catch(() => {});
        hideTitleMenu();
      };
    }

    function hideTitleMenu() {
      els.titleMenu.hidden = true;
    }
    els.banner.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      applyTitleShow(); // menu labels/ticks reflect the current state
      const gr = els.grid.getBoundingClientRect();
      els.titleMenu.hidden = false;
      // At the pointer, kept inside the video area
      const mw = els.titleMenu.offsetWidth, mh = els.titleMenu.offsetHeight;
      els.titleMenu.style.left = `${Math.min(e.clientX - gr.left, els.grid.clientWidth - mw - 8)}px`;
      els.titleMenu.style.top = `${Math.min(e.clientY - gr.top, els.grid.clientHeight - mh - 8)}px`;
    });
    document.addEventListener("pointerdown", (e) => {
      if (!els.titleMenu.hidden && !els.titleMenu.contains(e.target)) hideTitleMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideTitleMenu();
    });

    let dragging = null;
    els.banner.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return; // right button opens the menu instead
      dragging = { dx: e.clientX - els.banner.offsetLeft, dy: e.clientY - els.banner.offsetTop };
      els.banner.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    els.banner.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const gw = els.grid.clientWidth, gh = els.grid.clientHeight;
      const bw = els.banner.offsetWidth, bh = els.banner.offsetHeight;
      const left = Math.min(Math.max(0, e.clientX - dragging.dx), gw - bw);
      const top = Math.min(Math.max(0, e.clientY - dragging.dy), gh - bh);
      els.banner.style.left = `${left}px`;
      els.banner.style.top = `${top}px`;
      dragging.frac = {
        x: gw - bw > 0 ? left / (gw - bw) : 0.5,
        y: gh - bh > 0 ? top / (gh - bh) : 0
      };
    });
    els.banner.addEventListener("pointerup", (e) => {
      if (dragging?.frac) {
        control.titlePos = dragging.frac; // optimistic; broadcast confirms
        request("hostControl", { action: "titlePos", ...dragging.frac }).catch(() => {});
      }
      dragging = null;
    });
  }

  function ellipsize(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
    return t + "…";
  }

  // Mirrors .lower-third: sizes are the CSS cqw values × S pixels each,
  // so the PNG scaled to 38% of a tile lands exactly like the DOM one
  function drawBannerPng(name, tagline, bg, fg) {
    // Mirrors the .lower-third CSS: S px per cqw, tile = 100cqw = 100*S px
    const S = 20;
    const padX = 1.5 * S, padT = 0.7 * S, padB = 0.8 * S, r = 1 * S;
    const nameFont = `700 ${3.86 * S}px Manrope, sans-serif`;
    const tagFont = `400 ${2.44 * S}px Manrope, sans-serif`;
    const nameLh = 3.86 * S * 1.3, tagLh = 2.44 * S * 1.3;
    const H = Math.round(padT + nameLh + (tagline ? tagLh : 0) + padB);
    const c = document.createElement("canvas");
    // Hug the text like the CSS fit-content banner, capped at 92cqw
    const x = c.getContext("2d");
    x.font = nameFont;
    let textW = x.measureText(name).width;
    if (tagline) {
      x.font = tagFont;
      textW = Math.max(textW, x.measureText(tagline).width);
    }
    // ceil, not round: half a pixel under the measured width made the
    // ellipsizer fire on names that actually fit ("charl…")
    const W = Math.ceil(Math.min(92 * S, textW + 2 * padX));
    c.width = W; c.height = H; // resizing resets the context state
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(W - r, 0);
    x.arcTo(W, 0, W, r, r);
    x.lineTo(W, H);
    x.lineTo(0, H);
    x.closePath();
    x.fillStyle = bg;
    x.fill();
    x.fillStyle = fg;
    x.textBaseline = "middle";
    x.font = nameFont;
    x.fillText(ellipsize(x, name, W - 2 * padX), padX, padT + nameLh / 2);
    if (tagline) {
      x.globalAlpha = 0.82;
      x.font = tagFont;
      x.fillText(ellipsize(x, tagline, W - 2 * padX), padX, padT + nameLh + tagLh / 2);
      x.globalAlpha = 1;
    }
    return c.toDataURL("image/png");
  }

  // ---------- Host panel ----------

  function renderHostGuests() {
    els.hpGuests.innerHTML = "";
    // Self first, then everyone else
    const order = [...tiles.keys()].sort((a, b) => (a === selfId ? -1 : b === selfId ? 1 : 0));
    for (const peerId of order) {
      const tile = tiles.get(peerId);
      const isSelf = peerId === selfId;
      const row = document.createElement("div");
      row.className = "hp-guest";
      const vol = Math.round((control.volumes[peerId] ?? 1) * 100);
      const muted = !!control.muted?.[peerId];
      const nrOn = !!control.noise?.[peerId];
      const hand = !!control.hands?.[peerId];
      row.dataset.peerId = peerId;
      row.classList.toggle("hand", hand);
      row.innerHTML = `
        <div class="hp-top">
          <div class="hp-name-line"></div>
          <input type="range" min="0" max="150" value="${vol}" aria-label="Volume">
          <span class="hp-vol">${vol}%</span>
        </div>
        <div class="hp-btns">
          <button class="hp-btn hp-guest-ico nr${nrOn ? " active" : ""}" data-tip="Noise reduction" aria-label="Noise reduction" aria-pressed="${nrOn}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12h2"/><path d="M7 9v6"/><path d="M11 5v14"/><path d="M15 8v8"/><path d="M19 12h2"/></svg></button>
          <button class="hp-btn hp-guest-ico mute" data-tip="Microphone" aria-label="Microphone" aria-pressed="${muted}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg></button>
          <button class="hp-btn hp-guest-ico spot" data-tip="Spotlight" aria-label="Spotlight"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.5 5.3 5.5.7-4 4 1 5.7-5-2.8-5 2.8 1-5.7-4-4 5.5-.7z"/></svg></button>
          ${hand ? '<button class="hp-btn hp-guest-ico lower" data-tip="Lower their hand" aria-label="Lower their hand"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11V6a2 2 0 1 1 4 0v4V4.5a2 2 0 1 1 4 0V10v-3a2 2 0 1 1 4 0v7a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.5L3 13.5a2 2 0 0 1 3.4-2z"/><path d="M3 3l18 18"/></svg></button>' : ""}
          ${!isSelf && !tile.isHostPeer ? '<button class="hp-btn hp-guest-ico blockp" data-tip="Block - removes them and bars them from every session; undo any time from the dashboard" aria-label="Block this guest"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg></button>' : ""}
          <div class="hp-meter"><div class="hp-meter-fill"></div></div>
        </div>`;
      const nameLine = row.querySelector(".hp-name-line");
      const nameSpan = document.createElement("span");
      nameSpan.textContent = tile.name;
      nameLine.appendChild(nameSpan);
      if (isSelf) {
        const you = document.createElement("span");
        you.className = "you-ico";
        you.dataset.tip = "This is you";
        you.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';
        nameLine.appendChild(you);
      }
      if (hand) {
        row.querySelector(".lower").onclick = () =>
          request("hostControl", { action: "lowerHand", peerId });
      }
      row.querySelector(".nr").onclick = () => {
        request("hostControl", { action: "noise", peerId, enabled: !nrOn });
      };
      const blockBtn = row.querySelector(".blockp");
      if (blockBtn) {
        // Two clicks, never one: the first arms the button (it turns
        // red and asks), the second blocks. It disarms itself.
        blockBtn.onclick = () => {
          if (!blockBtn.classList.contains("armed")) {
            blockBtn.classList.add("armed");
            blockBtn.dataset.tip = "Sure? A second click blocks them";
            setTimeout(() => {
              blockBtn.classList.remove("armed");
              blockBtn.dataset.tip = "Block - removes them and bars them from every session; undo any time from the dashboard";
            }, 3500);
            return;
          }
          request("hostControl", { action: "block", peerId }).catch(() => {});
        };
      }
      const muteBtn = row.querySelector(".mute");
      muteBtn.classList.toggle("active", muted);
      muteBtn.onclick = () => {
        request("hostControl", { action: "mute", peerId, muted: !muted });
      };
      const spotBtn = row.querySelector(".spot");
      spotBtn.classList.toggle(
        "active",
        control.layout === "spotlight" && control.spotlightPeerId === peerId
      );
      spotBtn.onclick = () => {
        const active = control.layout === "spotlight" && control.spotlightPeerId === peerId;
        request("hostControl", active
          ? { action: "layout", layout: "grid" }
          : { action: "layout", layout: "spotlight", peerId });
      };
      const slider = row.querySelector("input");
      const volLabel = row.querySelector(".hp-vol");
      let sendTimer = null;
      slider.oninput = () => {
        volLabel.textContent = `${slider.value}%`;
        clearTimeout(sendTimer);
        sendTimer = setTimeout(() => {
          request("hostControl", {
            action: "volume", peerId, volume: slider.value / 100
          });
        }, 120);
      };
      els.hpGuests.appendChild(row);
    }
  }

  // ---------- Recording (browser mode records self and uploads) ----------

  let recorders = [];
  let recUpload = null;
  let recording = false;
  // The elapsed timer on the host's record button. The start time comes
  // from the server where possible, so a host who reloads mid-take still
  // sees the true elapsed time.
  let recStartAt = null;
  const fmtElapsed = (ms) => {
    const t = Math.max(0, Math.floor(ms / 1000));
    const p = (n) => String(n).padStart(2, "0");
    const h = Math.floor(t / 3600);
    return `${h ? `${h}:` : ""}${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`;
  };
  setInterval(() => {
    if (!isHost) return;
    if (recording && recStartAt) {
      els.hpRecordBtn.textContent = `■ ${fmtElapsed(Date.now() - recStartAt)}`;
    }
  }, 1000);

  function setRecIndicator(on) {
    recording = on;
    recStartAt = on ? (recStartAt || Date.now()) : null;
    const light = document.getElementById("recLight");
    light.classList.toggle("on", on);
    document.body.classList.toggle("rec-dim", on);
    light.dataset.tip = on
      ? "Recording light - this session is being recorded"
      : "Recording light - lights up red when recording";
    if (isHost) {
      // Fixed-width labels: the button must never grow and shove its
      // neighbors around when the timer appears
      els.hpRecordBtn.textContent = on
        ? `■ ${fmtElapsed(Date.now() - recStartAt)}`
        : "● Record";
      // The info dot beside the button carries the wording; the
      // button itself stays tooltip-free
      $("hpRecordInfo").dataset.tip = on
        ? "Stop the recording. The files appear in the dashboard, ready to download."
        : "Records the show: everyone's own track, plus one video of the whole thing as it looks on screen.";
      els.hpRecordBtn.classList.toggle("rec-on", on);
      if (on) scheduleBannerImages();
    }
  }

  // The row's info dot describes both controls; the mute line follows
  // the current state.
  function updateRowTip() {
    const allMuted = els.hpMuteAllBtn.classList.contains("active");
    $("hpRowInfo").dataset.tip = [
      "Auto level: evens out quiet and loud voices for everyone.",
      allMuted ? "Unmute all: unmutes everyone at once." : "Mute all: mutes everyone at once, including you.",
      "Subscribe reminder: plays the subscribe-and-bell reminder over the show.",
      "Ad banner: shows your advertising banner for about 18 seconds."
    ].join("\n");
  }

  // Padding the holes keeps the file honest, but the words said into
  // them are still gone, and nobody found that out for a week. So count
  // what the microphone fails to deliver while the take is running and
  // tell the host as it happens.
  //
  // The counting reads frames from a clone of the device's own track -
  // the raw one, before noise suppression, because that is the thing
  // that stalls - and closes each frame as soon as its length has been
  // added up. Nothing is decoded and no samples are copied. The clone
  // means the recording's own copy of the track is left alone.
  //
  // Only Chrome and Edge can read a track this way. Elsewhere the
  // padding still works and no figure is claimed, which is better than
  // guessing one.
  // peerId -> {name, lostMs}, for the line in the host's panel
  const micTrouble = new Map();
  function renderMicTrouble() {
    const lines = [...micTrouble.values()]
      .filter((p) => p.lostMs >= 1000)
      .map((p) => {
        const secs = Math.round(p.lostMs / 1000);
        return `${p.name}'s computer is not keeping up - about ` +
          `${secs} ${secs === 1 ? "second" : "seconds"} of their audio lost so far.`;
      });
    els.hpMicTrouble.textContent = lines.join(" ");
    els.hpMicTrouble.hidden = lines.length === 0;
  }

  // The padding only keeps time while the audio context is running, and
  // a suspended context is the one way it was possible to make it lose
  // audio anyway (six seconds suspended, six seconds gone). Nothing in
  // here suspends one, but a browser may - so wake it straight back up,
  // and count what it cost while it was asleep.
  let ctxWatchTimer = null;
  function keepGraphAwake(watch) {
    const ctx = ensureAudioCtx();
    let asleepAt = 0;
    ctxWatchTimer = setInterval(() => {
      if (ctx.state === "running") {
        if (asleepAt) {
          watch.lostMs += performance.now() - asleepAt;
          asleepAt = 0;
          reportMicLoss(watch);
        }
        return;
      }
      if (!asleepAt) asleepAt = performance.now();
      ctx.resume().catch(() => {});
    }, 500);
  }

  let micWatch = null;
  function watchMicDelivery() {
    const startedAt = performance.now();
    const watch = { reader: null, clone: null, lostMs: 0, toldMs: 0, end: null };
    micWatch = watch;
    keepGraphAwake(watch);

    const raw = previewStream?.getAudioTracks?.()[0];
    if (!raw || typeof MediaStreamTrackProcessor !== "function") return;
    let clone;
    try { clone = raw.clone(); } catch { return; }
    watch.clone = clone;
    const reader = new MediaStreamTrackProcessor({ track: clone }).readable.getReader();
    watch.reader = reader;

    (async () => {
      for (;;) {
        let frame;
        try {
          const { value, done } = await reader.read();
          if (done) return;
          frame = value;
        } catch { return; }
        const at = frame.timestamp / 1000;                    // ms
        const len = (frame.numberOfFrames / frame.sampleRate) * 1000;
        frame.close();
        if (watch.end !== null && at - watch.end > 60) {
          // A stall wide enough that it is the device, not ordinary
          // jitter between one buffer and the next
          watch.lostMs += at - watch.end;
          reportMicLoss(watch);
        }
        watch.end = at + len;
        if (micWatch !== watch) return;
      }
    })();

    // The wall clock catches the other shape of this fault: a device
    // that stops for good, where no later frame ever arrives to measure
    // the hole against.
    watch.timer = setInterval(() => {
      if (watch.end === null) return;
      const behind = (performance.now() - startedAt) - watch.end - 1000;
      if (behind > watch.lostMs) { watch.lostMs = behind; reportMicLoss(watch); }
    }, 5000);
  }

  // A second of loss over a whole take is a shrug; past that the host
  // wants to know. Tell them each further second, not each frame.
  function reportMicLoss(watch, final) {
    if (watch.lostMs < 1000) return null;
    if (!final && watch.lostMs - watch.toldMs < 1000) return null;
    watch.toldMs = watch.lostMs;
    return request("micTrouble", { lostMs: Math.round(watch.lostMs) }).catch(() => {});
  }

  // Called before the recorders stop, so the last part-second of loss
  // reaches the server while the take is still open and the figure the
  // dashboard shows is the whole of it.
  async function stopWatchingMic() {
    if (!micWatch) return;
    const watch = micWatch;
    micWatch = null;
    clearInterval(watch.timer);
    clearInterval(ctxWatchTimer);
    ctxWatchTimer = null;
    await reportMicLoss(watch, true);
    watch.reader?.cancel().catch(() => {});
    watch.clone?.stop();
  }

  function startSelfRecording(upload) {
    recUpload = upload;
    // Where this stretch of recording begins. The server stamps it the
    // instant the first recorder here reports it is running, and pads
    // the front of the track with that much silence, so a late joiner's
    // file still starts at zero alongside everybody else's.
    let toldServer = false;
    const sayStarted = () => {
      if (toldServer) return;
      toldServer = true;
      request("recStarted", {}).catch(() => {});
    };
    const base = `/api/rec/chunk?rec=${encodeURIComponent(upload.recId)}&peer=${encodeURIComponent(upload.peerId)}&token=${encodeURIComponent(upload.token)}`;
    recorders = [];

    // The container the browser chose, so the server files it under the
    // right extension instead of assuming
    const extOf = (mime) => (mime.startsWith("video/mp4") || mime.startsWith("audio/mp4") ? "mp4" : "webm");

    const startOne = (track, kind, mime, bitrate) => {
      if (!track) return;
      let type = mime.find((m) => MediaRecorder.isTypeSupported(m));
      if (!type) return;
      const recorder = new MediaRecorder(new MediaStream([track]), {
        mimeType: type,
        ...(bitrate ? { videoBitsPerSecond: bitrate } : {})
      });
      let seq = 0;
      let queue = Promise.resolve();
      recorder.ondataavailable = (e) => {
        if (!e.data.size) return;
        const n = seq++;
        // Chunks must land in order - chain the uploads
        queue = queue.then(() =>
          fetch(`${base}&kind=${kind}&ext=${extOf(type)}&seq=${n}`, { method: "POST", body: e.data })
        ).catch(() => {});
      };
      recorder.onstart = sayStarted;
      recorder.start(5000);
      recorders.push({ recorder, getQueue: () => queue, kind });
    };

    // The host's browser draws and encodes the finished program itself,
    // so the combined file needs no render on the server at all
    if (isHost) {
      const m = ensureMixer();
      const stream = m.start();
      const ctx = ensureAudioCtx();
      for (const tile of tiles.values()) if (tile.gain) tile.gain.connect(m.audioDest);
      if (micProducer?.track && !micBus) {
        micBus = ctx.createGain();
        micBus.gain.value = micProducer.paused ? 0 : 1;
        ctx.createMediaStreamSource(new MediaStream([micProducer.track])).connect(micBus).connect(m.audioDest);
      }
      // H.264 first because it plays in more editors, then VP8, then
      // whatever the browser offers - one of these always works, so the
      // show always comes back as a single finished file
      const mimes = ["video/webm;codecs=h264,opus", "video/mp4;codecs=avc1,mp4a.40.2",
        "video/webm;codecs=avc1,opus", "video/webm;codecs=vp8,opus", "video/webm"];
      const type = mimes.find((t) => MediaRecorder.isTypeSupported(t));
      if (type) {
        const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 3_000_000 });
        let seq = 0;
        let queue = Promise.resolve();
        recorder.ondataavailable = (e) => {
          if (!e.data.size) return;
          const n = seq++;
          queue = queue.then(() =>
            fetch(`${base}&kind=programme&ext=${extOf(type)}&seq=${n}`, { method: "POST", body: e.data })
          ).catch(() => {});
        };
        recorder.start(5000);
        recorders.push({ recorder, getQueue: () => queue, kind: "programme" });
      } else {
        console.warn("this browser records no video at all; only the per-person tracks will arrive");
      }
    }

    // What goes in the file is the studio's choice, made in Settings
    // and pinned for this take. Best quality is every sample the
    // microphone heard; smaller files is Opus. Firefox cannot record
    // uncompressed at all, so a guest on it falls through to Opus and
    // the dashboard says which track that was.
    //
    // The microphone goes through steadyTrack so a stalled device leaves
    // silence in the file rather than shortening it, and through
    // watchMicDelivery so the host is told when that happens.
    const audioTypes = upload.quality === "smaller"
      ? ["audio/webm;codecs=opus", "audio/webm"]
      : ["audio/webm;codecs=pcm", "audio/webm;codecs=opus", "audio/webm"];
    startOne(micProducer?.track && steadyTrack(micProducer.track), "audio", audioTypes);
    watchMicDelivery();
    startOne(camProducer?.track, "video",
      ["video/webm;codecs=vp8", "video/webm"], 2_500_000);
    setRecIndicator(true);
  }

  async function stopSelfRecording() {
    // The final count goes first: the server files the note when every
    // peer has said it is done, so this has to land before that.
    await stopWatchingMic();
    const done = recorders.map(({ recorder, getQueue }) =>
      new Promise((resolve) => {
        recorder.onstop = () => resolve(getQueue());
        try { recorder.stop(); } catch { resolve(); }
      }).then(() => getQueue())
    );
    recorders = [];
    await Promise.all(done);
    mixer?.stop();
    releaseSteadyTracks();
    // The take is over; what it lost now belongs to the dashboard
    micTrouble.clear();
    renderMicTrouble();
    micBus = null;
    if (recUpload) {
      const { recId, peerId, token } = recUpload;
      await fetch(`/api/rec/done?rec=${encodeURIComponent(recId)}&peer=${encodeURIComponent(peerId)}&token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
      recUpload = null;
    }
    setRecIndicator(false);
  }

  // ---------- In-session overlay playback (subscribe / ad) ----------

  function playDomOverlay({ kind, duration, url }) {
    document.querySelectorAll(".show-overlay").forEach((el) => el.remove());
    const el = document.createElement("div");
    el.className = `show-overlay ${kind}`;
    if (kind === "subscribe") {
      el.innerHTML = `
        <div class="lo-btn">SUBSCRIBE</div>
        <div class="lo-bell"><svg viewBox="0 0 24 24" fill="none" stroke="#5f4c06" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg></div>
        <div class="lo-msg">
          <div class="lo-t">Enjoying the show?</div>
          <div class="lo-s">Subscribe and turn on</div>
          <div class="lo-s"><b>ALL NOTIFICATIONS</b></div>
        </div>`;
    } else {
      const img = document.createElement("img");
      img.src = url;
      img.alt = "Sponsor banner";
      el.appendChild(img);
    }
    els.grid.appendChild(el);
    requestAnimationFrame(() => el.classList.add("in"));
    setTimeout(() => el.classList.remove("in"), (duration - 0.6) * 1000);
    setTimeout(() => el.remove(), duration * 1000);
  }

  // Panel sound meters: read each analyser ~8x a second
  const meterBuf = new Uint8Array(128);
  setInterval(() => {
    if (!isHost || els.hostPanel.hidden) return;
    for (const [peerId, tile] of tiles) {
      if (!tile.analyser) continue;
      tile.analyser.getByteTimeDomainData(meterBuf);
      let peak = 0;
      for (const v of meterBuf) peak = Math.max(peak, Math.abs(v - 128));
      const fill = els.hpGuests.querySelector(`[data-peer-id="${peerId}"] .hp-meter-fill`);
      if (fill) fill.style.width = `${Math.min(100, (peak / 128) * 260)}%`;
    }
  }, 120);

  els.handBtn.onclick = () => {
    const raised = !els.handBtn.classList.contains("hand-on");
    request("raiseHand", { raised }).catch(() => {});
  };

  els.dimBtn.onclick = () => {
    const on = document.body.classList.toggle("dim-ui");
    els.dimBtn.classList.toggle("dim-on", on);
    els.dimBtn.dataset.tip = on ? "Brighten the controls" : "Dim the controls";
  };
  // Never a browser popup. A refusal here means something changed under
  // the host mid-show - the banner deleted from another tab - so the
  // button goes gray and says so, the same as it would have on join.
  els.hpSubBtn.onclick = () => {
    if (refused(els.hpSubBtn)) return;
    request("hostControl", { action: "overlay", kind: "subscribe" })
      .catch((e) => unavailable(els.hpSubBtn, e.message));
  };
  els.hpAdBtn.onclick = () => {
    if (refused(els.hpAdBtn)) return;
    request("hostControl", { action: "overlay", kind: "ad" })
      .catch((e) => unavailable(els.hpAdBtn, e.message));
  };
  els.hpMuteAllBtn.onclick = () =>
    request("hostControl", {
      action: "muteAll",
      muted: !els.hpMuteAllBtn.classList.contains("active")
    })
      .catch((e) => console.error("mute all failed:", e.message));
  els.hpAutoGain.onclick = () =>
    request("hostControl", {
      action: "autoGain",
      enabled: !els.hpAutoGain.classList.contains("active")
    });
  els.hpRecordBtn.onclick = () =>
    request("hostControl", { action: "record", start: !recording })
      .catch((e) => console.error("record toggle failed:", e.message));

  // ---------- The program: the mixer the recording is drawn from ----------
  function ensureMixer() {
    if (mixer) return mixer;
    mixer = FSMixer.create({
      grid: els.grid, tiles,
      control: () => control,
      audioContext: ensureAudioCtx,
      bannerImage: (peerId) => bannerImgs.get(peerId) || null,
      titleImage: () => titleImg,
      tickWorkerUrl: "/assets/tick-worker.js"
    });
    return mixer;
  }

  // ---------- Consuming ----------

  async function consumeProducer(peerId, producerId, source) {
    const { consumerId, kind, rtpParameters } = await request("consume", {
      transportId: recvTransport.id,
      producerId,
      rtpCapabilities: device.rtpCapabilities
    });
    const consumer = await recvTransport.consume({
      id: consumerId, producerId, kind, rtpParameters
    });
    consumers.set(consumerId, { consumer, peerId });
    if (kind === "audio") {
      attachAudio(peerId, consumer.track);
    } else {
      const tile = tiles.get(peerId);
      if (tile) tile.stream.addTrack(consumer.track);
    }
    await request("resumeConsumer", { consumerId });
  }

  function dropConsumer(consumerId) {
    const c = consumers.get(consumerId);
    if (!c) return;
    const tile = tiles.get(c.peerId);
    if (tile) tile.stream.removeTrack(c.consumer.track);
    c.consumer.close();
    consumers.delete(consumerId);
  }

  // ---------- Join / leave ----------

  const JOINING_KEY = "fossstudio-joining";

  // A random id this browser keeps and presents on every join. Sent
  // with the IP so a session block still holds when the address
  // changes; a private window has neither and falls back to IP alone.
  function deviceMarker() {
    try {
      let m = localStorage.getItem("fossstudio-device");
      if (!m || !/^[a-zA-Z0-9-]{8,64}$/.test(m)) {
        m = crypto.randomUUID();
        localStorage.setItem("fossstudio-device", m);
      }
      return m;
    } catch { return null; }
  }

  // Who this browser is, for this session. Kept per room so two rooms
  // never share an identity, and kept in this browser so somebody who
  // drops out and comes back continues the track they were already
  // recording rather than starting a second one.
  //
  // It is deliberately not derived from the session link. Links get
  // passed around, and two people who join on the same link have to stay
  // two people. A different browser, or one whose site data was cleared,
  // is honestly somebody new and the dashboard says so.
  function personMarker() {
    const key = `fossstudio-person-${roomId}`;
    try {
      let m = localStorage.getItem(key);
      if (!m || !/^[a-zA-Z0-9-]{8,64}$/.test(m)) {
        m = crypto.randomUUID();
        localStorage.setItem(key, m);
      }
      return m;
    } catch { return null; }
  }

  async function join() {
    if (!els.nameInput.value.trim()) {
      showError("Add a banner title first - that's the big text under your video.");
      els.nameInput.focus();
      return;
    }
    els.joinBtn.disabled = true;
    els.joinBtn.textContent = "Joining…";
    try { localStorage.setItem(JOINING_KEY, noisePref); } catch { /* ignore */ }
    try {
      await connectWs();
      selfName = els.nameInput.value.trim() || "Guest";
      const info = await request("join", {
        name: selfName,
        tagline: els.taglineInput.value.trim(),
        noiseOn: noisePref === "rnnoise",
        role: wantHost ? "host" : "guest",
        marker: deviceMarker(),
        person: personMarker()
      });
      selfId = info.peerId;
      isHost = info.role === "host";
      applyControl(info.control);
      applyTheme(info.theme);
      els.hostPanel.hidden = !isHost; // sidebar is always open for the host
      els.dimBtn.hidden = !isHost;    // dimming is a host tool
      document.body.classList.toggle("is-guest", !isHost);
      if (isHost) enableTitleDrag();

      device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities: info.routerRtpCapabilities });

      const makeTransport = async (direction) => {
        const params = await request("createTransport", { direction });
        const opts = { ...params, iceServers: info.iceServers };
        const transport = direction === "send"
          ? device.createSendTransport(opts)
          : device.createRecvTransport(opts);
        transport.on("connect", ({ dtlsParameters }, cb, eb) => {
          request("connectTransport", { transportId: transport.id, dtlsParameters })
            .then(cb).catch(eb);
        });
        watchTransport(transport);
        if (direction === "send") {
          transport.on("produce", ({ kind, rtpParameters, appData }, cb, eb) => {
            request("produce", {
              transportId: transport.id, kind, rtpParameters, source: appData.source
            }).then(({ producerId }) => cb({ id: producerId })).catch(eb);
          });
        }
        return transport;
      };

      sendTransport = await makeTransport("send");
      recvTransport = await makeTransport("recv");

      savePrefs();
      const audioTrack = previewStream.getAudioTracks()[0];
      const videoTrack = outgoingVideoTrack();
      let sendAudio = audioTrack;
      appliedNoise = false;
      if (noisePref === "rnnoise") {
        try {
          sendAudio = await noiseProcessedTrack(audioTrack);
          appliedNoise = true;
        } catch (err) {
          console.error("noise suppression unavailable:", err.message);
        }
      }
      window.__noiseApplied = appliedNoise;
      micProducer = await sendTransport.produce({ track: sendAudio, appData: { source: "mic" } });
      // Guests join muted (server marks it in control): sync the local
      // producer and the mic button straight away
      if (control.muted?.[selfId]) setMicMuted(true);
      camProducer = await sendTransport.produce({
        track: videoTrack,
        encodings: [{ maxBitrate: 1_200_000 }],
        appData: { source: "camera" }
      });

      // Everyone already here joined before us, so their tiles come
      // first and our own goes after them - the same join order the
      // compositors use, so every screen agrees with the output (a
      // self-first grid looked right to its owner and nobody else)
      for (const p of info.peers) {
        makeTile(p.id, p.name, false, p.tagline, p.role === "host");
      }
      const selfTile = makeTile(selfId, selfName, true, els.taglineInput.value.trim(), isHost);
      selfTile.stream.addTrack(videoTrack);
      if (isHost) {
        const ctx = ensureAudioCtx();
        const selfAn = ctx.createAnalyser();
        selfAn.fftSize = 256;
        ctx.createMediaStreamSource(new MediaStream([sendAudio])).connect(selfAn);
        selfTile.analyser = selfAn;
      }
      applyMirror();
      for (const p of info.peers) {
        for (const prod of p.producers) await consumeProducer(p.id, prod.id, prod.source);
      }

      eventHandlers.peerJoined = (p) => makeTile(p.id, p.name, false, p.tagline, p.role === "host");
      eventHandlers.peerLeft = ({ peerId }) => removeTile(peerId);
      eventHandlers.newProducer = ({ peerId, producerId, source }) =>
        consumeProducer(peerId, producerId, source).catch(console.error);
      eventHandlers.producerClosed = ({ producerId }) => {
        for (const [cid, c] of consumers) {
          if (c.consumer.producerId === producerId) dropConsumer(cid);
        }
      };
      eventHandlers.consumerClosed = ({ consumerId }) => dropConsumer(consumerId);
      eventHandlers.control = (c) => applyControl(c);
      eventHandlers.theme = (t) => {
        // The host switched the backdrop: color and/or image
        if (t.bg) els.grid.style.backgroundColor = t.bg;
        if (t.wallpaper) {
          els.grid.style.backgroundImage = `url(${t.wallpaper})`;
          els.session.classList.add("wallpapered");
        } else {
          els.grid.style.backgroundImage = "";
          els.session.classList.remove("wallpapered");
        }
      };
      eventHandlers.recordingStarted = ({ upload }) => {
        if (upload) startSelfRecording(upload);
        else setRecIndicator(true);
      };
      eventHandlers.recordingStopped = () => {
        recorders.length ? stopSelfRecording() : setRecIndicator(false);
      };
      // Somebody's microphone is losing audio. Say so now, by name, in
      // the host's own panel: the padding keeps the file usable but the
      // words spoken into a stall are gone either way, and a host who
      // hears about it during the take can still ask them to close
      // whatever is eating their machine.
      eventHandlers.micTrouble = ({ peerId, name, lostMs }) => {
        if (!isHost) return;
        micTrouble.set(peerId, { name, lostMs });
        renderMicTrouble();
      };
      eventHandlers.overlay = playDomOverlay;
      // The server's start time pre-seeds the button timer, so a host who
      // reloads mid-take sees true elapsed, not zero - and a stale
      // local value never leaks into a new take
      recStartAt = info.recordingSince || null;
      // Replay anything that arrived while we were wiring up - a
      // recordingStarted for a mid-recording join must not be lost
      drainEarlyEvents();

      joined = true;
      try { localStorage.removeItem(JOINING_KEY); } catch { /* ignore */ }
      els.preview.hidden = true;
      els.session.hidden = false;
      if (audioCtx?.state === "suspended") audioCtx.resume();
      applyLayout();
    } catch (err) {
      console.error("join failed:", err);
      try { localStorage.removeItem(JOINING_KEY); } catch { /* ignore */ }
      els.joinBtn.disabled = false;
      els.joinBtn.textContent = "Join session";
      showError(
        err.message === "session full"
          ? "This session is full (10 people max)."
          : err.message?.startsWith("You have been blocked")
            ? err.message
            : "Couldn't join the session. Give it a moment and try again."
      );
      try { ws && ws.close(); } catch { /* ignore */ }
    }
  }

  // The OBS clean feed: join invisibly as a receive-only viewer, render
  // the same grid/banners/overlays a guest sees, and hide every control.
  // OBS's browser source autoplays with audio, so no click is needed.
  async function joinOutput() {
    document.body.classList.add("output-mode");
    els.preview.hidden = true;
    try {
      await connectWs();
      const info = await request("join", { name: "Clean feed", role: "viewer" });
      selfId = info.peerId;
      applyControl(info.control);
      applyTheme(info.theme);
      device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities: info.routerRtpCapabilities });
      const params = await request("createTransport", { direction: "recv" });
      recvTransport = device.createRecvTransport({ ...params, iceServers: info.iceServers });
      recvTransport.on("connect", ({ dtlsParameters }, cb, eb) => {
        request("connectTransport", { transportId: recvTransport.id, dtlsParameters })
          .then(cb).catch(eb);
      });
      for (const p of info.peers) {
        makeTile(p.id, p.name, false, p.tagline, p.role === "host");
        for (const prod of p.producers) await consumeProducer(p.id, prod.id, prod.source);
      }
      eventHandlers.peerJoined = (p) => makeTile(p.id, p.name, false, p.tagline, p.role === "host");
      eventHandlers.peerLeft = ({ peerId }) => removeTile(peerId);
      eventHandlers.newProducer = ({ peerId, producerId, source }) =>
        consumeProducer(peerId, producerId, source).catch(console.error);
      eventHandlers.producerClosed = ({ producerId }) => {
        for (const [cid, c] of consumers) {
          if (c.consumer.producerId === producerId) dropConsumer(cid);
        }
      };
      eventHandlers.consumerClosed = ({ consumerId }) => dropConsumer(consumerId);
      eventHandlers.control = (c) => applyControl(c);
      eventHandlers.theme = (t) => {
        // The host switched the backdrop: color and/or image
        if (t.bg) els.grid.style.backgroundColor = t.bg;
        if (t.wallpaper) {
          els.grid.style.backgroundImage = `url(${t.wallpaper})`;
          els.session.classList.add("wallpapered");
        } else {
          els.grid.style.backgroundImage = "";
          els.session.classList.remove("wallpapered");
        }
      };
      eventHandlers.overlay = playDomOverlay;
      drainEarlyEvents();
      joined = true;
      els.session.hidden = false;
      applyLayout();
      // A normal browser tab (unlike OBS) blocks audio until a click
      const kick = () => { if (audioCtx?.state === "suspended") audioCtx.resume(); };
      kick();
      document.addEventListener("click", kick);
    } catch (err) {
      console.error("clean feed join failed:", err.message);
      try { ws && ws.close(); } catch { /* ignore */ }
      setTimeout(joinOutput, 3000);
    }
  }

  // quiet: tear down and go back to the join screen without waking the
  // camera again. steppedAside uses it - starting a preview only to stop
  // it a moment later races getUserMedia and can leave a stream running
  // in a window that is not in the room.
  function leaveToPreview(message, quiet) {
    joined = false;
    earlyEvents.length = 0; // never replay a dead connection's events
    if (recorders.length) stopSelfRecording();
    try { ws && ws.close(); } catch { /* ignore */ }
    for (const { consumer } of consumers.values()) consumer.close();
    consumers.clear();
    tiles.forEach((t) => t.el.remove());
    tiles.clear();
    sendTransport?.close(); recvTransport?.close();
    if (outputEl) { outputEl.pause(); outputEl.srcObject = null; outputEl = null; }
    masterDest = null;
    els.session.hidden = true;
    els.hostPanel.hidden = true;
    // The clean feed runs unattended inside OBS: reconnect, never show
    // the join screen
    if (outputMode) {
      setTimeout(joinOutput, 3000);
      return;
    }
    document.body.classList.remove("dim-ui");
    els.dimBtn.classList.remove("dim-on");
    els.preview.hidden = false;
    els.joinBtn.disabled = false;
    els.joinBtn.textContent = "Join session";
    if (message) showError(message);
    if (!quiet) initPreview();
  }

  // Out of the room because a newer window took the seat: everything
  // torn down as for any other exit, then the goodbye card with words
  // that say what actually happened. The camera and microphone go off
  // with it - a window that is not in the room has no business holding
  // them, and two live cameras of one person is the noise we just
  // removed.
  function steppedAside([title, text]) {
    leaveToPreview(null, true);
    stopPreview();
    els.byeTitle.textContent = title;
    els.byeText.textContent = text;
    els.previewCard.hidden = true;
    els.previewBye.hidden = false;
  }

  // ---------- Controls ----------

  els.joinBtn.onclick = join;

  let micMuted = false;
  function setMicMuted(muted, { send = false } = {}) {
    if (!micProducer) return;
    // Muted means SILENCE, not silence-of-packets: a paused producer
    // sends nothing at all, which stalls the live-stream audio mixer.
    // Disabling the track keeps RTP flowing but carries pure silence.
    micMuted = muted;
    micProducer.track.enabled = !muted;
    els.muteBtn.classList.toggle("off", muted);
    els.muteBtn.innerHTML = muted ? ICONS.micOff : ICONS.mic;
    els.muteBtn.dataset.tip = muted ? "Unmute microphone" : "Mute microphone";
    if (send) request("selfMute", { muted }).catch(() => {});
  }

  els.muteBtn.onclick = () => {
    if (!micProducer) return;
    setMicMuted(!micMuted, { send: true });
  };

  els.camBtn.onclick = () => {
    if (!camProducer) return;
    const stopping = !camProducer.paused;
    stopping ? camProducer.pause() : camProducer.resume();
    camProducer.track.enabled = !stopping;
    els.camBtn.classList.toggle("off", stopping);
    els.camBtn.innerHTML = stopping ? ICONS.camOff : ICONS.cam;
    els.camBtn.dataset.tip = stopping ? "Turn camera on" : "Turn camera off";
  };

  els.leaveBtn.onclick = () => {
    stopPreview();
    leaveToPreview();
  };

  // The tips switch. window.tips (js/tip.js) holds the state and the
  // storage, so the dashboard in another tab follows without either
  // page knowing about the other; all this does is draw the button and
  // keep it honest about which way it is set. The aria-label changes
  // with the state and is never removed - a screen reader keeps every
  // control's name whether or not anybody wants bubbles.
  function paintTipsBtn() {
    const on = window.tips ? window.tips.on : true;
    els.hpTipsBtn.innerHTML = on ? ICONS.tipsOn : ICONS.tipsOff;
    els.hpTipsBtn.setAttribute("aria-pressed", String(!on));
    const label = on ? "Turn the hints off" : "Turn the hints on";
    els.hpTipsBtn.setAttribute("aria-label", label);
    els.hpTipsBtn.dataset.tip = label;
  }
  if (window.tips) {
    paintTipsBtn();
    window.tips.onChange(paintTipsBtn);
    els.hpTipsBtn.onclick = () => window.tips.set(!window.tips.on);
  }

  // Close on the join screen. window.close() is ignored for a tab the
  // browser did not open from a script, which is every tab a guest
  // arrives in from a link, so this does not pretend: it puts the
  // camera and microphone down, replaces the form with a line saying
  // nothing is running, and leaves the way back in on the page. Trying
  // window.close() first costs nothing and does close the tab in the
  // one case where it is allowed - a link opened with target=_blank.
  els.closeBtn.onclick = () => {
    stopPreview();
    els.previewCard.hidden = true;
    els.previewBye.hidden = false;
    window.close();
  };
  const BYE_DEFAULT = [els.byeTitle.textContent, els.byeText.textContent];
  els.rejoinBtn.onclick = () => {
    // Put the card's own words back: it may have been borrowed to
    // explain a seat taken elsewhere, and the next Close must not
    // inherit that
    els.byeTitle.textContent = BYE_DEFAULT[0];
    els.byeText.textContent = BYE_DEFAULT[1];
    els.previewBye.hidden = true;
    els.previewCard.hidden = false;
    initPreview();
  };

  window.addEventListener("beforeunload", () => { try { ws && ws.close(); } catch { /* ignore */ } });

  try {
    if (localStorage.getItem(JOINING_KEY) === "rnnoise") {
      localStorage.removeItem(JOINING_KEY);
      noisePref = "off";
      showError("Your last join didn't finish, so noise suppression is switched off for this try.");
    }
  } catch { /* ignore */ }

  if ("serviceWorker" in navigator) {
    // Register AND force an update check: an old worker with a stale
    // cache must never keep serving yesterday's session code
    navigator.serviceWorker.register("/sw.js")
      .then((reg) => reg.update())
      .catch(() => {});
  }

  outputMode ? joinOutput() : initPreview();
})();
