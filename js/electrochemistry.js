/*
 * electrochemistry.js — 「化學電池與電解」的頁面程式（燒杯畫面、操作、圖表、紀錄表、未知金屬、任務事件）
 * 化學核心在 js/electrochemistry-core.js（ElecCore；體積單位是公升、電量是庫侖）。
 * 畫面上的離子、電子與氣泡只是示意：數目依濃度、電流的比例畫出；電壓、電流、質量與物質的量都直接來自核心的計算。
 *
 * 任務事件（只在使用者操作過之後送出）：
 *   'tick'：每 0.5 秒 { mode（'cell'／'elec'）, running,
 *            cell: { L/R: { metal, c, c0, m, m0 }, bridge, load（'V'／'R'）, Rload, E（伏特計讀數：沒有鹽橋為 0）, emf（電池電位）,
 *                    E0（這組半電池剛放好時的電池電位）, I（A）, q, qAbs（C）, t（s）, unk（左邊是未知電極）},
 *            elec: { elec（'C'／'Cu'）, metal, unk, c, c0, V（L）, I, q, t, dep（陰極析出 g）, mCath, mAnode, base, H2, O2（mL）, off（定時關閉）, paused } }
 *   'record'：化學電池按「記錄這一筆」{ pair（'Zn|Cu'）, count（同一段實驗同一組金屬的筆數）, span（log Q 的跨度）, slope, theory（−0.05916/n）, unk }
 *   'answerE'：未知電極按「核對答案」{ ans, err（V）, tries, revealed }
 *   'answerM'：未知金屬按「核對答案」{ ans, err（相對誤差）, tries, revealed }
 */
