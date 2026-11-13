/*
 * polymerization.js — 「加成聚合與縮合聚合」的頁面程式（反應器與放大圖、操作、圖表、紀錄、音效、任務事件）
 * 化學核心在 js/polymerization-core.js（PolyCore）；3D 檢視在 js/polymerization-3d.js（Poly3D）。
 * 數字（轉化率、Xn、Mn、Mw、Đ、水的質量）全部來自核心的逐分子隨機模擬；
 * 放大圖裡的幾十個分子只是示意：它們隨機運動，並跟著核心的轉化率相連或斷開（鏈長縮小、不依比例）。
 *
 * 任務事件（只在使用者操作過之後送出）：
 *   'tick'：反應進行中每 0.5 秒，以及反應結束時一次
 *   'record'：按「記錄數據」{ ...同 tick, rows（同一段實驗的紀錄，含這一列） }
 *   'hold'：使用者按「暫停」時
 * 共同欄位：{ mode（'add'／'cond'）, t, conv, Xn, Xw, PDI, Mn, Mw, ended, run（第幾次反應）, seg }
 *   加成：{ mon, gas, init（莫耳分率）, term（'comb'／'disp'）, shrink, initLeft, radicals, deadEnd, t50 }
 *   縮合：{ pair, ab, q, r, dry, everDry, closedAll, pA, waterOut, waterMax, peq, atEq, eqXn }
 */
