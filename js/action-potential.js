/* action-potential.js — 「神經的動作電位」的畫面與互動（生物物理計算全部在 action-potential-core.js；3D 在 action-potential-3d.js，切換時才載入） */
(function () {
  'use strict';
  const K = window.APCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // 本檔的版本號（?v=）：切換到 3D 時動態載入的 js/action-potential-3d.js 沿用同一個版本號
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const FONT = D.FONT;
  const CAB_L = 10;          // 軸突長度（cm）
  const CAB_T0 = 0.3, CAB_DUR = 0.5, CAB_AMP = 1500, CAB_HALF = 0.05; // 軸突刺激：0.3 ms 起、0.5 ms、1500 µA/cm²、電極下 ±0.05 cm
  const MAX_KEPT = 6;

  // =====================================================================
  // 顏色
  // =====================================================================
  const C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['ap-v', 'ap-na', 'ap-k', 'ap-h', 'ap-lipid', 'ap-tail', 'ap-axo', 'ap-myelin', 'ap-stim', 'ap-r1', 'ap-r2']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }

  // =====================================================================
  // 數字與文字
  // =====================================================================
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function signed(v, d) { const s = num(v, d); return v > 0 && s !== num(0, d) ? '+' + s : s; }
  function amp3(v) { const a = Math.abs(v); return num(v, a < 10 ? 3 : a < 100 ? 2 : 1); }
  function fmtNum(v) { const a = Math.abs(v); return num(v, a < 1 ? 3 : a < 10 ? 2 : a < 100 ? 1 : 0); }
  function times(v) { return '×' + num(v, 2); }
  const UA = 'µA/cm²';

  // =====================================================================
  // 滑桿（非線性刻度登記給 LabNum）
  // =====================================================================
  const sinhV = function (p) { return Math.sign(p) * (Math.pow(10, Math.abs(p)) - 1); };
  const sinhP = function (v) { return Math.sign(v) * Math.log10(Math.abs(v) + 1); };
  const pow10 = function (p) { return Math.pow(10, p); };
  const el = {
    a1: $('a1'), a2: $('a2'), dur: $('dur'), gap: $('gap'),
    temp: $('temp'), kOut: $('kOut'), naOut: $('naOut'), ttx: $('ttx'), tea: $('tea'),
    spd: $('spd'), diam: $('diam')
  };
  function regLog(r, dec) { if (window.LabNum) window.LabNum.register(r, { toValue: pow10, toPos: Math.log10, min: pow10(+r.min), max: pow10(+r.max), decimals: dec }); }
  if (window.LabNum) {
    [el.a1, el.a2].forEach(function (r) { window.LabNum.register(r, { toValue: sinhV, toPos: sinhP, min: sinhV(+r.min), max: sinhV(+r.max), decimals: 3 }); });
  }
  regLog(el.dur, 3); regLog(el.kOut, 2); regLog(el.naOut, 2); regLog(el.spd, 2); regLog(el.diam, 0);
  function setRange(r, v) {
    if (window.LabNum) window.LabNum.set(r, v);
    else r.value = String(v);
  }

  const state = {
    mode: 'single', plot: 'gates', keep: true, showE: true,
    el: { s1: 1, s2: 9, r1: 3, r2: 7 }, s2on: false, myelin: false
  };
  function envNow() {
    return {
      T: val(el.temp), kOut: val(el.kOut), naOut: val(el.naOut),
      ttx: val(el.ttx) / 100, tea: val(el.tea) / 100
    };
  }
  function envKey(e) { return [e.T.toFixed(2), e.kOut.toFixed(4), e.naOut.toFixed(4), e.ttx.toFixed(3), e.tea.toFixed(3)].join('|'); }
  function envShort(e) {
    const a = [num(e.T, 1) + ' °C'];
    if (e.ttx > 0) a.push('TTX ' + num(e.ttx * 100, 0) + '%');
    if (e.tea > 0) a.push('TEA ' + num(e.tea * 100, 0) + '%');
    if (Math.abs(e.kOut - 1) > 0.004) a.push('K ' + times(e.kOut));
    if (Math.abs(e.naOut - 1) > 0.004) a.push('Na ' + times(e.naOut));
    return a.join(T('、', ', '));
  }
  let Pcache = null, PcacheKey = '';
  function Pnow() {
    const e = envNow(), k = envKey(e);
    if (k !== PcacheKey) { Pcache = K.params(e); PcacheKey = k; }
    return Pcache;
  }
  function refreshOutputs() {
    const set = function (id, s) { const o = $(id); if (o) o.textContent = s; };
    set('a1o', amp3(val(el.a1)));
    set('a2o', amp3(val(el.a2)));
    set('duro', num(val(el.dur), val(el.dur) < 1 ? 3 : 2));
    set('gapo', num(val(el.gap), 1));
    set('tempo', num(val(el.temp), 1));
    set('kOuto', times(val(el.kOut)));
    set('naOuto', times(val(el.naOut)));
    set('ttxo', num(val(el.ttx), 0));
    set('teao', num(val(el.tea), 0));
    set('spdo', times(val(el.spd)));
    set('diamo', num(val(el.diam), 0));
  }

  // =====================================================================
  // 音效、狀態列
  // =====================================================================
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function sndSpike() { const S = sound(); if (S) { S.noise({ dur: 0.035, gain: 0.2, filter: 2600, q: 1.1, attack: 0.001 }); S.tone({ freq: 520, dur: 0.05, gain: 0.05, type: 'triangle' }); } }
  function sndStim() { const S = sound(); if (S) S.tone({ freq: 1320, dur: 0.03, gain: 0.07, type: 'sine' }); }
  function sndArrive(k) { const S = sound(); if (S) { S.noise({ dur: 0.03, gain: 0.16, filter: k ? 1900 : 3000, q: 1.4, attack: 0.001 }); } }
  function say(s) { const e = $('srSay'); e.textContent = ''; setTimeout(function () { e.textContent = s; }, 30); }
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }

  // =====================================================================
  // 一・膜片
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W1 = 0, H1 = 0, L1 = null;
  function fit(c, g, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300;
    c.style.height = h + 'px';
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h };
  }
  function resize1() {
    const w = cv.clientWidth || 300;
    const narrow = w < 560;
    const h = narrow ? 596 : 590;
    const s = fit(cv, ctx, h);
    W1 = s.w; H1 = s.h;
    const memH = narrow ? 160 : 168;
    const x0 = narrow ? 42 : 50, x1 = W1 - 12;
    const pV = { x0: x0, x1: x1, y0: memH + 30, y1: memH + 30 + (narrow ? 178 : 180) };
    const pS = { x0: x0, x1: x1, y0: pV.y1 + 32, y1: pV.y1 + 32 + 92 };
    const pI = { x0: x0, x1: x1, y0: pS.y1 + 28, y1: pS.y1 + 28 + 38 };
    L1 = { narrow: narrow, memH: memH, yc: memH * 0.54, pV: pV, pS: pS, pI: pI };
    layoutMembrane();
    request();
  }

  // ---------- 一次刺激的紀錄 ----------
  // run1：{ rec, an, stim, mode, tEnd, head, playing, pulses, emitted, env, P, a1, a2, dur, gap, nextSpike, nextPulse }
  let run1 = null;
  let kept = [];          // 保留的舊波形：{ t, V, tEnd }
  const rows1 = [];       // 紀錄表
  let runNo1 = 0;
  const thrCache = new Map();
  function thrFor(P, key, dur) {
    const k = key + '|' + dur.toFixed(5);
    if (!thrCache.has(k)) { if (thrCache.size > 60) thrCache.clear(); thrCache.set(k, K.threshold(P, dur)); }
    return thrCache.get(k);
  }
  function makeStim(mode, a1, a2, dur, gap) {
    if (mode === 'step') return { stim: { step: { t0: 5, amp: a1 } }, tEnd: 120, pulses: [] };
    const p1 = { t0: 2, dur: dur, amp: a1 };
    if (mode === 'single') return { stim: { pulses: [p1] }, tEnd: 40, pulses: [p1] };
    const p2 = { t0: 2 + gap, dur: dur, amp: a2 };
    return { stim: { pulses: [p1, p2] }, tEnd: Math.max(40, 2 + gap + dur + 30), pulses: [p1, p2] };
  }
  function simulateNow() {
    const P = Pnow(), e = envNow();
    const mode = state.mode, a1 = val(el.a1), a2 = val(el.a2), dur = val(el.dur), gap = val(el.gap);
    const s = makeStim(mode, a1, a2, dur, gap);
    const rec = K.simulate(P, s.stim, s.tEnd, { every: Math.min(0.02, 0.05 / P.phi) });
    const an = K.analyze(rec);
    return {
      rec: rec, an: an, stim: s.stim, pulses: s.pulses, mode: mode, tEnd: s.tEnd, env: e, key: envKey(e), P: P,
      a1: a1, a2: a2, dur: dur, gap: gap, head: 0, playing: false, emitted: false, nextSpike: 0, nextPulse: 0
    };
  }
  function spikeSplit(r) {
    const sp = r.an.spikes;
    if (r.mode === 'paired') {
      const t2 = r.pulses[1].t0;
      const s1 = sp.filter(function (s) { return s.t < t2; })[0] || null;
      const s2 = sp.filter(function (s) { return s.t >= t2; })[0] || null;
      return { s1: s1, s2: s2 };
    }
    return { s1: sp[0] || null, s2: null };
  }
  function fire() {
    if (run1 && !run1.emitted) finishRun1(true);
    if (run1 && state.keep) {
      kept.push({ t: run1.rec.t, V: run1.rec.V, tEnd: run1.tEnd });
      if (kept.length > MAX_KEPT) kept.shift();
    }
    if (!state.keep) kept = [];
    run1 = simulateNow();
    run1.playing = !reducedMotion;
    if (!run1.playing) { run1.head = run1.tEnd; finishRun1(false); }
    else { setStatus(T('刺激！', 'Stimulus!')); lastT = 0; }
    request();
  }
  function finishRun1(interrupted) {
    const r = run1;
    if (!r || r.emitted) return;
    r.head = r.tEnd; r.playing = false; r.emitted = true;
    const sp = spikeSplit(r);
    const shape = sp.s1 ? K.spikeShape(r.rec, sp.s1) : null;
    let thr = NaN, a2alone = false;
    if (r.mode !== 'step') thr = thrFor(r.P, r.key, r.dur);
    if (r.mode === 'paired') a2alone = r.a2 > 0 && K.fires(r.P, r.a2, r.dur);
    const t0 = r.mode === 'step' ? r.stim.step.t0 : r.pulses[0].t0;
    const data = {
      mode: r.mode, a1: r.a1, a2: r.mode === 'paired' ? r.a2 : null, dur: r.mode === 'step' ? null : r.dur, gap: r.mode === 'paired' ? r.gap : null,
      T: r.env.T, ttx: r.env.ttx, tea: r.env.tea, kOut: r.env.kOut, naOut: r.env.naOut, env: r.key,
      rest: r.an.rest, n: r.an.n, fired1: !!sp.s1, fired2: !!sp.s2,
      peak1: sp.s1 ? sp.s1.peak : null, peak2: sp.s2 ? sp.s2.peak : null,
      rise: r.an.rise, amp1: shape ? shape.amp : null, halfWidth: shape ? shape.halfWidth : null,
      thr: thr, a2alone: a2alone, rate: r.an.rate,
      lat: sp.s1 ? sp.s1.tPeak - t0 : null
    };
    r.data = data;
    addRow1(r);
    statusFor(r);
    updateReadouts1();
    emit('stim', data);
    if (!interrupted) request();
  }
  function statusFor(r) {
    const d = r.data;
    let s;
    if (r.mode === 'step') {
      if (d.n === 0) s = d.rise > 30 ? T('細胞膜被推上去卻發不出動作電位（去極化阻斷：鈉通道全被不活化閘門關住）。', 'The membrane is pushed up but cannot fire (depolarisation block: the sodium channels are all inactivated).')
        : T('沒有引發動作電位。', 'No action potential.');
      else if (d.n < 3) s = T('只發出 ' + d.n + ' 個動作電位就停了。', 'Only ' + d.n + ' action potential' + (d.n > 1 ? 's' : '') + ', then it stops.');
      else s = T('持續發放：' + d.n + ' 個動作電位，頻率約 ' + num(d.rate, 0) + ' Hz。', 'Repetitive firing: ' + d.n + ' action potentials at about ' + num(d.rate, 0) + ' Hz.');
    } else if (r.mode === 'paired') {
      s = (d.fired1 ? T('第一個脈衝：動作電位', 'First pulse: action potential') : T('第一個脈衝：沒有', 'First pulse: none')) + T('；', '; ') +
        (d.fired2 ? T('第二個脈衝：動作電位', 'second pulse: action potential') : T('第二個脈衝：沒有', 'second pulse: none')) + T('。', '.');
      if (d.fired1 && !d.fired2 && d.a2alone) s += T(' 第二個脈衝單獨給就會發——它落在不反應期裡。', ' On its own the second pulse would fire — it fell in the refractory period.');
    } else if (d.n > 0) {
      s = T('引發動作電位：峰值 ', 'Action potential: peak ') + signed(d.peak1, 1) + T(' mV，刺激後 ', ' mV, ') + num(d.lat, 2) + T(' ms 到達峰值。', ' ms after the stimulus.');
      if (d.n > 1) s += T(' 而且一共發了 ' + d.n + ' 個。', ' And ' + d.n + ' of them in all.');
    } else {
      s = T('沒有引發動作電位：膜電位最多上升 ', 'No action potential: the membrane rose by at most ') + num(d.rise, 1) + T(' mV，又回到靜止。', ' mV and fell back.');
    }
    setStatus(s);
    say(s);
  }
  function setStatus(s) { $('status').textContent = s; }

  // ---------- 紀錄表 ----------
  function stimText(r) {
    if (r.mode === 'step') return T('持續 ', 'Steady ') + amp3(r.a1);
    if (r.mode === 'paired') return amp3(r.a1) + ' / ' + amp3(r.a2) + T('，隔 ', ', ') + num(r.gap, 1) + ' ms';
    return amp3(r.a1) + ' × ' + num(r.dur, r.dur < 1 ? 3 : 2) + ' ms';
  }
  function resultText(r) {
    const d = r.data;
    if (r.mode === 'paired') return (d.fired1 ? '✓' : '✗') + ' / ' + (d.fired2 ? '✓' : '✗');
    if (r.mode === 'step') return d.n + T(' 個', '') + (d.rate > 0 ? T('・', ' · ') + num(d.rate, 0) + ' Hz' : '');
    return d.n ? d.n + T(' 個', '') : T('沒有', 'none');
  }
  function addRow1(r) {
    runNo1++;
    rows1.unshift({ no: runNo1, stim: stimText(r), env: envShort(r.env), res: resultText(r), fired: r.data.n > 0,
      peak: r.data.peak1 != null ? signed(r.data.peak1, 1) : '—', lat: r.data.lat != null ? num(r.data.lat, 2) : '—' });
    if (rows1.length > 10) rows1.pop();
    renderRows1();
  }
  function renderRows1() {
    const t = $('runs');
    if (!rows1.length) { t.innerHTML = ''; return; }
    let h = '<thead><tr><th>#</th><th>' + T('刺激（' + UA + '）', 'Stimulus (' + UA + ')') + '</th><th>' + T('條件', 'Conditions') + '</th><th>' +
      T('動作電位', 'Spikes') + '</th><th>' + T('峰值（mV）', 'Peak (mV)') + '</th><th>' + T('到峰值（ms）', 'To peak (ms)') + '</th></tr></thead><tbody>';
    rows1.forEach(function (x) {
      h += '<tr><td>' + x.no + '</td><td>' + x.stim + '</td><td>' + x.env + '</td><td' + (x.fired ? ' class="yes"' : '') + '>' + x.res + '</td><td>' + x.peak + '</td><td>' + x.lat + '</td></tr>';
    });
    t.innerHTML = h + '</tbody>';
  }
  function updateReadouts1() {
    const P = Pnow();
    const rest = K.restingPotential(P);
    let h = '<dt>' + T('靜止膜電位', 'Resting potential') + '</dt><dd>' + num(rest, 1) + ' mV</dd>' +
      '<dt>' + T('鈉的平衡電位', 'Sodium equilibrium') + ' E<sub>Na</sub></dt><dd>' + signed(P.ENa, 1) + ' mV</dd>' +
      '<dt>' + T('鉀的平衡電位', 'Potassium equilibrium') + ' E<sub>K</sub></dt><dd>' + num(P.EK, 1) + ' mV</dd>' +
      '<dt>' + T('閘門速度 φ', 'Gate speed φ') + '</dt><dd>' + times(P.phi) + '<small>' + T('與 6.3 °C 相比', 'relative to 6.3 °C') + '</small></dd>';
    const r = run1;
    if (r && r.emitted && r.data) {
      const d = r.data;
      const sp = spikeSplit(r);
      const sh = sp.s1 ? K.spikeShape(r.rec, sp.s1) : null;
      if (sh) {
        h += '<dt>' + T('峰值', 'Peak') + '</dt><dd>' + signed(sp.s1.peak, 1) + ' mV</dd>' +
          '<dt>' + T('振幅', 'Amplitude') + '</dt><dd>' + num(sh.amp, 1) + ' mV</dd>' +
          '<dt>' + T('半高寬', 'Half-width') + '</dt><dd>' + num(sh.halfWidth, 2) + ' ms</dd>' +
          '<dt>' + T('最快上升', 'Fastest rise') + '</dt><dd>' + num(sh.dvdt, 0) + ' V/s</dd>' +
          '<dt>' + T('後過極化', 'After-hyperpolarisation') + '</dt><dd>' + num(sh.ahp, 1) + ' mV</dd>';
      } else {
        h += '<dt>' + T('這次', 'This run') + '</dt><dd>' + T('沒有動作電位；最多上升 ', 'no action potential; rose by at most ') + num(d.rise, 1) + ' mV</dd>';
      }
      if (r.mode === 'step') h += '<dt>' + T('發放頻率', 'Firing rate') + '</dt><dd>' + (d.rate > 0 ? num(d.rate, 0) + ' Hz' : T('沒有反覆發放', 'no repetitive firing')) + '</dd>';
    }
    $('ro').innerHTML = h;
  }

  // ---------- 細胞膜示意圖 ----------
  // 通道與離子的位置在版面改變時決定；離子流動的粒子用真實時間播放（純示意，不影響計算）
  let chans = [], bgIons = [], flux = [], memLayer = null, memKey = '';
  function rand01(seed) { let s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function layoutMembrane() {
    const n = L1.narrow ? 3 : 4;
    chans = [];
    const xa = W1 * 0.12, xb = W1 * 0.9;
    for (let i = 0; i < 2 * n; i++) chans.push({ kind: i % 2 ? 'k' : 'na', x: xa + (xb - xa) * (i + 0.5) / (2 * n), idx: Math.floor(i / 2) });
    memLayer = null;
    placeIons();
  }
  function placeIons() {
    const e = envNow();
    const R = rand01(20261112);
    const yc = L1.yc, top = 8, outB = yc - 40, inT = yc + 40, bot = L1.memH - 6;
    bgIons = [];
    const add = function (kind, n, y0, y1) {
      for (let i = 0; i < n; i++) bgIons.push({ kind: kind, x: 10 + R() * (W1 - 20), y: y0 + R() * (y1 - y0), ph: R() * 6.283 });
    };
    const k = L1.narrow ? 0.7 : 1;
    add('na', Math.max(1, Math.round(13 * k * e.naOut)), top + 16, outB);
    add('k', Math.max(1, Math.round(3 * k * e.kOut)), top + 16, outB);
    add('k', Math.round(13 * k), inT, bot - 14);
    add('na', Math.round(2 * k), inT, bot - 14);
  }
  /** 磷脂雙層（靜態圖層） */
  function membraneLayer() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const key = [W1, L1.memH, dpr, D.ver, chans.length].join('|');
    if (memLayer && memKey === key) return memLayer;
    const c = document.createElement('canvas');
    c.width = Math.round(W1 * dpr); c.height = Math.round(L1.memH * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const yc = L1.yc;
    // 細胞外與細胞內
    const gOut = g.createLinearGradient(0, 0, 0, yc);
    gOut.addColorStop(0, D.alpha(C['ap-stim'], D.dark ? 0.05 : 0.035));
    gOut.addColorStop(1, D.alpha(C['ap-stim'], D.dark ? 0.1 : 0.07));
    g.fillStyle = gOut; g.fillRect(0, 0, W1, yc);
    const gIn = g.createLinearGradient(0, yc, 0, L1.memH);
    gIn.addColorStop(0, D.alpha(C['ap-axo'], D.dark ? 0.75 : 0.85));
    gIn.addColorStop(1, D.alpha(C['ap-axo'], D.dark ? 0.35 : 0.4));
    g.fillStyle = gIn; g.fillRect(0, yc, W1, L1.memH - yc);
    // 磷脂：頭部（球）＋兩條尾巴
    const sp = 9.4, rH = 4.1, half = 24;
    const free = function (x) { for (let i = 0; i < chans.length; i++) if (Math.abs(x - chans[i].x) < 21) return false; return true; };
    g.lineCap = 'round';
    for (let x = sp / 2; x < W1; x += sp) {
      if (!free(x)) continue;
      [-1, 1].forEach(function (s) {
        const yh = yc + s * half;
        g.strokeStyle = D.shade(C['ap-tail'], D.dark ? 0.1 : -0.12);
        g.lineWidth = 1.5;
        for (let k = -1; k <= 1; k += 2) {
          g.beginPath();
          g.moveTo(x + k * 1.6, yh - s * rH * 0.6);
          g.bezierCurveTo(x + k * 2.6, yh - s * 8, x + k * 0.6, yh - s * 13, x + k * 1.9, yh - s * (half - 3));
          g.stroke();
        }
      });
    }
    for (let x = sp / 2; x < W1; x += sp) {
      if (!free(x)) continue;
      D.ball(g, x, yc - half, rH, C['ap-lipid'], { shadow: false, glow: 0 });
      D.ball(g, x, yc + half, rH, C['ap-lipid'], { shadow: false, glow: 0 });
    }
    // 標籤
    D.haloText(g, T('細胞外', 'Outside'), 8, 14, D.c.muted, 'left', 'middle', '600 12px ' + FONT);
    D.haloText(g, T('細胞內（軸漿）', 'Inside (axoplasm)'), 8, L1.memH - 10, D.c.muted, 'left', 'middle', '600 12px ' + FONT);
    memLayer = c; memKey = key;
    return c;
  }
  /** 讀取播放頭時刻的閘門、電流 */
  function sampleAt(r, t) {
    const rec = r.rec, n = rec.t.length;
    const u = t / rec.every;
    let i = Math.floor(u);
    if (i >= n - 1) i = n - 2;
    if (i < 0) i = 0;
    const f = Math.max(0, Math.min(1, u - i));
    const L = function (a) { return a[i] + (a[i + 1] - a[i]) * f; };
    return { V: L(rec.V), m: L(rec.m), h: L(rec.h), n: L(rec.n), iNa: L(rec.iNa), iK: L(rec.iK), I: rec.I[Math.min(n - 1, Math.round(u))] };
  }
  function restSample() {
    const P = Pnow(), s = K.restState(P);
    return { V: s.V, m: s.m, h: s.h, n: s.n, iNa: 0, iK: 0, I: 0 };
  }
  function drawChannel(c, s, P, e) {
    const yc = L1.yc, x = c.x, hh = 33;
    const isNa = c.kind === 'na';
    const nCh = chans.length / 2;
    const blocked = isNa ? c.idx < Math.round(e.ttx * nCh) : c.idx < Math.round(e.tea * nCh);
    const open = blocked ? 0 : isNa ? s.m * s.m * s.m : s.n * s.n * s.n * s.n;
    const col = isNa ? C['ap-na'] : C['ap-k'];
    const gap = 1.5 + 7.5 * Math.min(1, open * (isNa ? 1.6 : 1.3));
    const sw = 11;
    // 蛋白質兩半（圓柱感）
    [-1, 1].forEach(function (sd) {
      const bx = sd < 0 ? x - gap / 2 - sw : x + gap / 2;
      const gr = ctx.createLinearGradient(bx, 0, bx + sw, 0);
      gr.addColorStop(0, D.shade(col, sd < 0 ? 0.35 : -0.05));
      gr.addColorStop(0.5, D.shade(col, 0.15));
      gr.addColorStop(1, D.shade(col, sd < 0 ? -0.1 : -0.3));
      D.roundRect(ctx, bx, yc - hh, sw, 2 * hh, 5);
      ctx.fillStyle = gr; ctx.fill();
      ctx.strokeStyle = D.alpha(D.shade(col, -0.45), 0.6); ctx.lineWidth = 1; ctx.stroke();
    });
    // 鈉通道的不活化閘門 h：鏈子＋球，h 越小越靠近孔口（把孔塞住）
    if (isNa) {
      const ax = x + gap / 2 + sw - 2, ay = yc + hh - 2;
      const plug = blocked ? 0 : 1 - s.h;
      const bx = x + (1 - plug) * 14, by = yc + hh + 13 - plug * 11;
      ctx.strokeStyle = D.alpha(C['ap-h'], 0.85); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax + 6, (ay + by) / 2 + 6, bx + 3, by); ctx.stroke();
      D.ball(ctx, bx, by, 5, C['ap-h'], { shadow: false });
    }
    if (blocked) {
      // 藥物分子：河豚毒素塞在外側孔口、TEA 塞在內側孔口（示意）
      const yb = isNa ? yc - hh - 4 : yc + hh + 4;
      ctx.save();
      ctx.translate(x, yb); ctx.rotate(Math.PI / 4);
      D.roundRect(ctx, -5.5, -5.5, 11, 11, 3);
      ctx.fillStyle = D.dark ? '#e5e7eb' : '#374151'; ctx.fill();
      ctx.restore();
    }
  }
  function drawMembrane(s, P, e, now) {
    const yc = L1.yc;
    ctx.drawImage(membraneLayer(), 0, 0, W1, L1.memH);
    // 背景離子（輕微擺動）
    const wob = reducedMotion ? 0 : now / 900;
    bgIons.forEach(function (b) {
      D.ball(ctx, b.x + Math.sin(wob + b.ph) * 1.6, b.y + Math.cos(wob * 1.3 + b.ph) * 1.2, 3.4, b.kind === 'na' ? C['ap-na'] : C['ap-k'], { shadow: false, glow: 0 });
    });
    // 膜兩側的電荷：細胞內為負時內側畫「−」、外側畫「+」
    const q = Math.min(1, Math.abs(s.V) / 65);
    if (q > 0.04) {
      const inSign = s.V < 0 ? '−' : '+', outSign = s.V < 0 ? '+' : '−';
      ctx.font = '700 12px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let x = 22; x < W1 - 10; x += 26) {
        let near = false;
        for (let i = 0; i < chans.length; i++) if (Math.abs(x - chans[i].x) < 22) near = true;
        if (near) continue;
        ctx.globalAlpha = 0.25 + 0.7 * q;
        ctx.fillStyle = outSign === '+' ? D.c.pos : D.c.neg; ctx.fillText(outSign, x, yc - 36);
        ctx.fillStyle = inSign === '+' ? D.c.pos : D.c.neg; ctx.fillText(inSign, x, yc + 36);
      }
      ctx.globalAlpha = 1;
    }
    chans.forEach(function (c) { drawChannel(c, s, P, e); });
    // 流過通道的離子
    flux.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 3, (1 - p.age / p.life) * 3));
      D.ball(ctx, p.x, p.y, 3.4, p.kind === 'na' ? C['ap-na'] : C['ap-k'], { shadow: false, glow: 0.3 });
    });
    ctx.globalAlpha = 1;
    // 通道名稱
    const ks = chans.filter(function (c) { return c.kind === 'k'; });
    const fNa = chans.filter(function (c) { return c.kind === 'na'; })[0], fK = ks[L1.narrow ? 1 : 0];
    if (fNa) D.pill(ctx, T('鈉通道', 'Na channel'), fNa.x, yc - 40, C['ap-na'], 'center', '600 11.5px ' + FONT);
    if (fK) D.pill(ctx, T('鉀通道', 'K channel'), fK.x, yc - 40, C['ap-k'], 'center', '600 11.5px ' + FONT);
    // 讀數
    const tx = W1 - 10;
    D.pill(ctx, 'V = ' + signed(s.V, 1) + ' mV', tx, 22, C['ap-v'], 'right', '700 13px ' + FONT);
    const tt = run1 ? Math.min(run1.head, run1.tEnd) : 0;
    D.pill(ctx, 't = ' + num(tt, 2) + ' ms', tx, 44, D.c.muted, 'right', '600 12px ' + FONT);
    D.haloText(ctx, T('示意圖（不按比例）', 'Schematic (not to scale)'), tx, L1.memH - 10, D.alpha(D.c.muted, 0.9), 'right', 'middle', '11px ' + FONT);
  }
  /** 依此刻的鈉、鉀電流產生穿過通道的離子（純示意） */
  function stepFlux(s, dtReal, e) {
    if (reducedMotion) { flux = []; return; }
    const yc = L1.yc, nCh = chans.length / 2;
    if (run1 && run1.playing) {
      chans.forEach(function (c) {
        const isNa = c.kind === 'na';
        const blocked = isNa ? c.idx < Math.round(e.ttx * nCh) : c.idx < Math.round(e.tea * nCh);
        if (blocked) return;
        const I = isNa ? s.iNa : s.iK;
        const rate = Math.min(14, Math.abs(I) / 22);     // 每秒幾個（示意）
        c.acc = (c.acc || 0) + rate * dtReal;
        while (c.acc >= 1) {
          c.acc -= 1;
          const inward = I < 0;
          flux.push({ kind: c.kind, x: c.x + (Math.random() - 0.5) * 3, y: inward ? yc - 46 : yc + 46, vy: (inward ? 1 : -1) * 120, age: 0, life: 0.75 });
        }
      });
    }
    flux.forEach(function (p) { p.age += dtReal; p.y += p.vy * dtReal * (Math.abs(p.y - yc) < 34 ? 0.8 : 0.45); });
    flux = flux.filter(function (p) { return p.age < p.life; });
    if (flux.length > 160) flux.splice(0, flux.length - 160);
  }

  // ---------- 圖表 ----------
  function niceStep(span, target) {
    const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  /** 以每個像素一組（最大、最小值）畫折線，資料很多時也不會漏掉尖峰 */
  function series(g, ts, ys, tMax, xOf, yOf, x0, x1) {
    const n = ts.length;
    if (n < 2) return;
    g.beginPath();
    let started = false, px = -1, lo = 0, hi = 0, first = 0, last = 0, cnt = 0;
    const flush = function () {
      if (!cnt) return;
      const yF = yOf(first), yL = yOf(last);
      if (!started) { g.moveTo(px, yF); started = true; } else g.lineTo(px, yF);
      if (cnt > 2) { g.lineTo(px, yOf(lo)); g.lineTo(px, yOf(hi)); }
      g.lineTo(px, yL);
    };
    for (let i = 0; i < n; i++) {
      if (ts[i] > tMax + 1e-9) break;
      const x = Math.round(xOf(ts[i]) * 2) / 2;
      const y = ys[i];
      if (x !== px) { flush(); px = x; lo = hi = first = last = y; cnt = 1; }
      else { if (y < lo) lo = y; if (y > hi) hi = y; last = y; cnt++; }
    }
    flush();
    g.stroke();
  }
  function plotFrame(g, p) {
    D.roundRect(g, p.x0 - 4, p.y0 - 4, p.x1 - p.x0 + 8, p.y1 - p.y0 + 8, 8);
    g.fillStyle = D.alpha(D.c.surface, D.dark ? 0.35 : 0.7); g.fill();
    g.strokeStyle = D.alpha(D.c.border, 0.9); g.lineWidth = 1; g.stroke();
  }
  function yTicks(g, p, lo, hi, step, fmt, yOf) {
    g.font = '11px ' + FONT; g.fillStyle = D.c.muted; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
      const y = yOf(v);
      g.fillText(fmt(v), p.x0 - 7, y);
      g.strokeStyle = D.alpha(D.c.text, Math.abs(v) < 1e-9 ? 0.22 : 0.07); g.lineWidth = 1;
      g.beginPath(); g.moveTo(p.x0, Math.round(y) + 0.5); g.lineTo(p.x1, Math.round(y) + 0.5); g.stroke();
    }
  }
  /** 時間軸的刻度數字；最右邊留給「t (ms)」 */
  function timeTicks(g, p, tMax, step, xOf) {
    g.font = '11px ' + FONT; g.fillStyle = D.c.muted; g.textBaseline = 'top';
    g.textAlign = 'right';
    const lab = 't (ms)', wl = g.measureText(lab).width;
    g.fillText(lab, p.x1, p.y1 + 6);
    g.textAlign = 'center';
    for (let t = 0; t <= tMax + 1e-9; t += step) {
      const x = xOf(t);
      if (x > p.x1 - wl - 14) break;
      g.fillText(num(t, step < 1 ? 1 : 0), x, p.y1 + 6);
    }
  }
  function subLabel(g, base, sub, x, y, color, align) {
    const f1 = '600 12px ' + FONT, f2 = '600 9.5px ' + FONT;
    g.font = f1; const w1 = g.measureText(base).width;
    g.font = f2; const w2 = g.measureText(sub).width;
    const x0 = align === 'right' ? x - w1 - w2 - 1 : x;
    D.haloText(g, base, x0, y, color, 'left', 'middle', f1);
    D.haloText(g, sub, x0 + w1 + 1, y + 4, color, 'left', 'middle', f2);
    return w1 + w2 + 1;
  }
  function draw1(now) {
    if (!L1) return;
    D.backdrop(ctx, W1, H1);
    const P = run1 ? run1.P : Pnow();
    const e = run1 ? run1.env : envNow();
    const s = run1 ? sampleAt(run1, Math.min(run1.head, run1.tEnd)) : restSample();
    drawMembrane(s, P, e, now);
    // 分隔線
    ctx.strokeStyle = D.alpha(D.c.border, 0.9); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, L1.memH + 0.5); ctx.lineTo(W1, L1.memH + 0.5); ctx.stroke();
    if (!run1) return;
    const r = run1, rec = r.rec, head = Math.min(r.head, r.tEnd);
    const pV = L1.pV, pS = L1.pS, pI = L1.pI;
    const tMax = r.tEnd;
    const xOf = function (t) { return pV.x0 + (pV.x1 - pV.x0) * t / tMax; };
    // ---- 膜電位 ----
    plotFrame(ctx, pV);
    const vLo = -100, vHi = 60;
    const yV = function (v) { return pV.y1 - (pV.y1 - pV.y0) * (v - vLo) / (vHi - vLo); };
    yTicks(ctx, pV, vLo, vHi, 20, function (v) { return num(v, 0); }, yV);
    // 時間格線
    const tStep = niceStep(tMax, L1.narrow ? 5 : 8);
    [pV, pS, pI].forEach(function (p) {
      ctx.strokeStyle = D.alpha(D.c.text, 0.06); ctx.lineWidth = 1;
      ctx.beginPath();
      for (let t = tStep; t < tMax - 1e-9; t += tStep) { const x = Math.round(xOf(t)) + 0.5; ctx.moveTo(x, p.y0); ctx.lineTo(x, p.y1); }
      ctx.stroke();
    });
    timeTicks(ctx, pI, tMax, tStep, xOf);
    D.haloText(ctx, T('膜電位 V（mV）', 'Membrane potential V (mV)'), pV.x0, pV.y0 - 13, C['ap-v'], 'left', 'middle', '600 12px ' + FONT);
    // 平衡電位
    if (state.showE) {
      ctx.save(); ctx.setLineDash([5, 4]); ctx.lineWidth = 1.3;
      [[P.ENa, C['ap-na'], 'Na'], [P.EK, C['ap-k'], 'K']].forEach(function (q) {
        if (q[0] < vLo || q[0] > vHi) return;
        const y = yV(q[0]);
        ctx.strokeStyle = D.alpha(q[1], 0.75);
        ctx.beginPath(); ctx.moveTo(pV.x0, y); ctx.lineTo(pV.x1, y); ctx.stroke();
      });
      ctx.restore();
      [[P.ENa, C['ap-na'], 'Na'], [P.EK, C['ap-k'], 'K']].forEach(function (q) {
        if (q[0] < vLo || q[0] > vHi) return;
        const y = yV(q[0]);
        const w = subLabel(ctx, 'E', q[2], pV.x1 - 4 - 46, y - 8, q[1], 'left');
        D.haloText(ctx, ' ' + signed(q[0], 0), pV.x1 - 4 - 46 + w, y - 8, q[1], 'left', 'middle', '600 11px ' + FONT);
      });
    }
    // 保留的波形
    ctx.save();
    ctx.beginPath(); ctx.rect(pV.x0, pV.y0 - 4, pV.x1 - pV.x0, pV.y1 - pV.y0 + 8); ctx.clip();
    ctx.lineJoin = 'round';
    kept.forEach(function (k, i) {
      ctx.strokeStyle = D.alpha(D.c.muted, 0.25 + 0.3 * (i + 1) / kept.length); ctx.lineWidth = 1.3;
      const xk = function (t) { return pV.x0 + (pV.x1 - pV.x0) * t / tMax; };
      series(ctx, k.t, k.V, tMax, xk, yV, pV.x0, pV.x1);
    });
    // 這一次
    ctx.strokeStyle = D.alpha(C['ap-v'], 0.22); ctx.lineWidth = 6;
    series(ctx, rec.t, rec.V, head, xOf, yV);
    ctx.strokeStyle = C['ap-v']; ctx.lineWidth = 2.2;
    series(ctx, rec.t, rec.V, head, xOf, yV);
    ctx.restore();
    // 峰值標籤（第一個動作電位）
    const sp1 = r.an.spikes[0];
    if (sp1 && head >= sp1.tPeak) D.pill(ctx, signed(sp1.peak, 1) + ' mV', Math.min(pV.x1 - 30, xOf(sp1.tPeak) + 8), yV(sp1.peak) + 4, C['ap-v'], 'left', '600 11px ' + FONT);
    // 播放頭
    if (r.playing || head < tMax) {
      const x = xOf(head);
      ctx.strokeStyle = D.alpha(D.c.text, 0.35); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, pV.y0); ctx.lineTo(x, pI.y1); ctx.stroke();
      D.ball(ctx, x, yV(s.V), 4.5, C['ap-v']);
    }
    // ---- 下方小圖 ----
    plotFrame(ctx, pS);
    ctx.save();
    ctx.beginPath(); ctx.rect(pS.x0, pS.y0 - 3, pS.x1 - pS.x0, pS.y1 - pS.y0 + 6); ctx.clip();
    let lines, lo, hi, title, fmt;
    if (state.plot === 'gates') {
      lo = 0; hi = 1; title = L1.narrow ? T('閘門', 'Gates') : T('閘門（0 = 關，1 = 開）', 'Gates (0 = shut, 1 = open)'); fmt = function (v) { return num(v, 1); };
      lines = [[rec.m, C['ap-na'], 'm', false], [rec.h, C['ap-h'], 'h', true], [rec.n, C['ap-k'], 'n', false]];
    } else if (state.plot === 'g') {
      const gNa = rec.m.map(function (m, i) { return P.gNa * m * m * m * rec.h[i]; });
      const gK = rec.n.map(function (n) { return P.gK * n * n * n * n; });
      let mx = 1; gNa.forEach(function (v) { if (v > mx) mx = v; }); gK.forEach(function (v) { if (v > mx) mx = v; });
      lo = 0; hi = mx * 1.1; title = T('電導（mS/cm²）', 'Conductance (mS/cm²)'); fmt = function (v) { return num(v, 0); };
      lines = [[gNa, C['ap-na'], 'g Na', false], [gK, C['ap-k'], 'g K', false]];
      r._gCache = { gNa: gNa, gK: gK };
    } else {
      let mx = 1;
      for (let i = 0; i < rec.iNa.length; i++) { mx = Math.max(mx, Math.abs(rec.iNa[i]), Math.abs(rec.iK[i])); }
      lo = -mx * 1.08; hi = mx * 1.08; title = L1.narrow ? T('離子電流（' + UA + '）', 'Ion current (' + UA + ')') : T('離子電流（' + UA + '，負＝流入細胞）', 'Ion current (' + UA + ', negative = inward)'); fmt = function (v) { return num(v, 0); };
      lines = [[rec.iNa, C['ap-na'], 'I Na', false], [rec.iK, C['ap-k'], 'I K', false], [rec.iL, D.c.muted, 'I L', true]];
    }
    const yS = function (v) { return pS.y1 - (pS.y1 - pS.y0) * (v - lo) / (hi - lo); };
    ctx.restore();
    const sStep = state.plot === 'gates' ? 0.5 : niceStep(hi - lo, 3);
    yTicks(ctx, pS, lo, hi, sStep, fmt, yS);
    ctx.save();
    ctx.beginPath(); ctx.rect(pS.x0, pS.y0 - 3, pS.x1 - pS.x0, pS.y1 - pS.y0 + 6); ctx.clip();
    lines.forEach(function (l) {
      ctx.strokeStyle = l[1]; ctx.lineWidth = 1.8;
      ctx.setLineDash(l[3] ? [5, 3] : []);
      series(ctx, rec.t, l[0], head, xOf, yS);
    });
    ctx.setLineDash([]);
    ctx.restore();
    D.haloText(ctx, title, pS.x0, pS.y0 - 13, D.c.text, 'left', 'middle', '600 11.5px ' + FONT);
    // 線的名稱：右上角的小圖例（由右往左排）
    let lx = pS.x1;
    lines.slice().reverse().forEach(function (l) {
      const parts = l[2].split(' ');
      ctx.font = '600 12px ' + FONT;
      const wMain = ctx.measureText(parts[0]).width;
      ctx.font = '600 9.5px ' + FONT;
      const wSub = parts[1] ? ctx.measureText(parts[1]).width + 1 : 0;
      lx -= wMain + wSub;
      if (parts[1]) subLabel(ctx, parts[0], parts[1], lx, pS.y0 - 13, l[1], 'left');
      else D.haloText(ctx, l[2], lx, pS.y0 - 13, l[1], 'left', 'middle', 'italic 700 12.5px ' + FONT);
      ctx.save(); ctx.strokeStyle = l[1]; ctx.lineWidth = 2; ctx.setLineDash(l[3] ? [4, 2] : []);
      ctx.beginPath(); ctx.moveTo(lx - 18, pS.y0 - 13); ctx.lineTo(lx - 4, pS.y0 - 13); ctx.stroke(); ctx.restore();
      lx -= 30;
    });
    // ---- 刺激電流 ----
    plotFrame(ctx, pI);
    let iMax = 0;
    for (let i = 0; i < rec.I.length; i++) iMax = Math.max(iMax, Math.abs(rec.I[i]));
    const iSpan = iMax || 1;
    const hasNeg = rec.I.some(function (v) { return v < 0; });
    const iLo = hasNeg ? -iSpan : 0, iHi = hasNeg && !rec.I.some(function (v) { return v > 0; }) ? 0 : iSpan;
    const yI = function (v) { return pI.y1 - (pI.y1 - pI.y0) * (v - iLo) / ((iHi - iLo) || 1); };
    ctx.save();
    ctx.beginPath(); ctx.rect(pI.x0, pI.y0 - 3, pI.x1 - pI.x0, pI.y1 - pI.y0 + 6); ctx.clip();
    ctx.beginPath(); ctx.moveTo(xOf(0), yI(0));
    for (let i = 0; i < rec.t.length && rec.t[i] <= head + 1e-9; i++) ctx.lineTo(xOf(rec.t[i]), yI(rec.I[i]));
    ctx.lineTo(xOf(Math.min(head, rec.t[rec.t.length - 1])), yI(0)); ctx.closePath();
    ctx.fillStyle = D.alpha(C['ap-stim'], 0.22); ctx.fill();
    ctx.strokeStyle = C['ap-stim']; ctx.lineWidth = 1.6;
    series(ctx, rec.t, rec.I, head, xOf, yI);
    ctx.restore();
    D.haloText(ctx, T('刺激電流', 'Stimulus current') + (iMax ? '  ' + (r.mode === 'paired' ? amp3(r.a1) + ' / ' + amp3(r.a2) : amp3(r.a1)) + ' ' + UA : ''), pI.x0, pI.y0 - 12, C['ap-stim'], 'left', 'middle', '600 11px ' + FONT);
  }

  // =====================================================================
  // 二・軸突的傳導
  // =====================================================================
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  let W2 = 0, H2 = 0, L2 = null;
  let run2 = null;          // { cab, playing, xs, r1, r2, tr: { t, v1, v2 }, env, diam, myelin, nextRec, arrived: [bool,bool] }
  let idleCab = null, idleKey = '';
  const rows2 = [];
  let runNo2 = 0;
  function resize2() {
    const w = cv2.clientWidth || 300;
    const narrow = w < 560;
    const s = fit(cv2, ctx2, narrow ? 404 : 384);
    W2 = s.w; H2 = s.h;
    const x0 = narrow ? 40 : 48, x1 = W2 - 16;
    const prof = { x0: x0, x1: x1, y0: 30, y1: narrow ? 112 : 114 };
    L2 = { narrow: narrow, prof: prof, x0: x0, x1: x1 };
    request();
  }
  function xPx(x) { return L2.x0 + (L2.x1 - L2.x0) * x / CAB_L; }
  function pxX(px) { return (px - L2.x0) / (L2.x1 - L2.x0) * CAB_L; }
  function axonR() { const d = val(el.diam); return 7 + 13 * (Math.log10(d) - 1.69897) / 1.30103; }
  function geom2() {
    const rA = axonR();
    const ay = L2.prof.y1 + 22 + 34 + 20;
    const scope = { x0: L2.x0, x1: L2.x1, y0: ay + 20 + 52, y1: H2 - 24 };
    return { rA: rA, ay: ay, scope: scope };
  }
  function curCable() {
    if (run2) return run2.cab;
    const e = envNow(), key = envKey(e) + '|' + val(el.diam).toFixed(1) + '|' + state.myelin;
    if (!idleCab || idleKey !== key) { idleCab = K.makeCable({ P: K.params(e), length: CAB_L, diam: val(el.diam), myelin: state.myelin }); idleKey = key; }
    return idleCab;
  }
  function stimXs() { return state.s2on ? [state.el.s1, state.el.s2] : [state.el.s1]; }
  function fire2() {
    const e = envNow();
    const cab = K.makeCable({ P: K.params(e), length: CAB_L, diam: val(el.diam), myelin: state.myelin });
    const xs = stimXs();
    xs.forEach(function (x) { cab.stims.push({ x0: Math.max(0, x - CAB_HALF), x1: Math.min(CAB_L, x + CAB_HALF), t0: CAB_T0, dur: CAB_DUR, amp: CAB_AMP }); });
    run2 = { cab: cab, playing: true, xs: xs.slice(), r1: state.el.r1, r2: state.el.r2, tr: { t: [0], v1: [cab.rest], v2: [cab.rest] },
      env: e, key: envKey(e), diam: val(el.diam), myelin: state.myelin, nextRec: 0.01, arrived: [false, false], stimSnd: false };
    $('status2').textContent = T('刺激！看衝動沿著軸突往兩邊跑。', 'Stimulus! Watch the impulse run both ways along the axon.');
    if (reducedMotion) { while (run2.playing) advance2(1e9, 1e9); }
    lastT = 0;
    request();
  }
  function vAt(cab, x) {
    const u = x / cab.dx, i = Math.max(0, Math.min(cab.N - 2, Math.floor(u))), f = Math.max(0, Math.min(1, u - i));
    return cab.V[i] + (cab.V[i + 1] - cab.V[i]) * f;
  }
  /** 讓軸突前進 dtSim 毫秒（最多花 budget 毫秒的運算時間） */
  function advance2(dtSim, budget) {
    const r = run2;
    if (!r || !r.playing) return;
    const cab = r.cab;
    const tTarget = cab.t + dtSim;
    const t0 = performance.now();
    let k = 0;
    while (cab.t < tTarget - 1e-9) {
      K.cableStep(cab);
      if (cab.t >= r.nextRec - 1e-9) {
        r.tr.t.push(cab.t); r.tr.v1.push(vAt(cab, r.r1)); r.tr.v2.push(vAt(cab, r.r2));
        r.nextRec += 0.01;
      }
      if ((cab.t > 2 && !K.cableActive(cab)) || cab.t >= 40) { finish2(); return; }
      if (++k % 20 === 0 && performance.now() - t0 > budget) break;
    }
    // 到達記錄電極的聲音
    [r.r1, r.r2].forEach(function (x, j) {
      if (!r.arrived[j] && !isNaN(K.crossTime(cab, x))) { r.arrived[j] = true; sndArrive(j); }
    });
    if (!r.stimSnd && cab.t >= CAB_T0) { r.stimSnd = true; sndStim(); }
  }
  function finish2() {
    const r = run2;
    if (!r || !r.playing) return;
    r.playing = false;
    const cab = r.cab;
    const sum = K.cableSummary(cab);
    const v = K.velocity(cab, r.r1, r.r2);
    const xs = r.xs, single = xs.length === 1;
    const clean = single && Math.abs(r.r1 - xs[0]) >= 1 && Math.abs(r.r2 - xs[0]) >= 1 &&
      [r.r1, r.r2].every(function (x) { return x >= 0.5 && x <= CAB_L - 0.5; });
    const reachedFar = single ? (xs[0] < CAB_L / 2 ? sum.right : sum.left) : (sum.left && sum.right);
    r.sum = sum; r.v = v;
    const data = {
      diam: r.diam, myelin: r.myelin, T: r.env.T, ttx: r.env.ttx, tea: r.env.tea, kOut: r.env.kOut, naOut: r.env.naOut, env: r.key,
      nStim: xs.length, xs: xs.slice(), r1: r.r1, r2: r.r2, dist: Math.abs(r.r2 - r.r1), v: isFinite(v) ? v : null,
      clean: clean, reachedFar: reachedFar, left: sum.left, right: sum.right, collided: sum.collided, xMeet: sum.collided ? sum.xMeet : null,
      vRef: null
    };
    r.data = data;
    addRow2(r);
    const msg = status2For(r);
    $('status2').textContent = msg; say(msg);
    updateReadouts2();
    const go = function () { emit('cable', data); };
    if (r.env.ttx > 0 && clean) {
      // 比較用：同一條軸突、同樣的電極，但沒有河豚毒素時的速度
      setTimeout(function () {
        const e0 = Object.assign({}, r.env, { ttx: 0 });
        const k = envKey(e0) + '|' + r.diam + '|' + r.myelin + '|' + [xs[0], r.r1, r.r2].join(',');
        if (!vRefCache.has(k)) {
          vRefCache.set(k, K.measureVelocity({ P: K.params(e0), length: CAB_L, diam: r.diam, myelin: r.myelin, x0: xs[0], x1: r.r1, x2: r.r2, stimAmp: CAB_AMP, tMax: 40 }).v);
        }
        data.vRef = vRefCache.get(k);
        updateReadouts2();
        go();
      }, 0);
    } else go();
    request();
  }
  const vRefCache = new Map();
  function status2For(r) {
    const d = r.data, s = r.sum;
    if (d.collided) return T('兩道衝動在 ' + num(d.xMeet, 1) + ' cm 處迎面相撞，一起消失了——剛走過的地方正處在不反應期。', 'The two impulses met head-on at ' + num(d.xMeet, 1) + ' cm and both vanished — the membrane each had just crossed was refractory.');
    if (!s.left && !s.right && s.crossed < 0.2 * r.cab.N) return T('衝動沒有傳出去：刺激點附近興奮之後，就在原地熄滅了。', 'The impulse did not propagate: the membrane near the electrode fired and the activity died out there.');
    if (!(s.left && s.right)) return T('衝動傳到一半就熄滅了（傳導失敗）。', 'The impulse died out part of the way (conduction failure).');
    if (d.v == null) return T('衝動傳到兩端了，但兩個記錄電極沒有都量到（把它們移到衝動經過的地方）。', 'The impulse reached both ends, but the recording electrodes did not both catch it (move them where it passes).');
    return T('傳導速度 ', 'Conduction velocity ') + num(d.v, 1) + T(' m/s（R1 與 R2 相距 ', ' m/s (R1 and R2 are ') + num(d.dist, 2) + T(' cm）。', ' cm apart).');
  }
  function addRow2(r) {
    runNo2++;
    const d = r.data;
    const res = d.collided ? T('對撞', 'collision') : (d.left && d.right) ? T('傳到兩端', 'both ends') : T('傳導失敗', 'failed');
    rows2.unshift({ no: runNo2, d: num(d.diam, 0), my: d.myelin ? T('有', 'yes') : T('無', 'no'), env: envShort(r.env), v: d.v != null ? num(d.v, 2) : '—', res: res, ok: d.v != null });
    if (rows2.length > 10) rows2.pop();
    renderRows2();
  }
  function renderRows2() {
    const t = $('runs2');
    if (!rows2.length) { t.innerHTML = ''; return; }
    let h = '<thead><tr><th>#</th><th>' + T('直徑（µm）', 'Diameter (µm)') + '</th><th>' + T('髓鞘', 'Myelin') + '</th><th>' + T('條件', 'Conditions') + '</th><th>' +
      T('速度（m/s）', 'Speed (m/s)') + '</th><th>' + T('結果', 'Result') + '</th></tr></thead><tbody>';
    rows2.forEach(function (x) {
      h += '<tr><td>' + x.no + '</td><td>' + x.d + '</td><td>' + x.my + '</td><td>' + x.env + '</td><td' + (x.ok ? ' class="yes"' : '') + '>' + x.v + '</td><td>' + x.res + '</td></tr>';
    });
    t.innerHTML = h + '</tbody>';
  }
  function updateReadouts2() {
    const r = run2;
    let h = '<dt>' + T('電極位置', 'Electrodes') + '</dt><dd>S1 ' + num(state.el.s1, 2) + ' cm' + (state.s2on ? T('，S2 ', ', S2 ') + num(state.el.s2, 2) + ' cm' : '') +
      '<br>R1 ' + num(state.el.r1, 2) + T(' cm，R2 ', ' cm, R2 ') + num(state.el.r2, 2) + ' cm</dd>';
    if (r && r.data) {
      const d = r.data;
      const t1 = K.crossTime(r.cab, r.r1), t2 = K.crossTime(r.cab, r.r2);
      h += '<dt>' + T('衝動到達時刻', 'Arrival times') + '</dt><dd>R1 ' + (isNaN(t1) ? '—' : num(t1, 3) + ' ms') + '<br>R2 ' + (isNaN(t2) ? '—' : num(t2, 3) + ' ms') + '</dd>';
      h += '<dt>' + T('傳導速度', 'Conduction velocity') + '</dt><dd>' + (d.v != null ? num(d.v, 2) + ' m/s<small>' + T('＝ 距離 ', '= distance ') + num(d.dist, 2) + T(' cm ÷ 時間差 ', ' cm ÷ time difference ') + num(Math.abs(t2 - t1), 3) + ' ms</small>' : '—') + '</dd>';
      if (d.vRef != null && isFinite(d.vRef)) h += '<dt>' + T('沒有河豚毒素時', 'Without tetrodotoxin') + '</dt><dd>' + num(d.vRef, 2) + ' m/s' + (d.v != null ? T('（現在是 ', ' (now ') + num(100 * d.v / d.vRef, 0) + T('%）', '%)') : '') + '</dd>';
    } else if (r && r.playing) {
      h += '<dt>' + T('時間', 'Time') + '</dt><dd>' + num(r.cab.t, 2) + ' ms</dd>';
    }
    $('ro2').innerHTML = h;
  }

  // ---------- 繪圖 ----------
  function vColor(v, rest) {
    const u = Math.max(0, Math.min(1, (v - rest) / 95));
    const base = D.dark ? D.shade(C['ap-axo'], 0.12) : D.shade(C['ap-axo'], -0.04);
    if (v < rest) return D.mix(base, C['ap-k'], Math.min(0.3, (rest - v) / 40));
    return D.mix(base, C['ap-v'], Math.pow(u, 0.8));
  }
  function electrodes() {
    const a = [{ id: 's1', x: state.el.s1, up: true, name: 'S1', col: C['ap-stim'] }];
    if (state.s2on) a.push({ id: 's2', x: state.el.s2, up: true, name: 'S2', col: C['ap-stim'] });
    a.push({ id: 'r1', x: state.el.r1, up: false, name: 'R1', col: C['ap-r1'] }, { id: 'r2', x: state.el.r2, up: false, name: 'R2', col: C['ap-r2'] });
    return a;
  }
  function draw2() {
    if (!L2) return;
    const g = ctx2;
    D.backdrop(g, W2, H2);
    const cab = curCable();
    const G = geom2(), p = L2.prof;
    const rest = cab.rest;
    // ---- V(x) ----
    plotFrame(g, p);
    const lo = -90, hi = 60;
    const yP = function (v) { return p.y1 - (p.y1 - p.y0) * (v - lo) / (hi - lo); };
    yTicks(g, p, lo, hi, L2.narrow ? 50 : 30, function (v) { return num(v, 0); }, yP);
    g.save(); g.beginPath(); g.rect(p.x0, p.y0 - 3, p.x1 - p.x0, p.y1 - p.y0 + 6); g.clip();
    // 曲線下的淡色面
    g.beginPath(); g.moveTo(xPx(0), yP(rest));
    for (let i = 0; i < cab.N; i++) g.lineTo(xPx(i * cab.dx), yP(cab.V[i]));
    g.lineTo(xPx(CAB_L), yP(rest)); g.closePath();
    g.fillStyle = D.alpha(C['ap-v'], 0.12); g.fill();
    g.beginPath();
    for (let i = 0; i < cab.N; i++) { const X = xPx(i * cab.dx), Y = yP(cab.V[i]); if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }
    g.strokeStyle = C['ap-v']; g.lineWidth = 2; g.stroke();
    g.restore();
    D.haloText(g, T('此刻沿軸突的膜電位（mV）', 'Membrane potential along the axon now (mV)'), p.x0 + 4, p.y0 + 7, C['ap-v'], 'left', 'middle', '600 11.5px ' + FONT);
    // 位置刻度（cm）
    g.font = '11px ' + FONT; g.fillStyle = D.c.muted; g.textAlign = 'center'; g.textBaseline = 'top';
    const xs = L2.narrow ? 2 : 1;
    for (let x = 0; x <= CAB_L; x += xs) g.fillText(String(x), xPx(x), p.y1 + 6);
    g.textAlign = 'right'; g.fillText('cm', p.x0 - 8, p.y1 + 6);
    // ---- 軸突 ----
    const ay = G.ay, rA = G.rA;
    const xa = xPx(0), xb = xPx(CAB_L);
    g.save();
    D.roundRect(g, xa - 2, ay - rA, xb - xa + 4, 2 * rA, rA);
    g.clip();
    const step = Math.max(1, Math.floor(cab.N / ((xb - xa) / 1.5)));
    for (let i = 0; i < cab.N; i += step) {
      const x0 = xPx(i * cab.dx), x1 = xPx(Math.min(CAB_L, (i + step) * cab.dx)) + 0.8;
      g.fillStyle = vColor(cab.V[i], rest);
      g.fillRect(x0, ay - rA, x1 - x0, 2 * rA);
    }
    const sh = g.createLinearGradient(0, ay - rA, 0, ay + rA);
    sh.addColorStop(0, 'rgba(255,255,255,' + (D.dark ? 0.18 : 0.45) + ')');
    sh.addColorStop(0.35, 'rgba(255,255,255,0)');
    sh.addColorStop(0.75, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(0,0,0,' + (D.dark ? 0.4 : 0.22) + ')');
    g.fillStyle = sh; g.fillRect(xa - 2, ay - rA, xb - xa + 4, 2 * rA);
    g.restore();
    D.roundRect(g, xa - 2, ay - rA, xb - xa + 4, 2 * rA, rA);
    g.strokeStyle = D.alpha(D.shade(C['ap-axo'], -0.5), 0.6); g.lineWidth = 1; g.stroke();
    // 髓鞘（示意）：蘭氏結之間包著一節一節的髓鞘
    if (cab.myelin) {
      const gap = 0.5, rM = rA + 6;
      for (let k = 0; k * gap < CAB_L - 1e-9; k++) {
        const a = xPx(k * gap) + 3.5, b = xPx((k + 1) * gap) - 3.5;
        if (b - a < 4) continue;
        const gr = g.createLinearGradient(0, ay - rM, 0, ay + rM);
        gr.addColorStop(0, D.shade(C['ap-myelin'], 0.5));
        gr.addColorStop(0.45, C['ap-myelin']);
        gr.addColorStop(1, D.shade(C['ap-myelin'], -0.25));
        D.roundRect(g, a, ay - rM, b - a, 2 * rM, Math.min(rM, (b - a) / 2));
        g.globalAlpha = 0.9; g.fillStyle = gr; g.fill(); g.globalAlpha = 1;
        g.strokeStyle = D.alpha(D.shade(C['ap-myelin'], -0.5), 0.6); g.lineWidth = 1; g.stroke();
      }
    }
    // ---- 電極 ----
    const sel = kb2 && kb2.focused() ? kbItems[kb2.index()].id : null;
    electrodes().forEach(function (e) {
      const X = xPx(e.x);
      const tip = e.up ? ay - rA + 2 : ay + rA - 2;
      const end = e.up ? ay - rA - 30 : ay + rA + 30;
      g.strokeStyle = D.shade(e.col, -0.15); g.lineWidth = 2.4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(X, end); g.lineTo(X, tip); g.stroke();
      g.strokeStyle = D.alpha('#ffffff', D.dark ? 0.25 : 0.6); g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(X - 0.7, end); g.lineTo(X - 0.7, tip); g.stroke();
      const b = D.pill(g, e.name, X, e.up ? end : end + 19, e.col, 'center', '700 12px ' + FONT);
      if (sel === e.id || (drag && drag.id === e.id)) {
        D.roundRect(g, b.x - 3, b.y - 3, b.w + 6, b.h + 6, (b.h + 6) / 2);
        g.strokeStyle = D.c.accent; g.lineWidth = 2; g.stroke();
      }
      if (run2 && run2.playing && e.up && run2.cab.t >= CAB_T0 && run2.cab.t <= CAB_T0 + CAB_DUR) D.ripple(g, X, ay, rA + 2, (run2.cab.t - CAB_T0) / CAB_DUR, e.col);
    });
    if (cab.myelin) D.haloText(g, T('髓鞘（示意）', 'Myelin (illustrative)'), xb, ay - rA - 14, D.shade(C['ap-myelin'], D.dark ? 0 : -0.55), 'right', 'middle', '600 11px ' + FONT);
    // ---- 示波器：R1、R2 的電壓 ----
    const sc = G.scope;
    plotFrame(g, sc);
    const tr = run2 ? run2.tr : null;
    const tNow = run2 ? run2.cab.t : 0;
    const tWin = Math.max(10, Math.ceil(tNow / 5) * 5);
    const xT = function (t) { return sc.x0 + (sc.x1 - sc.x0) * t / tWin; };
    const yT = function (v) { return sc.y1 - (sc.y1 - sc.y0) * (v - lo) / (hi - lo); };
    yTicks(g, sc, lo, hi, L2.narrow ? 50 : 50, function (v) { return num(v, 0); }, yT);
    timeTicks(g, sc, tWin, niceStep(tWin, L2.narrow ? 4 : 8), xT);
    if (tr) {
      g.save(); g.beginPath(); g.rect(sc.x0, sc.y0 - 3, sc.x1 - sc.x0, sc.y1 - sc.y0 + 6); g.clip();
      g.lineJoin = 'round';
      g.strokeStyle = C['ap-r1']; g.lineWidth = 1.9; series(g, tr.t, tr.v1, tWin, xT, yT);
      g.strokeStyle = C['ap-r2']; g.lineWidth = 1.9; series(g, tr.t, tr.v2, tWin, xT, yT);
      g.restore();
      // Δt
      const t1 = K.crossTime(run2.cab, run2.r1), t2 = K.crossTime(run2.cab, run2.r2);
      if (!isNaN(t1) && !isNaN(t2)) {
        const yb = yT(K.SPIKE_V);
        g.strokeStyle = D.alpha(D.c.text, 0.55); g.lineWidth = 1;
        g.beginPath(); g.moveTo(xT(t1), yb - 6); g.lineTo(xT(t1), yb + 6); g.moveTo(xT(t2), yb - 6); g.lineTo(xT(t2), yb + 6);
        g.moveTo(xT(t1), yb); g.lineTo(xT(t2), yb); g.stroke();
        D.pill(g, 'Δt = ' + num(Math.abs(t2 - t1), 3) + ' ms', Math.min(sc.x1 - 4, Math.max(xT(t1), xT(t2)) + 8), yb + 9, D.c.text, Math.max(xT(t1), xT(t2)) + 90 > sc.x1 ? 'right' : 'left', '600 11px ' + FONT);
      }
    }
    D.haloText(g, T('記錄電極量到的電壓（mV）', 'Voltage at the recording electrodes (mV)'), sc.x0 + 4, sc.y0 + 7, D.c.text, 'left', 'middle', '600 11.5px ' + FONT);
    if (run2) D.pill(g, 't = ' + num(tNow, 2) + ' ms', sc.x1 - 2, sc.y0 + 16, D.c.muted, 'right', '600 11px ' + FONT);
  }

  // ---------- 拖曳與鍵盤（電極） ----------
  let drag = null;
  function evPos(c, ev) { const r = c.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function hit2(p) {
    if (!L2) return null;
    const G = geom2();
    let best = null, bd = 24;
    electrodes().forEach(function (e) {
      const X = xPx(e.x);
      const yTop = e.up ? G.ay - G.rA - 50 : G.ay;
      const yBot = e.up ? G.ay : G.ay + G.rA + 50;
      if (p[1] < yTop || p[1] > yBot) return;
      const d = Math.abs(p[0] - X);
      if (d < bd) { bd = d; best = e; }
    });
    return best;
  }
  function setEl(id, x) {
    x = Math.round(Math.max(0, Math.min(CAB_L, x)) * 100) / 100;
    state.el[id] = x;
    updateReadouts2();
    request();
  }
  cv2.addEventListener('pointerdown', function (ev) {
    const e = hit2(evPos(cv2, ev));
    if (!e) return;
    drag = { id: e.id, dx: pxX(evPos(cv2, ev)[0]) - e.x };
    try { cv2.setPointerCapture(ev.pointerId); } catch (er) { /* 忽略 */ }
    ev.preventDefault();
    request();
  });
  cv2.addEventListener('pointermove', function (ev) {
    const p = evPos(cv2, ev);
    if (!drag) { cv2.style.cursor = hit2(p) ? 'ew-resize' : 'default'; return; }
    setEl(drag.id, Math.round((pxX(p[0]) - drag.dx) / 0.05) * 0.05);
  });
  const endDrag = function () { if (drag) { drag = null; request(); } };
  cv2.addEventListener('pointerup', endDrag);
  cv2.addEventListener('pointercancel', endDrag);
  const kbItems = [
    { id: 's1', name: function () { return T('刺激電極 S1', 'Stimulating electrode S1'); } },
    { id: 'r1', name: function () { return T('記錄電極 R1', 'Recording electrode R1'); } },
    { id: 'r2', name: function () { return T('記錄電極 R2', 'Recording electrode R2'); } },
    { id: 's2', name: function () { return T('第二個刺激電極 S2', 'Second stimulating electrode S2') + (state.s2on ? '' : T('（未啟用）', ' (off)')); } }
  ].map(function (it) {
    it.move = function (dx, dy, big) {
      if (it.id === 's2' && !state.s2on) return false;
      const d = dx || dy;
      if (!d) return false;
      setEl(it.id, state.el[it.id] + d * (big ? 0.5 : 0.05));
      return true;
    };
    it.describe = function () { return it.name() + T('：', ': ') + num(state.el[it.id], 2) + ' cm'; };
    return it;
  });
  const kb2 = window.LabKeys ? window.LabKeys.attach(cv2, {
    label: T('軸突與電極：按 Enter 切換電極，左右方向鍵移動（加 Shift 一次 0.5 cm）。', 'Axon and electrodes: press Enter to pick an electrode, left/right arrows to move it (Shift for 0.5 cm steps).'),
    items: kbItems, onChange: function () { request(); }
  }) : null;

  // =====================================================================
  // 動畫迴圈
  // =====================================================================
  let raf = 0, lastT = 0;
  function request() { if (!raf) raf = requestAnimationFrame(tick); }
  function tick(now) {
    raf = 0;
    const dtReal = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0;
    lastT = now;
    const spd = val(el.spd);
    let more = false;
    // 膜片播放
    if (run1 && run1.playing) {
      const s = sampleAt(run1, run1.head);
      const fast = run1.mode === 'step' ? 1 : (s.V > -58 || Math.abs(s.I) > 0 ? 1 : 3.5);
      const base = run1.mode === 'step' ? 22 : 4.5;
      const prev = run1.head;
      run1.head = Math.min(run1.tEnd, run1.head + dtReal * base * fast * spd);
      // 刺激與動作電位的聲音
      run1.pulses.forEach(function (p) { if (prev < p.t0 && run1.head >= p.t0) sndStim(); });
      if (run1.mode === 'step' && prev < run1.stim.step.t0 && run1.head >= run1.stim.step.t0) sndStim();
      run1.an.spikes.forEach(function (sp) { if (prev < sp.tPeak && run1.head >= sp.tPeak) sndSpike(); });
      if (run1.head >= run1.tEnd) finishRun1(false);
      more = true;
    }
    if (L1) {
      const s = run1 ? sampleAt(run1, Math.min(run1.head, run1.tEnd)) : null;
      if (s) stepFlux(s, dtReal, run1.env);
      if (flux.length) more = true;
    }
    // 軸突
    if (run2 && run2.playing) {
      advance2(dtReal * 2.5 * spd, 10);
      updateReadouts2Throttled(now);
      more = true;
    }
    if (view3 && view3.active) { view3.frame(); if (view3.busy && view3.busy()) more = true; }
    else draw2();
    draw1(now);
    if (more) request(); else lastT = 0;
  }
  let lastRo2 = 0;
  function updateReadouts2Throttled(now) { if (now - lastRo2 > 250) { lastRo2 = now; updateReadouts2(); } }

  // =====================================================================
  // 控制項
  // =====================================================================
  function pressGroup(sel, attr, v) {
    document.querySelectorAll(sel).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === v)); });
  }
  function setMode(m) {
    state.mode = m;
    pressGroup('#modeSeg button', 'data-mode', m);
    $('rowDur').hidden = m === 'step';
    $('rowPair').hidden = m !== 'paired';
    const lab = $('a1Label');
    if (m === 'step') lab.innerHTML = T('持續電流（' + UA + '）', 'Steady current (' + UA + ')');
    else if (m === 'paired') lab.innerHTML = T('第一個脈衝強度（' + UA + '）', 'First pulse strength (' + UA + ')');
    else lab.innerHTML = T('刺激強度（' + UA + '）', 'Stimulus strength (' + UA + ')');
  }
  document.querySelectorAll('#modeSeg button').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
  });
  document.querySelectorAll('#plotSeg button').forEach(function (b) {
    b.addEventListener('click', function () { state.plot = b.getAttribute('data-plot'); pressGroup('#plotSeg button', 'data-plot', state.plot); legend1(); request(); });
  });
  [el.a1, el.a2, el.dur, el.gap, el.spd].forEach(function (r) { r.addEventListener('input', function () { refreshOutputs(); }); });
  function envChanged() {
    refreshOutputs();
    placeIons();
    updateReadouts1();
    if (!run2) idleCab = null;
    request();
  }
  [el.temp, el.kOut, el.naOut, el.ttx, el.tea].forEach(function (r) { r.addEventListener('input', envChanged); });
  el.diam.addEventListener('input', function () { refreshOutputs(); if (!run2 || !run2.playing) { run2 = null; } request(); if (view3) view3.rebuild(); });
  $('myelin').addEventListener('change', function () { state.myelin = this.checked; if (!run2 || !run2.playing) run2 = null; request(); if (view3) view3.rebuild(); });
  $('s2on').addEventListener('change', function () { state.s2on = this.checked; updateReadouts2(); request(); });
  $('keep').addEventListener('change', function () { state.keep = this.checked; if (!state.keep) kept = []; request(); });
  $('showE').addEventListener('change', function () { state.showE = this.checked; request(); });
  $('envReset').addEventListener('click', function () {
    setRange(el.temp, 6.3); setRange(el.kOut, 1); setRange(el.naOut, 1); setRange(el.ttx, 0); setRange(el.tea, 0);
    envChanged();
  });
  $('fire').addEventListener('click', fire);
  $('clearAll').addEventListener('click', function () {
    if (run1 && run1.playing) finishRun1(true);
    kept = []; rows1.length = 0; runNo1 = 0; renderRows1();
    run1 = null; flux = [];
    setStatus(T('已清除保留的波形與紀錄表；設定不變。', 'Kept traces and the table are cleared; the settings stay.'));
    updateReadouts1();
    request();
  });
  $('cFire').addEventListener('click', fire2);
  $('cClear').addEventListener('click', function () {
    run2 = null; rows2.length = 0; runNo2 = 0; renderRows2();
    $('status2').textContent = T('已停止並清除紀錄表；設定與電極位置不變。', 'Stopped and cleared; the settings and electrode positions stay.');
    updateReadouts2();
    request();
  });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  function legend1() {
    const sw = function (col, txt, cls) { return '<span><i' + (cls ? ' class="' + cls + '"' : '') + ' style="background:' + col + ';color:' + col + '"></i>' + txt + '</span>'; };
    let h = sw('var(--ap-v)', T('膜電位 V', 'Membrane potential V'));
    if (state.plot === 'gates') h += sw('var(--ap-na)', T('m：鈉通道的活化閘門', 'm: sodium activation gate')) + sw('var(--ap-h)', T('h：鈉通道的不活化閘門', 'h: sodium inactivation gate'), 'dash') + sw('var(--ap-k)', T('n：鉀通道的閘門', 'n: potassium gate'));
    else if (state.plot === 'g') h += sw('var(--ap-na)', T('鈉電導 g<sub>Na</sub>', 'Sodium conductance g<sub>Na</sub>')) + sw('var(--ap-k)', T('鉀電導 g<sub>K</sub>', 'Potassium conductance g<sub>K</sub>'));
    else h += sw('var(--ap-na)', T('鈉電流 I<sub>Na</sub>', 'Sodium current I<sub>Na</sub>')) + sw('var(--ap-k)', T('鉀電流 I<sub>K</sub>', 'Potassium current I<sub>K</sub>')) + sw('var(--muted)', T('漏電流 I<sub>L</sub>', 'Leak current I<sub>L</sub>'), 'dash');
    h += sw('var(--ap-stim)', T('刺激電流', 'Stimulus current'));
    h += '<span><i class="dot" style="background:var(--ap-na)"></i>Na<sup>+</sup></span><span><i class="dot" style="background:var(--ap-k)"></i>K<sup>+</sup></span>';
    $('legend').innerHTML = h;
  }
  function legend2() {
    const sw = function (col, txt) { return '<span><i style="background:' + col + '"></i>' + txt + '</span>'; };
    $('legend2').innerHTML = sw('var(--ap-stim)', T('S：刺激電極', 'S: stimulating electrode')) + sw('var(--ap-r1)', T('R1：記錄電極', 'R1: recording electrode')) +
      sw('var(--ap-r2)', T('R2：記錄電極', 'R2: recording electrode')) + sw('var(--ap-v)', T('膜電位（顏色越紅越高）', 'Membrane potential (redder = higher)'));
  }

  // =====================================================================
  // 3D 檢視：切換到 3D 時才載入 js/action-potential-3d.js 與 three.js；切回 2D 時整個釋放。
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage2'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    K: K, T: T, D: D, num: num, reducedMotion: reducedMotion, CAB_L: CAB_L,
    colors: function () { return C; },
    cable: function () { return curCable(); },
    run: function () { return run2; },
    electrodes: electrodes,
    diam: function () { return val(el.diam); },
    myelin: function () { return state.myelin; },
    request: function () { request(); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.AP3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.AP3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/action-potential-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.AP3D) throw new Error('action-potential-3d.js did not load');
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
        view3 = window.AP3D.create(lib, host3, bridge);
        stage.classList.add('is3d');
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
      resize2();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize2();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ---------- 分享目前設定：電極位置（滑桿與按鈕由 classroom.js 記錄） ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { e: [state.el.s1, state.el.s2, state.el.r1, state.el.r2] }; },
    set: function (o) {
      if (!o || !Array.isArray(o.e) || o.e.length !== 4) return;
      ['s1', 's2', 'r1', 'r2'].forEach(function (k, i) { const x = +o.e[i]; if (isFinite(x)) state.el[k] = Math.max(0, Math.min(CAB_L, x)); });
      state.s2on = $('s2on').checked; state.myelin = $('myelin').checked;
      updateReadouts2(); request();
    }
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  // 預設：刺激強度 20 µA/cm²、0.5 ms；第二個脈衝 40 µA/cm²
  setRange(el.a1, 20); setRange(el.a2, 40); setRange(el.dur, 0.5); setRange(el.diam, 476);
  // 細胞外濃度、動畫速度的預設位置 0 剛好落在滑桿刻度上（＝正常值 1 倍），不必另外設定
  state.keep = $('keep').checked; state.showE = $('showE').checked;
  state.myelin = $('myelin').checked; state.s2on = $('s2on').checked;
  setMode('single');
  refreshOutputs();
  updateSoundButton();
  legend1(); legend2();
  function themeChanged() {
    readColors();
    memLayer = null;
    if (view3 && view3.active) view3.onTheme();
    legend1(); legend2();
    request();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    const watch = function (c, fn) { let lw = 0; new ResizeObserver(function () { if (c.clientWidth !== lw) { lw = c.clientWidth; fn(); } }).observe(c); };
    watch(cv, resize1); watch(cv2, resize2);
  } else window.addEventListener('resize', function () { resize1(); resize2(); });
  resize1(); resize2();
  // 一開始先顯示預設刺激的完整結果（不回報任務、不記錄）
  run1 = simulateNow();
  run1.head = run1.tEnd; run1.emitted = true;
  (function () {
    const sp = spikeSplit(run1);
    run1.data = { n: run1.an.n, rise: run1.an.rise, rate: run1.an.rate, fired1: !!sp.s1, peak1: sp.s1 ? sp.s1.peak : null, lat: sp.s1 ? sp.s1.tPeak - 2 : null };
  })();
  updateReadouts1();
  updateReadouts2();
  setStatus(T('這是 20 ' + UA + '、0.5 ms 刺激的結果。按「刺激」再做一次，或改變強度。', 'This is the response to a 20 ' + UA + ', 0.5 ms pulse. Press “Stimulate” to run it again, or change the strength.'));
  $('status2').textContent = T('按「刺激軸突」，看神經衝動怎麼沿著軸突跑。', 'Press “Stimulate the axon” and watch the impulse travel.');
  if (reducedMotion) $('status2').textContent += T('（已偵測到「減少動態效果」：直接顯示結果。）', ' (Reduced motion is on: results are shown at once.)');
  request();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastT = 0; request(); } });
  // 測試與縮圖用
  window.__ap = {
    state: state, K: K,
    run1: function () { return run1; }, run2: function () { return run2; },
    fire: fire, fire2: fire2, finish1: function () { finishRun1(false); },
    finish2: function () { while (run2 && run2.playing) advance2(1e9, 1e9); request(); },
    setEl: setEl, setView: setView
  };
})();
