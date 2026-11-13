/* pitch-frequency.js — 「音高與頻率：從振動到音名」的畫面與互動
 * （數學在 pitch-frequency-core.js；聲音一律用 music-audio.js；2D 繪圖工具 LabDraw 在 drawkit.js；3D 在 pitch-frequency-3d.js，切到 3D 時才載入）
 *
 * 畫面：上面的畫布是 10 ms 的波形（色帶是一個個週期）、放大一個週期的小窗、像調音器的音名與偏差；
 *       中間（可左右捲動的容器）是 88 鍵鋼琴與各樂器、聲部的大致音域，共用同一條對數頻率軸，紅線是目前的頻率；
 *       下面的小圖是同樣的八度畫在線性軸與對數軸上。
 * 聲音：只有學生按了「▶ 播放」、點琴鍵、「先 A 後 B」才發聲；播放中拖曳滑桿或按按鈕，持續音跟著改變。
 *       音效關閉時畫面照跑，狀態列顯示提示並讓音效開關閃一下（不會自己打開音效）。
 * 任務事件：'pitch'（學生改了頻率、標準音或寫法）、'play'、'compare'；格式寫在 js/missions/pitch-frequency.js 的開頭。 */
(function () {
  'use strict';
  const PC = window.PitchCore;
  const D = window.LabDraw;
  const AU = window.MusicAudio;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha, shade = D.shade, mix = D.mix;
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const TAU = Math.PI * 2;
  const WIN_MS = 10;                         // 波形窗固定 10 ms
  const PLAY_MAX = 6;                        // 「▶ 播放」的持續音最長幾秒（純音由 MusicAudio 限制在 4 秒以內）
  const CMP_DUR = 1.25, CMP_GAP = 0.3;       // 「先 A 後 B」每個音幾秒、中間空幾秒
  const PARTIALS = { pure: [1], soft: [1, 0.45, 0.26, 0.15, 0.09, 0.05] };
  const GAIN = 0.32;

  // ---------- 狀態 ----------
  const state = {
    f: 440, a4: 440, flat: false, solfege: false, timbre: 'soft',
    A: null, B: null, recs: [],            // 兩個記憶與比較紀錄
    voice: null, playVis: null,            // 持續音；畫面上的「播放中」（音效關閉時也照樣動）
    cmp: null,                             // 「先 A 後 B」的動畫 { t0 }
    committed: null,                       // 上一次送出事件時的狀態（滑桿的 prev）
    offHintShown: false, hmode: 'lin'
  };
  const cur = function () { return PC.analyze(state.f, state.a4); };
  const lite = function () { const a = cur(); return { f: state.f, a4: state.a4, midi: a.midi, name: a.name, cents: a.cents }; };

  // ---------- 色彩與字體 ----------
  let C = {}, fs = 1;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'pf-wave', 'pf-period', 'pf-cur', 'pf-inst', 'pf-voice', 'pf-lin', 'pf-log', 'pf-key', 'pf-keyb', 'pf-memA', 'pf-memB']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    fs = Math.max(1, Math.min(1.45, parseFloat(cs.getPropertyValue('--fs')) || 1));
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + (px * fs).toFixed(1) + 'px ' + FONT; }

  // ---------- 數字與音名 ----------
  function fx(v, d) { if (v == null || !isFinite(v)) return '—'; let s = v.toFixed(d); if (/^-0(\.0+)?$/.test(s)) s = s.slice(1); return s.replace('-', '−'); }
  function sg(v, d) {
    if (v == null || !isFinite(v)) return '—';
    const s = Math.abs(v).toFixed(d);
    if (+s === 0) return (0).toFixed(d);
    return (v < 0 ? '−' : '+') + s;
  }
  const esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  /** 音名（依目前的升降寫法），例如 'G♯4' 或 'A♭4' */
  const letter = function (m) { return PC.label(m, { flat: state.flat }); };
  /** 顯示用的名字：唱名開啟時是「Sol（G4）」 */
  function nameOf(m) { return state.solfege ? PC.label(m, { flat: state.flat, solfege: true, octave: false }) + T('（', ' (') + letter(m) + T('）', ')') : letter(m); }
  function fHz(f) { return fx(f, f >= 1000 ? 1 : 2) + ' Hz'; }
  function centsTxt(c) { return Math.abs(c) < 0.005 ? T('0 音分（準）', '0 cents (in tune)') : sg(c, 1) + T(' 音分', ' cents'); }
  function describe(a) {
    return nameOf(a.midi) + ' ' + centsTxt(a.cents) + T('，', ', ') + fx(a.f, 2) + ' Hz' + T('，週期 ', ', period ') + fx(a.T, 3) + ' ms' +
      T('，波長 ', ', wavelength ') + fx(a.lambda, 3) + ' m' + (a.inPiano ? '' : T('（鋼琴外）', ' (off the piano)'));
  }

  // ---------- 任務事件 ----------
  function emit(type, data) {
    if (window.LabShare && window.LabShare.restoring) return;
    if (window.LabMission) window.LabMission.emit(type, data);
  }
  function emitPitch(via, prev, extra) {
    const a = cur();
    emit('pitch', Object.assign(a, { via: via, flat: state.flat, solfege: state.solfege, prev: prev, jump: PC.cents(prev.f, state.f), dHz: state.f - prev.f }, extra || {}));
    state.committed = lite();
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  const elF = $('freq'), elFo = $('freqo'), elA = $('a4'), elAo = $('a4o');
  if (window.LabNum) window.LabNum.register(elF, { toValue: PC.fFromPos, toPos: PC.posFromF, min: PC.F_MIN, max: PC.F_MAX, decimals: 2 });
  /** 讓滑桿的位置跟上 state（不送事件；打字的精確值以 state 為準） */
  function syncSliders() {
    if (window.LabNum) { window.LabNum.clear(elF); window.LabNum.clear(elA); }
    elF.value = String(Math.round(PC.posFromF(state.f)));
    elA.value = String(Math.round(state.a4));
    elFo.textContent = fx(state.f, 2);
    elAo.textContent = fx(state.a4, Math.abs(state.a4 - Math.round(state.a4)) > 1e-9 ? 2 : 0);
  }
  /** 改頻率（鍵盤、按鈕、鍵盤方向鍵）：via 是任務事件的來源 */
  function setF(g, via, extra, quiet) {
    g = PC.clampF(g);
    if (Math.abs(g - state.f) < 1e-12) return false;
    const prev = lite();
    state.f = g;
    syncSliders();
    freqChanged(!quiet);
    emitPitch(via, prev, extra);
    return true;
  }
  function freqChanged(scroll) {
    if (state.voice) state.voice.set({ f0: state.f }, 0.03);
    renderReadout(); renderButtons(); updateLabels();
    if (scroll) scrollToCurrent(false);
    rebuild3D(); requestDraw();
  }

  // 頻率滑桿：拖曳時即時更新（播放中的音跟著變），放開或打字輸入時送出事件
  elF.addEventListener('input', function () {
    const g = PC.clampF(val(elF));
    if (Math.abs(g - state.f) < 1e-12) return;
    state.f = g;
    elFo.textContent = fx(state.f, 2);
    freqChanged(true);
  });
  elF.addEventListener('change', function () {
    state.f = PC.clampF(val(elF));
    elFo.textContent = fx(state.f, 2);
    const prev = state.committed || lite();
    if (Math.abs(prev.f - state.f) < 1e-12 && prev.a4 === state.a4) return;
    freqChanged(true);
    emitPitch('slider', prev);
    say(describe(cur()));
  });

  // 半音、八度、加 100 Hz
  document.querySelectorAll('[data-step]').forEach(function (b) {
    b.addEventListener('click', function () {
      const k = +b.dataset.step, g = PC.step(state.f, k);
      if (g == null) return;
      setF(g, Math.abs(k) === 12 ? 'oct' : 'semi', { dir: k > 0 ? 1 : -1 });
      say(describe(cur()) + T('（頻率 ×', ' (frequency ×') + fx(Math.pow(2, k / 12), 4) + T('）', ')'));
    });
  });
  $('add100').addEventListener('click', function () {
    const r = PC.add100(state.f);
    if (!r) return;
    const f0 = state.f;
    setF(r.f, 'add100');
    say(T('加 100 Hz：' + fx(f0, 2) + ' → ' + fx(r.f, 2) + ' Hz，升高 ' + fx(r.cents, 1) + ' 音分（' + fx(r.cents / 1200, 2) + ' 個八度）。現在是 ',
      'Add 100 Hz: ' + fx(f0, 2) + ' → ' + fx(r.f, 2) + ' Hz, up ' + fx(r.cents, 1) + ' cents (' + fx(r.cents / 1200, 2) + ' octaves). Now ') + nameOf(cur().midi) + ' ' + centsTxt(cur().cents) + T('。', '.'));
  });
  function renderButtons() {
    document.querySelectorAll('[data-step]').forEach(function (b) { b.disabled = PC.step(state.f, +b.dataset.step) == null; });
    $('add100').disabled = !PC.add100(state.f);
    document.querySelectorAll('[data-a4]').forEach(function (b) { b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.a4 - state.a4) < 1e-9)); });
    document.querySelectorAll('[data-spell]').forEach(function (b) { b.setAttribute('aria-pressed', String((b.dataset.spell === 'flat') === state.flat)); });
    $('solfege').setAttribute('aria-pressed', String(state.solfege));
    document.querySelectorAll('[data-timbre]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.timbre === state.timbre)); });
    document.querySelectorAll('[data-hmode]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.hmode === state.hmode)); });
  }

  // 標準音
  function setA4(v, via) {
    v = PC.clampA4(v);
    if (Math.abs(v - state.a4) < 1e-9) { syncSliders(); return; }
    const prev = lite();
    state.a4 = v;
    syncSliders();
    renderA4Hint(); freqChanged(true);
    emitPitch(via || 'a4', prev);
    say(T('標準音 A4 = ' + fx(v, 2) + ' Hz。同一個頻率現在是 ', 'Standard pitch A4 = ' + fx(v, 2) + ' Hz. The same frequency is now ') + describe(cur()));
  }
  elA.addEventListener('input', function () {
    const v = PC.clampA4(val(elA));
    if (Math.abs(v - state.a4) < 1e-9) return;
    state.a4 = v;
    elAo.textContent = fx(v, Math.abs(v - Math.round(v)) > 1e-9 ? 2 : 0);
    renderA4Hint(); freqChanged(false);
  });
  elA.addEventListener('change', function () {
    const v = PC.clampA4(val(elA));
    const prev = state.committed || lite();
    state.a4 = v;
    syncSliders();
    if (Math.abs(prev.a4 - v) < 1e-9 && Math.abs(prev.f - state.f) < 1e-12) return;
    renderA4Hint(); freqChanged(true);
    emitPitch('a4', prev);
    say(T('標準音 A4 = ' + fx(v, 2) + ' Hz。同一個頻率現在是 ', 'Standard pitch A4 = ' + fx(v, 2) + ' Hz. The same frequency is now ') + describe(cur()));
  });
  document.querySelectorAll('[data-a4]').forEach(function (b) { b.addEventListener('click', function () { setA4(+b.dataset.a4, 'a4'); }); });
  function renderA4Hint() {
    const a = state.a4, c = PC.cents(440, a);
    let h;
    if (Math.abs(c) < 1e-9) h = T('A4 = 440 Hz 是國際標準 ISO 16。', 'A4 = 440 Hz is the international standard ISO 16.');
    else h = T('比 440 Hz ' + (c > 0 ? '高 ' : '低 ') + fx(Math.abs(c), 2) + ' 音分：鍵盤上每個音的頻率都乘上 ' + fx(a / 440, 5) + '。',
      (c > 0 ? 'Higher' : 'Lower') + ' than 440 Hz by ' + fx(Math.abs(c), 2) + ' cents: every key’s frequency is multiplied by ' + fx(a / 440, 5) + '.');
    $('a4Hint').textContent = h + ' ' + T('C4 = ', 'C4 = ') + fx(PC.etFreq(60, a), 3) + ' Hz';
  }

  // 音名寫法
  document.querySelectorAll('[data-spell]').forEach(function (b) {
    b.addEventListener('click', function () {
      const flat = b.dataset.spell === 'flat';
      if (flat === state.flat) return;
      const prev = lite();
      state.flat = flat;
      renderButtons(); renderReadout(); renderMem(); renderRecs(); rebuild3D(); requestDraw();
      emitPitch('spell', prev);
      say(T('寫法：', 'Spelling: ') + (flat ? T('降記號', 'flats') : T('升記號', 'sharps')) + T('。現在是 ', '. Now ') + nameOf(cur().midi) + T('。', '.'));
    });
  });
  $('solfege').addEventListener('click', function () {
    const prev = lite();
    state.solfege = !state.solfege;
    renderButtons(); renderReadout(); renderMem(); renderRecs(); rebuild3D(); requestDraw();
    emitPitch('solfege', prev);
    say(T('唱名：', 'Solfège: ') + (state.solfege ? T('開（固定唱名，Do = C）', 'on (fixed do, do = C)') : T('關', 'off')) + T('。現在是 ', '. Now ') + nameOf(cur().midi) + T('。', '.'));
  });

  // =====================================================================
  // 讀數
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  function instName(x) { return T(x.zh, x.en); }
  function renderReadout() {
    const a = cur();
    setHTML('rName', esc(nameOf(a.midi)));
    setHTML('rCents', '<span style="color:' + (Math.abs(a.cents) <= 5 ? C['pf-inst'] : 'inherit') + '">' + esc(centsTxt(a.cents)) + '</span>');
    setHTML('rF', fx(a.f, 2) + ' Hz');
    setHTML('rT', fx(a.T, a.T >= 10 ? 2 : 3) + ' ms');
    setHTML('rL', a.lambda >= 1 ? fx(a.lambda, 3) + ' m' : fx(a.lambda * 100, 1) + ' cm');
    setHTML('rN', sg(a.n, 2) + ' <small>' + T('（最接近 ', '(nearest ') + sg(a.nRound, 0) + T('）', ')') + '</small>');
    setHTML('rMidi', String(a.midi) + (a.inPiano ? ' <small>' + T('第 ' + (a.midi - 20) + ' 鍵', 'key ' + (a.midi - 20)) + '</small>' : ' <small>' + T('鋼琴外', 'off piano') + '</small>'));
    const ins = PC.INSTRUMENTS.filter(function (x) { return a.insts.indexOf(x.id) >= 0; });
    setHTML('rInst', '<b>' + T('演奏得到的樂器與聲部（大致）：', 'Can be played or sung by (roughly): ') + '</b>' +
      (ins.length ? ins.map(function (x) { return esc(instName(x)); }).join(T('、', ', ')) : T('（表上的都到不了）', '(none in the chart)')));
  }

  // =====================================================================
  // 比較兩個音（記憶 A、B 與比較紀錄）
  // =====================================================================
  function memLine(x) {
    if (!x) return '<span style="color:var(--muted)">' + T('（空）', '(empty)') + '</span>';
    return esc(nameOf(x.midi)) + ' ' + esc(sg(x.cents, 1)) + T(' 音分', '¢') + '・' + fx(x.f, 2) + ' Hz' +
      (Math.abs(x.a4 - 440) > 1e-9 ? ' <small style="color:var(--muted)">(A4 = ' + fx(x.a4, Math.abs(x.a4 - Math.round(x.a4)) > 1e-9 ? 2 : 0) + ')</small>' : '');
  }
  function renderMem() {
    setHTML('mem', '<span class="tag tA">A</span><span>' + memLine(state.A) + '</span><span class="tag tB">B</span><span>' + memLine(state.B) + '</span>');
    $('cmp').disabled = !(state.A && state.B);
  }
  function renderRecs() {
    if (!state.recs.length) { setHTML('recWrap', '<p class="rec-empty">' + T('比較紀錄會列在這裡。', 'Your comparisons will be listed here.') + '</p>'); return; }
    let h = '<table class="rec"><thead><tr><th>' + T('A → B', 'A → B') + '</th><th>' + T('差（Hz）', 'Diff. (Hz)') + '</th><th>' + T('音程（音分）', 'Interval (cents)') + '</th><th>' + T('比值', 'Ratio') + '</th></tr></thead><tbody>';
    state.recs.slice().reverse().forEach(function (r) {
      h += '<tr><td>' + esc(letter(r.A.midi) + ' → ' + letter(r.B.midi)) + '</td><td>' + sg(r.dHz, 2) + '</td><td>' + sg(r.cents, 1) + '</td><td>' + fx(r.B.f / r.A.f, 4) + '</td></tr>';
    });
    setHTML('recWrap', h + '</tbody></table>');
  }
  $('storeA').addEventListener('click', function () { state.A = lite(); renderMem(); requestDraw(); say(T('存成 A：', 'Stored as A: ') + describe(cur())); });
  $('storeB').addEventListener('click', function () { state.B = lite(); renderMem(); requestDraw(); say(T('存成 B：', 'Stored as B: ') + describe(cur())); });
  $('cmp').addEventListener('click', function () {
    if (!(state.A && state.B)) { say(T('先用「存成 A」「存成 B」存兩個音。', 'First store two notes with “Store as A” and “Store as B”.')); return; }
    stopEverything();
    const on = soundCheck();
    const A = state.A, B = state.B, c = PC.cents(A.f, B.f), dHz = B.f - A.f;
    if (on) {
      const t0 = AU.now() + 0.05, P = PARTIALS[state.timbre];
      AU.tone({ f0: A.f, partials: P, dur: CMP_DUR, gain: GAIN, attack: 0.03, release: 0.2, at: t0 });
      AU.tone({ f0: B.f, partials: P, dur: CMP_DUR, gain: GAIN, attack: 0.03, release: 0.2, at: t0 + CMP_DUR + CMP_GAP });
    }
    state.cmp = { t0: performance.now() };
    state.recs.push({ A: A, B: B, cents: c, dHz: dHz });
    if (state.recs.length > 12) state.recs.shift();
    renderRecs(); updateStop(); requestDraw();
    emit('compare', { A: Object.assign({}, A), B: Object.assign({}, B), cents: c, dHz: dHz });
    say(T('A → B：相差 ' + sg(dHz, 2) + ' Hz，音程 ' + sg(c, 1) + ' 音分（' + fx(Math.abs(c) / 100, 2) + ' 個半音），頻率比 ' + fx(B.f / A.f, 4) + '。',
      'A → B: ' + sg(dHz, 2) + ' Hz apart, an interval of ' + sg(c, 1) + ' cents (' + fx(Math.abs(c) / 100, 2) + ' semitones), ratio ' + fx(B.f / A.f, 4) + '.'));
  });
  $('clear').addEventListener('click', function () {
    state.A = null; state.B = null; state.recs = []; state.cmp = null;
    renderMem(); renderRecs(); requestDraw();
    say(T('A、B 與比較紀錄都清掉了。', 'A, B and the comparison log are cleared.'));
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
  $('play').addEventListener('click', function () {
    stopEverything();
    const on = soundCheck();
    const a = cur();
    if (on) {
      state.voice = AU.sustain({ f0: state.f, partials: PARTIALS[state.timbre], gain: GAIN, attack: 0.05, maxDur: PLAY_MAX,
        onEnd: function () { state.voice = null; state.playVis = null; updateStop(); requestDraw(); } });
    }
    state.playVis = { t0: performance.now(), dur: on ? PLAY_MAX : 3 };
    updateStop(); requestDraw();
    emit('play', Object.assign(a, { flat: state.flat, solfege: state.solfege, timbre: state.timbre }));
    if (on) say(T('播放：', 'Playing: ') + describe(a) + (state.f >= 4000 && state.timbre === 'pure' ? T('（4 kHz 以上的純音很刺耳，戴耳機的同學先把音量調小）', ' (a pure tone above 4 kHz is piercing: turn headphones down)') : ''));
  });
  document.querySelectorAll('[data-timbre]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.timbre = b.dataset.timbre;
      if (state.voice) state.voice.set({ partials: PARTIALS[state.timbre] });
      renderButtons();
    });
  });
  function keyTone(m) {
    if (state.voice) return;                     // 播放中：持續音已經跟著改
    if (!AU.enabled()) {
      if (!state.offHintShown) { state.offHintShown = true; setTimeout(function () { say(AU.offHint()); }, 60); AU.flashSoundButton(); }
      return;
    }
    AU.tone({ f0: state.f, partials: PARTIALS[state.timbre], dur: 0.7, gain: GAIN, attack: 0.02, release: 0.3 });
  }
  function busy() { return !!(state.playVis || state.cmp); }
  function updateStop() { $('stop').disabled = !(AU.playing() || busy()); }
  function stopEverything() {
    if (state.voice) { state.voice.stop(0.08); state.voice = null; }
    state.playVis = null; state.cmp = null;
    AU.stopAll(0.08);
    updateStop(); requestDraw();
  }
  $('stop').addEventListener('click', function () { stopEverything(); say(T('已停止。', 'Stopped.')); });
  AU.onChange(function () { if (state.voice && !AU.playing()) state.voice = null; updateStop(); });
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
    if (ev.detail && ev.detail.name === 'sound') { updateSoundButton(); if (!ev.detail.value) { state.voice = null; } updateStop(); }
  });

  // =====================================================================
  // 上方畫布：10 ms 波形、放大一個週期、調音器
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W = 600, H = 220, L = null;
  function headTexts(a) {
    return [T('10 ms 內的波形', 'The wave over 10 ms'),
      'f = ' + fx(a.f, 2) + ' Hz' + T('・10 ms 裡有 ', ' · ') + fx(a.f * WIN_MS / 1000, a.f * WIN_MS / 1000 < 10 ? 2 : 1) + T(' 個週期', ' periods in 10 ms')];
  }
  function layoutWave() {
    // 標題列放不下兩段字時（手機、字體大）分成兩行；用最長的讀數估寬度
    const ht = headTexts({ f: 4186.01 });
    ctx.font = fnt(12, 700); const wl = ctx.measureText(ht[0]).width;
    ctx.font = fnt(12, 600); const wr = ctx.measureText(ht[1]).width;
    const two = wl + wr + 36 > W;
    const head = two ? Math.round(36 * fs + 10) : Math.round(22 * fs + 8);
    if (W >= 560) {
      const rw = Math.round(Math.min(270, W * 0.36));
      const mainH = Math.round(150 + 20 * (fs - 1));
      H = head + mainH + 12;
      const tunerH = Math.round(64 * fs + 8);
      L = { head: head, wave: { x: 10, y: head, w: W - rw - 26, h: mainH }, tuner: { x: W - rw - 8, y: head, w: rw, h: tunerH },
        zoom: { x: W - rw - 8, y: head + tunerH + 8, w: rw, h: mainH - tunerH - 8 }, two: two, stack: false };
    } else {
      // 窄畫面：調音表的音分放在音名下一行，所以這一列高一些
      const waveH = Math.round(120 + 16 * (fs - 1)), rowH = Math.round(98 + 22 * (fs - 1) + 18 * fs);
      H = head + waveH + 10 + rowH + 8;
      const hw = Math.floor((W - 26) / 2);
      L = { head: head, wave: { x: 8, y: head, w: W - 16, h: waveH }, tuner: { x: W - 8 - hw, y: head + waveH + 10, w: hw, h: rowH },
        zoom: { x: 8, y: head + waveH + 10, w: hw, h: rowH }, two: two, stack: true };
    }
  }
  function panel(r, title) {
    D.roundRect(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fillStyle = alpha(C.surface, D.dark ? 0.32 : 0.62); ctx.fill();
    ctx.strokeStyle = alpha(C.text, 0.08); ctx.lineWidth = 1; ctx.stroke();
    if (title) {
      ctx.font = fnt(11, 600);
      const tw = ctx.measureText(title).width;
      if (tw > r.w - 16) ctx.font = fnt(11 * (r.w - 16) / tw, 600);   // 窄畫面：標題縮小到放得下
      ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(title, r.x + 8, r.y + 5);
    }
  }
  /** 播放中的波形慢慢往左流動（示意，已大幅放慢）；減少動態時不動 */
  function phaseNow(now) {
    const p = state.playVis || state.cmp;
    if (!p || D.reducedMotion()) return 0;
    return ((now - p.t0) / 1000) * 0.8;     // 每秒流動 0.8 個週期（真正的聲音快幾百倍）
  }
  function drawWave(now) {
    const a = cur(), r = L.wave;
    panel(r, null);
    const x0 = r.x + 34 * fs, x1 = r.x + r.w - 10, yc = r.y + r.h / 2 + 6 * fs, amp = r.h / 2 - 22 * fs;
    const msPx = (x1 - x0) / WIN_MS, Tms = a.T, cycPx = Tms * msPx;
    // 時間軸
    ctx.strokeStyle = alpha(C.text, 0.12); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, yc); ctx.lineTo(x1, yc); ctx.stroke();
    ctx.font = fnt(10); ctx.fillStyle = C.muted; ctx.textBaseline = 'top';
    // 刻度字放不下（手機、字體大）就改成每 5 ms 一個
    // （頭尾的字靠邊對齊，所以相鄰兩個字最多佔 1.5 個字寬）
    const msStep = 2 * msPx >= 1.5 * ctx.measureText('10 ms').width + 10 ? 2 : 5;
    for (let ms = 0; ms <= WIN_MS; ms += msStep) {
      const x = x0 + ms * msPx;
      ctx.beginPath(); ctx.moveTo(x, r.y + r.h - 16 * fs); ctx.lineTo(x, r.y + r.h - 13 * fs); ctx.stroke();
      ctx.textAlign = ms === 0 ? 'left' : ms === WIN_MS ? 'right' : 'center';
      ctx.fillText(ms + ' ms', x, r.y + r.h - 13 * fs);
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, r.y + 2, x1 - x0, r.h - 4); ctx.clip();
    const ph = phaseNow(now);
    const shift = (ph % 1) * cycPx;
    if (cycPx >= 5) {
      // 週期色帶（交錯）
      const n0 = -1, n1 = Math.ceil((x1 - x0) / cycPx) + 1;
      for (let k = n0; k <= n1; k++) {
        if (k % 2) continue;
        const xa = x0 + k * cycPx - shift, xb = xa + cycPx;
        ctx.fillStyle = alpha(C['pf-period'], D.dark ? 0.12 : 0.09);
        ctx.fillRect(xa, yc - amp - 6, xb - xa, 2 * amp + 12);
      }
      // 正弦波：每個週期至少 24 點、每個像素至少 2 點
      const N = Math.min(6000, Math.max(Math.ceil((x1 - x0) * 2), Math.ceil((x1 - x0) / cycPx * 24)));
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const x = x0 + (x1 - x0) * i / N, t = (x - x0 + shift) / cycPx;
        const y = yc - amp * Math.sin(TAU * t);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = alpha(C['pf-wave'], 0.25); ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.strokeStyle = C['pf-wave']; ctx.lineWidth = cycPx < 10 ? 1.2 : 2; ctx.stroke();
    } else {
      // 太密了：只畫波的範圍（不畫出錯誤的疊影）
      const g = ctx.createLinearGradient(0, yc - amp, 0, yc + amp);
      g.addColorStop(0, alpha(C['pf-wave'], 0.55)); g.addColorStop(0.5, alpha(C['pf-wave'], 0.2)); g.addColorStop(1, alpha(C['pf-wave'], 0.55));
      ctx.fillStyle = g; ctx.fillRect(x0, yc - amp, x1 - x0, 2 * amp);
      D.pill(ctx, T('太密了，畫不出每一個波：看右邊的放大', 'Too dense to draw each wave: see the close-up'), (x0 + x1) / 2, yc + 8 * fs, C['pf-wave'], 'center', fnt(11, 600));
    }
    ctx.restore();
    // 週期 T 的標示（第一個週期）
    const ty = r.y + 6 * fs + 4;
    const xe = Math.min(x1, x0 + cycPx);
    ctx.strokeStyle = C['pf-period']; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, ty + 4); ctx.lineTo(x0, ty + 12); ctx.moveTo(x0, ty + 8); ctx.lineTo(xe, ty + 8);
    if (xe < x1) { ctx.moveTo(xe, ty + 4); ctx.lineTo(xe, ty + 12); }
    ctx.stroke(); ctx.lineCap = 'butt';
    const over = cycPx > x1 - x0;
    const tl = 'T = ' + fx(Tms, Tms >= 10 ? 2 : 3) + ' ms' + (over ? T('（比 10 ms 還長）', ' (longer than 10 ms)') : '');
    D.pill(ctx, tl, Math.min(x1 - 4, Math.max(x0 + 4, over ? x1 - 4 : x0 + cycPx / 2)), ty + 6, C['pf-period'], over ? 'right' : (cycPx < 120 * fs ? 'left' : 'center'), fnt(11, 700));
    // 左邊：說明
    ctx.save();
    ctx.translate(r.x + 12 * fs, yc); ctx.rotate(-Math.PI / 2);
    ctx.font = fnt(10.5, 600); ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(T('空氣的振動', 'air vibration'), 0, 0);
    ctx.restore();
    // 播放中：示意已放慢
    if ((state.playVis || state.cmp) && !D.reducedMotion()) {
      D.haloText(ctx, T('流動已放慢示意', 'motion slowed down'), x1, r.y + r.h - 28 * fs, C.muted, 'right', 'top', fnt(10.5));
    }
  }
  function drawZoom() {
    const a = cur(), r = L.zoom;
    panel(r, T('放大 1 個週期', 'One period, enlarged'));
    const x0 = r.x + 12, x1 = r.x + r.w - 12, yc = r.y + r.h / 2 + 7 * fs, amp = Math.max(8, r.h / 2 - 20 * fs);
    ctx.strokeStyle = alpha(C.text, 0.12); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, yc); ctx.lineTo(x1, yc); ctx.stroke();
    ctx.fillStyle = alpha(C['pf-period'], D.dark ? 0.14 : 0.1);
    ctx.fillRect(x0, yc - amp - 3, x1 - x0, 2 * amp + 6);
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) { const x = x0 + (x1 - x0) * i / 120, y = yc - amp * Math.sin(TAU * i / 120); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.strokeStyle = C['pf-wave']; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.font = fnt(10); ctx.fillStyle = C.muted; ctx.textBaseline = 'top';
    ctx.textAlign = 'left'; ctx.fillText('0', x0, yc + amp + 4);
    ctx.textAlign = 'right'; ctx.fillText(fx(a.T, a.T >= 10 ? 2 : 3) + ' ms', x1, yc + amp + 4);
  }
  function drawTuner() {
    const a = cur(), r = L.tuner;
    panel(r, null);
    const big = state.solfege ? PC.label(a.midi, { flat: state.flat, solfege: true, octave: false }) : letter(a.midi);
    const sub = state.solfege ? letter(a.midi) : '';
    const inTune = Math.abs(a.cents) <= 5;
    const col = inTune ? C['pf-inst'] : C['pf-cur'];
    const nameY = r.y + 8 + 18 * fs;
    ctx.font = fnt(24, 800);
    const bw = ctx.measureText(big).width;
    D.haloText(ctx, big, r.x + 12, nameY, C.text, 'left', 'middle', fnt(24, 800));
    if (sub) D.haloText(ctx, '(' + sub + ')', r.x + 18 + bw, nameY + 2, C.muted, 'left', 'middle', fnt(12, 600));
    if (L.stack) D.haloText(ctx, centsTxt(a.cents), r.x + 12, nameY + 20 * fs, col, 'left', 'middle', fnt(12, 700));
    else D.haloText(ctx, centsTxt(a.cents), r.x + r.w - 10, nameY, col, 'right', 'middle', fnt(12.5, 700));
    // −50 … +50 音分的尺
    const by = r.y + r.h - 16 * fs - 6, bx0 = r.x + 16, bx1 = r.x + r.w - 16;
    const X = function (c) { return bx0 + (c + 50) / 100 * (bx1 - bx0); };
    const g = ctx.createLinearGradient(bx0, 0, bx1, 0);
    g.addColorStop(0, alpha(C['pf-cur'], 0.35)); g.addColorStop(0.45, alpha(C['pf-inst'], 0.35)); g.addColorStop(0.55, alpha(C['pf-inst'], 0.35)); g.addColorStop(1, alpha(C['pf-cur'], 0.35));
    D.roundRect(ctx, bx0, by - 4, bx1 - bx0, 8, 4); ctx.fillStyle = g; ctx.fill();
    ctx.font = fnt(9.5); ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [-50, -25, 0, 25, 50].forEach(function (c) {
      ctx.beginPath(); ctx.moveTo(X(c), by - 7); ctx.lineTo(X(c), by + 7); ctx.strokeStyle = alpha(C.text, c === 0 ? 0.6 : 0.25); ctx.lineWidth = c === 0 ? 2 : 1; ctx.stroke();
      ctx.fillText(c === 0 ? '0' : sg(c, 0), X(c), by + 7);
    });
    const nx = X(Math.max(-50, Math.min(50, a.cents)));
    ctx.save();
    ctx.shadowColor = alpha(col, 0.6); ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.moveTo(nx, by - 13); ctx.lineTo(nx - 5, by - 21); ctx.lineTo(nx + 5, by - 21); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(nx, by - 13); ctx.lineTo(nx, by + 5); ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
  }
  function drawHead() {
    const a = cur();
    ctx.font = fnt(12, 700); ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const ht = headTexts(a);
    const y1 = L.two ? 5 + 9 * fs : L.head / 2, y2 = L.two ? 5 + 27 * fs : L.head / 2;
    ctx.fillText(ht[0], 10, y1);
    ctx.font = fnt(12, 600); ctx.fillStyle = C['pf-wave']; ctx.textAlign = L.two ? 'left' : 'right';
    const w2 = ctx.measureText(ht[1]).width;
    if (L.two && w2 > W - 20) ctx.font = fnt(12 * (W - 20) / w2, 600);   // 很窄的畫面：字縮小到放得下
    ctx.fillText(ht[1], L.two ? 10 : W - 10, y2);
  }
  function drawMain(now) {
    D.backdrop(ctx, W, H);
    drawHead(); drawWave(now); drawZoom(); drawTuner();
  }

  // =====================================================================
  // 鍵盤與音域圖（同一條對數軸；容器可以左右捲動）
  // =====================================================================
  const kbwrap = $('kbwrap'), cvK = $('cvKeys'), kx = cvK.getContext('2d');
  let KW = 800, KH = 420, K = null;
  const coarse = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
  function layoutKeys() {
    const wrapW = kbwrap.clientWidth || 600;
    const minWW = coarse && coarse.matches ? 26 : 15;
    const pad = 12;
    const ww = Math.max(minWW, (wrapW - 2 * pad) / PC.WHITE_COUNT);
    KW = Math.round(ww * PC.WHITE_COUNT + 2 * pad);
    const top = Math.round(26 * fs + 6), keyH = Math.round(118 + 10 * (fs - 1)), axisH = Math.round(24 * fs + 6);
    const rowH = Math.round(17 * fs + 5), gap = 8;
    const nInst = PC.INSTRUMENTS.filter(function (x) { return x.group === 'inst'; }).length, nVoice = PC.INSTRUMENTS.length - nInst;
    const chartY = top + keyH + axisH;
    KH = chartY + (nInst + nVoice) * rowH + gap + 10;
    K = { pad: pad, ww: ww, top: top, keyH: keyH, axisY: top + keyH, axisH: axisH, chartY: chartY, rowH: rowH, gap: gap, nInst: nInst };
  }
  const X = function (xk) { return K.pad + xk * K.ww; };
  const xOfMf = function (mf) { return X(PC.xOfMidi(mf)); };
  function rowY(i) { return K.chartY + i * K.rowH + (i >= K.nInst ? K.gap : 0); }
  function drawKeys(now) {
    const c = kx, a = cur();
    c.fillStyle = C['canvas-bg']; c.fillRect(0, 0, KW, KH);
    const g0 = c.createLinearGradient(0, 0, 0, KH);
    g0.addColorStop(0, alpha(C.text, D.dark ? 0 : 0.015)); g0.addColorStop(1, D.dark ? 'rgba(0,0,0,0.18)' : alpha(C.text, 0.04));
    c.fillStyle = g0; c.fillRect(0, 0, KW, KH);
    const y0 = K.top, kh = K.keyH, bh = kh * 0.62, ww = K.ww;
    // 鍵盤底座陰影
    c.save();
    c.shadowColor = D.shadowInk(D.dark ? 0.55 : 0.2); c.shadowBlur = 10; c.shadowOffsetY = 3;
    c.fillStyle = C['pf-keyb'];
    D.roundRect(c, X(0) - 3, y0 - 4, ww * PC.WHITE_COUNT + 6, kh + 7, 6); c.fill();
    c.restore();
    const near = a.midi, onKey = Math.abs(a.cents) <= 5;
    const memM = function (x) { return x ? PC.midiFloat(x.f, state.a4) : null; };
    const mA = memM(state.A), mB = memM(state.B);
    // 白鍵
    for (let m = PC.KEY_LO; m <= PC.KEY_HI; m++) {
      if (PC.isBlack(m)) continue;
      const xl = X(PC.keyCenter(m) - 0.5);
      const g = c.createLinearGradient(0, y0, 0, y0 + kh);
      let base = C['pf-key'];
      if (m === near) base = mix(C['pf-key'], C['pf-cur'], onKey ? 0.42 : 0.22);
      g.addColorStop(0, shade(base, -0.08)); g.addColorStop(0.12, base); g.addColorStop(0.9, base); g.addColorStop(1, shade(base, -0.16));
      D.roundRect(c, xl + 0.5, y0, ww - 1, kh, Math.min(4, ww * 0.18));
      c.fillStyle = g; c.fill();
      c.strokeStyle = alpha('#000000', D.dark ? 0.45 : 0.22); c.lineWidth = 1; c.stroke();
      if (m % 12 === 0 || m === near) {
        const lab = m === near ? (state.solfege ? PC.label(m, { flat: state.flat, solfege: true, octave: false }) : letter(m)) : 'C' + (Math.floor(m / 12) - 1);
        c.font = fnt(Math.min(11, ww * 0.62), m === near ? 800 : 600);
        c.fillStyle = m === near ? shade(C['pf-cur'], D.dark ? 0 : -0.2) : '#5b616b';
        c.textAlign = 'center'; c.textBaseline = 'bottom';
        if (c.measureText(lab).width <= ww * 1.6) c.fillText(lab, X(PC.keyCenter(m)), y0 + kh - 5);
      }
    }
    // 黑鍵
    for (let m = PC.KEY_LO; m <= PC.KEY_HI; m++) {
      if (!PC.isBlack(m)) continue;
      const cx = X(PC.keyCenter(m)), bw = ww * 0.6;
      let base = C['pf-keyb'];
      if (m === near) base = mix(C['pf-keyb'], C['pf-cur'], onKey ? 0.75 : 0.5);
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 4; c.shadowOffsetY = 2;
      D.roundRect(c, cx - bw / 2, y0 - 1, bw, bh, Math.min(3, bw * 0.2));
      const g = c.createLinearGradient(0, y0, 0, y0 + bh);
      g.addColorStop(0, shade(base, 0.22)); g.addColorStop(0.25, base); g.addColorStop(1, shade(base, -0.2));
      c.fillStyle = g; c.fill();
      c.restore();
      c.fillStyle = alpha('#ffffff', 0.16); c.fillRect(cx - bw / 2 + 2, y0 + bh - 7, bw - 4, 2);
    }
    // 記憶 A、B 的位置（小標籤）
    [[mA, 'A', C['pf-memA']], [mB, 'B', C['pf-memB']]].forEach(function (q) {
      if (q[0] == null) return;
      const x = xOfMf(q[0]);
      if (x < 0 || x > KW) return;
      // 畫在琴鍵下段（黑鍵以下、八度字樣以上），不蓋到下面頻率軸的字
      const r = Math.max(6.5, Math.min(9, ww * 0.45)), yc = y0 + kh * 0.62 + (kh * 0.38 - 16) / 2;
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = 3; c.shadowOffsetY = 1;
      c.beginPath(); c.arc(x, yc, r, 0, Math.PI * 2); c.fillStyle = q[2]; c.fill();
      c.restore();
      c.fillStyle = D.dark ? '#0d0f13' : '#ffffff'; c.font = fnt(Math.min(10.5, r * 1.25), 800); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(q[1], x, yc + 0.5);
    });
    // 頻率軸：每個 A 的頻率
    const ay = K.axisY;
    c.font = fnt(10); c.textBaseline = 'top'; c.textAlign = 'center';
    for (let m = 21; m <= 105; m += 12) {
      const txt = fx(PC.etFreq(m, state.a4), PC.etFreq(m, state.a4) < 100 ? 1 : 0) + ' Hz';
      const half = c.measureText(txt).width / 2 + 2;
      const x = Math.max(X(0) + half, Math.min(X(PC.WHITE_COUNT) - half, X(PC.keyCenter(m))));
      c.fillStyle = C.muted;
      c.fillText(txt, x, ay + 14 * fs);
    }
    // 音域長條
    const mf = a.mf;
    PC.INSTRUMENTS.forEach(function (ins, i) {
      const y = rowY(i), h = K.rowH - 5;
      const xa = xOfMf(ins.lo - 0.5), xb = xOfMf(ins.hi + 0.5);
      const on = a.insts.indexOf(ins.id) >= 0;
      const col = ins.group === 'voice' ? C['pf-voice'] : C['pf-inst'];
      if (on) { c.save(); c.shadowColor = alpha(col, 0.55); c.shadowBlur = 8; }
      D.roundRect(c, xa, y, xb - xa, h, h / 2);
      const g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, alpha(shade(col, 0.25), on ? 0.85 : 0.32)); g.addColorStop(1, alpha(shade(col, -0.1), on ? 0.85 : 0.32));
      c.fillStyle = g; c.fill();
      if (on) c.restore();
      c.strokeStyle = alpha(col, on ? 0.9 : 0.45); c.lineWidth = 1; c.stroke();
      // 名稱：放在長條目前看得到的部分的左邊
      const vis0 = kbwrap.scrollLeft, vis1 = vis0 + (kbwrap.clientWidth || KW);
      const label = instName(ins) + ' ' + letter(ins.lo) + '–' + letter(ins.hi);
      c.font = fnt(10.5, on ? 700 : 600);
      const tw = c.measureText(label).width;
      let lx = Math.max(xa + 6, vis0 + 6);
      if (lx + tw > Math.min(xb - 6, vis1 - 6)) lx = Math.max(xa + 6, Math.min(xb, vis1) - tw - 6);
      const inside = lx + tw <= xb - 4 && lx >= xa;
      if (!inside) lx = xb + 6 + tw < vis1 ? xb + 6 : xa - tw - 6;
      if (inside && on) { c.fillStyle = D.dark ? '#0b1220' : '#ffffff'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(label, lx, y + h / 2 + 0.5); }
      else D.haloText(c, label, lx, y + h / 2 + 0.5, on ? col : C.muted, 'left', 'middle', fnt(10.5, on ? 700 : 600));
    });
    // 分組標題的分隔線
    const sy = rowY(K.nInst) - K.gap / 2 - 1;
    c.strokeStyle = alpha(C.text, 0.08); c.lineWidth = 1; c.setLineDash([3, 4]);
    c.beginPath(); c.moveTo(X(0), sy); c.lineTo(X(PC.WHITE_COUNT), sy); c.stroke(); c.setLineDash([]);
    // 目前的頻率：紅線＋指針
    const x = xOfMf(mf);
    c.save();
    c.shadowColor = alpha(C['pf-cur'], 0.6); c.shadowBlur = 6;
    c.beginPath(); c.moveTo(x, K.top - 4); c.lineTo(x, KH - 6);
    c.strokeStyle = C['pf-cur']; c.lineWidth = 2; c.stroke();
    c.restore();
    c.beginPath(); c.moveTo(x, K.top - 2); c.lineTo(x - 6, K.top - 11); c.lineTo(x + 6, K.top - 11); c.closePath();
    c.fillStyle = C['pf-cur']; c.fill();
    // 不在鍵上：從最接近的鍵中心畫一段弧線到目前的位置
    const xn = X(PC.keyCenter(Math.max(21, Math.min(108, near))));
    if (Math.abs(a.cents) > 0.5 && a.inPiano) {
      c.beginPath(); c.moveTo(xn, y0 + 6); c.lineTo(x, y0 + 6);
      c.strokeStyle = alpha(C['pf-cur'], 0.75); c.lineWidth = 3; c.lineCap = 'round'; c.stroke(); c.lineCap = 'butt';
      D.ball(c, xn, y0 + 6, 3, C['pf-cur'], { shadow: false });
    }
    const pillTxt = nameOf(near) + ' ' + (Math.abs(a.cents) < 0.05 ? T('（準）', '(in tune)') : sg(a.cents, 1) + T(' 音分', '¢'));
    c.font = fnt(11.5, 700);
    const pw = c.measureText(pillTxt).width + 12;
    const vis0 = kbwrap.scrollLeft, vis1 = vis0 + (kbwrap.clientWidth || KW);
    const px = Math.max(vis0 + pw / 2 + 4, Math.min(vis1 - pw / 2 - 4, x));
    D.pill(c, pillTxt, px, K.top - 12, C['pf-cur'], 'center', fnt(11.5, 700));
    // 鍵盤焦點框（鍵盤操作時）
    if (kb && kb.focused()) {
      c.save(); c.setLineDash([4, 3]); c.strokeStyle = C.accent; c.lineWidth = 2;
      D.roundRect(c, x - ww * 0.75, K.top - 2, ww * 1.5, kh + 4, 6); c.stroke(); c.restore();
    }
    // 「先 A 後 B」播放中：亮起正在響的那一個
    if (state.cmp) {
      const el = (now - state.cmp.t0) / 1000;
      const which = el < CMP_DUR + CMP_GAP / 2 ? mA : mB, col = el < CMP_DUR + CMP_GAP / 2 ? C['pf-memA'] : C['pf-memB'];
      if (which != null) D.ripple(c, xOfMf(which), y0 + kh * 0.62 + (kh * 0.38 - 16) / 2, 10, (el % 0.6) / 0.6, col);
    }
  }

  // =====================================================================
  // 線性軸與對數軸
  // =====================================================================
  const cvA = $('cvAxis'), ax = cvA.getContext('2d');
  let AW = 600, AH = 150;
  let AL = { tH: 20, y1: 40, y2: 90 };
  function layoutAxis() {
    const tH = AW < 560 ? Math.round(34 * fs + 6) : Math.round(18 * fs + 6);
    const y1 = tH + Math.round(14 * fs), y2 = y1 + 10 + Math.round(38 * fs);
    AL = { tH: tH, y1: y1, y2: y2 };
    AH = y2 + 10 + Math.round(16 * fs) + 6;
  }
  function drawAxis() {
    const c = ax, a = cur();
    D.backdrop(c, AW, AH);
    const lx0 = 14 + 78 * fs, lx1 = AW - 16;
    const rows = [{ y: AL.y1, kind: 'lin', title: T('線性（Hz）', 'Linear (Hz)'), col: C['pf-lin'] }, { y: AL.y2, kind: 'log', title: T('對數（八度）', 'Log (octaves)'), col: C['pf-log'] }];
    const fTop = PC.F_MAX, edges = PC.octaveEdges(27.5, fTop).concat([fTop]);
    c.font = fnt(12, 700); c.fillStyle = C.text; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillText(T('同樣的八度，畫在兩把尺上', 'The same octaves on two rulers'), 10, 6);
    // 小結：A0 到 A4（四個八度）在線性尺上只佔多少
    const share = PC.linPos(PC.etFreq(69, state.a4), fTop) * 100;
    c.font = fnt(11); c.fillStyle = C.muted; c.textBaseline = 'top';
    const sum = T('A0–A4（四個八度）只佔線性尺的 ' + fx(share, 1) + '%', 'A0–A4 (four octaves): ' + fx(share, 1) + '% of the linear ruler');
    if (AW < 560) { c.textAlign = 'left'; c.fillText(sum, 10, 8 + 16 * fs); } else { c.textAlign = 'right'; c.fillText(sum, AW - 12, 8); }
    rows.forEach(function (r) {
      const P = function (f) { return lx0 + (lx1 - lx0) * (r.kind === 'lin' ? PC.linPos(f, fTop) : PC.logPos(f, 27.5, fTop)); };
      c.font = fnt(11, 700); c.fillStyle = r.col; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(r.title, 10, r.y + 5);
      for (let i = 0; i + 1 < edges.length; i++) {
        const xa = P(edges[i]), xb = P(edges[i + 1]);
        const g = c.createLinearGradient(0, r.y, 0, r.y + 10);
        const base = i % 2 ? shade(r.col, D.dark ? -0.15 : 0.35) : r.col;
        g.addColorStop(0, alpha(shade(base, 0.2), 0.9)); g.addColorStop(1, alpha(base, 0.9));
        c.fillStyle = g; c.fillRect(xa, r.y, Math.max(0.6, xb - xa - 0.6), 10);
      }
      // 八度邊界的標籤（A1…A7），太擠的不寫
      c.font = fnt(9.5, 600); c.fillStyle = C.muted; c.textAlign = 'center'; c.textBaseline = 'top';
      let lastX = -1e9;
      for (let i = edges.length - 2; i >= 1; i--) {
        const x = P(edges[i]);
        if (lastX - x < 20 * fs) continue;
        c.fillText('A' + i, x, r.y + 12); lastX = x;
      }
      c.textAlign = 'left';
      c.fillText(r.kind === 'lin' ? '0' : 'A0', lx0, r.y + 12);
      if (r.kind === 'lin') { c.textAlign = 'right'; c.fillText(fx(fTop, 0) + ' Hz', lx1, r.y + 12); }
      else { c.textAlign = 'right'; c.fillText('C8', lx1, r.y + 12); }
      // 中央 C 與目前的頻率
      const xc = P(PC.etFreq(60, state.a4));
      c.strokeStyle = alpha(C.text, 0.45); c.lineWidth = 1; c.beginPath(); c.moveTo(xc, r.y - 3); c.lineTo(xc, r.y + 13); c.stroke();
      D.haloText(c, 'C4', xc + 3, r.y - 2, C.muted, 'left', 'bottom', fnt(9.5, 600));
      const xf = P(a.f);
      c.beginPath(); c.moveTo(xf, r.y - 1); c.lineTo(xf - 5, r.y - 9); c.lineTo(xf + 5, r.y - 9); c.closePath();
      c.fillStyle = C['pf-cur']; c.fill();
      c.beginPath(); c.moveTo(xf, r.y - 1); c.lineTo(xf, r.y + 11); c.strokeStyle = C['pf-cur']; c.lineWidth = 2; c.stroke();
    });
  }

  // =====================================================================
  // 鍵盤的點擊與鍵盤操作
  // =====================================================================
  let downAt = null;
  cvK.addEventListener('pointerdown', function (e) { downAt = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  cvK.addEventListener('pointercancel', function () { downAt = null; });
  cvK.addEventListener('click', function (e) {
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 10) { downAt = null; return; }
    downAt = null;
    const rect = cvK.getBoundingClientRect();
    const px = (e.clientX - rect.left) * KW / rect.width, py = (e.clientY - rect.top) * KH / rect.height;
    if (py < K.top - 2 || py > K.top + K.keyH) return;
    const m = PC.keyAt((px - K.pad) / K.ww, (py - K.top) / K.keyH);
    if (m == null) return;
    const changed = setF(PC.etFreq(m, state.a4), 'key', null, true);
    keyTone(m);
    if (!changed) requestDraw();
    say(describe(cur()));
  });
  let kb = null;
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cvK, {
      label: T('鋼琴鍵盤與音域圖。左右鍵移動一個半音，Shift 加左右鍵移動一個八度；上下鍵微調 1 音分，Shift 加上下鍵 10 音分。',
        'Piano keyboard and range chart. Left and right arrows move a semitone, Shift with them an octave; up and down arrows fine-tune by 1 cent, Shift with them 10 cents.'),
      items: [{
        name: function () { return T('目前的頻率', 'Current frequency'); },
        move: function (dx, dy, big) {
          let g = null, extra = null, via = 'kbd';
          if (dx) { g = PC.step(state.f, dx * (big ? 12 : 1)); via = big ? 'oct' : 'semi'; extra = { dir: dx }; }
          else if (dy) g = state.f * Math.pow(2, -dy * (big ? 10 : 1) / 1200);
          if (g == null) return false;
          return setF(g, via, extra);
        },
        describe: function () { return describe(cur()); }
      }],
      onChange: function () { requestDraw(); }
    });
  }
  function scrollToCurrent(force) {
    if (!K) return;
    const x = xOfMf(cur().mf), w = kbwrap.clientWidth || KW;
    const s = kbwrap.scrollLeft;
    if (force || x < s + 40 || x > s + w - 40) kbwrap.scrollLeft = Math.max(0, Math.min(KW - w, x - w / 2));
  }
  kbwrap.addEventListener('scroll', function () { requestDraw(); }, { passive: true });

  function updateLabels() {
    const a = cur();
    cv.setAttribute('aria-label', T('波形：' + fx(a.f, 2) + ' Hz，10 ms 裡有 ' + fx(a.f / 100, 2) + ' 個週期，週期 ' + fx(a.T, 3) + ' ms。最接近的音 ' + nameOf(a.midi) + '，' + centsTxt(a.cents) + '。',
      'Waveform: ' + fx(a.f, 2) + ' Hz, ' + fx(a.f / 100, 2) + ' periods in 10 ms, period ' + fx(a.T, 3) + ' ms. Nearest note ' + nameOf(a.midi) + ', ' + centsTxt(a.cents) + '.'));
    cvA.setAttribute('aria-label', T('線性軸與對數軸：同樣的八度在線性軸上越來越寬，在對數軸上一樣寬。目前的頻率在線性軸的 ' + fx(PC.linPos(a.f, PC.F_MAX) * 100, 1) + '%、對數軸的 ' + fx(PC.logPos(a.f, 27.5, PC.F_MAX) * 100, 1) + '%。',
      'Linear and logarithmic rulers: the same octaves get wider and wider on the linear ruler but are equal on the log ruler. The frequency now is at ' + fx(PC.linPos(a.f, PC.F_MAX) * 100, 1) + '% of the linear ruler and ' + fx(PC.logPos(a.f, 27.5, PC.F_MAX) * 100, 1) + '% of the log ruler.'));
  }

  // =====================================================================
  // 尺寸、動畫迴圈
  // =====================================================================
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth || cv.parentElement.clientWidth || 600;
    layoutWave();
    cv.style.height = H + 'px';
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layoutKeys();
    cvK.style.width = KW + 'px'; cvK.style.height = KH + 'px';
    cvK.width = Math.round(KW * dpr); cvK.height = Math.round(KH * dpr);
    kx.setTransform(dpr, 0, 0, dpr, 0, 0);
    AW = cvA.clientWidth || W;
    layoutAxis();
    cvA.style.height = AH + 'px';
    cvA.width = Math.round(AW * dpr); cvA.height = Math.round(AH * dpr);
    ax.setTransform(dpr, 0, 0, dpr, 0, 0);
    requestDraw();
  }
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    const now = performance.now();
    let more = false;
    if (state.playVis) {
      if ((now - state.playVis.t0) / 1000 > state.playVis.dur || (!state.voice && AU.enabled() && !AU.playing())) { state.playVis = null; updateStop(); }
      else more = true;
    }
    if (state.cmp) {
      if ((now - state.cmp.t0) / 1000 > 2 * CMP_DUR + CMP_GAP + 0.3) { state.cmp = null; updateStop(); }
      else more = true;
    }
    const is3 = view3 && view3.active;
    if (!is3) { drawMain(now); drawAxis(); }
    drawKeys(now);
    if (is3) view3.frame();
    if (more) requestDraw();
  }

  // =====================================================================
  // 3D：切換到 3D 時才載入 js/pitch-frequency-3d.js 與 three.js
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    PC: PC, T: T, D: D,
    colors: function () { return C; },
    fs: function () { return fs; },
    data: function () { const a = cur(); return { f: state.f, a4: state.a4, mf: a.mf, midi: a.midi, cents: a.cents, mode: state.hmode, name: nameOf(a.midi) }; },
    letter: letter, fx: fx, sg: sg,
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 波形。', 'The 3D graphics context was lost, so the view switched back to the 2D wave.');
    }
  };
  function rebuild3D() { if (view3 && view3.active) view3.rebuild(); }
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.PitchFrequency3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.PitchFrequency3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/pitch-frequency-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.PitchFrequency3D) throw new Error('pitch-frequency-3d.js did not load');
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
        view3 = window.PitchFrequency3D.create(lib, host3, bridge);
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
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 波形。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D wave is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  document.querySelectorAll('[data-hmode]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (state.hmode === b.dataset.hmode) return;
      state.hmode = b.dataset.hmode;
      renderButtons();
      if (view3 && view3.active) view3.setMode(state.hmode);
      say(state.hmode === 'lin'
        ? T('線性高度：柱子的高度和頻率成正比，每高一個八度，柱子高一倍。', 'Linear height: each bar is as tall as its frequency, so every octave up doubles the height.')
        : T('對數高度：柱子的高度和頻率的對數成正比，每個八度一樣高。', 'Log height: each bar’s height follows the logarithm of its frequency, so every octave adds the same height.'));
    });
  });

  // ---------- 分享目前設定：頻率與標準音（精確值）、兩個記憶（寫法、音色、唱名由 classroom.js 記錄） ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { f: state.f, a: state.a4, A: state.A, B: state.B }; },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      const okNum = function (v) { return typeof v === 'number' && isFinite(v); };
      if (okNum(o.a)) state.a4 = PC.clampA4(o.a);
      if (okNum(o.f)) state.f = PC.clampF(o.f);
      const okMem = function (x) { return x && okNum(x.f) && okNum(x.a4) ? (function () { const f = PC.clampF(x.f), a4 = PC.clampA4(x.a4), q = PC.analyze(f, a4); return { f: f, a4: a4, midi: q.midi, name: q.name, cents: q.cents }; })() : null; };
      state.A = okMem(o.A); state.B = okMem(o.B);
      state.committed = lite();
      syncSliders(); renderA4Hint(); renderMem(); freqChanged(true);
    }
  });

  // 給測試用的介面（不影響畫面）
  window.__pf = {
    state: state, cur: cur,
    setF: function (f) { setF(f, 'test'); },
    view3: function () { return view3; },
    // 測試用：某個鍵（白鍵靠下、黑鍵靠上）在畫面上的位置；先把它捲進可見範圍
    keyPoint: function (m) {
      const xk = PC.keyCenter(m), x = X(xk), w = kbwrap.clientWidth || KW;
      if (x < kbwrap.scrollLeft + 20 || x > kbwrap.scrollLeft + w - 20) kbwrap.scrollLeft = Math.max(0, Math.min(KW - w, x - w / 2));
      const r = cvK.getBoundingClientRect(), sx = r.width / KW;
      const y = K.top + K.keyH * (PC.isBlack(m) ? 0.35 : 0.85);
      return { x: r.left + x * sx, y: r.top + y * (r.height / KH) };
    }
  };

  // =====================================================================
  // 啟動（不發聲、不送任務事件）
  // =====================================================================
  readColors();
  state.f = PC.clampF(val(elF));
  state.a4 = PC.clampA4(val(elA));
  state.committed = lite();
  document.querySelectorAll('.slider').forEach(function (s) { if (s.querySelector('#freq, #a4')) s.setAttribute('data-share-skip', ''); });
  document.querySelector('.presets').setAttribute('data-share-skip', '');
  document.querySelector('.view-bar').setAttribute('data-share-skip', '');
  updateSoundButton();
  syncSliders();
  renderButtons(); renderReadout(); renderA4Hint(); renderMem(); renderRecs(); updateLabels(); updateStop();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    renderReadout(); renderMem(); renderRecs();
    if (view3 && view3.active) view3.onTheme();
    resize();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0, lastK = 0;
    new ResizeObserver(function () {
      if (cv.clientWidth !== lastW || kbwrap.clientWidth !== lastK) { lastW = cv.clientWidth; lastK = kbwrap.clientWidth; resize(); scrollToCurrent(true); }
    }).observe(stage);
  } else window.addEventListener('resize', resize);
  resize();
  scrollToCurrent(true);
})();
