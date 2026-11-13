/*
 * chemical-equilibrium.js — 「化學平衡與勒沙特列原理」的頁面程式（注射筒畫面、操作、圖表、預測、任務事件）
 * 化學核心在 js/chemical-equilibrium-core.js（EqCore，體積單位是公升）；3D 檢視在 js/chemical-equilibrium-3d.js（Eq3D）。
 * 畫面上的分子只是示意：數目依物質的量的比例畫出，運動是隨機的；物質的量、分壓、Q、K 都直接來自核心的計算。
 *
 * 任務事件（只在使用者操作過之後送出）：
 *   'settle'：每次達到平衡並記入紀錄表時 { rx, mys, T, V（mL）, P（bar）, mode, cat, n（mol）, p（bar）, x, c（mol/L）, Ar,
 *             K, changes（從上一次平衡以來的改變）, origin（'R' 從反應物開始／'P' 從生成物開始）, stop（活塞頂到盡頭）,
 *             prev（同一段實驗的上一列）, earlier（同一段實驗較早的各列） }
 *   'predict'：預測模式每答一題 { ok, streak（連續答對）, kinds（連續答對中不同擾動的種類數）, zero（其中有「不移動」）, truth, choice, kind }
 *   'answer'：未知反應按「核對答案」{ ans, err（相對誤差）, nT（量過的溫度數）, span（溫差 K）, tries, revealed }
 */
