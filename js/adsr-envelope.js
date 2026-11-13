/* adsr-envelope.js — 「合成器的 ADSR 包絡」的畫面、聲音與互動
 *
 * 數學在 adsr-envelope-core.js（AdsrCore）；聲音一律交給 music-audio.js（MusicAudio）；繪圖工具 LabDraw（drawkit.js）。
 * 兩張畫布：
 *   #cv    包絡圖：起音、衰減、延持、釋音四段不同顏色（振幅刻度或分貝刻度），可拖曳的四個節點、時間游標；
 *          振幅刻度下，包絡裡面畫一條放慢的振盪示意；提早放開時，「如果一直按著」的部分畫成虛線；倒放時畫左右反過來的曲線。
 *   #scope 示波器：游標那一刻附近四個週期的真實波形（振幅受包絡控制）。
 * 琴鍵（C4–C5）：按住才響、放開進入釋音；滑鼠、觸控、電腦鍵盤 A–K 都可以。手指移開、切到背景、視窗失去焦點、Esc 都會停。
 * 「▶ 播放」：用最後按的琴鍵的音高，按住「按住時間」秒後自動放開；倒放時把這整個音左右反過來播。
 * 3D（js/adsr-envelope-3d.js，第一次切到 3D 才載入）：時間 × 泛音次數 × 振幅的地形。
 * 學生按了才發聲；音效關閉時畫面照跑，狀態列顯示提示。
 */
