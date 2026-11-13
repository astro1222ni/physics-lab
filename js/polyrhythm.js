/* polyrhythm.js — 「多重節奏與歐幾里得節奏」的畫面與互動
 * （數學在 polyrhythm-core.js；聲音一律用 music-audio.js；2D 繪圖工具 LabDraw 在 drawkit.js；3D 在 polyrhythm-3d.js，切到 3D 時才載入）
 *
 * 畫面：左邊（手機在上面）是同心圓的「項鍊」：外圈聲部 1、往內聲部 2、聲部 3；重音是亮珠子，連成多邊形；播放時游標旋轉。
 *       右邊（手機在下面）是展開的時間格（像鼓機）：每個聲部一列，最下面是合成節奏；全部一起落拍的格子用紫色標出，
 *       週期（最小公倍數）的結尾畫一條線。
 * 聲音：只有學生按「▶ 播放」才發聲（MusicAudio.sequencer 排程，畫面游標用同一個時鐘）；改滑桿不發聲。
 *       音效關閉時畫面照跑，狀態列顯示提示並讓音效開關閃一下（不會自己打開音效）。
 * 時間：b = 聲部 1 的第幾格（小數），一格 60 / BPM 秒；共同細格 g = b × L / n1（同一個循環）或 g = b（同樣的格長）。 */
