/* current-magnetic-field.js — 「電流的磁效應：直導線、線圈與螺線管的磁場」頁面程式
 * 物理全部在 js/current-magnetic-field-core.js；3D 場景在 js/current-magnetic-field-3d.js（three.js 延遲載入）。
 * 模式：oersted（厄斯特實驗與正切法）、wire（長直導線）、coil（圓線圈）、solenoid（螺線管）。
 */
(function () {
  'use strict';
  const C = window.CurrentMagneticFieldCore, D = window.LabDraw;
  if (!C || !D) return;
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const $ = function (id) { return document.getElementById(id); };
  const val = function (el) { return window.LabNum ? +window.LabNum.value(el) : +el.value; };
  const setVal = function (el, v) { if (window.LabNum) window.LabNum.set(el, v); else { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
  const DEG = Math.PI / 180;
  const clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  const FONT = D.FONT;
  const font = function (px, w) { return (w || '600') + ' ' + px + 'px ' + FONT; };
  const reduced = D.reducedMotion();
  const EN = function () { return !!(window.LabSettings && window.LabSettings.lang === 'en'); };

  // ---------------- 狀態 ----------------
  const st = {
    mode: 'oersted', s: 1, above: true, inst: 'ideal', earth: true, graph: 'pos',
    show: { labels: true, vec: true, lines: true, map: true, needles: false },
    show3: { lines: true, needles: false, filings: false },
    probe: { wire: { x: 2, y: 0 }, coil: { x: 0, y: 0 }, solenoid: { x: 0, y: 0 } },
    rowsO: [], rowsP: []
  };
  // 含誤差模式的儀器偏差（每次開頁不同）：電流表 ±0.4%、刻度盤零點偏 1°～2°
  const cal = { amm: (Math.random() * 2 - 1) * 0.004, zero: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random()) };
  const needle = { phi: 0, om: 0, stuck: false };
  let atRest = true, restT = 0, userDirty = false, kickDone = false;

  const el = {
    I: $('I'), h: $('h'), alpha: $('alpha'), d: $('d'), dial: $('dial'), loc: $('loc'), noEarth: $('noEarth'),
    N: $('N'), R: $('R'), Ns: $('Ns'), Ls: $('Ls'), Rs: $('Rs'), px: $('px'), py: $('py')
  };
  const cv = $('cv'), ctx = cv.getContext('2d'), gcv = $('gcv'), gctx = gcv.getContext('2d');
  const stage = $('stage');

  // ---------------- 顏色 ----------------
  const tok = {};
  function readTokens() {
    const cs = getComputedStyle(document.documentElement);
    ['copper', 'brass', 'dial', 'ink', 'needle-n', 'needle-s', 'table', 'glass', 'earth'].forEach(function (k) { tok[k] = cs.getPropertyValue('--cm-' + k).trim(); });
  }
  readTokens();

  // ---------------- 參數 ----------------
  const isExp = function () { return st.mode !== 'oersted'; };
  function Iset() { return val(el.I); }
  function loc() { return C.earth(el.loc.value); }
  function oerParams() {
    return { I: Iset(), s: st.s, alpha: val(el.alpha), above: st.above, h: val(el.h) / 100, d: val(el.d) / 100, BH: loc().H, earth: st.earth };
  }
  let ofCache = null, ofKey = '';
  function ofield() {
    const o = oerParams(), k = JSON.stringify(o);
    if (k !== ofKey) { ofKey = k; ofCache = C.oerstedField(o); }
    return ofCache;
  }
  function shapeParams(shape) {
    shape = shape || st.mode;
    const P = { shape: shape, I: Iset(), s: st.s };
    if (shape === 'coil') { P.N = Math.round(val(el.N)); P.R = val(el.R) / 100; }
    if (shape === 'solenoid') { P.N = Math.round(val(el.Ns)); P.L = val(el.Ls) / 100; P.R = val(el.Rs) / 100; }
    return P;
  }
  const RANGE = { wire: { x: 8, y: 8 }, coil: { x: 15, y: 10 }, solenoid: { x: 20, y: 10 } };
  function zeroOffset() { return (st.inst === 'real' ? cal.zero : 0) + val(el.dial); }
  function ammeter() {
    const I = Iset();
    return st.inst === 'real' ? Math.round(I * (1 + cal.amm) * 100) / 100 : Math.round(I * 100) / 100;
  }
  function reading() {
    const r = C.wrapDeg(needle.phi / DEG - zeroOffset());
    return st.inst === 'real' ? Math.round(r * 10) / 10 : r;
  }
  function probeField() {
    const P = shapeParams(), p = st.probe[st.mode] || { x: 0, y: 0 };
    const b = C.planeField(P, p.x / 100, p.y / 100);
    const f = C.formulaAt(P, p.x / 100, p.y / 100);
    return { P: P, x: p.x, y: p.y, bx: b.bx, by: b.by, B: Math.hypot(b.bx, b.by), f: f, inside: insideConductor(P, p.x, p.y) };
  }
  function insideConductor(P, x, y) { // cm
    if (P.shape === 'wire') return Math.hypot(x, y) < 0.3;
    if (P.shape === 'coil') return Math.hypot(x, Math.abs(y) - P.R * 100) < 0.3;
    return Math.abs(Math.abs(y) - P.R * 100) < 0.08 && Math.abs(x) <= P.L * 50 + 0.08;
  }

  // ---------------- 數字格式 ----------------
  function fmtB(Bt, sig) { // T → 「12.3 μT」或「1.26 mT」
    const u = Math.abs(Bt) * 1e6;
    if (!isFinite(u)) return '—';
    if (u >= 1000) return (u / 1000).toPrecision(sig || 3) + ' mT';
    if (u >= 0.01 || u === 0) return u.toPrecision(sig || 3).replace(/\.?0+e/, 'e') + ' μT';
    return u.toExponential(1) + ' μT';
  }
  const f2 = function (x) { return (Math.round(x * 100) / 100).toFixed(2); };
  const f1 = function (x) { return (Math.round(x * 10) / 10).toFixed(1); };
  // 長度：滑桿可輸入到小數第 2 位，顯示到實際用到的位數（整十分位顯示一位，否則兩位），讀數、表格與計算一致
  const fL = function (x) { return Math.abs(x * 10 - Math.round(x * 10)) < 1e-6 ? f1(x) : f2(x); };
  const minus = function (s) { s = String(s); if (/^-0(\.0+)?$/.test(s)) s = s.slice(1); return s.replace(/^-/, '−'); };
  /**
   * 畫布上的「含下標」文字：parts = ['B', ['I'], ' = 12 μT']，陣列表示下標（不用 Unicode 下標字元）。
   * 傳回寬度；align 為 left／center／right。
   */
  function rich(g, parts, x, y, color, align, px, weight) {
    const fm = font(px, weight || '600'), fs = font(Math.round(px * 0.72 * 10) / 10, weight || '600');
    let w = 0;
    g.font = fm;
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
  const subI = function () { return 'I'; };
  function sideWord(deg) {
    if (Math.abs(deg) < 0.05) return T('不偏', 'no deflection');
    return deg > 0 ? T('偏東', 'east') : T('偏西', 'west');
  }

  // ---------------- 畫布尺寸 ----------------
  let W = 0, H = 0, dpr = 1;
  function canvasH(w) {
    const narrow = w < 640;
    if (st.mode === 'oersted') return narrow ? Math.round(w * 1.62) : Math.round(clamp(w * 0.6, 430, 560));
    if (st.mode === 'wire') return narrow ? Math.round(w * 0.95) : Math.round(clamp(w * 0.62, 320, 540));
    if (st.mode === 'coil') return narrow ? Math.round(w * 0.75) : Math.round(clamp(w * 0.6, 300, 520));
    return narrow ? Math.round(w * 0.62) : Math.round(clamp(w * 0.52, 260, 480));
  }
  function resize() {
    const w = cv.clientWidth || 600;
    const h = canvasH(w);
    cv.style.height = h + 'px';
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = w; H = h;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    layerKey = ''; geomKey = ''; mapKey = '';
    requestDraw();
  }

  // =====================================================================
  // 厄斯特實驗：版面
  // =====================================================================
  function oerLayout() {
    const m = 12, narrow = W < 640;
    if (!narrow) {
      const S = Math.min(H - 2 * m, W * 0.6);
      const top = { x: m, y: (H - S) / 2, w: S, h: S };
      const rx = m + S + 14, rw = W - rx - m;
      const ph = (H - 3 * m) / 2;
      return { narrow: false, top: top, side: { x: rx, y: m, w: rw, h: ph }, vec: { x: rx, y: 2 * m + ph, w: rw, h: ph } };
    }
    const S = W - 2 * m;
    const top = { x: m, y: m, w: S, h: S };
    const py = 2 * m + S, ph = H - py - m, pw = (W - 3 * m) / 2;
    return { narrow: true, top: top, side: { x: m, y: py, w: pw, h: ph }, vec: { x: 2 * m + pw, y: py, w: pw, h: ph } };
  }
  function topGeom(L) {
    const t = L.top;
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
    const Rd = t.w * 0.36;
    const k = 1.08 * Rd / 6; // px/cm：側移 6 cm 時導線在刻度盤外緣附近
    return { cx: cx, cy: cy, Rd: Rd, k: k };
  }

  // ---- 靜態圖層：背景＋羅盤刻度盤（只有尺寸、主題、零點改變時重畫） ----
  let layer = null, layerKey = '';
  function buildLayer() {
    const key = [W, H, dpr, D.ver, st.mode, zeroOffset().toFixed(3), EN(), st.show.labels].join('|');
    if (key === layerKey && layer) return;
    layerKey = key;
    if (!layer) layer = document.createElement('canvas');
    layer.width = cv.width; layer.height = cv.height;
    const g = layer.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(g, W, H);
    if (st.mode !== 'oersted') return;
    const L = oerLayout(), G = topGeom(L);
    // 桌面（木紋淡色圓角面）
    const t = L.top;
    g.save();
    D.roundRect(g, t.x, t.y, t.w, t.h, 12);
    const tg = g.createLinearGradient(t.x, t.y, t.x + t.w, t.y + t.h);
    tg.addColorStop(0, D.shade(tok.table, D.dark ? 0.05 : 0.25));
    tg.addColorStop(1, D.shade(tok.table, D.dark ? -0.15 : -0.04));
    g.fillStyle = tg; g.fill();
    g.clip();
    g.globalAlpha = D.dark ? 0.08 : 0.1;
    g.strokeStyle = D.shade(tok.table, -0.5); g.lineWidth = 1;
    for (let i = -12; i < 40; i++) { // 很淡的木紋
      g.beginPath();
      const y0 = t.y + i * 17;
      g.moveTo(t.x, y0);
      g.bezierCurveTo(t.x + t.w * 0.3, y0 + 9 * Math.sin(i), t.x + t.w * 0.7, y0 - 7 * Math.cos(i * 1.7), t.x + t.w, y0 + 4);
      g.stroke();
    }
    g.restore();
    // 刻度盤的接觸陰影
    D.contactShadow(g, G.cx, G.cy + G.Rd * 0.98, G.Rd * 0.95, 0.1);
    // 黃銅外框
    const Ro = G.Rd + Math.max(8, G.Rd * 0.07);
    g.save();
    g.shadowColor = D.dark ? 'rgba(0,0,0,0.55)' : D.alpha(D.c.text, 0.28); g.shadowBlur = 14; g.shadowOffsetY = 4;
    const bg = g.createRadialGradient(G.cx - Ro * 0.3, G.cy - Ro * 0.35, Ro * 0.2, G.cx, G.cy, Ro);
    bg.addColorStop(0, D.shade(tok.brass, 0.45)); bg.addColorStop(0.6, tok.brass); bg.addColorStop(1, D.shade(tok.brass, -0.35));
    g.fillStyle = bg; g.beginPath(); g.arc(G.cx, G.cy, Ro, 0, 2 * Math.PI); g.fill();
    g.restore();
    g.strokeStyle = D.alpha(D.shade(tok.brass, 0.7), 0.7); g.lineWidth = 1.2;
    g.beginPath(); g.arc(G.cx, G.cy, Ro - 1, Math.PI * 1.05, Math.PI * 1.75); g.stroke();
    // 刻度盤面
    const fg = g.createRadialGradient(G.cx - G.Rd * 0.25, G.cy - G.Rd * 0.3, G.Rd * 0.1, G.cx, G.cy, G.Rd);
    fg.addColorStop(0, D.shade(tok.dial, 0.5)); fg.addColorStop(1, D.shade(tok.dial, -0.06));
    g.fillStyle = fg; g.beginPath(); g.arc(G.cx, G.cy, G.Rd, 0, 2 * Math.PI); g.fill();
    g.strokeStyle = D.alpha(tok.ink, 0.35); g.lineWidth = 1; g.stroke();
    // 刻度：每 1° 一條、5° 中、10° 長；0 在北與南、90 在東與西（正切檢流計的刻法）
    const z0 = zeroOffset();
    g.save();
    g.translate(G.cx, G.cy);
    g.rotate(z0 * DEG);
    g.strokeStyle = tok.ink; g.lineCap = 'butt';
    for (let a = 0; a < 360; a++) {
      const L10 = a % 10 === 0, L5 = a % 5 === 0;
      const r1 = G.Rd - 2, r0 = G.Rd - (L10 ? G.Rd * 0.11 : L5 ? G.Rd * 0.075 : G.Rd * 0.045);
      const s = Math.sin(a * DEG), c = -Math.cos(a * DEG);
      g.lineWidth = L10 ? 1.4 : L5 ? 1.1 : 0.7;
      g.globalAlpha = L10 ? 0.95 : L5 ? 0.8 : 0.55;
      g.beginPath(); g.moveTo(s * r0, c * r0); g.lineTo(s * r1, c * r1); g.stroke();
    }
    g.globalAlpha = 1;
    const nf = Math.max(9, Math.round(G.Rd * 0.085));
    g.fillStyle = tok.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = font(nf, '600');
    for (let a = 0; a < 360; a += 10) {
      if (a % 90 === 0) continue;
      if (G.Rd < 120 && a % 30 !== 0) continue;
      const lab = String(a <= 90 ? a : a <= 180 ? 180 - a : a <= 270 ? a - 180 : 360 - a);
      const rr = G.Rd * 0.8;
      g.save(); g.translate(Math.sin(a * DEG) * rr, -Math.cos(a * DEG) * rr); g.rotate(a * DEG);
      g.fillText(lab, 0, 0); g.restore();
    }
    // 四個方位：N 紅色
    const cf = Math.max(12, Math.round(G.Rd * 0.13));
    [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(function (p) {
      const rr = G.Rd * 0.78;
      g.save(); g.translate(Math.sin(p[1] * DEG) * rr, -Math.cos(p[1] * DEG) * rr); g.rotate(p[1] * DEG);
      g.font = font(cf, '800'); g.fillStyle = p[0] === 'N' ? tok['needle-n'] : tok.ink;
      g.fillText(p[0], 0, 0); g.restore();
    });
    // 中央的十字細線
    g.strokeStyle = D.alpha(tok.ink, 0.18); g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, -G.Rd * 0.66); g.lineTo(0, G.Rd * 0.66); g.moveTo(-G.Rd * 0.66, 0); g.lineTo(G.Rd * 0.66, 0); g.stroke();
    g.restore();
    // 磁北標示（桌面角落）
    const nx = t.x + 26, ny = t.y + 34;
    D.arrow(g, nx, ny + 18, nx, ny - 14, tok.earth, 2.4);
    D.haloText(g, T('磁北', 'mag. N'), nx, ny + 32, tok.earth, 'center', 'middle', font(11, '700'));
    // 比例尺（1 cm）
    const sbx = t.x + t.w - 16 - G.k * 2, sby = t.y + t.h - 16;
    g.strokeStyle = D.c.text; g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(sbx, sby); g.lineTo(sbx + G.k * 2, sby); g.moveTo(sbx, sby - 4); g.lineTo(sbx, sby + 4); g.moveTo(sbx + G.k * 2, sby - 4); g.lineTo(sbx + G.k * 2, sby + 4); g.stroke();
    D.haloText(g, '2 cm', sbx + G.k, sby - 9, D.c.text, 'center', 'alphabetic', font(11, '600'));
    // 兩個小面板的底
    [L.side, L.vec].forEach(function (p) {
      g.save();
      g.shadowColor = D.dark ? 'rgba(0,0,0,0.4)' : D.alpha(D.c.text, 0.12); g.shadowBlur = 8; g.shadowOffsetY = 2;
      D.roundRect(g, p.x, p.y, p.w, p.h, 10);
      g.fillStyle = D.alpha(D.c.surface, D.dark ? 0.55 : 0.85); g.fill();
      g.restore();
      D.roundRect(g, p.x + 0.5, p.y + 0.5, p.w - 1, p.h - 1, 10);
      g.strokeStyle = D.alpha(D.c.border || D.c.muted, 0.9); g.lineWidth = 1; g.stroke();
    });
  }

  // ---- 厄斯特：動態部分 ----
  let flowT = 0;
  function wireScreen(G) {
    const a = val(el.alpha) * DEG, d = val(el.d);
    const ux = Math.sin(a), uy = -Math.cos(a), vx = Math.cos(a), vy = Math.sin(a);
    return { ux: ux, uy: uy, vx: vx, vy: vy, x: G.cx - d * G.k * vx, y: G.cy - d * G.k * vy };
  }
  function drawWireTop(g, L, G, part) {
    const ws = wireScreen(G), t = L.top, span = t.w * 0.75;
    const x0 = ws.x - ws.ux * span, y0 = ws.y - ws.uy * span, x1 = ws.x + ws.ux * span, y1 = ws.y + ws.uy * span;
    const wpx = Math.max(6, G.k * 0.32);
    g.save();
    D.roundRect(g, t.x, t.y, t.w, t.h, 12); g.clip();
    if (part === 'shadow') { // 上方導線投在桌面／刻度盤上的影子：越高越淡越偏
      const off = 4 + val(el.h) * 1.6;
      g.strokeStyle = D.shadowInk(D.dark ? 0.35 : 0.18 * (1 - val(el.h) / 16));
      g.lineWidth = wpx * (1 + val(el.h) * 0.05); g.lineCap = 'round';
      g.filter = 'blur(' + (1 + val(el.h) * 0.4).toFixed(1) + 'px)';
      g.beginPath(); g.moveTo(x0 + off * 0.6, y0 + off); g.lineTo(x1 + off * 0.6, y1 + off); g.stroke();
      g.filter = 'none';
      g.restore();
      return;
    }
    if (part === 'hidden') { // 下方導線被刻度盤擋住的那段：虛線（隱藏線）
      g.beginPath(); g.arc(G.cx, G.cy, G.Rd + Math.max(8, G.Rd * 0.07), 0, 2 * Math.PI); g.clip();
      g.setLineDash([7, 6]); g.strokeStyle = D.alpha(tok.copper, 0.85); g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]);
      g.restore();
      return;
    }
    // 上方的導線：刻度盤範圍內畫成半透明（看得到底下的磁針），範圍外照常
    const Ro = G.Rd + Math.max(8, G.Rd * 0.07);
    const path = function (c) { c.moveTo(x0, y0); c.lineTo(x1, y1); };
    if (st.above) {
      g.save();
      g.beginPath(); g.rect(t.x, t.y, t.w, t.h); g.arc(G.cx, G.cy, Ro, 0, 2 * Math.PI, true); g.clip('evenodd');
      D.tube(g, path, tok.copper, wpx);
      g.restore();
      g.save();
      g.beginPath(); g.arc(G.cx, G.cy, Ro, 0, 2 * Math.PI); g.clip();
      g.globalAlpha = 0.42;
      D.tube(g, path, tok.copper, wpx);
      g.globalAlpha = 1;
      g.strokeStyle = D.alpha(D.shade(tok.copper, -0.35), 0.75); g.lineWidth = 1;
      [-1, 1].forEach(function (sd) {
        const ox = -ws.uy * sd * wpx / 2, oy = ws.ux * sd * wpx / 2;
        g.beginPath(); g.moveTo(x0 + ox, y0 + oy); g.lineTo(x1 + ox, y1 + oy); g.stroke();
      });
      g.restore();
    } else D.tube(g, path, tok.copper, wpx);
    // 電流的方向：沿導線移動的箭頭（電流越大越快；減少動態時不動）
    const I = Iset();
    if (I > 0) {
      const sp = 46, sgn = st.s, ph = ((flowT * (20 + I * 22)) % sp + sp) % sp;
      g.fillStyle = D.c.equi; g.strokeStyle = D.alpha(D.c['canvas-bg'], 0.8); g.lineWidth = 1;
      for (let s0 = -span + ph; s0 < span; s0 += sp) {
        const ss = sgn > 0 ? s0 : -s0;
        const cx = ws.x + ws.ux * ss, cy = ws.y + ws.uy * ss;
        const dx = ws.ux * sgn, dy = ws.uy * sgn, hw = wpx * 0.55;
        g.beginPath();
        g.moveTo(cx + dx * hw * 1.4, cy + dy * hw * 1.4);
        g.lineTo(cx - dx * hw + -dy * hw, cy - dy * hw + dx * hw);
        g.lineTo(cx - dx * hw * 0.3, cy - dy * hw * 0.3);
        g.lineTo(cx - dx * hw - -dy * hw, cy - dy * hw - dx * hw);
        g.closePath(); g.fill(); g.stroke();
      }
    }
    g.restore();
    return { x0: x0, y0: y0, x1: x1, y1: y1, ws: ws };
  }
  function needlePath(g, len, wid) {
    g.beginPath();
    g.moveTo(0, -len); g.lineTo(wid, 0); g.lineTo(0, len); g.lineTo(-wid, 0); g.closePath();
  }
  function drawNeedle(g, G) {
    const len = G.Rd * 0.8, wid = Math.max(5, G.Rd * 0.065);
    g.save();
    g.translate(G.cx, G.cy);
    // 影子
    g.save();
    g.translate(3, 5); g.rotate(needle.phi);
    g.filter = 'blur(2.5px)'; g.fillStyle = D.shadowInk(D.dark ? 0.45 : 0.22);
    needlePath(g, len, wid); g.fill(); g.filter = 'none';
    g.restore();
    g.rotate(needle.phi);
    // 北半（紅）：左右兩面一亮一暗，看起來是有稜的立體指針
    const nN = tok['needle-n'], nS = tok['needle-s'];
    [[nN, -1], [nS, 1]].forEach(function (p) {
      const col = p[0], dir = p[1];
      g.beginPath(); g.moveTo(0, dir * len); g.lineTo(wid, 0); g.lineTo(0, 0); g.closePath();
      g.fillStyle = D.shade(col, 0.22); g.fill();
      g.beginPath(); g.moveTo(0, dir * len); g.lineTo(-wid, 0); g.lineTo(0, 0); g.closePath();
      g.fillStyle = D.shade(col, -0.18); g.fill();
    });
    needlePath(g, len, wid);
    g.strokeStyle = D.alpha(D.shade(tok.ink, 0), 0.45); g.lineWidth = 0.8; g.stroke();
    g.restore();
    D.ball(ctx, G.cx, G.cy, Math.max(5, G.Rd * 0.06), tok.brass, { glow: 0 });
  }
  function drawGlass(g, G) {
    const gr = g.createLinearGradient(G.cx - G.Rd, G.cy - G.Rd, G.cx + G.Rd * 0.2, G.cy + G.Rd * 0.3);
    gr.addColorStop(0, D.alpha(tok.glass, D.dark ? 0.12 : 0.32));
    gr.addColorStop(0.45, D.alpha(tok.glass, 0.03));
    gr.addColorStop(1, D.alpha(tok.glass, 0));
    g.fillStyle = gr;
    g.beginPath(); g.arc(G.cx, G.cy, G.Rd, 0, 2 * Math.PI); g.fill();
    g.strokeStyle = D.alpha(tok.glass, D.dark ? 0.2 : 0.5); g.lineWidth = 2;
    g.beginPath(); g.arc(G.cx, G.cy, G.Rd * 0.93, Math.PI * 1.08, Math.PI * 1.42); g.stroke();
  }
  function drawOersted() {
    const L = oerLayout(), G = topGeom(L), f = ofield();
    if (!st.above) { drawWireTop(ctx, L, G, 'body'); }
    // 刻度盤已在靜態圖層；下方的導線被刻度盤擋住 → 重畫刻度盤會蓋掉它，所以下方導線先畫、再貼一次刻度盤區域
    if (!st.above) {
      ctx.save();
      ctx.beginPath(); ctx.arc(G.cx, G.cy, G.Rd + Math.max(8, G.Rd * 0.07) + 0.5, 0, 2 * Math.PI); ctx.clip();
      ctx.drawImage(layer, 0, 0, W, H);
      ctx.restore();
      drawWireTop(ctx, L, G, 'hidden');
    }
    // θ 弧：由刻度盤的 0 到指針
    const rd = reading(), z0 = zeroOffset();
    if (Math.abs(rd) >= 0.3 && st.show.labels) {
      const a0 = (z0 - 90) * DEG, a1 = (z0 + rd - 90) * DEG;
      ctx.strokeStyle = D.alpha(D.c.accent, 0.85); ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(G.cx, G.cy, G.Rd * 0.52, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
    }
    drawNeedle(ctx, G);
    drawGlass(ctx, G);
    if (st.above) { drawWireTop(ctx, L, G, 'shadow'); drawWireTop(ctx, L, G, 'body'); }
    // 標示
    if (st.show.labels) {
      const ws = wireScreen(G), t = L.top;
      // 導線名稱放在導線上靠外緣的地方
      const lx = clamp(ws.x + ws.ux * G.Rd * 1.18 + ws.vx * 14, t.x + 40, t.x + t.w - 40);
      const ly = clamp(ws.y + ws.uy * G.Rd * 1.18 + ws.vy * 14, t.y + 14, t.y + t.h - 10);
      D.pill(ctx, (st.above ? T('導線（在上方）', 'Wire (above)') : T('導線（在下方）', 'Wire (below)')), lx, ly, tok.copper, 'center', font(11.5));
      // 讀數
      const txt = 'θ = ' + minus(f1(Math.abs(rd))) + '°  ' + sideWord(rd);
      D.pill(ctx, txt, G.cx, G.cy + G.Rd + Math.max(8, G.Rd * 0.07) + 26, D.c.accent, 'center', font(13, '700'));
    }
    drawSidePanel(L.side, f);
    drawVecPanel(L.vec, f);
    drawKeyFocusOer(L, G);
  }
  // ---- 側視圖：沿導線看 ----
  function sideGeom(p) {
    const above = st.above, pad = 10, titleH = 22;
    const zMin = above ? -2.5 : -11, zMax = above ? 11 : 2.5, xHalf = 7.5;
    const k = Math.min((p.w - 2 * pad) / (2 * xHalf), (p.h - 2 * pad - titleH) / (zMax - zMin));
    const cx = p.x + p.w / 2, cy = p.y + titleH + pad + zMax * k;
    return { k: k, cx: cx, cy: cy, X: function (x) { return cx + x * k; }, Y: function (z) { return cy - z * k; } };
  }
  function drawSidePanel(p, f) {
    const g = ctx, S = sideGeom(p);
    const narrow = p.w < 230;
    D.haloText(g, st.show.labels ? (narrow ? T('側視（沿導線看）', 'Side view') : T('側視圖：沿導線往前看', 'Side view, looking along the wire')) : '', p.x + 10, p.y + 16, D.c.muted, 'left', 'alphabetic', font(narrow ? 11 : 12, '700'));
    g.save();
    D.roundRect(g, p.x, p.y, p.w, p.h, 10); g.clip();
    const h = val(el.h), d = val(el.d), zw = st.above ? h : -h;
    // 桌面；導線在下方時，羅盤架在不導磁的支架上，導線從支架下穿過
    const tz = st.above ? -0.6 : -(h + 0.5);
    const tb = S.Y(tz);
    g.fillStyle = D.alpha(tok.table, D.dark ? 0.55 : 0.75);
    g.fillRect(p.x, tb, p.w, Math.max(0, p.y + p.h - tb));
    g.fillStyle = D.alpha(D.shade(tok.table, -0.25), 0.8);
    g.fillRect(p.x, tb, p.w, 1.5);
    if (!st.above) { // 支架（壓克力，半透明）
      g.fillStyle = D.alpha(tok.glass, D.dark ? 0.16 : 0.5);
      g.strokeStyle = D.alpha(D.c.muted, 0.6); g.lineWidth = 1;
      g.fillRect(p.x, S.Y(-0.6), p.w, 0.15 * S.k); // 壓克力板
      [-6.9, 6.3].forEach(function (x) { g.fillRect(S.X(x), S.Y(-0.75), 0.6 * S.k, (h - 0.25) * S.k); g.strokeRect(S.X(x), S.Y(-0.75), 0.6 * S.k, (h - 0.25) * S.k); });
    }
    // 羅盤在 x = 0（磁針），導線在 x = −d
    D.block(g, S.X(-4.6), S.Y(0.6), 9.2 * S.k, 1.2 * S.k, tok.brass, { r: 3 });
    g.fillStyle = tok['needle-n'];
    g.fillRect(S.X(-0.25), S.Y(0.2), 0.5 * S.k, 0.4 * S.k);
    // 磁力線（通過磁針的那一圈）
    const xw = S.X(-d), yw = S.Y(zw), rr = Math.hypot(h, d) * S.k;
    const I = Iset();
    if (I > 0 && st.show.vec) {
      g.strokeStyle = D.alpha(D.c.neg, 0.55); g.lineWidth = 1.4; g.setLineDash([5, 4]);
      g.beginPath(); g.arc(xw, yw, rr, 0, 2 * Math.PI); g.stroke(); g.setLineDash([]);
      // 圈上的方向箭頭：從畫面外看，電流 ⊗（遠離觀察者）時順時針
      const cw = st.s > 0;
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4;
        const x = xw + rr * Math.cos(a), y = yw + rr * Math.sin(a);
        const tx = cw ? -Math.sin(a) : Math.sin(a), ty = cw ? Math.cos(a) : -Math.cos(a);
        D.arrow(g, x - tx * 6, y - ty * 6, x + tx * 6, y + ty * 6, D.alpha(D.c.neg, 0.75), 1.6);
      }
      // 磁針處的 B導線（實線）與它的水平分量（虛線）
      const BI = f.BI || 0, scl = Math.min(40, 0.65 * rr + 12);
      if (BI > 0) {
        const bxs = (f.BIx * Math.cos(val(el.alpha) * DEG) - f.BIy * Math.sin(val(el.alpha) * DEG)) / BI; // 沿 v
        const bzs = f.BIz / BI;
        const ox = S.X(0), oy = S.Y(0);
        D.arrow(g, ox, oy, ox + bxs * scl, oy - bzs * scl, D.c.neg, 2.4, st.show.labels ? { label: 'B', sub: 'I' } : null);
        if (Math.abs(d) > 0.05) D.arrow(g, ox, oy, ox + bxs * scl, oy, D.alpha(D.c.neg, 0.7), 1.6, { dash: [4, 3] });
      }
    }
    // 導線截面：⊗（電流遠離觀察者）或 ⊙
    const wr = Math.max(6, 0.45 * S.k);
    D.ball(g, xw, yw, wr, tok.copper, { glow: 0 });
    g.strokeStyle = D.c['canvas-bg']; g.fillStyle = D.c['canvas-bg']; g.lineWidth = 1.6;
    if (I > 0) {
      if (st.s > 0) { const q = wr * 0.5; g.beginPath(); g.moveTo(xw - q, yw - q); g.lineTo(xw + q, yw + q); g.moveTo(xw + q, yw - q); g.lineTo(xw - q, yw + q); g.stroke(); }
      else { g.beginPath(); g.arc(xw, yw, wr * 0.25, 0, 2 * Math.PI); g.fill(); }
    }
    // 距離標示
    if (st.show.labels) {
      const xd = S.X(-d) + (d > 0 ? -wr - 10 : wr + 10);
      g.strokeStyle = D.c.muted; g.lineWidth = 1;
      g.beginPath(); g.moveTo(xd, S.Y(0)); g.lineTo(xd, yw); g.stroke();
      [S.Y(0), yw].forEach(function (y) { g.beginPath(); g.moveTo(xd - 3, y); g.lineTo(xd + 3, y); g.stroke(); });
      const rt = 'r = ' + f1(h) + ' cm';
      g.font = font(11, '700');
      const rw = g.measureText(rt).width;
      let left = d > 0;
      if (left && xd - 4 - rw < p.x + 4) left = false;
      else if (!left && xd + 4 + rw > p.x + p.w - 4) left = true;
      D.haloText(g, rt, xd + (left ? -4 : 4), (S.Y(0) + yw) / 2, D.c.text, left ? 'right' : 'left', 'middle', font(11, '700'));
      if (Math.abs(d) > 0.05) D.haloText(g, 'd = ' + minus(f1(d)) + ' cm', S.X(0), S.Y(st.above ? -0.6 : 0.6) + (st.above ? 13 : -9), D.c.muted, 'center', 'middle', font(10.5, '600'));
      const a = val(el.alpha);
      const along = Math.abs(a) < 0.5 ? T('從南往北看', 'looking north') : T('沿導線看', 'along the wire');
      D.haloText(g, (I > 0 ? (st.s > 0 ? '⊗ ' : '⊙ ') : '') + along, p.x + p.w - 8, p.y + p.h - 8, D.c.muted, 'right', 'alphabetic', font(10.5, '600'));
    }
    g.restore();
  }
  // ---- 向量圖：B地 + B導線 = B ----
  function drawVecPanel(p, f) {
    const g = ctx, narrow = p.w < 230;
    D.haloText(g, st.show.labels ? (narrow ? T('向量圖（俯視）', 'Vectors') : T('磁場向量（俯視，北朝上）', 'Field vectors (top view, north up)')) : '', p.x + 10, p.y + 16, D.c.muted, 'left', 'alphabetic', font(narrow ? 11 : 12, '700'));
    const pad = 16, top = p.y + 30, bot = p.y + p.h - (st.show.labels ? (narrow ? 56 : 44) : 14);
    const BE = f.BE, bx = f.Bx, by = f.By, bix = f.BIx, biy = f.BIy;
    const xs = [0, bx, bix], ys = [0, BE, by];
    const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    const span = Math.max(x1 - x0, 1e-12), spanY = Math.max(y1 - y0, 1e-12);
    let k = Math.min((p.w - 2 * pad) / span, (bot - top) / spanY);
    const ref = loc().H;
    k = Math.min(k, (bot - top) * 0.75 / ref);
    const ox = p.x + p.w / 2 - (x0 + x1) / 2 * k, oy = bot - (-y0) * k - ((bot - top) - spanY * k) / 2;
    g.save();
    D.roundRect(g, p.x, p.y, p.w, p.h, 10); g.clip();
    if (st.show.vec) {
      if (BE > 0) D.arrow(g, ox, oy, ox, oy - BE * k, tok.earth, 2.6, st.show.labels ? { label: 'B', sub: 'H', lx: -14, ly: 8 } : null);
      if (f.BIh > 1e-12) { // B導線 的標示放在箭頭中點的外側，避免和合磁場 B 的標示疊在一起
        const L = Math.hypot(bix, biy) * k, nx = biy * k / L, ny = bix * k / L, sg = bix * BE > 0 ? -1 : 1; // 放在遠離原點（三角形外側）的那一邊
        D.arrow(g, ox, oy - BE * k, ox + bix * k, oy - (BE + biy) * k, D.c.neg, 2.6, st.show.labels ? { label: 'B', sub: 'I', lx: -bix * k / 2 + sg * nx * 13, ly: biy * k / 2 + sg * ny * 13 } : null);
      }
      if (f.Bh > 1e-12 && f.BIh > 1e-12) D.arrow(g, ox, oy, ox + bx * k, oy - by * k, D.c.field, 3, st.show.labels ? { label: 'B', lx: 10 * Math.sign(bx || 1), ly: -2 } : null);
      // θ 弧
      const th = f.thetaEq;
      if (Math.abs(th) > 0.5 && f.Bh > 0) {
        const r = Math.min(30, 0.45 * f.Bh * k);
        g.strokeStyle = D.alpha(D.c.accent, 0.9); g.lineWidth = 2;
        g.beginPath(); g.arc(ox, oy, r, -Math.PI / 2, -Math.PI / 2 + th * DEG, th < 0); g.stroke();
        if (st.show.labels) D.haloText(g, 'θ', ox + (r + 9) * Math.sin(th * DEG / 2), oy - (r + 9) * Math.cos(th * DEG / 2), D.c.accent, 'center', 'middle', font(12, 'italic 700'));
      }
    }
    // 數值
    if (st.show.labels) {
      const lines = [];
      const BIh = f.BIh, aligned = Math.abs(val(el.alpha)) < 0.5 && Math.abs(val(el.d)) < 0.05;
      if (BE > 0 && aligned && BIh > 0) lines.push(['tan θ = B', [subI()], ' / B', ['H'], ' = ' + (BIh / BE).toFixed(3)]);
      else if (BE === 0) lines.push([T('忽略地磁：只剩導線的磁場', 'No Earth field: wire field only')]);
      if (narrow) { lines.push(['B', ['H'], ' = ' + fmtB(BE)]); lines.push(['B', [subI()], ' = ' + fmtB(BIh)]); }
      else lines.push(['B', [subI()], ' = ' + fmtB(BIh) + '    B', ['H'], ' = ' + fmtB(BE)]);
      const px = narrow ? 10.5 : 12, lh = narrow ? 14 : 16;
      const y = p.y + p.h - 12;
      for (let i = 0; i < lines.length; i++) rich(g, lines[lines.length - 1 - i], p.x + p.w / 2, y - i * lh, D.c.text, 'center', px, '600');
    }
    g.restore();
  }

  // =====================================================================
  // 三種形狀：平面上的磁場
  // =====================================================================
  function expView() {
    const R = RANGE[st.mode], m = 14;
    const sc = Math.min((W - 2 * m) / (2 * R.x), (H - 2 * m) / (2 * R.y));
    return { sc: sc, cx: W / 2, cy: H / 2, X: function (x) { return W / 2 + x * sc; }, Y: function (y) { return H / 2 - y * sc; },
      wx: function (px) { return (px - W / 2) / sc; }, wy: function (py) { return (H / 2 - py) / sc; },
      xr: (W / 2) / sc, yr: (H / 2) / sc };
  }
  // 每條線代表的量（固定，所以線的條數 ∝ 電流）
  const PER = { wire: 1.5e-7, coil: 1.4e-5, solenoid: 1.4e-5 };
  const MAPREF = { wire: 100e-6, coil: 3e-3, solenoid: 8e-3 };
  let geom = null, geomKey = '', geomT = 0;
  function geomKeyNow() { const P = shapeParams(); return [W, H, st.mode, P.I.toFixed(4), P.s, P.N, P.R, P.L].join('|'); }
  function buildGeom() {
    const P = shapeParams(), V = expView();
    const out = { lines: [], circles: [] };
    if (!(P.I > 0)) { geom = out; return; }
    const box = [-V.xr / 100 - 0.01, -V.yr / 100 - 0.01, V.xr / 100 + 0.01, V.yr / 100 + 0.01];
    if (P.shape === 'wire') {
      out.circles = C.wireRadii(P.I, PER.wire, 0.004, Math.hypot(V.xr, V.yr) / 100);
      geom = out; return;
    }
    const field = function (x, y) { return C.planeField(P, x, y); };
    const ds = 2.2 / V.sc / 100;
    let avoid, yMax;
    if (P.shape === 'coil') {
      const rc = 0.0025;
      avoid = function (x, y) { return Math.min(Math.hypot(x, y - P.R), Math.hypot(x, y + P.R)) - rc; };
      yMax = P.R - rc - 0.0005;
    } else {
      const e = 0.0006;
      avoid = function (x, y) {
        let m = Infinity;
        [[P.L / 2, P.R], [-P.L / 2, P.R], [P.L / 2, -P.R], [-P.L / 2, -P.R]].forEach(function (q) { m = Math.min(m, Math.hypot(x - q[0], y - q[1])); });
        return m - e;
      };
      yMax = P.R - 0.0012;
    }
    const seeds = C.midplaneSeeds2D(P, PER[P.shape], yMax, 22);
    seeds.forEach(function (y0, i) {
      const opt = { ds: ds, box: box, avoid: avoid, maxLen: 6 };
      const fw = C.traceLine(field, 0, y0, Object.assign({ dir: 1 }, opt));
      let pts = fw.pts;
      if (!fw.closed) {
        const bw = C.traceLine(field, 0, y0, Object.assign({ dir: -1 }, opt));
        pts = bw.pts.slice(1).reverse().concat(fw.pts);
      }
      out.lines.push({ pts: pts, closed: fw.closed, ph: (i * 0.37) % 1 });
    });
    geom = out;
  }
  // ---- 強度色階（對數）：離屏低解析度 ----
  let map = null, mapKey = '';
  function buildMap() {
    const P = shapeParams(), V = expView();
    const key = geomKeyNow() + '|' + D.ver;
    if (key === mapKey && map) return;
    mapKey = key;
    const step = 4, cw = Math.ceil(W / step), ch = Math.ceil(H / step);
    if (!map) map = document.createElement('canvas');
    map.width = cw; map.height = ch;
    const g = map.getContext('2d'), img = g.createImageData(cw, ch);
    const base = D.rgb(D.c['canvas-bg']), tint = D.rgb(D.c.neg);
    const ref = MAPREF[P.shape], decades = 3;
    for (let j = 0; j < ch; j++) {
      for (let i = 0; i < cw; i++) {
        let u = 0;
        if (P.I > 0) {
          const x = V.wx((i + 0.5) * step) / 100, y = V.wy((j + 0.5) * step) / 100;
          const b = C.planeField(P, x, y), B = Math.hypot(b.bx, b.by);
          u = isFinite(B) && B > 0 ? clamp(1 + Math.log10(B / ref) / decades, 0, 1) : (isFinite(B) ? 0 : 1);
        }
        const a = (D.dark ? 0.6 : 0.36) * Math.pow(u, D.dark ? 1.4 : 1.9);
        const o = (j * cw + i) * 4;
        img.data[o] = Math.round(base[0] + (tint[0] - base[0]) * a);
        img.data[o + 1] = Math.round(base[1] + (tint[1] - base[1]) * a);
        img.data[o + 2] = Math.round(base[2] + (tint[2] - base[2]) * a);
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }
  function drawLinePath(g, V, pts) {
    g.beginPath();
    for (let i = 0; i < pts.length; i++) { const x = V.X(pts[i][0] * 100), y = V.Y(pts[i][1] * 100); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  }
  function arrowHead(g, x, y, dx, dy, s, col) {
    const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
    g.beginPath();
    g.moveTo(x + dx * s, y + dy * s);
    g.lineTo(x - dx * s * 0.8 - dy * s * 0.75, y - dy * s * 0.8 + dx * s * 0.75);
    g.lineTo(x - dx * s * 0.35, y - dy * s * 0.35);
    g.lineTo(x - dx * s * 0.8 + dy * s * 0.75, y - dy * s * 0.8 - dx * s * 0.75);
    g.closePath();
    g.fillStyle = col; g.fill();
  }
  function drawFieldLines(g, V) {
    const col = D.c.neg, P = shapeParams();
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (P.shape === 'wire') {
      geom.circles.forEach(function (r, i) {
        const rp = r * 100 * V.sc;
        g.strokeStyle = D.alpha(D.c['canvas-bg'], 0.55); g.lineWidth = 3.4;
        g.beginPath(); g.arc(V.X(0), V.Y(0), rp, 0, 2 * Math.PI); g.stroke();
        g.strokeStyle = D.alpha(col, 0.9); g.lineWidth = 1.5;
        g.beginPath(); g.arc(V.X(0), V.Y(0), rp, 0, 2 * Math.PI); g.stroke();
        // 方向箭頭：電流射出紙面（s = +1）時逆時針
        const n = Math.max(1, Math.min(6, Math.floor(2 * Math.PI * rp / 90)));
        for (let k = 0; k < n; k++) {
          const a = (k + 0.3 * (i % 3)) * 2 * Math.PI / n;
          const x = V.X(0) + rp * Math.cos(a), y = V.Y(0) - rp * Math.sin(a);
          const dx = -Math.sin(a) * st.s, dy = -Math.cos(a) * st.s;
          arrowHead(g, x, y, dx, dy, 5.5, col);
        }
      });
      g.restore();
      return;
    }
    geom.lines.forEach(function (ln) {
      g.strokeStyle = D.alpha(D.c['canvas-bg'], 0.55); g.lineWidth = 3.4;
      drawLinePath(g, V, ln.pts); g.stroke();
      g.strokeStyle = D.alpha(col, 0.9); g.lineWidth = 1.5;
      drawLinePath(g, V, ln.pts); g.stroke();
    });
    // 箭頭：沿線每 ~110 px 一個
    geom.lines.forEach(function (ln) {
      let acc = 40 + ln.ph * 70;
      for (let i = 1; i < ln.pts.length; i++) {
        const x0 = V.X(ln.pts[i - 1][0] * 100), y0 = V.Y(ln.pts[i - 1][1] * 100), x1 = V.X(ln.pts[i][0] * 100), y1 = V.Y(ln.pts[i][1] * 100);
        acc -= Math.hypot(x1 - x0, y1 - y0);
        if (acc <= 0) {
          acc = 110;
          if (x1 > 4 && x1 < W - 4 && y1 > 4 && y1 < H - 4) arrowHead(g, x1, y1, x1 - x0, y1 - y0, 5.5, col);
        }
      }
    });
    g.restore();
  }
  function drawNeedleGrid(g, V) {
    const P = shapeParams();
    if (!(P.I > 0)) return;
    const step = Math.max(30, Math.min(46, W / 18));
    const ref = MAPREF[P.shape];
    for (let y = step / 2; y < H; y += step) {
      for (let x = step / 2; x < W; x += step) {
        const wx = V.wx(x), wy = V.wy(y);
        if (insideConductor(P, wx, wy) || (P.shape === 'wire' && Math.hypot(wx, wy) < 0.8)) continue;
        const b = C.planeField(P, wx / 100, wy / 100), B = Math.hypot(b.bx, b.by);
        if (!(B > 0) || !isFinite(B)) continue;
        const u = clamp(1 + Math.log10(B / ref) / 3, 0.15, 1);
        const ux = b.bx / B, uy = -b.by / B, l = step * 0.36, w = 2.6;
        g.globalAlpha = 0.35 + 0.65 * u;
        g.beginPath(); g.moveTo(x + ux * l, y + uy * l); g.lineTo(x - uy * w, y + ux * w); g.lineTo(x, y); g.closePath();
        g.fillStyle = tok['needle-n']; g.fill();
        g.beginPath(); g.moveTo(x - ux * l, y - uy * l); g.lineTo(x - uy * w, y + ux * w); g.lineTo(x, y); g.lineTo(x + uy * w, y - ux * w); g.closePath();
        g.fillStyle = D.dark ? '#9aa4a8' : '#8a9599'; g.fill();
        g.beginPath(); g.moveTo(x + ux * l, y + uy * l); g.lineTo(x + uy * w, y - ux * w); g.lineTo(x, y); g.closePath();
        g.fillStyle = D.shade(tok['needle-n'], -0.2); g.fill();
      }
    }
    g.globalAlpha = 1;
  }
  function crossDot(g, x, y, r, out) {
    D.ball(g, x, y, r, tok.copper, { glow: 0 });
    g.strokeStyle = D.c['canvas-bg']; g.fillStyle = D.c['canvas-bg']; g.lineWidth = Math.max(1.2, r * 0.2);
    if (out) { g.beginPath(); g.arc(x, y, r * 0.26, 0, 2 * Math.PI); g.fill(); }
    else { const q = r * 0.5; g.beginPath(); g.moveTo(x - q, y - q); g.lineTo(x + q, y + q); g.moveTo(x + q, y - q); g.lineTo(x - q, y + q); g.stroke(); }
  }
  function drawConductors(g, V, part) {
    const P = shapeParams(), I = P.I, on = I > 0;
    if (P.shape === 'wire') {
      if (part !== 'front') return;
      crossDot(g, V.X(0), V.Y(0), Math.max(8, 0.3 * V.sc), st.s > 0);
      return;
    }
    if (P.shape === 'coil') {
      const R = P.R * 100, ex = Math.max(8, 0.2 * R * V.sc), ey = R * V.sc;
      if (part === 'back') { // 線圈的後半圈（透視，虛線）
        g.save(); g.strokeStyle = D.alpha(tok.copper, 0.55); g.lineWidth = 2.2; g.setLineDash([6, 5]);
        g.beginPath(); g.ellipse(V.X(0), V.Y(0), ex, ey, 0, Math.PI / 2, Math.PI * 1.5, false); g.stroke(); g.restore();
        return;
      }
      D.tube(g, function (c) { c.ellipse(V.X(0), V.Y(0), ex, ey, 0, -Math.PI / 2, Math.PI / 2, false); }, tok.copper, Math.max(4, 0.25 * V.sc));
      // 剖面上的兩個截面：s = +1 時上方 ⊙、下方 ⊗
      const r = Math.max(7, 0.3 * V.sc);
      crossDot(g, V.X(0), V.Y(R), r, st.s > 0);
      crossDot(g, V.X(0), V.Y(-R), r, st.s < 0);
      return;
    }
    // 螺線管：管身（半透明）＋上下兩排繞線截面
    const R = P.R * 100, Lh = P.L * 50;
    if (part === 'back') {
      g.save();
      const gr = g.createLinearGradient(0, V.Y(R), 0, V.Y(-R));
      gr.addColorStop(0, D.alpha(tok.copper, 0.18)); gr.addColorStop(0.5, D.alpha(tok.copper, 0.05)); gr.addColorStop(1, D.alpha(tok.copper, 0.18));
      g.fillStyle = gr; g.fillRect(V.X(-Lh), V.Y(R), 2 * Lh * V.sc, 2 * R * V.sc);
      g.restore();
      return;
    }
    const nShow = Math.min(P.N, Math.max(2, Math.floor(2 * Lh * V.sc / 6.5)));
    const r = Math.max(2.6, Math.min(0.32 * V.sc, (2 * Lh * V.sc / nShow) * 0.48));
    [1, -1].forEach(function (sy) {
      const y = V.Y(sy * R);
      D.tube(g, function (c) { c.moveTo(V.X(-Lh), y); c.lineTo(V.X(Lh), y); }, D.shade(tok.copper, -0.15), r * 1.5);
      for (let k = 0; k < nShow; k++) {
        const x = V.X(-Lh + (k + 0.5) * 2 * Lh / nShow);
        if (r >= 5) crossDot(g, x, y, r, (sy > 0) === (st.s > 0));
        else D.ball(g, x, y, r, tok.copper, { glow: 0, shadow: false });
      }
    });
    void on;
  }
  function drawProbe(g, V, pf) {
    const x = V.X(pf.x), y = V.Y(pf.y), r = 15;
    // 探測頭：圓環＋沿磁場的小磁針（箭頭只表示方向）
    g.save();
    g.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : D.alpha(D.c.text, 0.25); g.shadowBlur = 8; g.shadowOffsetY = 2;
    g.fillStyle = D.alpha(D.c.surface, D.dark ? 0.82 : 0.9);
    g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fill();
    g.restore();
    g.strokeStyle = hoverProbe || drag ? D.c.accent : D.alpha(D.c.text, 0.6); g.lineWidth = hoverProbe || drag ? 2.4 : 1.5;
    g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.stroke();
    if (pf.B > 0 && isFinite(pf.B)) {
      const ux = pf.bx / pf.B, uy = -pf.by / pf.B, l = r * 0.85, w = 3.6;
      g.beginPath(); g.moveTo(x + ux * l, y + uy * l); g.lineTo(x - uy * w, y + ux * w); g.lineTo(x - ux * l, y - uy * l); g.lineTo(x + uy * w, y - ux * w); g.closePath();
      g.fillStyle = tok['needle-s']; g.fill();
      g.beginPath(); g.moveTo(x + ux * l, y + uy * l); g.lineTo(x - uy * w, y + ux * w); g.lineTo(x + uy * w, y - ux * w); g.closePath();
      g.fillStyle = tok['needle-n']; g.fill();
      if (st.show.vec) D.arrow(g, x + ux * (r + 3), y + uy * (r + 3), x + ux * (r + 30), y + uy * (r + 30), D.c.neg, 2.4, st.show.labels ? { label: 'B' } : null);
    } else {
      g.fillStyle = D.c.muted; g.beginPath(); g.arc(x, y, 2.5, 0, 2 * Math.PI); g.fill();
    }
    // 讀數
    if (st.show.labels) {
      const txt = pf.inside ? T('在導線裡', 'inside the wire') : '|B| = ' + fmtB(pf.B);
      const right = x < W - 150;
      D.pill(g, txt, right ? x + r + 8 : x - r - 8, y - r - 2, D.c.accent, right ? 'left' : 'right', font(12.5, '700'));
    }
    if (kb && kb.focused()) {
      g.save(); g.strokeStyle = D.c.accent; g.lineWidth = 2; g.setLineDash([5, 4]);
      D.roundRect(g, x - r - 6, y - r - 6, 2 * r + 12, 2 * r + 12, 8); g.stroke(); g.restore();
    }
  }
  function drawAxes(g, V) {
    const P = shapeParams();
    // 格線（1 cm／5 cm）
    const major = V.sc >= 14 ? 5 : 10, minor = V.sc >= 14 ? 1 : 5;
    D.grid(g, 0, 0, W, H, major * V.sc, minor * V.sc, V.X(0), V.Y(0));
    if (P.shape === 'wire') return;
    g.save();
    g.strokeStyle = D.alpha(D.c.text, 0.35); g.lineWidth = 1; g.setLineDash([8, 5]);
    g.beginPath(); g.moveTo(0, V.Y(0)); g.lineTo(W, V.Y(0)); g.stroke();
    g.setLineDash([]);
    g.restore();
    if (st.show.labels) {
      for (let x = -Math.floor(V.xr / 5) * 5; x <= V.xr; x += 5) {
        g.strokeStyle = D.alpha(D.c.text, 0.45); g.beginPath(); g.moveTo(V.X(x), V.Y(0) - 3); g.lineTo(V.X(x), V.Y(0) + 3); g.stroke();
        if (x !== 0) D.haloText(g, minus(String(x)), V.X(x), V.Y(0) + 13, D.c.muted, 'center', 'middle', font(10.5, '600'));
      }
      D.haloText(g, 'x (cm)', W - 10, V.Y(0) - 8, D.c.muted, 'right', 'alphabetic', font(11, '600'));
    }
  }
  function drawScaleBar(g, V) {
    const cm = V.sc >= 30 ? 1 : V.sc >= 12 ? 2 : 5, len = cm * V.sc;
    const x = 14, y = H - 14;
    g.strokeStyle = D.c.text; g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.moveTo(x, y - 4); g.lineTo(x, y + 4); g.moveTo(x + len, y - 4); g.lineTo(x + len, y + 4); g.stroke();
    D.haloText(g, cm + ' cm', x + len / 2, y - 9, D.c.text, 'center', 'alphabetic', font(11, '600'));
  }
  function drawExpLabels(g, V) {
    if (!st.show.labels) return;
    const P = shapeParams();
    let t = '';
    if (P.shape === 'wire') t = st.s > 0 ? T('電流 ⊙ 射出紙面', 'Current ⊙ out of the page') : T('電流 ⊗ 射入紙面', 'Current ⊗ into the page');
    else if (P.shape === 'coil') t = T('圓線圈 N = ', 'Coil N = ') + P.N + T('、R = ', ', R = ') + f1(P.R * 100) + ' cm';
    else t = T('螺線管 N = ', 'Solenoid N = ') + P.N + T('、L = ', ', L = ') + f1(P.L * 100) + T(' cm、R = ', ' cm, R = ') + f1(P.R * 100) + ' cm';
    D.pill(g, t, 12, 30, D.c.equi, 'left', font(12, '700'));
    if (!(P.I > 0)) D.pill(g, T('電流 I = 0：沒有磁場。把電流調大看看', 'I = 0: no field. Turn the current up'), W / 2, H / 2 - 30, D.c.muted, 'center', font(13, '700'));
    else if (P.shape === 'coil') D.haloText(g, T('剖面：上下兩點是線圈穿過紙面的地方', 'Cross-section: the coil crosses the page at the two dots'), W - 10, H - 12, D.c.muted, 'right', 'alphabetic', font(10.5, '600'));
    else if (P.shape === 'solenoid') D.haloText(g, P.N > Math.floor(P.L * 100 * V.sc / 6.5) ? T('繞線只畫出一部分', 'Not every turn is drawn') : '', W - 10, H - 12, D.c.muted, 'right', 'alphabetic', font(10.5, '600'));
  }
  function drawExplorer() {
    const V = expView();
    const k = geomKeyNow();
    if (k !== geomKey && (!dragging() || performance.now() - geomT > 140)) { geomKey = k; geomT = performance.now(); buildGeom(); }
    if (!geom) buildGeom();
    if (st.show.map) { buildMap(); ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(map, 0, 0, W, H); ctx.restore(); }
    drawAxes(ctx, V);
    drawConductors(ctx, V, 'back');
    if (st.show.lines) drawFieldLines(ctx, V);
    if (st.show.needles) drawNeedleGrid(ctx, V);
    drawConductors(ctx, V, 'front');
    drawExpLabels(ctx, V);
    drawScaleBar(ctx, V);
    drawProbe(ctx, V, probeField());
  }
  function dragging() { return !!drag || sliderActive; }

  // =====================================================================
  // 繪製迴圈
  // =====================================================================
  let raf = 0, lastT = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    const dt = Math.min(1 / 30, lastT ? (now - lastT) / 1000 : 0);
    lastT = now;
    let more = false;
    if (st.mode === 'oersted') more = stepPhysics(dt) || more;
    if (!reduced && Iset() > 0 && st.mode === 'oersted' && !document.hidden) { flowT += dt; more = true; }
    if (!stage.classList.contains('is3d')) draw();
    else if (view3 && view3.active) view3.update();
    if (more && !document.hidden) requestDraw(); else lastT = 0;
    liveSr(now);
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildLayer();
    ctx.drawImage(layer, 0, 0, W, H);
    if (st.mode === 'oersted') drawOersted();
    else drawExplorer();
  }

  // ---- 磁針的物理 ----
  function stepPhysics(dt) {
    const f = ofield();
    if (reduced) { // 減少動態：直接停到平衡方向
      if (!atRest || Math.abs(C.wrapDeg(needle.phi / DEG - f.thetaEq)) > 1e-6) {
        if (f.Bh > 0) needle.phi = f.thetaEq * DEG;
        needle.om = 0; needle.stuck = false;
        if (!atRest) { atRest = true; onRest(); }
        updateReadouts();
      }
      return false;
    }
    if (dt > 0) {
      // 合磁場剛好反向、磁針正好在不穩定平衡：真實的磁針一定有一點點擾動
      if (f.Bh > 0 && !kickDone && Math.cos(needle.phi - f.thetaEq * DEG) < -0.9999 && Math.abs(needle.om) < 1e-3) { needle.om += 0.02; kickDone = true; }
      C.stepNeedle(needle, f.Bx, f.By, dt, { friction: st.inst === 'real' });
    }
    // 停穩以後只剩極小的餘振（< 0.02°），不再回到「擺動中」；要等使用者改了設定（wake）才重新判定
    if (atRest) { if (dt > 0) updateReadouts(true); return false; }
    const off = Math.abs(C.wrapDeg(needle.phi / DEG - f.thetaEq));
    const still = Math.abs(needle.om) < 0.003 && (off < 0.02 || needle.stuck || f.Bh < 0.03 * C.NEEDLE.Bref);
    if (still) restT += dt; else restT = 0;
    if (restT > 0.25) { atRest = true; onRest(); }
    if (dt > 0) updateReadouts(true);
    return !atRest;
  }
  function wake() { atRest = false; restT = 0; kickDone = false; updateButtons(); requestDraw(); }
  function onRest() {
    updateReadouts();
    updateButtons();
    if (userDirty && st.mode === 'oersted') {
      userDirty = false;
      chime();
      const rd = reading();
      say(T('磁針停穩：θ = ', 'Needle at rest: θ = ') + minus(f1(Math.abs(rd))) + '° ' + sideWord(rd) + T('。', '.'));
      emit('needle', needleInfo());
    }
  }
  function needleInfo() {
    const f = ofield(), o = oerParams();
    return {
      I: o.I, Im: ammeter(), s: o.s, above: o.above, r: o.h * 100, alpha: o.alpha, d: o.d * 100, earth: o.earth, loc: el.loc.value,
      BH: loc().H * 1e6, BIh: f.BIh * 1e6, Bnet: f.Bh * 1e6, thetaEq: f.thetaEq, theta: C.wrapDeg(needle.phi / DEG),
      read: reading(), mode: st.inst, rest: atRest, period: C.needlePeriod(f.Bh)
    };
  }

  // ---------------- 讀數 ----------------
  let roKey = '';
  function rowHtml(dt, dd, cls) { return '<dt>' + dt + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + dd + '</dd>'; }
  function updateReadouts(fromFrame) {
    let html = '';
    if (st.mode === 'oersted') {
      const f = ofield(), rd = reading(), BH = loc().H;
      const tn = Math.tan(Math.abs(rd) * DEG);
      html += rowHtml(T('磁針偏角 θ（讀數）', 'Needle deflection θ (reading)'), minus(f1(Math.abs(rd))) + '° ' + sideWord(rd), 'em');
      html += rowHtml(T('電流表 I', 'Ammeter I'), f2(ammeter()) + ' A');
      html += rowHtml(T('導線到磁針（斜距 √(r<sup>2</sup> + d<sup>2</sup>)）', 'Wire to needle (slant distance √(r<sup>2</sup> + d<sup>2</sup>))'), f2(Math.hypot(val(el.h), val(el.d))) + ' cm');
      html += rowHtml(T('導線磁場（水平分量）', 'Wire’s field (horizontal part)'), fmtB(f.BIh));
      html += rowHtml('tan θ', Math.abs(rd) < 89.95 ? tn.toFixed(3) : '—');
      html += rowHtml('μ<sub>0</sub>I/(2πr) ÷ tan θ' + T('（r 為鉛直距離）', ' (r = vertical distance)'), Math.abs(rd) >= 1 && Math.abs(rd) < 89 && st.earth ? fmtB(C.wireB(ammeter(), val(el.h) / 100) / tn) : '—');
      html += rowHtml(T('磁針擺動週期', 'Needle’s swing period'), f.Bh > 0 ? C.needlePeriod(f.Bh).toFixed(2) + ' s' : '∞');
      html += rowHtml(T('狀態', 'State'), atRest ? T('停穩', 'at rest') : T('擺動中', 'swinging'));
    } else {
      const pf = probeField(), P = pf.P;
      html += rowHtml(T('探測點位置', 'Probe position'), '(' + minus(f1(pf.x)) + ', ' + minus(f1(pf.y)) + ') cm');
      if (P.shape === 'wire') html += rowHtml(T('到導線的距離 r', 'Distance r from the wire'), f2(Math.hypot(pf.x, pf.y)) + ' cm');
      html += rowHtml(T('磁場 |B|（計算）', 'Field |B| (computed)'), pf.inside ? '—' : fmtB(pf.B, 4), 'em');
      if (pf.B > 0 && !pf.inside) {
        const ang = Math.atan2(pf.by, pf.bx) / DEG;
        html += rowHtml(T('方向（與 +x 軸夾角）', 'Direction (from the +x axis)'), minus(f1(ang)) + '°');
      }
      const fo = pf.f;
      if (P.shape === 'wire') html += rowHtml('μ<sub>0</sub>I/(2πr)', fmtB(fo.B, 4));
      if (P.shape === 'coil') {
        html += rowHtml(T('中心 μ<sub>0</sub>NI/(2R)', 'Centre μ<sub>0</sub>NI/(2R)'), fmtB(C.coilCenter(P.N, P.R, P.I), 4));
        html += rowHtml(T('軸上公式（此 x）', 'Axis formula (this x)'), fo ? fmtB(fo.B, 4) : T('不在軸上', 'not on the axis'));
      }
      if (P.shape === 'solenoid') {
        html += rowHtml(T('理想 μ<sub>0</sub>nI', 'Ideal μ<sub>0</sub>nI'), fmtB(fo.B, 4));
        html += rowHtml(T('有限長軸上公式', 'Finite-length axis formula'), fo.axis != null ? fmtB(fo.axis, 4) : T('不在軸上', 'not on the axis'));
        html += rowHtml('n = N/L', Math.round(P.N / P.L) + T(' 匝/m', ' turns/m'));
      }
    }
    if (html !== roKey) { roKey = html; $('readout').innerHTML = html; }
    void fromFrame;
  }
  // 螢幕閱讀器：動畫中的讀數至少間隔 1 秒才更新（不放在 aria-live 的讀數上）
  let srT = 0;
  function liveSr(now) {
    if (now - srT < 1000) return;
    srT = now;
    let t = '';
    if (st.mode === 'oersted') { const rd = reading(); t = T('磁針偏角 ', 'Needle deflection ') + minus(f1(Math.abs(rd))) + '° ' + sideWord(rd); }
    else { const pf = probeField(); t = T('探測點磁場 ', 'Field at the probe ') + (pf.inside ? '—' : fmtB(pf.B)); }
    const s = $('srState');
    if (s.textContent !== t) s.textContent = t;
  }
  const statusEl = $('status');
  function say(t) { statusEl.textContent = t; }

  // ---------------- 音效 ----------------
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function clickSound() { const S = sound(); if (!S) return; S.noise({ dur: 0.03, gain: 0.5, filter: 2400, q: 1 }); S.tone({ freq: 1150, dur: 0.05, type: 'triangle', gain: 0.22 }); }
  function chime() { const S = sound(); if (!S) return; S.tone({ freq: 659, dur: 0.16, type: 'sine', gain: 0.14 }); setTimeout(function () { const S2 = sound(); if (S2) S2.tone({ freq: 988, dur: 0.24, type: 'sine', gain: 0.11 }); }, 100); }
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

  // ---------------- 任務事件 ----------------
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }

  // =====================================================================
  // 記錄與數據表
  // =====================================================================
  function oerRowOf() {
    const rd = reading(), I = ammeter(), r = Math.round(val(el.h) * 100) / 100;
    const tn = Math.tan(Math.abs(rd) * DEG), BI = C.wireB(I, r / 100) * 1e6;
    return { I: I, s: st.s, above: st.above, r: r, alpha: val(el.alpha), d: val(el.d), theta: rd, tan: tn, BI: BI, BH: BI / tn,
      mode: st.inst, loc: el.loc.value, earth: st.earth };
  }
  function record() {
    if (st.mode === 'oersted') {
      if (!atRest) { say(T('磁針還在擺動，等它停穩再記錄。', 'The needle is still swinging; wait until it is at rest.')); return; }
      if (!st.earth) { say(T('忽略地磁時無法用正切法求地磁。', 'With the Earth’s field ignored the tangent method cannot measure it.')); return; }
      if (!(ammeter() > 0)) { say(T('電流為 0：先把電流調大。', 'The current is 0: turn it up first.')); return; }
      const rd = reading();
      if (Math.abs(rd) < 1) { say(T('偏角太小（小於 1°），讀不準，換大一點的電流或近一點的距離。', 'The deflection is under 1°, too small to read well. Use a larger current or a smaller distance.')); return; }
      if (Math.abs(rd) >= 89) { say(T('偏角接近 90° 以上，tan θ 太大或不適用，換小一點的電流。', 'The deflection is near or past 90°, where tan θ is useless. Use a smaller current.')); return; }
      const row = oerRowOf();
      st.rowsO.push(row);
      clickSound();
      renderTable(); drawGraph();
      const A = anaO();
      say(T('已記錄第 ', 'Recorded row ') + st.rowsO.length + T(' 筆：I = ', ': I = ') + f2(row.I) + ' A, r = ' + f1(row.r) + ' cm, θ = ' + minus(f1(Math.abs(row.theta))) + '°' +
        (A.n >= 2 ? T('；目前求得地磁水平分量 ≈ ', '; Earth’s horizontal field so far ≈ ') + fmtB(A.BH, 4) : '') + T('。', '.'));
      emit('record', { kind: 'oersted', row: row, rows: st.rowsO.slice(), ana: A });
      return;
    }
    const pf = probeField(), P = pf.P;
    if (pf.inside) { say(T('探測點在導線裡，換個位置。', 'The probe is inside the wire; move it.')); return; }
    const f = pf.f, fB = f ? (P.shape === 'solenoid' ? f.B : f.B) : null;
    const row = { shape: P.shape, I: Math.round(P.I * 100) / 100, s: st.s, N: P.N || null, R: P.R ? P.R * 100 : null, L: P.L ? P.L * 100 : null,
      x: pf.x, y: pf.y, B: pf.B * 1e6, formula: fB != null ? fB * 1e6 : null, axis: f && f.axis != null ? f.axis * 1e6 : null };
    row.diff = row.formula ? row.B / row.formula - 1 : null;
    st.rowsP.push(row);
    clickSound();
    renderTable(); drawGraph();
    say(T('已記錄第 ', 'Recorded row ') + st.rowsP.length + T(' 筆：|B| = ', ': |B| = ') + fmtB(row.B * 1e-6, 4) + T('。', '.'));
    emit('record', { kind: 'probe', row: row, rows: st.rowsP.slice() });
  }
  function anaO() { return C.tangentAnalysis(st.rowsO.map(function (r) { return { I: r.I, r: r.r, theta: r.theta, s: r.s, above: r.above }; }), loc().H); }
  const SHAPE_NAME = function (s) { return s === 'wire' ? T('直導線', 'wire') : s === 'coil' ? T('線圈', 'coil') : T('螺線管', 'solenoid'); };
  function renderTable() {
    const tb = $('tbl');
    let h = '';
    if (st.mode === 'oersted') {
      h += '<thead><tr><th>#</th><th>I<br>(A)</th><th data-en-html="Current<br>direction">' + T('電流<br>方向', 'Current<br>direction') + '</th><th>' + T('導線', 'Wire') + '</th><th>r<br>(cm)</th><th>θ<br>(°)</th><th>tan θ</th>' +
        '<th>B<sub>I</sub> = μ<sub>0</sub>I/2πr<br>(μT)</th><th>B<sub>I</sub>/tan θ<br>(μT)</th></tr></thead><tbody>';
      if (!st.rowsO.length) h += '<tr class="empty"><td colspan="9">' + T('還沒有數據：調好電流、等磁針停穩後按「記錄」。', 'No data yet: set a current, wait for the needle to settle and press “Record”.') + '</td></tr>';
      st.rowsO.forEach(function (r, i) {
        const dir = Math.abs(r.alpha) < 0.5 ? (r.s > 0 ? T('向北', 'north') : T('向南', 'south')) : (r.s > 0 ? T('正向', 'fwd') : T('反向', 'rev'));
        h += '<tr' + (i === st.rowsO.length - 1 ? ' class="latest"' : '') + '><td>' + (i + 1) + '</td><td>' + f2(r.I) + '</td><td>' + dir + '</td><td>' + (r.above ? T('上', 'above') : T('下', 'below')) +
          '</td><td>' + fL(r.r) + '</td><td>' + minus(f1(r.theta)) + '</td><td>' + r.tan.toFixed(3) + '</td><td>' + r.BI.toFixed(2) + '</td><td class="em">' + r.BH.toFixed(2) + '</td></tr>';
      });
    } else {
      h += '<thead><tr><th>#</th><th>' + T('形狀', 'Shape') + '</th><th>I<br>(A)</th><th>N</th><th>R<br>(cm)</th><th>L<br>(cm)</th><th>x<br>(cm)</th><th>y<br>(cm)</th>' +
        '<th>|B|<br>(μT)</th><th>' + T('課本公式', 'Formula') + '<br>(μT)</th><th>' + T('差', 'Diff.') + '<br>(%)</th></tr></thead><tbody>';
      if (!st.rowsP.length) h += '<tr class="empty"><td colspan="11">' + T('還沒有數據：把探測點放好後按「記錄」。', 'No data yet: place the probe and press “Record”.') + '</td></tr>';
      st.rowsP.forEach(function (r, i) {
        const fx = r.shape === 'coil' ? (r.formula != null ? r.formula : null) : r.formula;
        h += '<tr' + (i === st.rowsP.length - 1 ? ' class="latest"' : '') + '><td>' + (i + 1) + '</td><td>' + SHAPE_NAME(r.shape) + '</td><td>' + f2(r.I) + '</td><td>' + (r.N || '—') + '</td><td>' + (r.R ? f2(r.R) : '—') +
          '</td><td>' + (r.L ? fL(r.L) : '—') + '</td><td>' + minus(f2(r.x)) + '</td><td>' + minus(f2(r.y)) + '</td><td class="em">' + sig(r.B) + '</td><td>' + (fx != null ? sig(fx) : '—') +
          '</td><td>' + (r.diff != null && isFinite(r.diff) ? minus((r.diff * 100).toFixed(2)) : '—') + '</td></tr>';
      });
    }
    h += '</tbody>';
    tb.innerHTML = h;
    renderAna();
    $('undo').disabled = !(st.mode === 'oersted' ? st.rowsO.length : st.rowsP.length);
    $('clearAll').disabled = !(st.rowsO.length || st.rowsP.length);
  }
  function sig(x) { if (!isFinite(x)) return '—'; const a = Math.abs(x); return a >= 1000 ? x.toFixed(0) : a >= 100 ? x.toFixed(1) : a >= 10 ? x.toFixed(2) : x.toFixed(3); }
  function renderAna() {
    let h = '';
    if (st.mode === 'oersted') {
      const A = anaO(), ref = loc().H * 1e6;
      h += rowHtml(T('筆數', 'Rows'), String(A.n));
      h += rowHtml(T('B<sub>I</sub> 對 tan θ 的斜率 → B<sub>H</sub>', 'Slope of B<sub>I</sub> against tan θ → B<sub>H</sub>'), A.n ? fmtB(A.BH, 4) : '—');
      h += rowHtml(T('與地磁模型相差', 'Difference from the model'), A.n ? minus((A.err * 100).toFixed(2)) + ' %' : '—');
      h += rowHtml(T('正反向平均（', 'Forward/reverse averaged (') + A.nPair + T(' 組）→ B<sub>H</sub>', ' pairs) → B<sub>H</sub>'), A.nPair ? fmtB(A.BHpair, 4) + T('（', ' (') + minus((A.errPair * 100).toFixed(2)) + T(' %）', ' %)') : '—');
      h += rowHtml(T('地磁模型 WMM2025（', 'WMM2025 model (') + T(loc().zh, loc().en) + T('）', ')'), ref.toFixed(2) + ' μT');
    } else {
      const rows = st.rowsP.filter(function (r) { return r.shape === st.mode; });
      h += rowHtml(T('這種形狀的筆數', 'Rows for this shape'), String(rows.length));
      if (rows.length) {
        const last = rows[rows.length - 1];
        h += rowHtml(T('最近一筆與公式相差', 'Last row vs formula'), last.diff != null ? minus((last.diff * 100).toFixed(2)) + ' %' : '—');
      }
      const gi = graphIPoints();
      h += rowHtml(T('B 對 I 的斜率（此位置）', 'Slope of B against I (here)'), gi.pts.length >= 2 ? sig(gi.k) + ' μT/A' : '—');
    }
    $('ana').innerHTML = h;
  }
  $('record').addEventListener('click', record);
  $('undo').addEventListener('click', function () {
    const a = st.mode === 'oersted' ? st.rowsO : st.rowsP;
    if (!a.length) return;
    a.pop(); renderTable(); drawGraph();
    say(T('已刪除最後一筆。', 'Deleted the last row.'));
  });
  $('clearAll').addEventListener('click', function () {
    st.rowsO = []; st.rowsP = [];
    renderTable(); drawGraph();
    say(T('已清除所有數據。', 'All data cleared.'));
    emit('clear', {});
  });

  // =====================================================================
  // 分析圖
  // =====================================================================
  let GW = 0, GH = 0, gdpr = 1;
  function sizeGraph() {
    GW = gcv.clientWidth || 600; GH = gcv.clientHeight || 300;
    gdpr = Math.min(window.devicePixelRatio || 1, 2.5);
    gcv.width = Math.round(GW * gdpr); gcv.height = Math.round(GH * gdpr);
  }
  function niceStep(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  function samePos(r, pf) { return Math.abs(r.x - pf.x) < 0.005 && Math.abs(r.y - pf.y) < 0.005; }
  function sameParams(r, P) {
    if (r.shape !== P.shape) return false;
    if (P.shape === 'coil') return r.N === P.N && Math.abs(r.R - P.R * 100) < 1e-6;
    if (P.shape === 'solenoid') return r.N === P.N && Math.abs(r.R - P.R * 100) < 1e-6 && Math.abs(r.L - P.L * 100) < 1e-6;
    return true;
  }
  function graphIPoints() {
    const pf = isExp() ? probeField() : null;
    if (!pf) return { pts: [], k: NaN };
    const pts = st.rowsP.filter(function (r) { return sameParams(r, pf.P) && samePos(r, pf); }).map(function (r) { return [r.I, r.B]; });
    return { pts: pts, k: C.fitOrigin(pts.map(function (p) { return p[0]; }), pts.map(function (p) { return p[1]; })) };
  }
  function drawGraph() {
    if (!GW) sizeGraph();
    const g = gctx;
    g.setTransform(gdpr, 0, 0, gdpr, 0, 0);
    D.backdrop(g, GW, GH);
    $('gSel').hidden = st.mode === 'oersted';
    const Lm = 58, Rm = 16, Tm = 26, Bm = 44;
    const pw = GW - Lm - Rm, ph = GH - Tm - Bm;
    let xs = [], series = [], xLab = '', yLab = '', xMax = 1, yMax = 1, xMin = 0, unit = 1, legend = [];
    if (st.mode === 'oersted') {
      const A = anaO(), ref = loc().H * 1e6;
      xLab = 'tan θ'; yLab = ['B', [subI()], ' (μT)'];
      const pts = st.rowsO.map(function (r) { return [r.tan, r.BI]; });
      const pp = A.pairs.map(function (p) { return [p.tan, p.BI * 1e6]; });
      xMax = Math.max(1.2, Math.max.apply(null, pts.map(function (p) { return p[0]; }).concat([0])) * 1.12);
      yMax = Math.max(ref * xMax * 1.05, Math.max.apply(null, pts.map(function (p) { return p[1]; }).concat([0])) * 1.1);
      series.push({ type: 'line', k: ref, color: D.c.muted, dash: [3, 4], width: 1.4 });
      legend.push([D.c.muted, [T('地磁模型（斜率 = B', 'Model (slope = B'), ['H'], T('）', ')')], 'dash']);
      if (A.n) { series.push({ type: 'line', k: A.BH * 1e6, color: D.c.accent, width: 2 }); legend.push([D.c.accent, T('全部數據的最佳直線', 'Best line, all rows'), 'line']); }
      if (A.nPair) { series.push({ type: 'line', k: A.BHpair * 1e6, color: D.c.equi, dash: [7, 4], width: 2 }); legend.push([D.c.equi, T('正反向平均的最佳直線', 'Best line, averaged pairs'), 'dash']); }
      series.push({ type: 'pts', pts: pts, color: D.c.neg, hollow: true });
      if (pp.length) series.push({ type: 'pts', pts: pp, color: D.c.equi, diamond: true });
    } else {
      const pf = probeField(), P = pf.P;
      if (st.graph === 'pos') {
        const curve = [];
        if (P.shape === 'wire') {
          xLab = T('到導線的距離 r (cm)', 'Distance r from the wire (cm)');
          xMin = 0; xMax = 11;
          for (let r = 0.3; r <= xMax; r += 0.05) curve.push([r, C.wireB(P.I, r / 100) * 1e6]);
          const rp = Math.hypot(pf.x, pf.y);
          const rows = st.rowsP.filter(function (r) { return r.shape === 'wire'; });
          series.push({ type: 'curve', pts: curve, color: D.c.neg, width: 2 });
          series.push({ type: 'pts', pts: rows.filter(function (r) { return Math.abs(r.I - P.I) < 0.005; }).map(function (r) { return [Math.hypot(r.x, r.y), r.B]; }), color: D.c.equi });
          series.push({ type: 'pts', pts: rows.filter(function (r) { return Math.abs(r.I - P.I) >= 0.005; }).map(function (r) { return [Math.hypot(r.x, r.y), r.B]; }), color: D.c.muted, hollow: true });
          if (!pf.inside) series.push({ type: 'probe', pt: [rp, pf.B * 1e6] });
          legend.push([D.c.neg, ['μ', ['0'], 'I/(2πr)'], 'line'], [D.c.equi, T('同一電流的紀錄', 'Rows at this current'), 'dot']);
        } else {
          xLab = T('沿軸的位置 x (cm)', 'Position x along the axis (cm)');
          const R = RANGE[P.shape]; xMin = -R.x; xMax = R.x;
          const line = [];
          for (let x = xMin; x <= xMax + 1e-9; x += (xMax - xMin) / 300) {
            curve.push([x, (P.shape === 'coil' ? C.coilAxis(P.N, P.R, P.I, x / 100) : C.solenoidAxis(P.N / P.L, P.L, P.R, P.I, x / 100)) * 1e6]);
            if (Math.abs(pf.y) > 0.05) { const b = C.planeField(P, x / 100, pf.y / 100); line.push([x, Math.hypot(b.bx, b.by) * 1e6]); }
          }
          series.push({ type: 'curve', pts: curve, color: D.c.neg, width: 2 });
          legend.push([D.c.neg, T('軸上的 B', 'B on the axis'), 'line']);
          if (line.length && !line.some(function (p) { return !isFinite(p[1]); })) { series.push({ type: 'curve', pts: line, color: D.c.accent, width: 1.6, dash: [6, 4] }); legend.push([D.c.accent, T('通過探測點、平行於軸的線上 |B|', '|B| along the line through the probe'), 'dash']); }
          if (P.shape === 'solenoid') {
            series.push({ type: 'hline', y: C.solenoidIdeal(P.N / P.L, P.I) * 1e6, color: D.c.muted, dash: [3, 4] });
            series.push({ type: 'vlines', xs: [-P.L * 50, P.L * 50], color: D.alpha(D.c.equi, 0.6) });
            legend.push([D.c.muted, [T('理想 μ', 'Ideal μ'), ['0'], 'nI'], 'dash']);
          }
          const rows = st.rowsP.filter(function (r) { return sameParams(r, P) && Math.abs(r.I - P.I) < 0.005; });
          series.push({ type: 'pts', pts: rows.map(function (r) { return [r.x, r.B]; }), color: D.c.equi });
          if (!pf.inside) series.push({ type: 'probe', pt: [pf.x, pf.B * 1e6] });
        }
        yMax = 0;
        series.forEach(function (s) {
          if (s.type === 'curve') s.pts.forEach(function (p) { if (isFinite(p[1]) && p[0] >= xMin && p[0] <= xMax) yMax = Math.max(yMax, Math.min(p[1], P.shape === 'wire' ? C.wireB(Math.max(P.I, 0), 0.006) * 1e6 : Infinity)); });
          if (s.type === 'hline') yMax = Math.max(yMax, s.y);
          if (s.type === 'pts') s.pts.forEach(function (p) { yMax = Math.max(yMax, p[1]); });
          if (s.type === 'probe' && isFinite(s.pt[1])) yMax = Math.max(yMax, s.pt[1]);
        });
        yMax = yMax > 0 ? yMax * 1.12 : 1;
      } else {
        xLab = T('電流 I (A)', 'Current I (A)'); xMin = 0; xMax = 5;
        const gi = graphIPoints();
        const kp = pf.inside || !(P.I > 0) ? null : pf.B * 1e6 / P.I;
        const kTheory = kp != null ? kp : (function () { const P1 = Object.assign({}, P, { I: 1 }); const b = C.planeField(P1, pf.x / 100, pf.y / 100); return Math.hypot(b.bx, b.by) * 1e6; })();
        if (isFinite(kTheory)) { series.push({ type: 'line', k: kTheory, color: D.c.neg, width: 2 }); legend.push([D.c.neg, T('此位置的理論直線', 'Theory at this position'), 'line']); }
        if (gi.pts.length >= 2) { series.push({ type: 'line', k: gi.k, color: D.c.equi, width: 1.6, dash: [7, 4] }); legend.push([D.c.equi, T('紀錄的最佳直線', 'Best line through the rows'), 'dash']); }
        series.push({ type: 'pts', pts: gi.pts, color: D.c.equi });
        if (!pf.inside) series.push({ type: 'probe', pt: [P.I, pf.B * 1e6] });
        yMax = Math.max(isFinite(kTheory) ? kTheory * 5 : 1, Math.max.apply(null, gi.pts.map(function (p) { return p[1]; }).concat([0]))) * 1.08;
      }
      yLab = ['|B|'];
    }
    // 單位：大於 1000 μT 改用 mT
    unit = 1;
    let uName = 'μT';
    if (yMax >= 1000) { unit = 1000; uName = 'mT'; }
    if (st.mode !== 'oersted') yLab = ['|B| (' + uName + ')'];
    const X = function (x) { return Lm + (x - xMin) / (xMax - xMin) * pw; };
    const Y = function (y) { return Tm + ph - y / yMax * ph; };
    // 格線與刻度
    const xs1 = niceStep(xMax - xMin, 6), ys1 = niceStep(yMax / unit, 5);
    g.font = font(11, '600'); g.fillStyle = D.c.muted; g.strokeStyle = D.alpha(D.c.text, 0.1); g.lineWidth = 1;
    for (let x = Math.ceil(xMin / xs1) * xs1; x <= xMax + 1e-9; x += xs1) {
      g.beginPath(); g.moveTo(Math.round(X(x)) + 0.5, Tm); g.lineTo(Math.round(X(x)) + 0.5, Tm + ph); g.stroke();
      D.haloText(g, minus(String(+x.toFixed(6))), X(x), Tm + ph + 14, D.c.muted, 'center', 'middle', font(11, '600'));
    }
    for (let y = 0; y <= yMax / unit + 1e-9; y += ys1) {
      g.beginPath(); g.moveTo(Lm, Math.round(Y(y * unit)) + 0.5); g.lineTo(Lm + pw, Math.round(Y(y * unit)) + 0.5); g.stroke();
      D.haloText(g, String(+(y).toPrecision(4)), Lm - 6, Y(y * unit), D.c.muted, 'right', 'middle', font(11, '600'));
    }
    g.strokeStyle = D.alpha(D.c.text, 0.55); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(Lm, Tm); g.lineTo(Lm, Tm + ph); g.lineTo(Lm + pw, Tm + ph); g.stroke();
    D.haloText(g, xLab, Lm + pw / 2, GH - 10, D.c.text, 'center', 'alphabetic', font(12, '700'));
    g.save(); g.translate(14, Tm + ph / 2); g.rotate(-Math.PI / 2);
    rich(g, yLab, 0, 0, D.c.text, 'center', 12, '700'); g.restore();
    g.save();
    g.beginPath(); g.rect(Lm, Tm - 4, pw + 4, ph + 4); g.clip();
    series.forEach(function (s) {
      g.setLineDash(s.dash || []);
      if (s.type === 'line') {
        g.strokeStyle = s.color; g.lineWidth = s.width || 2;
        g.beginPath(); g.moveTo(X(Math.max(0, xMin)), Y(s.k * Math.max(0, xMin))); g.lineTo(X(xMax), Y(s.k * xMax)); g.stroke();
      } else if (s.type === 'curve') {
        g.strokeStyle = s.color; g.lineWidth = s.width || 2;
        g.beginPath();
        let started = false;
        s.pts.forEach(function (p) { if (!isFinite(p[1])) { started = false; return; } const yy = Y(Math.min(p[1], yMax * 3)); if (started) g.lineTo(X(p[0]), yy); else { g.moveTo(X(p[0]), yy); started = true; } });
        g.stroke();
      } else if (s.type === 'hline') {
        g.strokeStyle = s.color; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(Lm, Y(s.y)); g.lineTo(Lm + pw, Y(s.y)); g.stroke();
      } else if (s.type === 'vlines') {
        g.strokeStyle = s.color; g.lineWidth = 1; g.setLineDash([2, 4]);
        s.xs.forEach(function (x) { g.beginPath(); g.moveTo(X(x), Tm); g.lineTo(X(x), Tm + ph); g.stroke(); });
      }
      g.setLineDash([]);
    });
    series.forEach(function (s) {
      if (s.type === 'pts') {
        s.pts.forEach(function (p) {
          const x = X(p[0]), y = Y(p[1]);
          if (s.diamond) { g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); g.fillStyle = s.color; g.fill(); g.strokeStyle = D.c['canvas-bg']; g.lineWidth = 1.2; g.stroke(); }
          else if (s.hollow) { g.beginPath(); g.arc(x, y, 4.5, 0, 2 * Math.PI); g.fillStyle = D.alpha(D.c['canvas-bg'], 0.9); g.fill(); g.strokeStyle = s.color; g.lineWidth = 2; g.stroke(); }
          else D.ball(g, x, y, 4.5, s.color, { glow: 0 });
        });
      } else if (s.type === 'probe' && isFinite(s.pt[1])) {
        const x = X(s.pt[0]), y = Y(s.pt[1]);
        g.strokeStyle = D.c.accent; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 7, 0, 2 * Math.PI); g.stroke();
        g.fillStyle = D.c.accent; g.beginPath(); g.arc(x, y, 2.4, 0, 2 * Math.PI); g.fill();
      }
    });
    g.restore();
    // 圖例
    let lx = Lm + 8, ly = Tm - 10;
    const lf = font(11, '600');
    if (st.mode !== 'oersted') legend.push([D.c.accent, T('探測點（目前）', 'Probe (now)'), 'ring']);
    else legend.push([D.c.neg, T('紀錄', 'Rows'), 'ring']);
    g.font = lf;
    legend.forEach(function (it) {
      const parts = Array.isArray(it[1]) ? it[1] : [it[1]];
      const w = richW(g, parts, 11, '600') + 30;
      if (lx + w > GW - 8) { lx = Lm + 8; ly += 15; }
      g.strokeStyle = it[0]; g.fillStyle = it[0]; g.lineWidth = 2;
      if (it[2] === 'line' || it[2] === 'dash') { g.setLineDash(it[2] === 'dash' ? [5, 3] : []); g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + 18, ly); g.stroke(); g.setLineDash([]); }
      else if (it[2] === 'ring') { g.beginPath(); g.arc(lx + 9, ly, 4.5, 0, 2 * Math.PI); g.stroke(); }
      else { g.beginPath(); g.arc(lx + 9, ly, 4, 0, 2 * Math.PI); g.fill(); }
      rich(g, parts, lx + 22, ly, D.c.text, 'left', 11, '600');
      lx += w + 8;
    });
    if (st.mode === 'oersted' && !st.rowsO.length) D.haloText(g, T('記錄數據後，點會出現在這裡', 'Recorded points will appear here'), Lm + pw / 2, Tm + ph / 2, D.c.muted, 'center', 'middle', font(12, '600'));
    gcv.setAttribute('aria-label', st.mode === 'oersted' ? T('分析圖：導線磁場 B 對 tan θ，斜率為地磁水平分量', 'Graph of the wire’s field against tan θ; the slope is the horizontal component of the Earth’s field')
      : st.graph === 'pos' ? T('分析圖：磁場大小對位置', 'Graph of the field strength against position') : T('分析圖：磁場大小對電流', 'Graph of the field strength against the current'));
  }
  $('gPos').addEventListener('click', function () { st.graph = 'pos'; $('gPos').setAttribute('aria-pressed', 'true'); $('gI').setAttribute('aria-pressed', 'false'); drawGraph(); });
  $('gI').addEventListener('click', function () { st.graph = 'I'; $('gI').setAttribute('aria-pressed', 'true'); $('gPos').setAttribute('aria-pressed', 'false'); drawGraph(); });

  // =====================================================================
  // 控制項
  // =====================================================================
  function outs() {
    $('Io').textContent = f2(val(el.I)) + ' A';
    $('ho').textContent = fL(val(el.h)) + ' cm';
    $('alphao').textContent = minus(String(Math.round(val(el.alpha) * 10) / 10)) + '°';
    $('do').textContent = minus(fL(val(el.d))) + ' cm';
    $('dialo').textContent = minus(f1(val(el.dial))) + '°';
    $('No').textContent = String(Math.round(val(el.N)));
    $('Ro').textContent = fL(val(el.R)) + ' cm';
    $('Nso').textContent = String(Math.round(val(el.Ns)));
    $('Lso').textContent = fL(val(el.Ls)) + ' cm';
    $('Rso').textContent = fL(val(el.Rs)) + ' cm';
    $('pxo').textContent = minus(f2(val(el.px))) + ' cm';
    $('pyo').textContent = minus(f2(val(el.py))) + ' cm';
  }
  function dirHint() {
    const a = Math.abs(val(el.alpha)) < 0.5;
    let t = '';
    if (st.mode === 'oersted') t = a ? (st.s > 0 ? T('電流沿導線向北流。', 'The current flows north along the wire.') : T('電流沿導線向南流。', 'The current flows south along the wire.'))
      : (st.s > 0 ? T('電流沿導線方位的方向流（α 方向）。', 'The current flows in the direction α.') : T('電流沿導線方位的反方向流。', 'The current flows opposite to α.'));
    else if (st.mode === 'wire') t = st.s > 0 ? T('電流射出紙面（⊙）。', 'The current comes out of the page (⊙).') : T('電流射入紙面（⊗）。', 'The current goes into the page (⊗).');
    else t = st.s > 0 ? T('正向：軸上的磁場向右（+x）。', 'Forward: the field on the axis points right (+x).') : T('反向：軸上的磁場向左（−x）。', 'Reverse: the field on the axis points left (−x).');
    $('dirHint').textContent = t;
  }
  function instHint() {
    $('instHint').textContent = st.inst === 'real'
      ? T('含誤差：電流表有校正誤差、刻度盤的零點偏了 1°～2°、轉軸有摩擦。先在不通電時轉動刻度盤，讓指針對準 0°。', 'With errors: the ammeter has a calibration error, the dial’s zero is 1°–2° off and the pivot has friction. With no current, first turn the dial until the needle reads 0°.')
      : T('理想：電流表準確、刻度盤零點正確、轉軸沒有摩擦。', 'Ideal: an exact ammeter, a correctly zeroed dial and a frictionless pivot.');
  }
  function updateButtons() {
    $('record').disabled = false;
  }
  function legend() {
    let h = '';
    if (st.mode === 'oersted') {
      h = '<span style="color:var(--cm-earth)"><i style="background:var(--cm-earth)"></i>' + T('地磁水平分量 B<sub>H</sub>', 'Earth’s horizontal field B<sub>H</sub>') + '</span>' +
        '<span style="color:var(--neg)"><i style="background:var(--neg)"></i>' + T('導線的磁場 B<sub>I</sub>', 'Wire’s field B<sub>I</sub>') + '</span>' +
        '<span style="color:var(--field)"><i style="background:var(--field)"></i>' + T('合磁場 B', 'Total field B') + '</span>' +
        '<span style="color:var(--equi)"><i style="background:var(--equi)"></i>' + T('電流 I', 'Current I') + '</span>';
    } else {
      h = '<span style="color:var(--neg)"><i style="background:var(--neg)"></i>' + T('磁力線', 'Field lines') + '</span>' +
        '<span><i class="grad"></i>' + T('|B| 強度（對數色階）', '|B| (log colour scale)') + '</span>' +
        '<span style="color:var(--equi)"><i style="background:var(--equi)"></i>' + T('電流 I（⊙ 射出、⊗ 射入）', 'Current I (⊙ out, ⊗ in)') + '</span>' +
        '<span style="color:var(--accent)"><i style="background:var(--accent)"></i>' + T('探測點', 'Probe') + '</span>';
    }
    $('legend').innerHTML = h;
    const hint = st.mode === 'oersted'
      ? T('左：俯視的羅盤與導線（上方導線的影子越遠表示越高；下方導線被刻度盤擋住的部分畫成虛線）。右：沿導線看的側視圖，以及磁場的向量相加。箭頭長度 ∝ 磁場，比例尺隨大小自動調整。',
        'Left: the compass and the wire seen from above (the higher the wire, the further its shadow; a wire below is dashed where the dial hides it). Right: a side view along the wire and the vector sum of the fields. Arrow lengths ∝ field, with an automatic scale.')
      : st.mode === 'wire'
        ? T('從導線的一端看過去：導線垂直於紙面。同心圓的疏密與 1/r 成正比；色階表示 |B|（對數）。地磁忽略不計。', 'Looking along the wire, which is perpendicular to the page. The density of the circles is proportional to 1/r; the colour shows |B| (logarithmic). The Earth’s field is ignored.')
        : T('通過軸線的剖面，依比例繪製。中央平面上相鄰磁力線之間的 ∫B dy 相等，所以那裡的疏密代表強弱；色階表示 |B|（對數）。探測點的箭頭只表示方向。', 'A cross-section through the axis, to scale. Neighbouring field lines enclose equal ∫B dy on the central plane, so their spacing there shows the strength; the colour shows |B| (logarithmic). The probe’s arrow shows direction only.');
    $('hint2').textContent = hint;
    cv.setAttribute('aria-label', st.mode === 'oersted'
      ? T('厄斯特實驗：俯視的羅盤、磁針與導線，右邊是側視圖與磁場向量圖。可拖曳導線；鍵盤：方向鍵移動導線，R 記錄。', 'Ørsted’s experiment: the compass, needle and wire from above, with a side view and a vector diagram. Drag the wire; keyboard: arrow keys move the wire, R records.')
      : T('磁場剖面：導體、磁力線、強度色階與探測點。可拖曳探測點；鍵盤：方向鍵移動探測點，Shift 加方向鍵移動較多，R 記錄。', 'Field cross-section: the conductor, field lines, a colour map of |B| and the probe. Drag the probe; keyboard: arrow keys move it, Shift moves it further, R records.'));
  }
  function showCards() {
    const oer = st.mode === 'oersted';
    $('cardOer').hidden = !oer; $('cardInst').hidden = !oer; $('cardShape').hidden = oer;
    $('coilBox').hidden = st.mode !== 'coil'; $('solBox').hidden = st.mode !== 'solenoid';
    $('lbVec').hidden = false;
    $('lbLines').hidden = oer; $('lbMap').hidden = oer; $('lbNeedles').hidden = oer;
    $('shapeTitle').textContent = st.mode === 'wire' ? T('長直導線', 'Long straight wire') : st.mode === 'coil' ? T('圓線圈', 'Circular coil') : T('螺線管', 'Solenoid');
    $('pxLabel').textContent = st.mode === 'wire' ? T('探測點 x', 'Probe x') : T('探測點 x（沿軸）', 'Probe x (along the axis)');
    $('pyLabel').textContent = st.mode === 'wire' ? T('探測點 y', 'Probe y') : T('探測點 y（離軸）', 'Probe y (from the axis)');
  }
  function setMode(m) {
    if (st.mode === m) return;
    st.mode = m;
    ['mOer', 'mWire', 'mCoil', 'mSol'].forEach(function (id) { $(id).setAttribute('aria-pressed', String($(id).getAttribute('data-mode') === m)); });
    if (isExp()) {
      const R = RANGE[m], p = st.probe[m];
      el.px.min = -R.x; el.px.max = R.x; el.py.min = -R.y; el.py.max = R.y;
      suppress = true; setVal(el.px, clamp(p.x, -R.x, R.x)); setVal(el.py, clamp(p.y, -R.y, R.y)); suppress = false;
    }
    showCards(); dirHint(); legend(); outs();
    resize();
    renderTable(); drawGraph(); updateReadouts();
    syncKeys();
    if (view3 && view3.active) view3.rebuild();
    if (m === 'oersted') wake();
    requestDraw();
  }
  let suppress = false, sliderActive = false;
  document.querySelectorAll('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); }); });
  function onParam(user) {
    outs();
    if (st.mode === 'oersted') { userDirty = userDirty || !!user; wake(); }
    updateReadouts(); requestDraw();
    if (graphTimer) clearTimeout(graphTimer);
    graphTimer = setTimeout(function () { graphTimer = 0; drawGraph(); renderAna(); }, 60);
    if (view3 && view3.active) view3.update();
  }
  let graphTimer = 0;
  ['I', 'h', 'alpha', 'd', 'dial', 'N', 'R', 'Ns', 'Ls', 'Rs'].forEach(function (k) {
    el[k].addEventListener('input', function (e) { sliderActive = !!e.isTrusted; onParam(true); if (k === 'dial') layerKey = ''; if (k === 'alpha') dirHint(); });
    el[k].addEventListener('change', function () { sliderActive = false; geomKey = ''; onParam(true); if (k === 'dial') layerKey = ''; });
  });
  ['px', 'py'].forEach(function (k) {
    el[k].addEventListener('input', function (e) {
      if (!suppress && isExp()) { st.probe[st.mode] = { x: val(el.px), y: val(el.py) }; }
      sliderActive = !!e.isTrusted; onParam(true);
    });
    el[k].addEventListener('change', function () { sliderActive = false; onParam(true); });
  });
  el.loc.addEventListener('change', function () { onParam(true); renderAna(); drawGraph(); });
  el.noEarth.addEventListener('change', function () { st.earth = !el.noEarth.checked; onParam(true); });
  function pressPair(a, b, onA) { $(a).setAttribute('aria-pressed', String(onA)); $(b).setAttribute('aria-pressed', String(!onA)); }
  $('dirF').addEventListener('click', function () { st.s = 1; pressPair('dirF', 'dirR', true); dirHint(); geomKey = ''; mapKey = ''; onParam(true); });
  $('dirR').addEventListener('click', function () { st.s = -1; pressPair('dirF', 'dirR', false); dirHint(); geomKey = ''; mapKey = ''; onParam(true); });
  $('posAbove').addEventListener('click', function () { st.above = true; pressPair('posAbove', 'posBelow', true); onParam(true); });
  $('posBelow').addEventListener('click', function () { st.above = false; pressPair('posAbove', 'posBelow', false); onParam(true); });
  $('instIdeal').addEventListener('click', function () { st.inst = 'ideal'; pressPair('instIdeal', 'instReal', true); instHint(); layerKey = ''; needle.stuck = false; onParam(true); });
  $('instReal').addEventListener('click', function () { st.inst = 'real'; pressPair('instIdeal', 'instReal', false); instHint(); layerKey = ''; onParam(true); });
  [['showLabels', 'labels'], ['showVec', 'vec'], ['showLines', 'lines'], ['showMap', 'map'], ['showNeedles', 'needles']].forEach(function (p) {
    $(p[0]).addEventListener('change', function () { st.show[p[1]] = $(p[0]).checked; layerKey = ''; requestDraw(); if (view3 && view3.active) view3.update(); });
  });
  [['s3lines', 'lines'], ['s3needles', 'needles'], ['s3filings', 'filings']].forEach(function (p) {
    $(p[0]).addEventListener('change', function () { st.show3[p[1]] = $(p[0]).checked; if (view3 && view3.active) view3.update(); });
  });

  // =====================================================================
  // 拖曳（滑鼠／觸控）與鍵盤
  // =====================================================================
  let drag = null, hoverProbe = false;
  function ptr(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function hitOer(p) {
    const L = oerLayout(), G = topGeom(L), ws = wireScreen(G);
    // 側視圖上的導線
    const S = sideGeom(L.side), h = val(el.h), d = val(el.d);
    const xw = S.X(-d), yw = S.Y(st.above ? h : -h);
    if (p.x > L.side.x && p.x < L.side.x + L.side.w && p.y > L.side.y && p.y < L.side.y + L.side.h && Math.hypot(p.x - xw, p.y - yw) < 26) return { kind: 'side', S: S };
    // 俯視圖上的導線（距離導線直線 < 18 px）
    const dist = Math.abs((p.x - ws.x) * ws.vx + (p.y - ws.y) * ws.vy);
    const t = L.top;
    if (p.x > t.x && p.x < t.x + t.w && p.y > t.y && p.y < t.y + t.h && dist < 20) return { kind: 'top', G: G };
    return null;
  }
  function hitProbe(p) { const V = expView(), pr = st.probe[st.mode]; return Math.hypot(p.x - V.X(pr.x), p.y - V.Y(pr.y)) < 26; }
  cv.addEventListener('pointerdown', function (e) {
    if (stage.classList.contains('is3d')) return;
    const p = ptr(e);
    if (st.mode === 'oersted') {
      const h = hitOer(p);
      if (!h) return;
      drag = h; drag.d0 = val(el.d); drag.h0 = val(el.h); drag.p0 = p;
    } else {
      drag = { kind: 'probe' };
      moveProbeTo(p);
    }
    cv.setPointerCapture(e.pointerId);
    cv.classList.add('grabbing');
    e.preventDefault();
  });
  function moveProbeTo(p) {
    const V = expView(), R = RANGE[st.mode];
    const x = clamp(Math.round(V.wx(p.x) * 10) / 10, -R.x, R.x), y = clamp(Math.round(V.wy(p.y) * 10) / 10, -R.y, R.y);
    suppress = true; setVal(el.px, x); setVal(el.py, y); suppress = false;
    st.probe[st.mode] = { x: x, y: y };
    onParam(true);
  }
  cv.addEventListener('pointermove', function (e) {
    const p = ptr(e);
    if (!drag) {
      if (stage.classList.contains('is3d')) return;
      const over = st.mode === 'oersted' ? !!hitOer(p) : hitProbe(p);
      if (st.mode !== 'oersted' && over !== hoverProbe) { hoverProbe = over; requestDraw(); }
      cv.classList.toggle('grab', over);
      return;
    }
    if (drag.kind === 'probe') { moveProbeTo(p); return; }
    if (drag.kind === 'top') {
      const ws = wireScreen(drag.G);
      // 導線沿 v 方向移動 → d 減少（d 是磁針相對於導線的側移）
      const dv = ((p.x - drag.p0.x) * ws.vx + (p.y - drag.p0.y) * ws.vy) / drag.G.k;
      setVal(el.d, clamp(Math.round((drag.d0 - dv) * 10) / 10, -8, 8));
    } else {
      const S = drag.S;
      const dz = -(p.y - drag.p0.y) / S.k, dx = (p.x - drag.p0.x) / S.k;
      const hNew = clamp(Math.round((drag.h0 + (st.above ? dz : -dz)) * 10) / 10, 1, 10);
      setVal(el.h, hNew);
      setVal(el.d, clamp(Math.round((drag.d0 - dx) * 10) / 10, -8, 8));
    }
  });
  function endDrag() { if (!drag) return; drag = null; cv.classList.remove('grabbing'); geomKey = ''; onParam(true); }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (hoverProbe) { hoverProbe = false; requestDraw(); } });

  // 鍵盤（js/keys.js）
  const kbItems = [];
  let kb = null;
  function syncKeys() {
    kbItems.length = 0;
    if (st.mode === 'oersted') {
      kbItems.push({
        name: function () { return T('導線', 'Wire'); },
        move: function (dx, dy, big) {
          const step = big ? 1 : 0.1;
          if (dx) setVal(el.d, clamp(Math.round((val(el.d) - dx * step) * 10) / 10, -8, 8));
          if (dy) setVal(el.h, clamp(Math.round((val(el.h) + (st.above ? dy : -dy) * step) * 10) / 10, 1, 10));
          return true;
        },
        describe: function () { return T('導線：鉛直距離 r = ', 'Wire: vertical distance r = ') + fL(val(el.h)) + T(' cm，側移 d = ', ' cm, sideways d = ') + minus(fL(val(el.d))) + ' cm. ' + T('磁針偏角 ', 'Deflection ') + minus(f1(Math.abs(reading()))) + '° ' + sideWord(reading()); }
      });
    } else {
      kbItems.push({
        name: function () { return T('探測點', 'Probe'); },
        move: function (dx, dy, big) {
          const step = big ? 1 : 0.1, R = RANGE[st.mode];
          const x = clamp(Math.round((val(el.px) + dx * step) * 10) / 10, -R.x, R.x), y = clamp(Math.round((val(el.py) + dy * step) * 10) / 10, -R.y, R.y);
          suppress = true; setVal(el.px, x); setVal(el.py, y); suppress = false;
          st.probe[st.mode] = { x: x, y: y };
          onParam(true);
          return true;
        },
        describe: function () { const pf = probeField(); return T('探測點 (', 'Probe at (') + minus(f1(pf.x)) + ', ' + minus(f1(pf.y)) + T(') cm，|B| = ', ') cm, |B| = ') + (pf.inside ? '—' : fmtB(pf.B)); }
      });
    }
  }
  function drawKeyFocusOer(L, G) {
    if (!kb || !kb.focused()) return;
    const ws = wireScreen(G);
    ctx.save();
    ctx.strokeStyle = D.c.accent; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    ctx.translate(ws.x, ws.y); ctx.rotate(Math.atan2(ws.uy, ws.ux));
    D.roundRect(ctx, -G.Rd * 1.2, -14, G.Rd * 2.4, 28, 8); ctx.stroke();
    ctx.restore();
  }
  syncKeys();
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('實驗畫布：方向鍵移動導線或探測點，Shift 加方向鍵移動較多，R 記錄。', 'Simulation canvas: arrow keys move the wire or the probe, Shift moves further, R records.'),
      items: kbItems,
      onChange: function () { requestDraw(); }
    });
  }
  cv.addEventListener('keydown', function (e) {
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); record(); }
  });

  // =====================================================================
  // 3D 檢視（three.js 以 import() 延遲載入；場景在 current-magnetic-field-3d.js）
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
    const o = oerParams(), f = ofield();
    return {
      mode: st.mode, I: Iset(), s: st.s, above: st.above, h: o.h, alpha: o.alpha, d: o.d, earth: st.earth, BH: loc().H,
      phi: needle.phi, field: f, P: isExp() ? shapeParams() : null, probe: isExp() ? st.probe[st.mode] : null,
      show: st.show, show3: st.show3, flowT: flowT, reading: reading(), zero: zeroOffset()
    };
  }
  function setPressed3(mode) { $('view2d').setAttribute('aria-pressed', String(mode === '2d')); $('view3d').setAttribute('aria-pressed', String(mode === '3d')); }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed3('3d');
      if (!webglAvailable() || !window.CurrentMagneticField3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        view3 = window.CurrentMagneticField3D.create(lib, {
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
  // 分享連結：探測點（三種形狀各一個）與磁針角度
  // =====================================================================
  // 頁面程式比 classroom.js 早執行：先放進 LAB_SHARE_EXTRAS，classroom.js 載入時會補登記
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
      get: function () { return { probe: st.probe }; },
      set: function (o) {
        if (!o || typeof o !== 'object' || !o.probe) return;
        ['wire', 'coil', 'solenoid'].forEach(function (k) {
          const p = o.probe[k], R = RANGE[k];
          if (p && isFinite(+p.x) && isFinite(+p.y)) st.probe[k] = { x: clamp(+p.x, -R.x, R.x), y: clamp(+p.y, -R.y, R.y) };
        });
        if (isExp()) { const p = st.probe[st.mode]; suppress = true; setVal(el.px, p.x); setVal(el.py, p.y); suppress = false; }
        geomKey = ''; onParam(false);
      }
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  function onTheme() {
    readTokens(); layerKey = ''; mapKey = '';
    if (view3 && view3.active) view3.onTheme();
    requestDraw(); drawGraph();
  }
  window.addEventListener('lab:themechange', onTheme);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', onTheme);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) requestDraw(); });
  // 初始：磁針停在平衡方向
  needle.phi = ofield().thetaEq * DEG;
  showCards(); dirHint(); instHint(); legend(); outs(); updateSoundButton();
  renderTable(); updateReadouts();
  if (window.ResizeObserver) {
    let lastW = 0, lastG = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth !== lastG) { lastG = gcv.clientWidth; sizeGraph(); drawGraph(); } }).observe(gcv);
  }
  window.addEventListener('resize', function () { resize(); sizeGraph(); drawGraph(); });
  resize(); sizeGraph(); drawGraph();
  // 測試介面（Playwright、縮圖用）
  window.__cmf = { st: st, needle: needle, record: record, setMode: setMode, cal: cal, probeField: probeField, reading: reading, ofield: ofield };
})();
