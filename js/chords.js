/*
 * chords.js — 「和弦的頻率比」頁面程式
 *
 * 畫面：
 *   #cv 上半：合成波形（純律時每個週期 T 一條色帶；平均律時把第一個「純律週期」的形狀用虛線複製到後面，看它怎麼錯開）。
 *   #cv 下半：泛音列階梯（對數頻率軸；第 k 根 = 虛擬基頻 × k；和弦音放在自己的那一根上；20 Hz 與 200 Hz 以下打上底色）。
 *   #kb：鍵盤（只顯示），和弦音依角色上色；播放和弦進行時顯示正在響的那個和弦。
 *   3D（js/chords-3d.js，第一次按「3D 曲線」才載入）：三維李薩如曲線。
 * 聲音：一律經過 MusicAudio；學生按了才發聲；按過「▶ 播放和弦」、和弦還在響時改設定，聲音跟著滑過去（任務事件 mode 'live'）。
 * 任務事件見 js/missions/chords.js 開頭的說明；資料一律由 ChordsCore.payload／progPayload／pickPayload／growPayload 產生，
 * 和 tools/mission-proofs/chords.js 用的相同。分享連結還原時不送事件。
 */
(function () {
  'use strict';
  const CC = window.ChordsCore, MT = window.MusicTheory, D = window.LabDraw, AU = window.MusicAudio;
  if (!CC || !MT || !D || !AU) return;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha, shade = D.shade;
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const BLOCK_DUR = 8;      // 「▶ 播放和弦」最長秒數（純音由聲音引擎限制在 4 秒）
  const PURE_DUR = 4;
  const ARP_STEP = 0.36;    // 分解和弦：相鄰兩音的間隔（秒）
  const ARP_HOLD = 1.8;     // 最後一個音進來之後，全部一起再響多久
  const PROG_STEP = 1.35;   // 和弦進行：每個和弦的長度（秒）
  const PROG_NOTE = 1.22;
  const PICK_DUR = 1.8;     // 點清單裡的一個和弦
  const GAIN = 0.5;         // 每個音的音量 = GAIN ÷ √(音數)
  const SWEEP_SEC = 4;      // 播放時游標掃過整個顯示時間要幾秒（放慢倍數 = SWEEP_SEC ÷ 顯示的時間）
  const LOG_MAX = 10;
  const nowS = function () { return performance.now() / 1000; };

  // ---------- 狀態 ----------
  const state = {
    type: 'major', root: CC.ROOT_DEFAULT, tuning: 'equal', inv: 0, on: [true, true, true, true],
    timbre: 'organ', span: CC.SPAN_DEFAULT,
    prog: 'I-IV-V-I', pmode: 'equal',
    vis: null,        // { mode: 'block' | 'arp', t0, until, sound }：主和弦正在播放（畫面）
    progPlay: null,   // { t0, until, cur }：和弦進行正在播放
    pick: null,       // { idx, until }：正在聽清單裡的一個和弦
    log: []
  };
  let A = null, P = null;
  const voices = [null, null, null, null];   // 「▶ 播放和弦」每個和弦音（依 0 = 根音…）一個持續音
  let applying = false;                      // 程式正在改設定（分享還原、啟動），不是使用者的操作

  // ---------- 色彩與字體 ----------
  let C = {}, fs = 1;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'accent-soft', 'surface',
      'ch-r', 'ch-3', 'ch-5', 'ch-7', 'ch-wave', 'ch-per', 'ch-off', 'ch-key', 'ch-keyb']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    fs = Math.max(1, Math.min(1.45, parseFloat(cs.getPropertyValue('--fs')) || 1));
  }
  function roleColor(role) { return C[{ R: 'ch-r', '3': 'ch-3', '4': 'ch-3', '5': 'ch-5', '7': 'ch-7' }[role] || 'ch-r']; }
  function fnt(px, w) { return (w ? w + ' ' : '') + px + 'px ' + FONT; }

  // ---------- 文字 ----------
  function num(v, dec) { return v == null || !isFinite(v) ? '—' : v.toFixed(dec).replace('-', '−'); }
  function signed(v, dec) { return (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(dec); }
  function hz(f) { return f == null || !isFinite(f) ? '—' : f < 100 ? num(f, 2) : num(f, 1); }
  function msText(t) { if (t == null) return '—'; const v = t * 1000; return num(v, v < 100 ? 2 : 1) + ' ms'; }
  function roleAbbr(r) { return T({ R: '根', '3': '三', '4': '四', '5': '五', '7': '七' }[r] || r, r); }
  function roleName(r) { const n = CC.ROLE_NAMES[r]; return n ? T(n[0], n[1]) : r; }
  function typeShort(k) { const c = CC.CHORDS[k]; return T(c.short, c.enShort); }
  function chordName(a) { const c = CC.CHORDS[a.type]; return CC.spellRoot(a.root, false) + ' ' + T(c.zh, c.en); }
  function invName(i) { return T(['原位', '第一轉位', '第二轉位', '第三轉位'][i], ['root position', '1st inversion', '2nd inversion', '3rd inversion'][i]); }
  function tuningName(t) { return t === 'just' ? T('純律', 'just intonation') : T('十二平均律', 'equal temperament'); }
  function ratioText(ints) { return ints ? ints.join(' : ') : '—'; }
  function fracText(f) { return f[1] === 1 ? String(f[0]) : f[0] + '/' + f[1]; }
  function fvNote(f) { const n = CC.nearestNote(f); return CC.spellRoot(n.midi) + (Math.abs(n.off) >= 0.5 ? ' ' + signed(n.off, 0) + T(' 音分', '¢') : ''); }
  function nameWithOct(m) { return CC.spellRoot(m); }

  // =====================================================================
  // 計算
  // =====================================================================
  function compute() {
    A = CC.analyze({ type: state.type, root: state.root, tuning: state.tuning, inv: state.inv, on: state.on });
    P = CC.progression(state.prog, state.root, state.pmode);
  }
  function partials() { return CC.TIMBRES[state.timbre].slice(); }
  function noteGain(n) { return GAIN / Math.sqrt(Math.max(1, n)); }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function restoring() { return applying || !!(window.LabShare && window.LabShare.restoring); }
  function emit(type, data) { if (window.LabMission && !restoring()) window.LabMission.emit(type, data); }

  // =====================================================================
  // 聲音
  // =====================================================================
  function soundCheck() {
    if (AU.enabled() && AU.available()) return true;
    if (!AU.enabled()) { say(AU.offHint()); AU.flashSoundButton(); }
    else say(T('這個瀏覽器不能播放網頁聲音；畫面照常顯示。', 'This browser cannot play web audio; the pictures work as usual.'));
    return false;
  }
  function stopVoices(fade) {
    for (let i = 0; i < 4; i++) if (voices[i]) { const v = voices[i]; voices[i] = null; v.stop(fade == null ? 0.08 : fade); }
  }
  function startVoice(t, n, left) {
    return AU.sustain({ f0: t.f, partials: partials(), gain: noteGain(n), attack: 0.06, maxDur: Math.max(0.5, left),
      onEnd: function () { if (state.vis && state.vis.mode === 'block') endVis(true); } });
  }
  /** 和弦正在響時改了設定：每個和弦音滑到新頻率；關掉的停掉、新開的補上 */
  function updateVoices() {
    if (!state.vis || state.vis.mode !== 'block' || !state.vis.sound) return;
    const left = state.vis.until - nowS();
    const g = noteGain(A.count);
    for (let i = 0; i < 4; i++) {
      const t = A.tones.find(function (x) { return x.i === i; });
      const want = !!(t && t.on);
      if (want && voices[i] && voices[i].playing) voices[i].set({ f0: t.f, partials: partials(), gain: g }, 0.06);
      else if (want) voices[i] = startVoice(t, A.count, left);
      else if (voices[i]) { voices[i].stop(0.08); voices[i] = null; }
    }
  }
  function endVis(timeUp) {
    stopVoices(0.3);
    const was = state.vis;
    state.vis = null;
    if (timeUp && was && was.mode === 'block') say(T('播完了：和弦每次最長響 ' + (state.timbre === 'pure' ? PURE_DUR : BLOCK_DUR) + ' 秒。再按「▶ 播放和弦」可以再聽。',
      'Finished: a chord sounds for at most ' + (state.timbre === 'pure' ? PURE_DUR : BLOCK_DUR) + ' seconds. Press “▶ Play chord” to hear it again.'));
    updateStop(); requestDraw(); update3D();
  }
  function stopEverything(msg) {
    stopVoices(0.08);
    AU.stopAll(0.08);
    state.vis = null; state.progPlay = null; state.pick = null;
    renderProgCurrent();
    if (msg) say(msg);
    updateStop(); requestDraw(); update3D();
  }
  function busy() { return !!(state.vis || state.progPlay || state.pick); }
  function updateStop() { $('stop').disabled = !(AU.playing() || busy()); }
  AU.onChange(updateStop);

  function addLog() {
    state.log.unshift({ type: state.type, root: state.root, tuning: state.tuning, inv: state.inv, on: state.on.slice(), ints: A.ints, intsJ: A.intsJ, T: A.T, names: A.act.map(function (t) { return t.name; }) });
    if (state.log.length > LOG_MAX) state.log.length = LOG_MAX;
    renderLog();
  }
  function playBlock() {
    stopEverything();
    if (!A.count) return;
    const on = soundCheck();
    const dur = state.timbre === 'pure' ? PURE_DUR : BLOCK_DUR;
    state.vis = { mode: 'block', t0: nowS(), until: nowS() + dur, sound: on };
    if (on) A.tones.forEach(function (t) { if (t.on) voices[t.i] = startVoice(t, A.count, dur); });
    addLog();
    emit('play', CC.payload(A, { mode: 'block' }));
    if (on) say(T('播放中：', 'Playing: ') + summary() + T('。和弦還在響的時候改設定，聲音會跟著改。', '. Change the chord while it sounds and the sound follows.'));
    updateStop(); requestDraw(); update3D();
  }
  function playArp() {
    stopEverything();
    if (!A.count) return;
    const on = soundCheck();
    const n = A.count, total = (n - 1) * ARP_STEP + ARP_HOLD;
    state.vis = { mode: 'arp', t0: nowS(), until: nowS() + total, sound: on };
    if (on) {
      const t0 = AU.now() + 0.04;
      A.act.forEach(function (t, k) {
        AU.tone({ f0: t.f, partials: partials(), dur: total - k * ARP_STEP, gain: noteGain(n), attack: 0.02, release: 0.5, at: t0 + k * ARP_STEP });
      });
    }
    addLog();
    emit('play', CC.payload(A, { mode: 'arp' }));
    if (on) say(T('分解和弦：', 'Arpeggio: ') + A.act.map(function (t) { return t.name; }).join(' → '));
    updateStop(); requestDraw(); update3D();
  }
  $('play').addEventListener('click', playBlock);
  $('arp').addEventListener('click', playArp);
  $('stop').addEventListener('click', function () { stopEverything(T('已停止。', 'Stopped.')); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && busy()) stopEverything(T('已停止。', 'Stopped.')); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && busy()) stopEverything(); });

  // ---------- 和弦進行 ----------
  function progNotes(c) { return c.notes; }
  function playProg() {
    stopEverything();
    compute();
    const on = soundCheck();
    const n = P.chords.length;
    state.progPlay = { t0: nowS(), until: nowS() + n * PROG_STEP, cur: 0, p: P };
    if (on) {
      const t0 = AU.now() + 0.05;
      P.chords.forEach(function (c, k) {
        progNotes(c).forEach(function (x) {
          AU.tone({ f0: x.f, partials: partials(), dur: PROG_NOTE, gain: noteGain(4) * (x.bass ? 1.1 : 1), attack: 0.03, release: 0.35, at: t0 + k * PROG_STEP });
        });
      });
    }
    emit('prog', CC.progPayload(P));
    renderProgCurrent();
    if (on) say(T('播放和弦進行：', 'Playing: ') + P.chords.map(function (c) { return c.roman; }).join('–') + T('（', ' (') + pmodeName(state.pmode) + T('）', ')'));
    updateStop(); requestDraw();
  }
  function pickChord(idx) {
    stopEverything();
    const c = P.chords[idx];
    if (!c) return;
    const on = soundCheck();
    if (on) {
      const t0 = AU.now() + 0.03;
      progNotes(c).forEach(function (x) { AU.tone({ f0: x.f, partials: partials(), dur: PICK_DUR, gain: noteGain(4) * (x.bass ? 1.1 : 1), attack: 0.03, release: 0.4, at: t0 }); });
    }
    state.pick = { idx: idx, until: nowS() + PICK_DUR + 0.3, p: P };
    emit('progPick', CC.pickPayload(P, idx));
    renderProgCurrent();
    say(progChordSentence(c));
    updateStop(); requestDraw();
  }
  $('progPlay').addEventListener('click', playProg);
  function pmodeName(m) { return m === 'just' ? T('純律（固定音階）', 'just, fixed scale') : m === 'adaptive' ? T('純律（共同音不動）', 'just, common notes held') : T('十二平均律', 'equal temperament'); }
  function progChordSentence(c) {
    const r = c.tri ? c.tri.join(' : ') + (c.pure ? T('，純', ', pure') : T('，不純', ', not pure')) : T('平均律', 'equal temperament');
    return c.roman + T('（', ' (') + c.name + T('）：', '): ') + c.notes.map(function (x) { return x.name; }).join(' ') + T('，', ', ') + r +
      (c.commonPrev != null ? T('，和前一個和弦有 ' + c.commonPrev + ' 個共同音', ', ' + c.commonPrev + ' notes shared with the chord before') : '') +
      (Math.abs(c.rootCents) > 0.05 ? T('，根音偏了 ' + signed(c.rootCents, 2) + ' 音分', ', root shifted ' + signed(c.rootCents, 2) + ' cents') : '') + T('。', '.');
  }

  // =====================================================================
  // 控制面板
  // =====================================================================
  const typesEl = $('types'), tonesEl = $('tones'), rootEl = $('root');
  CC.ORDER.forEach(function (k) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('data-type', k);
    b.setAttribute('aria-pressed', 'false');
    typesEl.appendChild(b);
  });
  for (let m = CC.ROOT_LO; m <= CC.ROOT_HI; m++) {
    const o = document.createElement('option');
    o.value = String(m);
    rootEl.appendChild(o);
  }
  function labelControls() {
    typesEl.querySelectorAll('button').forEach(function (b) { b.textContent = typeShort(b.getAttribute('data-type')); });
    rootEl.querySelectorAll('option').forEach(function (o) { const m = +o.value; o.textContent = CC.spellRoot(m) + ' · ' + hz(MT.midiToFreq(m)) + ' Hz'; });
  }
  function syncControls() {
    typesEl.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-type') === state.type)); });
    rootEl.value = String(state.root);
    $('rootDown').disabled = state.root <= CC.ROOT_LO;
    $('rootUp').disabled = state.root >= CC.ROOT_HI;
    document.querySelectorAll('#tuning button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tuning') === state.tuning)); });
    const n = A.n;
    document.querySelectorAll('#invs button').forEach(function (b) {
      const i = +b.getAttribute('data-inv');
      b.disabled = i >= n;
      b.setAttribute('aria-pressed', String(i === state.inv));
      if (i >= n) b.title = T('三和弦只有三個音，沒有第三轉位', 'A triad has only three notes, so there is no 3rd inversion');
      else b.removeAttribute('title');
    });
    document.querySelectorAll('#timbre button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-timbre') === state.timbre)); });
    // 和弦音的開關：依和弦音的順序（根音、三音、五音、七音）
    const c = CC.CHORDS[state.type];
    let html = '';
    for (let i = 0; i < n; i++) {
      const t = A.tones.find(function (x) { return x.i === i; });
      const role = c.roles[i];
      html += '<button type="button" data-tone="' + i + '" aria-pressed="' + (state.on[i] ? 'true' : 'false') + '" style="border-left-color:' + roleColor(role) + '">' +
        roleName(role) + ' ' + t.name + '<small>' + hz(t.f) + ' Hz</small></button>';
    }
    if (tonesEl.getAttribute('data-html') !== html) { tonesEl.innerHTML = html; tonesEl.setAttribute('data-html', html); }
    document.querySelectorAll('#progs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-prog') === state.prog)); });
    document.querySelectorAll('#pmodes button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-pmode') === state.pmode)); });
    $('chordHint').textContent = chordHint();
  }
  function chordHint() {
    const c = CC.CHORDS[state.type];
    const parts = c.just.map(function (x) { return x; });
    const ivs = { major: T('大三度＋小三度', 'major third + minor third'), minor: T('小三度＋大三度', 'minor third + major third'), dim: T('小三度＋小三度', 'minor third + minor third'),
      aug: T('大三度＋大三度', 'major third + major third'), sus4: T('完全四度＋大二度', 'perfect fourth + major second'), dom7: T('大三和弦＋小七度', 'major triad + minor seventh'),
      maj7: T('大三和弦＋大七度', 'major triad + major seventh'), min7: T('小三和弦＋小七度', 'minor triad + minor seventh'), dim7: T('小三度疊三次', 'three minor thirds'),
      nat7: T('大三和弦＋泛音列的第 7 泛音', 'major triad + the 7th harmonic') }[state.type];
    return T(c.zh + '：' + ivs + '；平均律相對根音 ' + c.semis.join('、') + ' 個半音，純律 ' + parts.join(' : ') + '。',
      c.en + ': ' + ivs + '; equal temperament ' + c.semis.join(', ') + ' semitones above the root; just ' + parts.join(' : ') + '.');
  }

  /** 使用者改了和弦的設定 */
  function userChange() {
    if (state.inv >= CC.CHORDS[state.type].semis.length) state.inv = 0;
    const n = CC.CHORDS[state.type].semis.length;
    if (!state.on.slice(0, n).some(Boolean)) state.on = [true, true, true, true];
    const rootChanged = P && P.tonic !== state.root;
    compute();
    if (rootChanged && state.progPlay) { state.progPlay = null; AU.stopAll(0.08); }
    refreshAll();
    if (state.vis && state.vis.mode === 'block') {
      updateVoices();
      emit('play', CC.payload(A, { mode: 'live' }));
    } else emit('chord', CC.payload(A));
    say(summary());
  }
  typesEl.addEventListener('click', function (e) {
    const b = e.target.closest('button[data-type]');
    if (!b || b.getAttribute('data-type') === state.type) return;
    state.type = b.getAttribute('data-type');
    userChange();
  });
  rootEl.addEventListener('change', function () { const m = +rootEl.value; if (m !== state.root) { state.root = m; userChange(); } });
  $('rootDown').addEventListener('click', function () { if (state.root > CC.ROOT_LO) { state.root--; userChange(); } });
  $('rootUp').addEventListener('click', function () { if (state.root < CC.ROOT_HI) { state.root++; userChange(); } });
  $('tuning').addEventListener('click', function (e) {
    const b = e.target.closest('button[data-tuning]');
    if (!b || b.getAttribute('data-tuning') === state.tuning) return;
    state.tuning = b.getAttribute('data-tuning');
    userChange();
  });
  $('invs').addEventListener('click', function (e) {
    const b = e.target.closest('button[data-inv]');
    if (!b || b.disabled || +b.getAttribute('data-inv') === state.inv) return;
    state.inv = +b.getAttribute('data-inv');
    userChange();
  });
  tonesEl.addEventListener('click', function (e) {
    const b = e.target.closest('button[data-tone]');
    if (!b) return;
    const i = +b.getAttribute('data-tone'), n = A.n;
    const next = state.on.slice();
    next[i] = !next[i];
    if (!next.slice(0, n).some(Boolean)) { say(T('至少要留一個音。', 'Keep at least one note.')); return; }
    state.on = next;
    userChange();
  });
  $('timbre').addEventListener('click', function (e) {
    const b = e.target.closest('button[data-timbre]');
    if (!b || b.getAttribute('data-timbre') === state.timbre) return;
    state.timbre = b.getAttribute('data-timbre');
    if (state.vis && state.vis.mode === 'block') {
      // 純音最長 4 秒：正在響的和弦改成純音時，結束時間跟著縮短
      if (state.timbre === 'pure') state.vis.until = Math.min(state.vis.until, nowS() + PURE_DUR);
      updateVoices();
    }
    syncControls(); refreshAll();
    say(state.timbre === 'pure' ? T('音色：純音（每個音只有一個正弦波）。', 'Tone colour: pure tones (one sine wave per note).') : T('音色：風琴（近似，前 6 個泛音）。', 'Tone colour: organ (approximate, first six harmonics).'));
  });
  $('progs').addEventListener('click', function (e) {
    const b = e.target.closest('button[data-prog]');
    if (!b || b.getAttribute('data-prog') === state.prog) return;
    if (state.progPlay || state.pick) stopEverything();
    state.prog = b.getAttribute('data-prog');
    compute(); syncControls(); renderProg();
  });
  $('pmodes').addEventListener('click', function (e) {
    const b = e.target.closest('button[data-pmode]');
    if (!b || b.getAttribute('data-pmode') === state.pmode) return;
    if (state.progPlay || state.pick) stopEverything();
    state.pmode = b.getAttribute('data-pmode');
    compute(); syncControls(); renderProg();
  });
  $('progList').addEventListener('click', function (e) {
    const b = e.target.closest('button[data-idx]');
    if (b) pickChord(+b.getAttribute('data-idx'));
  });
  $('clearLog').addEventListener('click', function () { state.log = []; renderLog(); say(T('比較表已清除；和弦的設定不變。', 'Comparison table cleared; the chord settings are kept.')); });

  // ---------- 顯示的時間（對數滑桿） ----------
  const spanEl = $('span');
  if (window.LabNum) window.LabNum.register(spanEl, { toValue: CC.spanFromPos, toPos: CC.posFromSpan, min: CC.SPAN_MIN, max: CC.SPAN_MAX, decimals: 1 });
  function spanText(v) { return num(v, v < 10 ? 2 : v < 100 ? 1 : 0); }
  function refreshSpan() { $('spano').textContent = spanText(state.span); }
  spanEl.addEventListener('input', function () {
    state.span = Math.max(CC.SPAN_MIN, Math.min(CC.SPAN_MAX, val(spanEl)));
    refreshSpan(); requestDraw(); update3D();
  });

  // =====================================================================
  // 讀數、表格、和弦進行清單
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  function summary() {
    const s = chordName(A) + T('・', ' · ') + invName(A.inv) + T('・', ' · ') + tuningName(A.tuning);
    if (!A.count) return s;
    if (A.tuning === 'just') return s + T('：' + ratioText(A.ints) + '，週期 ' + msText(A.T) + '，虛擬基頻 ' + hz(A.fv) + ' Hz',
      ': ' + ratioText(A.ints) + ', period ' + msText(A.T) + ', virtual fundamental ' + hz(A.fv) + ' Hz');
    return s + (A.count > 1 ? T('：不會完全重複；在純律週期的那一刻錯開 ' + num(A.drift, 1) + '°', ': never repeats exactly; ' + num(A.drift, 1) + '° out of step after one just period') : '');
  }
  function updateReadouts() {
    const a = A;
    if (a.tuning === 'just') setHTML('bigRatio', ratioText(a.ints) + '<small>' + T('泛音列的第 ' + a.ints.join('、') + ' 根（最簡整數比）', 'rungs ' + a.ints.join(', ') + ' of the harmonic series (lowest terms)') + '</small>');
    else setHTML('bigRatio', (a.count > 1 ? '≈ ' + ratioText(a.intsJ) : '—') + '<small>' + T('十二平均律：無理數比，最接近的純律比是這個', 'Equal temperament: irrational ratios; the nearest just ratio is shown') + '</small>');
    const rows = [];
    const add = function (dt, dd, cls) { rows.push('<dt' + (cls ? ' class="' + cls + '"' : '') + '>' + dt + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + dd + '</dd>'); };
    setHTML('chordLine', chordName(a) + '<small>' + invName(a.inv) + T('・最低音 ', ' · bass ') + (a.count ? a.act[0].name + T('（', ' (') + roleName(a.bassRole) + T('）', ')') : '—') + '</small>');
    if (a.tuning === 'just') {
      add(T('週期 T', 'Period T'), msText(a.T));
      add(T('T 是根音週期的', 'T in root periods'), num(a.perRoot, a.perRoot % 1 ? 1 : 0) + T(' 倍', '×'));
      add(T('虛擬基頻 1/T', 'Virtual fundamental 1/T'), hz(a.fv) + ' Hz<br><small>≈ ' + fvNote(a.fv) + '</small>');
      add(T('每個音振動', 'Vibrations per T'), a.act.length ? a.ints.join(T('、', ', ')) + T(' 次', '') : '—');
    } else {
      add(T('週期 T', 'Period T'), a.count > 1 ? T('沒有（不會完全重複）', 'none (never repeats)') : msText(1 / a.act[0].f));
      if (a.count > 1) {
        add(T('純律週期時錯開', 'Slip after one just period'), num(a.drift, 1) + '°<br><small>' + T('純律版本的 T = ', 'just T = ') + msText(a.TJ) + '</small>');
        add(T('最接近重複', 'Closest repeat'), T('低音第 ' + a.near.k + ' 個週期', 'bass period ' + a.near.k) + '<br><small>t = ' + msText(a.near.t) + T('，差 ', ', off by ') + num(a.near.deg, 2) + '°</small>');
      }
    }
    if (a.gaps.length) add(T('相鄰兩音（音分）', 'Steps (cents)'), a.gaps.map(function (g) { return num(g, 1); }).join(' + ') + '<br><small>' + T('到八度還差 ', 'to the octave: ') + num(a.wrap, 1) + '</small>');
    setHTML('readout', rows.join(''));
    // 每個音的表格
    const devHead = a.tuning === 'just' ? T('和平均律差', 'vs equal') : T('和純律差', 'vs just');
    let h = '<thead><tr><th>' + T('音', 'Note') + '</th><th>Hz</th><th>' + T('對根音', 'to root') + '</th><th>' + T('音分', 'cents') + '</th><th>' + devHead + '</th></tr></thead><tbody>';
    a.tones.forEach(function (t) {
      const dev = CC.cents(t.rE) - CC.cents(t.rJ);
      const shown = a.tuning === 'just' ? -dev : dev;
      const cls = Math.abs(dev) > 30 ? 'bad-txt' : '';
      h += '<tr class="' + (t.on ? '' : 'off') + '"><td title="' + roleName(t.role) + '"><i class="dot" style="background:' + roleColor(t.role) + '"></i>' + t.name + '<small class="rl">' + roleAbbr(t.role) + (t.on ? '' : T('・關', ' off')) + '</small>' +
        '</td><td>' + hz(t.f) + '</td><td>' + (a.tuning === 'just' ? fracText(t.fracJ) : num(t.rE, 4)) + '</td><td>' + num(a.tuning === 'just' ? CC.cents(t.rJ) : 100 * t.semis, 1) +
        '</td><td class="' + cls + '">' + (Math.abs(shown) < 0.005 ? '0' : signed(shown, 2)) + '</td></tr>';
    });
    h += '</tbody>';
    setHTML('noteTable', h);
    $('tableHint').textContent = a.tuning === 'just'
      ? T('純律：對根音的比是分數。最後一欄是「這個音的純律 − 平均律」，單位音分。', 'Just: the ratio to the root is a fraction. The last column is just minus equal, in cents.')
      : T('平均律：對根音的比是 2 的 k/12 次方。最後一欄是「平均律 − 純律」，超過 30 音分的標紅色。', 'Equal temperament: the ratio to the root is 2 to the power k/12. The last column is equal minus just, in cents; more than 30 cents is shown in red.');
  }
  function renderLog() {
    const tb = $('logTable');
    $('logEmpty').hidden = state.log.length > 0;
    if (!state.log.length) { tb.innerHTML = ''; return; }
    let h = '<thead><tr><th>' + T('和弦', 'Chord') + '</th><th>' + T('音律', 'Tuning') + '</th><th>' + T('比值', 'Ratio') + '</th><th>T</th></tr></thead><tbody>';
    state.log.forEach(function (r) {
      const c = CC.CHORDS[r.type];
      const n = c.semis.length, partial = r.on.slice(0, n).some(function (x) { return !x; });
      h += '<tr><td>' + CC.spellRoot(r.root, false) + ' ' + T(c.short, c.enShort) + (r.inv ? '<small> ' + ['', T('一轉', '1st'), T('二轉', '2nd'), T('三轉', '3rd')][r.inv] + '</small>' : '') +
        (partial ? '<small>' + T('（部分）', ' (part)') + '</small>' : '') + '</td><td>' + (r.tuning === 'just' ? T('純律', 'Just') : T('平均律', 'Equal')) + '</td><td>' +
        (r.ints ? r.ints.join(':') : (r.intsJ && r.intsJ.length > 1 ? '≈ ' + r.intsJ.join(':') : '—')) + '</td><td>' + (r.T ? msText(r.T) : T('不重複', 'none')) + '</td></tr>';
    });
    tb.innerHTML = h + '</tbody>';
  }
  function renderProg() {
    let h = '';
    P.chords.forEach(function (c, k) {
      const r = c.tri ? c.tri.join(' : ') + (c.pure ? ' <span class="ok-txt">✓</span>' : ' <span class="bad-txt">✗</span>') : T('平均律', 'equal');
      const com = c.commonPrev != null ? T('・共同音 ' + c.commonPrev, ' · ' + c.commonPrev + ' shared') : '';
      const rc = Math.abs(c.rootCents) > 0.05 ? T('・根音 ', ' · root ') + signed(c.rootCents, 1) + T(' 音分', '¢') : '';
      h += '<li><button type="button" data-idx="' + k + '" aria-current="false"><span class="rn">' + c.roman + '</span><span class="l1">' + c.name + T('：', ': ') +
        c.notes.map(function (x) { return x.name; }).join(' ') + '</span><span class="l2">' + r + com + rc + '</span></button></li>';
    });
    setHTML('progList', h);
    let note = '';
    if (state.pmode === 'adaptive') note = Math.abs(P.drift) > 0.05
      ? T('最後的 I 比開頭的 I 低了 ' + num(-P.drift, 2) + ' 音分：每一步都唱得很純，家卻沉下去了。', 'The final I is ' + num(-P.drift, 2) + ' cents lower than the first: every step was pure, yet home has sunk.')
      : T('最後的 I 和開頭的 I 一樣高。', 'The final I is exactly as high as the first.');
    else if (state.pmode === 'just') note = P.chords.every(function (c) { return c.pure; }) ? T('這段進行在固定的純律音階裡，每個和弦都是純的。', 'In this fixed just scale every chord of the progression is pure.')
      : T('固定音階的純律：有和弦不是純的比例（標 ✗）。', 'Fixed just scale: some chords are not in pure ratios (marked ✗).');
    else note = T('十二平均律：每個和弦都一樣有一點不純，但轉一圈一定回得了家。', 'Equal temperament: every chord is equally a little impure, but you always get home.');
    setHTML('progDrift', note);
    renderProgCurrent();
  }
  function renderProgCurrent() {
    const cur = state.progPlay ? state.progPlay.cur : state.pick ? state.pick.idx : -1;
    $('progList').querySelectorAll('button[data-idx]').forEach(function (b) { b.setAttribute('aria-current', String(+b.getAttribute('data-idx') === cur)); });
  }
  function refreshAll() {
    syncControls();
    updateReadouts();
    renderProg();
    requestDraw();
    update3D();
  }

  // =====================================================================
  // 畫布
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const kbc = $('kb'), kctx = kbc.getContext('2d');
  let L = null, KB = null;
  function layout() {
    const W = cv.clientWidth || cv.parentElement.clientWidth || 600;
    const narrow = W < 560;
    const s = 0.88 + 0.12 * fs;
    const titleH = Math.round(26 * fs) + 8;
    const waveH = Math.round((narrow ? 150 : 178) * s);
    const axisH = Math.round(18 * fs) + 6;
    const lTitle = Math.round(26 * fs) + 6;
    const numH = Math.round(2 * 14 * fs) + 6;
    const railH = narrow ? 40 : 44;
    const nameRow = Math.round(17 * fs) + 3;
    const nameH = 2 * nameRow + 6;
    const zoneH = Math.round(15 * fs) + 6;
    const wy0 = titleH, wy1 = wy0 + waveH, ly0 = wy1 + axisH + 10;
    const ry0 = ly0 + lTitle + numH, ry1 = ry0 + railH;
    const H = ry1 + nameH + zoneH + 6;
    L = { W: W, H: H, narrow: narrow, x0: 12, x1: W - 12, wy0: wy0, wy1: wy1, ly0: ly0, ry0: ry0, ry1: ry1, numY: ry0 - 4, numRow: Math.round(14 * fs) + 1, nameY: ry1 + 5, nameRow: nameRow, zoneY: ry1 + nameH + 2 };
  }
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    layout();
    cv.style.height = L.H + 'px';
    cv.width = Math.round(L.W * dpr); cv.height = Math.round(L.H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const kw = kbc.clientWidth || L.W;
    const kh = Math.round(2 * (17 * fs + 5)) + (kw < 560 ? 74 : 88);
    kbc.style.height = kh + 'px';
    kbc.width = Math.round(kw * dpr); kbc.height = Math.round(kh * dpr);
    kctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    KB = { W: kw, H: kh };
    waveCache = null; ghostCache = null;
    requestDraw();
  }

  // ---------- 合成波形的取樣（參數改變時才重算） ----------
  let waveCache = null, ghostCache = null;
  function waveData(w) {
    const freqs = A.act.map(function (t) { return t.f; }), parts = CC.TIMBRES[state.timbre];
    const key = freqs.map(function (f) { return f.toFixed(6); }).join(',') + '|' + state.timbre + '|' + state.span + '|' + w;
    if (waveCache && waveCache.key === key) return waveCache;
    const spanS = state.span / 1000;
    let d;
    if (!freqs.length) d = { mode: 'none', peak: 1 };
    else {
      const fTop = Math.max.apply(null, freqs) * parts.length;
      const cpp = fTop * spanS / w;   // 最高泛音在每個像素裡振動幾次
      if (cpp < 0.2) {
        const n = w * 2, ys = new Float32Array(n + 1);
        let m = 0;
        for (let j = 0; j <= n; j++) { const v = CC.waveAt(freqs, parts, spanS * j / n); ys[j] = v; m = Math.max(m, Math.abs(v)); }
        d = { mode: 'line', n: n, ys: ys, peak: m || 1 };
      } else {
        const S = Math.max(4, Math.min(40, Math.ceil(cpp * 8)));
        const lo = new Float32Array(w), hi = new Float32Array(w);
        let m = 0;
        for (let c = 0; c < w; c++) {
          let a = Infinity, b = -Infinity;
          for (let j = 0; j <= S; j++) { const v = CC.waveAt(freqs, parts, spanS * (c + j / S) / w); if (v < a) a = v; if (v > b) b = v; }
          lo[c] = a; hi[c] = b; m = Math.max(m, -a, b);
        }
        d = { mode: 'env', w: w, lo: lo, hi: hi, peak: m || 1 };
      }
    }
    d.key = key;
    waveCache = d;
    return d;
  }
  /** 平均律：第一個「純律週期」[0, T_J] 的形狀（往後複製當對照） */
  function ghostData(px) {
    const freqs = A.act.map(function (t) { return t.f; }), parts = CC.TIMBRES[state.timbre];
    const key = freqs.join(',') + '|' + state.timbre + '|' + Math.round(px);
    if (ghostCache && ghostCache.key === key) return ghostCache;
    const n = Math.max(8, Math.min(4000, Math.round(px * 2))), ys = new Float32Array(n + 1);
    for (let j = 0; j <= n; j++) ys[j] = CC.waveAt(freqs, parts, A.TJ * j / n);
    ghostCache = { key: key, n: n, ys: ys };
    return ghostCache;
  }
  function niceStep(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v))), r = v / p;
    return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * p;
  }

  function drawWave() {
    const x0 = L.x0, x1 = L.x1, y0 = L.wy0, y1 = L.wy1, w = Math.max(10, Math.round(x1 - x0));
    const span = state.span, xT = function (ms) { return x0 + ms / span * (x1 - x0); };
    const ym = (y0 + y1) / 2, amp = (y1 - y0) / 2 - 6;
    // 面板底
    D.roundRect(ctx, x0 - 4, y0 - 2, x1 - x0 + 8, y1 - y0 + 4, 8);
    ctx.fillStyle = alpha(C.text, D.dark ? 0.035 : 0.025); ctx.fill();
    ctx.strokeStyle = alpha(C.border, 0.9); ctx.lineWidth = 1; ctx.stroke();
    // 純律：每個週期一條色帶
    const fsz = Math.round(12 * fs);
    if (A.tuning === 'just' && A.count) {
      const Tms = A.T * 1000, nP = span / Tms, pw = (x1 - x0) * Tms / span;
      if (pw >= 2.5) {
        for (let k = 0; k * Tms < span; k++) {
          const a = xT(k * Tms), b = Math.min(x1, xT((k + 1) * Tms));
          ctx.fillStyle = alpha(C['ch-per'], k % 2 ? (D.dark ? 0.07 : 0.05) : (D.dark ? 0.15 : 0.11));
          ctx.fillRect(a, y0, b - a, y1 - y0);
          if (k > 0 && pw >= 6) { ctx.fillStyle = alpha(C['ch-per'], 0.55); ctx.fillRect(Math.round(a) - 0.5, y0, 1, y1 - y0); }
        }
      } else {
        // 太密：只在上緣畫刻度
        ctx.fillStyle = alpha(C['ch-per'], 0.5);
        for (let k = 1; k * Tms < span; k++) ctx.fillRect(Math.round(xT(k * Tms)), y0, 1, 5);
      }
      // 第一個週期的括號
      if (pw >= 34) {
        const yb = y0 + 10, a = xT(0) + 2, open = Tms > span, b = open ? x1 - 3 : xT(Tms) - 2;
        ctx.strokeStyle = C['ch-per']; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(a, yb + 5); ctx.lineTo(a, yb); ctx.lineTo(b, yb);
        if (open) { ctx.moveTo(b - 6, yb - 4); ctx.lineTo(b, yb); ctx.lineTo(b - 6, yb + 4); } else ctx.lineTo(b, yb + 5);
        ctx.stroke();
        D.pill(ctx, open ? T('T 比畫面長 →', 'T is longer →') : 'T', (a + b) / 2, yb + 1 + 8 * fs, C['ch-per'], 'center', fnt(fsz, 700));
      }
      void nP;
    }
    // 平均律：第一個純律週期的形狀往後複製（虛線）、錯開的角度、最接近重複的時刻
    const wd = waveData(w);
    const sc = amp / wd.peak;
    let driftMark = null, nearMark = null;
    if (A.tuning === 'equal' && A.count > 1) {
      const TJms = A.TJ * 1000, pw = (x1 - x0) * TJms / span;
      if (pw >= 22 && TJms < span) {
        const g = ghostData(pw);
        ctx.save();
        ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
        ctx.strokeStyle = alpha(C['ch-per'], 0.85); ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]); ctx.lineJoin = 'round';
        for (let k = 1; k * TJms < span && k <= 40; k++) {
          ctx.beginPath();
          for (let j = 0; j <= g.n; j++) {
            const x = xT((k + j / g.n) * TJms);
            if (x > x1 + 2) break;
            const y = ym - g.ys[j] * sc;
            if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          }
          ctx.stroke();
          ctx.fillStyle = alpha(C['ch-per'], 0.45); ctx.fillRect(Math.round(xT(k * TJms)) - 0.5, y0, 1, y1 - y0);
        }
        ctx.restore();
        driftMark = xT(TJms);
      }
      const nt = A.near.t * 1000;
      if (nt <= span && (x1 - x0) * nt / span > 4 && Math.abs(nt - TJms) > 1e-6) nearMark = xT(nt);
    }
    // 合成波形
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    ctx.strokeStyle = alpha(C.text, 0.18); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, Math.round(ym) + 0.5); ctx.lineTo(x1, Math.round(ym) + 0.5); ctx.stroke();
    if (wd.mode === 'line') {
      D.tube(ctx, function (c) {
        for (let j = 0; j <= wd.n; j++) { const x = x0 + (x1 - x0) * j / wd.n, y = ym - wd.ys[j] * sc; if (j) c.lineTo(x, y); else c.moveTo(x, y); }
      }, C['ch-wave'], 2.6);
    } else if (wd.mode === 'env') {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, alpha(C['ch-wave'], 0.85)); g.addColorStop(0.5, alpha(C['ch-wave'], 0.55)); g.addColorStop(1, alpha(C['ch-wave'], 0.85));
      ctx.fillStyle = g;
      ctx.beginPath();
      for (let c = 0; c < wd.w; c++) { const x = x0 + (x1 - x0) * (c + 0.5) / wd.w; const y = ym - wd.hi[c] * sc; if (c) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      for (let c = wd.w - 1; c >= 0; c--) { const x = x0 + (x1 - x0) * (c + 0.5) / wd.w; ctx.lineTo(x, ym - wd.lo[c] * sc); }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // 錯開的角度與最接近重複
    if (driftMark != null) D.pill(ctx, T('錯開 ', 'slip ') + num(A.drift, 1) + '°', Math.min(x1 - 4, Math.max(x0 + 4, driftMark)), y1 - 4, C['ch-off'], driftMark > x1 - 80 ? 'right' : 'center', fnt(Math.round(11.5 * fs), 600));
    if (nearMark != null) {
      ctx.save(); ctx.strokeStyle = alpha(C['ch-off'], 0.8); ctx.setLineDash([2, 3]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(nearMark, y0); ctx.lineTo(nearMark, y1); ctx.stroke(); ctx.restore();
      if (driftMark == null || Math.abs(nearMark - driftMark) > 90) D.pill(ctx, T('最接近重複 ', 'closest ') + num(A.near.deg, 1) + '°', Math.min(x1 - 4, nearMark), y0 + 4 + 16 * fs, C['ch-off'], nearMark > x1 - 110 ? 'right' : 'center', fnt(Math.round(11 * fs), 600));
    }
    // 播放游標（放慢）
    if (state.vis && !D.reducedMotion()) {
      const u = ((nowS() - state.vis.t0) % SWEEP_SEC) / SWEEP_SEC, x = x0 + u * (x1 - x0);
      ctx.fillStyle = alpha(C.accent, 0.9); ctx.fillRect(Math.round(x) - 1, y0, 2, y1 - y0);
      D.pill(ctx, T('放慢 ', 'slowed ') + slowText() + T(' 倍', '×'), x1 - 4, y1 - 4 - (driftMark != null && driftMark > x1 - 160 ? 22 * fs : 0), C.accent, 'right', fnt(Math.round(11 * fs), 600));
    }
    // 標題
    const title = T('合成波形', 'Combined waveform');
    D.pill(ctx, title, x0, y0 - 6, C['ch-wave'], 'left', fnt(Math.round(12.5 * fs), 700));
    let right;
    if (!A.count) right = '—';
    else if (A.tuning === 'just') right = T('每 ', 'repeats every ') + msText(A.T) + T(' 重複一次', '');
    else if (A.count === 1) right = T('單一個音：週期 ', 'one note: period ') + msText(1 / A.act[0].f);
    else right = T('平均律：不會完全重複', 'equal: never repeats');
    ctx.font = fnt(Math.round(12.5 * fs), 700);
    const tw = ctx.measureText(title).width + 24;
    ctx.font = fnt(Math.round(12 * fs), 700);
    const rw = ctx.measureText(right).width + 14;
    if (x0 + tw + rw < x1) D.pill(ctx, right, x1, y0 - 6, A.tuning === 'just' ? C['ch-per'] : C['ch-off'], 'right', fnt(Math.round(12 * fs), 700));
    // 時間軸
    const step = niceStep(span / (L.narrow ? 3.5 : 6));
    ctx.font = fnt(Math.round(11 * fs), 500);
    ctx.fillStyle = C.muted; ctx.textBaseline = 'top';
    const ticks = [];
    for (let k = 0; k * step <= span * (1 + 1e-9); k++) ticks.push(k * step);
    const dec = step < 0.1 ? 2 : step < 1 ? 1 : 0;
    ticks.forEach(function (v, k) {
      const x = xT(v), last = k === ticks.length - 1;
      ctx.fillRect(Math.round(x), y1 + 2, 1, 4);
      const txt = num(v, dec) + (last ? ' ms' : '');
      const tw = ctx.measureText(txt).width;
      ctx.textAlign = v === 0 ? 'left' : (x + tw / 2 > x1 ? 'right' : 'center');
      ctx.fillText(txt, v === 0 ? x : Math.min(x, x1), y1 + 7);
    });
  }
  function slowText() {
    const k = SWEEP_SEC * 1000 / state.span;
    return k >= 100 ? String(Math.round(k)) : num(k, 0);
  }

  // ---------- 泛音列階梯 ----------
  function drawLadder() {
    const x0 = L.x0 + 6, x1 = L.x1 - 6, ry0 = L.ry0, ry1 = L.ry1, ymid = (ry0 + ry1) / 2;
    D.pill(ctx, T('泛音列階梯：第 k 根 = 虛擬基頻 × k', 'Harmonic ladder: rung k = virtual fundamental × k'), L.x0, L.ly0 + 20 * fs, C['ch-per'], 'left', fnt(Math.round(12.5 * fs), 700));
    if (!A.count) return;
    const just = A.tuning === 'just';
    const ints = A.intsJ, fv = A.fvJ;
    const fMax = Math.max.apply(null, A.act.map(function (t) { return t.f; }));
    const fLo = fv / 1.3, fHi = fMax * 1.12;
    const lo = Math.log2(fLo), span = Math.log2(fHi) - lo;
    const X = function (f) { return x0 + (Math.log2(f) - lo) / span * (x1 - x0); };
    // 聽不到的範圍
    const zoneF = fnt(Math.round(10.5 * fs), 600);
    if (fLo < 200) {
      const xb = X(Math.min(200, fHi));
      ctx.fillStyle = alpha(C.text, D.dark ? 0.06 : 0.045);
      ctx.fillRect(x0, ry0 - 2, xb - x0, ry1 - ry0 + 4);
      ctx.fillStyle = alpha(C.text, 0.3); ctx.fillRect(Math.round(xb), ry0 - 6, 1, ry1 - ry0 + 12);
      ctx.font = zoneF; ctx.fillStyle = C.muted; ctx.textBaseline = 'top';
      const txt = T('200 Hz 以下：手機喇叭幾乎放不出', 'below 200 Hz: phone speakers barely play it');
      ctx.textAlign = 'right';
      if (xb - x0 > ctx.measureText(txt).width + 6) ctx.fillText(txt, xb - 4, L.zoneY);
      else { ctx.textAlign = xb > x1 - 120 ? 'right' : 'left'; ctx.fillText(T('← 200 Hz：手機喇叭的下限', '← 200 Hz: phone speaker limit'), xb > x1 - 120 ? xb - 4 : xb + 4, L.zoneY); }
    }
    if (fLo < 20) {
      const xb = X(Math.min(20, fHi));
      ctx.fillStyle = alpha(C.text, D.dark ? 0.1 : 0.08);
      ctx.fillRect(x0, ry0 - 2, xb - x0, ry1 - ry0 + 4);
      ctx.font = zoneF; ctx.fillStyle = C['ch-off']; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
      D.haloText(ctx, T('20 Hz 以下聽不見', 'below 20 Hz: inaudible'), x0 + 3, ry0 - 4, C['ch-off'], 'left', 'bottom', zoneF);
    }
    // 兩根扶手
    D.tube(ctx, function (c) { c.moveTo(x0, ry0); c.lineTo(x1, ry0); }, alpha(C.muted, 0.9), 4);
    D.tube(ctx, function (c) { c.moveTo(x0, ry1); c.lineTo(x1, ry1); }, alpha(C.muted, 0.9), 4);
    // 橫檔
    const chordRung = {};
    ints.forEach(function (k, i) { chordRung[k] = A.act[i]; });
    const K = Math.floor(fHi / fv);
    let lastX = -1e9, lastLabel = -1e9;
    ctx.font = fnt(Math.round(10.5 * fs), 600);
    for (let k = 1; k <= K; k++) {
      const x = X(k * fv), gap = x - lastX;
      const isChord = !!chordRung[k];
      if (k === 1 || isChord || gap >= 1.6) {
        const a = k === 1 ? 1 : isChord ? 0.95 : gap > 7 ? 0.45 : 0.22;
        if (k === 1) D.tube(ctx, function (c) { c.moveTo(x, ry0 + 2); c.lineTo(x, ry1 - 2); }, C['ch-per'], 4.2);
        else if (isChord && just) D.tube(ctx, function (c) { c.moveTo(x, ry0 + 2); c.lineTo(x, ry1 - 2); }, roleColor(chordRung[k].role), 3);
        else { ctx.fillStyle = alpha(isChord ? C.text : C.muted, a); ctx.fillRect(Math.round(x) - 0.5, ry0 + 2, isChord ? 1.6 : 1, ry1 - ry0 - 4); }
        lastX = x;
      }
      // 根號數字
      const want = k === 1 || isChord || (gap >= 15 * fs && k <= 24);
      if (want && x - lastLabel >= 12 * fs) {
        D.haloText(ctx, String(k), x, L.numY, isChord ? roleColor(chordRung[k].role) : k === 1 ? C['ch-per'] : C.muted, 'center', 'bottom', fnt(Math.round((isChord || k === 1 ? 11.5 : 10) * fs), isChord || k === 1 ? 700 : 500));
        lastLabel = x;
      }
    }
    // 虛擬基頻
    const xv = X(fv);
    const vtxt = (just ? T('虛擬基頻 ', 'virtual fundamental ') : T('純律版本的虛擬基頻 ', 'just version: ')) + hz(fv) + ' Hz';
    // 和弦音（球）與名字
    const nameF = fnt(Math.round(11 * fs), 600);
    const rows = [-1e9, -1e9];
    A.act.forEach(function (t, i) {
      const x = X(t.f);
      D.ball(ctx, x, ymid, L.narrow ? 6.5 : 7.5, roleColor(t.role));
      let txt = t.name;
      if (!just) {
        const dev = 1200 * Math.log2(t.f / (ints[i] * fv));
        if (Math.abs(dev) >= 0.05) txt += ' ' + signed(dev, 1);
      }
      ctx.font = nameF;
      const tw = ctx.measureText(txt).width;
      let r = 0;
      if (x - tw / 2 < rows[0] + 6) r = 1;
      const xx = Math.max(x0 + tw / 2, Math.min(x1 - tw / 2, x));
      D.haloText(ctx, txt, xx, L.nameY + r * 15 * fs, !just && Math.abs(1200 * Math.log2(t.f / (ints[i] * fv))) > 30 ? C['ch-off'] : roleColor(t.role), 'center', 'top', nameF);
      rows[r] = xx + tw / 2;
    });
    // 虛擬基頻的標籤放在名字列，避開和弦音的名字
    ctx.font = fnt(Math.round(11 * fs), 700);
    const vw = ctx.measureText(vtxt).width + 12;
    let vx = Math.max(x0, Math.min(x1 - vw, xv - 6));
    const firstName = X(A.act[0].f) - 40;
    const row = vx + vw < firstName ? 0 : 1;
    D.pill(ctx, vtxt, vx, L.nameY + (row ? 15 * fs : 0) + 16 * fs, C['ch-per'], 'left', fnt(Math.round(11 * fs), 700));
  }

  // ---------- 鍵盤 ----------
  function kbNotes() {
    const pp = state.progPlay, pk = state.pick;
    if (pp && pp.cur >= 0 && pp.p.chords[pp.cur]) return { notes: pp.p.chords[pp.cur].notes.map(function (x) { return { midi: x.midi, color: roleColor(x.role), name: x.name }; }), tag: pp.p.chords[pp.cur].roman };
    if (pk && pk.p.chords[pk.idx]) return { notes: pk.p.chords[pk.idx].notes.map(function (x) { return { midi: x.midi, color: roleColor(x.role), name: x.name }; }), tag: pk.p.chords[pk.idx].roman };
    return { notes: A.act.map(function (t) { return { midi: t.midi, color: roleColor(t.role), name: t.name }; }), tag: null };
  }
  const WHITE = [0, 2, 4, 5, 7, 9, 11];
  function drawKb() {
    const W = KB.W, H = KB.H, c = kctx;
    c.clearRect(0, 0, W, H);
    D.backdrop(c, W, H);
    const info = kbNotes(), notes = info.notes;
    const lit = {};
    notes.forEach(function (n) { lit[n.midi] = n; });
    let lo = notes.length ? Math.min.apply(null, notes.map(function (n) { return n.midi; })) : 60;
    let hi = notes.length ? Math.max.apply(null, notes.map(function (n) { return n.midi; })) : 72;
    const start = lo - CC.mod(lo, 12);
    const octs = Math.max(W < 560 ? 2 : 3, Math.min(4, Math.ceil((hi - start + 1) / 12)));
    const nWhite = 7 * octs + 1;
    const labH = Math.round(2 * (17 * fs + 5));
    const kx0 = 4, kw = (W - 8) / nWhite, ky0 = labH, kh = H - labH - 4;
    const pos = {};
    let wi = 0;
    for (let m = start; m <= start + 12 * octs; m++) {
      if (WHITE.indexOf(CC.mod(m, 12)) >= 0) { pos[m] = { x: kx0 + wi * kw, w: kw, white: true }; wi++; }
    }
    for (let m = start; m <= start + 12 * octs; m++) {
      if (!pos[m]) { const prev = pos[m - 1]; pos[m] = { x: prev.x + kw - kw * 0.3, w: kw * 0.6, white: false }; }
    }
    // 白鍵
    Object.keys(pos).forEach(function (k) {
      const m = +k, p = pos[m];
      if (!p.white) return;
      const n = lit[m];
      const g = c.createLinearGradient(0, ky0, 0, ky0 + kh);
      const base = n ? D.mix(C['ch-key'], n.color, D.dark ? 0.55 : 0.42) : C['ch-key'];
      g.addColorStop(0, shade(base, -0.06)); g.addColorStop(0.12, base); g.addColorStop(0.88, base); g.addColorStop(1, shade(base, -0.12));
      D.roundRect(c, p.x + 0.5, ky0, p.w - 1, kh, 4);
      c.fillStyle = g; c.fill();
      c.strokeStyle = alpha(C.text, D.dark ? 0.5 : 0.35); c.lineWidth = 1; c.stroke();
      if (CC.mod(m, 12) === 0 && p.w > 12 && !n) {
        c.font = fnt(Math.round(Math.min(10.5, p.w * 0.42) * fs), 600); c.fillStyle = alpha('#3b3f46', 0.75); c.textAlign = 'center'; c.textBaseline = 'bottom';
        c.fillText('C' + (Math.floor(m / 12) - 1), p.x + p.w / 2, ky0 + kh - 4);
      }
    });
    // 黑鍵
    Object.keys(pos).forEach(function (k) {
      const m = +k, p = pos[m];
      if (p.white) return;
      const n = lit[m];
      const g = c.createLinearGradient(0, ky0, 0, ky0 + kh * 0.62);
      const base = n ? n.color : C['ch-keyb'];
      g.addColorStop(0, shade(base, 0.25)); g.addColorStop(0.3, base); g.addColorStop(1, shade(base, -0.2));
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.3)'; c.shadowBlur = 3; c.shadowOffsetY = 2;
      D.roundRect(c, p.x, ky0, p.w, kh * 0.62, 3);
      c.fillStyle = g; c.fill();
      c.restore();
    });
    // 圓點與標籤
    const lf = fnt(Math.round(11.5 * fs), 700);
    const rows = [-1e9, -1e9];
    notes.slice().sort(function (a, b) { return a.midi - b.midi; }).forEach(function (n) {
      const p = pos[n.midi];
      if (!p) return;
      const cx = p.x + p.w / 2, cy = p.white ? ky0 + kh * 0.78 : ky0 + kh * 0.45;
      D.ball(c, cx, cy, Math.max(3.5, Math.min(6.5, p.w * 0.28)), n.color, { shadow: false });
      c.font = lf;
      const tw = c.measureText(n.name).width + 12;
      let r = cx - tw / 2 < rows[0] + 3 ? 1 : 0;
      if (r === 1 && cx - tw / 2 < rows[1] + 3) r = 0;
      const xx = Math.max(tw / 2, Math.min(W - tw / 2, cx));
      const yb = (r + 1) * (17 * fs + 5);
      c.strokeStyle = alpha(n.color, 0.6); c.lineWidth = 1;
      c.beginPath(); c.moveTo(cx, yb); c.lineTo(cx, ky0 + 2); c.stroke();
      D.pill(c, n.name, xx, yb, n.color, 'center', lf);
      rows[r] = xx + tw / 2;
    });
    if (info.tag) {
      c.font = fnt(Math.round(12 * fs), 700);
      D.pill(c, T('和弦進行 ', 'progression ') + info.tag, W - 4, 17 * fs + 5, C['ch-per'], 'right', fnt(Math.round(12 * fs), 700));
    }
  }

  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    const t = nowS();
    // 計時：播放結束、和弦進行換下一個
    if (state.vis && t >= state.vis.until) endVis(state.vis.mode === 'block');
    if (state.progPlay) {
      const pp = state.progPlay;
      const cur = Math.floor((t - pp.t0) / PROG_STEP);
      if (t >= pp.until) {
        state.progPlay = null;
        emit('progDone', CC.progPayload(pp.p));
        say(T('和弦進行播完了。點清單裡的和弦可以一個一個比較。', 'Progression finished. Tap a chord in the list to compare them one by one.'));
        renderProgCurrent(); updateStop();
      } else if (cur !== pp.cur) { pp.cur = cur; renderProgCurrent(); }
    }
    if (state.pick && t >= state.pick.until) { state.pick = null; renderProgCurrent(); updateStop(); }
    if (L) {
      ctx.clearRect(0, 0, L.W, L.H);
      D.backdrop(ctx, L.W, L.H);
      if (!$('stage').classList.contains('is3d')) { drawWave(); drawLadder(); }
      drawKb();
    }
    if (busy()) raf = requestAnimationFrame(frame);
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
    const on = AU.enabled();
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (!ev.detail) return;
    if (ev.detail.name === 'sound') {
      updateSoundButton();
      if (!ev.detail.value) { stopVoices(0.05); if (state.vis) state.vis.sound = false; }
      updateStop();
    }
    if (ev.detail.name === 'lang') themeChanged();
  });

  // =====================================================================
  // 分享連結：和弦設定、和弦進行、顯示的時間（控制項本身標 data-share-skip，由這裡記）
  // =====================================================================
  ['chordCard', 'progCard', 'spanBox'].forEach(function (id) { $(id).setAttribute('data-share-skip', ''); });
  document.querySelector('.view-bar').setAttribute('data-share-skip', '');
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      return { t: state.type, r: state.root, u: state.tuning === 'just' ? 1 : 0, i: state.inv, o: state.on.map(function (x) { return x ? 1 : 0; }).join(''),
        m: state.timbre === 'pure' ? 1 : 0, s: Math.round(state.span * 100) / 100, p: CC.PROG_ORDER.indexOf(state.prog), q: CC.PMODES.indexOf(state.pmode) };
    },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      applying = true;
      try {
        if (CC.CHORDS[o.t]) state.type = o.t;
        if (isFinite(+o.r)) state.root = Math.max(CC.ROOT_LO, Math.min(CC.ROOT_HI, Math.round(+o.r)));
        if (o.u != null) state.tuning = +o.u ? 'just' : 'equal';
        if (isFinite(+o.i)) state.inv = Math.max(0, Math.min(3, Math.round(+o.i)));
        if (typeof o.o === 'string' && /^[01]{4}$/.test(o.o)) state.on = o.o.split('').map(function (c) { return c === '1'; });
        if (o.m != null) state.timbre = +o.m ? 'pure' : 'organ';
        if (isFinite(+o.s)) { state.span = Math.max(CC.SPAN_MIN, Math.min(CC.SPAN_MAX, +o.s)); if (window.LabNum) window.LabNum.set(spanEl, state.span); refreshSpan(); }
        if (CC.PROG_ORDER[+o.p]) state.prog = CC.PROG_ORDER[+o.p];
        if (CC.PMODES[+o.q]) state.pmode = CC.PMODES[+o.q];
        stopEverything();
        userChange();
      } finally { applying = false; }
    }
  });

  // =====================================================================
  // 3D 檢視：切換到 3D 時才載入 js/chords-3d.js 與 three.js
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    CC: CC, T: T, D: D, state: state,
    reducedMotion: function () { return D.reducedMotion(); },
    colors: function () { return C; },
    analysis: function () { return A; },
    roleColor: roleColor,
    num: num, hz: hz, msText: msText,
    onGrowState: function (running) { const b = $('grow'); b.setAttribute('data-run', running ? '1' : '0'); b.textContent = running ? T('■ 停止生長', '■ Stop growing') : T('讓曲線長出來', 'Grow the curve'); },
    onGrowDone: function () {
      emit('grow', CC.growPayload(A, state.span));
      say(A.tuning === 'just' && A.count >= 2
        ? (A.T * 1000 <= state.span ? T('曲線長完了：每 ', 'Grown: the curve closes every ') + msText(A.T) + T(' 回到起點，閉合成一個結。', ', a closed knot.') : T('曲線長完了：週期 ', 'Grown: the period is ') + msText(A.T) + T('，比顯示的時間長，把「顯示的時間」拉長才看得到閉合。', ', longer than the time shown; lengthen “Time shown” to see it close.'))
        : A.count >= 2 ? T('曲線長完了：平均律每個純律週期錯開 ', 'Grown: equal temperament slips ') + num(A.drift, 1) + T('°，永遠閉不起來。', '° every just period and never closes.') : T('曲線長完了。', 'Grown.'));
    },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  };
  function update3D() { if (view3 && view3.active) view3.update(); }
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Chords3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Chords3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/chords-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Chords3D) throw new Error('chords-3d.js did not load');
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
        view3 = window.Chords3D.create(lib, host3, bridge);
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
      bridge.onGrowState(false);
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  function face(which) {
    if (!view3 || !view3.active) return;
    view3.face(which);
    emit('view3d', { face: which });
    const a = A.act;
    const nm = function (i) { return a[i] ? a[i].name : '—'; };
    say(which === 'xy' ? T('從上面看：x 是 ' + nm(0) + '、y 是 ' + nm(1) + '，就是這兩個音的平面李薩如圖形。', 'From the top: x is ' + nm(0) + ' and y is ' + nm(1) + ' — the flat Lissajous figure of those two notes.')
      : which === 'xz' ? T('從正面看：x 是 ' + nm(0) + '、z 是 ' + nm(2) + '。', 'From the front: x is ' + nm(0) + ' and z is ' + nm(2) + '.')
        : which === 'yz' ? T('從側面看：y 是 ' + nm(1) + '、z 是 ' + nm(2) + '。', 'From the side: y is ' + nm(1) + ' and z is ' + nm(2) + '.')
          : T('斜著看：三個音一起畫出的立體曲線。', 'At an angle: the 3D curve drawn by all three notes.'));
  }
  $('faceXY').addEventListener('click', function () { face('xy'); });
  $('faceXZ').addEventListener('click', function () { face('xz'); });
  $('faceYZ').addEventListener('click', function () { face('yz'); });
  $('faceIso').addEventListener('click', function () { face('iso'); });
  $('grow').addEventListener('click', function () { if (view3 && view3.active) view3.toggleGrow(); });

  // 給測試用的介面（不影響畫面）
  window.__ch = {
    state: state, analysis: function () { return A; }, prog: function () { return P; }, view: function () { return view3; },
    set: function (o) { Object.assign(state, o || {}); userChange(); }, play: playBlock, arp: playArp, playProg: playProg, pick: pickChord
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    tonesEl.removeAttribute('data-html');
    labelControls();
    refreshSpan();
    updateSoundButton();
    compute();
    refreshAll();
    renderLog();
    if (view3 && view3.active) view3.onTheme();
    resize();
  }
  readColors();
  compute();
  labelControls();
  applying = true;
  if (window.LabNum) window.LabNum.set(spanEl, CC.SPAN_DEFAULT);
  applying = false;
  state.span = CC.SPAN_DEFAULT;
  refreshSpan();
  updateSoundButton();
  refreshAll();
  renderLog();
  updateStop();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lk = 0;
    new ResizeObserver(function () {
      const a = cv.clientWidth, b = kbc.clientWidth;
      if (a !== lw || b !== lk) { lw = a; lk = b; resize(); }
    }).observe(stage);
  } else window.addEventListener('resize', resize);
  resize();
})();