(function () {
  'use strict';
  const Core = window.PolyrhythmCore;
  const D = window.LabDraw;
  const AU = window.MusicAudio;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const NUM = window.LabNum;
  const val = function (el) { return NUM ? NUM.value(el) : +el.value; };
  const alpha = D.alpha, shade = D.shade;
  const TAU = Math.PI * 2;
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const MAX_PLAY = 90;          // 播放最長秒數
  const SPAN_MAX = 48;          // 時間格最多畫幾格（同樣的格長、週期很長時）
  const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  const VKEY = ['pr-v1', 'pr-v2', 'pr-v3'];

  // ---------- 狀態 ----------
  const state = {
    align: 'cycle', bpm: Core.BPM_DEFAULT,
    voices: [
      { on: true, n: 12, k: 7, rot: 0, custom: false, base: null, timbre: 'bell', src: 'default' },
      { on: true, n: 4, k: 4, rot: 0, custom: false, base: null, timbre: 'low', src: 'default' },
      { on: false, n: 3, k: 3, rot: 0, custom: false, base: null, timbre: 'clap', src: 'default' }
    ],
    preset: null,
    play: null,         // { tA, pA, b0, step, lastC, lastT1, lastVis, startPerf }
    flashes: [],        // { v, cell, t, sync }
    sel: [0, 0, 0],     // 鍵盤選到的格子（每個聲部）
    view: '2d'
  };
  let AN = null;
  function cfg() { return { mode: state.align, bpm: state.bpm, voices: state.voices }; }
  function analysis() { if (!AN) AN = Core.analyze(cfg()); return AN; }
  function dirty() { AN = null; }
  const patOf = function (i) { return Core.voicePattern(Core.normVoice(state.voices[i], i)); };

  // ---------- 色彩與字體 ----------
  let C = {}, fs = 1;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'pr-v1', 'pr-v2', 'pr-v3', 'pr-sync', 'pr-cur']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    fs = Math.max(1, Math.min(1.45, parseFloat(cs.getPropertyValue('--fs')) || 1));
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + (px * fs).toFixed(1) + 'px ' + FONT; }
  /** 放不下時把字縮小（最小到 75%），再放不下就換行成兩行 */
  function fitText(text, x, y, maxW, px, weight) {
    ctx.font = fnt(px, weight);
    const w = ctx.measureText(text).width;
    if (w <= maxW) { ctx.fillText(text, x, y); return; }
    const k = maxW / w;
    if (k >= 0.75) { ctx.font = fnt(px * k, weight); ctx.fillText(text, x, y); return; }
    const words = text.split(' ');
    let line = '', j = 0;
    while (j < words.length && ctx.measureText((line ? line + ' ' : '') + words[j]).width <= maxW) { line += (line ? ' ' : '') + words[j]; j++; }
    if (!line) { ctx.font = fnt(px * 0.75, weight); ctx.fillText(text, x, y, maxW); return; }
    ctx.fillText(line, x, y);
    ctx.fillText(words.slice(j).join(' '), x, y + px * fs * 1.25, maxW);
  }
  const vcol = function (i) { return C[VKEY[i]]; };

  // ---------- 數字與文字 ----------
  function fx(v, d) { if (v == null || !isFinite(v)) return '—'; let s = v.toFixed(d); if (/^-0(\.0+)?$/.test(s)) s = s.slice(1); return s.replace('-', '−'); }
  const esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  function euName(v) { return v.eu ? 'E(' + v.eu.k + ',' + v.eu.n + ')' : T('自訂', 'custom'); }
  function voiceName(i) { return T('聲部 ', 'Voice ') + (i + 1); }
  function tradName(v) { const t = Core.nameOf(v.pattern); return t ? T(t.zh, t.en) : ''; }
  function secTxt(s) { return s >= 100 ? fx(s, 0) + T(' 秒', ' s') : (s >= 10 ? fx(s, 1) : fx(s, 2)) + T(' 秒', ' s'); }
  function onsetOrdinal(v) {
    // 從 E(k,n) 的第幾個重音開始（旋轉的格子剛好是重音時）
    if (!v.eu || !v.eu.k) return 0;
    const on = Core.onsets(Core.bjorklund(v.eu.k, v.eu.n));
    const j = on.indexOf(v.eu.rot);
    return j >= 0 ? j + 1 : 0;
  }
  function voiceSummary(v) {
    if (!v.k) return euName(v) + T('：沒有重音', ': no accents');
    let s = euName(v);
    if (v.eu) s += T('，從第 ' + v.eu.rot + ' 格開始', ', starting on box ' + v.eu.rot);
    else s += T('（不是歐幾里得節奏）', ' (not a Euclidean rhythm)');
    return s + T('；間距 ', '; gaps ') + v.iois.join('-');
  }

  // ---------- 任務事件 ----------
  function emit(type, extra) {
    if (window.LabShare && window.LabShare.restoring) return;
    if (!window.LabMission) return;
    window.LabMission.emit(type, Object.assign({}, analysis(), { view: state.view, playing: !!state.play }, extra || {}));
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  const elBpm = $('bpm');
  const elN = [0, 1, 2].map(function (i) { return $('n' + i); });
  const elK = [0, 1, 2].map(function (i) { return $('k' + i); });
  const elR = [0, 1, 2].map(function (i) { return $('r' + i); });
  const elOn = [null, $('on1'), $('on2')];
  let quiet = false;   // 程式改滑桿時不要再觸發處理
  function setSlider(el, v) {
    quiet = true;
    try { el.value = String(v); if (NUM) NUM.clear(el); } finally { quiet = false; }
  }
  /** 依目前狀態更新滑桿的範圍與數值（不觸發事件） */
  function syncSliders(i) {
    const v = state.voices[i];
    elK[i].max = String(v.n);
    elR[i].max = String(v.n - 1);
    setSlider(elN[i], v.n); setSlider(elK[i], v.k); setSlider(elR[i], v.rot);
    $('n' + i + 'o').textContent = String(v.n);
    $('k' + i + 'o').textContent = String(v.k);
    $('r' + i + 'o').textContent = String(v.rot);
  }
  function syncAll() {
    [0, 1, 2].forEach(syncSliders);
    setSlider(elBpm, state.bpm);
    $('bpmo').textContent = String(state.bpm);
    [1, 2].forEach(function (i) { elOn[i].checked = state.voices[i].on; });
    renderButtons();
  }

  /** 聲部的設定改了：重算、更新畫面；final 為 true 時送任務事件並播報 */
  function voiceChanged(i, src, final) {
    dirty();
    state.preset = null;
    syncSliders(i);
    renderAll();
    retime();
    if (final) {
      emit('rhythm', { src: src, changed: i });
      const a = analysis(), v = a.voices[i];
      say(voiceName(i) + T('：', ': ') + voiceSummary(v) + T('。', '.') + (tradName(v) ? T('這是' + tradName(v) + '。', ' This is the ' + tradName(v) + '.') : ''));
    }
  }
  [0, 1, 2].forEach(function (i) {
    function readN() {
      const v = state.voices[i], n = clamp(Math.round(val(elN[i])), Core.N_MIN, Core.N_MAX);
      if (n !== v.n || v.custom) { v.n = n; v.custom = false; v.base = null; v.k = Math.min(v.k, n); v.rot = Math.min(v.rot, n - 1); }
      v.src = 'slider';
      state.sel[i] = Math.min(state.sel[i], n - 1);
    }
    function readK() {
      const v = state.voices[i], k = clamp(Math.round(val(elK[i])), 0, v.n);
      if (k !== v.k || v.custom) { v.k = k; v.custom = false; v.base = null; }
      v.src = 'slider';
    }
    function readR() {
      const v = state.voices[i];
      v.rot = clamp(Math.round(val(elR[i])), 0, v.n - 1);
      v.src = 'slider';
    }
    [[elN[i], readN], [elK[i], readK], [elR[i], readR]].forEach(function (pair) {
      pair[0].addEventListener('input', function () { if (quiet) return; pair[1](); voiceChanged(i, 'slider', false); });
      pair[0].addEventListener('change', function () { if (quiet) return; pair[1](); voiceChanged(i, 'slider', true); });
    });
    if (elOn[i]) elOn[i].addEventListener('change', function () {
      state.voices[i].on = elOn[i].checked;
      dirty(); state.preset = null; renderAll(); retime();
      emit('rhythm', { src: 'toggle', changed: i });
      say(voiceName(i) + (elOn[i].checked ? T(' 開啟。', ' on. ') : T(' 關閉。', ' off. ')) + combinedSentence());
    });
  });
  elBpm.addEventListener('input', function () { if (quiet) return; state.bpm = clamp(Math.round(val(elBpm)), Core.BPM_MIN, Core.BPM_MAX); $('bpmo').textContent = String(state.bpm); dirty(); renderReadouts(); retime(); requestDraw(); });
  elBpm.addEventListener('change', function () {
    if (quiet) return;
    state.bpm = clamp(Math.round(val(elBpm)), Core.BPM_MIN, Core.BPM_MAX);
    $('bpmo').textContent = String(state.bpm);
    dirty(); renderReadouts(); retime(); requestDraw();
    emit('rhythm', { src: 'tempo' });
    say(T('速度 ', 'Tempo ') + state.bpm + T(' 格／分：', ' boxes per minute: ') + periodSentence());
  });

  // 對齊方式
  const alignBtns = document.querySelectorAll('[data-align]');
  alignBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      if (state.align === b.dataset.align) return;
      state.align = b.dataset.align;
      dirty(); state.preset = null; renderAll(); retime();
      emit('rhythm', { src: 'align' });
      say((state.align === 'cycle' ? T('同一個循環：', 'Same cycle: ') : T('同樣的格長：', 'Same beat length: ')) + combinedSentence());
    });
  });
  // 音色
  const timBtns = document.querySelectorAll('[data-tim]');
  timBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      const parts = b.dataset.tim.split(':'), i = +parts[0];
      state.voices[i].timbre = parts[1];
      dirty(); renderButtons();
    });
  });
  // 傳統節奏型（聲部 1 放節奏型，聲部 2 是穩定的四拍，聲部 3 關掉）
  const PRESET_TIMBRE = { tresillo: 'high', cinquillo: 'high', samba: 'high', bell: 'bell', venda: 'clap' };
  const presetBtns = document.querySelectorAll('[data-preset]');
  presetBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      const t = Core.TRADITIONAL.filter(function (x) { return x.id === b.dataset.preset; })[0];
      if (!t) return;
      state.align = 'cycle';
      state.voices[0] = { on: true, n: t.n, k: t.k, rot: t.rot, custom: false, base: null, timbre: PRESET_TIMBRE[t.id] || 'high', src: 'preset' };
      state.voices[1] = { on: true, n: 4, k: 4, rot: 0, custom: false, base: null, timbre: 'low', src: 'preset' };
      state.voices[2].on = false;
      state.sel = [0, 0, 0];
      state.preset = t.id;
      dirty(); syncAll(); renderAll(); retime();
      emit('rhythm', { src: 'preset' });
      const v = analysis().voices[0];
      say(T(t.zh + '：E(' + t.k + ',' + t.n + ')' + (t.rot ? '，從第 ' + t.onset + ' 個重音（第 ' + t.rot + ' 格）開始' : '') + '，間距 ' + v.iois.join('-') + '。聲部 2 是穩定的四拍。',
        t.en + ': E(' + t.k + ',' + t.n + ')' + (t.rot ? ', starting on accent ' + t.onset + ' (box ' + t.rot + ')' : '') + ', gaps ' + v.iois.join('-') + '. Voice 2 keeps a steady four-beat pulse.'));
    });
  });
  function renderButtons() {
    alignBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.align === state.align)); });
    timBtns.forEach(function (b) { const p = b.dataset.tim.split(':'); b.setAttribute('aria-pressed', String(state.voices[+p[0]].timbre === p[1])); });
    presetBtns.forEach(function (b) { b.classList.toggle('here', b.dataset.preset === state.preset); });
    [1, 2].forEach(function (i) { $('card' + i).classList.toggle('off', !state.voices[i].on); });
    $('alignHint').textContent = state.align === 'cycle'
      ? T('每個聲部把同一個循環（聲部 1 的 n 格）平分成自己的 n 格：多重節奏，例如 3 對 2。', 'Every voice divides the same cycle (voice 1’s n boxes) into its own n equal boxes: a polyrhythm such as 3 against 2.')
      : T('每個聲部的一格都一樣長，n 不同的聲部各自繞圈：多重節拍，要等最小公倍數那麼多格才一起回到起點。', 'Every box lasts the same time and voices with different n go round at different speeds (a polymeter): they all return to the start together only after the least common multiple of boxes.');
  }

  // ---------- 點格子：加上或拿掉重音 ----------
  function toggleCell(i, j) {
    const v = state.voices[i];
    if (!v.on) return;
    j = Core.mod(j, v.n);
    if (!v.custom) { v.base = Core.bjorklund(v.k, v.n); v.custom = true; }
    const bi = Core.mod(j + v.rot, v.n);
    v.base[bi] = v.base[bi] ? 0 : 1;
    const p = Core.rotate(v.base, v.rot), id = Core.identify(p);
    if (id.euclid) { v.custom = false; v.base = null; v.k = id.k; v.rot = id.rot; }
    else v.k = Core.count(p);
    v.src = 'cell';
    state.sel[i] = j;
    voiceChanged(i, 'cell', true);
  }

  // ---------- 讀數 ----------
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  function voiceHTML(v) {
    const parts = [];
    let head = '<b>' + esc(euName(v)) + '</b>';
    if (v.eu && v.k) head += T('，從第 ' + v.eu.rot + ' 格開始', ', starting on box ' + v.eu.rot) + (onsetOrdinal(v) > 1 ? T('（第 ' + onsetOrdinal(v) + ' 個重音）', ' (accent ' + onsetOrdinal(v) + ')') : '');
    if (!v.eu) head += ' <span class="no">' + T('（自訂，不是歐幾里得節奏）', '(custom, not a Euclidean rhythm)') + '</span>';
    const tn = tradName(v);
    if (tn) head += ' · ' + esc(tn);
    parts.push(head);
    parts.push('<span class="pat">' + v.pattern + '</span>');
    if (v.k >= 1) {
      parts.push(T('重音間距 ', 'Gaps ') + v.iois.join('-') + T('（' + new Set(v.iois).size + ' 種）', ' (' + new Set(v.iois).size + (new Set(v.iois).size === 1 ? ' length)' : ' lengths)')));
      parts.push(T('均勻度 ', 'Evenness ') + fx(100 * v.evenness, 1) + '%' + (v.me ? ' · <span class="ok">' + T('最大均勻', 'maximally even') + '</span>' : ' · <span class="no">' + T('不是最大均勻', 'not maximally even') + '</span>'));
      if (v.period < v.n) parts.push(T('每 ' + v.period + ' 格就重複（gcd(k, n) = ' + Core.gcd(v.k, v.n) + '）', 'Repeats every ' + v.period + ' boxes (gcd(k, n) = ' + Core.gcd(v.k, v.n) + ')'));
    } else parts.push(T('沒有重音（k = 0）', 'No accents (k = 0)'));
    return parts.join('<br>');
  }
  function renderReadouts() {
    const a = analysis();
    a.voices.forEach(function (v, i) { setHTML('vr' + i, voiceHTML(v)); });
    const span = a.L;
    setHTML('rdU', a.nActive ? '<span class="pat">' + (span <= 64 ? a.union : a.union.slice(0, 64) + '…') + '</span>' : '—');
    let per = a.L + T(' 格', ' boxes') + ' <small>(' + secTxt(a.periodSec) + ')</small>';
    if (a.nActive >= 2) per = 'lcm = ' + per;
    if (a.Pmin < a.L) per += '<br><small>' + T('節奏本身每 ' + a.Pmin + ' 格就重複', 'the rhythm itself repeats every ' + a.Pmin + ' boxes') + '</small>';
    setHTML('rdL', per);
    setHTML('rdCell', secTxt(a.cellSec) + (a.mode === 'cycle' ? ' <small>(' + T('循環 ', 'cycle ') + secTxt(a.cycleSec) + ')</small>' : ''));
    if (a.nActive < 2) setHTML('rdT', T('要兩個以上有重音的聲部', 'needs two voices with accents'));
    else if (!a.nTogether) setHTML('rdT', T('從來不會', 'never'));
    else setHTML('rdT', a.nTogether + T(' 次：第 ', ' times: box ') + a.together.slice(0, 8).join(T('、', ', ')) + (a.nTogether > 8 ? '…' : '') + T(' 格', '') +
      '<br><small>' + T('間隔 ', 'spacing ') + uniq(a.gaps).join(T('、', ', ')) + T(' 格', ' boxes') + '</small>');
    const pk = Object.keys(a.pairs);
    setHTML('rdP', pk.length ? pk.map(function (k) { return k.charAt(0) + '&amp;' + k.charAt(1) + T('：', ': ') + a.pairs[k]; }).join(T('、', ', ')) : '—');
    setHTML('rdK', a.torus ? '(' + a.torus.w[0] + ', ' + a.torus.w[1] + ')' + ' <small>' + knotName(a.torus.w) + '</small>' : T('要兩個有重音的聲部', 'needs two voices with accents'));
  }
  function uniq(arr) { return arr.filter(function (x, i) { return arr.indexOf(x) === i; }).sort(function (a, b) { return a - b; }); }
  function knotName(w) {
    const lo = Math.min(w[0], w[1]), hi = Math.max(w[0], w[1]);
    if (lo === 1) return T('（沒有打結的圈）', '(an unknotted loop)');
    if (lo === 2 && hi === 3) return T('三葉結', 'trefoil');
    if (lo === 2 && hi === 5) return T('五葉結', 'cinquefoil');
    return T('環面結', 'torus knot');
  }
  function periodSentence() {
    const a = analysis();
    return T('週期 ' + a.L + ' 格，' + secTxt(a.periodSec) + '。', 'period ' + a.L + ' boxes, ' + secTxt(a.periodSec) + '.');
  }
  function combinedSentence() {
    const a = analysis();
    let s = T('合成節奏 ', 'Combined rhythm ') + (a.L <= 32 ? a.union + T('，', ', ') : '') + periodSentence();
    if (a.nActive >= 2) s += a.nTogether ? T('全部一起落拍 ' + a.nTogether + ' 次。', ' All voices together ' + a.nTogether + ' times.') : T('全部聲部從來不會一起落拍。', ' The voices never all land together.');
    return s;
  }
  function renderAll() { renderButtons(); renderReadouts(); updateCanvasLabel(); update3D(true); requestDraw(); }

  // =====================================================================
  // 聲音與播放
  // =====================================================================
  /** 打擊樂器（近似的音色）：鼓 = 理想鼓皮的頻率比 1 : 1.594 : 2.136 : 2.653 */
  const KIT = {
    low: function (at, g) {
      AU.modal({ at: at, gain: g, dur: 0.45, modes: [{ f: 175, a: 1, tau: 0.16 }, { f: 279, a: 0.65, tau: 0.11 }, { f: 374, a: 0.45, tau: 0.08 }, { f: 464, a: 0.3, tau: 0.06 }] });
      AU.hit({ at: at, gain: g * 0.3, type: 'lowpass', filter: 900, dur: 0.03 });
    },
    high: function (at, g) {
      AU.modal({ at: at, gain: g * 0.9, dur: 0.3, modes: [{ f: 330, a: 1, tau: 0.09 }, { f: 526, a: 0.6, tau: 0.065 }, { f: 705, a: 0.45, tau: 0.05 }, { f: 875, a: 0.3, tau: 0.04 }] });
      AU.hit({ at: at, gain: g * 0.3, filter: 2500, q: 0.8, dur: 0.025 });
    },
    clap: function (at, g) { AU.hit({ at: at, gain: g * 0.9, filter: 1300, q: 1.1, dur: 0.07 }); },
    bell: function (at, g) { AU.modal({ at: at, gain: g * 0.65, dur: 0.6, modes: [{ f: 784, a: 1, tau: 0.26 }, { f: 1176, a: 0.45, tau: 0.15 }, { f: 2093, a: 0.18, tau: 0.07 }] }); }
  };
  const GAIN = 0.5;
  const seq = AU.sequencer({ tick: tick });
  /** 現在的「聲部 1 第幾格」（畫面用；頁面時鐘，不受音訊時鐘換基準影響） */
  function beatNow() {
    const p = state.play;
    if (!p) return 0;
    return p.b0 + (performance.now() / 1000 - p.pA) / p.step;
  }
  function gOfBeat(b) { const a = analysis(); return a.mode === 'cycle' ? b * a.L / state.voices[0].n : b; }
  /** 排程器：把 [t0, t1) 之間的細格排出聲音 */
  function tick(t0, t1, start) {
    const p = state.play;
    if (!p) return;
    if (p.pending != null) { anchor(start, p.pending); p.pending = null; }   // begin() 第一次呼叫 tick 時才知道開始的時刻
    p.lastT1 = t1;
    const a = analysis();
    const gB = gOfBeat(p.b0 + (t1 - p.tA) / p.step);
    const on = AU.enabled();
    for (let c = p.lastC + 1; c < gB - 1e-9; c++) {
      p.lastC = c;
      const t = p.tA + (c / gOfBeat(1) - p.b0) * p.step;
      if (!on || t < t0 - 0.05) continue;
      const who = a.hits[Core.mod(c, a.L)];
      const g = GAIN / Math.sqrt(Math.max(1, who.length));
      who.forEach(function (i) { (KIT[state.voices[i].timbre] || KIT.high)(Math.max(t, t0), g); });
    }
  }
  /** 從音訊時鐘的時刻 t、聲部 1 的第 b 格開始排程 */
  function anchor(tA, b) {
    const p = state.play;
    p.tA = tA; p.b0 = b; p.step = 60 / state.bpm;
    p.pA = performance.now() / 1000 + (tA - AU.now());
    p.lastC = Math.ceil(gOfBeat(b) - 1e-9) - 1;
    p.lastT1 = tA;
    p.lastVis = -1;
  }
  /** 速度、對齊、格數改了：從目前已排到的時刻接著排（不重複、不漏） */
  function retime() {
    const p = state.play;
    if (!p || !p.tA) return;
    const t = Math.max(p.lastT1, AU.now());
    const b = p.b0 + (t - p.tA) / p.step;
    anchor(t, b);
  }
  function startSeq(b) {
    state.play.pending = b;
    seq.begin(0.08);
    if (state.play && state.play.pending != null) { anchor(seq.start, b); state.play.pending = null; }
  }
  function startPlay() {
    stopEverything(true);
    state.play = { tA: 0, pA: 0, b0: 0, step: 60 / state.bpm, lastC: -1, lastT1: 0, lastVis: -1, startPerf: performance.now(), audioBase: 0 };
    state.flashes = [];
    const on = AU.enabled();
    if (!on) { say(AU.offHint()); AU.flashSoundButton(); }
    const c = on ? AU.context() : null;
    if (c && c.state !== 'running' && c.resume) {
      // 音訊環境還沒開始跑：等它開始再排程（否則時鐘基準會換掉）
      let done = false;
      const go = function () { if (done || !state.play) return; done = true; startSeq(0); updateStop(); };
      c.resume().then(go, go);
      setTimeout(go, 400);
    } else startSeq(0);
    updateStop(); requestDraw();
    return on;
  }
  function endPlay(reason) {
    if (!state.play) return;
    state.play = null;
    seq.stop();
    AU.stopAll(0.06);
    state.flashes = [];
    if (reason === 'time') say(T('播放 ' + MAX_PLAY + ' 秒，自動停止。按「▶ 播放」可以再聽一次。', 'Stopped automatically after ' + MAX_PLAY + ' seconds. Press “▶ Play” to listen again.'));
    updateStop(); update3D(false); requestDraw();
  }
  function stopEverything(silent) {
    if (state.play) endPlay('stop');
    else { seq.stop(); AU.stopAll(0.06); }
    updateStop();
    if (!silent) requestDraw();
  }
  $('play').addEventListener('click', function () {
    const on = startPlay();
    emit('play', { src: 'play' });
    if (on) say(T('播放：', 'Playing: ') + combinedSentence());
  });
  $('stop').addEventListener('click', function () { stopEverything(); say(T('已停止。', 'Stopped.')); });
  function updateStop() { $('stop').disabled = !(state.play || AU.playing()); }
  AU.onChange(function () { updateStop(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.play) endPlay('stop'); });
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
    if (!ev.detail || ev.detail.name !== 'sound') return;
    updateSoundButton();
    // 播放中打開音效：在這次點擊裡建立音訊環境，從目前的位置接著排程（音訊時鐘換了基準）
    if (ev.detail.value && state.play) {
      const c = AU.context();
      const go = function () { if (state.play && state.play.tA) startSeq(beatNow()); };
      if (c && c.state !== 'running' && c.resume) c.resume().then(go, go); else go();
    }
    updateStop();
  });

  // =====================================================================
  // 畫布
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W = 600, H = 460, L = null;
  function onVoices() { return [0, 1, 2].filter(function (i) { return state.voices[i].on; }); }
  function layout() {
    const rows = onVoices().length + 1;
    const rowH = Math.round(34 + 10 * (fs - 1));
    const tlH = Math.round(46 + 22 * fs) + rows * rowH + 34;
    if (W >= 720) {
      const S = Math.round(Math.max(300, Math.min(420, W * 0.44)));
      L = { wide: true, neck: { x: 8, y: 8, w: S, h: Math.max(S, tlH) }, tl: { x: S + 16, y: 8, w: W - S - 24, h: Math.max(S, tlH) }, rowH: rowH };
      H = Math.max(S, tlH) + 16;
    } else {
      const S = Math.round(Math.min(W - 8, 420));
      L = { wide: false, neck: { x: 4, y: 4, w: W - 8, h: S }, tl: { x: 4, y: S + 12, w: W - 8, h: tlH }, rowH: rowH };
      H = S + tlH + 16;
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
  function panel(r) {
    D.roundRect(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fillStyle = alpha(C.surface, D.dark ? 0.32 : 0.62); ctx.fill();
    ctx.strokeStyle = alpha(C.text, 0.08); ctx.lineWidth = 1; ctx.stroke();
  }
  function pill(text, x, y, color, align, bg) {
    ctx.font = fnt(11.5, 700);
    const w = ctx.measureText(text).width + 14, h = 20 * fs;
    let x0 = align === 'right' ? x - w : (align === 'center' ? x - w / 2 : x);
    x0 = clamp(x0, 2, W - w - 2);
    D.roundRect(ctx, x0, y - h / 2, w, h, h / 2);
    ctx.fillStyle = bg || alpha(C['canvas-bg'], 0.88); ctx.fill();
    ctx.strokeStyle = alpha(color || C.text, 0.35); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = color || C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x0 + 7, y + 0.5);
    return w;
  }
  function ball(x, y, r, color, lit) {
    // 立體珠子：亮點偏左上、邊緣加深、細亮邊
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.38, r * 0.1, x, y, r);
    g.addColorStop(0, D.mix ? D.mix(color, '#ffffff', lit ? 0.75 : 0.55) : '#fff');
    g.addColorStop(0.45, color);
    g.addColorStop(1, shade(color, -0.35));
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = alpha('#ffffff', D.dark ? 0.25 : 0.5); ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(x, y, r - 0.6, Math.PI * 1.05, Math.PI * 1.65); ctx.stroke();
  }

  // ---------- 項鍊 ----------
  function neckGeo() {
    // 圓心往下移一點、半徑縮一點，讓最上面的珠子不碰到左上角的標題
    const r = L.neck, cx = r.x + r.w / 2, cy = r.y + Math.min(r.h, r.w) / 2 + (L.wide ? (r.h - Math.min(r.h, r.w)) / 2 : 0) + 12 * fs;
    const R0 = Math.min(r.w, r.h) / 2 - 42 * fs;
    const list = onVoices();
    const gap = R0 * (list.length >= 3 ? 0.27 : 0.32);
    const rings = list.map(function (i, j) { return { i: i, R: R0 - j * gap }; });
    return { cx: cx, cy: cy, R0: R0, rings: rings };
  }
  const ang = function (j, n) { return -Math.PI / 2 + TAU * j / n; };
  /** 每個聲部現在走到自己循環的哪裡（0–1）；沒播放時 null */
  function voicePhase(i, b) {
    const v = state.voices[i];
    if (state.align === 'cycle') return Core.mod(b / state.voices[0].n, 1);
    return Core.mod(b / v.n, 1);
  }
  function drawNecklace(now, b) {
    const g = neckGeo(), a = analysis();
    panel(L.neck);
    ctx.font = fnt(12, 700); ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(T('節奏項鍊', 'Rhythm necklaces'), L.neck.x + 10, L.neck.y + 8);
    ctx.fillStyle = C.muted;
    fitText(state.align === 'cycle' ? T('同一個循環：一圈 = 一個循環', 'Same cycle: one turn = one cycle') : T('同樣的格長：每圈速度不同', 'Same beat length: rings turn at different speeds'), L.neck.x + 10, L.neck.y + 8 + 17 * fs, L.neck.w - 20, 11);
    // 中央的淡光暈
    const halo = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, g.R0 + 20);
    halo.addColorStop(0, alpha(C.accent, D.dark ? 0.10 : 0.06)); halo.addColorStop(1, alpha(C.accent, 0));
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(g.cx, g.cy, g.R0 + 20, 0, TAU); ctx.fill();
    const playing = !!state.play;
    g.rings.forEach(function (rg) {
      const i = rg.i, v = a.voices[i], col = vcol(i), n = v.n, R = rg.R;
      const dotR = Math.max(4.5, Math.min(11, 0.36 * TAU * R / n));
      // 軌道：兩層線條（管狀）
      ctx.lineWidth = 5; ctx.strokeStyle = alpha(col, D.dark ? 0.16 : 0.12);
      ctx.beginPath(); ctx.arc(g.cx, g.cy, R, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1.2; ctx.strokeStyle = alpha(col, 0.45);
      ctx.beginPath(); ctx.arc(g.cx, g.cy, R - 0.8, 0, TAU); ctx.stroke();
      // 播放中：目前這一格的扇形
      if (playing) {
        const ph = voicePhase(i, b), cur = Math.floor(ph * n + 1e-9);
        ctx.beginPath();
        ctx.moveTo(g.cx, g.cy);
        ctx.arc(g.cx, g.cy, R + dotR + 4, ang(cur - 0.5, n), ang(cur + 0.5, n));
        ctx.closePath();
        const wg = ctx.createRadialGradient(g.cx, g.cy, Math.max(0, R - dotR * 3), g.cx, g.cy, R + dotR + 4);
        wg.addColorStop(0, alpha(col, 0)); wg.addColorStop(1, alpha(col, D.dark ? 0.22 : 0.16));
        ctx.fillStyle = wg; ctx.fill();
      }
      // 重音連成的多邊形
      if (v.onsets.length >= 2) {
        ctx.beginPath();
        v.onsets.forEach(function (j, q) { const x = g.cx + R * Math.cos(ang(j, n)), y = g.cy + R * Math.sin(ang(j, n)); if (q) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.closePath();
        ctx.fillStyle = alpha(col, D.dark ? 0.12 : 0.09); ctx.fill();
        ctx.lineJoin = 'round'; ctx.lineWidth = 1.6; ctx.strokeStyle = alpha(col, 0.7); ctx.stroke();
      }
      // 珠子
      for (let j = 0; j < n; j++) {
        const x = g.cx + R * Math.cos(ang(j, n)), y = g.cy + R * Math.sin(ang(j, n));
        const hit = v.pattern.charAt(j) === 'x';
        const fl = flashAmount(i, j, now);
        if (hit) {
          if (fl > 0) {
            if (!D.reducedMotion()) {
              ctx.beginPath(); ctx.arc(x, y, dotR * (1.4 + 1.4 * (1 - fl)), 0, TAU);
              ctx.strokeStyle = alpha(col, 0.6 * fl); ctx.lineWidth = 2; ctx.stroke();
            }
          }
          ball(x, y, dotR * (1 + 0.25 * fl), col, fl > 0);
        } else {
          ctx.beginPath(); ctx.arc(x, y, Math.max(2.5, dotR * 0.42), 0, TAU);
          ctx.fillStyle = alpha(C['canvas-bg'], 1); ctx.fill();
          ctx.lineWidth = 1.3; ctx.strokeStyle = alpha(col, 0.55); ctx.stroke();
        }
        if (kb && kb.focused() && kbVoice() === i && state.sel[i] === j) {
          ctx.setLineDash([3, 3]); ctx.strokeStyle = C.accent; ctx.lineWidth = 1.6;
          D.roundRect(ctx, x - dotR - 5, y - dotR - 5, 2 * dotR + 10, 2 * dotR + 10, 6); ctx.stroke(); ctx.setLineDash([]);
        }
      }
      // 第 0 格的小刻度（循環的起點）
      ctx.strokeStyle = alpha(C.text, 0.35); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(g.cx, g.cy - R - dotR - 3); ctx.lineTo(g.cx, g.cy - R - dotR - 8); ctx.stroke();
      // 播放游標（指針）
      if (playing) {
        const th = -Math.PI / 2 + TAU * voicePhase(i, b);
        ctx.strokeStyle = alpha(C['pr-cur'], 0.9); ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(g.cx + (R - dotR - 6) * Math.cos(th), g.cy + (R - dotR - 6) * Math.sin(th));
        ctx.lineTo(g.cx + (R + dotR + 6) * Math.cos(th), g.cy + (R + dotR + 6) * Math.sin(th)); ctx.stroke();
      }
    });
    // 中央：一起落拍的閃光與週期
    let sync = 0;
    state.flashes.forEach(function (f) { if (f.sync) sync = Math.max(sync, 1 - (now - f.t) / 450); });
    if (sync > 0 && !D.reducedMotion()) {
      const rr = (g.rings.length ? g.rings[g.rings.length - 1].R : g.R0) * 0.55;
      const sg = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, rr);
      sg.addColorStop(0, alpha(C['pr-sync'], 0.55 * sync)); sg.addColorStop(1, alpha(C['pr-sync'], 0));
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(g.cx, g.cy, rr, 0, TAU); ctx.fill();
    }
    if (g.rings.length) {
      ctx.font = fnt(13, 700); ctx.fillStyle = C.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const inner = g.rings[g.rings.length - 1].R;
      if (inner > 46 * fs) {
        ctx.fillText(a.L + T(' 格', ' boxes'), g.cx, g.cy - 8 * fs);
        ctx.font = fnt(11); ctx.fillStyle = C.muted;
        ctx.fillText(a.nActive >= 2 ? T('一起落拍 ', 'together ') + a.nTogether + T(' 次', '×') : T('一個週期', 'one period'), g.cx, g.cy + 9 * fs);
      }
    }
    // 圖例：每圈是哪個聲部（左下角）
    let ly = L.neck.y + L.neck.h - 14;
    g.rings.slice().reverse().forEach(function (rg) {
      const v = a.voices[rg.i];
      pill((rg.i + 1) + ' · ' + euName(v) + (v.eu && v.k ? ' r' + v.eu.rot : ''), L.neck.x + 8, ly, vcol(rg.i), 'left');
      ly -= 23 * fs;
    });
  }
  function flashAmount(i, j, now) {
    let m = 0;
    for (let q = 0; q < state.flashes.length; q++) { const f = state.flashes[q]; if (f.v === i && f.cell === j) m = Math.max(m, 1 - (now - f.t) / 320); }
    return m;
  }

  // ---------- 時間格 ----------
  function tlGeo() {
    const r = L.tl, a = analysis();
    const labW = Math.round(Math.min(r.w * 0.3, 96 * fs));
    const x0 = r.x + labW + 12, x1 = r.x + r.w - 12;
    const span = a.mode === 'cycle' ? a.L : Math.min(a.L, SPAN_MAX);
    const top = r.y + Math.round(46 + 18 * fs);
    return { x0: x0, x1: x1, span: span, top: top, labW: labW, X: function (g) { return x0 + (x1 - x0) * g / span; } };
  }
  function drawTimeline(now, gNow) {
    const r = L.tl, a = analysis(), G = tlGeo(), rows = onVoices();
    panel(r);
    ctx.font = fnt(12, 700); ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(T('展開的時間格', 'Time grid'), r.x + 10, r.y + 8);
    ctx.font = fnt(11); ctx.fillStyle = C.muted;
    const sub = a.mode === 'cycle' ? T('一個循環，' + a.L + ' 個細格（lcm）', 'one cycle, ' + a.L + ' small boxes (lcm)')
      : (a.L > SPAN_MAX ? T('週期 ' + a.L + ' 格太長，只畫前 ' + SPAN_MAX + ' 格', 'period of ' + a.L + ' boxes is long; first ' + SPAN_MAX + ' shown') : T('一個週期 ' + a.L + ' 格（lcm）', 'one period of ' + a.L + ' boxes (lcm)'));
    ctx.fillText(sub, r.x + 10, r.y + 8 + 17 * fs);
    const rh = L.rowH, unitG = function (i) { return a.mode === 'cycle' ? a.L / state.voices[i].n : 1; };
    // 一起落拍的直條（跨所有列）
    const yTop = G.top, yBot = G.top + (rows.length + 1) * rh;
    a.together.forEach(function (c) {
      if (c >= G.span) return;
      const x = G.X(c), w = Math.max(3, G.X(1) - G.X(0));
      const gg = ctx.createLinearGradient(0, yTop, 0, yBot);
      gg.addColorStop(0, alpha(C['pr-sync'], 0.05)); gg.addColorStop(1, alpha(C['pr-sync'], D.dark ? 0.26 : 0.18));
      ctx.fillStyle = gg; ctx.fillRect(x - 1, yTop - 4, Math.min(w, 14) + 2, yBot - yTop + 4);
    });
    // 每個聲部一列
    rows.forEach(function (i, q) {
      const v = a.voices[i], col = vcol(i), y = G.top + q * rh, u = unitG(i);
      pill((i + 1) + ' · ' + euName(v), r.x + 8, y + rh / 2 - 2, col, 'left');
      const nBox = Math.round(G.span / u);
      for (let j = 0; j < nBox; j++) {
        const xa = G.X(j * u) + 1, xb = G.X((j + 1) * u) - 1, w = Math.max(1, xb - xa), hh = rh - 12, yy = y + 4;
        const cell = j % v.n, hit = v.pattern.charAt(cell) === 'x';
        D.roundRect(ctx, xa, yy, w, hh, Math.min(5, w / 3));
        if (hit) {
          const fl = state.play ? flashAmount(i, cell, now) : 0;
          const gr = ctx.createLinearGradient(0, yy, 0, yy + hh);
          gr.addColorStop(0, D.mix(col, '#ffffff', 0.25 + 0.4 * fl)); gr.addColorStop(1, shade(col, -0.15));
          ctx.fillStyle = gr; ctx.fill();
          ctx.strokeStyle = alpha('#ffffff', D.dark ? 0.18 : 0.45); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(xa + 2, yy + 1); ctx.lineTo(xa + w - 2, yy + 1); ctx.stroke();
        } else {
          ctx.fillStyle = alpha(col, D.dark ? 0.08 : 0.06); ctx.fill();
          ctx.strokeStyle = alpha(col, 0.22); ctx.lineWidth = 1; ctx.stroke();
        }
        // 每個循環的開頭畫粗一點的分隔
        if (cell === 0 && j > 0) { ctx.strokeStyle = alpha(C.text, 0.35); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(xa - 1, y + 1); ctx.lineTo(xa - 1, y + rh - 5); ctx.stroke(); }
        if (kb && kb.focused() && kbVoice() === i && state.sel[i] === cell && j < v.n) {
          ctx.setLineDash([3, 3]); ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5;
          D.roundRect(ctx, xa - 2, yy - 2, w + 4, hh + 4, 5); ctx.stroke(); ctx.setLineDash([]);
        }
      }
    });
    // 合成節奏
    const yC = G.top + rows.length * rh;
    pill(T('合成', 'Combined'), r.x + 8, yC + rh / 2 - 2, C.text, 'left');
    ctx.strokeStyle = alpha(C.text, 0.18); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(G.x0, yC + rh - 8); ctx.lineTo(G.x1, yC + rh - 8); ctx.stroke();
    const cw = G.X(1) - G.X(0);
    for (let c = 0; c < G.span; c++) {
      const x = G.X(c) + cw / 2;
      if (cw >= 5) { ctx.fillStyle = alpha(C.text, 0.18); ctx.fillRect(x - 0.5, yC + rh - 11, 1, 6); }
      const who = a.hits[c % a.L];
      if (!who.length) continue;
      const rr = Math.max(2.5, Math.min(6.5, cw * 0.42));
      who.forEach(function (i, q) { ball(x, yC + rh - 14 - q * (rr * 1.5), rr, vcol(i), false); });
      if (who.length === a.nActive && a.nActive >= 2) {
        ctx.strokeStyle = C['pr-sync']; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(x, yC + rh - 14 - (who.length - 1) * rr * 0.75, rr * (who.length * 0.75 + 0.9), 0, TAU); ctx.stroke();
      }
    }
    // 週期的結尾（lcm）
    if (G.span === a.L) {
      const x = G.X(a.L);
      ctx.strokeStyle = alpha(C['pr-sync'], 0.85); ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(x, G.top - 6); ctx.lineTo(x, yC + rh); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.font = fnt(10.5); ctx.fillStyle = C.muted; ctx.textBaseline = 'top';
    ctx.textAlign = 'left'; ctx.fillText('0', G.x0, yC + rh + 2);
    ctx.textAlign = 'right'; ctx.fillText(String(G.span), G.x1, yC + rh + 2);
    pill((a.nActive >= 2 ? 'lcm = ' : '') + a.L + T(' 格 = ', ' boxes = ') + secTxt(a.periodSec), G.x1, yC + rh + 26 * fs, C['pr-sync'], 'right');
    // 播放游標
    if (state.play && gNow != null) {
      const gm = Core.mod(gNow, a.L);
      if (gm <= G.span) {
        const x = G.X(gm);
        ctx.strokeStyle = C['pr-cur']; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, G.top - 8); ctx.lineTo(x, yC + rh - 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 5, G.top - 12); ctx.lineTo(x + 5, G.top - 12); ctx.lineTo(x, G.top - 5); ctx.closePath();
        ctx.fillStyle = C['pr-cur']; ctx.fill();
      }
    }
  }

  function draw(now) {
    D.backdrop(ctx, W, H);
    const b = state.play ? beatNow() : 0;
    drawNecklace(now, b);
    drawTimeline(now, state.play ? gOfBeat(b) : null);
  }
  function updateCanvasLabel() {
    const a = analysis();
    const desc = a.voices.filter(function (v) { return v.on; }).map(function (v) { return voiceName(v.i) + ' ' + v.pattern + T('（', ' (') + voiceSummary(v) + T('）', ')'); }).join(T('；', '; '));
    cv.setAttribute('aria-label', T('節奏項鍊與時間格。', 'Rhythm necklaces and time grid. ') + desc + T('。', '. ') + combinedSentence() +
      T('按 Enter 選聲部，左右鍵移動到哪一格，上下鍵切換那一格有沒有重音。', ' Enter picks a voice, left and right move along its boxes, up or down toggles the accent.'));
  }

  // ---------- 點選珠子或格子 ----------
  function evPos(e) { const b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; }
  function pickAt(p) {
    if (!L) return null;
    const a = analysis();
    // 項鍊上的珠子（最近的，24 px 以內）
    const g = neckGeo();
    let best = null, bd = 24;
    g.rings.forEach(function (rg) {
      const n = state.voices[rg.i].n;
      for (let j = 0; j < n; j++) {
        const x = g.cx + rg.R * Math.cos(ang(j, n)), y = g.cy + rg.R * Math.sin(ang(j, n)), d = Math.hypot(p.x - x, p.y - y);
        if (d < bd) { bd = d; best = { i: rg.i, j: j }; }
      }
    });
    if (best) return best;
    // 時間格
    const G = tlGeo(), rows = onVoices();
    if (p.x < G.x0 || p.x > G.x1) return null;
    for (let q = 0; q < rows.length; q++) {
      const y = G.top + q * L.rowH;
      if (p.y >= y && p.y <= y + L.rowH - 4) {
        const i = rows[q], u = a.mode === 'cycle' ? a.L / state.voices[i].n : 1;
        const gx = (p.x - G.x0) / (G.x1 - G.x0) * G.span;
        return { i: i, j: Math.floor(gx / u) % state.voices[i].n };
      }
    }
    return null;
  }
  let down = null;
  cv.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = evPos(e);
    down = { x: p.x, y: p.y, id: e.pointerId, hit: pickAt(p) };
  });
  cv.addEventListener('pointerup', function (e) {
    if (!down || e.pointerId !== down.id) return;
    const p = evPos(e), d = down;
    down = null;
    if (Math.hypot(p.x - d.x, p.y - d.y) > 10) return;   // 是捲動，不是點
    const h = pickAt(p);
    if (h && d.hit && h.i === d.hit.i && h.j === d.hit.j) toggleCell(h.i, h.j);
  });
  cv.addEventListener('pointercancel', function () { down = null; });
  cv.addEventListener('pointermove', function (e) { if (!down) cv.style.cursor = pickAt(evPos(e)) ? 'pointer' : 'default'; });

  // 鍵盤：Enter 選聲部，左右鍵移動格子，上下鍵切換重音
  let kb = null;
  function kbVoice() { return kb ? kb.index() : 0; }
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('節奏項鍊畫布。Enter 選聲部，左右鍵移動到哪一格，上下鍵切換那一格有沒有重音。', 'Rhythm necklace canvas. Enter picks a voice, left and right arrows move along its boxes, up or down toggles the accent.'),
      items: [0, 1, 2].map(function (i) {
        return {
          name: function () { return voiceName(i) + (state.voices[i].on ? '' : T('（沒有開啟）', ' (off)')); },
          move: function (dx, dy, big) {
            const v = state.voices[i];
            if (!v.on) return false;
            if (dx) { state.sel[i] = Core.mod(state.sel[i] + dx * (big ? 4 : 1), v.n); requestDraw(); return true; }
            if (dy) { toggleCell(i, state.sel[i]); return true; }
            return false;
          },
          describe: function () {
            const v = state.voices[i];
            if (!v.on) return voiceName(i) + T('沒有開啟', ' is off');
            const hit = patOf(i)[state.sel[i]];
            return voiceName(i) + T(' 第 ' + state.sel[i] + ' 格：', ', box ' + state.sel[i] + ': ') + (hit ? T('重音', 'accent') : T('不敲', 'rest'));
          }
        };
      }),
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
    const p = state.play;
    if (p && !p.tA) more = true;   // 等音訊環境開始跑
    else if (p) {
      if (!seq.running) { endPlay('stop'); }   // 被 Esc、關音效或切到背景停掉
      else {
        // 音訊時鐘換了基準（例如播放中才建立音訊環境）：從目前位置重新排程
        if (p.tA && seq.running && Math.abs((AU.now() - p.tA) - (now / 1000 - p.pA)) > 0.3) startSeq(beatNow());
        if ((now - p.startPerf) / 1000 > MAX_PLAY) endPlay('time');
        else {
          const g = gOfBeat(beatNow()), gi = Math.floor(g + 1e-9);
          if (p.lastVis < 0) p.lastVis = gi - 1;
          if (gi - p.lastVis > 64) p.lastVis = gi - 1;
          const a = analysis();
          for (let c = p.lastVis + 1; c <= gi; c++) {
            if (c < 0) continue;
            const who = a.hits[Core.mod(c, a.L)];
            who.forEach(function (i) {
              const u = a.mode === 'cycle' ? a.L / state.voices[i].n : 1;
              state.flashes.push({ v: i, cell: Core.mod(Math.round(c / u), state.voices[i].n), t: now, sync: false });
            });
            if (a.nActive >= 2 && who.length === a.nActive) state.flashes.push({ v: -1, cell: -1, t: now, sync: true });
          }
          p.lastVis = gi;
          state.flashes = state.flashes.filter(function (f) { return now - f.t < 460; });
          more = true;
        }
      }
    }
    if (view3 && view3.active) { if (state.play) view3.frame(); }
    else draw(now);
    if (more && !(D.reducedMotion() && !state.play)) requestDraw();
  }

  // =====================================================================
  // 3D：切換到 3D 時才載入 js/polyrhythm-3d.js 與 three.js
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    Core: Core, T: T, D: D,
    colors: function () { return C; },
    fs: function () { return fs; },
    data: function () { return analysis(); },
    /** 現在走到共同細格的哪裡（沒有播放時 null） */
    position: function () { return state.play ? gOfBeat(beatNow()) : null; },
    euName: euName, knotName: knotName,
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 項鍊。', 'The 3D graphics context was lost, so the view switched back to the 2D necklaces.');
    }
  };
  function update3D(rebuild) {
    if (!view3 || !view3.active) return;
    if (rebuild) view3.rebuild(); else view3.frame();
  }
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Polyrhythm3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Polyrhythm3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/polyrhythm-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Polyrhythm3D) throw new Error('polyrhythm-3d.js did not load');
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
        view3 = window.Polyrhythm3D.create(lib, host3, bridge);
        state.view = '3d';
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        emit('view', { src: 'view' });
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      state.view = '2d';
      if (view3) { view3.dispose(); view3 = null; }
      stage.classList.remove('is3d');
      $('resetCam').hidden = true;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    state.view = '2d';
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 項鍊。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D necklaces are kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ---------- 分享目前設定：點出來的自訂節奏（滑桿、按鈕、勾選框由 classroom.js 記錄） ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      return { v: state.voices.map(function (v) { return v.custom && v.base ? { n: v.n, r: v.rot, b: Core.toStr(v.base) } : null; }) };
    },
    set: function (o) {
      if (!o || !Array.isArray(o.v)) return;
      o.v.slice(0, 3).forEach(function (c, i) {
        if (!c || typeof c !== 'object' || typeof c.b !== 'string') return;
        const base = Core.fromStr(c.b);
        if (base.length < Core.N_MIN || base.length > Core.N_MAX) return;
        const v = state.voices[i];
        v.n = base.length; v.rot = clamp(Math.round(+c.r || 0), 0, v.n - 1);
        const id = Core.identify(Core.rotate(base, v.rot));
        if (id.euclid) { v.custom = false; v.base = null; v.k = id.k; v.rot = id.rot; }
        else { v.custom = true; v.base = base; v.k = Core.count(base); }
        v.src = 'share';
      });
      dirty(); syncAll(); renderAll();
    }
  });

  // 給測試用的介面（不影響畫面）
  window.__pr = {
    state: state,
    analysis: function () { return analysis(); },
    toggle: function (i, j) { toggleCell(i, j); },
    view3: function () { return view3; },
    beat: function () { return beatNow(); }
  };

  // =====================================================================
  // 啟動（不發聲、不送任務事件）
  // =====================================================================
  readColors();
  document.querySelector('.view-bar').setAttribute('data-share-skip', '');
  $('presets').setAttribute('data-share-skip', '');
  // 讀 HTML 上的初始值（瀏覽器可能記住了上一次的表單值）
  [0, 1, 2].forEach(function (i) {
    const v = state.voices[i];
    v.n = clamp(Math.round(+elN[i].value), Core.N_MIN, Core.N_MAX);
    v.k = clamp(Math.round(+elK[i].value), 0, v.n);
    v.rot = clamp(Math.round(+elR[i].value), 0, v.n - 1);
    if (elOn[i]) v.on = elOn[i].checked;
  });
  state.bpm = clamp(Math.round(+elBpm.value), Core.BPM_MIN, Core.BPM_MAX);
  if (NUM) [elBpm].concat(elN, elK, elR).forEach(function (el) { NUM.clear(el); });
  updateSoundButton();
  syncAll(); renderReadouts(); updateStop(); updateCanvasLabel();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    renderReadouts();
    if (view3 && view3.active) view3.onTheme();
    resize();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && (ev.detail.name === 'lang' || ev.detail.name === 'fs')) {
      readColors(); for (const id in lastHTML) delete lastHTML[id];
      renderButtons(); renderReadouts(); updateCanvasLabel(); if (view3 && view3.active) view3.onTheme(); resize();
    }
  });
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  resize();
})();
