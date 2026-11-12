/* consonance.js — 「協和與不協和」的畫面與互動
 * （數學在 consonance-core.js；聲音一律用 music-audio.js；2D 繪圖工具 LabDraw 在 drawkit.js；3D 在 consonance-3d.js，切到 3D 時才載入）
 *
 * 畫面：上面是不協和曲線 D(r)（谷底標出整數比，游標可以拖曳；純音時標出山頂與一個臨界頻帶），
 *       左下（手機在中間）是兩個音的頻譜（下方音往上、上方音往下，重合的泛音發亮，會拍的泛音對連起來標拍頻），
 *       右下（手機在最下面）是疊加的波形與最刺耳那一對泛音的拍（響度包絡）。
 * 聲音：只有學生按「▶ 播放」「掃過一個八度」「▶ 播放和弦」才發聲；發聲中拖曳滑桿，持續音即時跟著改變。
 *       音效關閉時畫面照跑，狀態列顯示提示並讓音效開關閃一下（不會自己打開音效）。 */
(function () {
  'use strict';
  const Core = window.ConsonanceCore;
  const MT = window.MusicTheory;
  const D = window.LabDraw;
  const AU = window.MusicAudio;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const NUM = window.LabNum;
  const val = function (el) { return NUM ? NUM.value(el) : +el.value; };
  const alpha = D.alpha, shade = D.shade, mix = D.mix;
  const TAU = Math.PI * 2;
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const GAIN = 0.26;            // 一個音的音量（兩個音、三個音時再除以 √音數）
  const HARM_LIMIT = 12;        // 泛音音色最多響幾秒（MusicAudio 持續音的預設上限）
  const PURE_LIMIT = 4;         // 純音、拉伸泛音（由純正弦波組成）最多響幾秒（MusicAudio 的聽力保護）
  const HF_SKIP = 4000;         // 拉伸泛音的聲音不放 4 kHz 以上的成分
  const MAX_PINS = 4;
  const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  // ---------- 狀態 ----------
  const state = {
    f1: Core.F1_DEFAULT, r: Core.fromCents(100), r2: Core.fromCents(900),
    timbre: { mode: 'harmonic', n: 6, p: 1, s: 1.1, odd: false },
    jump: 'just',
    rsrc: 'default',          // r 最後是怎麼來的：default、slider（拖曳滑桿、拖曳曲線、打字、方向鍵）、button、sweep、share
    chordTouched: false,      // 學生動過三音和弦（之後改 r 也送 chord 事件）
    pins: [],                 // 留下的舊曲線：{ t, f1, c, d, max }
    play: null,               // 正在播放：{ kind: 'dyad' | 'chord', t0, deadline, voices, timer, mode }
    sweep: null,              // 掃過一個八度：{ t0, dur }
    drag: null,
    offHintShown: false
  };

  // ---------- 色彩與字體 ----------
  let C = {}, fs = 1;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'cs-lo', 'cs-hi', 'cs-curve', 'cs-rough', 'cs-calm', 'cs-coin', 'cs-pin', 'cs-r2']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    fs = Math.max(1, Math.min(1.45, parseFloat(cs.getPropertyValue('--fs')) || 1));
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + (px * fs).toFixed(1) + 'px ' + FONT; }

  // ---------- 數字格式 ----------
  function fx(v, d) { if (v == null || !isFinite(v)) return '—'; let s = v.toFixed(d); if (/^-0(\.0+)?$/.test(s)) s = s.slice(1); return s.replace('-', '−'); }
  function sg(v, d) {
    if (v == null || !isFinite(v)) return '—';
    const s = Math.abs(v).toFixed(d);
    if (+s === 0) return (0).toFixed(d);
    return (v < 0 ? '−' : '+') + s;
  }
  const esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  const IV_SHORT = [['同度', 'unison'], ['小二度', 'minor 2nd'], ['大二度', 'major 2nd'], ['小三度', 'minor 3rd'], ['大三度', 'major 3rd'], ['完全四度', 'perfect 4th'], ['三全音', 'tritone'],
    ['完全五度', 'perfect 5th'], ['小六度', 'minor 6th'], ['大六度', 'major 6th'], ['小七度', 'minor 7th'], ['大七度', 'major 7th'], ['八度', 'octave'], ['小九度', 'minor 9th'], ['大九度', 'major 9th']];
  const ivName = function (semis) { const x = IV_SHORT[semis] || IV_SHORT[0]; return T(x[0], x[1]); };
  /** 拉伸泛音的谷底在 (p/q)^s：找回原本的整數比（找不到傳回 null；不是拉伸泛音也傳回 null） */
  function origin(r) {
    if (state.timbre.mode !== 'stretched') return null;
    const ns = Core.nearestSimple(Math.pow(r, 1 / state.timbre.s), 10);
    return ns && Math.abs(ns.err) <= 3 ? ns : null;
  }
  /** 谷底的名稱：{ base, sup }（sup 是上標，拉伸泛音時為 s） */
  function valleyTag(r, named, p, q) {
    const o = origin(r);
    if (o) return { base: '(' + o.p + ':' + o.q + ')', sup: 's' };
    if (state.timbre.mode !== 'stretched' && named) return { base: p + ':' + q, sup: '' };
    return { base: '≈' + r.toFixed(3), sup: '' };
  }
  const tagOf = function (v) { return valleyTag(v.r, v.named, v.simple.p, v.simple.q); };
  const tagHTML = function (t) { return t.base + (t.sup ? '<sup>' + t.sup + '</sup>' : ''); };
  const tagText = function (t) { return t.sup ? T('拉伸的 ', 'stretched ') + t.base.slice(1, -1) : t.base; };
  function ratioLabel(v) { return tagText(tagOf(v)); }
  function noteOf(f) {
    const m = MT.freqToMidi(f), k = Math.round(m);
    return { name: MT.noteName(k), dev: (m - k) * 100 };
  }
  function timbreShort(t, f1) {
    const n = noteOf(f1), at = n.name + (Math.abs(n.dev) >= 0.5 ? sg(n.dev, 0) : '');
    if (t.mode === 'pure') return T('純音・', 'pure · ') + at;
    const base = (t.odd ? T('奇次 ', 'odd ') : '') + t.n + T(' 泛音', ' partials') + ' · p ' + fx(t.p, 2);
    return (t.mode === 'stretched' ? T('拉伸 s ', 'stretch s ') + fx(t.s, 3) + ' · ' : '') + base + ' · ' + at;
  }

  // ---------- 計算（快取：音色或下方音改變才重算曲線） ----------
  let CV = null, VS = null, curveKey = '', AN = null, anDirty = true, AC = null, acDirty = true;
  function ensureCurve() {
    const k = Core.timbreKey(state.timbre) + '@' + state.f1;
    if (k !== curveKey) { CV = Core.curve(state.f1, state.timbre); VS = Core.valleys(CV); curveKey = k; anDirty = true; acDirty = true; }
  }
  function analysis() {
    ensureCurve();
    if (anDirty || !AN) { AN = Core.analyze({ f1: state.f1, r: state.r, timbre: state.timbre, curve: CV, valleys: VS }); anDirty = false; }
    return AN;
  }
  function chordAnalysis() {
    ensureCurve();
    if (acDirty || !AC) { AC = Core.analyzeChord({ f1: state.f1, r1: state.r, r2: state.r2, timbre: state.timbre }); acDirty = false; }
    return AC;
  }

  // ---------- 任務事件 ----------
  function emit(type, data) {
    if (window.LabShare && window.LabShare.restoring) return;
    if (window.LabMission) window.LabMission.emit(type, data);
  }
  function stateEvent(src) { return Object.assign({}, analysis(), { rsrc: state.rsrc, src: src }); }
  function chordEvent(src) { return Object.assign({}, chordAnalysis(), { rsrc: state.rsrc, src: src }); }
  function emitChordIfTouched(src) { if (state.chordTouched) emit('chord', chordEvent(src)); }

  // =====================================================================
  // 控制項
  // =====================================================================
  const elF1 = $('f1'), elR = $('rr'), elR2 = $('r2'), elN = $('nn'), elP = $('pp'), elS = $('ss'), elOdd = $('odd');
  if (NUM) {
    NUM.register(elF1, { toValue: function (p) { return Core.F1_MIN * Math.pow(2, p / 1200); }, toPos: function (v) { return 1200 * Math.log2(v / Core.F1_MIN); }, min: Core.F1_MIN, max: Core.F1_MAX, decimals: 2 });
    NUM.register(elR, { toValue: function (p) { return Math.min(Core.R_MAX, Core.fromCents(p)); }, toPos: function (v) { return Core.cents(v); }, min: 1, max: Core.R_MAX, decimals: 4 });
    NUM.register(elR2, { toValue: function (p) { return Core.fromCents(p); }, toPos: function (v) { return Core.cents(v); }, min: 1, max: 2, decimals: 4 });
  }
  let prog = null;   // 程式改滑桿時的來源（例如音程按鈕），讓 input／change 處理知道不是學生拖曳
  function setRange(el, v, src) { prog = src; try { if (NUM) NUM.set(el, v); else { el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); } } finally { prog = null; } }
  function readControls() {
    state.f1 = clamp(val(elF1), Core.F1_MIN, Core.F1_MAX);
    state.r = clamp(val(elR), 1, Core.R_MAX);
    state.r2 = clamp(val(elR2), 1, 2);
    state.timbre.n = clamp(Math.round(val(elN)), 1, Core.N_MAX);
    state.timbre.p = clamp(val(elP), Core.P_MIN, Core.P_MAX);
    state.timbre.s = clamp(val(elS), Core.S_MIN, Core.S_MAX);
    state.timbre.odd = !!elOdd.checked;
  }
  function renderOutputs() {
    $('f1o').textContent = fx(state.f1, 2);
    $('rro').textContent = fx(state.r, 4);
    $('r2o').textContent = fx(state.r2, 4);
    $('nno').textContent = String(state.timbre.n);
    $('ppo').textContent = fx(state.timbre.p, 2);
    $('sso').textContent = fx(state.timbre.s, 3);
    const n = noteOf(state.f1);
    $('f1Note').textContent = T('約 ', '≈ ') + n.name + ' ' + sg(n.dev, 0) + T(' 音分（A4 = 440 Hz）', ' cents (A4 = 440 Hz)') + (state.f1 < 200 ? T('；手機小喇叭聽不太到 200 Hz 以下，靠泛音也聽得出音高', '; phone speakers barely play below 200 Hz, but the overtones still carry the pitch') : '');
  }

  // ---------- 頻率比 r ----------
  function rChanged(final, src) {
    anDirty = true; acDirty = true;
    renderOutputs(); renderReadouts(); renderIvButtons(); updateVoices(); update3D(false); requestDraw();
    if (final) {
      emit('ratio', stateEvent(src));
      emitChordIfTouched('ratio');
      say(rSentence());
      updateCanvasLabel();
    }
  }
  elR.addEventListener('input', function () {
    if (state.sweep && !prog) stopSweep();
    state.r = clamp(val(elR), 1, Core.R_MAX);
    state.rsrc = prog || 'slider';
    rChanged(false);
  });
  elR.addEventListener('change', function () {
    state.r = clamp(val(elR), 1, Core.R_MAX);
    state.rsrc = prog || 'slider';
    rChanged(true, prog || 'slider');
  });
  // 音程按鈕：跳到純律的比值或平均律
  const jumpBtns = document.querySelectorAll('[data-jump]');
  function renderJump() {
    jumpBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.jump === state.jump)); });
    $('jumpHint').textContent = state.jump === 'just'
      ? T('按鈕跳到純律的整數比（例如大三度 5:4）。', 'The buttons jump to just ratios (major third 5 : 4, for example).')
      : T('按鈕跳到十二平均律（每個半音 100 音分，例如大三度 400 音分）。', 'The buttons jump to equal temperament (100 cents a semitone: the major third is 400 cents).');
  }
  jumpBtns.forEach(function (b) { b.addEventListener('click', function () { state.jump = b.dataset.jump; renderJump(); renderIvButtons(); }); });
  function ivRatio(k) { if (state.jump === 'equal') return Math.pow(2, k / 12); const q = MT.INTERVALS[k].ratio; return q[0] / q[1]; }
  const ivBtns = document.querySelectorAll('[data-iv]');
  ivBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      stopSweep();
      setRange(elR, ivRatio(+b.dataset.iv), 'button');
    });
  });
  function renderIvButtons() {
    ivBtns.forEach(function (b) {
      const k = +b.dataset.iv, rr = ivRatio(k);
      b.classList.toggle('here', Math.abs(Core.cents(state.r) - Core.cents(rr)) < 0.1);
      const q = MT.INTERVALS[k].ratio;
      b.title = state.jump === 'equal' ? T('平均律 ', 'Equal temperament ') + (k * 100) + T(' 音分', ' cents') : T('純律 ', 'Just ') + q[0] + ':' + q[1] + '（' + fx(Core.cents(q[0] / q[1]), 2) + T(' 音分）', ' cents)');
    });
  }

  // ---------- 下方音 ----------
  elF1.addEventListener('input', function () {
    state.f1 = clamp(val(elF1), Core.F1_MIN, Core.F1_MAX);
    anDirty = true; acDirty = true;
    renderOutputs(); updateVoices(); scheduleHeavy();
  });
  elF1.addEventListener('change', function () {
    state.f1 = clamp(val(elF1), Core.F1_MIN, Core.F1_MAX);
    anDirty = true; acDirty = true;
    heavyNow();
    emit('f1', stateEvent('f1'));
    emitChordIfTouched('f1');
    say(T('下方音 ', 'Lower note ') + fx(state.f1, 2) + ' Hz（' + noteOf(state.f1).name + T('）。', '). ') + valleySentence());
  });

  // ---------- 音色 ----------
  const modeBtns = document.querySelectorAll('[data-mode]');
  function renderTimbre() {
    const t = state.timbre;
    modeBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === t.mode)); });
    $('nnBox').classList.toggle('off', t.mode === 'pure');
    $('ppBox').classList.toggle('off', t.mode === 'pure');
    $('oddBox').classList.toggle('off', t.mode === 'pure');
    $('ssBox').classList.toggle('off', t.mode !== 'stretched');
    let h;
    if (t.mode === 'pure') h = T('純音只有一個正弦波，沒有泛音（泛音數、衰減指數、奇次、拉伸都用不到）。', 'A pure tone is a single sine wave with no overtones (the other timbre controls do nothing).');
    else {
      const ks = t.odd ? '1, 3, 5, …' : '1, 2, 3, …';
      h = T(t.n + ' 個成分，第 k 個（k = ' + ks + '）強度 1/k<sup>' + fx(t.p, 2) + '</sup>', t.n + ' partials; partial k (k = ' + ks + ') has strength 1/k<sup>' + fx(t.p, 2) + '</sup>');
      if (t.mode === 'stretched') h += T('，頻率在 k<sup>' + fx(t.s, 3) + '</sup> 倍（示意鐘聲一類的非整數倍泛音）。「八度」的谷移到 2<sup>s</sup> = ' + fx(Math.pow(2, t.s), 4) + '。',
        ', at k<sup>' + fx(t.s, 3) + '</sup> times the fundamental (a sketch of bell-like, inharmonic overtones). The “octave” valley moves to 2<sup>s</sup> = ' + fx(Math.pow(2, t.s), 4) + '.');
      else h += T('，頻率在 k 倍（整數倍的泛音，像弦樂器、管樂器、人聲的近似）。', ', at k times the fundamental (whole-number overtones, roughly like strings, winds and voices).');
    }
    $('timbreHint').innerHTML = h;
  }
  function timbreChanged(final) {
    anDirty = true; acDirty = true;
    renderOutputs(); renderTimbre();
    if (state.play && final !== 'drag') rebuildVoices();
    if (final === true) {
      heavyNow();
      emit('timbre', stateEvent('timbre'));
      emitChordIfTouched('timbre');
      say(T('音色：', 'Timbre: ') + timbreShort(state.timbre, state.f1) + T('。', '. ') + valleySentence());
    } else scheduleHeavy();
  }
  modeBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      if (state.timbre.mode === b.dataset.mode) return;
      stopSweep();
      state.timbre.mode = b.dataset.mode;
      timbreChanged(true);
    });
  });
  [elN, elP, elS].forEach(function (el) {
    el.addEventListener('input', function () { readControls(); timbreChanged('drag'); });
    el.addEventListener('change', function () { readControls(); timbreChanged(true); });
  });
  elOdd.addEventListener('change', function () { readControls(); timbreChanged(true); });

  // ---------- 三音和弦 ----------
  elR2.addEventListener('input', function () {
    state.r2 = clamp(val(elR2), 1, 2);
    acDirty = true; state.chordTouched = true;
    renderOutputs(); renderChord(); updateVoices(); update3D(false); requestDraw();
  });
  elR2.addEventListener('change', function () {
    state.r2 = clamp(val(elR2), 1, 2);
    acDirty = true; state.chordTouched = true;
    renderOutputs(); renderChord(); update3D(false);
    emit('chord', chordEvent('r2'));
    say(chordSentence());
  });

  // ---------- 留下曲線、全部清除 ----------
  $('pin').addEventListener('click', function () {
    ensureCurve();
    state.pins.push({ t: Object.assign({}, state.timbre), f1: state.f1, c: CV.c, d: CV.d, max: CV.max });
    while (state.pins.length > MAX_PINS) state.pins.shift();
    $('clear').disabled = false;
    requestDraw();
    say(T('留下了這條曲線（' + timbreShort(state.timbre, state.f1) + '），換音色或下方音來比較。', 'Kept this curve (' + timbreShort(state.timbre, state.f1) + '): change the timbre or the lower note to compare.'));
  });
  $('clear').addEventListener('click', function () {
    state.pins = [];
    $('clear').disabled = true;
    requestDraw();
    say(T('留下的曲線都清掉了。', 'The kept curves are cleared.'));
  });

  // ---------- 讀數 ----------
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  function beatWord(beat, cb) {
    if (beat == null) return '';
    if (beat < 0.05) return T('重合，不拍', 'coincide, no beats');
    if (beat <= 15) return T('拍', 'beats');
    if (beat <= cb) return T('粗糙', 'rough');
    return T('分得開', 'apart');
  }
  function renderReadouts() {
    const a = analysis();
    setHTML('rdR', fx(a.r, 4) + ' <small>(' + fx(a.cents, 1) + T(' 音分', ' cents') + ')</small>');
    setHTML('rdIv', esc(ivName(a.iv.semis)));
    setHTML('rdDev', sg(a.iv.etDev, 1) + ' ／ ' + sg(a.iv.justDev, 1) + ' <small>(' + a.iv.p + ':' + a.iv.q + ')</small>');
    setHTML('rdF', fx(a.f1, 2) + T('、', ', ') + fx(a.f2, 2) + ' Hz');
    setHTML('rdDf', fx(a.df, 2) + ' Hz');
    setHTML('rdCb', fx(a.cb, 1) + ' Hz <small>(Δf = ' + fx(a.cbRatio, 2) + ' CB)</small>');
    setHTML('rdD', fx(a.D, 3) + ' <small>(' + T('曲線最大值的 ', '') + fx(100 * a.D / a.Dmax, 0) + '%' + T('', ' of the maximum') + ')</small>');
    if (a.pair) {
      const pr = Core.pairs(a.f1, a.r, state.timbre)[0], cb = Core.criticalBand((pr.fa + pr.fb) / 2);
      setHTML('rdPair', a.pair[0] + ' × ' + a.pair[1] + T('：', ': ') + fx(a.beat, 2) + ' Hz <small>(' + beatWord(a.beat, cb) + ')</small>');
    } else setHTML('rdPair', T('沒有（全部重合或離得很遠）', 'none (all coincide or far apart)'));
    if (a.valley) {
      const off = a.cents - a.valley.cents;
      setHTML('rdValley', tagHTML(valleyTag(a.valley.r, a.valley.named, a.valley.p, a.valley.q)) + ' <small>(' + fx(a.valley.cents, 2) + ')</small> ' +
        (Math.abs(off) <= 3 ? '<span class="ok-txt">' + T('就在谷底', 'right here') + '</span>' : sg(off, 1) + T(' 音分', ' cents')));
    } else setHTML('rdValley', T('沒有谷（純音只有一座山）', 'no valleys (one hill only)'));
    setHTML('rdCount', String(a.count12));
    setHTML('rdPeak', fx(a.dfPeak, 2) + ' Hz <small>(r = ' + fx(a.rPeak, 4) + ')</small>');
    renderChord();
  }
  function renderChord() {
    const c = chordAnalysis();
    setHTML('chF', fx(state.f1, 1) + T('、', ', ') + fx(state.f1 * state.r, 1) + T('、', ', ') + fx(state.f1 * state.r2, 1));
    setHTML('chD', fx(c.D3, 3));
    setHTML('chB', c.atBasin ? '<span class="ok-txt">' + T('是', 'yes') + '</span> <small>(' + fx(c.basin.c1, 0) + T('、', ', ') + fx(c.basin.c2, 0) + T(' 音分', ' cents') + ')</small>'
      : T('不是', 'no') + ' <small>(' + T('往低處走到 ', 'downhill to ') + fx(c.basin.c1, 0) + T('、', ', ') + fx(c.basin.c2, 0) + ')</small>');
  }
  function valleySentence() {
    const a = analysis();
    if (!VS.length) return T('曲線只有一座山，沒有谷：最刺耳的頻率差約 ' + fx(a.dfPeak, 1) + ' Hz。', 'The curve is a single hill with no valleys; the roughest difference is about ' + fx(a.dfPeak, 1) + ' Hz.');
    const list = VS.filter(function (v) { return v.cents <= 1200.001; }).map(ratioLabel).join(T('、', ', '));
    return T('1 到 2 之間有 ' + a.count12 + ' 個谷' + (list ? '：' + list : '') + '。', a.count12 + ' valleys from 1 to 2' + (list ? ': ' + list : '') + '.');
  }
  function rSentence() {
    const a = analysis();
    let s = 'r = ' + fx(a.r, 4) + T('（' + fx(a.cents, 1) + ' 音分，最接近' + ivName(a.iv.semis) + '）：D = ', ' (' + fx(a.cents, 1) + ' cents, nearest ' + ivName(a.iv.semis) + '): D = ') + fx(a.D, 3);
    const vName = a.valley ? tagText(valleyTag(a.valley.r, a.valley.named, a.valley.p, a.valley.q)) : '';
    if (a.valley) s += a.atValley ? T('，在 ' + vName + ' 的谷底', ', in the ' + vName + ' valley')
      : T('，離最近的谷底 ' + sg(a.cents - a.valley.cents, 1) + ' 音分', ', ' + sg(a.cents - a.valley.cents, 1) + ' cents from the nearest valley');
    if (a.pair) s += T('；最刺耳的一對泛音（' + a.pair[0] + ' × ' + a.pair[1] + '）拍頻 ' + fx(a.beat, 2) + ' Hz', '; roughest overtone pair (' + a.pair[0] + ' × ' + a.pair[1] + ') beats at ' + fx(a.beat, 2) + ' Hz');
    return s + T('。', '.');
  }
  function chordSentence() {
    const c = chordAnalysis();
    return T('和弦 1 : ' + fx(state.r, 4) + ' : ' + fx(state.r2, 4) + '，D3 = ', 'Chord 1 : ' + fx(state.r, 4) + ' : ' + fx(state.r2, 4) + ', D3 = ') + fx(c.D3, 3) +
      (c.atBasin ? T('，在盆地底。', ', at the bottom of a basin.') : T('，不在盆地底。', ', not at the bottom of a basin.'));
  }

  // 下方音、音色的滑桿拖曳中：重算曲線（每一幀最多一次）
  let heavyPending = false;
  function scheduleHeavy() { heavyPending = true; requestDraw(); }
  function heavyNow() {
    heavyPending = false;
    ensureCurve(); renderReadouts(); renderIvButtons(); update3D(true); updateCanvasLabel(); requestDraw();
  }

  // =====================================================================
  // 聲音
  // =====================================================================
  function soundCheck() {
    if (AU.enabled()) return true;
    say(AU.offHint());
    AU.flashSoundButton();
    return false;
  }
  function tones(kind) { const f = [state.f1, state.f1 * state.r]; if (kind === 'chord') f.push(state.f1 * state.r2); return f; }
  function limitFor(t) { return t.mode === 'harmonic' && Core.partials(t).length > 1 ? HARM_LIMIT : PURE_LIMIT; }   // 只有一個成分就是純音
  function voiceEnded() { if (state.play) setTimeout(function () { endPlay('time'); }, 0); }
  function buildVoices() {
    const p = state.play;
    p.voices = [];
    p.mode = state.timbre.mode;
    if (!AU.enabled()) return;
    const remain = (p.deadline - performance.now()) / 1000;
    if (remain <= 0.05) return;
    const t = state.timbre, P = Core.partials(t), fl = tones(p.kind), g = GAIN / Math.sqrt(fl.length);
    if (t.mode === 'harmonic') {
      const parts = P.map(function (x) { return { k: x.k, a: x.a }; });
      fl.forEach(function (f, ti) {
        const h = AU.sustain({ f0: f, partials: parts, gain: g, attack: 0.06, maxDur: remain, onEnd: voiceEnded });
        if (h) p.voices.push({ ti: ti, rho: 1, h: h });
      });
    } else {
      // 純音、拉伸泛音：每個成分一個正弦波（拉伸泛音不是整數倍，不能用同一個週期波形）
      const sum = P.reduce(function (s, x) { return s + x.a; }, 0);
      fl.forEach(function (f, ti) {
        P.forEach(function (x) {
          const fk = f * x.rho, amp = Math.max(0.0002, g * x.a / sum);
          if (fk >= HF_SKIP) return;
          const h = AU.sustain({ f0: fk, partials: [1], gain: amp, attack: 0.06, onEnd: voiceEnded });
          if (h) p.voices.push({ ti: ti, rho: x.rho, amp: amp, h: h, muted: false });
        });
      });
    }
  }
  function updateVoices() {
    const p = state.play;
    if (!p || !p.voices.length) return;
    const fl = tones(p.kind);
    p.voices.forEach(function (v) {
      const f = fl[v.ti] * v.rho;
      if (p.mode !== 'harmonic') {
        const mute = f >= HF_SKIP;
        if (mute !== v.muted) { v.muted = mute; v.h.set({ gain: mute ? 0.0001 : v.amp }, 0.05); }
      }
      v.h.set({ f0: f }, 0.04);
    });
  }
  function stopVoices(fade) { if (state.play) state.play.voices.forEach(function (v) { v.h.stop(fade == null ? 0.12 : fade); }); }
  function startPlay(kind) {
    const mode = state.timbre.mode, lim = limitFor(state.timbre), now = performance.now();
    state.play = { kind: kind, t0: now, deadline: now + lim * 1000, voices: [], timer: 0, mode: mode, short: lim === PURE_LIMIT };
    const on = soundCheck();
    if (on) buildVoices();
    state.play.timer = setTimeout(function () { endPlay('time'); }, lim * 1000);
    updateStop(); requestDraw();
    return on;
  }
  function rebuildVoices() {
    const p = state.play;
    if (!p) return;
    stopVoices(0.06);
    p.deadline = Math.min(p.deadline, p.t0 + limitFor(state.timbre) * 1000);
    if (limitFor(state.timbre) === PURE_LIMIT) p.short = true;
    clearTimeout(p.timer);
    const left = p.deadline - performance.now();
    if (left <= 50) { endPlay('time'); return; }
    p.timer = setTimeout(function () { endPlay('time'); }, left);
    buildVoices();
  }
  function endPlay(reason) {
    const p = state.play;
    if (!p) return;
    clearTimeout(p.timer);
    stopVoices(0.25);
    state.play = null;
    if (reason === 'time' && p.short && AU.enabled() && !state.sweep) say(T('純音與拉伸泛音最多響 ' + PURE_LIMIT + ' 秒（保護聽力）。按「▶ 播放」可以再聽一次。', 'Pure and stretched tones play for at most ' + PURE_LIMIT + ' seconds (hearing protection). Press “▶ Play” to hear them again.'));
    updateStop(); requestDraw();
  }
  $('play').addEventListener('click', function () {
    stopEverything();
    const on = startPlay('dyad');
    emit('listen', stateEvent('play'));
    if (on) say(T('播放：', 'Playing: ') + rSentence());
  });
  $('playChord').addEventListener('click', function () {
    stopEverything();
    state.chordTouched = true;
    const on = startPlay('chord');
    emit('chord', chordEvent('play'));
    if (on) say(T('播放和弦：', 'Playing the chord: ') + chordSentence());
  });

  // ---------- 掃過一個八度 ----------
  function setRQuiet(c) {
    elR.value = String(Math.round(c));
    if (NUM) NUM.clear(elR);
    state.r = Core.fromCents(c);
    anDirty = true; acDirty = true;
  }
  $('sweep').addEventListener('click', function () {
    if (state.sweep) { stopEverything(); say(T('已停止。', 'Stopped.')); return; }
    stopEverything();
    const dur = limitFor(state.timbre) === HARM_LIMIT ? 8 : PURE_LIMIT;
    setRQuiet(0);
    state.sweep = { t0: performance.now(), dur: dur };
    $('sweep').setAttribute('aria-pressed', 'true');
    const on = startPlay('dyad');
    renderOutputs(); renderReadouts();
    if (on) say(T('從同度（1:1）慢慢滑到八度（2:1），' + dur + ' 秒。', 'Gliding from unison (1:1) to the octave (2:1) in ' + dur + ' seconds.'));
  });
  function stopSweep() {
    if (!state.sweep) return;
    state.sweep = null;
    $('sweep').setAttribute('aria-pressed', 'false');
    updateStop();
  }
  function finishSweep() {
    state.sweep = null;
    $('sweep').setAttribute('aria-pressed', 'false');
    setRQuiet(1200);
    state.rsrc = 'sweep';
    renderOutputs(); renderReadouts(); renderIvButtons(); updateVoices(); update3D(false);
    emit('sweep', Object.assign(stateEvent('sweep'), { complete: true }));
    say(T('掃完一個八度。', 'Swept one octave. ') + valleySentence());
    updateCanvasLabel();
    if (state.play) { const p = state.play; clearTimeout(p.timer); p.timer = setTimeout(function () { endPlay('sweep'); }, 700); }
  }

  // ---------- 停止 ----------
  function busy() { return !!(state.play || state.sweep); }
  function updateStop() { $('stop').disabled = !(AU.playing() || busy()); }
  function stopEverything() {
    stopSweep();
    if (state.play) { clearTimeout(state.play.timer); stopVoices(0.08); state.play = null; }
    AU.stopAll(0.08);
    updateStop(); requestDraw();
  }
  $('stop').addEventListener('click', function () { stopEverything(); say(T('已停止。', 'Stopped.')); });
  AU.onChange(updateStop);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && busy()) stopEverything(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopEverything(); });

  // ---------- 狀態列、音效開關 ----------
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
    if (ev.detail && ev.detail.name === 'sound') { updateSoundButton(); if (!ev.detail.value && state.play) { stopVoices(0.05); state.play.voices = []; } updateStop(); }
  });

  // =====================================================================
  // 畫布
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W = 600, H = 520, L = null;
  function layout() {
    if (W >= 620) {
      const ch = Math.round(Math.max(250, Math.min(330, W * 0.36)) + 34 * (fs - 1));
      const bh = Math.round(Math.max(232, Math.min(270, W * 0.29)) + 56 * (fs - 1));
      const sw = Math.round((W - 24) * 0.55);
      L = { wide: true, curve: { x: 8, y: 8, w: W - 16, h: ch }, spec: { x: 8, y: ch + 16, w: sw, h: bh }, wave: { x: 16 + sw, y: ch + 16, w: W - 24 - sw, h: bh } };
      H = ch + bh + 24;
    } else {
      const ch = Math.round(258 + 56 * (fs - 1)), sh = Math.round(214 + 70 * (fs - 1)), wh = Math.round(226 + 56 * (fs - 1));
      L = { wide: false, curve: { x: 4, y: 4, w: W - 8, h: ch }, spec: { x: 4, y: ch + 12, w: W - 8, h: sh }, wave: { x: 4, y: ch + sh + 20, w: W - 8, h: wh } };
      H = ch + sh + wh + 24;
    }
  }
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth || cv.parentElement.clientWidth || 600;
    layout();
    cv.style.height = H + 'px';
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    requestDraw();
  }
  function panel(r, title, right) {
    D.roundRect(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fillStyle = alpha(C.surface, D.dark ? 0.32 : 0.62); ctx.fill();
    ctx.strokeStyle = alpha(C.text, 0.08); ctx.lineWidth = 1; ctx.stroke();
    ctx.font = fnt(12, 700); ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(title, r.x + 10, r.y + 8);
    if (right) {
      const tw = ctx.measureText(title).width;
      ctx.font = fnt(11, 500); ctx.fillStyle = C.muted; ctx.textAlign = 'right';
      const room = r.w - tw - 30;
      let s = right;
      while (s.length > 4 && ctx.measureText(s).width > room) s = s.slice(0, -2);
      if (s !== right) s = s.replace(/\s*\S?$/, '') + '…';
      if (room > 40) ctx.fillText(s, r.x + r.w - 10, r.y + 9);
    }
  }
  function niceStep(span, target) {
    const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p;
    return 10 * p;
  }

  // ---------- 不協和曲線 ----------
  function cgeo() {
    const r = L.curve;
    const px0 = r.x + 34 * fs + 8, px1 = r.x + r.w - 14, py0 = r.y + 34 * fs + 18, py1 = r.y + r.h - (22 * fs + 12);
    let m = CV.max;
    state.pins.forEach(function (p) { m = Math.max(m, p.max); });
    const step = niceStep(m * 1.1, 4), ymax = Math.ceil(m * 1.1 / step) * step;
    return {
      px0: px0, px1: px1, py0: py0, py1: py1, ymax: ymax, step: step,
      X: function (c) { return px0 + c / Core.C_MAX * (px1 - px0); },
      Y: function (d) { return py1 - d / ymax * (py1 - py0); },
      C: function (x) { return clamp((x - px0) / (px1 - px0) * Core.C_MAX, 0, Core.C_MAX); }
    };
  }
  function cbCents(f1) {
    let df = 50;
    for (let k = 0; k < 60; k++) df = Core.criticalBand(f1 + df / 2);
    return Core.cents(1 + df / f1);
  }
  function curvePath(g, c, d) {
    ctx.beginPath();
    for (let i = 0; i < c.length; i++) { const x = g.X(c[i]), y = g.Y(d[i]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  }
  function drawCurve(now) {
    const r = L.curve, a = analysis(), g = cgeo();
    panel(r, T('不協和曲線 D(r)', 'Dissonance curve D(r)'), timbreShort(state.timbre, state.f1));
    // 格線：D 的刻度；平均律每個半音一條細線；r = 1、1.25、1.5…的標籤
    ctx.font = fnt(10); ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    for (let v = 0; v <= g.ymax + 1e-9; v += g.step) {
      const y = Math.round(g.Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(g.px0, y); ctx.lineTo(g.px1, y); ctx.strokeStyle = alpha(C.text, v === 0 ? 0.3 : 0.07); ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = C.muted; ctx.fillText(+v.toFixed(3) + '', g.px0 - 5, y);
    }
    for (let k = 0; k <= 14; k++) {
      const x = Math.round(g.X(k * 100)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, g.py0); ctx.lineTo(x, g.py1 + 4);
      ctx.strokeStyle = alpha(C.text, k % 12 === 0 ? 0.16 : 0.055); ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = fnt(10.5, 600);
    [1, 1.25, 1.5, 1.75, 2, 2.25].forEach(function (rv) {
      const x = g.X(Core.cents(rv));
      ctx.fillStyle = C.muted; ctx.fillText(String(rv), x, g.py1 + 6);
    });
    ctx.save(); ctx.translate(g.px0 - 26 * fs - 6, (g.py0 + g.py1) / 2); ctx.rotate(-Math.PI / 2);
    ctx.font = fnt(10.5, 600); ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('D', 0, 0);
    ctx.restore();
    // 留下的舊曲線（虛線）
    state.pins.forEach(function (p, i) {
      ctx.save();
      ctx.setLineDash([5, 4]); curvePath(g, p.c, p.d);
      ctx.strokeStyle = alpha(C['cs-pin'], 0.75); ctx.lineWidth = 1.4; ctx.stroke();
      ctx.restore();
      const yEnd = g.Y(p.d[p.d.length - 1]);
      D.haloText(ctx, (i + 1) + ' ' + timbreShort(p.t, p.f1), g.px1 - 4, Math.max(g.py0 + 10, yEnd - 6 - i * 13 * fs), C['cs-pin'], 'right', 'alphabetic', fnt(10, 600));
    });
    // 目前的曲線：漸層填色＋管狀線條
    curvePath(g, CV.c, CV.d);
    ctx.lineTo(g.X(CV.c[CV.c.length - 1]), g.py1); ctx.lineTo(g.X(0), g.py1); ctx.closePath();
    const gr = ctx.createLinearGradient(0, g.py0, 0, g.py1);
    gr.addColorStop(0, alpha(C['cs-curve'], D.dark ? 0.34 : 0.26)); gr.addColorStop(1, alpha(C['cs-curve'], 0.03));
    ctx.fillStyle = gr; ctx.fill();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    curvePath(g, CV.c, CV.d); ctx.strokeStyle = shade(C['cs-curve'], D.dark ? -0.35 : -0.2); ctx.lineWidth = 3.4; ctx.stroke();
    curvePath(g, CV.c, CV.d); ctx.strokeStyle = C['cs-curve']; ctx.lineWidth = 2; ctx.stroke();
    // 純音：山頂與一個臨界頻帶
    if (state.timbre.mode === 'pure') {
      const cp = Core.cents(a.rPeak), xp = g.X(cp), yp = g.Y(a.Dpeak);
      if (cp <= Core.C_MAX) {
        D.ball(ctx, xp, yp, 5, C['cs-rough'], { glow: D.dark ? 0.4 : 0.15 });
        D.pill(ctx, T('最刺耳 Δf ≈ ', 'roughest Δf ≈ ') + fx(a.dfPeak, 1) + ' Hz', clamp(xp + 8, g.px0 + 60, g.px1 - 70), yp - 6, C['cs-rough'], 'left', fnt(10.5, 700));
      }
      const cc = cbCents(state.f1);
      if (cc <= Core.C_MAX) {
        const xc = Math.round(g.X(cc)) + 0.5;
        ctx.save(); ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(xc, g.py0 + 14 * fs); ctx.lineTo(xc, g.py1); ctx.strokeStyle = alpha(C['cs-rough'], 0.6); ctx.lineWidth = 1.2; ctx.stroke();
        ctx.restore();
        D.haloText(ctx, T('1 個臨界頻帶', '1 critical band'), clamp(xc, g.px0 + 50, g.px1 - 50), g.py0 + 10 * fs, C['cs-rough'], 'center', 'middle', fnt(10.5, 600));
      }
    }
    // 谷底：圓點；比較明顯的標上整數比
    const span = Math.max(1e-9, CV.max - CV.min), placed = [];
    VS.slice().sort(function (p, q) { return q.prom - p.prom; }).forEach(function (v) {
      const x = g.X(v.cents), y = g.Y(v.d), big = v.prom >= 0.012 * span;
      D.ball(ctx, x, y, big ? 3.8 : 2.4, C['cs-calm'], { shadow: false });
      if (!big) return;
      const tg = tagOf(v);
      ctx.font = fnt(10, 700);
      const wSup = tg.sup ? (ctx.font = fnt(7.2, 700), ctx.measureText(tg.sup).width + 1) : 0;
      ctx.font = fnt(10, 700);
      const w = ctx.measureText(tg.base).width + wSup + 10;
      const yl = y - 9;
      if (placed.some(function (q) { return Math.abs(q.x - x) < (q.w + w) / 2 + 2 && Math.abs(q.y - yl) < 15 * fs; })) return;
      placed.push({ x: x, y: yl, w: w });
      if (!tg.sup) { D.pill(ctx, tg.base, x, yl, C['cs-calm'], 'center', fnt(10, 700)); return; }
      // 上標的 s：和 D.pill 一樣的底框（寬度含上標），再畫「(3:2)」與小一號、高一點的 s
      ctx.font = fnt(10, 700);
      const m = ctx.measureText(tg.base), wBase = m.width, bh = D.textHeight(m, 15) + 3, bw = wBase + wSup + 12;
      D.roundRect(ctx, x - bw / 2, yl - bh, bw, bh, bh / 2);
      ctx.fillStyle = alpha(C['canvas-bg'], D.dark ? 0.86 : 0.9); ctx.fill();
      ctx.strokeStyle = alpha(C['cs-calm'], D.dark ? 0.45 : 0.35); ctx.lineWidth = 1; ctx.stroke();
      const xt = x - bw / 2 + 6, yt = yl - bh / 2 + 0.5;
      ctx.fillStyle = C['cs-calm']; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(tg.base, xt, yt);
      ctx.font = fnt(7.2, 700); ctx.fillText(tg.sup, xt + wBase + 1, yt - 3.5 * fs);
    });
    // 游標
    const xc = g.X(a.cents), yc = g.Y(a.D);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(Math.round(xc) + 0.5, g.py0); ctx.lineTo(Math.round(xc) + 0.5, g.py1);
    ctx.strokeStyle = alpha(C.accent, 0.7); ctx.lineWidth = state.drag ? 2.2 : 1.5; ctx.stroke();
    ctx.restore();
    const live = !!(state.play || state.sweep);
    D.ball(ctx, xc, yc, state.drag ? 8 : 6.5, a.atValley ? C['cs-calm'] : C.accent, { glow: live ? 0.6 : (D.dark ? 0.35 : 0.15) });
    D.pill(ctx, 'r = ' + fx(a.r, 4), clamp(xc, g.px0 + 34 * fs, g.px1 - 34 * fs), g.py0 - 2, a.atValley ? C['cs-calm'] : C.accent, 'center', fnt(11, 700));
    if (kb && kb.focused()) {
      ctx.save(); ctx.setLineDash([4, 3]);
      D.roundRect(ctx, xc - 12, g.py0 - 20 * fs, 24, g.py1 - g.py0 + 20 * fs + 4, 6);
      ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    }
  }

  // ---------- 頻譜對照 ----------
  function drawSpectrum() {
    const r = L.spec, a = analysis();
    panel(r, T('頻譜：兩個音的泛音', 'Spectra of the two notes'), T('對數頻率軸', 'log frequency'));
    const P = Core.partials(state.timbre), A = Core.spectrum(state.f1, P), B = Core.spectrum(state.f1 * state.r, P);
    const fTop = Math.max(A[A.length - 1].f, B[B.length - 1].f);
    const fLo = state.f1 * 0.78, fHi = Math.max(fTop * 1.18, state.f1 * 3.2);
    // 上下各留一列放「下方音」「上方音」的標籤，長條畫在中間
    const px0 = r.x + 14, px1 = r.x + r.w - 14, top = r.y + 26 * fs + 10, bot = r.y + r.h - (16 * fs + 10);
    const top2 = top + 17 * fs, bot2 = bot - 17 * fs;
    const yc = (top2 + bot2) / 2, hmax = (bot2 - top2) / 2 - 3;
    const X = function (f) { return px0 + Math.log(f / fLo) / Math.log(fHi / fLo) * (px1 - px0); };
    // 頻率刻度
    ctx.font = fnt(10); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach(function (f) {
      if (f <= fLo || f >= fHi) return;
      const x = Math.round(X(f)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.strokeStyle = alpha(C.text, 0.06); ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = C.muted; ctx.fillText(f >= 1000 ? (f / 1000) + 'k' : String(f), x, bot + 4);
    });
    ctx.textAlign = 'right'; ctx.fillText('Hz', px1, bot + 4);
    ctx.beginPath(); ctx.moveTo(px0, yc + 0.5); ctx.lineTo(px1, yc + 0.5); ctx.strokeStyle = alpha(C.text, 0.25); ctx.lineWidth = 1; ctx.stroke();
    const amax = Math.max.apply(null, P.map(function (x) { return x.a; }));
    const bw = clamp((px1 - px0) / (P.length * 5), 3, 7);
    // 會拍的泛音對（不協和度最大的幾對）
    const prs = Core.pairs(state.f1, state.r, state.timbre);
    const topD = prs.length ? prs[0].d : 0;
    const rough = topD > 0.005 ? prs.filter(function (p) { return p.d >= 0.15 * topD && p.beat >= 0.05; }).slice(0, 3) : [];
    // 重合的泛音（拍頻幾乎是 0）
    const coin = [];
    prs.forEach(function (p) { if (p.beat < Math.max(0.3, p.fa * 1e-4)) coin.push(p); });
    coin.forEach(function (p) {
      const x = X((p.fa + p.fb) / 2);
      ctx.save();
      ctx.shadowColor = alpha(C['cs-coin'], 0.9); ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(x, yc - hmax * p.aa / amax - 4); ctx.lineTo(x, yc + hmax * p.ab / amax + 4);
      ctx.strokeStyle = alpha(C['cs-coin'], 0.55); ctx.lineWidth = bw + 6; ctx.lineCap = 'round'; ctx.stroke();
      ctx.restore();
    });
    function bar(x, h, col, up) {
      const y0 = up ? yc - 1 - h : yc + 1, y1 = up ? yc - 1 : yc + 1 + h;
      const gg = ctx.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0);
      gg.addColorStop(0, shade(col, 0.3)); gg.addColorStop(0.55, col); gg.addColorStop(1, shade(col, -0.25));
      D.roundRect(ctx, x - bw / 2, y0, bw, Math.max(1, y1 - y0), Math.min(3, bw / 2));
      ctx.fillStyle = gg; ctx.fill();
    }
    A.forEach(function (c) { bar(X(c.f), Math.max(2, hmax * c.a / amax), C['cs-lo'], true); });
    B.forEach(function (c) { bar(X(c.f), Math.max(2, hmax * c.a / amax), C['cs-hi'], false); });
    coin.forEach(function (p) { D.ball(ctx, X((p.fa + p.fb) / 2), yc, 3.6, C['cs-coin'], { glow: 0.5, shadow: false }); });
    // 會拍的泛音對：在中線上用括號連起來，標拍頻（標籤輪流放在中線下方、上方、再下方）
    const ph = 16 * fs + 3;
    rough.forEach(function (p, i) {
      const xa = X(p.fa), xb = X(p.fb), x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
      const col = i === 0 ? C['cs-rough'] : alpha(C['cs-rough'], 0.6);
      ctx.beginPath(); ctx.moveTo(x0, yc - 5); ctx.lineTo(x0, yc); ctx.lineTo(x1, yc); ctx.lineTo(x1, yc + 5);
      ctx.strokeStyle = col; ctx.lineWidth = i === 0 ? 2.4 : 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
      const lx = clamp(x1 + 6, px0, px1 - 60);
      const yb = i === 1 ? yc - 6 : yc + 6 + ph * (i === 0 ? 1 : 2) + (i === 0 ? 0 : 3);
      D.pill(ctx, fx(p.beat, p.beat < 10 ? 2 : 1) + ' Hz', lx, Math.min(yb, bot2 + 2), col, 'left', fnt(10, 700));
    });
    // 兩條小標（各在自己那一列）
    D.haloText(ctx, T('下方音 ', 'lower ') + fx(state.f1, 1) + ' Hz ↑', px1 - 2, top, C['cs-lo'], 'right', 'top', fnt(10.5, 700));
    D.haloText(ctx, T('上方音 ', 'upper ') + fx(state.f1 * state.r, 1) + ' Hz ↓', px1 - 2, bot - 2, C['cs-hi'], 'right', 'bottom', fnt(10.5, 700));
    void a;
  }

  // ---------- 波形與拍 ----------
  function drawWave(now) {
    const r = L.wave, a = analysis();
    panel(r, T('疊加的波形與拍', 'Waveform and beats'));
    const P = Core.partials(state.timbre), A = Core.spectrum(state.f1, P), B = Core.spectrum(state.f1 * state.r, P);
    const live = !!(state.play || state.sweep) && !D.reducedMotion();
    const tNow = live ? (now - (state.play ? state.play.t0 : state.sweep.t0)) / 1000 : 0;
    const x0 = r.x + 10, x1 = r.x + r.w - 10;
    const midY = r.y + 26 * fs + 10 + (r.h - 26 * fs - 10) * 0.46;
    // 上半：波形（下方音四個週期）
    const wTop = r.y + 26 * fs + 12, wBot = midY - 18 * fs;
    const yc = (wTop + wBot) / 2, amp = (wBot - wTop) / 2 - 2;
    const Tw = 4 / state.f1;
    const sumA = A.reduce(function (s, c) { return s + c.a; }, 0) + B.reduce(function (s, c) { return s + c.a; }, 0);
    const N = Math.max(80, Math.round((x1 - x0) * 1.5));
    const y1s = new Float64Array(N + 1), y2s = new Float64Array(N + 1);
    // 播放中：視窗從下方音的整數個週期開始，下方音看起來不動，上方音慢慢滑動（形狀以拍頻變化）
    const tStart = live ? Math.floor(tNow * state.f1) / state.f1 : 0;
    for (let j = 0; j <= N; j++) { const s = Core.signal(A, B, tStart + Tw * j / N); y1s[j] = s[0] / sumA; y2s[j] = s[1] / sumA; }
    ctx.beginPath(); ctx.moveTo(x0, yc + 0.5); ctx.lineTo(x1, yc + 0.5); ctx.strokeStyle = alpha(C.text, 0.12); ctx.lineWidth = 1; ctx.stroke();
    [[y1s, C['cs-lo']], [y2s, C['cs-hi']]].forEach(function (q) {
      ctx.beginPath();
      for (let j = 0; j <= N; j++) { const x = x0 + (x1 - x0) * j / N, y = yc - q[0][j] * amp; if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.strokeStyle = alpha(q[1], 0.5); ctx.lineWidth = 1; ctx.stroke();
    });
    ctx.beginPath();
    for (let j = 0; j <= N; j++) { const x = x0 + (x1 - x0) * j / N, y = yc - (y1s[j] + y2s[j]) * amp; if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.strokeStyle = C.text; ctx.lineWidth = 1.7; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.font = fnt(10); ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(fx(Tw * 1000, 1) + T(' 毫秒（下方音 4 個週期）', ' ms (4 periods of the lower note)'), x1, wBot + 3);
    // 下半：最刺耳那一對泛音的拍（1 秒的響度包絡）
    const bTop = midY + 4, bBot = r.y + r.h - (14 * fs + 8);
    const prs = Core.pairs(state.f1, state.r, state.timbre), p = a.pair ? prs[0] : null;
    ctx.font = fnt(11, 600); ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (!p) {
      ctx.fillText(T('拍', 'Beats'), x0, bTop);
      ctx.font = fnt(11.5); ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(T('沒有會拍的泛音對', 'No overtone pair is beating'), (x0 + x1) / 2, (bTop + bBot) / 2 + 6);
      return;
    }
    const cb = Core.criticalBand((p.fa + p.fb) / 2), word = beatWord(p.beat, cb);
    // 標題太長時改用短的；還放不下就把拍頻放到第二行
    const head = fx(p.beat, 2) + ' Hz・' + word, wHead = ctx.measureText(head).width, room = x1 - x0 - 14;
    let left = T('拍：下方音第 ' + p.i + ' × 上方音第 ' + p.j + ' 泛音', 'Beats: lower ' + p.i + ' × upper ' + p.j);
    if (ctx.measureText(left).width + wHead > room) left = T('拍：泛音 ' + p.i + ' × ' + p.j, 'Beats: ' + p.i + ' × ' + p.j);
    const two = ctx.measureText(left).width + wHead > room;
    ctx.fillText(left, x0, bTop);
    ctx.textAlign = 'right';
    ctx.fillStyle = p.beat < 0.05 ? C['cs-calm'] : p.beat > 15 ? C['cs-rough'] : C['cs-curve'];
    ctx.fillText(head, x1, two ? bTop + 16 * fs : bTop);
    const hh = (two ? 34 : 18) * fs;
    const lyc = (bTop + hh + bBot) / 2, la = (bBot - bTop - hh) / 2 - 2;
    const shift = live ? tNow : 0, norm = p.aa + p.ab;
    const M = Math.max(120, Math.round((x1 - x0) * 2));
    const tooFast = p.beat > (x1 - x0) / 6;
    const env = function (t) { return Core.envelope(p.aa, p.ab, p.beat, t + shift) / norm; };
    ctx.beginPath();
    if (tooFast) {
      const lo = Math.abs(p.aa - p.ab) / norm;
      ctx.rect(x0, lyc - la, x1 - x0, 2 * la); void lo;
    } else {
      for (let j = 0; j <= M; j++) { const t = j / M, x = x0 + t * (x1 - x0), e = env(t); if (j) ctx.lineTo(x, lyc - e * la); else ctx.moveTo(x, lyc - e * la); }
      for (let j = M; j >= 0; j--) { const t = j / M, x = x0 + t * (x1 - x0), e = env(t); ctx.lineTo(x, lyc + e * la); }
      ctx.closePath();
    }
    const col = p.beat > 15 ? C['cs-rough'] : C['cs-curve'];
    const gg = ctx.createLinearGradient(0, lyc - la, 0, lyc + la);
    gg.addColorStop(0, alpha(col, 0.3)); gg.addColorStop(0.5, alpha(col, 0.08)); gg.addColorStop(1, alpha(col, 0.3));
    ctx.fillStyle = gg; ctx.fill();
    if (tooFast) {
      D.haloText(ctx, T('起伏太快，每秒 ' + fx(p.beat, 0) + ' 次（畫不下）', 'Too fast to draw: ' + fx(p.beat, 0) + ' times a second'), (x0 + x1) / 2, lyc, C.muted, 'center', 'middle', fnt(10.5, 600));
    } else {
      const cyc = Math.max(24, Math.round((x1 - x0) / 5));
      ctx.beginPath();
      for (let j = 0; j <= M; j++) { const t = j / M, x = x0 + t * (x1 - x0), yv = lyc - env(t) * la * Math.sin(TAU * cyc * t); if (j) ctx.lineTo(x, yv); else ctx.moveTo(x, yv); }
      ctx.strokeStyle = alpha(col, 0.45); ctx.lineWidth = 0.8; ctx.stroke();
      ctx.beginPath();
      for (let j = 0; j <= M; j++) { const t = j / M, x = x0 + t * (x1 - x0), e = env(t); if (j) ctx.lineTo(x, lyc - e * la); else ctx.moveTo(x, lyc - e * la); }
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.font = fnt(10); ctx.fillStyle = C.muted; ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left'; ctx.fillText('0 s', x0, r.y + r.h - 4);
    ctx.textAlign = 'right'; ctx.fillText('1 s', x1, r.y + r.h - 4);
  }

  function draw(now) {
    D.backdrop(ctx, W, H);
    drawCurve(now);
    drawSpectrum();
    drawWave(now);
  }
  function updateCanvasLabel() {
    const a = analysis();
    const desc = T('不協和曲線：' + timbreShort(state.timbre, state.f1) + '。' + valleySentence() + '游標在 r = ' + fx(a.r, 4) + '，D = ' + fx(a.D, 3) + '。按方向鍵移動游標（Shift 一次 25 音分）。',
      'Dissonance curve: ' + timbreShort(state.timbre, state.f1) + '. ' + valleySentence() + ' Cursor at r = ' + fx(a.r, 4) + ', D = ' + fx(a.D, 3) + '. Arrow keys move the cursor (Shift: 25 cents).');
    cv.setAttribute('aria-label', desc);
  }

  // ---------- 拖曳曲線上的游標 ----------
  function evPos(e) { const b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; }
  function inCurve(p) { const g = cgeo(); return p.x >= g.px0 - 12 && p.x <= g.px1 + 12 && p.y >= g.py0 - 24 && p.y <= g.py1 + 22 * fs; }
  function setRFromCents(c, src) {
    const cc = clamp(Math.round(c), 0, Math.ceil(Core.C_MAX));
    elR.value = String(cc);
    if (NUM) NUM.clear(elR);
    state.r = clamp(val(elR), 1, Core.R_MAX);
    state.rsrc = src || 'slider';
    rChanged(false);
  }
  cv.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = evPos(e);
    if (!inCurve(p)) return;
    stopSweep();
    state.drag = { id: e.pointerId, x0: p.x, y0: p.y, live: e.pointerType !== 'touch', moved: false };
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    if (state.drag.live) { e.preventDefault(); cv.classList.add('dragging'); setRFromCents(cgeo().C(p.x)); }
  });
  cv.addEventListener('pointermove', function (e) {
    const p = evPos(e);
    if (!state.drag) { cv.style.cursor = inCurve(p) ? 'ew-resize' : 'default'; return; }
    if (e.pointerId !== state.drag.id) return;
    if (!state.drag.live) {
      const dx = p.x - state.drag.x0, dy = p.y - state.drag.y0;
      if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) { state.drag.live = true; cv.classList.add('dragging'); }
      else return;
    }
    state.drag.moved = true;
    setRFromCents(cgeo().C(p.x));
  });
  function endDrag(e) {
    const d = state.drag;
    if (!d || (e && e.pointerId !== d.id)) return;
    state.drag = null;
    cv.classList.remove('dragging');
    if (!d.live && e && e.type === 'pointerup') setRFromCents(cgeo().C(evPos(e).x));     // 輕點一下：游標跳過去
    if (d.live || (e && e.type === 'pointerup')) rChanged(true, 'slider');
    requestDraw();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', function (e) { const d = state.drag; if (d && !d.live) { state.drag = null; return; } endDrag(e); });
  cv.addEventListener('lostpointercapture', function (e) { if (state.drag && state.drag.live) endDrag(e); });

  // 鍵盤：方向鍵移動游標（1 音分；Shift 25 音分）
  let kb = null, kbTimer = 0;
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('不協和曲線畫布。方向鍵移動頻率比的游標，Shift 加方向鍵一次移動 25 音分。', 'Dissonance curve. Arrow keys move the frequency-ratio cursor; Shift + arrow moves 25 cents.'),
      items: [{
        name: function () { return T('頻率比的游標', 'Frequency-ratio cursor'); },
        move: function (dx, dy, big) {
          const step = (dx || -dy) * (big ? 25 : 1);
          if (!step) return false;
          stopSweep();
          setRFromCents(Core.cents(state.r) + step);
          clearTimeout(kbTimer);
          kbTimer = setTimeout(function () { rChanged(true, 'slider'); }, 400);
          return true;
        },
        describe: function () { const a = analysis(); return 'r = ' + fx(a.r, 4) + T('，D = ', ', D = ') + fx(a.D, 3) + (a.atValley ? T('，谷底', ', valley') : ''); }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // ---------- 動畫迴圈 ----------
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    const now = performance.now();
    let more = false;
    if (heavyPending) heavyNow();
    if (state.sweep) {
      const u = (now - state.sweep.t0) / (state.sweep.dur * 1000);
      if (u >= 1) finishSweep();
      else {
        setRQuiet(1200 * u);
        renderOutputs(); renderReadouts(); renderIvButtons(); updateVoices(); update3D(false);
        more = true;
      }
    }
    if (state.play && !D.reducedMotion()) more = true;
    if (!view3 || !view3.active) draw(now);
    if (more) requestDraw();
  }

  // =====================================================================
  // 3D：切換到 3D 時才載入 js/consonance-3d.js 與 three.js
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0, surfTimer = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    Core: Core, T: T, D: D,
    colors: function () { return C; },
    fs: function () { return fs; },
    data: function () { return { f1: state.f1, timbre: Object.assign({}, state.timbre), r: state.r, r2: state.r2, chord: chordAnalysis() }; },
    fx: fx, sg: sg, timbreShort: timbreShort,
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 曲線。', 'The 3D graphics context was lost, so the view switched back to the 2D curve.');
    }
  };
  /** 3D：音色或下方音改變時重算曲面（延後一點，拖曳滑桿時不會一直重算）；只是比值改變時移動小球 */
  function update3D(surface) {
    if (!view3 || !view3.active) return;
    if (surface) { clearTimeout(surfTimer); surfTimer = setTimeout(function () { if (view3 && view3.active) view3.rebuild(); }, 140); }
    else view3.marker();
  }
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Consonance3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Consonance3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/consonance-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Consonance3D) throw new Error('consonance-3d.js did not load');
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
        view3 = window.Consonance3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
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
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 曲線。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D curve is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ---------- 分享目前設定：留下的舊曲線（滑桿、音色按鈕、勾選框由 classroom.js 記錄） ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { pins: state.pins.map(function (p) { return { t: p.t, f: +p.f1.toFixed(2) }; }), j: state.jump }; },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      if (o.j === 'just' || o.j === 'equal') { state.jump = o.j; renderJump(); renderIvButtons(); }
      if (Array.isArray(o.pins)) {
        state.pins = o.pins.slice(-MAX_PINS).filter(function (p) { return p && typeof p === 'object' && isFinite(p.f); }).map(function (p) {
          const t = Core.normTimbre(p.t), f1 = clamp(+p.f, Core.F1_MIN, Core.F1_MAX), c = Core.curve(f1, t);
          return { t: t, f1: f1, c: c.c, d: c.d, max: c.max };
        });
        $('clear').disabled = !state.pins.length;
        requestDraw();
      }
    }
  });

  // 給測試用的介面（不影響畫面）
  window.__cs = {
    state: state,
    analysis: function () { return analysis(); },
    chord: function () { return chordAnalysis(); },
    valleys: function () { ensureCurve(); return VS; },
    view3: function () { return view3; }
  };

  // =====================================================================
  // 啟動（不發聲、不送任務事件）
  // =====================================================================
  readColors();
  readControls();
  modeBtns.forEach(function (b) { if (b.getAttribute('aria-pressed') === 'true') state.timbre.mode = b.dataset.mode; });
  ['ivs'].forEach(function (id) { $(id).setAttribute('data-share-skip', ''); });
  document.querySelector('.view-bar').setAttribute('data-share-skip', '');
  updateSoundButton();
  renderJump(); renderTimbre(); renderOutputs(); renderReadouts(); renderIvButtons(); updateStop(); updateCanvasLabel();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    renderReadouts();
    if (view3 && view3.active) view3.onTheme();
    resize();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && (ev.detail.name === 'lang' || ev.detail.name === 'fs')) { readColors(); renderJump(); renderTimbre(); renderOutputs(); for (const id in lastHTML) delete lastHTML[id]; renderReadouts(); renderIvButtons(); updateCanvasLabel(); resize(); } });
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  resize();
})();
