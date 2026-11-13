/* intervals.js — 「音程與頻率比」的畫面與互動
 * （數學在 intervals-core.js；聲音一律用 music-audio.js；2D 繪圖工具 LabDraw 在 drawkit.js；3D 在 intervals-3d.js，切到 3D 時才載入）
 *
 * 畫面：主畫布由上而下是「五線譜」（下方音、上方音、同時發聲的和音，中間一串數字母的小點）、名稱卡（寬螢幕在譜的右邊）、
 *       「音分尺」（音程長條，長度 ∝ 音分；淡色虛框是轉位，兩者合起來一個八度；另一種音律的位置用小三角標出），
 *       「疊音程」（積木頭尾相接，和表上的比值、上面選的音程比，差的那一點點標成紅色）。
 *       畫布下面是 HTML 鍵盤（寬螢幕 C4–C6，窄螢幕一次一個八度），點鍵設定上方音或下方音。
 * 聲音：只有學生按「▶ 播放」「▶ 聽疊出來的音」或點鍵盤時才發聲；音效關閉時畫面照跑，狀態列顯示提示並讓音效開關閃一下。
 * 任務事件：'interval'（音程、下方音或音律改變）、'respell'（等音）、'invert'（轉位）、'stack'（疊上去或拿掉一塊）、'play'（播放）；
 *           資料由 IntervalsCore.eventData 產生。 */
