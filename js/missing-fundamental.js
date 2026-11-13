/* missing-fundamental.js — 「缺基頻：聽到不存在的音」的畫面、聲音與互動
 *
 * 數學在 missing-fundamental-core.js（MissingCore）；聲音一律交給 music-audio.js（MusicAudio）；繪圖工具 LabDraw（drawkit.js）。
 * 主畫布 #cv 分三格：
 *   頻譜：10 根泛音的位置，喇叭放出的實心、拿掉或被濾掉的畫虛線框；濾波器響應曲線；聽到的音高（粉紅虛線，常常在沒有任何長條的地方）。
 *     點一下長條可以開關那一根；鍵盤 ← → 選、↑ 開 ↓ 關。
 *   波形：0–20 ms，週期色帶（寬 = 1/音高）；淡色虛線是有基頻的完整音（A）。
 *   自相關：同一條時間軸，峰的位置就是週期（簡化模型）。
 * 3D（js/missing-fundamental-3d.js，第一次切到 3D 才載入）：頻譜的瀑布圖＋後方的週期牆。
 * 學生按了才發聲；音效關閉時畫面照跑，狀態列顯示提示。
 */
(function () {
  'use strict';
  const MC = window.MissingCore;
  const MT = window.MusicTheory;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha, shade = D.shade;
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const KMAX = MC.KMAX, TAU = 2 * Math.PI;
  const WIN = 0.020;          // 波形與自相關顯示 0–20 ms
  const NW = 1600;            // 波形取樣點數
  const NA = 1000;            // 自相關取樣點數
  const LOUD_RMS = 0.3, PEAK_CAP = 0.95, GAIN = 0.6;
  const PLAY_SEC = 12;        // 持續音的上限（和 MusicAudio 一樣）
  const MODAL_SEC = 4;        // 平移後（沒有 20 Hz 以上公因數）各成分獨立的正弦，每次 4 秒
  const AB_A = 1.3, AB_GAP = 0.25;   // A／B：A 播 1.3 秒，停 0.25 秒，再播 B 1.3 秒
  const HIST = 12;            // 3D 瀑布圖保留幾排
  const nowS = function () { return performance.now() / 1000; };
  const reducedMotion = function () { return D.reducedMotion(); };

  // ---------- 狀態 ----------
  const state = {
    f0: MC.DEFAULT.f0, on: MC.DEFAULT.on.slice(), low: 0, filter: 'none', cut: MC.DEFAULT.cut, delta: 0,
    sel: 1,          // 鍵盤選取的泛音
    hover: 0,
    vis: null,       // { t0, until, sound }：播放中
    ab: null         // { t0, sound }：A／B 比較中
  };
  let R = null, A = null, waveB = null, waveA = null, acfC = null;
  const history = [];
  const records = [];
  let voice = null, voiceBase = 0, voiceModal = false;
  let applying = false;

  function cs() { return { f0: state.f0, on: state.on, low: state.low, filter: state.filter, cut: state.cut, delta: state.delta }; }
  function compute() {
    R = MC.analyze(cs());
    A = MC.analyze(MC.completeState(cs()));
    waveB = sampleWave(R.enabled);
    waveA = sampleWave(A.enabled);
    acfC = R.present.length ? MC.acfCurve(R.present, 0, WIN, NA) : null;
  }
  function sampleWave(list) {
    const ys = new Float64Array(NW + 1);
    let pk = 0;
    for (let i = 0; i <= NW; i++) { const v = MC.waveAt(list, WIN * i / NW); ys[i] = v; pk = Math.max(pk, Math.abs(v)); }
    return { ys: ys, peak: pk };
  }

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const s = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'accent-soft', 'surface', 'probe',
      'mf-bar', 'mf-gone', 'mf-pitch', 'mf-wave', 'mf-full', 'mf-acf', 'mf-filt', 'mf-band']
      .forEach(function (k) { C[k] = s.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight, italic) { return (italic ? 'italic ' : '') + (weight ? weight + ' ' : '') + px + 'px ' + FONT; }

  // ---------- 數字格式 ----------
  function num(v, dec) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(dec);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function hz(f) { return f == null || !isFinite(f) ? '—' : (Math.abs(f - Math.round(f)) < 0.005 ? String(Math.round(f)) : num(f, f < 100 ? 2 : 1)); }
  function noteText(f) {
    const p = MC.pitchInfo(f, MT);
    const c = Math.round(p.cents);
    return p.name + ' ' + (c >= 0 ? '+' : '−') + Math.abs(c);
  }
  function filterName(id) { const F = MC.FILTERS[id]; return F ? T(F.zh, F.en) : id; }
  /** 音高和 f0 的關係：「= f0」「= 2 f0」… */
  function relToF0(p) {
    if (p == null) return '';
    const m = p / state.f0, r = Math.round(m);
    if (r >= 1 && Math.abs(m / r - 1) <= MC.TOL) return r === 1 ? '= f<sub>0</sub>' : '= ' + r + ' f<sub>0</sub>';
    return '= ' + num(m, 3) + ' f<sub>0</sub>';
  }

  // =====================================================================
  // 聲音（MusicAudio）
  // =====================================================================
  function soundOn() { return !!(window.LabSettings && window.LabSettings.get('sound')); }
  function audioOK() { return soundOn() && window.MusicAudio && MusicAudio.available(); }
  function startVoice(ap) {
    if (!ap) return null;
    if (ap.base) {
      voiceModal = false; voiceBase = ap.base;
      return MusicAudio.sustain({ f0: ap.base, partials: ap.partials, normalize: false, gain: GAIN, maxDur: PLAY_SEC, onEnd: onVoiceEnd });
    }
    voiceModal = true; voiceBase = 0;
    const sumA = ap.modes.reduce(function (s, m) { return s + m.a; }, 0);
    return MusicAudio.modal({ modes: ap.modes.map(function (m) { return { f: m.f, a: m.a, tau: 60 }; }), dur: MODAL_SEC, gain: GAIN * Math.min(1, sumA), attack: 0.03 });
  }
  function play() {
    stopVoices();
    state.ab = null;
    const ap = MC.audioParts(cs(), LOUD_RMS, PEAK_CAP);
    let sound = false;
    if (audioOK() && ap) { voice = startVoice(ap); sound = !!voice; }
    const dur = ap && !ap.base ? MODAL_SEC : PLAY_SEC;
    state.vis = { t0: nowS(), until: nowS() + dur, sound: sound };
    if (!ap) setStatus(T('喇叭沒有任何成分可以放：先打開幾根泛音。', 'Nothing is coming out of the speaker: switch some harmonics on first.'));
    else if (!sound) noSoundHint();
    else setStatus(playingText(ap));
    emit('play', MC.missionData(cs()));
    afterSound();
  }
  function noSoundHint() {
    if (!soundOn()) { setStatus(window.MusicAudio ? MusicAudio.offHint() : ''); if (window.MusicAudio) MusicAudio.flashSoundButton(); }
    else setStatus(T('這個瀏覽器不能播放網頁聲音；畫面照常顯示。', 'This browser cannot play web audio; the pictures work as usual.'));
  }
  function playingText(ap) {
    const p = R.pitch;
    const s = p ? T('，聽到的音高約 ' + hz(p) + ' Hz', '; the pitch heard is about ' + hz(p) + ' Hz') : '';
    if (ap && !ap.base) return T('播放中（4 秒）：' + R.enabled.length + ' 根各自的正弦' + s + '。', 'Playing (4 s): ' + R.enabled.length + ' separate sines' + s + '.');
    return T('播放中' + s + '。拖曳滑桿、開關泛音，聲音會跟著變；按「■ 停止」或 Esc 停止。', 'Playing' + s + '. Move the sliders or switch harmonics and the sound follows; press “■ Stop” or Esc to stop.');
  }
  function onVoiceEnd() {
    voice = null;
    state.vis = null;
    setStatus(T('播完了：每次最長播 12 秒。再按「▶ 播放」可以再聽。', 'Finished: each play lasts at most 12 seconds. Press “▶ Play” to hear it again.'));
    afterSound();
  }
  let retrig = 0;
  /** 播放中改了設定：同一個公因數就直接換泛音；否則重新起音（最快每 0.15 秒一次） */
  function updateVoice() {
    if (!state.vis || !state.vis.sound || state.ab) return;
    const ap = MC.audioParts(cs(), LOUD_RMS, PEAK_CAP);
    if (!ap) { stopVoices(); state.vis = null; setStatus(T('所有成分都拿掉了，聲音停止。', 'Every component is gone, so the sound stopped.')); afterSound(); return; }
    if (voice && voice.playing && !voiceModal && ap.base && ap.base === voiceBase) { voice.set({ partials: ap.partials }, 0.04); return; }
    clearTimeout(retrig);
    retrig = setTimeout(function () {
      if (!state.vis || !state.vis.sound || state.ab) return;
      const a2 = MC.audioParts(cs(), LOUD_RMS, PEAK_CAP);
      if (!a2) return;
      if (voice) { const v = voice; voice = null; v.stop(0.03); }
      voice = startVoice(a2);
      state.vis.until = nowS() + (a2.base ? PLAY_SEC : MODAL_SEC);
      setStatus(playingText(a2));
      afterSound();
    }, 150);
  }
  /** A／B 比較：A = 有基頻的完整音（不濾波、不平移），B = 目前的聲音 */
  function playAB() {
    stopVoices();
    state.vis = null;
    const apA = MC.audioParts(MC.completeState(cs()), LOUD_RMS, PEAK_CAP);
    const apB = MC.audioParts(cs(), LOUD_RMS, PEAK_CAP);
    let sound = false;
    if (audioOK() && apA && MusicAudio.context()) {
      const t0 = MusicAudio.now() + 0.05;
      sound = !!MusicAudio.tone({ f0: apA.base, partials: apA.partials, normalize: false, gain: GAIN, dur: AB_A, at: t0, attack: 0.03, release: 0.1 });
      if (apB) {
        const tB = t0 + AB_A + AB_GAP;
        if (apB.base) MusicAudio.tone({ f0: apB.base, partials: apB.partials, normalize: false, gain: GAIN, dur: AB_A, at: tB, attack: 0.03, release: 0.1 });
        else {
          const sumA = apB.modes.reduce(function (s, m) { return s + m.a; }, 0);
          MusicAudio.modal({ modes: apB.modes.map(function (m) { return { f: m.f, a: m.a, tau: 60 }; }), dur: AB_A, at: tB, gain: GAIN * Math.min(1, sumA), attack: 0.03 });
        }
      }
    }
    state.ab = { t0: nowS() + 0.05, sound: sound };
    if (!sound) noSoundHint();
    else setStatus(T('A：完整音（有基頻）…… 接著 B：目前的聲音。比比看音高有沒有變。', 'A: the complete tone (with its fundamental)… then B: the current sound. Does the pitch change?'));
    emit('ab', MC.missionData(cs()));
    say(T('A 與 B 的音高：' + hz(A.pitch) + ' Hz 與 ' + hz(R.pitch) + ' Hz。', 'Pitch of A and B: ' + hz(A.pitch) + ' Hz and ' + hz(R.pitch) + ' Hz.'));
    afterSound();
  }
  function abPhase() {
    const ab = state.ab;
    if (!ab) return null;
    const t = nowS() - ab.t0;
    if (t < 0) return 'A';
    if (t < AB_A) return 'A';
    if (t < AB_A + AB_GAP) return 'gap';
    if (t < 2 * AB_A + AB_GAP) return 'B';
    return 'end';
  }
  function stopVoices() {
    if (voice) { const v = voice; voice = null; v.stop(0.06); }
    if (window.MusicAudio) MusicAudio.stopAll(0.06);
  }
  function stopAll(msg) {
    clearTimeout(retrig);
    state.vis = null; state.ab = null;
    stopVoices();
    if (msg !== false) setStatus(T('已停止。', 'Stopped.'));
    afterSound();
  }
  function afterSound() { updateButtons(); updateHF(); requestDraw(); }
  function updateButtons() {
    const busy = !!(state.vis || state.ab || (window.MusicAudio && MusicAudio.playing()));
    $('stop').disabled = !busy;
    $('ab').setAttribute('data-run', state.ab ? '1' : '0');
  }
  function updateHF() {
    const top = R.enabled.reduce(function (m, c) { return Math.max(m, c.f); }, 0);
    const on = !!(state.vis || state.ab) && top >= 4000;
    const w = $('hfWarn');
    if (w.hidden === on) w.hidden = !on;
  }
  function setStatus(s) { $('status').textContent = s; }
  function say(s) { const el = $('say'); el.textContent = ''; setTimeout(function () { el.textContent = s; }, 30); }

  // =====================================================================
  // 畫布與版面
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 560, LY = null;
  function layout() {
    const nar = cw < 600;
    const L = nar ? 38 : 50, Rr = cw - (nar ? 10 : 16);
    const t1 = nar ? 46 : 40, h1 = nar ? 150 : 172;
    const b1 = t1 + h1;
    const t2 = b1 + (nar ? 62 : 58), h2 = nar ? 118 : 138;
    const b2 = t2 + h2;
    const t3 = b2 + (nar ? 50 : 50), h3 = nar ? 104 : 116;
    const b3 = t3 + h3;
    return { nar: nar, L: L, R: Rr, t1: t1, b1: b1, t2: t2, b2: b2, t3: t3, b3: b3, H: b3 + 26 };
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = cv.clientWidth || $('stage').clientWidth - 22;
    if (w > 0) {
      cw = w;
      LY = layout();
      ch = LY.H;
      if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
      cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    }
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
  function fmaxOf() { return Math.ceil((KMAX * state.f0 + Math.max(0, state.delta) + 0.45 * state.f0) / 500) * 500; }
  function hzShort(f) { return f < 1000 ? String(Math.round(f)) : (f / 1000).toFixed(f % 1000 === 0 ? 0 : 1) + 'k'; }

  // ---------------- 頻譜 ----------------
  let SP = null;   // 頻譜的座標（點擊判定用）
  function drawSpectrum(c) {
    const Ly = LY, nar = Ly.nar, L = Ly.L, Rr = Ly.R, Tp = Ly.t1, Bt = Ly.b1;
    const fmax = fmaxOf();
    const X = function (f) { return L + f / fmax * (Rr - L); };
    const H = Bt - Tp - 14;
    const Y = function (v) { return Bt - v * H; };
    SP = { X: X, fmax: fmax, Tp: Tp, Bt: Bt, L: L, R: Rr };
    plotPanel(c, L, Tp, Rr, Bt);
    // 格線：每 500 Hz（每 1000 Hz 較深）
    for (let f = 500; f < fmax; f += 500) vline(c, Math.round(X(f)) + 0.5, Tp + 1, Bt - 1, alpha(C.text, f % 1000 ? 0.04 : 0.09), 1);
    [0.25, 0.5, 0.75, 1].forEach(function (v) { hline(c, L + 1, Rr - 1, Math.round(Y(v)) + 0.5, alpha(C.text, v === 1 || v === 0.5 ? 0.08 : 0.04), 1); });
    hline(c, L, Rr, Bt + 0.5, alpha(C.text, 0.35), 1);
    D.haloText(c, '0', L - 6, Y(0), C.muted, 'right', 'middle', fnt(nar ? 10.5 : 11.5));
    D.haloText(c, '1', L - 6, Y(1), C.muted, 'right', 'middle', fnt(nar ? 10.5 : 11.5));
    // 頻率刻度
    const step = fmax > 3000 && nar ? 1000 : 500;
    for (let f = 0; f <= fmax; f += step) D.haloText(c, f === 0 ? '0' : hzShort(f), X(f), Bt + 12, C.muted, f === 0 ? 'left' : 'center', 'middle', fnt(nar ? 10 : 11));
    D.haloText(c, 'Hz', Rr, Bt + 26, C.muted, 'right', 'middle', fnt(nar ? 10 : 11));

    // 濾波器：響應曲線與「放不出來」的區域
    if (state.filter !== 'none') {
      c.save();
      c.beginPath();
      let started = false, xCut = null;
      for (let i = 0; i <= 300; i++) {
        const f = Math.max(1, fmax * i / 300), g = MC.gainAt(f, state.filter, state.cut);
        if (xCut == null && g >= MC.PRESENT_GAIN) xCut = X(f);
        const x = X(f), y = Y(g);
        if (!started) { c.moveTo(x, y); started = true; } else c.lineTo(x, y);
      }
      // 放不出來的區域（|H| < 0.1）
      if (xCut != null && xCut > L + 2) {
        c.save();
        c.fillStyle = alpha(C['mf-filt'], D.dark ? 0.10 : 0.08);
        c.fillRect(L + 1, Tp + 1, xCut - L - 1, Bt - Tp - 2);
        c.restore();
      }
      const lpHi = MC.FILTERS[state.filter].lp;
      if (lpHi) {
        let xHi = null;
        for (let i = 300; i >= 0; i--) { const f = fmax * i / 300; if (MC.gainAt(f, state.filter, state.cut) >= MC.PRESENT_GAIN) { xHi = X(f); break; } }
        if (xHi != null && xHi < Rr - 2) { c.fillStyle = alpha(C['mf-filt'], D.dark ? 0.10 : 0.08); c.fillRect(xHi, Tp + 1, Rr - 1 - xHi, Bt - Tp - 2); }
      }
      c.setLineDash([6, 4]); c.strokeStyle = alpha(C['mf-filt'], 0.95); c.lineWidth = 1.8; c.lineJoin = 'round'; c.stroke();
      c.restore();
      if (xCut != null && xCut > L + 40) D.pill(c, T('放不出來', 'blocked'), Math.max(L + 4, xCut - 4), Bt - 6, C['mf-filt'], 'right', fnt(nar ? 10 : 11, 600));
    }

    // 聽到的音高：梳子刻度（音高的整數倍）與粉紅色的「幽靈」柱
    const p = R.pitch;
    if (p && p <= fmax) {
      c.save();
      c.fillStyle = alpha(C['mf-pitch'], 0.7);
      for (let m = 1; m * p <= fmax; m++) {
        const x = X(m * p);
        c.beginPath(); c.moveTo(x, Bt - 1); c.lineTo(x - 3.5, Bt + 4); c.lineTo(x + 3.5, Bt + 4); c.closePath(); c.fill();
      }
      c.restore();
      const xp = X(p);
      const gw = Math.max(6, Math.min(18, (Rr - L) / 60));
      const g = c.createLinearGradient(0, Tp, 0, Bt);
      g.addColorStop(0, alpha(C['mf-pitch'], 0));
      g.addColorStop(1, alpha(C['mf-pitch'], D.dark ? 0.32 : 0.22));
      c.fillStyle = g;
      D.roundRect(c, xp - gw / 2, Tp + 14, gw, Bt - Tp - 14, 3); c.fill();
      vline(c, xp, Tp + 2, Bt, alpha(C['mf-pitch'], 0.95), 1.8, [5, 4]);
    }

    // 10 根泛音
    const col = (X(state.f0) - X(0));
    const bw = Math.max(5, Math.min(col * 0.5, nar ? 16 : 22));
    R.comps.forEach(function (cmp) {
      if (cmp.f < MC.F_AUDIBLE || cmp.f > fmax) return;
      const x = X(cmp.f), x0 = x - bw / 2;
      const top0 = Y(cmp.a0), topA = Y(cmp.a);
      const sel = kb && kb.focused() && state.sel === cmp.k;
      if (cmp.present) {
        // 投影
        D.roundRect(c, x0 + 1.5, topA + 2.5, bw, Bt - topA - 2, Math.min(4, bw / 3));
        c.fillStyle = D.shadowInk(D.dark ? 0.35 : 0.12); c.fill();
        D.roundRect(c, x0, topA, bw, Bt - topA, Math.min(4, bw / 3));
        const gr = c.createLinearGradient(0, topA, 0, Bt);
        gr.addColorStop(0, shade(C['mf-bar'], 0.22)); gr.addColorStop(1, shade(C['mf-bar'], -0.18));
        c.fillStyle = gr; c.fill();
        c.strokeStyle = shade(C['mf-bar'], -0.3); c.lineWidth = 1; c.stroke();
        if (Bt - topA > 3) hline(c, x0 + 2, x0 + bw - 2, topA + 1.5, alpha(shade(C['mf-bar'], 0.7), D.dark ? 0.5 : 0.75), 1.2);
        // 濾波器壓掉的部分（虛線框）
        if (cmp.gain < 0.97) {
          c.save(); c.setLineDash([3, 3]); D.roundRect(c, x0, top0, bw, topA - top0, Math.min(3, bw / 3));
          c.strokeStyle = alpha(C['mf-filt'], 0.75); c.lineWidth = 1; c.stroke(); c.restore();
        }
      } else {
        // 拿掉的或被濾掉的：虛線框（原本的高度）
        D.roundRect(c, x0, top0, bw, Bt - top0, Math.min(4, bw / 3));
        c.fillStyle = alpha(C['mf-gone'], D.dark ? 0.10 : 0.08); c.fill();
        c.save(); c.setLineDash([3, 3]);
        c.strokeStyle = alpha(cmp.why === 'filter' ? C['mf-filt'] : C['mf-gone'], 0.85); c.lineWidth = 1.2; c.stroke(); c.restore();
        if (cmp.why === 'filter' && cmp.a > 0.002) {
          D.roundRect(c, x0 + 1, Y(cmp.a), bw - 2, Bt - Y(cmp.a), 2);
          c.fillStyle = alpha(C['mf-bar'], 0.5); c.fill();
        }
        // 叉叉
        if (cmp.why === 'off' || cmp.why === 'low') {
          const cy = top0 + Math.min(10, (Bt - top0) / 2), r = Math.min(4, bw / 3);
          c.save(); c.strokeStyle = alpha(C['mf-gone'], 0.95); c.lineWidth = 1.5; c.lineCap = 'round';
          c.beginPath(); c.moveTo(x - r, cy - r); c.lineTo(x + r, cy + r); c.moveTo(x + r, cy - r); c.lineTo(x - r, cy + r); c.stroke(); c.restore();
        }
      }
      // 泛音次數（長條上方）
      D.haloText(c, String(cmp.k), x, top0 - 7, cmp.present ? shade(C['mf-bar'], D.dark ? 0.15 : -0.15) : C.muted, 'center', 'alphabetic', fnt(nar ? 10 : 11, cmp.present ? 700 : 500));
      if (sel) {
        c.save(); c.setLineDash([4, 3]);
        D.roundRect(c, x0 - 4, Math.min(top0, Y(1)) - 18, bw + 8, Bt - Math.min(top0, Y(1)) + 22, 5);
        c.strokeStyle = C.accent; c.lineWidth = 2; c.stroke(); c.restore();
      }
    });

    // 標籤：聽到的音高
    if (p) {
      const out = p > fmax;
      const s = T('聽到的音高 ', 'Pitch heard ') + hz(p) + ' Hz' + (R.missing ? T('（這裡沒有聲音）', ' (nothing here)') : '');
      c.font = fnt(nar ? 11 : 12, 700);
      const w = c.measureText(s).width + 12;
      const xp = out ? Rr : X(p);
      const px = Math.max(L + w / 2 + 2, Math.min(Rr - w / 2 - 2, xp));
      D.pill(c, s, px, Tp + 16, C['mf-pitch'], 'center', fnt(nar ? 11 : 12, 700));
    }
    // 標題
    D.pill(c, (nar ? T('頻譜：喇叭放出的成分（點長條開關）', 'Spectrum (tap a bar to switch it)') : T('頻譜：喇叭真正放出的成分（點長條可以開關）', 'Spectrum: what the speaker really plays (tap a bar to switch it)')), L - (nar ? 34 : 44) + 6, Tp - 10, C.text, 'left', fnt(nar ? 11 : 12.5, 600));
  }

  // ---------------- 波形 ----------------
  function drawWave(c) {
    const Ly = LY, nar = Ly.nar, L = Ly.L, Rr = Ly.R, Tp = Ly.t2, Bt = Ly.b2;
    const X = function (t) { return L + t / WIN * (Rr - L); };
    const mid = (Tp + Bt) / 2, half = (Bt - Tp) / 2 - 6;
    plotPanel(c, L, Tp, Rr, Bt);
    // 週期色帶
    const p = R.pitch;
    if (p) {
      const Tper = 1 / p;
      c.save();
      for (let n = 0; n * Tper < WIN; n++) {
        const xa = X(n * Tper), xb = Math.min(Rr, X((n + 1) * Tper));
        if (n % 2 === 0) { c.fillStyle = alpha(C['mf-band'], D.dark ? 0.13 : 0.10); c.fillRect(xa, Tp + 1, xb - xa, Bt - Tp - 2); }
        if (n > 0) vline(c, Math.round(xa) + 0.5, Tp + 1, Bt - 1, alpha(C['mf-band'], 0.55), 1);
      }
      c.restore();
    }
    hline(c, L, Rr, mid, alpha(C.text, 0.28), 1);
    msTicks(c, X, Bt, nar);
    const phase = abPhase();
    const pathOf = function (wv) {
      const k = wv.peak > 0 ? half / wv.peak : 0;
      return function (cc) { for (let i = 0; i <= NW; i++) { const x = X(WIN * i / NW), y = mid - wv.ys[i] * k; if (i) cc.lineTo(x, y); else cc.moveTo(x, y); } };
    };
    // 完整音 A（淡色虛線）
    if (waveA.peak > 0) {
      c.save(); c.beginPath(); pathOf(waveA)(c);
      c.setLineDash(phase === 'A' ? [] : [5, 4]);
      c.strokeStyle = alpha(C['mf-full'], phase === 'A' ? 0.95 : 0.6); c.lineWidth = phase === 'A' ? 2.4 : 1.3; c.lineJoin = 'round'; c.stroke();
      c.restore();
    }
    // 目前的聲音 B
    if (waveB.peak > 0) {
      if (phase === 'A') { c.save(); c.beginPath(); pathOf(waveB)(c); c.strokeStyle = alpha(C['mf-wave'], 0.35); c.lineWidth = 1.4; c.stroke(); c.restore(); }
      else D.tube(c, pathOf(waveB), C['mf-wave'], nar ? 2.6 : 3);
    } else {
      D.pill(c, T('沒有聲音：所有成分都拿掉了', 'Silence: every component is gone'), (L + Rr) / 2, mid - 6, C.muted, 'center', fnt(nar ? 11 : 12, 600));
    }
    // 標題與週期
    let title = nar ? T('波形（0–20 ms）', 'Waveform (0–20 ms)') : T('波形（0–20 ms，各自縮放到同樣高度）', 'Waveform (0–20 ms, each scaled to the same height)');
    if (phase === 'A') title = T('正在播 A：完整音（有基頻）', 'Now playing A: the complete tone (with fundamental)');
    else if (phase === 'B' || phase === 'gap') title = T('正在播 B：目前的聲音', 'Now playing B: the current sound');
    const pb = D.pill(c, title, L - (nar ? 34 : 44) + 6, Tp - 8, phase && phase !== 'end' ? C.accent : C.text, 'left', fnt(nar ? 11 : 12.5, 600));
    if (p) {
      const s = T('週期 ', 'Period ') + num(1000 / p, 2) + ' ms';
      c.font = fnt(nar ? 11 : 12, 700);
      const w = c.measureText(s).width + 12;
      if (pb.x + pb.w + 8 + w <= Rr) D.pill(c, s, Rr, Tp - 8, C['mf-band'], 'right', fnt(nar ? 11 : 12, 700));
      else D.pill(c, s, Rr - 4, Tp + 20, C['mf-band'], 'right', fnt(nar ? 10.5 : 11.5, 700));
    }
    // 數學上真正的週期比畫面長（平移以後）
    if (R.gcd > 0 && R.period > WIN && p && Math.abs(R.period * p - 1) > 0.01) {
      D.pill(c, T('數學上真正的週期：' + num(R.period * 1000, 0) + ' ms（比畫面還長）', 'True mathematical period: ' + num(R.period * 1000, 0) + ' ms (longer than the window)'), Rr - 4, Bt - 4, C.muted, 'right', fnt(nar ? 10 : 11, 600));
    }
  }
  function msTicks(c, X, Bt, nar) {
    for (let ms = 0; ms <= 20; ms += 5) D.haloText(c, String(ms), X(ms / 1000), Bt + 11, C.muted, ms === 0 ? 'left' : ms === 20 ? 'right' : 'center', 'middle', fnt(nar ? 10 : 11));
    D.haloText(c, 'ms', X(0.0175), Bt + 11, C.muted, 'center', 'middle', fnt(nar ? 10 : 11, 600));
  }

  // ---------------- 自相關 ----------------
  function drawAcf(c) {
    const Ly = LY, nar = Ly.nar, L = Ly.L, Rr = Ly.R, Tp = Ly.t3, Bt = Ly.b3;
    const X = function (t) { return L + t / WIN * (Rr - L); };
    const mid = (Tp + Bt) / 2, half = (Bt - Tp) / 2 - 6;
    const Y = function (v) { return mid - v * half; };
    plotPanel(c, L, Tp, Rr, Bt);
    hline(c, L, Rr, mid, alpha(C.text, 0.28), 1);
    hline(c, L + 1, Rr - 1, Math.round(Y(1)) + 0.5, alpha(C.text, 0.08), 1, [2, 4]);
    D.haloText(c, '1', L - 6, Y(1), C.muted, 'right', 'middle', fnt(nar ? 10.5 : 11.5));
    D.haloText(c, '0', L - 6, mid, C.muted, 'right', 'middle', fnt(nar ? 10.5 : 11.5));
    D.haloText(c, '−1', L - 6, Y(-1), C.muted, 'right', 'middle', fnt(nar ? 10.5 : 11.5));
    msTicks(c, X, Bt, nar);
    // 1/f0 參考線
    const tf = 1 / state.f0;
    vline(c, X(tf), Tp + 1, Bt - 1, alpha(C.muted, 0.6), 1, [2, 3]);
    D.haloText(c, '1/f', X(tf) + 3, Bt - 6, C.muted, 'left', 'alphabetic', fnt(nar ? 10 : 11, 600, true));
    c.font = fnt(nar ? 10 : 11, 600, true);
    D.haloText(c, '0', X(tf) + 3 + c.measureText('1/f').width + 0.5, Bt - 3, C.muted, 'left', 'alphabetic', fnt(nar ? 7.5 : 8.5, 600));
    if (acfC) {
      D.tube(c, function (cc) { for (let i = 0; i <= NA; i++) { const x = X(WIN * i / NA), y = Y(acfC[i]); if (i) cc.lineTo(x, y); else cc.moveTo(x, y); } }, C['mf-acf'], nar ? 2.2 : 2.6);
      if (R.tau != null) {
        if (R.tau <= WIN) {
          const x = X(R.tau), y = Y(R.pitchR);
          vline(c, x, Tp + 1, Bt - 1, alpha(C['mf-pitch'], 0.8), 1.4, [5, 4]);
          D.ball(c, x, y, nar ? 5 : 6, C['mf-pitch'], { glow: D.dark ? 0.45 : 0.15 });
          const s = T('峰 ', 'Peak ') + num(R.tau * 1000, 2) + ' ms → ' + hz(R.pitch) + ' Hz';
          c.font = fnt(nar ? 11 : 12, 700);
          const w = c.measureText(s).width + 12;
          const right = x + 10 + w <= Rr;
          D.pill(c, s, right ? x + 10 : x - 10, Math.max(Tp + 18, y - 8), C['mf-pitch'], right ? 'left' : 'right', fnt(nar ? 11 : 12, 700));
        } else {
          D.pill(c, T('峰在 ', 'Peak at ') + num(R.tau * 1000, 1) + T(' ms（畫面外）→ ', ' ms (off screen) → ') + hz(R.pitch) + ' Hz', Rr - 4, Tp + 18, C['mf-pitch'], 'right', fnt(nar ? 11 : 12, 700));
        }
      }
    } else {
      D.pill(c, T('沒有成分，沒有自相關', 'No components, no autocorrelation'), (L + Rr) / 2, mid - 6, C.muted, 'center', fnt(nar ? 11 : 12, 600));
    }
    D.pill(c, (nar ? T('自相關：找週期的模型', 'Autocorrelation (period finder)') : T('自相關：大腦找週期的簡化模型', 'Autocorrelation: a simple model of how the brain finds the period')), L - (nar ? 34 : 44) + 6, Tp - 8, C.text, 'left', fnt(nar ? 11 : 12.5, 600));
  }

  // ---------------- 繪製迴圈 ----------------
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    const t = nowS();
    if (state.vis && !state.vis.sound && t >= state.vis.until) { state.vis = null; afterSound(); }
    if (state.vis && state.vis.sound && voiceModal && t >= state.vis.until) { state.vis = null; voice = null; setStatus(T('播完了（4 秒）。再按「▶ 播放」可以再聽。', 'Finished (4 s). Press “▶ Play” to hear it again.')); afterSound(); }
    const ph = abPhase();
    if (ph === 'end') { state.ab = null; afterSound(); }
    if (!stage.classList.contains('is3d') && LY) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      D.backdrop(ctx, cw, ch);
      drawSpectrum(ctx);
      drawWave(ctx);
      drawAcf(ctx);
    }
    if (!raf && (state.ab || (state.vis && !state.vis.sound) || (state.vis && voiceModal))) raf = requestAnimationFrame(frame);
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  function updateReadouts() {
    const n = R.present.length;
    setHTML('rComp', n ? R.freqs.map(function (f) { return String(f); }).join(', ') + ' Hz <small>' + T('（' + n + ' 根）', ' (' + n + ')') + '</small>' : T('沒有', 'none'));
    setHTML('rLow', R.lowest ? R.lowest + ' Hz' + (R.pitch ? ' <small>' + T('= 音高 × ', '= pitch × ') + num(R.lowest / R.pitch, 2) + '</small>' : '') : '—');
    setHTML('rGcd', R.gcd ? R.gcd + ' Hz' : '—');
    setHTML('rPer', R.period ? num(R.period * 1000, R.period < 0.1 ? 3 : 1) + ' ms' : '—');
    setHTML('rAcf', R.tau != null ? num(R.tau * 1000, 3) + ' ms <small>r = ' + num(R.pitchR, 3) + '</small>' : '—');
    setHTML('rDb', R.deBoer ? hz(R.deBoer.f) + ' Hz <small>n = ' + R.deBoer.n + '</small>' : T('—（沒有平移）', '— (no shift)'));
    let big;
    if (!R.pitch) big = T('喇叭沒有放出任何成分。', 'Nothing comes out of the speaker.');
    else {
      big = T('聽到的音高：', 'Pitch heard: ') + '<b>' + hz(R.pitch) + ' Hz</b> <small>' + noteText(R.pitch) + T(' 音分', ' cents') + '　' + relToF0(R.pitch) + '</small><br>';
      if (R.present.length === 1) big += T('只有一根成分：音高就是它自己。', 'Only one component: the pitch is simply that component.');
      else if (R.missing) big += T('喇叭<strong>沒有</strong>放出這個頻率——是耳朵從週期找出來的。', 'The speaker plays <strong>nothing</strong> at this frequency — the ear finds it from the period.');
      else big += T('喇叭有放出這個頻率。', 'The speaker does play this frequency.');
      // 平移時，殘餘音高（f0 + Δ/n）只對高次泛音成立；第 1、2 根在的話，耳朵多半直接聽到最低的那一根
      if (state.delta !== 0 && R.present.length > 1 && R.present[0].k <= 2) {
        big += '<br><span class="low-warn">' + T('注意：含第 1 或第 2 根：平移時耳朵多半直接聽到最低的成分（' + hz(R.present[0].f) + ' Hz），上面這個估計只對高次泛音準。先拿掉第 1、2 根再做位移實驗。',
          'Note: harmonic 1 or 2 is present: with a shift the ear mostly hears the lowest component itself (' + hz(R.present[0].f) + ' Hz); the estimate above only holds for high harmonics. Take harmonics 1 and 2 away before the shift experiment.') + '</span>';
      }
    }
    setHTML('rPitch', big);
    const pi = MC.pitchInfo(state.f0, MT), c0 = Math.round(pi.cents);
    setHTML('f0Note', T(pi.name + '（' + (c0 >= 0 ? '+' : '−') + Math.abs(c0) + ' 音分）・週期 ' + num(1000 / state.f0, 3) + ' ms', pi.name + ' (' + (c0 >= 0 ? '+' : '−') + Math.abs(c0) + ' cents) · period ' + num(1000 / state.f0, 3) + ' ms') +
      (state.f0 < 200 ? T('。手機小喇叭幾乎放不出這麼低的基頻。', '. A phone speaker can hardly play a fundamental this low.') : ''));
    const fn = {
      none: T('不濾波：開著的成分全部放得出來。', 'No filter: every component that is switched on comes out.'),
      speaker: T('手機小喇叭（示意）：250 Hz 以下每低一個八度小 24 dB；140 Hz 以下幾乎放不出來。', 'Phone speaker (illustrative): 24 dB weaker per octave below 250 Hz; almost nothing below 140 Hz.'),
      phone: T('電話：只傳 300–3400 Hz（傳統電話的語音頻帶）。', 'Telephone: only 300–3400 Hz passes (the traditional voice band).'),
      custom: T('自訂高通：截止頻率以下每低一個八度小 24 dB。', 'Custom high-pass: 24 dB weaker per octave below the cutoff.')
    };
    setHTML('filtNote', fn[state.filter]);
    // 泛音開關按鈕
    harmBtns.forEach(function (b, i) {
      const cmp = R.comps[i];
      const pressed = String(!!state.on[i]);
      if (b.getAttribute('aria-pressed') !== pressed) b.setAttribute('aria-pressed', pressed);
      const cut = state.on[i] && !cmp.present;
      b.classList.toggle('cut', cut);
      const sm = b.querySelector('small'), txt = cmp.f >= MC.F_AUDIBLE ? hzShort(cmp.f) : '—';
      if (sm.textContent !== txt) sm.textContent = txt;
      const why = !state.on[i] ? T('關', 'off') : cmp.why === 'low' ? T('被移除', 'removed') : cmp.why === 'filter' ? T('被濾掉', 'filtered out') : cmp.why === 'sub' ? T('低於 20 Hz', 'below 20 Hz') : T('放得出來', 'playing');
      b.setAttribute('aria-label', T('第 ' + (i + 1) + ' 根泛音，' + hz(cmp.f) + ' Hz，' + why, 'Harmonic ' + (i + 1) + ', ' + hz(cmp.f) + ' Hz, ' + why));
    });
    document.querySelectorAll('[data-filter]').forEach(function (b) {
      const on = b.getAttribute('data-filter') === state.filter;
      if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
    });
    cv.setAttribute('aria-label', canvasLabel());
  }
  function canvasLabel() {
    return T('缺基頻畫布。上：頻譜，第 1 到第 10 根泛音，喇叭放出 ' + R.present.length + ' 根；中：0 到 20 毫秒的波形；下：自相關。聽到的音高 ' + hz(R.pitch) + ' Hz。左右方向鍵選泛音，上鍵打開、下鍵關掉。',
      'Missing-fundamental canvas. Top: spectrum of harmonics 1 to 10, ' + R.present.length + ' coming out of the speaker; middle: the waveform over 0 to 20 ms; bottom: the autocorrelation. Pitch heard ' + hz(R.pitch) + ' Hz. Left and right arrows pick a harmonic, up switches it on, down switches it off.');
  }
  function refreshOutputs() {
    $('f0o').textContent = String(state.f0);
    $('lowo').textContent = String(state.low);
    $('deltao').textContent = num(state.delta, 0);
    const cut = $('cut');
    const custom = state.filter === 'custom';
    if (cut.disabled === custom) cut.disabled = !custom;
    $('cuto').textContent = custom ? String(state.cut) : state.filter === 'none' ? T('0（不濾波）', '0 (none)') : String(MC.cutoffOf(state.filter, 0));
  }
  /** 停用的截止頻率滑桿：顯示實際使用的值（不濾波 0、手機小喇叭 250、電話 300） */
  function syncCutSlider() {
    const el = $('cut');
    const v = state.filter === 'custom' ? state.cut : MC.cutoffOf(state.filter, 0);
    if (window.LabNum) window.LabNum.clear(el);
    el.value = String(v);
  }

  // =====================================================================
  // 任務事件、紀錄、3D 的歷史
  // =====================================================================
  function restoring() { return !!(window.LabShare && window.LabShare.restoring); }
  function emit(type, data) { if (window.LabMission && !restoring()) window.LabMission.emit(type, data); }
  function snapshot() {
    return { f0: state.f0, delta: state.delta, pitch: R.pitch, missing: R.missing,
      comps: R.comps.map(function (c) { return { k: c.k, f: c.f, a0: c.a0, a: c.a, present: c.present, why: c.why }; }) };
  }
  function pushHistory() {
    const s = snapshot();
    const last = history[history.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(s)) return;
    history.push(s);
    while (history.length > HIST) history.shift();
  }
  let sayTimer = 0;
  /** 使用者改完一個設定（放開滑桿、按按鈕） */
  function committed() {
    pushHistory();
    if (view3 && view3.active) view3.update();
    emit('state', MC.missionData(cs()));
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () {
      say(R.pitch ? T('聽到的音高 ' + hz(R.pitch) + ' 赫茲，喇叭放出 ' + R.present.length + ' 根成分' + (R.missing ? '，這個頻率本身並不存在。' : '。'), 'Pitch heard ' + hz(R.pitch) + ' hertz, ' + R.present.length + ' components from the speaker' + (R.missing ? '; that frequency itself is not there.' : '.'))
        : T('喇叭沒有放出任何成分。', 'Nothing comes out of the speaker.'));
    }, 700);
  }
  function afterChange() {
    compute();
    refreshOutputs();
    updateReadouts();
    updateVoice();
    updateButtons();
    updateHF();
    if (view3 && view3.active) view3.update();
    requestDraw();
  }

  // ---------- 紀錄表 ----------
  function renderRecords() {
    const body = $('recBody');
    body.innerHTML = '';
    records.forEach(function (r, i) {
      const tr = document.createElement('tr');
      const same = r.pitch && records.some(function (q, j) { return j !== i && q.pitch && Math.abs(q.pitch / r.pitch - 1) <= MC.TOL; });
      if (same) tr.className = 'same';
      tr.innerHTML = '<td>' + r.f0 + (r.delta ? '<br><small>Δ ' + num(r.delta, 0) + '</small>' : '') + '</td><td class="fr">' + (r.freqs.length ? r.freqs.join(', ') : '—') +
        '</td><td>' + (r.pitch ? hz(r.pitch) + ' Hz' + (r.missing ? ' <small>' + T('（不存在）', '(absent)') + '</small>' : '') : '—') + '</td>';
      body.appendChild(tr);
    });
    $('recTable').hidden = !records.length;
    $('recEmpty').hidden = !!records.length;
    $('clear').disabled = !records.length;
  }
  $('record').addEventListener('click', function () {
    const d = MC.missionData(cs());
    records.push(d);
    while (records.length > 8) records.shift();
    renderRecords();
    emit('record', { rows: records.slice() });
    say(T('已記錄：音高 ' + hz(d.pitch) + ' 赫茲。', 'Recorded: pitch ' + hz(d.pitch) + ' hertz.'));
  });
  $('clear').addEventListener('click', function () {
    records.length = 0;
    renderRecords();
    history.length = 0;
    pushHistory();
    if (view3 && view3.active) view3.update();
    say(T('紀錄已全部清除。', 'The log is cleared.'));
  });

  // =====================================================================
  // 控制項
  // =====================================================================
  const harmBtns = [];
  (function buildHarm() {
    const box = $('harm');
    for (let k = 1; k <= KMAX; k++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(!!state.on[k - 1]));
      b.setAttribute('data-share-skip', '');
      b.innerHTML = '<b>' + k + '</b><small></small>';
      b.addEventListener('click', function () { toggle(k); });
      box.appendChild(b);
      harmBtns.push(b);
    }
  })();
  function toggle(k, v) {
    const nv = v == null ? !state.on[k - 1] : !!v;
    if (nv === state.on[k - 1]) return false;
    state.on[k - 1] = nv;
    state.sel = k;
    if (kb && kb.index() !== k - 1) kb.select(k - 1);
    afterChange();
    committed();
    return true;
  }
  const f0el = $('f0'), lowel = $('low'), cutel = $('cut'), delel = $('delta');
  f0el.addEventListener('input', function () { if (applying) return; state.f0 = Math.round(Math.max(MC.F0_MIN, Math.min(MC.F0_MAX, val(f0el)))); afterChange(); });
  lowel.addEventListener('input', function () { if (applying) return; state.low = Math.round(Math.max(0, Math.min(KMAX - 1, val(lowel)))); afterChange(); });
  cutel.addEventListener('input', function () { if (applying || state.filter !== 'custom') return; state.cut = Math.round(Math.max(0, Math.min(MC.CUT_MAX, val(cutel)))); afterChange(); });
  delel.addEventListener('input', function () { if (applying) return; state.delta = Math.round(Math.max(MC.D_MIN, Math.min(MC.D_MAX, val(delel)))); afterChange(); });
  [f0el, lowel, cutel, delel].forEach(function (el) { el.addEventListener('change', function () { if (!applying) committed(); }); });
  document.querySelectorAll('[data-filter]').forEach(function (b) {
    b.addEventListener('click', function () {
      const id = b.getAttribute('data-filter');
      if (id === state.filter) return;
      state.filter = id;
      syncCutSlider();
      afterChange();
      committed();
    });
  });
  $('qAll').addEventListener('click', function () {
    for (let k = 0; k < KMAX; k++) state.on[k] = true;
    state.low = 0; setSlider(lowel, 0);
    afterChange(); committed();
  });
  $('qNoF').addEventListener('click', function () {
    for (let k = 0; k < KMAX; k++) state.on[k] = k > 0 && (k < 8 || state.on[k]);
    state.low = 0; setSlider(lowel, 0);
    afterChange(); committed();
  });
  function setSlider(el, v) { applying = true; if (window.LabNum) window.LabNum.set(el, v); else el.value = String(v); applying = false; }

  // 播放列
  $('play').addEventListener('click', function () { play(); });
  $('ab').addEventListener('click', function () { playAB(); });
  $('stop').addEventListener('click', function () { stopAll(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && (state.vis || state.ab)) stopAll(); });
  if (window.MusicAudio) MusicAudio.onChange(function () {
    if (voice && !voice.playing) {
      voice = null;
      if (state.vis && state.vis.sound && !voiceModal) { state.vis = null; setStatus(T('已停止。', 'Stopped.')); }
    }
    updateButtons(); updateHF(); requestDraw();
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden && (state.vis || state.ab)) stopAll(false); });

  // 音效開關（照 derivative.js）
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
      if (!ev.detail.value && ((state.vis && state.vis.sound) || (state.ab && state.ab.sound))) { state.vis = null; state.ab = null; voice = null; afterSound(); }
    }
    if (ev.detail.name === 'lang') themeChanged();
  });

  // ---------- 頻譜：點長條開關 ----------
  function harmAt(x, y) {
    if (!SP || y < SP.Tp - 4 || y > SP.Bt + 30) return 0;
    let best = 0, bd = Infinity;
    R.comps.forEach(function (c) { if (c.f < MC.F_AUDIBLE || c.f > SP.fmax) return; const d = Math.abs(SP.X(c.f) - x); if (d < bd) { bd = d; best = c.k; } });
    const tol = Math.max(14, (SP.X(state.f0) - SP.X(0)) / 2);
    return bd <= tol ? best : 0;
  }
  cv.addEventListener('click', function (e) {
    const r = cv.getBoundingClientRect();
    const k = harmAt(e.clientX - r.left, e.clientY - r.top);
    if (k) toggle(k);
  });
  cv.addEventListener('pointermove', function (e) {
    const r = cv.getBoundingClientRect();
    const k = harmAt(e.clientX - r.left, e.clientY - r.top);
    cv.style.cursor = k ? 'pointer' : 'default';
  });

  // ---------- 鍵盤（LabKeys）：左右選泛音、上開下關 ----------
  let kb = null;
  if (window.LabKeys) {
    const items = [];
    for (let i = 0; i < KMAX; i++) {
      (function (k) {
        items.push({
          name: function () { return T('第 ' + k + ' 根泛音', 'Harmonic ' + k); },
          move: function (dx, dy) {
            if (dx) {
              const j = Math.max(1, Math.min(KMAX, k + dx));
              if (j === k) return false;
              state.sel = j; kb.select(j - 1); requestDraw();
              return true;
            }
            return toggle(k, dy > 0);
          },
          describe: function () {
            const c = R.comps[state.sel - 1];
            return T('第 ' + state.sel + ' 根，' + hz(c.f) + ' Hz，' + (state.on[state.sel - 1] ? '開' : '關') + '。聽到的音高 ' + hz(R.pitch) + ' Hz。',
              'Harmonic ' + state.sel + ', ' + hz(c.f) + ' Hz, ' + (state.on[state.sel - 1] ? 'on' : 'off') + '. Pitch heard ' + hz(R.pitch) + ' Hz.');
          }
        });
      })(i + 1);
    }
    kb = window.LabKeys.attach(cv, {
      label: T('缺基頻畫布：左右方向鍵選泛音，上鍵打開、下鍵關掉；Enter 換下一根。', 'Missing-fundamental canvas: left and right arrows pick a harmonic, up switches it on and down switches it off; Enter moves to the next one.'),
      items: items,
      onChange: function () { if (kb && kb.index() + 1 !== state.sel) state.sel = kb.index() + 1; requestDraw(); }
    });
  }

  // ---------- 分享連結：泛音開關、自訂截止頻率 ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { on: state.on.map(function (b) { return b ? 1 : 0; }).join(''), c: state.cut }; },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      if (typeof o.on === 'string') for (let k = 0; k < KMAX; k++) state.on[k] = o.on.charAt(k) === '1';
      if (isFinite(+o.c)) state.cut = Math.max(0, Math.min(MC.CUT_MAX, Math.round(+o.c / 10) * 10));
      // 滑桿與濾波按鈕由分享功能還原；這裡再讀一次，確保一致
      state.f0 = Math.round(Math.max(MC.F0_MIN, Math.min(MC.F0_MAX, val(f0el))));
      state.low = Math.round(Math.max(0, Math.min(KMAX - 1, val(lowel))));
      state.delta = Math.round(Math.max(MC.D_MIN, Math.min(MC.D_MAX, val(delel))));
      syncCutSlider();
      afterChange();
      pushHistory();
    }
  });

  // =====================================================================
  // 3D 檢視：切換到 3D 時才載入 js/missing-fundamental-3d.js 與 three.js
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    MC: MC, T: T, D: D, state: state,
    reducedMotion: reducedMotion,
    colors: function () { return C; },
    analysis: function () { return R; },
    history: function () { return history; },
    waveWindow: WIN,
    num: num, hz: hz, noteText: noteText,
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
      if (window.Missing3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Missing3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/missing-fundamental-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Missing3D) throw new Error('missing-fundamental-3d.js did not load');
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
        view3 = window.Missing3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        emit('view3d', { on: true });
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
  window.__mf = { state: state, analysis: function () { return R; }, history: history, records: records, view: function () { return view3; }, toggle: toggle };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  applying = true;
  if (window.LabNum) { window.LabNum.set(f0el, MC.DEFAULT.f0); window.LabNum.set(lowel, 0); window.LabNum.set(delel, 0); }
  applying = false;
  syncCutSlider();
  compute();
  pushHistory();
  updateSoundButton();
  renderRecords();
  afterChange();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    updateReadouts();
    refreshOutputs();
    updateSoundButton();
    renderRecords();
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0;
    new ResizeObserver(function () { const a = cv.clientWidth; if (a !== lw) { lw = a; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  resize();
  void TAU;
})();
