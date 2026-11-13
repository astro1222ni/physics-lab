/* scales-modes.js — 「音階與調式」的畫面與互動
 * （數學在 scales-modes-core.js；聲音一律用 music-audio.js；2D 繪圖工具 LabDraw 在 drawkit.js；3D 在 scales-modes-3d.js，切到 3D 時才載入）
 *
 * 畫面：主畫布左邊（手機在上）是 12 格鐘面（C 在正上方、順時針），音階的音連成多邊形、邊上寫步伐（全、半、增二）；
 *       右邊（手機在下）是亮暗階梯的格子圖：同一個主音的七個調式由亮到暗排成七列，每列比上一列只有一個音往左挪一格。
 *       畫布下面是 HTML 的步伐條（寬度 ∝ 半音數，換調式時整條滑動）與鍵盤（點鍵把音加進或移出音階）。
 * 聲音：只有學生按「▶ 播放」、點步伐條、點鍵盤或鐘面時才發聲；音效關閉時畫面照跑，狀態列顯示提示並讓音效開關閃一下。
 * 任務事件：'scale'（音階改變之後）、'play'（按播放）、'step'（點步伐條）；資料由 ScalesModesCore.eventData 產生。 */
(function () {
  'use strict';
  const SM = window.ScalesModesCore;
  const D = window.LabDraw;
  const AU = window.MusicAudio;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha, shade = D.shade, mix = D.mix;
  const mod = SM.mod;
  const TAU = Math.PI * 2;
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const PARTIALS = [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6];   // 近似的風琴音色
  const GAIN = 0.34;
  const MODE_SHORT = {
    ionian: ['伊奧尼亞', 'Ionian'], dorian: ['多利亞', 'Dorian'], phrygian: ['弗里吉亞', 'Phrygian'], lydian: ['利底亞', 'Lydian'],
    mixolydian: ['混合利底亞', 'Mixolydian'], aeolian: ['伊奧利亞', 'Aeolian'], locrian: ['洛克里亞', 'Locrian']
  };
  const mshort = function (id) { return MODE_SHORT[id] ? T(MODE_SHORT[id][0], MODE_SHORT[id][1]) : ''; };
  const TRIAD = { major: ['大三和弦', 'major triad'], minor: ['小三和弦', 'minor triad'], dim: ['減三和弦', 'diminished triad'], aug: ['增三和弦', 'augmented triad'], other: ['其他', 'other'] };
  const DEG_ZH = ['', '二度', '三度', '四度', '五度', '六度', '七度', '八度', '九度', '十度', '十一度', '十二度'];

  // ---------- 狀態 ----------
  const state = {
    tonicName: 'C', type: 'ionian', semis: SM.semisFromSteps(SM.scaleSteps('ionian')),
    tuning: 'equal', dir: 'up', tempo: 120,
    ref: null,                 // 記住的音階 { tonicName, semis, type }
    play: null,                // 播放中：{ list, dt, total, idx, seq }
    moved: null,               // 亮暗階梯剛移動的音：{ fromPc, toPc, degree, t0, wrap }
    stepOn: null,              // 剛點的步伐 { i, t0 }
    flash: null,               // 剛點的鍵（鐘面上閃一下）{ pc, t0 }
    offHintShown: false
  };
  let A = null;                // 目前的分析結果
  function recompute() {
    A = SM.analyze(state.tonicName, state.semis, state.type, { tuning: state.tuning, ref: state.ref });
  }
  const tonicObj = function () { return SM.tonicByName(state.tonicName) || SM.TONICS[0]; };

  // ---------- 色彩與字體 ----------
  let C = {}, fs = 1;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'sm-w', 'sm-h', 'sm-a', 'sm-tonic', 'sm-ref', 'sm-low', 'sm-poly']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    fs = Math.max(1, Math.min(1.45, parseFloat(cs.getPropertyValue('--fs')) || 1));
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + (px * fs).toFixed(1) + 'px ' + FONT; }
  const stepColor = function (s) { return s === 1 ? C['sm-h'] : s === 2 ? C['sm-w'] : C['sm-a']; };
  const stepCls = function (s) { return s === 1 ? 'h' : s === 2 ? 'w' : 'a'; };
  const stepWord = function (s) { return s === 1 ? T('半', 'H') : s === 2 ? T('全', 'W') : s === 3 ? T('增二', 'A2') : String(s); };
  const stepLong = function (s) { return s === 1 ? T('半音', 'half step') : s === 2 ? T('全音', 'whole step') : s === 3 ? T('增二度', 'augmented second') : T(s + ' 個半音', s + ' semitones'); };

  // ---------- 數字與文字 ----------
  function fx(v, d) { if (v == null || !isFinite(v)) return '—'; let s = v.toFixed(d); if (/^-0(\.0+)?$/.test(s)) s = s.slice(1); return s.replace('-', '−'); }
  function sg(v, d) { if (v == null || !isFinite(v)) return '—'; const s = Math.abs(v).toFixed(d); if (+s === 0) return (0).toFixed(d); return (v < 0 ? '−' : '+') + s; }
  const esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  const list = function (arr) { return arr.join(T('、', ', ')); };
  /** 不在音階裡的音的預設寫法（跟著主音的升降方向） */
  function plainName(pc) {
    const t = tonicObj(), sharp = t.acc > 0 || (t.acc === 0 && SM.LETTER_FIFTH[t.letter] >= 0);
    return (sharp ? window.MusicTheory.SHARP_NAMES : window.MusicTheory.FLAT_NAMES)[mod(pc, 12)];
  }
  /** 鐘面、鍵盤上這個音高的名字：在音階裡就用音階的拼法 */
  function pcName(pc) {
    const i = A.pcs.indexOf(mod(pc, 12));
    if (i < 0) return plainName(pc);
    const n = A.notes.filter(function (x) { return x.pc === mod(pc, 12); })[0];
    return n ? n.name : plainName(pc);
  }
  function noteOfPc(pc) { return A.notes.slice(0, A.n).filter(function (x) { return x.pc === mod(pc, 12); })[0] || null; }
  /** 音階的名字（中英）：例如「D 多利亞」 */
  function scaleName(a) {
    a = a || A;
    if (a.idZh) return a.tonicName + ' ' + T(a.idZh, a.idEn);
    return a.tonicName + T(' 自訂音階（' + a.n + ' 個音）', ' custom scale (' + a.n + (a.n === 1 ? ' note)' : ' notes)'));
  }
  function stepsText(steps) { return steps.map(stepWord).join(' '); }
  function sigText(a) {
    if (!a.spelledOk) return T('（超過七個音，字母會重複）', '(more than seven notes: letters repeat)');
    const parts = [];
    if (a.sharps) parts.push(T(a.sharps + ' 個升記號', a.sharps + (a.sharps === 1 ? ' sharp' : ' sharps')));
    if (a.flats) parts.push(T(a.flats + ' 個降記號', a.flats + (a.flats === 1 ? ' flat' : ' flats')));
    if (!parts.length) return T('沒有升降記號', 'no sharps or flats');
    return parts.join(T('、', ', ')) + (a.doubles ? T('（其中 ' + a.doubles + ' 個重升或重降）', ' (' + a.doubles + ' double)') : '');
  }

  // ---------- 任務事件 ----------
  function emit(type, extra) {
    if (window.LabShare && window.LabShare.restoring) return;
    if (window.LabMission) window.LabMission.emit(type, SM.eventData(A, extra));
  }

  // =====================================================================
  // 改變音階的各種方式
  // =====================================================================
  function changed(src, extra, quiet) {
    recompute();
    renderAll(src === 'ladder' || src === 'type' || src === 'tonic' || src === 'custom');
    if (!quiet) emit('scale', Object.assign({ src: src }, extra || {}));
    if (!quiet) say(scaleSentence());
  }
  function scaleSentence() {
    let s = scaleName() + T('：', ': ') + A.names.join(' ') + T('。步伐 ', '. Steps ') + stepsText(A.steps) + T('。', '.');
    if (A.parent) s += T('和 ' + A.parent + ' 大調用同一組音。', ' Same notes as ' + A.parent + ' major.');
    if (A.ref) s += T('和記住的音階共用 ' + A.ref.common + ' 個音。', ' ' + A.ref.common + ' notes in common with the remembered scale.');
    return s;
  }
  function setPreset(id, src, extra) {
    stopPlay();
    state.type = id;
    state.semis = SM.semisFromSteps(SM.scaleSteps(id));
    changed(src, extra);
  }
  $('scale').addEventListener('change', function () {
    const v = this.value;
    if (v === 'custom') { stopPlay(); state.type = 'custom'; state.moved = null; changed('type'); return; }
    if (!SM.scaleById(v)) return;
    state.moved = null;
    setPreset(v, 'type');
  });
  $('tonic').addEventListener('change', function () {
    const t = SM.tonicByName(this.value);
    if (!t || t.name === state.tonicName) return;
    stopPlay();
    state.tonicName = t.name;
    state.moved = null;
    changed('tonic');
  });
  // 亮暗階梯：直接選一格
  document.querySelectorAll('[data-ladder]').forEach(function (b) {
    b.addEventListener('click', function () {
      const id = b.dataset.ladder, from = A.mode;
      state.moved = null;
      if (from && from !== id) {
        const k0 = SM.BRIGHT_ORDER.indexOf(from), k1 = SM.BRIGHT_ORDER.indexOf(id);
        if (Math.abs(k1 - k0) === 1) { markMoved(SM.ladderStep(from, A.tonic, k1 - k0)); }
      }
      setPreset(id, 'ladder', { ladder: { dir: 0, wrap: false, from: from, degree: null } });
    });
  });
  function markMoved(st) {
    if (!st) return;
    const before = A.semis.slice(), t0 = A.tonic;
    const newSemis = SM.semisFromSteps(SM.scaleSteps(st.mode));
    const i = st.degree - 1;
    state.moved = { fromPc: mod(t0 + before[i], 12), toPc: mod(st.tonicPc + newSemis[i], 12), degree: st.degree, t0: performance.now(), wrap: st.wrap };
  }
  function ladderGo(dir) {
    if (!A.mode) { say(T('目前的音階不是教會調式：先在亮暗階梯上選一格。', 'The current scale is not a church mode: pick a rung of the ladder first.')); return; }
    const st = SM.ladderStep(A.mode, A.tonic, dir);
    const from = A.mode;
    markMoved(st);
    const semis = SM.semisFromSteps(SM.scaleSteps(st.mode));
    if (st.wrap) {
      const t = SM.bestTonic(st.tonicPc, semis);
      state.tonicName = t.name;
    }
    stopPlay();
    state.type = st.mode;
    state.semis = semis;
    recompute();
    renderAll(true);
    emit('scale', { src: 'ladder', ladder: { dir: dir, wrap: st.wrap, from: from, degree: st.degree } });
    const deg = st.degree;
    say((st.wrap
      ? T('只剩主音沒動：主音也' + (dir > 0 ? '降' : '升') + '半音，變成 ', 'Only the tonic was left, so the tonic itself moves ' + (dir > 0 ? 'down' : 'up') + ' a half step: ')
      : T('第 ' + deg + ' 級' + (dir > 0 ? '降' : '升') + '半音，變成 ', 'Degree ' + deg + ' moves ' + (dir > 0 ? 'down' : 'up') + ' a half step: ')) + scaleName() + T('。', '. ') +
      T('亮度 ', 'Brightness ') + sg(A.brightness, 0) + T('。', '.'));
  }
  $('darker').addEventListener('click', function () { ladderGo(1); });
  $('brighter').addEventListener('click', function () { ladderGo(-1); });

  // 自訂：點鍵盤或鐘面
  function togglePc(pc, src) {
    pc = mod(pc, 12);
    const rel = mod(pc - A.tonic, 12);
    if (rel === 0) { say(T('主音一定在音階裡；要換主音請用「主音」選單。', 'The tonic always stays in the scale; use the “Tonic” menu to change it.')); return false; }
    stopPlay();
    const i = state.semis.indexOf(rel);
    if (i >= 0) state.semis = state.semis.filter(function (x) { return x !== rel; });
    else state.semis = SM.normSemis(state.semis.concat([rel]));
    state.type = 'custom';
    state.moved = null;
    changed('custom', { toggled: pc, added: i < 0 });
    return true;
  }
  function soundCheck() {
    if (AU.enabled()) return true;
    say(AU.offHint());
    AU.flashSoundButton();
    return false;
  }
  function tapTone(midi) {
    state.flash = { pc: mod(midi, 12), t0: performance.now() };
    requestDraw();
    if (!AU.enabled()) {
      if (!state.offHintShown) { state.offHintShown = true; setTimeout(function () { say(AU.offHint()); }, 60); AU.flashSoundButton(); }
      return;
    }
    const rel = midi - (SM.TONIC_MIDI0 + A.tonic);
    const f = SM.tonicFreq(A.tonic) * SM.ratio(state.tuning, rel).value;
    AU.tone({ f0: f, partials: PARTIALS, dur: 0.5, gain: GAIN, attack: 0.02, release: 0.3 });
  }

  // =====================================================================
  // 鍵盤（C4–C5，HTML 按鈕）
  // =====================================================================
  const piano = $('piano');
  const WHITE = [60, 62, 64, 65, 67, 69, 71, 72];
  const keyEls = {};
  (function buildPiano() {
    const ww = 100 / WHITE.length, bw = ww * 0.64;
    WHITE.forEach(function (m, i) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'key w'; b.dataset.midi = m;
      b.style.left = (i * ww) + '%'; b.style.width = 'calc(' + ww + '% + 1px)';
      b.innerHTML = '<span class="kd"></span><span class="kn"></span>';
      piano.appendChild(b); keyEls[m] = b;
    });
    [61, 63, 66, 68, 70].forEach(function (m) {
      const iRight = WHITE.indexOf(m + 1);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'key b'; b.dataset.midi = m;
      b.style.left = (iRight * ww - bw / 2) + '%'; b.style.width = bw + '%';
      b.innerHTML = '<span class="kd"></span><span class="kn"></span>';
      piano.appendChild(b); keyEls[m] = b;
    });
  })();
  function renderPiano() {
    for (let m = 60; m <= 72; m++) {
      const b = keyEls[m], pc = mod(m, 12), inS = A.pcs.indexOf(pc) >= 0, nt = noteOfPc(pc);
      b.querySelector('.kn').textContent = pcName(pc);
      b.querySelector('.kd').textContent = inS && nt ? nt.degree : '';
      b.classList.toggle('tonic', pc === A.tonic);
      b.setAttribute('aria-pressed', String(inS));
      b.setAttribute('aria-label', pcName(pc) + (inS && nt ? T('，第 ' + nt.degree + ' 級', ', degree ' + nt.degree) : T('，不在音階裡', ', not in the scale')) +
        (pc === A.tonic ? T('（主音）', ' (tonic)') : T('。按一下' + (inS ? '移出' : '加入') + '音階', '. Press to ' + (inS ? 'remove it from' : 'add it to') + ' the scale')));
    }
  }
  piano.addEventListener('click', function (e) {
    const key = e.target.closest('.key');
    if (!key) return;
    const m = +key.dataset.midi;
    togglePc(m, 'keys');
    tapTone(m);
  });

  // =====================================================================
  // 步伐條（HTML）
  // =====================================================================
  const track = $('track'), stepNames = $('stepNames'), stepbar = $('stepbar');
  let trackKey = '', trackCycle = [], trackOff = 0, trackPos = 0;
  function cyc(arr, k) { let s = 0; for (let i = 0; i < k; i++) s += arr[i % arr.length]; return s; }
  function placeTrack(c, animate) {
    track.classList.toggle('anim', !!animate && !D.reducedMotion());
    track.style.transform = 'translateX(' + ((-11 - c) / 36 * 100) + '%)';
    trackPos = c;
  }
  track.addEventListener('transitionend', function () {
    // 滑到旁邊的那一圈之後，悄悄換回中間那一圈（看起來不會動）
    if (trackPos !== trackOff) { placeTrack(trackOff, false); }
  });
  function renderStepbar(animate) {
    const fam = A.family, base = fam ? SM.FAMILIES[fam].base : A.steps, rot = fam ? A.rot : 0;
    const key = (fam || 'x:' + A.steps.join(',')) + '|' + T('zh', 'en');
    const L = base.length;
    let rebuilt = false;
    if (key !== trackKey) {
      trackKey = key; trackCycle = base.slice(); rebuilt = true;
      let h = '';
      for (let r = 0; r < 3; r++) {
        base.forEach(function (s, j) {
          h += '<button type="button" class="blk ' + stepCls(s) + '" data-j="' + (r * L + j) + '" style="width:' + (s / 36 * 100) + '%"><i>' + esc(stepWord(s)) + '</i></button>';
        });
      }
      track.innerHTML = h;
    }
    const c = cyc(trackCycle, rot);
    // 窗口裡的格子（中間那一圈從 rot 開始的 L 格）可以點
    track.querySelectorAll('.blk').forEach(function (b) {
      const j = +b.dataset.j, inWin = j >= L + rot && j < L + rot + L;
      b.classList.toggle('out', !inWin);
      b.tabIndex = inWin ? 0 : -1;
      if (inWin) {
        const i = j - L - rot, lo = A.notes[i], hi = A.notes[i + 1], s = A.steps[i];
        b.removeAttribute('aria-hidden');
        b.dataset.i = i;
        b.setAttribute('aria-label', T('第 ' + (i + 1) + '–' + (i + 2) + ' 個音 ' + lo.name + '–' + hi.name + '：' + stepLong(s) + '（' + s + ' 個半音）',
          'Notes ' + (i + 1) + '–' + (i + 2) + ', ' + lo.name + '–' + hi.name + ': ' + stepLong(s) + ' (' + s + (s === 1 ? ' semitone)' : ' semitones)')));
      } else { b.setAttribute('aria-hidden', 'true'); delete b.dataset.i; b.removeAttribute('aria-label'); }
      b.classList.toggle('on', !!(inWin && state.stepOn && +b.dataset.i === state.stepOn.i));
    });
    if (rebuilt || !animate || D.reducedMotion()) { trackOff = c; placeTrack(c, false); }
    else {
      // 往最近的方向滑（必要時先滑到旁邊那一圈，再悄悄換回來）
      let best = c;
      [c - 12, c + 12].forEach(function (x) { if (x >= -11 && x <= 11 && Math.abs(x - trackPos) < Math.abs(best - trackPos)) best = x; });
      trackOff = c;
      if (best !== trackPos) placeTrack(best, true);
      else placeTrack(c, false);
    }
    // 音名
    let h = '';
    for (let i = 0; i <= A.n; i++) {
      const x = (1 + A.notes[i].semis) / 14 * 100;
      h += '<span class="' + (i === 0 || i === A.n ? 't' : '') + '" style="left:' + x + '%">' + esc(A.notes[i].name) + '</span>';
    }
    stepNames.innerHTML = h;
    $('stepSeq').textContent = stepsText(A.steps) + '  (' + A.steps.join(' ') + ')';
  }
  stepbar.addEventListener('click', function (e) {
    const b = e.target.closest('.blk');
    if (!b || b.dataset.i == null) return;
    tapStep(+b.dataset.i);
  });
  function tapStep(i) {
    const lo = A.notes[i], hi = A.notes[i + 1], s = A.steps[i];
    if (!lo || !hi) return;
    stopPlay();
    state.stepOn = { i: i, t0: performance.now() };
    track.querySelectorAll('.blk').forEach(function (b) { b.classList.toggle('on', b.dataset.i != null && +b.dataset.i === i); });
    const r = SM.stepRatio(state.tuning, lo.semis, hi.semis);
    if (AU.enabled()) {
      const at = AU.now() + 0.03;
      AU.tone({ f0: lo.freq, partials: PARTIALS, dur: 0.42, gain: GAIN, attack: 0.02, release: 0.2, at: at });
      AU.tone({ f0: hi.freq, partials: PARTIALS, dur: 0.6, gain: GAIN, attack: 0.02, release: 0.3, at: at + 0.48 });
    } else soundCheck();
    requestDraw();
    emit('step', { i: i, size: s, lo: lo.semis, hi: hi.semis, stepCents: r.cents, p: r.p == null ? null : r.p, q: r.q == null ? null : r.q });
    say(lo.name + '–' + hi.name + T('：' + stepLong(s) + '，' + (r.p != null ? r.p + '/' + r.q + '，' : '') + fx(r.cents, 2) + ' 音分。',
      ': ' + stepLong(s) + ', ' + (r.p != null ? r.p + '/' + r.q + ', ' : '') + fx(r.cents, 2) + ' cents.'));
    setTimeout(function () { if (state.stepOn && state.stepOn.i === i && performance.now() - state.stepOn.t0 > 1100) { state.stepOn = null; renderStepOn(); requestDraw(); } }, 1200);
  }
  function renderStepOn() { track.querySelectorAll('.blk').forEach(function (b) { b.classList.toggle('on', !!(state.stepOn && b.dataset.i != null && +b.dataset.i === state.stepOn.i)); }); }

  // =====================================================================
  // 讀數
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  const yes = function (b) { return b ? '<span class="ok-txt">' + T('是', 'yes') + '</span>' : '<span class="no-txt">' + T('否', 'no') + '</span>'; };
  function renderReadout() {
    let sub = '';
    if (A.family === 'diatonic') sub = T('和 ' + A.parent + ' 大調用同一組音（大調步伐從第 ' + (A.rot + 1) + ' 步開始走）', 'Same notes as ' + A.parent + ' major (the major row of steps started at step ' + (A.rot + 1) + ')');
    else if (A.family === 'harmonic') sub = T('自然小調把第 7 級升高半音', 'Natural minor with the 7th raised a half step');
    else if (A.family === 'melodic') sub = A.rot === 0 ? T('自然小調把第 6、7 級升高半音', 'Natural minor with the 6th and 7th raised') : T('旋律小調的轉位', 'A rotation of the melodic minor');
    else if (A.family) sub = T(SM.FAMILIES[A.family].zh, SM.FAMILIES[A.family].en);
    else sub = A.n === 7 ? T('這不是七個教會調式之一', 'Not one of the seven church modes') : T('不是七聲調式', 'Not a seven-note mode');
    setHTML('idbox', '<div class="nm">' + esc(scaleName()) + '</div><div class="sub">' + esc(sub) + '</div>');
    const vm = A.vsMajor;
    const sizes = SM.genericSizes(A.semis);
    const sizeTxt = sizes.slice(0, 6).map(function (g) { return T(DEG_ZH[g.d] || (g.d + 1) + ' 度', ordinal(g.d + 1)) + T('：', ' ') + g.sizes.join('/'); }).join(T('　', '; '));
    let h = '<dt>' + T('步伐', 'Steps') + '</dt><dd>' + esc(stepsText(A.steps)) + '</dd>' +
      '<dt>' + T('和大調比', 'Compared with major') + '</dt><dd>' + (vm == null ? '—' : vm.length ? esc(list(vm)) : T('一樣', 'the same')) + '</dd>' +
      '<dt>' + T('主三和弦（1–3–5）', 'Tonic chord (1–3–5)') + '</dt><dd>' + (A.triad ? T(TRIAD[A.triad.kind][0], TRIAD[A.triad.kind][1]) : '—') + '</dd>' +
      '<dt>' + T('調號', 'Key signature') + '</dt><dd>' + esc(sigText(A)) + '</dd>' +
      '<dt>' + T('亮度', 'Brightness') + '</dt><dd>' + (A.brightness == null ? '—' : sg(A.brightness, 0)) + '</dd>' +
      '<dt>' + T('音的個數', 'Number of notes') + '</dt><dd>' + A.n + '</dd>' +
      '<dt>' + T('最大均勻', 'Maximally even') + '</dt><dd>' + yes(A.maxEven) + '</dd>' +
      '<dt>' + T('Myhill 性質', 'Myhill’s property') + '</dt><dd>' + yes(A.myhill) + '</dd>' +
      '<dt>' + T('移位對稱', 'Transposition symmetry') + '</dt><dd>' + (A.sym ? T('往上移 ' + A.sym + ' 個半音就和自己重合', 'maps onto itself when moved up ' + A.sym + (A.sym === 1 ? ' semitone' : ' semitones')) : T('沒有', 'none')) + '</dd>';
    if (A.n >= 2) h += '<dt>' + T('各度數的大小（半音）', 'Sizes of each interval (semitones)') + '</dt><dd><small>' + esc(sizeTxt) + (sizes.length > 6 ? ' …' : '') + '</small></dd>';
    setHTML('readout', h);
    const lbl = [1, 2, 3, 4, 5, 6];
    setHTML('ivTable', '<thead><tr>' + lbl.map(function (k) { return '<th scope="col">' + T(k + ' 個半音', k + ' st') + '</th>'; }).join('') + '</tr></thead><tbody><tr>' +
      A.iv.map(function (v) { return '<td>' + v + '</td>'; }).join('') + '</tr></tbody>');
  }
  function ordinal(n) { return n + (n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'); }
  function renderRef() {
    if (!A.ref) { setHTML('refbox', ''); return; }
    const r = A.ref, ra = SM.analyze(r.tonicName, r.semis, r.type, { tuning: state.tuning });
    const cm = r.commonPcs.map(function (pc) { return pcName(pc); });
    setHTML('refbox', '<dl class="readout"><dt>' + T('記住的音階', 'Remembered') + '</dt><dd>' + esc(scaleName(ra)) + '</dd>' +
      '<dt>' + T('它的音', 'Its notes') + '</dt><dd>' + esc(ra.names.join(' ')) + '</dd>' +
      '<dt>' + T('共用的音', 'Notes in common') + '</dt><dd><b>' + r.common + '</b>' + (cm.length ? ' <small>' + esc(cm.join(' ')) + '</small>' : '') + '</dd>' +
      '<dt>' + T('音程向量', 'Interval vector') + '</dt><dd>(' + r.iv.join(', ') + ')</dd></dl>');
  }
  function renderTable() {
    const just = state.tuning === 'just';
    let h = '<thead><tr><th>' + T('級', 'Deg.') + '</th><th>' + T('音名', 'Note') + '</th><th>' + T('首調', 'Mov. do') + '</th><th>' + T('固定', 'Fixed do') + '</th><th>' + T('頻率（Hz）', 'Freq. (Hz)') + '</th><th>' +
      T('和主音的比', 'Ratio') + '</th><th>' + T('音分', 'Cents') + '</th>' + (just ? '<th>' + T('和平均律差', 'vs equal') + '</th>' : '') + '</tr></thead><tbody>';
    const playing = state.play && state.play.idx >= 0 ? state.play.list[state.play.idx] : null;
    A.notes.forEach(function (x, i) {
      const r = x.ratio;
      const rt = r.p != null ? r.p + '/' + r.q : (r.et % 12 === 0 ? String(Math.pow(2, r.et / 12)) : '2<sup>' + r.et + '/12</sup>');
      h += '<tr' + (playing != null && playing === x.semis ? ' class="on"' : '') + '><td' + (i === 0 || i === A.n ? ' class="t"' : '') + '>' + esc(x.degree) + '</td><td>' + esc(x.nameOct) + '</td><td>' + esc(x.movDo) + '</td><td>' + esc(x.fixedDo) +
        '</td><td>' + fx(x.freq, 2) + '</td><td>' + rt + '</td><td>' + fx(x.cents, 1) + '</td>' + (just ? '<td>' + sg(x.dev, 1) + '</td>' : '') + '</tr>';
    });
    setHTML('noteTable', h + '</tbody>');
    setHTML('tableHint', just
      ? T('純律：以主音為準的 5 限純律，比值都是小整數比；最後一欄是和十二平均律差幾音分。', 'Just intonation (5-limit, built on the tonic): every ratio is a small whole-number ratio; the last column is the difference from equal temperament in cents.')
      : T('十二平均律：每個半音都是 2<sup>1/12</sup>，比主音高 k 個半音的比值是 2<sup>k/12</sup>。主音的頻率用 A4 = 440 Hz 的十二平均律。', 'Equal temperament: each semitone is 2<sup>1/12</sup>, so a note k semitones up has ratio 2<sup>k/12</sup>. The tonic uses its equal-tempered frequency with A4 = 440 Hz.'));
  }
  function renderLadder() {
    document.querySelectorAll('[data-ladder]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.ladder === A.mode)); });
    const k = SM.BRIGHT_ORDER.indexOf(A.mode);
    if (k < 0) {
      setHTML('ladderHint', T('目前的音階不是教會調式。按上面任何一格，就換成以 ' + A.tonicName + ' 為主音的那個調式。', 'The current scale is not a church mode. Press any rung to switch to that mode on ' + A.tonicName + '.'));
      return;
    }
    const dn = SM.ladderStep(A.mode, A.tonic, 1), up = SM.ladderStep(A.mode, A.tonic, -1);
    const deg = function (st) { return st.wrap ? T('主音', 'the tonic') : T('第 ' + st.degree + ' 級', 'degree ' + st.degree); };
    setHTML('ladderHint', T('目前：' + mshort(A.mode) + '（亮度 ' + sg(A.brightness, 0) + '）。▼ 更暗：' + deg(dn) + '降半音；▲ 更亮：' + deg(up) + '升半音。',
      'Now: ' + mshort(A.mode) + ' (brightness ' + sg(A.brightness, 0) + '). ▼ Darker lowers ' + deg(dn) + '; ▲ Brighter raises ' + deg(up) + '.'));
  }
  function renderSelects() {
    $('tonic').value = state.tonicName;
    $('scale').value = state.type;
    document.querySelectorAll('[data-tune]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tune === state.tuning)); });
  }
  function renderAll(animate) {
    renderSelects(); renderLadder(); renderPiano(); renderStepbar(animate); renderReadout(); renderRef(); renderTable();
    updateCanvasLabels(); rebuild3D(); requestDraw();
  }

  // =====================================================================
  // 播放設定、記住與清除
  // =====================================================================
  document.querySelectorAll('[data-tune]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.tune === state.tuning) return;
      stopPlay();
      state.tuning = b.dataset.tune;
      changed('tuning');
    });
  });
  $('dir').addEventListener('change', function () { state.dir = this.value; });
  const elTempo = $('tempo'), elTempoO = $('tempoO');
  function readTempo() { state.tempo = Math.max(60, Math.min(240, val(elTempo))); elTempoO.textContent = fx(state.tempo, 0); }
  elTempo.addEventListener('input', readTempo);
  elTempo.addEventListener('change', readTempo);
  $('pin').addEventListener('click', function () {
    state.ref = { tonicName: state.tonicName, semis: state.semis.slice(), type: state.type };
    recompute();
    renderAll(false);
    emit('scale', { src: 'pin' });
    say(T('記住了 ', 'Remembered ') + scaleName() + T('。換一個音階，就能比較兩者共用幾個音。', '. Change the scale to see how many notes the two share.'));
  });
  $('clear').addEventListener('click', function () {
    state.ref = null;
    recompute();
    renderAll(false);
    say(T('已清掉記住的音階。', 'The remembered scale has been cleared.'));
  });

  // =====================================================================
  // 播放（MusicAudio.sequencer 排程；音效關閉時時鐘照跑、畫面照樣同步）
  // =====================================================================
  let seq = null;
  function startPlay() {
    stopPlay();
    const on = soundCheck();
    const list = SM.sequence(state.semis, state.dir);
    const dt = 60 / state.tempo;
    const f0 = SM.tonicFreq(A.tonic), tuning = state.tuning;
    const fr = list.map(function (s) { return f0 * SM.ratio(tuning, s).value; });
    const total = list.length * dt + 0.35;
    // 音效關閉：不建立聲音，只用畫面的時鐘讓鐘面與鍵盤照樣跟著走
    seq = !on ? silentClock(0.06) : AU.sequencer({
      tick: function (t0, t1, start) {
        if (!AU.enabled()) return;
        for (let j = 0; j < list.length; j++) {
          const at = start + j * dt;
          if (at >= t0 && at < t1) {
            const last = j === list.length - 1;
            AU.tone({ f0: fr[j], partials: PARTIALS, dur: last ? Math.max(0.6, dt * 1.6) : dt * 0.9, gain: GAIN, attack: 0.02, release: last ? 0.4 : 0.12, at: at });
          }
        }
      }
    });
    if (on) seq.begin(0.06);
    state.play = { list: list, dt: dt, total: total, idx: -1, freqs: fr };
    updateStop(); requestDraw();
    emit('play', { dir: state.dir, tempo: state.tempo });
    if (on) say(T('播放：', 'Playing: ') + scaleName() + T('（' + (state.tuning === 'just' ? '純律' : '十二平均律') + '）', ' (' + (state.tuning === 'just' ? 'just intonation' : 'equal temperament') + ')') + T('。', '.'));
  }
  function silentClock(delay) {
    const t0 = performance.now() + delay * 1000;
    return { stop: function () {}, elapsed: function () { return (performance.now() - t0) / 1000; } };
  }
  function stopPlay() {
    if (seq) { seq.stop(); seq = null; }
    if (state.play) { state.play = null; AU.stopAll(0.06); renderTable(); updateKeysOn(-1); }
    updateStop();
  }
  $('play').addEventListener('click', startPlay);
  function busy() { return !!state.play; }
  function updateStop() { $('stop').disabled = !(AU.playing() || busy()); }
  $('stop').addEventListener('click', function () { stopPlay(); AU.stopAll(0.06); updateStop(); requestDraw(); say(T('已停止。', 'Stopped.')); });
  AU.onChange(updateStop);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && busy()) { stopPlay(); requestDraw(); } });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopPlay(); });
  function updateKeysOn(semis) {
    const midi = semis < 0 ? -1 : SM.TONIC_MIDI0 + A.tonic + semis;
    for (let m = 60; m <= 72; m++) {
      const on = midi >= 0 && (midi <= 72 ? m === midi : mod(m, 12) === mod(midi, 12) && m < 72);
      keyEls[m].classList.toggle('on', on);
    }
  }

  // =====================================================================
  // 狀態列、音效開關
  // =====================================================================
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
    // 換音效開關時停止播放（聲音由 MusicAudio 停；畫面的播放狀態也一起結束，不會卡在第一個音）
    if (ev.detail && ev.detail.name === 'sound') { stopPlay(); updateSoundButton(); updateStop(); requestDraw(); }
  });

  // =====================================================================
  // 主畫布：鐘面＋亮暗階梯格子圖
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W = 600, H = 420, L = null;
  function layout() {
    const lab = 0;
    if (W >= 640) {
      H = Math.round(Math.max(380, Math.min(500, W * 0.52)));
      const lw = Math.round(W * 0.5);
      const R = Math.max(90, Math.min(lw / 2 - 16, H / 2 - 16));
      L = { wide: true, cx: lw / 2, cy: H / 2, R: R, grid: { x: lw + 4, y: 12, w: W - lw - 16, h: H - 24 } };
    } else {
      const R = Math.max(80, Math.min(W / 2 - 12, 175));
      const clockH = 2 * R + 24 + lab;
      const gridH = Math.round(70 + 8 * 30 * Math.max(1, fs * 0.92));
      H = clockH + gridH;
      L = { wide: false, cx: W / 2, cy: 12 + R, R: R, grid: { x: 8, y: clockH, w: W - 16, h: gridH - 10 } };
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
  /** 音高 pc 在鐘面上的角度（C 在正上方，順時針） */
  const ang = function (pc) { return pc / 12 * TAU - Math.PI / 2; };
  function pt(pc, r) { const a = ang(pc); return { x: L.cx + r * Math.cos(a), y: L.cy + r * Math.sin(a) }; }
  const easeOut = function (u) { return 1 - Math.pow(1 - u, 3); };

  function drawClock(now) {
    const cx = L.cx, cy = L.cy, R = L.R, r0 = R * 0.72, rp = r0 - 16;
    // 錶盤：柔和陰影＋左上亮面
    ctx.save();
    ctx.shadowColor = D.shadowInk(D.dark ? 0.5 : 0.16); ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU);
    ctx.fillStyle = mix(C.surface, C['canvas-bg'], 0.35); ctx.fill();
    ctx.restore();
    // 12 格（環形扇區）
    const playingPc = state.play && state.play.idx >= 0 ? mod(A.tonic + state.play.list[state.play.idx], 12) : -1;
    for (let pc = 0; pc < 12; pc++) {
      const a0 = ang(pc - 0.5) + 0.012, a1 = ang(pc + 0.5) - 0.012;
      const inS = A.pcs.indexOf(pc) >= 0, isT = pc === A.tonic, black = [1, 3, 6, 8, 10].indexOf(pc) >= 0;
      ctx.beginPath(); ctx.arc(cx, cy, R - 2, a0, a1); ctx.arc(cx, cy, r0, a1, a0, true); ctx.closePath();
      let base = inS ? (isT ? C['sm-tonic'] : C['sm-poly']) : (black ? mix(C.surface, C.text, D.dark ? 0.22 : 0.12) : C.surface);
      const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, R);
      if (inS) { g.addColorStop(0, alpha(base, D.dark ? 0.34 : 0.22)); g.addColorStop(1, alpha(base, D.dark ? 0.55 : 0.4)); }
      else { g.addColorStop(0, alpha(base, 0.75)); g.addColorStop(1, alpha(base, 1)); }
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = alpha(C.text, inS ? 0.18 : 0.1); ctx.lineWidth = 1; ctx.stroke();
      if (pc === playingPc || (state.flash && state.flash.pc === pc && now - state.flash.t0 < 450)) {
        ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = alpha(C.accent, 0.5); ctx.fill(); ctx.restore();
      }
      const q = pt(pc, (R + r0) / 2);
      D.haloText(ctx, pcName(pc), q.x, q.y, inS ? (isT ? C['sm-tonic'] : C.text) : alpha(C.muted, 0.9), 'center', 'middle', fnt(inS ? 13.5 : 12, inS ? 700 : 500));
    }
    // 外框亮邊
    const gl = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
    gl.addColorStop(0, alpha('#ffffff', D.dark ? 0.06 : 0.4)); gl.addColorStop(0.7, alpha('#ffffff', 0)); gl.addColorStop(1, D.shadowInk(D.dark ? 0.12 : 0.04));
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fillStyle = gl; ctx.fill();
    ctx.strokeStyle = alpha(C.text, D.dark ? 0.28 : 0.22); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r0, 0, TAU); ctx.strokeStyle = alpha(C.text, 0.14); ctx.lineWidth = 1; ctx.stroke();
    // 內圈：12 個小刻度
    for (let pc = 0; pc < 12; pc++) { const q = pt(pc, rp); ctx.beginPath(); ctx.arc(q.x, q.y, 1.6, 0, TAU); ctx.fillStyle = alpha(C.muted, 0.45); ctx.fill(); }
    // 記住的音階（虛線多邊形）
    if (A.ref && A.ref.pcs.length >= 2) {
      ctx.save();
      ctx.beginPath();
      A.ref.pcs.forEach(function (pc, i) { const q = pt(pc, rp + 6); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
      ctx.closePath();
      ctx.setLineDash([6, 5]); ctx.strokeStyle = alpha(C['sm-ref'], 0.9); ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
    // 音階多邊形
    const P = A.pcs.map(function (pc) { return pt(pc, rp); });
    const ord = A.semis.map(function (s) { return mod(A.tonic + s, 12); });   // 從主音開始的順序
    const Q = ord.map(function (pc) { return pt(pc, rp); });
    if (P.length >= 3) {
      ctx.beginPath(); Q.forEach(function (q, i) { if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); ctx.closePath();
      const pg = ctx.createRadialGradient(cx - rp * 0.3, cy - rp * 0.35, rp * 0.1, cx, cy, rp);
      pg.addColorStop(0, alpha(C['sm-poly'], D.dark ? 0.28 : 0.2)); pg.addColorStop(1, alpha(C['sm-poly'], D.dark ? 0.12 : 0.08));
      ctx.fillStyle = pg; ctx.fill();
    }
    // 邊：顏色依步伐，管狀線
    const n = Q.length;
    const pillBoxes = [];   // 步伐標籤佔的範圍（中央的名字要避開）
    if (n >= 2) {
      for (let i = 0; i < n; i++) {
        const a = Q[i], b = Q[(i + 1) % n], s = A.steps[i];
        D.tube(ctx, function (c) { c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }, stepColor(s), 4.2);
      }
      // 步伐標籤（太多邊時省略）
      if (n <= 8) {
        for (let i = 0; i < n; i++) {
          const a = Q[i], b = Q[(i + 1) % n], s = A.steps[i];
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = mx - cx, dy = my - cy, dl = Math.hypot(dx, dy) || 1;
          const off = Math.min(16 * fs, dl * 0.5);
          const pxx = mx - dx / dl * off, pyb = my - dy / dl * off + 8 * fs;
          D.pill(ctx, stepWord(s), pxx, pyb, stepColor(s), 'center', fnt(11, 700));
          ctx.font = fnt(11, 700);
          const pw = ctx.measureText(stepWord(s)).width + 12;
          pillBoxes.push({ x0: pxx - pw / 2, x1: pxx + pw / 2, y0: pyb - 18 * fs, y1: pyb });
        }
      }
    }
    // 亮暗階梯剛移動的音：從原來的位置到新位置的弧形箭頭
    if (state.moved) {
      const u = D.reducedMotion() ? 1 : Math.min(1, (now - state.moved.t0) / 600);
      const p0 = pt(state.moved.fromPc, rp + 2), p1 = pt(state.moved.toPc, rp + 2);
      ctx.save();
      ctx.globalAlpha = 0.95;
      const ghost = state.moved.fromPc;
      const gq = pt(ghost, rp);
      ctx.beginPath(); ctx.arc(gq.x, gq.y, 7, 0, TAU); ctx.setLineDash([3, 3]); ctx.strokeStyle = C['sm-low']; ctx.lineWidth = 1.6; ctx.stroke(); ctx.setLineDash([]);
      const e = easeOut(u);
      const mx = p0.x + (p1.x - p0.x) * e, my = p0.y + (p1.y - p0.y) * e;
      D.arrow(ctx, p0.x, p0.y, mx, my, C['sm-low'], 2.4);
      ctx.restore();
    }
    // 頂點
    ord.forEach(function (pc, i) {
      const q = Q[i], isT = i === 0, on = pc === playingPc;
      const isMoved = state.moved && state.moved.toPc === pc && i === state.moved.degree - 1;
      D.ball(ctx, q.x, q.y, isT ? 8 : on ? 7.5 : 6, isMoved ? C['sm-low'] : isT ? C['sm-tonic'] : C['sm-poly'], { glow: on ? 0.65 : (D.dark ? 0.3 : 0.08) });
      if (on && !D.reducedMotion() && state.play) D.ripple(ctx, q.x, q.y, 8, ((now / 1000 - 0) % state.play.dt) / state.play.dt, C.accent);
      // 級數寫在頂點內側
      const dx = q.x - cx, dy = q.y - cy, dl = Math.hypot(dx, dy) || 1;
      const lx = q.x - dx / dl * 17 * fs, ly = q.y - dy / dl * 17 * fs;
      const nt = A.notes[i];
      D.haloText(ctx, nt.degree, lx, ly, isMoved ? C['sm-low'] : isT ? C['sm-tonic'] : C.muted, 'center', 'middle', fnt(isT ? 12.5 : 11, 700));
    });
    if (A.n === 1) { const q = Q[0]; D.ball(ctx, q.x, q.y, 8, C['sm-tonic'], {}); }
    // 中央：名字與亮度
    const nm = A.mode ? A.tonicName + ' ' + mshort(A.mode) : A.idZh ? A.tonicName + ' ' + T(A.idZh, A.idEn) : T('自訂音階', 'Custom scale');
    const maxW = rp * 1.25;
    const nmY = cy - 7 * fs, subY = cy + 12 * fs;
    // 名字（與下面那行）不可以壓到步伐標籤：太寬就縮小字
    const hits = function (w, y, h) { return pillBoxes.some(function (b) { return b.x1 > cx - w / 2 - 3 && b.x0 < cx + w / 2 + 3 && b.y1 > y - h / 2 && b.y0 < y + h / 2; }); };
    let px = 15;
    ctx.font = fnt(px, 700);
    while (px > 9 && (ctx.measureText(nm).width > maxW || hits(ctx.measureText(nm).width, nmY, 16 * fs * px / 15))) { px -= 0.5; ctx.font = fnt(px, 700); }
    D.haloText(ctx, nm, cx, nmY, A.mode ? C.text : C['sm-a'], 'center', 'middle', fnt(px, 700));
    const sub = A.brightness != null ? T('亮度 ', 'brightness ') + sg(A.brightness, 0) : T(A.n + ' 個音', A.n + (A.n === 1 ? ' note' : ' notes'));
    let spx = 11.5;
    ctx.font = fnt(spx, 600);
    while (spx > 8.5 && hits(ctx.measureText(sub).width, subY, 13 * fs)) { spx -= 0.5; ctx.font = fnt(spx, 600); }
    D.haloText(ctx, sub, cx, subY, C.muted, 'center', 'middle', fnt(spx, 600));
  }

  /** 亮暗階梯的格子圖：七列（利底亞在上）× 12 欄（比主音高 0–11 個半音） */
  let gridRows = [];
  function drawGrid(now) {
    const g = L.grid;
    D.roundRect(ctx, g.x, g.y, g.w, g.h, 10);
    ctx.fillStyle = alpha(C.surface, D.dark ? 0.32 : 0.6); ctx.fill();
    ctx.strokeStyle = alpha(C.text, 0.08); ctx.lineWidth = 1; ctx.stroke();
    ctx.font = fnt(12.5, 700); ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(T('亮暗階梯（主音 ' + A.tonicName + '）', 'Brightness ladder (tonic ' + A.tonicName + ')'), g.x + 10, g.y + 8);
    const tw = SM.tower();
    const extra = A.mode ? 0 : 1;      // 目前的音階不是教會調式時，多畫一列「目前」
    const labW = Math.min(g.w * 0.34, Math.max(78, 92 * fs));
    const x0 = g.x + labW + 6, x1 = g.x + g.w - 10;
    const headY = g.y + 16 * fs + 14;
    const y0 = headY + 14 * fs + 6, y1 = g.y + g.h - 22 * fs - 4;
    const rows = 7 + extra, rh = (y1 - y0) / rows;
    const cw = (x1 - x0) / 12;
    // 欄的標頭：比主音高幾個半音
    let hpx = 10.5;
    ctx.font = fnt(hpx, 600);
    while (hpx > 7 && ctx.measureText('11').width > cw - 3) { hpx -= 0.5; ctx.font = fnt(hpx, 600); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let k = 0; k < 12; k++) { ctx.fillStyle = k === 0 ? C['sm-tonic'] : C.muted; ctx.fillText(String(k), x0 + (k + 0.5) * cw, headY + 6 * fs); }
    // 底部兩句說明：放得下就左右各一句，放不下就縮小字，再放不下只留左邊那句（紅點的意思下方圖例也有）
    const footL = T('↑ 比主音高幾個半音', '↑ semitones above the tonic'), footR = T('紅點：比上一列低半音', 'red: a half step lower than the row above');
    let fpx = 10.5, footBoth = false;
    for (; fpx >= 9; fpx -= 0.5) {
      ctx.font = fnt(fpx);
      if (ctx.measureText(footL).width + ctx.measureText(footR).width + 14 <= x1 - (g.x + 10)) { footBoth = true; break; }
    }
    if (!footBoth) fpx = 10.5;
    ctx.font = fnt(fpx); ctx.fillStyle = C.muted; ctx.textAlign = footBoth ? 'left' : 'right'; ctx.textBaseline = 'top';
    if (footBoth) ctx.fillText(footL, g.x + 10, y1 + 6); else ctx.fillText(footL, x1, y1 + 6);
    // 直的格線
    for (let k = 0; k <= 12; k++) { const x = Math.round(x0 + k * cw) + 0.5; ctx.beginPath(); ctx.moveTo(x, y0 - 2); ctx.lineTo(x, y1 + 2); ctx.strokeStyle = alpha(C.text, k === 0 || k === 12 ? 0.14 : 0.06); ctx.lineWidth = 1; ctx.stroke(); }
    gridRows = [];
    const curK = SM.BRIGHT_ORDER.indexOf(A.mode);
    const prevCenters = {};
    for (let r = 0; r < rows; r++) {
      const yc = y0 + (r + 0.5) * rh, isCur = r === curK || (extra && r === 7);
      const layer = r < 7 ? tw[r] : { id: null, semis: A.semis, moved: -1, bright: A.brightness };
      if (isCur) { D.roundRect(ctx, g.x + 4, yc - rh / 2 + 1, g.w - 8, rh - 2, 7); ctx.fillStyle = alpha(C.accent, D.dark ? 0.2 : 0.12); ctx.fill(); }
      if (r === 7) { ctx.beginPath(); ctx.moveTo(g.x + 8, yc - rh / 2); ctx.lineTo(g.x + g.w - 8, yc - rh / 2); ctx.setLineDash([3, 4]); ctx.strokeStyle = alpha(C.text, 0.25); ctx.stroke(); ctx.setLineDash([]); }
      gridRows.push({ id: layer.id, y0: yc - rh / 2, y1: yc + rh / 2 });
      // 列名
      const name = r < 7 ? mshort(layer.id) : T('目前', 'Current');
      const bt = layer.bright != null ? sg(layer.bright, 0) : '';
      ctx.font = fnt(10, 600);
      const room = x0 - 6 - (g.x + 10) - (bt ? ctx.measureText(bt).width + 6 : 0);
      let npx = 11.5;
      ctx.font = fnt(npx, isCur ? 700 : 600);
      while (npx > 8.5 && ctx.measureText(name).width > room) { npx -= 0.5; ctx.font = fnt(npx, isCur ? 700 : 600); }
      ctx.fillStyle = isCur ? C.text : C.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(name, g.x + 10, yc);
      ctx.font = fnt(10, 600); ctx.textAlign = 'right'; ctx.fillStyle = C.muted;
      if (bt) ctx.fillText(bt, x0 - 6, yc);
      // 點
      const rad = Math.max(3, Math.min(cw * 0.32, rh * 0.32));
      layer.semis.forEach(function (s, i) {
        const x = x0 + (s + 0.5) * cw;
        const lowered = r < 7 && i === layer.moved;
        if (lowered && r > 0) {
          // 從上一列的位置斜斜地挪過來（往左一格 = 降半音）
          const px = x0 + (s + 1.5) * cw, py = yc - rh;
          ctx.beginPath(); ctx.moveTo(px, py + rad); ctx.lineTo(x + rad * 0.4, yc - rad * 0.9);
          ctx.strokeStyle = alpha(C['sm-low'], 0.8); ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.stroke();
        }
        const col = lowered ? C['sm-low'] : i === 0 ? C['sm-tonic'] : (isCur ? C['sm-poly'] : mix(C['sm-poly'], C.muted, 0.45));
        D.ball(ctx, x, yc, isCur ? rad * 1.08 : rad, col, { glow: 0, shadow: isCur });
      });
      prevCenters[r] = yc;
    }
    // 底部說明（右邊那句，放得下才畫）
    if (footBoth) {
      ctx.font = fnt(fpx); ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(footR, x1, y1 + 6);
    }
  }
  function draw(now) {
    D.backdrop(ctx, W, H);
    drawClock(now);
    drawGrid(now);
  }

  // 點畫布：鐘面的格子 → 加入或移出音；階梯的列 → 換調式
  cv.addEventListener('click', function (e) {
    if (!L) return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const dx = x - L.cx, dy = y - L.cy, d = Math.hypot(dx, dy);
    if (d <= L.R + 4 && d >= L.R * 0.45) {
      let a = Math.atan2(dy, dx) + Math.PI / 2;
      const pc = mod(Math.round(a / TAU * 12), 12);
      const m = 60 + pc;
      if (togglePc(pc, 'clock')) tapTone(m); else tapTone(m);
      return;
    }
    const g = L.grid;
    if (x >= g.x && x <= g.x + g.w) {
      const row = gridRows.filter(function (q) { return q.id && y >= q.y0 && y < q.y1; })[0];
      if (row) { const b = document.querySelector('[data-ladder="' + row.id + '"]'); if (b) b.click(); }
    }
  });

  function updateCanvasLabels() {
    cv.setAttribute('aria-label', T('鐘面：' + scaleName() + '，音是 ' + A.names.join(' ') + '，步伐 ' + stepsText(A.steps) + '。旁邊（手機在下面）是主音 ' + A.tonicName + ' 的亮暗階梯：七個調式由亮到暗，每一列只比上一列低一個音。也可以用下方的鍵盤選音。',
      'Clock: ' + scaleName() + ', notes ' + A.names.join(' ') + ', steps ' + stepsText(A.steps) + '. Beside it (below on phones): the brightness ladder on ' + A.tonicName + ', seven modes from bright to dark, each row one note lower than the row above. The keyboard below can also pick notes.'));
  }

  // ---------- 動畫迴圈 ----------
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    const now = performance.now();
    let more = false;
    if (state.play && seq) {
      const el = seq.elapsed();
      if (el >= state.play.total) { stopPlay(); }
      else {
        more = true;
        const idx = el < 0 ? -1 : Math.min(state.play.list.length - 1, Math.floor(el / state.play.dt));
        if (idx !== state.play.idx) {
          state.play.idx = idx;
          renderTable();
          updateKeysOn(idx >= 0 ? state.play.list[idx] : -1);
          if (view3 && view3.active) view3.rebuild();
        }
      }
    }
    if (state.moved && now - state.moved.t0 < 700 && !D.reducedMotion()) more = true;
    if (state.flash && now - state.flash.t0 < 500) more = true;
    if (!view3 || !view3.active) draw(now);
    if (view3 && view3.active) view3.frame();
    if (more) requestDraw();
  }

  // =====================================================================
  // 3D：切換到 3D 時才載入 js/scales-modes-3d.js 與 three.js
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    SM: SM, T: T, D: D,
    colors: function () { return C; },
    fs: function () { return fs; },
    data: function () {
      return { a: A, playing: state.play && state.play.idx >= 0 ? mod(A.tonic + state.play.list[state.play.idx], 12) : -1, moved: state.moved };
    },
    pcName: pcName, mshort: mshort, scaleName: scaleName, sg: sg,
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 鐘面。', 'The 3D graphics context was lost, so the view switched back to the 2D clock.');
    }
  };
  function rebuild3D() { if (view3 && view3.active) view3.rebuild(); }
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.ScalesModes3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.ScalesModes3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/scales-modes-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.ScalesModes3D) throw new Error('scales-modes-3d.js did not load');
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
        view3 = window.ScalesModes3D.create(lib, host3, bridge);
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
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 鐘面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D clock is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ---------- 分享目前設定：自訂的音與記住的音階（主音、音階、方向、速度、音律由 classroom.js 記錄） ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { s: state.type === 'custom' ? state.semis.slice() : null, r: state.ref ? { t: state.ref.tonicName, s: state.ref.semis.slice(), y: state.ref.type } : null }; },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o.s)) { state.semis = SM.normSemis(o.s.map(Number).filter(isFinite)); state.type = 'custom'; }
      if (o.r && Array.isArray(o.r.s) && SM.tonicByName(o.r.t)) state.ref = { tonicName: o.r.t, semis: SM.normSemis(o.r.s.map(Number).filter(isFinite)), type: SM.scaleById(o.r.y) ? o.r.y : 'custom' };
      changed('share', null, true);
    }
  });

  // 給測試用的介面（不影響畫面）
  window.__sm = {
    state: state,
    analysis: function () { return A; },
    toggle: function (pc) { return togglePc(pc, 'test'); },
    view3: function () { return view3; }
  };

  // =====================================================================
  // 啟動（不發聲、不送任務事件）
  // =====================================================================
  readColors();
  (function initFromControls() {
    const t = SM.tonicByName($('tonic').value);
    if (t) state.tonicName = t.name;
    const sc = $('scale').value;
    if (SM.scaleById(sc)) { state.type = sc; state.semis = SM.semisFromSteps(SM.scaleSteps(sc)); }
    state.dir = $('dir').value || 'up';
    document.querySelectorAll('[data-tune]').forEach(function (b) { if (b.getAttribute('aria-pressed') === 'true') state.tuning = b.dataset.tune; });
  })();
  readTempo();
  piano.setAttribute('data-share-skip', '');
  $('ladder').setAttribute('data-share-skip', '');
  stepbar.setAttribute('data-share-skip', '');
  document.querySelector('.view-bar').setAttribute('data-share-skip', '');
  updateSoundButton();
  recompute();
  renderAll(false);
  updateStop();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    trackKey = '';
    renderAll(false);
    if (view3 && view3.active) view3.onTheme();
    resize();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  resize();
})();