(function () {
  'use strict';
  const C = window.ElecCore, LD = window.LabDraw;
  if (!C || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reducedMotion = LD.reducedMotion();
  const M = C.METALS;
  const REAL = ['Mg', 'Zn', 'Fe', 'Ni', 'Sn', 'Pb', 'Cu', 'Ag'];
  const NAME = {
    Mg: ['鎂', 'magnesium'], Zn: ['鋅', 'zinc'], Fe: ['鐵', 'iron'], Ni: ['鎳', 'nickel'], Sn: ['錫', 'tin'], Pb: ['鉛', 'lead'],
    Cu: ['銅', 'copper'], Ag: ['銀', 'silver'], X: ['未知金屬 X', 'unknown metal X']
  };
  function nm(k) { return T(NAME[k][0], NAME[k][1]); }
  // 金屬電極的顏色（畫面用）
  const METAL_COL = { Mg: '#c9ccd1', Zn: '#a9b4bf', Fe: '#7d8590', Ni: '#b8b39a', Sn: '#c2c7cc', Pb: '#6f7782', Cu: '#c8743c', Ag: '#d9dde2', X: '#9a8fb0', C: '#4a4f57' };
  const E_COL = '#f2c230';     // 電子
  const LCD_BG = '#17201f', LCD_FG = '#8ef0c4';

  // ======================= 數字格式 =======================
  function num(x, d) {
    if (x == null || !isFinite(x)) return '—';
    const s = (+x).toFixed(d == null ? 0 : d);
    return s.charAt(0) === '-' ? (/^-0(\.0*)?$/.test(s) ? s.slice(1) : '−' + s.slice(1)) : s;
  }
  function sciParts(x, sig) {
    if (x == null || !isFinite(x) || x === 0) return { m: x === 0 ? '0' : '—', e: null };
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= -3 && e < 5) return { m: sigf(x, sig), e: null };
    const m = x / Math.pow(10, e);
    if (Math.abs(+m.toFixed((sig || 3) - 1)) >= 10) return sciParts(Math.sign(x) * Math.pow(10, e + 1), sig); // 尾數四捨五入成 10.0（例如 9999.6）：就是下一個次方。以前用 x × (1 + 1e-12) 重算，次方不變，會無限遞迴（11/13 總檢查抓到）
    return { m: num(m, (sig || 3) - 1), e: e };
  }
  function sciHTML(x, sig) { const p = sciParts(x, sig); return p.e == null ? p.m : p.m + ' × 10<sup>' + num(p.e, 0) + '</sup>'; }
  function sigf(x, sig) {
    if (x == null || !isFinite(x)) return '—';
    if (x === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(x)));
    return num(x, Math.max(0, Math.min(6, (sig || 3) - 1 - e)));
  }
  function signed(x, d) { return (x > 0 ? '+' : '') + num(x, d); }
  /** 離子 → HTML（Zn<sup>2+</sup>） */
  function ionH(k) { const z = M[k].z; return (k === 'X' ? 'X' : k) + '<sup>' + (z === 1 ? '+' : z + '+') + '</sup>'; }
  /** 離子 → 畫布用的 parts */
  function ionP(k) { const z = M[k].z; return [[k, 0], [z === 1 ? '+' : z + '+', 1]]; }
  /** 化學式 → HTML（數字下標） */
  function fH(s) { return s.replace(/([A-Za-z\)])(\d+)/g, '$1<sub>$2</sub>'); }
  function concTxt(c) { return c >= 0.0995 ? num(c, 2) : c >= 0.00995 ? num(c, 3) : sigf(c, 3); }
  function timeTxt(t) {
    if (t < 600) return num(t, t < 10 ? 2 : t < 100 ? 1 : 0) + ' s';
    if (t < 36000) return num(t / 60, 1) + ' min';
    if (t < 86400 * 3) return num(t / 3600, 2) + ' h';
    return num(t / 86400, 1) + ' d';
  }

  // ======================= 顏色 =======================
  let col = {};
  function readColors() {
    const c = LD.c, dk = LD.dark;
    col = {
      text: c.text, muted: c.muted, border: c.border, accent: c.accent, bg: c['canvas-bg'], surface: c.surface,
      pos: c.pos || '#d1453b', neg: c.neg || '#2f6fd0', probe: c.probe || '#0d7f57', dark: dk,
      water: dk ? '#4f7f9a' : '#9cc6dd', glass: dk ? '#a9c3cf' : '#7d97a5',
      K: dk ? '#b190ff' : '#7a4fd0', NO3: dk ? '#ffa860' : '#d0731f', H: dk ? '#ff8f8f' : '#d64545',
      ion: function (k) { const cc = M[k] && M[k].col; return cc ? (dk ? LD.mix(cc, '#ffffff', 0.25) : cc) : (dk ? '#c3cad3' : '#6f7a86'); }
    };
  }

  // ======================= 狀態 =======================
  const SPEEDS = [1, 100, 1e4, 1e6];
  const state = { mode: 'cell', running: !reducedMotion, speed: 1, tab: 'time', L: 'Zn', R: 'Cu', elec: 'C' };
  let cell = null, elx = null, elecOff = false;
  let histC = [], histE = [], rowsC = [], rowsE = [], segId = 0, rowSeq = 0;
  let unkC = null, unkE = null, unkSeq = 0;
  let userActed = false, syncing = false;
  let lastDepTick = 0, flowing = false;

  const cv = $('cv'), ctx = cv.getContext('2d');
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  const elCL = $('cL'), elCR = $('cR'), elVol = $('vol'), elBridge = $('bridge'), elR = $('rload');
  const elCE = $('cE'), elVE = $('volE'), elAmp = $('amp'), elTimer = $('timer');
  const statusEl = $('status');
  function val(el) { return window.LabNum ? window.LabNum.value(el) : +el.value; }
  function setVal(el, v) { syncing = true; if (window.LabNum) window.LabNum.set(el, v); else el.value = v; syncing = false; }
  const logMap = function (lo, hi) {
    return {
      toValue: function (pos) { return lo * Math.pow(hi / lo, pos / 1000); },
      toPos: function (v) { return 1000 * Math.log(v / lo) / Math.log(hi / lo); }
    };
  };
  if (window.LabNum) {
    [elCL, elCR].forEach(function (el) { window.LabNum.register(el, Object.assign(logMap(0.001, 2), { decimals: 4 })); });
    window.LabNum.register(elR, Object.assign(logMap(1, 1000), { decimals: 1 }));
  }

  function metalL() { return unkC ? 'X' : state.L; }
  function freshHalf(metal, c) { return { metal: metal, c: c, V: val(elVol) / 1000, m: 10, m0: 10, c0: c }; }
  function newCell() {
    cell = C.createCell({ L: { metal: metalL(), c: val(elCL), V: val(elVol) / 1000 }, R: { metal: state.R, c: val(elCR), V: val(elVol) / 1000 },
      bridge: elBridge.checked, load: loadMode(), Rload: val(elR) });
    cell.E0 = C.emf(cell.L, cell.R);
    flowing = false;
    histC = [];
    resetIons();
  }
  function resetHalf(side) {
    const h = side === 'L' ? freshHalf(metalL(), val(elCL)) : freshHalf(state.R, val(elCR));
    cell[side] = h;
    cell.E0 = C.emf(cell.L, cell.R);
    cell.q = 0; cell.qAbs = 0; cell.t = 0;
    flowing = false;
    histC = [];
    resetIons(side);
  }
  function elecMetal() { return unkE ? unkE.metal : 'Cu'; }
  function newElectro() {
    elx = C.createElectro({ metal: elecMetal(), c: val(elCE), V: val(elVE) / 1000, elec: unkE ? 'C' : state.elec, I: val(elAmp) });
    elecOff = timerOn() && elx.t >= val(elTimer);
    lastDepTick = 0;
    bubbles.length = 0;
    histE = [];
    resetIons();
  }
  function loadMode() { const b = document.querySelector('#loadSeg button[aria-pressed="true"]'); return b ? b.dataset.load : 'V'; }
  function timerOn() { return val(elTimer) > 0; }
  function emfNow() { return C.emf(cell.L, cell.R); }
  function reading() { return cell.bridge ? emfNow() : 0; }
  function curNow() { return C.current(cell); }

  // ======================= 主迴圈 =======================
  let raf = 0, lastTs = 0, lastSample = 0, lastRead = 0, lastIon = 0;
  function startLoop() { if (!raf) { lastTs = 0; raf = requestAnimationFrame(loop); } }
  function loop(ts) {
    raf = 0;
    if (!state.running) return;
    const dtw = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (dtw > 0) advance(dtw);
    drawStage();
    raf = requestAnimationFrame(loop);
  }
  function advance(dtw) {
    const now = performance.now();
    const dt = dtw * SPEEDS[state.speed];
    if (state.mode === 'cell') {
      const I0 = curNow();
      C.stepCell(cell, dt);
      const I1 = curNow();
      if (Math.abs(I0) > 1e-9) flowing = true;
      if (flowing && Math.abs(I1) < 1e-9) {
        flowing = false;
        setStatus(T('電流停了：電池已經放完電（陽極的金屬或陰極的離子用完了）。按「重新開始」換新的電池。', 'The current has stopped: the cell is flat (the anode metal or the cathode ions have run out). Press “Restart” for a fresh cell.'));
        if (snd()) window.LabSound.sweep({ from: 660, to: 330, dur: 0.4, gain: 0.08, type: 'triangle' });
      }
    } else {
      let d = dt;
      if (!elecOff && timerOn()) d = Math.max(0, Math.min(d, val(elTimer) - elx.t));
      if (!elecOff) {
        const was = elx.spent;
        C.stepElectro(elx, d);
        if (timerOn() && elx.t >= val(elTimer) - 1e-9) {
          elx.t = val(elTimer);
          elecOff = true;
          setStatus(T('時間到：電源已自動關閉。可以記錄這一筆，或把時間調長再繼續。', 'Time is up: the power supply has switched off. Record this reading, or set a longer time to carry on.'));
          if (snd()) { window.LabSound.tone({ freq: 988, dur: 0.12, gain: 0.1 }); window.LabSound.tone({ freq: 659, dur: 0.2, gain: 0.1, delay: 0.13 }); }
        }
        if (elx.spent && !was) {
          setStatus(T('陽極的銅已經完全溶解，電路斷了。按「重新開始」換新的電極。', 'The copper anode has dissolved completely and the circuit is broken. Press “Restart” for fresh electrodes.'));
          if (snd()) window.LabSound.sweep({ from: 660, to: 330, dur: 0.4, gain: 0.08, type: 'triangle' });
        }
        const k = Math.floor(elx.dep / 0.1 + 1e-9);
        if (k > lastDepTick) { lastDepTick = k; if (snd()) window.LabSound.tone({ freq: 740, dur: 0.06, gain: 0.06, type: 'sine' }); }
      }
    }
    animate(dtw);
    if (now - lastIon > 90) { lastIon = now; syncIons(); }
    if (now - lastSample > 100) { lastSample = now; pushSample(); }
    if (now - lastRead > 250) { lastRead = now; updateReadouts(); if (state.tab !== 'nernst') drawGraph(); }
  }
  function snd() { return window.LabSound && window.LabSound.enabled(); }
  function pushSample() {
    if (state.mode === 'cell') {
      const s = { t: cell.t, E: reading(), I: curNow() * 1000 };
      const last = histC[histC.length - 1];
      if (last && last.t === s.t && last.E === s.E && last.I === s.I) return;
      histC.push(s);
      if (histC.length > 800) histC.splice(0, histC.length - 800);
    } else {
      const s = { t: elx.t, q: elx.q, dep: elx.dep, c: elx.c };
      const last = histE[histE.length - 1];
      if (last && last.t === s.t && last.q === s.q) return;
      histE.push(s);
      if (histE.length > 800) histE.splice(0, histE.length - 800);
    }
  }

  // ======================= 示意粒子 =======================
  // 溶液中的陽離子：每個燒杯一組 { u, v（0–1，液體內的相對位置）, vu, vv }
  const ions = { L: [], R: [], E: [], H: [] };
  const flashes = [];   // { x, y, t0, color }
  const bubbles = [];   // { x, y, r, vy, side }
  const bridgeIons = [];
  let ePhase = 0, bubbleAcc = { a: 0, c: 0 };
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function ionTarget(c) { return c < 1e-6 ? 0 : Math.max(1, Math.round(Math.min(2, c) / 2 * 32)); }
  function resetIons(side) {
    if (!side || side === 'L') ions.L = [];
    if (!side || side === 'R') ions.R = [];
    if (!side) { ions.E = []; ions.H = []; }
    syncIons(true);
  }
  function newIon(atU) { return { u: atU == null ? rnd(0.06, 0.94) : atU, v: rnd(0.08, 0.95), vu: rnd(-0.15, 0.15), vv: rnd(-0.15, 0.15) }; }
  /** 讓燒杯中的離子數跟上濃度：陽極那杯的新離子從電極長出來，陰極那杯多出來的離子在電極上消失（還原） */
  function syncIonList(list, target, elU, role, geo) {
    while (list.length < target) list.push(newIon(role === 'anode' ? elU + rnd(-0.03, 0.03) : null));
    while (list.length > target) {
      let idx = Math.floor(Math.random() * list.length);
      if (role === 'cathode') {
        let best = Infinity;
        list.forEach(function (p, i) { const d = Math.abs(p.u - elU) + Math.random() * 0.15; if (d < best) { best = d; idx = i; } });
        if (geo) addFlash(geo(list[idx]), colIonFor(role));
      }
      list.splice(idx, 1);
    }
  }
  let ionColorTmp = null;
  function colIonFor() { return ionColorTmp || col.muted; }
  function addFlash(p, color) {
    if (!p) return;
    flashes.push({ x: p[0], y: p[1], t0: performance.now(), color: color });
    if (flashes.length > 40) flashes.shift();
  }
  function syncIons(fresh) {
    if (!G) return;
    const I = state.mode === 'cell' ? curNow() : (elecOff || elx.spent ? 0 : elx.I);
    if (state.mode === 'cell') {
      ['L', 'R'].forEach(function (side) {
        const h = cell[side];
        const role = fresh || Math.abs(I) < 1e-9 ? '' : ((I > 0) === (side === 'L') ? 'anode' : 'cathode');
        ionColorTmp = col.ion(h.metal);
        const bk = G.bk[side];
        syncIonList(ions[side], ionTarget(h.c), bk.elU, role, function (p) { return [bk.x0 + bk.w * bk.elU, liqY(bk, h.V) + p.v * (bk.bot - liqY(bk, h.V))]; });
      });
    } else {
      const bk = G.bk.E;
      ionColorTmp = col.ion(unkE ? 'X' : 'Cu');
      const role = fresh || I <= 0 ? '' : 'cathode';
      syncIonList(ions.E, ionTarget(elx.c), bk.catU, role, function (p) { return [bk.x0 + bk.w * bk.catU, liqY(bk, elx.V) + p.v * (bk.bot - liqY(bk, elx.V))]; });
      const hTarget = Math.round(Math.min(1, C.hplus(elx) / 1) * 24);
      while (ions.H.length < hTarget) ions.H.push(newIon(fresh ? null : bk.anU + rnd(-0.03, 0.03)));
      while (ions.H.length > hTarget) ions.H.pop();
    }
    ionColorTmp = null;
  }
  /** drift：{ to（電極的 u）, k（> 0 靠近、< 0 遠離）} */
  function moveIon(p, dtw, drift) {
    p.vu += rnd(-1, 1) * 0.9 * dtw; p.vv += rnd(-1, 1) * 0.9 * dtw;
    p.vu *= 0.96; p.vv *= 0.96;
    let du = 0;
    if (drift) { const d = drift.to - p.u; du = drift.k > 0 ? drift.k * Math.sign(d) * Math.min(1, Math.abs(d) / 0.08) : drift.k * Math.sign(d || 1) * Math.max(0, 1 - Math.abs(d) / 0.5); }
    p.u += (p.vu + du) * dtw * 0.35; p.v += p.vv * dtw * 0.35;
    if (p.u < 0.05) { p.u = 0.05; p.vu = Math.abs(p.vu); }
    if (p.u > 0.95) { p.u = 0.95; p.vu = -Math.abs(p.vu); }
    if (p.v < 0.06) { p.v = 0.06; p.vv = Math.abs(p.vv); }
    if (p.v > 0.95) { p.v = 0.95; p.vv = -Math.abs(p.vv); }
  }
  function animate(dtw) {
    if (!G) return;
    if (state.mode === 'cell') {
      const I = curNow();
      ['L', 'R'].forEach(function (side) {
        const bk = G.bk[side];
        let drift = null;
        if (Math.abs(I) > 1e-9) {
          const cathode = (I > 0) === (side === 'R');
          drift = { to: bk.elU, k: cathode ? 0.3 : -0.15 };
        }
        ions[side].forEach(function (p) { moveIon(p, dtw, drift); });
      });
      // 鹽橋中的離子：K⁺ 往陰極、NO3⁻ 往陽極
      const v = Math.abs(I) > 1e-9 && cell.bridge ? 0.12 * Math.sign(I) * (0.4 + 0.6 * Math.min(1, Math.abs(I) / 0.1)) : 0;
      bridgeIons.forEach(function (b) {
        b.s += (b.k === 'K' ? v : -v) * dtw + rnd(-1, 1) * 0.02 * dtw;
        if (b.s > 1) b.s -= 1; if (b.s < 0) b.s += 1;
        b.j += rnd(-1, 1) * dtw; b.j = Math.max(-1, Math.min(1, b.j));
      });
      ePhase += dtw * (Math.abs(I) > 1e-9 ? 40 + 80 * Math.min(1, Math.abs(I) / 0.15) : 0) * Math.sign(I);
    } else {
      const bk = G.bk.E;
      const on = !elecOff && !elx.spent && elx.I > 0;
      ions.E.forEach(function (p) { moveIon(p, dtw, on ? { to: bk.catU, k: 0.3 } : null); });
      ions.H.forEach(function (p) { moveIon(p, dtw, on ? { to: bk.anU, k: -0.2 } : null); });
      ePhase += dtw * (on ? 40 + 80 * Math.min(1, elx.I / 1.5) : 0);
      // 氣泡
      if (on) {
        const eff = C.cathodeEff(elx.c);
        if (elx.elec === 'C') bubbleAcc.a += dtw * 30 * Math.min(1, elx.I);
        bubbleAcc.c += dtw * 30 * Math.min(1, elx.I) * (1 - eff);
        while (bubbleAcc.a >= 1) { bubbleAcc.a -= 1; spawnBubble('a'); }
        while (bubbleAcc.c >= 1) { bubbleAcc.c -= 1; spawnBubble('c'); }
      }
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.vy = Math.min(b.vy + 120 * dtw, 90 + b.r * 6);
      b.y -= b.vy * dtw; b.x += Math.sin((b.y + b.ph) * 0.08) * 0.3;
      if (b.y < b.top) bubbles.splice(i, 1);
    }
  }
  function spawnBubble(side) {
    const bk = G.bk.E, top = liqY(bk, elx.V);
    const x = bk.x0 + bk.w * (side === 'a' ? bk.anU : bk.catU), w = side === 'a' ? G.elw.an : G.elw.cat;
    const y = rnd(top + 14, bk.bot - 16);
    bubbles.push({ x: x + (Math.random() < 0.5 ? -1 : 1) * (w / 2 + rnd(1, 4)), y: y, r: side === 'a' ? rnd(1.6, 3) : rnd(2, 3.6), vy: 0, top: top + 2, ph: rnd(0, 50), side: side });
    if (bubbles.length > 120) bubbles.shift();
  }
  function initBridgeIons() {
    bridgeIons.length = 0;
    for (let k = 0; k < 16; k++) bridgeIons.push({ k: k % 2 ? 'K' : 'N', s: (k + 0.5) / 16, j: rnd(-1, 1) });
  }
  initBridgeIons();

  // ======================= 版面 =======================
  let cw = 0, ch = 0, dpr = 1, G = null;
  function fsz(px) { return px * (window.LabSettings && window.LabSettings.get('fs') || 1); }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = w;
    ch = w < 560 ? Math.round(Math.max(360, w * 1.02)) : 420;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    layout();
    resizeGraph();
    syncIons(true);
    drawStage(); drawGraph();
  }
  function layout() {
    const narrow = cw < 560;
    const pad = narrow ? 10 : 16;
    const labH = fsz(13) * 1.5 + 14;
    const bot = ch - pad - labH;
    const mh = Math.max(46, fsz(13) * 3.4), mw = Math.min(narrow ? 150 : 180, cw * 0.42);
    const my = pad + mh / 2;
    const bh = Math.min(ch * (narrow ? 0.48 : 0.52), 240);
    const top = bot - bh;
    const bw = Math.min(cw * 0.36, 230);
    const mk = function (cx, w, elU) { return { cx: cx, x0: cx - w / 2, w: w, top: top, bot: bot, elU: elU }; };
    const ew = Math.min(cw * 0.72, 380);
    G = {
      narrow: narrow, pad: pad, bot: bot, top: top, bh: bh, mw: mw, mh: mh, my: my, yE: top - Math.max(22, bh * 0.16),
      bk: {
        L: mk(cw * 0.25, bw, 0.32), R: mk(cw * 0.75, bw, 0.68),
        E: Object.assign(mk(cw / 2, ew, 0.5), { anU: 0.2, catU: 0.8 })
      },
      elw: { an: 14, cat: 14 }
    };
  }
  /** 液面的 y（V：公升） */
  function liqY(bk, V) { const f = 0.28 + 0.6 * Math.min(1, V / (bk === G.bk.E ? 0.5 : 0.25)); return bk.bot - 8 - (bk.bot - bk.top - 14) * f; }

  // ======================= 畫圖工具 =======================
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
  function richW(g, ps, size, weight) {
    size = size || fsz(12);
    let w = 0;
    ps.forEach(function (p) { g.font = (weight || '') + ' ' + (p[1] ? (size * 0.72).toFixed(1) : size) + 'px ' + LD.FONT; w += g.measureText(p[0]).width; });
    return w;
  }
  /** 有底框的化學式標籤（y 為文字基線） */
  function richPill(g, ps, x, y, color, size, align, weight) {
    size = size || fsz(12);
    const w = richW(g, ps, size, weight), h = size * 1.45;
    const bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    g.save();
    g.fillStyle = LD.alpha(col.surface, col.dark ? 0.88 : 0.92);
    g.strokeStyle = LD.alpha(color, 0.45);
    g.lineWidth = 1;
    LD.roundRect(g, bx - 6, y - size * 1.02, w + 12, h, 6);
    g.fill(); g.stroke();
    g.restore();
    rich(g, ps, bx, y, color, size, 'left', weight);
    return w + 12;
  }
  function rr(g, x, y, w, h, r) { LD.roundRect(g, x, y, w, h, r); }

  /** 燒杯：玻璃、溶液（帶顏色）、刻度 */
  function beakerBack(g, bk, V, tint) {
    const ly = liqY(bk, V);
    g.save();
    // 陰影
    const sh = g.createRadialGradient(bk.cx, bk.bot + 4, 2, bk.cx, bk.bot + 4, bk.w * 0.6);
    sh.addColorStop(0, LD.shadowInk(0.22)); sh.addColorStop(1, LD.shadowInk(0));
    g.fillStyle = sh; g.fillRect(bk.x0 - 20, bk.bot - 6, bk.w + 40, 18);
    // 玻璃背面
    g.fillStyle = LD.alpha(col.glass, col.dark ? 0.08 : 0.06);
    rr(g, bk.x0, bk.top, bk.w, bk.bot - bk.top, 8); g.fill();
    g.restore();
    return ly;
  }
  function liquid(g, bk, V, tint) {
    const ly = liqY(bk, V);
    g.save();
    g.beginPath();
    g.moveTo(bk.x0 + 2, ly); g.lineTo(bk.x0 + bk.w - 2, ly); g.lineTo(bk.x0 + bk.w - 2, bk.bot - 8);
    g.arcTo(bk.x0 + bk.w - 2, bk.bot - 2, bk.x0 + bk.w - 10, bk.bot - 2, 7);
    g.lineTo(bk.x0 + 10, bk.bot - 2); g.arcTo(bk.x0 + 2, bk.bot - 2, bk.x0 + 2, bk.bot - 10, 7);
    g.closePath();
    const base = tint ? tint.color : col.water, a = tint ? tint.a : 0;
    const gr = g.createLinearGradient(0, ly, 0, bk.bot);
    gr.addColorStop(0, LD.alpha(LD.mix(col.water, base, Math.min(1, a * 1.6)), 0.18 + a * 0.55));
    gr.addColorStop(1, LD.alpha(LD.mix(col.water, base, Math.min(1, a * 1.6)), 0.28 + a * 0.7));
    g.fillStyle = gr; g.fill();
    // 液面
    g.strokeStyle = LD.alpha(LD.mix(col.water, base, a), 0.75); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(bk.x0 + 3, ly); g.lineTo(bk.x0 + bk.w - 3, ly); g.stroke();
    g.restore();
  }
  function beakerFront(g, bk) {
    g.save();
    g.strokeStyle = LD.alpha(col.glass, col.dark ? 0.75 : 0.85); g.lineWidth = 2;
    g.beginPath();
    g.moveTo(bk.x0 - 4, bk.top - 2); g.lineTo(bk.x0, bk.top + 2);
    g.lineTo(bk.x0, bk.bot - 8); g.arcTo(bk.x0, bk.bot, bk.x0 + 8, bk.bot, 8);
    g.lineTo(bk.x0 + bk.w - 8, bk.bot); g.arcTo(bk.x0 + bk.w, bk.bot, bk.x0 + bk.w, bk.bot - 8, 8);
    g.lineTo(bk.x0 + bk.w, bk.top + 2); g.lineTo(bk.x0 + bk.w + 4, bk.top - 2);
    g.stroke();
    // 高光
    const hl = g.createLinearGradient(bk.x0, 0, bk.x0 + bk.w * 0.2, 0);
    hl.addColorStop(0, LD.alpha('#ffffff', col.dark ? 0.1 : 0.4)); hl.addColorStop(1, LD.alpha('#ffffff', 0));
    g.fillStyle = hl; g.fillRect(bk.x0 + 3, bk.top + 8, bk.w * 0.2, bk.bot - bk.top - 20);
    // 刻度
    g.strokeStyle = LD.alpha(col.glass, 0.6); g.lineWidth = 1;
    for (let k = 1; k <= 4; k++) {
      const y = bk.bot - 8 - (bk.bot - bk.top - 14) * (k / 5);
      g.beginPath(); g.moveTo(bk.x0 + bk.w - 4, y); g.lineTo(bk.x0 + bk.w - (k % 2 ? 10 : 16), y); g.stroke();
    }
    g.restore();
  }
  /** 金屬電極（有金屬光澤的長方形），yL：液面（液面以下顏色略暗） */
  function electrode(g, x, yTop, yBot, w, color, yL, coat) {
    if (w <= 0.3) return;
    g.save();
    const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    const hi = color === METAL_COL.C ? 0.1 : 0.28;
    gr.addColorStop(0, LD.shade(color, -0.32)); gr.addColorStop(0.35, LD.shade(color, hi)); gr.addColorStop(0.55, color); gr.addColorStop(1, LD.shade(color, -0.4));
    g.fillStyle = gr;
    rr(g, x - w / 2, yTop, w, yBot - yTop, Math.min(3, w / 2)); g.fill();
    g.strokeStyle = LD.alpha(LD.shade(color, -0.5), 0.7); g.lineWidth = 1; g.stroke();
    if (coat && coat.t > 0.2) {
      const cw2 = w + coat.t * 2;
      const cg = g.createLinearGradient(x - cw2 / 2, 0, x + cw2 / 2, 0);
      cg.addColorStop(0, LD.shade(coat.color, -0.3)); cg.addColorStop(0.4, LD.shade(coat.color, 0.2)); cg.addColorStop(1, LD.shade(coat.color, -0.35));
      g.fillStyle = cg;
      rr(g, x - cw2 / 2, yL + 4, cw2, yBot - yL - 3, Math.min(3, cw2 / 2)); g.fill();
    }
    // 接頭夾
    g.fillStyle = LD.shade(col.muted, -0.2);
    rr(g, x - Math.max(w, 10) / 2 - 2, yTop - 6, Math.max(w, 10) + 4, 9, 3); g.fill();
    g.restore();
  }
  function wirePath(pts) { return function (c) { pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); }; }
  function polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
  function polyAt(pts, d) {
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (d <= l) { const u = l ? d / l : 0; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u]; }
      d -= l;
    }
    return pts[pts.length - 1];
  }
  /** 導線上的電子（由 pts[0] 流向最後一點；hide：要跳過的矩形） */
  function electrons(g, pts, hide) {
    const L = polyLen(pts), gap = 22;
    const off = ((ePhase % gap) + gap) % gap;
    for (let d = off; d < L; d += gap) {
      const p = polyAt(pts, d);
      if (hide && hide.some(function (r) { return p[0] > r[0] && p[0] < r[0] + r[2] && p[1] > r[1] && p[1] < r[1] + r[3]; })) continue;
      LD.ball(g, p[0], p[1], 3.2, E_COL, { glow: 0.5, shadow: false });
    }
  }
  function lcd(g, x, y, w, h, main, sub) {
    g.save();
    // 外殼
    const sg = g.createLinearGradient(0, y, 0, y + h);
    sg.addColorStop(0, LD.shade(col.muted, col.dark ? -0.35 : 0.55)); sg.addColorStop(1, LD.shade(col.muted, col.dark ? -0.55 : 0.25));
    g.fillStyle = sg;
    g.shadowColor = LD.shadowInk(0.25); g.shadowBlur = 8; g.shadowOffsetY = 3;
    rr(g, x, y, w, h, 9); g.fill();
    g.shadowColor = 'transparent';
    g.strokeStyle = LD.alpha(col.text, 0.25); g.lineWidth = 1; g.stroke();
    // 螢幕
    g.fillStyle = LCD_BG;
    rr(g, x + 6, y + 6, w - 12, h - 12, 5); g.fill();
    g.fillStyle = LCD_FG;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 ' + fsz(sub ? 15 : 17) + 'px ui-monospace, Consolas, monospace';
    g.fillText(main, x + w / 2, y + (sub ? h * 0.4 : h / 2));
    if (sub) { g.font = fsz(10.5) + 'px ' + LD.FONT; g.fillStyle = LD.alpha(LCD_FG, 0.75); g.fillText(sub, x + w / 2, y + h * 0.74); }
    g.restore();
  }
  function terminal(g, x, y, color, sign) {
    LD.ball(g, x, y, 5.5, color, { glow: 0 });
    LD.haloText(g, sign, x, y - 9, color, 'center', 'alphabetic', '700 ' + fsz(13) + 'px ' + LD.FONT);
  }
  function bulb(g, x, y, r, glow) {
    g.save();
    if (glow > 0.01) {
      const gg = g.createRadialGradient(x, y, r * 0.3, x, y, r * (2.2 + 1.5 * glow));
      gg.addColorStop(0, LD.alpha('#ffd25a', 0.65 * glow)); gg.addColorStop(1, LD.alpha('#ffd25a', 0));
      g.fillStyle = gg; g.beginPath(); g.arc(x, y, r * (2.2 + 1.5 * glow), 0, Math.PI * 2); g.fill();
    }
    const bg = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    bg.addColorStop(0, LD.mix('#ffffff', '#fff3c4', glow)); bg.addColorStop(1, LD.alpha(LD.mix(col.glass, '#ffd25a', glow), 0.55 + 0.35 * glow));
    g.fillStyle = bg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = LD.alpha(col.text, 0.45); g.lineWidth = 1.2; g.stroke();
    // 燈絲
    g.strokeStyle = LD.mix(LD.shade(col.muted, -0.2), '#ff9a1f', glow); g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x - r * 0.45, y + r * 0.35); g.lineTo(x - r * 0.2, y - r * 0.2); g.lineTo(x, y + r * 0.1); g.lineTo(x + r * 0.2, y - r * 0.2); g.lineTo(x + r * 0.45, y + r * 0.35); g.stroke();
    // 燈座
    g.fillStyle = LD.shade(col.muted, -0.1);
    rr(g, x - r * 0.45, y + r * 0.85, r * 0.9, r * 0.5, 2); g.fill();
    g.restore();
  }

  // ======================= 化學電池畫面 =======================
  function tintOf(metal, c) {
    if (metal === 'X' || !M[metal].col) return null;
    return { color: col.ion(metal), a: 0.62 * (1 - Math.pow(10, -1.1 * c)) };
  }
  function elWidth(h) { return Math.max(0, Math.min(34, 14 * Math.sqrt(Math.max(0, h.m) / h.m0))); }
  function drawCell(g) {
    const bL = G.bk.L, bR = G.bk.R;
    const I = curNow(), E = emfNow();
    const xL = bL.x0 + bL.w * bL.elU, xR = bR.x0 + bR.w * bR.elU;
    const yL = liqY(bL, cell.L.V), yR = liqY(bR, cell.R.V);
    const yTop = G.yE, yBot = G.bot - 14;
    const wL = elWidth(cell.L), wR = elWidth(cell.R);
    beakerBack(g, bL, cell.L.V); beakerBack(g, bR, cell.R.V);
    electrode(g, xL, yTop, yBot, wL, METAL_COL[cell.L.metal], yL);
    electrode(g, xR, yTop, yBot, wR, METAL_COL[cell.R.metal], yR);
    // 鹽橋（倒 U 形玻璃管，管內是 KNO3 溶液）
    const bx0 = bL.x0 + bL.w * 0.74, bx1 = bR.x0 + bR.w * 0.26, by = G.top - Math.max(14, G.bh * 0.12);
    const bridgePts = [[bx0, Math.max(yL + 26, bL.top + 30)], [bx0, by + 10], [bx0 + 10, by], [bx1 - 10, by], [bx1, by + 10], [bx1, Math.max(yR + 26, bR.top + 30)]];
    if (cell.bridge) {
      LD.tube(g, wirePath(bridgePts), LD.alpha(col.glass, col.dark ? 0.55 : 0.5), 16);
      g.save();
      g.strokeStyle = LD.alpha('#ffffff', col.dark ? 0.08 : 0.35); g.lineWidth = 9; g.lineJoin = 'round';
      g.beginPath(); wirePath(bridgePts)(g); g.stroke();
      g.restore();
      const L = polyLen(bridgePts), leg1 = bridgePts[0][1] - bridgePts[1][1], leg2 = bridgePts[5][1] - bridgePts[4][1];
      bridgeIons.forEach(function (b) {
        const p = polyAt(bridgePts, b.s * L);
        const seg = b.s * L;
        const vert = seg < leg1 || seg > L - leg2;
        const off = b.j * 3.2;
        LD.ball(g, p[0] + (vert ? off : 0), p[1] + (vert ? 0 : off), 2.6, b.k === 'K' ? col.K : col.NO3, { glow: 0, shadow: false });
      });
    }
    liquid(g, bL, cell.L.V, tintOf(cell.L.metal, cell.L.c));
    liquid(g, bR, cell.R.V, tintOf(cell.R.metal, cell.R.c));
    // 離子
    [['L', bL, yL], ['R', bR, yR]].forEach(function (a) {
      const h = cell[a[0]], bk = a[1], ly = a[2], c0 = col.ion(h.metal);
      ions[a[0]].forEach(function (p) { LD.ball(g, bk.x0 + bk.w * p.u, ly + p.v * (bk.bot - ly), 3.4, c0, { glow: 0, shadow: false }); });
    });
    drawFlashes(g);
    beakerFront(g, bL); beakerFront(g, bR);
    // 外電路
    const meterL = cw / 2 - G.mw / 2, meterR = cw / 2 + G.mw / 2, yW = G.my;
    const isR = cell.load === 'R';
    const br = Math.max(13, G.mh * 0.34);
    const devL = isR ? cw / 2 - br : meterL, devR = isR ? cw / 2 + br : meterR;
    const wireCol = col.dark ? '#c98a5a' : '#b8662e';
    const pL = [[xL, yTop - 4], [xL, yW], [devL, yW]], pR = [[devR, yW], [xR, yW], [xR, yTop - 4]];
    LD.tube(g, wirePath(pL), wireCol, 4); LD.tube(g, wirePath(pR), wireCol, 4);
    if (Math.abs(I) > 1e-9) {
      const path = [[xL, yTop - 4], [xL, yW], [cw / 2, yW], [xR, yW], [xR, yTop - 4]];
      if (I < 0) path.reverse();
      const hide = isR ? [[cw / 2 - br - 2, yW - br - 2, 2 * br + 4, 2 * br + 4]] : [[meterL, yW - G.mh / 2, G.mw, G.mh]];
      electrons(g, path, hide);
    }
    if (isR) {
      const P = I * I * cell.Rload;
      bulb(g, cw / 2, yW, br, Math.min(1, Math.sqrt(P / 0.03)));
      const aw = Math.min(G.mw * 0.8, 130), ah = Math.max(34, G.mh * 0.72);
      lcd(g, cw / 2 - aw / 2, yW + br + 10, aw, ah, num(Math.abs(I) * 1000, Math.abs(I) < 0.01 ? 3 : 2) + ' mA', null);
    } else {
      lcd(g, meterL, yW - G.mh / 2, G.mw, G.mh, (cell.bridge ? num(E, 3) : '0.000') + ' V', T('伏特計（右 − 左）', 'Voltmeter (right − left)'));
      terminal(g, meterL - 2, yW, col.text, '−'); terminal(g, meterR + 2, yW, col.pos, '+');
    }
    // 陽極／陰極
    const narrow = G.narrow, fsLab = fsz(narrow ? 11 : 12);
    if (cell.bridge && Math.abs(E) > 1e-6) {
      const lAn = E > 0;
      const tag = function (an) { return an ? T('陽極（−）', 'Anode (−)') : T('陰極（+）', 'Cathode (+)'); };
      LD.pill(g, tag(lAn), xL, yTop - 14, lAn ? col.neg : col.pos, 'center', '600 ' + fsLab + 'px ' + LD.FONT);
      LD.pill(g, tag(!lAn), xR, yTop - 14, lAn ? col.pos : col.neg, 'center', '600 ' + fsLab + 'px ' + LD.FONT);
    } else if (!cell.bridge) {
      LD.pill(g, T('沒有鹽橋：電路不通', 'No salt bridge: open circuit'), cw / 2, G.top - G.bh * 0.06, col.muted, 'center', '600 ' + fsLab + 'px ' + LD.FONT);
    }
    // 燒杯下方的標示：Zn｜Zn²⁺ 1.00 M
    [['L', bL], ['R', bR]].forEach(function (a) {
      const h = cell[a[0]], bk = a[1];
      const ps = [[h.metal + '｜', 0]].concat(ionP(h.metal)).concat([[' ' + concTxt(h.c) + ' M', 0]]);
      richPill(g, ps, bk.cx, G.bot + fsz(13) * 1.25 + 4, col.text, fsz(narrow ? 12 : 13), 'center', '600');
    });
  }
  function drawFlashes(g) {
    const now = performance.now();
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i], u = (now - f.t0) / 500;
      if (u > 1) { flashes.splice(i, 1); continue; }
      LD.ripple(g, f.x, f.y, 3.5, u, f.color);
    }
  }

  // ======================= 電解畫面 =======================
  function drawElec(g) {
    const bk = G.bk.E;
    const yL = liqY(bk, elx.V), yTop = G.yE, yBot = G.bot - 14;
    const xA = bk.x0 + bk.w * bk.anU, xC = bk.x0 + bk.w * bk.catU;
    const isCu = elx.elec === 'Cu';
    const depCol = METAL_COL[unkE ? 'X' : 'Cu'];
    const wA = isCu ? Math.max(0, Math.min(34, 14 * Math.sqrt(Math.max(0, elx.mAnode) / elx.base))) : 14;
    const wC = isCu ? Math.min(34, 14 * Math.sqrt(elx.mCath / elx.base)) : 14;
    G.elw.an = wA; G.elw.cat = wC;
    const on = !elecOff && !elx.spent && elx.I > 0;
    beakerBack(g, bk, elx.V);
    electrode(g, xA, yTop, yBot, wA, METAL_COL[isCu ? 'Cu' : 'C'], yL);
    electrode(g, xC, yTop, yBot, wC, METAL_COL[isCu ? 'Cu' : 'C'], yL, isCu ? null : { t: Math.min(8, 7 * Math.sqrt(elx.dep / 2)), color: depCol });
    const tint = unkE ? null : tintOf('Cu', elx.c);
    liquid(g, bk, elx.V, tint);
    const ic = col.ion(unkE ? 'X' : 'Cu');
    ions.E.forEach(function (p) { LD.ball(g, bk.x0 + bk.w * p.u, yL + p.v * (bk.bot - yL), 3.4, ic, { glow: 0, shadow: false }); });
    ions.H.forEach(function (p) { LD.ball(g, bk.x0 + bk.w * p.u, yL + p.v * (bk.bot - yL), 2.2, col.H, { glow: 0, shadow: false }); });
    bubbles.forEach(function (b) {
      g.save();
      g.strokeStyle = LD.alpha(col.dark ? '#ffffff' : '#3b5566', 0.6); g.lineWidth = 1;
      g.fillStyle = LD.alpha('#ffffff', col.dark ? 0.18 : 0.55);
      g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill(); g.stroke();
      g.restore();
    });
    drawFlashes(g);
    beakerFront(g, bk);
    // 電源
    const sw = G.mw, sh = G.mh, sx = cw / 2 - sw / 2, yW = G.my;
    const wireCol = col.dark ? '#c98a5a' : '#b8662e';
    LD.tube(g, wirePath([[xA, yTop - 4], [xA, yW], [sx, yW]]), wireCol, 4);
    LD.tube(g, wirePath([[sx + sw, yW], [xC, yW], [xC, yTop - 4]]), wireCol, 4);
    if (on) electrons(g, [[xA, yTop - 4], [xA, yW], [cw / 2, yW], [xC, yW], [xC, yTop - 4]], [[sx, yW - sh / 2, sw, sh]]);
    const main = (on ? num(elx.I, 2) : '0.00') + ' A';
    const sub = timeTxt(elx.t) + (timerOn() ? ' / ' + timeTxt(val(elTimer)) : '');
    lcd(g, sx, yW - sh / 2, sw, sh, main, sub);
    terminal(g, sx - 2, yW, col.pos, '+'); terminal(g, sx + sw + 2, yW, col.text, '−');
    const fsLab = fsz(G.narrow ? 11 : 12);
    LD.pill(g, T('陽極（+）', 'Anode (+)'), xA, yTop - 14, col.pos, 'center', '600 ' + fsLab + 'px ' + LD.FONT);
    LD.pill(g, T('陰極（−）', 'Cathode (−)'), xC, yTop - 14, col.neg, 'center', '600 ' + fsLab + 'px ' + LD.FONT);
    // 溶液標示
    const sol = unkE ? [['M', 0], ['2+', 1], [T('（未知）', ' (unknown)'), 0]] : [['CuSO', 0], ['4', -1]];
    richPill(g, sol.concat([[' ' + concTxt(elx.c) + ' M · ' + num(elx.V * 1000, 0) + ' mL', 0]]), bk.cx, G.bot + fsz(13) * 1.25 + 4, col.text, fsz(G.narrow ? 12 : 13), 'center', '600');
  }

  let kb = null;
  function drawStage() {
    if (!G || !cw) return;
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(g, cw, ch);
    // 桌面
    const tg = g.createLinearGradient(0, G.bot - 2, 0, ch);
    tg.addColorStop(0, LD.alpha(col.muted, col.dark ? 0.16 : 0.1)); tg.addColorStop(1, LD.alpha(col.muted, 0));
    g.fillStyle = tg; g.fillRect(0, G.bot - 2, cw, ch - G.bot + 2);
    if (state.mode === 'cell') drawCell(g); else drawElec(g);
    if (kb && kb.focused()) {
      const i = kb.index();
      let box;
      if (state.mode === 'cell') { const bk = i === 0 ? G.bk.L : G.bk.R; box = [bk.x0 - 8, G.yE - 30, bk.w + 16, G.bot - G.yE + 36]; }
      else box = i === 0 ? [cw / 2 - G.mw / 2 - 8, G.my - G.mh / 2 - 8, G.mw + 16, G.mh + 16] : [G.bk.E.x0 - 8, G.top - 8, G.bk.E.w + 16, G.bot - G.top + 16];
      g.save(); g.strokeStyle = col.accent; g.setLineDash([5, 4]); g.lineWidth = 2;
      rr(g, box[0], box[1], box[2], box[3], 10); g.stroke(); g.restore();
    }
  }

  // ======================= 圖表 =======================
  let gw = 0, gh = 0;
  function resizeGraph() {
    const w = gcv.clientWidth;
    if (!w) return;
    gw = w;
    gh = w < 560 ? Math.round(Math.max(260, w * 0.78)) : 320;
    if (gcv.style.height !== gh + 'px') gcv.style.height = gh + 'px';
    gcv.width = Math.round(gw * dpr); gcv.height = Math.round(gh * dpr);
  }
  function niceStep(span, k) {
    const raw = span / Math.max(1, k), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function decOf(step) { return step < 1 ? Math.min(6, Math.ceil(-Math.log10(step) - 1e-9)) : 0; }
  function axes(g, o) {
    const narrow = gw < 480;
    const Lm = narrow ? 48 : 58, Rm = o.y2 ? (narrow ? 44 : 54) : 14, Tp = 30, B = narrow ? 40 : 42;
    const X0 = Lm, X1 = gw - Rm, Y0 = gh - B, Y1 = Tp;
    const sx = function (v) { return X0 + (v - o.x0) / (o.x1 - o.x0) * (X1 - X0); };
    const sy = function (v) { return Y0 - (v - o.y0) / (o.y1 - o.y0) * (Y0 - Y1); };
    const sy2 = o.y2 ? function (v) { return Y0 - (v - o.y2[0]) / (o.y2[1] - o.y2[0]) * (Y0 - Y1); } : null;
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
      g.fillText(num(v, decOf(xs)), X, Y0 + 4);
    }
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = Math.ceil(o.y0 / ys - 1e-9) * ys; v <= o.y1 + 1e-9; v += ys) {
      const Y = Math.round(sy(v)) + 0.5;
      g.beginPath(); g.moveTo(X0, Y); g.lineTo(X1, Y); g.stroke();
      g.fillText(num(v, decOf(ys)), X0 - 5, Y);
    }
    if (o.y2) {
      const y2s = niceStep(o.y2[1] - o.y2[0], 5);
      g.textAlign = 'left';
      g.fillStyle = o.y2c || col.muted;
      for (let v = Math.ceil(o.y2[0] / y2s - 1e-9) * y2s; v <= o.y2[1] + 1e-9; v += y2s) {
        const Y = Math.round(sy2(v)) + 0.5;
        g.strokeStyle = LD.alpha(o.y2c || col.muted, 0.6);
        g.beginPath(); g.moveTo(X1, Y); g.lineTo(X1 + 4, Y); g.stroke();
        g.fillText(num(v, decOf(y2s)), X1 + 6, Y);
      }
    }
    g.strokeStyle = LD.alpha(col.text, 0.55);
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(X0, Y1); g.lineTo(X0, Y0); g.lineTo(X1, Y0); if (o.y2) g.lineTo(X1, Y1); g.stroke();
    if (o.xl) rich(g, o.xl, (X0 + X1) / 2, gh - 6, col.muted, fsz(12), 'center');
    if (o.yl) rich(g, o.yl, 4, 16, o.ylc || col.muted, fsz(12), 'left');
    if (o.y2l) rich(g, o.y2l, gw - 4, 16, o.y2c || col.muted, fsz(12), 'right');
    g.restore();
    return { sx: sx, sy: sy, sy2: sy2, X0: X0, X1: X1, Y0: Y0, Y1: Y1 };
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
  function drawMsg(g, text) {
    g.save();
    g.fillStyle = col.muted; g.font = fsz(13) + 'px ' + LD.FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    const words = text.split(/(?<=[，。：；、,.;:\s])/);
    const out = []; let lt = '';
    words.forEach(function (w) { if (g.measureText(lt + w).width > gw - 40 && lt) { out.push(lt); lt = w; } else lt += w; });
    if (lt) out.push(lt);
    const y = gh / 2 - (out.length - 1) * 11;
    out.forEach(function (l, i) { g.fillText(l.trim(), gw / 2, y + i * 22); });
    g.restore();
  }
  function drawGraph() {
    if (!gw) return;
    const g = gctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = col.bg; g.fillRect(0, 0, gw, gh);
    if (state.tab === 'time') drawTime(g);
    else if (state.tab === 'nernst') drawNernst(g);
    else drawFaraday(g);
  }
  function tUnit(span) { return span > 2 * 86400 ? [86400, 'd'] : span > 3 * 3600 ? [3600, 'h'] : span > 300 ? [60, 'min'] : [1, 's']; }
  function drawTime(g) {
    const H = state.mode === 'cell' ? histC : histE;
    if (H.length < 2) { axes(g, { x0: 0, x1: 1, y0: 0, y1: 1, xl: [['t', 0]] }); drawMsg(g, T('按「播放」開始，圖會隨時間畫出來。', 'Press “Play”: the graph is drawn as time goes on.')); return; }
    const t0 = H[0].t, t1 = Math.max(H[H.length - 1].t, t0 + 1e-6);
    const u = tUnit(t1 - t0);
    if (state.mode === 'cell') {
      let lo = Infinity, hi = -Infinity, imax = 0;
      H.forEach(function (h) { lo = Math.min(lo, h.E); hi = Math.max(hi, h.E); imax = Math.max(imax, Math.abs(h.I)); });
      if (hi - lo < 0.02) { const m = (hi + lo) / 2; lo = m - 0.01; hi = m + 0.01; }
      const pd = (hi - lo) * 0.1; lo -= pd; hi += pd;
      const hasI = imax > 1e-9;
      const A = axes(g, { x0: t0 / u[0], x1: t1 / u[0], y0: lo, y1: hi, xl: [['t（' + u[1] + '）', 0]], yl: [['E（V）', 0]], ylc: col.accent,
        y2: hasI ? [0, imax * 1.1] : null, y2l: [['|I|（mA）', 0]], y2c: col.pos });
      line(g, H.map(function (h) { return [A.sx(h.t / u[0]), A.sy(h.E)]; }), col.accent, 2.2);
      if (hasI) line(g, H.map(function (h) { return [A.sx(h.t / u[0]), A.sy2(Math.abs(h.I))]; }), col.pos, 1.8, [6, 4]);
    } else {
      let cmax = 0, dmax = 0;
      H.forEach(function (h) { cmax = Math.max(cmax, h.c); dmax = Math.max(dmax, h.dep); });
      const ic = col.ion(unkE ? 'X' : 'Cu');
      const A = axes(g, { x0: t0 / u[0], x1: t1 / u[0], y0: 0, y1: Math.max(cmax * 1.1, 0.01), xl: [['t（' + u[1] + '）', 0]],
        yl: [['[', 0], [unkE ? 'M' : 'Cu', 0], ['2+', 1], [']（M）', 0]], ylc: ic, y2: [0, Math.max(dmax * 1.1, 0.01)], y2l: [['Δm（g）', 0]], y2c: col.pos });
      line(g, H.map(function (h) { return [A.sx(h.t / u[0]), A.sy(h.c)]; }), ic, 2.2);
      line(g, H.map(function (h) { return [A.sx(h.t / u[0]), A.sy2(h.dep)]; }), col.pos, 1.8, [6, 4]);
    }
  }
  function pairKey(r) { return r.L + '|' + r.R; }
  function nernstRows() {
    const key = metalL() + '|' + state.R;
    return rowsC.filter(function (r) { return pairKey(r) === key && r.unk === (unkC ? unkC.id : 0); });
  }
  function drawNernst(g) {
    const rs = nernstRows();
    if (!rs.length) {
      axes(g, { x0: -3, x1: 3, y0: 0, y1: 1, xl: [['log Q', 0]], yl: [['E（V）', 0]] });
      drawMsg(g, T('接伏特計、放上鹽橋，改變兩邊的濃度，每次按「記錄這一筆」：E 對 log Q 是一條直線。', 'With the voltmeter and the salt bridge, change the concentrations and press “Record this reading” each time: E against log Q is a straight line.'));
      return;
    }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    rs.forEach(function (r) { x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x); y0 = Math.min(y0, r.E); y1 = Math.max(y1, r.E); });
    if (x1 - x0 < 1) { const m = (x0 + x1) / 2; x0 = m - 0.5; x1 = m + 0.5; }
    x0 -= 0.3; x1 += 0.3;
    const known = !unkC || unkC.revealed;
    const n = C.nOf(rs[0].L, rs[0].R), Es = known ? C.stdEmf(rs[0].L, rs[0].R) : null;
    if (Es != null) { [x0, x1].forEach(function (x) { const y = Es - C.KN / n * x; y0 = Math.min(y0, y); y1 = Math.max(y1, y); }); }
    if (y1 - y0 < 0.02) { const m = (y0 + y1) / 2; y0 = m - 0.01; y1 = m + 0.01; }
    const pd = (y1 - y0) * 0.1; y0 -= pd; y1 += pd;
    const A = axes(g, { x0: x0, x1: x1, y0: y0, y1: y1, xl: [['log Q', 0]], yl: [['E（V）', 0]] });
    if (Es != null) line(g, [[A.sx(x0), A.sy(Es - C.KN / n * x0)], [A.sx(x1), A.sy(Es - C.KN / n * x1)]], LD.alpha(col.muted, 0.85), 1.5, [6, 4]);
    const f = C.fitLine(rs.map(function (r) { return { x: r.x, y: r.E }; }));
    if (f && rs.length >= 2) line(g, [[A.sx(x0), A.sy(f.a + f.b * x0)], [A.sx(x1), A.sy(f.a + f.b * x1)]], col.accent, 2);
    rs.forEach(function (r) { LD.ball(g, A.sx(r.x), A.sy(r.E), 5, col.pos, { glow: 0 }); });
  }
  function drawFaraday(g) {
    const rs = rowsE.filter(function (r) { return r.unk === (unkE ? unkE.id : 0); });
    let qmax = elx.q, mmax = elx.dep;
    rs.forEach(function (r) { qmax = Math.max(qmax, r.q); mmax = Math.max(mmax, r.dep); });
    if (qmax <= 0) {
      axes(g, { x0: 0, x1: 1000, y0: 0, y1: 0.4, xl: [['Q（C）', 0]], yl: [['Δm（g）', 0]] });
      drawMsg(g, T('切換到「電解」並通電：陰極增加的質量 Δm 對通過的電量 Q 作圖。', 'Switch to “Electrolysis” and pass a current: the gain in mass of the cathode, Δm, is plotted against the charge Q.'));
      return;
    }
    const known = !unkE || unkE.revealed;
    const metal = elecMetal();
    const slopeT = C.massOf(metal, 1);
    if (known) mmax = Math.max(mmax, slopeT * qmax);
    const A = axes(g, { x0: 0, x1: qmax * 1.08, y0: 0, y1: Math.max(mmax * 1.1, 1e-3), xl: [['Q（C）', 0]], yl: [['Δm（g）', 0]] });
    if (known) line(g, [[A.sx(0), A.sy(0)], [A.sx(qmax * 1.08), A.sy(slopeT * qmax * 1.08)]], LD.alpha(col.muted, 0.85), 1.5, [6, 4]);
    const H = histE.filter(function (h) { return h.q <= elx.q + 1e-9; });
    line(g, H.map(function (h) { return [A.sx(h.q), A.sy(h.dep)]; }), col.accent, 2);
    rs.forEach(function (r) { LD.ball(g, A.sx(r.q), A.sy(r.dep), 5, col.pos, { glow: 0 }); });
  }
  function updateGraphText() {
    let leg = '', hint = '';
    if (state.tab === 'time') {
      if (state.mode === 'cell') {
        leg = '<span><span class="ln" style="background:' + col.accent + '"></span>' + T('伏特計讀數 E', 'Meter reading E') + '</span><span><span class="ln dash" style="color:' + col.pos + '"></span>' + T('電流 |I|（右側刻度）', 'Current |I| (right scale)') + '</span>';
        hint = T('接上燈泡並加快時間：電流讓兩杯的濃度改變，電壓慢慢下降。', 'Connect the bulb and speed up time: the current changes the concentrations and the voltage slowly falls.');
      } else {
        leg = '<span><span class="ln" style="background:' + col.ion(unkE ? 'X' : 'Cu') + '"></span>[' + (unkE ? 'M' : 'Cu') + '<sup>2+</sup>]</span><span><span class="ln dash" style="color:' + col.pos + '"></span>' + T('陰極增加的質量 Δm（右側刻度）', 'Gain in mass of the cathode Δm (right scale)') + '</span>';
        hint = T('石墨電極：Cu<sup>2+</sup> 越來越少。銅電極：陽極溶解多少、陰極就析出多少，濃度幾乎不變。', 'Graphite electrodes: Cu<sup>2+</sup> keeps falling. Copper electrodes: the anode dissolves as much as the cathode gains, so the concentration hardly changes.');
      }
    } else if (state.tab === 'nernst') {
      const rs = nernstRows();
      const n = C.nOf(metalL(), state.R);
      leg = '<span><span class="sp" style="background:' + col.pos + '"></span>' + T('記錄的數據', 'Recorded readings') + '</span><span><span class="ln" style="background:' + col.accent + '"></span>' + T('最佳直線', 'Best-fit line') + '</span>' +
        (!unkC || unkC.revealed ? '<span><span class="ln dash" style="color:' + col.muted + '"></span>' + T('能斯特方程式', 'Nernst equation') + '</span>' : '');
      const f = rs.length >= 2 ? C.fitLine(rs.map(function (r) { return { x: r.x, y: r.E }; })) : null;
      hint = T('目前這組：', 'This pair: ') + metalL() + '｜' + ionH(metalL()) + ' ‖ ' + ionH(state.R) + '｜' + state.R + T('，n = ', ', n = ') + n + T('，理論斜率 −0.05916/n = ', '; theoretical slope −0.05916/n = ') + num(-C.KN / n, 4) + ' V' +
        (f ? T('；你的斜率 = ', '; your slope = ') + num(f.b, 4) + ' V' + T('，截距 = ', ', intercept = ') + num(f.a, 4) + ' V' : '') + T('（共 ', ' (') + rs.length + T(' 筆）', ' readings)');
    } else {
      const rs = rowsE.filter(function (r) { return r.unk === (unkE ? unkE.id : 0); });
      leg = '<span><span class="ln" style="background:' + col.accent + '"></span>' + T('電解過程', 'During electrolysis') + '</span><span><span class="sp" style="background:' + col.pos + '"></span>' + T('記錄的數據', 'Recorded readings') + '</span>' +
        (!unkE || unkE.revealed ? '<span><span class="ln dash" style="color:' + col.muted + '"></span>Δm = QM/(2F)</span>' : '');
      const last = rs[rs.length - 1];
      hint = T('斜率 = M/(zF)，所以 M = 斜率 × 2F。', 'Slope = M/(zF), so M = slope × 2F.') +
        (last && last.q > 0 ? T('最後一筆：Δm/Q = ', ' Last reading: Δm/Q = ') + sciHTML(last.dep / last.q, 4) + ' g/C' : '');
    }
    $('gLegend').innerHTML = leg;
    $('gHint').innerHTML = hint;
  }

  // ======================= 讀數、紀錄表 =======================
  function updateReadouts() {
    const items = [];
    if (state.mode === 'cell') {
      const E = emfNow(), I = curNow();
      items.push([T('伏特計讀數 E', 'Meter reading E') + '<small>' + T('右 − 左', 'right − left') + '</small>', cell.bridge ? num(E, 4) + ' V' : T('0（電路不通）', '0 (open circuit)'), 'big']);
      const known = !unkC || unkC.revealed;
      items.push(['E°<sub>' + T('右', 'R') + '</sub> − E°<sub>' + T('左', 'L') + '</sub>', known ? num(C.stdEmf(cell.L.metal, cell.R.metal), 4) + ' V' : '?']);
      items.push(['n、log Q', C.nOf(cell.L.metal, cell.R.metal) + '、' + num(C.logQ(cell.L, cell.R), 3)]);
      items.push([T('電流 I', 'Current I'), cell.load === 'R' && cell.bridge ? sigf(Math.abs(I) * 1000, 3) + ' mA' : '0']);
      items.push([T('已通過的電量', 'Charge passed'), sigf(cell.qAbs, 3) + ' C']);
      items.push([T('時間', 'Time'), timeTxt(cell.t)]);
      ['L', 'R'].forEach(function (s) {
        const h = cell[s];
        items.push([(s === 'L' ? T('左：', 'Left: ') : T('右：', 'Right: ')) + '[' + ionH(h.metal) + ']', concTxt(h.c) + ' M']);
        items.push([(s === 'L' ? T('左電極', 'Left electrode') : T('右電極', 'Right electrode')) + '<small>' + T('變化', 'change') + ' ' + signed(h.m - h.m0, 4) + ' g</small>', num(h.m, 4) + ' g']);
      });
    } else {
      const eff = C.cathodeEff(elx.c);
      items.push([T('時間 t', 'Time t'), timeTxt(elx.t) + (elx.t >= 600 ? '<small>' + num(elx.t, 0) + ' s</small>' : ''), '']);
      items.push([T('電量 Q = It', 'Charge Q = It'), sigf(elx.q, 4) + ' C', 'big']);
      items.push([T('陰極增加 Δm', 'Gain of cathode Δm'), num(elx.mCath - elx.base, 4) + ' g', 'big']);
      if (elx.elec === 'Cu') items.push([T('陽極減少', 'Loss of anode'), num(elx.base - elx.mAnode, 4) + ' g']);
      else items.push([T('陽極產生 O<sub>2</sub>', 'O<sub>2</sub> at the anode'), sigf(elx.nO2 * C.VM * 1000, 3) + ' mL']);
      items.push([T('陰極產生 H<sub>2</sub>', 'H<sub>2</sub> at the cathode'), sigf(elx.nH2 * C.VM * 1000, 3) + ' mL']);
      items.push(['[' + (unkE ? 'M' : 'Cu') + '<sup>2+</sup>]', concTxt(elx.c) + ' M']);
      if (elx.elec === 'C') items.push(['[H<sup>+</sup>]' + '<small>' + T('電解產生', 'from electrolysis') + '</small>', sciHTML(C.hplus(elx), 3) + ' M']);
      items.push([T('陰極電流用於析出金屬', 'Cathode current used for metal'), num(100 * eff, 1) + '%']);
    }
    $('readout').innerHTML = items.map(function (it) { return '<dt>' + it[0] + '</dt><dd' + (it[2] ? ' class="' + it[2] + '"' : '') + '>' + it[1] + '</dd>'; }).join('');
    cv.setAttribute('aria-label', describeCanvas());
    if (!statusOverride) { const st = autoStatus(); if (statusEl.innerHTML !== st) statusEl.innerHTML = st; }
  }
  function describeCanvas() {
    if (state.mode === 'cell') {
      return T('化學電池：', 'Galvanic cell: ') + nm(cell.L.metal) + ' ' + concTxt(cell.L.c) + ' M ' + T('與', 'and ') + nm(cell.R.metal) + ' ' + concTxt(cell.R.c) + ' M。' +
        (cell.bridge ? T('伏特計讀數 ', 'Meter reading ') + num(emfNow(), 3) + ' V' : T('沒有鹽橋', 'No salt bridge')) + '.';
    }
    return T('電解：', 'Electrolysis: ') + (elx.elec === 'Cu' ? T('銅電極', 'copper electrodes') : T('石墨電極', 'graphite electrodes')) + ', I = ' + num(elx.I, 2) + ' A, Q = ' + sigf(elx.q, 3) + ' C, Δm = ' + num(elx.dep, 3) + ' g.';
  }
  function renderTable() {
    const el = $('tbl');
    let h;
    if (state.mode === 'cell') {
      h = '<thead><tr><th>#</th><th>' + T('左', 'Left') + '</th><th>' + T('左濃度', 'c(left)') + '<br><small>M</small></th><th>' + T('右', 'Right') + '</th><th>' + T('右濃度', 'c(right)') + '<br><small>M</small></th><th>log Q</th><th>E<br><small>V</small></th></tr></thead><tbody>';
      if (!rowsC.length) h += '<tr class="empty"><td colspan="7">' + T('接伏特計、放上鹽橋，按「記錄這一筆」。', 'With the voltmeter and the salt bridge, press “Record this reading”.') + '</td></tr>';
      rowsC.forEach(function (r, i) {
        h += '<tr><td>' + (i + 1) + '</td><td>' + r.L + '</td><td>' + concTxt(r.cL) + '</td><td>' + r.R + '</td><td>' + concTxt(r.cR) + '</td><td>' + num(r.x, 3) + '</td><td>' + num(r.E, 4) + '</td></tr>';
      });
    } else {
      h = '<thead><tr><th>#</th><th>' + T('電極', 'Electrodes') + '</th><th>t<br><small>s</small></th><th>I<br><small>A</small></th><th>Q<br><small>C</small></th><th>Δm<br><small>g</small></th><th>Δm/Q<br><small>mg/C</small></th></tr></thead><tbody>';
      if (!rowsE.length) h += '<tr class="empty"><td colspan="7">' + T('電解一段時間後按「記錄這一筆」。', 'Pass a current for a while, then press “Record this reading”.') + '</td></tr>';
      rowsE.forEach(function (r, i) {
        h += '<tr><td>' + (i + 1) + '</td><td>' + (r.elec === 'Cu' ? T('銅', 'Cu') : T('石墨', 'C')) + (r.unk ? '・M' : '') + '</td><td>' + num(r.t, 0) + '</td><td>' + num(r.I, 2) + '</td><td>' + sigf(r.q, 4) + '</td><td>' + num(r.dep, 4) + '</td><td>' + (r.q > 0 ? num(1000 * r.dep / r.q, 5) : '—') + '</td></tr>';
      });
    }
    el.innerHTML = h + '</tbody>';
  }
  function record() {
    acted();
    if (state.mode === 'cell') {
      if (!cell.bridge || cell.load !== 'V') {
        setStatus(T('要記錄電池電位：先放上鹽橋，並接伏特計（伏特計不取電流）。', 'To record the cell potential, put in the salt bridge and use the voltmeter (it draws no current).'));
        return;
      }
      const r = { id: ++rowSeq, seg: segId, L: cell.L.metal, R: cell.R.metal, cL: cell.L.c, cR: cell.R.c, x: C.logQ(cell.L, cell.R), E: emfNow(), unk: unkC ? unkC.id : 0 };
      rowsC.push(r);
      if (rowsC.length > 200) rowsC.shift();
      const same = rowsC.filter(function (q) { return q.seg === segId && pairKey(q) === pairKey(r) && q.unk === r.unk; });
      let lo = Infinity, hi = -Infinity;
      same.forEach(function (q) { lo = Math.min(lo, q.x); hi = Math.max(hi, q.x); });
      const f = same.length >= 2 ? C.fitLine(same.map(function (q) { return { x: q.x, y: q.E }; })) : null;
      if (userActed && window.LabMission) window.LabMission.emit('record', { pair: pairKey(r), count: same.length, span: hi - lo, slope: f ? f.b : null, theory: -C.KN / C.nOf(r.L, r.R), unk: !!r.unk });
      setStatus(T('已記錄：E = ', 'Recorded: E = ') + num(r.E, 4) + ' V' + T('，log Q = ', ', log Q = ') + num(r.x, 3) + T('。', '.'));
    } else {
      const r = { id: ++rowSeq, seg: segId, elec: elx.elec, t: elx.t, I: elx.I, q: elx.q, dep: elx.dep, unk: unkE ? unkE.id : 0 };
      rowsE.push(r);
      if (rowsE.length > 200) rowsE.shift();
      setStatus(T('已記錄：Q = ', 'Recorded: Q = ') + sigf(r.q, 4) + ' C' + T('，Δm = ', ', Δm = ') + num(r.dep, 4) + ' g' + T('。', '.'));
    }
    if (snd()) window.LabSound.tone({ freq: 880, dur: 0.1, gain: 0.1 });
    renderTable(); updateGraphText(); drawGraph();
  }

  // ======================= 狀態列 =======================
  let statusOverride = '';
  function setStatus(s) { statusOverride = s; statusEl.innerHTML = s || autoStatus(); }
  function autoStatus() {
    if (state.mode === 'cell') {
      if (!cell.bridge) return T('沒有鹽橋：兩杯溶液之間沒有離子可以移動，電路不通，伏特計讀到 0。勾選「鹽橋」。', 'No salt bridge: no ions can move between the solutions, so the circuit is open and the voltmeter reads 0. Tick “Salt bridge”.');
      const E = emfNow();
      const sameM = cell.L.metal === cell.R.metal;
      const who = function (side) { const k = cell[side].metal; return sameM ? (side === 'L' ? T('左邊的', 'the left-hand ') : T('右邊的', 'the right-hand ')) + nm(k) : nm(k); };
      const an = who(E > 0 ? 'L' : 'R'), ca = who(E > 0 ? 'R' : 'L');
      const cap = function (t) { return t.charAt(0).toUpperCase() + t.slice(1); };
      if (Math.abs(E) < 1e-6) return T('兩邊的電極電位相同，電壓為 0。', 'Both electrodes have the same potential: the voltage is 0.');
      if (cell.load === 'V') return T('伏特計不取電流，讀到的就是電池電位。', 'The voltmeter draws no current, so it reads the cell potential. ') + cap(an) + T('是陽極（被氧化），', ' is the anode (oxidised); ') + ca + T('是陰極（離子被還原）。', ' is the cathode (its ions are reduced).') +
        (sameM ? T('濃差電池：稀的一邊是陽極。', ' Concentration cell: the dilute side is the anode.') : '');
      if (!state.running) return T('已暫停：按「播放」繼續放電。', 'Paused: press “Play” to carry on.');
      return T('放電中：電子由', 'Discharging: electrons flow through the wire from ') + an + T('經導線流向', ' to ') + ca + T('；鹽橋中 K<sup>+</sup> 移向陰極、NO<sub>3</sub><sup>−</sup> 移向陽極。', '; in the salt bridge K<sup>+</sup> moves towards the cathode and NO<sub>3</sub><sup>−</sup> towards the anode.');
    }
    if (elx.spent) return T('陽極的銅已經完全溶解，電路斷了。按「重新開始」。', 'The copper anode is used up and the circuit is broken. Press “Restart”.');
    if (elecOff) return T('時間到：電源已關閉。', 'Time is up: the power supply is off.');
    if (!(elx.I > 0)) return T('電流是 0：把電流調大才會電解。', 'The current is 0: turn it up to start electrolysis.');
    if (!state.running) return T('已暫停（電源仍接著，時間不走）：按「播放」繼續。', 'Paused (time is frozen): press “Play” to carry on.');
    const eff = C.cathodeEff(elx.c);
    if (eff < 0.5) return T('溶液中的金屬離子快用完了：陰極大多改為產生氫氣。', 'The metal ions are nearly used up: the cathode now mostly gives off hydrogen.');
    return elx.elec === 'Cu' ? T('電解中：陽極的銅溶解成 Cu<sup>2+</sup>，陰極析出銅（電解精煉）。', 'Electrolysing: the copper anode dissolves as Cu<sup>2+</sup> and copper is deposited on the cathode (refining).') :
      T('電解中：陰極析出金屬，石墨陽極產生氧氣，溶液漸漸變酸。', 'Electrolysing: metal is deposited on the cathode, oxygen is given off at the graphite anode and the solution becomes acidic.');
  }

  // ======================= 介面 =======================
  function buildMetals() {
    ['metL', 'metR'].forEach(function (id) {
      const box = $(id), side = id === 'metL' ? 'L' : 'R';
      box.innerHTML = REAL.map(function (k) {
        return '<button type="button" data-m="' + k + '" aria-pressed="false" title="' + nm(k) + '">' + k + '<small>' + num(M[k].E, 2) + ' V</small></button>';
      }).join('') + (side === 'L' ? '<button type="button" data-m="X" aria-pressed="false" hidden>X<small>? V</small></button>' : '');
      box.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          acted();
          if (side === 'L' && unkC) return;
          if (state[side] === b.dataset.m) return;
          state[side] = b.dataset.m;
          resetHalf(side);
          if (snd()) window.LabSound.tone({ freq: 523, dur: 0.06, gain: 0.07 });
          setStatus('');
          refreshAll();
        });
      });
    });
    syncMetalButtons();
  }
  function syncMetalButtons() {
    document.querySelectorAll('#metL button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.m === metalL()));
      if (b.dataset.m === 'X') b.hidden = !unkC; else b.disabled = !!unkC;
    });
    document.querySelectorAll('#metR button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.m === state.R)); });
  }
  function refreshOutputs() {
    $('cLo').textContent = concTxt(val(elCL)) + ' M';
    $('cRo').textContent = concTxt(val(elCR)) + ' M';
    $('volo').textContent = num(val(elVol), 0) + ' mL';
    $('rloado').textContent = sigf(val(elR), 3) + ' Ω';
    $('cEo').textContent = concTxt(val(elCE)) + ' M';
    $('volEo').textContent = num(val(elVE), 0) + ' mL';
    $('ampo').textContent = num(val(elAmp), 2) + ' A';
    $('timero').textContent = timerOn() ? num(val(elTimer), 0) + ' s' : T('不關', 'never');
  }
  function refreshAll() {
    refreshOutputs();
    syncMetalButtons();
    updateReadouts();
    updateLegend();
    updateGraphText();
    renderTable();
    setStatus(statusOverride);
    drawStage(); drawGraph();
  }
  function updateLegend() {
    const dot = function (c, t) { return '<span><span class="sp" style="background:' + c + '"></span>' + t + '</span>'; };
    let h = dot(E_COL, T('電子 e<sup>−</sup>', 'electron e<sup>−</sup>'));
    if (state.mode === 'cell') {
      const seen = {};
      [cell.L.metal, cell.R.metal].forEach(function (k) { if (!seen[k]) { seen[k] = 1; h += dot(col.ion(k), ionH(k)); } });
      if (cell.bridge) h += dot(col.K, 'K<sup>+</sup>') + dot(col.NO3, 'NO<sub>3</sub><sup>−</sup>');
    } else {
      h += dot(col.ion(unkE ? 'X' : 'Cu'), unkE ? 'M<sup>2+</sup>' : 'Cu<sup>2+</sup>');
      if (elx.elec === 'C') h += dot(col.H, 'H<sup>+</sup>');
      h += '<span><span class="sp" style="background:transparent"></span>' + T('氣泡：陽極 O<sub>2</sub>、陰極 H<sub>2</sub>', 'bubbles: O<sub>2</sub> at the anode, H<sub>2</sub> at the cathode') + '</span>';
    }
    $('legend').innerHTML = h;
  }
  function setMode(m) {
    state.mode = m;
    document.querySelectorAll('#modeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === m)); });
    $('cellCtl').hidden = m !== 'cell';
    $('circuitCard').hidden = m !== 'cell';
    $('elecCtl').hidden = m !== 'elec';
    cv.setAttribute('aria-label', m === 'cell' ? T('化學電池', 'Electrochemical cell') : T('電解', 'Electrolysis'));
    if (m === 'elec' && state.tab === 'nernst') setTab('faraday', true);
    if (m === 'cell' && state.tab === 'faraday') setTab('nernst', true);
    bubbles.length = 0; flashes.length = 0;
    syncIons(true);
    setUnkUI();
    setStatus('');
    refreshAll();
  }
  function setLoad(l) {
    document.querySelectorAll('#loadSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.load === l)); });
    cell.load = l;
    $('rRow').hidden = l !== 'R';
    flowing = false;
    pushSample();
  }
  function setElec(e) {
    state.elec = e;
    document.querySelectorAll('#elecSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.elec === e)); });
  }
  function setTab(t, quiet) {
    state.tab = t;
    document.querySelectorAll('#tabs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === t)); });
    if (!quiet) { updateGraphText(); drawGraph(); }
  }
  function setSpeed(i) {
    state.speed = i;
    [0, 1, 2, 3].forEach(function (k) { $('sp' + k).setAttribute('aria-pressed', String(k === i)); });
  }
  function setRunning(on) {
    state.running = on;
    $('play').textContent = on ? T('暫停', 'Pause') : T('播放', 'Play');
    setStatus('');
    if (on) startLoop(); else { updateReadouts(); drawStage(); }
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function acted() { userActed = true; }

  // ======================= 未知金屬 =======================
  function setUnkUI() {
    const cellM = state.mode === 'cell', u = cellM ? unkC : unkE;
    $('unkTitle').textContent = cellM ? T('未知電極 X', 'Unknown electrode X') : T('未知金屬 M', 'Unknown metal M');
    $('unkHint').innerHTML = cellM ?
      T('左邊換成未知金屬 X 浸在 X<sup>2+</sup> 溶液中。用右邊已知的半電池量電壓，求 X<sup>2+</sup>/X 的標準還原電位 E°（容許誤差 0.005 V，可核對 3 次）。', 'The left half-cell becomes an unknown metal X in X<sup>2+</sup> solution. Measure against a known half-cell on the right and find the standard reduction potential E° of X<sup>2+</sup>/X (within 0.005 V; three tries).') :
      T('溶液換成未知的二價金屬離子 M<sup>2+</sup>（石墨電極）。電解後秤陰極，求 M 的莫耳質量（容許誤差 1%，可核對 3 次）。', 'The solution becomes an unknown metal ion M<sup>2+</sup> (graphite electrodes). Electrolyse, weigh the cathode and find the molar mass of M (within 1%; three tries).');
    $('ansLabel').innerHTML = cellM ? T('E°（V）', 'E° (V)') : T('M（g/mol）', 'M (g/mol)');
    $('unkBox').hidden = !u;
    $('unkOn').hidden = !!u;
    if (!u) $('unkOut').innerHTML = '';
    document.querySelectorAll('#elecSeg button').forEach(function (b) { b.disabled = !!unkE; });
  }
  function startUnknown() {
    acted();
    if (state.mode === 'cell') {
      unkC = { id: ++unkSeq, E: C.newUnknownE(), tries: 0, revealed: false };
      resetHalf('L');
    } else {
      unkE = { id: ++unkSeq, metal: C.newUnknownMetal(), tries: 0, revealed: false };
      setElec('C');
      newElectro();
    }
    $('ansU').value = '';
    setUnkUI();
    $('unkOut').innerHTML = T('新的未知樣品已放好。', 'A new unknown sample is ready.');
    pushSample();
    refreshAll();
  }
  function stopUnknown() {
    acted();
    if (state.mode === 'cell') { unkC = null; resetHalf('L'); }
    else { unkE = null; newElectro(); }
    setUnkUI();
    refreshAll();
  }
  function parseNum(s) {
    s = String(s || '').normalize('NFKC').replace(/[，,]/g, '.').replace(/[−–—]/g, '-').replace(/\s+/g, '');
    return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(s) ? parseFloat(s) : NaN;
  }
  function checkAnswer() {
    acted();
    const cellM = state.mode === 'cell', u = cellM ? unkC : unkE;
    if (!u) return;
    const a = parseNum($('ansU').value);
    if (!isFinite(a)) { $('unkOut').innerHTML = T('請輸入一個數字。', 'Please enter a number.'); return; }
    if (u.tries >= 3 && !u.revealed) { $('unkOut').innerHTML = T('三次機會用完了：按「揭曉答案」或「換一個」。', 'No tries left: press “Reveal” or “Another one”.'); return; }
    u.tries++;
    let ok, err;
    if (cellM) { err = Math.abs(a - u.E); ok = err <= 0.005 + 1e-9; }
    else { const tM = M[u.metal].M; err = Math.abs(a - tM) / tM; ok = err <= 0.01 + 1e-12; }
    if (window.LabMission) window.LabMission.emit(cellM ? 'answerE' : 'answerM', { ans: a, err: err, tries: u.tries, revealed: u.revealed });
    $('unkOut').innerHTML = ok ? '<span class="ok">' + T('正確！', 'Correct!') + '</span> ' + (cellM ? 'E° = ' + num(u.E, 3) + ' V' : T('M = ', 'M = ') + num(M[u.metal].M, 2) + ' g/mol（' + nm(u.metal) + '）') :
      '<span class="no">' + T('還不對。', 'Not yet.') + '</span> ' + (u.tries < 3 ? T('還有 ', '') + (3 - u.tries) + T(' 次機會。', ' tries left.') : T('三次機會用完了。', 'No tries left.')) +
      (cellM ? T('提示：先算出 X 的電極電位，再用能斯特方程式扣掉濃度的影響。', ' Hint: find the electrode potential of X first, then remove the effect of concentration with the Nernst equation.') :
        T('提示：M = Δm × 2F ÷ Q；離子濃度太低時有一部分電流產生氫氣。', ' Hint: M = Δm × 2F ÷ Q; if the ions run low, part of the current gives hydrogen.'));
    if (snd()) { if (ok) { window.LabSound.tone({ freq: 784, dur: 0.1, gain: 0.1 }); window.LabSound.tone({ freq: 1175, dur: 0.16, gain: 0.1, delay: 0.1 }); } else window.LabSound.tone({ freq: 311, dur: 0.18, gain: 0.08, type: 'triangle' }); }
  }
  function reveal() {
    acted();
    const cellM = state.mode === 'cell', u = cellM ? unkC : unkE;
    if (!u) return;
    u.revealed = true;
    $('unkOut').innerHTML = cellM ? T('答案：E°(X<sup>2+</sup>/X) = ', 'Answer: E°(X<sup>2+</sup>/X) = ') + num(u.E, 3) + ' V' :
      T('答案：M 是', 'Answer: M is ') + nm(u.metal) + '，' + num(M[u.metal].M, 2) + ' g/mol';
    refreshAll();
  }

  // ======================= 事件 =======================
  function onCellSlider(el) {
    if (syncing) return;
    acted();
    if (el === elCL) resetHalf('L');
    else if (el === elCR) resetHalf('R');
    else if (el === elVol) { newCell(); }
    else if (el === elR) { cell.Rload = val(elR); }
    pushSample();
    setStatus('');
    refreshAll();
  }
  function onElecSlider(el) {
    if (syncing) return;
    acted();
    if (el === elAmp) { elx.I = val(elAmp); }
    else if (el === elTimer) {
      elecOff = timerOn() && elx.t >= val(elTimer) - 1e-9;
      if (!elecOff && statusOverride) statusOverride = '';
    } else newElectro();
    pushSample();
    setStatus(statusOverride && el === elTimer ? statusOverride : '');
    refreshAll();
  }
  [elCL, elCR, elVol, elR].forEach(function (el) { el.addEventListener('input', function () { onCellSlider(el); }); });
  [elCE, elVE, elAmp, elTimer].forEach(function (el) { el.addEventListener('input', function () { onElecSlider(el); }); });
  elBridge.addEventListener('change', function () {
    acted();
    cell.bridge = elBridge.checked;
    flowing = false;
    pushSample();
    if (snd()) { window.LabSound.tone({ freq: cell.bridge ? 660 : 440, dur: 0.07, gain: 0.08 }); if (cell.bridge) window.LabSound.tone({ freq: 990, dur: 0.1, gain: 0.08, delay: 0.07 }); }
    setStatus('');
    refreshAll();
  });
  document.querySelectorAll('#loadSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); setLoad(b.dataset.load); setStatus(''); refreshAll(); }); });
  document.querySelectorAll('#elecSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); if (unkE || b.dataset.elec === state.elec) return; setElec(b.dataset.elec); newElectro(); pushSample(); setStatus(''); refreshAll(); });
  });
  document.querySelectorAll('#modeSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); if (b.dataset.mode !== state.mode) setMode(b.dataset.mode); }); });
  document.querySelectorAll('#tabs button').forEach(function (b) { b.addEventListener('click', function () { acted(); setTab(b.dataset.tab); }); });
  $('play').addEventListener('click', function () { acted(); setRunning(!state.running); });
  $('restart').addEventListener('click', function () {
    acted();
    if (state.mode === 'cell') newCell(); else newElectro();
    pushSample();
    setStatus(T('已換上新的溶液與電極。', 'Fresh solutions and electrodes are in place.'));
    refreshAll();
  });
  $('clearAll').addEventListener('click', function () {
    acted();
    histC = []; histE = []; rowsC = []; rowsE = [];
    segId++;
    pushSample();
    setStatus(T('已清除圖表與紀錄表（目前的電池與設定保留）。', 'The graphs and the table have been cleared (the cell and the settings are kept).'));
    refreshAll();
  });
  [0, 1, 2, 3].forEach(function (k) { $('sp' + k).addEventListener('click', function () { acted(); setSpeed(k); }); });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
    if (ev.detail && ev.detail.name === 'fs') resize();
    if (ev.detail && ev.detail.name === 'lang') { buildMetals(); setUnkUI(); refreshAll(); }
  });
  $('record').addEventListener('click', record);
  $('unkOn').addEventListener('click', startUnknown);
  $('unkOff').addEventListener('click', stopUnknown);
  $('unkNew').addEventListener('click', startUnknown);
  $('check').addEventListener('click', checkAnswer);
  $('ansU').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); checkAnswer(); } });
  $('reveal').addEventListener('click', reveal);

  if (window.LabKeys) {
    const logStep = function (el, lo, hi, d, big) {
      const v = val(el), f = Math.pow(hi / lo, (big ? 0.05 : 0.01) * d);
      setValUser(el, Math.max(lo, Math.min(hi, v * f)));
    };
    kb = window.LabKeys.attach(cv, {
      label: T('實驗畫面。按 Enter 切換要調整的項目，方向鍵改變濃度或電流，Shift 加方向鍵改變得更多。', 'Experiment. Press Enter to pick what to adjust; the arrow keys change a concentration or the current; hold Shift for bigger steps.'),
      items: [
        { name: function () { return state.mode === 'cell' ? T('左半電池的濃度', 'Left concentration') : T('電流', 'Current'); },
          move: function (dx, dy, big) {
            const d = dx || -dy;
            if (!d) return false;
            if (state.mode === 'cell') logStep(elCL, 0.001, 2, d, big);
            else setValUser(elAmp, Math.max(0, Math.min(2, Math.round((val(elAmp) + d * (big ? 0.1 : 0.01)) * 100) / 100)));
            return true;
          },
          describe: function () { return state.mode === 'cell' ? '[' + metalL() + '] = ' + concTxt(cell.L.c) + ' M, E = ' + num(reading(), 3) + ' V' : 'I = ' + num(elx.I, 2) + ' A'; } },
        { name: function () { return state.mode === 'cell' ? T('右半電池的濃度', 'Right concentration') : T('溶液濃度', 'Solution concentration'); },
          move: function (dx, dy, big) {
            const d = dx || -dy;
            if (!d) return false;
            if (state.mode === 'cell') logStep(elCR, 0.001, 2, d, big);
            else setValUser(elCE, Math.max(0.05, Math.min(1, Math.round((val(elCE) + d * (big ? 0.1 : 0.01)) * 100) / 100)));
            return true;
          },
          describe: function () { return state.mode === 'cell' ? '[' + state.R + '] = ' + concTxt(cell.R.c) + ' M, E = ' + num(reading(), 3) + ' V' : 'c = ' + concTxt(elx.c) + ' M'; } }
      ],
      onChange: function () { drawStage(); }
    });
  }
  /** 程式代替使用者改滑桿（會觸發一般的 input 事件流程） */
  function setValUser(el, v) { if (window.LabNum) window.LabNum.set(el, v); else { el.value = v; el.dispatchEvent(new Event('input')); } }

  function buildETable() {
    const el = $('eTable');
    if (!el) return;
    const rows = REAL.slice().sort(function (a, b) { return M[b].E - M[a].E; }).map(function (k) {
      const z = M[k].z;
      return [ionH(k) + ' + ' + (z > 1 ? z : '') + 'e<sup>−</sup> → ' + k, M[k].E];
    });
    rows.splice(0, 0, ['O<sub>2</sub> + 4H<sup>+</sup> + 4e<sup>−</sup> → 2H<sub>2</sub>O', C.E_O2]);
    rows.splice(rows.findIndex(function (r) { return r[1] < 0; }), 0, ['2H<sup>+</sup> + 2e<sup>−</sup> → H<sub>2</sub>', 0]);
    let h = '<thead><tr><th>' + T('半反應', 'Half-reaction') + '</th><th>E°<br><small>V</small></th></tr></thead><tbody>';
    rows.forEach(function (r) { h += '<tr><td style="text-align:left">' + r[0] + '</td><td>' + (r[1] > 0 ? '+' : '') + num(r[1], r[1] === 0 ? 2 : (String(Math.abs(r[1])).split('.')[1] || '').length) + '</td></tr>'; });
    el.innerHTML = h + '</tbody>';
  }

  function themeChanged() {
    if (LD.refresh) LD.refresh();
    readColors();
    refreshAll();
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lg = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', resize);
  // 暫停時離子仍慢慢晃（低頻重畫）
  setInterval(function () {
    if (state.running) return;
    const save = ePhase;
    animate(0.1);
    ePhase = save;
    drawStage();
  }, 150);
  // 任務：每 0.5 秒回報一次目前的狀態
  function tickData() {
    const h = function (x) { return { metal: x.metal, c: x.c, c0: x.c0, m: x.m, m0: x.m0 }; };
    return {
      mode: state.mode, running: state.running,
      cell: { L: h(cell.L), R: h(cell.R), bridge: cell.bridge, load: cell.load, Rload: cell.Rload, E: reading(), emf: emfNow(), E0: cell.E0,
        I: curNow(), q: cell.q, qAbs: cell.qAbs, t: cell.t, unk: !!unkC },
      elec: { elec: elx.elec, metal: elx.metal, unk: !!unkE, c: elx.c, c0: elx.c0, V: elx.V, I: elx.I, q: elx.q, t: elx.t, dep: elx.dep,
        mCath: elx.mCath, mAnode: elx.mAnode, base: elx.base, H2: elx.nH2 * C.VM * 1000, O2: elx.nO2 * C.VM * 1000, off: elecOff || !!elx.spent,
        paused: !state.running || elecOff || !!elx.spent }
    };
  }
  setInterval(function () { if (userActed && window.LabMission) window.LabMission.emit('tick', tickData()); }, 500);

  // 測試用（Playwright）：讀取目前狀態
  window.__ec = {
    state: state, cell: function () { return cell; }, elx: function () { return elx; }, rowsC: function () { return rowsC; }, rowsE: function () { return rowsE; },
    unkC: function () { return unkC; }, unkE: function () { return unkE; }, tick: tickData, off: function () { return elecOff; }
  };

  // ======================= 啟動 =======================
  readColors();
  setVal(elCL, 1); setVal(elCR, 1); setVal(elR, 10);
  layout0();
  function layout0() { cw = cv.clientWidth || 600; ch = 420; layout(); }
  buildMetals();
  newCell();
  newElectro();
  setLoad('V');
  setElec('C');
  setSpeed(1);
  setMode('cell');
  buildETable();
  updateSoundButton();
  setRunning(state.running);
  pushSample();
  resize();
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：按「播放」開始。', 'Reduced motion is on: press “Play” to start.'));
})();