(function () {
  'use strict';
  const I = window.IntervalsCore;
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
  const PARTIALS = [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5];   // 近似的柔和風琴音色
  const GAIN = 0.3;
  const F_TOP = 1760;                                 // 播放時最高音不超過這個頻率（太高就整組降八度）
  const ZHN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '二十一', '二十二'];

  // ---------- 狀態 ----------
  const state = {
    lo: I.note(0, 0, 4), n: 3, q: 'M', tuning: 'equal',
    chain: null,               // 疊音程：{ start, bricks: [{ n, q }] }
    pmode: 'both', kb: 'upper', dur: 0.7, kbOct: 4,
    play: null,                // 播放中：{ events: [{ t, len, which: [索引] }], total, idx, notes }
    anim: null,                // 轉位動畫：{ t0, from: { lo, hi }, to: { lo, hi }, c0, c1 }
    flash: null,               // 剛點的鍵 { midi, t0 }
    offHintShown: false
  };
  let A = null;
  function recompute() { A = I.analyze(state); }

  // ---------- 色彩與字體 ----------
  let C = {}, fs = 1;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'iv-lo', 'iv-hi', 'iv-main', 'iv-inv', 'iv-gap', 'iv-b1', 'iv-b2', 'iv-b3', 'iv-b4']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    fs = Math.max(1, Math.min(1.45, parseFloat(cs.getPropertyValue('--fs')) || 1));
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + (px * fs).toFixed(1) + 'px ' + FONT; }
  const brickColor = function (i) { return C['iv-b' + (1 + (i % 4))]; };

  // ---------- 數字與文字 ----------
  function fx(v, d) { if (v == null || !isFinite(v)) return '—'; let s = v.toFixed(d); if (/^-0(\.0+)?$/.test(s)) s = s.slice(1); return s.replace('-', '−'); }
  function sg(v, d) { if (v == null || !isFinite(v)) return '—'; const s = Math.abs(v).toFixed(d); if (+s === 0) return (0).toFixed(d); return (v < 0 ? '−' : '+') + s; }
  const esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  const rt = function (r) { return r ? r[0] + '/' + r[1] : '—'; };
  /** 音程全名（中英） */
  const ivName = function (n, q) { return T(I.name(n, q, 'zh'), I.name(n, q, 'en')); };
  /** 短名：中文「大三」「完全五」、英文 'M3' 'P5' */
  const ivShort = function (n, q) { return T(I.QZH[q] + (ZHN[n] || n), q + n); };
  const cWord = function (c, d) { return fx(c, d == null ? 2 : d) + T(' 音分', ' cents'); };
  const semWord = function (s) { return T(s + ' 個半音', s + (s === 1 ? ' semitone' : ' semitones')); };
  function commaWord(cm) { return cm ? T(cm.zh, cm.en) + ' ' + rt(cm.r) : ''; }
  const tuneWord = function (t) { return t === 'just' ? T('純律', 'just intonation') : T('十二平均律', 'equal temperament'); };

  // ---------- 任務事件 ----------
  function emit(type, extra) {
    if (window.LabShare && window.LabShare.restoring) return;
    if (window.LabMission) window.LabMission.emit(type, I.eventData(A, extra));
  }

  // =====================================================================
  // 改變音程的各種方式（先檢查拼得出來，再一起更新）
  // =====================================================================
  let sayTimer = 0;
  function say(msg) {
    const el = $('status');
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () { el.textContent = msg || ''; }, 30);
  }
  function sentence() {
    let s = ivName(A.n, A.q) + T('：', ': ') + A.lo.full + ' → ' + (A.hi ? A.hi.full : '?') + T('，', ', ') + semWord(A.semis);
    if (A.tuning === 'just') s += T('，純律 ', ', just ') + rt(A.ratio) + T(' = ', ' = ') + cWord(A.centsJ);
    else s += T('，平均律 ', ', equal-tempered ') + cWord(A.centsE, 0);
    return s + T('。', '.');
  }
  /** 套用新的下方音、度數、性質；上方音拼不出來（三重升降）就不改 */
  function trySet(next, evType, extra, keepAnim) {
    const lo = next.lo || state.lo, n = next.n || state.n, q = next.q || state.q;
    if (!(n >= 1 && n <= I.MAX_NUM) || I.allowedQualities(n).indexOf(q) < 0) { renderControls(); return false; }
    if (!I.upperOf(lo, n, q)) {
      say(T('這樣上方音要用到三個升降記號，換一個下方音或性質試試。', 'That upper note would need a triple sharp or flat; try another lower note or quality.'));
      renderControls();
      return false;
    }
    stopPlay();
    state.lo = lo; state.n = n; state.q = q;
    if (!keepAnim) state.anim = null;
    recompute();
    renderAll();
    emit(evType || 'interval', extra);
    return true;
  }
  /** 換度數時，原本的性質不能用就換成最接近的（三度的「完全」→ 大、五度的「大」「小」→ 完全） */
  function qualFor(n, q) {
    const ok = I.allowedQualities(n);
    if (ok.indexOf(q) >= 0) return q;
    if (I.isPerfect(n)) return q === 'A' ? 'A' : 'P';
    return q === 'P' ? 'M' : 'M';
  }
  $('num').addEventListener('change', function () {
    const n = Math.round(+this.value);
    if (trySet({ n: n, q: qualFor(n, state.q) }, 'interval', { src: 'num' })) say(sentence());
  });
  document.querySelectorAll('#qualSeg [data-q]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.disabled || b.dataset.q === state.q) return;
      if (trySet({ q: b.dataset.q }, 'interval', { src: 'qual' })) say(sentence());
    });
  });
  function lowerFromSelects() {
    return I.note(+$('loLetter').value, Math.max(-2, Math.min(2, Math.round(+$('loAcc').value))), state.lo.oct);
  }
  $('loLetter').addEventListener('change', function () { if (trySet({ lo: lowerFromSelects() }, 'interval', { src: 'lower' })) say(sentence()); });
  $('loAcc').addEventListener('change', function () { if (trySet({ lo: lowerFromSelects() }, 'interval', { src: 'lower' })) say(sentence()); });

  $('respell').addEventListener('click', function () {
    const r = I.respell(state.lo, state.n, state.q);
    if (!r) { say(T('這個音程在重升、重降以內沒有別的寫法。', 'This interval has no other spelling within double sharps and flats.')); return; }
    const from = A.short, fromName = ivName(A.n, A.q), fromHi = A.hi.full;
    if (trySet({ n: r.n, q: r.q }, 'respell', { from: from, to: r.short })) {
      say(T('換個寫法：', 'Respelled: ') + fromName + '（' + A.lo.name + '–' + fromHi + '）→ ' + ivName(A.n, A.q) + '（' + A.lo.name + '–' + A.hi.full + '）' +
        T('，一樣 ' + A.semis + ' 個半音', ', still ' + A.semis + ' semitones') +
        (A.tuning === 'just' ? T('；純律 ', '; just ') + rt(A.ratio) + T('，', ', ') + cWord(A.centsJ) : '') + T('。', '.'));
    }
  });

  $('invert').addEventListener('click', function () {
    if (state.n === 8 && state.q === 'A') { say(T('增八度轉位會變成「減一度」：上方音比下方音還低，這一頁不做。', 'An augmented octave inverts to a “diminished unison”, whose upper note is below the lower one; this page does not go there.')); return; }
    const inv = I.invert(state.n, state.q), old = A;
    const newLo = I.note(old.hi.letter, old.hi.acc, old.hi.d >= 35 ? 4 : old.hi.oct);
    const newHi = I.upperOf(newLo, inv.n, inv.q);
    if (!newHi) { say(T('轉位後拼不出來。', 'The inversion cannot be spelled.')); return; }
    const c0 = old.cents, from = old.short;
    state.anim = D.reducedMotion() ? null : { t0: performance.now(), from: { lo: old.lo, hi: old.hi }, to: { lo: newLo, hi: newHi }, c0: c0 };
    if (trySet({ lo: newLo, n: inv.n, q: inv.q }, 'invert', { from: from, to: inv.q + inv.n }, true)) {
      if (state.anim) state.anim.c1 = A.cents;
      const prod = old.inv.prod;
      say(T('轉位：', 'Inverted: ') + ivName(old.n, old.q) + ' → ' + ivName(A.n, A.q) + T('（度數 ' + old.simple.n + ' + ' + A.n + ' = 9，半音 ' + (old.semis % 12 === 0 && old.semis ? 12 : old.semis % 12) + ' + ' + A.semis + ' = 12）', ' (numbers ' + old.simple.n + ' + ' + A.n + ' = 9, semitones ' + (old.semis % 12 === 0 && old.semis ? 12 : old.semis % 12) + ' + ' + A.semis + ' = 12)') +
        (A.tuning === 'just' && prod ? T('；比值 ', '; ratios ') + rt(I.justRatio(old.simple.n, old.q)) + ' × ' + rt(A.ratio) + ' = ' + rt(prod) + (A.inv.prodTwo ? '' : T('（比 2 多一個 ', ' (2 times the ') + commaWord(A.inv.prodComma) + T('）', ')')) : '') + T('。', '.'));
      requestDraw();
    }
  });

  document.querySelectorAll('#tuneSeg [data-tune]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.tune === state.tuning) return;
      stopPlay();
      state.tuning = b.dataset.tune;
      recompute(); renderAll();
      emit('interval', { src: 'tuning' });
      say(T('改用', 'Now using ') + tuneWord(state.tuning) + T('。', '.') + ' ' + sentence());
    });
  });
  document.querySelectorAll('#kbSeg [data-kb]').forEach(function (b) {
    b.addEventListener('click', function () { state.kb = b.dataset.kb; renderControls(); });
  });
  $('pmode').addEventListener('change', function () { state.pmode = this.value; });
  const elDur = $('dur'), elDurO = $('durO');
  function readDur() { state.dur = Math.max(0.3, Math.min(1.5, val(elDur))); elDurO.textContent = fx(state.dur, 1); }
  elDur.addEventListener('input', readDur);
  elDur.addEventListener('change', readDur);

  // ---------- 疊音程 ----------
  function stackWhy(why) {
    if (why === 'count') return T('最多疊四塊。', 'At most four blocks.');
    if (why === 'range') return T('疊起來會超過三個八度，換一個小一點的音程。', 'The stack would go beyond three octaves; choose a smaller interval.');
    return T('疊上去的音要用到三個升降記號，拼不出來。', 'The next note would need a triple sharp or flat.');
  }
  $('push').addEventListener('click', function () {
    const start = state.chain ? state.chain.start : state.lo;
    const bricks = state.chain ? state.chain.bricks : [];
    const b = { n: state.n, q: state.q };
    const r = I.canPush(start, bricks, b);
    if (!r.ok) { say(stackWhy(r.why)); return; }
    stopPlay();
    state.chain = { start: start, bricks: bricks.concat([b]) };
    recompute(); renderAll(); resize();
    emit('stack', { op: 'push' });
    say(chainSentence());
  });
  $('pop').addEventListener('click', function () {
    if (!state.chain) return;
    stopPlay();
    const b = state.chain.bricks.slice(0, -1);
    state.chain = b.length ? { start: state.chain.start, bricks: b } : null;
    recompute(); renderAll(); resize();
    if (state.chain) emit('stack', { op: 'pop' });
    say(state.chain ? chainSentence() : T('疊音程已經拿光了。', 'The stack is empty.'));
  });
  $('clear').addEventListener('click', function () {
    stopPlay();
    state.chain = null;
    recompute(); renderAll(); resize();
    say(T('已清掉疊好的音程。', 'The stack has been cleared.'));
  });
  function chainSentence() {
    const c = A.chain;
    if (!c) return '';
    let s = c.notes.map(function (x) { return x.full; }).join(' → ') + T('：', ': ') + c.bricks.map(function (b) { return ivName(b.n, b.q); }).join(' + ') + ' = ' + (c.total && c.total.q ? ivName(c.total.n, c.total.q) : '?');
    if (A.tuning === 'just') {
      s += T('；比值 ', '; ratios ') + c.bricks.map(function (b) { return rt(b.ratio); }).join(' × ') + ' = ' + rt(c.prod) + T('，', ', ') + cWord(c.centsJ);
      if (c.table && c.tableComma) s += T('；比表上的 ', '; compared with the table ') + rt(c.table) + T(' 差 ', ' it is off by ') + sg(c.tableDiff, 2) + T(' 音分（', ' cents (') + commaWord(c.tableComma) + T('）', ')');
    } else s += T('；', '; ') + cWord(c.centsE, 0);
    return s + T('。', '.');
  }

  // ---------- 鍵盤 ----------
  const piano = $('piano');
  const keyEls = {};
  let kbLo = -1, kbHi = -1, narrowKb = null;
  const isBlack = function (m) { return [1, 3, 6, 8, 10].indexOf(I.mod(m, 12)) >= 0; };
  function buildPiano() {
    piano.innerHTML = '';
    for (const k in keyEls) delete keyEls[k];
    const whites = [];
    for (let m = kbLo; m <= kbHi; m++) if (!isBlack(m)) whites.push(m);
    const ww = 100 / whites.length, bw = ww * 0.64;
    whites.forEach(function (m, i) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'key w'; b.dataset.midi = m;
      b.style.left = (i * ww) + '%'; b.style.width = 'calc(' + ww + '% + 1px)';
      b.innerHTML = '<span class="kd"></span><span class="kn"></span>';
      piano.appendChild(b); keyEls[m] = b;
    });
    for (let m = kbLo; m <= kbHi; m++) {
      if (!isBlack(m)) continue;
      const iRight = whites.indexOf(m + 1);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'key b'; b.dataset.midi = m;
      b.style.left = (iRight * ww - bw / 2) + '%'; b.style.width = bw + '%';
      b.innerHTML = '<span class="kd"></span><span class="kn"></span>';
      piano.appendChild(b); keyEls[m] = b;
    }
    renderPiano();
  }
  function setKbRange() {
    const w = piano.parentElement.clientWidth || 600;
    const nar = w < 560;
    const lo = nar ? 12 * (state.kbOct + 1) : 60, hi = nar ? lo + 12 : 84;
    $('kbDown').hidden = !nar; $('kbUp').hidden = !nar;
    $('kbDown').disabled = state.kbOct <= 4; $('kbUp').disabled = state.kbOct >= 5;
    if (nar !== narrowKb || lo !== kbLo || hi !== kbHi) { narrowKb = nar; kbLo = lo; kbHi = hi; buildPiano(); }
  }
  $('kbDown').addEventListener('click', function () { state.kbOct = Math.max(4, state.kbOct - 1); setKbRange(); });
  $('kbUp').addEventListener('click', function () { state.kbOct = Math.min(5, state.kbOct + 1); setKbRange(); });
  function plainName(m) { return window.MusicTheory.SHARP_NAMES[I.mod(m, 12)].length > 1 ? window.MusicTheory.SHARP_NAMES[I.mod(m, 12)] + '/' + window.MusicTheory.FLAT_NAMES[I.mod(m, 12)] : window.MusicTheory.SHARP_NAMES[I.mod(m, 12)]; }
  function renderPiano() {
    const loM = A.lo.midi, hiM = A.hi ? A.hi.midi : -99;
    for (const k in keyEls) {
      const m = +k, b = keyEls[k];
      const isLo = m === loM, isHi = m === hiM;
      const nm = isLo ? A.lo.name : isHi ? A.hi.name : (isBlack(m) ? '' : plainName(m));
      b.querySelector('.kn').textContent = nm + (m % 12 === 0 && !isLo && !isHi ? Math.floor(m / 12) - 1 : '');
      b.querySelector('.kd').textContent = isLo && isHi ? T('下＝上', 'lo=hi') : isLo ? T('下', 'lo') : isHi ? T('上', 'hi') : '';
      b.classList.toggle('lo', isLo);
      b.classList.toggle('hi', isHi && !isLo);
      b.classList.toggle('mid', m > loM && m < hiM);
      b.setAttribute('aria-pressed', String(isLo || isHi));
      b.setAttribute('aria-label', (isLo ? A.lo.full : isHi ? A.hi.full : plainName(m) + (Math.floor(m / 12) - 1)) +
        (isLo ? T('，下方音', ', lower note') : isHi ? T('，上方音', ', upper note') : '') +
        (state.kb === 'upper' ? T('。按一下設成上方音', '. Press to make it the upper note') : T('。按一下設成下方音', '. Press to make it the lower note')));
    }
  }
  piano.addEventListener('click', function (e) {
    const key = e.target.closest('.key');
    if (!key) return;
    const m = +key.dataset.midi;
    if (state.kb === 'upper') {
      const c = I.spellUpper(state.lo, m);
      if (!c) { say(T('上方音不能比下方音（' + state.lo.full + '）低。要換下方音，先選「下方音」再點鍵盤。', 'The upper note cannot be below the lower note (' + state.lo.full + '). To move the lower note, choose “Lower note” first.')); tapTone(m, null); return; }
      if (c.n !== state.n || c.q !== state.q) { if (trySet({ n: c.n, q: c.q }, 'interval', { src: 'key' })) say(sentence()); }
      tapTone(m, 'hi');
    } else {
      const lo = I.spellLower(m, state.lo.acc);
      if (lo.midi !== state.lo.midi || lo.name !== state.lo.name) { if (trySet({ lo: lo }, 'interval', { src: 'key-lo' })) say(sentence()); }
      tapTone(m, 'lo');
    }
  });

  // =====================================================================
  // 播放（MusicAudio.sequencer 排程；音效關閉時時鐘照跑、畫面照樣同步）
  // =====================================================================
  function soundCheck() {
    if (AU.enabled()) return true;
    say(AU.offHint());
    AU.flashSoundButton();
    return false;
  }
  /** 點鍵盤：響那一個音（純律時上方音照比值） */
  function tapTone(midi, which) {
    state.flash = { midi: midi, t0: performance.now() };
    requestDraw();
    if (!AU.enabled()) {
      if (!state.offHintShown) { state.offHintShown = true; setTimeout(function () { say(AU.offHint()); }, 60); AU.flashSoundButton(); }
      return;
    }
    let f = 440 * Math.pow(2, (midi - 69) / 12);
    if (which === 'hi' && A.hi && A.hi.midi === midi) f = A.fHi;
    if (which === 'lo') f = A.fLo;
    while (f > F_TOP) f /= 2;
    AU.tone({ f0: f, partials: PARTIALS, dur: 0.5, gain: GAIN, attack: 0.02, release: 0.3 });
  }
  function shiftFor(freqs) { let k = 0; const top = Math.max.apply(null, freqs); while (top / Math.pow(2, k) > F_TOP) k++; return k; }
  let seq = null;
  function silentClock(delay) {
    const t0 = performance.now() + delay * 1000;
    return { stop: function () {}, elapsed: function () { return (performance.now() - t0) / 1000; } };
  }
  function startTimeline(kind, freqs, events) {
    stopPlay();
    const on = soundCheck();
    const k = shiftFor(freqs), fr = freqs.map(function (f) { return f / Math.pow(2, k); });
    const total = events.reduce(function (t, e) { return Math.max(t, e.t + e.len); }, 0) + 0.3;
    seq = !on ? silentClock(0.06) : AU.sequencer({
      tick: function (t0, t1, start) {
        if (!AU.enabled()) return;
        events.forEach(function (e) {
          const at = start + e.t;
          if (at >= t0 && at < t1) e.which.forEach(function (i) {
            AU.tone({ f0: fr[i], partials: PARTIALS, dur: e.len, gain: GAIN / Math.sqrt(e.which.length), attack: 0.02, release: Math.min(0.4, e.len * 0.4), at: at });
          });
        });
      }
    });
    if (on) seq.begin(0.06);
    state.play = { kind: kind, events: events, total: total, idx: -1, shift: k, n: freqs.length };
    updateStop(); requestDraw();
    return { on: on, shift: k };
  }
  function shiftWord(k) { return k ? T('（太高了，整組降低 ' + k + ' 個八度播放；比值不變）', ' (too high, so played ' + k + (k === 1 ? ' octave' : ' octaves') + ' lower; the ratio is unchanged)') : ''; }
  $('play').addEventListener('click', function () {
    const d = state.dur, ev = [];
    if (state.pmode !== 'harmonic') { ev.push({ t: 0, len: d * 0.92, which: [0] }); ev.push({ t: d, len: d * 0.92, which: [1] }); }
    if (state.pmode !== 'melodic') ev.push({ t: state.pmode === 'both' ? 2 * d : 0, len: Math.max(0.8, d * 2), which: [0, 1] });
    const r = startTimeline('main', [A.fLo, A.fHi], ev);
    emit('play', { what: 'main', mode: state.pmode });
    if (r.on) say(T('播放：', 'Playing: ') + ivName(A.n, A.q) + ' ' + A.lo.full + ' → ' + A.hi.full + T('（' + tuneWord(A.tuning) + '）', ' (' + tuneWord(A.tuning) + ')') + shiftWord(r.shift) + T('。', '.'));
  });
  $('playStack').addEventListener('click', function () {
    const c = A.chain;
    if (!c) return;
    const f0 = I.freqOf(c.notes[0]);
    let acc = [1, 1];
    const freqs = c.notes.map(function (x, i) {
      if (A.tuning !== 'just') return I.freqOf(x);
      if (i > 0) acc = I.mul(acc, c.bricks[i - 1].ratio);
      return f0 * I.fval(acc);
    });
    const d = state.dur * 0.85, ev = [];
    freqs.forEach(function (f, i) { ev.push({ t: i * d, len: d * 0.92, which: [i] }); });
    ev.push({ t: freqs.length * d, len: Math.max(1, state.dur * 2.2), which: freqs.map(function (f, i) { return i; }) });
    const r = startTimeline('stack', freqs, ev);
    emit('play', { what: 'stack', mode: 'stack' });
    if (r.on) say(T('播放疊出來的音：', 'Playing the stack: ') + c.notes.map(function (x) { return x.full; }).join(' ') + shiftWord(r.shift) + T('。', '.'));
  });
  function stopPlay() {
    if (seq) { seq.stop(); seq = null; }
    if (state.play) { state.play = null; AU.stopAll(0.06); updateKeysOn(); }
    updateStop();
  }
  function busy() { return !!state.play; }
  function updateStop() { $('stop').disabled = !(AU.playing() || busy()); }
  $('stop').addEventListener('click', function () { stopPlay(); AU.stopAll(0.06); updateStop(); requestDraw(); say(T('已停止。', 'Stopped.')); });
  AU.onChange(updateStop);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && busy()) { stopPlay(); requestDraw(); } });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopPlay(); });
  /** 播放中正在響的是哪幾個音（索引）；主音程 0 = 下方音、1 = 上方音；疊音程 = 第幾個音 */
  function soundingNow() {
    const p = state.play;
    if (!p || p.idx < 0) return [];
    return p.events[p.idx].which;
  }
  function updateKeysOn() {
    const on = soundingNow(), p = state.play;
    const mids = [];
    if (p) on.forEach(function (i) {
      if (p.kind === 'main') mids.push(i === 0 ? A.lo.midi : A.hi.midi);
      else if (A.chain) mids.push(A.chain.notes[i].midi);
    });
    for (const k in keyEls) keyEls[k].classList.toggle('on', mids.indexOf(+k) >= 0);
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
  // HTML：控制項、讀數、疊音程、音程表
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  function renderControls() {
    $('loLetter').value = String(state.lo.letter);
    $('loAcc').value = String(state.lo.acc);
    $('num').value = String(state.n);
    const ok = I.allowedQualities(state.n);
    document.querySelectorAll('#qualSeg [data-q]').forEach(function (b) {
      const q = b.dataset.q;
      b.setAttribute('aria-pressed', String(q === state.q));
      b.disabled = ok.indexOf(q) < 0;
    });
    document.querySelectorAll('#tuneSeg [data-tune]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tune === state.tuning)); });
    document.querySelectorAll('#kbSeg [data-kb]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.kb === state.kb)); });
    $('respell').disabled = !I.respell(state.lo, state.n, state.q);
    $('invert').disabled = state.n === 8 && state.q === 'A';
    $('pop').disabled = !state.chain;
    $('playStack').disabled = !state.chain;
  }
  function renderReadout() {
    const a = A;
    setHTML('namebox', '<div class="nm">' + esc(ivName(a.n, a.q)) + ' <small style="font-weight:500;color:var(--muted)">' + esc(a.short) + '</small></div>' +
      '<div class="sub">' + esc(a.lo.full + ' → ' + a.hi.full + T('（' + a.lo.name + ' 到 ' + a.hi.name + '，字母數 ' + a.n + ' 個）', ' (' + a.lo.name + ' to ' + a.hi.name + ', ' + a.n + ' letter' + (a.n === 1 ? '' : 's') + ' counted)')) + '</div>');
    const rows = [];
    const row = function (dt, dd) { rows.push('<dt>' + dt + '</dt><dd>' + dd + '</dd>'); };
    row(T('度數／性質', 'Number / quality'), esc(T(I.numName(a.n, 'zh') + '／' + I.QZH[a.q], I.numName(a.n, 'en') + ' / ' + I.QEN[a.q])));
    row(T('半音數', 'Semitones'), String(a.semis) + (a.compound ? ' <small>' + esc(T('= 12 × ' + a.octPart + ' + ' + (a.semis - 12 * a.octPart), '= 12 × ' + a.octPart + ' + ' + (a.semis - 12 * a.octPart))) + '</small>' : ''));
    row(T('頻率比（純律）', 'Ratio (just)'), esc(rt(a.ratio)) + ' <small>= ' + fx(I.fval(a.ratio), 4) + '</small>');
    row(T('音分（純律）', 'Cents (just)'), fx(a.centsJ, 2));
    row(T('音分（平均律）', 'Cents (equal)'), fx(a.centsE, 0) + ' <small>' + esc(T('（比值 ', '(ratio ')) + fx(Math.pow(2, a.semis / 12), 4) + esc(T('）', ')')) + '</small>');
    row(T('純律 − 平均律', 'Just − equal'), sg(a.diffJE, 2) + T(' 音分', ' cents'));
    row(T('頻率（' + (a.tuning === 'just' ? '純律' : '平均律') + '）', 'Frequencies (' + (a.tuning === 'just' ? 'just' : 'equal') + ')'), fx(a.fLo, 2) + ' → ' + fx(a.fHi, 2) + ' Hz');
    const invOk = !(a.n === 8 && a.q === 'A');
    if (invOk) {
      const sr = I.justRatio(a.simple.n, a.q);
      row(T('轉位', 'Inversion'), esc(ivName(a.inv.n, a.inv.q) + ' ' + rt(a.inv.ratio)) + '<br><small>' + esc(rt(sr) + ' × ' + rt(a.inv.ratio) + ' = ' + rt(a.inv.prod)) +
        (a.inv.prodTwo ? '' : ' <span style="color:var(--iv-gap);font-weight:700">' + esc(T('= 2 × ', '= 2 × ') + rt(a.inv.prodComma && a.inv.prodComma.r)) + '</span>') + '</small>');
    } else row(T('轉位', 'Inversion'), esc(T('（減一度，不做）', '(diminished unison, not used)')));
    if (a.enh.length) {
      row(T('等音程', 'Enharmonic'), a.enh.map(function (e) {
        return esc(ivName(e.n, e.q) + (e.hi ? '（' + a.lo.name + '–' + e.hi.name + '）' : '')) + '<br><small>' + esc(T('純律 ', 'just ') + rt(e.ratio) + T('，差 ', ', ') + sg(e.diffJ, 2) + T(' 音分', ' cents') + (e.comma ? '（' + commaWord(e.comma) + '）' : '')) + '</small>';
      }).join('<br>'));
    }
    setHTML('readout', rows.join(''));
  }
  function renderChain() {
    const c = A.chain;
    if (!c) { setHTML('chainbox', ''); return; }
    const parts = [];
    parts.push(esc(c.notes.map(function (x) { return x.full; }).join(' → ')));
    parts.push('<span class="eq">' + esc(c.bricks.map(function (b) { return ivShort(b.n, b.q); }).join(' + ') + ' = ' + (c.total && c.total.q ? ivName(c.total.n, c.total.q) : '?')) + '</span>' + esc(T('（' + c.semis + ' 個半音）', ' (' + c.semis + ' semitones)')));
    if (A.tuning === 'just') {
      parts.push(esc(T('比值：', 'Ratios: ') + c.bricks.map(function (b) { return rt(b.ratio); }).join(' × ') + ' = ' + rt(c.prod)));
      parts.push(esc(T('音分：', 'Cents: ') + c.bricks.map(function (b) { return fx(b.centsJ, 2); }).join(' + ') + ' = ' + fx(c.centsJ, 2)));
      if (c.table) {
        const same = Math.abs(c.tableDiff) < 1e-9;
        parts.push(esc(T('表上的' + I.name(c.total.n, c.total.q, 'zh') + '：', 'Table ' + I.name(c.total.n, c.total.q, 'en') + ': ') + rt(c.table) + ' ') +
          (same ? esc(T('（剛好一樣）', '(exactly the same)')) : '<span class="gap">' + esc(T('差 ', 'off by ') + sg(c.tableDiff, 2) + T(' 音分', ' cents') + (c.tableComma ? '（' + commaWord(c.tableComma) + '）' : '')) + '</span>'));
      }
      if (cmpMain(c)) {
        parts.push(esc(T('和上面選的' + I.name(A.n, A.q, 'zh') + ' ' + rt(A.ratio) + ' 比：', 'Compared with the ' + I.name(A.n, A.q, 'en') + ' chosen above, ' + rt(A.ratio) + ': ')) +
          (c.mainSame ? esc(T('一樣大', 'the same size')) : '<span class="gap">' + esc(sg(c.mainDiff, 2) + T(' 音分', ' cents') + (c.mainComma ? '（' + commaWord(c.mainComma) + '）' : '')) + '</span>'));
      }
    } else {
      parts.push(esc(T('音分：', 'Cents: ') + c.bricks.map(function (b) { return fx(b.centsE, 0); }).join(' + ') + ' = ' + fx(c.centsE, 0) + T('（平均律：整數個半音，直接相加，沒有誤差）', ' (equal temperament: whole semitones, no leftovers)')));
      if (cmpMain(c)) parts.push(esc(T('和上面選的' + I.name(A.n, A.q, 'zh') + '比：', 'Compared with the ' + I.name(A.n, A.q, 'en') + ' chosen above: ')) + esc(sg(c.mainDiff, 0) + T(' 音分', ' cents')));
    }
    setHTML('chainbox', parts.join('<br>'));
  }
  /** 疊出來的音和上面選的音程落在同一個鍵上（半音數一樣）、但名字不一樣時，才把兩者並排比一比 */
  function cmpMain(c) { return !!c && c.semis === A.semis && !(c.total && c.total.n === A.n && c.total.q === A.q); }
  const TABLE = [[1, 'P'], [2, 'm'], [2, 'M'], [3, 'm'], [3, 'M'], [4, 'P'], [4, 'A'], [5, 'd'], [5, 'P'], [6, 'm'], [6, 'M'], [7, 'm'], [7, 'M'], [8, 'P']];
  function renderTable() {
    const head = '<tr><th>' + esc(T('音程', 'Interval')) + '</th><th>' + esc(T('半音', 'Semis')) + '</th><th>' + esc(T('純律比', 'Just')) + '</th><th>' + esc(T('音分', 'Cents')) + '</th><th>' + esc(T('× 轉位', '× inversion')) + '</th></tr>';
    const body = TABLE.map(function (t) {
      const n = t[0], q = t[1], r = I.justRatio(n, q), iv = I.invert(n, q), ir = I.justRatio(iv.n, iv.q), p = I.mul(r, ir);
      const on = state.n === n && state.q === q;
      const cell = function (h, cls) { return '<td' + (cls ? ' class="' + cls + '"' : '') + '><button type="button" data-n="' + n + '" data-q="' + q + '" tabindex="-1">' + h + '</button></td>'; };
      return '<tr' + (on ? ' class="on"' : '') + '>' +
        '<td><button type="button" data-n="' + n + '" data-q="' + q + '" aria-label="' + esc(ivName(n, q)) + '">' + esc(ivName(n, q)) + '</button></td>' +
        cell(String(I.semisOf(n, q))) + cell(rt(r)) + cell(fx(I.cents(I.fval(r)), 1)) + cell(rt(p), I.feq(p, [2, 1]) ? '' : 'odd') + '</tr>';
    }).join('');
    setHTML('ivTable', '<thead>' + head + '</thead><tbody>' + body + '</tbody>');
  }
  $('ivTable').addEventListener('click', function (e) {
    const b = e.target.closest('button[data-n]');
    if (!b) return;
    const n = +b.dataset.n, q = b.dataset.q;
    if (n === state.n && q === state.q) return;
    if (trySet({ n: n, q: q }, 'interval', { src: 'table' })) say(sentence());
  });
  function renderAll() {
    renderControls(); renderReadout(); renderChain(); renderTable(); renderPiano(); updateKeysOn();
    updateCanvasLabel(); rebuild3D();
    // 畫布高度隨疊音程的列數改變
    const h0 = H; layout(); if (H !== h0) resize(); else requestDraw();
  }
  function updateCanvasLabel() {
    cv.setAttribute('aria-label', T('五線譜：' + A.lo.full + ' 到 ' + A.hi.full + '，' + I.name(A.n, A.q, 'zh') + '，' + A.semis + ' 個半音。音分尺：純律 ' + rt(A.ratio) + ' = ' + fx(A.centsJ, 2) + ' 音分，平均律 ' + fx(A.centsE, 0) + ' 音分；轉位是' + I.name(A.inv.n, A.inv.q, 'zh') + '。' + (A.chain ? '疊音程：' + A.chain.notes.map(function (x) { return x.full; }).join('、') + '。' : ''),
      'Staff: ' + A.lo.full + ' to ' + A.hi.full + ', ' + I.name(A.n, A.q, 'en') + ', ' + A.semis + ' semitones. Cents ruler: just ' + rt(A.ratio) + ' = ' + fx(A.centsJ, 2) + ' cents, equal ' + fx(A.centsE, 0) + ' cents; the inversion is a ' + I.name(A.inv.n, A.inv.q, 'en') + '.' + (A.chain ? ' Stack: ' + A.chain.notes.map(function (x) { return x.full; }).join(', ') + '.' : '')));
  }

  // =====================================================================
  // 主畫布
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W = 600, H = 440, L = null;
  function layout() {
    const wide = W >= 640;
    const staffH = Math.round((wide ? 210 : 188) + (fs - 1) * 40);
    const cardH = wide ? 0 : Math.round(70 * fs + 10);
    const rulerH = Math.round(124 + (fs - 1) * 44);
    const ch = A && A.chain;
    const nrefs = ch ? (ch.total && ch.total.q && ch.table ? 1 : 0) + (cmpMain(ch) ? 1 : 0) : 0;
    const stackH = ch ? Math.round((64 + 26 * nrefs) * fs + 18) : Math.round(40 * fs + 8);
    let y = 8;
    L = { wide: wide };
    if (wide) {
      const sw = Math.round(W * 0.6);
      L.staff = { x: 8, y: y, w: sw - 12, h: staffH };
      L.card = { x: sw + 4, y: y, w: W - sw - 12, h: staffH };
      y += staffH + 8;
    } else {
      L.staff = { x: 8, y: y, w: W - 16, h: staffH };
      y += staffH + 6;
      L.card = { x: 8, y: y, w: W - 16, h: cardH };
      y += cardH + 6;
    }
    L.ruler = { x: 8, y: y, w: W - 16, h: rulerH };
    y += rulerH + 6;
    L.stack = { x: 8, y: y, w: W - 16, h: stackH };
    y += stackH + 8;
    H = y;
  }
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth || cv.parentElement.clientWidth || 600;
    layout();
    cv.style.height = H + 'px';
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    setKbRange();
    requestDraw();
  }
  function panel(r) {
    ctx.save();
    D.roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, alpha(C.surface, D.dark ? 0.5 : 0.75));
    g.addColorStop(1, alpha(C.surface, D.dark ? 0.28 : 0.45));
    ctx.fillStyle = g;
    ctx.shadowColor = D.shadowInk(D.dark ? 0.4 : 0.1); ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
    ctx.fill();
    ctx.restore();
    D.roundRect(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 12);
    ctx.strokeStyle = alpha(C.border, 0.8); ctx.lineWidth = 1; ctx.stroke();
  }
  const ease = function (u) { return u < 0 ? 0 : u > 1 ? 1 : 1 - Math.pow(1 - u, 3); };
  function animU(now) { return state.anim ? Math.min(1, (now - state.anim.t0) / 750) : 1; }

  // ---------- 五線譜 ----------
  function notehead(x, y, sp, color, glow) {
    const rx = sp * 0.78, ry = sp * 0.55;
    ctx.save();
    if (glow) {
      const gg = ctx.createRadialGradient(x, y, rx * 0.4, x, y, rx * 2.2);
      gg.addColorStop(0, alpha(color, 0.45)); gg.addColorStop(1, alpha(color, 0));
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, rx * 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.translate(x, y); ctx.rotate(-0.32);
    ctx.shadowColor = D.shadowInk(D.dark ? 0.5 : 0.22); ctx.shadowBlur = 4; ctx.shadowOffsetY = 1.5;
    const g = ctx.createRadialGradient(-rx * 0.35, -ry * 0.4, ry * 0.1, 0, 0, rx * 1.1);
    g.addColorStop(0, shade(color, 0.35)); g.addColorStop(0.6, color); g.addColorStop(1, shade(color, -0.3));
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.shadowColor = 'transparent';
    // 全音符的斜孔
    ctx.rotate(0.95);
    ctx.beginPath(); ctx.ellipse(0, 0, ry * 0.62, ry * 0.36, 0, 0, Math.PI * 2);
    ctx.fillStyle = alpha(C['canvas-bg'], 0.92); ctx.fill();
    ctx.restore();
  }
  function drawStaff(now) {
    const r = L.staff;
    panel(r);
    const u = ease(animU(now));
    const anim = state.anim && u < 1 ? state.anim : null;
    // 兩個要畫的音：轉位動畫時，舊的下方音一路升到新的上方音位置、舊的上方音移到新的下方音位置
    let nLo = A.lo, nHi = A.hi, dLo = A.lo.d, dHi = A.hi.d;
    if (anim) {
      nLo = anim.from.lo; nHi = anim.from.hi;
      dLo = anim.from.lo.d + (anim.to.hi.d - anim.from.lo.d) * u;
      dHi = anim.from.hi.d + (anim.to.lo.d - anim.from.hi.d) * u;
    }
    const minD = Math.min(28, Math.floor(Math.min(dLo, dHi))) - 1;
    const maxD = Math.max(38, Math.ceil(Math.max(dLo, dHi))) + 1;
    const topPad = 30 * fs, botPad = 34 * fs;
    const sp = Math.max(5, Math.min(13, (r.h - topPad - botPad) / ((maxD - minD) / 2)));
    const yTop = r.y + topPad + (r.h - topPad - botPad - (maxD - minD) / 2 * sp) / 2;
    const yOf = function (d) { return yTop + (maxD - d) * sp / 2; };
    const sx0 = r.x + 14, sx1 = r.x + r.w - 14;
    // 五條線
    ctx.save();
    ctx.lineCap = 'round';
    for (let d = 30; d <= 38; d += 2) {
      const y = Math.round(yOf(d)) + 0.5;
      ctx.strokeStyle = alpha(C.text, D.dark ? 0.5 : 0.55); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(sx0, y); ctx.lineTo(sx1, y); ctx.stroke();
    }
    ctx.restore();
    // G 譜號的位置：第二線是 G4
    D.pill(ctx, 'G4', sx0 + 2, yOf(32) + 8 * fs, C.muted, 'left', fnt(10.5, 700));
    const sw = sx1 - sx0;
    const xLo = sx0 + sw * 0.25, xHi = sx0 + sw * 0.58, xCh = sx0 + sw * 0.86;
    const sounding = soundingNow(), mainPlay = state.play && state.play.kind === 'main';
    const glowLo = mainPlay && sounding.indexOf(0) >= 0, glowHi = mainPlay && sounding.indexOf(1) >= 0;
    function ledger(x, d) {
      const dd = Math.round(d);
      ctx.strokeStyle = alpha(C.text, 0.55); ctx.lineWidth = 1.2;
      const w = sp * 1.15;
      for (let k = 28; k >= dd; k -= 2) { const y = Math.round(yOf(k)) + 0.5; ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x + w, y); ctx.stroke(); }
      for (let k = 40; k <= dd; k += 2) { const y = Math.round(yOf(k)) + 0.5; ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x + w, y); ctx.stroke(); }
    }
    function accidental(x, d, nt, color) {
      if (!nt.acc) return;
      const t = I.accText(nt.acc);
      D.haloText(ctx, t, x - sp * 1.05, yOf(d) + sp * 0.05, color, 'right', 'middle', fnt(Math.max(11, sp * 1.45) / fs, 700));
    }
    // 數字母的小階梯（1 … n）
    const n = A.n;
    if (!anim) {
      const gapW = xHi - xLo;
      const step = n > 1 ? gapW / (n - 1) : 0;
      const showAll = step >= 15 * fs;
      ctx.save();
      for (let k = 1; k <= n; k++) {
        const d = A.lo.d + k - 1, x = n > 1 ? xLo + step * (k - 1) : xLo, y = yOf(d);
        if (k > 1 && k < n) {
          ctx.fillStyle = alpha(C.accent, D.dark ? 0.75 : 0.6);
          ctx.beginPath(); ctx.arc(x, y, Math.max(2.2, sp * 0.24), 0, Math.PI * 2); ctx.fill();
        }
        if (k > 1 && n > 1) {
          ctx.strokeStyle = alpha(C.accent, 0.35); ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
          ctx.beginPath(); ctx.moveTo(xLo + step * (k - 2), yOf(d - 1)); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
        }
        if (showAll || k === 1 || k === n || (k - 1) % 7 === 0) {
          const lbl = String(k);
          D.haloText(ctx, lbl, x + (k === 1 ? -sp * 1.0 : k === n ? sp * 1.0 : 0), y - sp * (k === 1 || k === n ? 1.25 : 0.9), C.accent, 'center', 'alphabetic', fnt(10.5, 700));
        }
      }
      ctx.restore();
      // 上面一行：數字母
      const letters = [];
      for (let k = 0; k < n; k++) letters.push(I.LETTERS[I.mod(A.lo.letter + k, 7)]);
      const txt = T('數字母：', 'Count letters: ') + (n <= 9 ? letters.join(' ') : letters.slice(0, 3).join(' ') + ' … ' + letters.slice(-2).join(' ')) + T(' → ' + I.numName(n, 'zh'), ' → ' + I.numName(n, 'en'));
      ctx.font = fnt(12, 600);
      D.haloText(ctx, txt, r.x + 12, r.y + 18 * fs, C.text, 'left', 'alphabetic', fnt(12, 600));
    } else {
      D.haloText(ctx, T('轉位：下方音升高八度', 'Inverting: the lower note moves up an octave'), r.x + 12, r.y + 18 * fs, C['iv-inv'], 'left', 'alphabetic', fnt(12, 700));
    }
    // 先後的兩個音
    ledger(xLo, dLo); ledger(xHi, dHi);
    if (anim) {
      // 動畫中：舊的下方音（往上走）畫在 xLo → xHi 之間的弧線上
      const xa = xLo + (xHi - xLo) * u, xb = xHi + (xLo - xHi) * u;
      ledger(xa, dLo); ledger(xb, dHi);
      accidental(xa, dLo, nLo, C['iv-lo']); notehead(xa, yOf(dLo), sp, C['iv-lo'], true);
      accidental(xb, dHi, nHi, C['iv-hi']); notehead(xb, yOf(dHi), sp, C['iv-hi'], false);
    } else {
      accidental(xLo, dLo, nLo, C['iv-lo']); notehead(xLo, yOf(dLo), sp, C['iv-lo'], glowLo);
      accidental(xHi, dHi, nHi, C['iv-hi']); notehead(xHi, yOf(dHi), sp, C['iv-hi'], glowHi);
      // 同時（和音）：二度以內的上方音往右錯開
      ledger(xCh, dLo); ledger(xCh, dHi);
      const close = dHi - dLo <= 1;
      const xU = close ? xCh + sp * 1.5 : xCh;
      const gBoth = mainPlay && sounding.length === 2;
      accidental(xCh - (close && nHi.acc ? sp * 1.6 : 0), dLo, nLo, C['iv-lo']);
      notehead(xCh, yOf(dLo), sp, C['iv-lo'], gBoth);
      if (nHi.acc) D.haloText(ctx, I.accText(nHi.acc), xCh - sp * 1.05, yOf(dHi) + sp * 0.05, C['iv-hi'], 'right', 'middle', fnt(Math.max(11, sp * 1.45) / fs, 700));
      notehead(xU, yOf(dHi), sp, C['iv-hi'], gBoth);
    }
    // 下面的名字
    const yb = r.y + r.h - 8;
    if (!anim) {
      D.pill(ctx, A.lo.full, xLo, yb, C['iv-lo'], 'center', fnt(12, 700));
      D.pill(ctx, A.hi.full, xHi, yb, C['iv-hi'], 'center', fnt(12, 700));
      D.pill(ctx, T('同時', 'together'), xCh, yb, C.muted, 'center', fnt(11.5, 600));
    }
  }

  // ---------- 名稱卡 ----------
  function drawCard() {
    const r = L.card;
    if (!r.h) return;
    panel(r);
    const a = A, x = r.x + 14;
    if (L.wide) {
      let y = r.y + 34 * fs;
      const nm = ivName(a.n, a.q);
      ctx.font = fnt(24, 800);
      const nf = ctx.measureText(nm).width > r.w - 28 ? fnt(18, 800) : fnt(24, 800);
      D.haloText(ctx, nm, x, y, C.text, 'left', 'alphabetic', nf);
      y += 22 * fs;
      D.haloText(ctx, a.lo.full + ' → ' + a.hi.full + T('　' + a.semis + ' 個半音', '   ' + a.semis + ' semitones'), x, y, C.muted, 'left', 'alphabetic', fnt(13, 600));
      y += 26 * fs;
      D.haloText(ctx, T('純律 ', 'Just ') + rt(a.ratio) + T(' = ', ' = ') + fx(a.centsJ, 2) + T(' 音分', ' cents'), x, y, a.tuning === 'just' ? C['iv-main'] : C.muted, 'left', 'alphabetic', fnt(14, a.tuning === 'just' ? 800 : 600));
      y += 22 * fs;
      ctx.font = fnt(14, a.tuning === 'equal' ? 800 : 600);
      const w1 = D.supText(ctx, T('平均律 2', 'Equal 2'), a.semis + '/12', x, y, a.tuning === 'equal' ? C['iv-main'] : C.muted, fnt(14, a.tuning === 'equal' ? 800 : 600), 'left');
      D.haloText(ctx, T(' = ', ' = ') + fx(a.centsE, 0) + T(' 音分', ' cents'), x + w1 + 2, y, a.tuning === 'equal' ? C['iv-main'] : C.muted, 'left', 'alphabetic', fnt(14, a.tuning === 'equal' ? 800 : 600));
      y += 28 * fs;
      if (!(a.n === 8 && a.q === 'A')) {
        D.haloText(ctx, T('轉位：', 'Inversion: ') + ivName(a.inv.n, a.inv.q) + ' ' + rt(a.inv.ratio), x, y, C['iv-inv'], 'left', 'alphabetic', fnt(13, 700));
        y += 20 * fs;
        D.haloText(ctx, rt(I.justRatio(a.simple.n, a.q)) + ' × ' + rt(a.inv.ratio) + ' = ' + rt(a.inv.prod) + (a.inv.prodTwo ? '' : T('（≠ 2）', ' (≠ 2)')), x, y, a.inv.prodTwo ? C.muted : C['iv-gap'], 'left', 'alphabetic', fnt(12.5, 700));
      }
      if (a.enh.length && y + 24 * fs < r.y + r.h - 6) {
        y += 22 * fs;
        const e = a.enh[0];
        D.haloText(ctx, T('等音程：', 'Enharmonic: ') + ivName(e.n, e.q) + (e.hi ? ' (' + a.lo.name + '–' + e.hi.name + ')' : ''), x, y, C.muted, 'left', 'alphabetic', fnt(12, 600));
      }
    } else {
      const y1 = r.y + 26 * fs;
      D.haloText(ctx, ivName(a.n, a.q), x, y1, C.text, 'left', 'alphabetic', fnt(19, 800));
      D.haloText(ctx, a.lo.full + ' → ' + a.hi.full, r.x + r.w - 14, y1, C.muted, 'right', 'alphabetic', fnt(12.5, 600));
      const y2 = y1 + 24 * fs;
      const s = a.tuning === 'just' ? T('純律 ', 'Just ') + rt(a.ratio) + ' = ' + fx(a.centsJ, 2) + T(' 音分', ' cents') : T('平均律 ', 'Equal ') + fx(a.centsE, 0) + T(' 音分', ' cents') + T('（' + a.semis + ' 個半音）', ' (' + a.semis + ' semitones)');
      D.haloText(ctx, s, x, y2, C['iv-main'], 'left', 'alphabetic', fnt(13.5, 800));
      const y3 = y2 + 20 * fs;
      if (!(a.n === 8 && a.q === 'A')) D.haloText(ctx, T('轉位：', 'Inversion: ') + ivName(a.inv.n, a.inv.q) + ' ' + rt(a.inv.ratio) + (a.inv.prodTwo ? '' : T('（相乘 ≠ 2）', ' (product ≠ 2)')), x, y3, a.inv.prodTwo ? C['iv-inv'] : C['iv-gap'], 'left', 'alphabetic', fnt(12, 700));
    }
  }

  // ---------- 音分尺 ----------
  let scaleMax = 1200;
  function scaleRange() {
    let m = Math.max(1200, A.centsJ || 0, A.centsE || 0);
    if (A.chain) m = Math.max(m, A.chain.centsJ, A.chain.centsE, A.chain.tableCents || 0);
    return Math.min(3600, 1200 * Math.ceil((m + 0.5) / 1200));
  }
  function hatch(x0, y, x1, h, color) {
    const a = Math.min(x0, x1), b = Math.max(x0, x1);
    if (b - a < 0.5) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(a, y, Math.max(1.5, b - a), h); ctx.clip();
    ctx.fillStyle = alpha(color, D.dark ? 0.35 : 0.25); ctx.fillRect(a, y, Math.max(1.5, b - a), h);
    ctx.strokeStyle = alpha(color, 0.85); ctx.lineWidth = 1;
    for (let x = a - h; x < b + h; x += 5) { ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + h, y); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(a, y - 3); ctx.lineTo(a, y + h + 3); ctx.moveTo(b, y - 3); ctx.lineTo(b, y + h + 3); ctx.stroke();
  }
  function labelIn(text, x0, x1, yMid, color, font) {
    ctx.font = font;
    const w = ctx.measureText(text).width;
    if (w + 10 <= x1 - x0) { ctx.fillStyle = D.dark ? '#0d0f13' : '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, (x0 + x1) / 2, yMid + 0.5); return true; }
    return false;
  }
  function axis(px, x0, x1, y) {
    ctx.save();
    ctx.strokeStyle = alpha(C.text, 0.45); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y + 0.5); ctx.lineTo(x1, y + 0.5); ctx.stroke();
    const per = (x1 - x0) / (scaleMax / 100);
    const lstep = [100, 200, 300, 600, 1200].find(function (s) { return per * s / 100 >= 34 * fs; }) || 1200;
    for (let c = 0; c <= scaleMax + 1e-6; c += 100) {
      const x = Math.round(px(c)) + 0.5, oct = c % 1200 === 0;
      ctx.strokeStyle = alpha(C.text, oct ? 0.7 : 0.35); ctx.lineWidth = oct ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(x, y - (oct ? 7 : 4)); ctx.lineTo(x, y + (oct ? 5 : 3)); ctx.stroke();
      if (c % lstep === 0) {
        ctx.fillStyle = oct ? C.text : C.muted; ctx.font = fnt(10.5, oct ? 700 : 500); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(String(c), x, y + 7);
      }
    }
    ctx.restore();
  }
  function drawRuler(now) {
    const r = L.ruler;
    panel(r);
    scaleMax = scaleRange();
    const x0 = r.x + 16, x1 = r.x + r.w - 16;
    const px = function (c) { return x0 + (x1 - x0) * c / scaleMax; };
    const title = T('音分尺：長度 ∝ 音分（比值相乘 = 長度相接）', 'Cents ruler: length ∝ cents (multiplying ratios = joining lengths)');
    D.haloText(ctx, title, r.x + 12, r.y + 17 * fs, C.text, 'left', 'alphabetic', fnt(12, 700));
    ctx.font = fnt(12, 700);
    const titleEnd = r.x + 12 + ctx.measureText(title).width;
    const yAxis = r.y + r.h - 26 * fs;
    // 八度的垂直參考線
    for (let c = 1200; c <= scaleMax; c += 1200) {
      const x = Math.round(px(c)) + 0.5;
      ctx.strokeStyle = alpha(C.text, 0.18); ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(x, r.y + 26 * fs); ctx.lineTo(x, yAxis); ctx.stroke(); ctx.setLineDash([]);
      const ol = c === 1200 ? T('八度', 'octave') : T(c / 1200 + ' 個八度', c / 1200 + ' octaves');
      ctx.font = fnt(10.5, 600);
      if (x - 3 - ctx.measureText(ol).width > titleEnd + 8) D.haloText(ctx, ol, x - 3, r.y + 17 * fs, C.muted, 'right', 'alphabetic', fnt(10.5, 600));
    }
    axis(px, x0, x1, yAxis);
    const bh = Math.round(20 * fs), yb = r.y + 30 * fs;
    // 音程長條（轉位動畫時長度跟著變）
    let c = A.cents;
    const u = ease(animU(now));
    if (state.anim && u < 1 && state.anim.c1 != null) c = state.anim.c0 + (state.anim.c1 - state.anim.c0) * u;
    const xe = px(c);
    if (xe - x0 > 2) D.block(ctx, x0, yb, xe - x0, bh, C['iv-main'], { r: 5 });
    else { ctx.fillStyle = C['iv-main']; ctx.fillRect(x0 - 1, yb, 3, bh); }
    // 複音程：八度的分隔
    if (A.compound) for (let k = 1200; k < c; k += 1200) { const x = px(k); ctx.strokeStyle = alpha('#ffffff', 0.8); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, yb + 2); ctx.lineTo(x, yb + bh - 2); ctx.stroke(); }
    const lab = ivShort(A.n, A.q) + ' ' + fx(c, A.tuning === 'just' ? 2 : 0);
    if (!labelIn(lab, x0, xe, yb + bh / 2, C['iv-main'], fnt(11.5, 700))) D.haloText(ctx, lab, xe + 6, yb + bh / 2, C['iv-main'], 'left', 'middle', fnt(11.5, 700));
    // 另一種音律的位置（小三角）
    const other = A.tuning === 'just' ? A.centsE : A.centsJ;
    if (other != null && !(state.anim && u < 1)) {
      const xo = px(other), yt = yb - 3;
      ctx.fillStyle = C.muted;
      ctx.beginPath(); ctx.moveTo(xo, yt); ctx.lineTo(xo - 4.5, yt - 7); ctx.lineTo(xo + 4.5, yt - 7); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = alpha(C.muted, 0.8); ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(xo + 0.5, yb); ctx.lineTo(xo + 0.5, yb + bh); ctx.stroke(); ctx.setLineDash([]);
    }
    // 轉位（虛框）：從音程的終點接到八度附近
    const y2 = yb + bh + 10 * fs;
    if (!A.compound && !(A.n === 8 && A.q === 'A') && !(state.anim && u < 1)) {
      const ic = A.tuning === 'just' ? A.inv.centsJ : A.inv.centsE;
      const xs = px(A.cents), xi = px(A.cents + ic);
      ctx.save();
      D.roundRect(ctx, Math.min(xs, xi), y2, Math.max(2, Math.abs(xi - xs)), bh, 5);
      ctx.fillStyle = alpha(C['iv-inv'], D.dark ? 0.22 : 0.14); ctx.fill();
      ctx.strokeStyle = C['iv-inv']; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      const il = T('轉位 ', 'inv. ') + ivShort(A.inv.n, A.inv.q) + (A.tuning === 'just' ? ' ' + rt(A.inv.ratio) : '');
      ctx.font = fnt(11, 700);
      if (ctx.measureText(il).width + 10 <= Math.abs(xi - xs)) D.haloText(ctx, il, (xs + xi) / 2, y2 + bh / 2, C['iv-inv'], 'center', 'middle', fnt(11, 700));
      else D.haloText(ctx, il, xs - 6, y2 + bh / 2, C['iv-inv'], 'right', 'middle', fnt(11, 700));
      // 合起來和八度比
      if (A.tuning === 'just' && !A.inv.prodTwo) {
        hatch(px(1200), y2 - 2, xi, bh + 4, C['iv-gap']);
        D.pill(ctx, sg(A.cents + ic - 1200, 2) + T(' 音分 = ', ' cents = ') + rt(A.inv.prodComma && A.inv.prodComma.r), Math.min(x1, Math.max(xi, px(1200)) + 4), y2 - 4, C['iv-gap'], 'right', fnt(11, 700));
      }
    } else if (A.compound && !(state.anim && u < 1)) {
      D.haloText(ctx, T('複音程 = ', 'Compound = ') + (A.octPart === 1 ? T('八度', 'an octave') : T(A.octPart + ' 個八度', A.octPart + ' octaves')) + ' + ' + ivName(A.n - 7 * A.octPart, A.q), x0, y2 + bh / 2, C.muted, 'left', 'middle', fnt(11.5, 600));
    }
  }

  // ---------- 疊音程 ----------
  function drawStack() {
    const r = L.stack;
    panel(r);
    const c = A.chain;
    if (!c) {
      D.haloText(ctx, T('疊音程：按「＋ 疊上去」，把音程像積木一樣接起來。', 'Stacking: press “+ Stack it on” to join intervals like building blocks.'), r.x + r.w / 2, r.y + r.h / 2, C.muted, 'center', 'middle', fnt(12, 600));
      return;
    }
    const x0 = r.x + 16, x1 = r.x + r.w - 16;
    const px = function (cc) { return x0 + (x1 - x0) * cc / scaleMax; };
    const just = A.tuning === 'just';
    const head = c.notes.map(function (x) { return x.full; }).join(' → ') + T('：', ': ') + c.bricks.map(function (b) { return ivShort(b.n, b.q); }).join(' + ') + ' = ' + (c.total && c.total.q ? ivName(c.total.n, c.total.q) : '?');
    ctx.font = fnt(12, 700);
    const head2 = ctx.measureText(head).width > r.w - 24 ? head.slice(head.indexOf(T('：', ': ')) + T('：', ': ').length) : head;
    D.haloText(ctx, head2, r.x + 12, r.y + 17 * fs, C.text, 'left', 'alphabetic', fnt(12, 700));
    const bh = Math.round(20 * fs);
    let y = r.y + 28 * fs;
    // 第一列：積木
    let acc = 0;
    const sounding = state.play && state.play.kind === 'stack' ? soundingNow() : [];
    c.bricks.forEach(function (b, i) {
      const cc = just ? b.centsJ : b.centsE;
      const xa = px(acc), xb = px(acc + cc);
      D.block(ctx, xa + 0.5, y, Math.max(2, xb - xa - 1), bh, brickColor(i), { r: 5 });
      const lab = ivShort(b.n, b.q) + (just ? ' ' + rt(b.ratio) : '');
      if (!labelIn(lab, xa, xb, y + bh / 2, brickColor(i), fnt(11, 700))) labelIn(ivShort(b.n, b.q), xa, xb, y + bh / 2, brickColor(i), fnt(10.5, 700));
      acc += cc;
    });
    // 每個音的位置（小圓點，播放時亮起）
    let a2 = 0;
    c.notes.forEach(function (nt, i) {
      if (i > 0) a2 += just ? c.bricks[i - 1].centsJ : c.bricks[i - 1].centsE;
      const on = sounding.indexOf(i) >= 0;
      D.ball(ctx, px(a2), y + bh + 5, on ? 4.5 : 3, on ? C.accent : C.text, { glow: on ? 0.6 : 0, shadow: false });
    });
    const xEnd = px(acc);
    const sumTxt = '= ' + (just ? rt(c.prod) + ' · ' + fx(c.centsJ, 2) : fx(c.centsE, 0)) + T(' 音分', ' cents');
    ctx.font = fnt(11.5, 800);
    const sw = ctx.measureText(sumTxt).width + 12;
    D.pill(ctx, sumTxt, xEnd + sw + 6 <= x1 + 14 ? xEnd + 6 : xEnd - 6, y + bh / 2 + 9 * fs, C.text, xEnd + sw + 6 <= x1 + 14 ? 'left' : 'right', fnt(11.5, 800));
    // 第二列：表上的比值；第三列：上面選的音程
    const refs = [];
    if (c.total && c.total.q && c.table) refs.push({ c: just ? c.tableCents : c.centsE, label: T('表上的', 'table ') + ivShort(c.total.n, c.total.q) + (just ? ' ' + rt(c.table) : ''), color: C.muted, comma: just ? c.tableComma : null, diff: just ? c.tableDiff : 0 });
    if (cmpMain(c)) refs.push({ c: A.cents, label: T('上面選的', 'chosen ') + ivShort(A.n, A.q) + (just ? ' ' + rt(A.ratio) : ''), color: C['iv-main'], comma: just ? c.mainComma : null, diff: c.mainDiff });
    y += bh + 16 * fs;
    refs.forEach(function (rf) {
      const xr = px(rf.c);
      ctx.save();
      D.roundRect(ctx, x0, y, Math.max(2, xr - x0), bh * 0.8, 5);
      ctx.fillStyle = alpha(rf.color, D.dark ? 0.25 : 0.16); ctx.fill();
      ctx.strokeStyle = alpha(rf.color, 0.9); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
      ctx.font = fnt(11, 700);
      D.haloText(ctx, rf.label, x0 + 6, y + bh * 0.4, rf.color === C.muted ? C.text : rf.color, 'left', 'middle', fnt(11, 700));
      const d = acc - rf.c;
      if (Math.abs(d) > 1e-6) {
        hatch(xr, y - 2, xEnd, bh * 0.8 + 4, C['iv-gap']);
        const t = sg(d, just ? 2 : 0) + T(' 音分', ' cents') + (rf.comma ? ' = ' + rt(rf.comma.r) : '');
        ctx.font = fnt(11, 700);
        const tw = ctx.measureText(t).width + 12, xr2 = Math.max(xr, xEnd) + 6;
        D.pill(ctx, t, xr2 + tw <= x1 + 14 ? xr2 : Math.min(xr, xEnd) - 6, y + bh * 0.8 + 1, C['iv-gap'], xr2 + tw <= x1 + 14 ? 'left' : 'right', fnt(11, 700));
      } else {
        D.haloText(ctx, T('✓ 剛好一樣', '✓ exactly equal'), Math.min(x1, xr + 6), y + bh * 0.4, C['iv-lo'], xr + 90 > x1 ? 'right' : 'left', 'middle', fnt(11, 700));
      }
      y += bh * 0.8 + 10 * fs;
    });
    // 垂直對齊線：疊出來的終點
    ctx.strokeStyle = alpha(C.text, 0.4); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(Math.round(xEnd) + 0.5, r.y + 26 * fs); ctx.lineTo(Math.round(xEnd) + 0.5, Math.min(r.y + r.h - 4, y)); ctx.stroke(); ctx.setLineDash([]);
  }

  function draw(now) {
    D.backdrop(ctx, W, H);
    drawStaff(now);
    drawCard();
    drawRuler(now);
    drawStack();
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
        let idx = -1;
        state.play.events.forEach(function (e, i) { if (el >= e.t && el < e.t + e.len) idx = i; });
        if (idx !== state.play.idx) { state.play.idx = idx; updateKeysOn(); if (view3 && view3.active) view3.rebuild(); }
      }
    }
    if (state.anim) { if (now - state.anim.t0 < 760) more = true; else state.anim = null; }
    if (!view3 || !view3.active) draw(now);
    if (view3 && view3.active) view3.frame();
    if (more) requestDraw();
  }

  // =====================================================================
  // 3D：切換到 3D 時才載入 js/intervals-3d.js 與 three.js
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    I: I, T: T, D: D,
    colors: function () { return C; },
    fs: function () { return fs; },
    data: function () { return { a: A, sounding: state.play ? { kind: state.play.kind, which: soundingNow() } : null }; },
    ivName: ivName, ivShort: ivShort, rt: rt, fx: fx, sg: sg,
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 譜與音分尺。', 'The 3D graphics context was lost, so the view switched back to the 2D staff and ruler.');
    }
  };
  function rebuild3D() { if (view3 && view3.active) view3.rebuild(); }
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Intervals3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Intervals3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/intervals-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Intervals3D) throw new Error('intervals-3d.js did not load');
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
        view3 = window.Intervals3D.create(lib, host3, bridge);
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
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 譜與音分尺。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D staff and ruler are kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ---------- 分享目前設定：下方音（含八度）、度數、性質與疊好的音程（音律、播放方式、音長、點鍵盤設定由 classroom.js 記錄） ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      return { l: state.lo.full, n: state.n, q: state.q, c: state.chain ? { s: state.chain.start.full, b: state.chain.bricks.map(function (b) { return b.q + b.n; }) } : null };
    },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      const lo = I.parseNote(o.l);
      const n = Math.round(+o.n), q = String(o.q || '');
      if (lo && Math.abs(lo.acc) <= 2 && lo.oct >= 3 && lo.oct <= 6 && n >= 1 && n <= I.MAX_NUM && I.allowedQualities(n).indexOf(q) >= 0 && I.upperOf(lo, n, q)) {
        state.lo = lo; state.n = n; state.q = q;
      }
      state.chain = null;
      if (o.c && Array.isArray(o.c.b)) {
        const st = I.parseNote(o.c.s);
        const bricks = o.c.b.map(function (s) { const m = /^(d|m|P|M|A)(\d+)$/.exec(String(s)); return m ? { n: +m[2], q: m[1] } : null; })
          .filter(function (b) { return b && b.n >= 1 && b.n <= I.MAX_NUM && I.allowedQualities(b.n).indexOf(b.q) >= 0; }).slice(0, I.MAX_BRICKS);
        if (st && Math.abs(st.acc) <= 2 && bricks.length && I.stack(st, bricks).ok) state.chain = { start: st, bricks: bricks };
      }
      stopPlay();
      state.anim = null;
      recompute(); renderAll(); resize();
    }
  });

  // 給測試用的介面（不影響畫面）
  window.__iv = {
    state: state,
    analysis: function () { return A; },
    view3: function () { return view3; }
  };

  // =====================================================================
  // 啟動（不發聲、不送任務事件）
  // =====================================================================
  readColors();
  ['loLetter', 'loAcc', 'num'].forEach(function (id) { $(id).setAttribute('data-share-skip', ''); });
  $('qualSeg').setAttribute('data-share-skip', '');
  piano.setAttribute('data-share-skip', '');
  $('ivTable').setAttribute('data-share-skip', '');
  document.querySelector('.view-bar').setAttribute('data-share-skip', '');
  (function initFromControls() {
    state.pmode = $('pmode').value || 'both';
    document.querySelectorAll('#tuneSeg [data-tune]').forEach(function (b) { if (b.getAttribute('aria-pressed') === 'true') state.tuning = b.dataset.tune; });
  })();
  readDur();
  updateSoundButton();
  recompute();
  setKbRange();
  renderAll();
  updateStop();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    renderAll();
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
