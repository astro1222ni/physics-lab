/* shortest-path.js — 「最短路徑：Dijkstra 演算法」的畫面與互動（計算在 shortest-path-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 每種演算法先由核心完整跑一遍、記下每個基本步驟（trace）；畫面照步驟播放，標籤立刻改變（物理誠實：動畫只是裝飾）。
 * 任務事件只在使用者操作之後送出（見 js/missions/shortest-path.js 開頭的說明）。
 */
(function () {
  'use strict';
  const S = window.ShortestPathCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  // 程式改滑桿：先清掉打字的精確值再改位置（LabNum.set 會觸發 input 事件，這裡不要）
  const setSlider = function (el, v) { if (window.LabNum) window.LabNum.clear(el); el.value = String(v); };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const alpha = D.alpha, shade = D.shade;
  const INF = Infinity;

  // ======================= 狀態 =======================
  const store = {};   // 各模式各自保存的圖、起點、終點（切回來時保留修改）
  const state = {
    mode: 'taiwan', g: null, s: 1, t: 12, algo: 'dijkstra', early: false,
    tr: null, k: 0, st: null, playing: false, acc: 0, speed: 3,
    manual: true, done: false, result: null,
    sel: 0, selShown: false, pick: 't', showW: true, showTree: true,
    rand: { n: 10, seed: 1 }, grid: { rows: 4, cols: 6, seed: 1 },
    log: [], fx: [], hover: null
  };

  // ======================= 色彩 =======================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'accent-soft', 'surface',
      'sp-land', 'sp-sea', 'sp-coast', 'sp-road', 'sp-node', 'sp-front', 'sp-done', 'sp-cur', 'sp-path', 'sp-check', 'sp-bad', 'sp-ok', 'sp-alt']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    bg = null;
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + px + 'px ' + FONT; }
  function num(x) { return x === INF ? '∞' : x === -INF ? '−∞' : (x < 0 ? '−' + Math.abs(x) : String(x)); }
  function unit() { return state.mode === 'taiwan' ? ' km' : ''; }

  // ======================= 圖與名字 =======================
  function makeGraph(mode) {
    if (mode === 'taiwan') return { g: S.taiwanGraph(), s: 1, t: 12 };
    if (mode === 'random') { const g = S.randomGraph(state.rand.n, state.rand.seed); return { g: g, s: 0, t: g.nodes.length - 1 }; }
    if (mode === 'grid') { const g = S.gridGraph(state.grid.rows, state.grid.cols, state.grid.seed); return { g: g, s: 0, t: g.nodes.length - 1 }; }
    return { g: S.negGraph(), s: 0, t: 5 };
  }
  function nameOf(i) {
    const n = state.g.nodes[i];
    if (!n) return '';
    if (state.mode === 'grid') return '(' + (n.r + 1) + ',' + (n.c + 1) + ')';
    return T(n.zh, n.en);
  }
  function edgeName(e) {
    const ed = state.g.edges[e];
    return nameOf(ed.a) + (state.g.directed ? ' → ' : '—') + nameOf(ed.b);
  }
  function algoName(a) { return a === 'bfs' ? 'BFS' : a === 'bf' ? 'Bellman–Ford' : 'Dijkstra'; }
  function modeName(m) { return m === 'taiwan' ? T('臺灣地圖', 'Taiwan map') : m === 'random' ? T('隨機圖', 'Random graph') : m === 'grid' ? T('方格', 'Grid') : T('負權重', 'Negative weights'); }

  // ======================= 版面 =======================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const stage = $('stage');
  let dpr = 1, cw = 320, ch = 520, L = null, bg = null;
  function layout() {
    const w = cw, narrow = w < 560, g = state.g, m = state.mode;
    const pos = [];
    let H, r, sc, fit;
    if (m === 'taiwan') {
      const pts = S.COAST.map(function (p) { return S.project(p[0], p[1]); });
      let x0 = INF, x1 = -INF, y0 = INF, y1 = -INF;
      pts.forEach(function (p) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
      const mx = narrow ? 30 : 92, my = 16;
      // 寬螢幕放大一點（中部的城市才不會擠在一起），但整張地圖的高度不超過視窗
      const maxH = Math.max(narrow ? 480 : 560, (window.innerHeight || 800) - 100);
      sc = Math.min((w - 2 * mx) / (x1 - x0), (maxH - 2 * my - 6) / (y1 - y0), narrow ? 1.7 : 2.0);
      H = Math.round((y1 - y0) * sc + 2 * my + 6);
      const ox = (w - (x1 - x0) * sc) / 2 - x0 * sc, oy = my - y0 * sc;
      fit = function (x, y) { return { x: ox + x * sc, y: oy + y * sc }; };
      g.nodes.forEach(function (n) { pos.push(fit(n.x, n.y)); });
      r = narrow ? 7 : 8.5;
      return { pos: pos, r: r, H: H, sc: sc, fit: fit, coast: pts.map(function (p) { return fit(p.x, p.y); }), narrow: narrow };
    }
    if (m === 'grid') {
      // 窄螢幕而且行數比列數多時，把方格轉 90°（第 1 列在最左邊），點才不會擠在一起
      const turn = narrow && g.cols > g.rows;
      const pad = 32, cols = turn ? g.rows : g.cols, rows = turn ? g.cols : g.rows;
      const sp = Math.min((w - 2 * pad) / (cols - 1), 96);
      H = Math.round(sp * (rows - 1) + 2 * pad + 6);
      const ox = (w - sp * (cols - 1)) / 2;
      g.nodes.forEach(function (n) { pos.push({ x: ox + (turn ? n.r : n.c) * sp, y: pad + 3 + (turn ? n.c : n.r) * sp }); });
      r = Math.max(10, Math.min(17, sp * 0.28));
      return { pos: pos, r: r, H: H, sp: sp, narrow: narrow, turn: turn };
    }
    // 隨機圖與負權重：依點實際分布的範圍縮放（四周留標籤的空間）；隨機圖在窄螢幕上轉成直的
    let x0 = INF, x1 = -INF, y0 = INF, y1 = -INF;
    g.nodes.forEach(function (n) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); });
    const rot = m === 'random' && narrow && (x1 - x0) > (y1 - y0);
    const bw = Math.max(0.3, rot ? y1 - y0 : x1 - x0), bh = Math.max(0.3, rot ? x1 - x0 : y1 - y0);
    const padX = m === 'neg' ? (narrow ? 44 : 54) : 46, padY = m === 'neg' ? 52 : 46;
    const want = (w - 2 * padX) / bw * bh + 2 * padY;
    if (rot) H = Math.round(Math.min(640, want));
    else H = Math.round(Math.min(m === 'neg' ? 440 : 540, Math.max(m === 'neg' ? (narrow ? 340 : 300) : 320, want)));
    sc = Math.min((w - 2 * padX) / bw, (H - 2 * padY) / bh);
    const ox = (w - bw * sc) / 2, oy = (H - bh * sc) / 2;
    g.nodes.forEach(function (n) {
      const x = rot ? n.y - y0 : n.x - x0, y = rot ? n.x - x0 : n.y - y0;
      pos.push({ x: ox + x * sc, y: oy + y * sc });
    });
    r = m === 'neg' ? 17 : narrow ? 12 : 13;
    return { pos: pos, r: r, H: H, narrow: narrow };
  }
  function resize() {
    const w = cv.clientWidth;
    if (!w || !state.g) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layout();
    ch = L.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    bg = null;
    placeLabels();
    if (state.mode === 'grid') updateMapNote();
    requestDraw();
  }

  /**
   * 隨機圖與負權重的距離標籤「d = …」（起點、終點、負權重的「正確 …」寫在它下面一行）：
   * 每個點試 8 個方向，選蓋到別的點、道路、權重與其他標籤最少的位置。
   */
  function placeTags() {
    const g = state.g, P = L.pos, r = L.r, two = state.mode === 'neg';
    const W = 58, H1 = 18;
    const obs = [];
    P.forEach(function (p) { obs.push([p.x - r - 2, p.y - r - 2, p.x + r + 2, p.y + r + 2]); });
    if (state.showW) g.edges.forEach(function (ed) { const a = P[ed.a], b = P[ed.b], f = g.directed ? 0.46 : 0.5, mx = a.x + (b.x - a.x) * f, my = a.y + (b.y - a.y) * f; obs.push([mx - 11, my - 9, mx + 11, my + 9]); });
    const pts = [];
    g.edges.forEach(function (ed) {
      const a = P[ed.a], b = P[ed.b], n = Math.max(2, Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 4));
      for (let k = 1; k < n; k++) pts.push([a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n]);
    });
    const overlap = function (a, b) { const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]); return w > 0 && h > 0 ? w * h : 0; };
    const placed = [];
    // [水平方向, 垂直方向, 偏好成本]：上、下、右、左、四個斜角
    const DIRS = [[0, -1, 0], [0, 1, 4], [1, 0, 6], [-1, 0, 6], [1, -1, 8], [-1, -1, 8], [1, 1, 10], [-1, 1, 10]];
    L.tags = g.nodes.map(function (n, i) {
      const H = two || i === state.s || i === state.t ? 2 * H1 + 2 : H1;
      const p = P[i];
      let best = null;
      DIRS.forEach(function (d) {
        let x0, y0;
        if (d[0] === 0) { x0 = p.x - W / 2; y0 = d[1] < 0 ? p.y - r - 5 - H : p.y + r + 5; }
        else if (d[1] === 0) { x0 = d[0] > 0 ? p.x + r + 5 : p.x - r - 5 - W; y0 = p.y - H / 2; }
        else { x0 = d[0] > 0 ? p.x + r * 0.6 : p.x - r * 0.6 - W; y0 = d[1] < 0 ? p.y - r * 0.6 - H : p.y + r * 0.6; }
        const b = [x0, y0, x0 + W, y0 + H];
        let cost = d[2];
        if (b[0] < 2 || b[1] < 2 || b[2] > cw - 2 || b[3] > L.H - 2) cost += 400;
        obs.forEach(function (o) { cost += overlap(b, o) / 5; });
        placed.forEach(function (o) { cost += overlap(b, o) / 2; });
        pts.forEach(function (q) { if (q[0] > b[0] && q[0] < b[2] && q[1] > b[1] && q[1] < b[3]) cost += 2.5; });
        if (!best || cost < best.cost) best = { x: x0 + W / 2, y: y0, cost: cost, b: b };
      });
      placed.push(best.b);
      return best;
    });
  }

  /**
   * 臺灣地圖的名字與距離標籤：每個城市試 8 個位置（右、左、上、下、右上、右下、左上、左下），
   * 選蓋到別的點、道路、權重與其他標籤最少的那個（貪心；版面改變或權重開關時重算，播放時位置固定不跳動）。
   */
  function placeLabels() {
    if (!L) return;
    if (state.mode === 'random' || state.mode === 'neg') { placeTags(); return; }
    if (state.mode !== 'taiwan') return;
    const g = state.g, P = L.pos, r = L.r;
    const nameH = L.narrow ? 13 : 14, pillH = 15, pillW = L.narrow ? 30 : 32, gap = r + 5;
    ctx.font = fnt(L.narrow ? 11.5 : 12.5, 600);
    const nameW = g.nodes.map(function (n, i) { return ctx.measureText(nameOf(i)).width; });
    const obs = [];
    P.forEach(function (p) { obs.push([p.x - r - 3, p.y - r - 3, p.x + r + 3, p.y + r + 3]); });
    if (state.showW) g.edges.forEach(function (ed) { const a = P[ed.a], b = P[ed.b], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; obs.push([mx - 12, my - 7, mx + 12, my + 7]); });
    const pts = [];
    g.edges.forEach(function (ed) {
      const a = P[ed.a], b = P[ed.b], n = Math.max(2, Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 4));
      for (let k = 1; k < n; k++) pts.push([a.x + (b.x - a.x) * k / n, a.y + (b.y - a.y) * k / n]);
    });
    const box = function (i, c) {
      const p = P[i], W = Math.max(nameW[i], pillW) + 2, dy = c.dy || 0;
      if (c.side === 'r') return [p.x + gap - 1, p.y - nameH - 1 + dy, p.x + gap + W, p.y + pillH + 2 + dy];
      if (c.side === 'l') return [p.x - gap - W, p.y - nameH - 1 + dy, p.x - gap + 1, p.y + pillH + 2 + dy];
      if (c.side === 't') return [p.x - W / 2, p.y - gap - nameH - pillH - 5, p.x + W / 2, p.y - gap + 1];
      return [p.x - W / 2, p.y + gap - 1, p.x + W / 2, p.y + gap + nameH + pillH + 5];
    };
    const overlap = function (a, b) { const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]); return w > 0 && h > 0 ? w * h : 0; };
    const placed = [];
    L.lab = g.nodes.map(function (n, i) {
      const pref = n.side || 'r';
      const cands = [{ side: pref, dy: 0, pen: 0 }];
      ['r', 'l', 't', 'b'].forEach(function (sd) { if (sd !== pref) cands.push({ side: sd, dy: 0, pen: 6 }); });
      ['r', 'l'].forEach(function (sd) { cands.push({ side: sd, dy: -12, pen: 9 }, { side: sd, dy: 12, pen: 9 }); });
      let best = null;
      cands.forEach(function (c) {
        const b = box(i, c);
        let cost = c.pen;
        if (b[0] < 2 || b[1] < 2 || b[2] > cw - 2 || b[3] > L.H - 2) cost += 400;
        obs.forEach(function (o, k) { if (k !== i) cost += overlap(b, o) / 6; });
        placed.forEach(function (o) { cost += overlap(b, o) / 2; });
        pts.forEach(function (q) { if (q[0] > b[0] && q[0] < b[2] && q[1] > b[1] && q[1] < b[3]) cost += 2.5; });
        if (!best || cost < best.cost) best = { side: c.side, dy: c.dy, cost: cost, b: b };
      });
      placed.push(best.b);
      return best;
    });
  }

  // ======================= 背景（離屏圖層） =======================
  const RIDGE = [[24.72, 121.47], [24.35, 121.3], [23.95, 121.15], [23.47, 120.96], [23.0, 120.86], [22.5, 120.76], [22.15, 120.8]];
  function drawBackground() {
    const c = document.createElement('canvas');
    c.width = cv.width; c.height = cv.height;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = cw, h = ch;
    if (state.mode === 'taiwan') {
      // 海
      const sea = g.createLinearGradient(0, 0, 0, h);
      sea.addColorStop(0, shade(C['sp-sea'], D.dark ? 0.04 : 0.35));
      sea.addColorStop(1, shade(C['sp-sea'], D.dark ? -0.2 : -0.04));
      g.fillStyle = sea; g.fillRect(0, 0, w, h);
      // 經緯線
      g.save();
      g.strokeStyle = alpha(C.text, D.dark ? 0.07 : 0.06); g.lineWidth = 1;
      g.setLineDash([2, 4]);
      [22, 23, 24, 25].forEach(function (lat) {
        const p = S.project(lat, 120); const y = L.fit(p.x, p.y).y;
        g.beginPath(); g.moveTo(0, Math.round(y) + 0.5); g.lineTo(w, Math.round(y) + 0.5); g.stroke();
        D.haloText(g, T('北緯 ' + lat + '°', lat + '°N'), 6, y - 4, alpha(C.muted, 0.8), 'left', 'alphabetic', fnt(10.5, 500));
      });
      [120, 121, 122].forEach(function (lon) {
        const p = S.project(23.6, lon); const x = L.fit(p.x, p.y).x;
        if (x < 4 || x > w - 4) return;
        g.beginPath(); g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, h); g.stroke();
        D.haloText(g, T('東經 ' + lon + '°', lon + '°E'), x + 4, h - 6, alpha(C.muted, 0.8), 'left', 'alphabetic', fnt(10.5, 500));
      });
      g.restore();
      // 島
      const isle = function () { g.beginPath(); L.coast.forEach(function (p, i) { if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }); g.closePath(); };
      g.save();
      g.shadowColor = D.shadowInk(D.dark ? 0.6 : 0.22); g.shadowBlur = 14; g.shadowOffsetY = 4;
      isle();
      const land = g.createLinearGradient(0, 0, w * 0.3, h);
      land.addColorStop(0, shade(C['sp-land'], D.dark ? 0.08 : 0.4));
      land.addColorStop(1, shade(C['sp-land'], D.dark ? -0.12 : -0.05));
      g.fillStyle = land; g.fill();
      g.restore();
      // 中央山脈（示意的柔和陰影）
      g.save();
      isle(); g.clip();
      const ridge = function (lw, a) {
        g.beginPath();
        RIDGE.forEach(function (q, i) { const p = S.project(q[0], q[1]); const f = L.fit(p.x, p.y); if (i) g.lineTo(f.x, f.y); else g.moveTo(f.x, f.y); });
        g.strokeStyle = alpha(shade(C['sp-coast'], D.dark ? -0.1 : -0.25), a);
        g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
      };
      ridge(42 * L.sc / 1.5, D.dark ? 0.16 : 0.1);
      ridge(22 * L.sc / 1.5, D.dark ? 0.16 : 0.1);
      ridge(8 * L.sc / 1.5, D.dark ? 0.14 : 0.1);
      g.restore();
      isle();
      g.strokeStyle = C['sp-coast']; g.lineWidth = 1.3; g.lineJoin = 'round'; g.stroke();
      g.save(); isle(); g.clip();
      g.strokeStyle = 'rgba(255,255,255,' + (D.dark ? 0.06 : 0.55) + ')'; g.lineWidth = 3; g.stroke();
      g.restore();
      // 比例尺
      const km = 50, len = km * L.sc, bx = 12, by = h - 30;
      g.fillStyle = alpha(C['canvas-bg'], 0.75);
      D.roundRect(g, bx - 6, by - 18, len + 12, 28, 6); g.fill();
      g.strokeStyle = C.text; g.lineWidth = 1.5; g.lineCap = 'butt';
      g.beginPath(); g.moveTo(bx, by - 4); g.lineTo(bx, by + 2); g.lineTo(bx + len, by + 2); g.lineTo(bx + len, by - 4); g.stroke();
      g.fillStyle = C.text; g.fillRect(bx, by - 1, len / 2, 3);
      D.haloText(g, '50 km', bx + len / 2, by - 7, C.text, 'center', 'alphabetic', fnt(11, 600));
      // 指北
      const nx = w - 22, ny = 26;
      g.beginPath(); g.moveTo(nx, ny - 13); g.lineTo(nx + 6, ny + 5); g.lineTo(nx, ny + 1); g.lineTo(nx - 6, ny + 5); g.closePath();
      g.fillStyle = alpha(C.text, 0.75); g.fill();
      D.haloText(g, 'N', nx, ny + 18, C.muted, 'center', 'alphabetic', fnt(11, 700));
    } else {
      D.backdrop(g, w, h);
      // 淡淡的點陣
      g.fillStyle = alpha(C.text, D.dark ? 0.08 : 0.07);
      for (let y = 12; y < h; y += 24) for (let x = 12; x < w; x += 24) { g.beginPath(); g.arc(x, y, 0.9, 0, Math.PI * 2); g.fill(); }
    }
    bg = c;
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
      let n = Math.floor(state.acc);
      if (n > 0) { state.acc -= n; advance(Math.min(n, 60), 'play'); }
    }
    state.fx = state.fx.filter(function (f) { return t < f.t0 + f.dur; });
    draw(t);
    if (state.playing || state.fx.length) requestDraw(); else lastT = 0;
  }
  function lastStep() { return state.tr && state.k > 0 ? state.tr.steps[state.k - 1] : null; }
  /** 正在處理的點：Dijkstra／BFS 最近一次取出、而且它的邊還在檢查中的點 */
  function currentNode() {
    const sp = lastStep();
    if (!sp || state.algo === 'bf' || state.st.end) return -1;
    return sp.u;
  }
  function goalPath() {
    const st = state.st;
    if (!st) return null;
    const fixed = state.algo === 'bf' ? st.end : st.status[state.t] === 'done';
    if (!fixed) return null;
    return S.pathTo(st.prev, state.s, state.t);
  }
  function seg(a, b, inset) {
    const p = L.pos[a], q = L.pos[b];
    const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
    const ia = inset ? inset[0] : 0, ib = inset ? inset[1] : 0;
    return { x0: p.x + dx / len * ia, y0: p.y + dy / len * ia, x1: q.x - dx / len * ib, y1: q.y - dy / len * ib, ux: dx / len, uy: dy / len, len: len };
  }
  function lineWidthBase() { return state.mode === 'taiwan' ? (L.narrow ? 3.4 : 4) : 5; }

  function draw(t) {
    if (!L || !state.st) return;
    const w = cw, h = ch, g = state.g, st = state.st, r = L.r;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!bg) drawBackground();
    ctx.drawImage(bg, 0, 0, w, h);
    const sp = lastStep();
    const lw = lineWidthBase();
    const hovE = state.hover && state.hover.type === 'e' ? state.hover.i : -1;
    const hovN = state.hover && state.hover.type === 'n' ? state.hover.i : -1;

    // ---- 邊（道路） ----
    g.edges.forEach(function (ed, e) {
      const sg = seg(ed.a, ed.b, [r * 0.6, g.directed ? r + 3 : r * 0.6]);
      if (ed.closed) {
        ctx.save();
        ctx.setLineDash([5, 5]); ctx.lineCap = 'round';
        ctx.strokeStyle = alpha(C.muted, 0.55); ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(sg.x0, sg.y0); ctx.lineTo(sg.x1, sg.y1); ctx.stroke();
        ctx.restore();
        return;
      }
      if (e === hovE || (state.selShown && e === state.sel)) {
        ctx.save();
        ctx.strokeStyle = alpha(C.accent, e === state.sel && state.selShown ? 0.45 : 0.3);
        ctx.lineWidth = lw + 8; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sg.x0, sg.y0); ctx.lineTo(sg.x1, sg.y1); ctx.stroke();
        ctx.restore();
      }
      D.tube(ctx, function (c) { c.moveTo(sg.x0, sg.y0); c.lineTo(sg.x1, sg.y1); }, C['sp-road'], lw);
      if (g.directed) drawHead(sg.x1, sg.y1, sg.ux, sg.uy, shade(C['sp-road'], D.dark ? 0.15 : -0.15), 9);
    });

    // ---- 最短路徑樹（前一站箭頭） ----
    if (state.showTree) {
      for (let v = 0; v < g.nodes.length; v++) {
        const u = st.prev[v];
        if (u < 0 || v === state.s && state.algo !== 'bf') continue;
        const fixed = state.algo === 'bf' ? st.end : st.status[v] === 'done';
        const col = fixed ? C['sp-done'] : C['sp-front'];
        const sg = seg(u, v, [r + 2, r + 3]);
        if (sg.len < 2 * r + 10) continue;
        D.arrow(ctx, sg.x0, sg.y0, sg.x1, sg.y1, col, state.mode === 'taiwan' ? 2.2 : 2.6, fixed ? {} : { dash: [6, 4] });
      }
    }

    // ---- 另一種演算法的路線（虛線，對照用） ----
    const res = state.result;
    if (res && res.ghost && st.end) {
      ctx.save();
      ctx.setLineDash([7, 6]); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = alpha(C['canvas-bg'], 0.85); ctx.lineWidth = 5.5;
      pathStroke(res.ghost, 5); ctx.stroke();
      ctx.strokeStyle = C['sp-alt']; ctx.lineWidth = 2.6;
      pathStroke(res.ghost, 5); ctx.stroke();
      ctx.restore();
    }

    // ---- 最短路線 ----
    const gp = goalPath();
    if (gp && gp.length > 1) {
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowColor = alpha(C['sp-path'], D.dark ? 0.7 : 0.45); ctx.shadowBlur = 10;
      ctx.strokeStyle = alpha(C['sp-path'], 0.9); ctx.lineWidth = lw + 3;
      pathStroke(gp, 0); ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = alpha(shade(C['sp-path'], 0.6), 0.75); ctx.lineWidth = Math.max(1, lw * 0.35);
      ctx.translate(0, -lw * 0.25);
      pathStroke(gp, 0); ctx.stroke();
      ctx.restore();
    }

    // ---- 正在檢查的邊（算式標籤最後才畫，放在最上層） ----
    let checkTag = null;
    if (sp && (sp.type === 'check' || sp.type === 'late')) {
      const late = sp.type === 'late';
      const col = late ? C['sp-bad'] : C['sp-check'];
      const sg = seg(sp.u, sp.v, [r + 1, r + 3]);
      D.arrow(ctx, sg.x0, sg.y0, sg.x1, sg.y1, col, lw * 0.9 + 1, {});
      const step = state.algo === 'bfs' ? 1 : sp.w;
      const sum = (sp.nd === INF ? '∞' : num(sp.nd - step)) + ' + ' + (step < 0 ? '(' + num(step) + ')' : num(step)) + ' = ' + num(sp.nd);
      checkTag = { txt: sum + (sp.nd === INF ? '' : (sp.ok || late ? ' < ' : ' ≥ ') + num(sp.old)) + (late ? ' !' : sp.ok ? ' ✓' : ''), x: (sg.x0 + sg.x1) / 2, y: (sg.y0 + sg.y1) / 2 - 9, col: col };
    }

    // ---- 裝飾的光點與波紋 ----
    state.fx.forEach(function (f) {
      const u = Math.max(0, Math.min(1, (t - f.t0) / f.dur));
      if (f.type === 'pulse') {
        const p = L.pos[f.a], q = L.pos[f.b];
        const x = p.x + (q.x - p.x) * u, y = p.y + (q.y - p.y) * u;
        const gr = ctx.createRadialGradient(x, y, 0, x, y, 10);
        gr.addColorStop(0, alpha(f.color, 0.9 * (1 - u * 0.3)));
        gr.addColorStop(1, alpha(f.color, 0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
      } else D.ripple(ctx, L.pos[f.n].x, L.pos[f.n].y, r + 2, u, f.color);
    });

    // ---- 權重 ----
    g.edges.forEach(function (ed, e) {
      const show = state.showW || e === state.sel && state.selShown || e === hovE;
      if (!show) return;
      const p = L.pos[ed.a], q = L.pos[ed.b];
      let mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      if (g.directed) { mx = p.x + (q.x - p.x) * 0.46; my = p.y + (q.y - p.y) * 0.46; }
      const edited = ed.w !== ed.w0;
      const txt = ed.closed ? '✕' : num(ed.w);
      const col = ed.closed ? C.muted : ed.w < 0 ? C['sp-bad'] : edited ? C.accent : alpha(C.text, 0.82);
      const f = state.mode === 'taiwan' ? fnt(L.narrow ? 10 : 10.5, edited ? 700 : 600) : fnt(12, edited ? 700 : 600);
      ctx.font = f;
      const tw = ctx.measureText(txt).width + 8, th = state.mode === 'taiwan' ? 14 : 17;
      D.roundRect(ctx, mx - tw / 2, my - th / 2, tw, th, th / 2);
      ctx.fillStyle = alpha(C['canvas-bg'], D.dark ? 0.88 : 0.92); ctx.fill();
      ctx.strokeStyle = alpha(col, edited || ed.w < 0 ? 0.7 : 0.25); ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, mx, my + 0.5);
      if (g.directed && state.mode === 'neg') {
        const ex = p.x + (q.x - p.x) * 0.46, ey = p.y + (q.y - p.y) * 0.46;
        const nx = -(q.y - p.y), ny = q.x - p.x, nl = Math.hypot(nx, ny) || 1;
        const sgn = ny / nl > 0 ? -1 : 1;
        D.haloText(ctx, 'e' + (e + 1), ex + nx / nl * 17 * sgn, ey + ny / nl * 17 * sgn + 4, alpha(C.muted, 0.95), 'center', 'alphabetic', fnt(10.5, 600));
      }
    });

    // ---- 點 ----
    const cur = currentNode();
    const wrong = res && res.wrongSet && st.end ? res.wrongSet : null;
    g.nodes.forEach(function (n, i) {
      const p = L.pos[i];
      const status = state.algo === 'bf' && st.end && st.d[i] < INF ? 'done' : st.status[i];
      const col = status === 'done' ? C['sp-done'] : status === 'queue' ? C['sp-front'] : C['sp-node'];
      if (state.mode === 'taiwan') D.contactShadow(ctx, p.x, p.y + r * 0.85, r * 0.9, 0);
      if (i === cur) {
        const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t / 160);
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 5 + pulse * 2, 0, Math.PI * 2);
        ctx.fillStyle = alpha(C['sp-cur'], 0.18 + 0.12 * pulse); ctx.fill();
        ctx.strokeStyle = C['sp-cur']; ctx.lineWidth = 2; ctx.stroke();
      }
      if (i === hovN) { ctx.beginPath(); ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2); ctx.strokeStyle = alpha(C.accent, 0.7); ctx.lineWidth = 2; ctx.stroke(); }
      D.ball(ctx, p.x, p.y, r, col, { glow: status === 'none' ? 0 : D.dark ? 0.35 : 0.12 });
      // 起點：一圈實線；終點：兩圈（靶）
      if (i === state.s) {
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 3.5, 0, Math.PI * 2);
        ctx.strokeStyle = C.text; ctx.lineWidth = 2.2; ctx.stroke();
      }
      if (i === state.t) {
        ctx.save();
        ctx.strokeStyle = C['sp-path']; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 3.5, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      if (wrong && wrong[i]) {
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 4.5, 0, Math.PI * 2);
        ctx.strokeStyle = C['sp-bad']; ctx.lineWidth = 2.5; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
      }
      // 點裡面的字
      if (state.mode === 'random' || state.mode === 'neg') {
        ctx.font = fnt(state.mode === 'neg' ? 15 : 13, 700);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = status === 'none' ? (D.dark ? '#e5e9f0' : '#ffffff') : '#ffffff';
        ctx.strokeStyle = alpha(shade(col, -0.5), 0.6); ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
        ctx.strokeText(nameOf(i), p.x, p.y + 0.5); ctx.fillText(nameOf(i), p.x, p.y + 0.5);
      } else if (state.mode === 'grid') {
        const txt = num(st.d[i]);
        ctx.font = fnt(txt.length > 2 ? Math.max(9, r * 0.62) : Math.max(10, r * 0.8), 700);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = alpha(shade(col, -0.5), 0.6); ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
        ctx.strokeText(txt, p.x, p.y + 0.5); ctx.fillText(txt, p.x, p.y + 0.5);
      }
    });

    // ---- 名字與距離標籤 ----
    g.nodes.forEach(function (n, i) {
      const p = L.pos[i];
      const status = state.algo === 'bf' && st.end && st.d[i] < INF ? 'done' : st.status[i];
      const dcol = status === 'done' ? shade(C['sp-done'], D.dark ? 0.1 : -0.1) : status === 'queue' ? shade(C['sp-front'], D.dark ? 0 : -0.2) : C.muted;
      const dtxt = num(st.d[i]);
      const isWrong = wrong && wrong[i];
      if (state.mode === 'taiwan') {
        const side = n.side;
        const nf = fnt(L.narrow ? 11.5 : 12.5, 600);
        const name = nameOf(i);
        // 名字和距離標在同一側（位置由 placeLabels 選好）；還沒找到（∞）的點不標距離，畫面比較乾淨
        const lb = (L.lab && L.lab[i]) || { side: side, dy: 0 };
        const gap = r + 5, lr = lb.side === 'l' || lb.side === 'r', dy = lb.dy || 0;
        const nx = lb.side === 'l' ? p.x - gap : lb.side === 'r' ? p.x + gap : p.x;
        const na = lb.side === 'l' ? 'right' : lb.side === 'r' ? 'left' : 'center';
        const ny = lr ? p.y - 7 + dy : lb.side === 't' ? p.y - gap - 3 : p.y + gap + 11;
        D.haloText(ctx, name, nx, ny, i === state.s || i === state.t ? C.text : alpha(C.text, 0.85), na, lr ? 'middle' : 'alphabetic', nf);
        if (st.d[i] !== INF || isWrong) {
          const pf = fnt(L.narrow ? 10.5 : 11, 700);
          const yb = lr ? p.y + 16 + dy : lb.side === 't' ? p.y - gap - 18 : p.y + gap + 29;
          D.pill(ctx, dtxt, nx, yb, isWrong ? C['sp-bad'] : dcol, na, pf);
        }
      } else if (state.mode !== 'grid') {
        const tg = (L.tags && L.tags[i]) || { x: p.x, y: p.y - r - 24 };
        ctx.globalAlpha = status === 'none' ? 0.65 : 1;
        D.pill(ctx, 'd = ' + dtxt, tg.x, tg.y + 18, isWrong ? C['sp-bad'] : dcol, 'center', fnt(12, 700));
        ctx.globalAlpha = 1;
        // 第二行：負權重算錯時寫正確值；否則標起點、終點
        const f2 = fnt(11, 700);
        if (isWrong) D.pill(ctx, T('正確 ', 'true ') + num(res.truth[i]), tg.x, tg.y + 37, C['sp-bad'], 'center', f2);
        else if (i === state.s) D.pill(ctx, T('起點', 'start'), tg.x, tg.y + 37, C.text, 'center', f2);
        else if (i === state.t) D.pill(ctx, T('終點', 'goal'), tg.x, tg.y + 37, C['sp-path'], 'center', f2);
      }
    });

    // ---- 方格的起點、終點小標 ----
    if (state.mode === 'grid') {
      const ps = L.pos[state.s], pt = L.pos[state.t], off = r + 18;
      D.pill(ctx, T('起點', 'start'), ps.x, ps.y + off, C.text, 'center', fnt(11, 700));
      if (state.t !== state.s) D.pill(ctx, T('終點', 'goal'), pt.x, pt.y + off, C['sp-path'], 'center', fnt(11, 700));
    }

    if (checkTag) {
      // 算式標籤放在邊的附近、盡量不蓋住點和名字：試幾個位置，選重疊最少又最靠近邊的中點
      const f = fnt(state.mode === 'taiwan' ? 11.5 : 12.5, 700);
      ctx.font = f;
      const tw = ctx.measureText(checkTag.txt).width + 14, th = 19;
      const obs = L.pos.map(function (p) { return [p.x - r - 3, p.y - r - 3, p.x + r + 3, p.y + r + 3]; });
      (L.lab && state.mode === 'taiwan' ? L.lab : L.tags && state.mode !== 'grid' && state.mode !== 'taiwan' ? L.tags : []).forEach(function (o) { if (o && o.b) obs.push(o.b); });
      // 權重小標也不要蓋住（和上面「權重」一段的位置相同）
      if (state.showW) g.edges.forEach(function (ed) {
        const p = L.pos[ed.a], q = L.pos[ed.b], f2 = g.directed ? 0.46 : 0.5;
        const wx = p.x + (q.x - p.x) * f2, wy = p.y + (q.y - p.y) * f2;
        obs.push([wx - 12, wy - 8, wx + 12, wy + 8, 2.5]); // 蓋住數字比蓋住線更糟：加重
      });
      const ov = function (a, b) { const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]); return w > 0 && h > 0 ? w * h : 0; };
      const mx = checkTag.x, my = checkTag.y + 9;
      let best = null;
      [[0, -14], [0, 16], [tw / 2 + 10, 0], [-tw / 2 - 10, 0], [0, -36], [0, 38], [tw / 2 + 10, -22], [-tw / 2 - 10, -22], [tw / 2 + 10, 22], [-tw / 2 - 10, 22], [0, -58], [0, 60]].forEach(function (d) {
        // 每個位置再左右微調（擠的地方常常只差十幾 px 就能避開一個小標）
        [0, -18, 18, -36, 36].forEach(function (sx) {
          const cx = Math.max(tw / 2 + 2, Math.min(cw - tw / 2 - 2, mx + d[0] + sx)), cy = Math.max(th / 2 + 2, Math.min(ch - th / 2 - 2, my + d[1]));
          const b = [cx - tw / 2, cy - th / 2, cx + tw / 2, cy + th / 2];
          let cost = Math.hypot(cx - mx, cy - my) * 0.6;
          obs.forEach(function (o) { cost += ov(b, o) * (o[4] || 1); });
          if (!best || cost < best.cost) best = { x: cx, y: cy + th / 2, cost: cost };
        });
      });
      ctx.save();
      ctx.shadowColor = D.shadowInk(D.dark ? 0.5 : 0.18); ctx.shadowBlur = 6; ctx.shadowOffsetY = 1;
      D.pill(ctx, checkTag.txt, best.x, best.y, checkTag.col, 'center', f);
      ctx.restore();
    }

    // ---- 鍵盤焦點框（用 Tab 進到畫布時） ----
    if (kb && kb.focused()) {
      const k = kb.index();
      ctx.save();
      ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      if (k < 2) {
        const p = L.pos[k === 0 ? state.s : state.t];
        D.roundRect(ctx, p.x - r - 11, p.y - r - 11, 2 * r + 22, 2 * r + 22, 8); ctx.stroke();
      } else {
        const ed = g.edges[state.sel], p = L.pos[ed.a], q = L.pos[ed.b];
        const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
        D.roundRect(ctx, mx - 24, my - 15, 48, 30, 8); ctx.stroke();
      }
      ctx.restore();
    }
  }
  function drawHead(x, y, ux, uy, color, size) {
    const nx = -uy, ny = ux;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - ux * size + nx * size * 0.5, y - uy * size + ny * size * 0.5);
    ctx.lineTo(x - ux * size * 0.7, y - uy * size * 0.7);
    ctx.lineTo(x - ux * size - nx * size * 0.5, y - uy * size - ny * size * 0.5);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
  }
  /** 沿著一串點畫路徑；off：往法線方向平移（對照路線不要蓋住主路線） */
  function pathStroke(path, off) {
    ctx.beginPath();
    for (let i = 0; i < path.length; i++) {
      const p = L.pos[path[i]];
      let ox = 0, oy = 0;
      if (off) {
        const a = L.pos[path[Math.max(0, i - 1)]], b = L.pos[path[Math.min(path.length - 1, i + 1)]];
        const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
        ox = -dy / l * off; oy = dx / l * off;
      }
      if (i) ctx.lineTo(p.x + ox, p.y + oy); else ctx.moveTo(p.x + ox, p.y + oy);
    }
  }

  // ======================= 音效 =======================
  function sound() { const Sd = window.LabSound; return Sd && Sd.enabled() ? Sd : null; }
  function stepSound(sp, how) {
    const Sd = sound(); if (!Sd || !sp) return;
    const dense = how === 'play' && state.speed > 12;
    // 點被確定、負權重錯過捷徑一定有聲音；播放很快時（每秒超過 12 步）檢查邊的短音省略
    if (sp.type === 'pop') Sd.tone({ freq: Math.min(1500, 330 * Math.pow(2, Math.min(sp.ord - 1, 26) / 9)), dur: 0.14, type: 'triangle', gain: 0.18 });
    else if (sp.type === 'late') Sd.sweep({ from: 620, to: 260, dur: 0.28, type: 'sawtooth', gain: 0.09 });
    else if (dense) return;
    else if (sp.type === 'check') {
      if (sp.ok) Sd.tone({ freq: 880, dur: 0.06, type: 'sine', gain: 0.12 });
      else Sd.tone({ freq: 300, dur: 0.05, type: 'triangle', gain: 0.08 });
    }
  }
  function finishSound(path) {
    const Sd = sound(); if (!Sd) return;
    const n = path ? Math.min(8, path.length) : 2;
    for (let i = 0; i < n; i++) Sd.tone({ freq: 523.25 * Math.pow(2, i / Math.max(1, n - 1)), dur: 0.12, type: 'sine', gain: 0.16, delay: i * 0.07 });
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

  // ======================= 執行與步驟 =======================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function rebuild(keepMsg) {
    stopPlay();
    const g = state.g;
    state.tr = S.run(g, state.algo, state.s, state.t, { earlyStop: state.early });
    state.k = 0;
    state.st = S.stateAt(state.tr, 0);
    state.manual = true; state.done = false; state.result = null; state.fx = [];
    if (!keepMsg) describe(null);
    updateAll();
  }
  function resetRun() {
    stopPlay();
    state.k = 0; state.st = S.stateAt(state.tr, 0);
    state.manual = true; state.done = false; state.result = null; state.fx = [];
    describe(null);
    updateAll();
  }
  function advance(n, how) {
    const tr = state.tr, N = tr.steps.length;
    if (state.k >= N) { if (!state.done) finish(); stopPlay(); updateAll(); return; }
    if (how !== 'step') state.manual = false;
    const k0 = state.k, k1 = Math.min(N, k0 + Math.max(1, n));
    state.k = k1;
    state.st = S.stateAt(tr, k1);
    for (let i = k0; i < k1; i++) if (tr.steps[i].type === 'pop') emitSettle(tr.steps[i]);
    const sp = tr.steps[k1 - 1];
    if (how === 'step' || how === 'play') { addFx(sp); stepSound(sp, how); }
    else if (sp) { const Sd = sound(); if (Sd && how === 'next') stepSound(sp, 'step'); }
    describe(sp);
    if (k1 >= N) { finish(); stopPlay(); }
    updateAll();
  }
  function back() {
    if (state.k <= 0) return;
    stopPlay();
    state.k--; state.st = S.stateAt(state.tr, state.k);
    state.done = false; state.result = null;
    describe(lastStep());
    updateAll();
  }
  function nextNode() {
    const tr = state.tr, N = tr.steps.length;
    let i = state.k;
    if (i >= N) { advance(1, 'next'); return; }
    if (state.algo === 'bf') {
      while (i < N && !tr.steps[i].last) i++;
      i = Math.min(N, i + 1);
    } else {
      while (i < N && tr.steps[i].type !== 'pop') i++;
      if (i < N) i++;
      while (i < N && tr.steps[i].type !== 'pop') i++;
    }
    stopPlay();
    advance(i - state.k, 'next');
  }
  function addFx(sp) {
    if (reducedMotion || !sp) return;
    const now = performance.now(), dur = Math.max(160, Math.min(520, 900 / state.speed));
    if (sp.type === 'check' || sp.type === 'late') {
      const col = sp.type === 'late' ? C['sp-bad'] : C['sp-check'];
      state.fx.push({ type: 'pulse', a: sp.u, b: sp.v, color: col, t0: now, dur: dur });
      if (sp.ok || sp.type === 'late') state.fx.push({ type: 'ring', n: sp.v, color: sp.type === 'late' ? C['sp-bad'] : C['sp-front'], t0: now + dur * 0.8, dur: 420 });
    } else if (sp.type === 'pop') state.fx.push({ type: 'ring', n: sp.u, color: C['sp-done'], t0: now, dur: 480 });
    requestDraw();
  }
  function emitSettle(sp) {
    const g = state.g, n = g.nodes[sp.u];
    const wi = weightInfo();
    emit('settle', {
      mode: state.mode, algo: state.algo, s: state.s, t: state.t, node: sp.u, key: n.key || '', ord: sp.ord,
      d: state.st.d[sp.u], manual: state.manual, early: state.early, unedited: wi.unedited, V: g.nodes.length, k: state.k
    });
  }
  function weightInfo() { return S.weightInfo(state.g); }

  // ---------- 跑完：整理結果、紀錄、任務事件（整理工作在核心的 report，任務證明腳本也用它） ----------
  function finish() {
    if (state.done) return;
    state.done = true;
    const rp = S.report(state.g, state.mode, state.tr);
    const res = rp.res, tr = state.tr;
    state.result = res;
    state.log.push({
      mode: state.mode, algo: state.algo, s: state.s, t: state.t, dist: res.dist, hops: res.hops,
      checks: tr.stats.checks, relax: tr.stats.relax, steps: tr.steps.length, wrong: res.wrong
    });
    if (state.log.length > 40) state.log.shift();
    renderLog();
    finishSound(res.path);
    emit('finish', Object.assign({ manual: state.manual }, rp.data));
  }

  // ---------- 這一步做了什麼（狀態列） ----------
  let sayTimer = 0;
  // 中文句子裡，中文名字前後不留空格（「取出臺北」）；英文、數字和中文之間的空格照留
  function say(msg) {
    msg = String(msg || '').replace(/([\u3400-\u9fff])[ ]+(?=[\u3400-\u9fff])/g, '$1');
    clearTimeout(sayTimer); sayTimer = setTimeout(function () { $('status').textContent = msg; }, 20);
  }
  function describe(sp) {
    const st = state.st, u = unit();
    if (!sp) {
      if (state.algo === 'bf') say(T('準備好了：起點 ' + nameOf(state.s) + ' 的 d = 0，其他點都是 ∞。Bellman–Ford 每一輪照邊的編號把每條邊都檢查一次。按「單步」或「播放」。', 'Ready: the start ' + nameOf(state.s) + ' has d = 0 and every other place ∞. Each round, Bellman–Ford checks every edge in order of its number. Press “Step” or “Play”.'));
      else say(T('準備好了：起點 ' + nameOf(state.s) + ' 的 d = 0，其他點都是 ∞，佇列裡只有起點。按「單步」或「播放」。', 'Ready: the start ' + nameOf(state.s) + ' has d = 0, every other place ∞, and only the start is in the queue. Press “Step” or “Play”.'));
      return;
    }
    const A = nameOf(sp.u), B = sp.v != null ? nameOf(sp.v) : '';
    if (sp.type === 'pop') {
      if (state.algo === 'bfs') say(T('取出 ' + A + '（第 ' + st.d[sp.u] + ' 層，佇列最前面的點）。' + (sp.u === state.t ? '終點出現了！' : ''), 'Take out ' + A + ' (layer ' + st.d[sp.u] + ', the front of the queue).' + (sp.u === state.t ? ' The goal is reached!' : '')));
      else say(T('取出 ' + A + '：d = ' + num(st.d[sp.u]) + u + '，是佇列裡最小的' + (sp.q > 1 ? '（掃過 ' + sp.q + ' 個點、比較 ' + sp.cmp + ' 次）' : '') + '，它的最短距離確定了。' + (sp.u === state.t ? '終點確定了！' : ''),
        'Take out ' + A + ': d = ' + num(st.d[sp.u]) + u + ' is the smallest in the queue' + (sp.q > 1 ? ' (' + sp.q + ' places scanned, ' + sp.cmp + ' comparison' + (sp.cmp === 1 ? '' : 's') + ')' : '') + ', so its shortest distance is now fixed.' + (sp.u === state.t ? ' The goal is fixed!' : '')));
    } else if (sp.type === 'late') {
      say(T(B + ' 已經確定（d = ' + num(sp.old) + '），但經過 ' + A + ' 只要 ' + num(sp.nd - sp.w) + ' + (' + num(sp.w) + ') = ' + num(sp.nd) + '，更短！Dijkstra 不會回頭修改——負權重讓它錯了。',
        B + ' is already fixed (d = ' + num(sp.old) + '), but through ' + A + ' it is only ' + num(sp.nd - sp.w) + ' + (' + num(sp.w) + ') = ' + num(sp.nd) + ', shorter! Dijkstra never goes back — the negative weight has fooled it.'));
    } else if (state.algo === 'bfs') {
      if (sp.ok) say(T('發現 ' + B + '：邊數 = ' + sp.nd + '，前一站 = ' + A + '，排到佇列最後面。', 'Found ' + B + ': ' + sp.nd + ' edge' + (sp.nd === 1 ? '' : 's') + ' from the start, previous stop ' + A + '; it joins the back of the queue.'));
      else say(T(B + ' 已經在佇列裡（邊數 ' + sp.old + '），跳過。BFS 不看權重。', B + ' is already in the queue (' + sp.old + ' edges); skip it. BFS ignores the weights.'));
    } else {
      const pre = state.algo === 'bf' ? T('第 ' + sp.r + ' 輪、第 ' + sp.j + '／' + sp.m + ' 條：', 'Round ' + sp.r + ', edge ' + sp.j + ' of ' + sp.m + ': ') : '';
      let msg;
      if (sp.nd === INF) msg = T(A + ' 的距離還是 ∞，這條邊 ' + A + ' → ' + B + ' 先沒有用。', A + ' is still at ∞, so the edge ' + A + ' → ' + B + ' is no use yet.');
      else {
        const sum = num(sp.nd - sp.w) + ' + ' + (sp.w < 0 ? '(' + num(sp.w) + ')' : num(sp.w)) + ' = ' + num(sp.nd);
        if (sp.ok) msg = T(A + ' → ' + B + '：' + sum + ' < ' + num(sp.old) + '，更新 ' + dOf(B) + ' = ' + num(sp.nd) + u + '，前一站 = ' + A + '。', A + ' → ' + B + ': ' + sum + ' < ' + num(sp.old) + ', so ' + dOf(B) + ' becomes ' + num(sp.nd) + u + ' with previous stop ' + A + '.');
        else msg = T(A + ' → ' + B + '：' + sum + ' ≥ ' + num(sp.old) + '，不更新。', A + ' → ' + B + ': ' + sum + ' ≥ ' + num(sp.old) + ', no update.');
      }
      if (sp.last) msg += sp.upd ? T('　第 ' + sp.r + ' 輪結束：更新了 ' + sp.upd + ' 次。', '  End of round ' + sp.r + ': ' + sp.upd + ' update' + (sp.upd === 1 ? '' : 's') + '.') : T('　第 ' + sp.r + ' 輪完全沒有更新，提早結束。', '  Round ' + sp.r + ' changed nothing, so it stops early.');
      say(pre + msg);
    }
  }
  /** d(臺北)；方格的點名字本身有括號，寫成 d(2,4) */
  function dOf(name) { return name.charAt(0) === '(' ? 'd' + name : 'd(' + name + ')'; }
  function finishMessage() {
    const res = state.result;
    if (!res) return;
    const u = unit();
    let msg;
    if (!res.path) msg = T('完成：從 ' + nameOf(state.s) + ' 到不了 ' + nameOf(state.t) + '（距離 ∞）。', 'Done: ' + nameOf(state.t) + ' cannot be reached from ' + nameOf(state.s) + ' (distance ∞).');
    else if (state.algo === 'bfs') msg = T('完成：邊數最少的路線有 ' + res.hops + ' 段，總長 ' + num(res.dist) + u + '。', 'Done: the route with the fewest edges has ' + res.hops + ' edge' + (res.hops === 1 ? '' : 's') + ' and a total length of ' + num(res.dist) + u + '.');
    else msg = T('完成：' + nameOf(state.s) + ' 到 ' + nameOf(state.t) + ' 最短 ' + num(res.dist) + u + '，共 ' + res.hops + ' 段。', 'Done: the shortest distance from ' + nameOf(state.s) + ' to ' + nameOf(state.t) + ' is ' + num(res.dist) + u + ', in ' + res.hops + ' edge' + (res.hops === 1 ? '' : 's') + '.');
    if (res.wrong) msg += T('　但有 ' + res.wrong + ' 個點和 Bellman–Ford 的正確答案不同（紅色虛線圈）。', '  But ' + res.wrong + ' place' + (res.wrong === 1 ? ' differs' : 's differ') + ' from Bellman–Ford’s correct answer (red dashed rings).');
    say(msg);
  }

  // ======================= 讀數、佇列、表格 =======================
  const lastHTML = {};
  function setHTML(id, html) { if (lastHTML[id] !== html) { lastHTML[id] = html; $(id).innerHTML = html; } }
  function updateAll() {
    updateReadouts();
    renderPQ();
    renderDist();
    updateButtons();
    if (state.done) finishMessage();
    requestDraw();
  }
  function updateButtons() {
    const N = state.tr.steps.length;
    $('backBtn').disabled = state.k <= 0;
    $('stepBtn').disabled = state.done && state.k >= N;
    $('nextBtn').disabled = state.done && state.k >= N;
    $('endBtn').disabled = state.done && state.k >= N;
    $('playBtn').disabled = state.done && state.k >= N && !state.playing;
    $('playBtn').setAttribute('aria-pressed', String(state.playing));
    $('playBtn').textContent = state.playing ? T('暫停', 'Pause') : T('播放', 'Play');
    $('nextBtn').textContent = state.algo === 'bf' ? T('下一輪', 'Next round') : T('下一個點', 'Next node');
  }
  function updateReadouts() {
    const st = state.st, tr = state.tr, g = state.g, V = g.nodes.length, u = unit();
    const E = g.edges.filter(function (e) { return !e.closed; }).length;
    const bf = state.algo === 'bf';
    setHTML('rStep', st.k + ' ／ ' + tr.steps.length);
    setHTML('rSet', bf ? '—' : st.pops + ' ／ ' + V);
    const q = bf ? null : state.algo === 'bfs' ? st.queue.length : st.status.filter(function (x) { return x === 'queue'; }).length;
    setHTML('rQ', q === null ? '—' : String(q));
    const dirE = g.directed ? E : 2 * E;
    setHTML('rChk', st.checks + ' <small>' + (bf ? T('（每輪 ' + dirE + '）', '(' + dirE + ' per round)') : T('（E = ' + E + '）', '(E = ' + E + ')')) + '</small>');
    setHTML('rRel', String(st.relax));
    $('rCmpL').hidden = $('rCmp').hidden = state.algo !== 'dijkstra';
    setHTML('rCmp', st.cmp + ' <small>' + T('（上限 ', '(max ') + (V * (V - 1) / 2) + T('）', ')') + '</small>');
    $('rRndL').hidden = $('rRnd').hidden = !bf;
    setHTML('rRnd', bf ? (st.round || 0) + ' <small>' + T('（最多 ' + (V - 1) + '）', '(at most ' + (V - 1) + ')') + '</small>' : '—');
    // 終點
    const dt = st.d[state.t];
    const fixed = bf ? st.end : st.status[state.t] === 'done';
    let dtxt;
    if (state.algo === 'bfs') dtxt = dt === INF ? '∞' : dt + T(' 段', ' edges') + (fixed ? ' ✓' : T('（暫定）', ' (so far)'));
    else dtxt = num(dt) + u + (dt === INF ? '' : fixed ? ' ✓' : T('（暫定）', ' (so far)'));
    setHTML('rDist', dtxt);
    const path = fixed ? S.pathTo(st.prev, state.s, state.t) : null;
    setHTML('rHops', path ? String(path.length - 1) : '—');
    const res = state.result;
    setHTML('rCount', res && st.end ? (res.count === null ? (res.path ? T('—（有權重 0）', '— (a weight is 0)') : '0') : String(res.count)) : '—');
    // 路線
    let rt = '';
    if (path) {
      rt = path.map(nameOf).join(' → ');
      if (state.algo === 'bfs') rt += T('（總長 ', ' (length ') + num(S.pathLength(g, path)) + u + T('）', ')');
      if (res && st.end && res.ghost) {
        const gl = S.pathLength(g, res.ghost);
        if (state.algo === 'dijkstra' && !g.directed) rt += '<br>' + T('BFS（邊數最少）：', 'BFS (fewest edges): ') + res.ghost.map(nameOf).join(' → ') + T('（' + (res.ghost.length - 1) + ' 段，總長 ' + num(gl) + u + '）', ' (' + (res.ghost.length - 1) + ' edges, length ' + num(gl) + u + ')');
        else if (state.algo === 'bfs') rt += '<br>' + T('Dijkstra（最短）：', 'Dijkstra (shortest): ') + res.ghost.map(nameOf).join(' → ') + T('（' + (res.ghost.length - 1) + ' 段，總長 ' + num(gl) + u + '）', ' (' + (res.ghost.length - 1) + ' edges, length ' + num(gl) + u + ')');
        else rt += '<br>' + T('真正的最短路（Bellman–Ford）：', 'True shortest route (Bellman–Ford): ') + res.ghost.map(nameOf).join(' → ') + T('（總長 ', ' (length ') + num(res.truth[state.t]) + T('）', ')');
      }
    } else if (st.end && !path) rt = T('到不了終點。', 'The goal cannot be reached.');
    else rt = T('終點確定以後，這裡會寫出路線。', 'The route appears here once the goal is fixed.');
    setHTML('route', rt);
    $('route').classList.toggle('bad', !!(res && res.wrong && st.end));
    // 理論對照
    let th;
    if (state.algo === 'dijkstra') th = T('理論：取出 ≤ V = ' + V + '；每條邊最多檢查一次，檢查 ≤ E = ' + E + '；鬆弛 ≤ 檢查；找最小值的比較 ≤ V(V − 1)/2 = ' + (V * (V - 1) / 2) + '。', 'Theory: take-outs ≤ V = ' + V + '; each edge is checked at most once, so checks ≤ E = ' + E + '; relaxations ≤ checks; comparisons ≤ V(V − 1)/2 = ' + (V * (V - 1) / 2) + '.');
    else if (state.algo === 'bfs') th = T('理論：每個點進出佇列一次（≤ V = ' + V + '），每條邊最多檢查一次（≤ E = ' + E + '），所以是 O(V + E)。', 'Theory: each place enters and leaves the queue once (≤ V = ' + V + ') and each edge is checked at most once (≤ E = ' + E + '), so the work is O(V + E).');
    else th = T('理論：每輪檢查 ' + dirE + ' 條（有向）邊，最多 V − 1 = ' + (V - 1) + ' 輪，所以最多 ' + dirE * (V - 1) + ' 次，O(VE)。', 'Theory: each round checks ' + dirE + ' (directed) edges, for at most V − 1 = ' + (V - 1) + ' rounds, so at most ' + dirE * (V - 1) + ' checks: O(VE).');
    setHTML('theory', th);
  }
  function renderPQ() {
    const st = state.st;
    let head, html = '';
    if (state.algo === 'bf') {
      head = T('Bellman–Ford 沒有優先佇列', 'Bellman–Ford has no priority queue');
      const sp = lastStep();
      html = '<span class="empty">' + (sp ? T('第 ' + sp.r + ' 輪，第 ' + sp.j + '／' + sp.m + ' 條邊。', 'Round ' + sp.r + ', edge ' + sp.j + ' of ' + sp.m + '.') : T('每一輪照編號把每條邊都檢查一遍。', 'Each round checks every edge in order of its number.')) + '</span>';
    } else if (state.algo === 'bfs') {
      head = T('佇列（先進先出，最前面的先取出）', 'Queue (first in, first out)');
      if (!st.queue.length) html = '<span class="empty">' + T('佇列是空的。', 'The queue is empty.') + '</span>';
      st.queue.forEach(function (v, i) { html += '<span class="chip' + (i === 0 ? ' next' : '') + '"><b>' + nameOf(v) + '</b><span>' + st.d[v] + T(' 段', ' e') + '</span></span>'; });
    } else {
      head = T('優先佇列（d 由小到大；最左邊的下一個取出）', 'Priority queue (smallest d first; the leftmost comes out next)');
      const q = [];
      st.status.forEach(function (x, i) { if (x === 'queue') q.push(i); });
      q.sort(function (a, b) { return st.d[a] - st.d[b] || a - b; });
      if (!q.length) html = '<span class="empty">' + (st.end ? T('佇列空了，全部完成。', 'The queue is empty: all done.') : T('佇列是空的。', 'The queue is empty.')) + '</span>';
      q.forEach(function (v, i) { html += '<span class="chip' + (i === 0 ? ' next' : '') + '"><b>' + nameOf(v) + '</b><span>' + num(st.d[v]) + '</span></span>'; });
    }
    setHTML('pqHead', head);
    setHTML('pq', html);
  }
  function renderDist() {
    const st = state.st, g = state.g, res = state.result;
    const showTruth = res && res.wrongSet && st.end;
    const cur = currentNode();
    let html = '<tr><th>' + T('點', 'Place') + '</th><th>' + (state.algo === 'bfs' ? T('邊數', 'Edges') : 'd') + '</th><th>' + T('前一站', 'Previous') + '</th><th>' + T('狀態', 'State') + '</th>' + (showTruth ? '<th>' + T('正確值', 'True') + '</th>' : '') + '</tr>';
    g.nodes.forEach(function (n, i) {
      const status = state.algo === 'bf' && st.end && st.d[i] < INF ? 'done' : st.status[i];
      const stt = status === 'done' ? (state.algo === 'bf' ? T('完成', 'final') : T('已確定', 'fixed')) : status === 'queue' ? (state.algo === 'bf' ? T('暫定', 'so far') : T('佇列中', 'queued')) : '—';
      const bad = showTruth && res.wrongSet[i];
      html += '<tr class="' + status + (i === cur ? ' cur' : '') + '"><td>' + nameOf(i) + (i === state.s ? T('（起）', ' (S)') : i === state.t ? T('（終）', ' (G)') : '') + '</td><td' + (bad ? ' class="bad"' : '') + '>' + num(st.d[i]) + '</td><td>' + (st.prev[i] >= 0 ? nameOf(st.prev[i]) : '—') + '</td><td>' + stt + '</td>' + (showTruth ? '<td>' + num(res.truth[i]) + (bad ? ' ✗' : '') + '</td>' : '') + '</tr>';
    });
    setHTML('distTab', html);
  }
  function renderLog() {
    const tab = $('logTab');
    if (!state.log.length) { tab.innerHTML = ''; $('logEmpty').hidden = false; return; }
    $('logEmpty').hidden = true;
    let html = '<tr><th>#</th><th>' + T('圖', 'Graph') + '</th><th>' + T('演算法', 'Algorithm') + '</th><th>' + T('距離', 'Dist.') + '</th><th>' + T('檢查', 'Checks') + '</th><th>' + T('鬆弛', 'Relax.') + '</th><th>' + T('步數', 'Steps') + '</th></tr>';
    state.log.forEach(function (r, k) {
      html += '<tr><td>' + (k + 1) + '</td><td>' + modeName(r.mode) + '</td><td>' + algoName(r.algo) + (r.wrong ? ' ✗' : '') + '</td><td>' + (r.dist === null ? '∞' : num(r.dist)) + '</td><td>' + r.checks + '</td><td>' + r.relax + '</td><td>' + r.steps + '</td></tr>';
    });
    tab.innerHTML = html;
  }

  // ======================= 控制項 =======================
  function stopPlay() { state.playing = false; state.acc = 0; }
  function togglePlay() {
    if (state.playing) { stopPlay(); updateButtons(); return; }
    if (state.k >= state.tr.steps.length) { if (!state.done) { advance(1, 'play'); } return; }
    state.playing = true; state.acc = 1; state.manual = false;
    updateButtons();
    requestDraw();
  }
  $('stepBtn').addEventListener('click', function () { stopPlay(); advance(1, 'step'); });
  $('backBtn').addEventListener('click', back);
  $('nextBtn').addEventListener('click', nextNode);
  $('playBtn').addEventListener('click', togglePlay);
  $('endBtn').addEventListener('click', function () { stopPlay(); advance(state.tr.steps.length, 'end'); });
  $('resetBtn').addEventListener('click', resetRun);
  $('wipeBtn').addEventListener('click', function () {
    state.log = []; renderLog();
    resetRun();
    say(T('已清除紀錄與對照路線，回到第 0 步。', 'Cleared the log and the comparison route; back to step 0.'));
  });

  // ---------- 模式 ----------
  const modeBtns = Array.prototype.slice.call(document.querySelectorAll('.modes button'));
  function setMode(m) {
    if (m === state.mode && state.g) return;
    if (state.g) store[state.mode] = { g: state.g, s: state.s, t: state.t };
    state.mode = m;
    const got = store[m] || makeGraph(m);
    state.g = got.g; state.s = got.s; state.t = got.t;
    state.sel = 0; state.selShown = false; state.hover = null;
    modeBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === m)); });
    // Bellman–Ford 以外的演算法在負權重圖上也可以用（就是要看 Dijkstra 出錯）
    configureWeightSlider();
    fillSelects();
    $('graphCard').hidden = !(m === 'random' || m === 'grid');
    $('randBox').hidden = m !== 'random';
    $('gridBox').hidden = m !== 'grid';
    updateMapNote();
    resize();
    rebuild();
  }
  /** 圖下方的說明（模式切換、或方格因為螢幕寬度轉向時更新） */
  function updateMapNote() {
    const m = state.mode;
    let txt = m === 'taiwan' ? T('權重是兩城市之間的直線距離（大圓距離，公里），不是公路里程；海岸線是簡化的示意輪廓。', 'Weights are straight-line (great-circle) distances in kilometres, not road distances; the coastline is a simplified sketch.')
      : m === 'random' ? T('隨機圖：權重是 1–9 的隨機整數，和畫面上線段的長短無關。', 'Random graph: the weights are random whole numbers from 1 to 9 and have nothing to do with how long the lines look.')
      : m === 'grid' ? T('方格：權重是 1–9 的隨機整數，數字寫在每個點裡的是目前的 d。', 'Grid: the weights are random whole numbers from 1 to 9; the number inside each place is its current d.')
      : T('負權重：單行道（照箭頭方向走），而且沒有環。邊旁的 e1、e2……是 Bellman–Ford 每一輪檢查的順序。', 'Negative weights: one-way roads (follow the arrows) with no cycles. The labels e1, e2, … give the order in which Bellman–Ford checks the edges in each round.');
    if (m === 'grid' && L && L.turn) txt += T('（螢幕比較窄，方格轉了 90°：第 1 列在最左邊。）', ' (The screen is narrow, so the grid is turned 90°: row 1 is on the left.)');
    $('mapNote').textContent = txt;
  }
  modeBtns.forEach(function (b) { b.addEventListener('click', function () { setMode(b.dataset.mode); }); });

  // ---------- 起點、終點 ----------
  const selS = $('selS'), selT = $('selT'), edgeSel = $('edgeSel');
  function fillSelects() {
    const g = state.g;
    let html = '';
    g.nodes.forEach(function (n, i) { html += '<option value="' + i + '">' + nameOf(i) + '</option>'; });
    selS.innerHTML = html; selT.innerHTML = html;
    selS.value = String(state.s); selT.value = String(state.t);
    fillEdges();
  }
  function fillEdges() {
    const g = state.g;
    let html = '';
    g.edges.forEach(function (ed, e) { html += '<option value="' + e + '">' + edgeLabel(e) + '</option>'; });
    edgeSel.innerHTML = html;
    edgeSel.value = String(state.sel);
    syncEdgeControls();
  }
  function edgeLabel(e) {
    const ed = state.g.edges[e];
    return edgeName(e) + '（' + (ed.closed ? T('封閉', 'closed') : num(ed.w) + unit()) + '）';
  }
  function refreshEdgeOption(e) { const o = edgeSel.options[e]; if (o) o.textContent = edgeLabel(e); }
  function setST(s, t) {
    state.s = s; state.t = t;
    selS.value = String(s); selT.value = String(t);
    if (state.mode === 'random') placeLabels();
    rebuild();
  }
  selS.addEventListener('change', function () { setST(+selS.value, state.t); });
  selT.addEventListener('change', function () { setST(state.s, +selT.value); });
  $('swapBtn').addEventListener('click', function () { setST(state.t, state.s); });
  Array.prototype.forEach.call(document.querySelectorAll('.seg2 button'), function (b) {
    b.addEventListener('click', function () {
      state.pick = b.dataset.pick;
      document.querySelectorAll('.seg2 button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    });
  });
  $('early').addEventListener('change', function () { state.early = $('early').checked; rebuild(); });

  // ---------- 演算法 ----------
  const algoBtns = Array.prototype.slice.call(document.querySelectorAll('#algoChips button'));
  function setAlgo(a) {
    state.algo = a;
    algoBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.algo === a)); });
    // Bellman–Ford 沒有佇列：橘色的意思改成「有暫定距離」
    $('legQ').style.display = a === 'bf' ? 'none' : '';
    $('legQbf').style.display = a === 'bf' ? '' : 'none';
    $('algoHint').textContent = a === 'bfs' ? T('不看權重，先進先出，一層一層往外找；找到的是邊數最少的路線。', 'Ignores the weights; first in, first out, layer by layer. It finds the route with the fewest edges.')
      : a === 'bf' ? T('每一輪照邊的編號把每條邊都鬆弛一次，最多 V − 1 輪；某一輪完全沒有更新就提早結束。負權重也算得對。', 'Each round relaxes every edge once, in order of the edge numbers, for at most V − 1 rounds; a round with no update ends it early. It copes with negative weights.')
      : T('每次取出佇列裡 d 最小的點並確定它，再鬆弛它通往還沒確定的點的邊；平手時取編號小的。', 'Each step takes out the place with the smallest d, fixes it, and relaxes its edges to places not fixed yet; on a tie the smaller number goes first.');
    rebuild();
  }
  algoBtns.forEach(function (b) { b.addEventListener('click', function () { setAlgo(b.dataset.algo); }); });
  const elSpeed = $('speed');
  elSpeed.addEventListener('input', function () { state.speed = Math.max(1, Math.round(val(elSpeed))); $('speedo').textContent = String(state.speed); });
  $('showTree').addEventListener('change', function () { state.showTree = $('showTree').checked; requestDraw(); });
  $('showW').addEventListener('change', function () { state.showW = $('showW').checked; placeLabels(); requestDraw(); });

  // ---------- 權重 ----------
  const elW = $('wt');
  function configureWeightSlider() {
    const m = state.mode;
    const lo = m === 'neg' ? -9 : 0, hi = m === 'taiwan' ? 500 : m === 'neg' ? 9 : 20;
    elW.min = String(lo); elW.max = String(hi);
    $('wtLabel').textContent = m === 'taiwan' ? T('權重 w（公里）', 'Weight w (km)') : T('權重 w', 'Weight w');
  }
  function syncEdgeControls() {
    const ed = state.g.edges[state.sel];
    if (!ed) return;
    setSlider(elW, ed.w);
    $('wto').textContent = num(ed.w);
    $('closeEdge').checked = ed.closed;
    let hint = T('原來的權重：', 'Original weight: ') + num(ed.w0) + unit();
    if (state.mode === 'taiwan') hint += T('（直線距離）', ' (straight-line distance)');
    hint += T('。點畫布上的路也可以選它。', '. You can also tap a road on the canvas.');
    $('wHint').textContent = hint;
  }
  function selectEdge(e) {
    state.sel = e; state.selShown = true;
    edgeSel.value = String(e);
    syncEdgeControls();
    requestDraw();
  }
  edgeSel.addEventListener('change', function () { selectEdge(+edgeSel.value); });
  function setWeight(e, w) {
    const ed = state.g.edges[e];
    const lo = +elW.min, hi = +elW.max;
    w = Math.max(lo, Math.min(hi, Math.round(w)));
    if (ed.w === w) return false;
    ed.w = w;
    refreshEdgeOption(e);
    if (e === state.sel) { $('wto').textContent = num(w); }
    rebuild();
    say(T(edgeName(e) + ' 的權重改成 ' + num(w) + unit() + '。回到第 0 步。', 'The weight of ' + edgeName(e) + ' is now ' + num(w) + unit() + '. Back to step 0.'));
    return true;
  }
  elW.addEventListener('input', function () { state.selShown = true; setWeight(state.sel, val(elW)); });
  $('closeEdge').addEventListener('change', function () {
    const ed = state.g.edges[state.sel];
    ed.closed = $('closeEdge').checked;
    state.selShown = true;
    refreshEdgeOption(state.sel);
    rebuild(true);
    say(ed.closed ? T(edgeName(state.sel) + ' 封閉了，這條路不能走。', edgeName(state.sel) + ' is closed; nobody can use it.') : T(edgeName(state.sel) + ' 重新開放。', edgeName(state.sel) + ' is open again.'));
  });
  $('restoreBtn').addEventListener('click', function () {
    state.g.edges.forEach(function (e) { e.w = e.w0; e.closed = false; });
    fillEdges();
    rebuild(true);
    say(T('所有權重恢復原狀，封閉的路也重新開放。', 'Every weight is back to its original value and every road is open again.'));
  });
  $('oneBtn').addEventListener('click', function () {
    state.g.edges.forEach(function (e) { e.w = 1; });
    fillEdges();
    rebuild(true);
    say(T('所有權重都設為 1：最短的路就是邊數最少的路。', 'Every weight is now 1: the shortest route is the one with the fewest edges.'));
  });

  // ---------- 隨機圖與方格 ----------
  const elRn = $('rn'), elGr = $('gr'), elGc = $('gc');
  function newRandom() {
    state.g = S.randomGraph(state.rand.n, state.rand.seed);
    state.s = 0; state.t = state.g.nodes.length - 1; state.sel = 0; state.selShown = false;
    $('randInfo').textContent = T('第 ' + state.rand.seed + ' 張（同一個編號每次都一樣）', 'Graph no. ' + state.rand.seed + ' (the same number always gives the same graph)');
    fillSelects(); resize(); rebuild();
  }
  function newGrid() {
    state.g = S.gridGraph(state.grid.rows, state.grid.cols, state.grid.seed);
    state.s = 0; state.t = state.g.nodes.length - 1; state.sel = 0; state.selShown = false;
    fillSelects(); resize(); rebuild();
  }
  elRn.addEventListener('input', function () {
    const n = Math.round(val(elRn)); $('rno').textContent = String(n);
    if (n === state.rand.n && state.mode === 'random') return;
    state.rand.n = n; if (state.mode === 'random') newRandom();
  });
  $('newRand').addEventListener('click', function () { state.rand.seed++; newRandom(); });
  elGr.addEventListener('input', function () { const v = Math.round(val(elGr)); $('gro').textContent = String(v); if (v !== state.grid.rows) { state.grid.rows = v; if (state.mode === 'grid') newGrid(); } });
  elGc.addEventListener('input', function () { const v = Math.round(val(elGc)); $('gco').textContent = String(v); if (v !== state.grid.cols) { state.grid.cols = v; if (state.mode === 'grid') newGrid(); } });
  $('newGrid').addEventListener('click', function () { state.grid.seed++; newGrid(); });

  // ---------- 畫布：點地點、點道路 ----------
  function hit(x, y) {
    if (!L) return null;
    let best = null, bd = Infinity;
    L.pos.forEach(function (p, i) { const d = Math.hypot(p.x - x, p.y - y); if (d < L.r + 10 && d < bd) { bd = d; best = { type: 'n', i: i }; } });
    if (best) return best;
    state.g.edges.forEach(function (ed, e) {
      const p = L.pos[ed.a], q = L.pos[ed.b];
      const dx = q.x - p.x, dy = q.y - p.y, l2 = dx * dx + dy * dy || 1;
      const u = Math.max(0, Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / l2));
      const d = Math.hypot(p.x + dx * u - x, p.y + dy * u - y);
      if (d < 11 && d < bd && u > 0.08 && u < 0.92) { bd = d; best = { type: 'e', i: e }; }
    });
    return best;
  }
  let down = null;
  cv.addEventListener('pointerdown', function (ev) { const r = cv.getBoundingClientRect(); down = { x: ev.clientX - r.left, y: ev.clientY - r.top }; });
  cv.addEventListener('pointerup', function (ev) {
    if (!down) return;
    const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    const moved = Math.hypot(x - down.x, y - down.y);
    down = null;
    if (moved > 10) return;
    const h = hit(x, y);
    if (!h) return;
    if (h.type === 'n') {
      if (state.pick === 's') setST(h.i, state.t); else setST(state.s, h.i);
      say(T((state.pick === 's' ? '起點' : '終點') + '設為 ' + nameOf(h.i) + '。', (state.pick === 's' ? 'Start' : 'Goal') + ' set to ' + nameOf(h.i) + '.'));
    } else selectEdge(h.i);
  });
  cv.addEventListener('pointermove', function (ev) {
    if (ev.pointerType !== 'mouse') return;
    const r = cv.getBoundingClientRect();
    const h = hit(ev.clientX - r.left, ev.clientY - r.top);
    const key = h ? h.type + h.i : '';
    const old = state.hover ? state.hover.type + state.hover.i : '';
    if (key !== old) { state.hover = h; cv.style.cursor = h ? 'pointer' : 'default'; requestDraw(); }
  });
  cv.addEventListener('pointerleave', function () { if (state.hover) { state.hover = null; requestDraw(); } });

  // ---------- 鍵盤（LabKeys） ----------
  let kb = null;
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('最短路徑畫布。按 Enter 在「起點」「終點」「選取的邊」之間切換；左右方向鍵換起點或終點、改邊的權重（Shift 一次 10），上下方向鍵換一條邊。', 'Shortest-path canvas. Press Enter to switch between the start, the goal and the selected edge; left and right arrows change the start or goal, or the weight of the edge (Shift: 10 at a time); up and down arrows pick another edge.'),
      items: [
        { name: function () { return T('起點', 'Start'); },
          move: function (dx, dy) { const V = state.g.nodes.length, d = dx || dy; if (!d) return false; setST((state.s + d + V) % V, state.t); return true; },
          describe: function () { return T('起點：', 'Start: ') + nameOf(state.s); } },
        { name: function () { return T('終點', 'Goal'); },
          move: function (dx, dy) { const V = state.g.nodes.length, d = dx || dy; if (!d) return false; setST(state.s, (state.t + d + V) % V); return true; },
          describe: function () { return T('終點：', 'Goal: ') + nameOf(state.t); } },
        { name: function () { return T('選取的邊', 'Selected edge'); },
          move: function (dx, dy, big) {
            const E = state.g.edges.length;
            if (dy) { selectEdge((state.sel - dy + E) % E); return true; }
            state.selShown = true;
            setWeight(state.sel, state.g.edges[state.sel].w + dx * (big ? 10 : 1));
            syncEdgeControls();
            return true;
          },
          describe: function () { return edgeLabel(state.sel); } }
      ],
      onChange: function () { if (kb && kb.focused() && kb.index() === 2) state.selShown = true; requestDraw(); }
    });
  }

  // ---------- 測試用介面（Playwright 腳本使用；不影響一般操作） ----------
  window.ShortestLab = {
    state: state,
    mode: setMode,
    st: function (s, t) { setST(s, t); },
    algo: setAlgo,
    weight: function (e, w) { selectEdge(e); setWeight(e, w); syncEdgeControls(); },
    close: function (e, on) { selectEdge(e); $('closeEdge').checked = !!on; $('closeEdge').dispatchEvent(new Event('change')); },
    step: function (n) { for (let i = 0; i < (n || 1); i++) advance(1, 'step'); },
    end: function () { advance(state.tr.steps.length, 'end'); },
    reset: resetRun
  };

  // ======================= 啟動 =======================
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    updateSoundButton();
    fillSelects();
    renderLog();
    updateAll();
    resize();
  }
  readColors();
  state.speed = Math.max(1, Math.round(val(elSpeed))); $('speedo').textContent = String(state.speed);
  state.rand.n = Math.round(val(elRn)); $('rno').textContent = String(state.rand.n);
  state.grid.rows = Math.round(val(elGr)); $('gro').textContent = String(state.grid.rows);
  state.grid.cols = Math.round(val(elGc)); $('gco').textContent = String(state.grid.cols);
  $('randInfo').textContent = T('第 1 張（同一個編號每次都一樣）', 'Graph no. 1 (the same number always gives the same graph)');
  state.early = $('early').checked;
  state.showTree = $('showTree').checked; state.showW = $('showW').checked;
  updateSoundButton();
  renderLog();
  setMode('taiwan');
  setAlgo('dijkstra');
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden && state.playing) { stopPlay(); updateButtons(); } });
})();
