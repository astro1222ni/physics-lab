/* ac-generator.js — 「交流發電機與變壓器」頁面程式
 * 物理全部在 js/ac-generator-core.js（解析式）；3D 場景在 js/ac-generator-3d.js（three.js 延遲載入）。
 * 三個模式：發電機（斜視圖＋端視圖＋示波器）、變壓器（鐵心與線圈＋示波器）、遠距輸電（示意圖＋能量條＋電壓沿途）。
 * 動畫是慢動作：畫面上的轉速只是示意，示波器的時間軸是真實時間。
 */
(function () {
  'use strict';
  const C = window.ACGeneratorCore, D = window.LabDraw;
  if (!C || !D) return;
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const $ = function (id) { return document.getElementById(id); };
  const val = function (el) { return window.LabNum ? +window.LabNum.value(el) : +el.value; };
  const setVal = function (el, v) { if (window.LabNum) window.LabNum.set(el, v); else { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
  const clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  const FONT = D.FONT;
  const font = function (px, w) { return (w || '600') + ' ' + px + 'px ' + FONT; };
  const reduced = D.reducedMotion();
  const TAU = Math.PI * 2;
  const LAMP_FULL = 200;   // 燈泡全亮的瞬時功率（W）

  // =====================================================================
  // 狀態
  // =====================================================================
  const st = {
    mode: 'gen', comm: false, open: false, xsrc: 'ac', vrated: 110, playing: !reduced,
    theta: 0, xt: 0, rows: [], show3: { field: true, vec: true, dots: true },
    dc: { phase: 'idle', t: 0, im0: 0, pulsed: false, steadySaid: false }
  };
  let userActed = false;
  const ids = ['gN', 'gB', 'gL', 'gW', 'gF', 'gR', 'gr', 'xV', 'xF', 'xN1', 'xN2', 'xRL', 'tVg', 'tK1', 'tRl', 'tK2', 'tP'];
  const el = {};
  ids.forEach(function (k) { el[k] = $(k); });
  const cv = $('cv'), ctx = cv.getContext('2d'), stage = $('stage');
  const MODES = ['gen', 'xf', 'grid'];
  const MBTN = { gen: 'mGen', xf: 'mXf', grid: 'mGrid' }, MCARD = { gen: 'cardGen', xf: 'cardXf', grid: 'cardGrid' };

  // ---------------- 非線性（對數）滑桿 ----------------
  function logSlider(id, lo, hi, dec) {
    const k = Math.log(hi / lo);
    if (window.LabNum) window.LabNum.register(el[id], {
      toValue: function (p) { return lo * Math.exp(k * p / 1000); },
      toPos: function (v) { return 1000 * Math.log(v / lo) / k; },
      min: lo, max: hi, decimals: dec
    });
  }
  logSlider('gR', 1, 1e4, 1);
  logSlider('xRL', 1, 1e4, 2);
  logSlider('tK2', 1, 5000, 1);
  logSlider('tP', 0.1, 100, 3);
  // 預設的精確值（在加上事件處理之前設定，不算使用者操作）
  if (window.LabNum) { window.LabNum.set(el.gR, 20); window.LabNum.set(el.xRL, 50); window.LabNum.set(el.tK2, 100); window.LabNum.set(el.tP, 20); }

  // ---------------- 顏色 ----------------
  const tok = {};
  function readTokens() {
    const cs = getComputedStyle(document.documentElement);
    ['copper', 'iron', 'eps', 'phi', 'cur', 'pow', 'loss', 'use', 'v2', 'lamp'].forEach(function (k) { tok[k] = cs.getPropertyValue('--ag-' + k).trim() || '#888'; });
  }
  readTokens();

  // ---------------- 數字格式 ----------------
  const minus = function (s) { s = String(s); if (/^-0(\.0+)?$/.test(s)) s = s.slice(1); return s.replace(/^-/, '−'); };
  /** 三位有效數字（不加前綴） */
  function sig3(x) {
    if (!isFinite(x)) return '—';
    const a = Math.abs(x);
    if (a === 0) return '0';
    const s = a >= 999.5 ? Math.round(x).toLocaleString('en-US') : a >= 99.95 ? x.toFixed(0) : a >= 9.995 ? x.toFixed(1) : a >= 0.9995 ? x.toFixed(2) : x.toFixed(3);
    return minus(s);
  }
  const PREF = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'μ']];
  /** 自動選前綴：fq(1234, 'W') → 1.23 kW */
  function fq(x, unit, noPrefixUp) {
    if (x === Infinity) return '∞ ' + unit;
    if (!isFinite(x)) return '— ' + unit;
    const a = Math.abs(x);
    if (a === 0) return '0 ' + unit;
    for (let i = 0; i < PREF.length; i++) {
      if (noPrefixUp && PREF[i][0] > 1) continue;
      if (a >= PREF[i][0] * 0.9995 || i === PREF.length - 1) return sig3(x / PREF[i][0]) + ' ' + PREF[i][1] + unit;
    }
    return sig3(x) + ' ' + unit;
  }
  function prefixFor(maxAbs) {
    for (let i = 0; i < PREF.length; i++) if (maxAbs >= PREF[i][0] * 0.9995) return PREF[i];
    return PREF[PREF.length - 1];
  }
  function niceUp(x) {
    if (!(x > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(x))), m = x / p;
    return (m <= 1 ? 1 : m <= 1.2 ? 1.2 : m <= 1.5 ? 1.5 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 3 ? 3 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 6 ? 6 : m <= 8 ? 8 : 10) * p;
  }
  function tickFmt(v, step) { const d = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3; return minus(v.toFixed(d)); }

  // ---------------- 文字工具（下標不用 Unicode 下標字元） ----------------
  // parts：字串＝一般文字、陣列 ['x']＝下標、物件 { sup: 'x' }＝上標
  const pTxt = function (p) { return Array.isArray(p) ? p[0] : typeof p === 'object' ? p.sup : p; };
  function rich(g, parts, x, y, color, align, px, weight) {
    const fm = font(px, weight || '600'), fs = font(Math.round(px * 0.72 * 10) / 10, weight || '600');
    let w = 0;
    const ws = parts.map(function (p) { g.font = typeof p === 'object' ? fs : fm; const v = g.measureText(pTxt(p)).width; w += v; return v; });
    let x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    parts.forEach(function (p, i) {
      const dy = Array.isArray(p) ? px * 0.28 : typeof p === 'object' ? -px * 0.32 : 0;
      D.haloText(g, pTxt(p), x0, y + dy, color, 'left', 'middle', typeof p === 'object' ? fs : fm);
      x0 += ws[i];
    });
    return w;
  }
  function richW(g, parts, px, weight) {
    const fm = font(px, weight || '600'), fs = font(Math.round(px * 0.72 * 10) / 10, weight || '600');
    let w = 0;
    parts.forEach(function (p) { g.font = typeof p === 'object' ? fs : fm; w += g.measureText(pTxt(p)).width; });
    return w;
  }
  /** 有底框的含下標標籤；align：left／center／right；(x, yb) 為底邊 */
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

  // =====================================================================
  // 參數與計算
  // =====================================================================
  function genParams() {
    return { N: val(el.gN), B: val(el.gB), L: val(el.gL) / 100, w: val(el.gW) / 100, f: val(el.gF), R: st.open ? Infinity : val(el.gR), r: val(el.gr), commutator: st.comm };
  }
  let G = null, X = null, DC = null, Q = null, key = '';
  function recompute() {
    G = C.gen(genParams());
    setGeo();
    if (box.obl) fitOblique();
    const N1 = val(el.xN1), N2 = val(el.xN2), RL = val(el.xRL);
    if (st.xsrc === 'gen') X = C.xf({ N1: N1, N2: N2, RL: RL, source: 'gen', gen: C.gen(Object.assign(genParams(), { commutator: false })) });
    else if (st.xsrc === 'dc') X = C.xf({ N1: N1, N2: N2, RL: RL, source: 'dc', V1: val(el.xV) });
    else X = C.xf({ N1: N1, N2: N2, RL: RL, source: 'ac', V1: val(el.xV), f: val(el.xF) });
    DC = C.dcStep({ N1: N1, N2: N2, RL: RL, V: val(el.xV) });
    Q = C.grid({ Vg: val(el.tVg) * 1e3, k1: val(el.tK1), Rline: val(el.tRl), k2: val(el.tK2), Prated: val(el.tP) * 1e6, Vrated: st.vrated });
    key = JSON.stringify([st.mode, genParams(), N1, N2, RL, st.xsrc, val(el.xV), val(el.xF), Q.Vg, Q.k1, Q.Rline, Q.k2, Q.Prated, Q.Vrated]);
  }
  /** 發電機的畫面轉速（圈／秒）：慢動作，f 越大轉得越快但遠比真實慢 */
  function visRate(f) { return Math.max(Math.min(f, 0.6), 0.3 * Math.pow(f, 0.35)); }
  function slowFactor(f) { return f / visRate(f); }
  function xfFreq() { return X.f || 0; }
  function dcTau() { return st.dc.phase === 'off' ? DC.tauOff : DC.tau; }
  /** 直流暫態的目前值 */
  function dcNow(t) {
    const d = st.dc;
    if (d.phase === 'on') return DC.on(t == null ? d.t : t, d.im0);
    if (d.phase === 'off') return DC.off(t == null ? d.t : t, d.im0);
    return { im: 0, vp: 0, v1: 0, v2: 0, i1: 0, i2: 0, phi: 0 };
  }
  function xfNow() {
    if (st.xsrc === 'dc') { const s = dcNow(); return { v1: s.v1, v2: s.v2, i1: s.i1, i2: s.i2, phi: s.phi, phiRef: Math.max(1e-12, DC.Lm * DC.imFinal / DC.N1) }; }
    const s = X.at(st.xt);
    return { v1: s.v1, v2: s.v2, i1: s.i1, i2: s.i2, phi: s.phi, phiRef: X.phiCore };
  }

  // =====================================================================
  // 畫布版面
  // =====================================================================
  let W = 0, H = 0, dpr = 1, narrow = false;
  const box = {};
  function fsc() { return (window.LabSettings && +window.LabSettings.get('fs')) || 1; }
  function canvasH(w) {
    const nw = w < 640;
    if (st.mode === 'gen') return nw ? Math.round(w * 0.66 + w * 0.6 + 3 * 92 * Math.min(1.15, fsc()) + 40) : Math.round(clamp(w * 0.40, 250, 330) + clamp(w * 0.33, 230, 290) + 30);
    if (st.mode === 'xf') return nw ? Math.round(w * 0.86 + 200 + 30) : Math.round(clamp(w * 0.44, 270, 350) + clamp(w * 0.24, 170, 210) + 30);
    return nw ? Math.round(w * 0.78 + 170 + 190 + 40) : Math.round(clamp(w * 0.36, 240, 300) + 200 + 30);
  }
  function layout() {
    const m = 10;
    narrow = W < 640;
    if (st.mode === 'gen') {
      if (!narrow) {
        const th = Math.round(clamp(W * 0.40, 250, 330));
        const ow = Math.round((W - 3 * m) * 0.6);
        box.obl = { x: m, y: m, w: ow, h: th };
        box.end = { x: 2 * m + ow, y: m, w: W - 3 * m - ow, h: th };
        box.scope = { x: m, y: 2 * m + th, w: W - 2 * m, h: H - 3 * m - th };
      } else {
        const oh = Math.round(W * 0.66), eh = Math.round(W * 0.6);
        box.obl = { x: m, y: m, w: W - 2 * m, h: oh };
        box.end = { x: m, y: 2 * m + oh, w: W - 2 * m, h: eh };
        box.scope = { x: m, y: 3 * m + oh + eh, w: W - 2 * m, h: H - 4 * m - oh - eh };
      }
      fitOblique();
      const e = box.end, top = 26;
      const R = Math.min(e.w * (narrow ? 0.215 : 0.32), (e.h - top - (narrow ? 14 : 66)) * 0.5);
      box.endC = { x: narrow ? e.x + e.w * 0.33 : e.x + e.w / 2, y: e.y + top + (e.h - top - (narrow ? 0 : 50)) / 2, r: R };
    } else if (st.mode === 'xf') {
      const ph = narrow ? Math.round(W * 0.86) : Math.round(clamp(W * 0.44, 270, 350));
      box.pic = { x: m, y: m, w: W - 2 * m, h: ph };
      box.scope = { x: m, y: 2 * m + ph, w: W - 2 * m, h: H - 3 * m - ph };
    } else {
      const ph = narrow ? Math.round(W * 0.78) : Math.round(clamp(W * 0.36, 240, 300));
      box.pic = { x: m, y: m, w: W - 2 * m, h: ph };
      if (!narrow) {
        const bw = Math.round((W - 3 * m) * 0.56);
        box.bars = { x: m, y: 2 * m + ph, w: bw, h: H - 3 * m - ph };
        box.ladder = { x: 2 * m + bw, y: 2 * m + ph, w: W - 3 * m - bw, h: H - 3 * m - ph };
      } else {
        box.bars = { x: m, y: 2 * m + ph, w: W - 2 * m, h: 170 };
        box.ladder = { x: m, y: 3 * m + ph + 170, w: W - 2 * m, h: H - 4 * m - ph - 170 };
      }
    }
    placeHit();
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

  // ---------------- 斜視投影（發電機）：x 沿 B（向右）、y 向上、z 沿轉軸（朝向觀看者） ----------------
  const OA = 0.41, OB = 0.287;          // z 軸畫成往左下 35°、縮短一半
  // 斜視圖的尺寸：線圈依比例縮放到固定的大小（最大的一邊約 0.2），磁極貼著線圈轉動的範圍，所以預設的小線圈也看得清楚
  let GEO = null;
  function setGeo() {
    const hw0 = G.w / 2, hl0 = G.L / 2, k = 0.2 / Math.max(hw0, 0.5 * hl0, 0.05);
    const hw = hw0 * k, hl = hl0 * k;
    const gap = hw + 0.06, my = hw + 0.03, mz = hl + 0.04, ring1 = hl + 0.07;
    GEO = { k: k, hw: hw, hl: hl, gap: gap, mag: 0.14, my: my, mz: mz, ring1: ring1, ring2: ring1 + 0.055, ringT: 0.025, ringR: 0.045,
      axFront: ring1 + 0.11, axBack: -hl - 0.1, lamp: [gap + 0.14 + 0.22, -my - 0.1, mz + 0.09] };
  }
  let ob = { cx: 0, cy: 0, s: 300 };
  function fitOblique() {
    const b = box.obl, pts = [];
    [-GEO.gap - GEO.mag, GEO.gap + GEO.mag].forEach(function (x) { [-GEO.my, GEO.my].forEach(function (y) { [-GEO.mz, GEO.mz].forEach(function (z) { pts.push([x, y, z]); }); }); });
    pts.push([0, -GEO.ringR, GEO.axFront], [0, GEO.ringR, GEO.axFront], [GEO.lamp[0] + 0.07, GEO.lamp[1] - 0.06, GEO.lamp[2]], [GEO.lamp[0], GEO.lamp[1] + 0.13, GEO.lamp[2]], [0, GEO.lamp[1] - 0.02, GEO.ring1]);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    pts.forEach(function (p) { const u = p[0] - OA * p[2], v = p[1] - OB * p[2]; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); });
    const top = 30, bot = 10, side = 10;
    const s = Math.min((b.w - 2 * side) / (u1 - u0), (b.h - top - bot) / (v1 - v0));
    ob = { s: s, cx: b.x + b.w / 2 - s * (u0 + u1) / 2, cy: b.y + top + (b.h - top - bot) / 2 + s * (v0 + v1) / 2 };
  }
  function P(x, y, z) { return { x: ob.cx + ob.s * (x - OA * z), y: ob.cy - ob.s * (y - OB * z) }; }
  const depth = function (x, y, z) { return OA * x + OB * y + z; };

  // =====================================================================
  // 靜態圖層
  // =====================================================================
  const layer = document.createElement('canvas');
  let layerKey = '';
  function panel(g, b, title) {
    D.roundRect(g, b.x, b.y, b.w, b.h, 10);
    g.fillStyle = D.alpha(D.c.surface, D.dark ? 0.35 : 0.55); g.fill();
    g.strokeStyle = D.alpha(D.c.border || D.c.muted, D.dark ? 0.7 : 0.9); g.lineWidth = 1; g.stroke();
    if (title) D.haloText(g, title, b.x + 10, b.y + 14, D.c.muted, 'left', 'middle', font(12));
  }
  function buildLayer() {
    const k = [W, H, dpr, key, D.ver, window.LabSettings && window.LabSettings.lang, fsc(), st.dc.phase, st.dc.phase === 'idle' ? 0 : st.dc.im0].join('|');
    if (k === layerKey) return;
    layerKey = k;
    layer.width = cv.width; layer.height = cv.height;
    const g = layer.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(g, W, H);
    if (st.mode === 'gen') {
      panel(g, box.obl, '');
      panel(g, box.end, T('端視圖', 'End view'));
      panel(g, box.scope, '');
      drawFieldLines(g, false);     // 後半的磁力線先畫，被磁鐵擋住的部分自然蓋掉
      drawMagnets(g);
      const pb = P(0, GEO.my + 0.025, -GEO.mz);
      rich(g, ['B'], pb.x, pb.y, D.c.field, 'center', 13, '700');
      drawEndStatic(g);
      drawGenScope(g);
    } else if (st.mode === 'xf') {
      panel(g, box.pic, '');
      panel(g, box.scope, '');
      drawXfStatic(g);
      drawXfScope(g);
    } else {
      panel(g, box.pic, T('遠距輸電（示意圖，未依比例）', narrow ? 'Power line (not to scale)' : 'Long-distance transmission (sketch, not to scale)'));
      panel(g, box.bars, '');
      panel(g, box.ladder, '');
      drawGridStatic(g);
      drawBars(g);
      drawLadder(g);
    }
  }

  // ---------------- 發電機：磁鐵與磁力線 ----------------
  function face(g, pts, fill, stroke) {
    g.beginPath();
    pts.forEach(function (p, i) { if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); });
    g.closePath();
    g.fillStyle = fill; g.fill();
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
  }
  function drawMagnets(g) {
    const my = GEO.my, mz = GEO.mz;
    [[-GEO.gap - GEO.mag, -GEO.gap, D.c.pos, 'N'], [GEO.gap, GEO.gap + GEO.mag, D.c.neg, 'S']].forEach(function (m) {
      const x0 = m[0], x1 = m[1], col = m[2];
      // 接觸陰影
      const c0 = P((x0 + x1) / 2, -my, 0);
      D.contactShadow(g, c0.x, c0.y + 3, (x1 - x0) * ob.s * 1.1, 0);
      const front = [P(x0, -my, mz), P(x1, -my, mz), P(x1, my, mz), P(x0, my, mz)];
      const top = [P(x0, my, mz), P(x1, my, mz), P(x1, my, -mz), P(x0, my, -mz)];
      const right = [P(x1, -my, mz), P(x1, -my, -mz), P(x1, my, -mz), P(x1, my, mz)];
      const edge = D.alpha(D.shade(col, -0.45), 0.7);
      // 側面（暗）
      const gr = g.createLinearGradient(right[0].x, right[0].y, right[2].x, right[2].y);
      gr.addColorStop(0, D.shade(col, -0.32)); gr.addColorStop(1, D.shade(col, -0.18));
      face(g, right, gr, edge);
      // 頂面（亮）
      const gt = g.createLinearGradient(top[0].x, top[0].y, top[2].x, top[2].y);
      gt.addColorStop(0, D.shade(col, 0.32)); gt.addColorStop(1, D.shade(col, 0.12));
      face(g, top, gt, edge);
      // 正面（由上而下漸層）
      const gf = g.createLinearGradient(0, front[3].y, 0, front[0].y);
      gf.addColorStop(0, D.shade(col, 0.12)); gf.addColorStop(0.6, col); gf.addColorStop(1, D.shade(col, -0.14));
      face(g, front, gf, edge);
      // 頂邊高光
      g.strokeStyle = D.alpha(D.shade(col, 0.7), 0.6); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(front[3].x, front[3].y + 0.5); g.lineTo(front[2].x, front[2].y + 0.5); g.stroke();
      const c = P((x0 + x1) / 2, 0, mz);
      g.font = font(Math.round(clamp(ob.s * 0.09, 14, 26)), '800');
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = D.alpha('#ffffff', 0.92);
      g.fillText(m[3], c.x, c.y);
    });
  }
  const FL_Y = [-0.75, -0.375, 0, 0.375, 0.75], FL_Z = [-0.75, -0.25, 0.25, 0.75];   // 磁極高度、深度的比例
  function drawFieldLines(g, front) {
    const col = D.c.field;
    g.save();
    g.lineCap = 'round';
    FL_Z.forEach(function (zf) {
      const z = zf * GEO.mz;
      if ((z > 0) !== front) return;
      FL_Y.forEach(function (yf) {
        const y = yf * GEO.my;
        // 前半的線畫在線圈之上，但在 S 極附近會被 S 磁鐵的正面擋住：只畫到看得見的地方
        const xe = front ? GEO.gap - OA * (GEO.mz - z) : GEO.gap;
        const a = P(-GEO.gap, y, z), b = P(xe, y, z);
        g.strokeStyle = D.alpha(col, (D.dark ? 0.30 : 0.24) * (front ? 0.8 : 1));
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        // 中間的小箭頭（B 由 N 指向 S）
        const am = P(z > 0 ? -GEO.gap * 0.55 : GEO.gap * 0.45, y, z), mx = am.x, my = am.y, hs = 4;
        g.fillStyle = D.alpha(col, D.dark ? 0.5 : 0.42);
        g.beginPath(); g.moveTo(mx + hs, my); g.lineTo(mx - hs * 0.8, my - hs * 0.6); g.lineTo(mx - hs * 0.8, my + hs * 0.6); g.closePath(); g.fill();
      });
    });
    g.restore();
  }

  // ---------------- 發電機：線圈、轉軸、滑環、燈泡（每一幀） ----------------
  function coilWidth() { return clamp(2.5 + 7 * Math.sqrt(G.N / 500), 3, 10) * clamp(ob.s / 330, 0.7, 1.3); }
  function drawGenDynamic(g) {
    const th = st.theta, c = Math.cos(th), s = Math.sin(th);
    const hw = GEO.hw, hl = GEO.hl;
    const u = [-s * hw, c * hw];               // 線圈平面上、垂直轉軸的方向 × w/2
    const A1 = [u[0], u[1]], B1 = [-u[0], -u[1]];
    const now = G.at(th);
    const copper = tok.copper, wpx = coilWidth();
    const items = [];
    // 長邊（A：電流正方向 +z；B：−z）
    items.push({ d: depth(A1[0], A1[1], 0), draw: function () { coilEdge(g, P(A1[0], A1[1], -hl), P(A1[0], A1[1], hl), copper, wpx, depth(A1[0], A1[1], 0)); sideArrow(g, A1, hl, now.i, 1); } });
    items.push({ d: depth(B1[0], B1[1], 0), draw: function () { coilEdge(g, P(B1[0], B1[1], hl), P(B1[0], B1[1], -hl), copper, wpx, depth(B1[0], B1[1], 0)); sideArrow(g, B1, hl, now.i, -1); } });
    // 短邊（後面那條在最後方、前面那條在前方）
    items.push({ d: -hl - 1, draw: function () { coilEdge(g, P(A1[0], A1[1], -hl), P(B1[0], B1[1], -hl), copper, wpx, -hl - 0.3); } });
    items.push({ d: hl + 0.001, draw: function () { frontShort(g, A1, B1, hl, copper, wpx); } });
    // 轉軸（後段在線圈之後）
    items.push({ d: -hl - 0.5, draw: function () { axle(g, GEO.axBack, -hl); } });
    items.sort(function (a, b) { return a.d - b.d; });
    items.forEach(function (it) { it.draw(); });
    axle(g, hl, GEO.axFront);
    drawRings(g, th);
    drawFieldLines(g, true);
    // 面積向量
    const o = P(0, 0, 0), L = 0.17;
    const tip = P(c * L, s * L, 0);
    D.arrow(g, o.x, o.y, tip.x, tip.y, D.c.accent, 2.6, {});
    rich(g, ['A'], tip.x + (c >= 0 ? 6 : -16), tip.y - 10, D.c.accent, 'left', 13, '700');
    drawLamp(g, now);
    // 上方的即時讀數
    const b = box.obl;
    let x = b.x + 10;
    x += richPill(g, ['θ = ' + Math.round(C.degNorm(th)) + '°'], x, b.y + 24, D.c.text, 12, 'left').w + 6;
    x += richPill(g, ['ε = ' + fq(now.eps, 'V')], x, b.y + 24, tok.eps, 12, 'left').w + 6;
    const sl = slowFactor(G.f);
    if (sl > 1.05 && x < b.x + b.w - 110) richPill(g, [T('慢動作 1/', 'slow motion 1/') + (sl >= 10 ? Math.round(sl) : sl.toFixed(1))], x, b.y + 24, D.c.muted, 11.5, 'left');
  }
  function coilEdge(g, a, b, col, wpx, d) {
    // 前面亮、後面暗（表現遠近）
    const dk = clamp((d + 0.2) / 0.45, 0, 1);
    const c = D.mix(D.shade(col, -0.35), D.shade(col, 0.08), dk);
    D.tube(g, function (q) { q.moveTo(a.x, a.y); q.lineTo(b.x, b.y); }, c, wpx);
    // 纏繞的細紋
    const n = Math.min(14, Math.max(3, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 9)));
    const dx = b.x - a.x, dy = b.y - a.y, Lp = Math.hypot(dx, dy) || 1, nx = -dy / Lp, ny = dx / Lp;
    g.save();
    g.strokeStyle = D.alpha(D.shade(col, -0.55), 0.35); g.lineWidth = 0.8;
    g.beginPath();
    for (let i = 1; i < n; i++) {
      const t = i / n, x = a.x + dx * t, y = a.y + dy * t;
      g.moveTo(x - nx * wpx * 0.45 - dx / Lp, y - ny * wpx * 0.45 - dy / Lp);
      g.lineTo(x + nx * wpx * 0.45 + dx / Lp, y + ny * wpx * 0.45 + dy / Lp);
    }
    g.stroke();
    g.restore();
  }
  /** 前面的短邊：在中間斷開，兩條引線沿轉軸接到滑環（或換向器的兩片） */
  function frontShort(g, A1, B1, hl, col, wpx) {
    const a = P(A1[0], A1[1], hl), b = P(B1[0], B1[1], hl);
    const gapF = 0.12;
    const m1 = P(A1[0] * gapF, A1[1] * gapF, hl), m2 = P(B1[0] * gapF, B1[1] * gapF, hl);
    D.tube(g, function (q) { q.moveTo(a.x, a.y); q.lineTo(m1.x, m1.y); }, D.shade(col, 0.05), wpx);
    D.tube(g, function (q) { q.moveTo(b.x, b.y); q.lineTo(m2.x, m2.y); }, D.shade(col, 0.05), wpx);
    // 引線
    const z1 = st.comm ? GEO.ring1 + 0.01 : GEO.ring1 + GEO.ringT / 2, z2 = st.comm ? GEO.ring1 + 0.03 : GEO.ring2 + GEO.ringT / 2;
    const r1 = P(A1[0] * 0.05, A1[1] * 0.05, z1), r2 = P(B1[0] * 0.05, B1[1] * 0.05, z2);
    g.save();
    g.strokeStyle = D.shade(col, -0.1); g.lineWidth = 1.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(m1.x, m1.y); g.lineTo(r1.x, r1.y); g.moveTo(m2.x, m2.y); g.lineTo(r2.x, r2.y); g.stroke();
    g.restore();
  }
  function axle(g, z0, z1) {
    const a = P(0, 0, z0), b = P(0, 0, z1);
    D.tube(g, function (q) { q.moveTo(a.x, a.y); q.lineTo(b.x, b.y); }, D.mix(tok.iron, D.c.text, 0.15), Math.max(4, ob.s * 0.018));
  }
  /** 圓柱（滑環）：xy 平面的圓在斜視投影下仍是圓 */
  function ringCyl(g, z0, z1, r, col, a0, a1) {
    const c0 = P(0, 0, z0), c1 = P(0, 0, z1), R = r * ob.s;
    a0 = a0 == null ? 0 : a0; a1 = a1 == null ? TAU : a1;
    // 側面：兩圓之間的外包絡
    g.save();
    const gr = g.createLinearGradient(c1.x - R, c1.y - R, c1.x + R, c1.y + R);
    gr.addColorStop(0, D.shade(col, 0.35)); gr.addColorStop(0.5, col); gr.addColorStop(1, D.shade(col, -0.35));
    g.fillStyle = gr;
    g.beginPath();
    g.arc(c0.x, c0.y, R, a0, a1);
    g.arc(c1.x, c1.y, R, a1, a0, true);
    g.closePath(); g.fill();
    // 前端面
    const gf = g.createRadialGradient(c1.x - R * 0.3, c1.y - R * 0.3, R * 0.1, c1.x, c1.y, R);
    gf.addColorStop(0, D.shade(col, 0.45)); gf.addColorStop(1, D.shade(col, -0.1));
    g.fillStyle = gf;
    g.beginPath(); g.moveTo(c1.x, c1.y); g.arc(c1.x, c1.y, R, a0, a1); g.closePath(); g.fill();
    g.strokeStyle = D.alpha(D.shade(col, -0.5), 0.6); g.lineWidth = 0.8; g.stroke();
    g.restore();
  }
  function drawRings(g, th) {
    const brass = D.mix(tok.copper, '#d4b04a', 0.45), R = GEO.ringR;
    const carbon = D.mix(D.c.text, D.c['canvas-bg'], D.dark ? 0.55 : 0.25);
    const brushes = [];
    if (!st.comm) {
      ringCyl(g, GEO.ring1, GEO.ring1 + GEO.ringT, R, brass);
      ringCyl(g, GEO.ring2, GEO.ring2 + GEO.ringT, R, brass);
      brushes.push([0, -R, GEO.ring1 + GEO.ringT / 2], [0, -R, GEO.ring2 + GEO.ringT / 2]);
    } else {
      // 換向器：兩片半環，缺口沿面積向量方向（θ = 0 時缺口正好在左右兩個電刷下）
      const z0 = GEO.ring1, z1 = GEO.ring1 + 0.04, gapA = 0.18;
      // 畫面角度：y 向上，所以螢幕上的角度 = −(θ)
      const base = -th;
      ringCyl(g, z0, z1, R, brass, base + gapA / 2, base + Math.PI - gapA / 2);
      ringCyl(g, z0, z1, R, D.shade(brass, -0.12), base + Math.PI + gapA / 2, base + TAU - gapA / 2);
      brushes.push([-R, 0, z0 + 0.02], [R, 0, z0 + 0.02]);
    }
    // 電刷與外接導線
    const lp = GEO.lamp, yb = lp[1];
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    const wire = D.mix(D.c.text, D.c['canvas-bg'], 0.25);
    brushes.forEach(function (bp, k) {
      const below = st.comm ? 0 : 0.028;
      const bx = bp[0] + (st.comm ? (k ? 0.022 : -0.022) : 0), by = bp[1] - below;
      const p = P(bx, by, bp[2]);
      const bwPx = Math.max(6, 0.03 * ob.s), bhPx = Math.max(8, 0.04 * ob.s);
      D.block(g, p.x - bwPx / 2, p.y - bhPx / 2, bwPx, bhPx, carbon, { r: 2, shadow: false });
      // 導線：電刷 → 往下 → 往右到燈泡
      const zt = lp[2] + (k ? 0.03 : -0.03);
      const q0 = P(bx, by - 0.02, bp[2]), q1 = P(bx, yb - (k ? 0.04 : 0), bp[2]), q2 = P(lp[0] + (k ? 0.03 : -0.03), yb - (k ? 0.04 : 0), zt);
      g.strokeStyle = D.alpha(wire, 0.85); g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(q0.x, q0.y); g.lineTo(q1.x, q1.y); g.lineTo(q2.x, q2.y);
      g.stroke();
    });
    g.restore();
  }
  function sideArrow(g, S, hl, i, sgn) {
    if (G.open || !(G.iMax > 0)) return;
    const mag = Math.abs(i) / G.iMax;
    if (mag < 0.06) return;
    const dir = Math.sign(i) * sgn;          // +1：沿 +z
    const z0 = -dir * hl * 0.32, z1 = dir * hl * 0.32;
    const a = P(S[0] * 1.0, S[1] * 1.0, z0), b = P(S[0], S[1], z1);
    const off = coilWidth() * 0.9 + 6;
    const nx = 0, ny = -off;
    D.arrow(g, a.x + nx, a.y + ny, b.x + nx, b.y + ny, D.alpha(tok.cur, 0.35 + 0.65 * mag), 2.2, {});
  }
  function drawLamp(g, now) {
    const lp = GEO.lamp, c = P(lp[0], lp[1] + 0.07, lp[2]), base = P(lp[0], lp[1], lp[2]);
    const R = Math.max(10, 0.055 * ob.s);
    const glass = D.alpha(D.c.text, D.dark ? 0.16 : 0.1);
    if (G.open) {
      // 拿掉燈泡：空的燈座與斷開的接點
      D.block(g, base.x - R * 0.55, base.y - R * 0.2, R * 1.1, R * 0.7, tok.iron, { r: 3 });
      D.haloText(g, T('開路', 'open'), base.x, base.y - R * 0.9, D.c.muted, 'center', 'middle', font(12));
      return;
    }
    const pR = Math.abs(now.pR), u = clamp(pR / LAMP_FULL, 0, 1);
    if (u > 0.01) {
      const halo = g.createRadialGradient(c.x, c.y, R * 0.3, c.x, c.y, R * (2.2 + 1.6 * u));
      halo.addColorStop(0, D.alpha(tok.lamp, 0.65 * u));
      halo.addColorStop(1, D.alpha(tok.lamp, 0));
      g.fillStyle = halo;
      g.beginPath(); g.arc(c.x, c.y, R * (2.2 + 1.6 * u), 0, TAU); g.fill();
    }
    const gg = g.createRadialGradient(c.x - R * 0.35, c.y - R * 0.4, R * 0.1, c.x, c.y, R);
    gg.addColorStop(0, D.mix(D.alpha('#ffffff', 0.7), tok.lamp, u));
    gg.addColorStop(1, u > 0.01 ? D.alpha(tok.lamp, 0.25 + 0.6 * u) : glass);
    g.fillStyle = gg;
    g.beginPath(); g.arc(c.x, c.y, R, 0, TAU); g.fill();
    g.strokeStyle = D.alpha(D.c.text, 0.35); g.lineWidth = 1; g.stroke();
    // 燈絲
    g.strokeStyle = u > 0.02 ? D.mix(tok.lamp, '#ffffff', 0.5 * u) : D.alpha(D.c.text, 0.55);
    g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(c.x - R * 0.4, c.y + R * 0.5); g.lineTo(c.x - R * 0.3, c.y);
    for (let k = 0; k <= 6; k++) g.lineTo(c.x - R * 0.3 + k * R * 0.1, c.y + (k % 2 ? -R * 0.18 : 0));
    g.lineTo(c.x + R * 0.4, c.y + R * 0.5); g.stroke();
    D.block(g, base.x - R * 0.5, base.y - R * 0.05, R, R * 0.55, tok.iron, { r: 2 });
    D.haloText(g, 'R = ' + fq(G.R, 'Ω'), base.x, base.y + R * 0.85, D.c.muted, 'center', 'middle', font(11.5));
    // 外電路電流方向（燈泡左側）
    if (G.iMax > 0 && Math.abs(now.iOut) / G.iMax > 0.06) {
      const y0 = c.y - R * 0.65, xL = base.x - R * 1.9, dir = Math.sign(now.iOut);
      D.arrow(g, xL - dir * 9, y0 + R * 0.65, xL + dir * 9, y0 + R * 0.65, D.alpha(tok.cur, 0.4 + 0.6 * Math.abs(now.iOut) / G.iMax), 2, {});
    }
  }

  // ---------------- 發電機：端視圖 ----------------
  function drawEndStatic(g) {
    const e = box.endC, R = e.r;
    // 兩個磁極（弧形極面）
    [[-1, D.c.pos, 'N'], [1, D.c.neg, 'S']].forEach(function (m) {
      const sx = m[0], col = m[1];
      const x0 = e.x + sx * R * 1.18, x1 = e.x + sx * R * 1.5;
      g.save();
      g.beginPath();
      g.moveTo(x1, e.y - R * 0.85);
      g.lineTo(x0 + sx * R * 0.12, e.y - R * 0.85);
      g.quadraticCurveTo(x0 - sx * R * 0.08, e.y, x0 + sx * R * 0.12, e.y + R * 0.85);
      g.lineTo(x1, e.y + R * 0.85);
      g.closePath();
      const gr = g.createLinearGradient(0, e.y - R, 0, e.y + R);
      gr.addColorStop(0, D.shade(col, 0.2)); gr.addColorStop(0.6, col); gr.addColorStop(1, D.shade(col, -0.18));
      g.fillStyle = gr; g.fill();
      g.strokeStyle = D.alpha(D.shade(col, -0.45), 0.6); g.lineWidth = 1; g.stroke();
      g.font = font(15, '800'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = D.alpha('#ffffff', 0.92);
      g.fillText(m[2], (x0 + x1) / 2 + sx * 2, e.y);
      g.restore();
    });
    // 磁力線（水平）
    g.save();
    for (let k = -3; k <= 3; k++) {
      const y = e.y + k * R * 0.26;
      g.strokeStyle = D.alpha(D.c.field, D.dark ? 0.28 : 0.2); g.lineWidth = 1;
      g.beginPath(); g.moveTo(e.x - R * 1.1, y); g.lineTo(e.x + R * 1.1, y); g.stroke();
      g.fillStyle = D.alpha(D.c.field, D.dark ? 0.45 : 0.36);
      const ax = e.x + R * 0.82;
      g.beginPath(); g.moveTo(ax + 4, y); g.lineTo(ax - 3, y - 3); g.lineTo(ax - 3, y + 3); g.closePath(); g.fill();
    }
    g.restore();
    // 轉動範圍（圓）與 B 方向
    g.save();
    g.setLineDash([3, 4]);
    g.strokeStyle = D.alpha(D.c.muted, 0.5); g.lineWidth = 1;
    g.beginPath(); g.arc(e.x, e.y, R * 0.8, 0, TAU); g.stroke();
    g.restore();
    rich(g, ['B'], e.x + R * 1.08, e.y - R * 0.9, D.c.field, 'right', 13, '700');
    if (!narrow) {
      // 下方說明
      const t1 = T('⊙ 流出畫面　⊗ 流入畫面', '⊙ out of the screen   ⊗ into the screen');
      D.haloText(g, t1, box.end.x + box.end.w / 2, box.end.y + box.end.h - 14, D.c.muted, 'center', 'middle', font(11.5, '500'));
    }
  }
  function drawEndDynamic(g) {
    const e = box.endC, R = e.r, th = st.theta;
    const c = Math.cos(th), s = Math.sin(th);
    const hw = R * 0.8;
    const ux = -s, uy = c;                                  // 線圈平面方向（數學座標，y 向上）
    const ax = e.x + ux * hw, ay = e.y - uy * hw, bx = e.x - ux * hw, by = e.y + uy * hw;
    const now = G.at(th);
    // θ 角（從 B 方向轉到面積向量）
    const dg = C.degNorm(th);
    g.save();
    g.strokeStyle = D.alpha(D.c.accent, 0.7); g.lineWidth = 1.5;
    g.beginPath(); g.arc(e.x, e.y, R * 0.3, 0, -dg * Math.PI / 180, true); g.stroke();
    g.setLineDash([2, 3]); g.strokeStyle = D.alpha(D.c.field, 0.6);
    g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(e.x + R * 0.95, e.y); g.stroke();
    g.restore();
    const mid = -dg / 2 * Math.PI / 180;
    rich(g, ['θ = ' + Math.round(dg) + '°'], e.x + Math.cos(mid) * R * 0.46 + 2, e.y + Math.sin(mid) * R * 0.46, D.c.accent, 'left', 12.5, '700');
    // 線圈（端視：一條線段）
    const kb0 = kb && kb.focused() && kb.index() === 0;
    D.tube(g, function (q) { q.moveTo(ax, ay); q.lineTo(bx, by); }, tok.copper, clamp(coilWidth() * 0.9, 3, 9));
    // 面積向量
    D.arrow(g, e.x, e.y, e.x + c * R * 0.62, e.y - s * R * 0.62, D.c.accent, 2.6, {});
    rich(g, ['A'], e.x + c * R * 0.72 - 4, e.y - s * R * 0.72, D.c.accent, 'left', 13, '700');
    // 兩條長邊的截面：⊙／⊗ 表示電流方向（A 邊電流為正時沿 +z，朝向觀看者）
    const sideR = clamp(coilWidth() * 0.9 + 3, 6, 11);
    [[ax, ay, 1, -1], [bx, by, -1, 1]].forEach(function (sd) {
      D.ball(g, sd[0], sd[1], sideR, tok.copper, { shadow: true });
      const ii = now.i * sd[2];
      if (!G.open && G.iMax > 0 && Math.abs(now.i) / G.iMax > 0.04) {
        g.save();
        g.strokeStyle = D.alpha('#ffffff', 0.95); g.fillStyle = D.alpha('#ffffff', 0.95); g.lineWidth = 1.6;
        if (ii > 0) { g.beginPath(); g.arc(sd[0], sd[1], sideR * 0.28, 0, TAU); g.fill(); }
        else { const k = sideR * 0.45; g.beginPath(); g.moveTo(sd[0] - k, sd[1] - k); g.lineTo(sd[0] + k, sd[1] + k); g.moveTo(sd[0] + k, sd[1] - k); g.lineTo(sd[0] - k, sd[1] + k); g.stroke(); }
        g.restore();
      }
      // 速度（切線方向；A 邊的速度沿 −面積向量）
      const vx = sd[3] * c, vy = sd[3] * s, vl = R * 0.34;
      D.arrow(g, sd[0] + vx * (sideR + 2), sd[1] - vy * (sideR + 2), sd[0] + vx * (sideR + 2 + vl), sd[1] - vy * (sideR + 2 + vl), D.alpha(D.c.muted, 0.9), 1.8, {});
      // 磁力（A 邊電流 +z、B 沿 +x → F 沿 +y）：長度 ∝ |i|
      if (!G.open && G.iMax > 0) {
        const fl = R * 0.5 * Math.abs(now.i) / G.iMax;
        if (fl > 4) D.arrow(g, sd[0], sd[1], sd[0], sd[1] - Math.sign(ii) * fl - Math.sign(ii) * (sideR * 0.6), D.c.pos, 2.4, {});
      }
    });
    // 讀數
    const yb = narrow ? box.end.y + box.end.h - 10 : e.y + R + 34;
    const xl = narrow ? box.end.x + box.end.w * 0.69 : e.x;
    if (narrow) {
      const lines = [
        [['Φ = ' + fq(now.phi, 'Wb')], tok.phi],
        [['ε = ' + fq(now.eps, 'V')], tok.eps],
        [[T('v：速度　', 'v: velocity  ')], D.c.muted],
        [[T('F：磁力', 'F: force')], D.c.pos]
      ];
      lines.forEach(function (ln, i) { rich(g, ln[0], xl - 4, box.end.y + 44 + i * 22, ln[1], 'left', 12.5); });
    } else {
      const xr = box.end.x + box.end.w - 10;
      const w2 = richPill(g, ['ε = ' + fq(now.eps, 'V')], xr, box.end.y + 24, tok.eps, 12, 'right').w;
      richPill(g, ['Φ = ' + fq(now.phi, 'Wb')], xr - w2 - 6, box.end.y + 24, tok.phi, 12, 'right');
    }
    if (!narrow) {
      D.haloText(g, T('灰箭頭：速度　紅箭頭：磁力（阻礙轉動）', 'grey: velocity   red: magnetic force (brakes)'), box.end.x + box.end.w / 2, box.end.y + box.end.h - 30, D.c.muted, 'center', 'middle', font(11.5, '500'));
    }
    if (kb0) {
      g.save(); g.setLineDash([4, 3]); g.strokeStyle = D.c.accent; g.lineWidth = 1.5;
      D.roundRect(g, e.x - R * 1.02, e.y - R * 1.02, R * 2.04, R * 2.04, 10); g.stroke(); g.restore();
    }
  }

  // ---------------- 示波器（共用） ----------------
  /**
   * 畫一條示波器帶。S = {x,y,w,h}；o = { title（rich parts）, lo, hi, t0, t1, tUnit, tScale, curves:[{f(t)→值, color, width, dash, fill, alpha}],
   *   right:{lo, hi, label, color}（右側第二刻度，只畫刻度）, axis（底部時間刻度）, marks:[{t, label, color}], hlines:[{v, label, color}] }
   */
  function strip(g, S, o) {
    const pad = { l: 46, r: o.right ? 46 : 10, t: 23, b: o.axis ? 22 : 6 };
    const x0 = S.x + pad.l, x1 = S.x + S.w - pad.r, y0 = S.y + pad.t, y1 = S.y + S.h - pad.b;
    const TX = function (t) { return x0 + (t - o.t0) / (o.t1 - o.t0) * (x1 - x0); };
    const VY = function (v) { return y1 - (v - o.lo) / (o.hi - o.lo) * (y1 - y0); };
    const px = function (v) { return Math.round(v) + 0.5; };
    g.save();
    D.roundRect(g, x0, y0, x1 - x0, y1 - y0, 4);
    g.fillStyle = D.alpha(D.c.surface, D.dark ? 0.25 : 0.7); g.fill();
    // 格線：時間 8 格、縱向 4 格
    g.lineWidth = 1;
    g.strokeStyle = D.alpha(D.c.text, D.dark ? 0.05 : 0.04);
    g.beginPath();
    for (let k = 1; k < 40; k++) { if (k % 5) { const x = px(x0 + (x1 - x0) * k / 40); g.moveTo(x, y0); g.lineTo(x, y1); } }
    g.stroke();
    g.strokeStyle = D.alpha(D.c.text, D.dark ? 0.11 : 0.1);
    g.beginPath();
    for (let k = 0; k <= 8; k++) { const x = px(x0 + (x1 - x0) * k / 8); g.moveTo(x, y0); g.lineTo(x, y1); }
    for (let k = 0; k <= 4; k++) { const y = px(y0 + (y1 - y0) * k / 4); g.moveTo(x0, y); g.lineTo(x1, y); }
    g.stroke();
    if (o.lo < 0 && o.hi > 0) { g.strokeStyle = D.alpha(D.c.muted, 0.7); g.beginPath(); g.moveTo(x0, px(VY(0))); g.lineTo(x1, px(VY(0))); g.stroke(); }
    // 縱軸刻度
    const fmtV = function (v) { return tickFmt(v, (o.hi - o.lo) / 4); };
    [o.hi, (o.hi + o.lo) / 2, o.lo].forEach(function (v) {
      D.haloText(g, fmtV(v), x0 - 5, VY(v), o.color || D.c.muted, 'right', 'middle', font(11, '500'));
    });
    if (o.right) {
      const r = o.right;
      [r.hi, (r.hi + r.lo) / 2, r.lo].forEach(function (v, i) {
        D.haloText(g, tickFmt(v, (r.hi - r.lo) / 4), x1 + 5, y0 + (y1 - y0) * i / 2, r.color, 'left', 'middle', font(11, '500'));
      });
    }
    // 水平參考線（例如平均功率）
    (o.hlines || []).forEach(function (h) {
      g.setLineDash([5, 4]); g.strokeStyle = D.alpha(h.color, 0.85); g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(x0, VY(h.v)); g.lineTo(x1, VY(h.v)); g.stroke(); g.setLineDash([]);
    });
    // 時間標記（例如 Φ 最大、ε 最大）
    (o.marks || []).forEach(function (m) {
      g.setLineDash([2, 3]); g.strokeStyle = D.alpha(m.color, 0.6); g.lineWidth = 1;
      g.beginPath(); g.moveTo(px(TX(m.t)), y0); g.lineTo(px(TX(m.t)), y1); g.stroke(); g.setLineDash([]);
    });
    // 曲線
    g.save();
    D.roundRect(g, x0, y0 - 2, x1 - x0, y1 - y0 + 4, 4); g.clip();
    const n = Math.max(160, Math.round(x1 - x0));
    o.curves.forEach(function (cu) {
      const pts = [];
      for (let k = 0; k <= n; k++) { const t = o.t0 + (o.t1 - o.t0) * k / n; pts.push([TX(t), VY(clamp(cu.f(t), o.lo - (o.hi - o.lo), o.hi + (o.hi - o.lo)))]); }
      if (cu.fill) {
        const zy = VY(clamp(0, o.lo, o.hi));
        g.fillStyle = D.alpha(cu.color, D.dark ? 0.18 : 0.13);
        g.beginPath(); g.moveTo(pts[0][0], zy);
        pts.forEach(function (p) { g.lineTo(p[0], p[1]); });
        g.lineTo(pts[pts.length - 1][0], zy); g.closePath(); g.fill();
      }
      g.lineJoin = 'round'; g.lineCap = 'round';
      if (cu.dash) g.setLineDash(cu.dash);
      if (!cu.dash) {
        g.strokeStyle = D.alpha(D.c['canvas-bg'], 0.7); g.lineWidth = (cu.width || 2) + 2.5;
        g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.stroke();
      }
      g.strokeStyle = cu.alpha != null ? D.alpha(cu.color, cu.alpha) : cu.color; g.lineWidth = cu.width || 2;
      g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.stroke();
      g.setLineDash([]);
    });
    g.restore();
    (o.hlines || []).forEach(function (h) { if (h.label) richPill(g, h.label, x1 - 4, VY(h.v) - 3, h.color, 11, 'right'); });
    // 標題（含單位）
    let tx = x0 + 4;
    (o.titles || []).forEach(function (tt) { tx += richPill(g, tt[0], tx, y0 - 2, tt[1], 11, 'left').w + 5; });
    (o.marks || []).forEach(function (m) { if (m.label) richPill(g, m.label, TX(m.t) + 3, y1 - 2, m.color, 10.5, 'left'); });
    // 時間軸
    if (o.axis) {
      const span = (o.t1 - o.t0) * o.tScale, step = niceUp(span / (narrow ? 4 : 6)) === span / (narrow ? 4 : 6) ? span / (narrow ? 4 : 6) : niceUp(span / (narrow ? 4 : 6));
      for (let v = 0; v <= span + 1e-9; v += step) {
        const x = TX(o.t0 + v / o.tScale);
        if (x > x1 - 36) break;
        D.haloText(g, tickFmt(v, step), x, y1 + 11, D.c.muted, 'center', 'middle', font(11, '500'));
      }
      D.haloText(g, 't (' + o.tUnit + ')', x1, y1 + 11, D.c.muted, 'right', 'middle', font(11, '600'));
    }
    g.restore();
    return { x0: x0, x1: x1, y0: y0, y1: y1, TX: TX, VY: VY };
  }
  function timeUnit(span) { return span < 0.5 ? ['ms', 1e3] : ['s', 1]; }
  let scopeGeo = [];

  // ---------------- 發電機的示波器：Φ 與 ε、電流、功率與力矩 ----------------
  function genStrips() {
    const S = box.scope, gap = 4, top = 4, n = 3;
    const h = (S.h - top - 4 - gap * (n - 1)) / n;
    const out = [];
    for (let k = 0; k < n; k++) out.push({ x: S.x + 2, y: S.y + top + k * (h + gap), w: S.w - 4, h: h + (k === n - 1 ? 0 : 0) });
    return out;
  }
  function drawGenScope(g) {
    const Tp = G.period, t1 = 2 * Tp, tu = timeUnit(t1);
    const ss = genStrips();
    const eM = niceUp(G.epsMax * 1.05), ep = prefixFor(eM), pM = niceUp(G.phiMax * 1.05), pp = prefixFor(pM);
    const ev = function (t) { return C.genAt(G, G.omega * t).eps / ep[0]; };
    const ov = function (t) { return C.genAt(G, G.omega * t).out / ep[0]; };
    const phv = function (t) { return C.genAt(G, G.omega * t).phi / pM * eM / ep[0]; };   // 用 ε 的刻度畫 Φ（右側刻度另外標）
    const curves1 = [{ f: phv, color: tok.phi, width: 2 }];
    if (st.comm) { curves1.push({ f: ev, color: tok.eps, width: 1.4, dash: [4, 4], alpha: 0.55 }); curves1.push({ f: ov, color: tok.eps, width: 2.2 }); }
    else curves1.push({ f: ev, color: tok.eps, width: 2.2 });
    scopeGeo = [];
    scopeGeo.push(strip(g, ss[0], {
      lo: st.comm ? -eM / ep[0] : -eM / ep[0], hi: eM / ep[0], t0: 0, t1: t1, color: tok.eps,
      right: { lo: -pM / pp[0], hi: pM / pp[0], color: tok.phi },
      curves: curves1,
      titles: [[[st.comm ? T('輸出 |ε|', 'output |ε|') + ' (' + ep[1] + 'V)' : 'ε (' + ep[1] + 'V)'], tok.eps], [['Φ (' + pp[1] + 'Wb)'], tok.phi]],
      marks: [{ t: 0, color: tok.phi }, { t: Tp / 4, color: tok.eps, label: [T('相差 90°', '90° apart')] }, { t: Tp / 2, color: tok.phi }, { t: 3 * Tp / 4, color: tok.eps }]
    }));
    // 電流
    const iM = G.iMax > 0 ? niceUp(G.iMax * 1.05) : 1, ip = prefixFor(iM);
    const curves2 = G.open ? [{ f: function () { return 0; }, color: tok.cur, width: 2 }] : st.comm
      ? [{ f: function (t) { return C.genAt(G, G.omega * t).i / ip[0]; }, color: tok.cur, width: 1.4, dash: [4, 4], alpha: 0.55 }, { f: function (t) { return C.genAt(G, G.omega * t).iOut / ip[0]; }, color: tok.cur, width: 2.2 }]
      : [{ f: function (t) { return C.genAt(G, G.omega * t).i / ip[0]; }, color: tok.cur, width: 2.2 }];
    const st2 = strip(g, ss[1], {
      lo: -iM / ip[0], hi: iM / ip[0], t0: 0, t1: t1, color: tok.cur, curves: curves2,
      titles: [[[st.comm ? T('外電路電流（虛線：線圈內）', 'outside current (dashed: in the coil)') + ' (' + ip[1] + 'A)' : 'i (' + ip[1] + 'A)'], tok.cur]]
    });
    scopeGeo.push(st2);
    if (G.open) D.haloText(g, T('開路：沒有電流', 'Open circuit: no current'), (st2.x0 + st2.x1) / 2, (st2.y0 + st2.y1) / 2 - 10, D.c.muted, 'center', 'middle', font(12));
    // 功率與外力矩
    const pk = G.open ? 1 : G.epsMax * G.iMax, PM = niceUp(pk * 1.08), wp = prefixFor(PM);
    const tq = G.open ? 1 : PM / G.omega, tp = prefixFor(tq);
    scopeGeo.push(strip(g, ss[2], {
      lo: 0, hi: PM / wp[0], t0: 0, t1: t1, color: tok.pow, axis: true, tUnit: tu[0], tScale: tu[1],
      right: { lo: 0, hi: tq / tp[0], color: D.c.muted },
      curves: [{ f: function (t) { return C.genAt(G, G.omega * t).p / wp[0]; }, color: tok.pow, width: 2.2, fill: true }],
      hlines: G.open ? [] : [{ v: G.Pavg / wp[0], color: tok.pow, label: [T('平均 ', 'average ') + fq(G.Pavg, 'W')] }],
      titles: [[['p = i', { sup: '2' }, '(R + r) (' + wp[1] + 'W)'], tok.pow], [[(narrow ? T('右：τ = p/ω', 'right: τ = p/ω') : T('右：外力矩 τ = p/ω', 'right: torque τ = p/ω')) + ' (' + tp[1] + 'N·m)'], D.c.muted]]
    }));
  }
  function genCursor(g) {
    if (!scopeGeo.length) return;
    const t = (st.theta % (2 * TAU) + 2 * TAU) % (2 * TAU) / G.omega;
    const now = G.at(st.theta);
    scopeGeo.forEach(function (s, k) {
      const x = s.TX(t);
      g.save();
      g.strokeStyle = D.alpha(D.c.accent, 0.8); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, s.y0); g.lineTo(x, s.y1); g.stroke();
      g.restore();
      if (k === 0) {
        const eM = niceUp(G.epsMax * 1.05), ep = prefixFor(eM), pM = niceUp(G.phiMax * 1.05);
        D.ball(g, x, s.VY(now.phi / pM * eM / ep[0]), 4, tok.phi, { shadow: false });
        D.ball(g, x, s.VY(now.out / ep[0]), 4.5, tok.eps, { shadow: false });
      } else if (k === 1) {
        const iM = G.iMax > 0 ? niceUp(G.iMax * 1.05) : 1, ip = prefixFor(iM);
        D.ball(g, x, s.VY((st.comm ? now.iOut : now.i) / ip[0]), 4.5, tok.cur, { shadow: false });
      } else {
        const PM = niceUp((G.open ? 1 : G.epsMax * G.iMax) * 1.08), wp = prefixFor(PM);
        D.ball(g, x, s.VY(now.p / wp[0]), 4.5, tok.pow, { shadow: false });
      }
    });
  }

  // ---------------- 變壓器：鐵心、線圈、電源、負載 ----------------
  let xg = null;   // 變壓器畫面的幾何
  function xfGeo() {
    const b = box.pic;
    const cw = Math.min(b.w * (narrow ? 0.5 : 0.40), b.h * 1.05), ch = Math.min(b.h * (narrow ? 0.42 : 0.66), cw * 0.95);
    const cx = b.x + b.w / 2, cy = b.y + (narrow ? b.h * 0.37 : b.h * 0.52);
    const t = Math.max(16, cw * 0.17);
    xg = { cx: cx, cy: cy, w: cw, h: ch, t: t, L: cx - cw / 2, R: cx + cw / 2, T: cy - ch / 2, B: cy + ch / 2 };
    return xg;
  }
  function turnsScale() {
    const m = Math.max(X.N1, X.N2);
    if (m <= 22) return 1;
    const c = [2, 5, 10, 20, 25, 50];
    for (let i = 0; i < c.length; i++) if (m / c[i] <= 22) return c[i];
    return 50;
  }
  function drawXfStatic(g) {
    const q = xfGeo(), t = q.t, iron = tok.iron;
    // 鐵心的接觸陰影
    D.contactShadow(g, q.cx, q.B + 4, q.w * 0.55, 0);
    // 鐵心（口字形）：外框減內窗，金屬漸層＋疊片細紋
    g.save();
    g.beginPath();
    g.rect(q.L, q.T, q.w, q.h);
    g.rect(q.L + t, q.T + t, q.w - 2 * t, q.h - 2 * t);
    const gr = g.createLinearGradient(q.L, q.T, q.R, q.B);
    gr.addColorStop(0, D.shade(iron, 0.35)); gr.addColorStop(0.45, iron); gr.addColorStop(1, D.shade(iron, -0.3));
    g.fillStyle = gr;
    g.fill('evenodd');
    g.clip('evenodd');
    g.strokeStyle = D.alpha(D.shade(iron, -0.5), 0.35); g.lineWidth = 0.8;
    g.beginPath();
    for (let k = 1; k < 7; k++) {
      const d = t * k / 7;
      g.rect(q.L + d, q.T + d, q.w - 2 * d, q.h - 2 * d);
    }
    g.stroke();
    g.restore();
    g.strokeStyle = D.alpha(D.shade(iron, -0.55), 0.7); g.lineWidth = 1;
    g.strokeRect(q.L + 0.5, q.T + 0.5, q.w - 1, q.h - 1);
    g.strokeRect(q.L + t + 0.5, q.T + t + 0.5, q.w - 2 * t - 1, q.h - 2 * t - 1);
    D.haloText(g, T('鐵心（疊片）', 'Laminated iron core'), q.cx, q.T - 10, D.c.muted, 'center', 'middle', font(11.5));
    // 線圈
    const k = turnsScale();
    coilStack(g, q.L + t / 2, q, Math.max(1, Math.round(X.N1 / k)), 'N' , ['N', ['1'], ' = ' + X.N1], -1);
    coilStack(g, q.R - t / 2, q, Math.max(1, Math.round(X.N2 / k)), 'N', ['N', ['2'], ' = ' + X.N2], 1);
    if (k > 1) D.haloText(g, T('示意：每圈代表 ', 'Sketch: each loop stands for ') + k + T(' 匝', ' turns'), q.cx, q.B + (narrow ? 38 : 18), D.c.muted, 'center', 'middle', font(11.5));
    // 電源（左）與負載（右）
    const b = box.pic;
    const sx = narrow ? b.x + 24 : Math.max(b.x + 46, q.L - q.w * 0.55), lx = narrow ? b.x + b.w - 24 : Math.min(b.x + b.w - 46, q.R + q.w * 0.55);
    const coilTop = q.T + q.t + 6, coilBot = q.B - q.t - 6;
    const wire = D.alpha(D.mix(D.c.text, D.c['canvas-bg'], 0.25), 0.9);
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = wire; g.lineWidth = 2;
    const pxL = q.L - 6, pxR = q.R + 6;
    g.beginPath();
    g.moveTo(pxL, coilTop); g.lineTo(sx, coilTop); g.lineTo(sx, q.cy - 22);
    g.moveTo(sx, q.cy + 22); g.lineTo(sx, coilBot); g.lineTo(pxL, coilBot);
    g.moveTo(pxR, coilTop); g.lineTo(lx, coilTop); g.lineTo(lx, q.cy - 22);
    g.moveTo(lx, q.cy + 22); g.lineTo(lx, coilBot); g.lineTo(pxR, coilBot);
    g.stroke(); g.restore();
    xg.sx = sx; xg.lx = lx; xg.coilTop = coilTop; xg.coilBot = coilBot;
    // 電源符號
    if (st.xsrc === 'dc') {
      // 電池（長短線）＋開關
      g.save(); g.strokeStyle = D.c.text; g.lineCap = 'round';
      g.lineWidth = 2.5; g.beginPath(); g.moveTo(sx - 14, q.cy - 6); g.lineTo(sx + 14, q.cy - 6); g.stroke();
      g.lineWidth = 4; g.beginPath(); g.moveTo(sx - 7, q.cy + 4); g.lineTo(sx + 7, q.cy + 4); g.stroke();
      g.restore();
      D.haloText(g, '+', sx + 20, q.cy - 9, D.c.pos, 'left', 'middle', font(12, '700'));
      D.haloText(g, '−', sx + 14, q.cy + 7, D.c.neg, 'left', 'middle', font(12, '700'));
    } else {
      const R = 18;
      D.ball(g, sx, q.cy, R, st.xsrc === 'gen' ? D.mix(tok.copper, D.c.surface, 0.55) : D.c.surface, { shadow: true });
      g.save(); g.strokeStyle = D.c.text; g.lineWidth = 1.8;
      g.beginPath();
      for (let k2 = 0; k2 <= 20; k2++) { const xx = sx - 9 + k2 * 0.9, yy = q.cy + (st.xsrc === 'gen' ? 5 : 0) - 5 * Math.sin(k2 / 20 * TAU); if (k2) g.lineTo(xx, yy); else g.moveTo(xx, yy); }
      g.stroke(); g.restore();
      if (st.xsrc === 'gen') D.haloText(g, 'G', sx, q.cy - 7, D.c.text, 'center', 'middle', font(11, '800'));
    }
    D.haloText(g, st.xsrc === 'dc' ? T('電池', 'Battery') : st.xsrc === 'gen' ? T('發電機', 'Generator') : T('交流電源', 'AC supply'), sx, q.cy + (narrow ? 34 : 36), D.c.muted, 'center', 'middle', font(11.5));
    D.haloText(g, T('一次側', 'Primary'), q.L + t / 2, q.T - 10, D.c.text, 'center', 'middle', font(12, '700'));
    D.haloText(g, T('二次側', 'Secondary'), q.R - t / 2, q.T - 10, D.c.text, 'center', 'middle', font(12, '700'));
  }
  function coilStack(g, x, q, n, _n, label, side) {
    const top = q.T + q.t + 6, bot = q.B - q.t - 6, hh = bot - top;
    const r = q.t * 0.62 + 4, copper = tok.copper;
    const step = hh / n;
    const lw = clamp(step * 0.72, 1.6, 6);
    // 後半圈（被鐵心擋住，畫暗一點）
    g.save(); g.lineCap = 'round';
    for (let k = 0; k < n; k++) {
      const y = top + step * (k + 0.5);
      g.strokeStyle = D.shade(copper, -0.4); g.lineWidth = lw;
      g.beginPath(); g.moveTo(x - r, y + step * 0.18); g.lineTo(x + r, y - step * 0.18); g.stroke();
    }
    g.restore();
    // 前半圈（在鐵心前面）
    for (let k = 0; k < n; k++) {
      const y = top + step * (k + 0.5);
      D.tube(g, function (c) { c.moveTo(x - r, y - step * 0.18); c.quadraticCurveTo(x, y + step * 0.32, x + r, y - step * 0.18); }, copper, lw);
    }
    if (narrow) { richPill(g, label, x, q.B + 24, D.c.text, 11.5, 'center'); return; }   // 窄畫面：標在鐵心下方
    const lx = side < 0 ? x - r - 6 : x + r + 6;
    richPill(g, label, lx, q.cy + 8, D.c.text, 12, side < 0 ? 'right' : 'left');
  }
  function drawXfDynamic(g) {
    const q = xg; if (!q) return;
    const s = xfNow();
    // 鐵心中的磁通量箭頭：方向跟著 Φ、亮度跟著 |Φ|
    const u = s.phiRef > 0 ? clamp(s.phi / s.phiRef, -1, 1) : 0;
    const a = Math.abs(u);
    if (a > 0.02) {
      const m = q.t / 2, path = [[q.L + m, q.T + m], [q.R - m, q.T + m], [q.R - m, q.B - m], [q.L + m, q.B - m]];
      const per = 2 * (q.w + q.h - 2 * q.t), nA = 12;
      const off = reduced ? 0 : (flowT * 26) % (per / nA);
      for (let k = 0; k < nA; k++) {
        let d = (k * per / nA + off * Math.sign(u)) % per; if (d < 0) d += per;
        if (u < 0) d = per - d;
        // 位置與方向（順時針：上→右→下→左）
        let pp = null, dir = null, acc = 0;
        for (let e = 0; e < 4; e++) {
          const p0 = path[e], p1 = path[(e + 1) % 4], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
          if (d <= acc + L) { const f = (d - acc) / L; pp = [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f]; dir = [(p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L]; break; }
          acc += L;
        }
        if (!pp) continue;
        // 避開線圈所在的兩柱中段
        if (Math.abs(pp[1] - q.cy) < q.h / 2 - q.t * 1.2 && (Math.abs(pp[0] - (q.L + m)) < 2 || Math.abs(pp[0] - (q.R - m)) < 2)) continue;
        const sg = Math.sign(u) > 0 ? 1 : -1, hs = Math.max(5, q.t * 0.26);
        const tx = pp[0] + dir[0] * hs * sg, ty = pp[1] + dir[1] * hs * sg;
        D.arrow(g, pp[0] - dir[0] * hs * sg, pp[1] - dir[1] * hs * sg, tx, ty, D.alpha(tok.phi, 0.25 + 0.75 * a), 2.2, {});
      }
    }
    rich(g, ['Φ'], q.cx + q.w * 0.3, q.T + q.t / 2 - (a > 0.02 ? 12 : 0), D.alpha(tok.phi, 0.5 + 0.5 * a), 'center', 13, '700');
    // 電表（數字）：交流顯示有效值，直流顯示瞬時值
    const dcm = st.xsrc === 'dc';
    const V1 = dcm ? s.v1 : X.V1, I1 = dcm ? s.i1 : X.I1, V2 = dcm ? s.v2 : X.V2, I2 = dcm ? s.i2 : X.I2;
    const b = box.pic;
    const mw = narrow ? 0 : 0;
    void mw;
    const yM = narrow ? b.y + b.h - 10 : q.B + 30;
    const leftX = narrow ? b.x + 10 : Math.max(b.x + 8, q.sx - 44);
    const rightX = narrow ? b.x + b.w - 10 : Math.min(b.x + b.w - 8, q.lx + 44);
    meter(g, leftX, yM, [['V', ['1'], ' = ' + fq(V1, 'V')], ['I', ['1'], ' = ' + fq(I1, 'A')]], tok.eps, 'left');
    meter(g, rightX, yM, [['V', ['2'], ' = ' + fq(V2, 'V')], ['I', ['2'], ' = ' + fq(I2, 'A')]], tok.v2, 'right');
    if (!dcm) D.haloText(g, T('（有效值）', '(rms)'), b.x + b.w / 2, narrow ? yM - 20 : yM + 2, D.c.muted, 'center', 'middle', font(11, '500'));
    // 負載（燈泡）：亮度 ∝ 瞬時功率
    const p2 = Math.abs(s.v2 * s.i2), uu = clamp(p2 / LAMP_FULL, 0, 1), lc = { x: q.lx, y: q.cy };
    const R = 15;
    if (uu > 0.01) {
      const halo = g.createRadialGradient(lc.x, lc.y, R * 0.3, lc.x, lc.y, R * (2 + 1.5 * uu));
      halo.addColorStop(0, D.alpha(tok.lamp, 0.65 * uu)); halo.addColorStop(1, D.alpha(tok.lamp, 0));
      g.fillStyle = halo; g.beginPath(); g.arc(lc.x, lc.y, R * (2 + 1.5 * uu), 0, TAU); g.fill();
    }
    const gg = g.createRadialGradient(lc.x - R * 0.35, lc.y - R * 0.4, R * 0.1, lc.x, lc.y, R);
    gg.addColorStop(0, D.mix(D.alpha('#ffffff', 0.7), tok.lamp, uu));
    gg.addColorStop(1, uu > 0.01 ? D.alpha(tok.lamp, 0.25 + 0.6 * uu) : D.alpha(D.c.text, D.dark ? 0.16 : 0.1));
    g.fillStyle = gg; g.beginPath(); g.arc(lc.x, lc.y, R, 0, TAU); g.fill();
    g.strokeStyle = D.alpha(D.c.text, 0.4); g.lineWidth = 1; g.stroke();
    if (!narrow) rich(g, ['R', ['L'], ' = ' + fq(X.RL, 'Ω')], lc.x - 7, lc.y + R + 12, D.c.muted, 'right', 11.5);   // 窄畫面放不下（滑桿上看得到）
    // 開關（直流）
    if (dcm) {
      const on = st.dc.phase === 'on', y = q.coilTop, x = (q.sx + q.L) / 2 + 6;
      g.save(); g.strokeStyle = D.c['canvas-bg']; g.lineWidth = 6; g.beginPath(); g.moveTo(x - 12, y); g.lineTo(x + 12, y); g.stroke();
      g.strokeStyle = on ? D.c.accent : D.c.pos; g.lineWidth = 2.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x - 12, y); g.lineTo(on ? x + 12 : x + 9, on ? y : y - 11); g.stroke();
      g.fillStyle = D.c.text; g.beginPath(); g.arc(x - 12, y, 2.5, 0, TAU); g.arc(x + 12, y, 2.5, 0, TAU); g.fill();
      g.restore();
      D.haloText(g, on ? T('開關接通', 'switch closed') : T('開關切斷', 'switch open'), x, y - 18, on ? D.c.accent : D.c.pos, 'center', 'middle', font(11.5, '700'));
    }
    // 電流方向（一次、二次導線上的小箭頭）
    const flowArrow = function (x, y, i, ref, color) {
      if (!(ref > 0) || Math.abs(i) / ref < 0.05) return;
      const d = Math.sign(i);
      D.arrow(g, x - d * 9, y, x + d * 9, y, D.alpha(color, 0.35 + 0.65 * clamp(Math.abs(i) / ref, 0, 1)), 2, {});
    };
    const i1ref = dcm ? Math.max(1e-9, DC.imFinal) : Math.SQRT2 * X.I1, i2ref = dcm ? Math.max(1e-9, DC.v2Peak / X.RL) : Math.SQRT2 * X.I2;
    flowArrow((q.sx + q.L) / 2 - 18, q.coilBot, -s.i1, i1ref, tok.cur);
    flowArrow((q.lx + q.R) / 2, q.coilTop, s.i2, i2ref, tok.cur);
  }
  function meter(g, x, y, rows, color, align) {
    const px = 12.5, w = Math.max.apply(null, rows.map(function (r) { return richW(g, r, px); })) + 18, h = rows.length * 19 + 8;
    const bx = align === 'right' ? x - w : x;
    D.roundRect(g, bx, y - h, w, h, 7);
    g.fillStyle = D.alpha(D.c['canvas-bg'], D.dark ? 0.88 : 0.92); g.fill();
    g.strokeStyle = D.alpha(color, 0.55); g.lineWidth = 1.2; g.stroke();
    rows.forEach(function (r, i) { rich(g, r, bx + 9, y - h + 14 + i * 19, color, 'left', px); });
  }
  function drawXfScope(g) {
    const S = box.scope;
    const ss = { x: S.x + 2, y: S.y + 4, w: S.w - 4, h: S.h - 8 };
    if (st.xsrc === 'dc') {
      const ph = st.dc.phase;
      const tauW = ph === 'off' ? DC.tauOff : DC.tau, span = 6 * tauW, tu = timeUnit(span);
      const vmax = Math.max(DC.V, Math.abs(ph === 'off' ? DC.off(0, st.dc.im0).v2 : DC.v2Peak), Math.abs(ph === 'off' ? DC.off(0, st.dc.im0).v1 : 0));
      const M = niceUp(vmax * 1.08), mp = prefixFor(M);
      const f1 = function (t) { return ph === 'idle' ? 0 : (ph === 'on' ? DC.on(t, st.dc.im0).v1 : DC.off(t, st.dc.im0).v1) / mp[0]; };
      const f2 = function (t) { return ph === 'idle' ? 0 : (ph === 'on' ? DC.on(t, st.dc.im0).v2 : DC.off(t, st.dc.im0).v2) / mp[0]; };
      scopeGeo = [strip(g, ss, {
        lo: -M / mp[0], hi: M / mp[0], t0: 0, t1: span, axis: true, tUnit: tu[0], tScale: tu[1], color: D.c.muted,
        curves: [{ f: f1, color: tok.eps, width: 2.2 }, { f: f2, color: tok.v2, width: 2.2, fill: true }],
        titles: [[['v', ['1'], ' (' + mp[1] + 'V)'], tok.eps], [['v', ['2'], ' (' + mp[1] + 'V)'], tok.v2], [[ph === 'idle' ? T('按「接通開關」', 'press “Close the switch”') : ph === 'on' ? T('接通後', 'after closing') : T('切斷後', 'after opening')], D.c.muted]]
      })];
      return;
    }
    const Tp = 1 / X.f, t1 = 2 * Tp, tu = timeUnit(t1);
    const vmax = Math.SQRT2 * Math.max(X.V1, X.V2), M = niceUp(vmax * 1.06), mp = prefixFor(M);
    scopeGeo = [strip(g, ss, {
      lo: -M / mp[0], hi: M / mp[0], t0: 0, t1: t1, axis: true, tUnit: tu[0], tScale: tu[1], color: D.c.muted,
      curves: [{ f: function (t) { return X.at(t).v1 / mp[0]; }, color: tok.eps, width: 2.2 }, { f: function (t) { return X.at(t).v2 / mp[0]; }, color: tok.v2, width: 2.2 }],
      titles: [[['v', ['1'], ' (' + mp[1] + 'V)'], tok.eps], [['v', ['2'], ' (' + mp[1] + 'V)'], tok.v2], [[T('同相', 'in step')], D.c.muted]]
    })];
  }
  function xfCursor(g) {
    if (!scopeGeo.length) return;
    const s = scopeGeo[0];
    let t, v1, v2, M, mp;
    if (st.xsrc === 'dc') {
      if (st.dc.phase === 'idle') return;
      const tauW = dcTau(); t = Math.min(st.dc.t, 6 * tauW);
      const d = dcNow(t); v1 = d.v1; v2 = d.v2;
      const vmax = Math.max(DC.V, Math.abs(st.dc.phase === 'off' ? DC.off(0, st.dc.im0).v2 : DC.v2Peak), Math.abs(st.dc.phase === 'off' ? DC.off(0, st.dc.im0).v1 : 0));
      M = niceUp(vmax * 1.08); mp = prefixFor(M);
    } else {
      const Tp = 1 / X.f; t = st.xt % (2 * Tp);
      const d = X.at(st.xt); v1 = d.v1; v2 = d.v2;
      M = niceUp(Math.SQRT2 * Math.max(X.V1, X.V2) * 1.06); mp = prefixFor(M);
    }
    const x = s.TX(t);
    g.save(); g.strokeStyle = D.alpha(D.c.accent, 0.8); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x, s.y0); g.lineTo(x, s.y1); g.stroke(); g.restore();
    D.ball(g, x, s.VY(v1 / mp[0]), 4.5, tok.eps, { shadow: false });
    D.ball(g, x, s.VY(v2 / mp[0]), 4.5, tok.v2, { shadow: false });
  }

  // ---------------- 遠距輸電：示意圖、能量條、電壓沿途 ----------------
  let gg0 = null;
  function gridGeo() {
    const b = box.pic;
    const y = b.y + b.h * (narrow ? 0.56 : 0.58), gnd = b.y + b.h - 22;
    const X0 = b.x + 14, X1 = b.x + b.w - 14, span = X1 - X0;
    const g0 = {
      gnd: gnd, wy: y,
      plant: X0 + span * 0.07, xf1: X0 + span * 0.22, towers: [X0 + span * 0.38, X0 + span * 0.53, X0 + span * 0.68], xf2: X0 + span * 0.82, house: X0 + span * 0.94,
      top: b.y + 52
    };
    g0.wTop = g0.top + (narrow ? 64 : 60);
    gg0 = g0;
    return g0;
  }
  function towerTop(x, g0) { return { x: x, y: g0.wTop }; }
  function drawGridStatic(g) {
    const g0 = gridGeo(), b = box.pic;
    // 地面
    g.save();
    const grd = g.createLinearGradient(0, g0.gnd, 0, b.y + b.h - 4);
    grd.addColorStop(0, D.alpha(D.mix(tok.use, D.c.text, 0.3), D.dark ? 0.25 : 0.18)); grd.addColorStop(1, D.alpha(tok.use, 0));
    g.fillStyle = grd; g.fillRect(b.x + 2, g0.gnd, b.w - 4, b.y + b.h - 4 - g0.gnd);
    g.strokeStyle = D.alpha(D.c.text, 0.25); g.beginPath(); g.moveTo(b.x + 6, g0.gnd + 0.5); g.lineTo(b.x + b.w - 6, g0.gnd + 0.5); g.stroke();
    g.restore();
    const sc = narrow ? 0.72 : 1;
    // 發電廠
    const pw = 46 * sc, ph = 34 * sc, px0 = g0.plant - pw / 2;
    D.block(g, px0, g0.gnd - ph, pw, ph, D.mix(tok.iron, D.c.surface, 0.3), { r: 3 });
    D.block(g, px0 + pw * 0.62, g0.gnd - ph - 22 * sc, 9 * sc, 22 * sc, D.mix(tok.iron, D.c.text, 0.2), { r: 2, shadow: false });
    D.ball(g, px0 + pw * 0.3, g0.gnd - ph * 0.5, 9 * sc, D.mix(tok.copper, D.c.surface, 0.4), { shadow: false });
    D.haloText(g, 'G', px0 + pw * 0.3, g0.gnd - ph * 0.5, D.c.text, 'center', 'middle', font(10, '800'));
    // 變壓器（兩個）
    [[g0.xf1, '1 : ' + sig3(Q.k1)], [g0.xf2, sig3(Q.k2) + ' : 1']].forEach(function (x) {
      const w = 30 * sc, h = 30 * sc;
      D.block(g, x[0] - w / 2, g0.gnd - h, w, h, tok.iron, { r: 3 });
      g.save(); g.strokeStyle = tok.copper; g.lineWidth = 2;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x[0] - w * 0.18, g0.gnd - h * 0.72 + k * h * 0.2, w * 0.13, Math.PI * 0.5, Math.PI * 1.5); g.stroke(); g.beginPath(); g.arc(x[0] + w * 0.18, g0.gnd - h * 0.72 + k * h * 0.2, w * 0.13, -Math.PI * 0.5, Math.PI * 0.5); g.stroke(); }
      g.restore();
      if (narrow) D.haloText(g, x[1], x[0], g0.gnd + 11, D.c.text, 'center', 'middle', font(10, '700'));   // 窄畫面：比值寫在地面下
      else richPill(g, [x[1]], x[0], g0.gnd - h - 6, D.c.text, 11.5, 'center');
    });
    // 電塔
    g0.towers.forEach(function (x) {
      const tt = towerTop(x, g0), wb = 22 * sc;
      g.save(); g.strokeStyle = D.mix(tok.iron, D.c.text, 0.3); g.lineWidth = 1.6; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(x - wb / 2, g0.gnd); g.lineTo(x - 3, tt.y - 6); g.lineTo(x + 3, tt.y - 6); g.lineTo(x + wb / 2, g0.gnd); g.stroke();
      g.lineWidth = 0.9; g.beginPath();
      for (let k = 1; k < 5; k++) { const yy = g0.gnd - (g0.gnd - tt.y) * k / 5, hw = wb / 2 * (1 - k / 5) + 3 * k / 5; g.moveTo(x - hw, yy); g.lineTo(x + hw, yy + (g0.gnd - tt.y) / 5); g.moveTo(x + hw, yy); g.lineTo(x - hw, yy + (g0.gnd - tt.y) / 5); }
      g.stroke();
      g.lineWidth = 2; g.beginPath(); g.moveTo(x - 14 * sc, tt.y); g.lineTo(x + 14 * sc, tt.y); g.moveTo(x - 10 * sc, tt.y + 10 * sc); g.lineTo(x + 10 * sc, tt.y + 10 * sc); g.stroke();
      g.restore();
    });
    // 房屋
    for (let k = 0; k < 2; k++) {
      const hx = g0.house - 14 * sc + k * 24 * sc, hw = 20 * sc, hh = 18 * sc;
      D.block(g, hx - hw / 2, g0.gnd - hh, hw, hh, D.mix(D.c.surface, tok.copper, 0.25), { r: 2 });
      g.fillStyle = D.mix(D.c.pos, D.c.text, 0.25);
      g.beginPath(); g.moveTo(hx - hw / 2 - 3, g0.gnd - hh); g.lineTo(hx, g0.gnd - hh - 11 * sc); g.lineTo(hx + hw / 2 + 3, g0.gnd - hh); g.closePath(); g.fill();
    }
    // 導線（兩條）與損失光暈
    const loss = Q.lossFrac;
    gridWirePaths(g0).forEach(function (pth) {
      if (pth.line && loss > 0.003) {
        g.save(); g.strokeStyle = D.alpha(tok.loss, clamp(0.12 + 0.6 * Math.sqrt(loss), 0, 0.7)); g.lineWidth = 3 + 8 * Math.sqrt(loss); g.lineCap = 'round';
        if (!reduced) { g.shadowColor = D.alpha(tok.loss, 0.8); g.shadowBlur = 10 * Math.sqrt(loss) + 2; }
        g.beginPath(); pth.draw(g); g.stroke(); g.restore();
      }
      g.save(); g.strokeStyle = D.alpha(D.mix(D.c.text, D.c['canvas-bg'], 0.2), 0.9); g.lineWidth = pth.line ? 1.4 : 2.2; g.lineCap = 'round';
      g.beginPath(); pth.draw(g); g.stroke(); g.restore();
    });
    // 標籤
    const ly = g0.top, pxs = narrow ? 10.5 : 11.5;
    const lab = function (x, parts, color, align) { return richPill(g, parts, x, ly, color, pxs, align || 'center'); };
    lab(g0.plant, ['V', ['g'], ' = ' + fq(Q.Vg, 'V')], tok.eps, 'left');
    const mid = (g0.towers[0] + g0.towers[2]) / 2;
    lab(mid, ['V', ['L'], ' = ' + fq(Q.VL, 'V')], D.c.text);
    richPill(g, ['I', ['line'], ' = ' + fq(Q.IL, 'A')], mid, ly + 20, tok.cur, pxs, 'center');
    lab(g0.house + 18 * sc, ['V', ['u'], ' = ' + fq(Q.Vu, 'V')], tok.use, 'right');
    // 線上的電壓降
    richPill(g, [T('線上壓降 ', 'drop on the line ') + fq(Q.drop, 'V')], mid, g0.gnd - 8, tok.loss, narrow ? 10 : 11, 'center');
    D.haloText(g, T('發電廠', 'Power station'), g0.plant, g0.gnd + 11, D.c.muted, 'center', 'middle', font(narrow ? 10 : 11));
    D.haloText(g, T('用戶', 'Users'), g0.house, g0.gnd + 11, D.c.muted, 'center', 'middle', font(narrow ? 10 : 11));
    if (!narrow) {
      D.haloText(g, T('升壓', 'Step up'), g0.xf1, g0.gnd + 11, D.c.muted, 'center', 'middle', font(11));
      D.haloText(g, T('降壓', 'Step down'), g0.xf2, g0.gnd + 11, D.c.muted, 'center', 'middle', font(11));
    }
  }
  /** 導線路徑：low：發電廠→升壓器、降壓器→房屋；line：升壓器→電塔→降壓器（下垂的弧線） */
  function gridWirePaths(g0) {
    const sc = narrow ? 0.72 : 1, out = [];
    const yA = g0.gnd - 20 * sc, yB = g0.gnd - 12 * sc;
    out.push({ line: false, I: Q.Ig, pts: [[g0.plant + 23 * sc, yA], [g0.xf1 - 15 * sc, yA]] });
    out.push({ line: false, I: Q.Ig, pts: [[g0.plant + 23 * sc, yB], [g0.xf1 - 15 * sc, yB]] });
    out.push({ line: false, I: Q.Iu, pts: [[g0.xf2 + 15 * sc, yA], [g0.house - 24 * sc, yA]] });
    out.push({ line: false, I: Q.Iu, pts: [[g0.xf2 + 15 * sc, yB], [g0.house - 24 * sc, yB]] });
    [0, 10 * sc].forEach(function (dy) {
      const pts = [[g0.xf1 + 15 * sc, g0.gnd - (22 - dy * 0.6) * sc]];
      g0.towers.forEach(function (x) { pts.push([x + (dy ? 9 : -12) * sc, g0.wTop + dy]); });
      pts.push([g0.xf2 - 15 * sc, g0.gnd - (22 - dy * 0.6) * sc]);
      out.push({ line: true, I: Q.IL, pts: pts, sag: true });
    });
    out.forEach(function (o) {
      o.draw = function (g) {
        o.pts.forEach(function (p, i) {
          if (!i) { g.moveTo(p[0], p[1]); return; }
          const a = o.pts[i - 1];
          if (o.sag && i >= 2 && i <= o.pts.length - 2) g.quadraticCurveTo((a[0] + p[0]) / 2, Math.max(a[1], p[1]) + Math.abs(p[0] - a[0]) * 0.12, p[0], p[1]);
          else g.lineTo(p[0], p[1]);
        });
      };
      // 取樣成折線，給移動的小點用
      const sm = [];
      o.pts.forEach(function (p, i) {
        if (!i) { sm.push(p); return; }
        const a = o.pts[i - 1];
        for (let k = 1; k <= 12; k++) {
          const t = k / 12;
          if (o.sag && i >= 2 && i <= o.pts.length - 2) { const cx = (a[0] + p[0]) / 2, cy = Math.max(a[1], p[1]) + Math.abs(p[0] - a[0]) * 0.12; sm.push([(1 - t) * (1 - t) * a[0] + 2 * t * (1 - t) * cx + t * t * p[0], (1 - t) * (1 - t) * a[1] + 2 * t * (1 - t) * cy + t * t * p[1]]); }
          else sm.push([a[0] + (p[0] - a[0]) * t, a[1] + (p[1] - a[1]) * t]);
        }
      });
      let L = 0; o.cum = [0];
      for (let k = 1; k < sm.length; k++) { L += Math.hypot(sm[k][0] - sm[k - 1][0], sm[k][1] - sm[k - 1][1]); o.cum.push(L); }
      o.sm = sm; o.len = L;
    });
    return out;
  }
  let wirePaths = null, wireKey = '';
  function drawGridDynamic(g) {
    const g0 = gg0; if (!g0) return;
    const k = [W, H, key].join('|');
    if (k !== wireKey) { wireKey = k; wirePaths = gridWirePaths(g0); }
    // 移動的小點：速度隨電流增加（對數刻度）
    wirePaths.forEach(function (o, idx) {
      const v = 10 * Math.log10(1 + o.I);                  // px/s
      const sp = 26, n = Math.max(1, Math.floor(o.len / sp));
      const dir = idx % 2 ? -1 : 1;                          // 兩條線電流方向相反
      for (let i = 0; i < n; i++) {
        let d = (i * sp + dir * (reduced ? 0 : flowT * v)) % o.len; if (d < 0) d += o.len;
        let j = 1; while (j < o.cum.length && o.cum[j] < d) j++;
        if (j >= o.cum.length) continue;
        const f = (d - o.cum[j - 1]) / ((o.cum[j] - o.cum[j - 1]) || 1);
        const x = o.sm[j - 1][0] + (o.sm[j][0] - o.sm[j - 1][0]) * f, y = o.sm[j - 1][1] + (o.sm[j][1] - o.sm[j - 1][1]) * f;
        g.fillStyle = D.alpha(tok.cur, 0.85);
        g.beginPath(); g.arc(x, y, o.line ? 1.9 : 2.3, 0, TAU); g.fill();
      }
    });
    // 房屋的窗戶：亮度 ∝ 實際功率／額定功率
    const sc = narrow ? 0.72 : 1, u = clamp(Q.Pu / Q.Prated, 0, 1.4);
    for (let kk = 0; kk < 2; kk++) {
      const hx = g0.house - 14 * sc + kk * 24 * sc, hh = 18 * sc;
      const wx = hx - 4 * sc, wy = g0.gnd - hh * 0.72, ww = 8 * sc;
      if (u > 0.02) { g.fillStyle = D.alpha(tok.lamp, clamp(0.25 * u, 0, 0.35)); g.beginPath(); g.arc(hx, wy + ww / 2, ww * 1.6, 0, TAU); g.fill(); }
      g.fillStyle = u > 0.02 ? D.mix(D.alpha(D.c.text, 0.3), tok.lamp, clamp(u, 0, 1)) : D.alpha(D.c.text, 0.3);
      g.fillRect(wx, wy, ww, ww);
    }
  }
  function drawBars(g) {
    const b = box.bars, x0 = b.x + 12, x1 = b.x + b.w - 12;
    D.haloText(g, T('能量條（每秒的能量 = 功率）', 'Energy bars (energy per second = power)'), b.x + 10, b.y + 14, D.c.muted, 'left', 'middle', font(12));
    const rows = [
      { lab: [T('發電 ', 'Generated '), 'P', ['g']], v: Q.Pg, col: tok.eps },
      { lab: [T('線損 ', 'Line loss '), 'I', ['line'], { sup: '2' }, 'R'], v: Q.Ploss, col: tok.loss },
      { lab: [T('用戶 ', 'Users '), 'P', ['u']], v: Q.Pu, col: tok.use }
    ];
    const top = b.y + 30, rh = Math.min(40, (b.h - 40) / 3);
    const lw = narrow ? 92 : 112, bx0 = x0 + lw, bw = x1 - bx0;
    const ref = Math.max(Q.Pg, 1);
    rows.forEach(function (r, i) {
      const y = top + i * rh;
      rich(g, r.lab, x0, y + rh * 0.4, r.col, 'left', 12.5);
      D.roundRect(g, bx0, y + rh * 0.1, bw, rh * 0.6, 5);
      g.fillStyle = D.alpha(D.c.text, D.dark ? 0.08 : 0.06); g.fill();
      const w = bw * clamp(r.v / ref, 0, 1);
      if (w > 1) D.block(g, bx0, y + rh * 0.1, w, rh * 0.6, r.col, { r: 5, shadow: false });
      const txt = fq(r.v, 'W') + (i ? '（' + (r.v / ref * 100).toFixed(r.v / ref < 0.1 ? 2 : 1) + '%）' : '');
      const inside = w > 150;
      D.haloText(g, i ? txt.replace('（', ' (').replace('）', ')') : txt, inside ? bx0 + w - 6 : bx0 + w + 6, y + rh * 0.4, inside ? D.c['canvas-bg'] === '' ? D.c.text : D.c.text : D.c.text, inside ? 'right' : 'left', 'middle', font(12, '700'));
    });
    const ey = Math.min(b.y + b.h - 12, top + 3 * rh + 6);
    rich(g, [T('輸電效率 η = ', 'Efficiency η = ') + (Q.eff * 100).toFixed(2) + '%'], x0, ey, D.c.accent, 'left', 13, '700');
  }
  function drawLadder(g) {
    const b = box.ladder;
    D.haloText(g, T('電壓沿途（對數刻度）', 'Voltage along the way (log scale)'), b.x + 10, b.y + 14, D.c.muted, 'left', 'middle', font(12));
    const cols = [
      { lab: [T('發電機', 'gen.')], v: Q.Vg, col: tok.eps },
      { lab: [T('送電端', 'send')], v: Q.VL, col: D.mix(D.c.text, D.c['canvas-bg'], 0.35) },
      { lab: [T('受電端', 'recv.')], v: Q.Vrecv, col: D.mix(D.c.text, D.c['canvas-bg'], 0.35) },
      { lab: [T('用戶', 'users')], v: Q.Vu, col: tok.use }
    ];
    const lo = 10, hi = 1e6;
    const x0 = b.x + 44, x1 = b.x + b.w - 10, y0 = b.y + 30, y1 = b.y + b.h - 24;
    const VY = function (v) { return y1 - (Math.log10(clamp(v, lo, hi)) - 1) / 5 * (y1 - y0); };
    g.save();
    g.strokeStyle = D.alpha(D.c.text, D.dark ? 0.1 : 0.09); g.lineWidth = 1;
    g.beginPath();
    for (let e = 1; e <= 6; e++) { const y = Math.round(VY(Math.pow(10, e))) + 0.5; g.moveTo(x0, y); g.lineTo(x1, y); }
    g.stroke();
    g.restore();
    ['10 V', '100 V', '1 kV', '10 kV', '100 kV', '1 MV'].forEach(function (t, i) { D.haloText(g, t, x0 - 4, VY(Math.pow(10, i + 1)), D.c.muted, 'right', 'middle', font(10.5, '500')); });
    // 參考線：用戶的額定電壓
    g.save(); g.setLineDash([4, 4]); g.strokeStyle = D.alpha(tok.use, 0.7);
    g.beginPath(); g.moveTo(x0, VY(Q.Vrated)); g.lineTo(x1, VY(Q.Vrated)); g.stroke(); g.restore();
    const cw = (x1 - x0) / cols.length;
    cols.forEach(function (c, i) {
      const cx = x0 + cw * (i + 0.5), bw = Math.min(26, cw * 0.5);
      const y = VY(c.v);
      D.block(g, cx - bw / 2, y, bw, y1 - y, D.alpha(c.col, 0.85), { r: 3, shadow: false });
      D.haloText(g, fq(c.v, 'V'), cx, y - 9, c.col, 'center', 'middle', font(10.5, '700'));
      rich(g, c.lab, cx, y1 + 11, D.c.muted, 'center', 10.5, '500');
    });
  }

  // =====================================================================
  // 繪製
  // =====================================================================
  function draw() {
    if (!G) return;
    buildLayer();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (st.mode === 'gen') { drawGenDynamic(ctx); drawEndDynamic(ctx); genCursor(ctx); }
    else if (st.mode === 'xf') { drawXfDynamic(ctx); xfCursor(ctx); }
    else drawGridDynamic(ctx);
  }

  // =====================================================================
  // 動畫
  // =====================================================================
  let raf = 0, lastT = 0, flowT = 0, genSpin = 0, genRevs = 0, roAcc = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    const dt = Math.min(1 / 30, lastT ? (now - lastT) / 1000 : 0);
    lastT = now;
    let more = false;
    if (!document.hidden) {
      if (st.playing) {
        if (st.mode === 'gen') advanceGen(dt);
        else if (st.mode === 'xf') advanceXf(dt);
        more = true;
      }
      if (st.mode === 'grid' && !reduced) more = true;
      if (st.mode === 'xf' && st.xsrc === 'dc' && st.dc.phase !== 'idle' && st.dc.t < 8 * dcTau()) { advanceDC(dt); more = true; }
      if (!reduced) flowT += dt;
    }
    if (!stage.classList.contains('is3d')) draw();
    else if (view3 && view3.active) view3.update();
    hum();
    if (more && !document.hidden) requestDraw(); else lastT = 0;
    liveSr(now);
  }
  function advanceGen(dt) {
    const d = TAU * visRate(G.f) * dt;
    st.theta = (st.theta + d) % (TAU * 1000);
    genSpin += d;
    while (genSpin >= TAU) { genSpin -= TAU; genRevs++; lapDone(); }
  }
  function advanceXf(dt) {
    if (st.xsrc === 'dc') return;
    const f = xfFreq(); if (!(f > 0)) return;
    st.xt += visRate(f) / f * dt;
    if (st.xt > 1e6 / f) st.xt = 0;
  }
  function advanceDC(dt) {
    const tau = dcTau();
    const before = st.dc.t;
    st.dc.t += dt * (5 * tau / 4);       // 慢動作：5τ 約播 4 秒
    roAcc += dt;
    if (roAcc > 0.12 || st.dc.t >= 8 * tau) { roAcc = 0; updateReadouts(); }
    if (st.dc.phase === 'on' && before < 6 * tau && st.dc.t >= 6 * tau && userActed) {
      emitXf();
      if (!st.dc.steadySaid) { st.dc.steadySaid = true; say(T('磁通量已經穩定：二次側電壓回到零，一次側只剩電阻限制電流 ', 'The flux is steady now: the secondary voltage is back to zero, and only the copper resistance limits the primary current ') + fq(DC.imFinal, 'A') + T('。', '.')); }
    }
  }
  function lapDone() {
    if (!userActed) return;
    emitGen();
  }

  // ---------------- 任務事件 ----------------
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function genData() {
    return Object.assign(C.genReport(G), { mode: 'gen', theta: C.degNorm(st.theta), paused: !st.playing, revs: genRevs });
  }
  function emitGen() { if (userActed && G) emit('gen', genData()); }
  function xfData() {
    const dcm = st.xsrc === 'dc';
    const o = Object.assign(C.xfReport(X), { mode: 'xf', dcOn: dcm && st.dc.phase === 'on', steady: dcm && st.dc.phase === 'on' && st.dc.t >= 6 * DC.tau, pulsed: dcm && st.dc.pulsed });
    if (dcm) { const s = dcNow(); o.v2Now = s.v2; o.i1Now = s.i1; o.v2Peak = DC.v2Peak; }
    if (st.xsrc === 'gen') { o.genF = G.f; o.genEpsRms = G.epsRms; o.genR = G.r; }
    return o;
  }
  function emitXf() { if (userActed && X) emit('xf', xfData()); }
  function emitGrid() { if (userActed && Q) emit('grid', Object.assign(C.gridReport(Q), { mode: 'grid' })); }
  function emitMode() { if (st.mode === 'gen') emitGen(); else if (st.mode === 'xf') emitXf(); else emitGrid(); }

  const statusEl = $('status');
  function say(t) { statusEl.textContent = t; }
  let srT = 0;
  function liveSr(now) {
    if (now - srT < 1000 || !G) return;
    srT = now;
    let t;
    if (st.mode === 'gen') { const s = G.at(st.theta); t = 'θ = ' + Math.round(C.degNorm(st.theta)) + '°, Φ = ' + fq(s.phi, 'Wb') + ', ε = ' + fq(s.eps, 'V') + ', i = ' + fq(s.i, 'A'); }
    else if (st.mode === 'xf') { const s = xfNow(); t = 'v1 = ' + fq(s.v1, 'V') + ', v2 = ' + fq(s.v2, 'V'); }
    else t = T('用戶電壓 ', 'User voltage ') + fq(Q.Vu, 'V') + T('，效率 ', ', efficiency ') + (Q.eff * 100).toFixed(1) + '%';
    const s = $('srState');
    if (s.textContent !== t) s.textContent = t;
  }

  // ---------------- 音效 ----------------
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  let voice = null;
  function hum() {
    const S = sound();
    const want = S && st.playing && !document.hidden && ((st.mode === 'gen' && G.epsMax > 0) || (st.mode === 'xf' && st.xsrc !== 'dc'));
    if (!want) { if (voice) { voice.stop(0.15); voice = null; } return; }
    let freq, gain;
    if (st.mode === 'gen') {
      freq = 250 + 6 * G.f;                                     // 音高只是示意（真正的 60 Hz 太低）
      gain = 0.02 + 0.10 * Math.abs(Math.sin(st.theta));       // 音量跟著 |ε| 起伏
    } else { freq = 300 + 3 * X.f; gain = 0.035; }
    if (!voice || !voice.playing) voice = S.voice({ freq: freq, type: 'triangle', gain: gain });
    else voice.set({ freq: freq, gain: gain }, 0.05);
  }
  function clickSound() { const S = sound(); if (!S) return; S.noise({ dur: 0.03, gain: 0.45, filter: 2400, q: 1 }); S.tone({ freq: 1150, dur: 0.05, type: 'triangle', gain: 0.2 }); }
  function switchSound(on) { const S = sound(); if (!S) return; S.noise({ dur: 0.04, gain: 0.5, filter: 3000, q: 0.8 }); S.tone({ freq: on ? 880 : 520, dur: 0.07, type: 'square', gain: 0.08 }); }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton(); requestDraw();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
    if (ev.detail && (ev.detail.name === 'fs' || ev.detail.name === 'lang')) { resize(); }
  });

  // =====================================================================
  // 讀數、提醒、記錄表
  // =====================================================================
  let roKey = '';
  function row(dt, dd, cls) { return '<dt' + (cls && /sep/.test(cls) ? ' class="sep"' : '') + '>' + dt + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + dd + '</dd>'; }
  function updateReadouts() {
    let h = '';
    if (st.mode === 'gen') {
      h += row(T('頻率 f（角速度 ω）', 'Frequency f (ω)'), sig3(G.f) + ' Hz (' + sig3(G.omega) + ' rad/s)');
      h += row(T('線圈面積 A = Lw', 'Coil area A = Lw'), sig3(G.A * 1e4) + ' cm<sup>2</sup>');
      h += row(T('電動勢峰值 ε<sub>max</sub> = NBAω', 'Peak emf ε<sub>max</sub> = NBAω'), fq(G.epsMax, 'V'), 'em sep');
      h += st.comm ? row(T('輸出平均值 2ε<sub>max</sub>/π', 'Average output 2ε<sub>max</sub>/π'), fq(G.epsAvgDC, 'V')) : '';
      h += row(T('電動勢有效值 ε<sub>rms</sub>', 'rms emf ε<sub>rms</sub>'), fq(G.epsRms, 'V'), 'em');
      h += row(T('負載電壓有效值 V<sub>R</sub>', 'rms load voltage V<sub>R</sub>'), fq(G.VRrms, 'V'));
      h += row(T('電流有效值 i<sub>rms</sub>', 'rms current i<sub>rms</sub>'), fq(G.iRms, 'A'));
      h += row(T('平均電功率（總）', 'Average electric power (total)'), fq(G.Pavg, 'W'), 'sep');
      h += row(T('負載得到的平均功率', 'Average power in the load'), fq(G.PR, 'W'));
      h += row(T('需要的外力矩峰值 τ<sub>max</sub>', 'Peak driving torque τ<sub>max</sub>'), fq(G.tauMax, 'N·m'), 'em');
      h += row(T('長邊的速率 v = ωw/2', 'Speed of a long side v = ωw/2'), fq(G.v, 'm/s'));
    } else if (st.mode === 'xf') {
      const dcm = st.xsrc === 'dc';
      h += row(T('匝數比 N<sub>2</sub>/N<sub>1</sub>', 'Turns ratio N<sub>2</sub>/N<sub>1</sub>'), sig3(X.ratio), 'em');
      if (dcm) {
        const s = dcNow();
        h += row(T('電池電壓 V', 'Battery voltage V'), fq(X.V1, 'V'), 'sep');
        h += row(T('二次側電壓（此刻）', 'Secondary voltage (now)'), fq(s.v2, 'V'), 'em');
        h += row(T('接通瞬間的 v<sub>2</sub>', 'v<sub>2</sub> just after closing'), fq(DC.v2Peak, 'V'));
        h += row(T('一次側電流（此刻）', 'Primary current (now)'), fq(s.i1, 'A'));
        h += row(T('穩定後一次側電流 V/R<sub>1</sub>', 'Steady primary current V/R<sub>1</sub>'), fq(DC.imFinal, 'A'));
        h += row(T('一次線圈電阻 R<sub>1</sub>', 'Primary resistance R<sub>1</sub>'), fq(DC.R1, 'Ω'), 'sep');
        h += row(T('時間常數 τ', 'Time constant τ'), fq(DC.tau, 's'));
      } else {
        if (st.xsrc === 'gen') h += row(T('發電機 ε<sub>rms</sub>（f）', 'Generator ε<sub>rms</sub> (f)'), fq(X.Vemf, 'V') + ' (' + sig3(X.f) + ' Hz)');
        h += row(T('一次側 V<sub>1</sub>', 'Primary V<sub>1</sub>'), fq(X.V1, 'V'), 'sep');
        h += row(T('二次側 V<sub>2</sub>', 'Secondary V<sub>2</sub>'), fq(X.V2, 'V'), 'em');
        h += row(T('一次側 I<sub>1</sub>', 'Primary I<sub>1</sub>'), fq(X.I1, 'A'));
        h += row(T('二次側 I<sub>2</sub>', 'Secondary I<sub>2</sub>'), fq(X.I2, 'A'));
        h += row(T('一次側功率 P<sub>1</sub>', 'Primary power P<sub>1</sub>'), fq(X.P1, 'W'), 'sep');
        h += row(T('二次側功率 P<sub>2</sub>', 'Secondary power P<sub>2</sub>'), fq(X.P2, 'W'));
        h += row(T('一次側看到的電阻 R′', 'Resistance seen by the primary R′'), fq(X.Req, 'Ω'));
        h += row(T('鐵心磁通密度峰值', 'Peak flux density in the core'), sig3(X.Bcore) + ' T', 'sep');
      }
    } else {
      h += row(T('輸電線電壓 V<sub>L</sub> = k<sub>1</sub>V<sub>g</sub>', 'Line voltage V<sub>L</sub> = k<sub>1</sub>V<sub>g</sub>'), fq(Q.VL, 'V'));
      h += row(T('線電流 I<sub>line</sub>', 'Line current I<sub>line</sub>'), fq(Q.IL, 'A'), 'em');
      h += row(T('線上電壓降 I<sub>line</sub>R<sub>line</sub>', 'Drop on the line I<sub>line</sub>R<sub>line</sub>'), fq(Q.drop, 'V'));
      h += row(T('用戶電壓 V<sub>u</sub>', 'Users’ voltage V<sub>u</sub>'), fq(Q.Vu, 'V'), 'em sep');
      h += row(T('用戶功率 P<sub>u</sub>', 'Users’ power P<sub>u</sub>'), fq(Q.Pu, 'W'));
      h += row(T('線損 I<sub>line</sub><sup>2</sup>R<sub>line</sub>', 'Line loss I<sub>line</sub><sup>2</sup>R<sub>line</sub>'), fq(Q.Ploss, 'W'));
      h += row(T('發電功率 P<sub>g</sub>', 'Generated power P<sub>g</sub>'), fq(Q.Pg, 'W'));
      h += row(T('輸電效率 η', 'Efficiency η'), (Q.eff * 100).toFixed(2) + '%', 'em sep');
      h += row(T('用戶等效電阻 R<sub>u</sub>', 'Users’ resistance R<sub>u</sub>'), fq(Q.Ru, 'Ω'));
    }
    if (h !== roKey) { roKey = h; $('readout').innerHTML = h; }
  }
  function warn() {
    let t = '';
    if (st.mode === 'xf') {
      if (st.xsrc === 'dc') {
        if (st.dc.phase === 'on' && DC.imFinal > 20) t = T('直流電流只受一次線圈的電阻限制：穩定後 ', 'Only the primary’s copper resistance limits the DC current: it settles at ') + fq(DC.imFinal, 'A') + T('，線圈會過熱（真實的變壓器會燒毀）。', ' and the coil overheats (a real transformer would burn out).');
      } else if (X.sat) t = T('鐵心磁通密度峰值 ', 'The peak flux density in the core is ') + sig3(X.Bcore) + T(' T，超過 1.7 T：真實的鐵心會飽和，理想變壓器的關係不再成立。增加一次線圈匝數或提高頻率。', ' T, above 1.7 T: a real core would saturate and the ideal relations would fail. Add primary turns or raise the frequency.');
      if (st.xsrc === 'gen' && st.comm) t = (t ? t + ' ' : '') + T('發電機接變壓器時改用滑環（換向器的脈動直流含有不會變動的成分，變壓器傳不過去）。', 'Feeding the transformer, the generator uses its slip rings (the pulsating DC from a commutator contains a steady part that a transformer cannot pass on).');
    } else if (st.mode === 'grid') {
      if (Q.lossFrac > 0.5) t = T('一半以上的功率都變成輸電線的熱：電壓太低、電流太大。試著把升壓比 k', 'More than half the power heats the line: the voltage is too low and the current too large. Try raising the step-up ratio k') + '1' + T(' 調高。', '.');
      else if (Q.Vu < 0.9 * Q.Vrated) t = T('用戶電壓比額定電壓低了 10% 以上：電器無法正常運作。', 'The users get more than 10 % below the rated voltage, so their appliances will not work properly.');
      else if (Q.Vu > 1.1 * Q.Vrated) t = T('用戶電壓比額定電壓高了 10% 以上：電器可能燒壞。', 'The users get more than 10 % above the rated voltage, so their appliances may burn out.');
    } else if (st.mode === 'gen') {
      if (G.tauMax > 200) t = T('外力矩峰值超過 200 N·m：小型的手搖或水車發電機轉不動了。', 'The peak torque is above 200 N·m — a small hand-cranked or water-wheel generator could not turn this.');
    }
    $('warn').textContent = t;
  }
  function hints() {
    $('hint2').textContent = st.mode === 'gen'
      ? T('在端視圖拖曳線圈可以轉到任一角度（會自動暫停）。點一下畫布後，左右方向鍵每次轉 1°（Shift：15°），P 播放或暫停，R 記錄。燈泡亮度 ∝ 瞬時功率。',
        'Drag the coil in the end view to set any angle (this pauses the motion). After clicking the drawing, the left and right arrow keys turn it 1° (Shift: 15°); P plays or pauses, R records. The lamp’s brightness ∝ instantaneous power.')
      : st.mode === 'xf'
        ? T('鐵心中的藍色箭頭表示磁通量：方向跟著 Φ，亮度跟著 |Φ|。燈泡亮度 ∝ 瞬時功率。P 播放或暫停，R 記錄。', 'The blue arrows in the core show the flux: their direction follows Φ and their brightness |Φ|. The lamp’s brightness ∝ instantaneous power. P plays or pauses, R records.')
        : T('小點的速度隨電流增加（對數刻度）；導線的紅色光暈隨線損的比例增加。R 記錄。', 'The dots move faster where the current is larger (log scale); the red glow on the wires grows with the fraction of power lost. R records.');
    $('hint3').textContent = st.mode === 'grid'
      ? T('輸電模式只有 2D 示意圖。', 'The power line has a 2D sketch only.')
      : st.mode === 'gen'
        ? T('拖曳旋轉，滾輪或雙指縮放，右鍵或雙指拖曳平移。線圈和 2D 的角度同步；轉到沿著轉軸看，θ = 90° 時兩條長邊正好垂直切過磁力線。', 'Drag to rotate, scroll or pinch to zoom, right-drag or two-finger drag to pan. The coil turns in step with the 2D view; look along the axle at θ = 90° to see the long sides cutting straight across the field lines.')
        : T('拖曳旋轉，滾輪或雙指縮放。鐵心內的亮點是磁通量，線圈上的小點是流動的電荷（速率 ∝ 電流）。', 'Drag to rotate, scroll or pinch to zoom. The glowing marks in the core are the flux; the dots on the coils are moving charges (speed ∝ current).');
  }
  function recCols() {
    if (st.mode === 'gen') return {
      head: ['#', 'N', 'B (T)', 'A (cm<sup>2</sup>)', 'f (Hz)', 'R (Ω)', 'ε<sub>max</sub> (V)', 'ε<sub>rms</sub> (V)', 'P (W)', 'τ<sub>max</sub> (N·m)'],
      cells: function (r) { return [r.N, sig3(r.B), sig3(r.A * 1e4), sig3(r.f), r.open ? '∞' : sig3(r.R), sig3(r.epsMax), sig3(r.epsRms), sig3(r.Pavg), sig3(r.tauMax)]; }
    };
    if (st.mode === 'xf') return {
      head: ['#', T('電源', 'Supply'), 'N<sub>1</sub>', 'N<sub>2</sub>', 'V<sub>1</sub> (V)', 'V<sub>2</sub> (V)', 'I<sub>1</sub> (A)', 'I<sub>2</sub> (A)', 'P<sub>2</sub> (W)'],
      cells: function (r) { return [r.dc ? T('直流', 'DC') : r.source === 'gen' ? T('發電機', 'gen.') : T('交流', 'AC'), r.N1, r.N2, sig3(r.V1), sig3(r.V2), sig3(r.I1), sig3(r.I2), sig3(r.P2)]; }
    };
    return {
      head: ['#', 'k<sub>1</sub>', 'k<sub>2</sub>', 'V<sub>L</sub> (kV)', 'I<sub>line</sub> (A)', T('線損', 'Loss') + ' (kW)', 'P<sub>u</sub> (MW)', 'V<sub>u</sub> (V)', 'η'],
      cells: function (r) { return [sig3(r.k1), sig3(r.k2), sig3(r.VL / 1e3), sig3(r.IL), sig3(r.Ploss / 1e3), sig3(r.Pu / 1e6), sig3(r.Vu), (r.eff * 100).toFixed(2) + '%']; }
    };
  }
  function renderRec() {
    const c = recCols(), rows = st.rows.filter(function (r) { return r.mode === st.mode; });
    let h = '<thead><tr>' + c.head.map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>';
    if (!rows.length) h += '<tr class="empty"><td colspan="' + c.head.length + '">' + T('按「記錄」把目前的設定與結果加進來比較。', 'Press “Record” to add the current settings and results here.') + '</td></tr>';
    rows.forEach(function (r, i) { h += '<tr' + (i === rows.length - 1 ? ' class="latest"' : '') + '><td>' + (i + 1) + '</td>' + c.cells(r).map(function (x) { return '<td>' + x + '</td>'; }).join('') + '</tr>'; });
    $('rec').innerHTML = h + '</tbody>';
    $('recTitle').textContent = st.mode === 'gen' ? T('記錄表：發電機', 'Records: generator') : st.mode === 'xf' ? T('記錄表：變壓器', 'Records: transformer') : T('記錄表：遠距輸電', 'Records: power line');
    $('recHint').textContent = st.mode === 'grid' ? T('記錄兩種升壓比，比較線電流與線損（用戶功率要差不多）。', 'Record two step-up ratios and compare the line current and the loss (keep the users’ power about the same).')
      : st.mode === 'gen' ? T('改變一個參數記錄一筆，看 ε_max、功率、力矩各和誰成正比。', 'Change one setting per row and see what ε_max, the power and the torque are proportional to.').replace('ε_max', 'ε max')
        : T('改變匝數或負載各記錄一筆，驗證 V2/V1 = N2/N1 與 I1V1 = I2V2。', 'Record a row for each change of turns or load and check V2/V1 = N2/N1 and I1V1 = I2V2.');
  }
  function record() {
    let r;
    if (st.mode === 'gen') r = Object.assign(C.genReport(G), { mode: 'gen' });
    else if (st.mode === 'xf') r = Object.assign(C.xfReport(X), { mode: 'xf' });
    else r = Object.assign(C.gridReport(Q), { mode: 'grid' });
    st.rows.push(r);
    if (st.rows.length > 60) st.rows.shift();
    renderRec();
    clickSound();
    const n = st.rows.filter(function (x) { return x.mode === st.mode; }).length;
    say(T('已記錄第 ', 'Recorded row ') + n + T(' 筆。', '.') + (st.mode === 'grid' ? T(' 線損 ', ' Line loss ') + fq(r.Ploss, 'W') + T('，效率 ', ', efficiency ') + (r.eff * 100).toFixed(2) + '%' : st.mode === 'gen' ? ' ε_max = ' + fq(r.epsMax, 'V') : ' V2 = ' + fq(r.V2, 'V')));
    emit('record', { mode: st.mode, row: r, rows: st.rows.filter(function (x) { return x.mode === st.mode; }) });
  }
  $('record').addEventListener('click', function () { userActed = true; record(); });
  $('clearAll').addEventListener('click', function () {
    st.rows = []; renderRec(); say(T('記錄表已清除。', 'The records have been cleared.'));
    emit('clear', {});
  });

  // =====================================================================
  // 控制項
  // =====================================================================
  function outs() {
    $('gNo').textContent = String(Math.round(val(el.gN)));
    $('gBo').textContent = val(el.gB).toFixed(val(el.gB) < 0.1 ? 3 : 2) + ' T';
    $('gLo').textContent = sig3(val(el.gL)) + ' cm';
    $('gWo').textContent = sig3(val(el.gW)) + ' cm';
    $('gFo').textContent = sig3(val(el.gF)) + ' Hz';
    $('gRo').textContent = st.open ? '∞ Ω' : fq(val(el.gR), 'Ω');
    $('gro').textContent = val(el.gr).toFixed(val(el.gr) < 1 ? 2 : 1) + ' Ω';
    $('xVo').textContent = sig3(val(el.xV)) + ' V';
    $('xFo').textContent = sig3(val(el.xF)) + ' Hz';
    $('xN1o').textContent = String(Math.round(val(el.xN1)));
    $('xN2o').textContent = String(Math.round(val(el.xN2)));
    $('xRLo').textContent = fq(val(el.xRL), 'Ω');
    $('tVgo').textContent = sig3(val(el.tVg)) + ' kV';
    $('tK1o').textContent = sig3(val(el.tK1));
    $('tRlo').textContent = sig3(val(el.tRl)) + ' Ω';
    $('tK2o').textContent = sig3(val(el.tK2));
    $('tPo').textContent = sig3(val(el.tP)) + ' MW';
    el.gR.disabled = st.open;
    $('xVlab').innerHTML = st.xsrc === 'dc' ? T('電池電壓 V', 'Battery voltage V') : T('電源電壓 V<sub>1</sub>（有效值）', 'Supply voltage V<sub>1</sub> (rms)');
  }
  let busy = false;
  function onParam(user) {
    if (busy) return;
    busy = true;
    if (user && !(window.LabShare && window.LabShare.restoring)) userActed = true;
    outs();
    const oldKey = key;
    recompute();
    if (key !== oldKey) {
      genRevs = 0; genSpin = 0;
      // 直流：開關接通時改參數，視為已經穩定（不製造假的脈衝）
      if (st.mode === 'xf' && st.xsrc === 'dc' && st.dc.phase !== 'idle') st.dc.t = Math.max(st.dc.t, 50 * dcTau());
    }
    layerKey = ''; wireKey = '';
    updateReadouts(); warn(); renderRec(); hints();
    if (view3 && view3.active) view3.rebuild();
    busy = false;
    if (user) emitMode();
    requestDraw();
  }
  ids.forEach(function (k) { el[k].addEventListener('input', function () { onParam(true); }); });
  $('gOpen').addEventListener('change', function () { st.open = $('gOpen').checked; onParam(true); });
  function setComm(on, user) {
    st.comm = !!on;
    $('gSlip').setAttribute('aria-pressed', String(!st.comm));
    $('gComm').setAttribute('aria-pressed', String(st.comm));
    onParam(user);
  }
  $('gSlip').addEventListener('click', function () { setComm(false, true); });
  $('gComm').addEventListener('click', function () { setComm(true, true); });
  function setSrc(s, user) {
    st.xsrc = s;
    ['xAC', 'xGen', 'xDC'].forEach(function (id, i) { $(id).setAttribute('aria-pressed', String(['ac', 'gen', 'dc'][i] === s)); });
    $('xSrcBox').hidden = s === 'gen';
    $('xFbox').hidden = s !== 'ac';
    $('xGenHint').hidden = s !== 'gen';
    $('xSwBox').hidden = s !== 'dc';
    if (s !== 'dc') { st.dc.phase = 'idle'; st.dc.t = 0; st.dc.im0 = 0; st.dc.pulsed = false; }
    updateSwitch();
    onParam(user);
  }
  $('xAC').addEventListener('click', function () { setSrc('ac', true); });
  $('xGen').addEventListener('click', function () { setSrc('gen', true); });
  $('xDC').addEventListener('click', function () { setSrc('dc', true); });
  function updateSwitch() {
    const on = st.dc.phase === 'on';
    $('xSwitch').textContent = on ? T('切斷開關', 'Open the switch') : T('接通開關', 'Close the switch');
    $('xSwitch').classList.toggle('on', on);
    $('xSwitch').setAttribute('aria-pressed', String(on));
  }
  $('xSwitch').addEventListener('click', function () {
    if (!(window.LabShare && window.LabShare.restoring)) userActed = true;
    const d = st.dc, cur = dcNow();
    if (d.phase === 'on') { d.phase = 'off'; d.im0 = cur.im; d.t = 0; say(T('切斷開關：磁通量消失，二次側出現反向的脈衝。', 'Switch opened: the flux collapses and the secondary gives a pulse the other way.')); }
    else { d.im0 = d.phase === 'off' ? cur.im : 0; d.phase = 'on'; d.t = 0; d.pulsed = true; d.steadySaid = false; say(T('接通開關：磁通量增加的這一小段時間，二次側才有電壓。', 'Switch closed: the secondary has a voltage only while the flux is building up.')); }
    switchSound(d.phase === 'on');
    updateSwitch();
    layerKey = '';
    updateReadouts(); warn();
    emitXf();
    if (view3 && view3.active) view3.rebuild();
    lastT = 0; requestDraw();
  });
  function setVrated(v, user) {
    st.vrated = v;
    $('tV110').setAttribute('aria-pressed', String(v === 110));
    $('tV220').setAttribute('aria-pressed', String(v === 220));
    onParam(user);
  }
  $('tV110').addEventListener('click', function () { setVrated(110, true); });
  $('tV220').addEventListener('click', function () { setVrated(220, true); });
  function setMode(m, user) {
    if (MODES.indexOf(m) < 0) return;
    st.mode = m;
    MODES.forEach(function (k) { $(MBTN[k]).setAttribute('aria-pressed', String(k === m)); $(MCARD[k]).hidden = k !== m; });
    $('record').disabled = false;
    if (voice) { voice.stop(0.1); voice = null; }
    syncKeys();
    if (m === 'grid' && view3) setView('2d', true);
    resize();
    onParam(user);
    cv.setAttribute('aria-label', m === 'gen' ? T('發電機：斜視圖、端視圖與示波器', 'Generator: oblique view, end view and oscilloscope') : m === 'xf' ? T('變壓器：鐵心、兩組線圈與示波器', 'Transformer: iron core, two coils and oscilloscope') : T('遠距輸電示意圖、能量條與電壓沿途', 'Power line sketch, energy bars and voltages along the way'));
  }
  MODES.forEach(function (k) {
    $(MBTN[k]).addEventListener('click', function () {
      setMode(k, true);
      say(k === 'gen' ? T('發電機模式。', 'Generator mode.') : k === 'xf' ? T('變壓器模式。', 'Transformer mode.') : T('遠距輸電模式。', 'Power line mode.'));
    });
  });
  function updatePlay() {
    $('play').textContent = st.playing ? T('暫停', 'Pause') : T('播放', 'Play');
    $('play').setAttribute('aria-pressed', String(!!st.playing));
  }
  $('play').addEventListener('click', function () {
    if (!(window.LabShare && window.LabShare.restoring)) userActed = true;
    st.playing = !st.playing; updatePlay(); lastT = 0;
    if (st.mode === 'gen') emitGen();
    if (!st.playing && st.mode === 'gen') say(T('暫停：θ = ', 'Paused: θ = ') + Math.round(C.degNorm(st.theta)) + '°' + T('，', ', ') + 'Φ = ' + fq(G.at(st.theta).phi, 'Wb') + T('，', ', ') + 'ε = ' + fq(G.at(st.theta).eps, 'V'));
    requestDraw();
  });

  // ---------------- 端視圖拖曳（蓋一層 div，觸控拖曳時不捲動頁面） ----------------
  const hit = document.createElement('div');
  hit.className = 'ag-hit';
  hit.setAttribute('aria-hidden', 'true');
  stage.appendChild(hit);
  function placeHit() {
    if (st.mode !== 'gen' || !box.endC) { hit.hidden = true; return; }
    hit.hidden = false;
    const e = box.endC, r = e.r * 1.05;
    hit.style.left = (cv.offsetLeft + e.x - r) + 'px';
    hit.style.top = (cv.offsetTop + e.y - r) + 'px';
    hit.style.width = (2 * r) + 'px'; hit.style.height = (2 * r) + 'px';
  }
  let drag = null;
  function angAt(ev) { const r = cv.getBoundingClientRect(), e = box.endC; return Math.atan2(-(ev.clientY - r.top - e.y), ev.clientX - r.left - e.x); }
  function setTheta(th, user) {
    st.theta = ((th % TAU) + TAU) % TAU;
    if (user && !(window.LabShare && window.LabShare.restoring)) userActed = true;
    if (view3 && view3.active) view3.update();
    requestDraw();
  }
  hit.addEventListener('pointerdown', function (ev) {
    ev.preventDefault();
    drag = { id: ev.pointerId, a: angAt(ev) };
    if (st.playing) { st.playing = false; updatePlay(); }
    try { hit.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    hit.classList.add('grabbing');
  });
  hit.addEventListener('pointermove', function (ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    const a = angAt(ev);
    let d = a - drag.a; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
    drag.a = a;
    setTheta(st.theta + d, true);
  });
  function endDrag(ev) {
    if (!drag || (ev && ev.pointerId !== drag.id)) return;
    drag = null; hit.classList.remove('grabbing');
    emitGen();
    say('θ = ' + Math.round(C.degNorm(st.theta)) + '°' + T('，', ', ') + 'Φ = ' + fq(G.at(st.theta).phi, 'Wb') + T('，', ', ') + 'ε = ' + fq(G.at(st.theta).eps, 'V'));
  }
  hit.addEventListener('pointerup', endDrag);
  hit.addEventListener('pointercancel', endDrag);

  // ---------------- 鍵盤 ----------------
  let kb = null;
  const kbItems = [];
  function syncKeys() {
    kbItems.length = 0;
    if (st.mode === 'gen') {
      kbItems.push({
        name: function () { return T('線圈角度', 'Coil angle'); },
        move: function (dx, dy, big) {
          const d = dx || -dy; if (!d) return false;
          if (st.playing) { st.playing = false; updatePlay(); }
          setTheta(Math.round((C.degNorm(st.theta) + d * (big ? 15 : 1)) % 360) * Math.PI / 180, true);
          emitGen();
          return true;
        },
        describe: function () { const s = G.at(st.theta); return 'θ = ' + Math.round(C.degNorm(st.theta)) + '°, Φ = ' + fq(s.phi, 'Wb') + ', ε = ' + fq(s.eps, 'V'); }
      });
    } else {
      kbItems.push({
        name: function () { return st.mode === 'xf' ? T('變壓器', 'Transformer') : T('輸電示意圖', 'Power line'); },
        move: function () { return false; },
        describe: function () {
          return st.mode === 'xf' ? 'V1 = ' + fq(X.V1, 'V') + ', V2 = ' + fq(X.V2, 'V') + ', I1 = ' + fq(X.I1, 'A') + ', I2 = ' + fq(X.I2, 'A')
            : T('用戶電壓 ', 'Users’ voltage ') + fq(Q.Vu, 'V') + T('，線損 ', ', loss ') + fq(Q.Ploss, 'W') + T('，效率 ', ', efficiency ') + (Q.eff * 100).toFixed(2) + '%';
        }
      });
    }
    if (kb && kb.index() >= kbItems.length) kb.select(0);
  }
  syncKeys();
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('交流發電機與變壓器畫布：發電機模式用左右方向鍵轉動線圈（Shift 每次 15°）。P 播放或暫停，R 記錄。',
        'AC generator and transformer canvas: in the Generator mode the left and right arrow keys turn the coil (Shift: 15° at a time). P plays or pauses, R records.'),
      items: kbItems,
      onChange: function () { requestDraw(); }
    });
  }
  cv.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); userActed = true; record(); }
    else if (e.key === 'p' || e.key === 'P') { e.preventDefault(); $('play').click(); }
  });

  // =====================================================================
  // 3D 檢視（three.js 以 import() 延遲載入；場景在 ac-generator-3d.js）
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
    return { mode: st.mode, G: G, theta: st.theta, X: X, xnow: X ? xfNow() : null, dc: st.xsrc === 'dc', show3: st.show3, key: key, playing: st.playing, comm: st.comm, open: st.open, turns: turnsScale(),
      dcRef1: DC ? DC.imFinal : 1, dcRef2: DC ? DC.v2Peak / DC.RL : 1 };
  }
  function setPressed3(mode) { $('view2d').setAttribute('aria-pressed', String(mode === '2d')); $('view3d').setAttribute('aria-pressed', String(mode === '3d')); }
  function setView(mode, quiet) {
    if (mode === '3d') {
      if (st.mode === 'grid') { setPressed3('2d'); viewMsg.textContent = T('輸電模式只有 2D 示意圖；3D 檢視可以看發電機與變壓器。', 'The power line has a 2D sketch only; the 3D view shows the generator and the transformer.'); return; }
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed3('3d');
      if (!webglAvailable() || !window.ACGenerator3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        view3 = window.ACGenerator3D.create(lib, {
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
      if (quiet) viewMsg.textContent = T('輸電模式只有 2D 示意圖，已切回 2D。', 'The power line has a 2D sketch only, so the view switched back to 2D.');
      else if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
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
  [['s3field', 'field'], ['s3vec', 'vec'], ['s3dots', 'dots']].forEach(function (p) {
    $(p[0]).addEventListener('change', function () { st.show3[p[1]] = $(p[0]).checked; if (view3 && view3.active) view3.rebuild(); });
  });

  // =====================================================================
  // 分享連結：線圈角度與直流開關（滑桿、按鈕、勾選框由 classroom.js 自動記錄）
  // =====================================================================
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { th: Math.round(C.degNorm(st.theta) * 10) / 10, play: st.playing ? 1 : 0 }; },
    set: function (o) {
      if (!o) return;
      if (isFinite(+o.th)) st.theta = (((+o.th) % 360 + 360) % 360) * Math.PI / 180;
      if (o.play === 0 || o.play === 1) { st.playing = !!o.play; updatePlay(); }
      requestDraw();
    }
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  function onTheme() {
    readTokens(); layerKey = ''; roKey = ''; wireKey = '';
    updateReadouts(); renderRec();
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  window.addEventListener('lab:themechange', onTheme);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', onTheme);
  }
  window.addEventListener('lab:langchange', function () { layerKey = ''; roKey = ''; outs(); updateReadouts(); renderRec(); hints(); warn(); updatePlay(); updateSwitch(); setMode(st.mode, false); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastT = 0; requestDraw(); } });
  outs(); updateSoundButton(); updatePlay(); updateSwitch();
  recompute();
  setMode('gen', false);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } else placeHit(); }).observe(stage);
  }
  window.addEventListener('resize', resize);
  resize();
  // 測試介面（Playwright、縮圖用）
  window.__ag = {
    st: st, G: function () { return G; }, X: function () { return X; }, Q: function () { return Q; }, DC: function () { return DC; },
    setMode: setMode, setTheta: setTheta, record: record, view3: function () { return view3; }, data: function () { return st.mode === 'gen' ? genData() : st.mode === 'xf' ? xfData() : C.gridReport(Q); }
  };
})();
