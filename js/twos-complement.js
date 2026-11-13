/* twos-complement.js — 「負數與二補數」的畫面與互動（計算在 twos-complement-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 數值一律立刻改變；指針轉動、弧線伸長、進位一格一格出現、接縫閃光，只是把「已經算好的結果」用動畫呈現（不改任何數值）。
 * 任務事件只在使用者操作之後送出，欄位與時機和 tools/mission-proofs/twos-complement.js 的 Sim 完全一致
 * （見 js/missions/twos-complement.js 開頭的說明）。挑戰中題目自己設定的 A、B 不送事件。 */
(function () {
  'use strict';
  const K = window.TwosCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const MONO = 'ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace';
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const alpha = D.alpha, shade = D.shade, mix = D.mix;
  const P2 = K.pow2;
  const REPS = ['twos', 'ones', 'sign', 'bias'];
  const REP_BTN = { twos: 'repTwos', ones: 'repOnes', sign: 'repSign', bias: 'repBias' };
  const LOG_MAX = 8;
  const TAU = Math.PI * 2;

  function repName(rep) {
    if (rep === 'ones') return T('一補數', 'ones’ complement');
    if (rep === 'sign') return T('原碼', 'sign–magnitude');
    if (rep === 'bias') return T('偏移碼', 'offset binary');
    if (rep === 'unsigned') return T('無號', 'unsigned');
    return T('二補數', 'two’s complement');
  }
  const it = K.intText;
  function fnt(px, weight, family) { return (weight ? weight + ' ' : '') + px + 'px ' + (family || FONT); }
  /** 位元圖樣的短寫：12 位元以內寫二進位（4 位一組），更長寫十六進位 */
  function patText(u, n) { return n <= 12 ? K.binText(u, n, true) : '0x' + K.hexText(u, n); }
  function signedPar(v, nz) { const s = nz ? '−0' : it(v); return v < 0 || nz ? '(' + s + ')' : s; }

  // ---------- 狀態 ----------
  const state = {
    n: 8, rep: 'twos', u: 0, vSrc: 'start', b: 1, bSrc: 'start', m: 16, last: null,
    pos: 0.5,                                  // 指針在環上的位置（以格為單位，畫面用）
    tgt: new Array(32).fill(0), disp: new Array(32).fill(0), flips: [],
    work: { mode: 'idle', t0: 0 }, arcs: null, flashes: [], pend: [],
    log: [], rounds: [], quiz: null, streak: 0, info: null,
    focus: 0, bFocus: 0, hover: -1, hoverB: -1
  };
  let qrand = K.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);

  // ---------- 色彩 ----------
  let C = {};
  const TOK = ['canvas-bg', 'text', 'muted', 'border', 'accent', 'accent-soft', 'surface',
    'tc-pos', 'tc-neg', 'tc-zero', 'tc-sign', 'tc-on', 'tc-off', 'tc-panel', 'tc-c', 'tc-v', 'tc-ok', 'tc-b'];
  let sprites = {}, ringCache = null;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    TOK.forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    sprites = {}; ringCache = null;
  }
  /** 有號值的顏色：正數橘、負數（含負零）藍、0 用文字色 */
  function valColor(v, nz, strong) {
    if (v > 0) return strong ? shade(C['tc-pos'], D.dark ? 0.12 : -0.12) : C['tc-pos'];
    if (v < 0 || nz) return strong ? shade(C['tc-neg'], D.dark ? 0.12 : -0.1) : C['tc-neg'];
    return C.text;
  }
  /** 環帶上的顏色：0 是淡色，越接近最大的正數越橘、越接近最小的負數越藍 */
  function bandColor(u, n, rep) {
    const v = K.value(u, n, rep), rg = K.range(n, rep);
    if (v > 0) return mix(C['tc-zero'], C['tc-pos'], 0.18 + 0.82 * Math.pow(v / rg.max, 0.75));
    if (v < 0) return mix(C['tc-zero'], C['tc-neg'], 0.18 + 0.82 * Math.pow(v / rg.min, 0.75));
    return K.isNegZero(u, n, rep) ? mix(C['tc-zero'], C['tc-neg'], 0.1) : C['tc-zero'];
  }

  // =====================================================================
  // 版面
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d'), wrap2 = $('cv2wrap');
  const stage = $('stage'), lab = $('lab');
  let dpr = 1, cw = 320, ch = 420, cw2 = 320, ch2 = 206, L = null, W2 = null;

  function layout() {
    const W = cw, wide = W >= 620, n = state.n;
    const S = wide ? Math.min(Math.round(W * 0.5), 440) : Math.min(W, 380);
    // 燈排
    const ax = wide ? S + 8 : 8, aw = wide ? W - S - 16 : W - 16;
    const perRow = n <= 8 ? n : 8, rows = Math.ceil(n / perRow);
    const pitch = Math.min(56, (aw - 16) / perRow);
    const r = Math.max(8, Math.min(16, pitch * 0.3));
    const headH = 24, placeH = 32, digitH = 18;
    const rowH = placeH + 2 * r + 8 + digitH + 6;
    const panelW = perRow * pitch + 16, panelH = rows * rowH + 8;
    const sumH = 32, lampH = headH + panelH + sumH;
    const H = Math.ceil(wide ? Math.max(S, lampH + 16) : S + 6 + lampH + 8);
    const ay = wide ? Math.max(8, (H - lampH) / 2) : S + 6;
    const ring = { ox: wide ? 0 : Math.round((W - S) / 2), oy: wide ? Math.round((H - S) / 2) : 0, S: S };
    const mx = 46, my = 36;
    const ro = Math.max(60, Math.min((S - 2 * mx) / 2, (S - 2 * my) / 2));
    const band = Math.max(16, Math.min(34, ro * 0.2));
    ring.ro = ro; ring.band = band; ring.ri = ro - band; ring.rc = ring.ri - Math.max(18, band * 0.85);
    ring.cx = ring.ox + S / 2; ring.cy = ring.oy + S / 2;
    const panelX = ax + (aw - panelW) / 2;
    return {
      wide: wide, narrow: W < 560, ring: ring, ax: ax, aw: aw, ay: ay, perRow: perRow, rows: rows, pitch: pitch, r: r,
      headH: headH, placeH: placeH, digitH: digitH, rowH: rowH, panelX: panelX, panelY: ay + headH, panelW: panelW, panelH: panelH,
      right: panelX + 8 + perRow * pitch, sumY: ay + headH + panelH + 22, H: H
    };
  }
  /** 第 i 個位元（0 = 最低位）的燈在畫布上的位置 */
  function lampPos(i) {
    const col = i % L.perRow, rowFromBottom = Math.floor(i / L.perRow);
    const row = L.rows - 1 - rowFromBottom;
    const x = L.right - (col + 0.5) * L.pitch;
    const y0 = L.panelY + 4 + row * L.rowH;
    const cy = y0 + L.placeH + L.r + 2;
    return { x: x, y0: y0, cy: cy, dy: cy + L.r + 8 + L.digitH / 2, row: row };
  }
  /** 直式的版面：位元數多、畫面窄時畫布比外框寬，外框可以左右捲動 */
  function layout2(ww) {
    const wk = state.work, narrow = ww < 560;
    const nb = wk.mode === 'ext' ? wk.m : state.n;
    const cols = wk.mode === 'ext' ? nb : nb + 1;
    const gaps = Math.floor((cols - 1) / 4), g = 5, pad = 10;
    const LW = narrow ? 46 : 64;
    const VW = Math.round((it(-P2(nb - 1)).length + 4) * 7.4 + 26);
    let cell = (ww - LW - VW - 2 * pad - gaps * g) / cols;
    cell = Math.max(10, Math.min(24, cell));
    const bitsW = cols * cell + gaps * g;
    const W = Math.max(ww, Math.ceil(LW + VW + 2 * pad + bitsW));
    const x0 = Math.max(0, (W - (LW + VW + 2 * pad + bitsW)) / 2);
    return { W: W, H: 206, LW: LW, VW: VW, pad: pad, g: g, cell: cell, cols: cols, nb: nb, x0: x0, bitsRight: x0 + pad + LW + bitsW, narrow: narrow };
  }
  function colX(i) { return W2.bitsRight - (i + 0.5) * W2.cell - Math.floor(i / 4) * W2.g; }

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layout();
    ch = L.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    sprites = {}; ringCache = null;
    resize2();
    requestDraw();
  }
  function resize2() {
    const ww = wrap2.clientWidth || cw;
    W2 = layout2(ww);
    cw2 = W2.W; ch2 = W2.H;
    if (cv2.style.width !== cw2 + 'px') cv2.style.width = cw2 + 'px';
    if (cv2.style.height !== ch2 + 'px') cv2.style.height = ch2 + 'px';
    cv2.width = Math.round(cw2 * dpr);
    cv2.height = Math.round(ch2 * dpr);
    requestDraw();
  }

  // =====================================================================
  // 燈泡（預先畫成小圖重複使用）
  // =====================================================================
  function sprite(kind, r) {
    const key = kind + '|' + r.toFixed(1) + '|' + dpr + '|' + D.ver;
    if (sprites[key]) return sprites[key];
    const glow = kind === 'glow' || kind === 'sglow';
    const R = glow ? r * 2.4 : r + 4;
    const c = document.createElement('canvas');
    const S = Math.ceil(R * 2 * dpr) + 2;
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const o = S / dpr / 2;
    const onCol = kind === 'son' || kind === 'sglow' ? C['tc-sign'] : C['tc-on'];
    if (glow) {
      const gr = g.createRadialGradient(o, o, r * 0.6, o, o, R);
      gr.addColorStop(0, alpha(onCol, D.dark ? 0.55 : 0.4));
      gr.addColorStop(0.45, alpha(onCol, D.dark ? 0.2 : 0.13));
      gr.addColorStop(1, alpha(onCol, 0));
      g.fillStyle = gr;
      g.beginPath(); g.arc(o, o, R, 0, TAU); g.fill();
    } else {
      const bz = g.createLinearGradient(0, o - r - 4, 0, o + r + 4);
      bz.addColorStop(0, shade(C['tc-panel'], D.dark ? 0.32 : 0.55));
      bz.addColorStop(1, shade(C['tc-panel'], D.dark ? -0.45 : -0.32));
      g.fillStyle = bz;
      g.beginPath(); g.arc(o, o, r + 3.2, 0, TAU); g.fill();
      const on = kind === 'on' || kind === 'son';
      const base = on ? onCol : C['tc-off'];
      const gr = g.createRadialGradient(o - r * 0.33, o - r * 0.36, r * 0.08, o, o, r);
      if (on) {
        gr.addColorStop(0, shade(base, 0.85));
        gr.addColorStop(0.35, shade(base, 0.35));
        gr.addColorStop(0.8, base);
        gr.addColorStop(1, shade(base, -0.28));
      } else {
        gr.addColorStop(0, shade(base, D.dark ? 0.25 : 0.55));
        gr.addColorStop(0.55, base);
        gr.addColorStop(1, shade(base, D.dark ? -0.45 : -0.3));
      }
      g.fillStyle = gr;
      g.beginPath(); g.arc(o, o, r, 0, TAU); g.fill();
      g.strokeStyle = alpha(shade(base, -0.5), on ? 0.55 : 0.5);
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,' + (on ? 0.55 : (D.dark ? 0.22 : 0.6)) + ')';
      g.beginPath(); g.ellipse(o - r * 0.32, o - r * 0.42, r * 0.34, r * 0.2, -0.5, 0, TAU); g.fill();
    }
    sprites[key] = { c: c, o: o };
    return sprites[key];
  }
  function blit(s, x, y, a) {
    ctx.globalAlpha = a;
    ctx.drawImage(s.c, x - s.o, y - s.o, s.c.width / dpr, s.c.height / dpr);
    ctx.globalAlpha = 1;
  }

  // =====================================================================
  // 數字環（靜態部分畫在離屏畫布）
  // =====================================================================
  /** θ 從頂端順時針量；pos 以格為單位（格中心是 u + 0.5） */
  function thetaOf(pos) { return TAU * pos / P2(state.n); }
  function ptAt(r, th) { const R = L.ring; return { x: R.cx + r * Math.sin(th), y: R.cy - r * Math.cos(th) }; }
  function arcPath(c, cx, cy, r, th0, th1) {
    if (th1 >= th0) c.arc(cx, cy, r, th0 - Math.PI / 2, th1 - Math.PI / 2, false);
    else c.arc(cx, cy, r, th0 - Math.PI / 2, th1 - Math.PI / 2, true);
  }
  function buildRing() {
    const R = L.ring, n = state.n, rep = state.rep, M = P2(n);
    const c = document.createElement('canvas');
    c.width = Math.ceil(R.S * dpr); c.height = Math.ceil(R.S * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cx = R.S / 2, cy = R.S / 2, ro = R.ro, ri = R.ri;
    const ann = function () { g.beginPath(); g.arc(cx, cy, ro, 0, TAU); g.arc(cx, cy, ri, TAU, 0, true); g.closePath(); };
    // 投影
    g.save();
    g.shadowColor = D.shadowInk(D.dark ? 0.6 : 0.22);
    g.shadowBlur = 16; g.shadowOffsetY = 4;
    ann(); g.fillStyle = C['tc-zero']; g.fill();
    g.restore();
    // 每一格的顏色（格子太多時一段代表好幾格，用中間那格的值）
    const segs = Math.min(M, 512), per = M / segs;
    for (let k = 0; k < segs; k++) {
      const u = Math.floor(k * per + per / 2);
      const a0 = TAU * k / segs - Math.PI / 2, a1 = TAU * (k + 1) / segs - Math.PI / 2 + (M > 64 ? 0.004 : 0);
      g.beginPath(); g.arc(cx, cy, ro, a0, a1); g.arc(cx, cy, ri, a1, a0, true); g.closePath();
      g.fillStyle = bandColor(u, n, rep);
      g.fill();
    }
    // 格線（格子夠大時）
    if (M <= 64) {
      g.beginPath();
      for (let k = 0; k < M; k++) {
        const a = TAU * k / M;
        g.moveTo(cx + ri * Math.sin(a), cy - ri * Math.cos(a));
        g.lineTo(cx + ro * Math.sin(a), cy - ro * Math.cos(a));
      }
      g.strokeStyle = alpha(C['canvas-bg'], M <= 16 ? 0.9 : 0.6);
      g.lineWidth = M <= 16 ? 1.6 : 1;
      g.stroke();
    }
    // 立體感：內外緣暗、中間亮，上方再打一點光
    ann();
    const sh = g.createRadialGradient(cx, cy, ri, cx, cy, ro);
    sh.addColorStop(0, 'rgba(0,0,0,' + (D.dark ? 0.3 : 0.16) + ')');
    sh.addColorStop(0.32, 'rgba(255,255,255,' + (D.dark ? 0.04 : 0.1) + ')');
    sh.addColorStop(0.55, 'rgba(255,255,255,' + (D.dark ? 0.1 : 0.24) + ')');
    sh.addColorStop(1, 'rgba(0,0,0,' + (D.dark ? 0.32 : 0.16) + ')');
    g.fillStyle = sh; g.fill();
    ann();
    const lt = g.createLinearGradient(0, cy - ro, 0, cy + ro);
    lt.addColorStop(0, 'rgba(255,255,255,' + (D.dark ? 0.08 : 0.16) + ')');
    lt.addColorStop(1, 'rgba(0,0,0,' + (D.dark ? 0.16 : 0.07) + ')');
    g.fillStyle = lt; g.fill();
    g.lineWidth = 1;
    g.strokeStyle = alpha(C.text, D.dark ? 0.25 : 0.2);
    g.beginPath(); g.arc(cx, cy, ro, 0, TAU); g.stroke();
    g.beginPath(); g.arc(cx, cy, ri, 0, TAU); g.stroke();
    // 刻度
    const ticks = M <= 64 ? M : 32;
    g.beginPath();
    for (let k = 0; k < ticks; k++) {
      const a = TAU * k / ticks, big = k % (ticks / 4) === 0;
      g.moveTo(cx + (ro + 2) * Math.sin(a), cy - (ro + 2) * Math.cos(a));
      g.lineTo(cx + (ro + (big ? 7 : 4.5)) * Math.sin(a), cy - (ro + (big ? 7 : 4.5)) * Math.cos(a));
    }
    g.strokeStyle = alpha(C.muted, 0.55); g.lineWidth = 1; g.stroke();
    // 中間的圓盤
    g.save();
    g.shadowColor = D.shadowInk(D.dark ? 0.5 : 0.14);
    g.shadowBlur = 10; g.shadowOffsetY = 2;
    const dg = g.createRadialGradient(cx - R.rc * 0.3, cy - R.rc * 0.38, R.rc * 0.1, cx, cy, R.rc);
    dg.addColorStop(0, shade(C['tc-panel'], D.dark ? 0.12 : 0.6));
    dg.addColorStop(1, shade(C['tc-panel'], D.dark ? -0.18 : -0.02));
    g.fillStyle = dg;
    g.beginPath(); g.arc(cx, cy, R.rc, 0, TAU); g.fill();
    g.restore();
    g.strokeStyle = alpha(C.text, D.dark ? 0.16 : 0.1);
    g.beginPath(); g.arc(cx, cy, R.rc, 0, TAU); g.stroke();
    // 兩條接縫：頂端 C（111…1 → 000…0）、底端 V（011…1 → 100…0）
    [[0, C['tc-c'], 'C'], [Math.PI, C['tc-v'], 'V']].forEach(function (s) {
      const a = s[0];
      const p0 = { x: cx + (ri - 5) * Math.sin(a), y: cy - (ri - 5) * Math.cos(a) };
      const p1 = { x: cx + (ro + 5) * Math.sin(a), y: cy - (ro + 5) * Math.cos(a) };
      g.lineCap = 'round';
      g.strokeStyle = alpha(C['canvas-bg'], 0.9); g.lineWidth = 6;
      g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
      g.strokeStyle = s[1]; g.lineWidth = 3;
      g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
      if (a === 0) D.pill(g, s[2], cx, cy - ro - 9, s[1], 'center', fnt(12.5, 700));
      else D.pill(g, s[2], cx, cy + ro + 9 + 19, s[1], 'center', fnt(12.5, 700));
    });
    // 標籤：外圈是無號值（或 4 位元的圖樣），內圈是目前表示法讀出的值
    const label = function (u, th, outer) {
      const r = outer ? ro + 13 : ri - 15;
      const x = cx + r * Math.sin(th), y = cy - r * Math.cos(th);
      const s = Math.sin(th);
      // 靠近頂端、底端的標籤往接縫外側寫（兩邊的字不會疊在一起）；左右兩側的內圈標籤往圓心寫
      const align = (outer || Math.abs(s) < 0.5) ? (s > 0 ? 'left' : 'right') : (s > 0 ? 'right' : 'left');
      const v = outer ? u : K.value(u, n, rep), nz = !outer && K.isNegZero(u, n, rep);
      const col = outer ? alpha(C.muted, 0.95) : valColor(v, nz, true);
      const px = outer ? (n <= 4 ? 10.5 : 11) : 11.5, wt = outer ? 500 : 700;
      const parts = nz ? null : bigParts(v);
      if (parts) powText(g, parts.pre, parts.sup, parts.post, x, y + px * 0.36, col, px, wt, align);
      else if (outer) D.haloText(g, n <= 4 ? K.binText(u, n, false) : it(u), x, y, col, align, 'middle', fnt(px, wt, n <= 4 ? MONO : FONT));
      else D.haloText(g, K.valText(u, n, rep), x, y, col, align, 'middle', fnt(px, wt));
    };
    if (n <= 4) {
      for (let u = 0; u < M; u++) { const th = TAU * (u + 0.5) / M; label(u, th, true); label(u, th, false); }
    } else {
      const h = P2(n - 1), q = P2(n - 2);
      const dOut = Math.max(TAU * 0.5 / M, 0.2), dIn = Math.max(TAU * 0.5 / M, 0.24);
      [[0, 1], [M - 1, -1], [h - 1, -1], [h, 1]].forEach(function (p) {
        const base = p[0] === 0 || p[0] === M - 1 ? 0 : Math.PI;
        label(p[0], base + p[1] * dOut, true);
        label(p[0], base + p[1] * dIn, false);
      });
      if (n <= 16) { label(q, Math.PI / 2, true); label(3 * q, 3 * Math.PI / 2, true); }
    }
    ringCache = { c: c, key: ringKey() };
  }
  /** 很大的數寫成 2 的次方（±2^k、2^k − 1、−(2^k − 1)），其他回傳 null */
  function bigParts(v) {
    const a = Math.abs(v);
    if (a < 65536) return null;
    const k = Math.round(Math.log2(a)), k1 = Math.round(Math.log2(a + 1));
    if (P2(k) === a) return { pre: v < 0 ? '−2' : '2', sup: String(k), post: '' };
    if (P2(k1) === a + 1) return v < 0 ? { pre: '−(2', sup: String(k1), post: ' − 1)' } : { pre: '2', sup: String(k1), post: ' − 1' };
    return null;
  }
  function ringKey() { return [state.n, state.rep, L.ring.S, dpr, D.ver, cw].join('|'); }

  // =====================================================================
  // 繪圖
  // =====================================================================
  let drawQueued = false;
  function requestDraw() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(frame); } }
  let lastT = 0;
  function frame(t) {
    drawQueued = false;
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t;
    const busy = step(t, dt);
    draw(t);
    drawWork(t);
    if (busy) requestDraw(); else lastT = 0;
  }
  function step(t, dt) {
    let busy = false;
    const now = performance.now();
    // 排好時間的事件（接縫閃光、聲音）
    if (state.pend.length) {
      state.pend = state.pend.filter(function (p) { if (now >= p.at) { p.fn(); return false; } return true; });
      if (state.pend.length) busy = true;
    }
    state.flips = state.flips.filter(function (f) {
      if (now >= f.at || reducedMotion) { state.tgt[f.i] = f.to; return false; }
      busy = true; return true;
    });
    for (let i = 0; i < 32; i++) {
      const d = state.tgt[i] - state.disp[i];
      if (Math.abs(d) > 0.004) { state.disp[i] += reducedMotion ? d : d * Math.min(1, dt * 22); busy = true; }
      else state.disp[i] = state.tgt[i];
    }
    // 指針
    const M = P2(state.n), goal = state.u + 0.5;
    let d = goal - state.pos;
    d = ((d % M) + M + M / 2) % M - M / 2;
    if (Math.abs(d) < Math.max(0.002, M * 1e-6) || reducedMotion) state.pos = goal;
    else { state.pos = (state.pos + d * Math.min(1, dt * 11) + M) % M; busy = true; }
    state.flashes = state.flashes.filter(function (f) { if (now < f.at + f.dur) { busy = true; return true; } return false; });
    if (state.arcs && now < state.arcs.t0 + state.arcs.dur + 50) busy = true;
    const wk = state.work;
    if (wk.mode !== 'idle' && wk.end && now < wk.end + 50) busy = true;
    return busy;
  }
  function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }

  function draw() {
    if (!L) return;
    const w = cw, h = ch, now = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    D.backdrop(ctx, w, h);
    const R = L.ring, n = state.n, rep = state.rep, M = P2(n);
    if (!ringCache || ringCache.key !== ringKey()) buildRing();
    ctx.drawImage(ringCache.c, R.ox, R.oy, R.S, R.S);

    // 角落的圖例
    D.haloText(ctx, T('外圈：無號', 'outside: unsigned'), R.ox + 6, R.oy + 14, C.muted, 'left', 'middle', fnt(11.5, 600));
    D.haloText(ctx, T('內圈：', 'inside: ') + repName(rep), R.ox + R.S - 6, R.oy + 14, valColor(-1, false, true), 'right', 'middle', fnt(11.5, 600));

    // 運算的弧：外弧 = 把 A、B 當成無號數（走 B 格），內弧 = 當成有號數（二補數才畫）
    const A = state.arcs;
    if (A && A.n === n) {
      const p = A.dur > 0 ? Math.max(0, Math.min(1, (now - A.t0) / A.dur)) : 1, e = ease(p);
      const th0 = TAU * (A.a + 0.5) / M;
      const drawArc = function (r, steps, color) {
        if (!steps) return;
        const th1 = th0 + TAU * steps * e / M;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = alpha(C['canvas-bg'], 0.85); ctx.lineWidth = 6;
        ctx.beginPath(); arcPath(ctx, R.cx, R.cy, r, th0, th1); ctx.stroke();
        ctx.strokeStyle = alpha(color, p < 1 ? 0.95 : 0.8); ctx.lineWidth = 3;
        ctx.beginPath(); arcPath(ctx, R.cx, R.cy, r, th0, th1); ctx.stroke();
        ctx.restore();
        // 箭頭
        const dir = steps > 0 ? 1 : -1, tip = ptAt(r, th1);
        const tx = Math.cos(th1) * dir, ty = Math.sin(th1) * dir;   // 切線方向（順時針為正）
        const nx = Math.sin(th1), ny = -Math.cos(th1);
        ctx.beginPath();
        ctx.moveTo(tip.x + tx * 7, tip.y + ty * 7);
        ctx.lineTo(tip.x - tx * 3 + nx * 5, tip.y - ty * 3 + ny * 5);
        ctx.lineTo(tip.x - tx * 3 - nx * 5, tip.y - ty * 3 - ny * 5);
        ctx.closePath();
        ctx.fillStyle = color; ctx.fill();
        const st = ptAt(r, th0);
        ctx.beginPath(); ctx.arc(st.x, st.y, 3, 0, TAU); ctx.fillStyle = color; ctx.fill();
      };
      drawArc(R.ro + 9, A.du, C['tc-c']);
      if (A.ds != null) drawArc(R.ri - 5, A.ds, C['tc-v']);
      if (p >= 1) {
        const pr = ptAt((R.ri + R.ro) / 2, TAU * (A.r + 0.5) / M);
        ctx.save(); ctx.globalAlpha = 0.9;
        D.ball(ctx, pr.x, pr.y, R.band * 0.36, C['tc-ok'], { glow: D.dark ? 0.35 : 0.15 });
        ctx.restore();
        D.haloText(ctx, '=', pr.x, pr.y + 0.5, '#ffffff', 'center', 'middle', fnt(Math.round(R.band * 0.42), 800));
      }
    }

    // 指針：從圓盤邊緣指向 A 所在的那一格
    const th = TAU * state.pos / M;
    const pa = ptAt(R.rc + 2, th), pb = ptAt((R.ri + R.ro) / 2, th);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = alpha(C.accent, 0.45); ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    ctx.restore();
    D.ball(ctx, pb.x, pb.y, R.band * 0.46, C.accent, { glow: D.dark ? 0.4 : 0.18 });
    D.haloText(ctx, 'A', pb.x, pb.y + 0.5, '#ffffff', 'center', 'middle', fnt(Math.round(R.band * 0.5), 800));

    // 圓盤中間：A 的值
    const u = state.u, v = K.value(u, n, rep), nz = K.isNegZero(u, n, rep);
    const maxW = R.rc * 1.7;
    D.haloText(ctx, T('A（' + repName(rep) + '）', 'A (' + repName(rep) + ')'), R.cx, R.cy - R.rc * 0.42, C.muted, 'center', 'middle', fnt(fitPx(T('A（' + repName(rep) + '）', 'A (' + repName(rep) + ')'), 12.5, 10, maxW * 0.9, 600), 600));
    const big = K.valText(u, n, rep);
    const bp = fitPx(big, L.narrow ? 28 : 32, 13, maxW, 700, MONO);
    D.haloText(ctx, big, R.cx, R.cy + 2, valColor(v, nz, true), 'center', 'middle', fnt(bp, 700, MONO));
    const sub = T('無號 ', 'unsigned ') + it(u);
    D.haloText(ctx, sub, R.cx, R.cy + R.rc * 0.36, C.muted, 'center', 'middle', fnt(fitPx(sub, 12, 9, maxW * 0.9, 500), 500));
    const hx = '0x' + K.hexText(u, n);
    D.haloText(ctx, hx, R.cx, R.cy + R.rc * 0.36 + 16, alpha(C.muted, 0.9), 'center', 'middle', fnt(fitPx(hx, 11.5, 9, maxW * 0.8, 500, MONO), 500, MONO));
    if (nz) D.pill(ctx, T('負零', 'negative zero'), R.cx, R.cy - R.rc * 0.42 + 26 - 40, C['tc-neg'], 'center', fnt(11, 700));

    // 接縫閃光
    state.flashes.forEach(function (f) {
      const u = (now - f.at) / f.dur;
      if (u < 0) return;
      const top = f.seam === 'C';
      const sp = ptAt((R.ri + R.ro) / 2, top ? 0 : Math.PI);
      D.ripple(ctx, sp.x, sp.y, R.band * 0.55, Math.min(1, u * 1.6), f.color);
      if (u < 0.6) D.ripple(ctx, sp.x, sp.y, R.band * 0.55, Math.min(1, u * 1.6 + 0.35), f.color);
      const a = u < 0.12 ? u / 0.12 : 1 - Math.max(0, (u - 0.6) / 0.4);
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      // 蓋在接縫的 C／V 小標上，改成實心、寫出旗標的值
      solidPill(ctx, f.text, R.cx, top ? R.cy - R.ro - 9 : R.cy + R.ro + 28, f.color);
      ctx.globalAlpha = 1;
    });

    drawLamps(now);
  }
  function solidPill(c, text, x, yb, color) {
    c.font = fnt(12.5, 800);
    const w = c.measureText(text).width + 16, h = 20;
    c.save();
    c.shadowColor = alpha(color, 0.6); c.shadowBlur = 10;
    D.roundRect(c, x - w / 2, yb - h, w, h, h / 2);
    c.fillStyle = color; c.fill();
    c.restore();
    c.fillStyle = D.dark ? '#0b1220' : '#ffffff';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, x, yb - h / 2 + 0.5);
  }
  function fitPx(text, px, minPx, maxW, weight, family) {
    ctx.font = fnt(px, weight, family);
    const w = ctx.measureText(text).width;
    if (w <= maxW) return px;
    return Math.max(minPx, Math.floor(px * maxW / w * 10) / 10);
  }
  /** 「底數＋上標＋尾巴」的文字（畫布不可用上標字元），回傳寬度；draw = false 時只量寬度 */
  function powText(c, pre, sup, post, x, y, color, px, weight, align, draw) {
    const f1 = fnt(px, weight), f2 = fnt((px * 0.72).toFixed(1), weight);
    c.font = f1; const w1 = c.measureText(pre).width, w3 = post ? c.measureText(post).width : 0;
    c.font = f2; const w2 = sup ? c.measureText(sup).width + 0.5 : 0;
    const W = w1 + w2 + w3;
    if (draw === false) return W;
    const x0 = align === 'center' ? x - W / 2 : align === 'right' ? x - W : x;
    D.haloText(c, pre, x0, y, color, 'left', 'alphabetic', f1);
    if (sup) D.haloText(c, sup, x0 + w1 + 0.5, y - px * 0.38, color, 'left', 'alphabetic', f2);
    if (post) D.haloText(c, post, x0 + w1 + w2, y, color, 'left', 'alphabetic', f1);
    return W;
  }

  // ---------- 燈排 ----------
  function weightLabel(i) {
    const n = state.n, rep = state.rep, top = i === n - 1, h = P2(n - 1);
    if (!top) return { pre: '2', sup: String(i), post: '', num: it(P2(i)) };
    if (rep === 'twos') return { pre: '−2', sup: String(n - 1), post: '', num: it(-h) };
    if (rep === 'ones') return { pre: '−2', sup: String(n - 1), post: '+1', num: it(-(h - 1)) };
    if (rep === 'sign') return { pre: '±', sup: '', post: '', num: T('符號', 'sign') };
    return { pre: '2', sup: String(n - 1), post: '', num: it(h) };
  }
  function drawLamps(now) {
    const n = state.n, rep = state.rep;
    // 標題列
    const hx = L.panelX + 2, hy = L.ay + 12;
    D.haloText(ctx, T('暫存器 A：' + n + ' 個位元', 'Register A: ' + n + ' bits'), hx, hy, C.text, 'left', 'middle', fnt(13, 700));
    const sLab = rep === 'bias' ? T('最高位', 'top bit') : T('符號位', 'sign bit');
    ctx.font = fnt(12, 600);
    const sw = ctx.measureText(sLab).width;
    const rx = L.panelX + L.panelW - 2;
    D.haloText(ctx, sLab, rx, hy, C.muted, 'right', 'middle', fnt(12, 600));
    ctx.beginPath(); ctx.arc(rx - sw - 9, hy, 5, 0, TAU); ctx.fillStyle = C['tc-sign']; ctx.fill();

    // 面板
    const px = L.panelX, py = L.panelY, pw = L.panelW, ph = L.panelH;
    ctx.save();
    ctx.shadowColor = D.shadowInk(D.dark ? 0.55 : 0.18);
    ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
    D.roundRect(ctx, px, py, pw, ph, 14);
    const pg = ctx.createLinearGradient(0, py, 0, py + ph);
    pg.addColorStop(0, shade(C['tc-panel'], D.dark ? 0.06 : 0.35));
    pg.addColorStop(1, shade(C['tc-panel'], D.dark ? -0.25 : -0.06));
    ctx.fillStyle = pg; ctx.fill();
    ctx.restore();
    D.roundRect(ctx, px + 0.5, py + 0.5, pw - 1, ph - 1, 14);
    ctx.strokeStyle = alpha(C.text, D.dark ? 0.16 : 0.12); ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px + 14, py + 1.5); ctx.lineTo(px + pw - 14, py + 1.5);
    ctx.strokeStyle = 'rgba(255,255,255,' + (D.dark ? 0.07 : 0.7) + ')'; ctx.stroke();
    for (let row = 1; row < L.rows; row++) {
      const yy = Math.round(py + 4 + row * L.rowH) + 0.5;
      ctx.beginPath(); ctx.moveTo(px + 12, yy); ctx.lineTo(px + pw - 12, yy);
      ctx.strokeStyle = alpha(C.text, 0.08); ctx.stroke();
    }
    // 符號位的底色
    const ps = lampPos(n - 1);
    D.roundRect(ctx, ps.x - L.pitch / 2 + 3, ps.y0 + 2, L.pitch - 6, L.rowH - 6, 9);
    ctx.fillStyle = alpha(C['tc-sign'], D.dark ? 0.1 : 0.07); ctx.fill();

    const sOff = sprite('off', L.r);
    for (let i = 0; i < n; i++) {
      const p = lampPos(i), a = state.disp[i], top = i === n - 1;
      const wl = weightLabel(i);
      const fpx = L.narrow ? 12 : 13;
      if (powText(ctx, wl.pre, wl.sup, wl.post, 0, 0, C.muted, fpx, 600, 'center', false) <= L.pitch - 2) powText(ctx, wl.pre, wl.sup, wl.post, p.x, p.y0 + 15, top ? C['tc-sign'] : C.muted, fpx, 600, 'center');
      else powText(ctx, wl.pre, wl.sup, wl.post, p.x, p.y0 + 15, top ? C['tc-sign'] : C.muted, 10, 600, 'center');
      ctx.font = fnt(10, 500);
      if (ctx.measureText(wl.num).width <= L.pitch - 3) {
        ctx.fillStyle = top ? alpha(C['tc-sign'], 0.95) : alpha(C.muted, 0.9);
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(wl.num, p.x, p.y0 + 28);
      }
      const sOn = sprite(top ? 'son' : 'on', L.r), sGlow = sprite(top ? 'sglow' : 'glow', L.r);
      if (a > 0.01) blit(sGlow, p.x, p.cy, a);
      blit(sOff, p.x, p.cy, 1);
      if (a > 0.01) blit(sOn, p.x, p.cy, a);
      const bitNow = state.tgt[i];
      ctx.font = fnt(15, 700, MONO);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = bitNow ? C.text : alpha(C.muted, 0.8);
      ctx.fillText(bitNow ? '1' : '0', p.x, p.dy);
      if (i === state.hover && !quizLocked()) ring(p, alpha(C.accent, 0.55), false);
      if (kbA && kbA.focused() && kbA.index() === 0 && i === state.focus) ring(p, C.accent, true);
    }
    // 位值相加
    const s = sumText();
    let line = s[0];
    ctx.font = fnt(13.5, 600, MONO);
    if (s[2] > 8 || ctx.measureText(line).width > L.aw - 8) line = s[1];
    const lp = fitPx(line, 13.5, 9.5, L.aw - 8, 600, MONO);
    const v = K.value(state.u, n, rep), nz = K.isNegZero(state.u, n, rep);
    D.haloText(ctx, line, px + pw / 2, L.sumY, valColor(v, nz, true), 'center', 'middle', fnt(lp, 600, MONO));
    if (kbA && kbA.focused() && kbA.index() === 1) {
      ctx.save(); ctx.setLineDash([4, 3]);
      D.roundRect(ctx, px - 4, py - 4, pw + 8, ph + 8, 16);
      ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    }
  }
  function ring(p, color, dashed) {
    ctx.save();
    if (dashed) ctx.setLineDash([4, 3]);
    D.roundRect(ctx, p.x - L.pitch / 2 + 3, p.cy - L.r - 7, L.pitch - 6, 2 * L.r + 14 + L.digitH, 10);
    ctx.strokeStyle = color; ctx.lineWidth = dashed ? 2 : 1.5; ctx.stroke();
    ctx.restore();
  }
  /** 位值相加的式子：[完整版, 精簡版, 項數] */
  function sumText() {
    const n = state.n, u = state.u, rep = state.rep, h = P2(n - 1), top = K.bit(u, n - 1);
    const rest = u - top * h, terms = [];
    for (let i = n - 2; i >= 0; i--) if (K.bit(u, i)) terms.push(it(P2(i)));
    const vt = K.valText(u, n, rep);
    let full, compact;
    if (rep === 'twos' || rep === 'ones') {
      const tw = rep === 'twos' ? h : h - 1;
      const head = top ? [it(-tw)] : [];
      full = head.concat(terms).join(' + ') || '0';
      compact = top ? it(-tw) + ' + ' + it(rest) : it(rest);
    } else if (rep === 'sign') {
      full = (top ? '−(' : '') + (terms.join(' + ') || '0') + (top ? ')' : '');
      compact = (top ? '−' : '') + it(rest);
    } else {
      full = compact = it(u) + ' − ' + it(h);
    }
    return [full + ' = ' + vt, compact + ' = ' + vt, terms.length + (top ? 1 : 0)];
  }

  // =====================================================================
  // 直式（cv2）
  // =====================================================================
  function workRows() {
    const wk = state.work, n = state.n, rep = state.rep, rows = [];
    const vt = function (u, nn, rp) { return '= ' + K.valText(u, nn || n, rp || rep); };
    if (wk.mode === 'arith') {
      rows.push({ kind: 'carry' });
      rows.push({ key: 'A', label: 'A', u: wk.a, color: C['tc-on'], val: vt(wk.a) });
      if (wk.op === 'add') rows.push({ key: wk.lbl === 'B' ? 'B' : 'one', label: '+ ' + wk.lbl, u: wk.b, color: C['tc-b'], val: vt(wk.b) });
      else {
        rows.push({ key: wk.lbl === 'B' ? 'B' : 'one', label: '− ' + wk.lbl, u: wk.b, color: C['tc-b'], val: vt(wk.b), muted: true });
        rows.push({ key: 'Bn', label: '+ ' + wk.lbl, bar: true, u: wk.bIn, color: C['tc-b'], val: T('（取反）', '(inverted)') });
      }
      rows.push({ kind: 'line' });
      rows.push({ key: 'R', label: '=', u: wk.r, color: C['tc-ok'], val: vt(wk.r), result: true });
      rows.push({ kind: 'flags' });
    } else if (wk.mode === 'neg') {
      if (wk.kind === 'twos') {
        rows.push({ kind: 'carry' });
        rows.push({ key: 'A', label: 'A', u: wk.u0, color: C['tc-on'], val: vt(wk.u0), muted: true });
        rows.push({ key: 'inv', label: T('取反', 'NOT'), u: wk.inv, color: C['tc-b'], val: '' });
        rows.push({ key: 'one', label: '+ 1', u: 1, color: C['tc-b'], val: '' });
        rows.push({ kind: 'line' });
        rows.push({ key: 'R', label: '−A', u: wk.r, color: C['tc-ok'], val: vt(wk.r), result: true });
      } else {
        rows.push({ key: 'A', label: 'A', u: wk.u0, color: C['tc-on'], val: vt(wk.u0), muted: true });
        rows.push({ kind: 'line' });
        rows.push({ key: 'R', label: wk.kind === 'not' ? T('取反', 'NOT') : '−A', u: wk.r, color: C['tc-ok'], val: vt(wk.r), result: true });
      }
      rows.push({ kind: 'note' });
    } else if (wk.mode === 'ext') {
      rows.push({ key: 'A', label: 'A', u: wk.u, nb: wk.n, color: C['tc-on'], val: vt(wk.u, wk.n, 'twos') });
      rows.push({ kind: 'gap' });
      rows.push({ key: 'sx', label: T('符號', 'sign'), u: wk.sx, nb: wk.m, newFrom: wk.n, copy: true, color: C['tc-on'], val: vt(wk.sx, wk.m, 'twos'), ok: wk.sv === wk.v });
      rows.push({ key: 'zx', label: T('補 0', 'zeros'), u: wk.u, nb: wk.m, newFrom: wk.n, color: C['tc-on'], val: vt(wk.u, wk.m, 'twos'), ok: wk.zv === wk.v });
      rows.push({ kind: 'note' });
    } else {
      rows.push({ key: 'A', label: 'A', u: state.u, color: C['tc-on'], val: vt(state.u) });
      rows.push({ key: 'B', label: 'B', u: state.b, color: C['tc-b'], val: vt(state.b) });
      rows.push({ kind: 'hint' });
    }
    // 位置（整塊在標題下方垂直置中）
    rows.forEach(function (r) { r.h = r.kind === 'carry' ? 18 : r.kind === 'line' ? 8 : r.kind === 'gap' ? 16 : r.kind === 'flags' || r.kind === 'note' || r.kind === 'hint' ? 40 : 27; });
    const total = rows.reduce(function (s, r) { return s + r.h; }, 0);
    let y = Math.max(28, Math.round(26 + (ch2 - 30 - total) / 2));
    rows.forEach(function (r) { r.y = y; y += r.h; });
    return rows;
  }
  function workTitle() {
    const wk = state.work, n = state.n, rep = state.rep;
    const tail = T('（' + n + ' 位元，' + repName(rep) + '）', ' (' + n + ' bits, ' + repName(rep) + ')');
    if (wk.mode === 'arith') {
      const b = wk.lbl;
      if (wk.op === 'add') return 'A + ' + b + tail;
      return T('A − ' + b + ' = A + (' + b + ' 取反) + 1', 'A − ' + b + ' = A + (NOT ' + b + ') + 1') + tail;
    }
    if (wk.mode === 'neg') {
      if (wk.kind === 'not') return T('取反：每一位 0 變 1、1 變 0', 'NOT: every 0 becomes 1 and every 1 becomes 0') + tail;
      if (wk.kind === 'ones') return T('一補數的取負：每一位取反', 'Negating in ones’ complement: invert every bit') + tail;
      if (wk.kind === 'sign') return T('原碼的取負：只翻轉符號位', 'Negating in sign–magnitude: flip the sign bit only') + tail;
      return (rep === 'bias' ? T('偏移碼的取負：一樣是取反再加 1', 'Negating offset binary: invert, then add 1') : T('取負：每一位取反，再加 1', 'Negate: invert every bit, then add 1')) + tail;
    }
    if (wk.mode === 'ext') return T('從 ' + wk.n + ' 位元延伸到 ' + wk.m + ' 位元（用二補數讀）', 'Widening from ' + wk.n + ' to ' + wk.m + ' bits (read as two’s complement)');
    return T('A 與 B', 'A and B') + tail;
  }
  function drawWork(t) {
    if (!W2) return;
    const c = ctx2, w = cw2, h = ch2, wk = state.work, G = W2, now = performance.now();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    D.backdrop(c, w, h);
    const n = state.n, rows = workRows();
    const nb = G.nb, gap = wk.gap || 0, t0 = wk.t0 || 0;
    const lx = G.x0 + G.pad;
    D.haloText(c, workTitle(), lx, 15, C.text, 'left', 'middle', fnt(G.narrow ? 12 : 13, 700));
    // 正在算的那一欄（進位動畫）
    const running = (wk.mode === 'arith' || (wk.mode === 'neg' && wk.kind === 'twos')) && gap > 0 && now < t0 + (n + 1) * gap;
    const curCol = running ? Math.floor((now - t0) / gap) : -1;
    const rowTop = rows[0].y, rowBot = rows.filter(function (r) { return !r.kind || r.kind === 'carry' || r.kind === 'line'; }).reduce(function (m, r) { return Math.max(m, r.y + r.h); }, rowTop);
    // 符號位那一欄的底色
    const signCol = wk.mode === 'ext' ? -1 : n - 1;
    if (signCol >= 0) {
      const x = colX(signCol);
      D.roundRect(c, x - G.cell / 2, rowTop - 2, G.cell, rowBot - rowTop + 2, 5);
      c.fillStyle = alpha(C['tc-sign'], D.dark ? 0.12 : 0.08); c.fill();
    }
    if (curCol >= 0 && curCol <= n) {
      const x = colX(curCol);
      D.roundRect(c, x - G.cell / 2, rowTop - 2, G.cell, rowBot - rowTop + 2, 5);
      c.fillStyle = alpha(C['tc-c'], 0.14); c.fill();
    }
    const cell = G.cell, dpx = Math.max(10, Math.min(15, cell * 0.9));
    rows.forEach(function (r) {
      const yc = r.y + r.h / 2;
      if (r.kind === 'carry') {
        D.haloText(c, T('進位', 'carry'), lx, yc, alpha(C['tc-c'], 0.9), 'left', 'middle', fnt(11, 600));
        const cs = wk.carries;
        for (let i = 0; i <= n; i++) {
          const at = t0 + i * gap;
          if (gap > 0 && now < at) continue;
          const x = colX(i), on = cs[i];
          if (i === n) {
            D.roundRect(c, x - cell / 2 + 1, r.y, cell - 2, r.h - 1, 4);
            c.fillStyle = alpha(C['tc-c'], on ? 0.22 : 0.08); c.fill();
            c.strokeStyle = alpha(C['tc-c'], 0.7); c.lineWidth = 1; c.stroke();
          }
          D.haloText(c, String(on), x, yc + 0.5, on ? C['tc-c'] : alpha(C.muted, 0.55), 'center', 'middle', fnt(11, on ? 800 : 500, MONO));
        }
        if (wk.mode === 'arith' && (gap === 0 || now >= t0 + n * gap)) {
          // V 比較流進、流出最高位的兩個進位
          const xa = colX(n) + cell / 2, xb = colX(n - 1) - cell / 2;
          c.save(); c.setLineDash([3, 2]);
          D.roundRect(c, xb - 1, r.y - 2, xa - xb + 2, r.h + 3, 5);
          c.strokeStyle = alpha(C['tc-v'], 0.75); c.lineWidth = 1.3; c.stroke();
          c.restore();
        }
        if (wk.cin && wk.mode === 'arith') {
          const x0 = colX(0);
          D.haloText(c, '+1', x0 + cell / 2 + 3, yc, C['tc-c'], 'left', 'middle', fnt(10.5, 700));
        }
        return;
      }
      if (r.kind === 'line') {
        c.beginPath();
        c.moveTo(colX(nb - 1 + (wk.mode === 'ext' ? 0 : 1)) - cell / 2, Math.round(yc) + 0.5);
        c.lineTo(colX(0) + cell / 2, Math.round(yc) + 0.5);
        c.strokeStyle = alpha(C.text, 0.45); c.lineWidth = 1.2; c.stroke();
        return;
      }
      if (r.kind === 'gap') {
        // 符號延伸：從 A 的符號位畫一條彎箭頭到新的高位
        const x1 = colX(wk.n - 1), x2 = colX(Math.min(wk.m - 1, wk.n + Math.max(0, Math.floor((wk.m - wk.n) / 2))));
        const y1 = r.y - 2, y2 = r.y + r.h + 2;
        c.save();
        c.strokeStyle = alpha(C['tc-sign'], 0.8); c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(x1, y1); c.bezierCurveTo(x1, y1 + 10, x2, y2 - 12, x2, y2 - 1); c.stroke();
        c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - 3.5, y2 - 6); c.lineTo(x2 + 3.5, y2 - 6); c.closePath();
        c.fillStyle = alpha(C['tc-sign'], 0.85); c.fill();
        c.restore();
        D.haloText(c, T('複製符號位', 'copy the sign bit'), x1 + 10, yc, C['tc-sign'], 'left', 'middle', fnt(11, 600));
        return;
      }
      if (r.kind === 'flags') { drawFlags(c, r, lx, now >= t0 + (n + 1) * gap || gap === 0); return; }
      if (r.kind === 'note' || r.kind === 'hint') { drawNote(c, r, lx); return; }
      // 一列位元
      const nbits = r.nb || n;
      const lab = r.label;
      const lcol = r.muted ? alpha(C.muted, 0.9) : C.text;
      c.font = fnt(13, 700);
      if (r.bar) {
        // 「+ B 取反」：B 上面加一條橫線
        D.haloText(c, lab, lx, yc, lcol, 'left', 'middle', fnt(13, 700));
        const wB = c.measureText(lab.slice(-1)).width, wAll = c.measureText(lab).width;
        c.beginPath(); c.moveTo(lx + wAll - wB, yc - 9); c.lineTo(lx + wAll, yc - 9);
        c.strokeStyle = lcol; c.lineWidth = 1.4; c.stroke();
      } else D.haloText(c, lab, lx, yc, lcol, 'left', 'middle', fnt(13, 700));
      for (let i = 0; i < nbits; i++) {
        const x = colX(i);
        let at = 0;
        if (r.result && gap > 0) at = t0 + i * gap + gap * 0.5;
        if (r.newFrom != null && i >= r.newFrom && gap > 0) at = t0 + (i - r.newFrom + 1) * gap;
        const shown = !(at && now < at);
        const bit = K.bit(r.u, i);
        const isNew = r.newFrom != null && i >= r.newFrom;
        const bx = x - cell / 2 + 1.5, by = r.y + 3, bw = cell - 3, bh = r.h - 6;
        D.roundRect(c, bx, by, bw, bh, Math.min(5, bw * 0.3));
        if (!shown) { c.strokeStyle = alpha(C.muted, 0.25); c.lineWidth = 1; c.stroke(); continue; }
        const base = isNew && r.copy ? C['tc-sign'] : r.color;
        if (bit) {
          const gr = c.createLinearGradient(0, by, 0, by + bh);
          gr.addColorStop(0, alpha(shade(base, 0.25), r.muted ? 0.18 : 0.34));
          gr.addColorStop(1, alpha(base, r.muted ? 0.14 : 0.26));
          c.fillStyle = gr; c.fill();
          c.strokeStyle = alpha(base, r.muted ? 0.35 : 0.6); c.lineWidth = 1; c.stroke();
        } else {
          c.fillStyle = alpha(C['canvas-bg'], 0.6); c.fill();
          c.strokeStyle = alpha(isNew ? base : C.muted, isNew ? 0.5 : 0.3); c.lineWidth = 1; c.stroke();
        }
        c.font = fnt(dpx, 700, MONO);
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = bit ? (r.muted ? alpha(C.text, 0.55) : C.text) : alpha(C.muted, r.muted ? 0.5 : 0.75);
        c.fillText(bit ? '1' : '0', x, yc + 0.5);
        if (r.key === 'B' && wk.mode !== 'neg') {
          if (i === state.hoverB && !quizLocked()) { D.roundRect(c, bx - 1.5, by - 1.5, bw + 3, bh + 3, 6); c.strokeStyle = alpha(C.accent, 0.6); c.lineWidth = 1.4; c.stroke(); }
          if (kbB && kbB.focused() && i === state.bFocus) { c.save(); c.setLineDash([3, 2]); D.roundRect(c, bx - 2, by - 2, bw + 4, bh + 4, 6); c.strokeStyle = C.accent; c.lineWidth = 2; c.stroke(); c.restore(); }
        }
      }
      // 右邊的值
      const vx = G.bitsRight + 12;
      if (r.val && (!r.result || gap === 0 || now >= t0 + (nbits + 0.5) * gap)) {
        let vcol = r.muted ? C.muted : C.text;
        let mark = '';
        if (r.result && wk.mode === 'arith') { mark = wk.q.ok ? ' ✓' : ' ✗'; vcol = wk.q.ok ? C['tc-ok'] : C['tc-v']; }
        if (r.ok != null) { mark = r.ok ? ' ✓' : ' ✗'; vcol = r.ok ? C['tc-ok'] : C['tc-v']; }
        D.haloText(c, r.val + mark, vx, yc, vcol, 'left', 'middle', fnt(12.5, 700, MONO));
      }
    });
  }
  function drawFlags(c, r, lx, shown) {
    const wk = state.work, yc = r.y + r.h / 2 + 2;
    const items = [['C', wk.C, C['tc-c']], ['V', wk.V, C['tc-v']], ['N', wk.N, C['tc-sign']], ['Z', wk.Z, C['tc-ok']]];
    let x = lx + 8;
    items.forEach(function (f) {
      const on = shown && f[1] === 1;
      D.haloText(c, f[0], x, yc, C.text, 'left', 'middle', fnt(13, 800));
      const lxp = x + 20;
      if (on) {
        const g = c.createRadialGradient(lxp, yc, 2, lxp, yc, 16);
        g.addColorStop(0, alpha(f[2], D.dark ? 0.55 : 0.4)); g.addColorStop(1, alpha(f[2], 0));
        c.fillStyle = g; c.beginPath(); c.arc(lxp, yc, 16, 0, TAU); c.fill();
      }
      D.ball(c, lxp, yc, 7.5, on ? f[2] : C['tc-off'], { glow: 0 });
      D.haloText(c, shown ? String(f[1]) : '·', lxp + 13, yc, on ? shade(f[2], D.dark ? 0.1 : -0.15) : C.muted, 'left', 'middle', fnt(13, 700, MONO));
      x += 62;
    });
    // V = c(n) ⊕ c(n−1)
    if (shown && x + 150 < cw2) {
      const n = state.n, cs = wk.carries;
      let xx = x + 6;
      const col = alpha(C['tc-v'], 0.95);
      xx += subText(c, 'V = c', String(n), xx, yc, col);
      xx += subText(c, ' ⊕ c', String(n - 1), xx, yc, col);
      D.haloText(c, ' = ' + cs[n] + ' ⊕ ' + cs[n - 1], xx, yc, col, 'left', 'middle', fnt(12.5, 600));
    }
  }
  /** 主字＋下標（畫布不可用下標字元） */
  function subText(c, base, sub, x, y, color) {
    const f1 = fnt(12.5, 600), f2 = fnt(9, 600);
    c.font = f1; const w1 = c.measureText(base).width;
    c.font = f2; const w2 = c.measureText(sub).width;
    D.haloText(c, base, x, y, color, 'left', 'middle', f1);
    D.haloText(c, sub, x + w1 + 0.5, y + 4, color, 'left', 'middle', f2);
    return w1 + w2 + 1;
  }
  function drawNote(c, r, lx) {
    const wk = state.work, n = state.n, rep = state.rep, yc = r.y + r.h / 2;
    let text = '', color = C.muted;
    if (r.kind === 'hint') {
      text = state.quiz ? T('先預測 C 和 V，再按「確定」。', 'Predict C and V first, then press “Check”.') : T('按「A + B」或「A − B」，這裡會一位一位算給你看。點 B 這一列可以切換位元。', 'Press “A + B” or “A − B” to see it worked out bit by bit. Tap the B row to switch its bits.');
    } else if (wk.mode === 'neg') {
      const v = K.valText(wk.u0, n, rep), w = K.valText(wk.r, n, rep);
      if (wk.kind === 'not') { text = T('取反：' + v + ' → ' + w, 'NOT: ' + v + ' → ' + w); color = C.text; }
      else if (wk.same && wk.u0 !== 0) { text = T(v + ' 取負還是 ' + w + '：+' + it(P2(n - 1)) + ' 放不下 ' + n + ' 個位元', v + ' negated is still ' + w + ': +' + it(P2(n - 1)) + ' does not fit in ' + n + ' bits'); color = C['tc-v']; }
      else if (wk.overflow) { text = T(v + ' 取負放不下，繞回 ' + w, 'the negative of ' + v + ' does not fit; it wraps to ' + w); color = C['tc-v']; }
      else { text = T('取負：' + v + ' → ' + w, 'Negate: ' + v + ' → ' + w); color = C['tc-ok']; }
    } else if (wk.mode === 'ext') {
      text = T('符號延伸保持 ' + it(wk.v) + '；補 0 變成 ' + it(wk.zv), 'Sign extension keeps ' + it(wk.v) + '; filling with 0 gives ' + it(wk.zv));
      color = C.text;
    }
    const px = fitPx(text, 12.5, 9.5, cw2 - lx - 8, 600);
    D.haloText(c, text, lx, yc, color, 'left', 'middle', fnt(px, 600));
  }

  // =====================================================================
  // 音效
  // =====================================================================
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function sndToggle(on) { const S = sound(); if (S) S.tone({ freq: on ? 880 : 560, dur: 0.04, type: 'triangle', gain: 0.14 }); }
  /** A 的值越大音越高（330–930 Hz） */
  function sndValue() {
    const S = sound(); if (!S) return;
    const rg = K.range(state.n, state.rep), v = K.value(state.u, state.n, state.rep);
    S.tone({ freq: 330 * Math.pow(2, 1.5 * (v - rg.min) / Math.max(1, rg.max - rg.min)), dur: 0.07, type: 'triangle', gain: 0.14 });
  }
  function sndSeam(which, delay) {
    const S = sound(); if (!S) return;
    if (which === 'C') S.sweep({ from: 660, to: 1320, dur: 0.16, type: 'sine', gain: 0.16, delay: delay || 0 });
    else S.sweep({ from: 880, to: 300, dur: 0.32, type: 'sawtooth', gain: 0.09, delay: delay || 0 });
  }
  function sndCarries(cs, n, gap) {
    const S = sound(); if (!S) return;
    let k = 0;
    for (let i = 0; i < n; i++) {
      if (!cs[i + 1]) continue;
      if (n > 16 && i % 2) continue;
      S.tone({ freq: 1400 * Math.pow(0.95, i), dur: 0.05, type: 'sine', gain: 0.11, delay: (i * gap) / 1000 });
      if (++k > 20) break;
    }
  }
  function sndInvert() { const S = sound(); if (S) S.sweep({ from: 480, to: 820, dur: 0.12, type: 'triangle', gain: 0.12 }); }
  function sndChime(ok) {
    const S = sound(); if (!S) return;
    if (ok) { S.tone({ freq: 659.25, dur: 0.14, type: 'sine', gain: 0.25 }); S.tone({ freq: 987.77, dur: 0.22, type: 'sine', gain: 0.22, delay: 0.1 }); }
    else S.tone({ freq: 311.13, dur: 0.22, type: 'triangle', gain: 0.22 });
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // =====================================================================
  // 暫存器 A 改變（所有操作都經過這裡；欄位和證明腳本的 Sim.setA 一致）
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  let sayTimer = 0;
  function say(msg) { clearTimeout(sayTimer); sayTimer = setTimeout(function () { $('status').textContent = msg || ''; }, 20); }

  function setA(nu, src, opt) {
    opt = opt || {};
    const n = state.n, prev = state.u;
    const prevN = opt.prevN != null ? opt.prevN : n;
    const pv = opt.pv != null ? opt.pv : K.value(prev, n, state.rep);
    const prevSrc = state.vSrc;
    state.u = nu;
    if (src === 'bits') { if (!opt.kept) state.vSrc = 'bits'; }
    else if (src !== 'rep') state.vSrc = src;
    // 燈號（+1、−1、取負時由低位往高位一盞一盞翻）
    const now = performance.now();
    state.flips.forEach(function (f) { state.tgt[f.i] = f.to; });
    state.flips = [];
    if (opt.ripple && !reducedMotion && opt.gap > 0) {
      K.changedBits(prev, nu, n).forEach(function (i) { state.flips.push({ i: i, to: K.bit(nu, i), at: now + i * opt.gap + opt.gap * 0.5 }); });
    } else for (let i = 0; i < n; i++) state.tgt[i] = K.bit(nu, i);
    for (let i = n; i < 32; i++) { state.tgt[i] = 0; state.disp[i] = 0; }
    if (opt.jump) state.pos = nu + 0.5;
    state.work = { mode: 'idle', t0: 0 };
    state.arcs = null;
    if (src !== 'quiz') { state.info = null; renderInfo(); }
    resize2();
    updateReadouts();
    requestDraw();
    if (!opt.silent) {
      emit('value', {
        src: src, n: n, rep: state.rep, u: nu, prev: prev, prevN: prevN, v: K.value(nu, n, state.rep), pv: pv,
        negZero: K.isNegZero(nu, n, state.rep), C: opt.C == null ? null : opt.C, V: opt.V == null ? null : opt.V,
        kept: opt.kept == null ? null : opt.kept, vSrc: state.vSrc, prevSrc: prevSrc
      });
    }
  }
  function rippleGap() { return reducedMotion ? 0 : Math.min(55, 650 / state.n); }
  function startWork(wk) {
    wk.t0 = performance.now(); wk.gap = rippleGap();
    wk.end = wk.t0 + ((wk.mode === 'ext' ? wk.m - wk.n : state.n) + 3) * wk.gap;
    state.work = wk;
    resize2();
  }
  function flash(seam, text, color) { state.flashes.push({ seam: seam, text: text, color: color, at: performance.now(), dur: 1700 }); requestDraw(); }
  function later(ms, fn) { state.pend.push({ at: performance.now() + ms, fn: fn }); requestDraw(); }

  // ---------- 操作 ----------
  function opsAllowed() { return !state.quiz; }
  function quizLocked() { return !!state.quiz; }
  function doIncDec(up) {
    const n = state.n, a = state.u;
    const x = up ? K.add(a, 1, n) : K.sub(a, 1, n);
    const gap = rippleGap();
    setA(x.r, up ? 'inc' : 'dec', { C: x.C, V: x.V, ripple: true, gap: gap });
    startWork({ mode: 'arith', op: up ? 'add' : 'sub', a: a, b: 1, bIn: x.bIn, cin: x.cin, r: x.r, carries: x.carries, C: x.C, V: x.V, N: x.N, Z: x.Z, lbl: '1', q: K.viaAdder(a, 1, n, state.rep, up ? 'add' : 'sub') });
    sndCarries(x.carries, n, gap);
    later(Math.max(120, gap * 3), sndValue);
    const crossC = up ? x.C === 1 : x.C === 0;
    if (crossC) later(160, function () { flash('C', up ? 'C = 1' : 'C = 0', C['tc-c']); sndSeam('C'); });
    if (x.V) later(160, function () { flash('V', 'V = 1', C['tc-v']); sndSeam('V'); });
    const vt = K.valText(x.r, n, state.rep);
    if (x.V && state.rep === 'twos') say(T((up ? '+1' : '−1') + '：跨過底端的接縫，有號的值從 ' + K.valText(a, n, 'twos') + ' 跳到 ' + vt + '（V = 1，溢位）。', (up ? '+1' : '−1') + ': across the bottom seam the signed value jumps from ' + K.valText(a, n, 'twos') + ' to ' + vt + ' (V = 1, overflow).'));
    else if (crossC) say(T((up ? '+1' : '−1') + '：跨過頂端的接縫，' + (up ? '最高位送出進位（C = 1）' : '要借位（C = 0）') + '，A = ' + vt + '。', (up ? '+1' : '−1') + ': across the top seam, ' + (up ? 'a carry leaves the top bit (C = 1)' : 'a borrow is needed (C = 0)') + '; A = ' + vt + '.'));
    else say(T((up ? '+1' : '−1') + '：A = ' + vt + '。', (up ? '+1' : '−1') + ': A = ' + vt + '.'));
  }
  function doNot() {
    const n = state.n, a = state.u, r = K.not(a, n);
    setA(r, 'not');
    startWork({ mode: 'neg', kind: 'not', u0: a, r: r, same: false, overflow: false });
    sndInvert(); sndValue();
    say(T('取反：每一位 0 變 1、1 變 0，A = ' + K.valText(r, n, state.rep) + '。', 'NOT: every bit flipped; A = ' + K.valText(r, n, state.rep) + '.'));
  }
  function doNeg() {
    const n = state.n, rep = state.rep, u0 = state.u, src = state.vSrc;
    const g = K.negate(u0, n, rep);
    const twosLike = rep === 'twos' || rep === 'bias';
    const gap = rippleGap();
    setA(g.u, 'neg', { ripple: twosLike, gap: gap });
    const inv = K.not(u0, n), add = K.adder(inv, 0, n, 1);
    startWork({ mode: 'neg', kind: twosLike ? 'twos' : rep, u0: u0, inv: inv, r: g.u, carries: add.carries, cin: twosLike ? 1 : 0, same: g.same, overflow: g.overflow });
    emit('negate', { n: n, rep: rep, u: u0, r: g.u, v: K.value(u0, n, rep), w: K.value(g.u, n, rep), same: g.same, overflow: g.overflow, src: src });
    sndInvert();
    if (twosLike) sndCarries(add.carries, n, gap);
    later(Math.max(140, gap * 3), sndValue);
    if (g.same && u0 !== 0 && rep === 'twos') { later(200, function () { flash('V', 'V = 1', C['tc-v']); sndSeam('V'); }); }
    const v = K.valText(u0, n, rep), w = K.valText(g.u, n, rep);
    if (g.same && u0 !== 0) say(T('取負：' + v + ' 取反再加一，還是 ' + w + '——+' + it(P2(n - 1)) + ' 放不下。', 'Negate: invert ' + v + ' and add one, and you get ' + w + ' again — +' + it(P2(n - 1)) + ' does not fit.'));
    else if (g.overflow) say(T('取負：' + v + ' 的相反數放不下，繞回 ' + w + '。', 'Negate: the opposite of ' + v + ' does not fit and wraps to ' + w + '.'));
    else if (rep === 'twos' || rep === 'bias') say(T('取負：' + v + ' → 取反 → 加一 → ' + w + '。', 'Negate: ' + v + ' → invert → add one → ' + w + '.'));
    else if (rep === 'ones') say(T('一補數取負只要取反：' + v + ' → ' + w + '。', 'In ones’ complement, negating is just inverting: ' + v + ' → ' + w + '.'));
    else say(T('原碼取負只要翻轉符號位：' + v + ' → ' + w + '。', 'In sign–magnitude, negating flips the sign bit only: ' + v + ' → ' + w + '.'));
  }
  function doClear() { setA(0, 'clear'); say(T('A 歸零。', 'A reset to 0.')); }
  function toggleBit(i) {
    if (quizLocked() || i < 0 || i >= state.n) return;
    const nv = K.toggle(state.u, i, state.n);
    setA(nv, 'toggle');
    const on = K.bit(nv, i);
    sndToggle(on);
    say(T('第 ' + i + ' 位' + (on ? '亮' : '暗') + '，A = ' + K.valText(nv, state.n, state.rep) + '。', 'Bit ' + i + ' is ' + (on ? 'on' : 'off') + '; A = ' + K.valText(nv, state.n, state.rep) + '.'));
  }
  function setRep(rep) {
    if (rep === state.rep || state.quiz || REPS.indexOf(rep) < 0) return;
    const pv = K.value(state.u, state.n, state.rep);
    state.rep = rep; ringCache = null;
    setA(state.u, 'rep', { pv: pv });
    const rg = K.range(state.n, rep);
    say(T('換成' + repName(rep) + '：同一排燈讀成 ' + K.valText(state.u, state.n, rep) + '；範圍 ' + it(rg.min) + ' … ' + it(rg.max) + '。', 'Switched to ' + repName(rep) + ': the same lamps now read ' + K.valText(state.u, state.n, rep) + '; range ' + it(rg.min) + ' … ' + it(rg.max) + '.'));
  }

  // ---------- 加法與減法 ----------
  function startArcs(a, b, op) {
    const n = state.n, M = P2(n), rep = state.rep;
    const du = op === 'add' ? b : -b;
    const y = K.value(b, n, 'twos');
    const ds = rep === 'twos' ? (op === 'add' ? y : -y) : null;
    const dur = reducedMotion ? 0 : 800;
    const r = K.arith(a, b, n, op).r;
    state.arcs = { a: a, n: n, du: du, ds: ds, r: r, t0: performance.now(), dur: dur };
    const s = a + 0.5;
    const fc = crossFrac(s, du, 0, M);
    if (fc != null) later(fc * dur, function () { flash('C', op === 'add' ? 'C = 1' : 'C = 0', C['tc-c']); sndSeam('C'); });
    if (ds != null) {
      const fv = crossFrac(s, ds, M / 2, M);
      if (fv != null) later(fv * dur, function () { flash('V', 'V = 1', C['tc-v']); sndSeam('V'); });
    }
    requestDraw();
  }
  /** 從 s 走 d 格（可正可負），第一次跨過 bnd（mod M）時走了全程的幾分之幾；沒跨過回傳 null */
  function crossFrac(s, d, bnd, M) {
    if (d > 0) { let b2 = bnd + Math.ceil((s - bnd) / M) * M; if (b2 <= s) b2 += M; const f = (b2 - s) / d; return f <= 1 ? f : null; }
    if (d < 0) { let b2 = bnd + Math.floor((s - bnd) / M) * M; if (b2 >= s) b2 -= M; const f = (s - b2) / -d; return f <= 1 ? f : null; }
    return null;
  }
  function doArith(op, silent) {
    const n = state.n, rep = state.rep, a = state.u, b = state.b;
    const q = K.viaAdder(a, b, n, rep, op), x = q.res;
    startWork({ mode: 'arith', op: op, a: a, b: b, bIn: x.bIn, cin: x.cin, r: x.r, carries: x.carries, C: x.C, V: x.V, N: x.N, Z: x.Z, lbl: 'B', q: q });
    startArcs(a, b, op);
    sndCarries(x.carries, n, state.work.gap);
    if (silent) return x;
    state.last = { r: x.r, n: n };
    state.log.unshift({ op: op, n: n, rep: rep, x: q.x, y: q.y, xz: K.isNegZero(a, n, rep), yz: K.isNegZero(b, n, rep), r: x.r, C: x.C, V: x.V, ok: q.ok, fits: q.fits });
    if (state.log.length > LOG_MAX) state.log.length = LOG_MAX;
    renderLog();
    state.info = { op: op, n: n, rep: rep, a: a, b: b, q: q };
    renderInfo();
    updateButtons();
    emit('arith', {
      op: op, n: n, rep: rep, a: a, b: b, r: x.r, C: x.C, V: x.V, N: x.N, Z: x.Z,
      x: q.x, y: q.y, truth: q.truth, fits: q.fits, raw: q.raw, ok: q.ok, aSrc: state.vSrc, bSrc: state.bSrc
    });
    say(T('A ' + (op === 'add' ? '+' : '−') + ' B：加法器給 ' + K.valText(x.r, n, rep) + '，C = ' + x.C + '、V = ' + x.V + '。', 'A ' + (op === 'add' ? '+' : '−') + ' B: the adder gives ' + K.valText(x.r, n, rep) + ', C = ' + x.C + ', V = ' + x.V + '.'));
    return x;
  }
  function doResult() {
    if (!state.last || state.last.n !== state.n || state.quiz) return;
    setA(state.last.r, 'result');
    sndValue();
    say(T('結果放回 A：A = ' + K.valText(state.u, state.n, state.rep) + '。', 'Result put into A: A = ' + K.valText(state.u, state.n, state.rep) + '.'));
  }
  function doExtend() {
    const n = state.n, m = state.m, u = state.u;
    if (m <= n || state.quiz) return;
    const sx = K.signExtend(u, n, m);
    const v = K.value(u, n, 'twos'), sv = K.value(sx, m, 'twos'), zv = K.value(u, m, 'twos');
    startWork({ mode: 'ext', n: n, m: m, u: u, sx: sx, v: v, sv: sv, zv: zv });
    emit('extend', { n: n, m: m, rep: state.rep, u: u, v: v, sx: sx, sv: sv, zx: u, zv: zv, src: state.vSrc });
    const S = sound();
    if (S) { const k = Math.min(8, m - n); for (let j = 0; j < k; j++) S.tone({ freq: 520 * Math.pow(1.09, j), dur: 0.05, type: 'triangle', gain: 0.12, delay: j * state.work.gap / 1000 * Math.max(1, (m - n) / k) }); }
    const neg = K.bit(u, n - 1) === 1;
    setMsg('extMsg', neg
      ? T('符號位是 1：新的 ' + (m - n) + ' 個高位全部補 1，值仍是 ' + it(sv) + '；如果補 0 會變成 ' + it(zv) + '。', 'The sign bit is 1: all ' + (m - n) + ' new high bits become 1 and the value stays ' + it(sv) + '; filling them with 0 would give ' + it(zv) + '.')
      : T('符號位是 0：新的高位補 0，兩種延伸都是 ' + it(sv) + '。', 'The sign bit is 0: the new high bits are 0, and both ways give ' + it(sv) + '.'), '');
    say(T('延伸到 ' + m + ' 位元。', 'Widened to ' + m + ' bits.'));
  }

  // =====================================================================
  // 讀數與文字
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, html) { if (lastHTML[id] !== html) { lastHTML[id] = html; $(id).innerHTML = html; } }
  function setMsg(id, text, cls) { const el = $(id); el.textContent = text; el.className = 'msg' + (cls ? ' ' + cls : ''); }
  const elDec = $('inDec'), elHex = $('inHex'), elBin = $('inBin'), elB = $('inB');
  function rangeHTML(n, rep) {
    const rg = K.range(n, rep);
    if (n <= 16) return it(rg.min) + ' … ' + it(rg.max);
    const e = n - 1;
    if (rep === 'unsigned') return '0 … 2<sup>' + n + '</sup> − 1';
    if (rep === 'ones' || rep === 'sign') return '±(2<sup>' + e + '</sup> − 1)';
    return '−2<sup>' + e + '</sup> … 2<sup>' + e + '</sup> − 1';
  }
  function updateReadouts() {
    const n = state.n, rep = state.rep, u = state.u, h = P2(n - 1), M = P2(n);
    const rg = K.range(n, rep);
    setHTML('rRange', it(rg.min) + ' … ' + it(rg.max));
    let z;
    const pz = function (x) { return '<span class="mono">' + patText(x, n) + '</span>'; };
    if (rep === 'ones') z = '+0 = ' + pz(0) + '<br>−0 = ' + pz(M - 1);
    else if (rep === 'sign') z = '+0 = ' + pz(0) + '<br>−0 = ' + pz(h);
    else z = T('只有一種：', 'just one: ') + pz(rep === 'bias' ? h : 0);
    setHTML('rZero', z);
    setHTML('rCount', T(it(M) + ' 個圖樣、' + it(rg.values) + ' 個數', it(M) + ' patterns, ' + it(rg.values) + ' numbers'));
    if (document.activeElement !== elDec) { elDec.value = K.valText(u, n, rep); elDec.classList.remove('bad'); }
    if (document.activeElement !== elHex) { elHex.value = K.hexText(u, n); elHex.classList.remove('bad'); }
    if (document.activeElement !== elBin) { elBin.value = K.binText(u, n, true); elBin.classList.remove('bad'); }
    if (document.activeElement !== elB) { elB.value = K.valText(state.b, n, rep); elB.classList.remove('bad'); }
    // 五種讀法
    let html = '<tr><th>' + T('讀法', 'Reading') + '</th><th>' + T('A 的值', 'A') + '</th><th>' + T('範圍', 'Range') + '</th></tr>';
    ['unsigned'].concat(REPS).forEach(function (r) {
      const vtxt = r === 'unsigned' ? it(u) : K.valText(u, n, r);
      html += '<tr' + (r === rep ? ' class="cur"' : '') + '><td>' + repName(r) + '</td><td>' + vtxt + '</td><td>' + rangeHTML(n, r) + '</td></tr>';
    });
    setHTML('readTab', html);
    REPS.forEach(function (r) { $(REP_BTN[r]).setAttribute('aria-pressed', String(r === rep)); });
    $('nbo').textContent = String(n);
    $('mbo').textContent = String(state.m);
    updateButtons();
  }
  function updateButtons() {
    const q = !!state.quiz;
    $('resBtn').disabled = q || !state.last || state.last.n !== state.n;
    $('extBtn').disabled = q || state.m <= state.n;
    ['incBtn', 'decBtn', 'notBtn', 'negBtn', 'clearBtn', 'addBtn', 'subBtn'].forEach(function (id) { $(id).disabled = q; });
    REPS.forEach(function (r) { $(REP_BTN[r]).disabled = q; });
    [elDec, elHex, elBin, elB].forEach(function (el) { el.disabled = q; });
    elN.disabled = q; elM.disabled = q;
    if (!q && state.m <= state.n && !$('extMsg').textContent) setMsg('extMsg', T('m 要比 n 大才能延伸。', 'm must be larger than n to widen.'), '');
  }
  /** 旗標說明與「用目前的表示法讀」的比較 */
  function renderInfo() {
    const f = $('flagMsg'), cm = $('cmpMsg');
    const I = state.info;
    if (!I) {
      f.innerHTML = T('<p>按「A + B」或「A − B」，這裡會說明 C 和 V 為什麼亮或不亮。</p>', '<p>Press “A + B” or “A − B” to see why C and V are on or off.</p>');
      cm.innerHTML = '';
      return;
    }
    const n = I.n, rep = I.rep, q = I.q, x = q.res, M = P2(n), add = I.op === 'add';
    const au = I.a, bu = I.b;
    let cLine;
    if (add) cLine = x.C ? T('最高位送出了進位。當成無號數：' + it(au) + ' + ' + it(bu) + ' = ' + it(au + bu) + ' ≥ ' + it(M) + '，繞了一圈。', 'a carry left the top bit. As unsigned numbers ' + it(au) + ' + ' + it(bu) + ' = ' + it(au + bu) + ' ≥ ' + it(M) + ', so the sum wrapped round.')
      : T('沒有進位。當成無號數：' + it(au) + ' + ' + it(bu) + ' = ' + it(au + bu) + ' < ' + it(M) + '。', 'no carry. As unsigned numbers ' + it(au) + ' + ' + it(bu) + ' = ' + it(au + bu) + ' < ' + it(M) + '.');
    else cLine = x.C ? T('沒有借位：當成無號數 ' + it(au) + ' ≥ ' + it(bu) + '。', 'no borrow: as unsigned numbers ' + it(au) + ' ≥ ' + it(bu) + '.')
      : T('要借位：當成無號數 ' + it(au) + ' < ' + it(bu) + '（減法時 C = 0 代表借位）。', 'a borrow: as unsigned numbers ' + it(au) + ' < ' + it(bu) + ' (in a subtraction C = 0 means a borrow).');
    const xs = K.value(au, n, 'twos'), ys = K.value(bu, n, 'twos'), ts = add ? xs + ys : xs - ys;
    const lo = it(-P2(n - 1)), hi = it(P2(n - 1) - 1);
    const expr = it(xs) + (add ? ' + ' : ' − ') + signedPar(ys) + ' = ' + it(ts);
    let vLine = x.V ? T('有號的答案 ' + expr + ' 超出 ' + lo + ' … ' + hi + '（' + (add ? '同號相加，結果卻變號' : '異號相減，結果和 A 異號') + '）。', 'the signed answer ' + expr + ' is outside ' + lo + ' … ' + hi + ' (' + (add ? 'two numbers with the same sign gave the other sign' : 'A and B have different signs and the result’s sign differs from A’s') + ').')
      : T('有號的答案 ' + expr + ' 在 ' + lo + ' … ' + hi + ' 之內。', 'the signed answer ' + expr + ' is inside ' + lo + ' … ' + hi + '.');
    if (rep !== 'twos') vLine += T('（V 用二補數的讀法判斷）', ' (V always uses the two’s complement reading)');
    const colon = T('：', ': ');
    f.innerHTML = '<p><b class="c">C = ' + x.C + '</b>' + colon + cLine + '</p><p><b class="v">V = ' + x.V + '</b>' + colon + vLine + '</p>';
    // 比較
    const rawT = K.valText(x.r, n, rep), truth = it(q.truth);
    const yes = '<span class="ok">✓</span>', no = '<span class="bad">✗</span>';
    let s;
    if (!q.fits) {
      const rg = K.range(n, rep);
      s = T('用' + repName(rep) + '讀：正確答案 ' + truth + ' 超出 ' + it(rg.min) + ' … ' + it(rg.max) + '，放不下；加法器給 ' + rawT + '。', 'Read as ' + repName(rep) + ': the true answer ' + truth + ' is outside ' + it(rg.min) + ' … ' + it(rg.max) + ' and cannot fit; the adder gives ' + rawT + '.');
    } else if (rep === 'twos') s = T('用二補數讀：加法器直接給 ' + rawT + ' ' + yes + '，不必任何修正——這就是電腦選二補數的原因。', 'Read as two’s complement: the adder gives ' + rawT + ' ' + yes + ' with no correction at all — which is why computers chose two’s complement.');
    else if (q.ok) s = T('用' + repName(rep) + '讀：加法器給 ' + rawT + ' ' + yes + '（這一題剛好不用修正）。', 'Read as ' + repName(rep) + ': the adder gives ' + rawT + ' ' + yes + ' (this time no correction is needed).');
    else {
      const fixedT = q.fixed == null ? '' : K.valText(q.fixed, n, rep);
      if (rep === 'ones') s = T('用一補數讀：加法器給 ' + rawT + ' ' + no + '，正確是 ' + truth + '。' + (add ? '' : '減法寫成 A 加上 B 取反，') + '把最高位送出的進位加回最低位（迴繞進位）→ ' + fixedT + ' ' + yes, 'Read as ones’ complement: the adder gives ' + rawT + ' ' + no + '; the answer is ' + truth + '. ' + (add ? 'Add' : 'Subtract by adding NOT B, then add') + ' the carry out of the top bit back in at the bottom (end-around carry) → ' + fixedT + ' ' + yes);
      else if (rep === 'bias') s = T('用偏移碼讀：加法器給 ' + rawT + ' ' + no + '，正確是 ' + truth + '。偏移量被多算（或少算）了一次，翻轉最高位 → ' + fixedT + ' ' + yes, 'Read as offset binary: the adder gives ' + rawT + ' ' + no + '; the answer is ' + truth + '. The offset was counted once too often (or too rarely); flip the top bit → ' + fixedT + ' ' + yes);
      else s = T('用原碼讀：加法器給 ' + rawT + ' ' + no + '，正確是 ' + truth + '。原碼不能直接交給加法器，要先比較符號和大小，再決定相加還是相減。', 'Read as sign–magnitude: the adder gives ' + rawT + ' ' + no + '; the answer is ' + truth + '. Sign–magnitude cannot go straight into the adder: the signs and sizes must be compared first to decide whether to add or subtract.');
    }
    cm.innerHTML = s;
  }
  function renderLog() {
    const tab = $('opLog');
    if (!state.log.length) { tab.innerHTML = ''; $('opEmpty').hidden = false; return; }
    $('opEmpty').hidden = true;
    let html = '<tr><th>' + T('運算', 'Sum') + '</th><th>' + T('加法器', 'Adder') + '</th><th>C</th><th>V</th></tr>';
    state.log.forEach(function (g) {
      const xa = g.xz ? '−0' : it(g.x), yb = signedPar(g.y, g.yz);
      const rt = K.valText(g.r, g.n, g.rep);
      html += '<tr><td>' + xa + (g.op === 'add' ? ' + ' : ' − ') + yb + '</td><td>' + rt + ' ' + (g.ok ? '✓' : '✗') + '</td><td class="' + (g.C ? 'on-c' : '') + '">' + g.C + '</td><td class="' + (g.V ? 'on-v' : '') + '">' + g.V + '</td></tr>';
    });
    tab.innerHTML = html;
  }

  // ---------- 輸入欄 ----------
  function errText(p, kind) {
    const n = state.n, rep = state.rep, rg = K.range(n, rep);
    if (p.err === 'range') return T(it(p.v) + ' 超出' + repName(rep) + ' ' + n + ' 位元的範圍（' + it(rg.min) + ' … ' + it(rg.max) + '）。', it(p.v) + ' is outside the ' + n + '-bit ' + repName(rep) + ' range (' + it(rg.min) + ' … ' + it(rg.max) + ').');
    if (p.err === 'wide') return T('這個圖樣需要超過 ' + n + ' 個位元，請先把「位元數 n」調大。', 'This pattern needs more than ' + n + ' bits; increase “Number of bits n” first.');
    if (kind === 'dec') return T('請輸入整數，例如 −42。', 'Type a whole number, for example −42.');
    if (kind === 'hex') return T('十六進位只能用 0–9 和 A–F。', 'Hexadecimal uses 0–9 and A–F only.');
    return T('二進位只能用 0 和 1。', 'Binary uses 0 and 1 only.');
  }
  function applyA(kind) {
    if (!opsAllowed()) return;
    const el = kind === 'dec' ? elDec : kind === 'hex' ? elHex : elBin;
    el._applied = el.value;
    const p = K.parse(el.value, kind, state.n, state.rep);
    if (!p.ok) { el.classList.add('bad'); setMsg('aMsg', errText(p, kind), 'bad'); return; }
    el.classList.remove('bad');
    const prev = state.u;
    setA(p.u, kind === 'dec' ? 'typeDec' : kind === 'hex' ? 'typeHex' : 'typeBin');
    if (p.u !== prev) sndToggle(true);
    setMsg('aMsg', T('A = ' + K.valText(p.u, state.n, state.rep) + '（' + patText(p.u, state.n) + '）。', 'A = ' + K.valText(p.u, state.n, state.rep) + ' (' + patText(p.u, state.n) + ').'), 'ok');
  }
  function applyB() {
    if (!opsAllowed()) return;
    elB._applied = elB.value;
    const p = K.parse(elB.value, 'dec', state.n, state.rep);
    if (!p.ok) { elB.classList.add('bad'); setMsg('bMsg', errText(p, 'dec'), 'bad'); return; }
    elB.classList.remove('bad');
    setB(p.u, 'typeDec');
    setMsg('bMsg', T('B = ' + K.valText(p.u, state.n, state.rep) + '（' + patText(p.u, state.n) + '）。', 'B = ' + K.valText(p.u, state.n, state.rep) + ' (' + patText(p.u, state.n) + ').'), 'ok');
  }
  function setB(u, src) {
    state.b = u; state.bSrc = src;
    state.work = { mode: 'idle', t0: 0 };
    state.arcs = null;
    resize2();
    updateReadouts();
    requestDraw();
  }
  function toggleB(i) {
    if (quizLocked() || i < 0 || i >= state.n) return;
    setB(K.toggle(state.b, i, state.n), 'toggle');
    sndToggle(K.bit(state.b, i));
    say(T('B 的第 ' + i + ' 位' + (K.bit(state.b, i) ? '亮' : '暗') + '，B = ' + K.valText(state.b, state.n, state.rep) + '。', 'Bit ' + i + ' of B is ' + (K.bit(state.b, i) ? 'on' : 'off') + '; B = ' + K.valText(state.b, state.n, state.rep) + '.'));
  }
  [['dec', elDec], ['hex', elHex], ['bin', elBin]].forEach(function (p) {
    const el = p[1];
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); applyA(p[0]); } });
    el.addEventListener('change', function () { if (el.value !== el._applied) applyA(p[0]); });
    el.addEventListener('blur', function () { if (!el.classList.contains('bad')) updateReadouts(); });
  });
  elB.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); applyB(); } });
  elB.addEventListener('change', function () { if (elB.value !== elB._applied) applyB(); });
  elB.addEventListener('blur', function () { if (!elB.classList.contains('bad')) updateReadouts(); });

  // =====================================================================
  // 旗標挑戰
  // =====================================================================
  const pick = { C: 0, V: 0 };
  function renderPick() {
    $('pickC').textContent = 'C = ' + pick.C; $('pickC').setAttribute('aria-pressed', String(pick.C === 1));
    $('pickV').textContent = 'V = ' + pick.V; $('pickV').setAttribute('aria-pressed', String(pick.V === 1));
  }
  function questionHTML(z) {
    const q = z.q, n = z.n;
    const sym = q.op === 'add' ? '+' : '−';
    return '<span>' + T('第 ' + (z.i + 1) + '／10 題：', 'Question ' + (z.i + 1) + ' of 10: ') + '</span>' +
      T('<b>A ' + sym + ' B</b>（' + n + ' 位元二補數）的 C 和 V 各是多少？', 'what are C and V for <b>A ' + sym + ' B</b> (' + n + '-bit two’s complement)?') +
      '<br>A = <b>' + K.binText(q.a, n, true) + '</b>' + T('（', ' (') + K.valText(q.a, n, 'twos') + T('）', ')') + '<br>B = <b>' + K.binText(q.b, n, true) + '</b>' + T('（', ' (') + K.valText(q.b, n, 'twos') + T('）', ')');
  }
  function quizStart() {
    const n = state.n;
    state.quiz = { n: n, i: 0, correct: 0, t0: performance.now(), q: null, wait: false, prev: null, timer: 0 };
    state.streak = 0;
    lab.classList.add('quizzing');
    $('quizStart').hidden = true; $('quizStop').hidden = false; $('quizPick').hidden = false;
    if (state.rep !== 'twos') { state.rep = 'twos'; ringCache = null; }
    state.info = null; renderInfo();
    updateButtons();
    nextQuestion();
    tickQuiz();
  }
  function nextQuestion() {
    const z = state.quiz;
    if (!z) return;
    z.q = K.question(qrand, z.n, z.prev);
    z.prev = z.q; z.wait = false;
    setA(z.q.a, 'quiz', { silent: true, jump: true });
    state.b = z.q.b; state.bSrc = 'quiz';
    pick.C = 0; pick.V = 0; renderPick();
    $('pickC').disabled = false; $('pickV').disabled = false;
    $('quizQ').innerHTML = questionHTML(z);
    $('quizOk').disabled = false;
    updateReadouts();
    requestDraw();
  }
  function quizCheck() {
    const z = state.quiz;
    if (!z || !z.q || z.wait) return;
    z.wait = true;
    const q = z.q;
    doArith(q.op, true);
    const ok = pick.C === q.C && pick.V === q.V;
    z.i++;
    if (ok) { z.correct++; state.streak++; } else state.streak = 0;
    sndChime(ok);
    emit('quiz', { ok: ok, streak: state.streak, n: z.n, op: q.op });
    $('quizOk').disabled = true; $('pickC').disabled = true; $('pickV').disabled = true;
    const ans = 'C = ' + q.C + T('、', ', ') + 'V = ' + q.V;
    $('quizQ').innerHTML = ok ? T('✓ 答對了！' + ans, '✓ Correct! ' + ans) : T('✗ 正確答案是 <b>' + ans + '</b>', '✗ The answer is <b>' + ans + '</b>');
    const wait = reducedMotion ? 900 : 1900;
    z.timer = setTimeout(function () { if (state.quiz !== z) return; if (z.i >= 10) quizEnd(); else nextQuestion(); }, wait);
  }
  function quizEnd() {
    const z = state.quiz;
    if (!z) return;
    const time = Math.round((performance.now() - z.t0) / 100) / 10;
    state.rounds.push({ n: z.n, correct: z.correct, time: time });
    emit('round', { correct: z.correct, total: 10, time: time, n: z.n });
    quizExit();
    $('quizQ').innerHTML = T('這一回合答對 <b>' + z.correct + '／10</b>，用了 ' + time.toFixed(1) + ' 秒。', 'This round: <b>' + z.correct + ' / 10</b> correct in ' + time.toFixed(1) + ' s.');
    renderRounds();
  }
  function quizExit() {
    const z = state.quiz;
    if (z) clearTimeout(z.timer);
    state.quiz = null;
    state.last = null;
    lab.classList.remove('quizzing');
    $('quizStart').hidden = false; $('quizStop').hidden = true; $('quizPick').hidden = true;
    $('quizOk').disabled = true;
    $('quizStat').innerHTML = '';
    updateReadouts();
    requestDraw();
  }
  function tickQuiz() {
    const z = state.quiz;
    if (!z) return;
    const s = (performance.now() - z.t0) / 1000;
    $('quizStat').innerHTML = '<span>' + T('答對 ', 'Correct ') + '<b>' + z.correct + '</b>' + T('／', ' / ') + z.i + '</span><span>' + T('連對 ', 'Streak ') + '<b>' + state.streak + '</b></span><span>' + T('時間 ', 'Time ') + '<b>' + s.toFixed(1) + '</b> ' + T('秒', 's') + '</span>';
    setTimeout(tickQuiz, 200);
  }
  function renderRounds() {
    const tab = $('roundLog');
    if (!state.rounds.length) { tab.innerHTML = ''; $('logEmpty').hidden = false; return; }
    $('logEmpty').hidden = true;
    let html = '<tr><th>' + T('回合', 'Round') + '</th><th>' + T('位元數', 'Bits') + '</th><th>' + T('答對', 'Correct') + '</th><th>' + T('時間（秒）', 'Time (s)') + '</th></tr>';
    state.rounds.forEach(function (r, k) { html += '<tr><td>' + (k + 1) + '</td><td>' + r.n + '</td><td>' + r.correct + T('／10', ' / 10') + '</td><td>' + r.time.toFixed(1) + '</td></tr>'; });
    tab.innerHTML = html;
  }
  $('quizStart').addEventListener('click', quizStart);
  $('quizStop').addEventListener('click', function () { quizExit(); $('quizQ').textContent = T('挑戰結束。按「開始挑戰」再來一次。', 'Challenge stopped. Press “Start the challenge” to try again.'); });
  $('quizOk').addEventListener('click', quizCheck);
  $('pickC').addEventListener('click', function () { if (state.quiz && !state.quiz.wait) { pick.C ^= 1; renderPick(); sndToggle(pick.C === 1); } });
  $('pickV').addEventListener('click', function () { if (state.quiz && !state.quiz.wait) { pick.V ^= 1; renderPick(); sndToggle(pick.V === 1); } });

  // =====================================================================
  // 控制項
  // =====================================================================
  const elN = $('nb'), elM = $('mb');
  function readN() { return Math.max(K.MIN_BITS, Math.min(K.MAX_BITS, Math.round(val(elN)))); }
  function readM() { return Math.max(5, Math.min(32, Math.round(val(elM)))); }
  elN.addEventListener('input', function () {
    const n = readN();
    if (n === state.n || state.quiz) return;
    const prevN = state.n, pv = K.value(state.u, prevN, state.rep);
    const r = K.resize(state.u, prevN, n, state.rep), rb = K.resize(state.b, prevN, n, state.rep);
    state.n = n; state.b = rb.u; state.last = null;
    state.focus = Math.min(state.focus, n - 1); state.bFocus = Math.min(state.bFocus, n - 1);
    const m = Math.min(32, 2 * n);
    state.m = m;
    if (window.LabNum) window.LabNum.set(elM, m); else elM.value = m;
    $('extMsg').textContent = '';
    setMsg('aMsg', '', ''); setMsg('bMsg', '', '');
    L = layout(); resize();
    setA(r.u, 'bits', { prevN: prevN, pv: pv, kept: r.kept, jump: true });
    const rg = K.range(n, state.rep);
    say(T(n + ' 個位元（' + repName(state.rep) + '）：' + it(rg.min) + ' … ' + it(rg.max) + '。' + (r.kept ? '' : '值放不下，只留最低的 ' + n + ' 位：A = ' + K.valText(r.u, n, state.rep) + '。'),
      n + ' bits (' + repName(state.rep) + '): ' + it(rg.min) + ' … ' + it(rg.max) + '.' + (r.kept ? '' : ' The value did not fit, so only the lowest ' + n + ' bits stay: A = ' + K.valText(r.u, n, state.rep) + '.')));
  });
  elM.addEventListener('input', function () {
    state.m = readM();
    $('mbo').textContent = String(state.m);
    $('extMsg').textContent = '';
    updateButtons();
  });
  REPS.forEach(function (r) { $(REP_BTN[r]).addEventListener('click', function () { setRep(r); }); });
  $('incBtn').addEventListener('click', function () { if (opsAllowed()) doIncDec(true); });
  $('decBtn').addEventListener('click', function () { if (opsAllowed()) doIncDec(false); });
  $('notBtn').addEventListener('click', function () { if (opsAllowed()) doNot(); });
  $('negBtn').addEventListener('click', function () { if (opsAllowed()) doNeg(); });
  $('clearBtn').addEventListener('click', function () { if (opsAllowed()) doClear(); });
  $('addBtn').addEventListener('click', function () { if (opsAllowed()) doArith('add'); });
  $('subBtn').addEventListener('click', function () { if (opsAllowed()) doArith('sub'); });
  $('resBtn').addEventListener('click', doResult);
  $('extBtn').addEventListener('click', doExtend);
  $('wipeBtn').addEventListener('click', function () {
    state.log = []; renderLog();
    if (!state.quiz) { state.rounds = []; renderRounds(); }
    state.work = { mode: 'idle', t0: 0 }; state.arcs = null; state.flashes = []; state.pend = [];
    state.last = null; state.info = null; renderInfo();
    $('extMsg').textContent = '';
    resize2(); updateButtons();
    say(T('已清除直式、弧線、運算紀錄與挑戰紀錄。', 'Cleared the worked sum, the arcs, the operation log and the challenge log.'));
    requestDraw();
  });

  // ---------- 畫布：點燈 ----------
  function hitLamp(ev) {
    if (!L) return -1;
    const rect = cv.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    for (let i = 0; i < state.n; i++) {
      const p = lampPos(i);
      if (Math.abs(x - p.x) <= L.pitch / 2 && y >= p.cy - L.r - 12 && y <= p.dy + L.digitH * 0.6) return i;
    }
    return -1;
  }
  cv.addEventListener('pointerdown', function (ev) {
    const i = hitLamp(ev);
    if (i < 0) return;
    state.focus = i;
    toggleBit(i);
  });
  cv.addEventListener('pointermove', function (ev) {
    const i = ev.pointerType === 'mouse' ? hitLamp(ev) : -1;
    if (i !== state.hover) { state.hover = i; cv.style.cursor = i >= 0 && !quizLocked() ? 'pointer' : 'default'; requestDraw(); }
  });
  cv.addEventListener('pointerleave', function () { if (state.hover !== -1) { state.hover = -1; requestDraw(); } });
  // ---------- 直式：點 B 的位元 ----------
  function hitB(ev) {
    if (!W2) return -1;
    const rows = workRows(), rB = rows.filter(function (r) { return r.key === 'B'; })[0];
    if (!rB || state.work.mode === 'neg') return -1;
    const rect = cv2.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    if (y < rB.y || y > rB.y + rB.h) return -1;
    for (let i = 0; i < state.n; i++) if (Math.abs(x - colX(i)) <= W2.cell / 2) return i;
    return -1;
  }
  cv2.addEventListener('pointerdown', function (ev) {
    const i = hitB(ev);
    if (i < 0) return;
    state.bFocus = i;
    toggleB(i);
  });
  cv2.addEventListener('pointermove', function (ev) {
    const i = ev.pointerType === 'mouse' ? hitB(ev) : -1;
    if (i !== state.hoverB) { state.hoverB = i; cv2.style.cursor = i >= 0 && !quizLocked() ? 'pointer' : 'default'; requestDraw(); }
  });
  cv2.addEventListener('pointerleave', function () { if (state.hoverB !== -1) { state.hoverB = -1; requestDraw(); } });

  // ---------- 鍵盤 ----------
  let kbA = null, kbB = null;
  function bitDesc(u, i) {
    const wl = weightLabel(i);
    return T('第 ' + i + ' 位（權重 ' + wl.num + '）' + (K.bit(u, i) ? '亮' : '暗'), 'bit ' + i + ' (weight ' + wl.num + ') ' + (K.bit(u, i) ? 'on' : 'off'));
  }
  if (window.LabKeys) {
    kbA = window.LabKeys.attach(cv, {
      label: T('數字環與暫存器 A。按 Enter 切換「燈」與「A 的值」；選燈時左右方向鍵換燈，上鍵點亮、下鍵熄滅；選值時上下方向鍵加一減一。', 'Number ring and register A. Press Enter to switch between “lamps” and “value of A”. With lamps, the left and right arrow keys choose a lamp, up switches it on and down switches it off; with the value, up and down add or subtract one.'),
      items: [
        {
          name: function () { return T('暫存器 A 的燈', 'Lamps of register A'); },
          move: function (dx, dy) {
            if (quizLocked()) return false;
            if (dx) { state.focus = Math.max(0, Math.min(state.n - 1, state.focus - dx)); return true; }
            const want = dy > 0 ? 1 : 0;
            if (K.bit(state.u, state.focus) !== want) toggleBit(state.focus);
            return true;
          },
          describe: function () { return bitDesc(state.u, state.focus) + T('；A = ', '; A = ') + K.valText(state.u, state.n, state.rep); }
        },
        {
          name: function () { return T('A 的值', 'Value of A'); },
          move: function (dx, dy) { if (quizLocked()) return false; doIncDec((dy || dx) > 0); return true; },
          describe: function () { return 'A = ' + K.valText(state.u, state.n, state.rep); }
        }
      ],
      onChange: function () { requestDraw(); }
    });
    kbB = window.LabKeys.attach(cv2, {
      label: T('直式。左右方向鍵選 B 的位元，上鍵點亮、下鍵熄滅。', 'Worked sum. The left and right arrow keys choose a bit of B; up switches it on and down switches it off.'),
      items: [{
        name: function () { return T('B 的位元', 'Bits of B'); },
        move: function (dx, dy) {
          if (quizLocked() || state.work.mode === 'neg' || state.work.mode === 'ext') return false;
          if (dx) { state.bFocus = Math.max(0, Math.min(state.n - 1, state.bFocus - dx)); return true; }
          const want = dy > 0 ? 1 : 0;
          if (K.bit(state.b, state.bFocus) !== want) toggleB(state.bFocus);
          return true;
        },
        describe: function () { return 'B: ' + bitDesc(state.b, state.bFocus) + T('；B = ', '; B = ') + K.valText(state.b, state.n, state.rep); }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // ---------- 測試用介面（Playwright 腳本使用；不影響一般操作） ----------
  window.TwosLab = {
    state: state,
    typeA: function (text, kind) { const el = kind === 'hex' ? elHex : kind === 'bin' ? elBin : elDec; el.value = String(text); applyA(kind || 'dec'); },
    typeB: function (text) { elB.value = String(text); applyB(); },
    bits: function (n) { if (window.LabNum) window.LabNum.set(elN, n); else { elN.value = n; elN.dispatchEvent(new Event('input')); } },
    widen: function (m) { if (window.LabNum) window.LabNum.set(elM, m); else { elM.value = m; elM.dispatchEvent(new Event('input')); } },
    rep: function (r) { setRep(r); },
    seed: function (s) { qrand = K.rng(s); },
    answer: function () { const z = state.quiz; return z && z.q ? { C: z.q.C, V: z.q.V } : null; },
    pick: function (c, v) { pick.C = c; pick.V = v; renderPick(); }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    updateReadouts();
    renderInfo();
    renderLog();
    renderRounds();
    updateSoundButton();
    if (state.quiz && state.quiz.q && !state.quiz.wait) $('quizQ').innerHTML = questionHTML(state.quiz);
    requestDraw();
  }
  readColors();
  state.n = readN();
  state.m = readM();
  for (let i = 0; i < state.n; i++) state.tgt[i] = state.disp[i] = K.bit(state.u, i);
  state.pos = state.u + 0.5;
  updateReadouts();
  renderInfo();
  renderLog();
  renderRounds();
  renderPick();
  updateSoundButton();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0, lastW2 = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lastW || wrap2.clientWidth !== lastW2) { lastW = cv.clientWidth; lastW2 = wrap2.clientWidth; resize(); }
    }).observe(stage);
  } else window.addEventListener('resize', resize);
  resize();
})();