(function () {
  'use strict';
  const PC = window.PolyCore, LD = window.LabDraw;
  if (!PC || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reducedMotion = LD.reducedMotion();
  const FONT = LD.FONT;
  function fsz(px) { return px * (window.LabSettings && window.LabSettings.get('fs') || 1); }
  function fnt(px, w) { return (w || '600') + ' ' + fsz(px).toFixed(1) + 'px ' + FONT; }

  // ======================= 數字格式 =======================
  function num(x, d) {
    if (x == null || !isFinite(x)) return '—';
    const s = (+x).toFixed(d == null ? 0 : d);
    return s.charAt(0) === '-' ? (/^-0(\.0*)?$/.test(s) ? s.slice(1) : '−' + s.slice(1)) : s;
  }
  /** 有效數字 sig 位的一般寫法 */
  function sigf(x, sig) {
    if (x == null || !isFinite(x)) return '—';
    if (x === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(x)));
    return num(x, Math.max(0, Math.min(6, (sig || 3) - 1 - e)));
  }
  /** 大數字：取 sig 位有效數字，每三位空一格（41 600） */
  function big(x, sig) {
    if (x == null || !isFinite(x)) return '—';
    if (Math.abs(x) < 1000) return sigf(x, sig || 3);
    const e = Math.floor(Math.log10(Math.abs(x)));
    const r = Math.round(x / Math.pow(10, e - (sig || 3) + 1)) * Math.pow(10, e - (sig || 3) + 1);
    return Math.round(r).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  function pct(x, d) { return x == null || !isFinite(x) ? '—' : num(x * 100, d == null ? 1 : d) + '%'; }
  /** 化學式 → HTML（數字用 <sub>） */
  function fH(f) { return f.replace(/(\d+)/g, '<sub>$1</sub>'); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ======================= 顏色 =======================
  const MONCOL = { ethylene: '#8792a0', propylene: '#13a085', vinylchloride: '#3a9e48', tfe: '#b8a31a', styrene: '#7a5cc8', mma: '#d0603a' };
  let col = {};
  function readColors() {
    const c = LD.c, dk = LD.dark;
    const lift = function (h, u) { return dk ? LD.mix(h, '#ffffff', u == null ? 0.18 : u) : h; };
    col = {
      text: c.text, muted: c.muted, border: c.border, grid: c.grid, accent: c.accent, bg: c['canvas-bg'], surface: c.surface,
      probe: c.probe || '#0d7f57', pos: c.pos || '#d1453b', neg: c.neg || '#2f6fd0', dark: dk,
      mon: {}, poly: {},
      amine: lift('#3f6fd6'), glycol: lift('#13a085'), acid: lift('#e08a1e'), lactic: lift('#8a4fc8'),
      nubAmine: lift('#6d9bf0', 0.1), nubOH: lift('#22c4a2', 0.1), nubCOOH: lift('#f7b955', 0.1),
      O: lift('#e0483a'), H: dk ? '#eef1f4' : '#e2e7ec', rad: '#f2b705',
      metal: dk ? '#7d8896' : '#a9b3be', mantle: dk ? '#2a2f36' : '#4a5059', heat: '#ff8a3d', water: dk ? '#5aa9e6' : '#3b8fd6'
    };
    Object.keys(MONCOL).forEach(function (k) { col.mon[k] = lift(MONCOL[k]); col.poly[k] = LD.shade(lift(MONCOL[k]), dk ? -0.08 : -0.22); });
  }
  function unitColors() {
    if (state.mode === 'add') return { m: col.mon[state.mon], p: col.poly[state.mon] };
    const d = PC.COND[state.pair];
    if (d.ab) return { A: col.lactic, B: col.lactic, X: col.lactic, nA: col.nubOH, nB: col.nubCOOH };
    return { A: state.pair === 'nylon66' ? col.amine : col.glycol, B: col.acid, nA: state.pair === 'nylon66' ? col.nubAmine : col.nubOH, nB: col.nubCOOH };
  }

  // ======================= 狀態 =======================
  const SPEEDS = [1, 5, 20, 60];
  const state = { mode: 'add', mon: 'styrene', init: 0.005, term: 'comb', pair: 'nylon66', q: 1, dry: true, running: false, speed: 1, tab: 'xp', view: '2d' };
  let sim = null, lite = null, full = null, fullAt = -1, ratioAb = false;
  let runSeq = 0, segId = 0, userActed = false;
  let run = null;                 // 這一次反應的紀錄
  let traces = [];                // 以前幾次反應的曲線（全部清除才清掉）
  let rows = [];                  // 紀錄表
  let view3 = null;
  const cv = $('cv'), ctx = cv.getContext('2d'), gcv = $('gcv'), gctx = gcv.getContext('2d');
  const elInit = $('init'), elRatio = $('ratio'), elDry = $('dry');

  function val(el) { return window.LabNum ? window.LabNum.value(el) : +el.value; }
  // 起始劑：滑桿位置 0–1000 ↔ 0.01%–5%（對數）；莫耳比：0–1000 ↔ 0.5–2（對數，中間是 1）
  const INIT_LO = PC.I_MIN * 100, INIT_HI = PC.I_MAX * 100;
  function initFromPos(p) { return INIT_LO * Math.pow(INIT_HI / INIT_LO, p / 1000); }
  function initToPos(v) { return 1000 * Math.log(v / INIT_LO) / Math.log(INIT_HI / INIT_LO); }
  function qFromPos(p) { return PC.Q_MIN * Math.pow(PC.Q_MAX / PC.Q_MIN, p / 1000); }
  function qToPos(v) { return 1000 * Math.log(v / PC.Q_MIN) / Math.log(PC.Q_MAX / PC.Q_MIN); }
  if (window.LabNum) {
    window.LabNum.register(elInit, { toValue: initFromPos, toPos: initToPos, min: INIT_LO, max: INIT_HI, decimals: 3 });
    window.LabNum.register(elRatio, { toValue: qFromPos, toPos: qToPos, min: PC.Q_MIN, max: PC.Q_MAX, decimals: 4 });
  }
  function readInit() { return (window.LabNum ? val(elInit) : initFromPos(+elInit.value)) / 100; }
  function readQ() { return window.LabNum ? val(elRatio) : qFromPos(+elRatio.value); }
  function setSlider(el, v, toPos) {
    if (window.LabNum && window.LabNum.set) window.LabNum.set(el, v);
    else el.value = String(Math.round(toPos(v)));
  }

  // ======================= 反應 =======================
  function seed() { return (Math.random() * 4294967295) >>> 0; }
  function freshRun() {
    return { t50: null, eqXn: null, everDry: state.dry, hist: [], lastS: null, ended: false, conv0: 0, marks: {}, wOutShown: 0, eqSaid: false, started: false };
  }
  function traceLabel() {
    if (state.mode === 'add') {
      const d = PC.ADD_MON[state.mon];
      return d.ab + ' ' + sigf(state.init * 100, 2) + '%' + (state.term === 'disp' ? T(' 歧化', ' disp.') : '');
    }
    const d = PC.COND[state.pair];
    return (state.pair === 'nylon66' ? T('耐綸', 'Nylon') : state.pair === 'pet' ? 'PET' : 'PLA') + (d.ab ? '' : ' ' + num(state.q, 3)) + (run && run.everDry ? '' : T(' 密閉', ' closed'));
  }
  function newRun(keepTrace) {
    if (keepTrace !== false && run && run.hist.length > 3) {
      traces.push({ mode: sim.kind, label: run.label, hist: run.hist.slice() });
      if (traces.length > 6) traces.shift();
    }
    runSeq++;
    sim = state.mode === 'add' ? PC.createAdd({ mon: state.mon, init: state.init, term: state.term, seed: seed() })
      : PC.createCond({ pair: state.pair, q: state.q, dry: state.dry, seed: seed() });
    run = freshRun();
    run.label = traceLabel();
    lite = liteStats(); full = PC.stats(sim); fullAt = performance.now();
    sample(true);
    Vis.build();
    state.running = false;
    updatePlay();
    refreshAll();
  }
  /** 每一幀都要的量（O(1)） */
  function liteStats() {
    if (sim.kind === 'add') {
      const conv = 1 - sim.NM / sim.N;
      return { conv: conv, Xn: sim.nPoly ? sim.s1 / sim.nPoly : 0, radicals: sim.rad.length, NI: sim.NI, initLeft: sim.NI0 ? sim.NI / sim.NI0 : 0, t: sim.t };
    }
    return { conv: PC.pMin(sim), pA: sim.L / sim.NA0, Xn: sim.N / sim.M, t: sim.t, W: sim.W, Wout: sim.Wout };
  }
  function fullStats(force) {
    const now = performance.now();
    if (force || !full || now - fullAt > 150 || full.t !== sim.t && sim.kind === 'add') { full = PC.stats(sim); fullAt = now; }
    return full;
  }
  function sample(force) {
    const h = run.hist, L = lite;
    if (!(L.Xn > 0) && !force) return;
    const last = h[h.length - 1];
    if (!force && last && Math.abs(L.conv - last[1]) < 0.002 && Math.abs(Math.log10(Math.max(1, L.Xn)) - Math.log10(Math.max(1, last[2]))) < 0.008 && L.t - last[0] < Math.max(0.5, L.t / 300)) return;
    h.push([L.t, L.conv, L.Xn]);
    if (h.length > 2400) { const k = []; for (let i = 0; i < h.length; i += 2) k.push(h[i]); if (k[k.length - 1] !== h[h.length - 1]) k.push(h[h.length - 1]); run.hist = k; }
  }

  // ======================= 放大圖的示意分子 =======================
  const Vis = (function () {
    const V = { beads: [], bonds: [], water: [], chains: [], kind: 'add', nA0: 0, rr: 0, flashes: [], lastChain: 0, pulled: 0, collected: 0 };
    const BOND = 0.085, REP = 0.078;
    function gauss() { let u = 0, v = 0; while (u === 0) u = Math.random(); v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    function randIn(rmax) {
      for (;;) {
        const x = Math.random() * 2 - 1, y = Math.random() * 2 - 1, z = Math.random() * 2 - 1;
        if (x * x + y * y + z * z < 1) return [x * rmax, y * rmax, z * rmax];
      }
    }
    function bead(kind) {
      const p = randIn(0.82);
      return { x: p[0], y: p[1], z: p[2], fx: 0, fy: 0, fz: 0, k: kind, c: -1, e: [-1, -1], th: Math.random() * Math.PI * 2, ph: Math.random() * Math.PI, f: 0 };
    }
    V.build = function () {
      V.beads = []; V.bonds = []; V.water = []; V.chains = []; V.flashes = []; V.pulled = 0; V.collected = 0;
      V.kind = state.mode;
      if (state.mode === 'add') {
        for (let i = 0; i < 140; i++) V.beads.push(bead('m'));
      } else {
        const d = PC.COND[state.pair];
        if (d.ab) { for (let i = 0; i < 100; i++) V.beads.push(bead('X')); V.nA0 = 100; }
        else {
          const nA = 50, nB = Math.max(25, Math.min(100, Math.round(50 * state.q)));
          for (let i = 0; i < nA; i++) V.beads.push(bead('A'));
          for (let i = 0; i < nB; i++) V.beads.push(bead('B'));
          V.nA0 = 2 * nA;
        }
      }
      // 先鬆弛一下，避免一開始重疊
      for (let k = 0; k < 30; k++) dyn(1 / 60, 0);
      comps();
    };
    // ---------- 動態（過阻尼布朗運動） ----------
    function dyn(dt, noise) {
      const B = V.beads, n = B.length;
      for (let i = 0; i < n; i++) { const b = B[i]; b.fx = 0; b.fy = 0; b.fz = 0; }
      for (let i = 0; i < n; i++) {
        const a = B[i];
        for (let j = i + 1; j < n; j++) {
          const b = B[j], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < REP * REP && d2 > 1e-12) {
            const d = Math.sqrt(d2), f = 30 * (REP - d) / d;
            a.fx -= f * dx; a.fy -= f * dy; a.fz -= f * dz; b.fx += f * dx; b.fy += f * dy; b.fz += f * dz;
          }
        }
      }
      V.bonds.forEach(function (bd) {
        const a = B[bd[0]], b = B[bd[1]], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const f = 25 * (d - BOND) / d;
        a.fx += f * dx; a.fy += f * dy; a.fz += f * dz; b.fx -= f * dx; b.fy -= f * dy; b.fz -= f * dz;
      });
      const sg = Math.sqrt(2 * 0.0035 * dt) * noise;
      for (let i = 0; i < n; i++) {
        const b = B[i], r = Math.sqrt(b.x * b.x + b.y * b.y + b.z * b.z);
        if (r > 0.86) { const f = 20 * (r - 0.86) / r; b.fx -= f * b.x; b.fy -= f * b.y; b.fz -= f * b.z; }
        let mx = b.fx * dt, my = b.fy * dt, mz = b.fz * dt;
        const m = Math.sqrt(mx * mx + my * my + mz * mz);
        if (m > 0.02) { mx *= 0.02 / m; my *= 0.02 / m; mz *= 0.02 / m; }
        b.x += mx + sg * gauss(); b.y += my + sg * gauss(); b.z += mz + sg * gauss();
        b.th += 0.6 * dt * noise * gauss();
        if (b.f > 0) b.f = Math.max(0, b.f - dt / 0.6);
      }
      // 水分子
      const sw = Math.sqrt(2 * 0.012 * dt) * noise;
      for (let i = V.water.length - 1; i >= 0; i--) {
        const w = V.water[i];
        w.x += sw * gauss(); w.y += sw * gauss() + (w.up ? 0.22 * dt : 0); w.z += sw * gauss();
        w.th += 1.2 * dt * noise * gauss();
        const r = Math.sqrt(w.x * w.x + w.y * w.y + w.z * w.z);
        if (w.up && w.y > 0.78) { V.water.splice(i, 1); V.pulled++; continue; }
        if (r > 0.9) { const s = 0.9 / r; w.x *= s; w.y *= s; w.z *= s; }
      }
      for (let i = V.flashes.length - 1; i >= 0; i--) { V.flashes[i].u += dt / 0.7; if (V.flashes[i].u >= 1) V.flashes.splice(i, 1); }
    }
    // ---------- 分子（連通的珠子）編號 ----------
    function comps() {
      const B = V.beads, n = B.length, id = new Int32Array(n).fill(-1);
      let c = 0;
      for (let i = 0; i < n; i++) {
        if (id[i] >= 0) continue;
        const st = [i]; id[i] = c;
        while (st.length) { const k = st.pop(), e = B[k].e; for (let s = 0; s < 2; s++) { const j = e[s]; if (j >= 0 && id[j] < 0) { id[j] = c; st.push(j); } } }
        c++;
      }
      for (let i = 0; i < n; i++) B[i].c = id[i];
      V.nComp = c;
    }
    function flash(x, y, z, kind) { if (!reducedMotion) V.flashes.push({ x: x, y: y, z: z, u: 0, kind: kind }); }
    function link(i, si, j, sj) {
      const B = V.beads;
      B[i].e[si] = j; B[j].e[sj] = i;
      V.bonds.push([i, j, si, sj]);
    }
    function freeSlot(b) { return b.e[0] < 0 ? 0 : b.e[1] < 0 ? 1 : -1; }
    function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return dx * dx + dy * dy + dz * dz; }

    // ---------- 加成聚合：示意的自由基鏈 ----------
    function addSync(L, ev) {
      const B = V.beads, nv = B.length;
      const target = Math.round(L.conv * nv);
      let poly = 0; B.forEach(function (b) { if (b.k !== 'm') poly++; });
      const live = V.chains.filter(function (c) { return c.live; });
      const mainAlive = L.radicals > 0 || (L.NI > 0 && sim.NM > 0);
      if (!mainAlive) live.forEach(function (c) { stopChain(c, false); });
      // 示意鏈長：跟著目前的動力鏈長變（真實的鏈長的約 1/12）
      const th = PC.addTheory(Math.max(1e-9, state.init * L.initLeft), Math.max(1e-6, 1 - L.conv));
      const cap = Math.max(4, Math.min(40, Math.round(th.nu / 12)));
      let budget = state.running ? 3 : 0;
      while (budget-- > 0 && poly < target) {
        let lv = V.chains.filter(function (c) { return c.live; });
        if (lv.length < (L.radicals >= 2 ? 2 : 1) && mainAlive) {
          const free = []; B.forEach(function (b, i) { if (b.k === 'm') free.push(i); });
          if (!free.length) break;
          const i = free[Math.floor(Math.random() * free.length)];
          B[i].k = 'p'; B[i].f = 1;
          V.chains.push({ beads: [i], live: true, cap: cap });
          flash(B[i].x, B[i].y, B[i].z, 'init');
          poly++;
          continue;
        }
        if (!lv.length) break;
        const ch = lv[V.lastChain++ % lv.length], end = ch.beads[ch.beads.length - 1];
        let best = -1, bd = 1e9;
        for (let i = 0; i < nv; i++) { if (B[i].k !== 'm') continue; const d = dist2(B[i], B[end]); if (d < bd) { bd = d; best = i; } }
        if (best < 0) break;
        B[best].k = 'p';
        link(end, ch.beads.length > 1 ? 1 : 0, best, 0);
        ch.beads.push(best);
        poly++;
        if (ch.beads.length >= ch.cap) stopChain(ch, true);
      }
      comps();
    }
    function stopChain(ch, sound) {
      if (!ch.live) return;
      const B = V.beads;
      ch.live = false;
      const end = ch.beads[ch.beads.length - 1];
      if (state.term === 'comb') {
        const other = V.chains.filter(function (c) { return c.live && c !== ch; })[0];
        if (other) {
          other.live = false;
          const e2 = other.beads[other.beads.length - 1];
          link(end, 1, e2, other.beads.length > 1 ? 1 : 1);
          flash((B[end].x + B[e2].x) / 2, (B[end].y + B[e2].y) / 2, (B[end].z + B[e2].z) / 2, 'comb');
          if (sound) Snd.term(true);
          return;
        }
      }
      flash(B[end].x, B[end].y, B[end].z, 'disp');
      if (sound) Snd.term(false);
    }
    // ---------- 縮合聚合：最近的 A 端與 B 端相連 ----------
    function slotType(b, s) { return b.k === 'A' ? 'A' : b.k === 'B' ? 'B' : (s === 0 ? 'A' : 'B'); }
    function condSync(L) {
      const B = V.beads, target = Math.round(L.pA * V.nA0);
      let budget = state.running ? 3 : 1;
      while (budget-- > 0 && V.bonds.length < target) {
        let bi = -1, bj = -1, bsi = 0, bsj = 0, bd = 1e9;
        for (let i = 0; i < B.length; i++) {
          for (let si = 0; si < 2; si++) {
            if (B[i].e[si] >= 0 || slotType(B[i], si) !== 'A') continue;
            for (let j = 0; j < B.length; j++) {
              if (B[j].c === B[i].c) continue;
              for (let sj = 0; sj < 2; sj++) {
                if (B[j].e[sj] >= 0 || slotType(B[j], sj) !== 'B') continue;
                const d = dist2(B[i], B[j]);
                if (d < bd) { bd = d; bi = i; bj = j; bsi = si; bsj = sj; }
              }
            }
          }
        }
        if (bi < 0) break;
        link(bi, bsi, bj, bsj);
        const a = B[bi], b = B[bj];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mz = (a.z + b.z) / 2;
        V.water.push({ x: mx, y: my, z: mz, th: Math.random() * 6.28, up: state.dry });
        flash(mx, my, mz, 'link');
        comps();
      }
      budget = state.running ? 3 : 1;
      while (budget-- > 0 && V.bonds.length > target && V.bonds.length) {
        const k = Math.floor(Math.random() * V.bonds.length), bd = V.bonds[k];
        V.bonds.splice(k, 1);
        B[bd[0]].e[bd[2]] = -1; B[bd[1]].e[bd[3]] = -1;
        const a = B[bd[0]], b = B[bd[1]];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mz = (a.z + b.z) / 2;
        // 用掉最近的一個水分子
        let wi = -1, wd = 1e9;
        V.water.forEach(function (w, i) { if (w.up) return; const d = (w.x - mx) * (w.x - mx) + (w.y - my) * (w.y - my) + (w.z - mz) * (w.z - mz); if (d < wd) { wd = d; wi = i; } });
        if (wi >= 0) V.water.splice(wi, 1);
        flash(mx, my, mz, 'cut');
        comps();
      }
      // 除水：瓶內的水往上被抽走；不除水：留在瓶內
      V.water.forEach(function (w) { w.up = state.dry; });
      // 水分子數跟著核心：密閉時 ≈ 鍵數（瓶內的水），除水時剩下的少數
      const wantIn = Math.round(V.nA0 * (L.W / sim.NA0));
      const inFlask = V.water.filter(function (w) { return !w.up; }).length;
      if (!state.dry && inFlask > wantIn + 2) {
        for (let i = V.water.length - 1, rm = inFlask - wantIn; i >= 0 && rm > 0; i--) if (!V.water[i].up) { V.water.splice(i, 1); rm--; }
      }
    }
    V.sync = function (L) { if (V.kind === 'add') addSync(L); else condSync(L); };
    V.step = function (dt, noise) { dyn(dt, noise); };
    return V;
  })();

  // ======================= 音效 =======================
  const Snd = (function () {
    let lastDrip = 0, lastTerm = 0;
    function on() { return !!(window.LabSound && window.LabSettings && window.LabSettings.get('sound')); }
    return {
      start: function () { if (on()) window.LabSound.sweep({ from: 330, to: 660, dur: 0.25, gain: 0.18 }); },
      term: function (comb) {
        const now = performance.now();
        if (!on() || now - lastTerm < 180) return;
        lastTerm = now;
        if (comb) { window.LabSound.tone({ freq: 520, dur: 0.08, gain: 0.16 }); window.LabSound.tone({ freq: 780, dur: 0.12, gain: 0.16, delay: 0.07 }); }
        else window.LabSound.tone({ freq: 440, dur: 0.1, gain: 0.14, type: 'triangle' });
      },
      drip: function () {
        const now = performance.now();
        if (!on() || now - lastDrip < 160) return;
        lastDrip = now;
        window.LabSound.sweep({ from: 1400, to: 700, dur: 0.07, gain: 0.14 });
      },
      milestone: function (k) { if (on()) window.LabSound.tone({ freq: 392 * Math.pow(2, k / 4), dur: 0.16, gain: 0.18 }); },
      eq: function () { if (!on()) return; window.LabSound.tone({ freq: 523, dur: 0.18, gain: 0.16 }); window.LabSound.tone({ freq: 659, dur: 0.25, gain: 0.16, delay: 0.16 }); },
      end: function () { if (!on()) return; [523, 659, 784].forEach(function (f, i) { window.LabSound.tone({ freq: f, dur: 0.3, gain: 0.14, delay: i * 0.11 }); }); },
      click: function () { if (on()) window.LabSound.tone({ freq: 880, dur: 0.05, gain: 0.12 }); }
    };
  })();

  // ======================= 推進 =======================
  let tickAcc = 0;
  function advance(dtw) {
    const want = dtw * SPEEDS[state.speed];
    const t0 = performance.now(), tStart = sim.t;
    let left = want;
    while (left > 1e-9 && !PC.ended(sim)) {
      const tb = sim.t;
      PC.step(sim, left, 6000);
      left -= sim.t - tb;
      if (performance.now() - t0 > 7) break;          // 算不完就讓模擬時間落後（實際倍率變慢）
    }
    lite = liteStats();
    sample(false);
    afterAdvance(tStart);
  }
  function afterAdvance(tStart) {
    const L = lite;
    if (sim.kind === 'add') {
      if (run.t50 == null && L.conv >= 0.5) run.t50 = tStart + (sim.t - tStart) * 0.5;
      [0.25, 0.5, 0.75, 0.9].forEach(function (m, k) { if (!run.marks[m] && L.conv >= m) { run.marks[m] = 1; Snd.milestone(k); } });
    } else {
      [10, 100, 1000].forEach(function (m, k) { if (!run.marks[m] && L.Xn >= m) { run.marks[m] = 1; Snd.milestone(k * 2); } });
      const wOut = sim.Wout / sim.nAA * PC.COND[state.pair].nA0 * PC.M_H2O;
      if (wOut - run.wOutShown >= 0.05) { run.wOutShown = wOut; Snd.drip(); drops.push({ y: 0, v: 0 }); }
      if (!state.dry && !run.everDry && run.eqXn == null && sim.t >= 20) {
        const peq = PC.peqClosed(sim.K, sim.NA0, sim.NB0) / Math.min(sim.NA0, sim.NB0);
        if (Math.abs(L.conv - peq) <= 0.004) {
          run.eqXn = L.Xn;
          Snd.eq();
          setStatus(T('達到平衡：正反應與水解一樣快，聚合度停在 Xn ≈ ' + sigf(L.Xn, 3) + '。打開「減壓除水」看看。',
            'Equilibrium: bonds form and hydrolyse at the same rate, and Xn stays at about ' + sigf(L.Xn, 3) + '. Try switching water removal on.'));
        }
      }
    }
    if (PC.ended(sim) && !run.ended) {
      run.ended = true;
      state.running = false;
      updatePlay();
      Snd.end();
      const s = fullStats(true);
      if (sim.kind === 'add') {
        if (sim.NM > 0 && s.conv < 0.995) setStatus(T('起始劑用完了，自由基也全部終止：還有 ' + pct(1 - s.conv) + ' 的單體沒有反應，聚合停在半路。', 'The initiator has run out and every radical has stopped: ' + pct(1 - s.conv) + ' of the monomer is left unreacted. The polymerisation has stopped half-way.'));
        else setStatus(T('單體幾乎用完，聚合結束。', 'Almost all the monomer has reacted; the polymerisation is over.'));
      } else setStatus(T('官能基幾乎全部反應完，聚合結束。', 'Almost every functional group has reacted; the polymerisation is over.'));
      emitTick();
    }
  }

  // ======================= 任務事件 =======================
  function evData() {
    const s = fullStats(true);
    const d = { mode: sim.kind, t: sim.t, conv: s.conv, Xn: s.Xn, Xw: s.Xw, PDI: s.PDI, Mn: s.Mn, Mw: s.Mw, ended: !!s.ended, run: runSeq, seg: segId, running: state.running };
    if (sim.kind === 'add') {
      Object.assign(d, { mon: sim.mon, gas: !!PC.ADD_MON[sim.mon].gas, init: sim.init, term: sim.term, shrink: s.shrink, initLeft: s.initLeft, radicals: s.radicals,
        deadEnd: !!(s.ended && sim.NM > 0 && sim.NI === 0), t50: run.t50 });
    } else {
      const atEq = !state.dry && !run.everDry && s.peq != null && sim.t >= 20 && Math.abs(s.conv - s.peq) <= 0.004;
      Object.assign(d, { pair: sim.pair, ab: sim.ab, q: sim.q, r: s.r, dry: state.dry, everDry: run.everDry, closedAll: !run.everDry, pA: s.pA,
        waterOut: s.waterOut, waterMax: s.waterMax, peq: s.peq, atEq: atEq, eqXn: run.eqXn });
    }
    return d;
  }
  function emit(type, data) { if (userActed && window.LabMission) window.LabMission.emit(type, data); }
  function emitTick() { if (userActed) emit('tick', evData()); }

  // ======================= 版面 =======================
  let W = 0, H = 0, LY = null;
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    const h = w < 560 ? Math.round(Math.max(420, w * 1.5)) : 420;
    cv.style.height = h + 'px';
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = w; H = h;
    if (w < 560) {
      const ah = Math.round(h * 0.46);
      LY = { narrow: true, ax: 0, ay: 0, aw: w, ah: ah, mx: w / 2, my: ah + (h - ah) / 2 + 8, mR: Math.min(w / 2 - 14, (h - ah) / 2 - 22) };
    } else {
      const aw = Math.round(w * 0.42);
      LY = { narrow: false, ax: 0, ay: 0, aw: aw, ah: h, mx: aw + (w - aw) / 2, my: h / 2 + 6, mR: Math.min((w - aw) / 2 - 16, h / 2 - 22) };
    }
    resizeGraph();
    drawAll();
  }
  function resizeGraph() {
    const w = gcv.clientWidth;
    if (!w) return;
    const h = w < 560 ? 280 : 320;
    gcv.style.height = h + 'px';
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    gcv.width = Math.round(w * dpr); gcv.height = Math.round(h * dpr);
    gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ======================= 畫反應器 =======================
  let stirAng = 0, drops = [], refluxT = 0;
  function apparatusGeom() {
    const A = LY;
    if (state.mode === 'add' && PC.ADD_MON[state.mon].gas) {
      const r = Math.min(A.aw * 0.2, A.ah * (A.narrow ? 0.2 : 0.16));
      return { kind: 'clave', cx: A.ax + A.aw * 0.42, cy: A.ay + A.ah * (A.narrow ? 0.66 : 0.6), r: r };
    }
    const r = Math.min(A.aw * (state.mode === 'cond' ? 0.17 : 0.2), A.ah * (A.narrow ? (state.mode === 'cond' ? 0.18 : 0.2) : 0.15));
    return { kind: 'flask', cx: A.ax + A.aw * (state.mode === 'cond' ? (A.narrow ? 0.3 : 0.34) : (A.narrow ? 0.42 : 0.42)), cy: A.ay + A.ah * (A.narrow ? 0.72 : 0.66), r: r };
  }
  function flaskPath(c, cx, cy, r, nw, topY) {
    const d = Math.asin(Math.min(0.95, nw / 2 / r));
    const a1 = -Math.PI / 2 - d, a2 = -Math.PI / 2 + d;
    c.beginPath();
    c.moveTo(cx - nw / 2, topY);
    c.lineTo(cx - nw / 2, cy + r * Math.sin(a1));
    c.arc(cx, cy, r, a1, a2, true);
    c.lineTo(cx + nw / 2, topY);
  }
  function drawGlassTube(c, pts, w) {
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
    c.strokeStyle = LD.alpha(col.muted, col.dark ? 0.55 : 0.5); c.lineWidth = w + 2.5; c.stroke();
    c.strokeStyle = LD.alpha(col.bg, 0.92); c.lineWidth = w; c.stroke();
    c.strokeStyle = LD.alpha('#ffffff', col.dark ? 0.18 : 0.7); c.lineWidth = 1.2;
    c.translate(-w * 0.18, -w * 0.18); c.stroke();
    c.restore();
  }
  function liquidColor() {
    if (state.mode === 'add') {
      const L = lite || { conv: 0 };
      return LD.mix(LD.mix(col.mon[state.mon], col.bg, 0.55), col.poly[state.mon], Math.min(1, L.conv) * 0.45);
    }
    const base = state.pair === 'nylon66' ? '#d9b46a' : state.pair === 'pet' ? '#cfd8c9' : '#e2d2a8';
    return LD.mix(base, col.bg, col.dark ? 0.35 : 0.1);
  }
  function drawFlask(G, dt) {
    const c = ctx, cx = G.cx, cy = G.cy, r = G.r, nw = r * 0.5, topY = cy - r * 1.85;
    const L = lite || { conv: 0 };
    // 加熱包
    const mg = c.createLinearGradient(0, cy, 0, cy + r * 1.3);
    mg.addColorStop(0, LD.shade(col.mantle, 0.18)); mg.addColorStop(1, LD.shade(col.mantle, -0.25));
    c.save();
    c.beginPath(); c.ellipse(cx, cy + r * 0.12, r * 1.28, r * 1.18, 0, 0.02, Math.PI - 0.02); c.closePath();
    c.fillStyle = mg; c.shadowColor = LD.shadowInk(0.35); c.shadowBlur = 10; c.shadowOffsetY = 3; c.fill();
    c.restore();
    const glow = c.createRadialGradient(cx, cy + r * 0.55, r * 0.2, cx, cy + r * 0.55, r * 1.2);
    glow.addColorStop(0, LD.alpha(col.heat, state.running ? 0.55 : 0.28)); glow.addColorStop(1, LD.alpha(col.heat, 0));
    c.fillStyle = glow; c.beginPath(); c.ellipse(cx, cy + r * 0.12, r * 1.2, r * 1.1, 0, 0, Math.PI); c.fill();
    LD.contactShadow(c, cx, cy + r * 1.32, r * 1.2, 0);
    // 液體
    let level;
    if (state.mode === 'add') { const sh = full && full.shrink != null ? full.shrink : 0; level = 0.58 * (1 - sh * 1.6); }
    else { const s = full; level = 0.52 * (s && s.mFeed ? s.mFlask / s.mFeed : 1); }
    const ly = cy + r - 2 * r * level;
    c.save();
    c.beginPath(); c.arc(cx, cy, r - 1.5, 0, Math.PI * 2); c.clip();
    const lc = liquidColor();
    const lg = c.createLinearGradient(0, ly, 0, cy + r);
    lg.addColorStop(0, LD.alpha(LD.shade(lc, 0.25), 0.85)); lg.addColorStop(1, LD.alpha(LD.shade(lc, -0.15), 0.95));
    c.fillStyle = lg; c.fillRect(cx - r, ly, 2 * r, cy + r - ly);
    // 黏稠的光帶（聚合物越多越明顯，示意）
    const visc = state.mode === 'add' ? L.conv : Math.min(1, Math.log10(Math.max(1, L.Xn)) / 2.5);
    if (visc > 0.05) {
      c.strokeStyle = LD.alpha('#ffffff', 0.12 + 0.2 * visc); c.lineWidth = 2;
      for (let k = 0; k < 3; k++) { c.beginPath(); const yy = ly + (cy + r - ly) * (0.3 + 0.22 * k); c.moveTo(cx - r * 0.7, yy); c.quadraticCurveTo(cx, yy - r * 0.12 * visc * Math.sin(stirAng * 0.5 + k), cx + r * 0.7, yy); c.stroke(); }
    }
    // 液面（彎月面）
    const half = Math.sqrt(Math.max(0, r * r - (ly - cy) * (ly - cy)));
    c.beginPath(); c.ellipse(cx, ly, half, Math.max(2, half * 0.12), 0, 0, Math.PI * 2);
    c.fillStyle = LD.alpha(LD.shade(lc, 0.4), 0.7); c.fill();
    // 攪拌子
    const om = state.running ? 9 / (1 + 4 * visc) : 0;
    stirAng += om * dt;
    const sw = r * 0.38 * Math.abs(Math.cos(stirAng)) + 3;
    c.fillStyle = col.dark ? '#e8ecf0' : '#ffffff';
    c.strokeStyle = LD.alpha(col.text, 0.35); c.lineWidth = 1;
    c.beginPath(); c.ellipse(cx, cy + r * 0.84, sw, 3.2, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.restore();
    // 原來的液面（加成聚合的液體單體）
    if (state.mode === 'add' && full && full.shrink > 0.005) {
      const y0 = cy + r - 2 * r * 0.58;
      c.save(); c.setLineDash([4, 3]); c.strokeStyle = LD.alpha(col.text, 0.5); c.lineWidth = 1;
      const h0 = Math.sqrt(Math.max(0, r * r - (y0 - cy) * (y0 - cy)));
      c.beginPath(); c.moveTo(cx - h0 - 4, y0); c.lineTo(cx + h0 + 4, y0); c.stroke(); c.restore();
    }
    // 玻璃
    c.save();
    flaskPath(c, cx, cy, r, nw, topY);
    c.fillStyle = LD.alpha('#ffffff', col.dark ? 0.04 : 0.12); c.fill();
    c.strokeStyle = LD.alpha(col.text, col.dark ? 0.55 : 0.45); c.lineWidth = 1.8; c.stroke();
    c.beginPath(); c.arc(cx, cy, r * 0.82, Math.PI * 1.08, Math.PI * 1.42);
    c.strokeStyle = LD.alpha('#ffffff', col.dark ? 0.35 : 0.85); c.lineWidth = 3; c.lineCap = 'round'; c.stroke();
    c.beginPath(); c.moveTo(cx - nw * 0.28, topY + 6); c.lineTo(cx - nw * 0.28, cy - r * 1.02); c.lineWidth = 2; c.stroke();
    c.restore();
    LD.block(c, cx - nw / 2 - 3, topY - 4, nw + 6, 6, LD.alpha(col.muted, 0.8), { r: 2, shadow: false });
    return { liquidY: ly, topY: topY, nw: nw };
  }
  function drawClave(G) {
    const c = ctx, cx = G.cx, cy = G.cy, r = G.r, w = r * 1.5, h = r * 2.5, x0 = cx - w / 2, y0 = cy - h * 0.5;
    const L = lite || { conv: 0 };
    LD.contactShadow(c, cx, y0 + h + 2, w * 0.6, 0);
    // 本體（金屬圓筒）
    const g = c.createLinearGradient(x0, 0, x0 + w, 0);
    g.addColorStop(0, LD.shade(col.metal, -0.35)); g.addColorStop(0.3, LD.shade(col.metal, 0.35)); g.addColorStop(0.55, col.metal); g.addColorStop(1, LD.shade(col.metal, -0.45));
    c.save();
    LD.roundRect(c, x0, y0, w, h, w * 0.28);
    c.fillStyle = g; c.shadowColor = LD.shadowInk(0.3); c.shadowBlur = 10; c.shadowOffsetY = 3; c.fill();
    c.restore();
    // 加熱夾套
    for (let k = 0; k < 3; k++) {
      const yy = y0 + h * (0.5 + 0.13 * k);
      c.fillStyle = LD.alpha(col.heat, state.running ? 0.55 : 0.3);
      c.fillRect(x0 + 1, yy, w - 2, h * 0.05);
    }
    // 凸緣與螺栓
    const fy = y0 + h * 0.13;
    LD.block(c, x0 - 5, fy, w + 10, 10, LD.shade(col.metal, -0.15), { r: 3, shadow: false });
    for (let k = 0; k < 5; k++) LD.ball(c, x0 - 1 + (w + 2) * k / 4, fy + 5, 2.6, LD.shade(col.metal, -0.3), { shadow: false });
    // 觀察窗
    const wx = cx, wy = cy + h * 0.08, wr = r * 0.42;
    c.save();
    c.beginPath(); c.arc(wx, wy, wr, 0, Math.PI * 2);
    const wg = c.createRadialGradient(wx - wr * 0.3, wy - wr * 0.3, 1, wx, wy, wr);
    wg.addColorStop(0, LD.alpha(LD.mix(col.mon[state.mon], '#ffffff', 0.6), 0.95)); wg.addColorStop(1, LD.alpha(LD.mix(col.mon[state.mon], col.poly[state.mon], L.conv), 0.9));
    c.fillStyle = wg; c.fill();
    c.lineWidth = 3; c.strokeStyle = LD.shade(col.metal, -0.4); c.stroke();
    c.restore();
    // 壓力計
    const gx = cx, gy = y0 - r * 0.62, gr = r * 0.46;
    c.strokeStyle = LD.shade(col.metal, -0.3); c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(gx, y0 + 2); c.lineTo(gx, gy + gr); c.stroke();
    c.save();
    c.beginPath(); c.arc(gx, gy, gr, 0, Math.PI * 2);
    c.fillStyle = col.dark ? '#20252b' : '#fbfcfd'; c.shadowColor = LD.shadowInk(0.3); c.shadowBlur = 6; c.fill();
    c.restore();
    c.beginPath(); c.arc(gx, gy, gr, 0, Math.PI * 2); c.lineWidth = 2.5; c.strokeStyle = LD.shade(col.metal, -0.25); c.stroke();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    for (let k = 0; k <= 10; k++) {
      const a = a0 + (a1 - a0) * k / 10, l = k % 5 === 0 ? 0.26 : 0.14;
      c.beginPath(); c.moveTo(gx + Math.cos(a) * gr * 0.86, gy + Math.sin(a) * gr * 0.86); c.lineTo(gx + Math.cos(a) * gr * (0.86 - l), gy + Math.sin(a) * gr * (0.86 - l));
      c.strokeStyle = LD.alpha(col.text, 0.7); c.lineWidth = k % 5 === 0 ? 1.4 : 0.8; c.stroke();
    }
    const pr = 1 - L.conv, an = a0 + (a1 - a0) * pr;
    c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + Math.cos(an) * gr * 0.78, gy + Math.sin(an) * gr * 0.78);
    c.strokeStyle = col.pos; c.lineWidth = 2; c.stroke();
    LD.ball(c, gx, gy, 2.6, LD.shade(col.metal, -0.3), { shadow: false });
    LD.pill(c, T('壓力 ', 'Pressure ') + pct(pr, 0), gx + gr + 6, gy + 6, col.text, 'left', fnt(11));
    return { liquidY: wy, sx: wx, sy: wy, wr: wr };
  }
  function drawCondExtras(G, F, dt) {
    const c = ctx, cx = G.cx, cy = G.cy, r = G.r, topY = F.topY;
    const A = LY;
    if (state.dry) {
      // 側管 → 冷凝 → 收集管 → 抽氣
      const xr = A.ax + A.aw * (A.narrow ? 0.6 : 0.8), yTube = topY - 6;
      const rTop = cy - r * 0.1, rBot = cy + r * 1.05, rw = Math.max(16, r * 0.42);
      drawGlassTube(c, [[cx, topY + 4], [cx, yTube], [xr, yTube], [xr, rTop - 8]], 6);
      // 冷凝套管（示意）
      c.save();
      LD.roundRect(c, cx + (xr - cx) * 0.25, yTube - 7, (xr - cx) * 0.5, 14, 6);
      c.fillStyle = LD.alpha(col.water, col.dark ? 0.25 : 0.18); c.fill();
      c.strokeStyle = LD.alpha(col.water, 0.6); c.lineWidth = 1; c.stroke();
      c.restore();
      // 收集管
      c.save();
      c.beginPath();
      c.moveTo(xr - rw / 2, rTop); c.lineTo(xr - rw / 2, rBot - rw / 2); c.arc(xr, rBot - rw / 2, rw / 2, Math.PI, 0, true); c.lineTo(xr + rw / 2, rTop);
      c.fillStyle = LD.alpha('#ffffff', col.dark ? 0.05 : 0.15); c.fill();
      c.save(); c.clip();
      const s = full || { waterOut: 0, waterMax: 1 };
      const frac = Math.min(1, s.waterOut / (s.waterMax || 1));
      const wy = rBot - (rBot - rTop - 6) * frac * 0.92;
      const wgr = c.createLinearGradient(xr - rw / 2, 0, xr + rw / 2, 0);
      wgr.addColorStop(0, LD.alpha(col.water, 0.55)); wgr.addColorStop(0.4, LD.alpha(LD.mix(col.water, '#ffffff', 0.35), 0.5)); wgr.addColorStop(1, LD.alpha(col.water, 0.6));
      c.fillStyle = wgr; c.fillRect(xr - rw / 2, wy, rw, rBot - wy + 2);
      c.beginPath(); c.ellipse(xr, wy, rw / 2, 2.2, 0, 0, Math.PI * 2); c.fillStyle = LD.alpha(col.water, 0.75); c.fill();
      c.restore();
      c.strokeStyle = LD.alpha(col.text, col.dark ? 0.55 : 0.45); c.lineWidth = 1.6; c.stroke();
      for (let k = 1; k <= 4; k++) { const yy = rBot - (rBot - rTop - 6) * 0.92 * k / 4; c.beginPath(); c.moveTo(xr - rw / 2, yy); c.lineTo(xr - rw / 2 + 5, yy); c.strokeStyle = LD.alpha(col.text, 0.5); c.lineWidth = 1; c.stroke(); }
      c.restore();
      // 水滴
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        if (!reducedMotion) { d.v += 600 * dt; d.y += d.v * dt; } else d.y = 1e9;
        const yy = rTop - 6 + d.y;
        if (yy > rBot - 8 || d.y > 400) { drops.splice(i, 1); continue; }
        LD.ball(c, xr, yy, 2.4, col.water, { shadow: false });
      }
      // 抽氣
      const px = xr + rw / 2 + 4, py = rTop - 2;
      drawGlassTube(c, [[xr + rw * 0.3, rTop + 2], [px + 8, py - 12]], 3);
      LD.pill(c, T('↑ 抽氣', '↑ to pump'), px + 2, py - 14, col.muted, 'left', fnt(11));
      const lab = T('收集的水 ', 'Water ') + num(s.waterOut, 2) + ' g';
      c.font = fnt(12);
      LD.pill(c, lab, Math.min(xr, A.ax + A.aw - 8 - c.measureText(lab).width / 2 - 6), rBot + fsz(12) + 8, col.water, 'center', fnt(12));
    } else {
      // 迴流冷凝管：水回到瓶內
      const x = cx, y1 = topY - r * 1.25, w = Math.max(12, F.nw * 0.9);
      c.save();
      LD.roundRect(c, x - w / 2 - 5, y1 + 8, w + 10, (topY - y1) - 14, 7);
      c.fillStyle = LD.alpha(col.water, col.dark ? 0.22 : 0.16); c.fill();
      c.strokeStyle = LD.alpha(col.water, 0.6); c.lineWidth = 1; c.stroke();
      c.restore();
      drawGlassTube(c, [[x, topY - 2], [x, y1]], w * 0.55);
      refluxT += dt;
      if (!reducedMotion && state.running) {
        for (let k = 0; k < 2; k++) {
          const u = ((refluxT * 0.7 + k * 0.5) % 1);
          LD.ball(c, x, y1 + 10 + u * (topY - y1 + r * 0.3), 2.2, col.water, { shadow: false });
        }
      }
      if (A.narrow) LD.pill(c, T('密閉：水留在瓶內', 'Closed: the water stays'), x + w / 2 + 10, y1 + fsz(11) + 14, col.muted, 'left', fnt(11));
      else LD.pill(c, T('密閉：水留在瓶內', 'Closed: the water stays'), x, y1 - 4, col.muted, 'center', fnt(11));
    }
  }

  // ======================= 畫放大圖 =======================
  function proj(x, y, z) {
    const s = 1 / (1 - 0.22 * z);
    return [LY.mx + x * LY.mR * 0.95 * s, LY.my - y * LY.mR * 0.95 * s, s];
  }
  function drawMagnifier(src) {
    const c = ctx, mx = LY.mx, my = LY.my, R = LY.mR;
    if (R < 30) return;
    // 鏡筒光錐
    if (src) {
      const dx = mx - src[0], dy = my - src[1], d = Math.hypot(dx, dy);
      if (d > R + 4) {
        const a = Math.atan2(dy, dx), b = Math.asin(Math.min(1, R / d));
        c.save();
        c.beginPath(); c.moveTo(src[0], src[1]);
        c.lineTo(mx - R * Math.sin(a + b) * 0 + Math.cos(a + Math.PI / 2 + b) * R, my + Math.sin(a + Math.PI / 2 + b) * R);
        c.lineTo(mx + Math.cos(a - Math.PI / 2 - b) * R, my + Math.sin(a - Math.PI / 2 - b) * R);
        c.closePath();
        c.fillStyle = LD.alpha(col.accent, col.dark ? 0.1 : 0.07); c.fill();
        c.restore();
        LD.ball(c, src[0], src[1], 3, col.accent, { shadow: false });
      }
    }
    // 底色
    c.save();
    c.beginPath(); c.arc(mx, my, R, 0, Math.PI * 2);
    const bgc = state.mode === 'add' ? LD.mix(col.bg, col.mon[state.mon], col.dark ? 0.1 : 0.06) : LD.mix(col.bg, liquidColor(), col.dark ? 0.18 : 0.22);
    const bg = c.createRadialGradient(mx - R * 0.3, my - R * 0.35, R * 0.1, mx, my, R);
    bg.addColorStop(0, LD.shade(bgc, col.dark ? 0.06 : 0.5)); bg.addColorStop(1, LD.shade(bgc, col.dark ? -0.25 : -0.06));
    c.fillStyle = bg; c.fill();
    c.clip();
    drawMolecules(c);
    c.restore();
    // 鏡框
    c.save();
    c.beginPath(); c.arc(mx, my, R + 4, 0, Math.PI * 2);
    c.lineWidth = 8;
    const rg = c.createLinearGradient(mx - R, my - R, mx + R, my + R);
    rg.addColorStop(0, LD.shade(col.metal, 0.5)); rg.addColorStop(0.5, col.metal); rg.addColorStop(1, LD.shade(col.metal, -0.45));
    c.strokeStyle = rg; c.shadowColor = LD.shadowInk(0.35); c.shadowBlur = 10; c.shadowOffsetY = 3; c.stroke();
    c.restore();
    c.beginPath(); c.arc(mx, my, R - 6, Math.PI * 1.1, Math.PI * 1.38);
    c.strokeStyle = LD.alpha('#ffffff', col.dark ? 0.22 : 0.6); c.lineWidth = 4; c.lineCap = 'round'; c.stroke();
    if (LY.narrow) LD.pill(c, T('放大示意（未依比例）', 'Magnified sketch (not to scale)'), mx, my + R - 14, col.muted, 'center', fnt(11));
    else LD.pill(c, T('放大示意（未依比例）', 'Magnified sketch (not to scale)'), mx, my - R - 10, col.muted, 'center', fnt(11));
  }
  function bl(c, x, y, r, color, o) { LD.ball(c, x, y, Math.max(1, Math.round(r * 2) / 2), color, o); }
  function drawMolecules(c) {
    const V = Vis, B = V.beads, R = LY.mR, uc = unitColors();
    const rb = Math.max(3.2, R * 0.042);
    const P = B.map(function (b) { return proj(b.x, b.y, b.z); });
    // 鍵
    c.save();
    c.lineCap = 'round';
    V.bonds.forEach(function (bd) {
      const a = P[bd[0]], b = P[bd[1]], z = (B[bd[0]].z + B[bd[1]].z) / 2;
      const colr = V.kind === 'add' ? uc.p : LD.mix(uc.A, uc.B, 0.5);
      const w = rb * 0.75 * (a[2] + b[2]) / 2;
      c.strokeStyle = LD.alpha(LD.shade(colr, -0.25), 0.55 + 0.35 * (z + 1) / 2); c.lineWidth = w;
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
      c.strokeStyle = LD.alpha(LD.shade(colr, 0.45), 0.5); c.lineWidth = Math.max(1, w * 0.3);
      c.beginPath(); c.moveTo(a[0], a[1] - w * 0.15); c.lineTo(b[0], b[1] - w * 0.15); c.stroke();
    });
    c.restore();
    // 珠子與水，依深度排序
    const items = [];
    B.forEach(function (b, i) { items.push({ z: b.z, i: i }); });
    V.water.forEach(function (w, i) { items.push({ z: w.z, w: i }); });
    items.sort(function (a, b) { return a.z - b.z; });
    const live = {};
    if (V.kind === 'add') V.chains.forEach(function (ch) { if (ch.live) live[ch.beads[ch.beads.length - 1]] = 1; });
    items.forEach(function (it) {
      if (it.w != null) {
        const w = V.water[it.w], p = proj(w.x, w.y, w.z), r = rb * 0.55 * p[2];
        const hx = Math.cos(w.th) * r * 1.05, hy = Math.sin(w.th) * r * 1.05;
        bl(c, p[0] + hx * 0.8 - hy * 0.6, p[1] + hy * 0.8 + hx * 0.6, r * 0.55, col.H, { shadow: false, ring: LD.alpha(col.text, 0.55) });
        bl(c, p[0] - hx * 0.8 - hy * 0.6, p[1] - hy * 0.8 + hx * 0.6, r * 0.55, col.H, { shadow: false, ring: LD.alpha(col.text, 0.55) });
        bl(c, p[0], p[1], r, col.O, { shadow: false });
        return;
      }
      const b = B[it.i], p = P[it.i], r = Math.round(rb * p[2] * 2) / 2;
      const fade = 0.55 + 0.45 * (b.z + 1) / 2;
      c.globalAlpha = fade;
      if (V.kind === 'add') {
        if (b.k === 'm') {
          bl(c, p[0], p[1], r * 0.86, uc.m, { shadow: false });
          // 雙鍵記號
          const ux = Math.cos(b.th), uy = Math.sin(b.th);
          c.strokeStyle = LD.alpha('#ffffff', 0.85); c.lineWidth = 1.1;
          for (let s = -1; s <= 1; s += 2) { c.beginPath(); c.moveTo(p[0] - ux * r * 0.45 - uy * s * 1.4, p[1] - uy * r * 0.45 + ux * s * 1.4); c.lineTo(p[0] + ux * r * 0.45 - uy * s * 1.4, p[1] + uy * r * 0.45 + ux * s * 1.4); c.stroke(); }
        } else {
          bl(c, p[0], p[1], r, uc.p, { shadow: false });
          if (live[it.i]) {
            c.globalAlpha = 1;
            const t = performance.now() / 1000, pulse = reducedMotion ? 0.7 : 0.6 + 0.4 * Math.sin(t * 6);
            const g = c.createRadialGradient(p[0], p[1], r * 0.4, p[0], p[1], r * 2.4);
            g.addColorStop(0, LD.alpha(col.rad, 0.75 * pulse)); g.addColorStop(1, LD.alpha(col.rad, 0));
            c.fillStyle = g; c.beginPath(); c.arc(p[0], p[1], r * 2.4, 0, Math.PI * 2); c.fill();
            bl(c, p[0] + r * 0.75, p[1] - r * 0.75, Math.max(1.6, r * 0.3), col.rad, { shadow: false, glow: 0.4 });
          }
        }
      } else {
        const colr = b.k === 'A' ? uc.A : b.k === 'B' ? uc.B : uc.X;
        // 沒反應的端基（小凸起）
        for (let s = 0; s < 2; s++) {
          if (b.e[s] >= 0) continue;
          const a = b.th + s * Math.PI, gt = b.k === 'A' ? 'A' : b.k === 'B' ? 'B' : (s === 0 ? 'A' : 'B');
          bl(c, p[0] + Math.cos(a) * r * 0.95, p[1] + Math.sin(a) * r * 0.95, r * 0.46, gt === 'A' ? uc.nA : uc.nB, { shadow: false });
        }
        bl(c, p[0], p[1], r, colr, { shadow: false });
      }
      c.globalAlpha = 1;
    });
    // 閃光
    V.flashes.forEach(function (f) {
      const p = proj(f.x, f.y, f.z), u = f.u, rr = rb * (1.2 + 3 * u);
      const colr = f.kind === 'cut' ? col.water : f.kind === 'link' ? col.accent : col.rad;
      c.strokeStyle = LD.alpha(colr, 0.8 * (1 - u)); c.lineWidth = 2;
      c.beginPath(); c.arc(p[0], p[1], rr, 0, Math.PI * 2); c.stroke();
    });
  }

  function drawStage(dt) {
    if (!W) return;
    const c = ctx;
    LD.backdrop(c, W, H);
    // 桌面
    const G = apparatusGeom();
    const benchY = G.kind === 'clave' ? G.cy + G.r * 1.27 + 2 : G.cy + G.r * 1.32;
    const bg = c.createLinearGradient(0, benchY, 0, benchY + 14);
    bg.addColorStop(0, LD.alpha(col.text, col.dark ? 0.18 : 0.1)); bg.addColorStop(1, LD.alpha(col.text, 0));
    c.fillStyle = bg; c.fillRect(LY.ax + 6, benchY, LY.aw - 12, 14);
    let src = null;
    if (G.kind === 'clave') { const r = drawClave(G); src = [r.sx, r.sy]; }
    else {
      const F = drawFlask(G, dt);
      if (state.mode === 'cond') drawCondExtras(G, F, dt);
      src = [G.cx + G.r * 0.15, (F.liquidY + G.cy + G.r) / 2];
    }
    // 名稱
    let name;
    if (state.mode === 'add') { const d = PC.ADD_MON[state.mon]; name = T(d.zh, cap(d.en)) + ' → ' + d.ab; }
    else { const d = PC.COND[state.pair]; name = T(state.pair === 'pet' ? 'PET' : d.zh, state.pair === 'nylon66' ? 'Nylon-6,6' : state.pair === 'pet' ? 'PET' : 'PLA'); }
    const nb = LD.pill(c, name, LY.ax + 10, LY.ay + 26, col.text, 'left', fnt(13));
    const L = lite || { conv: 0, Xn: 0, t: 0 };
    const tl = 't = ' + sigf(L.t, 3) + ' s' + (state.running ? '' : T('（暫停）', ' (paused)'));
    if (LY.narrow) LD.pill(c, tl, nb.x + nb.w + 6, LY.ay + 26, col.muted, 'left', fnt(11));   // 窄螢幕：排在名稱右邊，讓出器材上方的空間
    else LD.pill(c, tl, LY.ax + 10, LY.ay + 50, col.muted, 'left', fnt(11));
    drawMagnifier(src);
  }

  // ======================= 圖表 =======================
  function plotFrame(g, x0, y0, x1, y1) {
    g.save();
    g.fillStyle = LD.alpha(col.surface, col.dark ? 0.35 : 0.6);
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.strokeStyle = LD.alpha(col.text, 0.45); g.lineWidth = 1;
    g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
    g.restore();
  }
  function logTicks(g, x0, x1, y0, y1, lo, hi, axis) {
    // axis 'y'：縱軸 log；'x'：橫軸 log
    g.save();
    g.font = fnt(11, '400');
    for (let e = Math.ceil(lo); e <= hi; e++) {
      for (let m = 1; m < 10; m++) {
        const v = e + Math.log10(m);
        if (v > hi + 1e-9) break;
        const pos = axis === 'y' ? y1 - (v - lo) / (hi - lo) * (y1 - y0) : x0 + (v - lo) / (hi - lo) * (x1 - x0);
        g.strokeStyle = LD.alpha(col.text, m === 1 ? 0.12 : 0.045); g.lineWidth = 1;
        g.beginPath();
        if (axis === 'y') { g.moveTo(x0, Math.round(pos) + 0.5); g.lineTo(x1, Math.round(pos) + 0.5); }
        else { g.moveTo(Math.round(pos) + 0.5, y0); g.lineTo(Math.round(pos) + 0.5, y1); }
        g.stroke();
        if (m === 1) {
          const lab = e <= 3 ? String(Math.pow(10, e)) : null;
          if (axis === 'y') { if (lab) LD.haloText(g, lab, x0 - 5, pos + 4, col.muted, 'right', 'alphabetic', fnt(11, '400')); else LD.supText(g, '10', String(e), x0 - 5, pos + 4, col.muted, fnt(11, '400'), 'right'); }
          else { if (lab) LD.haloText(g, lab, pos, y1 + 5 + fsz(11), col.muted, 'center', 'alphabetic', fnt(11, '400')); else LD.supText(g, '10', String(e), pos, y1 + 5 + fsz(11), col.muted, fnt(11, '400'), 'center'); }
        }
      }
    }
    g.restore();
  }
  function linTicks(g, x0, x1, y0, y1, lo, hi, step, axis, fmt) {
    g.save(); g.font = fnt(11, '400');
    for (let v = lo; v <= hi + 1e-9; v += step) {
      const pos = axis === 'y' ? y1 - (v - lo) / (hi - lo) * (y1 - y0) : x0 + (v - lo) / (hi - lo) * (x1 - x0);
      g.strokeStyle = LD.alpha(col.text, 0.1); g.lineWidth = 1;
      g.beginPath();
      if (axis === 'y') { g.moveTo(x0, Math.round(pos) + 0.5); g.lineTo(x1, Math.round(pos) + 0.5); LD.haloText(g, fmt(v), x0 - 5, pos + 4, col.muted, 'right', 'alphabetic', fnt(11, '400')); }
      else { g.moveTo(Math.round(pos) + 0.5, y0); g.lineTo(Math.round(pos) + 0.5, y1); LD.haloText(g, fmt(v), pos, y1 + 5 + fsz(11), col.muted, 'center', 'alphabetic', fnt(11, '400')); }
      g.stroke();
    }
    g.restore();
  }
  const TRACE_COLS = function () { return [col.neg, col.pos, col.probe, '#c27c0e', '#8a4fc8', col.muted]; };
  function modeColor(kind) { return kind === 'add' ? (col.dark ? '#b49cf0' : '#6a4fc0') : (col.dark ? '#f08a5d' : '#c4501f'); }
  function drawGraph() {
    const g = gctx, w = gcv.clientWidth, h = gcv.clientHeight;
    if (!w || !sim) return;
    LD.backdrop(g, w, h);
    const x0 = Math.round(24 + fsz(11) * 2.6), x1 = w - (state.tab === 'time' ? Math.round(12 + fsz(11) * 2.6) : 14), y0 = 14, y1 = h - Math.round(22 + fsz(12) * 1.5);
    plotFrame(g, x0, y0, x1, y1);
    if (state.tab === 'xp') drawXP(g, x0, x1, y0, y1);
    else if (state.tab === 'mwd') drawMWD(g, x0, x1, y0, y1);
    else drawTime(g, x0, x1, y0, y1);
  }
  function polyline(g, pts, X, Y, color, width, dash) {
    g.save();
    g.beginPath();
    let on = false;
    pts.forEach(function (p) { const x = X(p), y = Y(p); if (!isFinite(x) || !isFinite(y)) { on = false; return; } if (on) g.lineTo(x, y); else { g.moveTo(x, y); on = true; } });
    if (dash) g.setLineDash(dash);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = LD.alpha(col.bg, 0.9); g.lineWidth = width + 2.5; g.stroke();
    g.strokeStyle = color; g.lineWidth = width; g.stroke();
    g.restore();
  }
  function drawXP(g, x0, x1, y0, y1) {
    const lo = 0, hi = 4;
    logTicks(g, x0, x1, y0, y1, lo, hi, 'y');
    linTicks(g, x0, x1, y0, y1, 0, 1, 0.2, 'x', function (v) { return num(v * 100, 0) + '%'; });
    const X = function (p) { return x0 + p[1] * (x1 - x0); };
    const Y = function (p) { const v = Math.log10(Math.max(1, p[2])); return y1 - Math.min(hi, v) / hi * (y1 - y0); };
    g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
    // 理論
    if (sim.kind === 'cond') {
      const r = Math.min(sim.NA0, sim.NB0) / Math.max(sim.NA0, sim.NB0), pts = [];
      for (let k = 0; k <= 400; k++) { const p = 1 - Math.pow(1 - k / 400, 1.6) * 1; pts.push([0, Math.min(p, 0.99999), PC.carothers(r, Math.min(p, 0.99999))]); }
      polyline(g, pts, X, Y, LD.alpha(col.text, 0.55), 1.3, [5, 4]);
      if (!state.dry) {
        const peq = PC.peqClosed(sim.K, sim.NA0, sim.NB0) / Math.min(sim.NA0, sim.NB0), xx = x0 + peq * (x1 - x0);
        g.save(); g.setLineDash([2, 3]); g.strokeStyle = LD.alpha(col.water, 0.9); g.lineWidth = 1.4; g.beginPath(); g.moveTo(xx, y0); g.lineTo(xx, y1); g.stroke(); g.restore();
        LD.haloText(g, T('密閉的平衡', 'closed equilibrium'), Math.min(xx - 4, x1 - 6), y0 + 14, col.water, 'right', 'alphabetic', fnt(11, '400'));
      }
    } else {
      const th = PC.addTheory(sim.init, 1), v = (sim.term === 'comb' ? 2 : 1) * th.nu;
      const yy = Y([0, 0, v]);
      g.save(); g.setLineDash([5, 4]); g.strokeStyle = LD.alpha(col.text, 0.55); g.lineWidth = 1.3; g.beginPath(); g.moveTo(x0, yy); g.lineTo(x1, yy); g.stroke(); g.restore();
      LD.haloText(g, (sim.term === 'comb' ? '2ν' : 'ν') + T('（起始時的理論值）', ' (theory at the start)'), x1 - 6, yy - 5, col.muted, 'right', 'alphabetic', fnt(11, '400'));
    }
    // 以前的曲線
    const TC = TRACE_COLS();
    traces.forEach(function (tr, i) {
      const cc = LD.alpha(TC[i % TC.length], 0.55);
      polyline(g, tr.hist, X, Y, cc, 1.6);
      const last = tr.hist[tr.hist.length - 1];
      if (last) LD.haloText(g, tr.label, Math.min(X(last) + 4, x1 - 4), Math.max(y0 + 12, Y(last) - 6), cc, X(last) > x1 - 80 ? 'right' : 'left', 'alphabetic', fnt(11));
    });
    // 目前
    polyline(g, run.hist, X, Y, modeColor(sim.kind), 2.6);
    const L = lite;
    if (L && L.Xn > 0) LD.ball(g, X([0, L.conv, L.Xn]), Y([0, L.conv, L.Xn]), 4.5, modeColor(sim.kind), { shadow: false });
    g.restore();
    LD.haloText(g, sim.kind === 'add' ? T('單體轉化率', 'Monomer conversion') : T('反應程度 p', 'Extent of reaction p'), (x0 + x1) / 2, y1 + 18 + fsz(12) * 1.3, col.text, 'center', 'alphabetic', fnt(12));
    g.save(); g.translate(14, (y0 + y1) / 2); g.rotate(-Math.PI / 2);
    LD.haloText(g, T('平均聚合度 Xn', 'Mean chain length Xn'), 0, 0, col.text, 'center', 'middle', fnt(12));
    g.restore();
  }
  let histCache = null, histAt = -1;
  function drawMWD(g, x0, x1, y0, y1) {
    const bins = 40, lo = 0, hi = 4;
    const now = performance.now();
    if (!histCache || now - histAt > 250) { histCache = PC.histogram(sim, bins, lo, hi); histAt = now; }
    const h = histCache;
    const s = fullStats();
    let ymax = 0.1;
    for (let k = 0; k < bins; k++) ymax = Math.max(ymax, h[k]);
    let theory = null;
    if (sim.kind === 'cond' && s.conv > 0.02) {
      const p = Math.min(0.99999, sim.L / sim.N);   // 全部分子的平均：鍵數 ÷ 單體數
      theory = [];
      for (let k = 0; k <= 240; k++) {
        const lx = lo + (hi - lo) * k / 240, x = Math.pow(10, lx);
        // 連續近似：dw/d(log10 x) = ln10 · x · w(x)
        theory.push([lx, Math.LN10 * x * PC.floryWeight(x, p)]);
        ymax = Math.max(ymax, theory[theory.length - 1][1]);
      }
    }
    ymax = Math.ceil(ymax * 1.15 * 10) / 10;
    logTicks(g, x0, x1, y0, y1, lo, hi, 'x');
    const step = ymax > 2 ? 0.5 : ymax > 1 ? 0.25 : 0.1;
    linTicks(g, x0, x1, y0, y1, 0, ymax, step, 'y', function (v) { return num(v, step < 0.25 ? 1 : 2); });
    const bw = (x1 - x0) / bins, bc = modeColor(sim.kind);
    for (let k = 0; k < bins; k++) {
      if (!(h[k] > 0)) continue;
      const bh = h[k] / ymax * (y1 - y0);
      const gr = g.createLinearGradient(0, y1 - bh, 0, y1);
      gr.addColorStop(0, LD.alpha(LD.shade(bc, 0.25), 0.9)); gr.addColorStop(1, LD.alpha(bc, 0.75));
      g.fillStyle = gr;
      g.fillRect(x0 + k * bw + 1, y1 - bh, bw - 2, bh);
    }
    if (theory) polyline(g, theory, function (p) { return x0 + (p[0] - lo) / (hi - lo) * (x1 - x0); }, function (p) { return y1 - p[1] / ymax * (y1 - y0); }, LD.alpha(col.text, 0.7), 1.5, [5, 4]);
    // Xn、Xw 標線
    [[s.Xn, 'Xn'], [s.Xw, 'Xw']].forEach(function (m, i) {
      if (!(m[0] >= 1)) return;
      const xx = x0 + (Math.log10(m[0]) - lo) / (hi - lo) * (x1 - x0);
      if (xx < x0 || xx > x1) return;
      g.save(); g.setLineDash([2, 3]); g.strokeStyle = i ? col.pos : col.neg; g.lineWidth = 1.4; g.beginPath(); g.moveTo(xx, y0); g.lineTo(xx, y1); g.stroke(); g.restore();
      LD.haloText(g, m[1], xx + 4, y0 + 14 + i * 15, i ? col.pos : col.neg, 'left', 'alphabetic', fnt(12));
    });
    if (sim.kind === 'add' && !(s.Xn > 0)) LD.haloText(g, T('還沒有聚合物', 'No polymer yet'), (x0 + x1) / 2, (y0 + y1) / 2, col.muted, 'center', 'alphabetic', fnt(11, '400'));
    LD.haloText(g, T('鏈長（單體數，對數刻度）', 'Chain length (monomers, log scale)'), (x0 + x1) / 2, y1 + 18 + fsz(12) * 1.3, col.text, 'center', 'alphabetic', fnt(12));
    g.save(); g.translate(14, (y0 + y1) / 2); g.rotate(-Math.PI / 2);
    LD.haloText(g, T('重量分率', 'Weight fraction'), 0, 0, col.text, 'center', 'middle', fnt(12));
    g.restore();
  }
  function drawTime(g, x0, x1, y0, y1) {
    const hist = run.hist, L = lite;
    const tmax0 = Math.max(10, (L ? L.t : 0) * 1.08);
    const e = Math.pow(10, Math.floor(Math.log10(tmax0))), m = tmax0 / e, tmax = (m <= 2 ? 2 : m <= 5 ? 5 : 10) * e;
    const stepT = tmax / 5;
    linTicks(g, x0, x1, y0, y1, 0, tmax, stepT, 'x', function (v) { return sigf(v, 2); });
    linTicks(g, x0, x1, y0, y1, 0, 1, 0.25, 'y', function (v) { return num(v * 100, 0) + '%'; });
    // 右軸：Xn（對數）
    g.save(); g.font = fnt(11, '400');
    for (let k = 0; k <= 4; k++) {
      const yy = y1 - k / 4 * (y1 - y0);
      if (k <= 3) LD.haloText(g, String(Math.pow(10, k)), x1 + 2, yy + 4, modeColor('cond'), 'left', 'alphabetic', fnt(11, '400'));
    }
    g.restore();
    const X = function (p) { return x0 + p[0] / tmax * (x1 - x0); };
    g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
    polyline(g, hist, X, function (p) { return y1 - p[1] * (y1 - y0); }, col.neg, 2.4);
    polyline(g, hist, X, function (p) { return y1 - Math.min(4, Math.log10(Math.max(1, p[2]))) / 4 * (y1 - y0); }, modeColor('cond'), 2.2, [6, 3]);
    g.restore();
    LD.haloText(g, T('時間（模擬秒）', 'Time (model seconds)'), (x0 + x1) / 2, y1 + 18 + fsz(12) * 1.3, col.text, 'center', 'alphabetic', fnt(12));
    g.save(); g.translate(14, (y0 + y1) / 2); g.rotate(-Math.PI / 2);
    LD.haloText(g, sim.kind === 'add' ? T('單體轉化率', 'Monomer conversion') : T('反應程度 p', 'Extent of reaction p'), 0, 0, col.neg, 'center', 'middle', fnt(12));
    g.restore();
  }
  function updateGraphText() {
    const lg = $('gLegend'), hint = $('gHint');
    const cur = '<span><span class="ln" style="background:' + modeColor(sim.kind) + '"></span>' + T('這一次', 'This run') + '</span>';
    if (state.tab === 'xp') {
      lg.innerHTML = cur + (traces.length ? '<span><span class="ln" style="background:' + LD.alpha(col.muted, 0.6) + '"></span>' + T('之前的幾次', 'Earlier runs') + '</span>' : '') +
        '<span style="color:' + col.muted + '"><span class="ln dash"></span>' + (sim.kind === 'cond' ? T('卡羅瑟斯方程式', 'Carothers equation') : T('理論鏈長', 'Theoretical chain length')) + '</span>';
      hint.textContent = sim.kind === 'add' ? T('加成聚合：鏈一開始就很長，之後幾乎是一條水平線；轉化率增加只是鏈的數目變多。', 'Addition: the chains are long from the very start and the curve is almost flat; higher conversion just means more chains.')
        : T('縮合聚合：反應程度要非常接近 100%，聚合度才會急遽上升。', 'Condensation: Xn shoots up only when the extent of reaction is very close to 100%.');
    } else if (state.tab === 'mwd') {
      lg.innerHTML = '<span><span class="box" style="background:' + modeColor(sim.kind) + '"></span>' + T('樣品中的鏈', 'Chains in the sample') + '</span>' +
        (sim.kind === 'cond' ? '<span style="color:' + col.muted + '"><span class="ln dash"></span>' + T('Flory 最可能分布', 'Flory most probable distribution') + '</span>' : '');
      hint.textContent = sim.kind === 'add' ? T('只算聚合物（不含還沒反應的單體）。每一格的高度是那個長度範圍的鏈所占的重量分率。', 'Only the polymer is counted (not the unreacted monomer). Each bar is the weight fraction of chains in that range of lengths.')
        : T('所有分子都算（含單體）。直方圖越往右，表示大部分的質量在越長的鏈裡。', 'Every molecule is counted, monomers included. The further right the bars, the more of the mass is in long chains.');
    } else {
      lg.innerHTML = '<span><span class="ln" style="background:' + col.neg + '"></span>' + (sim.kind === 'add' ? T('單體轉化率（左軸）', 'Conversion (left)') : T('反應程度 p（左軸）', 'Extent p (left)')) + '</span>' +
        '<span style="color:' + modeColor('cond') + '"><span class="ln dash"></span>Xn' + T('（右軸，對數）', ' (right, log)') + '</span>';
      hint.textContent = T('時間是縮短過的「模擬秒」，只能互相比較。', 'Time is in shortened “model seconds”; compare runs with each other only.');
    }
  }

  // ======================= 讀數、反應式、表格 =======================
  function rd(dt, dd, cls) { return '<dt>' + dt + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + dd + '</dd>'; }
  function updateReadouts() {
    const s = fullStats(), el = $('readout');
    let h = rd(T('時間 t<small>（模擬秒）</small>', 'Time t<small>(model seconds)</small>'), sigf(s.t, 3) + ' s');
    if (sim.kind === 'add') {
      const d = PC.ADD_MON[sim.mon];
      h += rd(T('單體轉化率', 'Monomer conversion'), pct(s.conv, 1), 'big');
      h += rd(T('起始劑剩下', 'Initiator left'), pct(s.initLeft, 1));
      h += rd(T('正在長的鏈<small>（樣品中的自由基數）</small>', 'Growing chains<small>(radicals in the sample)</small>'), String(s.radicals));
      h += rd(T('數量平均聚合度 X<sub>n</sub>', 'Number-average X<sub>n</sub>'), s.Xn > 0 ? big(s.Xn, 3) : '—', 'big');
      h += rd(T('數量平均分子量 M<sub>n</sub>', 'M<sub>n</sub>'), s.Xn > 0 ? big(s.Mn, 3) + ' g/mol' : '—', 'big');
      h += rd(T('重量平均分子量 M<sub>w</sub>', 'M<sub>w</sub>'), s.Xn > 0 ? big(s.Mw, 3) + ' g/mol' : '—');
      h += rd(T('分散度 Đ = M<sub>w</sub>/M<sub>n</sub>', 'Dispersity Đ = M<sub>w</sub>/M<sub>n</sub>'), s.Xn > 0 ? num(s.PDI, 2) : '—');
      h += rd(T('聚合物<small>（每 1.00 mol 單體）</small>', 'Polymer<small>(per 1.00 mol of monomer)</small>'), num(s.mPoly, 2) + ' g');
      h += rd(T('未反應的單體', 'Monomer left'), num(s.mMon, 2) + ' g');
      if (d.gas) h += rd(T('反應釜的壓力<small>（與起始時相比）</small>', 'Pressure in the reactor<small>(compared with the start)</small>'), pct(1 - s.conv, 1));
      else h += rd(T('體積收縮', 'Volume shrinkage'), pct(s.shrink, 1));
    } else {
      h += rd(T('反應程度 p<small>（少的那種官能基）</small>', 'Extent of reaction p<small>(of the scarcer group)</small>'), pct(s.conv, 2), 'big');
      h += rd(T('單體還剩<small>（占原來的單體）</small>', 'Monomers left<small>(of the original monomers)</small>'), pct(s.monoLeft, 1));
      h += rd(T('數量平均聚合度 X<sub>n</sub>', 'Number-average X<sub>n</sub>'), big(s.Xn, 3), 'big');
      h += rd(T('卡羅瑟斯方程式<small>(1 + r)/(1 + r − 2rp)，r = ', 'Carothers equation<small>(1 + r)/(1 + r − 2rp), r = ') + num(s.r, 3) + '</small>', big(s.carothers, 3));
      h += rd(T('數量平均分子量 M<sub>n</sub>', 'M<sub>n</sub>'), big(s.Mn, 3) + ' g/mol', 'big');
      h += rd(T('重量平均分子量 M<sub>w</sub>', 'M<sub>w</sub>'), big(s.Mw, 3) + ' g/mol');
      h += rd(T('分散度 Đ = M<sub>w</sub>/M<sub>n</sub>', 'Dispersity Đ = M<sub>w</sub>/M<sub>n</sub>'), num(s.PDI, 2));
      h += rd(T('生成的水<small>（最多 ', 'Water formed<small>(at most ') + num(s.waterMax, 2) + ' g）</small>'.replace('）', T('）', ')')), num(s.water, 3) + ' g');
      h += rd(state.dry ? T('已抽走的水', 'Water removed') : T('瓶內的水', 'Water in the flask'), num(state.dry ? s.waterOut : s.waterIn, 3) + ' g');
      h += rd(T('瓶內的質量<small>（原料 ', 'Mass in the flask<small>(started with ') + num(s.mFeed, 2) + ' g' + T('）', ')') + '</small>', num(s.mFlask, 3) + ' g');
      if (!state.dry && s.peq != null) h += rd(T('密閉時的平衡 p<sub>eq</sub>', 'Closed equilibrium p<sub>eq</sub>'), pct(s.peq, 2));
    }
    el.innerHTML = h;
  }
  const RX = {
    ethylene: ['n CH2=CH2', '−[CH2−CH2]n−'], propylene: ['n CH2=CH−CH3', '−[CH2−CH(CH3)]n−'], vinylchloride: ['n CH2=CHCl', '−[CH2−CHCl]n−'],
    tfe: ['n CF2=CF2', '−[CF2−CF2]n−'], styrene: ['n CH2=CH−C6H5', '−[CH2−CH(C6H5)]n−'], mma: ['n CH2=C(CH3)COOCH3', '−[CH2−C(CH3)(COOCH3)]n−']
  };
  const USE = {
    ethylene: ['塑膠袋、保鮮膜、瓶子', 'carrier bags, cling film, bottles'], propylene: ['餐盒、瓶蓋、繩子', 'food boxes, bottle caps, ropes'],
    vinylchloride: ['水管、電線外皮、雨衣', 'water pipes, cable insulation, raincoats'], tfe: ['不沾鍋塗層、耐腐蝕管線', 'non-stick coatings, chemical-resistant pipes'],
    styrene: ['保麗龍、免洗餐具', 'expanded foam, disposable cutlery'], mma: ['壓克力板、鏡片、招牌', 'acrylic sheets, lenses, signs'],
    nylon66: ['纖維、絲襪、齒輪', 'fibres, stockings, gears'], pet: ['寶特瓶、衣物纖維', 'drink bottles, clothing fibres'], pla: ['可分解的餐具、3D 列印線材', 'compostable cutlery, 3D-printing filament']
  };
  // 化學式裡的數字變下標（但開頭的係數 n、2n 不變）
  function eqH(s) { return esc(s).replace(/([A-Za-z\)\]])(\d+)/g, '$1<sub>$2</sub>').replace(/\]n/g, ']<sub>n</sub>'); }
  function updateRx() {
    const el = $('rxBox');
    if (state.mode === 'add') {
      const d = PC.ADD_MON[state.mon], r = RX[state.mon];
      el.innerHTML = '<span class="eq">' + eqH(r[0]) + ' → ' + eqH(r[1]) + '</span>' +
        T(d.zh + ' ' + fH(d.f) + '（' + num(d.M, 2) + ' g/mol）→ ' + d.poly[0] + '（' + d.ab + '）。重複單位和單體的組成相同，沒有副產物。',
          cap(d.en) + ' ' + fH(d.f) + ' (' + num(d.M, 2) + ' g/mol) → ' + d.poly[1] + ' (' + d.ab + '). The repeating unit has the same formula as the monomer; nothing else is formed.') +
        '<br><span class="use">' + T('用途：' + USE[state.mon][0], 'Uses: ' + USE[state.mon][1]) + '</span>';
    } else {
      const d = PC.COND[state.pair];
      let eq;
      if (state.pair === 'nylon66') eq = 'n H2N(CH2)6NH2 + n HOOC(CH2)4COOH → −[NH(CH2)6NH−CO(CH2)4CO]n− + 2n H2O';
      else if (state.pair === 'pet') eq = 'n HOCH2CH2OH + n HOOC−C6H4−COOH → −[OCH2CH2O−CO−C6H4−CO]n− + 2n H2O';
      else eq = 'n CH3CH(OH)COOH → −[OCH(CH3)CO]n− + n H2O';
      const unitF = state.pair === 'nylon66' ? 'C12H22N2O2' : state.pair === 'pet' ? 'C10H8O4' : 'C3H4O2';
      el.innerHTML = '<span class="eq">' + eqH(eq) + '</span>' +
        (d.ab ? T('乳酸 ' + fH(d.A.f) + '（' + num(d.A.M, 2) + ' g/mol）一個分子上就有 –OH 與 –COOH，自己就能連成長鏈。',
          'Lactic acid ' + fH(d.A.f) + ' (' + num(d.A.M, 2) + ' g/mol) carries both –OH and –COOH, so it can join up on its own.')
          : T(d.A.zh + ' ' + fH(d.A.f) + '（' + num(d.A.M, 2) + '）＋ ' + d.B.zh + ' ' + fH(d.B.f) + '（' + num(d.B.M, 2) + ' g/mol）。',
            cap(d.A.en) + ' ' + fH(d.A.f) + ' (' + num(d.A.M, 2) + ') + ' + d.B.en + ' ' + fH(d.B.f) + ' (' + num(d.B.M, 2) + ' g/mol).')) +
        T('重複單位 ' + fH(unitF) + ' = ' + num(d.unit, 2) + ' g/mol；每形成一個' + d.link[0] + '放出 1 個 H<sub>2</sub>O（端基不計時寫成 2n）。',
          ' Repeating unit ' + fH(unitF) + ' = ' + num(d.unit, 2) + ' g/mol; every ' + d.link[1] + ' bond formed gives off one H<sub>2</sub>O' + (d.ab ? '.' : ' (written 2n when the chain ends are ignored).')) +
        '<br><span class="use">' + T('用途：' + USE[state.pair][0], 'Uses: ' + USE[state.pair][1]) + '</span>';
    }
  }
  function rowCond(r) {
    if (r.mode === 'add') return sigf(r.init * 100, 2) + '%' + T('，', ', ') + (r.term === 'comb' ? T('結合', 'comb.') : T('歧化', 'disp.'));
    return (r.ab ? T('AB 單體', 'AB monomer') : 'q = ' + num(r.q, 4)) + T('，', ', ') + (r.dry ? T('除水', 'water removed') : T('密閉', 'closed'));
  }
  function rowName(r) {
    if (r.mode === 'add') return PC.ADD_MON[r.mon].ab;
    return r.pair === 'nylon66' ? T('耐綸-66', 'Nylon-6,6') : r.pair === 'pet' ? 'PET' : 'PLA';
  }
  function buildTable() {
    const el = $('tbl');
    let h = '<thead><tr><th>#</th><th class="l">' + T('聚合物', 'Polymer') + '</th><th class="l">' + T('條件', 'Conditions') + '</th><th>t<br><small>s</small></th><th>' +
      T('轉化率', 'Conv.') + '<br><small>%</small></th><th>X<sub>n</sub></th><th>M<sub>n</sub><br><small>g/mol</small></th><th>Đ</th><th>' + T('水', 'Water') + '<br><small>g</small></th></tr></thead><tbody>';
    const mine = rows.filter(function (r) { return r.seg === segId; });
    if (!mine.length) h += '<tr class="empty"><td colspan="9">' + T('按「記錄數據」把目前的結果記下來，方便比較。', 'Press “Record” to keep the present results here for comparison.') + '</td></tr>';
    mine.forEach(function (r) {
      h += '<tr><td>' + r.n + '</td><td class="l">' + rowName(r) + '</td><td class="l">' + rowCond(r) + '</td><td>' + sigf(r.t, 3) + '</td><td>' + num(r.conv * 100, r.mode === 'cond' ? 2 : 1) +
        '</td><td>' + big(r.Xn, 3) + '</td><td>' + big(r.Mn, 3) + '</td><td>' + num(r.PDI, 2) + '</td><td>' + (r.mode === 'cond' ? num(r.waterOut, 2) : '—') + '</td></tr>';
    });
    el.innerHTML = h + '</tbody>';
  }
  function buildMonTable() {
    const el = $('monTable');
    if (!el) return;
    let h = '<thead><tr><th class="l">' + T('單體', 'Monomer') + '</th><th>' + T('莫耳質量', 'Molar mass') + '<br><small>g/mol</small></th><th class="l">' + T('聚合物（重複單位）', 'Polymer (repeating unit)') + '</th><th class="l">' + T('用途', 'Uses') + '</th></tr></thead><tbody>';
    Object.keys(PC.ADD_MON).forEach(function (k) {
      const d = PC.ADD_MON[k];
      h += '<tr><td class="l">' + T(d.zh, cap(d.en)) + ' ' + fH(d.f) + '</td><td>' + num(d.M, 2) + '</td><td class="l">' + T(d.poly[0], cap(d.poly[1])) + T('（', ' (') + d.ab + T('）', ')') + '</td><td class="l">' + T(USE[k][0], USE[k][1]) + '</td></tr>';
    });
    Object.keys(PC.COND).forEach(function (k) {
      const d = PC.COND[k];
      const mons = d.ab ? T(d.A.zh, cap(d.A.en)) + ' ' + fH(d.A.f) : T(d.A.zh, cap(d.A.en)) + ' ' + fH(d.A.f) + ' + ' + T(d.B.zh, cap(d.B.en)) + ' ' + fH(d.B.f);
      const ms = d.ab ? num(d.A.M, 2) : num(d.A.M, 2) + ' + ' + num(d.B.M, 2);
      h += '<tr><td class="l">' + mons + '</td><td>' + ms + '</td><td class="l">' + T(d.zh, cap(d.en)) + T('（', ' (') + num(d.unit, 2) + ' g/mol' + T('，放出水）', ', water given off)') + '</td><td class="l">' + T(USE[k][0], USE[k][1]) + '</td></tr>';
    });
    el.innerHTML = h + '</tbody>';
  }
  function updateLegend() {
    const uc = unitColors(), el = $('legend');
    const sp = function (c, t) { return '<span><span class="sp" style="background:' + c + '"></span>' + t + '</span>'; };
    if (state.mode === 'add') {
      el.innerHTML = sp(uc.m, T('單體（有 C=C 雙鍵）', 'Monomer (with a C=C bond)')) + sp(uc.p, T('聚合物鏈', 'Polymer chain')) + sp(col.rad, T('自由基末端（正在長）', 'Radical end (growing)'));
    } else {
      const d = PC.COND[state.pair];
      el.innerHTML = (d.ab ? sp(uc.X, T('乳酸單元', 'Lactic acid unit')) : sp(uc.A, T(d.A.zh, cap(d.A.en))) + sp(uc.B, T(d.B.zh, cap(d.B.en)))) +
        sp(uc.nA, T(d.A.g[0], d.A.g[1] + ' group')) + sp(uc.nB, T('羧基', 'carboxyl group')) + sp(col.O, T('水分子', 'water'));
    }
    $('stageHint').textContent = state.mode === 'add'
      ? T('右邊的放大圖只畫一小撮分子，鏈長大約縮小成真實的 1/12；所有數字由幾百萬個單體的模擬算出。', 'The magnified view shows only a handful of molecules, with chains about 1/12 of their real length; every number comes from a simulation of millions of monomers.')
      : T('右邊的放大圖只畫一小撮分子；所有數字由 6 萬個單體的模擬算出。除水時，生成的水被抽到收集管裡。', 'The magnified view shows only a handful of molecules; every number comes from a simulation of 60 000 monomers. With water removal on, the water formed is pumped into the receiver.');
  }
  function setStatus(s) { $('status').textContent = s || ''; }
  function updatePlay() {
    const ended = sim && PC.ended(sim);
    $('play').textContent = ended ? T('再做一次', 'Again') : state.running ? T('暫停', 'Pause') : (lite && lite.t > 0 ? T('繼續', 'Resume') : T('開始反應', 'Start'));
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function syncControls() {
    document.querySelectorAll('#modeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)); });
    document.querySelectorAll('#monSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mon === state.mon)); });
    document.querySelectorAll('#termSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.term === state.term)); });
    document.querySelectorAll('#pairSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.pair === state.pair)); });
    $('addCtl').hidden = state.mode !== 'add';
    $('condCtl').hidden = state.mode !== 'cond';
    const d = PC.COND[state.pair];
    elRatio.disabled = !!d.ab;
    // 停用時滑桿也要停在實際值 1；換回兩種單體時還原原本的莫耳比
    if (!!d.ab !== ratioAb) { ratioAb = !!d.ab; setSlider(elRatio, d.ab ? 1 : state.q, qToPos); }
    $('ratioLabel').textContent = d.ab ? T('莫耳比（AB 單體，固定 1:1）', 'Mole ratio (AB monomer, always 1 : 1)')
      : state.pair === 'nylon66' ? T('莫耳比 n(己二酸) : n(己二胺)', 'Mole ratio n(diacid) : n(diamine)') : T('莫耳比 n(對苯二甲酸) : n(乙二醇)', 'Mole ratio n(diacid) : n(diol)');
    $('inito').textContent = sigf(state.init * 100, 3) + '%';
    $('ratioo').textContent = d.ab ? '1.0000' : num(state.q, 4);
    elDry.checked = state.dry;
  }
  function refreshAll() {
    syncControls();
    updateRx();
    updateLegend();
    updateReadouts();
    buildTable();
    updateGraphText();
    drawAll();
  }
  function drawAll() { drawStage(0); drawGraph(); if (view3 && view3.active) view3.frame(); }

  // ======================= 主迴圈（只有一條） =======================
  let raf = 0, lastT = 0, slowAcc = 0, uiAcc = 0, graphAcc = 0;
  function loop(now) {
    raf = 0;
    const dt = lastT ? Math.min(1 / 20, (now - lastT) / 1000) : 1 / 60;
    lastT = now;
    if (document.hidden) { lastT = 0; return; }
    const running = state.running && sim && !PC.ended(sim);
    if (running) advance(dt);
    // 放大圖：反應時跟著核心連鍵；平常只是慢慢晃（減少動態時不晃）
    Vis.sync(lite);
    if (!reducedMotion) Vis.step(dt, running ? 1 : 0.6);
    else Vis.step(dt, 0);
    // 暫停時降低重畫頻率
    slowAcc += dt;
    if (running || slowAcc > 1 / 24) {
      slowAcc = 0;
      if (state.view === '2d') drawStage(dt); else if (view3 && view3.active) view3.frame();
    }
    uiAcc += dt; graphAcc += dt;
    if (running) {
      tickAcc += dt;
      if (tickAcc >= 0.5) { tickAcc = 0; emitTick(); }
      if (uiAcc > 0.2) { uiAcc = 0; fullStats(true); updateReadouts(); }
      if (graphAcc > 0.25) { graphAcc = 0; drawGraph(); }
    } else if (uiAcc > 0.5 && run && run.ended && !run.uiDone) { run.uiDone = true; updateReadouts(); drawGraph(); }
    if (running || !reducedMotion || Vis.flashes.length) schedule();
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(loop); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastT = 0; schedule(); } });

  // ======================= 操作 =======================
  function acted() { userActed = true; }
  function start() {
    if (PC.ended(sim)) newRun();
    state.running = true;
    run.started = true;
    if (sim.kind === 'cond' && state.dry) run.everDry = true;
    Snd.start();
    setStatus('');
    updatePlay();
    lastT = 0;
    schedule();
  }
  function pause(byUser) {
    state.running = false;
    updatePlay();
    fullStats(true);
    updateReadouts(); drawGraph();
    if (byUser) emit('hold', evData());
    schedule();
  }
  $('play').addEventListener('click', function () {
    acted();
    if (state.running) pause(true); else start();
  });
  $('restart').addEventListener('click', function () { acted(); newRun(); setStatus(T('同樣的設定，重新開始。', 'Same settings, starting again.')); });
  $('record').addEventListener('click', function () {
    acted();
    const d = evData();
    d.n = rows.filter(function (r) { return r.seg === segId; }).length + 1;
    rows.push(d);
    buildTable();
    Snd.click();
    emit('record', Object.assign({}, d, { rows: rows.filter(function (r) { return r.seg === segId; }) }));
    setStatus(T('已記錄第 ' + d.n + ' 列。', 'Row ' + d.n + ' recorded.'));
  });
  $('clearAll').addEventListener('click', function () {
    acted();
    segId++;
    traces = [];
    buildTable();
    drawGraph(); updateGraphText();
    setStatus(T('已清除紀錄表與舊曲線；目前的反應不變。', 'The table and the old curves have been cleared; the present run is unchanged.'));
  });
  function changed(kind) { acted(); newRun(); if (kind) setStatus(kind); }
  document.querySelectorAll('#modeSeg button').forEach(function (b) {
    b.addEventListener('click', function () { if (b.dataset.mode === state.mode) { acted(); return; } state.mode = b.dataset.mode; changed(); });
  });
  document.querySelectorAll('#monSeg button').forEach(function (b) {
    b.addEventListener('click', function () { if (b.dataset.mon === state.mon) { acted(); return; } state.mon = b.dataset.mon; changed(); });
  });
  document.querySelectorAll('#termSeg button').forEach(function (b) {
    b.addEventListener('click', function () { if (b.dataset.term === state.term) { acted(); return; } state.term = b.dataset.term; changed(); });
  });
  document.querySelectorAll('#pairSeg button').forEach(function (b) {
    b.addEventListener('click', function () { if (b.dataset.pair === state.pair) { acted(); return; } state.pair = b.dataset.pair; changed(); });
  });
  elInit.addEventListener('input', function () {
    const v = Math.max(PC.I_MIN, Math.min(PC.I_MAX, readInit()));
    $('inito').textContent = sigf(v * 100, 3) + '%';
    if (Math.abs(v - state.init) < 1e-12) return;
    state.init = v; changed();
  });
  elRatio.addEventListener('input', function () {
    if (PC.COND[state.pair].ab) return;
    const v = Math.round(Math.max(PC.Q_MIN, Math.min(PC.Q_MAX, readQ())) * 1e4) / 1e4;
    $('ratioo').textContent = num(v, 4);
    if (Math.abs(v - state.q) < 1e-12) return;
    state.q = v; changed();
  });
  elDry.addEventListener('change', function () {
    acted();
    state.dry = elDry.checked;
    if (sim.kind === 'cond') {
      sim.dry = state.dry;
      if (state.dry && (state.running || lite.t > 0)) run.everDry = true;
      if (!state.dry && lite.t === 0) run.everDry = false;
      setStatus(state.dry ? T('開始除水：生成的水被抽走，平衡往右移。', 'Removing the water: it is pumped off and the equilibrium shifts to the right.')
        : T('停止除水：水留在瓶內，會把鍵水解回去。', 'Water removal off: the water stays in the flask and can hydrolyse the bonds.'));
      Vis.sync(lite);
    }
    updateReadouts(); updateGraphText(); drawAll();
  });
  [0, 1, 2, 3].forEach(function (k) {
    $('sp' + k).addEventListener('click', function () {
      acted();
      state.speed = k;
      [0, 1, 2, 3].forEach(function (j) { $('sp' + j).setAttribute('aria-pressed', String(j === k)); });
    });
  });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      state.tab = b.dataset.tab;
      document.querySelectorAll('#tabs button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      updateGraphText(); drawGraph();
    });
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
    if (ev.detail && ev.detail.name === 'fs') resize();
  });

  // ======================= 3D 檢視 =======================
  let threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function host3Api() {
    return {
      T: T, host: host3, vis: Vis,
      kind: function () { return Vis.kind; },
      colors: function () { return { c: col, u: unitColors() }; },
      live: function () {
        const o = {};
        if (Vis.kind === 'add') Vis.chains.forEach(function (ch) { if (ch.live) o[ch.beads[ch.beads.length - 1]] = 1; });
        return o;
      },
      hud: function () {
        const L = lite || { t: 0, conv: 0, Xn: 0 };
        return {
          tl: (host3.clientWidth < 560 ? 't = ' : T('放大示意（未依比例）・t = ', 'Magnified sketch (not to scale) · t = ')) + sigf(L.t, 3) + ' s' + (state.running ? '' : T('（暫停）', ' (paused)')),
          tr: (sim.kind === 'add' ? T('轉化率 ', 'Conversion ') : 'p = ') + pct(L.conv, 1) + ' · Xn = ' + (L.Xn > 0 ? big(L.Xn, 3) : '—')
        };
      },
      running: function () { return state.running; },
      contextLost: function () { setView('2d'); viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.'); }
    };
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable() || !window.Poly3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        state.view = '3d';
        view3 = window.Poly3D.create(lib, host3Api());
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        view3.frame();
        schedule();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      state.view = '2d';
      if (view3) { view3.dispose(); view3 = null; }
      stage.classList.remove('is3d');
      $('resetCam').hidden = true;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    state.view = '2d';
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { acted(); setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  function themeChanged() {
    if (LD.refresh) LD.refresh();
    readColors();
    refreshAll();
    buildMonTable();
    if (view3 && view3.active) view3.onTheme();
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lg = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', resize);

  // 測試用（Playwright）：讀取目前狀態
  window.__pm = {
    state: state, sim: function () { return sim; }, lite: function () { return lite; }, stats: function () { return fullStats(true); },
    rows: function () { return rows; }, run: function () { return run; }, vis: Vis, ev: evData,
    /** 測試用：直接把模擬推進 dt 模擬秒（不經畫面） */
    advance: function (dt) { const t0 = sim.t; while (sim.t < t0 + dt - 1e-9 && !PC.ended(sim)) PC.step(sim, t0 + dt - sim.t, 1e6); lite = liteStats(); sample(false); afterAdvance(t0); fullStats(true); updateReadouts(); drawAll(); }
  };

  // ======================= 啟動 =======================
  readColors();
  setSlider(elInit, state.init * 100, initToPos);
  setSlider(elRatio, 1, qToPos);
  buildMonTable();
  updateSoundButton();
  newRun(false);
  resize();
  schedule();
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：分子不會晃動，按「開始反應」照樣可以做實驗。', 'Reduced motion is on: the molecules stay still, but “Start” works as usual.'));
})();
