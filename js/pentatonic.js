/* pentatonic.js — 「五聲音階：宮商角徵羽」的畫面與互動
 * （數學在 pentatonic-core.js；聲音一律用 music-audio.js；2D 繪圖工具 LabDraw 在 drawkit.js；3D 在 pentatonic-3d.js，切到 3D 時才載入）
 *
 * 畫面：主畫布左邊（手機在上）是 12 格鐘面（C 在正上方、順時針；可切成五度順序），音階的音連成五邊形，邊上寫步伐；
 *       鐘面外圈的小圓標是三分損益產生的順序（1、2、3…），裡面的虛線把它們照產生的順序連起來。
 *       右邊（手機在下）是三分損益的弦：照產生的順序排列，高度 ∝ 弦長，相鄰兩根之間標 × 2/3（損）或 × 4/3（益）；點一根弦會發聲並抖動。
 *       畫布下面是 HTML 的步伐條（寬度 ∝ 半音數，換調式時整條滑動）與鍵盤（點鍵把音加進或移出音階）。
 * 聲音：只有學生按「▶ 播放」、點步伐條、點弦、點鍵盤或鐘面時才發聲；音效關閉時畫面照跑，狀態列顯示提示並讓音效開關閃一下。
 * 任務事件：'scale'、'gen'、'play'、'step'、'tap'（見 js/missions/pentatonic.js 開頭）；資料由 PentatonicCore.eventData 產生。 */
