/* harmonic-series.js — 「泛音列與音色」的畫面、聲音與互動
 *
 * 數學在 harmonic-series-core.js（HarmonicCore）；聲音一律交給 music-audio.js（MusicAudio）；繪圖工具 LabDraw（drawkit.js）。
 * 三張畫布：
 *   #cv   合成波形（2 個週期）：±均方根淡帶、峰值、各泛音分量（勾選時）、長條對上方波／鋸齒波／三角波時的理想形狀虛線、播放時的慢動作游標；
 *   #spec 頻譜：第 1–16 個泛音的振幅長條（可拖曳、鍵盤可調）、相位小圓盤、頻譜重心；
 *   #str  弦上的泛音：選取的第 k 個泛音，弦分成 k 段的駐波。
 * 3D（js/harmonic-series-3d.js，第一次切到 3D 才載入）：各泛音的正弦波沿「泛音次數」排開，正面看是波形、側面看是頻譜。
 * 學生按了才發聲；音效關閉時畫面照跑，狀態列顯示提示。
 */
(function () {
  'use strict';
  const HC = window.HarmonicCore;
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
  const KMAX = HC.KMAX, EPS = HC.EPS, TAU = 2 * Math.PI;
  const BUILD_STEP = 0.7;   // 「一個一個加上泛音」每加一個的秒數
  const VIS_SEC = 12;       // 音效關閉時，按「播放」畫面跑的秒數（和持續音的上限一樣）
  const SLOW = 0.5;         // 慢動作：畫面上每秒走 0.5 個週期（弦的第 k 個泛音每秒振動 0.5k 次，比例和真的一樣）
  const LOUD_RMS = 0.3;     // 送進聲音引擎前，把均方根調到這個值……
  const PEAK_CAP = 0.95;    // ……但各分量振幅的總和（峰值的上限）不超過這個值；兩者都和相位無關，所以換相位音量不變
  const GAIN = 0.6;
  const SHAPE_TOL = 0.02;   // 長條和方波／鋸齒波／三角波的係數相差都不超過這個值，就畫出理想形狀
  const reducedMotion = function () { return D.reducedMotion(); };
  const nowS = function () { return performance.now() / 1000; };

  // ---------- 狀態 ----------
  const state = {
    a: HC.preset(HC.DEFAULT.preset, HC.DEFAULT.f0),   // 16 個係數（可正可負；長條畫 |a|）
    f0: HC.DEFAULT.f0, N: HC.DEFAULT.N, mode: 'sine', seed: 1,
    base: HC.DEFAULT.preset, edited: false,             // 最後按的預設音色、之後有沒有動過長條
    sel: 1, showComp: false, solo: false,
    build: null,    // { list, i, upto, t0 }：一個一個加上泛音
    vis: null,      // { t0, until, sound }：播放中（畫面）
    flash: null,    // { k, t0 }：剛加入的泛音（裝飾）
    hover: 0
  };
  let R = null, RS = null, shape = null;   // 完整的分析、畫面上目前顯示的分析（加泛音途中只到 upto）、對上的理想形狀
  let voice = null;
  let applying = false;                    // 程式正在改滑桿（不要當成使用者的操作）

  // ---------- 色彩 ----------
  let C = {};
  let HCOL = [];
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'accent-soft', 'surface', 'probe',
      'hs-wave', 'hs-low', 'hs-high', 'hs-ideal', 'hs-cent', 'hs-string']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    HCOL = [];
    for (let k = 1; k <= KMAX; k++) HCOL[k] = D.mix(C['hs-low'], C['hs-high'], (k - 1) / (KMAX - 1));
  }
  function harmColor(k) { return HCOL[Math.max(1, Math.min(KMAX, k))] || C.accent; }
  function fnt(px, weight, italic) { return (italic ? 'italic ' : '') + (weight ? weight + ' ' : '') + px + 'px ' + FONT; }

  // ---------- 數字格式 ----------
  function num(v, dec) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(dec);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function hz(f) { return f == null || !isFinite(f) ? '—' : (f < 100 ? num(f, 1) : num(f, 0)); }
  function hzShort(f) { return f < 1000 ? String(Math.round(f)) : (f / 1000).toFixed(f < 9995 ? 2 : 1).replace(/\.?0+$/, '') + 'k'; }
  function noteOf(f) { return HC.pitchInfo(f, MT); }
  function noteText(f) {
    const p = noteOf(f);
    const c = Math.round(p.cents);
    return p.name + ' ' + (c >= 0 ? '+' : '−') + Math.abs(c);
  }
  function presetName(id) { const p = HC.PRESETS[id]; return p ? T(p.zh, p.en) : id; }

  // ---------- 計算 ----------
  function shownN() { return state.build ? state.build.upto : state.N; }
  function compute() {
    R = HC.analyze(state.a, state.N, state.mode, state.seed, state.f0);
    RS = state.build ? HC.analyze(state.a, state.build.upto, state.mode, state.seed, state.f0) : R;
    shape = detectShape();
  }
  /** 同相時，長條是不是對上方波、三角波、鋸齒波（上升）或鋸齒波（下降，係數全正）的形狀；對上就回傳理想波形 */
  function detectShape() {
    if (state.mode !== 'sine' || RS.comp.length < 2) return null;
    const n = shownN(), a1 = state.a[0];
    let best = null;
    ['square', 'triangle', 'sawtooth', 'sawPlus'].forEach(function (kind) {
      const e = HC.shapeError(state.a, n, kind);
      if (e <= SHAPE_TOL && (!best || e < best.e)) best = { kind: kind, e: e };
    });
    if (!best) return null;
    let A, fn;
    if (best.kind === 'square') { A = a1 / HC.squareCoef(1); fn = function (t) { return A * HC.idealWave('square', t); }; }
    else if (best.kind === 'triangle') { A = a1 / HC.triangleCoef(1); fn = function (t) { return A * HC.idealWave('triangle', t); }; }
    else if (best.kind === 'sawtooth') { A = a1 / HC.sawCoef(1); fn = function (t) { return A * HC.idealWave('sawtooth', t); }; }
    else { A = a1 * Math.PI / 2; fn = function (t) { const u = t - Math.floor(t); return u === 0 ? 0 : A * (1 - 2 * u); }; }
    return { kind: best.kind, A: A, fn: fn };
  }
  function shapeName(kind) {
    return kind === 'square' ? T('方波', 'square wave') : kind === 'triangle' ? T('三角波', 'triangle wave')
      : kind === 'sawtooth' ? T('鋸齒波', 'sawtooth wave') : T('鋸齒波（往下）', 'sawtooth wave (falling)');
  }

  // =====================================================================
  // 聲音（MusicAudio）
  // =====================================================================
  /** 送進聲音引擎的泛音：畫面上目前顯示的分量（或「只聽這一個」），音量依均方根調整、峰值有上限 */
  function audioPartials() {
    const comp = state.solo ? soloComp() : RS.comp;
    if (!comp.length) return [];
    let sumAbs = 0, ms = 0;
    comp.forEach(function (x) { sumAbs += Math.abs(x.c); ms += x.c * x.c / 2; });
    const s = Math.min(LOUD_RMS / Math.sqrt(ms), PEAK_CAP / sumAbs);
    return comp.map(function (x) { return { k: x.k, a: x.c * s, p: x.p }; });
  }
  /** 「只聽這一個」：選取的泛音（超過 N 或振幅是 0 時沒有聲音） */
  function soloComp() {
    const k = state.sel, a = state.a[k - 1] || 0;
    if (k > state.N || Math.abs(a) < EPS) return [];
    return [{ k: k, c: Math.abs(a), p: state.mode === 'random' ? HC.randomPhases(state.seed)[k - 1] : (a < 0 ? Math.PI : 0) }];
  }
  function topHz() {
    if (state.solo) return soloComp().length ? state.sel * state.f0 : 0;
    return RS.comp.length ? RS.topK * state.f0 : 0;
  }
  function soundOn() { return !!(window.LabSettings && window.LabSettings.get('sound')); }
  function updateVoice() {
    if (voice && voice.playing) voice.set({ f0: state.f0, partials: audioPartials() }, 0.04);
    updateHF();
  }
  function play(maxDur) {
    const dur = maxDur || VIS_SEC;
    if (voice) { const v = voice; voice = null; v.stop(0.04); }
    if (soundOn() && window.MusicAudio && MusicAudio.available()) {
      voice = MusicAudio.sustain({ f0: state.f0, partials: audioPartials(), normalize: false, gain: GAIN, maxDur: dur,
        onEnd: function () { onVoiceEnd(); } });
    }
    state.vis = { t0: nowS(), until: nowS() + dur, sound: !!voice };
    if (!voice) {
      if (!soundOn()) { setStatus(window.MusicAudio ? MusicAudio.offHint() : ''); if (window.MusicAudio) MusicAudio.flashSoundButton(); }
      else setStatus(T('這個瀏覽器不能播放網頁聲音；畫面照常顯示。', 'This browser cannot play web audio; the pictures work as usual.'));
    } else setStatus(playingText());
    updateHF();
    updateButtons();
    requestDraw();
  }
  function playingText() {
    if (state.solo) {
      if (!soloComp().length) return T('只聽第 ' + state.sel + ' 個泛音：它的振幅是 0（或超過泛音數 N），所以沒有聲音。', 'Harmonic ' + state.sel + ' only: its amplitude is 0 (or it is beyond N), so there is no sound.');
      return T('播放中：只有第 ' + state.sel + ' 個泛音（' + hz(state.sel * state.f0) + ' Hz）。', 'Playing: harmonic ' + state.sel + ' only (' + hz(state.sel * state.f0) + ' Hz).');
    }
    return T('播放中：' + hz(state.f0) + ' Hz 的' + (state.edited ? '自訂音色' : presetName(state.base)) + '。按「■ 停止」或 Esc 停止。',
      'Playing: ' + (state.edited ? 'your own tone' : presetName(state.base)) + ' at ' + hz(state.f0) + ' Hz. Press “■ Stop” or Esc to stop.');
  }
  /** 持續音時間到（MusicAudio 的上限：純音 4 秒，其他 12 秒） */
  function onVoiceEnd() {
    voice = null;
    state.vis = null;
    cancelBuild(true);
    const pure = state.solo || RS.comp.length <= 1;
    setStatus(pure ? T('播完了：純音每次最長播 4 秒（保護聽力）。再按「▶ 播放」可以再聽。', 'Finished: a pure tone plays for at most 4 seconds (to protect hearing). Press “▶ Play” to hear it again.')
      : T('播完了：每次最長播 12 秒。再按「▶ 播放」可以再聽。', 'Finished: each play lasts at most 12 seconds. Press “▶ Play” to hear it again.'));
    updateButtons();
    updateHF();
    requestDraw();
  }
  function stopAll(msg) {
    cancelBuild(true);
    state.vis = null;
    if (voice) { const v = voice; voice = null; v.stop(0.08); }
    if (window.MusicAudio) MusicAudio.stopAll(0.08);
    if (msg !== false) setStatus(T('已停止。', 'Stopped.'));
    updateButtons();
    requestDraw();
  }
  function updateButtons() {
    const busy = !!(state.vis || state.build || (window.MusicAudio && MusicAudio.playing()));
    $('stop').disabled = !busy;
    const b = $('build');
    b.setAttribute('data-run', state.build ? '1' : '0');
    b.textContent = state.build ? T('■ 停止加入（直接全部顯示）', '■ Stop adding (show them all)') : T('一個一個加上泛音', 'Add harmonics one by one');
  }
  function updateHF() {
    const on = !!(state.vis || state.build) && topHz() >= 4000;
    const w = $('hfWarn');
    if (w.hidden === on) w.hidden = !on;
  }
  let statusTimer = 0;
  function setStatus(s) {
    const el = $('status');
    clearTimeout(statusTimer);
    el.textContent = s;
  }
  function say(s) { const el = $('say'); el.textContent = ''; setTimeout(function () { el.textContent = s; }, 30); }

  // ---------- 一個一個加上泛音 ----------
  function startBuild() {
    const list = R.active.slice();
    if (!list.length) { setStatus(T('所有長條都是 0，沒有泛音可以加。', 'Every bar is at 0, so there is nothing to add.')); return; }
    state.build = { list: list, i: 1, upto: list[0], t0: nowS() };
    state.flash = { k: list[0], t0: nowS() };
    compute();
    play(Math.min(15, Math.max(4, list.length * BUILD_STEP + 3)));
    setStatus(T('從基頻開始，每 0.7 秒加入下一個泛音（共 ' + list.length + ' 個）。', 'Starting from the bottom, the next harmonic joins every 0.7 seconds (' + list.length + ' in all).'));
    afterChange(false);
  }
  function stepBuild(t) {
    const b = state.build;
    if (!b) return;
    const i = 1 + Math.floor((t - b.t0) / BUILD_STEP);
    if (i > b.list.length) { finishBuild(); return; }
    if (i !== b.i) {
      b.i = i; b.upto = b.list[i - 1];
      state.flash = { k: b.upto, t0: t };
      compute();
      updateVoice();
      afterChange(false);
    }
  }
  function finishBuild() {
    const b = state.build;
    state.build = null;
    compute();
    updateVoice();
    afterChange(false);
    setStatus(T('全部 ' + b.list.length + ' 個泛音都加上了：音高一直沒變，變的是音色。', 'All ' + b.list.length + ' harmonics are in: the pitch never changed — the timbre did.'));
    say(T('全部 ' + b.list.length + ' 個泛音都加上了。', 'All ' + b.list.length + ' harmonics are in.'));
    emit('build', { done: true, N: state.N, n: b.list.length, preset: state.base, edited: state.edited });
  }
  function cancelBuild(quiet) {
    if (!state.build) return;
    state.build = null;
    compute();
    updateVoice();
    if (!quiet) afterChange(false);
    updateButtons();
  }

  // =====================================================================
  // 畫布與版面
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const spec = $('spec'), sctx = spec.getContext('2d');
  const str = $('str'), tctx = str.getContext('2d');
  let dpr = 1, cw = 300, ch = 300, sw = 300, sh = 230, tw = 300, th = 120;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = cv.clientWidth || $('stage').clientWidth - 22;
    if (w > 0) {
      cw = w;
      const nar = cw < 600;
      ch = Math.round(nar ? Math.max(220, Math.min(cw * 0.66, 280)) : Math.max(260, Math.min(cw * 0.42, 330)));
      if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
      cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    }
    sw = spec.clientWidth || cw;
    sh = sw < 600 ? 226 : 240;
    if (spec.style.height !== sh + 'px') spec.style.height = sh + 'px';
    spec.width = Math.round(sw * dpr); spec.height = Math.round(sh * dpr);
    tw = str.clientWidth || cw;
    th = tw < 600 ? 128 : 124;
    if (str.style.height !== th + 'px') str.style.height = th + 'px';
    str.width = Math.round(tw * dpr); str.height = Math.round(th * dpr);
    requestDraw();
  }

  // ---------- 共用小工具 ----------
  function plotPanel(c, x0, y0, x1, y1) {
    D.roundRect(c, x0, y0, x1 - x0, y1 - y0, 6);
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, alpha(C.text, D.dark ? 0.035 : 0.018));
    g.addColorStop(1, alpha(C.text, D.dark ? 0.015 : 0.035));
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = alpha(C.text, D.dark ? 0.16 : 0.12);
    c.lineWidth = 1;
    c.stroke();
  }
  function hline(c, x0, x1, y, color, width, dash) {
    c.save(); c.beginPath(); if (dash) c.setLineDash(dash);
    c.moveTo(x0, y); c.lineTo(x1, y); c.strokeStyle = color; c.lineWidth = width || 1; c.stroke(); c.restore();
  }
  function vline(c, x, y0, y1, color, width, dash) {
    c.save(); c.beginPath(); if (dash) c.setLineDash(dash);
    c.moveTo(x, y0); c.lineTo(x, y1); c.strokeStyle = color; c.lineWidth = width || 1; c.stroke(); c.restore();
  }
  function niceMax(v) {
    const steps = [0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20];
    for (let i = 0; i < steps.length; i++) if (v <= steps[i]) return steps[i];
    return Math.ceil(v / 5) * 5;
  }
  function tickLabel(v) { return Math.abs(v) < 1e-9 ? '0' : String(+v.toFixed(3)).replace('-', '−'); }

  // =====================================================================
  // 波形畫布
  // =====================================================================
  function drawWave() {
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, cw, ch);
    const nar = cw < 600;
    const L = nar ? 40 : 50, Rr = cw - (nar ? 10 : 16), Tp = nar ? 34 : 38, Bt = ch - (nar ? 26 : 28);
    const mid = (Tp + Bt) / 2, half = (Bt - Tp) / 2;
    const comp = RS.comp;
    let need = Math.max(RS.peak, shape ? Math.abs(shape.A) : 0, 0.05);
    if (state.showComp || state.solo) comp.forEach(function (x) { need = Math.max(need, Math.abs(x.c)); });
    const ymax = niceMax(need * 1.08);
    const X = function (t) { return L + t / 2 * (Rr - L); };
    const Y = function (v) { return mid - v / ymax * half; };

    plotPanel(c, L, Tp, Rr, Bt);
    // 格線：每 T/4 一條（T/2 較深）；縱向每 ymax/4
    c.save();
    c.beginPath();
    for (let i = 1; i < 8; i++) { if (i % 2) { const x = Math.round(X(i / 4) * dpr) / dpr + 0.5 / dpr; c.moveTo(x, Tp); c.lineTo(x, Bt); } }
    for (let j = -3; j <= 3; j += 2) { const y = Math.round(Y(j * ymax / 4) * dpr) / dpr + 0.5 / dpr; c.moveTo(L, y); c.lineTo(Rr, y); }
    c.strokeStyle = alpha(C.text, D.dark ? 0.05 : 0.04); c.lineWidth = 1 / dpr; c.stroke();
    c.beginPath();
    for (let i = 1; i < 4; i++) { const x = Math.round(X(i / 2) * dpr) / dpr + 0.5 / dpr; c.moveTo(x, Tp); c.lineTo(x, Bt); }
    for (let j = -2; j <= 2; j += 2) { if (!j) continue; const y = Math.round(Y(j * ymax / 4) * dpr) / dpr + 0.5 / dpr; c.moveTo(L, y); c.lineTo(Rr, y); }
    c.strokeStyle = alpha(C.text, D.dark ? 0.11 : 0.1); c.stroke();
    c.restore();
    hline(c, L, Rr, Y(0), alpha(C.text, 0.32), 1);
    // 一個週期的分界
    vline(c, X(1), Tp, Bt, alpha(C.text, 0.22), 1, [4, 4]);

    // 刻度
    c.font = fnt(nar ? 10.5 : 11.5); c.fillStyle = C.muted; c.textAlign = 'right'; c.textBaseline = 'middle';
    [-ymax, -ymax / 2, 0, ymax / 2, ymax].forEach(function (v) { D.haloText(c, tickLabel(v), L - 6, Y(v), C.muted, 'right', 'middle', fnt(nar ? 10.5 : 11.5)); });
    const tl = ['0', 'T/2', 'T', '3T/2', '2T'];
    tl.forEach(function (s, i) { D.haloText(c, s, X(i / 2), Bt + 14, C.muted, i === 0 ? 'left' : i === 4 ? 'right' : 'center', 'middle', fnt(nar ? 10.5 : 11.5, 600)); });

    // ±均方根淡帶
    if (RS.rms > 0) {
      const y1 = Y(RS.rms), y2 = Y(-RS.rms);
      c.fillStyle = alpha(C.accent, D.dark ? 0.12 : 0.09);
      c.fillRect(L + 1, y1, Rr - L - 2, y2 - y1);
      hline(c, L, Rr, y1, alpha(C.accent, 0.45), 1, [3, 4]);
      hline(c, L, Rr, y2, alpha(C.accent, 0.45), 1, [3, 4]);
    }

    // 各泛音的分量（勾選時；「只聽這一個」時只畫那一個）
    const kmax = comp.reduce(function (m, x) { return Math.max(m, x.k); }, 1);
    const n = Math.max(500, Math.min(2400, kmax * 2 * 40));
    function pathOf(f) {
      return function (cc) { for (let i = 0; i <= n; i++) { const t = 2 * i / n, x = X(t), y = Y(f(t)); if (i) cc.lineTo(x, y); else cc.moveTo(x, y); } };
    }
    if (state.showComp) {
      comp.forEach(function (x) {
        if (state.solo && x.k === state.sel) return;
        const sel = x.k === state.sel;
        c.save();
        c.beginPath(); pathOf(function (t) { return x.c * Math.sin(TAU * x.k * t + x.p); })(c);
        c.strokeStyle = alpha(harmColor(x.k), sel ? 0.95 : (D.dark ? 0.6 : 0.55));
        c.lineWidth = sel ? 2 : 1.2; c.lineJoin = 'round'; c.stroke();
        c.restore();
      });
    }
    if (state.solo) {
      const sc = soloComp();
      if (sc.length) D.tube(c, pathOf(function (t) { return sc[0].c * Math.sin(TAU * sc[0].k * t + sc[0].p); }), harmColor(sc[0].k), 2.6);
      else hline(c, L, Rr, Y(0), alpha(harmColor(state.sel), 0.9), 2.4, [6, 4]);
    }
    // 剛加入的泛音：短暫亮一下（裝飾）
    const fl = state.flash, tnow = nowS();
    if (fl && state.build && !state.showComp) {
      const x = comp.filter(function (q) { return q.k === fl.k; })[0];
      const u = reducedMotion() ? 0.5 : Math.max(0, 1 - (tnow - fl.t0) / 0.6);
      if (x && u > 0) {
        c.save();
        c.beginPath(); pathOf(function (t) { return x.c * Math.sin(TAU * x.k * t + x.p); })(c);
        c.strokeStyle = alpha(harmColor(x.k), 0.25 + 0.6 * u); c.lineWidth = 1.5 + 1.5 * u; c.stroke();
        c.restore();
      }
    }

    // 理想形狀（虛線）
    if (shape) {
      c.save();
      c.beginPath();
      const m = 1600;
      for (let i = 0; i <= m; i++) { const t = 2 * i / m, x = X(t), y = Y(shape.fn(t)); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
      c.setLineDash([6, 4]); c.strokeStyle = alpha(C['hs-ideal'], 0.9); c.lineWidth = 1.6; c.lineJoin = 'round'; c.stroke();
      c.restore();
    }

    // 合成波形
    if (comp.length) {
      D.tube(c, pathOf(function (t) { return HC.waveAt(comp, t); }), C['hs-wave'], state.solo ? 2.4 : 3.4);
    } else {
      hline(c, L, Rr, Y(0), alpha(C['hs-wave'], 0.7), 2, [6, 5]);
      D.pill(c, T('所有泛音都是 0：沒有聲音', 'Every harmonic is at 0: silence'), (L + Rr) / 2, Y(0) - 10, C.muted, 'center', fnt(nar ? 11 : 12, 600));
    }

    // 峰值
    if (comp.length && RS.peak > 0) {
      const v = HC.waveAt(comp, RS.tPeak);
      const py = Y(v);
      hline(c, L, Rr, py, alpha(C.probe, 0.55), 1, [2, 4]);
      [RS.tPeak, RS.tPeak + 1].forEach(function (t) { D.ball(c, X(t), py, nar ? 4.5 : 5, C.probe, { glow: D.dark ? 0.4 : 0, shadow: false }); });
      let s = T('峰值 ', 'Peak ') + num(RS.peak, 3);
      if (shape && shape.kind === 'square' && Math.abs(shape.A) > 0) {
        const os = (RS.peak - Math.abs(shape.A)) / (2 * Math.abs(shape.A));
        if (os > 0.002) s += T('（過衝 ', ' (overshoot ') + num(100 * os, 1) + '%' + T('）', ')');
      }
      let yb = v < 0 ? py + 22 : py - 5;
      if (yb - 20 < Tp + 2) yb = py + 22;
      if (yb > Bt - 2) yb = py - 5;
      D.pill(c, s, Rr - 6, yb, C.probe, 'right', fnt(nar ? 11 : 12, 600));
    }
    if (RS.rms > 0 && Bt - Tp > 120) {
      D.haloText(c, T('均方根 ', 'RMS ') + num(RS.rms, 3), L + 6, Y(RS.rms) - 6, alpha(C.accent, 0.95), 'left', 'alphabetic', fnt(nar ? 10.5 : 11.5, 600));
    }

    // 播放中的游標（慢動作）
    const vis = state.vis;
    if (vis && comp.length && !reducedMotion()) {
      const t = ((tnow - vis.t0) * SLOW) % 2;
      const x = X(t);
      vline(c, x, Tp, Bt, alpha(C.text, 0.35), 1.2);
      D.ball(c, x, Y(HC.waveAt(comp, t)), nar ? 5 : 6, C['hs-wave'], { glow: 0.5 });
    }

    // 標題列
    const title = state.build
      ? T('一個一個加上泛音：第 ' + state.build.i + '／' + state.build.list.length + ' 個（第 ' + state.build.upto + ' 個泛音，' + hz(state.build.upto * state.f0) + ' Hz）',
        'Adding harmonics: ' + state.build.i + ' of ' + state.build.list.length + ' (harmonic ' + state.build.upto + ', ' + hz(state.build.upto * state.f0) + ' Hz)')
      : state.solo ? T('只聽第 ' + state.sel + ' 個泛音（粗線）；細線是全部加起來', 'Hearing harmonic ' + state.sel + ' only (thick); thin line: all of them')
        : T('合成波形（2 個週期）', 'Combined waveform (2 periods)');
    const pb = D.pill(c, title, L, Tp - 8, state.build ? C.accent : C.text, 'left', fnt(nar ? 11 : 12.5, 600));
    let right = 'T = ' + num(1000 / state.f0, 3) + ' ms';
    if (vis && !reducedMotion()) right = T('慢動作：實際快 ', 'Slow motion: really ') + Math.round(state.f0 / SLOW) + T(' 倍', '× faster');
    else if (shape) right = T('虛線：理想', 'Dashed: ideal ') + shapeName(shape.kind);
    c.font = fnt(nar ? 11 : 12, 600);
    const rw = c.measureText(right).width + 12;
    if (pb.x + pb.w + 8 + rw <= Rr) D.pill(c, right, Rr, Tp - 8, shape && !vis ? C['hs-ideal'] : C.muted, 'right', fnt(nar ? 11 : 12, 600));
    else if (Bt - Tp > 140) D.pill(c, right, Rr - 4, Bt - 6, shape && !vis ? C['hs-ideal'] : C.muted, 'right', fnt(nar ? 10.5 : 11.5, 600));
  }

  // =====================================================================
  // 頻譜畫布（可拖曳）
  // =====================================================================
  let SL = null;
  function specLayout() {
    const nar = sw < 600;
    const L = nar ? 30 : 40, Rr = sw - (nar ? 8 : 14), Tp = nar ? 52 : 54, Bt = sh - (nar ? 52 : 54);
    return { nar: nar, L: L, Rr: Rr, Tp: Tp, Bt: Bt, col: (Rr - L) / KMAX };
  }
  function colAt(x) { const k = Math.floor((x - SL.L) / SL.col) + 1; return k >= 1 && k <= KMAX ? k : 0; }
  function colX(k) { return SL.L + (k - 0.5) * SL.col; }
  function drawSpec() {
    const c = sctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    SL = specLayout();
    const L = SL.L, Rr = SL.Rr, Tp = SL.Tp, Bt = SL.Bt, nar = SL.nar, col = SL.col;
    D.backdrop(c, sw, sh);
    const H = Bt - Tp;
    const Y = function (v) { return Bt - v * H; };
    plotPanel(c, L, Tp - 6, Rr, Bt);
    // 超過泛音數 N 的區域
    if (state.N < KMAX) {
      const x = L + state.N * col;
      c.fillStyle = alpha(C.text, D.dark ? 0.05 : 0.04);
      c.fillRect(x, Tp - 5, Rr - x - 1, H + 4);
      vline(c, x, Tp - 6, Bt, alpha(C.text, 0.4), 1.2, [4, 3]);
      D.haloText(c, 'N = ' + state.N, x + 4, Tp + 8, C.muted, 'left', 'middle', fnt(nar ? 10.5 : 11.5, 600));
    }
    // 格線
    [0.25, 0.5, 0.75, 1].forEach(function (v) { hline(c, L, Rr, Math.round(Y(v)) + 0.5, alpha(C.text, v === 0.5 || v === 1 ? 0.1 : 0.05), 1); });
    hline(c, L, Rr, Bt + 0.5, alpha(C.text, 0.35), 1);
    ['0', '0.5', '1'].forEach(function (s, i) { D.haloText(c, s, L - 6, Y(i / 2), C.muted, 'right', 'middle', fnt(nar ? 10.5 : 11.5)); });
    // 選取欄、滑過欄
    function colBand(k, color, a) {
      const x = L + (k - 1) * col;
      D.roundRect(c, x + 1, Tp - 4, col - 2, Bt - Tp + 46, 6);
      c.fillStyle = alpha(color, a); c.fill();
    }
    if (state.hover && state.hover !== state.sel) colBand(state.hover, C.text, D.dark ? 0.05 : 0.04);
    colBand(state.sel, C.accent, D.dark ? 0.14 : 0.1);

    const bw = Math.max(5, Math.min(col * 0.62, 34));
    const upto = shownN();
    const ph = state.mode === 'random' ? HC.randomPhases(state.seed) : null;
    const tnow = nowS();
    for (let k = 1; k <= KMAX; k++) {
      const a = state.a[k - 1] || 0, m = Math.abs(a);
      const x0 = colX(k) - bw / 2, top = Y(Math.min(1, m)), h = Bt - top;
      const inN = k <= state.N, shown = inN && k <= upto;
      const color = harmColor(k);
      if (m >= EPS) {
        if (shown) {
          // 柔和的投影
          D.roundRect(c, x0 + 1.5, top + 2.5, bw, h - 2, Math.min(4, bw / 3));
          c.fillStyle = D.shadowInk(D.dark ? 0.35 : 0.12); c.fill();
          // 長條：上亮下暗的漸層、頂端高光
          D.roundRect(c, x0, top, bw, h, Math.min(4, bw / 3));
          const g = c.createLinearGradient(0, top, 0, Bt);
          g.addColorStop(0, shade(color, 0.22)); g.addColorStop(1, shade(color, -0.18));
          c.fillStyle = g; c.fill();
          c.strokeStyle = shade(color, -0.3); c.lineWidth = 1; c.stroke();
          if (h > 3) hline(c, x0 + 2, x0 + bw - 2, top + 1.5, alpha(shade(color, 0.7), D.dark ? 0.5 : 0.75), 1.2);
          // 剛加入：發光（裝飾）
          if (state.build && state.flash && state.flash.k === k && !reducedMotion()) {
            const u = Math.max(0, 1 - (tnow - state.flash.t0) / 0.6);
            if (u > 0) { c.save(); c.shadowColor = color; c.shadowBlur = 14 * u; D.roundRect(c, x0, top, bw, h, Math.min(4, bw / 3)); c.strokeStyle = alpha(color, u); c.lineWidth = 2; c.stroke(); c.restore(); }
          }
        } else {
          // 超過 N（聽不到）或還沒加進來：淡色虛線
          D.roundRect(c, x0, top, bw, h, Math.min(4, bw / 3));
          c.fillStyle = alpha(color, inN ? 0.22 : 0.1); c.fill();
          c.save(); c.setLineDash([3, 3]); c.strokeStyle = alpha(inN ? color : C.muted, 0.7); c.lineWidth = 1; c.stroke(); c.restore();
        }
      } else {
        hline(c, x0, x0 + bw, Bt - 0.5, alpha(inN ? color : C.muted, 0.6), 2);
      }
      // 相位小圓盤
      const r = nar ? 4.6 : 5.6, cy = Bt + 10, cx = colX(k);
      c.beginPath(); c.arc(cx, cy, r, 0, TAU);
      c.fillStyle = alpha(C['canvas-bg'], 0.9); c.fill();
      c.strokeStyle = alpha(C.text, shown && m >= EPS ? 0.45 : 0.18); c.lineWidth = 1; c.stroke();
      if (m >= EPS && inN) {
        const ang = ph ? ph[k - 1] : (a < 0 ? Math.PI : 0);
        c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + r * Math.cos(ang), cy - r * Math.sin(ang));
        c.strokeStyle = shown ? shade(color, D.dark ? 0.1 : -0.1) : alpha(color, 0.5); c.lineWidth = 1.6; c.lineCap = 'round'; c.stroke();
      }
      // 第幾個、頻率
      const isSel = k === state.sel;
      D.haloText(c, String(k), cx, Bt + 28, isSel ? C.accent : (inN ? C.text : C.muted), 'center', 'middle', fnt(nar ? 10.5 : 12, isSel ? 700 : 600));
      const showHz = !nar || isSel || k === 1 || k % 4 === 0;
      const selNear = nar && !isSel && Math.abs(k - state.sel) === 1;
      if (showHz && !selNear) D.haloText(c, hzShort(k * state.f0), cx, Bt + 43, isSel ? C.accent : C.muted, 'center', 'middle', fnt(nar ? 9.5 : 10.5, isSel ? 700 : 400));
    }
    D.haloText(c, 'k', L - 6, Bt + 28, C.muted, 'right', 'middle', fnt(nar ? 10.5 : 11.5, 600, true));
    D.haloText(c, 'Hz', L - 6, Bt + 43, C.muted, 'right', 'middle', fnt(nar ? 9.5 : 10.5));

    // 頻譜重心
    if (RS.cr != null) {
      const x = SL.L + (RS.cr - 0.5) * col;
      vline(c, x, Tp - 6, Bt, alpha(C['hs-cent'], 0.9), 1.6, [5, 4]);
      c.beginPath(); c.moveTo(x - 5, Tp - 6); c.lineTo(x + 5, Tp - 6); c.lineTo(x, Tp + 1); c.closePath();
      c.fillStyle = C['hs-cent']; c.fill();
      const s = T('頻譜重心 ', 'Centroid ') + num(RS.cr, 2) + T(' 倍', '×');
      c.font = fnt(nar ? 11 : 12, 600);
      const w = c.measureText(s).width + 12;
      const px = Math.max(L + w / 2, Math.min(Rr - w / 2, x));
      D.pill(c, s, px, Tp - 9, C['hs-cent'], 'center', fnt(nar ? 11 : 12, 600));
    }
    // 選取長條的數值
    {
      const k = state.sel, a = state.a[k - 1] || 0;
      const top = Y(Math.min(1, Math.abs(a)));
      const s = (state.mode === 'sine' && a < 0 ? '−' : '') + num(Math.abs(a), 2);
      const py = Math.max(Tp + 18, top - 4);
      let px = colX(k);
      c.font = fnt(nar ? 11 : 12, 700);
      const w = c.measureText(s).width + 12;
      px = Math.max(L + w / 2, Math.min(Rr - w / 2, px));
      D.pill(c, s, px, py, C.accent, 'center', fnt(nar ? 11 : 12, 700));
    }
    // 鍵盤焦點框
    if (kb && kb.focused()) {
      const x = L + (state.sel - 1) * col;
      c.save(); c.setLineDash([4, 3]);
      D.roundRect(c, x + 1, Tp - 5, col - 2, Bt - Tp + 52, 6);
      c.strokeStyle = C.accent; c.lineWidth = 2; c.stroke(); c.restore();
    }
    // 標題
    D.pill(c, T('頻譜：拖曳長條改變振幅', 'Spectrum: drag the bars'), L - (nar ? 26 : 34) + 4, 22, C.text, 'left', fnt(nar ? 11.5 : 12.5, 600));
  }

  // =====================================================================
  // 弦上的泛音
  // =====================================================================
  function drawString() {
    const c = tctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, tw, th);
    const nar = tw < 600;
    const k = state.sel, m = Math.abs(state.a[k - 1] || 0);
    const audible = k <= state.N && m >= EPS;
    const f = k * state.f0;
    const t1 = T('第 ' + k + ' 個泛音：弦分成 ' + k + ' 段', 'Harmonic ' + k + ': the string vibrates in ' + k + (k === 1 ? ' segment' : ' segments'));
    const p1 = D.pill(c, t1, 10, 22, harmColor(k), 'left', fnt(nar ? 11 : 12.5, 600));
    c.font = fnt(nar ? 11 : 12, 600);
    const t2s = k + ' × ' + hz(state.f0) + ' Hz = ' + hz(f) + ' Hz' + T('（' + noteText(f) + ' 音分）', ' (' + noteText(f) + ' cents)');
    const w2 = c.measureText(t2s).width + 12;
    const twoRows = p1.x + p1.w + 10 + w2 > tw - 10;
    D.pill(c, t2s, twoRows ? 10 : tw - 10, twoRows ? 42 : 22, C.muted, twoRows ? 'left' : 'right', fnt(nar ? 11 : 12, 600));
    const top = twoRows ? 50 : 32;
    const xa = nar ? 22 : 30, xb = tw - (nar ? 22 : 30);
    const y0 = (top + th - 8) / 2 + 2;
    const Amax = (th - 8 - top) / 2 - 6;
    const A = Amax * Math.min(1, m);
    // 琴橋（固定端）
    D.block(c, xa - 8, y0 - 15, 8, 30, C['hs-string']);
    D.block(c, xb, y0 - 15, 8, 30, C['hs-string']);
    const col = harmColor(k);
    const n = Math.max(120, k * 24);
    // 包絡（淡色）
    if (A > 0.5) {
      c.beginPath();
      for (let i = 0; i <= n; i++) { const u = i / n; c.lineTo(xa + u * (xb - xa), y0 - A * Math.sin(k * Math.PI * u)); }
      for (let i = n; i >= 0; i--) { const u = i / n; c.lineTo(xa + u * (xb - xa), y0 + A * Math.sin(k * Math.PI * u)); }
      c.closePath();
      c.fillStyle = alpha(col, D.dark ? 0.16 : 0.12); c.fill();
    }
    hline(c, xa, xb, y0, alpha(C.text, 0.15), 1, [3, 4]);
    let phase = 1;
    const vis = state.vis;
    if (vis && !reducedMotion() && audible && (!state.build || k <= shownN())) phase = Math.cos(TAU * SLOW * k * (nowS() - vis.t0));
    if (A > 0.5) {
      D.tube(c, function (cc) {
        for (let i = 0; i <= n; i++) { const u = i / n, x = xa + u * (xb - xa), y = y0 - A * phase * Math.sin(k * Math.PI * u); if (i) cc.lineTo(x, y); else cc.moveTo(x, y); }
      }, audible ? col : alpha(col, 0.5), 3);
    }
    if (A <= 0.5) hline(c, xa, xb, y0, alpha(C['hs-string'], 0.8), 2.2, [6, 5]);
    // 節點
    for (let j = 0; j <= k; j++) {
      const x = xa + j / k * (xb - xa);
      D.ball(c, x, y0, nar ? 3 : 3.6, j === 0 || j === k ? C['hs-string'] : C.text, { shadow: false });
    }
    if (!audible) {
      const s = k > state.N ? T('超過泛音數 N，聽不到', 'beyond N: not heard') : T('振幅是 0', 'amplitude 0');
      D.pill(c, s, (xa + xb) / 2, th - 6, C.muted, 'center', fnt(nar ? 10.5 : 11.5, 600));
    }
  }

  // =====================================================================
  // 繪製迴圈
  // =====================================================================
  let raf = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    const t = nowS();
    if (state.build) stepBuild(t);
    if (state.vis && !state.vis.sound && t >= state.vis.until) {
      state.vis = null;
      updateButtons();
      updateHF();
    }
    if (!$('stage').classList.contains('is3d')) drawWave();
    drawSpec();
    drawString();
    const flashing = state.flash && t - state.flash.t0 < 0.7;
    if (!raf && (state.build || (state.vis && !reducedMotion()) || (state.vis && !state.vis.sound) || flashing)) raf = requestAnimationFrame(frame);
  }

  // =====================================================================
  // 讀數與文字
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  let eqKey = '';
  function updateReadouts() {
    const r = RS, f0 = state.f0;
    setHTML('rF0', hz(f0) + ' Hz <small>' + noteOf(f0).name + '</small>');
    if (!r.comp.length) {
      ['rRep', 'rTop', 'rCent', 'rOE'].forEach(function (id) { setHTML(id, '—'); });
      setHTML('rRms', '0'); setHTML('rPeak', '0'); setHTML('rCrest', '—');
    } else {
      setHTML('rRep', hz(r.rep) + ' Hz <small>' + (r.g > 1 ? r.g + ' × f<sub>0</sub>' : (Math.abs(state.a[0]) < EPS ? T('缺基頻', 'no fundamental') : '= f<sub>0</sub>')) + '</small>');
      setHTML('rTop', hz(r.top) + ' Hz <small>' + T('第 ' + r.topK + ' 個', 'no. ' + r.topK) + '</small>');
      setHTML('rCent', hz(r.centroid) + ' Hz <small>' + num(r.cr, 2) + T(' 倍', '×') + '</small>');
      const tot = r.odd + r.even;
      setHTML('rOE', r.even < 1e-12 ? T('只有奇次', 'odd only') : r.odd < 1e-12 ? T('只有偶次', 'even only')
        : Math.round(100 * r.odd / tot) + ' % : ' + Math.round(100 * r.even / tot) + ' %');
      setHTML('rRms', num(r.rms, 3));
      setHTML('rPeak', num(r.peak, 3));
      setHTML('rCrest', num(r.crest, 2) + (state.mode === 'random' ? ' <small>' + T('同相 ', 'in phase ') + num(r.crestSine, 2) + '</small>' : ''));
    }
    const msN = r.comp.length ? HC.meanSquareNumeric(r.comp, 2048) : 0;
    const key = num(r.ms, 4) + '|' + num(msN, 4) + '|' + (window.LabSettings ? LabSettings.get('lang') : '');
    if (key !== eqKey && window.katex) {
      eqKey = key;
      const tex = '\\begin{aligned} \\textstyle\\sum_k \\tfrac{a_k^2}{2} &= ' + r.ms.toFixed(4) + ' \\\\ \\tfrac{1}{T}\\textstyle\\int_0^T x^2\\,dt &= ' + msN.toFixed(4) + '\\end{aligned}';
      try { window.katex.render(tex, $('rEq'), { throwOnError: false, displayMode: false }); } catch (e) { $('rEq').textContent = r.ms.toFixed(4); }
    }
    // 基頻旁的音名與低音提示
    const p = noteOf(f0);
    const c = Math.round(p.cents);
    setHTML('f0Note', T(p.name + '（' + (c >= 0 ? '+' : '−') + Math.abs(c) + ' 音分）・週期 ' + num(1000 / f0, 3) + ' ms',
      p.name + ' (' + (c >= 0 ? '+' : '−') + Math.abs(c) + ' cents) · period ' + num(1000 / f0, 3) + ' ms'));
    const low = f0 < 200;
    if ($('lowNote').hidden === low) $('lowNote').hidden = !low;
    // 選取的泛音
    const k = state.sel;
    setHTML('selName', T('第 ' + k + ' 個：', 'No. ' + k + ': ') + hz(k * f0) + ' Hz' + (k > state.N ? T('（超過 N）', ' (beyond N)') : ''));
    // 預設音色的說明
    setHTML('presetNote', state.edited ? T('已修改：從「' + presetName(state.base) + '」開始', 'Edited, starting from “' + presetName(state.base) + '”') : '');
    setHTML('seedNo', state.mode === 'random' ? T('隨機相位：第 ' + state.seed + ' 組', 'Random phases: set ' + state.seed) : '');
    document.querySelectorAll('#presets [data-preset]').forEach(function (b) {
      const on = !state.edited && b.getAttribute('data-preset') === state.base;
      if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
    });
    $('phSine').setAttribute('aria-pressed', String(state.mode === 'sine'));
    $('phRand').setAttribute('aria-pressed', String(state.mode === 'random'));
    $('solo').setAttribute('aria-pressed', String(state.solo));
    $('solo').textContent = state.solo ? T('只聽第 ' + k + ' 個（再按一下回到全部）', 'Hearing no. ' + k + ' only (press again for all)') : T('只聽這一個泛音', 'Hear only this harmonic');
  }
  function refreshOutputs() {
    $('f0o').textContent = num(state.f0, 1);
    $('nho').textContent = String(state.N);
    $('ampo').textContent = num(Math.abs(state.a[state.sel - 1] || 0), 2);
  }
  /** 振幅滑桿跟著選取的長條（程式改值，不觸發事件） */
  function syncAmp() {
    const el = $('amp');
    if (window.LabNum) window.LabNum.clear(el);
    el.value = String(Math.round(Math.abs(state.a[state.sel - 1] || 0) * 100) / 100);
    refreshOutputs();
  }
  function describeBar(k) {
    const a = state.a[k - 1] || 0;
    return T('第 ' + k + ' 個泛音，' + hz(k * state.f0) + ' Hz，振幅 ' + num(Math.abs(a), 2) + (k > state.N ? '（超過泛音數 N，聽不到）' : '') + '。',
      'Harmonic ' + k + ', ' + hz(k * state.f0) + ' Hz, amplitude ' + num(Math.abs(a), 2) + (k > state.N ? ' (beyond N, not heard)' : '') + '.');
  }
  function summary() {
    if (!R.comp.length) return T('所有泛音都是 0。', 'Every harmonic is at 0.');
    return T('頻譜重心 ' + num(R.cr, 2) + ' 倍，峰值因數 ' + num(R.crest, 2) + '。', 'Spectral centroid ' + num(R.cr, 2) + '×, crest factor ' + num(R.crest, 2) + '.');
  }

  /** 狀態改變後：讀數、聲音、3D、重畫 */
  function afterChange(resyncAmp) {
    if (resyncAmp !== false) syncAmp(); else refreshOutputs();
    updateReadouts();
    updateVoice();
    updateButtons();
    if (view3 && view3.active) view3.update();
    requestDraw();
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function restoring() { return !!(window.LabShare && window.LabShare.restoring); }
  function emit(type, data) { if (window.LabMission && !restoring()) window.LabMission.emit(type, data); }
  function emitTone() {
    emit('tone', HC.missionData({ a: state.a, f0: state.f0, N: state.N, mode: state.mode, seed: state.seed, preset: state.base, edited: state.edited }));
  }

  // =====================================================================
  // 操作
  // =====================================================================
  /** 設定第 k 個長條的大小（保留原本的正負號）；實際改變 ≥ 0.005 才算動過 */
  function setBar(k, v) {
    v = Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
    const old = state.a[k - 1] || 0;
    const nv = (old < 0 ? -1 : 1) * v;
    if (Math.abs(nv - old) < 0.005) return false;
    state.a[k - 1] = nv === 0 ? 0 : nv;
    state.edited = true;
    if (state.build) cancelBuild(true);
    compute();
    return true;
  }
  function select(k, fromKb) {
    k = Math.max(1, Math.min(KMAX, k));
    if (k === state.sel && !fromKb) { requestDraw(); return; }
    state.sel = k;
    if (!fromKb && kb && kb.index() !== k - 1) kb.select(k - 1);
    syncAmp();
    updateReadouts();
    if (state.solo) updateVoice();
    if (view3 && view3.active) view3.update();
    requestDraw();
  }
  function applyPreset(id, quiet) {
    if (!HC.PRESETS[id]) return;
    state.base = id; state.edited = false;
    state.a = HC.preset(id, state.f0);
    cancelBuild(true);
    compute();
    afterChange();
    if (!quiet) {
      emitTone();
      say(presetName(id) + (HC.PRESETS[id].approx ? T('（近似）', ' (approximate)') : '') + T('。', '. ') + summary());
    }
  }

  // 預設音色
  document.querySelectorAll('#presets [data-preset]').forEach(function (b) {
    b.addEventListener('click', function () { applyPreset(b.getAttribute('data-preset')); });
  });
  // 基頻（對數滑桿）
  const f0el = $('f0'), nhel = $('nh'), ampel = $('amp');
  if (window.LabNum) window.LabNum.register(f0el, { toValue: HC.f0FromPos, toPos: HC.posFromF0, min: HC.F0_MIN, max: HC.F0_MAX, decimals: 1 });
  f0el.addEventListener('input', function () {
    state.f0 = Math.max(HC.F0_MIN, Math.min(HC.F0_MAX, val(f0el)));
    if (!state.edited && HC.PRESETS[state.base] && HC.PRESETS[state.base].dependsOnF0) state.a = HC.preset(state.base, state.f0);
    compute();
    afterChange();
  });
  f0el.addEventListener('change', function () { if (!applying) emitTone(); });
  nhel.addEventListener('input', function () {
    state.N = Math.max(1, Math.min(KMAX, Math.round(val(nhel))));
    cancelBuild(true);
    compute();
    afterChange();
  });
  nhel.addEventListener('change', function () { if (!applying) { emitTone(); say('N = ' + state.N + T('。', '. ') + summary()); } });
  ampel.addEventListener('input', function () {
    if (applying) return;
    setBar(state.sel, val(ampel));
    afterChange(false);
  });
  ampel.addEventListener('change', function () { if (!applying) { emitTone(); say(describeBar(state.sel) + ' ' + summary()); } });
  $('selPrev').addEventListener('click', function () { select(state.sel - 1); say(describeBar(state.sel)); });
  $('selNext').addEventListener('click', function () { select(state.sel + 1); say(describeBar(state.sel)); });
  $('solo').addEventListener('click', function () {
    state.solo = !state.solo;
    compute();
    afterChange(false);
    if (state.vis && state.vis.sound) setStatus(playingText());
    say(state.solo ? T('只聽第 ' + state.sel + ' 個泛音。', 'Hearing harmonic ' + state.sel + ' only.') : T('聽全部的泛音。', 'Hearing all the harmonics.'));
  });
  // 相位
  function setMode(m) {
    if (state.mode === m) return;
    state.mode = m;
    compute();
    afterChange(false);
  }
  $('phSine').addEventListener('click', function () { setMode('sine'); emitTone(); say(T('同相。', 'In phase. ') + summary()); });
  $('phRand').addEventListener('click', function () { setMode('random'); emitTone(); say(T('隨機相位第 ' + state.seed + ' 組。', 'Random phases, set ' + state.seed + '. ') + summary()); });
  $('reseed').addEventListener('click', function () {
    state.seed = state.seed >= 9999 ? 1 : state.seed + 1;
    state.mode = 'random';
    compute();
    afterChange(false);
    emitTone();
    say(T('隨機相位第 ' + state.seed + ' 組。', 'Random phases, set ' + state.seed + '. ') + summary());
  });
  $('showComp').addEventListener('change', function () { state.showComp = $('showComp').checked; requestDraw(); });
  // 播放列
  $('play').addEventListener('click', function () { cancelBuild(true); play(); });
  $('build').addEventListener('click', function () {
    if (state.build) { cancelBuild(); setStatus(T('已停止加入：全部的泛音都顯示出來了。', 'Stopped adding: all the harmonics are shown.')); }
    else startBuild();
  });
  $('stop').addEventListener('click', function () { stopAll(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && (state.vis || state.build)) stopAll(); });
  if (window.MusicAudio) MusicAudio.onChange(function () {
    if (voice && !voice.playing) {
      // 被 Esc、關音效或切到背景停掉（時間到的話，接著會呼叫 onVoiceEnd 換成「播完了」）
      voice = null;
      if (state.vis && state.vis.sound) { state.vis = null; cancelBuild(true); setStatus(T('已停止。', 'Stopped.')); }
    }
    updateButtons();
    updateHF();
    requestDraw();
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden && (state.vis || state.build)) stopAll(false); });

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
      if (!ev.detail.value && state.vis && state.vis.sound) { state.vis = null; cancelBuild(true); updateButtons(); requestDraw(); }
    }
    if (ev.detail.name === 'lang') themeChanged();
  });

  // ---------- 頻譜：拖曳長條 ----------
  let drag = null;
  function ptr(e) { const r = spec.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function valueAtY(y) { return (SL.Bt - y) / (SL.Bt - SL.Tp); }
  spec.addEventListener('pointerdown', function (e) {
    if (!SL) return;
    const p = ptr(e), k = colAt(p.x);
    if (!k) return;
    e.preventDefault();
    select(k);
    if (p.y <= SL.Bt + 4) {
      drag = { last: k, id: e.pointerId, changed: false };
      try { spec.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      if (setBar(k, valueAtY(p.y))) drag.changed = true;
      afterChange();
    }
  });
  spec.addEventListener('pointermove', function (e) {
    if (!SL) return;
    const p = ptr(e);
    if (!drag) {
      const h = colAt(p.x);
      if (h !== state.hover) { state.hover = h; requestDraw(); }
      return;
    }
    let k = Math.floor((p.x - SL.L) / SL.col) + 1;
    k = Math.max(1, Math.min(KMAX, k));
    const v = valueAtY(p.y);
    const a = Math.min(drag.last, k), b = Math.max(drag.last, k);
    for (let j = a; j <= b; j++) if (setBar(j, v)) drag.changed = true;
    drag.last = k;
    if (k !== state.sel) { state.sel = k; if (kb) kb.select(k - 1); }
    afterChange();
  });
  function endDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.changed) { emitTone(); say(describeBar(state.sel) + ' ' + summary()); }
    requestDraw();
  }
  spec.addEventListener('pointerup', endDrag);
  spec.addEventListener('pointercancel', endDrag);
  spec.addEventListener('pointerleave', function () { if (!drag && state.hover) { state.hover = 0; requestDraw(); } });

  // ---------- 鍵盤（LabKeys）：左右選泛音、上下調振幅 ----------
  let kb = null;
  if (window.LabKeys) {
    const items = [];
    for (let i = 0; i < KMAX; i++) {
      (function (k) {
        items.push({
          name: function () { return T('第 ' + k + ' 個泛音', 'Harmonic ' + k); },
          move: function (dx, dy, big) {
            if (dx) {
              const j = Math.max(1, Math.min(KMAX, k + dx));
              if (j === k) return false;
              select(j);
              return true;
            }
            const cur = Math.abs(state.a[k - 1] || 0);
            if (!setBar(k, cur + dy * (big ? 0.1 : 0.01))) return false;
            afterChange();
            emitTone();
            return true;
          },
          describe: function () { return describeBar(state.sel); }
        });
      })(i + 1);
    }
    kb = window.LabKeys.attach(spec, {
      label: T('頻譜畫布：第 1 到第 16 個泛音的振幅長條。左右方向鍵選泛音，上下方向鍵調整振幅（Shift 一次 0.1），Enter 也可以換下一個。',
        'Spectrum canvas: amplitude bars for harmonics 1 to 16. Left and right arrows pick a harmonic, up and down change its amplitude (Shift for steps of 0.1); Enter also moves to the next one.'),
      items: items,
      onChange: function () { if (kb && kb.index() + 1 !== state.sel) select(kb.index() + 1, true); else requestDraw(); }
    });
  }

  // =====================================================================
  // 分享連結：長條、選取、預設音色、有沒有修改、相位組別
  // =====================================================================
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      return { a: state.a.map(function (v) { return Math.round(v * 10000) / 10000; }), s: state.sel, p: state.base, e: state.edited ? 1 : 0, r: state.seed };
    },
    set: function (o) {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o.a)) {
        const a = [];
        for (let k = 0; k < KMAX; k++) { const v = +o.a[k]; a.push(isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0); }
        state.a = a;
      }
      if (typeof o.p === 'string' && HC.PRESETS[o.p]) state.base = o.p;
      if (o.e != null) state.edited = !!o.e;
      if (isFinite(+o.r) && +o.r >= 1) state.seed = Math.min(9999, Math.floor(+o.r));
      if (isFinite(+o.s)) state.sel = Math.max(1, Math.min(KMAX, Math.round(+o.s)));
      if (kb) kb.select(state.sel - 1);
      cancelBuild(true);
      compute();
      afterChange();
    }
  });

  // =====================================================================
  // 3D 檢視：切換到 3D 時才載入 js/harmonic-series-3d.js 與 three.js
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    HC: HC, T: T, D: D, state: state,
    reducedMotion: reducedMotion,
    colors: function () { return C; },
    harmColor: harmColor,
    shown: function () { return RS; },
    shownN: shownN,
    num: num, hz: hz,
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
      if (window.Harm3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Harm3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/harmonic-series-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Harm3D) throw new Error('harmonic-series-3d.js did not load');
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
        view3 = window.Harm3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
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
  function face(which) {
    if (!view3 || !view3.active) return;
    view3.face(which);
    emit('view3d', { face: which });
    say(which === 'side' ? T('側面看：每一條正弦波縮成一根長條，就是頻譜。', 'From the side: each sine wave shrinks to a bar — the spectrum.')
      : T('正面看：所有正弦波疊在一起，最前面是合成波形。', 'From the front: all the sine waves overlap, with the combined waveform in front.'));
  }
  $('faceFront').addEventListener('click', function () { face('front'); });
  $('faceSide').addEventListener('click', function () { face('side'); });

  // 給測試用的介面（不影響畫面）
  window.__hs = {
    state: state, analysis: function () { return R; }, applyPreset: applyPreset, setBar: function (k, v) { setBar(k, v); afterChange(); emitTone(); },
    select: select, emitTone: emitTone, view: function () { return view3; }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  compute();
  if (window.LabNum) { applying = true; window.LabNum.set(f0el, HC.DEFAULT.f0); applying = false; }
  state.f0 = val(f0el);
  compute();
  updateSoundButton();
  afterChange();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    eqKey = '';
    updateReadouts();
    updateSoundButton();
    updateButtons();
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lw2 = 0;
    new ResizeObserver(function () {
      const a = cv.clientWidth, b = spec.clientWidth;
      if (a !== lw || b !== lw2) { lw = a; lw2 = b; resize(); }
    }).observe(stage);
  } else window.addEventListener('resize', resize);
  resize();
})();
