/* FOSSStudio host dashboard: main menu -> sub-menu -> content. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);

  // A finished sound track. The tag in the middle is the format the
  // studio asked for, and it is only there when more than one was.
  const AUDIO_FILE = /-audio(-[a-z0-9]+)?\.(wav|opus|webm|mp4)$/i;

  // Framed inside another application's shell (a hosting panel, a
  // portal): that shell has the wordmark and the way out, so ours are
  // hidden. Set by the sign-in link that brought us here.
  if (/(?:^|;\s*)fs_embed=1(?:;|$)/.test(document.cookie)) document.body.classList.add("embedded");

  async function apiFetch(url, opts = {}) {
    const headers = {};
    if (opts.body && !(opts.body instanceof Blob)) headers["Content-Type"] = "application/json";
    Object.assign(headers, opts.headers);
    const res = await fetch(url, { ...opts, headers });
    if (res.status === 401) { location.href = "/host/login.html"; throw new Error("logged out"); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  // ---------- navigation ----------

  const MENUS = [
    { id: "sessions", label: "Sessions", subs: [{ id: "sessions", label: "Your sessions" }] },
    { id: "recordings", label: "Recordings", subs: [
      { id: "library", label: "Library" }
    ] },
    { id: "settings", label: "Settings", subs: [
      { id: "recording", label: "Formats" },
      { id: "place", label: "Studio address" },
      { id: "themes", label: "Themes" },
      { id: "banner", label: "Ad Banner" },
      { id: "blocked", label: "Blocked" }
    ] },
    // Account, System and Help stand apart at the foot of the sidebar:
    // everything above them is the show, these three are the machine and
    // the person running it. Two-factor lives inside Account rather than
    // beside it - a second way of proving who you are is part of your
    // login, not a separate subject.
    { id: "account", label: "Account", foot: true, subs: [
      { id: "account", label: "Account" }
    ] },
    { id: "system", label: "System", subs: [
      { id: "service", label: "Service" },
      { id: "backups", label: "Backups" },
      { id: "logs", label: "Logs" }
    ] },
    // Help sits with them. Charlie, 14 September 2026: "Don't have the
    // Help in the top right-hand corner. Make it one of the tabs on the
    // left. Make it part of the system, so it doesn't just open to a
    // blank page with no menus." It is the studio's own answers, not a
    // website, so it belongs in the same frame as everything else.
    // A rule above it, so Help reads as its own thing rather than as the
    // fourth page of System
    { id: "help", label: "Help", rule: true, subs: [
      { id: "help", label: "Help" }
    ] }
  ];

  let me = { username: "" };
  let currentMenu = null;

  function visibleMenus() {
    return MENUS;
  }

  // The pages under a menu. They used to be a second column of their
  // own; they are lines in the one sidebar now, so nothing here means
  // "submenu" any more.
  function pagesIn(menu) {
    return menu.subs;
  }

  // The whole sidebar is drawn from MENUS every time the page changes:
  // one button per pane, under a quiet heading where a menu has more
  // than one. A menu with a single pane is its own button and needs no
  // heading. There used to be a second column for those sub-pages - two
  // menus to reach one screen - and it is gone.
  //
  // The fragment scheme is untouched: a button still stands for a
  // menu and a sub, so #settings/themes and #help/public-ip address
  // exactly what they always addressed.
  function renderMainMenu(activeSub) {
    const nav = $("mainMenu");
    nav.innerHTML = "";
    // Everything from the first menu marked foot goes in a block pushed
    // to the bottom of the sidebar by the space left over
    let foot = null;
    for (const menu of visibleMenus()) {
      if (menu.foot && !foot) {
        foot = document.createElement("div");
        foot.className = "menu-foot";
        nav.appendChild(foot);
      }
      const into = foot || nav;
      if (menu.rule) into.appendChild(document.createElement("hr"));
      const subs = pagesIn(menu);
      if (subs.length > 1) {
        const head = document.createElement("p");
        head.className = "menu-head";
        head.textContent = menu.label;
        into.appendChild(head);
      }
      for (const sub of subs) {
        const b = document.createElement("button");
        // One pane under a menu means the menu's own name is the name of
        // the page: "Sessions", not "Sessions / Your sessions"
        b.textContent = subs.length > 1 ? sub.label : menu.label;
        b.classList.toggle("active", menu === currentMenu && sub.id === activeSub);
        b.onclick = () => { currentMenu = menu; showSub(sub.id); };
        into.appendChild(b);
      }
    }
  }

  function showSub(subId) {
    renderMainMenu(subId);
    document.querySelectorAll("section[id^=pane-]").forEach((s) => {
      s.hidden = s.id !== `pane-${subId}`;
    });
    // A new page starts at its top, not wherever the last one was left
    document.querySelector(".workspace").scrollTop = 0;
    if (subId === "blocked") loadSessionBlocked();
    // Remember the spot in the URL so a refresh comes back here
    history.replaceState(null, "", `#${currentMenu.id}/${subId}`);
  }

  // Help is one pane with all its answers in it, so the second half of
  // its fragment names an answer where every other menu names a
  // sub-page: #help/public-ip. A bare #public-ip works as well, because
  // /help#public-ip redirects here and a browser keeps the fragment
  // across a redirect - that is the address the media warning in a live
  // session points at, and the one people paste to each other.
  function helpSection(id) {
    return id && /^[a-z0-9-]+$/.test(id)
      ? document.querySelector(`#pane-help .help-sec#${id}`)
      : null;
  }

  function showHelp(section) {
    currentMenu = visibleMenus().find((x) => x.id === "help");
    showSub("help");
    const el = helpSection(section);
    if (!el) return;
    // The pane is showing by now, so the section has a height to scroll
    // to; help.css keeps a little air above it rather than landing the
    // heading flush against the top of the window.
    history.replaceState(null, "", `#help/${section}`);
    el.scrollIntoView();
  }

  // Restore #menu/sub from the URL; false if it doesn't point anywhere
  function applyHash() {
    const [m, sub] = location.hash.replace(/^#/, "").split("/");
    if (m === "help" || helpSection(m)) {
      showHelp(helpSection(m) ? m : sub);
      return true;
    }
    const menu = visibleMenus().find((x) => x.id === m);
    if (!menu) return false;
    currentMenu = menu;
    const subs = pagesIn(menu);
    showSub((subs.find((x) => x.id === sub) || subs[0]).id);
    return true;
  }
  window.addEventListener("hashchange", applyHash);

  $("logoutBtn").onclick = async () => {
    await apiFetch("/api/logout", { method: "POST" });
    location.href = "/host/login.html";
  };

  // ---------- icons ----------

  const ICONS = {
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M21 3l-9 9M9 21H5a2 2 0 0 1-2-2V7"/></svg>',
    del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="15" r="4"/><path d="M11 12L21 2M16 7l3 3"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a7.97 7.97 0 0 0 .1-3l2-1.2-2-3.4-2.2.7a8 8 0 0 0-2.6-1.5L14.3 4h-4l-.4 2.6a8 8 0 0 0-2.6 1.5l-2.2-.7-2 3.4 2 1.2a7.97 7.97 0 0 0 .1 3l-2 1.2 2 3.4 2.2-.7a8 8 0 0 0 2.6 1.5l.4 2.6h4l.4-2.6a8 8 0 0 0 2.6-1.5l2.2.7 2-3.4z"/></svg>',
    tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 12l5 5L20 7"/></svg>',
    obs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/><circle cx="12" cy="10.5" r="3"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'
  };

  function iconBtn(icon, label, onClick) {
    const b = document.createElement("button");
    b.className = "iconbtn";
    b.innerHTML = ICONS[icon];
    b.dataset.tip = label;
    b.setAttribute("aria-label", label);
    b.onclick = onClick;
    return b;
  }

  // Destructive actions confirm inline: first click shows a tick,
  // second click (within 4s) does it. No popups.
  function confirmBtn(icon, label, onConfirm) {
    let reset = null;
    const b = iconBtn(icon, label, () => {
      // Once confirmed the action owns the button's state - the armed
      // timeout must not reset it mid-action
      if (b.classList.contains("confirm")) {
        clearTimeout(reset);
        b.classList.remove("confirm");
        onConfirm();
        return;
      }
      b.classList.add("confirm");
      b.innerHTML = ICONS.tick;
      b.dataset.tip = "Click again to confirm";
      reset = setTimeout(() => {
        b.classList.remove("confirm");
        b.innerHTML = ICONS[icon];
        b.dataset.tip = label;
      }, 4000);
    });
    return b;
  }

  // ---------- sessions ----------

  async function loadSessions() {
    const list = $("sessionList");
    const sessions = await apiFetch("/api/sessions");
    list.innerHTML = "";
    if (sessions.length === 0) {
      list.innerHTML = '<p class="hint">No sessions yet - create one above and send the link to your guests.</p>';
      return;
    }
    for (const s of sessions) {
      const row = document.createElement("div");
      row.className = "session-row";
      const link = `${location.origin}/s/${s.id}`;
      row.innerHTML = `
        <div>
          <div class="title"></div>
          <div class="meta"></div>
        </div>
        <span class="badge" ${s.active ? "" : "hidden"}>● in session · ${s.participants}</span>
        <span class="spacer"></span>`;
      row.querySelector(".title").textContent = s.title;
      row.querySelector(".meta").textContent =
        `${link} · created ${new Date(s.createdAt).toLocaleDateString()}`;

      const edit = iconBtn("pencil", "Rename this session", () => {
        if (row.querySelector(".title-edit")) return;
        const titleEl = row.querySelector(".title");
        const input = document.createElement("input");
        input.className = "title-edit";
        input.maxLength = 80;
        input.value = s.title;
        titleEl.replaceWith(input);
        input.focus();
        input.select();
        let finished = false;
        const done = async (save) => {
          if (finished) return;
          finished = true;
          const t = input.value.trim();
          if (save && t && t !== s.title) {
            await apiFetch(`/api/sessions/${s.id}/title`, {
              method: "POST",
              body: JSON.stringify({ title: t })
            }).catch(() => {});
          }
          loadSessions();
        };
        input.onkeydown = (e) => {
          if (e.key === "Enter") done(true);
          if (e.key === "Escape") done(false);
        };
        input.onblur = () => done(true);
      });
      const copy = iconBtn("copy", "Copy guest link", async () => {
        await navigator.clipboard.writeText(link);
        copy.classList.add("done");
        copy.innerHTML = ICONS.tick;
        setTimeout(() => { copy.classList.remove("done"); copy.innerHTML = ICONS.copy; }, 1500);
      });
      const obs = iconBtn("obs", "Copy the view-only output link - a Browser Source in OBS or anything like it", async () => {
        await navigator.clipboard.writeText(`${link}?output=1`);
        obs.classList.add("done");
        obs.innerHTML = ICONS.tick;
        setTimeout(() => { obs.classList.remove("done"); obs.innerHTML = ICONS.obs; }, 1500);
      });
      const open = iconBtn("open", "Open studio as host", () => {
        window.open(`/s/${s.id}`, "_blank");
      });
      const del = confirmBtn("del", "Delete session", async () => {
        await apiFetch(`/api/sessions/${s.id}`, { method: "DELETE" });
        loadSessions();
      });
      row.append(edit, copy, obs, open, del);
      list.appendChild(row);
    }
  }

  $("newSessionForm").onsubmit = async (e) => {
    e.preventDefault();
    await apiFetch("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ title: $("newSessionTitle").value })
    });
    $("newSessionTitle").value = "";
    loadSessions();
  };

  // Settings save themselves when a field changes - no Save buttons.
  // 'change' fires on blur (or enter), so nothing saves mid-keystroke.
  function autoSave(ids, save) {
    for (const id of ids) {
      $(id).addEventListener("change", () => { save().catch(() => {}); });
    }
  }

  // ---------- recordings ----------

  // Ready recordings need no badge (their files are right there); the
  // rest show a small icon with a tooltip rather than a word
  function setStatusBadge(badge, status) {
    badge.className = "badge";
    badge.textContent = "";
    badge.removeAttribute("data-tip");
    if (status === "ready") { badge.hidden = true; return; }
    badge.hidden = false;
    if (status === "processing") {
      badge.classList.add("status-icon");
      badge.dataset.tip = "Processing";
      badge.innerHTML = '<span class="proc-spinner" aria-label="Processing"></span>';
    } else if (status === "recording") {
      badge.classList.add("status-icon");
      badge.dataset.tip = "Recording now";
      badge.innerHTML = '<span class="rec-now" aria-label="Recording now"></span>';
    } else if (status === "failed") {
      badge.classList.add("status-icon", "status-fail");
      badge.dataset.tip = "Processing failed - the raw files are kept";
      badge.textContent = "!";
    }
  }

  async function loadRecordings() {
    const list = $("recordingList");
    const recs = await apiFetch("/api/recordings");
    list.innerHTML = "";
    if (recs.length === 0) {
      list.innerHTML = '<p class="hint">Nothing recorded yet. Start one from the host controls inside a session.</p>';
      return;
    }
    for (const r of recs) {
      const card = document.createElement("div");
      card.className = "rec-card";
      const when = new Date(r.startedAt).toLocaleString();
      const mins = r.endedAt ? Math.max(1, Math.round((r.endedAt - r.startedAt) / 60000)) : null;
      card.innerHTML = `
        <div class="rec-head">
          <div class="rec-head-text">
            <div class="title"></div>
            <div class="meta"></div>
          </div>
          <div class="rec-head-actions">
            <span class="badge"></span>
          </div>
        </div>
        <div class="files"></div>`;
      card.querySelector(".title").textContent = r.title || `Session ${r.roomId}`;
      card.querySelector(".meta").textContent =
        `${when}${mins ? ` · ${mins} min` : ""} · ${(r.files || []).length} files`;
      setStatusBadge(card.querySelector(".badge"), r.status);
      const filesEl = card.querySelector(".files");
      // Anything the take noticed that belongs to no one file - a format
      // somebody's browser could not write, so there is nothing to hang
      // the note on. Said once, at the top, rather than not at all.
      for (const n of (r.notes || []).filter((n) => !n.file)) {
        const line = document.createElement("div");
        line.className = "rec-note rec-note-top";
        line.textContent = n.text;
        filesEl.appendChild(line);
      }
      for (const f of r.files || []) {
        const url = `/api/recordings/${encodeURIComponent(r.id)}/files/${encodeURIComponent(f)}`;
        const isVideo = !AUDIO_FILE.test(f) && /\.(mp4|webm)$/i.test(f);
        const isAudio = AUDIO_FILE.test(f);
        const fileRow = document.createElement("div");
        fileRow.className = "rec-file";
        const fname = document.createElement("span");
        fname.className = "rec-fname";
        fname.textContent = f;
        fileRow.appendChild(fname);
        if (isVideo) fileRow.appendChild(videoToggleButton(url));
        else if (isAudio) fileRow.appendChild(audioToggleButton(url));
        fileRow.appendChild(downloadLink(url));
        fileRow.appendChild(confirmBtn("del", "Delete this file", async () => {
          await apiFetch(url, { method: "DELETE" });
          loadRecordings();
        }));
        // Anything the take itself noticed about this file - so far,
        // only a microphone that could not keep up
        const note = (r.notes || []).find((n) => n.file === f);
        if (note) {
          const line = document.createElement("div");
          line.className = "rec-note";
          line.textContent = note.text;
          fileRow.appendChild(line);
        }
        filesEl.appendChild(fileRow);
      }
      // Bottom action row under the files: the two zip downloads, then
      // the whole-recording delete in line with the per-file deletes
      const actions = document.createElement("div");
      actions.className = "rec-actions";
      const zipBase = `/api/recordings/${encodeURIComponent(r.id)}/zip`;
      const hasAudio = (r.files || []).some((f) => AUDIO_FILE.test(f));
      if (hasAudio) {
        const dlAudio = downloadLink(`${zipBase}?audio=1`);
        dlAudio.innerHTML = ICO.downloadAudio;
        dlAudio.dataset.tip = "Download everyone's audio tracks, zipped";
        dlAudio.setAttribute("aria-label", "Download all audio");
        actions.appendChild(dlAudio);
      }
      if ((r.files || []).length) {
        const dlAll = downloadLink(zipBase);
        dlAll.innerHTML = ICO.downloadAll;
        dlAll.dataset.tip = "Download all files (zipped)";
        dlAll.setAttribute("aria-label", "Download all files");
        actions.appendChild(dlAll);
      }
      actions.appendChild(
        confirmBtn("del", "Delete recording and its files", async () => {
          await apiFetch(`/api/recordings/${encodeURIComponent(r.id)}`, { method: "DELETE" });
          loadRecordings();
        }));
      card.appendChild(actions);
      list.appendChild(card);
    }
  }


  async function loadSessionBlocked() {
    const list = $("sessionBlockedList");
    if (!list) return;
    const blocked = await apiFetch("/api/session/blocked");
    list.innerHTML = "";
    if (blocked.length === 0) {
      list.innerHTML = '<p class="hint">Nobody is blocked. The Block button is in the host panel while you are in a session, at the end of the row of small buttons under a guest\'s name.</p>';
      return;
    }
    for (const b of blocked) {
      const row = document.createElement("div");
      row.className = "session-row";
      const name = document.createElement("span");
      name.className = "session-title";
      name.textContent = b.name;
      const when = document.createElement("span");
      when.className = "hint";
      when.textContent = `blocked ${new Date(b.blockedAt).toLocaleString()}`;
      row.append(name, when);
      row.appendChild(confirmBtn("del", "Unblock - lets them join sessions again", async () => {
        await apiFetch(`/api/session/blocked/${encodeURIComponent(b.id)}`, { method: "DELETE" });
        loadSessionBlocked();
      }));
      list.appendChild(row);
    }
  }

  // ---------- what a recording holds ----------
  //
  // One question first, because it is the only one most people have:
  // what should the finished video of everyone be. Everything else -
  // a track and a camera per person, and what those are written as -
  // is behind a yes or no, and stays out of sight when the answer is no.
  //
  // Nothing here is our judgment of what is good. Every format offered
  // is one a browser writes itself, which is why each row says which
  // browsers can write it. The running total is the point of the
  // screen: the moment to find out that a choice is forty gigabytes is
  // before the show.

  let catalog = null;
  let chosen = { showFormat: "mp4", separateFiles: true, audio: [], camera: [] };

  // What this browser, right now, can write. The setting reaches every
  // guest, so a format this machine cannot manage is still worth
  // picking - but the show itself is made here, so for that row it is
  // the whole answer.
  const canHere = (mimes) => (mimes || []).some((m) => {
    try { return MediaRecorder.isTypeSupported(m); } catch { return false; }
  });

  function saidSize(bytes) {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(bytes >= 1e10 ? 0 : 1)} GB`;
    if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
    return `${Math.round(bytes / 1e3)} KB`;
  }

  // One row. `pickOne` makes it a radio - the show is one file - and
  // anything else is a tick box.
  function formatRow(f, { pickOne, size, on, onPick }) {
    const row = document.createElement("label");
    row.className = "fmt-row";
    const box = document.createElement("input");
    box.type = pickOne ? "radio" : "checkbox";
    if (pickOne) box.name = "showFormatPick";
    box.checked = on;
    row.classList.toggle("on", on);
    const body = document.createElement("div");
    body.className = "fmt-body";
    const name = document.createElement("div");
    name.className = "fmt-name";
    const b = document.createElement("b");
    b.textContent = f.label;
    const sizeEl = document.createElement("span");
    sizeEl.className = "fmt-size";
    sizeEl.textContent = size;
    name.append(b, sizeEl);
    const detail = document.createElement("span");
    detail.className = "hint";
    detail.textContent = f.detail;
    // Two separate facts: which browsers in general, and this one in
    // particular. Run together in one sentence they read as one claim
    // and neither lands.
    const who = document.createElement("span");
    who.className = "hint fmt-browsers";
    who.textContent = f.browsers;
    const here = document.createElement("span");
    here.className = "hint fmt-here";
    const able = canHere(f.mimes);
    here.classList.toggle("no", !able);
    here.textContent = able ? "This browser can write it."
      : pickOne ? "This browser cannot write it, so hosting from here would give you WebM instead."
        : "This browser cannot write it, so your own file will not be in it.";
    body.append(name, detail, who, here);
    row.append(box, body);
    box.addEventListener("change", () => onPick(box, row));
    return row;
  }

  function drawFormats() {
    if (!catalog) return;

    const showHost = $("showFormat");
    showHost.textContent = "";
    for (const f of catalog.video) {
      showHost.appendChild(formatRow(f, {
        pickOne: true,
        size: `${saidSize(catalog.programBytesPerHour)} an hour`,
        on: chosen.showFormat === f.id,
        onPick: () => {
          chosen.showFormat = f.id;
          drawFormats();
          save("show").catch(() => {});
        }
      }));
    }

    for (const [key, host, warn] of [
      ["audio", $("audioFormats"), null],
      ["camera", $("cameraFormats"), $("cameraWarn")]
    ]) {
      host.textContent = "";
      const list = key === "audio" ? catalog.audio : catalog.video;
      for (const f of list) {
        host.appendChild(formatRow(f, {
          pickOne: false,
          size: key === "audio"
            ? `${saidSize(f.bytesPerHour)} per person per hour`
            : `${saidSize(catalog.cameraBytesPerHour)} per person per hour`,
          on: chosen[key].includes(f.id),
          onPick: (box, row) => {
            const next = box.checked
              ? [...chosen[key], f.id]
              : chosen[key].filter((id) => id !== f.id);
            // Never a browser popup, and never a silent refusal either:
            // the last one stays ticked and the line below says why.
            if (!next.length) {
              box.checked = true;
              say(`Keeping the parts means keeping something, so ${f.label} stays ` +
                `until you pick another. Answer No above if you only want the video of everyone.`);
              return;
            }
            chosen[key] = list.map((x) => x.id).filter((id) => next.includes(id));
            row.classList.toggle("on", box.checked);
            save("formats").catch(() => {});
            sumUp();
          }
        }));
      }
      if (warn) warn.hidden = chosen[key].length < 2;
    }

    for (const input of document.querySelectorAll("input[name=separateFiles]")) {
      input.checked = input.value === (chosen.separateFiles ? "yes" : "no");
    }
    $("partsPanel").hidden = !chosen.separateFiles;
    sumUp();
  }

  for (const input of document.querySelectorAll("input[name=separateFiles]")) {
    input.addEventListener("change", () => {
      chosen.separateFiles = input.value === "yes";
      $("partsPanel").hidden = !chosen.separateFiles;
      save("parts").catch(() => {});
      sumUp();
    });
  }

  // Saved is a bare tick, and it appears at the card that changed -
  // never a green box, and never something that pops up somewhere else
  // on the page while you are looking here.
  function marked(which) {
    const el = document.querySelector(`.fmt-mark[data-mark="${which}"]`);
    if (!el) return;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, 2000);
  }

  // A refusal is a plain gray sentence, no color and no box: it is an
  // explanation, not an alarm.
  function say(text) {
    const el = $("qualityMsg");
    el.textContent = text;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, 6000);
  }

  // What the answers add up to, in the shape of a real show.
  // Only worth showing when there is something to add up. With one file
  // a recording there is no sum: the number beside the choice above is
  // the whole answer, and a box asking how many people are coming is a
  // question with no bearing on it.
  function sumUp() {
    if (!catalog) return;
    $("formatSum").hidden = !chosen.separateFiles;
    if (!chosen.separateFiles) return;
    const people = Math.max(1, Math.min(10, Number($("sumPeople").value) || 1));
    const hours = Math.max(1, Math.min(8, Number($("sumHours").value) || 1));
    const lines = [];
    let total = 0;
    const show = catalog.video.find((f) => f.id === chosen.showFormat);
    if (show) {
      const bytes = catalog.programBytesPerHour * hours;
      total += bytes;
      lines.push([`The video of everyone, ${show.label}`, bytes]);
    }
    for (const f of catalog.audio) {
      if (!chosen.audio.includes(f.id)) continue;
      const bytes = f.bytesPerHour * people * hours;
      total += bytes;
      lines.push([`${f.label}, ${people} ${people === 1 ? "track" : "tracks"}`, bytes]);
    }
    for (const f of catalog.video) {
      if (!chosen.camera.includes(f.id)) continue;
      const bytes = catalog.cameraBytesPerHour * people * hours;
      total += bytes;
      lines.push([`${f.label}, ${people} ${people === 1 ? "camera" : "cameras"}`, bytes]);
    }
    $("sumTotal").textContent =
      `About ${saidSize(total)} for a ${hours}-hour show with ${people} ${people === 1 ? "person" : "people"}`;
    const ul = $("sumBreak");
    ul.textContent = "";
    for (const [what, bytes] of lines) {
      const li = document.createElement("li");
      const a = document.createElement("span");
      a.textContent = what;
      const c = document.createElement("span");
      c.textContent = saidSize(bytes);
      li.append(a, c);
      ul.appendChild(li);
    }
  }

  for (const id of ["sumPeople", "sumHours"]) {
    $(id).addEventListener("input", sumUp);
  }

  async function save(which) {
    await apiFetch("/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        showFormat: chosen.showFormat,
        separateFiles: chosen.separateFiles,
        audioFormats: chosen.audio,
        cameraFormats: chosen.camera
      })
    });
    marked(which);
  }

  // ---------- passkeys ----------

  // Base64url both ways: WebAuthn speaks ArrayBuffers and JSON does not.
  const b64 = {
    to(buf) {
      const bytes = new Uint8Array(buf);
      let out = "";
      for (const b of bytes) out += String.fromCharCode(b);
      return btoa(out).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    },
    from(str) {
      const raw = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
      const out = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
      return out;
    }
  };

  async function loadPasskeys() {
    const list = $("passkeyList");
    if (!window.PublicKeyCredential) {
      list.innerHTML = "<p class=\"hint\">This browser cannot use passkeys. The password above is how you sign in here.</p>";
      $("addPasskeyBtn").hidden = true;
      return;
    }
    const keys = await apiFetch("/api/passkeys").catch(() => []);
    list.textContent = "";
    if (!keys.length) {
      list.innerHTML = "<p class=\"hint\">No passkeys yet.</p>";
      return;
    }
    for (const key of keys) {
      const row = document.createElement("div");
      row.className = "row";
      const name = document.createElement("span");
      name.textContent = `Passkey on ${key.rpId}`;
      const when = document.createElement("span");
      when.className = "hint";
      when.textContent = `added ${new Date(key.addedAt).toLocaleDateString()}`;
      row.append(name, when);
      row.appendChild(confirmBtn("del", "Remove this passkey", async () => {
        await apiFetch(`/api/passkeys/${encodeURIComponent(key.id)}`, { method: "DELETE" });
        loadPasskeys();
      }));
      list.appendChild(row);
    }
  }

  $("addPasskeyBtn").onclick = async () => {
    $("passkeyMsg").hidden = true;
    try {
      const opts = await apiFetch("/api/passkeys/begin", { method: "POST" });
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: b64.from(opts.challenge),
          rp: { id: opts.rpId, name: opts.rpName },
          user: { id: b64.from(opts.userId), name: opts.userName, displayName: opts.userName },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
          authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
          excludeCredentials: (opts.excludeCredentials || [])
            .map((id) => ({ type: "public-key", id: b64.from(id) })),
          timeout: 90000,
          attestation: "none"
        }
      });
      await apiFetch("/api/passkeys/finish", {
        method: "POST",
        body: JSON.stringify({
          response: {
            clientDataJSON: b64.to(cred.response.clientDataJSON),
            attestationObject: b64.to(cred.response.attestationObject)
          }
        })
      });
      loadPasskeys();
    } catch (err) {
      $("passkeyMsg").textContent = err.message || "Your browser would not make a passkey here.";
      $("passkeyMsg").hidden = false;
    }
  };

  // ---------- where the studio lives ----------

  async function loadPlace() {
    const p = await apiFetch("/api/setup/place").catch(() => null);
    if (!p) return;
    $("placeDomain").value = p.domain === "localhost" ? "" : (p.domain || "");
    $("placePublicIp").value = p.publicIp || "";
    $("placeTurnHost").value = p.turnHost || "";
  }

  $("savePlaceBtn").onclick = async () => {
    $("placeMsg").hidden = true;
    $("placeErrMsg").hidden = true;
    try {
      const out = await apiFetch("/api/setup/place", {
        method: "PUT",
        body: JSON.stringify({
          domain: $("placeDomain").value,
          publicIp: $("placePublicIp").value,
          turnHost: $("placeTurnHost").value
        })
      });
      $("placeMsg").hidden = false;
      $("placeRestart").hidden = !out.restartNeeded;
      setTimeout(() => { $("placeMsg").hidden = true; }, 2000);
    } catch (err) {
      $("placeErrMsg").textContent = err.message;
      $("placeErrMsg").hidden = false;
    }
  };

  // ---------- theme ----------


  async function loadSettings() {
    const s = await apiFetch("/api/settings");
    catalog = catalog || await apiFetch("/api/formats");
    chosen = {
      showFormat: s.showFormat || "mp4",
      separateFiles: s.separateFiles !== false,
      audio: Array.isArray(s.audioFormats) && s.audioFormats.length ? s.audioFormats : ["wav"],
      camera: Array.isArray(s.cameraFormats) && s.cameraFormats.length ? s.cameraFormats : ["mp4"]
    };
    drawFormats();
    updateWallpaperPreview(s.wallpaper);
    updateLogoPreview(!!s.logo);
    // The note explaining the example only makes sense while the example
    // is what is there. Upload your own or remove it and the whole block
    // goes, rather than sitting under somebody else's banner explaining
    // a banner that is no longer on screen.
    updateAdPreview(!!s.adBanner, !!s.adBannerIsExample);
  }

  function updateWallpaperPreview(name) {
    const el = $("wallpaperPreview");
    if (name) {
      el.style.backgroundImage = `url(/api/wallpaper?${Date.now()})`;
      el.textContent = "";
    } else {
      el.style.backgroundImage = "";
      el.textContent = "No wallpaper set";
    }
  }


  function updateAdPreview(has, isExample = false) {
    const el = $("adPreview");
    if (has) {
      el.style.backgroundImage = `url(/api/adbanner?${Date.now()})`;
      el.textContent = "";
    } else {
      el.style.backgroundImage = "";
      el.textContent = "No banner uploaded";
    }
    $("adExampleNote").hidden = !isExample;
  }
  $("adPick").onclick = () => $("adFile").click();
  $("adFile").onchange = async () => {
    const file = $("adFile").files[0];
    if (!file) return;
    await fetch("/api/adbanner", {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file
    }).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error); });
    updateAdPreview(true);
  };
  $("adRemove").onclick = async () => {
    await apiFetch("/api/adbanner", { method: "DELETE" });
    updateAdPreview(false);
  };

  // ---------- video preview modal ----------
  let videoModalOnClose = null;
  function openVideoModal(url, onClose) {
    closeVideoModal();              // revert any button already showing a preview
    videoModalOnClose = onClose || null;
    const v = $("videoModalPlayer");
    v.src = url;
    $("videoModal").hidden = false;
    v.play().catch(() => {});
  }
  function closeVideoModal() {
    if ($("videoModal").hidden) return;
    $("videoModal").hidden = true;
    const v = $("videoModalPlayer");
    try { v.pause(); v.removeAttribute("src"); v.load(); } catch { /* ignore */ }
    const cb = videoModalOnClose; videoModalOnClose = null;
    if (cb) cb();
  }
  $("videoModalClose").onclick = closeVideoModal;
  $("videoModalBackdrop").onclick = closeVideoModal;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeVideoModal(); });

  // ---------- preview controls (icons + tooltips) ----------
  const ICO = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5v14l12-7z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M8 11l4 4 4-4M5 20h14"/></svg>',
    downloadAudio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 15V4l9-2v10"/><circle cx="5.5" cy="15" r="2.5"/><circle cx="14.5" cy="12" r="2.5"/><path d="M19 15v6M16.5 18.5L19 21l2.5-2.5"/></svg>',
    downloadAll: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3h8a2 2 0 0 1 2 2v8M4 7h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM8 11v6M5.5 14.5L8 17l2.5-2.5"/></svg>'
  };
  function iconState(btn, icon, tip) {
    btn.innerHTML = ICO[icon];
    btn.dataset.tip = tip;
    btn.setAttribute("aria-label", tip);
  }

  // One button that toggles audio in place - no separate stop, no reflow
  function audioToggleButton(url) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "iconbtn";
    let audio = null;
    const toPlay = () => { audio = null; iconState(btn, "play", "Play"); };
    iconState(btn, "play", "Play");
    btn.stopPreview = () => { if (audio) audio.pause(); toPlay(); };
    btn.onclick = () => {
      if (audio) { audio.pause(); toPlay(); return; }
      audio = new Audio(url);
      iconState(btn, "stop", "Stop");
      audio.onended = toPlay;
      audio.onerror = toPlay;
      audio.play().catch(toPlay);
    };
    return btn;
  }

  // One button that toggles the video modal in place
  function videoToggleButton(url) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "iconbtn";
    let active = false;
    iconState(btn, "play", "Play");
    btn.onclick = () => {
      if (active) { closeVideoModal(); return; }
      active = true;
      iconState(btn, "stop", "Close preview");
      openVideoModal(url, () => { active = false; iconState(btn, "play", "Play"); });
    };
    return btn;
  }

  function downloadLink(url) {
    const a = document.createElement("a");
    a.className = "iconbtn";
    a.href = url;
    a.setAttribute("download", "");
    a.dataset.tip = "Download";
    a.setAttribute("aria-label", "Download");
    a.innerHTML = ICO.download;
    return a;
  }

  function updateLogoPreview(has) {
    const el = $("logoPreview");
    if (has) {
      el.style.backgroundImage = `url(/api/logo?${Date.now()})`;
      el.textContent = "";
    } else {
      el.style.backgroundImage = "";
      el.textContent = "No logo uploaded";
    }
  }
  $("logoPick").onclick = () => $("logoFile").click();
  $("logoFile").onchange = async () => {
    const file = $("logoFile").files[0];
    if (!file) return;
    await fetch("/api/logo", { method: "POST", headers: { "Content-Type": file.type }, body: file });
    updateLogoPreview(true);
  };
  $("logoRemove").onclick = async () => {
    await apiFetch("/api/logo", { method: "DELETE" });
    updateLogoPreview(false);
  };

  $("wallpaperPick").onclick = () => $("wallpaperFile").click();
  $("wallpaperFile").onchange = async () => {
    const file = $("wallpaperFile").files[0];
    if (!file) return;
    await fetch("/api/wallpaper", {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file
    }).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error); });
    updateWallpaperPreview("yes");
  };

    $("wallpaperRemove").onclick = async () => {
    await apiFetch("/api/wallpaper", { method: "DELETE" });
    updateWallpaperPreview(null);
  };

  // ---------- security ----------

  $("savePasswordBtn").onclick = async () => {
    const msg = $("passwordMsg");
    msg.hidden = true;
    try {
      await apiFetch("/api/password", {
        method: "POST",
        body: JSON.stringify({ password: $("newPassword").value })
      });
      msg.className = "msg ok";
      msg.textContent = "✓ Password changed";
      $("newPassword").value = "";
    } catch (err) {
      msg.className = "msg err";
      msg.textContent = err.message;
    }
    msg.hidden = false;
  };

  $("saveUsernameBtn").onclick = async () => {
    const ok = $("usernameMsg"), err = $("usernameErr");
    ok.hidden = true; err.hidden = true;
    try {
      const res = await apiFetch("/api/username", {
        method: "POST",
        body: JSON.stringify({ username: $("accountUsername").value })
      });
      me.username = res.username;
      $("accountUsername").value = res.username;
      $("accountName").textContent = res.username;
      $("whoami").textContent = me.username;
      ok.hidden = false;
    } catch (e) {
      err.textContent = e.message; err.hidden = false;
    }
  };

  async function load2fa() {
    const { enabled } = await apiFetch("/api/2fa");
    $("tfaOff").hidden = enabled;
    $("tfaOn").hidden = !enabled;
    $("tfaSetup").hidden = true;
  }

  $("tfaSetupBtn").onclick = async () => {
    const { secret } = await apiFetch("/api/2fa/setup", { method: "POST" });
    $("tfaSecret").textContent = secret;
    $("tfaOff").hidden = true;
    $("tfaSetup").hidden = false;
  };
  $("tfaEnableBtn").onclick = async () => {
    const msg = $("tfaMsg");
    msg.hidden = true;
    try {
      await apiFetch("/api/2fa/enable", {
        method: "POST",
        body: JSON.stringify({ code: $("tfaCode").value })
      });
      load2fa();
    } catch (err) { msg.textContent = err.message; msg.hidden = false; }
  };
  $("tfaDisableBtn").onclick = async () => {
    const msg = $("tfaMsg");
    msg.hidden = true;
    try {
      await apiFetch("/api/2fa/disable", {
        method: "POST",
        body: JSON.stringify({ code: $("tfaDisableCode").value })
      });
      load2fa();
    } catch (err) { msg.textContent = err.message; msg.hidden = false; }
  };

  // ---------- system ----------

  const sysMsg = (text, ok = true) => {
    const m = $("systemMsg");
    m.className = `msg ${ok ? "ok" : "err"}`;
    m.textContent = text;
    m.hidden = false;
    setTimeout(() => { m.hidden = true; }, 4000);
  };

  $("restartBtn").onclick = async () => {
    await apiFetch("/api/ops/restart", { method: "POST" });
    sysMsg("Restarting - back in a few seconds…");
    setTimeout(() => location.reload(), 6000);
  };

  $("backupNowBtn").onclick = async () => {
    await apiFetch("/api/ops/backup", { method: "POST" });
    loadBackups();
  };

  async function loadBackups() {
    const list = $("backupList");
    const backups = await apiFetch("/api/ops/backups");
    list.innerHTML = backups.length ? "" : '<p class="hint">No backups yet.</p>';
    for (const b of backups) {
      const row = document.createElement("div");
      row.className = "session-row";
      row.innerHTML = `<div><div class="title" style="font-size:0.85rem"></div>
        <div class="meta">${(b.size / 1024).toFixed(0)} KB</div></div><span class="spacer"></span>`;
      row.querySelector(".title").textContent = b.name;
      const dl = iconBtn("open", "Download backup", () => {
        location.href = `/api/ops/backups/${encodeURIComponent(b.name)}`;
      });
      const restore = confirmBtn("copy", "Restore this backup", async () => {
        await apiFetch("/api/ops/restore", { method: "POST", body: JSON.stringify({ name: b.name }) });
      });
      row.append(dl, restore);
      list.appendChild(row);
    }
  }

  $("refreshLogsBtn").onclick = loadLogs;
  async function loadLogs() {
    const { lines } = await apiFetch("/api/ops/logs");
    $("logBox").textContent = lines.slice(-200).join("\n") || "No log lines yet.";
    $("logBox").scrollTop = $("logBox").scrollHeight;
  }

  // ---------- backup retention ----------

  async function loadBackupKeep() {
    const { keep } = await apiFetch("/api/ops/backup-keep");
    $("backupKeep").value = keep;
  }

  async function saveBackupKeep() {
    try {
      const { keep } = await apiFetch("/api/ops/backup-keep", {
        method: "PUT", body: JSON.stringify({ keep: Number($("backupKeep").value) })
      });
      $("backupKeep").value = keep;
      $("backupKeepMsg").hidden = false;
      setTimeout(() => { $("backupKeepMsg").hidden = true; }, 2000);
      loadBackups();
    } catch (err) { sysMsg(err.message, false); }
  }
  autoSave(["backupKeep"], saveBackupKeep);

  // ---------- push notifications ----------

  // pushManager.subscribe wants the VAPID key as bytes: some browsers
  // accept the base64url string directly, others throw - which is what
  // made "Enable notifications" fail with no explanation
  function vapidKeyBytes(b64url) {
    const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
    const raw = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }

  $("pushBtn").onclick = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      return sysMsg("This browser doesn't support notifications.", false);
    }
    if (!("PushManager" in window)) {
      return sysMsg("This browser doesn't support push notifications (Safari needs the app added to the Home Screen first).", false);
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return sysMsg("Notifications were blocked in the browser.", false);
      const reg = await navigator.serviceWorker.ready;
      const { key } = await apiFetch("/api/push/key");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyBytes(key)
      });
      await apiFetch("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub) });
      sysMsg("✓ You'll get a notification when a guest arrives or a recording is ready.");
    } catch (err) {
      // Say what actually went wrong - "couldn't" with no reason made
      // this undebuggable from the other side of a bug report
      sysMsg(`Couldn't enable notifications: ${err.message || err.name || "unknown error"}`, false);
    }
  };

  if ("serviceWorker" in navigator) {
    // Register AND force an update check, so a stale worker can't pin
    // old dashboard code
    navigator.serviceWorker.register("/sw.js")
      .then((reg) => reg.update())
      .catch(() => {});
  }

  // ---------- boot ----------

  (async () => {
    me = await apiFetch("/api/me");
    if (!me.authed) { location.href = "/host/login.html"; return; }
    $("whoami").textContent = me.username;
    $("accountName").textContent = me.username;
    $("accountUsername").value = me.username;
    if (!applyHash()) {
      currentMenu = visibleMenus()[0];
      showSub(pagesIn(currentMenu)[0].id);
    }
    load2fa();
    loadPasskeys();
    loadPlace();
    loadBackups();
    loadBackupKeep();
    loadLogs();
    loadSettings();
    loadSessions();
    loadRecordings();
    loadSessionBlocked();
    setInterval(loadSessions, 10000);   // keep the participant counts fresh
    setInterval(loadRecordings, 15000); // pick up processing -> ready
  })();
})();