(function () {
  'use strict';
  const P = window.PentatonicCore;
  const D = window.LabDraw;
  const AU = window.MusicAudio;
  const MT = window.MusicTheory;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha, mix = D.mix;
  const mod = P.mod;
  const TAU = Math.PI * 2;
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const GAIN = 0.42;
  const ROLE_EN = { '宮': 'gong', '商': 'shang', '角': 'jue', '徵': 'zhi', '羽': 'yu', '變宮': 'biangong', '變徵': 'bianzhi' };
  const roleT = function (zh) { return zh ? T(zh, ROLE_EN[zh] || zh) : ''; };
  const MODE_EN = { gong: 'gong', shang: 'shang', jue: 'jue', zhi: 'zhi', yu: 'yu' };
  const modeName = function (k) { return k >= 0 ? T(P.MODES[k].zh, MODE_EN[P.MODES[k].id] + ' mode') : ''; };
  const SEVEN_NAME = { ya: ['雅樂音階', 'yayue scale'], qing: ['清樂音階', 'qingyue scale'], yan: ['燕樂音階', 'yanyue scale'] };

  /** 近似的撥弦音色：6 個泛音，越高的越弱、消失得越快 */
  function pluckModes(f0) {
    const A = [1, 0.55, 0.34, 0.22, 0.14, 0.09];
    return A.map(function (a, i) { const k = i + 1; return { f: k * f0, a: a, tau: 1.15 / Math.pow(k, 0.8) }; });
  }
  function pluck(f0, at, dur) { return AU.modal({ modes: pluckModes(f0), gain: GAIN, at: at, dur: dur || 1.8, attack: 0.006 }); }

  // ---------- 狀態 ----------
  const state = {
    tonicName: 'C', type: 'gong', semis: P.modeSemis(0),
    tuning: 'pyth', order: 'sun', L0: 81, gen: 5, walk: -1,
    arr: 'chrom', arrFrom: 'chrom', arrT0: 0,
    content: 'up', tempo: 120, seed: 1 + Math.floor(Math.random() * 1e6),
    lastGong: 0, lastGongName: 'C', lastString: -1, pair: null,
    play: null, stepOn: null, flash: null, strFlash: null, grow: null,
    offHintShown: false
  };
  let A = null, C = null, MEL = null;
  function recompute() {
    A = P.analyze(state.tonicName, state.semis, state.type, { tuning: state.tuning, order: state.order, L0: state.L0 });
    if (A.k >= 0) { state.lastGong = A.gongPc; state.lastGongName = A.gongName; }
    C = P.chain(state.gen, state.order, state.L0);
    MEL = P.melody(state.seed, A.n);
  }
  const tonicObj = function () { return P.tonicByName(state.tonicName) || P.TONICS[0]; };
  const chainGong = function () { return A.k >= 0 ? A.gongPc : state.lastGong; };
  /** 三分損益的第 q 個音的音名（照宮的拼法往五度方向推：每一個五度字母往後 4 個） */
  function chainName(x) {
    const gName = A.k >= 0 ? A.gongName : state.lastGongName;
    const gL = P.LETTERS.indexOf(gName.charAt(0));
    const pc = mod(chainGong() + x.pcG, 12), L = mod(gL + 4 * x.q, 7);
    const acc = mod(pc - P.LETTER_PC[L] + 6, 12) - 6;
    return P.LETTERS[L] + P.accText(acc);
  }
  /** 宮的頻率：讓主音落在 C4–B4 的十二平均律頻率上；弦的頻率 = 宮的頻率 × 3^q × 2^b */
  function gongFreq() {
    if (A.k >= 0) { const w = P.windowExp(P.ROLES[A.k].fifth, state.order); return P.tonicFreq(A.tonic) / (Math.pow(3, w[0]) * Math.pow(2, w[1])); }
    return MT.midiToFreq(P.TONIC_MIDI0 + state.lastGong);
  }
  const stringFreq = function (x) { return gongFreq() * Math.pow(3, x.q) * Math.pow(2, x.b); };
  /** 主音在三分損益裡是第幾個產生的（宮 0、徵 1、商 2、羽 3、角 4）；不是五聲傳回 −1 */
  const tonicChainIdx = function () { return A.k >= 0 ? P.ROLES[A.k].fifth : -1; };

  // ---------- 色彩與字體 ----------
  let Cc = {}, fs = 1;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'pt-w', 'pt-m3', 'pt-h', 'pt-a', 'pt-tonic', 'pt-gong', 'pt-poly', 'pt-sun', 'pt-yi', 'pt-extra', 'pt-wood']
      .forEach(function (k) { Cc[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    fs = Math.max(1, Math.min(1.45, parseFloat(cs.getPropertyValue('--fs')) || 1));
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + (px * fs).toFixed(1) + 'px ' + FONT; }
  const stepColor = function (s) { return s === 1 ? Cc['pt-h'] : s === 2 ? Cc['pt-w'] : s === 3 ? Cc['pt-m3'] : Cc['pt-a']; };
  const stepCls = function (s) { return s === 1 ? 'h' : s === 2 ? 'w' : s === 3 ? 'm' : 'a'; };
  const stepWord = function (s) { return s === 1 ? T('半', 'H') : s === 2 ? T('全', 'M2') : s === 3 ? T('小三', 'm3') : String(s); };
  const stepLong = function (s) { return s === 1 ? T('半音', 'half step') : s === 2 ? T('大二度', 'major second') : s === 3 ? T('小三度', 'minor third') : s === 4 ? T('大三度', 'major third') : T(s + ' 個半音', s + ' semitones'); };

  // ---------- 數字與文字 ----------
  function fx(v, d) { if (v == null || !isFinite(v)) return '—'; let s = v.toFixed(d); if (/^-0(\.0+)?$/.test(s)) s = s.slice(1); return s.replace('-', '−'); }
  function sg(v, d) { if (v == null || !isFinite(v)) return '—'; const s = Math.abs(v).toFixed(d); if (+s === 0) return (0).toFixed(d); return (v < 0 ? '−' : '+') + s; }
  /** 弦長：整數就寫整數，否則最多兩位小數 */
  function fmtLen(v) { if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v)); return (Math.round(v * 100) / 100).toString(); }
  const esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  const list = function (arr) { return arr.join(T('、', ', ')); };
  function pcName(pc) {
    pc = mod(pc, 12);
    const n = A.notes.slice(0, A.n).filter(function (x) { return x.pc === pc; })[0];
    return n ? n.name : P.plainName(tonicObj(), pc);
  }
  function noteOfPc(pc) { return A.notes.slice(0, A.n).filter(function (x) { return x.pc === mod(pc, 12); })[0] || null; }
  function scaleName() {
    if (A.k >= 0) return A.tonicName + ' ' + modeName(A.k);
    return A.tonicName + T(' 自訂音階（' + A.n + ' 個音）', ' custom scale (' + A.n + (A.n === 1 ? ' note)' : ' notes)'));
  }
  function stepsText(steps) { return steps.map(stepWord).join(' '); }
  function chainRole(x) { return x.role ? roleT(x.role) : T('第 ' + (x.idx + 1) + ' 個', '#' + (x.idx + 1)); }

  // ---------- 任務事件 ----------
  function emit(type, extra) {
    if (window.LabShare && window.LabShare.restoring) return;
    if (window.LabMission) window.LabMission.emit(type, P.eventData(A, { chain: C, gongPc: chainGong(), arr: state.arr }, extra));
  }

  // =====================================================================
  // 改變音階
  // =====================================================================
  function changed(src, extra, quiet) {
    recompute();
    state.lastString = -1; state.pair = null;
    renderAll(src === 'mode' || src === 'tonic' || src === 'custom');
    if (!quiet) emit('scale', Object.assign({ src: src }, extra || {}));
    if (!quiet) say(scaleSentence());
  }
  function scaleSentence() {
    let s = scaleName() + T('：', ': ') + A.names.join(' ') + T('。步伐 ', '. Steps ') + A.steps.join(' ') + T('。', '.');
    if (A.k >= 0) s += T('宮是 ' + A.gongName + '。', ' Gong is ' + A.gongName + '.');
    else if (A.n === 5 && A.minStep >= 2) s += T('沒有半音，但不是五聲音階。', ' No half steps, but not a pentatonic scale.');
    else if (A.seven) s += T('以主音為宮，是' + SEVEN_NAME[A.seven][0] + '。', ' With the tonic as gong it is the ' + SEVEN_NAME[A.seven][1] + '.');
    return s;
  }
  document.querySelectorAll('[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () {
      const m = P.modeById(b.dataset.mode);
      if (!m) return;
      stopPlay();
      state.type = m.id;
      state.semis = P.modeSemis(m.k);
      changed('mode');
    });
  });
  $('tonic').addEventListener('change', function () {
    const t = P.tonicByName(this.value);
    if (!t || t.name === state.tonicName) return;
    stopPlay();
    state.tonicName = t.name;
    changed('tonic');
  });
  document.querySelectorAll('[data-arr]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.arr === state.arr) return;
      state.arrFrom = arrNow();
      state.arr = b.dataset.arr;
      state.arrT0 = performance.now();
      changed('arr');
    });
  });
  document.querySelectorAll('[data-tune]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.tune === state.tuning) return;
      stopPlay();
      state.tuning = b.dataset.tune;
      changed('tuning');
    });
  });
  /** 自訂：點鍵盤或鐘面 */
  function togglePc(pc) {
    pc = mod(pc, 12);
    const rel = mod(pc - A.tonic, 12);
    if (rel === 0) { say(T('主音一定在音階裡；要換主音請用「主音」選單。', 'The tonic always stays in the scale; use the “Tonic” menu to change it.')); return false; }
    stopPlay();
    const i = state.semis.indexOf(rel);
    if (i >= 0) state.semis = state.semis.filter(function (x) { return x !== rel; });
    else state.semis = P.normSemis(state.semis.concat([rel]));
    state.type = 'custom';
    changed('custom', { toggled: pc, added: i < 0 });
    return true;
  }
  function soundCheck() {
    if (AU.enabled()) return true;
    say(AU.offHint());
    AU.flashSoundButton();
    return false;
  }
  /** 單一個音（鍵盤、鐘面）：用目前的音律 */
  function tapTone(midi) {
    state.flash = { pc: mod(midi, 12), t0: performance.now() };
    requestDraw();
    if (!AU.enabled()) {
      if (!state.offHintShown) { state.offHintShown = true; setTimeout(function () { say(AU.offHint()); }, 60); AU.flashSoundButton(); }
      return;
    }
    pluck(freqOfRel(midi - (P.TONIC_MIDI0 + A.tonic)), null, 1.6);
  }
  /** 比主音高 rel 個半音的頻率（在音階裡就用音階的比值，不在就用平均律或以主音為準的五度相生） */
  function freqOfRel(rel) {
    const f0 = P.tonicFreq(A.tonic), oct = Math.floor(rel / 12), r = mod(rel, 12);
    const nt = A.notes.slice(0, A.n).filter(function (x) { return x.semis === r; })[0];
    if (nt) return nt.freq * Math.pow(2, oct);
    if (state.tuning === 'equal') return f0 * Math.pow(2, rel / 12);
    return f0 * MT.pythagoreanRatio(r) * Math.pow(2, oct);
  }

  // =====================================================================
  // 三分損益
  // =====================================================================
  function genChanged(src) {
    recompute();
    state.lastString = -1; state.pair = null;
    if (src === 'next' && !D.reducedMotion()) state.grow = { idx: C.gen - 1, t0: performance.now() };
    renderAll(false);
    emit('gen', { src: src, fromReset: state.walk >= 0 && state.walk === state.gen - 1 });
    say(genSentence(src));
  }
  function genSentence(src) {
    const x = C.notes[C.gen - 1], pv = C.notes[C.gen - 2];
    if (src === 'len') return T('宮的弦長 ' + state.L0 + '：', 'Gong length ' + state.L0 + ': ') + C.notes.map(function (y) { return fmtLen(y.len.value); }).join(T('、', ', ')) + (C.allInt ? T('，全部是整數。', ', all whole numbers.') : T('，不全是整數。', ', not all whole numbers.'));
    if (src === 'order') return state.order === 'sun' ? T('先損（《史記・律書》）：', 'Remove first (Shiji): ') + C.notes.map(function (y) { return fmtLen(y.len.value); }).join(' → ') : T('先益（《管子・地員》）：', 'Add first (Guanzi): ') + C.notes.map(function (y) { return fmtLen(y.len.value); }).join(' → ');
    if (C.gen === 1) return T('從頭：只有宮，弦長 ' + fmtLen(x.len.value) + '。按「下一步 ▶」用三分損益生下一個音。', 'Start over: only gong, length ' + fmtLen(x.len.value) + '. Press “Next ▶” to make the next note.');
    let s = T('第 ' + C.gen + ' 個音：' + chainRole(x) + '（' + chainName(x) + '），', 'Note ' + C.gen + ': ' + chainRole(x) + ' (' + chainName(x) + '), ') +
      fmtLen(pv.len.value) + (x.op === 'sun' ? ' × 2/3' : ' × 4/3') + ' = ' + fmtLen(x.len.value) +
      (x.op === 'sun' ? T('（三分損一）。', ' (remove a third).') : T('（三分益一）。', ' (add a third).'));
    if (C.gen === 6) s += T('第一次出現半音：只差 256/243。', ' The first half step appears: 256/243.');
    if (C.gen === 13) s += T('本來應該回到宮，卻差了 ' + fx(C.comma.len, 2) + '（' + fx(C.comma.cents, 2) + ' 音分）。', ' It should be gong again, but misses it by ' + fx(C.comma.len, 2) + ' (' + fx(C.comma.cents, 2) + ' cents).');
    return s;
  }
  $('genReset').addEventListener('click', function () { stopPlay(); state.gen = 1; state.walk = 0; genChanged('reset'); });
  $('genPrev').addEventListener('click', function () { if (state.gen <= 1) return; stopPlay(); state.gen--; state.walk = -1; genChanged('prev'); });
  $('genNext').addEventListener('click', function () { if (state.gen >= P.GEN_MAX) return; stopPlay(); state.gen++; if (state.walk >= 0) state.walk++; genChanged('next'); });
  document.querySelectorAll('[data-order]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.order === state.order) return;
      stopPlay();
      state.order = b.dataset.order;
      genChanged('order');
    });
  });
  const elL0 = $('L0'), elL0o = $('L0o');
  function readL0() { state.L0 = Math.max(9, Math.min(999, Math.round(val(elL0)))); elL0o.textContent = String(state.L0); }
  elL0.addEventListener('input', function () { readL0(); recompute(); state.lastString = -1; state.pair = null; renderAll(false); });
  elL0.addEventListener('change', function () { const before = C.L0; readL0(); if (before === state.L0 && C.L0 === state.L0) { genChanged('len'); return; } genChanged('len'); });

  /** 點一根弦：發聲、抖動、和上一根比較 */
  function tapString(idx) {
    const x = C.notes[idx];
    if (!x) return;
    const pv = state.lastString >= 0 ? C.notes[state.lastString] : null;
    const pr = pv && pv !== x ? P.pairInfo([pv.q, pv.b], [x.q, x.b]) : null;
    state.strFlash = { idx: idx, t0: performance.now() };
    if (AU.enabled()) pluck(stringFreq(x), null, 2.2);
    else if (!state.offHintShown) { state.offHintShown = true; say(AU.offHint()); AU.flashSoundButton(); }
    state.pair = pr ? { a: pv, b: x, p: pr.p, q: pr.q, cents: pr.cents } : null;
    emit('tap', { idx: idx, role: x.role, prevIdx: pv && pv !== x ? pv.idx : -1, pairP: pr ? pr.p : null, pairQ: pr ? pr.q : null, pairCents: pr ? pr.cents : null });
    state.lastString = idx;
    renderPair();
    requestDraw();
    if (!pr) say(chainRole(x) + T('（' + chainName(x) + '）：弦長 ' + fmtLen(x.len.value) + '，頻率 ' + fx(stringFreq(x), 1) + ' Hz。再點另一根弦就能比較。', ' (' + chainName(x) + '): length ' + fmtLen(x.len.value) + ', ' + fx(stringFreq(x), 1) + ' Hz. Tap another string to compare.'));
  }
  function renderPair() {
    const p = state.pair;
    if (!p) { setHTML('pairBox', ''); return; }
    const cents = p.cents, up = cents >= 0, ac = Math.abs(cents);
    // 最接近的純律音程（超過八度時，先扣掉整數個八度；剛好是八度的倍數就用「八度」）
    const k = Math.round(ac / 100);
    let kk = k % 12, oct = Math.floor(k / 12);
    if (kk === 0 && oct > 0) { kk = 12; oct -= 1; }
    const iv = MT.INTERVALS[kk];
    const diff = ac - (MT.cents(iv.ratio[0] / iv.ratio[1]) + 1200 * oct);
    let note = '';
    if (Math.abs(diff - MT.cents(MT.SYNTONIC_COMMA)) < 0.02) note = T('＝同音差 81/80', ' = the syntonic comma 81/80');
    else if (Math.abs(diff + MT.cents(MT.SYNTONIC_COMMA)) < 0.02) note = T('＝少一個同音差 81/80', ' = a syntonic comma (81/80) less');
    else if (Math.abs(diff) < 0.005) note = T('，和純律一樣', ', the same as just intonation');
    const ratioTxt = (up ? p.p + '/' + p.q : p.q + '/' + p.p);
    const lenTxt = fmtLen(p.a.len.value) + ' : ' + fmtLen(p.b.len.value);
    const name = T(iv.zh, iv.en);
    setHTML('pairBox', '<b>' + esc(chainRole(p.a)) + ' → ' + esc(chainRole(p.b)) + '</b>' + T('（' + (up ? '往上' : '往下') + '）', ' (' + (up ? 'up' : 'down') + ')') + '<br>' +
      T('弦長比 ', 'Lengths ') + lenTxt + T('，頻率比 ', ', frequency ratio ') + ratioTxt + ' = ' + fx(ac, 2) + T(' 音分', ' cents') + '<br>' +
      '<small>' + T('最接近的純律音程：', 'Nearest just interval: ') + esc(name) + ' ' + iv.ratio[0] + '/' + iv.ratio[1] + (oct ? T('（再加 ' + oct + ' 個八度）', ' (plus ' + oct + ' octave' + (oct > 1 ? 's' : '') + ')') : '') +
      T('，差 ', ', difference ') + sg(diff, 2) + T(' 音分', ' cents') + esc(note) + '</small>');
    say(chainRole(p.a) + ' → ' + chainRole(p.b) + T('：頻率比 ', ': ratio ') + ratioTxt + ', ' + fx(ac, 2) + T(' 音分；比純律', ' cents; ') + T(name + '（' + iv.ratio[0] + '/' + iv.ratio[1] + '）' + (diff >= 0 ? '寬 ' : '窄 ') + fx(Math.abs(diff), 2) + ' 音分。', (diff >= 0 ? 'wider' : 'narrower') + ' than the just ' + name.toLowerCase() + ' (' + iv.ratio[0] + '/' + iv.ratio[1] + ') by ' + fx(Math.abs(diff), 2) + ' cents.'));
  }

  // =====================================================================
  // 鍵盤（C4–C5）
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
  function badgeOf(nt) { return nt ? (nt.role >= 0 ? roleT(P.ROLES[nt.role].zh) : String(nt.i + 1)) : ''; }
  function renderPiano() {
    for (let m = 60; m <= 72; m++) {
      const b = keyEls[m], pc = mod(m, 12), inS = A.pcs.indexOf(pc) >= 0, nt = noteOfPc(pc);
      b.querySelector('.kn').textContent = pcName(pc);
      const bd = badgeOf(nt);
      b.querySelector('.kd').textContent = inS ? (bd.length > 2 ? bd.slice(0, 2) : bd) : '';
      b.classList.toggle('tonic', pc === A.tonic);
      b.classList.toggle('gong', A.k >= 0 && pc === A.gongPc);
      b.setAttribute('aria-pressed', String(inS));
      b.setAttribute('aria-label', pcName(pc) + (inS && nt ? (nt.role >= 0 ? T('，' + P.ROLES[nt.role].zh, ', ' + P.ROLES[nt.role].en) : T('，第 ' + (nt.i + 1) + ' 個音', ', note ' + (nt.i + 1))) : T('，不在音階裡', ', not in the scale')) +
        (pc === A.tonic ? T('（主音）', ' (tonic)') : T('。按一下' + (inS ? '移出' : '加入') + '音階', '. Press to ' + (inS ? 'remove it from' : 'add it to') + ' the scale')));
    }
  }
  piano.addEventListener('click', function (e) {
    const key = e.target.closest('.key');
    if (!key) return;
    const m = +key.dataset.midi;
    togglePc(m);
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
  track.addEventListener('transitionend', function () { if (trackPos !== trackOff) placeTrack(trackOff, false); });
  function renderStepbar(animate) {
    const pent = A.k >= 0, base = pent ? P.GONG_STEPS : A.steps, rot = pent ? A.k : 0;
    const key = (pent ? 'pent' : 'x:' + A.steps.join(',')) + '|' + T('zh', 'en');
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
      let best = c;
      [c - 12, c + 12].forEach(function (x) { if (x >= -11 && x <= 11 && Math.abs(x - trackPos) < Math.abs(best - trackPos)) best = x; });
      trackOff = c;
      if (best !== trackPos) placeTrack(best, true); else placeTrack(c, false);
    }
    let h = '';
    for (let i = 0; i <= A.n; i++) {
      const x = (1 + A.notes[i].semis) / 14 * 100;
      const lab = A.k >= 0 ? roleT(A.notes[i].roleZh) : A.notes[i].name;
      h += '<span class="' + (i === 0 || i === A.n ? 't' : '') + '" style="left:' + x + '%">' + esc(A.k >= 0 ? A.notes[i].name + ' ' + lab : lab) + '</span>';
    }
    stepNames.innerHTML = h;
    $('stepSeq').textContent = A.steps.join(' ') + T('（半音）', ' (semitones)');
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
    const r = hi.ratio.value / lo.ratio.value, cents = 1200 * Math.log2(r);
    if (AU.enabled()) {
      const at = AU.now() + 0.03;
      pluck(lo.freq, at, 0.5);
      pluck(hi.freq, at + 0.48, 1.2);
    } else soundCheck();
    requestDraw();
    emit('step', { i: i, size: s, stepCents: cents });
    let rt = '';
    if (lo.ratio.p != null && hi.ratio.p != null) rt = ratioText(lo, hi) + T('，', ', ');
    say(lo.name + '–' + hi.name + T('：' + stepLong(s) + '，' + rt + fx(cents, 2) + ' 音分。', ': ' + stepLong(s) + ', ' + rt + fx(cents, 2) + ' cents.'));
    setTimeout(function () { if (state.stepOn && state.stepOn.i === i && performance.now() - state.stepOn.t0 > 1100) { state.stepOn = null; renderStepOn(); requestDraw(); } }, 1200);
  }
  /** 兩個音（五度相生）之間的比值，約分後的分數 */
  function ratioText(lo, hi) {
    const p = hi.ratio.p * lo.ratio.q, q = hi.ratio.q * lo.ratio.p;
    const g = MT.gcd(p, q);
    return (p / g) + '/' + (q / g);
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
    if (A.k >= 0) {
      const spNotes = P.spellPent(tonicObj(), A.k).notes;
      const sys = [0, 1, 2, 3, 4].map(function (j) {
        const sp = spNotes.filter(function (x) { return x.role === j; })[0];
        return sp.name + ' ' + modeName(j);
      });
      sub = T('宮是 ' + A.gongName + '。同一組音的五種調式：' + sys.join('、') + '。', 'Gong is ' + A.gongName + '. The same five notes give: ' + sys.join(', ') + '.');
    } else if (A.n === 5 && A.minStep >= 2) sub = T('沒有半音，但不是五聲音階：步伐 ' + A.steps.join(' ') + '，有一步特別寬。', 'No half steps, but not a pentatonic scale: steps ' + A.steps.join(' ') + ', one gap is extra wide.');
    else if (A.n === 6 && A.minStep >= 2) sub = T('全音音階：沒有半音的六聲音階只有這一種。', 'Whole-tone scale: the only six-note scale without half steps.');
    else if (A.n === 7 && A.sevenGongs.length) {
      sub = A.sevenGongs.map(function (g) { return T('以 ' + pcName(g.pc) + ' 為宮是' + SEVEN_NAME[g.id][0], 'with ' + pcName(g.pc) + ' as gong: ' + SEVEN_NAME[g.id][1]); }).join(T('；', '; ')) + T('。', '.');
      if (A.seven) sub = T('主音當宮：', 'Tonic as gong: ') + T(SEVEN_NAME[A.seven][0], SEVEN_NAME[A.seven][1]) + T('。', '. ') + sub;
    } else sub = T('不是五聲音階', 'Not a pentatonic scale') + (A.semitones ? T('：有 ' + A.semitones + ' 個半音。', ': it has ' + A.semitones + ' half step' + (A.semitones > 1 ? 's' : '') + '.') : T('。', '.'));
    setHTML('idbox', '<div class="nm">' + esc(scaleName()) + '</div><div class="sub">' + esc(sub) + '</div>');
    const keys = A.white ? T('全是白鍵', 'all white keys') : A.black ? T('全是黑鍵', 'all black keys') : T('有黑有白', 'black and white');
    let h = '<dt>' + T('步伐（半音）', 'Steps (semitones)') + '</dt><dd>' + esc(A.steps.join(' ')) + '</dd>' +
      '<dt>' + T('宮', 'Gong') + '</dt><dd>' + (A.k >= 0 ? esc(A.gongName) : '—') + '</dd>' +
      '<dt>' + T('亮度（五度鏈）', 'Brightness (fifths)') + '</dt><dd>' + (A.brightness == null ? '—' : sg(A.brightness, 0)) + '</dd>' +
      '<dt>' + T('音的個數', 'Number of notes') + '</dt><dd>' + A.n + '</dd>' +
      '<dt>' + T('步伐的種類', 'Kinds of steps') + '</dt><dd>' + A.stepKinds.length + ' <small>(' + A.stepKinds.join(', ') + ')</small></dd>' +
      '<dt>' + T('半音', 'Half steps') + '</dt><dd>' + (A.semitones ? '<span class="x-txt">' + A.semitones + '</span>' : '0') + '</dd>' +
      '<dt>' + T('三全音（增四度）', 'Tritones') + '</dt><dd>' + A.tritones + '</dd>' +
      '<dt>' + T('最大均勻', 'Maximally even') + '</dt><dd>' + yes(A.maxEven) + '</dd>' +
      '<dt>' + T('鍵盤', 'Keys') + '</dt><dd>' + keys + '</dd>';
    setHTML('readout', h);
    setHTML('ivTable', '<thead><tr>' + [1, 2, 3, 4, 5, 6].map(function (k) { return '<th scope="col">' + T(k + ' 個半音', k + ' st') + '</th>'; }).join('') + '</tr></thead><tbody><tr>' +
      A.iv.map(function (v) { return '<td>' + v + '</td>'; }).join('') + '</tr></tbody>');
  }
  function renderTable() {
    const pyth = state.tuning === 'pyth';
    let h = '<thead><tr><th>' + T('名', 'Name') + '</th><th>' + T('音名', 'Note') + '</th><th>' + T('唱名', 'Solfa') + '</th><th>' + T('弦長', 'Length') + '</th><th>' + T('頻率（Hz）', 'Freq. (Hz)') + '</th><th>' +
      T('和主音的比', 'Ratio') + '</th><th>' + T('音分', 'Cents') + '</th>' + (pyth ? '<th>' + T('和平均律差', 'vs equal') + '</th>' : '') + '</tr></thead><tbody>';
    const playingSemis = state.play && state.play.idx >= 0 ? state.play.list[state.play.idx].semis : null;
    A.notes.forEach(function (x, i) {
      const r = x.ratio;
      const rt = r.p != null ? r.p + '/' + r.q : (r.et % 12 === 0 ? String(Math.pow(2, r.et / 12)) : '2<sup>' + r.et + '/12</sup>');
      const nm = x.role >= 0 ? roleT(x.roleZh) : String(i % A.n + 1);
      const isG = A.k >= 0 && x.role === 0;
      const lenTxt = fmtLen(x.len.value) + (x.len.d != null && x.len.d !== 1 && x.len.d <= 729 ? ' <small>(' + x.len.n + '/' + x.len.d + ')</small>' : '');
      h += '<tr' + (playingSemis != null && mod(playingSemis, 12) === mod(x.semis, 12) && (playingSemis === x.semis || i < A.n) ? ' class="on"' : '') + '><td class="' + (i === 0 || i === A.n ? 't' : isG ? 'g' : '') + '">' + esc(nm) + '</td><td>' + esc(x.nameOct) + '</td><td>' + esc(x.solf) + '</td><td>' + lenTxt +
        '</td><td>' + fx(x.freq, 2) + '</td><td>' + rt + '</td><td>' + fx(r.cents, 1) + '</td>' + (pyth ? '<td>' + sg(x.dev, 2) + '</td>' : '') + '</tr>';
    });
    setHTML('noteTable', h + '</tbody>');
    setHTML('tableHint', pyth
      ? T('五度相生（三分損益）：比值都是 3 的次方乘 2 的次方。弦長以宮 = ' + state.L0 + ' 計算；最後一欄是和十二平均律差幾音分。', 'Fifths (the rule): every ratio is a power of 3 times a power of 2. Lengths take gong = ' + state.L0 + '; the last column is the difference from equal temperament in cents.')
      : T('十二平均律：每個半音都是 2<sup>1/12</sup>（弦長也一樣，宮 = ' + state.L0 + '）。主音的頻率用 A4 = 440 Hz 的十二平均律。', 'Equal temperament: every semitone is 2<sup>1/12</sup> (lengths too, with gong = ' + state.L0 + '). The tonic uses its equal-tempered frequency with A4 = 440 Hz.'));
  }
  function renderGen() {
    let h = '';
    C.notes.forEach(function (x, i) {
      const xx = x.idx >= 5 ? ' class="x"' : '';
      if (i) h += ' <span class="' + (x.op === 'sun' ? 's' : 'y') + '">' + (x.op === 'sun' ? T('損 ×2/3', '×2/3') : T('益 ×4/3', '×4/3')) + '</span> ';
      h += '<b' + xx + '>' + esc(chainRole(x)) + ' ' + fmtLen(x.len.value) + '</b>';
    });
    setHTML('chainLine', h);
    const kinds = C.kinds.map(function (k) { return k.p + '/' + k.q + ' ×' + k.count; }).join(T('、', ', '));
    const minC = C.minCents;
    let minTxt = '—';
    if (minC != null) {
      const kind = minC < 50 ? T('音差', 'comma') : minC < 150 ? T('半音', 'half step') : minC < 250 ? T('全音', 'whole step') : minC < 350 ? T('小三度', 'minor third') : T('大跳', 'large gap');
      minTxt = (minC < 150 ? '<span class="x-txt">' + kind + '</span>' : kind) + ' <small>(' + fx(minC, 2) + T(' 音分', ' c') + ')</small>';
    }
    const need = P.minIntegerL0(C.gen);
    let g = '<dt>' + T('已產生', 'Notes made') + '</dt><dd>' + C.gen + T(' 個音', C.gen === 1 ? ' note' : ' notes') + '</dd>' +
      '<dt>' + T('步伐（由低到高）', 'Steps (low to high)') + '</dt><dd>' + (C.gen > 1 ? kinds + ' <small>' + T('（' + C.kinds.length + ' 種）', '(' + C.kinds.length + ' kinds)') + '</small>' : '—') + '</dd>' +
      '<dt>' + T('最小間隔', 'Smallest gap') + '</dt><dd>' + (C.gen > 1 ? minTxt : '—') + '</dd>' +
      '<dt>' + T('弦長都是整數', 'All whole numbers') + '</dt><dd>' + yes(C.allInt) + (need <= 999 ? ' <small>' + T('（宮要是 ' + need + ' 的倍數）', '(gong must be a multiple of ' + need + ')') + '</small>' : ' <small>' + T('（宮要是 ' + need + ' 的倍數）', '(needs a multiple of ' + need + ')') + '</small>') + '</dd>';
    if (C.comma) g += '<dt>' + T('第 13 個和宮差', '13th vs gong') + '</dt><dd><span class="x-txt">' + fx(C.comma.len, 3) + '</span> <small>(' + fx(C.comma.cents, 2) + T(' 音分', ' cents') + ')</small></dd>';
    setHTML('genOut', g);
    $('genPrev').disabled = C.gen <= 1;
    $('genNext').disabled = C.gen >= P.GEN_MAX;
  }
  function renderMelody() {
    if (state.content !== 'melody') { setHTML('melody', ''); return; }
    const on = state.play && state.play.kind === 'melody' ? state.play.idx : -1;
    let h = '<span class="mcap">' + T('隨機旋律（4 小節，只用這個音階的音；按「換一段旋律」重新產生）', 'Random melody (4 bars, only notes of this scale; press “New melody” for another)') + '</span>';
    MEL.forEach(function (m, i) {
      const j = mod(m.d, A.n), nt = A.notes[j];
      const lab = A.k >= 0 ? roleT(nt.roleZh) : String(j + 1);
      const octMark = m.d < 0 ? T('低', 'low') : m.d >= A.n ? T('高', 'high') : '';
      h += '<span class="n' + (j === 0 ? ' t' : '') + (i === on ? ' on' : '') + '" style="min-width:' + (1.6 + m.beats * 0.8).toFixed(1) + 'em">' + esc(lab) + '<small>' + esc(nt.name + (octMark ? ' ' + octMark : '')) + '</small></span>';
    });
    setHTML('melody', h);
  }
  function renderSelects() {
    $('tonic').value = state.tonicName;
    document.querySelectorAll('[data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String(state.type === b.dataset.mode)); });
    document.querySelectorAll('[data-tune]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tune === state.tuning)); });
    document.querySelectorAll('[data-order]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.order === state.order)); });
    document.querySelectorAll('[data-arr]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.arr === state.arr)); });
    $('content').value = state.content;
  }
  function renderAll(animate) {
    renderSelects(); renderPiano(); renderStepbar(animate); renderReadout(); renderTable(); renderGen(); renderPair(); renderMelody();
    updateCanvasLabels(); rebuild3D(); requestDraw();
  }

  // =====================================================================
  // 播放（MusicAudio.sequencer 排程；音效關閉時時鐘照跑、畫面照樣同步）
  // =====================================================================
  $('content').addEventListener('change', function () { state.content = this.value; stopPlay(); renderMelody(); });
  $('newMelody').addEventListener('click', function () {
    stopPlay();
    state.seed = 1 + Math.floor(Math.random() * 1e6);
    MEL = P.melody(state.seed, A.n);
    if (state.content !== 'melody') { state.content = 'melody'; $('content').value = 'melody'; }
    renderMelody();
    say(T('換了一段新的隨機旋律（只用 ' + scaleName() + ' 的音）。按「▶ 播放」聽聽看。', 'A new random melody (only notes of ' + scaleName() + '). Press “▶ Play” to hear it.'));
  });
  const elTempo = $('tempo'), elTempoO = $('tempoO');
  function readTempo() { state.tempo = Math.max(60, Math.min(240, val(elTempo))); elTempoO.textContent = fx(state.tempo, 0); }
  elTempo.addEventListener('input', readTempo);
  elTempo.addEventListener('change', readTempo);

  /** 要播的音：[{ t（第幾拍開始）, beats, f, semis, pc, chainIdx, melIdx }] */
  function buildList() {
    const out = [];
    let t = 0;
    if (state.content === 'gen') {
      C.notes.forEach(function (x, i) {
        const beats = i === C.notes.length - 1 ? 2 : 1;
        out.push({ t: t, beats: beats, f: stringFreq(x), semis: null, pc: mod(chainGong() + x.pcG, 12), chainIdx: i });
        t += beats;
      });
    } else if (state.content === 'melody') {
      MEL.forEach(function (m, i) {
        const s = P.degreeSemis(A.semis, m.d);
        out.push({ t: t, beats: m.beats, f: freqOfRel(s), semis: s, pc: mod(A.tonic + s, 12), melIdx: i });
        t += m.beats;
      });
    } else {
      P.sequence(A.n, state.content).forEach(function (q) {
        const nt = A.notes[q.i];
        out.push({ t: t, beats: q.beats, f: nt.freq, semis: nt.semis, pc: nt.pc });
        t += q.beats;
      });
    }
    return { list: out, beats: t };
  }
  let seq = null;
  function startPlay() {
    stopPlay();
    const on = soundCheck();
    const b = buildList(), dt = 60 / state.tempo;
    const list = b.list;
    seq = !on ? silentClock(0.06) : AU.sequencer({
      tick: function (t0, t1, start) {
        if (!AU.enabled()) return;
        for (let j = 0; j < list.length; j++) {
          const at = start + list[j].t * dt;
          if (at >= t0 && at < t1) {
            const last = j === list.length - 1;
            pluck(list[j].f, at, last ? Math.max(1.2, list[j].beats * dt * 1.4) : list[j].beats * dt + 0.25);
          }
        }
      }
    });
    if (on) seq.begin(0.06);
    state.play = { list: list, dt: dt, total: b.beats * dt + 0.4, idx: -1, kind: state.content };
    updateStop(); requestDraw();
    emit('play', { content: state.content, tempo: state.tempo });
    if (on) {
      const what = state.content === 'gen' ? T('三分損益產生的 ' + C.gen + ' 個音（照產生的順序）', 'the ' + C.gen + ' notes of the rule, in the order they were made')
        : state.content === 'melody' ? T('隨機旋律', 'a random melody') : scaleName();
      say(T('播放：', 'Playing: ') + what + (state.content === 'gen' ? '' : T('（' + (state.tuning === 'equal' ? '十二平均律' : '五度相生') + '）', ' (' + (state.tuning === 'equal' ? 'equal temperament' : 'fifths') + ')')) + T('。', '.'));
    }
  }
  function silentClock(delay) {
    const t0 = performance.now() + delay * 1000;
    return { stop: function () {}, elapsed: function () { return (performance.now() - t0) / 1000; } };
  }
  function stopPlay() {
    if (seq) { seq.stop(); seq = null; }
    if (state.play) { state.play = null; AU.stopAll(0.06); renderTable(); renderMelody(); updateKeysOn(null); }
    updateStop();
  }
  $('play').addEventListener('click', startPlay);
  function busy() { return !!state.play; }
  function updateStop() { $('stop').disabled = !(AU.playing() || busy()); }
  $('stop').addEventListener('click', function () { stopPlay(); AU.stopAll(0.06); updateStop(); requestDraw(); say(T('已停止。', 'Stopped.')); });
  AU.onChange(updateStop);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && busy()) { stopPlay(); requestDraw(); } });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopPlay(); });
  function updateKeysOn(ev) {
    let midi = -1;
    if (ev) {
      if (ev.semis != null) midi = P.TONIC_MIDI0 + A.tonic + ev.semis;
      else midi = P.TONIC_MIDI0 + ev.pc;
    }
    for (let m = 60; m <= 72; m++) {
      const on = midi >= 0 && (midi >= 60 && midi <= 72 ? m === midi : mod(m, 12) === mod(midi, 12) && m < 72);
      keyEls[m].classList.toggle('on', on);
    }
  }
  function playingNow() { return state.play && state.play.idx >= 0 ? state.play.list[state.play.idx] : null; }

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
    if (ev.detail && ev.detail.name === 'sound') { stopPlay(); updateSoundButton(); updateStop(); requestDraw(); }
  });

  // =====================================================================
  // 主畫布：鐘面＋三分損益的弦
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W = 600, H = 420, L = null;
  function layout() {
    if (W >= 640) {
      H = Math.round(Math.max(400, Math.min(520, W * 0.5)));
      const lw = Math.round(W * 0.47);
      const R = Math.max(90, Math.min(lw / 2 - 30, H / 2 - 30));
      L = { wide: true, cx: lw / 2 + 4, cy: H / 2, R: R, chart: { x: lw + 8, y: 12, w: W - lw - 20, h: H - 24 } };
    } else {
      const R = Math.max(80, Math.min(W / 2 - 30, 158));
      const clockH = 2 * R + 64;
      const chartH = Math.round(250 + 60 * (fs - 1));
      H = clockH + chartH;
      L = { wide: false, cx: W / 2, cy: 32 + R, R: R, chart: { x: 8, y: clockH, w: W - 16, h: chartH - 10 } };
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
  const easeOut = function (u) { return 1 - Math.pow(1 - u, 3); };
  const ARR_MS = 650;
  function arrU(now) {
    if (D.reducedMotion()) return 1;
    return Math.min(1, ((now || performance.now()) - state.arrT0) / ARR_MS);
  }
  function arrNow() { return arrU() >= 1 ? state.arr : state.arr; }
  /** 音高 pc 在鐘面上的位置（以格為單位，0 = 正上方，順時針）；排列切換時平滑移動 */
  function cellOf(pc, arr) { return arr === 'fifths' ? mod(7 * pc, 12) : mod(pc, 12); }
  function cellPos(pc, now) {
    const a1 = cellOf(pc, state.arr), a0 = cellOf(pc, state.arrFrom);
    const u = easeOut(arrU(now));
    if (u >= 1 || a0 === a1) return a1;
    let d = a1 - a0; if (d > 6) d -= 12; if (d < -6) d += 12;
    return a0 + d * u;
  }
  const angOfCell = function (c) { return c / 12 * TAU - Math.PI / 2; };
  function pt(pc, r, now) { const a = angOfCell(cellPos(pc, now)); return { x: L.cx + r * Math.cos(a), y: L.cy + r * Math.sin(a) }; }

  function drawClock(now) {
    const cx = L.cx, cy = L.cy, R = L.R, r0 = R * 0.72, rp = r0 - 16;
    ctx.save();
    ctx.shadowColor = D.shadowInk(D.dark ? 0.5 : 0.16); ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU);
    ctx.fillStyle = mix(Cc.surface, Cc['canvas-bg'], 0.35); ctx.fill();
    ctx.restore();
    const pl = playingNow();
    const playingPc = pl ? pl.pc : -1;
    // 五度順序時：五聲音階的五格連成一段弧（底下淡淡的帶子）
    if (state.arr === 'fifths' && A.k >= 0 && arrU(now) >= 1) {
      const cs = A.pcs.map(function (pc) { return cellOf(pc, 'fifths'); });
      // 找連續五格的起點
      let start = cs[0];
      for (let i = 0; i < 12; i++) { if (cs.every(function (c) { return mod(c - i, 12) < 5; })) { start = i; break; } }
      ctx.beginPath(); ctx.arc(cx, cy, R + 6, angOfCell(start - 0.5), angOfCell(start + 4.5));
      ctx.strokeStyle = alpha(Cc['pt-gong'], D.dark ? 0.55 : 0.45); ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke();
    }
    for (let pc = 0; pc < 12; pc++) {
      const c = cellPos(pc, now);
      const a0 = angOfCell(c - 0.5) + 0.012, a1 = angOfCell(c + 0.5) - 0.012;
      const inS = A.pcs.indexOf(pc) >= 0, isT = pc === A.tonic, black = P.BLACK.indexOf(pc) >= 0;
      const isG = A.k >= 0 && pc === A.gongPc;
      ctx.beginPath(); ctx.arc(cx, cy, R - 2, a0, a1); ctx.arc(cx, cy, r0, a1, a0, true); ctx.closePath();
      const base = inS ? (isT ? Cc['pt-tonic'] : isG ? Cc['pt-gong'] : Cc['pt-poly']) : (black ? mix(Cc.surface, Cc.text, D.dark ? 0.22 : 0.12) : Cc.surface);
      const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, R);
      if (inS) { g.addColorStop(0, alpha(base, D.dark ? 0.34 : 0.22)); g.addColorStop(1, alpha(base, D.dark ? 0.55 : 0.4)); }
      else { g.addColorStop(0, alpha(base, 0.75)); g.addColorStop(1, alpha(base, 1)); }
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = alpha(Cc.text, inS ? 0.18 : 0.1); ctx.lineWidth = 1; ctx.stroke();
      if (pc === playingPc || (state.flash && state.flash.pc === pc && now - state.flash.t0 < 450)) {
        ctx.save(); ctx.fillStyle = alpha(Cc.accent, 0.3); ctx.fill(); ctx.restore();
      }
      const q = pt(pc, (R + r0) / 2, now);
      D.haloText(ctx, pcName(pc), q.x, q.y, inS ? (isT ? Cc['pt-tonic'] : Cc.text) : alpha(Cc.muted, 0.9), 'center', 'middle', fnt(inS ? 13.5 : 12, inS ? 700 : 500));
    }
    const gl = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
    gl.addColorStop(0, alpha('#ffffff', D.dark ? 0.06 : 0.4)); gl.addColorStop(0.7, alpha('#ffffff', 0)); gl.addColorStop(1, D.shadowInk(D.dark ? 0.12 : 0.04));
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fillStyle = gl; ctx.fill();
    ctx.strokeStyle = alpha(Cc.text, D.dark ? 0.28 : 0.22); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r0, 0, TAU); ctx.strokeStyle = alpha(Cc.text, 0.14); ctx.lineWidth = 1; ctx.stroke();

    // 三分損益的順序：虛線依產生的順序連起來（五度順序時就是一格一格往前走）
    if (C.gen >= 2) {
      ctx.save();
      ctx.setLineDash([3, 4]); ctx.lineWidth = 1.4;
      for (let i = 1; i < C.gen; i++) {
        const a = C.notes[i - 1], b = C.notes[i];
        const pa = pt(mod(chainGong() + a.pcG, 12), rp - 4, now), pb = pt(mod(chainGong() + b.pcG, 12), rp - 4, now);
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y);
        ctx.strokeStyle = alpha(b.op === 'sun' ? Cc['pt-sun'] : Cc['pt-yi'], 0.45); ctx.stroke();
      }
      ctx.restore();
    }
    // 音階多邊形
    const ord = A.semis.map(function (s) { return mod(A.tonic + s, 12); });
    const Q = ord.map(function (pc) { return pt(pc, rp, now); });
    if (Q.length >= 3) {
      ctx.beginPath(); Q.forEach(function (q, i) { if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); ctx.closePath();
      const pg = ctx.createRadialGradient(cx - rp * 0.3, cy - rp * 0.35, rp * 0.1, cx, cy, rp);
      pg.addColorStop(0, alpha(Cc['pt-poly'], D.dark ? 0.26 : 0.18)); pg.addColorStop(1, alpha(Cc['pt-poly'], D.dark ? 0.1 : 0.07));
      ctx.fillStyle = pg; ctx.fill();
    }
    const n = Q.length;
    const pillBoxes = [];
    if (n >= 2) {
      for (let i = 0; i < n; i++) {
        const a = Q[i], b = Q[(i + 1) % n];
        D.tube(ctx, function (c2) { c2.moveTo(a.x, a.y); c2.lineTo(b.x, b.y); }, stepColor(A.steps[i]), 4.2);
      }
      if (n <= 7 && state.arr === 'chrom') {
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
    // 頂點：宮商角徵羽
    ord.forEach(function (pc, i) {
      const q = Q[i], isT = i === 0, on = pc === playingPc;
      const nt = A.notes[i], isG = nt.role === 0;
      D.ball(ctx, q.x, q.y, isT ? 8 : on ? 7.5 : 6, isT ? Cc['pt-tonic'] : isG ? Cc['pt-gong'] : Cc['pt-poly'], { glow: on ? 0.65 : (D.dark ? 0.3 : 0.08) });
      if (on && !D.reducedMotion() && state.play) D.ripple(ctx, q.x, q.y, 8, ((now / 1000) % state.play.dt) / state.play.dt, Cc.accent);
      const dx = q.x - cx, dy = q.y - cy, dl = Math.hypot(dx, dy) || 1;
      const lx = q.x - dx / dl * 17 * fs, ly = q.y - dy / dl * 17 * fs;
      const lab = nt.role >= 0 ? roleT(nt.roleZh) : String(i + 1);
      D.haloText(ctx, lab, lx, ly, isT ? Cc['pt-tonic'] : isG ? Cc['pt-gong'] : Cc.muted, 'center', 'middle', fnt(isT ? 12.5 : 11.5, 700));
    });
    // 外圈：三分損益產生的順序（1、2、3…）
    const rB = R + 13;
    const seen = {};
    C.notes.forEach(function (x, i) {
      const pc = mod(chainGong() + x.pcG, 12);
      const dup = seen[pc] || 0; seen[pc] = dup + 1;
      const c = cellPos(pc, now) + (dup ? 0.42 : 0);
      const a = angOfCell(c);
      const bx = cx + rB * Math.cos(a), by = cy + rB * Math.sin(a);
      const col = x.idx >= 5 ? Cc['pt-extra'] : x.idx === 0 ? Cc['pt-gong'] : Cc['pt-poly'];
      const rr = 8.5 * Math.min(1.2, fs);
      const isOn = pl && pl.chainIdx === i;
      ctx.beginPath(); ctx.arc(bx, by, rr, 0, TAU);
      ctx.fillStyle = isOn ? Cc.accent : alpha(Cc['canvas-bg'], 0.95); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.font = fnt(10, 700); ctx.fillStyle = isOn ? Cc.surface : col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), bx, by + 0.5);
    });
    // 中央：名字
    const nm = scaleName();
    const maxW = rp * 1.3;
    const nmY = cy - 7 * fs, subY = cy + 12 * fs;
    const hits = function (w, y, h) { return pillBoxes.some(function (b) { return b.x1 > cx - w / 2 - 3 && b.x0 < cx + w / 2 + 3 && b.y1 > y - h / 2 && b.y0 < y + h / 2; }); };
    let px = 15;
    ctx.font = fnt(px, 700);
    while (px > 9 && (ctx.measureText(nm).width > maxW || hits(ctx.measureText(nm).width, nmY, 16 * fs * px / 15))) { px -= 0.5; ctx.font = fnt(px, 700); }
    D.haloText(ctx, nm, cx, nmY, A.k >= 0 ? Cc.text : Cc['pt-a'], 'center', 'middle', fnt(px, 700));
    const sub = A.k >= 0 ? T('宮 = ' + A.gongName + '・亮度 ' + sg(A.brightness, 0), 'gong = ' + A.gongName + ' · brightness ' + sg(A.brightness, 0)) : T(A.semitones ? A.semitones + ' 個半音' : '沒有半音', A.semitones ? A.semitones + ' half step' + (A.semitones > 1 ? 's' : '') : 'no half steps');
    let spx = 11.5;
    ctx.font = fnt(spx, 600);
    while (spx > 8.5 && (ctx.measureText(sub).width > maxW || hits(ctx.measureText(sub).width, subY, 13 * fs))) { spx -= 0.5; ctx.font = fnt(spx, 600); }
    D.haloText(ctx, sub, cx, subY, Cc.muted, 'center', 'middle', fnt(spx, 600));
    // 排列的小標
    const cap = state.arr === 'fifths' ? T('五度順序（C G D A E B …）', 'Fifths order (C G D A E B …)') : T('半音順序', 'Semitone order');
    D.haloText(ctx, cap, L.wide ? 10 : 10, 14, Cc.muted, 'left', 'middle', fnt(11, 600));
  }

  /** 三分損益的弦：照產生的順序排，高度 ∝ 弦長 */
  let strCols = null;
  function drawStrings(now) {
    const g = L.chart;
    D.roundRect(ctx, g.x, g.y, g.w, g.h, 10);
    ctx.fillStyle = alpha(Cc.surface, D.dark ? 0.32 : 0.6); ctx.fill();
    ctx.strokeStyle = alpha(Cc.text, 0.08); ctx.lineWidth = 1; ctx.stroke();
    // 標題
    const title = T('三分損益：宮的弦長 ' + state.L0, 'Add or remove a third: gong = ' + state.L0);
    let tpx = 12.5; ctx.font = fnt(tpx, 700);
    const ord = state.order === 'sun' ? T('先損（史記）', 'remove first') : T('先益（管子）', 'add first');
    ctx.font = fnt(11, 600); const ow = ctx.measureText(ord).width;
    ctx.font = fnt(tpx, 700);
    // 標題和起手方式放不下同一行時（手機、英文、大字），就不另外寫起手方式（面板上看得到）
    const showOrd = ctx.measureText(title).width + ow + 30 <= g.w;
    const room = showOrd ? g.w - 30 - ow : g.w - 20;
    while (tpx > 9 && ctx.measureText(title).width > room) { tpx -= 0.5; ctx.font = fnt(tpx, 700); }
    ctx.fillStyle = Cc.text; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(title, g.x + 10, g.y + 8);
    if (showOrd) {
      ctx.font = fnt(11, 600); ctx.fillStyle = Cc.muted; ctx.textAlign = 'right';
      ctx.fillText(ord, g.x + g.w - 10, g.y + 9);
    }

    const ncol = Math.max(5, Math.min(P.GEN_MAX, C.gen + (C.gen < P.GEN_MAX ? 1 : 0)));
    const x0 = g.x + 10, x1 = g.x + g.w - 10, colW = (x1 - x0) / ncol;
    const labH = 34 * fs;
    const yb = g.y + g.h - labH - 6;
    const top = g.y + 22 * fs + 40 + (C.comma ? 14 * fs : 0);
    const maxLen = state.order === 'sun' ? state.L0 : state.L0 * 4 / 3;
    const sc = (yb - top) / maxLen;
    // 範圍：一個八度
    const loLen = maxLen / 2;
    const yLo = yb - loLen * sc, yHi = yb - maxLen * sc;
    ctx.save();
    ctx.fillStyle = alpha(Cc.accent, D.dark ? 0.07 : 0.05);
    ctx.fillRect(x0, yHi, x1 - x0, yLo - yHi);
    ctx.setLineDash([4, 4]); ctx.strokeStyle = alpha(Cc.text, 0.25); ctx.lineWidth = 1;
    [yHi, yLo].forEach(function (y) { ctx.beginPath(); ctx.moveTo(x0, Math.round(y) + 0.5); ctx.lineTo(x1, Math.round(y) + 0.5); ctx.stroke(); });
    ctx.restore();
    const loLab = state.order === 'sun' ? T('宮 ÷ 2（高八度）', 'gong ÷ 2 (octave up)') : T('八度範圍的下限', 'bottom of the octave');
    D.haloText(ctx, loLab + ' ' + fmtLen(loLen), x1 - 2, yLo + 3, Cc.muted, 'right', 'top', fnt(10, 600));
    // 琴橋（底座）
    D.block(ctx, x0 - 4, yb, x1 - x0 + 8, 8, Cc['pt-wood'], { r: 3 });
    // 每一根弦
    strCols = { x0: x0, colW: colW, top: g.y, bottom: g.y + g.h, n: C.gen };
    const tIdx = tonicChainIdx();
    const pl = playingNow();
    const lenFont = fnt(colW > 46 ? 11 : 10, 700);
    const narrowCols = colW < 40 * fs;
    for (let i = 0; i < ncol; i++) {
      const xc = x0 + (i + 0.5) * colW;
      const x = C.notes[i];
      if (!x) {
        // 下一個還沒產生的位置
        if (i === C.gen) {
          ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = alpha(Cc.muted, 0.6); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(xc, yb); ctx.lineTo(xc, yb - maxLen * 0.6 * sc); ctx.stroke(); ctx.restore();
          D.haloText(ctx, '?', xc, yb - maxLen * 0.6 * sc - 8, Cc.muted, 'center', 'middle', fnt(13, 700));
        }
        continue;
      }
      let hgt = x.len.value * sc;
      if (state.grow && state.grow.idx === i) { const u = Math.min(1, (now - state.grow.t0) / 420); hgt *= easeOut(u); }
      const col = x.idx >= 5 ? Cc['pt-extra'] : x.idx === 0 ? Cc['pt-gong'] : Cc['pt-poly'];
      const yt = yb - hgt;
      // 抖動（點弦後 0.7 秒）
      const fl = state.strFlash && state.strFlash.idx === i ? (now - state.strFlash.t0) / 1000 : 99;
      const isOn = (pl && pl.chainIdx === i) || fl < 0.7;
      if (isOn) { ctx.save(); ctx.fillStyle = alpha(Cc.accent, 0.12); D.roundRect(ctx, xc - colW * 0.45, yt - 18, colW * 0.9, yb - yt + 22, 6); ctx.fill(); ctx.restore(); }
      const amp = fl < 0.7 && !D.reducedMotion() ? 3.2 * Math.exp(-fl * 5) * Math.cos(fl * 60) : 0;
      D.tube(ctx, function (c2) {
        if (!amp) { c2.moveTo(xc, yb); c2.lineTo(xc, yt); return; }
        c2.moveTo(xc, yb);
        for (let k = 1; k <= 16; k++) { const u = k / 16; c2.lineTo(xc + amp * Math.sin(Math.PI * u), yb - (yb - yt) * u); }
      }, col, x.idx === 0 ? 4.2 : 3.4);
      D.ball(ctx, xc, yt, i === tIdx ? 6.5 : 5, i === tIdx ? Cc['pt-tonic'] : col, { glow: isOn ? 0.6 : (D.dark ? 0.25 : 0.05) });
      // 弦長
      const lt = fmtLen(x.len.value);
      ctx.font = lenFont;
      {
        const tight = narrowCols && ctx.measureText(lt).width + 4 > colW;
        const ly = yt - 9 - (tight && i % 2 === 1 ? 13 * fs : 0);
        D.haloText(ctx, lt, xc, ly, x.int ? Cc.text : Cc['pt-extra'], 'center', 'bottom', tight ? fnt(9.5, 700) : lenFont);
      }
      // 名稱與音名
      let nm = x.role ? roleT(x.role) : '#' + (i + 1);
      let npx = 12.5; ctx.font = fnt(npx, 700);
      while (npx > 8 && ctx.measureText(nm).width > colW - 2) { npx -= 0.5; ctx.font = fnt(npx, 700); }
      if (ctx.measureText(nm).width > colW - 1) { nm = String(i + 1); npx = 11; }
      D.haloText(ctx, nm, xc, yb + 10 + 8 * fs, i === tIdx ? Cc['pt-tonic'] : col, 'center', 'middle', fnt(npx, 700));
      let mpx = 10.5; const cn = chainName(x); ctx.font = fnt(mpx, 500);
      while (mpx > 7.5 && ctx.measureText(cn).width > colW - 2) { mpx -= 0.5; ctx.font = fnt(mpx, 500); }
      D.haloText(ctx, cn, xc, yb + 10 + 22 * fs, Cc.muted, 'center', 'middle', fnt(mpx, 500));
      // 損益的箭頭（前一根 → 這一根）
      if (i > 0) {
        const pv = C.notes[i - 1];
        const xp = xc - colW, ypv = yb - pv.len.value * sc;
        const up = x.op === 'sun';
        const colr = up ? Cc['pt-sun'] : Cc['pt-yi'];
        const ya = Math.min(ypv, yt) - (narrowCols ? 14 : 22);
        ctx.save();
        ctx.strokeStyle = alpha(colr, 0.75); ctx.lineWidth = 1.4; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(xp + 3, ypv - 6); ctx.quadraticCurveTo((xp + xc) / 2, ya, xc - 3, yt - 6); ctx.stroke();
        // 箭頭尖
        const ang = Math.atan2((yt - 6) - ya, (xc - 3) - (xp + xc) / 2);
        ctx.beginPath(); ctx.moveTo(xc - 3, yt - 6);
        ctx.lineTo(xc - 3 - 6 * Math.cos(ang - 0.45), yt - 6 - 6 * Math.sin(ang - 0.45));
        ctx.lineTo(xc - 3 - 6 * Math.cos(ang + 0.45), yt - 6 - 6 * Math.sin(ang + 0.45));
        ctx.closePath(); ctx.fillStyle = alpha(colr, 0.85); ctx.fill();
        ctx.restore();
        // 窄欄（產生很多個音、手機）只畫箭頭的顏色，不放小牌，免得蓋住弦長
        const opTxt = up ? '×2/3' : '×4/3';
        ctx.font = fnt(10, 700);
        if (!narrowCols && ctx.measureText(opTxt).width + 10 <= colW * 1.15) {
          const my = ((ypv - 6) + 2 * ya + (yt - 6)) / 4;
          D.pill(ctx, opTxt, (xp + xc) / 2, my + 8 * fs, colr, 'center', fnt(10, 700));
        }
      }
    }
    // 第 13 個音：和宮差一點點
    if (C.comma) {
      const xa = x0 + 0.5 * colW, xb = x0 + 12.5 * colW, ya = yb - C.notes[0].len.value * sc, yb2 = yb - C.notes[12].len.value * sc;
      ctx.save(); ctx.setLineDash([2, 3]); ctx.strokeStyle = alpha(Cc['pt-extra'], 0.8); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb + colW * 0.4, ya); ctx.stroke(); ctx.restore();
      D.haloText(ctx, T('第 13 根比宮短 ', '13th is shorter by ') + fx(C.comma.len, 2), g.x + g.w - 10, g.y + 13 + 15 * fs, Cc['pt-extra'], 'right', 'top', fnt(10.5, 700));
      void yb2;
    }
  }

  function draw(now) {
    D.backdrop(ctx, W, H);
    drawClock(now);
    drawStrings(now);
  }

  cv.addEventListener('click', function (e) {
    if (!L) return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const dx = x - L.cx, dy = y - L.cy, d = Math.hypot(dx, dy);
    if (d <= L.R + 4 && d >= L.R * 0.6) {
      const a = Math.atan2(dy, dx) + Math.PI / 2;
      const cell = mod(Math.round(a / TAU * 12), 12);
      const pc = state.arr === 'fifths' ? mod(7 * cell, 12) : cell;
      togglePc(pc);
      tapTone(60 + pc);
      return;
    }
    const g = L.chart;
    if (strCols && x >= g.x && x <= g.x + g.w && y >= g.y + 20 && y <= g.y + g.h) {
      const i = Math.floor((x - strCols.x0) / strCols.colW);
      if (i >= 0 && i < C.gen) tapString(i);
    }
  });
  cv.addEventListener('mousemove', function (e) {
    if (!L || !strCols) return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const g = L.chart, d = Math.hypot(x - L.cx, y - L.cy);
    const overStr = x >= g.x && x <= g.x + g.w && y >= g.y + 20 && y <= g.y + g.h && Math.floor((x - strCols.x0) / strCols.colW) < C.gen;
    cv.style.cursor = overStr || (d <= L.R + 4 && d >= L.R * 0.6) ? 'pointer' : 'default';
  });

  function updateCanvasLabels() {
    cv.setAttribute('aria-label', T('鐘面：' + scaleName() + '，音是 ' + A.names.join(' ') + '，步伐 ' + A.steps.join(' ') + '。旁邊（手機在下面）是三分損益的弦：' + C.notes.map(function (x) { return chainRole(x) + ' ' + fmtLen(x.len.value); }).join('、') + '。點弦可以聽，點鐘面的格子可以加入或移出音。',
      'Clock: ' + scaleName() + ', notes ' + A.names.join(' ') + ', steps ' + A.steps.join(' ') + '. Beside it (below on phones): the strings made by the rule: ' + C.notes.map(function (x) { return chainRole(x) + ' ' + fmtLen(x.len.value); }).join(', ') + '. Tap a string to hear it, tap a cell of the clock to add or remove a note.'));
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
      if (el >= state.play.total || seq.running === false) { stopPlay(); }
      else {
        more = true;
        const tb = el / state.play.dt;
        let idx = -1;
        for (let j = 0; j < state.play.list.length; j++) if (tb >= state.play.list[j].t) idx = j;
        if (idx !== state.play.idx) {
          state.play.idx = idx;
          renderTable(); renderMelody();
          updateKeysOn(idx >= 0 ? state.play.list[idx] : null);
          if (view3 && view3.active) view3.rebuild();
        }
      }
    }
    if (arrU(now) < 1) more = true;
    if (state.flash && now - state.flash.t0 < 500) more = true;
    if (state.strFlash && now - state.strFlash.t0 < 750) more = true;
    if (state.grow && now - state.grow.t0 < 460) more = true;
    if (!view3 || !view3.active) draw(now);
    if (view3 && view3.active) view3.frame();
    if (more) requestDraw();
  }

  // =====================================================================
  // 3D：切換到 3D 時才載入 js/pentatonic-3d.js 與 three.js
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    P: P, T: T, D: D,
    colors: function () { return Cc; },
    fs: function () { return fs; },
    data: function () {
      const pl = playingNow();
      return { a: A, c: C, gong: chainGong(), tonicIdx: tonicChainIdx(), playing: pl ? { pc: pl.pc, chainIdx: pl.chainIdx == null ? -1 : pl.chainIdx } : null };
    },
    chainName: chainName, chainRole: chainRole, fmtLen: fmtLen, fx: fx, pcName: pcName,
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 畫面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  };
  function rebuild3D() { if (view3 && view3.active) view3.rebuild(); }
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Pentatonic3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Pentatonic3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/pentatonic-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Pentatonic3D) throw new Error('pentatonic-3d.js did not load');
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
        view3 = window.Pentatonic3D.create(lib, host3, bridge);
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
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 畫面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ---------- 分享目前設定：自訂的音、三分損益產生到第幾個、旋律的種子（主音、調式、音律、起手、排列、弦長、速度、播放內容由 classroom.js 記錄） ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { s: state.type === 'custom' ? state.semis.slice() : null, g: state.gen, m: state.seed }; },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o.s)) { state.semis = P.normSemis(o.s.map(Number).filter(isFinite)); state.type = 'custom'; }
      if (isFinite(o.g)) { state.gen = Math.max(1, Math.min(P.GEN_MAX, Math.round(o.g))); state.walk = -1; }
      if (isFinite(o.m) && o.m > 0) state.seed = Math.round(o.m);
      changed('share', null, true);
    }
  });

  // 給測試用的介面（不影響畫面；window.__pt 是試玩工具自己用的名字，不能用）
  window.__pent = {
    state: state,
    analysis: function () { return A; },
    chain: function () { return C; },
    toggle: function (pc) { return togglePc(pc); },
    tapString: function (i) { tapString(i); },
    view3: function () { return view3; },
    /** 第 i 根弦在畫布上的位置（測試點擊用） */
    stringXY: function (i) { if (!strCols) return null; return { x: strCols.x0 + (i + 0.5) * strCols.colW, y: (strCols.top + strCols.bottom) / 2 + 20 }; }
  };

  // =====================================================================
  // 啟動（不發聲、不送任務事件）
  // =====================================================================
  readColors();
  (function initFromControls() {
    const t = P.tonicByName($('tonic').value);
    if (t) state.tonicName = t.name;
    state.content = $('content').value || 'up';
    document.querySelectorAll('[data-tune]').forEach(function (b) { if (b.getAttribute('aria-pressed') === 'true') state.tuning = b.dataset.tune; });
    document.querySelectorAll('[data-order]').forEach(function (b) { if (b.getAttribute('aria-pressed') === 'true') state.order = b.dataset.order; });
  })();
  readTempo();
  readL0();
  piano.setAttribute('data-share-skip', '');
  stepbar.setAttribute('data-share-skip', '');
  $('genReset').setAttribute('data-share-skip', '');
  $('genPrev').setAttribute('data-share-skip', '');
  $('genNext').setAttribute('data-share-skip', '');
  $('newMelody').setAttribute('data-share-skip', '');
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