(function () {
  'use strict';
  const E = window.EqCore, LD = window.LabDraw;
  if (!E || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reducedMotion = LD.reducedMotion();

  // ======================= 數字格式 =======================
  function num(x, d) {
    if (x == null || !isFinite(x)) return '—';
    const s = (+x).toFixed(d == null ? 0 : d);
    return s.charAt(0) === '-' ? (/^-0(\.0*)?$/.test(s) ? s.slice(1) : '−' + s.slice(1)) : s;
  }
  function sciParts(x, sig) {
    if (x == null || !isFinite(x) || x === 0) return { m: x === 0 ? '0' : '—', e: null };
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= -2 && e < 4) return { m: num(x, Math.max(0, (sig || 3) - 1 - e)), e: null };
    const m = x / Math.pow(10, e);
    if (Math.abs(+m.toFixed((sig || 3) - 1)) >= 10) return sciParts(Math.sign(x) * Math.pow(10, e + 1), sig); // 尾數四捨五入成 10.0（例如 9999.6）：就是下一個次方。以前用 x × (1 + 1e-12) 重算，次方不變，會無限遞迴（11/13 總檢查抓到）
    return { m: num(m, (sig || 3) - 1), e: e };
  }
  function sciHTML(x, sig) {
    const p = sciParts(x, sig);
    return p.e == null ? p.m : p.m + ' × 10<sup>' + num(p.e, 0) + '</sup>';
  }
  /** 有效數字 sig 位的一般寫法（不用科學記號） */
  function sigf(x, sig) {
    if (x == null || !isFinite(x)) return '—';
    if (x === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(x)));
    return num(x, Math.max(0, Math.min(6, (sig || 3) - 1 - e)));
  }

  // ======================= 物種 =======================
  /** 化學式 → HTML（數字用 <sub>） */
  function fH(sp) { return sp.replace(/(\d+)/g, '<sub>$1</sub>'); }
  /** 化學式 → 畫布用的 parts（數字下標） */
  function fP(sp) {
    const out = [];
    sp.replace(/([A-Za-z]+)(\d*)/g, function (m, a, d) { out.push([a, 0]); if (d) out.push([d, -1]); return m; });
    return out;
  }
  const NAME = {
    N2O4: ['四氧化二氮', 'dinitrogen tetroxide'], NO2: ['二氧化氮', 'nitrogen dioxide'], N2: ['氮氣', 'nitrogen'], H2: ['氫氣', 'hydrogen'],
    NH3: ['氨', 'ammonia'], HI: ['碘化氫', 'hydrogen iodide'], I2: ['碘蒸氣', 'iodine vapour'], A2: ['A2', 'A2'], A: ['A', 'A'], Ar: ['氬氣', 'argon']
  };
  function nm(sp) { return T(NAME[sp][0], NAME[sp][1]); }
  // 分子由原子小球組成：[原子, x, y]（以原子半徑單位 r0 計）
  const MOL = {
    NO2: [['N', 0, -0.2], ['O', -1.15, 0.5], ['O', 1.15, 0.5]],
    N2O4: [['N', -0.78, 0], ['N', 0.78, 0], ['O', -1.5, -0.95], ['O', -1.5, 0.95], ['O', 1.5, -0.95], ['O', 1.5, 0.95]],
    N2: [['N', -0.6, 0], ['N', 0.6, 0]],
    H2: [['H', -0.4, 0], ['H', 0.4, 0]],
    NH3: [['N', 0, 0.12], ['H', 0, -1.05], ['H', -0.95, 0.62], ['H', 0.95, 0.62]],
    HI: [['I', 0.36, 0], ['H', -1.22, 0]],
    I2: [['I', -1.02, 0], ['I', 1.02, 0]],
    A2: [['A', -0.7, 0], ['A', 0.7, 0]],
    A: [['A', 0, 0]],
    Ar: [['Ar', 0, 0]]
  };
  const ATOM_R = { N: 1, O: 0.9, H: 0.58, I: 1.36, A: 1.05, Ar: 1.12 };
  // 每個畫出來的分子代表的物質的量（mol）
  const UNIT = { n2o4: 4e-5, haber: 2.5e-3, hi: 2.5e-5, mys: 4e-5 };
  // 有顏色的氣體：比爾定律的吸收強度（ε × 光程，L/mol，示意值）
  const TINT = { NO2: ['#9c4a1a', 20], I2: ['#7a2ca8', 60], A: ['#0f8f78', 20] };
  const CAP = 250;

  let col = {};
  function readColors() {
    const c = LD.c, dk = LD.dark;
    const lift = function (h, u) { return dk ? LD.mix(h, '#ffffff', u == null ? 0.25 : u) : h; };
    col = {
      text: c.text, muted: c.muted, border: c.border, grid: c.grid, accent: c.accent, bg: c['canvas-bg'], surface: c.surface,
      pos: c.pos || '#d1453b', neg: c.neg || '#2f6fd0', probe: c.probe || '#0d7f57', dark: dk,
      atom: { N: '#3f6fd6', O: '#e0483a', H: dk ? '#e8ecf0' : '#d3d9e0', I: '#8a3fc0', A: '#13a085', Ar: dk ? '#a9b3be' : '#8d98a5' },
      sp: {
        N2O4: lift('#5d7ea3'), NO2: lift('#b4531f'), N2: lift('#3f6fd6'), H2: lift('#7d8996', 0.35), NH3: lift('#0d8f6a'),
        HI: lift('#d07a12'), I2: lift('#8a3fc0', 0.3), A2: lift('#5d7ea3'), A: lift('#13a085'), Ar: lift('#9aa5b1', 0.1)
      }
    };
  }
  /** 溫度的顏色（水浴）：250 K 偏藍、400 K 中性、900 K 偏紅 */
  function tempColor(Tk) {
    if (Tk <= 400) return LD.mix('#3f7fd6', col.muted, Math.max(0, Math.min(1, (Tk - 250) / 150)));
    return LD.mix(col.muted, '#d8452f', Math.max(0, Math.min(1, (Tk - 400) / 450)));
  }

  // ======================= 狀態 =======================
  const SPEEDS = [1, 10, 100];
  const state = { rx: 'n2o4', mode: 'V', T: 298, V: 50, P: 1, cat: false, running: !reducedMotion, speed: 0, tab: 'time', view: '2d', predMode: false };
  let n = {};                 // 物質的量（mol），含 Ar
  let simT = 0;               // 模擬時間（s）
  let hist = [], events = []; // 圖表的取樣、事件標記
  let rows = [], rowSeq = 0, segId = 0;
  let origin = 'R', pending = true, settledFor = 0, changes = [];
  let waiting = null;         // 預測中 { truth, kinds, lq0 }
  let streak = 0, streakKinds = {}, streakZero = false, predTotal = 0, predOk = 0;
  let mys = null, mysSeq = 0;
  let userActed = false;
  let view3 = null;

  function rxd(rx) {
    const r = E.RX[rx || state.rx];
    return { sp: r.sp, nu: r.nu, Tmin: r.Tmin, Tmax: r.Tmax, T: r.T, n0: r.n0, V: r.V || 50, Vr: r.Vr || [10, 100], step: r.step || 5e-4, Pr: r.Pr || [0.2, 6] };
  }
  function opts() {
    if (state.mode === 'V') return { T: state.T, V: state.V / 1000 };
    const o = { T: state.T, P: state.P }, L = rxd().Vr;
    const V = E.props(state.rx, n, o).V * 1000;
    if (V > L[1]) return { T: state.T, V: L[1] / 1000, stop: 1 };
    if (V < L[0]) return { T: state.T, V: L[0] / 1000, stop: -1 };
    return o;
  }
  function reactiveTotal(m) { let s = 0; rxd().sp.forEach(function (k) { s += (m || n)[k] || 0; }); return s; }
  function canReact() { const g = E.xiRange(state.rx, n); return g.hi - g.lo > 1e-12; }
  function lqk(o) { return canReact() ? E.lnQK(state.rx, n, o || opts()) : NaN; }
  function isMys() { return state.rx === 'mys'; }

  // ======================= 分子（示意） =======================
  let parts = [];            // { sp, u, v, w, vu, vv, vw, a, va, born }
  const pool = [];           // 剛反應掉的分子位置 { u, v, w, t }
  const flashes = [];        // { u, v, w, t0, kind }
  const FL_DUR = 600, FL_MAX = 60;
  let unit = UNIT.n2o4, lastSync = 0, lastFlashSnd = 0;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function randomDisk() {
    let v, w;
    do { v = rnd(-1, 1); w = rnd(-1, 1); } while (v * v + w * w > 1);
    return [v * 0.9, w * 0.9];
  }
  function newPart(sp, at, fromNozzle) {
    const d = randomDisk();
    const p = { sp: sp, u: at ? at.u : fromNozzle ? rnd(0.01, 0.06) : rnd(0.03, 0.97), v: at ? at.v : d[0], w: at ? at.w : d[1],
      vu: fromNozzle ? rnd(0.3, 0.6) : rnd(-0.2, 0.2), vv: rnd(-0.4, 0.4), vw: rnd(-0.4, 0.4), a: rnd(0, Math.PI * 2), va: rnd(-1.5, 1.5), tilt: rnd(0, Math.PI), born: performance.now() };
    if (at) { p.u += rnd(-0.01, 0.01); p.v += rnd(-0.05, 0.05); }
    return p;
  }
  function listSpecies() { const l = rxd().sp.slice(); if ((n.Ar || 0) > 0) l.push('Ar'); return l; }
  function targetCounts() {
    const l = listSpecies();
    let tot = 0;
    l.forEach(function (s) { tot += n[s] || 0; });
    unit = Math.max(UNIT[state.rx], tot / CAP);
    const out = {};
    l.forEach(function (s) { out[s] = Math.round((n[s] || 0) / unit); });
    return out;
  }
  /** 讓畫面上的分子數跟上物質的量：fromNozzle 表示使用者剛加入（從針頭進來） */
  function syncParts(fresh, addSp) {
    const now = performance.now();
    if (fresh) parts = [];
    const tc = targetCounts(), have = {};
    parts.forEach(function (p) { have[p.sp] = (have[p.sp] || 0) + 1; });
    // 先移除
    Object.keys(have).forEach(function (s) {
      let extra = have[s] - (tc[s] || 0);
      while (extra-- > 0) {
        let idx = -1;
        for (let k = parts.length - 1; k >= 0; k--) if (parts[k].sp === s) { idx = k; if (Math.random() < 0.6) break; }
        if (idx < 0) break;
        const p = parts[idx];
        parts.splice(idx, 1);
        if (!fresh && s !== addSp && s !== 'Ar') pool.push({ u: p.u, v: p.v, w: p.w, t: now });
      }
    });
    while (pool.length && now - pool[0].t > 400) pool.shift();
    // 再補上
    Object.keys(tc).forEach(function (s) {
      let need = tc[s] - (have[s] || 0);
      while (need-- > 0) {
        const at = !fresh && s !== addSp && s !== 'Ar' && pool.length ? pool.pop() : null;
        parts.push(newPart(s, at, !fresh && s === addSp));
        if (at) {
          flashes.push({ u: at.u, v: at.v, w: at.w, t0: now, kind: rxd().nu[rxd().sp.indexOf(s)] > 0 ? 1 : 0 });
          if (flashes.length > FL_MAX) flashes.shift();
          if (state.running && now - lastFlashSnd > 110 && window.LabSound && window.LabSound.enabled()) {
            lastFlashSnd = now;
            window.LabSound.tone({ freq: rxd().nu[rxd().sp.indexOf(s)] > 0 ? 698 : 523, dur: 0.05, type: 'sine', gain: 0.05 });
          }
        }
      }
    });
  }
  function moveParts(dtw) {
    const sp = Math.sqrt(state.T / 300);
    const Lg = Math.max(0.08, gasFrac());
    parts.forEach(function (p) {
      p.vu += rnd(-1, 1) * 2.4 * dtw; p.vv += rnd(-1, 1) * 2.4 * dtw; p.vw += rnd(-1, 1) * 2.4 * dtw;
      const s = Math.hypot(p.vu * 3, p.vv, p.vw), cap = 0.9 * sp;
      if (s > cap) { p.vu *= cap / s; p.vv *= cap / s; p.vw *= cap / s; }
      p.u += p.vu * dtw * 0.35 / Lg; p.v += p.vv * dtw; p.w += p.vw * dtw;
      if (p.u < 0.02) { p.u = 0.02; p.vu = Math.abs(p.vu); }
      if (p.u > 0.98) { p.u = 0.98; p.vu = -Math.abs(p.vu); }
      const r = Math.hypot(p.v, p.w);
      if (r > 0.9) { p.v *= 0.9 / r; p.w *= 0.9 / r; const dot = p.vv * p.v + p.vw * p.w; if (dot > 0) { p.vv -= 2 * dot * p.v / 0.81; p.vw -= 2 * dot * p.w / 0.81; } }
      p.a += p.va * dtw;
    });
  }

  // ======================= 主迴圈 =======================
  let raf = 0, lastTs = 0, lastSample = 0, lastRead = 0;
  function startLoop() { if (!raf) { lastTs = 0; raf = requestAnimationFrame(loop); } }
  function loop(ts) {
    raf = 0;
    if (!state.running) return;
    const dtw = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (dtw > 0) advance(dtw);
    drawAll();
    if (view3 && view3.active) view3.frame();
    raf = requestAnimationFrame(loop);
  }
  function advance(dtw) {
    const now = performance.now();
    if (!waiting) {
      const dt = dtw * SPEEDS[state.speed];
      const o = opts();
      if (canReact()) n = E.relax(state.rx, n, o, dt, state.cat);
      simT += dt;
      const g = lqk();
      if (isFinite(g) && Math.abs(g) < 1e-3) settledFor += dtw; else settledFor = 0;
      if (pending && settledFor >= 0.3) settle();
    }
    moveParts(dtw);
    if (now - lastSync > 60) { lastSync = now; syncParts(false); }
    if (now - lastSample > 100) { lastSample = now; pushSample(); }
    if (now - lastRead > 250) { lastRead = now; updateReadouts(); }
  }
  function pushSample() {
    const o = opts(), pr = E.props(state.rx, n, o), p = {};
    listSpecies().concat(['Ar']).forEach(function (s) { p[s] = pr.p[s] || 0; });
    const q = canReact() ? E.Q(state.rx, n, o) : NaN;
    const s = { t: simT, p: p, lq: q > 0 && isFinite(q) ? Math.log10(q) : null, lk: Math.log10(E.K(state.rx, state.T)), w: !!waiting };
    hist.push(s);
    if (hist.length > 700) hist.splice(0, hist.length - 700);
    while (events.length && hist.length && events[0].t < hist[0].t) events.shift();
  }
  const EV = {
    'T+': ['加熱', 'heat'], 'T-': ['冷卻', 'cool'], 'V-': ['壓縮', 'compress'], 'V+': ['膨脹', 'expand'],
    'ArV': ['氬', 'Ar'], 'ArP': ['氬', 'Ar'], cat: ['催化劑', 'catalyst'], start: ['開始', 'start']
  };
  function addEvent(kind, sp, sign) {
    const last = events[events.length - 1];
    const label = kind === 'add-R' || kind === 'add-P' || kind === 'rem-R' || kind === 'rem-P' ?
      [[(sign > 0 ? '+' : '−'), 0]].concat(fP(sp)) : [[T(EV[kind][0], EV[kind][1]), 0]];
    if (last && last.kind === kind && last.sp === sp && simT - last.t < 0.5 * SPEEDS[state.speed] && performance.now() - last.wall < 600) {
      last.wall = performance.now(); return;
    }
    events.push({ t: simT, kind: kind, sp: sp, label: label, wall: performance.now() });
    if (events.length > 40) events.shift();
  }

  // ======================= 擾動、平衡、預測 =======================
  function acted() { userActed = true; }
  function changed(kind, sp, sign) {
    acted();
    const atEq = !pending;
    pushSample();
    addEvent(kind, sp, sign);
    changes.push(kind);
    pending = true; settledFor = 0;
    if (waiting) { waiting.kinds[kind] = 1; waiting.truth = E.direction(state.rx, n, opts(), 1e-4); }
    else if (state.predMode && atEq && canReact()) startPredict(kind);
    pushSample();
    if (!waiting) setStatus('');
    soundFor(kind, sign);
    refreshAll();
  }
  function settle() {
    const o = opts();
    n = E.equilibrium(state.rx, n, o).n;
    const pr = E.props(state.rx, n, o);
    const cp = function (m) { const r = {}; Object.keys(m).forEach(function (k) { r[k] = m[k]; }); return r; };
    const row = {
      id: ++rowSeq, seg: segId, rx: state.rx, mys: mys ? mys.id : 0, T: state.T, V: pr.V * 1000, P: pr.P, mode: state.mode, cat: state.cat,
      n: cp(n), p: cp(pr.p), x: cp(pr.x), c: cp(pr.c), Ar: n.Ar || 0, K: E.K(state.rx, state.T), changes: changes.slice(), origin: origin, stop: !!o.stop, t: simT
    };
    const earlier = rows.filter(function (r) { return r.seg === segId; }).slice(-30);
    rows.push(row);
    if (rows.length > 300) rows.shift();
    changes = []; pending = false;
    setStatus(T('已達平衡：Q = K，各成分不再改變（正、逆反應仍在進行）。這一列已記入平衡紀錄。', 'Equilibrium: Q = K and the composition no longer changes (the forward and reverse reactions still go on). This state has been added to the table.'));
    if (window.LabSound && window.LabSound.enabled()) {
      window.LabSound.tone({ freq: 880, dur: 0.12, gain: 0.12 });
      window.LabSound.tone({ freq: 1320, dur: 0.16, gain: 0.1, delay: 0.09 });
    }
    renderTable();
    updateReadouts();
    if (userActed && window.LabMission) window.LabMission.emit('settle', Object.assign({}, row, { prev: earlier[earlier.length - 1] || null, earlier: earlier }));
  }
  function startPredict(kind) {
    const k = {}; k[kind] = 1;
    waiting = { truth: E.direction(state.rx, n, opts(), 1e-4), kinds: k };
    $('predBox').hidden = false;
    setStatus(T('預測模式：注射筒先停住。平衡會往哪邊移動？', 'Prediction mode: the syringe is on hold. Which way will the equilibrium shift?'));
    updateReadouts();
  }
  function cancelPredict() {
    if (!waiting) return;
    waiting = null;
    $('predBox').hidden = true;
  }
  function answerPredict(choice) {
    if (!waiting) return;
    acted();
    const w = waiting, ks = Object.keys(w.kinds), kind = ks.length === 1 ? ks[0] : 'mix';
    const ok = choice === w.truth;
    predTotal++;
    if (ok) { predOk++; streak++; streakKinds[kind] = 1; if (w.truth === 0) streakZero = true; }
    else { streak = 0; streakKinds = {}; streakZero = false; }
    const g = lqk(), ratio = Math.exp(g);
    const why = w.truth > 0 ? T('Q < K（Q/K = ' + sigf(ratio, 2) + '）：反應向右進行，往生成物移動。', 'Q < K (Q/K = ' + sigf(ratio, 2) + '): the reaction goes to the right, towards the products.') :
      w.truth < 0 ? T('Q > K（Q/K = ' + sigf(ratio, 2) + '）：反應向左進行，往反應物移動。', 'Q > K (Q/K = ' + sigf(ratio, 2) + '): the reaction goes to the left, towards the reactants.') :
        T('Q 仍然等於 K：平衡不移動。', 'Q is still equal to K: no shift.');
    const extra = {
      'T+': T('溫度改變的是 K，不是 Q。', 'A temperature change alters K, not Q.'),
      'T-': T('溫度改變的是 K，不是 Q。', 'A temperature change alters K, not Q.'),
      cat: T('催化劑讓正、逆反應加快一樣多。', 'A catalyst speeds up both directions equally.'),
      ArV: T('定容加入惰性氣體，各反應氣體的分壓都不變。', 'Adding an inert gas at constant volume leaves every partial pressure unchanged.'),
      ArP: T('定壓加入惰性氣體，體積變大，等於把反應氣體稀釋。', 'Adding an inert gas at constant pressure enlarges the volume and dilutes the reacting gases.')
    }[kind] || '';
    $('predOut').innerHTML = (ok ? '<span class="ok">' + T('答對了！', 'Correct!') + '</span> ' : '<span class="no">' + T('不對。', 'Not quite.') + '</span> ') +
      why + (extra ? ' ' + extra : '') + '<br>' + T('連續答對 ', 'Correct in a row: ') + streak + T(' 題（' + Object.keys(streakKinds).length + ' 種改變）；總共答對 ', ' (' + Object.keys(streakKinds).length + ' kinds of change); total ') + predOk + ' / ' + predTotal + T('。', '.');
    if (window.LabSound && window.LabSound.enabled()) {
      if (ok) { window.LabSound.tone({ freq: 784, dur: 0.1, gain: 0.14 }); window.LabSound.tone({ freq: 1047, dur: 0.16, gain: 0.12, delay: 0.09 }); }
      else window.LabSound.sweep({ from: 392, to: 262, dur: 0.25, gain: 0.12, type: 'triangle' });
    }
    waiting = null;
    $('predBox').hidden = true;
    setStatus('');
    if (window.LabMission) window.LabMission.emit('predict', { ok: ok, streak: streak, kinds: Object.keys(streakKinds).length, zero: streakZero, truth: w.truth, choice: choice, kind: kind });
    refreshAll();
  }
  let lastSnd = 0;
  function soundFor(kind, sign) {
    if (!window.LabSound || !window.LabSound.enabled()) return;
    const now = performance.now();
    if (now - lastSnd < 140) return;
    lastSnd = now;
    if (kind === 'T+') window.LabSound.sweep({ from: 420, to: 640, dur: 0.12, gain: 0.07 });
    else if (kind === 'T-') window.LabSound.sweep({ from: 640, to: 420, dur: 0.12, gain: 0.07 });
    else if (kind === 'V-' || kind === 'V+') {
      const P = E.props(state.rx, n, opts()).P, Pr = rxd().Pr;
      const u = Math.max(0, Math.min(1, Math.log(P / Pr[0]) / Math.log(Pr[1] / Pr[0])));
      window.LabSound.tone({ freq: 330 + 500 * u, dur: 0.06, type: 'triangle', gain: 0.06 });
    } else if (kind === 'cat') window.LabSound.tone({ freq: 1175, dur: 0.1, gain: 0.08 });
    else window.LabSound.tone({ freq: sign > 0 ? 587 : 440, dur: 0.07, type: 'triangle', gain: 0.08 });
  }

  // ======================= 開始、換反應 =======================
  function startFrom(side) {
    segId++;
    origin = side;
    const r = rxd();
    n = { Ar: 0 };
    r.sp.forEach(function (s) { n[s] = 0; });
    if (side === 'R') r.sp.forEach(function (s, i) { if (r.nu[i] < 0) n[s] = r.n0[s] || 0; });
    else {
      let xi = Infinity;
      r.sp.forEach(function (s, i) { if (r.nu[i] < 0) xi = Math.min(xi, (r.n0[s] || 0) / -r.nu[i]); });
      r.sp.forEach(function (s, i) { if (r.nu[i] > 0) n[s] = r.nu[i] * xi; });
    }
    simT = 0; hist = []; events = []; changes = [];
    pending = true; settledFor = 0;
    cancelPredict();
    setStatus('');
    syncParts(true);
    pushSample();
    addEvent('start');
    refreshAll();
  }
  let syncing = false;
  function setRx(rx, keepMys) {
    if (!keepMys && mys) { mys = null; setMysUI(); }
    state.rx = rx;
    const r = rxd();
    syncing = true;
    elT.min = r.Tmin; elT.max = r.Tmax;
    state.T = r.T; setVal(elT, r.T);
    elV.min = r.Vr[0]; elV.max = r.Vr[1]; elV.step = r.Vr[1] >= 200 ? 2 : 1;
    state.V = r.V; setVal(elV, r.V);
    registerP();
    state.mode = 'V';
    syncing = false;
    document.querySelectorAll('#rxSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.rx === rx)); });
    buildAmounts();
    startFrom('R');
    const P0 = E.props(rx, n, { T: state.T, V: state.V / 1000 }).P;
    syncing = true; state.P = P0; setVal(elP, P0); syncing = false;
    setMode('V', true);
    setSpeed(rx === 'n2o4' || rx === 'mys' ? 0 : 1);
    updateLegend();
    updateGraphText();
    refreshAll();
  }
  function registerP() {
    const Pr = rxd().Pr;
    // 滑桿本身是 0–1000 的對數位置（不是 bar）；範圍若不是 0–1000，瀏覽器會把位置夾掉，壓力就跑到下限
    elP.min = 0; elP.max = 1000; elP.step = 1;
    if (window.LabNum) {
      window.LabNum.register(elP, {
        toValue: function (pos) { const q = rxd().Pr; return q[0] * Math.pow(q[1] / q[0], pos / 1000); },
        toPos: function (v) { const q = rxd().Pr; return 1000 * Math.log(v / q[0]) / Math.log(q[1] / q[0]); },
        decimals: Pr[1] >= 100 ? 0 : 2
      });
    }
  }
  function pFromSlider() { const q = rxd().Pr; return window.LabNum ? val(elP) : q[0] * Math.pow(q[1] / q[0], +elP.value / 1000); }
  function setMode(m, quiet) {
    if (state.mode === m && !quiet) return;
    const o = opts(), pr = E.props(state.rx, n, o);
    state.mode = m;
    syncing = true;
    if (m === 'P') { const Pr = rxd().Pr; state.P = Math.max(Pr[0], Math.min(Pr[1], pr.P)); setVal(elP, state.P); }
    else { const Vr = rxd().Vr; state.V = Math.max(Vr[0], Math.min(Vr[1], pr.V * 1000)); setVal(elV, state.V); }
    syncing = false;
    $('vRow').hidden = m !== 'V';
    $('pRow').hidden = m !== 'P';
    document.querySelectorAll('#modeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === m)); });
    // 定壓時若當下的體積落在活塞可動範圍外，壓力已被夾住，屬於一次改變
    if (!quiet && m === 'P' && Math.abs(state.P - pr.P) / pr.P > 1e-6) changed(state.P > pr.P ? 'V-' : 'V+');
    refreshAll();
  }

  // ======================= 2D 畫面 =======================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  const elT = $('temp'), elV = $('vol'), elP = $('pres'), elCat = $('cat'), elPred = $('predMode');
  const statusEl = $('status');
  function val(el) { return window.LabNum ? window.LabNum.value(el) : +el.value; }
  function setVal(el, v) { if (window.LabNum) window.LabNum.set(el, v); else el.value = v; }
  let statusOverride = '';
  function setStatus(s) { statusOverride = s; statusEl.innerHTML = s || autoStatus(); }
  function autoStatus() {
    if (waiting) return T('預測模式：注射筒先停住。平衡會往哪邊移動？', 'Prediction mode: the syringe is on hold. Which way will the equilibrium shift?');
    if (!canReact()) return T('注射筒裡缺少反應物或生成物，無法反應：請加入氣體或按「從反應物開始」。', 'Something is missing for the reaction to go either way: add a gas or press “Start: reactants”.');
    if (!state.running) return T('已暫停：可以先改變條件，再按「播放」。', 'Paused: you can change the conditions and then press “Play”.');
    if (pending) {
      const g = lqk();
      return g < 0 ? T('Q < K：反應向右進行（生成物增加）…', 'Q < K: the reaction runs to the right (more products)…') : T('Q > K：反應向左進行（反應物增加）…', 'Q > K: the reaction runs to the left (more reactants)…');
    }
    return T('平衡中：Q = K。', 'At equilibrium: Q = K.');
  }

  let cw = 0, ch = 0, dpr = 1, G = null;
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = w;
    ch = w < 560 ? Math.round(Math.max(300, w * 0.84)) : 400;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    layout();
    resizeGraph();
    drawAll();
  }
  function layout() {
    const narrow = cw < 560;
    const pad = narrow ? 10 : 16;
    const noz = Math.max(26, cw * 0.065);
    const bx0 = pad + noz, L = cw * (narrow ? 0.72 : 0.7);
    const Hb = Math.min(ch * 0.36, cw * 0.25);
    const jw = Hb * 0.2;
    const yc = ch * (narrow ? 0.55 : 0.54);
    const gr = Math.max(24, Math.min(44, ch * 0.105));
    G = { pad: pad, noz: noz, bx0: bx0, L: L, bx1: bx0 + L, Hb: Hb, jw: jw, yc: yc, gr: gr, gx: pad + gr + 2, gy: yc - Hb / 2 - jw - gr - 10, r0: Hb * 0.036, meterY: Math.min(ch - 22, yc + Hb / 2 + jw + 38) };
  }
  function curV() { return E.props(state.rx, n, opts()).V * 1000; }
  function gasFrac() { return Math.max(0.02, Math.min(1, curV() / rxd().Vr[1])); }
  function pistonX() { return G.bx0 + G.L * gasFrac(); }
  function fsz(px) { return px * (window.LabSettings && window.LabSettings.get('fs') || 1); }
  function rich(g, ps, x, y, color, size, align, weight) {
    size = size || fsz(12);
    const f0 = (weight || '') + ' ' + size + 'px ' + LD.FONT, f1 = (weight || '') + ' ' + (size * 0.72).toFixed(1) + 'px ' + LD.FONT;
    let w = 0;
    ps.forEach(function (p) { g.font = p[1] ? f1 : f0; w += g.measureText(p[0]).width; });
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = color;
    ps.forEach(function (p) {
      g.font = p[1] ? f1 : f0;
      g.fillText(p[0], cx, y + (p[1] > 0 ? -size * 0.38 : p[1] < 0 ? size * 0.22 : 0));
      cx += g.measureText(p[0]).width;
    });
    return w;
  }
  function richW(g, ps, size) {
    size = size || fsz(12);
    let w = 0;
    ps.forEach(function (p) { g.font = (p[1] ? (size * 0.72).toFixed(1) : size) + 'px ' + LD.FONT; w += g.measureText(p[0]).width; });
    return w;
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  /** 氣體的顏色（比爾定律，橫越筒身的光程） */
  function gasTint() {
    const o = opts(), pr = E.props(state.rx, n, o);
    let best = null;
    Object.keys(TINT).forEach(function (s) {
      if (!(s in n)) return;
      const tr = E.transmittance(pr.c[s] || 0, TINT[s][1], 1);
      const a = 0.9 * (1 - tr);
      if (!best || a > best.a) best = { color: TINT[s][0], a: a };
    });
    return best;
  }
  let kb = null;
  function drawStage() {
    if (!G || !cw) return;
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(g, cw, ch);
    const { bx0, bx1, L, Hb, jw, yc } = G;
    const top = yc - Hb / 2, bot = yc + Hb / 2;
    const px = pistonX();
    const tcol = tempColor(state.T);
    // ---- 水浴 ----
    const jx = bx0 - 8, jy = top - jw, jW = L + 16, jH = Hb + 2 * jw;
    g.save();
    const wg = g.createLinearGradient(0, jy, 0, jy + jH);
    wg.addColorStop(0, LD.alpha(tcol, col.dark ? 0.2 : 0.14));
    wg.addColorStop(1, LD.alpha(tcol, col.dark ? 0.36 : 0.3));
    rr(g, jx, jy, jW, jH, 12);
    g.fillStyle = wg; g.fill();
    g.strokeStyle = LD.alpha(tcol, 0.65); g.lineWidth = 1.5; g.stroke();
    // 水面的反光
    g.strokeStyle = LD.alpha('#ffffff', col.dark ? 0.12 : 0.45); g.lineWidth = 1;
    g.beginPath(); g.moveTo(jx + 10, jy + 4); g.lineTo(jx + jW - 10, jy + 4); g.stroke();
    // 水浴的小氣泡（溫度越高越多，只是裝飾）
    const nb = Math.round(2 + 10 * Math.max(0, (state.T - rxd().Tmin) / (rxd().Tmax - rxd().Tmin)));
    const tt = performance.now() / 1000;
    g.fillStyle = LD.alpha('#ffffff', col.dark ? 0.18 : 0.5);
    for (let k = 0; k < nb; k++) {
      const s = (k * 0.618) % 1, ph = (tt * (0.25 + 0.2 * s) + s) % 1;
      const bx = jx + 14 + s * (jW - 28), by = jy + jH - 4 - ph * (jw - 6);
      g.beginPath(); g.arc(bx, by, 1.2 + 1.2 * s, 0, Math.PI * 2); g.fill();
      const by2 = jy + jw - 4 - ph * (jw - 8);
      g.beginPath(); g.arc(jx + jW - 14 - s * (jW - 28), by2, 1 + s, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    // ---- 筒身內部 ----
    g.save();
    g.fillStyle = col.dark ? 'rgba(12,16,22,0.55)' : 'rgba(255,255,255,0.75)';
    g.fillRect(bx0, top, L, Hb);
    const tint = gasTint();
    if (tint && tint.a > 0.004) { g.fillStyle = LD.alpha(tint.color, tint.a); g.fillRect(bx0, top, px - bx0, Hb); }
    // 分子
    g.beginPath(); g.rect(bx0, top, px - bx0, Hb); g.clip();
    drawMolecules(g, px);
    drawFlashes(g, px);
    g.restore();
    // ---- 刻度 ----
    g.save();
    const Vmax = rxd().Vr[1], stepV = Vmax >= 200 ? 20 : 10;
    g.strokeStyle = LD.alpha(col.text, 0.55); g.lineWidth = 1;
    g.font = fsz(10) + 'px ' + LD.FONT; g.fillStyle = col.muted; g.textAlign = 'center'; g.textBaseline = 'bottom';
    for (let v = 0; v <= Vmax + 1e-9; v += stepV / 2) {
      const X = Math.round(bx0 + L * v / Vmax) + 0.5, major = Math.abs(v / stepV - Math.round(v / stepV)) < 1e-9;
      g.beginPath(); g.moveTo(X, top); g.lineTo(X, top + (major ? 9 : 5)); g.stroke();
      if (major && v > 0 && (cw >= 480 || (v / stepV) % 2 === 0)) g.fillText(num(v, 0), X, top - 2 - jw * 0.05);
    }
    g.fillText('mL', bx0, top - 2 - jw * 0.05);
    g.restore();
    // ---- 玻璃的外框與反光 ----
    g.save();
    g.strokeStyle = LD.alpha(col.text, col.dark ? 0.5 : 0.45); g.lineWidth = 2;
    g.beginPath(); g.moveTo(bx0, top); g.lineTo(bx1, top); g.moveTo(bx0, bot); g.lineTo(bx1, bot); g.stroke();
    const hl = g.createLinearGradient(0, top, 0, top + Hb * 0.3);
    hl.addColorStop(0, LD.alpha('#ffffff', col.dark ? 0.16 : 0.55)); hl.addColorStop(1, LD.alpha('#ffffff', 0));
    g.fillStyle = hl; g.fillRect(bx0 + 2, top + 2, L - 4, Hb * 0.3);
    // 筒口的凸緣
    g.fillStyle = LD.alpha(col.text, col.dark ? 0.35 : 0.25);
    rr(g, bx1 - 3, top - jw - 10, 7, Hb + 2 * jw + 20, 3); g.fill();
    g.restore();
    // ---- 針頭與壓力錶 ----
    drawNozzle(g);
    drawGauge(g);
    // ---- 活塞 ----
    drawPiston(g, px);
    // ---- 文字 ----
    const o = opts(), pr = E.props(state.rx, n, o);
    const fnt = fsz(12) + 'px ' + LD.FONT;
    LD.pill(g, 'T = ' + num(state.T, 0) + ' K', jx + jW - 4, jy + jH + 18, tcol, 'right', fnt);
    LD.pill(g, 'V = ' + sigf(pr.V * 1000, 3) + ' mL', bx0 + 2, jy + jH + 18, col.text, 'left', fnt);
    if (o.stop) LD.pill(g, o.stop > 0 ? T('活塞已拉到底', 'Piston at the end') : T('活塞已推到底', 'Piston fully in'), Math.min(px, cw - 70), top - jw - 18, col.pos, 'center', fnt);
    const stTxt = waiting ? T('先預測！', 'Predict first!') : !state.running ? T('已暫停', 'Paused') : pending ? T('反應中…', 'Reacting…') : T('已平衡', 'At equilibrium');
    LD.pill(g, stTxt + '  t = ' + sigf(simT, 3) + ' s', cw - G.pad, 18, waiting ? col.accent : pending ? col.text : col.probe, 'right', fnt);
    drawMeter(g);
    // 鍵盤焦點
    if (kb && kb.focused()) {
      g.save();
      g.strokeStyle = col.accent; g.lineWidth = 2; g.setLineDash([5, 4]);
      if (kb.index() === 0) { rr(g, px - 10, top - jw - 6, 34, Hb + 2 * jw + 12, 8); }
      else { rr(g, jx - 4, jy - 4, jW + 8, jH + 8, 14); }
      g.stroke();
      g.restore();
    }
  }
  function atomColor(a) { return col.atom[a] || col.muted; }
  function drawMolecules(g, px) {
    const { bx0, Hb, yc, r0 } = G;
    const len = px - bx0, half = Hb / 2 - r0 * 1.6;
    const now = performance.now();
    const order = parts.slice().sort(function (a, b) { return a.w - b.w; });
    order.forEach(function (p) {
      const x = bx0 + p.u * len, y = yc + p.v * half;
      const fade = Math.min(1, (now - p.born) / 250);
      const ca = Math.cos(p.a), sa = Math.sin(p.a), ct = Math.cos(p.tilt);
      const sc = 0.88 + 0.12 * (p.w + 1) / 2;
      g.globalAlpha = (0.55 + 0.45 * (p.w + 1) / 2) * fade;
      MOL[p.sp].forEach(function (at) {
        const ox = at[1] * r0 * sc, oy = at[2] * r0 * sc * ct;
        LD.ball(g, x + ox * ca - oy * sa, y + ox * sa + oy * ca, ATOM_R[at[0]] * r0 * sc, atomColor(at[0]), { glow: 0, shadow: false });
      });
    });
    g.globalAlpha = 1;
  }
  function drawFlashes(g, px) {
    const now = performance.now(), { bx0, Hb, yc, r0 } = G, len = px - bx0, half = Hb / 2 - r0 * 1.6;
    flashes.forEach(function (f) {
      const u = (now - f.t0) / FL_DUR;
      if (u < 0 || u > 1) return;
      LD.ripple(g, bx0 + f.u * len, yc + f.v * half, r0 * 2, u, f.kind ? col.probe : col.accent);
    });
  }
  function drawNozzle(g) {
    const { bx0, yc, Hb, noz, gx, gy, gr } = G;
    g.save();
    const metal = g.createLinearGradient(0, yc - Hb * 0.12, 0, yc + Hb * 0.12);
    metal.addColorStop(0, col.dark ? '#5b6672' : '#c9d0d8'); metal.addColorStop(0.5, col.dark ? '#8a96a3' : '#eef1f4'); metal.addColorStop(1, col.dark ? '#46505a' : '#a9b3be');
    g.fillStyle = metal; g.strokeStyle = LD.alpha(col.text, 0.45); g.lineWidth = 1;
    // 錐形接頭
    g.beginPath();
    g.moveTo(bx0, yc - Hb * 0.3); g.lineTo(bx0 - noz * 0.55, yc - Hb * 0.09); g.lineTo(bx0 - noz * 0.55, yc + Hb * 0.09); g.lineTo(bx0, yc + Hb * 0.3); g.closePath();
    g.fill(); g.stroke();
    // 細管接到壓力錶
    g.strokeStyle = col.dark ? '#7d8996' : '#9aa5b1'; g.lineWidth = Math.max(3, Hb * 0.05); g.lineCap = 'round';
    g.beginPath(); g.moveTo(bx0 - noz * 0.55, yc); g.lineTo(gx, yc); g.lineTo(gx, gy + gr); g.stroke();
    g.restore();
  }
  function drawGauge(g) {
    const { gx, gy, gr } = G;
    const P = E.props(state.rx, n, opts()).P, Pr = rxd().Pr;
    const Pmax = Pr[1] >= 100 ? (Pr[1] >= 400 ? 600 : 200) : Pr[1] >= 8 ? 15 : 8;
    g.save();
    const face = g.createRadialGradient(gx - gr * 0.3, gy - gr * 0.3, gr * 0.1, gx, gy, gr);
    face.addColorStop(0, col.dark ? '#2a3038' : '#ffffff'); face.addColorStop(1, col.dark ? '#1b2027' : '#e8ecf0');
    g.fillStyle = face;
    g.beginPath(); g.arc(gx, gy, gr, 0, Math.PI * 2); g.fill();
    g.strokeStyle = col.dark ? '#7d8996' : '#8d98a5'; g.lineWidth = 3; g.stroke();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    g.strokeStyle = LD.alpha(col.text, 0.6); g.lineWidth = 1;
    for (let k = 0; k <= 10; k++) {
      const a = a0 + (a1 - a0) * k / 10, r1 = gr * 0.82, r2 = gr * (k % 5 === 0 ? 0.64 : 0.72);
      g.beginPath(); g.moveTo(gx + r1 * Math.cos(a), gy + r1 * Math.sin(a)); g.lineTo(gx + r2 * Math.cos(a), gy + r2 * Math.sin(a)); g.stroke();
    }
    const u = Math.max(0, Math.min(1.04, P / Pmax)), a = a0 + (a1 - a0) * u;
    g.strokeStyle = col.pos; g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(gx - gr * 0.12 * Math.cos(a), gy - gr * 0.12 * Math.sin(a)); g.lineTo(gx + gr * 0.7 * Math.cos(a), gy + gr * 0.7 * Math.sin(a)); g.stroke();
    g.fillStyle = col.text; g.beginPath(); g.arc(gx, gy, 2.5, 0, Math.PI * 2); g.fill();
    g.font = fsz(9) + 'px ' + LD.FONT; g.fillStyle = col.muted; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('0', gx + gr * 0.5 * Math.cos(a0), gy + gr * 0.5 * Math.sin(a0));
    g.fillText(num(Pmax, 0), gx + gr * 0.5 * Math.cos(a1), gy + gr * 0.5 * Math.sin(a1));
    g.fillText('bar', gx, gy - gr * 0.38);
    g.restore();
    LD.pill(g, 'P = ' + sigf(P, 3) + ' bar', gx + gr + 8, gy + 4, col.text, 'left', fsz(12) + 'px ' + LD.FONT);
  }
  function drawPiston(g, px) {
    const { yc, Hb, L } = G;
    const top = yc - Hb / 2;
    const pw = Math.max(12, Hb * 0.16);
    g.save();
    // 推桿
    const rh = Hb * 0.2;
    const rod = g.createLinearGradient(0, yc - rh / 2, 0, yc + rh / 2);
    rod.addColorStop(0, col.dark ? '#5b6672' : '#d5dbe1'); rod.addColorStop(0.45, col.dark ? '#9aa5b1' : '#f6f8fa'); rod.addColorStop(1, col.dark ? '#46505a' : '#b3bcc6');
    const rodEnd = px + pw + L * 0.92;
    g.fillStyle = rod; g.strokeStyle = LD.alpha(col.text, 0.4); g.lineWidth = 1;
    g.fillRect(px + pw, yc - rh / 2, rodEnd - px - pw, rh);
    g.strokeRect(px + pw, yc - rh / 2, rodEnd - px - pw, rh);
    // 把手（拇指壓的圓盤）
    if (rodEnd < cw + 20) {
      g.fillStyle = rod;
      rr(g, rodEnd, yc - Hb * 0.55, 9, Hb * 1.1, 4); g.fill(); g.stroke();
    }
    // 橡膠活塞
    const rub = g.createLinearGradient(px, 0, px + pw, 0);
    rub.addColorStop(0, '#3a3f46'); rub.addColorStop(0.5, '#5a616b'); rub.addColorStop(1, '#2e3238');
    g.fillStyle = rub;
    rr(g, px, top + 1, pw, Hb - 2, 3); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    for (let k = 1; k <= 2; k++) { const X = px + pw * k / 3; g.beginPath(); g.moveTo(X, top + 2); g.lineTo(X, top + Hb - 2); g.stroke(); }
    g.restore();
  }
  /** 底下的 Q 與 K 刻度：ln(Q/K) 在 −4…+4 之間 */
  function drawMeter(g) {
    const { bx0, bx1, meterY } = G;
    const x0 = bx0, x1 = bx1, y = meterY;
    const fnt = fsz(11) + 'px ' + LD.FONT;
    g.save();
    const grd = g.createLinearGradient(x0, 0, x1, 0);
    grd.addColorStop(0, LD.alpha(col.probe, 0.5)); grd.addColorStop(0.5, LD.alpha(col.muted, 0.25)); grd.addColorStop(1, LD.alpha(col.neg, 0.5));
    g.fillStyle = grd;
    rr(g, x0, y - 3, x1 - x0, 6, 3); g.fill();
    const xm = (x0 + x1) / 2;
    g.strokeStyle = col.text; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(xm, y - 9); g.lineTo(xm, y + 9); g.stroke();
    g.font = fnt; g.fillStyle = col.muted; g.textBaseline = 'alphabetic';
    g.textAlign = 'center'; g.fillText('Q = K', xm, y - 12);
    g.textAlign = 'left'; g.fillText(T('Q < K → 向右', 'Q < K → right'), x0, y + 20);
    g.textAlign = 'right'; g.fillText(T('Q > K ← 向左', 'Q > K ← left'), x1, y + 20);
    if (!waiting && !isMys()) {
      const v = lqk();
      if (!isNaN(v)) {
        const c = Math.max(-4, Math.min(4, v)), X = xm + (x1 - x0) / 2 * c / 4;
        LD.ball(g, X, y, 7, Math.abs(v) < 1e-3 ? col.probe : v < 0 ? col.probe : col.neg, { glow: 0 });
        g.font = 'bold ' + fsz(11) + 'px ' + LD.FONT; g.fillStyle = col.text; g.textAlign = 'center';
        g.fillText('Q', X, y + 4);
      }
    } else if (waiting) {
      g.font = 'bold ' + fsz(11) + 'px ' + LD.FONT; g.fillStyle = col.accent; g.textAlign = 'center';
      g.fillText('?', xm + 16, y + 4);
    }
    g.restore();
  }

  // ======================= 圖表 =======================
  let gw = 0, gh = 0;
  function resizeGraph() {
    const w = gcv.clientWidth;
    if (!w) return;
    gw = w;
    gh = w < 560 ? Math.round(Math.max(260, w * 0.78)) : 330;
    if (gcv.style.height !== gh + 'px') gcv.style.height = gh + 'px';
    gcv.width = Math.round(gw * dpr); gcv.height = Math.round(gh * dpr);
  }
  function niceStep(span, k) {
    const raw = span / Math.max(1, k), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function axes(g, o) {
    const narrow = gw < 480;
    const Lm = narrow ? 46 : 56, Rm = 14, Tp = 30, B = narrow ? 40 : 42;
    const X0 = Lm, X1 = gw - Rm, Y0 = gh - B, Y1 = Tp;
    const sx = function (v) { return X0 + (v - o.x0) / (o.x1 - o.x0) * (X1 - X0); };
    const sy = function (v) { return Y0 - (v - o.y0) / (o.y1 - o.y0) * (Y0 - Y1); };
    g.save();
    g.strokeStyle = LD.alpha(col.text, col.dark ? 0.1 : 0.08);
    g.lineWidth = 1;
    const xs = niceStep(o.x1 - o.x0, o.xticks || (narrow ? 4 : 6)), ys = niceStep(o.y1 - o.y0, o.yticks || 5);
    g.font = fsz(11) + 'px ' + LD.FONT;
    g.fillStyle = col.muted;
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (let v = Math.ceil(o.x0 / xs - 1e-9) * xs; v <= o.x1 + 1e-9; v += xs) {
      const X = Math.round(sx(v)) + 0.5;
      g.beginPath(); g.moveTo(X, Y1); g.lineTo(X, Y0); g.stroke();
      g.fillText(num(v, xs < 1 ? Math.ceil(-Math.log10(xs) - 1e-9) : 0), X, Y0 + 4);
    }
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = Math.ceil(o.y0 / ys - 1e-9) * ys; v <= o.y1 + 1e-9; v += ys) {
      const Y = Math.round(sy(v)) + 0.5;
      g.beginPath(); g.moveTo(X0, Y); g.lineTo(X1, Y); g.stroke();
      g.fillText(num(v, ys < 1 ? Math.ceil(-Math.log10(ys) - 1e-9) : 0), X0 - 5, Y);
    }
    g.strokeStyle = LD.alpha(col.text, 0.55);
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(X0, Y1); g.lineTo(X0, Y0); g.lineTo(X1, Y0); g.stroke();
    if (o.xl) rich(g, o.xl, (X0 + X1) / 2, gh - 6, col.muted, fsz(12), 'center');
    if (o.yl) rich(g, o.yl, 4, 16, col.muted, fsz(12), 'left');
    g.restore();
    return { sx: sx, sy: sy, X0: X0, X1: X1, Y0: Y0, Y1: Y1 };
  }
  function line(g, pts, color, width, dash) {
    if (pts.length < 2) return;
    g.save();
    g.strokeStyle = color; g.lineWidth = width || 2; g.lineJoin = 'round';
    if (dash) g.setLineDash(dash);
    g.beginPath();
    pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
    g.stroke();
    g.restore();
  }
  function note(g, text, x, y, color, align) {
    LD.haloText(g, text, x, y, color || col.text, align || 'left', 'alphabetic', fsz(12) + 'px ' + LD.FONT);
  }
  function drawGraph() {
    if (!gw) return;
    const g = gctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = col.bg; g.fillRect(0, 0, gw, gh);
    if (state.tab === 'time') drawTime(g);
    else if (state.tab === 'qk') drawQK(g);
    else drawVH(g);
  }
  function timeRange() {
    const t0 = hist.length ? hist[0].t : 0, t1 = Math.max(hist.length ? hist[hist.length - 1].t : 0, t0 + 1e-6);
    const span = Math.max(t1 - t0, 1);
    return [t0, t0 + span];
  }
  function drawEvents(g, A) {
    g.save();
    let k = 0;
    events.forEach(function (e) {
      if (e.t < A.x0v || e.t > A.x1v + 1e-9) return;
      const X = A.sx(e.t);
      g.strokeStyle = LD.alpha(col.text, 0.35); g.setLineDash([3, 3]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(X, A.Y1); g.lineTo(X, A.Y0); g.stroke();
      g.setLineDash([]);
      const w = richW(g, e.label, fsz(11));
      const x = Math.min(A.X1 - w - 2, X + 3);
      rich(g, e.label, x, A.Y1 + 12 + (k++ % 3) * 13, col.muted, fsz(11), 'left');
    });
    g.restore();
  }
  function drawTime(g) {
    const sps = rxd().sp.slice();
    if (hist.some(function (h) { return h.p.Ar > 0; })) sps.push('Ar');
    const tr = timeRange();
    let ymax = 0;
    hist.forEach(function (h) { sps.forEach(function (s) { ymax = Math.max(ymax, h.p[s] || 0); }); });
    ymax = ymax > 0 ? ymax * 1.15 : 1;
    const A = axes(g, { x0: tr[0], x1: tr[1], y0: 0, y1: ymax, xl: [[T('時間 t（s，模擬時間）', 'time t (s, simulated)'), 0]], yl: [[T('分壓 p（bar）', 'partial pressure p (bar)'), 0]] });
    A.x0v = tr[0]; A.x1v = tr[1];
    drawEvents(g, A);
    sps.forEach(function (s) {
      const pts = hist.map(function (h) { return [A.sx(h.t), A.sy(h.p[s] || 0)]; });
      line(g, pts, col.sp[s], s === 'Ar' ? 1.5 : 2.4, s === 'Ar' ? [5, 4] : null);
      if (pts.length) {
        const last = pts[pts.length - 1];
        rich(g, fP(s), Math.min(last[0] + 4, A.X1 - 18), last[1] - 4, col.sp[s], fsz(12), 'left', 'bold');
      }
    });
  }
  function drawQK(g) {
    if (isMys()) { drawMsg(g, T('未知反應：K 是要你自己求的，這張圖先不顯示。', 'Unknown reaction: K is for you to find, so this graph is hidden.')); return; }
    const tr = timeRange();
    let lo = Infinity, hi = -Infinity;
    hist.forEach(function (h) { if (h.lq != null && !h.w) { lo = Math.min(lo, h.lq); hi = Math.max(hi, h.lq); } lo = Math.min(lo, h.lk); hi = Math.max(hi, h.lk); });
    if (!isFinite(lo)) { lo = -1; hi = 1; }
    if (hi - lo < 1) { const m = (hi + lo) / 2; lo = m - 0.5; hi = m + 0.5; }
    const pad = (hi - lo) * 0.12;
    const A = axes(g, { x0: tr[0], x1: tr[1], y0: lo - pad, y1: hi + pad, xl: [[T('時間 t（s，模擬時間）', 'time t (s, simulated)'), 0]], yl: [['log', 0], ['10', -1], [' Q ' + T('與', 'and') + ' log', 0], ['10', -1], [' K', 0]] });
    A.x0v = tr[0]; A.x1v = tr[1];
    drawEvents(g, A);
    line(g, hist.map(function (h) { return [A.sx(h.t), A.sy(h.lk)]; }), col.accent, 2, [7, 5]);
    // Q：預測中的那一段先不畫
    let seg = [];
    hist.forEach(function (h) {
      if (h.lq == null || h.w) { line(g, seg, col.pos, 2.4); seg = []; return; }
      seg.push([A.sx(h.t), A.sy(h.lq)]);
    });
    line(g, seg, col.pos, 2.4);
    const lastH = hist[hist.length - 1];
    if (lastH) {
      note(g, 'K', A.X1 - 4, A.sy(lastH.lk) - 6, col.accent, 'right');
      if (lastH.lq != null && !lastH.w) note(g, 'Q', A.X1 - 18, A.sy(lastH.lq) + (lastH.lq > lastH.lk ? -6 : 16), col.pos, 'right');
    }
  }
  function drawMsg(g, text) {
    g.save();
    g.font = fsz(14) + 'px ' + LD.FONT; g.fillStyle = col.muted; g.textAlign = 'center'; g.textBaseline = 'middle';
    const words = text.split(/(?<=[，。,.;：:])/);
    let lineTxt = '', y = gh / 2 - 20, out = [];
    words.forEach(function (w) { if (g.measureText(lineTxt + w).width > gw - 40 && lineTxt) { out.push(lineTxt); lineTxt = w; } else lineTxt += w; });
    out.push(lineTxt);
    out.forEach(function (l, i) { g.fillText(l.trim(), gw / 2, y + i * 22); });
    g.restore();
  }
  /** 一列平衡紀錄的 ln K（由該列的分壓算出） */
  function rowLnK(r) {
    const R = E.RX[r.rx];
    let s = 0;
    for (let i = 0; i < R.sp.length; i++) { const p = r.p[R.sp[i]]; if (!(p > 0)) return NaN; s += R.nu[i] * Math.log(p); }
    return s;
  }
  function vhRows() { return curRows().filter(function (r) { return isFinite(rowLnK(r)); }); }
  function drawVH(g) {
    const r = rxd();
    const rs = vhRows();
    const xs0 = 1000 / r.Tmax, xs1 = 1000 / r.Tmin;
    let lo = Infinity, hi = -Infinity;
    const curve = [];
    if (!isMys()) {
      for (let k = 0; k <= 40; k++) { const Tk = r.Tmin + (r.Tmax - r.Tmin) * k / 40, y = Math.log(E.K(state.rx, Tk)); curve.push([1000 / Tk, y]); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    }
    rs.forEach(function (row) { const y = rowLnK(row); lo = Math.min(lo, y); hi = Math.max(hi, y); });
    if (!isFinite(lo)) { lo = -2; hi = 2; }
    if (hi - lo < 1) { const m = (hi + lo) / 2; lo = m - 0.5; hi = m + 0.5; }
    const padY = (hi - lo) * 0.1, padX = (xs1 - xs0) * 0.06;
    const A = axes(g, { x0: xs0 - padX, x1: xs1 + padX, y0: lo - padY, y1: hi + padY,
      xl: [['1000 / T（K', 0], ['−1', 1], ['）', 0]], yl: [['ln K', 0]] });
    if (curve.length) {
      line(g, curve.map(function (p) { return [A.sx(p[0]), A.sy(p[1])]; }), LD.alpha(col.muted, 0.8), 1.5, [6, 4]);
    }
    rs.forEach(function (row) { LD.ball(g, A.sx(1000 / row.T), A.sy(rowLnK(row)), 5, col.pos, { glow: 0 }); });
    if (isMys()) {
      if (!rs.length) note(g, T('在不同溫度達到平衡，點會出現在這裡', 'Reach equilibrium at different temperatures to add points'), A.X0 + 8, A.Y1 + 16, col.muted);
      return;
    }
    const f = E.vantHoff(rs.map(function (row) { return { T: row.T, K: Math.exp(rowLnK(row)) }; }));
    const nT = distinctT(rs);
    if (f && nT >= 2) {
      const xa = xs0 - padX, xb = xs1 + padX;
      line(g, [[A.sx(xa), A.sy(f.intercept + f.slope * xa / 1000)], [A.sx(xb), A.sy(f.intercept + f.slope * xb / 1000)]], col.pos, 1.8);
      note(g, T('由 ' + nT + ' 個溫度：ΔH° ≈ ' + num(f.dH, 1) + ' kJ/mol', 'From ' + nT + ' temperatures: ΔH° ≈ ' + num(f.dH, 1) + ' kJ/mol'), A.X0 + 8, A.Y1 + 16, col.pos);
    } else note(g, T('虛線：由 NIST 數據算出的 ln K。點：你量到的平衡。', 'Dashed: ln K from the NIST data. Dots: your equilibria.'), A.X0 + 8, A.Y1 + 16, col.muted);
  }
  function distinctT(rs) { const s = {}; rs.forEach(function (r) { s[r.T] = 1; }); return Object.keys(s).length; }
  function drawAll() { drawStage(); drawGraph(); }

  // ======================= 讀數、表格、文字 =======================
  function curRows() { return rows.filter(function (r) { return r.rx === state.rx && (!isMys() || (mys && r.mys === mys.id)); }); }
  function updateReadouts() {
    const o = opts(), pr = E.props(state.rx, n, o);
    const sps = listSpecies();
    let h = '<thead><tr><th>' + T('成分', 'Gas') + '</th><th>n<br><small>mmol</small></th><th>p<br><small>bar</small></th><th>c<br><small>mol/L</small></th></tr></thead><tbody>';
    sps.forEach(function (s) {
      h += '<tr><td>' + fH(s) + '</td><td>' + sigf(1000 * (n[s] || 0), 3) + '</td><td>' + sigf(pr.p[s] || 0, 3) + '</td><td>' + sciHTML(pr.c[s] || 0, 3) + '</td></tr>';
    });
    h += '</tbody>';
    $('nowTbl').innerHTML = h;
    const hide = isMys(), wait = !!waiting;
    const K = E.K(state.rx, state.T), Kc = E.Kc(state.rx, state.T);
    const q = canReact() ? E.Q(state.rx, n, o) : NaN;
    const items = [
      [T('總壓力 P', 'Total pressure P'), sigf(pr.P, 3) + ' bar'],
      [T('體積 V', 'Volume V'), sigf(pr.V * 1000, 3) + ' mL'],
      [T('平衡常數 K<sub>p</sub>', 'Equilibrium constant K<sub>p</sub>') + '<small>' + T('（以 bar 計）', '(pressures in bar)') + '</small>', hide ? '?' : sciHTML(K, 3), 'big'],
      ['K<sub>c</sub><small>' + T('（以 mol/L 計）', '(concentrations in mol/L)') + '</small>', hide ? '?' : sciHTML(Kc, 3)],
      [T('反應商 Q', 'Reaction quotient Q'), hide || wait ? '?' : q === 0 ? '0' : !isFinite(q) ? '∞' : sciHTML(q, 3)]
    ];
    $('readout').innerHTML = items.map(function (it) { return '<dt>' + it[0] + '</dt><dd' + (it[2] ? ' class="' + it[2] + '"' : '') + '>' + it[1] + '</dd>'; }).join('');
    const box = $('qkBox');
    const g = lqk();
    if (wait) { box.className = 'qk'; box.textContent = T('先預測，再看 Q 與 K', 'Predict first, then look at Q and K'); }
    else if (hide) { box.className = 'qk eq0'; box.textContent = pending ? T('反應中…', 'Reacting…') : T('已達平衡', 'At equilibrium'); }
    else if (isNaN(g)) { box.className = 'qk eq0'; box.textContent = T('無法反應', 'No reaction possible'); }
    else if (Math.abs(g) < 1e-3) { box.className = 'qk eq0'; box.textContent = T('Q = K：平衡', 'Q = K: equilibrium'); }
    else if (g < 0) { box.className = 'qk right'; box.textContent = T('Q < K：向右進行 →', 'Q < K: goes to the right →'); }
    else { box.className = 'qk left'; box.textContent = T('← Q > K：向左進行', '← Q > K: goes to the left'); }
    document.querySelectorAll('#amts .amt').forEach(function (row) {
      const s = row.dataset.sp;
      row.querySelector('.v').textContent = sigf(1000 * (n[s] || 0), 3) + ' mmol';
      const step = rxd().step;
      row.querySelector('[data-d="-1"]').disabled = !((n[s] || 0) > 1e-15);
      row.querySelector('[data-d="1"]').disabled = (n[s] || 0) >= 20 * step - 1e-12;
    });
    if (!statusOverride) statusEl.innerHTML = autoStatus();
    describeCanvas();
  }
  function describeCanvas() {
    const pr = E.props(state.rx, n, opts());
    cv.setAttribute('aria-label', T('注射筒：', 'Syringe: ') + 'T = ' + num(state.T, 0) + ' K, V = ' + sigf(pr.V * 1000, 3) + ' mL, P = ' + sigf(pr.P, 3) + ' bar. ' +
      listSpecies().map(function (s) { return nm(s) + ' ' + sigf(1000 * (n[s] || 0), 3) + ' mmol'; }).join(', ') + '. ' +
      T('拖曳活塞或按 Enter 選取後用方向鍵改變體積與溫度。', 'Drag the piston, or press Enter and use the arrow keys to change the volume and temperature.'));
  }
  function renderTable() {
    const rs = curRows().slice(-60);
    const sps = rxd().sp.slice();
    const hasAr = rs.some(function (r) { return r.Ar > 0; });
    if (hasAr) sps.push('Ar');
    let h = '<thead><tr><th>#</th><th>T<br><small>K</small></th><th>V<br><small>mL</small></th><th>P<br><small>bar</small></th>';
    sps.forEach(function (s) { h += '<th>p<sub>' + fH(s) + '</sub><br><small>bar</small></th>'; });
    if (!isMys()) h += '<th>K<sub>p</sub></th>';
    h += '<th>' + T('改變', 'Change') + '</th></tr></thead><tbody>';
    if (!rs.length) h += '<tr class="empty"><td colspan="' + (6 + sps.length) + '">' + T('達到平衡時會自動記一列。', 'A row is added each time equilibrium is reached.') + '</td></tr>';
    rs.forEach(function (r, i) {
      h += '<tr><td>' + (i + 1) + '</td><td>' + num(r.T, 0) + '</td><td>' + sigf(r.V, 3) + '</td><td>' + sigf(r.P, 3) + '</td>';
      sps.forEach(function (s) { h += '<td>' + sigf(r.p[s] || 0, 3) + '</td>'; });
      if (!isMys()) h += '<td>' + sciHTML(r.K, 3) + '</td>';
      h += '<td>' + changeText(r) + '</td></tr>';
    });
    h += '</tbody>';
    $('tbl').innerHTML = h;
  }
  function changeText(r) {
    if (!r.changes.length) return r.origin === 'P' ? T('從生成物開始', 'from products') : T('從反應物開始', 'from reactants');
    const seen = {};
    return r.changes.filter(function (k) { if (seen[k]) return false; seen[k] = 1; return true; }).map(function (k) {
      return ({ 'T+': T('加熱', 'heated'), 'T-': T('冷卻', 'cooled'), 'V-': T('壓縮', 'compressed'), 'V+': T('膨脹', 'expanded'),
        'add-R': T('加反應物', '+ reactant'), 'add-P': T('加生成物', '+ product'), 'rem-R': T('移出反應物', '− reactant'), 'rem-P': T('移出生成物', '− product'),
        ArV: T('氬（定容）', 'Ar (fixed V)'), ArP: T('氬（定壓）', 'Ar (fixed P)'), cat: T('催化劑', 'catalyst') })[k] || k;
    }).join(T('、', ', '));
  }
  function refreshOutputs() {
    $('tempo').textContent = num(val(elT), 0) + ' K';
    $('volo').textContent = sigf(val(elV), 3) + ' mL';
    const P = pFromSlider();
    $('preso').textContent = (P >= 100 ? num(P, 0) : num(P, 2)) + ' bar';
  }
  function refreshAll() {
    refreshOutputs();
    updateReadouts();
    renderTable();
    updateGraphText();
    drawAll();
    if (view3 && view3.active) view3.frame();
  }
  function rxInfoHTML() {
    const rx = state.rx;
    if (rx === 'mys') return T(fH('A2') + ' ⇌ 2A：吸熱反應，ΔH° 未知（40～80 kJ/mol 之間），Δn = +1。A 是藍綠色的氣體，' + fH('A2') + ' 無色。',
      fH('A2') + ' ⇌ 2A: endothermic, ΔH° unknown (between 40 and 80 kJ/mol), Δn = +1. A is a blue-green gas; ' + fH('A2') + ' is colourless.');
    const th = E.thermo(rx, 298.15), d = E.dn(rx), dHs = (th.dH > 0 ? '+' : '') + num(th.dH, 1);
    const kind = th.dH > 0 ? T('吸熱', 'endothermic') : T('放熱', 'exothermic');
    const colour = { n2o4: T(fH('NO2') + ' 紅棕色、' + fH('N2O4') + ' 無色。', fH('NO2') + ' is red-brown; ' + fH('N2O4') + ' is colourless.'),
      haber: T('三種氣體都無色；工業上用鐵催化劑。', 'All three gases are colourless; industry uses an iron catalyst.'),
      hi: T(fH('I2') + ' 蒸氣是紫色，' + fH('H2') + ' 與 HI 無色。', fH('I2') + ' vapour is violet; ' + fH('H2') + ' and HI are colourless.') }[rx];
    return eqHTML(rx) + T('：ΔH°(298 K) = ' + dHs + ' kJ/mol（' + kind + '），Δn = ' + (d > 0 ? '+' : '') + num(d, 0) + '。', ': ΔH°(298 K) = ' + dHs + ' kJ/mol (' + kind + '), Δn = ' + (d > 0 ? '+' : '') + num(d, 0) + '. ') + colour;
  }
  function eqHTML(rx) {
    const r = E.RX[rx];
    const side = function (sg) {
      return r.sp.map(function (s, i) { return sg * r.nu[i] > 0 ? (Math.abs(r.nu[i]) > 1 ? Math.abs(r.nu[i]) : '') + fH(s) : null; }).filter(Boolean).join(' + ');
    };
    return side(-1) + ' ⇌ ' + side(1);
  }
  function buildAmounts() {
    const r = rxd();
    const box = $('amts');
    let h = '';
    r.sp.concat(['Ar']).forEach(function (s) {
      const c = s === 'Ar' ? col.sp.Ar : col.sp[s];
      h += '<div class="amt" data-sp="' + s + '"><span class="nm"><i style="background:' + c + '"></i><span>' + fH(s) + (s === 'Ar' ? T('（惰性）', ' (inert)') : '') + '</span></span><span class="v"></span>' +
        '<button type="button" data-d="-1" aria-label="' + T('移出 ', 'Remove ') + nm(s) + '">−</button><button type="button" data-d="1" aria-label="' + T('加入 ', 'Add ') + nm(s) + '">+</button></div>';
    });
    box.innerHTML = h;
    box.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () { amount(b.parentNode.dataset.sp, +b.dataset.d); });
    });
    $('amtHint').textContent = T('每按一次加入或移出 ' + sigf(r.step * 1000, 3) + ' mmol（氣體從針頭進出，溫度不變）。', 'Each press adds or removes ' + sigf(r.step * 1000, 3) + ' mmol (through the needle, at the same temperature).');
    $('rxInfo').innerHTML = rxInfoHTML();
  }
  function amount(sp, d) {
    const r = rxd(), step = r.step;
    const before = n[sp] || 0;
    let after = d > 0 ? Math.min(20 * step, before + step) : Math.max(0, before - step);
    if (after < step * 1e-6) after = 0;
    if (after === before) return;
    const trial = Object.assign({}, n); trial[sp] = after;
    if (sp !== 'Ar' && reactiveTotal(trial) <= 0) { setStatus(T('至少要留一些參與反應的氣體。', 'Keep at least some of the reacting gases.')); return; }
    n = trial;
    let kind;
    if (sp === 'Ar') kind = state.mode === 'V' ? 'ArV' : 'ArP';
    else kind = (d > 0 ? 'add-' : 'rem-') + (r.nu[r.sp.indexOf(sp)] < 0 ? 'R' : 'P');
    syncParts(false, sp);
    changed(kind, sp, d);
    updateLegend();
  }
  function updateLegend() {
    const sps = listSpecies();
    $('spLegend').innerHTML = sps.map(function (s) {
      const atoms = {};
      MOL[s].forEach(function (a) { atoms[a[0]] = 1; });
      return '<span><span class="sp" style="background:' + col.sp[s] + '"></span>' + fH(s) + '</span>';
    }).join('') + '<span>' + T('原子：', 'Atoms: ') + atomLegend() + '</span>' +
      '<span>' + T('每個分子代表 ', 'each molecule = ') + sigf(unit * 1000, 2) + ' mmol</span>';
  }
  function atomLegend() {
    const used = {};
    listSpecies().forEach(function (s) { MOL[s].forEach(function (a) { used[a[0]] = 1; }); });
    const nmA = { N: ['N 藍', 'N blue'], O: ['O 紅', 'O red'], H: ['H 淺灰', 'H light grey'], I: ['I 紫', 'I purple'], A: ['A 綠', 'A green'], Ar: ['Ar 灰', 'Ar grey'] };
    return Object.keys(used).map(function (a) { return T(nmA[a][0], nmA[a][1]); }).join(T('、', ', '));
  }
  function updateGraphText() {
    let leg = '', hint = '';
    if (state.tab === 'time') {
      const sps = rxd().sp.slice();
      if (hist.some(function (h) { return h.p.Ar > 0; })) sps.push('Ar');
      leg = sps.map(function (s) { return '<span><span class="ln' + (s === 'Ar' ? ' dash' : '') + '" style="background:' + col.sp[s] + ';color:' + col.sp[s] + '"></span>p<sub>' + fH(s) + '</sub></span>'; }).join('');
      hint = T('每一條虛線是一次改變。看改變的那一瞬間（濃度跳一下），再看之後慢慢的移動。', 'Each dashed line marks a change. Look at the jump at that instant, then at the slower shift afterwards.');
    } else if (state.tab === 'qk') {
      leg = '<span><span class="ln" style="background:' + col.pos + '"></span>' + T('反應商 Q', 'reaction quotient Q') + '</span><span><span class="ln dash" style="color:' + col.accent + '"></span>' + T('平衡常數 K', 'equilibrium constant K') + '</span>';
      hint = T('濃度、體積、惰性氣體只會讓 Q 跳開，K 不變；只有溫度會讓 K 跳開。之後 Q 都會回到 K。', 'Concentration, volume and inert gas only make Q jump; K stays. Only temperature moves K. Afterwards Q always returns to K.');
    } else {
      leg = isMys() ? '<span><span class="sp" style="background:' + col.pos + '"></span>' + T('你量到的平衡', 'your equilibria') + '</span>' :
        '<span><span class="ln dash" style="color:' + col.muted + '"></span>' + T('NIST 數據', 'NIST data') + '</span><span><span class="sp" style="background:' + col.pos + '"></span>' + T('你量到的平衡與擬合直線', 'your equilibria and fitted line') + '</span>';
      hint = isMys() ? T('點的 ln K 由紀錄表的分壓算出。斜率 = −ΔH°/R，R = 8.314 J/(mol·K)。', 'Each point’s ln K comes from the partial pressures in the table. Slope = −ΔH°/R, with R = 8.314 J/(mol·K).') :
        T('在幾個不同的溫度達到平衡，點會落在直線上；斜率 = −ΔH°/R。', 'Reach equilibrium at several temperatures: the points lie on a line with slope −ΔH°/R.');
    }
    $('gLegend').innerHTML = leg;
    $('gHint').textContent = hint;
  }

  // ======================= 未知反應 =======================
  function startMystery() {
    mys = { id: ++mysSeq, tries: 0, revealed: false, solved: false };
    E.newMystery();
    setMysUI();
    setRx('mys', true);
    $('mysOut').textContent = T('新的未知反應已裝進注射筒。在幾個溫度達到平衡，再用 ln K 對 1/T 的斜率求 ΔH°。', 'A new unknown reaction is in the syringe. Reach equilibrium at several temperatures, then find ΔH° from the slope of ln K against 1/T.');
    $('ansH').value = '';
  }
  function stopMystery() {
    mys = null;
    setMysUI();
    $('mysOut').textContent = '';
    setRx('n2o4');
  }
  function setMysUI() {
    $('mysBox').hidden = !mys;
    $('mysOn').hidden = !!mys;
    document.querySelectorAll('#rxSeg button').forEach(function (b) { b.disabled = !!mys; });
  }
  function parseNum(s) {
    s = String(s || '').normalize('NFKC').trim().replace(/[，,]/g, '.').replace(/[−–—]/g, '-');
    return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(s) ? parseFloat(s) : NaN;
  }
  function mysStats() {
    const rs = rows.filter(function (r) { return mys && r.mys === mys.id; });
    let lo = Infinity, hi = -Infinity;
    rs.forEach(function (r) { lo = Math.min(lo, r.T); hi = Math.max(hi, r.T); });
    return { nT: distinctT(rs), span: rs.length ? hi - lo : 0 };
  }
  function checkAnswer() {
    if (!mys) return;
    acted();
    const a = parseNum($('ansH').value);
    if (!isFinite(a)) { $('mysOut').textContent = T('請輸入一個數字（kJ/mol）。', 'Please enter a number (kJ/mol).'); return; }
    if (mys.tries >= 3 && !mys.solved) { $('mysOut').textContent = T('三次機會用完了：按「揭曉答案」或「換一個」。', 'No checks left: press “Reveal” or “Another one”.'); return; }
    mys.tries++;
    const truth = E.mysParams.dH, err = Math.abs(a - truth) / truth;
    const st = mysStats();
    const ok = err <= 0.1;
    if (ok) mys.solved = true;
    $('mysOut').innerHTML = (ok ? '<span class="ok">' + T('很接近！', 'Close!') + '</span> ' : '<span class="no">' + T('還差一些。', 'Not yet.') + '</span> ') +
      T('相對誤差 ' + num(100 * err, 1) + '%（用了 ' + st.nT + ' 個溫度）。', 'Relative error ' + num(100 * err, 1) + '% (from ' + st.nT + ' temperatures).') +
      (ok ? '' : T(a > truth ? '你的答案偏大。' : '你的答案偏小。', a > truth ? ' Your answer is too large.' : ' Your answer is too small.')) +
      T('（剩 ' + Math.max(0, 3 - mys.tries) + ' 次）', ' (' + Math.max(0, 3 - mys.tries) + ' checks left)');
    if (window.LabSound && window.LabSound.enabled()) {
      if (ok) { window.LabSound.tone({ freq: 880, dur: 0.12, gain: 0.2 }); window.LabSound.tone({ freq: 1320, dur: 0.16, gain: 0.16, delay: 0.1 }); }
      else window.LabSound.tone({ freq: 300, dur: 0.15, type: 'triangle', gain: 0.12 });
    }
    if (window.LabMission) window.LabMission.emit('answer', { ans: a, err: err, nT: st.nT, span: st.span, tries: mys.tries, revealed: mys.revealed });
  }
  function reveal() {
    if (!mys) return;
    acted();
    mys.revealed = true;
    $('mysOut').innerHTML = T('答案：ΔH° = ' + num(E.mysParams.dH, 1) + ' kJ/mol，ΔS° = ' + num(E.mysParams.dS, 1) + ' J/(mol·K)。這個反應已揭曉，換一個再挑戰。',
      'Answer: ΔH° = ' + num(E.mysParams.dH, 1) + ' kJ/mol, ΔS° = ' + num(E.mysParams.dS, 1) + ' J/(mol·K). This one is revealed; try another.');
  }

  // ======================= 3D 檢視 =======================
  let threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
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
      T: T, host: host3,
      parts: function () { return parts; },
      flashes: function () { return flashes; }, FL_DUR: FL_DUR,
      MOL: MOL, ATOM_R: ATOM_R,
      colors: function () { return col; },
      gasFrac: gasFrac,
      tint: gasTint,
      tempColor: function () { return tempColor(state.T); },
      hud: function () {
        const pr = E.props(state.rx, n, opts());
        return { tl: 't = ' + sigf(simT, 3) + ' s' + (waiting ? T('（先預測）', ' (predict first)') : !state.running ? T('（已暫停）', ' (paused)') : ''),
          tr: 'T = ' + num(state.T, 0) + ' K · P = ' + sigf(pr.P, 3) + ' bar · V = ' + sigf(pr.V * 1000, 3) + ' mL', tcol: tempColor(state.T) };
      },
      running: function () { return state.running; },
      contextLost: function () {
        setView('2d');
        viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
      }
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
      if (!webglAvailable() || !window.Eq3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        state.view = '3d';
        view3 = window.Eq3D.create(lib, host3Api());
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        view3.frame();
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

  // ======================= 操作 =======================
  function setTab(t) {
    state.tab = t;
    document.querySelectorAll('#tabs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === t)); });
    updateGraphText();
    drawGraph();
  }
  function setSpeed(i) {
    state.speed = i;
    [0, 1, 2].forEach(function (k) { $('sp' + k).setAttribute('aria-pressed', String(k === i)); });
  }
  function setRunning(on) {
    state.running = on;
    $('play').textContent = on ? T('暫停', 'Pause') : T('播放', 'Play');
    setStatus('');
    if (on) startLoop(); else { drawAll(); if (view3 && view3.active) view3.frame(); }
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function onSlider(el) {
    if (syncing) return;
    if (el === elT) {
      const v = val(elT);
      if (v === state.T) { refreshOutputs(); return; }
      const k = v > state.T ? 'T+' : 'T-';
      state.T = v;
      changed(k);
    } else if (el === elV) {
      const v = val(elV);
      if (v === state.V) { refreshOutputs(); return; }
      const k = v < state.V ? 'V-' : 'V+';
      state.V = v;
      changed(k);
    } else if (el === elP) {
      const v = pFromSlider();
      if (v === state.P) { refreshOutputs(); return; }
      const k = v > state.P ? 'V-' : 'V+';
      state.P = v;
      changed(k);
    }
  }
  [elT, elV, elP].forEach(function (el) { el.addEventListener('input', function () { onSlider(el); }); });
  elCat.addEventListener('change', function () {
    state.cat = elCat.checked;
    changed('cat');
    setStatus(state.cat ? T('加入催化劑：正、逆反應都變快，平衡的位置不變。', 'Catalyst added: both directions speed up; the equilibrium position does not change.') : T('移除催化劑。', 'Catalyst removed.'));
  });
  elPred.addEventListener('change', function () {
    acted();
    state.predMode = elPred.checked;
    if (!state.predMode) cancelPredict();
    $('predOut').textContent = state.predMode ? T('預測模式已開啟：在平衡時改變一個條件試試。', 'Prediction mode is on: change one condition while at equilibrium.') :
      T('預測模式已關閉。', 'Prediction mode is off.');
    refreshAll();
  });
  document.querySelectorAll('#predBox [data-pred]').forEach(function (b) { b.addEventListener('click', function () { answerPredict(+b.dataset.pred); }); });
  document.querySelectorAll('#rxSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); if (b.dataset.rx !== state.rx) setRx(b.dataset.rx); }); });
  document.querySelectorAll('#modeSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); setMode(b.dataset.mode); }); });
  $('play').addEventListener('click', function () { acted(); setRunning(!state.running); });
  $('fromR').addEventListener('click', function () { acted(); startFrom('R'); if (!state.running) setRunning(true); });
  $('fromP').addEventListener('click', function () { acted(); startFrom('P'); if (!state.running) setRunning(true); });
  $('clearAll').addEventListener('click', function () {
    acted();
    rows = []; hist = []; events = [];
    segId++;
    pending = true; settledFor = 0; changes = [];
    streak = 0; streakKinds = {}; streakZero = false; predTotal = 0; predOk = 0;
    cancelPredict();
    $('predOut').textContent = T('已清除圖表、平衡紀錄與預測紀錄。', 'The graph, the table of equilibria and the prediction record have been cleared.');
    pushSample();
    refreshAll();
  });
  [0, 1, 2].forEach(function (k) { $('sp' + k).addEventListener('click', function () { acted(); setSpeed(k); }); });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
    if (ev.detail && ev.detail.name === 'fs') resize();
  });
  document.querySelectorAll('#tabs button').forEach(function (b) { b.addEventListener('click', function () { acted(); setTab(b.dataset.tab); }); });
  $('mysOn').addEventListener('click', function () { acted(); startMystery(); });
  $('mysOff').addEventListener('click', function () { acted(); stopMystery(); });
  $('mysNew').addEventListener('click', function () { acted(); startMystery(); });
  $('check').addEventListener('click', checkAnswer);
  $('ansH').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); checkAnswer(); } });
  $('reveal').addEventListener('click', reveal);
  $('view2d').addEventListener('click', function () { acted(); setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // 拖曳活塞（定容時）
  let drag = null;
  function canvasXY(ev) { const b = cv.getBoundingClientRect(); return [ev.clientX - b.left, ev.clientY - b.top]; }
  function onPiston(x, y) {
    const px = pistonX();
    return G && Math.abs(y - G.yc) < G.Hb / 2 + G.jw && x > px - 22 && x < px + G.L;
  }
  cv.addEventListener('pointerdown', function (ev) {
    const p = canvasXY(ev);
    if (!onPiston(p[0], p[1])) return;
    if (state.mode === 'P') { setStatus(T('定壓模式：活塞由外界壓力決定，請改用「外界壓力」滑桿，或切換到定容。', 'Fixed-pressure mode: the piston follows the outside pressure. Use the pressure slider, or switch to fixed volume.')); return; }
    drag = { dx: p[0] - pistonX() };
    cv.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  cv.addEventListener('pointermove', function (ev) {
    const p = canvasXY(ev);
    if (!drag) { cv.style.cursor = onPiston(p[0], p[1]) && state.mode === 'V' ? 'ew-resize' : ''; return; }
    const Vr = rxd().Vr;
    const V = Math.max(Vr[0], Math.min(Vr[1], (p[0] - drag.dx - G.bx0) / G.L * Vr[1]));
    setVal(elV, Math.round(V * 10) / 10);
  });
  function endDrag() { drag = null; }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('注射筒畫面。按 Enter 切換活塞或水浴，方向鍵改變體積（或壓力）與溫度，Shift 加方向鍵改變得更多。', 'Syringe. Press Enter to pick the piston or the water bath; the arrow keys change the volume (or pressure) and the temperature; hold Shift for bigger steps.'),
      items: [
        { name: function () { return T('活塞', 'Piston'); },
          move: function (dx, dy, big) {
            const d = dx || -dy;
            if (!d) return false;
            if (state.mode === 'V') { const Vr = rxd().Vr, st = Vr[1] / 100 * (big ? 5 : 1); setVal(elV, Math.max(Vr[0], Math.min(Vr[1], state.V + d * st))); }
            else { const Pr = rxd().Pr, f = Math.pow(Pr[1] / Pr[0], (big ? 0.05 : 0.01) * -d); setVal(elP, Math.max(Pr[0], Math.min(Pr[1], state.P * f))); }
            return true;
          },
          describe: function () { const pr = E.props(state.rx, n, opts()); return 'V = ' + sigf(pr.V * 1000, 3) + ' mL, P = ' + sigf(pr.P, 3) + ' bar'; } },
        { name: function () { return T('水浴溫度', 'Water-bath temperature'); },
          move: function (dx, dy, big) {
            const d = dy || dx;
            if (!d) return false;
            const r = rxd();
            setVal(elT, Math.max(r.Tmin, Math.min(r.Tmax, state.T + d * (big ? 10 : 1))));
            return true;
          },
          describe: function () { return 'T = ' + num(state.T, 0) + ' K'; } }
      ],
      onChange: function () { drawAll(); }
    });
  }

  function buildRxTable() {
    const el = $('rxTable');
    if (!el) return;
    const temps = { n2o4: [273, 298, 373], haber: [500, 700, 900], hi: [500, 700, 800] };
    let h = '<thead><tr><th>' + T('反應', 'Reaction') + '</th><th>ΔH°(298 K)<br><small>kJ/mol</small></th><th>ΔS°(298 K)<br><small>J/(mol·K)</small></th><th>Δn</th><th>K<sub>p</sub></th></tr></thead><tbody>';
    ['n2o4', 'haber', 'hi'].forEach(function (rx) {
      const th = E.thermo(rx, 298.15), d = E.dn(rx);
      h += '<tr><td>' + eqHTML(rx) + '</td><td>' + num(th.dH, 1) + '</td><td>' + num(th.dS, 1) + '</td><td>' + (d > 0 ? '+' : '') + num(d, 0) + '</td><td>' +
        temps[rx].map(function (Tk) { return Tk + ' K' + T('：', ': ') + sciHTML(E.K(rx, Tk), 3); }).join('<br>') + '</td></tr>';
    });
    el.innerHTML = h + '</tbody>';
    el.querySelectorAll('td').forEach(function (td) { td.style.textAlign = td.cellIndex === 0 ? 'left' : 'right'; });
  }

  function themeChanged() {
    if (LD.refresh) LD.refresh();
    readColors();
    buildAmounts();
    updateLegend();
    updateGraphText();
    updateReadouts();
    if (view3 && view3.active) view3.onTheme();
    drawAll();
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lg = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', resize);
  // 暫停時仍讓分子慢慢晃、閃光淡出（低頻重畫）
  setInterval(function () {
    if (state.running) return;
    moveParts(0.1);
    drawStage();
    if (view3 && view3.active) view3.frame();
  }, 120);

  // 測試用（Playwright）：讀取目前狀態
  window.__eq = {
    state: state, n: function () { return n; }, rows: function () { return rows; }, opts: opts, pending: function () { return pending; },
    waiting: function () { return waiting; }, mys: function () { return mys; }, parts: function () { return parts.length; }
  };

  // ======================= 啟動 =======================
  readColors();
  buildRxTable();
  setRx('n2o4');
  updateSoundButton();
  setRunning(state.running);
  resize();
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：按「播放」開始。', 'Reduced motion is on: press “Play” to start.'));
})();
