/*
 * ph-scale.js — 「酸鹼強度與 pH」的頁面程式（兩個燒杯、pH 計、放大鏡、pH 色階、圖表、紀錄表、未知酸、任務事件）
 * 化學核心在 js/ph-scale-core.js（PhCore）；3D 檢視在 js/ph-scale-3d.js（Ph3D，切換時才載入 three.js）。
 *
 * 放大鏡裡的粒子只是示意：每杯畫 40 個溶質粒子，其中解離的個數 = round(α × 40)；水解離出的離子照比例畫（最多 12 對）。
 * 粒子的運動、質子跳上跳下（動態平衡）只是畫面，pH、α 等讀數都直接來自核心的精確計算。
 *
 * 任務事件（只在使用者按按鈕之後送出）：
 *   'measure'：按「測量並記錄」{ T, pKw, neutral, ind, beakers: [A, B] }（每杯 = PhCore.solution() 的讀數加上 id）
 *   'dilute'：按「加水稀釋 10 倍」{ id, sp, kind, T, k, logC0, pH0, alpha0, pHprev, alphaPrev, logC, pH, alpha, alphaLim, K, Kw, dpH }
 *   'answer'：未知酸按「核對答案」{ ans, err, revealed, tries }
 */
(function () {
  'use strict';
  const P = window.PhCore, LD = window.LabDraw;
  if (!P || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reducedMotion = LD.reducedMotion();
  const IDS = ['A', 'B'];

  // ======================= 數字格式 =======================
  function num(x, d) {
    if (x == null || !isFinite(x)) return '—';
    const s = (+x).toFixed(d == null ? 0 : d);
    return s.charAt(0) === '-' ? (/^-0(\.0*)?$/.test(s) ? s.slice(1) : '−' + s.slice(1)) : s;
  }
  function sciParts(x, sig) {
    if (x == null || !isFinite(x) || x === 0) return { m: x === 0 ? '0' : '—', e: null };
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= -2 && e < 4) return { m: num(x, Math.max(0, (sig || 3) - 1 - e)), e: null };
    const m = x / Math.pow(10, e);
    if (Math.abs(+m.toFixed((sig || 3) - 1)) >= 10) return sciParts(Math.sign(x) * Math.pow(10, e + 1), sig); // 尾數進位成 10.0：就是下一個次方
    return { m: num(m, (sig || 3) - 1), e: e };
  }
  function sciHTML(x, sig) {
    const p = sciParts(x, sig);
    return p.e == null ? p.m : p.m + ' × 10<sup>' + num(p.e, 0) + '</sup>';
  }
  /** 一定用科學記號（濃度、Ka） */
  function sciAlways(x, sig) {
    if (!(x > 0)) return sciParts(x, sig);
    const e = Math.floor(Math.log10(x));
    const m = x / Math.pow(10, e);
    if (+m.toFixed((sig || 3) - 1) >= 10) return sciAlways(Math.pow(10, e + 1), sig);
    return { m: num(m, (sig || 3) - 1), e: e };
  }
  function sciAlwaysHTML(x, sig) { const p = sciAlways(x, sig); return p.e == null ? p.m : p.m + ' × 10<sup>' + num(p.e, 0) + '</sup>'; }
  function sigf(x, sig) {
    if (x == null || !isFinite(x)) return '—';
    if (x === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(x)));
    return num(x, Math.max(0, Math.min(6, (sig || 3) - 1 - e)));
  }
  /** 解離百分率（α 是小數） */
  function pct(a) {
    if (a == null || !isFinite(a)) return '—';
    if (a >= 0.99995) return '100%';
    if (a * 100 < 1e-4) return sciHTML(a * 100, 3) + '%';
    return sigf(a * 100, 3) + '%';
  }
  function pctPlain(a) { return pct(a).replace(/<sup>(.*?)<\/sup>/, '^$1').replace(/<[^>]+>/g, ''); }

  // ======================= 物質與粒子 =======================
  const SPN = {
    water: ['純水', 'Water', 'H2O'], HCl: ['鹽酸', 'Hydrochloric', 'HCl'], HF: ['氫氟酸', 'Hydrofluoric', 'HF'],
    CH3COOH: ['醋酸', 'Acetic', 'CH3COOH'], HClO: ['次氯酸', 'Hypochlorous', 'HClO'], HCN: ['氫氰酸', 'Hydrocyanic', 'HCN'],
    NaOH: ['氫氧化鈉', 'Sodium hydroxide', 'NaOH'], NH3: ['氨水', 'Ammonia', 'NH3'], HX: ['未知酸', 'Unknown', 'HX']
  };
  const KIND_NAME = { water: ['中性', 'neutral'], sa: ['強酸', 'strong acid'], wa: ['弱酸', 'weak acid'], sb: ['強鹼', 'strong base'], wb: ['弱鹼', 'weak base'] };
  function spName(sp) { return T(P.SPECIES[sp].zh, P.SPECIES[sp].en); }
  function kindName(k) { return T(KIND_NAME[k][0], KIND_NAME[k][1]); }
  /** 化學式 → HTML（數字用 <sub>，最後的 + − 用 <sup>） */
  function fH(f) {
    const m = /^(.*?)([+\-])$/.exec(f);
    const core = (m ? m[1] : f).replace(/(\d+)/g, '<sub>$1</sub>');
    return m ? core + '<sup>' + (m[2] === '-' ? '−' : '+') + '</sup>' : core;
  }
  /** 化學式 → 畫布用的片段 */
  function fParts(f) {
    const out = [], m = /^(.*?)([+\-])$/.exec(f), core = m ? m[1] : f;
    core.replace(/([^\d]+)(\d*)/g, function (s, a, d) { out.push({ t: a }); if (d) out.push({ t: d, sub: true }); return s; });
    if (m) out.push({ t: m[2] === '-' ? '−' : '+', sup: true });
    return out;
  }
  // 分子由原子小球組成：[原子, x, y]（以原子半徑單位 r0 計）
  const MOL = {
    H2O: [['O', 0, 0], ['H', -0.78, 0.6], ['H', 0.78, 0.6]],
    H3O: [['O', 0, 0], ['H', -0.84, 0.55], ['H', 0.84, 0.55], ['H', 0, -0.98]],
    OH: [['O', 0, 0], ['H', 0.92, 0.25]],
    Cl: [['Cl', 0, 0]],
    HF: [['F', 0.25, 0], ['H', -0.95, 0]], F: [['F', 0, 0]],
    CH3COOH: [['C', -1.15, 0], ['C', 0.15, 0], ['O', 0.9, -0.85], ['O', 0.9, 0.85], ['H', 1.75, 1.2]],
    CH3COO: [['C', -1.15, 0], ['C', 0.15, 0], ['O', 0.9, -0.85], ['O', 0.9, 0.85]],
    HClO: [['Cl', -0.6, 0], ['O', 0.85, 0], ['H', 1.6, 0.62]], ClO: [['Cl', -0.6, 0], ['O', 0.85, 0]],
    HCN: [['H', -1.55, 0], ['C', -0.5, 0], ['N', 0.65, 0]], CN: [['C', -0.55, 0], ['N', 0.6, 0]],
    HX: [['X', 0.25, 0], ['H', -1.05, 0]], X: [['X', 0, 0]],
    Na: [['Na', 0, 0]],
    NH3: [['N', 0, 0], ['H', -0.86, 0.5], ['H', 0.86, 0.5], ['H', 0, -0.98]],
    NH4: [['N', 0, 0], ['H', -0.8, 0.62], ['H', 0.8, 0.62], ['H', -0.5, -0.85], ['H', 0.5, -0.85]]
  };
  const ATOM_R = { H: 0.55, O: 0.82, C: 0.8, N: 0.8, Cl: 1.1, F: 0.82, Na: 1.05, X: 1.05 };
  const ATOM_C = { H: '#eef1f4', O: '#e0493e', C: '#59616a', N: '#3f6fd6', Cl: '#2fae55', F: '#a8cf3c', Na: '#9a5fe0', X: '#cf4590' };
  /** 粒子的電荷：+1、−1、0 */
  const CHARGE = { H3O: 1, OH: -1, Cl: -1, F: -1, CH3COO: -1, ClO: -1, CN: -1, X: -1, Na: 1, NH4: 1 };
  const ION_F = { H3O: 'H3O+', OH: 'OH-', Cl: 'Cl-', F: 'F-', CH3COO: 'CH3COO-', ClO: 'ClO-', CN: 'CN-', X: 'X-', Na: 'Na+', NH4: 'NH4+',
    HF: 'HF', CH3COOH: 'CH3COOH', HClO: 'HClO', HCN: 'HCN', HX: 'HX', NH3: 'NH3', H2O: 'H2O' };
  function unitType(sp, st) {
    switch (sp) {
      case 'HCl': return 'Cl';
      case 'HF': return st ? 'F' : 'HF';
      case 'CH3COOH': return st ? 'CH3COO' : 'CH3COOH';
      case 'HClO': return st ? 'ClO' : 'HClO';
      case 'HCN': return st ? 'CN' : 'HCN';
      case 'HX': return st ? 'X' : 'HX';
      case 'NaOH': return 'Na';
      case 'NH3': return st ? 'NH4' : 'NH3';
    }
    return 'H2O';
  }

  // ======================= 狀態 =======================
  const state = { b: { A: { sp: 'HCl', logC: -2 }, B: { sp: 'CH3COOH', logC: -1 } }, T: 25, ind: true, tab: 'ph', view: '2d' };
  let unk = P.newUnknown(), unkRevealed = false, unkTries = 0, unkId = 1;
  const sol = { A: null, B: null };
  const chain = { A: null, B: null };   // 連續稀釋：{ logC0, pH0, alpha0, k }
  let rows = [], rowN = 0;
  let view3 = null;
  function compute() { IDS.forEach(function (id) { const b = state.b[id]; sol[id] = P.solution(b.sp, b.logC, state.T, unk.Ka); }); }
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }

  // ======================= 元件 =======================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  const elC = { A: $('cA'), B: $('cB') }, elT = $('temp'), elInd = $('ind');
  const logMap = {
    toValue: function (p) { return Math.round((-8 + p / 100) * 100) / 100; },
    toPos: function (v) { return Math.round((Math.max(-8, Math.min(0, v)) + 8) * 100); },
    min: -8, max: 0, decimals: 2
  };
  if (window.LabNum) { window.LabNum.register(elC.A, logMap); window.LabNum.register(elC.B, logMap); }
  function val(el) { return window.LabNum ? window.LabNum.value(el) : (el === elT ? +el.value : logMap.toValue(+el.value)); }
  let syncing = false;
  function setVal(el, v) { syncing = true; if (window.LabNum) window.LabNum.set(el, v); else el.value = el === elT ? v : logMap.toPos(v); syncing = false; }

  // ======================= 顏色 =======================
  let col = {};
  const UNI = [[0, '#c8102e'], [1, '#e0322a'], [2, '#ee5a2a'], [3, '#f5822b'], [4, '#f8a530'], [5, '#f2c82f'], [6, '#c8d33a'], [7, '#5fb84a'],
    [8, '#2f9e78'], [9, '#2b84b8'], [10, '#2d5fb3'], [11, '#3d43a3'], [12, '#56309a'], [13, '#67288c'], [14, '#5b2079']];
  function uni(pH) {
    const x = Math.max(0, Math.min(14, pH)), i = Math.min(13, Math.floor(x)), u = x - i;
    return LD.mix(UNI[i][1], UNI[i + 1][1], u);
  }
  function readColors() {
    if (LD.refresh) LD.refresh();
    col = {
      text: LD.c.text, muted: LD.c.muted, bg: LD.c['canvas-bg'], surface: LD.c.surface, border: LD.c.border, dark: LD.dark,
      A: LD.c.accent, B: LD.c.equi, pos: LD.c.pos, neg: LD.c.neg, probe: LD.c.probe, accent: LD.c.accent,
      atom: ATOM_C, water: LD.dark ? '#2d4a57' : '#cfe6f0'
    };
    $('tagA').style.background = col.A; $('tagB').style.background = col.B;
  }
  /** 溶液的顏色（有指示劑時依 pH，沒有時是淡淡的水色） */
  function liquidColor(r) { return state.ind ? uni(r.pH) : col.water; }

  // ======================= 粒子（2D 與 3D 共用同一批） =======================
  const NU = 40, NWAT = 64, EWCAP = 12, FL_DUR = 450;
  function now() { return performance.now(); }
  function rndSphere(rad) {
    let x, y, z;
    do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; } while (x * x + y * y + z * z > 1);
    return [x * rad, y * rad, z * rad];
  }
  function particle(type, near) {
    const p = rndSphere(0.86);
    if (near) { p[0] = near.x + (Math.random() - 0.5) * 0.18; p[1] = near.y + (Math.random() - 0.5) * 0.18; p[2] = near.z + (Math.random() - 0.5) * 0.18; }
    return { type: type, x: p[0], y: p[1], z: p[2], vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2, vz: (Math.random() - 0.5) * 0.2,
      a: Math.random() * 6.283, tilt: Math.random() * 6.283, spin: (Math.random() - 0.5) * 1.4, born: now(), st: 0 };
  }
  function newPool() {
    const w = [];
    for (let i = 0; i < NWAT; i++) w.push(particle('H2O'));
    return { sp: null, units: [], free: [], water: w, flashes: [], hop: 0.6, tg: null };
  }
  const pools = { A: newPool(), B: newPool() };
  function partnerOf(sp) { return P.isBase(sp) ? 'OH' : 'H3O'; }
  function targets(r) {
    if (r.kind === 'water') return { nu: 0, nd: 0, H3O: 1, OH: 1, capped: false };
    const strong = r.kind === 'sa' || r.kind === 'sb', acid = r.kind === 'sa' || r.kind === 'wa';
    const nd = strong ? NU : Math.round(r.alpha * NU);
    const ewRaw = NU * (acid ? r.oh : r.h) / r.C, ew = Math.min(EWCAP, Math.round(ewRaw));
    return { nu: NU, nd: nd, H3O: acid ? nd + ew : ew, OH: acid ? ew : nd + ew, capped: ewRaw > EWCAP + 0.5, ew: ew };
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function adjustFree(pool, type, n) {
    let have = pool.free.filter(function (p) { return p.type === type; });
    while (have.length < n) { const p = particle(type); pool.free.push(p); have.push(p); }
    while (have.length > n) { const p = have.pop(); pool.free.splice(pool.free.indexOf(p), 1); }
  }
  function syncPool(id) {
    const pool = pools[id], sp = state.b[id].sp, r = sol[id], tg = targets(r);
    if (pool.sp !== sp) {
      pool.sp = sp; pool.units = []; pool.free = []; pool.flashes = [];
      for (let i = 0; i < tg.nu; i++) pool.units.push(particle('u'));
    }
    let cur = pool.units.filter(function (u) { return u.st; }).length;
    while (cur < tg.nd) { const u = pick(pool.units.filter(function (q) { return !q.st; })); u.st = 1; cur++; }
    while (cur > tg.nd) { const u = pick(pool.units.filter(function (q) { return q.st; })); u.st = 0; cur--; }
    adjustFree(pool, 'H3O', tg.H3O);
    adjustFree(pool, 'OH', tg.OH);
    pool.tg = tg;
  }
  function moveP(p, dt) {
    p.vx += (Math.random() - 0.5) * 1.2 * dt; p.vy += (Math.random() - 0.5) * 1.2 * dt; p.vz += (Math.random() - 0.5) * 1.2 * dt;
    const s = Math.hypot(p.vx, p.vy, p.vz), vmax = 0.16;
    if (s > vmax) { p.vx *= vmax / s; p.vy *= vmax / s; p.vz *= vmax / s; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const r = Math.hypot(p.x, p.y, p.z);
    if (r > 0.86) {
      const nx = p.x / r, ny = p.y / r, nz = p.z / r, vn = p.vx * nx + p.vy * ny + p.vz * nz;
      if (vn > 0) { p.vx -= 2 * vn * nx; p.vy -= 2 * vn * ny; p.vz -= 2 * vn * nz; }
      p.x = nx * 0.86; p.y = ny * 0.86; p.z = nz * 0.86;
    }
    p.a += p.spin * dt;
  }
  function stepPool(id, dt, t) {
    const pool = pools[id];
    pool.units.forEach(function (p) { moveP(p, dt); });
    pool.free.forEach(function (p) { moveP(p, dt); });
    pool.water.forEach(function (p) { moveP(p, dt); });
    const tg = pool.tg, sp = state.b[id].sp;
    // 弱電解質的動態平衡：一個分子解離的同時，另一個離子與質子結合回去（離子數不變）
    if (tg && P.isWeak(sp) && tg.nd > 0 && tg.nd < tg.nu) {
      pool.hop -= dt;
      if (pool.hop <= 0) { pool.hop = 0.5 + Math.random() * 0.9; hop(pool, sp, t); }
    }
    pool.flashes = pool.flashes.filter(function (f) { return t - f.t0 < FL_DUR; });
  }
  function hop(pool, sp, t) {
    const und = pool.units.filter(function (u) { return !u.st; }), dis = pool.units.filter(function (u) { return u.st; });
    if (!und.length || !dis.length) return;
    const ptype = partnerOf(sp), u0 = pick(und), u1 = pick(dis);
    u0.st = 1;
    const ion = particle(ptype, u0); ion.born = t;
    pool.flashes.push({ x: u0.x, y: u0.y, z: u0.z, t0: t, kind: 0 });
    u1.st = 0;
    let best = null, bd = 1e9;
    pool.free.forEach(function (p) { if (p.type !== ptype) return; const d = Math.hypot(p.x - u1.x, p.y - u1.y, p.z - u1.z); if (d < bd) { bd = d; best = p; } });
    if (best) pool.free.splice(pool.free.indexOf(best), 1);
    pool.free.push(ion);
    pool.flashes.push({ x: u1.x, y: u1.y, z: u1.z, t0: t, kind: 1 });
  }

  // ======================= 2D 畫面 =======================
  let W = 0, H = 0, dpr = 1, G = null;
  function layout(w) {
    const cw = w / 2;
    const bw = Math.min(150, cw * 0.58), bh = bw * 0.92;
    const top = 10, meterH = 40;
    const yb = top + meterH + 30;
    const R = Math.min(cw * 0.42, 88);
    const zy = yb + bh + 40 + R;
    const sy = zy + R + 66;
    return { cw: cw, bw: bw, bh: bh, top: top, meterH: meterH, yb: yb, R: R, zy: zy, sy: sy, H: Math.round(sy + 16 + 52), cx: [cw * 0.5, cw * 1.5] };
  }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    G = layout(w);
    W = w; H = G.H;
    cv.style.height = H + 'px';
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    drawStage(now());
  }
  const FONT = LD.FONT;
  /** 有下標、上標的文字片段：量寬度 */
  function partsWidth(c, parts, px, weight) {
    let w = 0;
    parts.forEach(function (p) { c.font = (weight || '') + ' ' + (p.sub || p.sup ? px * 0.72 : px) + 'px ' + FONT; w += c.measureText(p.t).width; });
    return w;
  }
  function drawParts(c, parts, x, y, px, color, weight) {
    let cx = x;
    parts.forEach(function (p) {
      const s = p.sub || p.sup ? px * 0.72 : px;
      c.font = (weight || '') + ' ' + s + 'px ' + FONT;
      c.fillStyle = color;
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(p.t, cx, y + (p.sub ? px * 0.28 : p.sup ? -px * 0.32 : 0));
      cx += c.measureText(p.t).width;
    });
    return cx - x;
  }
  /** 圓角底框的標籤（可含下標、上標） */
  function richPill(c, parts, x, yc, color, px, align, weight) {
    px = px || 12;
    const tw = partsWidth(c, parts, px, weight), pw = tw + 14, ph = px + 9;
    const bx = align === 'left' ? x : align === 'right' ? x - pw : x - pw / 2, by = yc - ph / 2;
    LD.roundRect(c, bx, by, pw, ph, ph / 2);
    c.fillStyle = LD.alpha(col.bg, col.dark ? 0.88 : 0.92); c.fill();
    c.strokeStyle = LD.alpha(color || col.muted, col.dark ? 0.55 : 0.45); c.lineWidth = 1; c.stroke();
    drawParts(c, parts, bx + 7, yc + 0.5, px, color || col.text, weight);
    return { x: bx, y: by, w: pw, h: ph };
  }
  function txt(t, o) { return Object.assign({ t: t }, o || {}); }
  /** 科學記號 → 片段 */
  function sciPartsArr(x, sig) {
    const p = sciAlways(x, sig);
    return p.e == null ? [txt(p.m)] : [txt(p.m + ' × 10'), txt(num(p.e, 0), { sup: true })];
  }

  function drawBeaker(c, id, t) {
    const i = IDS.indexOf(id), cx = G.cx[i], r = sol[id], bw = G.bw, bh = G.bh, x0 = cx - bw / 2, x1 = cx + bw / 2, y0 = G.yb, y1 = G.yb + bh;
    const rad = Math.min(12, bw * 0.08);
    const yl = y0 + bh * 0.3;      // 液面
    const lc = liquidColor(r);
    // 接觸陰影
    LD.contactShadow(c, cx, y1 + 2, bw * 0.5, 0);
    // 後壁
    c.save();
    LD.roundRect(c, x0, y0 - 10, bw, bh + 10, rad);
    c.fillStyle = LD.alpha(col.text, col.dark ? 0.05 : 0.03); c.fill();
    c.restore();
    // 溶液
    c.save();
    c.beginPath();
    c.moveTo(x0 + 2, yl);
    c.quadraticCurveTo(x0 + 2, yl + 5, x0 + 10, yl + 5);   // 彎月面（水在玻璃上凹下）
    c.lineTo(x1 - 10, yl + 5);
    c.quadraticCurveTo(x1 - 2, yl + 5, x1 - 2, yl);
    c.lineTo(x1 - 2, y1 - rad);
    c.arcTo(x1 - 2, y1 - 2, x1 - 2 - rad, y1 - 2, rad - 2);
    c.lineTo(x0 + 2 + rad, y1 - 2);
    c.arcTo(x0 + 2, y1 - 2, x0 + 2, y1 - rad, rad - 2);
    c.closePath();
    const gl = c.createLinearGradient(x0, 0, x1, 0);
    const aL = state.ind ? 0.78 : (col.dark ? 0.55 : 0.6);
    gl.addColorStop(0, LD.alpha(LD.shade(lc, -0.25), aL));
    gl.addColorStop(0.35, LD.alpha(lc, aL * 0.92));
    gl.addColorStop(0.7, LD.alpha(LD.shade(lc, 0.12), aL * 0.85));
    gl.addColorStop(1, LD.alpha(LD.shade(lc, -0.3), aL));
    c.fillStyle = gl; c.fill();
    const gv = c.createLinearGradient(0, yl, 0, y1);
    gv.addColorStop(0, 'rgba(255,255,255,0.12)'); gv.addColorStop(1, 'rgba(0,0,0,0.1)');
    c.fillStyle = gv; c.fill();
    // 液面
    c.beginPath(); c.ellipse(cx, yl + 3, bw / 2 - 6, 3.2, 0, 0, Math.PI * 2);
    c.fillStyle = LD.alpha(LD.shade(lc, 0.35), state.ind ? 0.55 : 0.45); c.fill();
    c.restore();
    // pH 計的電極（插進溶液）
    const px = cx + bw * 0.2, mx = cx, my = G.top;
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = LD.alpha(col.text, 0.55); c.lineWidth = 2;
    c.beginPath(); c.moveTo(mx + 20, my + G.meterH); c.bezierCurveTo(mx + 26, my + G.meterH + 14, px, y0 - 30, px, y0 - 14); c.stroke();
    const eg = c.createLinearGradient(px - 5, 0, px + 5, 0);
    eg.addColorStop(0, LD.alpha(col.text, 0.35)); eg.addColorStop(0.4, 'rgba(255,255,255,0.75)'); eg.addColorStop(1, LD.alpha(col.text, 0.4));
    c.fillStyle = eg;
    LD.roundRect(c, px - 4.5, y0 - 16, 9, bh * 0.72, 4); c.fill();
    c.strokeStyle = LD.alpha(col.text, 0.35); c.lineWidth = 1; c.stroke();
    c.fillStyle = LD.alpha(col.text, col.dark ? 0.55 : 0.45);
    LD.roundRect(c, px - 5.5, y0 - 20, 11, 10, 3); c.fill();
    LD.ball(c, px, y0 - 16 + bh * 0.72, 5.5, col.dark ? '#9fb3bd' : '#d5e3ea', { shadow: false });
    c.restore();
    // 玻璃
    c.save();
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(x0 - 4, y0 - 12); c.lineTo(x0, y0 - 6);
    c.lineTo(x0, y1 - rad); c.arcTo(x0, y1, x0 + rad, y1, rad);
    c.lineTo(x1 - rad, y1); c.arcTo(x1, y1, x1, y1 - rad, rad);
    c.lineTo(x1, y0 - 6); c.lineTo(x1 + 3, y0 - 12);
    c.strokeStyle = LD.alpha(col.text, col.dark ? 0.55 : 0.45); c.lineWidth = 2; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,' + (col.dark ? 0.18 : 0.6) + ')'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x0 + 6, y0 + 4); c.lineTo(x0 + 6, y1 - rad - 2); c.stroke();
    // 高光
    const hg = c.createLinearGradient(x0 + 8, 0, x0 + 22, 0);
    hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(0.5, 'rgba(255,255,255,' + (col.dark ? 0.12 : 0.38) + ')'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = hg; c.fillRect(x0 + 8, y0 + 2, 14, bh - 16);
    // 刻度
    c.strokeStyle = LD.alpha(col.text, 0.35); c.lineWidth = 1;
    for (let k = 1; k <= 4; k++) { const y = Math.round(y1 - bh * 0.17 * k) + 0.5; c.beginPath(); c.moveTo(x0 + bw * 0.06, y); c.lineTo(x0 + bw * (k % 2 ? 0.16 : 0.22), y); c.stroke(); }
    c.restore();
    // 放大鏡的鏡片（在燒杯上）
    const lx = cx - bw * 0.16, ly = y0 + bh * 0.66, lr = Math.max(8, bw * 0.12);
    c.save();
    c.strokeStyle = LD.alpha(col.text, col.dark ? 0.35 : 0.28); c.lineWidth = 1; c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(lx - lr, ly); c.lineTo(cx - G.R * 0.92, G.zy - G.R * 0.4); c.stroke();
    c.beginPath(); c.moveTo(lx + lr, ly); c.lineTo(cx + G.R * 0.92, G.zy - G.R * 0.4); c.stroke();
    c.setLineDash([]);
    c.beginPath(); c.arc(lx, ly, lr, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,' + (col.dark ? 0.08 : 0.22) + ')'; c.fill();
    c.lineWidth = 2; c.strokeStyle = LD.alpha(col.text, col.dark ? 0.55 : 0.45); c.stroke();
    c.restore();
    // pH 計
    drawMeter(c, id, mx, my, t);
    // 名稱
    let parts = [txt(id + '  ')].concat([txt(spName(r.sp) + ' ')]).concat(fParts(P.SPECIES[r.sp].f));
    if (partsWidth(c, parts, 12.5, '600') + 16 > G.cw - 8) parts = [txt(id + '  ')].concat(fParts(P.SPECIES[r.sp].f)); // 手機寬度放不下名稱時只寫化學式
    richPill(c, parts, cx, y1 + 18, col[id], 12.5, 'center', '600');
  }
  function drawMeter(c, id, mx, my, t) {
    const r = sol[id], w = 98, h = G.meterH, x = mx - w / 2;
    c.save();
    c.shadowColor = col.dark ? 'rgba(0,0,0,0.5)' : LD.alpha(col.text, 0.25); c.shadowBlur = 8; c.shadowOffsetY = 2;
    LD.roundRect(c, x, my, w, h, 8);
    const bg = c.createLinearGradient(0, my, 0, my + h);
    bg.addColorStop(0, col.dark ? '#3a464c' : '#4a585f'); bg.addColorStop(1, col.dark ? '#232c30' : '#2f393e');
    c.fillStyle = bg; c.fill();
    c.restore();
    c.save();
    LD.roundRect(c, x + 5, my + 5, w - 10, h - 10, 4);
    const fresh = flashMeter[id] && t - flashMeter[id] < 600 ? 1 - (t - flashMeter[id]) / 600 : 0;
    c.fillStyle = LD.mix('#b9d3a7', '#e9ffd8', fresh); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#1f3020';
    c.font = '600 10px ' + FONT; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('pH', x + 10, my + h / 2 + 1);
    c.font = '700 19px ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace'; c.textAlign = 'right';
    c.fillText(num(r.pH, 2), x + w - 10, my + h / 2 + 1);
    c.restore();
  }
  const flashMeter = { A: 0, B: 0 };

  function drawMolecule(c, type, x, y, r0, a, alpha) {
    const mol = MOL[type], ca = Math.cos(a), sa = Math.sin(a);
    if (alpha < 1) c.globalAlpha = alpha;
    // 先畫後面的原子（依 y 偏移排序，讓 H 不會整個被蓋住）
    for (let j = 0; j < mol.length; j++) {
      const at = mol[j], ox = (at[1] * ca - at[2] * sa) * r0, oy = (at[1] * sa + at[2] * ca) * r0;
      LD.ball(c, x + ox, y + oy, Math.max(1.2, Math.round(ATOM_R[at[0]] * r0 * 4) / 4), col.atom[at[0]], { shadow: false, glow: 0 });
    }
    if (alpha < 1) c.globalAlpha = 1;
  }
  function drawZoom(c, id, t) {
    const i = IDS.indexOf(id), cx = G.cx[i], cy = G.zy, R = G.R, r = sol[id], pool = pools[id];
    const lc = liquidColor(r), r0 = R * 0.052, S = R * 0.98;
    c.save();
    // 外框陰影
    c.save(); c.shadowColor = col.dark ? 'rgba(0,0,0,0.55)' : LD.alpha(col.text, 0.25); c.shadowBlur = 12; c.shadowOffsetY = 3;
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fillStyle = col.bg; c.fill(); c.restore();
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
    const bg = c.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    bg.addColorStop(0, LD.alpha(LD.shade(lc, 0.55), state.ind ? 0.32 : 0.35));
    bg.addColorStop(1, LD.alpha(lc, state.ind ? 0.38 : 0.45));
    c.fillStyle = bg; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    // 水分子（淡）
    for (let k = 0; k < 40 && k < pool.water.length; k++) {
      const p = pool.water[k];
      drawMolecule(c, 'H2O', cx + p.x * S, cy + p.y * S, r0 * 0.9, p.a, col.dark ? 0.3 : 0.38);
    }
    // 溶質與離子（依 z 由遠到近）
    const list = [];
    pool.units.forEach(function (u) { list.push({ p: u, type: unitType(pool.sp, u.st) }); });
    pool.free.forEach(function (f) { list.push({ p: f, type: f.type }); });
    list.sort(function (a, b) { return a.p.z - b.p.z; });
    list.forEach(function (o) {
      const p = o.p, x = cx + p.x * S, y = cy + p.y * S, fade = Math.min(1, (t - p.born) / 300);
      const q = CHARGE[o.type] || 0;
      if (q) {
        c.beginPath(); c.arc(x, y, r0 * 2.0, 0, Math.PI * 2);
        c.strokeStyle = LD.alpha(q > 0 ? col.pos : col.neg, 0.85 * fade); c.lineWidth = 1.6; c.stroke();
        c.fillStyle = LD.alpha(q > 0 ? col.pos : col.neg, (col.dark ? 0.16 : 0.12) * fade); c.fill();
      }
      drawMolecule(c, o.type, x, y, r0, p.a, (0.75 + 0.25 * (p.z + 1) / 2) * fade);
    });
    // 解離／結合的閃光
    pool.flashes.forEach(function (f) {
      const u = (t - f.t0) / FL_DUR;
      LD.ripple(c, cx + f.x * S, cy + f.y * S, r0 * 2, u, f.kind ? col.neg : col.pos);
    });
    // 玻璃鏡片的反光
    const hl = c.createRadialGradient(cx - R * 0.45, cy - R * 0.5, 0, cx - R * 0.45, cy - R * 0.5, R * 0.7);
    hl.addColorStop(0, 'rgba(255,255,255,' + (col.dark ? 0.1 : 0.28) + ')'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = hl; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    c.restore();
    // 鏡框
    c.save();
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2);
    c.lineWidth = 5; c.strokeStyle = col.dark ? '#56656c' : '#8a989e'; c.stroke();
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,' + (col.dark ? 0.25 : 0.7) + ')';
    c.beginPath(); c.arc(cx, cy, R - 1.5, Math.PI * 1.05, Math.PI * 1.6); c.stroke();
    c.restore();
    // 讀數
    const tg = pool.tg;
    if (r.kind === 'water') {
      const sp = sciAlways(r.waterPerH3O, 2);
      const ratio = [txt('1 : ' + sp.m + ' × 10'), txt(num(sp.e, 0), { sup: true })];
      let wp = [txt('H'), txt('3', { sub: true }), txt('O'), txt('+', { sup: true }), txt(' : H'), txt('2', { sub: true }), txt('O = ')].concat(ratio);
      if (partsWidth(c, wp, 11) + 16 > G.cw - 6) wp = ratio; // 手機放不下時只寫比例（說明在頁面文字）
      richPill(c, wp, cx, cy + R + 2, col.muted, 11);
    } else {
      const a = r.sp === 'HX' && !unkRevealed ? '?' : pctPlain(r.alpha);
      const parts = [txt(T('解離 ', 'ionised ')), txt(a)];
      richPill(c, parts, cx, cy + R + 2, col[id], 12, 'center', '600');
      if (tg && tg.capped) richPill(c, [txt(T('另有更多水解離的離子', 'plus more ions from water'))], cx, cy - R + 2, col.muted, 10.5);
    }
  }
  function phX(pH) { const x0 = 18, x1 = W - 18; return x0 + (x1 - x0) * Math.max(0, Math.min(14, pH)) / 14; }
  function drawScale(c) {
    const y = G.sy, h = 16, x0 = 18, x1 = W - 18;
    c.save();
    const g = c.createLinearGradient(x0, 0, x1, 0);
    UNI.forEach(function (s) { g.addColorStop(s[0] / 14, s[1]); });
    c.shadowColor = col.dark ? 'rgba(0,0,0,0.5)' : LD.alpha(col.text, 0.2); c.shadowBlur = 6; c.shadowOffsetY = 2;
    LD.roundRect(c, x0, y, x1 - x0, h, 6); c.fillStyle = g; c.fill();
    c.shadowColor = 'transparent';
    const gl = c.createLinearGradient(0, y, 0, y + h);
    gl.addColorStop(0, 'rgba(255,255,255,0.35)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(0,0,0,0.12)');
    c.fillStyle = gl; LD.roundRect(c, x0, y, x1 - x0, h, 6); c.fill();
    // 刻度
    c.fillStyle = col.muted; c.font = '11px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'top';
    for (let k = 0; k <= 14; k++) {
      const x = phX(k);
      if (W < 480 && k % 2) { c.fillRect(Math.round(x), y + h, 1, 3); continue; }
      c.fillRect(Math.round(x), y + h, 1, 4);
      c.fillText(String(k), x, y + h + 5);
    }
    // 中性記號
    const nx = phX(sol.A.neutral);
    c.strokeStyle = col.dark ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.95)'; c.lineWidth = 2; c.setLineDash([3, 2]);
    c.beginPath(); c.moveTo(nx, y - 3); c.lineTo(nx, y + h + 3); c.stroke(); c.setLineDash([]);
    c.strokeStyle = LD.alpha(col.text, 0.6); c.lineWidth = 1;
    c.beginPath(); c.moveTo(nx, y - 3); c.lineTo(nx, y + h + 3); c.stroke();
    const ly = y + h + 26;
    LD.haloText(c, T('← 酸性', '← acidic'), x0, ly, col.muted, 'left', 'middle', '12px ' + FONT);
    LD.haloText(c, T('鹼性 →', 'basic →'), x1, ly, col.muted, 'right', 'middle', '12px ' + FONT);
    LD.haloText(c, T('中性 ', 'neutral ') + num(sol.A.neutral, 2), Math.max(x0 + 90, Math.min(x1 - 90, nx)), ly, col.text, 'center', 'middle', '600 12px ' + FONT);
    // 兩杯的位置
    // 兩個標籤靠太近時左右推開，用細線連到真正的位置
    const xs = IDS.map(function (id) { return phX(sol[id].pH); });
    const labs = IDS.map(function (id) { return id + ' ' + num(sol[id].pH, 2); });
    const ws = labs.map(function (l) { return partsWidth(c, [txt(l)], 12, '700') + 14; });
    const pxs = xs.slice();
    const gap = (ws[0] + ws[1]) / 2 + 6;
    if (Math.abs(xs[0] - xs[1]) < gap) {
      const mid = (xs[0] + xs[1]) / 2, left = xs[0] <= xs[1] ? 0 : 1;
      pxs[left] = mid - gap / 2; pxs[1 - left] = mid + gap / 2;
    }
    for (let i = 0; i < 2; i++) pxs[i] = Math.max(x0 + ws[i] / 2, Math.min(x1 - ws[i] / 2, pxs[i]));
    if (Math.abs(pxs[0] - pxs[1]) < gap) { // 被邊界擠回來：從邊界那一側重排
      if (pxs[0] < pxs[1]) { if (pxs[0] <= x0 + ws[0] / 2 + 0.5) pxs[1] = pxs[0] + gap; else pxs[0] = pxs[1] - gap; }
      else { if (pxs[1] <= x0 + ws[1] / 2 + 0.5) pxs[0] = pxs[1] + gap; else pxs[1] = pxs[0] - gap; }
    }
    IDS.forEach(function (id, i) {
      const x = xs[i], ly2 = y - 19;
      c.fillStyle = col[id];
      c.beginPath(); c.moveTo(x, y + 1); c.lineTo(x - 6, y - 8); c.lineTo(x + 6, y - 8); c.closePath(); c.fill();
      if (Math.abs(pxs[i] - x) > 2) { c.strokeStyle = col[id]; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y - 7); c.lineTo(pxs[i], ly2 + 8); c.stroke(); }
      richPill(c, [txt(labs[i])], pxs[i], ly2 - (Math.abs(pxs[i] - x) > 2 ? 6 : 0), col[id], 12, 'center', '700');
    });
    c.restore();
  }
  let lastDraw = 0;
  function drawStage(t) {
    if (!G || !sol.A || state.view === '3d') return;
    lastDraw = t;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(ctx, W, H);
    IDS.forEach(function (id) { drawZoom(ctx, id, t); });
    IDS.forEach(function (id) { drawBeaker(ctx, id, t); });
    drawScale(ctx);
  }

  // ======================= 圖表 =======================
  let GW = 0, GH = 0, gdpr = 1;
  function resizeGraph() {
    GW = gcv.clientWidth; GH = gcv.clientHeight || 300;
    if (!GW) return;
    gdpr = Math.min(window.devicePixelRatio || 1, 2.5);
    gcv.width = Math.round(GW * gdpr); gcv.height = Math.round(GH * gdpr);
  }
  function curveOf(sp) {
    if (sp === 'water' || (sp === 'HX' && !unkRevealed)) return null;
    const pts = [];
    for (let k = 0; k <= 160; k++) {
      const lc = -8 + k / 20, r = P.solution(sp, lc, state.T, unk.Ka);
      pts.push([lc, state.tab === 'ph' ? r.pH : r.alpha * 100]);
    }
    return pts;
  }
  function drawGraph() {
    if (!GW || !sol.A) return;
    const c = gctx;
    c.setTransform(gdpr, 0, 0, gdpr, 0, 0);
    LD.backdrop(c, GW, GH);
    const L = 46, R = 14, Tp = 16, B = 42, pw = GW - L - R, ph = GH - Tp - B;
    const isPH = state.tab === 'ph', yMax = isPH ? 14 : 100;
    const X = function (lc) { return L + (lc + 8) / 8 * pw; }, Y = function (v) { return Tp + ph * (1 - v / yMax); };
    // 格線
    c.save();
    c.strokeStyle = LD.alpha(col.text, col.dark ? 0.1 : 0.08); c.lineWidth = 1;
    for (let k = -8; k <= 0; k++) { const x = Math.round(X(k)) + 0.5; c.beginPath(); c.moveTo(x, Tp); c.lineTo(x, Tp + ph); c.stroke(); }
    const ys = isPH ? [0, 2, 4, 6, 8, 10, 12, 14] : [0, 20, 40, 60, 80, 100];
    ys.forEach(function (v) { const y = Math.round(Y(v)) + 0.5; c.beginPath(); c.moveTo(L, y); c.lineTo(L + pw, y); c.stroke(); });
    c.strokeStyle = LD.alpha(col.text, 0.45);
    c.beginPath(); c.moveTo(L + 0.5, Tp); c.lineTo(L + 0.5, Tp + ph + 0.5); c.lineTo(L + pw, Tp + ph + 0.5); c.stroke();
    // 刻度文字
    c.fillStyle = col.muted; c.font = '11px ' + FONT;
    c.textAlign = 'right'; c.textBaseline = 'middle';
    ys.forEach(function (v) { c.fillText(isPH ? String(v) : v + '%', L - 5, Y(v)); });
    for (let k = -8; k <= 0; k++) {
      if (GW < 480 && k % 2) continue;
      if (k === 0) { LD.haloText(c, '1', X(k), Tp + ph + 15, col.muted, 'center', 'middle', '11px ' + FONT); continue; }
      LD.supText(c, '10', num(k, 0), X(k), Tp + ph + 19, col.muted, '11px ' + FONT, 'center');
    }
    LD.haloText(c, T('濃度 C（M，對數刻度）', 'Concentration C (M, log scale)'), L + pw / 2, GH - 8, col.muted, 'center', 'middle', '12px ' + FONT);
    c.save(); c.translate(12, Tp + ph / 2); c.rotate(-Math.PI / 2);
    LD.haloText(c, isPH ? 'pH' : T('解離百分率 α', 'Degree of ionisation α'), 0, 0, col.muted, 'center', 'middle', '12px ' + FONT);
    c.restore();
    // 中性線
    if (isPH) {
      const y = Y(sol.A.neutral);
      c.strokeStyle = LD.alpha(col.text, 0.5); c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(L, y); c.lineTo(L + pw, y); c.stroke(); c.setLineDash([]);
      LD.haloText(c, T('中性 ', 'neutral ') + num(sol.A.neutral, 2), L + pw - 4, y - 8, col.muted, 'right', 'middle', '11px ' + FONT);
    }
    // 曲線
    c.save();
    c.beginPath(); c.rect(L, Tp - 2, pw + 2, ph + 4); c.clip();
    const drawn = {};
    IDS.forEach(function (id) {
      const sp = state.b[id].sp;
      if (drawn[sp]) return;
      drawn[sp] = true;
      const pts = curveOf(sp);
      if (!pts) return;
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = LD.alpha(col[id], 0.35); c.lineWidth = 5;
      c.beginPath(); pts.forEach(function (p, k) { const x = X(p[0]), y = Y(p[1]); if (k) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke();
      c.strokeStyle = col[id]; c.lineWidth = 2; c.stroke();
    });
    // 記錄的點
    rows.forEach(function (rw) {
      if (rw.sp === 'water') return;
      const v = isPH ? rw.pH : (rw.sp === 'HX' && rw.unkId === unkId && !unkRevealed) || (rw.sp === 'HX' && rw.unkId !== unkId) ? null : rw.alpha * 100;
      if (v == null) return;
      const x = X(rw.logC), y = Y(v), same = Math.abs(rw.T - state.T) < 0.5;
      c.globalAlpha = same ? 1 : 0.4;
      if (rw.id === 'A') LD.ball(c, x, y, 4.2, col.A, { shadow: false });
      else { c.fillStyle = col.B; c.strokeStyle = col.bg; c.lineWidth = 1; c.fillRect(x - 3.8, y - 3.8, 7.6, 7.6); c.strokeRect(x - 3.8, y - 3.8, 7.6, 7.6); }
      c.globalAlpha = 1;
    });
    c.restore();
    // 現在的位置
    IDS.forEach(function (id) {
      const r = sol[id];
      if (r.kind === 'water') return;
      const v = isPH ? r.pH : (r.sp === 'HX' && !unkRevealed ? null : r.alpha * 100);
      if (v == null) return;
      const x = X(r.logC), y = Y(v);
      c.strokeStyle = col[id]; c.lineWidth = 2.5;
      c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.stroke();
      LD.haloText(c, id, x + (id === 'A' ? -11 : 11), y - 11, col[id], 'center', 'middle', '700 12px ' + FONT);
    });
    c.restore();
  }
  function updateGraphText() {
    const lg = [];
    const done = {};
    IDS.forEach(function (id) {
      const sp = state.b[id].sp;
      if (done[sp] || sp === 'water') return;
      done[sp] = true;
      lg.push('<span><i class="ln" style="background:' + col[id] + '"></i>' + spName(sp) + ' ' + fH(P.SPECIES[sp].f) + (sp === 'HX' && !unkRevealed ? T('（揭曉前不畫曲線）', ' (curve hidden until revealed)') : '') + '</span>');
    });
    lg.push('<span><span class="sp" style="background:' + col.A + '"></span>' + T('A 杯的紀錄', 'beaker A, recorded') + '</span>');
    lg.push('<span><span class="sp" style="background:' + col.B + ';border-radius:2px"></span>' + T('B 杯的紀錄', 'beaker B, recorded') + '</span>');
    lg.push('<span><span class="ring" style="color:' + col.muted + '"></span>' + T('現在', 'now') + '</span>');
    if (state.tab === 'ph') lg.push('<span><i class="ln dash" style="color:' + col.muted + '"></i>' + T('中性', 'neutral') + '</span>');
    $('gLegend').innerHTML = lg.join('');
    $('gHint').textContent = state.tab === 'ph'
      ? T('強酸稀釋 10 倍 pH 加 1（斜率 1）；弱酸約加 0.5（斜率 ½）。很稀的時候，每條曲線都彎向中性線，不會越過去。淡色的點是在別的溫度記錄的。',
        'Diluting a strong acid ten times adds 1 to the pH (slope 1); a weak acid adds about 0.5 (slope ½). When very dilute, every curve bends towards the neutral line without crossing it. Faded points were recorded at another temperature.')
      : T('弱酸越稀，解離百分率越大（奧士華稀釋定律）；但 Ka 比 10^-7 還小的酸，再稀也有上限，因為水本身的 H3O+ 會把平衡推回去。',
        'The more dilute a weak acid, the larger its degree of ionisation (Ostwald’s dilution law); but an acid with Ka below about 10^-7 has a ceiling, because the H3O+ from water itself pushes the equilibrium back.');
  }

  // ======================= 讀數與紀錄表 =======================
  function cHTML(r) { return r.kind === 'water' ? '—' : sciAlwaysHTML(r.C, 3); }
  function kHTML(r) {
    if (r.kind === 'water') return '—';
    if (r.kind === 'sa' || r.kind === 'sb') return T('很大', 'very large');
    if (r.sp === 'HX' && !unkRevealed) return '?';
    return sciAlwaysHTML(r.K, 2) + '<br><small>' + (r.kind === 'wb' ? 'K<sub>b</sub>' : 'K<sub>a</sub>') + '</small>';
  }
  function updateReadouts() {
    const a = sol.A, b = sol.B;
    const row = function (th, fa, fb) { return '<tr><th scope="row">' + th + '</th><td>' + fa + '</td><td>' + fb + '</td></tr>'; };
    let h = '<colgroup><col><col><col></colgroup><thead><tr><th></th><th style="color:' + col.A + '">' + T('A 杯', 'A') + '</th><th style="color:' + col.B + '">' + T('B 杯', 'B') + '</th></tr></thead><tbody>';
    h += row(T('物質', 'Substance'), fH(P.SPECIES[a.sp].f) + '<br><small>' + kindName(a.kind) + '</small>', fH(P.SPECIES[b.sp].f) + '<br><small>' + kindName(b.kind) + '</small>');
    h += row(T('濃度 C（M）', 'C (M)'), cHTML(a), cHTML(b));
    h += row('pH', '<b>' + num(a.pH, 2) + '</b>', '<b>' + num(b.pH, 2) + '</b>');
    h += row('pOH', num(a.pOH, 2), num(b.pOH, 2));
    h += row('[H<sub>3</sub>O<sup>+</sup>]（M）'.replace('（M）', T('（M）', ' (M)')), sciAlwaysHTML(a.h, 3), sciAlwaysHTML(b.h, 3));
    h += row('[OH<sup>−</sup>]（M）'.replace('（M）', T('（M）', ' (M)')), sciAlwaysHTML(a.oh, 3), sciAlwaysHTML(b.oh, 3));
    const al = function (r) { return r.kind === 'water' ? '—' : r.sp === 'HX' && !unkRevealed ? '?' : pct(r.alpha); };
    h += row(T('解離百分率 α', 'Ionised α'), al(a), al(b));
    h += row(T('K<sub>a</sub> 或 K<sub>b</sub>', 'K<sub>a</sub> or K<sub>b</sub>'), kHTML(a), kHTML(b));
    const ap = function (r) { return r.kind === 'water' || (r.sp === 'HX' && !unkRevealed) ? '—' : num(r.pHapprox, 2); };
    h += row(T('近似式的 pH', 'Shortcut pH'), ap(a), ap(b));
    $('nowTbl').innerHTML = h + '</tbody>';
    $('readout').innerHTML = '<dt>K<sub>w</sub>' + T('（', ' (') + num(state.T, 0) + ' °C' + T('）', ')') + '</dt><dd>' + sciAlwaysHTML(a.Kw, 3) + '</dd>' +
      '<dt>pK<sub>w</sub></dt><dd>' + num(a.pKw, 2) + '</dd>' +
      '<dt>' + T('中性時的 pH', 'Neutral pH') + '<small>' + T('[H<sub>3</sub>O<sup>+</sup>] = [OH<sup>−</sup>]', '[H<sub>3</sub>O<sup>+</sup>] = [OH<sup>−</sup>]') + '</small></dt><dd>' + num(a.neutral, 2) + '</dd>';
  }
  function updateTable() {
    const el = $('tbl');
    let h = '<thead><tr><th>#</th><th>' + T('杯', 'Beaker') + '</th><th class="l">' + T('物質', 'Substance') + '</th><th>C<br><small>M</small></th><th>T<br><small>°C</small></th><th>pH</th><th>[H<sub>3</sub>O<sup>+</sup>]<br><small>M</small></th><th>α</th></tr></thead><tbody>';
    if (!rows.length) h += '<tr class="empty"><td colspan="8">' + T('按「測量並記錄」，兩杯此刻的讀數會記在這裡。', 'Press “Measure & record” to note the readings of both beakers here.') + '</td></tr>';
    for (let k = rows.length - 1; k >= 0; k--) {
      const r = rows[k];
      const hideA = r.sp === 'HX' && !(r.unkId === unkId && unkRevealed);
      h += '<tr><td>' + r.n + '</td><td style="color:' + col[r.id] + ';font-weight:700">' + r.id + '</td><td class="l">' + fH(P.SPECIES[r.sp].f) + (r.sp === 'HX' && r.unkId !== unkId ? T('（舊）', ' (old)') : '') + '</td><td>' +
        (r.sp === 'water' ? '—' : sciAlwaysHTML(r.C, 3)) + '</td><td>' + num(r.T, 0) + '</td><td>' + num(r.pH, 2) + '</td><td>' + sciAlwaysHTML(r.h, 3) + '</td><td>' +
        (r.sp === 'water' ? '—' : hideA ? '?' : pct(r.alpha)) + '</td></tr>';
    }
    el.innerHTML = h + '</tbody>';
  }
  function updateLegend() {
    const seen = {}, items = [];
    function add(type) {
      if (seen[type]) return;
      seen[type] = true;
      const main = MOL[type].reduce(function (m, a) { return ATOM_R[a[0]] > ATOM_R[m] ? a[0] : m; }, MOL[type][0][0]);
      const q = CHARGE[type] || 0;
      items.push('<span><span class="sp" style="background:' + col.atom[main] + (q ? ';box-shadow:0 0 0 2px ' + (q > 0 ? col.pos : col.neg) : '') + '"></span>' + fH(ION_F[type]) + '</span>');
    }
    IDS.forEach(function (id) {
      const sp = state.b[id].sp;
      if (sp === 'water') return;
      add(unitType(sp, 0)); add(unitType(sp, 1));
    });
    add('H3O'); add('OH'); add('H2O');
    const atoms = ['H', 'O', 'C', 'N', 'Cl', 'F', 'Na', 'X'].map(function (a) { return '<span><span class="sp" style="background:' + col.atom[a] + '"></span>' + a + '</span>'; });
    $('spLegend').innerHTML = items.join('') + '<span>' + T('原子：', 'Atoms: ') + '</span>' + atoms.join('');
  }
  function updateControls() {
    IDS.forEach(function (id) {
      const b = state.b[id], el = elC[id], water = b.sp === 'water';
      el.disabled = water;
      $('c' + id + 'o').innerHTML = water ? T('不適用', 'not used') : '10<sup>' + num(b.logC, 2) + '</sup> M';
      $('c' + id + 'v').innerHTML = water ? T('純水不用設定濃度。', 'Pure water has no solute concentration.') : '= ' + sciAlwaysHTML(Math.pow(10, b.logC), 3) + ' M' + (b.logC <= -6.995 ? T('（比水本身的 H<sub>3</sub>O<sup>+</sup> 還稀）', ' (more dilute than the H<sub>3</sub>O<sup>+</sup> from water itself)') : '');
      $('dil' + id).disabled = water || b.logC - 1 < -8 - 1e-9;
      document.querySelectorAll('#sp' + id + ' button').forEach(function (bt) { bt.setAttribute('aria-pressed', String(bt.dataset.sp === b.sp)); });
    });
    $('tempo').textContent = num(state.T, 0) + ' °C';
  }
  function refreshAll() {
    compute();
    IDS.forEach(syncPool);
    updateControls();
    updateReadouts();
    updateLegend();
    updateGraphText();
    updateTable();
    drawGraph();
    drawStage(now());
    if (view3 && view3.active) view3.frame(now());
  }
  let statusTimer = 0;
  function setStatus(s) { $('status').innerHTML = s || ''; }

  // ======================= 操作 =======================
  function buildSpeciesButtons() {
    IDS.forEach(function (id) {
      const box = $('sp' + id);
      box.innerHTML = P.ORDER.map(function (sp) {
        const n = SPN[sp];
        // 英文長字（Hypochlorous 等）在窄按鈕裡會被硬切，加軟連字號讓它在字根處斷行
        const en = n[1].replace(/^(Hypo|Hydro)(?=[a-z]{6,})/, '$1&shy;');
        return '<button type="button" data-sp="' + sp + '" aria-pressed="false">' + T(n[0], en) + '<small>' + fH(n[2]) + '</small></button>';
      }).join('');
      box.querySelectorAll('button').forEach(function (bt) { bt.addEventListener('click', function () { setSpecies(id, bt.dataset.sp); }); });
    });
  }
  function setSpecies(id, sp) {
    if (state.b[id].sp === sp) return;
    state.b[id].sp = sp;
    chain[id] = null;
    refreshAll();
    const r = sol[id];
    let s = id + T(' 杯：', ': ') + spName(sp) + ' ' + fH(P.SPECIES[sp].f) + T('，', ', ') + kindName(r.kind);
    if (r.kind === 'wa' && sp !== 'HX') s += T('，K<sub>a</sub> = ', ', K<sub>a</sub> = ') + sciAlwaysHTML(r.K, 2);
    if (r.kind === 'wb') s += T('，K<sub>b</sub> = ', ', K<sub>b</sub> = ') + sciAlwaysHTML(r.K, 2);
    if (sp === 'HX') s += T('，K<sub>a</sub> 看不到——用 pH 把它算出來。', '; K<sub>a</sub> is hidden — work it out from the pH.');
    else if (sp === 'HF') s += T('。真實的氫氟酸會腐蝕玻璃，要用塑膠容器。', '. Real hydrofluoric acid attacks glass, so it is kept in plastic.');
    else if (sp === 'water') s += T('。純水裡 [H<sub>3</sub>O<sup>+</sup>] = [OH<sup>−</sup>]。', '. In pure water [H<sub>3</sub>O<sup>+</sup>] = [OH<sup>−</sup>].');
    else s += T('。', '.');
    setStatus(s);
  }
  function onConc(id) {
    if (syncing) return;
    const v = Math.max(-8, Math.min(0, val(elC[id])));
    if (v === state.b[id].logC) { updateControls(); return; }
    state.b[id].logC = v;
    chain[id] = null;
    refreshAll();
  }
  function onTemp() {
    if (syncing) return;
    const v = Math.max(25, Math.min(100, val(elT)));
    if (v === state.T) { updateControls(); return; }
    state.T = v;
    chain.A = chain.B = null;
    refreshAll();
  }
  function dilute(id) {
    const b = state.b[id];
    if (b.sp === 'water' || b.logC - 1 < -8 - 1e-9) return;
    const before = sol[id];
    const ch = chain[id] || { logC0: before.logC, pH0: before.pH, alpha0: before.alpha, k: 0 };
    b.logC = Math.round((b.logC - 1) * 100) / 100;
    setVal(elC[id], b.logC);
    refreshAll();
    const after = sol[id];
    ch.k++;
    chain[id] = ch;
    // 倒水的畫面回饋：放大鏡裡一圈閃光
    const t = now();
    pools[id].flashes.push({ x: 0, y: -0.2, z: 0, t0: t, kind: 1 });
    if (window.LabSound) {
      window.LabSound.noise({ dur: 0.35, gain: 0.25, filter: 900, q: 0.8 });
      window.LabSound.sweep({ from: 700, to: 420, dur: 0.3, gain: 0.12, delay: 0.05 });
    }
    const dp = after.pH - before.pH;
    setStatus(id + T(' 杯加水稀釋 10 倍：pH ', ': diluted ten times — pH ') + num(before.pH, 2) + ' → ' + num(after.pH, 2) + T('（', ' (') + (dp >= 0 ? '+' : '−') + num(Math.abs(dp), 2) + T('）', ')') +
      (after.kind === 'wa' || after.kind === 'wb' ? (after.sp === 'HX' && !unkRevealed ? '' : T('；解離百分率 ', '; ionised ') + pct(before.alpha) + ' → ' + pct(after.alpha)) : '') +
      (ch.k > 1 ? T('；這一串已稀釋 ', '; diluted ') + ch.k + T(' 次（共 10', ' times in a row (10') + '<sup>' + ch.k + '</sup>' + T(' 倍）', ' times in all)') : '') + T('。', '.'));
    emit('dilute', { id: id, sp: b.sp, kind: after.kind, T: state.T, k: ch.k, logC0: ch.logC0, pH0: ch.pH0, alpha0: ch.alpha0,
      pHprev: before.pH, alphaPrev: before.alpha, logC: after.logC, pH: after.pH, alpha: after.alpha, alphaLim: after.alphaLim, K: after.K, Kw: after.Kw, dpH: dp });
  }
  function measure() {
    compute();
    const t = now();
    IDS.forEach(function (id) {
      const r = sol[id];
      rows.push({ n: ++rowN, id: id, sp: r.sp, logC: r.logC, C: r.C, T: state.T, pH: r.pH, h: r.h, alpha: r.alpha, unkId: unkId });
      flashMeter[id] = t;
    });
    if (rows.length > 400) rows = rows.slice(rows.length - 400);
    if (window.LabSound) IDS.forEach(function (id, i) {
      window.LabSound.tone({ freq: 330 * Math.pow(2, (14 - sol[id].pH) / 7), dur: 0.12, gain: 0.22, delay: i * 0.16 });
    });
    setStatus(T('已記錄：', 'Recorded: ') + 'A ' + fH(P.SPECIES[sol.A.sp].f) + ' pH ' + num(sol.A.pH, 2) + T('；', '; ') + 'B ' + fH(P.SPECIES[sol.B.sp].f) + ' pH ' + num(sol.B.pH, 2) + T('。', '.'));
    updateTable();
    drawGraph();
    kick();
    emit('measure', { T: state.T, pKw: sol.A.pKw, neutral: sol.A.neutral, ind: state.ind,
      beakers: IDS.map(function (id) { return Object.assign({}, sol[id], { id: id }); }) });
  }
  // ---------- 未知酸 ----------
  function xMsg(html) { $('xOut').innerHTML = html; }
  function checkAnswer() {
    const s = $('ansK').value.trim().normalize('NFKC').replace(/[，,]/g, '.').replace(/[−–—]/g, '-');
    const a = /^[-+]?(\d+\.?\d*|\.\d+)$/.test(s) ? parseFloat(s) : NaN;
    if (!isFinite(a)) { xMsg(T('請輸入一個數字，例如 4.20。', 'Please enter a number, e.g. 4.20.')); return; }
    if (unkRevealed) { xMsg(T('這一題已經揭曉了，按「換一個」再挑戰。', 'This one has been revealed; press “Another one” to try a new acid.')); return; }
    unkTries++;
    const err = Math.abs(a - unk.pKa);
    let m;
    if (err <= 0.005) m = '<span class="ok">' + T('完全正確！誤差在 0.005 以內。', 'Spot on! Within 0.005.') + '</span>';
    else if (err <= 0.01) m = '<span class="ok">' + T('答對了！誤差在 0.01 以內。', 'Correct! Within 0.01.') + '</span>';
    else if (err <= 0.05) m = '<span class="ok">' + T('答對了！誤差在 0.05 以內。', 'Correct! Within 0.05.') + '</span>';
    else m = '<span class="no">' + T('誤差超過 0.05，再算算看。', 'More than 0.05 off — check your working.') + '</span>';
    xMsg(m + ' ' + T('（第 ' + unkTries + ' 次核對）', '(check number ' + unkTries + ')'));
    if (window.LabSound) {
      if (err <= 0.05) { window.LabSound.tone({ freq: 660, dur: 0.1, gain: 0.25 }); window.LabSound.tone({ freq: 990, dur: 0.16, gain: 0.22, delay: 0.1 }); }
      else window.LabSound.tone({ freq: 300, dur: 0.18, gain: 0.25, type: 'triangle' });
    }
    emit('answer', { ans: a, err: err, revealed: unkRevealed, tries: unkTries });
  }
  function reveal() {
    unkRevealed = true;
    xMsg(T('答案：pK<sub>a</sub> = ', 'Answer: pK<sub>a</sub> = ') + num(unk.pKa, 3) + T('（K<sub>a</sub> = ', ' (K<sub>a</sub> = ') + sciAlwaysHTML(unk.Ka, 3) + T('）。這一題已揭曉，按「換一個」再挑戰。', '). This one is revealed; press “Another one” to try again.'));
    refreshAll();
  }
  function newUnknown() {
    unk = P.newUnknown(); unkRevealed = false; unkTries = 0; unkId++;
    IDS.forEach(function (id) { if (state.b[id].sp === 'HX') chain[id] = null; });
    $('ansK').value = '';
    xMsg(T('換了一種新的未知酸 HX。', 'A new unknown acid HX is ready.'));
    refreshAll();
  }

  // ======================= 3D 檢視 =======================
  let threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
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
      T: T, host: host3, IDS: IDS, pools: pools, MOL: MOL, ATOM_R: ATOM_R, CHARGE: CHARGE, unitType: unitType, FL_DUR: FL_DUR,
      colors: function () { return col; },
      liquid: function (id) { return liquidColor(sol[id]); },
      ind: function () { return state.ind; },
      label: function (id) {
        const r = sol[id];
        return { name: id + '  ' + spName(r.sp), f: P.SPECIES[r.sp].f, pH: 'pH ' + num(r.pH, 2),
          alpha: r.kind === 'water' ? T('中性', 'neutral') : T('解離 ', 'ionised ') + (r.sp === 'HX' && !unkRevealed ? '?' : pctPlain(r.alpha)) };
      },
      hud: function () {
        const line = function (id) { const r = sol[id]; return id + T('：', ': ') + P.SPECIES[r.sp].f + ' · pH ' + num(r.pH, 2); };
        return { tl: line('A'), tr: line('B') };
      },
      reduced: reducedMotion,
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
      if (!webglAvailable() || !window.Ph3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        state.view = '3d';
        view3 = window.Ph3D.create(lib, host3Api());
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        view3.frame(now());
        kick();
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
      kick();
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

  // ======================= 動畫迴圈（全頁只有一條） =======================
  let raf = 0, lastT = 0;
  function loop(t) {
    raf = 0;
    if (document.hidden) return;
    const dt = Math.min(1 / 30, Math.max(0, (t - lastT) / 1000));
    lastT = t;
    if (!reducedMotion) IDS.forEach(function (id) { stepPool(id, dt, t); });
    if (state.view === '3d') { if (view3 && view3.active) view3.frame(t); }
    else if (reducedMotion || t - lastDraw > 30) drawStage(t);
    if (!reducedMotion) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf) { lastT = now(); raf = requestAnimationFrame(loop); } }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });

  // ======================= 事件 =======================
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  IDS.forEach(function (id) {
    elC[id].addEventListener('input', function () { onConc(id); });
    $('dil' + id).addEventListener('click', function () { dilute(id); });
  });
  elT.addEventListener('input', onTemp);
  elInd.addEventListener('change', function () {
    state.ind = elInd.checked;
    setStatus(state.ind ? T('加入廣用指示劑：顏色從紅（強酸）、橙、黃、綠（中性附近）、藍到紫（強鹼）。', 'Universal indicator added: red (strong acid), orange, yellow, green (near neutral), blue and violet (strong base).')
      : T('拿掉指示劑：無色的溶液看不出酸鹼，只能靠 pH 計。', 'Indicator removed: colourless solutions all look the same; only the pH meter can tell them apart.'));
    refreshAll();
  });
  $('measure').addEventListener('click', measure);
  $('clearAll').addEventListener('click', function () {
    rows = [];
    setStatus(T('已清除紀錄表與圖上的點；兩杯溶液不變。', 'The table and the recorded points have been cleared; the beakers are unchanged.'));
    updateTable(); drawGraph();
  });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
    if (ev.detail && ev.detail.name === 'fs') { resize(); resizeGraph(); drawGraph(); }
  });
  document.querySelectorAll('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.tab = b.dataset.tab;
      document.querySelectorAll('#tabs button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      updateGraphText(); drawGraph();
    });
  });
  $('check').addEventListener('click', checkAnswer);
  $('ansK').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); checkAnswer(); } });
  $('reveal').addEventListener('click', reveal);
  $('newX').addEventListener('click', newUnknown);
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  function themeChanged() {
    readColors();
    refreshAll();
    if (view3 && view3.active) view3.onTheme();
  }
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lg = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth && gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', function () { resize(); resizeGraph(); drawGraph(); });

  // 測試用（Playwright）：讀取目前狀態
  window.__ph = {
    state: state, sol: function () { return sol; }, rows: function () { return rows; }, unk: function () { return unk; },
    pools: function () { return pools; }, chain: function () { return chain; }, view3: function () { return view3; }
  };

  // ======================= 啟動 =======================
  readColors();
  buildSpeciesButtons();
  setVal(elC.A, state.b.A.logC); setVal(elC.B, state.b.B.logC); setVal(elT, state.T);
  elInd.checked = state.ind;
  updateSoundButton();
  compute();
  IDS.forEach(syncPool);
  resizeGraph();
  resize();
  refreshAll();
  kick();
  if (reducedMotion) setStatus(T('已偵測到「減少動態效果」設定：粒子不會移動，讀數照常更新。', 'Reduced motion is on: the particles stay still, but every reading still updates.'));
})();
