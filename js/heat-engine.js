/* heat-engine.js — 「熱機循環與熱力學第一定律」頁面程式
 * 物理全部在 js/heat-engine-core.js（解析式）；3D 場景在 js/heat-engine-3d.js（three.js 延遲載入）。
 * 畫布：左（或下）是汽缸動畫與能量流，右（或上）是 P–V 圖。顯示單位：V 用 L、P 用 kPa（kPa·L = J）。
 */
(function () {
  'use strict';
  const C = window.HeatEngineCore, D = window.LabDraw;
  if (!C || !D) return;
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const $ = function (id) { return document.getElementById(id); };
  const val = function (el) { return window.LabNum ? +window.LabNum.value(el) : +el.value; };
  const setVal = function (el, v) { if (window.LabNum) window.LabNum.set(el, v); else { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
  const clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  const FONT = D.FONT;
  const font = function (px, w) { return (w || '600') + ' ' + px + 'px ' + FONT; };
  const reduced = D.reducedMotion();
  const R = C.R;

  // =====================================================================
  // 狀態
  // =====================================================================
  const DEF_CUSTOM = [[8, 300], [8, 700], [20, 700], [20, 300]];
  const VLIM = [0.5, 25], PLIM = [10, 1000];      // 自訂頂點的範圍（L、kPa），也是自訂模式固定的座標範圍
  const st = {
    type: 'carnot', gas: 'di', custom: DEF_CUSTOM.map(function (a) { return a.slice(); }), rows: [],
    playing: !reduced, show: { iso: true, fill: true, heat: true }, show3: { surf: true, iso: true, proj: true }
  };
  const anim = { seg: 0, u: 0, stepping: false, lapAcc: 0, flowT: 0 };
  let userActed = false;
  let cyc = null, cycKey = '', lastGood = null;
  const ids = ['n', 'cTh', 'cTc', 'cVA', 'cRB', 'oR', 'oT1', 'oT3', 'oV1', 'dR', 'dRc', 'dT1', 'dV1', 'sTh', 'sTc', 'sVmin', 'sR', 'bRp', 'bT1', 'bT3', 'bP1', 'speed'];
  const el = {};
  ids.forEach(function (k) { el[k] = $(k); });
  const cv = $('cv'), ctx = cv.getContext('2d'), stage = $('stage');
  const TYPES = ['carnot', 'otto', 'diesel', 'stirling', 'brayton', 'custom'];
  const TBTN = { carnot: 'tCarnot', otto: 'tOtto', diesel: 'tDiesel', stirling: 'tStirling', brayton: 'tBrayton', custom: 'tCustom' };
  const PBOX = { carnot: 'pCarnot', otto: 'pOtto', diesel: 'pDiesel', stirling: 'pStirling', brayton: 'pBrayton', custom: 'pCustom' };

  // ---------------- 顏色 ----------------
  const tok = {};
  function readTokens() {
    const cs = getComputedStyle(document.documentElement);
    ['isoT', 'adia', 'isoV', 'isoP', 'line', 'hot', 'cold', 'eng', 'fri', 'regen', 'metal', 'flame'].forEach(function (k) { tok[k] = cs.getPropertyValue('--he-' + k).trim() || '#888'; });
  }
  readTokens();
  const KCOL = function (k) { return { isoT: tok.isoT, adiabat: tok.adia, isoV: tok.isoV, isoP: tok.isoP, line: tok.line }[k] || tok.line; };
  // 溫度色階：亮度由冷到熱單調增加（plasma 色階）
  const PLASMA = [[0, [13, 8, 135]], [0.25, [126, 3, 168]], [0.5, [204, 71, 120]], [0.75, [248, 149, 64]], [1, [240, 249, 33]]];
  function plasma(t) {
    t = clamp(t, 0, 1);
    for (let i = 1; i < PLASMA.length; i++) {
      if (t <= PLASMA[i][0]) {
        const a = PLASMA[i - 1], b = PLASMA[i], u = (t - a[0]) / (b[0] - a[0]);
        return 'rgb(' + [0, 1, 2].map(function (j) { return Math.round(a[1][j] + (b[1][j] - a[1][j]) * u); }).join(',') + ')';
      }
    }
    return 'rgb(240,249,33)';
  }
  let Trng = [250, 650];
  function tempColor(Tk) { return plasma(0.1 + 0.85 * (Tk - Trng[0]) / Math.max(1, Trng[1] - Trng[0])); }

  // ---------------- 文字工具 ----------------
  /** 畫布上的含下標文字：parts = ['Q', ['in'], ' = 12 J']，陣列表示下標（不用 Unicode 下標字元） */
  function rich(g, parts, x, y, color, align, px, weight) {
    const fm = font(px, weight || '600'), fs = font(Math.round(px * 0.72 * 10) / 10, weight || '600');
    let w = 0;
    const ws = parts.map(function (p) { g.font = Array.isArray(p) ? fs : fm; const v = g.measureText(Array.isArray(p) ? p[0] : p).width; w += v; return v; });
    let x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    parts.forEach(function (p, i) {
      const sub = Array.isArray(p);
      D.haloText(g, sub ? p[0] : p, x0, y + (sub ? px * 0.28 : 0), color, 'left', 'middle', sub ? fs : fm);
      x0 += ws[i];
    });
    return w;
  }
  function richW(g, parts, px, weight) {
    const fm = font(px, weight || '600'), fs = font(Math.round(px * 0.72 * 10) / 10, weight || '600');
    let w = 0;
    parts.forEach(function (p) { g.font = Array.isArray(p) ? fs : fm; w += g.measureText(Array.isArray(p) ? p[0] : p).width; });
    return w;
  }
  /** 有底框的含下標標籤（中心 x、底邊 yb） */
  function richPill(g, parts, x, yb, color, px, align) {
    px = px || 12;
    const w = richW(g, parts, px), h = px + 7;
    const bx = align === 'left' ? x : align === 'right' ? x - w - 12 : x - w / 2 - 6;
    D.roundRect(g, bx, yb - h, w + 12, h, h / 2);
    g.fillStyle = D.alpha(D.c['canvas-bg'], D.dark ? 0.86 : 0.9); g.fill();
    g.strokeStyle = D.alpha(color || D.c.muted, D.dark ? 0.5 : 0.38); g.lineWidth = 1; g.stroke();
    rich(g, parts, bx + 6, yb - h / 2, color || D.c.text, 'left', px);
    return { x: bx, y: yb - h, w: w + 12, h: h };
  }
  const minus = function (s) { s = String(s); if (/^-0(\.0+)?$/.test(s)) s = s.slice(1); return s.replace(/^-/, '−'); };
  function fJ(x) { // 能量（J）
    if (!isFinite(x)) return '—';
    const a = Math.abs(x);
    const s = a >= 9999.5 ? Math.round(x).toLocaleString('en-US') : a >= 99.95 ? x.toFixed(0) : a >= 9.995 ? x.toFixed(1) : x.toFixed(2);
    return minus(s);
  }
  function fS(x) { if (!isFinite(x)) return '—'; return minus(Math.abs(x) < 5e-4 ? '0.000' : x.toFixed(3)); }
  function fPct(x) { return isFinite(x) ? minus((x * 100).toFixed(2)) + '%' : '—'; }
  function fK(x) { return isFinite(x) ? Math.round(x) + ' K' : '—'; }
  function fV(x) { return x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2); }
  function fP(x) { return x >= 1000 ? Math.round(x).toLocaleString('en-US') : x >= 100 ? x.toFixed(0) : x.toFixed(1); }
  function fCop(x) { return isFinite(x) ? (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2)) : '—'; }

  // =====================================================================
  // 參數與循環
  // =====================================================================
  function ui() {
    return {
      type: st.type, gas: st.gas, n: val(el.n), reverse: $('reverse').checked, regen: $('regen').checked,
      carnot: { Th: val(el.cTh), Tc: val(el.cTc), VA: val(el.cVA), rB: val(el.cRB) },
      otto: { r: val(el.oR), T1: val(el.oT1), T3: val(el.oT3), V1: val(el.oV1) },
      diesel: { r: val(el.dR), rc: val(el.dRc), T1: val(el.dT1), V1: val(el.dV1) },
      stirling: { Th: val(el.sTh), Tc: val(el.sTc), Vmin: val(el.sVmin), r: val(el.sR) },
      brayton: { rp: val(el.bRp), T1: val(el.bT1), T3: val(el.bT3), P1: val(el.bP1) },
      custom: { pts: st.custom.map(function (a) { return a.slice(); }) }
    };
  }
  // 每一段的取樣（顯示單位）、在圖上的長度、動畫時間
  let segs = [], durs = [], maxRate = 1, maxWRate = 1, axis = { V: 10, P: 1000, sV: 2, sP: 200 };
  const NS = 96;
  function niceStep(span, target) {
    const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  function fitAxis(need, cur, target) {
    // 遲滯：目前的範圍裝得下而且沒有太空，就不換（拖滑桿時座標不會一直跳）
    if (cur && need <= cur.max && need >= cur.max * 0.55) return cur;
    const s = niceStep(need, target), max = Math.ceil(need / s - 1e-9) * s;
    return { max: max, step: s };
  }
  let axV = null, axP = null;
  function recompute(force) {
    const u = ui(), key = JSON.stringify(u);
    if (key === cycKey && !force) return false;
    let c = null;
    try { c = C.fromDisplay(u); } catch (e) { c = null; }
    if (!c || !isFinite(c.Wout)) { if (!lastGood) return false; c = lastGood; }
    else lastGood = c;
    const changed = key !== cycKey;
    cycKey = key; cyc = c;
    // 取樣（L、kPa）
    segs = c.segs.map(function (s) {
      const pts = [];
      for (let i = 0; i <= NS; i++) { const q = s.at(i / NS); pts.push({ V: q.V * 1e3, P: q.P / 1e3, T: q.T }); }
      return { s: s, pts: pts };
    });
    // 座標範圍
    if (st.type === 'custom') { axV = { max: VLIM[1], step: 5 }; axP = { max: PLIM[1], step: 200 }; }
    else {
      let vm = 0, pm = 0;
      segs.forEach(function (g) { g.pts.forEach(function (q) { vm = Math.max(vm, q.V); pm = Math.max(pm, q.P); }); });
      axV = fitAxis(vm * 1.06, axV && axV.custom ? null : axV, 5);
      axP = fitAxis(pm * 1.08, axP && axP.custom ? null : axP, 5);
    }
    if (st.type === 'custom') { axV.custom = true; axP.custom = true; }
    axis = { V: axV.max, P: axP.max, sV: axV.step, sP: axP.step };
    // 動畫時間：每段的份量隨它在圖上的（正規化）長度增加
    const lens = segs.map(function (g) {
      let L = 0;
      for (let i = 1; i < g.pts.length; i++) L += Math.hypot((g.pts[i].V - g.pts[i - 1].V) / axis.V, (g.pts[i].P - g.pts[i - 1].P) / axis.P);
      return L;
    });
    const sum = lens.reduce(function (a, b) { return a + b; }, 0) || 1, m = segs.length;
    durs = lens.map(function (L) { return 8 * (0.18 / m + 0.82 * L / sum); });
    // 熱流率、作功率的最大值（熱流箭頭的粗細比例）
    maxRate = 1e-12; maxWRate = 1e-12;
    c.segs.forEach(function (s, i) {
      for (let k = 0; k <= 20; k++) { maxRate = Math.max(maxRate, Math.abs(s.dQdu(k / 20)) / durs[i]); maxWRate = Math.max(maxWRate, Math.abs(s.dWdu(k / 20)) / durs[i]); }
    });
    // 溫度色階的範圍
    const pad = Math.max(20, 0.08 * (c.Tmax - c.Tmin));
    Trng = [Math.max(1, c.Tmin - pad), c.Tmax + pad];
    if (anim.seg >= c.segs.length) { anim.seg = 0; anim.u = 0; }
    if (changed) anim.lapAcc = 0;
    layerKey = '';
    renderTables(); updateReadouts(); legend(); warn();
    if (view3 && view3.active) view3.rebuild();
    return true;
  }

  // =====================================================================
  // 畫布版面
  // =====================================================================
  let W = 0, H = 0, dpr = 1, narrow = false;
  let box = { cyl: null, sank: null, plot: null, pa: null };
  function canvasH(w) { return w >= 640 ? Math.round(clamp(w * 0.6, 400, 540)) : Math.round(w * 0.78 + w * 0.8 + 30); }
  function layout() {
    const m = 10;
    narrow = W < 640;
    if (!narrow) {
      const lw = Math.round(clamp(W * 0.31, 190, 260));
      const ch = Math.round((H - 3 * m) * 0.6);
      box.cyl = { x: m, y: m, w: lw, h: ch };
      box.sank = { x: m, y: 2 * m + ch, w: lw, h: H - 3 * m - ch };
      box.plot = { x: 2 * m + lw, y: m, w: W - 3 * m - lw, h: H - 2 * m };
    } else {
      const ph = Math.round(W * 0.78);
      box.plot = { x: m, y: m, w: W - 2 * m, h: ph };
      const y2 = 2 * m + ph, h2 = H - y2 - m, hw = (W - 3 * m) / 2;
      box.cyl = { x: m, y: y2, w: hw, h: h2 };
      box.sank = { x: 2 * m + hw, y: y2, w: hw, h: h2 };
    }
    const p = box.plot, fsc = (window.LabSettings && +window.LabSettings.get('fs')) || 1;
    const ml = Math.round(44 * Math.min(1.25, fsc)), mb = Math.round(34 * Math.min(1.2, fsc));
    box.pa = { x: p.x + ml, y: p.y + 26, w: p.w - ml - 14, h: p.h - 26 - mb };
  }
  function resize() {
    const w = cv.clientWidth || 600, h = canvasH(w);
    cv.style.height = h + 'px';
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = w; H = h;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    layout();
    layerKey = '';
    requestDraw();
  }
  const X = function (V) { return box.pa.x + V / axis.V * box.pa.w; };
  const Y = function (P) { return box.pa.y + box.pa.h - P / axis.P * box.pa.h; };
  const invV = function (x) { return (x - box.pa.x) / box.pa.w * axis.V; };
  const invP = function (y) { return (box.pa.y + box.pa.h - y) / box.pa.h * axis.P; };

  // =====================================================================
  // 靜態圖層（背景、面板、P–V 圖的格線、等溫線、循環路徑與面積、能量流）
  // =====================================================================
  const layer = document.createElement('canvas');
  let layerKey = '';
  function panel(g, b, title, parts) {
    D.roundRect(g, b.x, b.y, b.w, b.h, 10);
    g.fillStyle = D.alpha(D.c.surface, D.dark ? 0.35 : 0.55); g.fill();
    g.strokeStyle = D.alpha(D.c.border || D.c.muted, D.dark ? 0.7 : 0.9); g.lineWidth = 1; g.stroke();
    if (parts) rich(g, parts, b.x + 10, b.y + 13, D.c.muted, 'left', 12);
    else if (title) D.haloText(g, title, b.x + 10, b.y + 13, D.c.muted, 'left', 'middle', font(12));
  }
  function buildLayer() {
    const key = [W, H, dpr, cycKey, D.ver, st.show.iso, st.show.fill, axis.V, axis.P, window.LabSettings && window.LabSettings.lang, st.type === 'custom' ? JSON.stringify(st.custom) : ''].join('|');
    if (key === layerKey) return;
    layerKey = key;
    layer.width = cv.width; layer.height = cv.height;
    const g = layer.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(g, W, H);
    panel(g, box.cyl, T('汽缸（示意）', 'Cylinder (sketch)'));
    panel(g, box.sank, T('能量流（每一圈）', narrow ? 'Energy per cycle' : 'Energy flow (per cycle)'));
    drawPlotStatic(g);
    drawSankey(g);
  }

  // ---------------- P–V 圖 ----------------
  function drawPlotStatic(g) {
    const pa = box.pa;
    // 圖框底色
    g.save();
    D.roundRect(g, pa.x, pa.y, pa.w, pa.h, 4);
    g.fillStyle = D.alpha(D.c.surface, D.dark ? 0.25 : 0.7); g.fill();
    g.restore();
    // 兩級格線（V、P 兩個方向的間距不同，自己畫）
    g.save();
    const snap = function (v) { return (Math.round(v * dpr) + 0.5) / dpr; };
    [[5, D.dark ? 0.045 : 0.04], [1, D.dark ? 0.1 : 0.09]].forEach(function (lv) {
      g.strokeStyle = D.alpha(D.c.text, lv[1]); g.lineWidth = 1 / dpr; g.beginPath();
      const sv = axis.sV / lv[0], sp = axis.sP / lv[0];
      for (let v = sv; v < axis.V - 1e-9; v += sv) { const x = snap(X(v)); g.moveTo(x, pa.y); g.lineTo(x, pa.y + pa.h); }
      for (let p = sp; p < axis.P - 1e-9; p += sp) { const y = snap(Y(p)); g.moveTo(pa.x, y); g.lineTo(pa.x + pa.w, y); }
      g.stroke();
    });
    g.restore();
    // 座標軸
    g.save();
    g.strokeStyle = D.alpha(D.c.text, 0.55); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(pa.x, pa.y - 4); g.lineTo(pa.x, pa.y + pa.h); g.lineTo(pa.x + pa.w + 4, pa.y + pa.h); g.stroke();
    // 刻度
    g.fillStyle = D.c.muted; g.font = font(11, '500');
    g.textAlign = 'center'; g.textBaseline = 'top';
    const vt = axis.sV, ptk = axis.sP;
    for (let v = 0; v <= axis.V + 1e-9; v += vt) {
      const x = X(v);
      g.strokeStyle = D.alpha(D.c.text, 0.5); g.beginPath(); g.moveTo(x, pa.y + pa.h); g.lineTo(x, pa.y + pa.h + 4); g.stroke();
      g.fillText(fmtTick(v, vt), x, pa.y + pa.h + 6);
    }
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let p = 0; p <= axis.P + 1e-9; p += ptk) {
      const y = Y(p);
      g.beginPath(); g.moveTo(pa.x - 4, y); g.lineTo(pa.x, y); g.stroke();
      g.fillText(fmtTick(p, ptk), pa.x - 6, y);
    }
    g.restore();
    // 軸名
    rich(g, ['P', ' (kPa)'], pa.x - 2, box.plot.y + 11, D.c.text, 'left', 12);
    rich(g, ['V', ' (L)'], pa.x + pa.w, pa.y + pa.h + 24, D.c.text, 'right', 12);
    if (!cyc) return;
    g.save();
    D.roundRect(g, pa.x, pa.y - 2, pa.w + 2, pa.h + 2, 3);
    g.clip();
    if (st.show.iso) drawIsotherms(g);
    if (st.show.fill) drawFill(g);
    drawPath(g);
    g.restore();
    drawArrowsAndVerts(g);
  }
  function fmtTick(v, step) {
    const d = step < 1 ? (step < 0.1 ? 2 : 1) : (step % 1 ? 1 : 0);
    const s = v.toFixed(d);
    return s;
  }
  function isoLevels() {
    const nR = cyc.n * R;
    const Tview = axis.P * axis.V / nR; // 右上角的溫度
    const lo = Math.max(1, cyc.Tmin * 0.45), hi = Math.min(Tview, Math.max(cyc.Tmax * 1.6, lo * 2));
    const step = niceStep(hi - lo, 6);
    const out = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(t);
    return out;
  }
  function drawIsotherms(g) {
    const nR = cyc.n * R, pa = box.pa;
    const lv = isoLevels();
    g.save();
    g.lineWidth = 1.1;
    const labels = [];
    lv.forEach(function (Tk) {
      const k = nR * Tk; // P(kPa)·V(L) = nRT（J）
      const Vstart = Math.max(k / axis.P, axis.V * 0.002);
      if (Vstart >= axis.V) return;
      g.strokeStyle = D.alpha(tempColor(Tk), D.dark ? 0.32 : 0.36);
      g.setLineDash([]);
      g.beginPath();
      for (let i = 0; i <= 80; i++) {
        const V = Vstart * Math.pow(axis.V / Vstart, i / 80), P = k / V;
        const x = X(V), y = Y(P);
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.stroke();
      // 標示：曲線離開圖框右邊的地方（太低就放在上緣）
      const Pr = k / axis.V;
      let lx, ly, al = 'right';
      if (Y(Pr) < pa.y + pa.h - 14) { lx = pa.x + pa.w - 3; ly = Y(Pr) - 7; }
      else { lx = X(Vstart) + 4; ly = pa.y + 9; al = 'left'; }
      labels.push({ t: Math.round(Tk) + ' K', x: lx, y: ly, al: al, c: tempColor(Tk) });
    });
    // 互相太近的標示略過
    const used = [];
    labels.forEach(function (L) {
      if (used.some(function (u) { return Math.abs(u.x - L.x) < 40 && Math.abs(u.y - L.y) < 12; })) return;
      used.push(L);
      D.haloText(g, L.t, L.x, L.y, D.alpha(D.dark ? D.shade(L.c, 0.2) : D.shade(L.c, -0.25), 0.95), L.al, 'middle', font(10.5, '600'));
    });
    g.restore();
  }
  function drawFill(g) {
    g.save();
    const fillPoly = function (pts, area) {
      g.beginPath();
      pts.forEach(function (q, i) { const x = X(q.V), y = Y(q.P); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.closePath();
      const col = area >= 0 ? tok.eng : tok.fri;
      const grd = g.createLinearGradient(0, box.pa.y, 0, box.pa.y + box.pa.h);
      grd.addColorStop(0, D.alpha(col, D.dark ? 0.26 : 0.22));
      grd.addColorStop(1, D.alpha(col, D.dark ? 0.12 : 0.1));
      g.fillStyle = grd;
      g.fill();
    };
    if (cyc.type === 'custom' && cyc.crossings > 0) {
      C.loops(st.custom.map(function (a) { return { V: a[0], P: a[1] }; })).forEach(function (l) { fillPoly(l.pts, l.area * (cyc.reverse ? -1 : 1)); });
    } else {
      const all = [];
      segs.forEach(function (sg) { sg.pts.forEach(function (q) { all.push(q); }); });
      fillPoly(all, cyc.Wout);
    }
    g.restore();
  }
  function segStroke(g, sg, width, alphaMul) {
    const s = sg.s, col = KCOL(s.kind);
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    const path = function () { g.beginPath(); sg.pts.forEach(function (q, i) { const x = X(q.V), y = Y(q.P); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); };
    path();
    g.strokeStyle = D.alpha(D.c['canvas-bg'], 0.85); g.lineWidth = width + 3; g.stroke();
    if (s.kind === 'adiabat') g.setLineDash([7, 5]);
    path();
    g.strokeStyle = D.alpha(col, alphaMul == null ? 1 : alphaMul); g.lineWidth = width; g.stroke();
    if (s.kind !== 'adiabat') {
      path();
      g.strokeStyle = D.alpha(D.shade(col, 0.55), D.dark ? 0.3 : 0.45); g.lineWidth = Math.max(0.8, width * 0.3);
      g.translate(0, -width * 0.18); g.stroke();
    }
    g.restore();
  }
  function drawPath(g) { segs.forEach(function (sg) { segStroke(g, sg, 3); }); }
  function arrowHead(g, x, y, ux, uy, size, col) {
    const nx = -uy, ny = ux;
    g.save();
    g.beginPath();
    g.moveTo(x + ux * size, y + uy * size);
    g.lineTo(x - ux * size * 0.6 + nx * size * 0.62, y - uy * size * 0.6 + ny * size * 0.62);
    g.lineTo(x - ux * size * 0.25, y - uy * size * 0.25);
    g.lineTo(x - ux * size * 0.6 - nx * size * 0.62, y - uy * size * 0.6 - ny * size * 0.62);
    g.closePath();
    g.lineJoin = 'round';
    g.strokeStyle = D.alpha(D.c['canvas-bg'], 0.9); g.lineWidth = 3; g.stroke();
    g.fillStyle = col; g.fill();
    g.restore();
  }
  function vertScreen() { return cyc.verts.map(function (s) { return { x: X(s.V * 1e3), y: Y(s.P / 1e3) }; }); }
  function drawArrowsAndVerts(g) {
    // 方向箭頭：每段路徑長度的中點
    segs.forEach(function (sg) {
      const pts = sg.pts.map(function (q) { return [X(q.V), Y(q.P)]; });
      let L = 0; const cum = [0];
      for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(L); }
      if (L < 18) return;
      const h = L / 2;
      let i = 1; while (i < cum.length - 1 && cum[i] < h) i++;
      const t = (h - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
      const x = pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]), y = pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1]);
      const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], d = Math.hypot(dx, dy) || 1;
      arrowHead(g, x, y, dx / d, dy / d, 7.5, KCOL(sg.s.kind));
    });
    if (st.type === 'custom') return; // 自訂的頂點在動態層畫（可拖曳）
    const vs = vertScreen(), cx = vs.reduce(function (a, v) { return a + v.x; }, 0) / vs.length, cy = vs.reduce(function (a, v) { return a + v.y; }, 0) / vs.length;
    vs.forEach(function (v, i) {
      D.ball(g, v.x, v.y, 4.2, D.c.text, { glow: 0 });
      let dx = v.x - cx, dy = v.y - cy; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const lx = clamp(v.x + dx * 14, box.pa.x + 8, box.pa.x + box.pa.w - 8), ly = clamp(v.y + dy * 14, box.pa.y + 8, box.pa.y + box.pa.h - 8);
      D.haloText(g, String(i + 1), lx, ly, D.c.text, 'center', 'middle', font(12, '700'));
    });
  }

  // ---------------- 能量流（每一圈） ----------------
  function bandGrad(g, x0, y0, x1, y1, col) {
    const grd = g.createLinearGradient(x0, y0, x1, y1);
    grd.addColorStop(0, D.alpha(col, D.dark ? 0.8 : 0.72));
    grd.addColorStop(1, D.alpha(col, D.dark ? 0.55 : 0.5));
    return grd;
  }
  /** 水平帶子：左端中心 (x0, y0)、右端中心 (x1, y1)，寬度 h 不變（能量守恆：帶寬∝能量） */
  function hband(g, x0, y0, x1, y1, h, col) {
    if (h < 0.4) return;
    const mx = (x0 + x1) / 2;
    g.save();
    g.beginPath();
    g.moveTo(x0, y0 - h / 2);
    g.bezierCurveTo(mx, y0 - h / 2, mx, y1 - h / 2, x1, y1 - h / 2);
    g.lineTo(x1, y1 + h / 2);
    g.bezierCurveTo(mx, y1 + h / 2, mx, y0 + h / 2, x0, y0 + h / 2);
    g.closePath();
    g.fillStyle = bandGrad(g, x0, y0, x1, y1, col); g.fill();
    g.strokeStyle = D.alpha(D.shade(col, -0.3), 0.45); g.lineWidth = 1; g.stroke();
    g.restore();
  }
  /** 垂直帶子：中心 x、由 y0 到 y1、寬 w，末端畫成箭頭 */
  function vband(g, x, y0, y1, w, col, headAtEnd) {
    if (w < 0.4) return;
    const dir = Math.sign(y1 - y0) || 1, hd = headAtEnd ? Math.min(10, Math.abs(y1 - y0) * 0.3) : 0;
    g.save();
    g.beginPath();
    g.moveTo(x - w / 2, y0); g.lineTo(x - w / 2, y1 - dir * hd);
    if (hd) { g.lineTo(x - w / 2 - 4, y1 - dir * hd); g.lineTo(x, y1); g.lineTo(x + w / 2 + 4, y1 - dir * hd); }
    g.lineTo(x + w / 2, y1 - dir * hd); g.lineTo(x + w / 2, y0);
    g.closePath();
    g.fillStyle = bandGrad(g, x, y0, x, y1, col); g.fill();
    g.strokeStyle = D.alpha(D.shade(col, -0.3), 0.45); g.lineWidth = 1; g.stroke();
    g.restore();
  }
  /** 水平帶子末端的箭頭 */
  function hhead(g, x, y, h, col) {
    if (h < 0.4) return;
    g.save();
    g.beginPath(); g.moveTo(x, y - h / 2 - 4); g.lineTo(x + 10, y); g.lineTo(x, y + h / 2 + 4); g.closePath();
    g.fillStyle = D.alpha(col, D.dark ? 0.6 : 0.55); g.fill();
    g.restore();
  }
  function drawSankey(g) {
    if (!cyc) return;
    const b = box.sank, top = b.y + 28, bot = b.y + b.h - 10;
    const small = b.w < 210, px = small ? 10.5 : 11.5;
    const rev = cyc.fridge;
    const inQ = cyc.Qin, outQ = cyc.Qout, Wm = Math.abs(cyc.Wout);
    const big = Math.max(inQ, outQ, Wm, 1e-9);
    const ew = small ? 42 : 52, eh = Math.max(34, Math.min(56, (bot - top) * 0.34));
    const maxBand = Math.min(eh - 6, Math.max(10, (bot - top) * 0.26));
    const k = maxBand / big, hw = function (E) { return Math.max(E > big * 1e-3 ? 1.5 : 0, E * k); };
    const lx = b.x + 10, rx = b.x + b.w - 20, ph = px + 7;
    const ex = b.x + b.w * 0.5, midY = top + (bot - top) * 0.44, ey = midY - eh / 2;
    const vEnd = bot - ph - 6;                       // 垂直帶子停在下方標籤的上面
    /** 上方兩個標籤：左邊貼左帶子、右邊貼右帶子；放不下同一列時，左邊的往上移一列 */
    function topPills(L, R, yl, yr, cl, cr) {
      const wl = richW(g, L, px) + 12, wr = richW(g, R, px) + 12;
      const clash = wl + wr + 10 > b.w - 16 && Math.abs(yl - yr) < ph + 2;
      richPill(g, L, lx, clash ? Math.min(yl, yr) - ph - 4 : yl, cl, px, 'left');
      richPill(g, R, b.x + b.w - 8, yr, cr, px, 'right');
    }
    if (!rev) {
      // 熱機：Q_in 從左邊（高溫）進來，W_out 從右邊出去，|Q_out| 往下（低溫）出去；帶寬∝能量
      const hin = hw(inQ), hW = hw(Wm), hout = hw(outQ);
      hband(g, lx, midY, ex - ew / 2, midY, hin, tok.hot);
      const wy = midY - hin / 2 + hW / 2;
      hband(g, ex + ew / 2, wy, rx, wy, hW, D.c.accent); hhead(g, rx, wy, hW, D.c.accent);
      vband(g, ex, ey + eh, vEnd, hout, tok.cold, true);
      engineBox(g, ex, ey, ew, eh, T('引擎', 'Engine'), small);
      topPills(['Q', ['in'], ' ' + fJ(inQ) + ' J'], ['W', ['out'], ' ' + fJ(cyc.Wout) + ' J'], midY - hin / 2 - 5, wy - hW / 2 - 5, tok.hot, D.c.accent);
      richPill(g, ['|Q', ['out'], '| ' + fJ(outQ) + ' J'], ex, bot, tok.cold, px, 'center');
    } else {
      // 冰箱／熱泵：W_in 從左邊進來，Q_c 從下面（低溫）進來，|Q_h| 從右邊（高溫）出去
      const hW = hw(Wm), hc = hw(inQ), hh = hw(outQ);
      const wy = midY - hh / 2 + hW / 2;
      hband(g, lx, wy, ex - ew / 2, wy, hW, D.c.accent);
      vband(g, ex, vEnd, ey + eh, hc, tok.cold, false);
      hband(g, ex + ew / 2, midY, rx, midY, hh, tok.hot); hhead(g, rx, midY, hh, tok.hot);
      engineBox(g, ex, ey, ew, eh, T('冰箱', 'Fridge'), small);
      topPills(['W', ['in'], ' ' + fJ(Wm) + ' J'], ['|Q', ['h'], '| ' + fJ(outQ) + ' J'], wy - hW / 2 - 5, midY - hh / 2 - 5, D.c.accent, tok.hot);
      richPill(g, ['Q', ['c'], ' ' + fJ(inQ) + ' J'], ex, bot, tok.cold, px, 'center');
    }
    if (cyc.Qinternal > 0) { // 回熱器：寫在引擎右下方的空位（兩行）
      const tx = ex + ew / 2 + 8, ty = ey + eh + 12, fnt = font(10.5, '600');
      D.haloText(g, small ? T('回熱器', 'Regen.') : T('回熱器交換', 'Regenerator'), tx, ty, tok.regen, 'left', 'middle', fnt);
      D.haloText(g, fJ(cyc.Qinternal) + ' J', tx, ty + 14, tok.regen, 'left', 'middle', fnt);
    }
  }
  function engineBox(g, x, y, w, h, text, small) {
    D.block(g, x - w / 2, y, w, h, D.dark ? '#46535c' : '#5f6d79', { r: 8 });
    g.save(); g.fillStyle = '#ffffff'; g.font = font(small ? 10.5 : 11.5, '700'); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, x, y + h / 2); g.restore();
  }

  // =====================================================================
  // 動態：狀態點、汽缸、自訂頂點
  // =====================================================================
  function cycVmax() { let m = 0; segs.forEach(function (sg) { sg.pts.forEach(function (q) { if (q.V > m) m = q.V; }); }); return m || axis.V; }
  function curState() {
    if (!cyc) return null;
    const s = cyc.segs[anim.seg] || cyc.segs[0];
    const q = s.at(anim.u);
    return { V: q.V * 1e3, P: q.P / 1e3, T: q.T, seg: s, i: anim.seg };
  }
  function stageName(s, i) {
    const m = cyc.segs.length, a = i + 1, b = (i + 1) % m + 1;
    return a + '→' + b + ' ' + procName(s);
  }
  function procName(s) {
    const exp = s.B.V > s.A.V, hot = s.B.T > s.A.T;
    switch (s.kind) {
      case 'isoT': return exp ? T('等溫膨脹', 'isothermal expansion') : T('等溫壓縮', 'isothermal compression');
      case 'adiabat': return exp ? T('絕熱膨脹', 'adiabatic expansion') : T('絕熱壓縮', 'adiabatic compression');
      case 'isoV': return hot ? T('等容加熱', 'constant-volume heating') : T('等容冷卻', 'constant-volume cooling');
      case 'isoP': return exp ? T('等壓膨脹', 'constant-pressure expansion') : T('等壓壓縮', 'constant-pressure compression');
      default: return exp ? T('直線膨脹', 'straight-line expansion') : T('直線壓縮', 'straight-line compression');
    }
  }
  /** 汽缸底下的東西：熱庫、絕熱墊、燃燒、加熱器、冷卻、回熱器 */
  function baseOf(s, u) {
    if (s.kind === 'adiabat') return { k: 'insul' };
    if (s.internal) return { k: 'regen' };
    if (s.kind === 'isoT') {
      const hotT = Math.abs(s.A.T - cyc.Tmax) < 1e-6 * cyc.Tmax;
      return { k: hotT ? 'hot' : 'cold', T: s.A.T };
    }
    const q = s.dQdu(u);
    if (Math.abs(q) < 1e-9 * maxRate) return { k: 'none' };
    if (q > 0) return { k: s.role === 'burn' && !cyc.reverse ? 'burn' : 'heater' };
    return { k: 'cooler' };
  }
  // 分子（示意）
  const MOL = [];
  (function () {
    let sd = 7;
    const rnd = function () { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
    for (let i = 0; i < 26; i++) { const a = rnd() * Math.PI * 2; MOL.push({ x: 0.08 + 0.84 * rnd(), y: 0.08 + 0.84 * rnd(), vx: Math.cos(a), vy: Math.sin(a) }); }
  })();
  function stepMolecules(dt, Tk) {
    if (reduced) return;
    const sp = 0.42 * Math.sqrt(Math.max(1, Tk) / 300);
    MOL.forEach(function (m) {
      m.x += m.vx * sp * dt; m.y += m.vy * sp * dt * 1.6;
      if (m.x < 0.04) { m.x = 0.08 - m.x; m.vx = Math.abs(m.vx); }
      if (m.x > 0.96) { m.x = 1.92 - m.x; m.vx = -Math.abs(m.vx); }
      if (m.y < 0.04) { m.y = 0.08 - m.y; m.vy = Math.abs(m.vy); }
      if (m.y > 0.96) { m.y = 1.92 - m.y; m.vy = -Math.abs(m.vy); }
    });
  }
  function wavyArrow(g, x, y0, y1, w, col, phase) {
    // 由 y0 到 y1 的波浪箭頭（熱流），粗細 w
    const dir = Math.sign(y1 - y0) || 1, L = Math.abs(y1 - y0), head = Math.max(6, w * 2.2);
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const t = i / n, yy = y0 + dir * t * (L - head);
      const xx = x + Math.sin(t * Math.PI * 3 + phase) * Math.min(4, 1.5 + w * 0.5);
      if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy);
    }
    g.strokeStyle = D.alpha(D.c['canvas-bg'], 0.8); g.lineWidth = w + 2.5; g.stroke();
    g.strokeStyle = col; g.lineWidth = w; g.stroke();
    g.restore();
    arrowHead(g, x, y1 - dir * head * 0.55, 0, dir, head * 0.7, col);
  }
  function drawCylinder(g, cs) {
    const b = box.cyl, s = cs.seg;
    const stageTxt = stageName(s, cs.i);
    // 標題列下方：目前這一段
    g.font = font(12);
    const titleW = g.measureText(T('汽缸（示意）', 'Cylinder (sketch)')).width;
    g.font = font(narrow ? 11 : 12, '700');
    const tw = g.measureText(stageTxt).width;
    // 放在標題右邊；和標題擠在一起時改放到標題下一列
    const px0 = b.x + b.w - tw - 18, extra = px0 < b.x + 10 + titleW + 8 ? 20 : 0;
    D.pill(g, stageTxt, Math.max(b.x + 6, px0), b.y + 24 + extra, KCOL(s.kind), 'left', font(narrow ? 11 : 12, '700'));
    // 幾何
    const top = b.y + 44 + extra, baseH = 26, bot = b.y + b.h - baseH - 26;
    const colW = narrow ? Math.max(54, b.w * 0.36) : Math.max(70, b.w * 0.36);
    const cw = Math.min(narrow ? 78 : 104, b.w - colW - 22);
    const cx = b.x + 12 + cw / 2;
    const wall = 6, ix0 = cx - cw / 2 + wall, ix1 = cx + cw / 2 - wall, pt = 11;
    const inner = bot - top - 14;
    // 活塞高度∝體積：以這個循環的最大體積為滿格（留一點頭部空間）
    const gasH = Math.max(3, inner * cs.V / (cycVmax() * 1.06));
    const gy1 = bot, gy0 = bot - gasH;
    // 氣體
    const col = tempColor(cs.T);
    const grd = g.createLinearGradient(ix0, 0, ix1, 0);
    grd.addColorStop(0, D.shade(col, -0.18)); grd.addColorStop(0.45, D.shade(col, 0.12)); grd.addColorStop(1, D.shade(col, -0.22));
    g.fillStyle = grd;
    g.fillRect(ix0, gy0, ix1 - ix0, gy1 - gy0);
    // 分子（示意）
    g.save();
    g.beginPath(); g.rect(ix0, gy0, ix1 - ix0, gy1 - gy0); g.clip();
    g.fillStyle = D.alpha('#ffffff', 0.78);
    MOL.forEach(function (m) {
      const x = ix0 + m.x * (ix1 - ix0), y = gy0 + m.y * (gy1 - gy0);
      g.beginPath(); g.arc(x, y, 1.7, 0, Math.PI * 2); g.fill();
    });
    g.restore();
    // 熱流箭頭（底部進出）
    const bs = baseOf(s, anim.u);
    if (st.show.heat && s.kind !== 'adiabat' && !s.internal) {
      const rate = s.dQdu(anim.u) / durs[cs.i];
      const f = Math.abs(rate) / maxRate;
      if (f > 0.01) {
        const w = 1.2 + 5.2 * f, colH = rate > 0 ? tok.hot : tok.cold, ph = reduced ? 0 : anim.flowT * 6;
        const y0 = rate > 0 ? bot + baseH * 0.5 : bot - 8, y1 = rate > 0 ? bot - Math.min(30, gasH * 0.8 + 6) : bot + baseH * 0.55;
        [-0.28, 0, 0.28].forEach(function (o) { wavyArrow(g, cx + o * cw, y0, y1, w, colH, ph + o * 5); });
      }
    }
    // 汽缸壁（金屬）
    const metal = tok.metal;
    [[cx - cw / 2, ix0], [ix1, cx + cw / 2]].forEach(function (p) {
      const mg = g.createLinearGradient(p[0], 0, p[1], 0);
      mg.addColorStop(0, D.shade(metal, -0.25)); mg.addColorStop(0.5, D.shade(metal, 0.35)); mg.addColorStop(1, D.shade(metal, -0.15));
      g.fillStyle = mg; g.fillRect(p[0], top, p[1] - p[0], bot - top + 4);
    });
    g.fillStyle = D.shade(metal, -0.2); g.fillRect(cx - cw / 2, bot, cw, 4);
    // 活塞與連桿
    const py = gy0 - pt;
    const rodW = Math.max(6, cw * 0.12);
    const rg = g.createLinearGradient(cx - rodW / 2, 0, cx + rodW / 2, 0);
    rg.addColorStop(0, D.shade(metal, -0.3)); rg.addColorStop(0.5, D.shade(metal, 0.45)); rg.addColorStop(1, D.shade(metal, -0.2));
    g.fillStyle = rg; g.fillRect(cx - rodW / 2, top - 10, rodW, py - top + 10);
    D.block(g, ix0, py, ix1 - ix0, pt, D.dark ? D.shade(metal, -0.1) : D.shade(metal, 0.05), { r: 2 });
    // 等容：插銷鎖住活塞
    if (s.kind === 'isoV') {
      [[cx - cw / 2 - 9, ix0 + 7], [ix1 - 7, cx + cw / 2 + 9]].forEach(function (p, j) {
        const yy = py - 5;
        g.fillStyle = D.dark ? '#d6b45a' : '#a07a1f';
        g.fillRect(p[0], yy - 2, p[1] - p[0], 4);
        const hx = j ? p[1] : p[0];
        g.beginPath(); g.arc(hx, yy, 3.6, 0, Math.PI * 2); g.fill();
      });
      const pin = T('插銷固定', 'pinned');
      g.font = font(10, '600');
      if (g.measureText(pin).width < cw / 2 - rodW / 2 - 6) D.haloText(g, pin, ix0, py - 14, D.c.muted, 'left', 'middle', font(10, '600'));
    }
    // 作功方向（活塞旁的小箭頭）
    const dVs = s.B.V - s.A.V;
    if (s.kind !== 'isoV' && Math.abs(dVs) > 0) {
      const ax = cx + rodW / 2 + 9, ay = Math.max(top + 4, py - 6);
      const up = dVs > 0;
      D.arrow(g, ax, up ? ay : ay - 20, ax, up ? ay - 20 : ay, D.c.accent, 2.2);
    }
    // 底座
    const bx = cx - cw / 2 - 8, bw = cw + 16, by = bot + 6;
    drawBase(g, bs, bx, by, bw, baseH - 6);
    // 右側讀數
    const rx = cx + cw / 2 + 12, rw = b.x + b.w - rx - 8;
    const lines = [['P', fP(cs.P) + ' kPa'], ['V', fV(cs.V) + ' L'], ['T', Math.round(cs.T) + ' K']];
    const lh = narrow ? 30 : 34, y0 = top + (bot - top) * 0.5 - lh * 1.5 + 6;
    lines.forEach(function (L, i) {
      const yy = y0 + i * lh;
      D.haloText(g, L[0], rx, yy, D.c.muted, 'left', 'middle', 'italic ' + font(narrow ? 11 : 12, '600'));
      D.haloText(g, L[1], rx, yy + 14, i === 2 ? (D.dark ? D.shade(col, 0.1) : D.shade(col, -0.25)) : D.c.text, 'left', 'middle', font(narrow ? 12 : 13.5, '700'));
    });
    void rw;
  }
  function drawBase(g, bs, x, y, w, h) {
    const k = bs.k;
    let col = D.dark ? '#475259' : '#9aa5ad', label = '', lc = D.c.muted;
    if (k === 'hot') { col = tok.hot; label = T('高溫熱庫 ', 'hot reservoir ') + Math.round(bs.T) + ' K'; lc = tok.hot; }
    else if (k === 'cold') { col = tok.cold; label = T('低溫熱庫 ', 'cold reservoir ') + Math.round(bs.T) + ' K'; lc = tok.cold; }
    else if (k === 'insul') { col = D.dark ? '#5b6670' : '#c3cbd1'; label = T('絕熱墊', 'insulating pad'); }
    else if (k === 'burn') { col = D.dark ? '#3a3f44' : '#59636b'; label = T('燃燒加熱', 'burning fuel'); lc = tok.flame; }
    else if (k === 'heater') { col = tok.hot; label = T('加熱', 'heater'); lc = tok.hot; }
    else if (k === 'cooler') { col = tok.cold; label = T('冷卻', 'cooler'); lc = tok.cold; }
    else if (k === 'regen') { col = tok.regen; label = T('回熱器（內部交換）', 'regenerator'); lc = tok.regen; }
    else { label = ''; }
    D.block(g, x, y, w, h, col, { r: 4 });
    g.save();
    D.roundRect(g, x, y, w, h, 4); g.clip();
    if (k === 'insul') { // 斜線
      g.strokeStyle = D.alpha(D.c.text, 0.22); g.lineWidth = 1.2;
      for (let i = -h; i < w; i += 7) { g.beginPath(); g.moveTo(x + i, y + h); g.lineTo(x + i + h, y); g.stroke(); }
    } else if (k === 'regen') { // 網目
      g.strokeStyle = D.alpha('#000000', 0.25); g.lineWidth = 1;
      for (let i = 4; i < w; i += 6) { g.beginPath(); g.moveTo(x + i, y); g.lineTo(x + i, y + h); g.stroke(); }
    } else if (k === 'cooler') { // 散熱鰭片
      g.fillStyle = D.alpha('#ffffff', 0.25);
      for (let i = 5; i < w - 3; i += 8) g.fillRect(x + i, y + 3, 3, h - 6);
    } else if (k === 'hot' || k === 'heater') { // 發光
      const hg = g.createLinearGradient(0, y, 0, y + h);
      hg.addColorStop(0, D.alpha('#ffffff', 0.35)); hg.addColorStop(1, D.alpha('#ffffff', 0));
      g.fillStyle = hg; g.fillRect(x, y, w, h);
    }
    g.restore();
    if (k === 'burn') { // 火焰
      const t = reduced ? 0 : anim.flowT;
      [-0.3, 0, 0.3].forEach(function (o, i) {
        const fx = x + w / 2 + o * w, fy = y + h * 0.8, fh = h * 0.95 * (0.85 + 0.15 * Math.sin(t * 13 + i * 2));
        const fg = g.createLinearGradient(0, fy - fh, 0, fy);
        fg.addColorStop(0, D.alpha('#fff3b0', 0.9)); fg.addColorStop(0.5, D.alpha(tok.flame, 0.95)); fg.addColorStop(1, D.alpha('#e2541b', 0.9));
        g.fillStyle = fg;
        g.beginPath();
        g.moveTo(fx - 5, fy);
        g.quadraticCurveTo(fx - 6, fy - fh * 0.5, fx, fy - fh);
        g.quadraticCurveTo(fx + 6, fy - fh * 0.5, fx + 5, fy);
        g.closePath(); g.fill();
      });
    }
    if (label) {
      g.font = font(10.5, '600');
      const lw = g.measureText(label).width;
      const bx = box.cyl.x + box.cyl.w / 2;
      D.pill(g, label, clamp(x + w / 2, box.cyl.x + lw / 2 + 8, box.cyl.x + box.cyl.w - lw / 2 - 8), y + h + 20, lc, 'center', font(10.5, '600'));
      void bx;
    }
  }
  function drawCustomVerts(g) {
    const vs = st.custom.map(function (a) { return { x: X(a[0]), y: Y(a[1]) }; });
    const cx = vs.reduce(function (a, v) { return a + v.x; }, 0) / vs.length, cy = vs.reduce(function (a, v) { return a + v.y; }, 0) / vs.length;
    const order = cyc.reverse ? null : null; void order;
    // 吸附參考線
    if (drag && drag.snap) {
      g.save(); g.setLineDash([4, 4]); g.strokeStyle = D.alpha(D.c.accent, 0.8); g.lineWidth = 1.2;
      drag.snap.forEach(function (sn) {
        g.beginPath();
        if (sn.k === 'V') { g.moveTo(X(sn.v), box.pa.y); g.lineTo(X(sn.v), box.pa.y + box.pa.h); }
        else { g.moveTo(box.pa.x, Y(sn.v)); g.lineTo(box.pa.x + box.pa.w, Y(sn.v)); }
        g.stroke();
      });
      g.restore();
    }
    vs.forEach(function (v, i) {
      const act = (drag && drag.i === i) || hover === i;
      if (act) {
        const gl = g.createRadialGradient(v.x, v.y, 3, v.x, v.y, 20);
        gl.addColorStop(0, D.alpha(D.c.accent, 0.45)); gl.addColorStop(1, D.alpha(D.c.accent, 0));
        g.fillStyle = gl; g.beginPath(); g.arc(v.x, v.y, 20, 0, Math.PI * 2); g.fill();
      }
      D.ball(g, v.x, v.y, act ? 8.5 : 7.5, D.c.accent);
      let dx = v.x - cx, dy = v.y - cy; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const lx = clamp(v.x + dx * 17, box.pa.x + 8, box.pa.x + box.pa.w - 8), ly = clamp(v.y + dy * 17, box.pa.y + 8, box.pa.y + box.pa.h - 8);
      D.haloText(g, String(i + 1), lx, ly, D.c.text, 'center', 'middle', font(12, '700'));
      if (kb && kb.focused() && kb.index() === i) {
        g.save(); g.strokeStyle = D.c.accent; g.lineWidth = 2; g.setLineDash([4, 3]);
        D.roundRect(g, v.x - 13, v.y - 13, 26, 26, 7); g.stroke(); g.restore();
      }
    });
  }
  function drawState(g, cs) {
    // 目前這一段加亮
    const sg = segs[cs.i];
    if (sg) {
      g.save();
      D.roundRect(g, box.pa.x, box.pa.y - 2, box.pa.w + 2, box.pa.h + 2, 3); g.clip();
      const col = KCOL(sg.s.kind);
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); sg.pts.forEach(function (q, i) { const x = X(q.V), y = Y(q.P); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.strokeStyle = D.alpha(col, 0.28); g.lineWidth = 9; g.stroke();
      g.restore();
    }
    const x = X(cs.V), y = Y(cs.P);
    // 投影到兩軸的細虛線
    g.save(); g.setLineDash([3, 4]); g.strokeStyle = D.alpha(D.c.text, 0.35); g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, box.pa.y + box.pa.h); g.moveTo(x, y); g.lineTo(box.pa.x, y); g.stroke(); g.restore();
    D.ball(g, x, y, 7, tempColor(cs.T), { glow: D.dark ? 0.5 : 0.25 });
    if (kb && kb.focused() && st.type !== 'custom') {
      g.save(); g.strokeStyle = D.c.accent; g.lineWidth = 2; g.setLineDash([4, 3]);
      D.roundRect(g, x - 13, y - 13, 26, 26, 7); g.stroke(); g.restore();
    }
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildLayer();
    ctx.drawImage(layer, 0, 0, W, H);
    if (!cyc) return;
    const cs = curState();
    drawState(ctx, cs);
    if (st.type === 'custom') drawCustomVerts(ctx);
    drawCylinder(ctx, cs);
  }

  // =====================================================================
  // 動畫與事件
  // =====================================================================
  let raf = 0, lastT = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    const dt = Math.min(1 / 30, lastT ? (now - lastT) / 1000 : 0);
    lastT = now;
    let more = false;
    if (cyc && (st.playing || anim.stepping) && !document.hidden) { advance(dt); more = true; }
    if (!reduced && !document.hidden && cyc) { anim.flowT += dt; const cs = curState(); stepMolecules(dt, cs.T); more = true; }
    if (!stage.classList.contains('is3d')) draw();
    else if (view3 && view3.active) view3.update();
    if (more && !document.hidden) requestDraw(); else lastT = 0;
    liveSr(now);
  }
  function speed() { return val(el.speed) || 1; }
  function advance(dt) {
    let left = dt * speed();
    let guard = 0;
    while (left > 0 && guard++ < 20) {
      const d = durs[anim.seg] || 1;
      const need = (1 - anim.u) * d;
      if (left < need) { anim.u += left / d; anim.lapAcc += left / d / cyc.segs.length; left = 0; break; }
      left -= need;
      anim.lapAcc += (1 - anim.u) / cyc.segs.length;
      anim.u = 1;
      segmentDone();
      if (anim.stepping) { anim.stepping = false; st.playing = false; updatePlay(); break; }
    }
  }
  function segmentDone() {
    const s = cyc.segs[anim.seg];
    if (userActed) {
      emit('segment', { type: cyc.type, kind: s.kind, role: s.role, index: anim.seg, Q: s.Q, W: s.W, dU: s.dU, dS: s.dS,
        from: { P: s.A.P / 1e3, V: s.A.V * 1e3, T: s.A.T }, to: { P: s.B.P / 1e3, V: s.B.V * 1e3, T: s.B.T }, reverse: cyc.reverse });
    }
    anim.seg = (anim.seg + 1) % cyc.segs.length;
    anim.u = 0;
    markRow();
    const ns = cyc.segs[anim.seg];
    if (ns.role === 'burn' && !cyc.reverse && (cyc.type === 'otto' || cyc.type === 'diesel')) ignite();
    if (anim.lapAcc >= 1 - 1e-9) {
      anim.lapAcc -= 1;
      if (anim.lapAcc < 1e-9) anim.lapAcc = 0;
      lapDone();
    }
  }
  let laps = 0, saidKey = '';
  function lapDone() {
    laps++;
    chime();
    if (!userActed) return;
    const d = Object.assign(C.report(cyc), { laps: laps });
    emit('cycle', d);
    if (saidKey === cycKey) return; // 同一組設定只播報第一圈，避免每 8 秒打斷螢幕報讀
    saidKey = cycKey;
    say(cyc.fridge
      ? T('轉完一圈：冷凍機性能係數 K_R = ', 'One cycle done: refrigerator COP K_R = ') + fCop(cyc.KR) + T('，輸入功 ', ', work put in ') + fJ(cyc.Win) + ' J'
      : T('轉完一圈：淨功 ', 'One cycle done: net work ') + fJ(cyc.Wout) + T(' J，效率 ', ' J, efficiency ') + (cyc.engine ? fPct(cyc.eta) : '—'));
  }
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  const statusEl = $('status');
  function say(t) { statusEl.textContent = t; }
  let srT = 0;
  function liveSr(now) {
    if (now - srT < 1000 || !cyc) return;
    srT = now;
    const cs = curState();
    const t = stageName(cs.seg, cs.i) + T('：P = ', ': P = ') + fP(cs.P) + ' kPa, V = ' + fV(cs.V) + ' L, T = ' + Math.round(cs.T) + ' K';
    const s = $('srState');
    if (s.textContent !== t) s.textContent = t;
  }

  // ---------------- 音效 ----------------
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function ignite() {
    const S = sound(); if (!S || !st.playing) return;
    S.noise({ dur: 0.07, gain: 0.45, filter: 2600, q: 0.9 });
    S.tone({ freq: 520, dur: 0.06, type: 'triangle', gain: 0.18 });
  }
  function chime() {
    const S = sound(); if (!S || !(st.playing || anim.stepping)) return;
    S.tone({ freq: 784, dur: 0.14, type: 'sine', gain: 0.12 });
    setTimeout(function () { const S2 = sound(); if (S2) S2.tone({ freq: 1175, dur: 0.22, type: 'sine', gain: 0.09 }); }, 90);
  }
  function clickSound() { const S = sound(); if (!S) return; S.noise({ dur: 0.03, gain: 0.45, filter: 2400, q: 1 }); S.tone({ freq: 1150, dur: 0.05, type: 'triangle', gain: 0.2 }); }
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
    if (ev.detail && (ev.detail.name === 'fs' || ev.detail.name === 'lang')) { layout(); layerKey = ''; requestDraw(); }
  });

  // =====================================================================
  // 讀數、能量帳、比較表、圖例、提醒
  // =====================================================================
  let roKey = '';
  function rowHtml(dt, dd, cls) { return '<dt' + (cls && /sep/.test(cls) ? ' class="sep"' : '') + '>' + dt + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + dd + '</dd>'; }
  function formulaRow() {
    const g = C.gasOf(cyc.gas).gamma, p = cyc.params;
    if (cyc.reverse) return '';
    if (cyc.type === 'carnot') return rowHtml(T('公式 1 − T<sub>c</sub>/T<sub>h</sub>', 'Formula 1 − T<sub>c</sub>/T<sub>h</sub>'), fPct(C.etaCarnot(p.Th, p.Tc)));
    if (cyc.type === 'otto') return rowHtml(T('公式 1 − r<sup>1−γ</sup>', 'Formula 1 − r<sup>1−γ</sup>'), fPct(C.etaOtto(p.r, g)));
    if (cyc.type === 'diesel') return rowHtml(T('狄塞爾公式', 'Diesel formula'), fPct(C.etaDiesel(p.r, p.rc, g)));
    if (cyc.type === 'brayton') return rowHtml(T('公式 1 − r<sub>p</sub><sup>(1−γ)/γ</sup>', 'Formula 1 − r<sub>p</sub><sup>(1−γ)/γ</sup>'), fPct(C.etaBrayton(p.rp, g)));
    return '';
  }
  function updateReadouts() {
    if (!cyc) return;
    let h = '';
    if (cyc.fridge) {
      h += rowHtml(T('外界輸入的功 W<sub>in</sub>', 'Work put in W<sub>in</sub>'), fJ(cyc.Win) + ' J');
      h += rowHtml(T('從冷處吸的熱 Q<sub>c</sub>', 'Heat taken from the cold side Q<sub>c</sub>'), fJ(cyc.Qin) + ' J');
      h += rowHtml(T('送到熱處的熱 |Q<sub>h</sub>|', 'Heat delivered to the warm side |Q<sub>h</sub>|'), fJ(cyc.Qout) + ' J');
      h += rowHtml(T('冷凍機性能係數 K<sub>R</sub>', 'Refrigerator COP K<sub>R</sub>'), fCop(cyc.KR), 'em sep');
      h += rowHtml(T('熱泵性能係數 K<sub>HP</sub>', 'Heat-pump COP K<sub>HP</sub>'), fCop(cyc.KHP), 'em');
      if (isFinite(cyc.KRC)) {
        h += rowHtml(T('卡諾上限 K<sub>R</sub>', 'Carnot limit K<sub>R</sub>'), fCop(cyc.KRC));
        h += rowHtml(T('搭配的冷、熱庫', 'Matching reservoirs'), Math.round(cyc.TcEff) + ' K / ' + Math.round(cyc.ThEff) + ' K');
      } else h += rowHtml(T('卡諾上限', 'Carnot limit'), T('—（吸放熱溫度重疊）', '— (ranges overlap)'));
    } else {
      h += rowHtml(T('每圈淨功 W<sub>out</sub>', 'Net work per cycle W<sub>out</sub>'), fJ(cyc.Wout) + ' J', 'em');
      h += rowHtml(T('吸收的熱 Q<sub>in</sub>', 'Heat taken in Q<sub>in</sub>'), fJ(cyc.Qin) + ' J');
      h += rowHtml(T('放出的熱 |Q<sub>out</sub>|', 'Heat given out |Q<sub>out</sub>|'), fJ(cyc.Qout) + ' J');
      h += rowHtml(T('效率 η = W<sub>out</sub>/Q<sub>in</sub>', 'Efficiency η = W<sub>out</sub>/Q<sub>in</sub>'), cyc.engine ? fPct(cyc.eta) : '—', 'em sep');
      h += formulaRow();
      h += rowHtml(T('卡諾效率 η<sub>C</sub>', 'Carnot efficiency η<sub>C</sub>'), fPct(cyc.etaC));
      h += rowHtml('η / η<sub>C</sub>', cyc.engine ? fPct(cyc.ratio) : '—');
    }
    h += rowHtml(T('最高溫 T<sub>max</sub>', 'Highest temperature T<sub>max</sub>'), fK(cyc.Tmax), 'sep');
    h += rowHtml(T('最低溫 T<sub>min</sub>', 'Lowest temperature T<sub>min</sub>'), fK(cyc.Tmin));
    if (cyc.Qinternal > 0) h += rowHtml(T('回熱器內部交換', 'Swapped in the regenerator'), fJ(cyc.Qinternal) + ' J');
    if (h !== roKey) { roKey = h; $('readout').innerHTML = h; }
  }
  function renderTables() {
    if (!cyc) return;
    const m = cyc.segs.length;
    let h = '<thead><tr><th>' + T('段', 'Stage') + '</th><th class="proc">' + T('過程', 'Process') + '</th><th>Q (J)</th><th>W (J)</th><th>ΔU (J)</th><th>ΔS (J/K)</th></tr></thead><tbody>';
    cyc.segs.forEach(function (s, i) {
      const cls = function (x) { return Math.abs(x) < 1e-9 ? '' : x > 0 ? ' class="pos"' : ' class="neg"'; };
      const tag = s.internal ? T('（回熱器）', ' (regenerator)') : '';
      h += '<tr data-i="' + i + '"' + (i === anim.seg ? ' class="latest"' : '') + '><td>' + (i + 1) + '→' + ((i + 1) % m + 1) + '</td>' +
        '<td class="proc"><i' + (s.kind === 'adiabat' ? ' class="dash" style="color:' + KCOL(s.kind) + '"' : ' style="background:' + KCOL(s.kind) + '"') + '></i>' + procName(s) + tag + '</td>' +
        '<td' + cls(s.Q) + '>' + fJ(s.Q) + '</td><td>' + fJ(s.W) + '</td><td>' + fJ(s.dU) + '</td><td>' + fS(s.dS) + '</td></tr>';
    });
    const sc = Math.max(cyc.Qin, cyc.Qout, 1);
    const z = function (x, tol) { return Math.abs(x) < tol ? 0 : x; };
    h += '<tr class="sum"><td>Σ</td><td class="proc">' + T('一圈合計', 'Whole cycle') + '</td><td>' + fJ(cyc.Q) + '</td><td>' + fJ(cyc.W) + '</td><td>' + fJ(z(cyc.dU, 1e-9 * sc)) + '</td><td>' + fS(z(cyc.dS, 1e-9 * sc / cyc.Tmin)) + '</td></tr></tbody>';
    $('acct').innerHTML = h;
    $('woutLine').innerHTML = T('引擎對外輸出的淨功 W<sub>out</sub> = −ΣW = ΣQ = <b>', 'Net work delivered by the engine W<sub>out</sub> = −ΣW = ΣQ = <b>') + fJ(cyc.Wout) + ' J</b>' +
      (cyc.fridge ? T('（負的：外界要輸入 ', ' (negative: the outside must put in ') + fJ(cyc.Win) + T(' J 的功）', ' J of work)') : '');
    renderRec();
  }
  function markRow() {
    const rows = $('acct').querySelectorAll('tbody tr[data-i]');
    rows.forEach(function (r) { r.classList.toggle('latest', +r.getAttribute('data-i') === anim.seg); });
  }
  function typeName(t, regen) {
    const n = { carnot: T('卡諾', 'Carnot'), otto: T('奧圖', 'Otto'), diesel: T('狄塞爾', 'Diesel'), stirling: T('史特林', 'Stirling'), brayton: T('布雷頓', 'Brayton'), custom: T('自訂', 'Custom') }[t] || t;
    return n + (t === 'stirling' ? (regen ? T('（回熱）', ' (regen.)') : T('（無回熱）', ' (no regen.)')) : '');
  }
  function renderRec() {
    let h = '<thead><tr><th>#</th><th class="proc">' + T('循環', 'Cycle') + '</th><th>' + T('氣體', 'Gas') + '</th><th>n (mol)</th><th>T<sub>max</sub> (K)</th><th>T<sub>min</sub> (K)</th><th>W<sub>out</sub> (J)</th><th>Q<sub>in</sub> (J)</th><th>η ' + T('或', 'or') + ' K<sub>R</sub></th><th>η<sub>C</sub></th></tr></thead><tbody>';
    if (!st.rows.length) h += '<tr class="empty"><td colspan="10">' + T('按「記錄這個循環」把目前的循環加進來比較。', 'Press “Record this cycle” to add the current cycle here.') + '</td></tr>';
    st.rows.forEach(function (r, i) {
      h += '<tr' + (i === st.rows.length - 1 ? ' class="latest"' : '') + '><td>' + (i + 1) + '</td><td class="proc">' + typeName(r.type, r.regen) + (r.reverse ? T('・逆向', ' · reverse') : '') + '</td>' +
        '<td>' + (r.gas === 'mono' ? T('單原子', 'mono') : T('雙原子', 'di')) + '</td><td>' + r.n.toFixed(2) + '</td><td>' + Math.round(r.Tmax) + '</td><td>' + Math.round(r.Tmin) + '</td>' +
        '<td>' + fJ(r.Wout) + '</td><td>' + fJ(r.Qin) + '</td><td>' + (r.fridge ? 'K<sub>R</sub> ' + fCop(r.KR) : r.engine ? fPct(r.eta) : '—') + '</td><td>' + fPct(r.etaC) + '</td></tr>';
    });
    $('rec').innerHTML = h + '</tbody>';
  }
  function legend() {
    if (!cyc) return;
    const kinds = [];
    cyc.segs.forEach(function (s) { if (kinds.indexOf(s.kind) < 0) kinds.push(s.kind); });
    const names = { isoT: T('等溫', 'isothermal'), adiabat: T('絕熱', 'adiabatic'), isoV: T('等容', 'constant volume'), isoP: T('等壓', 'constant pressure'), line: T('直線', 'straight line') };
    let h = kinds.map(function (k) {
      return '<span><i' + (k === 'adiabat' ? ' class="dash" style="color:' + KCOL(k) + '"' : ' style="background:' + KCOL(k) + '"') + '></i>' + names[k] + '</span>';
    }).join('');
    h += '<span><i class="fill" style="background:' + tok.eng + '"></i>' + T('順時針：熱機（淨功 > 0）', 'clockwise: engine (net work > 0)') + '</span>';
    h += '<span><i class="fill" style="background:' + tok.fri + '"></i>' + T('逆時針：冰箱（淨功 < 0）', 'anticlockwise: refrigerator (net work < 0)') + '</span>';
    $('legend').innerHTML = h;
    $('hint2').textContent = st.type === 'custom'
      ? T('拖曳 P–V 圖上的頂點改變循環；點一下畫布後，可用 Enter 選頂點、方向鍵移動（Shift 移動較多）、R 記錄、P 播放或暫停。', 'Drag the corners on the P–V diagram. After clicking the canvas: Enter picks a corner, arrow keys move it (Shift for bigger steps), R records, P plays or pauses.')
      : T('點一下畫布後，左右方向鍵可以跳到前一段或下一段的起點，R 記錄、P 播放或暫停。', 'After clicking the canvas, the left and right arrow keys jump to the start of the previous or next stage; R records, P plays or pauses.');
  }
  function warn() {
    let t = '';
    if (!cyc) return;
    const g1 = C.gasOf(cyc.gas).gamma - 1;
    if (!cyc.reverse && !cyc.engine && st.type !== 'custom') {
      if (st.type === 'otto' || st.type === 'diesel') {
        const p = cyc.params, T2 = p.T1 * Math.pow(p.r, g1);
        t = T('燃燒後的溫度不比壓縮後的 T2 ≈ ', 'The temperature after burning is not above T2 ≈ ') + Math.round(T2) + T(' K 高：加熱段變成放熱，這已經不是熱機。', ' K reached by compression: the “heating” stage gives heat out, so this is no longer an engine.');
      } else if (st.type === 'brayton') {
        const p = cyc.params, T2 = p.T1 * Math.pow(p.rp, g1 / (g1 + 1));
        t = T('渦輪入口溫度不比壓縮後的 T2 ≈ ', 'The turbine inlet temperature is not above T2 ≈ ') + Math.round(T2) + T(' K 高：這已經不是熱機。', ' K reached by compression, so this is no longer an engine.');
      }
    }
    if (st.type === 'custom') {
      if (cyc.Tmin < 60) t = T('最低溫只有 ', 'The lowest temperature is only ') + Math.round(cyc.Tmin) + T(' K：真實氣體在這麼低的溫度早已液化，理想氣體模型不適用。', ' K: a real gas would have liquefied long before, so the ideal-gas model no longer applies.');
      else if (cyc.Tmax > 4000) t = T('最高溫達 ', 'The highest temperature reaches ') + Math.round(cyc.Tmax) + T(' K：真實氣體的分子會解離，理想氣體模型只是粗略的近似。', ' K: real molecules would break apart, so the ideal-gas model is only a rough guide.');
    }
    $('warn').textContent = t;
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  function outs() {
    $('no').textContent = val(el.n).toFixed(2) + ' mol';
    ['cTh', 'cTc', 'oT1', 'oT3', 'dT1', 'sTh', 'sTc', 'bT1', 'bT3'].forEach(function (k) { $(k + 'o').textContent = Math.round(val(el[k])) + ' K'; });
    ['cVA', 'oV1', 'dV1', 'sVmin'].forEach(function (k) { $(k + 'o').textContent = val(el[k]).toFixed(2) + ' L'; });
    $('cRBo').textContent = val(el.cRB).toFixed(2);
    $('oRo').textContent = val(el.oR).toFixed(2);
    $('dRo').textContent = val(el.dR).toFixed(2);
    $('dRco').textContent = val(el.dRc).toFixed(3);
    $('sRo').textContent = val(el.sR).toFixed(2);
    $('bRpo').textContent = val(el.bRp).toFixed(2);
    $('bP1o').textContent = Math.round(val(el.bP1)) + ' kPa';
    $('speedo').textContent = val(el.speed).toFixed(2) + '×';
  }
  /** T_c 一定要比 T_h 低（至少 1 K）：改哪一個就推動另一個 */
  function keepOrder(hot, cold, changed) {
    const th = val(el[hot]), tc = val(el[cold]);
    if (tc <= th - 1) return;
    if (changed === hot) setVal(el[cold], Math.max(+el[cold].min, th - 1));
    else setVal(el[hot], Math.min(+el[hot].max, tc + 1));
  }
  let busy = false;
  function onParam(user) {
    if (busy) return;
    busy = true;
    outs();
    // 打開分享連結還原設定時不算使用者操作（之後轉完一圈也不送任務事件）
    if (user && !(window.LabShare && window.LabShare.restoring)) userActed = true;
    recompute();
    busy = false;
    requestDraw();
  }
  ids.forEach(function (k) {
    el[k].addEventListener('input', function () {
      if (k === 'cTh' || k === 'cTc') { busy = true; keepOrder('cTh', 'cTc', k); busy = false; }
      if (k === 'sTh' || k === 'sTc') { busy = true; keepOrder('sTh', 'sTc', k); busy = false; }
      onParam(k !== 'speed');
    });
  });
  ['reverse', 'regen'].forEach(function (k) { $(k).addEventListener('change', function () { onParam(true); }); });
  [['showIso', 'iso'], ['showFill', 'fill'], ['showHeat', 'heat']].forEach(function (p) {
    $(p[0]).addEventListener('change', function () { st.show[p[1]] = $(p[0]).checked; layerKey = ''; requestDraw(); });
  });
  [['s3surf', 'surf'], ['s3iso', 'iso'], ['s3proj', 'proj']].forEach(function (p) {
    $(p[0]).addEventListener('change', function () { st.show3[p[1]] = $(p[0]).checked; if (view3 && view3.active) view3.update(); });
  });
  function setType(t, user) {
    if (TYPES.indexOf(t) < 0) return;
    st.type = t;
    TYPES.forEach(function (k) { $(TBTN[k]).setAttribute('aria-pressed', String(k === t)); $(PBOX[k]).hidden = k !== t; });
    $('parTitle').textContent = { carnot: T('卡諾循環的參數', 'Carnot cycle'), otto: T('奧圖循環的參數', 'Otto cycle'), diesel: T('狄塞爾循環的參數', 'Diesel cycle'), stirling: T('史特林循環的參數', 'Stirling cycle'), brayton: T('布雷頓循環的參數', 'Brayton cycle'), custom: T('自訂循環', 'Custom cycle') }[t];
    anim.seg = 0; anim.u = 0;
    axV = null; axP = null;
    cv.classList.toggle('grab', false);
    syncKeys();
    onParam(user);
  }
  TYPES.forEach(function (k) { $(TBTN[k]).addEventListener('click', function () { setType(k, true); }); });
  function setGas(g, user) {
    st.gas = g;
    $('gMono').setAttribute('aria-pressed', String(g === 'mono'));
    $('gDi').setAttribute('aria-pressed', String(g === 'di'));
    onParam(user);
  }
  $('gMono').addEventListener('click', function () { setGas('mono', true); });
  $('gDi').addEventListener('click', function () { setGas('di', true); });
  function updatePlay() {
    $('play').textContent = st.playing ? T('暫停', 'Pause') : T('播放', 'Play');
    $('play').setAttribute('aria-pressed', String(!!st.playing));
  }
  $('play').addEventListener('click', function () { st.playing = !st.playing; anim.stepping = false; updatePlay(); lastT = 0; requestDraw(); });
  function stepOnce() {
    if (!cyc) return;
    st.playing = false; updatePlay();
    if (reduced) { // 減少動態：直接跳到這一段的終點
      anim.lapAcc += (1 - anim.u) / cyc.segs.length;
      anim.u = 1; segmentDone(); requestDraw(); return;
    }
    anim.stepping = true; lastT = 0; requestDraw();
  }
  $('step').addEventListener('click', stepOnce);

  // ---------------- 記錄與全部清除 ----------------
  function record() {
    if (!cyc) return;
    const row = C.report(cyc);
    st.rows.push(row);
    if (st.rows.length > 30) st.rows.shift();
    renderRec();
    clickSound();
    say(T('已記錄第 ', 'Recorded row ') + st.rows.length + T(' 筆：', ': ') + typeName(row.type, row.regen) + T('，', ', ') +
      (row.fridge ? T('冷凍機性能係數 K_R = ', 'refrigerator COP K_R = ') + fCop(row.KR) : T('效率 ', 'efficiency ') + (row.engine ? fPct(row.eta) : '—')));
    emit('record', { row: row, rows: st.rows.slice() });
  }
  $('record').addEventListener('click', record);
  $('clearAll').addEventListener('click', function () {
    st.rows = []; renderRec(); say(T('比較表已清除。', 'The comparison table has been cleared.'));
    emit('clear', {});
  });

  // ---------------- 自訂循環：頂點 ----------------
  function roundPt(V, P) { return [Math.round(clamp(V, VLIM[0], VLIM[1]) * 100) / 100, Math.round(clamp(P, PLIM[0], PLIM[1]))]; }
  function customChanged(user) { onParam(user); }
  $('addV').addEventListener('click', function () {
    const p = st.custom;
    if (p.length >= 6) { say(T('最多 6 個頂點。', 'At most 6 corners.')); return; }
    let best = 0, bl = -1;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length], L = Math.hypot((a[0] - b[0]) / VLIM[1], (a[1] - b[1]) / PLIM[1]);
      if (L > bl) { bl = L; best = i; }
    }
    const a = p[best], b = p[(best + 1) % p.length];
    p.splice(best + 1, 0, roundPt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2));
    syncKeys(); customChanged(true);
    say(T('加了第 ', 'Added corner ') + (best + 2) + T(' 個頂點（在最長那條邊的中點）。', ' (at the middle of the longest side).'));
  });
  $('delV').addEventListener('click', function () {
    const p = st.custom;
    if (p.length <= 3) { say(T('至少要 3 個頂點。', 'At least 3 corners are needed.')); return; }
    const i = kb && kb.focused() ? kb.index() : (lastPicked >= 0 && lastPicked < p.length ? lastPicked : p.length - 1);
    p.splice(i, 1);
    lastPicked = -1;
    syncKeys(); customChanged(true);
    say(T('刪掉了第 ', 'Removed corner ') + (i + 1) + T(' 個頂點。', '.'));
  });
  $('resetV').addEventListener('click', function () {
    st.custom = DEF_CUSTOM.map(function (a) { return a.slice(); });
    syncKeys(); customChanged(true);
  });

  // ---------------- 拖曳 ----------------
  let drag = null, hover = -1, lastPicked = -1;
  function evPos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function hitVertex(p, touch) {
    if (st.type !== 'custom' || stage.classList.contains('is3d')) return -1;
    const rr = touch ? 26 : 16;
    let best = -1, bd = rr;
    st.custom.forEach(function (a, i) { const d = Math.hypot(X(a[0]) - p.x, Y(a[1]) - p.y); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  cv.addEventListener('pointerdown', function (e) {
    const p = evPos(e), i = hitVertex(p, e.pointerType !== 'mouse');
    if (i < 0) return;
    e.preventDefault();
    drag = { i: i, id: e.pointerId, snap: null };
    lastPicked = i;
    if (kb) kb.select(i);
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    cv.classList.add('grabbing');
    requestDraw();
  });
  cv.addEventListener('pointermove', function (e) {
    const p = evPos(e);
    if (drag && e.pointerId === drag.id) {
      const pts = st.custom, i = drag.i, m = pts.length;
      let V = invV(p.x), P = invP(p.y);
      const nb = [pts[(i + m - 1) % m], pts[(i + 1) % m]];
      const snap = [];
      // 靠近相鄰頂點的同一 V 或同一 P 時吸附（9 px 內）
      let bv = 9, bp = 9, sv = null, sp = null;
      nb.forEach(function (q) {
        const dv = Math.abs(X(q[0]) - p.x), dp = Math.abs(Y(q[1]) - p.y);
        if (dv < bv) { bv = dv; sv = q[0]; }
        if (dp < bp) { bp = dp; sp = q[1]; }
      });
      if (sv != null) { V = sv; snap.push({ k: 'V', v: sv }); }
      if (sp != null) { P = sp; snap.push({ k: 'P', v: sp }); }
      const q = roundPt(V, P);
      if (sv != null) q[0] = sv;
      if (sp != null) q[1] = sp;
      drag.snap = snap;
      if (q[0] !== pts[i][0] || q[1] !== pts[i][1]) { pts[i] = q; customChanged(true); }
      else requestDraw();
      return;
    }
    const h = hitVertex(p, false);
    if (h !== hover) { hover = h; cv.classList.toggle('grab', h >= 0); requestDraw(); }
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    drag = null;
    cv.classList.remove('grabbing');
    requestDraw();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (!drag && hover >= 0) { hover = -1; cv.classList.remove('grab'); requestDraw(); } });

  // ---------------- 鍵盤 ----------------
  let kb = null;
  const kbItems = [];
  function syncKeys() {
    kbItems.length = 0;
    if (st.type === 'custom') {
      st.custom.forEach(function (a, i) {
        kbItems.push({
          name: function () { return T('頂點 ', 'Corner ') + (i + 1); },
          move: function (dx, dy, big) {
            const q = st.custom[i];
            if (!q) return false;
            const n2 = roundPt(q[0] + dx * (big ? 1 : 0.1), q[1] + dy * (big ? 50 : 10));
            if (n2[0] === q[0] && n2[1] === q[1]) return false;
            st.custom[i] = n2; lastPicked = i; customChanged(true);
            return true;
          },
          describe: function () {
            const q = st.custom[i]; if (!q) return '';
            return T('頂點 ', 'Corner ') + (i + 1) + '：V = ' + q[0].toFixed(2) + ' L, P = ' + Math.round(q[1]) + ' kPa, T = ' + Math.round(q[0] * q[1] / (val(el.n) * R)) + ' K. ' +
              (cyc ? (cyc.fridge ? 'K_R ' + fCop(cyc.KR) : T('淨功 ', 'net work ') + fJ(cyc.Wout) + ' J') : '');
          }
        });
      });
    } else {
      kbItems.push({
        name: function () { return T('狀態點', 'State'); },
        move: function (dx) {
          if (!dx || !cyc) return false;
          const m = cyc.segs.length;
          anim.seg = dx > 0 ? (anim.u > 0 ? (anim.seg + 1) % m : (anim.seg + 1) % m) : (anim.u > 0.001 ? anim.seg : (anim.seg + m - 1) % m);
          anim.u = 0; anim.lapAcc = 0;
          markRow(); requestDraw();
          return true;
        },
        describe: function () {
          const cs = curState(); if (!cs) return '';
          return stageName(cs.seg, cs.i) + T('：P = ', ': P = ') + fP(cs.P) + ' kPa, V = ' + fV(cs.V) + ' L, T = ' + Math.round(cs.T) + ' K';
        }
      });
    }
    if (kb && kb.index() >= kbItems.length) kb.select(0);
  }
  syncKeys();
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('熱機循環畫布：自訂循環時按 Enter 選頂點、方向鍵移動（Shift 較多）；其他循環用左右方向鍵跳到前後一段。R 記錄，P 播放或暫停。',
        'Heat-engine canvas: for a custom cycle, Enter picks a corner and the arrow keys move it (Shift for more); for the other cycles the left and right arrows jump between stages. R records, P plays or pauses.'),
      items: kbItems,
      onChange: function () { requestDraw(); }
    });
  }
  cv.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); record(); }
    else if (e.key === 'p' || e.key === 'P') { e.preventDefault(); $('play').click(); }
  });

  // =====================================================================
  // 3D 檢視（three.js 以 import() 延遲載入；場景在 heat-engine-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const viewMsg = $('viewMsg');
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function state3() {
    const cs = curState();
    return { cyc: cyc, key: cycKey, axis: axis, Trng: Trng, cur: cs, seg: anim.seg, show3: st.show3, isoLevels: cyc ? isoLevels() : [], plasma: plasma, tempColor: tempColor };
  }
  function setPressed3(mode) { $('view2d').setAttribute('aria-pressed', String(mode === '2d')); $('view3d').setAttribute('aria-pressed', String(mode === '3d')); }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed3('3d');
      if (!webglAvailable() || !window.HeatEngine3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        view3 = window.HeatEngine3D.create(lib, {
          host: $('view3'), core: C, T: T, state: state3,
          tokens: function () { readTokens(); return Object.assign({}, tok, D.c, { dark: D.dark }); },
          lost: function () { setView('2d'); viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D。', 'The 3D graphics context was lost, so the view switched back to 2D.'); }
        });
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        view3.update();
        requestDraw();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed3('2d');
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
    setPressed3('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // =====================================================================
  // 分享連結：自訂循環的頂點（循環種類、氣體按鈕、滑桿、勾選框由 classroom.js 自動記錄）
  // =====================================================================
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { pts: st.custom.map(function (a) { return a.slice(); }) }; },
    set: function (o) {
      if (!o || !Array.isArray(o.pts)) return;
      const pts = o.pts.filter(function (a) { return Array.isArray(a) && isFinite(+a[0]) && isFinite(+a[1]); }).slice(0, 6).map(function (a) { return roundPt(+a[0], +a[1]); });
      if (pts.length < 3) return;
      st.custom = pts;
      syncKeys(); onParam(false);
    }
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  function onTheme() {
    readTokens(); layerKey = ''; roKey = '';
    legend(); renderTables(); updateReadouts();
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  window.addEventListener('lab:themechange', onTheme);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', onTheme);
  }
  window.addEventListener('lab:langchange', function () { layerKey = ''; roKey = ''; setType(st.type, false); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastT = 0; requestDraw(); } });
  outs(); updateSoundButton(); updatePlay();
  setType('carnot', false);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
  }
  window.addEventListener('resize', resize);
  resize();
  // 測試介面（Playwright、縮圖用）
  window.__he = { st: st, anim: anim, cyc: function () { return cyc; }, record: record, setType: setType, setGas: setGas, step: stepOnce, recompute: recompute, axis: function () { return axis; },
    xy: function (V, P) { return { x: X(V), y: Y(P) }; }, view3: function () { return view3; } };
})();
