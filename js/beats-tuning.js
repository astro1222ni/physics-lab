/* beats-tuning.js — 「拍頻與調音」的畫面與互動
 * （數學在 beats-tuning-core.js；聲音一律用 music-audio.js；2D 繪圖工具 LabDraw 在 drawkit.js；3D 在 beats-tuning-3d.js，切到 3D 時才載入）
 *
 * 畫面：左上「拍頻計」（每秒幾拍的大數字、隨拍閃的燈、目標拍數、你數到的拍頻），右上「調音器」（相對目標的音分指針，標出純律與平均律的位置），
 *       中間左邊是幾毫秒內的真實波形（參考音、待調音、相加），右邊是打拍那一對泛音幾秒內的響度包絡（標出一拍的長度），
 *       下面是兩個音的泛音（參考音往上、待調音往下），打拍的那一對用括號連起來，旁邊放大看兩根相差多少 Hz。
 * 聲音：只有學生按「▶ 播放」才發聲；播放中轉調音旋鈕，待調音即時跟著改。
 *       音效關閉時畫面照跑（燈照樣閃、波形照樣走），狀態列顯示提示並讓音效開關閃一下（不會自己打開音效）。
 * 時間：播放時累積兩個基頻的相位 φ1、φ2（每一幀加 2πf·dt），燈與包絡用打拍那一對的相位差 n·φ2 − m·φ1，
 *       所以播放中轉旋鈕，畫面和聲音一樣是連續的。 */
