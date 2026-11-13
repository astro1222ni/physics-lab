/* graph-traversal.js — 「圖的走訪：DFS 與 BFS 走迷宮」的畫面與互動（計算在 graph-traversal-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 兩種搜尋都先由核心完整跑一遍、記下每一步（trace）；畫面用同一個步數 k 並排播放，格子立刻改變（動畫只是裝飾）。
 * 迷宮的繪製分層：每個面板一張離屏畫布放「地板＋拜訪狀態」（每一步只重畫改變的格子），一張共用的離屏畫布放立體的牆；
 * 每一幀只把兩層貼上，再畫堆疊的路、佇列的圈、起點終點與波紋，所以 40 × 40 的迷宮也能流暢播放。
 * 任務事件只在使用者按「單步」「播放」「直接跑完」之後送出（見 js/missions/graph-traversal.js 開頭的說明）。
 */
(function () {
  'use strict';
  const G = window.GraphTraversalCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const setSlider = function (el, v) { if (window.LabNum) window.LabNum.clear(el); el.value = String(v); };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const alpha = D.alpha, shade = D.shade, mix = D.mix;
  const clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };

  // ======================= 狀態 =======================
  const state = {
    mode: 'maze', early: true, nums: true, draw: false,
    mz: { n: 12, gen: 'dfs', seed: 1, loops: 0, order: 'NESW', s: 0, t: 143, edits: 0, m: null },
    gr: { preset: 'sample', V: 8, seed: 1, rev: false, s: 0, edits: 0, g: null },
    trD: null, trB: null, L: 0, k: 0, stD: null, stB: null, pre: null, info: null,
    playing: false, acc: 0, speed: 8, manual: true, done: false, report: null,
    log: [], fx: [], hover: null, drag: null
  };

  // ======================= 色彩與名稱 =======================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface',
      'gt-dfs', 'gt-dfs-deep', 'gt-bfs', 'gt-bfs-deep', 'gt-path', 'gt-wall', 'gt-floor-a', 'gt-floor-b', 'gt-start', 'gt-goal', 'gt-edge', 'gt-node']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + px + 'px ' + FONT; }
  function isMaze() { return state.mode === 'maze'; }
  function nOf() { return state.mz.n; }
  function V() { return isMaze() ? state.mz.n * state.mz.n : state.gr.g.V; }
  function nameOf(i) {
    if (i < 0) return '';
    if (!isMaze()) return state.gr.g.names[i];
    const n = nOf();
    return '(' + (((i / n) | 0) + 1) + ', ' + (i % n + 1) + ')';
  }
  const DIR_ZH = ['上', '右', '下', '左'], DIR_EN = ['up', 'right', 'down', 'left'];
  function dirBetween(a, b) { const n = nOf(), dr = ((b / n) | 0) - ((a / n) | 0), dc = b % n - a % n; return dr < 0 ? 0 : dc > 0 ? 1 : dr > 0 ? 2 : 3; }
  function orderName(o) {
    const zh = o.split('').map(function (c) { return DIR_ZH['NESW'.indexOf(c)]; }).join('');
    const en = o.split('').map(function (c) { return DIR_EN['NESW'.indexOf(c)]; }).join(', ');
    const cw = ['NESW', 'ESWN', 'SWNE', 'WNES'].indexOf(o) >= 0;
    return T(zh + (cw ? '（順時針）' : '（逆時針）'), en.charAt(0).toUpperCase() + en.slice(1));
  }
  function genName(g) { return g === 'dfs' ? T('隨機 DFS', 'Random DFS') : g === 'prim' ? T('隨機 Prim', 'Random Prim') : T('空地', 'Open field'); }

  // ======================= 版面 =======================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  const stage = $('stage');
  let dpr = 1, cw = 320, ch = 560, L = null;
  const HEAD = 30, PAD = 6;
  function layout() {
    const w = cw, side = w >= 600, gap = side ? 14 : 12;
    const pw = side ? (w - gap) / 2 : w;
    if (isMaze()) {
      const n = nOf();
      const S0 = Math.min(pw - 2 * PAD, side ? 560 : 520);
      const cs = Math.max(2, Math.floor(S0 / n * 2) / 2), S = cs * n;
      const ph = HEAD + S + 2 * PAD;
      const panels = [0, 1].map(function (p) {
        const x = side ? p * (pw + gap) : 0, y = side ? 0 : p * (ph + gap);
        return { x: x, y: y, w: pw, h: ph, mx: x + (pw - S) / 2, my: y + HEAD + PAD };
      });
      return { side: side, H: side ? ph : 2 * ph + gap, panels: panels, cs: cs, S: S };
    }
    const A = Math.min(pw - 2 * PAD, side ? 400 : 330), ph = HEAD + A + 2 * PAD;
    const panels = [0, 1].map(function (p) {
      const x = side ? p * (pw + gap) : 0, y = side ? 0 : p * (ph + gap);
      return { x: x, y: y, w: pw, h: ph, mx: x + (pw - A) / 2, my: y + HEAD + PAD };
    });
    return { side: side, H: side ? ph : 2 * ph + gap, panels: panels, A: A, R: clamp(A * 0.052, 13, 19) };
  }
  function resize() {
    const w = cv.clientWidth;
    if (!w || !state.trD) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layout();
    ch = L.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    layers = null; wallCv = null;
    resizeChart();
    requestDraw();
  }

  // ======================= 迷宮的離屏圖層 =======================
  let layers = null, wallCv = null, pats = null;
  const dirty = [null, null];   // 'all' 或要重畫的格子集合
  function markAll() { dirty[0] = 'all'; dirty[1] = 'all'; }
  function markCells(p, cells) {
    if (dirty[p] === 'all') return;
    if (!dirty[p]) dirty[p] = new Set();
    cells.forEach(function (i) { dirty[p].add(i); });
    if (dirty[p].size > V() / 3) dirty[p] = 'all';
  }
  /** 花紋（DFS 斜線、BFS 圓點）：用裝置像素畫小圖，再把 pattern 縮回 CSS 像素，手機上也清楚 */
  function makePatterns() {
    const P = 6, dp = Math.max(1, dpr);
    const mk = function (draw) {
      const c = document.createElement('canvas');
      c.width = Math.round(P * dp); c.height = Math.round(P * dp);
      const g = c.getContext('2d');
      g.scale(dp, dp);
      draw(g);
      const pat = ctx.createPattern(c, 'repeat');
      if (pat && pat.setTransform && window.DOMMatrix) pat.setTransform(new DOMMatrix().scale(1 / dp));
      return pat;
    };
    const ink = alpha('#ffffff', D.dark ? 0.26 : 0.42);
    pats = {
      stripe: mk(function (g) {
        g.strokeStyle = ink; g.lineWidth = 1.5; g.lineCap = 'square';
        g.beginPath();
        for (let k = -1; k <= 1; k++) { g.moveTo(k * P, P); g.lineTo(k * P + P, 0); }
        g.stroke();
      }),
      dots: mk(function (g) {
        g.fillStyle = alpha('#ffffff', D.dark ? 0.34 : 0.55);
        g.beginPath(); g.arc(P / 2, P / 2, 1.15, 0, Math.PI * 2); g.fill();
      })
    };
  }
  function ensureLayers() {
    if (!isMaze()) return;
    const S = L.S, px = Math.max(1, Math.round(S * dpr));
    if (!layers || layers[0].width !== px) {
      layers = [0, 1].map(function () { const c = document.createElement('canvas'); c.width = px; c.height = px; return c; });
      markAll();
    }
    if (!pats) makePatterns();
  }
  function cellColor(p, i) {
    const st = p === 0 ? state.stD : state.stB, s = st.status[i];
    if (!s) return null;
    if (p === 0) return s === 1 ? C['gt-dfs'] : mix(C['gt-dfs'], C['gt-floor-a'], 0.5);
    const dmax = Math.max(1, state.trB.stats.depth), u = st.dist[i] / dmax;
    const base = mix(C['gt-bfs-deep'], C['gt-bfs'], Math.min(1, u * 1.4));
    return s === 1 ? base : mix(base, C['gt-floor-a'], 0.18 + 0.42 * u);
  }
  function paintCell(g, p, i) {
    const n = nOf(), cs = L.cs, r = (i / n) | 0, c = i % n, x = c * cs, y = r * cs;
    g.fillStyle = ((r + c) & 1) ? C['gt-floor-b'] : C['gt-floor-a'];
    g.fillRect(x, y, cs, cs);
    const col = cellColor(p, i);
    if (!col) return;
    const ins = cs >= 12 ? 1 : 0;
    g.fillStyle = col;
    g.fillRect(x + ins, y + ins, cs - 2 * ins, cs - 2 * ins);
    g.fillStyle = p === 0 ? pats.stripe : pats.dots;
    g.fillRect(x + ins, y + ins, cs - 2 * ins, cs - 2 * ins);
    if (state.nums && cs >= 17) {
      const st = p === 0 ? state.stD : state.stB;
      const txt = String(p === 0 ? st.num[i] : st.dist[i]);
      const fs = Math.min(12.5, cs * 0.4) * (txt.length > 3 ? 0.82 : 1);
      g.font = fnt(fs.toFixed(1), 600);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 2.6; g.lineJoin = 'round';
      g.strokeStyle = alpha(D.dark ? '#000000' : '#ffffff', D.dark ? 0.55 : 0.7);
      g.strokeText(txt, x + cs / 2, y + cs / 2 + 0.5);
      g.fillStyle = D.dark ? '#f8fafc' : '#1f2937';
      g.fillText(txt, x + cs / 2, y + cs / 2 + 0.5);
    }
  }
  function refreshLayers() {
    if (!isMaze()) return;
    ensureLayers();
    [0, 1].forEach(function (p) {
      const d = dirty[p];
      if (!d) return;
      const g = layers[p].getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (d === 'all') { const N = V(); for (let i = 0; i < N; i++) paintCell(g, p, i); }
      else d.forEach(function (i) { paintCell(g, p, i); });
      dirty[p] = null;
    });
    if (!wallCv) buildWalls();
  }
  /** 牆的寬度與高度（隨格子大小，畫出立體的側面） */
  function wallW() { return clamp(L.cs * 0.2, 1.4, 5); }
  function buildWalls() {
    const n = nOf(), cs = L.cs, S = L.S, m = state.mz.m, ww = wallW(), depth = ww * 0.55;
    const pad = Math.ceil(ww + depth + 3);
    const c = document.createElement('canvas');
    c.width = Math.round((S + 2 * pad) * dpr); c.height = c.width;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, pad * dpr, pad * dpr);
    // 同一條格線上連續的牆接成一段（接頭才平順）
    const path = function (h) {
      h.beginPath();
      for (let r = 0; r <= n; r++) {           // 橫線 y = r·cs：(r−1, c) 與 (r, c) 之間
        let run = -1;
        for (let col = 0; col <= n; col++) {
          const wall = col < n && (r === 0 || r === n || !G.isOpen(m, (r - 1) * n + col, 2));
          if (wall && run < 0) run = col;
          if (!wall && run >= 0) { h.moveTo(run * cs, r * cs); h.lineTo(col * cs, r * cs); run = -1; }
        }
      }
      for (let col = 0; col <= n; col++) {     // 直線 x = col·cs
        let run = -1;
        for (let r = 0; r <= n; r++) {
          const wall = r < n && (col === 0 || col === n || !G.isOpen(m, r * n + col - 1, 1));
          if (wall && run < 0) run = r;
          if (!wall && run >= 0) { h.moveTo(col * cs, run * cs); h.lineTo(col * cs, r * cs); run = -1; }
        }
      }
    };
    g.lineCap = 'round'; g.lineJoin = 'round';
    const wc = C['gt-wall'];
    // 1. 落在地板上的影子 2. 側面（較暗、往下錯開）3. 頂面 4. 頂面上緣的細高光
    g.save(); g.translate(ww * 0.25, depth + ww * 0.45); path(g); g.strokeStyle = D.shadowInk(D.dark ? 0.45 : 0.2); g.lineWidth = ww * 1.25; g.stroke(); g.restore();
    g.save(); g.translate(0, depth); path(g); g.strokeStyle = shade(wc, D.dark ? -0.45 : -0.38); g.lineWidth = ww; g.stroke(); g.restore();
    path(g); g.strokeStyle = wc; g.lineWidth = ww; g.stroke();
    g.save(); g.translate(0, -ww * 0.18); path(g); g.strokeStyle = alpha(shade(wc, 0.65), D.dark ? 0.4 : 0.6); g.lineWidth = Math.max(0.6, ww * 0.26); g.stroke(); g.restore();
    wallCv = { cv: c, pad: pad };
  }

  // ======================= 繪圖 =======================
  let drawQueued = false, lastT = 0;
  function requestDraw() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(frame); } }
  function frame(t) {
    drawQueued = false;
    const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0.016;
    lastT = t;
    if (state.playing) {
      state.acc += dt * state.speed;
      const n = Math.floor(state.acc);
      if (n > 0) { state.acc -= n; advance(Math.min(n, 400), 'play'); }
    }
    const now = performance.now();
    state.fx = state.fx.filter(function (f) { return now < f.t0 + f.dur; });
    draw(now);
    if (state.playing || state.fx.length) requestDraw(); else lastT = 0;
  }
  function center(p, i) {
    const pn = L.panels[p], n = nOf(), cs = L.cs;
    return { x: pn.mx + (i % n + 0.5) * cs, y: pn.my + (((i / n) | 0) + 0.5) * cs };
  }
  function nodePos(p, i) {
    const pn = L.panels[p], q = state.gr.g.pos[i], A = L.A, m = L.R + 16;
    return { x: pn.mx + m + q.x * (A - 2 * m), y: pn.my + m + q.y * (A - 2 * m) };
  }
  function draw(now) {
    if (!L) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(ctx, cw, ch);
    if (isMaze()) { refreshLayers(); [0, 1].forEach(function (p) { drawMazePanel(p, now); }); }
    else [0, 1].forEach(function (p) { drawGraphPanel(p, now); });
    [0, 1].forEach(function (p) { drawHeader(p); });
  }
  /** 面板標頭：名稱（附花紋小方塊）＋讀數＋找到／找不到 */
  function drawHeader(p) {
    const pn = L.panels[p], st = p === 0 ? state.stD : state.stB, tr = p === 0 ? state.trD : state.trB;
    const col = p === 0 ? C['gt-dfs'] : C['gt-bfs'], deep = p === 0 ? C['gt-dfs-deep'] : C['gt-bfs-deep'];
    const y = pn.y + HEAD / 2 + 1, x = pn.x + 4;
    // 花紋小方塊
    ctx.save();
    D.roundRect(ctx, x, y - 8, 16, 16, 3);
    ctx.fillStyle = col; ctx.fill();
    ctx.fillStyle = p === 0 ? pats.stripe : pats.dots; ctx.fill();
    ctx.strokeStyle = alpha(shade(col, -0.4), 0.7); ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    ctx.font = fnt(14, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = D.dark ? col : deep;
    const name = p === 0 ? T('DFS（堆疊）', 'DFS (stack)') : T('BFS（佇列）', 'BFS (queue)');
    ctx.fillText(name, x + 22, y);
    const nameW = ctx.measureText(name).width;
    // 右側：拜訪數與結果
    let msg = T('拜訪 ', 'visited ') + st.visited;
    if (isMaze()) {
      if (st.foundAt >= 0) msg += T('・路長 ', ' · path ') + (st.path.length - 1);
      else if (st.k >= tr.steps.length) msg += T('・找不到終點', ' · goal not found');
    } else msg += T('・第 ' + Math.min(state.k, tr.steps.length) + ' 步', ' · step ' + Math.min(state.k, tr.steps.length));
    ctx.font = fnt(12.5, 500);
    let mw = ctx.measureText(msg).width;
    const room = pn.w - (nameW + 30) - 6;
    if (mw > room) { ctx.font = fnt(11, 500); mw = ctx.measureText(msg).width; }
    const found = isMaze() && st.foundAt >= 0;
    ctx.textAlign = 'right';
    ctx.fillStyle = found ? (D.dark ? C['gt-path'] : shade(C['gt-path'], -0.1)) : C.muted;
    ctx.fillText(msg, pn.x + pn.w - 4, y);
  }

  // ---------- 迷宮 ----------
  function drawMazePanel(p, now) {
    const pn = L.panels[p], S = L.S, cs = L.cs, st = p === 0 ? state.stD : state.stB;
    // 底座：迷宮板子的投影與邊框
    ctx.save();
    ctx.shadowColor = D.dark ? 'rgba(0,0,0,0.55)' : alpha(C.text, 0.18);
    ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
    ctx.fillStyle = C['gt-floor-a'];
    ctx.fillRect(pn.mx, pn.my, S, S);
    ctx.restore();
    ctx.drawImage(layers[p], pn.mx, pn.my, S, S);
    // 找到的路（在牆下面、格子上面：一眼看出路線）
    if (st.path && st.path.length > 1) pathLine(p, st.path, Math.max(2, Math.min(6, cs * 0.24)));
    ctx.drawImage(wallCv.cv, pn.mx - wallCv.pad, pn.my - wallCv.pad, S + 2 * wallCv.pad, S + 2 * wallCv.pad);
    // 畫牆模式：滑鼠下面那面牆
    if (state.draw && state.hover && state.hover.wall && state.hover.p === p) hiliteWall(p, state.hover.wall);
    if (p === 0) drawStack(st, cs);
    else drawQueue(st, cs);
    // 波紋
    state.fx.forEach(function (f) {
      if (f.p !== p) return;
      const u = (now - f.t0) / f.dur, c = center(p, f.i);
      D.ripple(ctx, c.x, c.y, cs * 0.32, u, f.color);
    });
    drawMarkers(p);
  }
  function pathLine(p, path, w) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    path.forEach(function (i, k) { const c = center(p, i); if (k) ctx.lineTo(c.x, c.y); else ctx.moveTo(c.x, c.y); });
    ctx.strokeStyle = alpha(C.surface, D.dark ? 0.5 : 0.85); ctx.lineWidth = w + 3; ctx.stroke();
    if (D.dark) { ctx.shadowColor = alpha(C['gt-path'], 0.7); ctx.shadowBlur = 6; }
    ctx.strokeStyle = C['gt-path']; ctx.lineWidth = w; ctx.stroke();
    ctx.restore();
  }
  function drawStack(st, cs) {
    const sk = st.stack;
    if (sk.length > 1 && !(st.path && st.foundAt >= 0 && sk.length === st.path.length && sk[sk.length - 1] === st.path[st.path.length - 1])) {
      const w = clamp(cs * 0.22, 1.6, 6);
      D.tube(ctx, function (c) { sk.forEach(function (i, k) { const q = center(0, i); if (k) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); }); }, C['gt-dfs-deep'], w);
    }
    if (sk.length) {
      const q = center(0, sk[sk.length - 1]), r = clamp(cs * 0.34, 3.5, 11);
      diamond(q.x, q.y, r, C['gt-dfs-deep']);
    }
  }
  function diamond(x, y, r, color) {
    ctx.save();
    ctx.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.28); ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
    const g = ctx.createLinearGradient(x, y - r, x, y + r);
    g.addColorStop(0, shade(color, 0.3)); g.addColorStop(1, shade(color, -0.15));
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
    ctx.strokeStyle = alpha('#ffffff', 0.85); ctx.lineWidth = r > 6 ? 1.5 : 1; ctx.stroke();
  }
  function drawQueue(st, cs) {
    const q = G.frontier(st), r = clamp(cs * 0.27, 2.2, 9), lw = clamp(cs * 0.09, 1, 2.6);
    ctx.save();
    ctx.lineWidth = lw + 2; ctx.strokeStyle = alpha(C.surface, D.dark ? 0.35 : 0.75);
    ctx.beginPath(); q.forEach(function (i) { const c = center(1, i); ctx.moveTo(c.x + r, c.y); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); }); ctx.stroke();
    ctx.lineWidth = lw; ctx.strokeStyle = C['gt-bfs-deep'];
    ctx.beginPath(); q.forEach(function (i) { const c = center(1, i); ctx.moveTo(c.x + r, c.y); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); }); ctx.stroke();
    ctx.restore();
    if (q.length) { const c = center(1, q[0]); ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.45, 0, Math.PI * 2); ctx.fillStyle = C['gt-bfs-deep']; ctx.fill(); }
    if (st.cur >= 0 && st.k > 0) {
      const c = center(1, st.cur);
      D.ball(ctx, c.x, c.y, clamp(cs * 0.3, 3, 10), C['gt-bfs-deep'], { glow: D.dark ? 0.35 : 0 });
    }
  }
  function starPath(x, y, R) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? R * 0.45 : R;
      if (k) ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); else ctx.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
    }
    ctx.closePath();
  }
  function drawMarkers(p) {
    const cs = L.cs, z = state.mz;
    const hot = function (w) { return (state.drag && state.drag.type === w) || (state.hover && state.hover.marker === w); };
    // 終點：金色星形
    const t = center(p, z.t), R = clamp(cs * 0.46, 6.5, 15);
    if (hot('t')) { ctx.beginPath(); ctx.arc(t.x, t.y, R + 5, 0, Math.PI * 2); ctx.fillStyle = alpha(C['gt-goal'], 0.3); ctx.fill(); }
    ctx.save();
    ctx.shadowColor = D.dark ? 'rgba(0,0,0,0.55)' : alpha(C.text, 0.32); ctx.shadowBlur = 5; ctx.shadowOffsetY = 1.5;
    starPath(t.x, t.y, R);
    const g = ctx.createRadialGradient(t.x - R * 0.3, t.y - R * 0.4, R * 0.1, t.x, t.y, R);
    g.addColorStop(0, shade(C['gt-goal'], 0.55)); g.addColorStop(1, shade(C['gt-goal'], -0.12));
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
    starPath(t.x, t.y, R); ctx.strokeStyle = alpha(shade(C['gt-goal'], -0.55), 0.9); ctx.lineWidth = 1.1; ctx.stroke();
    // 起點：綠色立體圓
    const s = center(p, z.s), r = clamp(cs * 0.36, 5, 12);
    if (hot('s')) { ctx.beginPath(); ctx.arc(s.x, s.y, r + 6, 0, Math.PI * 2); ctx.fillStyle = alpha(C['gt-start'], 0.28); ctx.fill(); }
    D.ball(ctx, s.x, s.y, r, C['gt-start'], { glow: D.dark ? 0.3 : 0 });
    if (cs >= 22) {
      ctx.font = fnt(Math.round(r * 0.95), 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff'; ctx.fillText(T('起', 'S'), s.x, s.y + 0.5);
      ctx.fillStyle = alpha(shade(C['gt-goal'], -0.7), 0.95); ctx.font = fnt(Math.round(R * 0.62), 700); ctx.fillText(T('終', 'G'), t.x, t.y + 1);
    }
  }
  function hiliteWall(p, w) {
    const pn = L.panels[p], n = nOf(), cs = L.cs, r = (w.i / n) | 0, c = w.i % n;
    let x0, y0, x1, y1;
    if (w.d === 1) { x0 = x1 = pn.mx + (c + 1) * cs; y0 = pn.my + r * cs; y1 = y0 + cs; }
    else { y0 = y1 = pn.my + (r + 1) * cs; x0 = pn.mx + c * cs; x1 = x0 + cs; }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = alpha(C.accent, 0.85); ctx.lineWidth = Math.max(3, wallW() + 2);
    ctx.setLineDash(G.isOpen(state.mz.m, w.i, w.d) ? [4, 3] : []);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.restore();
  }

  // ---------- 一般圖 ----------
  function drawGraphPanel(p, now) {
    const pn = L.panels[p], g = state.gr.g, st = p === 0 ? state.stD : state.stB, tr = p === 0 ? state.trD : state.trB;
    const A = L.A, R = L.R, col = p === 0 ? C['gt-dfs'] : C['gt-bfs'], deep = p === 0 ? C['gt-dfs-deep'] : C['gt-bfs-deep'];
    // 底板
    ctx.save();
    ctx.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.14); ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
    D.roundRect(ctx, pn.mx, pn.my, A, A, 10); ctx.fillStyle = C['gt-floor-a']; ctx.fill();
    ctx.restore();
    // 邊：一般的邊是灰色管線；搜尋樹的邊用該演算法的顏色加箭頭（從父到子）
    const isTree = function (a, b) { return (st.num[b] && tr.parent[b] === a) || (st.num[a] && tr.parent[a] === b); };
    for (let a = 0; a < g.V; a++) for (let b = a + 1; b < g.V; b++) {
      if (!G.hasEdge(g, a, b)) continue;
      const P = nodePos(p, a), Q = nodePos(p, b);
      if (isTree(a, b)) continue;
      D.tube(ctx, function (c) { c.moveTo(P.x, P.y); c.lineTo(Q.x, Q.y); }, C['gt-edge'], 3);
    }
    const onStack = {};
    if (p === 0) st.stack.forEach(function (v) { onStack[v] = true; });
    for (let v = 0; v < g.V; v++) {
      if (!st.num[v] || tr.parent[v] < 0) continue;
      const u = tr.parent[v], P = nodePos(p, u), Q = nodePos(p, v);
      const hot = p === 0 && onStack[u] && onStack[v];
      D.tube(ctx, function (c) { c.moveTo(P.x, P.y); c.lineTo(Q.x, Q.y); }, hot ? deep : col, hot ? 6.5 : 5);
      // 箭頭（父 → 子）
      const dx = Q.x - P.x, dy = Q.y - P.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      const hx = Q.x - ux * (R + 4), hy = Q.y - uy * (R + 4), s = 7;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - ux * s * 1.6 - uy * s, hy - uy * s * 1.6 + ux * s); ctx.lineTo(hx - ux * s * 1.6 + uy * s, hy - uy * s * 1.6 - ux * s); ctx.closePath();
      ctx.fillStyle = deep; ctx.fill();
    }
    // 點
    const front = G.frontier(st);
    for (let v = 0; v < g.V; v++) {
      const P = nodePos(p, v), s = st.status[v];
      const hov = state.hover && state.hover.node === v;
      if (v === state.gr.s) { ctx.beginPath(); ctx.arc(P.x, P.y, R + 6, 0, Math.PI * 2); ctx.strokeStyle = C['gt-start']; ctx.lineWidth = 3; ctx.stroke(); }
      if (hov) { ctx.beginPath(); ctx.arc(P.x, P.y, R + 9, 0, Math.PI * 2); ctx.fillStyle = alpha(C.accent, 0.18); ctx.fill(); }
      if (!s) D.ball(ctx, P.x, P.y, R, C['gt-node']);
      else if (p === 0) {
        // DFS：菱形＋斜線
        const r = R * 1.22;
        ctx.save();
        ctx.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : alpha(C.text, 0.28); ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
        ctx.beginPath(); ctx.moveTo(P.x, P.y - r); ctx.lineTo(P.x + r, P.y); ctx.lineTo(P.x, P.y + r); ctx.lineTo(P.x - r, P.y); ctx.closePath();
        const gr = ctx.createLinearGradient(P.x, P.y - r, P.x, P.y + r);
        const base = s === 1 ? C['gt-dfs'] : mix(C['gt-dfs'], C['gt-floor-a'], 0.42);
        gr.addColorStop(0, shade(base, 0.22)); gr.addColorStop(1, shade(base, -0.12));
        ctx.fillStyle = gr; ctx.fill();
        ctx.restore();
        ctx.beginPath(); ctx.moveTo(P.x, P.y - r); ctx.lineTo(P.x + r, P.y); ctx.lineTo(P.x, P.y + r); ctx.lineTo(P.x - r, P.y); ctx.closePath();
        ctx.fillStyle = pats.stripe; ctx.fill();
        ctx.strokeStyle = s === 1 ? deep : alpha(shade(C['gt-dfs'], -0.3), 0.7); ctx.lineWidth = s === 1 ? 2.6 : 1.2; ctx.stroke();
      } else {
        // BFS：圓形＋圓點
        const base = s === 1 ? C['gt-bfs'] : mix(C['gt-bfs'], C['gt-floor-a'], 0.36);
        D.ball(ctx, P.x, P.y, R, base);
        ctx.beginPath(); ctx.arc(P.x, P.y, R - 1, 0, Math.PI * 2); ctx.fillStyle = pats.dots; ctx.fill();
        if (s === 1) { ctx.beginPath(); ctx.arc(P.x, P.y, R + 1.5, 0, Math.PI * 2); ctx.strokeStyle = deep; ctx.lineWidth = 2.6; ctx.stroke(); }
      }
      // 目前處理的點
      const cur = p === 0 ? (st.stack.length ? st.stack[st.stack.length - 1] : -1) : (st.k > 0 ? st.cur : -1);
      if (v === cur) { ctx.beginPath(); ctx.arc(P.x, P.y, R + 4.5, 0, Math.PI * 2); ctx.strokeStyle = alpha(deep, 0.9); ctx.setLineDash([3, 3]); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); }
      // 字母
      ctx.font = fnt(Math.round(R * 0.95), 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = alpha('#000000', 0.35); ctx.strokeText(g.names[v], P.x, P.y + 0.5);
      ctx.fillStyle = '#ffffff'; ctx.fillText(g.names[v], P.x, P.y + 0.5);
      // 順序與距離
      if (state.nums && st.num[v]) {
        D.pill(ctx, '#' + st.num[v], P.x + R * 0.95, P.y - R * 0.55, deep, 'left', fnt(11, 600));
        if (p === 1) D.pill(ctx, 'd=' + st.dist[v], P.x, P.y + R + 18, C.muted, 'center', fnt(11, 500));
      }
    }
    if (front.length === 0 && st.k > 0) {
      ctx.font = fnt(12, 500); ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = C.muted;
      ctx.fillText(p === 0 ? T('堆疊空了：走完', 'Stack empty: done') : T('佇列空了：走完', 'Queue empty: done'), pn.mx + A - 8, pn.my + A - 8);
    }
    state.fx.forEach(function (f) {
      if (f.p !== p) return;
      const P = nodePos(p, f.i);
      D.ripple(ctx, P.x, P.y, R, (now - f.t0) / f.dur, f.color);
    });
  }

  // ======================= 長度圖（cv2） =======================
  let cw2 = 300, ch2 = 150;
  function resizeChart() {
    const w = cv2.clientWidth;
    if (!w) return;
    cw2 = w; ch2 = 150;
    cv2.width = Math.round(cw2 * dpr); cv2.height = Math.round(ch2 * dpr);
    drawChart();
  }
  function drawChart() {
    if (!state.pre) return;
    const g = ctx2, w = cw2, h = ch2;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(g, w, h);
    const l = 40, r = 12, t = 12, b = 22, pw = w - l - r, ph = h - t - b;
    const LD = state.pre.d.lens, LB = state.pre.b.lens, Lmax = Math.max(1, state.L);
    let ymax = 1;
    for (let i = 0; i < LD.length; i++) ymax = Math.max(ymax, LD[i]);
    for (let i = 0; i < LB.length; i++) ymax = Math.max(ymax, LB[i]);
    const nice = function (x) { const e = Math.pow(10, Math.floor(Math.log10(x))), f = x / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; };
    const ytop = nice(ymax * 1.05), step = nice(ytop / 4);
    const X = function (k) { return l + pw * k / Lmax; }, Y = function (v) { return t + ph * (1 - v / ytop); };
    // 格線與刻度
    g.font = fnt(11, 400); g.fillStyle = C.muted; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.strokeStyle = alpha(C.text, 0.08); g.lineWidth = 1;
    for (let v = 0; v <= ytop + 1e-9; v += step) { g.beginPath(); g.moveTo(l, Y(v)); g.lineTo(l + pw, Y(v)); g.stroke(); g.fillText(String(Math.round(v)), l - 5, Y(v)); }
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText('0', l, h - 6);
    g.textAlign = 'right'; g.fillText(T('步數 ', 'step ') + Lmax, l + pw, h - 6);
    // 兩條線（降取樣：每個像素最多一點）
    const line = function (arr, color, dash) {
      g.save(); g.beginPath();
      const n = arr.length, stepK = Math.max(1, Math.floor(n / (pw * 1.5)));
      for (let k = 0; k < n; k += stepK) { const x = X(k), y = Y(arr[k]); if (k) g.lineTo(x, y); else g.moveTo(x, y); }
      g.lineTo(X(n - 1), Y(arr[n - 1]));
      if (n - 1 < Lmax) g.lineTo(X(Lmax), Y(arr[n - 1]));
      g.strokeStyle = color; g.lineWidth = 2; g.lineJoin = 'round'; g.setLineDash(dash || []); g.stroke(); g.restore();
    };
    line(LB, C['gt-bfs-deep'], [6, 4]);
    line(LD, C['gt-dfs-deep']);
    // 目前步數
    const kx = X(state.k);
    g.strokeStyle = alpha(C.accent, 0.8); g.lineWidth = 1.5; g.beginPath(); g.moveTo(kx, t); g.lineTo(kx, t + ph); g.stroke();
    const dv = LD[Math.min(state.k, LD.length - 1)], bv = LB[Math.min(state.k, LB.length - 1)];
    g.fillStyle = C['gt-dfs-deep']; g.beginPath(); g.arc(kx, Y(dv), 3.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = C['gt-bfs-deep']; g.beginPath(); g.arc(kx, Y(bv), 3.5, 0, Math.PI * 2); g.fill();
  }

  // ======================= 音效 =======================
  function sound() { const Sd = window.LabSound; return Sd && Sd.enabled() ? Sd : null; }
  let lastSnd = 0;
  function stepSound(how) {
    const Sd = sound(); if (!Sd) return;
    const now = performance.now();
    if (now - lastSnd < 85) return;         // 每秒最多約 12 個音，播放很快時不吵
    lastSnd = now;
    const k = state.k, spD = k <= state.trD.steps.length ? state.trD.steps[k - 1] : null, spB = k <= state.trB.steps.length ? state.trB.steps[k - 1] : null;
    if (spD) {
      const depth = state.stD.stack.length;
      if (spD.op === 'push') Sd.tone({ freq: Math.min(1400, 330 * Math.pow(2, Math.min(depth, 60) / 24)), dur: 0.07, type: 'triangle', gain: 0.12 });
      else Sd.tone({ freq: Math.max(250, 260 * Math.pow(2, Math.min(depth, 60) / 30)), dur: 0.05, type: 'triangle', gain: 0.07 });
    }
    if (spB) {
      const d = state.stB.dist[spB.u] >= 0 ? state.stB.dist[spB.u] : 0;
      Sd.tone({ freq: Math.min(1500, 392 * Math.pow(2, Math.min(d, 48) / 16)), dur: 0.06, type: 'sine', gain: 0.1, delay: 0.03 });
    }
  }
  function foundSound() {
    const Sd = sound(); if (!Sd) return;
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { Sd.tone({ freq: f, dur: 0.16, type: 'sine', gain: 0.14, delay: i * 0.06 }); });
  }
  function notFoundSound() { const Sd = sound(); if (Sd) Sd.sweep({ from: 620, to: 260, dur: 0.35, type: 'triangle', gain: 0.1 }); }
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

  // ======================= 走訪與播放 =======================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  /** 每一步之後堆疊／佇列的長度（長度圖用）與找到終點時已拜訪的格數 */
  function precompute(tr) {
    const lens = new Int32Array(tr.steps.length + 1);
    let len = 1, vis = 1, visAt = tr.found === 0 ? 1 : -1;
    lens[0] = 1;
    tr.steps.forEach(function (sp, i) {
      if (sp.op === 'push') { len++; vis++; } else if (sp.op === 'pop') len--; else { len += sp.add.length - 1; vis += sp.add.length; }
      lens[i + 1] = len;
      if (i + 1 === tr.found) visAt = vis;
    });
    return { lens: lens, visAt: visAt };
  }
  /** 圖本身的資訊（不看走訪）：通道數、連通塊、走得到的格數、迴路、是不是樹 */
  function analyze() {
    let adj, E, Nn, s;
    if (isMaze()) { const z = state.mz; adj = G.mazeAdj(z.m, 'NESW'); E = G.countOpen(z.m); Nn = z.n * z.n; s = z.s; }
    else { const q = state.gr; adj = G.graphAdj(q.g, false); E = G.graphEdges(q.g); Nn = q.g.V; s = q.s; }
    const cc = G.components(adj), reach = cc.sizes[cc.comp[s]];
    let E2 = 0;
    for (let i = 0; i < Nn; i++) if (cc.comp[i] === cc.comp[s]) E2 += adj[i].length;
    return { N: Nn, E: E, comps: cc.count, reach: reach, Ereach: E2 / 2, cycles: E - Nn + cc.count, isTree: cc.count === 1 && E === Nn - 1 };
  }
  function rebuild(keepMsg) {
    stopPlay();
    let adj, s, t, early;
    if (isMaze()) { const z = state.mz; adj = G.mazeAdj(z.m, z.order); s = z.s; t = z.t; early = state.early; }
    else { const q = state.gr; adj = G.graphAdj(q.g, q.rev); s = q.s; t = -1; early = false; }
    state.trD = G.dfsTrace(adj, s, t, early);
    state.trB = G.bfsTrace(adj, s, t, early);
    state.L = Math.max(state.trD.steps.length, state.trB.steps.length);
    state.pre = { d: precompute(state.trD), b: precompute(state.trB) };
    state.info = analyze();
    resetRun(keepMsg);
  }
  function resetRun(keepMsg) {
    stopPlay();
    state.k = 0;
    state.stD = G.initState(state.trD, V());
    state.stB = G.initState(state.trB, V());
    state.manual = true; state.done = false; state.report = null; state.fx = [];
    markAll();
    if (!keepMsg) describe();
    updateAll();
  }
  function stepTo(k) {
    [[state.stD, state.trD, 0], [state.stB, state.trB, 1]].forEach(function (a) {
      const st = a[0], tr = a[1], K = Math.min(k, tr.steps.length);
      const changed = [];
      while (st.k < K) { const ch = G.applyStep(st, tr); for (let j = 0; j < ch.length; j++) changed.push(ch[j]); if (changed.length > 4000) break; }
      if (isMaze()) markCells(a[2], changed);
    });
    if (state.stD.k < Math.min(k, state.trD.steps.length) || state.stB.k < Math.min(k, state.trB.steps.length)) {
      // 一次跳很多步：直接重算
      state.stD = G.stateAt(state.trD, V(), k); state.stB = G.stateAt(state.trB, V(), k); markAll();
    }
  }
  function advance(n, how) {
    if (state.k >= state.L) { if (!state.done) finish(); stopPlay(); updateAll(); return; }
    if (how !== 'step') state.manual = false;
    const k0 = state.k, k1 = Math.min(state.L, k0 + Math.max(1, n));
    state.k = k1;
    stepTo(k1);
    let foundNow = false;
    if (isMaze()) [state.trD, state.trB].forEach(function (tr) {
      if (tr.found > 0 && k0 < tr.found && tr.found <= k1) {
        foundNow = true;
        const pre = tr.algo === 'dfs' ? state.pre.d : state.pre.b;
        emit('found', { mode: 'maze', algo: tr.algo, manual: state.manual, k: tr.found, path: tr.stats.path, visited: pre.visAt });
      }
    });
    if (how === 'step' || how === 'play') { addFx(k0, k1); if (!foundNow) stepSound(how); }
    if (foundNow) foundSound();
    if (k1 >= state.L) { finish(); stopPlay(); }
    if (!state.playing || foundNow) describe();
    updateAll(foundNow);
  }
  function back() {
    if (state.k <= 0) return;
    stopPlay();
    state.k--;
    state.stD = G.stateAt(state.trD, V(), state.k);
    state.stB = G.stateAt(state.trB, V(), state.k);
    state.done = false; state.report = null;
    markAll();
    describe();
    updateAll();
  }
  function addFx(k0, k1) {
    if (reducedMotion || k1 - k0 > 3 || state.speed > 40) return;
    const now = performance.now(), dur = 420;
    for (let k = k0; k < k1; k++) {
      const sd = state.trD.steps[k], sb = state.trB.steps[k];
      if (sd && sd.op === 'push') state.fx.push({ p: 0, i: sd.v, color: C['gt-dfs-deep'], t0: now, dur: dur });
      if (sb) sb.add.forEach(function (v) { state.fx.push({ p: 1, i: v, color: C['gt-bfs-deep'], t0: now, dur: dur }); });
    }
    if (state.fx.length > 60) state.fx.splice(0, state.fx.length - 60);
    requestDraw();
  }

  // ---------- 跑完：整理結果、紀錄、任務事件（整理工作在核心的 mazeReport／graphReport，任務證明腳本也用它們） ----------
  function finish() {
    if (state.done) return;
    state.done = true;
    let rp;
    if (isMaze()) {
      const z = state.mz;
      rp = G.mazeReport(z.m, { gen: z.gen, seed: z.seed, loops: z.loops, edits: z.edits, s: z.s, t: z.t, early: state.early, order: z.order }, state.trD, state.trB);
      if (!rp.found) notFoundSound();
    } else {
      const q = state.gr;
      rp = G.graphReport(q.g, { preset: q.preset, s: q.s, rev: q.rev, edits: q.edits }, state.trD, state.trB);
    }
    state.report = rp;
    state.log.push(rp);
    if (state.log.length > 40) state.log.shift();
    renderLog();
    emit('finish', Object.assign({ manual: state.manual }, rp));
  }

  // ---------- 這一步做了什麼（狀態列） ----------
  let sayTimer = 0;
  function say(msg) {
    msg = String(msg || '');
    clearTimeout(sayTimer); sayTimer = setTimeout(function () { $('status').textContent = msg; }, 20);
  }
  function list(cells) {
    const names = cells.slice(0, 4).map(nameOf);
    return names.join(T('、', ', ')) + (cells.length > 4 ? T(' 等 ' + cells.length + ' 個', ' and ' + (cells.length - 4) + ' more') : '');
  }
  function stepText(algo) {
    const tr = algo === 'dfs' ? state.trD : state.trB, st = algo === 'dfs' ? state.stD : state.stB, k = state.k;
    if (k > tr.steps.length) {
      if (tr.early && tr.found >= 0) return algo === 'dfs' ? T('DFS 已經找到終點', 'DFS has found the goal') : T('BFS 已經找到終點', 'BFS has found the goal');
      return algo === 'dfs' ? T('DFS 已經走完', 'DFS has finished') : T('BFS 已經走完', 'BFS has finished');
    }
    const sp = tr.steps[k - 1];
    if (sp.op === 'push') {
      const how = isMaze() ? T('往' + DIR_ZH[dirBetween(sp.u, sp.v)] + '走到 ', ' goes ' + DIR_EN[dirBetween(sp.u, sp.v)] + ' to ') : T(' → ', ' → ');
      return T('DFS：' + nameOf(sp.u) + how + nameOf(sp.v) + '，推進堆疊（' + st.stack.length + ' 格）', 'DFS: ' + nameOf(sp.u) + how + nameOf(sp.v) + ', push (stack ' + st.stack.length + ')');
    }
    if (sp.op === 'pop') {
      const top = st.stack.length ? st.stack[st.stack.length - 1] : -1;
      return top >= 0 ? T('DFS：' + nameOf(sp.u) + ' 的鄰居都拜訪過了，彈出，退回 ' + nameOf(top), 'DFS: every neighbour of ' + nameOf(sp.u) + ' is visited; pop, back to ' + nameOf(top))
        : T('DFS：彈出起點，堆疊空了', 'DFS: pop the start; the stack is empty');
    }
    const d = st.dist[sp.u];
    return sp.add.length ? T('BFS：取出 ' + nameOf(sp.u) + '（距離 ' + d + '），排進 ' + list(sp.add), 'BFS: take out ' + nameOf(sp.u) + ' (distance ' + d + '), add ' + list(sp.add))
      : T('BFS：取出 ' + nameOf(sp.u) + '（距離 ' + d + '），沒有新的鄰居', 'BFS: take out ' + nameOf(sp.u) + ' (distance ' + d + '), no new neighbour');
  }
  function describe() {
    if (state.k === 0) {
      if (isMaze()) say(T('準備好了：起點 ' + nameOf(state.mz.s) + ' 已經在堆疊和佇列裡。按「單步」或「播放」，看 DFS 一路鑽到底、BFS 一層一層往外擴。', 'Ready: the start ' + nameOf(state.mz.s) + ' is already on the stack and in the queue. Press “Step” or “Play” to watch DFS dive deep and BFS spread out layer by layer.'));
      else say(T('準備好了：從 ' + nameOf(state.gr.s) + ' 出發。按「單步」或「播放」，對照兩種拜訪順序。', 'Ready: starting from ' + nameOf(state.gr.s) + '. Press “Step” or “Play” and compare the two visiting orders.'));
      return;
    }
    if (state.done) { say(finishText()); return; }
    say(T('第 ' + state.k + ' 步　', 'Step ' + state.k + ': ') + stepText('dfs') + T('　｜　', '  |  ') + stepText('bfs'));
  }
  function finishText() {
    const rp = state.report;
    if (!rp) return '';
    if (rp.mode === 'graph') {
      return T('跑完了：DFS 的拜訪順序 ' + rp.orderD + '，BFS 的拜訪順序 ' + rp.orderB + '。' + (rp.reach < rp.V ? '有 ' + (rp.V - rp.reach) + ' 個點走不到。' : ''),
        'Done: DFS visited ' + rp.orderD + ', BFS visited ' + rp.orderB + '.' + (rp.reach < rp.V ? ' ' + (rp.V - rp.reach) + ' vertices cannot be reached.' : ''));
    }
    if (!rp.found) return T('跑完了：起點走得到的 ' + rp.reach + ' 格都拜訪過了，還是找不到終點——起點和終點不連通。', 'Done: all ' + rp.reach + ' squares reachable from the start were visited, but the goal is not among them — start and goal are not connected.');
    const pd = rp.dfs.path, pb = rp.bfs.path;
    return T('跑完了：DFS 拜訪 ' + rp.dfs.visited + ' 格，找到的路長 ' + pd + '；BFS 拜訪 ' + rp.bfs.visited + ' 格，路長 ' + pb + '（最短）。' + (pd === pb ? '兩條路一樣長。' : 'DFS 多走了 ' + (pd - pb) + ' 步。'),
      'Done: DFS visited ' + rp.dfs.visited + ' squares and found a path of length ' + pd + '; BFS visited ' + rp.bfs.visited + ' squares, path length ' + pb + ' (shortest). ' + (pd === pb ? 'Both paths are equally long.' : 'DFS walked ' + (pd - pb) + ' steps more.'));
  }

  // ======================= 讀數、堆疊與佇列、表格 =======================
  const lastHTML = {};
  function setHTML(id, html) { if (lastHTML[id] !== html) { lastHTML[id] = html; $(id).innerHTML = html; } }
  /** 更新讀數、堆疊與佇列、長度圖（播放中每 0.1 秒最多一次，畫布照樣每一幀更新） */
  let lastDom = 0;
  function updateAll(force) {
    const now = performance.now();
    if (state.playing && !force && now - lastDom < 100) { requestDraw(); return; }
    lastDom = now;
    if (state.playing) describe();
    updateReadouts();
    renderDS();
    updateButtons();
    drawChart();
    requestDraw();
  }
  function updateButtons() {
    const end = state.k >= state.L;
    $('backBtn').disabled = state.k <= 0;
    $('stepBtn').disabled = end;
    $('endBtn').disabled = end;
    $('playBtn').setAttribute('aria-pressed', String(state.playing));
    $('playBtn').textContent = state.playing ? T('暫停', 'Pause') : T('播放', 'Play');
  }
  function updateReadouts() {
    const D1 = state.stD, B1 = state.stB, tD = state.trD, tB = state.trB, maze = isMaze();
    const kd = Math.min(state.k, tD.steps.length), kb = Math.min(state.k, tB.steps.length);
    const pathOf = function (st, tr) { return st.foundAt >= 0 ? String(st.path.length - 1) : st.k >= tr.steps.length ? T('找不到', 'not found') : '—'; };
    const row = function (name, a, b) { return '<tr><td>' + name + '</td><td>' + a + '</td><td>' + b + '</td></tr>'; };
    let html = '<tr><th></th><th class="d">DFS</th><th class="b">BFS</th></tr>';
    html += row(T('步數', 'Steps'), kd + ' / ' + tD.steps.length, kb + ' / ' + tB.steps.length);
    html += row(maze ? T('拜訪的格數', 'Squares visited') : T('拜訪的點數', 'Vertices visited'), D1.visited, B1.visited);
    html += row(T('退回（彈出）', 'Backed up (pops)'), D1.pops, '—');
    html += row(T('堆疊／佇列：現在', 'Stack / queue: now'), D1.stack.length, B1.queue.length - B1.head);
    html += row(T('堆疊／佇列：最長', 'Stack / queue: longest'), D1.maxLen, B1.maxLen);
    html += row(T('檢查鄰居', 'Neighbour checks'), D1.checks, B1.checks);
    if (maze) html += row(T('找到的路長', 'Path length found'), pathOf(D1, tD), pathOf(B1, tB));
    html += row(maze ? T('最深／最遠一層', 'Deepest / farthest layer') : T('樹的深度', 'Tree depth'),
      maze ? Math.max(0, D1.maxLen - 1) : G.treeDepth(tD.parent, tD.order.slice(0, D1.visited)), B1.depth);
    setHTML('cmpTab', html);
    const f = state.info, dd = function (a, b) { return '<dt>' + a + '</dt><dd>' + b + '</dd>'; };
    let g = '';
    if (maze) {
      g += dd(T('格子數 N', 'Squares N'), f.N) + dd(T('通道（邊）數 E', 'Passages (edges) E'), f.E) + dd(T('內牆', 'Inner walls'), 2 * nOf() * (nOf() - 1) - f.E);
      g += dd(T('起點走得到的格數', 'Squares reachable from the start'), f.reach) + dd(T('連通塊 C', 'Connected pieces C'), f.comps);
      g += dd(T('獨立迴路 E − N + C', 'Independent loops E − N + C'), f.cycles) + dd(T('是不是樹', 'A tree?'), f.isTree ? T('是', 'yes') : T('不是', 'no'));
    } else {
      g += dd(T('點數 V', 'Vertices V'), f.N) + dd(T('邊數 E', 'Edges E'), f.E) + dd(T('起點走得到的點數', 'Vertices reachable from the start'), f.reach);
      g += dd(T('連通塊 C', 'Connected pieces C'), f.comps) + dd(T('獨立迴路 E − V + C', 'Independent loops E − V + C'), f.cycles) + dd(T('是不是樹', 'A tree?'), f.isTree ? T('是', 'yes') : T('不是', 'no'));
      g += dd(T('鄰接矩陣的格數 V²', 'Adjacency matrix entries V²'), f.N * f.N) + dd(T('鄰接串列的項數 2E', 'Adjacency list entries 2E'), 2 * f.E);
    }
    setHTML('graphRead', g);
    const full = !(isMaze() && state.early && tD.found >= 0);
    const Vp = f.reach, Ep = f.Ereach;
    let th = T('完整走訪（從起點走得到的 V′ = ' + Vp + ' 格、E′ = ' + Ep + ' 條通道）時：DFS 步數 = 2V′ − 1 = ' + (2 * Vp - 1) + '，BFS 步數 = V′ = ' + Vp + '，兩者檢查鄰居都是 2E′ = ' + (2 * Ep) + ' 次。',
      'For a complete traversal (V′ = ' + Vp + ' reachable squares, E′ = ' + Ep + ' passages): DFS takes 2V′ − 1 = ' + (2 * Vp - 1) + ' steps, BFS takes V′ = ' + Vp + ', and both check a neighbour 2E′ = ' + (2 * Ep) + ' times.');
    if (!maze) th = th.replace(/格/g, '點').replace(/通道/g, '邊').replace('squares', 'vertices').replace('passages', 'edges');
    if (!full) th += T('（現在打開了「找到終點就停」，找到就提早結束。）', ' (“Stop at the goal” is on, so they stop early.)');
    setHTML('theory', th);
  }
  function chip(i, cls, extra) { return '<span class="chip ' + cls + '"><i></i>' + nameOf(i) + (extra || '') + '</span>'; }
  function renderDS() {
    const sk = state.stD.stack, q = G.frontier(state.stB);
    let h = '';
    if (!sk.length) h = '<span class="empty">' + T('（空的）', '(empty)') + '</span>';
    else {
      const show = sk.length > 16 ? sk.slice(0, 3).concat([-1], sk.slice(-12)) : sk;
      show.forEach(function (v, k) {
        if (v < 0) { h += '<span class="more">' + T('… 中間還有 ' + (sk.length - 15) + ' 格 …', '… ' + (sk.length - 15) + ' more …') + '</span>'; return; }
        h += chip(v, 'dfs' + (k === show.length - 1 ? ' is-top' : ''));
      });
    }
    setHTML('stackList', h);
    let hq = '';
    if (!q.length) hq = '<span class="empty">' + T('（空的）', '(empty)') + '</span>';
    else {
      const show = q.length > 16 ? q.slice(0, 12).concat([-1], q.slice(-3)) : q;
      show.forEach(function (v, k) {
        if (v < 0) { hq += '<span class="more">' + T('… 中間還有 ' + (q.length - 15) + ' 格 …', '… ' + (q.length - 15) + ' more …') + '</span>'; return; }
        hq += chip(v, 'bfs' + (k === 0 ? ' is-front' : ''), '<small>' + state.stB.dist[v] + '</small>');
      });
    }
    setHTML('queueList', hq);
    $('stackHead').textContent = T('DFS 的堆疊（後進先出，最右邊是頂端）：' + sk.length + (isMaze() ? ' 格' : ' 個'), 'DFS stack (last in, first out; the top is on the right): ' + sk.length);
    $('queueHead').textContent = T('BFS 的佇列（先進先出，最左邊先出來；小字是距離）：' + q.length + (isMaze() ? ' 格' : ' 個'), 'BFS queue (first in, first out; the left end comes out first; small numbers are distances): ' + q.length);
    const og = !isMaze();
    $('orderD').hidden = !og; $('orderB').hidden = !og;
    if (og) {
      const names = state.gr.g.names;
      setHTML('orderD', T('拜訪順序：', 'Visiting order: ') + '<b>' + state.trD.order.slice(0, state.stD.visited).map(function (v) { return names[v]; }).join(' ') + '</b>');
      setHTML('orderB', T('拜訪順序：', 'Visiting order: ') + '<b>' + state.trB.order.slice(0, state.stB.visited).map(function (v) { return names[v]; }).join(' ') + '</b>');
    }
  }
  function renderLog() {
    const tab = $('logTab');
    if (!state.log.length) { tab.innerHTML = ''; $('logEmpty').hidden = false; return; }
    $('logEmpty').hidden = true;
    let html = '<tr><th>#</th><th>' + T('圖', 'Graph') + '</th><th>' + T('拜訪 D', 'Visit D') + '</th><th>' + T('拜訪 B', 'Visit B') + '</th><th>' + T('路長 D', 'Path D') + '</th><th>' + T('路長 B', 'Path B') + '</th><th>' + T('最長 堆疊／佇列', 'Max stack / queue') + '</th></tr>';
    state.log.forEach(function (r, k) {
      if (r.mode === 'maze') {
        const nm = r.n + '×' + r.n + ' ' + genName(r.gen) + (r.edits ? '*' : '');
        const pd = r.found ? r.dfs.path : '—', pb = r.found ? r.bfs.path : '—';
        html += '<tr><td>' + (k + 1) + '</td><td>' + nm + '</td><td>' + r.dfs.visited + '</td><td>' + r.bfs.visited + '</td><td>' + pd + '</td><td>' + pb + '</td><td>' + r.dfs.maxStack + ' / ' + r.bfs.maxQueue + '</td></tr>';
      } else {
        const nm = (r.preset === 'sample' ? T('範例圖', 'Sample') : T('隨機圖', 'Random')) + ' V=' + r.V + (r.edits ? '*' : '');
        html += '<tr><td>' + (k + 1) + '</td><td>' + nm + '</td><td>' + r.reach + '</td><td>' + r.reach + '</td><td>—</td><td>—</td><td>' + r.maxStack + ' / ' + r.maxQueue + '</td></tr>';
      }
    });
    tab.innerHTML = html;
  }

  // ======================= 控制項 =======================
  function stopPlay() { state.playing = false; state.acc = 0; }
  function togglePlay() {
    if (state.playing) { stopPlay(); updateAll(); return; }
    if (state.k >= state.L) resetRun(true);    // 停在最後一步時按「播放」：從頭再放一次
    state.playing = true; state.acc = 1; state.manual = false;
    updateButtons();
    requestDraw();
  }
  $('stepBtn').addEventListener('click', function () { stopPlay(); advance(1, 'step'); });
  $('backBtn').addEventListener('click', back);
  $('playBtn').addEventListener('click', togglePlay);
  $('endBtn').addEventListener('click', function () { stopPlay(); advance(state.L, 'end'); });
  $('resetBtn').addEventListener('click', function () { resetRun(); });
  $('wipeBtn').addEventListener('click', function () {
    state.log = []; renderLog();
    resetRun(true);
    say(T('已清除紀錄，回到第 0 步。', 'Cleared the log; back to step 0.'));
  });

  // ---------- 模式 ----------
  const modeBtns = Array.prototype.slice.call(document.querySelectorAll('.modes button'));
  function setMode(m) {
    if (m === state.mode && state.trD) return;
    state.mode = m;
    state.hover = null; state.drag = null;
    modeBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === m)); });
    $('mazeCard').hidden = m !== 'maze';
    $('graphCard').hidden = m !== 'graph';
    $('reprBox').hidden = m !== 'graph';
    document.querySelectorAll('.legend .maze-only').forEach(function (e) { e.hidden = m !== 'maze'; });
    $('early').disabled = m !== 'maze';
    fillOrders();
    rebuild();
    if (m === 'graph') renderRepr();
    updateInfo();
    resize();
    cv.style.cursor = 'default';
  }
  modeBtns.forEach(function (b) { b.addEventListener('click', function () { setMode(b.dataset.mode); }); });

  // ---------- 迷宮 ----------
  const elSize = $('size'), elLoops = $('loops'), genSel = $('genSel');
  function regen() { const z = state.mz; z.m = G.generate(z.n, z.gen, z.seed, z.loops); z.edits = 0; wallCv = null; }
  function setST(s, t) {
    if (s === t) return false;
    if (isMaze()) { state.mz.s = s; state.mz.t = t; } else state.gr.s = s;
    rebuild(true);
    describe();
    updateInfo();
    return true;
  }
  elSize.addEventListener('input', function () {
    const n = Math.round(val(elSize)); $('sizeo').textContent = String(n);
    if (n === state.mz.n) return;
    const z = state.mz; z.n = n; z.s = 0; z.t = n * n - 1;
    regen(); layers = null;
    if (isMaze()) { rebuild(); resize(); }
    updateInfo();
  });
  genSel.addEventListener('change', function () { state.mz.gen = genSel.value; regen(); rebuild(); updateInfo(); });
  elLoops.addEventListener('input', function () {
    const p = Math.round(val(elLoops)); $('loopso').textContent = p + ' %';
    if (p === state.mz.loops) return;
    state.mz.loops = p; regen(); rebuild(); updateInfo();
  });
  $('newMaze').addEventListener('click', function () { state.mz.seed++; regen(); rebuild(); updateInfo(); });
  $('swapBtn').addEventListener('click', function () { setST(state.mz.t, state.mz.s); });
  $('drawBtn').addEventListener('click', function () {
    state.draw = !state.draw;
    $('drawBtn').setAttribute('aria-pressed', String(state.draw));
    if (!state.draw && state.hover) state.hover.wall = null;
    say(state.draw ? T('畫牆：按在格線上（或沿著格線拖曳）加上或拿掉牆。起點和終點照樣可以拖曳。', 'Drawing walls: tap a grid line (or drag along it) to add or remove a wall. You can still drag the start and the goal.')
      : T('不畫牆了。', 'Stopped drawing walls.'));
    requestDraw();
  });
  function updateInfo() {
    const z = state.mz, f = state.info;
    if (isMaze() && f) {
      let s = T('第 ' + z.seed + ' 號（同樣的邊長、產生方式、編號，每次都是同一座迷宮）', 'Maze no. ' + z.seed + ' (the same side, method and number always give the same maze)');
      if (z.edits) s += T('；手畫改了 ' + z.edits + ' 次牆', '; walls changed by hand ' + z.edits + ' times');
      s += T('。', '. ');
      s += f.isTree ? T('現在是一棵樹：任兩格之間恰好一條路。', 'It is a tree now: exactly one path between any two squares.')
        : f.comps > 1 ? T('現在分成 ' + f.comps + ' 塊，有些格子走不到' + (f.cycles ? '，還有 ' + f.cycles + ' 個迴路' : '') + '。', 'It is in ' + f.comps + ' pieces, so some squares cannot be reached' + (f.cycles ? ', with ' + f.cycles + ' loop' + (f.cycles > 1 ? 's' : '') : '') + '.')
          : T('現在有 ' + f.cycles + ' 個迴路，不是樹：兩格之間可能有好幾條路。', 'It has ' + f.cycles + ' loop' + (f.cycles > 1 ? 's' : '') + ', so it is not a tree: there can be several paths between two squares.');
      $('mazeInfo').textContent = s;
    }
    if (!isMaze()) {
      const q = state.gr;
      $('graphInfo').textContent = q.preset === 'sample' ? T('範例圖：8 個點、11 條邊。', 'Sample graph: 8 vertices, 11 edges.') + (q.edits ? T('（改過 ' + q.edits + ' 次）', ' (changed ' + q.edits + ' times)') : '')
        : T('隨機圖第 ' + q.seed + ' 張：先連成一棵樹，再多加 ⌊V/2⌋ 條邊（一定有迴路）。', 'Random graph no. ' + q.seed + ': a random tree plus ⌊V/2⌋ extra edges (so it always has loops).') + (q.edits ? T('（改過 ' + q.edits + ' 次）', ' (changed ' + q.edits + ' times)') : '');
    }
  }
  function applyWall(w, open) {
    if (!G.setOpen(state.mz.m, w.i, w.d, open)) return false;
    state.mz.edits++;
    wallCv = null;
    rebuild(true);
    updateInfo();
    const Sd = sound(); if (Sd) Sd.tone({ freq: open ? 660 : 330, dur: 0.05, type: 'square', gain: 0.05 });
    return true;
  }

  // ---------- 一般圖 ----------
  const presetSel = $('presetSel'), elGv = $('gv'), gsSel = $('gsSel');
  function loadGraph() {
    const q = state.gr;
    q.g = q.preset === 'sample' ? G.sampleGraph() : G.randomGraph(q.V, q.seed);
    q.edits = 0;
    if (q.s >= q.g.V) q.s = 0;
    fillStarts();
  }
  function fillStarts() {
    const g = state.gr.g;
    let h = '';
    for (let i = 0; i < g.V; i++) h += '<option value="' + i + '">' + g.names[i] + '</option>';
    gsSel.innerHTML = h; gsSel.value = String(state.gr.s);
  }
  function graphChanged(keep) {
    rebuild(keep);
    renderRepr();
    updateInfo();
    if (!keep) resize();
  }
  presetSel.addEventListener('change', function () {
    state.gr.preset = presetSel.value; elGv.disabled = presetSel.value === 'sample';
    loadGraph(); graphChanged();
  });
  elGv.addEventListener('input', function () {
    const v = Math.round(val(elGv)); $('gvo').textContent = String(v);
    if (v === state.gr.V) return;
    state.gr.V = v;
    if (state.gr.preset === 'random') { loadGraph(); if (!isMaze()) graphChanged(); }
  });
  $('newGraph').addEventListener('click', function () {
    state.gr.preset = 'random'; presetSel.value = 'random'; elGv.disabled = false;
    state.gr.seed++; loadGraph(); graphChanged();
  });
  gsSel.addEventListener('change', function () { state.gr.s = +gsSel.value; rebuild(); renderRepr(); });
  function toggleEdge(a, b) {
    const g = state.gr.g;
    if (a === b) return;
    G.setEdge(g, a, b, !G.hasEdge(g, a, b));
    state.gr.edits++;
    graphChanged(true);
    describe();
    const Sd = sound(); if (Sd) Sd.tone({ freq: G.hasEdge(g, a, b) ? 660 : 330, dur: 0.05, type: 'square', gain: 0.05 });
  }
  function renderRepr() {
    if (isMaze()) return;
    const g = state.gr.g, adj = G.graphAdj(g, state.gr.rev);
    let h = '';
    for (let i = 0; i < g.V; i++) h += '<li' + (i === state.gr.s ? ' class="s"' : '') + '><b>' + g.names[i] + '</b>→ ' + (adj[i].length ? adj[i].map(function (v) { return g.names[v]; }).join(', ') : T('（沒有鄰居）', '(no neighbours)')) + '</li>';
    setHTML('adjList', h);
    const E = G.graphEdges(g);
    $('listCap').textContent = T('共 2E = ' + (2 * E) + ' 項（每條邊在兩端各記一次）。', '2E = ' + (2 * E) + ' entries in all (each edge is listed at both ends).');
    let m = '<tr><th></th>';
    for (let j = 0; j < g.V; j++) m += '<th>' + g.names[j] + '</th>';
    m += '</tr>';
    for (let i = 0; i < g.V; i++) {
      m += '<tr><th>' + g.names[i] + '</th>';
      for (let j = 0; j < g.V; j++) {
        const on = G.hasEdge(g, i, j);
        m += '<td><button type="button" data-a="' + i + '" data-b="' + j + '"' + (i === j ? ' disabled' : '') + (on ? ' class="on"' : '') + ' aria-label="' + g.names[i] + '–' + g.names[j] + (on ? T(' 相連', ' joined') : T(' 不相連', ' not joined')) + '">' + (i === j ? '·' : on ? '1' : '0') + '</button></td>';
      }
      m += '</tr>';
    }
    setHTML('adjMat', m);
    $('matCap').textContent = T('V² = ' + (g.V * g.V) + ' 格，其中寫 1 的有 2E = ' + (2 * E) + ' 格；對角線（自己連自己）不用。', 'V² = ' + (g.V * g.V) + ' entries, of which 2E = ' + (2 * E) + ' are 1; the diagonal (a vertex to itself) is not used.');
  }
  $('adjMat').addEventListener('click', function (ev) {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    toggleEdge(+b.dataset.a, +b.dataset.b);
  });

  // ---------- 走法 ----------
  const orderSel = $('orderSel');
  function fillOrders() {
    if (isMaze()) {
      orderSel.innerHTML = G.ORDER_KEYS.map(function (o) { return '<option value="' + o + '">' + orderName(o) + '</option>'; }).join('');
      orderSel.value = state.mz.order;
      $('orderHint').textContent = T('DFS 在每一格照這個順序找下一個還沒拜訪的鄰居；BFS 照這個順序把鄰居排進佇列。', 'At each square DFS tries the neighbours in this order to find the next unvisited one; BFS adds the neighbours to the queue in this order.');
    } else {
      orderSel.innerHTML = '<option value="abc">' + T('字母順序（A → Z）', 'Alphabetical (A → Z)') + '</option><option value="rev">' + T('倒過來（Z → A）', 'Reversed (Z → A)') + '</option>';
      orderSel.value = state.gr.rev ? 'rev' : 'abc';
      $('orderHint').textContent = T('鄰接串列裡每個點的鄰居照這個順序排列；兩種搜尋都照串列的順序看鄰居。一般圖沒有終點，兩者都會走完。', 'The neighbours in each vertex’s adjacency list are kept in this order, and both searches look at them in list order. A general graph has no goal, so both always run to the end.');
    }
  }
  orderSel.addEventListener('change', function () {
    if (isMaze()) state.mz.order = orderSel.value; else { state.gr.rev = orderSel.value === 'rev'; renderRepr(); }
    rebuild();
  });
  $('early').addEventListener('change', function () { state.early = $('early').checked; if (isMaze()) rebuild(); });
  $('nums').addEventListener('change', function () { state.nums = $('nums').checked; markAll(); requestDraw(); });
  const elSpeed = $('speed');
  const SPEED_MAX = 400;
  if (window.LabNum) window.LabNum.register(elSpeed, {
    toValue: function (pos) { return Math.max(1, Math.round(Math.pow(SPEED_MAX, pos / 100))); },
    toPos: function (v) { return 100 * Math.log(Math.max(1, v)) / Math.log(SPEED_MAX); },
    min: 1, max: SPEED_MAX, decimals: 0
  });
  function readSpeed() {
    const v = window.LabNum ? val(elSpeed) : Math.round(Math.pow(SPEED_MAX, (+elSpeed.value) / 100));
    state.speed = clamp(Math.round(v), 1, SPEED_MAX);
    $('speedo').textContent = String(state.speed);
  }
  elSpeed.addEventListener('input', readSpeed);

  // ======================= 指標：拖曳起點終點、畫牆、點節點 =======================
  function xy(ev) { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  /** 迷宮：指標落在哪個面板的哪一格（含格內的相對位置） */
  function hitMaze(pt, clampIt) {
    if (!L || !isMaze()) return null;
    const n = nOf(), cs = L.cs, S = L.S;
    for (let p = 0; p < 2; p++) {
      const pn = L.panels[p];
      let x = pt.x - pn.mx, y = pt.y - pn.my;
      const inside = x >= -4 && y >= -4 && x <= S + 4 && y <= S + 4;
      if (!inside && !clampIt) continue;
      if (!inside && clampIt && clampIt.p !== p) continue;
      x = clamp(x, 0, S - 0.01); y = clamp(y, 0, S - 0.01);
      const c = Math.floor(x / cs), r = Math.floor(y / cs);
      return { p: p, i: r * n + c, fx: x / cs, fy: y / cs };
    }
    return null;
  }
  function markerAt(pt) {
    if (!isMaze() || !L) return null;
    const rad = Math.max(L.cs * 0.6, 20);
    let best = null, bd = Infinity;
    for (let p = 0; p < 2; p++) ['s', 't'].forEach(function (w) {
      const c = center(p, w === 's' ? state.mz.s : state.mz.t), d = Math.hypot(c.x - pt.x, c.y - pt.y);
      if (d < rad && d < bd) { bd = d; best = { type: w, p: p }; }
    });
    return best;
  }
  /** 畫牆：離格線 0.32 格以內的那面內牆 */
  function wallAt(h) {
    if (!h) return null;
    const n = nOf();
    const vx = Math.round(h.fx), hy = Math.round(h.fy), dx = Math.abs(h.fx - vx), dy = Math.abs(h.fy - hy);
    const r = Math.min(n - 1, Math.floor(h.fy)), c = Math.min(n - 1, Math.floor(h.fx));
    if (dx <= dy && dx < 0.32 && vx > 0 && vx < n) return { i: r * n + vx - 1, d: 1 };
    if (dy < dx && dy < 0.32 && hy > 0 && hy < n) return { i: (hy - 1) * n + c, d: 2 };
    return null;
  }
  function hitNode(pt) {
    if (isMaze() || !L) return -1;
    let best = -1, bd = Infinity;
    for (let p = 0; p < 2; p++) for (let i = 0; i < state.gr.g.V; i++) {
      const q = nodePos(p, i), d = Math.hypot(q.x - pt.x, q.y - pt.y);
      if (d < L.R + 12 && d < bd) { bd = d; best = i; }
    }
    return best;
  }
  cv.addEventListener('pointerdown', function (ev) {
    const pt = xy(ev);
    if (isMaze()) {
      const mk = markerAt(pt);
      if (mk) {
        stopPlay();
        state.drag = { type: mk.type, p: mk.p, id: ev.pointerId, moved: false };
        try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
        ev.preventDefault(); requestDraw();
        return;
      }
      if (state.draw) {
        const h = hitMaze(pt), w = wallAt(h);
        if (!w) return;
        stopPlay();
        const open = !G.isOpen(state.mz.m, w.i, w.d);
        state.drag = { type: 'wall', open: open, key: w.i + ':' + w.d, id: ev.pointerId, n: 0 };
        if (applyWall(w, open)) state.drag.n++;
        try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
        ev.preventDefault();
      }
    } else {
      const i = hitNode(pt);
      if (i >= 0 && i !== state.gr.s) { state.gr.s = i; gsSel.value = String(i); rebuild(); renderRepr(); say(T('起點改成 ' + nameOf(i) + '。', 'Start set to ' + nameOf(i) + '.')); }
    }
  });
  cv.addEventListener('pointermove', function (ev) {
    const pt = xy(ev), dr = state.drag;
    if (dr && dr.id === ev.pointerId) {
      if (dr.type === 's' || dr.type === 't') {
        const h = hitMaze(pt, { p: dr.p });
        if (!h) return;
        const z = state.mz, cur = dr.type === 's' ? z.s : z.t, other = dr.type === 's' ? z.t : z.s;
        if (h.i !== cur && h.i !== other) {
          if (dr.type === 's') { z.s = h.i; } else { z.t = h.i; }
          dr.moved = true;
          rebuild(true); updateInfo();
          say((dr.type === 's' ? T('起點 ', 'Start ') : T('終點 ', 'Goal ')) + nameOf(h.i));
        }
      } else if (dr.type === 'wall') {
        const w = wallAt(hitMaze(pt));
        if (w && (w.i + ':' + w.d) !== dr.key) { dr.key = w.i + ':' + w.d; if (applyWall(w, dr.open)) dr.n++; }
        state.hover = { p: (hitMaze(pt) || {}).p, wall: w };
        requestDraw();
      }
      return;
    }
    if (ev.pointerType !== 'mouse') return;
    if (isMaze()) {
      const mk = markerAt(pt), h = hitMaze(pt), w = state.draw ? wallAt(h) : null;
      const hv = { marker: mk ? mk.type : null, wall: w, p: h ? h.p : -1 };
      const prev = state.hover || {};
      if (hv.marker !== prev.marker || (hv.wall && (!prev.wall || hv.wall.i !== prev.wall.i || hv.wall.d !== prev.wall.d)) || (!hv.wall && prev.wall) || hv.p !== prev.p) { state.hover = hv; requestDraw(); }
      cv.style.cursor = mk ? 'grab' : state.draw && h ? 'crosshair' : 'default';
    } else {
      const i = hitNode(pt), prev = state.hover ? state.hover.node : -1;
      if (i !== prev) { state.hover = { node: i }; requestDraw(); }
      cv.style.cursor = i >= 0 ? 'pointer' : 'default';
    }
  });
  function endDrag() {
    const dr = state.drag;
    if (!dr) return;
    state.drag = null;
    if (dr.type === 'wall') say(T('畫牆：改了 ' + dr.n + ' 面。', 'Walls: changed ' + dr.n + '.') + (state.info.isTree ? T('現在是一棵樹。', ' It is a tree now.') : ''));
    else if (dr.moved) describe();
    requestDraw();
  }
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) { cv.addEventListener(t, endDrag); });
  cv.addEventListener('pointerleave', function () { if (state.hover && !state.drag) { state.hover = null; requestDraw(); } });
  // 手機：按在起點、終點上，或畫牆時按在迷宮上，才不捲動頁面
  cv.addEventListener('touchstart', function (ev) {
    if (!isMaze() || !ev.touches.length) return;
    const t = ev.touches[0], pt = xy(t);
    if (markerAt(pt) || (state.draw && hitMaze(pt))) ev.preventDefault();
  }, { passive: false });
  cv.addEventListener('touchmove', function (ev) { if (state.drag) ev.preventDefault(); }, { passive: false });

  // ---------- 鍵盤（LabKeys） ----------
  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('走訪的畫布', 'Traversal canvas'),
      items: [
        { name: function () { return T('起點', 'Start'); },
          move: function (dx, dy) {
            if (!isMaze()) { const Vn = state.gr.g.V, d = dx || dy; if (!d) return false; state.gr.s = (state.gr.s + d + Vn) % Vn; gsSel.value = String(state.gr.s); rebuild(); renderRepr(); return true; }
            const n = nOf(), z = state.mz, r = clamp(((z.s / n) | 0) + dy, 0, n - 1), c = clamp(z.s % n + dx, 0, n - 1);
            return setST(r * n + c, z.t);
          },
          describe: function () { return T('起點：', 'Start: ') + nameOf(isMaze() ? state.mz.s : state.gr.s); } },
        { name: function () { return T('終點', 'Goal'); },
          move: function (dx, dy) {
            if (!isMaze()) return false;
            const n = nOf(), z = state.mz, r = clamp(((z.t / n) | 0) + dy, 0, n - 1), c = clamp(z.t % n + dx, 0, n - 1);
            return setST(z.s, r * n + c);
          },
          describe: function () { return isMaze() ? T('終點：', 'Goal: ') + nameOf(state.mz.t) : T('一般圖沒有終點', 'A general graph has no goal'); } }
      ],
      onChange: function () { requestDraw(); }
    });
  }

  // ---------- 測試用介面（Playwright 腳本使用；不影響一般操作） ----------
  window.TraversalLab = {
    state: state,
    mode: setMode,
    size: function (n) { window.LabNum ? window.LabNum.set(elSize, n) : (elSize.value = n, elSize.dispatchEvent(new Event('input'))); },
    gen: function (g) { genSel.value = g; genSel.dispatchEvent(new Event('change')); },
    loops: function (p) { window.LabNum ? window.LabNum.set(elLoops, p) : (elLoops.value = p, elLoops.dispatchEvent(new Event('input'))); },
    newMaze: function () { $('newMaze').click(); },
    wall: function (i, d, open) { return applyWall({ i: i, d: d }, open === undefined ? !G.isOpen(state.mz.m, i, d) : !!open); },
    st: function (s, t) { return setST(s, t); },
    order: function (o) { orderSel.value = o; orderSel.dispatchEvent(new Event('change')); },
    early: function (on) { $('early').checked = !!on; $('early').dispatchEvent(new Event('change')); },
    edge: toggleEdge,
    gs: function (i) { gsSel.value = String(i); gsSel.dispatchEvent(new Event('change')); },
    step: function (n) { for (let i = 0; i < (n || 1); i++) advance(1, 'step'); },
    end: function () { advance(state.L, 'end'); },
    reset: function () { resetRun(); },
    /** 第 p 個面板第 i 格中心在視窗中的座標（拖曳測試用） */
    cellXY: function (p, i) { const r = cv.getBoundingClientRect(), c = center(p, i); return { x: r.left + c.x, y: r.top + c.y }; },
    layout: function () { return L; }
  };

  // ======================= 啟動 =======================
  function themeChanged() {
    readColors();
    pats = null; layers = null; wallCv = null;
    for (const id in lastHTML) delete lastHTML[id];
    updateSoundButton();
    fillOrders();
    if (!isMaze()) { fillStarts(); renderRepr(); }
    renderLog();
    updateInfo();
    describe();
    resize();
    updateAll();
  }
  readColors();
  makePatterns();
  readSpeed();
  state.mz.n = Math.round(val(elSize)); $('sizeo').textContent = String(state.mz.n);
  state.mz.t = state.mz.n * state.mz.n - 1;
  state.mz.loops = Math.round(val(elLoops)); $('loopso').textContent = state.mz.loops + ' %';
  state.mz.gen = genSel.value;
  state.gr.V = Math.round(val(elGv)); $('gvo').textContent = String(state.gr.V);
  state.gr.preset = presetSel.value; elGv.disabled = state.gr.preset === 'sample';
  state.early = $('early').checked; state.nums = $('nums').checked;
  regen(); loadGraph();
  updateSoundButton();
  renderLog();
  state.mode = '';
  setMode('maze');
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden && state.playing) { stopPlay(); updateAll(); } });
})();
