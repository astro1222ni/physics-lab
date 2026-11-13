/*
 * mole-concept.js — 「莫耳與亞佛加厥數」的頁面程式（天平與換算、放大到原子、油膜法、圖表、讀數、任務事件）
 * 化學核心在 js/mole-concept-core.js（MoleCore）；3D 立體（1 莫耳的實際大小）在 js/mole-concept-3d.js（MC3D）。
 * 畫面上的大小一律依比例：天平上的樣品畫成與實際體積相同的立方體（同一個比例尺）；放大畫面的粒子照晶格常數或密度排列。
 *
 * 任務事件（只在使用者操作過之後送出）：
 *   'weigh'：天平任一盤或氣體條件改變 MoleCore.weighData(A, B, cond)
 *   'zoom'：放大鏡改變 MoleCore.zoomData(…)，src = 'zoom'（物質、樣品體積、放大倍率）或 'cut'（對切、接回去、切了幾刀）
 *   'film'：油膜法按「計算」MoleCore.filmData(結果, 紀錄)
 */
(function () {
  'use strict';
  const C = window.MoleCore, LD = window.LabDraw;
  if (!C || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reducedMotion = LD.reducedMotion();
  const MLOG0 = -4, MLOG1 = 3;              // 天平樣品的質量範圍 10^-4 – 10^3 g（對數滑桿 0–1000）
  const ZL0 = -1, ZL1 = 7;                  // 視野邊長 10^-1 – 10^7 nm（對數滑桿 0–1600）
  const VL0 = -3, VL1 = 0;                  // 樣品體積 10^-3 – 1 mL（對數滑桿 0–300）
  const DEC = { g: 4, mol: 6, N: 0, V: 6 };

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
    if (e >= -2 && e < 4) return { m: num(x, Math.max(0, (sig || 3) - 1 - e)), e: null };
    const m = x / Math.pow(10, e);
    if (Math.abs(+m.toFixed((sig || 3) - 1)) >= 10) return sciParts(Math.sign(x) * Math.pow(10, e + 1), sig);
    return { m: num(m, (sig || 3) - 1), e: e };
  }
  function sci(x, sig) { const p = sciParts(x, sig); return p.e == null ? p.m : p.m + ' × 10<sup>' + num(p.e, 0) + '</sup>'; }
  function fH(f) { return f.replace(/(\d+)/g, '<sub>$1</sub>'); }
  /** 長度（nm）→ 適當單位 */
  function lenParts(nm, sig) {
    const u = nm >= 1e6 ? [1e6, 'mm'] : nm >= 1e3 ? [1e3, 'µm'] : [1, 'nm'];
    if (nm >= 1e7) return { v: sigf(nm / 1e7, sig || 3), u: 'cm' };
    return { v: sigf(nm / u[0], sig || 3), u: u[1] };
  }
  function lenStr(nm, sig) { const p = lenParts(nm, sig); return p.v + ' ' + p.u; }

  // ======================= 名稱 =======================
  function subName(s) { return T(s.zh, s.en); }
  function kindName(s, plural) {
    return s.kind === 'atom' ? T('原子', plural ? 'atoms' : 'atom') : s.kind === 'formula' ? T('化學式單位', plural ? 'formula units' : 'formula unit') : T('分子', plural ? 'molecules' : 'molecule');
  }
  function unitName(u, s) { return u === 'g' ? 'g' : u === 'mol' ? 'mol' : u === 'N' ? T('個', '') : (s.phase === 'g' ? 'L' : 'mL'); }

  // ======================= 顏色 =======================
  let col = {};
  const MAT = {
    C: '#41464d', Al: '#c6ccd4', Fe: '#7f868e', Cu: '#c87533', Au: '#e2b13c', NaCl: '#eef2f5', C12H22O11: '#f6f1e4',
    H2O: '#58a6dc', C2H5OH: '#bfe0f2', Hg: '#c3c8cf',
    H2: '#8cc8ff', He: '#ffcf6e', CH4: '#9fe3b0', NH3: '#c9b5ff', N2: '#9eaaff', CO: '#b9b9b9', O2: '#7fcfff', CO2: '#cfcfcf', Cl2: '#c3df4f'
  };
  const ATOMC = { O: '#e0453a', H: '#f2f2f2', Cu: '#c87533', Au: '#e8b53c', Na: '#9a6ad8', Cl: '#3cba54' };
  function readColors() {
    const c = LD.c, dk = LD.dark;
    col = {
      text: c.text, muted: c.muted, border: c.border, accent: c.accent, bg: c['canvas-bg'], surface: c.surface,
      pos: c.pos || '#d1453b', neg: c.neg || '#2f6fd0', probe: c.probe || '#0d7f57', equi: c.equi || '#8a5a00', dark: dk,
      wood: dk ? '#5a4634' : '#c9a57c', steel: dk ? '#aab3bd' : '#8d969f', brass: dk ? '#d2ae63' : '#b88a2e',
      water: dk ? '#2f5d78' : '#a9d3ea', glass: dk ? '#a9c3cf' : '#7d97a5', powder: dk ? '#e9e4d6' : '#ffffff'
    };
  }

  // ======================= 狀態 =======================
  const state = { mode: 'scale', view: '2d', cond: 'stp', zid: 'H2O', cuts: 0, dropper: 'mid', calV: 1, powder: 'thin', grid: 1, meth: 'last' };
  const pans = { A: { id: 'Cu', unit: 'mol', el: $('amtA'), out: $('amtAo') }, B: { id: 'Al', unit: 'g', el: $('amtB'), out: $('amtBo') } };
  let userActed = false, syncing = false;
  function acted() { userActed = true; }
  function emit(type, data) { if (userActed && window.LabMission) window.LabMission.emit(type, data); }
  function snd() { return window.LabSound && window.LabSound.enabled(); }
  function val(e) { return window.LabNum ? window.LabNum.value(e) : +e.value; }
  function setVal(e, v) { syncing = true; if (window.LabNum) window.LabNum.set(e, v); else e.value = v; syncing = false; }
  const statusEl = $('status');
  function setStatus(s) { statusEl.textContent = s || ''; }

  // ---------- 天平：每盤的滑桿（對數，範圍依質量 10^-4 – 10^3 g） ----------
  function massOfPos(p) { return Math.pow(10, MLOG0 + (MLOG1 - MLOG0) * p / 1000); }
  function posOfMass(m) { return (Math.log10(m) - MLOG0) / (MLOG1 - MLOG0) * 1000; }
  function registerPan(P) {
    const s = C.SUB[P.id], k = C.perMol(s, P.unit, state.cond) / s.M;   // 每克是多少單位
    if (window.LabNum) window.LabNum.register(P.el, {
      toValue: function (p) { return massOfPos(p) * k; }, toPos: function (v) { return posOfMass(v / k); },
      min: Math.pow(10, MLOG0) * k, max: Math.pow(10, MLOG1) * k, decimals: DEC[P.unit]
    });
  }
  function panValue(P) { return val(P.el); }
  function panSample(P) {
    const s = C.SUB[P.id];
    const n = C.toMol(s, P.unit, panValue(P), state.cond);
    const r = C.sample(s, n, state.cond);
    r.unit = P.unit;
    return r;
  }
  /** 換物質、換單位、換氣體條件：保留莫耳數或保留該單位的數字 */
  function setPan(P, id, unit, keep) {
    const before = panSample(P);
    const oldVal = panValue(P);
    P.id = id; P.unit = unit;
    registerPan(P);
    const s = C.SUB[id];
    let v = keep === 'n' ? C.fromMol(s, unit, before.n, state.cond) : oldVal;
    const k = C.perMol(s, unit, state.cond) / s.M;
    v = Math.min(Math.pow(10, MLOG1) * k, Math.max(Math.pow(10, MLOG0) * k, v));
    setVal(P.el, v);
    showPan(P);
  }
  function showPan(P) {
    const s = C.SUB[P.id], v = panValue(P);
    const p = sciParts(v, 4);
    const u = P.unit === 'N' ? (T('個', ' ') + kindName(s, true)).trim() : unitName(P.unit, s);
    P.out.innerHTML = (p.e == null ? p.m : p.m + ' × 10<sup>' + num(p.e, 0) + '</sup>') + ' ' + u;
    const lab = P === pans.A ? $('amtALabel') : $('amtBLabel');
    lab.textContent = P.unit === 'g' ? T('質量', 'Mass') : P.unit === 'mol' ? T('莫耳數', 'Amount') : P.unit === 'N' ? T('粒子數', 'Number of particles') : (s.phase === 'g' ? T('體積（氣體）', 'Volume (gas)') : T('體積', 'Volume'));
    document.querySelectorAll('#unit' + (P === pans.A ? 'A' : 'B') + ' button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.unit === P.unit)); });
  }
  function buildSelect(sel, id) {
    const groups = [['s', T('固體', 'Solids')], ['l', T('液體', 'Liquids')], ['g', T('氣體', 'Gases')]];
    sel.innerHTML = '';
    groups.forEach(function (g) {
      const og = document.createElement('optgroup');
      og.label = g[1];
      C.SUBS.filter(function (s) { return s.phase === g[0]; }).forEach(function (s) {
        const o = document.createElement('option');
        o.value = s.id; o.textContent = subName(s) + '  ' + s.f;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    sel.value = id;
  }

  // ---------- 放大鏡 ----------
  const elZ = { L: $('zoomL'), V0: $('V0'), cuts: $('cuts') };
  if (window.LabNum) {
    window.LabNum.register(elZ.L, { toValue: function (p) { return Math.pow(10, ZL0 + (ZL1 - ZL0) * p / 1600); }, toPos: function (v) { return (Math.log10(v) - ZL0) / (ZL1 - ZL0) * 1600; }, min: Math.pow(10, ZL0), max: Math.pow(10, ZL1), decimals: 4 });
    window.LabNum.register(elZ.V0, { toValue: function (p) { return Math.pow(10, VL0 + (VL1 - VL0) * p / 300); }, toPos: function (v) { return (Math.log10(v) - VL0) / (VL1 - VL0) * 300; }, min: Math.pow(10, VL0), max: 1, decimals: 4 });
  }
  function zSub() { return C.ZOOM[state.zid]; }
  function zL() { return val(elZ.L); }
  function zV0() { return val(elZ.V0); }
  function zCuts() { return Math.round(val(elZ.cuts)); }
  function pieceVol() { return zV0() / Math.pow(2, zCuts()); }               // mL
  function pieceSide() { return Math.cbrt(pieceVol()) * 1e7; }               // nm
  function zData(src) { return C.zoomData(zSub(), zL(), zV0(), zCuts(), src); }
  function showZoomOut() {
    const L = zL(), lp = lenParts(L, 4);
    $('zoomLo').textContent = lp.v + ' ' + lp.u;
    $('V0o').textContent = sigf(zV0(), 3) + ' mL';
    $('cutso').textContent = zCuts() + ' ' + T('刀', zCuts() === 1 ? 'cut' : 'cuts');
    $('uncutBtn').disabled = zCuts() <= 0;
  }

  // ---------- 油膜 ----------
  const sess = C.createSession();
  let tray = null, rows = [], cals = {}, lastCount = null, filmAnim = null, calAnim = null, lastRes = null;
  const elF = { dil: $('dil'), k: $('kk') };
  function newTray(msg) {
    tray = C.newTray(sess, { dropper: state.dropper, D: Math.round(val(elF.dil)), powder: state.powder });
    lastCount = null; filmAnim = null;
    if (msg != null) setStatus(msg);
  }
  function showFilmOut() {
    $('dilo').textContent = num(val(elF.dil), 0) + ' mL';
    $('kko').textContent = num(val(elF.k), 2);
  }

  // ======================= 畫布 =======================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  let cw = 600, ch = 440, dpr = 1, gw = 600, gh = 320;
  function fsz(px) { return px * (window.LabSettings && window.LabSettings.get('fs') || 1); }
  function font(px, w) { return (w ? w + ' ' : '') + px + 'px ' + LD.FONT; }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = w;
    ch = w < 560 ? Math.round(Math.max(400, w * 1.12)) + (state.mode === 'zoom' ? Math.round(fsz(13) * 15) : 0) : 440;   // 窄螢幕的放大模式：下面放說明
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    resizeGraph();
    draw();
  }
  function resizeGraph() {
    const w = gcv.clientWidth;
    if (!w) return;
    gw = w; gh = w < 560 ? Math.round(Math.max(300, w * 0.85)) : 320;
    if (gcv.style.height !== gh + 'px') gcv.style.height = gh + 'px';
    gcv.width = Math.round(gw * dpr); gcv.height = Math.round(gh * dpr);
  }

  /** 化學式（數字下標），傳回寬度；align left／center／right */
  function formula(g, f, x, y, color, px, align, weight) {
    const parts = f.split(/(\d+)/).filter(Boolean);
    const fBig = font(px, weight || 600), fSm = font(px * 0.72, weight || 600);
    let w = 0;
    parts.forEach(function (p) { g.font = /^\d/.test(p) ? fSm : fBig; w += g.measureText(p).width; });
    let xx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    parts.forEach(function (p) {
      const sub = /^\d/.test(p);
      LD.haloText(g, p, xx, y + (sub ? px * 0.28 : 0), color, 'left', 'alphabetic', sub ? fSm : fBig);
      g.font = sub ? fSm : fBig; xx += g.measureText(p).width;
    });
    return w;
  }
  /** 科學記號文字（畫布：上標自己畫小字） */
  function sciText(g, x, prefix, suffix, y, color, px, align, sig) {
    return function (v) {
      const p = sciParts(v, sig || 3);
      const f = font(px, 600);
      if (p.e == null) { LD.haloText(g, prefix + p.m + suffix, x, y, color, align, 'alphabetic', f); return; }
      const base = prefix + p.m + ' × 10', sup = num(p.e, 0);
      g.font = f; const w1 = g.measureText(base).width;
      g.font = font(px * 0.72, 600); const w2 = g.measureText(sup).width;
      g.font = f; const w3 = g.measureText(suffix).width;
      const tot = w1 + w2 + w3 + 1;
      const x0 = align === 'center' ? x - tot / 2 : align === 'right' ? x - tot : x;
      LD.supText(g, base, sup, x0, y, color, f, 'left');
      LD.haloText(g, suffix, x0 + w1 + w2 + 1, y, color, 'left', 'alphabetic', f);
    };
  }

  // ---------- 立方體（斜投影）：x 中心、yb 底邊、a 邊長（px） ----------
  function cube(g, x, yb, a, s, opts) {
    opts = opts || {};
    const c = MAT[s.id] || '#999999';
    const d = a * 0.36, e = a * 0.26;           // 斜投影的深度方向
    const x0 = x - (a + d) / 2, y0 = yb - a;    // 正面左上角
    if (a < 2.5) {                              // 太小：畫一點
      g.fillStyle = c; g.beginPath(); g.arc(x, yb - 1.5, 1.6, 0, 7); g.fill();
      g.strokeStyle = LD.alpha(col.text, 0.6); g.lineWidth = 0.8; g.stroke();
      return { x0: x - 2, y0: yb - 3, x1: x + 2 };
    }
    const top = [[x0, y0], [x0 + d, y0 - e], [x0 + a + d, y0 - e], [x0 + a, y0]];
    const side = [[x0 + a, y0], [x0 + a + d, y0 - e], [x0 + a + d, y0 - e + a], [x0 + a, y0 + a]];
    function poly(pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }
    if (s.phase === 'g') {
      // 氣體：半透明、虛線邊、幾個小點代表分子
      const a0 = s.id === 'Cl2' ? 0.32 : 0.14;
      g.fillStyle = LD.alpha(c, a0 + 0.06); poly(top); g.fill();
      g.fillStyle = LD.alpha(LD.shade(c, -0.2), a0 + 0.08); poly(side); g.fill();
      const fg = g.createLinearGradient(x0, y0, x0 + a, y0 + a);
      fg.addColorStop(0, LD.alpha(c, a0 + 0.1)); fg.addColorStop(1, LD.alpha(c, a0));
      g.fillStyle = fg; g.fillRect(x0, y0, a, a);
      g.setLineDash([4, 3]); g.strokeStyle = LD.alpha(LD.shade(c, col.dark ? 0.2 : -0.45), 0.85); g.lineWidth = 1.2;
      g.strokeRect(x0 + 0.5, y0 + 0.5, a - 1, a - 1); poly(top); g.stroke(); poly(side); g.stroke();
      g.setLineDash([]);
      if (a > 18) {
        g.fillStyle = LD.alpha(LD.shade(c, col.dark ? 0.3 : -0.5), 0.7);
        for (let i = 0; i < 9; i++) { const u = (C.hashU(i, 31) + 1) / 2, v = (C.hashU(i, 37) + 1) / 2; g.beginPath(); g.arc(x0 + a * (0.12 + 0.76 * u), y0 + a * (0.12 + 0.76 * v), Math.max(1.2, a * 0.018), 0, 7); g.fill(); }
      }
      return { x0: x0, y0: y0 - e, x1: x0 + a + d };
    }
    // 接觸陰影
    g.fillStyle = LD.shadowInk(col.dark ? 0.35 : 0.16);
    g.beginPath(); g.ellipse(x0 + (a + d) / 2 + 2, yb + 1, (a + d) * 0.6, Math.max(2, a * 0.08), 0, 0, 7); g.fill();
    const liquid = s.phase === 'l' && s.id !== 'Hg';
    const crystal = s.id === 'NaCl' || s.id === 'C12H22O11';
    const op = liquid ? 0.62 : crystal ? 0.9 : 1;
    const fg = g.createLinearGradient(x0, y0, x0, y0 + a);
    fg.addColorStop(0, LD.alpha(LD.shade(c, 0.18), op)); fg.addColorStop(0.55, LD.alpha(c, op)); fg.addColorStop(1, LD.alpha(LD.shade(c, -0.18), op));
    g.fillStyle = fg; g.fillRect(x0, y0, a, a);
    g.fillStyle = LD.alpha(LD.shade(c, 0.35), op); poly(top); g.fill();
    g.fillStyle = LD.alpha(LD.shade(c, -0.25), op); poly(side); g.fill();
    // 金屬光澤：斜的高光帶
    if (!liquid && !crystal && a > 8) {
      g.save(); g.beginPath(); g.rect(x0, y0, a, a); g.clip();
      const hg = g.createLinearGradient(x0, y0, x0 + a, y0 + a);
      hg.addColorStop(0.25, 'rgba(255,255,255,0)'); hg.addColorStop(0.42, 'rgba(255,255,255,' + (s.id === 'C' ? 0.12 : 0.32) + ')'); hg.addColorStop(0.55, 'rgba(255,255,255,0)');
      g.fillStyle = hg; g.fillRect(x0, y0, a, a); g.restore();
    }
    if (liquid && a > 8) {   // 液面（玻璃容器裡的液體）：頂面稍低、彎月面
      g.strokeStyle = LD.alpha('#ffffff', 0.55); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x0 + 2, y0 + a * 0.08); g.quadraticCurveTo(x0 + a / 2, y0 + a * 0.14, x0 + a - 2, y0 + a * 0.08); g.stroke();
    }
    g.strokeStyle = LD.alpha(LD.shade(c, -0.5), liquid ? 0.6 : 0.55); g.lineWidth = 1;
    g.strokeRect(x0 + 0.5, y0 + 0.5, a - 1, a - 1); poly(top); g.stroke(); poly(side); g.stroke();
    if (liquid) {   // 玻璃容器的邊
      g.strokeStyle = LD.alpha(col.glass, 0.9); g.lineWidth = 1.4;
      g.strokeRect(x0 - 1, y0 - a * 0.06, a + 2, a * 1.06 + 1);
    }
    g.fillStyle = 'rgba(255,255,255,' + (col.dark ? 0.12 : 0.3) + ')';
    g.fillRect(x0 + 1, y0 + 1, Math.max(1, a * 0.08), a - 2);
    return { x0: x0, y0: y0 - e, x1: x0 + a + d };
  }

  // ======================= 天平 =======================
  let beam = 0, beamTo = 0, levelWas = null, raf = 0, lastTs = 0;
  function scaleTarget(a, b) {
    const dm = b.m - a.m;
    if (Math.abs(dm) <= 0.01) return 0;
    return 0.24 * Math.tanh(dm / (0.04 * (a.m + b.m) + 1e-4));
  }
  function drawScale(g) {
    const a = panSample(pans.A), b = panSample(pans.B);
    const narrow = cw < 560, pad = narrow ? 10 : 16;
    const cx = cw / 2, pivY = ch * (narrow ? 0.27 : 0.25);
    const Lb = Math.min(cw * 0.32, 250, (cw / 2 - pad - 4) / 1.62);   // 秤盤不可超出畫布
    const hang = Math.min(ch * 0.36, 150);
    const pr = Math.min(Lb * 0.62, narrow ? 72 : 105);
    const baseY = ch - pad - fsz(13) * 2.2;
    // 樣品的比例尺：大的那個邊長不超過 maxPx
    // 立方體（含斜投影的深度）要放進吊繩圍成的三角形裡
    const maxPx = 0.95 * 0.9 * pr / (0.68 + 1.134 * pr / hang);
    const big = Math.max(a.side, b.side);
    const sc = maxPx / big;                                // px／cm
    // 支柱與底座
    const bg = g.createLinearGradient(cx - 90, 0, cx + 90, 0);
    bg.addColorStop(0, LD.shade(col.wood, -0.25)); bg.addColorStop(0.5, LD.shade(col.wood, 0.12)); bg.addColorStop(1, LD.shade(col.wood, -0.3));
    g.fillStyle = LD.shadowInk(col.dark ? 0.4 : 0.15); g.beginPath(); g.ellipse(cx + 4, baseY + 14, 120, 8, 0, 0, 7); g.fill();
    LD.block(g, cx - 110, baseY, 220, 16, col.wood, { r: 5 });
    const pg = g.createLinearGradient(cx - 8, 0, cx + 8, 0);
    pg.addColorStop(0, LD.shade(col.brass, -0.3)); pg.addColorStop(0.45, LD.shade(col.brass, 0.4)); pg.addColorStop(1, LD.shade(col.brass, -0.35));
    g.fillStyle = pg; g.fillRect(cx - 6, pivY, 12, baseY - pivY);
    // 指針與刻度
    const scY = baseY - 18, needleL = scY - pivY - 10;
    g.strokeStyle = LD.alpha(col.text, 0.5); g.lineWidth = 1;
    for (let k = -5; k <= 5; k++) {
      const th = k * 0.05, x1 = cx + Math.sin(th) * (needleL + 4), y1 = pivY + Math.cos(th) * (needleL + 4);
      const x2 = cx + Math.sin(th) * (needleL + (k === 0 ? 14 : 9)), y2 = pivY + Math.cos(th) * (needleL + (k === 0 ? 14 : 9));
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }
    g.strokeStyle = Math.abs(beam) < 0.004 ? col.probe : col.pos; g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx, pivY); g.lineTo(cx - Math.sin(beam) * needleL, pivY + Math.cos(beam) * needleL); g.stroke();
    // 橫樑
    const ca = Math.cos(beam), sa = Math.sin(beam);
    const ends = [[cx - Lb * ca, pivY - Lb * sa], [cx + Lb * ca, pivY + Lb * sa]];
    g.save(); g.translate(cx, pivY); g.rotate(beam);
    const bmg = g.createLinearGradient(0, -6, 0, 6);
    bmg.addColorStop(0, LD.shade(col.brass, 0.45)); bmg.addColorStop(0.5, col.brass); bmg.addColorStop(1, LD.shade(col.brass, -0.4));
    g.fillStyle = bmg; LD.roundRect(g, -Lb - 6, -5, 2 * Lb + 12, 10, 5); g.fill();
    g.strokeStyle = LD.alpha(LD.shade(col.brass, -0.6), 0.6); g.lineWidth = 1; g.stroke();
    g.restore();
    LD.ball(g, cx, pivY, 7, col.brass, { glow: 0 });
    // 兩個秤盤
    [[a, ends[0], col.neg, 'A'], [b, ends[1], col.pos, 'B']].forEach(function (q) {
      const s = q[0], e = q[1], px = e[0], py = e[1] + hang;
      g.strokeStyle = LD.alpha(col.text, 0.45); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(e[0], e[1]); g.lineTo(px - pr * 0.9, py); g.moveTo(e[0], e[1]); g.lineTo(px + pr * 0.9, py); g.stroke();
      LD.ball(g, e[0], e[1], 4, col.steel, { glow: 0 });
      // 盤子
      const dg = g.createLinearGradient(0, py - 4, 0, py + 10);
      dg.addColorStop(0, LD.shade(col.steel, 0.5)); dg.addColorStop(1, LD.shade(col.steel, -0.3));
      g.fillStyle = dg; g.beginPath(); g.ellipse(px, py + 2, pr, 9, 0, 0, Math.PI); g.lineTo(px - pr, py + 2); g.fill();
      g.fillStyle = LD.shade(col.steel, 0.25); g.beginPath(); g.ellipse(px, py + 2, pr, 5, 0, 0, 7); g.fill();
      g.strokeStyle = LD.alpha(q[2], 0.8); g.lineWidth = 2; g.beginPath(); g.ellipse(px, py + 2, pr, 5, 0, 0, 7); g.stroke();
      // 樣品立方體（依比例）
      const side = Math.max(0, s.side * sc);
      const box = cube(g, px, py + 1, side, C.SUB[s.id]);
      const tiny = side < 2.5;
      // 標籤（放在秤盤下方）：A／B、化學式、質量
      const sub = C.SUB[s.id];
      g.font = font(15, 800); const wl = g.measureText(q[3] + '  ').width;
      g.font = font(14, 700);
      let wf = 0; sub.f.split(/(\d+)/).filter(Boolean).forEach(function (t) { g.font = /^\d/.test(t) ? font(14 * 0.72, 700) : font(14, 700); wf += g.measureText(t).width; });
      const lx = px - (wl + wf) / 2, ly = py + 30;
      LD.haloText(g, q[3], lx, ly, q[2], 'left', 'alphabetic', font(15, 800));
      formula(g, sub.f, lx + wl, ly, col.text, 14, 'left', 700);
      LD.pill(g, sigf(s.m, 4) + ' g' + (tiny ? T('（實際更小）', ' (even smaller)') : ''), px, ly + 22, q[2], 'center', font(12, 600));
    });
    // 狀態
    const dm = b.m - a.m;
    const txt = Math.abs(dm) <= 0.01 ? T('平衡', 'Level') : (dm > 0 ? T('右盤重 ', 'Right heavier by ') : T('左盤重 ', 'Left heavier by ')) + sigf(Math.abs(dm), 3) + ' g';
    LD.pill(g, txt, cx, pad + fsz(18), Math.abs(dm) <= 0.01 ? col.probe : col.text, 'center', font(13, 700));
    // 粒子數比
    const rN = b.N / a.N;
    const rTxt = T('粒子數 B ÷ A = ', 'Particles B ÷ A = ') + sigf(rN, 4);
    LD.haloText(g, rTxt, cx, pad + fsz(18) + fsz(20), col.muted, 'center', 'alphabetic', font(12, 600));
    // 比例尺
    const nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200];
    let L = nice[0];
    for (let i = 0; i < nice.length; i++) if (nice[i] * sc <= cw * 0.22) L = nice[i];
    const sx = pad, sy = ch - pad - 4, lw = L * sc;
    g.strokeStyle = col.text; g.lineWidth = 2;
    g.beginPath(); g.moveTo(sx, sy - 5); g.lineTo(sx, sy); g.lineTo(sx + lw, sy); g.lineTo(sx + lw, sy - 5); g.stroke();
    LD.haloText(g, (L >= 1 ? num(L, 0) : num(L, 1)) + ' cm', sx + lw + 6, sy, col.text, 'left', 'alphabetic', font(12, 600));
    LD.haloText(g, T('樣品畫成實際體積的立方體', 'Samples drawn as cubes of their real volume'), cw - pad, sy, col.muted, 'right', 'alphabetic', font(11));
    return { a: a, b: b };
  }

  // ======================= 放大到原子 =======================
  const sprites = {};
  function sprite(color) {
    const key = color + (col.dark ? 'd' : 'l');
    if (sprites[key]) return sprites[key];
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(46, 44, 6, 64, 64, 62);
    gr.addColorStop(0, LD.shade(color, 0.65)); gr.addColorStop(0.45, color); gr.addColorStop(1, LD.shade(color, -0.45));
    g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 61, 0, 7); g.fill();
    g.strokeStyle = LD.alpha(LD.shade(color, -0.6), 0.6); g.lineWidth = 2; g.stroke();
    sprites[key] = c;
    return c;
  }
  function atom(g, x, y, r, color) {
    if (r < 1.2) { g.fillStyle = color; g.fillRect(x - 1, y - 1, 2, 2); return; }
    g.drawImage(sprite(color), x - r, y - r, 2 * r, 2 * r);
  }
  // 水：一層分子的排列（六角格加亂數位移，週期性拼貼）
  const WT = (function () {
    const n = C.countInCube(C.ZOOM.H2O, 1);          // 每 nm³
    const dens2 = Math.pow(n, 2 / 3);                 // 一層的面密度 nm⁻²
    const a = Math.sqrt(2 / (Math.sqrt(3) * dens2));
    const m = 12, k = 14, W = m * a, H = k * a * Math.sqrt(3) / 2;
    const pts = [];
    let q = 1;
    for (let j = 0; j < k; j++) for (let i = 0; i < m; i++) {
      pts.push([(i + (j % 2) * 0.5) * a + 0.065 * C.hashU(q, 41), j * a * Math.sqrt(3) / 2 + 0.065 * C.hashU(q, 43), Math.PI * C.hashU(q, 47)]);
      q++;
    }
    return { W: W, H: H, pts: pts };
  })();
  const REFS = [
    { s: 5e5, zh: '細沙一粒', en: 'Grain of fine sand', shape: 'sand' },
    { s: 7e4, zh: '頭髮的粗細', en: 'Width of a hair', shape: 'hair' },
    { s: 7.5e3, zh: '紅血球', en: 'Red blood cell', shape: 'rbc' },
    { s: 2e3, zh: '大腸桿菌', en: 'E. coli bacterium', shape: 'bac' },
    { s: 1.2e2, zh: '流感病毒', en: 'Influenza virus', shape: 'virus' },
    { s: 6, zh: '血紅素分子', en: 'Haemoglobin molecule', shape: 'prot' }
  ];
  function smooth(e0, e1, x) { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
  function particles(g, z, L, S, ox, oy, clipSide) {
    // 畫邊長 L（nm）的視野；S 是視野的像素寬；只畫邊長 clipSide（nm）的正方形內（對切時）
    const k = S / L, half = Math.min(L, clipSide) / 2;
    const inV = function (x, y) { return Math.abs(x) <= half && Math.abs(y) <= half; };
    if (z.lattice) {
      const st = z.lattice / 2, n = Math.ceil(half / st) + 1;
      for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
        const x = i * st, y = j * st;
        if (!inV(x, y)) continue;
        if (z.type === 'fcc') { if ((i + j) & 1) continue; atom(g, ox + x * k, oy + y * k, z.r * k, ATOMC[z.id]); }
        else { const na = !((i + j) & 1); atom(g, ox + x * k, oy + y * k, (na ? z.rNa : z.rCl) * k, na ? ATOMC.Na : ATOMC.Cl); }
      }
      return;
    }
    // 水
    const rO = 0.15 * k, rH = 0.1 * k, bond = 0.0958 * k, ang = 104.5 / 2 * Math.PI / 180;
    const i0 = Math.floor(-half / WT.W) - 1, i1 = Math.ceil(half / WT.W), j0 = Math.floor(-half / WT.H) - 1, j1 = Math.ceil(half / WT.H);
    const lone = clipSide < 0.5;   // 只剩一個分子
    for (let tj = j0; tj <= j1; tj++) for (let ti = i0; ti <= i1; ti++) {
      for (let q = 0; q < WT.pts.length; q++) {
        const p = WT.pts[q];
        let x = p[0] - WT.pts[0][0] + ti * WT.W, y = p[1] - WT.pts[0][1] + tj * WT.H;   // 讓一個分子正好在視野中央
        if (lone) { if (q || ti || tj) continue; x = 0; y = 0; }
        if (!lone && !inV(x, y)) continue;
        const px = ox + x * k, py = oy + y * k, th = p[2];
        if (rO < 1.2) { g.fillStyle = ATOMC.O; g.fillRect(px - 1, py - 1, 2, 2); continue; }
        atom(g, px, py, rO, ATOMC.O);   // 空間填充：氫在氧的前面（像兩個耳朵）
        atom(g, px + Math.cos(th - ang) * bond, py + Math.sin(th - ang) * bond, rH, ATOMC.H);
        atom(g, px + Math.cos(th + ang) * bond, py + Math.sin(th + ang) * bond, rH, ATOMC.H);
      }
    }
  }
  function refShape(g, r, cx, cy, size, alphaV) {
    g.save();
    g.globalAlpha = alphaV;
    g.strokeStyle = col.dark ? '#ffd9a8' : '#7a3b14'; g.fillStyle = LD.alpha(col.dark ? '#ffb46b' : '#d9822b', 0.18); g.lineWidth = 1.6;
    const R = size / 2;
    if (r.shape === 'hair') { g.beginPath(); g.rect(cx - R, cy - 4000, size, 8000); g.fill(); g.stroke(); }
    else if (r.shape === 'rbc') { g.beginPath(); g.ellipse(cx, cy, R, R * 0.92, 0.3, 0, 7); g.fill(); g.stroke(); g.beginPath(); g.ellipse(cx, cy, R * 0.45, R * 0.4, 0.3, 0, 7); g.stroke(); }
    else if (r.shape === 'bac') { g.beginPath(); LD.roundRect(g, cx - R, cy - R * 0.22, size, R * 0.44, R * 0.22); g.fill(); g.stroke(); }
    else if (r.shape === 'virus') {
      g.beginPath(); g.arc(cx, cy, R * 0.8, 0, 7); g.fill(); g.stroke();
      for (let i = 0; i < 16; i++) { const t = i * Math.PI / 8; g.beginPath(); g.moveTo(cx + Math.cos(t) * R * 0.8, cy + Math.sin(t) * R * 0.8); g.lineTo(cx + Math.cos(t) * R, cy + Math.sin(t) * R); g.stroke(); }
    } else if (r.shape === 'sand') {
      g.beginPath();
      for (let i = 0; i < 9; i++) { const t = i * Math.PI * 2 / 9, rr = R * (0.8 + 0.2 * C.hashU(i, 53)); g.lineTo(cx + Math.cos(t) * rr, cy + Math.sin(t) * rr); }
      g.closePath(); g.fill(); g.stroke();
    } else { g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill(); g.stroke(); }
    g.restore();
  }
  function texture(g, x0, y0, S, L, c) {
    // 連續的物質：顏色＋淡淡的漲落紋理（每 10 倍放大重複一次，交叉淡入淡出）
    const lg = Math.log10(L), fr = lg - Math.floor(lg);
    g.fillStyle = c; g.fillRect(x0, y0, S, S);
    [0, 1].forEach(function (j) {
      const w = j ? fr : 1 - fr, sc = Math.pow(10, j ? fr - 1 : fr);   // 紋理大小隨放大倍率連續變化
      g.fillStyle = LD.alpha('#ffffff', 0.05 * w);
      for (let i = 0; i < 40; i++) {
        const u = (C.hashU(i + j * 97, 61) + 1) / 2, v = (C.hashU(i + j * 97, 67) + 1) / 2;
        g.beginPath(); g.arc(x0 + u * S, y0 + v * S, S * 0.09 / sc * 0.35, 0, 7); g.fill();
      }
    });
  }
  function drawZoom(g) {
    const narrow = cw < 560, pad = narrow ? 10 : 16;
    const ladW = narrow ? 64 : 104;
    const S = Math.min(ch - 2 * pad - fsz(14) * 2.4, cw - ladW - 3 * pad);
    const x0 = pad, y0 = pad + fsz(14) * 2.2, ox = x0 + S / 2, oy = y0 + S / 2;
    const z = zSub(), L = zL(), cuts = zCuts();
    const piece = cuts > 0 ? pieceSide() : Infinity;
    const V0 = zV0(), samp = z.id === 'H2O' ? Math.cbrt(6 * V0 / Math.PI) * 1e7 : Math.cbrt(V0) * 1e7;   // 水滴直徑、小塊邊長（nm）
    const mc = MAT[z.id];
    // 視窗
    g.save();
    LD.roundRect(g, x0, y0, S, S, 12); g.clip();
    const bgc = col.dark ? '#0e1417' : '#eef2f2';
    g.fillStyle = bgc; g.fillRect(x0, y0, S, S);
    const k = S / L;
    const aAtom = smooth(14, 6, L);                       // 原子出現
    if (cuts > 0) {
      // 對切後剩下的一小塊
      const side = piece * k;
      if (aAtom < 1) {
        g.globalAlpha = 1 - aAtom;
        texture(g, ox - side / 2, oy - side / 2, side, piece, mc);
        g.strokeStyle = LD.alpha(LD.shade(mc, -0.5), 0.7); g.lineWidth = 1; g.strokeRect(ox - side / 2, oy - side / 2, side, side);
        g.globalAlpha = 1;
      }
      if (aAtom > 0) { g.globalAlpha = aAtom; particles(g, z, L, S, ox, oy, piece); g.globalAlpha = 1; }
      if (C.countInVolume(z, pieceVol()) < 1) {
        // 不到一個：切掉的那一半變淡，畫出刀痕
        g.fillStyle = LD.alpha(bgc, 0.82); g.fillRect(ox, y0, S, S);
        g.setLineDash([7, 5]); g.strokeStyle = col.pos; g.lineWidth = 2;
        g.beginPath(); g.moveTo(ox, y0 + 8); g.lineTo(ox, y0 + S - 8); g.stroke(); g.setLineDash([]);
      }
    } else {
      const inside = smooth(samp * 0.9, samp * 0.5, L);   // 視野比樣品小：在物質裡面
      if (inside < 1) {
        // 整個樣品：桌面上的一滴或一小塊
        const side = samp * k;
        g.fillStyle = col.dark ? '#1b2428' : '#dde3e3'; g.fillRect(x0, oy + side * 0.35, S, S);
        if (z.id === 'H2O') {
          const R = side / 2, by = oy + side * 0.35;
          g.fillStyle = LD.shadowInk(0.2); g.beginPath(); g.ellipse(ox + 4, by + 2, R * 1.05, R * 0.12, 0, 0, 7); g.fill();
          const dg = g.createRadialGradient(ox - R * 0.35, by - R * 0.75, R * 0.05, ox, by - R * 0.4, R * 1.1);
          dg.addColorStop(0, 'rgba(255,255,255,0.9)'); dg.addColorStop(0.25, LD.alpha(mc, 0.55)); dg.addColorStop(1, LD.alpha(LD.shade(mc, -0.35), 0.85));
          g.fillStyle = dg; g.beginPath(); g.ellipse(ox, by, R, R * 0.85, 0, Math.PI, 0); g.closePath(); g.fill();
          g.strokeStyle = LD.alpha(LD.shade(mc, -0.4), 0.7); g.lineWidth = 1.2; g.stroke();
        } else {
          cube(g, ox - side * 0.1, oy + side * 0.5, side * 0.85, C.SUB[z.id]);
        }
        refs(g, ox, oy, L, k, 1 - inside, S);
      }
      if (inside > 0) {
        g.globalAlpha = inside * (1 - aAtom);
        texture(g, x0, y0, S, L, mc);
        g.globalAlpha = 1;
        if (aAtom > 0) { g.globalAlpha = aAtom * inside; particles(g, z, L, S, ox, oy, Infinity); g.globalAlpha = 1; }
        refs(g, ox, oy, L, k, inside * (1 - aAtom * 0.7), S);
      }
    }
    g.restore();
    g.strokeStyle = LD.alpha(col.text, 0.35); g.lineWidth = 1.5; LD.roundRect(g, x0, y0, S, S, 12); g.stroke();
    // 比例尺（視野寬的 1/4 左右的漂亮數字）
    const nice = function (v) { const e = Math.pow(10, Math.floor(Math.log10(v))); const f = v / e; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * e; };
    const bar = nice(L * 0.3), bw = bar * k, by2 = y0 + S - 14;
    g.strokeStyle = col.dark ? '#ffffff' : '#1d2a30'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(x0 + 14, by2 - 5); g.lineTo(x0 + 14, by2); g.lineTo(x0 + 14 + bw, by2); g.lineTo(x0 + 14 + bw, by2 - 5); g.stroke();
    LD.pill(g, lenStr(bar, 2), x0 + 18 + bw, by2 + 4, col.text, 'left', font(12, 600));
    // 上方：視野裡的粒子數
    const N = cuts > 0 ? C.countInVolume(z, pieceVol()) : C.countInCube(z, L);
    const lab = cuts > 0 ? T('剩下的一塊：', 'Piece left: ') : T('視野（邊長 L 的立方體）中：', 'In view (a cube of side L): ');
    const zz = C.SUB[z.id];
    if (N >= 1e4 || N < 0.01) sciText(g, x0, lab + T('約 ', 'about '), ' ' + kindName(zz, true), pad + fsz(14), col.text, 13, 'left', 3)(N);
    else LD.haloText(g, lab + T('約 ', 'about ') + sigf(N, 3) + ' ' + kindName(zz, true), x0, pad + fsz(14), col.text, 'left', 'alphabetic', font(13, 600));
    if (aAtom > 0.3 && !(cuts > 0 && N < 1)) LD.haloText(g, T('畫面是一層原子的切面', 'Picture: a slice one atom thick'), x0 + S - 10, y0 + 18, col.muted, 'right', 'alphabetic', font(11));
    if (cuts > 0 && N < 1) LD.pill(g, T('不到一個：已經不是', 'Less than one: no longer ') + T(zz.zh, zz.en.toLowerCase()) + T('了', ''), ox, oy - S * 0.3, col.pos, 'center', font(13, 700));
    // 右側：數量級階梯
    ladder(g, x0 + S + pad, y0, ladW, S, L);
    // 寬螢幕：右邊的說明卡
    let ix = x0 + S + pad + ladW + pad, iy = y0 + 18;
    const below = cw - ix - pad < 210;
    if (below) { ix = x0; iy = y0 + S + fsz(13) * 2; }   // 窄螢幕：放在視窗下面
    if (!below || ch - iy >= fsz(13) * 1.7 * 8) {
      const N0 = C.countInVolume(z, V0), d = C.spacing(z), f = font(13, 600), lh = fsz(13) * (below ? 1.6 : 1.9);
      let yy = iy;
      const line = function (s, color, ff) { LD.haloText(g, s, ix, yy, color || col.text, 'left', 'alphabetic', ff || f); yy += lh; };
      line(T(zz.zh, zz.en) + ' ' + sigf(V0, 3) + ' mL' + T(z.id === 'H2O' ? '（一滴）' : '（一小塊）', z.id === 'H2O' ? ' (a drop)' : ' (a small piece)'), col.text, font(14, 700));
      sciText(g, ix, T('共約 ', 'about '), ' ' + kindName(zz, true), yy, col.accent, 13, 'left', 3)(N0); yy += lh * 1.3;
      line(T('每個粒子平均分到的空間', 'Space for each particle'), col.muted, font(12, 600));
      line(T('邊長 d ≈ ', 'a cube of side d ≈ ') + num(d, 3) + ' nm');
      yy += lh * 0.3;
      const zoomMore = L / d;
      if (cuts === 0) {
        line(T('要只看到一個，視野還要再縮小', 'To see just one, shrink the view'), col.muted, font(12, 600));
        if (zoomMore > 1.05) sciText(g, ix, T('約 ', 'by about '), T(' 倍', ' times'), yy, col.text, 13, 'left', 2)(zoomMore);
        else LD.haloText(g, T('已經到了！', 'You are there!'), ix, yy, col.probe, 'left', 'alphabetic', font(13, 700));
        yy += lh * 1.3;
      }
      line(T('一直對切，最多 ', 'At most ') + C.maxCuts(N0) + T(' 刀就只剩一個', ' halvings leave one'), col.muted, font(12, 600));
    }
  }
  function refs(g, ox, oy, L, k, a, S) {
    if (a <= 0.02) return;
    REFS.forEach(function (r) {
      const f = r.s / L;
      if (f < 0.12 || f > 1.3) return;
      const al = a * Math.min(1, (f - 0.12) / 0.15, (1.3 - f) / 0.3);
      if (al <= 0.02) return;
      const cx = ox + S * 0.18, cy = oy - S * 0.12;
      refShape(g, r, cx, cy, r.s * k, al * 0.9);
      g.save(); g.globalAlpha = al;
      LD.pill(g, T(r.zh, r.en) + ' ' + lenStr(r.s, 2), cx, cy - Math.min(r.s * k * 0.5, S * 0.32) - 6, col.dark ? '#ffd9a8' : '#7a3b14', 'center', font(11, 600));
      g.restore();
    });
  }
  function ladder(g, x, y, w, H, L) {
    const top = y + 6, bot = y + H - 6, lx = x + 8;
    const ly = function (lg) { return top + (ZL1 - lg) / (ZL1 - ZL0) * (bot - top); };
    g.strokeStyle = LD.alpha(col.text, 0.4); g.lineWidth = 2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(lx, top); g.lineTo(lx, bot); g.stroke();
    const labels = [[7, '1 cm'], [6, '1 mm'], [5, '100 µm'], [4, '10 µm'], [3, '1 µm'], [2, '100 nm'], [1, '10 nm'], [0, '1 nm'], [-1, '0.1 nm']];
    labels.forEach(function (q) {
      const yy = ly(q[0]);
      g.strokeStyle = LD.alpha(col.text, 0.5); g.lineWidth = 1;
      g.beginPath(); g.moveTo(lx - 4, yy); g.lineTo(lx + 4, yy); g.stroke();
      LD.haloText(g, q[1], lx + 8, yy + 4, col.muted, 'left', 'alphabetic', font(w < 80 ? 10 : 11));
    });
    const yy = ly(Math.log10(L));
    g.fillStyle = col.accent;
    g.beginPath(); g.moveTo(lx - 2, yy); g.lineTo(lx - 10, yy - 6); g.lineTo(lx - 10, yy + 6); g.closePath(); g.fill();
    LD.ball(g, lx, yy, 5, col.accent, { glow: 0 });
  }

  // ======================= 油膜法 =======================
  let filmGeo = null;
  function filmLayout() {
    const narrow = cw < 560, pad = narrow ? 10 : 16;
    const side = narrow ? 0 : 130;
    let tw = cw - 2 * pad - side - (side ? pad : 0);
    let th = tw * C.TRAY.H / C.TRAY.W;
    const maxH = narrow ? ch * 0.62 : ch - 2 * pad - 40;
    if (th > maxH) { th = maxH; tw = th * C.TRAY.W / C.TRAY.H; }
    const x0 = pad + (narrow ? (cw - 2 * pad - tw) / 2 : 0), y0 = pad + 26;
    return { narrow: narrow, pad: pad, x0: x0, y0: y0, tw: tw, th: th, k: tw / C.TRAY.W, sx: narrow ? pad : x0 + tw + pad, sy: narrow ? y0 + th + 16 : y0, sw: narrow ? cw - 2 * pad : side, sh: narrow ? ch - (y0 + th + 16) - pad : th };
  }
  function filmPath(g, F, R) {
    const cx = F.x0 + F.tw / 2, cy = F.y0 + F.th / 2;
    g.beginPath();
    const n = 180;
    for (let j = 0; j <= n; j++) {
      const th = 2 * Math.PI * j / n;
      let f = 1; tray.harm.forEach(function (h) { f += h.a * Math.cos(h.k * th + h.p); });
      const r = R * f * F.k;
      const x = cx + r * Math.cos(th), y = cy + r * Math.sin(th);
      if (j) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
  }
  function drawFilm(g, now) {
    const F = filmGeo = filmLayout();
    const x0 = F.x0, y0 = F.y0, tw = F.tw, th = F.th;
    LD.haloText(g, T('水盤（40 cm × 30 cm，從上往下看）', 'Tray (40 cm × 30 cm, seen from above)'), x0, y0 - 9, col.muted, 'left', 'alphabetic', font(12, 600));
    // 盤子
    g.fillStyle = LD.shadowInk(col.dark ? 0.4 : 0.16); LD.roundRect(g, x0 + 3, y0 + 5, tw + 6, th + 6, 10); g.fill();
    LD.roundRect(g, x0 - 5, y0 - 5, tw + 10, th + 10, 10); g.fillStyle = col.dark ? '#3b444a' : '#e8ecef'; g.fill();
    g.strokeStyle = LD.alpha(col.text, 0.3); g.lineWidth = 1; g.stroke();
    g.save(); g.beginPath(); g.rect(x0, y0, tw, th); g.clip();
    const wg = g.createLinearGradient(x0, y0, x0 + tw, y0 + th);
    wg.addColorStop(0, LD.shade(col.water, 0.12)); wg.addColorStop(1, LD.shade(col.water, -0.12));
    g.fillStyle = wg; g.fillRect(x0, y0, tw, th);
    // 油膜的半徑（動畫中慢慢推開）
    let R = tray.R;
    if (filmAnim) {
      const u = Math.min(1, (now - filmAnim.t0) / 900);
      R = filmAnim.r0 + (filmAnim.r1 - filmAnim.r0) * (1 - Math.pow(1 - u, 3));
      if (u >= 1) filmAnim = null;
    }
    // 粉：撒在水面上，油膜推開的地方沒有粉
    if (tray.powder !== 'none') {
      g.save();
      if (tray.drops) { g.beginPath(); g.rect(x0, y0, tw, th); filmPath(g, F, R); g.clip('evenodd'); }
      const dens = tray.powder === 'thick' ? 1 : 0.45;
      g.fillStyle = LD.alpha(col.powder, tray.powder === 'thick' ? 0.55 : 0.32); g.fillRect(x0, y0, tw, th);
      g.fillStyle = LD.alpha(col.powder, 0.85);
      const n = Math.round(1400 * dens * (tw * th) / 160000);
      for (let i = 0; i < n; i++) {
        const u = (C.hashU(i, 71) + 1) / 2, v = (C.hashU(i, 73) + 1) / 2;
        g.fillRect(x0 + u * tw, y0 + v * th, 1.6, 1.6);
      }
      g.restore();
      if (tray.drops) {   // 油膜邊緣堆起來的粉
        filmPath(g, F, R);
        g.strokeStyle = LD.alpha(col.powder, 0.95); g.lineWidth = 2.2; g.stroke();
        g.strokeStyle = LD.alpha(col.dark ? '#000000' : '#6b8796', 0.25); g.lineWidth = 0.8; g.stroke();
      }
    } else if (tray.drops) {
      filmPath(g, F, R);
      g.fillStyle = LD.alpha('#ffffff', 0.04); g.fill();   // 幾乎看不到
    }
    // 數到的格子
    if (lastCount && !filmAnim) {
      const s = lastCount.s * F.k;
      lastCount.cells.forEach(function (c) {
        if (!c[3]) return;
        g.fillStyle = LD.alpha(col.accent, c[2] >= 1 ? 0.2 : 0.38);
        g.fillRect(x0 + c[0] * s, y0 + c[1] * s, s, s);
      });
    }
    // 玻璃板上的格子
    const s = state.grid * F.k;
    g.strokeStyle = LD.alpha(col.dark ? '#ffffff' : '#1d3a48', s < 6 ? 0.12 : 0.18); g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= C.TRAY.W + 1e-9; x += state.grid) { const X = Math.round(x0 + x * F.k) + 0.5; g.moveTo(X, y0); g.lineTo(X, y0 + th); }
    for (let y = 0; y <= C.TRAY.H + 1e-9; y += state.grid) { const Y = Math.round(y0 + y * F.k) + 0.5; g.moveTo(x0, Y); g.lineTo(x0 + tw, Y); }
    g.stroke();
    g.strokeStyle = LD.alpha(col.dark ? '#ffffff' : '#1d3a48', 0.32);
    g.beginPath();
    for (let x = 0; x <= C.TRAY.W + 1e-9; x += 5) { const X = Math.round(x0 + x * F.k) + 0.5; g.moveTo(X, y0); g.lineTo(X, y0 + th); }
    for (let y = 0; y <= C.TRAY.H + 1e-9; y += 5) { const Y = Math.round(y0 + y * F.k) + 0.5; g.moveTo(x0, Y); g.lineTo(x0 + tw, Y); }
    g.stroke();
    // 滴下的動畫
    if (dropFx) {
      const u = (now - dropFx.t0) / 700;
      const cx = x0 + tw / 2, cy = y0 + th / 2;
      if (u < 0.5) { const yy = y0 + (cy - y0) * (u / 0.5); LD.ball(g, cx, yy, 4, col.accent, { glow: 0 }); }
      else LD.ripple(g, cx, cy, 6, (u - 0.5) / 0.5, '#ffffff');
      if (u >= 1) dropFx = null;
    }
    g.restore();
    // 盤上的說明
    const info = tray.drops ? T('盤中已滴 ', 'Drops in tray: ') + tray.drops + T(' 滴', '') : T('先「滴一滴」油酸酒精溶液', 'Press “Add a drop”');
    LD.pill(g, info, x0 + 8, y0 + 26, col.text, 'left', font(12, 600));
    if (tray.drops && C.touches(tray)) LD.pill(g, T('油膜碰到盤邊了！', 'The film reaches the side!'), x0 + tw - 8, y0 + 26, col.pos, 'right', font(12, 700));
    if (tray.drops && tray.powder === 'none') LD.pill(g, T('沒撒粉：看不到油膜的邊界', 'No powder: the edge of the film is invisible'), x0 + tw / 2, y0 + th - 8, col.pos, 'center', font(12, 700));
    if (lastCount && !filmAnim) LD.pill(g, T('數到 ', 'Counted ') + lastCount.count + T(' 格 → ', ' squares → ') + sigf(lastCount.area, 4) + ' cm²', x0 + tw / 2, y0 + th - (tray.powder === 'none' ? 34 : 8), col.accent, 'center', font(12, 700));
    drawSide(g, F, now);
  }
  let dropFx = null;
  /** 側邊：滴管與量筒（校正） */
  function drawSide(g, F, now) {
    const x = F.sx, y = F.sy, w = F.sw, h = F.sh;
    if (w < 60 || h < 60) return;
    // 量筒（10 mL）
    const cylW = Math.min(36, w * 0.28), cylH = Math.min(h - 40, F.narrow ? h - 34 : 230);
    const cx = F.narrow ? x + w * 0.62 : x + w * 0.6, cyTop = y + 22, cyBot = cyTop + cylH;
    let level = 0, count = null, vcal = null;
    const cal = cals[state.dropper];
    if (calAnim) {
      const u = Math.min(1, (now - calAnim.t0) / 1600);
      level = calAnim.Vcal * u; count = Math.round(calAnim.count * u); vcal = calAnim.Vcal;
      if (u >= 1) calAnim = null;
    } else if (cal) { level = cal.Vcal; count = cal.count; vcal = cal.Vcal; }
    const capV = 10, vy = function (v) { return cyBot - 6 - (cylH - 14) * v / capV; };
    // 液體
    if (level > 0) {
      const lg = g.createLinearGradient(cx - cylW / 2, 0, cx + cylW / 2, 0);
      lg.addColorStop(0, LD.alpha('#f1e3a2', 0.55)); lg.addColorStop(0.5, LD.alpha('#fff4c4', 0.75)); lg.addColorStop(1, LD.alpha('#e8d68c', 0.55));
      g.fillStyle = lg; g.fillRect(cx - cylW / 2 + 2, vy(level), cylW - 4, cyBot - 2 - vy(level));
      g.strokeStyle = LD.alpha('#b89a2e', 0.9); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(cx - cylW / 2 + 2, vy(level) - 2); g.quadraticCurveTo(cx, vy(level) + 3, cx + cylW / 2 - 2, vy(level) - 2); g.stroke();
    }
    // 玻璃與刻度
    g.strokeStyle = LD.alpha(col.glass, 0.95); g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx - cylW / 2, cyTop); g.lineTo(cx - cylW / 2, cyBot); g.lineTo(cx + cylW / 2, cyBot); g.lineTo(cx + cylW / 2, cyTop); g.stroke();
    g.fillStyle = LD.alpha('#ffffff', col.dark ? 0.06 : 0.3); g.fillRect(cx - cylW / 2 + 3, cyTop, 3, cylH - 4);
    g.strokeStyle = LD.alpha(col.text, 0.5); g.lineWidth = 1;
    for (let v = 1; v <= 10; v++) {
      const yy = Math.round(vy(v)) + 0.5;
      g.beginPath(); g.moveTo(cx - cylW / 2, yy); g.lineTo(cx - cylW / 2 + (v % 5 ? 6 : 11), yy); g.stroke();
      if (v % 5 === 0 || v <= 2) LD.haloText(g, String(v), cx + cylW / 2 + 4, yy + 4, col.muted, 'left', 'alphabetic', font(10));
    }
    if (vcal) { g.strokeStyle = col.accent; g.setLineDash([3, 2]); g.beginPath(); g.moveTo(cx - cylW / 2 - 6, vy(vcal)); g.lineTo(cx + cylW / 2 + 2, vy(vcal)); g.stroke(); g.setLineDash([]); }
    LD.haloText(g, T('量筒', 'Cylinder') + ' 10 mL', cx, cyTop - 8, col.muted, 'center', 'alphabetic', font(11, 600));
    // 滴管
    const dx = F.narrow ? x + w * 0.08 : x + w * 0.18, dTop = y + 6;
    const tip = state.dropper === 'fine' ? 1.5 : state.dropper === 'mid' ? 2.5 : 3.8;
    const bulb = g.createRadialGradient(dx - 4, dTop + 10, 2, dx, dTop + 14, 14);
    bulb.addColorStop(0, '#ff8a7a'); bulb.addColorStop(1, '#b8332a');
    g.fillStyle = bulb; LD.roundRect(g, dx - 9, dTop, 18, 26, 9); g.fill();
    g.fillStyle = LD.alpha(col.glass, 0.35); g.strokeStyle = LD.alpha(col.glass, 0.95); g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(dx - 5, dTop + 24); g.lineTo(dx + 5, dTop + 24); g.lineTo(dx + tip / 2, dTop + 86); g.lineTo(dx - tip / 2, dTop + 86); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = LD.alpha('#fff4c4', 0.8); g.fillRect(dx - 3.5, dTop + 40, 7, 30);
    LD.haloText(g, state.dropper === 'fine' ? T('細口', 'Fine') : state.dropper === 'mid' ? T('一般', 'Standard') : T('粗口', 'Wide'), dx, dTop + 104, col.muted, 'center', 'alphabetic', font(11, 600));
    // 校正結果
    const ty = F.narrow ? y + 44 : cyBot + 26, tx = F.narrow ? x + w * 0.17 : x;   // 窄螢幕放在滴管與量筒之間，寬螢幕放在量筒下面
    if (count != null) {
      LD.haloText(g, vcal + ' mL = ' + count + T(' 滴', ' drops'), tx, ty, col.text, 'left', 'alphabetic', font(12, 700));
      if (!calAnim && cal) LD.haloText(g, T('每滴 ', 'per drop ') + sigf(cal.v, 3) + ' mL', tx, ty + 17, col.accent, 'left', 'alphabetic', font(12, 600));
    } else {
      LD.haloText(g, T('還沒校正', 'Not calibrated'), tx, ty, col.muted, 'left', 'alphabetic', font(12, 600));
      LD.haloText(g, T('標示：1 mL ≈ 50 滴', 'Label: 1 mL ≈ 50 drops'), tx, ty + 17, col.muted, 'left', 'alphabetic', font(11));
    }
  }

  // ======================= 主畫面 =======================
  function draw(now) {
    now = now || performance.now();
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(g, cw, ch);
    if (state.mode === 'scale') drawScale(g);
    else if (state.mode === 'zoom') drawZoom(g);
    else drawFilm(g, now);
  }
  function animating() { return state.mode === 'scale' ? Math.abs(beam - beamTo) > 1e-4 : state.mode === 'film' ? !!(filmAnim || calAnim || dropFx) : false; }
  function loop(ts) {
    raf = 0;
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (state.mode === 'scale') {
      if (reducedMotion) beam = beamTo;
      else beam += (beamTo - beam) * Math.min(1, dt * 6);
      if (Math.abs(beam - beamTo) < 1e-4) beam = beamTo;
    }
    draw(performance.now());
    if (animating()) raf = requestAnimationFrame(loop); else { lastTs = 0; if (state.mode === 'film') { updateReadouts(); drawGraph(); } }
  }
  function kick() { if (!raf) { lastTs = 0; raf = requestAnimationFrame(loop); } }

  // ======================= 讀數 =======================
  function updateReadouts() {
    const R = $('readout');
    if (state.mode === 'scale') {
      const a = panSample(pans.A), b = panSample(pans.B), sa = C.SUB[a.id], sb = C.SUB[b.id];
      const row = function (lab, fa, fb) { return '<tr><td>' + lab + '</td><td class="a">' + fa + '</td><td class="b">' + fb + '</td></tr>'; };
      const vol = function (s) { return s.phase === 'g' ? sci(s.V / 1000, 4) + ' L' : sci(s.V, 4) + ' cm³'; };
      R.innerHTML = '<div class="tablewrap" style="margin:0"><table class="data cmp"><thead><tr><th></th><th>A ' + fH(sa.f) + '</th><th>B ' + fH(sb.f) + '</th></tr></thead><tbody>' +
        row(T('質量', 'Mass'), sci(a.m, 4) + ' g', sci(b.m, 4) + ' g') +
        row(T('莫耳質量', 'Molar mass'), num(sa.M, 3) + ' g/mol', num(sb.M, 3) + ' g/mol') +
        row(T('莫耳數', 'Amount'), sci(a.n, 4) + ' mol', sci(b.n, 4) + ' mol') +
        row(T('粒子數', 'Particles'), sci(a.N, 4) + T(' 個', ''), sci(b.N, 4) + T(' 個', '')) +
        row(T('（粒子是）', '(particle)'), kindName(sa), kindName(sb)) +
        row(sa.kind === 'formula' || sb.kind === 'formula' ? T('原子（離子）數', 'Atoms (ions)') : T('原子數', 'Atoms'), sci(a.atoms, 4), sci(b.atoms, 4)) +
        row(T('電子數', 'Electrons'), sci(a.electrons, 4), sci(b.electrons, 4)) +
        row(T('體積', 'Volume'), vol(a), vol(b)) +
        row(T('一個粒子的質量', 'Mass of one particle'), sci(a.mOne, 4) + ' g', sci(b.mOne, 4) + ' g') +
        '</tbody></table></div>' +
        '<p class="hint">' + T('氣體：', 'Gas: ') + T(C.COND[state.cond].zh, C.COND[state.cond].en) + T('，莫耳體積 ', ', molar volume ') + num(C.VM[state.cond], 3) + ' L/mol</p>';
    } else if (state.mode === 'zoom') {
      const z = zSub(), L = zL(), cuts = zCuts(), N0 = C.countInVolume(z, zV0()), zz = C.SUB[z.id];
      const left = N0 / Math.pow(2, cuts), max = C.maxCuts(N0);
      R.innerHTML = '<dl class="readout">' +
        '<dt>' + T('視野邊長 L', 'Field of view L') + '</dt><dd>' + lenStr(L, 4) + '</dd>' +
        '<dt>' + T('視野中的', 'In the view: ') + kindName(zz, true) + '<small>' + T('邊長 L 的立方體', 'a cube of side L') + '</small></dt><dd class="big">' + sci(C.countInCube(z, L), 3) + '</dd>' +
        '<dt>' + T('粒子間距 d', 'Spacing d') + '<small>' + T('每個粒子分到的立方體邊長', 'side of the cube each particle gets') + '</small></dt><dd>' + num(C.spacing(z), 3) + ' nm</dd>' +
        '<dt>' + T('樣品的', 'Sample: ') + kindName(zz, true) + '<small>' + sigf(zV0(), 3) + ' mL</small></dt><dd>' + sci(N0, 4) + '</dd>' +
        '<dt>' + T('切了幾刀', 'Cuts') + '<small>' + T('最多能切 ', 'at most ') + max + T(' 刀', '') + '</small></dt><dd>' + cuts + '</dd>' +
        '<dt>' + T('剩下', 'Left') + '</dt><dd>' + sci(left, 3) + '</dd>' +
        '</dl>';
    } else {
      const cal = cals[state.dropper];
      const v = cal ? cal.v : C.NOMINAL_DROP;
      const Voil = tray.drops * v / tray.D;
      R.innerHTML = '<dl class="readout">' +
        '<dt>' + T('盤中的滴數', 'Drops in the tray') + '</dt><dd>' + tray.drops + '</dd>' +
        '<dt>' + T('每滴體積', 'Volume per drop') + '<small>' + (cal ? T('校正值（', 'calibrated (') + cal.count + T(' 滴 = ', ' drops = ') + cal.Vcal + ' mL)' : T('標示值（還沒校正）', 'label value (not calibrated)')) + '</small></dt><dd>' + sigf(v, 4) + ' mL</dd>' +
        '<dt>' + T('溶液濃度', 'Concentration') + '</dt><dd>1 : ' + tray.D + '</dd>' +
        '<dt>' + T('滴入的油酸體積', 'Oleic acid added') + '</dt><dd>' + sci(Voil, 4) + ' mL</dd>' +
        '<dt>' + T('油膜面積', 'Film area') + '<small>' + (lastCount ? T('數到 ', 'counted ') + lastCount.count + T(' 格（每格 ', ' squares of ') + state.grid + ' cm' + T('）', '') : T('按「量面積」', 'press “Measure area”')) + '</small></dt><dd>' + (lastCount ? sigf(lastCount.area, 4) + ' cm²' : '—') + '</dd>' +
        '<dt>' + T('紀錄', 'Records') + '</dt><dd>' + rows.length + '</dd>' +
        '</dl>';
    }
    updateBig();
  }
  function updateBig() {
    const yrs = C.countYears(C.NA);
    let h = '<dt>' + T('每秒數一個，數完 1 莫耳要', 'Counting one per second, one mole takes') + '</dt><dd>' + sci(yrs, 2) + T(' 年', ' years') + '</dd>' +
      '<dt>' + T('是宇宙年齡（138 億年）的', 'times the age of the Universe (13.8 billion years)') + '</dt><dd>' + sci(yrs / C.UNIVERSE_YEARS, 2) + T(' 倍', '') + '</dd>' +
      '<dt>' + T('1 莫耳的細沙（每粒 1 mm³）鋪滿臺灣', 'One mole of 1 mm³ sand grains spread over Taiwan') + '</dt><dd>' + T('約 ', 'about ') + num(C.NA * 1e-9 / 3.6e10 / 1000, 0) + ' km' + T(' 厚', ' deep') + '</dd>' +
      '<dt>' + T('1 莫耳的水分子排成一列', 'One mole of water molecules in a row') + '</dt><dd>' + sci(C.NA * C.spacing(C.ZOOM.H2O) * 1e-9 / 1.496e11, 3) + ' AU</dd>';
    let N = null, lab = '';
    if (state.mode === 'scale') { N = panSample(pans.A).N; lab = T('左盤的粒子', 'Particles on pan A'); }
    else if (state.mode === 'zoom') { N = C.countInVolume(zSub(), zV0()); lab = T('樣品的粒子', 'Particles in the sample'); }
    else if (tray && tray.drops) { N = tray.Voil * C.OLEIC.rho / C.OLEIC.M * C.NA; lab = T('油膜裡的油酸分子', 'Oleic-acid molecules in the film'); }
    if (N != null) h += '<dt>' + lab + T('，每秒數一個要', ': counting one per second takes') + '</dt><dd>' + sci(C.countYears(N), 3) + T(' 年', ' years') + '</dd>';
    $('bigOut').innerHTML = h;
  }

  // ======================= 圖表 =======================
  function drawGraph() {
    const g = gctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(g, gw, gh);
    if (state.mode === 'scale') graphLineup(g);
    else if (state.mode === 'zoom') graphZoom(g);
    else graphFilm(g);
  }
  function graphLineup(g) {
    const narrow = gw < 560, pad = 12;
    const cond = state.cond, gasSide = Math.cbrt(C.VM[cond] * 1000);
    const list = C.SUBS.filter(function (s) { return s.phase !== 'g'; }).slice().sort(function (a, b) { return a.Vm - b.Vm; });
    const gasW = narrow ? gw * 0.36 : Math.min(gw * 0.3, gh * 0.62);
    const rowsN = narrow ? 2 : 1, perRow = Math.ceil(list.length / rowsN);
    const areaW = gw - 2 * pad - gasW - pad;
    const slot = areaW / perRow;
    const sc = (gasW * 0.72) / gasSide;            // px／cm（氣體立方體正好放得下）
    const labH = 34;
    const rowH = (gh - 2 * pad - 8) / rowsN;
    const ids = [pans.A.id, pans.B.id];
    list.forEach(function (s, i) {
      const r = Math.floor(i / perRow), c = i % perRow;
      const x = pad + slot * (c + 0.5), yb = pad + rowH * (r + 1) - labH;
      cube(g, x, yb, Math.cbrt(s.Vm) * sc, s);
      const hl = ids.indexOf(s.id);
      formula(g, s.f, x, yb + 16, hl === 0 ? col.neg : hl === 1 ? col.pos : col.text, 11, 'center', hl >= 0 ? 800 : 600);
      LD.haloText(g, num(s.M, s.M < 100 ? 1 : 0) + ' g', x, yb + 30, col.muted, 'center', 'alphabetic', font(10.5));
    });
    // 氣體
    const gx = gw - pad - gasW / 2, gyb = gh - pad - labH;
    const gs = ids.map(function (id) { return C.SUB[id]; }).filter(function (s) { return s.phase === 'g'; })[0] || C.SUB.O2;
    cube(g, gx - gasW * 0.08, gyb, gasSide * sc, gs);
    LD.haloText(g, T('任何氣體 ', 'Any gas ') + num(C.VM[cond], 1) + ' L', gx, gyb + 16, col.text, 'center', 'alphabetic', font(11, 700));
    LD.haloText(g, T(cond === 'stp' ? '0 °C、1 atm' : '25 °C、1 atm', cond === 'stp' ? '0 °C, 1 atm' : '25 °C, 1 atm'), gx, gyb + 30, col.muted, 'center', 'alphabetic', font(10.5));
    // 10 cm 比例尺
    const bw = 10 * sc, by = pad + 10;
    g.strokeStyle = col.text; g.lineWidth = 2; g.beginPath(); g.moveTo(gw - pad - bw, by + 5); g.lineTo(gw - pad - bw, by); g.lineTo(gw - pad, by); g.lineTo(gw - pad, by + 5); g.stroke();
    LD.haloText(g, '10 cm', gw - pad - bw - 6, by + 5, col.text, 'right', 'alphabetic', font(11, 600));
    $('gHint').textContent = T('每個立方體都是 1 莫耳（6.022 × 10²³ 個粒子），依實際大小畫；下面是質量。藍色、紅色是天平上的 A、B。', 'Every cube is one mole (6.022 × 10²³ particles), drawn to scale, with its mass below. Blue and red are pans A and B.');
  }
  function graphZoom(g) {
    const pad = 14, X0 = pad + 46, X1 = gw - pad - 8, Y0 = gh - pad - 30, Y1 = pad + 10;
    const xl = [ZL0, ZL1], yl = [-3, 24];
    const sx = function (v) { return X0 + (v - xl[0]) / (xl[1] - xl[0]) * (X1 - X0); };
    const sy = function (v) { return Y0 - (v - yl[0]) / (yl[1] - yl[0]) * (Y0 - Y1); };
    g.strokeStyle = LD.alpha(col.text, col.dark ? 0.1 : 0.08); g.lineWidth = 1;
    for (let v = xl[0]; v <= xl[1]; v++) { g.beginPath(); g.moveTo(Math.round(sx(v)) + 0.5, Y0); g.lineTo(Math.round(sx(v)) + 0.5, Y1); g.stroke(); }
    for (let v = 0; v <= 24; v += 3) { g.beginPath(); g.moveTo(X0, Math.round(sy(v)) + 0.5); g.lineTo(X1, Math.round(sy(v)) + 0.5); g.stroke(); }
    g.strokeStyle = LD.alpha(col.text, 0.55); g.beginPath(); g.moveTo(X0, Y1); g.lineTo(X0, Y0); g.lineTo(X1, Y0); g.stroke();
    for (let v = xl[0]; v <= xl[1]; v += 2) LD.supText(g, '10', String(v).replace('-', '−'), sx(v), Y0 + 16, col.muted, font(11), 'center');
    for (let v = 0; v <= 24; v += 6) LD.supText(g, '10', String(v), X0 - 6, sy(v) + 4, col.muted, font(11), 'right');
    LD.haloText(g, T('視野邊長 L（nm）', 'Field of view L (nm)'), (X0 + X1) / 2, gh - 4, col.muted, 'center', 'alphabetic', font(11, 600));
    g.save(); g.translate(12, (Y0 + Y1) / 2); g.rotate(-Math.PI / 2);
    LD.haloText(g, T('立方體中的粒子數 N', 'Particles N in the cube'), 0, 0, col.muted, 'center', 'middle', font(11, 600)); g.restore();
    // N = 1
    g.setLineDash([5, 4]); g.strokeStyle = LD.alpha(col.pos, 0.7); g.beginPath(); g.moveTo(X0, sy(0)); g.lineTo(X1, sy(0)); g.stroke(); g.setLineDash([]);
    LD.haloText(g, 'N = 1', X1 - 4, sy(0) - 5, col.pos, 'right', 'alphabetic', font(11, 600));
    const cs = { H2O: MAT.H2O, Cu: MAT.Cu, NaCl: col.dark ? '#d8dee4' : '#7c8a96', Au: MAT.Au };
    Object.keys(C.ZOOM).forEach(function (id) {
      const z = C.ZOOM[id];
      g.strokeStyle = cs[id]; g.lineWidth = id === state.zid ? 3 : 1.5; g.globalAlpha = id === state.zid ? 1 : 0.55;
      g.beginPath();
      const a = Math.log10(C.countInCube(z, 1));
      for (let v = xl[0]; v <= xl[1] + 1e-9; v += 0.25) { const y = a + 3 * v; const X = sx(v), Y = sy(Math.max(yl[0], Math.min(yl[1], y))); if (v === xl[0]) g.moveTo(X, Y); else g.lineTo(X, Y); }
      g.stroke(); g.globalAlpha = 1;
    });
    const z = zSub(), L = zL(), N = C.countInCube(z, L);
    const px = sx(Math.log10(L)), py = sy(Math.max(yl[0], Math.min(yl[1], Math.log10(N))));
    LD.ball(g, px, py, 6, col.accent, { glow: 0 });
    sciText(g, px + (px > gw * 0.6 ? -10 : 10), 'N ≈ ', '', py - 10, col.accent, 12, px > gw * 0.6 ? 'right' : 'left', 3)(N);
    $('gHint').textContent = T('雙對數圖：視野邊長每縮小 10 倍，粒子數少 1000 倍（斜率 3）。虛線是只剩一個粒子。', 'Log–log graph: each tenfold zoom divides the count by 1000 (slope 3). The dashed line is a single particle.');
  }
  function graphFilm(g) {
    const pad = 14, X0 = pad + 50, X1 = gw - pad - 10, Y0 = gh - pad - 34, Y1 = pad + 12;
    const ok = rows.filter(function (r) { return r.A != null; });
    const xm = Math.max(5e-5, ok.reduce(function (m, r) { return Math.max(m, r.Voil); }, 0) * 1.15);
    const ym = Math.max(200, ok.reduce(function (m, r) { return Math.max(m, r.A); }, 0) * 1.15);
    const ex = Math.floor(Math.log10(xm)) ;
    const xu = Math.pow(10, ex);
    const sx = function (v) { return X0 + v / xm * (X1 - X0); }, sy = function (v) { return Y0 - v / ym * (Y0 - Y1); };
    const stepX = niceStep(xm / xu, 5) * xu, stepY = niceStep(ym, 5);
    g.strokeStyle = LD.alpha(col.text, col.dark ? 0.1 : 0.08); g.lineWidth = 1;
    for (let v = 0; v <= xm + 1e-12; v += stepX) { g.beginPath(); g.moveTo(Math.round(sx(v)) + 0.5, Y0); g.lineTo(Math.round(sx(v)) + 0.5, Y1); g.stroke(); LD.haloText(g, sigf(v / xu, 2), sx(v), Y0 + 15, col.muted, 'center', 'alphabetic', font(11)); }
    for (let v = 0; v <= ym + 1e-9; v += stepY) { g.beginPath(); g.moveTo(X0, Math.round(sy(v)) + 0.5); g.lineTo(X1, Math.round(sy(v)) + 0.5); g.stroke(); LD.haloText(g, num(v, 0), X0 - 6, sy(v) + 4, col.muted, 'right', 'alphabetic', font(11)); }
    g.strokeStyle = LD.alpha(col.text, 0.55); g.beginPath(); g.moveTo(X0, Y1); g.lineTo(X0, Y0); g.lineTo(X1, Y0); g.stroke();
    const xl = T('油酸體積 V（× 10', 'Oleic acid V (× 10');
    g.font = font(11, 600); const w1 = g.measureText(xl).width;
    const xx = (X0 + X1) / 2 - 50;
    LD.supText(g, xl, String(ex).replace('-', '−'), xx, gh - 6, col.muted, font(11, 600), 'left');
    LD.haloText(g, ' mL）'.replace('）', T('）', ')')), xx + w1 + 14, gh - 6, col.muted, 'left', 'alphabetic', font(11, 600));
    g.save(); g.translate(12, (Y0 + Y1) / 2); g.rotate(-Math.PI / 2);
    LD.haloText(g, T('油膜面積 A（cm²）', 'Film area A (cm²)'), 0, 0, col.muted, 'center', 'middle', font(11, 600)); g.restore();
    const fit = C.fitThroughOrigin(ok);
    if (fit) {
      g.strokeStyle = col.accent; g.lineWidth = 2; g.setLineDash([6, 4]);
      g.beginPath(); g.moveTo(sx(0), sy(0)); const xe = Math.min(xm, ym / fit.slope); g.lineTo(sx(xe), sy(fit.slope * xe)); g.stroke(); g.setLineDash([]);
      LD.pill(g, T('斜率 → h = ', 'slope → h = ') + num(fit.h, 3) + ' nm', X0 + 8, Y1 + 18, col.accent, 'left', font(12, 700));
    }
    ok.forEach(function (r) { LD.ball(g, sx(r.Voil), sy(r.A), 5, r.edge ? col.pos : col.neg, { glow: 0 }); });
    $('gHint').textContent = ok.length ? T('每一點是一次「量面積」；紅點表示油膜碰到盤邊。過原點直線的斜率是 1 ÷ h。', 'Each point is one “Measure area”; red points mean the film reached the side. The slope of the line through the origin is 1 ÷ h.') : T('還沒有紀錄：滴幾滴、按「量面積」。', 'No records yet: add some drops and press “Measure area”.');
  }
  function niceStep(range, n) { const r = range / n, e = Math.pow(10, Math.floor(Math.log10(r))), f = r / e; return (f > 5 ? 10 : f > 2 ? 5 : f > 1 ? 2 : 1) * e; }
  function renderTable() {
    const t = $('tbl');
    if (state.mode !== 'film') { $('tblWrap').hidden = true; return; }
    $('tblWrap').hidden = false;
    let h = '<thead><tr><th>#</th><th>' + T('滴數', 'Drops') + '</th><th>' + T('每滴', 'Per drop') + '<br><small>mL</small></th><th>' + T('稀釋', 'Dilution') + '</th><th>V<br><small>mL</small></th><th>' + T('格子', 'Grid') + '<br><small>cm</small></th><th>A<br><small>cm²</small></th><th>h<br><small>nm</small></th></tr></thead><tbody>';
    if (!rows.length) h += '<tr class="empty"><td colspan="8">' + T('還沒有紀錄', 'No records yet') + '</td></tr>';
    rows.forEach(function (r, i) {
      const hh = r.A ? r.Voil / r.A * 1e7 : null;
      h += '<tr><td>' + (i + 1) + '</td><td>' + r.drops + '</td><td>' + sigf(r.v, 3) + '</td><td>1:' + r.D + '</td><td>' + sci(r.Voil, 3) + '</td><td>' + r.grid + '</td><td>' + (r.A == null ? '—' : num(r.A, 2)) + (r.edge ? ' ⚠' : '') + '</td><td>' + (hh == null ? '—' : num(hh, 3)) + '</td></tr>';
    });
    t.innerHTML = h + '</tbody>';
  }

  // ======================= 操作 =======================
  function scaleChanged(emitIt) {
    const a = panSample(pans.A), b = panSample(pans.B);
    beamTo = scaleTarget(a, b);
    const lv = Math.abs(b.m - a.m) <= 0.01;
    if (snd() && levelWas === false && lv) window.LabSound.tone({ freq: 880, dur: 0.18, gain: 0.07, type: 'sine' });
    else if (snd() && levelWas === true && !lv) window.LabSound.tone({ freq: 440, dur: 0.06, gain: 0.04, type: 'triangle' });
    levelWas = lv;
    showPan(pans.A); showPan(pans.B);
    updateReadouts(); drawGraph();
    if (view3) view3.update();
    kick();
    if (emitIt) emit('weigh', C.weighData(a, b, state.cond));
  }
  let lastDecade = null;
  function zoomChanged(src) {
    showZoomOut();
    const dec = Math.floor(Math.log10(zL()));
    if (snd() && lastDecade != null && dec !== lastDecade) window.LabSound.tone({ freq: Math.max(300, 1300 - dec * 110), dur: 0.05, gain: 0.05, type: 'sine' });
    lastDecade = dec;
    updateReadouts(); drawGraph(); draw();
    if (src) emit('zoom', zData(src));
  }
  function setCuts(k) {
    const max = 90;
    k = Math.max(0, Math.min(max, k));
    setVal(elZ.cuts, k);
    const left = C.countInVolume(zSub(), pieceVol());
    if (k > 0) setVal(elZ.L, Math.max(Math.pow(10, ZL0), Math.min(Math.pow(10, ZL1), pieceSide() * 1.6)));
    if (snd()) {
      if (left < 1) window.LabSound.sweep({ from: 500, to: 250, dur: 0.25, gain: 0.06, type: 'triangle' });
      else window.LabSound.noise({ dur: 0.05, gain: 0.12, filter: 3200, q: 1.5 });
    }
    let msg = '';
    if (k > 0) {
      if (left < 1) msg = T('再切下去就不到一個粒子了：半個分子已經不是原來的物質。', 'Less than one particle now: half a molecule is no longer the same substance.');
      else if (left < 2) msg = T('只剩一個了！', 'Only one left!');
      else {
        const p = sciParts(left, 3);
        msg = T('剩下約 ', 'About ') + (p.e == null ? p.m : p.m + ' × 10^' + p.e) + T(' 個', ' left') + T('（' + k + ' 刀）', ' (' + k + (k === 1 ? ' cut)' : ' cuts)'));
      }
    }
    setStatus(msg);
    zoomChanged('cut');
  }
  function syncSegs() {
    document.querySelectorAll('#modeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)); });
    document.querySelectorAll('#condSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.cond === state.cond)); });
    document.querySelectorAll('#zSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.z === state.zid)); });
    document.querySelectorAll('#dropSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.dropper === state.dropper)); });
    document.querySelectorAll('#calSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.cal === state.calV)); });
    document.querySelectorAll('#powSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.powder === state.powder)); });
    document.querySelectorAll('#gridSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.grid === state.grid)); });
    document.querySelectorAll('#methSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.meth === state.meth)); });
    $('scalePanel').hidden = state.mode !== 'scale';
    $('zoomPanel').hidden = state.mode !== 'zoom';
    $('filmPanel').hidden = state.mode !== 'film';
    $('filmBar').hidden = state.mode !== 'film';
    $('zoomBar').hidden = state.mode !== 'zoom';
    $('gTitle').textContent = state.mode === 'scale' ? T('1 莫耳排排站', 'One mole of each, side by side') : state.mode === 'zoom' ? T('數量級', 'Orders of magnitude') : T('油膜面積與油酸體積', 'Film area against volume of oleic acid');
    $('stageHint').textContent = state.mode === 'scale' ? T('拖曳滑桿或點數字直接輸入；單位可以隨時切換，樣品的量不變。', 'Drag a slider or tap the number to type; switching the unit keeps the same amount.') :
      state.mode === 'zoom' ? T('拖曳「視野邊長」一路放大；或按「對切一刀」，看要切幾刀才剩一個分子。', 'Drag “Width of the field of view” to zoom in, or press “Cut in half” to see how many cuts leave a single molecule.') :
      T('步驟：校正滴管 → 滴一滴 → 等油膜推開 → 量面積（數格子）→ 計算。', 'Steps: calibrate the dropper → add a drop → let the film spread → measure the area (count squares) → calculate.');
  }
  function setMode(m) {
    if (m === state.mode) return;
    if (m !== 'scale' && state.view === '3d') setView('2d');
    state.mode = m;
    setStatus('');
    syncSegs();
    renderTable();
    resize();
    updateReadouts(); drawGraph(); draw(); kick();
  }

  // ---------- 油膜操作 ----------
  function calibrate() {
    acted();
    if (calAnim) return;
    const c = C.calibrate(sess, state.dropper, state.calV);
    cals[state.dropper] = c;
    calAnim = { t0: performance.now(), Vcal: c.Vcal, count: c.count };
    if (reducedMotion) calAnim = null;
    if (snd()) { for (let i = 0; i < 6; i++) window.LabSound.tone({ freq: 760 + 30 * i, dur: 0.03, gain: 0.04, delay: i * 0.22 }); window.LabSound.tone({ freq: 1040, dur: 0.15, gain: 0.06, delay: 1.5 }); }
    setStatus(T('滴到量筒的 ', 'Counted ') + c.Vcal + T(' mL 刻度，共 ', ' mL: ') + c.count + T(' 滴：每滴 ', ' drops, so one drop is ') + sigf(c.v, 4) + ' mL' + T('。', '.'));
    updateReadouts(); kick();
  }
  function addDrop() {
    acted();
    const r0 = tray.R;
    C.drip(sess, tray);
    lastCount = null;
    filmAnim = reducedMotion ? null : { t0: performance.now() + 350, r0: r0, r1: tray.R };
    dropFx = reducedMotion ? null : { t0: performance.now() };
    if (snd()) { window.LabSound.sweep({ from: 1200, to: 500, dur: 0.09, gain: 0.07, type: 'sine', delay: 0.33 }); window.LabSound.sweep({ from: 420, to: 300, dur: 0.6, gain: 0.03, type: 'sine', delay: 0.4 }); }
    const touch = C.touches(tray);
    setStatus(touch ? T('油膜已經碰到盤邊：再推不開了，這不是單分子層的面積。換一盤水，或把溶液再稀釋。', 'The film has reached the side of the tray: it cannot spread any further, so this is not the area of a monolayer. Use a new tray or a more dilute solution.') :
      tray.powder === 'none' ? T('沒撒粉，看不到油膜推開到哪裡。', 'Without powder you cannot see how far the film spreads.') :
      T('油酸在水面推開成一層薄膜，把粉推到旁邊。', 'The oleic acid spreads into a thin film and pushes the powder aside.'));
    updateReadouts(); kick();
  }
  function measureArea() {
    acted();
    if (!tray.drops) { setStatus(T('盤裡還沒有油膜：先「滴一滴」。', 'There is no film yet: “Add a drop” first.')); return; }
    if (tray.powder === 'none') { setStatus(T('沒撒粉，看不到油膜的邊界，沒辦法描出輪廓數格子。換一盤水、撒粉再做。', 'Without powder the edge of the film cannot be seen or traced. Start a new tray with powder.')); return; }
    filmAnim = null;
    const cal = cals[state.dropper];
    const r = C.measure(tray, state.grid, cal && cal.dropper === tray.dropper ? cal : null);
    lastCount = C.countCells(tray, state.grid);
    rows.push(r);
    if (snd()) window.LabSound.tone({ freq: 660, dur: 0.1, gain: 0.06 });
    setStatus(T('描下輪廓、數格子：超過半格算一格，共 ', 'Traced and counted (a square at least half covered counts as one): ') + r.count + T(' 格，面積 ', ' squares, area ') + sigf(r.A, 4) + ' cm²' + (r.edge ? T('（油膜碰到盤邊，面積偏小）', ' (the film touches the side, so the area is too small)') : '') + T('。', '.'));
    renderTable(); updateReadouts(); drawGraph(); draw();
  }
  function calc() {
    acted();
    const k = val(elF.k);
    const res = C.analyze(rows, state.meth, k);
    const out = $('calcOut');
    if (!res) { out.innerHTML = T('還沒有面積的紀錄：先滴油酸、按「量面積」。', 'No area records yet: add oleic acid and press “Measure area”.'); return; }
    if (state.meth === 'fit' && res.method !== 'fit') out.innerHTML = T('直線斜率至少要 2 筆紀錄；先用最後一次的數據算。', 'The line needs at least 2 records; the latest record is used for now.') + '<br>';
    else out.innerHTML = '';
    lastRes = res;
    const Vm = C.OLEIC.M / C.OLEIC.rho;
    let h = '';
    if (res.method === 'fit') h += T('直線斜率 = ', 'Slope = ') + sci(res.fit.slope, 4) + ' cm<sup>−1</sup>' + T('（' + res.fit.n + ' 筆）', ' (' + res.fit.n + ' records)') + '<br>h = 1 ÷ ' + T('斜率', 'slope') + ' = <span class="res">' + num(res.h, 3) + ' nm</span><br>';
    else h += 'h = V ÷ A = ' + sci(res.last.Voil, 3) + ' cm³ ÷ ' + sigf(res.last.A, 4) + ' cm² = <span class="res">' + num(res.h, 3) + ' nm</span><br>';
    h += T('一個分子的體積', 'Volume of one molecule') + ' v<sub>1</sub> = h³ ÷ k² = ' + num(res.h * res.h * res.h / (res.k * res.k), 3) + ' nm³<br>';
    h += T('1 莫耳油酸的體積', 'Volume of one mole of oleic acid') + ' M ÷ ρ = ' + num(Vm, 1) + ' cm³<br>';
    h += 'N<sub>A</sub> ≈ (M ÷ ρ) ÷ v<sub>1</sub> = <span class="res">' + sci(res.NA, 3) + '</span> mol<sup>−1</sup><br>';
    h += '<small>' + T('與 6.022 × 10<sup>23</sup> 相比：', 'Compared with 6.022 × 10<sup>23</sup>: ') + (res.NA >= C.NA ? '+' : '−') + num(Math.abs(res.NAerr) * 100, 1) + '%</small>';
    if (res.edge) h += '<br><small>' + T('⚠ 有紀錄的油膜碰到盤邊，面積偏小。', '⚠ Some records touched the side of the tray: the area is too small.') + '</small>';
    out.innerHTML += h;
    if (snd()) window.LabSound.tone({ freq: 990, dur: 0.12, gain: 0.06 });
    emit('film', C.filmData(res, rows));
  }

  // ======================= 3D =======================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (m) { threeLib = { THREE: m[0], OrbitControls: m[1].OrbitControls }; return threeLib; });
  }
  function host3Api() {
    return {
      T: T, host: host3,
      data: function () {
        const cond = state.cond;
        const one = C.SUBS.filter(function (s) { return s.phase !== 'g'; }).map(function (s) { return { id: s.id, f: s.f, name: subName(s), side: Math.cbrt(s.Vm), color: MAT[s.id], phase: s.phase, mass: s.M }; });
        const pan = function (P) { const s = panSample(P), u = C.SUB[s.id]; return { id: s.id, f: u.f, name: subName(u), side: s.side, color: MAT[s.id], phase: s.phase, mass: s.m }; };
        return { one: one, gas: { side: Math.cbrt(C.VM[cond] * 1000), V: C.VM[cond], cond: cond }, A: pan(pans.A), B: pan(pans.B) };
      },
      colors: function () { return col; },
      contextLost: function () { setView('2d'); viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.'); }
    };
  }
  function setPressed(m) { $('view2d').setAttribute('aria-pressed', String(m === '2d')); $('view3d').setAttribute('aria-pressed', String(m === '3d')); }
  function setView(m) {
    if (m === '3d') {
      if (view3 && view3.active) return;
      if (state.mode !== 'scale') setMode('scale');   // 3D 是天平模式的「1 莫耳實際大小」
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable() || !window.MC3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        state.view = '3d';
        view3 = window.MC3D.create(lib, host3Api());
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        view3.update();
      }).catch(function (err) { if (token !== loadToken) return; if (window.console) console.warn('3D view unavailable:', err); fail3D(); });
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
    state.view = '2d'; setPressed('2d'); $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。', 'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }

  // ======================= 事件 =======================
  ['A', 'B'].forEach(function (k) {
    const P = pans[k];
    P.el.addEventListener('input', function () { if (syncing) return; acted(); scaleChanged(true); });
    $('sub' + k).addEventListener('change', function (e) { acted(); setPan(P, e.target.value, P.unit, 'val'); scaleChanged(true); });
    document.querySelectorAll('#unit' + k + ' button').forEach(function (b) {
      b.addEventListener('click', function () { acted(); if (b.dataset.unit === P.unit) return; setPan(P, P.id, b.dataset.unit, 'n'); scaleChanged(true); });
    });
  });
  document.querySelectorAll('#condSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      if (b.dataset.cond === state.cond) return;
      // 換條件：保留莫耳數（同一份氣體，體積跟著變）
      const na = panSample(pans.A).n, nb = panSample(pans.B).n;
      state.cond = b.dataset.cond;
      [[pans.A, na], [pans.B, nb]].forEach(function (q) { registerPan(q[0]); setVal(q[0].el, C.fromMol(C.SUB[q[0].id], q[0].unit, q[1], state.cond)); });
      syncSegs(); scaleChanged(true);
    });
  });
  document.querySelectorAll('#modeSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); setMode(b.dataset.mode); }); });
  elZ.L.addEventListener('input', function () { if (syncing) return; acted(); if (zCuts()) { setVal(elZ.cuts, 0); setStatus(''); } zoomChanged('zoom'); });
  elZ.V0.addEventListener('input', function () { if (syncing) return; acted(); if (zCuts()) { setVal(elZ.cuts, 0); setStatus(''); } zoomChanged('zoom'); });
  elZ.cuts.addEventListener('input', function () { if (syncing) return; acted(); setCuts(zCuts()); });
  document.querySelectorAll('#zSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); if (b.dataset.z === state.zid) return; state.zid = b.dataset.z; syncSegs(); if (zCuts()) setCuts(zCuts()); else zoomChanged('zoom'); });
  });
  $('cutBtn').addEventListener('click', function () { acted(); setCuts(zCuts() + 1); });
  $('uncutBtn').addEventListener('click', function () { acted(); if (zCuts() > 0) setCuts(zCuts() - 1); });
  $('calBtn').addEventListener('click', calibrate);
  $('dropBtn').addEventListener('click', addDrop);
  $('measBtn').addEventListener('click', measureArea);
  $('trayBtn').addEventListener('click', function () { acted(); newTray(T('換了一盤乾淨的水，重新撒粉。', 'A clean tray of water with fresh powder.')); updateReadouts(); draw(); });
  $('clearAll').addEventListener('click', function () { acted(); rows = []; lastRes = null; $('calcOut').innerHTML = ''; renderTable(); drawGraph(); updateReadouts(); setStatus(T('已清除所有面積紀錄（盤中的油膜與設定保留）。', 'All area records cleared (the film in the tray and the settings are kept).')); });
  $('calcBtn').addEventListener('click', calc);
  elF.dil.addEventListener('input', function () { if (syncing) return; acted(); showFilmOut(); newTray(T('換了溶液：換一盤新的水。', 'New solution: a new tray of water.')); updateReadouts(); draw(); });
  elF.k.addEventListener('input', function () { if (syncing) return; acted(); showFilmOut(); });
  [['dropSeg', 'dropper'], ['powSeg', 'powder']].forEach(function (q) {
    document.querySelectorAll('#' + q[0] + ' button').forEach(function (b) {
      b.addEventListener('click', function () {
        acted();
        const v = b.dataset[q[1]];
        if (v === state[q[1]]) return;
        state[q[1]] = v; syncSegs();
        newTray(q[1] === 'dropper' ? T('換了滴管：換一盤新的水。這支滴管要另外校正。', 'New dropper: a new tray of water. This dropper needs its own calibration.') : T('換了撒粉的方式：換一盤新的水。', 'Different powder: a new tray of water.'));
        updateReadouts(); draw();
      });
    });
  });
  document.querySelectorAll('#calSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); state.calV = +b.dataset.cal; syncSegs(); }); });
  document.querySelectorAll('#gridSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); state.grid = +b.dataset.grid; lastCount = null; syncSegs(); draw(); updateReadouts(); }); });
  document.querySelectorAll('#methSeg button').forEach(function (b) { b.addEventListener('click', function () { acted(); state.meth = b.dataset.meth; syncSegs(); }); });
  $('view2d').addEventListener('click', function () { acted(); setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () { if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound')); updateSoundButton(); });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
    if (ev.detail && ev.detail.name === 'fs') resize();
  });
  function themeChanged() {
    if (LD.refresh) LD.refresh();
    readColors();
    Object.keys(sprites).forEach(function (k) { delete sprites[k]; });
    updateReadouts(); drawGraph(); draw();
    if (view3) view3.onTheme();
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lg = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth && gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', resize);

  function buildDataTable() {
    const t = $('dataTable');
    if (!t) return;
    let h = '<thead><tr><th>' + T('物質', 'Substance') + '</th><th>M<br><small>g/mol</small></th><th>ρ<br><small>g/cm³</small></th><th>' + T('1 mol 的體積', 'Volume of 1 mol') + '<br><small>cm³</small></th><th>' + T('每個粒子的原子', 'Atoms per particle') + '</th><th>' + T('電子', 'Electrons') + '</th></tr></thead><tbody>';
    C.SUBS.forEach(function (s) {
      h += '<tr><td>' + subName(s) + ' ' + fH(s.f) + '</td><td>' + num(s.M, 3) + '</td><td>' + (s.phase === 'g' ? T('（氣體）', '(gas)') : s.rho) + '</td><td>' +
        (s.phase === 'g' ? num(C.VM.stp * 1000, 0) + ' / ' + num(C.VM.rt * 1000, 0) : num(s.Vm, 2)) + '</td><td>' + s.atoms + '</td><td>' + s.electrons + '</td></tr>';
    });
    h += '<tr><td>' + T('油酸', 'Oleic acid') + ' C<sub>18</sub>H<sub>34</sub>O<sub>2</sub></td><td>' + num(C.OLEIC.M, 2) + '</td><td>' + C.OLEIC.rho + '</td><td>' + num(C.OLEIC.M / C.OLEIC.rho, 1) + '</td><td>54</td><td>' + C.electronsOf(C.OLEIC.comp) + '</td></tr>';
    t.innerHTML = h + '</tbody>';
  }

  // 測試用（Playwright）
  window.__mc = {
    state: state, pans: function () { return { A: panSample(pans.A), B: panSample(pans.B) }; }, tray: function () { return tray; }, rows: function () { return rows; },
    cals: function () { return cals; }, zoom: function () { return zData('zoom'); }, lastRes: function () { return lastRes; }
  };

  // ======================= 啟動 =======================
  readColors();
  buildSelect($('subA'), pans.A.id); buildSelect($('subB'), pans.B.id);
  registerPan(pans.A); registerPan(pans.B);
  setVal(pans.A.el, 1); setVal(pans.B.el, 20);
  setVal(elZ.V0, 0.05); setVal(elZ.L, 1e7); setVal(elZ.cuts, 0);
  newTray(null);
  showPan(pans.A); showPan(pans.B); showZoomOut(); showFilmOut();
  beam = beamTo = scaleTarget(panSample(pans.A), panSample(pans.B));
  levelWas = false;
  syncSegs();
  buildDataTable();
  updateSoundButton();
  renderTable();
  resize();
  updateReadouts(); drawGraph(); draw();
})();
