/*
 * solution-concentration.js — 「濃度與溶液配製」的頁面程式（器材畫面、步驟按鈕、刻度線放大鏡、讀數、結果、圖表、3D 切換、任務事件）
 * 化學核心在 js/solution-concentration-core.js（SolCore）；3D 檢視在 js/solution-concentration-3d.js（Sol3D，three.js 延遲載入）。
 * 畫面上倒液、滴落、搖晃只是示意動畫；量瓶的形狀、液面高度、顏色深淺都直接由核心計算（同一個量瓶幾何、比爾定律）。
 *
 * 任務事件（只在使用者操作過之後送出）：
 *   'made'：按「完成」（內容由 SolCore.madeEvent 產生，欄位說明見 js/missions/solution-concentration.js）
 *   'convert'：濃度換算模式改溶質或拉滑桿 { sp, w, C, m, x, ppm }
 */
(function () {
  'use strict';
  const S = window.SolCore, LD = window.LabDraw;
  if (!S || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const FONT = LD.FONT;
  const reducedMotion = LD.reducedMotion();
  const LCD_BG = '#17201f', LCD_FG = '#8ef0c4';

  // ======================= 數字格式 =======================
  function num(x, d) {
    if (x == null || !isFinite(x)) return '—';
    const s = (+x).toFixed(d == null ? 0 : d);
    return s.charAt(0) === '-' ? (/^-0(\.0*)?$/.test(s) ? s.slice(1) : '−' + s.slice(1)) : s;
  }
  function sigf(x, sig) {
    if (x == null || !isFinite(x)) return '—';
    if (x === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(x)));
    return num(x, Math.max(0, Math.min(8, (sig || 3) - 1 - e)));
  }
  function sciParts(x, sig) {
    if (x == null || !isFinite(x) || x === 0) return { m: x === 0 ? '0' : '—', e: null };
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= -3 && e < 5) return { m: sigf(x, sig), e: null };
    const m = x / Math.pow(10, e);
    if (Math.abs(+m.toFixed((sig || 3) - 1)) >= 10) return sciParts(Math.sign(x) * Math.pow(10, e + 1), sig);
    return { m: num(m, (sig || 3) - 1), e: e };
  }
  function sciHTML(x, sig) { const p = sciParts(x, sig); return p.e == null ? p.m : p.m + ' × 10<sup>' + num(p.e, 0) + '</sup>'; }
  function pct(e, d) { if (e == null || !isFinite(e)) return '—'; return (e > 0 ? '+' : '') + num(e * 100, d == null ? 2 : d) + '%'; }
  function fH(s) { return s.replace(/([A-Za-z\)])(\d+)/g, '$1<sub>$2</sub>'); }

  // ======================= 名稱 =======================
  const FORMULA = { 'CuSO4-5H2O': 'CuSO4·5H2O', CuSO4: 'CuSO4', NaCl: 'NaCl', NaOH: 'NaOH' };
  function solidName(k) {
    return k === 'CuSO4-5H2O' ? T('五水硫酸銅', 'copper(II) sulfate pentahydrate') : k === 'CuSO4' ? T('無水硫酸銅', 'anhydrous copper(II) sulfate')
      : k === 'NaCl' ? T('氯化鈉', 'sodium chloride') : T('氫氧化鈉', 'sodium hydroxide');
  }
  function spName(sp) { return sp === 'CuSO4' ? T('硫酸銅', 'copper(II) sulfate') : sp === 'NaCl' ? T('氯化鈉', 'sodium chloride') : T('氫氧化鈉', 'sodium hydroxide'); }

  // ======================= 顏色 =======================
  let col = {};
  function readColors() {
    const c = LD.c, dk = LD.dark;
    col = {
      text: c.text, muted: c.muted, border: c.border, accent: c.accent, bg: c['canvas-bg'], surface: c.surface,
      pos: c.pos || '#d1453b', neg: c.neg || '#2f6fd0', probe: c.probe || '#0d7f57', dark: dk,
      glass: dk ? '#a9c3cf' : '#7d97a5', glassHi: dk ? 'rgba(235,248,255,0.55)' : 'rgba(255,255,255,0.85)',
      water: dk ? 'rgba(120,170,205,0.30)' : 'rgba(150,200,230,0.32)',
      bench: dk ? '#3a3631' : '#d9cbb4', benchEdge: dk ? '#2a2723' : '#bba98e',
      metal: dk ? '#c3cad1' : '#9aa4ae', body: dk ? '#4b5560' : '#e7ebef', crystal: '#2f7fd8', powder: dk ? '#d5d7d2' : '#eef0ec'
    };
  }
  /** 溶液在光程 lcm（公分）的顏色；硫酸銅照比爾定律，其他無色 */
  function liqColor(sp, C, lcm, a) {
    if (sp === 'CuSO4' && C > 0) {
      const t = S.transmit(C, lcm);
      return 'rgba(' + Math.round(255 * t[0]) + ',' + Math.round(255 * t[1]) + ',' + Math.round(255 * t[2]) + ',' + (a == null ? 0.88 : a) + ')';
    }
    return col.water;
  }

  // ======================= 狀態 =======================
  const state = { mode: 'weigh', solid: 'CuSO4-5H2O', stock: 'Cu1', Vf: 100, sp: 'NaCl', tab: 'bottles', view: '2d' };
  let P = null, bottles = [], last = null, seq = 0;
  let userActed = false, syncing = false;
  let anim = null;           // { kind, t0, dur }
  let lastApp = null;        // 上一次看到的液面位置（判斷越過刻度線）
  let view3 = null;
  const cv = $('cv'), ctx = cv.getContext('2d');
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  const el = { mass: $('mass'), V1: $('V1'), target: $('target'), eye: $('eye'), wt: $('wt'), wet: $('wet'), pipRinse: $('pipRinse') };
  const statusEl = $('status');
  function val(e) { return window.LabNum ? window.LabNum.value(e) : +e.value; }
  function setVal(e, v) { syncing = true; if (window.LabNum) window.LabNum.set(e, v); else e.value = v; syncing = false; }
  function snd() { return window.LabSound && window.LabSound.enabled(); }
  function eye() { return val(el.eye); }
  function acted() { userActed = true; }
  function setStatus(s) { statusEl.innerHTML = s || ''; }

  // 目標濃度：對數滑桿 1.00 × 10^-6 ～ 2.00 M（位置 0–1000）
  const LOGSPAN = Math.log10(2e6);
  function roundSig(x, s) { if (!(x > 0)) return x; const e = Math.floor(Math.log10(x)); const p = Math.pow(10, s - 1 - e); return Math.round(x * p) / p; }
  const targetMap = {
    toValue: function (pos) { return roundSig(Math.pow(10, -6 + pos / 1000 * LOGSPAN), 3); },
    toPos: function (v) { return Math.max(0, Math.min(1000, (Math.log10(Math.max(1e-6, v)) + 6) / LOGSPAN * 1000)); },
    min: 1e-6, max: 2, decimals: 8
  };
  if (window.LabNum) window.LabNum.register(el.target, targetMap);
  function targetVal() { return window.LabNum ? val(el.target) : targetMap.toValue(+el.target.value); }

  function stockObj() {
    if (state.stock === 'last' && last) return { sp: last.sp, c: last.C, chain: last.chain, key: 'last' };
    const s = S.STOCKS[state.stock] || S.STOCKS.Cu1;
    return { sp: s.sp, c: s.c, chain: 0, key: state.stock in S.STOCKS ? state.stock : 'Cu1' };
  }
  function newPrep() {
    P = S.newPrep({
      mode: state.mode === 'dilute' ? 'dilute' : 'weigh', Vf: state.Vf, target: targetVal(), flaskWet: el.wet.checked,
      solid: state.solid, mass: Math.round(val(el.mass) * 1000) / 1000, stock: stockObj()
    });
    anim = null; lastApp = null;
    renderResult(null);
  }

  // ======================= 版面 =======================
  let cw = 600, ch = 440, dpr = 1;
  const L = {};
  function resize() {
    const w = cv.clientWidth || (view3 ? $('view3').clientWidth : 0);
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = w;
    ch = w < 600 ? (state.mode === 'convert' ? 640 : 500) : 440;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    layout();
    resizeGraph();
    draw(); drawGraph();
  }
  function layout() {
    const W = cw, narrow = W < 600, g5 = S.geom(state.Vf), zH = Math.max(g5.zTop, 150);
    L.narrow = narrow;
    L.bench = ch - (narrow ? 24 : 30);
    if (!narrow) {
      L.pxmm = Math.min((ch - 110) / zH, 0.27 * W / (2 * g5.R));
      L.fx = W * 0.55;
      L.inset = { x: W * 0.745, y: 12, w: Math.min(W * 0.24, 250), h: Math.min(ch * 0.6, 262) };
      L.inset.x = W - L.inset.w - 10;
      L.balX = W * 0.105; L.balW = Math.min(W * 0.17, 128);
      L.bkX = W * 0.31; L.bkW = W * 0.16;
    } else {
      L.pxmm = Math.min(0.44 * W / (2 * g5.R), (ch - 80) / zH);
      L.fx = W * 0.25;
      L.inset = { x: W * 0.52, y: 8, w: W * 0.48 - 8, h: 214 };
      L.balX = W * 0.875; L.balW = W * 0.22;
      L.bkX = W * 0.655; L.bkW = W * 0.2;
    }
  }

  // ======================= 畫布小工具 =======================
  /** 化學式（字母後的數字畫成下標） */
  function formula(c, s, x, y, color, size, align, weight) {
    size = size || 12;
    const fMain = (weight || '600') + ' ' + size + 'px ' + FONT, fSub = (weight || '600') + ' ' + (size * 0.72).toFixed(1) + 'px ' + FONT;
    const parts = [];
    let prev = '';
    for (const chr of s) {
      const sub = /\d/.test(chr) && /[A-Za-z\)]/.test(prev.slice(-1) || '') || (/\d/.test(chr) && parts.length && parts[parts.length - 1].sub);
      if (parts.length && parts[parts.length - 1].sub === !!sub) parts[parts.length - 1].t += chr; else parts.push({ t: chr, sub: !!sub });
      prev = chr;
    }
    let w = 0;
    parts.forEach(function (p) { c.font = p.sub ? fSub : fMain; p.w = c.measureText(p.t).width; w += p.w; });
    let x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    parts.forEach(function (p) {
      LD.haloText(c, p.t, x0, y + (p.sub ? size * 0.28 : 0), color || col.text, 'left', 'alphabetic', p.sub ? fSub : fMain);
      x0 += p.w;
    });
    return w;
  }
  function lcd(c, x, y, w, h, text, size) {
    LD.roundRect(c, x, y, w, h, 3);
    c.fillStyle = LCD_BG; c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1; c.stroke();
    c.font = '600 ' + (size || 12) + 'px ui-monospace, Menlo, Consolas, monospace';
    c.fillStyle = LCD_FG; c.textAlign = 'right'; c.textBaseline = 'middle';
    c.fillText(text, x + w - 5, y + h / 2 + 0.5);
  }
  function glassStroke(c, w) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = LD.alpha(col.glass, 0.95); c.lineWidth = w || 1.6; c.stroke();
  }

  // ======================= 量瓶 =======================
  /** 量瓶內輪廓的點（高度 z 由 0 到 zTop），換成畫布座標 */
  function flaskPoints(g, x, yb, k) {
    const pts = [], N = 64;
    for (let i = 0; i <= N; i++) {
      const z = g.zt * i / N;
      pts.push([z, g.r(z)]);
    }
    pts.push([g.zt + 6, g.rn]);
    pts.push([g.zTop, g.rn]);
    return pts.map(function (p) { return { y: yb - p[0] * k, r: p[1] * k }; });
  }
  function flaskPath(c, pts, x, grow) {
    c.beginPath();
    c.moveTo(x - pts[0].r - grow, pts[0].y + grow);
    pts.forEach(function (p) { c.lineTo(x - p.r - grow, p.y); });
    for (let i = pts.length - 1; i >= 0; i--) c.lineTo(x + pts[i].r + grow, pts[i].y);
    c.lineTo(x + pts[0].r + grow, pts[0].y + grow);
    c.closePath();
  }
  /** 量瓶裡液體的平均濃度與「沒搖勻」的程度 */
  function flaskConc() {
    const V = S.V20(P);
    return { C: V > 0 ? P.flask.n / V * 1000 : 0, V: V };
  }
  function drawFlask(c, x, yb, k, opts) {
    opts = opts || {};
    const g = P.g, pts = flaskPoints(g, x, yb, k);
    const lv = S.level(P), zL = Math.max(0, Math.min(g.zTop - 2, lv.z));
    const fc = flaskConc();
    let rot = 0;
    if (anim && anim.kind === 'shake') { const u = animU(); rot = Math.sin(u * Math.PI * 4) * 0.5 * Math.sin(u * Math.PI); }
    c.save();
    if (rot) { c.translate(x, yb - g.zMark * k * 0.5); c.rotate(rot); c.translate(-x, -(yb - g.zMark * k * 0.5)); }
    // 接觸陰影
    if (!rot) LD.contactShadow(c, x, yb + 1, g.rBottom * k * 1.05, 0);
    // 玻璃本體（淡淡的填色）
    flaskPath(c, pts, x, 1.5);
    const gg = c.createLinearGradient(x - g.R * k, 0, x + g.R * k, 0);
    gg.addColorStop(0, LD.alpha(col.glass, col.dark ? 0.18 : 0.14));
    gg.addColorStop(0.35, LD.alpha(col.glass, 0.03));
    gg.addColorStop(1, LD.alpha(col.glass, col.dark ? 0.22 : 0.18));
    c.fillStyle = gg; c.fill();
    // 液體
    if (P.flask.mw > 0 || P.flask.n > 0) {
      c.save();
      flaskPath(c, pts, x, 0); c.clip();
      const yL = yb - zL * k;
      const unmixed = !P.shaken && P.flask.n > 0 && fc.V > 0;
      // 瓶身：光程取瓶身直徑；瓶頸：取瓶頸直徑（比爾定律 → 瓶頸看起來較淡）
      const lB = 2 * g.R / 10, lN = 2 * g.rn / 10;
      const cBot = unmixed ? fc.C * 1.45 : fc.C, cTop = unmixed ? fc.C * 0.35 : fc.C;
      const yNeck = yb - g.zt * k;
      const gl = c.createLinearGradient(0, yb, 0, yL);
      gl.addColorStop(0, liqColor(P.sp, cBot, lB));
      gl.addColorStop(1, liqColor(P.sp, cTop, lB));
      c.fillStyle = gl;
      c.fillRect(x - g.R * k - 3, Math.max(yL, yNeck - 1), 2 * g.R * k + 6, yb - Math.max(yL, yNeck - 1) + 2);
      if (zL > g.zt) {
        c.fillStyle = liqColor(P.sp, cTop, lN);
        c.fillRect(x - g.rn * k - 1, yL, 2 * g.rn * k + 2, yNeck - yL + 1);
      }
      // 液面：彎月面（中間低、兩邊沿玻璃往上爬）
      const rr = g.r(zL) * k;
      c.beginPath();
      c.moveTo(x - rr, yL - 1.6); c.quadraticCurveTo(x, yL + 1.8, x + rr, yL - 1.6);
      c.strokeStyle = LD.alpha(col.dark ? '#ffffff' : '#244a63', 0.55); c.lineWidth = 1.2; c.stroke();
      // 液體的立體光影：左亮右暗
      const sh = c.createLinearGradient(x - g.R * k, 0, x + g.R * k, 0);
      sh.addColorStop(0, 'rgba(255,255,255,0.20)'); sh.addColorStop(0.3, 'rgba(255,255,255,0)'); sh.addColorStop(0.75, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.16)');
      c.fillStyle = sh; c.fillRect(x - g.R * k - 3, yL - 2, 2 * g.R * k + 6, yb - yL + 4);
      c.restore();
    }
    // 玻璃外框與高光
    flaskPath(c, pts, x, 1.5); glassStroke(c, 1.7);
    c.beginPath();
    for (let i = 8; i < pts.length - 3; i++) { const p = pts[i]; const xx = x - p.r * 0.62; if (i === 8) c.moveTo(xx, p.y); else c.lineTo(xx, p.y); }
    c.strokeStyle = col.glassHi; c.lineWidth = Math.max(2, g.R * k * 0.07); c.lineCap = 'round'; c.globalAlpha = 0.6; c.stroke(); c.globalAlpha = 1;
    // 瓶口
    const yTop = yb - g.zTop * k;
    c.beginPath(); c.ellipse(x, yTop, g.rn * k + 3, 2.2, 0, 0, Math.PI * 2); glassStroke(c, 1.6);
    // 刻度線（繞瓶頸一圈）
    const yM = yb - g.zMark * k, rn = g.rn * k + 1.5;
    c.beginPath(); c.ellipse(x, yM, rn, 1.6, 0, 0, Math.PI);
    c.strokeStyle = col.dark ? '#f2f2f2' : '#233140'; c.lineWidth = 1.4; c.stroke();
    c.beginPath(); c.ellipse(x, yM, rn, 1.6, 0, Math.PI, Math.PI * 2);
    c.strokeStyle = LD.alpha(col.dark ? '#f2f2f2' : '#233140', 0.4); c.lineWidth = 1; c.stroke();
    // 瓶身的字
    if (g.R * k > 26) {
      c.font = '600 ' + Math.max(9, Math.min(13, g.R * k * 0.2)).toFixed(1) + 'px ' + FONT;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = LD.alpha(col.text, 0.55);
      c.fillText(P.Vf + ' mL', x, yb - g.zc * k + g.R * k * 0.15);
      c.font = Math.max(8, Math.min(11, g.R * k * 0.16)).toFixed(1) + 'px ' + FONT;
      c.fillText('20 °C  A', x, yb - g.zc * k + g.R * k * 0.38);
    }
    // 瓶塞（搖勻時與完成後）
    if ((anim && anim.kind === 'shake') || P.done || P.shaken) {
      const sw = g.rn * k + 3, sy = yTop;
      LD.roundRect(c, x - sw, sy - 10, 2 * sw, 12, 3);
      const sg = c.createLinearGradient(x - sw, 0, x + sw, 0);
      sg.addColorStop(0, LD.alpha(col.glass, 0.5)); sg.addColorStop(0.4, 'rgba(255,255,255,0.6)'); sg.addColorStop(1, LD.alpha(col.glass, 0.7));
      c.fillStyle = sg; c.fill(); glassStroke(c, 1.2);
      LD.roundRect(c, x - sw * 0.6, sy - 18, sw * 1.2, 9, 3); c.fillStyle = sg; c.fill(); glassStroke(c, 1.2);
    }
    c.restore();
    // 完成後的標籤
    if (P.done && opts.label) {
      const r = S.result(P);
      const lx = x, ly = yb - g.zc * k - g.R * k * 0.25;
      const txt = sigf(r.C, 4) + ' M';
      c.font = '700 12px ' + FONT;
      const tw = Math.max(c.measureText(txt).width, 46) + 14;
      LD.roundRect(c, lx - tw / 2, ly - 16, tw, 32, 4);
      c.fillStyle = col.dark ? '#f4f1ea' : '#fffdf6'; c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1; c.stroke();
      c.fillStyle = '#222'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(txt, lx, ly - 5);
      c.font = '600 10px ' + FONT; c.fillStyle = '#555';
      c.fillText(T('第 ', '#') + seq + T(' 瓶', ''), lx, ly + 8);
    }
    return { yMark: yM, yTop: yTop, rn: g.rn * k };
  }

  // ======================= 天平、燒杯、原液 =======================
  function drawBalance(c, x, yb, w) {
    const h = w * 0.34, top = yb - h;
    LD.contactShadow(c, x, yb + 1, w * 0.5, 0);
    LD.block(c, x - w / 2, top, w, h, col.body, { r: 6 });
    // 顯示幕
    const shown = P.mode === 'weigh' && !P.dissolved ? P.mass : 0;
    lcd(c, x - w * 0.38, top + h * 0.38, w * 0.76, h * 0.42, num(shown, 3) + ' g', Math.max(9, Math.min(13, w * 0.1)));
    // 秤盤
    const py = top - 4;
    c.beginPath(); c.ellipse(x, py, w * 0.36, 4.5, 0, 0, Math.PI * 2);
    const pg = c.createLinearGradient(x - w * 0.36, 0, x + w * 0.36, 0);
    pg.addColorStop(0, LD.shade(col.metal, 0.3)); pg.addColorStop(0.5, LD.shade(col.metal, 0.55)); pg.addColorStop(1, LD.shade(col.metal, -0.1));
    c.fillStyle = pg; c.fill(); c.strokeStyle = LD.alpha('#000', 0.25); c.lineWidth = 1; c.stroke();
    c.fillStyle = LD.shade(col.metal, -0.2); c.fillRect(x - 3, py + 3, 6, top - py - 2);
    // 秤量紙與固體
    const bw = w * 0.42;
    c.beginPath(); c.moveTo(x - bw / 2, py - 3); c.lineTo(x + bw / 2, py - 3); c.lineTo(x + bw / 2 - 5, py + 1); c.lineTo(x - bw / 2 + 5, py + 1); c.closePath();
    c.fillStyle = col.dark ? '#e9e6dc' : '#ffffff'; c.fill(); c.strokeStyle = LD.alpha(col.text, 0.25); c.stroke();
    if (shown > 0 && !(anim && anim.kind === 'dissolve')) {
      const ph = Math.min(w * 0.22, 4 + 5 * Math.cbrt(shown)), pw = Math.min(bw * 0.9, 10 + 9 * Math.cbrt(shown));
      const pc = P.solid === 'CuSO4-5H2O' ? col.crystal : col.powder;
      c.beginPath(); c.moveTo(x - pw / 2, py - 3); c.quadraticCurveTo(x, py - 3 - ph * 1.6, x + pw / 2, py - 3); c.closePath();
      const gg = c.createLinearGradient(0, py - 3 - ph, 0, py - 3);
      gg.addColorStop(0, LD.shade(pc, 0.35)); gg.addColorStop(1, LD.shade(pc, -0.15));
      c.fillStyle = gg; c.fill();
      // 晶粒閃光
      c.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 5; i++) { const u = (i * 0.37 + 0.11) % 1; c.fillRect(x - pw * 0.35 + u * pw * 0.7, py - 4 - ph * (0.2 + 0.5 * ((i * 0.61) % 1)), 1.5, 1.5); }
    }
    LD.haloText(c, T('天平', 'Balance'), x, yb + 14, col.muted, 'center', 'alphabetic', '11px ' + FONT);
  }
  function beakerGeom() {
    const rb = S.beakerR(P.Vf), Hb = 2.8 * rb;
    const k = Math.min(L.pxmm, L.bkW / (2 * rb + 8), (L.narrow ? 150 : 200) / Hb);
    return { rb: rb, Hb: Hb, k: k };
  }
  function beakerLiquid() {
    if (P.mode !== 'weigh') return { V: 0, C: 0, T: 20 };
    if (!P.beaker) return { V: S.dissolveWater(P.Vf), C: 0, T: 20 };
    const m = S.mixture(P.sp, P.beaker.n, P.beaker.mw), V = m.V * S.volFactor(P.beaker.T);
    return { V: V, C: m.V > 0 ? P.beaker.n / m.V * 1000 : 0, T: P.beaker.T };
  }
  function drawBeaker(c, x, yb) {
    const B = beakerGeom(), k = B.k, w = B.rb * k, h = B.Hb * k, top = yb - h;
    LD.contactShadow(c, x, yb + 1, w * 1.05, 0);
    const lq = beakerLiquid();
    const hl = Math.min(h - 3, lq.V * 1000 / (Math.PI * B.rb * B.rb) * k);
    // 液體
    if (hl > 0.3) {
      const yl = yb - hl;
      c.fillStyle = liqColor(P.sp, lq.C, 2 * B.rb / 10);
      c.fillRect(x - w + 1.5, yl, 2 * w - 3, hl - 1.5);
      const sh = c.createLinearGradient(x - w, 0, x + w, 0);
      sh.addColorStop(0, 'rgba(255,255,255,0.22)'); sh.addColorStop(0.35, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.14)');
      c.fillStyle = sh; c.fillRect(x - w + 1.5, yl, 2 * w - 3, hl - 1.5);
      c.beginPath(); c.ellipse(x, yl, w - 1.5, Math.min(3, w * 0.12), 0, 0, Math.PI * 2);
      c.fillStyle = LD.alpha('#ffffff', col.dark ? 0.12 : 0.3); c.fill();
    }
    // 玻璃
    c.beginPath(); c.moveTo(x - w - 3, top - 2); c.lineTo(x - w, top + 2); c.lineTo(x - w, yb - 3); c.quadraticCurveTo(x - w, yb, x - w + 3, yb);
    c.lineTo(x + w - 3, yb); c.quadraticCurveTo(x + w, yb, x + w, yb - 3); c.lineTo(x + w, top);
    glassStroke(c, 1.7);
    c.beginPath(); c.moveTo(x - w * 0.72, top + h * 0.12); c.lineTo(x - w * 0.72, yb - h * 0.12);
    c.strokeStyle = col.glassHi; c.lineWidth = Math.max(2, w * 0.09); c.globalAlpha = 0.5; c.stroke(); c.globalAlpha = 1;
    // 刻度
    c.strokeStyle = LD.alpha(col.text, 0.35); c.lineWidth = 1;
    for (let i = 1; i <= 4; i++) { const yy = yb - h * 0.2 * i; c.beginPath(); c.moveTo(x + w * 0.35, yy); c.lineTo(x + w * 0.75, yy); c.stroke(); }
    // 玻棒
    c.beginPath(); c.moveTo(x - w * 0.35, yb - 3); c.lineTo(x + w * 0.55, top - h * 0.18);
    c.strokeStyle = LD.alpha(col.glass, 0.9); c.lineWidth = 2.6; c.stroke();
    c.strokeStyle = col.glassHi; c.lineWidth = 1; c.stroke();
    // 溫度計讀數
    if (P.mode === 'weigh' && P.beaker) {
      lcd(c, x - 26, top - 24, 52, 16, num(lq.T, 1) + ' °C', 10.5);
      c.strokeStyle = LD.alpha(col.metal, 0.9); c.lineWidth = 2;
      c.beginPath(); c.moveTo(x - w * 0.1, top - 8); c.lineTo(x - w * 0.1, yb - Math.max(6, hl * 0.5)); c.stroke();
    }
    LD.haloText(c, T('燒杯', 'Beaker'), x, yb + 14, col.muted, 'center', 'alphabetic', '11px ' + FONT);
    return { top: top, w: w };
  }
  function drawStock(c, x, yb) {
    const st = P.stock, w = L.narrow ? L.bkW * 0.5 : Math.min(42, L.bkW * 0.42), h = w * 2.1, top = yb - h;
    LD.contactShadow(c, x, yb + 1, w * 1.05, 0);
    c.save();
    LD.roundRect(c, x - w, top, 2 * w, h, 8); c.clip();
    c.fillStyle = liqColor(st.sp, st.c, 2 * w / L.pxmm / 10, 0.9);
    c.fillRect(x - w, top + h * 0.22, 2 * w, h);
    c.restore();
    LD.roundRect(c, x - w, top, 2 * w, h, 8); glassStroke(c, 1.6);
    LD.roundRect(c, x - w * 0.45, top - 10, w * 0.9, 12, 3); c.fillStyle = col.dark ? '#5a5f66' : '#3b4048'; c.fill();
    // 標籤
    LD.roundRect(c, x - w * 0.85, top + h * 0.38, w * 1.7, h * 0.36, 3);
    c.fillStyle = col.dark ? '#f4f1ea' : '#fffdf6'; c.fill(); c.strokeStyle = 'rgba(0,0,0,0.2)'; c.stroke();
    c.fillStyle = '#222'; c.font = '700 ' + Math.max(9, Math.min(12, w * 0.32)).toFixed(1) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(sciPlain(st.c) + ' M', x, top + h * 0.48);
    formula(c, st.sp, x, top + h * 0.66, '#222', Math.max(9, Math.min(11, w * 0.3)), 'center');
    LD.haloText(c, state.stock === 'last' ? T('上一瓶', 'Last flask') : T('原液', 'Stock'), x, yb + 14, col.muted, 'center', 'alphabetic', '11px ' + FONT);
    return { top: top, w: w };
  }
  function sciPlain(x) { const p = sciParts(x, 3); return p.e == null ? p.m : p.m + 'e' + p.e; }
  function drawPipette(c, x, yb, fill) {
    const len = L.narrow ? 150 : 190, top = yb - len, tw = 3.2;
    c.save();
    // 液體
    if (fill > 0) {
      c.fillStyle = liqColor(P.stock.sp, P.stock.c, 0.6, 0.95);
      const yl = yb - len * 0.62 * fill;
      c.fillRect(x - tw + 1, yl, 2 * tw - 2, yb - yl);
      if (fill > 0.5) { c.beginPath(); c.ellipse(x, yb - len * 0.4, 7, 16, 0, 0, Math.PI * 2); c.fill(); }
    }
    // 玻璃管＋球
    c.beginPath();
    c.moveTo(x - 1, yb); c.lineTo(x - tw, yb - 12); c.lineTo(x - tw, yb - len * 0.4 + 15);
    c.bezierCurveTo(x - 10, yb - len * 0.4 + 10, x - 10, yb - len * 0.4 - 10, x - tw, yb - len * 0.4 - 15);
    c.lineTo(x - tw, top);
    c.moveTo(x + 1, yb); c.lineTo(x + tw, yb - 12); c.lineTo(x + tw, yb - len * 0.4 + 15);
    c.bezierCurveTo(x + 10, yb - len * 0.4 + 10, x + 10, yb - len * 0.4 - 10, x + tw, yb - len * 0.4 - 15);
    c.lineTo(x + tw, top);
    glassStroke(c, 1.3);
    // 吸量管的刻度線
    c.beginPath(); c.moveTo(x - tw - 2, yb - len * 0.62); c.lineTo(x + tw + 2, yb - len * 0.62); c.strokeStyle = col.text; c.lineWidth = 1; c.stroke();
    // 安全吸球
    c.beginPath(); c.ellipse(x, top - 9, 8, 11, 0, 0, Math.PI * 2);
    const bg = c.createRadialGradient(x - 3, top - 13, 1, x, top - 9, 12);
    bg.addColorStop(0, '#f07a6a'); bg.addColorStop(1, '#a8322a');
    c.fillStyle = bg; c.fill();
    c.restore();
  }

  // ======================= 放大鏡（眼睛看到的刻度線） =======================
  function drawInset(c) {
    const I = L.inset, g = P.g, th = eye() * Math.PI / 180;
    const cx = I.x + I.w / 2, cy = I.y + I.h * 0.55;
    const q = Math.min((I.w - 30) / (2 * g.rn + 4), (I.h - 40) / 13);
    c.save();
    LD.roundRect(c, I.x, I.y, I.w, I.h, 12);
    c.fillStyle = LD.alpha(col.bg, 0.96); c.fill();
    c.strokeStyle = LD.alpha(col.accent, 0.55); c.lineWidth = 1.5; c.stroke();
    LD.roundRect(c, I.x, I.y, I.w, I.h, 12); c.clip();
    const lv = S.level(P), h = lv.h;                     // 實際液面相對刻度線 mm
    const sin = Math.sin(th), cos = Math.cos(th);
    // 投影：畫面 y（往上為正）= (z − 刻度線)·cosθ + 深度·sinθ（深度：由瓶頸前緣算起）
    const Y = function (zrel, depth) { return cy - (zrel * cos + depth * sin) * q; };
    const xl = cx - g.rn * q, xr = cx + g.rn * q;
    const inNeck = lv.z > g.zt - 0.5;
    // 液體
    if (P.flask.mw > 0 && lv.z > g.zMark - 12 / Math.max(0.3, cos)) {
      const fc = flaskConc();
      const yBot = Y(h, g.rn), yEdge = Y(h + 1.0, g.rn);
      c.beginPath();
      c.moveTo(xl, I.y + I.h + 5); c.lineTo(xl, yEdge);
      c.quadraticCurveTo(cx, yBot + (yBot - yEdge), xr, yEdge);
      c.lineTo(xr, I.y + I.h + 5); c.closePath();
      c.fillStyle = liqColor(P.sp, P.shaken ? fc.C : fc.C * 0.35, 2 * g.rn / 10, 0.9);
      c.fill();
      if (Math.abs(sin) > 0.03) {   // 斜看時看得到液面（橢圓）
        c.beginPath(); c.ellipse(cx, Y(h + 0.7, g.rn), g.rn * q, Math.abs(g.rn * sin * q), 0, 0, Math.PI * 2);
        c.fillStyle = LD.alpha('#ffffff', sin > 0 ? 0.22 : 0.12); c.fill();
      }
      // 彎月面的最低點（深色的弧）
      c.beginPath(); c.moveTo(xl, yEdge); c.quadraticCurveTo(cx, yBot + (yBot - yEdge), xr, yEdge);
      c.strokeStyle = col.dark ? 'rgba(10,25,40,0.9)' : 'rgba(20,40,60,0.85)'; c.lineWidth = 2.4; c.stroke();
    } else if (!inNeck) {
      c.font = '12px ' + FONT; c.fillStyle = col.muted; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(T('液面還在下面', 'The liquid is still below'), cx, I.y + I.h - 44);
    }
    // 瓶頸玻璃壁
    [xl, xr].forEach(function (xx, i) {
      const gw = c.createLinearGradient(xx - 4, 0, xx + 4, 0);
      gw.addColorStop(0, LD.alpha(col.glass, i ? 0.25 : 0.55)); gw.addColorStop(1, LD.alpha(col.glass, i ? 0.55 : 0.25));
      c.fillStyle = gw; c.fillRect(xx - (i ? 0 : 5), I.y, 5, I.h);
    });
    c.fillStyle = col.glassHi; c.globalAlpha = 0.35; c.fillRect(xl + 4, I.y, 3, I.h); c.globalAlpha = 1;
    // 刻度線：環（前半粗、後半細）
    const yC = Y(0, g.rn), b = Math.abs(g.rn * sin * q);
    c.strokeStyle = col.dark ? '#ffffff' : '#111a24';
    if (b > 0.6) {
      c.beginPath(); c.ellipse(cx, yC, g.rn * q, b, 0, sin > 0 ? Math.PI : 0, sin > 0 ? Math.PI * 2 : Math.PI); c.lineWidth = 1; c.globalAlpha = 0.45; c.stroke(); c.globalAlpha = 1;
      c.beginPath(); c.ellipse(cx, yC, g.rn * q, b, 0, sin > 0 ? 0 : Math.PI, sin > 0 ? Math.PI : Math.PI * 2); c.lineWidth = 2; c.stroke();
    } else { c.beginPath(); c.moveTo(xl, yC); c.lineTo(xr, yC); c.lineWidth = 2; c.stroke(); }
    // 眼睛看到的「對齊線」：從環的前緣水平延伸（參考用的細虛線）
    const yF = Y(0, 0);
    c.setLineDash([3, 4]); c.strokeStyle = LD.alpha(col.accent, 0.8); c.lineWidth = 1;
    c.beginPath(); c.moveTo(I.x + 6, yF); c.lineTo(xl - 6, yF); c.moveTo(xr + 6, yF); c.lineTo(I.x + I.w - 6, yF); c.stroke();
    c.setLineDash([]);
    c.restore();
    // 標題與眼睛
    LD.pill(c, T('眼睛看到的刻度線', 'The mark as your eye sees it'), I.x + I.w / 2, I.y + 22, col.accent, 'center', '600 11.5px ' + FONT);
    const deg = eye();
    const eyeTxt = Math.abs(deg) < 0.5 ? T('平視', 'eye level') : deg > 0 ? T('俯視 ', 'looking down ') + num(deg, 0) + '°' : T('仰視 ', 'looking up ') + num(-deg, 0) + '°';
    LD.pill(c, eyeTxt, I.x + I.w / 2, I.y + I.h - 6, Math.abs(deg) < 0.5 ? col.probe : col.pos, 'center', '600 11px ' + FONT);
  }
  /** 主畫面：眼睛與視線（示意：眼睛畫在刻度線旁，視線穿過刻度線的前緣） */
  function drawEye(c, fx, yM, rn) {
    const th = eye() * Math.PI / 180, D = L.narrow ? 46 : 70;
    const ex = fx + rn + D, ey = yM - D * Math.tan(th);
    c.setLineDash([4, 4]);
    c.strokeStyle = LD.alpha(col.accent, 0.75); c.lineWidth = 1.2;
    // 視線由眼睛往量瓶畫，斜率 tanθ（俯視時往下），穿過刻度線的前緣
    const x2 = fx - rn * 1.4;
    c.beginPath(); c.moveTo(ex - 9, ey + 9 * Math.tan(th)); c.lineTo(x2, ey + (ex - x2) * Math.tan(th)); c.stroke();
    c.setLineDash([]);
    // 眼睛
    c.save(); c.translate(ex, ey); c.rotate(-th);
    c.beginPath(); c.moveTo(-9, 0); c.quadraticCurveTo(0, -8, 9, 0); c.quadraticCurveTo(0, 8, -9, 0);
    c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = col.text; c.lineWidth = 1.2; c.stroke();
    c.beginPath(); c.arc(-2, 0, 3.4, 0, Math.PI * 2); c.fillStyle = '#2b4f7a'; c.fill();
    c.beginPath(); c.arc(-2, 0, 1.5, 0, Math.PI * 2); c.fillStyle = '#000'; c.fill();
    c.restore();
  }

  // ======================= 主畫面 =======================
  function animU() { if (!anim) return 1; return Math.min(1, (performance.now() - anim.t0) / anim.dur); }
  function draw() {
    if (!cw) return;
    layout();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(ctx, cw, ch);
    if (state.mode === 'convert') { drawConvert(ctx); return; }
    // 實驗桌
    const yb = L.bench;
    const tg = ctx.createLinearGradient(0, yb, 0, ch);
    tg.addColorStop(0, col.bench); tg.addColorStop(1, LD.shade(col.bench, -0.12));
    ctx.fillStyle = tg; ctx.fillRect(0, yb, cw, ch - yb);
    ctx.fillStyle = col.benchEdge; ctx.fillRect(0, yb, cw, 1.5);
    let src = null;
    if (P.mode === 'weigh') {
      drawBalance(ctx, L.balX, yb, L.balW);
      src = drawBeaker(ctx, L.bkX, yb);
    } else {
      src = drawStock(ctx, L.bkX, yb);
      const pu = anim && anim.kind === 'pipette' ? animU() : -1;
      if (pu < 0) drawPipette(ctx, L.balX, yb - 4, 0);
    }
    const fl = drawFlask(ctx, L.fx, yb, L.pxmm, { label: true });
    drawEye(ctx, L.fx, fl.yMark, fl.rn);
    drawAnim(ctx, src, fl);
    drawInset(ctx);
    // 量瓶的溫度
    if (P.flask.mw > 0 && Math.abs(P.flask.T - 20) > 0.05) LD.pill(ctx, num(P.flask.T, 1) + ' °C', L.fx, yb - 6, P.flask.T > 20 ? col.pos : col.neg, 'center', '600 11px ' + FONT);
  }
  function drawAnim(c, src, fl) {
    if (!anim) return;
    const u = animU(), yb = L.bench;
    const lc = liqColor(P.sp, Math.max(0.05, flaskConc().C), 0.5, 0.9);
    if (anim.kind === 'pour' && src) {
      // 燒杯沿玻棒倒入量瓶（示意）
      const x0 = L.bkX + src.w, y0 = src.top, x1 = L.fx, y1 = fl.yTop - 4;
      c.strokeStyle = lc; c.lineWidth = 3; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - 40, x1, y1 + 30 * u); c.globalAlpha = Math.sin(u * Math.PI); c.stroke(); c.globalAlpha = 1;
    } else if (anim.kind === 'water' || anim.kind === 'squirt') {
      const x0 = L.fx + (L.narrow ? 40 : 60), y0 = fl.yTop - 46;
      c.strokeStyle = col.water.replace(/[\d.]+\)$/, '0.9)'); c.lineWidth = anim.kind === 'water' ? 4 : 2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(L.fx + 10, y0 - 12, L.fx, fl.yTop + 20 * u); c.globalAlpha = Math.sin(u * Math.PI); c.stroke(); c.globalAlpha = 1;
      LD.block(c, x0 - 4, y0 - 4, 26, 34, col.dark ? '#6b7a86' : '#dfe8ee', { r: 6 });
    } else if (anim.kind === 'drop') {
      const y0 = fl.yTop - 40, y1 = fl.yMark;
      // 滴管
      c.fillStyle = LD.alpha(col.glass, 0.5); c.fillRect(L.fx - 2.5, y0 - 34, 5, 32);
      c.beginPath(); c.ellipse(L.fx, y0 - 40, 6, 9, 0, 0, Math.PI * 2); c.fillStyle = '#c94a3a'; c.fill();
      const yy = y0 + (y1 - y0) * u * u;
      c.beginPath(); c.arc(L.fx, yy, 2.4, 0, Math.PI * 2); c.fillStyle = 'rgba(160,210,240,0.95)'; c.fill();
    } else if (anim.kind === 'pipette') {
      const fill = 1 - u;
      drawPipette(c, L.fx, fl.yTop + 30, fill);
    } else if (anim.kind === 'dissolve') {
      // 固體落進燒杯
      const x0 = L.balX, y0 = yb - L.balW * 0.34 - 8, x1 = L.bkX, y1 = src.top + 10;
      c.fillStyle = P.solid === 'CuSO4-5H2O' ? col.crystal : col.powder;
      for (let i = 0; i < 8; i++) {
        const v = Math.max(0, Math.min(1, u * 1.4 - i * 0.05));
        const xx = x0 + (x1 - x0) * v + (i - 4) * 1.5, yy = y0 + (y1 - y0) * v - 30 * Math.sin(v * Math.PI);
        c.beginPath(); c.arc(xx, yy, 2, 0, Math.PI * 2); c.fill();
      }
    } else if (anim.kind === 'draw') {
      c.fillStyle = LD.alpha(col.glass, 0.5); c.fillRect(L.fx - 2.5, fl.yMark - 70, 5, 66);
      c.beginPath(); c.ellipse(L.fx, fl.yMark - 76, 6, 9, 0, 0, Math.PI * 2); c.fillStyle = '#c94a3a'; c.fill();
    }
  }

  // ======================= 濃度換算的畫面 =======================
  function convState() {
    const w = val(el.wt) / 100, p = S.props(state.sp, w), mass = p.rho * 1000, ms = mass * w;
    return { w: w, p: p, mass: mass, ms: ms, mw: mass - ms, n: ms / S.SPECIES[state.sp].M };
  }
  function drawConvert(c) {
    const s = convState(), W = cw, H = ch, narrow = L.narrow;
    const yb = H - 30;
    c.fillStyle = col.bench; c.fillRect(0, yb, W, H - yb);
    c.fillStyle = col.benchEdge; c.fillRect(0, yb, W, 1.5);
    // 左：1.000 L 溶液在天平上
    const g = S.geom(500);                     // 畫 1 L 的瓶子：用 500 mL 量瓶的形狀（示意）
    const balW = Math.min(W * 0.36, 170), balH = balW * 0.34;
    const fx = narrow ? W * 0.3 : W * 0.2;
    const topRoom = narrow ? 330 : 70;          // 窄螢幕上半部留給文字
    const kk = Math.min((narrow ? 0.5 : 0.3) * W / (2 * g.R), (yb - balH - 6 - topRoom) / (g.zTop * 0.92));
    drawBalanceOnly(c, fx, yb, balW, num(s.mass, 1) + ' g');
    const fb = yb - balW * 0.34 - 6;
    const pts = flaskPoints(g, fx, fb, kk * 0.92);
    c.save(); flaskPath(c, pts, fx, 0); c.clip();
    const yL = fb - g.zMark * kk * 0.92;
    const gl = c.createLinearGradient(fx - g.R * kk, 0, fx + g.R * kk, 0);
    gl.addColorStop(0, liqColor(state.sp, s.p.C, 4)); gl.addColorStop(0.5, liqColor(state.sp, s.p.C, 10)); gl.addColorStop(1, liqColor(state.sp, s.p.C, 4));
    c.fillStyle = gl; c.fillRect(fx - g.R * kk * 2, yL, g.R * kk * 4, fb - yL + 2);
    c.restore();
    flaskPath(c, pts, fx, 1.5); glassStroke(c, 1.7);
    const yM = fb - g.zMark * kk * 0.92;
    c.beginPath(); c.moveTo(fx - g.rn * kk - 3, yM); c.lineTo(fx + g.rn * kk + 3, yM); c.strokeStyle = col.text; c.lineWidth = 1.4; c.stroke();
    const yTopF = fb - g.zTop * kk * 0.92, lx = narrow ? Math.min(W - 80, fx + g.R * kk + 8) : fx, la = narrow ? 'left' : 'center';
    LD.pill(c, T('1.000 L 溶液（20 °C）', '1.000 L of solution (20 °C)'), lx, narrow ? yTopF + 40 : yTopF - 34, col.accent, la, '600 12px ' + FONT);
    // 右：質量長條＋算式
    const x0 = narrow ? 12 : W * 0.42, x1 = W - 14, bw = x1 - x0;
    const y0 = narrow ? 18 : 36;
    LD.haloText(c, T('這 1 L 溶液的組成', 'What is in this 1 L'), x0, y0, col.text, 'left', 'alphabetic', '700 13px ' + FONT);
    const by = y0 + 12, bh = 26, fS = s.ms / s.mass;
    LD.block(c, x0, by, bw, bh, col.dark ? '#5d7f97' : '#bcd9ec', { r: 5 });
    if (fS > 0) LD.block(c, x0, by, Math.max(3, bw * fS), bh, state.sp === 'CuSO4' ? '#2f7fd8' : (col.dark ? '#d7c9a6' : '#e6d6ae'), { r: 5 });
    const lab1 = T('溶質 ', 'solute ') + num(s.ms, 1) + ' g', lab2 = T('水 ', 'water ') + num(s.mw, 1) + ' g';
    LD.haloText(c, lab1, x0, by + bh + 16, col.text, 'left', 'alphabetic', '600 12px ' + FONT);
    LD.haloText(c, lab2, x1, by + bh + 16, col.text, 'right', 'alphabetic', '600 12px ' + FONT);
    const rows = [
      [T('莫耳數', 'Moles'), 'n = ' + num(s.ms, 1) + ' ÷ ' + num(S.SPECIES[state.sp].M, 2) + ' = ' + sigf(s.n, 4) + ' mol'],
      [T('體積莫耳濃度', 'Molarity'), sigf(s.n, 4) + ' mol ÷ 1.000 L = ' + sigf(s.p.C, 4) + ' M'],
      [T('重量莫耳濃度', 'Molality'), sigf(s.n, 4) + ' mol ÷ ' + num(s.mw / 1000, 4) + ' kg = ' + sigf(s.p.m, 4) + ' mol/kg'],
      [T('重量百分率', 'Mass %'), num(s.ms, 1) + ' ÷ ' + num(s.mass, 1) + ' × 100% = ' + num(s.w * 100, 2) + '%'],
      [T('莫耳分率', 'Mole fraction'), sigf(s.p.x, 3)],
      ['ppm', sciPlain(s.p.ppm) + (s.p.ppmCu != null ? T('（含銅 ', ' (Cu ') + sciPlain(s.p.ppmCu) + T('）', ')') : '')]
    ];
    let yy = by + bh + 44;
    const lh = narrow ? 34 : 30;
    rows.forEach(function (r, i) {
      if (narrow && yy > yb - 210 + i * 0) { /* 窄螢幕下半部給量瓶 */ }
      LD.haloText(c, r[0], x0, yy, col.muted, 'left', 'alphabetic', '12px ' + FONT);
      LD.haloText(c, r[1], narrow ? x0 : x0 + Math.min(110, bw * 0.3), narrow ? yy + 15 : yy, col.text, 'left', 'alphabetic', '600 12.5px ' + FONT);
      yy += lh;
    });
    // 密度
    LD.pill(c, T('密度 ', 'density ') + num(s.p.rho, 4) + ' g/mL', lx, narrow ? yTopF + 66 : yTopF - 8, col.text, la, '600 12px ' + FONT);
    if (s.w * 100 >= S.SPECIES[state.sp].sat - 0.05) LD.pill(c, T('20 °C 飽和', 'saturated at 20 °C'), lx, narrow ? yTopF + 92 : yM + 30, col.pos, la, '600 12px ' + FONT);
  }
  function drawBalanceOnly(c, x, yb, w, text) {
    const h = w * 0.34, top = yb - h;
    LD.contactShadow(c, x, yb + 1, w * 0.5, 0);
    LD.block(c, x - w / 2, top, w, h, col.body, { r: 6 });
    lcd(c, x - w * 0.38, top + h * 0.36, w * 0.76, h * 0.44, text, Math.max(10, Math.min(14, w * 0.09)));
    c.beginPath(); c.ellipse(x, top - 3, w * 0.4, 4, 0, 0, Math.PI * 2); c.fillStyle = LD.shade(col.metal, 0.4); c.fill();
  }

  // ======================= 讀數 =======================
  function dl(rows) { return rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd' + (r[2] ? ' class="' + r[2] + '"' : '') + '>' + r[1] + '</dd>'; }).join(''); }
  function levelText() {
    const lv = S.level(P);
    if (!(P.flask.mw > 0)) return T('空的', 'empty');
    if (lv.z < P.g.zt) return T('還在瓶身', 'still in the bulb');
    const a = S.apparent(P, eye());
    const drop = S.DROP * 1000 / (Math.PI * P.g.rn * P.g.rn);
    if (Math.abs(a) <= drop * 0.5) return T('對齊刻度線', 'level with the mark');
    return a < 0 ? T('刻度線下方 ', 'below the mark by ') + num(-a, 1) + ' mm' : T('刻度線上方 ', 'above the mark by ') + num(a, 1) + ' mm';
  }
  function updateReadouts() {
    const out = $('readout');
    if (state.mode === 'convert') {
      const s = convState(), p = s.p;
      out.innerHTML = dl([
        [T('溶質', 'Solute'), fH(state.sp)],
        [T('重量百分率', 'Mass percentage'), num(s.w * 100, 2) + '%', 'big'],
        [T('密度（20 °C）', 'Density (20 °C)'), num(p.rho, 4) + ' g/mL'],
        [T('體積莫耳濃度', 'Molarity'), sigf(p.C, 4) + ' M', 'big'],
        [T('重量莫耳濃度', 'Molality'), sigf(p.m, 4) + ' mol/kg', 'big'],
        [T('莫耳分率', 'Mole fraction'), sigf(p.x, 3)],
        ['ppm' + T('（溶質）', ' (solute)'), sciHTML(p.ppm, 3)],
        p.ppmCu != null ? ['ppm' + T('（銅）', ' (copper)'), sciHTML(p.ppmCu, 3)] : [T('每公升溶質', 'Solute per litre'), num(p.gL, 1) + ' g/L']
      ]);
      return;
    }
    const rows = [];
    if (P.mode === 'weigh') {
      const Sd = S.SOLIDS[P.solid];
      rows.push([T('固體', 'Solid'), fH(FORMULA[P.solid])]);
      rows.push([T('莫耳質量', 'Molar mass'), num(Sd.M, 2) + ' g/mol']);
      rows.push([T('天平上的質量', 'Mass on the balance'), num(P.mass, 3) + ' g']);
      if (P.beaker) rows.push([T('燒杯溫度', 'Beaker temperature'), num(P.beaker.T, 1) + ' °C', Math.abs(P.beaker.T - 20) > 0.5 ? 'bad' : '']);
    } else {
      rows.push([T('原液', 'Stock'), sciHTML(P.stock.c, 3) + ' M ' + fH(P.stock.sp)]);
      rows.push([T('已吸取放入', 'Pipetted in so far'), num(P.nIn / P.stock.c * 1000, 2) + ' mL']);
    }
    rows.push([T('量瓶', 'Flask'), P.Vf + ' mL']);
    if (P.flask.mw > 0) rows.push([T('量瓶裡的溫度', 'Temperature in the flask'), num(P.flask.T, 1) + ' °C', Math.abs(P.flask.T - 20) > 0.5 ? 'bad' : '']);
    rows.push([T('液面（你看到的）', 'Meniscus (as you see it)'), levelText(), 'big']);
    rows.push([T('目標濃度', 'Target'), sciHTML(P.target, 3) + ' M']);
    rows.push([T('狀態', 'State'), P.done ? T('已完成', 'done') : P.shaken ? T('已搖勻', 'mixed') : P.everShaken ? T('補水後還沒搖勻', 'not mixed since adding water') : T('還沒搖勻', 'not mixed yet')]);
    out.innerHTML = dl(rows);
  }
  function infoLines() {
    const Sd = S.SOLIDS[state.solid];
    $('solidInfo').innerHTML = solidName(state.solid) + '，' .replace('，', T('，', ', ')) + T('莫耳質量 ', 'molar mass ') + num(Sd.M, 2) + ' g/mol' +
      (state.solid === 'CuSO4' ? T('（白色粉末，溶於水才變藍）', ' (a white powder that turns blue in water)') : '') +
      T('。溶解用的水：', '. Water for dissolving: ') + num(S.dissolveWater(state.Vf), 0) + ' mL';
    const st = stockObj();
    $('stockInfo').innerHTML = (state.stock === 'last' ? T('上一瓶：', 'Last flask: ') : '') + sciHTML(st.c, 4) + ' M ' + fH(st.sp) +
      T('。吸量管一次最多 50 mL，可以吸好幾次。', '. Up to 50 mL per fill; you may pipette several times.');
    const sat = S.SPECIES[state.sp].sat;
    $('convInfo').innerHTML = T('20 °C 時 ', 'At 20 °C ') + fH(state.sp) + T(' 的溶解度約 ', ' dissolves up to about ') + num(sat, 1) + '%' +
      (state.sp === 'NaOH' ? T('（密度表只到 50%）', ' (density table to 50%)') : '') + T('；滑桿的上限就是飽和。', '; the end of the slider is saturation.');
  }

  // ======================= 按鈕狀態 =======================
  function updateButtons() {
    const weigh = P.mode === 'weigh', conv = state.mode === 'convert';
    $('stepBar').hidden = conv; $('bNew').hidden = conv;
    $('stageHint').hidden = conv;
    ['bDissolve', 'bCool', 'bTransfer', 'bRinse'].forEach(function (id) { $(id).hidden = !weigh; });
    $('bPipette').hidden = weigh;
    const d = P.done;
    const set = function (id, on, go) { $(id).disabled = !on; $(id).classList.toggle('go', !!(on && go)); };
    const lv = S.level(P), hot = (P.beaker && Math.abs(P.beaker.T - 20) > 0.05) || (P.flask.mw > 0 && Math.abs(P.flask.T - 20) > 0.05);
    const app = P.flask.mw > 0 ? S.apparent(P, eye()) : -99;
    set('bDissolve', weigh && !d && !P.dissolved, true);
    set('bCool', !d && hot, false);
    set('bTransfer', weigh && !d && P.dissolved && !P.transferred && !P.everShaken, P.dissolved && !P.transferred);
    set('bRinse', weigh && !d && P.transferred && !P.everShaken, P.transferred && P.rinses < 2);
    set('bPipette', !weigh && !d && !P.everShaken, P.pip === 0);
    const ready = weigh ? P.transferred : P.pip > 0;
    set('bPour', !d && lv.z < P.g.zMark - S.NECK_GAP - 0.05, ready && !P.everShaken);
    set('bSquirt', !d && (S.Vnow(P) + S.SQUIRT) * 1000 < P.g.Vtop - 1, false);
    set('bDrop', !d && (S.Vnow(P) + S.DROP) * 1000 < P.g.Vtop - 1, ready && lv.z >= P.g.zMark - S.NECK_GAP - 0.1 && app < 0 && !P.everShaken);
    set('bDraw', !d && app > 0, false);
    set('bShake', !d && P.flask.n > 0 && !P.shaken, ready && Math.abs(app) < 0.6);
    set('bDone', !d && P.shaken, true);
    document.querySelector('#stockSeg [data-stock="last"]').disabled = !last;
  }

  // ======================= 操作 =======================
  function startAnim(kind, dur) {
    if (reducedMotion) { anim = null; draw(); return; }
    anim = { kind: kind, t0: performance.now(), dur: dur };
    startLoop();
  }
  let raf = 0;
  function startLoop() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop() {
    raf = 0;
    if (anim && animU() >= 1) anim = null;
    draw();
    if (view3 && view3.active) view3.update();
    if (anim) raf = requestAnimationFrame(loop);
  }
  function refresh() {
    updateButtons();
    updateReadouts();
    draw();
    if (view3 && view3.active) view3.update();
  }
  const FAIL = {
    nomass: function () { return T('天平上還沒有固體：先把質量調大於 0。', 'There is nothing on the balance yet: set a mass above 0.'); },
    sat: function (r) { return T('燒杯裡 ' + num(S.dissolveWater(P.Vf), 0) + ' mL 的水在 20 °C 最多只能溶 ' + num(r.maxMass, 2) + ' g，溶不完。請減少質量或換大一點的量瓶。',
      'The ' + num(S.dissolveWater(P.Vf), 0) + ' mL of water in the beaker can dissolve at most ' + num(r.maxMass, 2) + ' g at 20 °C. Use less solid or a bigger flask.'); },
    overflow: function () { return T('再加就會從量瓶滿出來了！', 'Any more and the flask would overflow!'); },
    high: function () { return T('液面已經到瓶頸了，改用洗瓶或滴管慢慢加。', 'The liquid is already in the neck: use the wash bottle or the dropper.'); },
    low: function () { return T('液面看起來沒有超過刻度線，不需要吸出。', 'The meniscus does not look above the mark; nothing to draw off.'); },
    empty: function () { return T('量瓶裡還沒有溶質。', 'There is no solute in the flask yet.'); }
  };
  function failed(r) { setStatus((FAIL[r.why] ? FAIL[r.why](r) : T('現在不能這樣做。', 'You cannot do that now.'))); if (snd()) window.LabSound.tone({ freq: 300, dur: 0.12, gain: 0.05, type: 'triangle' }); }
  function crossCheck() {
    if (!(P.flask.mw > 0)) return;
    const a = S.apparent(P, eye());
    const half = 0.5 * S.DROP * 1000 / (Math.PI * P.g.rn * P.g.rn);
    if (lastApp != null && lastApp <= half && a > half && !P.everShaken) {
      setStatus(T('加過頭了：液面看起來已經超過刻度線。', 'Overshot: the meniscus now looks above the mark.'));
      if (snd()) window.LabSound.sweep({ from: 440, to: 280, dur: 0.3, gain: 0.07, type: 'triangle' });
    }
    lastApp = a;
  }
  function doStep(id) {
    acted();
    if (P.done) return;
    let r;
    if (id === 'bDissolve') {
      r = S.dissolve(P);
      if (!r.ok) return failed(r);
      const dT = r.dT;
      setStatus(T('固體溶解了。', 'The solid has dissolved. ') + (Math.abs(dT) < 0.5 ? T('溫度幾乎沒變。', 'The temperature hardly changed.') :
        dT > 0 ? T('溶解放熱，燒杯變熱了（' + num(P.beaker.T, 1) + ' °C）。', 'Dissolving is exothermic: the beaker is now warm (' + num(P.beaker.T, 1) + ' °C).')
          : T('溶解吸熱，燒杯變涼了（' + num(P.beaker.T, 1) + ' °C）。', 'Dissolving is endothermic: the beaker is now cooler (' + num(P.beaker.T, 1) + ' °C).')));
      if (snd()) { window.LabSound.noise({ dur: 0.5, gain: 0.08, filter: 2200, q: 1.1 }); if (Math.abs(dT) > 1) window.LabSound.sweep({ from: dT > 0 ? 420 : 760, to: dT > 0 ? 760 : 420, dur: 0.5, gain: 0.05, type: 'sine', delay: 0.3 }); }
      startAnim('dissolve', 900);
    } else if (id === 'bCool') {
      r = S.cool(P);
      if (!r.ok) return failed(r);
      setStatus(T('等了一會兒，溶液回到 20 °C。', 'After a while the solution is back at 20 °C.'));
      if (snd()) window.LabSound.sweep({ from: 600, to: 420, dur: 0.4, gain: 0.05, type: 'sine' });
    } else if (id === 'bTransfer') {
      r = S.transfer(P);
      if (!r.ok) return failed(r);
      setStatus(T('沿玻棒倒進量瓶。燒杯壁和玻棒上還沾著一些溶液……', 'Poured into the flask down the glass rod. Some solution is still clinging to the beaker and the rod…'));
      if (snd()) window.LabSound.noise({ dur: 0.7, gain: 0.07, filter: 900, q: 0.8 });
      startAnim('pour', 900);
    } else if (id === 'bRinse') {
      r = S.rinse(P);
      if (!r.ok) return failed(r);
      setStatus(T('用 ' + num(S.rinseWater(P.Vf), 0) + ' mL 蒸餾水洗燒杯與玻棒，洗液也倒進量瓶（第 ' + P.rinses + ' 次）。', 'Rinsed the beaker and rod with ' + num(S.rinseWater(P.Vf), 0) + ' mL of distilled water and added the rinsings to the flask (rinse ' + P.rinses + ').'));
      if (snd()) window.LabSound.noise({ dur: 0.5, gain: 0.06, filter: 1300, q: 0.9 });
      startAnim('pour', 700);
    } else if (id === 'bPipette') {
      const V1 = Math.round(val(el.V1) * 100) / 100;
      r = S.pipette(P, V1, el.pipRinse.checked);
      if (!r.ok) return failed(r);
      setStatus(T('吸取 ' + num(V1, 2) + ' mL 原液放進量瓶。', 'Pipetted ' + num(V1, 2) + ' mL of stock into the flask.') +
        (r.vw > 0 ? T('吸量管裡原本有水，吸上來的原液被稀釋了一點。', ' The pipette was wet with water, which diluted the stock a little.') : ''));
      if (snd()) window.LabSound.sweep({ from: 380, to: 700, dur: 0.5, gain: 0.05, type: 'sine' });
      startAnim('pipette', 1100);
    } else if (id === 'bPour') {
      r = S.pourToNeck(P, eye());
      if (!r.ok) return failed(r);
      setStatus(T('加水到瓶頸，離刻度線還有約 ' + S.NECK_GAP + ' mm。', 'Filled up into the neck, about ' + S.NECK_GAP + ' mm below the mark.'));
      if (snd()) window.LabSound.noise({ dur: 0.8, gain: 0.07, filter: 800, q: 0.7 });
      startAnim('water', 900);
    } else if (id === 'bSquirt' || id === 'bDrop') {
      const mL = id === 'bDrop' ? S.DROP : S.SQUIRT;
      r = S.addWater(P, mL, eye());
      if (!r.ok) return failed(r);
      setStatus(P.everShaken ? T('搖勻後又加了水。', 'Water added after inverting.') : '');
      if (snd()) {
        const h = S.level(P).h;
        window.LabSound.tone({ freq: Math.max(320, Math.min(1500, 700 + 18 * h)), dur: 0.07, gain: 0.07, type: 'sine' });
      }
      startAnim(id === 'bDrop' ? 'drop' : 'squirt', id === 'bDrop' ? 380 : 450);
      crossCheck();
    } else if (id === 'bDraw') {
      r = S.drawOut(P, eye());
      if (!r.ok) return failed(r);
      setStatus(T('用滴管吸出 ' + num(r.mL, 2) + ' mL，液面看起來回到刻度線。吸出的溶液裡也有溶質……', 'Drew off ' + num(r.mL, 2) + ' mL with the dropper; the meniscus looks level again. But that liquid contained solute…'));
      if (snd()) window.LabSound.sweep({ from: 700, to: 420, dur: 0.3, gain: 0.05, type: 'sine' });
      startAnim('draw', 500);
    } else if (id === 'bShake') {
      r = S.shake(P);
      if (!r.ok) return failed(r);
      setStatus(T('蓋上瓶塞，倒轉搖勻。注意：液面會稍微低於刻度線（有溶液沾在瓶塞和瓶頸上），這是正常的。', 'Stoppered and inverted to mix. The meniscus is now a little below the mark — some liquid is on the stopper and the neck. That is normal.'));
      if (snd()) { window.LabSound.noise({ dur: 0.25, gain: 0.07, filter: 1600, q: 1 }); window.LabSound.noise({ dur: 0.25, gain: 0.07, filter: 1600, q: 1, delay: 0.35 }); }
      startAnim('shake', 1200);
    } else if (id === 'bDone') {
      finish();
    }
    lastApp = P.flask.mw > 0 ? S.apparent(P, eye()) : null;
    refresh();
  }
  function finish() {
    if (!P.shaken || P.done) return;
    const info = { stock: P.mode === 'dilute' ? P.stock.key : null, chain: P.mode === 'dilute' ? (P.stock.chain || 0) + 1 : 0, seq: seq + 1 };
    const ev = S.madeEvent(P, info);
    if (!ev) return;
    seq++;
    P.done = true;
    const r = S.result(P);
    const b = { seq: seq, ev: ev, r: r, mode: P.mode, solid: P.solid, sp: P.sp, Vf: P.Vf, stockKey: P.mode === 'dilute' ? P.stock.key : null, stockC: P.mode === 'dilute' ? P.stock.c : null };
    bottles.push(b);
    last = { sp: P.sp, C: r.C, chain: info.chain };
    if (state.stock === 'last') infoLines();
    renderResult(b); renderTable(); drawGraph();
    const good = Math.abs(r.eTotal) <= 0.005;
    setStatus(T('第 ' + seq + ' 瓶完成：', 'Flask ' + seq + ' done: ') + sigf(r.C, 4) + ' M，' .replace('，', T('，', ', ')) + T('和目標差 ', 'off target by ') + pct(r.eTotal) + T('。可以在「稀釋」選「上一瓶」當原液。', '. In “Dilute” you can use “Last flask” as the stock.'));
    if (snd()) {
      if (good) { window.LabSound.tone({ freq: 784, dur: 0.1, gain: 0.08 }); window.LabSound.tone({ freq: 1175, dur: 0.18, gain: 0.08, delay: 0.11 }); }
      else window.LabSound.tone({ freq: 392, dur: 0.18, gain: 0.07, type: 'triangle' });
    }
    if (userActed && window.LabMission) window.LabMission.emit('made', ev);
  }

  // ======================= 結果卡與紀錄表 =======================
  const COMP = [
    ['eAmount', function (m) { return m === 'weigh' ? T('秤量／計算（和目標比）', 'Weighing / calculation (vs target)') : T('吸取的體積（和目標比）', 'Volume pipetted (vs target)'); }],
    ['eLoss', function (m) { return m === 'weigh' ? T('移液損失（燒杯沒洗乾淨）', 'Left behind in the beaker') : T('吸量管沒用原液潤洗', 'Pipette not rinsed with stock'); }],
    ['eTemp', function () { return T('溫度（沒冷卻就定容）', 'Temperature when filling'); }],
    ['eLevel', function () { return T('定容（視差、加過頭、吸出）', 'Filling to the mark (parallax, overshoot)'); }],
    ['eAfter', function () { return T('搖勻後補水', 'Water added after inverting'); }]
  ];
  function mainCause(b) {
    let best = null, bv = 0.001;
    COMP.forEach(function (c) { const v = Math.abs(b.r[c[0]]); if (v > bv) { bv = v; best = c; } });
    return best ? best[1](b.mode) : T('沒有明顯誤差', 'no noticeable error');
  }
  function renderResult(b) {
    const out = $('resOut');
    if (!b) { out.innerHTML = '<p class="hint">' + T('倒轉搖勻後按「完成」，就會看到濃度與誤差來自哪裡。', 'Press “Done” after inverting the flask to see the concentration and where the error came from.') + '</p>'; return; }
    const r = b.r;
    let h = '<dl class="readout">' + dl([
      [T('實際濃度', 'Actual concentration'), sciHTML(r.C, 4) + ' M', 'big'],
      [T('目標', 'Target'), sciHTML(r.target, 3) + ' M'],
      [T('和目標差', 'Off target by'), pct(r.eTotal), Math.abs(r.eTotal) <= 0.005 ? 'good' : 'bad'],
      [b.mode === 'weigh' ? T('應秤', 'You should weigh') : T('應吸取', 'You should pipette'),
        b.mode === 'weigh' ? num(r.massNeeded, 3) + ' g' : num(r.V1Needed, 2) + ' mL']
    ]) + '</dl>';
    h += '<h3>' + T('誤差來自哪裡', 'Where the error came from') + '</h3><div class="bar-e">';
    COMP.forEach(function (c) {
      const v = r[c[0]];
      h += '<span>' + c[1](b.mode) + '</span><span class="v' + (v > 0.0005 ? ' hi' : v < -0.0005 ? ' lo' : '') + '">' + pct(v) + '</span>';
    });
    h += '</div>';
    h += '<h3>' + T('這瓶溶液的濃度', 'This solution') + '</h3><dl class="readout">' + dl([
      [T('重量百分率', 'Mass percentage'), num(r.w * 100, 3) + '%'],
      [T('重量莫耳濃度', 'Molality'), sciHTML(r.molal, 4) + ' mol/kg'],
      [T('密度', 'Density'), num(r.rho, 4) + ' g/mL'],
      [T('每公升溶質', 'Solute per litre'), sciHTML(r.gL, 4) + ' g/L'],
      r.ppmCu != null ? ['ppm' + T('（銅）', ' (copper)'), sciHTML(r.ppmCu, 3)] : ['ppm', sciHTML(r.ppm, 3)]
    ]) + '</dl>';
    out.innerHTML = h;
  }
  function renderTable() {
    const t = $('tbl');
    let h = '<thead><tr><th>#</th><th class="l">' + T('溶液', 'Solution') + '</th><th class="l">' + T('配法', 'Method') + '</th><th>' + T('目標', 'Target') + '<br><small>M</small></th><th>' +
      T('實際', 'Actual') + '<br><small>M</small></th><th>' + T('和目標差', 'Off target') + '</th><th>' + T('操作誤差', 'Procedure') + '</th><th class="l">' + T('主要原因', 'Main cause') + '</th></tr></thead><tbody>';
    if (!bottles.length) h += '<tr class="empty"><td colspan="8">' + T('還沒有配好的溶液。', 'No finished solutions yet.') + '</td></tr>';
    bottles.forEach(function (b) {
      const how = b.mode === 'weigh' ? fH(FORMULA[b.solid]) + T(' 秤量', ' weighed') : T('稀釋 ', 'from ') + sciHTML(b.stockC, 3) + ' M';
      h += '<tr><td>' + b.seq + '</td><td class="l">' + b.Vf + ' mL ' + fH(b.sp) + '</td><td class="l">' + how + '</td><td>' + sciHTML(b.r.target, 3) + '</td><td>' + sciHTML(b.r.C, 4) +
        '</td><td>' + pct(b.r.eTotal) + '</td><td>' + pct(b.r.eProc) + '</td><td class="l">' + mainCause(b) + '</td></tr>';
    });
    t.innerHTML = h + '</tbody>';
  }

  // ======================= 圖表 =======================
  let gw = 600, gh = 300;
  function resizeGraph() {
    const w = gcv.clientWidth;
    if (!w) return;
    gw = w; gh = w < 600 ? 280 : 300;
    if (gcv.style.height !== gh + 'px') gcv.style.height = gh + 'px';
    gcv.width = Math.round(gw * dpr); gcv.height = Math.round(gh * dpr);
  }
  function niceMax(v) { const e = Math.pow(10, Math.floor(Math.log10(v))); const m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e; }
  function drawGraph() {
    if (!gw) return;
    const c = gctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(c, gw, gh);
    if (state.tab === 'bottles') drawBottles(c); else drawCurves(c);
  }
  function drawBottles(c) {
    const legend = $('gLegend');
    legend.innerHTML = '<span>' + T('柱：操作造成的誤差（實際 ÷ 用你取的量應得的濃度 − 1）', 'Bars: error from the procedure (actual ÷ what your amount should give − 1)') + '</span><span>' + T('小瓶：溶液顏色', 'Vials: colour of the solution') + '</span>';
    if (!bottles.length) {
      LD.haloText(c, T('配好的溶液會出現在這裡', 'Your finished solutions will appear here'), gw / 2, gh / 2, col.muted, 'center', 'middle', '14px ' + FONT);
      return;
    }
    const list = bottles.slice(-12), n = list.length;
    const x0 = 52, x1 = gw - 12, yTop = 96, yBot = gh - 26, y0 = (yTop + yBot) / 2;
    let em = 0.002;
    list.forEach(function (b) { em = Math.max(em, Math.abs(b.r.eProc)); });
    em = niceMax(Math.min(em * 1.1, 1));
    // 軸
    c.strokeStyle = LD.alpha(col.text, 0.12); c.lineWidth = 1;
    [-1, -0.5, 0, 0.5, 1].forEach(function (f) {
      const y = y0 - f * (yBot - yTop) / 2;
      c.beginPath(); c.moveTo(x0, Math.round(y) + 0.5); c.lineTo(x1, Math.round(y) + 0.5); c.stroke();
      LD.haloText(c, pct(f * em, em < 0.01 ? 2 : 1), x0 - 4, y, col.muted, 'right', 'middle', '10.5px ' + FONT);
    });
    c.strokeStyle = LD.alpha(col.text, 0.45); c.beginPath(); c.moveTo(x0, Math.round(y0) + 0.5); c.lineTo(x1, Math.round(y0) + 0.5); c.stroke();
    const slot = (x1 - x0) / n, bw = Math.min(28, slot * 0.5);
    list.forEach(function (b, i) {
      const cx = x0 + slot * (i + 0.5), e = b.r.eProc;
      const hh = Math.max(-1, Math.min(1, e / em)) * (yBot - yTop) / 2;
      if (Math.abs(hh) > 0.5) LD.block(c, cx - bw / 2, hh > 0 ? y0 - hh : y0, bw, Math.abs(hh), e > 0 ? col.pos : col.neg, { r: 3, shadow: false });
      else { c.fillStyle = col.probe; c.fillRect(cx - bw / 2, y0 - 1.5, bw, 3); }
      // 小瓶
      const vw = Math.min(16, slot * 0.32), vh = 40, vy = 12;
      LD.roundRect(c, cx - vw / 2, vy, vw, vh, 4);
      c.fillStyle = liqColor(b.sp, b.r.C, 1.6, 0.95); c.fill();
      c.save(); LD.roundRect(c, cx - vw / 2, vy, vw, vh, 4); c.clip(); c.fillStyle = LD.alpha(col.bg, 1); c.fillRect(cx - vw / 2, vy, vw, 8); c.restore();
      LD.roundRect(c, cx - vw / 2, vy, vw, vh, 4); glassStroke(c, 1.2);
      LD.haloText(c, '#' + b.seq, cx, vy + vh + 14, col.text, 'center', 'alphabetic', '600 11px ' + FONT);
      if (slot > 46) LD.haloText(c, sciPlain(b.r.C), cx, vy + vh + 28, col.muted, 'center', 'alphabetic', '10px ' + FONT);
    });
  }
  function drawCurves(c) {
    const sp = state.mode === 'convert' ? state.sp : (P ? P.sp : 'NaCl');
    const sat = S.SPECIES[sp].sat, wMax = Math.min(sat, sp === 'NaOH' ? 50 : sat);
    const x0 = 52, x1 = gw - 16, yT = 18, yB = gh - 40;
    const pM = S.props(sp, wMax / 100);
    const yMax = niceMax(Math.max(pM.C, pM.m) * 1.05);
    const X = function (w) { return x0 + (x1 - x0) * w / wMax; }, Y = function (v) { return yB - (yB - yT) * v / yMax; };
    LD.grid(c, x0, yT, x1, yB, (x1 - x0) * (wMax > 30 ? 10 : 5) / wMax, (x1 - x0) / wMax, x0, yB);
    c.strokeStyle = LD.alpha(col.text, 0.5); c.lineWidth = 1;
    c.beginPath(); c.moveTo(x0, yT); c.lineTo(x0, yB); c.lineTo(x1, yB); c.stroke();
    const xs = wMax > 30 ? 10 : 5;
    for (let v = 0; v <= wMax + 1e-9; v += xs) LD.haloText(c, num(v, 0) + '%', X(v), yB + 14, col.muted, 'center', 'alphabetic', '10.5px ' + FONT);
    for (let i = 0; i <= 5; i++) LD.haloText(c, num(yMax * i / 5, yMax < 5 ? 1 : 0), x0 - 4, Y(yMax * i / 5), col.muted, 'right', 'middle', '10.5px ' + FONT);
    LD.haloText(c, T('重量百分率', 'Mass percentage'), (x0 + x1) / 2, gh - 8, col.muted, 'center', 'alphabetic', '11px ' + FONT);
    const line = function (key, color, dash) {
      c.beginPath();
      for (let i = 0; i <= 200; i++) { const w = wMax * i / 200, p = S.props(sp, w / 100); const y = Y(p[key]); if (i) c.lineTo(X(w), y); else c.moveTo(X(w), y); }
      c.setLineDash(dash || []); c.strokeStyle = color; c.lineWidth = 2.2; c.lineCap = 'round'; c.stroke(); c.setLineDash([]);
    };
    line('m', col.pos, [6, 5]);
    line('C', col.accent);
    // 目前的點
    let w = null;
    if (state.mode === 'convert') w = val(el.wt);
    else if (bottles.length) { const b = bottles[bottles.length - 1]; if (b.sp === sp) w = b.r.w * 100; }
    if (w != null && w <= wMax + 1e-9) {
      const p = S.props(sp, w / 100);
      [['C', col.accent], ['m', col.pos]].forEach(function (k) { LD.ball(c, X(w), Y(p[k[0]]), 5, k[1]); });
      LD.pill(c, num(w, 2) + '%：' .replace('：', T('：', ': ')) + sigf(p.C, 3) + ' M · ' + sigf(p.m, 3) + ' mol/kg', Math.min(Math.max(X(w), x0 + 90), x1 - 90), Math.max(yT + 18, Y(Math.max(p.C, p.m)) - 10), col.text, 'center', '600 11px ' + FONT);
    }
    formula(c, sp, x0 + 8, yT + 14, col.text, 13, 'left');
    $('gLegend').innerHTML = '<span><span class="ln" style="background:' + col.accent + '"></span>' + T('體積莫耳濃度（mol/L）', 'Molarity (mol/L)') + '</span>' +
      '<span style="color:' + col.pos + '"><span class="ln dash"></span><span style="color:var(--muted)">' + T('重量莫耳濃度（mol/kg）', 'Molality (mol/kg)') + '</span></span>' +
      '<span>' + T('右端是 20 °C 的飽和濃度', 'The right end is saturation at 20 °C') + '</span>';
  }

  // ======================= 數據表（模擬方法） =======================
  function buildDataTable() {
    const t = $('dataTable');
    if (!t) return;
    let h = '<thead><tr><th class="l">' + T('物質', 'Substance') + '</th><th>' + T('莫耳質量', 'Molar mass') + '<br><small>g/mol</small></th><th>' + T('溶解熱', 'ΔH soln') + '<br><small>kJ/mol</small></th><th>' +
      T('20 °C 溶解度', 'Solubility 20 °C') + '<br><small>' + T('重量 %', 'mass %') + '</small></th><th>' + T('10% 溶液密度', 'Density at 10%') + '<br><small>g/mL</small></th></tr></thead><tbody>';
    ['CuSO4-5H2O', 'CuSO4', 'NaCl', 'NaOH'].forEach(function (k) {
      const Sd = S.SOLIDS[k], sp = S.SPECIES[Sd.sp];
      h += '<tr><td class="l">' + fH(FORMULA[k]) + '</td><td>' + num(Sd.M, 2) + '</td><td>' + (Sd.dH > 0 ? '+' : '') + num(Sd.dH, 2) + '</td><td>' + num(sp.sat, 1) + T('（以 ', ' (as ') + fH(Sd.sp) + T(' 計）', ')') + '</td><td>' + num(S.rho(Sd.sp, 0.1), 4) + '</td></tr>';
    });
    t.innerHTML = h + '</tbody>';
  }

  // ======================= 控制項同步 =======================
  function syncSegs() {
    document.querySelectorAll('#modeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)); });
    document.querySelectorAll('#solidSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.solid === state.solid)); });
    document.querySelectorAll('#stockSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.stock === state.stock)); });
    document.querySelectorAll('#flaskSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.vf === state.Vf)); });
    document.querySelectorAll('#convSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.sp === state.sp)); });
    document.querySelectorAll('#tabs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === state.tab)); });
    $('weighCtl').hidden = state.mode !== 'weigh';
    $('diluteCtl').hidden = state.mode !== 'dilute';
    $('convCtl').hidden = state.mode !== 'convert';
    $('flaskCard').hidden = state.mode === 'convert';
    $('view3d').disabled = state.mode === 'convert';
  }
  function outputs() {
    $('masso').textContent = num(val(el.mass), 3) + ' g';
    $('V1o').textContent = num(val(el.V1), 2) + ' mL';
    $('targeto').textContent = sigf(targetVal(), 3) + ' M';
    const e = val(el.eye);
    $('eyeo').textContent = (e > 0 ? '+' : '') + num(e, 1) + '°';
    $('wto').textContent = num(val(el.wt), 2) + '%';
  }
  function setWtRange() {
    const sat = S.SPECIES[state.sp].sat, mx = state.sp === 'NaOH' ? 50 : sat;
    el.wt.max = String(mx);
    if (val(el.wt) > mx) setVal(el.wt, mx);
  }
  function emitConvert() {
    if (!userActed || !window.LabMission) return;
    const s = convState();
    window.LabMission.emit('convert', { sp: state.sp, w: s.w, C: s.p.C, m: s.p.m, x: s.p.x, ppm: s.p.ppm });
  }
  function changed(msg) {
    acted();
    newPrep();
    setStatus(msg || '');
    infoLines(); outputs();
    refresh();
  }

  // ======================= 事件 =======================
  [el.mass, el.wet].forEach(function (e) { e.addEventListener(e.type === 'checkbox' ? 'change' : 'input', function () { if (syncing) return; changed(T('換了一瓶新的量瓶。', 'A fresh flask.')); }); });
  el.V1.addEventListener('input', function () { if (syncing) return; acted(); outputs(); });
  el.pipRinse.addEventListener('change', function () { acted(); });
  el.target.addEventListener('input', function () { if (syncing) return; acted(); outputs(); if (P && !P.done) P.target = targetVal(); refresh(); });
  el.eye.addEventListener('input', function () { if (syncing) return; acted(); outputs(); lastApp = P.flask.mw > 0 ? S.apparent(P, eye()) : null; refresh(); if (view3 && view3.active) view3.frame(); });
  el.wt.addEventListener('input', function () { if (syncing) return; acted(); outputs(); updateReadouts(); draw(); drawGraph(); emitConvert(); });
  document.querySelectorAll('#modeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.mode === state.mode) return;
      state.mode = b.dataset.mode;
      if (state.mode === 'convert' && state.view === '3d') setView('2d');
      syncSegs();
      if (state.mode === 'convert') { acted(); setStatus(''); outputs(); infoLines(); refresh(); drawGraph(); emitConvert(); }
      else changed('');
      resize();
    });
  });
  document.querySelectorAll('#solidSeg button').forEach(function (b) { b.addEventListener('click', function () { if (b.dataset.solid === state.solid) return; state.solid = b.dataset.solid; syncSegs(); changed(''); }); });
  document.querySelectorAll('#stockSeg button').forEach(function (b) { b.addEventListener('click', function () { if (b.disabled || b.dataset.stock === state.stock) return; state.stock = b.dataset.stock; syncSegs(); changed(''); }); });
  document.querySelectorAll('#flaskSeg button').forEach(function (b) { b.addEventListener('click', function () { if (+b.dataset.vf === state.Vf) return; state.Vf = +b.dataset.vf; syncSegs(); changed(''); if (view3 && view3.active) view3.rebuild(); }); });
  document.querySelectorAll('#convSeg button').forEach(function (b) {
    b.addEventListener('click', function () { if (b.dataset.sp === state.sp) return; acted(); state.sp = b.dataset.sp; setWtRange(); syncSegs(); outputs(); infoLines(); updateReadouts(); draw(); drawGraph(); emitConvert(); });
  });
  document.querySelectorAll('#tabs button').forEach(function (b) { b.addEventListener('click', function () { acted(); state.tab = b.dataset.tab; syncSegs(); drawGraph(); }); });
  ['bDissolve', 'bCool', 'bTransfer', 'bRinse', 'bPipette', 'bPour', 'bSquirt', 'bDrop', 'bDraw', 'bShake', 'bDone'].forEach(function (id) {
    $(id).addEventListener('click', function () { doStep(id); });
  });
  $('bNew').addEventListener('click', function () { changed(T('倒掉、洗乾淨，重新配一瓶（設定保留）。', 'Emptied and washed: a fresh flask with the same settings.')); });
  $('clearAll').addEventListener('click', function () {
    acted();
    bottles = []; seq = 0; last = null;
    if (state.stock === 'last') { state.stock = 'Cu1'; syncSegs(); if (state.mode === 'dilute') newPrep(); }
    renderTable(); drawGraph(); renderResult(P && P.done ? null : null); infoLines(); refresh();
    setStatus(T('已清除「我的溶液」紀錄。', 'Your record of solutions has been cleared.'));
  });
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
    if (ev.detail && ev.detail.name === 'fs') resize();
  });

  // ======================= 3D 檢視 =======================
  let threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
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
  function host3Api() {
    return {
      T: T, host: host3,
      prep: function () { return P; },
      geom: function () { return P.g; },
      level: function () { return S.level(P); },
      liquid: function () { const fc = flaskConc(); return { C: fc.C, sp: P.sp, shaken: P.shaken, has: P.flask.mw > 0, color: function (C, l) { return liqColor(P.sp, C, l, 1); } }; },
      colors: function () { return col; },
      eye: eye,
      contextLost: function () {
        setView('2d');
        viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
      }
    };
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
      if (!webglAvailable() || !window.Sol3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        state.view = '3d';
        view3 = window.Sol3D.create(lib, host3Api());
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        view3.frame();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      state.view = '2d';
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
    state.view = '2d';
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { acted(); setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); if (state.mode !== 'convert') setView('3d'); });
  $('resetCam').addEventListener('click', function () { acted(); if (view3) view3.frame(); });

  function themeChanged() {
    if (LD.refresh) LD.refresh();
    readColors();
    renderTable();
    refresh(); drawGraph();
    if (view3 && view3.active) view3.theme();
  }
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lg = 0;
    new ResizeObserver(function () { const w = cv.clientWidth; if (w && w !== lw) { lw = w; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', resize);

  // 測試用（Playwright）：讀取目前狀態
  window.__sc = {
    state: state, prep: function () { return P; }, bottles: function () { return bottles; }, last: function () { return last; },
    step: doStep, result: function () { return P ? S.result(P) : null; }
  };

  // ======================= 啟動 =======================
  readColors();
  setVal(el.target, 0.1);
  setWtRange();
  syncSegs();
  newPrep();
  outputs(); infoLines();
  buildDataTable();
  renderTable();
  updateSoundButton();
  resize();
  refresh();
})();
