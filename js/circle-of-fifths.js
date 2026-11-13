/* circle-of-fifths.js — 「五度圈、調號與轉調」的畫面與互動
 * （數學在 circle-of-fifths-core.js；聲音一律用 music-audio.js；2D 繪圖工具 LabDraw 在 drawkit.js；3D 在 circle-of-fifths-3d.js，切到 3D 時才載入）
 *
 * 畫面：左邊（手機在上）的 #cv 是可以拖曳旋轉的五度圈轉盤：外圈大調、中圈關係小調、內圈調號數，最上面固定一個「窗口」框住五個近關係調；
 *       右邊（手機在下）的 #cv2 有三個分頁：「調號」（五線譜上的調號與音階、升降記號的順序、比較的調要改哪些音）、
 *       「共同音」（12 × 12 熱圖，五度或半音順序）、「乘 k」（半音圈上每次加 k 個半音的星形；可依 n ↦ a·n 重排成五度圈）。
 * 聲音：只有學生按「▶ 播放」才發聲（主三和弦、音階、終止式、轉調示範、乘 k 的序列）；音效關閉時畫面照跑，狀態列顯示提示並讓音效開關閃一下。
 * 任務事件：'key'、'target'、'heat'、'play'、'k'、'arrange'（說明見 js/missions/circle-of-fifths.js 開頭）；資料由 CircleFifthsCore.eventData 產生。 */
