/* hardy-weinberg.js — 「哈溫平衡、遺傳漂變與天擇」的畫面與互動（模型全部在 hardy-weinberg-core.js；3D 在 hardy-weinberg-3d.js，切換時才載入） */
(function () {
  'use strict';
  const H = window.HWCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const FONT = D.FONT;
  const NF = 100;              // 花圃裡畫幾株
  const MAX_ROWS = 12;

  // =====================================================================
  // 顏色
  // =====================================================================
  const C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['hw-AA', 'hw-Aa', 'hw-aa', 'hw-edge', 'hw-leaf', 'hw-bed', 'hw-eq', 'hw-fix', 'hw-lost', 'hw-seg']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  const GCOL = function (i) { return C[['hw-AA', 'hw-Aa', 'hw-aa'][i]]; };

  // =====================================================================
  // 數字
  // =====================================================================
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function pct(x, d) { return num(100 * x, d == null ? 1 : d) + '%'; }
  function niceCeil(v) {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    return (m <= 1 ? 1 : m <= 1.5 ? 1.5 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 3 ? 3 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 6 ? 6 : m <= 8 ? 8 : 10) * p;
  }
  function niceStep(span, target) {
    const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  /** 最大餘數法：把比例 g 分成 n 個整數 */
  function apportion(g, n) {
    const raw = g.map(function (x) { return Math.max(0, x) * n; });
    const out = raw.map(Math.floor);
    let left = n - out.reduce(function (a, b) { return a + b; }, 0);
    const order = raw.map(function (x, i) { return [x - Math.floor(x), i]; }).sort(function (a, b) { return b[0] - a[0]; });
    for (let k = 0; left > 0 && k < 3; k++, left--) out[order[k][1]]++;
    return out;
  }

  // =====================================================================
  // 滑桿
  // =====================================================================
  const el = {
    fAA: $('fAA'), faa: $('faa'), sig: $('sig'), nS: $('nS'),
    N: $('N'), pops: $('pops'), p0: $('p0'), gens: $('gens'),
    wAA: $('wAA'), wAa: $('wAa'), waa: $('waa'), mu: $('mu'), nu: $('nu'), mig: $('mig'), pm: $('pm')
  };
  function setRange(r, v) { if (window.LabNum) window.LabNum.set(r, v); else r.value = String(v); }
  /** 程式直接改滑桿（不觸發事件） */
  function setQuiet(r, v) {
    if (window.LabNum && window.LabNum.clear) window.LabNum.clear(r);
    r.value = String(v);
  }
  function refreshOutputs() {
    const set = function (id, s) { const o = $(id); if (o) o.textContent = s; };
    set('fAAo', num(val(el.fAA), 2)); set('faao', num(val(el.faa), 2)); set('sigo', pct(val(el.sig), 0)); set('nSo', num(val(el.nS), 0));
    set('No', num(val(el.N), 0)); set('popso', num(val(el.pops), 0)); set('p0o', num(val(el.p0), 3)); set('genso', num(val(el.gens), 0));
    set('wAAo', num(val(el.wAA), 2)); set('wAao', num(val(el.wAa), 2)); set('waao', num(val(el.waa), 2));
    set('muo', num(val(el.mu), 4)); set('nuo', num(val(el.nu), 4)); set('migo', num(val(el.mig), 3)); set('pmo', num(val(el.pm), 2));
    const aa = 1 - val(el.fAA) - val(el.faa);
    $('hintAa').textContent = T('其餘是粉紅花 Aa（現在 ', 'The rest are pink Aa (now ') + pct(Math.max(0, aa), 0) + T('）。也可以在三角圖上拖曳白色圓點。', '). You can also drag the white dot in the triangle.');
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
  function sndGen(k) { const S = sound(); if (S) S.tone({ freq: 523 * Math.pow(2, Math.min(k, 12) / 12), dur: 0.08, gain: 0.07, type: 'triangle' }); }
  function sndAccept() { const S = sound(); if (S) { S.tone({ freq: 660, dur: 0.1, gain: 0.07 }); S.tone({ freq: 880, dur: 0.16, gain: 0.06, delay: 0.1 }); } }
  function sndReject() { const S = sound(); if (S) S.sweep({ from: 420, to: 210, dur: 0.32, gain: 0.1, type: 'sine' }); }
  let lastBeep = 0;
  function sndFate(fixed) {
    const S = sound(), now = performance.now();
    if (!S || now - lastBeep < 70) return;
    lastBeep = now;
    S.tone({ freq: fixed ? 1046 : 392, dur: 0.06, gain: 0.05, type: fixed ? 'sine' : 'triangle' });
  }
  function setStatus(s) { $('status').textContent = s; }
  function setStatus2(s) { $('status2').textContent = s; }
  function say(s) { const e = $('srSay'); e.textContent = ''; setTimeout(function () { e.textContent = s; }, 30); }
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }

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
  function xTicks(g, p, lo, hi, step, fmt, xOf, unit) {
    g.font = '11px ' + FONT; g.fillStyle = D.c.muted; g.textBaseline = 'top';
    g.textAlign = 'right';
    const wl = g.measureText(unit).width;
    g.fillText(unit, p.x1, p.y1 + 6);
    g.textAlign = 'center';
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) {
      const x = xOf(v);
      if (x > p.x1 - wl - 14) break;
      g.fillText(fmt(v), x, p.y1 + 6);
      g.strokeStyle = D.alpha(D.c.text, 0.05);
      g.beginPath(); g.moveTo(Math.round(x) + 0.5, p.y0); g.lineTo(Math.round(x) + 0.5, p.y1); g.stroke();
    }
  }
  function yTicks(g, p, lo, hi, step, fmt, yOf) {
    g.font = '11px ' + FONT; g.fillStyle = D.c.muted; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) {
      const y = yOf(v);
      g.fillText(fmt(v), p.x0 - 7, y);
      hLine(g, p, y, Math.abs(v) < 1e-9 ? 0.22 : 0.07);
    }
  }
  function title(g, s, x, y, col) { D.haloText(g, s, x, y, col || D.c.text, 'left', 'middle', '600 12px ' + FONT); }
  function evPos(c, ev) { const r = c.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function ease(k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }

  // =====================================================================
  // 一・花圃
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W1 = 0, H1 = 0, L1 = null;
  const s1 = { start: [0.5, 0, 0.5], hist: [[0.5, 0, 0.5]], sigs: [], anim: null, lastTest: null };
  let tests = [];
  function cur() { return s1.hist[s1.hist.length - 1]; }
  function gen() { return s1.hist.length - 1; }
  /** 畫面上的位置（動畫中是小數的世代） */
  function dispIdx() {
    const a = s1.anim;
    if (!a) return gen();
    const k = Math.min(1, (performance.now() - a.t0) / a.dur);
    return a.from + (a.to - a.from) * ease(k);
  }
  function gAt(x) {
    const i = Math.max(0, Math.min(s1.hist.length - 1, Math.floor(x))), j = Math.min(s1.hist.length - 1, i + 1), f = x - i;
    const a = s1.hist[i], b = s1.hist[j];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  // ---------- 花的位置（固定的微小抖動）與每代的排列 ----------
  const jit = (function () { const r = H.rng(2718); const a = []; for (let i = 0; i < NF; i++) a.push([r() - 0.5, r() - 0.5, r()]); return a; })();
  const permCache = {};
  function perm(t) {
    if (permCache[t]) return permCache[t];
    const r = H.rng(1000 + t * 7919), a = [];
    for (let i = 0; i < NF; i++) a.push(i);
    for (let i = NF - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; }
    permCache[t] = a;
    return a;
  }
  function genotypeOfPlants(g, t) {
    const n = apportion(g, NF), pm = perm(t), out = new Array(NF);
    for (let k = 0; k < NF; k++) out[pm[k]] = k < n[0] ? 0 : k < n[0] + n[1] ? 1 : 2;
    return { kind: out, n: n };
  }
  function drawFlower(g, x, y, r, gt, scale) {
    const rr = r * scale;
    // 葉
    g.fillStyle = D.alpha(C['hw-leaf'], 0.85);
    g.beginPath(); g.ellipse(x - rr * 0.55, y + rr * 0.95, rr * 0.5, rr * 0.2, -0.5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(x + rr * 0.55, y + rr * 0.95, rr * 0.5, rr * 0.2, 0.5, 0, Math.PI * 2); g.fill();
    // 花瓣（金魚草的唇形花冠，簡化成五片）
    const col = GCOL(gt);
    g.fillStyle = col;
    g.strokeStyle = gt === 2 ? C['hw-edge'] : D.shade(col, -0.22);
    g.lineWidth = gt === 2 ? 1 : 0.8;
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + k * Math.PI * 2 / 5;
      g.beginPath(); g.ellipse(x + Math.cos(a) * rr * 0.48, y + Math.sin(a) * rr * 0.48, rr * 0.42, rr * 0.34, a, 0, Math.PI * 2);
      g.fill(); g.stroke();
    }
    g.fillStyle = '#f2c94c';
    g.beginPath(); g.arc(x, y, rr * 0.22, 0, Math.PI * 2); g.fill();
  }

  // ---------- 三角圖 ----------
  function triPt(gg) {
    const t = L1.tri;
    return [t.xL + (t.xR - t.xL) * (gg[1] / 2 + gg[2]), t.yB - (t.yB - t.yT) * gg[1]];
  }
  function triToG(x, y) {
    const t = L1.tri;
    let h = (t.yB - y) / (t.yB - t.yT);
    let q = (x - t.xL) / (t.xR - t.xL);
    h = Math.max(0, Math.min(1, h));
    let r = q - h / 2;
    r = Math.max(0, Math.min(1 - h, r));
    const d = Math.max(0, 1 - h - r);
    return [d, h, r];
  }

  function resize1() {
    const w = cv.clientWidth || 300;
    const wide = w >= 700;
    let h, garden, tri, bars, sq;
    if (wide) {
      h = 470;
      const gs = Math.min(250, Math.round(w * 0.3));
      garden = { x: 14, y: 34, w: gs, h: gs };
      bars = { x0: 22, x1: 14 + gs, y0: 34 + gs + 56, y1: h - 34 };
      const tx0 = 14 + gs + 48, sqS = 132;
      const avail = w - 14 - tx0 - sqS - 40;
      const side = Math.max(200, Math.min(avail, (h - 150) / 0.866));
      tri = { xL: tx0 + 4, xR: tx0 + 4 + side, yT: 58, yB: 58 + side * 0.866 };
      tri.xM = (tri.xL + tri.xR) / 2;
      sq = { x: w - 14 - sqS, y: 58, s: sqS };
    } else {
      const gw = w - 28, gh = Math.round(Math.min(240, gw * 0.62));
      garden = { x: 14, y: 34, w: gw, h: gh };
      const side = Math.min(w - 76, 340);
      const yT = 34 + gh + 58;
      tri = { xL: (w - side) / 2, xR: (w + side) / 2, yT: yT, yB: yT + side * 0.866 };
      tri.xM = w / 2;
      const by = tri.yB + 74;
      const sqS = Math.round(Math.min(132, (w - 28) * 0.36));
      bars = { x0: 22, x1: w - 14 - sqS - 30, y0: by + 24, y1: by + 24 + sqS - 10 };
      sq = { x: w - 14 - sqS, y: by + 4, s: sqS };
      h = Math.max(bars.y1, sq.y + sqS) + 40;
    }
    const s = fit(cv, ctx, h);
    W1 = s.w; H1 = s.h;
    L1 = { wide: wide, garden: garden, tri: tri, bars: bars, sq: sq };
    draw1();
  }

  function draw1() {
    if (!L1) return;
    const g = ctx;
    D.backdrop(g, W1, H1);
    const x = dispIdx(), gd = gAt(x), tShow = Math.round(x);
    // 換代時花圃「重新種過」：每經過一代，花先縮小再長回來
    const pulse = s1.anim ? 1 - 0.45 * Math.sin(Math.PI * (x - Math.floor(x))) : 1;
    drawGarden(g, gd, tShow, pulse);
    drawTriangle(g, x, gd);
    drawBars(g, gd);
    drawSquare(g, gd);
  }

  function drawGarden(g, gd, t, grow) {
    const R = L1.garden;
    D.roundRect(g, R.x, R.y, R.w, R.h, 12);
    g.fillStyle = C['hw-bed']; g.fill();
    g.strokeStyle = D.alpha(D.c.border, 0.9); g.lineWidth = 1; g.stroke();
    title(g, T('花圃（100 株）・第 ', 'Garden (100 plants) · generation ') + t + T(' 代', ''), R.x, R.y - 14);
    const pl = genotypeOfPlants(s1.hist[Math.min(t, s1.hist.length - 1)], t);
    const cw = (R.w - 12) / 10, ch = (R.h - 12) / 10, r = Math.min(cw, ch) * 0.42;
    for (let i = 0; i < NF; i++) {
      const cx = R.x + 6 + (i % 10 + 0.5) * cw + jit[i][0] * cw * 0.22;
      const cy = R.y + 6 + (Math.floor(i / 10) + 0.5) * ch + jit[i][1] * ch * 0.18 - r * 0.15;
      const sc = (0.88 + 0.12 * jit[i][2]) * grow;
      drawFlower(g, cx, cy, r, pl.kind[i], sc);
    }
    void gd;
  }

  function drawTriangle(g, x, gd) {
    const t = L1.tri;
    title(g, T('基因型三角圖', 'Genotype triangle'), t.xL - 4, t.yT - 34);
    // 三角形
    g.beginPath(); g.moveTo(t.xL, t.yB); g.lineTo(t.xR, t.yB); g.lineTo(t.xM, t.yT); g.closePath();
    g.fillStyle = D.alpha(D.c.surface, D.dark ? 0.35 : 0.75); g.fill();
    g.strokeStyle = D.alpha(D.c.text, 0.35); g.lineWidth = 1.2; g.stroke();
    // 等 p 的格線（垂直線）
    g.strokeStyle = D.alpha(D.c.text, 0.06); g.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      const q = i / 10, xx = t.xL + (t.xR - t.xL) * q;
      const hmax = Math.min(2 * q, 2 * (1 - q));
      g.beginPath(); g.moveTo(xx, t.yB); g.lineTo(xx, t.yB - (t.yB - t.yT) * hmax); g.stroke();
    }
    // 自花授粉的平衡曲線
    const sig = val(el.sig);
    if (sig > 0.001 && sig < 0.999) {
      const F = H.selfingF(sig);
      g.setLineDash([2, 4]); g.strokeStyle = D.alpha(C['hw-eq'], 0.8); g.lineWidth = 1.5;
      g.beginPath();
      for (let i = 0; i <= 80; i++) { const p = i / 80, P = triPt(H.genotypes(p, F)); if (i) g.lineTo(P[0], P[1]); else g.moveTo(P[0], P[1]); }
      g.stroke(); g.setLineDash([]);
    }
    // 哈溫拋物線
    g.strokeStyle = C['hw-eq']; g.lineWidth = 2; g.setLineDash([7, 5]);
    g.beginPath();
    for (let i = 0; i <= 100; i++) { const p = i / 100, P = triPt(H.genotypes(p)); if (i) g.lineTo(P[0], P[1]); else g.moveTo(P[0], P[1]); }
    g.stroke(); g.setLineDash([]);
    // 頂點標籤
    const lab = function (s, xx, yy, col, al) { D.haloText(g, s, xx, yy, col, al, 'middle', '600 12px ' + FONT); };
    lab(T('AA 紅', 'AA red'), t.xL - 2, t.yB + 16, D.c.text, 'center');
    lab(T('aa 白', 'aa white'), t.xR + 2, t.yB + 16, D.c.text, 'center');
    lab(T('Aa 粉紅', 'Aa pink'), t.xM, t.yT - 13, D.c.text, 'center');
    // 軌跡
    const n = Math.floor(x);
    g.strokeStyle = D.alpha(D.c.text, 0.55); g.lineWidth = 1.3;
    for (let i = 0; i < n && i < s1.hist.length - 1; i++) {
      const A = triPt(s1.hist[i]), B = triPt(s1.hist[i + 1]);
      if (Math.hypot(B[0] - A[0], B[1] - A[1]) > 9) D.arrow(g, A[0], A[1], B[0], B[1], D.alpha(D.c.text, 0.6), 1.6);
      else { g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke(); }
    }
    for (let i = 1; i <= n && i < s1.hist.length; i++) {
      const P = triPt(s1.hist[i]);
      g.fillStyle = D.alpha(D.c.text, 0.6); g.beginPath(); g.arc(P[0], P[1], 2.5, 0, Math.PI * 2); g.fill();
    }
    // 目前的 p：往底邊的垂直虛線
    const P = triPt(gd);
    g.setLineDash([3, 3]); g.strokeStyle = D.alpha(D.c.text, 0.35); g.lineWidth = 1;
    g.beginPath(); g.moveTo(P[0], P[1]); g.lineTo(P[0], t.yB); g.stroke(); g.setLineDash([]);
    const pNow = H.alleleP(gd);
    D.pill(g, 'p = ' + num(pNow, 2), Math.max(t.xL + 26, Math.min(t.xR - 26, P[0])), t.yB + 38, D.c.text, 'center', '600 11.5px ' + FONT);
    // 起點（白點，可拖曳）
    const S = triPt(s1.start);
    g.fillStyle = '#ffffff'; g.strokeStyle = D.c.text; g.lineWidth = 1.8;
    g.beginPath(); g.arc(S[0], S[1], 7, 0, Math.PI * 2); g.fill(); g.stroke();
    if (kb1 && kb1.focused && kb1.focused()) { g.strokeStyle = D.c.accent; g.lineWidth = 2; g.beginPath(); g.arc(S[0], S[1], 11, 0, Math.PI * 2); g.stroke(); }
    // 目前的點
    if (x > 0.001) {
      g.fillStyle = D.c.accent; g.strokeStyle = D.c['canvas-bg']; g.lineWidth = 2;
      g.beginPath(); g.arc(P[0], P[1], 6, 0, Math.PI * 2); g.fill(); g.stroke();
    }
  }

  function drawBars(g, gd) {
    const b = L1.bars;
    title(g, T('基因型比例', 'Genotype shares'), b.x0 - 8, b.y0 - 26);
    const p = H.alleleP(gd), hw = H.genotypes(p);
    const gw = (b.x1 - b.x0) / 3, bw = Math.min(46, gw * 0.56);
    const yOf = function (f) { return b.y1 - (b.y1 - b.y0) * f; };
    g.strokeStyle = D.alpha(D.c.text, 0.25); g.lineWidth = 1;
    g.beginPath(); g.moveTo(b.x0, b.y1 + 0.5); g.lineTo(b.x1, b.y1 + 0.5); g.stroke();
    const names = ['AA', 'Aa', 'aa'];
    for (let i = 0; i < 3; i++) {
      const cx = b.x0 + gw * (i + 0.5);
      const y = yOf(gd[i]);
      g.fillStyle = GCOL(i);
      g.fillRect(cx - bw / 2, y, bw, b.y1 - y);
      if (i === 2) { g.strokeStyle = C['hw-edge']; g.lineWidth = 1; g.strokeRect(cx - bw / 2 + 0.5, y + 0.5, bw - 1, b.y1 - y - 1); }
      // 哈溫期望（虛線框）
      const ye = yOf(hw[i]);
      g.setLineDash([4, 3]); g.strokeStyle = C['hw-eq']; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(cx - bw / 2 - 5, ye); g.lineTo(cx + bw / 2 + 5, ye); g.stroke(); g.setLineDash([]);
      g.font = '600 11.5px ' + FONT; g.fillStyle = D.c.text; g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.fillText(pct(gd[i], 0), cx, Math.min(y, ye) - 3);
      g.textBaseline = 'top'; g.fillStyle = D.c.muted; g.font = '11.5px ' + FONT;
      g.fillText(names[i], cx, b.y1 + 5);
    }
  }

  function drawSquare(g, gd) {
    const q0 = L1.sq, S = q0.s, x0 = q0.x, y0 = q0.y;
    title(g, T('配子方格', 'Gamete square'), x0, y0 - 34);
    D.haloText(g, T('（隨機交配的部分）', '(random-mating part)'), x0, y0 - 19, D.c.muted, 'left', 'middle', '11px ' + FONT);
    const p = H.alleleP(gd), xs = x0 + 16, ys = y0 + 14, s = S - 18, cut = s * p;
    const cell = function (x, y, w, h, col, lbl, edge) {
      if (w < 0.5 || h < 0.5) return;
      g.fillStyle = col; g.fillRect(x, y, w, h);
      g.strokeStyle = edge ? C['hw-edge'] : D.alpha(D.c['canvas-bg'], 0.9); g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (w > 26 && h > 16) { g.font = '600 11px ' + FONT; g.fillStyle = '#1f2937'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(lbl, x + w / 2, y + h / 2); }
    };
    cell(xs, ys, cut, cut, GCOL(0), 'AA', false);
    cell(xs + cut, ys, s - cut, cut, GCOL(1), 'Aa', false);
    cell(xs, ys + cut, cut, s - cut, GCOL(1), 'Aa', false);
    cell(xs + cut, ys + cut, s - cut, s - cut, GCOL(2), 'aa', true);
    g.font = '11px ' + FONT; g.fillStyle = D.c.muted; g.textBaseline = 'bottom'; g.textAlign = 'center';
    if (cut > 12) g.fillText('A', xs + cut / 2, ys - 2);
    if (s - cut > 12) g.fillText('a', xs + cut + (s - cut) / 2, ys - 2);
    g.textAlign = 'right'; g.textBaseline = 'middle';
    if (cut > 12) g.fillText('A', xs - 4, ys + cut / 2);
    if (s - cut > 12) g.fillText('a', xs - 4, ys + cut + (s - cut) / 2);
    g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = D.c.muted;
    g.fillText('p = ' + num(p, 2) + '  q = ' + num(1 - p, 2), xs, ys + s + 5);
    // 寬螢幕：方格下面的空間放三角圖的看法
    if (L1.wide) {
      let y = ys + s + 34;
      g.font = '600 11.5px ' + FONT; g.fillStyle = D.c.text;
      g.fillText(T('三角圖怎麼看', 'Reading the triangle'), x0, y);
      y += 19;
      g.font = '11px ' + FONT; g.fillStyle = D.c.muted;
      [T('點到三個邊的距離＝三種基因型的比例。', 'A point’s distances to the three sides are the three genotype shares.'),
        T('紫色虛線上的點＝哈溫平衡。', 'Points on the purple curve are in Hardy–Weinberg equilibrium.'),
        T('交配不改變 p，點只會上下移動。', 'Mating does not change p, so the point only moves up or down.')].forEach(function (para) {
        y = wrapText(g, para, x0, y, W1 - 14 - x0, 15) + 6;
      });
    }
  }
  /** 簡單的換行（中文逐字、英文逐詞）；回傳下一行的 y */
  function wrapText(g, s, x, y, maxW, lh) {
    const words = /[\u3400-\u9fff]/.test(s) ? s.split('') : s.split(/(?= )/);
    let line = '';
    words.forEach(function (w) {
      const t = line + w;
      if (line && g.measureText(t).width > maxW && !/^[，。、；：）)]$/.test(w)) { g.fillText(line, x, y); y += lh; line = w.replace(/^ /, ''); }
      else line = t;
    });
    if (line) { g.fillText(line, x, y); y += lh; }
    return y;
  }

  // ---------- 第一部分的操作 ----------
  function legend1() {
    const sw = function (col, txt, cls, edge) { return '<span><i' + (cls ? ' class="' + cls + '"' : '') + ' style="background:' + col + ';color:' + col + (edge ? ';border:1px solid ' + C['hw-edge'] : '') + '"></i>' + txt + '</span>'; };
    $('legend').innerHTML = sw(C['hw-AA'], T('紅花 AA', 'red AA'), 'dot') + sw(C['hw-Aa'], T('粉紅花 Aa', 'pink Aa'), 'dot') + sw(C['hw-aa'], T('白花 aa', 'white aa'), 'dot', true) +
      sw(C['hw-eq'], T('哈溫比例 p²、2pq、q²', 'Hardy–Weinberg p², 2pq, q²'), 'dash');
  }
  function syncStart() {
    let a = val(el.fAA), b = val(el.faa);
    if (a + b > 1) b = 1 - a;
    s1.start = [a, Math.max(0, 1 - a - b), b];
  }
  function reset1(msg) {
    syncStart();
    s1.hist = [s1.start.slice()];
    s1.sigs = [];
    s1.anim = null;
    s1.lastTest = null;
    updateReadouts1();
    if (msg !== false) setStatus(T('第 0 代。按「下一代」讓花圃隨機交配（或照設定的比例自花授粉）一次。', 'Generation 0. Press “Next generation” to let the garden breed once (randomly, or selfing in the share you set).'));
    request();
  }
  function stepGen(n) {
    const sig = val(el.sig);
    const from = gen();
    for (let i = 0; i < n; i++) { s1.hist.push(H.mate(cur(), sig)); s1.sigs.push(sig); }
    if (s1.hist.length > 400) { s1.hist.splice(1, s1.hist.length - 400); }
    const to = gen();
    s1.anim = reducedMotion ? null : { from: from, to: to, t0: performance.now(), dur: n === 1 ? 650 : 1600 };
    if (n === 1) sndGen(to); else { for (let i = 0; i < Math.min(n, 6); i++) setTimeout(function () { sndGen(from + i + 1); }, i * 160); }
    const g = cur(), prev = s1.hist[s1.hist.length - 2];
    const F = H.inbreedingF(g), Feq = H.selfingF(sig);
    const sMin = Math.min.apply(null, s1.sigs), sMax = Math.max.apply(null, s1.sigs);
    emit('gen', { gen: to, steps: n, start: s1.start.slice(), g: g.slice(), prev: prev.slice(), sigma: sig, sigMin: sMin, sigMax: sMax, dev: H.hwDev(g), devStart: H.hwDev(s1.start), H0: s1.start[1], H: g[1], F: F, Fstart: H.inbreedingF(s1.start), Feq: Feq, p: H.alleleP(g) });
    let msg;
    if (sig === 0 && to - n === 0 && H.hwDev(s1.start) > 0.01) msg = T('隨機交配一代，點就垂直地跳到紫色的哈溫拋物線上：p 沒變，基因型變成 p²、2pq、q²。再按一次看看會不會再動。', 'One generation of random mating and the point drops straight onto the purple Hardy–Weinberg parabola: p is unchanged and the genotypes become p², 2pq, q². Press again — does it move?');
    else if (sig === 0) msg = T('已經在哈溫平衡：沒有天擇、突變、遷移與漂變時，基因型比例不會再變。', 'Already in Hardy–Weinberg equilibrium: with no selection, mutation, migration or drift the genotype shares stay put.');
    else if (sig >= 0.999) msg = T('完全自花授粉：粉紅的異型合子每代減半，p 不變。', 'Complete selfing: the pink heterozygotes halve every generation while p stays the same.');
    else msg = T('部分自花授粉：異型合子會停在只有哈溫比例 1 − F 倍的地方，F = σ/(2 − σ)（點虛線）。', 'Partial selfing: heterozygotes settle at 1 − F times the Hardy–Weinberg share, F = σ/(2 − σ) (the dotted curve).');
    setStatus(msg);
    say(T('第 ', 'Generation ') + to + T(' 代：紅 ', ': red ') + pct(g[0], 0) + T('，粉紅 ', ', pink ') + pct(g[1], 0) + T('，白 ', ', white ') + pct(g[2], 0));
    updateReadouts1();
    request();
  }
  function test1() {
    const n = Math.round(val(el.nS)), g = cur();
    const rnd = H.rng((Math.random() * 4294967296) >>> 0);
    const obs = H.sample(n, g, rnd);
    const r = H.hwTest(obs);
    const reject = r.pval < 0.05;
    s1.lastTest = { n: n, obs: obs, r: r, reject: reject, gen: gen(), sigma: val(el.sig) };
    tests.push(s1.lastTest);
    if (tests.length > 40) tests.shift();
    renderTests();
    if (reject) sndReject(); else sndAccept();
    emit('test', { gen: gen(), sigma: val(el.sig), n: n, obs: obs, chi2: r.chi2, pval: r.pval, reject: reject, F: H.inbreedingF(g), dev: H.hwDev(g), p: H.alleleP(g), Fhat: r.Fhat });
    const msg = (reject ? T('拒絕哈溫平衡：', 'Hardy–Weinberg rejected: ') : T('與哈溫平衡相符：', 'Consistent with Hardy–Weinberg: ')) + 'χ² = ' + num(r.chi2, 2) + (r.pval < 0.001 ? T('，P < 0.001', ', P < 0.001') : T('，P = ', ', P = ') + num(r.pval, 3)) + '.';
    setStatus(msg.replace(/\.$/, T('。', '.')));
    say(msg);
    updateReadouts1();
  }
  function renderTests() {
    const tb = $('tests');
    if (!tests.length) { tb.innerHTML = ''; return; }
    let h = '<thead><tr><th>' + T('世代', 'Gen.') + '</th><th>σ</th><th>n</th><th>' + T('觀察 AA, Aa, aa', 'Observed AA, Aa, aa') + '</th><th>' + T('期望', 'Expected') + '</th><th>χ²</th><th>P</th><th>' + T('結論', 'Verdict') + '</th></tr></thead><tbody>';
    tests.slice(-MAX_ROWS).reverse().forEach(function (x) {
      h += '<tr><td>' + x.gen + '</td><td>' + pct(x.sigma, 0) + '</td><td>' + x.n + '</td><td>' + x.obs.join(', ') + '</td><td>' + x.r.exp.map(function (e) { return num(e, 1); }).join(', ') + '</td><td>' + num(x.r.chi2, 2) + '</td><td>' +
        (x.r.pval < 0.001 ? '&lt; 0.001' : num(x.r.pval, 3)) + '</td><td' + (x.reject ? ' class="yes"' : '') + '>' + (x.reject ? T('拒絕', 'reject') : T('相符', 'consistent')) + '</td></tr>';
    });
    tb.innerHTML = h + '</tbody>';
  }
  function updateReadouts1() {
    const g = cur(), p = H.alleleP(g), hw = H.genotypes(p), F = H.inbreedingF(g), sig = val(el.sig);
    let h = '<dt>' + T('世代', 'Generation') + '</dt><dd>' + gen() + '</dd>';
    h += '<dt>' + T('對偶基因頻率', 'Allele frequencies') + '<small>(p, q)</small></dt><dd>(' + num(p, 3) + ', ' + num(1 - p, 3) + ')</dd>';
    h += '<dt>' + T('基因型', 'Genotypes') + '<small>(AA, Aa, aa)</small></dt><dd>(' + pct(g[0]) + ', ' + pct(g[1]) + ', ' + pct(g[2]) + ')</dd>';
    h += '<dt>' + T('哈溫比例', 'Hardy–Weinberg') + '<small>(p², 2pq, q²)</small></dt><dd>(' + pct(hw[0]) + ', ' + pct(hw[1]) + ', ' + pct(hw[2]) + ')</dd>';
    h += '<dt>' + T('近親交配係數', 'Inbreeding coefficient') + '<small>F = 1 − H/(2pq)</small></dt><dd>' + (p > 0 && p < 1 ? num(F, 3) : '—') + (sig > 0 ? '<small>' + T('自花授粉的平衡值 σ/(2 − σ) = ', 'selfing equilibrium σ/(2 − σ) = ') + num(H.selfingF(sig), 3) + '</small>' : '') + '</dd>';
    const L = s1.lastTest;
    if (L) {
      h += '<dt>' + T('上一次檢定', 'Last test') + '<small>' + T('第 ', 'generation ') + L.gen + T(' 代，n = ', ', n = ') + L.n + '</small></dt><dd>χ² = ' + num(L.r.chi2, 2) + (L.r.pval < 0.001 ? T('，P &lt; 0.001', ', P &lt; 0.001') : T('，P = ', ', P = ') + num(L.r.pval, 3)) +
        '<small>' + (L.reject ? T('P < 0.05：拒絕哈溫平衡', 'P < 0.05: reject Hardy–Weinberg') : T('P ≥ 0.05：沒有證據說不平衡', 'P ≥ 0.05: no evidence against equilibrium')) + '</small></dd>';
    }
    $('ro1').innerHTML = h;
  }

  // ---------- 拖曳起點 ----------
  let drag1 = false;
  function inTri(pt) {
    const t = L1.tri;
    if (pt[1] > t.yB + 10 || pt[1] < t.yT - 14) return false;
    const gg = triToG(pt[0], pt[1]);
    const P = triPt(gg);
    return Math.hypot(P[0] - pt[0], P[1] - pt[1]) < 14;
  }
  function setStart(gg, fire) {
    setQuiet(el.fAA, Math.round(gg[0] * 1000) / 1000);
    setQuiet(el.faa, Math.round(gg[2] * 1000) / 1000);
    refreshOutputs();
    reset1(fire ? undefined : false);
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (!L1) return;
    const pt = evPos(cv, ev);
    if (!inTri(pt)) return;
    drag1 = true;
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    setStart(triToG(pt[0], pt[1]), false);
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!L1) return;
    const pt = evPos(cv, ev);
    if (!drag1) { cv.style.cursor = inTri(pt) ? 'crosshair' : 'default'; return; }
    setStart(triToG(pt[0], pt[1]), false);
  });
  const end1 = function () { if (drag1) { drag1 = false; reset1(); } };
  cv.addEventListener('pointerup', end1); cv.addEventListener('pointercancel', end1);
  const kb1 = window.LabKeys ? window.LabKeys.attach(cv, {
    label: T('基因型三角圖：方向鍵移動起點（左右改變 p，上下改變粉紅花的比例；加 Shift 一次移比較多）。', 'Genotype triangle: arrow keys move the starting point (left/right change p, up/down the share of pink; Shift for bigger steps).'),
    items: [{
      name: function () { return T('起點', 'Starting point'); },
      move: function (dx, dy, big) {
        const st = big ? 0.05 : 0.01;
        const g0 = s1.start;
        const q = g0[1] / 2 + g0[2] + dx * st, hh = Math.max(0, Math.min(1, g0[1] - dy * st));
        const t = L1.tri;
        const gg = triToG(t.xL + (t.xR - t.xL) * Math.max(0, Math.min(1, q)), t.yB - (t.yB - t.yT) * hh);
        setStart(gg, true);
        return true;
      },
      describe: function () { const g0 = s1.start; return T('起點：紅 ', 'Start: red ') + pct(g0[0], 0) + T('，粉紅 ', ', pink ') + pct(g0[1], 0) + T('，白 ', ', white ') + pct(g0[2], 0); }
    }],
    onChange: function () { request(); }
  }) : null;

  // =====================================================================
  // 二・許多族群
  // =====================================================================
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  let W2 = 0, H2 = 0, L2 = null;
  let run2 = null, rows2 = [], runId = 0, inspectG = null, lastT2 = 0;
  const PRESETS = { neutral: [1, 1, 1], A: [1.1, 1.05, 1], lethal: [1, 1, 0], het: [0.88, 1, 0.14] };
  function params2() {
    return {
      N: Math.max(2, Math.round(val(el.N))), pops: Math.max(1, Math.round(val(el.pops))), p0: val(el.p0), gens: Math.max(10, Math.round(val(el.gens))),
      w: [val(el.wAA), val(el.wAa), val(el.waa)], u: val(el.mu), v: val(el.nu), m: val(el.mig), pm: val(el.pm)
    };
  }
  function markPreset() {
    const w = [val(el.wAA), val(el.wAa), val(el.waa)];
    document.querySelectorAll('#selSeg button').forEach(function (b) {
      const pr = PRESETS[b.getAttribute('data-sel')];
      b.setAttribute('aria-pressed', String(Math.abs(pr[0] - w[0]) < 1e-9 && Math.abs(pr[1] - w[1]) < 1e-9 && Math.abs(pr[2] - w[2]) < 1e-9));
    });
  }
  function resize2() {
    const w = cv2.clientWidth || 300;
    const wide = w >= 640;
    let h, pT, pH, pZ;
    if (wide) {
      h = 480;
      pT = { x0: 50, x1: w - 16, y0: 30, y1: 240 };
      const mid = Math.round(w * 0.5);
      pH = { x0: 50, x1: mid - 24, y0: 314, y1: h - 34 };
      pZ = { x0: mid + 40, x1: w - 16, y0: 314, y1: h - 34 };
    } else {
      pT = { x0: 46, x1: w - 14, y0: 30, y1: 220 };
      pH = { x0: 46, x1: w - 14, y0: pT.y1 + 80, y1: pT.y1 + 80 + 150 };
      pZ = { x0: 46, x1: w - 14, y0: pH.y1 + 76, y1: pH.y1 + 76 + 130 };
      h = pZ.y1 + 34;
    }
    const s = fit(cv2, ctx2, h);
    W2 = s.w; H2 = s.h;
    L2 = { wide: wide, pT: pT, pH: pH, pZ: pZ };
    if (view3 && view3.active) view3.onShow();
    draw2();
  }
  function headGen() { return run2 ? Math.min(run2.sim.gens, Math.floor(run2.head)) : 0; }
  function curG() { if (!run2) return 0; const hg = headGen(); return inspectG == null ? hg : Math.min(inspectG, hg); }
  function fateColor(p) { return p >= 1 ? C['hw-fix'] : p <= 0 ? C['hw-lost'] : C['hw-seg']; }

  function draw2() {
    if (!L2) return;
    const g = ctx2;
    D.backdrop(g, W2, H2);
    drawTraj(g); drawHist(g); drawHet(g);
  }
  function drawTraj(g) {
    const p = L2.pT;
    plotFrame(g, p);
    title(g, T('每個族群的 A 頻率 p', 'Frequency of A, p, in each population'), p.x0, p.y0 - 14);
    const gens = run2 ? run2.sim.gens : Math.round(val(el.gens));
    const xOf = function (t) { return p.x0 + (p.x1 - p.x0) * t / gens; };
    const yOf = function (v) { return p.y1 - (p.y1 - p.y0) * v; };
    yTicks(g, p, 0, 1, 0.25, function (v) { return num(v, 2); }, yOf);
    xTicks(g, p, 0, gens, niceStep(gens, L2.wide ? 8 : 5), function (v) { return num(v, 0); }, xOf, T('世代', 'gen.'));
    if (!run2) {
      g.font = '13px ' + FONT; g.fillStyle = D.c.muted; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(T('按「開始演化」', 'Press “Evolve”'), (p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2);
      return;
    }
    const sim = run2.sim, G = sim.gens + 1, hg = headGen();
    const step = Math.max(1, Math.floor(sim.gens / Math.max(60, (p.x1 - p.x0))));
    const alpha = sim.pops > 80 ? 0.35 : sim.pops > 30 ? 0.5 : 0.7;
    g.lineWidth = sim.pops > 80 ? 1 : 1.3;
    g.save(); g.beginPath(); g.rect(p.x0 - 2, p.y0 - 3, p.x1 - p.x0 + 4, p.y1 - p.y0 + 6); g.clip();
    for (let k = 0; k < sim.pops; k++) {
      const base = k * G;
      g.strokeStyle = D.alpha(fateColor(sim.P[base + hg]), alpha);
      g.beginPath();
      g.moveTo(xOf(0), yOf(sim.P[base]));
      for (let t = step; t <= hg; t += step) g.lineTo(xOf(t), yOf(sim.P[base + t]));
      if (hg % step) g.lineTo(xOf(hg), yOf(sim.P[base + hg]));
      g.stroke();
    }
    // 無限大族群的軌跡（理論）
    const sm = run2.sum0;
    g.setLineDash([7, 5]); g.strokeStyle = C['hw-eq']; g.lineWidth = 2;
    g.beginPath();
    for (let t = 0; t <= sim.gens; t += step) { const y = yOf(sim.det[t]); if (t) g.lineTo(xOf(t), y); else g.moveTo(xOf(t), y); }
    g.lineTo(xOf(sim.gens), yOf(sim.det[sim.gens]));
    g.stroke(); g.setLineDash([]);
    if (sm.pHat != null) { g.setLineDash([2, 4]); g.strokeStyle = D.alpha(C['hw-eq'], 0.8); g.lineWidth = 1.4; g.beginPath(); g.moveTo(p.x0, yOf(sm.pHat)); g.lineTo(p.x1, yOf(sm.pHat)); g.stroke(); g.setLineDash([]); }
    // 平均
    g.strokeStyle = D.c.text; g.lineWidth = 2.4;
    g.beginPath();
    for (let t = 0; t <= hg; t += step) { const y = yOf(sim.meanP[t]); if (t) g.lineTo(xOf(t), y); else g.moveTo(xOf(t), y); }
    g.lineTo(xOf(hg), yOf(sim.meanP[hg]));
    g.stroke();
    g.restore();
    // 檢視的世代
    const cg = curG();
    const xc = xOf(cg);
    g.strokeStyle = D.alpha(D.c.accent, 0.85); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(Math.round(xc) + 0.5, p.y0); g.lineTo(Math.round(xc) + 0.5, p.y1); g.stroke();
    if (kb2 && kb2.focused && kb2.focused()) { g.strokeStyle = D.alpha(D.c.accent, 0.35); g.lineWidth = 5; g.beginPath(); g.moveTo(xc, p.y0); g.lineTo(xc, p.y1); g.stroke(); }
    const lbl = T('第 ', 'gen. ') + cg + T(' 代', '');
    g.font = '600 11.5px ' + FONT;
    const tw = g.measureText(lbl).width + 14;
    D.pill(g, lbl, Math.max(p.x0 + tw / 2, Math.min(p.x1 - tw / 2, xc)), p.y0 + 16, D.c.accent, 'center', '600 11.5px ' + FONT);
  }
  function drawHist(g) {
    const p = L2.pH;
    plotFrame(g, p);
    title(g, T('第 ', 'Spread of p at generation ') + curG() + T(' 代各族群 p 的分布', ''), p.x0, p.y0 - 31);
    if (!run2) return;
    const B = 20, hs = H.histogram(run2.sim, curG(), B), pops = run2.sim.pops;
    const gap = 10, cw = (p.x1 - p.x0 - 2 * gap) / (B + 2);
    const maxC = Math.max(1, hs.lost, hs.fixed, Math.max.apply(null, hs.h));
    const top = niceCeil(maxC);
    const yOf = function (c) { return p.y1 - (p.y1 - p.y0) * c / top; };
    yTicks(g, p, 0, top, niceStep(top, 4) < 1 ? 1 : niceStep(top, 4), function (v) { return num(v, 0); }, yOf);
    const bar = function (x, c, col) { if (c <= 0) return; const y = yOf(c); g.fillStyle = col; g.fillRect(x + 1, y, cw - 2, p.y1 - y); };
    bar(p.x0, hs.lost, C['hw-lost']);
    for (let i = 0; i < B; i++) bar(p.x0 + gap + cw * (i + 1), hs.h[i], D.alpha(C['hw-seg'], 0.85));
    bar(p.x1 - cw, hs.fixed, C['hw-fix']);
    g.font = '11px ' + FONT; g.fillStyle = D.c.muted; g.textBaseline = 'top'; g.textAlign = 'center';
    g.fillText('0', p.x0 + cw / 2, p.y1 + 6);
    g.fillText('1', p.x1 - cw / 2, p.y1 + 6);
    g.fillText('0.5', p.x0 + gap + cw * (1 + B / 2), p.y1 + 6);
    g.textAlign = 'left'; g.fillStyle = C['hw-lost'];
    if (hs.lost) { g.textBaseline = 'bottom'; g.fillText(T('消失 ', 'lost ') + hs.lost, p.x0 + 2, yOf(hs.lost) - 2); }
    g.textAlign = 'right'; g.fillStyle = C['hw-fix'];
    if (hs.fixed) { g.textBaseline = 'bottom'; g.fillText(T('固定 ', 'fixed ') + hs.fixed, p.x1 - 2, yOf(hs.fixed) - 2); }
    // 平均 p 的位置
    const mp = run2.sim.meanP[curG()];
    const xm = p.x0 + gap + cw + (p.x1 - p.x0 - 2 * gap - 2 * cw) * mp;
    g.fillStyle = D.c.text;
    g.beginPath(); g.moveTo(xm, p.y1 + 1); g.lineTo(xm - 5, p.y1 + 9); g.lineTo(xm + 5, p.y1 + 9); g.closePath(); g.fill();
    D.haloText(g, T('縱軸：族群數（共 ', 'up: number of populations (of ') + pops + T('）', ')'), p.x0, p.y0 - 13, D.c.muted, 'left', 'middle', '11px ' + FONT);
  }
  function drawHet(g) {
    const p = L2.pZ;
    plotFrame(g, p);
    title(g, T('平均異型合子度 H = 2pq', 'Mean heterozygosity H = 2pq'), p.x0, p.y0 - 31);
    D.haloText(g, T('所有族群的平均；虛線是理論值', 'mean of all populations; dashed = theory'), p.x0, p.y0 - 13, D.c.muted, 'left', 'middle', '11px ' + FONT);
    if (!run2) return;
    const sim = run2.sim, hg = headGen();
    const xOf = function (t) { return p.x0 + (p.x1 - p.x0) * t / sim.gens; };
    let mx = 0;
    for (let t = 0; t <= sim.gens; t++) mx = Math.max(mx, sim.meanH[t], 2 * sim.det[t] * (1 - sim.det[t]));
    const top = Math.min(0.5, niceCeil(Math.max(0.05, mx * 1.08)));
    const yOf = function (v) { return p.y1 - (p.y1 - p.y0) * v / top; };
    yTicks(g, p, 0, top, niceStep(top, 3), function (v) { return num(v, 2); }, yOf);
    xTicks(g, p, 0, sim.gens, niceStep(sim.gens, L2.wide ? 4 : 5), function (v) { return num(v, 0); }, xOf, T('世代', 'gen.'));
    const step = Math.max(1, Math.floor(sim.gens / (p.x1 - p.x0)));
    // 理論
    g.setLineDash([7, 5]); g.strokeStyle = C['hw-eq']; g.lineWidth = 1.8;
    g.beginPath();
    const neutralSel = H.selKind(sim.o.w) === 'neutral' && !(sim.o.u > 0) && !(sim.o.v > 0) && !(sim.o.m > 0);
    for (let t = 0; t <= sim.gens; t += step) {
      const v = neutralSel ? H.hetDecay(sim.meanH[0], sim.N, t) : 2 * sim.det[t] * (1 - sim.det[t]);
      if (t) g.lineTo(xOf(t), yOf(v)); else g.moveTo(xOf(t), yOf(v));
    }
    g.stroke(); g.setLineDash([]);
    g.strokeStyle = C['hw-seg']; g.lineWidth = 2.2;
    g.beginPath();
    for (let t = 0; t <= hg; t += step) { const y = yOf(sim.meanH[t]); if (t) g.lineTo(xOf(t), y); else g.moveTo(xOf(t), y); }
    g.lineTo(xOf(hg), yOf(sim.meanH[hg]));
    g.stroke();
    const cg = curG();
    g.fillStyle = D.c.accent; g.beginPath(); g.arc(xOf(cg), yOf(sim.meanH[cg]), 3.5, 0, Math.PI * 2); g.fill();
  }

  function legend2() {
    const sw = function (col, txt, cls) { return '<span><i' + (cls ? ' class="' + cls + '"' : '') + ' style="background:' + col + ';color:' + col + '"></i>' + txt + '</span>'; };
    $('legend2').innerHTML = sw(C['hw-seg'], T('還在分離（A 與 a 都在）', 'still segregating (both alleles)')) + sw(C['hw-fix'], T('A 固定（p = 1）', 'A fixed (p = 1)')) + sw(C['hw-lost'], T('A 消失（p = 0）', 'A lost (p = 0)')) +
      sw(D.c.text, T('所有族群的平均', 'mean of all populations')) + sw(C['hw-eq'], T('理論：無限大族群／漂變公式', 'theory: infinite population / drift formula'), 'dash');
  }
  function start2() {
    const o = params2();
    o.seed = (Math.random() * 4294967296) >>> 0;
    const sim = H.simulate(o);
    runId++;
    run2 = { id: runId, o: o, sim: sim, head: 0, playing: true, done: false, t0: 0, sum0: H.summarize(sim), dur: Math.min(7, Math.max(2.5, o.gens * 0.035)) };
    inspectG = null;
    lastT2 = 0;
    if (reducedMotion) { finish2(); return; }
    setStatus2(T('演化中……', 'Evolving…'));
    request();
  }
  function finish2() {
    if (!run2 || run2.done) return;
    run2.head = run2.sim.gens; run2.playing = false; run2.done = true;
    const s = H.summarize(run2.sim);
    run2.sum = s;
    const row = { id: run2.id, o: run2.o, s: s };
    rows2.push(row); if (rows2.length > 30) rows2.shift();
    renderRows2();
    emit('drift', s);
    let msg = T('跑完 ', 'Done: ') + s.gens + T(' 代：', ' generations — ') + s.fixed + T(' 個族群 A 固定、', ' fixed, ') + s.lost + T(' 個 A 消失、', ' lost, ') + s.seg + T(' 個還在分離。', ' still segregating.');
    if (s.neutral && s.H0 > 0) msg += T(' 平均異型合子度剩下 ', ' Mean heterozygosity is down to ') + pct(s.Hratio, 0) + T('（理論 ', ' (theory ') + pct(s.Htheory, 0) + T('）。', ').');
    setStatus2(msg);
    say(msg);
    updateReadouts2();
    request();
  }
  function renderRows2() {
    const tb = $('runs2');
    if (!rows2.length) { tb.innerHTML = ''; return; }
    let h = '<thead><tr><th>N</th><th>' + T('族群數', 'Pops') + '</th><th>p<sub>0</sub></th><th>w<sub>AA</sub>, w<sub>Aa</sub>, w<sub>aa</sub></th><th>u, v</th><th>m (p<sub>m</sub>)</th><th>' + T('代數', 'Gens') + '</th><th>' + T('固定', 'Fixed') + '</th><th>' + T('消失', 'Lost') + '</th><th>' + T('平均 p', 'Mean p') + '</th><th>H/H<sub>0</sub></th></tr></thead><tbody>';
    rows2.slice(-MAX_ROWS).reverse().forEach(function (x) {
      const s = x.s;
      h += '<tr><td>' + s.N + '</td><td>' + s.pops + '</td><td>' + num(s.p0, 4) + '</td><td>' + s.w.map(function (v) { return num(v, 2); }).join(', ') + '</td><td>' + num(s.u, 4) + ', ' + num(s.v, 4) + '</td><td>' + (s.m > 0 ? num(s.m, 3) + ' (' + num(s.pm, 2) + ')' : '0') + '</td><td>' + s.gens + '</td><td>' + s.fixed + '</td><td>' + s.lost + '</td><td>' + num(s.meanP, 3) + '</td><td>' + (s.Hratio == null ? '—' : num(s.Hratio, 3)) + '</td></tr>';
    });
    tb.innerHTML = h + '</tbody>';
  }
  function updateReadouts2() {
    if (!run2) { $('ro2').innerHTML = '<dt>' + T('狀態', 'Status') + '</dt><dd>' + T('還沒開始', 'not started') + '</dd>'; return; }
    const sim = run2.sim, t = curG(), c = H.census(sim, t), s0 = run2.sum0;
    let h = '<dt>' + T('檢視的世代', 'Generation shown') + '</dt><dd>' + t + T(' ／ ', ' / ') + sim.gens + '</dd>';
    h += '<dt>' + T('A 的平均頻率', 'Mean frequency of A') + '</dt><dd>' + num(sim.meanP[t], 3) + '<small>' + T('無限大族群：', 'infinite population: ') + num(sim.det[t], 3) + '</small></dd>';
    h += '<dt>' + T('族群的結局', 'Fate of the populations') + '<small>(' + T('固定, 消失, 分離中', 'fixed, lost, segregating') + ')</small></dt><dd>(' + c.fixed + ', ' + c.lost + ', ' + c.seg + ')</dd>';
    h += '<dt>' + T('平均異型合子度', 'Mean heterozygosity') + '</dt><dd>' + num(sim.meanH[t], 3) + (s0.neutral && sim.meanH[0] > 0 ? '<small>' + T('漂變公式 H<sub>0</sub>(1 − 1/2N)<sup>t</sup> = ', 'drift formula H<sub>0</sub>(1 − 1/2N)<sup>t</sup> = ') + num(H.hetDecay(sim.meanH[0], sim.N, t), 3) + '</small>' : '') + '</dd>';
    if (s0.uFix != null) h += '<dt>' + T('A 最後固定的機率', 'Chance that A is fixed') + '<small>' + T('木村的擴散公式', 'Kimura’s diffusion formula') + '</small></dt><dd>' + (s0.uFix < 0.001 ? num(s0.uFix * 100, 3) + '%' : pct(s0.uFix)) + '<small>' + T('起點 1/(2N) 的中性突變：', 'a neutral new mutation, 1/(2N): ') + pct(1 / (2 * sim.N), 2) + '</small></dd>';
    if (run2.done && run2.sum.fixTime != null) h += '<dt>' + T('平均固定所需的世代', 'Mean time to fixation') + '</dt><dd>' + num(run2.sum.fixTime, 1) + '</dd>';
    if (s0.pHat != null) h += '<dt>' + T('異型合子優勢的平衡', 'Heterozygote-advantage equilibrium') + '</dt><dd>p̂ = ' + num(s0.pHat, 3) + '</dd>';
    if (s0.lethalQ != null) h += '<dt>' + T('隱性致死：a 的頻率', 'Recessive lethal: frequency of a') + '<small>q<sub>0</sub>/(1 + t·q<sub>0</sub>)</small></dt><dd>' + num((1 - s0.p0) / (1 + t * (1 - s0.p0)), 4) + '<small>' + T('模擬的平均：', 'simulated mean: ') + num(1 - sim.meanP[t], 4) + '</small></dd>';
    if (s0.mutSelQ != null) h += '<dt>' + T('突變–天擇平衡', 'Mutation–selection balance') + '<small>q̂ ≈ √(u/s)</small></dt><dd>' + num(s0.mutSelQ, 4) + '<small>' + T('模擬的平均 q：', 'simulated mean q: ') + num(1 - sim.meanP[t], 4) + '</small></dd>';
    if (sim.o.m > 0) h += '<dt>' + T('每代的移入個體數', 'Migrants per generation') + '</dt><dd>Nm = ' + num(sim.N * sim.o.m, 1) + '</dd>';
    $('ro2').innerHTML = h;
  }

  // ---------- 檢視的世代：拖曳與鍵盤 ----------
  let drag2 = false;
  function inT(pt) { const p = L2.pT; return pt[0] >= p.x0 - 8 && pt[0] <= p.x1 + 8 && pt[1] >= p.y0 - 8 && pt[1] <= p.y1 + 20; }
  function setInspect(t) {
    if (!run2) return;
    inspectG = Math.max(0, Math.min(headGen(), Math.round(t)));
    updateReadouts2(); request();
  }
  cv2.addEventListener('pointerdown', function (ev) {
    if (!run2 || !L2) return;
    const pt = evPos(cv2, ev);
    if (!inT(pt)) return;
    drag2 = true;
    try { cv2.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    const p = L2.pT; setInspect((pt[0] - p.x0) / (p.x1 - p.x0) * run2.sim.gens);
  });
  cv2.addEventListener('pointermove', function (ev) {
    if (!L2) return;
    const pt = evPos(cv2, ev);
    if (!drag2) { cv2.style.cursor = run2 && inT(pt) ? 'crosshair' : 'default'; return; }
    const p = L2.pT; setInspect((pt[0] - p.x0) / (p.x1 - p.x0) * run2.sim.gens);
  });
  const end2 = function () { drag2 = false; };
  cv2.addEventListener('pointerup', end2); cv2.addEventListener('pointercancel', end2);
  const kb2 = window.LabKeys ? window.LabKeys.attach(cv2, {
    label: T('族群頻率圖：左右方向鍵選擇檢視的世代（加 Shift 一次移動比較多）。', 'Frequency graph: left/right arrows pick the generation shown (Shift for bigger steps).'),
    items: [{
      name: function () { return T('檢視的世代', 'Generation shown'); },
      move: function (dx, dy, big) {
        if (!run2 || !dx) return false;
        const st = big ? Math.max(1, Math.round(run2.sim.gens / 20)) : 1;
        setInspect(curG() + dx * st);
        return true;
      },
      describe: function () {
        if (!run2) return T('還沒開始', 'Not started');
        const t = curG(), c = H.census(run2.sim, t);
        return T('第 ', 'Generation ') + t + T(' 代：平均 p = ', ': mean p = ') + num(run2.sim.meanP[t], 3) + T('，固定 ', ', fixed ') + c.fixed + T('，消失 ', ', lost ') + c.lost;
      }
    }],
    onChange: function () { request(); }
  }) : null;

  // =====================================================================
  // 動畫
  // =====================================================================
  let raf = 0;
  function request() { if (!raf) raf = requestAnimationFrame(tick); }
  function tick(now) {
    raf = 0;
    let more = false;
    if (s1.anim) {
      if (now - s1.anim.t0 >= s1.anim.dur) s1.anim = null; else more = true;
    }
    if (run2 && run2.playing) {
      if (!lastT2) lastT2 = now;
      const dt = Math.min(0.1, (now - lastT2) / 1000);
      lastT2 = now;
      const prev = Math.floor(run2.head);
      run2.head = Math.min(run2.sim.gens, run2.head + dt * run2.sim.gens / run2.dur);
      const hg = Math.floor(run2.head), G = run2.sim.gens + 1;
      if (hg > prev) {
        const sim = run2.sim;
        for (let k = 0; k < sim.pops; k++) {
          const a = sim.P[k * G + prev], b = sim.P[k * G + hg];
          if (b >= 1 && a < 1) sndFate(true); else if (b <= 0 && a > 0) sndFate(false);
        }
        updateReadouts2();
      }
      if (run2.head >= run2.sim.gens) finish2(); else more = true;
    }
    draw1();
    if (view3 && view3.active) { view3.frame(); if (view3.busy && view3.busy()) more = true; }
    else draw2();
    if (more) request();
  }

  // =====================================================================
  // 3D 檢視：切換時才載入 js/hardy-weinberg-3d.js 與 three.js；切回 2D 時整個釋放。
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage2'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    H: H, T: T, D: D, num: num, reducedMotion: reducedMotion,
    colors: function () { return C; },
    run: function () { return run2; },
    head: function () { return run2 ? run2.head : 0; },
    cur: function () { return curG(); },
    request: function () { request(); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 圖表。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.HW3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.HW3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/hardy-weinberg-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.HW3D) throw new Error('hardy-weinberg-3d.js did not load');
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
        view3 = window.HW3D.create(lib, host3, bridge);
        viewMsg.textContent = run2 ? '' : T('先按「開始演化」，3D 曲面會隨著世代長出來。', 'Press “Evolve” and the surface grows generation by generation.');
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
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 圖表。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize2();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // =====================================================================
  // 事件綁定
  // =====================================================================
  el.fAA.addEventListener('input', function () { if (val(el.fAA) + val(el.faa) > 1) setQuiet(el.faa, Math.round((1 - val(el.fAA)) * 1000) / 1000); refreshOutputs(); reset1(); });
  el.faa.addEventListener('input', function () { if (val(el.fAA) + val(el.faa) > 1) setQuiet(el.fAA, Math.round((1 - val(el.faa)) * 1000) / 1000); refreshOutputs(); reset1(); });
  el.sig.addEventListener('input', function () { refreshOutputs(); updateReadouts1(); request(); });
  el.nS.addEventListener('input', refreshOutputs);
  $('next1').addEventListener('click', function () { stepGen(1); });
  $('next10').addEventListener('click', function () { stepGen(10); });
  $('back1').addEventListener('click', function () { reset1(); });
  $('clearAll').addEventListener('click', function () { tests = []; renderTests(); reset1(); setStatus(T('已清除檢定紀錄，回到第 0 代；設定沒有改變。', 'Test record cleared and back to generation 0; the settings are unchanged.')); });
  $('test1').addEventListener('click', test1);
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  document.querySelectorAll('#selSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      const pr = PRESETS[b.getAttribute('data-sel')];
      setRange(el.wAA, pr[0]); setRange(el.wAa, pr[1]); setRange(el.waa, pr[2]);
      refreshOutputs(); markPreset(); changed2();
    });
  });
  function changed2() {
    if (run2 && run2.playing) { run2.playing = false; }
    if (run2) setStatus2(T('設定改了：按「開始演化」用新的設定重新跑。', 'Settings changed: press “Evolve” to run again with them.'));
  }
  [el.N, el.pops, el.p0, el.gens, el.wAA, el.wAa, el.waa, el.mu, el.nu, el.mig, el.pm].forEach(function (r) {
    r.addEventListener('input', function () { refreshOutputs(); markPreset(); changed2(); });
  });
  $('run2').addEventListener('click', start2);
  $('pause2').addEventListener('click', function () {
    if (!run2 || run2.done) return;
    run2.playing = !run2.playing;
    lastT2 = 0;
    $('pause2').textContent = run2.playing ? T('暫停', 'Pause') : T('繼續', 'Resume');
    if (run2.playing) request();
  });
  $('clear2').addEventListener('click', function () { rows2 = []; renderRows2(); setStatus2(T('已清除紀錄表；設定沒有改變。', 'Table cleared; the settings are unchanged.')); });

  // ---------- 分享目前設定（滑桿由 classroom.js 記錄；這裡只在還原後重算） ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { v: 1 }; },
    set: function () { refreshOutputs(); markPreset(); reset1(false); }
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  refreshOutputs();
  updateSoundButton();
  markPreset();
  legend1(); legend2();
  function themeChanged() {
    readColors();
    if (view3 && view3.active) view3.onTheme();
    legend1(); legend2();
    request();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  reset1();
  updateReadouts2();
  setStatus2(T('先用預設值按「開始演化」：30 個各有 50 株的中性族群，看 A 的頻率怎麼因為運氣而漂開。', 'Press “Evolve” with the defaults: 30 neutral populations of 50 plants each. Watch the frequency of A drift apart by chance.'));
  if (reducedMotion) $('status2').textContent += T('（已偵測到「減少動態效果」：直接顯示結果。）', ' (Reduced motion is on: results are shown at once.)');
  if (window.ResizeObserver) {
    const watch = function (c, fn) { let lw = 0; new ResizeObserver(function () { if (c.clientWidth && c.clientWidth !== lw) { lw = c.clientWidth; fn(); } }).observe(c); };
    watch(cv, resize1); watch(cv2, resize2);
  } else window.addEventListener('resize', function () { resize1(); resize2(); });
  resize1(); resize2();
  request();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastT2 = 0; request(); } });
  // 測試與縮圖用
  window.__hw = {
    H: H, s1: s1,
    run2: function () { return run2; },
    next: stepGen, test: test1, reset1: reset1, setStart: function (gg) { setStart(gg, true); },
    start2: start2, finish2: function () { finish2(); }, setView: setView, setInspect: setInspect,
    preset: function (k) { const b = document.querySelector('#selSeg [data-sel="' + k + '"]'); if (b) b.click(); }
  };
})();
