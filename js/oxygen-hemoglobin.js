/* oxygen-hemoglobin.js — 「氧氣與血紅素」的畫面與互動（計算全部在 oxygen-hemoglobin-core.js；3D 在 oxygen-hemoglobin-3d.js，切換時才載入） */
(function () {
  'use strict';
  const O = window.OxyCore;
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
  const XMAX = 150;             // 第一部分橫軸上限（mmHg）
  const NMOL = 48, RATE = 3;    // 第二部分：48 個分子，每個平均每秒重抽 3 次
  const MEAS_T = 2;             // 量一次平均 2 秒
  const MAX_KEEP = 4, MAX_ROWS = 20, MAX_PTS = 30;

  // =====================================================================
  // 顏色、數字
  // =====================================================================
  const C = {};
  const KEYS = ['oh-art', 'oh-ven', 'oh-hba', 'oh-hbf', 'oh-mb', 'oh-co', 'oh-std', 'oh-good', 'oh-bad', 'oh-r', 'oh-t', 'oh-o2', 'oh-dis', 'oh-k1', 'oh-k2', 'oh-k3', 'oh-k4'];
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
  /** 有效數字（不用科學記號的上標字元） */
  function sig(v, n) {
    if (!isFinite(v)) return '∞';
    if (v === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(v)));
    const d = Math.max(0, n - 1 - e);
    return num(v, Math.min(d, 6));
  }
  function pct(v, d) { return num(v * 100, d == null ? 1 : d) + '%'; }
  const PROT = {
    A: { zh: '成人血紅素 HbA', en: 'Adult haemoglobin (HbA)', short: ['成人 HbA', 'Adult HbA'], col: 'oh-hba' },
    F: { zh: '胎兒血紅素 HbF', en: 'Fetal haemoglobin (HbF)', short: ['胎兒 HbF', 'Fetal HbF'], col: 'oh-hbf' },
    Mb: { zh: '肌紅素 Mb', en: 'Myoglobin (Mb)', short: ['肌紅素', 'Myoglobin'], col: 'oh-mb' }
  };
  const BASE = { alt: 0, pco2: 40, ppm: 0, hco3: 24, temp: 37, bpg: 5, hb: 15, dem: 5 };
  const SCEN = {
    rest: { zh: '安靜', en: 'At rest', v: {} },
    marathon: { zh: '馬拉松', en: 'Marathon', v: { dem: 12, temp: 39, pco2: 35, hco3: 20 } },
    yushan: { zh: '玉山主峰', en: 'Jade Mountain', v: { alt: 3952, pco2: 34, bpg: 5.5 } },
    m5000: { zh: '剛到 5000 m', en: 'Just at 5000 m', v: { alt: 5000, pco2: 32, bpg: 5.5 } },
    co: { zh: '一氧化碳', en: 'Carbon monoxide', v: { ppm: 100 } },
    anemia: { zh: '貧血', en: 'Anaemia', v: { hb: 8 } }
  };
  const SCEN_TIP = {
    rest: ['海平面、安靜坐著：每 100 mL 血交出 5 mL 氧。', 'Sea level, sitting still: each 100 mL of blood hands over 5 mL of oxygen.'],
    marathon: ['跑步時肌肉要的氧多了好幾倍，體溫升高、乳酸讓血變酸、呼吸加快。', 'Running muscles need several times more oxygen; the body warms up, lactic acid makes the blood more acidic and breathing speeds up.'],
    yushan: ['臺灣最高的山，3952 m：氣壓只剩海平面的六成，呼吸會自動加快。', 'Taiwan’s highest peak, 3952 m: the air pressure is about 60% of sea level and breathing speeds up by itself.'],
    m5000: ['剛搭車到 5000 m 的高原，還沒有適應。', 'Just driven up to 5000 m, not yet acclimatised.'],
    co: ['在通風不良的地方燒炭或用熱水器：空氣中有 100 ppm 一氧化碳，吸了好幾個小時。', 'Burning charcoal or a gas heater in a poorly ventilated room: 100 ppm of carbon monoxide, breathed for hours.'],
    anemia: ['血紅素只剩 8 g/dL（正常約 12–17）。', 'Only 8 g/dL of haemoglobin (normal is about 12–17).']
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
  let lastTick = 0;
  function sndProbe(S) {
    const S0 = sound(); if (!S0) return;
    const now = performance.now(); if (now - lastTick < 60) return; lastTick = now;
    S0.tone({ freq: 300 + 600 * S, dur: 0.05, gain: 0.025, type: 'sine' });
  }
  function sndClick(f) { const S0 = sound(); if (S0) S0.tone({ freq: f || 523, dur: 0.07, gain: 0.035, type: 'triangle' }); }
  function sndKeep() {
    const S0 = sound(); if (!S0) return;
    S0.tone({ freq: 523, dur: 0.08, gain: 0.035 }); setTimeout(function () { S0.tone({ freq: 784, dur: 0.12, gain: 0.035 }); }, 90);
  }
  function sndWarn() { const S0 = sound(); if (S0) S0.sweep({ from: 520, to: 280, dur: 0.35, gain: 0.04, type: 'sawtooth' }); }
  function sndMeasure(Y) {
    const S0 = sound(); if (!S0) return;
    S0.tone({ freq: 330 + 550 * Y, dur: 0.16, gain: 0.04, type: 'sine' });
  }
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
  function small(g, s, x, y, col, align, base) { D.haloText(g, s, x, y, col || D.c.muted, align || 'left', base || 'middle', '11px ' + FONT); }
  /** 下標文字：parts = [[文字, 是否下標], …]；回傳寬度 */
  function subText(g, parts, x, y, color, size, weight, align) {
    size = size || 12; weight = weight || '';
    const f0 = (weight ? weight + ' ' : '') + size + 'px ' + FONT, f1 = (weight ? weight + ' ' : '') + Math.round(size * 0.74) + 'px ' + FONT;
    let w = 0;
    parts.forEach(function (p) { g.font = p[1] ? f1 : f0; w += g.measureText(p[0]).width; });
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    parts.forEach(function (p) {
      g.font = p[1] ? f1 : f0;
      D.haloText(g, p[0], cx, y + (p[1] ? size * 0.3 : 0), color, 'left', 'middle', p[1] ? f1 : f0);
      cx += g.measureText(p[0]).width;
    });
    return w;
  }
  function evPos(c, ev) { const r = c.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }

  // =====================================================================
  // 一・氧解離曲線
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const el = {
    probe: $('probe'), alt: $('alt'), pco2: $('pco2'), ppm: $('ppm'), hco3: $('hco3'), temp: $('temp'), bpg: $('bpg'), hb: $('hb'), dem: $('dem')
  };
  const st1 = { type: 'A', s: null, o: null, Sp: 0, kept: [], rows: [], keepNo: 0, warn: false };
  let W1 = 300, H1 = 460, L1 = null;

  function inputs() {
    return {
      alt: val(el.alt), PaCO2: val(el.pco2), HCO3: val(el.hco3), T: val(el.temp), BPG: val(el.bpg),
      Hb: val(el.hb), ppm: val(el.ppm), D: val(el.dem), type: st1.type
    };
  }
  function compute1() {
    st1.o = inputs();
    st1.s = O.state(st1.o);
    st1.Sp = O.sat(val(el.probe), st1.s.ca, st1.type, st1.s.PCO).O2;
  }
  function isStdCurve() {
    const o = st1.o, s = st1.s;
    return Math.abs(s.pH - 7.4) <= 0.02 && Math.abs(o.PaCO2 - 40) <= 1 && Math.abs(o.T - 37) <= 0.05 && Math.abs(o.BPG - 5) <= 0.05 && o.ppm === 0;
  }
  function matchScen() {
    const cur = { alt: val(el.alt), pco2: val(el.pco2), ppm: val(el.ppm), hco3: val(el.hco3), temp: val(el.temp), bpg: val(el.bpg), hb: val(el.hb), dem: val(el.dem) };
    for (const k in SCEN) {
      const v = Object.assign({}, BASE, SCEN[k].v);
      let ok = true;
      for (const q in v) if (Math.abs(v[q] - cur[q]) > 1e-9) { ok = false; break; }
      if (ok) return k;
    }
    return null;
  }
  function renderOutputs1() {
    $('probeo').textContent = num(val(el.probe), 1);
    $('alto').textContent = num(val(el.alt), 0);
    $('pco2o').textContent = num(val(el.pco2), 1);
    $('ppmo').textContent = num(val(el.ppm), 0);
    $('hco3o').textContent = num(val(el.hco3), 1);
    $('tempo').textContent = num(val(el.temp), 1);
    $('bpgo').textContent = num(val(el.bpg), 1);
    $('hbo').textContent = num(val(el.hb), 1);
    $('demo').textContent = num(val(el.dem), 1);
  }
  function renderChips() {
    const cur = matchScen();
    $('scens').innerHTML = Object.keys(SCEN).map(function (k) {
      return '<button type="button" data-s="' + k + '" aria-pressed="' + (k === cur) + '" title="' + T(SCEN_TIP[k][0], SCEN_TIP[k][1]) + '">' + T(SCEN[k].zh, SCEN[k].en) + '</button>';
    }).join('');
    $('prots').innerHTML = Object.keys(PROT).map(function (k) {
      return '<button type="button" data-p="' + k + '" aria-pressed="' + (k === st1.type) + '">' + T(PROT[k].short[0], PROT[k].short[1]) + '</button>';
    }).join('');
  }
  const SUBS = {
    PaO2: 'P<sub>aO<sub>2</sub></sub>', PvO2: 'P<sub>vO<sub>2</sub></sub>', SaO2: 'S<sub>aO<sub>2</sub></sub>', SvO2: 'S<sub>vO<sub>2</sub></sub>',
    PAO2: 'P<sub>AO<sub>2</sub></sub>', P50: 'P<sub>50</sub>', CaO2: 'C<sub>aO<sub>2</sub></sub>', PB: 'P<sub>B</sub>'
  };
  function renderRo1() {
    const s = st1.s, o = st1.o;
    const rows = [];
    rows.push([T('血液 pH', 'Blood pH'), num(s.pH, 2), T('動脈；靜脈 ', 'arterial; venous ') + num(s.pHv, 2), '']);
    rows.push([T('大氣壓 ', 'Air pressure ') + SUBS.PB, num(s.Pb, 0) + ' mmHg', T('肺泡 ', 'alveolar ') + SUBS.PAO2 + ' ' + num(s.PAO2, 1) + ' mmHg', s.PAO2 <= 0 ? 'bad' : '']);
    rows.push([T('動脈 ', 'Arterial ') + SUBS.PaO2 + '・' + SUBS.SaO2, num(s.Pa, 1) + ' mmHg・' + pct(s.Sa), '', s.Sa < 0.8 ? 'bad' : '']);
    rows.push([T('靜脈 ', 'Venous ') + SUBS.PvO2 + '・' + SUBS.SvO2,
      s.deficit ? T('不夠交！', 'Not enough!') : num(s.Pv, 1) + ' mmHg・' + pct(s.Sv),
      s.deficit ? T('動脈血的氧比組織要的少', 'The arterial blood carries less oxygen than the tissues need') : (s.Pv < 20 ? T('低於 20 mmHg：組織快缺氧了', 'below 20 mmHg: the tissues are close to running short') : ''),
      s.deficit || s.Pv < 20 ? 'bad' : '']);
    rows.push([SUBS.P50 + '・Hill n', (isFinite(s.P50) ? num(s.P50, 1) + ' mmHg' : T('到不了 50%', 'never reaches 50%')) + '・' + num(s.n, 2),
      o.ppm > 0 && isFinite(s.P50free) ? T('沒有 CO 時 ', 'without CO ') + num(s.P50free, 1) + ' mmHg' : '', '']);
    rows.push([T('含氧量（每 100 mL 血）', 'Oxygen content (per 100 mL of blood)'),
      num(s.Ca, 1) + ' → ' + (s.deficit ? '0' : num(s.Cv, 1)) + ' mL',
      T('交出 ', 'handed over ') + num(s.deficit ? s.Ca : s.dC, 1) + ' mL（' + pct(s.deficit ? 1 : s.frac, 0) + '）', '']);
    if (o.ppm > 0) rows.push([T('一氧化碳血紅素 HbCO', 'Carboxyhaemoglobin (HbCO)'), pct(s.COHb), T('沒有 CO 時含氧量 ', 'oxygen content without CO ') + num(s.Ca0, 1) + ' mL', s.COHb > 0.2 ? 'bad' : '']);
    $('ro1').innerHTML = rows.map(function (r) {
      return '<dt>' + r[0] + '</dt><dd' + (r[3] ? ' class="' + r[3] + '"' : '') + '>' + r[1] + (r[2] ? '<small>' + r[2] + '</small>' : '') + '</dd>';
    }).join('');
  }
  function renderRows1() {
    const t = $('runs1');
    if (!st1.rows.length) { t.innerHTML = ''; return; }
    t.innerHTML = '<thead><tr><th>#</th><th>' + T('攜氧蛋白', 'Carrier') + '</th><th>' + T('海拔', 'Altitude') + '</th><th>' + SUBS.P50 + '</th><th>' + SUBS.PaO2 + '</th><th>' + SUBS.SaO2 + '</th><th>' + SUBS.PvO2 + '</th><th>' + SUBS.CaO2 + '</th></tr></thead><tbody>' +
      st1.rows.map(function (r) {
        const sw = r.color ? '<i class="ln" style="border-color:' + C[r.color] + '"></i> ' : '';
        return '<tr><td>' + sw + r.no + '</td><td>' + T(PROT[r.type].short[0], PROT[r.type].short[1]) + '</td><td>' + num(r.alt, 0) + ' m</td><td>' + (isFinite(r.P50) ? num(r.P50, 1) : '—') +
          '</td><td>' + num(r.Pa, 1) + '</td><td>' + pct(r.Sa, 1) + '</td><td>' + (r.deficit ? '—' : num(r.Pv, 1)) + '</td><td>' + num(r.Ca, 1) + '</td></tr>';
      }).join('') + '</tbody>';
  }
  function keepCurve() {
    const s = st1.s;
    st1.keepNo++;
    const used = st1.kept.map(function (k) { return k.color; });
    let color = ['oh-k1', 'oh-k2', 'oh-k3', 'oh-k4'].find(function (c) { return used.indexOf(c) < 0; });
    if (!color) { const old = st1.kept.shift(); color = old.color; st1.rows.forEach(function (r) { if (r.no === old.no) r.color = null; }); }
    st1.kept.push({ no: st1.keepNo, color: color, type: st1.type, ca: Object.assign({}, s.ca), PCO: s.PCO, P50: s.P50 });
    st1.rows.push({ no: st1.keepNo, color: color, type: st1.type, alt: st1.o.alt, P50: s.P50, Pa: s.Pa, Sa: s.Sa, Pv: s.Pv, Ca: s.Ca, deficit: s.deficit });
    while (st1.rows.length > MAX_ROWS) st1.rows.shift();
    renderRows1(); legend1(); sndKeep(); request1();
    setStatus('status', T('已留下第 ' + st1.keepNo + ' 條曲線，可以改條件後比較。', 'Curve ' + st1.keepNo + ' kept; change the conditions and compare.'));
  }

  // ---------- 版面 ----------
  function layout1() {
    W1 = cv.clientWidth || 300;
    const narrow = W1 < 640;
    H1 = narrow ? 580 : 480;
    fit(cv, ctx, H1);
    if (narrow) {
      const PL = { x: 44, y: 84, w: W1 - 44 - 12, h: H1 - 84 - 46 - 104 };
      L1 = { narrow: true, PL: PL, BR: { x: 44, y: H1 - 70, w: W1 - 56, h: 24 } };
    } else {
      const PL = { x: 58, y: 84, w: W1 - 58 - 190, h: H1 - 84 - 50 };
      L1 = { narrow: false, PL: PL, BR: { x: W1 - 160, y: PL.y + 10, w: 40, h: PL.h - 10 } };
    }
  }
  function xp(P) { return L1.PL.x + Math.max(0, Math.min(XMAX, P)) / XMAX * L1.PL.w; }
  function yp(S) { return L1.PL.y + L1.PL.h * (1 - S); }
  function pOfX(x) { return Math.max(0, Math.min(XMAX, (x - L1.PL.x) / L1.PL.w * XMAX)); }

  function curvePath(g, fS) {
    g.beginPath();
    const n = Math.max(120, Math.round(L1.PL.w / 2));
    for (let i = 0; i <= n; i++) {
      const P = XMAX * i / n, S = fS(P);
      const x = xp(P), y = yp(S);
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
  }
  function strokeCurve(g, fS, color, width, dash, a) {
    g.save();
    g.globalAlpha = a == null ? 1 : a;
    curvePath(g, fS);
    g.setLineDash(dash || []);
    g.strokeStyle = color; g.lineWidth = width; g.lineJoin = 'round'; g.lineCap = 'round';
    g.stroke();
    g.restore();
  }
  function draw1() {
    const g = ctx, PL = L1.PL, s = st1.s, o = st1.o, type = st1.type;
    g.clearRect(0, 0, W1, H1);
    D.backdrop(g, W1, H1);
    // 標題列
    const pc = C[PROT[type].col];
    D.haloText(g, T(PROT[type].zh, PROT[type].en), 12, 18, pc, 'left', 'middle', '600 13px ' + FONT);
    D.haloText(g, 'pH ' + num(s.pH, 2), W1 - 12, 18, D.c.text, 'right', 'middle', '600 13px ' + FONT);
    const longInfo = T('海拔 ' + num(o.alt, 0) + ' m・大氣壓 ' + num(s.Pb, 0) + ' mmHg・肺泡氧分壓 ' + num(s.PAO2, 1) + ' mmHg・' + num(o.T, 1) + ' °C',
      'Altitude ' + num(o.alt, 0) + ' m · air ' + num(s.Pb, 0) + ' mmHg · alveolar oxygen ' + num(s.PAO2, 1) + ' mmHg · ' + num(o.T, 1) + ' °C');
    g.font = '11px ' + FONT;
    const info = g.measureText(longInfo).width < W1 - 24 ? longInfo :
      T(num(o.alt, 0) + ' m・氣壓 ' + num(s.Pb, 0) + '・肺泡 ' + num(s.PAO2, 1) + ' mmHg', num(o.alt, 0) + ' m · air ' + num(s.Pb, 0) + ' · alveolar ' + num(s.PAO2, 1) + ' mmHg');
    small(g, info, 12, 37);
    // 座標區
    panel(g, PL.x - 8, PL.y - 8, PL.w + 16, PL.h + 16);
    g.save();
    g.lineWidth = 1;
    for (let S = 0; S <= 1.0001; S += 0.25) {
      g.strokeStyle = D.alpha(D.c.border, S === 0 ? 0.9 : 0.45);
      g.beginPath(); g.moveTo(PL.x, yp(S)); g.lineTo(PL.x + PL.w, yp(S)); g.stroke();
      small(g, num(S * 100, 0) + '%', PL.x - 6, yp(S), D.c.muted, 'right');
    }
    const step = L1.narrow ? 30 : 20;
    for (let P = 0; P <= XMAX; P += step) {
      g.strokeStyle = D.alpha(D.c.border, P === 0 ? 0.9 : 0.35);
      g.beginPath(); g.moveTo(xp(P), PL.y); g.lineTo(xp(P), PL.y + PL.h); g.stroke();
      small(g, String(P), xp(P), PL.y + PL.h + 14, D.c.muted, 'center');
    }
    g.restore();
    small(g, T('氧分壓（mmHg）', 'Oxygen partial pressure (mmHg)'), PL.x + PL.w / 2, PL.y + PL.h + 32, D.c.muted, 'center');
    g.save(); g.translate(13, PL.y + PL.h / 2); g.rotate(-Math.PI / 2);
    small(g, T('氧飽和度', 'Oxygen saturation'), 0, 0, D.c.muted, 'center'); g.restore();
    // 典型位置
    [[100, '肺', 'lungs'], [40, '安靜組織', 'resting tissue'], [20, '用力的肌肉', 'working muscle']].forEach(function (z) {
      const x = xp(z[0]);
      g.fillStyle = D.alpha(D.c.muted, 0.8);
      g.beginPath(); g.moveTo(x - 4, PL.y - 13); g.lineTo(x + 4, PL.y - 13); g.lineTo(x, PL.y - 8); g.closePath(); g.fill();
      small(g, T(z[1], z[2]), x, PL.y - 20, D.c.muted, z[0] === 20 ? 'right' : z[0] === 40 ? 'left' : 'center');
    });
    // 曲線
    g.save();
    g.beginPath(); g.rect(PL.x, PL.y - 2, PL.w, PL.h + 4); g.clip();
    strokeCurve(g, function (P) { return O.sev(P); }, C['oh-std'], 1.6, [6, 5], 0.9);
    st1.kept.forEach(function (k) { strokeCurve(g, function (P) { return O.sat(P, k.ca, k.type, k.PCO).O2; }, C[k.color], 2, [], 0.95); });
    if (o.ppm > 0) {
      // 被 CO 佔走的部分：總配體飽和度與 O2 飽和度之間
      g.beginPath();
      const n = 160;
      for (let i = 0; i <= n; i++) { const P = XMAX * i / n; const q = O.sat(P, s.ca, type, s.PCO); if (i) g.lineTo(xp(P), yp(q.tot)); else g.moveTo(xp(P), yp(q.tot)); }
      for (let i = n; i >= 0; i--) { const P = XMAX * i / n; g.lineTo(xp(P), yp(O.sat(P, s.ca, type, s.PCO).O2)); }
      g.closePath(); g.fillStyle = D.alpha(C['oh-co'], D.dark ? 0.22 : 0.16); g.fill();
      strokeCurve(g, function (P) { return O.sat0(P, s.ca, type); }, C['oh-co'], 1.3, [2, 4], 0.8);
    }
    strokeCurve(g, function (P) { return O.sat(P, s.cv, type, s.PCO).O2; }, C['oh-ven'], 1.6, [3, 4], 0.85);
    g.save(); g.shadowColor = D.alpha(pc, 0.45); g.shadowBlur = 6;
    strokeCurve(g, function (P) { return O.sat(P, s.ca, type, s.PCO).O2; }, pc, 3.2, [], 1);
    g.restore();
    g.restore();
    // 留下的曲線編號
    st1.kept.forEach(function (k) {
      if (!isFinite(k.P50) || k.P50 > XMAX) return;
      const x = xp(k.P50), y = yp(0.5);
      D.ball(g, x, y, 8, C[k.color], { glow: 0 });
      D.haloText(g, String(k.no), x, y + 0.5, '#ffffff', 'center', 'middle', '600 10px ' + FONT);
    });
    // P50
    if (isFinite(s.P50) && s.P50 <= XMAX) {
      g.save(); g.setLineDash([2, 3]); g.strokeStyle = D.alpha(pc, 0.8); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(PL.x, yp(0.5)); g.lineTo(xp(s.P50), yp(0.5)); g.lineTo(xp(s.P50), yp(0)); g.stroke(); g.restore();
      subText(g, [['P', 0], ['50', 1], [' ' + num(s.P50, 1), 0]], xp(s.P50) + 5, yp(0) - 12, pc, 11, '600', 'left');
    }
    // 探針
    const Pp = val(el.probe), Sp = st1.Sp;
    g.save(); g.setLineDash([4, 3]); g.strokeStyle = D.alpha(D.c.accent, 0.85); g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(xp(Pp), yp(0)); g.lineTo(xp(Pp), yp(Sp)); g.lineTo(PL.x, yp(Sp)); g.stroke(); g.restore();
    g.beginPath(); g.arc(xp(Pp), yp(Sp), 6, 0, Math.PI * 2);
    g.lineWidth = 2.5; g.strokeStyle = D.c.accent; g.stroke();
    const pl = T('探針 ', 'Probe ') + num(Pp, 1) + ' mmHg → ' + pct(Sp);
    g.font = '600 12px ' + FONT;
    const pw = g.measureText(pl).width + 16;
    let bx = Math.max(PL.x + 2, Math.min(PL.x + PL.w - pw - 2, xp(Pp) - pw / 2));
    D.roundRect(g, bx, PL.y + 4, pw, 22, 7);
    g.fillStyle = D.alpha(D.c.surface, 0.92); g.fill(); g.strokeStyle = D.alpha(D.c.accent, 0.7); g.lineWidth = 1; g.stroke();
    D.haloText(g, pl, bx + pw / 2, PL.y + 15.5, D.c.accent, 'center', 'middle', '600 12px ' + FONT);
    // 動脈、靜脈點
    const ax = xp(s.Pa), ay = yp(s.Sa);
    if (!s.deficit) {
      const vx = xp(s.Pv), vy = yp(s.Sv);
      // 放出的飽和度
      const rx = PL.x + PL.w - 16;
      g.save(); g.setLineDash([1, 3]); g.strokeStyle = D.alpha(D.c.muted, 0.8); g.lineWidth = 1;
      g.beginPath(); g.moveTo(ax + 8, ay); g.lineTo(rx, ay); g.moveTo(vx + 8, vy); g.lineTo(rx, vy); g.stroke(); g.restore();
      if (ay < vy - 6) {
        g.strokeStyle = C['oh-art']; g.lineWidth = 2;
        g.beginPath(); g.moveTo(rx, ay + 2); g.lineTo(rx, vy - 2); g.stroke();
        g.fillStyle = C['oh-art'];
        g.beginPath(); g.moveTo(rx - 4, vy - 8); g.lineTo(rx + 4, vy - 8); g.lineTo(rx, vy - 1); g.closePath(); g.fill();
        small(g, T('放出 ', 'Released ') + num((s.Sa - s.Sv) * 100, 0) + '%', rx - 6, (ay + vy) / 2, C['oh-art'], 'right');
      }
      D.ball(g, vx, vy, 7, C['oh-ven']);
      D.haloText(g, 'V', vx, vy + 17, C['oh-ven'], 'center', 'middle', '700 12px ' + FONT);
    }
    if (s.Pa > 0) {
      D.ball(g, ax, ay, 7, C['oh-art']);
      D.haloText(g, 'A', ax, ay + 17, C['oh-art'], 'center', 'middle', '700 12px ' + FONT);
    }
    // 警告
    if (s.PAO2 <= 0 || s.deficit) {
      const msg = s.PAO2 <= 0 ? T('肺泡裡沒有氧了！', 'There is no oxygen left in the alveoli!') : T('動脈血的氧不夠交給組織！', 'The arterial blood cannot supply what the tissues need!');
      const wf = L1.narrow ? '700 12px ' : '700 14px ';
      g.font = wf + FONT;
      const mw = Math.min(PL.w - 8, g.measureText(msg).width + 24);
      D.roundRect(g, PL.x + PL.w / 2 - mw / 2, PL.y + PL.h / 2 - 16, mw, 32, 9);
      g.fillStyle = D.alpha(D.c.surface, 0.94); g.fill(); g.strokeStyle = C['oh-bad']; g.lineWidth = 1.5; g.stroke();
      D.haloText(g, msg, PL.x + PL.w / 2, PL.y + PL.h / 2, C['oh-bad'], 'center', 'middle', wf + FONT);
    }
    drawBar(g);
  }
  /** 含氧量長條：靜脈還留著的、交給組織的、被 CO 佔走的、空著的 */
  function drawBar(g) {
    const s = st1.s, o = st1.o, B = L1.BR;
    const cap = 1.34 * o.Hb;
    const CAP = 30;
    const cv0 = s.deficit ? 0 : s.Cv, dc = s.deficit ? s.Ca : s.dC, co = cap * s.COHb;
    const segs = [[cv0, C['oh-ven']], [dc, C['oh-art']], [co, C['oh-co']]];
    if (!L1.narrow) {
      const by = function (v) { return B.y + B.h * (1 - v / CAP); };
      D.haloText(g, T('含氧量', 'O2 content'), B.x + B.w / 2, B.y - 30, D.c.text, 'center', 'middle', '600 12px ' + FONT);
      small(g, T('每 100 mL 血（mL）', 'mL per 100 mL'), B.x + B.w / 2, B.y - 14, D.c.muted, 'center');
      // 外框（上限）
      D.roundRect(g, B.x, by(cap), B.w, B.y + B.h - by(cap), 6);
      g.fillStyle = D.alpha(D.c.surface, 0.6); g.fill();
      g.save(); g.setLineDash([3, 3]); g.strokeStyle = D.alpha(D.c.muted, 0.8); g.lineWidth = 1; g.stroke(); g.restore();
      let v0 = 0;
      g.save(); D.roundRect(g, B.x, by(cap), B.w, B.y + B.h - by(cap), 6); g.clip();
      segs.forEach(function (sg) {
        if (sg[0] <= 0) return;
        const y1 = by(v0 + sg[0]), y0 = by(v0);
        const gr = g.createLinearGradient(B.x, 0, B.x + B.w, 0);
        gr.addColorStop(0, D.shade(sg[1], 0.22)); gr.addColorStop(0.5, sg[1]); gr.addColorStop(1, D.shade(sg[1], -0.18));
        g.fillStyle = gr; g.fillRect(B.x, y1, B.w, y0 - y1);
        v0 += sg[0];
      });
      g.restore();
      // 刻度
      for (let v = 0; v <= CAP; v += 10) small(g, String(v), B.x - 6, by(v), D.c.muted, 'right');
      // 標籤（避免重疊）
      const labs = [];
      labs.push({ y: by(cap), t: T('上限 ', 'max ') + num(cap, 1), c: D.c.muted });
      labs.push({ y: by(s.Ca), t: T('動脈 ', 'arterial ') + num(s.Ca, 1), c: C['oh-art'] });
      if (!s.deficit) labs.push({ y: by(cv0), t: T('靜脈 ', 'venous ') + num(cv0, 1), c: C['oh-ven'] });
      labs.push({ y: by(cv0 + dc / 2), t: T('交出 ', 'given ') + num(dc, 1), c: C['oh-art'], b: true });
      if (co > 0.05) labs.push({ y: by(cv0 + dc + co / 2), t: 'CO ' + num(co, 1), c: C['oh-co'] });
      labs.sort(function (a, b) { return a.y - b.y; });
      for (let i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 14) labs[i].y = labs[i - 1].y + 14;
      for (let i = labs.length - 2; i >= 0; i--) if (labs[i + 1].y > B.y + B.h && labs[i + 1].y - labs[i].y < 14) labs[i].y = labs[i + 1].y - 14;
      labs.forEach(function (l) {
        D.haloText(g, l.t, B.x + B.w + 8, l.y, l.c, 'left', 'middle', (l.b ? '600 ' : '') + '11px ' + FONT);
      });
    } else {
      const bx = function (v) { return B.x + B.w * v / CAP; };
      small(g, T('每 100 mL 血的含氧量（mL）', 'Oxygen per 100 mL of blood (mL)'), B.x, B.y - 30, D.c.text);
      D.roundRect(g, B.x, B.y, bx(cap) - B.x, B.h, 6);
      g.fillStyle = D.alpha(D.c.surface, 0.6); g.fill();
      g.save(); g.setLineDash([3, 3]); g.strokeStyle = D.alpha(D.c.muted, 0.8); g.lineWidth = 1; g.stroke(); g.restore();
      let v0 = 0;
      g.save(); D.roundRect(g, B.x, B.y, bx(cap) - B.x, B.h, 6); g.clip();
      segs.forEach(function (sg) {
        if (sg[0] <= 0) return;
        const gr = g.createLinearGradient(0, B.y, 0, B.y + B.h);
        gr.addColorStop(0, D.shade(sg[1], 0.22)); gr.addColorStop(1, D.shade(sg[1], -0.18));
        g.fillStyle = gr; g.fillRect(bx(v0), B.y, bx(v0 + sg[0]) - bx(v0), B.h);
        v0 += sg[0];
      });
      g.restore();
      // 上方：靜脈、動脈；下方：交出、CO、上限
      const vt = T('靜脈 ', 'venous ') + num(cv0, 1), at = T('動脈 ', 'arterial ') + num(s.Ca, 1);
      g.font = '11px ' + FONT;
      const vw = s.deficit ? 0 : g.measureText(vt).width + 12, aw = g.measureText(at).width;
      if (!s.deficit) small(g, vt, B.x, B.y - 10, C['oh-ven'], 'left');
      small(g, at, Math.max(B.x + vw + aw, Math.min(B.x + B.w, bx(s.Ca))), B.y - 10, C['oh-art'], 'right');
      let below = T('交出 ', 'given ') + num(dc, 1);
      if (co > 0.05) below += T('・CO 佔走 ', ' · blocked by CO ') + num(co, 1);
      below += T('・上限 ', ' · max ') + num(cap, 1);
      small(g, below, B.x, B.y + B.h + 13, D.c.muted, 'left');
    }
  }

  let raf1 = 0;
  function request1() {
    if (raf1) return;
    raf1 = requestAnimationFrame(function () { raf1 = 0; draw1(); });
  }
  let emitTimer = 0;
  function scheduleEmit() {
    clearTimeout(emitTimer);
    emitTimer = setTimeout(function () {
      const s = st1.s, o = st1.o;
      emit('oxy', {
        type: o.type, alt: o.alt, PaCO2: o.PaCO2, HCO3: o.HCO3, T: o.T, BPG: o.BPG, Hb: o.Hb, ppm: o.ppm, D: o.D,
        probe: val(el.probe), Sp: st1.Sp, pH: s.pH, PAO2: s.PAO2, Pa: s.Pa, Sa: s.Sa, Pv: s.Pv, Sv: s.Sv, Ca: s.Ca, Ca0: s.Ca0,
        deficit: s.deficit, P50: s.P50, n: s.n, std: isStdCurve(),
        key: [o.alt, o.PaCO2, o.HCO3, o.T, o.BPG, o.ppm].map(function (v) { return Math.round(v * 100); }).join(',')
      });
    }, 150);
  }
  function update1(fromProbe) {
    compute1();
    renderOutputs1();
    if (!fromProbe) { renderChips(); renderRo1(); }
    const bad = st1.s.deficit || st1.s.Pv < 20 || st1.s.PAO2 <= 0;
    if (bad && !st1.warn) sndWarn();
    st1.warn = bad;
    request1();
    scheduleEmit();
  }
  function setScen(k) {
    const v = Object.assign({}, BASE, SCEN[k].v);
    const map = { alt: el.alt, pco2: el.pco2, ppm: el.ppm, hco3: el.hco3, temp: el.temp, bpg: el.bpg, hb: el.hb, dem: el.dem };
    for (const q in map) {
      if (window.LabNum) { window.LabNum.clear(map[q]); }
      map[q].value = String(v[q]);
    }
    sndClick(523);
    update1();
    setStatus('status', T(SCEN[k].zh + '：' + SCEN_TIP[k][0], SCEN[k].en + ': ' + SCEN_TIP[k][1]));
  }
  function setProt(t) {
    if (!PROT[t]) return;
    st1.type = t;
    sndClick(659);
    update1(); legend1();
    const tip = {
      A: ['成人血紅素：四個亞基合作，曲線是 S 形。', 'Adult haemoglobin: four subunits cooperate, so the curve is S-shaped.'],
      F: ['胎兒血紅素：和 2,3-BPG 結合較弱，曲線偏左，可以從母親的血裡搶到氧。', 'Fetal haemoglobin binds 2,3-BPG weakly; its curve sits to the left, so it can take oxygen from the mother’s blood.'],
      Mb: ['肌紅素：只有一條鏈，沒有協同作用，曲線是雙曲線，而且抓得很緊。', 'Myoglobin: a single chain with no cooperation, so the curve is a hyperbola, and it holds on tightly.']
    }[t];
    setStatus('status', T(tip[0], tip[1]));
  }
  function setProbe(P) {
    P = Math.round(Math.max(0, Math.min(XMAX, P)) * 10) / 10;
    if (window.LabNum) window.LabNum.set(el.probe, P);
    else { el.probe.value = String(P); update1(true); }
  }

  // 指標：點或拖曳圖上任何地方移動探針
  let dragging = false;
  function onPointer(ev) {
    const p = evPos(cv, ev);
    if (p[0] < L1.PL.x - 10 || p[0] > L1.PL.x + L1.PL.w + 10 || p[1] < L1.PL.y - 10 || p[1] > L1.PL.y + L1.PL.h + 10) return false;
    setProbe(pOfX(p[0]));
    sndProbe(st1.Sp);
    return true;
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (onPointer(ev)) { dragging = true; try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ } ev.preventDefault(); }
  });
  cv.addEventListener('pointermove', function (ev) { if (dragging) onPointer(ev); });
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    say(T('探針 ' + num(val(el.probe), 1) + ' mmHg，飽和度 ' + pct(st1.Sp), 'Probe ' + num(val(el.probe), 1) + ' mmHg, saturation ' + pct(st1.Sp)));
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  window.LabKeys && window.LabKeys.attach(cv, {
    label: T('氧解離曲線：左右鍵移動探針（Shift 一次 5 mmHg），讀出那個氧分壓下的飽和度。', 'Oxygen dissociation curve: left and right move the probe (Shift for 5 mmHg) and read the saturation at that oxygen pressure.'),
    items: [{
      name: T('探針', 'Probe'),
      move: function (dx, dy, big) { const d = dx || -dy; if (d) { setProbe(val(el.probe) + d * (big ? 5 : 0.5)); sndProbe(st1.Sp); } return !!d; },
      describe: function () { return T('探針 ' + num(val(el.probe), 1) + ' mmHg，飽和度 ' + pct(st1.Sp) + '。', 'Probe ' + num(val(el.probe), 1) + ' mmHg, saturation ' + pct(st1.Sp) + '.'); }
    }]
  });

  // =====================================================================
  // 二・MWC 族群
  // =====================================================================
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  const el2 = { p2: $('p2'), lL: $('lL'), lc: $('lc') };
  if (window.LabNum) {
    window.LabNum.register(el2.p2, {
      toValue: function (p) { return Math.pow(10, p / 100 - 1); }, toPos: function (v) { return 100 * (Math.log10(v) + 1); }, min: 0.1, max: 1000, decimals: 2
    });
    window.LabNum.register(el2.lL, {
      toValue: function (p) { return Math.pow(10, p / 100); }, toPos: function (v) { return 100 * Math.log10(Math.max(1, v)); }, min: 1, max: 1e8, decimals: 0
    });
    window.LabNum.register(el2.lc, {
      toValue: function (p) { return Math.pow(10, -p / 100); }, toPos: function (v) { return -100 * Math.log10(v); }, min: 1e-4, max: 1, decimals: 5
    });
    window.LabNum.set(el2.lL, O.MWC_HB.L);
    window.LabNum.set(el2.lc, O.MWC_HB.c);
  }
  const KR = O.MWC_HB.KR;
  const st2 = {
    P: 26.9, L: O.MWC_HB.L, c: O.MWC_HB.c, dist: null, pop: O.pop(NMOL, 20261112, RATE),
    pts: [], meas: null, ptNo: 0, fit: null
  };
  function vP() { return window.LabNum ? val(el2.p2) : Math.pow(10, +el2.p2.value / 100 - 1); }
  function vL() { return window.LabNum ? val(el2.lL) : Math.pow(10, +el2.lL.value / 100); }
  function vc() { return window.LabNum ? val(el2.lc) : Math.pow(10, -el2.lc.value / 100); }
  function theory(P) { return O.mwcY(P / KR, st2.L, st2.c); }
  function refreshDist() { st2.dist = O.mwcDist(st2.P / KR, st2.L, st2.c); }
  function refit() {
    const xs = [], ys = [];
    st2.pts.forEach(function (p) { if (p.Y >= 0.1 && p.Y <= 0.9) { xs.push(Math.log10(p.P)); ys.push(Math.log10(p.Y / (1 - p.Y))); } });
    st2.fit = xs.length >= 2 ? O.linfit(xs, ys) : null;
    if (st2.fit) { st2.fit.n = xs.length; st2.fit.x0 = Math.min.apply(null, xs); st2.fit.x1 = Math.max.apply(null, xs); }
  }
  function renderOutputs2() {
    $('p2o').textContent = sig(st2.P, 3);
    $('lLo').textContent = st2.L >= 1e6 ? sig(st2.L / 1e6, 3) + T(' 百萬', ' million') : sig(st2.L, 4);
    $('lco').textContent = sig(st2.c, 3);
  }
  function renderRo2() {
    const P50 = O.mwcA50(st2.L, st2.c) * KR, n = O.mwcN(st2.L, st2.c);
    const rows = [
      [SUBS.P50 + T('（理論）', ' (theory)'), sig(P50, 3) + ' mmHg', ''],
      ['Hill n' + T('（理論）', ' (theory)'), num(n, 2), n < 1.05 ? T('幾乎沒有協同作用', 'almost no cooperation') : ''],
      [T('現在的飽和度', 'Saturation now'), pct(theory(st2.P)), T('族群現在 ', 'population now ') + pct(st2.pop.mean())],
      [T('R 狀態的比例', 'Fraction in R'), pct(O.mwcR(st2.P / KR, st2.L, st2.c)), T('族群現在 ', 'population now ') + st2.pop.ms.filter(function (m) { return m.R; }).length + ' / ' + NMOL],
      [T('量過的點', 'Points measured'), String(st2.pts.length), st2.fit ? T('擬合用 ' + st2.fit.n + ' 點（飽和度 10%–90%）', st2.fit.n + ' used in the fit (saturation 10–90%)') : ''],
      [T('Hill 圖的斜率', 'Hill-plot slope'), st2.fit ? num(st2.fit.slope, 2) : '—',
        st2.fit ? T('和理論 n 差 ', 'differs from the theoretical n by ') + num(Math.abs(st2.fit.slope - n) / n * 100, 0) + '%' : T('量 2 個以上的點才算得出來', 'measure two or more points'), '']
    ];
    $('ro2').innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + (r[2] ? '<small>' + r[2] + '</small>' : '') + '</dd>'; }).join('');
  }
  function renderRows2() {
    const t = $('runs2');
    if (!st2.pts.length) { t.innerHTML = ''; return; }
    t.innerHTML = '<thead><tr><th>#</th><th>P<sub>O<sub>2</sub></sub> (mmHg)</th><th>' + T('量到的飽和度', 'Measured') + '</th><th>' + T('理論', 'Theory') + '</th></tr></thead><tbody>' +
      st2.pts.slice().reverse().map(function (p) {
        return '<tr><td>' + p.no + '</td><td>' + sig(p.P, 3) + '</td><td>' + pct(p.Y) + '</td><td>' + pct(p.Yth) + '</td></tr>';
      }).join('') + '</tbody>';
  }
  let emit2Timer = 0;
  function emitMwc() {
    clearTimeout(emit2Timer);
    emit2Timer = setTimeout(function () {
      emit('mwc', { L: st2.L, c: st2.c, P50: O.mwcA50(st2.L, st2.c) * KR, n: O.mwcN(st2.L, st2.c) });
    }, 200);
  }
  function onP2() {
    st2.P = vP();
    refreshDist();
    if (st2.meas) { st2.meas = { phase: 'wait', t0: st2.pop.t, acc: 0, T: 0, P: st2.P }; }
    renderOutputs2(); renderRo2(); request2(true);
  }
  function onLc() {
    const L = vL(), c = vc();
    if (L === st2.L && c === st2.c) return;
    st2.L = L; st2.c = c;
    refreshDist();
    const had = st2.pts.length > 0;
    st2.pts = []; st2.fit = null; st2.meas = null;
    renderOutputs2(); renderRo2(); renderRows2(); updateMeasBtn(); request2(true);
    if (had) setStatus('status2', T('換了 L 或 c，就是另一種分子：量過的點已清除。', 'A new L or c is a different molecule, so the measured points were cleared.'));
    emitMwc();
  }
  function startMeasure() {
    if (st2.meas) return;
    st2.meas = { phase: 'wait', t0: st2.pop.t, acc: 0, T: 0, P: st2.P };
    updateMeasBtn();
    setStatus('status2', T('等每個分子都重新平衡一次，再平均 2 秒…', 'Waiting until every molecule has re-equilibrated, then averaging for 2 s…'));
    request2(true);
  }
  function finishMeasure() {
    const m = st2.meas;
    const Y = m.acc / m.T;
    st2.meas = null;
    st2.ptNo++;
    const p = { no: st2.ptNo, P: m.P, Y: Y, Yth: theory(m.P) };
    st2.pts.push(p);
    while (st2.pts.length > MAX_PTS) st2.pts.shift();
    refit();
    renderRows2(); renderRo2(); updateMeasBtn(); sndMeasure(Y);
    setStatus('status2', T('P = ' + sig(m.P, 3) + ' mmHg：量到 ' + pct(Y) + '，理論 ' + pct(p.Yth) + '。', 'P = ' + sig(m.P, 3) + ' mmHg: measured ' + pct(Y) + ', theory ' + pct(p.Yth) + '.'));
    const valid = st2.pts.filter(function (q) { return q.Y >= 0.1 && q.Y <= 0.9; }).length;
    emit('mwc-meas', {
      L: st2.L, c: st2.c, P: m.P, Y: Y, Yth: p.Yth, pts: st2.pts.length, fitPts: valid,
      slope: st2.fit ? st2.fit.slope : null, nTh: O.mwcN(st2.L, st2.c), P50: O.mwcA50(st2.L, st2.c) * KR
    });
    request2(true);
  }
  function updateMeasBtn() {
    const b = $('measBtn');
    b.disabled = !!st2.meas;
    b.textContent = st2.meas ? T('量測中…', 'Measuring…') : T('量一次（平均 2 秒）', 'Measure (2 s average)');
  }
  /** 時間前進 dt 秒（族群與量測） */
  function tick2(dt) {
    st2.pop.step(dt, st2.dist);
    const m = st2.meas;
    if (!m) return;
    if (m.phase === 'wait') {
      if (st2.pop.settledSince(m.t0)) { m.phase = 'run'; m.acc = 0; m.T = 0; }
    } else {
      m.acc += st2.pop.mean() * dt; m.T += dt;
      if (m.T >= MEAS_T - 1e-9) finishMeasure();
    }
  }

  // ---------- 版面 ----------
  let W2 = 300, H2 = 460, L2 = null;
  function layout2() {
    W2 = cv2.clientWidth || 300;
    const narrow = W2 < 640;
    if (narrow) {
      const gw = W2 - 16, cell = gw / 8;
      const G = { x: 8, y: 44, w: gw, h: cell * 6, cell: cell, cols: 8 };
      const p1 = { x: 50, y: G.y + G.h + 36, w: W2 - 50 - 14, h: 170 };
      const p2 = { x: 50, y: p1.y + p1.h + 52, w: p1.w, h: 170 };
      H2 = p2.y + p2.h + 38;
      L2 = { narrow: true, G: G, p1: p1, p2: p2 };
    } else {
      H2 = 460;
      const gw = Math.min(W2 * 0.42, 400), cell = Math.min(gw / 6, (H2 - 56) / 8);
      const G = { x: 12, y: 44, w: cell * 6, h: cell * 8, cell: cell, cols: 6 };
      const x0 = G.x + G.w + 62;
      const p1 = { x: x0, y: 36, w: W2 - x0 - 18, h: 160 };
      const p2 = { x: x0, y: p1.y + p1.h + 58, w: p1.w, h: 160 };
      L2 = { narrow: false, G: G, p1: p1, p2: p2 };
    }
    fit(cv2, ctx2, H2);
  }
  const LX0 = -1, LX1 = 3;   // log10 P 從 0.1 到 1000 mmHg
  function lx(R, P) { return R.x + (Math.log10(P) - LX0) / (LX1 - LX0) * R.w; }
  function drawMolecule(g, m, cx, cy, s, t) {
    const u = reducedMotion ? 1 : Math.max(0, Math.min(1, (t - m.ch) / 0.35));
    const e = u * u * (3 - 2 * u);
    const r0 = m.pR ? 1 : 0, r1 = m.R ? 1 : 0, rr = r0 + (r1 - r0) * e;
    // 底色
    D.roundRect(g, cx - s / 2 + 2, cy - s / 2 + 2, s - 4, s - 4, s * 0.16);
    g.fillStyle = D.alpha(D.mix(C['oh-t'], C['oh-r'], rr), D.dark ? 0.18 : 0.11); g.fill();
    const q = s * 0.33, off = s * 0.19, ang = rr * 15 * Math.PI / 180;
    for (let i = 0; i < 4; i++) {
      const sx = i % 2 ? 1 : -1, sy = i < 2 ? -1 : 1;
      // α1β1 與 α2β2 兩個二聚體相對轉動（示意）
      const a = (i === 0 || i === 3) ? ang / 2 : -ang / 2;
      const x = cx + sx * off * Math.cos(a) - sy * off * Math.sin(a);
      const y = cy + sx * off * Math.sin(a) + sy * off * Math.cos(a);
      const b0 = i < m.pk, b1 = i < m.k;
      const bv = (b0 ? 1 : 0) + ((b1 ? 1 : 0) - (b0 ? 1 : 0)) * e;
      const col = D.mix(C['oh-dis'], C['oh-o2'], bv);
      const rad = q * (0.16 + 0.34 * rr);
      g.save();
      g.translate(x, y); g.rotate(a);
      D.roundRect(g, -q / 2, -q / 2, q, q, rad);
      const gr = g.createRadialGradient(-q * 0.2, -q * 0.25, q * 0.05, 0, 0, q * 0.75);
      gr.addColorStop(0, D.shade(col, 0.35)); gr.addColorStop(1, D.shade(col, -0.15));
      g.fillStyle = gr; g.fill();
      g.strokeStyle = D.alpha(D.shade(col, -0.45), 0.8); g.lineWidth = 1; g.stroke();
      g.restore();
    }
  }
  function axesLog(g, R, yLab, yTicks, yFmt, yMin, yMax) {
    panel(g, R.x - 6, R.y - 6, R.w + 12, R.h + 12);
    const yv = function (v) { return R.y + R.h * (1 - (v - yMin) / (yMax - yMin)); };
    g.lineWidth = 1;
    yTicks.forEach(function (v) {
      g.strokeStyle = D.alpha(D.c.border, 0.45);
      g.beginPath(); g.moveTo(R.x, yv(v)); g.lineTo(R.x + R.w, yv(v)); g.stroke();
      small(g, yFmt(v), R.x - 6, yv(v), D.c.muted, 'right');
    });
    for (let e = LX0; e <= LX1; e++) {
      const x = R.x + (e - LX0) / (LX1 - LX0) * R.w;
      g.strokeStyle = D.alpha(D.c.border, 0.45);
      g.beginPath(); g.moveTo(x, R.y); g.lineTo(x, R.y + R.h); g.stroke();
      small(g, e < 0 ? '0.1' : String(Math.pow(10, e)), x, R.y + R.h + 13, D.c.muted, 'center');
    }
    g.save(); g.translate(R.x - (L2.narrow ? 38 : 44), R.y + R.h / 2); g.rotate(-Math.PI / 2);
    small(g, yLab, 0, 0, D.c.muted, 'center'); g.restore();
    return yv;
  }
  function plotFn(g, R, f, yv, color, width, dash) {
    g.save();
    g.beginPath(); g.rect(R.x, R.y - 1, R.w, R.h + 2); g.clip();
    g.beginPath();
    const n = Math.round(R.w / 2);
    let on = false;
    for (let i = 0; i <= n; i++) {
      const P = Math.pow(10, LX0 + (LX1 - LX0) * i / n);
      const v = f(P);
      if (!isFinite(v)) { on = false; continue; }
      const x = lx(R, P), y = yv(v);
      if (on) g.lineTo(x, y); else { g.moveTo(x, y); on = true; }
    }
    g.setLineDash(dash || []); g.strokeStyle = color; g.lineWidth = width; g.lineJoin = 'round'; g.stroke();
    g.restore();
  }
  function draw2() {
    const g = ctx2, G = L2.G, t = st2.pop.t;
    g.clearRect(0, 0, W2, H2);
    D.backdrop(g, W2, H2);
    // 分子格
    const nR = st2.pop.ms.filter(function (m) { return m.R; }).length;
    let nk = 0; st2.pop.ms.forEach(function (m) { nk += m.k; });
    D.haloText(g, T(NMOL + ' 個血紅素分子', NMOL + ' haemoglobin molecules'), G.x + 4, 14, D.c.text, 'left', 'middle', '600 12px ' + FONT);
    small(g, T('R 狀態 ' + nR + ' 個・結合了 ' + nk + ' / ' + (4 * NMOL) + ' 個氧', nR + ' in R · ' + nk + ' of ' + (4 * NMOL) + ' sites hold oxygen'), G.x + 4, 31);
    panel(g, G.x - 4, G.y - 4, G.w + 8, G.h + 8);
    const cell = G.cell;
    st2.pop.ms.forEach(function (m, i) {
      const cx = G.x + (i % G.cols + 0.5) * cell, cy = G.y + (Math.floor(i / G.cols) + 0.5) * cell;
      drawMolecule(g, m, cx, cy, cell, t);
    });
    // 量測進度（窄版在分子格下方，寬版在上圖的上方）
    if (st2.meas) {
      const m = st2.meas;
      const R = L2.narrow ? { x: G.x, y: G.y + G.h + 12, w: G.w } : { x: L2.p1.x + L2.p1.w - 230, y: 8, w: 230 };
      const bw = R.w - 96;
      D.roundRect(g, R.x, R.y, bw, 8, 4); g.fillStyle = D.alpha(D.c.border, 0.6); g.fill();
      const u = m.phase === 'wait' ? 0 : m.T / MEAS_T;
      if (u > 0) { D.roundRect(g, R.x, R.y, Math.max(8, bw * u), 8, 4); g.fillStyle = D.c.accent; g.fill(); }
      small(g, m.phase === 'wait' ? T('等平衡…', 'settling…') : T('平均中 ', 'averaging ') + num(m.T, 1) + ' s', R.x + bw + 8, R.y + 4, D.c.accent, 'left');
    }
    // 上圖：飽和度
    const p1 = L2.p1;
    const yv1 = axesLog(g, p1, T('飽和度', 'Saturation'), [0, 0.5, 1], function (v) { return num(v * 100, 0) + '%'; }, 0, 1);
    plotFn(g, p1, function (P) { return O.mwcY(P / KR, O.MWC_HB.L, O.MWC_HB.c); }, yv1, C['oh-std'], 1.5, [6, 5]);
    plotFn(g, p1, function (P) { return O.mwcR(P / KR, st2.L, st2.c); }, yv1, C['oh-r'], 1.4, [2, 3]);
    plotFn(g, p1, theory, yv1, D.c.accent, 2.8);
    // 現在的氧分壓
    const xP = lx(p1, st2.P);
    g.save(); g.setLineDash([4, 3]); g.strokeStyle = D.alpha(D.c.text, 0.45); g.lineWidth = 1;
    g.beginPath(); g.moveTo(xP, p1.y); g.lineTo(xP, p1.y + p1.h); g.stroke(); g.restore();
    st2.pts.forEach(function (p) { D.ball(g, lx(p1, p.P), yv1(p.Y), 4.5, C['oh-o2'], { glow: 0 }); });
    g.beginPath(); g.arc(xP, yv1(st2.pop.mean()), 6, 0, Math.PI * 2); g.lineWidth = 2; g.strokeStyle = C['oh-o2']; g.stroke();
    small(g, T('氧分壓（mmHg，對數刻度）', 'Oxygen pressure (mmHg, log scale)'), p1.x + p1.w / 2, p1.y + p1.h + 28, D.c.muted, 'center');
    // 下圖：Hill 圖
    const p2 = L2.p2;
    const yv2 = axesLog(g, p2, 'log(Y/(1−Y))', [-3, -2, -1, 0, 1, 2, 3], function (v) { return num(v, 0); }, -3.2, 3.2);
    plotFn(g, p2, function (P) { return Math.log10(st2.c * P / KR); }, yv2, C['oh-t'], 1.2, [5, 4]);
    plotFn(g, p2, function (P) { return Math.log10(P / KR); }, yv2, C['oh-r'], 1.2, [5, 4]);
    plotFn(g, p2, function (P) { const y = theory(P); return Math.log10(y / (1 - y)); }, yv2, D.c.accent, 2.4);
    // 漸近線標籤
    const xa = p2.x + p2.w - 6;
    const Pa = Math.pow(10, LX1 - 0.08);
    const yT = yv2(Math.log10(st2.c * Pa / KR)), yR = yv2(Math.log10(Pa / KR));
    if (yT > p2.y + 8 && yT < p2.y + p2.h - 4) small(g, T('全部 T', 'all T'), xa, yT + 9, C['oh-t'], 'right');
    if (yR > p2.y + 8 && yR < p2.y + p2.h - 4) small(g, T('全部 R', 'all R'), xa - 50, yR - 9, C['oh-r'], 'right');
    // 量到的點與擬合線
    g.save(); g.beginPath(); g.rect(p2.x, p2.y, p2.w, p2.h); g.clip();
    if (st2.fit) {
      const f = st2.fit, xa0 = f.x0 - 0.15, xa1 = f.x1 + 0.15;
      g.strokeStyle = C['oh-o2']; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(lx(p2, Math.pow(10, xa0)), yv2(f.icpt + f.slope * xa0)); g.lineTo(lx(p2, Math.pow(10, xa1)), yv2(f.icpt + f.slope * xa1)); g.stroke();
    }
    st2.pts.forEach(function (p) {
      if (!(p.Y > 0 && p.Y < 1)) return;
      const inFit = p.Y >= 0.1 && p.Y <= 0.9;
      D.ball(g, lx(p2, p.P), yv2(Math.log10(p.Y / (1 - p.Y))), 4.5, inFit ? C['oh-o2'] : D.c.muted, { glow: 0 });
    });
    g.restore();
    const n = O.mwcN(st2.L, st2.c);
    let txt = T('理論 n = ', 'theory n = ') + num(n, 2);
    if (st2.fit) txt = T('擬合斜率 ', 'fitted slope ') + num(st2.fit.slope, 2) + '・' + txt;
    D.haloText(g, txt, p2.x + 8, p2.y + 12, D.c.text, 'left', 'middle', '600 11px ' + FONT);
    small(g, T('Hill 圖：斜率就是 Hill 係數 n', 'Hill plot: the slope is the Hill coefficient n'), p2.x + p2.w / 2, p2.y + p2.h + 28, D.c.muted, 'center');
  }

  // =====================================================================
  // 動畫迴圈（只有第二部分在畫面上或正在量測時才跑）
  // =====================================================================
  let raf2 = 0, last2 = 0, vis2 = true, ro2Time = 0;
  function request2(force) {
    if (raf2) return;
    if (!force && !vis2 && !st2.meas) return;
    raf2 = requestAnimationFrame(frame2);
  }
  function frame2(now) {
    raf2 = 0;
    const dt = last2 ? Math.min(0.1, (now - last2) / 1000) : 1 / 60;
    last2 = now;
    tick2(dt);
    if (view3 && view3.active) view3.frame(dt);
    else draw2();
    if (now - ro2Time > 250) { ro2Time = now; renderRo2(); }
    if ((vis2 || st2.meas) && !document.hidden) request2();
    else last2 = 0;
  }

  // =====================================================================
  // 3D：血紅素四聚體，切換時才載入
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage2'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    O: O, T: T, D: D,
    colors: function () { return C; },
    dist: function () { return st2.dist; },
    P: function () { return st2.P; },
    Lc: function () { return { L: st2.L, c: st2.c }; },
    request: function () { request2(true); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 族群。', 'The 3D graphics context was lost, so the view switched back to the 2D population.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.OH3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.OH3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/oxygen-hemoglobin-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.OH3D) throw new Error('oxygen-hemoglobin-3d.js did not load');
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
        view3 = window.OH3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        requestAnimationFrame(function () { if (view3) { view3.onShow(); request2(true); } });
        request2(true);
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
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 族群。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D population is kept.');
    resize2();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // =====================================================================
  // 事件綁定
  // =====================================================================
  ['alt', 'pco2', 'ppm', 'hco3', 'temp', 'bpg', 'hb', 'dem'].forEach(function (k) {
    el[k].addEventListener('input', function () { update1(); });
  });
  el.probe.addEventListener('input', function () { update1(true); });
  $('scens').addEventListener('click', function (ev) { const b = ev.target.closest('button[data-s]'); if (b) setScen(b.getAttribute('data-s')); });
  $('prots').addEventListener('click', function (ev) { const b = ev.target.closest('button[data-p]'); if (b) setProt(b.getAttribute('data-p')); });
  $('stdBtn').addEventListener('click', function () {
    setScen('rest');
    if (st1.type !== 'A') setProt('A');
    setStatus('status', T('回到標準狀態：海平面、pH 7.40、37 °C、2,3-BPG 5 mM，成人血紅素。', 'Back to normal: sea level, pH 7.40, 37 °C, 2,3-BPG 5 mM, adult haemoglobin.'));
  });
  $('keepBtn').addEventListener('click', keepCurve);
  $('clear1').addEventListener('click', function () {
    st1.kept = []; st1.rows = []; st1.keepNo = 0;
    renderRows1(); legend1(); request1();
    setStatus('status', T('已清除留下的曲線和紀錄表；設定沒有改變。', 'The kept curves and the table were cleared; the settings are unchanged.'));
  });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  el2.p2.addEventListener('input', onP2);
  el2.lL.addEventListener('input', onLc);
  el2.lc.addEventListener('input', onLc);
  $('measBtn').addEventListener('click', startMeasure);
  $('hbBtn').addEventListener('click', function () {
    if (window.LabNum) { window.LabNum.set(el2.lL, O.MWC_HB.L); window.LabNum.set(el2.lc, O.MWC_HB.c); }
    setStatus('status2', T('回到血紅素的值：L = 9000、c = 0.014。', 'Back to haemoglobin: L = 9000, c = 0.014.'));
  });
  $('clear2').addEventListener('click', function () {
    st2.pts = []; st2.fit = null; st2.ptNo = 0;
    renderRows2(); renderRo2(); request2(true);
    setStatus('status2', T('已清掉量過的點；設定沒有改變。', 'The measured points were cleared; the settings are unchanged.'));
  });
  window.LabKeys && window.LabKeys.attach(cv2, {
    label: T('血紅素族群：左右鍵改氧分壓（Shift 改得更多），Enter 量一次。', 'Haemoglobin population: left and right change the oxygen pressure (Shift for bigger steps); Enter measures.'),
    items: [{
      name: T('氧分壓', 'Oxygen pressure'),
      move: function (dx, dy, big) {
        const d = dx || -dy; if (!d) return false;
        const P = Math.pow(10, Math.log10(st2.P) + d * (big ? 0.2 : 0.02));
        if (window.LabNum) window.LabNum.set(el2.p2, Math.max(0.1, Math.min(1000, P)));
        return true;
      },
      describe: function () { return T('氧分壓 ' + sig(st2.P, 3) + ' mmHg，理論飽和度 ' + pct(theory(st2.P)) + '。', 'Oxygen pressure ' + sig(st2.P, 3) + ' mmHg, theoretical saturation ' + pct(theory(st2.P)) + '.'); }
    }]
  });
  cv2.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { ev.preventDefault(); startMeasure(); }
  });

  // ---------- 分享目前設定 ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { t: st1.type }; },
    set: function (o) { if (o && PROT[o.t]) { st1.type = o.t; update1(); legend1(); } }
  });

  // ---------- 圖例 ----------
  function legend1() {
    const ln = function (c, dash) { return '<i class="ln' + (dash ? ' dash' : '') + '" style="border-color:' + c + '"></i>'; };
    const dot = function (c) { return '<i class="dot" style="background:' + c + '"></i>'; };
    let h = '<span>' + ln(C[PROT[st1.type].col]) + T('動脈端（現在）', 'Arterial (now)') + '</span>' +
      '<span>' + ln(C['oh-ven'], true) + T('靜脈端（CO2 多、較酸）', 'Venous (more CO2, more acidic)') + '</span>' +
      '<span>' + ln(C['oh-std'], true) + T('標準 HbA', 'Standard HbA') + '</span>' +
      '<span>' + dot(C['oh-art']) + T('A 動脈血', 'A arterial blood') + '</span>' +
      '<span>' + dot(C['oh-ven']) + T('V 靜脈血', 'V venous blood') + '</span>';
    if (val(el.ppm) > 0) h += '<span><i class="sq" style="background:' + D.alpha(C['oh-co'], 0.4) + '"></i>' + T('被 CO 佔走', 'Taken by CO') + '</span>';
    st1.kept.forEach(function (k) { h += '<span>' + ln(C[k.color]) + T('留下的 ', 'Kept ') + k.no + '</span>'; });
    $('legend1').innerHTML = h;
  }
  function legend2() {
    const ln = function (c, dash) { return '<i class="ln' + (dash ? ' dash' : '') + '" style="border-color:' + c + '"></i>'; };
    const dot = function (c) { return '<i class="dot" style="background:' + c + '"></i>'; };
    $('legend2').innerHTML =
      '<span><i class="sq" style="background:' + D.alpha(C['oh-t'], 0.35) + '"></i>' + T('方形：T 狀態（緊）', 'Squares: T state (tense)') + '</span>' +
      '<span>' + dot(D.alpha(C['oh-r'], 0.5)) + T('圓形：R 狀態（鬆）', 'Circles: R state (relaxed)') + '</span>' +
      '<span>' + dot(C['oh-o2']) + T('結合了氧', 'Holds oxygen') + '</span>' +
      '<span>' + dot(C['oh-dis']) + T('空的', 'Empty') + '</span>' +
      '<span>' + ln(D.c.accent) + T('MWC 理論', 'MWC theory') + '</span>' +
      '<span>' + ln(C['oh-std'], true) + T('血紅素', 'Haemoglobin') + '</span>' +
      '<span>' + ln(C['oh-r'], true) + T('R 狀態的比例', 'Fraction in R') + '</span>';
  }

  // =====================================================================
  // 啟動
  // =====================================================================
  function resize1() { layout1(); request1(); }
  function resize2() { layout2(); if (!(view3 && view3.active)) draw2(); }
  readColors();
  st2.P = vP(); st2.L = vL(); st2.c = vc();
  refreshDist();
  st2.pop.init(st2.dist);
  layout1(); layout2();
  update1();
  renderOutputs2(); renderRo2(); renderRows2(); renderRows1();
  updateSoundButton(); updateMeasBtn();
  legend1(); legend2();
  function themeChanged() {
    readColors();
    if (view3 && view3.active) view3.onTheme();
    legend1(); legend2(); renderRows1();
    request1(); request2(true);
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:langchange', function () {
    renderChips(); renderRo1(); renderRows1(); renderOutputs2(); renderRo2(); renderRows2(); legend1(); legend2(); updateMeasBtn();
    request1(); request2(true);
  });
  setStatus('status', T('灰色虛線是標準狀態的成人血紅素。A 是離開肺的動脈血，V 是離開組織的靜脈血。點圖或拖曳移動探針，或選一個情境。', 'The grey dashed line is adult haemoglobin under standard conditions. A is arterial blood leaving the lungs, V is venous blood leaving the tissues. Tap or drag the graph to move the probe, or choose a scenario.'));
  setStatus('status2', T('每個分子不停地結合、放開氧，也在 T 和 R 之間切換。改氧分壓，按「量一次」記下族群的平均飽和度。', 'Each molecule keeps binding and releasing oxygen and switching between T and R. Change the oxygen pressure and press “Measure” to record the average saturation of the population.'));
  if (window.ResizeObserver) {
    const watch = function (c, fn) { let lw = 0; new ResizeObserver(function () { if (c.clientWidth && c.clientWidth !== lw) { lw = c.clientWidth; fn(); } }).observe(c); };
    watch(cv, resize1); watch(cv2, resize2);
  } else window.addEventListener('resize', function () { resize1(); resize2(); });
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (es) {
      vis2 = es.some(function (e) { return e.isIntersecting; });
      if (vis2) request2(true);
    }).observe(stage);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { last2 = 0; request2(true); } });
  request1(); request2(true);

  // 測試與縮圖用
  window.__oh = {
    O: O, st1: st1, st2: st2,
    scen: setScen, prot: setProt, probe: setProbe, keep: keepCurve,
    set: function (id, v) { const e = el[id] || el2[id]; if (e && window.LabNum) window.LabNum.set(e, v); },
    /** 立刻量一次（用同樣的族群模擬，時間步 1/60 s，不等動畫） */
    measureNow: function (P) {
      if (P != null && window.LabNum) window.LabNum.set(el2.p2, P);
      startMeasure();
      let guard = 0;
      while (st2.meas && guard++ < 100000) tick2(1 / 60);
      request2(true);
    },
    setView: setView, redraw: function () { request1(); request2(true); },
    state: function () { return st1.s; }
  };
})();