(function () {
  'use strict';
  const AC = window.AdsrCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha;
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const TAU = 2 * Math.PI;
  const GAIN = 0.55;          // 包絡頂點時送進聲音引擎的音量（MusicAudio 另有主音量與限幅）
  const DB_MIN = -60;         // 分貝刻度的底
  const VIS_CYCLES = 36;      // 包絡圖裡的振盪示意：整張圖畫幾個週期（放慢的示意）
  const nowS = function () { return performance.now() / 1000; };
  const reducedMotion = function () { return D.reducedMotion(); };

  // ---------- 狀態 ----------
  const P0 = AC.DEFAULT;
  const state = {
    A: P0.A, D: P0.D, S: P0.S, R: P0.R, shape: P0.shape, H: P0.H, N: P0.N, high: P0.high, scale: P0.scale, rev: P0.rev,
    key: P0.key,           // 「▶ 播放」用的音（最後按的琴鍵）
    preset: null, edited: false, touched: false,
    inspect: null,         // 沒有在播放時，示波器看的時刻（點包絡圖設定）
    hover: -1
  };
  function params() { return { A: state.A, D: state.D, S: state.S, R: state.R, shape: state.shape }; }
  let notes = [];          // 正在響（或正在畫）的音
  let cur = null;          // 畫面跟著的那一個音（最新的）
  let applying = false;    // 程式正在改滑桿（不要當成使用者的操作）
  let noteSeq = 0;

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'accent-soft', 'surface', 'probe',
      'ad-a', 'ad-d', 'ad-s', 'ad-r', 'ad-wave', 'ad-ghost']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function segColor(ph) { return ph === 'A' ? C['ad-a'] : ph === 'D' ? C['ad-d'] : ph === 'S' ? C['ad-s'] : ph === 'R' ? C['ad-r'] : C['ad-ghost']; }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + px + 'px ' + FONT; }

  // ---------- 數字格式 ----------
  function num(v, dec) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(dec);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  /** 秒：三位有效數字（和滑桿旁顯示的一樣） */
  function sec(v) {
    if (v == null || !isFinite(v)) return '—';
    if (v === 0) return '0';
    return String(Number(v.toPrecision(3)));
  }
  function secText(v) { return v == null ? '—' : !isFinite(v) ? '∞' : (v < 0.1 ? num(v * 1000, v < 0.01 ? 1 : 0) + ' ms' : sec(v) + ' s'); }
  function dbText(a) { const d = AC.db(a); return d === -Infinity ? '−∞ dB' : num(d, 1) + ' dB'; }
  function presetName(id) { const p = AC.PRESETS[id]; return p ? T(p.zh, p.en) : ''; }
  function phaseName(ph) {
    return ph === 'A' ? T('起音 A', 'attack A') : ph === 'D' ? T('衰減 D', 'decay D') : ph === 'S' ? T('延持 S', 'sustain S')
      : ph === 'R' ? T('釋音 R', 'release R') : T('安靜', 'silent');
  }
  function keyOf(i) { return AC.KEYS[Math.max(0, Math.min(AC.KEYS.length - 1, i))]; }

  // =====================================================================
  // 音（note）：正放或倒放，正在響的音每一刻都從核心算包絡
  // =====================================================================
  function noteParams(n) { return n.rev ? n.p : params(); }   // 倒放：開始時固定下來（整段長度不跳動）；正放：跟著滑桿即時改變
  function noteElapsed(n, t) { return (t == null ? nowS() : t) - n.t0; }
  function noteLevel(n, t, forSound) {
    let p = noteParams(n);
    if (forSound) p = AC.soundParams(p, n.rev);
    const e = noteElapsed(n, t);
    return n.rev ? AC.revLevel(e, p, n.H) : AC.level(e, p, n.hold);
  }
  function noteLength(n) { const p = noteParams(n); return n.rev ? n.H + p.R : n.hold + p.R; }
  function notePhase(n, t) {
    const p = noteParams(n), e = noteElapsed(n, t);
    if (!n.rev) return AC.phaseAt(e, p, n.hold);
    // 倒放：時間倒過來看，原本的段落
    const L = n.H + p.R;
    if (e < 0 || e >= L) return 'off';
    return AC.phaseAt(L - e, p, n.H);
  }

  // ---------- 聲音 ----------
  function soundOn() { return !!(window.LabSettings && window.LabSettings.get('sound')); }
  /** 送進聲音引擎的泛音：1/k 的頻譜（總和調成 1，音量由包絡另外控制）；高泛音衰減較快時，第 k 個再乘 e^(q_k − 1) */
  function partialsFor(e) {
    let base = 0;
    for (let k = 1; k <= state.N; k++) base += 1 / k;
    const out = [];
    for (let k = 1; k <= state.N; k++) {
      const q = AC.qOf(k, state.high);
      const w = q === 1 ? 1 : (e > 0 ? Math.pow(e, q - 1) : 0);
      out.push(w / (k * base));
    }
    return out;
  }
  function startVoice(n) {
    if (!soundOn() || !window.MusicAudio || !MusicAudio.available()) return null;
    const e0 = Math.max(0.0001, noteLevel(n, null, true));
    const v = MusicAudio.sustain({ f0: n.f0, partials: partialsFor(e0), normalize: false, gain: 0.0001, attack: 0.015, maxDur: 12,
      onEnd: function () { onVoiceTimeUp(n); } });
    if (v) { v.lastPartials = 0; }
    return v;
  }
  function updateVoice(n, t) {
    const v = n.voice;
    if (!v || !v.playing) return;
    const e = noteLevel(n, t, true);
    v.set({ gain: Math.max(0.0001, GAIN * e) }, 0.012);
    if (state.high && t - v.lastPartials > 0.05) { v.lastPartials = t; v.set({ partials: partialsFor(e) }, 0.03); }
  }
  /** 持續音到了 MusicAudio 的上限（12 秒；只有一個泛音時 4 秒）：這個音結束 */
  function onVoiceTimeUp(n) {
    n.voice = null;
    if (n.done) return;
    endNote(n, false);
    setStatus(T('時間到了：每個音最長響 12 秒（只有一個泛音的純音 4 秒），保護聽力。', 'Time is up: each note lasts at most 12 seconds (4 seconds for a pure tone with one harmonic), to protect hearing.'));
  }

  // ---------- 開始與放開 ----------
  /** 開始一個音。src：'key'（琴鍵）或 'play'（▶ 播放）；id：按住它的指標或按鍵（放開時用） */
  function noteOn(keyIdx, src, id) {
    const k = keyOf(keyIdx);
    // 單音：上一個還按著的音，當成放開
    notes.forEach(function (m) { if (!m.done && m.holding) releaseNote(m); });
    const n = {
      seq: ++noteSeq, keyIdx: keyIdx, key: k.name, f0: k.f, src: src, id: id || null, t0: nowS(),
      rev: state.rev, H: state.H, p: params(), hold: Infinity, holding: src === 'key', done: false,
      auto: src === 'play' ? state.H : null
    };
    if (n.rev) { n.hold = n.H; n.holding = src === 'key'; }
    state.key = keyIdx;
    state.inspect = null;
    n.voice = startVoice(n);
    notes.push(n);
    cur = n;
    if (!n.voice) {
      if (!soundOn()) { setStatus(window.MusicAudio ? MusicAudio.offHint() : ''); if (window.MusicAudio) MusicAudio.flashSoundButton(); }
      else setStatus(T('這個瀏覽器不能播放網頁聲音；畫面照常顯示。', 'This browser cannot play web audio; the pictures work as usual.'));
    } else {
      setStatus(n.rev ? T('倒放中：' + k.name + '，整個音左右反過來。', 'Playing backwards: ' + k.name + ', the whole note flipped back to front.')
        : src === 'play' ? T('播放中：' + k.name + '，按住 ' + sec(n.H) + ' 秒後放開。', 'Playing ' + k.name + ': held for ' + sec(n.H) + ' s, then released.')
          : T('按著 ' + k.name + '：放開就進入釋音。', 'Holding ' + k.name + ': let go to start the release.'));
    }
    refreshKeys();
    updateHF();
    updateButtons();
    startLoop();
    if (view3 && view3.active) view3.update();
  }
  /** 放開（正放：從當時的值開始釋音；倒放：還沒播完就淡出） */
  function releaseNote(n) {
    if (n.done || !n.holding && n.auto == null && !n.rev) return;
    const t = nowS();
    if (n.rev) {
      n.holding = false;
      const e = noteElapsed(n, t);
      if (e < noteLength(n)) endNote(n, true, false);
      return;
    }
    if (n.hold !== Infinity) { n.holding = false; return; }
    n.holding = false;
    n.hold = n.auto != null ? n.auto : Math.max(0.001, noteElapsed(n, t));
    n.auto = null;
    emitRelease(n, true);
    refreshKeys();
  }
  /** 結束一個音（聲音淡出）。emit：倒放結束時送任務事件 */
  function endNote(n, emitIt, complete) {
    if (n.done) return;
    n.done = true;
    n.holding = false;
    if (n.voice) { const v = n.voice; n.voice = null; v.stop(0.03); }
    if (n.rev && emitIt) emitRelease(n, !!complete);
    refreshKeys();
    updateButtons();
    updateHF();
  }
  function stopAll(msg) {
    notes.forEach(function (n) { if (!n.done) { n.done = true; n.holding = false; if (n.voice) { const v = n.voice; n.voice = null; v.stop(0.06); } } });
    held.clear();
    if (window.MusicAudio) MusicAudio.stopAll(0.06);
    if (msg !== false) setStatus(T('已停止。', 'Stopped.'));
    refreshKeys();
    updateButtons();
    updateHF();
    requestDraw();
  }

  // ---------- 每一刻：推進狀態、更新聲音 ----------
  let loopTimer = 0;
  function startLoop() {
    if (!loopTimer) loopTimer = setInterval(tick, 16);
    tick();
  }
  function tick() {
    const t = nowS();
    notes.forEach(function (n) {
      if (n.done) return;
      const e = noteElapsed(n, t);
      if (!n.rev && n.auto != null && e >= n.auto) releaseNote(n);
      if (n.rev && e >= noteLength(n)) { endNote(n, true, true); say(T('倒放播完了。', 'Finished playing backwards.')); return; }
      if (!n.rev && n.hold !== Infinity && e >= n.hold + noteParams(n).R + 0.02) { endNote(n, false); return; }
      updateVoice(n, t);
    });
    notes = notes.filter(function (n) { return !n.done || n === cur; });
    if (!notes.some(function (n) { return !n.done; })) {
      clearInterval(loopTimer); loopTimer = 0;
      updateButtons();
      if (cur && cur.done && /^(播放中|倒放中|按著|Playing|Holding)/.test($('status').textContent)) setStatus(T('播完了。', 'Finished.'));
    }
    requestDraw();
    if (view3 && view3.active) view3.tick();
  }
  function playing() { return notes.some(function (n) { return !n.done; }); }
  function updateButtons() {
    const busy = playing() || !!(window.MusicAudio && MusicAudio.playing());
    $('stop').disabled = !busy;
  }
  function updateHF() {
    const n = notes.filter(function (m) { return !m.done; });
    const on = n.some(function (m) { return state.N * m.f0 >= 4000; });
    const w = $('hfWarn');
    if (w.hidden === on) w.hidden = !on;
  }
  function setStatus(s) { $('status').textContent = s; }
  function say(s) { const el = $('say'); el.textContent = ''; setTimeout(function () { el.textContent = s; }, 30); }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function restoring() { return !!(window.LabShare && window.LabShare.restoring); }
  function emit(type, data) { if (window.LabMission && !restoring()) window.LabMission.emit(type, data); }
  function snapshot() {
    return { A: state.A, D: state.D, S: state.S, R: state.R, shape: state.shape, H: state.H, N: state.N, high: state.high, scale: state.scale,
      rev: state.rev, preset: state.preset, edited: state.edited, touched: state.touched };
  }
  function emitEnv() { if (state.touched) emit('env', AC.envData(snapshot())); }
  function emitRelease(n, complete) {
    const s = snapshot();
    const p = noteParams(n);
    Object.assign(s, p, { rev: n.rev, held: n.rev ? n.H : n.hold, source: n.src, f0: n.f0, key: n.key, complete: complete });
    const d = AC.releaseData(s);
    emit('release', d);
    if (!n.rev) {
      say(T('放開：' + phaseName(d.phase) + '，振幅 ' + num(d.aRel, 2) + '（' + dbText(d.aRel) + '），接著 ' + sec(p.R) + ' 秒的釋音。',
        'Released during the ' + phaseName(d.phase) + ' at level ' + num(d.aRel, 2) + ' (' + dbText(d.aRel) + '), then a ' + sec(p.R) + ' s release.'));
    }
  }

  // =====================================================================
  // 畫布與版面
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const scope = $('scope'), sctx = scope.getContext('2d');
  let dpr = 1, cw = 300, ch = 320, sw = 300, sh = 150;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = cv.clientWidth || $('stage').clientWidth - 22;
    if (w > 0) {
      cw = w;
      const nar = cw < 600;
      ch = Math.round(nar ? Math.max(250, Math.min(cw * 0.78, 310)) : Math.max(300, Math.min(cw * 0.44, 360)));
      if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
      cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    }
    sw = scope.clientWidth || cw;
    sh = sw < 600 ? 140 : 156;
    if (scope.style.height !== sh + 'px') scope.style.height = sh + 'px';
    scope.width = Math.round(sw * dpr); scope.height = Math.round(sh * dpr);
    requestDraw();
  }
  function plotPanel(c, x0, y0, x1, y1) {
    D.roundRect(c, x0, y0, x1 - x0, y1 - y0, 6);
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, alpha(C.text, D.dark ? 0.035 : 0.018));
    g.addColorStop(1, alpha(C.text, D.dark ? 0.015 : 0.035));
    c.fillStyle = g; c.fill();
    c.strokeStyle = alpha(C.text, D.dark ? 0.16 : 0.12); c.lineWidth = 1; c.stroke();
  }
  function hline(c, x0, x1, y, color, width, dash) {
    c.save(); c.beginPath(); if (dash) c.setLineDash(dash);
    c.moveTo(x0, y); c.lineTo(x1, y); c.strokeStyle = color; c.lineWidth = width || 1; c.stroke(); c.restore();
  }
  function vline(c, x, y0, y1, color, width, dash) {
    c.save(); c.beginPath(); if (dash) c.setLineDash(dash);
    c.moveTo(x, y0); c.lineTo(x, y1); c.strokeStyle = color; c.lineWidth = width || 1; c.stroke(); c.restore();
  }
  function niceStep(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  function tickLabel(v, step) {
    const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9) + (step / Math.pow(10, Math.floor(Math.log10(step))) === 2.5 ? 1 : 0));
    return num(v, Math.min(4, dec));
  }

  // ---------- 包絡圖的幾何 ----------
  /** 畫面上的「這個音」：正在響或剛響過的音（cur），否則是設定（按住 H 秒） */
  function shownNote() {
    const p = params();
    if (cur && (!cur.done || cur.keep)) {
      const pp = noteParams(cur);
      if (cur.rev) return { rev: true, p: pp, H: cur.H, L: cur.H + pp.R, note: cur };
      const e = noteElapsed(cur);
      const hold = cur.hold !== Infinity ? cur.hold : (cur.auto != null ? cur.auto : Math.max(e, 0.001));
      return { rev: false, p: pp, hold: hold, live: cur.hold === Infinity && cur.auto == null, note: cur };
    }
    if (state.rev) return { rev: true, p: p, H: state.H, L: state.H + p.R, note: null };
    return { rev: false, p: p, hold: state.H, live: false, note: null };
  }
  let G = null;            // 最近一次畫圖的幾何（拖曳、點擊用）
  let dragSpan = null;     // 拖曳中固定時間軸，避免邊拖邊縮放
  function geom(sn) {
    const nar = cw < 600;
    const L = nar ? 44 : 54, Rr = cw - (nar ? 12 : 18), Tp = nar ? 52 : 54, Bt = ch - (nar ? 28 : 30);
    let span;
    if (sn.rev) span = sn.L;
    else span = Math.max(sn.hold, sn.p.A + sn.p.D) + sn.p.R;
    if (!sn.rev && sn.hold < sn.p.A + sn.p.D) span = Math.max(span, sn.p.A + sn.p.D + 0.12 * span);
    span = Math.max(0.02, span) * 1.06;
    if (dragSpan) span = dragSpan;
    const X = function (t) { return L + t / span * (Rr - L); };
    const tAt = function (x) { return (x - L) / (Rr - L) * span; };
    const top = 1.08;
    const Y = state.scale === 'db'
      ? function (a) { const d = Math.max(DB_MIN, AC.db(a)); return Bt - (d - DB_MIN) / (0 - DB_MIN + 4) * (Bt - Tp); }
      : function (a) { return Bt - a / top * (Bt - Tp); };
    const aAt = state.scale === 'db'
      ? function (y) { const d = DB_MIN + (Bt - y) / (Bt - Tp) * (0 - DB_MIN + 4); return d <= DB_MIN + 0.5 ? 0 : AC.fromDb(d); }
      : function (y) { return (Bt - y) / (Bt - Tp) * top; };
    return { L: L, Rr: Rr, Tp: Tp, Bt: Bt, span: span, X: X, Y: Y, tAt: tAt, aAt: aAt, nar: nar };
  }
  /** 依目前的音算 t 時刻的振幅與段落 */
  function shownLevel(sn, t) { return sn.rev ? AC.revLevel(t, sn.p, sn.H) : AC.level(t, sn.p, sn.hold); }
  function shownPhase(sn, t) {
    if (!sn.rev) return AC.phaseAt(t, sn.p, sn.hold);
    if (t < 0 || t >= sn.L) return 'off';
    return AC.phaseAt(sn.L - t, sn.p, sn.H);
  }
  /** 可拖曳的節點（倒放時沒有） */
  function nodes(sn, g) {
    if (sn.rev) return [];
    const p = sn.p;
    const list = [
      { id: 'A', t: p.A, a: 1, color: C['ad-a'] },
      { id: 'D', t: p.A + p.D, a: p.S, color: C['ad-d'] },
      { id: 'H', t: sn.hold, a: AC.pressLevel(sn.hold, p), color: C['ad-s'] },
      { id: 'R', t: sn.hold + p.R, a: 0, color: C['ad-r'] }
    ];
    list.forEach(function (n) { n.x = g.X(n.t); n.y = g.Y(n.a); });
    return list;
  }
  /** 目前的時間游標：正在播放時是經過的時間；否則是點選的時刻（沒有就是起音頂點） */
  function cursorTime(sn) {
    if (cur && !cur.done) return noteElapsed(cur);
    if (state.inspect != null) return state.inspect;
    return sn.rev ? sn.L - Math.min(sn.p.A, sn.H) : Math.min(sn.p.A, sn.hold);
  }

  // =====================================================================
  // 包絡圖
  // =====================================================================
  function drawEnv() {
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, cw, ch);
    const sn = shownNote();
    const g = geom(sn);
    G = { g: g, sn: sn };
    const nar = g.nar, f11 = fnt(nar ? 10.5 : 11.5), f12b = fnt(nar ? 11 : 12, 600);
    plotPanel(c, g.L, g.Tp, g.Rr, g.Bt);

    // 格線與刻度
    c.save();
    const tStep = niceStep(g.span, nar ? 4 : 7);
    c.beginPath();
    for (let t = tStep; t < g.span; t += tStep) { const x = Math.round(g.X(t) * dpr) / dpr + 0.5 / dpr; c.moveTo(x, g.Tp); c.lineTo(x, g.Bt); }
    const yTicks = state.scale === 'db' ? [-60, -50, -40, -30, -20, -10, 0] : [0, 0.25, 0.5, 0.75, 1];
    yTicks.forEach(function (v) {
      const y = Math.round((state.scale === 'db' ? g.Y(AC.fromDb(v)) : g.Y(v)) * dpr) / dpr + 0.5 / dpr;
      c.moveTo(g.L, y); c.lineTo(g.Rr, y);
    });
    c.strokeStyle = alpha(C.text, D.dark ? 0.07 : 0.06); c.lineWidth = 1 / dpr; c.stroke();
    c.restore();
    for (let t = 0; t < g.span + 1e-9; t += tStep) D.haloText(c, tickLabel(t, tStep), g.X(t), g.Bt + 14, C.muted, t === 0 ? 'left' : 'center', 'middle', f11);
    D.haloText(c, T('時間（s）', 'time (s)'), g.Rr, g.Bt + 14 + (nar ? 0 : 0), C.muted, 'right', 'middle', f11);
    yTicks.forEach(function (v, i) {
      if (nar && state.scale === 'db' && i % 2 === 1) return;
      const y = state.scale === 'db' ? g.Y(AC.fromDb(v)) : g.Y(v);
      D.haloText(c, state.scale === 'db' ? num(v, 0) : (v === 0 || v === 1 ? String(v) : String(v)), g.L - 6, y, C.muted, 'right', 'middle', f11);
    });
    D.haloText(c, state.scale === 'db' ? 'dB' : T('振幅', 'level'), g.L - 6, g.Tp - 10, C.muted, 'right', 'middle', f11);

    // 延持高度的參考線
    if (!sn.rev) hline(c, g.L, g.Rr, g.Y(sn.p.S), alpha(C['ad-s'], 0.35), 1, [3, 4]);

    // 取樣曲線
    const n = Math.max(400, Math.round((g.Rr - g.L) * 1.5));
    const pts = [];
    const tEnd = sn.rev ? sn.L : sn.hold + sn.p.R;
    for (let i = 0; i <= n; i++) {
      const t = tEnd * i / n;
      pts.push({ t: t, a: shownLevel(sn, t), ph: shownPhase(sn, Math.min(t, tEnd - 1e-9)) });
    }
    // 段落的分界時刻（依畫面上的時間）
    const bounds = [];
    if (!sn.rev) {
      const p = sn.p, h = sn.hold;
      [[0, Math.min(p.A, h), 'A'], [p.A, Math.min(p.A + p.D, h), 'D'], [p.A + p.D, h, 'S'], [h, h + p.R, 'R']].forEach(function (b) { if (b[1] > b[0]) bounds.push(b); });
    } else {
      const p = sn.p, L = sn.L, H = sn.H;
      [[0, p.R, 'R'], [p.R, L - Math.min(p.A + p.D, H), 'S'], [L - Math.min(p.A + p.D, H), L - Math.min(p.A, H), 'D'], [L - Math.min(p.A, H), L, 'A']].forEach(function (b) { if (b[1] > b[0] + 1e-9) bounds.push(b); });
    }
    // 填色（每一段各自的顏色，漸層往下變淡）
    bounds.forEach(function (b) {
      const col = segColor(b[2]);
      c.save();
      c.beginPath();
      c.moveTo(g.X(b[0]), g.Bt);
      const m = Math.max(24, Math.round((g.X(b[1]) - g.X(b[0])) * 1.5));
      for (let i = 0; i <= m; i++) { const t = b[0] + (b[1] - b[0]) * i / m; c.lineTo(g.X(t), g.Y(shownLevel(sn, Math.min(t, b[1] - 1e-9 * (i === m ? 1 : 0))))); }
      c.lineTo(g.X(b[1]), g.Bt);
      c.closePath();
      const gr = c.createLinearGradient(0, g.Tp, 0, g.Bt);
      gr.addColorStop(0, alpha(col, D.dark ? 0.30 : 0.24));
      gr.addColorStop(1, alpha(col, D.dark ? 0.05 : 0.04));
      c.fillStyle = gr; c.fill();
      c.restore();
    });
    // 振盪示意（振幅刻度）：放慢的波形，被包絡框住
    if (state.scale === 'lin') {
      c.save(); c.beginPath(); c.rect(g.L, g.Tp, g.Rr - g.L, g.Bt - g.Tp); c.clip();
      const fv = VIS_CYCLES / g.span;
      c.save();
      c.beginPath();
      const m = Math.round((g.Rr - g.L) * 3);
      for (let i = 0; i <= m; i++) {
        const t = tEnd * i / m;
        const y = g.Y(0) - (g.Y(0) - g.Y(shownLevel(sn, t))) * Math.sin(TAU * fv * t);
        if (i) c.lineTo(g.X(t), y); else c.moveTo(g.X(t), y);
      }
      // 只畫在 0 以上（以下是鏡像，不畫，免得和填色搶）
      c.strokeStyle = alpha(C['ad-wave'], D.dark ? 0.32 : 0.26); c.lineWidth = 1; c.stroke();
      c.restore(); c.restore();
    }
    // 提早放開：如果一直按著的話（虛線）
    if (!sn.rev && sn.hold < sn.p.A + sn.p.D) {
      c.save(); c.beginPath(); c.setLineDash([5, 4]);
      const t0 = sn.hold, t1 = Math.min(g.span, sn.p.A + sn.p.D + 0.1 * g.span);
      const m = 120;
      for (let i = 0; i <= m; i++) { const t = t0 + (t1 - t0) * i / m; const y = g.Y(AC.pressLevel(t, sn.p)); if (i) c.lineTo(g.X(t), y); else c.moveTo(g.X(t), y); }
      c.strokeStyle = alpha(C['ad-ghost'], 0.85); c.lineWidth = 1.6; c.stroke(); c.restore();
    }
    // 倒放時：淡淡的正放曲線當對照
    if (sn.rev) {
      c.save(); c.beginPath(); c.setLineDash([5, 4]);
      const m = 300;
      for (let i = 0; i <= m; i++) { const t = sn.L * i / m; const y = g.Y(AC.level(t, sn.p, sn.H)); if (i) c.lineTo(g.X(t), y); else c.moveTo(g.X(t), y); }
      c.strokeStyle = alpha(C['ad-ghost'], 0.7); c.lineWidth = 1.4; c.stroke(); c.restore();
    }
    // 曲線本體（管狀線，每段自己的顏色）
    bounds.forEach(function (b) {
      const col = segColor(b[2]);
      const m = Math.max(24, Math.round((g.X(b[1]) - g.X(b[0])) * 1.5));
      const liveR = b[2] === 'R' && sn.live;
      D.tube(c, function (cc) {
        for (let i = 0; i <= m; i++) {
          const t = b[0] + (b[1] - b[0]) * i / m;
          const a = shownLevel(sn, i === m ? b[1] - 1e-9 : t);
          if (i) cc.lineTo(g.X(t), g.Y(a)); else cc.moveTo(g.X(t), g.Y(a));
        }
        // 指數衰減到 0：段尾從 −60 dB 落到 0
        if (b[2] === 'R' || (b[2] === 'D' && sn.p.S === 0)) cc.lineTo(g.X(b[1]), g.Y(shownLevel(sn, b[1] + (sn.rev ? -1e-9 : 1e-9))));
      }, liveR ? alpha(col, 0.45) : col, nar ? 3 : 3.4);
    });
    // 段落標籤（上方）
    bounds.forEach(function (b) {
      const x0 = g.X(b[0]), x1 = g.X(b[1]);
      if (b[0] > 0) vline(c, x0, g.Tp, g.Bt, alpha(segColor(b[2]), 0.35), 1, [2, 4]);
      if (x1 - x0 < (nar ? 20 : 24)) return;
      const label = b[2] + (x1 - x0 > (nar ? 64 : 76) ? ' ' + (b[2] === 'S' ? '= ' + num(sn.p.S, 2) : secText(b[2] === 'A' && !sn.rev ? sn.p.A : b[2] === 'D' ? sn.p.D : b[2] === 'R' ? sn.p.R : b[1] - b[0])) : '');
      c.font = fnt(nar ? 10.5 : 11.5, 700);
      const w = c.measureText(label).width + 12;
      if (w > x1 - x0 + 6) { D.pill(c, b[2], (x0 + x1) / 2, g.Tp - 12, segColor(b[2]), 'center', fnt(nar ? 10.5 : 11.5, 700)); return; }
      D.pill(c, label, (x0 + x1) / 2, g.Tp - 12, segColor(b[2]), 'center', fnt(nar ? 10.5 : 11.5, 700));
    });

    // 節點
    const nd = nodes(sn, g);
    nd.forEach(function (q, i) {
      const hot = state.hover === i || (drag && drag.i === i);
      if (hot) { c.save(); c.beginPath(); c.arc(q.x, q.y, nar ? 13 : 12, 0, TAU); c.fillStyle = alpha(q.color, 0.16); c.fill(); c.restore(); }
      D.ball(c, q.x, q.y, (nar ? 6.5 : 6) * (hot ? 1.12 : 1), q.color, { glow: D.dark ? 0.35 : 0 });
      if (kb && kb.focused() && kb.index() === i) {
        c.save(); c.setLineDash([4, 3]); D.roundRect(c, q.x - 12, q.y - 12, 24, 24, 6); c.strokeStyle = C.accent; c.lineWidth = 2; c.stroke(); c.restore();
      }
    });
    // 放開點的標籤
    if (!sn.rev && nd.length) {
      const q = nd[2];
      const s = sn.live ? T('按著…', 'holding…') : T('放開', 'release');
      D.pill(c, s, Math.min(g.Rr - 30, Math.max(g.L + 30, q.x)), Math.max(g.Tp + 18, q.y - 10), C['ad-s'], 'center', fnt(nar ? 10.5 : 11.5, 600));
    }

    // 游標
    const tc = cursorTime(sn);
    if (tc >= 0 && tc <= g.span) {
      const a = shownLevel(sn, tc);
      const x = g.X(tc), y = g.Y(a);
      const active = cur && !cur.done;
      vline(c, x, g.Tp, g.Bt, alpha(active ? C.accent : C.text, active ? 0.7 : 0.35), active ? 1.6 : 1.2, active ? null : [3, 3]);
      D.ball(c, x, y, nar ? 5 : 5.5, C.probe, { glow: D.dark ? 0.5 : 0.15 });
      const s = (active ? '' : T('檢視 ', 'view ')) + sec(tc) + ' s・' + num(a, 2) + '（' + dbText(a) + '）';
      c.font = f12b;
      const w = c.measureText(s).width + 12;
      const px = x + 8 + w > g.Rr ? x - 8 : x + 8;
      D.pill(c, s, px, g.Bt - 6, C.text, x + 8 + w > g.Rr ? 'right' : 'left', f12b);
    }
    // 標題
    const title = sn.rev ? T('倒放：整個音左右反過來（虛線是正放）', 'Reversed: the whole note flipped (dashed = forwards)')
      : state.scale === 'db' ? T('包絡（分貝刻度）', 'Envelope (decibels)') : T('包絡（振幅刻度）', 'Envelope (amplitude)');
    D.pill(c, title, g.L, 15, C.text, 'left', fnt(nar ? 11.5 : 12.5, 600));
    if (state.scale === 'lin' && !nar) D.haloText(c, T('淡藍色的振盪是放慢的示意', 'the faint oscillation is slowed down'), g.Rr, 15, alpha(C['ad-wave'], 0.9), 'right', 'middle', f11);
  }

  // =====================================================================
  // 示波器：游標附近四個週期
  // =====================================================================
  function waveAt(e, phase) {
    // Σ (1/k) e^(q_k − 1) sin(k·phase)，總和調成 1（和送進聲音引擎的一樣）
    const pa = partialsFor(e);
    let s = 0;
    for (let k = 1; k <= pa.length; k++) s += pa[k - 1] * Math.sin(k * phase);
    return s;
  }
  function drawScope() {
    const c = sctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, sw, sh);
    const nar = sw < 600;
    const L = nar ? 40 : 50, Rr = sw - (nar ? 10 : 16), Tp = 30, Bt = sh - 22;
    plotPanel(c, L, Tp, Rr, Bt);
    const sn = shownNote();
    const k = cur ? cur.f0 : keyOf(state.key).f;
    const per = 1 / k, win = 4 * per;
    const tc = cursorTime(sn);
    const t0 = tc - win / 2;
    const mid = (Tp + Bt) / 2, half = (Bt - Tp) / 2 - 3;
    // 波形的峰值上限（e = 1 時）
    let pk = 0;
    for (let i = 0; i < 400; i++) pk = Math.max(pk, Math.abs(waveAt(1, TAU * i / 400)));
    pk = Math.max(pk, 0.05);
    const X = function (t) { return L + (t - t0) / win * (Rr - L); };
    const Y = function (v) { return mid - v / pk * half; };
    hline(c, L, Rr, mid, alpha(C.text, 0.25), 1);
    for (let i = 1; i < 4; i++) vline(c, L + i / 4 * (Rr - L), Tp, Bt, alpha(C.text, 0.08), 1);
    // ±包絡
    const m = Math.max(300, Math.round((Rr - L) * 2));
    ['up', 'dn'].forEach(function (w) {
      c.save(); c.beginPath(); c.setLineDash([4, 4]);
      for (let i = 0; i <= m; i++) { const t = t0 + win * i / m; const a = shownLevel(sn, t); const y = Y((w === 'up' ? 1 : -1) * a * pk); if (i) c.lineTo(X(t), y); else c.moveTo(X(t), y); }
      c.strokeStyle = alpha(segColor(shownPhase(sn, Math.max(0, tc))), 0.7); c.lineWidth = 1.2; c.stroke(); c.restore();
    });
    D.tube(c, function (cc) {
      for (let i = 0; i <= m; i++) {
        const t = t0 + win * i / m;
        const a = shownLevel(sn, t);
        const v = a * waveAt(a, TAU * k * t);
        if (i) cc.lineTo(X(t), Y(v)); else cc.moveTo(X(t), Y(v));
      }
    }, C['ad-wave'], nar ? 2.2 : 2.6);
    vline(c, X(tc), Tp, Bt, alpha(C.probe, 0.6), 1.2, [3, 3]);
    const a = shownLevel(sn, tc);
    D.pill(c, T('示波器：', 'Oscilloscope: ') + (cur ? cur.key : keyOf(state.key).name) + ' ' + num(k, 1) + ' Hz', L, 20, C.text, 'left', fnt(nar ? 11 : 12, 600));
    D.haloText(c, T('4 個週期 = ', '4 periods = ') + num(win * 1000, 1) + ' ms', Rr, Bt + 13, C.muted, 'right', 'middle', fnt(nar ? 10.5 : 11.5));
    D.haloText(c, 't = ' + sec(Math.max(0, tc)) + ' s・' + phaseName(shownPhase(sn, tc)) + '・' + num(a, 2), L, Bt + 13, C.muted, 'left', 'middle', fnt(nar ? 10.5 : 11.5));
  }

  // =====================================================================
  // 繪製迴圈
  // =====================================================================
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    if (!$('stage').classList.contains('is3d')) drawEnv();
    drawScope();
    updateLive();
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  let eqKey = '';
  function updateReadouts() {
    const p = params();
    const tD = AC.tauD(p), tR = AC.tauR(p);
    const lin = p.shape === 'lin';
    setHTML('rTauD', lin ? T('—<small>（線性沒有固定的 τ）</small>', '—<small> (linear: no fixed τ)</small>') : tD === Infinity ? T('∞<small>（S = 1，不衰減）</small>', '∞<small> (S = 1, no decay)</small>') : secText(tD));
    setHTML('rHalfD', lin ? '—' : tD === Infinity ? '∞' : secText(AC.half(tD)));
    setHTML('rTauR', lin ? T('—<small>（線性）</small>', '—<small> (linear)</small>') : secText(tR));
    setHTML('rHalfR', lin ? '—' : secText(AC.half(tR)));
    setHTML('rSlope', lin ? T('—<small>（線性不是定值）</small>', '—<small> (not constant)</small>') : num(AC.slopeD(p), 1) + '、' + num(AC.slopeR(p), 1) + ' <small>dB/s</small>');
    const t20 = AC.timeToDb(p, -20);
    setHTML('rT20', t20 === Infinity ? T('不會<small>（延持高於 −20 dB）</small>', 'never<small> (sustain above −20 dB)</small>') : secText(t20));
    const sn = shownNote();
    const span = AC.audibleSpan(sn.p, sn.rev ? { rev: true, H: sn.H } : { hold: sn.hold }, -40);
    const f0 = cur ? cur.f0 : keyOf(state.key).f;
    setHTML('rDur', secText(span.dur) + ' <small>' + T('≈ ' + num(span.dur * f0, span.dur * f0 < 10 ? 1 : 0) + ' 個週期', '≈ ' + num(span.dur * f0, span.dur * f0 < 10 ? 1 : 0) + ' periods') + '</small>');
    const Q = AC.qFactor(f0, tD);
    setHTML('rQ', Q == null ? '—' : num(Q, Q < 100 ? 1 : 0) + ' <small>' + (cur ? cur.key : keyOf(state.key).name) + '</small>');
    setHTML('sNote', T('延持 S = ' + num(p.S, 2) + ' = ' + dbText(p.S) + '（相對於頂點）', 'Sustain S = ' + num(p.S, 2) + ' = ' + dbText(p.S) + ' (relative to the peak)'));
    setHTML('presetNote', state.preset ? (state.edited ? T('已修改：從「' + presetName(state.preset) + '」開始', 'Edited, starting from “' + presetName(state.preset) + '”') : T('目前：' + presetName(state.preset) + '（近似）', 'Now: ' + presetName(state.preset) + ' (approximate)')) : '');
    document.querySelectorAll('#presets [data-preset]').forEach(function (b) {
      const on = !state.edited && b.getAttribute('data-preset') === state.preset;
      if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
    });
    $('shLin').setAttribute('aria-pressed', String(state.shape === 'lin'));
    $('shExp').setAttribute('aria-pressed', String(state.shape === 'exp'));
    $('scLin').setAttribute('aria-pressed', String(state.scale === 'lin'));
    $('scDb').setAttribute('aria-pressed', String(state.scale === 'db'));
    $('rev').setAttribute('aria-pressed', String(state.rev));
    $('high').checked = state.high;
    // 公式
    const key = [p.shape, num(p.D, 4), num(p.S, 2), num(p.R, 4), window.LabSettings ? LabSettings.get('lang') : ''].join('|');
    if (key !== eqKey && window.katex) {
      eqKey = key;
      let tex;
      if (lin) tex = 'a(t) = 1 - (1 - S)\\,\\frac{t - A}{D} \\quad (A \\le t \\le A + D)';
      else if (tD === Infinity) tex = '\\tau_R = \\frac{R}{\\ln 1000} = \\frac{' + sec(p.R) + '}{6.908} = ' + sec(tR) + '\\,\\text{s}';
      else {
        const e = AC.decayEnd(p);
        tex = '\\tau_D = \\frac{D}{\\ln(1/' + (p.S < 0.001 ? '0.001' : num(e, 2)) + ')} = ' + sec(tD) + '\\,\\text{s}, \\quad t_{1/2} = \\tau_D \\ln 2 = ' + sec(AC.half(tD)) + '\\,\\text{s}';
      }
      try { window.katex.render(tex, $('rEq'), { throwOnError: false, displayMode: false }); } catch (e) { $('rEq').textContent = ''; }
    }
    refreshOutputs();
  }
  /** 每一幀都可能變的讀數（不設 aria-live） */
  function updateLive() {
    const sn = shownNote();
    const tc = cursorTime(sn);
    const a = shownLevel(sn, tc);
    const ph = shownPhase(sn, tc);
    const active = cur && !cur.done;
    setHTML('rNow', (active ? '' : T('檢視 ', 'viewing ')) + sec(Math.max(0, tc)) + ' s <small>' + phaseName(ph) + '</small>');
    setHTML('rLvl', num(a, 3) + ' <small>' + dbText(a) + '</small>');
    setHTML('rBright', num(AC.brightRatio(a, state.N, state.high), 2) + (state.high ? '' : ' <small>' + T('（沒勾高泛音衰減：不變）', '(no fade of highs: constant)') + '</small>'));
  }
  function refreshOutputs() {
    $('sAo').textContent = sec(state.A);
    $('sDo').textContent = sec(state.D);
    $('sSo').textContent = num(state.S, 2);
    $('sRo').textContent = sec(state.R);
    $('sHo').textContent = sec(state.H);
    $('sNo').textContent = String(state.N);
  }

  // =====================================================================
  // 操作
  // =====================================================================
  /** 改了設定之後：讀數、正在響的音、3D、重畫 */
  function afterChange() {
    if (cur && cur.done) cur = null;
    updateReadouts();
    notes.forEach(function (n) { if (n.voice && n.voice.playing) n.voice.set({ partials: partialsFor(noteLevel(n, null, true)) }, 0.03); });
    updateHF();
    if (view3 && view3.active) view3.update();
    requestDraw();
  }
  function userEdit(isEnv) {
    state.touched = true;
    if (isEnv && state.preset) state.edited = true;
  }
  const elA = $('sA'), elD = $('sD'), elS = $('sS'), elR = $('sR'), elH = $('sH'), elN = $('sN');
  const reg = function (el, sc) { if (window.LabNum) window.LabNum.register(el, { toValue: sc.fromPos, toPos: sc.toPos, min: sc.min, max: sc.max, decimals: 4 }); };
  reg(elA, AC.TIME); reg(elD, AC.TIME); reg(elR, AC.TIME); reg(elH, AC.HOLD);
  function timeInput(el, k, sc) {
    el.addEventListener('input', function () {
      state[k] = AC.quant(Math.max(sc.min, Math.min(sc.max, val(el))));
      if (!applying) userEdit(k !== 'H');
      afterChange();
    });
    el.addEventListener('change', function () { if (!applying) { emitEnv(); describeChange(k); } });
  }
  timeInput(elA, 'A', AC.TIME); timeInput(elD, 'D', AC.TIME); timeInput(elR, 'R', AC.TIME); timeInput(elH, 'H', AC.HOLD);
  elS.addEventListener('input', function () {
    state.S = Math.round(Math.max(0, Math.min(1, val(elS))) * 100) / 100;
    if (!applying) userEdit(true);
    afterChange();
  });
  elS.addEventListener('change', function () { if (!applying) { emitEnv(); describeChange('S'); } });
  elN.addEventListener('input', function () {
    state.N = Math.max(AC.N_MIN, Math.min(AC.N_MAX, Math.round(val(elN))));
    if (!applying) userEdit(false);
    afterChange();
  });
  elN.addEventListener('change', function () { if (!applying) emitEnv(); });
  function describeChange(k) {
    const p = params();
    const s = k === 'S' ? T('延持 S = ' + num(p.S, 2) + '（' + dbText(p.S) + '）', 'Sustain S = ' + num(p.S, 2) + ' (' + dbText(p.S) + ')')
      : k === 'H' ? T('按住時間 ' + sec(state.H) + ' 秒', 'Hold time ' + sec(state.H) + ' s')
        : (k === 'A' ? T('起音 A', 'Attack A') : k === 'D' ? T('衰減 D', 'Decay D') : T('釋音 R', 'Release R')) + ' = ' + sec(p[k]) + ' s';
    const tD = AC.tauD(p);
    say(s + (tD != null && isFinite(tD) ? T('。衰減的時間常數 ' + sec(tD) + ' 秒。', '. Decay time constant ' + sec(tD) + ' s.') : T('。', '.')));
  }
  /** 程式設定滑桿（預設、拖曳節點、分享還原），不觸發任務 */
  function setSlider(el, v) {
    applying = true;
    if (window.LabNum) window.LabNum.set(el, v); else { el.value = String(v); el.dispatchEvent(new Event('input')); }
    applying = false;
  }
  function applyPreset(id) {
    const pr = AC.PRESETS[id];
    if (!pr) return;
    setSlider(elA, pr.A); setSlider(elD, pr.D); setSlider(elS, pr.S); setSlider(elR, pr.R);
    state.A = pr.A; state.D = pr.D; state.S = pr.S; state.R = pr.R;
    state.shape = pr.shape;
    state.preset = id; state.edited = false; state.touched = true;
    afterChange();
    emitEnv();
    say(presetName(id) + T('（近似）：', ' (approximate): ') + 'A ' + sec(pr.A) + ' s、D ' + sec(pr.D) + ' s、S ' + num(pr.S, 2) + '、R ' + sec(pr.R) + ' s');
  }
  document.querySelectorAll('#presets [data-preset]').forEach(function (b) {
    b.addEventListener('click', function () { applyPreset(b.getAttribute('data-preset')); });
  });
  function setShape(sh) {
    if (state.shape === sh) return;
    state.shape = sh; userEdit(true); afterChange(); emitEnv();
    say(sh === 'lin' ? T('線性：每一段都是直線。', 'Linear: every stage is a straight line.') : T('指數：衰減與釋音在分貝刻度上是直線。', 'Exponential: the decay and release are straight lines in decibels.'));
  }
  $('shLin').addEventListener('click', function () { setShape('lin'); });
  $('shExp').addEventListener('click', function () { setShape('exp'); });
  function setScale(sc) {
    if (state.scale === sc) return;
    state.scale = sc; state.touched = true; afterChange(); emitEnv();
    say(sc === 'db' ? T('分貝刻度：0 dB 是頂點，−60 dB 是千分之一。', 'Decibel scale: 0 dB is the peak, −60 dB one thousandth.') : T('振幅刻度。', 'Amplitude scale.'));
  }
  $('scLin').addEventListener('click', function () { setScale('lin'); });
  $('scDb').addEventListener('click', function () { setScale('db'); });
  $('high').addEventListener('change', function () {
    state.high = $('high').checked; state.touched = true; afterChange(); emitEnv();
  });
  $('rev').addEventListener('click', function () {
    state.rev = !state.rev; state.touched = true;
    stopAll(false);
    cur = null;
    afterChange(); emitEnv();
    say(state.rev ? T('倒放：按「▶ 播放」或琴鍵，整個音左右反過來播。', 'Reverse: “▶ Play” or a key plays the whole note back to front.') : T('正放。', 'Forwards.'));
  });

  // ---------- 播放列 ----------
  $('play').addEventListener('click', function () { noteOn(state.key, 'play', 'play'); });
  $('stop').addEventListener('click', function () { stopAll(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && playing()) stopAll(); });
  if (window.MusicAudio) MusicAudio.onChange(function () {
    // 被 Esc、關音效或切到背景停掉：畫面上的音也一起結束
    let cut = false;
    notes.forEach(function (n) { if (n.voice && !n.voice.playing && !n.done) { n.voice = null; n.done = true; n.holding = false; cut = true; } });
    if (cut) { held.clear(); refreshKeys(); setStatus(T('已停止。', 'Stopped.')); }
    updateButtons();
    requestDraw();
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden && playing()) stopAll(false); });
  window.addEventListener('blur', function () { releaseAllHeld(); });

  // ---------- 音效開關（照 derivative.js） ----------
  function updateSoundButton() {
    const on = soundOn();
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
      if (!ev.detail.value) notes.forEach(function (n) { if (n.voice) { const v = n.voice; n.voice = null; v.stop(0.05); } });
    }
    if (ev.detail.name === 'lang') themeChanged();
  });

  // =====================================================================
  // 琴鍵：按住才響、放開進入釋音
  // =====================================================================
  const held = new Map();    // 按住的來源（指標或按鍵）→ 音
  const kbdEl = $('kbd');
  AC.KEYS.forEach(function (k, i) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'key';
    b.setAttribute('data-key', String(i));
    b.setAttribute('data-share-skip', '');
    b.setAttribute('aria-label', k.name + T('（電腦鍵盤 ', ' (computer key ') + k.kb.toUpperCase() + T('）', ')'));
    b.innerHTML = '<b>' + k.name + '</b><small>' + k.kb.toUpperCase() + '</small>';
    kbdEl.appendChild(b);
  });
  const keyBtns = Array.prototype.slice.call(kbdEl.querySelectorAll('button.key'));
  function press(i, id) {
    if (held.has(id)) return;
    noteOn(i, 'key', id);
    held.set(id, cur);
    refreshKeys();
  }
  function unpress(id) {
    const n = held.get(id);
    if (!n) return;
    held.delete(id);
    releaseNote(n);
    refreshKeys();
  }
  function releaseAllHeld() { Array.from(held.keys()).forEach(unpress); }
  function refreshKeys() {
    keyBtns.forEach(function (b, i) {
      let down = false;
      held.forEach(function (n) { if (n.keyIdx === i && !n.done) down = true; });
      b.classList.toggle('down', down);
      b.classList.toggle('sel', i === state.key);
    });
  }
  keyBtns.forEach(function (b, i) {
    b.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      // 觸控預設會把指標「抓」在這個鍵上；放掉抓取，手指滑出鍵外才收得到 pointerleave
      try { if (b.hasPointerCapture && b.hasPointerCapture(e.pointerId)) b.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      press(i, 'p' + e.pointerId);
    });
    ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'].forEach(function (t) {
      b.addEventListener(t, function (e) { unpress('p' + e.pointerId); });
    });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    // 鍵盤聚焦在琴鍵上：Enter／空白鍵按下＝按住，放開＝放開
    b.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (!e.repeat) press(i, 'b' + i);
    });
    b.addEventListener('keyup', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); unpress('b' + i); } });
    // 程式或輔助科技的點擊（沒有指標事件）：照「按住時間」彈一個音
    b.addEventListener('click', function (e) { if (e.detail === 0 && !held.size) { state.key = i; noteOn(i, 'play', 'play'); } });
  });
  window.addEventListener('pointerup', function (e) { unpress('p' + e.pointerId); });
  window.addEventListener('pointercancel', function (e) { unpress('p' + e.pointerId); });
  // 電腦鍵盤 A S D F G H J K
  function typing(e) {
    const t = e.target;
    return !!(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)));
  }
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
    const i = AC.KEYS.findIndex(function (k) { return k.kb === (e.key || '').toLowerCase(); });
    if (i < 0) return;
    e.preventDefault();
    if (!e.repeat) press(i, 'k' + i);
  });
  document.addEventListener('keyup', function (e) {
    const i = AC.KEYS.findIndex(function (k) { return k.kb === (e.key || '').toLowerCase(); });
    if (i >= 0) unpress('k' + i);
  });

  // =====================================================================
  // 包絡圖：拖曳節點、點選時刻
  // =====================================================================
  let drag = null;
  function ptr(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function nodeAt(p) {
    if (!G) return -1;
    const nd = nodes(G.sn, G.g);
    let best = -1, bd = (cw < 600 ? 24 : 18);
    nd.forEach(function (q, i) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  /** 把節點 i 移到時刻 t（與高度 a）；回傳有沒有改變 */
  function moveNode(i, t, a) {
    const sn = G.sn, p = sn.p;
    let changed = false;
    const setT = function (el, k, v, sc) {
      v = AC.quant(Math.max(sc.min, Math.min(sc.max, v)));
      if (v === state[k]) return;
      state[k] = v; setSlider(el, v); changed = true;
    };
    if (i === 0) setT(elA, 'A', t, AC.TIME);
    else if (i === 1) {
      setT(elD, 'D', t - p.A, AC.TIME);
      if (a != null) {
        const s = Math.round(Math.max(0, Math.min(1, a)) * 100) / 100;
        if (s !== state.S) { state.S = s; setSlider(elS, s); changed = true; }
      }
    } else if (i === 2) setT(elH, 'H', t, AC.HOLD);
    else if (i === 3) setT(elR, 'R', t - sn.hold, AC.TIME);
    if (changed) { userEdit(i !== 2); if (cur && cur.done) cur = null; afterChange(); }
    return changed;
  }
  cv.addEventListener('pointerdown', function (e) {
    if (!G) return;
    const p = ptr(e);
    const i = nodeAt(p);
    e.preventDefault();
    if (i >= 0 && !(cur && !cur.done)) {
      drag = { i: i, id: e.pointerId, changed: false };
      dragSpan = G.g.span;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      if (kb) kb.select(i);
      requestDraw();
      return;
    }
    // 點其他地方：示波器看那一刻
    const t = G.g.tAt(p.x);
    if (t >= 0 && t <= G.g.span) { state.inspect = t; requestDraw(); }
  });
  cv.addEventListener('pointermove', function (e) {
    const p = ptr(e);
    if (!drag) {
      const h = nodeAt(p);
      if (h !== state.hover) { state.hover = h; cv.style.cursor = h >= 0 ? 'grab' : 'crosshair'; requestDraw(); }
      return;
    }
    const g = G.g;
    if (moveNode(drag.i, g.tAt(p.x), drag.i === 1 ? g.aAt(p.y) : null)) drag.changed = true;
  });
  function endDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    dragSpan = null;
    if (d.changed) { emitEnv(); describeChange(['A', 'D', 'H', 'R'][d.i]); }
    requestDraw();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (!drag && state.hover >= 0) { state.hover = -1; requestDraw(); } });

  // ---------- 鍵盤（LabKeys）：Enter 換節點，左右改時間、上下改延持 ----------
  let kb = null;
  if (window.LabKeys) {
    const names = [T('起音頂點（A）', 'Peak of the attack (A)'), T('衰減終點（D、S）', 'End of the decay (D, S)'), T('放開的時刻（按住時間）', 'Release point (hold time)'), T('釋音終點（R）', 'End of the release (R)')];
    const items = [0, 1, 2, 3].map(function (i) {
      return {
        name: function () { return names[i]; },
        move: function (dx, dy, big) {
          if (!G || G.sn.rev) return false;
          const keyK = ['A', 'D', 'H', 'R'][i];
          const f = big ? 1.25 : 1.05;
          let changed = false;
          if (dx) {
            const v = keyK === 'H' ? state.H : state[keyK];
            const nv = dx > 0 ? v * f : v / f;
            const sn = G.sn;
            const t = i === 0 ? nv : i === 1 ? sn.p.A + nv : i === 2 ? nv : sn.hold + nv;
            changed = moveNode(i, t, null) || changed;
          }
          if (dy && i === 1) {
            const s = Math.round(Math.max(0, Math.min(1, state.S + dy * (big ? 0.1 : 0.01))) * 100) / 100;
            if (s !== state.S) { state.S = s; setSlider(elS, s); userEdit(true); afterChange(); changed = true; }
          }
          if (changed) emitEnv();
          return changed;
        },
        describe: function () {
          const p = params();
          return names[i] + '：' + (i === 0 ? 'A ' + sec(p.A) + ' s' : i === 1 ? 'D ' + sec(p.D) + ' s、S ' + num(p.S, 2) : i === 2 ? sec(state.H) + ' s' : 'R ' + sec(p.R) + ' s');
        }
      };
    });
    kb = window.LabKeys.attach(cv, {
      label: T('包絡圖。Enter 切換節點（起音頂點、衰減終點、放開的時刻、釋音終點），左右方向鍵改時間（Shift 改得多），衰減終點可以用上下方向鍵改延持 S。',
        'Envelope graph. Enter switches between the nodes (peak of the attack, end of the decay, release point, end of the release); left and right change the time (Shift for bigger steps); on the end of the decay, up and down change sustain S.'),
      items: items,
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 分享連結：倒放、選的音、預設（滑桿與形狀、刻度按鈕由 classroom.js 自動記錄）
  // =====================================================================
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { rv: state.rev ? 1 : 0, k: state.key, p: state.preset || '', e: state.edited ? 1 : 0, hi: state.high ? 1 : 0 }; },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      if (o.rv != null) state.rev = !!o.rv;
      if (isFinite(+o.k)) state.key = Math.max(0, Math.min(AC.KEYS.length - 1, Math.round(+o.k)));
      if (typeof o.p === 'string') state.preset = AC.PRESETS[o.p] ? o.p : null;
      if (o.e != null) state.edited = !!o.e;
      if (o.hi != null) state.high = !!o.hi;
      cur = null;
      refreshKeys();
      afterChange();
    }
  });

  // =====================================================================
  // 3D 檢視：切換到 3D 時才載入 js/adsr-envelope-3d.js 與 three.js
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    AC: AC, T: T, D: D, state: state,
    reducedMotion: reducedMotion,
    colors: function () { return C; },
    segColor: segColor,
    shown: shownNote,
    level: shownLevel,
    phase: shownPhase,
    cursor: function () { return cursorTime(shownNote()); },
    active: function () { return !!(cur && !cur.done); },
    num: num, sec: sec, phaseName: phaseName,
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Adsr3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Adsr3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/adsr-envelope-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Adsr3D) throw new Error('adsr-envelope-3d.js did not load');
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
        view3 = window.Adsr3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        emit('view3d', { on: true, high: state.high });
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
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // 給測試用的介面（不影響畫面）
  window.__adsr = {
    state: state, notes: function () { return notes; }, cur: function () { return cur; }, view: function () { return view3; },
    applyPreset: applyPreset, press: press, unpress: unpress, stopAll: stopAll, emitEnv: emitEnv
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  setSlider(elA, P0.A); setSlider(elD, P0.D); setSlider(elR, P0.R); setSlider(elH, P0.H);
  state.A = P0.A; state.D = P0.D; state.R = P0.R; state.H = P0.H;
  state.touched = false; state.edited = false;
  updateSoundButton();
  refreshKeys();
  updateReadouts();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    eqKey = '';
    updateReadouts();
    updateSoundButton();
    keyBtns.forEach(function (b, i) { const k = AC.KEYS[i]; b.setAttribute('aria-label', k.name + T('（電腦鍵盤 ', ' (computer key ') + k.kb.toUpperCase() + T('）', ')')); });
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lw2 = 0;
    new ResizeObserver(function () {
      const a = cv.clientWidth, b = scope.clientWidth;
      if (a !== lw || b !== lw2) { lw = a; lw2 = b; resize(); }
    }).observe(stage);
  } else window.addEventListener('resize', resize);
  resize();
})();
