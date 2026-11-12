/* diffusion-osmosis.js — 「擴散與滲透」的畫面與互動（物理計算全部在 diffusion-osmosis-core.js；3D 在 diffusion-osmosis-3d.js，切換時才載入） */
(function () {
  'use strict';
  const K = window.DiffOsmoCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // 本檔的版本號（?v=）：切換到 3D 時動態載入的 js/diffusion-osmosis-3d.js 沿用同一個版本號
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const FONT = D.FONT;
  const isEn = function () { return !!(window.LabSettings && window.LabSettings.lang === 'en'); };
  const clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  const SOL = K.SOLUTES;
  /** 播放速度 ×1 時，每一真實秒前進的模擬秒數 */
  const BASE = { diff: 1, osmo: 120, cell: 1 };
  const MSD_DONE = 2000;   // μm²：2Θ 達到這麼多（均方根位移約 45 μm）算「量完一次」

  // =====================================================================
  // 數字與文字
  // =====================================================================
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function signed(v, d) { const s = num(v, d); return v > 0 && /[1-9]/.test(s) ? '+' + s : s; }
  function solName(k) { return T(SOL[k].zh, SOL[k].en); }
  function shortSol(k) { return { glucose: T('葡萄糖', 'glucose'), sucrose: T('蔗糖', 'sucrose'), nacl: T('食鹽', 'NaCl'), cacl2: T('氯化鈣', 'CaCl2') }[k]; }
  function fmtTime(s) { return s < 100 ? num(s, s < 10 ? 2 : 1) + ' s' : num(s, 0) + ' s'; }
  function fmtMin(s) { const m = s / 60; return m < 100 ? num(m, 1) + T(' 分', ' min') : num(m, 0) + T(' 分', ' min'); }

  // =====================================================================
  // 顏色
  // =====================================================================
  const C = {};
  function readColors() {
    if (D.refresh) D.refresh();
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface', '--pos', '--neg', '--probe',
      '--do-solute', '--do-water', '--do-rbc', '--do-plant', '--do-wall', '--do-mem', '--do-glass', '--do-track', '--b-cell']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    if (!C['b-cell']) C['b-cell'] = C.accent;
    C.dark = D.dark;
  }

  // =====================================================================
  // 狀態
  // =====================================================================
  const S = { mode: 'diff', running: !reducedMotion, acted: false, speed: 1, Tc: 25 };
  const rand = K.rng((Date.now() ^ 0x5bd1e995) >>> 0);
  // ---------- 擴散 ----------
  const DF = { r: 0.5, cloud: K.createCloud({}, rand), track: [0, 1], trails: [[], []], run: null, history: [], chimed: false, partAnim: 0, stats: null, mixedTold: false };
  DF.stats = K.cloudStats(DF.cloud);
  function Dnow() { return K.diffusionUm2(S.Tc, DF.r); }
  // ---------- 滲透 ----------
  const OS = { solL: 'glucose', solR: 'sucrose', CL: 0, CR: 1, P: 0, st: null, ts: [], hs: [], history: [], eqChimed: false, drip: 0, eqTold: false, showEq: true, peeked: {} };
  // 平衡預測看過哪些設定（溶液、濃度、溫度）：任務 12 要自己算，看過預測的設定不算
  const osmoKey = function () { return OS.solL + '|' + OS.CL + '|' + OS.solR + '|' + OS.CR + '|' + S.Tc; };
  const markPeek = function () { if (OS.showEq) OS.peeked[osmoKey()] = true; };
  // ---------- 細胞 ----------
  const CS = { sol: 'nacl', C: 100, rbc: null, plant: null, t: 0, ts: [], rv: [], pv: [], history: [], lysedAt: 0, plasmo: false };
  function osmOut() { return SOL[CS.sol].i * CS.C; }

  // =====================================================================
  // 畫布
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const pcv = $('plot'), pctx = pcv.getContext('2d');
  function fit(c, g, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300;
    if (h) c.style.height = h + 'px';
    const hh = c.clientHeight || h || 300;
    c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: hh, dpr: dpr };
  }
  let mainSize = { w: 300, h: 300 }, plotSize = { w: 300, h: 220 };
  function mainHeight(w) {
    if (S.mode === 'diff') return layoutDiff(w).H;
    if (S.mode === 'osmo') return Math.round(clamp(w * 0.62, 400, 520));
    return w >= 560 ? Math.round(clamp(w * 0.5, 340, 420)) : 560;
  }
  function resizeMain() { mainSize = fit(cv, ctx, mainHeight(cv.clientWidth || 300)); requestDraw(); }
  function resizePlot() { plotSize = fit(pcv, pctx, pcv.clientWidth < 420 ? 200 : 230); requestDraw(); }

  // =====================================================================
  // 擴散：畫面
  // =====================================================================
  function layoutDiff(w) {
    const box = K.BOX;
    const bw = Math.round(Math.min(w - 28, 780));
    const bx = Math.round((w - bw) / 2);
    const by = 40;
    const bh = Math.round(bw * box.Ly / box.Lx);
    const hh = Math.round(clamp(bw * 0.17, 74, 128));
    const hy = by + bh + 26;
    return { bx: bx, by: by, bw: bw, bh: bh, hx: bx, hy: hy, hw: bw, hh: hh, H: hy + hh + 34, sc: bw / box.Lx };
  }
  const BINS = 20;
  function drawDiff(g, W, H) {
    const L = layoutDiff(W), c = DF.cloud, box = K.BOX;
    D.backdrop(g, W, H);
    // 盒子：淡淡的水
    const water = g.createLinearGradient(0, L.by, 0, L.by + L.bh);
    water.addColorStop(0, D.alpha(C['do-water'], C.dark ? 0.10 : 0.06));
    water.addColorStop(1, D.alpha(C['do-water'], C.dark ? 0.20 : 0.13));
    D.roundRect(g, L.bx, L.by, L.bw, L.bh, 6);
    g.fillStyle = water; g.fill();
    // 中線
    g.save();
    g.setLineDash([5, 5]);
    g.strokeStyle = D.alpha(C.text, 0.28); g.lineWidth = 1;
    const mx = Math.round(L.bx + L.bw / 2) + 0.5;
    g.beginPath(); g.moveTo(mx, L.by + 4); g.lineTo(mx, L.by + L.bh - 4); g.stroke();
    g.restore();
    // 粒子：依前後（z）分三層，遠的較小較淡，先畫遠的
    // 畫出的粒子大小只是示意（真正的分子只有零點幾奈米）：半徑越大畫得越大，並隨盒子寬度縮放
    const rpx = clamp((1.3 + 0.9 * Math.log2(DF.r / 0.2 + 1)) * 1.3 * Math.sqrt(L.bw / 780), 1.8, 6);
    const layers = [[], [], []];
    const p = [0, 0, 0];
    for (let i = 0; i < c.N; i++) {
      K.posOf(c, i, p);
      const z = p[2] / box.Lz;           // 0 前、1 後
      layers[z < 0.333 ? 2 : z < 0.667 ? 1 : 0].push(L.bx + p[0] * L.sc, L.by + p[1] * L.sc);
    }
    const cols = [D.mix(C['do-solute'], C['canvas-bg'], 0.38), D.mix(C['do-solute'], C['canvas-bg'], 0.16), C['do-solute']];
    const rs = [rpx * 0.82, rpx * 0.92, rpx];
    for (let k = 0; k < 3; k++) {
      const arr = layers[k];
      for (let j = 0; j < arr.length; j += 2) D.ball(g, arr[j], arr[j + 1], rs[k], cols[k], { shadow: k === 2, glow: C.dark ? 0.18 : 0 });
    }
    // 追蹤的粒子與路徑
    DF.track.forEach(function (idx, n) {
      const tr = DF.trails[n] || [];
      const col = C['do-track'];
      for (let k = 1; k < tr.length; k++) {
        const a0 = tr[k - 1], a1 = tr[k];
        if (Math.abs(a1[0] - a0[0]) > box.Lx * 0.35 || Math.abs(a1[1] - a0[1]) > box.Ly * 0.6) continue; // 器壁反彈的折回不連線
        g.strokeStyle = D.alpha(col, 0.12 + 0.75 * k / tr.length);
        g.lineWidth = 0.8 + 1.6 * k / tr.length;
        g.lineCap = 'round';
        g.beginPath(); g.moveTo(L.bx + a0[0] * L.sc, L.by + a0[1] * L.sc); g.lineTo(L.bx + a1[0] * L.sc, L.by + a1[1] * L.sc); g.stroke();
      }
      K.posOf(c, idx, p);
      const x = L.bx + p[0] * L.sc, y = L.by + p[1] * L.sc;
      D.ball(g, x, y, rpx + 1.2, col, { glow: C.dark ? 0.4 : 0.15 });
      g.strokeStyle = D.alpha(col, 0.9); g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, rpx + 5, 0, Math.PI * 2); g.stroke();
    });
    // 隔板（移除時往上滑出淡去：純裝飾）
    const pa = c.partition ? 1 : DF.partAnim;
    if (pa > 0) {
      const ax = L.bx + c.a * L.sc;
      const lift = c.partition ? 0 : (1 - pa) * L.bh * 0.9;
      g.save();
      g.globalAlpha = pa;
      g.beginPath(); g.rect(L.bx, L.by - 30, L.bw, L.bh + 30); g.clip();
      D.block(g, ax - 4, L.by - 6 - lift, 8, L.bh + 12, D.mix(C['do-glass'], C['canvas-bg'], 0.15), { r: 3, shadow: true });
      g.restore();
    }
    // 盒子外框（玻璃）
    g.save();
    D.roundRect(g, L.bx, L.by, L.bw, L.bh, 6);
    g.strokeStyle = D.alpha(C['do-glass'], 0.9); g.lineWidth = 2; g.stroke();
    D.roundRect(g, L.bx + 2.5, L.by + 2.5, L.bw - 5, L.bh - 5, 4);
    g.strokeStyle = D.alpha('#ffffff', C.dark ? 0.10 : 0.55); g.lineWidth = 1; g.stroke();
    g.restore();
    // 上方的標籤
    const st = DF.stats;
    D.pill(g, T('左半邊 ', 'Left half ') + st.nL, L.bx, L.by - 8, C.text, 'left');
    D.pill(g, T('右半邊 ', 'Right half ') + st.nR, L.bx + L.bw, L.by - 8, C.text, 'right');
    const tl = c.partition ? T('隔板還在', 'Partition in') : 't = ' + fmtTime(c.t);
    D.pill(g, tl, L.bx + L.bw / 2, L.by - 8, c.partition ? C.muted : C.accent, 'center');
    // 比例尺
    const sb = 50 * L.sc;
    const sx = L.bx + 10, sy = L.by + L.bh - 10;
    g.strokeStyle = C.text; g.lineWidth = 2; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + sb, sy); g.moveTo(sx, sy - 4); g.lineTo(sx, sy + 1); g.moveTo(sx + sb, sy - 4); g.lineTo(sx + sb, sy + 1); g.stroke();
    D.haloText(g, '50 μm', sx + sb + 6, sy, C.text, 'left', 'middle', '600 11px ' + FONT);
    // 直方圖
    drawHist(g, L);
  }
  function drawHist(g, L) {
    const c = DF.cloud;
    const h = K.histogram(c, BINS);
    const e = c.partition ? K.expectedBins(c.N, c.a, c.Lx, 0, BINS) : K.expectedBins(c.N, c.a, c.Lx, c.theta, BINS);
    const x0 = L.hx, y0 = L.hy, w = L.hw, hh = L.hh;
    // 上方留 18 px 給「粒子數（每格）」標籤，柱子不會蓋到它
    const top = Math.max(c.N * 2 / BINS * 1.04, Math.max.apply(null, h) * 1.03) * hh / Math.max(1, hh - 18);
    const Y = function (v) { return y0 + hh - v / top * hh; };
    g.fillStyle = D.alpha(C.text, C.dark ? 0.05 : 0.035);
    g.fillRect(x0, y0, w, hh);
    D.grid(g, x0, y0, x0 + w, y0 + hh, w / 4, w / 20, x0, y0 + hh);
    const bw = w / BINS;
    for (let b = 0; b < BINS; b++) {
      const yv = Y(h[b]);
      const gr = g.createLinearGradient(0, yv, 0, y0 + hh);
      gr.addColorStop(0, D.shade(C['do-solute'], 0.12));
      gr.addColorStop(1, D.shade(C['do-solute'], -0.18));
      g.fillStyle = gr;
      D.roundRect(g, x0 + b * bw + 1.5, yv, bw - 3, y0 + hh - yv, 2);
      g.fill();
    }
    // 均勻時的高度
    const yu = Y(c.N / BINS);
    g.save(); g.setLineDash([4, 4]); g.strokeStyle = D.alpha(C.text, 0.45); g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, yu); g.lineTo(x0 + w, yu); g.stroke(); g.restore();
    // 理論曲線
    g.strokeStyle = C.accent; g.lineWidth = 2.2; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath();
    for (let b = 0; b < BINS; b++) { const x = x0 + (b + 0.5) * bw, y = Y(e[b]); if (b) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    for (let b = 0; b < BINS; b++) D.ball(g, x0 + (b + 0.5) * bw, Y(e[b]), 2.6, C.accent, { shadow: false });
    // 座標
    g.strokeStyle = D.alpha(C.text, 0.5); g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, y0 + hh + 0.5); g.lineTo(x0 + w, y0 + hh + 0.5); g.stroke();
    const f = '11px ' + FONT;
    [0, 50, 100, 150, 200].forEach(function (um, k) {
      const x = x0 + um * L.sc;
      D.haloText(g, k === 4 ? '200 μm' : String(um), x, y0 + hh + 13, C.muted, k === 0 ? 'left' : k === 4 ? 'right' : 'center', 'middle', f);
    });
    D.haloText(g, T('粒子數（每格）', 'Particles per slice'), x0 + 4, y0 + 9, C.muted, 'left', 'middle', '600 11px ' + FONT);
    D.haloText(g, T('虛線：均勻分布', 'Dashed: even spread'), x0 + w - 4, yu - 8, C.muted, 'right', 'middle', f);
  }

  // =====================================================================
  // 滲透：畫面
  // =====================================================================
  function layoutOsmo(W, H) {
    const narrow = W < 560;
    const sep = Math.round(clamp(W * 0.2, 104, 190));
    const aw = Math.round(clamp(W * 0.045, 24, 38));
    const cx = Math.round(narrow ? W * 0.38 : W * 0.36);
    const R = sep / 2;
    const yb = H - R - aw / 2 - 26;
    const ytop = 84;
    const sv = (yb - ytop) / K.UTUBE.top;   // px／m
    const right = cx + R + aw / 2;   // 右管外緣
    const mr = Math.round(clamp(Math.min((W - right - 34) / 2, H * 0.24), 40, 120));
    const mxc = Math.round(right + 18 + mr);
    return { W: W, narrow: narrow, sep: sep, aw: aw, cx: cx, xl: cx - R, xr: cx + R, R: R, yb: yb, ytop: ytop, sv: sv,
      ymem: yb + R, mr: mr, mx: mxc, my: Math.round(yb - mr * 0.25) };
  }
  function osmoTint(osm) { return D.mix(C['do-water'], C['do-solute'], clamp(osm / 6, 0, 0.75)); }
  function osmoInk(osm) { return D.mix(C.text, C['do-solute'], clamp(osm / 6, 0, 0.7)); }
  let pistonHit = null;
  function drawOsmo(g, W, H) {
    const G = layoutOsmo(W, H);
    const r = K.osmoReadout(OS.st, S.Tc, OS.P * 1000);
    D.backdrop(g, W, H);
    const yOf = function (hm) { return G.yb - hm * G.sv; };
    // 尺（左管左邊，0 在彎管上緣）
    const rx = G.xl - G.aw / 2 - 16;
    g.strokeStyle = D.alpha(C.text, 0.55); g.lineWidth = 1;
    g.beginPath(); g.moveTo(rx + 0.5, yOf(0)); g.lineTo(rx + 0.5, yOf(K.UTUBE.top)); g.stroke();
    for (let cm = 0; cm <= 110; cm += 5) {
      const y = Math.round(yOf(cm / 100)) + 0.5, major = cm % 10 === 0;
      g.beginPath(); g.moveTo(rx - (major ? 7 : 4), y); g.lineTo(rx, y); g.stroke();
      if (cm % 20 === 0) D.haloText(g, String(cm), rx - 9, y, C.muted, 'right', 'middle', '11px ' + FONT);
    }
    D.haloText(g, 'cm', rx - 9, yOf(K.UTUBE.top) - 12, C.muted, 'right', 'middle', '600 11px ' + FONT);
    // 管子的路徑（中心線）
    const path = function (gg, upL, upR) {
      gg.moveTo(G.xl, upL); gg.lineTo(G.xl, G.yb);
      gg.arc(G.cx, G.yb, G.R, Math.PI, 0, true);
      gg.lineTo(G.xr, upR);
    };
    const tubeTop = yOf(K.UTUBE.top);
    // 玻璃（外層）
    g.save();
    g.lineCap = 'butt'; g.lineJoin = 'round';
    g.beginPath(); path(g, tubeTop, tubeTop);
    g.strokeStyle = D.alpha(C['do-glass'], C.dark ? 0.55 : 0.45); g.lineWidth = G.aw + 6; g.stroke();
    g.beginPath(); path(g, tubeTop, tubeTop);
    g.strokeStyle = C['canvas-bg']; g.lineWidth = G.aw; g.stroke();
    g.strokeStyle = D.alpha(C['do-glass'], C.dark ? 0.12 : 0.08); g.stroke();
    // 液體：左邊（到半透膜）、右邊
    const colL = osmoTint(r.osmL), colR = osmoTint(r.osmR);
    const yL = yOf(r.hL), yR = yOf(r.hR);
    g.lineWidth = G.aw - 1;
    g.beginPath(); g.moveTo(G.xl, yL); g.lineTo(G.xl, G.yb); g.arc(G.cx, G.yb, G.R, Math.PI, Math.PI / 2, true);
    g.strokeStyle = D.alpha(colL, C.dark ? 0.62 : 0.55); g.stroke();
    g.beginPath(); g.arc(G.cx, G.yb, G.R, Math.PI / 2, 0, true); g.lineTo(G.xr, yR);
    g.strokeStyle = D.alpha(colR, C.dark ? 0.62 : 0.55); g.stroke();
    // 液體的立體感：中間亮、邊緣暗的細線
    g.lineWidth = Math.max(2, G.aw * 0.18);
    g.strokeStyle = D.alpha('#ffffff', C.dark ? 0.10 : 0.28);
    g.beginPath(); g.moveTo(G.xl - G.aw * 0.18, yL + 3); g.lineTo(G.xl - G.aw * 0.18, G.yb); g.stroke();
    g.beginPath(); g.moveTo(G.xr - G.aw * 0.18, yR + 3); g.lineTo(G.xr - G.aw * 0.18, G.yb); g.stroke();
    g.restore();
    // 液面的彎月面
    [[G.xl, yL, colL], [G.xr, yR, colR]].forEach(function (q) {
      g.strokeStyle = D.shade(q[2], C.dark ? 0.35 : -0.25); g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(q[0] - G.aw / 2 + 1, q[1] - 3); g.quadraticCurveTo(q[0], q[1] + 3, q[0] + G.aw / 2 - 1, q[1] - 3); g.stroke();
    });
    // 玻璃的高光
    g.strokeStyle = D.alpha('#ffffff', C.dark ? 0.16 : 0.6); g.lineWidth = 1.2;
    [G.xl, G.xr].forEach(function (x) {
      g.beginPath(); g.moveTo(x - G.aw / 2 + 2.5, tubeTop + 4); g.lineTo(x - G.aw / 2 + 2.5, G.yb - 2); g.stroke();
    });
    // 半透膜
    const mh = G.aw + 8;
    const mg = g.createLinearGradient(G.cx - 3, 0, G.cx + 3, 0);
    mg.addColorStop(0, D.shade(C['do-mem'], -0.2)); mg.addColorStop(0.5, D.shade(C['do-mem'], 0.25)); mg.addColorStop(1, D.shade(C['do-mem'], -0.2));
    g.fillStyle = mg;
    D.roundRect(g, G.cx - 3, G.ymem - mh / 2, 6, mh, 2); g.fill();
    g.fillStyle = D.alpha(C['canvas-bg'], 0.8);
    for (let k = 0; k < 5; k++) g.fillRect(G.cx - 1, G.ymem - mh / 2 + 4 + k * (mh - 8) / 4 - 1, 2, 2);
    // 水流箭頭（半透膜上方）
    const rateCm = r.rate * 6000;   // cm/min
    if (Math.abs(rateCm) > 0.004) {
      const dir = rateCm > 0 ? 1 : -1;
      const len = clamp(14 + 10 * Math.log10(Math.abs(rateCm) / 0.004), 14, G.R * 0.9);
      const ya = G.ymem - G.aw / 2 - 16;
      D.arrow(g, G.cx - dir * len / 2, ya, G.cx + dir * len / 2, ya, C['do-water'], 2.6);
      D.haloText(g, T('水', 'water'), G.cx, ya - 13, C['do-water'], 'center', 'middle', '600 12px ' + FONT);
    }
    // 活塞（右管液面上；P = 0 時只是輕輕靠著）
    const pw = G.aw - 4, ph = 14, py = yR - ph - 2;
    const rodTop = Math.min(tubeTop - 14, py - 30);
    g.strokeStyle = D.alpha(C.muted, 0.9); g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(G.xr, py); g.lineTo(G.xr, rodTop + 6); g.stroke();
    D.block(g, G.xr - 13, rodTop - 4, 26, 10, D.mix(C.muted, C['canvas-bg'], 0.1), { r: 4 });
    D.block(g, G.xr - pw / 2, py, pw, ph, D.mix(C.muted, C['canvas-bg'], 0.25), { r: 3 });
    pistonHit = { x0: G.xr - Math.max(22, pw / 2 + 6), x1: G.xr + Math.max(22, pw / 2 + 6), y0: rodTop - 12, y1: py + ph + 6 };
    if (S.hover === 'piston' || pdrag) {
      g.save(); g.setLineDash([4, 3]); g.strokeStyle = C.accent; g.lineWidth = 1.5;
      D.roundRect(g, pistonHit.x0, pistonHit.y0, pistonHit.x1 - pistonHit.x0, pistonHit.y1 - pistonHit.y0, 6); g.stroke(); g.restore();
    }
    if (OS.P > 0.0005) {
      D.arrow(g, G.xr + 22, rodTop - 10, G.xr + 22, rodTop + 12, C.pos, 2.4);
      D.pill(g, 'P = ' + num(OS.P, 2) + ' kPa', G.xr + 30, rodTop + 10, C.pos, 'left', '600 11px ' + FONT);
    }
    // 液面差（兩管之間的括號）
    const hcm = r.h * 100;
    g.save(); g.setLineDash([3, 4]); g.strokeStyle = D.alpha(C.text, 0.45); g.lineWidth = 1;
    g.beginPath(); g.moveTo(G.xl + G.aw / 2 + 2, yL); g.lineTo(G.cx + 10, yL); g.moveTo(G.xr - G.aw / 2 - 2, yR); g.lineTo(G.cx - 10, yR); g.stroke();
    g.restore();
    if (Math.abs(yR - yL) > 8) {
      g.strokeStyle = C.text; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(G.cx, yL); g.lineTo(G.cx, yR); g.stroke();
      [yL, yR].forEach(function (y) { g.beginPath(); g.moveTo(G.cx - 5, y); g.lineTo(G.cx + 5, y); g.stroke(); });
    }
    const hy = Math.min(G.yb - 34, (yL + yR) / 2 + 6);
    D.pill(g, Math.abs(hcm) < 0.05 ? 'h ≈ 0' : 'h = ' + signed(hcm, 1) + ' cm', G.cx, hy, C.text, 'center', '700 12px ' + FONT);
    // 兩管上方的溶液名稱
    const lbl = function (sk, c0) { return c0 <= 0 ? T('純水', 'pure water') : shortSol(sk) + ' ' + num(c0, 2) + ' mmol/L'; };
    D.pill(g, T('左：', 'Left: ') + lbl(OS.solL, OS.CL), 10, 48, osmoInk(r.osmL), 'left', '600 11px ' + FONT);
    D.pill(g, T('右：', 'Right: ') + lbl(OS.solR, OS.CR), W - 10, 48, osmoInk(r.osmR), 'right', '600 11px ' + FONT);
    D.pill(g, 't = ' + fmtMin(OS.st.t) + T('（已加速）', ' (sped up)'), 10, 22, C.muted, 'left', '600 11px ' + FONT);
    if (OS.st.limited) D.pill(g, OS.st.limited === 'left' ? T('左管的水快流光了', 'The left arm is nearly empty') : T('右管的水快被壓光了', 'The right arm is nearly empty'), W - 10, 22, C.pos, 'right', '600 11px ' + FONT);
    drawInset(g, G, r);
  }
  // ---------- 半透膜放大圖（純示意的分子動畫） ----------
  const inset = { w: [], s: [], seed: 1 };
  function irand() { inset.seed = (inset.seed * 16807) % 2147483647; return inset.seed / 2147483647; }
  function insetReset() {
    inset.w = []; inset.s = [];
    for (let k = 0; k < 46; k++) inset.w.push({ x: irand() * 2 - 1, y: irand() * 2 - 1 });
    // 溶質數量：與滲透濃度成正比（純示意），有溶質時至少 3 顆
    const cnt = function (osm) { return osm <= 0 ? 0 : Math.round(clamp(3 + osm * 3, 3, 14)); };
    const nL = cnt(K.SOLUTES[OS.solL].i * OS.CL), nR = cnt(K.SOLUTES[OS.solR].i * OS.CR);
    for (let k = 0; k < nL; k++) inset.s.push({ x: -0.15 - irand() * 0.75, y: irand() * 1.6 - 0.8, side: -1 });
    for (let k = 0; k < nR; k++) inset.s.push({ x: 0.15 + irand() * 0.75, y: irand() * 1.6 - 0.8, side: 1 });
  }
  function insetStep(dtr, rateCm) {
    if (reducedMotion) return;
    const drift = clamp(rateCm / 1.5, -1, 1) * 0.35;   // 淨水流讓水分子整體往一邊漂（示意）
    const sig = 0.9 * Math.sqrt(dtr);
    inset.w.forEach(function (m) {
      const ox = m.x;
      m.x += sig * (irand() + irand() + irand() - 1.5) + drift * dtr;
      m.y += sig * (irand() + irand() + irand() - 1.5);
      if (ox * m.x < 0) {   // 穿過膜：只能從孔穿過
        const pore = Math.abs(((m.y + 1) * 3.5) % 1 - 0.5) < 0.32;
        if (!pore) m.x = ox;
      }
      if (m.y > 0.95) m.y = 1.9 - m.y; if (m.y < -0.95) m.y = -1.9 - m.y;
      if (m.x > 1) m.x -= 2; if (m.x < -1) m.x += 2;   // 從另一邊補進來（連續的水流）
    });
    inset.s.forEach(function (m) {
      m.x += sig * 0.5 * (irand() + irand() + irand() - 1.5);
      m.y += sig * 0.5 * (irand() + irand() + irand() - 1.5);
      if (m.side < 0) m.x = clamp(m.x, -0.85, -0.12); else m.x = clamp(m.x, 0.12, 0.85);   // 溶質過不去
      m.y = clamp(m.y, -0.8, 0.8);
      const q = Math.hypot(m.x, m.y);
      if (q > 0.84) { m.x *= 0.84 / q; m.y *= 0.84 / q; }   // 留在放大圓裡
    });
  }
  function drawInset(g, G, r) {
    const R = G.mr, x0 = G.mx, y0 = G.my;
    // 引線
    g.strokeStyle = D.alpha(C.muted, 0.6); g.lineWidth = 1;
    g.beginPath(); g.moveTo(G.cx + 6, G.ymem); g.lineTo(x0 - R * 0.72, y0 + R * 0.7); g.stroke();
    g.save();
    g.beginPath(); g.arc(x0, y0, R, 0, Math.PI * 2); g.clip();
    g.fillStyle = D.alpha(osmoTint(r.osmL), C.dark ? 0.32 : 0.18); g.fillRect(x0 - R, y0 - R, R, 2 * R);
    g.fillStyle = D.alpha(osmoTint(r.osmR), C.dark ? 0.32 : 0.18); g.fillRect(x0, y0 - R, R, 2 * R);
    // 膜與孔
    g.fillStyle = D.alpha(C['do-mem'], 0.85);
    g.fillRect(x0 - 4, y0 - R, 8, 2 * R);
    g.fillStyle = C['canvas-bg'];
    for (let k = -4; k <= 4; k++) { const yy = y0 + ((k + 0.5) / 3.5) * R; g.fillRect(x0 - 4, yy - R * 0.045, 8, R * 0.09); }
    const wr = Math.max(2, R * 0.045), sr = Math.max(3.6, R * 0.09);
    inset.s.forEach(function (m) { D.ball(g, x0 + m.x * R, y0 + m.y * R, sr, C['do-solute'], { shadow: false }); });
    inset.w.forEach(function (m) { D.ball(g, x0 + m.x * R, y0 + m.y * R, wr, C['do-water'], { shadow: false }); });
    g.restore();
    g.strokeStyle = D.alpha(C['do-glass'], 0.9); g.lineWidth = 2;
    g.beginPath(); g.arc(x0, y0, R, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = D.alpha('#ffffff', C.dark ? 0.12 : 0.5); g.lineWidth = 1;
    g.beginPath(); g.arc(x0, y0, R - 3, Math.PI * 1.05, Math.PI * 1.45); g.stroke();
    // 標籤放在右管與畫布右緣之間：放不下整句就改短句，不蓋到管子、不超出畫布
    const font = '600 11px ' + FONT, W = G.W, left = G.xr + G.aw / 2 + 4;
    let lab = T('放大示意：水過得去，溶質過不去', 'Enlarged: water passes, solute does not');
    g.font = font;
    if (g.measureText(lab).width + 24 > W - left) lab = T('放大示意', 'Enlarged view');
    const half = g.measureText(lab).width / 2 + 8;
    D.pill(g, lab, clamp(x0, left + half, W - half - 4), y0 - R - 6, C.muted, 'center', font);
  }

  // =====================================================================
  // 細胞：畫面
  // =====================================================================
  const solDots = [];
  (function () { let s = 7; for (let k = 0; k < 160; k++) { s = (s * 16807) % 2147483647; const a = s / 2147483647; s = (s * 16807) % 2147483647; solDots.push([a, s / 2147483647, 0, 0]); } })();
  function layoutCell(W, H) {
    const pad = 10;
    if (W >= 560) {
      const pw = (W - 3 * pad) / 2;
      return { a: { x: pad, y: 34, w: pw, h: H - 44 }, b: { x: 2 * pad + pw, y: 34, w: pw, h: H - 44 } };
    }
    const ph = (H - 34 - 3 * pad) / 2;
    return { a: { x: pad, y: 34, w: W - 2 * pad, h: ph }, b: { x: pad, y: 34 + ph + pad, w: W - 2 * pad, h: ph } };
  }
  function panelBg(g, P, osm) {
    g.save();
    D.roundRect(g, P.x, P.y, P.w, P.h, 10);
    g.clip();
    const tint = D.mix(C['do-water'], C['do-solute'], clamp(osm / 900, 0, 0.8));
    const gr = g.createRadialGradient(P.x + P.w / 2, P.y + P.h / 2, 10, P.x + P.w / 2, P.y + P.h / 2, Math.hypot(P.w, P.h) / 2);
    gr.addColorStop(0, D.alpha(tint, C.dark ? 0.12 : 0.07));
    gr.addColorStop(1, D.alpha(tint, C.dark ? 0.24 : 0.16));
    g.fillStyle = gr; g.fillRect(P.x, P.y, P.w, P.h);
    // 溶質粒子（數量隨滲透濃度增加；純示意）
    const n = Math.round(clamp(osm / 10, 0, solDots.length));
    for (let k = 0; k < n; k++) {
      const d = solDots[k];
      D.ball(g, P.x + 6 + d[0] * (P.w - 12) + d[2], P.y + 6 + d[1] * (P.h - 12) + d[3], 2.1, D.alpha(C['do-solute'], 0.9), { shadow: false });
    }
    g.restore();
    D.roundRect(g, P.x + 0.5, P.y + 0.5, P.w - 1, P.h - 1, 10);
    g.strokeStyle = D.alpha(C.border || C.muted, 0.9); g.lineWidth = 1; g.stroke();
  }
  function jiggleDots(dtr) {
    if (reducedMotion) return;
    solDots.forEach(function (d) {
      d[2] = clamp(d[2] + (Math.random() - 0.5) * 18 * Math.sqrt(dtr), -4, 4);
      d[3] = clamp(d[3] + (Math.random() - 0.5) * 18 * Math.sqrt(dtr), -4, 4);
    });
  }
  /** 紅血球正面：顏色深淺 ∝ 厚度（中央較薄就較淡：中央淡染區），皺縮時邊緣長刺 */
  function drawRbcFace(g, x, y, k, sh, lysed, rateV) {
    const col = C['do-rbc'];
    const rmax = K.rbcProfilePoint(Math.PI / 2, sh.s, sh.f)[0];
    if (lysed) {
      const age = (performance.now() - CS.lysedAt) / 1000;
      const a = clamp(1 - age / 3, 0, 1);
      if (a > 0) {
        const gr = g.createRadialGradient(x, y, 0, x, y, rmax * k * (1.4 + 1.2 * (1 - a)));
        gr.addColorStop(0, D.alpha(col, 0.35 * a)); gr.addColorStop(1, D.alpha(col, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, rmax * k * 2.6, 0, Math.PI * 2); g.fill();
      }
      g.save(); g.setLineDash([5, 4]); g.strokeStyle = D.alpha(col, 0.7); g.lineWidth = 1.6;
      g.beginPath(); g.arc(x, y, rmax * k, 0, Math.PI * 2); g.stroke(); g.restore();
      g.fillStyle = D.alpha(col, 0.06); g.beginPath(); g.arc(x, y, rmax * k, 0, Math.PI * 2); g.fill();
      return rmax * k;
    }
    // 外形
    const nSp = 15, amp = 0.16 * sh.cren;
    g.save();
    g.shadowColor = C.dark ? 'rgba(0,0,0,0.5)' : D.alpha(C.text, 0.25); g.shadowBlur = 10; g.shadowOffsetY = 3;
    g.beginPath();
    for (let j = 0; j <= 180; j++) {
      const ph = j / 180 * Math.PI * 2;
      const sp = Math.pow(Math.max(0, Math.cos(nSp * ph)), 6);   // 皺縮的小刺（示意）
      const rr = rmax * k * (1 + amp * sp - amp * 0.25);
      const px = x + rr * Math.cos(ph), py = y + rr * Math.sin(ph);
      if (j) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath();
    // 厚度 → 顏色深淺
    let tmax = 0;
    const th = [];
    for (let j = 0; j <= 10; j++) { const a = Math.asin(j / 10) ; const t = 2 * K.rbcProfilePoint(a, sh.s, sh.f)[1]; th.push(t); tmax = Math.max(tmax, t); }
    const gr = g.createRadialGradient(x, y, 0, x, y, rmax * k);
    for (let j = 0; j <= 10; j++) {
      const u = th[j] / (tmax || 1);
      gr.addColorStop(j / 10, D.mix(D.shade(col, 0.55), D.shade(col, -0.12), Math.pow(u, 0.9)));
    }
    g.fillStyle = gr; g.fill();
    g.restore();
    g.strokeStyle = D.alpha(D.shade(col, -0.35), 0.8); g.lineWidth = 1.2; g.stroke();
    // 高光
    g.strokeStyle = D.alpha('#ffffff', C.dark ? 0.22 : 0.45); g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, rmax * k * 0.82, Math.PI * 1.08, Math.PI * 1.42); g.stroke();
    // 水流箭頭
    flowArrows(g, x, y, rmax * k * (1 + amp) + 6, rateV / 6);
    return rmax * k;
  }
  function flowArrows(g, x, y, r0, q) {
    const a = Math.abs(q);
    if (a < 0.03) return;
    const len = clamp(6 + 10 * Math.sqrt(a), 6, 16);
    for (let j = 0; j < 6; j++) {
      const ph = j / 6 * Math.PI * 2 + 0.3;
      const c = Math.cos(ph), s = Math.sin(ph);
      const ra = q > 0 ? r0 + len : r0, rb = q > 0 ? r0 : r0 + len;   // 進：由外向內
      D.arrow(g, x + ra * c, y + ra * s, x + rb * c, y + rb * s, C['do-water'], 2);
    }
  }
  /** 紅血球剖面（Evans–Fung 雙凹圓盤 ↔ 球；與體積一致） */
  function drawRbcProfile(g, x, y, k, sh, lysed) {
    const col = C['do-rbc'];
    const pts = [];
    for (let j = 0; j <= 60; j++) { const a = j / 60 * Math.PI / 2; pts.push(K.rbcProfilePoint(a, sh.s, sh.f)); }
    g.beginPath();
    const P = function (rho, z, sx, sz) { return [x + sx * rho * k, y - sz * z * k]; };
    let q;
    for (let j = 0; j <= 60; j++) { q = P(pts[j][0], pts[j][1], 1, 1); if (j) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
    for (let j = 60; j >= 0; j--) { q = P(pts[j][0], pts[j][1], 1, -1); g.lineTo(q[0], q[1]); }
    for (let j = 0; j <= 60; j++) { q = P(pts[j][0], pts[j][1], -1, -1); g.lineTo(q[0], q[1]); }
    for (let j = 60; j >= 0; j--) { q = P(pts[j][0], pts[j][1], -1, 1); g.lineTo(q[0], q[1]); }
    g.closePath();
    if (lysed) {
      g.save(); g.setLineDash([5, 4]); g.strokeStyle = D.alpha(col, 0.7); g.lineWidth = 1.5; g.stroke(); g.restore();
      return;
    }
    const rmax = pts[60][0] * k;
    const gr = g.createLinearGradient(x, y - rmax, x, y + rmax);
    gr.addColorStop(0, D.shade(col, 0.35)); gr.addColorStop(0.5, col); gr.addColorStop(1, D.shade(col, -0.3));
    g.save();
    g.shadowColor = C.dark ? 'rgba(0,0,0,0.5)' : D.alpha(C.text, 0.22); g.shadowBlur = 8; g.shadowOffsetY = 2;
    g.fillStyle = gr; g.fill(); g.restore();
    g.strokeStyle = D.alpha(D.shade(col, -0.4), 0.8); g.lineWidth = 1.2; g.stroke();
    // 中心軸
    g.save(); g.setLineDash([2, 3]); g.strokeStyle = D.alpha(C.text, 0.35); g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y - rmax * 0.95); g.lineTo(x, y + rmax * 0.95); g.stroke(); g.restore();
  }
  /** 植物細胞（俯視）：細胞壁、原生質體、液胞、葉綠體、細胞核 */
  function drawPlant(g, P, v, rateV) {
    const cx = P.x + P.w / 2, cy = P.y + P.h / 2 - 1;
    const aspect = 1.55;
    // V = V_w 時細胞壁內側的大小（留空間給膨脹、細胞壁厚度與膨壓箭頭）
    const h0 = Math.min((P.w - 50) / aspect / 1.25, (P.h - 64) / 1.25), w0 = h0 * aspect;
    const sw = v > 1 ? Math.cbrt(v) : 1;          // 細胞壁被撐開（等比例）
    const wi = w0 * sw, hi = h0 * sw;
    const wt = clamp(w0 * 0.035, 4, 8);         // 細胞壁厚度
    const bulge = v > 1 ? (sw - 1) * w0 * 0.9 : 0;
    const wallPath = function (gg, ww, hh, b) {
      const x0 = cx - ww / 2, y0 = cy - hh / 2, r = Math.min(ww, hh) * 0.08;
      gg.beginPath();
      gg.moveTo(x0 + r, y0);
      gg.quadraticCurveTo(cx, y0 - b, x0 + ww - r, y0);
      gg.quadraticCurveTo(x0 + ww, y0, x0 + ww, y0 + r);
      gg.quadraticCurveTo(x0 + ww + b, cy, x0 + ww, y0 + hh - r);
      gg.quadraticCurveTo(x0 + ww, y0 + hh, x0 + ww - r, y0 + hh);
      gg.quadraticCurveTo(cx, y0 + hh + b, x0 + r, y0 + hh);
      gg.quadraticCurveTo(x0, y0 + hh, x0, y0 + hh - r);
      gg.quadraticCurveTo(x0 - b, cy, x0, y0 + r);
      gg.quadraticCurveTo(x0, y0, x0 + r, y0);
      gg.closePath();
    };
    // 細胞壁（外層）
    g.save();
    g.shadowColor = C.dark ? 'rgba(0,0,0,0.5)' : D.alpha(C.text, 0.22); g.shadowBlur = 10; g.shadowOffsetY = 3;
    wallPath(g, wi + 2 * wt, hi + 2 * wt, bulge);
    const wg = g.createLinearGradient(0, cy - hi / 2 - wt, 0, cy + hi / 2 + wt);
    wg.addColorStop(0, D.shade(C['do-wall'], 0.25)); wg.addColorStop(1, D.shade(C['do-wall'], -0.2));
    g.fillStyle = wg; g.fill(); g.restore();
    // 細胞壁內側（外液充填：質壁分離時看得到）
    wallPath(g, wi, hi, bulge);
    g.fillStyle = D.mix(C['canvas-bg'], D.mix(C['do-water'], C['do-solute'], clamp(osmOut() / 900, 0, 0.8)), C.dark ? 0.3 : 0.2);
    g.fill();
    // 原生質體
    const sp = v < 1 ? Math.cbrt(v) : 1;
    const pw = (v < 1 ? w0 : wi) * sp - (v < 1 ? 0 : 0), ph = (v < 1 ? h0 : hi) * sp;
    const rr = Math.min(pw, ph) * (v < 1 ? 0.12 + 0.9 * (1 - v) : 0.08);
    const pc = C['do-plant'];
    g.save();
    if (v >= 1) { wallPath(g, wi - 1, hi - 1, bulge); g.clip(); }
    D.roundRect(g, cx - pw / 2, cy - ph / 2, pw, ph, Math.min(rr, Math.min(pw, ph) / 2));
    const pg = g.createRadialGradient(cx - pw * 0.2, cy - ph * 0.25, 4, cx, cy, Math.max(pw, ph) * 0.7);
    pg.addColorStop(0, D.mix(D.shade(pc, 0.55), C['canvas-bg'], 0.2)); pg.addColorStop(1, D.mix(pc, C['canvas-bg'], 0.35));
    g.fillStyle = pg; g.fill();
    g.strokeStyle = D.shade(pc, -0.3); g.lineWidth = 1.4; g.stroke();
    // 液胞（中央，失水時縮得最多）
    const vf = Math.cbrt(clamp((v - K.PLANT.Vb) / (1 - K.PLANT.Vb), 0.05, 1.3));
    const vw = pw * 0.78 * vf / Math.max(sp, 0.4), vh = ph * 0.7 * vf / Math.max(sp, 0.4);
    const vw2 = Math.min(vw, pw * 0.82), vh2 = Math.min(vh, ph * 0.76);
    D.roundRect(g, cx - vw2 / 2, cy - vh2 / 2, vw2, vh2, Math.min(vw2, vh2) * 0.35);
    const vg = g.createRadialGradient(cx - vw2 * 0.2, cy - vh2 * 0.2, 2, cx, cy, Math.max(vw2, vh2) * 0.7);
    vg.addColorStop(0, D.alpha('#ffffff', C.dark ? 0.16 : 0.6)); vg.addColorStop(1, D.alpha(C['do-mem'], C.dark ? 0.28 : 0.2));
    g.fillStyle = vg; g.fill();
    g.strokeStyle = D.alpha(C['do-mem'], 0.6); g.lineWidth = 1; g.stroke();
    // 葉綠體：沿著原生質體邊緣
    const ring = function (u) {   // u：0–1 沿周長
      const per = 2 * (pw + ph), d = u * per, inset2 = Math.min(pw, ph) * 0.09;
      const a = pw - 2 * inset2, b = ph - 2 * inset2;
      const x0 = cx - a / 2, y0 = cy - b / 2;
      const dd = d / per * 2 * (a + b);
      if (dd < a) return [x0 + dd, y0, 0];
      if (dd < a + b) return [x0 + a, y0 + dd - a, Math.PI / 2];
      if (dd < 2 * a + b) return [x0 + a - (dd - a - b), y0 + b, 0];
      return [x0, y0 + b - (dd - 2 * a - b), Math.PI / 2];
    };
    const cr = clamp(Math.min(pw, ph) * 0.05, 3, 7);
    for (let j = 0; j < 14; j++) {
      const q = ring((j + 0.37) / 14);
      g.save(); g.translate(q[0], q[1]); g.rotate(q[2]);
      const cg = g.createRadialGradient(-cr * 0.3, -cr * 0.25, 0.5, 0, 0, cr * 1.4);
      cg.addColorStop(0, D.shade(pc, 0.35)); cg.addColorStop(1, D.shade(pc, -0.35));
      g.fillStyle = cg; g.beginPath(); g.ellipse(0, 0, cr * 1.5, cr, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    // 細胞核
    const nq = ring(0.8);
    D.ball(g, nq[0] + (nq[0] < cx ? 1 : -1) * cr * 1.6, nq[1] + (nq[1] < cy ? 1 : -1) * cr * 0.6, clamp(Math.min(pw, ph) * 0.07, 4, 9), D.mix(C.muted, C['do-mem'], 0.3), { shadow: false });
    g.restore();
    // 細胞壁的紋理（細線）與高光
    wallPath(g, wi + wt, hi + wt, bulge);
    g.strokeStyle = D.alpha(D.shade(C['do-wall'], 0.5), 0.35); g.lineWidth = 0.8; g.stroke();
    // 膨壓箭頭
    const Pk = K.turgor('plant', v);
    if (Pk > 30) {
      const n = clamp(Pk / 900, 0.2, 1);
      const L = 6 + 10 * n;
      [[cx, cy - hi / 2 - wt - 2, 0, -1], [cx, cy + hi / 2 + wt + 2, 0, 1], [cx - wi / 2 - wt - 2, cy, -1, 0], [cx + wi / 2 + wt + 2, cy, 1, 0]].forEach(function (a) {
        D.arrow(g, a[0], a[1], a[0] + a[2] * L, a[1] + a[3] * L, C.pos, 2);
      });
    }
    // 水流（穿過原生質體的膜）
    const q = rateV / 0.06;
    if (Math.abs(q) > 0.03) {
      const len = clamp(7 + 14 * Math.sqrt(Math.abs(q)), 7, 22);
      [[cx - pw * 0.25, cy - ph / 2, 0, -1], [cx + pw * 0.25, cy + ph / 2, 0, 1], [cx - pw / 2, cy + ph * 0.18, -1, 0], [cx + pw / 2, cy - ph * 0.18, 1, 0]].forEach(function (a) {
        const ox = a[0] + a[2] * (len + 2), oy = a[1] + a[3] * (len + 2);
        if (q > 0) D.arrow(g, ox, oy, a[0] + a[2] * 2, a[1] + a[3] * 2, C['do-water'], 2);
        else D.arrow(g, a[0] + a[2] * 2, a[1] + a[3] * 2, ox, oy, C['do-water'], 2);
      });
    }
    return { top: cy - hi / 2 - wt - bulge, bottom: cy + hi / 2 + wt + bulge };
  }
  function drawCell(g, W, H) {
    D.backdrop(g, W, H);
    const Lc = layoutCell(W, H), osm = osmOut();
    const pctTxt = num(K.percentWV(CS.C, SOL[CS.sol].M), 2) + '%';
    D.pill(g, T('外液：', 'Solution: ') + (CS.C <= 0 ? T('清水', 'pure water') : shortSol(CS.sol) + ' ' + num(CS.C, 0) + ' mmol/L = ' + num(osm, 0) + ' mOsm/L' + T('（', ' (') + pctTxt + T('）', ')')), 10, 24, C.text, 'left', '600 12px ' + FONT);
    if (W >= 520) D.pill(g, 't = ' + fmtTime(CS.t) + T('（已放慢）', ' (slowed)'), W - 10, 24, C.muted, 'right', '600 11px ' + FONT);
    // ---- 紅血球
    const A = Lc.a;
    panelBg(g, A, osm);
    const sh = K.rbcShape(CS.rbc.V);
    const k = Math.min((A.w - 70) / 17.9, (A.h - 96) / 8.6);   // px／μm（正面與剖面同比例）
    const cyA = A.y + A.h * 0.47;
    const fx = A.x + A.w * 0.28, sx = A.x + A.w * 0.74;
    const rateR = CS.rbc.lysed ? 0 : K.cellRate('rbc', CS.rbc.V, osm, S.Tc);
    drawRbcFace(g, fx, cyA, k, sh, CS.rbc.lysed, rateR);
    drawRbcProfile(g, sx, cyA, k, sh, CS.rbc.lysed);
    const lf = '600 11px ' + FONT;
    D.pill(g, T('紅血球（動物細胞）', 'Red blood cell (animal)'), A.x + 10, A.y + 24, C.text, 'left', '700 12px ' + FONT);
    D.pill(g, T('正面', 'Face-on'), fx, A.y + A.h - 34, C.muted, 'center', lf);
    D.pill(g, T('剖面', 'Cross-section'), sx, A.y + A.h - 34, C.muted, 'center', lf);
    const rs = rbcState();
    D.pill(g, (CS.rbc.lysed ? T('溶血', 'Burst') : num(CS.rbc.V, 1) + ' fL・' + rs.zh), A.x + A.w / 2, A.y + A.h - 8, rs.color, 'center', '700 12px ' + FONT);
    // ---- 植物細胞
    const B = Lc.b;
    panelBg(g, B, osm);
    const rateP = K.cellRate('plant', CS.plant.V, osm, S.Tc);
    drawPlant(g, B, CS.plant.V, rateP);
    D.pill(g, T('植物細胞（俯視）', 'Plant cell (from above)'), B.x + 10, B.y + 24, C.text, 'left', '700 12px ' + FONT);
    const ps = plantState();
    const Pk = K.turgor('plant', CS.plant.V);
    D.pill(g, ps.zh + (Pk > 0.5 ? T('・膨壓 ', ' · turgor ') + fmtP(Pk) : ''), B.x + B.w / 2, B.y + B.h - 8, ps.color, 'center', '700 12px ' + FONT);
  }
  function fmtP(kPa) { return kPa >= 100 ? num(kPa / 1000, 2) + ' MPa' : num(kPa, 0) + ' kPa'; }
  function rbcState() {
    if (CS.rbc.lysed) return { zh: T('溶血', 'burst'), color: C.pos, key: 'lysed' };
    const v = CS.rbc.V;
    if (v > 92) return { zh: T('膨脹', 'swollen'), color: C['do-water'], key: 'swollen' };
    if (v < 88) return { zh: T('皺縮', 'crenated'), color: C['do-solute'], key: 'shrunk' };
    return { zh: T('正常', 'normal'), color: C.probe, key: 'normal' };
  }
  function plantState() {
    const v = CS.plant.V;
    if (v < 0.995) return { zh: T('質壁分離', 'plasmolysed'), color: C.pos, key: 'plasmo' };
    if (v <= 1.005) return { zh: T('初始質壁分離', 'incipient plasmolysis'), color: C['do-solute'], key: 'incipient' };
    return { zh: T('膨脹（有膨壓）', 'turgid'), color: C.probe, key: 'turgid' };
  }
  function tonText(t) { return t === 'iso' ? T('等張', 'isotonic') : t === 'hypo' ? T('低張', 'hypotonic') : T('高張', 'hypertonic'); }

  // =====================================================================
  // 曲線圖
  // =====================================================================
  function niceStep(range, n) {
    const raw = range / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }
  /** 刻度數字：依刻度間隔決定小數位數（間隔 0.5 就顯示 0.5、1.0、1.5…，不會四捨五入成重複的整數） */
  function tickFmt(v, step) { return Math.abs(v) < 1e-9 ? '0' : num(v, step >= 1 ? 0 : step >= 0.1 ? 1 : 2); }
  function axes(g, W, H, xmax, ymin, ymax, xl, yl, xfmt, yfmt) {
    const l = 52, r = 12, t = 14, b = 30;
    const pw = W - l - r, ph = H - t - b;
    const X = function (x) { return l + x / xmax * pw; }, Y = function (y) { return t + ph - (y - ymin) / (ymax - ymin) * ph; };
    g.fillStyle = D.alpha(C.text, C.dark ? 0.04 : 0.025); g.fillRect(l, t, pw, ph);
    const xs = niceStep(xmax, W < 420 ? 4 : 6), ys = niceStep(ymax - ymin, 4);
    g.lineWidth = 1;
    for (let x = 0; x <= xmax + 1e-9; x += xs) {
      const px = Math.round(X(x)) + 0.5;
      g.strokeStyle = D.alpha(C.text, 0.08); g.beginPath(); g.moveTo(px, t); g.lineTo(px, t + ph); g.stroke();
      D.haloText(g, xfmt(x, xs), px, t + ph + 12, C.muted, 'center', 'middle', '11px ' + FONT);
    }
    for (let y = Math.ceil(ymin / ys) * ys; y <= ymax + 1e-9; y += ys) {
      const py = Math.round(Y(y)) + 0.5;
      g.strokeStyle = D.alpha(C.text, Math.abs(y) < 1e-9 ? 0.3 : 0.08); g.beginPath(); g.moveTo(l, py); g.lineTo(l + pw, py); g.stroke();
      D.haloText(g, yfmt(y, ys), l - 6, py, C.muted, 'right', 'middle', '11px ' + FONT);
    }
    g.strokeStyle = D.alpha(C.text, 0.45);
    g.beginPath(); g.moveTo(l + 0.5, t); g.lineTo(l + 0.5, t + ph + 0.5); g.lineTo(l + pw, t + ph + 0.5); g.stroke();
    D.haloText(g, xl, l + pw, t + ph + 24, C.muted, 'right', 'middle', '600 11px ' + FONT);
    D.haloText(g, yl, l + 6, t + 9, C.muted, 'left', 'middle', '600 11px ' + FONT);
    return { X: X, Y: Y, l: l, t: t, pw: pw, ph: ph };
  }
  function polyline(g, xs, ys, A, col, w, dash, alpha) {
    if (xs.length < 2) return;
    g.save();
    if (dash) g.setLineDash(dash);
    g.strokeStyle = alpha != null ? D.alpha(col, alpha) : col; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i < xs.length; i++) { const x = A.X(xs[i]), y = A.Y(ys[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke(); g.restore();
  }
  function drawPlot() {
    const g = pctx, W = plotSize.w, H = plotSize.h;
    D.backdrop(g, W, H);
    if (S.mode === 'diff') plotDiff(g, W, H);
    else if (S.mode === 'osmo') plotOsmo(g, W, H);
    else plotCell(g, W, H);
  }
  function runLabel(rn) { return num(rn.T, 0) + ' °C, ' + num(rn.r, 2) + ' nm'; }
  function plotDiff(g, W, H) {
    const runs = DF.history.slice(-5);
    const cur = DF.run;
    let xmax = 1, ymax = 500;
    runs.concat(cur ? [cur] : []).forEach(function (rn) {
      if (!rn.ts.length) return;
      xmax = Math.max(xmax, rn.ts[rn.ts.length - 1]);
      ymax = Math.max(ymax, rn.ms[rn.ms.length - 1], rn.th[rn.th.length - 1]);
    });
    xmax = niceStep(xmax, 1) * Math.ceil(xmax / niceStep(xmax, 1));
    ymax *= 1.1;
    const A = axes(g, W, H, xmax, 0, ymax, T('時間 t（s）', 'time t (s)'), '⟨Δx²⟩ (μm²)', tickFmt, function (y) { return y >= 1e4 ? num(y / 1000, 0) + 'k' : num(y, 0); });
    runs.forEach(function (rn, i) {
      const col = D.mix(C.muted, C['do-solute'], 0.25);
      polyline(g, [0].concat(rn.ts), [0].concat(rn.ms), A, col, 1.6, null, 0.35 + 0.1 * i);
      const n = rn.ts.length - 1;
      if (n >= 0) {
        const x = A.X(rn.ts[n]), y = A.Y(rn.ms[n]);
        if (x > A.l + 40) D.haloText(g, runLabel(rn), Math.min(x, A.l + A.pw - 2), y - 8, C.muted, 'right', 'middle', '10.5px ' + FONT);
      }
    });
    if (cur && cur.ts.length) {
      polyline(g, [0].concat(cur.ts), [0].concat(cur.th), A, C.accent, 2, [6, 4]);
      polyline(g, [0].concat(cur.ts), [0].concat(cur.ms), A, C['do-solute'], 2.6);
      const n = cur.ts.length - 1;
      D.ball(g, A.X(cur.ts[n]), A.Y(cur.ms[n]), 4, C['do-solute']);
    } else {
      D.haloText(g, T('按「移除隔板」開始量均方位移', 'Press “Remove the partition” to start measuring'), A.l + A.pw / 2, A.t + A.ph / 2, C.muted, 'center', 'middle', '600 12px ' + FONT);
    }
  }
  function plotOsmo(g, W, H) {
    const eq = K.osmoEquilibrium(OS.st, S.Tc, OS.P * 1000);
    const runs = OS.history.slice(-4);
    let xmax = 20, ymin = -5, ymax = 5;
    runs.concat([{ ts: OS.ts, hs: OS.hs }]).forEach(function (rn) {
      rn.ts.forEach(function (t, i) { xmax = Math.max(xmax, t / 60); ymin = Math.min(ymin, rn.hs[i]); ymax = Math.max(ymax, rn.hs[i]); });
    });
    if (OS.showEq) { ymin = Math.min(ymin, eq.h * 100); ymax = Math.max(ymax, eq.h * 100); }
    const pad = (ymax - ymin) * 0.12;
    xmax = niceStep(xmax, 1) * Math.ceil(xmax / niceStep(xmax, 1));
    const A = axes(g, W, H, xmax, ymin - pad, ymax + pad, T('時間（分，已加速）', 'time (min, sped up)'), T('液面差 h（cm）', 'level difference h (cm)'),
      tickFmt, tickFmt);
    runs.forEach(function (rn) { polyline(g, rn.ts.map(function (t) { return t / 60; }), rn.hs, A, C.muted, 1.5, null, 0.45); });
    if (OS.showEq) {
      markPeek();
      const ye = A.Y(eq.h * 100);
      g.save(); g.setLineDash([6, 4]); g.strokeStyle = C.accent; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(A.l, ye); g.lineTo(A.l + A.pw, ye); g.stroke(); g.restore();
      D.haloText(g, T('平衡 ', 'equilibrium ') + signed(eq.h * 100, 1) + ' cm', A.l + A.pw - 4, ye + (eq.h >= 0 ? 10 : -10), C.accent, 'right', 'middle', '600 11px ' + FONT);
    }
    polyline(g, OS.ts.map(function (t) { return t / 60; }), OS.hs, A, C['do-water'], 2.6);
    const n = OS.ts.length - 1;
    if (n >= 0) D.ball(g, A.X(OS.ts[n] / 60), A.Y(OS.hs[n]), 4, C['do-water']);
  }
  function plotCell(g, W, H) {
    const runs = CS.history.slice(-3);
    let xmax = 10;
    runs.concat([{ ts: CS.ts }]).forEach(function (rn) { if (rn.ts.length) xmax = Math.max(xmax, rn.ts[rn.ts.length - 1]); });
    xmax = niceStep(xmax, 1) * Math.ceil(xmax / niceStep(xmax, 1));
    const ly = K.RBC.Vlysis / K.RBC.V0;
    const A = axes(g, W, H, xmax, 0.3, 1.8, T('時間（s，已放慢）', 'time (s, slowed)'), T('體積 ÷ 正常體積', 'volume ÷ normal volume'),
      tickFmt, function (y) { return num(y, 1); });
    [[ly, C.pos, T('紅血球溶血', 'red cell bursts')], [1, C.muted, T('正常／貼著細胞壁', 'normal / against the wall')]].forEach(function (q) {
      const y = A.Y(q[0]);
      g.save(); g.setLineDash([5, 4]); g.strokeStyle = D.alpha(q[1], 0.7); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(A.l, y); g.lineTo(A.l + A.pw, y); g.stroke(); g.restore();
      D.haloText(g, q[2], A.l + A.pw - 4, q[0] === 1 ? y + 9 : y - 8, q[1], 'right', 'middle', '10.5px ' + FONT);
    });
    runs.forEach(function (rn) {
      polyline(g, rn.ts, rn.rv.map(function (v) { return v / K.RBC.V0; }), A, C['do-rbc'], 1.4, null, 0.3);
      polyline(g, rn.ts, rn.pv, A, C['do-plant'], 1.4, null, 0.3);
    });
    polyline(g, CS.ts, CS.rv.map(function (v) { return v / K.RBC.V0; }), A, C['do-rbc'], 2.4);
    polyline(g, CS.ts, CS.pv, A, C['do-plant'], 2.4);
    const n = CS.ts.length - 1;
    if (n >= 0) {
      D.ball(g, A.X(CS.ts[n]), A.Y(CS.rv[n] / K.RBC.V0), 4, C['do-rbc']);
      D.ball(g, A.X(CS.ts[n]), A.Y(CS.pv[n]), 4, C['do-plant']);
    }
  }

  // =====================================================================
  // 繪圖總管
  // =====================================================================
  function drawMain() {
    if (view3 && view3.active) { view3.frame(); return; }
    const g = ctx, W = mainSize.w, H = mainSize.h;
    if (S.mode === 'diff') drawDiff(g, W, H);
    else if (S.mode === 'osmo') drawOsmo(g, W, H);
    else drawCell(g, W, H);
    if (kb && kb.focused && kb.focused()) {
      g.save(); g.setLineDash([5, 4]); g.strokeStyle = C.accent; g.lineWidth = 2;
      D.roundRect(g, 3, 3, W - 6, H - 6, 8); g.stroke(); g.restore();
    }
  }
  function plotCaption() {
    $('plotCap').innerHTML = S.mode === 'diff'
      ? T('<b>均方位移</b>——實線是 600 個粒子在 x 方向位移平方的平均，虛線是理論 2Dt；舊的紀錄保留在圖上比較。',
        '<b>Mean square displacement</b> — solid: the average of the 600 particles’ squared x-displacements; dashed: the theory 2Dt. Earlier runs stay for comparison.')
      : S.mode === 'osmo'
        ? (OS.showEq ? T('<b>液面差</b>——右管比左管高多少；虛線是平衡時的液面差（考慮了稀釋）。',
          '<b>Level difference</b> — how much higher the right level is than the left; dashed: the equilibrium value (dilution included).')
          : T('<b>液面差</b>——右管比左管高多少（平衡預測已關閉）。', '<b>Level difference</b> — how much higher the right level is than the left (equilibrium prediction off).'))
        : T('<b>細胞體積</b>——紅線是紅血球的 V／90 fL，綠線是植物細胞的原生質體 ÷ 細胞壁內容積；淡色是之前的紀錄。',
          '<b>Cell volume</b> — red: the red cell’s V / 90 fL; green: the plant protoplast ÷ the volume inside its wall; faint lines are earlier records.');
    $('speedHint').innerHTML = S.mode === 'diff'
      ? T('擴散：×1 就是真實的時間。', 'Diffusion: ×1 is real time.')
      : S.mode === 'osmo'
        ? T('滲透：×1 時每秒經過 2 分鐘（真實的滲透計常要好幾小時）。', 'Osmosis: at ×1 two minutes pass each second (real osmometers often take hours).')
        : T('細胞：已放慢；真實的紅血球不到一秒就達平衡。', 'Cells: slowed down; a real red blood cell settles in under a second.');
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function setText(id, s) { const el = $(id); if (el && el.textContent !== s) el.textContent = s; }
  function setHTML(id, s) { const el = $(id); if (el && el.innerHTML !== s) el.innerHTML = s; }
  function updateReadouts() {
    if (S.mode === 'diff') {
      const Dv = Dnow(), c = DF.cloud, st = DF.stats, run = DF.run;
      setHTML('rD', num(Dv, Dv < 100 ? 1 : 0) + ' μm<sup>2</sup>/s<small>' + num(Dv * 1e-12 * 1e10, 2) + ' × 10<sup>−10</sup> m<sup>2</sup>/s</small>');
      setText('rEta', num(K.waterViscosity(S.Tc) * 1000, 3) + ' mPa·s');
      setText('rT', c.partition ? T('（隔板還在）', '(partition in)') : fmtTime(c.t));
      setHTML('rMsd', c.partition ? '—' : num(st.msdX, 0) + ' μm<sup>2</sup>');
      setHTML('rMsdT', c.partition ? '—' : num(2 * c.theta, 0) + ' μm<sup>2</sup>');
      setHTML('rDfit', !run || !run.ts.length ? '—' : run.mixed ? T('（途中改過設定）', '(settings changed)') :
        num(run.Dfit, run.Dfit < 100 ? 1 : 0) + ' μm<sup>2</sup>/s<small>' + T('與理論差 ', 'off the theory by ') + signed(100 * (run.Dfit / Dv - 1), 1) + '%</small>');
      setText('rRight', st.nR + ' / ' + st.N + T('（', ' (') + num(100 * st.fracR, 1) + T('%）', '%)'));
      setText('rSeen', c.partition ? '—' : st.seen + ' / ' + st.N);
      setText('rTau', fmtTime(K.relaxTime(K.BOX.Lx, Dv)));
    } else if (S.mode === 'osmo') {
      const r = K.osmoReadout(OS.st, S.Tc, OS.P * 1000);
      const eq = K.osmoEquilibrium(OS.st, S.Tc, OS.P * 1000);
      const cs = function (sk, Cn) { return Cn <= 1e-12 ? T('純水', 'pure water') : num(Cn, 3) + ' mmol/L<small>' + solName(sk) + T('，', ', ') + num(SOL[sk].i * Cn, 3) + ' mOsm/L</small>'; };
      setText('oT', fmtMin(OS.st.t));
      setHTML('oCL', cs(OS.solL, r.CL));
      setHTML('oCR', cs(OS.solR, r.CR));
      const osmS = SOL[OS.solR].i * OS.CR - SOL[OS.solL].i * OS.CL;
      setHTML('oDpi', signed(r.dpi / 1000, 3) + ' kPa<small>' + T('液面歸零時是 ', 'at refill: ') + signed(K.osmoticPressure(osmS, S.Tc) / 1000, 3) + ' kPa</small>');
      setText('oRgh', signed(r.rhogh / 1000, 3) + ' kPa');
      setText('oP', num(OS.P, 3) + ' kPa');
      setText('oH', signed(r.h * 100, 2) + ' cm');
      setText('oRate', signed(r.rate * 6000, 3) + T(' cm/分', ' cm/min'));
      if (OS.showEq) markPeek();
      setText('oHeq', !OS.showEq ? T('（預測已關閉）', '(prediction off)') : eq.limited ? T('（管子不夠長）', '(off the tube)') : signed(eq.h * 100, 2) + ' cm');
      const osm0 = SOL[OS.solR].i * OS.CR - SOL[OS.solL].i * OS.CL;
      setText('oH0', signed(K.osmoticPressure(osm0, S.Tc) / (K.waterDensity(S.Tc) * K.G) * 100, 2) + ' cm' + T('（起始的濃度差）', ' (starting difference)'));
    } else {
      const osm = osmOut();
      setText('cT', fmtTime(CS.t));
      const eqR = K.cellEquilibrium('rbc', osm, S.Tc);
      setText('cRV', CS.rbc.lysed ? T('破裂', 'burst') : num(CS.rbc.V, 1) + ' fL（' + num(100 * CS.rbc.V / K.RBC.V0, 0) + '%）');
      setText('cRS', rbcState().zh);
      setHTML('cRTon', tonText(K.tonicity(osm, K.RBC.Cref)) + '<small>' + T('細胞內約 ', 'inside ≈ ') + K.RBC.Cref + ' mOsm/L</small>');
      setText('cREq', eqR.lysis ? T('會溶血', 'it would burst') : num(eqR.V, 1) + ' fL');
      setText('cPV', num(CS.plant.V, 3));
      setText('cPP', fmtP(K.turgor('plant', CS.plant.V)));
      setText('cPS', plantState().zh);
      setHTML('cPTon', tonText(K.tonicity(osm, K.PLANT.Cref)) + '<small>' + T('細胞液約 ', 'sap ≈ ') + K.PLANT.Cref + ' mOsm/L</small>');
      setHTML('cellInfo', T('滲透濃度 ', 'Osmolarity ') + '<b>' + num(osm, 0) + ' mOsm/L</b>' + T('，相當於 ', ', i.e. ') + '<b>' + num(K.percentWV(CS.C, SOL[CS.sol].M), 2) + '%</b>' +
        T('（質量／體積）；滲透壓 ', ' (mass/volume); osmotic pressure ') + '<b>' + fmtP(K.RTkPa(S.Tc) * osm) + '</b>' + T('（', ' (') + num(K.RTkPa(S.Tc) * osm / 101.325, 2) + ' atm' + T('）', ')'));
    }
  }

  // =====================================================================
  // 前進一步
  // =====================================================================
  function pushTrails() {
    const p = [0, 0, 0];
    DF.track.forEach(function (idx, n) {
      const tr = DF.trails[n] || (DF.trails[n] = []);
      K.posOf(DF.cloud, idx, p);
      tr.push([p[0], p[1], p[2]]);
      if (tr.length > 140) tr.shift();
    });
  }
  function runSample() {
    const c = DF.cloud, run = DF.run;
    if (!run) return;
    run.t = c.t;
    const last = run.ts.length ? run.ts[run.ts.length - 1] : 0;
    if (!run.ts.length || c.t - last >= Math.max(0.004, c.t / 300)) {
      run.ts.push(c.t); run.ms.push(DF.stats.msdX); run.th.push(2 * c.theta);
      if (run.ts.length > 700) ['ts', 'ms', 'th'].forEach(function (k) { run[k] = run[k].filter(function (_, i) { return i % 2 === 0 || i === run[k].length - 1; }); });
    }
    run.complete = 2 * c.theta >= MSD_DONE;
    run.Dfit = run.mixed ? NaN : K.fitSlope(run.ts, run.ms) / 2;
  }
  function osmoSample() {
    const t = OS.st.t, last = OS.ts.length ? OS.ts[OS.ts.length - 1] : -1;
    if (t - last >= Math.max(5, t / 400)) {
      OS.ts.push(t); OS.hs.push(OS.st.x * 200);
      if (OS.ts.length > 800) { OS.ts = OS.ts.filter(function (_, i) { return i % 2 === 0; }); OS.hs = OS.hs.filter(function (_, i) { return i % 2 === 0; }); }
    }
  }
  function cellSample() {
    const last = CS.ts.length ? CS.ts[CS.ts.length - 1] : -1;
    if (CS.t - last >= Math.max(0.03, CS.t / 400)) {
      CS.ts.push(CS.t); CS.rv.push(CS.rbc.V); CS.pv.push(CS.plant.V);
      if (CS.ts.length > 800) ['ts', 'rv', 'pv'].forEach(function (k) { CS[k] = CS[k].filter(function (_, i) { return i % 2 === 0; }); });
    }
  }
  function advance(dtr) {
    const k = S.speed;
    if (S.mode === 'diff') {
      K.stepCloud(DF.cloud, Dnow(), k * BASE.diff * dtr);
      DF.stats = K.cloudStats(DF.cloud);
      if (!DF.cloud.partition) {
        runSample();
        if (!DF.chimed && Math.abs(DF.stats.fracR - 0.5) <= 0.02 && DF.cloud.t > 0) {
          DF.chimed = true;
          const Sd = sound(); if (Sd) { Sd.tone({ freq: 660, dur: 0.25, gain: 0.18 }); Sd.tone({ freq: 990, dur: 0.3, gain: 0.12, delay: 0.1 }); }
          setStatus(T('左右兩半的粒子數已經差不多：濃度變均勻了，但每個粒子仍然一直在亂走。', 'The two halves now hold about the same number: the concentration is even, but every particle is still wandering.'));
        }
      }
      if (DF.partAnim > 0) DF.partAnim = Math.max(0, DF.partAnim - dtr / 0.45);
      pushTrails();
    } else if (S.mode === 'osmo') {
      const x0 = OS.st.x;
      K.osmoStep(OS.st, S.Tc, OS.P * 1000, k * BASE.osmo * dtr);
      osmoSample();
      // 滴水聲：液面每變化 1 cm 響一下（越接近平衡越稀疏）
      OS.drip += (OS.st.x - x0) * 200;
      if (Math.abs(OS.drip) >= 1) {
        const Sd = sound();
        if (Sd) Sd.tone({ freq: OS.drip > 0 ? 784 : 523, dur: 0.07, gain: 0.12, type: 'sine' });
        OS.drip = 0;
      }
      const rate = K.osmoRate(OS.st, OS.st.x, S.Tc, OS.P * 1000) * 2 * 6000;
      if (!OS.eqChimed && Math.abs(rate) < 0.005 && OS.st.t >= 300 && !OS.st.limited) {
        OS.eqChimed = true;
        const Sd = sound(); if (Sd) { Sd.tone({ freq: 587, dur: 0.25, gain: 0.16 }); Sd.tone({ freq: 880, dur: 0.35, gain: 0.12, delay: 0.12 }); }
        const r = K.osmoReadout(OS.st, S.Tc, OS.P * 1000);
        setStatus(T('平衡了：液柱壓力 ρgh ', 'Equilibrium: the column pressure ρgh ') + num(r.rhogh / 1000, 3) + T(' kPa ＋ 活塞 ', ' kPa + piston ') + num(OS.P, 3) +
          T(' kPa ＝ 滲透壓差 Δπ ', ' kPa = osmotic pressure difference Δπ ') + num(r.dpi / 1000, 3) + ' kPa.');
      }
      insetStep(dtr, rate);
    } else {
      const osm = osmOut(), wasL = CS.rbc.lysed, wasP = CS.plant.V < 0.995;
      const dt = k * BASE.cell * dtr;
      K.cellStep(CS.rbc, osm, S.Tc, dt);
      K.cellStep(CS.plant, osm, S.Tc, dt);
      CS.t += dt;
      cellSample();
      if (!wasL && CS.rbc.lysed) {
        CS.lysedAt = performance.now();
        const Sd = sound(); if (Sd) { Sd.noise({ dur: 0.12, gain: 0.4, filter: 2600, q: 0.8 }); Sd.sweep({ from: 900, to: 300, dur: 0.22, gain: 0.18 }); }
        setStatus(T('紅血球漲成球形後再進水就破了：溶血。血紅素流進溶液，只剩下細胞膜的空殼。', 'Swollen into a sphere, the red cell could take no more water and burst (haemolysis): its haemoglobin leaks out and only an empty membrane ghost is left.'));
      }
      const isP = CS.plant.V < 0.995;
      if (isP !== wasP) {
        const Sd = sound(); if (Sd) Sd.sweep(isP ? { from: 520, to: 330, dur: 0.3, gain: 0.15 } : { from: 330, to: 520, dur: 0.3, gain: 0.15 });
        if (isP) setStatus(T('原生質體失水縮小，離開了細胞壁：質壁分離。', 'The protoplast has lost water and pulled away from the wall: plasmolysis.'));
      }
      jiggleDots(dtr);
    }
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function acted() { S.acted = true; }
  function runSummary(rn) { return { T: rn.T, r: rn.r, D: rn.D, Dfit: rn.Dfit, complete: rn.complete, mixed: rn.mixed, t: rn.t }; }
  function missionData() {
    if (S.mode === 'diff') {
      const c = DF.cloud, st = DF.stats, run = DF.run, Dv = Dnow();
      const runs = DF.history.map(runSummary);
      if (run && run.complete && !run.mixed) runs.push(runSummary(run));
      return { mode: 'diff', partition: c.partition, t: c.t, T: S.Tc, r: DF.r, D: Dv, theta: c.theta, msd: st.msdX, theory: 2 * c.theta,
        Dfit: run ? run.Dfit : NaN, fitErr: run && !run.mixed ? run.Dfit / Dv - 1 : NaN, complete: !!(run && run.complete), mixed: !!(run && run.mixed),
        fracR: st.fracR, nR: st.nR, N: st.N, allSeen: !c.partition && st.allSeen, runs: runs };
    }
    if (S.mode === 'osmo') {
      const r = K.osmoReadout(OS.st, S.Tc, OS.P * 1000), eq = K.osmoEquilibrium(OS.st, S.Tc, OS.P * 1000);
      const rate = r.rate * 6000;
      return { mode: 'osmo', t: OS.st.t / 60, solL: OS.solL, solR: OS.solR, iL: SOL[OS.solL].i, iR: SOL[OS.solR].i, CL0: OS.CL, CR0: OS.CR,
        osmL0: SOL[OS.solL].i * OS.CL, osmR0: SOL[OS.solR].i * OS.CR, T: S.Tc, P: OS.P, h: r.h * 100, dpi: r.dpi / 1000, rhogh: r.rhogh / 1000,
        rate: rate, eq: Math.abs(rate) < 0.005 && OS.st.t >= 300 && !OS.st.limited, heq: eq.h * 100, limited: OS.st.limited, peek: !!OS.peeked[osmoKey()] };
    }
    const osm = osmOut();
    const eqR = K.cellEquilibrium('rbc', osm, S.Tc), eqP = K.cellEquilibrium('plant', osm, S.Tc);
    return { mode: 'cell', t: CS.t, sol: CS.sol, i: SOL[CS.sol].i, C: CS.C, osm: osm, T: S.Tc,
      rbcV: CS.rbc.V, rbcLysed: CS.rbc.lysed, rbcEq: CS.rbc.lysed || (!eqR.lysis && Math.abs(CS.rbc.V - eqR.V) < 0.3), rbcEqV: eqR.lysis ? null : eqR.V,
      plantV: CS.plant.V, turgor: K.turgor('plant', CS.plant.V), plantEq: Math.abs(CS.plant.V - eqP.V) < 0.002, plasmolyzed: CS.plant.V < 0.995 };
  }
  let lastEmit = 0;
  function emitState() {
    lastEmit = performance.now();
    if (!S.acted || !window.LabMission) return;
    window.LabMission.emit(S.mode, missionData());
  }

  // =====================================================================
  // 音效、狀態列
  // =====================================================================
  function sound() { const Sd = window.LabSound; return Sd && Sd.enabled() ? Sd : null; }
  function setStatus(s) { $('status').textContent = s; }
  function updatePlay() { $('play').textContent = S.running ? T('暫停', 'Pause') : T('播放', 'Play'); }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function updatePartBtn() { $('partBtn').textContent = DF.cloud.partition ? T('移除隔板', 'Remove the partition') : T('放回隔板', 'Put the partition back'); }

  // =====================================================================
  // 控制項
  // =====================================================================
  const elT = $('temp'), elSp = $('speed'), elR = $('rad'), elCL = $('cL'), elCR = $('cR'), elP = $('pist'), elCC = $('cC');
  if (window.LabNum) {
    window.LabNum.register(elSp, { toValue: function (p) { return Math.pow(10, p); }, toPos: function (v) { return Math.log10(v); }, min: 0.1, max: 30, decimals: 2 });
    window.LabNum.register(elR, { toValue: function (p) { return Math.pow(10, p); }, toPos: function (v) { return Math.log10(v); }, min: 0.2, max: 5, decimals: 3 });
  }
  function refreshOutputs() {
    $('tempo').textContent = num(S.Tc, 1) + ' °C';
    const sp = S.speed;
    $('speedo').textContent = '×' + num(sp, sp < 1 ? 2 : sp < 10 ? 1 : 0);
    $('rado').textContent = num(DF.r, DF.r < 1 ? 3 : 2) + ' nm';
    $('cLo').textContent = OS.CL <= 0 ? T('0（純水）', '0 (pure water)') : num(OS.CL, 2);
    $('cRo').textContent = OS.CR <= 0 ? T('0（純水）', '0 (pure water)') : num(OS.CR, 2);
    $('pisto').textContent = num(OS.P, 2);
    $('cCo').textContent = CS.C <= 0 ? T('0（清水）', '0 (pure water)') : num(CS.C, 0);
  }
  function diffParamChanged() {
    if (DF.run && !DF.cloud.partition && (Math.abs(DF.run.T - S.Tc) > 1e-9 || Math.abs(DF.run.r - DF.r) > 1e-9)) {
      if (!DF.run.mixed) {
        DF.run.mixed = true;
        setStatus(T('這次擴散途中改了設定：理論線改用 ∫D dt 照樣成立，但要比較 D 請放回隔板重新開始。', 'You changed a setting during this run: the theory line still holds using ∫D dt, but to compare D put the partition back and start again.'));
      }
    }
  }
  elT.addEventListener('input', function () { acted(); S.Tc = val(elT); diffParamChanged(); refreshOutputs(); updateReadouts(); requestDraw(); });
  elT.addEventListener('change', emitState);
  elSp.addEventListener('input', function () { S.speed = val(elSp); refreshOutputs(); });
  elR.addEventListener('input', function () { acted(); DF.r = val(elR); diffParamChanged(); refreshOutputs(); updateReadouts(); requestDraw(); });
  elR.addEventListener('change', emitState);
  document.querySelectorAll('[data-r]').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      const r = +b.getAttribute('data-r');
      if (window.LabNum) window.LabNum.set(elR, r); else elR.value = String(Math.log10(r));
      DF.r = r; diffParamChanged(); refreshOutputs(); updateReadouts(); requestDraw();
    });
  });
  $('trackNext').addEventListener('click', function () { acted(); trackParticle((DF.track[DF.track.length - 1] + 1 + Math.floor(Math.random() * 50)) % DF.cloud.N, true); });
  function trackParticle(i, replace) {
    const at = DF.track.indexOf(i);
    if (at >= 0) { DF.track.splice(at, 1); DF.trails.splice(at, 1); requestDraw(); return; }
    if (replace && DF.track.length) { DF.track.shift(); DF.trails.shift(); }
    if (DF.track.length >= 3) { DF.track.shift(); DF.trails.shift(); }
    DF.track.push(i); DF.trails.push([]);
    requestDraw();
  }
  $('partBtn').addEventListener('click', function () {
    acted();
    const c = DF.cloud;
    if (c.partition) {
      K.removePartition(c);
      DF.run = { T: S.Tc, r: DF.r, D: Dnow(), mixed: false, ts: [], ms: [], th: [], Dfit: NaN, complete: false, t: 0 };
      DF.chimed = false; DF.partAnim = reducedMotion ? 0 : 1;
      DF.stats = K.cloudStats(c);
      DF.trails.forEach(function (t) { t.length = 0; });
      const Sd = sound(); if (Sd) Sd.sweep({ from: 330, to: 660, dur: 0.25, gain: 0.15 });
      setStatus(T('隔板拿掉了：每個粒子還是亂走，但左邊的粒子多，跨到右邊的就多。', 'The partition is gone: each particle still wanders at random, but with more on the left, more of them cross to the right.'));
      if (!S.running) { S.running = true; updatePlay(); }
    } else {
      finishRun();
      K.scatterLeft(c, rand);
      DF.stats = K.cloudStats(c);
      DF.trails.forEach(function (t) { t.length = 0; });
      setStatus(T('放回隔板：粒子重新撒在左半邊。剛才的均方位移留在圖上供比較。', 'Partition back in: the particles are spread over the left half again. The last run stays on the graph for comparison.'));
    }
    updatePartBtn(); updateReadouts(); emitState(); schedule();
  });
  function finishRun() {
    const run = DF.run;
    if (run && run.ts.length > 1) { DF.history.push(run); if (DF.history.length > 12) DF.history.shift(); }
    DF.run = null;
  }
  // ---------- 滲透 ----------
  function osmoRefill(msg) {
    if (OS.st && OS.ts.length > 2) { OS.history.push({ ts: OS.ts, hs: OS.hs }); if (OS.history.length > 6) OS.history.shift(); }
    OS.st = K.osmoCreate({ iL: SOL[OS.solL].i, CL: OS.CL, iR: SOL[OS.solR].i, CR: OS.CR });
    OS.ts = [0]; OS.hs = [0]; OS.eqChimed = false; OS.drip = 0;
    insetReset();
    if (msg) setStatus(msg);
  }
  $('osmoEqBtn').addEventListener('click', function () {
    acted(); OS.showEq = !OS.showEq;
    const b = $('osmoEqBtn');
    b.setAttribute('aria-pressed', String(OS.showEq));
    b.textContent = OS.showEq ? T('平衡預測：開', 'Equilibrium prediction: on') : T('平衡預測：關', 'Equilibrium prediction: off');
    plotCaption(); updateReadouts(); requestDraw();
  });
  function osmoInputs() {
    OS.solL = $('solL').value; OS.solR = $('solR').value;
    OS.CL = val(elCL); OS.CR = val(elCR);
  }
  [elCL, elCR].forEach(function (el) {
    el.addEventListener('input', function () { acted(); osmoInputs(); osmoRefill(); refreshOutputs(); updateReadouts(); requestDraw(); });
    el.addEventListener('change', function () { setStatus(T('換了溶液：管子倒掉重裝，兩邊液面從一樣高開始。', 'New solutions: the tube was refilled and both levels start equal.')); emitState(); });
  });
  ['solL', 'solR'].forEach(function (id) {
    $(id).addEventListener('change', function () { acted(); osmoInputs(); osmoRefill(T('換了溶質：管子倒掉重裝，兩邊液面從一樣高開始。', 'New solute: the tube was refilled and both levels start equal.')); refreshOutputs(); updateReadouts(); requestDraw(); emitState(); });
  });
  elP.addEventListener('input', function () { acted(); OS.P = val(elP); refreshOutputs(); updateReadouts(); requestDraw(); });
  elP.addEventListener('change', emitState);
  $('osmoReset').addEventListener('click', function () { acted(); osmoRefill(T('倒掉重裝：兩邊液面一樣高。剛才的曲線留在圖上。', 'Refilled: both levels equal. The last curve stays on the graph.')); updateReadouts(); requestDraw(); emitState(); schedule(); });
  // ---------- 細胞 ----------
  function freshCells(msg) {
    if (CS.rbc && CS.ts.length > 2) { CS.history.push({ ts: CS.ts, rv: CS.rv, pv: CS.pv }); if (CS.history.length > 4) CS.history.shift(); }
    CS.rbc = K.cellCreate('rbc'); CS.plant = K.cellCreate('plant', S.Tc);
    CS.t = 0; CS.ts = [0]; CS.rv = [CS.rbc.V]; CS.pv = [CS.plant.V];
    if (msg) setStatus(msg);
  }
  function cellInputs() { CS.sol = $('solC').value; CS.C = val(elCC); }
  elCC.addEventListener('input', function () { acted(); cellInputs(); refreshOutputs(); updateReadouts(); requestDraw(); });
  elCC.addEventListener('change', emitState);
  $('solC').addEventListener('change', function () { acted(); cellInputs(); refreshOutputs(); updateReadouts(); requestDraw(); emitState(); });
  function presetCell(pct) {
    acted();
    $('solC').value = 'nacl';
    const Cm = K.molarFromPercent(pct, SOL.nacl.M);
    if (window.LabNum) window.LabNum.set(elCC, Cm); else elCC.value = String(Cm);
    cellInputs(); refreshOutputs(); updateReadouts(); requestDraw(); emitState();
  }
  $('qSaline').addEventListener('click', function () { presetCell(0.9); setStatus(T('0.9% 食鹽水約 308 mOsm/L，和血漿差不多：紅血球大小幾乎不變。', '0.9% saline is about 308 mOsm/L, close to blood plasma: the red cell hardly changes.')); });
  $('qSea').addEventListener('click', function () { presetCell(3.5); setStatus(T('3.5% 食鹽水（約略像海水）比細胞內濃得多：水從兩個細胞流出去。', '3.5% salt water (roughly like seawater) is far stronger than the cells’ insides: water leaves both.')); });
  $('cellReset').addEventListener('click', function () { acted(); freshCells(T('換上新的細胞：紅血球 90 fL，植物細胞剛從清水中取出。', 'Fresh cells: a 90 fL red cell and a plant cell straight from fresh water.')); updateReadouts(); requestDraw(); emitState(); schedule(); });
  // ---------- 共用 ----------
  $('play').addEventListener('click', function () { acted(); S.running = !S.running; updatePlay(); if (!S.running) emitState(); schedule(); });
  $('clear').addEventListener('click', function () {
    if (S.mode === 'diff') { DF.history = []; if (DF.run) { DF.run.ts = []; DF.run.ms = []; DF.run.th = []; } }
    else if (S.mode === 'osmo') { OS.history = []; OS.ts = [OS.st.t]; OS.hs = [OS.st.x * 200]; }
    else { CS.history = []; CS.ts = [CS.t]; CS.rv = [CS.rbc.V]; CS.pv = [CS.plant.V]; }
    setStatus(T('已清除曲線圖的所有紀錄；滑桿設定不變。', 'All records in the graph are cleared; slider settings are kept.'));
    requestDraw();
  });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });
  // ---------- 模式 ----------
  const MODES = { diff: 'mDiff', osmo: 'mOsmo', cell: 'mCell' };
  function setMode(m, user) {
    if (!MODES[m]) return;
    if (user) acted();
    const changed = S.mode !== m;
    S.mode = m;
    $('lab').setAttribute('data-mode', m);
    Object.keys(MODES).forEach(function (k) { $(MODES[k]).setAttribute('aria-pressed', String(k === m)); });
    cv.style.cursor = 'default';
    plotCaption();
    if (view3 && view3.active) view3.setMode(m);
    if (changed) { lastFrame = 0; resizeMain(); }
    if (changed && user) setStatus(modeIntro());
    updateReadouts();
    requestDraw();
    if (user) emitState();
  }
  function modeIntro() {
    if (S.mode === 'diff') return DF.cloud.partition ? T('按「移除隔板」，看粒子怎麼散開。', 'Press “Remove the partition” and watch the particles spread.')
      : T('隔板已經拿掉：每個粒子都在亂走，看下面的均方位移是不是隨時間直線上升。', 'The partition is out: every particle wanders at random. Watch whether the mean square displacement below rises in a straight line.');
    if (S.mode === 'osmo') return T('半透膜只讓水通過：水往滲透濃度高的一邊流，直到液柱的壓力（加上活塞）擋住它。', 'The membrane lets only water through: water moves toward the higher osmolarity until the column pressure (plus the piston) holds it back.');
    return T('兩個細胞泡在同一杯外液裡：改變外液的濃度，看水怎麼進出細胞。', 'Both cells sit in the same solution: change its strength and watch water move in or out.');
  }
  Object.keys(MODES).forEach(function (k) { $(MODES[k]).addEventListener('click', function () { setMode(k, true); }); });

  // ---------- 畫布：點粒子追蹤、拖活塞 ----------
  let pdrag = null;
  function evPos(c, ev) { const r = c.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function hitPiston(p) { return S.mode === 'osmo' && pistonHit && p[0] >= pistonHit.x0 && p[0] <= pistonHit.x1 && p[1] >= pistonHit.y0 && p[1] <= pistonHit.y1; }
  function nearestParticle(p) {
    const L = layoutDiff(mainSize.w), q = [0, 0, 0];
    let best = -1, bd = 14;
    for (let i = 0; i < DF.cloud.N; i++) {
      K.posOf(DF.cloud, i, q);
      const d = Math.hypot(L.bx + q[0] * L.sc - p[0], L.by + q[1] * L.sc - p[1]);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (view3 && view3.active) return;
    const p = evPos(cv, ev);
    if (S.mode === 'osmo' && hitPiston(p)) {
      acted();
      pdrag = { y0: p[1], P0: OS.P };
      cv.setPointerCapture(ev.pointerId);
      cv.style.cursor = 'grabbing';
      ev.preventDefault();
      requestDraw();
    } else if (S.mode === 'diff') {
      const i = nearestParticle(p);
      if (i >= 0) { acted(); trackParticle(i, false); }
    }
  });
  cv.addEventListener('pointermove', function (ev) {
    const p = evPos(cv, ev);
    if (pdrag) {
      OS.P = clamp(Math.round((pdrag.P0 + (p[1] - pdrag.y0) * 0.03) * 100) / 100, 0, 6);
      if (window.LabNum) window.LabNum.set(elP, OS.P); else elP.value = String(OS.P);
      refreshOutputs(); updateReadouts(); requestDraw();
      return;
    }
    const h = hitPiston(p) ? 'piston' : null;
    if (h !== S.hover) { S.hover = h; cv.style.cursor = h ? 'ns-resize' : 'default'; requestDraw(); }
  });
  function endDrag() { if (!pdrag) return; pdrag = null; cv.style.cursor = S.hover ? 'ns-resize' : 'default'; requestDraw(); emitState(); }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('lostpointercapture', endDrag);
  cv.addEventListener('touchstart', function (ev) { const t = ev.touches[0]; if (t && hitPiston(evPos(cv, t))) ev.preventDefault(); }, { passive: false });
  // 鍵盤：依模式操作畫布上的東西
  const kb = window.LabKeys ? window.LabKeys.attach(cv, {
    label: T('擴散與滲透畫布。擴散時左右方向鍵換追蹤的粒子；滲透時上下方向鍵推活塞；細胞時左右方向鍵改變外液濃度。Shift 加方向鍵移動得更多。',
      'Diffusion and osmosis canvas. Diffusion: left and right arrows change the tracked particle. Osmosis: up and down arrows move the piston. Cells: left and right arrows change the solution. Shift for bigger steps.'),
    items: [{
      name: function () { return S.mode === 'diff' ? T('追蹤的粒子', 'Tracked particle') : S.mode === 'osmo' ? T('活塞', 'Piston') : T('外液濃度', 'Solution strength'); },
      move: function (dx, dy, big) {
        acted();
        if (S.mode === 'diff') { const d = dx || dy; if (!d) return false; trackParticle(((DF.track[DF.track.length - 1] || 0) + d * (big ? 10 : 1) + DF.cloud.N) % DF.cloud.N, true); return true; }
        // 滲透：往下（或往右）＝把活塞往下壓
        if (S.mode === 'osmo') { const d = -dy || dx; if (!d) return false; OS.P = clamp(Math.round((OS.P + d * (big ? 0.5 : 0.05)) * 100) / 100, 0, 6); if (window.LabNum) window.LabNum.set(elP, OS.P); refreshOutputs(); updateReadouts(); return true; }
        const d = dx || dy; if (!d) return false;
        CS.C = clamp(CS.C + d * (big ? 10 : 1), 0, 600); if (window.LabNum) window.LabNum.set(elCC, CS.C); refreshOutputs(); updateReadouts(); return true;
      },
      describe: function () {
        if (S.mode === 'diff') return T('追蹤第 ', 'Tracking particle ') + ((DF.track[DF.track.length - 1] || 0) + 1) + T(' 號粒子', '');
        if (S.mode === 'osmo') return T('活塞壓力 ', 'Piston pressure ') + num(OS.P, 2) + ' kPa' + T('，液面差 ', ', level difference ') + signed(OS.st.x * 200, 1) + ' cm';
        return T('外液 ', 'Solution ') + num(CS.C, 0) + ' mmol/L' + T('，紅血球 ', ', red cell ') + (CS.rbc.lysed ? T('已溶血', 'burst') : num(CS.rbc.V, 0) + ' fL');
      }
    }],
    onChange: function () { requestDraw(); }
  }) : null;
  cv.addEventListener('lab:keymove', function () { emitState(); });

  // =====================================================================
  // 迴圈
  // =====================================================================
  let raf = 0, lastFrame = 0, lastRO = 0;
  function requestDraw() { schedule(); }
  function schedule() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop(now) {
    raf = 0;
    const dtr = lastFrame ? Math.min(1 / 30, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    if (S.running && !document.hidden && dtr > 0) advance(dtr);
    drawMain();
    drawPlot();
    if (now - lastRO > 120) { lastRO = now; updateReadouts(); }
    if (S.running && now - lastEmit > 250) emitState();
    const lysing = S.mode === 'cell' && CS.rbc.lysed && performance.now() - CS.lysedAt < 3200;
    if (S.running || DF.partAnim > 0 || lysing || (view3 && view3.active && view3.busy())) raf = requestAnimationFrame(loop);
    else lastFrame = 0;
  }

  // =====================================================================
  // 3D 檢視：切換到 3D 時才載入 js/diffusion-osmosis-3d.js 與 three.js（以 import() 動態載入）；切回 2D 時整個釋放。
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    K: K, T: T, D: D, S: S, DF: DF, OS: OS, CS: CS, colors: function () { return C; }, reducedMotion: reducedMotion,
    num: num, signed: signed, fmtTime: fmtTime, fmtMin: fmtMin, fmtP: fmtP, shortSol: shortSol, osmOut: osmOut, Dnow: Dnow,
    rbcState: rbcState, plantState: plantState,
    request: function () { schedule(); },
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
      if (window.DiffOsmo3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.DiffOsmo3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/diffusion-osmosis-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.DiffOsmo3D) throw new Error('diffusion-osmosis-3d.js did not load');
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
        view3 = window.DiffOsmo3D.create(lib, host3, bridge);
        view3.setMode(S.mode);
        stage.classList.add('is3d');
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        requestAnimationFrame(function () { if (view3) { view3.onShow(); requestDraw(); } });
        requestDraw();
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
      resizeMain();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resizeMain();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  S.Tc = val(elT); S.speed = val(elSp); DF.r = val(elR);
  osmoInputs(); osmoRefill();
  cellInputs(); freshCells();
  refreshOutputs();
  updatePlay(); updateSoundButton(); updatePartBtn(); plotCaption();
  function themeChanged() {
    readColors();
    if (view3 && view3.active) view3.onTheme();
    updateReadouts();
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    const watch = function (el, fn) { let lw = 0; new ResizeObserver(function () { if (el.clientWidth !== lw) { lw = el.clientWidth; fn(); } }).observe(el); };
    watch(cv, resizeMain); watch(pcv, resizePlot);
  } else window.addEventListener('resize', function () { resizeMain(); resizePlot(); });
  resizeMain(); resizePlot();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastFrame = 0; schedule(); } });
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：按「播放」讓模擬開始。', 'Reduced motion is on: press “Play” to start the simulation.'));
  updateReadouts();
  requestDraw();
  // 測試用（Playwright）：讀取狀態
  window.__do = { S: S, DF: DF, OS: OS, CS: CS, K: K, missionData: missionData, pistonHit: function () { return pistonHit; } };
})();
