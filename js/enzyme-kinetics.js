/* enzyme-kinetics.js — 「酵素動力學」的畫面與互動（計算全部在 enzyme-kinetics-core.js；3D 在 enzyme-kinetics-3d.js，切換時才載入） */
(function () {
  'use strict';
  const E = window.EnzymeCore;
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
  const NT = 5;            // 試管數
  const TMAX = 1200;       // 觀察 20 分鐘（模擬秒）
  const SPEED = 60;        // 畫面 1 秒 = 1 分鐘
  const TSCAN = [0, 80];   // 溫度掃描的範圍
  const KI_KNOWN = 1;      // 已知抑制劑的 Ki（mM，示意）
  const MAX_RUNS = 3;

  // =====================================================================
  // 顏色、數字
  // =====================================================================
  const C = {};
  const KEYS = ['ek-starch', 'ek-iodine', 'ek-protein', 'ek-clear', 'ek-glass', 'ek-cold', 'ek-hot', 'ek-good', 'ek-bad', 'ek-s0', 'ek-s1', 'ek-s2', 'ek-s3', 'ek-s4'];
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    KEYS.forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function sc(i) { return C['ek-s' + (i % 5)]; }
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
    return num(v, Math.min(d, 6));
  }
  function mmss(s) {
    if (s == null || !isFinite(s)) return '—';
    const m = Math.floor(s / 60), r = Math.round(s - 60 * m);
    return r === 60 ? (m + 1) + ':00' : m + ':' + (r < 10 ? '0' : '') + r;
  }
  function hex2rgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, f) {
    const A = hex2rgb(a), B2 = hex2rgb(b);
    return 'rgb(' + A.map(function (x, i) { return Math.round(x + (B2[i] - x) * f); }).join(',') + ')';
  }
  function enzName(k) { const e = E.ENZYMES[k]; return T(e.zh, e.en); }
  const TYPE_NAME = {
    none: ['不加', 'None'], competitive: ['競爭型', 'Competitive'], noncompetitive: ['非競爭型', 'Non-competitive'],
    uncompetitive: ['反競爭型', 'Uncompetitive'], mystery: ['神秘抑制劑', 'Mystery inhibitor'], mixed: ['混合型', 'Mixed']
  };
  function typeName(t) { const n = TYPE_NAME[t] || TYPE_NAME.none; return T(n[0], n[1]); }

  // =====================================================================
  // 共用
  // =====================================================================
  function sound() { const S0 = window.LabSound; return S0 && S0.enabled() ? S0 : null; }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  /** 一支試管完成：第 i 支音高不同（五聲音階） */
  function sndDone(i) {
    const S0 = sound(); if (!S0) return;
    const f = [523, 587, 659, 784, 880][i % 5];
    S0.tone({ freq: f, dur: 0.16, gain: 0.05, type: 'sine' });
  }
  function sndEnd(any) {
    const S0 = sound(); if (!S0) return;
    if (any) { S0.tone({ freq: 660, dur: 0.12, gain: 0.04 }); setTimeout(function () { S0.tone({ freq: 990, dur: 0.2, gain: 0.04 }); }, 110); }
    else S0.sweep({ from: 500, to: 300, dur: 0.25, gain: 0.04, type: 'triangle' });
  }
  function sndMeasure(v) {
    const S0 = sound(); if (!S0) return;
    S0.tone({ freq: 300 + Math.min(900, v * 9), dur: 0.08, gain: 0.04, type: 'triangle' });
  }
  function sndGuess(ok) {
    const S0 = sound(); if (!S0) return;
    if (ok) { [523, 659, 784].forEach(function (f, i) { setTimeout(function () { S0.tone({ freq: f, dur: 0.16, gain: 0.04 }); }, i * 110); }); }
    else S0.sweep({ from: 420, to: 260, dur: 0.3, gain: 0.04, type: 'sawtooth' });
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
  function title(g, s, x, y, col, align) { D.haloText(g, s, x, y, col || D.c.text, align || 'left', 'middle', '600 12px ' + FONT); }
  function small(g, s, x, y, col, align, base) { D.haloText(g, s, x, y, col || D.c.muted, align || 'left', base || 'middle', '11px ' + FONT); }
  function evPos(c, ev) { const r = c.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  /** 坐標軸與格線 */
  function axes(g, p, xt, yt, X, Y, xfmt, yfmt) {
    g.font = '11px ' + FONT; g.fillStyle = D.c.muted;
    g.textAlign = 'center'; g.textBaseline = 'top';
    xt.forEach(function (v) {
      const x = X(v);
      g.strokeStyle = D.alpha(D.c.text, 0.07); g.lineWidth = 1; g.beginPath(); g.moveTo(x, p.y0); g.lineTo(x, p.y1); g.stroke();
      g.fillText(xfmt(v), x, p.y1 + 5);
    });
    g.textAlign = 'right'; g.textBaseline = 'middle';
    yt.forEach(function (v) {
      const y = Y(v);
      g.strokeStyle = D.alpha(D.c.text, 0.07); g.beginPath(); g.moveTo(p.x0, y); g.lineTo(p.x1, y); g.stroke();
      g.fillText(yfmt(v), p.x0 - 5, y);
    });
    g.strokeStyle = D.alpha(D.c.text, 0.32); g.lineWidth = 1;
    g.beginPath(); g.moveTo(p.x0, p.y0); g.lineTo(p.x0, p.y1); g.lineTo(p.x1, p.y1); g.stroke();
  }
  function niceStep(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }
  function ticks(lo, hi, n) {
    const s = niceStep(hi - lo, n), out = [];
    for (let v = Math.ceil(lo / s) * s; v <= hi + 1e-9; v += s) out.push(+v.toFixed(10));
    return out;
  }

  // =====================================================================
  // 滑桿
  // =====================================================================
  const el = { tT: $('tT'), tpH: $('tpH'), ta: $('ta'), cS: $('cS'), cI: $('cI'), noise: $('noise') };
  if (window.LabNum) {
    // 受質濃度 0.05–50 mM（對數）
    window.LabNum.register(el.cS, {
      toValue: function (p) { return 0.05 * Math.pow(10, p / 200); },
      toPos: function (v) { return 200 * Math.log10(v / 0.05); }, min: 0.05, max: 50, decimals: 3
    });
  }
  function SV() { return val(el.cS); }
  function refreshOutputs() {
    $('tTo').textContent = num(val(el.tT), 0) + ' °C';
    $('tpHo').textContent = num(val(el.tpH), 1);
    $('tao').textContent = num(val(el.ta), 0);
    $('cSo').textContent = sig(SV(), 3);
    $('cIo').textContent = num(val(el.cI), 1);
    $('noiseo').textContent = num(val(el.noise), 1);
  }

  // =====================================================================
  // 一・五支試管
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W1 = 300, H1 = 470;
  let enzKey = 'amylase';
  let syncing = false;
  const tubes = [];
  for (let i = 0; i < NT; i++) tubes.push({ T: 37, pH: 6.8, end: Infinity });
  let sel = 0;
  const run = { on: false, t: 0, finished: false, started: false, doneMask: 0 };
  let scans = [];          // {enz, pH, ta, pts, Topt, max}
  let runs = [];           // 紀錄表：最近幾次
  let runNo = 0;

  function recompute() { tubes.forEach(function (tb) { tb.end = E.endTime(enzKey, tb.T, tb.pH); }); }
  function remainingOf(tb, t) { return E.remaining(enzKey, tb.T, tb.pH, t); }

  function renderEnzChips() {
    $('enzs').innerHTML = Object.keys(E.ENZYMES).map(function (k) {
      return '<button type="button" data-e="' + k + '" aria-pressed="' + (k === enzKey) + '">' + enzName(k) + '</button>';
    }).join('');
    const e = E.ENZYMES[enzKey];
    $('enzHint').textContent = T('在' + e.where.zh + '工作，最適 pH 約 ' + num(E.optPH(enzKey), 1) + '。', 'Works in the ' + e.where.en + '; best pH about ' + num(E.optPH(enzKey), 1) + '. ') +
      (e.sub === 'starch' ? T('受質：澱粉（加碘液，藍黑色退掉就是分解了）。', 'Substrate: starch (with iodine; the blue-black fades as it is digested).') :
        T('受質：煮熟蛋白的混濁液（變清就是分解了）。', 'Substrate: cloudy cooked egg white (it clears as it is digested).'));
  }
  function selectTube(i) {
    sel = Math.max(0, Math.min(NT - 1, i));
    syncing = true;
    if (window.LabNum) { window.LabNum.set(el.tT, tubes[sel].T); window.LabNum.set(el.tpH, tubes[sel].pH); }
    else { el.tT.value = tubes[sel].T; el.tpH.value = tubes[sel].pH; }
    syncing = false;
    $('tubeTitle').textContent = T('第 ' + (sel + 1) + ' 支試管', 'Tube ' + (sel + 1));
    refreshOutputs(); renderRo1(); request();
  }
  function tubeChanged() {
    if (syncing) return;
    const tb = tubes[sel];
    tb.T = val(el.tT); tb.pH = val(el.tpH);
    recompute();
    if (run.started) restartRun(run.on);
    refreshOutputs(); renderRo1(); request();
  }
  function restartRun(play) {
    run.t = 0; run.finished = false; run.doneMask = 0; run.on = !!play; run.started = !!play;
    updateRunBtn();
  }
  function updateRunBtn() {
    $('runBtn').textContent = run.on ? T('暫停', 'Pause') : run.finished ? T('再做一次', 'Run again') : run.started ? T('繼續', 'Resume') : T('開始反應', 'Start');
  }
  function startOrPause() {
    if (run.on) { run.on = false; updateRunBtn(); return; }
    if (run.finished || !run.started) { restartRun(true); }
    else run.on = true;
    if (reducedMotion) { finishRun(); return; }
    setStatus('status', T('反應進行中：畫面 1 秒 = 1 分鐘。', 'Reacting: one second on screen is one minute.'));
    updateRunBtn(); request();
  }
  function stepRun(dt) {
    if (!run.on) return false;
    run.t = Math.min(TMAX, run.t + dt * SPEED);
    tubes.forEach(function (tb, i) {
      if (!(run.doneMask & (1 << i)) && tb.end <= run.t) { run.doneMask |= 1 << i; sndDone(i); }
    });
    if (run.t >= TMAX) finishRun();
    return true;
  }
  function finishRun() {
    run.t = TMAX; run.on = false; run.finished = true; run.started = true;
    tubes.forEach(function (tb, i) { if (tb.end <= TMAX) run.doneMask |= 1 << i; });
    updateRunBtn();
    const data = { enzyme: enzKey, tubes: tubes.map(function (tb) { return { T: tb.T, pH: tb.pH, end: tb.end <= TMAX ? tb.end : null }; }) };
    const fin = data.tubes.filter(function (x) { return x.end != null; });
    sndEnd(fin.length > 0);
    runNo++;
    runs.unshift({ n: runNo, enz: enzKey, tubes: data.tubes });
    if (runs.length > MAX_RUNS) runs.length = MAX_RUNS;
    renderRows1();
    let best = -1;
    data.tubes.forEach(function (x, i) { if (x.end != null && (best < 0 || x.end < data.tubes[best].end)) best = i; });
    const msg = fin.length === 0 ? T('20 分鐘到了：五支試管都沒有完成反應。', '20 minutes are up: none of the five tubes finished.') :
      T('20 分鐘到了：' + fin.length + ' 支完成，最快的是第 ' + (best + 1) + ' 支（' + mmss(data.tubes[best].end) + '）。',
        '20 minutes are up: ' + fin.length + ' finished; the fastest was tube ' + (best + 1) + ' (' + mmss(data.tubes[best].end) + ').');
    setStatus('status', msg); say(msg);
    emit('run', data);
    renderRo1(); request();
  }
  function doScan() {
    const ta = val(el.ta) * 60, pH = tubes[sel].pH;
    const s = E.scanT(enzKey, pH, ta, TSCAN[0], TSCAN[1], 1);
    const prev = scans.map(function (q) { return { enzyme: q.enz, pH: q.pH, ta: q.ta, Topt: q.Topt }; });
    scans.push({ enz: enzKey, pH: pH, ta: ta, pts: s.pts, Topt: s.Topt, max: s.max });
    if (scans.length > 4) scans.shift();
    const S0 = sound(); if (S0) S0.sweep({ from: 300, to: 900, dur: 0.25, gain: 0.035, type: 'sine' });
    const msg = T('溫度掃描（' + enzName(enzKey) + '、pH ' + num(pH, 1) + '、每點 ' + num(ta / 60, 0) + ' 分鐘）：最適溫度約 ' + num(s.Topt, 1) + ' °C。',
      'Temperature scan (' + enzName(enzKey) + ', pH ' + num(pH, 1) + ', ' + num(ta / 60, 0) + ' min per point): best temperature about ' + num(s.Topt, 1) + ' °C.');
    setStatus('status', msg); say(msg);
    emit('tscan', { enzyme: enzKey, pH: pH, ta: ta, Topt: s.Topt, prev: prev });
    renderRo1(); request();
  }

  // ---------- 紀錄表 ----------
  function renderRows1() {
    const t = $('runs1');
    if (!runs.length) { t.innerHTML = ''; return; }
    let h = '<thead><tr><th>' + T('第幾次', 'Run') + '</th><th>' + T('酵素', 'Enzyme') + '</th>';
    for (let i = 0; i < NT; i++) h += '<th>' + T('第 ' + (i + 1) + ' 支', 'Tube ' + (i + 1)) + '</th>';
    h += '</tr></thead><tbody>';
    runs.forEach(function (r) {
      h += '<tr><td>' + r.n + '</td><td>' + enzName(r.enz) + '</td>';
      r.tubes.forEach(function (x) {
        h += '<td' + (x.end != null ? ' class="yes"' : ' class="no"') + '>' + num(x.T, 0) + ' °C・pH ' + num(x.pH, 1) + '：' + (x.end != null ? mmss(x.end) : T('沒完成', 'not done')) + '</td>';
      });
      h += '</tr>';
    });
    t.innerHTML = h + '</tbody>';
  }

  // ---------- 讀數 ----------
  function dl(id, rows) {
    $(id).innerHTML = rows.map(function (r) {
      return '<dt>' + r[0] + '</dt><dd' + (r[3] ? ' class="' + r[3] + '"' : '') + '>' + r[1] + (r[2] ? '<small>' + r[2] + '</small>' : '') + '</dd>';
    }).join('');
  }
  function renderRo1() {
    const tb = tubes[sel], e = E.ENZYMES[enzKey];
    const fA = E.activeFrac(enzKey, tb.T), L = E.lambda(enzKey, tb.T);
    const r0 = E.rate0(enzKey, tb.T, tb.pH) / e.k37;
    const half = L > 1e-12 ? Math.LN2 / L : Infinity;
    const rows = [
      [T('選取的試管', 'Selected tube'), T('第 ' + (sel + 1) + ' 支：', 'Tube ' + (sel + 1) + ': ') + num(tb.T, 0) + ' °C、pH ' + num(tb.pH, 1), ''],
      [T('剛開始的速率', 'Starting rate'), num(r0 * 100, r0 < 0.1 ? 1 : 0) + '%', T('相對於 37 °C、最適 pH', 'relative to 37 °C at the best pH')],
      [T('溫度的影響', 'Effect of temperature'), '× ' + sig(E.arrhenius(enzKey, tb.T), 3), T('Arrhenius：分子動得快', 'Arrhenius: molecules move faster')],
      [T('摺好的比例', 'Folded fraction'), num(fA * 100, fA > 0.995 ? 1 : 0) + '%', T('其餘暫時散開（可逆）', 'the rest is temporarily unfolded (reversible)'), fA < 0.5 ? 'bad' : ''],
      [T('pH 的影響', 'Effect of pH'), '× ' + sig(E.phFactor(enzKey, tb.pH), 3), T('最適 pH ', 'best pH ') + num(E.optPH(enzKey), 1)],
      [T('永久變性的半衰期', 'Half-life for permanent damage'), half > 360000 ? T('超過 100 小時', 'over 100 h') : half > 3600 ? sig(half / 3600, 2) + T(' 小時', ' h') : sig(half / 60, 2) + T(' 分鐘', ' min'), '', half < 1200 ? 'bad' : ''],
      [T('完成反應（剩 10%）', 'Finished (10% left)'), tb.end <= TMAX ? mmss(tb.end) : tb.end < Infinity ? mmss(tb.end) + T('（超過 20 分鐘）', ' (over 20 min)') : T('永遠做不完', 'never'),
        T('分:秒', 'min:s'), tb.end <= TMAX ? 'good' : 'bad']
    ];
    if (run.started) rows.push([T('經過時間', 'Time'), mmss(run.t) + ' / 20:00', '']);
    if (scans.length) {
      const q = scans[scans.length - 1];
      rows.push([T('最近一次溫度掃描', 'Latest temperature scan'), T('最適 ', 'best ') + num(q.Topt, 1) + ' °C', enzName(q.enz) + '・pH ' + num(q.pH, 1) + T('・每點 ', ' · ') + num(q.ta / 60, 0) + T(' 分鐘', ' min per point')]);
    }
    dl('ro1', rows);
  }

  // ---------- 版面 ----------
  function layout1() {
    if (W1 < 640) {
      return { narrow: true, rack: { x: 0, y: 0, w: W1, h: 250 }, prog: { x: 8, y: 256, w: W1 - 16, h: 196 }, scan: { x: 8, y: 460, w: W1 - 16, h: 210 } };
    }
    const rw = Math.round(W1 * 0.47);
    return { narrow: false, rack: { x: 0, y: 0, w: rw, h: H1 }, prog: { x: rw + 8, y: 8, w: W1 - rw - 16, h: H1 / 2 - 12 }, scan: { x: rw + 8, y: H1 / 2 + 4, w: W1 - rw - 16, h: H1 / 2 - 12 } };
  }
  function resize1() {
    W1 = cv.clientWidth || 300;
    H1 = W1 < 640 ? 680 : 470;
    fit(cv, ctx, H1);
    request();
  }
  let tubeHit = [];
  function tempColor(Tc) {
    // 0 °C 藍 → 37 °C 中性 → 90 °C 紅
    if (Tc <= 37) return mix(C['ek-cold'], D.dark ? '#3b4450' : '#e7edf2', Math.max(0, Tc) / 37);
    return mix(D.dark ? '#3b4450' : '#e7edf2', C['ek-hot'], Math.min(1, (Tc - 37) / 53));
  }
  function liquidColor(f) {
    // f = 剩下的受質比例
    if (E.ENZYMES[enzKey].sub === 'starch') return mix(C['ek-iodine'], C['ek-starch'], Math.pow(f, 0.6));
    return mix(C['ek-clear'], C['ek-protein'], Math.pow(f, 0.6));
  }
  function drawRack(R) {
    const g = ctx;
    const t = run.started ? run.t : 0;
    const n = NT, gap = R.w / n;
    const tw = Math.min(32, gap * 0.4), th = R.narrow ? 140 : Math.min(R.h * 0.56, 240);
    const top = R.y + (R.narrow ? 50 : Math.max(64, R.h * 0.16)), bathTop = top + th * 0.35, bathH = th * 0.65 + 8;
    tubeHit = [];
    title(ctx, T('水浴與試管', 'Water baths and tubes'), R.x + 12, R.y + 16);
    small(ctx, T('經過 ', 'Time ') + mmss(t) + ' / 20:00', R.x + R.w - 12, R.y + 16, D.c.text, 'right');
    for (let i = 0; i < n; i++) {
      const tb = tubes[i], cx = R.x + gap * (i + 0.5);
      // 水浴（燒杯）
      const bw = Math.min(gap - 8, tw * 2.3), bx = cx - bw / 2;
      const bcol = tempColor(tb.T);
      g.save();
      D.roundRect(g, bx, bathTop, bw, bathH, 6);
      const gb = g.createLinearGradient(0, bathTop, 0, bathTop + bathH);
      gb.addColorStop(0, D.alpha(bcol, 0.35)); gb.addColorStop(1, D.alpha(bcol, 0.7));
      g.fillStyle = gb; g.fill();
      g.strokeStyle = D.alpha(C['ek-glass'], 0.9); g.lineWidth = 1.2; g.stroke();
      g.restore();
      // 蒸氣或冰
      if (tb.T >= 60) {
        g.strokeStyle = D.alpha(D.c.muted, 0.5); g.lineWidth = 1.2;
        for (let k = -1; k <= 1; k++) {
          const sx = cx + k * bw * 0.28, ph = (performance.now() / 600 + i + k) % 1;
          g.beginPath(); g.moveTo(sx, bathTop - 4 - ph * 6);
          g.bezierCurveTo(sx - 4, bathTop - 12 - ph * 6, sx + 4, bathTop - 18 - ph * 6, sx, bathTop - 26 - ph * 6); g.stroke();
        }
      } else if (tb.T <= 5) {
        g.fillStyle = D.alpha('#ffffff', D.dark ? 0.35 : 0.8);
        [[-0.3, 0.2], [0.25, 0.35], [0.05, 0.6]].forEach(function (q) { g.fillRect(cx + q[0] * bw - 4, bathTop + q[1] * bathH - 4, 8, 8); });
      }
      // 試管
      const tx = cx - tw / 2, ty = top, tH = th, rb = tw / 2;
      const f = remainingOf(tb, t);
      const lq = ty + tH * 0.3;
      g.save();
      g.beginPath();
      g.moveTo(tx, ty); g.lineTo(tx, ty + tH - rb); g.arc(cx, ty + tH - rb, rb, Math.PI, 0, true); g.lineTo(tx + tw, ty);
      g.closePath();
      g.save(); g.clip();
      const lc = liquidColor(f);
      const gl = g.createLinearGradient(tx, 0, tx + tw, 0);
      gl.addColorStop(0, D.shade(lc, 0.12)); gl.addColorStop(0.45, lc); gl.addColorStop(1, D.shade(lc, -0.2));
      g.fillStyle = gl; g.fillRect(tx, lq, tw, ty + tH - lq + 1);
      // 混濁的顆粒（蛋白液）
      if (E.ENZYMES[enzKey].sub === 'protein' && f > 0.05) {
        g.fillStyle = D.alpha('#ffffff', 0.35 * f);
        for (let k = 0; k < 14; k++) g.fillRect(tx + ((k * 37) % 23) / 23 * tw, lq + ((k * 53) % 41) / 41 * (tH - tH * 0.3), 2, 2);
      }
      // 玻璃的反光
      g.fillStyle = D.alpha('#ffffff', D.dark ? 0.12 : 0.35); g.fillRect(tx + tw * 0.18, ty + 4, tw * 0.12, tH - rb - 6);
      g.restore();
      g.strokeStyle = D.alpha(C['ek-glass'], 1); g.lineWidth = 1.6; g.stroke();
      g.restore();
      // 管口
      g.fillStyle = D.alpha(C['ek-glass'], 0.9); D.roundRect(g, tx - 3, ty - 4, tw + 6, 5, 2); g.fill();
      // 選取框
      if (i === sel) {
        g.save(); g.setLineDash([4, 3]); g.strokeStyle = D.c.accent || '#0f766e'; g.lineWidth = 2;
        D.roundRect(g, cx - gap / 2 + 3, top - 30, gap - 6, th + 104, 10); g.stroke(); g.restore();
      }
      // 標籤
      D.haloText(g, String(i + 1), cx, top - 18, sc(i), 'center', 'middle', '700 13px ' + FONT);
      const ly = top + th + 24;
      small(g, num(tb.T, 0) + ' °C', cx, ly, D.c.text, 'center');
      small(g, 'pH ' + num(tb.pH, 1), cx, ly + 15, D.c.text, 'center');
      const done = tb.end <= t && run.started;
      const lab = !run.started ? '' : done ? '✓ ' + mmss(tb.end) : (run.finished ? T('沒完成', 'not done') : '…');
      if (lab) D.haloText(g, lab, cx, ly + 33, done ? C['ek-good'] : run.finished ? C['ek-bad'] : D.c.muted, 'center', 'middle', '600 12px ' + FONT);
      tubeHit.push({ x0: cx - gap / 2, x1: cx + gap / 2, y0: top - 34, y1: ly + 50 });
    }
  }
  function drawProg(R) {
    const g = ctx;
    panel(g, R.x, R.y, R.w, R.h);
    title(g, T('受質剩下多少', 'Substrate left'), R.x + 12, R.y + 16);
    const p = { x0: R.x + 44, y0: R.y + 32, x1: R.x + R.w - 12, y1: R.y + R.h - 24 };
    const X = function (s) { return p.x0 + s / TMAX * (p.x1 - p.x0); };
    const Y = function (f) { return p.y1 - f * (p.y1 - p.y0); };
    axes(g, p, [0, 5, 10, 15, 20].map(function (m) { return m * 60; }), [0, 0.5, 1], X, Y,
      function (s) { return (s / 60) + (s === TMAX ? T(' 分', ' min') : ''); }, function (f) { return num(f * 100, 0) + '%'; });
    g.setLineDash([5, 4]); g.strokeStyle = D.alpha(C['ek-good'], 0.8); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(p.x0, Y(0.1)); g.lineTo(p.x1, Y(0.1)); g.stroke(); g.setLineDash([]);
    small(g, T('完成（剩 10%）', 'done (10% left)'), p.x1 - 2, Y(0.1) - 8, C['ek-good'], 'right');
    const tEnd = run.started ? run.t : 0;
    tubes.forEach(function (tb, i) {
      g.strokeStyle = sc(i); g.lineWidth = i === sel ? 3 : 1.8;
      g.beginPath();
      const n = 120;
      for (let k = 0; k <= n; k++) {
        const s = tEnd * k / n, x = X(s), y = Y(remainingOf(tb, s));
        if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      if (tEnd > 0) D.ball(g, X(tEnd), Y(remainingOf(tb, tEnd)), i === sel ? 4.5 : 3.2, sc(i));
    });
    if (!run.started) small(g, T('按「開始反應」', 'Press “Start”'), (p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, D.c.muted, 'center');
  }
  function drawScan(R) {
    const g = ctx;
    panel(g, R.x, R.y, R.w, R.h);
    title(g, T('溫度掃描：平均速率', 'Temperature scan: average rate'), R.x + 12, R.y + 16);
    const p = { x0: R.x + 44, y0: R.y + 32, x1: R.x + R.w - 12, y1: R.y + R.h - 24 };
    let ymax = 1;
    scans.forEach(function (q) { ymax = Math.max(ymax, q.max * 1.12); });
    const X = function (Tc) { return p.x0 + (Tc - TSCAN[0]) / (TSCAN[1] - TSCAN[0]) * (p.x1 - p.x0); };
    const Y = function (a) { return p.y1 - a / ymax * (p.y1 - p.y0); };
    axes(g, p, [0, 20, 40, 60, 80], ticks(0, ymax, 3), X, Y, function (v) { return v + (v === 80 ? ' °C' : ''); }, function (v) { return num(v * 100, 0) + '%'; });
    // 選取試管的溫度
    const xs = X(Math.min(TSCAN[1], tubes[sel].T));
    g.setLineDash([3, 3]); g.strokeStyle = D.alpha(sc(sel), 0.8); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(xs, p.y0); g.lineTo(xs, p.y1); g.stroke(); g.setLineDash([]);
    const sty = ['#5b6b7a', '#8b5cf6', '#b45309', '#0e7490'];
    scans.forEach(function (q, k) {
      const col = D.dark ? D.shade(sty[k % 4], 0.45) : sty[k % 4];
      g.strokeStyle = col; g.lineWidth = k === scans.length - 1 ? 2.6 : 1.6;
      g.beginPath();
      q.pts.forEach(function (pt, j) { const x = X(pt[0]), y = Y(pt[1]); if (j) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
      const xo = X(q.Topt), yo = Y(q.max);
      D.ball(g, xo, yo, 4, col);
      const lab = num(q.ta / 60, 0) + T(' 分：', ' min: ') + num(q.Topt, 1) + '°';
      small(g, lab, xo + (xo > p.x1 - 90 ? -8 : 8), yo - 10 - 0 * k, col, xo > p.x1 - 90 ? 'right' : 'left');
    });
    if (!scans.length) small(g, T('按「溫度掃描」', 'Press “Temperature scan”'), (p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, D.c.muted, 'center');
    else small(g, enzName(scans[scans.length - 1].enz) + '・pH ' + num(scans[scans.length - 1].pH, 1), p.x1, R.y + 16, D.c.muted, 'right');
  }
  function draw1() {
    if (view3 && view3.active) return;
    const g = ctx;
    g.clearRect(0, 0, W1, H1);
    D.backdrop && D.backdrop(g, W1, H1);
    const L = layout1();
    L.rack.narrow = L.narrow;
    drawRack(L.rack);
    drawProg(L.prog);
    drawScan(L.scan);
  }
  cv.addEventListener('pointerdown', function (ev) {
    const p = evPos(cv, ev);
    for (let i = 0; i < tubeHit.length; i++) {
      const h = tubeHit[i];
      if (p[0] >= h.x0 && p[0] <= h.x1 && p[1] >= h.y0 && p[1] <= h.y1) { selectTube(i); say(T('選了第 ' + (i + 1) + ' 支試管', 'Tube ' + (i + 1) + ' selected')); return; }
    }
  });
  window.LabKeys && window.LabKeys.attach(cv, {
    label: T('試管畫布：左右鍵換試管，上下鍵改溫度（Shift 一次 10 °C）。', 'Tube canvas: left and right choose a tube, up and down change its temperature (Shift for 10 °C).'),
    items: [{
      name: T('試管', 'Tubes'),
      move: function (dx, dy, big) {
        if (dx) selectTube((sel + dx + NT) % NT);
        if (dy && window.LabNum) window.LabNum.set(el.tT, val(el.tT) - dy * (big ? 10 : 1));
      },
      describe: function () { return T('第 ' + (sel + 1) + ' 支試管：', 'Tube ' + (sel + 1) + ': ') + num(tubes[sel].T, 0) + ' °C、pH ' + num(tubes[sel].pH, 1) + '。'; }
    }]
  });

  // =====================================================================
  // 二・神秘酵素
  // =====================================================================
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  let W2 = 300, H2 = 420;
  const st2 = { seed: 1, inh: 'none', pts: [], nMeas: 0, revealed: false, guessed: false, streak: 0, lastGuess: null };
  let sample = E.sample(1), myst = E.mystery(1);
  function trueParams(inh, I) {
    if (inh === 'mystery') return { Vmax: sample.Vmax, Km: sample.Km, type: myst.type, I: I, Ki: myst.Ki };
    return { Vmax: sample.Vmax, Km: sample.Km, type: inh, I: I, Ki: KI_KNOWN };
  }
  function keyOf(inh, I) { return inh === 'none' || I <= 0 ? 'none' : inh + '@' + num(I, 2); }
  function series() {
    const map = {}, order = [];
    st2.pts.forEach(function (p) {
      if (!map[p.key]) { map[p.key] = { key: p.key, inh: p.key === 'none' ? 'none' : p.inh, I: p.key === 'none' ? 0 : p.I, pts: [], noise: Infinity }; order.push(p.key); }
      map[p.key].pts.push(p); map[p.key].noise = Math.min(map[p.key].noise, p.noise);
    });
    order.sort(function (a, b) { return a === 'none' ? -1 : b === 'none' ? 1 : 0; });
    return order.map(function (k, i) { const s = map[k]; s.fit = E.lbFit(s.pts); s.color = sc(i); return s; });
  }
  function renderInhChips() {
    $('inhs').innerHTML = ['none', 'competitive', 'noncompetitive', 'uncompetitive', 'mystery'].map(function (k) {
      return '<button type="button" data-i="' + k + '" aria-pressed="' + (k === st2.inh) + '">' + typeName(k) + '</button>';
    }).join('');
    $('guessBox').hidden = st2.inh !== 'mystery';
    $('guessChips').innerHTML = ['competitive', 'noncompetitive', 'uncompetitive'].map(function (k) {
      return '<button type="button" data-g="' + k + '">' + typeName(k) + '</button>';
    }).join('');
    $('guessText').textContent = st2.guessed ? T('這個神秘抑制劑已經猜過了；按「換一個酵素」再挑戰。', 'You have already guessed this mystery inhibitor; press “New mystery enzyme” to try again.') :
      T('它是哪一種？先量沒加和加了神秘抑制劑的點（各 4 個以上比較有把握），比較兩條直線再猜。', 'Which kind is it? Measure points without and with the mystery inhibitor (at least 4 of each to be sure), compare the two lines, then guess.');
  }
  function measure() {
    const inh = st2.inh, I = inh === 'none' ? 0 : val(el.cI), S = SV(), noise = val(el.noise) / 100;
    const p = trueParams(inh, I);
    st2.nMeas++;
    const r = E.rng(st2.seed * 100003 + st2.nMeas * 7 + 1);
    const v = E.measure(S, p, noise, r);
    const key = keyOf(inh, I);
    st2.pts.push({ S: S, v: v, inh: inh, I: I, key: key, noise: noise });
    sndMeasure(v);
    const app = E.apparent(p);
    emit('measure', { S: S, v: v, Km: sample.Km, Vmax: sample.Vmax, type: inh === 'mystery' ? myst.type : inh, mystery: inh === 'mystery', I: I, Ki: p.Ki, noise: noise, appKm: app.Km, appVmax: app.Vmax });
    const ss = series(), s = ss.find(function (q) { return q.key === key; }), s0 = ss.find(function (q) { return q.key === 'none'; });
    if (s && s.fit && s.fit.Vmax) {
      emit('fit', {
        key: key, type: key === 'none' ? 'none' : (inh === 'mystery' ? myst.type : inh), mystery: inh === 'mystery', I: I, n: s.pts.length, noise: s.noise,
        Km: s.fit.Km, Vmax: s.fit.Vmax, slope: s.fit.slope, icpt: s.fit.icpt, trueKm: app.Km, trueVmax: app.Vmax,
        n0: s0 ? s0.pts.length : 0, slope0: s0 && s0.fit ? s0.fit.slope : null, icpt0: s0 && s0.fit ? s0.fit.icpt : null
      });
    }
    setStatus('status2', T('[S] = ' + sig(S, 3) + ' mM：初速度 ' + sig(v, 3) + ' µM/min。', '[S] = ' + sig(S, 3) + ' mM: initial rate ' + sig(v, 3) + ' µM/min.'));
    renderRows2(); renderRo2(); request();
  }
  function guess(type) {
    if (st2.guessed) { renderInhChips(); return; }
    const ss = series();
    const n0 = (ss.find(function (q) { return q.key === 'none'; }) || { pts: [] }).pts.length;
    let n1 = 0, nz = Infinity;
    ss.forEach(function (q) { if (q.inh === 'mystery' && q.key !== 'none') { n1 += q.pts.length; nz = Math.min(nz, q.noise); } });
    ss.forEach(function (q) { if (q.key === 'none') nz = Math.min(nz, q.noise); });
    const ok = type === myst.type;
    const qual = ok && n0 >= 4 && n1 >= 4 && nz >= 0.05 - 1e-9;
    st2.streak = ok ? (qual ? st2.streak + 1 : st2.streak) : 0;
    st2.guessed = true;
    st2.lastGuess = { type: type, ok: ok };
    sndGuess(ok);
    emit('guess', { correct: ok, n0: n0, n1: n1, noise: isFinite(nz) ? nz : 0, streak: st2.streak, guess: type, truth: myst.type });
    const msg = ok ? T('答對了！它是' + typeName(myst.type) + '抑制劑（Ki ≈ ' + sig(myst.Ki, 2) + ' mM）。連續答對：' + st2.streak + '。', 'Correct! It is ' + typeName(myst.type).toLowerCase() + ' (Ki ≈ ' + sig(myst.Ki, 2) + ' mM). Streak: ' + st2.streak + '.') :
      T('可惜，它其實是' + typeName(myst.type) + '抑制劑。連續答對歸零。', 'Not quite: it is actually ' + typeName(myst.type).toLowerCase() + '. The streak is reset.');
    setStatus('status2', msg); say(msg);
    renderInhChips(); renderRo2(); request();
  }
  function newEnzyme() {
    st2.seed++;
    sample = E.sample(st2.seed); myst = E.mystery(st2.seed);
    st2.pts = []; st2.nMeas = 0; st2.revealed = false; st2.guessed = false;
    $('revealBtn').setAttribute('aria-pressed', 'false');
    $('revealBtn').textContent = T('揭曉答案', 'Show the answer');
    renderInhChips(); renderRows2(); renderRo2(); request();
    setStatus('status2', T('換了第 ' + st2.seed + ' 號神秘酵素：Km、Vmax 都不知道，量量看。', 'Mystery enzyme no. ' + st2.seed + ': Km and Vmax are unknown — measure them.'));
  }
  function renderRows2() {
    const t = $('runs2');
    if (!st2.pts.length) { t.innerHTML = ''; return; }
    let h = '<thead><tr><th>#</th><th>' + T('抑制劑', 'Inhibitor') + '</th><th>[I]（mM）</th><th>[S]（mM）</th><th>v（µM/min）</th><th>1/[S]</th><th>1/v</th></tr></thead><tbody>';
    st2.pts.slice().reverse().slice(0, 30).forEach(function (p, k) {
      h += '<tr><td>' + (st2.pts.length - k) + '</td><td>' + typeName(p.key === 'none' ? 'none' : p.inh) + '</td><td>' + num(p.I, 1) + '</td><td>' + sig(p.S, 3) +
        '</td><td>' + sig(p.v, 3) + '</td><td>' + sig(1 / p.S, 3) + '</td><td>' + sig(1 / p.v, 3) + '</td></tr>';
    });
    t.innerHTML = h + '</tbody>';
  }
  function renderRo2() {
    const ss = series();
    const rows = [[T('神秘酵素', 'Mystery enzyme'), T('第 ' + st2.seed + ' 號', 'No. ' + st2.seed), T('量了 ', 'points measured: ') + st2.pts.length + T(' 個點', '')]];
    ss.forEach(function (s) {
      const name = s.key === 'none' ? T('沒加抑制劑', 'No inhibitor') : typeName(s.inh) + '・[I] = ' + num(s.I, 1) + ' mM';
      rows.push([name, s.fit && s.fit.Vmax ? 'K<sub>m</sub> ≈ ' + sig(s.fit.Km, 3) + ' mM' : T('至少 2 個點才能擬合', 'needs 2 points to fit'),
        s.fit && s.fit.Vmax ? 'V<sub>max</sub> ≈ ' + sig(s.fit.Vmax, 3) + ' µM/min・' + T('點數 ', 'points ') + s.pts.length : (s.fit ? T('直線往下斜：再多量幾點', 'the line slopes the wrong way: measure more') : '')]);
    });
    if (st2.inh !== 'none' && st2.inh !== 'mystery') rows.push(['K<sub>i</sub>', KI_KNOWN + ' mM', T('這個抑制劑的解離常數（示意）', 'dissociation constant of this inhibitor (illustrative)')]);
    if (st2.revealed) {
      rows.push([T('答案', 'Answer'), 'K<sub>m</sub> = ' + sig(sample.Km, 3) + ' mM', 'V<sub>max</sub> = ' + sig(sample.Vmax, 3) + ' µM/min', 'good']);
      if (st2.inh === 'mystery' || st2.guessed) rows.push([T('神秘抑制劑', 'Mystery inhibitor'), typeName(myst.type), 'K<sub>i</sub> = ' + sig(myst.Ki, 3) + ' mM', 'good']);
    }
    if (st2.streak) rows.push([T('連續答對', 'Streak'), String(st2.streak), T('誤差 5% 以上、兩組各 4 點以上才算', 'counts with error ≥ 5% and at least 4 points in each set')]);
    dl('ro2', rows);
  }
  function layout2() {
    if (W2 < 640) return { a: { x: 8, y: 8, w: W2 - 16, h: 300 }, b: { x: 8, y: 316, w: W2 - 16, h: 300 } };
    const w = (W2 - 24) / 2;
    return { a: { x: 8, y: 8, w: w, h: H2 - 16 }, b: { x: 16 + w, y: 8, w: w, h: H2 - 16 } };
  }
  function resize2() { W2 = cv2.clientWidth || 300; H2 = W2 < 640 ? 624 : 420; fit(cv2, ctx2, H2); request(); }
  function drawMM(R, ss) {
    const g = ctx2;
    panel(g, R.x, R.y, R.w, R.h);
    title(g, T('初速度 v 對受質濃度 [S]', 'Initial rate v against [S]'), R.x + 12, R.y + 16);
    const p = { x0: R.x + 48, y0: R.y + 44, x1: R.x + R.w - 14, y1: R.y + R.h - 30 };
    let smax = 10, vmax = 20;
    st2.pts.forEach(function (q) { smax = Math.max(smax, q.S * 1.08); vmax = Math.max(vmax, q.v * 1.15); });
    ss.forEach(function (s) { if (s.fit && s.fit.Vmax && s.fit.Vmax < 400) vmax = Math.max(vmax, s.fit.Vmax * 1.1); });
    if (st2.revealed) vmax = Math.max(vmax, sample.Vmax * 1.1);
    smax = Math.min(52, smax);
    const X = function (s) { return p.x0 + s / smax * (p.x1 - p.x0); };
    const Y = function (v) { return p.y1 - v / vmax * (p.y1 - p.y0); };
    axes(g, p, ticks(0, smax, 5), ticks(0, vmax, 4), X, Y, function (v) { return sig(v, 2); }, function (v) { return sig(v, 2); });
    small(g, '[S]（mM）', p.x1, p.y1 - 10, D.c.muted, 'right');
    small(g, 'µM/min', p.x0 + 4, p.y0 - 8, D.c.muted, 'left');
    // 目前的 [S]
    const xs = X(Math.min(smax, SV()));
    g.setLineDash([3, 3]); g.strokeStyle = D.alpha(D.c.text, 0.35); g.lineWidth = 1;
    g.beginPath(); g.moveTo(xs, p.y0); g.lineTo(xs, p.y1); g.stroke(); g.setLineDash([]);
    // 答案
    if (st2.revealed) {
      g.setLineDash([6, 4]); g.strokeStyle = D.alpha(C['ek-good'], 0.8); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(p.x0, Y(sample.Vmax)); g.lineTo(p.x1, Y(sample.Vmax)); g.stroke(); g.setLineDash([]);
      small(g, 'V' + T('max（答案）', 'max (answer)'), p.x1 - 2, Y(sample.Vmax) - 8, C['ek-good'], 'right');
    }
    ss.forEach(function (s) {
      if (s.fit && s.fit.Vmax) {
        g.strokeStyle = D.alpha(s.color, 0.85); g.lineWidth = 2;
        g.beginPath();
        for (let k = 0; k <= 100; k++) { const S = smax * k / 100, x = X(S), y = Y(E.mm(S, s.fit.Vmax, s.fit.Km)); if (k) g.lineTo(x, y); else g.moveTo(x, y); }
        g.stroke();
      }
      s.pts.forEach(function (q) { D.ball(g, X(q.S), Math.max(p.y0, Y(q.v)), 4.2, s.color); });
    });
    if (!st2.pts.length) small(g, T('選一個 [S]，按「量一次初速度」', 'Choose [S] and press “Measure the initial rate”'), (p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, D.c.muted, 'center');
  }
  function drawLB(R, ss) {
    const g = ctx2;
    panel(g, R.x, R.y, R.w, R.h);
    title(g, T('雙倒數圖（Lineweaver–Burk）', 'Double-reciprocal plot (Lineweaver–Burk)'), R.x + 12, R.y + 16);
    const p = { x0: R.x + 52, y0: R.y + 44, x1: R.x + R.w - 14, y1: R.y + R.h - 30 };
    let xmax = 2, ymax = 0.1, xmin = 0;
    st2.pts.forEach(function (q) { xmax = Math.max(xmax, 1 / q.S * 1.08); ymax = Math.max(ymax, 1 / q.v * 1.12); });
    ss.forEach(function (s) { if (s.fit && s.fit.Km) xmin = Math.min(xmin, -1.25 / s.fit.Km); });
    xmin = Math.max(xmin, -xmax * 0.6);
    if (xmin === 0) xmin = -xmax * 0.25;
    const X = function (x) { return p.x0 + (x - xmin) / (xmax - xmin) * (p.x1 - p.x0); };
    const Y = function (y) { return p.y1 - y / ymax * (p.y1 - p.y0); };
    axes(g, p, ticks(xmin, xmax, 5), ticks(0, ymax, 4), X, Y, function (v) { return sig(v, 2); }, function (v) { return sig(v, 2); });
    // 縱軸（x = 0）
    g.strokeStyle = D.alpha(D.c.text, 0.45); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(X(0), p.y0); g.lineTo(X(0), p.y1); g.stroke();
    small(g, '1/[S]（1/mM）', p.x1, p.y1 - 10, D.c.muted, 'right');
    small(g, '1/v', X(0) + 5, p.y0 - 8, D.c.muted, 'left');
    g.save(); g.beginPath(); g.rect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0); g.clip();
    ss.forEach(function (s) {
      if (s.fit) {
        g.strokeStyle = D.alpha(s.color, 0.85); g.lineWidth = 2;
        g.beginPath(); g.moveTo(X(xmin), Y(s.fit.slope * xmin + s.fit.icpt)); g.lineTo(X(xmax), Y(s.fit.slope * xmax + s.fit.icpt)); g.stroke();
      }
      s.pts.forEach(function (q) { D.ball(g, X(1 / q.S), Y(1 / q.v), 4.2, s.color); });
    });
    g.restore();
    // 截距的標示（只標最新的一條）
    const s = ss.length ? ss[ss.length - 1] : null;
    if (s && s.fit && s.fit.Vmax) {
      const yi = Y(s.fit.icpt), xi = X(-1 / s.fit.Km);
      const showK = xi > p.x0 + 16 && xi < p.x1;
      if (showK) small(g, '−1/Km', xi, p.y1 - 10, s.color, 'center');
      if (yi > p.y0 && yi < p.y1 && !(showK && p.y1 - yi < 26)) small(g, '1/Vmax', X(0) - 6, yi - 9, s.color, 'right');
    }
    if (!st2.pts.length) small(g, T('量了兩個點以上就會畫出直線', 'With two or more points a line is fitted'), (p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, D.c.muted, 'center');
  }
  function draw2() {
    const g = ctx2;
    g.clearRect(0, 0, W2, H2);
    D.backdrop && D.backdrop(g, W2, H2);
    const L = layout2(), ss = series();
    drawMM(L.a, ss);
    drawLB(L.b, ss);
  }
  window.LabKeys && window.LabKeys.attach(cv2, {
    label: T('神秘酵素畫布：左右鍵改受質濃度，Enter 量一次初速度。', 'Mystery-enzyme canvas: left and right change [S], Enter measures the initial rate.'),
    items: [{
      name: T('受質濃度', 'Substrate concentration'),
      move: function (dx, dy, big) {
        const d = dx || -dy;
        if (d && window.LabNum) window.LabNum.set(el.cS, SV() * Math.pow(10, d * (big ? 0.5 : 0.1)));
      },
      describe: function () { return '[S] = ' + sig(SV(), 3) + ' mM。'; }
    }]
  });
  cv2.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') measure(); });

  // =====================================================================
  // 動畫迴圈
  // =====================================================================
  let raf = 0, lastNow = 0;
  function request() { if (!raf) raf = requestAnimationFrame(tick); }
  function tick(now) {
    raf = 0;
    const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0.016;
    lastNow = now;
    let more = false;
    if (stepRun(dt)) { more = true; renderRo1Soon(); }
    if (tubes.some(function (tb) { return tb.T >= 60; }) && !reducedMotion && !document.hidden) more = more || (performance.now() - steamT < 4000);
    draw1();
    if (view3 && view3.active) { view3.frame(); if (view3.busy && view3.busy()) more = true; }
    draw2();
    if (more) request(); else lastNow = 0;
  }
  let steamT = 0;
  let roTimer = 0;
  function renderRo1Soon() { if (!roTimer) roTimer = setTimeout(function () { roTimer = 0; renderRo1(); }, 250); }

  // =====================================================================
  // 3D：活性曲面（溫度 × pH），切換時才載入
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage1'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    E: E, T: T, D: D, num: num,
    colors: function () { return C; },
    enzyme: function () { return enzKey; },
    ta: function () { return val(el.ta) * 60; },
    tubes: function () { return tubes; },
    sel: function () { return sel; },
    seriesColor: sc,
    request: function () { request(); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 試管。', 'The 3D graphics context was lost, so the view switched back to the 2D tubes.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.EK3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.EK3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/enzyme-kinetics-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.EK3D) throw new Error('enzyme-kinetics-3d.js did not load');
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
        view3 = window.EK3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        requestAnimationFrame(function () { if (view3) { view3.onShow(); request(); } });
        request();
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
      resize1();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 試管。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D tubes are kept.');
    resize1();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  function rebuild3() { if (view3 && view3.active) view3.rebuild(); }

  // =====================================================================
  // 事件綁定
  // =====================================================================
  $('enzs').addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-e]');
    if (!b) return;
    enzKey = b.getAttribute('data-e');
    recompute();
    if (run.started) restartRun(false);
    renderEnzChips(); renderRo1(); rebuild3(); request();
    setStatus('status', T('換成' + enzName(enzKey) + '。按「開始反應」重新開始。', 'Switched to ' + enzName(enzKey).toLowerCase() + '. Press “Start” to run again.'));
  });
  [el.tT, el.tpH].forEach(function (r) { r.addEventListener('input', function () { tubeChanged(); steamT = performance.now(); rebuild3(); }); });
  el.ta.addEventListener('input', function () { refreshOutputs(); rebuild3(); });
  $('runBtn').addEventListener('click', startOrPause);
  $('skipBtn').addEventListener('click', function () { if (!run.started || run.finished) restartRun(false); finishRun(); });
  $('scanBtn').addEventListener('click', doScan);
  $('clear1').addEventListener('click', function () {
    restartRun(false); scans = []; runs = []; renderRows1(); renderRo1(); request();
    setStatus('status', T('已清除反應、溫度掃描與紀錄表；試管的設定沒有改變。', 'Reaction, scans and table cleared; the tube settings are unchanged.'));
  });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  $('inhs').addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-i]');
    if (!b) return;
    st2.inh = b.getAttribute('data-i');
    if (st2.inh !== 'none' && val(el.cI) <= 0 && window.LabNum) window.LabNum.set(el.cI, 1);
    renderInhChips(); renderRo2(); request();
  });
  $('guessChips').addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-g]');
    if (b) guess(b.getAttribute('data-g'));
  });
  [el.cS, el.cI, el.noise].forEach(function (r) { r.addEventListener('input', function () { refreshOutputs(); request(); }); });
  $('measBtn').addEventListener('click', measure);
  $('newEnz').addEventListener('click', newEnzyme);
  $('revealBtn').addEventListener('click', function () {
    st2.revealed = !st2.revealed;
    $('revealBtn').setAttribute('aria-pressed', String(st2.revealed));
    $('revealBtn').textContent = st2.revealed ? T('藏起答案', 'Hide the answer') : T('揭曉答案', 'Show the answer');
    if (st2.revealed && st2.inh === 'mystery' && !st2.guessed) {
      st2.guessed = true; st2.streak = 0; renderInhChips();
      setStatus('status2', T('看了答案，這個神秘抑制劑就不能再猜了。', 'Having seen the answer, you can no longer guess this mystery inhibitor.'));
    }
    renderRo2(); request();
  });
  $('clear2').addEventListener('click', function () {
    st2.pts = []; renderRows2(); renderRo2(); request();
    setStatus('status2', T('已清掉所有的點；酵素與設定沒有改變。', 'All points cleared; the enzyme and settings are unchanged.'));
  });

  // ---------- 分享目前設定（滑桿由共用程式記錄；這裡記試管、酵素與神秘酵素的編號） ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { e: enzKey, t: tubes.map(function (tb) { return tb.T + '_' + tb.pH; }).join('~'), s: st2.seed }; },
    set: function (o) {
      if (!o) return;
      if (o.e && E.ENZYMES[o.e]) enzKey = o.e;
      if (typeof o.t === 'string') o.t.split('~').slice(0, NT).forEach(function (s, i) {
        const q = s.split('_');
        const Tc = +q[0], pH = +q[1];
        if (isFinite(Tc)) tubes[i].T = Math.max(0, Math.min(90, Tc));
        if (isFinite(pH)) tubes[i].pH = Math.max(1, Math.min(12, pH));
      });
      if (o.s) { st2.seed = Math.max(1, Math.round(+o.s) || 1); sample = E.sample(st2.seed); myst = E.mystery(st2.seed); }
      recompute(); renderEnzChips(); selectTube(sel); renderInhChips(); renderRo2();
    }
  });

  // ---------- 圖例 ----------
  function legends() {
    const sub = E.ENZYMES[enzKey].sub === 'starch';
    $('legend1').innerHTML =
      '<span><i class="dot" style="background:' + C['ek-starch'] + '"></i>' + T('澱粉＋碘液', 'Starch + iodine') + '</span>' +
      '<span><i class="dot" style="background:' + C['ek-iodine'] + '"></i>' + T('澱粉分解了', 'Starch digested') + '</span>' +
      '<span><i class="dot" style="background:' + C['ek-protein'] + ';border:1px solid ' + D.c.border + '"></i>' + T('蛋白液（混濁）', 'Egg white (cloudy)') + '</span>' +
      '<span><i class="dot" style="background:' + C['ek-cold'] + '"></i>' + T('冷水浴', 'Cold bath') + '</span>' +
      '<span><i class="dot" style="background:' + C['ek-hot'] + '"></i>' + T('熱水浴', 'Hot bath') + '</span>';
    void sub;
    $('legend2').innerHTML =
      '<span><i class="dot" style="background:' + sc(0) + '"></i>' + T('沒加抑制劑', 'No inhibitor') + '</span>' +
      '<span><i class="dot" style="background:' + sc(1) + '"></i>' + T('其他顏色：各種抑制劑條件', 'Other colours: each inhibitor condition') + '</span>';
  }

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  recompute();
  renderEnzChips();
  renderInhChips();
  refreshOutputs();
  updateSoundButton();
  legends();
  selectTube(0);
  renderRows1(); renderRows2(); renderRo2();
  function themeChanged() {
    readColors();
    if (view3 && view3.active) view3.onTheme();
    legends();
    request();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:langchange', function () { renderEnzChips(); renderInhChips(); renderRo1(); renderRo2(); renderRows1(); renderRows2(); legends(); updateRunBtn(); request(); });
  setStatus('status', T('五支試管一開始都一樣（37 °C、pH 6.8）。點一支試管改它的溫度或 pH，再按「開始反應」。', 'The five tubes start out the same (37 °C, pH 6.8). Tap a tube to change its temperature or pH, then press “Start”.'));
  setStatus('status2', T('神秘酵素的 Km、Vmax 都不知道：選一個受質濃度，按「量一次初速度」。', 'The mystery enzyme’s Km and Vmax are unknown: choose a substrate concentration and press “Measure the initial rate”.'));
  if (window.ResizeObserver) {
    const watch = function (c, fn) { let lw = 0; new ResizeObserver(function () { if (c.clientWidth && c.clientWidth !== lw) { lw = c.clientWidth; fn(); } }).observe(c); };
    watch(cv, resize1); watch(cv2, resize2);
  } else window.addEventListener('resize', function () { resize1(); resize2(); });
  resize1(); resize2();
  request();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastNow = 0; request(); } });

  // 測試與縮圖用
  window.__ek = {
    E: E, tubes: tubes, run: run, st2: st2,
    setTube: function (i, Tc, pH) { selectTube(i); if (window.LabNum) { window.LabNum.set(el.tT, Tc); window.LabNum.set(el.tpH, pH); } },
    setEnzyme: function (k) { const b = document.querySelector('#enzs button[data-e="' + k + '"]'); if (b) b.click(); },
    finish: function () { $('skipBtn').click(); },
    scan: function (min) { if (window.LabNum) window.LabNum.set(el.ta, min); doScan(); },
    truth: function () { return { Km: sample.Km, Vmax: sample.Vmax, myst: myst }; },
    measure: measure, guess: guess, newEnzyme: newEnzyme, setView: setView
  };
})();
