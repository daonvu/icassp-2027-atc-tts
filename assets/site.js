(function () {
  "use strict";
  const D = window.ATC_DATA;
  if (!D) {
    console.error("ATC_DATA missing");
    return;
  }
  const R = D.results;
  const COL = {
    genuine: "#a35a3a",
    base: "#5f9e5a",
    adapted: "#e28c96",
    reference: "#a89c94",
    muted: "#e2d6ce",
    ink: "#4a3730",
    ink2: "#6b5548",
    axis: "#d8cbc2",
  };
  const ARM_LABEL = {
    genuine: "Genuine recording",
    base: "Base synthesis",
    adapted: "Adapted synthesis",
    reference: "Inference reference",
  };
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const NS = "http://www.w3.org/2000/svg";

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs)
      for (const k in attrs) {
        if (k === "class") e.className = attrs[k];
        else if (k === "text") e.textContent = attrs[k];
        else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
      }
    (children || []).forEach((c) => {
      if (c === null || c === undefined) return;
      e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return e;
  }
  function S(tag, attrs, children) {
    const e = document.createElementNS(NS, tag);
    if (attrs)
      for (const k in attrs) {
        if (k === "text") e.textContent = attrs[k];
        else if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
      }
    (children || []).forEach((c) => {
      if (c) e.appendChild(c);
    });
    return e;
  }
  const fmt = {
    pp: (v, d = 3) => (v >= 0 ? "+" : "−") + Math.abs(v * 100).toFixed(d) + " pp",
    num: (v, d = 3) =>
      v === null || v === undefined || Number.isNaN(v)
        ? "—"
        : Number(v).toFixed(d).replace("-", "−"),
    signed: (v, d = 4) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d),
    time: (s) => {
      if (!isFinite(s)) return "0:00.0";
      const m = Math.floor(s / 60),
        r = s - m * 60;
      return m + ":" + (r < 10 ? "0" : "") + r.toFixed(1);
    },
  };
  const arrayMax = (a) => a.reduce((m, v) => (v > m ? v : m), -Infinity);
  const arrayMin = (a) => a.reduce((m, v) => (v < m ? v : m), Infinity);

  const tip = el("div", { class: "tip", role: "status", "aria-live": "polite" });
  document.body.appendChild(tip);
  function showTip(x, y, title, rows) {
    tip.textContent = "";
    if (title) tip.appendChild(el("div", { class: "t", text: title }));
    (rows || []).forEach((r) => {
      const row = el("div", { class: "r" });
      const left = el("span");
      if (r.color) left.appendChild(el("span", { class: "k", style: "background:" + r.color }));
      left.appendChild(document.createTextNode(r.label));
      row.appendChild(left);
      row.appendChild(el("b", { text: r.value }));
      tip.appendChild(row);
    });
    tip.classList.add("show");
    moveTip(x, y);
  }
  function moveTip(x, y) {
    const w = tip.offsetWidth,
      h = tip.offsetHeight;
    let left = x + 14,
      top = y + 14;
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    if (top + h > window.innerHeight - 8) top = y - h - 14;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function hideTip() {
    tip.classList.remove("show");
  }
  function bindTip(node, getContent) {
    node.addEventListener("pointerenter", (e) => {
      const c = getContent();
      showTip(e.clientX, e.clientY, c.title, c.rows);
    });
    node.addEventListener("pointermove", (e) => moveTip(e.clientX, e.clientY));
    node.addEventListener("pointerleave", hideTip);
    node.addEventListener("focus", () => {
      const r = node.getBoundingClientRect();
      const c = getContent();
      showTip(r.left + r.width / 2, r.top, c.title, c.rows);
    });
    node.addEventListener("blur", hideTip);
  }

  function linear(d0, d1, r0, r1) {
    const f = (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
    f.invert = (p) => d0 + ((p - r0) / (r1 - r0)) * (d1 - d0);
    return f;
  }
  function niceTicks(lo, hi, n) {
    const span = hi - lo;
    if (span <= 0) return [lo];
    const raw = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
    const t = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) t.push(+v.toFixed(10));
    return t;
  }
  function chartFrame(container, w, h, m) {
    container.textContent = "";
    const svg = S("svg", { viewBox: `0 0 ${w} ${h}`, width: "100%", role: "img" });
    container.appendChild(svg);
    return { svg, w, h, m, iw: w - m.l - m.r, ih: h - m.t - m.b };
  }
  function xAxis(f, x, y0, ticks, format, opts) {
    const g = S("g", { class: "axis" });
    g.appendChild(S("line", { x1: f.m.l, x2: f.m.l + f.iw, y1: y0, y2: y0 }));
    ticks.forEach((t) => {
      const px = x(t);
      g.appendChild(S("line", { x1: px, x2: px, y1: y0, y2: y0 + 4 }));
      g.appendChild(
        S("text", { x: px, y: y0 + 16, "text-anchor": "middle", text: format ? format(t) : t })
      );
    });
    if (opts && opts.label)
      g.appendChild(
        S("text", {
          x: f.m.l + f.iw / 2,
          y: y0 + 32,
          "text-anchor": "middle",
          class: "lbl",
          text: opts.label,
        })
      );
    f.svg.appendChild(g);
  }
  function yGrid(f, y, ticks, format, opts) {
    const g = S("g", { class: "grid" }),
      a = S("g", { class: "axis" });
    ticks.forEach((t) => {
      const py = y(t);
      g.appendChild(S("line", { x1: f.m.l, x2: f.m.l + f.iw, y1: py, y2: py }));
      a.appendChild(
        S("text", { x: f.m.l - 6, y: py + 4, "text-anchor": "end", text: format ? format(t) : t })
      );
    });
    if (opts && opts.label)
      a.appendChild(
        S("text", {
          x: 12,
          y: f.m.t + f.ih / 2,
          transform: `rotate(-90 12 ${f.m.t + f.ih / 2})`,
          "text-anchor": "middle",
          class: "lbl",
          text: opts.label,
        })
      );
    f.svg.appendChild(g);
    f.svg.appendChild(a);
  }
  function xGrid(f, x, ticks) {
    const g = S("g", { class: "grid" });
    ticks.forEach((t) =>
      g.appendChild(S("line", { x1: x(t), x2: x(t), y1: f.m.t, y2: f.m.t + f.ih }))
    );
    f.svg.appendChild(g);
  }
  function dot(svg, cx, cy, color, r, extra) {
    const c = S(
      "circle",
      Object.assign(
        { cx, cy, r: r || 5, fill: color, stroke: "#fff", "stroke-width": 2 },
        extra || {}
      )
    );
    svg.appendChild(c);
    return c;
  }

  function alignWords(ref, hyp) {
    const n = ref.length,
      m = hyp.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 0; i <= n; i++) dp[i][0] = i;
    for (let j = 0; j <= m; j++) dp[0][j] = j;
    for (let i = 1; i <= n; i++)
      for (let j = 1; j <= m; j++) {
        const c = ref[i - 1] === hyp[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j - 1] + c, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
      }
    const ops = [];
    let i = n,
      j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)) {
        ops.push([ref[i - 1] === hyp[j - 1] ? "eq" : "sub", ref[i - 1], hyp[j - 1]]);
        i--;
        j--;
      } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
        ops.push(["del", ref[i - 1], null]);
        i--;
      } else {
        ops.push(["ins", null, hyp[j - 1]]);
        j--;
      }
    }
    return ops.reverse();
  }
  function renderDiff(container, refText, hypText, label) {
    const ref = (refText || "").split(/\s+/).filter(Boolean),
      hyp = (hypText || "").split(/\s+/).filter(Boolean);
    const ops = alignWords(ref, hyp);
    const box = el("div", { class: "diff" });
    box.appendChild(el("span", { class: "lab", text: label }));
    const p = el("div");
    ops.forEach((o, idx) => {
      if (idx) p.appendChild(document.createTextNode(" "));
      if (o[0] === "eq") p.appendChild(el("span", { class: "tok", text: o[2] }));
      else if (o[0] === "sub") {
        p.appendChild(
          el("span", { class: "tok sub", text: o[2], title: "substitution for “" + o[1] + "”" })
        );
        p.appendChild(document.createTextNode(" "));
        p.appendChild(el("span", { class: "tok del", text: o[1], title: "expected word" }));
      } else if (o[0] === "del")
        p.appendChild(
          el("span", {
            class: "tok del",
            text: o[1],
            title: "deleted (expected word not recognized)",
          })
        );
      else
        p.appendChild(
          el("span", { class: "tok ins", text: o[2], title: "inserted (extra recognized word)" })
        );
    });
    box.appendChild(p);
    container.appendChild(box);
    return ops;
  }

  const CFG = window.ATC_EXAMPLES_CONFIG || {};
  window.ATC = window.ATC || {};
  window.ATC_EXAMPLES = window.ATC_EXAMPLES || [];
  window.ATC.example = function (entry) {
    const s = document.currentScript;
    const src = s && s.src;
    if (!entry.folder && src) entry.folder = src.slice(0, src.lastIndexOf("/"));
    window.ATC_EXAMPLES.push(entry);
  };
  function num(v) {
    return typeof v === "number" && isFinite(v) ? v : null;
  }
  function normalizeExample(e) {
    const files = Object.assign(
      { genuine: "genuine.wav", synthesized: "synthesized.wav", reference: "reference.wav" },
      e.files || {}
    );
    const folder = e.folder || "";
    const audioVersion = "?v=" + encodeURIComponent(e.synthesized.clipId);
    const model = String(e.model || "base").toLowerCase() === "adapted" ? "adapted" : "base";
    return {
      name: e.name || "",
      rank: num(e.rank),
      controller: e.controller || "—",
      messageId: e.messageId || "",
      text: e.text || "",
      model,
      modelLabel: model === "adapted" ? "Adapted synthesis" : "Base synthesis",
      checkpoint: e.checkpoint || (model === "adapted" ? "33 updates" : "Pretrained"),
      referenceLimit: e.referenceLimit || "—",
      referenceCrop: e.referenceCrop || "",
      referenceSourceId: e.referenceSourceId || "",
      cosine: num(e.cosine),
      wer: num(e.wer),
      notes: e.notes || "",
      synthesized: Object.assign(
        { src: folder + "/" + files.synthesized + audioVersion },
        e.synthesized || {}
      ),
      genuine:
        e.genuine === null
          ? null
          : Object.assign({ src: folder + "/" + files.genuine + audioVersion }, e.genuine || {}),
      reference:
        e.reference === null
          ? null
          : Object.assign(
              { src: folder + "/" + files.reference + audioVersion },
              e.reference || {}
            ),
      comparison: e.comparison
        ? Object.assign({}, e.comparison, {
            synthesized: Object.assign({}, e.comparison.synthesized, {
              src:
                folder +
                "/counterpart.wav?v=" +
                encodeURIComponent(e.comparison.synthesized.clipId),
            }),
          })
        : null,
      folder,
    };
  }
  function loadExamples(done) {
    const folders = (CFG.folders || []).map((f) => String(f).replace(/\/+$/, ""));
    if (!folders.length) return done([]);
    let remaining = folders.length;
    const finish = () => {
      if (--remaining === 0) done(orderExamples(window.ATC_EXAMPLES, folders));
    };
    folders.forEach((f) => {
      const s = document.createElement("script");
      s.src = f + "/example.js";
      s.async = true;
      s.onload = finish;
      s.onerror = () => {
        console.warn("Could not load " + s.src);
        finish();
      };
      document.head.appendChild(s);
    });
  }
  function orderExamples(list, folders) {
    const pos = (e) => {
      const i = folders.findIndex(
        (f) => e.folder && e.folder.endsWith("/" + f.replace(/^\.?\//, ""))
      );
      return i < 0 ? 1e9 : i;
    };
    const out = list.map(normalizeExample).sort((a, b) => {
      const ra = a.rank === null ? 1e9 : a.rank,
        rb = b.rank === null ? 1e9 : b.rank;
      return ra - rb || pos(a) - pos(b);
    });
    out.forEach((e, i) => {
      if (e.rank === null) e.rank = i + 1;
    });
    return out;
  }

  const players = [];
  let current = null;
  let cancelSequence = () => {};
  function stopPlayback() {
    cancelSequence();
    players.forEach((p) => p.audio.pause());
    current = null;
  }
  window.addEventListener("pagehide", stopPlayback);
  function chooseControllerRecordings(example, previous = [], random = Math.random) {
    const controller = example.referenceSourceId.split("_")[0];
    const unique = new Map();
    (CFG.controllerRecordings[controller] || []).forEach((recording) => {
      if (
        recording.controller === controller &&
        recording.sourceId !== example.referenceSourceId &&
        recording.sourceId !== example.messageId
      )
        unique.set(recording.sourceId, recording);
    });
    const pool = Array.from(unique.values());
    const fresh = pool.filter((r) => !previous.includes(r.sourceId));
    const shuffled = (fresh.length >= 4 ? fresh : pool).slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 4);
  }
  function decodePeaks(src, bins) {
    return fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.arrayBuffer();
      })
      .then(
        (buf) =>
          new Promise((res, rej) => {
            const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
            if (!Ctx) return rej(new Error("no audio decoder"));
            const ctx = new Ctx(1, 1, 24000);
            const pr = ctx.decodeAudioData(buf, res, rej);
            if (pr && pr.then) pr.then(res, rej);
          })
      )
      .then((ab) => {
        const ch = ab.getChannelData(0);
        const step = ch.length / bins;
        const p = new Array(bins);
        let mx = 0;
        for (let i = 0; i < bins; i++) {
          let m = 0;
          const s0 = Math.floor(i * step),
            e0 = Math.min(ch.length, Math.floor((i + 1) * step));
          for (let j = s0; j < e0; j++) {
            const v = Math.abs(ch[j]);
            if (v > m) m = v;
          }
          p[i] = m;
          if (m > mx) mx = m;
        }
        return { p: p.map((v) => (mx ? v / mx : 0)), dur: ab.duration };
      });
  }
  function makePlayer(track) {
    const wrap = el("div", { class: "player", "data-arm": track.arm });
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = track.src;
    audio.hidden = true;
    wrap.appendChild(audio);
    let destroyed = false;
    const btn = el("button", { class: "play", type: "button", "aria-label": "Play " + track.name });
    const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
    const ICON_PAUSE =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
    btn.innerHTML = ICON_PLAY;
    const meta = el("div", { class: "meta" }, [
      el("span", { class: "name" }, [
        el("span", { class: "arm-dot", "aria-hidden": "true" }),
        track.name,
        track.sub ? el("small", { text: " · " + track.sub }) : null,
      ]),
      el("span", { class: "time", text: "0:00.0 / " + fmt.time(track.durationSeconds || 0) }),
    ]);
    const canvas = el("canvas", {
      class: "waveform",
      role: "slider",
      tabindex: "0",
      "aria-label": "Seek " + track.name,
      "aria-valuemin": "0",
      "aria-valuemax": "100",
      "aria-valuenow": "0",
      "aria-valuetext": "0 seconds",
    });
    const row = el("div", { class: "row" }, [btn, canvas]);
    wrap.appendChild(meta);
    wrap.appendChild(row);
    const timeEl = meta.querySelector(".time");
    const color = COL[track.arm] || COL.reference;
    const dur = () =>
      audio.duration || track.durationSeconds || (track.peaks && track.peaks.dur) || 0;
    function draw() {
      const rect = canvas.getBoundingClientRect();
      if (destroyed || rect.width === 0) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      const ctx = canvas.getContext("2d");
      ctx.scale(ratio, ratio);
      const W = rect.width,
        H = rect.height,
        mid = H / 2;
      ctx.clearRect(0, 0, W, H);
      const d = dur();
      const prog = d ? audio.currentTime / d : 0;
      const p = track.peaks ? track.peaks.p : null;
      if (!p) {
        ctx.fillStyle = "#e9d8cc";
        ctx.fillRect(0, mid - 1.5, W, 3);
        if (prog > 0) {
          ctx.fillStyle = color;
          ctx.fillRect(0, mid - 1.5, prog * W, 3);
        }
        return;
      }
      const n = p.length;
      const barW = W / n;
      for (let i = 0; i < n; i++) {
        const h = Math.max(1.5, p[i] * (H - 6));
        ctx.fillStyle = i / n <= prog ? color : "#e9d8cc";
        ctx.fillRect(i * barW + 0.25, mid - h / 2, Math.max(0.8, barW - 0.5), h);
      }
      if (prog > 0) {
        ctx.fillStyle = color;
        ctx.fillRect(prog * W - 0.5, 2, 1, H - 4);
      }
    }
    function updateTime() {
      const d = dur();
      timeEl.textContent = fmt.time(audio.currentTime) + " / " + fmt.time(d);
      const pct = d ? Math.round((audio.currentTime / d) * 100) : 0;
      canvas.setAttribute("aria-valuenow", String(pct));
      canvas.setAttribute("aria-valuetext", fmt.num(audio.currentTime, 1) + " seconds");
    }
    function setPlaying(on) {
      btn.innerHTML = on ? ICON_PAUSE : ICON_PLAY;
      btn.setAttribute("aria-label", (on ? "Pause " : "Play ") + track.name);
    }
    const api = {
      audio,
      wrap,
      draw,
      play(inSequence = false) {
        if (!inSequence) cancelSequence();
        if (current && current !== api) current.audio.pause();
        current = api;
        return audio.play().catch(() => {
          if (!destroyed && current === api) {
            cancelSequence();
            $("#listen-status").textContent = "Audio could not play. Try the play button again.";
          }
        });
      },
      pause() {
        cancelSequence();
        audio.pause();
      },
      destroy() {
        destroyed = true;
        audio.pause();
        cancelAnimationFrame(raf);
        audio.removeAttribute("src");
        audio.load();
        const index = players.indexOf(api);
        if (index >= 0) players.splice(index, 1);
        if (current === api) current = null;
      },
      seekFrac(f) {
        const d = dur();
        audio.currentTime = Math.max(0, Math.min(d, f * d));
        updateTime();
        draw();
      },
    };
    btn.addEventListener("click", () => {
      if (audio.paused) api.play();
      else api.pause();
    });
    canvas.addEventListener("click", (e) => {
      const r = canvas.getBoundingClientRect();
      api.seekFrac((e.clientX - r.left) / r.width);
    });
    canvas.addEventListener("keydown", (e) => {
      const d = dur() || 1;
      if (e.key === "ArrowRight") {
        audio.currentTime = Math.min(d, audio.currentTime + 0.5);
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        audio.currentTime = Math.max(0, audio.currentTime - 0.5);
        e.preventDefault();
      } else if (e.key === "Home") {
        audio.currentTime = 0;
        e.preventDefault();
      } else if (e.key === " " || e.key === "Enter") {
        if (audio.paused) api.play();
        else api.pause();
        e.preventDefault();
      }
      updateTime();
      draw();
    });
    audio.addEventListener("play", () => setPlaying(true));
    audio.addEventListener("error", () => {
      if (!destroyed) {
        cancelSequence();
        $("#listen-status").textContent =
          "Could not load " + track.name + ". Reload the page to try again.";
      }
    });
    audio.addEventListener("pause", () => setPlaying(false));
    audio.addEventListener("ended", () => {
      setPlaying(false);
      audio.currentTime = 0;
      updateTime();
      draw();
      wrap.dispatchEvent(new CustomEvent("trackended"));
    });
    audio.addEventListener("timeupdate", () => {
      updateTime();
      draw();
    });
    audio.addEventListener("loadedmetadata", () => {
      updateTime();
      wrap.dispatchEvent(new CustomEvent("durationknown"));
    });
    let raf;
    audio.addEventListener("playing", function loop() {
      if (!audio.paused) {
        draw();
        raf = requestAnimationFrame(loop);
      }
    });
    audio.addEventListener("pause", () => cancelAnimationFrame(raf));
    players.push(api);
    requestAnimationFrame(draw);
    decodePeaks(track.src, 400)
      .then((pk) => {
        track.peaks = pk;
        draw();
        updateTime();
      })
      .catch(() => {
        draw();
      });
    return api;
  }
  window.addEventListener("resize", () => players.forEach((p) => p.draw()));

  function renderExamples(examples) {
    const list = $("#strip-list");
    if (!list) return;
    list.textContent = "";
    const noteBox = $("#listen-note");
    if (noteBox) {
      const note =
        CFG.selectionNote ||
        "These clips are curated examples chosen by the authors; they are not a random or representative sample of the study’s outputs.";
      noteBox.textContent = "";
      (Array.isArray(note) ? note : [note]).forEach((t, i) => {
        const p = el("p", { text: t });
        if (i === (Array.isArray(note) ? note.length : 1) - 1) p.style.marginBottom = "0";
        noteBox.appendChild(p);
      });
    }
    const header = $(".topbar");
    const updateHeaderHeight = () => {
      document.documentElement.style.setProperty(
        "--listen-header-height",
        header.getBoundingClientRect().height + "px"
      );
    };
    new ResizeObserver(updateHeaderHeight).observe(header);
    updateHeaderHeight();
    const total = examples.length;
    const select = $("#sample-select");
    select.replaceChildren(
      ...examples.map((ex, index) =>
        el("option", { value: String(index), text: "Sample " + (index + 1) })
      )
    );
    let selectedIndex = 0;
    const saved = /^#sample-(\d+)$/.exec(location.hash);
    if (saved && Number(saved[1]) >= 1 && Number(saved[1]) <= total)
      selectedIndex = Number(saved[1]) - 1;
    function renderSample() {
      stopPlayback();
      players.slice().forEach((p) => p.destroy());
      list.replaceChildren();
      $("#listen-status").textContent = "";
      select.value = String(selectedIndex);
      $("#sample-previous").disabled = selectedIndex === 0;
      $("#sample-next").disabled = selectedIndex === total - 1;
      $("#listen-count").textContent = "Sample " + (selectedIndex + 1) + " of " + total;
      const ex = examples[selectedIndex];
      history.replaceState(null, "", "#sample-" + (selectedIndex + 1));
      const g = ex.genuine,
        r = ex.reference;
      const strip = el("article", {
        class: "strip",
        "data-rank": ex.rank,
        id: "clip-" + ex.rank,
        "aria-labelledby": "clip-title-" + ex.rank,
      });
      strip.appendChild(
        el("header", { class: "sample-heading" }, [
          el("h2", { id: "clip-title-" + ex.rank, text: "Sample " + ex.rank }),
          el("p", { text: "Controller " + ex.controller + " · " + ex.messageId }),
        ])
      );
      const body = el("div", { class: "paired-body" });
      const message = el("section", {
        class: "message-panel",
        "aria-label": "Message and transcript",
      });
      message.appendChild(
        el("p", { class: "transcript" }, [
          el("span", { class: "q", text: "Inference text" }),
          el("span", { text: ex.text }),
        ])
      );
      if (g.hypothesis) {
        const differences = renderDiff(
          message,
          ex.synthesized.expected,
          g.hypothesis,
          "Original recognizer transcript"
        );
        if (differences.some((word) => word[0] !== "eq"))
          message.appendChild(
            el("p", {
              class: "transcript-note",
              text: "Highlights show recognizer differences. Struck-through words were not recovered as written.",
            })
          );
      }
      body.appendChild(message);
      const pl = el("div", { class: "players" });
      const pR = makePlayer({
        src: r.src,
        arm: "reference",
        name: "Reference audio",
        sub: ex.referenceCrop + " excerpt · " + ex.referenceLimit + " limit",
        durationSeconds: r.durationSeconds,
      });
      const pG = makePlayer({
        src: g.src,
        arm: "genuine",
        name: "Original",
        sub: "Recorded controller speech",
        durationSeconds: g.durationSeconds,
      });
      const models = [
        Object.assign({}, ex, { approved: true }),
        Object.assign({}, ex.comparison, { approved: false }),
      ].sort((a, b) => (a.model === b.model ? 0 : a.model === "adapted" ? -1 : 1));
      const synthPlayers = [];
      models.forEach((model) => {
        const label = model.model === "base" ? "Base model" : "Adapted model";
        const audio = model.synthesized;
        const column = el("section", {
          class: "model-column",
          "data-model": model.model,
          "data-clip-id": audio.clipId,
          "aria-label": label,
        });
        column.appendChild(
          el("div", { class: "model-heading" }, [
            el("h3", { text: label }),
            el("span", {
              class: "selection-label",
              text: model.approved ? "Author-selected" : "Matched comparison",
            }),
          ])
        );
        column.appendChild(
          el("p", {
            class: "caption",
            text: model.model === "base" ? "Pretrained Chatterbox" : "Fine-tuned Chatterbox",
          })
        );
        const player = makePlayer({
          src: audio.src,
          arm: model.model,
          name: model.model === "base" ? "Base synthesized" : "Adapted synthesized",
          durationSeconds: audio.durationSeconds,
        });
        synthPlayers.push(player);
        column.appendChild(player.wrap);
        const duration = metric("Duration", fmt.num(audio.durationSeconds, 2) + " s", "");
        const measurements = el("div", { class: "comparison-metrics" }, [
          metric("Speaker cosine", fmt.num(model.cosine, 3), "to original"),
          metric("Recognizer WER", fmt.num(model.wer * 100, 1) + "%", "Whisper-ATC"),
          duration,
          metric("UTMOSv2", fmt.num(audio.utmos, 2), "predicted naturalness"),
        ]);
        player.wrap.addEventListener("durationknown", () => {
          duration.querySelector(".v").firstChild.textContent =
            fmt.num(player.audio.duration, 2) + " s";
        });
        const detail = el("details", { class: "disclosure" }, [
          el("summary", { text: label + " details" }),
        ]);
        const inner = el("div", { class: "inner" });
        inner.appendChild(measurements);
        const provenance = [
          [
            "Model",
            model.model === "base"
              ? "Pretrained Chatterbox"
              : "33-update LoRA, target controller excluded",
          ],
          ["Clip ID", audio.clipId],
          ["Panel", audio.panel],
        ];
        if (model.approved) provenance.push(["Approved sample name", ex.name]);
        const dl = el("dl", { class: "detail-grid" });
        provenance.forEach(([key, value]) => {
          dl.append(el("dt", { text: key }), el("dd", { text: value }));
        });
        inner.appendChild(dl);
        if (audio.hypothesis)
          renderDiff(
            inner,
            audio.expected || ex.text.toLowerCase(),
            audio.hypothesis,
            "Recognizer transcript"
          );
        detail.appendChild(inner);
        column.appendChild(detail);
        pl.appendChild(column);
      });
      pl.appendChild(
        el(
          "section",
          { class: "recording-panel", "aria-label": "Reference and original recordings" },
          [pR.wrap, pG.wrap]
        )
      );
      body.appendChild(pl);
      const ab = el("div", { class: "ab" });
      const allButton = el("button", {
        class: "btn btn-outline",
        type: "button",
        text: "Play all four",
      });
      allButton.addEventListener("click", () => {
        if (allButton.textContent === "Stop playback") {
          stopPlayback();
          return;
        }
        stopPlayback();
        const queue = [...synthPlayers, pR, pG];
        let index = 0;
        const advance = () => {
          if (++index < queue.length) {
            queue[index].seekFrac(0);
            queue[index].play(true);
          } else cancelSequence();
        };
        cancelSequence = () => {
          queue.forEach((p) => p.wrap.removeEventListener("trackended", advance));
          allButton.textContent = "Play all four";
          cancelSequence = () => {};
        };
        queue.forEach((p) => p.wrap.addEventListener("trackended", advance));
        allButton.textContent = "Stop playback";
        queue[0].seekFrac(0);
        queue[0].play(true);
      });
      ab.append(
        allButton,
        el("span", { class: "caption", text: "Adapted → Base → Reference → Original" })
      );
      body.insertBefore(ab, pl);
      strip.appendChild(body);
      const controller = ex.referenceSourceId.split("_")[0];
      const more = el("section", {
        class: "controller-extras",
        "aria-label": "More of controller " + controller,
      });
      const shuffle = el("button", {
        class: "btn btn-outline",
        type: "button",
        text: "Shuffle four clips",
      });
      more.appendChild(
        el("div", { class: "controller-heading" }, [
          el("h3", { text: "More of this controller" }),
          shuffle,
        ])
      );
      more.appendChild(
        el("p", {
          class: "caption",
          text:
            "Four other genuine recordings of controller " +
            controller +
            ". The reference source and the original above are excluded.",
        })
      );
      const recordings = el("div", { class: "controller-recordings" });
      more.appendChild(recordings);
      let extraPlayers = [],
        previous = [];
      function showRecordings() {
        extraPlayers.forEach((p) => p.destroy());
        extraPlayers = [];
        recordings.replaceChildren();
        const chosen = chooseControllerRecordings(ex, previous);
        previous = chosen.map((r) => r.sourceId);
        chosen.forEach((recording) => {
          const row = el("div", {
            class: "controller-recording",
            "data-source-id": recording.sourceId,
            "data-controller": recording.controller,
          });
          row.appendChild(el("p", { text: recording.text }));
          const player = makePlayer({
            src: recording.src,
            arm: "genuine",
            name: recording.sourceId,
            durationSeconds: recording.durationSeconds,
          });
          extraPlayers.push(player);
          row.appendChild(player.wrap);
          recordings.appendChild(row);
        });
      }
      shuffle.addEventListener("click", showRecordings);
      strip.appendChild(more);
      list.appendChild(strip);
      showRecordings();
    }
    function metric(k, v, sub) {
      return el("div", { class: "metric" }, [
        el("div", { class: "k", text: k }),
        el("div", { class: "v" }, [v, el("small", { text: sub ? " " + sub : "" })]),
      ]);
    }
    select.addEventListener("change", () => {
      selectedIndex = Number(select.value);
      renderSample();
    });
    $("#sample-previous").addEventListener("click", () => {
      if (selectedIndex > 0) {
        selectedIndex--;
        renderSample();
      }
    });
    $("#sample-next").addEventListener("click", () => {
      if (selectedIndex < total - 1) {
        selectedIndex++;
        renderSample();
      }
    });
    window.addEventListener("hashchange", () => {
      const match = /^#sample-(\d+)$/.exec(location.hash);
      if (match && Number(match[1]) >= 1 && Number(match[1]) <= total) {
        selectedIndex = Number(match[1]) - 1;
        renderSample();
      }
    });
    renderSample();
  }

  const METRIC_INFO = {
    wer: { label: "Whisper-ATC WER (%)", dir: "lower", scale: 100, d: 3, primary: true },
    absolute_log_duration_error: {
      label: "Log-duration error",
      dir: "lower",
      scale: 1,
      d: 4,
      primary: true,
    },
    absolute_pause_fraction_error: { label: "Pause-fraction error", dir: "lower", scale: 1, d: 4 },
    modulation_distance: { label: "Envelope distance", dir: "lower", scale: 1, d: 4 },
    absolute_f0_median_error_semitones: {
      label: "Pitch-median error (semitones)",
      dir: "lower",
      scale: 1,
      d: 3,
    },
    absolute_f0_range_semitones_error: {
      label: "Pitch-range error (semitones)",
      dir: "lower",
      scale: 1,
      d: 3,
    },
    absolute_f0_theil_sen_st_per_utterance_error: {
      label: "Pitch-slope error (semitones/utterance)",
      dir: "lower",
      scale: 1,
      d: 3,
    },
    speaker_cosine_to_genuine: { label: "Speaker cosine", dir: "higher", scale: 1, d: 4 },
    utmosv2_predicted_mos: { label: "UTMOSv2", dir: "higher", scale: 1, d: 3 },
    scoreq_predicted_mos: { label: "SCOREQ", dir: "higher", scale: 1, d: 3 },
  };
  const TABLE1_ORDER = [
    "wer",
    "absolute_log_duration_error",
    "absolute_pause_fraction_error",
    "modulation_distance",
    "absolute_f0_median_error_semitones",
    "absolute_f0_range_semitones_error",
    "absolute_f0_theil_sen_st_per_utterance_error",
    "speaker_cosine_to_genuine",
    "utmosv2_predicted_mos",
    "scoreq_predicted_mos",
  ];
  function intervalBar(est, lo, hi, scaleAbs, tol) {
    const W = 150,
      H = 18,
      mid = W / 2;
    const x = linear(-scaleAbs, scaleAbs, 4, W - 4);
    const svg = S("svg", { viewBox: `0 0 ${W} ${H}`, class: "ival", "aria-hidden": "true" });
    svg.appendChild(
      S("line", { x1: x(0), x2: x(0), y1: 2, y2: H - 2, stroke: COL.axis, "stroke-width": 1 })
    );
    if (tol !== undefined)
      svg.appendChild(
        S("line", {
          x1: x(tol),
          x2: x(tol),
          y1: 2,
          y2: H - 2,
          stroke: "#7a5a48",
          "stroke-width": 1,
          "stroke-dasharray": "2 2",
        })
      );
    const excl = lo > 0 || hi < 0;
    svg.appendChild(
      S("line", {
        x1: x(lo),
        x2: x(hi),
        y1: H / 2,
        y2: H / 2,
        stroke: excl ? COL.ink : "#b8a89f",
        "stroke-width": 2,
        "stroke-linecap": "round",
      })
    );
    svg.appendChild(
      S("circle", { cx: x(est), cy: H / 2, r: 3.5, fill: excl ? COL.ink : "#b8a89f" })
    );
    return svg;
  }
  function renderPrimaryTable() {
    const tbody = $("#tbl-primary tbody");
    if (!tbody) return;
    const rows = {};
    R.main_results.forEach((r) => (rows[r.metric] = r));
    TABLE1_ORDER.forEach((m, idx) => {
      const r = rows[m],
        info = METRIC_INFO[m];
      if (!r) return;
      const base = r.baseline_mean * info.scale,
        adapted = r.candidate_mean * info.scale;
      const est = r.estimate * info.scale,
        lo = r.interval_low * info.scale,
        hi = r.interval_high * info.scale;
      const betterBase = info.dir === "lower" ? base < adapted : base > adapted;
      const excl = lo > 0 || hi < 0;
      const tr = el("tr", {
        class: (info.primary ? "primary-row" : "") + (idx === 2 ? " rule" : ""),
      });
      tr.appendChild(
        el("td", {}, [
          info.label,
          el("span", {
            class: "dir",
            text: info.dir === "lower" ? "↓" : "↑",
            title: info.dir === "lower" ? "lower is preferred" : "higher is preferred",
          }),
          info.primary
            ? el("span", { class: "tag", text: "primary", style: "margin-left:6px" })
            : null,
        ])
      );
      tr.appendChild(
        el("td", { class: "num" + (betterBase ? " better" : ""), text: fmt.num(base, info.d) })
      );
      tr.appendChild(
        el("td", { class: "num" + (!betterBase ? " better" : ""), text: fmt.num(adapted, info.d) })
      );
      tr.appendChild(
        el("td", { class: "num" + (excl ? " excl" : ""), text: fmt.signed(est, info.d) })
      );
      const cell = el("td", { class: "interval-cell" });
      const scaleAbs = Math.max(Math.abs(lo), Math.abs(hi), m === "wer" ? 1.0 : 0) * 1.15;
      cell.appendChild(intervalBar(est, lo, hi, scaleAbs, m === "wer" ? 1.0 : undefined));
      cell.appendChild(
        el("span", {
          class: "mono",
          style: "font-size:.8rem;color:#6b7280;margin-left:6px",
          text: `[${fmt.num(lo, info.d)}, ${fmt.num(hi, info.d)}]`,
        })
      );
      tr.appendChild(cell);
      tr.appendChild(el("td", { class: "num", text: r.complete_messages }));
      bindTip(tr, () => ({
        title: info.label,
        rows: [
          { label: "base mean", value: fmt.num(base, info.d), color: COL.base },
          { label: "adapted mean", value: fmt.num(adapted, info.d), color: COL.adapted },
          { label: "Δ adapted − base", value: fmt.signed(est, info.d) },
          { label: "95% interval", value: `[${fmt.num(lo, info.d)}, ${fmt.num(hi, info.d)}]` },
          { label: "messages", value: `${r.complete_messages} of ${r.planned_messages}` },
          { label: "interval excludes 0", value: excl ? "yes" : "no" },
        ],
      }));
      tbody.appendChild(tr);
    });
  }

  function renderRefLen(container, metric, opts) {
    const panel = R.reference_panel;
    const rc = R.reference_comparisons.filter(
      (r) => r.family === "native_same_budget" && r.metric === metric
    );
    const W = Math.max(300, container.clientWidth || 360),
      H = 300;
    const f = chartFrame(container, W, H, { l: 52, r: 18, t: 30, b: 42 });
    const secs = [2, 4, 6, 8];
    const x = linear(1, 9, f.m.l, f.m.l + f.iw);
    const vals = [];
    panel.forEach((p) => {
      vals.push(p.base[metric] * opts.scale, p.adapted[metric] * opts.scale);
    });
    let lo = arrayMin(vals),
      hi = arrayMax(vals);
    const pad = (hi - lo) * 0.35 || 1;
    lo -= pad;
    hi += pad;
    const y = linear(lo, hi, f.m.t + f.ih, f.m.t);
    yGrid(f, y, niceTicks(lo, hi, 5), (v) => opts.fmt(v), { label: opts.axis });
    xAxis(f, x, f.m.t + f.ih, secs, (v) => v + " s", { label: "reference limit" });
    f.svg.appendChild(S("text", { x: f.m.l, y: 16, class: "title", text: opts.title }));
    ["base", "adapted"].forEach((arm) => {
      const pts = panel
        .filter((p) => p.seconds <= 6)
        .map((p) => [x(p.seconds), y(p[arm][metric] * opts.scale)]);
      f.svg.appendChild(
        S("path", {
          d: "M" + pts.map((p) => p.join(",")).join("L"),
          fill: "none",
          stroke: COL[arm],
          "stroke-width": 2,
          "stroke-linejoin": "round",
        })
      );
      panel.forEach((p) => {
        const v = p[arm][metric] * opts.scale;
        const c = dot(
          f.svg,
          x(p.seconds),
          y(v),
          COL[arm],
          p.seconds === 8 ? 5 : 5,
          p.seconds === 8 ? { fill: "#fff", stroke: COL[arm], "stroke-width": 2.5 } : {}
        );
        const hit = S("circle", { cx: x(p.seconds), cy: y(v), r: 12, class: "hit", tabindex: "0" });
        const chg = rc.find((r) => r.candidate_budget === p.seconds);
        bindTip(hit, () => ({
          title: `${ARM_LABEL[arm]} · ${p.seconds}-s limit`,
          rows: [
            { label: opts.axis, value: opts.fmt(v), color: COL[arm] },
            { label: "messages", value: `${p.messages} (${p.controllers} controllers)` },
            { label: "mean actual reference", value: fmt.num(p.reference_actual_mean, 3) + " s" },
            chg
              ? {
                  label: "Δ adapted − base",
                  value: `${fmt.signed(chg.estimate * opts.scale, opts.d)} [${fmt.num(chg.interval_low * opts.scale, opts.d)}, ${fmt.num(chg.interval_high * opts.scale, opts.d)}]`,
                }
              : null,
          ].filter(Boolean),
        }));
        f.svg.appendChild(hit);
      });

      const last = panel.find((p) => p.seconds === 6);
      f.svg.appendChild(
        S("text", {
          x: x(6) + 10,
          y: y(last[arm][metric] * opts.scale) + (arm === "base" ? -6 : 12),
          class: "lbl",
          text: arm === "base" ? "base" : "adapted",
        })
      );
    });
    f.svg.appendChild(
      S("text", {
        x: x(8),
        y: f.m.t + f.ih - 6,
        class: "sub",
        "text-anchor": "middle",
        text: "separate 50-msg subset",
      })
    );
  }
  function renderRefChange(container, metric, opts) {
    const rc = R.reference_comparisons.filter(
      (r) => r.family === "native_same_budget" && r.metric === metric && r.status === "ok"
    );
    const W = Math.max(300, container.clientWidth || 360),
      H = 210;
    const f = chartFrame(container, W, H, { l: 52, r: 18, t: 30, b: 42 });
    const x = linear(1, 9, f.m.l, f.m.l + f.iw);
    const vals = [];
    rc.forEach((r) => vals.push(r.interval_low * opts.scale, r.interval_high * opts.scale));
    if (opts.tol !== undefined) vals.push(opts.tol);
    let lo = Math.min(0, arrayMin(vals)),
      hi = Math.max(0, arrayMax(vals));
    const pad = (hi - lo) * 0.2 || 1;
    lo -= pad;
    hi += pad;
    const y = linear(lo, hi, f.m.t + f.ih, f.m.t);
    yGrid(f, y, niceTicks(lo, hi, 4), (v) => opts.fmt(v), { label: "Δ adapted − base" });
    xAxis(f, x, f.m.t + f.ih, [2, 4, 6, 8], (v) => v + " s", { label: "reference limit" });
    f.svg.appendChild(
      S("line", {
        x1: f.m.l,
        x2: f.m.l + f.iw,
        y1: y(0),
        y2: y(0),
        stroke: COL.ink2,
        "stroke-width": 1,
      })
    );
    if (opts.tol !== undefined) {
      f.svg.appendChild(
        S("line", {
          x1: f.m.l,
          x2: f.m.l + f.iw,
          y1: y(opts.tol),
          y2: y(opts.tol),
          stroke: "#7a5a48",
          "stroke-width": 1,
          "stroke-dasharray": "4 3",
        })
      );
    }
    f.svg.appendChild(S("text", { x: f.m.l, y: 16, class: "title", text: opts.title }));
    rc.forEach((r) => {
      const px = x(r.candidate_budget);
      const e = r.estimate * opts.scale,
        l = r.interval_low * opts.scale,
        h = r.interval_high * opts.scale;
      const excl = l > 0 || h < 0;
      const col = excl ? COL.ink : "#b8a89f";
      f.svg.appendChild(
        S("line", {
          x1: px,
          x2: px,
          y1: y(l),
          y2: y(h),
          stroke: col,
          "stroke-width": 2,
          "stroke-linecap": "round",
        })
      );
      dot(f.svg, px, y(e), col, 5);
      const hit = S("rect", {
        x: px - 14,
        y: f.m.t,
        width: 28,
        height: f.ih,
        class: "hit",
        tabindex: "0",
      });
      bindTip(hit, () => ({
        title: `${r.candidate_budget}-s limit · paired change`,
        rows: [
          { label: "Δ adapted − base", value: fmt.signed(e, opts.d) },
          { label: "95% interval", value: `[${fmt.num(l, opts.d)}, ${fmt.num(h, opts.d)}]` },
          { label: "messages", value: `${r.complete_messages} (${r.groups} controllers)` },
          { label: "excludes 0", value: excl ? "yes" : "no" },
        ],
      }));
      f.svg.appendChild(hit);
    });
  }

  function renderTiming(container) {
    const tc = R.timing_components;
    const labels = {
      active_seconds: "Energy-active speech",
      internal_pause_seconds: "Internal pauses (≥ 140 ms)",
      edge_inactivity_seconds: "Leading and trailing inactivity",
      unclassified_internal_seconds: "Shorter gaps and residual",
    };
    const order = [
      "active_seconds",
      "internal_pause_seconds",
      "edge_inactivity_seconds",
      "unclassified_internal_seconds",
    ];
    const W = Math.max(480, container.clientWidth || 640),
      H = 230;
    const f = chartFrame(container, W, H, { l: 220, r: 70, t: 26, b: 40 });
    const maxv = arrayMax(tc.map((r) => Math.max(r.baseline_mean, r.candidate_mean))) * 1.1;
    const x = linear(0, maxv, f.m.l, f.m.l + f.iw);
    const rowH = f.ih / order.length;
    xGrid(f, x, niceTicks(0, maxv, 5));
    xAxis(f, x, f.m.t + f.ih, niceTicks(0, maxv, 5), (v) => fmt.num(v, 1), {
      label: "mean seconds per message (270 messages, equal controller weights)",
    });
    order.forEach((k, i) => {
      const r = tc.find((t) => t.metric === k);
      const y0 = f.m.t + i * rowH;
      f.svg.appendChild(
        S("text", {
          x: f.m.l - 10,
          y: y0 + rowH / 2 + 4,
          "text-anchor": "end",
          class: "lbl",
          text: labels[k],
        })
      );
      [
        ["base", r.baseline_mean],
        ["adapted", r.candidate_mean],
      ].forEach(([arm, v], j) => {
        const bh = Math.min(16, rowH / 2 - 4);
        const by = y0 + rowH / 2 - bh - 1 + j * (bh + 2);
        f.svg.appendChild(
          S("rect", { x: x(0), y: by, width: x(v) - x(0), height: bh, fill: COL[arm], rx: 3 })
        );
        f.svg.appendChild(
          S("text", { x: x(v) + 6, y: by + bh - 3, class: "lbl", text: fmt.num(v, 3) + " s" })
        );
        const hit = S("rect", {
          x: f.m.l,
          y: by,
          width: f.iw,
          height: bh,
          class: "hit",
          tabindex: "0",
        });
        bindTip(hit, () => ({
          title: labels[k],
          rows: [
            { label: ARM_LABEL[arm], value: fmt.num(v, 4) + " s", color: COL[arm] },
            { label: "Δ adapted − base", value: fmt.signed(r.estimate, 4) + " s" },
            {
              label: "95% interval",
              value: `[${fmt.num(r.interval_low, 4)}, ${fmt.num(r.interval_high, 4)}]`,
            },
          ],
        }));
        f.svg.appendChild(hit);
      });
    });
  }

  function renderCheckpoints(container, key, opts) {
    const cps = R.checkpoints;
    const W = Math.max(300, container.clientWidth || 360),
      H = 240;
    const f = chartFrame(container, W, H, { l: 56, r: 18, t: 30, b: 44 });
    const xs = cps.map((c) => c.checkpoint);
    const x = linear(Math.log2(12), Math.log2(700), f.m.l, f.m.l + f.iw);
    const X = (v) => x(Math.log2(v));
    const vals = [];
    cps.forEach((c) => {
      const d = c[key];
      if (d && d.interval_low !== undefined)
        vals.push(d.interval_low * opts.scale, d.interval_high * opts.scale);
    });
    if (opts.tol !== undefined) vals.push(opts.tol);
    let lo = Math.min(0, arrayMin(vals)),
      hi = Math.max(0, arrayMax(vals));
    const pad = (hi - lo) * 0.18;
    lo -= pad;
    hi += pad;
    const y = linear(lo, hi, f.m.t + f.ih, f.m.t);
    yGrid(f, y, niceTicks(lo, hi, 4), (v) => opts.fmt(v), { label: "Δ vs. base" });
    xAxis(f, X, f.m.t + f.ih, xs, (v) => v, { label: "optimizer updates (log scale)" });
    f.svg.appendChild(
      S("line", {
        x1: f.m.l,
        x2: f.m.l + f.iw,
        y1: y(0),
        y2: y(0),
        stroke: COL.ink2,
        "stroke-width": 1,
      })
    );
    if (opts.tol !== undefined) {
      f.svg.appendChild(
        S("line", {
          x1: f.m.l,
          x2: f.m.l + f.iw,
          y1: y(opts.tol),
          y2: y(opts.tol),
          stroke: "#7a5a48",
          "stroke-width": 1,
          "stroke-dasharray": "4 3",
        })
      );
    }
    f.svg.appendChild(S("text", { x: f.m.l, y: 16, class: "title", text: opts.title }));
    cps.forEach((c) => {
      const d = c[key];
      if (!d || d.estimate === undefined) return;
      const px = X(c.checkpoint),
        e = d.estimate * opts.scale,
        l = d.interval_low * opts.scale,
        h = d.interval_high * opts.scale;
      const sel = c.checkpoint === 33;
      const col = sel ? COL.adapted : c.qualifies ? COL.ink2 : "#cdbfb6";
      f.svg.appendChild(
        S("line", {
          x1: px,
          x2: px,
          y1: y(l),
          y2: y(h),
          stroke: col,
          "stroke-width": 2,
          "stroke-linecap": "round",
        })
      );
      dot(f.svg, px, y(e), col, sel ? 6 : 4.5);
      if (sel)
        f.svg.appendChild(
          S("text", {
            x: px,
            y: y(l) + 16,
            class: "lbl",
            "text-anchor": "middle",
            text: "selected",
            fill: COL.adapted,
            "font-weight": 600,
          })
        );
      const hit = S("rect", {
        x: px - 12,
        y: f.m.t,
        width: 24,
        height: f.ih,
        class: "hit",
        tabindex: "0",
      });
      bindTip(hit, () => ({
        title: `${c.checkpoint} updates${sel ? " (selected)" : ""}`,
        rows: [
          { label: "base mean", value: opts.fmt(d.baseline_mean * opts.scale) },
          { label: "candidate mean", value: opts.fmt(d.candidate_mean * opts.scale) },
          { label: "Δ", value: fmt.signed(e, opts.d) },
          { label: "95% interval", value: `[${fmt.num(l, opts.d)}, ${fmt.num(h, opts.d)}]` },
          { label: "upper bound", value: fmt.num(d.upper_bound * opts.scale, opts.d) },
          { label: "eligible", value: c.qualifies ? "yes" : "no" },
        ],
      }));
      f.svg.appendChild(hit);
    });
  }
  function renderLoss(container) {
    const curves = R.train_curves;
    const seed = "104729";
    const c = curves[seed] || [];
    if (!c.length) {
      container.textContent = "";
      return;
    }
    const W = Math.max(300, container.clientWidth || 360),
      H = 240;
    const f = chartFrame(container, W, H, { l: 56, r: 18, t: 30, b: 44 });
    const x = linear(0, Math.log2(700), f.m.l, f.m.l + f.iw);
    const X = (u) => x(Math.log2(u));
    const ys = c.map((p) => p[1]);
    const lo = arrayMin(ys) * 0.96,
      hi = arrayMax(ys) * 1.02;
    const y = linear(lo, hi, f.m.t + f.ih, f.m.t);
    yGrid(f, y, niceTicks(lo, hi, 4), (v) => fmt.num(v, 1), {
      label: "training loss (mean over folds)",
    });
    xAxis(f, X, f.m.t + f.ih, [1, 4, 16, 33, 66, 132, 264, 528], (v) => v, {
      label: "optimizer updates (log scale)",
    });
    f.svg.appendChild(
      S("text", { x: f.m.l, y: 16, class: "title", text: "Development fit, first training seed" })
    );
    f.svg.appendChild(
      S("path", {
        d: "M" + c.map((p) => X(p[0]) + "," + y(p[1])).join("L"),
        fill: "none",
        stroke: COL.base,
        "stroke-width": 2,
      })
    );
    [16, 33, 66, 132, 264, 528].forEach((u) => {
      const p = c.find((q) => q[0] === u);
      if (!p) return;
      const sel = u === 33;
      dot(f.svg, X(u), y(p[1]), sel ? COL.adapted : COL.ink2, sel ? 6 : 4);
    });
    const v = R.val_curves[seed] || [];
    v.forEach((p) => {
      const d = dot(f.svg, X(p[0]), y(p[1]), "#fff", 4, { stroke: COL.genuine, "stroke-width": 2 });
      bindTip(d, () => ({
        title: "Validation loss at " + p[0] + " updates",
        rows: [{ label: "loss", value: fmt.num(p[1], 3) }],
      }));
    });
    {
      const p33 = c.find((q) => q[0] === 33);
      f.svg.appendChild(
        S("line", {
          x1: X(33) + 3,
          y1: y(p33[1]) - 6,
          x2: X(33) + 16,
          y2: f.m.t + 14,
          stroke: COL.adapted,
          "stroke-width": 1,
        })
      );
      f.svg.appendChild(
        S("text", {
          x: X(33) + 19,
          y: f.m.t + 17,
          class: "lbl",
          "text-anchor": "start",
          text: "selected (33 updates)",
          fill: COL.adapted,
          "font-weight": 600,
        })
      );
    }
    const hit = S("rect", { x: f.m.l, y: f.m.t, width: f.iw, height: f.ih, class: "hit" });
    hit.addEventListener("pointermove", (e) => {
      const r = f.svg.getBoundingClientRect();
      const sx = ((e.clientX - r.left) / r.width) * W;
      const u = Math.pow(2, x.invert(sx));
      let best = c[0];
      c.forEach((p) => {
        if (Math.abs(Math.log2(p[0]) - Math.log2(u)) < Math.abs(Math.log2(best[0]) - Math.log2(u)))
          best = p;
      });
      showTip(e.clientX, e.clientY, "Update " + best[0], [
        { label: "training loss", value: fmt.num(best[1], 3), color: COL.base },
      ]);
    });
    hit.addEventListener("pointerleave", hideTip);
    f.svg.appendChild(hit);
  }

  const CTRL_METRICS = {
    wer: {
      label: "Whisper-ATC WER (%)",
      get: (a) => a.wer * 100,
      fmt: (v) => fmt.num(v, 2) + "%",
      genuine: true,
    },
    speaker_cosine_to_genuine: {
      label: "Speaker cosine to genuine target",
      get: (a) => a.speaker_cosine_to_genuine,
      fmt: (v) => fmt.num(v, 3),
      genuine: false,
    },
    absolute_log_duration_error: {
      label: "Log-duration error",
      get: (a) => a.absolute_log_duration_error,
      fmt: (v) => fmt.num(v, 3),
      genuine: false,
    },
    utmosv2_predicted_mos: {
      label: "UTMOSv2 predicted naturalness",
      get: (a) => a.utmosv2_predicted_mos,
      fmt: (v) => fmt.num(v, 3),
      genuine: true,
    },
    duration_seconds: {
      label: "Mean output duration (s)",
      get: (a) => a.duration_seconds,
      fmt: (v) => fmt.num(v, 2) + " s",
      genuine: true,
    },
  };
  function renderControllers(container, metric) {
    const info = CTRL_METRICS[metric];
    const pc = R.per_controller;
    const W = Math.max(480, container.clientWidth || 640),
      H = 340;
    const f = chartFrame(container, W, H, { l: 70, r: 24, t: 24, b: 44 });
    const vals = [];
    pc.forEach((c) => {
      vals.push(info.get(c.base), info.get(c.adapted));
      if (info.genuine) vals.push(info.get(c.genuine));
    });
    let lo = arrayMin(vals),
      hi = arrayMax(vals);
    const pad = (hi - lo) * 0.12 || 1;
    lo -= pad;
    hi += pad;
    const x = linear(lo, hi, f.m.l, f.m.l + f.iw);
    const rowH = f.ih / pc.length;
    xGrid(f, x, niceTicks(lo, hi, 6));
    xAxis(f, x, f.m.t + f.ih, niceTicks(lo, hi, 6), (v) => info.fmt(v).replace(" s", ""), {
      label: info.label,
    });
    pc.forEach((c, i) => {
      const cy = f.m.t + i * rowH + rowH / 2;
      f.svg.appendChild(
        S("text", {
          x: f.m.l - 10,
          y: cy + 4,
          "text-anchor": "end",
          class: "lbl",
          "font-family": "var(--font)",
          text: c.controller,
        })
      );
      f.svg.appendChild(
        S("text", {
          x: f.m.l - 10,
          y: cy + 15,
          "text-anchor": "end",
          class: "sub",
          text: c.messages + " msgs",
        })
      );
      f.svg.appendChild(
        S("line", {
          x1: x(info.get(c.base)),
          x2: x(info.get(c.adapted)),
          y1: cy,
          y2: cy,
          stroke: "#e2d6ce",
          "stroke-width": 2,
        })
      );
      const arms = info.genuine ? ["genuine", "base", "adapted"] : ["base", "adapted"];
      arms.forEach((arm) => {
        const v = info.get(c[arm]);
        const d = dot(f.svg, x(v), cy, COL[arm], 6);
        d.setAttribute("tabindex", "0");
        bindTip(d, () => ({
          title: `Controller ${c.controller} · ${ARM_LABEL[arm]}`,
          rows: [
            { label: info.label, value: info.fmt(v), color: COL[arm] },
            { label: "base", value: info.fmt(info.get(c.base)), color: COL.base },
            { label: "adapted", value: info.fmt(info.get(c.adapted)), color: COL.adapted },
            info.genuine
              ? { label: "genuine", value: info.fmt(info.get(c.genuine)), color: COL.genuine }
              : null,
            { label: "messages", value: c.messages },
          ].filter(Boolean),
        }));
      });
    });
  }

  function renderSpeakerStrips(container) {
    const q = R.speaker_similarity.quantiles;
    const W = Math.max(480, container.clientWidth || 640),
      H = 250;
    const f = chartFrame(container, W, H, { l: 190, r: 92, t: 26, b: 44 });
    const x = linear(-0.1, 0.9, f.m.l, f.m.l + f.iw);
    const rows = [
      ["genuine", 1],
      ["base", 1],
      ["adapted", 1],
      ["genuine", 0],
      ["base", 0],
      ["adapted", 0],
    ];
    const rowH = f.ih / rows.length;
    xGrid(f, x, niceTicks(-0.1, 0.9, 10));
    xAxis(f, x, f.m.t + f.ih, niceTicks(-0.1, 0.9, 10), (v) => fmt.num(v, 1), {
      label: "pairwise ECAPA-TDNN cosine against the 90-recording development bank",
    });
    f.svg.appendChild(
      S("text", {
        x: f.m.l - 10,
        y: f.m.t - 8,
        "text-anchor": "end",
        class: "sub",
        text: "query speech → bank relationship",
      })
    );
    rows.forEach(([cond, same], i) => {
      const r = q.find((z) => z.condition === cond && z.same_controller === same);
      if (!r) return;
      const cy = f.m.t + i * rowH + rowH / 2;
      const col = COL[cond];
      f.svg.appendChild(
        S("text", {
          x: f.m.l - 10,
          y: cy + 4,
          "text-anchor": "end",
          class: "lbl",
          text: `${cond[0].toUpperCase() + cond.slice(1)} → ${same ? "same controller" : "other controllers"}`,
        })
      );
      f.svg.appendChild(
        S("line", {
          x1: x(r.p05),
          x2: x(r.p95),
          y1: cy,
          y2: cy,
          stroke: col,
          "stroke-width": 2,
          "stroke-opacity": 0.5,
          "stroke-linecap": "round",
        })
      );
      f.svg.appendChild(
        S("rect", {
          x: x(r.p25),
          y: cy - 7,
          width: x(r.p75) - x(r.p25),
          height: 14,
          fill: col,
          "fill-opacity": 0.35,
          rx: 3,
        })
      );
      f.svg.appendChild(
        S("line", {
          x1: x(r.median),
          x2: x(r.median),
          y1: cy - 9,
          y2: cy + 9,
          stroke: col,
          "stroke-width": 3,
        })
      );
      f.svg.appendChild(
        S("text", {
          x: x(r.p95) + 8,
          y: cy + 4,
          class: "lbl",
          text: "median " + fmt.num(r.median, 3),
        })
      );
      const hit = S("rect", {
        x: f.m.l,
        y: cy - rowH / 2,
        width: f.iw,
        height: rowH,
        class: "hit",
        tabindex: "0",
      });
      bindTip(hit, () => ({
        title: `${ARM_LABEL[cond]} vs ${same ? "same" : "other"} controller(s)`,
        rows: [
          { label: "median", value: fmt.num(r.median, 4), color: col },
          { label: "25th–75th pct", value: `${fmt.num(r.p25, 3)} – ${fmt.num(r.p75, 3)}` },
          { label: "5th–95th pct", value: `${fmt.num(r.p05, 3)} – ${fmt.num(r.p95, 3)}` },
          { label: "weighted mean", value: fmt.num(r.mean, 4) },
          { label: "pairs (not independent)", value: r.pairs.toLocaleString() },
        ],
      }));
      f.svg.appendChild(hit);
    });
  }
  function renderSpeakerControllers(container) {
    const pcs = R.speaker_similarity.per_controller;
    const ctrls = Array.from(new Set(pcs.map((r) => r.controller_id)));
    const W = Math.max(480, container.clientWidth || 640),
      H = 340;
    const f = chartFrame(container, W, H, { l: 70, r: 24, t: 24, b: 44 });
    const x = linear(0.44, 0.8, f.m.l, f.m.l + f.iw);
    const rowH = f.ih / ctrls.length;
    xGrid(f, x, niceTicks(0.45, 0.8, 7));
    xAxis(f, x, f.m.t + f.ih, niceTicks(0.45, 0.8, 7), (v) => fmt.num(v, 2), {
      label: "mean cosine to the intended controller’s bank recordings (95% conditional interval)",
    });
    ctrls.forEach((c, i) => {
      const cy = f.m.t + i * rowH + rowH / 2;
      f.svg.appendChild(
        S("text", {
          x: f.m.l - 10,
          y: cy + 4,
          "text-anchor": "end",
          class: "lbl",
          "font-family": "var(--font)",
          text: c,
        })
      );
      ["genuine", "base", "adapted"].forEach((arm, j) => {
        const r = pcs.find((z) => z.controller_id === c && z.condition === arm);
        if (!r) return;
        const yy = cy + (j - 1) * 8;
        f.svg.appendChild(
          S("line", {
            x1: x(r.ci_low),
            x2: x(r.ci_high),
            y1: yy,
            y2: yy,
            stroke: COL[arm],
            "stroke-width": 2,
            "stroke-linecap": "round",
          })
        );
        const d = dot(f.svg, x(r.estimate), yy, COL[arm], 4.5);
        d.setAttribute("tabindex", "0");
        bindTip(d, () => ({
          title: `Controller ${c} · ${ARM_LABEL[arm]}`,
          rows: [
            { label: "mean cosine", value: fmt.num(r.estimate, 4), color: COL[arm] },
            { label: "95% interval", value: `[${fmt.num(r.ci_low, 4)}, ${fmt.num(r.ci_high, 4)}]` },
            { label: "messages", value: r.messages },
          ],
        }));
      });
    });
  }

  function renderRadioTable() {
    const tbody = $("#tbl-radio tbody");
    if (!tbody) return;
    [2, 4, 6].forEach((sec) => {
      const cos = D.radio_contrasts.find(
        (r) => r.metric === "speaker_cosine_to_fixed_raw_prompt" && r.candidate_budget === sec
      );
      const wer = D.radio_contrasts.find((r) => r.metric === "wer" && r.candidate_budget === sec);
      const tr = el("tr");
      tr.appendChild(el("td", { text: sec + " s" }));
      tr.appendChild(el("td", { class: "num", text: fmt.num(cos.baseline_mean, 4) }));
      tr.appendChild(el("td", { class: "num", text: fmt.num(cos.candidate_mean, 4) }));
      const exclC = cos.interval_low > 0 || cos.interval_high < 0;
      tr.appendChild(
        el("td", {
          class: "num nowrap" + (exclC ? " excl" : ""),
          text: `${fmt.signed(cos.estimate, 4)} [${fmt.num(cos.interval_low, 4)}, ${fmt.num(cos.interval_high, 4)}]`,
        })
      );
      tr.appendChild(el("td", { class: "num", text: fmt.num(wer.baseline_mean * 100, 2) + "%" }));
      tr.appendChild(el("td", { class: "num", text: fmt.num(wer.candidate_mean * 100, 2) + "%" }));
      const exclW = wer.interval_low > 0 || wer.interval_high < 0;
      tr.appendChild(
        el("td", {
          class: "num nowrap" + (exclW ? " excl" : ""),
          text: `${fmt.pp(wer.estimate, 2)} [${fmt.num(wer.interval_low * 100, 2)}, ${fmt.num(wer.interval_high * 100, 2)}]`,
        })
      );
      tbody.appendChild(tr);
    });
  }

  function renderRefTable() {
    const tbody = $("#tbl-reflen tbody");
    if (!tbody) return;
    R.reference_panel.forEach((p) => {
      const tr = el("tr");
      tr.appendChild(
        el("td", { text: p.seconds + " s" + (p.seconds === 8 ? " (separate subset)" : "") })
      );
      tr.appendChild(el("td", { class: "num", text: fmt.num(p.reference_actual_mean, 3) + " s" }));
      tr.appendChild(el("td", { class: "num", text: `${p.messages} / ${p.controllers}` }));
      tr.appendChild(el("td", { class: "num", text: fmt.num(p.base.wer * 100, 2) + "%" }));
      tr.appendChild(el("td", { class: "num", text: fmt.num(p.adapted.wer * 100, 2) + "%" }));
      tr.appendChild(
        el("td", { class: "num", text: fmt.num(p.base.speaker_cosine_to_genuine, 4) })
      );
      tr.appendChild(
        el("td", { class: "num", text: fmt.num(p.adapted.speaker_cosine_to_genuine, 4) })
      );
      tr.appendChild(el("td", { class: "num", text: fmt.num(p.base.utmosv2_predicted_mos, 3) }));
      tr.appendChild(el("td", { class: "num", text: fmt.num(p.adapted.utmosv2_predicted_mos, 3) }));
      tbody.appendChild(tr);
    });
  }

  function paperStatus() {
    const dialog = el(
      "dialog",
      {
        class: "paper-status",
        "aria-labelledby": "paper-status-title",
        "aria-describedby": "paper-status-message",
      },
      [
        el("h2", { id: "paper-status-title", text: "Manuscript awaiting review" }),
        el("p", {
          id: "paper-status-message",
          text: "The manuscript is still awaiting review. A link to the official IEEE publication will be added when it is available.",
        }),
        el("button", {
          class: "btn btn-primary",
          type: "button",
          text: "Close",
          onclick: () => dialog.close(),
        }),
      ]
    );
    document.body.appendChild(dialog);
    $$("[data-paper-status]").forEach((button) => {
      button.addEventListener("click", () => dialog.showModal());
    });
  }

  let ctrlMetric = "wer";
  function renderCharts() {
    if ($("#chart-reflen-wer"))
      renderRefLen($("#chart-reflen-wer"), "wer", {
        scale: 100,
        d: 3,
        fmt: (v) => fmt.num(v, 1) + "%",
        axis: "Whisper-ATC WER (%)",
        title: "Word error rate by reference limit",
      });
    if ($("#chart-reflen-cos"))
      renderRefLen($("#chart-reflen-cos"), "speaker_cosine_to_genuine", {
        scale: 1,
        d: 4,
        fmt: (v) => fmt.num(v, 2),
        axis: "speaker cosine",
        title: "Speaker cosine by reference limit",
      });
    if ($("#chart-refchg-wer"))
      renderRefChange($("#chart-refchg-wer"), "wer", {
        scale: 100,
        d: 3,
        fmt: (v) => fmt.num(v, 1),
        tol: 1.0,
        title: "Paired WER change (pp) · dashed = tolerance",
      });
    if ($("#chart-refchg-cos"))
      renderRefChange($("#chart-refchg-cos"), "speaker_cosine_to_genuine", {
        scale: 1,
        d: 4,
        fmt: (v) => fmt.num(v, 3),
        title: "Paired speaker-cosine change",
      });
    if ($("#chart-timing")) renderTiming($("#chart-timing"));
    if ($("#chart-ckpt-dur"))
      renderCheckpoints($("#chart-ckpt-dur"), "absolute_log_duration_error", {
        scale: 1,
        d: 4,
        fmt: (v) => fmt.num(v, 3),
        title: "Δ log-duration error",
      });
    if ($("#chart-ckpt-wer"))
      renderCheckpoints($("#chart-ckpt-wer"), "wer", {
        scale: 100,
        d: 3,
        fmt: (v) => fmt.num(v, 1),
        tol: 1.0,
        title: "Δ WER (pp) · dashed = tolerance",
      });
    if ($("#chart-loss")) renderLoss($("#chart-loss"));
    if ($("#chart-controllers")) renderControllers($("#chart-controllers"), ctrlMetric);
    if ($("#chart-speaker-strips")) renderSpeakerStrips($("#chart-speaker-strips"));
    if ($("#chart-speaker-ctrl")) renderSpeakerControllers($("#chart-speaker-ctrl"));
  }
  function init() {
    paperStatus();
    renderPrimaryTable();
    renderRadioTable();
    renderRefTable();
    const cm = $("#ctrl-metric");
    if (cm)
      cm.addEventListener("change", () => {
        ctrlMetric = cm.value;
        renderControllers($("#chart-controllers"), ctrlMetric);
      });
    if ($("#strip-list"))
      loadExamples((list) => {
        renderExamples(list);
        renderCharts();
      });
    else renderCharts();
    let to;
    window.addEventListener("resize", () => {
      clearTimeout(to);
      to = setTimeout(renderCharts, 150);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
