/* magma-crystallization.js — 「岩漿冷卻：晶體大小與鮑文反應序列」的畫面與互動
 * 物理計算全部在 magma-crystallization-core.js。 */
(function () {
  'use strict';
  const MC = window.MagmaCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FONT = D.FONT;
  const DUR = 8;               // 冷卻動畫的長度（秒）
  const PDUR = 10;             // 斜長石降溫動畫的長度（秒）

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { size: $('size'), dep: $('dep'), pos: $('pos'), phen: $('phen'), an0: $('an0'), temp: $('temp') };
  const state = {
    mode: 'cool',
    type: 'basalt', a: 4, z: 0, xr: 0, phen: 0, preset: 'penghu',
    chart: 'Tt', run: null, log: [], acted: false,
    meth: 'eq', an0: 0.6, T: 1520, prun: null
  };
  if (window.LabNum) window.LabNum.register(el.size, { toValue: function (p) { return Math.pow(10, p); }, toPos: Math.log10, min: 0.01, max: 3000, decimals: 2 });

  function presetOf(id) { return MC.PRESETS.filter(function (p) { return p.id === id; })[0]; }
  function setSlider(inp, v) { if (window.LabNum) window.LabNum.set(inp, v); else inp.value = v; }
  function applyPreset(id) {
    const p = presetOf(id);
    state.type = p.type; state.a = p.a; state.z = p.z; state.xr = p.xr; state.phen = p.phen;
    setSlider(el.size, p.a); setSlider(el.dep, p.z); setSlider(el.pos, p.xr); setSlider(el.phen, Math.round(p.phen * 100));
    state.preset = id;
  }
  function readSliders() {
    state.a = Math.max(0.01, Math.min(3000, val(el.size)));
    state.z = Math.max(0, Math.min(15, val(el.dep)));
    state.xr = Math.max(0, Math.min(1, val(el.pos)));
    state.phen = Math.max(0, Math.min(0.4, val(el.phen) / 100));
    state.an0 = Math.max(0, Math.min(1, val(el.an0) / 100));
    state.T = Math.max(1100, Math.min(1560, val(el.temp)));
  }
  let res = null, resKey = '', resC = null, resCKey = '';
  function R() {
    const key = [state.type, state.a, state.z, state.xr, state.phen].join('|');
    if (res && key === resKey) return res;
    res = MC.cool({ type: state.type, a: state.a, z: state.z, xr: state.xr, phen: state.phen });
    resKey = key; xtl = null;
    return res;
  }
  function RC() {
    if (state.xr === 0) return R();
    const key = [state.type, state.a, state.z, state.phen].join('|');
    if (resC && key === resCKey) return resC;
    resC = MC.cool({ type: state.type, a: state.a, z: state.z, xr: 0, phen: state.phen });
    resCKey = key;
    return resC;
  }
  function plag() {
    const x0 = state.an0, Tc = state.T;
    const eq = MC.equilibrium(x0, Tc), fr = MC.fractional(x0, Tc);
    return { eq: eq, fr: fr, TL: eq.TL, TS: eq.TS, x0: x0, T: Tc };
  }

  // =====================================================================
  // 文字
  // =====================================================================
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface',
      '--mc-hot', '--mc-melt', '--mc-cold', '--mc-host0', '--mc-host1', '--mc-T', '--mc-X', '--mc-G', '--mc-I', '--mc-tl', '--mc-tg',
      '--mc-an', '--mc-ab', '--mc-liq', '--mc-xtl']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function sig(v, n) {
    if (v == null || !isFinite(v)) return '—';
    if (v === 0) return '0';
    const d = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(v))));
    return num(v, Math.min(6, d));
  }
  function outNum(v, lo, hi) {
    let t = v.toFixed(hi);
    if (hi > lo) t = t.replace(new RegExp('0{1,' + (hi - lo) + '}$'), '').replace(/\.$/, '');
    return t.replace('-', '−');
  }
  function setHTML(id, html) { const e = $(id); if (e && e.innerHTML !== html) e.innerHTML = html; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function setStatus(msg) { setHTML('status', msg); }
  /** 長度（m）→ 文字 */
  function lenM(m) {
    if (m >= 1000) return sig(m / 1000, 3) + ' km';
    if (m >= 1) return sig(m, 3) + ' m';
    return sig(m * 100, 2) + ' cm';
  }
  /** 晶體大小（mm）→ 文字 */
  function lenMM(mm) {
    if (!(mm > 0)) return '—';
    if (mm >= 10) return sig(mm / 10, 2) + ' cm';
    if (mm >= 0.1) return sig(mm, 2) + ' mm';
    return sig(mm * 1000, 2) + ' µm';
  }
  /** 時間（s）→ 文字 */
  function dur(s) {
    if (s == null || !isFinite(s)) return '—';
    const Y = MC.YEAR;
    if (s < 90) return sig(s, 2) + T(' 秒', ' s');
    if (s < 5400) return sig(s / 60, 2) + T(' 分鐘', ' min');
    if (s < 172800) return sig(s / 3600, 2) + T(' 小時', ' h');
    if (s < 0.25 * Y) return sig(s / 86400, 2) + T(' 天', ' days');
    if (s < 2 * Y) return sig(s / (Y / 12), 2) + T(' 個月', ' months');
    if (s < 1e4 * Y) return sig(s / Y, 2) + T(' 年', ' years');
    return T(sig(s / Y / 1e4, 2) + ' 萬年', sig(s / Y / 1000, 3) + ' thousand years');
  }
  /** 冷卻速率（°C/s）→ 文字（選一個讓數字在 1 以上的單位） */
  function rate(q) {
    if (q == null || !isFinite(q) || q <= 0) return '—';
    const units = [[1, T('每秒', 'per s')], [60, T('每分鐘', 'per min')], [3600, T('每小時', 'per hour')], [86400, T('每天', 'per day')], [MC.YEAR, T('每年', 'per year')], [MC.YEAR * 1000, T('每千年', 'per 1000 years')]];
    for (const u of units) { const v = q * u[0]; if (v >= 1 || u === units[units.length - 1]) return T(u[1] + ' ', '') + sig(v, 2) + ' °C' + T('', ' ' + u[1]); }
    return '—';
  }
  function texName(tex) {
    return {
      glassy: T('玻璃質', 'Glassy'), aphanitic: T('隱晶質（細粒）', 'Aphanitic (fine-grained)'), phaneritic: T('顯晶質（粗粒）', 'Phaneritic (coarse-grained)'),
      pegmatitic: T('偉晶質（極粗粒）', 'Pegmatitic (very coarse)'), porphyritic: T('斑狀', 'Porphyritic'), 'porphyry-glass': T('斑狀（玻璃質石基）', 'Porphyritic (glassy groundmass)')
    }[tex] || tex;
  }
  function rockName(r) {
    if (r.tex === 'porphyritic' || r.tex === 'porphyry-glass') { const f = MC.magma(r.type).rock.fine; return T('斑狀' + f[0], 'porphyritic ' + f[1]); }
    return T(r.rock[0], r.rock[1]);
  }
  function anPct(x) { return x == null ? '—' : 'An ' + num(x * 100, 0); }

  // =====================================================================
  // 畫布
  // =====================================================================
  const stage = $('stage');
  const cv = $('cv'), ctx = cv.getContext('2d');
  const gr = $('gr'), gtx = gr.getContext('2d');
  let cvSize = null, grSize = null;
  function fit(c, g) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300, h = c.clientHeight || 300;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h, dpr: dpr };
  }
  function sideWide() { return !!cvSize && cvSize.w >= 640; }
  function resizeCv() { const was = sideWide(); cvSize = fit(cv, ctx); grSize = fit(gr, gtx); xtl = null; if (was !== sideWide() && typeof updateReadouts === 'function') updateReadouts(); requestDraw(); }

  /** 目前畫面上的時間（s，第二階段）與那時的狀態 */
  /** 時間軸的起點：取樣點溫度開始明顯改變之前（再往前 30 倍） */
  function tStart(r) {
    const h = r.hist;
    let t = h[1] ? h[1].t : r.tEnd * 1e-6;
    for (let i = 1; i < h.length; i++) if (Math.abs(h[i].T - h[0].T) > 1 || h[i].X - h[0].X > 0.002) { t = Math.max(t, h[i].t / 3); break; }
    return Math.min(t, r.tEnd / 1e3);
  }
  function nowT() {
    const r = R(), run = state.run;
    if (!run) return r.tEnd;
    const t0 = tStart(r);
    return Math.exp(Math.log(t0) + run.u * (Math.log(r.tEnd) - Math.log(t0)));
  }
  function nowState() {
    const r = R(), run = state.run;
    if (!run) return r.hist[r.hist.length - 1];
    if (run.u <= 0) return r.hist[0];
    return MC.at(r, nowT());
  }

  // ---------- 冷卻：版面 ----------
  function coolLay(W, H) {
    const wide = W >= 640;
    if (wide) {
      const sw = Math.round(W * 0.55);
      const Rr = Math.min((W - sw) / 2 - 22, H / 2 - 62);
      return { wide: true, sec: { x: 12, y: 12, w: sw - 18, h: H - 24 }, sc: { x: sw + (W - sw) / 2, y: H / 2 - 18, r: Rr } };
    }
    const sh = Math.round(H * 0.5);
    const Rr = Math.min(W / 2 - 24, (H - sh) / 2 - 52);
    return { wide: false, sec: { x: 8, y: 8, w: W - 16, h: sh - 14 }, sc: { x: W / 2, y: sh + (H - sh) / 2 - 18, r: Rr } };
  }
  /** 溫度 → 顏色（熔岩發光 → 冷的岩石） */
  function tempColor(Tc, r) {
    const hot = C['mc-hot'], melt = C['mc-melt'], cold = C['mc-cold'];
    if (Tc >= r.TL) return hot;
    if (Tc >= r.Tg) return D.mix(melt, hot, (Tc - r.Tg) / (r.TL - r.Tg));
    const u = Math.max(0, Math.min(1, (Tc - r.Tr) / Math.max(1, r.Tg - r.Tr)));
    return D.mix(cold, melt, Math.pow(u, 1.6));
  }
  function drawSection(L) {
    const g = ctx, r = R(), s = L.sec, t = nowT(), run = state.run;
    const molten = run && run.u <= 0;
    // 外框
    g.save();
    D.roundRect(g, s.x, s.y, s.w, s.h, 10); g.clip();
    // 縱軸：離中心的距離 −2.4a … 2.4a
    const span = 2.4 * r.a, yc = s.y + s.h * 0.52, k = (s.h * 0.44) / span;
    const Y = function (x) { return yc - x * k; };
    // 圍岩底色＋紋理
    const hg = g.createLinearGradient(0, s.y, 0, s.y + s.h);
    hg.addColorStop(0, C['mc-host0']); hg.addColorStop(1, C['mc-host1']);
    g.fillStyle = hg; g.fillRect(s.x, s.y, s.w, s.h);
    // 每一條水平帶的溫度
    const rows = 90;
    for (let i = 0; i < rows; i++) {
      const y0 = s.y + s.h * i / rows, y1 = s.y + s.h * (i + 1) / rows;
      const xm = (yc - (y0 + y1) / 2) / k;
      const Tc = molten ? (Math.abs(xm) < r.a ? r.T0 : r.Tr) : MC.slabT(r.T0, r.Tr, r.a, xm, t);
      const inBody = Math.abs(xm) < r.a;
      const hotness = Math.max(0, Math.min(1, (Tc - r.Tr) / (r.TL - r.Tr)));
      if (inBody || hotness > 0.03) {
        g.globalAlpha = inBody ? 1 : Math.min(0.85, hotness * 1.2);
        g.fillStyle = tempColor(Tc, r);
        g.fillRect(s.x, y0, s.w, y1 - y0 + 0.6);
        g.globalAlpha = 1;
      }
    }
    // 岩體的上下界
    g.strokeStyle = D.alpha(C.text, 0.55); g.lineWidth = 1.5; g.setLineDash([6, 4]);
    [r.a, -r.a].forEach(function (x) { g.beginPath(); g.moveTo(s.x, Y(x)); g.lineTo(s.x + s.w, Y(x)); g.stroke(); });
    g.setLineDash([]);
    // 圍岩的紋理（細點）
    g.fillStyle = D.alpha(C.text, D.dark ? 0.08 : 0.07);
    let seed = 7;
    const rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 260; i++) {
      const x = s.x + rnd() * s.w, y = s.y + rnd() * s.h;
      if (Math.abs((yc - y) / k) < r.a) continue;
      g.fillRect(x, y, 2, 1.5);
    }
    // 溫度剖面曲線（橫軸 = 溫度）
    const px0 = s.x + 16, px1 = s.x + s.w - 16;
    const TX = function (Tc) { return px0 + (Tc - r.Tr) / (r.TL + 40 - r.Tr) * (px1 - px0); };
    [[r.TL, C['mc-tl'], T('液相線 ', 'Liquidus ') + num(r.TL, 0) + ' °C'], [r.Tg, C['mc-tg'], T('玻璃轉移 ', 'Glass transition ') + num(r.Tg, 0) + ' °C']].forEach(function (q) {
      const x = TX(q[0]);
      g.strokeStyle = D.alpha(q[1], 0.75); g.lineWidth = 1.2; g.setLineDash([4, 4]);
      g.beginPath(); g.moveTo(x, s.y + 40); g.lineTo(x, s.y + s.h - 26); g.stroke(); g.setLineDash([]);
      D.haloText(g, q[2].split(' ')[0], x, s.y + s.h - 14, q[1], 'center', 'alphabetic', '600 10.5px ' + FONT);
    });
    g.beginPath();
    for (let i = 0; i <= 120; i++) {
      const y = s.y + 30 + (s.h - 56) * i / 120, xm = (yc - y) / k;
      const Tc = molten ? (Math.abs(xm) < r.a ? r.T0 : r.Tr) : MC.slabT(r.T0, r.Tr, r.a, xm, t);
      if (i) g.lineTo(TX(Tc), y); else g.moveTo(TX(Tc), y);
    }
    g.lineWidth = 4; g.strokeStyle = D.alpha(C['canvas-bg'], 0.8); g.stroke();
    g.lineWidth = 2.2; g.strokeStyle = C['mc-T']; g.lineCap = 'round'; g.stroke();
    g.restore();
    // 外框描邊
    D.roundRect(g, s.x, s.y, s.w, s.h, 10); g.strokeStyle = D.alpha(C.text, 0.25); g.lineWidth = 1; g.stroke();
    // 取樣點
    const sy = Y(r.xr * r.a), st = nowState();
    const sx = TX(st.T);
    g.beginPath(); g.moveTo(s.x + 6, sy); g.lineTo(sx, sy); g.strokeStyle = D.alpha(C.text, 0.5); g.lineWidth = 1; g.setLineDash([2, 3]); g.stroke(); g.setLineDash([]);
    D.ball(g, sx, sy, 6.5, C.accent);
    D.pill(g, T('取樣點 ', 'Sample ') + num(st.T, 0) + ' °C', Math.min(sx + 10, s.x + s.w - 6), sy - 9, C.accent, sx + 10 > s.x + s.w - 120 ? 'right' : 'left', '700 11.5px ' + FONT);
    // 標籤
    const f11 = '600 11px ' + FONT;
    D.pill(g, T('圍岩 ', 'Country rock ') + num(r.Tr, 0) + ' °C' + T('（深 ', ' (') + num(r.z, 1) + T(' km）', ' km deep)'), s.x + 8, s.y + 24, C.text, 'left', f11);
    D.haloText(g, T('岩漿', 'Magma'), s.x + 10, Y(r.a) + 16, C.text, 'left', 'middle', '700 12px ' + FONT);
    // 2a 的比例尺
    const bx = s.x + s.w - 10;
    g.strokeStyle = C.text; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(bx, Y(r.a)); g.lineTo(bx, Y(-r.a)); g.moveTo(bx - 5, Y(r.a)); g.lineTo(bx + 3, Y(r.a)); g.moveTo(bx - 5, Y(-r.a)); g.lineTo(bx + 3, Y(-r.a)); g.stroke();
    D.pill(g, '2a = ' + lenM(2 * r.a), bx - 6, Y(-r.a) + 22, C.text, 'right', f11);
    // 時間
    const tt = molten ? T('剛侵入（t = 0）', 'Just intruded (t = 0)') : run && !run.done ? 't = ' + dur(t) : (r.end === 'glass' ? T('凍成玻璃（', 'Frozen to glass (') : T('取樣點凝固（', 'Sample solid (')) + dur(r.tEnd) + T('）', ')');
    D.pill(g, tt, s.x + s.w - 8, s.y + (L.wide ? 24 : 48), C.text, 'right', '700 12px ' + FONT);
    D.haloText(g, T('紅線：溫度剖面', 'Red: temperature profile'), s.x + 10, s.y + 44, C['mc-T'], 'left', 'alphabetic', '600 11px ' + FONT);
  }

  // ---------- 冷卻：顯微鏡 ----------
  let xtl = null;     // 晶體清單的快取
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function niceUp(v) { const e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e; }
  function niceNear(v) { const e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e; }
  const PAL = {
    plag: ['#e8e8e8', '#cfcfcf', '#f6f6f6', '#b9b9b9', '#9b9b9b', '#dcd6c4'],
    mafic: ['#e2c55a', '#e09a52', '#6f8fe0', '#a46fd0', '#6cc489', '#e48bb2', '#58b7c9'],
    felsic: ['#ececec', '#d3d3d3', '#bdbdbd', '#f4f1e6', '#a8a8a8', '#c9b98f', '#9a9a9a'],
    biotite: ['#8a5a2b', '#6b4423', '#a0743f', '#5d6b3a', '#7a5230']
  };
  function buildCrystals(r, Rpx) {
    const rnd = mulberry(Math.round(r.a * 1000) + Math.round(r.z * 77) + Math.round(r.xr * 991) + Math.round(r.phen * 4441) + r.type.length * 13);
    const list = [];
    const porph = r.phen > 0 && r.Xp > 0.005 && r.Lp > 0;
    const asp = r.type === 'basalt' ? 3.6 : r.type === 'andesite' ? 2.6 : 1.4;
    const cover = function (aspect) { return 0.8 / aspect / 2.2; };   // 每顆畫出的面積 ÷ L²（重疊後約鋪滿）
    let F;   // 視野直徑（mm）
    if (porph) F = r.Lp * Math.sqrt(9 * cover(asp) / (Math.max(0.02, r.Xp) * 0.785));
    else if (r.X > 0.02 && r.L > 0) F = r.L * Math.sqrt(520 * cover(asp) / (r.X * 0.785));
    else F = Math.max(0.2, (r.L || 0.001) * 40);
    F = niceNear(Math.max(0.05, Math.min(100, F)));
    const pxPerMM = 2 * Rpx / F;
    function add(n, Lmm, birth0, kind) {
      for (let i = 0; i < n; i++) {
        const ang = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 1.05;
        const sz = Lmm * (0.45 + rnd() * 1.1) * pxPerMM;
        const mafic = kind === 'g' && rnd() < (r.type === 'basalt' ? 0.38 : r.type === 'andesite' ? 0.25 : 0.12);
        const a2 = mafic ? 1.2 + rnd() * 0.5 : (r.type === 'rhyolite' ? 1 + rnd() * 0.7 : asp * (0.7 + rnd() * 0.6));
        const pal = mafic ? (r.type === 'rhyolite' ? PAL.biotite : PAL.mafic) : r.type === 'rhyolite' ? PAL.felsic : PAL.plag;
        const verts = [];
        for (let j = 0; j < 6; j++) verts.push(0.82 + rnd() * 0.3);
        list.push({ x: Math.cos(ang) * rr * Rpx, y: Math.sin(ang) * rr * Rpx, s: sz, asp: a2, rot: rnd() * Math.PI, col: pal[Math.floor(rnd() * pal.length)],
          twin: !mafic && r.type !== 'rhyolite', birth: birth0 + rnd() * (1 - birth0) * 0.75, verts: verts, kind: kind });
      }
    }
    const area = Math.PI * F * F / 4;
    let fine = null;
    if (porph) {
      const np = Math.max(2, Math.min(40, Math.round(r.Xp * area / (r.Lp * r.Lp * cover(asp)))));
      add(np, r.Lp, 0, 'p');
      const ng = r.Lg > 0 ? (1 - r.glass - r.Xp) * area / (r.Lg * r.Lg * cover(asp)) : 0;
      if (r.Lg * pxPerMM >= 2.2) add(Math.min(900, Math.round(ng)), r.Lg, 0.05, 'g');
      else fine = { dens: Math.max(0, 1 - r.glass - r.Xp) };
    } else {
      const n = r.L > 0 ? r.X * area / (r.L * r.L * cover(asp)) : 0;
      if (r.L * pxPerMM >= 2.2) add(Math.min(900, Math.round(n)), r.L, 0, 'g');
      else if (r.X > 0.01) fine = { dens: r.X };
    }
    // 大的先畫（小的疊在縫隙上，看起來像交錯生長）
    list.sort(function (p, q) { return q.s - p.s; });
    return { F: F, list: list, fine: fine, R: Rpx, porph: porph };
  }
  function drawCrystal(g, c, f) {
    const L = c.s * f;
    if (L < 0.6) return;
    const w = L / 2, h = L / (2 * c.asp);
    g.save(); g.translate(c.x, c.y); g.rotate(c.rot);
    g.beginPath();
    const v = c.verts;
    g.moveTo(-w * v[0], 0); g.lineTo(-w * 0.62 * v[1], -h * v[2]); g.lineTo(w * 0.62 * v[3], -h * v[2]);
    g.lineTo(w * v[4], 0); g.lineTo(w * 0.62 * v[3], h * v[5]); g.lineTo(-w * 0.62 * v[1], h * v[5]); g.closePath();
    g.fillStyle = c.col; g.fill();
    if (L > 6) {
      g.lineWidth = Math.max(0.6, L / 60); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.stroke();
      if (c.twin) {   // 聚片雙晶（明暗相間的條紋）
        g.save(); g.clip();
        g.fillStyle = 'rgba(0,0,0,0.28)';
        const n = 3 + Math.floor(c.verts[0] * 4), dh = 2 * h / n;
        for (let i = 0; i < n; i += 2) g.fillRect(-w, -h + i * dh, 2 * w, dh);
        g.restore();
      }
    }
    g.restore();
  }
  function drawScope(L) {
    const g = ctx, r = R(), sc = L.sc, st = nowState(), run = state.run;
    if (!xtl || xtl.key !== resKey + '|' + Math.round(sc.r)) { xtl = buildCrystals(r, sc.r); xtl.key = resKey + '|' + Math.round(sc.r); }
    // 鏡筒外框
    const ring = g.createRadialGradient(sc.x - sc.r * 0.3, sc.y - sc.r * 0.3, sc.r * 0.2, sc.x, sc.y, sc.r + 12);
    ring.addColorStop(0, '#9aa3ad'); ring.addColorStop(0.85, '#4b525a'); ring.addColorStop(1, '#2a2f35');
    g.beginPath(); g.arc(sc.x, sc.y, sc.r + 9, 0, Math.PI * 2); g.fillStyle = ring; g.fill();
    g.save();
    g.beginPath(); g.arc(sc.x, sc.y, sc.r, 0, Math.PI * 2); g.clip();
    // 背景：高溫熔體（暗紅光）→ 玻璃（黑）
    const hot = Math.max(0, Math.min(1, (st.T - r.Tg) / (r.TL - r.Tg)));
    const bg = g.createRadialGradient(sc.x, sc.y, 0, sc.x, sc.y, sc.r);
    bg.addColorStop(0, D.mix('#0d0d12', '#5a1d0a', hot)); bg.addColorStop(1, D.mix('#050507', '#2e0e05', hot));
    g.fillStyle = bg; g.fillRect(sc.x - sc.r, sc.y - sc.r, 2 * sc.r, 2 * sc.r);
    // 晶體
    const Xf = r.X > 0 ? st.X / r.X : 1;
    const Xstart = r.phen > 0 ? r.Xp1 / Math.max(1e-9, r.X) : 0;
    g.translate(sc.x, sc.y);
    if (xtl.fine && Xf > 0.02) {
      const n = Math.round(2600 * xtl.fine.dens * Math.min(1, Xf));
      const rnd = mulberry(99);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * sc.r;
        const c = PAL.plag[Math.floor(rnd() * PAL.plag.length)];
        g.fillStyle = D.alpha(c, 0.55 + 0.4 * rnd()); g.fillRect(Math.cos(a) * rr, Math.sin(a) * rr, 1.4, 1.4);
      }
    }
    xtl.list.forEach(function (c) {
      let f;
      if (c.kind === 'p') f = r.phen > 0 ? Math.cbrt(Math.max(Xstart, Math.min(1, Xf)) ) : 1;
      else {
        const u = (Xf - Xstart) / Math.max(1e-9, 1 - Xstart);
        f = u <= c.birth ? 0 : Math.cbrt(Math.min(1, (u - c.birth) / Math.max(0.05, 1 - c.birth)));
      }
      if (c.kind === 'p') f = Math.min(1, Math.max(0.85, f));
      drawCrystal(g, c, f);
    });
    g.setTransform(cvSize.dpr, 0, 0, cvSize.dpr, 0, 0);
    // 十字線
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(sc.x - sc.r, sc.y); g.lineTo(sc.x + sc.r, sc.y); g.moveTo(sc.x, sc.y - sc.r); g.lineTo(sc.x, sc.y + sc.r); g.stroke();
    // 鏡頭的高光
    const hl = g.createRadialGradient(sc.x - sc.r * 0.45, sc.y - sc.r * 0.5, 2, sc.x - sc.r * 0.45, sc.y - sc.r * 0.5, sc.r * 0.8);
    hl.addColorStop(0, 'rgba(255,255,255,0.10)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl; g.fillRect(sc.x - sc.r, sc.y - sc.r, 2 * sc.r, 2 * sc.r);
    // 比例尺
    const F = xtl.F, bar = niceUp(F / 5) / 2 >= F / 8 ? niceUp(F / 5) / 2 : niceUp(F / 5);
    const bl = bar / F * 2 * sc.r, bx = sc.x - bl / 2, by = sc.y + sc.r * 0.78;
    g.fillStyle = 'rgba(0,0,0,0.55)'; D.roundRect(g, bx - 8, by - 18, bl + 16, 26, 6); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + bl, by); g.moveTo(bx, by - 4); g.lineTo(bx, by + 4); g.moveTo(bx + bl, by - 4); g.lineTo(bx + bl, by + 4); g.stroke();
    g.fillStyle = '#ffffff'; g.font = '600 11px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText(lenMM(bar), sc.x, by - 6);
    g.restore();
    // 說明
    const view = F >= 20 ? T('手標本', 'Hand specimen') : F >= 2 ? T('放大鏡', 'Hand lens') : T('偏光顯微鏡（正交偏光）', 'Microscope, crossed polars');
    D.pill(g, view + T('・視野 ', ' · field ') + lenMM(F), sc.x, sc.y - sc.r - 14, C.text, 'center', '600 11.5px ' + FONT);
    const done = !run || run.done;
    const porph = r.tex === 'porphyritic' || r.tex === 'porphyry-glass';
    const lab1 = done ? rockName(r) : st.X < 0.003 ? (st.T > r.Tg ? T('還是熔體', 'Still melt') : T('玻璃', 'Glass')) : T('結晶 ', 'Crystallised ') + num(st.X * 100, 0) + ' %';
    const lab2 = done ? (porph ? T('斑晶 ', 'Phenocrysts ') + lenMM(r.Lp) + T('、石基 ', ', groundmass ') + (r.Lg > 0 ? lenMM(r.Lg) : T('玻璃', 'glass')) : texName(r.tex) + (r.L > 0 && r.glass < 0.5 ? T('・晶體 ', ' · ') + lenMM(r.L) : '')) : num(st.T, 0) + ' °C';
    D.pill(g, lab1, sc.x, sc.y + sc.r + 30, done ? C.accent : C.text, 'center', '700 13px ' + FONT);
    D.pill(g, lab2, sc.x, sc.y + sc.r + 52, C.text, 'center', '600 11.5px ' + FONT);
  }

  // ---------- 斜長石：相圖與晶體 ----------
  function plagLay(W, H) {
    if (W >= 640) {
      const pw = Math.round(W * 0.6);
      return { pd: { x: 56, y: 22, w: pw - 80, h: H - 74 }, xt: { x: pw + 4, y: 20, w: W - pw - 16, h: H - 40 } };
    }
    const ph = Math.round(H * 0.56);
    return { pd: { x: 50, y: 18, w: W - 70, h: ph - 62 }, xt: { x: 10, y: ph + 4, w: W - 20, h: H - ph - 12 } };
  }
  const TMIN = 1080, TMAX = 1600;
  function anColor(x) { return D.mix(C['mc-ab'], C['mc-an'], Math.max(0, Math.min(1, x))); }
  function drawPhase(L) {
    const g = ctx, p = L.pd, P = plag();
    const X = function (x) { return p.x + x * p.w; }, Y = function (Tc) { return p.y + (TMAX - Tc) / (TMAX - TMIN) * p.h; };
    // 區域
    const liq = [], sol = [];
    for (let i = 0; i <= 80; i++) { const Tc = MC.PLAG.TAb + (MC.PLAG.TAn - MC.PLAG.TAb) * i / 80; const c = MC.loop(Tc); liq.push([X(c.xl), Y(Tc)]); sol.push([X(c.xs), Y(Tc)]); }
    g.fillStyle = D.alpha(C['mc-liq'], D.dark ? 0.16 : 0.12); g.fillRect(p.x, p.y, p.w, p.h);
    g.beginPath(); g.moveTo(p.x, Y(MC.PLAG.TAb)); liq.forEach(function (q) { g.lineTo(q[0], q[1]); }); for (let i = sol.length - 1; i >= 0; i--) g.lineTo(sol[i][0], sol[i][1]); g.closePath();
    g.fillStyle = D.alpha(C['canvas-bg'], 0.65); g.fill();
    g.fillStyle = D.alpha(C['mc-xtl'], D.dark ? 0.12 : 0.08); g.fill();
    g.beginPath(); g.moveTo(p.x, Y(MC.PLAG.TAb)); sol.forEach(function (q) { g.lineTo(q[0], q[1]); }); g.lineTo(p.x + p.w, p.y + p.h); g.lineTo(p.x, p.y + p.h); g.closePath();
    g.fillStyle = D.alpha(C['mc-xtl'], D.dark ? 0.22 : 0.16); g.fill();
    D.grid(g, p.x, p.y, p.x + p.w, p.y + p.h, p.w / 10, 0, p.x, Y(1600));
    // 曲線
    [[liq, C['mc-liq']], [sol, C['mc-xtl']]].forEach(function (q) {
      g.beginPath(); q[0].forEach(function (pt, i) { if (i) g.lineTo(pt[0], pt[1]); else g.moveTo(pt[0], pt[1]); });
      g.lineWidth = 4.5; g.strokeStyle = D.alpha(C['canvas-bg'], 0.7); g.stroke();
      g.lineWidth = 2.6; g.strokeStyle = q[1]; g.lineCap = 'round'; g.stroke();
    });
    // 座標軸
    g.strokeStyle = D.alpha(C.text, 0.6); g.lineWidth = 1;
    g.strokeRect(p.x, p.y, p.w, p.h);
    g.fillStyle = C.muted; g.font = '11px ' + FONT; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let Tc = 1100; Tc <= 1600; Tc += 100) g.fillText(String(Tc), p.x - 5, Y(Tc));
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (let i = 0; i <= 10; i += 2) g.fillText(String(i * 10), X(i / 10), p.y + p.h + 4);
    D.haloText(g, T('An 含量（%）', 'An content (%)'), p.x + p.w / 2, p.y + p.h + 30, C.muted, 'center', 'alphabetic', '600 11px ' + FONT);
    g.save(); g.translate(p.x - 38, p.y + p.h / 2); g.rotate(-Math.PI / 2);
    D.haloText(g, T('溫度（°C）', 'Temperature (°C)'), 0, 0, C.muted, 'center', 'middle', '600 11px ' + FONT); g.restore();
    // 區域名稱
    const f12 = '700 12px ' + FONT;
    D.haloText(g, T('熔體', 'Melt'), X(0.22), Y(1520), C['mc-liq'], 'center', 'middle', f12);
    const midY = Math.abs(Y(P.T) - Y(1395)) < 24 ? Y(1395) + (Y(P.T) > Y(1395) ? -30 : 30) : Y(1395);
    D.haloText(g, T('熔體＋晶體', 'Melt + crystals'), X(0.55), midY, C.text, 'center', 'middle', '600 11px ' + FONT);
    D.haloText(g, T('晶體（固溶體）', 'Crystals (solid solution)'), X(0.8), Y(1180), C['mc-xtl'], 'center', 'middle', f12);
    D.pill(g, 'Ab 1118 °C', X(0) + 4, Y(1118) - 6, C['mc-ab'], 'left', '600 11px ' + FONT);
    D.pill(g, 'An 1553 °C', X(1) - 4, Y(1553) - 6, C['mc-an'], 'right', '600 11px ' + FONT);
    // 成分線與溫度線
    g.setLineDash([5, 4]); g.lineWidth = 1.4; g.strokeStyle = D.alpha(C.text, 0.6);
    g.beginPath(); g.moveTo(X(P.x0), p.y); g.lineTo(X(P.x0), p.y + p.h); g.stroke();
    g.strokeStyle = D.alpha(C.accent, 0.8);
    g.beginPath(); g.moveTo(p.x, Y(P.T)); g.lineTo(p.x + p.w, Y(P.T)); g.stroke(); g.setLineDash([]);
    // 分離結晶的路徑
    if (state.meth === 'frac' && P.T < P.TL) {
      const fr = P.fr, n = fr.zones.length;
      g.beginPath();
      for (let i = 0; i < n; i++) { const Tc = P.TL - (P.TL - Math.max(P.T, MC.PLAG.TAb)) * i / Math.max(1, n - 1); const c = MC.loop(Tc); if (i) g.lineTo(X(c.xl), Y(Tc)); else g.moveTo(X(c.xl), Y(Tc)); }
      g.lineWidth = 5; g.strokeStyle = D.alpha(C['mc-liq'], 0.45); g.stroke();
      g.beginPath();
      for (let i = 0; i < n; i++) { const Tc = P.TL - (P.TL - Math.max(P.T, MC.PLAG.TAb)) * i / Math.max(1, n - 1); const c = MC.loop(Tc); if (i) g.lineTo(X(c.xs), Y(Tc)); else g.moveTo(X(c.xs), Y(Tc)); }
      g.strokeStyle = D.alpha(C['mc-xtl'], 0.45); g.stroke();
    }
    // 連結線（共存的熔體與晶體）
    const cur = state.meth === 'eq' ? P.eq : null;
    let xl = null, xs = null;
    if (state.meth === 'eq') { if (cur.state === 'two') { xl = cur.xl; xs = cur.xs; } }
    else if (P.T < P.TL && P.fr.F > 0) { xl = P.fr.xl; xs = P.fr.xs; }
    if (xl != null && P.T > MC.PLAG.TAb) {
      g.lineWidth = 2.5; g.strokeStyle = C.accent;
      g.beginPath(); g.moveTo(X(xl), Y(P.T)); g.lineTo(X(xs), Y(P.T)); g.stroke();
      D.ball(g, X(xl), Y(P.T), 6, C['mc-liq']); D.ball(g, X(xs), Y(P.T), 6, C['mc-xtl']);
      D.pill(g, T('熔體 ', 'Melt ') + anPct(xl), X(xl) - 6, Y(P.T) - 10, C['mc-liq'], X(xl) < p.x + 90 ? 'left' : 'right', '700 11px ' + FONT);
      D.pill(g, T('晶體 ', 'Crystal ') + anPct(xs), X(xs) + 6, Y(P.T) + 26, C['mc-xtl'], X(xs) > p.x + p.w - 90 ? 'right' : 'left', '700 11px ' + FONT);
    }
    D.ball(g, X(P.x0), Y(P.T), 4.5, C.text);
    D.pill(g, num(P.T, 0) + ' °C', p.x + p.w - 4, Y(P.T) - 4, C.accent, 'right', '700 11.5px ' + FONT);
  }
  function drawPlagCrystal(L) {
    const g = ctx, b = L.xt, P = plag();
    const frac = state.meth === 'frac';
    const fs = frac ? 1 - P.fr.F : P.eq.fs;
    // 熔體池
    const cx = b.x + b.w / 2, cy = b.y + b.h * 0.45;
    const pw = Math.min(b.w - 20, 300), ph = Math.min(b.h * 0.62, 220);
    D.roundRect(g, cx - pw / 2, cy - ph / 2, pw, ph, 18);
    const mg = g.createLinearGradient(0, cy - ph / 2, 0, cy + ph / 2);
    const hot = Math.max(0, Math.min(1, (P.T - 1100) / 450));
    mg.addColorStop(0, D.mix('#7c2d12', C['mc-hot'], 0.35 + 0.5 * hot)); mg.addColorStop(1, D.mix('#431407', C['mc-melt'], 0.3 + 0.5 * hot));
    g.fillStyle = (fs >= 1 - 1e-9) ? D.alpha(C['mc-cold'], 0.5) : mg; g.fill();
    g.strokeStyle = D.alpha(C.text, 0.3); g.lineWidth = 1; g.stroke();
    // 晶體：面積 ∝ 晶體比例
    const Amax = pw * ph * 0.42;
    const asp = 2.0;
    function lath(area, color) {
      const L = Math.sqrt(area * asp / 0.75), H = L / asp;
      g.beginPath();
      g.moveTo(cx - L / 2, cy); g.lineTo(cx - L / 2 + H / 2, cy - H / 2); g.lineTo(cx + L / 2 - H / 2, cy - H / 2);
      g.lineTo(cx + L / 2, cy); g.lineTo(cx + L / 2 - H / 2, cy + H / 2); g.lineTo(cx - L / 2 + H / 2, cy + H / 2); g.closePath();
      g.fillStyle = color; g.fill();
    }
    if (fs > 0.0005) {
      g.save();
      g.shadowColor = D.shadowInk(0.35); g.shadowBlur = 8; g.shadowOffsetY = 2;
      lath(Amax * fs, frac ? anColor(P.fr.zones[0].x) : anColor(P.eq.xs));
      g.restore();
      if (frac) {
        // 環帶：由外往內畫，每一層到這裡為止的晶體比例；每 10 % 描一圈細線
        const z = P.fr.zones, n = z.length;
        let nextLine = Math.floor(fs * 10) / 10;
        for (let i = n - 1; i >= 0; i -= Math.max(1, Math.floor(n / 80))) {
          if (z[i].f <= 0) continue;
          lath(Amax * z[i].f, anColor(z[i].x));
          if (z[i].f <= nextLine && nextLine > 0) { g.lineWidth = 0.8; g.strokeStyle = 'rgba(0,0,0,0.25)'; g.stroke(); nextLine -= 0.1; }
        }
        lath(Amax * Math.max(0.0005, z[Math.min(n - 1, 1)].f), anColor(z[0].x));
      }
      lath(Amax * fs, 'rgba(0,0,0,0)');
      g.lineWidth = 1.4; g.strokeStyle = D.alpha('#000000', 0.45); g.stroke();
    }
    D.pill(g, T('熔體 ', 'Melt ') + num((1 - fs) * 100, 0) + ' %' + T('・晶體 ', ' · crystals ') + num(fs * 100, 0) + ' %', cx, cy - ph / 2 - 8, C.text, 'center', '700 12px ' + FONT);
    // 色帶圖例
    const ly = Math.min(b.y + b.h - 28, cy + ph / 2 + 30), lx0 = cx - pw / 2 + 6, lx1 = cx + pw / 2 - 6;
    const lg = g.createLinearGradient(lx0, 0, lx1, 0);
    lg.addColorStop(0, anColor(0)); lg.addColorStop(1, anColor(1));
    D.roundRect(g, lx0, ly, lx1 - lx0, 10, 5); g.fillStyle = lg; g.fill();
    g.fillStyle = C.muted; g.font = '11px ' + FONT; g.textBaseline = 'top';
    g.textAlign = 'left'; g.fillText(T('Ab 鈉', 'Ab (Na)'), lx0, ly + 13);
    g.textAlign = 'right'; g.fillText(T('An 鈣', 'An (Ca)'), lx1, ly + 13);
    function mark(x, label) {
      const xx = lx0 + (lx1 - lx0) * x;
      g.beginPath(); g.moveTo(xx, ly - 1); g.lineTo(xx - 5, ly - 9); g.lineTo(xx + 5, ly - 9); g.closePath(); g.fillStyle = C.text; g.fill();
      D.haloText(g, label, xx, ly - 12, C.text, 'center', 'alphabetic', '600 10.5px ' + FONT);
    }
    if (fs > 0.0005) {
      if (frac) { mark(P.fr.zones[0].x, T('核心', 'core')); if (P.fr.xs != null && Math.abs(P.fr.xs - P.fr.zones[0].x) > 0.08) mark(P.T <= MC.PLAG.TAb ? 0 : P.fr.xs, T('外圈', 'rim')); }
      else mark(P.eq.xs, T('晶體', 'crystal'));
    }
  }

  // ---------- 下方的圖 ----------
  const TIME_TICKS = [[1, '1 s', '1 秒'], [60, '1 min', '1 分'], [3600, '1 h', '1 時'], [86400, '1 day', '1 天'], [2.63e6, '1 month', '1 月'], [3.156e7, '1 yr', '1 年'],
    [3.156e8, '10 yr', '10 年'], [3.156e9, '100 yr', '100 年'], [3.156e10, '1 kyr', '1 千年'], [3.156e11, '10 kyr', '1 萬年'], [3.156e12, '100 kyr', '10 萬年']];
  function chartFrame(W, H) { return { x0: 50, x1: W - 46, y0: 26, y1: H - 30 }; }
  function drawTt() {
    const g = gtx, W = grSize.w, H = grSize.h, r = R(), L = chartFrame(W, H);
    const h = r.hist, t0 = tStart(r), t1 = r.tEnd * 30;
    const lx = function (t) { return L.x0 + (Math.log(t) - Math.log(t0)) / (Math.log(t1) - Math.log(t0)) * (L.x1 - L.x0); };
    const Tlo = Math.min(r.Tr, r.Tg) - 30, Thi = r.TL + 40;
    const ty = function (Tc) { return L.y1 - (Tc - Tlo) / (Thi - Tlo) * (L.y1 - L.y0); };
    const xy = function (X) { return L.y1 - X * (L.y1 - L.y0); };
    // 格線與刻度
    g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1; g.fillStyle = C.muted; g.font = '10.5px ' + FONT;
    g.textAlign = 'center'; g.textBaseline = 'top';
    let lastX = -99;
    TIME_TICKS.forEach(function (k) {
      if (k[0] < t0 || k[0] > t1) return;
      const x = lx(k[0]); g.beginPath(); g.moveTo(x, L.y0); g.lineTo(x, L.y1); g.stroke();
      if (x - lastX > 38) { g.fillText(T(k[2], k[1]), x, L.y1 + 4); lastX = x; }
    });
    g.textAlign = 'right'; g.textBaseline = 'middle';
    const step = Thi - Tlo > 900 ? 200 : 100;
    for (let Tc = Math.ceil(Tlo / step) * step; Tc <= Thi; Tc += step) { const y = ty(Tc); g.beginPath(); g.moveTo(L.x0, y); g.lineTo(L.x1, y); g.stroke(); g.fillText(String(Tc), L.x0 - 4, y); }
    g.textAlign = 'left';
    for (let X = 0; X <= 1; X += 0.5) g.fillText(num(X * 100, 0) + '%', L.x1 + 4, xy(X));
    // 液相線、玻璃轉移
    [[r.TL, C['mc-tl'], T('液相線：開始結晶', 'Liquidus: crystals can start')], [r.Tg, C['mc-tg'], T('玻璃轉移：再冷就凍成玻璃', 'Glass transition: melt freezes to glass')]].forEach(function (q) {
      const y = ty(q[0]); g.setLineDash([5, 4]); g.strokeStyle = D.alpha(q[1], 0.8); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(L.x0, y); g.lineTo(L.x1, y); g.stroke(); g.setLineDash([]);
      D.haloText(g, q[2], L.x0 + 6, y + 13, q[1], 'left', 'alphabetic', '600 10.5px ' + FONT);
    });
    // 曲線
    const xs = r.xr * r.a, Tpath = [];
    for (let i = 0; i <= 200; i++) { const t = Math.exp(Math.log(t0) + (Math.log(t1) - Math.log(t0)) * i / 200); Tpath.push({ t: t, T: MC.slabT(r.T0, r.Tr, r.a, xs, t) }); }
    // 凝固（或凍成玻璃）的時刻
    const xe = lx(r.tEnd);
    g.setLineDash([2, 3]); g.strokeStyle = D.alpha(C.text, 0.5); g.lineWidth = 1; g.beginPath(); g.moveTo(xe, L.y0); g.lineTo(xe, L.y1); g.stroke(); g.setLineDash([]);
    D.pill(g, r.end === 'glass' ? T('凍成玻璃', 'glass') : T('凝固', 'solid'), xe, L.y1 - 4, C.text, xe > L.x1 - 40 ? 'right' : 'center', '600 10.5px ' + FONT);
    const hx = h.concat([{ t: t1, T: 0, X: r.X }]);
    function curve2(arr, fy, color, w) {
      g.beginPath();
      arr.forEach(function (p, i) { const t = Math.max(t0, p.t || t0); const x = lx(t), y = fy(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.lineWidth = w + 2; g.strokeStyle = D.alpha(C['canvas-bg'], 0.8); g.stroke();
      g.lineWidth = w; g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke();
    }
    curve2(Tpath, function (p) { return ty(p.T); }, C['mc-T'], 2.2);
    curve2(hx, function (p) { return xy(p.X); }, C['mc-X'], 2.2);
    // 播放游標
    const run = state.run;
    if (run && !run.done) {
      const x = lx(Math.max(t0, nowT()));
      g.strokeStyle = C.accent; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, L.y0); g.lineTo(x, L.y1); g.stroke();
    }
    g.strokeStyle = D.alpha(C.text, 0.5); g.lineWidth = 1; g.strokeRect(L.x0, L.y0, L.x1 - L.x0, L.y1 - L.y0);
    D.haloText(g, T('紅：取樣點的溫度（°C）', 'Red: temperature at the sample (°C)'), L.x0 + 4, 14, C['mc-T'], 'left', 'middle', '600 11px ' + FONT);
    D.haloText(g, T('藍：已結晶的比例', 'Blue: fraction crystallised'), L.x1, 14, C['mc-X'], 'right', 'middle', '600 11px ' + FONT);
  }
  function drawIG() {
    const g = gtx, W = grSize.w, H = grSize.h, r = R(), L = chartFrame(W, H);
    const m = MC.magma(r.type), span = m.TL - m.Tg;
    const xx = function (dT) { return L.x0 + dT / span * (L.x1 - L.x0); };
    const n = 160, Gs = [], Is = [];
    let Gm = 0, Im = 0;
    for (let i = 0; i <= n; i++) { const dT = span * i / n, q = MC.rates(r.type, m.TL - dT); Gs.push(q.G); Is.push(q.I); Gm = Math.max(Gm, q.G); Im = Math.max(Im, q.I); }
    const yy = function (v) { return L.y1 - v * (L.y1 - L.y0); };
    g.strokeStyle = D.alpha(C.text, 0.08); g.lineWidth = 1; g.fillStyle = C.muted; g.font = '10.5px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'top';
    const st = span > 400 ? 100 : 50;
    for (let dT = 0; dT <= span; dT += st) { const x = xx(dT); g.beginPath(); g.moveTo(x, L.y0); g.lineTo(x, L.y1); g.stroke(); g.fillText(String(dT), x, L.y1 + 4); }
    D.haloText(g, T('過冷度 ΔT（°C）', 'Undercooling ΔT (°C)'), (L.x0 + L.x1) / 2, H - 4, C.muted, 'center', 'alphabetic', '600 10.5px ' + FONT);
    function curve(arr, mx, color) {
      g.beginPath(); arr.forEach(function (v, i) { const x = xx(span * i / n), y = yy(v / mx); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.lineWidth = 4; g.strokeStyle = D.alpha(C['canvas-bg'], 0.8); g.stroke();
      g.lineWidth = 2.4; g.strokeStyle = color; g.stroke();
      let im = 0; arr.forEach(function (v, i) { if (v > arr[im]) im = i; });
      return xx(span * im / n);
    }
    const gx = curve(Gs, Gm, C['mc-G']), ix = curve(Is, Im, C['mc-I']);
    D.pill(g, T('成長 G 最快', 'Fastest growth G'), gx, yy(1) + 18, C['mc-G'], gx < L.x0 + 70 ? 'left' : 'center', '700 11px ' + FONT);
    D.pill(g, T('成核 I 最快', 'Fastest nucleation I'), ix, yy(1) - 2, C['mc-I'], ix > L.x1 - 70 ? 'right' : 'center', '700 11px ' + FONT);
    if (r.dT50 != null) {
      const x = xx(Math.min(span, r.dT50));
      g.strokeStyle = C.accent; g.lineWidth = 1.6; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(x, L.y0); g.lineTo(x, L.y1); g.stroke(); g.setLineDash([]);
      D.pill(g, T('這次結晶一半時 ΔT = ', 'Half crystallised at ΔT = ') + num(r.dT50, 0) + ' °C', Math.min(L.x1, Math.max(L.x0, x + 6)), L.y1 - 8, C.accent, x > L.x1 - 150 ? 'right' : 'left', '700 11px ' + FONT);
    } else D.pill(g, T('這次沒有結晶到一半：凍成玻璃', 'Never half crystallised: frozen to glass'), L.x1 - 4, L.y1 - 8, C.accent, 'right', '700 11px ' + FONT);
    g.strokeStyle = D.alpha(C.text, 0.5); g.lineWidth = 1; g.strokeRect(L.x0, L.y0, L.x1 - L.x0, L.y1 - L.y0);
  }
  function drawBowen() {
    const g = gtx, W = grSize.w, H = grSize.h, P = plag();
    const B = MC.BOWEN;
    const top = 30, bot = H - 66, ax = 46;
    const Ty = function (Tc) { return top + (B.Ttop - Tc) / (B.Ttop - B.Tbot) * (bot - top); };
    // 溫度軸
    g.strokeStyle = D.alpha(C.text, 0.4); g.lineWidth = 1;
    g.beginPath(); g.moveTo(ax, top); g.lineTo(ax, bot); g.stroke();
    D.haloText(g, T('高溫', 'Hot'), ax, top - 10, C['mc-melt'], 'center', 'alphabetic', '700 11px ' + FONT);
    D.haloText(g, T('約 1200 °C', '~1200 °C'), ax + 4, top + 6, C.muted, 'left', 'middle', '10px ' + FONT);
    D.haloText(g, T('約 600 °C', '~600 °C'), ax + 4, bot - 4, C.muted, 'left', 'middle', '10px ' + FONT);
    // 不連續系列
    const narrow = W < 560;
    const lx = narrow ? ax + 105 : Math.max(ax + 70, W * 0.3), rx = narrow ? W - 26 : Math.min(W - 70, W * 0.72);
    const f12 = '700 12px ' + FONT;
    B.disc.forEach(function (m, i) {
      const y = top + 10 + i * ((bot - top - 40) / (B.disc.length - 1)) * 0.9;
      D.pill(g, T(m.zh, m.en), lx, y + 9, C.text, 'center', f12);
      if (i < B.disc.length - 1) D.arrow(g, lx, y + 14, lx, y + ((bot - top - 40) / (B.disc.length - 1)) * 0.9 - 6, D.alpha(C.text, 0.55), 1.5);
    });
    D.haloText(g, T('不連續系列', 'Discontinuous series'), lx, bot + 4, C.muted, 'center', 'middle', '600 10.5px ' + FONT);
    // 連續系列（斜長石）
    const by0 = top + 2, by1 = bot - 30;
    const lg = g.createLinearGradient(0, by0, 0, by1);
    lg.addColorStop(0, anColor(1)); lg.addColorStop(1, anColor(0));
    D.roundRect(g, rx - 9, by0, 18, by1 - by0, 9); g.fillStyle = lg; g.fill();
    D.haloText(g, T('富鈣斜長石', 'Ca-rich plagioclase'), narrow ? rx - 16 : rx + 16, by0 + 8, C['mc-an'], narrow ? 'right' : 'left', 'middle', f12);
    D.haloText(g, T('富鈉斜長石', 'Na-rich plagioclase'), narrow ? rx - 16 : rx + 16, by1 - 8, C['mc-ab'], narrow ? 'right' : 'left', 'middle', f12);
    D.haloText(g, T('連續系列', 'Continuous series'), narrow ? W - 8 : rx, bot + 4, C.muted, narrow ? 'right' : 'center', 'middle', '600 10.5px ' + FONT);
    // 最後的礦物
    const fy = H - 22;
    D.pill(g, B.late.map(function (m) { return T(m.zh, m.en); }).join(T('、', ', ')), (lx + rx) / 2, fy + 8, C.text, 'center', f12);
    D.arrow(g, lx, bot + 14, (lx + rx) / 2 - 30, fy - 12, D.alpha(C.text, 0.45), 1.4);
    D.arrow(g, rx, by1 + 4, (lx + rx) / 2 + 30, fy - 12, D.alpha(C.text, 0.45), 1.4);
    // 目前長出來的斜長石
    const frac = state.meth === 'frac';
    const x = frac ? (P.T < P.TL ? (P.T <= MC.PLAG.TAb ? 0 : P.fr.xs) : null) : (P.eq.state === 'liquid' ? null : P.eq.xs);
    if (x != null) {
      const y = by1 - x * (by1 - by0);
      g.beginPath(); g.moveTo(rx - 14, y); g.lineTo(rx - 24, y - 6); g.lineTo(rx - 24, y + 6); g.closePath(); g.fillStyle = C.accent; g.fill();
      D.pill(g, (narrow ? '' : T('現在長出的：', 'Growing now: ')) + anPct(x), rx - 28, y + 9, C.accent, 'right', '700 11px ' + FONT);
    }
  }

  // ---------- 繪製 ----------
  function drawMain() {
    if (!cvSize) return;
    const W = cvSize.w, H = cvSize.h, g = ctx;
    g.setTransform(cvSize.dpr, 0, 0, cvSize.dpr, 0, 0);
    D.backdrop(g, W, H);
    if (state.mode === 'cool') { const L = coolLay(W, H); drawSection(L); drawScope(L); }
    else { const L = plagLay(W, H); drawPhase(L); drawPlagCrystal(L); }
  }
  function drawChart() {
    if (!grSize) return;
    const g = gtx;
    g.setTransform(grSize.dpr, 0, 0, grSize.dpr, 0, 0);
    D.backdrop(g, grSize.w, grSize.h);
    if (state.mode === 'plag') drawBowen();
    else if (state.chart === 'IG') drawIG();
    else drawTt();
  }

  // =====================================================================
  // 動畫
  // =====================================================================
  let raf = 0, lastFrame = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(ts) {
    raf = 0;
    const dt = lastFrame ? Math.min(0.1, (ts - lastFrame) / 1000) : 0;
    if (state.mode === 'cool' && state.run && state.run.playing) stepRun(dt);
    if (state.mode === 'plag' && state.prun && state.prun.playing) stepPlag(dt);
    lastFrame = ts;
    drawMain(); drawChart();
    if ((state.run && state.run.playing) || (state.prun && state.prun.playing)) requestDraw(); else lastFrame = 0;
  }
  function stepRun(dt) {
    const run = state.run, r = R();
    const before = nowState();
    run.u = Math.min(1, run.u + dt / DUR);
    const after = nowState(), snd = sound();
    if (!run.cryst && after.X - (r.phen > 0 ? r.Xp1 : 0) > 0.01) {
      run.cryst = true;
      if (snd) snd.tone({ freq: 1320, dur: 0.08, type: 'triangle', gain: 0.05 });
      setStatus(T('取樣點降到液相線以下 ', 'The sample is ') + num(r.TL - after.T, 0) + T(' °C，晶體開始長出來。', ' °C below the liquidus: crystals are appearing.'));
    }
    if (snd && after.X - before.X > 0.03) snd.tone({ freq: 900 + 900 * after.X, dur: 0.05, type: 'sine', gain: 0.03 });
    if (run.u >= 1) finishRun();
  }
  function startRun() {
    acted();
    if (state.mode === 'plag') { startPlag(); return; }
    if (state.run && state.run.playing) return;
    if (state.run && !state.run.done) { state.run.playing = true; updateButtons(); requestDraw(); return; }
    state.run = { u: 0, playing: true, done: false, cryst: false };
    const r = R();
    setStatus(r.phen > 0
      ? T('岩漿先在深處的岩漿庫慢慢冷了 ', 'The magma first cooled slowly for ') + dur(r.t1) + T('，長出 ', ' in the deep chamber, growing ') + num(r.Xp1 * 100, 0) + T(' % 的大晶體；現在進入岩體。', ' % large crystals; now it enters the body.')
      : T('岩漿侵入：整個岩體 ', 'Intrusion: the whole body is at ') + num(r.T0, 0) + T(' °C，開始把熱傳給圍岩。', ' °C and starts losing heat to the country rock.'));
    const snd = sound(); if (snd) snd.noise({ filter: 500, q: 0.6, dur: 0.4, gain: 0.12 });
    updateButtons(); requestDraw();
  }
  function pauseRun() {
    const run = state.mode === 'cool' ? state.run : state.prun;
    if (!run || run.done) return;
    run.playing = !run.playing;
    updateButtons(); requestDraw();
    if (state.mode === 'plag') afterChange(true);
  }
  function finishRun() {
    const run = state.run; run.playing = false; run.done = true; run.u = 1;
    const r = R(), snd = sound();
    if (snd) {
      if (r.glass >= 0.5) snd.tone({ freq: 330, dur: 0.35, type: 'sine', gain: 0.08 });
      else { snd.tone({ freq: 1568, dur: 0.12, type: 'triangle', gain: 0.06 }); snd.tone({ freq: 2093, dur: 0.18, type: 'triangle', gain: 0.05, delay: 0.1 }); }
    }
    setStatus(T('冷卻完成：', 'Done: ') + rockName(r) + T('（', ' (') + texName(r.tex) + T('），晶體約 ', '), crystals about ') + lenMM(r.phen > 0 ? r.Lg : r.L) + T('，花了 ', ', taking ') + dur(r.tEnd) + T('。', '.'));
    state.log.push({ name: rockName(r), a: r.a, z: r.z, xr: r.xr, L: r.phen > 0 ? r.Lg : r.L, Lp: r.Lp, phen: r.phen, glass: r.glass, t: r.tEnd, type: r.type });
    if (state.log.length > 6) state.log.shift();
    updateLog(); updateButtons();
    emit('run', snapshot());
  }
  function cancelRun() { if (state.run) { state.run = null; updateButtons(); } }

  // ---------- 斜長石的降溫動畫 ----------
  function startPlag() {
    if (state.prun && state.prun.playing) return;
    if (state.prun && !state.prun.done) { state.prun.playing = true; updateButtons(); requestDraw(); return; }
    const TL = MC.liquidus(state.an0);
    const T0 = Math.min(1560, TL + 20);
    state.prun = { playing: true, done: false, T0: T0, past: false, solid: false };
    state.T = T0; setSlider(el.temp, T0);
    setStatus(T('從 ', 'Cooling from ') + num(T0, 0) + T(' °C 開始慢慢降溫。', ' °C.'));
    refreshOutputs(); updateButtons(); afterChange(true);
  }
  function stepPlag(dt) {
    const pr = state.prun, rate = (pr.T0 - 1100) / PDUR;
    const T0 = state.T;
    state.T = Math.max(1100, state.T - rate * dt);
    setSlider(el.temp, Math.round(state.T * 10) / 10);
    const TL = MC.liquidus(state.an0), TS = MC.solidus(state.an0), snd = sound();
    if (T0 > TL && state.T <= TL) { if (snd) snd.tone({ freq: 1320, dur: 0.1, type: 'triangle', gain: 0.05 }); setStatus(T('降到液相線 ', 'Liquidus reached at ') + num(TL, 0) + T(' °C：第一顆晶體是 ', ' °C: the first crystal is ') + anPct(MC.loop(TL).xs) + T('，比岩漿更富鈣。', ', richer in calcium than the magma.')); }
    if (state.meth === 'eq' && T0 > TS && state.T <= TS) { if (snd) snd.tone({ freq: 1760, dur: 0.15, type: 'triangle', gain: 0.05 }); setStatus(T('平衡結晶：到固相線 ', 'Equilibrium: fully solid at the solidus, ') + num(TS, 0) + T(' °C 全部凝固，晶體就是 ', ' °C; the crystal is ') + anPct(state.an0) + T('。', '.')); }
    if (state.meth === 'frac' && T0 > MC.PLAG.TAb && state.T <= MC.PLAG.TAb) { if (snd) snd.tone({ freq: 1760, dur: 0.15, type: 'triangle', gain: 0.05 }); setStatus(T('分離結晶：最後的熔體在 1118 °C 凝固成純鈉長石的外圈。', 'Fractional: the last melt freezes at 1118 °C as a rim of pure albite.')); }
    refreshOutputs(); updateReadouts();
    if (state.T <= 1100) { pr.playing = false; pr.done = true; updateButtons(); emit('run', snapshot()); }
    const tNow = performance.now();
    if (tNow - lastEmit > 300) { lastEmit = tNow; emit('state', snapshot()); }
  }
  function cancelPlag() { if (state.prun) { state.prun = null; updateButtons(); } }

  // =====================================================================
  // 任務事件與音效
  // =====================================================================
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function sound() { const Ls = window.LabSound; return Ls && Ls.enabled() ? Ls : null; }
  function snapshot() {
    const r = R(), c = RC(), P = plag();
    return {
      mode: state.mode, preset: state.preset || '', type: state.type, a: state.a, z: state.z, xr: state.xr, phen: state.phen, Tr: r.Tr,
      L: r.L, Lp: r.Lp, Lg: r.Lg, Xp: r.Xp, N: r.N * 1e-6, X: r.X, glass: r.glass, tex: r.tex, rock: r.rock[0],
      tEnd: r.tEnd, tYears: r.tEnd / MC.YEAR, q: r.q, dT50: r.dT50, end: r.end,
      Lc: c.phen > 0 ? c.Lg : c.L, glassC: c.glass, texC: c.tex,
      meth: state.meth, an0: state.an0 * 100, T: state.T, TL: P.TL, TS: P.TS,
      eq: { state: P.eq.state, xl: P.eq.xl == null ? null : P.eq.xl * 100, xs: P.eq.xs == null ? null : P.eq.xs * 100, fs: P.eq.fs },
      fr: { F: P.fr.F, xl: P.fr.xl * 100, xs: P.fr.xs == null ? null : (P.T <= MC.PLAG.TAb ? 0 : P.fr.xs * 100), core: P.fr.zones.length ? P.fr.zones[0].x * 100 : null, mean: P.fr.mean == null ? null : P.fr.mean * 100 },
      chart: state.chart, played: !!(state.run && state.run.done), anim: !!(state.prun && state.prun.playing)
    };
  }
  let lastEmit = 0;
  function afterChange(force) {
    updateReadouts();
    const tNow = performance.now();
    if (force || tNow - lastEmit > 200) { lastEmit = tNow; emit('state', snapshot()); }
    requestDraw();
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function refreshOutputs() {
    setOut(el.size, outNum(state.a, 0, state.a < 1 ? 2 : state.a < 10 ? 1 : 0));
    setOut(el.dep, outNum(state.z, 1, 1));
    setOut(el.pos, outNum(state.xr, 2, 2));
    setOut(el.phen, String(Math.round(state.phen * 100)));
    setOut(el.an0, outNum(state.an0 * 100, 0, 1));
    setOut(el.temp, outNum(state.T, 0, 1));
    document.querySelectorAll('#presetSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-p') === state.preset)); });
    document.querySelectorAll('#typeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-type') === state.type)); });
    document.querySelectorAll('#modeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === state.mode)); });
    document.querySelectorAll('#methSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-meth') === state.meth)); });
    document.querySelectorAll('#chartSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-chart') === state.chart)); });
    $('coolPanel').hidden = state.mode !== 'cool';
    $('plagPanel').hidden = state.mode !== 'plag';
    $('chartSeg').hidden = state.mode !== 'cool';
  }
  function updateReadouts() {
    if (state.mode === 'cool') {
      const r = R();
      setHTML('bodyHint', T('冷卻時間尺度 τ = a<sup>2</sup>/κ ≈ ', 'Cooling time scale τ = a<sup>2</sup>/κ ≈ ') + dur(r.tau) + T('；', '; ') + (r.z === 0 ? T('在地表（熔岩流或淺處的岩體）', 'at the surface (a lava flow or a shallow body)') : T('深 ', '') + num(r.z, 1) + T(' km 的圍岩是 ', ' km deep, where the rock is at ') + num(r.Tr, 0) + ' °C') + T('。', '.'));
      setHTML('rTex', rockName(r) + ' <small>' + texName(r.tex) + '</small>');
      setHTML('rL', r.phen > 0 && r.Lp > 0 ? T('斑晶 ', 'Phenocrysts ') + lenMM(r.Lp) + T('，石基 ', ', groundmass ') + lenMM(r.Lg) : lenMM(r.L));
      const Ncm = r.N * 1e-6;
      setHTML('rN', Ncm > 0 ? sciHTML(Ncm) : '—');
      setHTML('rG', num(r.glass * 100, r.glass < 0.1 && r.glass > 0.001 ? 1 : 0) + ' %');
      setHTML('rT', (r.end === 'glass' ? T('凍成玻璃：', 'Glass after ') : '') + dur(r.tEnd));
      setHTML('rQ', r.q ? rate(r.q) : T('沒有結晶到一半', 'never half crystallised'));
      setHTML('rDT', r.dT50 != null ? num(r.dT50, r.dT50 < 10 ? 1 : 0) + ' °C' : '—');
      setHTML('rTr', num(r.Tr, 0) + ' °C' + T('（液相線 ', ' (liquidus ') + num(r.TL, 0) + T(' °C）', ' °C)'));
      setHTML('cvHint', sideWide() ? T('左：岩體的剖面，顏色是溫度（亮橘色最熱），紅線是溫度剖面；點或拖曳左邊的剖面可以改變取樣點。右：取樣點的岩石放大來看（偏光顯微鏡下，玻璃是黑的）。', 'Left: cross-section of the body, coloured by temperature (bright orange is hottest); the red line is the temperature profile. Tap or drag on it to move the sample point. Right: the rock at the sample point, magnified (under crossed polars glass is black).') : T('上：岩體的剖面，顏色是溫度（亮橘色最熱），紅線是溫度剖面；點或拖曳剖面可以改變取樣點。下：取樣點的岩石放大來看（偏光顯微鏡下，玻璃是黑的）。', 'Top: cross-section of the body, coloured by temperature (bright orange is hottest); the red line is the temperature profile. Tap or drag on it to move the sample point. Bottom: the rock at the sample point, magnified (under crossed polars glass is black).'));
      setHTML('chartHint', state.chart === 'Tt'
        ? T('時間軸是對數刻度：每一格是前一格的好幾倍。紅線降到液相線以下才開始結晶（藍線上升）；降到玻璃轉移溫度時還沒結晶的部分就成了玻璃。', 'The time axis is logarithmic. Crystals appear (blue rises) only after the red line drops below the liquidus; whatever is still melt at the glass transition becomes glass.')
        : T('成核（紫）與成長（綠）都需要過冷度，但溫度低了熔體又變黏，所以兩條都是先升後降。成核的峰在更大的過冷度：冷得快、過冷度大，晶核多而小。兩條曲線各自除以自己的最大值，橫軸右端是玻璃轉移溫度。', 'Nucleation (purple) and growth (green) both need undercooling, but colder melt is stickier, so both rise and then fall. Nucleation peaks at larger undercooling: fast cooling means many small crystals. Each curve is scaled to its own maximum; the right end of the axis is the glass transition.'));
      cv.setAttribute('aria-label', T('岩體剖面與顯微鏡。', 'Cross-section and microscope. ') + rockName(r) + T('，', ', ') + texName(r.tex) + T('，晶體 ', ', crystals ') + lenMM(r.L) + T('，凝固時間 ', ', solidifies in ') + dur(r.tEnd));
    } else {
      const P = plag(), frac = state.meth === 'frac';
      setHTML('pTL', num(P.TL, 0) + ' °C' + T('（第一顆晶體 ', ' (first crystal ') + anPct(MC.loop(P.TL).xs) + T('）', ')'));
      setHTML('pTS', num(P.TS, 0) + ' °C');
      if (frac) {
        const fr = P.fr, done = P.T <= MC.PLAG.TAb;
        setHTML('pXl', fr.F > 0 && !done ? anPct(fr.xl) : T('沒有了', 'none left'));
        setHTML('pXs', P.T >= P.TL ? '—' : anPct(done ? 0 : fr.xs) + T('（核心 ', ' (core ') + anPct(fr.zones[0].x) + T('）', ')'));
        setHTML('pXm', fr.mean == null ? '—' : anPct(fr.mean));
        setHTML('pFs', num((1 - fr.F) * 100, 0) + ' % ／ ' + num(fr.F * 100, 0) + ' %');
      } else {
        const e = P.eq;
        setHTML('pXl', e.state === 'solid' ? T('沒有了', 'none left') : anPct(e.xl));
        setHTML('pXs', e.state === 'liquid' ? '—' : anPct(e.xs));
        setHTML('pXm', e.state === 'liquid' ? '—' : anPct(e.xs));
        setHTML('pFs', num(e.fs * 100, 0) + ' % ／ ' + num((1 - e.fs) * 100, 0) + ' %');
      }
      setHTML('cvHint', (sideWide() ? T('左：', 'Left: ') : T('上：', 'Top: ')) + T('斜長石的相圖（Bowen 1913 的實驗，一大氣壓、無水）。橘線是液相線（開始結晶），青線是固相線（平衡時完全凝固）；點或拖曳相圖可以改成分與溫度。', 'the plagioclase phase diagram (Bowen 1913, 1 atm, dry). Orange: liquidus (crystals start); teal: solidus (fully solid at equilibrium). Tap or drag on the diagram to change composition and temperature. ') + (sideWide() ? T('右：', 'Right: ') : T('下：', 'Bottom: ')) + T('熔體裡長出的斜長石，顏色代表成分。', 'the plagioclase growing in the melt, coloured by composition.'));
      setHTML('chartHint', T('鮑文反應序列：天然岩漿降溫時礦物出現的順序。右邊的連續系列就是上面的斜長石；箭頭標出現在長出的斜長石成分（天然含水岩漿的溫度比上面的實驗低數百度）。', 'Bowen’s reaction series: the order in which minerals appear in a cooling natural magma. The continuous branch on the right is the plagioclase above; the marker shows the composition growing now (natural, water-bearing magmas are a few hundred degrees cooler than the dry experiment).'));
      cv.setAttribute('aria-label', T('斜長石相圖。', 'Plagioclase phase diagram. ') + anPct(P.x0) + '，' + num(P.T, 0) + ' °C');
    }
  }
  function sciHTML(v) {
    const e = Math.floor(Math.log10(v)), m = v / Math.pow(10, e);
    if (e >= -2 && e <= 4) return sig(v, 2);
    return num(m, 1) + ' × 10<sup>' + String(e).replace('-', '−') + '</sup>';
  }
  function updateLog() {
    if (!state.log.length) { setHTML('runlog', T('每冷卻完一次，結果會記在這裡，方便比較。', 'Each time the cooling runs to the end, the result is kept here so you can compare.')); return; }
    setHTML('runlog', state.log.slice().reverse().map(function (r) {
      return '<b>' + r.name + '</b>' + T('・半厚 ', ' · a = ') + lenM(r.a) + T('・深 ', ' · ') + num(r.z, 1) + T(' km・位置 ', ' km · x/a ') + num(r.xr, 2) + ' → ' + (r.glass >= 0.5 ? T('玻璃 ', 'glass ') + num(r.glass * 100, 0) + ' %' : (r.phen > 0 ? T('斑晶 ', 'phenocrysts ') + lenMM(r.Lp) + T('、石基 ', ', groundmass ') : '') + lenMM(r.L)) + T('，', ', ') + dur(r.t);
    }).join('<br>'));
  }
  function updateButtons() {
    const run = state.mode === 'cool' ? state.run : state.prun;
    const idle = state.mode === 'cool' ? T('開始冷卻', 'Cool it') : T('慢慢降溫', 'Cool slowly');
    $('go').textContent = run && !run.done ? (run.playing ? T('冷卻中…', 'Cooling…') : T('繼續', 'Resume')) : run && run.done ? T('再冷卻一次', 'Again') : idle;
    $('pause').disabled = !run || run.done || !run.playing;
    $('pause').textContent = T('暫停', 'Pause');
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function fillPresets() {
    const box = $('presetSeg');
    box.innerHTML = '';
    MC.PRESETS.forEach(function (p) {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('data-p', p.id); b.textContent = T(p.zh, p.en);
      b.setAttribute('aria-pressed', String(p.id === state.preset));
      b.addEventListener('click', function () { acted(); cancelRun(); applyPreset(p.id); readSliders(); presetStatus(p); refreshOutputs(); afterChange(true); });
      box.appendChild(b);
    });
  }
  function presetStatus(p) {
    const r = R();
    setStatus(T(p.zh + '：', p.en + ': ') + T(MC.magma(p.type).zh + '岩漿，半厚 ', MC.magma(p.type).en.toLowerCase() + ' magma, half-thickness ') + lenM(p.a) + T('，深 ', ', ') + num(p.z, 1) + T(' km。按「開始冷卻」看它變成什麼岩石。', ' km deep. Press “Cool it” to see which rock it becomes.') + (r ? '' : ''));
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  function bodyChanged() { state.preset = ''; cancelRun(); }
  [el.size, el.dep, el.pos, el.phen].forEach(function (inp) {
    inp.addEventListener('input', function () { acted(); readSliders(); bodyChanged(); refreshOutputs(); afterChange(); });
    inp.addEventListener('change', function () { afterChange(true); });
  });
  [el.an0, el.temp].forEach(function (inp) {
    inp.addEventListener('input', function () { acted(); readSliders(); cancelPlag(); refreshOutputs(); afterChange(); });
    inp.addEventListener('change', function () { afterChange(true); });
  });
  document.querySelectorAll('#typeSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); state.type = b.getAttribute('data-type'); bodyChanged(); refreshOutputs(); afterChange(true); });
  });
  document.querySelectorAll('#modeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted(); state.mode = b.getAttribute('data-mode');
      refreshOutputs(); updateButtons(); afterChange(true);
      setStatus(state.mode === 'plag' ? T('斜長石：選岩漿的成分，按「慢慢降溫」或拖曳溫度，看晶體長出來。', 'Plagioclase: choose the composition and press “Cool slowly” or drag the temperature.') : T('選一種岩石，按「開始冷卻」。', 'Choose a rock and press “Cool it”.'));
    });
  });
  document.querySelectorAll('#methSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); state.meth = b.getAttribute('data-meth'); cancelPlag(); refreshOutputs(); afterChange(true); });
  });
  document.querySelectorAll('#chartSeg button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); state.chart = b.getAttribute('data-chart'); refreshOutputs(); afterChange(true); });
  });
  $('go').addEventListener('click', startRun);
  $('pause').addEventListener('click', function () { acted(); pauseRun(); });
  $('clear').addEventListener('click', function () {
    state.log = []; state.run = null; state.prun = null;
    updateLog(); updateButtons();
    setStatus(T('已清除比較紀錄。', 'Comparison log cleared.'));
    afterChange(true);
  });
  $('soundBtn').addEventListener('click', function () {
    const on = !(window.LabSettings && window.LabSettings.get('sound'));
    if (window.LabSettings) window.LabSettings.set('sound', on);
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 畫布：拖曳取樣點、點相圖 ----------
  let dragging = false;
  function cvPos(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function pointer(p, start) {
    const W = cvSize.w, H = cvSize.h;
    if (state.mode === 'cool') {
      const L = coolLay(W, H), s = L.sec;
      if (start && (p[0] < s.x || p[0] > s.x + s.w || p[1] < s.y || p[1] > s.y + s.h)) return false;
      const r = R(), span = 2.4 * r.a, yc = s.y + s.h * 0.52, k = (s.h * 0.44) / span;
      const xr = Math.max(0, Math.min(1, Math.abs((yc - p[1]) / k) / r.a));
      setSlider(el.pos, Math.round(xr * 100) / 100); readSliders(); bodyChanged(); refreshOutputs(); afterChange();
      return true;
    }
    const L = plagLay(W, H), q = L.pd;
    if (start && (p[0] < q.x - 10 || p[0] > q.x + q.w + 10 || p[1] < q.y - 10 || p[1] > q.y + q.h + 10)) return false;
    const x = Math.max(0, Math.min(1, (p[0] - q.x) / q.w));
    const Tc = Math.max(1100, Math.min(1560, TMAX - (p[1] - q.y) / q.h * (TMAX - TMIN)));
    setSlider(el.an0, Math.round(x * 100)); setSlider(el.temp, Math.round(Tc)); readSliders(); cancelPlag(); refreshOutputs(); afterChange();
    return true;
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (ev.button !== 0 || !cvSize) return;
    acted();
    if (pointer(cvPos(ev), true)) { dragging = true; try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ } }
  });
  cv.addEventListener('pointermove', function (ev) { if (dragging) pointer(cvPos(ev), false); });
  function endDrag() { if (dragging) { dragging = false; afterChange(true); } }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------- 鍵盤 ----------
  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('實驗畫面。冷卻：上下鍵移動取樣點。斜長石：左右鍵改成分、上下鍵改溫度（按住 Shift 移動較多）。', 'Experiment view. Cooling: up and down move the sample point. Plagioclase: left and right change the composition, up and down the temperature (hold Shift for bigger steps).'),
      items: [{
        name: function () { return state.mode === 'cool' ? T('取樣點', 'Sample point') : T('成分與溫度', 'Composition and temperature'); },
        move: function (dx, dy, big) {
          if (!dx && !dy) return false;
          acted();
          if (state.mode === 'cool') { if (!dy) return false; setSlider(el.pos, Math.max(0, Math.min(1, state.xr + dy * (big ? 0.1 : 0.02)))); readSliders(); bodyChanged(); }
          else { setSlider(el.an0, Math.max(0, Math.min(100, state.an0 * 100 + dx * (big ? 10 : 1)))); setSlider(el.temp, Math.max(1100, Math.min(1560, state.T + dy * (big ? 20 : 2)))); readSliders(); cancelPlag(); }
          refreshOutputs(); afterChange();
          return true;
        },
        describe: function () {
          if (state.mode === 'cool') { const r = R(); return T('取樣位置 ', 'Sample at ') + num(state.xr, 2) + T('，', ', ') + rockName(r) + T('，晶體 ', ', crystals ') + lenMM(r.L); }
          return anPct(state.an0) + T('，', ', ') + num(state.T, 0) + ' °C';
        }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  fillPresets();
  applyPreset('penghu');
  readSliders();
  refreshOutputs();
  updateButtons();
  updateSoundButton();
  updateLog();
  updateReadouts();
  function themeChanged() {
    readColors(); xtl = null;
    fillPresets(); updateButtons(); updateSoundButton(); updateReadouts(); updateLog();
    requestDraw();
  }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lh = 0, gw = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lw || cv.clientHeight !== lh || gr.clientWidth !== gw) { lw = cv.clientWidth; lh = cv.clientHeight; gw = gr.clientWidth; if (gw > 0) resizeCv(); }
    }).observe(stage);
  } else window.addEventListener('resize', resizeCv);
  resizeCv();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastFrame = 0; requestDraw(); } });
  setStatus(T('澎湖的玄武岩熔岩流，厚約 8 m。按「開始冷卻」，看岩漿怎麼變成岩石。', 'A Penghu basalt lava flow, about 8 m thick. Press “Cool it” to watch the magma turn into rock.'));
  requestDraw();
  // 測試用（Playwright）
  window.__mc = {
    state: state, MC: MC, R: R, snapshot: snapshot,
    preset: function (id) { acted(); cancelRun(); applyPreset(id); readSliders(); refreshOutputs(); afterChange(true); },
    set: function (o) {
      acted(); cancelRun(); cancelPlag();
      if (o.mode) state.mode = o.mode;
      if (o.type) state.type = o.type;
      if (o.meth) state.meth = o.meth;
      if (o.a != null) setSlider(el.size, o.a);
      if (o.z != null) setSlider(el.dep, o.z);
      if (o.xr != null) setSlider(el.pos, o.xr);
      if (o.phen != null) setSlider(el.phen, o.phen);
      if (o.an0 != null) setSlider(el.an0, o.an0);
      if (o.T != null) setSlider(el.temp, o.T);
      readSliders(); if (o.a != null || o.z != null || o.xr != null || o.phen != null || o.type) state.preset = '';
      refreshOutputs(); updateButtons(); afterChange(true);
    },
    play: function (u) { if (state.mode === 'cool') { if (!state.run) startRun(); state.run.playing = false; state.run.u = u; updateButtons(); requestDraw(); } },
    finish: function () { if (state.mode === 'cool') { if (!state.run) startRun(); stepRun(1e6); } else { if (!state.prun) startPlag(); stepPlag(1e6); } requestDraw(); }
  };
})();
