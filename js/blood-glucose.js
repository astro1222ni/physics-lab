/* blood-glucose.js — 「血糖調節」的畫面與互動（計算全部在 blood-glucose-core.js；3D 在 blood-glucose-3d.js，切換時才載入） */
(function () {
  'use strict';
  const B = window.GlucoseCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const FONT = D.FONT;
  const BW = 60;                              // 體重 kg
  const GH = BW * B.MW / 1000 * 60;           // mmol/kg/min → g/h
  const UH = BW * 60 / 1000;                  // mU/kg/min → U/h
  const MEAL_T = [420, 720, 1080, 1320];      // 07:00、12:00、18:00、22:00
  const MEAL_N = [['早餐', 'Breakfast'], ['午餐', 'Lunch'], ['晚餐', 'Dinner'], ['宵夜', 'Snack']];
  const MAX_KEEP = 3, MAX_ROWS = 20;
  const PLAY_MS = reducedMotion ? 5000 : 16000;   // 播放一天的時間
  const OGTT_RATE = reducedMotion ? 60 : 20;       // 試驗動畫：每秒幾分鐘
  const DRAWS = [0, 30, 60, 90, 120];
  const NB = 25, NS = 25, BMAX = 3, SMIN = 0.1, SMAX = 2;   // β × 敏感度地圖的格點

  // =====================================================================
  // 顏色、數字
  // =====================================================================
  const C = {};
  const KEYS = ['gl-glu', 'gl-ins', 'gl-in', 'gl-lo', 'gl-hi', 'gl-meal', 'gl-bolus', 'gl-basal', 'gl-ex', 'gl-renal', 'gl-liver', 'gl-ok', 'gl-pre', 'gl-dm', 'gl-k1', 'gl-k2', 'gl-k3'];
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    KEYS.forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function pct(v, d) { return num(v * 100, d == null ? 0 : d) + '%'; }
  function hhmm(t) {
    t = Math.round(t);
    const h = Math.floor(t / 60) % 25, m = ((t % 60) + 60) % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function hexRgb(c) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim());
    if (!m) return [128, 128, 128];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function niceMax(v, list) { for (let i = 0; i < list.length; i++) if (v <= list[i]) return list[i]; return list[list.length - 1]; }
  const crOf = function (beta) { return beta < 0.05 ? B.TYPES.t1.cr : 1; };   // 沒有 β 細胞（第一型）時升糖素反應也變弱
  const DX = {
    normal: { zh: '正常', en: 'Normal', col: 'gl-ok' },
    pre: { zh: '糖尿病前期', en: 'Prediabetes', col: 'gl-pre' },
    dm: { zh: '糖尿病', en: 'Diabetes', col: 'gl-dm' }
  };

  const TYPES = {
    normal: { zh: '健康', en: 'Healthy', beta: 1, si: 1 },
    t2: { zh: '第二型', en: 'Type 2', beta: B.TYPES.t2.beta, si: B.TYPES.t2.si },
    t1: { zh: '第一型', en: 'Type 1', beta: 0, si: B.TYPES.t1.si }
  };
  const TYPE_TIP = {
    normal: ['健康的人：β 細胞照血糖分泌胰島素，不用打針。', 'A healthy person: the β cells release insulin as glucose rises; no injections needed.'],
    t2: ['第二型：身體對胰島素的反應只剩三成，β 細胞也累了，只剩三成多的功能。先試試少吃一點、多動一點。', 'Type 2: the body answers insulin only about 30% as well as normal, and the tired β cells work at about a third of their capacity. Try eating a little less and moving a little more first.'],
    t1: ['第一型：β 細胞被免疫系統破壞，完全不會分泌胰島素。現在還沒有打針——試著用長效和速效胰島素把血糖拉回來。', 'Type 1: the immune system has destroyed the β cells, so no insulin is made at all. No injections yet — use long-acting and rapid-acting insulin to bring glucose back.']
  };
  const PATS = {
    normal: { zh: '健康', en: 'Healthy', beta: 1, si: 1 },
    comp: { zh: '代償中', en: 'Compensating', beta: 2.2, si: 0.4 },
    pre: { zh: '前期', en: 'Prediabetes', beta: 0.6, si: 0.6 },
    t2: { zh: '第二型', en: 'Type 2', beta: B.TYPES.t2.beta, si: B.TYPES.t2.si },
    t1: { zh: '第一型', en: 'Type 1', beta: 0, si: B.TYPES.t1.si }
  };

  // =====================================================================
  // 共用
  // =====================================================================
  function sound() { const S0 = window.LabSound; return S0 && S0.enabled() ? S0 : null; }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function sndClick(f) { const S0 = sound(); if (S0) S0.tone({ freq: f || 523, dur: 0.07, gain: 0.035, type: 'triangle' }); }
  function sndKeep() {
    const S0 = sound(); if (!S0) return;
    S0.tone({ freq: 523, dur: 0.08, gain: 0.035 }); setTimeout(function () { S0.tone({ freq: 784, dur: 0.12, gain: 0.035 }); }, 90);
  }
  function sndWarn() { const S0 = sound(); if (S0) S0.sweep({ from: 620, to: 300, dur: 0.4, gain: 0.04, type: 'sawtooth' }); }
  function sndHigh() { const S0 = sound(); if (S0) S0.sweep({ from: 330, to: 560, dur: 0.3, gain: 0.03, type: 'triangle' }); }
  function sndMeal() {
    const S0 = sound(); if (!S0) return;
    S0.tone({ freq: 659, dur: 0.1, gain: 0.035, type: 'sine' }); setTimeout(function () { S0.tone({ freq: 880, dur: 0.14, gain: 0.03, type: 'sine' }); }, 110);
  }
  function sndShot() { const S0 = sound(); if (S0) S0.tone({ freq: 1046, dur: 0.05, gain: 0.03, type: 'square' }); }
  /** 血糖的音高：70 mg/dL 約 330 Hz、180 約 560 Hz */
  function sndGlu(G) { const S0 = sound(); if (S0) S0.tone({ freq: 250 + 1.75 * Math.max(40, Math.min(400, G)), dur: 0.06, gain: 0.02, type: 'sine' }); }
  function setStatus(id, s) { $(id).textContent = s; }
  function say(s) { const e = $('srSay'); e.textContent = ''; setTimeout(function () { e.textContent = s; }, 30); }
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function fit(c, g, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300;
    c.style.height = h + 'px';
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h };
  }
  function panel(g, x, y, w, h) {
    D.roundRect(g, x, y, w, h, 10);
    g.fillStyle = D.alpha(D.c.surface, D.dark ? 0.35 : 0.72); g.fill();
    g.strokeStyle = D.alpha(D.c.border, 0.9); g.lineWidth = 1; g.stroke();
  }
  function small(g, s, x, y, col, align, base, size) { D.haloText(g, s, x, y, col || D.c.muted, align || 'left', base || 'middle', (size || 11) + 'px ' + FONT); }
  function evPos(c, ev) { const r = c.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function chipHTML(map, attr, cur) {
    return Object.keys(map).map(function (k) {
      return '<button type="button" ' + attr + '="' + k + '" aria-pressed="' + (k === cur) + '">' + T(map[k].zh, map[k].en) + '</button>';
    }).join('');
  }

  // =====================================================================
  // 一・一天的血糖
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const el = {
    beta: $('beta'), si: $('si'), m1: $('m1'), m2: $('m2'), m3: $('m3'), m4: $('m4'),
    basal: $('basal'), ratio: $('ratio'), lead: $('lead'), exT: $('exT'), exD: $('exD'), exE: $('exE')
  };
  const st1 = {
    p: null, r: null, cur: 450, kept: [], rows: [], keepNo: 0, totalU: 0, selfU: 0, prevMin: null,
    playing: false, play0: 0, phase: 0, L: null
  };
  function typeKey(beta, si) {
    let k = null;
    Object.keys(TYPES).forEach(function (q) { if (Math.abs(TYPES[q].beta - beta) < 1e-6 && Math.abs(TYPES[q].si - si) < 1e-6) k = q; });
    return k;
  }
  function plan1() {
    const beta = val(el.beta), si = val(el.si);
    const g = [val(el.m1), val(el.m2), val(el.m3), val(el.m4)];
    const ratio = val(el.ratio), lead = Math.round(val(el.lead)), basalU = val(el.basal);
    const meals = MEAL_T.map(function (t, i) { return { t: t, g: g[i] }; });
    const bolus = ratio > 0 ? meals.filter(function (m) { return m.g > 0; }).map(function (m) {
      return { t: ((m.t - lead) % 1440 + 1440) % 1440, u: m.g / 10 * ratio };
    }) : [];
    const exT = Math.round(val(el.exT) * 60), exD = Math.round(val(el.exD)), exE = val(el.exE);
    const ex = exD > 0 && exE > 0 ? [{ t: exT, dur: exD, e: exE }] : [];
    return { beta: beta, si: si, cr: crOf(beta), bw: BW, meals: meals, bolus: bolus, basalU: basalU, ex: ex, flows: true, g: g, ratio: ratio, lead: lead, exT: exT, exD: exD, exE: exE };
  }
  let emitTimer = 0;
  function compute1() {
    const p = plan1();
    const r = B.day(p);
    st1.p = p; st1.r = r;
    st1.totalU = p.basalU + p.bolus.reduce(function (a, b) { return a + b.u; }, 0);
    let self = 0; r.F.forEach(function (f, i) { if (i < 1440) self += f.sr * BW / 1000; });
    st1.selfU = self;
    st1.fast = r.G[420];
    const s = r.stats;
    if (st1.prevMin != null && s.min < 70 && st1.prevMin >= 70) sndWarn();
    else if (st1.prevMin != null && st1.prevMax <= 180 && s.max > 180) sndHigh();
    st1.prevMin = s.min; st1.prevMax = s.max;
    renderOutputs1(); renderChips1(); renderRo1(); legend1(); request1();
    statusDay();
    clearTimeout(emitTimer);
    emitTimer = setTimeout(emitDay, 150);
  }
  function eventData() {
    const p = st1.p, s = st1.r.stats;
    return {
      beta: p.beta, si: p.si, type: typeKey(p.beta, p.si) || 'custom', meals: p.g.slice(), basalU: p.basalU, ratio: p.ratio, lead: p.lead,
      exT: p.exT, exD: p.exD, exE: p.exE, mean: s.mean, min: s.min, max: s.max, tir: s.tir, tbr: s.tbr, tar: s.tar, a1c: s.a1c,
      urine: st1.r.urine, fast: st1.fast, totalU: st1.totalU, insulin: p.basalU > 0 || p.ratio > 0
    };
  }
  function emitDay() { emit('glu-day', eventData()); }
  function statusDay() {
    const s = st1.r.stats;
    let msg = T('平均 ' + num(s.mean, 0) + ' mg/dL，一天有 ' + pct(s.tir) + ' 的時間在 70–180 之間。', 'Average ' + num(s.mean, 0) + ' mg/dL; ' + pct(s.tir) + ' of the day between 70 and 180.');
    if (s.min < 54) msg += T('嚴重低血糖：最低只有 ' + num(s.min, 0) + '！可能會意識不清。', ' Severe hypoglycaemia: down to ' + num(s.min, 0) + '! This can cause confusion or fainting.');
    else if (s.min < 70) msg += T('出現低血糖（最低 ' + num(s.min, 0) + '）：會發抖、冒冷汗、心悸。', ' Hypoglycaemia (lowest ' + num(s.min, 0) + '): shaking, cold sweat, racing heart.');
    if (st1.r.urine > 0.05) msg += T('血糖超過腎閾，尿裡有 ' + num(st1.r.urine, 1) + ' g 糖。', ' Glucose passed the kidney threshold: ' + num(st1.r.urine, 1) + ' g of sugar in the urine.');
    setStatus('status', msg);
  }
  function renderOutputs1() {
    $('betao').textContent = num(val(el.beta), 2) + '×';
    $('sio').textContent = num(val(el.si), 2) + '×';
    ['m1', 'm2', 'm3', 'm4'].forEach(function (k) { $(k + 'o').textContent = num(val(el[k]), 0) + ' g'; });
    $('basalo').textContent = num(val(el.basal), 1) + ' U';
    const r = val(el.ratio);
    $('ratioo').textContent = r > 0 ? num(r, 2) + ' U' : T('不打', 'none');
    const ld = Math.round(val(el.lead));
    $('leado').textContent = num(ld, 0) + T(' 分', ' min') + (ld === 0 ? T('（吃飯時）', ' (at the meal)') : ld > 0 ? T('（飯前）', ' (before)') : T('（飯後）', ' (after)'));
    $('exTo').textContent = hhmm(val(el.exT) * 60);
    const d = Math.round(val(el.exD));
    $('exDo').textContent = d > 0 ? d + T(' 分鐘', ' min') : T('不運動', 'none');
    $('exEo').textContent = num(val(el.exE), 2);
  }
  function renderChips1() {
    const k = typeKey(val(el.beta), val(el.si));
    $('types').innerHTML = chipHTML(TYPES, 'data-t', k);
  }
  function setType(k) {
    const ty = TYPES[k]; if (!ty) return;
    if (window.LabNum) {
      window.LabNum.set(el.beta, ty.beta); window.LabNum.set(el.si, ty.si);
      window.LabNum.set(el.basal, 0); window.LabNum.set(el.ratio, 0); window.LabNum.set(el.lead, 0);
    }
    compute1();
    sndClick(k === 't1' ? 392 : k === 't2' ? 466 : 523);
    setStatus('status', T(TYPE_TIP[k][0], TYPE_TIP[k][1]) + ' ' + $('status').textContent);
  }
  function renderRo1() {
    const s = st1.r.stats, p = st1.p, t = st1.cur;
    const cls = function (ok, warn) { return ok ? 'good' : warn ? 'warn' : 'bad'; };
    const bar = '<div class="tirbar" aria-hidden="true"><i style="width:' + (s.tbr * 100) + '%;background:' + C['gl-lo'] + '"></i><i style="width:' + (s.tir * 100) + '%;background:' + C['gl-in'] + '"></i><i style="width:' + (s.tar * 100) + '%;background:' + C['gl-hi'] + '"></i></div>';
    const rows = [
      [T('游標 ' + hhmm(t), 'Cursor ' + hhmm(t)), num(st1.r.G[t], 0) + ' mg/dL<small>' + T('胰島素 ', 'Insulin ') + num(st1.r.I[t], 1) + ' mU/L</small>', ''],
      [T('空腹（早餐前）', 'Fasting (before breakfast)'), num(st1.fast, 0) + ' mg/dL<small>' + T('目標 80–130', 'target 80–130') + '</small>', cls(st1.fast >= 80 && st1.fast <= 130, st1.fast >= 70 && st1.fast < 180)],
      [T('平均／估計 A1C', 'Average / estimated A1C'), num(s.mean, 0) + ' mg/dL ／ ' + num(s.a1c, 1) + '%<small>' + T('A1C 目標 7% 以下；正常約 5–5.6%', 'A1C target below 7%; normal about 5–5.6%') + '</small>', cls(s.a1c < 6.5, s.a1c < 7)],
      [T('最低／最高', 'Lowest / highest'), num(s.min, 0) + ' ／ ' + num(s.max, 0) + ' mg/dL', cls(s.min >= 70 && s.max <= 180, s.min >= 54)],
      [T('範圍內時間 70–180', 'Time in range 70–180'), pct(s.tir) + bar + '<small>' + T('低於 70：', 'Below 70: ') + pct(s.tbr, 1) + T('・高於 180：', ' · above 180: ') + pct(s.tar, 1) + '</small>', cls(s.tir >= 0.7 && s.tbr < 0.04, s.tir >= 0.5)],
      [T('尿糖', 'Sugar in urine'), num(st1.r.urine, 1) + T(' g／天', ' g/day'), cls(st1.r.urine < 0.05, st1.r.urine < 5)],
      [T('胰島素', 'Insulin'), T('打針 ', 'Injected ') + num(st1.totalU, 1) + ' U<small>' + (p.ratio > 0 ? T('速效 1 U 配 ' + num(10 / p.ratio, 0) + ' g 醣・', 'Rapid 1 U per ' + num(10 / p.ratio, 0) + ' g · ') : '') + T('自己分泌 ', 'made by the β cells ') + num(st1.selfU, 1) + T(' U／天', ' U/day') + '</small>', '']
    ];
    $('ro1').innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd' + (r[2] ? ' class="' + r[2] + '"' : '') + '>' + r[1] + '</dd>'; }).join('');
  }
  function describe(p) {
    const ty = typeKey(p.beta, p.si);
    const who = ty ? T(TYPES[ty].zh, TYPES[ty].en) : 'β ' + num(p.beta, 2) + T('・敏感 ', ' · S ') + num(p.si, 2);
    return who;
  }
  function keepCurve() {
    if (st1.kept.length >= MAX_KEEP) st1.kept.shift();
    st1.keepNo++;
    const cols = ['gl-k1', 'gl-k2', 'gl-k3'];
    st1.kept.push({ no: st1.keepNo, G: st1.r.G.slice(), color: cols[(st1.keepNo - 1) % 3] });
    addRow();
    sndKeep(); legend1(); request1();
    setStatus('status', T('留下了第 ' + st1.keepNo + ' 條曲線。改設定後可以比較。', 'Kept curve ' + st1.keepNo + '. Change the settings and compare.'));
  }
  function addRow() {
    const p = st1.p, s = st1.r.stats;
    st1.rows.push({
      no: st1.keepNo, who: describe(p), food: p.g.map(function (g) { return num(g, 0); }).join('／'),
      ins: (p.basalU > 0 || p.ratio > 0) ? num(p.basalU, 1) + ' + ' + num(st1.totalU - p.basalU, 1) + ' U' : '—',
      ex: p.exD > 0 && p.exE > 0 ? hhmm(p.exT) + '・' + p.exD + "'・" + num(p.exE, 2) : '—',
      mean: s.mean, tir: s.tir, min: s.min, a1c: s.a1c, p: p
    });
    if (st1.rows.length > MAX_ROWS) st1.rows.shift();
    renderRows1();
  }
  function renderRows1() {
    const tb = $('runs1');
    if (!st1.rows.length) { tb.innerHTML = ''; return; }
    let h = '<thead><tr><th>#</th><th>' + T('這個人', 'Person') + '</th><th>' + T('早／午／晚／宵夜（g）', 'Meals (g)') + '</th><th>' + T('長效 + 速效', 'Basal + meal') + '</th><th>' + T('運動', 'Exercise') + '</th><th>' + T('平均', 'Mean') + '</th><th>TIR</th><th>' + T('最低', 'Lowest') + '</th><th>A1C</th></tr></thead><tbody>';
    st1.rows.forEach(function (r) {
      h += '<tr><td>' + r.no + '</td><td>' + describe(r.p) + '</td><td>' + r.food + '</td><td>' + r.ins + '</td><td>' + r.ex + '</td><td>' + num(r.mean, 0) + '</td><td>' + pct(r.tir) + '</td><td class="' + (r.min < 70 ? 'dm' : 'ok') + '">' + num(r.min, 0) + '</td><td>' + num(r.a1c, 1) + '%</td></tr>';
    });
    tb.innerHTML = h + '</tbody>';
  }

  // ---------- 版面 ----------
  function layout1() {
    const w = cv.clientWidth || 360;
    const wide = w >= 700;
    let L;
    if (wide) {
      const H = 470, px = Math.round(w * 0.58);
      L = { w: w, h: H, wide: true, g: { x0: 54, x1: px - 12, y0: 40, y1: 290 }, i: { y0: 318, y1: 408 }, ax: 428, body: { x: px + 4, y: 10, w: w - px - 12, h: H - 20 } };
    } else {
      const H = 650;
      L = { w: w, h: H, wide: false, g: { x0: 46, x1: w - 12, y0: 40, y1: 250 }, i: { y0: 274, y1: 330 }, ax: 346, body: { x: 6, y: 368, w: w - 12, h: H - 376 } };
    }
    fit(cv, ctx, L.h);
    st1.L = L;
  }
  function xOf(t) { const g = st1.L.g; return g.x0 + (g.x1 - g.x0) * t / 1440; }
  function tOf(x) { const g = st1.L.g; return Math.max(0, Math.min(1440, Math.round((x - g.x0) / (g.x1 - g.x0) * 1440))); }
  function gRange() {
    let hi = st1.r.stats.max, lo = st1.r.stats.min;
    st1.kept.forEach(function (k) { k.G.forEach(function (v) { if (v > hi) hi = v; if (v < lo) lo = v; }); });
    return { lo: Math.max(0, Math.min(40, Math.floor((lo - 8) / 10) * 10)), hi: niceMax(hi * 1.06, [250, 300, 400, 500, 600, 800]) };
  }

  // ---------- 繪圖 ----------
  let raf1 = 0;
  function request1() { if (!raf1) raf1 = requestAnimationFrame(function () { raf1 = 0; draw1(); }); }
  function draw1() {
    const L = st1.L, g = ctx;
    g.clearRect(0, 0, L.w, L.h);
    D.backdrop(g, L.w, L.h);
    const R = gRange();
    const yG = function (v) { return L.g.y1 - (L.g.y1 - L.g.y0) * (v - R.lo) / (R.hi - R.lo); };
    drawGluPlot(g, L, R, yG);
    drawInsPlot(g, L);
    drawTimeAxis(g, L);
    drawCursor(g, L, yG);
    drawBody(g, L.body.x, L.body.y, L.body.w, L.body.h, st1.cur);
  }
  function drawGluPlot(g, L, R, yG) {
    const P = L.g;
    panel(g, P.x0 - 8, P.y0 - 30, P.x1 - P.x0 + 16, P.y1 - P.y0 + 38);
    // 夜間
    g.fillStyle = D.alpha(D.c.text, D.dark ? 0.05 : 0.035);
    g.fillRect(xOf(0), P.y0, xOf(360) - xOf(0), P.y1 - P.y0);
    g.fillRect(xOf(1380), P.y0, xOf(1440) - xOf(1380), P.y1 - P.y0);
    // 三個區
    const band = function (a, b, col, al) {
      const ya = yG(Math.max(R.lo, Math.min(R.hi, a))), yb = yG(Math.max(R.lo, Math.min(R.hi, b)));
      g.fillStyle = D.alpha(col, al); g.fillRect(P.x0, yb, P.x1 - P.x0, ya - yb);
    };
    band(R.lo, 70, C['gl-lo'], D.dark ? 0.16 : 0.10);
    band(70, 180, C['gl-in'], D.dark ? 0.13 : 0.09);
    band(180, R.hi, C['gl-hi'], D.dark ? 0.08 : 0.06);
    // 格線
    g.lineWidth = 1;
    const step = R.hi > 400 ? 100 : 50;
    for (let v = Math.ceil(R.lo / step) * step; v <= R.hi; v += step) {
      g.strokeStyle = D.alpha(D.c.border, 0.55); g.beginPath(); g.moveTo(P.x0, yG(v)); g.lineTo(P.x1, yG(v)); g.stroke();
      if (v !== 70 && v !== 180) small(g, String(v), P.x0 - 5, yG(v), D.c.muted, 'right');
    }
    [70, 180].forEach(function (v) {
      g.strokeStyle = D.alpha(v === 70 ? C['gl-lo'] : C['gl-hi'], 0.8); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(P.x0, yG(v)); g.lineTo(P.x1, yG(v)); g.stroke();
      small(g, String(v), P.x0 - 5, yG(v), v === 70 ? C['gl-lo'] : C['gl-hi'], 'right');
    });
    // 腎閾
    g.save(); g.setLineDash([5, 4]); g.strokeStyle = D.alpha(C['gl-renal'], 0.9); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(P.x0, yG(162)); g.lineTo(P.x1, yG(162)); g.stroke(); g.restore();
    small(g, T('腎閾 162', 'Kidney threshold 162'), P.x1 - 4, yG(162) - 7, C['gl-renal'], 'right', 'middle', 10.5);
    D.haloText(g, T('血糖（mg/dL）', 'Blood glucose (mg/dL)'), P.x0, P.y0 - 18, D.c.text, 'left', 'middle', '600 12.5px ' + FONT);
    // 運動
    st1.p.ex.forEach(function (q) {
      const segs = [[q.t, Math.min(1440, q.t + q.dur)]];
      if (q.t + q.dur > 1440) segs.push([0, q.t + q.dur - 1440]);
      segs.forEach(function (sg) {
        const xa = xOf(sg[0]), xb = xOf(sg[1]);
        g.fillStyle = D.alpha(C['gl-ex'], 0.12 + 0.18 * q.e); g.fillRect(xa, P.y0, xb - xa, P.y1 - P.y0);
        g.fillStyle = D.alpha(C['gl-ex'], 0.85); g.fillRect(xa, P.y1 - 5, xb - xa, 5);
      });
      small(g, T('運動', 'Exercise'), Math.min(P.x1 - 2, xOf(q.t) + 3), P.y1 - 13, C['gl-ex'], 'left', 'middle', 10.5);
    });
    // 三餐與注射
    st1.p.meals.forEach(function (m, i) {
      if (m.g <= 0) return;
      const x = xOf(m.t);
      g.strokeStyle = D.alpha(C['gl-meal'], 0.35); g.lineWidth = 1; g.save(); g.setLineDash([2, 3]);
      g.beginPath(); g.moveTo(x, P.y0); g.lineTo(x, P.y1); g.stroke(); g.restore();
      bowl(g, x, P.y0 - 2, 6 + Math.min(5, m.g / 40), C['gl-meal']);
      small(g, num(m.g, 0) + ' g', x + 10, P.y0 - 4, C['gl-meal'], 'left', 'middle', 10.5);
    });
    st1.p.bolus.forEach(function (b) {
      const x = xOf(b.t), y = P.y1 - 8;
      g.fillStyle = C['gl-bolus'];
      g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x - 5, y); g.lineTo(x + 5, y); g.closePath(); g.fill();
      small(g, num(b.u, 1) + 'U', x, y - 15, C['gl-bolus'], 'center', 'middle', 10);
    });
    // 留下的曲線
    g.save();
    g.beginPath(); g.rect(P.x0, P.y0 - 4, P.x1 - P.x0, P.y1 - P.y0 + 8); g.clip();
    st1.kept.forEach(function (k) {
      g.strokeStyle = D.alpha(C[k.color], 0.85); g.lineWidth = 1.6; g.setLineDash([6, 4]);
      g.beginPath(); k.G.forEach(function (v, t) { if (t % 3 && t !== 1440) return; const x = xOf(t), y = yG(v); if (!t) g.moveTo(x, y); else g.lineTo(x, y); }); g.stroke();
    });
    g.setLineDash([]);
    // 目前的曲線：面積＋依區段上色
    const G = st1.r.G;
    const grad = g.createLinearGradient(0, P.y0, 0, P.y1);
    grad.addColorStop(0, D.alpha(C['gl-glu'], 0.22)); grad.addColorStop(1, D.alpha(C['gl-glu'], 0.02));
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(xOf(0), P.y1);
    for (let t = 0; t <= 1440; t += 2) g.lineTo(xOf(t), yG(G[t]));
    g.lineTo(xOf(1440), P.y1); g.closePath(); g.fill();
    const zone = function (v) { return v < 70 ? 'gl-lo' : v > 180 ? 'gl-hi' : 'gl-glu'; };
    g.lineWidth = 2.8; g.lineJoin = 'round'; g.lineCap = 'round';
    g.shadowColor = D.alpha(C['gl-glu'], 0.35); g.shadowBlur = 6;
    let z = zone(G[0]); g.strokeStyle = C[z]; g.beginPath(); g.moveTo(xOf(0), yG(G[0]));
    for (let t = 1; t <= 1440; t++) {
      g.lineTo(xOf(t), yG(G[t]));
      const z2 = zone(G[t]);
      if (z2 !== z) { g.stroke(); z = z2; g.strokeStyle = C[z]; g.beginPath(); g.moveTo(xOf(t), yG(G[t])); }
    }
    g.stroke();
    g.shadowBlur = 0;
    g.restore();
  }
  function bowl(g, x, y, r, col) {
    g.save();
    const grd = g.createLinearGradient(x, y - r, x, y + r * 0.6);
    grd.addColorStop(0, D.shade(col, 0.35)); grd.addColorStop(1, D.shade(col, -0.2));
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(x - r, y - r * 0.15); g.quadraticCurveTo(x, y + r * 1.25, x + r, y - r * 0.15); g.closePath(); g.fill();
    g.fillStyle = D.alpha('#ffffff', 0.85);
    g.beginPath(); g.ellipse(x, y - r * 0.2, r * 0.82, r * 0.3, 0, Math.PI, 0); g.fill();
    g.restore();
  }
  function drawInsPlot(g, L) {
    const P = L.g, I0 = L.i.y0, I1 = L.i.y1;
    panel(g, P.x0 - 8, I0 - 18, P.x1 - P.x0 + 16, I1 - I0 + 24);
    const I = st1.r.I;
    let mx = 0; I.forEach(function (v) { if (v > mx) mx = v; });
    const top = niceMax(mx * 1.1, [20, 40, 60, 80, 100, 150, 200, 300]);
    const y = function (v) { return I1 - (I1 - I0) * v / top; };
    g.strokeStyle = D.alpha(D.c.border, 0.55); g.lineWidth = 1;
    [0, top / 2, top].forEach(function (v) { g.beginPath(); g.moveTo(P.x0, y(v)); g.lineTo(P.x1, y(v)); g.stroke(); small(g, num(v, 0), P.x0 - 5, y(v), D.c.muted, 'right', 'middle', 10); });
    const grd = g.createLinearGradient(0, I0, 0, I1);
    grd.addColorStop(0, D.alpha(C['gl-ins'], 0.45)); grd.addColorStop(1, D.alpha(C['gl-ins'], 0.06));
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(xOf(0), I1);
    for (let t = 0; t <= 1440; t += 2) g.lineTo(xOf(t), y(I[t]));
    g.lineTo(xOf(1440), I1); g.closePath(); g.fill();
    g.strokeStyle = C['gl-ins']; g.lineWidth = 1.8;
    g.beginPath(); for (let t = 0; t <= 1440; t += 2) { if (!t) g.moveTo(xOf(t), y(I[t])); else g.lineTo(xOf(t), y(I[t])); } g.stroke();
    D.haloText(g, T('血漿胰島素（mU/L）', 'Plasma insulin (mU/L)'), P.x0, I0 - 8, C['gl-ins'], 'left', 'middle', '600 11.5px ' + FONT);
  }
  function drawTimeAxis(g, L) {
    const P = L.g;
    for (let h = 0; h <= 24; h += 3) {
      const x = xOf(h * 60);
      if (!L.wide && h % 6) { g.strokeStyle = D.alpha(D.c.border, 0.6); g.beginPath(); g.moveTo(x, L.ax - 10); g.lineTo(x, L.ax - 6); g.stroke(); continue; }
      small(g, (h < 10 ? '0' : '') + h + ':00', x, L.ax, D.c.muted, 'center', 'middle', 10.5);
    }
  }
  function drawCursor(g, L, yG) {
    const P = L.g, t = st1.cur, x = xOf(t), Gv = st1.r.G[t];
    g.save();
    g.strokeStyle = D.alpha(D.c.text, 0.55); g.lineWidth = 1; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(x, P.y0 - 6); g.lineTo(x, L.i.y1); g.stroke();
    g.restore();
    const yy = Math.max(P.y0, Math.min(P.y1, yG(Gv)));
    D.ball(g, x, yy, 5.5, Gv < 70 ? C['gl-lo'] : Gv > 180 ? C['gl-hi'] : C['gl-glu'], { glow: 0.35 });
    const s = hhmm(t) + '  ' + num(Gv, 0) + ' mg/dL';
    g.font = '600 11.5px ' + FONT;
    const tw = g.measureText(s).width + 14;
    const bx = Math.max(P.x0, Math.min(P.x1 - tw, x - tw / 2)), by = P.y0 + 4;
    D.roundRect(g, bx, by, tw, 20, 7);
    g.fillStyle = D.alpha(D.c.surface, 0.92); g.fill(); g.strokeStyle = D.alpha(D.c.border, 1); g.stroke();
    D.haloText(g, s, bx + 7, by + 10, D.c.text, 'left', 'middle', '600 11.5px ' + FONT);
  }

  // ---------- 身體裡的葡萄糖流向 ----------
  function arrow(g, x0, y0, x1, y1, w, col, phase, dots) {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const head = Math.max(7, w * 1.8);
    g.save();
    g.strokeStyle = D.alpha(col, w > 0.3 ? 0.85 : 0.25); g.lineWidth = Math.max(1, w); g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 - ux * head * 0.8, y1 - uy * head * 0.8); g.stroke();
    g.fillStyle = D.alpha(col, w > 0.3 ? 0.95 : 0.3);
    g.beginPath(); g.moveTo(x1, y1);
    g.lineTo(x1 - ux * head - uy * head * 0.6, y1 - uy * head + ux * head * 0.6);
    g.lineTo(x1 - ux * head + uy * head * 0.6, y1 - uy * head - ux * head * 0.6); g.closePath(); g.fill();
    if (dots && w > 0.6) {
      const gap = 16, off = ((phase % gap) + gap) % gap;
      g.fillStyle = D.alpha('#ffffff', D.dark ? 0.75 : 0.9);
      for (let s = off; s < len - head; s += gap) { g.beginPath(); g.arc(x0 + ux * s, y0 + uy * s, Math.min(2.6, w * 0.32 + 0.8), 0, Math.PI * 2); g.fill(); }
    }
    g.restore();
  }
  function node(g, x, y, w, h, title, value, col, note) {
    D.roundRect(g, x - w / 2, y - h / 2, w, h, 9);
    const grd = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    grd.addColorStop(0, D.alpha(D.shade(col, D.dark ? -0.2 : 0.75), D.dark ? 0.55 : 0.95));
    grd.addColorStop(1, D.alpha(D.shade(col, D.dark ? -0.45 : 0.55), D.dark ? 0.55 : 0.95));
    g.fillStyle = grd; g.fill();
    g.strokeStyle = D.alpha(col, 0.8); g.lineWidth = 1.2; g.stroke();
    D.haloText(g, title, x, y - (value ? 7 : 0), D.c.text, 'center', 'middle', '600 11.5px ' + FONT);
    if (value) D.haloText(g, value, x, y + 8, col, 'center', 'middle', '600 11px ' + FONT);
    if (note) D.haloText(g, note, x, y + h / 2 + 9, col, 'center', 'middle', '600 10.5px ' + FONT);
  }
  function wOf(gph) { return gph <= 0.05 ? 0 : Math.min(11, 1.3 + 6.5 * Math.sqrt(gph / 25)); }
  function drawBody(g, x, y, w, h, t) {
    panel(g, x, y, w, h);
    const f = st1.r.F[Math.min(1440, t)], Gv = st1.r.G[t], Iv = st1.r.I[t];
    D.haloText(g, T(hhmm(t) + ' 的葡萄糖流向', 'Where the glucose goes at ' + hhmm(t)), x + 12, y + 16, D.c.text, 'left', 'middle', '600 12.5px ' + FONT);
    const cx = x + w * 0.5, cy = y + h * 0.53, r = Math.min(w * 0.12, h * 0.15, 42);
    const nw = Math.min(100, w * 0.28), nh = 38;
    const pos = {
      gut: [x + nw / 2 + 10, y + h * 0.24], panc: [x + w - nw / 2 - 10, y + h * 0.24], liver: [x + nw / 2 + 10, y + h * 0.6],
      inj: [x + w - nw / 2 - 10, y + h * 0.6], kid: [x + w * 0.27, y + h * 0.87], tis: [x + w * 0.73, y + h * 0.87]
    };
    const ph = st1.phase;
    const edge = function (p, toBlood) {
      const dx = cx - p[0], dy = cy - p[1], d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d;
      const kx = Math.abs(ux) > 1e-6 ? (nw / 2 + 4) / Math.abs(ux) : 1e9, ky = Math.abs(uy) > 1e-6 ? (nh / 2 + 4) / Math.abs(uy) : 1e9;
      const k = Math.min(kx, ky);
      const a = [p[0] + ux * k, p[1] + uy * k], b = [cx - ux * (r + 4), cy - uy * (r + 4)];
      return toBlood ? [a, b] : [b, a];
    };
    const ug = f.ug * GH, egp = f.egp * GH, use = f.use * GH, fr = f.fr * GH, sr = f.sr * UH, ui = f.ui * UH;
    const draw = function (p, toBlood, flow, col, scale) {
      const e = edge(p, toBlood);
      arrow(g, e[0][0], e[0][1], e[1][0], e[1][1], scale(flow), col, ph * (0.4 + Math.min(2, flow / 15)), true);
    };
    draw(pos.gut, true, ug, C['gl-meal'], wOf);
    draw(pos.liver, true, egp, C['gl-liver'], wOf);
    draw(pos.tis, false, use, C['gl-glu'], wOf);
    draw(pos.kid, false, fr, C['gl-renal'], wOf);
    const insW = function (u) { return u <= 0.005 ? 0 : Math.min(10, 1.3 + 6 * Math.sqrt(u / 3)); };
    draw(pos.panc, true, sr, C['gl-ins'], insW);
    draw(pos.inj, true, ui, C['gl-bolus'], insW);
    // 血液
    const zc = Gv < 70 ? C['gl-lo'] : Gv > 180 ? C['gl-hi'] : C['gl-in'];
    const k = Math.max(0, Math.min(1, (Gv - 40) / 300));
    const grd = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    grd.addColorStop(0, D.shade(C['gl-glu'], 0.75 - 0.5 * k)); grd.addColorStop(1, D.shade(C['gl-glu'], 0.1 - 0.35 * k));
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = zc; g.lineWidth = 3; g.stroke();
    D.haloText(g, T('血液', 'Blood'), cx, cy - r * 0.42, D.c.text, 'center', 'middle', '600 11px ' + FONT);
    D.haloText(g, num(Gv, 0), cx, cy + 1, D.c.text, 'center', 'middle', '700 ' + Math.round(Math.max(14, r * 0.45)) + 'px ' + FONT);
    D.haloText(g, 'mg/dL', cx, cy + r * 0.45, D.c.muted, 'center', 'middle', '10.5px ' + FONT);
    small(g, T('胰島素 ', 'Insulin ') + num(Iv, 1) + ' mU/L', cx, cy + r + 13, C['gl-ins'], 'center', 'middle', 10.5);
    const gp = function (v) { return num(v, v < 10 ? 1 : 0) + ' g/h'; };
    const up = function (v) { return num(v, v < 1 ? 2 : 1) + ' U/h'; };
    node(g, pos.gut[0], pos.gut[1], nw, nh, T('腸道吸收', 'Gut'), gp(ug), C['gl-meal']);
    node(g, pos.liver[0], pos.liver[1], nw, nh, T('肝臟產糖', 'Liver'), gp(egp), C['gl-liver'], f.cr > 2e-4 ? T('升糖素作用中', 'Glucagon on') : '');
    node(g, pos.tis[0], pos.tis[1], nw, nh, T('肌肉・腦用掉', 'Muscle · brain'), gp(use), C['gl-glu'], f.ex > 0 ? T('運動中', 'Exercising') : '');
    node(g, pos.kid[0], pos.kid[1], nw, nh, T('腎臟排糖', 'Kidney'), gp(fr), C['gl-renal']);
    node(g, pos.panc[0], pos.panc[1], nw, nh, T('β 細胞分泌', 'β cells'), st1.p.beta > 0 ? up(sr) : T('沒有', 'none'), C['gl-ins']);
    node(g, pos.inj[0], pos.inj[1], nw, nh, T('注射進血', 'Injected'), up(ui), C['gl-bolus']);
  }

  // ---------- 播放 ----------
  let rafPlay = 0, lastSoundT = -1;
  function play() {
    if (st1.playing) { stopPlay(); return; }
    st1.playing = true; st1.play0 = performance.now() - st1.cur / 1440 * PLAY_MS;
    if (st1.cur >= 1440) st1.play0 = performance.now();
    lastSoundT = st1.cur;
    $('playBtn').textContent = T('暫停', 'Pause');
    const loop = function (now) {
      if (!st1.playing) return;
      const t = Math.min(1440, Math.round((now - st1.play0) / PLAY_MS * 1440));
      playEvents(lastSoundT, t);
      lastSoundT = t;
      st1.cur = t; st1.phase = now / 40;
      draw1(); renderRo1();
      if (t >= 1440) { stopPlay(); return; }
      rafPlay = requestAnimationFrame(loop);
    };
    rafPlay = requestAnimationFrame(loop);
  }
  function playEvents(t0, t1) {
    const G = st1.r.G;
    for (let t = t0 + 1; t <= t1; t++) {
      if (MEAL_T.indexOf(t) >= 0 && st1.p.g[MEAL_T.indexOf(t)] > 0) sndMeal();
      if (st1.p.bolus.some(function (b) { return b.t === t; })) sndShot();
      if (t > 0 && G[t] < 70 && G[t - 1] >= 70) sndWarn();
      if (t > 0 && G[t] > 180 && G[t - 1] <= 180) sndHigh();
      if (t % 30 === 0) sndGlu(G[t]);
    }
  }
  function stopPlay() {
    st1.playing = false;
    if (rafPlay) cancelAnimationFrame(rafPlay); rafPlay = 0;
    $('playBtn').textContent = st1.cur >= 1440 ? T('再播一次', 'Play again') : T('繼續播放', 'Resume');
    if (st1.cur >= 1440) st1.cur = 0;
    request1(); renderRo1();
  }
  function setCursor(t) {
    st1.cur = Math.max(0, Math.min(1440, Math.round(t)));
    renderRo1(); request1();
  }

  // ---------- 指標 ----------
  let dragging = false;
  function onPointer(ev) {
    const p = evPos(cv, ev), L = st1.L;
    if (p[0] < L.g.x0 - 6 || p[0] > L.g.x1 + 6 || p[1] > L.ax + 8) return false;
    if (st1.playing) stopPlay();
    setCursor(tOf(p[0]));
    return true;
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (onPointer(ev)) { dragging = true; try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ } }
  });
  cv.addEventListener('pointermove', function (ev) { if (dragging) onPointer(ev); });
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    say(T(hhmm(st1.cur) + '，血糖 ' + num(st1.r.G[st1.cur], 0) + ' mg/dL', hhmm(st1.cur) + ', glucose ' + num(st1.r.G[st1.cur], 0) + ' mg/dL'));
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  window.LabKeys && window.LabKeys.attach(cv, {
    label: T('一天的血糖：左右鍵移動時間游標（Shift 一次 1 小時），空白鍵播放或暫停。', 'A day of blood sugar: left and right move the time cursor (Shift for an hour); Space plays or pauses.'),
    items: [{
      name: T('時間游標', 'Time cursor'),
      move: function (dx, dy, big) { const d = dx || -dy; if (d) { if (st1.playing) stopPlay(); setCursor(st1.cur + d * (big ? 60 : 10)); sndGlu(st1.r.G[st1.cur]); } return !!d; },
      describe: function () { return T(hhmm(st1.cur) + '，血糖 ' + num(st1.r.G[st1.cur], 0) + ' mg/dL，胰島素 ' + num(st1.r.I[st1.cur], 1) + ' mU/L。', hhmm(st1.cur) + ', glucose ' + num(st1.r.G[st1.cur], 0) + ' mg/dL, insulin ' + num(st1.r.I[st1.cur], 1) + ' mU/L.'); }
    }]
  });
  cv.addEventListener('keydown', function (ev) {
    if (ev.key === ' ' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { ev.preventDefault(); play(); }
  });

  // =====================================================================
  // 二・口服葡萄糖耐受試驗
  // =====================================================================
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  const el2 = { b2: $('b2'), s2: $('s2') };
  const st2 = {
    beta: 1, si: 1, res: null, t: 0, running: false, done: false, dx: null, tests: [], testNo: 0, L: null,
    grid: { g0: new Float64Array(NB * NS), g2: new Float64Array(NB * NS), rows: 0 }, img: null, imgRows: -1, version: 0
  };
  const bAt = function (i) { return BMAX * i / (NB - 1); };
  const sAt = function (j) { return SMIN + (SMAX - SMIN) * j / (NS - 1); };
  function ogttOf(beta, si) { return B.ogtt({ bw: BW, beta: beta, si: si, cr: crOf(beta) }, 75); }
  function compute2() {
    st2.beta = val(el2.b2); st2.si = val(el2.s2);
    st2.res = ogttOf(st2.beta, st2.si);
    st2.t = 0; st2.running = false; st2.done = false; st2.dx = null;
    st2.version++;
    renderOutputs2(); renderChips2(); renderRo2(); updateTestBtn(); request2();
    if (view3 && view3.active) view3.update();
  }
  function renderOutputs2() {
    $('b2o').textContent = num(val(el2.b2), 2) + '×';
    $('s2o').textContent = num(val(el2.s2), 2) + '×';
  }
  function patKey(beta, si) {
    let k = null;
    Object.keys(PATS).forEach(function (q) { if (Math.abs(PATS[q].beta - beta) < 1e-6 && Math.abs(PATS[q].si - si) < 1e-6) k = q; });
    return k;
  }
  function renderChips2() { $('pats').innerHTML = chipHTML(PATS, 'data-p', patKey(val(el2.b2), val(el2.s2))); }
  function setPat(k) {
    const p = PATS[k]; if (!p) return;
    if (window.LabNum) { window.LabNum.set(el2.b2, p.beta); window.LabNum.set(el2.s2, p.si); }
    compute2(); sndClick(440);
  }
  function at(t) { return st2.res.G[Math.min(180, Math.max(0, Math.round(t)))]; }
  function peak120() { let m = 0; for (let t = 0; t <= 120; t++) m = Math.max(m, st2.res.G[t]); return m; }
  function renderRo2() {
    const r = st2.res, shown = st2.t >= 120 || st2.done;
    const di = st2.beta * st2.si;
    let ins = 0; for (let t = 0; t <= 120; t++) ins = Math.max(ins, r.I[t]);
    const rows = [
      [T('處置指數 β × 敏感度', 'Disposition index β × S'), num(di, 2) + '<small>' + T('健康的人 = 1', 'healthy = 1') + '</small>', ''],
      [T('空腹血糖（0 分）', 'Fasting (0 min)'), num(r.G[0], 0) + ' mg/dL<small>' + T('正常 < 100、糖尿病 ≥ 126', 'normal < 100, diabetes ≥ 126') + '</small>', r.G[0] >= 126 ? 'bad' : r.G[0] >= 100 ? 'warn' : 'good'],
      [T('2 小時血糖', '2-hour glucose'), shown ? num(r.G[120], 0) + ' mg/dL' : T('還沒測到', 'not yet'), shown ? (r.G[120] >= 200 ? 'bad' : r.G[120] >= 140 ? 'warn' : 'good') : ''],
      [T('最高（0–120 分）', 'Peak (0–120 min)'), shown ? num(peak120(), 0) + ' mg/dL' : '—', ''],
      [T('胰島素最高', 'Insulin peak'), shown ? num(ins, 0) + ' mU/L<small>' + T('空腹 ', 'fasting ') + num(r.I[0], 1) + '</small>' : '—', ''],
      [T('判讀', 'Result'), st2.dx ? T(DX[st2.dx].zh, DX[st2.dx].en) : T('喝完 2 小時後判讀', 'read after 2 hours'), st2.dx ? (st2.dx === 'normal' ? 'good' : st2.dx === 'pre' ? 'warn' : 'bad') : '']
    ];
    $('ro2').innerHTML = rows.map(function (q) { return '<dt>' + q[0] + '</dt><dd' + (q[2] ? ' class="' + q[2] + '"' : '') + '>' + q[1] + '</dd>'; }).join('');
  }
  function updateTestBtn() {
    $('testBtn').textContent = st2.running ? T('試驗中…（按一下跳到結果）', 'Testing… (tap to skip to the result)') : st2.done ? T('再做一次', 'Test again') : T('喝下 75 g、開始試驗', 'Drink 75 g and test');
  }
  let rafT = 0, lastT = 0;
  function startTest() {
    if (st2.running) { finishTest(); return; }
    st2.t = 0; st2.done = false; st2.dx = null; st2.running = true;
    renderRo2(); updateTestBtn();
    sndMeal();
    setStatus('status2', T('喝下 75 g 葡萄糖。之後每 30 分鐘抽一次血……', 'The patient drinks 75 g of glucose. Blood is taken every 30 minutes…'));
    lastT = 0;
    const loop = function (now) {
      if (!st2.running) return;
      const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0; lastT = now;
      advance(st2.t + dt * OGTT_RATE);
      if (st2.running) rafT = requestAnimationFrame(loop);
    };
    rafT = requestAnimationFrame(loop);
    advance(0.0001);
  }
  function advance(t1) {
    const t0 = st2.t;
    t1 = Math.min(180, t1);
    DRAWS.forEach(function (d) {
      if ((d > t0 && d <= t1) || (d === 0 && t0 === 0)) {
        const S0 = sound(); if (S0) S0.tone({ freq: 250 + 1.75 * Math.min(400, at(d)), dur: 0.14, gain: 0.04, type: 'sine' });
      }
    });
    st2.t = t1;
    if (t0 < 120 && t1 >= 120) diagnoseNow();
    if (t1 >= 180) { st2.running = false; st2.done = true; updateTestBtn(); }
    request2();
  }
  function finishTest() { if (rafT) cancelAnimationFrame(rafT); rafT = 0; advance(180); st2.running = false; st2.done = true; updateTestBtn(); }
  function diagnoseNow() {
    const r = st2.res;
    st2.dx = B.diagnose(r.G[0], r.G[120]);
    st2.testNo++;
    st2.tests.push({ no: st2.testNo, beta: st2.beta, si: st2.si, g0: r.G[0], g60: r.G[60], g120: r.G[120], dx: st2.dx });
    if (st2.tests.length > MAX_ROWS) st2.tests.shift();
    renderRows2(); renderRo2();
    const d = DX[st2.dx];
    const why = st2.dx === 'dm' ? ['（空腹 ≥ 126 或 2 小時 ≥ 200）', ' (fasting ≥ 126 or 2 hours ≥ 200)'] : st2.dx === 'pre' ? ['（空腹 100–125 或 2 小時 140–199）', ' (fasting 100–125 or 2 hours 140–199)'] : ['（空腹 < 100 且 2 小時 < 140）', ' (fasting < 100 and 2 hours < 140)'];
    setStatus('status2', T('空腹 ' + num(r.G[0], 0) + '、2 小時 ' + num(r.G[120], 0) + ' mg/dL：判讀為「' + d.zh + '」' + why[0] + '。',
      'Fasting ' + num(r.G[0], 0) + ', 2 hours ' + num(r.G[120], 0) + ' mg/dL: ' + d.en + why[1] + '.'));
    say(T('判讀：' + d.zh, 'Result: ' + d.en));
    if (st2.dx !== 'normal') sndWarn(); else sndKeep();
    emit('ogtt', { beta: st2.beta, si: st2.si, g0: r.G[0], g30: r.G[30], g60: r.G[60], g90: r.G[90], g120: r.G[120], peak: peak120(), dx: st2.dx });
    if (view3 && view3.active) view3.update();
  }
  function renderRows2() {
    const tb = $('runs2');
    if (!st2.tests.length) { tb.innerHTML = ''; return; }
    let h = '<thead><tr><th>#</th><th>β</th><th>' + T('敏感度', 'Sensitivity') + '</th><th>' + T('0 分', '0 min') + '</th><th>' + T('60 分', '60 min') + '</th><th>' + T('120 分', '120 min') + '</th><th>' + T('判讀', 'Result') + '</th></tr></thead><tbody>';
    st2.tests.forEach(function (q) {
      h += '<tr><td>' + q.no + '</td><td>' + num(q.beta, 2) + '</td><td>' + num(q.si, 2) + '</td><td>' + num(q.g0, 0) + '</td><td>' + num(q.g60, 0) + '</td><td>' + num(q.g120, 0) + '</td><td class="' + (q.dx === 'normal' ? 'ok' : q.dx) + '">' + T(DX[q.dx].zh, DX[q.dx].en) + '</td></tr>';
    });
    tb.innerHTML = h + '</tbody>';
  }

  // ---------- 地圖的格點（分批算，不卡畫面） ----------
  function gridStep() {
    const gr = st2.grid;
    if (gr.rows >= NS) return;
    const j = gr.rows;
    for (let i = 0; i < NB; i++) {
      const r = ogttOf(bAt(i), sAt(j));
      gr.g0[j * NB + i] = r.G[0]; gr.g2[j * NB + i] = r.G[120];
    }
    gr.rows++;
    if (gr.rows % 5 === 0 || gr.rows === NS) { request2(); if (gr.rows === NS && view3 && view3.active) view3.rebuild(); }
    setTimeout(gridStep, 16);
  }
  function gridAt(beta, si) {
    const gr = st2.grid;
    const fi = Math.max(0, Math.min(NB - 1.0001, beta / BMAX * (NB - 1)));
    const fj = Math.max(0, Math.min(NS - 1.0001, (si - SMIN) / (SMAX - SMIN) * (NS - 1)));
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    if (j + 1 >= gr.rows) return null;
    const L = function (a) { return (1 - u) * (1 - v) * a[j * NB + i] + u * (1 - v) * a[j * NB + i + 1] + (1 - u) * v * a[(j + 1) * NB + i] + u * v * a[(j + 1) * NB + i + 1]; };
    return { g0: L(gr.g0), g2: L(gr.g2) };
  }
  function mapImage() {
    const gr = st2.grid;
    if (st2.img && st2.imgRows === gr.rows) return st2.img;
    const N = 120;
    const c = st2.img || document.createElement('canvas');
    c.width = N; c.height = N;
    const g = c.getContext('2d'), im = g.createImageData(N, N);
    const cols = { normal: hexRgb(C['gl-ok']), pre: hexRgb(C['gl-pre']), dm: hexRgb(C['gl-dm']) };
    const bg = hexRgb(D.c.surface);
    for (let py = 0; py < N; py++) {
      const si = SMAX - (SMAX - SMIN) * (py + 0.5) / N;
      for (let px = 0; px < N; px++) {
        const beta = BMAX * (px + 0.5) / N;
        const q = gridAt(beta, si), k = (py * N + px) * 4;
        if (!q) { im.data[k + 3] = 0; continue; }
        const dx = B.diagnose(q.g0, q.g2), col = cols[dx];
        const a = dx === 'normal' ? 0.32 + 0.1 * Math.max(0, (q.g2 - 90) / 50) : dx === 'pre' ? 0.42 : Math.min(0.75, 0.45 + (q.g2 - 200) / 900);
        im.data[k] = Math.round(bg[0] + (col[0] - bg[0]) * a);
        im.data[k + 1] = Math.round(bg[1] + (col[1] - bg[1]) * a);
        im.data[k + 2] = Math.round(bg[2] + (col[2] - bg[2]) * a);
        im.data[k + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0);
    st2.img = c; st2.imgRows = gr.rows;
    return c;
  }

  // ---------- 版面與繪圖 ----------
  function layout2() {
    const w = cv2.clientWidth || 360;
    const wide = w >= 700;
    let L;
    if (wide) {
      const H = 440, split = Math.round(w * 0.56);
      const ms = Math.min(w - split - 76, H - 92);
      L = { w: w, h: H, wide: true, p: { x0: 50, x1: split - 14, y0: 44, y1: 286 }, i: { y0: 320, y1: 392 }, ax: 410, m: { x0: split + 50, y0: 40, s: ms } };
    } else {
      const ms = Math.min(w - 72, 320);
      const H = 420 + ms + 70;
      L = { w: w, h: H, wide: false, p: { x0: 44, x1: w - 12, y0: 44, y1: 262 }, i: { y0: 296, y1: 352 }, ax: 370, m: { x0: 52, y0: 420, s: ms } };
    }
    fit(cv2, ctx2, L.h);
    st2.L = L;
  }
  let raf2 = 0;
  function request2() { if (!raf2) raf2 = requestAnimationFrame(function () { raf2 = 0; if (!(view3 && view3.active)) draw2(); }); }
  function draw2() {
    const L = st2.L, g = ctx2;
    g.clearRect(0, 0, L.w, L.h);
    D.backdrop(g, L.w, L.h);
    drawOgtt(g, L);
    drawMap(g, L);
  }
  function drawOgtt(g, L) {
    const P = L.p, r = st2.res;
    const shownT = st2.running || st2.done ? st2.t : 0;
    let mx = 0; for (let t = 0; t <= 180; t++) mx = Math.max(mx, r.G[t]);
    const top = niceMax(Math.max(mx, 210) * 1.06, [250, 300, 400, 500, 600, 800]);
    const x = function (t) { return P.x0 + (P.x1 - P.x0) * (t + 15) / 195; };
    const y = function (v) { return P.y1 - (P.y1 - P.y0) * (v - 40) / (top - 40); };
    panel(g, P.x0 - 8, P.y0 - 32, P.x1 - P.x0 + 16, P.y1 - P.y0 + 40);
    D.haloText(g, T('血糖（mg/dL）', 'Blood glucose (mg/dL)'), P.x0, P.y0 - 20, D.c.text, 'left', 'middle', '600 12.5px ' + FONT);
    g.lineWidth = 1;
    for (let v = 50; v <= top; v += 50) {
      g.strokeStyle = D.alpha(D.c.border, 0.5); g.beginPath(); g.moveTo(P.x0, y(v)); g.lineTo(P.x1, y(v)); g.stroke();
      small(g, String(v), P.x0 - 5, y(v), D.c.muted, 'right', 'middle', 10.5);
    }
    // 判讀色條：0 分與 120 分
    const strip = function (t, a, b, w, left) {
      const xc = x(t), seg = [[40, a, 'gl-ok'], [a, b, 'gl-pre'], [b, top, 'gl-dm']];
      seg.forEach(function (s) {
        g.fillStyle = D.alpha(C[s[2]], 0.55);
        g.fillRect(xc - w / 2, y(s[1]), w, y(s[0]) - y(s[1]));
      });
      [a, b].forEach(function (v) {
        g.strokeStyle = D.alpha(D.c.text, 0.45); g.lineWidth = 1; g.save(); g.setLineDash([4, 3]);
        g.beginPath(); g.moveTo(xc - w / 2 - (left ? 4 : 14), y(v)); g.lineTo(xc + w / 2 + (left ? 4 : 14), y(v)); g.stroke(); g.restore();
        if (left) { if (v % 50) small(g, String(v), xc - w / 2 - 5, y(v), D.c.muted, 'right', 'middle', 10); }
        else small(g, String(v), xc + w / 2 + 16, y(v), D.c.muted, 'left', 'middle', 10);
      });
    };
    strip(0, 100, 126, 8, true);
    strip(120, 140, 200, 8);
    small(g, T('空腹', 'Fasting'), x(0), P.y1 - 7, D.c.muted, 'center', 'middle', 10);
    small(g, T('2 小時', '2 h'), x(120), P.y1 - 7, D.c.muted, 'center', 'middle', 10);
    // 曲線（到目前的時間）
    if (shownT > 0) {
      g.save(); g.beginPath(); g.rect(P.x0, P.y0 - 4, P.x1 - P.x0, P.y1 - P.y0 + 8); g.clip();
      const grd = g.createLinearGradient(0, P.y0, 0, P.y1);
      grd.addColorStop(0, D.alpha(C['gl-glu'], 0.22)); grd.addColorStop(1, D.alpha(C['gl-glu'], 0.02));
      g.fillStyle = grd; g.beginPath(); g.moveTo(x(0), P.y1);
      for (let t = 0; t <= shownT; t++) g.lineTo(x(t), y(r.G[t]));
      g.lineTo(x(shownT), y(at(shownT))); g.lineTo(x(shownT), P.y1); g.closePath(); g.fill();
      g.strokeStyle = C['gl-glu']; g.lineWidth = 2.6; g.lineJoin = 'round';
      g.shadowColor = D.alpha(C['gl-glu'], 0.35); g.shadowBlur = 6;
      g.beginPath(); for (let t = 0; t <= shownT; t++) { if (!t) g.moveTo(x(t), y(r.G[t])); else g.lineTo(x(t), y(r.G[t])); } g.stroke();
      g.restore();
    }
    // 抽血點
    DRAWS.forEach(function (d) {
      if (d > shownT + 1e-9 && !(d === 0)) {
        g.strokeStyle = D.alpha(D.c.muted, 0.5); g.lineWidth = 1; g.beginPath(); g.arc(x(d), P.y1 - 26, 3, 0, Math.PI * 2); g.stroke();
        return;
      }
      const v = at(d), xx = x(d), yy = Math.max(P.y0, Math.min(P.y1, y(v)));
      tube(g, xx, P.y1 - 26, C['gl-glu']);
      D.ball(g, xx, yy, 5.5, C['gl-glu'], { glow: 0.35 });
      D.haloText(g, num(v, 0), xx + (d === 0 ? 8 : 0), yy - 13, D.c.text, d === 0 ? 'left' : 'center', 'middle', '600 11px ' + FONT);
    });
    // 判讀標章
    if (st2.dx) {
      const d = DX[st2.dx], s = T(d.zh, d.en);
      g.font = '700 14px ' + FONT;
      const tw = g.measureText(s).width + 22;
      const bx = P.x1 - tw - 4, by = P.y0 + 2;
      D.roundRect(g, bx, by, tw, 28, 9);
      g.fillStyle = D.alpha(C[d.col], D.dark ? 0.3 : 0.18); g.fill(); g.strokeStyle = C[d.col]; g.lineWidth = 1.5; g.stroke();
      D.haloText(g, s, bx + tw / 2, by + 14, C[d.col], 'center', 'middle', '700 14px ' + FONT);
    } else if (!st2.running) {
      small(g, T('按「喝下 75 g、開始試驗」', 'Press “Drink 75 g and test”'), (P.x0 + P.x1) / 2, (P.y0 + P.y1) / 2 - 20, D.c.muted, 'center', 'middle', 12);
    }
    // 胰島素
    const I0 = L.i.y0, I1 = L.i.y1;
    panel(g, P.x0 - 8, I0 - 20, P.x1 - P.x0 + 16, I1 - I0 + 26);
    let im = 0; for (let t = 0; t <= 180; t++) im = Math.max(im, r.I[t]);
    const itop = niceMax(im * 1.1, [20, 40, 60, 80, 100, 150, 200, 300]);
    const yi = function (v) { return I1 - (I1 - I0) * v / itop; };
    g.strokeStyle = D.alpha(D.c.border, 0.5); g.lineWidth = 1;
    [0, itop].forEach(function (v) { g.beginPath(); g.moveTo(P.x0, yi(v)); g.lineTo(P.x1, yi(v)); g.stroke(); small(g, num(v, 0), P.x0 - 5, yi(v), D.c.muted, 'right', 'middle', 10); });
    if (shownT > 0) {
      const grd = g.createLinearGradient(0, I0, 0, I1);
      grd.addColorStop(0, D.alpha(C['gl-ins'], 0.45)); grd.addColorStop(1, D.alpha(C['gl-ins'], 0.06));
      g.fillStyle = grd; g.beginPath(); g.moveTo(x(0), I1);
      for (let t = 0; t <= shownT; t++) g.lineTo(x(t), yi(r.I[Math.min(180, t)]));
      g.lineTo(x(shownT), I1); g.closePath(); g.fill();
      g.strokeStyle = C['gl-ins']; g.lineWidth = 1.8;
      g.beginPath(); for (let t = 0; t <= shownT; t++) { if (!t) g.moveTo(x(t), yi(r.I[t])); else g.lineTo(x(t), yi(r.I[t])); } g.stroke();
    }
    D.haloText(g, T('血漿胰島素（mU/L）', 'Plasma insulin (mU/L)'), P.x0, I0 - 10, C['gl-ins'], 'left', 'middle', '600 11.5px ' + FONT);
    for (let t = 0; t <= 180; t += 30) small(g, String(t), x(t), L.ax, D.c.muted, 'center', 'middle', 10.5);
    small(g, T('分鐘', 'min'), P.x0 - 6, L.ax, D.c.muted, 'right', 'middle', 10.5);
  }
  function tube(g, x, y, col) {
    g.save();
    D.roundRect(g, x - 3.5, y - 9, 7, 16, 3);
    g.fillStyle = D.alpha(D.c.surface, 0.95); g.fill();
    g.strokeStyle = D.alpha(D.c.text, 0.5); g.lineWidth = 1; g.stroke();
    D.roundRect(g, x - 2.5, y - 1, 5, 7, 2);
    g.fillStyle = col; g.fill();
    g.restore();
  }
  function mapXY(beta, si) { const M = st2.L.m; return [M.x0 + M.s * beta / BMAX, M.y0 + M.s * (1 - (si - SMIN) / (SMAX - SMIN))]; }
  function drawMap(g, L) {
    const M = L.m;
    panel(g, M.x0 - 44, M.y0 - 30, M.s + 56, M.s + 74);
    D.haloText(g, T('β 細胞 × 敏感度地圖（2 小時試驗的判讀）', 'β cells × sensitivity map (test result)'), M.x0 - 34, M.y0 - 16, D.c.text, 'left', 'middle', '600 12px ' + FONT);
    g.save();
    D.roundRect(g, M.x0, M.y0, M.s, M.s, 6); g.clip();
    g.fillStyle = D.alpha(D.c.text, 0.04); g.fillRect(M.x0, M.y0, M.s, M.s);
    const img = mapImage();
    g.imageSmoothingEnabled = true;
    g.drawImage(img, M.x0, M.y0, M.s, M.s);
    // 處置指數雙曲線
    [0.25, 0.5, 1, 2].forEach(function (c) {
      g.strokeStyle = D.alpha(D.c.text, c === 1 ? 0.6 : 0.35); g.lineWidth = c === 1 ? 1.6 : 1; g.setLineDash(c === 1 ? [] : [5, 4]);
      g.beginPath();
      let first = true;
      for (let b = Math.max(0.02, c / SMAX); b <= BMAX; b += 0.02) {
        const s = c / b; if (s < SMIN) break;
        const p = mapXY(b, s); if (first) { g.moveTo(p[0], p[1]); first = false; } else g.lineTo(p[0], p[1]);
      }
      g.stroke();
    });
    g.setLineDash([]);
    g.restore();
    [0.25, 0.5, 1, 2].forEach(function (c) {
      const b = Math.min(BMAX * 0.94, c / (SMIN + 0.12)), p = mapXY(b, c / b);
      small(g, 'DI ' + c, p[0] - 2, Math.max(M.y0 + 8, p[1] - 8), D.c.muted, 'right', 'middle', 10);
    });
    g.strokeStyle = D.alpha(D.c.border, 1); g.lineWidth = 1; D.roundRect(g, M.x0, M.y0, M.s, M.s, 6); g.stroke();
    if (st2.grid.rows < NS) small(g, T('計算中… ', 'Computing… ') + Math.round(st2.grid.rows / NS * 100) + '%', M.x0 + M.s / 2, M.y0 + M.s - 14, D.c.muted, 'center', 'middle', 11);
    // 軸
    for (let b = 0; b <= BMAX; b += 0.5) { const p = mapXY(b, SMIN); small(g, num(b, 1), p[0], M.y0 + M.s + 10, D.c.muted, 'center', 'middle', 10); }
    [0.1, 0.5, 1, 1.5, 2].forEach(function (s) { const p = mapXY(0, s); small(g, num(s, 1), M.x0 - 5, p[1], D.c.muted, 'right', 'middle', 10); });
    small(g, T('β 細胞功能 →', 'β-cell function →'), M.x0 + M.s / 2, M.y0 + M.s + 26, D.c.text, 'center', 'middle', 11);
    g.save(); g.translate(M.x0 - 37, M.y0 + M.s / 2); g.rotate(-Math.PI / 2);
    small(g, T('胰島素敏感度 →', 'Insulin sensitivity →'), 0, 0, D.c.text, 'center', 'middle', 11);
    g.restore();
    // 健康參考點、做過的病人、目前病人
    const h = mapXY(1, 1);
    g.strokeStyle = D.c.text; g.lineWidth = 1.2; g.beginPath(); g.arc(h[0], h[1], 4, 0, Math.PI * 2); g.stroke();
    st2.tests.forEach(function (q) {
      const p = mapXY(q.beta, q.si);
      g.fillStyle = C[DX[q.dx].col]; g.strokeStyle = D.alpha(D.c.text, 0.7); g.lineWidth = 1;
      g.beginPath(); g.arc(p[0], p[1], 3.5, 0, Math.PI * 2); g.fill(); g.stroke();
    });
    const p = mapXY(st2.beta, st2.si);
    g.strokeStyle = D.alpha(D.c.text, 0.35); g.setLineDash([3, 3]); g.lineWidth = 1;
    g.beginPath(); g.moveTo(M.x0, p[1]); g.lineTo(p[0], p[1]); g.lineTo(p[0], M.y0 + M.s); g.stroke(); g.setLineDash([]);
    D.ball(g, p[0], p[1], 7, st2.dx ? C[DX[st2.dx].col] : D.c.accent, { glow: 0.35 });
  }

  // ---------- 地圖上點選病人 ----------
  let drag2 = false;
  function onMap(ev) {
    const q = evPos(cv2, ev), M = st2.L.m;
    if (q[0] < M.x0 - 8 || q[0] > M.x0 + M.s + 8 || q[1] < M.y0 - 8 || q[1] > M.y0 + M.s + 8) return false;
    const beta = Math.round(Math.max(0, Math.min(BMAX, (q[0] - M.x0) / M.s * BMAX)) * 20) / 20;
    const si = Math.round(Math.max(SMIN, Math.min(SMAX, SMIN + (1 - (q[1] - M.y0) / M.s) * (SMAX - SMIN))) * 20) / 20;
    if (window.LabNum) { window.LabNum.set(el2.b2, beta); window.LabNum.set(el2.s2, si); }
    return true;
  }
  cv2.addEventListener('pointerdown', function (ev) {
    if (onMap(ev)) { drag2 = true; try { cv2.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ } }
  });
  cv2.addEventListener('pointermove', function (ev) { if (drag2) onMap(ev); });
  const end2 = function () { if (drag2) { drag2 = false; say(T('β ' + num(st2.beta, 2) + '，敏感度 ' + num(st2.si, 2), 'β ' + num(st2.beta, 2) + ', sensitivity ' + num(st2.si, 2))); } };
  cv2.addEventListener('pointerup', end2);
  cv2.addEventListener('pointercancel', end2);
  window.LabKeys && window.LabKeys.attach(cv2, {
    label: T('葡萄糖耐受試驗：左右鍵改 β 細胞功能、上下鍵改胰島素敏感度（Shift 改得更多），Enter 開始試驗。', 'Glucose tolerance test: left and right change β-cell function, up and down change insulin sensitivity (Shift for bigger steps); Enter starts the test.'),
    items: [{
      name: T('病人', 'Patient'),
      move: function (dx, dy, big) {
        if (!dx && !dy) return false;
        const s = big ? 0.25 : 0.05;
        if (window.LabNum) {
          if (dx) window.LabNum.set(el2.b2, Math.max(0, Math.min(BMAX, val(el2.b2) + dx * s)));
          if (dy) window.LabNum.set(el2.s2, Math.max(SMIN, Math.min(SMAX, val(el2.s2) - dy * s)));
        }
        return true;
      },
      describe: function () { return T('β 細胞功能 ' + num(st2.beta, 2) + '，敏感度 ' + num(st2.si, 2) + '，空腹血糖 ' + num(st2.res.G[0], 0) + '。', 'β-cell function ' + num(st2.beta, 2) + ', sensitivity ' + num(st2.si, 2) + ', fasting glucose ' + num(st2.res.G[0], 0) + '.'); }
    }]
  });
  cv2.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { ev.preventDefault(); startTest(); }
  });

  // =====================================================================
  // 3D 地形（延遲載入）
  // =====================================================================
  const stage = $('stage2'), host3 = $('view3'), viewMsg = $('viewMsg');
  let view3 = null, threeLib = null, loadToken = 0;
  const bridge = {
    T: T, D: D, B: B,
    colors: function () { readColors(); return Object.assign({}, C); },
    grid: function () { return { NB: NB, NS: NS, bAt: bAt, sAt: sAt, g0: st2.grid.g0, g2: st2.grid.g2, rows: st2.grid.rows, BMAX: BMAX, SMIN: SMIN, SMAX: SMAX }; },
    patient: function () { return { beta: st2.beta, si: st2.si, g0: st2.res.G[0], g2: st2.res.G[120], dx: st2.dx, tests: st2.tests }; },
    diagnose: B.diagnose,
    onContextLost: function () { fail3D(); }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.GL3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.GL3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/blood-glucose-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.GL3D) throw new Error('blood-glucose-3d.js did not load');
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
        stage.classList.add('is3d');
        view3 = window.GL3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        requestAnimationFrame(function () { if (view3) view3.onShow(); });
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
      resize2();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 試驗與地圖。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D test and map are kept.');
    resize2();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // =====================================================================
  // 事件綁定
  // =====================================================================
  let raf1c = 0;
  function schedule1() { if (!raf1c) raf1c = requestAnimationFrame(function () { raf1c = 0; compute1(); }); }
  Object.keys(el).forEach(function (k) { el[k].addEventListener('input', schedule1); });
  let raf2c = 0;
  function schedule2() { if (!raf2c) raf2c = requestAnimationFrame(function () { raf2c = 0; if (rafT) cancelAnimationFrame(rafT); rafT = 0; compute2(); }); }
  el2.b2.addEventListener('input', schedule2);
  el2.s2.addEventListener('input', schedule2);
  $('types').addEventListener('click', function (ev) { const b = ev.target.closest('button[data-t]'); if (b) setType(b.getAttribute('data-t')); });
  $('pats').addEventListener('click', function (ev) { const b = ev.target.closest('button[data-p]'); if (b) setPat(b.getAttribute('data-p')); });
  $('playBtn').addEventListener('click', play);
  $('keepBtn').addEventListener('click', keepCurve);
  $('clear1').addEventListener('click', function () {
    st1.kept = []; st1.rows = []; st1.keepNo = 0;
    renderRows1(); legend1(); request1();
    setStatus('status', T('已清除留下的曲線和紀錄表；設定沒有改變。', 'The kept curves and the table were cleared; the settings are unchanged.'));
  });
  $('testBtn').addEventListener('click', startTest);
  $('clear2').addEventListener('click', function () {
    st2.tests = []; st2.testNo = 0;
    renderRows2(); request2();
    if (view3 && view3.active) view3.update();
    setStatus('status2', T('已清掉做過的試驗；設定沒有改變。', 'The tests were cleared; the settings are unchanged.'));
  });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // ---------- 圖例 ----------
  function legend1() {
    const ln = function (c, dash) { return '<i class="ln' + (dash ? ' dash' : '') + '" style="border-color:' + c + '"></i>'; };
    const sq = function (c) { return '<i class="sq" style="background:' + c + '"></i>'; };
    let h = '<span>' + ln(C['gl-glu']) + T('血糖', 'Glucose') + '</span>' +
      '<span>' + sq(D.alpha(C['gl-in'], 0.45)) + T('目標 70–180', 'Target 70–180') + '</span>' +
      '<span>' + sq(D.alpha(C['gl-lo'], 0.45)) + T('低血糖 < 70', 'Low < 70') + '</span>' +
      '<span>' + ln(C['gl-renal'], true) + T('腎閾', 'Kidney threshold') + '</span>' +
      '<span>' + ln(C['gl-ins']) + T('胰島素', 'Insulin') + '</span>' +
      '<span>' + sq(C['gl-meal']) + T('吃飯', 'Meal') + '</span>' +
      '<span>' + sq(C['gl-bolus']) + T('速效胰島素', 'Rapid insulin') + '</span>' +
      '<span>' + sq(D.alpha(C['gl-ex'], 0.6)) + T('運動', 'Exercise') + '</span>';
    st1.kept.forEach(function (k) { h += '<span>' + ln(C[k.color], true) + T('留下的 ', 'Kept ') + k.no + '</span>'; });
    $('legend1').innerHTML = h;
  }
  function legend2() {
    const sq = function (c) { return '<i class="sq" style="background:' + c + '"></i>'; };
    const ln = function (c, dash) { return '<i class="ln' + (dash ? ' dash' : '') + '" style="border-color:' + c + '"></i>'; };
    $('legend2').innerHTML =
      '<span>' + sq(D.alpha(C['gl-ok'], 0.6)) + T('正常', 'Normal') + '</span>' +
      '<span>' + sq(D.alpha(C['gl-pre'], 0.7)) + T('糖尿病前期', 'Prediabetes') + '</span>' +
      '<span>' + sq(D.alpha(C['gl-dm'], 0.7)) + T('糖尿病', 'Diabetes') + '</span>' +
      '<span>' + ln(D.c.text) + T('處置指數 DI = β × 敏感度（雙曲線）', 'Disposition index DI = β × S (hyperbolas)') + '</span>' +
      '<span>' + ln(C['gl-ins']) + T('胰島素', 'Insulin') + '</span>';
  }

  // =====================================================================
  // 啟動
  // =====================================================================
  function resize1() { layout1(); request1(); }
  function resize2() { layout2(); request2(); }
  readColors();
  layout1(); layout2();
  compute1(); compute2();
  renderRows1(); renderRows2();
  updateSoundButton();
  legend1(); legend2();
  setTimeout(gridStep, 300);
  function themeChanged() {
    readColors();
    st2.img = null; st2.imgRows = -1;
    if (view3 && view3.active) view3.onTheme();
    legend1(); legend2(); renderRo1(); renderRows1();
    request1(); request2();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:langchange', function () {
    renderOutputs1(); renderChips1(); renderRo1(); renderRows1(); renderOutputs2(); renderChips2(); renderRo2(); renderRows2(); legend1(); legend2(); updateTestBtn();
    if (!st1.playing) $('playBtn').textContent = T('播放這一天', 'Play the day');
    statusDay();
    if (view3 && view3.active) view3.onTheme();
    request1(); request2();
  });
  setStatus('status2', T('選一位病人，或在地圖上點一個位置，再按「喝下 75 g、開始試驗」。', 'Choose a patient, or tap a point on the map, then press “Drink 75 g and test”.'));
  if (window.ResizeObserver) {
    const watch = function (c, fn) { let lw = 0; new ResizeObserver(function () { if (c.clientWidth && c.clientWidth !== lw) { lw = c.clientWidth; fn(); } }).observe(c); };
    watch(cv, resize1); watch(cv2, resize2);
  } else window.addEventListener('resize', function () { resize1(); resize2(); });

  // 測試與縮圖用
  window.__bg = {
    B: B, st1: st1, st2: st2,
    type: setType, pat: setPat, keep: keepCurve, cursor: setCursor,
    set: function (id, v) { const e = el[id] || el2[id]; if (e && window.LabNum) window.LabNum.set(e, v); },
    /** 立刻算完（不等 requestAnimationFrame） */
    flush: function () { if (raf1c) { cancelAnimationFrame(raf1c); raf1c = 0; } if (raf2c) { cancelAnimationFrame(raf2c); raf2c = 0; } compute1(); compute2(); },
    /** 立刻做完一次試驗 */
    testNow: function () { if (raf2c) { cancelAnimationFrame(raf2c); raf2c = 0; compute2(); } startTest(); finishTest(); },
    gridNow: function () { while (st2.grid.rows < NS) { const j = st2.grid.rows; for (let i = 0; i < NB; i++) { const r = ogttOf(bAt(i), sAt(j)); st2.grid.g0[j * NB + i] = r.G[0]; st2.grid.g2[j * NB + i] = r.G[120]; } st2.grid.rows++; } request2(); if (view3 && view3.active) view3.rebuild(); },
    setView: setView, redraw: function () { request1(); request2(); },
    data: eventData
  };
})();