(function () {
  'use strict';
  const CF = window.CircleFifthsCore;
  const D = window.LabDraw;
  const AU = window.MusicAudio;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha, mix = D.mix, shade = D.shade;
  const mod = CF.mod;
  const TAU = Math.PI * 2, SEC = Math.PI / 6;
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const PARTIALS = [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6];   // 近似的風琴音色
  const GAIN = 0.32, CH_GAIN = 0.17;
  const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'], FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
  // 高音譜表上調號記號的位置（E4 = 0，每一格 = 一個音級）
  const SHARP_STEPS = [8, 5, 9, 6, 3, 7, 4], FLAT_STEPS = [4, 7, 3, 6, 2, 5, 1];

  // ---------- 狀態 ----------
  const state = {
    pos: 0, spell: 'auto', mode: 'major', target: null, k: 7, a: 1,
    aFrom: 1, aT0: -1e9,                 // 重排的動畫：從哪個排列、開始時間
    run: { dir: 0, n: 0 },               // 連續往同一個方向轉了幾格
    what: 'triad', tempo: 96, panel: 'sig', order: 'fifths',
    rot: 0, rotGoal: 0,                  // 轉盤的角度（以格為單位，不取餘數，動畫用）
    visited: {},                         // 足跡：'j|mode' → true
    play: null,                          // 播放中：{ what, events, total, idx, key }
    heatCur: { r: 0, c: 0 },             // 熱圖的鍵盤游標
    flat3d: false,
    offHintShown: false
  };
  let A = null;
  function recompute() {
    A = CF.analyze({ pos: state.pos, spell: state.spell, mode: state.mode, target: state.target, k: state.k, a: state.a });
  }

  // ---------- 色彩與字體 ----------
  let C = {}, fs = 1;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'cf-sharp', 'cf-flat', 'cf-key', 'cf-target', 'cf-heat', 'cf-c5', 'cf-c6', 'cf-ink']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    fs = Math.max(1, Math.min(1.45, parseFloat(cs.getPropertyValue('--fs')) || 1));
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + (px * fs).toFixed(1) + 'px ' + FONT; }
  const cycleColor = function (i) { return [C['cf-key'], C['cf-sharp'], C['cf-flat'], C['cf-target'], C['cf-c5'], C['cf-c6']][i % 6]; };
  const sideColor = function (j) { return j > 0 ? C['cf-sharp'] : j < 0 ? C['cf-flat'] : C.muted; };

  // ---------- 文字 ----------
  const esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  const list = function (arr) { return arr.join(T('、', ', ')); };
  function keyName(j, mode) { const l = CF.keyLabel(j, mode); return mode === 'minor' ? T(l + ' 小調', l + ' minor') : T(l + ' 大調', l + ' major'); }
  function sigWords(j) {
    if (j === 0) return T('沒有升降記號', 'no sharps or flats');
    const n = Math.abs(j), sh = j > 0;
    return T(n + ' 個' + (sh ? '升' : '降') + '記號', n + ' ' + (sh ? (n === 1 ? 'sharp' : 'sharps') : (n === 1 ? 'flat' : 'flats')));
  }
  function sigShort(j) { return j === 0 ? '0' : Math.abs(j) + (j > 0 ? '♯' : '♭'); }
  function distWords(d) {
    if (d === 0) return T('同一格', 'same place');
    const n = Math.abs(d);
    return T(n + ' 格（往 ' + (d > 0 ? '♯' : '♭') + ' 方向）', n + (n === 1 ? ' step' : ' steps') + ' (towards ' + (d > 0 ? '♯' : '♭') + ')');
  }
  const ROLE = {
    dominant: ['屬調', 'dominant'], subdominant: ['下屬調', 'subdominant'], relative: ['關係調', 'relative key'],
    dominantRel: ['屬調的關係調', 'relative of the dominant'], subdominantRel: ['下屬調的關係調', 'relative of the subdominant']
  };
  /** 比較的調和目前的調是什麼關係 */
  function relationWords(t) {
    if (t.sameKey) return T('同一個調', 'the same key');
    if (t.enharm) return T('同名異音（同一組鍵、不同寫法）', 'enharmonic (same piano keys, different spelling)');
    const n = CF.nearKeys(A.j, A.mode).filter(function (x) { return x.j === t.j && x.mode === t.mode; })[0];
    if (n) return T(ROLE[n.role][0] + '（近關係調）', ROLE[n.role][1] + ' (closely related)');
    if (t.sameTonic) return T('平行調（同主音）', 'parallel key (same tonic)');
    if (t.common === 7) return T('同一組音', 'same set of notes');
    return t.common <= 3 ? T('遠關係調', 'distant key') : T('較遠的調', 'more distant key');
  }

  // ---------- 任務事件 ----------
  function emit(type, extra) {
    if (window.LabShare && window.LabShare.restoring) return;
    if (window.LabMission) window.LabMission.emit(type, CF.eventData(A, extra));
  }

  // =====================================================================
  // 改變目前的調
  // =====================================================================
  function visit() { state.visited[A.j + '|' + A.mode] = true; }
  function keyChanged(src, quiet) {
    if (src !== 'turn') state.run = { dir: 0, n: 0 };
    recompute();
    visit();
    renderAll();
    if (!quiet) emit('key', { src: src, run: state.run.n, runDir: state.run.dir });
    if (!quiet) say(keySentence(src));
  }
  function keySentence(src) {
    let s = keyName(A.j, A.mode) + T('：', ': ') + sigWords(A.j);
    if (A.sig.marks.length) s += T('（', ' (') + A.sig.marks.map(function (m) { return m.name; }).join(' ') + T('）', ')');
    s += T('。音階 ', '. Scale ') + A.names.join(' ') + T('。', '.');
    if (A.theoretical) s += T('這是理論上的調（要用重升或重降）。', ' This is a theoretical key (it needs double accidentals).');
    if (src === 'turn' && state.run.n >= 2) s += T('已經往同一個方向轉了 ' + state.run.n + ' 格。', ' ' + state.run.n + ' steps in a row in the same direction.');
    if (A.t) s += T('和 ' + keyName(A.t.j, A.t.mode) + ' 共用 ' + A.t.common + ' 個音。', ' Shares ' + A.t.common + ' notes with ' + keyName(A.t.j, A.t.mode) + '.');
    return s;
  }
  /** 轉一格：dir = +1 往升記號（屬調）、−1 往降記號（下屬調）；fromDrag 時轉盤已經跟著手指，不另外動畫 */
  function turn(dir, fromDrag) {
    stopPlay();
    state.pos = mod(state.pos + dir, 12);
    if (!fromDrag) state.rotGoal += dir;
    if (state.run.dir === dir) state.run.n++; else state.run = { dir: dir, n: 1 };
    keyChanged('turn');
  }
  function tapKey(pos, mode) {
    pos = mod(pos, 12);
    if (pos === state.pos && mode === state.mode) return;
    stopPlay();
    const d = mod(pos - state.pos + 6, 12) - 6;
    state.rotGoal += d;
    state.pos = pos; state.mode = mode;
    keyChanged('tap');
  }
  $('cw').addEventListener('click', function () { turn(1); });
  $('ccw').addEventListener('click', function () { turn(-1); });
  document.querySelectorAll('[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.mode === state.mode) return;
      stopPlay();
      state.mode = b.dataset.mode;
      keyChanged('mode');
    });
  });
  document.querySelectorAll('[data-spell]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.spell === state.spell) return;
      stopPlay();
      state.spell = b.dataset.spell;
      keyChanged('spell');
    });
  });

  // ---------- 比較的調 ----------
  const elTarget = $('target');
  function buildTargetOptions() {
    let h = '<option value="">' + esc(T('（不比較）', '(none)')) + '</option>';
    ['major', 'minor'].forEach(function (m) {
      h += '<optgroup label="' + esc(m === 'major' ? T('大調', 'Major keys') : T('小調', 'Minor keys')) + '">';
      for (let j = -7; j <= 7; j++) h += '<option value="' + j + ':' + m + '">' + esc(keyName(j, m) + '（' + sigShort(j) + '）') + '</option>';
      h += '</optgroup>';
    });
    elTarget.innerHTML = h;
  }
  function targetValue() { return state.target ? state.target.j + ':' + state.target.mode : ''; }
  function syncTargetSelect() {
    const v = targetValue();
    if (v && !elTarget.querySelector('option[value="' + v + '"]')) {
      // 理論上的調不在選單裡（熱圖不會產生；保險起見補一個）
      const o = document.createElement('option');
      o.value = v; o.textContent = keyName(state.target.j, state.target.mode);
      elTarget.appendChild(o);
    }
    elTarget.value = v;
  }
  elTarget.addEventListener('change', function () {
    const v = elTarget.value;
    stopPlay();
    if (!v) state.target = null;
    else { const p = v.split(':'); state.target = { j: parseInt(p[0], 10), mode: p[1] === 'minor' ? 'minor' : 'major' }; }
    recompute();
    renderAll();
    emit('target', { src: 'target' });
    if (A.t) {
      say(T('比較 ' + keyName(A.t.j, A.t.mode) + '：共同音 ' + A.t.common + ' 個，', 'Compared with ' + keyName(A.t.j, A.t.mode) + ': ' + A.t.common + ' common notes; ') + changeText(A.t) + T('。', '.'));
    } else say(T('不比較。', 'No comparison.'));
  });

  /**
   * 比較的調要改哪些音。兩個調的音完全相同、只是寫法不同（同名異音，例如 F♯ 大調與 G♭ 大調）時，
   * 依音高配對說「只是換寫法」（F♯ → G♭）；一般情況逐字母說「要改」（C → G：F → F♯）。
   */
  function changeText(t) {
    const pair = function (q) { return q.from + ' → ' + q.to; };
    if (t.respell.length) return T('音完全相同，只是換寫法：' + t.respell.map(pair).join('、'), 'same notes, only respelled: ' + t.respell.map(pair).join(', '));
    if (t.changed.length) return T('要改 ' + t.changed.map(pair).join('、'), 'change ' + t.changed.map(pair).join(', '));
    return T('不用改任何音', 'no note changes');
  }

  // ---------- 熱圖 ----------
  function heatTap(r, c) {
    stopPlay();
    const keys = CF.heatKeys(state.order), jr = keys[r], jc = keys[c];
    const d = mod(CF.posOf(jr) - state.pos + 6, 12) - 6;
    state.rotGoal += d;
    state.pos = CF.posOf(jr); state.spell = 'auto'; state.mode = 'major';
    state.target = { j: jc, mode: 'major' };
    state.run = { dir: 0, n: 0 };
    state.heatCur = { r: r, c: c };
    recompute();
    visit();
    renderAll();
    emit('heat', { src: 'heat', order: state.order });
    say(keyName(jr, 'major') + T(' 與 ', ' and ') + keyName(jc, 'major') + T('：共同音 ' + A.t.common + ' 個，五度圈上相距 ' + Math.abs(A.t.d) + ' 格。', ': ' + A.t.common + ' common notes, ' + Math.abs(A.t.d) + ' steps apart on the circle.'));
  }
  document.querySelectorAll('[data-order]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.order = b.dataset.order;
      setPanel('heat');
      renderSegs(); requestDraw();
      say(state.order === 'fifths' ? T('熱圖依五度排列：每一列都是上一列往右移一格。', 'Map ordered by fifths: every row is the row above shifted one place.') : T('熱圖依半音排列：同樣的數字，看起來亂多了。', 'Map ordered by semitones: the same numbers look scattered.'));
    });
  });

  // ---------- 乘 k ----------
  const elK = $('kk'), elKO = $('kkO');
  function readK(fromUser) {
    const k = Math.max(1, Math.min(11, Math.round(val(elK))));
    elKO.textContent = String(k);
    if (k === state.k) return;
    state.k = k;
    stopPlay();
    recompute();
    renderAll();
    if (fromUser) {
      setPanel('k');
      emit('k', { src: 'k' });
      say(T('乘 k = ' + k + '：gcd(' + k + ', 12) = ' + A.g + '，分成 ' + A.g + ' 個圈，每圈 ' + A.len + ' 個音。', 'k = ' + k + ': gcd(' + k + ', 12) = ' + A.g + ', so ' + A.g + (A.g === 1 ? ' cycle' : ' cycles') + ' of ' + A.len + ' notes.'));
    }
  }
  elK.addEventListener('input', function () { readK(true); });
  elK.addEventListener('change', function () { readK(true); });
  function arrangeBy(k) {
    if (!CF.isUnit(k)) return;
    stopPlay();
    const prev = state.a;
    state.aFrom = prev; state.aT0 = performance.now();
    state.a = mod(prev * k, 12);
    recompute();
    setPanel('k');
    renderAll();
    emit('arrange', { by: k, prevA: prev, reset: false });
    say(T('乘 ' + k + ' 重排：現在是' + arrName(state.a) + '。', 'Rearranged by ' + k + ': now the ' + arrName(state.a) + '.'));
  }
  function arrName(a) { const n = CF.ARRANGE[a]; return n ? T(n[0] + '（×' + a + '）', n[1] + ' (×' + a + ')') : '×' + a; }
  $('arr').addEventListener('click', function () { arrangeBy(state.k); });
  $('arrReset').addEventListener('click', function () {
    if (state.a === 1) { setPanel('k'); return; }
    stopPlay();
    const prev = state.a;
    state.aFrom = prev; state.aT0 = performance.now(); state.a = 1;
    recompute(); setPanel('k'); renderAll();
    emit('arrange', { by: 0, prevA: prev, reset: true });
    say(T('回到半音圈。', 'Back to the semitone circle.'));
  });

  // ---------- 全部清除 ----------
  $('clear').addEventListener('click', function () {
    stopPlay();
    state.visited = {};
    state.target = null;
    if (state.a !== 1) { state.aFrom = state.a; state.aT0 = performance.now(); state.a = 1; }
    recompute(); visit(); renderAll();
    say(T('已清掉足跡、比較的調與重排。', 'Footprints, the compared key and the rearrangement have been cleared.'));
  });

  // ---------- 右側分頁 ----------
  function setPanel(p) {
    if (state.panel === p) return;
    state.panel = p;
    renderSegs();
    resize();
  }
  document.querySelectorAll('[data-panel]').forEach(function (b) { b.addEventListener('click', function () { setPanel(b.dataset.panel); }); });

  // =====================================================================
  // 讀數
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  function otherSpelling() {
    // 同一格的另一種寫法（常用的兩種寫法之一，或理論上的調對應的常用寫法）
    const alts = CF.standardJs(A.pos).filter(function (j) { return j !== A.j; });
    return alts.length ? alts[0] : null;
  }
  function renderKey() {
    setHTML('keybox', '<div class="nm">' + esc(keyName(A.j, A.mode)) + '</div><div class="sub">' + esc(sigWords(A.j)) +
      (A.sig.marks.length ? T('：', ': ') + esc(A.sig.marks.map(function (m) { return m.name; }).join(' ')) : '') +
      (A.theoretical ? esc(T('（理論上的調）', ' (theoretical key)')) : '') + '</div>');
    const tri = [A.notes[0], A.notes[2], A.notes[4]].map(function (n) { return n.name; });
    const alt = otherSpelling();
    let h = '<dt>' + T('音階', 'Scale') + '</dt><dd>' + esc(A.names.join(' ')) + '</dd>' +
      '<dt>' + T('主三和弦', 'Tonic chord') + '</dt><dd>' + esc(tri.join(' ')) + '</dd>' +
      '<dt>' + T('關係調', 'Relative key') + '</dt><dd>' + esc(keyName(A.rel.j, A.rel.mode)) + '</dd>' +
      '<dt>' + T('平行調', 'Parallel key') + '</dt><dd>' + esc(keyName(A.par.j, A.par.mode)) + ' <small>(' + esc(sigShort(A.par.j)) + ')</small></dd>' +
      '<dt>' + T('近關係調', 'Closely related') + '</dt><dd>' + esc(list(A.near.map(function (x) { return x.mode === 'minor' ? x.label : x.label; }))) + '</dd>' +
      '<dt>' + T('五度圈位置', 'Place on the circle') + '</dt><dd>' + esc(A.j === 0 ? T('最上面（0）', 'top (0)') : distWords(A.j)) + '</dd>';
    if (alt != null) h += '<dt>' + T('同名異音', 'Enharmonic') + '</dt><dd>＝ ' + esc(keyName(alt, A.mode)) + ' <small>(' + esc(sigShort(alt)) + ')</small></dd>';
    setHTML('keyRead', h);
  }
  function renderCmp() {
    if (!A.t) {
      setHTML('cmpRead', '<dt>' + T('比較的調', 'Compared key') + '</dt><dd>—</dd><dt>' + T('提示', 'Tip') + '</dt><dd><small>' +
        esc(T('選一個調，看共同音與要改的音', 'pick a key to see common and changed notes')) + '</small></dd>');
      return;
    }
    const t = A.t;
    const cm = t.commonPcs.map(function (pc) { return CF.pcName(pc, A.j); });
    const ch = t.respell.length ? esc(T('音完全相同，只是換寫法：', 'same notes, only respelled: ')) + t.respell.map(function (c) { return '<span class="rsp">' + esc(c.from + ' → ' + c.to) + '</span>'; }).join(T('、', ', '))
      : t.changed.length ? t.changed.map(function (c) { return '<span class="chg">' + esc(c.from + ' → ' + c.to) + '</span>'; }).join(T('、', ', ')) : esc(T('不用改', 'none'));
    setHTML('cmpRead', '<dt>' + T('比較的調', 'Compared key') + '</dt><dd class="tg">' + esc(keyName(t.j, t.mode)) + ' <small>(' + esc(sigShort(t.j)) + ')</small></dd>' +
      '<dt>' + T('關係', 'Relation') + '</dt><dd>' + esc(relationWords(t)) + '</dd>' +
      '<dt>' + T('共同音', 'Common notes') + '</dt><dd><b>' + t.common + '</b> <small>' + esc(cm.join(' ')) + '</small></dd>' +
      '<dt>' + (t.respell.length ? T('換寫法', 'Respelling') : T('要改的音', 'Notes that change')) + '</dt><dd>' + ch + '</dd>' +
      '<dt>' + T('五度圈上的距離', 'Distance on the circle') + '</dt><dd>' + esc(distWords(t.d)) + '</dd>' +
      '<dt>' + T('主三和弦共用', 'Shared tonic-chord notes') + '</dt><dd>' + t.triadCommon + '</dd>');
  }
  function renderK() {
    const seq = CF.kSequence(A.tonicPc, A.k).map(function (pc) { return CF.pcName(pc, A.j); });
    setHTML('kRead', '<dt>gcd(k, 12)</dt><dd>gcd(' + A.k + ', 12) = <b>' + A.g + '</b></dd>' +
      '<dt>' + T('分成', 'Splits into') + '</dt><dd>' + esc(T(A.g + ' 個圈，每圈 ' + A.len + ' 個音', A.g + (A.g === 1 ? ' cycle' : ' cycles') + ' of ' + A.len + ' notes')) + '</dd>' +
      '<dt>' + T('從主音出發', 'From the tonic') + '</dt><dd><small>' + esc(seq.join(' ')) + '</small></dd>' +
      '<dt>' + T('排列', 'Arrangement') + '</dt><dd>' + esc(arrName(state.a)) + '</dd>' +
      '<dt>' + T('每一步跨幾格', 'Slots per step') + '</dt><dd>' + A.slotStep + (A.slotStep === 1 || A.slotStep === 11 ? ' <small>' + esc(T('（相鄰：正十二邊形）', '(neighbours: a regular 12-gon)')) + '</small>' : '') + '</dd>');
    const unit = CF.isUnit(state.k);
    $('arr').disabled = !unit;
    $('arr').title = unit ? '' : T('k 和 12 不互質：好幾個音會疊在同一格，不能重排', 'k is not coprime to 12: several notes would land on the same slot');
    $('arrReset').disabled = state.a === 1;
  }
  function renderFoot() {
    const keys = Object.keys(state.visited);
    const maj = keys.filter(function (k) { return /\|major$/.test(k); }), min = keys.length - maj.length;
    const std = maj.filter(function (k) { return Math.abs(parseInt(k, 10)) <= 7; }).length;
    setHTML('footRead', '<dt>' + T('走過的調', 'Keys visited') + '</dt><dd><b>' + keys.length + '</b> <small>' + esc(T('（大調 ' + maj.length + '、小調 ' + min + '）', '(' + maj.length + ' major, ' + min + ' minor)')) + '</small></dd>' +
      '<dt>' + T('常用的大調調號', 'Usual major signatures') + '</dt><dd>' + std + ' / 15</dd>');
  }
  function renderSegs() {
    document.querySelectorAll('[data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)); });
    document.querySelectorAll('[data-spell]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.spell === state.spell)); });
    document.querySelectorAll('[data-order]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.order === state.order)); });
    document.querySelectorAll('[data-panel]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.panel === state.panel)); });
  }
  function renderAll() {
    renderSegs(); renderKey(); renderCmp(); renderK(); renderFoot(); syncTargetSelect();
    updateCanvasLabels(); rebuild3D(); requestDraw();
  }

  // =====================================================================
  // 播放（MusicAudio.sequencer 排程；音效關閉時時鐘照跑、畫面照樣同步）
  // =====================================================================
  let seq = null;
  function soundCheck() {
    if (AU.enabled()) return true;
    say(AU.offHint());
    AU.flashSoundButton();
    return false;
  }
  /** 這次要播的音：{ t（拍）, dur（拍）, midis, key（1 = 目前的調、2 = 比較的調）, pc（乘 k 序列的音） } */
  function buildEvents(what) {
    const ev = [];
    if (what === 'triad') {
      const c = CF.chord(A.j, A.mode, 1), up = c.midis.slice(1);
      up.forEach(function (m, i) { ev.push({ t: i * 0.6, dur: 0.6, midis: [m], key: 1 }); });
      ev.push({ t: 2, dur: 2.4, midis: c.midis, key: 1 });
    } else if (what === 'scale') {
      CF.scaleMidis(A.j, A.mode).forEach(function (m, i, arr) { ev.push({ t: i, dur: i === arr.length - 1 ? 2 : 0.92, midis: [m], key: 1, deg: i }); });
    } else if (what === 'cadence') {
      CF.cadence(A.j, A.mode).forEach(function (c, i) { ev.push({ t: i * 2, dur: i === 3 ? 3 : 1.9, midis: c.midis, key: 1, deg: c.deg }); });
    } else if (what === 'modulate') {
      CF.modulation(A.j, A.mode, A.t.j, A.t.mode).forEach(function (c, i, arr) { ev.push({ t: i * 2, dur: i === arr.length - 1 ? 3 : 1.9, midis: c.midis, key: c.key, deg: c.deg }); });
    } else if (what === 'kseq') {
      const seqPcs = CF.kSequence(A.tonicPc, A.k), ms = CF.kMidis(A.tonicPc, A.k);
      ms.forEach(function (m, i) { ev.push({ t: i * 0.75, dur: i === ms.length - 1 ? 1.8 : 0.7, midis: [m], key: 1, pc: seqPcs[i], idx: i }); });
    }
    return ev;
  }
  function startPlay() {
    stopPlay();
    const what = $('what').value;
    if (what === 'modulate' && !A.t) {
      say(T('先在「比較的調」選一個調，才能示範轉調。', 'First choose a key in “Compare with” to hear a modulation.'));
      elTarget.focus();
      return;
    }
    if (what === 'kseq') setPanel('k');
    const on = soundCheck();
    const beat = 60 / state.tempo;
    const events = buildEvents(what).map(function (e) { return Object.assign({}, e, { t: e.t * beat, dur: e.dur * beat }); });
    const last = events[events.length - 1];
    const total = last.t + last.dur + 0.25;
    seq = !on ? silentClock(0.06) : AU.sequencer({
      tick: function (t0, t1, start) {
        if (!AU.enabled()) return;
        events.forEach(function (e) {
          const at = start + e.t;
          if (at >= t0 && at < t1) {
            const g = e.midis.length > 1 ? CH_GAIN : GAIN;
            e.midis.forEach(function (m, i) {
              AU.tone({ f0: CF.freq(m), partials: PARTIALS, dur: e.dur, gain: i === 0 && e.midis.length > 1 ? g * 1.1 : g, attack: 0.02, release: 0.25, at: at });
            });
          }
        });
      }
    });
    if (on) seq.begin(0.06);
    state.play = { what: what, events: events, total: total, idx: -1 };
    updateStop(); requestDraw();
    emit('play', { what: what, tempo: state.tempo, run: state.run.n, runDir: state.run.dir });
    if (on) say(T('播放：', 'Playing: ') + playWords(what) + T('。', '.'));
  }
  function playWords(what) {
    if (what === 'modulate') return T('轉調示範 ' + keyName(A.j, A.mode) + ' → ' + keyName(A.t.j, A.t.mode), 'modulation ' + keyName(A.j, A.mode) + ' → ' + keyName(A.t.j, A.t.mode));
    if (what === 'kseq') return T('從 ' + A.tonicName + ' 開始每次加 ' + A.k + ' 個半音', 'adding ' + A.k + ' semitones each time from ' + A.tonicName);
    const w = { triad: ['主三和弦', 'tonic chord'], scale: ['音階', 'scale'], cadence: ['終止式 I–IV–V–I', 'cadence I–IV–V–I'] }[what];
    return keyName(A.j, A.mode) + T('的' + w[0], ' ' + w[1]);
  }
  function silentClock(delay) {
    const t0 = performance.now() + delay * 1000;
    return { stop: function () {}, elapsed: function () { return (performance.now() - t0) / 1000; } };
  }
  function stopPlay() {
    if (seq) { seq.stop(); seq = null; }
    if (state.play) { state.play = null; AU.stopAll(0.06); rebuild3D(); }
    updateStop();
  }
  $('play').addEventListener('click', startPlay);
  function busy() { return !!state.play; }
  function updateStop() { $('stop').disabled = !(AU.playing() || busy()); }
  $('stop').addEventListener('click', function () { stopPlay(); AU.stopAll(0.06); updateStop(); requestDraw(); say(T('已停止。', 'Stopped.')); });
  AU.onChange(updateStop);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && busy()) { stopPlay(); requestDraw(); } });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopPlay(); });
  $('what').addEventListener('change', function () { state.what = this.value; if (this.value === 'kseq') setPanel('k'); });
  const elTempo = $('tempo'), elTempoO = $('tempoO');
  function readTempo() { state.tempo = Math.max(60, Math.min(180, val(elTempo))); elTempoO.textContent = String(Math.round(state.tempo)); }
  elTempo.addEventListener('input', readTempo);
  elTempo.addEventListener('change', readTempo);
  /** 正在發聲的事件（畫面同步用） */
  function playingEvent() { return state.play && state.play.idx >= 0 ? state.play.events[state.play.idx] : null; }

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
  // 畫布：版面
  // =====================================================================
  const cvrow = $('cvrow');
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  let W1 = 400, H1 = 420, W2 = 400, H2 = 420, wide = false, dial = null;
  function panelHeight(w) {
    if (state.panel === 'heat') return Math.round(Math.min(w, 460) + 74 * fs);
    if (state.panel === 'k') return Math.round(Math.min(w * 0.92, 420) + 96 * fs);
    // 標題、兩行五線譜（各 9 格線距＋音名）、升降記號順序兩列、比較的標題（和 drawSigPanel 的排版一致）
    return Math.round(130 * fs + 18 * staffS(w - 16) + 60);
  }
  function staffS(w) { return Math.max(7, Math.min(10.5, w / 36)); }
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const total = cvrow.clientWidth || 600;
    wide = total >= 660;
    cvrow.classList.toggle('wide', wide);
    W1 = cv.clientWidth || total; W2 = cv2.clientWidth || total;
    if (wide) {
      const hp = Math.max(panelHeight(W2), 380);
      const hd = Math.round(Math.min(W1 + 30, 520));
      H1 = H2 = Math.max(hp, hd);
    } else {
      const R = Math.max(110, Math.min(W1 / 2 - 14, 190));
      H1 = Math.round(2 * R + 40);
      H2 = panelHeight(W2);
    }
    const R = Math.max(90, Math.min(W1 / 2 - 14, (H1 - 40) / 2, 230));
    dial = { cx: W1 / 2, cy: wide ? Math.max(R + 26, H1 / 2) : R + 26, R: R };
    cv.style.height = H1 + 'px'; cv2.style.height = H2 + 'px';
    cv.width = Math.round(W1 * dpr); cv.height = Math.round(H1 * dpr);
    cv2.width = Math.round(W2 * dpr); cv2.height = Math.round(H2 * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    requestDraw();
  }

  // =====================================================================
  // 五度圈轉盤（#cv）
  // =====================================================================
  /** 第 p 格的中心角度（從正上方順時針，弧度），隨轉盤轉動 */
  const secAng = function (p) { return (p - state.rot) * SEC; };
  const P = function (a, r) { return { x: dial.cx + r * Math.sin(a), y: dial.cy - r * Math.cos(a) }; };
  function ringPath(c, r0, r1, a0, a1) {
    c.beginPath();
    c.arc(dial.cx, dial.cy, r1, a0 - Math.PI / 2, a1 - Math.PI / 2);
    c.arc(dial.cx, dial.cy, r0, a1 - Math.PI / 2, a0 - Math.PI / 2, true);
    c.closePath();
  }
  function rings() { const R = dial.R; return { R: R, r1: R * 0.735, r2: R * 0.5, r3: R * 0.315 }; }
  /** 某一格現在顯示的主要調號與另一種寫法 */
  function cellJs(p) {
    const prim = p === state.pos ? A.j : CF.jOf(p, 'auto');
    const alts = CF.standardJs(p).filter(function (j) { return j !== prim; });
    return { prim: prim, alt: alts.length ? alts[0] : null };
  }
  function drawDial(now) {
    const c = ctx, cx = dial.cx, cy = dial.cy, g = rings(), R = g.R;
    D.backdrop(c, W1, H1);
    // 底盤：柔和陰影
    c.save();
    c.shadowColor = D.shadowInk(D.dark ? 0.55 : 0.18); c.shadowBlur = 18; c.shadowOffsetY = 5;
    c.beginPath(); c.arc(cx, cy, R + 3, 0, TAU); c.fillStyle = mix(C.surface, C['canvas-bg'], 0.3); c.fill();
    c.restore();
    const px = Math.max(11, Math.min(17, R / 11.5));
    const pe = playingEvent();
    const soundingJ = pe ? (pe.key === 2 && A.t ? A.t : null) : null;
    for (let p = 0; p < 12; p++) {
      const a = secAng(p), a0 = a - SEC / 2 + 0.006, a1 = a + SEC / 2 - 0.006;
      const cj = cellJs(p), tint = sideColor(CF.jOf(p, 'auto')), st = 0.05 + 0.3 * Math.min(6, Math.abs(CF.jOf(p, 'auto'))) / 6;
      // 外圈（大調）
      ringPath(c, g.r1, R, a0, a1);
      let gr = c.createRadialGradient(cx, cy, g.r1, cx, cy, R);
      gr.addColorStop(0, mix(C.surface, tint, st * 0.8)); gr.addColorStop(1, mix(C.surface, tint, st * 1.15));
      c.fillStyle = gr; c.fill();
      c.strokeStyle = alpha(C.text, 0.1); c.lineWidth = 1; c.stroke();
      // 中圈（小調）
      ringPath(c, g.r2, g.r1, a0, a1);
      gr = c.createRadialGradient(cx, cy, g.r2, cx, cy, g.r1);
      gr.addColorStop(0, mix(mix(C.surface, C.text, D.dark ? 0.06 : 0.035), tint, st * 0.6)); gr.addColorStop(1, mix(mix(C.surface, C.text, D.dark ? 0.06 : 0.035), tint, st * 0.85));
      c.fillStyle = gr; c.fill(); c.stroke();
      // 內圈（調號數）
      ringPath(c, g.r3, g.r2, a0, a1);
      c.fillStyle = mix(C['canvas-bg'], tint, st * 0.45); c.fill(); c.stroke();
      // 正在發聲的調（轉調示範的第二段）
      if (soundingJ && CF.posOf(soundingJ.j) === p) {
        ringPath(c, soundingJ.mode === 'minor' ? g.r2 : g.r1, soundingJ.mode === 'minor' ? g.r1 : R, a0, a1);
        c.fillStyle = alpha(C['cf-target'], 0.35); c.fill();
      }
      // 文字
      const majY = (R + g.r1) / 2, minY = (g.r1 + g.r2) / 2, sigY = (g.r2 + g.r3) / 2;
      const isCur = p === state.pos;
      const majCol = isCur && A.mode === 'major' ? C['cf-key'] : C.text, minCol = isCur && A.mode === 'minor' ? C['cf-key'] : alpha(C.text, 0.85);
      label2(c, CF.keyLabel(cj.prim, 'major'), cj.alt != null ? CF.keyLabel(cj.alt, 'major') : null, P(a, majY), majCol, px, 700);
      label2(c, CF.keyLabel(cj.prim, 'minor'), cj.alt != null ? CF.keyLabel(cj.alt, 'minor') : null, P(a, minY), minCol, px * 0.84, 600);
      label2(c, sigShort(cj.prim), cj.alt != null ? sigShort(cj.alt) : null, P(a, sigY), sideColor(cj.prim), px * 0.72, 700);
      // 足跡
      const vm = state.visited, keysAt = function (m) { return Object.keys(vm).some(function (k) { const q = k.split('|'); return q[1] === m && mod(+q[0], 12) === p; }); };
      if (keysAt('major')) { const q = P(a, R - 5.5); c.beginPath(); c.arc(q.x, q.y, 2.4, 0, TAU); c.fillStyle = alpha(C['cf-key'], 0.85); c.fill(); }
      if (keysAt('minor')) { const q = P(a, g.r1 - 5); c.beginPath(); c.arc(q.x, q.y, 2.1, 0, TAU); c.fillStyle = alpha(C['cf-key'], 0.75); c.fill(); }
    }
    // 外框亮邊（左上亮）
    const gl = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
    gl.addColorStop(0, alpha('#ffffff', D.dark ? 0.05 : 0.32)); gl.addColorStop(0.7, alpha('#ffffff', 0)); gl.addColorStop(1, D.shadowInk(D.dark ? 0.12 : 0.04));
    c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fillStyle = gl; c.fill();
    c.strokeStyle = alpha(C.text, D.dark ? 0.3 : 0.22); c.lineWidth = 1.5; c.stroke();
    [g.r1, g.r2, g.r3].forEach(function (r) { c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.strokeStyle = alpha(C.text, 0.14); c.lineWidth = 1; c.stroke(); });
    // 比較的調：虛線框
    if (A.t) {
      const pT = CF.posOf(A.t.j), a = secAng(pT);
      c.save(); c.setLineDash([5, 4]);
      ringPath(c, A.t.mode === 'minor' ? g.r2 + 2 : g.r1 + 2, A.t.mode === 'minor' ? g.r1 - 2 : R - 2, a - SEC / 2 + 0.03, a + SEC / 2 - 0.03);
      c.strokeStyle = C['cf-target']; c.lineWidth = 2.4; c.stroke();
      c.restore();
    }
    // 窗口：最上面三格（大調＋小調）＝ 目前的調與五個近關係調
    c.save();
    ringPath(c, g.r2 - 1, R + 1, -SEC * 1.5, SEC * 1.5);
    c.fillStyle = alpha(C.accent, D.dark ? 0.08 : 0.06); c.fill();
    c.strokeStyle = alpha(C.accent, 0.9); c.lineWidth = 2.2; c.stroke();
    const top = A.mode === 'minor' ? [g.r2 + 2, g.r1 - 2] : [g.r1 + 2, R - 2];
    const off = state.rot - Math.round(state.rot);
    ringPath(c, top[0], top[1], (-off - 0.5) * SEC + 0.02, (-off + 0.5) * SEC - 0.02);
    c.strokeStyle = C['cf-key']; c.lineWidth = 3; c.stroke();
    c.fillStyle = alpha(C['cf-key'], D.dark ? 0.16 : 0.1); c.fill();
    c.restore();
    // 指針
    c.beginPath(); c.moveTo(cx, cy - R - 3); c.lineTo(cx - 8, cy - R - 16); c.lineTo(cx + 8, cy - R - 16); c.closePath();
    c.fillStyle = C.accent; c.fill();
    // 中心：目前的調
    const gc = c.createRadialGradient(cx - g.r3 * 0.35, cy - g.r3 * 0.4, g.r3 * 0.1, cx, cy, g.r3);
    gc.addColorStop(0, mix(C.surface, '#ffffff', D.dark ? 0.04 : 0.5)); gc.addColorStop(1, mix(C.surface, C['canvas-bg'], 0.4));
    c.beginPath(); c.arc(cx, cy, g.r3 - 1, 0, TAU); c.fillStyle = gc; c.fill();
    c.strokeStyle = alpha(C['cf-key'], 0.5); c.lineWidth = 1.5; c.stroke();
    const nm = keyName(A.j, A.mode);
    let cp = Math.min(16, g.r3 / 3.2);
    c.font = fnt(cp, 700);
    while (cp > 8 && c.measureText(nm).width > g.r3 * 1.8) { cp -= 0.5; c.font = fnt(cp, 700); }
    D.haloText(c, nm, cx, cy - cp * 0.45 * fs, C['cf-key'], 'center', 'middle', fnt(cp, 700));
    let sw = A.theoretical ? T('理論上的調', 'theoretical') : sigWords(A.j), sp = Math.min(11.5, g.r3 / 4.2);
    c.font = fnt(sp, 600);
    while (sp > 7.5 && c.measureText(sw).width > g.r3 * 1.75) { sp -= 0.5; c.font = fnt(sp, 600); }
    D.haloText(c, sw, cx, cy + sp * 0.95 * fs, C.muted, 'center', 'middle', fnt(sp, 600));
    // 播放的波紋
    if (pe && !D.reducedMotion()) {
      const u = (seq ? seq.elapsed() - pe.t : 0) / Math.max(0.3, pe.dur);
      D.ripple(c, cx, cy, g.r3 * 0.9, Math.max(0, Math.min(1, u)), pe.key === 2 ? C['cf-target'] : C['cf-key']);
    }
    // 鍵盤焦點框
    if (kb && kb.focused()) {
      c.save(); c.setLineDash([5, 4]); c.strokeStyle = C.accent; c.lineWidth = 2;
      c.beginPath(); c.arc(cx, cy, R + 8, 0, TAU); c.stroke(); c.restore();
    }
    // 角落說明
    if (H1 - (cy + R) > 18 * fs) {
      c.font = fnt(10.5); c.fillStyle = C.muted; c.textAlign = 'left'; c.textBaseline = 'bottom';
      c.fillText(T('外圈大調・中圈小調・內圈調號', 'outer: major · middle: minor · inner: signature'), 8, H1 - 6);
    }
  }
  /** 一格裡的兩行字：主要寫法＋另一種寫法（小字） */
  function label2(c, a, b, q, color, px, weight) {
    if (b == null) { D.haloText(c, a, q.x, q.y, color, 'center', 'middle', fnt(px, weight)); return; }
    D.haloText(c, a, q.x, q.y - px * 0.42 * fs, color, 'center', 'middle', fnt(px * 0.9, weight));
    D.haloText(c, b, q.x, q.y + px * 0.5 * fs, alpha(C.muted, 0.95), 'center', 'middle', fnt(px * 0.68, 500));
  }

  // ---------- 拖曳轉盤、點格子 ----------
  let drag = null;
  function hitDial(x, y) {
    const g = rings(), dx = x - dial.cx, dy = y - dial.cy, d = Math.hypot(dx, dy);
    if (d > g.R + 14) return null;
    const ang = Math.atan2(dx, -dy);                       // 從正上方順時針
    const p = mod(Math.round(ang / SEC + state.rot), 12);
    return { d: d, ang: ang, p: p, ring: d >= g.r1 ? 'major' : d >= g.r2 ? 'minor' : d >= g.r3 ? 'sig' : 'center' };
  }
  function localXY(e, el) { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  cv.addEventListener('pointerdown', function (e) {
    const q = localXY(e, cv), h = hitDial(q.x, q.y);
    if (!h) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 舊瀏覽器 */ }
    drag = { id: e.pointerId, ang0: h.ang, rot0: state.rot, x0: q.x, y0: q.y, moved: false, base: Math.round(state.rot), hit: h };
    state.rotGoal = state.rot;
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    const q = localXY(e, cv);
    if (!drag.moved && Math.hypot(q.x - drag.x0, q.y - drag.y0) < 7) return;
    if (!drag.moved) { drag.moved = true; cv.classList.add('dragging'); stopPlay(); }
    const ang = Math.atan2(q.x - dial.cx, -(q.y - dial.cy));
    let da = ang - drag.ang0;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    drag.ang0 = ang;
    state.rot -= da / SEC;
    state.rotGoal = state.rot;
    // 每轉過一格就算一步（和按鈕一樣送出事件）
    let n = Math.round(state.rot);
    while (n > drag.base) { drag.base++; turn(1, true); }
    while (n < drag.base) { drag.base--; turn(-1, true); }
    requestDraw();
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const wasTap = !drag.moved, h = drag.hit;
    drag = null;
    cv.classList.remove('dragging');
    state.rotGoal = Math.round(state.rot);
    if (wasTap && h && (h.ring === 'major' || h.ring === 'minor')) tapKey(h.p, h.ring);
    else if (wasTap && h && h.ring === 'sig') tapKey(h.p, state.mode);
    requestDraw();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // 鍵盤：方向鍵左右轉盤、上下切換大小調
  const kb = window.LabKeys ? window.LabKeys.attach(cv, {
    label: T('五度圈轉盤。左右方向鍵往下屬調或屬調轉一格，上下方向鍵切換大調與小調。', 'Circle of fifths dial. Left and right arrows turn one step towards the subdominant or the dominant; up and down switch between major and minor.'),
    items: [{
      name: function () { return T('五度圈轉盤', 'Circle of fifths dial'); },
      move: function (dx, dy) {
        if (dx) { turn(dx); return true; }
        if (dy) { const m = dy > 0 ? 'major' : 'minor'; if (m === state.mode) return false; stopPlay(); state.mode = m; keyChanged('mode'); return true; }
        return false;
      },
      describe: function () { return keyName(A.j, A.mode) + T('，', ', ') + sigWords(A.j); }
    }],
    onChange: function () { requestDraw(); }
  }) : null;
  const kb2 = window.LabKeys ? window.LabKeys.attach(cv2, {
    label: T('右側的圖。選「共同音」分頁時，方向鍵移動熱圖上的格子並比較那兩個大調。', 'Second picture. On the “Common notes” tab the arrow keys move across the map and compare those two major keys.'),
    items: [{
      name: function () { return T('共同音熱圖的格子', 'Common-note map cell'); },
      move: function (dx, dy) {
        if (state.panel !== 'heat') return false;
        const r = mod(state.heatCur.r - dy, 12), c = mod(state.heatCur.c + dx, 12);
        heatTap(r, c);
        return true;
      },
      describe: function () { return state.panel === 'heat' && A.t ? keyName(A.j, 'major') + T(' 與 ', ' and ') + keyName(A.t.j, 'major') + T('：共同音 ' + A.t.common, ': ' + A.t.common + ' common notes') : T('先選「共同音」分頁', 'Choose the “Common notes” tab first'); }
    }],
    onChange: function () { requestDraw(); }
  }) : null;

  // =====================================================================
  // 右側（#cv2）：調號、熱圖、乘 k
  // =====================================================================
  function card(c, x, y, w, h) {
    D.roundRect(c, x, y, w, h, 10);
    c.fillStyle = alpha(C.surface, D.dark ? 0.32 : 0.62); c.fill();
    c.strokeStyle = alpha(C.text, 0.08); c.lineWidth = 1; c.stroke();
  }
  function title(c, text, x, y, color, px, maxW) {
    let p = px || 13;
    c.font = fnt(p, 700);
    while (maxW && p > 9 && c.measureText(text).width > maxW) { p -= 0.5; c.font = fnt(p, 700); }
    c.fillStyle = color || C.text; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillText(text, x, y);
    return p;
  }

  // ---------- 五線譜 ----------
  function drawSharp(c, x, y, s, col) {
    c.save(); c.strokeStyle = col; c.lineCap = 'butt';
    c.lineWidth = Math.max(1, s * 0.13);
    c.beginPath(); c.moveTo(x - s * 0.2, y - s * 1.15); c.lineTo(x - s * 0.2, y + s * 1.25); c.moveTo(x + s * 0.2, y - s * 1.3); c.lineTo(x + s * 0.2, y + s * 1.1); c.stroke();
    c.lineWidth = Math.max(1.4, s * 0.3);
    c.beginPath(); c.moveTo(x - s * 0.52, y - s * 0.22); c.lineTo(x + s * 0.52, y - s * 0.5); c.moveTo(x - s * 0.52, y + s * 0.5); c.lineTo(x + s * 0.52, y + s * 0.22); c.stroke();
    c.restore();
  }
  function drawFlat(c, x, y, s, col) {
    c.save(); c.strokeStyle = col; c.fillStyle = col; c.lineCap = 'round';
    const x0 = x - s * 0.3;
    c.lineWidth = Math.max(1, s * 0.13);
    c.beginPath(); c.moveTo(x0, y - s * 1.75); c.lineTo(x0, y + s * 0.5); c.stroke();
    c.beginPath();
    c.moveTo(x0, y + s * 0.5);
    c.bezierCurveTo(x0 + s * 1.05, y - s * 0.05, x0 + s * 0.85, y - s * 0.75, x0, y - s * 0.28);
    c.lineTo(x0, y - s * 0.08);
    c.bezierCurveTo(x0 + s * 0.6, y - s * 0.5, x0 + s * 0.62, y + s * 0.02, x0, y + s * 0.36);
    c.closePath(); c.fill();
    c.restore();
  }
  function drawDoubleSharp(c, x, y, s, col) {
    c.save(); c.strokeStyle = col; c.lineCap = 'square'; c.lineWidth = Math.max(1.4, s * 0.2);
    const h = s * 0.42;
    c.beginPath(); c.moveTo(x - h, y - h); c.lineTo(x + h, y + h); c.moveTo(x + h, y - h); c.lineTo(x - h, y + h); c.stroke();
    c.fillStyle = col;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { c.fillRect(x + q[0] * h - s * 0.14, y + q[1] * h - s * 0.14, s * 0.28, s * 0.28); });
    c.restore();
  }
  function drawAcc(c, acc, x, y, s, col) {
    if (acc === 1) drawSharp(c, x, y, s, col);
    else if (acc === 2) drawDoubleSharp(c, x, y, s, col);
    else if (acc === -1) drawFlat(c, x, y, s, col);
    else if (acc === -2) { drawFlat(c, x - s * 0.36, y, s, col); drawFlat(c, x + s * 0.36, y, s, col); }
  }
  /** 高音譜號：以 G 線（第二線）為中心，s = 線距 */
  function drawClef(c, x, yG, s, col) {
    const u = function (a) { return x + a * s; }, v = function (b) { return yG + b * s; };
    c.save(); c.strokeStyle = col; c.fillStyle = col; c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = Math.max(1.3, s * 0.17);
    c.beginPath();
    c.moveTo(u(0.15), v(0.3));
    c.bezierCurveTo(u(0.7), v(0.28), u(0.72), v(-0.62), u(0.05), v(-0.65));
    c.bezierCurveTo(u(-0.8), v(-0.62), u(-0.95), v(0.75), u(0.0), v(1.05));
    c.bezierCurveTo(u(0.95), v(1.3), u(1.35), v(0.0), u(0.85), v(-1.0));
    c.bezierCurveTo(u(0.5), v(-1.75), u(-0.55), v(-2.15), u(-0.45), v(-3.1));
    c.bezierCurveTo(u(-0.34), v(-4.05), u(0.42), v(-4.6), u(0.4), v(-3.75));
    c.bezierCurveTo(u(0.38), v(-2.9), u(-0.06), v(-1.6), u(0.06), v(0.6));
    c.bezierCurveTo(u(0.12), v(1.8), u(0.16), v(2.42), u(-0.32), v(2.42));
    c.stroke();
    c.beginPath(); c.arc(u(-0.38), v(2.12), s * 0.3, 0, TAU); c.fill();
    c.restore();
  }
  function drawWholeNote(c, x, y, s, col) {
    c.save(); c.translate(x, y); c.rotate(-0.33);
    c.beginPath(); c.ellipse(0, 0, s * 0.74, s * 0.5, 0, 0, TAU);
    c.rotate(0.95); c.ellipse(0, 0, s * 0.36, s * 0.22, 0, 0, TAU);
    c.fillStyle = col; c.fill('evenodd');
    c.restore();
  }
  /**
   * 一行五線譜：調號 j 與調式 mode 的音階（8 個全音符）。changed：要用比較顏色標出的字母（{ 字母: true }）。
   * 傳回這一塊佔的高度。
   */
  function drawStaff(c, x, y, w, j, mode, opt) {
    opt = opt || {};
    const s = staffS(w + 20);
    const y0 = y + 7 * s;                          // 第一線（E4）
    const stepY = function (st) { return y0 - st * s / 2; };
    const ink = opt.ink || C['cf-ink'];
    // 五條線
    c.save();
    c.strokeStyle = alpha(ink, 0.78); c.lineWidth = 1;
    for (let i = 0; i < 5; i++) { const yy = Math.round(stepY(i * 2)) + 0.5; c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy); c.stroke(); }
    c.beginPath(); c.moveTo(x + 0.5, stepY(0)); c.lineTo(x + 0.5, stepY(8)); c.stroke();
    c.beginPath(); c.moveTo(x + w - 0.5, stepY(0)); c.lineTo(x + w - 0.5, stepY(8)); c.stroke();
    c.restore();
    drawClef(c, x + 1.7 * s, stepY(2), s, ink);
    // 調號
    const sig = CF.signature(j), sharp = j > 0, steps = sharp ? SHARP_STEPS : FLAT_STEPS;
    const sigCol = opt.sigColor || (sharp ? C['cf-sharp'] : C['cf-flat']);
    let sx = x + 3.9 * s;
    const dx = sharp ? 1.1 * s : 0.95 * s;
    sig.marks.forEach(function (m, i) {
      const acc = m.acc;
      drawAcc(c, acc, sx + (Math.abs(acc) === 2 && acc < 0 ? 0.36 * s : 0), stepY(steps[i]), s, sigCol);
      sx += dx + (acc === -2 ? 0.7 * s : 0);
    });
    if (!sig.marks.length) sx += 0.4 * s;
    // 音階的音（八度以字母與 MIDI 決定，和播放的音一致）
    const notes = CF.scale(j, mode), mids = CF.scaleMidis(j, mode);
    const nx0 = sx + 1.6 * s, nx1 = x + w - 1.4 * s, gap = (nx1 - nx0) / 7.4;
    const nameY = stepY(-4) + 2;
    const out = [];
    for (let i = 0; i < 8; i++) {
      const n = notes[i % 7], midi = mids[i];
      const oct = Math.floor((midi - n.acc) / 12) - 1;
      const st = (oct - 4) * 7 + CF.LETTER_STEP[n.letter] - 2;
      const nx = nx0 + i * gap, ny = stepY(st);
      // 加線
      c.save(); c.strokeStyle = alpha(ink, 0.78); c.lineWidth = 1;
      for (let L = -2; L >= st - (st % 2 === 0 ? 0 : 1) && L >= -6; L -= 2) { const yy = Math.round(stepY(L)) + 0.5; c.beginPath(); c.moveTo(nx - s * 1.05, yy); c.lineTo(nx + s * 1.05, yy); c.stroke(); }
      for (let L = 10; L <= st && L <= 16; L += 2) { const yy = Math.round(stepY(L)) + 0.5; c.beginPath(); c.moveTo(nx - s * 1.05, yy); c.lineTo(nx + s * 1.05, yy); c.stroke(); }
      c.restore();
      const isT = i === 0 || i === 7, chg = opt.changed && opt.changed[n.letter];
      const on = opt.playDeg != null && opt.playDeg === i;
      const col = on ? C.accent : chg ? C['cf-target'] : isT ? C['cf-key'] : ink;
      if (on && !D.reducedMotion()) { c.beginPath(); c.arc(nx, ny, s * 1.15, 0, TAU); c.fillStyle = alpha(C.accent, 0.18); c.fill(); }
      drawWholeNote(c, nx, ny, s, col);
      out.push({ x: nx, name: n.name, col: chg ? C['cf-target'] : isT ? C['cf-key'] : C.muted });
    }
    // 音名
    let npx = Math.min(12, gap * 0.42 / fs + 2);
    out.forEach(function (o) { D.haloText(c, o.name, o.x, nameY + 8 * fs, o.col, 'center', 'middle', fnt(npx, 700)); });
    return { h: nameY + 16 * fs - y, sigEnd: sx };
  }
  function drawSigPanel(c) {
    const x = 6, w = W2 - 12;
    card(c, x, 4, w, H2 - 8);
    const tx = x + 12, tw = w - 24;
    // 標題
    const head = T('調號：', 'Key signature: ') + keyName(A.j, 'major') + T('・', ' · ') + keyName(A.j, 'minor');
    title(c, head, tx, 14, C.text, 13.5, tw * 0.68);
    c.font = fnt(12, 700); c.textAlign = 'right'; c.textBaseline = 'top'; c.fillStyle = sideColor(A.j);
    c.fillText(sigShort(A.j) + (A.theoretical ? T('（理論）', ' (theor.)') : ''), x + w - 12, 15);
    const pe = playingEvent();
    let playDeg = null;
    if (pe && state.play.what === 'scale') playDeg = pe.deg;
    let y = 34 * fs + 10;
    const r1 = drawStaff(c, tx, y, tw, A.j, A.mode, { playDeg: playDeg });
    y += r1.h + 8;
    // 升降記號的順序
    const rows = [[T('升記號的順序', 'Order of sharps'), SHARP_ORDER, A.j > 0, C['cf-sharp'], '♯'], [T('降記號的順序', 'Order of flats'), FLAT_ORDER, A.j < 0, C['cf-flat'], '♭']];
    // 標籤最多佔 36% 寬，放不下就縮小字
    let lpx = 11.5;
    const labMax = tw * 0.36 - 8;
    const labWidth = function () { c.font = fnt(lpx, 600); return Math.max(c.measureText(rows[0][0]).width, c.measureText(rows[1][0]).width); };
    while (lpx > 7.5 && labWidth() > labMax) lpx -= 0.5;
    const labW = Math.min(tw * 0.36, labWidth() + 8);
    const chipW = (tw - labW) / 7, chipH = Math.max(20, 20 * fs);
    rows.forEach(function (row, ri) {
      const yy = y + ri * (chipH + 6);
      c.font = fnt(lpx, 600); c.fillStyle = row[2] ? row[3] : C.muted; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(row[0], tx, yy + chipH / 2);
      const n = row[2] ? Math.abs(A.j) : 0;
      row[1].forEach(function (L, i) {
        const cx0 = tx + labW + i * chipW;
        const on = i < n, dbl = n >= i + 8;
        D.roundRect(c, cx0 + 2, yy, chipW - 4, chipH, chipH / 2);
        c.fillStyle = on ? alpha(row[3], D.dark ? 0.32 : 0.18) : alpha(C.text, 0.04); c.fill();
        c.strokeStyle = on ? alpha(row[3], 0.7) : alpha(C.text, 0.12); c.lineWidth = 1; c.stroke();
        const txt = L + (on ? (dbl ? row[4] + row[4] : row[4]) : '');
        let cp = 11.5;
        c.font = fnt(cp, on ? 700 : 500);
        while (cp > 7.5 && c.measureText(txt).width > chipW - 8) { cp -= 0.5; c.font = fnt(cp, on ? 700 : 500); }
        c.fillStyle = on ? (D.dark ? C.text : shade(row[3], -0.15)) : C.muted; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(txt, cx0 + chipW / 2, yy + chipH / 2 + 0.5);
      });
    });
    y += 2 * (chipH + 6) + 8;
    // 比較的調
    if (A.t) {
      const t = A.t;
      const chg = {}; t.changed.forEach(function (q) { chg[q.letter] = true; });
      // 同名異音：七個音完全相同，只是換寫法，五線譜上不標「要改」的音
      const line = T('比較：', 'Compared: ') + keyName(t.j, t.mode) + T('（共同音 ' + t.common + '，', ' (' + t.common + ' common, ') +
        (t.respell.length ? T('音完全相同，只是換寫法', 'same notes, only respelled')
          : t.changed.length ? T('改 ', 'change ') + t.changed.map(function (q) { return q.from + '→' + q.to; }).join(' ') : T('不用改', 'no change')) + T('）', ')');
      title(c, line, tx, y, C['cf-target'], 12.5, tw);
      y += 20 * fs;
      let mDeg = null;
      if (pe && state.play.what === 'modulate' && pe.key === 2) mDeg = null;
      drawStaff(c, tx, y, tw, t.j, t.mode, { changed: chg, playDeg: mDeg });
    } else {
      c.font = fnt(11.5); c.fillStyle = C.muted; c.textAlign = 'left'; c.textBaseline = 'top';
      const tip = T('在「比較的調」選一個調，這裡會畫出它的調號，並標出要改的音。', 'Choose a key in “Compare with” to see its signature here, with the notes that change marked.');
      wrapText(c, tip, tx, y + 4, tw, 15 * fs);
    }
  }
  function wrapText(c, text, x, y, w, lh) {
    const en = /^[\x00-\x7F’“”–—…]*$/.test(text);
    const parts = en ? text.split(' ') : text.split('');
    let line = '', yy = y;
    parts.forEach(function (p) {
      const test = line + (en && line ? ' ' : '') + p;
      if (c.measureText(test).width > w && line) { c.fillText(line, x, yy); yy += lh; line = p; }
      else line = test;
    });
    if (line) c.fillText(line, x, yy);
  }

  // ---------- 熱圖 ----------
  let heatGeo = null;
  function heatColor(v) {
    const u = Math.max(0, Math.min(1, (v - 2) / 5));
    return mix(mix(C.surface, C['canvas-bg'], 0.5), C['cf-heat'], 0.1 + 0.85 * Math.pow(u, 0.9));
  }
  function drawHeatPanel(c) {
    const x = 6, w = W2 - 12;
    card(c, x, 4, w, H2 - 8);
    const tx = x + 12, tw = w - 24;
    title(c, T('共同音（大調；小調看它的關係大調）', 'Common notes (major keys; a minor key shares its relative major’s notes)'), tx, 14, C.text, 13, tw);
    c.font = fnt(11); c.fillStyle = C.muted; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillText(state.order === 'fifths' ? T('順序：五度（和五度圈一樣）', 'Order: by fifths (as on the circle)') : T('順序：半音（和鋼琴鍵一樣）', 'Order: by semitones (as on the piano)'), tx, 32 * fs + 2);
    const keys = CF.heatKeys(state.order), tab = CF.heatTable(state.order);
    const labW = Math.max(26, 30 * fs), top = 52 * fs + 14;
    const cs = Math.max(14, Math.min((tw - labW) / 12, (H2 - top - 34 * fs) / 12.6));
    const gx = tx + labW, gy = top + 16 * fs;
    heatGeo = { gx: gx, gy: gy, cs: cs };
    const curRow = state.order === 'fifths' ? CF.posOf(A.j) : mod(7 * A.j, 12);
    const tgtCol = A.t ? (state.order === 'fifths' ? CF.posOf(A.t.j) : mod(7 * A.t.j, 12)) : -1;
    // 欄、列標頭
    // 欄標頭：字縮到放得進一格（例如 D♭、F♯）
    let lp = Math.min(11, cs * 0.42 / fs + 1.5);
    c.font = fnt(lp, 700);
    while (lp > 6 && keys.some(function (j) { return c.measureText(CF.keyLabel(j, 'major')).width > cs - 2; })) { lp -= 0.5; c.font = fnt(lp, 700); }
    for (let i = 0; i < 12; i++) {
      const nm = CF.keyLabel(keys[i], 'major');
      D.haloText(c, nm, gx + (i + 0.5) * cs, gy - 9 * fs, i === tgtCol ? C['cf-target'] : C.muted, 'center', 'middle', fnt(lp, i === tgtCol ? 700 : 600));
      D.haloText(c, nm, gx - 5, gy + (i + 0.5) * cs, i === curRow ? C['cf-key'] : C.muted, 'right', 'middle', fnt(lp, i === curRow ? 700 : 600));
    }
    // 格子
    let np = Math.min(12, cs * 0.5 / fs);
    for (let r = 0; r < 12; r++) for (let k = 0; k < 12; k++) {
      const v = tab[r][k], cx0 = gx + k * cs, cy0 = gy + r * cs;
      c.fillStyle = heatColor(v); c.fillRect(cx0 + 0.5, cy0 + 0.5, cs - 1, cs - 1);
      const u = (v - 2) / 5;
      c.font = fnt(np, v === 7 ? 700 : 600); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = u > 0.55 ? (D.dark ? '#0b1220' : '#ffffff') : alpha(C.text, 0.82);
      c.fillText(String(v), cx0 + cs / 2, cy0 + cs / 2 + 0.5);
    }
    // 目前的列、比較的欄
    c.save();
    c.strokeStyle = C['cf-key']; c.lineWidth = 2;
    c.strokeRect(gx + 1, gy + curRow * cs + 1, 12 * cs - 2, cs - 2);
    if (tgtCol >= 0) {
      c.setLineDash([4, 3]); c.strokeStyle = C['cf-target'];
      c.strokeRect(gx + tgtCol * cs + 1, gy + 1, cs - 2, 12 * cs - 2);
      c.setLineDash([]); c.lineWidth = 3; c.strokeStyle = C.text;
      c.strokeRect(gx + tgtCol * cs + 1.5, gy + curRow * cs + 1.5, cs - 3, cs - 3);
    }
    if (kb2 && kb2.focused()) { c.setLineDash([5, 4]); c.strokeStyle = C.accent; c.lineWidth = 2; c.strokeRect(gx - 3, gy - 3, 12 * cs + 6, 12 * cs + 6); }
    c.restore();
    // 色階說明
    const ly = gy + 12 * cs + 10;
    c.font = fnt(10.5, 600); c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = C.muted;
    const lead = T('共同音', 'common');
    c.fillText(lead, gx, ly + 7);
    let lx = gx + c.measureText(lead).width + 8;
    const sw = Math.min(26, (tw - (lx - tx)) / 7);
    for (let v = 2; v <= 7; v++) {
      c.fillStyle = heatColor(v); c.fillRect(lx, ly, sw - 2, 14);
      c.fillStyle = (v - 2) / 5 > 0.55 ? (D.dark ? '#0b1220' : '#ffffff') : C.text; c.textAlign = 'center';
      c.fillText(String(v), lx + (sw - 2) / 2, ly + 7.5);
      lx += sw;
    }
  }

  // ---------- 乘 k ----------
  function kAngle(n, now) {
    const sf = CF.slotOf(n, state.aFrom), st = CF.slotOf(n, state.a);
    let u = D.reducedMotion() ? 1 : Math.min(1, (now - state.aT0) / 700);
    u = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    let d = mod(st - sf + 6, 12) - 6;
    if (d === -6) d = 6;
    return (sf + d * u) * SEC;
  }
  function drawKPanel(c, now) {
    const x = 6, w = W2 - 12;
    card(c, x, 4, w, H2 - 8);
    const tx = x + 12, tw = w - 24;
    title(c, T('乘 k = ' + A.k + '：從主音開始，每次加 ' + A.k + ' 個半音', 'Times k = ' + A.k + ': from the tonic, add ' + A.k + ' semitones each time'), tx, 14, C.text, 13, tw);
    const cyc = CF.cycles(A.k);
    // 讓含主音的圈排第一個
    const ti = cyc.findIndex(function (cy) { return cy.indexOf(A.tonicPc) >= 0; });
    const order = cyc.map(function (cy, i) { return i; });
    order.splice(ti, 1); order.unshift(ti);
    const areaTop = 34 * fs + 16, areaBot = H2 - 62 * fs;
    const rk = Math.max(60, Math.min(tw / 2 - 30 * fs, (areaBot - areaTop) / 2 - 18 * fs));
    const cx = x + w / 2, cy = areaTop + (areaBot - areaTop) / 2;
    // 底盤
    c.save();
    c.shadowColor = D.shadowInk(D.dark ? 0.45 : 0.14); c.shadowBlur = 12; c.shadowOffsetY = 3;
    c.beginPath(); c.arc(cx, cy, rk + 16, 0, TAU); c.fillStyle = mix(C.surface, C['canvas-bg'], 0.3); c.fill();
    c.restore();
    c.beginPath(); c.arc(cx, cy, rk, 0, TAU); c.strokeStyle = alpha(C.text, 0.12); c.lineWidth = 1; c.stroke();
    const pos = [];
    for (let n = 0; n < 12; n++) { const a = kAngle(n, now); pos[n] = { x: cx + rk * Math.sin(a), y: cy - rk * Math.cos(a), a: a }; }
    // 格子的刻度
    for (let sl = 0; sl < 12; sl++) { const a = sl * SEC; c.beginPath(); c.arc(cx + (rk + 9) * Math.sin(a), cy - (rk + 9) * Math.cos(a), 1.5, 0, TAU); c.fillStyle = alpha(C.muted, 0.5); c.fill(); }
    // 每個圈：半透明的面＋管狀邊
    order.forEach(function (ci, k) {
      const cyl = cyc[ci], col = cycleColor(k);
      if (cyl.length >= 3) {
        c.beginPath(); cyl.forEach(function (n, i) { const q = pos[n]; if (i) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); }); c.closePath();
        c.fillStyle = alpha(col, D.dark ? 0.1 : 0.07); c.fill('evenodd');
      }
      for (let i = 0; i < cyl.length; i++) {
        const a = pos[cyl[i]], b = pos[cyl[(i + 1) % cyl.length]];
        if (cyl.length === 2 && i === 1) break;
        D.tube(c, function (cc) { cc.moveTo(a.x, a.y); cc.lineTo(b.x, b.y); }, col, k === 0 ? 3.6 : 2.6);
      }
    });
    // 播放中的路徑
    const pe = playingEvent();
    if (pe && state.play.what === 'kseq') {
      const seqPcs = CF.kSequence(A.tonicPc, A.k);
      c.save(); c.strokeStyle = C.accent; c.lineWidth = 4.5; c.lineCap = 'round'; c.lineJoin = 'round'; c.globalAlpha = 0.85;
      c.beginPath();
      for (let i = 0; i <= pe.idx; i++) { const q = pos[seqPcs[i]]; if (i) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); }
      c.stroke(); c.restore();
    }
    // 點與音名
    const lp = Math.max(10, Math.min(13, rk / 9));
    for (let n = 0; n < 12; n++) {
      const q = pos[n], isT = n === A.tonicPc, inKey = A.pcs.indexOf(n) >= 0;
      const k = order.findIndex(function (ci) { return cyc[ci].indexOf(n) >= 0; });
      const on = pe && state.play.what === 'kseq' && pe.pc === n;
      D.ball(c, q.x, q.y, isT ? 7.5 : on ? 7 : 5.5, on ? C.accent : isT ? C['cf-key'] : cycleColor(k), { glow: on ? 0.7 : (D.dark ? 0.3 : 0.06) });
      if (on && !D.reducedMotion()) D.ripple(c, q.x, q.y, 8, Math.max(0, Math.min(1, (seq ? seq.elapsed() - pe.t : 0) / pe.dur)), C.accent);
      const lr = rk + 24 * Math.max(1, fs * 0.9);
      D.haloText(c, CF.pcName(n, A.j), cx + lr * Math.sin(q.a), cy - lr * Math.cos(q.a), isT ? C['cf-key'] : inKey ? C.text : C.muted, 'center', 'middle', fnt(lp, isT || inKey ? 700 : 500));
    }
    // 中央（半透明底襯，線條很密時也讀得到）
    const l1 = 'gcd(' + A.k + ', 12) = ' + A.g, l2 = T(A.g + ' 個圈 × ' + A.len + ' 個點', A.g + ' × ' + A.len + ' notes');
    const f1 = fnt(Math.min(14, rk / 6), 700), f2 = fnt(Math.min(11.5, rk / 7.5), 600);
    c.font = f1; let bw = c.measureText(l1).width; c.font = f2; bw = Math.max(bw, c.measureText(l2).width) + 16;
    D.roundRect(c, cx - bw / 2, cy - 22 * fs, bw, 42 * fs, 10);
    c.fillStyle = alpha(mix(C.surface, C['canvas-bg'], 0.3), 0.82); c.fill();
    D.haloText(c, l1, cx, cy - 8 * fs, C.text, 'center', 'middle', f1);
    D.haloText(c, l2, cx, cy + 11 * fs, C.muted, 'center', 'middle', f2);
    // 下方說明
    const by = H2 - 50 * fs;
    c.font = fnt(11.5, 600); c.fillStyle = C.text; c.textAlign = 'left'; c.textBaseline = 'top';
    let line1 = T('排列：', 'Arrangement: ') + arrName(state.a) + T('　每一步跨 ' + A.slotStep + ' 格', '   ' + A.slotStep + (A.slotStep === 1 ? ' slot' : ' slots') + ' per step');
    let p1 = 11.5; while (p1 > 8.5 && c.measureText(line1).width > tw) { p1 -= 0.5; c.font = fnt(p1, 600); }
    c.fillText(line1, tx, by);
    const line2 = A.g === 1 ? T('k 和 12 互質：一個圈就走遍 12 個音', 'k is coprime to 12: one cycle visits all 12 notes')
      : T('k 和 12 的最大公因數是 ' + A.g + '：分成 ' + A.g + ' 個小圈', 'gcd(k, 12) = ' + A.g + ': the notes split into ' + A.g + ' smaller cycles');
    c.font = fnt(11); c.fillStyle = C.muted;
    let p2 = 11; while (p2 > 8.5 && c.measureText(line2).width > tw) { p2 -= 0.5; c.font = fnt(p2); }
    c.fillText(line2, tx, by + 18 * fs);
  }

  function updateCanvasLabels() {
    const lab = T('右側的圖：', 'Second picture: ') + (state.panel === 'sig' ? T('五線譜上的調號與音階。', 'key signature and scale on the staff. ') + keyName(A.j, A.mode) + T('：', ': ') + sigWords(A.j) + T('，音階 ', ', scale ') + A.names.join(' ')
      : state.panel === 'heat' ? T('兩個大調的共同音數熱圖，', 'map of common notes between major keys, ') + (state.order === 'fifths' ? T('依五度排列。', 'ordered by fifths.') : T('依半音排列。', 'ordered by semitones.'))
        : T('半音圈上每次加 ' + A.k + ' 個半音的路徑：' + A.g + ' 個圈，每圈 ' + A.len + ' 個音。', 'path adding ' + A.k + ' semitones on the semitone circle: ' + A.g + ' cycles of ' + A.len + ' notes.'));
    cv2.setAttribute('aria-label', lab + T('方向鍵可在熱圖上移動。', ' Arrow keys move across the map.'));
  }

  // ---------- 動畫迴圈 ----------
  let raf = 0, lastT = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0, (now - (lastT || now)) / 1000));
    lastT = now;
    let more = false;
    // 轉盤動畫（介面的過場：緩出，不是物理運動）
    if (!drag && Math.abs(state.rotGoal - state.rot) > 1e-3) {
      if (D.reducedMotion()) state.rot = state.rotGoal;
      else { state.rot += (state.rotGoal - state.rot) * (1 - Math.exp(-dt / 0.07)); more = true; }
    } else if (!drag) state.rot = state.rotGoal;
    if (state.play && seq) {
      const el = seq.elapsed();
      if (el >= state.play.total) { stopPlay(); }
      else {
        more = true;
        let idx = -1;
        state.play.events.forEach(function (e, i) { if (el >= e.t) idx = i; });
        if (idx !== state.play.idx) { state.play.idx = idx; rebuild3D(); }
      }
    }
    if (now - state.aT0 < 760 && !D.reducedMotion()) more = true;
    if (!view3 || !view3.active) {
      drawDial(now);
      D.backdrop(ctx2, W2, H2);
      if (state.panel === 'heat') drawHeatPanel(ctx2);
      else if (state.panel === 'k') drawKPanel(ctx2, now);
      else drawSigPanel(ctx2);
    }
    if (view3 && view3.active) view3.frame();
    if (more) requestDraw(); else lastT = 0;
  }

  // 點右側的圖：熱圖的格子
  cv2.addEventListener('click', function (e) {
    if (state.panel !== 'heat' || !heatGeo) return;
    const q = localXY(e, cv2), g = heatGeo;
    const k = Math.floor((q.x - g.gx) / g.cs), r = Math.floor((q.y - g.gy) / g.cs);
    if (k >= 0 && k < 12 && r >= 0 && r < 12) heatTap(r, k);
  });

  // =====================================================================
  // 3D：切換到 3D 時才載入 js/circle-of-fifths-3d.js 與 three.js
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    CF: CF, T: T, D: D,
    colors: function () { return C; },
    fs: function () { return fs; },
    data: function () {
      const pe = playingEvent();
      return { a: A, visited: state.visited, sounding: pe ? (pe.key === 2 && A.t ? { j: A.t.j, mode: A.t.mode } : { j: A.j, mode: A.mode }) : null, flat: state.flat3d };
    },
    keyName: keyName, sigShort: sigShort,
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 五度圈。', 'The 3D graphics context was lost, so the view switched back to the 2D circle.');
    }
  };
  function rebuild3D() { if (view3 && view3.active) view3.rebuild(); }
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.CircleFifths3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.CircleFifths3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/circle-of-fifths-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.CircleFifths3D) throw new Error('circle-of-fifths-3d.js did not load');
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
        view3 = window.CircleFifths3D.create(lib, host3, bridge);
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
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 五度圈。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D circle is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  $('flat').addEventListener('click', function () {
    state.flat3d = !state.flat3d;
    $('flat').setAttribute('aria-pressed', String(state.flat3d));
    if (view3) view3.setFlat(state.flat3d);
    say(state.flat3d ? T('螺旋壓成圓：同名異音的兩個調疊在一起（十二平均律）。', 'The spiral is squashed into a circle: enharmonic keys coincide (equal temperament).')
      : T('螺旋展開：每轉一圈多 12 個記號，同名異音的兩個調一上一下。', 'The spiral is unfolded: each turn adds 12 accidentals, and enharmonic keys sit one above the other.'));
  });

  // ---------- 分享目前設定：轉盤上的調、寫法、調式、重排（比較的調、播放內容、速度、k 由 classroom.js 記錄） ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { p: state.pos, s: state.spell, m: state.mode, a: state.a, o: state.order, v: state.panel }; },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      if (isFinite(o.p)) { state.pos = mod(Math.round(o.p), 12); state.rot = state.rotGoal = state.pos; }
      if (['auto', 'sharp', 'flat'].indexOf(o.s) >= 0) state.spell = o.s;
      if (o.m === 'major' || o.m === 'minor') state.mode = o.m;
      if (CF.isUnit(o.a)) { state.a = state.aFrom = mod(o.a, 12); }
      if (o.o === 'fifths' || o.o === 'chrom') state.order = o.o;
      if (['sig', 'heat', 'k'].indexOf(o.v) >= 0) state.panel = o.v;
      const tv = elTarget.value;
      if (tv) { const q = tv.split(':'); state.target = { j: parseInt(q[0], 10), mode: q[1] === 'minor' ? 'minor' : 'major' }; }
      readK(false);
      keyChanged('share', true);
      resize();
    }
  });

  // 給測試用的介面（不影響畫面）
  window.__cf = {
    state: state,
    analysis: function () { return A; },
    turn: function (d) { turn(d); },
    tap: function (p, m) { tapKey(p, m || state.mode); },
    heat: function (r, c) { heatTap(r, c); },
    view3: function () { return view3; }
  };

  // =====================================================================
  // 啟動（不發聲、不送任務事件）
  // =====================================================================
  readColors();
  buildTargetOptions();
  (function initFromControls() {
    state.what = $('what').value || 'triad';
    const k = Math.max(1, Math.min(11, Math.round(+elK.value || 7)));
    state.k = k; elKO.textContent = String(k);
  })();
  readTempo();
  ['modeSeg', 'spellSeg', 'orderSeg'].forEach(function (id) { $(id).setAttribute('data-share-skip', ''); });
  document.querySelector('.view-bar').setAttribute('data-share-skip', '');
  updateSoundButton();
  recompute();
  visit();
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
    new ResizeObserver(function () { if (cvrow.clientWidth !== lastW) { lastW = cvrow.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  resize();
})();
