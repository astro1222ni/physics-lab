/* loudness.js — 「分貝、等響曲線與聽力保護」的畫面與互動
 * （數學在 loudness-core.js；聲音一律用 music-audio.js；2D 繪圖工具 LabDraw 在 drawkit.js；3D 在 loudness-3d.js，切到 3D 時才載入）
 *
 * 畫面：上面的畫布是 ISO 226 等響曲線（10–100 phon、聽閾、響度級色階），紅點是目前的點（可拖曳、可用鍵盤移動），
 *       可「鎖定在等響曲線上」沿著一條曲線走；下面的畫布是分貝相加的長條（含距離）與 NIOSH 安全聆聽時間的圖。
 * 聲音：只有學生按「▶ 播放」或「先 1 kHz 再這個頻率」才發聲；音量溫和、有上限，只隨響度級溫和地變化（示意），
 *       聽閾以下的點不播放；音效關閉時畫面照跑，狀態列顯示提示並讓音效開關閃一下（不會自己打開音效）。
 *       這一頁的分貝都是圖上的模擬值，播放音量絕不會因為滑桿拉到 120 dB 而變大聲。
 * 任務事件：'point'、'play'、'sum'、'dose'；格式寫在 js/missions/loudness.js 的開頭。 */
(function () {
  'use strict';
  const LC = window.LoudCore;
  const D = window.LabDraw;
  const AU = window.MusicAudio;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha, shade = D.shade, mix = D.mix;
  const clamp = LC.clamp;
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const PLAY_DUR = 1.5, CMP_DUR = 1.2, CMP_GAP = 0.35;
  const GAIN_MAX = 0.32;          // 播放音量的上限（和其他音樂實驗的一般音量相同）
  const BOOST_MAX = 12;           // 依等響曲線給低音、高音多的音量，最多 +12 dB（仍在上限之下）
  const REC_MAX = 8;

  // ---------- 狀態 ----------
  const state = {
    f: 250, Lp: 60, phon: 40, locked: false,
    recs: [],
    src: { L1: 70, N: 1, L2: 64, on2: true, r: 1 },
    dz: { L: 80, h: 2 },
    playVis: null,                // { t0, dur, cmp }：畫面上的播放動畫（音效關閉時也照樣動）
    cP: null, cS: null, cD: null, // 上一次送出事件時的狀態（prev）
    hmode: 'phon'
  };
  const cur = function () { return LC.analyze(state.f, state.Lp); };
  const liteP = function () { const a = cur(); return { f: state.f, Lp: state.Lp, phon: a.phon, sone: a.sone, locked: state.locked, audible: a.audible }; };
  const mixNow = function () { return LC.mix(state.src); };
  const liteS = function () { const m = mixNow(); return { L1: m.L1, N: m.N, L2: m.L2, on2: m.on2, r: m.r, total1: m.total1, totalR: m.totalR }; };
  const liteD = function () { return { L: state.dz.L, h: state.dz.h, T: LC.nioshHours(state.dz.L), dose: LC.dose(state.dz.L, state.dz.h) }; };

  // ---------- 色彩與字體 ----------
  let C = {}, fs = 1;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'ld-curve', 'ld-thr', 'ld-pt', 'ld-lock', 'ld-s1', 'ld-s2', 'ld-sum',
      'ld-safe', 'ld-warn', 'ld-danger', 'ld-heat0', 'ld-heat1', 'ld-rec']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    fs = Math.max(1, Math.min(1.45, parseFloat(cs.getPropertyValue('--fs')) || 1));
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + (px * fs).toFixed(1) + 'px ' + FONT; }

  // ---------- 數字 ----------
  function fx(v, d) { if (v == null || !isFinite(v)) return '—'; let s = v.toFixed(d); if (/^-0(\.0+)?$/.test(s)) s = s.slice(1); return s.replace('-', '−'); }
  function sg(v, d) {
    if (v == null || !isFinite(v)) return '—';
    const s = Math.abs(v).toFixed(d);
    if (+s === 0) return (0).toFixed(d);
    return (v < 0 ? '−' : '+') + s;
  }
  function fTxt(f) { return f >= 1000 ? fx(f / 1000, f >= 10000 ? 2 : 3) + ' kHz' : fx(f, f < 100 ? 1 : 1) + ' Hz'; }
  function fShort(f) { return f >= 1000 ? fx(f / 1000, f % 1000 ? 1 : 0) + 'k' : fx(f, 0); }
  function soneTxt(n) { return n >= 10 ? fx(n, 1) : n >= 1 ? fx(n, 2) : fx(n, 3); }
  function hoursTxt(h) {
    if (!isFinite(h)) return '—';
    if (h >= 24) return T(fx(h, 0) + ' 小時（超過一整天）', fx(h, 0) + ' h (more than a day)');
    const t = LC.hms(h);
    if (t.h > 0) return T(t.h + ' 小時 ' + t.m + ' 分', t.h + ' h ' + t.m + ' min');
    if (t.m > 0) return T(t.m + ' 分 ' + t.s + ' 秒', t.m + ' min ' + t.s + ' s');
    return T(t.s + ' 秒', t.s + ' s');
  }
  function hoursShort(h) {
    if (h >= 1) return fx(h, h >= 10 ? 0 : (Math.abs(h - Math.round(h)) < 1e-9 ? 0 : 1)) + ' h';
    const m = h * 60;
    return m >= 1 ? fx(m, m >= 10 ? 0 : (Math.abs(m - Math.round(m)) < 1e-9 ? 0 : 1)) + ' min' : fx(m * 60, 0) + ' s';
  }
  const esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  function phonTxt(a) { return a.audible && a.phon != null ? fx(a.phon, 1) + ' phon' : T('聽不到', 'inaudible'); }
  function describeP(a) {
    a = a || cur();
    return fTxt(a.f) + T('、', ', ') + fx(a.Lp, 1) + ' dB' + T('：', ': ') +
      (a.audible ? fx(a.phon, 1) + ' phon' + T('，響度 ', ', loudness ') + soneTxt(a.sone) + ' sone' + T('；在 1 kHz 一樣響要 ', '; equally loud at 1 kHz: ') + fx(a.lp1k, 1) + ' dB'
        : T('低於聽閾 ' + fx(-a.above, 1) + ' dB，聽不到', fx(-a.above, 1) + ' dB below the threshold, inaudible')) + (state.locked ? T('（鎖定在 ' + fx(state.phon, 1) + ' phon）', ' (locked to ' + fx(state.phon, 1) + ' phon)') : '');
  }

  // ---------- 任務事件 ----------
  function emit(type, data) {
    if (window.LabShare && window.LabShare.restoring) return;
    if (window.LabMission) window.LabMission.emit(type, data);
  }
  function emitPoint(via, extra) {
    const a = cur(), prev = state.cP || liteP();
    emit('point', Object.assign(a, { locked: state.locked, target: state.locked ? state.phon : null, via: via, prev: prev, dLp: state.Lp - prev.Lp }, extra || {}));
    state.cP = liteP();
  }
  function emitSum(via) {
    const prev = state.cS || liteS();
    emit('sum', Object.assign(mixNow(), { via: via, prev: prev }));
    state.cS = liteS();
  }
  function emitDose(via, extra) {
    const prev = state.cD || liteD();
    emit('dose', Object.assign(liteD(), { via: via, prev: prev }, extra || {}));
    state.cD = liteD();
  }

  // =====================================================================
  // 控制項：等響曲線上的點
  // =====================================================================
  const elF = $('freq'), elFo = $('freqo'), elLp = $('lp'), elLpo = $('lpo'), elPh = $('phon'), elPho = $('phono');
  if (window.LabNum) window.LabNum.register(elF, { toValue: LC.fFromPos, toPos: LC.posFromF, min: LC.F_MIN, max: LC.F_MAX, decimals: 1 });
  /** 依目前的狀態更新點的三個滑桿與數字（停用的滑桿顯示實際使用的值） */
  function syncPoint(skip) {
    const a = cur();
    if (skip !== elF) { if (window.LabNum) window.LabNum.clear(elF); elF.value = String(Math.round(LC.posFromF(state.f))); }
    elFo.textContent = fx(state.f, state.f >= 1000 ? 0 : 1);
    if (skip !== elLp) { if (window.LabNum) window.LabNum.clear(elLp); elLp.value = String(Math.round(state.Lp * 2) / 2); }
    elLpo.textContent = fx(state.Lp, 1);
    const ph = state.locked ? state.phon : a.phon;
    if (skip !== elPh) { if (window.LabNum) window.LabNum.clear(elPh); elPh.value = String(clamp(Math.round((ph == null ? 0 : ph) * 2) / 2, LC.PHON_MIN, LC.PHON_MAX)); }
    // 沒有鎖定時，停用的響度級滑桿顯示算出來的值：聽閾以下顯示「—」，超過滑桿上限顯示「>100」
    elPho.textContent = state.locked ? fx(state.phon, 1) : (!a.audible || ph == null ? '—' : ph > LC.PHON_MAX ? '>' + LC.PHON_MAX : fx(ph, 1));
    elLp.disabled = state.locked;
    elPh.disabled = !state.locked;
    $('lock').setAttribute('aria-pressed', String(state.locked));
    $('lockHint').textContent = state.locked
      ? T('鎖定中：改頻率時，聲壓級自動沿著 ' + fx(state.phon, 1) + ' phon 的等響曲線走（聲壓級滑桿顯示算出來的值）；拖曳「響度級」換一條曲線。',
        'Locked: when you change the frequency, the level follows the ' + fx(state.phon, 1) + '-phon contour (the level slider shows the computed value); drag “Loudness level” to pick another contour.')
      : T('沒有鎖定：響度級由頻率與聲壓級算出（響度級滑桿只顯示結果）。', 'Not locked: the loudness level is computed from the frequency and the level (the loudness-level slider only shows the result).');
  }
  function pointChanged(skip) {
    syncPoint(skip);
    renderReadout(); renderQuick(); updateLabels();
    rebuild3D(); requestDraw();
  }
  function applyF(f) {
    state.f = Math.round(LC.clampF(f) * 10) / 10;
    if (state.locked) state.Lp = LC.splFromPhon(state.f, state.phon);
  }
  function setF(f, via) {
    const g = Math.round(LC.clampF(f) * 10) / 10;
    if (Math.abs(g - state.f) < 1e-9) return false;
    applyF(g);
    pointChanged();
    emitPoint(via);
    return true;
  }
  elF.addEventListener('input', function () { applyF(val(elF)); pointChanged(elF); });
  elF.addEventListener('change', function () {
    applyF(val(elF)); pointChanged(elF);
    const p = state.cP;
    if (p && Math.abs(p.f - state.f) < 1e-9 && Math.abs(p.Lp - state.Lp) < 1e-9) return;
    emitPoint('f'); say(describeP());
  });
  elLp.addEventListener('input', function () { if (state.locked) return; state.Lp = clamp(val(elLp), LC.LP_MIN, LC.LP_MAX); pointChanged(elLp); });
  elLp.addEventListener('change', function () {
    if (state.locked) return;
    state.Lp = clamp(val(elLp), LC.LP_MIN, LC.LP_MAX); pointChanged(elLp);
    const p = state.cP;
    if (p && Math.abs(p.Lp - state.Lp) < 1e-9 && Math.abs(p.f - state.f) < 1e-9) return;
    emitPoint('lp'); say(describeP());
  });
  function applyPhon(v) { state.phon = clamp(v, LC.PHON_MIN, LC.PHON_MAX); state.Lp = LC.splFromPhon(state.f, state.phon); }
  elPh.addEventListener('input', function () { if (!state.locked) return; applyPhon(val(elPh)); pointChanged(elPh); });
  elPh.addEventListener('change', function () {
    if (!state.locked) return;
    applyPhon(val(elPh)); pointChanged(elPh);
    const p = state.cP;
    if (p && Math.abs(p.Lp - state.Lp) < 1e-9 && Math.abs(p.f - state.f) < 1e-9) return;
    emitPoint('phon'); say(describeP());
  });
  $('lock').addEventListener('click', function () {
    state.locked = !state.locked;
    if (state.locked) {
      const a = cur();
      applyPhon(a.phon == null ? 0 : a.phon);
    }
    pointChanged();
    emitPoint('lock');
    say(state.locked ? T('鎖定在 ' + fx(state.phon, 1) + ' phon 的等響曲線上：改頻率時聲壓級會自動跟著走。', 'Locked to the ' + fx(state.phon, 1) + '-phon contour: the level now follows it when you change the frequency.')
      : T('解除鎖定：可以自由改聲壓級。', 'Unlocked: you can change the level freely.'));
  });
  document.querySelectorAll('[data-fq]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!setF(+b.dataset.fq, 'quick')) requestDraw();
      say(describeP());
    });
  });
  function renderQuick() {
    document.querySelectorAll('[data-fq]').forEach(function (b) { b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.fq - state.f) < 0.05)); });
    document.querySelectorAll('[data-dyn]').forEach(function (b) {
      const d = LC.DYNAMICS.find(function (x) { return x.id === b.dataset.dyn; });
      b.setAttribute('aria-pressed', String(!!d && Math.abs(d.L - state.src.L1) < 1e-9));
    });
    document.querySelectorAll('[data-hmode]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.hmode === state.hmode)); });
    $('on2').setAttribute('aria-pressed', String(state.src.on2));
  }

  // =====================================================================
  // 讀數與記錄
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  function renderReadout() {
    const a = cur();
    setHTML('rPhon', a.audible ? fx(a.phon, 1) + ' phon' + (a.valid ? '' : ' <small>' + T('（參考）', '(info.)') + '</small>') : '<span style="color:var(--muted)">' + T('聽不到', 'inaudible') + '</span>');
    setHTML('rSone', a.audible ? soneTxt(a.sone) + ' sone' : '0 sone');
    setHTML('rLp', fx(a.Lp, 1) + ' dB');
    setHTML('rThr', fx(a.thr, 1) + ' dB');
    setHTML('rAbove', '<span style="color:' + (a.audible ? 'inherit' : C['ld-thr']) + '">' + sg(a.above, 1) + ' dB</span>');
    setHTML('r1k', a.audible ? fx(a.lp1k, 1) + ' dB <small>(' + sg(a.lp1k - a.Lp, 1) + ')</small>' : '—');
    setHTML('rA', fx(a.dBA, 1) + ' dBA <small>(' + sg(a.aw, 1) + ')</small>');
    setHTML('rSlope', a.slope == null || !a.audible ? '—' : fx(a.slope, 2));
  }
  function renderRecs() {
    if (!state.recs.length) { setHTML('recWrap', '<p class="rec-empty">' + T('記下的點會列在這裡，也標在圖上。', 'Recorded points are listed here and marked on the chart.') + '</p>'); return; }
    let h = '<table class="rec"><thead><tr><th>#</th><th>' + T('頻率', 'Freq.') + '</th><th>dB</th><th>phon</th><th>sone</th></tr></thead><tbody>';
    state.recs.forEach(function (r, i) {
      h += '<tr><td>' + (i + 1) + '</td><td>' + esc(fTxt(r.f)) + '</td><td>' + fx(r.Lp, 1) + '</td><td>' + (r.audible ? fx(r.phon, 1) : '—') + '</td><td>' + (r.audible ? soneTxt(r.sone) : '0') + '</td></tr>';
    });
    setHTML('recWrap', h + '</tbody></table>');
  }
  $('rec').addEventListener('click', function () {
    const a = cur();
    state.recs.push({ f: a.f, Lp: a.Lp, phon: a.phon, sone: a.sone, audible: a.audible });
    if (state.recs.length > REC_MAX) state.recs.shift();
    renderRecs(); requestDraw();
    say(T('記下第 ' + state.recs.length + ' 個點：', 'Recorded point ' + state.recs.length + ': ') + describeP(a));
  });
  $('clear').addEventListener('click', function () {
    state.recs = [];
    renderRecs(); requestDraw();
    say(T('記下的點都清掉了；滑桿的設定不變。', 'The recorded points are cleared; the sliders are kept.'));
  });

  // =====================================================================
  // 分貝相加
  // =====================================================================
  const elL1 = $('l1'), elN = $('nsrc'), elL2 = $('l2'), elR = $('dist');
  if (window.LabNum) window.LabNum.register(elR, { toValue: LC.rFromK, toPos: LC.kFromR, min: LC.R_MIN, max: LC.R_MAX, decimals: 2 });
  function syncSum(skip) {
    const s = state.src;
    if (skip !== elL1) { if (window.LabNum) window.LabNum.clear(elL1); elL1.value = String(s.L1); }
    $('l1o').textContent = fx(s.L1, 1);
    $('nsrco').textContent = String(s.N);
    $('l2o').textContent = fx(s.L2, 1);
    elL2.disabled = !s.on2;
    if (skip !== elR) { if (window.LabNum) window.LabNum.clear(elR); elR.value = String(Math.round(LC.kFromR(s.r))); }
    $('disto').textContent = fx(s.r, 2);
  }
  function renderSum() {
    const m = mixNow();
    setHTML('sTot', fx(m.total1, 1) + ' dB');
    setHTML('sR', fx(m.totalR, 1) + ' dB');
    setHTML('sInc', sg(m.incOne, 2) + ' dB');
    setHTML('sRatio', '×' + fx(m.loudRatio, 2));
    $('sRlab').textContent = T('在距離 ' + fx(m.r, 2) + ' m 處', 'At ' + fx(m.r, 2) + ' m');
  }
  function sumChanged(skip) { syncSum(skip); renderSum(); renderQuick(); updateLabels(); requestDraw(); }
  function readSrc() {
    state.src.L1 = clamp(val(elL1), 30, 110);
    state.src.N = Math.round(clamp(val(elN), 1, 20));
    state.src.L2 = clamp(val(elL2), 30, 110);
    state.src.r = clamp(val(elR), LC.R_MIN, LC.R_MAX);
  }
  function describeS() {
    const m = mixNow();
    return T('合計（1 m 處）' + fx(m.total1, 2) + ' dB，比一個聲源 1 多 ' + sg(m.incOne, 2) + ' dB（聽起來約 ' + fx(m.loudRatio, 2) + ' 倍響）；在 ' + fx(m.r, 2) + ' m 處 ' + fx(m.totalR, 2) + ' dB。',
      'Total at 1 m ' + fx(m.total1, 2) + ' dB, ' + sg(m.incOne, 2) + ' dB more than one source 1 (about ' + fx(m.loudRatio, 2) + ' times as loud); ' + fx(m.totalR, 2) + ' dB at ' + fx(m.r, 2) + ' m.');
  }
  [[elL1, 'l1'], [elN, 'n'], [elL2, 'l2'], [elR, 'r']].forEach(function (q) {
    q[0].addEventListener('input', function () { readSrc(); sumChanged(q[0]); });
    q[0].addEventListener('change', function () {
      readSrc(); sumChanged(q[0]);
      const p = state.cS;
      if (p && p.L1 === state.src.L1 && p.N === state.src.N && p.L2 === state.src.L2 && Math.abs(p.r - state.src.r) < 1e-9) return;
      emitSum(q[1]); say(describeS());
    });
  });
  $('on2').addEventListener('click', function () {
    state.src.on2 = !state.src.on2;
    sumChanged();
    emitSum('on2'); say((state.src.on2 ? T('聲源 2 打開。', 'Source 2 on. ') : T('聲源 2 關掉。', 'Source 2 off. ')) + describeS());
  });
  document.querySelectorAll('[data-dyn]').forEach(function (b) {
    b.addEventListener('click', function () {
      const d = LC.DYNAMICS.find(function (x) { return x.id === b.dataset.dyn; });
      if (!d) return;
      if (window.LabNum) window.LabNum.clear(elL1);
      elL1.value = String(d.L);
      state.src.L1 = d.L;
      sumChanged();
      emitSum('dyn');
      say(T('力度 ' + d.id + '（' + d.zh + '）：聲源 1 約 ' + d.L + ' dB（示意值）。', 'Dynamic ' + d.id + ' (' + d.en + '): source 1 about ' + d.L + ' dB (a rough value). ') + describeS());
    });
  });

  // =====================================================================
  // 安全聆聽時間
  // =====================================================================
  const elLv = $('lv'), elH = $('hrs');
  let silentDose = false;       // 「用上面的合計」用 LabNum.set 改滑桿時，不另外送 'lv' 事件
  function syncDose(skip) {
    if (skip !== elLv) { if (window.LabNum) window.LabNum.clear(elLv); elLv.value = String(Math.round(state.dz.L * 2) / 2); }
    $('lvo').textContent = fx(state.dz.L, 1);
    $('hrso').textContent = fx(state.dz.h, 2);
  }
  function renderDose() {
    const d = liteD();
    setHTML('dT', esc(hoursTxt(d.T)));
    const col = d.dose > 100 + 1e-9 ? C['ld-danger'] : d.dose > 50 ? C['ld-warn'] : C['ld-safe'];
    setHTML('dDose', '<span style="color:' + col + '">' + fx(d.dose, d.dose >= 100 ? 0 : 1) + '%</span>');
    $('doseHint').textContent = d.dose > 100 + 1e-9
      ? T('超過一天的建議上限：聽 ' + fx(d.h, 2) + ' 小時是容許時間的 ' + fx(d.dose / 100, 1) + ' 倍。調小 3 dB，容許時間就加倍。', 'Over the daily limit: ' + fx(d.h, 2) + ' h is ' + fx(d.dose / 100, 1) + ' times the allowed time. 3 dB less doubles the allowed time.')
      : T('還在一天的建議上限之內。每加 3 dB，容許時間減半。', 'Within the daily limit. Every 3 dB more halves the allowed time.');
  }
  function doseChanged(skip) { syncDose(skip); renderDose(); updateLabels(); requestDraw(); }
  function describeD() {
    const d = liteD();
    return T(fx(d.L, 1) + ' dBA：每天容許 ' + hoursTxt(d.T) + '；聽 ' + fx(d.h, 2) + ' 小時的劑量是 ' + fx(d.dose, 1) + '%。',
      fx(d.L, 1) + ' dBA: allowed ' + hoursTxt(d.T) + ' a day; ' + fx(d.h, 2) + ' h gives a dose of ' + fx(d.dose, 1) + '%.');
  }
  [[elLv, 'lv'], [elH, 'h']].forEach(function (q) {
    q[0].addEventListener('input', function () { state.dz.L = clamp(val(elLv), 70, 115); state.dz.h = clamp(val(elH), 0, 12); doseChanged(q[0]); });
    q[0].addEventListener('change', function () {
      state.dz.L = clamp(val(elLv), 70, 115); state.dz.h = clamp(val(elH), 0, 12); doseChanged(q[0]);
      if (silentDose) return;
      const p = state.cD;
      if (p && p.L === state.dz.L && p.h === state.dz.h) return;
      emitDose(q[1]); say(describeD());
    });
  });
  $('useSum').addEventListener('click', function () {
    const m = mixNow();
    const v = clamp(Math.round(m.totalR * 10) / 10, 70, 115);
    state.dz.L = v;
    silentDose = true;
    if (window.LabNum && window.LabNum.set) window.LabNum.set(elLv, v); else elLv.value = String(v);
    silentDose = false;
    doseChanged();
    emitDose('copy', { from: liteS() });
    say((Math.abs(v - m.totalR) > 0.06 ? T('合計 ' + fx(m.totalR, 1) + ' dB 超出這張卡的範圍，用 ' + fx(v, 1) + ' dBA。', 'The total ' + fx(m.totalR, 1) + ' dB is outside this card’s range; using ' + fx(v, 1) + ' dBA. ') : '') +
      T('（把合計當成 A 加權聲級，示意）', '(treating the total as an A-weighted level, roughly) ') + describeD());
  });

  // =====================================================================
  // 聲音（溫和、有上限的示意）
  // =====================================================================
  /** 播放音量：只隨響度級溫和地變化（20 phon → 上限的 1/10、90 phon → 上限），再依等響曲線給低音高音多一點（最多 +12 dB），總量不超過上限 */
  function gainFor(f, phon) {
    const P = clamp(phon == null ? 20 : phon, 20, 90);
    const base = GAIN_MAX * Math.pow(10, (P - 90) / 70);
    const boost = clamp(LC.splFromPhon(f, P) - LC.splFromPhon(1000, P), -6, BOOST_MAX);
    return Math.min(GAIN_MAX, base * Math.pow(10, boost / 20));
  }
  function soundCheck() {
    if (AU.enabled()) return true;
    say(AU.offHint());
    AU.flashSoundButton();
    return false;
  }
  function highWarn(f) { return f >= 4000 ? T('（4 kHz 以上的純音很刺耳，戴耳機的同學先把音量調小）', ' (a pure tone above 4 kHz is piercing: turn headphones down)') : ''; }
  function lowWarn(f) { return f < 200 ? T('（手機的小喇叭幾乎放不出 200 Hz 以下的聲音）', ' (phone speakers can hardly play below 200 Hz)') : ''; }
  $('play').addEventListener('click', function () {
    stopEverything();
    const a = cur();
    if (!a.audible) { say(T('這個點在聽閾以下：真實情況下聽不到，所以不播放。', 'This point is below the threshold of hearing: in reality you would hear nothing, so nothing is played.')); return; }
    const on = soundCheck();
    if (on) AU.tone({ f0: a.f, partials: [1], dur: PLAY_DUR, gain: gainFor(a.f, a.phon), attack: 0.04, release: 0.25 });
    state.playVis = { t0: performance.now(), dur: PLAY_DUR, cmp: false };
    updateStop(); requestDraw();
    emit('play', Object.assign(a, { locked: state.locked, target: state.locked ? state.phon : null, kind: 'one' }));
    if (on) say(T('播放 ', 'Playing ') + fTxt(a.f) + T('（示意音量，不是真的 ', ' (a gentle illustrative volume, not really ') + fx(a.Lp, 1) + ' dB' + T('）', ')') + highWarn(a.f) + lowWarn(a.f));
  });
  $('cmp1k').addEventListener('click', function () {
    stopEverything();
    const a = cur();
    if (!a.audible) { say(T('這個點在聽閾以下：真實情況下聽不到，所以不播放。', 'This point is below the threshold of hearing: in reality you would hear nothing, so nothing is played.')); return; }
    const on = soundCheck();
    if (on) {
      const t0 = AU.now() + 0.05;
      AU.tone({ f0: 1000, partials: [1], dur: CMP_DUR, gain: gainFor(1000, a.phon), attack: 0.04, release: 0.2, at: t0 });
      AU.tone({ f0: a.f, partials: [1], dur: CMP_DUR, gain: gainFor(a.f, a.phon), attack: 0.04, release: 0.2, at: t0 + CMP_DUR + CMP_GAP });
    }
    state.playVis = { t0: performance.now(), dur: 2 * CMP_DUR + CMP_GAP, cmp: true };
    updateStop(); requestDraw();
    emit('play', Object.assign(a, { locked: state.locked, target: state.locked ? state.phon : null, kind: 'cmp' }));
    if (on) say(T('先 1 kHz（' + fx(a.lp1k, 1) + ' dB），再 ' + fTxt(a.f) + '（' + fx(a.Lp, 1) + ' dB）：兩個都是 ' + fx(a.phon, 1) + ' phon。播放音量只是示意，你的喇叭或耳機會讓它們聽起來不一定一樣響。',
      '1 kHz (' + fx(a.lp1k, 1) + ' dB), then ' + fTxt(a.f) + ' (' + fx(a.Lp, 1) + ' dB): both are ' + fx(a.phon, 1) + ' phon. The volume is only illustrative; your speaker or headphones may not make them sound equally loud.') + highWarn(a.f) + lowWarn(a.f));
  });
  function busy() { return !!state.playVis; }
  function updateStop() { $('stop').disabled = !(AU.playing() || busy()); }
  function stopEverything() {
    state.playVis = null;
    AU.stopAll(0.08);
    updateStop(); requestDraw();
  }
  $('stop').addEventListener('click', function () { stopEverything(); say(T('已停止。', 'Stopped.')); });
  AU.onChange(function () { updateStop(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && busy()) stopEverything(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopEverything(); });

  // 狀態列、音效開關
  let sayTimer = 0;
  function say(msg) {
    const el = $('status');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () { el.textContent = msg || ''; }, 30);
  }
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
    if (ev.detail && ev.detail.name === 'sound') { updateSoundButton(); updateStop(); }
  });

  // =====================================================================
  // 等響曲線圖
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W = 600, H = 380, P = { x0: 40, y0: 30, x1: 590, y1: 350 };
  let layer = null, layerKey = '';
  const LF0 = Math.log10(LC.F_MIN), LF1 = Math.log10(LC.F_MAX);
  const X = function (f) { return P.x0 + (Math.log10(f) - LF0) / (LF1 - LF0) * (P.x1 - P.x0); };
  const Y = function (L) { return P.y1 - (L - LC.LP_MIN) / (LC.LP_MAX - LC.LP_MIN) * (P.y1 - P.y0); };
  const fOfX = function (x) { return Math.pow(10, LF0 + clamp((x - P.x0) / (P.x1 - P.x0), 0, 1) * (LF1 - LF0)); };
  const lpOfY = function (y) { return LC.LP_MIN + clamp((P.y1 - y) / (P.y1 - P.y0), 0, 1) * (LC.LP_MAX - LC.LP_MIN); };
  function layoutChart() {
    const narrow = W < 520;
    H = Math.round(clamp(W * (narrow ? 0.92 : 0.6), 300, 500) + 24 * (fs - 1));
    const head = narrow ? Math.round(36 * fs + 10) : Math.round(22 * fs + 10);
    P = { x0: Math.round(30 + 14 * fs), y0: head + 4, x1: W - 12, y1: H - Math.round(22 * fs + 10), narrow: narrow, head: head };
  }
  const CONTOURS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const NS = 180;
  function contourPts(LN) {
    const pts = [];
    for (let i = 0; i <= NS; i++) {
      const f = Math.pow(10, LF0 + (LF1 - LF0) * i / NS);
      pts.push({ f: f, L: LC.splFromPhon(f, LN), ok: LC.valid(f, LN) });
    }
    return pts;
  }
  const THR_PTS = (function () { const p = []; for (let i = 0; i <= NS; i++) { const f = Math.pow(10, LF0 + (LF1 - LF0) * i / NS); p.push({ f: f, L: LC.threshold(f) }); } return p; })();
  const CPTS = {};
  CONTOURS.forEach(function (LN) { CPTS[LN] = contourPts(LN); });
  /** 響度級的色階（亮度單調）：聽閾以下不上色 */
  function heatColor(ph) {
    const t = clamp(ph / 110, 0, 1);
    return mix(C['ld-heat0'], C['ld-heat1'], Math.pow(t, 0.9));
  }
  function buildLayer() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const key = [W, H, dpr, fs, C['canvas-bg'], C['ld-heat1'], document.documentElement.lang].join('|');
    if (layer && layerKey === key) return;
    layerKey = key;
    layer = document.createElement('canvas');
    layer.width = Math.round(W * dpr); layer.height = Math.round(H * dpr);
    const c = layer.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, W, H);
    // 響度級色階（每 4 px 一格）
    const step = 4;
    c.save();
    D.roundRect(c, P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0, 6); c.clip();
    for (let x = P.x0; x < P.x1; x += step) {
      const f = fOfX(x + step / 2), thr = LC.threshold(f);
      for (let y = P.y0; y < P.y1; y += step) {
        const L = lpOfY(y + step / 2);
        if (L <= thr) continue;
        const ph = LC.phonFromSpl(f, L);
        c.fillStyle = alpha(heatColor(ph), D.dark ? 0.55 : 0.42);
        c.fillRect(x, y, step + 0.5, step + 0.5);
      }
    }
    // 聽閾以下：斜線底紋「聽不到」
    c.beginPath();
    THR_PTS.forEach(function (p, i) { const x = X(p.f), y = Y(p.L); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
    c.lineTo(P.x1, P.y1); c.lineTo(P.x0, P.y1); c.closePath();
    c.fillStyle = alpha(C.text, D.dark ? 0.06 : 0.045); c.fill();
    c.save(); c.clip();
    c.strokeStyle = alpha(C.text, D.dark ? 0.08 : 0.07); c.lineWidth = 1;
    c.beginPath();
    for (let k = -H; k < W; k += 9) { c.moveTo(k, P.y1); c.lineTo(k + (P.y1 - P.y0), P.y0); }
    c.stroke();
    c.restore();
    // 痛覺閾附近（約 120 dB 以上，示意）
    const yP = Y(120);
    const gp = c.createLinearGradient(0, P.y0, 0, yP);
    gp.addColorStop(0, alpha(C['ld-danger'], D.dark ? 0.22 : 0.14)); gp.addColorStop(1, alpha(C['ld-danger'], 0.02));
    c.fillStyle = gp; c.fillRect(P.x0, P.y0, P.x1 - P.x0, yP - P.y0);
    c.restore();
    // 格線
    c.lineWidth = 1;
    const majorF = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
    c.strokeStyle = alpha(C.text, D.dark ? 0.05 : 0.04);
    c.beginPath();
    LC.F.forEach(function (f) { const x = Math.round(X(f)) + 0.5; c.moveTo(x, P.y0); c.lineTo(x, P.y1); });
    c.stroke();
    c.strokeStyle = alpha(C.text, D.dark ? 0.12 : 0.1);
    c.beginPath();
    majorF.forEach(function (f) { const x = Math.round(X(f)) + 0.5; c.moveTo(x, P.y0); c.lineTo(x, P.y1); });
    for (let L = 0; L <= 130; L += 10) { const y = Math.round(Y(L)) + 0.5; c.moveTo(P.x0, y); c.lineTo(P.x1, y); }
    c.stroke();
    // 1 kHz 的參考線
    c.save(); c.setLineDash([4, 4]); c.strokeStyle = alpha(C.text, 0.28); c.beginPath(); c.moveTo(X(1000), P.y0); c.lineTo(X(1000), P.y1); c.stroke(); c.restore();
    // 等響曲線（有效範圍實線，範圍外虛線）
    CONTOURS.forEach(function (LN) {
      const pts = CPTS[LN];
      const w = LN === 40 ? 2 : 1.4;
      for (let pass = 0; pass < 2; pass++) {
        const want = pass === 0;
        c.save();
        c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round';
        c.strokeStyle = alpha(C['ld-curve'], want ? (D.dark ? 0.9 : 0.85) : 0.55);
        if (!want) c.setLineDash([4, 4]);
        c.beginPath();
        let open = false;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i], q = pts[i + 1];
          const segOk = q ? (p.ok && q.ok) : p.ok;
          if (segOk === want && q) {
            if (!open) { c.moveTo(X(p.f), Y(p.L)); open = true; }
            c.lineTo(X(q.f), Y(q.L));
          } else open = false;
        }
        c.stroke();
        c.restore();
      }
      // 曲線的名字：放在 1 kHz 線的左邊一點（曲線在 1 kHz 的高度就是它的 phon 數）
      const fl = 700, yl = Y(LC.splFromPhon(fl, LN));
      if (yl > P.y0 + 6 && yl < P.y1 - 4) D.haloText(c, String(LN), X(fl) - 3, yl - 3, shade(C['ld-curve'], D.dark ? 0.1 : -0.15), 'right', 'bottom', fnt(10, 700));
    });
    // 聽閾曲線
    c.save();
    c.shadowColor = alpha(C['ld-thr'], 0.4); c.shadowBlur = 4;
    c.beginPath();
    THR_PTS.forEach(function (p, i) { const x = X(p.f), y = Y(p.L); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
    c.strokeStyle = C['ld-thr']; c.lineWidth = 2.6; c.lineJoin = 'round'; c.stroke();
    c.restore();
    const tlf = 160;
    D.pill(c, T('聽閾', 'threshold'), X(tlf), Y(LC.threshold(tlf)) + 22 * fs, C['ld-thr'], 'center', fnt(10.5, 700));
    D.haloText(c, T('聽不到', 'inaudible'), X(45), Y(20) , C.muted, 'center', 'middle', fnt(11, 600));
    D.haloText(c, T('痛覺閾附近（示意）', 'near the pain threshold (rough)'), P.x1 - 6, Y(126), shade(C['ld-danger'], D.dark ? 0.15 : -0.1), 'right', 'middle', fnt(10, 600));
    // 座標軸
    c.font = fnt(10); c.fillStyle = C.muted; c.textBaseline = 'top'; c.textAlign = 'center';
    majorF.forEach(function (f) {
      if (P.narrow && (f === 50 || f === 200 || f === 2000)) return;
      c.fillText(f >= 1000 ? (f / 1000) + 'k' : String(f), X(f), P.y1 + 4);
    });
    c.textAlign = 'right';
    c.fillText(T('頻率（Hz）', 'frequency (Hz)'), P.x1, P.y1 + 6 + 12 * fs);
    c.textBaseline = 'middle';
    for (let L = 0; L <= 130; L += P.narrow ? 20 : 10) c.fillText(String(L), P.x0 - 4, Y(L));
    c.save(); c.translate(10, (P.y0 + P.y1) / 2); c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.textBaseline = 'top';
    c.fillText(T('聲壓級（dB）', 'sound pressure level (dB)'), 0, 0); c.restore();
    // 標題
    c.font = fnt(12, 700); c.fillStyle = C.text; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(T('等響曲線（ISO 226:2003，數字是 phon）', 'Equal-loudness contours (ISO 226:2003, numbers in phon)'), 8, P.narrow ? 6 + 9 * fs : P.head / 2);
    c.font = fnt(11, 600); c.fillStyle = shade(C['ld-warn'], D.dark ? 0.1 : -0.1); c.textAlign = P.narrow ? 'left' : 'right';
    c.fillText(T('圖上的 dB 是模擬值，不是你聽到的音量', 'The dB here are simulated, not what you hear'), P.narrow ? 8 : W - 10, P.narrow ? 8 + 27 * fs : P.head / 2);
  }
  function lockedPath(LN) {
    ctx.beginPath();
    for (let i = 0; i <= NS; i++) {
      const f = Math.pow(10, LF0 + (LF1 - LF0) * i / NS), L = LC.splFromPhon(f, LN);
      if (i) ctx.lineTo(X(f), Y(L)); else ctx.moveTo(X(f), Y(L));
    }
  }
  function drawChart(now) {
    buildLayer();
    ctx.drawImage(layer, 0, 0, W, H);
    const a = cur();
    ctx.save();
    D.roundRect(ctx, P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0, 6); ctx.clip();
    if (state.locked) {
      ctx.save();
      lockedPath(state.phon);
      ctx.shadowColor = alpha(C['ld-lock'], 0.6); ctx.shadowBlur = 8;
      ctx.strokeStyle = C['ld-lock']; ctx.lineWidth = 3.2; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.restore();
    }
    // 十字準線
    const x = X(a.f), y = Y(clamp(a.Lp, LC.LP_MIN, LC.LP_MAX));
    ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = alpha(C['ld-pt'], 0.55); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, P.y1); ctx.lineTo(x, y); ctx.moveTo(P.x0, y); ctx.lineTo(x, y); ctx.stroke(); ctx.restore();
    // 同樣響的 1 kHz 點（空心）與連線
    if (a.audible && a.lp1k != null && Math.abs(a.f - 1000) > 5) {
      const y1 = Y(clamp(a.lp1k, LC.LP_MIN, LC.LP_MAX));
      ctx.save(); ctx.setLineDash([2, 3]); ctx.strokeStyle = alpha(C['ld-pt'], 0.4); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(X(1000), y1); ctx.stroke(); ctx.restore();
      ctx.beginPath(); ctx.arc(X(1000), y1, 4.5, 0, Math.PI * 2); ctx.fillStyle = C['canvas-bg']; ctx.fill();
      ctx.strokeStyle = C['ld-pt']; ctx.lineWidth = 2; ctx.stroke();
    }
    // 記下的點
    state.recs.forEach(function (r, i) {
      const rx = X(r.f), ry = Y(clamp(r.Lp, LC.LP_MIN, LC.LP_MAX)), rr = 7.5;
      ctx.save(); ctx.shadowColor = D.shadowInk(0.3); ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
      ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.fillStyle = C['ld-rec']; ctx.fill(); ctx.restore();
      ctx.fillStyle = C['canvas-bg']; ctx.font = fnt(9.5, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), rx, ry + 0.5);
    });
    // 播放中：波紋
    if (state.playVis && !D.reducedMotion()) {
      const el = (now - state.playVis.t0) / 1000;
      if (state.playVis.cmp && el < CMP_DUR + CMP_GAP / 2 && a.lp1k != null) D.ripple(ctx, X(1000), Y(clamp(a.lp1k, LC.LP_MIN, LC.LP_MAX)), 9, (el % 0.6) / 0.6, C['ld-pt']);
      else D.ripple(ctx, x, y, 9, (el % 0.6) / 0.6, C['ld-pt']);
    }
    ctx.restore();
    // 目前的點
    D.ball(ctx, x, y, 7.5, a.audible ? C['ld-pt'] : mix(C['ld-pt'], C.muted, 0.6), { shadow: true });
    if (kb && kb.focused()) {
      ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = C.accent; ctx.lineWidth = 2;
      D.roundRect(ctx, x - 14, y - 14, 28, 28, 7); ctx.stroke(); ctx.restore();
    }
    // 標籤
    const lab = a.audible ? fx(a.phon, 1) + ' phon · ' + soneTxt(a.sone) + ' sone' : T('聽不到（低於聽閾 ' + fx(-a.above, 1) + ' dB）', 'inaudible (' + fx(-a.above, 1) + ' dB below threshold)');
    ctx.font = fnt(11.5, 700);
    const tw = ctx.measureText(lab).width + 12;
    const right = x + 14 + tw < P.x1 - 2;
    const lx = right ? x + 12 : x - 12, ly = y - 10 < P.y0 + 24 ? y + 30 : y - 10;
    D.pill(ctx, lab, lx, ly, a.audible ? C['ld-pt'] : C.muted, right ? 'left' : 'right', fnt(11.5, 700));
    D.pill(ctx, fTxt(a.f) + '・' + fx(a.Lp, 1) + ' dB', lx, ly + 18 * fs + 4, C.muted, right ? 'left' : 'right', fnt(10.5, 600));
  }

  // 拖曳與點選
  let drag = null;
  function inPlot(px, py) { return px >= P.x0 - 8 && px <= P.x1 + 8 && py >= P.y0 - 8 && py <= P.y1 + 8; }
  function evPos(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
  function moveTo(px, py) {
    const f = Math.round(fOfX(px) * 10) / 10;
    state.f = LC.clampF(f);
    if (state.locked) state.Lp = LC.splFromPhon(state.f, state.phon);
    else state.Lp = Math.round(lpOfY(py) * 10) / 10;
    pointChanged();
  }
  cv.addEventListener('pointerdown', function (e) {
    const p = evPos(e);
    if (!inPlot(p.x, p.y)) return;
    drag = { id: e.pointerId };
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    moveTo(p.x, p.y);
    e.preventDefault();
  });
  cv.addEventListener('pointermove', function (e) {
    const p = evPos(e);
    if (drag && drag.id === e.pointerId) { moveTo(p.x, p.y); return; }
    cv.style.cursor = inPlot(p.x, p.y) ? 'crosshair' : 'default';
  });
  function endDrag(e) {
    if (!drag || drag.id !== e.pointerId) return;
    drag = null;
    const p = state.cP;
    if (p && Math.abs(p.f - state.f) < 1e-9 && Math.abs(p.Lp - state.Lp) < 1e-9) return;
    emitPoint('drag'); say(describeP());
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  let kb = null;
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('等響曲線圖。左右鍵改頻率（Shift 一次三分之一個八度），上下鍵改聲壓級 0.5 dB（Shift 5 dB）；鎖定在等響曲線上時，上下鍵改響度級。',
        'Equal-loudness chart. Left and right arrows change the frequency (Shift: a third of an octave); up and down arrows change the level by 0.5 dB (Shift: 5 dB); when locked to a contour, up and down change the loudness level.'),
      items: [{
        name: function () { return T('目前的點', 'Current point'); },
        move: function (dx, dy, big) {
          if (dx) {
            const g = big ? state.f * Math.pow(2, dx / 3) : LC.fFromPos(Math.round(LC.posFromF(state.f)) + 2 * dx);
            return setF(g, 'kbd');
          }
          if (dy) {
            const d = -dy * (big ? 5 : 0.5);
            if (state.locked) {
              const v = clamp(Math.round((state.phon + d) * 2) / 2, LC.PHON_MIN, LC.PHON_MAX);
              if (v === state.phon) return false;
              applyPhon(v);
            } else {
              const v = clamp(Math.round((state.Lp + d) * 2) / 2, LC.LP_MIN, LC.LP_MAX);
              if (v === state.Lp) return false;
              state.Lp = v;
            }
            pointChanged();
            emitPoint('kbd');
            return true;
          }
          return false;
        },
        describe: function () { return describeP(); }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 合計與安全時間的畫布
  // =====================================================================
  const cvS = $('cvSum'), sx = cvS.getContext('2d');
  let SW = 600, SH = 260, SL = null;
  function layoutSum() {
    const stack = SW < 560;
    const rowH = Math.round(24 * fs + 6);
    const head = Math.round(20 * fs + 8);
    const addH = head + 4 * rowH + Math.round(26 * fs) + 14;
    const timeH = Math.max(stack ? 210 : addH, Math.round(200 + 30 * (fs - 1)));
    if (stack) {
      SH = addH + 10 + timeH;
      SL = { stack: true, add: { x: 6, y: 6, w: SW - 12, h: addH - 6 }, time: { x: 6, y: addH + 10, w: SW - 12, h: timeH - 6 }, rowH: rowH, head: head };
    } else {
      SH = Math.max(addH, timeH) + 6;
      const wl = Math.round((SW - 18) * 0.54);
      SL = { stack: false, add: { x: 6, y: 6, w: wl, h: SH - 12 }, time: { x: 12 + wl, y: 6, w: SW - 18 - wl, h: SH - 12 }, rowH: rowH, head: head };
    }
  }
  function panel(c, r, title) {
    D.roundRect(c, r.x, r.y, r.w, r.h, 10);
    c.fillStyle = alpha(C.surface, D.dark ? 0.32 : 0.62); c.fill();
    c.strokeStyle = alpha(C.text, 0.08); c.lineWidth = 1; c.stroke();
    c.font = fnt(11.5, 700);
    const tw = c.measureText(title).width;
    if (tw > r.w - 16) c.font = fnt(11.5 * (r.w - 16) / tw, 700);
    c.fillStyle = C.text; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(title, r.x + 8, r.y + 6);
  }
  function levelColor(L) { return L >= 100 ? C['ld-danger'] : L >= 85 ? C['ld-warn'] : C['ld-safe']; }
  function bar(c, x0, y, x1, h, col, faint) {
    if (x1 - x0 < 1) return;
    c.save();
    c.shadowColor = D.shadowInk(D.dark ? 0.4 : 0.15); c.shadowBlur = 4; c.shadowOffsetY = 1;
    D.roundRect(c, x0, y, x1 - x0, h, Math.min(h / 2, 6));
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, alpha(shade(col, 0.22), faint ? 0.45 : 0.95)); g.addColorStop(1, alpha(shade(col, -0.12), faint ? 0.45 : 0.95));
    c.fillStyle = g; c.fill();
    c.restore();
    c.fillStyle = alpha('#ffffff', D.dark ? 0.12 : 0.3); c.fillRect(x0 + 3, y + 1.5, Math.max(0, x1 - x0 - 6), 1.2);
  }
  function drawAdd() {
    const c = sx, r = SL.add, m = mixNow();
    panel(c, r, T('分貝相加與距離', 'Adding decibels and distance'));
    c.font = fnt(10.5, 600);
    const labels = [T('聲源 1', 'Source 1') + (m.N > 1 ? ' ×' + m.N : ''), T('聲源 2', 'Source 2') + (m.on2 ? '' : T('（關）', ' (off)')), T('合計 1 m', 'Total 1 m'), T('在 ', 'At ') + fx(m.r, m.r < 10 ? 2 : 1) + ' m'];
    const lw = Math.max.apply(null, labels.map(function (s) { return c.measureText(s).width; })) + 14;
    const x0 = r.x + lw, x1 = r.x + r.w - 12;
    const LX = function (L) { return x0 + clamp(L, 0, 120) / 120 * (x1 - x0); };
    const top = r.y + SL.head + 4, rh = SL.rowH, bh = Math.round(rh * 0.62);
    const axisY = top + 4 * rh + 2;
    // 危險帶
    c.fillStyle = alpha(C['ld-warn'], D.dark ? 0.1 : 0.08); c.fillRect(LX(85), top - 2, LX(100) - LX(85), axisY - top + 2);
    c.fillStyle = alpha(C['ld-danger'], D.dark ? 0.12 : 0.09); c.fillRect(LX(100), top - 2, LX(120) - LX(100), axisY - top + 2);
    // 刻度
    c.strokeStyle = alpha(C.text, 0.12); c.lineWidth = 1; c.beginPath();
    for (let L = 0; L <= 120; L += 20) { const xx = Math.round(LX(L)) + 0.5; c.moveTo(xx, top - 2); c.lineTo(xx, axisY); }
    c.stroke();
    c.font = fnt(9.5); c.fillStyle = C.muted; c.textAlign = 'center'; c.textBaseline = 'top';
    for (let L = 0; L <= 120; L += 20) c.fillText(String(L), LX(L), axisY + 2);
    c.textAlign = 'right'; c.fillText('dB', x1, axisY + 3 + 11 * fs);
    const rows = [
      { v: m.L1n, base: m.N > 1 ? m.L1 : null, col: C['ld-s1'] },
      { v: m.on2 ? m.L2 : m.L2, col: C['ld-s2'], faint: !m.on2 },
      { v: m.total1, col: C['ld-sum'] },
      { v: m.totalR, col: levelColor(m.totalR) }
    ];
    rows.forEach(function (q, i) {
      const y = top + i * rh + (rh - bh) / 2;
      D.haloText(c, labels[i], r.x + 8, y + bh / 2 + 0.5, i === 3 ? C.text : C.muted, 'left', 'middle', fnt(10.5, i >= 2 ? 700 : 600));
      bar(c, LX(0), y, LX(q.v), bh, q.col, q.faint);
      if (q.base != null) {     // 一個聲源 1 的位置
        c.strokeStyle = alpha(C.text, 0.55); c.lineWidth = 1.5; c.setLineDash([2, 2]);
        c.beginPath(); c.moveTo(LX(q.base), y - 2); c.lineTo(LX(q.base), y + bh + 2); c.stroke(); c.setLineDash([]);
      }
      const t = fx(q.v, 1);
      c.font = fnt(10.5, 700);
      const tw = c.measureText(t).width;
      const inside = LX(q.v) - LX(0) > tw + 14;
      if (inside) { c.fillStyle = D.dark ? '#0b1220' : '#ffffff'; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(t, LX(q.v) - 6, y + bh / 2 + 0.5); }
      else D.haloText(c, t, LX(q.v) + 5, y + bh / 2 + 0.5, C.text, 'left', 'middle', fnt(10.5, 700));
    });
    // 註記：比一個聲源 1 多幾 dB、響幾倍
    const note = sg(m.incOne, 2) + ' dB ≈ ×' + fx(m.loudRatio, 2) + T(' 響', ' as loud');
    const yN = top + 2 * rh + (rh - bh) / 2;
    c.font = fnt(10.5, 700);
    const nw = c.measureText(note).width + 12;
    const nx = Math.min(x1, Math.max(LX(m.total1) + 8 + nw, x0 + nw));
    if (LX(m.total1) + 8 + nw <= x1) D.pill(c, note, LX(m.total1) + 8, yN + bh / 2 + 9 * fs, C['ld-sum'], 'left', fnt(10.5, 700));
    else D.pill(c, note, nx - nw, yN - 2, C['ld-sum'], 'left', fnt(10.5, 700));
  }
  function drawTime() {
    const c = sx, r = SL.time, d = liteD();
    panel(c, r, T('每天容許時間（NIOSH）', 'Allowed per day (NIOSH)'));
    const x0 = r.x + 40 * fs, x1 = r.x + r.w - 12, y0 = r.y + SL.head + 10, y1 = r.y + r.h - Math.round(18 * fs + 10);
    const LMIN = 79, LMAX = 112, HMIN = 1 / 60, HMAX = 16;
    const XL = function (L) { return x0 + (clamp(L, LMIN, LMAX) - LMIN) / (LMAX - LMIN) * (x1 - x0); };
    const YH = function (h) { return y1 - (Math.log2(clamp(h, HMIN, HMAX)) - Math.log2(HMIN)) / (Math.log2(HMAX) - Math.log2(HMIN)) * (y1 - y0); };
    // 格線與刻度
    c.strokeStyle = alpha(C.text, 0.1); c.lineWidth = 1; c.beginPath();
    const hTicks = [1 / 60, 1 / 4, 1, 8];
    hTicks.forEach(function (h) { const y = Math.round(YH(h)) + 0.5; c.moveTo(x0, y); c.lineTo(x1, y); });
    for (let L = 82; L <= 112; L += 6) { const xx = Math.round(XL(L)) + 0.5; c.moveTo(xx, y0); c.lineTo(xx, y1); }
    c.stroke();
    c.font = fnt(9.5); c.fillStyle = C.muted; c.textAlign = 'right'; c.textBaseline = 'middle';
    hTicks.forEach(function (h) { c.fillText(hoursShort(h), x0 - 4, YH(h)); });
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let L = 82; L <= 112; L += 6) c.fillText(String(L), XL(L), y1 + 3);
    c.textAlign = 'right'; c.fillText('dBA', x1, y1 + 3 + 11 * fs);
    // 劑量超過 100% 的區域（容許時間比聽的時間短）
    const hL = d.h > 0 ? clamp(d.h, HMIN, HMAX) : null;
    if (hL) {
      c.save();
      c.beginPath(); c.moveTo(XL(LMIN), YH(LC.nioshHours(LMIN)));
      for (let L = LMIN; L <= LMAX; L += 0.5) c.lineTo(XL(L), YH(LC.nioshHours(L)));
      c.lineTo(x1, y0); c.lineTo(x0, y0); c.closePath();
      c.clip();
      c.fillStyle = alpha(C['ld-danger'], D.dark ? 0.1 : 0.07);
      c.fillRect(XL(LC.levelForHours(hL)), y0, x1 - XL(LC.levelForHours(hL)), YH(hL) - y0 + 0.5);
      c.restore();
      c.save(); c.setLineDash([4, 4]); c.strokeStyle = alpha(C.text, 0.45); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(x0, YH(hL)); c.lineTo(x1, YH(hL)); c.stroke(); c.restore();
      D.haloText(c, T('每天聽 ', 'listening ') + hoursShort(d.h), x0 + 4, YH(hL) - 3, C.muted, 'left', 'bottom', fnt(10, 600));
    }
    // NIOSH 的線（每 3 dB 時間減半：對數座標上是直線）
    c.save();
    c.beginPath();
    for (let L = LMIN; L <= LMAX; L += 0.5) { const xx = XL(L), y = YH(LC.nioshHours(L)); if (L === LMIN) c.moveTo(xx, y); else c.lineTo(xx, y); }
    c.shadowColor = alpha(C['ld-warn'], 0.35); c.shadowBlur = 4;
    c.strokeStyle = shade(C['ld-warn'], D.dark ? 0.05 : -0.05); c.lineWidth = 2.4; c.lineJoin = 'round'; c.stroke();
    c.restore();
    // 每 3 dB 的台階點
    for (let L = 85; L <= 109; L += 3) D.ball(c, XL(L), YH(LC.nioshHours(L)), 2.6, C['ld-warn'], { shadow: false });
    D.haloText(c, '85 dBA → 8 h', XL(85) + 6, YH(8) - 2, C.muted, 'left', 'bottom', fnt(9.5, 600));
    // 目前的聲級
    const xc = XL(d.L), yc = YH(d.T);
    c.save(); c.setLineDash([3, 3]); c.strokeStyle = alpha(levelColor(d.L), 0.7); c.lineWidth = 1;
    c.beginPath(); c.moveTo(xc, y1); c.lineTo(xc, yc); c.stroke(); c.restore();
    D.ball(c, xc, yc, 6.5, levelColor(d.L), { shadow: true });
    const lab = hoursShort(d.T) + T('・劑量 ', ' · dose ') + fx(d.dose, d.dose >= 100 ? 0 : 1) + '%';
    c.font = fnt(10.5, 700);
    const tw = c.measureText(lab).width + 12;
    const right = xc + 10 + tw < x1;
    D.pill(c, lab, right ? xc + 10 : xc - 10, Math.max(y0 + 18 * fs, yc - 8), levelColor(d.L), right ? 'left' : 'right', fnt(10.5, 700));
  }

  function updateLabels() {
    const m = mixNow(), d = liteD();
    cvS.setAttribute('aria-label', T('分貝相加：聲源 1 ' + fx(m.L1, 1) + ' dB × ' + m.N + (m.on2 ? '，聲源 2 ' + fx(m.L2, 1) + ' dB' : '，聲源 2 關') + '，合計 ' + fx(m.total1, 1) + ' dB，在 ' + fx(m.r, 2) + ' m 處 ' + fx(m.totalR, 1) + ' dB。安全聆聽時間：' + fx(d.L, 1) + ' dBA 每天容許 ' + hoursTxt(d.T) + '，聽 ' + fx(d.h, 2) + ' 小時的劑量 ' + fx(d.dose, 1) + '%。',
      'Adding decibels: source 1 ' + fx(m.L1, 1) + ' dB × ' + m.N + (m.on2 ? ', source 2 ' + fx(m.L2, 1) + ' dB' : ', source 2 off') + ', total ' + fx(m.total1, 1) + ' dB, ' + fx(m.totalR, 1) + ' dB at ' + fx(m.r, 2) + ' m. Safe listening: ' + fx(d.L, 1) + ' dBA allows ' + hoursTxt(d.T) + ' a day; ' + fx(d.h, 2) + ' h gives a dose of ' + fx(d.dose, 1) + '%.'));
  }

  // =====================================================================
  // 尺寸、動畫迴圈
  // =====================================================================
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth || cv.parentElement.clientWidth || 600;
    layoutChart();
    cv.style.height = H + 'px';
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layer = null;
    SW = cvS.clientWidth || W;
    layoutSum();
    cvS.style.height = SH + 'px';
    cvS.width = Math.round(SW * dpr); cvS.height = Math.round(SH * dpr);
    sx.setTransform(dpr, 0, 0, dpr, 0, 0);
    requestDraw();
  }
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    const now = performance.now();
    let more = false;
    if (state.playVis) {
      if ((now - state.playVis.t0) / 1000 > state.playVis.dur + 0.2) { state.playVis = null; updateStop(); }
      else more = true;
    }
    const is3 = view3 && view3.active;
    if (!is3) drawChart(now);
    D.backdrop(sx, SW, SH);
    drawAdd(); drawTime();
    if (is3) view3.frame();
    if (more) requestDraw();
  }

  // =====================================================================
  // 3D：切換到 3D 時才載入 js/loudness-3d.js 與 three.js
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    LC: LC, T: T, D: D,
    colors: function () { return C; },
    fs: function () { return fs; },
    data: function () { const a = cur(); return { f: state.f, Lp: state.Lp, phon: a.phon, sone: a.sone, audible: a.audible, slope: a.slope, locked: state.locked, lockPhon: state.phon, mode: state.hmode }; },
    fx: fx, sg: sg, fTxt: fTxt, soneTxt: soneTxt,
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 等響曲線。', 'The 3D graphics context was lost, so the view switched back to the 2D contours.');
    }
  };
  function rebuild3D() { if (view3 && view3.active) view3.rebuild(); }
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Loudness3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Loudness3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/loudness-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Loudness3D) throw new Error('loudness-3d.js did not load');
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
        view3 = window.Loudness3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        requestDraw();
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
      $('resetCam').hidden = true;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 等響曲線。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D contours are kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  document.querySelectorAll('[data-hmode]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (state.hmode === b.dataset.hmode) return;
      state.hmode = b.dataset.hmode;
      renderQuick();
      if (view3 && view3.active) view3.setMode(state.hmode);
      say(state.hmode === 'phon'
        ? T('高度：響度級（phon）。等響曲線就是曲面的等高線。', 'Height: loudness level (phon). The equal-loudness contours are its contour lines.')
        : T('高度：響度（sone）。每多 10 phon 高度加倍，所以大聲的地方陡然升高。', 'Height: loudness (sone). Every 10 phon doubles the height, so the loud corner shoots up.'));
    });
  });

  // ---------- 分享目前設定：點（精確值）、鎖定、記下的點、距離與聲源 2（其他滑桿由 classroom.js 記錄） ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { f: state.f, Lp: state.Lp, ph: state.phon, lk: state.locked, r: state.src.r, o2: state.src.on2, recs: state.recs.map(function (r) { return [r.f, r.Lp]; }) }; },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      const okNum = function (v) { return typeof v === 'number' && isFinite(v); };
      if (okNum(o.f)) state.f = LC.clampF(o.f);
      if (okNum(o.Lp)) state.Lp = clamp(o.Lp, LC.LP_MIN, LC.LP_MAX);
      if (okNum(o.ph)) state.phon = clamp(o.ph, LC.PHON_MIN, LC.PHON_MAX);
      state.locked = !!o.lk;
      if (state.locked) state.Lp = LC.splFromPhon(state.f, state.phon);
      if (okNum(o.r)) state.src.r = clamp(o.r, LC.R_MIN, LC.R_MAX);
      if (typeof o.o2 === 'boolean') state.src.on2 = o.o2;
      if (Array.isArray(o.recs)) {
        state.recs = o.recs.filter(function (q) { return Array.isArray(q) && okNum(q[0]) && okNum(q[1]); }).slice(-REC_MAX).map(function (q) {
          const a = LC.analyze(q[0], clamp(q[1], LC.LP_MIN, LC.LP_MAX));
          return { f: a.f, Lp: a.Lp, phon: a.phon, sone: a.sone, audible: a.audible };
        });
      }
      readSrc(); state.src.r = okNum(o.r) ? clamp(o.r, LC.R_MIN, LC.R_MAX) : state.src.r;
      state.cP = liteP(); state.cS = liteS(); state.cD = liteD();
      syncSum(); renderSum(); renderRecs(); pointChanged();
    }
  });

  // 給測試用的介面（不影響畫面）
  window.__ld = {
    state: state, cur: cur, mix: mixNow,
    view3: function () { return view3; },
    /** 測試用：某個 (f, Lp) 在畫面上的位置 */
    chartPoint: function (f, L) { const r = cv.getBoundingClientRect(); return { x: r.left + X(f) * r.width / W, y: r.top + Y(L) * r.height / H }; },
    gainFor: gainFor
  };

  // =====================================================================
  // 啟動（不發聲、不送任務事件）
  // =====================================================================
  readColors();
  state.f = Math.round(LC.clampF(val(elF)) * 10) / 10;
  state.Lp = clamp(val(elLp), LC.LP_MIN, LC.LP_MAX);
  readSrc();
  state.src.on2 = $('on2').getAttribute('aria-pressed') === 'true';
  state.dz.L = clamp(val(elLv), 70, 115); state.dz.h = clamp(val(elH), 0, 12);
  state.cP = liteP(); state.cS = liteS(); state.cD = liteD();
  ['freq', 'lp', 'phon', 'dist'].forEach(function (id) { const s = $(id).closest('.slider'); if (s) s.setAttribute('data-share-skip', ''); });
  ['lock', 'on2', 'useSum'].forEach(function (id) { $(id).setAttribute('data-share-skip', ''); });
  document.querySelectorAll('.presets, .view-bar').forEach(function (el) { el.setAttribute('data-share-skip', ''); });
  updateSoundButton();
  syncPoint(); syncSum(); syncDose();
  renderReadout(); renderRecs(); renderSum(); renderDose(); renderQuick(); updateLabels(); updateStop();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    renderReadout(); renderRecs(); renderSum(); renderDose();
    layer = null;
    if (view3 && view3.active) view3.onTheme();
    resize();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0, lastS = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lastW || cvS.clientWidth !== lastS) { lastW = cv.clientWidth; lastS = cvS.clientWidth; resize(); }
    }).observe(stage);
  } else window.addEventListener('resize', resize);
  resize();
})();
