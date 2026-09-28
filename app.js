/* Personal hypertrophy log. Not affiliated with RP Strength. */
(function () {
  const L = window.Logic;
  const state = {
    seed: [],
    libraryRaw: [],
    library: [],
    templates: { custom_templates: [], catalog: [], filters: {} },
    bwSeed: [],
    overlay: L.emptyOverlay(),
    mesos: [],
    profileName: "Avni",
    modal: null,
    board: null,
    builder: { days: 4, emphasize: [], grow: [], maintain: [], tab: "emphasize", start: "Monday" },
    toast: "",
    drag: "",
    ui: {
      historyStatus: "all",
      historySort: "newest",
      historyQuery: "",
      exerciseQuery: "",
      exerciseMuscle: "all",
      exerciseEquip: "all",
      templateFilters: { emphasis: "", author: "", sex: "", days: "" },
      copyWeek: 2,
      summaryMode: "muscles",
      summaryWeek: 0,
      mesoWeek: {},
      pickerQuery: "",
      pickerId: null,
      equipOn: {}
    },
    lastByName: {},
    equipByName: {}
  };
  window.__hyp = state;

  const $ = (sel) => document.querySelector(sel);

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function trimNum(n) {
    if (n == null || n === "") return "";
    const x = Number(n);
    if (Number.isNaN(x)) return String(n);
    return String(Math.round(x * 1000) / 1000);
  }

  function fmtDate(iso) {
    if (!iso) return "Not finished";
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const [y, m, d] = iso.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    }
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return String(iso);
    return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function route() {
    const raw = (location.hash || "#/today").replace(/^#/, "");
    return raw.split("?")[0].split("/").filter(Boolean);
  }

  function go(hash) {
    if (location.hash === hash) {
      state.keepModal = false;
      render();
      return;
    }
    state.keepModal = true;
    location.hash = hash;
  }

  function flash(msg) {
    state.toast = msg;
    render();
    const el = $("#toast");
    if (el) el.classList.add("show");
    clearTimeout(flash.t);
    flash.t = setTimeout(() => {
      const n = $("#toast");
      if (n) n.classList.remove("show");
    }, 2600);
  }

  function asset(path) {
    const base = window.__ASSET_BASE__ || "./";
    return base + path;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("avni-hypertrophy", 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains("kv")) req.result.createObjectStore("kv");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbGet(db, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readonly");
      const r = tx.objectStore("kv").get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  function idbSet(db, key, value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  let dbPromise = null;
  function db() {
    if (!dbPromise) dbPromise = openDb().catch(() => null);
    return dbPromise;
  }

  function scheduleSave() {
    clearTimeout(scheduleSave.t);
    scheduleSave.t = setTimeout(saveOverlay, 80);
  }

  async function saveOverlay() {
    try {
      const handle = await db();
      if (handle) await idbSet(handle, "overlay", state.overlay);
      else localStorage.setItem("avni-hypertrophy-overlay", JSON.stringify(state.overlay));
    } catch (err) {
      try { localStorage.setItem("avni-hypertrophy-overlay", JSON.stringify(state.overlay)); } catch (e) { /* ignore quota */ }
    }
  }

  async function decompress(buf) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }

  async function fetchJson(paths) {
    let last;
    for (const p of paths) {
      try {
        const res = await fetch(asset(p), { cache: "no-cache" });
        if (!res.ok) throw new Error(res.status + " " + p);
        if (p.endsWith(".gz")) {
          const text = await decompress(await res.arrayBuffer());
          return JSON.parse(text);
        }
        return await res.json();
      } catch (err) {
        last = err;
      }
    }
    throw last || new Error("Missing file");
  }

  function applyData() {
    state.library = L.libraryWithCustom(state.libraryRaw, state.overlay.customExercises);
    state.mesos = L.materialize(state.seed, state.overlay);
    rebuildIndex();
  }

  function rebuildIndex() {
    state.equipByName = {};
    state.library.forEach((ex) => {
      state.equipByName[L.normName(ex.name)] = ex.equipment || "";
    });
    const last = {};
    state.mesos.forEach((meso) => {
      meso.weeks.forEach((week, wi) => {
        week.days.forEach((day, di) => {
          (day.exercises || []).forEach((ex) => {
            (ex.sets || []).forEach((set) => {
              if (set.status !== "complete" || set.reps == null || set.reps < 0) return;
              const t = set.finishedAt || day.finishedAt || "";
              const key = L.normName(ex.name);
              if (!last[key] || t > last[key].t) {
                last[key] = { t, weight: set.weight, reps: set.reps, unit: set.unit || meso.unit || "lb", week: wi + 1, day: di + 1, meso: meso.name, date: t };
              }
            });
          });
        });
      });
    });
    state.lastByName = last;
  }

  function persistDay(meso, day) {
    if (meso.local) {
      const i = state.overlay.newMesos.findIndex((m) => m.key === meso.key);
      const copy = L.clone(meso);
      if (i >= 0) state.overlay.newMesos[i] = copy;
      else state.overlay.newMesos.push(copy);
    } else {
      state.overlay.days[day.id] = L.clone(day);
    }
    rebuildIndex();
    scheduleSave();
  }

  function persistMeta(meso) {
    if (meso.local) {
      const i = state.overlay.newMesos.findIndex((m) => m.key === meso.key);
      const copy = L.clone(meso);
      if (i >= 0) state.overlay.newMesos[i] = copy;
      else state.overlay.newMesos.push(copy);
    } else {
      state.overlay.mesoMeta[meso.key] = Object.assign({}, state.overlay.mesoMeta[meso.key] || {}, {
        name: meso.name,
        status: meso.status,
        finishedAt: meso.finishedAt,
        notes: meso.notes || []
      });
    }
    scheduleSave();
  }

  function saveBoard() {
    try { sessionStorage.setItem("goong-board", JSON.stringify(state.board)); } catch (e) { /* ignore */ }
  }

  function loadBoard() {
    if (state.board) return;
    try {
      const raw = sessionStorage.getItem("goong-board");
      if (raw) state.board = JSON.parse(raw);
    } catch (e) { /* ignore */ }
  }

  async function boot() {
    const app = $("#app");
    try {
      const handle = await db();
      if (handle) {
        const cachedSeed = await idbGet(handle, "seed");
        const cachedLib = await idbGet(handle, "library");
        const cachedTpl = await idbGet(handle, "templates");
        const cachedBw = await idbGet(handle, "bodyweight");
        const cachedOv = await idbGet(handle, "overlay");
        const cachedName = await idbGet(handle, "profileName");
        if (cachedOv) state.overlay = Object.assign(L.emptyOverlay(), cachedOv);
        if (cachedName) state.profileName = cachedName;
        if (cachedSeed && cachedLib) {
          state.seed = cachedSeed;
          state.libraryRaw = cachedLib.exercises || cachedLib;
          state.templates = cachedTpl || state.templates;
          state.bwSeed = (cachedBw && cachedBw.entries) || cachedBw || [];
          applyData();
          paint();
        }
      } else {
        const raw = localStorage.getItem("avni-hypertrophy-overlay");
        if (raw) state.overlay = Object.assign(L.emptyOverlay(), JSON.parse(raw));
      }
    } catch (err) { /* first visit */ }

    try {
      const [seed, lib, tpl, bw, profile] = await Promise.all([
        fetchJson(["data/official/rp-training-data.json.gz", "data/official/rp-training-data.json"]),
        fetchJson(["data/exercise-library.json"]),
        fetchJson(["data/templates.json"]),
        fetchJson(["data/bodyweight-log.json"]),
        fetchJson(["data/settings-profile.json"]).catch(() => null)
      ]);
      state.seed = seed;
      state.libraryRaw = lib.exercises || [];
      state.templates = tpl;
      state.bwSeed = bw.entries || [];
      if (profile && profile.profile && profile.profile.name) state.profileName = profile.profile.name.split(" ")[0];
      applyData();
      const handle = await db();
      if (handle) {
        await idbSet(handle, "seed", seed);
        await idbSet(handle, "library", lib);
        await idbSet(handle, "templates", tpl);
        await idbSet(handle, "bodyweight", bw);
        if (profile && profile.profile) await idbSet(handle, "profileName", state.profileName);
      }
      paint();
      registerSw();
    } catch (err) {
      if (!state.seed.length) {
        app.innerHTML = '<div class="error-box"><strong>Could not load training history.</strong><p>' + esc(err && err.message ? err.message : "Offline and nothing is saved on this phone yet.") + '</p><p>Open this page once while online. After that it stays on the phone.</p></div>';
      }
    }
  }

  function registerSw() {
    if (!("serviceWorker" in navigator)) return;
    const host = location.hostname;
    if (host.includes("htmlpreview.github.io")) return;
    if (location.protocol === "file:") return;
    navigator.serviceWorker.register(asset("sw.js")).catch(() => {});
  }

  function paint() {
    bindOnce();
    render();
  }

  let bound = false;
  function bindOnce() {
    if (bound) return;
    bound = true;
    document.body.addEventListener("click", onClick);
    document.body.addEventListener("input", onInput);
    document.body.addEventListener("change", onChange);
    document.body.addEventListener("focusin", onFocusIn);
    document.body.addEventListener("dragstart", onDragStart);
    document.body.addEventListener("dragover", (e) => {
      if (e.target.closest("[data-drop]")) e.preventDefault();
    });
    document.body.addEventListener("drop", onDrop);
    window.addEventListener("hashchange", () => {
      if (!state.keepModal) state.modal = null;
      state.keepModal = false;
      render();
    });
  }

  function render() {
    const main = $("#main");
    const scroll = main ? main.scrollTop : 0;
    const active = document.activeElement;
    const focus = active && active.dataset ? active.dataset.focus : "";
    const caret = active && typeof active.selectionStart === "number" ? active.selectionStart : null;
    $("#app").innerHTML = shell(screenForRoute());
    const next = $("#main");
    if (next) next.scrollTop = scroll;
    if (focus) {
      const el = document.querySelector('[data-focus="' + CSS.escape(focus) + '"]');
      if (el) {
        el.focus();
        if (caret != null && el.setSelectionRange) {
          try { el.setSelectionRange(caret, caret); } catch (e) { /* ignore */ }
        }
      }
    }
    if (state.toast) {
      const t = $("#toast");
      if (t) t.classList.add("show");
    }
  }

  function shell(body) {
    const r = route()[0] || "today";
    const html = '<div class="shell"><div class="main" id="main">' + body + disclaimer() + '</div>' +
      nav(r) + '<div id="toast" class="toast">' + esc(state.toast) + "</div>" + modalHtml() + "</div>";
    /* htmlpreview injects a <base> pointing at the raw file. A bare #/workout
       link then leaves the preview and the browser shows the HTML as text.
       Absolute links stay on this document and only change the hash. */
    const here = location.origin + location.pathname + location.search;
    return html.replace(/href="#\//g, function () { return 'href="' + here + "#/"; });
  }

  function disclaimer() {
    return '<p class="disclaimer">Personal training log for ' + esc(state.profileName) + '. Not affiliated with RP Strength. Weights and reps are from your export or what you type. Coach lines are a local estimate, not an official prescription.</p>';
  }

  function icon(name) {
    const paths = {
      today: '<path d="M4 10h3v8H4zM9 6h3v12H9zM14 8h3v10h-3z"/>',
      mesos: '<rect x="3" y="4" width="14" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 8h14"/>',
      history: '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 6v4l3 2"/>',
      lifts: '<circle cx="10" cy="10" r="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 3v3M10 14v3M3 10h3M14 10h3"/>',
      more: '<circle cx="4" cy="10" r="1.4"/><circle cx="10" cy="10" r="1.4"/><circle cx="16" cy="10" r="1.4"/>',
      cal: '<rect x="3" y="4" width="14" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 8h14M7 2v4M13 2v4"/>',
      back: '<path d="M12 4L6 10l6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
    };
    return '<svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true">' + (paths[name] || "") + "</svg>";
  }

  function nav(active) {
    const items = [
      ["today", "Today", "today"],
      ["mesos", "Mesos", "mesos"],
      ["history", "History", "history"],
      ["exercises", "Lifts", "lifts"],
      ["data", "More", "more"]
    ];
    return '<nav class="nav">' + items.map(([id, label, ic]) => {
      const on = active === id || (id === "data" && (active === "bodyweight" || active === "data"));
      return '<a href="#/' + id + '"' + (on ? ' class="active"' : "") + ">" + icon(ic) + "<span>" + label + "</span></a>";
    }).join("") + "</nav>";
  }

  function screenForRoute() {
    const r = route();
    const name = r[0] || "today";
    if (name === "today") return viewToday();
    if (name === "workout") return viewWorkout(r[1], Number(r[2]) - 1, Number(r[3]) - 1, false);
    if (name === "mesos") return viewMesos();
    if (name === "meso") return viewMeso(r[1]);
    if (name === "history") return viewHistory();
    if (name === "plan") {
      if (r[1] === "copy" && r[2]) return viewCopyWeek(r[2]);
      if (r[1] === "copy") return viewCopyList();
      if (r[1] === "template" && r[2]) return viewTemplate(decodeURIComponent(r[2]));
      if (r[1] === "template") return viewTemplates();
      if (r[1] === "builder" && r[2] === "priorities") return viewBuilderPriorities();
      if (r[1] === "builder" && r[2] === "working") return viewBuilderWorking();
      if (r[1] === "builder") return viewBuilder();
      return viewPlan();
    }
    if (name === "board") return viewBoard();
    if (name === "exercises") return viewExercises();
    if (name === "exercise") return viewExercise(decodeURIComponent(r.slice(1).join("/")));
    if (name === "bodyweight") return viewBodyweight();
    if (name === "data") return viewData();
    return viewToday();
  }

  function statusBadge(st, current) {
    if (current) return '<span class="badge current">Current</span>';
    const label = { complete: "Complete", skipped: "Skipped", partial: "Partial", ready: "Ready", pending: "Not programmed" }[st] || st;
    return '<span class="badge ' + esc(st || "") + '">' + esc(label) + "</span>";
  }

  function chip(id) {
    const name = L.MUSCLES[id] || "Muscle";
    return '<span class="chip ' + L.muscleTone(id) + '">' + esc(name) + "</span>";
  }

  function weekTitle(meso, index) {
    const rir = L.weekRir(meso, index);
    if (rir === 8) return "Deload";
    return "Week " + (index + 1);
  }

  function viewToday() {
    const meso = L.currentMeso(state.mesos);
    if (!meso) {
      return '<div class="top"><div class="titles"><div class="kicker">Today</div><h1>No current mesocycle</h1></div></div>' +
        '<a class="btn primary" href="#/plan">Plan a mesocycle</a>';
    }
    const pos = L.currentPosition(meso);
    return viewWorkout(meso.key, pos.week, pos.day, true);
  }

  function viewWorkout(key, weekIndex, dayIndex, isToday) {
    const loc = L.locateDay(state.mesos, key, weekIndex, dayIndex);
    if (!loc) return '<div class="empty">That workout is not in the log.</div>';
    const meso = loc.meso;
    const day = loc.day;
    const editable = L.isEditable(meso);
    const deload = L.isDeloadWeek(meso, weekIndex);
    const locked = editable && deload && L.deloadLocked(meso);
    const rir = L.weekRir(meso, weekIndex);
    const unit = day.unit || meso.unit || "lb";
    let html = '<div class="top">';
    if (!isToday) html += '<a class="iconbtn" href="#/meso/' + esc(meso.key) + '" aria-label="Back">' + icon("back") + "</a>";
    html += '<div class="titles"><div class="kicker">' + esc(weekTitle(meso, weekIndex)) + " · Day " + (dayIndex + 1) + "</div>";
    html += "<h1>" + esc(day.label || "Workout") + "</h1>";
    html += '<div class="sub">' + esc(meso.name) + (rir == null ? "" : " · " + (rir === 8 ? "Deload" : rir + " RIR")) + "</div></div>";
    html += '<button class="iconbtn" data-action="calendar" data-key="' + esc(meso.key) + '" aria-label="Calendar">' + icon("cal") + "</button>";
    html += '<button class="iconbtn" data-action="workout-menu" data-key="' + esc(meso.key) + '" data-week="' + weekIndex + '" data-day="' + dayIndex + '" aria-label="Workout menu">···</button>';
    html += "</div>";
    html += '<div class="row between" style="margin-bottom:12px">' + statusBadge(day.status, false);
    if (day.finishedAt) html += '<span class="small muted">' + esc(fmtDate(day.finishedAt)) + "</span>";
    html += "</div>";
    if (!editable) html += '<div class="lock">This mesocycle is finished. Sets are read-only.</div>';
    else if (locked) html += '<div class="lock">Deload stays locked until every earlier week is finished or skipped.</div>';
    else if (day.status === "pending" && !(day.exercises || []).some((ex) => (ex.sets || []).length)) {
      if (deload) html += '<div class="lock">These lifts were not programmed in the export. The coach line is a lighter deload estimate from week 1.</div>';
      else html += '<div class="lock">Exercises are listed. Sets are not programmed yet — add a set when you train. Nothing here is a made-up target.</div>';
    }
    if (deload) {
      html += '<div class="coach-banner" data-coach="deload-note">Deload week — lighter loads (~90% of week 1 on early days, ~50% later). Traps and forearms are optional; skip them if you want.</div>';
    }

    (day.exercises || []).forEach((ex) => {
      html += exerciseBlock(meso, day, ex, editable, locked, unit, rir);
    });

    if (editable && !locked) {
      html += '<div class="btn-row" style="margin-top:8px">';
      html += '<button class="btn" data-action="add-exercise" data-key="' + esc(meso.key) + '" data-week="' + weekIndex + '" data-day="' + dayIndex + '">Add exercise</button>';
      html += '<button class="btn primary" data-action="finish-day" data-key="' + esc(meso.key) + '" data-week="' + weekIndex + '" data-day="' + dayIndex + '">Finish workout</button>';
      html += "</div>";
    }
    const fb = (day.muscleGroups || []).filter((g) => g.pump != null || g.soreness != null || g.workload != null);
    if (fb.length) {
      html += '<div class="card"><strong>Muscle notes</strong>';
      fb.forEach((g) => {
        html += '<div class="small" style="margin-top:6px">' + chip(g.muscleGroupId) + " pump " + g.pump + " · sore " + g.soreness + " · work " + g.workload + "</div>";
      });
      html += "</div>";
    }
    return html;
  }

  function exerciseBlock(meso, day, ex, editable, locked, unit, rir) {
    const canEdit = editable && !locked;
    let html = '<section class="ex-card">';
    html += '<div class="ex-head"><div class="grow">' + chip(ex.muscleGroupId);
    html += '<div class="ex-name">' + esc(ex.name) + "</div>";
    const equip = state.equipByName[L.normName(ex.name)];
    html += '<div class="tiny muted">' + esc(equip || "") + (ex.jointPain ? " · joint " + ex.jointPain : "") + "</div></div>";
    html += '<a class="iconbtn" href="#/exercise/' + encodeURIComponent(ex.name) + '" aria-label="History">Hx</a>';
    if (canEdit) {
      html += '<button class="iconbtn" data-action="exercise-menu" data-key="' + esc(meso.key) + '" data-week="' + day.week + '" data-day="' + day.position + '" data-ex="' + esc(ex.id) + '" aria-label="Exercise menu">···</button>';
    }
    html += "</div>";
    html += coachBlock(meso, day, ex, unit);
    if (!(ex.sets || []).length) {
      html += '<div class="small muted" style="margin-top:8px">Exercise not programmed yet.</div>';
      if (canEdit) html += ghostRow(meso, day, ex, unit);
    } else {
      ex.sets.forEach((set, i) => {
        html += setRow(meso, day, ex, set, i, canEdit, unit, rir);
      });
    }
    if (ex.notes && ex.notes.length) {
      ex.notes.forEach((n) => { html += '<div class="tiny muted" style="margin-top:6px">' + esc(n.text || n) + "</div>"; });
    }
    return html + "</section>";
  }

  function ghostRow(meso, day, ex, unit) {
    const last = state.lastByName[L.normName(ex.name)];
    let weight = last ? trimNum(last.weight) : "";
    let repPlaceholder = "reps";
    let hint = "No target in the export.";
    if (last) hint = "Last logged " + trimNum(last.weight) + " " + (last.unit || unit) + " × " + last.reps + " · " + esc(last.meso);
    const deloadRec = L.isDeloadWeek(meso, day.week) ? sessionRecommendation(meso, day, ex, unit, "today") : null;
    if (deloadRec && deloadRec.weight != null) {
      weight = trimNum(deloadRec.weight);
      repPlaceholder = String(deloadRec.reps);
      hint = "Deload estimate " + trimNum(deloadRec.weight) + " " + unit + " × " + deloadRec.reps + ". " + coachPhrase(deloadRec);
    }
    return '<div class="set-row">' +
      '<span class="idx">1</span>' +
      '<input class="field" inputmode="decimal" data-focus="g-w-' + esc(ex.id) + '" data-ghost="weight" data-key="' + esc(meso.key) + '" data-week="' + day.week + '" data-day="' + day.position + '" data-ex="' + esc(ex.id) + '" placeholder="' + esc(unit) + '" value="' + esc(weight) + '">' +
      '<input class="field" inputmode="numeric" data-focus="g-r-' + esc(ex.id) + '" data-ghost="reps" data-key="' + esc(meso.key) + '" data-week="' + day.week + '" data-day="' + day.position + '" data-ex="' + esc(ex.id) + '" placeholder="' + esc(repPlaceholder) + '">' +
      '<button class="check" data-action="ghost-check" data-key="' + esc(meso.key) + '" data-week="' + day.week + '" data-day="' + day.position + '" data-ex="' + esc(ex.id) + '" aria-label="Log set">✓</button>' +
      '</div><div class="hint">' + hint + "</div>";
  }

  function setRow(meso, day, ex, set, index, canEdit, unit, rir) {
    if (set.status === "skipped" || set.reps === -1) {
      let line = '<div class="skipped-line">Set ' + (index + 1) + " skipped";
      if (canEdit) line += ' · <button class="textbtn ghost" data-action="undo-skip" data-key="' + esc(meso.key) + '" data-set="' + esc(set.id) + '">Undo</button>';
      return line + "</div>";
    }
    const done = set.status === "complete";
    const readOnly = !canEdit || done;
    let html = '<div class="set-row">';
    html += '<span class="idx">' + (index + 1) + "</span>";
    const ownRep = set.repsTarget != null && set.repsTarget !== "" ? Number(set.repsTarget) : null;
    html += '<input class="field" inputmode="decimal" data-focus="w-' + esc(set.id) + '" data-set="' + esc(set.id) + '" data-field="weight" data-key="' + esc(meso.key) + '" data-anchor-weight="' + esc(trimNum(set.weight)) + '"' + (ownRep != null ? ' data-anchor-reps="' + esc(String(ownRep)) + '"' : "") + ' placeholder="' + esc(unit) + '" value="' + esc(trimNum(set.weight)) + '"' + (readOnly ? " readonly" : "") + ">";
    const repPh = ownRep != null ? String(ownRep) : (rir != null && rir !== 8 ? rir + " RIR" : "reps");
    html += '<input class="field" inputmode="numeric" data-focus="r-' + esc(set.id) + '" data-set="' + esc(set.id) + '" data-field="reps" data-key="' + esc(meso.key) + '" placeholder="' + esc(repPh) + '" value="' + esc(set.reps == null || set.reps < 0 ? "" : trimNum(set.reps)) + '"' + (readOnly ? " readonly" : "") + ">";
    if (canEdit) {
      html += '<button class="check' + (done ? " on" : "") + '" data-action="toggle-set" data-key="' + esc(meso.key) + '" data-set="' + esc(set.id) + '" aria-label="Log set">✓</button>';
    } else {
      html += '<span class="check' + (done ? " on" : "") + '">✓</span>';
    }
    html += "</div>";
    const hint = recommendText(set, rir, unit);
    const typeNote = set.setType && set.setType !== "regular" ? set.setType : "";
    const fullHint = hint && typeNote ? hint + " · " + typeNote : (hint || typeNote);
    if (fullHint || (canEdit && !done)) {
      html += '<div class="hint" data-hint="' + esc(set.id) + '"' + (typeNote ? ' data-type-note="' + esc(typeNote) + '"' : "") + (fullHint ? "" : " hidden") + ">" + esc(fullHint) + "</div>";
    }
    if (canEdit && !done) html += '<div class="tradeoff" data-tradeoff="' + esc(set.id) + '" hidden></div>';
    return html;
  }

  function coachPhrase(rec) {
    const O = window.Overload;
    return O ? O.coachPhrase(rec) : "";
  }

  function sessionRecommendation(meso, day, ex, unit, kind, loggedNow) {
    const O = window.Overload;
    if (!O || !meso || !day) return null;
    return recommendFor(O, meso, day, ex, unit, kind, loggedNow);
  }

  function recommendFor(O, meso, day, ex, unit, kind, loggedNow) {
    const weekIndex = day.week;
    const dayIndex = day.position;
    if (weekIndex == null || dayIndex == null) return null;
    const equip = state.equipByName[L.normName(ex.name)] || "";
    const inc = O.equipmentIncrement(equip, unit);
    const opts = { equipment: equip, dayIndex: dayIndex, daysPerWeek: (meso.weeks[weekIndex] && meso.weeks[weekIndex].days.length) || 1, muscleGroupId: ex.muscleGroupId };
    if (kind === "next") {
      const nextIndex = weekIndex + 1;
      if (!meso.weeks[nextIndex]) return null;
      const nextRir = L.weekRir(meso, nextIndex);
      if (nextRir === 8) {
        const ref = O.weekOneReference(meso, ex.name, dayIndex);
        if (!ref.sets.length) return null;
        opts.daysPerWeek = meso.weeks[nextIndex].days.length || opts.daysPerWeek;
        return O.nextSessionRecommend(ref.sets, inc, 8, opts);
      }
      const logged = loggedNow || O.workingSets(ex.sets);
      if (!logged.length) return null;
      return O.nextSessionRecommend(logged, inc, nextRir, opts);
    }
    const rir = L.weekRir(meso, weekIndex);
    if (rir === 8) {
      const ref = O.weekOneReference(meso, ex.name, dayIndex);
      if (!ref.sets.length) return null;
      return O.nextSessionRecommend(ref.sets, inc, 8, opts);
    }
    const prior = O.findPriorLogged(meso, ex.name, weekIndex, dayIndex);
    if (!prior) return null;
    return O.nextSessionRecommend(prior.sets, inc, rir, opts);
  }

  function coachBlock(meso, day, ex, unit) {
    const O = window.Overload;
    if (!O) return "";
    const lines = [];
    if (L.isDeloadWeek(meso, day.week) && O.optionalDeloadSkip(ex.muscleGroupId)) {
      lines.push('<div class="coach skip" data-coach="skip" data-exercise="' + esc(ex.name) + '">Optional skip — traps and forearms on deload.</div>');
    }
    const today = recommendFor(O, meso, day, ex, unit, "today");
    if (today && today.weight != null) lines.push(coachLine(today.reason === "deload" ? "deload" : "today", today, unit, ex.name));
    const logged = O.workingSets(ex.sets);
    if (logged.length) {
      const next = recommendFor(O, meso, day, ex, unit, "next", logged);
      if (next && next.weight != null) lines.push(coachLine("next", next, unit, ex.name));
    }
    return lines.join("");
  }

  function coachLine(kind, rec, unit, name) {
    const phrase = coachPhrase(rec);
    const load = trimNum(rec.weight) + " " + unit + " × " + rec.reps;
    const label = kind === "next" ? "Next week" : (kind === "deload" ? "Deload" : "Coach");
    const cls = "coach" + (kind === "next" ? " next" : "") + (rec.reason === "deload" ? " deload" : "");
    let extra = "";
    if (rec.reason === "deload" && rec.sets) extra = ' <span class="why">· about ' + rec.sets + (rec.sets === 1 ? " set" : " sets") + "</span>";
    return '<div class="' + cls + '" data-coach="' + (kind === "next" ? "next" : "today") + '" data-reason="' + esc(rec.reason) + '" data-exercise="' + esc(name) + '"><span class="k">' + label + "</span> " + esc(load) + ' <span class="why">' + esc(phrase) + "</span>" + extra + "</div>";
  }

  function recommendText(set, rir, unit) {
    const bits = [];
    if (set.weightTargetMin != null && set.weightTargetMax != null) {
      bits.push("We recommend " + trimNum(set.weightTargetMin) + "–" + trimNum(set.weightTargetMax) + " " + unit);
    } else if (set.weightTarget != null) {
      bits.push("Target " + trimNum(set.weightTarget) + " " + unit);
    }
    if (set.repsTarget != null) bits.push(set.repsTarget + " reps");
    if (!bits.length && rir != null && set.status !== "complete") bits.push(rir === 8 ? "Deload week" : "Week target " + rir + " RIR");
    return bits.join(" · ");
  }

  function viewMesos() {
    const n = state.mesos.length;
    let html = '<div class="top"><div class="titles"><div class="kicker">Mesocycles</div><h1>' + n + " plans</h1>";
    html += '<div class="sub">' + state.seed.length + " from the export</div></div>";
    html += '<a class="iconbtn primary" href="#/plan" aria-label="Plan a mesocycle">+</a></div>';
    html += '<div data-testid="meso-count" data-count="' + state.seed.length + '"></div>';
    state.mesos.forEach((meso) => {
      const current = L.isCurrent(meso);
      const days = meso.weeks[0] ? meso.weeks[0].days.length : meso.days;
      html += '<a class="list-btn" href="#/meso/' + esc(meso.key) + '">';
      html += '<div class="row between"><strong>' + esc(meso.name) + "</strong>" + statusBadge(meso.status, current) + "</div>";
      html += '<div class="small muted" style="margin-top:4px">' + meso.weeks.length + " weeks · " + days + " days/week · " + esc(meso.unit || "lb") + "</div>";
      html += '<div class="tiny faint">' + (current ? "Started " : "Finished ") + esc(fmtDate(current ? meso.createdAt : (meso.finishedAt || meso.createdAt))) + "</div>";
      html += "</a>";
    });
    return html;
  }

  function viewMeso(key) {
    const meso = L.findMeso(state.mesos, key);
    if (!meso) return '<div class="empty">Mesocycle not found.</div>';
    const sum = L.mesoSummary(meso);
    const weekIndex = state.ui.mesoWeek[key] || 0;
    const week = meso.weeks[Math.min(weekIndex, meso.weeks.length - 1)];
    let html = '<div class="top"><a class="iconbtn" href="#/mesos" aria-label="Back">' + icon("back") + '</a><div class="titles"><div class="kicker">Mesocycle</div><h1>' + esc(meso.name) + "</h1>";
    html += '<div class="sub">' + meso.weeks.length + " weeks · " + (week ? week.days.length : meso.days) + " days/week</div></div>";
    html += '<button class="iconbtn" data-action="meso-menu" data-key="' + esc(key) + '" aria-label="Menu">···</button></div>';
    html += '<div class="row" style="gap:8px;margin-bottom:12px">' + statusBadge(meso.status, L.isCurrent(meso));
    html += '<span class="small muted">' + esc(meso.generatedFrom || "") + "</span></div>";
    html += '<div class="card"><div class="row between"><div><div class="tiny faint">Completed</div><strong>' + sum.completed + '</strong></div>';
    html += '<div><div class="tiny faint">Skipped</div><strong>' + sum.skipped + '</strong></div>';
    html += '<div><div class="tiny faint">Incomplete</div><strong>' + sum.incomplete + "</strong></div></div>";
    html += '<button class="btn slim" style="margin-top:10px" data-action="summary" data-key="' + esc(key) + '">Muscle and exercise stats</button></div>';
    html += '<div class="seg" style="margin-bottom:10px">';
    meso.weeks.forEach((w, i) => {
      const on = i === Math.min(weekIndex, meso.weeks.length - 1);
      const rir = L.weekRir(meso, i);
      html += '<button data-action="meso-week" data-key="' + esc(key) + '" data-week="' + i + '"' + (on ? ' class="on"' : "") + ">" + (rir === 8 ? "DL" : "Wk " + (i + 1)) + "</button>";
    });
    html += "</div>";
    (week.days || []).forEach((day, di) => {
      const sets = (day.exercises || []).reduce((n, ex) => n + (ex.sets || []).filter((s) => s.status === "complete").length, 0);
      const total = (day.exercises || []).reduce((n, ex) => n + (ex.sets || []).length, 0);
      html += '<a class="list-btn" href="#/workout/' + esc(key) + "/" + (Math.min(weekIndex, meso.weeks.length - 1) + 1) + "/" + (di + 1) + '">';
      html += '<div class="row between"><strong>Day ' + (di + 1) + (day.label ? " · " + esc(day.label) : "") + "</strong>" + statusBadge(day.status, false) + "</div>";
      html += '<div class="tiny muted">' + (day.exercises || []).length + " exercises · " + sets + "/" + total + " sets</div></a>";
    });
    if (meso.notes && meso.notes.length) {
      html += '<div class="card"><strong>Notes</strong>';
      meso.notes.forEach((n) => { html += '<div class="small" style="margin-top:6px">' + esc(n.text || n) + "</div>"; });
      html += "</div>";
    }
    return html;
  }

  function viewHistory() {
    const rows = L.historyRows(state.mesos);
    const counts = L.historyCounts(rows);
    const q = state.ui.historyQuery.trim().toLowerCase();
    let list = rows.filter((row) => {
      if (state.ui.historyStatus !== "all" && row.status !== state.ui.historyStatus) return false;
      if (!q) return true;
      const blob = (row.meso + " " + row.label + " " + row.muscles.join(" ")).toLowerCase();
      return blob.includes(q);
    });
    if (state.ui.historySort === "newest") list = list.slice().reverse();
    let html = '<div class="top"><div class="titles"><div class="kicker">History</div><h1>' + rows.length + ' workouts</h1></div></div>';
    html += '<div data-testid="history-count" data-count="' + rows.length + '"></div>';
    html += '<input class="search" data-focus="hist-q" data-ui="historyQuery" placeholder="Search meso, day, muscle" value="' + esc(state.ui.historyQuery) + '">';
    html += '<div class="seg" style="margin-bottom:8px">';
    [["all", "All"], ["complete", "Done"], ["skipped", "Skipped"], ["partial", "Partial"], ["ready", "Ready"], ["pending", "Open"]].forEach(([id, label]) => {
      const n = id === "all" ? rows.length : (counts[id] || 0);
      html += '<button data-action="hist-status" data-status="' + id + '"' + (state.ui.historyStatus === id ? ' class="on"' : "") + ">" + label + " " + n + "</button>";
    });
    html += "</div>";
    html += '<button class="textbtn" data-action="hist-sort">' + (state.ui.historySort === "newest" ? "Newest first" : "Oldest first") + "</button>";
    if (!list.length) html += '<div class="empty">No workouts match.</div>';
    list.forEach((row) => {
      html += '<a class="hist-row" href="#/workout/' + esc(row.mesoKey) + "/" + row.week + "/" + row.day + '">';
      html += '<div class="row between"><strong>' + esc(row.label || "Day " + row.day) + "</strong>" + statusBadge(row.status, false) + "</div>";
      html += '<div class="small">' + esc(row.meso) + " · W" + row.week + " D" + row.day + "</div>";
      html += '<div class="tiny muted">' + esc(row.date ? fmtDate(row.date) : "Not finished") + " · " + row.setsLogged + "/" + row.setsTotal + " sets";
      if (row.muscles.length) html += " · " + esc(row.muscles.join(", "));
      html += "</div></a>";
    });
    return html;
  }

  function viewPlan() {
    return '<div class="top"><a class="iconbtn" href="#/mesos" aria-label="Back">' + icon("back") + '</a><div class="titles"><div class="kicker">Plan</div><h1>Plan a mesocycle</h1></div></div>' +
      '<a class="option" href="#/plan/copy"><strong>Copy a mesocycle <span class="new">NEW</span></strong><span class="small muted">Keep training similar. Pick one of your mesos and a source week. Targets come from that week only.</span></a>' +
      '<a class="option" href="#/plan/template"><strong>Start with a template</strong><span class="small muted">Your custom 2026 Plan, a saved template, or a blank board named from the catalog. Built-in template workouts are not included.</span></a>' +
      '<a class="option" href="#/plan/builder"><strong>Meso builder <span class="tiny">lite</span></strong><span class="small muted">Choose days per week and which muscles to emphasize, grow, or maintain. Fill lifts from your library.</span></a>' +
      '<a class="option" href="#/board" data-action="scratch"><strong>Start from scratch</strong><span class="small muted">A blank board. Add days and muscle groups yourself.</span></a>';
  }

  function viewCopyList() {
    let html = '<div class="top"><a class="iconbtn" href="#/plan" aria-label="Back">' + icon("back") + '</a><div class="titles"><div class="kicker">Copy</div><h1>Copy a mesocycle</h1><div class="sub">Keep training similar over time.</div></div></div>';
    state.mesos.forEach((meso) => {
      const days = meso.weeks[0] ? meso.weeks[0].days.length : meso.days;
      html += '<a class="list-btn" href="#/plan/copy/' + esc(meso.key) + '"><div class="row between"><strong>' + esc(meso.name) + "</strong>" + statusBadge(meso.status, L.isCurrent(meso)) + "</div>";
      html += '<div class="small muted">' + meso.weeks.length + " weeks · " + days + " days/week</div></a>";
    });
    return html;
  }

  function viewCopyWeek(key) {
    const meso = L.findMeso(state.mesos, key);
    if (!meso) return '<div class="empty">Mesocycle not found.</div>';
    if (state.ui.copyKey !== key) {
      state.ui.copyKey = key;
      state.ui.copyWeek = Math.min(2, meso.weeks.length - 1);
    }
    const wi = Math.min(state.ui.copyWeek, meso.weeks.length - 1);
    const week = meso.weeks[wi];
    let html = '<div class="top"><a class="iconbtn" href="#/plan/copy" aria-label="Back">' + icon("back") + '</a><div class="titles"><div class="kicker">Source week</div><h1>' + esc(meso.name) + "</h1></div></div>";
    html += '<div class="seg" style="margin-bottom:8px">';
    meso.weeks.forEach((w, i) => {
      const rir = L.weekRir(meso, i);
      html += '<button data-action="copy-week-pick" data-week="' + i + '"' + (i === wi ? ' class="on"' : "") + ">" + (rir === 8 ? "DL" : "Wk " + (i + 1)) + "</button>";
    });
    html += '</div><p class="small muted">For a 4-week meso, week 3 is the usual accumulation week to copy. Weights and rep targets are whatever that week already has.</p>';
    html += '<div class="seg" style="margin:10px 0">';
    week.days.forEach((day, di) => {
      html += '<button data-action="copy-day-pick" data-day="' + di + '"' + ((state.ui.copyDay || 0) === di ? ' class="on"' : "") + ">" + esc(day.label ? day.label.slice(0, 3) : "D" + (di + 1)) + "</button>";
    });
    html += "</div>";
    const day = week.days[state.ui.copyDay || 0] || week.days[0];
    (day.exercises || []).forEach((ex, i) => {
      html += '<div class="row" style="margin-bottom:8px"><span class="tiny faint" style="width:18px">' + (i + 1) + "</span>" + chip(ex.muscleGroupId) + '<span>' + esc(ex.name) + "</span></div>";
    });
    html += '<button class="textbtn" data-action="priorities-info">Learn about muscle priorities</button>';
    html += '<button class="btn primary" style="margin-top:12px" data-action="do-copy" data-key="' + esc(key) + '" data-week="' + wi + '">Copy week ' + (wi + 1) + "</button>";
    return html;
  }

  function viewTemplates() {
    const filters = state.ui.templateFilters;
    const custom = (state.templates.custom_templates || []).concat(state.overlay.customTemplates || []);
    let catalog = state.templates.catalog || [];
    catalog = catalog.filter((t) => {
      if (filters.emphasis && String(t.emphasis).toLowerCase() !== filters.emphasis.toLowerCase()) return false;
      if (filters.sex && String(t.sex).toLowerCase() !== filters.sex.toLowerCase()) return false;
      if (filters.days && Number(t.days_per_week) !== Number(filters.days)) return false;
      if (filters.author === "Custom") return false;
      return true;
    });
    let html = '<div class="top"><a class="iconbtn" href="#/plan" aria-label="Back">' + icon("back") + '</a><div class="titles"><div class="kicker">Templates</div><h1>Start with a template</h1></div>';
    html += '<button class="textbtn" data-action="template-filters">Filters</button></div>';
    if (filters.author !== "RP Strength") {
      html += '<div class="tiny faint" style="margin-bottom:6px">YOUR TEMPLATES</div>';
      custom.forEach((t) => {
        html += '<a class="list-btn" href="#/plan/template/' + encodeURIComponent(t.key || t.name) + '"><strong>' + esc(t.name) + '</strong><div class="small muted">Custom · ' + (t.days_per_week || Object.keys(t.days || {}).length) + "/week</div></a>";
      });
    }
    html += '<div class="tiny faint" style="margin:10px 0 6px">CATALOG NAMES ONLY</div>';
    html += '<p class="small muted">Day-by-day exercises from built-in templates are not in this app. You can start a blank board with the same number of days.</p>';
    catalog.forEach((t, i) => {
      html += '<a class="list-btn" href="#/plan/template/' + encodeURIComponent("catalog:" + i + ":" + t.name) + '"><div class="row between"><strong>' + esc(t.name) + '</strong><span class="badge">' + esc(t.sex || "") + "</span></div>";
      html += '<div class="small muted">' + esc(t.emphasis || "") + " · " + t.days_per_week + "/week</div></a>";
    });
    return html;
  }

  function findTemplate(id) {
    const custom = (state.templates.custom_templates || []).concat(state.overlay.customTemplates || []);
    const hit = custom.find((t) => t.key === id || t.name === id);
    if (hit) return { kind: "custom", tpl: hit };
    if (id.indexOf("catalog:") === 0) {
      const name = id.split(":").slice(2).join(":");
      const tpl = (state.templates.catalog || []).find((t) => t.name === name);
      if (tpl) return { kind: "catalog", tpl: tpl };
    }
    return null;
  }

  function viewTemplate(id) {
    const found = findTemplate(id);
    if (!found) return '<div class="empty">Template not found.</div>';
    const t = found.tpl;
    if (found.kind === "catalog") {
      return '<div class="top"><a class="iconbtn" href="#/plan/template" aria-label="Back">' + icon("back") + '</a><div class="titles"><div class="kicker">' + esc(t.emphasis || "Template") + "</div><h1>" + esc(t.name) + "</h1></div></div>" +
        '<div class="card">This catalog entry is a name, emphasis, and ' + t.days_per_week + ' days per week. The workout contents are not included.</div>' +
        '<button class="btn primary" data-action="blank-from-catalog" data-days="' + t.days_per_week + '" data-name="' + esc(t.name) + '">Start blank board (' + t.days_per_week + " days)</button>";
    }
    const keys = Object.keys(t.days || {});
    if (state.ui.tplDay == null || !keys[state.ui.tplDay]) state.ui.tplDay = 0;
    let html = '<div class="top"><a class="iconbtn" href="#/plan/template" aria-label="Back">' + icon("back") + '</a><div class="titles"><div class="kicker">Custom</div><h1>' + esc(t.name) + "</h1></div></div>";
    html += '<div class="seg" style="margin-bottom:10px">';
    keys.forEach((k, i) => {
      html += '<button data-action="tpl-day" data-day="' + i + '"' + (i === state.ui.tplDay ? ' class="on"' : "") + ">" + esc(k) + "</button>";
    });
    html += "</div>";
    (t.days[keys[state.ui.tplDay]] || []).forEach((item) => {
      const idn = L.MUSCLE_ID[item.muscle];
      html += '<div class="row" style="margin-bottom:8px"><span class="tiny faint" style="width:18px">' + item.position + "</span>" + (idn ? chip(idn) : esc(item.muscle)) + "<span>" + esc(item.exercise) + "</span></div>";
    });
    html += '<button class="btn primary" style="margin-top:12px" data-action="use-template" data-id="' + esc(t.key || t.name) + '">Plan a new mesocycle</button>';
    return html;
  }

  function viewBuilder() {
    let html = '<div class="top"><a class="iconbtn" href="#/plan" aria-label="Back">' + icon("back") + '</a><div class="titles"><div class="kicker">Builder</div><h1>Training frequency</h1><div class="sub">How many days per week can you consistently train?</div></div></div>';
    html += '<div class="seg">';
    [2, 3, 4, 5, 6].forEach((n) => {
      html += '<button data-action="builder-days" data-days="' + n + '"' + (state.builder.days === n ? ' class="on"' : "") + ">" + n + "</button>";
    });
    html += '</div><button class="btn primary" style="margin-top:16px" data-action="builder-continue">Continue</button>';
    return html;
  }

  function viewBuilderPriorities() {
    const tab = state.builder.tab;
    const list = state.builder[tab] || [];
    const copy = {
      emphasize: "Prioritize these muscle groups for maximum growth, potentially adding a high amount of volume if you're responding and recovering well.",
      grow: "Grow these, and only add volume when you need it. Stay near the low end of the useful range.",
      maintain: "Keep these muscles with maintenance work only."
    };
    let html = '<div class="top"><a class="iconbtn" href="#/plan/builder" aria-label="Back">' + icon("back") + '</a><div class="titles"><div class="kicker">Builder</div><h1>Muscle group priorities</h1></div></div>';
    html += '<div class="tabs">';
    ["emphasize", "grow", "maintain"].forEach((name) => {
      html += '<button class="btn slim' + (tab === name ? " primary" : "") + '" data-action="builder-tab" data-tab="' + name + '">' + name[0].toUpperCase() + name.slice(1) + " (" + state.builder[name].length + ")</button>";
    });
    html += '</div><p class="small muted">' + copy[tab] + "</p>";
    html += '<div class="tiny faint" style="margin:8px 0">PRIORITY (HIGH TO LOW)</div>';
    if (!list.length) html += '<div class="empty">None yet. Add muscle groups.</div>';
    list.forEach((id, i) => {
      html += '<div class="row between card" style="padding:10px"><div class="row">' + chip(id) + "</div><div>";
      html += '<button class="textbtn" data-action="prio-move" data-dir="-1" data-index="' + i + '" aria-label="Move up">↑</button>';
      html += '<button class="textbtn" data-action="prio-move" data-dir="1" data-index="' + i + '" aria-label="Move down">↓</button>';
      html += '<button class="textbtn" data-action="prio-remove" data-index="' + i + '">Remove</button></div></div>';
    });
    html += '<button class="btn" data-action="clear-prio">Clear all</button>';
    html += '<button class="btn primary" style="margin-top:8px" data-action="builder-build">Next</button>';
    html += '<button class="iconbtn primary" style="position:fixed;right:16px;bottom:calc(var(--nav) + var(--safe-b) + 16px);width:52px;height:52px;border-radius:50%;font-size:28px" data-action="open-muscles" aria-label="Add muscle groups">+</button>';
    return html;
  }

  function viewBuilderWorking() {
    return '<div class="empty"><h1>Getting everything ready</h1><p>Building your mesocycle…</p></div>';
  }

  function viewBoard() {
    loadBoard();
    if (!state.board) state.board = L.blankBoard();
    const board = state.board;
    let html = '<div class="top"><a class="iconbtn" href="#/plan" aria-label="Back">' + icon("back") + '</a><div class="titles"><div class="kicker">' + esc(board.subtitle || "Board") + "</div><h1>" + esc(board.title || "New workout plan") + "</h1></div>";
    html += '<button class="iconbtn" data-action="board-menu" aria-label="Board menu">···</button></div>';
    if (board.targetsIncluded) html += '<div class="lock">Targets included from ' + esc(board.subtitle || "the source week") + ". Later weeks stay empty until you log them.</div>";
    html += '<div class="btn-row" style="margin-bottom:10px">';
    html += '<button class="btn" data-action="open-autofill">Autofill exercises</button>';
    html += '<button class="btn" data-action="clear-exercises">Clear exercises</button></div>';
    html += '<div class="board">';
    board.days.forEach((day, di) => {
      html += '<div class="day-col" data-drop="day:' + di + '">';
      html += '<div class="row between"><span class="tiny faint" draggable="true" data-drag="day:' + di + '">Drag</span>';
      html += '<select class="field" style="width:auto;padding:6px" data-change="day-label" data-day="' + di + '">';
      html += '<option value="">Label</option>';
      L.WEEKDAYS.forEach((wd) => {
        html += '<option value="' + wd + '"' + (day.label === wd ? " selected" : "") + ">" + wd + "</option>";
      });
      html += "</select>";
      html += '<button class="textbtn" data-action="remove-day" data-day="' + di + '" aria-label="Delete day">✕</button></div>';
      day.slots.forEach((slot, si) => {
        const sum = L.slotSummary(slot);
        html += '<div class="slot" draggable="true" data-drag="slot:' + di + ":" + si + '" data-drop="slot:' + di + ":" + si + '">';
        html += '<div class="row between">' + chip(slot.muscleGroupId) + '<span class="priority">' + esc(slot.priority || "") + "</span></div>";
        html += '<button class="choose" data-action="pick-exercise" data-day="' + di + '" data-slot="' + si + '">' + esc(slot.exerciseName || "Choose an exercise") + "</button>";
        if (sum && sum.weight != null) html += '<div class="tiny muted">' + sum.sets + " sets · " + trimNum(sum.weight) + (board.sourceUnit ? " " + esc(board.sourceUnit) : "") + (sum.reps != null ? " · " + sum.reps + " reps" : "") + "</div>";
        else html += '<div class="tiny faint">Manual</div>';
        html += '<div class="row">';
        html += '<button class="textbtn" data-action="move-slot" data-day="' + di + '" data-slot="' + si + '" data-dir="-1">↑</button>';
        html += '<button class="textbtn" data-action="move-slot" data-day="' + di + '" data-slot="' + si + '" data-dir="1">↓</button>';
        html += '<button class="textbtn" data-action="remove-slot" data-day="' + di + '" data-slot="' + si + '">Remove</button></div></div>';
      });
      html += '<button class="btn" data-action="add-muscle" data-day="' + di + '">Add a muscle group</button></div>';
    });
    html += '<button class="day-col" data-action="add-day" style="display:flex;align-items:center;justify-content:center;font-weight:700">Add a day</button>';
    html += "</div>";
    html += '<button class="btn primary" data-action="open-create">Create mesocycle</button>';
    return html;
  }

  function viewExercises() {
    const q = state.ui.exerciseQuery.trim().toLowerCase();
    const list = state.library.filter((ex) => {
      if (state.ui.exerciseMuscle !== "all" && ex.muscle !== state.ui.exerciseMuscle) return false;
      if (state.ui.exerciseEquip !== "all" && ex.equipment !== state.ui.exerciseEquip) return false;
      if (!q) return true;
      return (ex.name + " " + ex.muscle + " " + (ex.equipment || "")).toLowerCase().includes(q);
    });
    const equips = Array.from(new Set(state.library.map((e) => e.equipment).filter(Boolean))).sort();
    let html = '<div class="top"><div class="titles"><div class="kicker">Exercises</div><h1>' + state.libraryRaw.length + " lifts</h1></div>";
    html += '<button class="iconbtn primary" data-action="custom-exercise" aria-label="Custom exercise">+</button></div>';
    html += '<div data-testid="exercise-count" data-count="' + state.libraryRaw.length + '"></div>';
    html += '<input class="search" data-focus="ex-q" data-ui="exerciseQuery" placeholder="Search" value="' + esc(state.ui.exerciseQuery) + '">';
    html += '<div class="row" style="margin-bottom:8px"><select class="field" data-change="exerciseMuscle"><option value="all">All muscles</option>';
    Object.keys(L.MUSCLE_ID).forEach((name) => {
      html += '<option value="' + esc(name) + '"' + (state.ui.exerciseMuscle === name ? " selected" : "") + ">" + esc(name) + "</option>";
    });
    html += '</select><select class="field" data-change="exerciseEquip"><option value="all">All equipment</option>';
    equips.forEach((eq) => {
      html += '<option value="' + esc(eq) + '"' + (state.ui.exerciseEquip === eq ? " selected" : "") + ">" + esc(eq) + "</option>";
    });
    html += "</select></div>";
    html += '<div class="tiny muted" style="margin-bottom:8px">' + list.length + " shown</div>";
    list.forEach((ex) => {
      const last = state.lastByName[L.normName(ex.name)];
      const when = last && last.date ? fmtDate(last.date) : (ex.last_performed || "");
      html += '<a class="ex-row" href="#/exercise/' + encodeURIComponent(ex.name) + '"><div class="row between"><strong>' + esc(ex.name) + "</strong>";
      if (when) html += '<span class="badge">' + esc(when) + "</span>";
      html += "</div><div class=\"small muted\">" + esc(ex.muscle) + (ex.equipment ? " · " + esc(ex.equipment) : "") + "</div></a>";
    });
    return html;
  }

  function viewExercise(name) {
    const lib = state.library.find((ex) => L.normName(ex.name) === L.normName(name));
    const rows = L.exerciseHistory(state.mesos, name, lib && lib.exercise_id);
    let html = '<div class="top"><a class="iconbtn" href="#/exercises" aria-label="Back">' + icon("back") + '</a><div class="titles"><div class="kicker">' + esc(lib ? lib.muscle : "Exercise") + "</div><h1>" + esc(name) + "</h1>";
    html += '<div class="sub">' + esc(lib ? lib.equipment || "" : "") + "</div></div></div>";
    if (!rows.length) html += '<div class="empty">No logged sets for this exercise yet.</div>';
    rows.forEach((row) => {
      html += '<div class="card"><div class="row between"><strong>' + esc(row.meso) + "</strong><span class=\"tiny muted\">W" + row.week + " D" + row.day + "</span></div>";
      html += '<div class="tiny muted">' + esc(row.date ? fmtDate(row.date) : "Not finished") + (row.label ? " · " + esc(row.label) : "") + "</div>";
      html += '<div class="small" style="margin-top:6px">' + row.sets.map((s) => {
        if (s.status === "skipped" || s.reps === -1) return "skipped";
        if (s.reps == null) return (s.weight != null ? trimNum(s.weight) : "—") + " × —";
        return trimNum(s.weight) + " × " + trimNum(s.reps);
      }).join(" · ") + "</div></div>";
    });
    return html;
  }

  function bodyweightEntries() {
    return L.mergeBodyweight(state.bwSeed, state.overlay.bodyweights);
  }

  function viewBodyweight() {
    const entries = bodyweightEntries();
    let html = '<div class="top"><a class="iconbtn" href="#/data" aria-label="Back">' + icon("back") + '</a><div class="titles"><div class="kicker">Bodyweight</div><h1>' + entries.length + " entries</h1></div>";
    html += '<button class="iconbtn primary" data-action="add-bw" aria-label="Add bodyweight">+</button></div>';
    html += '<div data-testid="bw-count" data-count="' + state.bwSeed.length + '"></div>';
    html += chartSvg(entries);
    entries.slice().reverse().forEach((e) => {
      html += '<div class="list-btn"><div class="row between"><strong>' + trimNum(e.bodyweight) + " " + esc(e.unit || "lb") + "</strong><span class=\"small muted\">" + esc(fmtDate(e.date)) + "</span></div></div>";
    });
    return html;
  }

  function chartSvg(entries) {
    if (entries.length < 2) return "";
    const vals = entries.map((e) => Number(e.bodyweight));
    const min = Math.min.apply(null, vals);
    const max = Math.max.apply(null, vals);
    const span = max - min || 1;
    const w = 320;
    const h = 150;
    const pts = vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * (w - 16) + 8;
      const y = h - 16 - ((v - min) / span) * (h - 32);
      return x + "," + y;
    }).join(" ");
    return '<svg class="chart" viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="Bodyweight chart"><polyline fill="none" stroke="#ff3b30" stroke-width="2" points="' + pts + '"/></svg>' +
      '<div class="tiny muted" style="margin-bottom:8px">' + trimNum(min) + "–" + trimNum(max) + " lb</div>";
  }

  function viewData() {
    const hist = L.historyRows(state.mesos).length;
    let html = '<div class="top"><div class="titles"><div class="kicker">More</div><h1>Data</h1></div></div>';
    html += '<a class="option" href="#/bodyweight"><strong>Bodyweight</strong><span class="small muted">' + bodyweightEntries().length + " weigh-ins. " + state.bwSeed.length + " from the export.</span></a>";
    html += '<div class="card"><strong>On this phone</strong><div class="small muted" style="margin-top:6px">Seed mesocycles: <span data-testid="seed-mesos">' + state.seed.length + "</span><br>Showing: " + state.mesos.length + "<br>History rows: <span data-testid=\"history-live\">" + hist + "</span><br>Exercise library: " + state.libraryRaw.length + "</div></div>";
    html += '<button class="btn" data-action="export-backup">Export backup JSON</button>';
    html += '<label class="btn" style="display:block;text-align:center;margin-top:8px">Import JSON<input id="import-file" type="file" accept="application/json,.json" class="hidden"></label>';
    html += '<button class="btn danger" style="margin-top:8px" data-action="reset-local">Reset local logs</button>';
    html += '<div class="card" style="margin-top:12px"><strong>Auto-match weights</strong><div class="small muted">When a set weight changes, later sets that had the same weight update with it.</div>';
    html += '<button class="btn slim" style="margin-top:8px" data-action="toggle-automatch">' + (state.overlay.settings.autoMatch ? "On" : "Off") + "</button></div>";
    html += '<div class="card"><strong>Preferred equipment</strong><div class="small muted">Used when you autofill a new board.</div>';
    html += '<button class="btn slim" style="margin-top:8px" data-action="toggle-preferred">' + (state.overlay.settings.usePreferred ? "Filter on" : "Filter off") + "</button>";
    html += '<div class="wrap" style="margin-top:8px">';
    L.EQUIPMENT_TYPES.forEach((type) => {
      const on = (state.overlay.settings.preferredTypes || []).indexOf(type) !== -1;
      html += '<button class="btn slim' + (on ? " primary" : "") + '" data-action="toggle-type" data-type="' + esc(type) + '">' + esc(type) + "</button>";
    });
    html += "</div></div>";
    return html;
  }

  function modalHtml() {
    const m = state.modal;
    if (!m) return "";
    let inner = "";
    if (m.type === "create") inner = createModal();
    else if (m.type === "calendar") inner = calendarModal();
    else if (m.type === "workout-menu") inner = workoutMenu();
    else if (m.type === "exercise-menu") inner = exerciseMenu();
    else if (m.type === "meso-menu") inner = mesoMenu();
    else if (m.type === "board-menu") inner = boardMenu();
    else if (m.type === "picker") inner = pickerModal();
    else if (m.type === "muscles") inner = musclesModal();
    else if (m.type === "slot-priorities") inner = slotPriorityModal();
    else if (m.type === "note") inner = noteModal();
    else if (m.type === "relabel") inner = relabelModal();
    else if (m.type === "rename") inner = renameModal();
    else if (m.type === "bw") inner = bwModal();
    else if (m.type === "summary") inner = summaryModal();
    else if (m.type === "overload") inner = overloadModal();
    else if (m.type === "autofill") inner = autofillModal();
    else if (m.type === "start-day") inner = startDayModal();
    else if (m.type === "filters") inner = filtersModal();
    else if (m.type === "confirm") inner = confirmModal();
    else if (m.type === "feedback") inner = feedbackModal();
    else if (m.type === "joint") inner = jointModal();
    else if (m.type === "custom-ex") inner = customExModal();
    else if (m.type === "info") inner = '<h2>' + esc(m.title || "") + '</h2><p class="small muted">' + esc(m.body || "") + '</p><button class="btn primary" data-action="close-modal">OK</button>';
    else if (m.type === "builder-muscles") inner = builderMusclesModal();
    return '<div class="backdrop" data-action="close-modal"><div class="sheet" data-sheet>' + inner + "</div></div>";
  }

  function createModal() {
    const b = state.board || {};
    const name = (state.modal.name != null ? state.modal.name : (b.title || "New meso plan"));
    const weeks = state.modal.weeks || 4;
    const unit = state.modal.unit || "lb";
    let html = "<h2>Create your mesocycle</h2>";
    html += '<label class="lbl">Mesocycle name</label><input class="field" data-focus="meso-name" data-modal="name" value="' + esc(name) + '">';
    html += '<div class="lbl" style="margin-top:12px">How many weeks will you train (including deload)?</div><div class="seg">';
    [4, 5, 6, 7, 8].forEach((n) => {
      html += '<button data-action="create-weeks" data-weeks="' + n + '"' + (weeks === n ? ' class="on"' : "") + ">" + n + "</button>";
    });
    html += '</div><p class="tiny muted">Week targets ' + L.rirForWeeks(weeks).map((n) => n === 8 ? "DL" : n).join(", ") + ". The 7-week sequence sits between your 6- and 8-week mesos. No weights are generated for later weeks.</p>";
    html += '<div class="lbl">Units</div><div class="seg">';
    ["lb", "kg"].forEach((u) => {
      html += '<button data-action="create-unit" data-unit="' + u + '"' + (unit === u ? ' class="on"' : "") + ">" + u + "</button>";
    });
    html += "</div>";
    if (b.targetsIncluded && b.sourceUnit && b.sourceUnit !== unit) {
      html += '<p class="small muted">The copied week is in ' + esc(b.sourceUnit) + ". Weights will be left blank so nothing is converted.</p>";
    }
    html += '<div class="btn-row" style="margin-top:14px"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="confirm-create">Create</button></div>';
    return html;
  }

  function calendarModal() {
    const meso = L.findMeso(state.mesos, state.modal.key);
    if (!meso) return "";
    let html = "<h2>" + esc(meso.name) + "</h2>";
    meso.weeks.forEach((week, wi) => {
      const rir = L.weekRir(meso, wi);
      html += '<div class="tiny faint" style="margin-top:8px">' + (rir === 8 ? "DELOAD" : "WEEK " + (wi + 1)) + (rir != null && rir !== 8 ? " · " + rir + " RIR" : "") + "</div><div class=\"wrap\">";
      week.days.forEach((day, di) => {
        html += '<a class="btn slim" href="#/workout/' + esc(meso.key) + "/" + (wi + 1) + "/" + (di + 1) + '">' + esc((day.label || "D" + (di + 1)).slice(0, 3)) + " · " + esc(day.status) + "</a>";
      });
      html += "</div>";
    });
    return html;
  }

  function workoutMenu() {
    const loc = L.locateDay(state.mesos, state.modal.key, state.modal.week, state.modal.day);
    if (!loc) return "";
    const edit = L.isEditable(loc.meso);
    let html = "<h2>Workout</h2>";
    html += '<button class="menu-item" data-action="open-note" data-scope="day">New note</button>';
    if (edit) {
      html += '<button class="menu-item" data-action="open-relabel">Relabel</button>';
      html += '<button class="menu-item" data-action="add-exercise">Add exercise</button>';
      html += '<button class="menu-item" data-action="open-bw-day">Bodyweight</button>';
      html += '<button class="menu-item" data-action="reset-day">Reset day</button>';
      html += '<button class="menu-item" data-action="skip-day">Skip workout</button>';
    }
    html += '<button class="menu-item" data-action="close-modal">Close</button>';
    return html;
  }

  function exerciseMenu() {
    return '<h2>Exercise</h2>' +
      '<button class="menu-item" data-action="open-note" data-scope="exercise">New note</button>' +
      '<button class="menu-item" data-action="move-ex" data-dir="1">Move down</button>' +
      '<button class="menu-item" data-action="replace-ex">Replace</button>' +
      '<button class="menu-item" data-action="open-joint">Joint pain</button>' +
      '<button class="menu-item" data-action="add-set">Add set</button>' +
      '<button class="menu-item" data-action="skip-sets">Skip remaining sets</button>' +
      '<button class="menu-item" data-action="remove-ex">Remove exercise</button>' +
      '<button class="menu-item" data-action="close-modal">Close</button>';
  }

  function mesoMenu() {
    const meso = L.findMeso(state.mesos, state.modal.key);
    if (!meso) return "";
    let html = "<h2>" + esc(meso.name) + "</h2>";
    html += '<button class="menu-item" data-action="open-note" data-scope="meso">New note</button>';
    if (L.isEditable(meso)) html += '<button class="menu-item" data-action="open-rename">Rename</button>';
    html += '<a class="menu-item" href="#/plan/copy/' + esc(meso.key) + '">Copy mesocycle</a>';
    html += '<button class="menu-item" data-action="summary" data-key="' + esc(meso.key) + '">Summary</button>';
    html += '<button class="menu-item" data-action="save-meso-template">Save as template</button>';
    if (L.isEditable(meso)) html += '<button class="menu-item" data-action="end-meso">End meso</button>';
    if (meso.local) html += '<button class="menu-item" data-action="delete-meso">Delete meso</button>';
    html += '<button class="menu-item" data-action="close-modal">Close</button>';
    return html;
  }

  function boardMenu() {
    return "<h2>Board</h2>" +
      '<button class="menu-item" data-action="open-autofill">Autofill exercises</button>' +
      '<button class="menu-item" data-action="add-day">Add a day</button>' +
      '<button class="menu-item" data-action="open-start-day">Update start day</button>' +
      '<button class="menu-item" data-action="edit-board-priorities">Muscle priorities</button>' +
      '<button class="menu-item" data-action="save-board-template">Save as template</button>' +
      '<button class="menu-item" data-action="clear-exercises">Clear exercises</button>' +
      '<button class="menu-item" data-action="reset-board">Reset board</button>' +
      '<button class="menu-item" data-action="close-modal">Close</button>';
  }

  function pickerModal() {
    const m = state.modal;
    const muscle = m.muscleGroupId ? L.MUSCLES[m.muscleGroupId] : "";
    const q = (state.ui.pickerQuery || "").trim().toLowerCase();
    let list = state.library.filter((ex) => {
      if (muscle && ex.muscle !== muscle) return false;
      if (state.overlay.settings.usePreferred && !L.equipmentMatches(ex.equipment, state.overlay.settings.preferredTypes)) return false;
      if (!q) return true;
      return (ex.name + " " + ex.equipment).toLowerCase().includes(q);
    });
    list = list.slice().sort((a, b) => {
      const la = state.lastByName[L.normName(a.name)];
      const lb = state.lastByName[L.normName(b.name)];
      return String(lb && lb.t || "").localeCompare(String(la && la.t || ""));
    }).slice(0, 80);
    let html = "<h2>Exercises</h2>";
    html += '<input class="search" data-focus="picker-q" data-ui="pickerQuery" placeholder="Search" value="' + esc(state.ui.pickerQuery) + '">';
    if (muscle) html += '<div style="margin-bottom:8px">' + chip(m.muscleGroupId) + "</div>";
    list.forEach((ex) => {
      const on = state.ui.pickerId === ex.name;
      const last = state.lastByName[L.normName(ex.name)];
      html += '<button class="option" data-action="choose-ex" data-name="' + esc(ex.name) + '" data-id="' + esc(ex.exercise_id || "") + '"><div class="row"><span class="radio' + (on ? " on" : "") + '"></span><div class="grow"><strong>' + esc(ex.name) + '</strong><div class="tiny muted">' + esc(ex.muscle) + " · " + esc(ex.equipment || "") + (last ? " · " + esc(fmtDate(last.date)) : "") + "</div></div>";
      html += '<a href="#/exercise/' + encodeURIComponent(ex.name) + '">›</a></div></button>';
    });
    html += '<div class="btn-row"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="confirm-ex">Select</button></div>';
    return html;
  }

  function musclesModal() {
    const counts = state.modal.counts || {};
    let html = "<h2>Choose muscle groups</h2><p class=\"small muted\">Tap + to add the same muscle more than once.</p>";
    L.CATEGORIES.forEach((cat) => {
      html += '<div class="tiny faint" style="margin-top:8px">' + esc(cat.name).toUpperCase() + "</div>";
      cat.ids.forEach((id) => {
        const n = counts[id] || 0;
        html += '<div class="row between" style="padding:6px 0">' + chip(id) + '<span class="counter"><button data-action="count-muscle" data-id="' + id + '" data-dir="-1">−</button><strong>' + n + '</strong><button data-action="count-muscle" data-id="' + id + '" data-dir="1">+</button></span></div>';
      });
    });
    html += '<button class="btn primary" data-action="muscles-next">Add muscle groups</button>';
    return html;
  }

  function slotPriorityModal() {
    const items = state.modal.items || [];
    let html = "<h2>Set muscle priorities</h2>";
    items.forEach((item, i) => {
      html += '<div class="row between" style="margin-bottom:8px">' + chip(item.muscleGroupId);
      html += '<select class="field" style="width:auto" data-change="slot-priority" data-index="' + i + '">';
      ["emphasize", "grow", "maintain"].forEach((p) => {
        html += '<option value="' + p + '"' + (item.priority === p ? " selected" : "") + ">" + p[0].toUpperCase() + p.slice(1) + "</option>";
      });
      html += "</select></div>";
    });
    html += '<p class="tiny muted">Emphasize: add volume when you are recovering. Grow: add volume only when needed. Maintain: keep them ticking over.</p>';
    html += '<div class="btn-row"><button class="btn" data-action="' + (state.modal.boardEdit ? "close-modal" : "back-muscles") + '">' + (state.modal.boardEdit ? "Cancel" : "Back") + '</button><button class="btn primary" data-action="confirm-slots">Confirm</button></div>';
    return html;
  }

  function builderMusclesModal() {
    const selected = {};
    (state.modal.picked || state.builder[state.builder.tab] || []).forEach((id) => { selected[id] = true; });
    let html = "<h2>Choose muscle groups</h2>";
    L.CATEGORIES.forEach((cat) => {
      html += '<div class="tiny faint" style="margin-top:8px">' + esc(cat.name).toUpperCase() + "</div>";
      cat.ids.forEach((id) => {
        const on = !!selected[id];
        html += '<button class="option" data-action="toggle-builder-muscle" data-id="' + id + '"><div class="row"><span class="radio' + (on ? " on" : "") + '"></span>' + chip(id) + "</div></button>";
      });
    });
    html += '<div class="btn-row"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="add-builder-muscles">Add muscle groups</button></div>';
    return html;
  }

  function noteModal() {
    return '<h2>Note</h2><textarea class="field" rows="4" data-focus="note-text" data-modal="text" placeholder="Note"></textarea><div class="btn-row" style="margin-top:10px"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="save-note">Save</button></div>';
  }

  function relabelModal() {
    let html = "<h2>Relabel day</h2><div class=\"seg\">";
    L.WEEKDAYS.forEach((wd) => {
      html += '<button data-action="set-label" data-label="' + wd + '">' + wd.slice(0, 3) + "</button>";
    });
    return html + "</div>";
  }

  function renameModal() {
    const meso = L.findMeso(state.mesos, state.modal.key);
    return '<h2>Rename</h2><input class="field" data-focus="rename" data-modal="name" value="' + esc(meso ? meso.name : "") + '"><div class="btn-row" style="margin-top:10px"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="save-rename">Save</button></div>';
  }

  function bwModal() {
    const today = new Date().toISOString().slice(0, 10);
    return '<h2>Bodyweight</h2><label class="lbl">Date</label><input class="field" type="date" data-modal="date" value="' + esc(state.modal.date || today) + '"><label class="lbl" style="margin-top:8px">Weight</label><input class="field" inputmode="decimal" data-focus="bw-val" data-modal="weight" placeholder="lb"><div class="btn-row" style="margin-top:10px"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="save-bw">Save</button></div>';
  }

  function summaryModal() {
    const meso = L.findMeso(state.mesos, state.modal.key);
    if (!meso) return "";
    const sum = L.mesoSummary(meso);
    const mode = state.ui.summaryMode;
    let html = '<div class="row"><button class="iconbtn" data-action="close-modal" aria-label="Back">' + icon("back") + "</button><h2 style=\"margin:0\">Summary</h2></div>";
    html += '<div class="tabs"><button class="btn slim' + (mode === "muscles" ? " primary" : "") + '" data-action="sum-mode" data-mode="muscles">Muscle groups</button>';
    html += '<button class="btn slim' + (mode === "exercises" ? " primary" : "") + '" data-action="sum-mode" data-mode="exercises">Exercises</button></div>';
    if (mode === "muscles") {
      for (let id = 1; id <= 12; id++) {
        const arr = sum.muscles[id] || [];
        const total = arr.reduce((a, b) => a + b, 0);
        if (!total) continue;
        const max = Math.max.apply(null, arr.concat([1]));
        html += '<div style="margin-bottom:10px">' + chip(id) + '<span class="tiny muted"> avg ' + trimNum(total / arr.length) + " sets</span>";
        html += '<div class="bars">';
        arr.forEach((n) => {
          html += '<div class="bar" style="height:' + Math.max(4, (n / max) * 76) + 'px"><span>' + n + "</span></div>";
        });
        html += '</div><div class="bar-label">';
        arr.forEach((n, i) => {
          const rir = L.weekRir(meso, i);
          html += "<span>" + (rir === 8 ? "DL" : "W" + (i + 1)) + "</span>";
        });
        html += "</div></div>";
      }
    } else {
      html += '<div class="seg">';
      meso.weeks.forEach((w, i) => {
        html += '<button data-action="sum-week" data-week="' + i + '"' + (state.ui.summaryWeek === i ? ' class="on"' : "") + ">W" + (i + 1) + "</button>";
      });
      html += "</div>";
      const week = meso.weeks[state.ui.summaryWeek] || meso.weeks[0];
      (week.days || []).forEach((day, di) => {
        html += '<div class="tiny faint" style="margin-top:8px">DAY ' + (di + 1) + " " + esc(day.label || "") + "</div>";
        (day.exercises || []).forEach((ex) => {
          const reps = (ex.sets || []).map((s) => s.status === "skipped" || s.reps === -1 ? "skip" : (s.reps == null ? "—" : trimNum(s.reps))).join(", ");
          const weights = (ex.sets || []).map((s) => s.weight == null ? "—" : trimNum(s.weight)).join(", ");
          html += '<div class="small" style="margin:4px 0"><strong>' + esc(ex.name) + "</strong><div class=\"tiny muted\">" + esc(weights) + " · reps " + esc(reps) + "</div></div>";
        });
      });
    }
    return html;
  }

  function overloadModal() {
    return "<h2>Meso to meso overload</h2><p class=\"small\">When you copy an accumulation week, week 1 keeps that week's load and rep targets. Later weeks stay empty until you log them.</p><p class=\"small muted\">After a logged session, the coach suggests next week: a small load bump, or the same weight plus one rep when the equipment jump is too big. Deload week is lighter. Set counts are not changed from pump or soreness.</p><button class=\"btn primary\" data-action=\"close-modal\">Got it</button>";
  }

  function autofillModal() {
    const o = state.modal.opts || { fillEmpty: true, replace: false, usePreferred: state.overlay.settings.usePreferred };
    let html = "<h2>Recommend exercises</h2>";
    html += '<button class="option" data-action="af-toggle" data-key="fillEmpty"><div class="row"><span class="radio' + (o.fillEmpty ? " on" : "") + '"></span><div><strong>Fill in empty exercises</strong></div></div></button>';
    html += '<button class="option" data-action="af-toggle" data-key="replace"><div class="row"><span class="radio' + (o.replace ? " on" : "") + '"></span><div><strong>Replace existing exercises</strong></div></div></button>';
    html += '<button class="option" data-action="af-toggle" data-key="usePreferred"><div class="row"><span class="radio' + (o.usePreferred ? " on" : "") + '"></span><div><strong>Use preferred exercise types</strong></div></div></button>';
    html += '<div class="wrap">';
    L.EQUIPMENT_TYPES.forEach((type) => {
      const on = (state.overlay.settings.preferredTypes || []).indexOf(type) !== -1;
      html += '<button class="btn slim' + (on ? " primary" : "") + '" data-action="toggle-type" data-type="' + esc(type) + '">' + esc(type) + "</button>";
    });
    html += '</div><div class="btn-row" style="margin-top:10px"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="run-autofill">Recommend</button></div>';
    return html;
  }

  function startDayModal() {
    const start = state.modal.start || "Monday";
    const picked = state.modal.days || {};
    let html = "<h2>Update start day</h2><p class=\"small muted\">Choose a start day and the days you train. Labels on the board update. Days are not deleted.</p>";
    html += '<div class="lbl">Start day</div><div class="seg">';
    L.WEEKDAYS.forEach((wd) => {
      html += '<button data-action="start-pick" data-day="' + wd + '"' + (start === wd ? ' class="on"' : "") + ">" + wd.slice(0, 3) + "</button>";
    });
    html += '</div><div class="lbl" style="margin-top:8px">Recommended workout days</div><div class="seg">';
    L.WEEKDAYS.forEach((wd) => {
      html += '<button data-action="rec-day" data-day="' + wd + '"' + (picked[wd] ? ' class="on"' : "") + ">" + wd.slice(0, 3) + "</button>";
    });
    html += '</div><div class="btn-row" style="margin-top:10px"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="save-start-day">Save</button></div>';
    return html;
  }

  function filtersModal() {
    const f = state.ui.templateFilters;
    const emphasis = (state.templates.filters && state.templates.filters.emphasis) || [];
    let html = "<h2>Filters</h2><div class=\"lbl\">Emphasis</div><select class=\"field\" data-change=\"filter-emphasis\"><option value=\"\">Any</option>";
    emphasis.forEach((name) => {
      html += '<option value="' + esc(name) + '"' + (f.emphasis.toLowerCase() === name.toLowerCase() ? " selected" : "") + ">" + esc(name) + "</option>";
    });
    html += '</select><div class="lbl" style="margin-top:8px">Author</div><select class="field" data-change="filter-author"><option value="">Any</option><option' + (f.author === "Custom" ? " selected" : "") + '>Custom</option><option' + (f.author === "RP Strength" ? " selected" : "") + ">RP Strength</option></select>";
    html += '<div class="lbl" style="margin-top:8px">Sex</div><select class="field" data-change="filter-sex"><option value="">Any</option><option' + (f.sex === "Male" ? " selected" : "") + '>Male</option><option' + (f.sex === "Female" ? " selected" : "") + ">Female</option></select>";
    html += '<div class="lbl" style="margin-top:8px">Workouts per week</div><select class="field" data-change="filter-days"><option value="">Any</option>';
    [2, 3, 4, 5, 6].forEach((n) => {
      html += '<option value="' + n + '"' + (String(f.days) === String(n) ? " selected" : "") + ">" + n + "</option>";
    });
    html += '</select><div class="btn-row" style="margin-top:12px"><button class="btn" data-action="clear-filters">Cancel</button><button class="btn primary" data-action="close-modal">Apply</button></div>';
    return html;
  }

  function confirmModal() {
    return "<h2>" + esc(state.modal.title || "Confirm") + '</h2><p class="small">' + esc(state.modal.body || "") + '</p><div class="btn-row"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="' + esc(state.modal.yes || "close-modal") + '">' + esc(state.modal.yesLabel || "Confirm") + "</button></div>";
  }

  function feedbackModal() {
    const loc = L.locateDay(state.mesos, state.modal.key, state.modal.week, state.modal.day);
    if (!loc) return "";
    let html = "<h2>How did it feel?</h2><p class=\"small muted\">Saved on this workout only. Pump, soreness, and workload do not change the set count — that formula is not published.</p>";
    const O = window.Overload;
    if (O) {
      (loc.day.exercises || []).forEach((ex) => {
        if (!O.workingSets(ex.sets).length) return;
        const next = recommendFor(O, loc.meso, loc.day, ex, loc.day.unit || loc.meso.unit || "lb", "next");
        if (next && next.weight != null) html += coachLine("next", next, loc.day.unit || loc.meso.unit || "lb", ex.name);
      });
    }
    (loc.day.muscleGroups || []).forEach((g, i) => {
      html += '<div class="card"><div>' + chip(g.muscleGroupId) + "</div>";
      ["pump", "soreness", "workload"].forEach((field) => {
        html += '<div class="row between" style="margin-top:6px"><span class="small">' + field + '</span><span class="counter">';
        html += '<button data-action="fb" data-index="' + i + '" data-field="' + field + '" data-dir="-1">−</button><strong>' + (g[field] == null ? "—" : g[field]) + "</strong>";
        html += '<button data-action="fb" data-index="' + i + '" data-field="' + field + '" data-dir="1">+</button></span></div>';
      });
      html += "</div>";
    });
    html += '<button class="btn primary" data-action="close-feedback">Done</button>';
    return html;
  }

  function jointModal() {
    let html = "<h2>Joint pain</h2><div class=\"seg\">";
    [0, 1, 2, 3].forEach((n) => {
      html += '<button data-action="set-joint" data-level="' + n + '">' + (n === 0 ? "None" : n) + "</button>";
    });
    return html + "</div>";
  }

  function customExModal() {
    let html = "<h2>Custom exercise</h2>";
    html += '<label class="lbl">Name</label><input class="field" data-modal="name" data-focus="cx-name">';
    html += '<label class="lbl" style="margin-top:8px">Muscle</label><select class="field" data-change="cx-muscle">';
    Object.keys(L.MUSCLE_ID).forEach((name) => {
      html += "<option>" + esc(name) + "</option>";
    });
    html += '</select><label class="lbl" style="margin-top:8px">Equipment</label><input class="field" data-modal="equipment" placeholder="Dumbbell">';
    html += '<div class="btn-row" style="margin-top:10px"><button class="btn" data-action="close-modal">Cancel</button><button class="btn primary" data-action="save-custom-ex">Save</button></div>';
    return html;
  }

  function findSet(setId) {
    for (const meso of state.mesos) {
      for (const week of meso.weeks) {
        for (const day of week.days) {
          for (const ex of day.exercises || []) {
            const set = (ex.sets || []).find((s) => String(s.id) === String(setId));
            if (set) return { meso, day, ex, set };
          }
        }
      }
    }
    return null;
  }

  function findEx(mesoKey, week, dayIndex, exId) {
    const loc = L.locateDay(state.mesos, mesoKey, Number(week), Number(dayIndex));
    if (!loc) return null;
    const ex = (loc.day.exercises || []).find((e) => String(e.id) === String(exId));
    if (!ex) return null;
    return { meso: loc.meso, day: loc.day, ex: ex };
  }

  function onClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "close-modal") {
      if (btn.classList.contains("backdrop") && e.target.closest("[data-sheet]")) return;
      state.modal = null;
      render();
      return;
    }
    if (btn.tagName === "A" && btn.getAttribute("href") && action !== "scratch") return;
    if (action !== "toggle-set" && action !== "ghost-check") e.preventDefault();
    handle(action, btn);
  }

  function applyWeightRepTradeoff(loc, set, weightInput) {
    const O = window.Overload;
    if (!O || !set || !weightInput) return;
    const anchorW = Number(weightInput.dataset.anchorWeight);
    const anchorR = Number(weightInput.dataset.anchorReps);
    if (!(anchorW > 0) || !(anchorR > 0)) return;
    const equip = state.equipByName[L.normName(loc.ex.name)] || "";
    const unit = set.unit || loc.day.unit || loc.meso.unit || "lb";
    const adj = O.adjustRepsForWeight({
      lastWeight: anchorW,
      lastReps: anchorR,
      newWeight: set.weight,
      weekRir: L.weekRir(loc.meso, loc.day.week),
      equipmentStep: O.equipmentIncrement(equip, unit)
    });
    const repsInput = document.querySelector('[data-set="' + CSS.escape(String(set.id)) + '"][data-field="reps"]');
    const tipEl = document.querySelector('[data-tradeoff="' + CSS.escape(String(set.id)) + '"]');
    const weekRir = L.weekRir(loc.meso, loc.day.week);
    if (adj.ignored) return;
    if (adj.mode === "rir") {
      set.repsTarget = null;
      if (repsInput) {
        repsInput.placeholder = adj.rirText;
        repsInput.classList.add("suggested");
      }
      if (tipEl) {
        tipEl.hidden = false;
        tipEl.textContent = adj.rirText;
      }
      paintRecommendHint(set, weekRir, unit);
      return;
    }
    if (adj.reps == null) return;
    set.repsTarget = adj.reps;
    if (repsInput) {
      repsInput.placeholder = String(adj.reps);
      repsInput.classList.toggle("suggested", !!adj.tip);
    }
    paintRecommendHint(set, weekRir, unit);
    if (!tipEl) return;
    if (adj.tip) {
      tipEl.hidden = false;
      tipEl.textContent = adj.tip + " · " + adj.reps + " reps";
    } else {
      tipEl.hidden = true;
      tipEl.textContent = "";
    }
  }

  function paintRecommendHint(set, rir, unit) {
    const hintEl = document.querySelector('[data-hint="' + CSS.escape(String(set.id)) + '"]');
    if (!hintEl) return;
    const text = recommendText(set, rir, unit);
    const typeNote = hintEl.dataset.typeNote || "";
    const full = text && typeNote ? text + " · " + typeNote : (text || typeNote);
    hintEl.textContent = full;
    hintEl.hidden = !full;
  }

  function onFocusIn(e) {
    const t = e.target;
    if (!t.dataset || t.dataset.field !== "weight" || !t.dataset.set) return;
    t.dataset.preWeight = t.value;
  }

  function commitWeightEdit(input) {
    const loc = findSet(input.dataset.set);
    if (!loc || !L.isEditable(loc.meso)) return;
    const num = input.value === "" ? null : Number(input.value);
    if (num != null && Number.isNaN(num)) return;
    const pre = input.dataset.preWeight != null && input.dataset.preWeight !== "" ? Number(input.dataset.preWeight) : null;
    loc.set.weight = num;
    applyWeightRepTradeoff(loc, loc.set, input);
    if (state.overlay.settings.autoMatch && pre != null && !Number.isNaN(pre)) {
      loc.ex.sets.forEach((s) => {
        if (s === loc.set || s.status === "complete" || s.status === "skipped") return;
        if (Number(s.weight) !== pre) return;
        s.weight = num;
        const el = document.querySelector('[data-set="' + CSS.escape(String(s.id)) + '"][data-field="weight"]');
        if (el && document.activeElement !== el) el.value = num == null ? "" : String(trimNum(num));
        applyWeightRepTradeoff(loc, s, el);
      });
    }
    input.dataset.preWeight = input.value;
    persistDay(loc.meso, loc.day);
  }

  function onInput(e) {
    const t = e.target;
    if (t.dataset.ui) {
      state.ui[t.dataset.ui] = t.value;
      if (t.dataset.ui === "pickerQuery" || t.dataset.ui === "historyQuery" || t.dataset.ui === "exerciseQuery") render();
      return;
    }
    if (t.dataset.modal != null && state.modal) {
      state.modal[t.dataset.modal] = t.value;
      return;
    }
    if (t.dataset.field && t.dataset.set) {
      const loc = findSet(t.dataset.set);
      if (!loc || !L.isEditable(loc.meso)) return;
      const num = t.value === "" ? null : Number(t.value);
      loc.set[t.dataset.field] = num;
      if (t.dataset.field !== "weight") persistDay(loc.meso, loc.day);
    }
  }

  function onChange(e) {
    const t = e.target;
    if (t.dataset && t.dataset.field === "weight" && t.dataset.set) {
      commitWeightEdit(t);
      return;
    }
    if (t.id === "import-file" && t.files && t.files[0]) {
      importFile(t.files[0]);
      return;
    }
    const change = t.dataset.change;
    if (change === "day-label" && state.board) {
      state.board.days[Number(t.dataset.day)].label = t.value;
      saveBoard();
    } else if (change === "exerciseMuscle") {
      state.ui.exerciseMuscle = t.value;
      render();
    } else if (change === "exerciseEquip") {
      state.ui.exerciseEquip = t.value;
      render();
    } else if (change === "slot-priority" && state.modal && state.modal.items) {
      state.modal.items[Number(t.dataset.index)].priority = t.value;
    } else if (change === "filter-emphasis") state.ui.templateFilters.emphasis = t.value;
    else if (change === "filter-author") state.ui.templateFilters.author = t.value;
    else if (change === "filter-sex") state.ui.templateFilters.sex = t.value;
    else if (change === "filter-days") state.ui.templateFilters.days = t.value;
    else if (change === "cx-muscle" && state.modal) state.modal.muscle = t.value;
  }

  function onDragStart(e) {
    const t = e.target.closest("[data-drag]");
    if (!t) return;
    state.drag = t.dataset.drag;
    e.dataTransfer.setData("text/plain", state.drag);
  }

  function onDrop(e) {
    const t = e.target.closest("[data-drop]");
    if (!t || !state.board || !state.drag) return;
    e.preventDefault();
    const from = state.drag.split(":");
    const to = t.dataset.drop.split(":");
    if (from[0] === "day" && to[0] === "day") {
      const a = Number(from[1]);
      const b = Number(to[1]);
      if (a !== b) {
        const [item] = state.board.days.splice(a, 1);
        state.board.days.splice(b, 0, item);
        saveBoard();
        render();
      }
    } else if (from[0] === "slot" && to[0] === "slot") {
      const [slot] = state.board.days[Number(from[1])].slots.splice(Number(from[2]), 1);
      state.board.days[Number(to[1])].slots.splice(Number(to[2]), 0, slot);
      saveBoard();
      render();
    }
    state.drag = "";
  }

  function handle(action, btn) {
    const d = btn.dataset;
    if (action === "calendar") state.modal = { type: "calendar", key: d.key };
    else if (action === "workout-menu") state.modal = { type: "workout-menu", key: d.key, week: Number(d.week), day: Number(d.day) };
    else if (action === "exercise-menu") state.modal = { type: "exercise-menu", key: d.key, week: Number(d.week), day: Number(d.day), ex: d.ex };
    else if (action === "meso-menu") state.modal = { type: "meso-menu", key: d.key };
    else if (action === "board-menu") state.modal = { type: "board-menu" };
    else if (action === "summary") state.modal = { type: "summary", key: d.key || (state.modal && state.modal.key) };
    else if (action === "meso-week") state.ui.mesoWeek[d.key] = Number(d.week);
    else if (action === "hist-status") state.ui.historyStatus = d.status;
    else if (action === "hist-sort") state.ui.historySort = state.ui.historySort === "newest" ? "oldest" : "newest";
    else if (action === "copy-week-pick") state.ui.copyWeek = Number(d.week);
    else if (action === "copy-day-pick") state.ui.copyDay = Number(d.day);
    else if (action === "do-copy") return doCopy(d.key, Number(d.week));
    else if (action === "scratch") return startScratch();
    else if (action === "use-template") return useTemplate(d.id);
    else if (action === "blank-from-catalog") return startBlank(Number(d.days), d.name);
    else if (action === "tpl-day") state.ui.tplDay = Number(d.day);
    else if (action === "template-filters") {
      state.ui.filterSnapshot = Object.assign({}, state.ui.templateFilters);
      state.modal = { type: "filters" };
    } else if (action === "clear-filters") {
      state.ui.templateFilters = state.ui.filterSnapshot || { emphasis: "", author: "", sex: "", days: "" };
      state.modal = null;
    } else if (action === "builder-days") state.builder.days = Number(d.days);
    else if (action === "builder-continue") { go("#/plan/builder/priorities"); return; }
    else if (action === "builder-tab") state.builder.tab = d.tab;
    else if (action === "open-muscles") state.modal = { type: "builder-muscles", picked: state.builder[state.builder.tab].slice() };
    else if (action === "toggle-builder-muscle") toggleBuilderMuscle(Number(d.id));
    else if (action === "add-builder-muscles") {
      state.builder[state.builder.tab] = (state.modal.picked || []).slice();
      state.modal = null;
    } else if (action === "clear-prio") state.builder[state.builder.tab] = [];
    else if (action === "prio-remove") state.builder[state.builder.tab].splice(Number(d.index), 1);
    else if (action === "prio-move") moveList(state.builder[state.builder.tab], Number(d.index), Number(d.dir));
    else if (action === "builder-build") return builderBuild();
    else if (action === "add-day") addBoardDay();
    else if (action === "remove-day") {
      if (state.board) state.board.days.splice(Number(d.day), 1);
      saveBoard();
    } else if (action === "add-muscle") state.modal = { type: "muscles", day: Number(d.day), counts: {} };
    else if (action === "count-muscle") {
      const id = d.id;
      const counts = state.modal.counts;
      counts[id] = Math.max(0, (counts[id] || 0) + Number(d.dir));
    } else if (action === "muscles-next") return musclesNext();
    else if (action === "back-muscles") state.modal = { type: "muscles", day: state.modal.day, counts: state.modal.counts || {} };
    else if (action === "confirm-slots") return confirmSlots();
    else if (action === "remove-slot") {
      state.board.days[Number(d.day)].slots.splice(Number(d.slot), 1);
      saveBoard();
    } else if (action === "move-slot") moveList(state.board.days[Number(d.day)].slots, Number(d.slot), Number(d.dir));
    else if (action === "pick-exercise") openPicker({ day: Number(d.day), slot: Number(d.slot), muscleGroupId: state.board.days[Number(d.day)].slots[Number(d.slot)].muscleGroupId, mode: "slot" });
    else if (action === "choose-ex") {
      state.ui.pickerId = d.name;
      state.modal.chosen = { name: d.name, id: d.id || null };
    } else if (action === "confirm-ex") return confirmExercise();
    else if (action === "open-autofill") state.modal = { type: "autofill", opts: { fillEmpty: true, replace: false, usePreferred: !!state.overlay.settings.usePreferred } };
    else if (action === "af-toggle") state.modal.opts[d.key] = !state.modal.opts[d.key];
    else if (action === "run-autofill") return runAutofill();
    else if (action === "clear-exercises") {
      (state.board.days || []).forEach((day) => day.slots.forEach((slot) => { slot.exerciseName = null; slot.exerciseId = null; slot.sets = []; }));
      saveBoard();
      state.modal = null;
    } else if (action === "reset-board") {
      state.modal = { type: "confirm", title: "Reset board", body: "This will remove all muscle groups and reset your board to the initial blank state.", yes: "do-reset-board", yesLabel: "Reset" };
    } else if (action === "do-reset-board") {
      state.board = L.blankBoard();
      saveBoard();
      state.modal = null;
    } else if (action === "open-create") return openCreate();
    else if (action === "create-weeks") state.modal.weeks = Number(d.weeks);
    else if (action === "create-unit") state.modal.unit = d.unit;
    else if (action === "confirm-create") return confirmCreate();
    else if (action === "open-start-day") state.modal = { type: "start-day", start: "Monday", days: { Monday: true, Tuesday: true, Wednesday: true, Thursday: true, Friday: true } };
    else if (action === "start-pick") state.modal.start = d.day;
    else if (action === "rec-day") state.modal.days[d.day] = !state.modal.days[d.day];
    else if (action === "save-start-day") return saveStartDay();
    else if (action === "edit-board-priorities") return editBoardPriorities();
    else if (action === "save-board-template") return saveBoardTemplate();
    else if (action === "priorities-info") {
      state.modal = { type: "info", title: "Muscle priorities", body: "Emphasize means you want more work there when recovery is good. Grow means add work only when you need it. Maintain means keep the muscle with less work. On a copied week, priorities are just labels — set counts come from the week you copied." };
    } else if (action === "toggle-set") return toggleSet(d.key, d.set);
    else if (action === "ghost-check") return ghostCheck(d.key, Number(d.week), Number(d.day), d.ex);
    else if (action === "undo-skip") return undoSkip(d.set);
    else if (action === "add-set") return addSetAction();
    else if (action === "skip-sets") return skipRemaining();
    else if (action === "remove-ex") return removeExercise();
    else if (action === "move-ex") return moveExercise(Number(d.dir));
    else if (action === "replace-ex") return replaceExercise();
    else if (action === "open-joint") state.modal = Object.assign({ type: "joint" }, menuLoc());
    else if (action === "set-joint") return setJoint(Number(d.level));
    else if (action === "add-exercise") {
      openPicker({
        mode: "add",
        key: d.key || (state.modal && state.modal.key),
        week: d.week != null && d.week !== "" ? Number(d.week) : state.modal.week,
        day: d.day != null && d.day !== "" ? Number(d.day) : state.modal.day,
        muscleGroupId: null
      });
      return;
    } else if (action === "open-note") state.modal = Object.assign({ type: "note", scope: d.scope, text: "" }, menuLoc());
    else if (action === "save-note") return saveNote();
    else if (action === "open-relabel") state.modal = Object.assign({ type: "relabel" }, menuLoc());
    else if (action === "set-label") return setLabel(d.label);
    else if (action === "open-bw-day" || action === "add-bw") state.modal = Object.assign({ type: "bw", date: new Date().toISOString().slice(0, 10), weight: "" }, action === "open-bw-day" ? menuLoc() : {});
    else if (action === "save-bw") return saveBw();
    else if (action === "reset-day") return resetDay();
    else if (action === "skip-day") return skipDay();
    else if (action === "finish-day") return finishDay(d.key, Number(d.week), Number(d.day));
    else if (action === "fb") return bumpFeedback(Number(d.index), d.field, Number(d.dir));
    else if (action === "close-feedback") {
      const loc = L.locateDay(state.mesos, state.modal.key, state.modal.week, state.modal.day);
      if (loc) persistDay(loc.meso, loc.day);
      state.modal = null;
    } else if (action === "open-rename") state.modal = { type: "rename", key: state.modal.key, name: "" };
    else if (action === "save-rename") return saveRename();
    else if (action === "end-meso") return endMeso();
    else if (action === "delete-meso") return deleteMeso();
    else if (action === "save-meso-template") return saveMesoTemplate();
    else if (action === "sum-mode") state.ui.summaryMode = d.mode;
    else if (action === "sum-week") state.ui.summaryWeek = Number(d.week);
    else if (action === "export-backup") return exportBackup();
    else if (action === "reset-local") {
      state.modal = { type: "confirm", title: "Reset local logs", body: "This removes mesocycles and logs you added on this phone and restores the export. It does not change the file in the repo.", yes: "do-reset-local", yesLabel: "Reset" };
    } else if (action === "do-reset-local") return resetLocal();
    else if (action === "toggle-automatch") state.overlay.settings.autoMatch = !state.overlay.settings.autoMatch;
    else if (action === "toggle-preferred") state.overlay.settings.usePreferred = !state.overlay.settings.usePreferred;
    else if (action === "toggle-type") toggleType(d.type);
    else if (action === "custom-exercise") state.modal = { type: "custom-ex", name: "", muscle: "Chest", equipment: "" };
    else if (action === "save-custom-ex") return saveCustomEx();
    else return;
    if (action === "save-board-template" || action === "do-copy") return;
    render();
  }

  function menuLoc() {
    const m = state.modal || {};
    return { key: m.key, week: m.week, day: m.day, ex: m.ex };
  }

  function moveList(list, index, dir) {
    const j = index + dir;
    if (!list || j < 0 || j >= list.length) return;
    const [item] = list.splice(index, 1);
    list.splice(j, 0, item);
    saveBoard();
  }

  function toggleBuilderMuscle(id) {
    const picked = state.modal.picked || [];
    const i = picked.indexOf(id);
    if (i >= 0) picked.splice(i, 1);
    else picked.push(id);
    state.modal.picked = picked;
    render();
  }

  function startScratch() {
    state.board = L.blankBoard();
    saveBoard();
    go("#/board");
  }

  function startBlank(days, name) {
    state.board = L.blankDaysBoard(days, name);
    state.board.subtitle = "Catalog name only";
    saveBoard();
    go("#/board");
  }

  function attachLibraryIds(board) {
    const map = {};
    state.library.forEach((ex) => { map[L.normName(ex.name)] = ex; });
    board.days.forEach((day) => day.slots.forEach((slot) => {
      const hit = map[L.normName(slot.exerciseName)];
      if (hit) {
        slot.exerciseId = hit.exercise_id || null;
        if (!slot.muscleGroupId) slot.muscleGroupId = L.MUSCLE_ID[hit.muscle];
      }
    }));
  }

  function useTemplate(id) {
    const found = findTemplate(id);
    if (!found || found.kind !== "custom") return;
    state.board = L.boardFromTemplate(found.tpl);
    attachLibraryIds(state.board);
    saveBoard();
    go("#/board");
  }

  function doCopy(key, week) {
    const meso = L.findMeso(state.mesos, key);
    if (!meso) return;
    state.board = L.boardFromMesoWeek(meso, week);
    state.ui.copyDay = 0;
    saveBoard();
    state.modal = { type: "overload" };
    go("#/board");
  }

  function builderBuild() {
    const total = state.builder.emphasize.length + state.builder.grow.length + state.builder.maintain.length;
    if (!total) return flash("Add at least one muscle group.");
    go("#/plan/builder/working");
    setTimeout(() => {
      state.board = L.builderBoard(state.builder.days, {
        emphasize: state.builder.emphasize,
        grow: state.builder.grow,
        maintain: state.builder.maintain
      }, state.builder.start || "Monday");
      saveBoard();
      go("#/board");
    }, 500);
  }

  function addBoardDay() {
    loadBoard();
    if (!state.board) state.board = L.blankBoard();
    const n = state.board.days.length;
    state.board.days.push({ label: L.WEEKDAYS[n % 7], slots: [] });
    saveBoard();
    state.modal = null;
    if (route()[0] !== "board") go("#/board");
    else render();
  }

  function musclesNext() {
    const counts = state.modal.counts || {};
    const items = [];
    Object.keys(counts).forEach((id) => {
      const n = counts[id];
      for (let i = 0; i < n; i++) items.push({ muscleGroupId: Number(id), priority: "grow" });
    });
    if (!items.length) return flash("Add at least one muscle group.");
    state.modal = { type: "slot-priorities", day: state.modal.day, items: items, counts: counts };
    render();
  }

  function confirmSlots() {
    if (state.modal.boardEdit) {
      const pri = {};
      state.modal.items.forEach((item) => { pri[item.muscleGroupId] = item.priority; });
      state.board.days.forEach((day) => day.slots.forEach((slot) => {
        if (pri[slot.muscleGroupId]) slot.priority = pri[slot.muscleGroupId];
      }));
      saveBoard();
      state.modal = null;
      render();
      return;
    }
    const day = state.board.days[state.modal.day];
    state.modal.items.forEach((item) => {
      day.slots.push(L.blankSlot(item.muscleGroupId, item.priority));
    });
    state.modal = null;
    saveBoard();
    render();
  }

  function openPicker(opts) {
    state.ui.pickerQuery = "";
    state.ui.pickerId = null;
    state.modal = Object.assign({ type: "picker", chosen: null }, opts);
    render();
  }

  function confirmExercise() {
    const chosen = state.modal.chosen || (state.ui.pickerId ? { name: state.ui.pickerId, id: null } : null);
    if (!chosen) return flash("Select an exercise.");
    const lib = state.library.find((ex) => ex.name === chosen.name);
    if (state.modal.mode === "slot") {
      const slot = state.board.days[state.modal.day].slots[state.modal.slot];
      slot.exerciseName = chosen.name;
      slot.exerciseId = (lib && lib.exercise_id) || chosen.id || null;
      if (lib) slot.muscleGroupId = slot.muscleGroupId || L.MUSCLE_ID[lib.muscle];
      saveBoard();
    } else if (state.modal.mode === "add") {
      const loc = L.locateDay(state.mesos, state.modal.key, state.modal.week, state.modal.day);
      if (loc && L.isEditable(loc.meso)) {
        loc.day.exercises.push({
          id: L.uid("e"),
          dayId: loc.day.id,
          exerciseId: (lib && lib.exercise_id) || null,
          position: loc.day.exercises.length,
          jointPain: null,
          muscleGroupId: lib ? L.MUSCLE_ID[lib.muscle] : null,
          sets: [],
          status: "empty",
          name: chosen.name,
          notes: []
        });
        ensureMuscle(loc.day, lib ? L.MUSCLE_ID[lib.muscle] : null);
        persistDay(loc.meso, loc.day);
      }
    } else if (state.modal.mode === "replace") {
      const found = findEx(state.modal.key, state.modal.week, state.modal.day, state.modal.ex);
      if (found) {
        found.ex.name = chosen.name;
        found.ex.exerciseId = (lib && lib.exercise_id) || null;
        found.ex.muscleGroupId = lib ? L.MUSCLE_ID[lib.muscle] : found.ex.muscleGroupId;
        found.ex.sets.forEach((s) => {
          s.weight = null;
          s.weightTarget = null;
          s.weightTargetMin = null;
          s.weightTargetMax = null;
          s.reps = null;
          s.status = "ready";
          s.finishedAt = null;
        });
        persistDay(found.meso, found.day);
      }
    }
    state.modal = null;
    render();
  }

  function ensureMuscle(day, id) {
    if (!id) return;
    day.muscleGroups = day.muscleGroups || [];
    if (!day.muscleGroups.some((g) => g.muscleGroupId === id)) {
      day.muscleGroups.push({ muscleGroupId: id, pump: null, soreness: null, workload: null, recommendedSets: null, status: "programmed" });
    }
  }

  function runAutofill() {
    if (!state.board) return;
    L.autofillBoard(state.board, state.library, state.mesos, {
      fillEmpty: state.modal.opts.fillEmpty,
      replace: state.modal.opts.replace,
      usePreferred: state.modal.opts.usePreferred,
      preferredTypes: state.overlay.settings.preferredTypes
    });
    attachLibraryIds(state.board);
    saveBoard();
    state.modal = null;
    flash("Filled from your exercise library.");
  }

  function openCreate() {
    loadBoard();
    const issues = L.boardIssues(state.board);
    if (issues.length) return flash(issues[0]);
    const missing = (state.board.days || []).some((day) => day.slots.some((slot) => !slot.exerciseName));
    if (missing) return flash("Choose an exercise for every muscle group.");
    state.modal = { type: "create", name: state.board.title || "New meso plan", weeks: 4, unit: "lb" };
    render();
  }

  function confirmCreate() {
    const name = (state.modal.name || "New meso plan").trim() || "New meso plan";
    const weeks = state.modal.weeks || 4;
    const unit = state.modal.unit || "lb";
    let board = state.board;
    if (board.targetsIncluded && board.sourceUnit && board.sourceUnit !== unit) board = L.stripTargets(board);
    const now = new Date().toISOString();
    state.mesos.forEach((meso) => {
      if (!L.isCurrent(meso)) return;
      const patch = L.endMesoRecord(meso, now);
      meso.status = patch.status;
      meso.finishedAt = patch.finishedAt;
      persistMeta(meso);
    });
    const meso = L.createMeso({ name: name, weeks: weeks, unit: unit, board: board, now: now });
    state.overlay.pristine[meso.key] = L.clone(meso);
    state.overlay.newMesos.push(L.clone(meso));
    state.board = null;
    sessionStorage.removeItem("goong-board");
    state.modal = null;
    applyData();
    scheduleSave();
    flash(name + " is the current mesocycle.");
    go("#/today");
  }

  function saveStartDay() {
    const ordered = [];
    const startIdx = L.WEEKDAYS.indexOf(state.modal.start || "Monday");
    for (let i = 0; i < 7; i++) {
      const wd = L.WEEKDAYS[(startIdx + i) % 7];
      if (state.modal.days[wd]) ordered.push(wd);
    }
    if (state.board) {
      state.board.days.forEach((day, i) => {
        if (ordered[i]) day.label = ordered[i];
      });
      saveBoard();
    }
    state.modal = null;
    render();
  }

  function editBoardPriorities() {
    const map = {};
    (state.board.days || []).forEach((day) => day.slots.forEach((slot) => {
      if (slot.muscleGroupId && !map[slot.muscleGroupId]) map[slot.muscleGroupId] = slot.priority || "grow";
    }));
    const items = Object.keys(map).map((id) => ({ muscleGroupId: Number(id), priority: map[id] }));
    if (!items.length) return flash("Add a muscle group first.");
    state.modal = { type: "slot-priorities", items: items, counts: {}, day: -1, boardEdit: true };
    render();
  }

  function saveBoardTemplate() {
    if (!state.board) return;
    const name = state.board.title || "Saved template";
    const days = {};
    state.board.days.forEach((day, i) => {
      days["Day " + (i + 1)] = day.slots.filter((s) => s.exerciseName).map((s, n) => ({
        position: n + 1,
        muscle: L.MUSCLES[s.muscleGroupId] || "",
        exercise: s.exerciseName
      }));
    });
    state.overlay.customTemplates.push({
      name: name,
      key: L.uid("t"),
      author: "Custom",
      emphasis: "CUSTOM",
      sex: "",
      days_per_week: state.board.days.length,
      days: days
    });
    scheduleSave();
    state.modal = null;
    flash("Saved on this phone.");
  }

  function readGhost(exId) {
    const w = document.querySelector('[data-ghost="weight"][data-ex="' + CSS.escape(String(exId)) + '"]');
    const r = document.querySelector('[data-ghost="reps"][data-ex="' + CSS.escape(String(exId)) + '"]');
    return {
      weight: w && w.value !== "" ? Number(w.value) : null,
      reps: r && r.value !== "" ? Number(r.value) : null
    };
  }

  function ghostCheck(key, week, dayIndex, exId) {
    const found = findEx(key, week, dayIndex, exId);
    if (!found || !L.isEditable(found.meso)) return;
    const values = readGhost(exId);
    if (values.weight == null || values.reps == null || Number.isNaN(values.reps)) return flash("Enter weight and reps first.");
    const now = new Date().toISOString();
    found.ex.sets.push({
      id: L.uid("s"),
      position: 0,
      setType: "regular",
      weight: values.weight,
      weightTarget: null,
      weightTargetMin: null,
      weightTargetMax: null,
      reps: values.reps,
      repsTarget: null,
      progressiveOverload: window.Overload ? window.Overload.labelSetOverload(values.reps, null) : null,
      unit: found.meso.unit || "lb",
      status: "complete",
      createdAt: now,
      finishedAt: now
    });
    L.refreshDayStatus(found.day, { now: now });
    persistDay(found.meso, found.day);
    render();
  }

  function toggleSet(key, setId) {
    const loc = findSet(setId);
    if (!loc || !L.isEditable(loc.meso)) return;
    if (L.isDeloadWeek(loc.meso, loc.day.week) && L.deloadLocked(loc.meso)) return flash("Deload is locked until earlier weeks are done.");
    const set = loc.set;
    if (set.status === "complete") {
      set.status = "ready";
      set.finishedAt = null;
    } else {
      if (set.weight == null || set.reps == null || set.reps === "" || Number.isNaN(Number(set.reps))) return flash("Enter weight and reps first.");
      set.weight = Number(set.weight);
      set.reps = Number(set.reps);
      set.status = "complete";
      set.finishedAt = new Date().toISOString();
      if (window.Overload) set.progressiveOverload = window.Overload.labelSetOverload(set.reps, set.repsTarget);
    }
    L.refreshDayStatus(loc.day);
    persistDay(loc.meso, loc.day);
    render();
  }

  function undoSkip(setId) {
    const loc = findSet(setId);
    if (!loc || !L.isEditable(loc.meso)) return;
    loc.set.status = "ready";
    loc.set.reps = null;
    loc.set.finishedAt = null;
    L.refreshDayStatus(loc.day);
    persistDay(loc.meso, loc.day);
    render();
  }

  function addSetAction() {
    const found = findEx(state.modal.key, state.modal.week, state.modal.day, state.modal.ex);
    if (!found) return;
    const last = found.ex.sets[found.ex.sets.length - 1];
    const prev = state.lastByName[L.normName(found.ex.name)];
    found.ex.sets.push({
      id: L.uid("s"),
      position: found.ex.sets.length,
      setType: "regular",
      weight: last && last.weight != null ? last.weight : (prev ? prev.weight : null),
      weightTarget: null,
      weightTargetMin: null,
      weightTargetMax: null,
      reps: null,
      repsTarget: last ? last.repsTarget : null,
      unit: found.meso.unit || "lb",
      status: "ready",
      finishedAt: null
    });
    L.refreshDayStatus(found.day);
    persistDay(found.meso, found.day);
    state.modal = null;
    render();
  }

  function skipRemaining() {
    const found = findEx(state.modal.key, state.modal.week, state.modal.day, state.modal.ex);
    if (!found) return;
    const now = new Date().toISOString();
    found.ex.sets.forEach((s) => {
      if (s.status !== "complete") {
        s.status = "skipped";
        s.reps = -1;
        s.finishedAt = now;
      }
    });
    L.refreshDayStatus(found.day, { now: now });
    persistDay(found.meso, found.day);
    state.modal = null;
    render();
  }

  function removeExercise() {
    const found = findEx(state.modal.key, state.modal.week, state.modal.day, state.modal.ex);
    if (!found) return;
    found.day.exercises = found.day.exercises.filter((ex) => ex.id !== found.ex.id);
    found.day.exercises.forEach((ex, i) => { ex.position = i; });
    L.refreshDayStatus(found.day);
    persistDay(found.meso, found.day);
    state.modal = null;
    render();
  }

  function moveExercise(dir) {
    const found = findEx(state.modal.key, state.modal.week, state.modal.day, state.modal.ex);
    if (!found) return;
    const list = found.day.exercises;
    const i = list.findIndex((ex) => ex.id === found.ex.id);
    moveList(list, i, dir);
    list.forEach((ex, n) => { ex.position = n; });
    persistDay(found.meso, found.day);
    state.modal = null;
    render();
  }

  function replaceExercise() {
    const found = findEx(state.modal.key, state.modal.week, state.modal.day, state.modal.ex);
    if (!found) return;
    openPicker({ mode: "replace", key: state.modal.key, week: state.modal.week, day: state.modal.day, ex: state.modal.ex, muscleGroupId: found.ex.muscleGroupId });
  }

  function setJoint(level) {
    const found = findEx(state.modal.key, state.modal.week, state.modal.day, state.modal.ex);
    if (!found) return;
    found.ex.jointPain = level || null;
    persistDay(found.meso, found.day);
    state.modal = null;
    render();
  }

  function saveNote() {
    const text = (state.modal.text || "").trim();
    if (!text) return flash("Write a note first.");
    const note = { id: L.uid("n"), text: text, at: new Date().toISOString() };
    if (state.modal.scope === "meso") {
      const meso = L.findMeso(state.mesos, state.modal.key);
      meso.notes = meso.notes || [];
      meso.notes.push(note);
      persistMeta(meso);
    } else if (state.modal.scope === "exercise") {
      const found = findEx(state.modal.key, state.modal.week, state.modal.day, state.modal.ex);
      if (found) {
        found.ex.notes = found.ex.notes || [];
        found.ex.notes.push(note);
        persistDay(found.meso, found.day);
      }
    } else {
      const loc = L.locateDay(state.mesos, state.modal.key, state.modal.week, state.modal.day);
      if (loc && L.isEditable(loc.meso)) {
        loc.day.notes = loc.day.notes || [];
        loc.day.notes.push(note);
        persistDay(loc.meso, loc.day);
      } else if (loc) return flash("Finished mesocycles stay read-only.");
    }
    state.modal = null;
    render();
  }

  function setLabel(label) {
    const loc = L.locateDay(state.mesos, state.modal.key, state.modal.week, state.modal.day);
    if (!loc || !L.isEditable(loc.meso)) return;
    loc.day.label = label;
    persistDay(loc.meso, loc.day);
    state.modal = null;
    render();
  }

  function saveBw() {
    const weight = Number(state.modal.weight);
    const date = state.modal.date;
    if (!date || Number.isNaN(weight)) return flash("Enter a date and weight.");
    state.overlay.bodyweights = state.overlay.bodyweights || [];
    state.overlay.bodyweights.push({ date: date, bodyweight: weight, unit: "lb" });
    if (state.modal.key != null && state.modal.week != null) {
      const loc = L.locateDay(state.mesos, state.modal.key, state.modal.week, state.modal.day);
      if (loc && L.isEditable(loc.meso)) {
        loc.day.bodyweight = weight;
        loc.day.bodyweightAt = new Date().toISOString();
        persistDay(loc.meso, loc.day);
      }
    }
    scheduleSave();
    state.modal = null;
    flash("Bodyweight saved on this phone.");
  }

  function resetDay() {
    const loc = L.locateDay(state.mesos, state.modal.key, state.modal.week, state.modal.day);
    if (!loc || !L.isEditable(loc.meso)) return;
    if (loc.meso.local) {
      const base = state.overlay.pristine[loc.meso.key];
      if (!base) return;
      const src = L.clone(base.weeks[state.modal.week].days[state.modal.day]);
      src.id = loc.day.id;
      (src.exercises || []).forEach((ex) => { ex.dayId = src.id; });
      loc.meso.weeks[state.modal.week].days[state.modal.day] = src;
      persistDay(loc.meso, src);
    } else {
      delete state.overlay.days[loc.day.id];
      const seed = state.seed.find((m) => m.key === loc.meso.key);
      loc.meso.weeks[state.modal.week].days[state.modal.day] = L.clone(seed.weeks[state.modal.week].days[state.modal.day]);
      scheduleSave();
      rebuildIndex();
    }
    state.modal = null;
    flash("Day reset to the export.");
  }

  function skipDay() {
    const loc = L.locateDay(state.mesos, state.modal.key, state.modal.week, state.modal.day);
    if (!loc || !L.isEditable(loc.meso)) return;
    const now = new Date().toISOString();
    (loc.day.exercises || []).forEach((ex) => {
      (ex.sets || []).forEach((s) => {
        if (s.status !== "complete") {
          s.status = "skipped";
          s.reps = -1;
          s.finishedAt = now;
        }
      });
    });
    L.refreshDayStatus(loc.day, { force: "skipped", now: now });
    persistDay(loc.meso, loc.day);
    state.modal = null;
    render();
  }

  function finishDay(key, week, dayIndex) {
    const loc = L.locateDay(state.mesos, key, week, dayIndex);
    if (!loc || !L.isEditable(loc.meso)) return;
    const now = new Date().toISOString();
    const sets = [];
    (loc.day.exercises || []).forEach((ex) => (ex.sets || []).forEach((s) => sets.push(s)));
    if (!sets.some((s) => s.status === "complete")) return flash("Log a set, or skip the workout from the menu.");
    L.refreshDayStatus(loc.day, { now: now });
    persistDay(loc.meso, loc.day);
    state.modal = { type: "feedback", key: key, week: week, day: dayIndex };
    render();
  }

  function bumpFeedback(index, field, dir) {
    const loc = L.locateDay(state.mesos, state.modal.key, state.modal.week, state.modal.day);
    if (!loc) return;
    const g = loc.day.muscleGroups[index];
    const cur = g[field] == null ? 0 : g[field];
    g[field] = Math.max(0, Math.min(3, cur + dir));
    render();
  }

  function saveRename() {
    const meso = L.findMeso(state.mesos, state.modal.key);
    const name = (state.modal.name || "").trim();
    if (!meso || !name) return;
    meso.name = name;
    persistMeta(meso);
    state.modal = null;
    render();
  }

  function endMeso() {
    const meso = L.findMeso(state.mesos, state.modal.key);
    if (!meso) return;
    const patch = L.endMesoRecord(meso, new Date().toISOString());
    meso.status = patch.status;
    meso.finishedAt = patch.finishedAt;
    persistMeta(meso);
    applyData();
    state.modal = null;
    flash("Mesocycle marked complete.");
  }

  function deleteMeso() {
    const meso = L.findMeso(state.mesos, state.modal.key);
    if (!meso || !meso.local) return;
    state.overlay.deleted[meso.key] = true;
    state.overlay.newMesos = state.overlay.newMesos.filter((m) => m.key !== meso.key);
    applyData();
    scheduleSave();
    state.modal = null;
    go("#/mesos");
  }

  function saveMesoTemplate() {
    const meso = L.findMeso(state.mesos, state.modal.key);
    if (!meso) return;
    const week = meso.weeks[0];
    const days = {};
    week.days.forEach((day, i) => {
      days["Day " + (i + 1)] = (day.exercises || []).map((ex, n) => ({
        position: n + 1,
        muscle: L.MUSCLES[ex.muscleGroupId] || "",
        exercise: ex.name
      }));
    });
    state.overlay.customTemplates.push({
      name: meso.name,
      key: L.uid("t"),
      author: "Custom",
      emphasis: "CUSTOM",
      days_per_week: week.days.length,
      days: days
    });
    scheduleSave();
    state.modal = null;
    flash("Template saved on this phone.");
  }

  function exportBackup() {
    const payload = {
      kind: "avni-hypertrophy-backup",
      exportedAt: new Date().toISOString(),
      note: "Personal backup. Not affiliated with RP Strength.",
      mesocycles: state.mesos,
      overlay: state.overlay,
      bodyweight: bodyweightEntries()
    };
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "hypertrophy-backup.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (Array.isArray(data)) {
          state.seed = data;
        } else if (data && Array.isArray(data.mesocycles) && data.kind === "avni-hypertrophy-backup") {
          if (data.overlay) state.overlay = Object.assign(L.emptyOverlay(), data.overlay);
        } else if (data && Array.isArray(data.mesocycles)) {
          state.seed = data.mesocycles;
        } else throw new Error("Unrecognized file");
        applyData();
        db().then((handle) => {
          if (handle) {
            idbSet(handle, "seed", state.seed);
            idbSet(handle, "overlay", state.overlay);
          }
        });
        flash("Import applied on this phone.");
      } catch (err) {
        flash("That file is not a training export.");
      }
    };
    reader.readAsText(file);
  }

  async function resetLocal() {
    state.overlay = L.emptyOverlay();
    applyData();
    await saveOverlay();
    state.modal = null;
    flash("Local changes cleared.");
  }

  function toggleType(type) {
    const list = state.overlay.settings.preferredTypes || [];
    const i = list.indexOf(type);
    if (i >= 0) list.splice(i, 1);
    else list.push(type);
    state.overlay.settings.preferredTypes = list;
    scheduleSave();
    render();
  }

  function saveCustomEx() {
    const name = (state.modal.name || "").trim();
    if (!name) return flash("Name the exercise.");
    const muscle = state.modal.muscle || "Chest";
    state.overlay.customExercises.push({
      name: name,
      muscle: muscle,
      equipment: state.modal.equipment || "Custom",
      exercise_id: null
    });
    applyData();
    scheduleSave();
    state.modal = null;
    flash("Added on this phone.");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
