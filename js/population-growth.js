/* population-growth.js — 「族群成長」的畫面與互動（族群模型全部在 population-growth-core.js；3D 在 population-growth-3d.js，切換時才載入） */
(function () {
  'use strict';
  const P = window.PopCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const EN = T('0', '1') === '1';
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const FONT = D.FONT;
  const STOCH_CAP = 3000;     // 資源無限的隨機模型：超過這個數量改用平均值
  const MAX_CELLS = 600;      // 培養皿最多畫幾個點
  const DUR1 = 6;             // 第一部分：一次培養的動畫秒數
  const MAX_KEPT = 8, MAX_KEPT2 = 6, MAX_ROWS = 12;

  // =====================================================================
  // 顏色
  // =====================================================================
  const C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['pg-n', 'pg-k', 'pg-cell', 'pg-agar', 'pg-prey', 'pg-pred', 'pg-s1', 'pg-s2', 'pg-eq']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function keptColor(i) {
    const light = ['#64748b', '#7c3aed', '#be185d', '#0369a1', '#a16207', '#4d7c0f', '#9f1239', '#475569'];
    const dark = ['#94a3b8', '#c4b5fd', '#f9a8d4', '#7dd3fc', '#fcd34d', '#bef264', '#fda4af', '#cbd5e1'];
    return (D.dark ? dark : light)[i % 8];
  }

  // =====================================================================
  // 數字
  // =====================================================================
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function sig3(x) { const a = Math.abs(x); return num(x, a < 10 ? 2 : a < 100 ? 1 : 0); }
  function expoStr(v, html) {
    const e = Math.floor(Math.log10(Math.abs(v))), m = v / Math.pow(10, e);
    return html ? num(m, 2) + '×10<sup>' + e + '</sup>' : num(m, 2) + 'e' + e;
  }
  /** 族群數量：小的寫到小數一位、大的用萬／億／兆（英文用 million、billion） */
  function fmtN(v, html) {
    if (v == null || !isFinite(v)) return v === Infinity ? '∞' : '—';
    const a = Math.abs(v);
    if (a < 100) return num(v, Math.abs(v - Math.round(v)) < 1e-6 ? 0 : 1);
    if (a < 1e4) return num(Math.round(v), 0);
    if (EN) {
      if (a < 1e6) return Math.round(v).toLocaleString('en-US');
      if (a >= 1e18) return expoStr(v, html);
      const u = [[1e15, ' quadrillion'], [1e12, ' trillion'], [1e9, ' billion'], [1e6, ' million']];
      for (let i = 0; i < u.length; i++) if (a >= u[i][0]) return sig3(v / u[i][0]) + u[i][1];
    }
    if (a >= 1e16) return expoStr(v, html);
    const z = [[1e12, ' 兆'], [1e8, ' 億'], [1e4, ' 萬']];
    for (let i = 0; i < z.length; i++) if (a >= z[i][0]) return sig3(v / z[i][0]) + T(z[i][1], '');
    return num(v, 0);
  }
  function days(t, d) { return num(t, d == null ? 1 : d) + T(' 天', ' d'); }
  function niceStep(span, target) {
    const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function niceCeil(v) {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    return (m <= 1 ? 1 : m <= 1.5 ? 1.5 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 3 ? 3 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 6 ? 6 : m <= 8 ? 8 : 10) * p;
  }

  // =====================================================================
  // 滑桿
  // =====================================================================
  const el = {
    r: $('r'), K: $('K'), N0: $('N0'), tEnd: $('tEnd'),
    pa: $('pa'), pb: $('pb'), pc: $('pc'), pd: $('pd'), pK: $('pK'), pE: $('pE'),
    r1: $('r1'), r2: $('r2'), K1: $('K1'), K2: $('K2'), a12: $('a12'), a21: $('a21'),
    x0: $('x0'), y0: $('y0'), t2: $('t2')
  };
  function setRange(r, v) {
    if (window.LabNum) window.LabNum.set(r, v);
    else r.value = String(v);
  }
  /** 拖曳時直接改滑桿（不觸發事件，避免每動一下都算成一次操作） */
  function setQuiet(r, v) {
    if (window.LabNum && window.LabNum.clear) window.LabNum.clear(r);
    r.value = String(v);
  }
  function refreshOutputs() {
    const set = function (id, s) { const o = $(id); if (o) o.textContent = s; };
    set('ro', num(val(el.r), 3)); set('Ko', num(val(el.K), 0)); set('N0o', num(val(el.N0), 0)); set('tEndo', num(val(el.tEnd), 0));
    set('pao', num(val(el.pa), 3)); set('pbo', num(val(el.pb), 4)); set('pco', num(val(el.pc), 4)); set('pdo', num(val(el.pd), 3));
    set('pKo', num(val(el.pK), 0)); set('pEo', num(val(el.pE), 3));
    set('r1o', num(val(el.r1), 3)); set('r2o', num(val(el.r2), 3)); set('K1o', num(val(el.K1), 0)); set('K2o', num(val(el.K2), 0));
    set('a12o', num(val(el.a12), 3)); set('a21o', num(val(el.a21), 3));
    set('x0o', num(val(el.x0), 1)); set('y0o', num(val(el.y0), 1)); set('t2o', num(val(el.t2), 0));
  }

  // =====================================================================
  // 音效、狀態
  // =====================================================================
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  /** 每倍增一次響一聲，音高升半音：指數成長越響越快，邏輯斯接近 K 時就安靜下來 */
  function sndDouble(k) { const S = sound(); if (S) S.tone({ freq: 330 * Math.pow(2, Math.min(k, 30) / 12), dur: 0.07, gain: 0.07, type: 'triangle' }); }
  function sndExtinct() { const S = sound(); if (S) S.sweep({ from: 620, to: 260, dur: 0.45, gain: 0.12, type: 'sine' }); }
  function sndFull() { const S = sound(); if (S) { S.tone({ freq: 784, dur: 0.18, gain: 0.06 }); S.tone({ freq: 1046, dur: 0.25, gain: 0.05, delay: 0.12 }); } }
  function sndPeak(pred) { const S = sound(); if (S) S.tone({ freq: pred ? 440 : 880, dur: 0.09, gain: 0.07, type: pred ? 'triangle' : 'sine' }); }
  function say(s) { const e = $('srSay'); e.textContent = ''; setTimeout(function () { e.textContent = s; }, 30); }
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function setStatus(s) { $('status').textContent = s; }

  // =====================================================================
  // 繪圖共用
  // =====================================================================
  function fit(c, g, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300;
    c.style.height = h + 'px';
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h };
  }
  function plotFrame(g, p) {
    D.roundRect(g, p.x0 - 4, p.y0 - 4, p.x1 - p.x0 + 8, p.y1 - p.y0 + 8, 8);
    g.fillStyle = D.alpha(D.c.surface, D.dark ? 0.35 : 0.7); g.fill();
    g.strokeStyle = D.alpha(D.c.border, 0.9); g.lineWidth = 1; g.stroke();
  }
  function hLine(g, p, y, a) {
    g.strokeStyle = D.alpha(D.c.text, a); g.lineWidth = 1;
    g.beginPath(); g.moveTo(p.x0, Math.round(y) + 0.5); g.lineTo(p.x1, Math.round(y) + 0.5); g.stroke();
  }
  /** 橫軸刻度；最右邊留給單位 */
  function xTicks(g, p, lo, hi, step, fmt, xOf, unit) {
    g.font = '11px ' + FONT; g.fillStyle = D.c.muted; g.textBaseline = 'top';
    g.textAlign = 'right';
    const wl = g.measureText(unit).width;
    g.fillText(unit, p.x1, p.y1 + 6);
    g.textAlign = 'center';
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) {
      const x = xOf(v);
      if (x > p.x1 - wl - 16) break;
      g.fillText(fmt(v), x, p.y1 + 6);
      g.strokeStyle = D.alpha(D.c.text, 0.05);
      g.beginPath(); g.moveTo(Math.round(x) + 0.5, p.y0); g.lineTo(Math.round(x) + 0.5, p.y1); g.stroke();
    }
  }
  function yTicksLin(g, p, lo, hi, step, fmt, yOf) {
    g.font = '11px ' + FONT; g.fillStyle = D.c.muted; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) {
      const y = yOf(v);
      g.fillText(fmt(v), p.x0 - 7, y);
      hLine(g, p, y, Math.abs(v) < 1e-9 ? 0.22 : 0.07);
    }
  }
  /** 以每個像素一組（最大、最小值）畫折線，資料很多時也不會漏掉尖峰；step = true 時畫成階梯（隨機的個體數） */
  function series(g, ts, ys, tMax, xOf, yOf, stepwise) {
    const n = ts.length;
    if (n < 1) return;
    g.beginPath();
    let started = false, px = -1, lo = 0, hi = 0, first = 0, last = 0, cnt = 0, prevY = null;
    const flush = function () {
      if (!cnt) return;
      const yF = yOf(first), yL = yOf(last);
      if (!started) { g.moveTo(px, yF); started = true; }
      else if (stepwise && prevY != null) { g.lineTo(px, prevY); g.lineTo(px, yF); }
      else g.lineTo(px, yF);
      if (cnt > 2) { g.lineTo(px, yOf(lo)); g.lineTo(px, yOf(hi)); }
      g.lineTo(px, yL);
      prevY = yL;
    };
    for (let i = 0; i < n; i++) {
      if (ts[i] > tMax + 1e-9) break;
      const x = Math.round(xOf(ts[i]) * 2) / 2;
      const y = ys[i];
      if (x !== px) { flush(); px = x; lo = hi = first = last = y; cnt = 1; }
      else { if (y < lo) lo = y; if (y > hi) hi = y; last = y; cnt++; }
    }
    flush();
    if (stepwise && prevY != null) { const xe = Math.round(xOf(tMax) * 2) / 2; if (xe > px) g.lineTo(xe, prevY); }
    g.stroke();
  }
  function evPos(c, ev) { const r = c.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }

  // =====================================================================
  // 一・單一族群
  // =====================================================================
  const s1 = { model: 'expo', stoch: false, logY: false, keep: true };
  let run = null, kept = [], rows = [], runSeq = 0, inspectT = null;
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W1 = 0, H1 = 0, L1 = null;

  function params1() {
    return { model: s1.model, stoch: s1.stoch, r: val(el.r), K: val(el.K), N0: Math.max(1, Math.round(val(el.N0))), tEnd: val(el.tEnd) };
  }
  function theoryN(r1, t) { return r1.model === 'expo' ? P.expo(r1.N0, r1.r, t) : P.logistic(r1.N0, r1.r, r1.K, t); }
  function simulate1(det) {
    const p = params1();
    if (det) p.stoch = false;
    const Kx = p.model === 'expo' ? Infinity : p.K;
    const o = Object.assign({}, p, { Kx: Kx, head: 0, playing: false, emitted: false, id: ++runSeq, capT: NaN, extinct: false, tExt: NaN, nDouble: 0, full: false });
    if (p.stoch) {
      o.seed = (Math.random() * 4294967296) >>> 0;
      const g = P.gillespie({ N0: p.N0, r: p.r, K: Kx, tEnd: p.tEnd, rand: P.rng(o.seed), cap: isFinite(Kx) ? 1e7 : STOCH_CAP, every: p.tEnd / 1500 });
      o.t = g.t; o.N = g.N; o.extinct = g.extinct; o.tExt = g.tExtinct;
      const tl = g.t[g.t.length - 1], Nl = g.N[g.N.length - 1];
      if (!g.extinct && Nl >= STOCH_CAP && tl < p.tEnd - 1e-9) {
        o.capT = tl;
        for (let i = 1; i <= 400; i++) { const tt = tl + (p.tEnd - tl) * i / 400; o.t.push(tt); o.N.push(Nl * Math.exp(p.r * (tt - tl))); }
      }
    } else {
      const n = 800;
      o.t = new Array(n + 1); o.N = new Array(n + 1);
      for (let i = 0; i <= n; i++) { const t = p.tEnd * i / n; o.t[i] = t; o.N[i] = theoryN(o, t); }
    }
    let mx = 0; for (let i = 0; i < o.N.length; i++) if (o.N[i] > mx) mx = o.N[i];
    o.Nmax = mx;
    o.Nend = nAt(o, p.tEnd);
    o.tStop = o.extinct ? Math.min(p.tEnd, o.tExt + Math.max(0.5, 0.06 * p.tEnd)) : p.tEnd;
    return o;
  }
  /** 某時刻的族群數量（隨機模型是階梯函數；改用平均值後內插） */
  function nAt(o, t) {
    if (!o.stoch) return theoryN(o, t);
    const ts = o.t;
    if (t <= ts[0]) return o.N[0];
    if (t >= ts[ts.length - 1]) return o.N[o.N.length - 1];
    let lo = 0, hi = ts.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= t) lo = m; else hi = m; }
    if (isFinite(o.capT) && t > o.capT) return o.N[lo] + (o.N[hi] - o.N[lo]) * (t - ts[lo]) / (ts[hi] - ts[lo]);
    return o.N[lo];
  }
  function rateAt(o, N) { return o.model === 'expo' ? P.rateExpo(N, o.r) : P.rateLogistic(N, o.r, o.K); }

  // ---------- 培養皿裡的草履蟲 ----------
  const slots = (function () {
    const rnd = P.rng(20251112), a = [];
    for (let i = 0; i < MAX_CELLS; i++) {
      const rr = Math.sqrt((i + 0.5) / MAX_CELLS) * 0.9, th = i * 2.399963 + rnd() * 0.5;
      a.push({ x: rr * Math.cos(th), y: rr * Math.sin(th), ang: rnd() * Math.PI * 2, ph: rnd() * 6.283, w: 0.6 + rnd() * 0.9, sz: 0.85 + rnd() * 0.3 });
    }
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  })();
  let cellSprite = null, cellKey = '';
  function makeCell(sc) {
    const key = [C['pg-cell'], sc.toFixed(2), D.dark, D.ver].join('|');
    if (cellSprite && cellKey === key) return cellSprite;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = 18 * sc, h = 9 * sc;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const cx = w / 2, cy = h / 2, rx = w * 0.4, ry = h * 0.32;
    // 纖毛
    g.strokeStyle = D.alpha(C['pg-cell'], 0.45); g.lineWidth = 0.6;
    g.beginPath();
    for (let k = 0; k < 22; k++) {
      const a = k / 22 * Math.PI * 2, x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
      g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 1.6 * sc, y + Math.sin(a) * 1.6 * sc);
    }
    g.stroke();
    // 身體（拖鞋形：一端略尖）
    const grd = g.createLinearGradient(cx, cy - ry, cx, cy + ry);
    grd.addColorStop(0, D.mix(C['pg-cell'], '#ffffff', D.dark ? 0.15 : 0.35));
    grd.addColorStop(1, D.shade(C['pg-cell'], D.dark ? -0.15 : -0.2));
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(cx - rx, cy);
    g.bezierCurveTo(cx - rx, cy - ry * 1.1, cx + rx * 0.6, cy - ry * 1.15, cx + rx, cy - ry * 0.1);
    g.bezierCurveTo(cx + rx * 1.02, cy + ry * 0.5, cx + rx * 0.2, cy + ry * 1.1, cx - rx * 0.4, cy + ry * 0.95);
    g.bezierCurveTo(cx - rx * 0.85, cy + ry * 0.8, cx - rx, cy + ry * 0.4, cx - rx, cy);
    g.fill();
    g.strokeStyle = D.alpha(D.shade(C['pg-cell'], -0.35), 0.7); g.lineWidth = 0.7; g.stroke();
    // 口溝與大核
    g.strokeStyle = D.alpha(D.shade(C['pg-cell'], -0.4), 0.6); g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(cx - rx * 0.1, cy + ry * 0.55); g.quadraticCurveTo(cx + rx * 0.2, cy + ry * 0.1, cx + rx * 0.05, cy - ry * 0.2); g.stroke();
    g.fillStyle = D.alpha(D.shade(C['pg-cell'], -0.3), 0.55);
    g.beginPath(); g.ellipse(cx - rx * 0.25, cy - ry * 0.1, rx * 0.22, ry * 0.36, 0.2, 0, Math.PI * 2); g.fill();
    cellSprite = { c: c, w: w, h: h }; cellKey = key;
    return cellSprite;
  }

  function resize1() {
    const w = cv.clientWidth || 300;
    const narrow = w < 640;
    let h, dish, pN, pR;
    if (!narrow) {
      h = 440;
      const size = Math.min(h - 70, Math.round(w * 0.34));
      dish = { cx: 14 + size / 2, cy: 36 + size / 2, R: size / 2 - 6 };
      const gx0 = 14 + size + 70, gx1 = w - 16;
      pN = { x0: gx0, x1: gx1, y0: 28, y1: 238 };
      pR = { x0: gx0, x1: gx1, y0: 290, y1: h - 34 };
    } else {
      const dh = 214;
      dish = { cx: w / 2, cy: 36 + (dh - 36) / 2 + 4, R: Math.min(w * 0.36, (dh - 40) / 2) };
      pN = { x0: 58, x1: w - 14, y0: dh + 52, y1: dh + 52 + 190 };
      pR = { x0: 58, x1: w - 14, y0: pN.y1 + 56, y1: pN.y1 + 56 + 120 };
      h = pR.y1 + 32;
    }
    const s = fit(cv, ctx, h);
    W1 = s.w; H1 = s.h;
    L1 = { narrow: narrow, dish: dish, pN: pN, pR: pR };
    draw1();
  }

  function scales1() {
    const o = run;
    const p = L1.pN;
    const tMax = o.tEnd;
    let top = Math.max(o.Nmax, o.N0, o.model === 'logi' ? o.K : 0);
    const xOf = function (t) { return p.x0 + (p.x1 - p.x0) * t / tMax; };
    let yOf, lo, hi;
    if (s1.logY) {
      lo = 0; hi = Math.max(1, Math.ceil(Math.log10(top * 1.05)));
      yOf = function (N) { const l = N > 0 ? Math.log10(N) : -0.3; return p.y1 - (p.y1 - p.y0) * (Math.max(-0.3, l) - lo) / (hi - lo); };
    } else {
      lo = 0; hi = niceCeil(top * 1.05);
      yOf = function (N) { return p.y1 - (p.y1 - p.y0) * N / hi; };
    }
    return { xOf: xOf, yOf: yOf, lo: lo, hi: hi, tMax: tMax };
  }

  function draw1() {
    if (!L1 || !run) return;
    const g = ctx;
    D.backdrop(g, W1, H1);
    drawDish(g);
    drawNgraph(g);
    drawRateGraph(g);
  }
  function drawDish(g) {
    const o = run, d = L1.dish, t = o.head, N = nAt(o, t);
    const cx = d.cx, cy = d.cy, R = d.R;
    // 影子
    g.save();
    g.fillStyle = D.alpha(D.dark ? '#000000' : D.c.text, D.dark ? 0.35 : 0.12);
    g.beginPath(); g.ellipse(cx + 4, cy + R * 0.08 + 6, R * 1.02, R * 0.98, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    // 培養液：族群越接近 K，食物越少，顏色越淡
    const frac = o.model === 'logi' ? Math.max(0, Math.min(1, N / o.K)) : 0;
    const agar = D.mix(C['pg-agar'], D.dark ? '#1a1a1a' : '#d9d6cc', 0.55 * frac);
    const gm = g.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    gm.addColorStop(0, D.mix(agar, '#ffffff', D.dark ? 0.06 : 0.45));
    gm.addColorStop(1, D.shade(agar, D.dark ? -0.1 : -0.06));
    g.fillStyle = gm;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    // 草履蟲
    const per = N > MAX_CELLS ? N / MAX_CELLS : 1;
    const n = Math.min(MAX_CELLS, Math.max(0, Math.round(N)));
    const sc = Math.max(0.75, Math.min(1.25, R / 150));
    const sp = makeCell(sc);
    const now = performance.now() / 1000;
    const moving = !reducedMotion && (o.playing || run2Playing());
    const dpr0 = Math.min(2, window.devicePixelRatio || 1);
    g.save();
    g.beginPath(); g.arc(cx, cy, R - 2, 0, Math.PI * 2); g.clip();
    for (let i = 0; i < n; i++) {
      const c = slots[i];
      let x = cx + c.x * R, y = cy + c.y * R, a = c.ang;
      if (moving) { x += Math.sin(now * c.w + c.ph) * R * 0.025; y += Math.cos(now * c.w * 0.8 + c.ph) * R * 0.025; a += Math.sin(now * c.w * 0.5 + c.ph) * 0.4; }
      const dpr = dpr0;
      const ca = Math.cos(a), sa = Math.sin(a);
      g.setTransform(dpr * ca * c.sz, dpr * sa * c.sz, -dpr * sa * c.sz, dpr * ca * c.sz, dpr * x, dpr * y);
      g.drawImage(sp.c, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
    }
    g.setTransform(dpr0, 0, 0, dpr0, 0, 0);
    g.restore();
    // 玻璃邊與反光
    g.save();
    g.lineWidth = Math.max(3, R * 0.035);
    const gr = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    gr.addColorStop(0, D.alpha('#ffffff', D.dark ? 0.35 : 0.9));
    gr.addColorStop(0.5, D.alpha(D.c.text, D.dark ? 0.25 : 0.18));
    gr.addColorStop(1, D.alpha(D.c.text, D.dark ? 0.4 : 0.32));
    g.strokeStyle = gr;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = D.alpha('#ffffff', D.dark ? 0.18 : 0.55); g.lineWidth = Math.max(2, R * 0.03);
    g.beginPath(); g.arc(cx, cy, R * 0.88, Math.PI * 1.08, Math.PI * 1.42); g.stroke();
    g.restore();
    // 標籤
    D.pill(g, T('第 ', 'Day ') + num(t, 1) + T(' 天', ''), cx, cy - R - 8, D.c.text, 'center', '600 12px ' + FONT);
    const lab = 'N = ' + fmtN(N);
    const bx = D.pill(g, lab, cx, cy + R + 24, C['pg-n'], 'center', '700 13px ' + FONT);
    if (per > 1.0001 && L1.narrow === false) D.haloText(g, T('每個點約代表 ', 'each dot ≈ ') + fmtN(per) + T(' 隻', ''), cx, bx.y + bx.h + 13, D.c.muted, 'center', 'middle', '11px ' + FONT);
    else if (per > 1.0001) D.haloText(g, T('每點約 ', '1 dot ≈ ') + fmtN(per), cx + R * 0.98, cy + R - 4, D.c.muted, 'right', 'middle', '11px ' + FONT);
    if (o.extinct && t >= o.tExt) D.pill(g, T('族群滅絕', 'Died out'), cx, cy + 9, D.c.neg || '#b91c1c', 'center', '700 14px ' + FONT);
  }

  function drawNgraph(g) {
    const o = run, p = L1.pN, S = scales1();
    plotFrame(g, p);
    // 縱軸刻度
    if (s1.logY) {
      g.font = '11px ' + FONT; g.fillStyle = D.c.muted; g.textAlign = 'right'; g.textBaseline = 'middle';
      const every = Math.max(1, Math.ceil((S.hi - S.lo) / 6));
      for (let e = S.lo; e <= S.hi; e += every) { const y = S.yOf(Math.pow(10, e)); g.fillText(fmtN(Math.pow(10, e)), p.x0 - 7, y); hLine(g, p, y, 0.08); }
    } else {
      const step = niceStep(S.hi, L1.narrow ? 4 : 5);
      yTicksLin(g, p, 0, S.hi, step, function (v) { return fmtN(v); }, S.yOf);
    }
    xTicks(g, p, 0, S.tMax, niceStep(S.tMax, L1.narrow ? 5 : 8), function (v) { return num(v, 0); }, S.xOf, T('天', 'days'));
    D.haloText(g, T('族群數量 N', 'Population N') + (s1.logY ? T('（對數刻度）', ' (log scale)') : ''), p.x0, p.y0 - 13, C['pg-n'], 'left', 'middle', '600 12px ' + FONT);
    g.save();
    g.beginPath(); g.rect(p.x0 - 2, p.y0 - 2, p.x1 - p.x0 + 4, p.y1 - p.y0 + 4); g.clip();
    // 負荷量 K 與 K/2
    if (o.model === 'logi') {
      g.setLineDash([6, 4]); g.strokeStyle = C['pg-k']; g.lineWidth = 1.5;
      const yK = S.yOf(o.K);
      g.beginPath(); g.moveTo(p.x0, yK); g.lineTo(p.x1, yK); g.stroke();
      g.setLineDash([2, 4]); g.strokeStyle = D.alpha(C['pg-k'], 0.6); g.lineWidth = 1;
      const yH = S.yOf(o.K / 2);
      g.beginPath(); g.moveTo(p.x0, yH); g.lineTo(p.x1, yH); g.stroke();
      g.setLineDash([]);
      D.haloText(g, 'K', p.x1 - 4, yK - 8, C['pg-k'], 'right', 'middle', 'italic 700 12px ' + FONT);
      D.haloText(g, 'K/2', p.x1 - 4, yH - 8, D.alpha(C['pg-k'], 0.85), 'right', 'middle', 'italic 600 11px ' + FONT);
    }
    // 保留的曲線
    kept.forEach(function (k) {
      g.strokeStyle = D.alpha(k.color, 0.75); g.lineWidth = 1.5;
      series(g, k.t, k.N, Math.min(k.tStop, S.tMax), S.xOf, S.yOf, k.stoch);
    });
    // 隨機模型：平均的理論曲線
    if (o.stoch) {
      g.setLineDash([5, 4]); g.strokeStyle = D.alpha(C['pg-n'], 0.5); g.lineWidth = 1.5;
      g.beginPath();
      for (let i = 0; i <= 200; i++) { const t = S.tMax * i / 200, x = S.xOf(t), y = S.yOf(theoryN(o, t)); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke(); g.setLineDash([]);
    }
    // 目前的曲線
    g.strokeStyle = C['pg-n']; g.lineWidth = 2.6; g.lineJoin = 'round';
    series(g, o.t, o.N, o.head, S.xOf, S.yOf, o.stoch && !(isFinite(o.capT) && o.head > o.capT));
    g.restore();
    const Nh = nAt(o, o.head);
    D.ball(g, S.xOf(o.head), Math.max(p.y0, Math.min(p.y1, S.yOf(Nh))), 5, C['pg-n']);
    if (isFinite(o.capT) && o.head > o.capT) {
      const xc = S.xOf(o.capT);
      g.strokeStyle = D.alpha(D.c.muted, 0.6); g.setLineDash([2, 3]);
      g.beginPath(); g.moveTo(xc, p.y0); g.lineTo(xc, p.y1); g.stroke(); g.setLineDash([]);
      D.haloText(g, T('超過 3000 隻後改用平均值', 'mean after 3000'), Math.min(xc + 4, p.x1 - 4), p.y0 + 10, D.c.muted, xc + 140 > p.x1 ? 'right' : 'left', 'middle', '11px ' + FONT);
    }
    // 檢視點
    if (inspectT != null) {
      const ti = Math.min(inspectT, o.head), x = S.xOf(ti), Ni = nAt(o, ti);
      g.strokeStyle = D.c.accent || C['pg-eq']; g.setLineDash([4, 3]); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x, p.y0); g.lineTo(x, p.y1); g.stroke(); g.setLineDash([]);
      D.ball(g, x, Math.max(p.y0, Math.min(p.y1, S.yOf(Ni))), 4, D.c.accent || C['pg-eq']);
      const txt = 't = ' + num(ti, 2) + T('，N = ', ', N = ') + fmtN(Ni);
      g.font = '600 12px ' + FONT;
      const tw = g.measureText(txt).width + 14;
      const right = x + tw + 6 > p.x1;
      D.pill(g, txt, right ? x - 6 : x + 6, p.y0 + 22, D.c.accent || C['pg-eq'], right ? 'right' : 'left');
    }
    if (kb1 && kb1.focused()) { g.strokeStyle = D.c.accent; g.setLineDash([4, 3]); D.roundRect(g, p.x0 - 7, p.y0 - 7, p.x1 - p.x0 + 14, p.y1 - p.y0 + 14, 10); g.stroke(); g.setLineDash([]); }
  }

  function drawRateGraph(g) {
    const o = run, p = L1.pR;
    plotFrame(g, p);
    const Nmax = o.model === 'logi' ? Math.max(o.K * 1.1, o.N0 * 1.05) : Math.max(o.Nmax, o.N0) * 1.05;
    const xM = niceCeil(Nmax);
    const xOf = function (N) { return p.x0 + (p.x1 - p.x0) * N / xM; };
    let lo = 0, hi;
    if (o.model === 'expo') hi = niceCeil(o.r * xM * 1.05);
    else { hi = niceCeil(o.r * o.K / 4 * 1.2); lo = Math.min(0, rateAt(o, xM)); if (lo < 0) lo = -niceCeil(-lo * 1.05); }
    const yOf = function (v) { return p.y1 - (p.y1 - p.y0) * (v - lo) / (hi - lo); };
    yTicksLin(g, p, lo, hi, niceStep(hi - lo, 3), function (v) { return fmtN(v); }, yOf);
    xTicks(g, p, 0, xM, niceStep(xM, L1.narrow ? 4 : 6), function (v) { return fmtN(v); }, xOf, 'N');
    D.haloText(g, T('成長速率 dN/dt（每天）', 'Growth rate dN/dt (per day)'), p.x0, p.y0 - 13, D.c.text, 'left', 'middle', '600 12px ' + FONT);
    g.save();
    g.beginPath(); g.rect(p.x0 - 2, p.y0 - 2, p.x1 - p.x0 + 4, p.y1 - p.y0 + 4); g.clip();
    if (o.model === 'logi') {
      g.lineWidth = 1;
      g.setLineDash([2, 4]); g.strokeStyle = D.alpha(C['pg-k'], 0.6);
      g.beginPath(); g.moveTo(xOf(o.K / 2), p.y0); g.lineTo(xOf(o.K / 2), p.y1); g.stroke();
      g.setLineDash([6, 4]); g.strokeStyle = C['pg-k']; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(xOf(o.K), p.y0); g.lineTo(xOf(o.K), p.y1); g.stroke();
      g.setLineDash([]);
    }
    g.strokeStyle = D.alpha(C['pg-n'], 0.85); g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i <= 160; i++) { const N = xM * i / 160, x = xOf(N), y = yOf(rateAt(o, N)); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    g.restore();
    if (o.model === 'logi') {
      const yTop = yOf(o.r * o.K / 4);
      g.strokeStyle = D.alpha(C['pg-k'], 0.7); g.lineWidth = 1; g.setLineDash([2, 3]);
      g.beginPath(); g.moveTo(p.x0, yTop); g.lineTo(xOf(o.K / 2), yTop); g.stroke(); g.setLineDash([]);
      D.haloText(g, 'rK/4', p.x0 + 4, yTop - 8, C['pg-k'], 'left', 'middle', 'italic 600 11px ' + FONT);
    }
    const Nh = nAt(o, o.head);
    D.ball(g, Math.min(p.x1, xOf(Nh)), Math.max(p.y0, Math.min(p.y1, yOf(rateAt(o, Nh)))), 5, C['pg-n']);
    if (inspectT != null) {
      const Ni = nAt(o, Math.min(inspectT, o.head));
      D.ball(g, Math.min(p.x1, xOf(Ni)), Math.max(p.y0, Math.min(p.y1, yOf(rateAt(o, Ni)))), 4, D.c.accent || C['pg-eq']);
    }
  }

  // ---------- 執行與紀錄 ----------
  function grow() {
    if (run && !run.playing && run.emitted && s1.keep && !run.initial) {
      kept.push({ t: run.t, N: run.N, tStop: run.tStop, stoch: run.stoch, color: run.color });
      if (kept.length > MAX_KEPT) kept.shift();
    }
    if (!s1.keep) kept = [];
    run = simulate1();
    run.color = keptColor(run.id - 1);
    inspectT = null;
    run.playing = true;
    run.head = 0;
    renderRows();
    setStatus(T('培養中…', 'Growing…'));
    $('pause').textContent = T('暫停', 'Pause');
    if (reducedMotion) finish1();
    request();
  }
  function finish1(silent) {
    if (!run) return;
    run.playing = false;
    run.head = run.tStop;
    $('pause').textContent = T('暫停', 'Pause');
    if (run.emitted) return;
    run.emitted = true;
    const o = run;
    const data = {
      model: o.model, stoch: o.stoch, r: o.r, K: o.model === 'logi' ? o.K : null, N0: o.N0, tEnd: o.tEnd,
      Nend: o.Nend, Nmax: o.Nmax, extinct: o.extinct, tExt: o.extinct ? o.tExt : null, td: P.doublingTime(o.r)
    };
    addRow(o);
    if (!silent) emit('grow', data);
    setStatus(status1For(o));
    say(status1For(o));
    updateReadouts1();
    request();
  }
  function status1For(o) {
    if (o.extinct) return T('族群在第 ' + num(o.tExt, 1) + ' 天滅絕了。小族群的出生與死亡全靠運氣，碰到 0 就回不來。', 'The population died out on day ' + num(o.tExt, 1) + '. In a small population births and deaths are down to chance, and zero is a one-way door.');
    if (o.model === 'expo') return T(num(o.tEnd, 0) + ' 天後，族群從 ' + fmtN(o.N0) + ' 隻變成 ' + fmtN(o.Nend) + ' 隻，每 ' + num(P.doublingTime(o.r), 2) + ' 天翻一倍。', 'After ' + num(o.tEnd, 0) + ' days the population went from ' + fmtN(o.N0) + ' to ' + fmtN(o.Nend) + ', doubling every ' + num(P.doublingTime(o.r), 2) + ' days.');
    const f = o.Nend / o.K;
    return T(num(o.tEnd, 0) + ' 天後族群有 ' + fmtN(o.Nend) + ' 隻，是負荷量的 ' + num(f * 100, 1) + '%。', 'After ' + num(o.tEnd, 0) + ' days the population is ' + fmtN(o.Nend) + ', ' + num(f * 100, 1) + '% of the carrying capacity.');
  }
  function addRow(o) {
    rows.push({ id: o.id, color: o.color, model: o.model, stoch: o.stoch, r: o.r, K: o.K, N0: o.N0, tEnd: o.tEnd, Nend: o.Nend, extinct: o.extinct, tExt: o.tExt });
    if (rows.length > MAX_ROWS) rows.shift();
    renderRows();
  }
  function renderRows() {
    const tb = $('runs');
    if (!rows.length) { tb.innerHTML = ''; return; }
    let h = '<thead><tr><th>' + T('模型', 'Model') + '</th><th>r</th><th>K</th><th>N<sub>0</sub></th><th>' + T('天數', 'Days') + '</th><th>' + T('最後的 N', 'Final N') + '</th></tr></thead><tbody>';
    rows.slice().reverse().forEach(function (x) {
      const sw = run && x.id === run.id ? C['pg-n'] : x.color;
      h += '<tr><td><i style="background:' + sw + '"></i>' + (x.model === 'expo' ? T('指數', 'Exp.') : T('邏輯斯', 'Logistic')) + (x.stoch ? T('・隨機', ' · random') : '') + '</td><td>' + num(x.r, 3) + '</td><td>' + (x.model === 'logi' ? num(x.K, 0) : '—') + '</td><td>' + x.N0 + '</td><td>' + num(x.tEnd, 0) + '</td><td>' +
        (x.extinct ? T('滅絕（第 ' + num(x.tExt, 1) + ' 天）', 'extinct (day ' + num(x.tExt, 1) + ')') : fmtN(x.Nend, true)) + '</td></tr>';
    });
    tb.innerHTML = h + '</tbody>';
  }
  function updateReadouts1() {
    if (!run) return;
    const o = run;
    const Nh = nAt(o, o.head);
    let h = '<dt>' + T('模型', 'Model') + '</dt><dd>' + (o.model === 'expo' ? T('指數成長', 'Exponential') : T('邏輯斯成長', 'Logistic')) + (o.stoch ? '<small>' + T('一隻一隻數', 'counting individuals') + '</small>' : '') + '</dd>';
    h += '<dt>' + T('倍增時間', 'Doubling time') + ' ln2/r</dt><dd>' + days(P.doublingTime(o.r), 2) + (o.model === 'logi' ? '<small>' + T('族群遠小於 K 時', 'while N is far below K') + '</small>' : '') + '</dd>';
    if (o.model === 'logi') h += '<dt>' + T('最快的成長速率', 'Fastest growth') + ' rK/4</dt><dd>' + fmtN(o.r * o.K / 4) + T(' 隻／天', ' per day') + '</dd>';
    h += '<dt>' + T('此刻', 'Now') + '<small>' + T('第 ', 'day ') + num(o.head, 1) + T(' 天', '') + '</small></dt><dd>N = ' + fmtN(Nh, true) + '<small>dN/dt = ' + fmtN(rateAt(o, Nh), true) + T(' 隻／天', ' per day') + '</small></dd>';
    if (inspectT != null) {
      const ti = Math.min(inspectT, o.head), Ni = nAt(o, ti);
      h += '<dt>' + T('檢視點', 'Inspected') + '<small>t = ' + days(ti, 2) + '</small></dt><dd>N = ' + fmtN(Ni, true) + (o.model === 'logi' ? '<small>N/K = ' + num(Ni / o.K, 3) + '</small>' : '') + '<small>dN/dt = ' + fmtN(rateAt(o, Ni), true) + T(' 隻／天', ' per day') + '</small></dd>';
    }
    if (o.stoch) {
      h += '<dt>' + T('出生率', 'Birth rate') + '<small>' + T('每隻每天', 'each, per day') + '</small></dt><dd>λ = ' + num(2 * o.r, 3) + '</dd>';
      h += '<dt>' + T('死亡率', 'Death rate') + '<small>' + T('每隻每天', 'each, per day') + '</small></dt><dd>μ = ' + num(o.r, 3) + (o.model === 'logi' ? '<small>+ ' + num(o.r, 3) + '·N/K</small>' : '') + '</dd>';
      if (o.model === 'expo') h += '<dt>' + T('最後滅絕的機率', 'Chance of dying out') + '</dt><dd>(μ/λ)<sup>N<sub>0</sub></sup> = ' + num(100 * P.extinctionProb(o.N0), o.N0 > 6 ? 3 : 1) + '%</dd>';
    }
    $('ro1').innerHTML = h;
  }

  // ---------- 檢視某一刻 ----------
  let inspectTimer = 0;
  function setInspect(t, fire) {
    if (!run) return;
    inspectT = Math.max(0, Math.min(run.head, t));
    updateReadouts1(); request();
    clearTimeout(inspectTimer);
    if (fire) inspectTimer = setTimeout(emitInspect, fire === 'now' ? 0 : 350);
  }
  function emitInspect() {
    if (!run || inspectT == null || run.initial) return;
    const o = run, t = Math.min(inspectT, o.head), N = nAt(o, t);
    emit('inspect', { model: o.model, stoch: o.stoch, r: o.r, K: o.model === 'logi' ? o.K : null, N0: o.N0, t: t, N: N, frac: o.model === 'logi' ? N / o.K : null, rate: rateAt(o, N), rmax: o.model === 'logi' ? o.r * o.K / 4 : null });
  }
  let drag1 = false;
  function tFromX(x) { const p = L1.pN; return (x - p.x0) / (p.x1 - p.x0) * run.tEnd; }
  function inN(pt) { const p = L1.pN; return pt[0] >= p.x0 - 8 && pt[0] <= p.x1 + 8 && pt[1] >= p.y0 - 16 && pt[1] <= p.y1 + 20; }
  cv.addEventListener('pointerdown', function (ev) {
    if (!run || !L1) return;
    const pt = evPos(cv, ev);
    if (!inN(pt)) return;
    drag1 = true;
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    setInspect(tFromX(pt[0]), false);
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!drag1) { cv.style.cursor = run && L1 && inN(evPos(cv, ev)) ? 'crosshair' : 'default'; return; }
    setInspect(tFromX(evPos(cv, ev)[0]), false);
  });
  const end1 = function () { if (drag1) { drag1 = false; setInspect(inspectT, 'now'); } };
  cv.addEventListener('pointerup', end1); cv.addEventListener('pointercancel', end1);
  const kb1 = window.LabKeys ? window.LabKeys.attach(cv, {
    label: T('族群成長圖：左右方向鍵移動檢視的時刻（加 Shift 一次移動比較多）。', 'Population graph: left/right arrows move the inspected moment (Shift for bigger steps).'),
    items: [{
      name: function () { return T('檢視的時刻', 'Inspected moment'); },
      move: function (dx, dy, big) {
        if (!run || !dx) return false;
        const step = run.tEnd / (big ? 20 : 200);
        setInspect((inspectT == null ? run.head / 2 : inspectT) + dx * step, true);
        return true;
      },
      describe: function () {
        if (!run || inspectT == null) return T('尚未選擇時刻', 'No moment chosen');
        const t = Math.min(inspectT, run.head);
        return 't = ' + num(t, 2) + T(' 天，N = ', ' days, N = ') + fmtN(nAt(run, t));
      }
    }],
    onChange: function () { request(); }
  }) : null;

  // =====================================================================
  // 二・兩個物種
  // =====================================================================
  let mode2 = 'pp', run2 = null, kept2 = [], rows2 = [], run2Seq = 0, frozen = null;
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  let W2 = 0, H2 = 0, L2 = null;
  function run2Playing() { return !!(run2 && run2.playing); }

  function params2() {
    if (mode2 === 'pp') return { a: val(el.pa), b: val(el.pb), c: val(el.pc), d: val(el.pd), K: $('useK').checked ? val(el.pK) : Infinity, E: val(el.pE) };
    return { r1: val(el.r1), r2: val(el.r2), K1: val(el.K1), K2: val(el.K2), a12: val(el.a12), a21: val(el.a21) };
  }
  function dev(eq, x, y) { return Math.max(Math.abs(x - eq.x) / eq.x, Math.abs(y - eq.y) / eq.y); }
  function simulateRun2(keepRange) {
    const p = params2(), x0 = Math.max(0.1, val(el.x0)), y0 = Math.max(0.1, val(el.y0)), tEnd = val(el.t2);
    const every = Math.max(0.02, Math.round(tEnd / 1500 / 0.005) * 0.005);
    const f = mode2 === 'pp' ? P.lvDeriv : P.compDeriv;
    const sim = P.simulate2(f, p, x0, y0, tEnd, { h: 0.005, every: every });
    const o = { mode: mode2, p: p, x0: x0, y0: y0, tEnd: tEnd, sim: sim, head: 0, playing: false, emitted: false, id: ++run2Seq, ver: run2Seq };
    let mx = 0, my = 0;
    for (let i = 0; i < sim.x.length; i++) { if (sim.x[i] > mx) mx = sim.x[i]; if (sim.y[i] > my) my = sim.y[i]; }
    o.maxX = mx; o.maxY = my;
    const n = sim.t.length - 1;
    o.xEnd = sim.x[n]; o.yEnd = sim.y[n];
    if (mode2 === 'pp') {
      o.eq = P.lvEquilibrium(p);
      o.T0 = o.eq.coexist ? P.lvPeriod0(p) : NaN;
      o.sum = P.lvSummary(sim);
      if (o.eq.coexist && o.eq.y > 0) {
        let a = 0; for (let i = 0; i <= n; i++) a = Math.max(a, dev(o.eq, sim.x[i], sim.y[i]));
        o.amp = a; o.startDev = dev(o.eq, x0, y0); o.endDev = dev(o.eq, o.xEnd, o.yEnd);
      } else { o.amp = NaN; o.startDev = NaN; o.endDev = NaN; }
    } else {
      const oc = P.compOutcome(p);
      o.kind = oc.kind; o.eq = oc.eq;
      o.startDev = oc.eq && oc.eq.x > 0 && oc.eq.y > 0 ? dev(oc.eq, x0, y0) : NaN;
      o.endDev = oc.eq && oc.eq.x > 0 && oc.eq.y > 0 ? dev(oc.eq, o.xEnd, o.yEnd) : NaN;
      o.winner = o.yEnd < 0.01 * p.K2 && o.xEnd > 0.5 * p.K1 ? 1 : o.xEnd < 0.01 * p.K1 && o.yEnd > 0.5 * p.K2 ? 2 : 0;
    }
    // 座標範圍：拖曳起點時先固定，放開後再重算
    if (keepRange && frozen && frozen.mode === mode2) { o.xM = frozen.xM; o.yM = frozen.yM; }
    else {
      let ax = Math.max(mx, x0), ay = Math.max(my, y0);
      if (mode2 === 'pp') {
        if (o.eq.coexist) { ax = Math.max(ax, o.eq.x * 1.6); ay = Math.max(ay, o.eq.y * 1.6); }
        if (isFinite(p.K)) ax = Math.max(ax, p.K);
      } else { ax = Math.max(ax, p.K1); ay = Math.max(ay, p.K2); }
      o.xM = niceCeil(ax * 1.08); o.yM = niceCeil(ay * 1.08);
    }
    o.tsM = niceCeil(Math.max(mx, my) * 1.08);
    return o;
  }
  function newSim2(keepRange) {
    const prev = run2;
    run2 = simulateRun2(keepRange);
    run2.preview = true;
    if (prev && prev.mode !== run2.mode) kept2 = [];
    updateReadouts2();
    if (view3) view3.rebuild();
    request();
  }
  function start2() {
    const prev = run2;
    if (prev && prev.emitted && $('keep2').checked && !prev.initial && prev.mode === mode2) {
      kept2.push({ x: prev.sim.x, y: prev.sim.y, color: prev.color });
      if (kept2.length > MAX_KEPT2) kept2.shift();
    }
    if (!$('keep2').checked) kept2 = [];
    run2 = simulateRun2(false);
    run2.color = keptColor(run2.id + 2);
    run2.playing = true; run2.head = 0; run2.preview = false;
    renderRows2();
    $('status2').textContent = T('模擬中…', 'Running…');
    if (view3) view3.rebuild();
    if (reducedMotion) finish2();
    request();
  }
  function finish2(silent) {
    if (!run2) return;
    run2.playing = false; run2.preview = false;
    run2.head = run2.tEnd;
    if (run2.emitted) { request(); return; }
    run2.emitted = true;
    const o = run2, p = o.p;
    let data;
    if (o.mode === 'pp') {
      data = {
        a: p.a, b: p.b, c: p.c, d: p.d, K: isFinite(p.K) ? p.K : null, E: p.E, x0: o.x0, y0: o.y0, tEnd: o.tEnd,
        eqx: o.eq.x, eqy: o.eq.y, coexist: o.eq.coexist, T0: o.T0, period: o.sum.period, lag: o.sum.lag, cycles: o.sum.cycles,
        avgX: o.sum.avgX, avgY: o.sum.avgY, amp: o.amp, startDev: o.startDev, endDev: o.endDev, xEnd: o.xEnd, yEnd: o.yEnd,
        key: [p.a, p.b, p.c, p.d].map(function (v) { return v.toFixed(4); }).join('|')
      };
    } else {
      data = {
        r1: p.r1, r2: p.r2, K1: p.K1, K2: p.K2, a12: p.a12, a21: p.a21, x0: o.x0, y0: o.y0, tEnd: o.tEnd,
        kind: o.kind, eqx: o.eq ? o.eq.x : null, eqy: o.eq ? o.eq.y : null, xEnd: o.xEnd, yEnd: o.yEnd, startDev: o.startDev, endDev: o.endDev, winner: o.winner,
        key: [p.r1, p.r2, p.K1, p.K2, p.a12, p.a21].map(function (v) { return v.toFixed(4); }).join('|')
      };
    }
    addRow2(o);
    if (!silent) emit(o.mode === 'pp' ? 'pp' : 'comp', data);
    const st = status2For(o);
    $('status2').textContent = st;
    say(st);
    updateReadouts2();
    request();
  }
  function status2For(o) {
    if (o.mode === 'pp') {
      if (!o.eq.coexist && o.yEnd < 0.01 * o.y0) return T('掠食者滅絕了：獵物最多只有 ' + fmtN(o.eq.x) + ' 隻，不夠養活掠食者（需要多於 (d+E)/c = ' + fmtN((o.p.d + o.p.E) / o.p.c) + ' 隻）。', 'The predators died out: the prey can reach only ' + fmtN(o.eq.x) + ', not enough to feed them (they need more than (d+E)/c = ' + fmtN((o.p.d + o.p.E) / o.p.c) + ').');
      if (o.mode === 'pp' && o.sum.cycles >= 1 && isFinite(o.sum.lag)) return T('週期 ' + num(o.sum.period, 2) + ' 天；掠食者的高峰比獵物晚 ' + num(o.sum.lag, 2) + ' 天（' + num(o.sum.lag / o.sum.period, 2) + ' 個週期）。', 'Period ' + num(o.sum.period, 2) + ' days; the predator peak trails the prey peak by ' + num(o.sum.lag, 2) + ' days (' + num(o.sum.lag / o.sum.period, 2) + ' of a cycle).');
      if (isFinite(o.amp) && o.amp < 0.005) return T('兩個族群幾乎靜止不動：起點就在平衡點上。', 'Both populations hardly move: you started on the equilibrium.');
      return T('模擬結束。時間不夠長，還看不到兩個完整的循環。', 'Done. The run was too short to show two full cycles.');
    }
    if (o.winner === 1) return T('物種 1 獲勝，物種 2 被排除（競爭排斥）。', 'Species 1 wins and species 2 is excluded (competitive exclusion).');
    if (o.winner === 2) return T('物種 2 獲勝，物種 1 被排除（競爭排斥）。', 'Species 2 wins and species 1 is excluded (competitive exclusion).');
    if (o.kind === 'coexist' && o.endDev < 0.05) return T('兩個物種共存，停在中間的平衡點附近。', 'The two species coexist, settling near the inner equilibrium.');
    return T('模擬結束，結局還沒分曉：把模擬天數拉長看看。', 'Done, but the outcome is not settled yet: run it for longer.');
  }
  function addRow2(o) {
    rows2.push({ id: o.id, mode: o.mode, color: o.color, p: o.p, x0: o.x0, y0: o.y0, sum: o.sum, kind: o.kind, winner: o.winner, xEnd: o.xEnd, yEnd: o.yEnd, endDev: o.endDev, coexist: o.eq && o.eq.coexist, amp: o.amp });
    if (rows2.length > MAX_ROWS * 2) rows2.shift();
    renderRows2();
  }
  function renderRows2() {
    const tb = $('runs2');
    const list = rows2.filter(function (x) { return x.mode === mode2; });
    if (!list.length) { tb.innerHTML = ''; return; }
    let h;
    if (mode2 === 'pp') {
      h = '<thead><tr><th>a, b, c, d</th><th>K</th><th>E</th><th>' + T('起點', 'Start') + '</th><th>' + T('週期', 'Period') + '</th><th>' + T('延遲', 'Delay') + '</th><th>' + T('平均獵物', 'Mean prey') + '</th><th>' + T('平均掠食者', 'Mean pred.') + '</th></tr></thead><tbody>';
      list.slice(-MAX_ROWS).reverse().forEach(function (x) {
        const s = x.sum;
        h += '<tr><td><i style="background:' + (run2 && x.id === run2.id ? C['pg-n'] : x.color) + '"></i>' + [num(x.p.a, 2), num(x.p.b, 3), num(x.p.c, 3), num(x.p.d, 2)].join(', ') + '</td><td>' + (isFinite(x.p.K) ? num(x.p.K, 0) : '∞') + '</td><td>' + num(x.p.E, 2) + '</td><td>(' + fmtN(x.x0) + ', ' + fmtN(x.y0) + ')</td><td>' +
          (isFinite(s.period) ? days(s.period, 2) : '—') + '</td><td>' + (isFinite(s.lag) ? days(s.lag, 2) : '—') + '</td><td>' + (isFinite(s.avgX) ? num(s.avgX, 1) : '—') + '</td><td>' + (isFinite(s.avgY) ? num(s.avgY, 1) : '—') + '</td></tr>';
      });
    } else {
      h = '<thead><tr><th>α<sub>12</sub>, α<sub>21</sub></th><th>K<sub>1</sub>, K<sub>2</sub></th><th>' + T('起點', 'Start') + '</th><th>' + T('最後', 'Final') + '</th><th>' + T('結局', 'Outcome') + '</th></tr></thead><tbody>';
      list.slice(-MAX_ROWS).reverse().forEach(function (x) {
        const out = x.winner === 1 ? T('物種 1 勝', 'species 1 wins') : x.winner === 2 ? T('物種 2 勝', 'species 2 wins') : x.kind === 'coexist' && x.endDev < 0.05 ? T('共存', 'coexist') : T('未定', 'unsettled');
        h += '<tr><td><i style="background:' + (run2 && x.id === run2.id ? C['pg-n'] : x.color) + '"></i>' + num(x.p.a12, 2) + ', ' + num(x.p.a21, 2) + '</td><td>' + num(x.p.K1, 0) + ', ' + num(x.p.K2, 0) + '</td><td>(' + fmtN(x.x0) + ', ' + fmtN(x.y0) + ')</td><td>(' + fmtN(x.xEnd) + ', ' + fmtN(x.yEnd) + ')</td><td>' + out + '</td></tr>';
      });
    }
    tb.innerHTML = h + '</tbody>';
  }
  function updateReadouts2() {
    if (!run2) return;
    const o = run2, p = o.p;
    let h = '';
    if (o.mode === 'pp') {
      const ap = p.a - p.E, dp = p.d + p.E;
      if (o.eq.coexist) h += '<dt>' + T('平衡點', 'Equilibrium') + '<small>(x*, y*)</small></dt><dd>(' + num(o.eq.x, 1) + ', ' + num(o.eq.y, 1) + ')</dd>';
      else h += '<dt>' + T('平衡點', 'Equilibrium') + '</dt><dd>' + T('掠食者無法存活', 'no predators can survive') + '<small>(' + num(o.eq.x, 1) + ', 0)</small></dd>';
      if (o.eq.coexist && !isFinite(p.K)) h += '<dt>' + T('小振幅週期', 'Small-cycle period') + '<small>2π/√(a′d′)</small></dt><dd>' + days(o.T0, 2) + '<small>a′ = a − E = ' + num(ap, 3) + '</small><small>d′ = d + E = ' + num(dp, 3) + '</small></dd>';
      if (!o.preview && o.head >= o.tEnd - 1e-9) {
        const s = o.sum;
        if (s.cycles >= 1) {
          h += '<dt>' + T('量到的週期', 'Measured period') + '</dt><dd>' + days(s.period, 2) + '<small>' + T('共 ', '') + s.cycles + T(' 個完整循環', ' full cycles') + '</small></dd>';
          h += '<dt>' + T('掠食者落後', 'Predator delay') + '</dt><dd>' + days(s.lag, 2) + '<small>' + num(s.lag / s.period, 3) + T(' 個週期', ' of a cycle') + '</small></dd>';
          h += '<dt>' + T('完整循環的平均', 'Mean over full cycles') + '<small>(' + T('獵物, 掠食者', 'prey, predators') + ')</small></dt><dd>(' + num(s.avgX, 1) + ', ' + num(s.avgY, 1) + ')</dd>';
        }
        h += '<dt>' + T('最後', 'At the end') + '<small>(' + T('獵物, 掠食者', 'prey, predators') + ')</small></dt><dd>(' + fmtN(o.xEnd) + ', ' + fmtN(o.yEnd) + ')</dd>';
      }
    } else {
      if (o.eq && o.eq.x > 0 && o.eq.y > 0) h += '<dt>' + T('中間的平衡點', 'Inner equilibrium') + '<small>(N<sub>1</sub>, N<sub>2</sub>)</small></dt><dd>(' + num(o.eq.x, 1) + ', ' + num(o.eq.y, 1) + ')</dd>';
      else h += '<dt>' + T('中間的平衡點', 'Inner equilibrium') + '</dt><dd>' + T('不存在', 'none') + '<small>' + T('兩條零成長線沒有交在兩種都大於 0 的地方', 'the zero-growth lines do not cross where both are above 0') + '</small></dd>';
      h += '<dt>' + T('比較', 'Compare') + '</dt><dd>K<sub>1</sub> = ' + num(p.K1, 0) + (p.K1 > p.a12 * p.K2 ? ' &gt; ' : ' &lt; ') + 'α<sub>12</sub>K<sub>2</sub> = ' + num(p.a12 * p.K2, 0) + '<br>K<sub>2</sub> = ' + num(p.K2, 0) + (p.K2 > p.a21 * p.K1 ? ' &gt; ' : ' &lt; ') + 'α<sub>21</sub>K<sub>1</sub> = ' + num(p.a21 * p.K1, 0) + '</dd>';
      if (!o.preview && o.head >= o.tEnd - 1e-9) h += '<dt>' + T('最後', 'At the end') + '<small>(N<sub>1</sub>, N<sub>2</sub>)</small></dt><dd>(' + fmtN(o.xEnd) + ', ' + fmtN(o.yEnd) + ')</dd>';
    }
    $('ro2').innerHTML = h;
  }

  // ---------- 版面與繪圖 ----------
  function resize2() {
    if (stage.classList.contains('is3d')) return;
    const w = cv2.clientWidth || 300;
    const narrow = w < 640;
    let h, pT, pP;
    if (!narrow) {
      const side = Math.min(390, Math.round(w * 0.42));
      pP = { x0: w - 16 - side, x1: w - 16, y0: 30, y1: 30 + side };
      pT = { x0: 58, x1: pP.x0 - 62, y0: 30, y1: 30 + side };
      h = pP.y1 + 34;
    } else {
      pT = { x0: 52, x1: w - 14, y0: 30, y1: 210 };
      const side = Math.min(w - 66, 330);
      pP = { x0: 52, x1: 52 + side, y0: pT.y1 + 58, y1: pT.y1 + 58 + side };
      h = pP.y1 + 34;
    }
    const s = fit(cv2, ctx2, h);
    W2 = s.w; H2 = s.h;
    L2 = { narrow: narrow, pT: pT, pP: pP };
    draw2();
  }
  function colX() { return mode2 === 'pp' ? C['pg-prey'] : C['pg-s1']; }
  function colY() { return mode2 === 'pp' ? C['pg-pred'] : C['pg-s2']; }
  function nameX(short) { return mode2 === 'pp' ? T('獵物', 'Prey') + (short ? '' : ' x') : T('物種 1', 'Species 1'); }
  function nameY(short) { return mode2 === 'pp' ? T('掠食者', 'Predators') + (short ? '' : ' y') : T('物種 2', 'Species 2'); }
  function ppMap(o) {
    const p = L2.pP;
    return {
      X: function (x) { return p.x0 + (p.x1 - p.x0) * x / o.xM; },
      Y: function (y) { return p.y1 - (p.y1 - p.y0) * y / o.yM; },
      x: function (px) { return (px - p.x0) / (p.x1 - p.x0) * o.xM; },
      y: function (py) { return (p.y1 - py) / (p.y1 - p.y0) * o.yM; }
    };
  }
  function draw2() {
    if (!L2 || !run2 || stage.classList.contains('is3d')) return;
    const g = ctx2;
    D.backdrop(g, W2, H2);
    drawTimeSeries(g);
    drawPhase(g);
  }
  function drawTimeSeries(g) {
    const o = run2, p = L2.pT, sim = o.sim;
    plotFrame(g, p);
    const xOf = function (t) { return p.x0 + (p.x1 - p.x0) * t / o.tEnd; };
    const yOf = function (v) { return p.y1 - (p.y1 - p.y0) * v / o.tsM; };
    yTicksLin(g, p, 0, o.tsM, niceStep(o.tsM, L2.narrow ? 4 : 5), function (v) { return fmtN(v); }, yOf);
    xTicks(g, p, 0, o.tEnd, niceStep(o.tEnd, L2.narrow ? 5 : 6), function (v) { return num(v, 0); }, xOf, T('天', 'days'));
    // 標題與圖例
    D.haloText(g, T('族群數量', 'Population'), p.x0, p.y0 - 13, D.c.text, 'left', 'middle', '600 12px ' + FONT);
    let lx = p.x1;
    [[nameY(true), colY()], [nameX(true), colX()]].forEach(function (l) {
      g.font = '600 12px ' + FONT;
      const w = g.measureText(l[0]).width;
      lx -= w;
      D.haloText(g, l[0], lx, p.y0 - 13, l[1], 'left', 'middle', '600 12px ' + FONT);
      g.strokeStyle = l[1]; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(lx - 18, p.y0 - 13); g.lineTo(lx - 4, p.y0 - 13); g.stroke();
      lx -= 30;
    });
    g.save();
    g.beginPath(); g.rect(p.x0 - 2, p.y0 - 2, p.x1 - p.x0 + 4, p.y1 - p.y0 + 4); g.clip();
    // 平衡值
    if (o.mode === 'pp' && o.eq.coexist) {
      g.setLineDash([3, 4]); g.lineWidth = 1;
      g.strokeStyle = D.alpha(colX(), 0.55); g.beginPath(); g.moveTo(p.x0, yOf(o.eq.x)); g.lineTo(p.x1, yOf(o.eq.x)); g.stroke();
      g.strokeStyle = D.alpha(colY(), 0.55); g.beginPath(); g.moveTo(p.x0, yOf(o.eq.y)); g.lineTo(p.x1, yOf(o.eq.y)); g.stroke();
      g.setLineDash([]);
    }
    const head = o.preview ? o.tEnd : o.head;
    g.globalAlpha = o.preview ? 0.35 : 1;
    g.lineJoin = 'round';
    g.strokeStyle = colX(); g.lineWidth = 2.4; series(g, sim.t, sim.x, head, xOf, yOf);
    g.strokeStyle = colY(); g.lineWidth = 2.4; series(g, sim.t, sim.y, head, xOf, yOf);
    g.globalAlpha = 1;
    g.restore();
    if (o.preview) return;
    // 高峰標記與第一組延遲
    if (o.mode === 'pp') {
      const mark = function (pk, col, up) {
        pk.forEach(function (q) {
          if (q.t > head) return;
          const x = xOf(q.t), y = yOf(q.v);
          g.fillStyle = col;
          g.beginPath(); g.moveTo(x, y - (up ? 6 : 6)); g.lineTo(x - 4, y - 12); g.lineTo(x + 4, y - 12); g.closePath(); g.fill();
        });
      };
      mark(o.sum.peaksX, colX(), true); mark(o.sum.peaksY, colY(), true);
      const px = o.sum.peaksX[0];
      const py = px ? o.sum.peaksY.filter(function (q) { return q.t > px.t; })[0] : null;
      if (px && py && py.t <= head && xOf(py.t) - xOf(px.t) > 18) {
        const yy = Math.max(p.y0 + 10, Math.min(yOf(px.v), yOf(py.v)) - 22);
        D.arrow(g, xOf(px.t), yy, xOf(py.t), yy, D.c.muted, 1.2);
        D.haloText(g, T('延遲 ', 'delay ') + num(py.t - px.t, 1), (xOf(px.t) + xOf(py.t)) / 2, yy - 9, D.c.muted, 'center', 'middle', '11px ' + FONT);
      }
    }
    const xh = xOf(head), i = Math.min(sim.t.length - 1, Math.round(head / (sim.t[1] - sim.t[0] || 1)));
    D.ball(g, xh, yOf(sim.x[i]), 4.5, colX());
    D.ball(g, xh, yOf(sim.y[i]), 4.5, colY());
  }
  function idxAt(o, t) { const s = o.sim; return Math.max(0, Math.min(s.t.length - 1, Math.round(t / (s.t[1] - s.t[0] || 1)))); }
  function drawPhase(g) {
    const o = run2, p = L2.pP, sim = o.sim, M = ppMap(o), pr = o.p;
    plotFrame(g, p);
    yTicksLin(g, p, 0, o.yM, niceStep(o.yM, L2.narrow ? 4 : 5), function (v) { return fmtN(v); }, M.Y);
    xTicks(g, p, 0, o.xM, niceStep(o.xM, L2.narrow ? 4 : 5), function (v) { return fmtN(v); }, M.X, nameX(true));
    D.haloText(g, T('相平面', 'Phase plane'), p.x0, p.y0 - 13, D.c.text, 'left', 'middle', '600 12px ' + FONT);
    g.font = '600 12px ' + FONT;
    D.haloText(g, T('縱軸：', 'up: ') + nameY(true), p.x0 + g.measureText(T('相平面', 'Phase plane')).width + 12, p.y0 - 13, colY(), 'left', 'middle', '600 11.5px ' + FONT);
    g.save();
    g.beginPath(); g.rect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0); g.clip();
    // 方向場
    const f = mode2 === 'pp' ? P.lvDeriv : P.compDeriv, out = [0, 0];
    const nx = L2.narrow ? 11 : 13, ny = nx;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const x = o.xM * (i + 0.5) / nx, y = o.yM * (j + 0.5) / ny;
      f(pr, x, y, out);
      const vx = out[0] / o.xM, vy = out[1] / o.yM, sp = Math.hypot(vx, vy);
      if (!(sp > 0)) continue;
      const L = 8, ux = vx / sp, uy = -vy / sp;
      const cx = M.X(x), cy = M.Y(y);
      const a = Math.min(0.32, 0.1 + 0.05 * Math.log10(1 + sp * 400));
      g.strokeStyle = D.alpha(D.c.text, a); g.fillStyle = g.strokeStyle; g.lineWidth = 1;
      g.beginPath(); g.moveTo(cx - ux * L / 2, cy - uy * L / 2); g.lineTo(cx + ux * L / 2, cy + uy * L / 2); g.stroke();
      g.beginPath(); g.moveTo(cx + ux * L / 2, cy + uy * L / 2); g.lineTo(cx + ux * L / 2 - ux * 3.5 - uy * 2.2, cy + uy * L / 2 - uy * 3.5 + ux * 2.2); g.lineTo(cx + ux * L / 2 - ux * 3.5 + uy * 2.2, cy + uy * L / 2 - uy * 3.5 - ux * 2.2); g.closePath(); g.fill();
    }
    // 零成長線
    g.setLineDash([7, 5]); g.strokeStyle = C['pg-eq']; g.lineWidth = 1.6;
    const seg = function (x1, y1, x2, y2) { g.beginPath(); g.moveTo(M.X(x1), M.Y(y1)); g.lineTo(M.X(x2), M.Y(y2)); g.stroke(); };
    let labX, labY;
    if (mode2 === 'pp') {
      const ap = pr.a - pr.E, dp = pr.d + pr.E;
      const xs = dp / pr.c;
      seg(xs, 0, xs, o.yM * 2); labY = [M.X(xs), p.y0 + 12];
      if (isFinite(pr.K)) { const y0n = ap / pr.b, x1n = pr.K * ap / pr.a; if (y0n > 0) { seg(0, y0n, x1n, 0); labX = [M.X(Math.min(x1n, o.xM) * 0.7), M.Y(y0n * 0.3)]; } }
      else if (ap > 0) { seg(0, ap / pr.b, o.xM * 2, ap / pr.b); labX = [p.x1 - 6, M.Y(ap / pr.b)]; }
    } else {
      seg(pr.K1, 0, 0, pr.a12 > 0 ? pr.K1 / pr.a12 : o.yM * 4);
      if (pr.a12 <= 0) seg(pr.K1, 0, pr.K1, o.yM * 2);
      seg(0, pr.K2, pr.a21 > 0 ? pr.K2 / pr.a21 : o.xM * 4, 0);
      // 標籤放在線段上看得到的一段（從軸上的端點往內 30%）
      const along = function (ax, ay, bx, by) {
        let u = 0.3;
        for (let k = 0; k < 8; k++) { const x = ax + (bx - ax) * u, y = ay + (by - ay) * u; if (x <= o.xM * 0.95 && y <= o.yM * 0.95) break; u *= 0.6; }
        return [M.X(ax + (bx - ax) * u), M.Y(ay + (by - ay) * u)];
      };
      labX = along(pr.K1, 0, 0, pr.a12 > 0 ? pr.K1 / pr.a12 : o.yM * 4);
      labY = along(0, pr.K2, pr.a21 > 0 ? pr.K2 / pr.a21 : o.xM * 4, 0);
    }
    g.setLineDash([]);
    // 保留的軌跡
    kept2.forEach(function (k) {
      g.strokeStyle = D.alpha(k.color, 0.7); g.lineWidth = 1.5;
      g.beginPath();
      for (let i = 0; i < k.x.length; i += 2) { const X = M.X(k.x[i]), Y = M.Y(k.y[i]); if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }
      g.stroke();
    });
    // 目前的軌跡
    const head = o.preview ? o.tEnd : o.head, iH = idxAt(o, head);
    g.strokeStyle = o.preview ? D.alpha(C['pg-n'], 0.4) : C['pg-n']; g.lineWidth = o.preview ? 1.5 : 2.4; g.lineJoin = 'round';
    if (o.preview) g.setLineDash([4, 3]);
    g.beginPath();
    for (let i = 0; i <= iH; i++) { const X = M.X(sim.x[i]), Y = M.Y(sim.y[i]); if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }
    g.stroke(); g.setLineDash([]);
    g.restore();
    // 零成長線的標籤
    const lab = function (pos, txt, align) { if (pos) D.haloText(g, txt, Math.max(p.x0 + 4, Math.min(p.x1 - 4, pos[0])), Math.max(p.y0 + 8, Math.min(p.y1 - 8, pos[1])), C['pg-eq'], align, 'middle', '600 11px ' + FONT); };
    if (mode2 === 'pp') {
      lab(labY, (L2.narrow ? '' : nameY(true)) + ' dy/dt = 0', 'left');
      if (labX) lab([labX[0], labX[1] - 9], (L2.narrow ? '' : nameX(true)) + ' dx/dt = 0', 'right');
    } else {
      lab([labX[0] + 6, labX[1] - 4], T('物種 1 零成長', 'species 1: no growth'), 'left');
      lab([labY[0] + 6, labY[1] - 10], T('物種 2 零成長', 'species 2: no growth'), 'left');
    }
    // 平衡點
    const eqs = [];
    if (mode2 === 'pp') { if (o.eq.coexist) eqs.push([o.eq.x, o.eq.y, true]); else eqs.push([o.eq.x, 0, true]); }
    else {
      eqs.push([pr.K1, 0, false]); eqs.push([0, pr.K2, false]);
      if (o.eq && o.eq.x > 0 && o.eq.y > 0) eqs.push([o.eq.x, o.eq.y, true]);
    }
    eqs.forEach(function (e) {
      const X = M.X(e[0]), Y = M.Y(e[1]);
      if (X < p.x0 - 1 || X > p.x1 + 1 || Y < p.y0 - 1 || Y > p.y1 + 1) return;
      g.lineWidth = 2; g.strokeStyle = C['pg-eq']; g.fillStyle = e[2] ? D.alpha(C['pg-eq'], 0.25) : D.c['canvas-bg'];
      g.beginPath(); g.arc(X, Y, 5.5, 0, Math.PI * 2); g.fill(); g.stroke();
    });
    // 起點與目前位置
    const sx = M.X(o.x0), sy = M.Y(o.y0);
    g.lineWidth = 2; g.strokeStyle = D.c.text; g.fillStyle = D.dark ? '#f8fafc' : '#ffffff';
    g.beginPath(); g.arc(sx, sy, 7, 0, Math.PI * 2); g.fill(); g.stroke();
    if (kb2 && kb2.focused()) { g.strokeStyle = D.c.accent; g.setLineDash([3, 3]); g.beginPath(); g.arc(sx, sy, 12, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
    if (!o.preview) D.ball(g, M.X(sim.x[iH]), M.Y(sim.y[iH]), 5.5, C['pg-n']);
  }

  // ---------- 拖曳起點 ----------
  let drag2 = false;
  function inPhase(pt) { const p = L2.pP; return pt[0] >= p.x0 - 10 && pt[0] <= p.x1 + 10 && pt[1] >= p.y0 - 10 && pt[1] <= p.y1 + 10; }
  function setStart(x, y, keepRange) {
    x = Math.max(1, Math.min(1000, x)); y = Math.max(1, Math.min(1000, y));
    setQuiet(el.x0, Math.round(x));
    setQuiet(el.y0, Math.round(y));
    refreshOutputs();
    newSim2(keepRange);
  }
  cv2.addEventListener('pointerdown', function (ev) {
    if (!run2 || !L2) return;
    const pt = evPos(cv2, ev);
    if (!inPhase(pt)) return;
    drag2 = true;
    frozen = { mode: run2.mode, xM: run2.xM, yM: run2.yM };
    try { cv2.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    const M = ppMap(run2);
    setStart(M.x(pt[0]), M.y(pt[1]), true);
    ev.preventDefault();
  });
  cv2.addEventListener('pointermove', function (ev) {
    if (!run2 || !L2) return;
    const pt = evPos(cv2, ev);
    if (!drag2) { cv2.style.cursor = inPhase(pt) ? 'crosshair' : 'default'; return; }
    const M = ppMap(run2);
    setStart(M.x(pt[0]), M.y(pt[1]), true);
  });
  const end2 = function () {
    if (!drag2) return;
    drag2 = false; frozen = null;
    newSim2(false);
    $('status2').textContent = T('起點：(' + fmtN(run2.x0) + ', ' + fmtN(run2.y0) + ')。按「開始」。', 'Start: (' + fmtN(run2.x0) + ', ' + fmtN(run2.y0) + '). Press “Run”.');
  };
  cv2.addEventListener('pointerup', end2); cv2.addEventListener('pointercancel', end2);
  const kb2 = window.LabKeys ? window.LabKeys.attach(cv2, {
    label: T('相平面：方向鍵移動起點（加 Shift 一次移動比較多）。', 'Phase plane: arrow keys move the starting point (Shift for bigger steps).'),
    items: [{
      name: function () { return T('起點', 'Starting point'); },
      move: function (dx, dy, big) {
        if (!run2) return false;
        const sx = run2.xM / (big ? 10 : 100), sy = run2.yM / (big ? 10 : 100);
        setStart(run2.x0 + dx * Math.max(1, sx), run2.y0 - dy * Math.max(1, sy), false);
        return true;
      },
      describe: function () { return run2 ? T('起點：', 'Start: ') + nameX(true) + ' ' + fmtN(run2.x0) + T('，', ', ') + nameY(true) + ' ' + fmtN(run2.y0) : ''; }
    }],
    onChange: function () { request(); }
  }) : null;

  // =====================================================================
  // 動畫迴圈
  // =====================================================================
  let raf = 0, lastT = 0;
  function request() { if (!raf) raf = requestAnimationFrame(tick); }
  function tick(now) {
    raf = 0;
    const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0;
    lastT = now;
    let more = false;
    if (run && run.playing) {
      const prev = run.head;
      run.head = Math.min(run.tStop, run.head + dt * run.tEnd / DUR1);
      // 每倍增一次的聲音、接近 K 的和弦、滅絕的下滑音
      const Nh = nAt(run, run.head);
      const k = Nh > run.N0 ? Math.floor(Math.log2(Nh / run.N0)) : 0;
      if (k > run.nDouble) { run.nDouble = k; sndDouble(k); }
      if (run.model === 'logi' && !run.full && Nh >= 0.95 * run.K && run.N0 < 0.95 * run.K) { run.full = true; sndFull(); }
      if (run.extinct && prev < run.tExt && run.head >= run.tExt) sndExtinct();
      if (run.head >= run.tStop) finish1(); else more = true;
      if (Math.floor(now / 250) !== Math.floor((now - dt * 1000) / 250)) updateReadouts1();
    }
    if (run2 && run2.playing) {
      const dur = Math.min(10, Math.max(4, run2.tEnd / 8));
      const prev = run2.head;
      run2.head = Math.min(run2.tEnd, run2.head + dt * run2.tEnd / dur);
      if (run2.mode === 'pp') {
        run2.sum.peaksX.forEach(function (q) { if (prev < q.t && run2.head >= q.t) sndPeak(false); });
        run2.sum.peaksY.forEach(function (q) { if (prev < q.t && run2.head >= q.t) sndPeak(true); });
      }
      if (run2.head >= run2.tEnd) finish2(); else more = true;
    }
    draw1();
    if (view3 && view3.active) { view3.frame(dt); if (view3.busy && view3.busy()) more = true; }
    else draw2();
    if (more) request(); else lastT = 0;
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  function pressGroup(sel, attr, v) {
    document.querySelectorAll(sel).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === v)); });
  }
  /** 參數一改：停止播放，顯示新設定的完整理論結果（不回報任務） */
  function reset1() {
    // 隨機模型不預先擲骰：先顯示平均的理論曲線
    run = simulate1(true);
    run.color = keptColor(run.id - 1);
    run.head = run.tStop; run.emitted = true; run.initial = true;
    inspectT = null;
    $('pause').textContent = T('暫停', 'Pause');
    updateReadouts1();
    request();
  }
  function setModel(m) {
    s1.model = m;
    pressGroup('#modelSeg button', 'data-model', m);
    $('rowK').hidden = m === 'expo';
    reset1();
    setStatus(m === 'expo' ? T('指數成長：資源無限。按「開始培養」。', 'Exponential: unlimited resources. Press “Grow”.') : T('邏輯斯成長：族群越接近負荷量 K，成長越慢。按「開始培養」。', 'Logistic: growth slows as the population nears the carrying capacity K. Press “Grow”.'));
    legend1();
  }
  document.querySelectorAll('#modelSeg button').forEach(function (b) { b.addEventListener('click', function () { setModel(b.getAttribute('data-model')); }); });
  [el.r, el.K, el.N0, el.tEnd].forEach(function (r) { r.addEventListener('input', function () { refreshOutputs(); reset1(); }); });
  $('stoch').addEventListener('change', function () { s1.stoch = this.checked; reset1(); legend1(); setStatus(s1.stoch ? T('一隻一隻數：每次培養的結果都不一樣。按「開始培養」。', 'Counting individuals: every culture turns out differently. Press “Grow”.') : ''); });
  $('logY').addEventListener('change', function () { s1.logY = this.checked; request(); });
  $('keep').addEventListener('change', function () { s1.keep = this.checked; if (!s1.keep) kept = []; request(); });
  $('grow').addEventListener('click', grow);
  $('pause').addEventListener('click', function () {
    if (!run || run.emitted) return;
    run.playing = !run.playing;
    this.textContent = run.playing ? T('暫停', 'Pause') : T('繼續', 'Resume');
    if (run.playing) request();
  });
  $('clearAll').addEventListener('click', function () {
    kept = []; rows = []; renderRows();
    if (run && run.playing) { run.playing = false; }
    reset1();
    setStatus(T('已清除保留的曲線與紀錄表。', 'Kept curves and the table are cleared.'));
  });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  function setMode2(m) {
    mode2 = m;
    pressGroup('#modeSeg button', 'data-mode', m);
    $('ppBox').hidden = m !== 'pp'; $('compBox').hidden = m !== 'comp';
    $('x0Label').textContent = m === 'pp' ? T('起始獵物數量', 'Starting prey') : T('物種 1 的起始數量', 'Starting species 1');
    $('y0Label').textContent = m === 'pp' ? T('起始掠食者數量', 'Starting predators') : T('物種 2 的起始數量', 'Starting species 2');
    kept2 = [];
    if (m === 'pp') { setQuiet(el.x0, 40); setQuiet(el.y0, 20); } else { setQuiet(el.x0, 20); setQuiet(el.y0, 20); }
    refreshOutputs();
    newSim2(false);
    renderRows2();
    legend2();
    $('status2').textContent = m === 'pp' ? T('掠食者與獵物：按「開始」，看兩個族群怎麼此起彼落。', 'Predator and prey: press “Run” and watch the two rise and fall.') : T('種間競爭：按「開始」，看誰留下來。', 'Competition: press “Run” and see who stays.');
  }
  document.querySelectorAll('#modeSeg button').forEach(function (b) { b.addEventListener('click', function () { if (b.getAttribute('data-mode') !== mode2) setMode2(b.getAttribute('data-mode')); }); });
  [el.pa, el.pb, el.pc, el.pd, el.pK, el.pE, el.r1, el.r2, el.K1, el.K2, el.a12, el.a21, el.x0, el.y0, el.t2].forEach(function (r) {
    r.addEventListener('input', function () { refreshOutputs(); newSim2(false); });
  });
  $('useK').addEventListener('change', function () { $('rowPK').hidden = !this.checked; newSim2(false); });
  $('run2').addEventListener('click', start2);
  $('clear2').addEventListener('click', function () {
    kept2 = []; rows2 = rows2.filter(function (x) { return x.mode !== mode2; }); renderRows2();
    newSim2(false);
    $('status2').textContent = T('已清除保留的軌跡與紀錄表。', 'Kept paths and the table are cleared.');
  });

  function legend1() {
    const sw = function (col, txt, cls) { return '<span><i' + (cls ? ' class="' + cls + '"' : '') + ' style="background:' + col + ';color:' + col + '"></i>' + txt + '</span>'; };
    let h = sw(C['pg-n'], T('族群數量 N', 'Population N'));
    if (s1.stoch) h += sw(C['pg-n'], T('平均（理論曲線）', 'Average (theory)'), 'dash');
    if (s1.model === 'logi') h += sw(C['pg-k'], T('負荷量 K', 'Carrying capacity K'), 'dash');
    h += sw(D.c.accent || C['pg-eq'], T('點圖檢視某一刻', 'Tap the graph to inspect'), 'dot');
    $('legend').innerHTML = h;
  }
  function legend2() {
    const sw = function (col, txt, cls) { return '<span><i' + (cls ? ' class="' + cls + '"' : '') + ' style="background:' + col + ';color:' + col + '"></i>' + txt + '</span>'; };
    $('legend2').innerHTML = sw(colX(), nameX(true)) + sw(colY(), nameY(true)) + sw(C['pg-n'], T('相平面上的軌跡', 'Path in the phase plane')) +
      sw(C['pg-eq'], T('零成長線', 'Zero-growth lines'), 'dash') + sw(C['pg-eq'], T('平衡點', 'Equilibrium'), 'dot');
  }

  // =====================================================================
  // 3D 檢視：切換時才載入 js/population-growth-3d.js 與 three.js；切回 2D 時整個釋放。
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage2'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    P: P, T: T, D: D, num: num, fmtN: fmtN, reducedMotion: reducedMotion,
    colors: function () { return C; },
    run: function () { return run2; },
    names: function () { return { x: nameX(true), y: nameY(true), cx: colX(), cy: colY() }; },
    request: function () { request(); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.PG3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.PG3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/population-growth-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.PG3D) throw new Error('population-growth-3d.js did not load');
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
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
      if (!webglAvailable()) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        view3 = window.PG3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        requestAnimationFrame(function () { if (view3) { view3.onShow(); request(); } });
        request();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      if (view3) { view3.dispose(); view3 = null; }
      stage.classList.remove('is3d');
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      $('resetCam').hidden = true;
      resize2();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize2();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ---------- 分享目前設定：模型與交互作用（滑桿、勾選框由 classroom.js 記錄） ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { m: s1.model, i: mode2 }; },
    set: function (o) {
      if (!o) return;
      s1.stoch = $('stoch').checked; s1.logY = $('logY').checked; s1.keep = $('keep').checked;
      $('rowPK').hidden = !$('useK').checked;
      if (o.m === 'expo' || o.m === 'logi') setModel(o.m); else reset1();
      if (o.i === 'pp' || o.i === 'comp') {
        const x = val(el.x0), y = val(el.y0);
        setMode2(o.i); setQuiet(el.x0, x); setQuiet(el.y0, y); refreshOutputs(); newSim2(false);
      } else newSim2(false);
    }
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  s1.stoch = $('stoch').checked; s1.logY = $('logY').checked; s1.keep = $('keep').checked;
  $('rowPK').hidden = !$('useK').checked;
  refreshOutputs();
  updateSoundButton();
  function themeChanged() {
    readColors();
    cellSprite = null;
    if (view3 && view3.active) view3.onTheme();
    legend1(); legend2();
    request();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  setModel('expo');
  setMode2('pp');
  setStatus(T('先按「開始培養」，看 10 隻草履蟲在資源無限時怎麼成長。', 'Press “Grow” and watch 10 paramecia multiply with unlimited food.'));
  if (reducedMotion) $('status2').textContent += T('（已偵測到「減少動態效果」：直接顯示結果。）', ' (Reduced motion is on: results are shown at once.)');
  if (window.ResizeObserver) {
    const watch = function (c, fn) { let lw = 0; new ResizeObserver(function () { if (c.clientWidth && c.clientWidth !== lw) { lw = c.clientWidth; fn(); } }).observe(c); };
    watch(cv, resize1); watch(cv2, resize2);
  } else window.addEventListener('resize', function () { resize1(); resize2(); });
  resize1(); resize2();
  request();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastT = 0; request(); } });
  // 測試與縮圖用
  window.__pg = {
    P: P, s1: s1,
    run: function () { return run; }, run2: function () { return run2; },
    grow: grow, finish1: function () { finish1(); }, start2: start2, finish2: function () { finish2(); },
    setModel: setModel, setMode2: setMode2, setView: setView, setInspect: function (t) { setInspect(t, 'now'); },
    setStart: function (x, y) { setStart(x, y, false); }
  };
})();
