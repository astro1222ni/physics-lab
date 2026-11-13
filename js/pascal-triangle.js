/* pascal-triangle.js — 「巴斯卡三角形與二項式定理」的畫面與互動（數學計算在 pascal-triangle-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 三角形：六角形格子排成的巴斯卡三角形（1–64 列），點一格看它由上面哪兩格相加，可依「除以 m 的餘數」上色（謝爾賓斯基三角形）。
 * 走格子：m × n 的格子從 A 走到 B（每步向右或向上），每個點寫出走法數（就是轉了 45° 的巴斯卡三角形）；可放路障、畫路徑、隨機一條路。
 * 二項式展開：(a x + b)^n 每一項的係數畫成長條，上方是巴斯卡三角形的第 n 列；可代入 x = 1、x = −1 看係數和與交錯和。
 * 挑戰「幾條路？」：有路障的格子、數字藏起來，四選一。 */
(function () {
  'use strict';
  const P = window.PascalCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha;
  const SQ3 = Math.sqrt(3);

  // ---------- 狀態 ----------
  const state = {
    mode: 'tri',
    tn: 12, tm: 2, color: false, sel: null,                 // 三角形
    gm: 4, gn: 3, tool: 'path', ways: true, blocks: new Set(), path: [[0, 0]], anim: null,   // 走格子
    ba: 1, bb: 1, bn: 4, selK: null, sub: null,             // 二項式
    chal: null, round: 0, streak: [], log: []
  };
  let rand = P.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);
  let lastChal = null;
  let applying = false;

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'pt-lo', 'pt-hi', 'pt-sel', 'pt-par', 'pt-path', 'pt-block', 'pt-pos', 'pt-neg']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  /** 除以 m 的餘數 1–9 的顏色（深淺色各一組；餘數 0 畫成淡底） */
  const MODPAL = {
    light: ['#4338ca', '#0d9488', '#d97706', '#db2777', '#2563eb', '#65a30d', '#9333ea', '#dc2626', '#0891b2'],
    dark: ['#a5b4fc', '#5eead4', '#fbbf24', '#f9a8d4', '#93c5fd', '#bef264', '#d8b4fe', '#fca5a5', '#67e8f9']
  };
  function fnt(px, weight, italic) { return (italic ? 'italic ' : '') + (weight ? weight + ' ' : '') + px + 'px ' + FONT; }

  // ---------- 文字 ----------
  function neg(s) { return String(s).replace(/^-/, '−'); }
  function texNum(v) { return P.group(v).replace(/,/g, '{,}'); }
  function htmlC(n, k) { return 'C<sup>' + n + '</sup><sub>' + k + '</sub>'; }
  function htmlPow(base, e) { return e === 0 ? '' : e === 1 ? base : base + '<sup>' + e + '</sup>'; }

  // ---------- 目前的量 ----------
  function QG() {
    const ch = state.chal;
    const m = ch ? ch.m : state.gm, n = ch ? ch.n : state.gn;
    const blocked = ch ? ch.set : state.blocks;
    const W = P.gridWays(m, n, blocked);
    return { m: m, n: n, blocked: blocked, W: W, count: W[m][n], total: P.Cn(m + n, m), nb: blocked.size };
  }
  function QB() {
    const c = P.expand(state.ba, state.bb, state.bn);
    return { coefs: c, sum: P.evalPoly(c, 1), alt: P.evalPoly(c, -1) };
  }

  // ---------- 畫布 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 480, F = null;
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    const narrow = cw < 600;
    ch = narrow ? Math.round(Math.max(340, Math.min(cw * 1.1, 460))) : 500;
    F = { narrow: narrow, W: cw, H: ch };
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    requestDraw();
  }
  let rafId = 0;
  function requestDraw() { if (!rafId) rafId = requestAnimationFrame(function () { rafId = 0; draw(); }); }

  // =====================================================================
  // 三角形
  // =====================================================================
  /** 三角形的排版：六角形（尖頂）寬 s，列距 s·√3/2 */
  function triLayout() {
    const N = state.tn, pad = 10;
    const s = Math.min((F.W - 2 * pad) / N, (F.H - 2 * pad) / ((N - 1) * SQ3 / 2 + 2 / SQ3), 64);
    const rowH = s * SQ3 / 2, hexH = 2 * s / SQ3;
    const totalH = (N - 1) * rowH + hexH;
    const y0 = (F.H - totalH) / 2 + hexH / 2;
    return {
      N: N, s: s, rowH: rowH, y0: y0, cx: F.W / 2,
      X: function (n, k) { return F.W / 2 + (k - n / 2) * s; },
      Y: function (n) { return y0 + n * rowH; }
    };
  }
  function hexPath(c, x, y, s) {
    const r = s / SQ3;     // 外接圓半徑（尖頂六角形：寬 = √3 r）
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.closePath();
  }
  function drawTri(c) {
    const L = triLayout(), N = L.N, s = L.s;
    const pal = MODPAL[D.dark ? 'dark' : 'light'];
    const R = state.color ? P.modRows(N, state.tm) : null;
    const maxLog = Math.log(Number(P.C(N - 1, Math.floor((N - 1) / 2)))) || 1;
    const showNum = s >= 24;
    const gap = s >= 14 ? 0.9 : s >= 7 ? 0.6 : 0.3;
    const sel = state.sel && state.sel.n < N ? state.sel : null;
    const selV = sel ? P.C(sel.n, sel.k) : null;
    for (let n = 0; n < N; n++) {
      const row = P.row(n), y = L.Y(n);
      for (let k = 0; k <= n; k++) {
        const x = L.X(n, k), v = row[k];
        let fill, ink;
        if (R) {
          const r = R[n][k];
          if (r === 0) { fill = alpha(C.text, D.dark ? 0.07 : 0.06); ink = C.muted; }
          else { fill = pal[(r - 1) % pal.length]; ink = D.dark ? '#111827' : '#ffffff'; }
        } else {
          const t = n === 0 ? 0 : Math.log(Number(v)) / maxLog;
          fill = D.mix(C['pt-lo'], C['pt-hi'], 0.08 + 0.85 * t);
          ink = t > 0.5 ? (D.dark ? '#111827' : '#ffffff') : C.text;
        }
        hexPath(c, x, y, s - gap);
        c.fillStyle = fill; c.fill();
        if (s >= 14) {
          // 淡淡的上亮下暗，像一顆顆有厚度的磁磚
          const g = c.createLinearGradient(x, y - s * 0.55, x, y + s * 0.55);
          g.addColorStop(0, 'rgba(255,255,255,' + (D.dark ? 0.07 : 0.18) + ')');
          g.addColorStop(1, 'rgba(0,0,0,' + (D.dark ? 0.16 : 0.07) + ')');
          c.fillStyle = g; c.fill();
        }
        if (showNum) {
          const str = String(v);
          const fs = Math.min(s * 0.4, (s * 0.9) / (str.length * 0.58));
          if (fs >= 8) {
            c.font = fnt(fs.toFixed(1), 600); c.fillStyle = ink; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(str, x, y + 0.5);
          }
        }
        if (sel && v === selV && !(n === sel.n && k === sel.k) && n > 1) {
          hexPath(c, x, y, s - gap);
          c.setLineDash([3, 2]); c.strokeStyle = C['pt-sel']; c.lineWidth = Math.max(1.2, s * 0.06); c.stroke(); c.setLineDash([]);
        }
      }
    }
    if (sel) {
      const x = L.X(sel.n, sel.k), y = L.Y(sel.n);
      const lw = Math.max(1.6, Math.min(3.2, s * 0.1));
      const parents = [];
      if (sel.n > 0) { if (sel.k > 0) parents.push(sel.k - 1); if (sel.k < sel.n) parents.push(sel.k); }
      parents.forEach(function (k) {
        const px = L.X(sel.n - 1, k), py = L.Y(sel.n - 1);
        hexPath(c, px, py, s - gap); c.strokeStyle = C['pt-par']; c.lineWidth = lw; c.stroke();
        if (s >= 12) {
          // 從父格指向選取格的小箭頭
          const ux = (x - px), uy = (y - py), l = Math.hypot(ux, uy);
          const ax = px + ux / l * s * 0.36, ay = py + uy / l * s * 0.36, bx = x - ux / l * s * 0.36, by = y - uy / l * s * 0.36;
          c.strokeStyle = C['pt-par']; c.lineWidth = Math.max(1.4, lw * 0.8); c.lineCap = 'round';
          c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
        }
      });
      hexPath(c, x, y, s - gap); c.strokeStyle = C['pt-sel']; c.lineWidth = lw * 1.25; c.stroke();
      // 角落標籤：a + b = c
      const v = P.C(sel.n, sel.k);
      let txt = sel.n === 0 || sel.k === 0 || sel.k === sel.n ? T('邊上的 1', '1 on the edge')
        : P.group(P.C(sel.n - 1, sel.k - 1)) + ' + ' + P.group(P.C(sel.n - 1, sel.k)) + ' = ' + P.group(v);
      const room = F.W / 2 - s * 1.2;
      c.font = fnt(12.5, 600);
      if (c.measureText(txt).width + 18 > room) txt = '= ' + P.group(v);
      if (c.measureText(txt).width + 18 <= Math.max(room, F.W * 0.45)) D.pill(c, txt, 10, 34, C['pt-sel'], 'left', fnt(12.5, 600));
    }
    // 右上角：列數與上色方式
    const info = T('第 0 到第 ' + (N - 1) + ' 列', 'rows 0 to ' + (N - 1)) + (state.color ? T('・除以 ' + state.tm + ' 的餘數', ' · remainder mod ' + state.tm) : '');
    D.haloText(c, info, F.W - 10, 12, C.muted, 'right', 'top', fnt(11.5));
  }
  function triHit(px, py) {
    const L = triLayout();
    const n0 = Math.round((py - L.y0) / L.rowH);
    let best = null, bd = Infinity;
    for (let n = n0 - 1; n <= n0 + 1; n++) {
      if (n < 0 || n >= L.N) continue;
      const k = Math.round((px - L.cx) / L.s + n / 2);
      for (let kk = k - 1; kk <= k + 1; kk++) {
        if (kk < 0 || kk > n) continue;
        const d = Math.hypot(L.X(n, kk) - px, L.Y(n) - py);
        if (d < bd) { bd = d; best = { n: n, k: kk }; }
      }
    }
    return best && bd <= Math.max(L.s * 0.62, 12) ? best : null;
  }

  // =====================================================================
  // 走格子
  // =====================================================================
  function gridLayout() {
    const q = QG();
    const padX = 30, padT = 34, padB = 34;
    const u = Math.min((F.W - 2 * padX) / q.m, (F.H - padT - padB) / q.n, 86);
    const w = u * q.m, h = u * q.n;
    const x0 = (F.W - w) / 2, y0 = padT + (F.H - padT - padB - h) / 2 + h;   // y0 是最下面那一排
    return { q: q, u: u, X: function (i) { return x0 + i * u; }, Y: function (j) { return y0 - j * u; }, x0: x0, y0: y0, w: w, h: h };
  }
  function drawGrid(c) {
    const L = gridLayout(), q = L.q, u = L.u;
    const chal = !!state.chal;
    // 底板
    c.save();
    D.roundRect(c, L.x0 - u * 0.28, L.y0 - L.h - u * 0.28, L.w + u * 0.56, L.h + u * 0.56, 12);
    c.fillStyle = alpha(C.text, D.dark ? 0.04 : 0.03); c.fill();
    c.restore();
    // 道路
    c.lineCap = 'round';
    c.strokeStyle = alpha(C.text, D.dark ? 0.3 : 0.22); c.lineWidth = Math.max(2, u * 0.05);
    c.beginPath();
    for (let i = 0; i <= q.m; i++) { c.moveTo(L.X(i), L.Y(0)); c.lineTo(L.X(i), L.Y(q.n)); }
    for (let j = 0; j <= q.n; j++) { c.moveTo(L.X(0), L.Y(j)); c.lineTo(L.X(q.m), L.Y(j)); }
    c.stroke();
    // 路徑
    const path = chal ? [] : state.path;
    let shown = path.length;
    if (state.anim && !chal) {
      const t = Math.min(1, (performance.now() - state.anim.t0) / state.anim.dur);
      shown = Math.max(1, Math.ceil(t * (path.length - 1)) + 1);
      if (t < 1) requestDraw(); else state.anim = null;
    }
    if (shown > 1) {
      c.strokeStyle = alpha(C['pt-path'], 0.25); c.lineWidth = Math.max(9, u * 0.2); c.lineJoin = 'round';
      c.beginPath(); for (let t = 0; t < shown; t++) { const p = path[t]; if (t) c.lineTo(L.X(p[0]), L.Y(p[1])); else c.moveTo(L.X(p[0]), L.Y(p[1])); } c.stroke();
      c.strokeStyle = C['pt-path']; c.lineWidth = Math.max(3.5, u * 0.075);
      c.stroke();
    }
    // 下一步可以走的點（畫路徑模式）
    const end = path[path.length - 1];
    const done = end && end[0] === q.m && end[1] === q.n;
    if (!chal && state.tool === 'path' && end && !done && !state.anim) {
      [[end[0] + 1, end[1]], [end[0], end[1] + 1]].forEach(function (p) {
        if (p[0] > q.m || p[1] > q.n || q.blocked.has(P.key(p[0], p[1]))) return;
        c.beginPath(); c.arc(L.X(p[0]), L.Y(p[1]), Math.max(7, u * 0.16), 0, Math.PI * 2);
        c.setLineDash([3, 3]); c.strokeStyle = alpha(C['pt-path'], 0.8); c.lineWidth = 1.6; c.stroke(); c.setLineDash([]);
      });
    }
    // 點、路障、走法數
    const showWays = !chal && state.ways;
    const fs = Math.max(9.5, Math.min(13, u * 0.26));
    for (let i = 0; i <= q.m; i++) for (let j = 0; j <= q.n; j++) {
      const x = L.X(i), y = L.Y(j), b = q.blocked.has(P.key(i, j));
      if (b) {
        const r = Math.max(8, u * 0.17);
        D.ball(c, x, y, r, C['pt-block'], { glow: null });
        c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(1.8, r * 0.22); c.lineCap = 'round';
        c.beginPath(); c.moveTo(x - r * 0.45, y - r * 0.45); c.lineTo(x + r * 0.45, y + r * 0.45); c.moveTo(x + r * 0.45, y - r * 0.45); c.lineTo(x - r * 0.45, y + r * 0.45); c.stroke();
      } else {
        const onPath = path.some(function (p) { return p[0] === i && p[1] === j; });
        c.beginPath(); c.arc(x, y, Math.max(3, u * 0.06), 0, Math.PI * 2);
        c.fillStyle = onPath ? C['pt-path'] : alpha(C.text, 0.5); c.fill();
      }
      if (showWays && !b && !(i === 0 && j === 0) && !(i === q.m && j === q.n)) {
        D.haloText(c, String(q.W[i][j]), x + 5, y - 5, C['pt-hi'], 'left', 'bottom', fnt(fs, 700));
      }
    }
    // A 與 B
    const rb = Math.max(7, Math.min(12, u * 0.13));
    D.ball(c, L.X(0), L.Y(0), rb, C['pt-hi'], { glow: 0.25 });
    D.ball(c, L.X(q.m), L.Y(q.n), rb, C['pt-par'], { glow: 0.25 });
    D.haloText(c, 'A', L.X(0) - rb - 3, L.Y(0) + rb + 1, C['pt-hi'], 'right', 'top', fnt(14, 700, true));
    D.haloText(c, 'B', L.X(q.m) + rb + 3, L.Y(q.n) - rb - 1, C['pt-par'], 'left', 'bottom', fnt(14, 700, true));
    if (showWays) D.haloText(c, String(q.count), L.X(q.m) + rb + 4, L.Y(q.n) + 2, C['pt-par'], 'left', 'top', fnt(fs + 1, 800));
    if (end && path.length > 1 && !done) D.ball(c, L.X(end[0]), L.Y(end[1]), Math.max(6, u * 0.11), C['pt-path'], { glow: 0.3 });
    // 左上角標籤
    let label;
    if (chal) label = T('從 A 到 B 有幾條最短路徑？', 'How many shortest routes from A to B?');
    else if (q.count === 0) label = T('被路障擋住了：0 條路', 'Blocked: no route');
    else label = T('共 ' + q.count + ' 條路', q.count + (q.count === 1 ? ' route' : ' routes'));
    D.pill(c, label, 10, 30, chal ? C.accent : q.count === 0 ? C['pt-block'] : C['pt-hi'], 'left', fnt(12.5, 600));
  }
  function gridHit(px, py) {
    const L = gridLayout(), q = L.q;
    const i = Math.round((px - L.x0) / L.u), j = Math.round((L.y0 - py) / L.u);
    if (i < 0 || i > q.m || j < 0 || j > q.n) return null;
    const R = Math.max(L.u * 0.45, 12);
    return Math.hypot(L.X(i) - px, L.Y(j) - py) <= R ? [i, j] : null;
  }

  // =====================================================================
  // 二項式
  // =====================================================================
  function binomLayout() {
    const n = state.bn, cols = n + 1, pad = 12;
    const slot = (F.W - 2 * pad) / cols;
    const s = Math.min(slot, 52);
    const chipY = 26 + s * 0.6;
    const top = chipY + s * 0.6 + 40, bottom = F.H - 34;
    return { n: n, cols: cols, slot: slot, s: s, chipY: chipY, top: top, bottom: bottom, X: function (j) { return pad + (j + 0.5) * slot; } };
  }
  function shownCoefs() {
    const c = QB().coefs;
    return state.sub === -1 ? c.map(function (v, k) { return k % 2 ? -v : v; }) : c;
  }
  function drawBinom(c) {
    const L = binomLayout(), n = L.n;
    const show = shownCoefs();
    // 上方：巴斯卡三角形第 n 列
    D.haloText(c, T('巴斯卡三角形第 ' + n + ' 列', 'Row ' + n + ' of Pascal’s triangle'), 12, 8, C.muted, 'left', 'top', fnt(11.5));
    for (let j = 0; j <= n; j++) {
      const x = L.X(j), v = P.Cn(n, j);
      hexPath(c, x, L.chipY, L.s - 2);
      c.fillStyle = D.mix(C['pt-lo'], C['pt-hi'], 0.25); c.fill();
      const str = String(v), fs = Math.min(L.s * 0.38, (L.s * 0.88) / (str.length * 0.58));
      c.font = fnt(fs.toFixed(1), 600); c.fillStyle = D.dark ? '#e0e7ff' : '#1e1b4b'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(str, x, L.chipY + 0.5);
    }
    // 長條：由左到右是 x^n、x^(n−1)、…、x^0（和展開式的寫法同順序）
    const maxAbs = Math.max(1, Math.max.apply(null, show.map(Math.abs)));
    const hasNeg = show.some(function (v) { return v < 0; });
    const zeroY = hasNeg ? (L.top + L.bottom) / 2 : L.bottom;
    const span = hasNeg ? (L.bottom - L.top) / 2 - 14 : L.bottom - L.top - 16;
    c.strokeStyle = alpha(C.text, 0.4); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(8, zeroY); c.lineTo(F.W - 8, zeroY); c.stroke();
    const bw = Math.max(6, Math.min(L.slot * 0.62, 46));
    const labs = show.map(function (v) { return neg(P.group(v)); });
    const maxLen = Math.max.apply(null, labs.map(function (t) { return t.length; }));
    const vfs = Math.max(8, Math.min(12, (L.slot * 0.98) / (maxLen * 0.56)));
    for (let j = 0; j <= n; j++) {
      const k = n - j, v = show[k], x = L.X(j);
      const h = Math.abs(v) / maxAbs * span;
      const col = v < 0 ? C['pt-neg'] : C['pt-pos'];
      // 連到上面的六角形
      c.strokeStyle = alpha(C.text, 0.12); c.lineWidth = 1; c.setLineDash([2, 3]);
      c.beginPath(); c.moveTo(x, L.chipY + L.s * 0.6); c.lineTo(x, Math.min(zeroY - (v > 0 ? h : 0), L.top) - 4); c.stroke(); c.setLineDash([]);
      if (h > 0.5) {
        const y = v < 0 ? zeroY : zeroY - h;
        D.roundRect(c, x - bw / 2, y, bw, h, Math.min(5, bw * 0.2, h / 2));
        const g = c.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0);
        g.addColorStop(0, D.shade(col, D.dark ? -0.1 : 0.12)); g.addColorStop(0.5, col); g.addColorStop(1, D.shade(col, -0.18));
        c.fillStyle = g; c.fill();
      } else {
        c.fillStyle = alpha(C.text, 0.35); c.fillRect(x - bw / 2, zeroY - 1, bw, 2);
      }
      if (state.selK === k) {
        const y0 = v < 0 ? zeroY : zeroY - h, hh = Math.max(h, 2);
        D.roundRect(c, x - bw / 2 - 3, y0 - 3, bw + 6, hh + 6, 6);
        c.strokeStyle = C['pt-sel']; c.lineWidth = 2.2; c.stroke();
      }
      // 數值
      const str = labs[k];
      const fs = vfs;
      if ((L.slot * 0.98) / (str.length * 0.56) >= vfs - 0.01) {
        const ty = v < 0 ? zeroY + h + 3 : zeroY - h - 3;
        D.haloText(c, str, x, ty, v < 0 ? C['pt-neg'] : v > 0 ? C['pt-pos'] : C.muted, 'center', v < 0 ? 'top' : 'bottom', fnt(fs.toFixed(1), 700));
      }
      // 項的名稱
      const lf = fnt(Math.min(13, Math.max(9, L.slot * 0.34)).toFixed(1), 600, true);
      const ly = F.H - 12;
      if (k === 0) D.haloText(c, '1', x, ly, C.muted, 'center', 'alphabetic', fnt(12, 600));
      else if (k === 1) D.haloText(c, 'x', x, ly, C.muted, 'center', 'alphabetic', lf);
      else D.supText(c, 'x', String(k), x, ly, C.muted, lf, 'center');
    }
    // 代入的結果
    if (state.sub != null) {
      const S = state.sub === 1 ? QB().sum : QB().alt;
      const txt = (state.sub === 1 ? T('x = 1：係數和 = ', 'x = 1: sum = ') : T('x = −1：交錯和 = ', 'x = −1: alternating sum = ')) + neg(P.group(S));
      D.pill(c, txt, F.W / 2, L.top - 8, C['pt-par'], 'center', fnt(12.5, 600));
    }
  }
  function binomHit(px, py) {
    const L = binomLayout();
    if (py < L.top - 30) return null;
    const j = Math.floor((px - 12) / L.slot);
    return j >= 0 && j <= L.n ? L.n - j : null;
  }

  /** 鍵盤操作時，標出目前選到的東西 */
  function drawFocus(c) {
    const i = kb.index();
    let txt = '';
    if (i === 0) txt = state.mode === 'tri' ? T('方向鍵：換格子', 'Arrows: move the cell') : state.mode === 'grid' ? T('→ ↑ 走一步，← ↓ 退一步', '→ ↑ step, ← ↓ back') : T('← → 換一項', '← → pick a term');
    else txt = state.mode === 'tri' ? T('方向鍵：改列數', 'Arrows: rows') : state.mode === 'grid' ? T('← → 改寬、↑ ↓ 改高', '← → width, ↑ ↓ height') : T('方向鍵：改 n', 'Arrows: change n');
    D.pill(c, txt, F.W / 2, F.H - 8, C.accent, 'center', fnt(11.5, 600));
  }
  // ---------- 主畫面 ----------
  function draw() {
    if (!F) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(ctx, cw, ch);
    if (state.mode === 'tri') drawTri(ctx);
    else if (state.mode === 'grid') drawGrid(ctx);
    else drawBinom(ctx);
    if (kb && kb.focused()) drawFocus(ctx);
  }

  // =====================================================================
  // 讀數與算式
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  const eqKey = {};
  function setEq(id, tex) {
    if (eqKey[id] === tex) return;
    eqKey[id] = tex;
    const el = $(id);
    if (!tex) { el.textContent = ''; return; }
    if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
    else el.textContent = tex;
  }
  function updateReadouts() {
    if (state.mode === 'tri') {
      const sel = state.sel && state.sel.n < state.tn ? state.sel : null;
      if (sel) {
        const v = P.C(sel.n, sel.k);
        setHTML('rCell', T('第 ' + sel.n + ' 列第 ' + sel.k + ' 個：', 'row ' + sel.n + ', position ' + sel.k + ': ') + htmlC(sel.n, sel.k));
        setHTML('rVal', P.group(v));
        setHTML('rRow', '2<sup>' + sel.n + '</sup> = ' + P.group(P.pow2(sel.n)));
        setHTML('rMod', String(v % BigInt(state.tm)) + T('（m = ', ' (m = ') + state.tm + T('）', ')'));
        if (sel.n === 0 || sel.k === 0 || sel.k === sel.n) setEq('rEq', 'C^{' + sel.n + '}_{' + sel.k + '} = 1');
        else setEq('rEq', 'C^{' + sel.n + '}_{' + sel.k + '} = C^{' + (sel.n - 1) + '}_{' + (sel.k - 1) + '} + C^{' + (sel.n - 1) + '}_{' + sel.k + '} = ' + texNum(P.C(sel.n - 1, sel.k - 1)) + ' + ' + texNum(P.C(sel.n - 1, sel.k)) + ' = ' + texNum(v));
        setEq('rEq2', 'C^{' + sel.n + '}_{' + sel.k + '} = \\frac{' + sel.n + '!}{' + sel.k + '!\\,' + (sel.n - sel.k) + '!}');
      } else {
        ['rCell', 'rVal', 'rRow', 'rMod'].forEach(function (id) { setHTML(id, '—'); });
        setEq('rEq', 'C^{n}_{k} = C^{n-1}_{k-1} + C^{n-1}_{k}');
        setEq('rEq2', 'C^{n}_{k} = \\frac{n!}{k!\\,(n-k)!}');
      }
    } else if (state.mode === 'grid') {
      const q = QG(), hide = !!state.chal;
      setHTML('rCount', hide ? '?' : String(q.count));
      setHTML('rTotal', hide ? '?' : htmlC(q.m + q.n, q.m) + ' = ' + q.total);
      setHTML('rBlocks', String(q.nb));
      const steps = state.path.length - 1;
      setHTML('rPath', hide ? '—' : T(steps + ' / ' + (q.m + q.n) + ' 步', steps + ' / ' + (q.m + q.n) + ' steps'));
      if (hide) { setEq('rEq', 'W(i, j) = W(i-1, j) + W(i, j-1)'); setEq('rEq2', ''); }
      else {
        if (q.nb === 0) setEq('rEq', '\\frac{(' + q.m + '+' + q.n + ')!}{' + q.m + '!\\,' + q.n + '!} = C^{' + (q.m + q.n) + '}_{' + q.m + '} = ' + q.total);
        else if (q.nb === 1) {
          const b = Array.from(q.blocked)[0].split(',').map(Number);
          setEq('rEq', 'C^{' + (q.m + q.n) + '}_{' + q.m + '} - C^{' + (b[0] + b[1]) + '}_{' + b[0] + '}\\,C^{' + (q.m - b[0] + q.n - b[1]) + '}_{' + (q.m - b[0]) + '} = ' + q.total + ' - ' + P.through(q.m, q.n, b[0], b[1]) + ' = ' + q.count);
        } else setEq('rEq', 'W(i, j) = W(i-1, j) + W(i, j-1),\\quad W(B) = ' + q.count);
        if (state.path.length > 1) {
          let s = '';
          for (let t = 1; t < state.path.length; t++) s += state.path[t][0] > state.path[t - 1][0] ? '\\rightarrow' : '\\uparrow';
          setEq('rEq2', '\\text{' + T('路徑', 'route') + '：}\\;' + s);
        } else setEq('rEq2', '');
      }
    } else {
      const q = QB(), a = state.ba, b = state.bb, n = state.bn;
      const lhs = '(' + (a === 0 ? '0' : a === 1 ? '' : a === -1 ? '-' : a) + (a === 0 ? '' : 'x') + (b === 0 ? '' : b > 0 ? '+' + b : String(b)) + ')^{' + n + '}';
      setEq('rEq', lhs + ' = ' + P.expandTex(a, b, n));
      const k = state.selK != null && state.selK <= n ? state.selK : null;
      if (k != null) {
        const v = q.coefs[k];
        const par = function (x) { return x < 0 ? '(' + neg(x) + ')' : String(x); };
        setHTML('rTerm', htmlC(n, k) + (k ? ' · ' + htmlPow(par(a), k) : '') + (n - k ? ' · ' + htmlPow(par(b), n - k) : '') + ' = ' + neg(P.group(v)));
        setEq('rEq2', 'C^{' + n + '}_{' + k + '}\\,(' + a + ')^{' + k + '}\\,(' + b + ')^{' + (n - k) + '} = ' + P.Cn(n, k) + '\\cdot' + (Math.pow(a, k) < 0 ? '(' + Math.pow(a, k) + ')' : Math.pow(a, k)) + '\\cdot' + (Math.pow(b, n - k) < 0 ? '(' + Math.pow(b, n - k) + ')' : Math.pow(b, n - k)) + ' = ' + texNum(v).replace(/^-/, '-'));
      } else {
        setHTML('rTerm', '—');
        setEq('rEq2', 'C^{n}_{k}\\,a^{k}\\,b^{\\,n-k}\\,x^{k}');
      }
      setHTML('rSum', state.sub === 1 ? '(' + neg(a) + ' + ' + neg(b) + ')<sup>' + n + '</sup> = ' + neg(P.group(q.sum)) : '—');
      setHTML('rAlt', state.sub === -1 ? '(' + neg(b) + ' − ' + neg(a) + ')<sup>' + n + '</sup> = ' + neg(P.group(q.alt)) : '—');
    }
    setHTML('status', statusText());
  }
  function statusText() {
    if (state.mode === 'tri') {
      if (state.sel && state.sel.n < state.tn) {
        const s = state.sel;
        if (s.n === 0 || s.k === 0 || s.k === s.n) return T('邊上都是 1：從 n 個裡選 0 個或選全部，都只有一種選法。', 'The edges are all 1: there is only one way to choose none or all of n things.');
        return T('上面兩格加起來就是這一格；同一個數在別處出現時用虛線框起來。', 'The two cells above add up to this one; the same number elsewhere gets a dashed outline.');
      }
      if (state.color && state.tm === 2) return T('奇數上色、偶數留白：列數越多，三角形裡的三角形越清楚。', 'Odd numbers coloured, even ones left pale: the more rows, the clearer the triangles inside triangles.');
      return T('點一格，看它是上面哪兩格相加。', 'Tap a cell to see which two cells above add up to it.');
    }
    if (state.mode === 'grid') {
      if (state.chal) return T('在心裡逐點加：每個點的走法數 = 左邊 + 下面；路障是 0。', 'Add point by point in your head: ways to a point = ways from the left + ways from below; a block counts 0.');
      const q = QG(), end = state.path[state.path.length - 1];
      if (q.count === 0) return T('路障把 A 和 B 隔開了，一條路也沒有。', 'The blocks cut A off from B: there is no route at all.');
      if (end[0] === q.m && end[1] === q.n) return T('到 B 了！這是 ' + q.count + ' 條路裡的一條：' + q.m + ' 個「右」和 ' + q.n + ' 個「上」的一種排法。', 'At B! This is one of the ' + q.count + ' routes — one way to arrange ' + q.m + ' “right” and ' + q.n + ' “up” steps.');
      if (state.tool === 'block') return T('點格子上的點放路障，再點一次拿掉；每個點的數字跟著重算。', 'Tap a point to place a block, tap again to remove it; every number is recounted.');
      return T('每個點的數字 = 左邊的數 + 下面的數，就是轉了 45° 的巴斯卡三角形。', 'Each number = the number to its left + the number below: Pascal’s triangle turned 45°.');
    }
    if (state.sub === 1) return T('x = 1 讓每一項只剩係數，所以加起來就是 (a + b)<sup>n</sup>。', 'x = 1 leaves just the coefficients, so their sum is (a + b)<sup>n</sup>.');
    if (state.sub === -1) return T('x = −1 讓奇數次項變號（長條翻到下面），加起來是 (b − a)<sup>n</sup>。', 'x = −1 flips the sign of the odd powers (the bars flip), and the total is (b − a)<sup>n</sup>.');
    return T('每一項的係數 = 巴斯卡三角形的數 × a 的次方 × b 的次方。', 'Each coefficient = a number from Pascal’s triangle × a power of a × a power of b.');
  }

  // =====================================================================
  // 音效
  // =====================================================================
  function sound() { return window.LabSound && window.LabSound.enabled() ? window.LabSound : null; }
  function chime(ok) {
    const S = sound(); if (!S) return;
    if (ok) {
      S.tone({ freq: 659.25, dur: 0.16, type: 'sine', gain: 0.26 });
      S.tone({ freq: 987.77, dur: 0.24, type: 'sine', gain: 0.22, delay: 0.11 });
    } else S.tone({ freq: 311.13, dur: 0.14, type: 'triangle', gain: 0.2 });
  }
  function blip(freq, type, gain) { const S = sound(); if (S) S.tone({ freq: freq, dur: 0.09, type: type || 'triangle', gain: gain || 0.14 }); }
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
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitTri() { emit('tri', { rows: state.tn, mod: state.color ? state.tm : null }); }
  function emitCell() {
    const s = state.sel; if (!s) return;
    emit('cell', { n: s.n, k: s.k, value: String(P.C(s.n, s.k)), mod: state.color ? state.tm : null, rows: state.tn });
  }
  function emitGrid() { const q = QG(); emit('grid', { m: q.m, n: q.n, nb: q.nb, count: q.count, total: q.total }); }
  function emitBinom() { emit('binom', { a: state.ba, b: state.bb, n: state.bn, coefs: QB().coefs.slice(), sub: state.sub }); }

  // =====================================================================
  // 控制項
  // =====================================================================
  const lab = $('lab');
  const el = { tn: $('tn'), tm: $('tm'), gm: $('gm'), gn: $('gn'), ba: $('ba'), bb: $('bb'), bn: $('bn') };
  function readAll() { Object.keys(el).forEach(function (k) { state[k] = Math.round(val(el[k])); }); }
  function refreshOutputs() { Object.keys(el).forEach(function (k) { $(el[k].id + 'o').textContent = neg(state[k]); }); }
  /** 格子變小時，拿掉跑到格子外的路障與路徑 */
  function fitGrid() {
    const m = state.gm, n = state.gn;
    Array.from(state.blocks).forEach(function (key) {
      const p = key.split(',').map(Number);
      if (p[0] > m || p[1] > n || (p[0] === m && p[1] === n)) state.blocks.delete(key);
    });
    let cut = state.path.length;
    for (let t = 0; t < state.path.length; t++) {
      const p = state.path[t];
      if (p[0] > m || p[1] > n || state.blocks.has(P.key(p[0], p[1]))) { cut = t; break; }
    }
    state.path = state.path.slice(0, Math.max(1, cut));
  }
  function changed(final, src) {
    const prev = { gm: state.gm, gn: state.gn, ba: state.ba, bb: state.bb, bn: state.bn };
    readAll();
    if (prev.gm !== state.gm || prev.gn !== state.gn) { fitGrid(); state.path = [[0, 0]]; state.anim = null; }
    if (prev.ba !== state.ba || prev.bb !== state.bb || prev.bn !== state.bn) state.sub = null;
    if (state.selK != null && state.selK > state.bn) state.selK = null;
    refreshOutputs(); updateReadouts(); requestDraw();
    if (final) {
      if (src === 'tri') emitTri();
      else if (src === 'grid') emitGrid();
      else if (src === 'binom') emitBinom();
    }
  }
  const srcOf = { tn: 'tri', tm: 'tri', gm: 'grid', gn: 'grid', ba: 'binom', bb: 'binom', bn: 'binom' };
  Object.keys(el).forEach(function (k) {
    el[k].addEventListener('input', function () { if (!applying) changed(false, srcOf[k]); });
    el[k].addEventListener('change', function () { if (!applying) { changed(true, srcOf[k]); blip(srcOf[k] === 'tri' ? 392 : 440); } });
  });
  function setSlider(e, v) {
    applying = true;
    if (window.LabNum) window.LabNum.set(e, v); else e.value = v;
    applying = false;
  }
  $('colorC').addEventListener('change', function () {
    state.color = $('colorC').checked;
    updateReadouts(); requestDraw(); emitTri();
    blip(state.color ? 523.25 : 392);
  });
  $('waysC').addEventListener('change', function () { state.ways = $('waysC').checked; requestDraw(); });
  function setMode(m) {
    if (m === state.mode) return;
    if (state.chal) quitChal(true);
    state.mode = m;
    lab.setAttribute('data-mode', m);
    document.querySelectorAll('.modes button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)); });
    for (const id in eqKey) delete eqKey[id];
    updateReadouts(); requestDraw();
    if (m === 'tri') emitTri(); else if (m === 'grid') emitGrid(); else emitBinom();
  }
  document.querySelectorAll('.modes button').forEach(function (b) { b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); }); });
  function setTool(t) {
    state.tool = t;
    document.querySelectorAll('.tools button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tool') === t)); });
    updateReadouts(); requestDraw();
  }
  document.querySelectorAll('.tools button').forEach(function (b) { b.addEventListener('click', function () { setTool(b.getAttribute('data-tool')); }); });

  // ---------- 三角形：選格 ----------
  function selectCell(n, k) {
    state.sel = { n: n, k: k };
    updateReadouts(); requestDraw();
    emitCell();
    const S = sound();
    if (S) {
      // 越靠中間（數越大）音越高
      const t = n ? k / n : 0.5;
      S.tone({ freq: 392 * Math.pow(2, (1 - Math.abs(t - 0.5) * 2) * 0.75), dur: 0.1, type: 'sine', gain: 0.18 });
    }
  }

  // ---------- 走格子：路徑與路障 ----------
  function pathEnd() { return state.path[state.path.length - 1]; }
  function reachedB() { const e = pathEnd(); return e[0] === state.gm && e[1] === state.gn; }
  /** 從路徑終點往 (i, j) 走：同一行或同一列、方向向右或向上、中間沒有路障，可以一次走好幾步 */
  function extendTo(i, j) {
    const e = pathEnd();
    const di = i - e[0], dj = j - e[1];
    if (!((di > 0 && dj === 0) || (di === 0 && dj > 0))) return false;
    const pts = [];
    for (let t = 1; t <= di + dj; t++) {
      const p = [e[0] + (di ? t : 0), e[1] + (dj ? t : 0)];
      if (state.blocks.has(P.key(p[0], p[1]))) return false;
      pts.push(p);
    }
    state.path = state.path.concat(pts);
    return true;
  }
  function stepPath(i, j) {
    if (state.chal) return;
    state.anim = null;
    const idx = state.path.findIndex(function (p) { return p[0] === i && p[1] === j; });
    if (idx >= 0) {
      if (idx === state.path.length - 1) return;
      state.path = state.path.slice(0, idx + 1);
      blip(330);
    } else if (!extendTo(i, j)) {
      chime(false);
      setHTML('status', T('只能從路徑的終點向右或向上走，而且不能穿過路障。', 'You can only go right or up from the end of the route, and not through a block.'));
      requestDraw();
      return;
    } else {
      const S = sound();
      if (S) S.tone({ freq: 330 * Math.pow(2, (state.path.length - 1) / (state.gm + state.gn)), dur: 0.09, type: 'sine', gain: 0.18 });
      if (reachedB()) { chime(true); emit('path', { m: state.gm, n: state.gn, nb: state.blocks.size }); }
    }
    updateReadouts(); requestDraw();
  }
  function toggleBlock(i, j) {
    if (state.chal) return;
    if ((i === 0 && j === 0) || (i === state.gm && j === state.gn)) {
      chime(false);
      setHTML('status', T('起點 A 和終點 B 不能放路障。', 'A and B cannot be blocked.'));
      return;
    }
    const k = P.key(i, j);
    if (state.blocks.has(k)) { state.blocks.delete(k); blip(523.25); }
    else { state.blocks.add(k); blip(262, 'square', 0.1); }
    fitGrid();
    state.anim = null;
    updateReadouts(); requestDraw();
    emitGrid();
  }
  $('randPath').addEventListener('click', function () {
    if (state.chal) return;
    const p = P.randomPath(state.gm, state.gn, state.blocks, rand);
    if (!p) { chime(false); setHTML('status', T('路障把 A 和 B 隔開了，找不到路。', 'The blocks cut A off from B: there is no route.')); return; }
    state.path = p;
    state.anim = { t0: performance.now(), dur: D.reducedMotion() ? 1 : 140 * (p.length - 1) };
    const S = sound();
    if (S) for (let t = 1; t < p.length; t++) S.tone({ freq: 330 * Math.pow(2, t / (p.length - 1)), dur: 0.07, type: 'sine', gain: 0.14, delay: t * 0.14 * (D.reducedMotion() ? 0 : 1) });
    updateReadouts(); requestDraw();
  });
  $('clearPath').addEventListener('click', function () { state.path = [[0, 0]]; state.anim = null; updateReadouts(); requestDraw(); blip(392); });
  $('clearBlocks').addEventListener('click', function () {
    if (state.chal || !state.blocks.size) return;
    state.blocks.clear(); updateReadouts(); requestDraw(); emitGrid(); blip(392);
  });

  // ---------- 二項式：代入 ----------
  function substitute(x) {
    state.sub = x;
    updateReadouts(); requestDraw();
    emitBinom();
    chime(true);
  }
  $('sub1').addEventListener('click', function () { substitute(1); });
  $('subm1').addEventListener('click', function () { substitute(-1); });
  function selectTerm(k) {
    state.selK = k;
    updateReadouts(); requestDraw();
    blip(330 * Math.pow(2, k / Math.max(1, state.bn)), 'sine', 0.16);
  }

  // ---------- 全部清除 ----------
  $('clear').addEventListener('click', function () {
    if (state.chal) quitChal(true);
    state.log = []; state.streak = []; state.round = 0; lastChal = null;
    state.sel = null; state.path = [[0, 0]]; state.anim = null; state.blocks.clear(); state.sub = null; state.selK = null;
    setChalMsg(''); renderLog();
    for (const id in eqKey) delete eqKey[id];
    updateReadouts(); requestDraw();
    blip(392);
  });

  // ---------- 點畫布 ----------
  function posOf(ev) { const rc = cv.getBoundingClientRect(); return { px: ev.clientX - rc.left, py: ev.clientY - rc.top }; }
  cv.addEventListener('pointerdown', function (ev) {
    if (!F) return;
    const p = posOf(ev);
    if (state.mode === 'tri') {
      const h = triHit(p.px, p.py);
      if (!h) return;
      ev.preventDefault(); selectCell(h.n, h.k);
    } else if (state.mode === 'grid') {
      const h = gridHit(p.px, p.py);
      if (!h || state.chal) return;
      ev.preventDefault();
      if (state.tool === 'block') toggleBlock(h[0], h[1]); else stepPath(h[0], h[1]);
    } else {
      const k = binomHit(p.px, p.py);
      if (k == null) return;
      ev.preventDefault(); selectTerm(k);
    }
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!F) return;
    const p = posOf(ev);
    const hov = state.mode === 'tri' ? !!triHit(p.px, p.py) : state.mode === 'grid' ? !state.chal && !!gridHit(p.px, p.py) : binomHit(p.px, p.py) != null;
    cv.style.cursor = hov ? 'pointer' : 'default';
  });

  // ---------- 鍵盤 ----------
  let kb = null;
  function clampv(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('巴斯卡三角形畫布。Enter 切換要操作的東西，方向鍵移動。三角形：選格子或改列數；走格子：右、上走一步，左、下退一步，或改格子大小；二項式：選一項或改 n。', 'Pascal’s triangle canvas. Enter picks what to operate; the arrow keys move it. Triangle: pick a cell or change the rows; grid: right or up takes a step, left or down goes back, or resize the grid; binomial: pick a term or change n.'),
      items: [{
        name: function () { return state.mode === 'tri' ? T('選取的格', 'selected cell') : state.mode === 'grid' ? T('路徑', 'route') : T('選取的項', 'selected term'); },
        move: function (dx, dy) {
          if (state.mode === 'tri') {
            const N = state.tn;
            let s = state.sel && state.sel.n < N ? { n: state.sel.n, k: state.sel.k } : { n: Math.min(4, N - 1), k: Math.min(2, Math.min(4, N - 1)) };
            if (state.sel && state.sel.n < N) {
              if (dx) s.k = clampv(s.k + dx, 0, s.n);
              if (dy) { s.n = clampv(s.n - dy, 0, N - 1); s.k = Math.min(s.k, s.n); }
            }
            selectCell(s.n, s.k); return true;
          }
          if (state.mode === 'grid') {
            if (state.chal) return false;
            const e = pathEnd();
            if (dx > 0 || dy > 0) stepPath(e[0] + (dx > 0 ? 1 : 0), e[1] + (dx > 0 ? 0 : 1));
            else if (state.path.length > 1) { const q = state.path[state.path.length - 2]; stepPath(q[0], q[1]); }
            return true;
          }
          const v = dx || -dy; if (!v) return false;
          selectTerm(clampv(state.selK == null ? state.bn : state.selK - v, 0, state.bn));
          return true;
        },
        describe: function () {
          if (state.mode === 'tri') { const s = state.sel; return s ? T('第 ' + s.n + ' 列第 ' + s.k + ' 個 = ', 'row ' + s.n + ', position ' + s.k + ' = ') + P.group(P.C(s.n, s.k)) : T('還沒選', 'none'); }
          if (state.mode === 'grid') { const e = pathEnd(); return '(' + e[0] + ', ' + e[1] + ')' + T('，共 ', ', ') + QG().count + T(' 條路', ' routes'); }
          return state.selK == null ? T('還沒選', 'none') : T('x 的 ' + state.selK + ' 次項係數 ', 'coefficient of x to the power ' + state.selK + ': ') + neg(QB().coefs[state.selK]);
        }
      }, {
        name: function () { return state.mode === 'tri' ? T('列數', 'rows') : state.mode === 'grid' ? T('格子大小', 'grid size') : 'n'; },
        move: function (dx, dy, big) {
          if (state.mode === 'tri') { const v = dx || dy; if (!v) return false; setSlider(el.tn, clampv(state.tn + v * (big ? 8 : 1), 1, 64)); changed(true, 'tri'); return true; }
          if (state.mode === 'grid') {
            if (state.chal) return false;
            if (dx) setSlider(el.gm, clampv(state.gm + dx, 1, 8));
            if (dy) setSlider(el.gn, clampv(state.gn + dy, 1, 8));
            changed(true, 'grid'); return true;
          }
          const v = dx || dy; if (!v) return false; setSlider(el.bn, clampv(state.bn + v, 0, 10)); changed(true, 'binom'); return true;
        },
        describe: function () {
          if (state.mode === 'tri') return T(state.tn + ' 列', state.tn + ' rows');
          if (state.mode === 'grid') return state.gm + ' × ' + state.gn;
          return 'n = ' + state.bn;
        }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 挑戰
  // =====================================================================
  const chalMsg = $('chalMsg');
  function setChalMsg(msg, ok) { chalMsg.textContent = msg || ''; chalMsg.classList.toggle('ok', !!ok); }
  function lockGrid(on) { ['gm', 'gn'].forEach(function (k) { el[k].disabled = on; }); ['randPath', 'clearPath', 'clearBlocks'].forEach(function (id) { $(id).disabled = on; }); }
  function renderOpts() {
    const box = $('opts');
    const chg = state.chal;
    if (!chg) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = '';
    chg.options.forEach(function (v, i) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = String(v);
      b.setAttribute('aria-label', T('答案 ', 'Answer ') + v);
      if (chg.wrong[i]) { b.classList.add('wrong'); b.disabled = true; }
      b.addEventListener('click', function () { answer(i); });
      box.appendChild(b);
    });
  }
  function startChal(forced) {
    if (state.mode !== 'grid') setMode('grid');
    const chg = forced || P.genChallenge(rand, lastChal);
    if (!chg) { setChalMsg(T('出不了題，請再按一次。', 'Could not make a challenge; please try again.')); return; }
    state.round++;
    const set = new Set(chg.blocks.map(function (b) { return P.key(b[0], b[1]); }));
    state.chal = { m: chg.m, n: chg.n, blocks: chg.blocks, set: set, count: chg.count, options: chg.options, answer: chg.answer, wrong: {}, t0: performance.now(), round: state.round };
    lastChal = chg;
    lockGrid(true);
    setChalMsg(T('第 ' + state.round + ' 題：從 A 到 B（只能向右、向上）有幾條最短路徑？', 'Challenge ' + state.round + ': how many shortest routes (right and up only) from A to B?'));
    $('quitChal').hidden = false;
    $('newChal').textContent = T('換一題', 'Another one');
    renderOpts();
    for (const id in eqKey) delete eqKey[id];
    updateReadouts(); requestDraw();
  }
  /** 答對後把題目的格子留在畫面上，數字打開，讓學生對照 */
  function revealChal(chg) {
    setSlider(el.gm, chg.m); setSlider(el.gn, chg.n);
    state.gm = chg.m; state.gn = chg.n;
    state.blocks = new Set(chg.set); state.path = [[0, 0]]; state.anim = null;
    refreshOutputs();
  }
  function answer(i) {
    const chg = state.chal;
    if (!chg || chg.wrong[i]) return;
    if (i !== chg.answer) {
      chg.wrong[i] = true;
      state.streak = [];
      chime(false);
      setChalMsg(T('不對喔，再算一次：每個點 = 左邊 + 下面。（連續答對重新計算）', 'Not quite — recount: each point = left + below. (The streak starts over.)'));
      renderOpts();
      return;
    }
    const time = (performance.now() - chg.t0) / 1000;
    const first = !Object.keys(chg.wrong).length;
    state.log.push({ round: chg.round, size: chg.m + ' × ' + chg.n, nb: chg.blocks.length, count: chg.count, time: time, first: first });
    state.streak.push(time);
    const last3 = state.streak.length >= 3 ? state.streak.slice(-3).reduce(function (s, x) { return s + x; }, 0) : null;
    state.chal = null;
    lockGrid(false);
    revealChal(chg);
    $('quitChal').hidden = true;
    $('newChal').textContent = T('出下一題', 'Next challenge');
    renderOpts();
    setChalMsg(T('答對了！共 ' + chg.count + ' 條路，用了 ', 'Correct! ' + chg.count + ' routes, in ') + time.toFixed(1) + T(' 秒。數字已經寫在格子上。', ' s. The counts are now shown on the grid.'), true);
    chime(true);
    renderLog();
    for (const id in eqKey) delete eqKey[id];
    updateReadouts(); requestDraw();
    emit('challenge', { time: time, streak: state.streak.length, last3: last3 });
  }
  function quitChal(silent) {
    const chg = state.chal;
    if (!chg) return;
    state.log.push({ round: chg.round, size: chg.m + ' × ' + chg.n, nb: chg.blocks.length, count: chg.count, time: null });
    state.chal = null; state.streak = [];
    lockGrid(false);
    $('quitChal').hidden = true;
    $('newChal').textContent = T('出一題', 'New challenge');
    renderOpts();
    setChalMsg(silent ? '' : T('這題放棄了，答案是 ' + chg.count + ' 條；連續答對重新計算。', 'Given up. The answer was ' + chg.count + '; the streak starts over.'));
    renderLog();
    for (const id in eqKey) delete eqKey[id];
    updateReadouts(); requestDraw();
  }
  $('newChal').addEventListener('click', function () { if (state.chal) quitChal(true); startChal(); });
  $('quitChal').addEventListener('click', function () { quitChal(false); });
  function renderLog() {
    const t = $('log');
    $('logEmpty').hidden = state.log.length > 0;
    if (!state.log.length) { t.innerHTML = ''; return; }
    let h = '<tr><th>' + T('題', '#') + '</th><th>' + T('格子', 'grid') + '</th><th>' + T('路障', 'blocks') + '</th><th>' + T('路徑數', 'routes') + '</th><th>' + T('秒', 's') + '</th></tr>';
    state.log.slice(-8).reverse().forEach(function (r) {
      h += '<tr><td>' + r.round + '</td><td>' + r.size + '</td><td>' + r.nb + '</td><td>' + r.count + '</td><td>' + (r.time == null ? T('放棄', 'gave up') : r.time.toFixed(1) + (r.first ? '' : '*')) + '</td></tr>';
    });
    t.innerHTML = h;
  }

  // 給測試用的介面（不影響畫面）
  window.__pas = {
    state: state, QG: QG, QB: QB,
    startChal: function (c) { startChal(c); },
    answer: function (i) { answer(i); },
    seed: function (s) { rand = P.rng(s); },
    frame: function () { return F; },
    triLayout: function () { return triLayout(); },
    gridLayout: function () { return gridLayout(); },
    binomLayout: function () { return binomLayout(); }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  readAll();
  state.color = $('colorC').checked;
  state.ways = $('waysC').checked;
  refreshOutputs();
  renderLog();
  updateSoundButton();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    for (const id in eqKey) delete eqKey[id];
    renderLog(); refreshOutputs(); updateReadouts(); updateSoundButton(); renderOpts();
    $('newChal').textContent = state.chal ? T('換一題', 'Another one') : state.log.length ? T('出下一題', 'Next challenge') : T('出一題', 'New challenge');
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'lang') themeChanged(); });
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe($('stage'));
  } else window.addEventListener('resize', resize);
  resize();
  updateReadouts();
})();
