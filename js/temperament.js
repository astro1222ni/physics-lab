/* temperament.js — 「五度相生、純律與十二平均律」的畫面與互動
 * （數學在 temperament-core.js；聲音一律用 music-audio.js；2D 繪圖工具 LabDraw 在 drawkit.js；3D 在 temperament-3d.js，切到 3D 時才載入）
 *
 * 畫面：左（手機在上）是鐘面——角度 = 相對 C 的音分 ÷ 1200 × 360°，外圈是十二平均律的 12 個刻度，
 *       小點是目前音律的 12 個音、大球是選的音，中間是五度疊疊樂的軌跡（每 12 個換一個小一點的圓）；
 *       鐘面下方是「C 附近放大」的尺；右（手機在下）是三種音律相對十二平均律的偏差長條圖；
 *       另一張畫布是每一對音最接近的泛音之間的拍（包絡）。
 * 聲音：只有學生按了鍵盤、「▶ 播放」、「比較三種音律」、「再疊一個五度」、「連續疊」、「和 C 一起聽」才發聲；
 *       音效關閉時畫面照跑，狀態列顯示提示並讓音效開關閃一下（不會自己打開音效）。 */
(function () {
  'use strict';
  const TC = window.TemperamentCore;
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
  const MAXN = 3;              // 最多同時選幾個音
  const NOTE_HI = 79;          // 選音的上限（誤差地圖與快速選音可以超出鍵盤到 G5）
  const PLAY_DUR = 2.6;        // 「▶ 播放」每次幾秒
  const CMP_SEG = 1.7, CMP_GAP = 0.3;   // 「比較三種音律」每種音律幾秒、中間空幾秒
  const STACK_LISTEN = 3;      // 「和 C 一起聽」幾秒
  const STACK_ANIM = 0.38;     // 新的五度畫出來的動畫秒數
  const AUTO_STEP = 0.48;      // 「連續疊」每一步的間隔（秒）
  const GAIN = 0.4;            // 一個音的音量（同時幾個音時除以 √n）
  const KIND_NAME = {
    pythagorean: ['五度相生', 'Pythagorean'], just: ['純律', 'Just'], equal: ['十二平均律', 'Equal temperament'], regular: ['調和律', 'Regular']
  };
  const kname = function (k) { return T(KIND_NAME[k][0], KIND_NAME[k][1]); };
  const mod = TC.mod;

  // ---------- 狀態 ----------
  const state = {
    kind: 'pythagorean', tonic: 0, w: 0,
    notes: [60, 64], order: [60, 64],     // 選的音（由低到高）與選的先後
    stack: 0, anim: null,                 // 疊了幾個五度；最新一個五度的動畫
    auto: null,                           // 連續疊
    play: null,                           // 正在播放（畫面用）：{ mode, t0, seg, total, kinds, idx }
    held: {},                             // 按住的鍵：pointerId → { m, h, t0, was, key }
    beatSrc: 'sel',                       // 拍頻圖顯示選的音（sel）或疊疊樂和 C（stack）
    offHintShown: false
  };

  // ---------- 色彩與字體 ----------
  let C = {}, fs = 1;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'tm-pyth', 'tm-just', 'tm-equal', 'tm-reg', 'tm-stack', 'tm-gap', 'tm-narrow', 'tm-wide']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    fs = Math.max(1, Math.min(1.45, parseFloat(cs.getPropertyValue('--fs')) || 1));
  }
  const KC = function (k) { return C['tm-' + (k === 'pythagorean' ? 'pyth' : k === 'regular' ? 'reg' : k)]; };
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
  const nn = function (m) { return TC.noteName(state.tonic, m); };
  const pcName = function (pc) { return TC.spell(state.tonic, pc); };
  /** 比值的文字：五度相生、純律是分數；十二平均律是 2 的次方；調和律是小數 */
  function ratioHTML(r, dec) {
    if (r && r.p != null) return r.p + '/' + r.q;
    if (r && r.et != null) return r.et % 12 === 0 ? String(Math.pow(2, r.et / 12)) : '2<sup>' + String(r.et).replace('-', '−') + '/12</sup>';
    return dec;
  }
  function fifth() { return TC.stackFifth(state.kind, state.w); }

  // ---------- 任務事件 ----------
  function emit(type, data) {
    if (window.LabShare && window.LabShare.restoring) return;
    if (window.LabMission) window.LabMission.emit(type, data);
  }
  /** 給任務的分析資料（和 tools/mission-proofs/temperament.js 的 analysis() 一樣） */
  function analysis(kind, notes, src) {
    const a = TC.analyze(kind, state.tonic, state.w, notes);
    return {
      kind: kind, tonic: state.tonic, w: state.w, notes: a.notes, freqs: a.freqs, devs: a.devs, count: a.notes.length, src: src || 'keys',
      pairs: a.pairs.map(function (p) { return { lo: p.lo, hi: p.hi, semis: p.semis, cents: p.cents, dev: p.dev, beat: p.beat, m: p.m, n: p.n }; })
    };
  }

  // =====================================================================
  // 鍵盤（C4–C5，HTML 按鈕）
  // =====================================================================
  const piano = $('piano'), above = $('above');
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
    for (let m = TC.KEY_LO; m <= TC.KEY_HI; m++) {
      const b = keyEls[m], pc = mod(m, 12), name = pcName(pc);
      const sel = state.notes.indexOf(m) >= 0;
      const f = TC.freq(state.kind, state.tonic, m, state.w), dv = TC.devET(state.kind, state.tonic, m, state.w);
      b.querySelector('.kn').textContent = (pc === 0 ? name + (Math.floor(m / 12) - 1) : name);
      b.querySelector('.kd').textContent = b.classList.contains('b') ? sg(dv, 0) : sg(dv, 1);
      b.classList.toggle('tonic', pc === state.tonic);
      b.setAttribute('aria-pressed', String(sel));
      b.setAttribute('aria-label', nn(m) + T('，', ', ') + fx(f, 2) + ' Hz' + (pc === state.tonic ? T('（主音）', ' (tonic)') : ''));
    }
    const out = state.notes.filter(function (m) { return m > TC.KEY_HI; });
    above.textContent = out.length ? T('鍵盤外：', 'Above: ') + out.map(nn).join(T('、', ', ')) : '';
  }

  // ---------- 選音 ----------
  function setSelection(list, src) {
    const seen = [];
    list.forEach(function (m) { if (m >= TC.KEY_LO && m <= NOTE_HI && seen.indexOf(m) < 0) seen.push(m); });
    state.order = seen.slice(-MAXN);
    state.notes = state.order.slice().sort(function (a, b) { return a - b; });
    state.beatSrc = 'sel';
    selectionChanged(src);
  }
  function toggleNote(m, src) {
    if (state.notes.indexOf(m) >= 0) setSelection(state.order.filter(function (x) { return x !== m; }), src);
    else setSelection(state.order.concat([m]), src);
  }
  function selectionChanged(src) {
    renderPiano(); renderReadout(); renderEmapPressed(); updateCanvasLabels(); rebuild3D(); requestDraw();
    if (state.notes.length) emit('select', analysis(state.kind, state.notes, src));
    say(selectionSentence());
  }
  function selectionSentence() {
    if (!state.notes.length) return T('沒有選音。點鍵盤選一到三個音。', 'No notes selected. Tap one to three keys.');
    const a = TC.analyze(state.kind, state.tonic, state.w, state.notes);
    let s = T('選了 ', 'Selected ') + a.notes.map(nn).join(T('、', ', ')) + T('（' + kname(state.kind) + '）', ' (' + kname(state.kind) + ')');
    a.pairs.forEach(function (p) {
      s += T('。', '. ') + nn(p.lo) + '–' + nn(p.hi) + T('：' + p.pure.zh + ' ' + fx(p.cents, 2) + ' 音分', ': ' + p.pure.en + ' ' + fx(p.cents, 2) + ' cents') +
        (Math.abs(p.dev) < 0.005 ? T('，純', ', pure') : T('，' + (p.dev > 0 ? '寬 ' : '窄 ') + fx(Math.abs(p.dev), 2), ', ' + fx(Math.abs(p.dev), 2) + (p.dev > 0 ? ' wide' : ' narrow'))) +
        T('，拍頻 ' + fx(p.beat, 2) + ' Hz', ', beats ' + fx(p.beat, 2) + ' Hz');
    });
    return s + T('。', '.');
  }

  // ---------- 鍵盤操作：點一下選或取消，按住一直響；可以同時按 2–3 鍵 ----------
  function startHeld(m) {
    if (!AU.enabled()) {
      if (!state.offHintShown) { state.offHintShown = true; setTimeout(function () { say(AU.offHint()); }, 60); AU.flashSoundButton(); }
      return null;
    }
    return AU.sustain({ f0: TC.freq(state.kind, state.tonic, m, state.w), partials: TC.partials(), gain: 0.3, attack: 0.03, maxDur: 8 });
  }
  piano.addEventListener('pointerdown', function (e) {
    const key = e.target.closest('.key');
    if (!key || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const m = +key.dataset.midi;
    try { key.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    const was = state.notes.indexOf(m) >= 0;
    if (!was) toggleNote(m, 'keys');
    const h = startHeld(m);
    state.held[e.pointerId] = { m: m, h: h, t0: performance.now(), was: was, key: key };
    key.classList.add('on');
    updateStop(); requestDraw();
  });
  function endHeld(e) {
    const rec = state.held[e.pointerId];
    if (!rec) return;
    delete state.held[e.pointerId];
    const dt = performance.now() - rec.t0;
    if (rec.h) {
      const rem = 0.45 - dt / 1000;     // 輕點也至少響 0.45 秒
      if (rem > 0) setTimeout(function () { rec.h.stop(0.25); }, rem * 1000); else rec.h.stop(0.25);
    }
    rec.key.classList.remove('on');
    if (rec.was && dt < 400 && e.type === 'pointerup') toggleNote(rec.m, 'keys');   // 輕點已選的鍵 = 取消
    updateStop(); requestDraw();
  }
  piano.addEventListener('pointerup', endHeld);
  piano.addEventListener('pointercancel', endHeld);
  piano.addEventListener('lostpointercapture', endHeld);
  // 鍵盤（Tab 到鍵上按 Enter 或空白鍵）：選或取消，並短短響一下
  piano.addEventListener('click', function (e) {
    const key = e.target.closest('.key');
    if (!key || e.detail !== 0) return;
    const m = +key.dataset.midi;
    toggleNote(m, 'keys');
    if (AU.enabled()) AU.tone({ f0: TC.freq(state.kind, state.tonic, m, state.w), partials: TC.partials(), dur: 0.6, gain: 0.3, attack: 0.03, release: 0.3 });
  });

  // =====================================================================
  // 讀數（選音）、音律說明、誤差地圖、疊疊樂、五度收窄
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }

  function renderReadout() {
    if (!state.notes.length) { setHTML('readout', '<p class="sel-empty">' + T('還沒有選音：點鍵盤，或按上面的按鈕。', 'No notes yet: tap the keyboard or use the buttons above.') + '</p>'); return; }
    const kind = state.kind, a = TC.analyze(kind, state.tonic, state.w, state.notes);
    let h = '<div class="tablewrap"><table class="nt"><thead><tr><th>' + T('音', 'Note') + '</th><th>' + T('頻率（Hz）', 'Freq. (Hz)') + '</th><th>' +
      T('和主音的比', 'Ratio to tonic') + '</th><th>' + T('和平均律差', 'vs equal') + '</th></tr></thead><tbody>';
    a.notes.forEach(function (m, i) {
      const r = TC.tonicRatio(kind, state.tonic, m);
      h += '<tr><td>' + esc(nn(m)) + '</td><td>' + fx(a.freqs[i], 2) + '</td><td>' + ratioHTML(r, fx(TC.ratioRel(kind, m - TC.C4 - state.tonic, state.w), 4)) + '</td><td>' + sg(a.devs[i], 2) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    a.pairs.forEach(function (p) {
      const r = TC.pairRatio(kind, state.tonic, p.lo, p.hi);
      const pure = Math.abs(p.dev) < 0.005;
      const name = T(p.pure.zh, p.pure.en);
      h += '<div class="pairbox"><h3>' + esc(nn(p.lo) + '–' + nn(p.hi)) + T('・', ' · ') + esc(name) + '</h3><dl class="readout">' +
        '<dt>' + T('頻率比', 'Frequency ratio') + '</dt><dd>' + ratioHTML(r, '') + (r && r.p != null && Math.max(r.p, r.q) > 99 || (r && r.et != null && r.et % 12 !== 0) || !r ? (r ? ' ≈ ' : '') + fx(p.f2 / p.f1, 4) : '') + '</dd>' +
        '<dt>' + T('音分', 'Cents') + '</dt><dd>' + fx(p.cents, 2) + '</dd>' +
        '<dt>' + T('純音程 ', 'Pure ') + p.pure.p + '/' + p.pure.q + '</dt><dd>' + fx(p.pure.cents, 2) + '</dd>' +
        '<dt>' + T('和純音程差', 'Off from pure') + '</dt><dd class="' + (pure ? 'ok-txt' : Math.abs(p.dev) > 10 ? 'bad-txt' : '') + '">' +
        (pure ? T('0（純）', '0 (pure)') : sg(p.dev, 2) + ' <small>' + (p.dev > 0 ? T('寬', 'wide') : T('窄', 'narrow')) + '</small>') + '</dd>' +
        '<dt>' + T('拍頻', 'Beats') + '</dt><dd class="' + (p.beat < 0.005 ? 'ok-txt' : '') + '">' + fx(p.beat, 2) + ' Hz</dd></dl>' +
        '<p class="hint">' + (p.beat < 0.005
          ? T('最接近的泛音剛好重合：' + p.m + ' × ' + fx(p.f1, 2) + ' = ' + p.n + ' × ' + fx(p.f2, 2) + ' = ' + fx(p.fm, 1) + ' Hz，所以不拍。',
            'The closest overtones coincide exactly: ' + p.m + ' × ' + fx(p.f1, 2) + ' = ' + p.n + ' × ' + fx(p.f2, 2) + ' = ' + fx(p.fm, 1) + ' Hz, so there are no beats.')
          : T('最接近的泛音：' + nn(p.lo) + ' 的第 ' + p.m + ' 泛音 ' + fx(p.fm, 1) + ' Hz 與 ' + nn(p.hi) + ' 的第 ' + p.n + ' 泛音 ' + fx(p.fn, 1) + ' Hz' + (p.beat > 25 ? '（拍太快，聽起來是粗糙感）' : '') + '。',
            'Closest overtones: overtone ' + p.m + ' of ' + nn(p.lo) + ' at ' + fx(p.fm, 1) + ' Hz and overtone ' + p.n + ' of ' + nn(p.hi) + ' at ' + fx(p.fn, 1) + ' Hz' + (p.beat > 25 ? ' (too fast to count: it sounds rough)' : '') + '.')) +
        '</p></div>';
    });
    setHTML('readout', h);
  }

  function wolfText(list) {
    return list.map(function (b) {
      return pcName(b.pc) + '–' + pcName(b.pc + 7) + ' ' + (b.err < 0 ? T('窄 ', 'narrow by ') : T('寬 ', 'wide by ')) + fx(Math.abs(b.err), 2);
    }).join(T('、', '; '));
  }
  function renderKindHint() {
    const k = state.kind, t = TC.TONIC_NAMES[state.tonic];
    let h = '';
    if (k === 'pythagorean') {
      h = T('十二個音都由純五度 3/2 疊出來（主音 ' + t + ' 往下 5 個、往上 6 個）。不純的五度：', 'All twelve notes are stacked pure fifths 3/2 (five below and six above the tonic ' + t + '). Impure fifths: ') +
        wolfText(TC.badFifths(k, state.tonic, state.w, 0.01)) + T(' 音分（狼五度）。', ' cents (the wolf).');
    } else if (k === 'just') {
      h = T('以主音 ' + t + ' 為準：主音、下屬音、屬音上的大三和弦都是 4 : 5 : 6。不純的五度：', 'Built on the tonic ' + t + ': the major chords on the tonic, fourth and fifth are all 4 : 5 : 6. Impure fifths: ') +
        wolfText(TC.badFifths(k, state.tonic, state.w, 0.01)) + T(' 音分。', ' cents.');
    } else if (k === 'equal') {
      h = T('每個半音都是 2<sup>1/12</sup>（100 音分），換主音完全不變：每個五度窄 1.955、每個大三度寬 13.686、每個小三度窄 15.641 音分。',
        'Every semitone is 2<sup>1/12</sup> (100 cents), whatever the tonic: every fifth is 1.955 cents narrow, every major third 13.686 wide, every minor third 15.641 narrow.');
    } else {
      const r = TC.regular(state.w);
      let land = '';
      if (Math.abs(state.w) < 0.0005) land = T('（= 五度相生）', ' (= Pythagorean)');
      else if (Math.abs(state.w - TC.PYTH_COMMA / 12) < 0.0015) land = T('（= 十二平均律）', ' (= equal temperament)');
      else if (Math.abs(state.w - TC.SYNTONIC / 4) < 0.0015) land = T('（= 中全音律，大三度純）', ' (= quarter-comma meantone: pure major thirds)');
      h = T('每個五度窄 w = ' + fx(state.w, 3) + ' 音分，十一個五度是 ' + fx(r.fifth, 3) + land + '；剩下的狼五度 ', 'Each fifth narrowed by w = ' + fx(state.w, 3) + ' cents: eleven fifths are ' + fx(r.fifth, 3) + land + '; the remaining wolf fifth ') +
        pcName(state.tonic + 6) + '–' + pcName(state.tonic + 1) + T(' 和純五度差 ' + sg(r.wolf, 3) + ' 音分。拖曳滑桿試試 w = 1.955、5.377。', ' is ' + sg(r.wolf, 3) + ' cents from pure. Try w = 1.955 and 5.377.');
    }
    setHTML('kindHint', h);
  }

  // 誤差地圖：12 列（C 到 B）× 五度、大三度、小三度；每格是按鈕，點了就選那兩個音
  const IVS = [{ k: 'P5', iv: 7, zh: '五度', en: 'Fifth' }, { k: 'M3', iv: 4, zh: '大三度', en: 'Maj. 3rd' }, { k: 'm3', iv: 3, zh: '小三度', en: 'Min. 3rd' }];
  function cellColors(e) {
    const t = Math.min(1, Math.abs(e) / 25);
    if (Math.abs(e) < 0.05) return { bg: alpha(C['tm-equal'], D.dark ? 0.16 : 0.1), fg: C.text };
    const bg = mix(C.surface, e < 0 ? C['tm-narrow'] : C['tm-wide'], 0.1 + (D.dark ? 0.5 : 0.62) * t);
    const rgb = D.rgb(bg), lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    return { bg: bg, fg: lum > 150 ? '#1b1d22' : '#ffffff' };
  }
  function renderEmap() {
    const rows = TC.errorTable(state.kind, state.tonic, state.w);
    let h = '<thead><tr><th scope="col">' + T('從', 'From') + '</th>' + IVS.map(function (x) { return '<th scope="col">' + T(x.zh, x.en) + '</th>'; }).join('') + '</tr></thead><tbody>';
    rows.forEach(function (r) {
      const from = TC.C4 + r.pc;
      h += '<tr><th scope="row">' + esc(pcName(r.pc)) + (r.pc === state.tonic ? ' •' : '') + '</th>';
      IVS.forEach(function (x) {
        const e = r[x.k], c = cellColors(e), to = from + x.iv;
        const lbl = pcName(r.pc) + '–' + pcName(r.pc + x.iv) + T(' ' + x.zh + '：', ' ' + x.en + ': ') +
          (Math.abs(e) < 0.0005 ? T('純', 'pure') : (e > 0 ? T('寬 ', 'wide by ') : T('窄 ', 'narrow by ')) + fx(Math.abs(e), 3) + T(' 音分', ' cents'));
        h += '<td><button type="button" data-from="' + from + '" data-to="' + to + '" style="background:' + c.bg + ';color:' + c.fg + '" aria-label="' + esc(lbl) + '" title="' + esc(lbl) + '" aria-pressed="false">' +
          (Math.abs(e) < 0.05 ? '0' : sg(e, 1)) + '</button></td>';
      });
      h += '</tr>';
    });
    setHTML('emap', h + '</tbody>');
    setHTML('emapHint', T('從每個音往上的五度、大三度、小三度，比純音程寬（紅）或窄（藍）幾音分。目前：' + kname(state.kind) + '，主音 ' + TC.TONIC_NAMES[state.tonic] + '（•）。點一格就選那兩個音。',
      'How many cents each fifth, major third and minor third (going up from each note) is wider (red) or narrower (blue) than pure. Now: ' + kname(state.kind) + ', tonic ' + TC.TONIC_NAMES[state.tonic] + ' (•). Tap a cell to select those two notes.'));
    renderEmapPressed();
  }
  function renderEmapPressed() {
    const n = state.notes;
    $('emap').querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(n.length === 2 && n[0] === +b.dataset.from && n[1] === +b.dataset.to));
    });
  }
  $('emap').addEventListener('click', function (e) {
    const b = e.target.closest('button');
    if (!b) return;
    setSelection([+b.dataset.from, +b.dataset.to], 'emap');
  });

  // 快速選音（從主音起算）
  document.querySelectorAll('[data-preset]').forEach(function (b) {
    b.addEventListener('click', function () {
      const t = TC.C4 + state.tonic, p = b.dataset.preset;
      const list = p === 'M3' ? [t, t + 4] : p === 'm3' ? [t, t + 3] : p === 'P5' ? [t, t + 7] : p === 'triad' ? [t, t + 4, t + 7] : [];
      setSelection(list, 'preset');
    });
  });

  // 疊疊樂的讀數
  function landName(k, p) {
    if (k === 0) return T('C（起點）', 'C (start)');
    const name = k <= 12 ? TC.fifthName(k) : null;
    return name || ('≈ ' + TC.spell(0, p.pc) + ' ' + sg(p.devNear, 2));
  }
  function renderStack() {
    const n = state.stack, f = fifth(), s = TC.stackPair(n, f), p = s.point;
    setHTML('rN', String(n) + (n >= TC.STACK_MAX ? T('（最多）', ' (max)') : ''));
    setHTML('rFifth', fx(f, 3) + T(' 音分', ' cents') + (Math.abs(f - TC.PURE5) < 1e-9 ? ' <small>= 3/2</small>' : f === 700 ? ' <small>= 2<sup>7/12</sup></small>' : ''));
    setHTML('rTotal', fx(p.total, 2) + T(' 音分', ' cents') + ' <small>' + T('≈ ' + p.oct + ' 個八度 + ' + fx(p.r, 2), '≈ ' + p.oct + ' oct. + ' + fx(p.r, 2)) + '</small>');
    setHTML('rLand', esc(landName(n, p)));
    setHTML('rOffC', (n === 0 ? '0' : sg(p.offC, 2)) + T(' 音分', ' cents'));
    setHTML('rStackBeat', fx(s.beat, 2) + ' Hz');
    $('stackOne').disabled = n >= TC.STACK_MAX;
  }

  // 五度收窄的讀數
  const elW = $('ww'), elWo = $('wwo');
  function okCls(v) { return Math.abs(v) < 0.05 ? 'ok-txt' : ''; }
  function renderNarrow() {
    const r = TC.regular(state.w);
    elWo.textContent = fx(state.w, 3);
    setHTML('rwFifth', fx(r.fifth, 3) + T(' 音分', ' cents'));
    const cell = function (id, v) { setHTML(id, '<span class="' + okCls(v) + '">' + sg(v, 3) + '</span>'); };
    cell('rwGap', r.gap12); cell('rwM3', r.M3); cell('rwm3', r.m3); cell('rwWolf', r.wolf);
  }

  // =====================================================================
  // 音律、主音、滑桿
  // =====================================================================
  const kindBtns = document.querySelectorAll('[data-kind]');
  function renderKindButtons() { kindBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.kind === state.kind)); }); }
  function refreshAll() {
    renderKindButtons(); renderKindHint(); renderPiano(); renderReadout(); renderEmap(); renderStack(); renderNarrow(); updateCanvasLabels(); rebuild3D(); requestDraw();
  }
  function setKind(k, src) {
    if (k === state.kind) return;
    stopEverything();
    state.kind = k;
    if (state.beatSrc === 'stack') state.beatSrc = 'sel';
    refreshAll();
    if (src && state.notes.length) emit('select', analysis(k, state.notes, src));
    say(T('音律：' + kname(k) + '。', 'Tuning: ' + kname(k) + '.') + ' ' + $('kindHint').textContent);
  }
  kindBtns.forEach(function (b) { b.addEventListener('click', function () { setKind(b.dataset.kind, 'tuning'); }); });
  $('tonic').addEventListener('change', function () {
    const t = mod(parseInt(this.value, 10) || 0, 12);
    if (t === state.tonic) return;
    stopEverything();
    state.tonic = t;
    refreshAll();
    if (state.notes.length) emit('select', analysis(state.kind, state.notes, 'tonic'));
    say(T('主音：' + TC.TONIC_NAMES[t] + '。', 'Tonic: ' + TC.TONIC_NAMES[t] + '.') + ' ' + $('kindHint').textContent);
  });
  elW.addEventListener('input', function () {
    const w = Math.max(0, Math.min(TC.W_MAX, val(elW)));
    if (w === state.w) { renderNarrow(); return; }
    state.w = w;
    if (state.kind !== 'regular') { stopEverything(); state.kind = 'regular'; }
    refreshAll();
  });
  elW.addEventListener('change', function () {
    state.w = Math.max(0, Math.min(TC.W_MAX, val(elW)));
    renderNarrow();
    emit('narrow', Object.assign({}, TC.regular(state.w)));
    const r = TC.regular(state.w);
    say(T('w = ' + fx(state.w, 3) + '：十二個五度比七個八度 ' + sg(r.gap12, 3) + '，一般大三度 ' + sg(r.M3, 3) + '，一般小三度 ' + sg(r.m3, 3) + '，狼五度 ' + sg(r.wolf, 3) + ' 音分。',
      'w = ' + fx(state.w, 3) + ': twelve fifths minus seven octaves ' + sg(r.gap12, 3) + ', ordinary major thirds ' + sg(r.M3, 3) + ', ordinary minor thirds ' + sg(r.m3, 3) + ', wolf ' + sg(r.wolf, 3) + ' cents.'));
  });

  // =====================================================================
  // 聲音：播放、比較、疊疊樂
  // =====================================================================
  function soundCheck() {
    if (AU.enabled()) return true;
    say(AU.offHint());
    AU.flashSoundButton();
    return false;
  }
  function playNotes(kind, notes, at, dur) {
    const g = GAIN / Math.sqrt(Math.max(1, notes.length));
    notes.forEach(function (m) {
      AU.tone({ f0: TC.freq(kind, state.tonic, m, state.w), partials: TC.partials(), dur: dur, gain: g, attack: 0.04, release: 0.45, at: at });
    });
  }
  function beginVisual(o) {
    state.play = Object.assign({ t0: performance.now(), idx: -1 }, o);
    updateStop(); requestDraw();
  }
  $('play').addEventListener('click', function () {
    stopEverything();
    if (!state.notes.length) { say(T('先在鍵盤上選音（最多三個）。', 'Pick some notes on the keyboard first (up to three).')); return; }
    const on = soundCheck();
    state.beatSrc = 'sel';
    if (on) playNotes(state.kind, state.notes, AU.now() + 0.03, PLAY_DUR);
    beginVisual({ mode: 'play', kinds: [state.kind], seg: PLAY_DUR + 0.45, total: PLAY_DUR + 0.45 });
    emit('listen', analysis(state.kind, state.notes, 'play'));
    if (on) say(T('播放：', 'Playing: ') + selectionSentence());
  });
  $('compare').addEventListener('click', function () {
    stopEverything();
    if (!state.notes.length) { say(T('先在鍵盤上選音，再比較三種音律。', 'Pick some notes on the keyboard first, then compare the tunings.')); return; }
    const on = soundCheck();
    state.beatSrc = 'sel';
    const kinds = TC.BASIC.slice();
    if (state.kind === 'regular') kinds.push('regular');
    const t0 = AU.now() + 0.05, seg = CMP_SEG + CMP_GAP;
    if (on) kinds.forEach(function (k, i) { playNotes(k, state.notes, t0 + i * seg, CMP_SEG - 0.35); });
    beginVisual({ mode: 'compare', kinds: kinds, seg: seg, total: kinds.length * seg });
    const results = {};
    kinds.forEach(function (k) { results[k] = analysis(k, state.notes, 'compare'); });
    emit('compare', { kind: state.kind, notes: state.notes.slice(), tonic: state.tonic, w: state.w, count: state.notes.length, results: results });
  });
  function comparePhase(i) {
    const k = state.play.kinds[i];
    const a = TC.analyze(k, state.tonic, state.w, state.notes);
    let s = (i + 1) + '/' + state.play.kinds.length + ' ' + kname(k);
    a.pairs.forEach(function (p) { s += T('：' + nn(p.lo) + '–' + nn(p.hi) + ' 拍頻 ' + fx(p.beat, 2) + ' Hz', ': ' + nn(p.lo) + '–' + nn(p.hi) + ' beats ' + fx(p.beat, 2) + ' Hz'); });
    if (AU.enabled()) say(s);
  }

  // 疊疊樂
  function stackTone(n, dur, gain) {
    if (!AU.enabled()) return;
    const s = TC.stackPair(n, fifth());
    AU.tone({ f0: s.fx, partials: TC.partials(), dur: dur, gain: gain, attack: 0.03, release: 0.25 });
  }
  function stackOne(fromAuto) {
    if (state.stack >= TC.STACK_MAX) return false;
    state.stack++;
    state.anim = { t0: performance.now() };
    if (state.beatSrc === 'stack') state.beatSrc = 'sel';
    renderStack(); updateCanvasLabels(); rebuild3D(); requestDraw();
    stackTone(state.stack, fromAuto ? 0.32 : 0.6, fromAuto ? 0.24 : 0.32);
    const f = fifth(), p = TC.stackPoint(state.stack, f);
    emit('stack', { n: state.stack, fifth: f, kind: state.kind, w: state.w, offC: p.offC });
    if (!fromAuto || state.stack % 12 === 0 || state.stack >= TC.STACK_MAX) {
      let s = T('第 ' + state.stack + ' 個五度：' + landName(state.stack, p) + '，離 C ' + sg(p.offC, 2) + ' 音分。', 'Fifth ' + state.stack + ': ' + landName(state.stack, p) + ', ' + sg(p.offC, 2) + ' cents from C.');
      if (state.stack === 12) {
        s += Math.abs(p.offC) < 0.005 ? T('剛好回到 C！', ' Exactly back on C!')
          : Math.abs(p.offC - TC.PYTH_COMMA) < 0.01 ? T('多出來的就是畢氏音差。', ' The overshoot is the Pythagorean comma.') : '';
      }
      say(s);
    }
    return true;
  }
  $('stackOne').addEventListener('click', function () { stopAuto(); stackOne(false); });
  function updateAutoLabel() {
    const b = $('stackAuto');
    b.textContent = state.auto ? T('暫停', 'Pause') : T('連續疊', 'Keep stacking');
    b.setAttribute('aria-pressed', String(!!state.auto));
  }
  function stopAuto() {
    if (!state.auto) return;
    clearTimeout(state.auto.timer);
    state.auto = null;
    updateAutoLabel(); updateStop();
  }
  $('stackAuto').addEventListener('click', function () {
    if (state.auto) { stopAuto(); return; }
    if (state.stack >= TC.STACK_MAX) { say(T('已經疊到 60 個了，按「全部清除」重新開始。', 'Already 60 fifths: press “Clear all” to start again.')); return; }
    if (!AU.enabled()) soundCheck();
    const goal = Math.min(TC.STACK_MAX, (Math.floor(state.stack / 12) + 1) * 12);
    const step = function () {
      if (!state.auto) return;
      if (!stackOne(true) || state.stack >= goal) { stopAuto(); return; }
      state.auto.timer = setTimeout(step, (D.reducedMotion() ? 0.7 : AUTO_STEP) * 1000);
    };
    state.auto = { goal: goal, timer: 0 };
    updateAutoLabel(); updateStop();
    step();
  });
  $('stackListen').addEventListener('click', function () {
    stopEverything();
    const on = soundCheck();
    const n = state.stack, f = fifth(), s = TC.stackPair(n, f);
    if (on) {
      const at = AU.now() + 0.03;
      AU.tone({ f0: s.fc, partials: TC.partials(), dur: STACK_LISTEN, gain: 0.3, attack: 0.05, release: 0.5, at: at });
      AU.tone({ f0: s.fx, partials: TC.partials(), dur: STACK_LISTEN, gain: 0.3, attack: 0.05, release: 0.5, at: at });
    }
    state.beatSrc = 'stack';
    beginVisual({ mode: 'stack', kinds: [state.kind], seg: STACK_LISTEN + 0.5, total: STACK_LISTEN + 0.5 });
    emit('stackListen', { n: n, fifth: f, kind: state.kind, w: state.w, pure: state.kind === 'pythagorean' || state.kind === 'just', offC: s.point.offC, beat: s.beat });
    say(T('第 ' + n + ' 個五度（' + fx(s.fx, 2) + ' Hz）和 C（' + fx(s.fc, 2) + ' Hz）一起：', 'Fifth ' + n + ' (' + fx(s.fx, 2) + ' Hz) with C (' + fx(s.fc, 2) + ' Hz): ') +
      (s.beat < 0.005 ? T('完全不拍。', 'no beats at all.') : T('拍頻 ' + fx(s.beat, 2) + ' Hz（' + s.m + ' × 低音 ≈ ' + s.n + ' × 高音）。', 'beats ' + fx(s.beat, 2) + ' Hz (' + s.m + ' × lower ≈ ' + s.n + ' × upper).')));
  });
  $('clear').addEventListener('click', function () {
    stopAuto();
    if (state.play && state.play.mode === 'stack') stopEverything();
    state.stack = 0; state.anim = null;
    if (state.beatSrc === 'stack') state.beatSrc = 'sel';
    renderStack(); updateCanvasLabels(); rebuild3D(); requestDraw();
    say(T('疊起來的五度都清掉了，從 C 重新開始。', 'All stacked fifths cleared: start again from C.'));
  });

  // 停止
  function busy() { return !!(state.play || state.auto || Object.keys(state.held).length); }
  function updateStop() { $('stop').disabled = !(AU.playing() || busy()); }
  function stopEverything() {
    stopAuto();
    Object.keys(state.held).forEach(function (id) { const r = state.held[id]; if (r.h) r.h.stop(0.1); r.key.classList.remove('on'); });
    state.held = {};
    state.play = null;
    AU.stopAll(0.08);
    updateStop(); requestDraw();
  }
  $('stop').addEventListener('click', function () { stopEverything(); say(T('已停止。', 'Stopped.')); });
  AU.onChange(updateStop);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && busy()) stopEverything(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopEverything(); });

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
    if (ev.detail && ev.detail.name === 'sound') { updateSoundButton(); updateStop(); }
  });

  // =====================================================================
  // 主畫布：鐘面＋疊疊樂、C 附近放大、偏差長條圖
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cvB = $('cvBeat'), ctxB = cvB.getContext('2d');
  let W = 600, H = 420, L = null, WB = 600, HB = 150;
  function layout() {
    const lab = 18 * fs + 10;                      // 外圈音名需要的空間
    if (W >= 620) {
      H = Math.round(Math.max(410, Math.min(520, W * 0.56)));
      const lw = Math.round(W * 0.5), stripH = Math.round(30 + 42 * fs);
      const R = Math.max(80, Math.min(lw / 2 - lab - 6, (H - stripH - 12) / 2 - lab));
      L = { wide: true, cx: lw / 2, cy: 6 + lab + R, R: R, strip: { x: 14, y: H - stripH, w: lw - 28, h: stripH - 8 }, chart: { x: lw + 6, y: 10, w: W - lw - 16, h: H - 20 } };
    } else {
      const R = Math.max(70, Math.min(W / 2 - lab - 6, 170));
      const clockH = 2 * (R + lab) + 12, stripH = Math.round(30 + 42 * fs), chartH = Math.round(250 + 60 * (fs - 1));
      H = clockH + stripH + chartH;
      L = { wide: false, cx: W / 2, cy: 6 + lab + R, R: R, strip: { x: 10, y: clockH, w: W - 20, h: stripH - 8 }, chart: { x: 6, y: clockH + stripH, w: W - 12, h: chartH - 8 } };
    }
  }
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth || cv.parentElement.clientWidth || 600;
    layout();
    cv.style.height = H + 'px';
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    resizeBeat();
    requestDraw();
  }
  function resizeBeat() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const lanes = Math.max(1, beatPairs().length);
    WB = cvB.clientWidth || W;
    const want = Math.round(28 * fs + 14 + lanes * (58 + 12 * fs));
    if (want !== HB || cvB.width !== Math.round(WB * dpr)) {
      HB = want;
      cvB.style.height = HB + 'px';
      cvB.width = Math.round(WB * dpr); cvB.height = Math.round(HB * dpr);
      ctxB.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  // 角度：0 音分在正上方，順時針一圈 = 1200 音分
  function pt(c, r) { const a = c / 1200 * TAU - Math.PI / 2; return { x: L.cx + r * Math.cos(a), y: L.cy + r * Math.sin(a) }; }
  function arcC(c0, c1, r) {
    const a0 = c0 / 1200 * TAU - Math.PI / 2, a1 = c1 / 1200 * TAU - Math.PI / 2;
    ctx.beginPath(); ctx.arc(L.cx, L.cy, r, Math.min(a0, a1), Math.max(a0, a1));
  }
  const lapR = function (lap) { return L.R * (0.78 - 0.11 * lap); };
  function stackPts() {
    const f = fifth(), out = [];
    for (let k = 0; k <= state.stack; k++) {
      const p = TC.stackPoint(k, f), lap = k === 0 ? 0 : Math.ceil(k / 12) - 1;
      const q = pt(p.r, lapR(lap));
      out.push({ k: k, p: p, lap: lap, x: q.x, y: q.y });
    }
    return out;
  }
  /** 現在畫面強調哪一種音律（比較時跟著播放的那一種） */
  function emphKind() {
    if (state.play && state.play.mode === 'compare' && state.play.idx >= 0) return state.play.kinds[state.play.idx];
    return state.kind;
  }
  function easeOut(u) { return 1 - Math.pow(1 - u, 3); }

  function drawClock(now) {
    const cx = L.cx, cy = L.cy, R = L.R;
    const kind = emphKind();
    // 錶盤：柔和陰影＋左上的亮面
    ctx.save();
    ctx.shadowColor = D.shadowInk(D.dark ? 0.5 : 0.16); ctx.shadowBlur = 16; ctx.shadowOffsetY = 4;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU);
    ctx.fillStyle = mix(C.surface, C['canvas-bg'], 0.35); ctx.fill();
    ctx.restore();
    const gl = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
    gl.addColorStop(0, alpha('#ffffff', D.dark ? 0.07 : 0.55)); gl.addColorStop(0.7, alpha('#ffffff', 0)); gl.addColorStop(1, D.shadowInk(D.dark ? 0.18 : 0.05));
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fillStyle = gl; ctx.fill();
    ctx.strokeStyle = alpha(C.text, D.dark ? 0.28 : 0.22); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R - 24, 0, TAU); ctx.strokeStyle = alpha(C.text, 0.06); ctx.lineWidth = 1; ctx.stroke();
    // 細刻度（每 20 音分）與 12 個平均律刻度
    ctx.beginPath();
    for (let c = 0; c < 1200; c += 20) { if (c % 100 === 0) continue; const a = pt(c, R - 4), b = pt(c, R); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    ctx.strokeStyle = alpha(C.muted, 0.4); ctx.lineWidth = 1; ctx.stroke();
    const selPcs = state.notes.map(function (m) { return mod(m, 12); });
    for (let pc = 0; pc < 12; pc++) {
      const a = pt(pc * 100, R - 11), b = pt(pc * 100, R);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = pc === 0 ? C['tm-equal'] : alpha(C.text, 0.55); ctx.lineWidth = pc === 0 ? 3 : 2; ctx.lineCap = 'round'; ctx.stroke();
      const q = pt(pc * 100, R + 9 * fs + 6), sel = selPcs.indexOf(pc) >= 0;
      D.haloText(ctx, pcName(pc), q.x, q.y, sel ? C.accent : pc === state.tonic ? C['tm-equal'] : C.text, 'center', 'middle', fnt(sel || pc === state.tonic ? 13.5 : 12.5, sel || pc === state.tonic ? 700 : 600));
    }
    ctx.lineCap = 'butt';
    // 目前音律的 12 個音（小點，位置是真正的音分；和刻度差多少就是和平均律差多少）
    const devs = TC.deviations(kind, state.tonic, state.w);
    for (let pc = 0; pc < 12; pc++) { const q = pt(pc * 100 + devs[pc], R - 17); D.ball(ctx, q.x, q.y, 3.2, KC(kind), { shadow: false }); }
    // 疊疊樂
    drawStack(now);
    // 選的音（大球）
    state.notes.forEach(function (m) {
      const pc = mod(m, 12), q = pt(pc * 100 + devs[pc], R - 17);
      const on = isSounding(m);
      D.ball(ctx, q.x, q.y, on ? 8 : 6.5, C.accent, { glow: on ? 0.6 : (D.dark ? 0.35 : 0.15) });
    });
    // 中央：疊了幾個五度
    if (state.stack === 0) {
      D.haloText(ctx, T('從 C 出發', 'Start at C'), cx, cy, C.muted, 'center', 'middle', fnt(13, 600));
    } else {
      D.haloText(ctx, String(state.stack), cx, cy - 6 * fs, C['tm-stack'], 'center', 'middle', fnt(26, 700));
      D.haloText(ctx, T('個五度', state.stack === 1 ? 'fifth' : 'fifths'), cx, cy + 15 * fs, C.muted, 'center', 'middle', fnt(12, 600));
    }
  }
  function drawStack(now) {
    const pts = stackPts(), n = state.stack, R = L.R;
    let u = 1;
    if (state.anim && !D.reducedMotion()) u = easeOut(Math.min(1, (now - state.anim.t0) / (STACK_ANIM * 1000)));
    const curLap = n ? pts[n].lap : 0;
    // 起點 C 的五度圈半徑（淡淡的參考圓）
    for (let lap = 0; lap <= curLap; lap++) {
      ctx.beginPath(); ctx.arc(L.cx, L.cy, lapR(lap), 0, TAU);
      ctx.strokeStyle = alpha(C['tm-stack'], lap === curLap ? 0.12 : 0.06); ctx.setLineDash([2, 4]); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    }
    // 弦：每一步五度
    for (let k = 1; k <= n; k++) {
      const a = pts[k - 1], b = pts[k], last = k === n;
      const e = last ? { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u } : b;
      const cur = b.lap === curLap;
      ctx.save();
      if (cur && last) { ctx.shadowColor = alpha(C['tm-stack'], 0.6); ctx.shadowBlur = 8; }
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(e.x, e.y);
      ctx.strokeStyle = alpha(C['tm-stack'], cur ? (last ? 0.95 : 0.7) : 0.22);
      ctx.lineWidth = cur ? (last ? 2.6 : 1.8) : 1.2; ctx.lineCap = 'round'; ctx.stroke();
      ctx.restore();
    }
    // 缺口：第 12 個五度（與最新一個若落在 C 附近）和 C 之間的弧
    const gaps = [];
    if (n >= 12) gaps.push(pts[12]);
    if (n > 0 && n !== 12 && Math.abs(pts[n].p.offC) < 60 && u >= 1) gaps.push(pts[n]);
    gaps.forEach(function (g) {
      const off = g.p.offC, rr = lapR(g.lap);
      if (Math.abs(off) < 0.005) {
        const q = pt(0, rr);
        ctx.beginPath(); ctx.arc(q.x, q.y, 9, 0, TAU);
        ctx.strokeStyle = C['tm-equal']; ctx.lineWidth = 2.5; ctx.stroke();
        return;
      }
      ctx.save();
      ctx.shadowColor = alpha(C['tm-gap'], 0.8); ctx.shadowBlur = 10;
      arcC(0, off, rr); ctx.strokeStyle = C['tm-gap']; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke();
      ctx.restore();
    });
    // 點
    for (let k = 0; k <= n; k++) {
      const q = pts[k], last = k === n;
      if (last && k > 0 && u < 1) continue;
      if (k === 0) D.ball(ctx, q.x, q.y, 5.2, C['tm-equal'], { glow: D.dark ? 0.3 : 0.1 });
      else D.ball(ctx, q.x, q.y, last ? 5.8 : (q.lap === curLap ? 3.6 : 2.6), C['tm-stack'], { glow: last ? 0.5 : 0, shadow: last });
    }
    if (n > 0 && u >= 1) {
      const q = pts[n], off = q.p.offC;
      const dir = pt(q.p.r, q.lap >= 1 ? lapR(q.lap) + 12 * fs : lapR(q.lap) - 24 * fs);
      const near = Math.abs(off) < 60;
      const txt = landName(n, q.p) + (!near ? '' : Math.abs(off) < 0.005 ? T('・閉合', ' · closed') : n > 12 ? T(' 音分', ' ¢') : '  ' + sg(off, 2) + T(' 音分', ' ¢'));
      D.pill(ctx, txt, dir.x, dir.y + 8 * fs, near ? (Math.abs(off) < 0.005 ? C['tm-equal'] : C['tm-gap']) : C['tm-stack'], 'center', fnt(11.5, 700));
    }
  }
  // C 附近放大：±50 音分的尺
  function drawStrip() {
    const r = L.strip, span = 50;
    const x0 = r.x + 22, x1 = r.x + r.w - 22, yA = r.y + r.h - 14 * fs;
    const X = function (c) { return x0 + (c + span) / (2 * span) * (x1 - x0); };
    D.roundRect(ctx, r.x, r.y, r.w, r.h, 9);
    ctx.fillStyle = alpha(C.surface, D.dark ? 0.35 : 0.65); ctx.fill();
    ctx.strokeStyle = alpha(C.text, 0.08); ctx.lineWidth = 1; ctx.stroke();
    ctx.font = fnt(11, 600); ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(T('C 附近放大（音分）', 'Close-up around C (cents)'), r.x + 8, r.y + 4);
    ctx.beginPath(); ctx.moveTo(x0, yA); ctx.lineTo(x1, yA); ctx.strokeStyle = alpha(C.text, 0.35); ctx.lineWidth = 1; ctx.stroke();
    [-50, -25, 25, 50].forEach(function (c) {
      ctx.beginPath(); ctx.moveTo(X(c), yA - 3); ctx.lineTo(X(c), yA + 3); ctx.stroke();
      ctx.font = fnt(10); ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(sg(c, 0), X(c), yA + 4);
    });
    ctx.beginPath(); ctx.moveTo(X(0), yA - 14); ctx.lineTo(X(0), yA + 3); ctx.strokeStyle = C['tm-equal']; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.font = fnt(10.5, 700); ctx.fillStyle = C['tm-equal']; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('C', X(0), yA + 4);
    // 落在 ±50 音分以內的五度
    const f = fifth(), list = [];
    for (let k = 1; k <= state.stack; k++) { const p = TC.stackPoint(k, f); if (Math.abs(p.offC) <= span) list.push({ k: k, off: p.offC }); }
    list.sort(function (a, b) { return (a.k === state.stack) - (b.k === state.stack); });
    const used = [];
    list.forEach(function (q) {
      const x = X(q.off), last = q.k === state.stack;
      D.ball(ctx, x, yA - 7, last ? 5.5 : 4, C['tm-stack'], { glow: last ? 0.5 : 0 });
      if (used.every(function (u) { return Math.abs(u - x) > 16 * fs; }) || last) {
        used.push(x);
        D.haloText(ctx, String(q.k), x, yA - 15, last ? C['tm-stack'] : C.muted, 'center', 'alphabetic', fnt(10.5, 700));
      }
    });
    if (!list.length && state.stack) {
      ctx.font = fnt(10.5); ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(T('還沒有五度落在這裡', 'No fifth has landed here yet'), r.x + r.w - 8, r.y + 4);
    }
  }
  // 偏差長條圖
  function drawChart() {
    const r = L.chart, kind = emphKind();
    const kinds = ['pythagorean', 'just'].concat(state.kind === 'regular' || kind === 'regular' ? ['regular'] : []);
    const devs = {};
    let maxAbs = 0;
    kinds.forEach(function (k) { devs[k] = TC.deviations(k, state.tonic, state.w); devs[k].forEach(function (v) { maxAbs = Math.max(maxAbs, Math.abs(v)); }); });
    const range = Math.max(25, Math.ceil((maxAbs + 1) / 5) * 5);
    D.roundRect(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fillStyle = alpha(C.surface, D.dark ? 0.32 : 0.6); ctx.fill();
    ctx.strokeStyle = alpha(C.text, 0.08); ctx.lineWidth = 1; ctx.stroke();
    ctx.font = fnt(12, 700); ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(T('相對十二平均律的偏差（音分）', 'Offset from equal temperament (cents)'), r.x + 10, r.y + 8);
    const px0 = r.x + 30 * fs + 6, px1 = r.x + r.w - 8, py0 = r.y + 30 * fs + 8;
    const stagger = (px1 - px0) / 12 < 20 * fs + 5;
    const py1 = r.y + r.h - (stagger ? 38 : 24) * fs - 6;
    const yz = (py0 + py1) / 2, sc = (py1 - py0) / 2 / range;
    // 格線
    const top10 = Math.floor(range / 10) * 10;
    for (let v = -top10; v <= top10; v += 10) {
      const y = yz - v * sc;
      ctx.beginPath(); ctx.moveTo(px0, y); ctx.lineTo(px1, y);
      ctx.strokeStyle = alpha(C.text, v === 0 ? 0 : 0.07); ctx.lineWidth = 1; ctx.stroke();
      if (v % 20 === 0 || range <= 30) { ctx.font = fnt(10); ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(sg(v, 0), px0 - 5, y); }
    }
    const gw = (px1 - px0) / 12, selPcs = state.notes.map(function (m) { return mod(m, 12); });
    for (let pc = 0; pc < 12; pc++) {
      const gx = px0 + gw * pc;
      if (selPcs.indexOf(pc) >= 0) { D.roundRect(ctx, gx + 1, py0 - 4, gw - 2, py1 - py0 + 8, 5); ctx.fillStyle = alpha(C.accent, D.dark ? 0.16 : 0.1); ctx.fill(); }
      const nb = kinds.length, bw = Math.min(11, gw * 0.8 / nb), bx0 = gx + (gw - nb * bw) / 2;
      kinds.forEach(function (k, i) {
        const v = devs[k][pc], y = yz - v * sc, x = bx0 + i * bw, col = KC(k), em = k === kind;
        if (Math.abs(v) < 0.02) { ctx.beginPath(); ctx.arc(x + bw / 2, yz, 1.6, 0, TAU); ctx.fillStyle = alpha(col, em ? 0.9 : 0.4); ctx.fill(); return; }
        const g = ctx.createLinearGradient(x, 0, x + bw, 0);
        g.addColorStop(0, shade(col, 0.28)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, -0.25));
        ctx.globalAlpha = em ? 1 : 0.38;
        D.roundRect(ctx, x + 0.5, Math.min(y, yz), bw - 1, Math.abs(y - yz), Math.min(3, bw / 3));
        ctx.fillStyle = g; ctx.fill();
        ctx.globalAlpha = 1;
      });
      const lbl = pcName(pc), isT = pc === state.tonic, sel = selPcs.indexOf(pc) >= 0;
      const ly = py1 + 6 + (stagger && pc % 2 ? 15 * fs : 0);
      ctx.font = fnt(11, isT || sel ? 700 : 500); ctx.fillStyle = sel ? C.accent : isT ? C['tm-equal'] : C.muted;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(lbl, gx + gw / 2, ly);
      if (stagger && pc % 2) { ctx.beginPath(); ctx.moveTo(gx + gw / 2, py1 + 3); ctx.lineTo(gx + gw / 2, ly - 1); ctx.strokeStyle = alpha(C.muted, 0.35); ctx.lineWidth = 1; ctx.stroke(); }
      if (isT) { ctx.beginPath(); ctx.arc(gx + gw / 2 + ctx.measureText(lbl).width / 2 + 4, ly + 6 * fs, 2.2, 0, TAU); ctx.fillStyle = C['tm-equal']; ctx.fill(); }
    }
    // 0 線 = 十二平均律
    ctx.save();
    if (kind === 'equal') { ctx.shadowColor = alpha(C['tm-equal'], 0.7); ctx.shadowBlur = 8; }
    ctx.beginPath(); ctx.moveTo(px0, yz); ctx.lineTo(px1, yz);
    ctx.strokeStyle = C['tm-equal']; ctx.lineWidth = kind === 'equal' ? 3 : 1.8; ctx.stroke();
    ctx.restore();
    // 選的音：目前音律的數值
    if (kind !== 'equal') {
      const dv = TC.deviations(kind, state.tonic, state.w), ki = kinds.indexOf(kind);
      selPcs.filter(function (pc, i, a) { return a.indexOf(pc) === i; }).forEach(function (pc) {
        const v = dv[pc]; if (Math.abs(v) < 0.05 || ki < 0) return;
        const gx = px0 + gw * pc, x = gx + gw / 2, y = yz - v * sc;
        D.pill(ctx, sg(v, 1), Math.max(px0 + 18, Math.min(px1 - 18, x)), v > 0 ? y - 3 : y + 3 + 16 * fs, KC(kind), 'center', fnt(10.5, 700));
      });
    }
  }
  function draw(now) {
    D.backdrop(ctx, W, H);
    drawClock(now);
    drawStrip();
    drawChart();
  }

  // ---------- 拍頻畫布 ----------
  /** 拍頻圖的每一條：選的音的每一對，或疊疊樂的那個音和 C */
  function beatPairs() {
    if (state.beatSrc === 'stack') {
      const s = TC.stackPair(state.stack, fifth()), lo = Math.min(s.fx, s.fc), hi = Math.max(s.fx, s.fc);
      return [{ label: T('第 ' + state.stack + ' 個五度 ＋ C', 'Fifth ' + state.stack + ' + C'), f1: lo, f2: hi, beat: s.beat, m: s.m, n: s.n, kind: state.kind }];
    }
    const k = emphKind();
    return TC.analyze(k, state.tonic, state.w, state.notes).pairs.map(function (p) {
      return { label: nn(p.lo) + '–' + nn(p.hi) + ' ' + T(p.pure.zh, p.pure.en), f1: p.f1, f2: p.f2, beat: p.beat, m: p.m, n: p.n, kind: k };
    });
  }
  function isSounding(m) {
    if (Object.keys(state.held).some(function (id) { return state.held[id].m === m; })) return true;
    return !!(state.play && state.play.mode !== 'stack' && state.notes.indexOf(m) >= 0);
  }
  function drawBeat(now) {
    const pairs = beatPairs();
    const wantH = Math.round(28 * fs + 14 + Math.max(1, pairs.length) * (58 + 12 * fs));
    if (wantH !== HB || Math.abs((cvB.clientWidth || WB) - WB) > 1) resizeBeat();
    const c = ctxB, w = WB, h = HB;
    c.save();
    c.fillStyle = C['canvas-bg']; c.fillRect(0, 0, w, h);
    c.font = fnt(11.5, 700); c.fillStyle = C.text; c.textAlign = 'left'; c.textBaseline = 'top';
    const live = !!(state.play || Object.keys(state.held).length);
    c.fillText(T('拍頻（響度的起伏，1 秒）', 'Beats (the swelling of loudness, 1 second)'), 10, 7);
    if (live && state.play) { c.textAlign = 'right'; c.fillStyle = KC(emphKind()); c.fillText('♪ ' + kname(emphKind()), w - 10, 7); }
    if (!pairs.length) {
      c.font = fnt(12.5); c.fillStyle = C.muted; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(T('選兩個以上的音，就會看到它們之間的拍。', 'Select two or more notes to see the beats between them.'), w / 2, 28 * fs + (h - 28 * fs) / 2);
      c.restore(); return;
    }
    const laneH = (h - 28 * fs - 14) / pairs.length;
    const shift = live && !D.reducedMotion() && state.play ? (now - state.play.t0) / 1000 : live && !D.reducedMotion() ? now / 1000 : 0;
    pairs.forEach(function (p, i) {
      const y0 = 28 * fs + i * laneH, yc = y0 + 17 * fs + (laneH - 17 * fs) / 2, amp = (laneH - 17 * fs) / 2 - 5;
      const col = KC(p.kind);
      c.font = fnt(11.5, 600); c.fillStyle = C.text; c.textAlign = 'left'; c.textBaseline = 'top';
      c.fillText(p.label, 10, y0 + 2);
      c.textAlign = 'right';
      c.fillStyle = p.beat < 0.005 ? C['tm-equal'] : p.beat > 25 ? C['tm-wide'] : col;
      c.fillText(p.beat < 0.005 ? T('不拍（0 Hz）', 'no beats (0 Hz)') : fx(p.beat, 2) + ' Hz' + (p.beat > 25 ? T('・粗糙', ' · rough') : ''), w - 10, y0 + 2);
      const x0 = 10, x1 = w - 10, N = Math.max(60, Math.round(x1 - x0));
      const a1 = TC.PARTIALS[p.m - 1], a2 = TC.PARTIALS[p.n - 1], norm = a1 + a2;
      // 包絡帶（上下對稱）
      c.beginPath();
      for (let j = 0; j <= N; j++) { const t = j / N, x = x0 + t * (x1 - x0), A = TC.envelope(a1, a2, p.beat, t + shift) / norm; if (j) c.lineTo(x, yc - A * amp); else c.moveTo(x, yc - A * amp); }
      for (let j = N; j >= 0; j--) { const t = j / N, x = x0 + t * (x1 - x0), A = TC.envelope(a1, a2, p.beat, t + shift) / norm; c.lineTo(x, yc + A * amp); }
      c.closePath();
      const g = c.createLinearGradient(0, yc - amp, 0, yc + amp);
      g.addColorStop(0, alpha(col, 0.32)); g.addColorStop(0.5, alpha(col, 0.1)); g.addColorStop(1, alpha(col, 0.32));
      c.fillStyle = g; c.fill();
      // 示意載波（真正的頻率太高，畫不出來）
      c.beginPath();
      const cyc = Math.max(20, Math.round((x1 - x0) / 5));
      for (let j = 0; j <= N * 2; j++) {
        const t = j / (N * 2), x = x0 + t * (x1 - x0), A = TC.envelope(a1, a2, p.beat, t + shift) / norm;
        const yv = yc - A * amp * Math.sin(TAU * cyc * t);
        if (j) c.lineTo(x, yv); else c.moveTo(x, yv);
      }
      c.strokeStyle = alpha(col, 0.55); c.lineWidth = 0.8; c.stroke();
      // 包絡線
      c.beginPath();
      for (let j = 0; j <= N; j++) { const t = j / N, x = x0 + t * (x1 - x0), A = TC.envelope(a1, a2, p.beat, t + shift) / norm; if (j) c.lineTo(x, yc - A * amp); else c.moveTo(x, yc - A * amp); }
      c.strokeStyle = col; c.lineWidth = 2; c.stroke();
      c.beginPath(); c.moveTo(x0, yc); c.lineTo(x1, yc); c.strokeStyle = alpha(C.text, 0.12); c.lineWidth = 1; c.stroke();
    });
    c.font = fnt(10); c.fillStyle = C.muted; c.textBaseline = 'bottom';
    c.textAlign = 'left'; c.fillText('0 s', 10, h - 1);
    c.textAlign = 'right'; c.fillText('1 s', w - 10, h - 1);
    c.restore();
  }

  function updateCanvasLabels() {
    const n = state.stack, p = TC.stackPoint(n, fifth());
    cv.setAttribute('aria-label', T('鐘面：' + kname(state.kind) + '，主音 ' + TC.TONIC_NAMES[state.tonic] + '。疊了 ' + n + ' 個五度' + (n ? '，最後一個離 C ' + sg(p.offC, 2) + ' 音分' : '') + '。右邊（手機在下面）是三種音律相對十二平均律的偏差長條圖。',
      'Clock face: ' + kname(state.kind) + ', tonic ' + TC.TONIC_NAMES[state.tonic] + '. ' + n + ' fifths stacked' + (n ? ', the last one ' + sg(p.offC, 2) + ' cents from C' : '') + '. Beside it (below on phones): bar chart of each tuning’s offset from equal temperament.'));
    const pairs = beatPairs();
    cvB.setAttribute('aria-label', pairs.length ? T('拍頻圖：', 'Beat chart: ') + pairs.map(function (q) { return q.label + ' ' + fx(q.beat, 2) + ' Hz'; }).join(T('；', '; '))
      : T('拍頻圖：選兩個以上的音才看得到。', 'Beat chart: select two or more notes.'));
  }

  // ---------- 動畫迴圈 ----------
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    const now = performance.now();
    let more = false;
    if (state.anim) { if (now - state.anim.t0 >= STACK_ANIM * 1000 || D.reducedMotion()) state.anim = null; else more = true; }
    if (state.play) {
      const el = (now - state.play.t0) / 1000;
      if (el >= state.play.total) { state.play = null; updateStop(); updateCanvasLabels(); }
      else {
        more = true;
        const idx = Math.min(state.play.kinds.length - 1, Math.floor(el / state.play.seg));
        if (idx !== state.play.idx) { state.play.idx = idx; if (state.play.mode === 'compare') { comparePhase(idx); updateCanvasLabels(); } }
      }
    }
    if (Object.keys(state.held).length && !D.reducedMotion()) more = true;
    if (!view3 || !view3.active) draw(now);
    drawBeat(now);
    if (view3 && view3.active) view3.frame();
    if (more) requestDraw();
  }

  // =====================================================================
  // 3D：切換到 3D 時才載入 js/temperament-3d.js 與 three.js
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    TC: TC, T: T, D: D,
    colors: function () { return C; },
    fs: function () { return fs; },
    data: function () { return { kind: state.kind, tonic: state.tonic, w: state.w, n: state.stack, fifth: fifth(), notes: state.notes.slice() }; },
    pcName: pcName, landName: landName, kname: kname, fx: fx, sg: sg,
    onRotate: function () {},
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
      if (window.Temperament3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Temperament3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/temperament-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Temperament3D) throw new Error('temperament-3d.js did not load');
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
        view3 = window.Temperament3D.create(lib, host3, bridge);
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

  // ---------- 分享目前設定：選的音與疊了幾個五度（音律、主音、滑桿由 classroom.js 記錄） ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { n: state.order.slice(), s: state.stack }; },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o.n)) setSelection(o.n.map(Number).filter(isFinite), 'share');
      if (o.s != null && isFinite(o.s)) { state.stack = Math.max(0, Math.min(TC.STACK_MAX, Math.round(o.s))); renderStack(); updateCanvasLabels(); rebuild3D(); requestDraw(); }
    }
  });

  // 給測試用的介面（不影響畫面）
  window.__tm = {
    state: state,
    analysis: analysis,
    select: function (list) { setSelection(list, 'test'); },
    stackTo: function (n) { state.stack = Math.max(0, Math.min(TC.STACK_MAX, n)); renderStack(); updateCanvasLabels(); rebuild3D(); requestDraw(); },
    view3: function () { return view3; }
  };

  // =====================================================================
  // 啟動（不發聲、不送任務事件）
  // =====================================================================
  readColors();
  state.tonic = mod(parseInt($('tonic').value, 10) || 0, 12);
  state.w = Math.max(0, Math.min(TC.W_MAX, val(elW)));
  kindBtns.forEach(function (b) { if (b.getAttribute('aria-pressed') === 'true') state.kind = b.dataset.kind; });
  $('piano').setAttribute('data-share-skip', '');
  $('emap').setAttribute('data-share-skip', '');
  document.querySelector('.view-bar').setAttribute('data-share-skip', '');
  updateSoundButton();
  updateAutoLabel();
  refreshAll();
  updateStop();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    refreshAll();
    if (view3 && view3.active) view3.onTheme();
    resize();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW || Math.abs((cvB.clientWidth || 0) - WB) > 1) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  resize();
})();