(function () {
  'use strict';
  const Core = window.BeatsTuningCore;
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
  const GAIN = 0.2;            // 每個音的音量
  const RICH_LIMIT = 12;       // 帶泛音最多響幾秒（MusicAudio 持續音的預設上限）
  const PURE_LIMIT = 4;        // 純音最多響幾秒（MusicAudio 的聽力保護）
  const TAP_GAP = 5;           // 停超過幾秒就重新數拍
  const MAX_REC = 8;
  const OK_BEAT = 0.05;        // 讀數裡「調準了」的容許拍數
  const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  // ---------- 狀態 ----------
  const state = {
    fRef: Core.REF_DEFAULT, coarse: Core.OFFSET_DEFAULT, fine: 0,
    iv: 'unison', target: 'just', mode: 'rich',
    touched: false,          // 學生轉過調音旋鈕
    play: null,              // 正在播放：{ t0, deadline, voices, timer, last }
    ph1: 0, ph2: 0, tPlay: 0,  // 播放中累積的基頻相位與經過時間
    taps: [], tapRes: null, tapFlash: -1e9,
    records: []
  };
  let an = null;
  function analyze() { an = Core.analyze({ fRef: state.fRef, offset: state.coarse + state.fine, iv: state.iv, target: state.target, mode: state.mode }); return an; }

  // ---------- 色彩與字體 ----------
  let C = {}, fs = 1;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'bt-ref', 'bt-tun', 'bt-sum', 'bt-beat', 'bt-ok', 'bt-lamp', 'bt-twin']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    fs = Math.max(1, Math.min(1.45, parseFloat(cs.getPropertyValue('--fs')) || 1));
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + (px * fs).toFixed(1) + 'px ' + FONT; }

  // ---------- 數字與文字 ----------
  function fx(v, d) { if (v == null || !isFinite(v)) return '—'; let s = v.toFixed(d); if (/^-0(\.0+)?$/.test(s)) s = s.slice(1); return s.replace('-', '−'); }
  function sg(v, d) { if (v == null || !isFinite(v)) return '—'; const s = fx(v, d); return (v > 0 && !/^0(\.0+)?$/.test(s)) ? '+' + s : s; }
  const LP = function () { return T('（', ' ('); }, RP = function () { return T('）', ')'); };
  const ivName = function (k) { const I = Core.IVS[k]; return T(I.zh, I.en); };
  const tgName = function (t) { return t === 'equal' ? T('平均律', 'equal temperament') : T('純律', 'just'); };
  function noteOf(f) { const m = MT.freqToMidi(f), k = Math.round(m); return { name: MT.noteName(k), dev: (m - k) * 100 }; }
  function noteTag(f) { const n = noteOf(f); return n.name + (Math.abs(n.dev) >= 0.5 ? ' ' + sg(n.dev, 0) + T(' 音分', '¢') : ''); }
  function beatDigits(b) { return b < 10 ? 2 : 1; }
  function sideWord(side) {
    if (side === 'wide') return T('偏寬（待調音偏高）', 'wide (tuned note sharp)');
    if (side === 'narrow') return T('偏窄（待調音偏低）', 'narrow (tuned note flat)');
    if (side === 'zero') return T('剛好不拍', 'no beats at all');
    return '—';
  }
  function sideShort(s) { return s > 1e-9 ? T('寬', 'wide') : s < -1e-9 ? T('窄', 'narrow') : ''; }
  /** 打拍那一對的 HTML（例如 3f<sub>1</sub> = 660.00 Hz） */
  function pairHTML(a) { return (a.m > 1 ? a.m : '') + 'f<sub>1</sub>'; }
  function pairHTML2(a) { return (a.n > 1 ? a.n : '') + 'f<sub>2</sub>'; }

  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function evData(src, extra) { return Object.assign({}, an, { touched: state.touched, playing: !!state.play, src: src }, extra || {}); }

  // =====================================================================
  // 控制項
  // =====================================================================
  const elRef = $('ref'), elCoarse = $('coarse'), elFine = $('fine');
  if (NUM) {
    NUM.register(elRef, {
      toValue: function (p) { return MT.midiToFreq(p); }, toPos: function (v) { return MT.freqToMidi(v); },
      min: Core.REF_MIN, max: Core.REF_MAX, decimals: 2
    });
  }
  const ivBtns = Array.prototype.slice.call(document.querySelectorAll('[data-iv]'));
  const tgBtns = Array.prototype.slice.call(document.querySelectorAll('[data-target]'));
  const mdBtns = Array.prototype.slice.call(document.querySelectorAll('[data-mode]'));
  function readControls() {
    state.fRef = clamp(val(elRef), Core.REF_MIN, Core.REF_MAX);
    state.coarse = clamp(val(elCoarse), -Core.COARSE_MAX, Core.COARSE_MAX);
    state.fine = clamp(val(elFine), -Core.FINE_MAX, Core.FINE_MAX);
  }
  function renderButtons() {
    ivBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.iv === state.iv)); });
    tgBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.target === state.target)); });
    mdBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)); });
  }
  function renderOutputs() {
    $('refo').textContent = fx(state.fRef, 2);
    $('coarseo').textContent = sg(state.coarse, Math.abs(state.coarse * 10 - Math.round(state.coarse * 10)) > 1e-6 ? 2 : 1);
    $('fineo').textContent = sg(state.fine, 2);
    $('refNote').textContent = T('約 ', '≈ ') + noteTag(state.fRef) + T('（A4 = 440 Hz）', ' (A4 = 440 Hz)') +
      (state.fRef < 200 ? T('；手機小喇叭聽不太到 200 Hz 以下，選「帶泛音」靠泛音聽', '; phone speakers barely play below 200 Hz, so use “With overtones”') : '');
    const I = Core.IVS[state.iv];
    $('ivHint').innerHTML = state.mode === 'pure' && state.iv !== 'unison'
      ? T('純音只有基頻：' + I.zh + '沒有重合的泛音，沒有可以數的拍。換「帶泛音」聽聽看。', 'Pure tones have only the fundamental: a ' + I.en.toLowerCase() + ' has no overtones that coincide, so there are no beats to count. Try “With overtones”.')
      : I.m === 1 && I.n === 1 ? T('同度：聽 f<sub>1</sub> 與 f<sub>2</sub> 本身的拍。', 'Unison: listen to the beats between f<sub>1</sub> and f<sub>2</sub> themselves.')
        : T(I.zh + '：聽參考音第 ' + I.m + ' 泛音與待調音第 ' + I.n + ' 泛音的拍（' + I.m + 'f<sub>1</sub> 對 ' + (I.n > 1 ? I.n : '') + 'f<sub>2</sub>）。',
          I.en + ': listen to the beats between overtone ' + I.m + ' of the reference and overtone ' + I.n + ' of the tuned note (' + I.m + 'f<sub>1</sub> against ' + (I.n > 1 ? I.n : '') + 'f<sub>2</sub>).');
    $('f2big').innerHTML = T('待調音 f<sub>2</sub> = ', 'Tuned note f<sub>2</sub> = ') + '<b>' + fx(an.f2, 2) + '</b> Hz <small>' + LP() + noteTag(an.f2) + RP() + '</small>';
  }
  let lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  function renderReadouts() {
    const a = an;
    setHTML('rdF2', fx(a.f2, 2) + ' Hz <small>' + LP() + T('離純律 ', 'just ') + sg(a.offset, 2) + ' Hz' + RP() + '</small>');
    if (a.hasPair) {
      setHTML('rdPair', pairHTML(a) + ' = ' + fx(a.fa, 2) + ' · ' + pairHTML2(a) + ' = ' + fx(a.fb, 2) + ' Hz');
      const per = a.beat > 1e-9 ? T('每 ' + fx(a.period, a.period < 10 ? 2 : 0) + ' 秒一拍', 'one every ' + fx(a.period, a.period < 10 ? 2 : 0) + ' s') : T('不拍', 'no beats');
      setHTML('rdBeat', '<b>' + fx(a.beat, beatDigits(a.beat)) + '</b> ' + T('拍／秒', 'beats/s') + ' <small>' + LP() + per + RP() + '</small>');
      const cls = a.side === 'wide' ? 'wide-txt' : a.side === 'narrow' ? 'narrow-txt' : 'ok-txt';
      setHTML('rdSide', '<span class="' + cls + '">' + sideWord(a.side) + '</span>');
    } else {
      setHTML('rdPair', T('沒有（純音沒有泛音）', 'none (pure tones have no overtones)'));
      setHTML('rdBeat', T('沒有可以數的拍', 'no beats to count'));
      setHTML('rdSide', '—');
    }
    const tb = a.target === 'equal' ? fx(a.targetBeat, 2) + (a.targetBeat > 1e-9 ? ' ' + sideShort(a.targetSigned) : '') : '0';
    const okNow = a.hasPair && a.err <= OK_BEAT;
    setHTML('rdTarget', tb + ' ' + T('拍／秒', 'beats/s') + ' <small>' + LP() + tgName(a.target) + RP() + '</small>' + (okNow ? ' <span class="ok-txt">✓</span>' : ''));
    setHTML('rdCents', sg(a.cents, 2) + T(' 音分', ' cents') + ' <small>' + LP() + fx(a.fTarget, 2) + ' Hz' + RP() + '</small>');
    const tr = state.tapRes;
    setHTML('rdTap', tr && tr.taps >= 2 ? fx(tr.rate, 2) + T(' 拍／秒', ' beats/s') + ' <small>' + LP() + T('穩定 ' + tr.taps + ' 下', tr.taps + ' steady taps') + RP() + '</small>' : '—');
    const et = ['fifth', 'fourth', 'third'].map(function (k) { const s = Core.etBeatSigned(state.fRef, k); return ivName(k) + ' ' + fx(Math.abs(s), 2) + ' ' + sideShort(s); });
    setHTML('rdEt', '<small>' + et.join(T('、', ', ')) + '</small>');
  }

  // ---------- 改設定 ----------
  function resetTaps() { if (state.taps.length || state.tapRes) { state.taps = []; state.tapRes = null; updateClear(); } }
  let lastKey = '';
  function changed(final, src) {
    analyze();
    const key = [state.fRef, an.f2, state.iv, state.mode, state.target].join('|');
    if (key !== lastKey) { lastKey = key; resetTaps(); }
    renderButtons(); renderOutputs(); renderReadouts(); updateVoices(); update3D(true); requestDraw(); scheduleLabel();
    if (final) {
      emit('tune', evData(src));
      say(beatSentence());
    }
  }
  function beatSentence() {
    const a = an;
    if (!a.hasPair) return T('純音的' + ivName(a.iv) + '沒有可以數的拍。', 'A pure-tone ' + ivName(a.iv).toLowerCase() + ' has no beats to count.');
    let s = T('拍頻每秒 ', 'Beats: ') + fx(a.beat, beatDigits(a.beat)) + T(' 拍，', ' per second, ') + sideWord(a.side) + T('；', '; ');
    if (a.target === 'equal') s += T('平均律目標 ', 'equal-tempered target ') + fx(a.targetBeat, 2) + (a.err <= OK_BEAT ? T('，調準了。', ', in tune.') : T('。', '.'));
    else s += a.beat < OK_BEAT ? T('調準了。', 'in tune.') : T('目標是 0 拍。', 'the target is zero beats.');
    return s;
  }
  [elCoarse, elFine].forEach(function (el) {
    el.addEventListener('input', function () { readControls(); state.touched = true; changed(false); });
    el.addEventListener('change', function () { readControls(); state.touched = true; changed(true, 'knob'); });
  });
  elRef.addEventListener('input', function () { readControls(); changed(false); });
  elRef.addEventListener('change', function () { readControls(); changed(true, 'ref'); });
  ivBtns.forEach(function (b) { b.addEventListener('click', function () { state.iv = b.dataset.iv; changed(true, 'interval'); }); });
  tgBtns.forEach(function (b) { b.addEventListener('click', function () { state.target = b.dataset.target; changed(true, 'target'); }); });
  mdBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      if (state.mode === b.dataset.mode) { changed(true, 'mode'); return; }
      state.mode = b.dataset.mode;
      retimbre();
      changed(true, 'mode');
    });
  });

  // =====================================================================
  // 聲音
  // =====================================================================
  function soundCheck() {
    if (AU.enabled()) return true;
    say(AU.offHint());
    AU.flashSoundButton();
    return false;
  }
  function partialList() { return Core.partials(state.mode).map(function (p) { return { k: p.k, a: p.a }; }); }
  function limit() { return state.mode === 'pure' ? PURE_LIMIT : RICH_LIMIT; }
  function voiceEnded() { if (state.play) setTimeout(function () { endPlay('time'); }, 0); }
  function buildVoices() {
    const p = state.play;
    p.voices = [];
    if (!AU.enabled()) return;
    const remain = (p.deadline - performance.now()) / 1000;
    if (remain <= 0.05) return;
    const parts = partialList();
    [state.fRef, an.f2].forEach(function (f) {
      const h = AU.sustain({ f0: f, partials: parts, gain: GAIN, attack: 0.04, maxDur: remain, onEnd: voiceEnded });
      if (h) p.voices.push(h);
    });
  }
  function updateVoices() {
    const p = state.play;
    if (!p || p.voices.length !== 2) return;
    p.voices[0].set({ f0: state.fRef }, 0.03);
    p.voices[1].set({ f0: an.f2 }, 0.03);
  }
  function retimbre() {
    const p = state.play;
    if (!p) return;
    if (state.mode === 'pure') {
      const dl = performance.now() + PURE_LIMIT * 1000;
      if (dl < p.deadline) { p.deadline = dl; clearTimeout(p.timer); p.timer = setTimeout(function () { endPlay('time'); }, PURE_LIMIT * 1000); }
    }
    const parts = partialList();
    p.voices.forEach(function (v) { v.set({ partials: parts }); });
  }
  function stopVoices(fade) { if (state.play) state.play.voices.forEach(function (v) { v.stop(fade == null ? 0.12 : fade); }); }
  function startPlay() {
    const now = performance.now(), lim = limit();
    state.play = { t0: now, deadline: now + lim * 1000, voices: [], timer: 0, last: now, short: lim === PURE_LIMIT };
    state.ph1 = 0; state.ph2 = 0; state.tPlay = 0;
    resetTaps();
    const on = soundCheck();
    if (on) buildVoices();
    state.play.timer = setTimeout(function () { endPlay('time'); }, lim * 1000);
    updateStop(); update3D(true); requestDraw();
    return on;
  }
  function endPlay(reason) {
    const p = state.play;
    if (!p) return;
    clearTimeout(p.timer);
    stopVoices(0.25);
    state.play = null;
    if (reason === 'time') say(p.short && AU.enabled()
      ? T('純音最多響 ' + PURE_LIMIT + ' 秒（保護聽力）。按「▶ 播放」可以再聽一次。', 'Pure tones play for at most ' + PURE_LIMIT + ' seconds (hearing protection). Press “▶ Play” to hear them again.')
      : T('播放結束。按「▶ 播放」可以再聽一次。', 'Finished. Press “▶ Play” to hear it again.'));
    updateStop(); update3D(true); requestDraw();
  }
  $('play').addEventListener('click', function () {
    stopEverything();
    const on = startPlay();
    emit('listen', evData('play'));
    if (on) say(T('播放：', 'Playing: ') + beatSentence());
  });

  // ---------- 跟著拍按 ----------
  $('tap').addEventListener('click', function () {
    const btn = $('tap');
    if (!state.play) { say(T('先按「▶ 播放」，再跟著拍按。', 'Press “▶ Play” first, then tap with the beats.')); return; }
    const t = performance.now() / 1000;
    if (state.taps.length && t - state.taps[state.taps.length - 1] > TAP_GAP) state.taps = [];
    state.taps.push(t);
    if (state.taps.length > 12) state.taps.shift();
    state.tapRes = Core.tapRate(state.taps);
    state.tapFlash = performance.now();
    btn.classList.add('hit');
    setTimeout(function () { btn.classList.remove('hit'); }, 120);
    renderReadouts(); updateClear(); requestDraw();
    const r = state.tapRes;
    if (r && r.taps >= 5) {
      emit('count', evData('tap', { tapped: r.rate, taps: r.taps }));
      const real = an.hasPair ? fx(an.beat, 2) : '—';
      say(T('你數到每秒 ' + fx(r.rate, 2) + ' 拍（穩定 ' + r.taps + ' 下），實際 ' + real + ' 拍。', 'You counted ' + fx(r.rate, 2) + ' beats a second (' + r.taps + ' steady taps); the true rate is ' + real + '.'));
    }
  });

  // ---------- 停止 ----------
  function updateStop() { $('stop').disabled = !(AU.playing() || state.play); }
  function stopEverything() {
    if (state.play) { clearTimeout(state.play.timer); stopVoices(0.08); state.play = null; }
    AU.stopAll(0.08);
    updateStop(); update3D(true); requestDraw();
  }
  $('stop').addEventListener('click', function () { stopEverything(); say(T('已停止。', 'Stopped.')); });
  AU.onChange(updateStop);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.play) stopEverything(); });
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

  // ---------- 調音紀錄 ----------
  function updateClear() { $('clear').disabled = !(state.records.length || state.taps.length || state.tapRes); }
  function renderRecords() {
    const body = $('recBody');
    $('recTable').hidden = !state.records.length;
    $('recEmpty').hidden = !!state.records.length;
    body.innerHTML = state.records.map(function (r) {
      const name = ivName(r.iv) + (r.iv === 'unison' || r.iv === 'octave' ? '' : T('・', ' · ') + (r.target === 'equal' ? T('平', 'ET') : T('純', 'J'))) + (r.mode === 'pure' ? T('・純音', ' · pure') : '');
      const b = r.beat == null ? '—' : fx(r.beat, beatDigits(r.beat)) + (r.beat > 1e-9 ? ' ' + sideShort(r.s) : '');
      return '<tr><td>' + name + '</td><td>' + fx(r.fRef, 2) + '</td><td>' + fx(r.f2, 2) + '</td><td>' + b + '</td><td>' + sg(r.cents, 1) + '</td></tr>';
    }).join('');
    updateClear();
  }
  $('record').addEventListener('click', function () {
    const a = an;
    state.records.push({ iv: a.iv, target: a.target, mode: a.mode, fRef: a.fRef, f2: a.f2, beat: a.beat, s: a.beatSigned, cents: a.cents });
    if (state.records.length > MAX_REC) state.records.shift();
    renderRecords();
    say(T('記下了：', 'Logged: ') + ivName(a.iv) + T('，', ', ') + (a.hasPair ? fx(a.beat, 2) + T(' 拍／秒', ' beats/s') : T('沒有拍', 'no beats')) + T('。', '.'));
  });
  $('clear').addEventListener('click', function () {
    state.records = []; state.taps = []; state.tapRes = null;
    renderRecords(); renderReadouts(); requestDraw();
    say(T('已清除調音紀錄與數拍。', 'Cleared the log and the tap count.'));
  });

  // =====================================================================
  // 畫布
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W = 600, H = 600, L = null;
  function layout() {
    const g = 8;
    if (W >= 620) {
      const hT = Math.round(178 + 46 * (fs - 1)), hM = Math.round(214 + 50 * (fs - 1)), hS = Math.round(196 + 52 * (fs - 1));
      const wm = Math.round((W - 3 * g) * 0.42), ww = Math.round((W - 3 * g) * 0.4);
      L = {
        wide: true,
        meter: { x: g, y: g, w: wm, h: hT }, tuner: { x: 2 * g + wm, y: g, w: W - 3 * g - wm, h: hT },
        wave: { x: g, y: 2 * g + hT, w: ww, h: hM }, env: { x: 2 * g + ww, y: 2 * g + hT, w: W - 3 * g - ww, h: hM },
        spec: { x: g, y: 3 * g + hT + hM, w: W - 2 * g, h: hS }
      };
      H = 4 * g + hT + hM + hS;
    } else {
      const s = 4, side = W >= 340;
      const hT = Math.round((side ? 206 : 170) + 56 * (fs - 1)), hW = Math.round(168 + 40 * (fs - 1)), hE = Math.round(184 + 46 * (fs - 1)), hS = Math.round(212 + 58 + 70 * (fs - 1));
      let y = s;
      L = { wide: false };
      if (side) {
        const wm = Math.floor((W - 3 * s) / 2);
        L.meter = { x: s, y: y, w: wm, h: hT }; L.tuner = { x: 2 * s + wm, y: y, w: W - 3 * s - wm, h: hT }; y += hT + 8;
      } else {
        L.meter = { x: s, y: y, w: W - 2 * s, h: hT }; y += hT + 8;
        L.tuner = { x: s, y: y, w: W - 2 * s, h: hT }; y += hT + 8;
      }
      L.wave = { x: s, y: y, w: W - 2 * s, h: hW }; y += hW + 8;
      L.env = { x: s, y: y, w: W - 2 * s, h: hE }; y += hE + 8;
      L.spec = { x: s, y: y, w: W - 2 * s, h: hS }; y += hS + s;
      H = y;
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
    ctx.save();
    ctx.shadowColor = D.shadowInk(D.dark ? 0.35 : 0.08); ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
    D.roundRect(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fillStyle = alpha(C.surface, D.dark ? 0.32 : 0.66); ctx.fill();
    ctx.restore();
    D.roundRect(ctx, r.x, r.y, r.w, r.h, 10);
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
  /** 字加下標（畫布不可用下標字元）：base 之後接較小、較低的 sub；傳回總寬度 */
  function subText(base, sub, x, y, color, font, align, base2) {
    const px = parseFloat((/(\d+(?:\.\d+)?)px/.exec(font) || [0, 12])[1]);
    const subFont = font.replace(/(\d+(?:\.\d+)?)px/, (px * 0.72).toFixed(1) + 'px');
    ctx.font = font; const w1 = ctx.measureText(base).width;
    ctx.font = subFont; const w2 = ctx.measureText(sub).width;
    ctx.font = font; const w3 = base2 ? ctx.measureText(base2).width : 0;
    const tot = w1 + w2 + w3 + 1;
    const x0 = align === 'center' ? x - tot / 2 : align === 'right' ? x - tot : x;
    D.haloText(ctx, base, x0, y, color, 'left', 'alphabetic', font);
    D.haloText(ctx, sub, x0 + w1 + 0.5, y + px * 0.22, color, 'left', 'alphabetic', subFont);
    if (base2) D.haloText(ctx, base2, x0 + w1 + w2 + 1, y, color, 'left', 'alphabetic', font);
    return tot;
  }
  function pairLabel(k, which) { return (k > 1 ? String(k) : '') + 'f'; }

  // 播放中的時間與相位
  function liveNow() { return !!state.play; }
  function beatPhase() { return an.hasPair ? an.n * state.ph2 - an.m * state.ph1 : 0; }
  function lampLevel() {
    if (!an.hasPair) return 0;
    const a = 1 / an.m, b = 1 / an.n, lo = Math.abs(a - b), hi = a + b;
    const e = Core.envelope(a, b, beatPhase());
    return clamp((e - lo) / Math.max(1e-9, hi - lo), 0, 1);
  }

  // ---------- 拍頻計 ----------
  function drawMeter(now) {
    const r = L.meter, a = an;
    panel(r, T('拍頻計', 'Beat meter'), liveNow() ? T('播放中', 'playing') : '');
    const top = r.y + 26 * fs + 10;
    const R = clamp(Math.min(r.h * 0.15, r.w * 0.11), 15, 26);
    const cx = r.x + 14 + R, cy = top + R + 4;
    const live = liveNow();
    const u = live ? lampLevel() : 0;
    // 燈：發光的暈＋立體球
    if (a.hasPair && live && u > 0.02) {
      const gl = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 2.4);
      gl.addColorStop(0, alpha(C['bt-lamp'], 0.5 * u)); gl.addColorStop(1, alpha(C['bt-lamp'], 0));
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(cx, cy, R * 2.4, 0, TAU); ctx.fill();
    }
    const lampCol = a.hasPair ? mix(D.dark ? shade(C.muted, -0.35) : shade(C.muted, 0.35), C['bt-lamp'], live ? u : 0.12) : alpha(C.muted, 0.35);
    D.ball(ctx, cx, cy, R, lampCol, { glow: live ? 0.6 * u : 0 });
    const tu = (now - state.tapFlash) / 450;
    if (tu >= 0 && tu <= 1 && !D.reducedMotion()) D.ripple(ctx, cx, cy, R, tu, C.accent);
    // 大數字
    const nx = cx + R + 14;
    const big = a.hasPair ? fx(a.beat, beatDigits(a.beat)) : '—';
    let bf = 30;
    ctx.font = fnt(bf, 700);
    while (bf > 18 && ctx.measureText(big).width > r.x + r.w - 10 - nx) { bf -= 2; ctx.font = fnt(bf, 700); }
    const okNow = a.hasPair && a.err <= OK_BEAT;
    const col = !a.hasPair ? C.muted : okNow ? C['bt-ok'] : C.text;
    D.haloText(ctx, big, nx, cy + 2, col, 'left', 'alphabetic', fnt(bf, 700));
    D.haloText(ctx, T('拍／秒', 'beats/s'), nx, cy + 6 + 13 * fs, C.muted, 'left', 'alphabetic', fnt(11.5, 600));
    // 下面幾行說明
    const lh = 16 * fs;
    let y = Math.max(cy + R + 12 + 10 * fs, cy + 6 + 13 * fs + 8) + lh * 0.6;
    const maxW = r.w - 20;
    function line(text, color, weight) {
      ctx.font = fnt(11.5, weight || 500);
      let s = text;
      while (s.length > 6 && ctx.measureText(s).width > maxW) s = s.slice(0, -2);
      if (s !== text) s += '…';
      D.haloText(ctx, s, r.x + 10, y, color, 'left', 'alphabetic', fnt(11.5, weight || 500));
      y += lh;
    }
    if (!a.hasPair) line(T('純音的' + ivName(a.iv) + '：沒有重合的泛音', 'Pure ' + ivName(a.iv).toLowerCase() + ': no overtones meet'), C.muted, 600);
    else if (a.beat < 1e-9) line(T('不拍了：燈一直亮著', 'No beats: the lamp stays on'), C['bt-ok'], 700);
    else line(T('每 ' + fx(a.period, a.period < 10 ? 2 : 0) + ' 秒一拍・', 'one beat every ' + fx(a.period, a.period < 10 ? 2 : 0) + ' s · ') + (a.side === 'wide' ? T('寬', 'wide') : T('窄', 'narrow')), a.side === 'wide' ? C['bt-tun'] : C['bt-ref'], 600);
    const tgt = a.target === 'equal' ? T('目標（平均律）：', 'Target (equal): ') + fx(a.targetBeat, 2) + (a.targetBeat > 1e-9 ? ' ' + sideShort(a.targetSigned) : '')
      : T('目標（純律）：0 拍', 'Target (just): 0 beats');
    line(tgt + (okNow ? '  ✓' : ''), okNow ? C['bt-ok'] : C.text, okNow ? 700 : 500);
    const tr = state.tapRes;
    if (tr && tr.taps >= 2) line(T('你數到：', 'You counted: ') + fx(tr.rate, 2) + T('（' + tr.taps + ' 下）', ' (' + tr.taps + ' taps)'), C.accent, 600);
    else if (!live) line(T('按「▶ 播放」，燈會跟著拍閃', 'Press “▶ Play” and the lamp flashes with the beats'), C.muted);
    else line(T('跟著燈按「跟著拍按」', 'Tap along with the lamp'), C.muted);
  }

  // ---------- 調音器 ----------
  function drawTuner() {
    const r = L.tuner, a = an;
    panel(r, T('調音器', 'Tuner'), T('相對', 'vs ') + tgName(a.target));
    const top = r.y + 26 * fs + 12, bot = r.y + r.h - (40 * fs + 10);
    const Rg = Math.max(30, Math.min(r.w / 2 - 26, bot - top - 4));
    const cx = r.x + r.w / 2, cy = top + Rg + 2;
    const ang = function (c) { return Math.PI + (clamp(c, -50, 50) + 50) / 100 * Math.PI; };
    // 刻度盤：外圈帶、綠色的「調準」區、刻度
    ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(cx, cy, Rg, Math.PI, TAU); ctx.strokeStyle = alpha(C.text, 0.1); ctx.lineWidth = 10; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, Rg, ang(-2), ang(2)); ctx.strokeStyle = alpha(C['bt-ok'], 0.7); ctx.lineWidth = 10; ctx.stroke();
    for (let c = -50; c <= 50; c += 5) {
      const th = ang(c), big = c % 25 === 0, r0 = Rg - (big ? 12 : 8), r1 = Rg + 5;
      ctx.beginPath(); ctx.moveTo(cx + r0 * Math.cos(th), cy + r0 * Math.sin(th)); ctx.lineTo(cx + r1 * Math.cos(th), cy + r1 * Math.sin(th));
      ctx.strokeStyle = alpha(C.text, big ? 0.45 : 0.22); ctx.lineWidth = big ? 1.6 : 1; ctx.stroke();
      if (big) {
        const rl = Rg + 13;
        D.haloText(ctx, c === 0 ? '0' : sg(c, 0), cx + rl * Math.cos(th), cy + rl * Math.sin(th) + 3, C.muted, 'center', 'middle', fnt(10, 600));
      }
    }
    // 純律與平均律的位置（相對目標）
    const marks = [{ c: Core.cents(a.fJust / a.fTarget), t: T('純', 'J'), col: C['bt-ok'] }];
    if (a.iv !== 'unison' && a.iv !== 'octave') marks.push({ c: Core.cents(a.fEt / a.fTarget), t: T('平', 'ET'), col: C.accent });
    // 文字放在點的旁邊（不放正下方，免得被指針蓋住）；兩個點靠得近時往兩邊分開
    const dJE = marks.length > 1 ? marks[0].c - marks[1].c : -1;
    marks.forEach(function (m, i) {
      if (Math.abs(m.c) > 50) return;
      const th = ang(m.c), rr = Rg - 18;
      const px = cx + rr * Math.cos(th), py = cy + rr * Math.sin(th);
      ctx.beginPath(); ctx.arc(px, py, 3, 0, TAU); ctx.fillStyle = m.col; ctx.fill();
      const side = (i === 0 ? 1 : -1) * (dJE >= 0 ? 1 : -1);
      ctx.font = fnt(10, 700);
      const dx = side * (ctx.measureText(m.t).width / 2 + 7);
      D.haloText(ctx, m.t, px + dx, py + 9 * fs, m.col, 'center', 'middle', fnt(10, 700));
    });
    // 指針
    const off = Math.abs(a.cents) > 50, okNow = a.hasPair ? a.err <= OK_BEAT : Math.abs(a.cents) < 0.5;
    const th = ang(a.cents), len = Rg - 4;
    const ncol = okNow ? C['bt-ok'] : off ? C['bt-beat'] : C.text;
    ctx.save();
    ctx.shadowColor = D.shadowInk(0.25); ctx.shadowBlur = 4; ctx.shadowOffsetY = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - 6 * Math.cos(th), cy - 6 * Math.sin(th)); ctx.lineTo(cx + len * Math.cos(th), cy + len * Math.sin(th));
    ctx.strokeStyle = ncol; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();
    ctx.restore();
    D.ball(ctx, cx, cy, 6, ncol, { shadow: false });
    // 數字
    const ty = cy + 22 * fs;
    D.haloText(ctx, sg(a.cents, Math.abs(a.cents) < 100 ? 2 : 1) + T(' 音分', ' cents'), cx, ty, ncol, 'center', 'alphabetic', fnt(15, 700));
    ctx.font = fnt(10.5);
    let sub = T('目標 ', 'target ') + fx(a.fTarget, 2) + ' Hz' + LP() + noteTag(a.fTarget) + RP();
    while (sub.length > 8 && ctx.measureText(sub).width > r.w - 16) sub = sub.slice(0, -2);
    D.haloText(ctx, sub, cx, ty + 16 * fs, C.muted, 'center', 'alphabetic', fnt(10.5, 500));
    if (off) D.haloText(ctx, a.cents > 0 ? '→' : '←', cx + (a.cents > 0 ? 1 : -1) * (Rg + 8), cy + 2, C['bt-beat'], 'center', 'middle', fnt(14, 700));
  }

  // ---------- 波形（真實時間） ----------
  function signal(f, ph0, t, P, norm) {
    let s = 0;
    for (let i = 0; i < P.length; i++) s += P[i].a * Math.sin(P[i].k * (ph0 + TAU * f * t));
    return s / norm;
  }
  function drawWave() {
    const r = L.wave, a = an;
    const Tw = 3 / state.fRef;
    panel(r, T('波形', 'Waveforms'), fx(Tw * 1000, 1) + T(' 毫秒', ' ms'));
    const P = Core.partials(state.mode), norm = P.reduce(function (s, p) { return s + p.a; }, 0);
    const x0 = r.x + 10 + 54 * fs, x1 = r.x + r.w - 10;
    const top = r.y + 26 * fs + 8, bot = r.y + r.h - (16 * fs + 6);
    const lh = (bot - top) / 3;
    // 播放中：視窗從參考音最近一次「相位 0」開始，參考音看起來不動，待調音慢慢滑過去
    const tau = (((state.ph1 % TAU) + TAU) % TAU) / (TAU * state.fRef);
    const ph2s = state.ph2 - TAU * a.f2 * tau;
    const N = Math.max(90, Math.round((x1 - x0) * 1.4));
    const lanes = [
      { name: T('參考音', 'reference'), col: C['bt-ref'], f: function (t) { return signal(state.fRef, 0, t, P, norm); } },
      { name: T('待調音', 'tuned'), col: C['bt-tun'], f: function (t) { return signal(a.f2, ph2s, t, P, norm); } },
      { name: T('相加', 'sum'), col: C['bt-sum'], f: function (t) { return (signal(state.fRef, 0, t, P, norm) + signal(a.f2, ph2s, t, P, norm)) / 2; }, sum: true }
    ];
    lanes.forEach(function (ln, i) {
      const yc = top + lh * (i + 0.5), amp = lh / 2 - 3;
      ctx.beginPath(); ctx.moveTo(x0, Math.round(yc) + 0.5); ctx.lineTo(x1, Math.round(yc) + 0.5); ctx.strokeStyle = alpha(C.text, 0.1); ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath();
      for (let j = 0; j <= N; j++) { const x = x0 + (x1 - x0) * j / N, y = yc - ln.f(Tw * j / N) * amp; if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.strokeStyle = ln.col; ctx.lineWidth = ln.sum ? 2 : 1.4; ctx.lineJoin = 'round'; ctx.stroke();
      D.haloText(ctx, ln.name, r.x + 10, yc + 4, ln.col, 'left', 'alphabetic', fnt(11, 700));
    });
    D.haloText(ctx, T('真實時間：參考音 3 個週期', 'real time: 3 periods of the reference'), x1, bot + 13 * fs, C.muted, 'right', 'alphabetic', fnt(10));
  }

  // ---------- 拍的包絡 ----------
  function niceTime(t) { return t >= 1 ? fx(t, t < 10 ? 2 : 1) + T(' 秒', ' s') : fx(t * 1000, 0) + T(' 毫秒', ' ms'); }
  function drawEnv(now) {
    const r = L.env, a = an;
    const Tw = a.win;
    panel(r, T('拍：響度的起伏', 'Beats: the swelling loudness'), T('時間窗 ', 'window ') + niceTime(Tw));
    const x0 = r.x + 12, x1 = r.x + r.w - 12;
    const head = r.y + 26 * fs + 10;
    if (!a.hasPair) {
      ctx.font = fnt(11.5, 600); ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const yc = (head + r.y + r.h) / 2;
      ctx.fillText(T('純音的' + ivName(a.iv) + '：沒有重合的泛音，', 'Pure ' + ivName(a.iv).toLowerCase() + ': no overtones coincide,'), (x0 + x1) / 2, yc - 9 * fs);
      ctx.fillText(T('沒有可以數的拍', 'so there are no beats to count'), (x0 + x1) / 2, yc + 9 * fs);
      return;
    }
    // 標頭：哪一對、每秒幾拍
    const pa = 1 / a.m, pb = 1 / a.n;
    let xh = x0;
    xh += subText(pairLabel(a.m), '1', xh, head + 10 * fs, C['bt-ref'], fnt(12, 700));
    xh += 4 + subText(T(' 對 ', ' vs ') + pairLabel(a.n), '2', xh + 4, head + 10 * fs, C['bt-tun'], fnt(12, 700));
    const bcol = a.err <= OK_BEAT ? C['bt-ok'] : a.beat > 15 ? C['bt-beat'] : C.text;
    D.haloText(ctx, fx(a.beat, beatDigits(a.beat)) + T(' 拍／秒', ' beats/s'), x1, head + 10 * fs, bcol, 'right', 'alphabetic', fnt(12, 700));
    const pTop = head + 20 * fs, pBot = r.y + r.h - (18 * fs + 8);
    const yc = (pTop + pBot) / 2, la = (pBot - pTop) / 2 - 2;
    const live = liveNow();
    const k = live ? Math.floor(state.tPlay / Tw) : 0, ws = k * Tw;
    const thNow = beatPhase(), s = a.beatSigned;
    const th = function (t) { return thNow + TAU * s * (t - state.tPlay); };
    const normE = pa + pb;
    const env = function (t) { return Core.envelope(pa, pb, th(t)) / normE; };
    const M = Math.max(160, Math.round((x1 - x0) * 2));
    const X = function (t) { return x0 + (t - ws) / Tw * (x1 - x0); };
    ctx.beginPath(); ctx.moveTo(x0, Math.round(yc) + 0.5); ctx.lineTo(x1, Math.round(yc) + 0.5); ctx.strokeStyle = alpha(C.text, 0.1); ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath();
    for (let j = 0; j <= M; j++) { const t = ws + Tw * j / M, e = env(t); if (j) ctx.lineTo(X(t), yc - e * la); else ctx.moveTo(X(t), yc - e * la); }
    for (let j = M; j >= 0; j--) { const t = ws + Tw * j / M; ctx.lineTo(X(t), yc + env(t) * la); }
    ctx.closePath();
    const col = C['bt-sum'];
    const gg = ctx.createLinearGradient(0, yc - la, 0, yc + la);
    gg.addColorStop(0, alpha(col, 0.32)); gg.addColorStop(0.5, alpha(col, 0.07)); gg.addColorStop(1, alpha(col, 0.32));
    ctx.fillStyle = gg; ctx.fill();
    // 示意載波
    const cyc = Math.max(30, Math.round((x1 - x0) / 4.5));
    ctx.beginPath();
    for (let j = 0; j <= M; j++) { const u = j / M, t = ws + Tw * u, yv = yc - env(t) * la * Math.sin(TAU * cyc * u); if (j) ctx.lineTo(X(t), yv); else ctx.moveTo(X(t), yv); }
    ctx.strokeStyle = alpha(col, 0.42); ctx.lineWidth = 0.8; ctx.stroke();
    // 包絡線
    [1, -1].forEach(function (sgn) {
      ctx.beginPath();
      for (let j = 0; j <= M; j++) { const t = ws + Tw * j / M, y = yc - sgn * env(t) * la; if (j) ctx.lineTo(X(t), y); else ctx.moveTo(X(t), y); }
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    });
    // 下方的說明膠囊：避開兩端的時間標籤，放不下時改成不畫時間標籤
    const tL = niceTime(ws).replace(/^0 \S+/, '0'), tR = niceTime(ws + Tw);
    let pillBox = null;
    function pillAt(lbl, want, col) {
      const f = fnt(10.5, 700);
      ctx.font = f; const pw = ctx.measureText(lbl).width + 16;
      ctx.font = fnt(10); const wl = ctx.measureText(tL).width + 8, wr = ctx.measureText(tR).width + 8;
      const lo = x0 + wl + pw / 2, hi = x1 - wr - pw / 2;
      const lx = lo <= hi ? clamp(want, lo, hi) : clamp(want, x0 + pw / 2, x1 - pw / 2);
      D.pill(ctx, lbl, lx, yc + la + 2 + 16 * fs, col, 'center', f);
      pillBox = { l: lx - pw / 2, r: lx + pw / 2 };
    }
    // 一拍的長度：兩個相鄰的響度最大處
    if (a.beat > 1e-9) {
      const P = 1 / a.beat, base = state.tPlay - thNow / (TAU * s);
      const tm = base + P * Math.ceil((ws - base) / P - 1e-9);
      if (tm + P <= ws + Tw + 1e-9) {
        const xa = X(tm), xb = X(tm + P), yb = yc - la - 2;
        ctx.beginPath(); ctx.moveTo(xa, yb + 6); ctx.lineTo(xa, yb); ctx.lineTo(xb, yb); ctx.lineTo(xb, yb + 6);
        ctx.strokeStyle = C['bt-beat']; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
        [xa, xb].forEach(function (x) { ctx.beginPath(); ctx.arc(x, yc - la, 2.6, 0, TAU); ctx.fillStyle = C['bt-beat']; ctx.fill(); });
        pillAt(T('1 拍 = ', '1 beat = ') + niceTime(P), (xa + xb) / 2, C['bt-beat']);
      }
    } else {
      pillAt(T('不拍：響度不變', 'No beats: the loudness stays the same'), (x0 + x1) / 2, C['bt-ok']);
    }
    // 播放的游標
    if (live) {
      const xp = X(state.tPlay);
      ctx.beginPath(); ctx.moveTo(xp, pTop - 2); ctx.lineTo(xp, pBot + 2); ctx.strokeStyle = alpha(C.accent, 0.85); ctx.lineWidth = 1.6; ctx.stroke();
      D.ball(ctx, xp, yc - env(state.tPlay) * la, 4, C['bt-lamp'], { shadow: false, glow: 0.5 });
    }
    // 時間窗兩端的時間：放得下才畫（不和下面的「1 拍 = …」重疊）
    ctx.font = fnt(10); ctx.fillStyle = C.muted; ctx.textBaseline = 'alphabetic';
    if (!pillBox || pillBox.l > x0 + ctx.measureText(tL).width + 6) { ctx.textAlign = 'left'; ctx.fillText(tL, x0, r.y + r.h - 6); }
    if (!pillBox || pillBox.r < x1 - ctx.measureText(tR).width - 6) { ctx.textAlign = 'right'; ctx.fillText(tR, x1, r.y + r.h - 6); }
    void now;
  }

  // ---------- 頻譜 ----------
  function drawSpectrum() {
    const r = L.spec, a = an;
    panel(r, T('頻譜：兩個音的泛音', 'Spectra of the two notes'), T('線性頻率軸', 'linear frequency axis'));
    const P = Core.partials(state.mode);
    const fMax = Math.max(Math.max(4.5, a.m + 1.5) * state.fRef, a.f2 * 1.15);
    const px0 = r.x + 14, px1 = r.x + r.w - 14;
    // 窄螢幕：放大框放在頻譜上方自己的一列（不蓋住打拍那一對的標籤）
    const band = a.hasPair && !L.wide ? Math.round(58 * fs) : 0;
    const top = r.y + 26 * fs + 12 + band, bot = r.y + r.h - (16 * fs + 10);
    const yc = Math.round((top + bot) / 2) + 0.5, hmax = (bot - top) / 2 - 18 * fs;
    const X = function (f) { return px0 + f / fMax * (px1 - px0); };
    // 頻率刻度（參考音的整數倍）
    ctx.font = fnt(10); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    // 刻度間距：依畫面寬度決定最多幾格（窄螢幕不擠在一起）
    const maxTicks = Math.max(3, Math.floor((px1 - px0) / (46 * fs)));
    let step = Math.pow(10, Math.floor(Math.log10(fMax / 4))), mult = 1;
    while (fMax / (step * mult) > maxTicks) { if (mult === 1) mult = 2; else if (mult === 2) mult = 5; else { step *= 10; mult = 1; } }
    for (let f = 0; f <= fMax; f += step * mult) {
      const x = Math.round(X(f)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.strokeStyle = alpha(C.text, 0.06); ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = C.muted; ctx.fillText(f >= 1000 ? fx(f / 1000, f % 1000 ? 1 : 0) + 'k' : String(Math.round(f)), x, bot + 4);
    }
    ctx.textAlign = 'right'; ctx.fillText('Hz', px1, bot + 4 + 12 * fs);
    ctx.beginPath(); ctx.moveTo(px0, yc); ctx.lineTo(px1, yc); ctx.strokeStyle = alpha(C.text, 0.25); ctx.lineWidth = 1; ctx.stroke();
    const bw = clamp((px1 - px0) / 70, 3, 7);
    const isPair = function (k, w) { return a.hasPair && ((w === 0 && k === a.m) || (w === 1 && k === a.n)); };
    const twin = a.twin;
    const isTwin = function (k, w) { return twin && ((w === 0 && k === twin.m) || (w === 1 && k === twin.n)); };
    function bar(x, h, col, up, hi) {
      const y0 = up ? yc - 1 - h : yc + 1, y1 = up ? yc - 1 : yc + 1 + h;
      if (hi) {
        ctx.save(); ctx.shadowColor = alpha(hi, 0.9); ctx.shadowBlur = 10;
        D.roundRect(ctx, x - bw / 2 - 2, y0 - 2, bw + 4, y1 - y0 + 4, 4); ctx.fillStyle = alpha(hi, 0.35); ctx.fill(); ctx.restore();
      }
      const gg = ctx.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0);
      gg.addColorStop(0, shade(col, 0.3)); gg.addColorStop(0.55, col); gg.addColorStop(1, shade(col, -0.25));
      D.roundRect(ctx, x - bw / 2, y0, bw, Math.max(1, y1 - y0), Math.min(3, bw / 2));
      ctx.fillStyle = gg; ctx.fill();
    }
    P.forEach(function (p) { const f = p.k * state.fRef; if (f <= fMax) bar(X(f), Math.max(2, hmax * p.a), C['bt-ref'], true, isPair(p.k, 0) ? C['bt-beat'] : isTwin(p.k, 0) ? C['bt-twin'] : null); });
    P.forEach(function (p) { const f = p.k * a.f2; if (f <= fMax) bar(X(f), Math.max(2, hmax * p.a), C['bt-tun'], false, isPair(p.k, 1) ? C['bt-beat'] : isTwin(p.k, 1) ? C['bt-twin'] : null); });
    // 打拍的那一對：標籤與括號
    function bracket(m, n, col, beat, row) {
      const xa = X(m * state.fRef), xb = X(n * a.f2);
      ctx.beginPath(); ctx.moveTo(xa, yc - 6); ctx.lineTo(xa, yc); ctx.lineTo(xb, yc); ctx.lineTo(xb, yc + 6);
      ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
      const ha = hmax / m, hb = hmax / n;
      subText(pairLabel(m), '1', xa, yc - 4 - Math.max(2, ha) - 4, col, fnt(11, 700), 'center');
      subText(pairLabel(n), '2', xb, yc + 4 + Math.max(2, hb) + 13 * fs, col, fnt(11, 700), 'center');
      const lbl = fx(beat, beatDigits(beat)) + T(' 拍／秒', ' beats/s');
      const lx = clamp(Math.max(xa, xb) + 10, px0, px1 - 70 * fs);
      D.pill(ctx, lbl, lx, yc - 4 - row * 18 * fs, col, 'left', fnt(10.5, 700));
    }
    if (a.hasPair) {
      if (twin) bracket(twin.m, twin.n, C['bt-twin'], twin.beat, 1);
      bracket(a.m, a.n, C['bt-beat'], a.beat, 0);
    }
    // 兩個音的名稱：如果會蓋住打拍那一對的標籤，就挪到那一對的右邊
    const lRef = T('參考音 ', 'reference ') + fx(state.fRef, 2) + ' Hz ↑', lTun = T('待調音 ', 'tuned ') + fx(a.f2, 2) + ' Hz ↓';
    ctx.font = fnt(10.5, 700);
    const lw = Math.max(ctx.measureText(lRef).width, ctx.measureText(lTun).width);
    let lx0 = px0 + 2;
    if (a.hasPair) {
      const xp = Math.max(X(a.m * state.fRef), X(a.n * a.f2));
      if (xp < lx0 + lw + 14 * fs) lx0 = Math.min(xp + 16 * fs, px1 - lw);
    }
    D.haloText(ctx, lRef, lx0, top + 10 * fs, C['bt-ref'], 'left', 'alphabetic', fnt(10.5, 700));
    D.haloText(ctx, lTun, lx0, bot - 4, C['bt-tun'], 'left', 'alphabetic', fnt(10.5, 700));
    // 放大鏡：打拍的那兩根相差多少 Hz
    if (a.hasPair) {
      const zw = band ? Math.min(250 * fs, px1 - px0) : Math.min(170 * fs, (px1 - px0) * 0.42), zh = 54 * fs;
      const zx = band ? (px0 + px1 - zw) / 2 : px1 - zw, zy = band ? r.y + 26 * fs + 6 : top - 4;
      D.roundRect(ctx, zx, zy, zw, zh, 8);
      ctx.fillStyle = alpha(C['canvas-bg'], D.dark ? 0.85 : 0.92); ctx.fill();
      ctx.strokeStyle = alpha(C['bt-beat'], 0.45); ctx.lineWidth = 1; ctx.stroke();
      const span = Math.max(1, Math.ceil(Math.abs(a.beatSigned) * 1.6 * 10) / 10);
      const mid = (a.fa + a.fb) / 2, zx0 = zx + 12, zx1 = zx + zw - 12, zyl = zy + zh - 12 * fs - 4;
      const ZX = function (f) { return zx0 + (f - (mid - span)) / (2 * span) * (zx1 - zx0); };
      ctx.beginPath(); ctx.moveTo(zx0, zyl); ctx.lineTo(zx1, zyl); ctx.strokeStyle = alpha(C.text, 0.3); ctx.lineWidth = 1; ctx.stroke();
      [[a.fa, C['bt-ref'], -1], [a.fb, C['bt-tun'], 1]].forEach(function (q) {
        const x = ZX(q[0]);
        ctx.beginPath(); ctx.moveTo(x, zyl); ctx.lineTo(x, zyl - 16 * fs); ctx.strokeStyle = q[1]; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke();
      });
      D.haloText(ctx, T('放大：相差 ', 'zoom: ') + fx(Math.abs(a.fb - a.fa), 2) + ' Hz' + T('', ' apart'), zx + zw / 2, zy + 13 * fs, C['bt-beat'], 'center', 'alphabetic', fnt(10.5, 700));
      ctx.font = fnt(9.5); ctx.fillStyle = C.muted; ctx.textBaseline = 'top';
      ctx.textAlign = 'left'; ctx.fillText('−' + fx(span, 1), zx0, zyl + 2);
      ctx.textAlign = 'right'; ctx.fillText('+' + fx(span, 1) + ' Hz', zx1, zyl + 2);
    }
  }

  function draw(now) {
    D.backdrop(ctx, W, H);
    drawMeter(now);
    drawTuner();
    drawWave();
    drawEnv(now);
    drawSpectrum();
  }

  // ---------- 畫布的文字說明（螢幕閱讀器） ----------
  let labelTimer = 0;
  function scheduleLabel() { clearTimeout(labelTimer); labelTimer = setTimeout(updateCanvasLabel, 400); }
  function updateCanvasLabel() {
    const a = an;
    const desc = T('拍頻與調音的儀表：參考音 ' + fx(a.fRef, 2) + ' Hz，待調音 ' + fx(a.f2, 2) + ' Hz，' + ivName(a.iv) + '，目標' + tgName(a.target) + '。',
      'Beats and tuning meters: reference ' + fx(a.fRef, 2) + ' Hz, tuned note ' + fx(a.f2, 2) + ' Hz, ' + ivName(a.iv).toLowerCase() + ', target ' + tgName(a.target) + '. ') +
      beatSentence() + T('調音器：' + sg(a.cents, 2) + ' 音分。', ' Tuner: ' + sg(a.cents, 2) + ' cents.');
    cv.setAttribute('aria-label', desc);
  }

  // ---------- 動畫迴圈 ----------
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    const now = performance.now();
    let more = false;
    const p = state.play;
    if (p) {
      const dt = Math.min(0.1, Math.max(0, (now - p.last) / 1000));
      p.last = now;
      state.tPlay += dt;
      state.ph1 = (state.ph1 + TAU * state.fRef * dt) % TAU;
      state.ph2 = (state.ph2 + TAU * an.f2 * dt) % TAU;
      more = true;
      if (view3 && view3.active) view3.frame();
    }
    if (now - state.tapFlash < 500) more = true;
    if (!view3 || !view3.active) draw(now);
    if (more) requestDraw();
  }

  // =====================================================================
  // 3D：切換到 3D 時才載入 js/beats-tuning-3d.js 與 three.js
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0, rebuildTimer = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    Core: Core, T: T, D: D,
    colors: function () { return C; },
    fs: function () { return fs; },
    /** 3D 需要的量：打拍那一對的振幅 a、b、有正負號的拍頻 s、時間窗、播放的時間與相位 */
    data: function () {
      const a = an, live = liveNow();
      const Tw = a.win, k = live ? Math.floor(state.tPlay / Tw) : 0;
      return {
        an: a, hasPair: a.hasPair, a: a.hasPair ? 1 / a.m : 0, b: a.hasPair ? 1 / a.n : 0, s: a.hasPair ? a.beatSigned : 0,
        win: Tw, ws: k * Tw, tPlay: live ? state.tPlay : 0, thNow: beatPhase(), playing: live
      };
    },
    fx: fx, sg: sg, ivName: ivName, tgName: tgName, sideWord: sideWord,
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 儀表。', 'The 3D graphics context was lost, so the view switched back to the 2D meters.');
    }
  };
  function update3D(rebuild) {
    if (!view3 || !view3.active) return;
    if (rebuild) { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(function () { if (view3 && view3.active) view3.rebuild(); }, 60); }
    else view3.frame();
  }
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.BeatsTuning3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.BeatsTuning3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/beats-tuning-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.BeatsTuning3D) throw new Error('beats-tuning-3d.js did not load');
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
        view3 = window.BeatsTuning3D.create(lib, host3, bridge);
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
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 儀表。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D meters are kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ---------- 分享目前設定：調音紀錄（滑桿與模式按鈕由 classroom.js 記錄） ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      return { rec: state.records.map(function (r) { return [r.iv, r.target, r.mode, +r.fRef.toFixed(2), +r.f2.toFixed(2)]; }) };
    },
    set: function (o) {
      if (!o || typeof o !== 'object' || !Array.isArray(o.rec)) return;
      state.records = o.rec.slice(-MAX_REC).filter(function (x) { return Array.isArray(x) && isFinite(x[3]) && isFinite(x[4]); }).map(function (x) {
        const iv = Core.IVS[x[0]] ? x[0] : 'unison', fRef = clamp(+x[3], Core.REF_MIN, Core.REF_MAX);
        const q = Core.analyze({ fRef: fRef, offset: clamp(+x[4], 1, 4000) - Core.justFreq(fRef, iv), iv: iv, target: x[1], mode: x[2] });
        return { iv: q.iv, target: q.target, mode: q.mode, fRef: q.fRef, f2: q.f2, beat: q.beat, s: q.beatSigned, cents: q.cents };
      });
      renderRecords();
    }
  });

  // 給測試用的介面（不影響畫面）
  window.__bt = {
    state: state,
    analysis: function () { return an; },
    view3: function () { return view3; }
  };

  // =====================================================================
  // 啟動（不發聲、不送任務事件）
  // =====================================================================
  readColors();
  readControls();
  ivBtns.forEach(function (b) { if (b.getAttribute('aria-pressed') === 'true') state.iv = b.dataset.iv; });
  tgBtns.forEach(function (b) { if (b.getAttribute('aria-pressed') === 'true') state.target = b.dataset.target; });
  mdBtns.forEach(function (b) { if (b.getAttribute('aria-pressed') === 'true') state.mode = b.dataset.mode; });
  analyze();
  lastKey = [state.fRef, an.f2, state.iv, state.mode, state.target].join('|');
  document.querySelector('.view-bar').setAttribute('data-share-skip', '');
  updateSoundButton();
  renderButtons(); renderOutputs(); renderReadouts(); renderRecords(); updateStop(); updateCanvasLabel();
  function themeChanged() {
    readColors();
    lastHTML = {};
    renderReadouts();
    if (view3 && view3.active) view3.onTheme();
    resize();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && (ev.detail.name === 'lang' || ev.detail.name === 'fs')) {
      readColors(); lastHTML = {}; renderOutputs(); renderReadouts(); renderRecords(); updateCanvasLabel(); updateSoundButton();
      if (view3 && view3.active) view3.onTheme();
      resize();
    }
  });
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  resize();
})();
