/* equipotential.js — 「等位線與電場（導電紙實驗）」的畫面與互動（物理計算在 equipotential-core.js） */
(function () {
  'use strict';
  const EC = window.EquipotentialCore;
  const LD = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FF = LD.FONT;
  const SW = EC.SHEET_W, SH = EC.SHEET_H;
  const NUDGE = 0.05;          // 方向鍵每按一次移動的距離（cm）
  const NUDGE_BIG = 0.5;       // Shift＋方向鍵（cm）
  const NUDGE_FINE = 0.01;     // Alt＋方向鍵（cm）
  const FINE = 0.2;            // 精細拖曳的比例
  const MARK_SIGMA = 0.05;     // 含誤差：描點到方格紙上的誤差（cm）
  const OFFSET_MAX = 0.015;    // 含誤差：電表零點偏差上限（V）
  const JITTER_V = 0.008;      // 含誤差：三用電表最後一位的跳動（V）
  const JITTER_I = 0.15e-6;    // 含誤差：檢流計指針的抖動（A）
  const SIGMA_AMP = 0.04;      // 含誤差：導電紙導電度的起伏（±4 %）
  const reduced = LD.reducedMotion();

  // ---------------------------------------------------------------------
  // 狀態
  // ---------------------------------------------------------------------
  const state = {
    type: 'circles', d: 14, a: 0.75, L: 20, V0: 6, power: false,
    meter: 'dmm', noise: false, seed: 1,
    n2: { x: 18.5, y: 13.5 }, n1: { x: 11.5, y: 5.5 }, clip: false, sel: 'n2', fine: false,
    sheets: {},                // 設定代號 → { recs: [], est: null, rev }
    drawLines: false, drawField: false, showTheory: false, showStream: false, showHeat: false,
    n1Touched: false, estimated: false,
    offset: 0, jitter: 0, jitterI: 0,
    needle: 0                  // 檢流計指針（畫面用，-1…1）
  };
  let lastStatus = '';
  let kb = null;               // 鍵盤操作（js/keys.js）
  const KB_IDS = ['n2', 'n1'];

  // ---------------------------------------------------------------------
  // 數值解（1 V 的解，依電源電壓縮放；同一設定只解一次）
  // ---------------------------------------------------------------------
  const solCache = new Map();
  function cfgOf(V0) {
    const c = { type: state.type, d: state.d, a: state.a, L: state.L, V0: V0 == null ? 1 : V0 };
    if (state.noise) c.sigma = { seed: state.seed, amp: SIGMA_AMP };
    return c;
  }
  function solKey(h) { return [state.type, state.d, state.a, state.L, state.noise ? state.seed : 0, h].join('|'); }
  let preview = false;   // 拖曳滑桿時先用較粗的網格
  function getSol() {
    const h = preview ? 0.25 : 0.125;
    const k = solKey(h);
    let s = solCache.get(k);
    if (!s) {
      s = EC.solve(cfgOf(1), { h: h });
      s.key = k;
      s.derived = {};
      if (solCache.size > 10) solCache.delete(solCache.keys().next().value);
      solCache.set(k, s);
    }
    return s;
  }
  function V0eff() { return state.power ? state.V0 : 0; }
  function potAt(x, y) { return V0eff() * EC.potentialAt(getSol(), x, y); }
  function fieldAt(x, y) { const f = EC.fieldAt(getSol(), x, y), k = V0eff(); return { ex: f.ex * k, ey: f.ey * k, E: f.E * k }; }
  function els() { return getSol().els; }
  function negEl() { return els().find(function (e) { return e.sign < 0; }); }
  function posEl() { return els().find(function (e) { return e.sign > 0; }); }
  function elCenter(e) { return e.kind === 'circle' ? { x: e.x, y: e.y } : { x: (e.x0 + e.x1) / 2, y: (e.y0 + e.y1) / 2 }; }
  /** 電極輪廓（封閉折線），當作等位線使用 */
  function elPath(e) {
    const p = [];
    if (e.kind === 'circle') {
      for (let q = 0; q <= 96; q++) { const t = 2 * Math.PI * q / 96; p.push([e.x + e.r * Math.cos(t), e.y + e.r * Math.sin(t)]); }
      return p;
    }
    const c = [[e.x0, e.y0], [e.x1, e.y0], [e.x1, e.y1], [e.x0, e.y1], [e.x0, e.y0]];
    for (let i = 1; i < c.length; i++) {
      const n = 24;
      for (let q = (i === 1 ? 0 : 1); q <= n; q++) p.push([c[i - 1][0] + (c[i][0] - c[i - 1][0]) * q / n, c[i - 1][1] + (c[i][1] - c[i - 1][1]) * q / n]);
    }
    return p;
  }

  // ---------------------------------------------------------------------
  // 方格紙（每一種設定一張）與記錄
  // ---------------------------------------------------------------------
  function sheetKey() { return [state.type, state.d, state.a, state.L, state.V0, state.noise ? state.seed : 0].join('|'); }
  function sheet() {
    const k = sheetKey();
    if (!state.sheets[k]) state.sheets[k] = { recs: [], est: null, rev: 0 };
    return state.sheets[k];
  }
  let anaCache = { key: '', groups: [], curves: [], sketch: null };
  /** 分組、排序、平滑後的等位線（依方格紙修訂版快取） */
  function analysis() {
    const sh = sheet();
    const key = sheetKey() + '#' + sh.rev + '#' + LD.ver;
    if (anaCache.key === key) return anaCache;
    const recs = sh.recs;
    const groups = EC.groupRecords(recs.map(function (r) { return { n1x: r.n1x, n1y: r.n1y, reading: r.reading, V1: r.V1 }; }));
    groups.forEach(function (g, n) {
      g.name = 'L' + (n + 1);
      g.pts = g.idx.map(function (i) { return [recs[i].x, recs[i].y]; });
      g.trueV = g.idx.map(function (i) { return recs[i].V2; });
      let span = 0;
      for (let i = 0; i < g.pts.length; i++) for (let j = i + 1; j < g.pts.length; j++) span = Math.max(span, Math.hypot(g.pts[i][0] - g.pts[j][0], g.pts[i][1] - g.pts[j][1]));
      g.span = span;
      g.vRange = g.trueV.length ? Math.max.apply(null, g.trueV) - Math.min.apply(null, g.trueV) : 0;
      if (g.pts.length >= 3) {
        const o = EC.orderPoints(g.pts);
        g.closed = o.closed;
        g.path = EC.smoothPath(o.pts, o.closed, 10);
      } else if (g.pts.length === 2) {
        g.closed = false; g.path = g.pts.slice();
      } else g.path = null;
    });
    anaCache = { key: key, groups: groups, sketch: null };
    return anaCache;
  }
  /** 依電位由高到低的曲線（同電位只留點數最多的一條），頭尾加上正、負電極 */
  function curvesForSketch(minPts) {
    const A = analysis();
    const list = A.groups.filter(function (g) { return g.path && g.pts.length >= minPts; })
      .sort(function (a, b) { return b.pts.length - a.pts.length; });
    const kept = [];
    list.forEach(function (g) { if (!kept.some(function (k) { return Math.abs(k.V - g.V) < 0.15; })) kept.push(g); });
    kept.sort(function (a, b) { return b.V - a.V; });
    const pe = posEl(), ne = negEl();
    const curves = [{ V: state.V0, path: elPath(pe), isElectrode: true, center: pe.kind === 'circle' ? [pe.x, pe.y] : null }];
    kept.forEach(function (g) { if (g.V < state.V0 - 0.05 && g.V > 0.05) curves.push({ V: g.V, path: g.path, g: g }); });
    curves.push({ V: 0, path: elPath(ne), isElectrode: true, center: ne.kind === 'circle' ? [ne.x, ne.y] : null });
    return curves;
  }
  function sketch() {
    const A = analysis();
    if (A.sketch) return A.sketch;
    const curves = curvesForSketch(3);
    const nMeasured = curves.length - 2;
    const measured = curves.filter(function (c) { return !c.isElectrode; }).map(function (c) { return { V: c.V, path: c.path }; });
    A.sketch = { lines: nMeasured >= 1 ? EC.sketchFieldLines(measured, { els: els(), V0: state.V0, nSeeds: 9 }) : [], nMeasured: nMeasured, curves: curves };
    return A.sketch;
  }

  // ---------------------------------------------------------------------
  // 電表
  // ---------------------------------------------------------------------
  function n1Pos() {
    if (state.clip) { const c = elCenter(negEl()); return { x: c.x, y: c.y }; }
    return state.n1;
  }
  /** 目前的電表讀數：{ dV（真值）, reading（以 V 表示，含誤差與取捨）, text, I（檢流計，A）} */
  function meterNow() {
    const p1 = n1Pos(), p2 = state.n2;
    const V1 = potAt(p1.x, p1.y), V2 = potAt(p2.x, p2.y), dV = V2 - V1;
    if (state.meter === 'dmm') {
      const r = EC.dmmReading(dV, state.noise ? { offset: state.offset, jitter: state.jitter } : null);
      return { V1: V1, V2: V2, dV: dV, reading: r, text: fmtSigned(r, 2) + ' V', unit: 'V' };
    }
    const I = EC.galvCurrent(dV, state.noise ? { jitterI: state.jitterI } : null);
    let uA = Math.round(I * 1e7) / 10;
    if (Math.abs(uA) < 0.05) uA = 0;
    const over = Math.abs(I) > EC.GALV_FS;
    return { V1: V1, V2: V2, dV: dV, I: I, uA: uA, over: over, reading: uA * 1e-6 * EC.GALV_R,
      text: (over ? (I > 0 ? '> +50' : '< −50') : fmtSigned(uA, 1)) + ' μA', unit: 'μA' };
  }
  function fmt(x, d) { return (Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x).toFixed(d); }
  function fmtSigned(x, d) { const s = fmt(x, d); return s.charAt(0) === '-' ? '−' + s.slice(1) : (+s > 0 ? '+' + s : s); }
  function minus(s) { return String(s).replace(/^-/, '−'); }

  // ---------------------------------------------------------------------
  // 色彩
  // ---------------------------------------------------------------------
  function midInk() { return LD.mix(LD.c.text, LD.c['canvas-bg'], 0.3); }
  /** 電位 → 顏色（低：藍、中：中性、高：紅；亮度對稱的發散色階） */
  function potColor(V) {
    const V0 = state.V0 || 1;
    const u = Math.max(0, Math.min(1, V / V0));
    return u < 0.5 ? LD.mix(LD.c.neg, midInk(), u * 2) : LD.mix(midInk(), LD.c.pos, (u - 0.5) * 2);
  }
  function paperColor() { return LD.dark ? LD.mix(LD.c['canvas-bg'], LD.c.text, 0.075) : LD.mix(LD.c['canvas-bg'], LD.c.text, 0.025); }

  // ---------------------------------------------------------------------
  // 版面
  // ---------------------------------------------------------------------
  const cv = $('cv'), ctx = cv.getContext('2d');
  const G = { w: 0, h: 0, s: 10, bx: 0, by: 0, band: 100, dpr: 1 };
  function layout() {
    const w = cv.clientWidth || 600;
    const mL = 24, mR = 10;
    const s = Math.min(25, (w - mL - mR) / SW);
    const bw = s * SW, bh = s * SH;
    const band = Math.round(Math.max(96, Math.min(150, bh * 0.32)));
    const h = Math.round(band + 10 + bh + 24);
    G.w = w; G.h = h; G.s = s; G.band = band;
    G.bx = Math.round(mL + (w - mL - mR - bw) / 2); G.by = band + 10;
    G.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (cv.style.height !== h + 'px') cv.style.height = h + 'px';
    const W = Math.round(w * G.dpr), H = Math.round(h * G.dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  }
  function X(x) { return G.bx + x * G.s; }
  function Y(y) { return G.by + (SH - y) * G.s; }
  function wx(px) { return (px - G.bx) / G.s; }
  function wy(py) { return SH - (py - G.by) / G.s; }

  // ---------------------------------------------------------------------
  // 靜態圖層（背景、紙、方格、色階、計算的等位線與電流線、電極）
  // ---------------------------------------------------------------------
  const stat = document.createElement('canvas');
  let statKey = '';
  function derived(name, fn) {
    const s = getSol();
    if (!(name in s.derived)) s.derived[name] = fn(s);
    return s.derived[name];
  }
  function heatImage() {
    return derived('heat', function (s) {
      const c = document.createElement('canvas');
      c.width = s.nx; c.height = s.ny;
      return { cv: c, ver: -1 };
    });
  }
  function drawStatic() {
    const key = [G.w, G.h, G.dpr, LD.ver, getSol().key, V0eff(), state.showTheory, state.showStream, state.showHeat, state.V0].join('|');
    if (key === statKey) return;
    statKey = key;
    stat.width = cv.width; stat.height = cv.height;
    const g = stat.getContext('2d');
    g.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    LD.backdrop(g, G.w, G.h);
    const x0 = X(0), y0 = Y(SH), x1 = X(SW), y1 = Y(0);
    // 實驗桌上的紙：柔和投影＋紙面
    g.save();
    g.shadowColor = LD.dark ? 'rgba(0,0,0,0.55)' : LD.alpha(LD.c.text, 0.22);
    g.shadowBlur = 12; g.shadowOffsetY = 3;
    g.fillStyle = paperColor();
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.restore();
    // 電位色階
    if (state.showHeat && V0eff() > 0) {
      const s = getSol(), hi = heatImage();
      if (hi.ver !== LD.ver) {
        const c2 = hi.cv.getContext('2d'), img = c2.createImageData(s.nx, s.ny);
        const neg = LD.rgb(LD.c.neg), pos = LD.rgb(LD.c.pos), mid = LD.rgb(midInk());
        for (let j = 0; j < s.ny; j++) for (let i = 0; i < s.nx; i++) {
          const u = s.V[j * s.nx + i];
          const a = u < 0.5 ? neg : mid, b = u < 0.5 ? mid : pos, t = u < 0.5 ? u * 2 : (u - 0.5) * 2;
          const o = ((s.ny - 1 - j) * s.nx + i) * 4;
          img.data[o] = a[0] + (b[0] - a[0]) * t; img.data[o + 1] = a[1] + (b[1] - a[1]) * t; img.data[o + 2] = a[2] + (b[2] - a[2]) * t;
          img.data[o + 3] = 255;
        }
        c2.putImageData(img, 0, 0);
        hi.ver = LD.ver;
      }
      g.save();
      g.globalAlpha = LD.dark ? 0.38 : 0.3;
      g.imageSmoothingEnabled = true;
      g.drawImage(hi.cv, x0, y0, x1 - x0, y1 - y0);
      g.restore();
    }
    // 方格：1 cm 主格、0.5 cm 次格；每 5 cm 一條較深的線
    LD.grid(g, x0, y0, x1, y1, G.s, G.s >= 14 ? G.s / 5 : G.s / 2, x0, y1);
    g.beginPath();
    for (let x = 0; x <= SW; x += 5) { const px = Math.round(X(x) * G.dpr) / G.dpr + 0.5 / G.dpr; g.moveTo(px, y0); g.lineTo(px, y1); }
    for (let y = 0; y <= SH; y += 5) { const py = Math.round(Y(y) * G.dpr) / G.dpr + 0.5 / G.dpr; g.moveTo(x0, py); g.lineTo(x1, py); }
    g.strokeStyle = LD.alpha(LD.c.text, LD.dark ? 0.17 : 0.15);
    g.lineWidth = 1 / G.dpr;
    g.stroke();
    g.strokeStyle = LD.alpha(LD.c.text, 0.3);
    g.lineWidth = 1;
    g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
    // 刻度數字（cm）
    g.font = '10.5px ' + FF;
    g.fillStyle = LD.c.muted;
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (let x = 0; x <= SW; x += 5) g.fillText(String(x), X(x), y1 + 4);
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let y = 5; y <= SH; y += 5) g.fillText(String(y), x0 - 4, Y(y));   // 0 只標在 x 軸
    g.textAlign = 'right'; g.textBaseline = 'top';
    g.fillText('cm', x0 - 8, y1 + 4);
    // 計算的電流線（＝電力線）
    if (state.showStream && V0eff() > 0) {
      const lines = derived('stream', function (s) { return EC.streamlines(s, 14); });
      g.save();
      g.setLineDash([6, 4]);
      g.lineCap = 'round'; g.lineJoin = 'round';
      lines.forEach(function (l) {
        g.beginPath();
        l.pts.forEach(function (p, i) { if (i) g.lineTo(X(p[0]), Y(p[1])); else g.moveTo(X(p[0]), Y(p[1])); });
        g.strokeStyle = LD.alpha(LD.c['canvas-bg'], 0.7); g.lineWidth = 3.2; g.stroke();
        g.strokeStyle = LD.alpha(LD.c.accent, 0.85); g.lineWidth = 1.4; g.stroke();
      });
      g.restore();
      lines.forEach(function (l) { arrowOnPath(g, l.pts, 0.5, LD.c.accent, 6); });
    }
    // 計算的等位線（每 1 V）
    if (state.showTheory && V0eff() > 0) {
      const V0 = state.V0, levels = [];
      for (let v = 1; v < V0 - 1e-9; v += 1) levels.push(v);
      const cs = derived('contours' + V0, function (s) { return levels.map(function (v) { return { v: v, lines: EC.contour(s, v / V0) }; }); });
      g.save();
      g.setLineDash([2, 4]);
      g.lineCap = 'round';
      cs.forEach(function (c) {
        c.lines.forEach(function (l) {
          g.beginPath();
          l.pts.forEach(function (p, i) { if (i) g.lineTo(X(p[0]), Y(p[1])); else g.moveTo(X(p[0]), Y(p[1])); });
          g.strokeStyle = LD.c.equi; g.lineWidth = 1.6; g.stroke();
        });
      });
      g.restore();
      // 標籤：每一級放在最長那條線上靠上方的一點
      cs.forEach(function (c) {
        let best = null;
        c.lines.forEach(function (l) { if (!best || l.pts.length > best.pts.length) best = l; });
        if (!best) return;
        let p = best.pts[0];
        best.pts.forEach(function (q) { if (q[1] > p[1]) p = q; });
        const py = Math.max(Y(p[1]) + 13, Y(SH) + 15);
        LD.pill(g, c.v + ' V', X(p[0]), py, LD.c.equi, 'center', '600 10.5px ' + FF);
      });
    }
    // 電極（銀色、外圈標正負）
    els().forEach(function (e) { drawElectrode(g, e); });
  }
  function drawElectrode(g, e) {
    const silver = LD.mix(LD.c.surface, LD.c.text, LD.dark ? 0.45 : 0.28);
    const rim = e.sign > 0 ? LD.c.pos : LD.c.neg;
    if (e.kind === 'circle') {
      const cx = X(e.x), cy = Y(e.y), r = e.r * G.s;
      g.save();
      g.shadowColor = LD.dark ? 'rgba(0,0,0,0.5)' : LD.alpha(LD.c.text, 0.25);
      g.shadowBlur = 5; g.shadowOffsetY = 1.5;
      const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
      gr.addColorStop(0, LD.shade(silver, 0.7));
      gr.addColorStop(0.5, silver);
      gr.addColorStop(1, LD.shade(silver, -0.3));
      g.fillStyle = gr;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.restore();
      g.strokeStyle = rim; g.lineWidth = Math.max(1.5, Math.min(3, r * 0.25));
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      signText(g, e.sign, cx, cy, r);
    } else {
      const x = X(e.x0), y = Y(e.y1), w = (e.x1 - e.x0) * G.s, h = (e.y1 - e.y0) * G.s;
      g.save();
      g.shadowColor = LD.dark ? 'rgba(0,0,0,0.5)' : LD.alpha(LD.c.text, 0.25);
      g.shadowBlur = 5; g.shadowOffsetX = 1;
      const gr = g.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, LD.shade(silver, -0.15));
      gr.addColorStop(0.4, LD.shade(silver, 0.55));
      gr.addColorStop(1, LD.shade(silver, -0.25));
      g.fillStyle = gr;
      g.fillRect(x, y, w, h);
      g.restore();
      g.strokeStyle = rim; g.lineWidth = 1.6;
      g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      // 正負號放在長條旁邊（長條太窄）
      const sx = e.sign > 0 ? x - 9 : x + w + 9;
      const sy = Y((e.y0 + e.y1) / 2);
      signText(g, e.sign, sx, sy, 11);
    }
  }
  function signText(g, sign, x, y, r) {
    const fs = Math.max(11, Math.min(16, r * 1.3));
    LD.haloText(g, sign > 0 ? '+' : '−', x, y + 0.5, sign > 0 ? LD.c.pos : LD.c.neg, 'center', 'middle', '700 ' + fs.toFixed(1) + 'px ' + FF);
  }
  /** 在折線上 frac 的位置畫一個小箭頭 */
  function arrowOnPath(g, pts, frac, color, size) {
    if (pts.length < 3) return;
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc + d >= L * frac && d > 0) {
        const t = (L * frac - acc) / d;
        const px = X(pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0])), py = Y(pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1]));
        const ux = (X(pts[i][0]) - X(pts[i - 1][0])), uy = (Y(pts[i][1]) - Y(pts[i - 1][1])), n = Math.hypot(ux, uy) || 1;
        const ax = ux / n, ay = uy / n;
        g.save();
        g.beginPath();
        g.moveTo(px + ax * size, py + ay * size);
        g.lineTo(px - ax * size * 0.7 - ay * size * 0.62, py - ay * size * 0.7 + ax * size * 0.62);
        g.lineTo(px - ax * size * 0.35, py - ay * size * 0.35);
        g.lineTo(px - ax * size * 0.7 + ay * size * 0.62, py - ay * size * 0.7 - ax * size * 0.62);
        g.closePath();
        g.lineJoin = 'round';
        g.strokeStyle = LD.alpha(LD.c['canvas-bg'], 0.8); g.lineWidth = 2.5; g.stroke();
        g.fillStyle = color; g.fill();
        g.restore();
        return;
      }
      acc += d;
    }
  }

  // ---------------------------------------------------------------------
  // 動態圖層
  // ---------------------------------------------------------------------
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; draw(); }); }
  function draw() {
    if (stage.classList.contains('is3d')) { if (view3) view3.update(); return; }
    layout();
    drawStatic();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(stat, 0, 0);
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    const A = analysis();
    // 學生畫的電力線（在等位線下面）
    if (state.drawField) {
      const sk = sketch();
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      sk.lines.forEach(function (l) {
        ctx.beginPath();
        l.forEach(function (p, i) { if (i) ctx.lineTo(X(p[0]), Y(p[1])); else ctx.moveTo(X(p[0]), Y(p[1])); });
        ctx.strokeStyle = LD.alpha(LD.c['canvas-bg'], 0.75); ctx.lineWidth = 4; ctx.stroke();
        ctx.strokeStyle = LD.c.field; ctx.lineWidth = 1.7; ctx.stroke();
      });
      ctx.restore();
      sk.lines.forEach(function (l) { arrowOnPath(ctx, l, 0.27, LD.c.field, 6.5); arrowOnPath(ctx, l, 0.73, LD.c.field, 6.5); });
    }
    // 量到的等位線
    if (state.drawLines) {
      A.groups.forEach(function (g) {
        if (!g.path || g.pts.length < 2) return;
        const col = potColor(g.V);
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        g.path.forEach(function (p, i) { if (i) ctx.lineTo(X(p[0]), Y(p[1])); else ctx.moveTo(X(p[0]), Y(p[1])); });
        ctx.strokeStyle = LD.alpha(LD.c['canvas-bg'], 0.8); ctx.lineWidth = 5; ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.stroke();
        ctx.restore();
      });
    }
    // 記錄點與線的名稱
    const sh = sheet();
    const placed = [];   // 已放好的標籤框（避免互相重疊）
    A.groups.forEach(function (g) {
      const col = potColor(g.V);
      g.idx.forEach(function (i) {
        const r = sh.recs[i], px = X(r.x), py = Y(r.y), k = 4;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(px - k, py - k); ctx.lineTo(px + k, py + k); ctx.moveTo(px + k, py - k); ctx.lineTo(px - k, py + k);
        ctx.strokeStyle = LD.alpha(LD.c['canvas-bg'], 0.85); ctx.lineWidth = 4.5; ctx.stroke();
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
        if (i === sh.recs.length - 1) { ctx.strokeStyle = LD.alpha(col, 0.6); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(px, py, 7.5, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
      });
      if (g.pts.length >= 2 || state.drawLines) {
        // 線名＋電位（畫面窄時只寫線名），先試最上方那一點的上方，擋到別的標籤就換位置
        let top = g.pts[0], bot = g.pts[0];
        g.pts.forEach(function (p) { if (p[1] > top[1]) top = p; if (p[1] < bot[1]) bot = p; });
        const text = G.s < 16 ? g.name : g.name + ' ' + fmt(g.V, 2) + ' V';
        placeLabel(placed, text, col, [[X(top[0]), Y(top[1]) - 8], [X(bot[0]), Y(bot[1]) + 23], [X(top[0]), Y(top[1]) - 27], [X(bot[0]), Y(bot[1]) + 42]]);
      }
    });
    // 電場估算
    drawWires();
    drawProbe('n1');
    drawProbe('n2');
    drawKeyFocus();
    if (sh.est) drawEstimate(sh.est);   // 估算結果畫在探針上面，不被握把擋住
    drawBand();
    if (!state.power) {
      LD.pill(ctx, T('電源未接通', 'Supply off'), X(SW / 2), Y(SH) + 22, LD.c.muted, 'center', '600 12px ' + FF);
    }
  }
  /** 依序試候選位置，放在第一個不與其他標籤重疊的地方（都重疊就放第一個） */
  function placeLabel(placed, text, col, cands) {
    const font = '600 10.5px ' + FF;
    ctx.font = font;
    const w = ctx.measureText(text).width + 12, hh = 17;
    const boxes = cands.map(function (c) {
      const x = Math.min(Math.max(c[0], X(0) + w / 2 + 1), X(SW) - w / 2 - 1);
      const y = Math.min(Math.max(c[1], Y(SH) + hh + 2), Y(0) - 2);
      return { x0: x - w / 2 - 2, x1: x + w / 2 + 2, y0: y - hh - 1, y1: y + 1, x: x, y: y };
    });
    const free = function (b) { return !placed.some(function (q) { return q.x0 < b.x1 && b.x0 < q.x1 && q.y0 < b.y1 && b.y0 < q.y1; }); };
    const pick = boxes.find(free) || boxes[0];
    placed.push(pick);
    LD.pill(ctx, text, pick.x, pick.y, col, 'center', font);
  }
  function drawEstimate(e) {
    const ax = X(e.a[0]), ay = Y(e.a[1]), bx = X(e.b[0]), by = Y(e.b[1]);
    const col = LD.c.probe;
    ctx.save();
    ctx.lineCap = 'round';
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L * 5, ny = dx / L * 5;
    ctx.beginPath();
    ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    ctx.moveTo(ax - nx, ay - ny); ctx.lineTo(ax + nx, ay + ny);
    ctx.moveTo(bx - nx, by - ny); ctx.lineTo(bx + nx, by + ny);
    ctx.strokeStyle = LD.alpha(LD.c['canvas-bg'], 0.85); ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const txt = 'Δd ' + e.dd.toFixed(2) + ' cm ・ E ≈ ' + e.E.toFixed(3) + ' V/cm';
    ctx.font = '600 11px ' + FF;
    const w = ctx.measureText(txt).width + 12;
    const px = Math.min(Math.max(mx, X(0) + w / 2 + 2), X(SW) - w / 2 - 2);
    // 標籤放在線段下方（紅探針的握把朝右上），太靠近紙的下緣時改放上方
    const py = my + 40 > Y(0) - 2 ? my - 12 : my + 40;
    LD.pill(ctx, txt, px, py, col, 'center', '600 11px ' + FF);
  }

  // 探針的畫法：針尖在 (x, y)，握把往右上（N2）或左上（N1）斜出去
  function probeGeom(id) {
    const p = id === 'n1' ? n1Pos() : state.n2;
    const tx = X(p.x), ty = Y(p.y);
    const ang = id === 'n1' ? -2.2 : -0.95;
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const Lh = Math.max(26, Math.min(40, G.s * 1.6));
    return { tx: tx, ty: ty, ux: ux, uy: uy, hx: tx + ux * (Lh + 8), hy: ty + uy * (Lh + 8), L: Lh };
  }
  let hover = null;
  function drawProbe(id) {
    const g = probeGeom(id);
    const col = id === 'n2' ? LD.c.pos : (LD.dark ? LD.mix(LD.c.field, LD.c.muted, 0.4) : LD.c.field);
    const sel = state.sel === id, hov = hover === id;
    // 接觸點的光暈
    ctx.save();
    if (sel || hov) {
      const rg = ctx.createRadialGradient(g.tx, g.ty, 0, g.tx, g.ty, 15);
      rg.addColorStop(0, LD.alpha(col, sel ? 0.35 : 0.22));
      rg.addColorStop(1, LD.alpha(col, 0));
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(g.tx, g.ty, 15, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // 針（金屬）
    const s1x = g.tx + g.ux * 2, s1y = g.ty + g.uy * 2, s2x = g.tx + g.ux * 9, s2y = g.ty + g.uy * 9;
    LD.tube(ctx, function (c) { c.moveTo(s1x, s1y); c.lineTo(s2x, s2y); }, LD.mix(LD.c.surface, LD.c.text, 0.4), 2.6);
    // 握把（下方投影＋管狀）
    const e1x = g.tx + g.ux * 9, e1y = g.ty + g.uy * 9, e2x = g.tx + g.ux * (g.L + 8), e2y = g.ty + g.uy * (g.L + 8);
    ctx.save();
    ctx.strokeStyle = LD.shadowInk(LD.dark ? 0.45 : 0.18);
    ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(e1x + 3, e1y + 5); ctx.lineTo(e2x + 3, e2y + 5); ctx.stroke();
    ctx.restore();
    LD.tube(ctx, function (c) { c.moveTo(e1x, e1y); c.lineTo(e2x, e2y); }, col, hov || sel ? 8.5 : 7.5);
    // 針尖
    ctx.fillStyle = LD.c.text;
    ctx.beginPath(); ctx.arc(g.tx, g.ty, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = LD.alpha(col, 0.9); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(g.tx, g.ty, 4.2, 0, Math.PI * 2); ctx.stroke();
    // 名稱 N1／N2（下標用小字自己畫）
    const lx = g.tx - g.ux * 14 + (id === 'n1' ? -4 : 4), ly = g.ty - g.uy * 14;
    LD.vecLabel(ctx, 'N', id === 'n1' ? '1' : '2', lx, ly, col);
  }
  function terminalPos(which) {
    const b = bandBoxes();
    if (which === 'sup+') return { x: b.sup.x + b.sup.w * 0.62, y: b.sup.y + b.sup.h - 9 };
    if (which === 'sup-') return { x: b.sup.x + b.sup.w * 0.84, y: b.sup.y + b.sup.h - 9 };
    if (which === 'com') return { x: b.met.x + b.met.w * 0.18, y: b.met.y + b.met.h - 9 };
    return { x: b.met.x + b.met.w * 0.4, y: b.met.y + b.met.h - 9 };
  }
  function elContact(e) {
    if (e.kind === 'circle') return { x: X(e.x), y: Y(e.y) };
    return { x: X((e.x0 + e.x1) / 2), y: Y(e.y1) + 3 };
  }
  /** 導線：從 (x0, y0) 沿方向 (u0x, u0y) 出發，沿方向 (u1x, u1y) 到達 (x1, y1)（柔軟下垂的三次曲線） */
  function wire(x0, y0, u0x, u0y, x1, y1, u1x, u1y, color, alpha, width) {
    const L = Math.hypot(x1 - x0, y1 - y0), k = Math.max(24, L * 0.42);
    ctx.save();
    ctx.globalAlpha = alpha;
    LD.tube(ctx, function (c) { c.moveTo(x0, y0); c.bezierCurveTo(x0 + u0x * k, y0 + u0y * k, x1 - u1x * k, y1 - u1y * k, x1, y1); }, color, width);
    ctx.restore();
  }
  /** 電源 → 電極：先沿著儀器與紙之間的空隙走到電極正上方，再垂直放下來接到電極（不在紙上斜斜穿過） */
  function supplyWire(t, c, color) {
    const ay = Y(SH) - 3;
    ctx.save();
    ctx.globalAlpha = 0.8;
    LD.tube(ctx, function (g) {
      g.moveTo(t.x, t.y);
      g.bezierCurveTo(t.x, ay, t.x + (c.x - t.x) * 0.15, ay, (t.x + c.x) / 2, ay);
      g.bezierCurveTo(c.x - (c.x - t.x) * 0.15, ay, c.x, ay, c.x, ay + 8);
      g.lineTo(c.x, c.y);
    }, color, 3);
    ctx.restore();
  }
  function wireInk() { return LD.dark ? LD.mix(LD.c.field, LD.c.muted, 0.5) : LD.mix(LD.c.field, LD.c.text, 0.3); }
  function drawWires() {
    const pe = posEl(), ne = negEl();
    const sp = terminalPos('sup+'), sn = terminalPos('sup-');
    const cp = elContact(pe), cn = elContact(ne);
    const blk = wireInk();
    // 電源 → 電極：從端子往下，由上方接到電極
    supplyWire(sp, cp, LD.c.pos);
    supplyWire(sn, cn, blk);
    [cp, cn].forEach(function (c, i) { LD.ball(ctx, c.x, c.y, 3.6, i ? blk : LD.c.pos, { glow: 0 }); });
    // 探針 → 電表：沿握把方向出去，再往上接到端子
    const g1 = probeGeom('n1'), g2 = probeGeom('n2');
    const tc = terminalPos('com'), tv = terminalPos('v');
    wire(g1.hx, g1.hy, g1.ux, g1.uy, tc.x, tc.y, 0, -1, blk, 0.62, 2.6);
    wire(g2.hx, g2.hy, g2.ux, g2.uy, tv.x, tv.y, 0, -1, LD.c.pos, 0.62, 2.6);
  }

  // ---------------------------------------------------------------------
  // 上方的儀器：電源供應器與電表
  // ---------------------------------------------------------------------
  function bandBoxes() {
    const bw = Math.min(200, Math.max(120, G.w * 0.36)), bh = G.band - 14;
    return { sup: { x: 8, y: 6, w: bw, h: bh }, met: { x: G.w - 8 - bw, y: 6, w: bw, h: bh } };
  }
  function lcd(x, y, w, h, text, unit, on) {
    const bg = LD.dark ? LD.shade(LD.c['canvas-bg'], -0.45) : LD.mix(LD.c.text, '#000000', 0.25);
    LD.roundRect(ctx, x, y, w, h, 4);
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = LD.alpha(LD.c.text, 0.25); ctx.lineWidth = 1; ctx.stroke();
    if (!on) return;
    const digit = LD.shade(LD.c.probe, LD.dark ? 0.25 : 0.45);
    const fs = Math.max(12, Math.min(22, h * 0.62));
    ctx.save();
    ctx.shadowColor = LD.alpha(digit, 0.6); ctx.shadowBlur = 6;
    ctx.fillStyle = digit;
    ctx.font = '700 ' + fs.toFixed(1) + 'px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const uw = unit ? Math.max(14, fs * 0.9) : 0;
    ctx.fillText(text, x + w - 6 - uw, y + h / 2 + 1);
    if (unit) { ctx.font = '600 ' + (fs * 0.55).toFixed(1) + 'px ' + FF; ctx.textAlign = 'left'; ctx.fillText(unit, x + w - uw - 2, y + h / 2 + 2); }
    ctx.restore();
  }
  function post(x, y, color, label) {
    LD.ball(ctx, x, y, 5, color, { glow: 0 });
    if (label) LD.haloText(ctx, label, x, y - 10, LD.c.muted, 'center', 'alphabetic', '600 9.5px ' + FF);
  }
  function drawBand() {
    const b = bandBoxes();
    const body = LD.mix(LD.c.surface, LD.c.text, LD.dark ? 0.12 : 0.08);
    const blk = LD.dark ? LD.mix(LD.c.field, LD.c.muted, 0.5) : LD.mix(LD.c.field, LD.c.text, 0.3);
    // 電源供應器
    const s = b.sup;
    LD.block(ctx, s.x, s.y, s.w, s.h, body, { r: 7 });
    LD.haloText(ctx, T('直流電源', 'DC supply'), s.x + 8, s.y + 14, LD.c.muted, 'left', 'alphabetic', '600 10.5px ' + FF);
    const on = state.power;
    // 電源指示燈
    const led = on ? LD.c.probe : LD.mix(LD.c.muted, LD.c.surface, 0.4);
    if (on) { const rg = ctx.createRadialGradient(s.x + s.w - 12, s.y + 11, 0, s.x + s.w - 12, s.y + 11, 9); rg.addColorStop(0, LD.alpha(led, 0.55)); rg.addColorStop(1, LD.alpha(led, 0)); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(s.x + s.w - 12, s.y + 11, 9, 0, Math.PI * 2); ctx.fill(); }
    LD.ball(ctx, s.x + s.w - 12, s.y + 11, 3.5, led, { glow: 0, shadow: false });
    const lh = Math.max(20, Math.min(32, s.h * 0.34));
    lcd(s.x + 8, s.y + 20, s.w - 16, lh, state.V0.toFixed(1), 'V', on);
    if (on && s.h > 100) {
      const I = EC.currentAcross(getSol()) * state.V0 * 1000;
      LD.haloText(ctx, 'I = ' + I.toFixed(2) + ' mA', s.x + 8, s.y + 20 + lh + 13, LD.c.muted, 'left', 'alphabetic', '600 10.5px ' + FF);
    }
    const tp = terminalPos('sup+'), tn = terminalPos('sup-');
    post(tp.x, tp.y, LD.c.pos, '+');
    post(tn.x, tn.y, blk, '−');
    // 電表
    const m = b.met;
    const mBody = state.meter === 'dmm' ? LD.mix(LD.c.equi, LD.c.surface, LD.dark ? 0.55 : 0.45) : body;
    LD.block(ctx, m.x, m.y, m.w, m.h, mBody, { r: 7 });
    const mn = meterNow();
    if (state.meter === 'dmm') {
      LD.haloText(ctx, T('三用電表 DCV', 'Multimeter DCV'), m.x + 8, m.y + 14, LD.c.text, 'left', 'alphabetic', '600 10.5px ' + FF);
      const shown = EC.dmmReading(mn.dV, state.noise ? { offset: state.offset, jitter: state.jitter } : null);
      lcd(m.x + 8, m.y + 20, m.w - 16, lh, fmtSigned(shown, 2).replace('+', ''), 'V', true);
    } else {
      LD.haloText(ctx, T('檢流計 μA', 'Galvanometer μA'), m.x + 8, m.y + 14, LD.c.text, 'left', 'alphabetic', '600 10.5px ' + FF);
      drawGalv(m.x + 8, m.y + 18, m.w - 16, m.h - 40);
    }
    const tc = terminalPos('com'), tv = terminalPos('v');
    post(tc.x, tc.y, blk, 'COM');
    post(tv.x, tv.y, LD.c.pos, state.meter === 'dmm' ? 'V' : '+');
    // 中間的說明
    const midL = s.x + s.w + 8, midR = m.x - 8;
    if (midR - midL > 70) {
      const name = state.type === 'circles' ? T('兩圓形電極', 'Two circles') : state.type === 'bars' ? T('平行長條電極', 'Parallel bars') : T('長條與圓形', 'Bar and circle');
      LD.haloText(ctx, name, (midL + midR) / 2, G.band * 0.42, LD.c.text, 'center', 'middle', '600 12px ' + FF);
      LD.haloText(ctx, (state.noise ? T('含誤差', 'with errors') : T('理想', 'ideal')), (midL + midR) / 2, G.band * 0.42 + 16, LD.c.muted, 'center', 'middle', '11px ' + FF);
    }
  }
  function drawGalv(x, y, w, h) {
    LD.roundRect(ctx, x, y, w, h, 4);
    ctx.fillStyle = LD.mix(LD.c.surface, LD.c['canvas-bg'], 0.5); ctx.fill();
    ctx.strokeStyle = LD.alpha(LD.c.text, 0.25); ctx.lineWidth = 1; ctx.stroke();
    const cx = x + w / 2, cy = y + h - 3, R = Math.min(w * 0.46, h - 6);
    const A = 0.75; // 半刻度角（rad）
    ctx.save();
    ctx.lineCap = 'round';
    for (let k = -10; k <= 10; k++) {
      const a = -Math.PI / 2 + A * k / 10, big = k % 5 === 0;
      const r1 = R * (big ? 0.78 : 0.86), r2 = R * 0.95;
      ctx.beginPath(); ctx.moveTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)); ctx.lineTo(cx + r2 * Math.cos(a), cy + r2 * Math.sin(a));
      ctx.strokeStyle = k === 0 ? LD.c.probe : LD.alpha(LD.c.text, big ? 0.7 : 0.4); ctx.lineWidth = big ? 1.4 : 1; ctx.stroke();
    }
    ctx.font = '9px ' + FF; ctx.fillStyle = LD.c.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [-50, 0, 50].forEach(function (v) { const a = -Math.PI / 2 + A * v / 50; ctx.fillText(minus(String(v)), cx + R * 0.62 * Math.cos(a), cy + R * 0.62 * Math.sin(a)); });
    const a = -Math.PI / 2 + A * Math.max(-1.08, Math.min(1.08, state.needle));
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * 0.93 * Math.cos(a), cy + R * 0.93 * Math.sin(a));
    ctx.strokeStyle = LD.c.pos; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.restore();
    LD.ball(ctx, cx, cy, 3, LD.c.text, { glow: 0, shadow: false });
  }

  // ---------------------------------------------------------------------
  // 檢流計指針動畫、含誤差時電表跳動
  // ---------------------------------------------------------------------
  let animRaf = 0, lastT = 0;
  function needleTarget() {
    if (state.meter !== 'galv') return 0;
    const m = meterNow();
    return m.I / EC.GALV_FS;
  }
  function animate(t) {
    animRaf = 0;
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t;
    const target = needleTarget();
    const k = reduced ? 1 : 1 - Math.exp(-dt / 0.09);
    state.needle += (target - state.needle) * k;
    requestDraw();
    if (Math.abs(target - state.needle) > 0.002) animRaf = requestAnimationFrame(animate);
    else { state.needle = target; lastT = 0; }
  }
  function kickNeedle() { if (!animRaf && state.meter === 'galv') { lastT = 0; animRaf = requestAnimationFrame(animate); } }
  let jitterTimer = 0;
  function setJitter() {
    clearInterval(jitterTimer);
    jitterTimer = 0;
    state.jitter = 0; state.jitterI = 0;
    if (!state.noise) return;
    const r = EC.rng((Date.now() & 0xffff) + 7);
    jitterTimer = setInterval(function () {
      if (document.hidden) return;
      state.jitter = JITTER_V * EC.gauss(r);
      state.jitterI = JITTER_I * EC.gauss(r);
      updateReadouts();
      kickNeedle();
      requestDraw();
    }, 350);
  }

  // ---------------------------------------------------------------------
  // 操作：拖曳探針、點紙面、方向鍵
  // ---------------------------------------------------------------------
  const stage = $('stage');
  let drag = null, voice = null;
  function local(ev) { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  function inBoard(p) { return p.x >= X(0) - 6 && p.x <= X(SW) + 6 && p.y >= Y(SH) - 6 && p.y <= Y(0) + 6; }
  function distSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  }
  function hitProbe(p) {
    // 夾在負極上的黑探針不會被誤觸拉走（要移動它，先選「黑探針 N1」）
    const order = state.sel === 'n1' ? ['n1', 'n2'] : state.clip ? ['n2'] : ['n2', 'n1'];
    for (let i = 0; i < order.length; i++) {
      const g = probeGeom(order[i]);
      if (Math.hypot(p.x - g.tx, p.y - g.ty) <= 22 || distSeg(p.x, p.y, g.tx, g.ty, g.hx, g.hy) <= 12) return order[i];
    }
    return null;
  }
  function clampP(x, y) { return { x: Math.min(SW, Math.max(0, x)), y: Math.min(SH, Math.max(0, y)) }; }
  function setProbe(id, x, y) {
    const p = clampP(x, y);
    if (id === 'n1') {
      if (state.clip) { state.clip = false; }
      state.n1 = p; state.n1Touched = true;
    } else state.n2 = p;
    probeMoved();
  }
  function probeMoved() {
    updateReadouts();
    kickNeedle();
    updateVoice();
    requestDraw();
    if (view3) view3.update();
  }
  function select(id) {
    state.sel = id;
    document.querySelectorAll('[data-sel]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-sel') === id)); });
    if (kb && kb.index() !== KB_IDS.indexOf(id)) kb.select(KB_IDS.indexOf(id));
    requestDraw();
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (stage.classList.contains('is3d')) return;
    const p = local(ev);
    let id = hitProbe(p);
    const grabbed = !!id;
    if (id) {
      select(id);
    } else if (inBoard(p)) {
      id = state.sel;
      setProbe(id, wx(p.x), wy(p.y));
    } else return;
    const cur = id === 'n1' ? n1Pos() : state.n2;
    drag = { id: id, px: p.x, py: p.y, x: cur.x, y: cur.y, pid: ev.pointerId, grabbed: grabbed, moved: false };
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    startVoice();
    ev.preventDefault();
  });
  cv.addEventListener('pointermove', function (ev) {
    const p = local(ev);
    if (drag && ev.pointerId === drag.pid) {
      const k = state.fine ? FINE : 1;
      if (Math.hypot(p.x - drag.px, p.y - drag.py) > 3) drag.moved = true;
      if (!drag.moved) return;
      setProbe(drag.id, drag.x + (p.x - drag.px) / G.s * k, drag.y - (p.y - drag.py) / G.s * k);
      return;
    }
    if (ev.pointerType === 'mouse') {
      const h = hitProbe(p);
      if (h !== hover) { hover = h; requestDraw(); }
      cv.style.cursor = h ? 'grab' : inBoard(p) ? 'crosshair' : 'default';
    }
  });
  function endDrag(ev) {
    if (!drag || (ev && ev.pointerId !== drag.pid)) return;
    const d = drag;
    drag = null;
    // 在探針附近「點一下」（沒有拖曳）：把探針移到點的位置（點在針尖上則不動）
    if (d.grabbed && !d.moved && ev && ev.type === 'pointerup') {
      const p = local(ev), g = probeGeom(d.id);
      const r = Math.hypot(p.x - g.tx, p.y - g.ty);
      if (inBoard(p) && r > 9 && r <= 22) setProbe(d.id, wx(p.x), wy(p.y));
    }
    stopVoice();
    emitProbe();
    srSay(probeDesc(d.id));
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (hover) { hover = null; requestDraw(); } });
  // ---- 鍵盤操作（js/keys.js）：Enter 切換探針、方向鍵 0.05 cm、Shift 0.5 cm、Alt 0.01 cm、R 記錄 ----
  // 走的路與方向鈕、拖曳相同（setProbe 的邊界限制、'probe' 任務事件）
  function probeName(id) { return id === 'n2' ? T('紅探針 N2', 'red probe N2') : T('黑探針 N1', 'black probe N1'); }
  function probeDesc(id) {
    const p = id === 'n1' ? n1Pos() : state.n2;
    let s = probeName(id) + (id === 'n1' && state.clip ? T('夾在負極', ' clipped to the negative electrode') : ' (' + p.x.toFixed(2) + ', ' + p.y.toFixed(2) + ') cm');
    s += state.power ? T('，電表讀數 ', ', meter reading ') + minus(meterNow().text) : T('，電源未接通', ', supply off');
    return s + T('。', '.');
  }
  function keyStep(id, dx, dy, step) {
    if (stage.classList.contains('is3d')) return false;
    if (state.sel !== id) select(id);
    const p = id === 'n1' ? n1Pos() : state.n2, clip0 = state.clip;
    nudge(dx * step, dy * step);
    const q = id === 'n1' ? n1Pos() : state.n2;
    return q.x !== p.x || q.y !== p.y || clip0 !== state.clip;
  }
  let srTimer = 0;
  /** 拖曳結束時把讀數念一次（螢幕閱讀器；不在每一格更新） */
  function srSay(text) {
    clearTimeout(srTimer);
    srTimer = setTimeout(function () { const el = $('srMeter'); if (el && el.textContent !== text) el.textContent = text; }, 450);
  }
  // Alt＋方向鍵的極小步與 R 記錄：要在 LabKeys 之前攔下
  cv.addEventListener('keydown', function (ev) {
    const k = ev.key;
    if (ev.altKey && !ev.ctrlKey && !ev.metaKey) {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[k];
      if (!d) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      if (keyStep(state.sel, d[0], d[1], NUDGE_FINE)) {
        if (kb) kb.say(probeDesc(state.sel));
        cv.dispatchEvent(new CustomEvent('lab:keymove', { bubbles: true, detail: { index: KB_IDS.indexOf(state.sel) } }));
      }
      return;
    }
    if ((k === 'r' || k === 'R') && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); record(); }
  });
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('實驗桌俯視圖：導電紙上的兩個電極、紅色探針 N2 與黑色探針 N1，上方是直流電源供應器與電表。拖曳探針移動；鍵盤操作：Enter 切換探針，方向鍵移動 0.05 cm，Shift 加方向鍵移動 0.5 cm，Alt 加方向鍵移動 0.01 cm，R 記錄。',
        'Top view of the bench: the conducting paper with two electrodes, the red probe N2 and the black probe N1, with the DC supply and the meter above it. Drag a probe to move it. Keyboard: Enter picks a probe, the arrow keys move it 0.05 cm, Shift with an arrow key 0.5 cm, Alt with an arrow key 0.01 cm, R records.'),
      items: KB_IDS.map(function (id) {
        return {
          name: function () { return probeName(id); },
          move: function (dx, dy, big) { return keyStep(id, dx, dy, big ? NUDGE_BIG : NUDGE); },
          describe: function () { return probeDesc(id); }
        };
      }),
      onChange: function () {
        const id = KB_IDS[kb.index()];
        if (id && id !== state.sel) select(id); else requestDraw();
      }
    });
    if (kb.index() !== KB_IDS.indexOf(state.sel)) kb.select(KB_IDS.indexOf(state.sel));
  }
  /** 鍵盤選取的探針周圍畫虛線圓角框（--accent） */
  function drawKeyFocus() {
    if (!kb || !kb.focused()) return;
    const id = KB_IDS[kb.index()];
    if (!id) return;
    const g = probeGeom(id), pad = 5;
    const x0 = Math.min(g.tx - 13, g.hx - 7), x1 = Math.max(g.tx + 13, g.hx + 7);
    const y0 = Math.min(g.ty - 13, g.hy - 7), y1 = Math.max(g.ty + 13, g.hy + 7);
    ctx.save();
    ctx.strokeStyle = LD.c.accent; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    LD.roundRect(ctx, x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad, 8); ctx.stroke();
    ctx.restore();
  }
  function r4(v) { return Math.round(v * 1e4) / 1e4; }
  function nudge(dx, dy) {
    const p = state.sel === 'n1' ? n1Pos() : state.n2;
    setProbe(state.sel, r4(p.x + dx), r4(p.y + dy));
    emitProbeSoon();
  }
  let probeTimer = 0;
  function emitProbeSoon() { clearTimeout(probeTimer); probeTimer = setTimeout(emitProbe, 400); }
  document.querySelectorAll('.nudge button').forEach(function (b) {
    let rep = 0, hold = 0;
    const dx = +b.getAttribute('data-nx'), dy = +b.getAttribute('data-ny');
    const stop = function () { clearTimeout(hold); clearInterval(rep); hold = rep = 0; };
    b.addEventListener('pointerdown', function () {
      stop();
      hold = setTimeout(function () { rep = setInterval(function () { nudge(dx * NUDGE, dy * NUDGE); }, 70); }, 380);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (e) { b.addEventListener(e, stop); });
    b.addEventListener('click', function () { if (!rep) nudge(dx * NUDGE, dy * NUDGE); });
  });

  // 檢流計的「聲音零位指示」：拖曳時，離零愈遠聲音愈大
  function startVoice() {
    if (!window.LabSound || !LabSound.enabled() || state.meter !== 'galv' || !state.power) return;
    voice = LabSound.voice({ freq: 420, type: 'triangle', gain: 0 });
    updateVoice();
  }
  function updateVoice() {
    if (!voice) return;
    const m = meterNow();
    const u = Math.min(1, Math.abs(m.I) / EC.GALV_FS);
    voice.set({ freq: 380 + 520 * u, gain: u < 0.004 ? 0 : 0.08 + 0.32 * Math.pow(u, 0.6) }, 0.05);
  }
  function stopVoice() { if (voice) { voice.stop(0.12); voice = null; } }

  // ---------------------------------------------------------------------
  // 記錄、刪除、清除
  // ---------------------------------------------------------------------
  function gaussR() { return EC.gauss(Math.random); }
  function record() {
    if (!state.power) { setStatus(T('電源還沒接通：先按「接通電源」。', 'The supply is off: press “Switch on the supply” first.')); return; }
    const m = meterNow();
    if (state.meter === 'galv' && m.over) { setStatus(T('指針超出刻度，讀不出來：把紅探針移到接近零的地方再記錄。', 'The needle is off the scale: move the red probe closer to the null point before recording.')); return; }
    const p1 = n1Pos(), p2 = state.n2;
    const sh = sheet();
    const mx = state.noise ? p2.x + MARK_SIGMA * gaussR() : p2.x, my = state.noise ? p2.y + MARK_SIGMA * gaussR() : p2.y;
    // N1 的電位：夾在負極時就是 0；否則用電表對負極量得（理想時為真值）
    const V1 = state.clip ? 0 : m.V1;
    const rec = { x: Math.min(SW, Math.max(0, mx)), y: Math.min(SH, Math.max(0, my)), xt: p2.x, yt: p2.y,
      n1x: +p1.x.toFixed(3), n1y: +p1.y.toFixed(3), clip: state.clip, V1: V1, V2: m.V2, dV: m.dV,
      reading: m.reading, text: m.text, meter: state.meter };
    sh.recs.push(rec);
    sh.rev++;
    const A = analysis();
    const g = A.groups.find(function (q) { return q.idx.indexOf(sh.recs.length - 1) >= 0; });
    setStatus(T('記錄第 ', 'Point ') + sh.recs.length + T(' 點：', ' recorded: ') + '(' + rec.x.toFixed(1) + ', ' + rec.y.toFixed(1) + ') cm' + T('，讀數 ', ', reading ') + minus(m.text) +
      ' → ' + g.name + T('（', ' (') + fmt(g.V, 2) + ' V' + T('，', ', ') + g.pts.length + T(' 點）', ' points)'));
    if (window.LabSound) {
      LabSound.tone({ freq: 330 + 420 * Math.max(0, Math.min(1, m.V2 / state.V0)), dur: 0.11, type: 'sine', gain: 0.32 });
      LabSound.noise({ dur: 0.03, gain: 0.18, filter: 3200, q: 1 });
    }
    afterChange();
    emitRecord(rec, g);
    if (state.drawLines) emitLines();
    if (state.drawField) emitField();
  }
  function afterChange() {
    renderTable();
    updateSteps();
    requestDraw();
    if (view3) view3.update();
  }
  $('rec').addEventListener('click', record);
  $('undo').addEventListener('click', function () {
    const sh = sheet();
    if (!sh.recs.length) return;
    sh.recs.pop(); sh.rev++; sh.est = null;
    setStatus(T('已刪除最後一點。', 'The last point was deleted.'));
    afterChange();
  });
  $('clearAll').addEventListener('click', function () {
    state.sheets = {};
    state.estimated = false;
    anaCache.key = '';
    setStatus(T('已清除所有記錄點、等位線與估算結果（設定保留）。', 'All points, lines and estimates were cleared (settings kept).'));
    renderEst(null);
    afterChange();
  });

  // ---------------------------------------------------------------------
  // 估算電場
  // ---------------------------------------------------------------------
  function estimate() {
    if (!state.power) { setStatus(T('電源還沒接通。', 'The supply is off.')); return; }
    const A = analysis(), P = [state.n2.x, state.n2.y];
    const Vp = potAt(P[0], P[1]);
    const cands = A.groups.filter(function (g) { return g.path && g.pts.length >= 2; }).map(function (g) { return { V: g.V, path: g.path, name: g.name, g: g }; });
    const pe = posEl(), ne = negEl();
    cands.push({ V: state.V0, path: elPath(pe), name: T('正極', '+ electrode'), el: true });
    cands.push({ V: 0, path: elPath(ne), name: T('負極', '− electrode'), el: true });
    let up = null, dn = null;
    cands.forEach(function (c) {
      if (c.V >= Vp && (!up || c.V < up.V || (c.V === up.V && !c.el))) up = c;
      if (c.V < Vp && (!dn || c.V > dn.V || (c.V === dn.V && !c.el))) dn = c;
    });
    if (!up || !dn || up.V - dn.V < 0.05) {
      setStatus(T('紅探針兩側要各有一條等位線（或電極）才能估算。', 'There must be an equipotential line (or an electrode) on each side of the red probe.'));
      return;
    }
    const r = EC.estimateField(up.path, up.V, dn.path, dn.V, P);
    if (!r) return;
    const mid = [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2];
    const Ec = fieldAt(mid[0], mid[1]).E;
    const est = { a: r.a, b: r.b, dd: r.dd, dV: r.dV, E: r.E, Ecalc: Ec, err: Ec > 0 ? (r.E - Ec) / Ec : NaN,
      up: up.name, dn: dn.name, VA: up.V, VB: dn.V, usesEl: !!(up.el || dn.el), mid: mid };
    sheet().est = est;
    state.estimated = true;
    renderEst(est);
    setStatus(T('估算完成：E ≈ ', 'Estimate: E ≈ ') + est.E.toFixed(3) + ' V/cm' + T('，計算值 ', ', computed ') + Ec.toFixed(3) + ' V/cm' + T('。', '.'));
    if (window.LabSound) LabSound.tone({ freq: 660, dur: 0.1, type: 'sine', gain: 0.25 });
    updateSteps();
    requestDraw();
    emitEstimate(est);
  }
  function renderEst(e) {
    if (!e) { ['eLines', 'eDd', 'eEst', 'eCalc', 'eErr'].forEach(function (id) { $(id).textContent = '—'; }); return; }
    $('eLines').textContent = T(e.up + '（' + fmt(e.VA, 2) + ' V）／' + e.dn + '（' + fmt(e.VB, 2) + ' V）', e.up + ' (' + fmt(e.VA, 2) + ' V) / ' + e.dn + ' (' + fmt(e.VB, 2) + ' V)');
    $('eDd').textContent = e.dd.toFixed(2) + ' cm';
    $('eEst').textContent = e.E.toFixed(3) + ' V/cm';
    $('eCalc').textContent = e.Ecalc.toFixed(3) + ' V/cm';
    $('eErr').textContent = isFinite(e.err) ? minus((e.err * 100).toFixed(1)) + ' %' : '—';
  }
  $('est').addEventListener('click', estimate);

  // ---------------------------------------------------------------------
  // 數據表、讀數、步驟
  // ---------------------------------------------------------------------
  function renderTable() {
    const sh = sheet(), A = analysis();
    const head = '<thead><tr><th>' + T('線', 'Line') + '</th><th>#</th><th>x<small>(cm)</small></th><th>y<small>(cm)</small></th><th>' +
      T('讀數', 'Reading') + '</th><th>' + T('線的電位', 'Line potential') + '<small>(V)</small></th></tr></thead>';
    if (!sh.recs.length) {
      $('tbl').innerHTML = head + '<tbody><tr class="empty"><td colspan="6">' + T('還沒有記錄點。移動紅探針到讀數為零（或目標電壓）的地方，按「記錄」。', 'No points yet. Move the red probe to where the meter reads zero (or the target voltage) and press “Record”.') + '</td></tr></tbody>';
      $('tsum').textContent = '';
      return;
    }
    let rows = '';
    A.groups.forEach(function (g) {
      const col = potColor(g.V);
      g.idx.forEach(function (i, n) {
        const r = sh.recs[i];
        rows += '<tr' + (i === sh.recs.length - 1 ? ' class="latest"' : '') + '><td class="g">' + (n === 0 ? '<i style="background:' + col + '"></i>' + g.name : '') + '</td><td>' + (i + 1) +
          '</td><td>' + r.x.toFixed(1) + '</td><td>' + r.y.toFixed(1) + '</td><td>' + minus(r.text) + '</td><td>' + (n === 0 ? fmt(g.V, 2) : '') + '</td></tr>';
      });
    });
    $('tbl').innerHTML = head + '<tbody>' + rows + '</tbody>';
    const full = A.groups.filter(function (g) { return g.pts.length >= 5; }).length;
    $('tsum').textContent = T('共 ', 'Total: ') + sh.recs.length + T(' 點、', ' points, ') + A.groups.length + T(' 組；至少 5 點的等位線 ', ' groups; lines with at least 5 points: ') + full + T(' 條。', '.');
  }
  function updateReadouts() {
    const m = meterNow(), p1 = n1Pos(), p2 = state.n2;
    $('rMeterLabel').textContent = state.meter === 'dmm' ? T('電表讀數 V(N2) − V(N1)', 'Meter reading V(N2) − V(N1)') : T('檢流計電流', 'Galvanometer current');
    $('rMeter').textContent = state.power ? minus(m.text) : '0';
    $('rN2').textContent = '(' + p2.x.toFixed(2) + ', ' + p2.y.toFixed(2) + ') cm';
    $('rN1').textContent = state.clip ? T('夾在負極（0 V）', 'clipped to − (0 V)') : '(' + p1.x.toFixed(2) + ', ' + p1.y.toFixed(2) + ') cm';
    const ds = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    $('rDs').textContent = ds.toFixed(2) + ' cm';
    $('rDvDs').textContent = state.meter === 'dmm' && state.power && ds > 0.05 && !state.clip ? minus((m.reading / ds).toFixed(3)) + ' V/cm' : '—';
    const I = EC.currentAcross(getSol()) * V0eff();
    $('rI').textContent = state.power ? (I * 1000).toFixed(3) + ' mA' : '0';
    // 計算值
    const Vp = potAt(p2.x, p2.y), f = fieldAt(p2.x, p2.y);
    $('cV').textContent = state.power ? Vp.toFixed(3) + ' V' : '0';
    $('cE').textContent = state.power ? f.E.toFixed(3) + ' V/cm' + T('（', ' (') + (f.E * 100).toFixed(1) + T(' V/m）', ' V/m)') : '0';
    $('cDir').textContent = state.power && f.E > 1e-6 ? minus((Math.atan2(f.ey, f.ex) * 180 / Math.PI).toFixed(0)) + '°' + T('（由 +x 逆時針）', ' (from +x, counter-clockwise)') : '—';
    $('cJ').textContent = state.power ? (f.E * 100 / EC.R_SHEET * 1000).toFixed(3) + ' mA/m' : '0';
    const I1 = EC.currentAcross(getSol());
    $('cR').textContent = I1 > 0 ? (1 / I1 / 1000).toFixed(2) + ' kΩ' : '—';
  }
  const STEPS = [
    ['選擇電極、設定電壓，按「接通電源」。', 'Choose the electrodes and the voltage, then switch on the supply.'],
    ['放好黑探針 N1（固定不動）；用三用電表時也可以把它夾到負極。', 'Place the black probe N1 and keep it still (with the multimeter you may clip it to the negative electrode).'],
    ['移動紅探針 N2，找讀數為零（或目標電壓）的點，按「記錄」。', 'Move the red probe N2 to a point where the meter reads zero (or the target voltage) and press “Record”.'],
    ['同一條線找至少 5 點；換 N1 位置（或目標電壓），描出至少 4 條等位線。', 'Find at least 5 points per line; move N1 (or change the target) and trace at least 4 lines.'],
    ['勾選「連成平滑的等位線」。', 'Tick “Join the points … smooth curve”.'],
    ['勾選「畫出電力線」，看它們與等位線垂直。', 'Tick “Draw field lines” and check that they cross the equipotentials at right angles.'],
    ['把紅探針放在兩條線之間，按「估算電場」，與計算值比較。', 'Put the red probe between two lines, press “Estimate E” and compare with the computed value.']
  ];
  function stepsDone() {
    const A = analysis(), sh = sheet();
    return [
      state.power,
      state.n1Touched || state.clip || sh.recs.length > 0,
      sh.recs.length > 0,
      A.groups.filter(function (g) { return g.pts.length >= 5; }).length >= 4,
      state.drawLines && A.groups.some(function (g) { return g.pts.length >= 3; }),
      state.drawField && sketch().lines.length > 0,
      !!sh.est
    ];
  }
  function updateSteps() {
    const d = stepsDone();
    let now = d.indexOf(false);
    const ol = $('steps');
    ol.innerHTML = STEPS.map(function (s, i) {
      const cls = d[i] ? 'done' : i === now ? 'now' : '';
      return '<li' + (cls ? ' class="' + cls + '"' : '') + '>' + T(s[0], s[1]) + '</li>';
    }).join('');
  }
  function setStatus(s) { lastStatus = s; $('status').textContent = s; }
  function meterHint() {
    $('meterHint').textContent = state.meter === 'dmm'
      ? T('三用電表顯示 V(N2) − V(N1)，解析度 0.01 V。把 N1 夾到負極，讀數就是 N2 的電位：可以直接找 1.00 V、2.00 V…… 的點。', 'The multimeter shows V(N2) − V(N1) to 0.01 V. Clip N1 to the negative electrode and the reading is the potential of N2: look directly for 1.00 V, 2.00 V, …')
      : T('檢流計中央為零：指針偏右表示 N2 的電位比 N1 高。找指針回到正中央（0 μA）的點，就是與 N1 等電位的點。', 'Centre-zero galvanometer: a deflection to the right means N2 is at a higher potential than N1. Where the needle returns to the centre (0 μA), N2 is at the same potential as N1.');
  }

  // ---------------------------------------------------------------------
  // 任務事件
  // ---------------------------------------------------------------------
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function common() {
    const A = analysis();
    return {
      type: state.type, d: state.d, a: state.a, L: state.L, V0: state.V0, power: state.power, noise: state.noise, meter: state.meter,
      fullBars: state.type !== 'circles' && state.L >= SH,
      groups: A.groups.map(function (g) { return { V: g.V, n: g.pts.length, span: g.span, vRange: g.vRange }; }),
      total: sheet().recs.length, drawLines: state.drawLines, drawField: state.drawField
    };
  }
  function probeInfo() {
    const p1 = n1Pos(), p2 = state.n2, m = meterNow();
    const e2 = EC.electrodeAt(els(), p2.x, p2.y);
    const corner = Math.min(Math.hypot(p2.x, p2.y), Math.hypot(SW - p2.x, p2.y), Math.hypot(p2.x, SH - p2.y), Math.hypot(SW - p2.x, SH - p2.y));
    // 長條背後：長條外側、離長條外緣至少 1 cm
    let behind = false;
    els().forEach(function (e) {
      if (e.kind !== 'rect') return;
      if (e.sign > 0 && p2.x <= e.x0 - 1 && p2.y >= e.y0 && p2.y <= e.y1) behind = true;
      if (e.sign < 0 && p2.x >= e.x1 + 1 && p2.y >= e.y0 && p2.y <= e.y1) behind = true;
    });
    return {
      x: p2.x, y: p2.y, x1: p1.x, y1: p1.y, clip: state.clip, reading: m.reading, dV: m.dV, V1: m.V1, V2: m.V2,
      onElectrode: e2 >= 0, n1OnElectrode: state.clip || EC.electrodeAt(els(), p1.x, p1.y) >= 0,
      dist12: Math.hypot(p2.x - p1.x, p2.y - p1.y), corner: corner, behind: behind,
      E2: fieldAt(p2.x, p2.y).E, Ecent: fieldAt(SW / 2, SH / 2).E
    };
  }
  function emitRecord(rec, g) {
    emit('record', Object.assign(common(), probeInfo(), { x: rec.xt, y: rec.yt, mx: rec.x, my: rec.y, reading: rec.reading,
      groupN: g.pts.length, groupV: g.V, groupSpan: g.span, groupVRange: g.vRange }));
  }
  function emitProbe() { if (state.power) emit('probe', Object.assign(common(), probeInfo())); }
  function emitLines() { emit('lines', common()); }
  function emitField() { const sk = sketch(); emit('fieldlines', Object.assign(common(), { nCurves: sk.curves.filter(function (c) { return c.g && c.g.pts.length >= 4; }).length, nLines: sk.lines.length })); }
  function emitEstimate(e) {
    const m = e.mid;
    const dEl = Math.min.apply(null, els().map(function (q) { return EC.distToElectrode(q, m[0], m[1]); }));
    emit('estimate', Object.assign(common(), { Eest: e.E, Ecalc: e.Ecalc, err: e.err, dd: e.dd, dV: e.dV, x: m[0], y: m[1], VA: e.VA, VB: e.VB,
      usesEl: e.usesEl, distEl: dEl, Ecent: fieldAt(SW / 2, SH / 2).E, sheet: sheetKey() }));
  }

  // ---------------------------------------------------------------------
  // 控制項
  // ---------------------------------------------------------------------
  const elD = $('d'), elA = $('a'), elL = $('L'), elV = $('V0');
  function refreshOutputs() {
    $('do').textContent = val(elD).toFixed(1) + ' cm';
    $('ao').textContent = val(elA).toFixed(2) + ' cm';
    $('Lo').textContent = val(elL).toFixed(0) + ' cm' + (val(elL) >= SH ? T('（邊到邊）', ' (edge to edge)') : '');
    $('V0o').textContent = val(elV).toFixed(1) + ' V';
    $('dLabel').textContent = state.type === 'circles' ? T('兩圓心的距離 d', 'Distance between the centres d')
      : state.type === 'bars' ? T('兩長條內緣的距離 d', 'Gap between the bars d') : T('長條內緣到圓心的距離 d', 'Bar edge to circle centre d');
    $('boxA').hidden = state.type === 'bars';
    $('boxL').hidden = state.type === 'circles';
  }
  function readSliders() {
    state.d = Math.round(val(elD) * 2) / 2;
    state.a = Math.round(val(elA) * 100) / 100;
    state.L = Math.round(val(elL));
    state.V0 = Math.round(val(elV) * 10) / 10;
    // 圓形電極不可超出紙面
    if (state.type !== 'bars') state.d = Math.min(state.d, SW - 2 * state.a - 1);
  }
  function configChanged(fast) {
    preview = !!fast;
    readSliders();
    refreshOutputs();
    stopVoice();
    if (!fast) { anaCache.key = ''; renderTable(); renderEst(sheet().est); updateSteps(); }
    updateReadouts();
    kickNeedle();
    requestDraw();
    if (view3 && !fast) view3.update();
  }
  [elD, elA, elL, elV].forEach(function (el) {
    el.addEventListener('input', function () { configChanged(true); });
    el.addEventListener('change', function () { configChanged(false); });
  });
  document.querySelectorAll('[data-type]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.type = b.getAttribute('data-type');
      document.querySelectorAll('[data-type]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      configChanged(false);
    });
  });
  document.querySelectorAll('[data-meter]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.meter = b.getAttribute('data-meter');
      document.querySelectorAll('[data-meter]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      meterHint();
      updateReadouts();
      state.needle = 0;
      kickNeedle();
      requestDraw();
    });
  });
  document.querySelectorAll('[data-noise]').forEach(function (b) {
    b.addEventListener('click', function () {
      const on = b.getAttribute('data-noise') === '1';
      if (on === state.noise) return;
      state.noise = on;
      if (on) {
        state.seed = 1 + Math.floor(Math.random() * 1e6);
        state.offset = (Math.random() * 2 - 1) * OFFSET_MAX;
      } else state.offset = 0;
      document.querySelectorAll('[data-noise]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      setJitter();
      setStatus(on ? T('含誤差：換上一張導電度略不均勻的紙，電表也有零點偏差與跳動。', 'With errors: a slightly non-uniform sheet, and the meter now has a zero offset and a flickering last digit.') : T('理想條件。', 'Ideal conditions.'));
      configChanged(false);
    });
  });
  document.querySelectorAll('[data-sel]').forEach(function (b) { b.addEventListener('click', function () { select(b.getAttribute('data-sel')); }); });
  $('fine').addEventListener('change', function (ev) { state.fine = ev.target.checked; });
  $('clip').addEventListener('click', function () {
    state.clip = true; state.n1Touched = true;
    setStatus(T('黑探針夾在負極上：電表讀數就是紅探針處的電位（對負極）。', 'N1 is clipped to the negative electrode: the reading is now the potential of N2 (relative to −).'));
    if (state.meter !== 'dmm') setStatus(lastStatus + T('（建議改用三用電表）', ' (the multimeter is more useful here)'));
    probeMoved();
    updateSteps();
  });
  function powerBtn() {
    const b = $('power');
    b.setAttribute('aria-pressed', String(state.power));
    b.textContent = state.power ? T('關閉電源', 'Switch off the supply') : T('接通電源', 'Switch on the supply');
  }
  $('power').addEventListener('click', function () {
    state.power = !state.power;
    powerBtn();
    if (window.LabSound) {
      LabSound.noise({ dur: 0.04, gain: 0.3, filter: 2400, q: 1.5 });
      if (state.power) LabSound.tone({ freq: 520, dur: 0.12, type: 'sine', gain: 0.25 });
    }
    setStatus(state.power ? T('電源接通：紙上有穩定電流了。', 'Supply on: a steady current flows through the paper.') : T('電源關閉。', 'Supply off.'));
    updateReadouts(); updateSteps(); kickNeedle(); requestDraw();
    if (view3) view3.update();
  });
  [['drawLines', 'drawLines'], ['drawField', 'drawField'], ['showTheory', 'showTheory'], ['showStream', 'showStream'], ['showHeat', 'showHeat']].forEach(function (p) {
    $(p[0]).addEventListener('change', function (ev) {
      state[p[1]] = ev.target.checked;
      updateSteps();
      requestDraw();
      if (view3) view3.update();
      if (p[0] === 'drawLines' && ev.target.checked) emitLines();
      if (p[0] === 'drawField' && ev.target.checked) emitField();
    });
  });

  // 喇叭按鈕：切換全站音效設定（齒輪面板也能切換，兩邊同步）
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
  });

  // ---------------------------------------------------------------------
  // 3D 電位地形（three.js 只在切換到 3D 時才載入）
  // ---------------------------------------------------------------------
  let view3 = null, threeLib = null, loadToken = 0;
  const host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function env3() {
    return {
      host: host3, T: T,
      data: function () {
        const A = analysis(), sh = sheet();
        return {
          sol: getSol(), V0: state.V0, V0eff: V0eff(), power: state.power,
          recs: sh.recs, groups: A.groups, n1: n1Pos(), n2: state.n2, clip: state.clip,
          showStream: state.showStream, showTheory: state.showTheory, drawLines: state.drawLines,
          potColor: potColor,
          stream: state.showStream && V0eff() > 0 ? derived('stream', function (s) { return EC.streamlines(s, 14); }) : null
        };
      },
      contour: function (level) { return EC.contour(getSol(), level); },
      onLost: function () {
        setView('2d');
        viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D。', 'The 3D graphics context was lost, so the view switched back to 2D.');
      }
    };
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
    $('resetCam').hidden = mode !== '3d';
  }
  function setView(mode) {
    if (mode === '3d') {
      if (view3) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable() || !window.Equipotential3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        preview = false;
        view3 = window.Equipotential3D.create(lib, env3());
        stage.classList.add('is3d');
        viewMsg.textContent = '';
        requestAnimationFrame(function () { if (view3) view3.update(); });
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
      statKey = '';
      requestDraw();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D。', 'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    requestDraw();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ---------------------------------------------------------------------
  // 啟動
  // ---------------------------------------------------------------------
  function onTheme() {
    statKey = '';
    anaCache.key = '';
    renderTable();
    updateSteps();
    updateReadouts();
    meterHint();
    powerBtn();
    updateSoundButton();
    refreshOutputs();
    if (sheet().est) renderEst(sheet().est);
    if (view3) view3.onTheme();
    requestDraw();
  }
  window.addEventListener('lab:themechange', onTheme);
  if (window.matchMedia) {
    const dm = window.matchMedia('(prefers-color-scheme: dark)');
    if (dm.addEventListener) dm.addEventListener('change', onTheme);
  }
  if (window.ResizeObserver) new ResizeObserver(function () { statKey = ''; requestDraw(); }).observe(cv);
  else window.addEventListener('resize', function () { statKey = ''; requestDraw(); });

  // 分享連結：兩支探針的位置、N1 是否夾在負極、選取的探針（拖曳出來的狀態）
  // classroom.js 在 DOMContentLoaded 才載入：還沒有 LabShare 時，等 load 再登記（還原在 load 之後才做）
  function regShare() {
    if (!window.LabShare) return false;
    window.LabShare.register({
      get: function () {
        return { n2: [r4(state.n2.x), r4(state.n2.y)], n1: [r4(state.n1.x), r4(state.n1.y)], clip: state.clip, sel: state.sel };
      },
      set: function (o) {
        if (!o || typeof o !== 'object') return;
        const pt = function (a) {
          return Array.isArray(a) && a.length === 2 && typeof a[0] === 'number' && typeof a[1] === 'number' && isFinite(a[0]) && isFinite(a[1]) ? clampP(a[0], a[1]) : null;
        };
        const p2 = pt(o.n2), p1 = pt(o.n1);
        if (p2) state.n2 = p2;
        if (p1) { if (p1.x !== state.n1.x || p1.y !== state.n1.y) state.n1Touched = true; state.n1 = p1; }
        if (typeof o.clip === 'boolean') { state.clip = o.clip; if (o.clip) state.n1Touched = true; }
        if (o.sel === 'n1' || o.sel === 'n2') select(o.sel);
        probeMoved();
        updateSteps();
      }
    });
    return true;
  }
  if (!regShare()) window.addEventListener('load', regShare);

  readSliders();
  refreshOutputs();
  powerBtn();
  meterHint();
  updateSoundButton();
  renderTable();
  updateSteps();
  updateReadouts();
  setStatus(T('先按「接通電源」，再移動探針。', 'Switch on the supply first, then move the probes.'));
  requestDraw();
})();
