/* population-pyramid.js — 「人口金字塔與人口推估」的畫面與互動
 * 推估全部在 population-pyramid-core.js（PopCore）；這裡只負責情境、時間、繪圖與操作。 */
(function () {
  'use strict';
  const K = window.PopCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FONT = D.FONT;
  const START = K.BASE_YEAR, END = K.END_YEAR, N = K.N;
  const PLAY_SPD = 5;                       // 播放時每秒幾年
  const DRAGON = [1976, 1988, 2000, 2012], TIGER = [1998, 2010];
  const BASE = K.basePop(), BASE_TOTAL = K.indicators(BASE).total;

  // =====================================================================
  // 狀態
  // =====================================================================
  const el = { tfr: $('tfr'), e0: $('e0'), net: $('net'), srb: $('srb'), yr: $('yr') };
  const state = {
    mode: 'ndc', tfr: 0.7, e0: 81.5, net: 0, srb: 107,
    year: START, yearF: START, past: null, cmp: 'start',
    cohort: null, cohortFrom: null,     // 跟著的出生年；開始跟的時候幾歲
    running: false, acted: false
  };
  let traj = [], inds = [], trajKey = '', stableR = 0, xmax0 = 1, xmax = 1, tsMax = 25e6;
  function barMax(p) { let m = 0; for (let a = 0; a < N; a++) m = Math.max(m, p.m[a], p.f[a]); return m; }

  function readSliders() {
    state.tfr = Math.max(0.5, Math.min(6, Math.round(val(el.tfr) * 100) / 100));
    state.e0 = Math.max(30, Math.min(95, Math.round(val(el.e0) * 10) / 10));
    state.net = Math.max(-100, Math.min(300, Math.round(val(el.net))));
    state.srb = Math.max(95, Math.min(125, Math.round(val(el.srb) * 10) / 10));
  }
  function scenario() {
    if (state.mode === 'ndc') return { mode: 'ndc' };
    return { mode: 'custom', tfr: state.tfr, e0: state.e0, net: state.mode === 'stable' ? 0 : state.net * 1000, srb: state.srb };
  }
  /** 依目前情境重算 2025–2125 每一年的人口（設定沒變就不重算） */
  function rebuild() {
    const sc = scenario(), key = state.mode + '|' + JSON.stringify(sc);
    if (key === trajKey) return;
    trajKey = key;
    let start = BASE;
    stableR = 0;
    if (state.mode === 'stable') { const s = K.stablePop(sc, BASE_TOTAL); start = s.pop; stableR = s.r; }
    traj = K.project(start, sc, END);
    inds = traj.map(K.indicators);
    // 橫軸：整段推估與 2025 年真實人口的最大長條，取整
    xmax0 = niceCeil(barMax(BASE) * 1.04);
    let tm = 24e6;
    inds.forEach(function (d) { tm = Math.max(tm, d.total); });
    tsMax = niceCeil(tm * 1.05);
  }
  function niceCeil(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    return (f <= 1 ? 1 : f <= 1.5 ? 1.5 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 3 ? 3 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 6 ? 6 : f <= 8 ? 8 : 10) * p;
  }
  const idx = function () { return state.year - START; };
  function curPop() { return state.past ? K.pastPop(state.past) : traj[idx()]; }
  function curInd() { return state.past ? K.indicators(K.pastPop(state.past)) : inds[idx()]; }
  function dispYear() { return state.past || state.year; }
  function isReal() { return !!state.past || (state.year === START && state.mode !== 'stable'); }
  function cmpPop() {
    if (state.cmp === 'start') return (state.past || state.year !== START || state.mode === 'stable') ? BASE : null;
    if (state.cmp === 'ndc' && !state.past) return K.ndcPop(state.year);
    return null;
  }
  function cohortInfo() {
    if (state.cohort == null) return null;
    const p = curPop(), age = dispYear() - state.cohort;
    const n = age < 0 || age > 100 ? (age > 100 ? 0 : null) : p.m[Math.min(age, N - 1)] + p.f[Math.min(age, N - 1)];
    return { year: state.cohort, age: age, n: n, from: state.cohortFrom };
  }

  // ---------- 顏色與格式 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--pp-m', '--pp-f', '--pp-young', '--pp-old', '--pp-cmp', '--pp-ndc', '--pp-sel', '--pp-band', '--text', '--muted', '--border', '--surface', '--bg', '--accent']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
  }
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    const s = v.toFixed(d == null ? 0 : d);
    return (s === '-0' || /^-0\.0*$/.test(s) ? s.slice(1) : s).replace(/^-/, '−');
  }
  function grp(v) {
    if (v == null || !isFinite(v)) return '—';
    const s = Math.round(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v < -0.5 ? '−' : '') + s;
  }
  function people(v) {
    if (v == null || !isFinite(v)) return '—';
    return T(v >= 1e8 ? num(v / 1e8, 2) + ' 億人' : v >= 1e4 ? num(v / 1e4, v >= 1e7 ? 0 : 1) + ' 萬人' : grp(v) + ' 人',
      v >= 1e6 ? num(v / 1e6, 2) + ' million' : grp(v));
  }
  function signedPeople(v) {
    if (v == null || !isFinite(v)) return '—';
    return (v > 0.5 ? '+' : '') + (v < -0.5 ? '−' + people(-v) : people(v));
  }
  function shapeName(s) {
    return s === 'expansive' ? T('擴張型（金字塔型）', 'expansive (pyramid)') : s === 'stationary' ? T('穩定型（鐘型）', 'stationary (bell)') : T('收縮型（壺型）', 'constrictive (urn)');
  }
  function stageName(k) {
    return [T('年輕人口', 'young population'), T('高齡化社會', 'ageing society'), T('高齡社會', 'aged society'), T('超高齡社會', 'super-aged society')][k];
  }
  function setText(id, s) { const e = $(id); if (e && e.textContent !== s) e.textContent = s; }
  function setHTML(id, s) { const e = $(id); if (e && e.innerHTML !== s) e.innerHTML = s; }
  function setOut(inp, txt) { const o = inp.parentNode.querySelector('output'); if (o && o.textContent !== txt && !o.dataset.editing) o.textContent = txt; }
  function setStatus(s) { $('status').innerHTML = s; }

  // =====================================================================
  // 畫布
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const ts = $('ts'), tctx = ts.getContext('2d');
  let size = { w: 600, h: 520, dpr: 1 }, tsSize = { w: 600, h: 210 };
  function fitOne(c, cx) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300, h = c.clientHeight || 200;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h, dpr: dpr };
  }
  function fit() { size = fitOne(cv, ctx); tsSize = fitOne(ts, tctx); }
  function fsz() { return (window.LabSettings && window.LabSettings.get && +window.LabSettings.get('fs')) || 1; }
  function geom() {
    const w = size.w, h = size.h, fs = fsz();
    const top = Math.round(36 * Math.min(fs, 1.3)), bot = Math.round(26 * Math.min(fs, 1.3));
    const gap = Math.round((w < 520 ? 30 : 38) * Math.min(fs, 1.3)), side = w < 520 ? 6 : 12;
    const half = (w - 2 * side - gap) / 2, mid = w / 2;
    return { top: top, bot: bot, gap: gap, half: half, mid: mid, bh: (h - top - bot) / N, h: h, w: w, side: side };
  }
  const yOf = function (g, a) { return g.h - g.bot - (a + 1) * g.bh; };
  function tickStep(max) {
    const raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2.5 : f < 7.5 ? 5 : 10) * p;
  }
  function tickLabel(v) {
    if (v === 0) return '0';
    return T(v >= 1e8 ? num(v / 1e8, v % 1e8 ? 1 : 0) + ' 億' : v >= 1e4 ? num(v / 1e4, v % 1e4 ? 1 : 0) + ' 萬' : grp(v),
      v >= 1e6 ? num(v / 1e6, v % 1e6 ? 1 : 0) + 'M' : v >= 1e3 ? num(v / 1e3, v % 1e3 ? 1 : 0) + 'k' : grp(v));
  }
  function bandColor(a, sex) {
    const base = sex === 'm' ? C['pp-m'] : C['pp-f'];
    if (a < 15) return D.mix(C['pp-young'], base, 0.28);
    if (a >= 65) return D.mix(C['pp-old'], base, 0.28);
    return base;
  }

  function drawPyr() {
    const c = ctx, g = geom(), fs = fsz();
    c.clearRect(0, 0, g.w, g.h);
    D.backdrop(c, g.w, g.h);
    const p = curPop(), cmp = cmpPop();
    xmax = Math.max(xmax0, niceCeil(Math.max(barMax(p), cmp ? barMax(cmp) : 0) * 1.04));
    const X = function (v) { return v / xmax * g.half; };
    const L0 = g.mid - g.gap / 2, R0 = g.mid + g.gap / 2;
    // 年齡帶底色（0–14、65 以上）
    c.fillStyle = C['pp-band'];
    c.fillRect(g.side, yOf(g, 14), g.w - 2 * g.side, 15 * g.bh);
    c.fillRect(g.side, yOf(g, 100), g.w - 2 * g.side, 36 * g.bh);
    // 直的格線與橫軸刻度
    const st = tickStep(xmax), font = Math.round(10 * fs) + 'px ' + FONT;
    c.strokeStyle = D.alpha(C['text'], 0.08); c.lineWidth = 1;
    c.font = font; c.fillStyle = C['muted']; c.textBaseline = 'top'; c.textAlign = 'center';
    for (let v = 0; v <= xmax + 1; v += st) {
      [L0 - X(v), R0 + X(v)].forEach(function (x, k) {
        c.beginPath(); c.moveTo(x, g.top); c.lineTo(x, g.h - g.bot); c.stroke();
        const lw = c.measureText(tickLabel(v)).width / 2;
        if (v > 0 && (g.w >= 520 || Math.round(v / st) % 2 === 0) && x - lw >= 2 && x + lw <= g.w - 2) c.fillText(tickLabel(v), x, g.h - g.bot + 4);
        else if (v === 0 && k === 0) c.fillText('0', g.mid, g.h - g.bot + 4);
      });
    }
    // 長條
    const hb = Math.max(0.6, g.bh > 3 ? g.bh * 0.84 : g.bh);
    for (let a = 0; a < N; a++) {
      const y = yOf(g, a) + (g.bh - hb) / 2;
      c.fillStyle = bandColor(a, 'm'); c.fillRect(L0 - X(p.m[a]), y, X(p.m[a]), hb);
      c.fillStyle = bandColor(a, 'f'); c.fillRect(R0, y, X(p.f[a]), hb);
    }
    // 長條的亮邊（一點立體感）
    if (g.bh > 3) {
      c.fillStyle = D.alpha('#ffffff', D.dark ? 0.08 : 0.18);
      for (let a = 0; a < N; a++) {
        const y = yOf(g, a) + (g.bh - hb) / 2;
        c.fillRect(L0 - X(p.m[a]), y, X(p.m[a]), hb * 0.35);
        c.fillRect(R0, y, X(p.f[a]), hb * 0.35);
      }
    }
    // 15 歲與 65 歲的分界線
    c.strokeStyle = D.alpha(C['text'], 0.28); c.setLineDash([3, 3]);
    [15, 65].forEach(function (a) { const y = yOf(g, a - 1); c.beginPath(); c.moveTo(g.side, y); c.lineTo(g.w - g.side, y); c.stroke(); });
    c.setLineDash([]);
    // 對照的輪廓
    if (cmp) {
      c.strokeStyle = state.cmp === 'ndc' ? C['pp-ndc'] : C['pp-cmp']; c.lineWidth = 1.6; c.setLineDash([4, 3]);
      ['m', 'f'].forEach(function (s) {
        c.beginPath();
        for (let a = 0; a < N; a++) {
          const x = s === 'm' ? L0 - X(cmp.m[a]) : R0 + X(cmp.f[a]), y0 = yOf(g, a) + g.bh, y1 = yOf(g, a);
          if (a === 0) c.moveTo(x, y0); else c.lineTo(x, y0);
          c.lineTo(x, y1);
        }
        c.stroke();
      });
      c.setLineDash([]);
    }
    // 年齡標籤（中間）
    c.fillStyle = C['muted']; c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let a = 0; a <= 100; a += 10) c.fillText(a === 100 ? '100+' : String(a), g.mid, yOf(g, a) + g.bh / 2);
    // 跟著的世代
    const co = cohortInfo();
    if (co && co.age >= 0 && co.age <= 100) {
      const a = Math.min(co.age, N - 1), y = yOf(g, a);
      const xl = L0 - X(p.m[a]) - 3, xr = R0 + X(p.f[a]) + 3;
      c.strokeStyle = C['pp-sel']; c.lineWidth = 2.2;
      D.roundRect(c, Math.min(xl, L0 - 6), y - 1.5, Math.max(xr, R0 + 6) - Math.min(xl, L0 - 6), g.bh + 3, 3); c.stroke();
      const lab = T(co.year + ' 年出生・' + co.age + ' 歲', 'born ' + co.year + ' · age ' + co.age);
      const lf = '600 ' + Math.round(11 * fs) + 'px ' + FONT;
      c.font = lf;
      const tw = c.measureText(lab).width + 16, rx = Math.max(xr + 8, R0 + 10), lx = Math.min(xl - 8, L0 - 10);
      if (rx + tw <= g.w - g.side) D.pill(c, lab, rx, y + g.bh / 2 + 5, C['pp-sel'], 'left', lf);
      else if (lx - tw >= g.side) D.pill(c, lab, lx, y + g.bh / 2 + 5, C['pp-sel'], 'right', lf);
      else D.pill(c, lab, g.w - g.side - 4, y - 4, C['pp-sel'], 'right', lf);
    }
    // 上方：男女與年份
    const tf = '700 ' + Math.round(12 * fs) + 'px ' + FONT;
    c.font = tf; c.textBaseline = 'middle';
    c.fillStyle = C['pp-m']; c.textAlign = 'left'; c.fillText(T('男', 'Men'), g.side + 2, g.top / 2);
    c.fillStyle = C['pp-f']; c.textAlign = 'right'; c.fillText(T('女', 'Women'), g.w - g.side - 2, g.top / 2);
    const yl = state.past ? T(state.past + ' 年（真實）', state.past + ' (real)')
      : state.mode === 'stable' ? T('穩定人口・第 ' + (state.year - START) + ' 年', 'Stable population · year ' + (state.year - START))
      : state.year === START ? T('2025 年（真實）', '2025 (real)') : T(state.year + ' 年（推估）', state.year + ' (projection)');
    D.pill(c, yl, g.mid, g.top / 2 + 6, C['text'], 'center', '700 ' + Math.round(13 * fs) + 'px ' + FONT);
    if (kb && kb.focused()) {
      c.strokeStyle = C['accent']; c.lineWidth = 2; c.setLineDash([6, 4]);
      D.roundRect(c, 3, 3, g.w - 6, g.h - 6, 8); c.stroke(); c.setLineDash([]);
    }
  }

  // ---------- 總人口與 65 歲以上比例的時間圖 ----------
  const TS0 = 1990;
  function tsGeom() {
    const w = tsSize.w, h = tsSize.h, fs = fsz();
    return { w: w, h: h, pl: Math.round(48 * Math.min(fs, 1.3)), pr: Math.round(38 * Math.min(fs, 1.3)), pt: Math.round(26 * Math.min(fs, 1.3)), pb: Math.round(22 * Math.min(fs, 1.3)) };
  }
  function drawTS() {
    const c = tctx, g = tsGeom(), fs = fsz(), w = g.w, h = g.h;
    c.clearRect(0, 0, w, h);
    D.backdrop(c, w, h);
    const X = function (y) { return g.pl + (y - TS0) / (END - TS0) * (w - g.pl - g.pr); };
    const YP = function (v) { return h - g.pb - v / tsMax * (h - g.pt - g.pb); };
    let pm = 60;
    inds.forEach(function (d) { pm = Math.max(pm, Math.ceil(d.pct65 / 10) * 10); });
    const YQ = function (v) { return h - g.pb - v / pm * (h - g.pt - g.pb); };
    const font = Math.round(10 * fs) + 'px ' + FONT;
    c.font = '600 ' + Math.round(11 * fs) + 'px ' + FONT; c.textBaseline = 'top';
    c.fillStyle = C['text']; c.textAlign = 'left'; c.fillText(T('總人口', 'Population'), g.pl, 6);
    c.fillStyle = C['pp-old']; c.textAlign = 'right'; c.fillText(T('65 歲以上（%）', 'Aged 65+ (%)'), w - g.pr, 6);
    // 格線
    c.font = font; c.strokeStyle = D.alpha(C['text'], 0.08); c.lineWidth = 1;
    const ps = tickStep(tsMax);
    c.fillStyle = C['muted']; c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let v = 0; v <= tsMax + 1; v += ps) {
      c.beginPath(); c.moveTo(g.pl, YP(v)); c.lineTo(w - g.pr, YP(v)); c.stroke();
      c.fillText(T(num(v / 1e4, 0) + '萬', num(v / 1e6, v % 1e6 ? 1 : 0) + 'M'), g.pl - 4, YP(v));
    }
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let y = 2000; y <= END; y += 25) { c.beginPath(); c.moveTo(X(y), g.pt); c.lineTo(X(y), h - g.pb); c.stroke(); c.fillText(String(y), X(y), h - g.pb + 3); }
    // 7、14、20% 門檻
    c.setLineDash([3, 3]); c.strokeStyle = D.alpha(C['pp-old'], 0.45);
    c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = C['pp-old'];
    [7, 14, 20].forEach(function (v) { c.beginPath(); c.moveTo(g.pl, YQ(v)); c.lineTo(w - g.pr, YQ(v)); c.stroke(); c.fillText(v + '%', w - g.pr + 4, YQ(v)); });
    c.setLineDash([]);
    // 過去的真實值
    const past = K.PAST.map(function (y) { return K.indicators(K.pastPop(y)); }).concat([K.indicators(BASE)]);
    c.lineWidth = 1.4; c.strokeStyle = D.alpha(C['text'], 0.5);
    c.beginPath(); past.forEach(function (d, i) { if (i) c.lineTo(X(d.year), YP(d.total)); else c.moveTo(X(d.year), YP(d.total)); }); c.stroke();
    c.strokeStyle = D.alpha(C['pp-old'], 0.6);
    c.beginPath(); past.forEach(function (d, i) { if (i) c.lineTo(X(d.year), YQ(d.pct65)); else c.moveTo(X(d.year), YQ(d.pct65)); }); c.stroke();
    // 推估
    const y0 = state.mode === 'stable' ? 1 : 0;
    c.lineWidth = 2.2; c.strokeStyle = C['text'];
    c.beginPath(); inds.forEach(function (d, i) { if (i > y0) c.lineTo(X(d.year), YP(d.total)); else if (i === y0) c.moveTo(X(d.year), YP(d.total)); }); c.stroke();
    c.strokeStyle = C['pp-old'];
    c.beginPath(); inds.forEach(function (d, i) { if (i > y0) c.lineTo(X(d.year), YQ(d.pct65)); else if (i === y0) c.moveTo(X(d.year), YQ(d.pct65)); }); c.stroke();
    // 國發會公布的總人口
    if (state.mode === 'ndc') {
      const chk = K.DATA.ndc.check;
      Object.keys(chk).forEach(function (y) { c.fillStyle = C['pp-ndc']; c.beginPath(); c.arc(X(+y), YP(chk[y].total), 3, 0, 6.283); c.fill(); });
    }
    past.forEach(function (d) { c.fillStyle = C['text']; c.beginPath(); c.arc(X(d.year), YP(d.total), 2.6, 0, 6.283); c.fill(); });
    // 現在的年份
    const yr = dispYear(), d = curInd();
    c.strokeStyle = C['accent']; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(X(yr), g.pt); c.lineTo(X(yr), h - g.pb); c.stroke();
    c.fillStyle = C['accent']; c.beginPath(); c.arc(X(yr), YP(d.total), 4.2, 0, 6.283); c.fill();
    c.fillStyle = C['pp-old']; c.beginPath(); c.arc(X(yr), YQ(d.pct65), 3.6, 0, 6.283); c.fill();
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  function updateReadouts() {
    setOut(el.tfr, num(state.tfr, 2)); setOut(el.e0, num(state.e0, 1)); setOut(el.net, num(state.net, 0)); setOut(el.srb, num(state.srb, 1));
    setOut(el.yr, String(state.year));
    if (+el.yr.value !== state.year) el.yr.value = state.year;
    const d = curInd(), p = curPop(), i = idx();
    setText('hYear', state.mode === 'stable' && !state.past ? T('人口・第 ' + idx() + ' 年', 'Population · year ' + idx()) : T('人口・' + dispYear() + ' 年', 'Population · ' + dispYear()));
    setText('rTot', people(d.total));
    setHTML('rShape', shapeName(d.shape));
    setText('rY', num(d.pct0_14, 1) + '%'); setText('rW', num(d.pct15_64, 1) + '%'); setText('rO', num(d.pct65, 1) + '%');
    setHTML('rStage', stageName(d.stage));
    setText('rDep', num(d.dep, 1) + T('（扶幼 ' + num(d.depY, 1) + '、扶老 ' + num(d.depO, 1) + '）', ' (young ' + num(d.depY, 1) + ', old ' + num(d.depO, 1) + ')'));
    setText('rAge', num(d.aging, 0));
    setText('rMed', T(num(d.median, 1) + ' 歲', num(d.median, 1) + ' years'));
    setText('rSex', num(d.sexRatio, 2));
    setText('rCent', people(d.p100));
    // 這一年的出生、死亡、遷移（真實年份與起點沒有）
    const flows = !state.past && i > 0 ? p : null;
    const tfrNow = state.past ? null : state.mode === 'ndc' ? (i > 0 ? traj[i].tfr : K.DATA.asfr.tfr) : state.tfr;
    setText('rTfr', tfrNow == null ? '—' : num(tfrNow, tfrNow < 1 ? 3 : 2));
    setText('rB', flows ? people(flows.births) : '—');
    setText('rD', flows ? people(flows.deaths) : '—');
    setText('rN', flows ? signedPeople(flows.net) : '—');
    const gr = state.mode === 'stable' && !state.past ? stableR : (!state.past && i > 0 ? inds[i].total / inds[i - 1].total - 1 : null);
    setText('rG', gr == null ? '—' : (gr > 0 ? '+' : '') + num(gr * 100, 2) + T('%／年', '% / yr'));
    const co = cohortInfo();
    if (!co) { setText('rCoh', T('點金字塔上的一條長條', 'Tap a bar in the pyramid')); setText('rCohA', '—'); setText('rCohN', '—'); }
    else {
      setText('rCoh', T(co.year + ' 年' + (DRAGON.indexOf(co.year) >= 0 ? '（龍年）' : TIGER.indexOf(co.year) >= 0 ? '（虎年）' : ''), String(co.year)));
      setText('rCohA', co.age < 0 ? T('還沒出生（再 ' + (-co.age) + ' 年）', 'not born yet (' + (-co.age) + ' years to go)') : co.age >= 100 ? T('100 歲以上', '100 or over') : T(co.age + ' 歲', co.age + ' years'));
      setText('rCohN', co.age < 0 ? '—' : co.age > 100 ? T('併在 100 歲以上', 'counted in 100+') : people(co.n));
    }
    const cmp = cmpPop();
    setText('rCmp', cmp ? num(100 * K.distance(p, cmp), 1) + '%' : (state.cmp === 'ndc' ? T('國發會公布 2030、2040、2050、2070、2075 年', 'published for 2030, 2040, 2050, 2070, 2075') : '—'));
    $('srNow').textContent = T(dispYear() + ' 年：總人口 ' + people(d.total) + '，65 歲以上 ' + num(d.pct65, 1) + '%，' + shapeName(d.shape),
      dispYear() + ': population ' + people(d.total) + ', 65+ ' + num(d.pct65, 1) + '%, ' + shapeName(d.shape));
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function snapshot(act) {
    const d = curInd(), i = idx(), cmp = cmpPop(), co = cohortInfo();
    return {
      act: act || 'year', running: state.running, mode: state.mode, view: state.past ? 'past' : 'proj', real: isReal(),
      year: dispYear(), tfr: state.mode === 'ndc' ? (i > 0 ? traj[i].tfr : K.DATA.asfr.tfr) : state.tfr,
      e0: state.e0, net: state.mode === 'custom' ? state.net : 0, srb: state.srb,
      total: d.total, total2025: BASE_TOTAL, pct0_14: d.pct0_14, pct65: d.pct65, dep: d.dep,
      depPrev: !state.past && i > 0 ? inds[i - 1].dep : null, aging: d.aging, median: d.median,
      sexRatio: d.sexRatio, p100: d.p100, shape: d.shape,
      cmp: state.cmp, cmpDist: cmp ? K.distance(curPop(), cmp) : null,
      cohort: co ? co.year : null, cohortAge: co ? co.age : null, cohortFrom: co ? co.from : null, cohortN: co ? co.n : null,
      r: state.mode === 'stable' ? stableR : null,
      depMin: state.mode === 'stable' ? K.minDependency(state.e0, state.srb).dep : null
    };
  }
  let lastEmit = 0, emitTimer = 0, lastRead = 0;
  function emit(type, data) { if (state.acted && window.LabMission) window.LabMission.emit(type, data); }
  function acted() { state.acted = true; }
  function afterChange(force, act) {
    const now = performance.now();
    if (force || act !== 'play' || now - lastRead > 120) { lastRead = now; updateReadouts(); }
    requestDraw();
    clearTimeout(emitTimer);
    if (force || now - lastEmit > 300) { lastEmit = now; emit('pop', snapshot(act)); }
    else emitTimer = setTimeout(function () { lastEmit = performance.now(); emit('pop', snapshot(act)); }, 320);
  }

  // =====================================================================
  // 動畫
  // =====================================================================
  let raf = 0, lastTs = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(ts) {
    raf = 0;
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;
    if (state.running) {
      state.yearF += PLAY_SPD * dt;
      const y = Math.min(END, Math.floor(state.yearF));
      if (y !== state.year) { state.year = y; announce(); afterChange(false, 'play'); }
      if (state.year >= END) { setRun(false); setStatus(T('到 ' + END + ' 年了：推估到此為止。', 'Reached ' + END + ': the projection stops here.')); }
    }
    drawPyr(); drawTS();
    if (state.running) requestDraw();
    else lastTs = 0;
  }
  // 播放時遇到門檻就說一聲
  function announce() {
    const i = idx();
    if (i < 1) return;
    const a = inds[i - 1], b = inds[i];
    if (a.dep < 100 && b.dep >= 100) setStatus(T(b.year + ' 年：扶養比超過 100，被扶養的人比 15–64 歲的人還多。', b.year + ': the dependency ratio passes 100 — more dependants than people aged 15–64.'));
    else if (a.pct65 < 50 && b.pct65 >= 50) setStatus(T(b.year + ' 年：65 歲以上的人超過一半。', b.year + ': more than half the population is 65 or over.'));
    else if (a.median < 60 && b.median >= 60) setStatus(T(b.year + ' 年：年齡中位數超過 60 歲。', b.year + ': the median age passes 60.'));
    else if (a.total >= BASE_TOTAL / 2 && b.total < BASE_TOTAL / 2) setStatus(T(b.year + ' 年：人口不到 2025 年的一半。', b.year + ': fewer than half as many people as in 2025.'));
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  function setRun(on) {
    state.running = !!on;
    $('run').textContent = state.running ? T('暫停', 'Pause') : T('播放', 'Play');
    if (state.running) { state.yearF = state.year; requestDraw(); }
    afterChange(true, state.running ? 'playstart' : 'pause');
  }
  function leavePast() {
    if (!state.past) return;
    state.past = null;
    document.querySelectorAll('#pastSeg button').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
  }
  $('run').addEventListener('click', function () {
    acted();
    if (!state.running) {
      leavePast();
      if (state.year >= END) state.year = START;
      setStatus(T('時間開始走：每秒 ' + PLAY_SPD + ' 年。', 'Time is running: ' + PLAY_SPD + ' years per second.'));
    } else setStatus(T('暫停在 ' + state.year + ' 年。', 'Paused at ' + state.year + '.'));
    setRun(!state.running);
  });
  $('step').addEventListener('click', function () {
    acted(); leavePast();
    if (state.running) { state.running = false; $('run').textContent = T('播放', 'Play'); }
    if (state.year < END) state.year++;
    announce();
    afterChange(true, 'step');
  });
  $('back').addEventListener('click', function () {
    acted(); leavePast();
    if (state.running) { state.running = false; $('run').textContent = T('播放', 'Play'); }
    state.year = START;
    setStatus(T('回到 2025 年。', 'Back to 2025.'));
    afterChange(true, 'back');
  });
  el.yr.addEventListener('input', function () {
    acted(); leavePast();
    if (state.running) { state.running = false; $('run').textContent = T('播放', 'Play'); }
    state.year = Math.max(START, Math.min(END, Math.round(val(el.yr))));
    afterChange(false, 'year');
  });
  el.yr.addEventListener('change', function () { afterChange(true, 'year'); });
  document.querySelectorAll('#pastSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      const y = +b.getAttribute('data-past');
      if (state.running) { state.running = false; $('run').textContent = T('播放', 'Play'); }
      state.past = state.past === y ? null : y;
      document.querySelectorAll('#pastSeg button').forEach(function (x) { x.setAttribute('aria-pressed', +x.getAttribute('data-past') === state.past ? 'true' : 'false'); });
      if (state.past) setStatus(T(y + ' 年底的真實人口（內政部戶籍統計）。', 'Real population at the end of ' + y + ' (household registration).'));
      afterChange(true, 'past');
    });
  });
  function applyMode() {
    document.querySelectorAll('#modeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-mode') === state.mode ? 'true' : 'false'); });
    $('custom').hidden = state.mode === 'ndc';
    $('hintNdc').hidden = state.mode !== 'ndc';
    $('netRow').hidden = state.mode === 'stable';
    $('hintStable').hidden = state.mode !== 'stable';
  }
  document.querySelectorAll('#modeSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      state.mode = b.getAttribute('data-mode');
      applyMode(); leavePast(); rebuild();
      setStatus(state.mode === 'ndc' ? T('國發會中推估：生育率、死亡率、遷移照官方假設逐年變化。', 'Official medium projection: fertility, mortality and migration follow the official assumptions year by year.')
        : state.mode === 'custom' ? T('自訂：從 2025 年的真實人口出發，用下面的假設一直推下去。', 'My own: start from the real 2025 population and keep the assumptions below.')
        : T('穩定人口：這組生育率和平均壽命長期不變時，人口最後的樣子。每年增減 ' + num(stableR * 100, 2) + '%。', 'Stable population: where these birth and death rates lead in the long run. It changes by ' + num(stableR * 100, 2) + '% a year.'));
      afterChange(true, 'mode');
    });
  });
  function paramChanged(e) {
    acted();
    readSliders(); leavePast(); rebuild();
    if (state.mode === 'stable') setStatus(T('穩定人口：每年' + (stableR >= 0 ? '增加 ' : '減少 ') + num(Math.abs(stableR) * 100, 2) + '%，形狀永遠不變。', 'Stable population: it ' + (stableR >= 0 ? 'grows' : 'shrinks') + ' by ' + num(Math.abs(stableR) * 100, 2) + '% a year and keeps its shape for ever.'));
    afterChange(e && e.type === 'change', 'param');
  }
  [el.tfr, el.e0, el.net, el.srb].forEach(function (inp) { inp.addEventListener('input', paramChanged); inp.addEventListener('change', paramChanged); });
  document.querySelectorAll('#cmpSeg button').forEach(function (b) {
    b.addEventListener('click', function () {
      acted();
      state.cmp = b.getAttribute('data-cmp');
      document.querySelectorAll('#cmpSeg button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      afterChange(true, 'cmp');
    });
  });
  function pickAge(age) {
    age = Math.max(0, Math.min(100, age));
    const by = dispYear() - age;
    if (state.cohort === by) { state.cohort = null; state.cohortFrom = null; }
    else { state.cohort = by; state.cohortFrom = age; }
    const co = cohortInfo();
    if (co) setStatus(T('跟著 ' + co.year + ' 年出生的人：現在 ' + (age >= 100 ? '100 歲以上' : age + ' 歲') + '，' + people(co.n) + '。按「播放」看他們變老。',
      'Following people born in ' + co.year + ': now ' + (age >= 100 ? '100 or over' : 'aged ' + age) + ', ' + people(co.n) + '. Press Play to watch them grow old.'));
    afterChange(true, 'cohort');
  }
  cv.addEventListener('pointerdown', function (e) {
    const r = cv.getBoundingClientRect(), g = geom(), y = e.clientY - r.top;
    if (y < g.top || y > g.h - g.bot) return;
    acted();
    pickAge(Math.floor((g.h - g.bot - y) / g.bh));
  });
  ts.addEventListener('pointerdown', function (e) {
    const r = ts.getBoundingClientRect(), g = tsGeom(), x = e.clientX - r.left;
    const y = Math.round(TS0 + (x - g.pl) / (tsSize.w - g.pl - g.pr) * (END - TS0));
    if (y < START || y > END) return;
    acted(); leavePast();
    if (state.running) { state.running = false; $('run').textContent = T('播放', 'Play'); }
    state.year = y;
    afterChange(true, 'year');
  });

  const kb = window.LabKeys ? window.LabKeys.attach(cv, {
    label: T('人口金字塔。左右鍵換年份（Shift 一次 10 年），上下鍵選要跟著的出生年。', 'Population pyramid. Left and right change the year (Shift for 10 years); up and down choose a birth year to follow.'),
    items: [{
      name: function () { return T('年份與世代', 'Year and cohort'); },
      move: function (dx, dy, big) {
        acted();
        if (dx) {
          leavePast();
          state.year = Math.max(START, Math.min(END, state.year + dx * (big ? 10 : 1)));
          afterChange(true, 'year');
        }
        if (dy) {
          const co = cohortInfo();
          const age = co && co.age >= 0 && co.age <= 100 ? co.age + dy * (big ? 10 : 1) : 30;
          state.cohort = null;
          pickAge(age);
        }
        return true;
      },
      describe: function () {
        const d = curInd(), co = cohortInfo();
        return T(dispYear() + ' 年，總人口 ' + people(d.total) + (co ? '，跟著 ' + co.year + ' 年出生的人' : ''),
          dispYear() + ', population ' + people(d.total) + (co ? ', following people born in ' + co.year : ''));
      }
    }],
    onChange: function () { requestDraw(); }
  }) : null;

  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { m: state.mode, y: state.year, c: state.cmp, b: state.cohort }; },
    set: function (o) {
      if (!o) return;
      if (['ndc', 'custom', 'stable'].indexOf(o.m) >= 0) state.mode = o.m;
      if (['none', 'start', 'ndc'].indexOf(o.c) >= 0) {
        state.cmp = o.c;
        document.querySelectorAll('#cmpSeg button').forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-cmp') === state.cmp ? 'true' : 'false'); });
      }
      readSliders(); applyMode(); rebuild();
      if (isFinite(o.y)) state.year = Math.max(START, Math.min(END, Math.round(o.y)));
      if (isFinite(o.b) && o.b != null) { state.cohort = Math.round(o.b); state.cohortFrom = state.year - state.cohort; }
      updateReadouts(); requestDraw();
    }
  });

  window.__pp = { state: state, K: K, snapshot: snapshot, get traj() { return traj; }, pick: pickAge, redraw: requestDraw };

  readColors();
  readSliders();
  applyMode();
  rebuild();
  fit();
  updateReadouts();
  function themeChanged() { readColors(); updateReadouts(); $('run').textContent = state.running ? T('暫停', 'Pause') : T('播放', 'Play'); requestDraw(); }
  const dm = window.matchMedia('(prefers-color-scheme: dark)');
  if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  let rsTimer = 0;
  window.addEventListener('resize', function () { clearTimeout(rsTimer); rsTimer = setTimeout(function () { fit(); requestDraw(); }, 60); });
  if (window.ResizeObserver) new ResizeObserver(function () { fit(); requestDraw(); }).observe(cv);
  setStatus(T('2025 年底的真實人口。按「播放」照國發會的中推估往後走。', 'The real population at the end of 2025. Press Play to follow the official medium projection.'));
  requestDraw();
})();
