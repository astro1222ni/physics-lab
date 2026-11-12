/* energy-coaster.js — 「雲霄飛車與力學能守恆」的畫面與互動（物理計算在 energy-coaster-core.js；共用繪圖工具 LabDraw 在 drawkit.js） */
(function () {
  'use strict';
  const C = window.CoasterCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const alpha = D.alpha, shade = D.shade, mix = D.mix;

  // ---------- 固定比例（畫面上有說明） ----------
  const WW = C.WORLD.W, WH = C.WORLD.H;   // 場景 32 m × 16 m
  const SCALE_V = 0.25;  // 速度箭頭：每 1 m/s 畫 0.25 m
  const SCALE_F = 1.5;   // 力箭頭：每 1 mg 畫 1.5 m
  const MAX_ARROW = 4;   // m：超過的箭頭截短並標「≈」
  const SNAP = 0.05;     // 拖曳控制點時對齊 0.05 m
  const SLOW = 0.25;
  const WINDOWS = [5, 10, 20, 40, 80, 160, 320, 640, 1280];
  const MAX_GHOSTS = 4;
  const MAX_ROWS = 30;

  function clone(def) { return { pts: def.pts.map(function (p) { return [p[0], p[1]]; }), loop: def.loop ? { at: def.loop.at, R: def.loop.R } : null }; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function r3(x) { return Math.round(x * 1000) / 1000; }

  const state = {
    preset: 'valley', edited: false,
    def: clone(C.PRESETS.valley), tr: null, trS: null, trVer: 0,
    mode: 'rail', m: 500, g: 9.8, mu: 0, yref: 0, x0: C.PRESETS.valley.start, v0: 0,
    running: false, userPaused: reducedMotion, slow: false,
    show: { v: true, f: true, level: true, pts: true, trail: true },
    graph: 't',
    P: null, sim: null, run: null, runCount: 0,
    ghosts: [], rows: [], fx: [],
    hover: null, drag: null, userActed: false, msg: null
  };

  // ---------- 色彩 ----------
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--grid', '--accent', '--accent-soft', '--surface',
      '--pos', '--neg', '--equi', '--field', '--probe', '--b-mech', '--b-optics', '--b-wave']
      .forEach(function (k) { colors[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    colors.dark = D.dark;
  }
  function fnt(px, weight, italic) { return (italic ? 'italic ' : '') + (weight ? weight + ' ' : '') + px + 'px ' + FONT; }

  // ---------- 數字格式 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s.replace('-', '−');
  }
  /** 能量：1000 J 以上用 kJ（三位有效數字左右） */
  function fmtE(J) {
    if (!isFinite(J)) return '—';
    const a = Math.abs(J);
    if (a < 999.5) return num(J, 0) + ' J';
    if (a < 9999.5) return num(J / 1000, 2) + ' kJ';
    if (a < 99999.5) return num(J / 1000, 1) + ' kJ';
    return num(J / 1000, 0) + ' kJ';
  }

  // ---------- 畫布與版面 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  const gv = $('gv'), gtx = gv.getContext('2d');
  let dpr = 1, cw = 300, ch = 300, gh = 240;
  let L = null;
  const bg = document.createElement('canvas'), bgctx = bg.getContext('2d');
  let bgKey = '';

  function layout() {
    const narrow = cw < 600;
    const mL = narrow ? 28 : 36, mR = narrow ? 6 : 8, mT = narrow ? 8 : 10, mB = narrow ? 20 : 24;
    const barsW = narrow ? 0 : Math.round(clamp(cw * 0.2, 150, 220));
    const gap = narrow ? 0 : 12;
    const plotW = cw - mL - mR - barsW - gap;
    const k = plotW / WW;
    const groundPx = Math.max(8, Math.round(0.55 * k));
    const sceneH = Math.round(mT + WH * k + groundPx + mB);
    const lay = {
      narrow: narrow, mL: mL, mR: mR, mT: mT, mB: mB, barsW: barsW, gap: gap, plotW: plotW, k: k, groundPx: groundPx, sceneH: sceneH,
      plot: { x: mL, y: mT, w: plotW, h: WH * k },
      bars: narrow ? null : { x: mL + plotW + gap, y: mT, w: barsW, h: WH * k + groundPx },
      tw: clamp(0.2 * k, 3.4, 7),
      Lc: clamp(2.1 * k, 26, 46)
    };
    // 下方能量圖（gv）
    const gBarsH = narrow ? 4 * 24 + 30 : 0;
    const graphH = narrow ? Math.round(clamp(cw * 0.5, 160, 230)) : Math.round(clamp(cw * 0.27, 190, 270));
    lay.g = {
      bars: narrow ? { x: 8, y: 6, w: cw - 16, h: gBarsH - 8 } : null,
      plot: { x: mL, y: gBarsH + 30, w: narrow ? cw - mL - mR : plotW, h: graphH - 30 - 26 },
      side: narrow ? null : { x: mL + plotW + gap, y: gBarsH + 8, w: barsW, h: graphH - 16 },
      H: gBarsH + graphH
    };
    return lay;
  }
  function X(x) { return L.mL + x * L.k; }
  function Y(y) { return L.mT + (WH - y) * L.k; }
  function wx(px) { return (px - L.mL) / L.k; }
  function wy(py) { return WH - (py - L.mT) / L.k; }

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layout();
    ch = L.sceneH;
    gh = L.g.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    if (gv.style.height !== gh + 'px') gv.style.height = gh + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    gv.width = Math.round(cw * dpr); gv.height = Math.round(gh * dpr);
    bgKey = '';
    requestDraw();
  }

  // ---------- 軌道 ----------
  function setTrack(def) {
    state.def = clone(def);
    state.tr = C.buildTrack(state.def);
    state.trS = state.tr.sample(0.08);
    state.trVer++;
    bgKey = '';
    const elx = $('x0');
    elx.min = String(r3(state.tr.xMin));
    elx.max = String(r3(state.tr.xMax));
    if (state.x0 < state.tr.xMin || state.x0 > state.tr.xMax) state.x0 = clamp(state.x0, state.tr.xMin, state.tr.xMax);
    syncSlider(elx, state.x0);
    $('boxR').hidden = !state.def.loop;
    if (state.def.loop) syncSlider($('R'), state.def.loop.R);
    rebuildKeyItems();
  }
  function sig() {
    return JSON.stringify({ p: state.def.pts.map(function (p) { return [r3(p[0]), r3(p[1])]; }), l: state.def.loop ? [state.def.loop.at, r3(state.def.loop.R)] : null });
  }
  function reasonText(r) {
    return {
      gap: T('相鄰的控制點左右至少要隔 1.2 m。', 'Neighbouring control points must be at least 1.2 m apart.'),
      ground: T('軌道不能碰到地面。', 'The track must not touch the ground.'),
      sky: T('軌道不能超出畫面上緣。', 'The track must stay below the top of the picture.'),
      loop: T('軌道不能穿過迴圈，迴圈也不能超出畫面。', 'The track must not cut through the loop, and the loop must stay in the picture.'),
      loopTop: T('迴圈頂點不能超出畫面上緣。', 'The top of the loop must stay below the top of the picture.')
    }[r] || '';
  }

  // ---------- 模擬 ----------
  function params() { return { g: state.g, mu: state.mu, mode: state.mode, x0: state.x0, v0: state.v0 }; }
  /** 開始新的一次（小車回到出發點）。archive：把目前這次放進舊紀錄（能量圖上的淡色曲線） */
  function newRun(archive) {
    if (archive && state.run && state.sim && state.sim.t > 0.5 && state.run.samples.length > 2) {
      state.ghosts.push({ samples: state.run.samples, g: state.P.g, flights: state.run.flights });
      while (state.ghosts.length > MAX_GHOSTS) state.ghosts.shift();
    }
    state.P = params();
    state.sim = C.createSim(state.tr, state.P);
    state.run = {
      samples: [], flights: [], cur: null, dtS: 1 / 30, lastS: -1,
      bottomV: NaN, turned: false, loopDone: 0, refFrom: state.yref, row: null, ended: false, endText: '', airSign: 1, lastFlightT: -1
    };
    state.fx = [];
    pushSample(true);
    stopVoice();
    if (state.sim.phase !== 'track') {
      endRun();
      setStatus(T('出發點的坡度夠平緩（tan θ ≤ μ），靜摩擦力讓小車停在原地。', 'The slope at the start is gentle enough (tan θ ≤ μ): static friction holds the car in place.'));
    }
    updatePrediction();
  }
  function simActive() { return state.sim && (state.sim.phase === 'track' || state.sim.phase === 'air'); }
  function pushSample(force) {
    const s = state.sim, run = state.run;
    if (!force && s.t - run.lastS < run.dtS) return;
    const K = C.kinematics(state.tr, state.P, s);
    run.samples.push({ t: s.t, x: K.x, y: K.y, k: 0.5 * K.speed * K.speed, q: s.q, qi: s.qi });
    run.lastS = s.t;
    if (run.samples.length > 6000) { // 太多點時隔一個留一個，取樣間隔加倍
      run.samples = run.samples.filter(function (p, i) { return i % 2 === 0 || i === run.samples.length - 1; });
      run.dtS *= 2;
    }
  }
  /** 目前的能量（J；位能零點 yref） */
  function energiesNow() { return C.energies(state.tr, state.P, state.sim, state.m, state.yref); }

  // 播放控制
  function setRunning(on) {
    state.running = !!on;
    if (on && !simActive()) newRun(true);
    updatePlayButton();
    requestDraw();
  }
  function updatePlayButton() {
    const b = $('play');
    let zh, en;
    if (state.running && simActive()) { zh = '暫停'; en = 'Pause'; }
    else if (simActive() && state.sim.t > 0) { zh = '繼續'; en = 'Resume'; }
    else { zh = '出發'; en = 'Go'; }
    b.textContent = T(zh, en);
    b.setAttribute('data-en', en);
  }
  /** 參數或軌道改變：小車回到出發點；沒有按過暫停就直接出發 */
  function restartAfterChange() {
    newRun(true);
    state.running = !state.userPaused && simActive();
    updatePlayButton();
    requestDraw();
  }

  // ---------- 任務事件 ----------
  function emit(type, data) {
    if (!state.userActed || !window.LabMission) return;
    window.LabMission.emit(type, Object.assign(base(), data || {}));
  }
  function base() {
    const tr = state.tr, P = state.P, s = state.sim, Lp = tr.loop;
    return {
      preset: state.preset, edited: state.edited, mode: P.mode, m: state.m, g: P.g, mu: P.mu, yref: state.yref,
      x0: P.x0, v0: P.v0, R: Lp ? Lp.R : null, y0: s.start.y, yLow: tr.yLow, h0: s.start.y - tr.yLow,
      ya: Lp ? Lp.ya : null, xa: Lp ? Lp.xa : null, sig: sig(), target: C.PRESETS[state.preset].target || null
    };
  }
  /** 某一瞬間的能量（J）：y 高度、v 速率、q 摩擦生熱與 qi 撞擊生熱（每公斤） */
  function energyAt(y, v, q, qi) {
    const m = state.m, g = state.P.g;
    const K = 0.5 * m * v * v, U = m * g * (y - state.yref), Q = m * ((q || 0) + (qi || 0));
    return { K: K, U: U, Q: Q, E: K + U + Q };
  }

  // ---------- 音效 ----------
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  let voice = null;
  function stopVoice() { if (voice) { voice.stop(0.12); voice = null; } }
  function updateVoice() {
    const S = sound();
    const s = state.sim;
    const sp = s && s.phase === 'track' ? Math.abs(s.v) : 0;
    if (!S || !state.running || !s || s.phase !== 'track' || sp < 0.05 || document.hidden || state.drag) { stopVoice(); return; }
    const f = 260 + 26 * sp, gain = Math.min(0.2, 0.03 + 0.008 * sp);
    if (!voice || !voice.playing) voice = S.voice({ freq: f, type: 'triangle', gain: gain });
    else voice.set({ freq: f, gain: gain }, 0.05);
  }
  function sfx(kind) {
    const S = sound(); if (!S) return;
    if (kind === 'leave') { S.sweep({ from: 480, to: 1150, dur: 0.22, type: 'triangle', gain: 0.4 }); }
    else if (kind === 'land') { S.noise({ dur: 0.12, gain: 0.8, filter: 900, q: 0.8 }); S.tone({ freq: 300, dur: 0.16, type: 'sine', gain: 0.45 }); }
    else if (kind === 'attach') { S.noise({ dur: 0.04, gain: 0.6, filter: 2600, q: 1.4 }); S.tone({ freq: 720, dur: 0.07, type: 'triangle', gain: 0.35 }); S.tone({ freq: 360, dur: 0.1, type: 'sine', gain: 0.25, delay: 0.01 }); }
    else if (kind === 'stop') { S.tone({ freq: 880, dur: 0.22, type: 'sine', gain: 0.3 }); S.tone({ freq: 1320, dur: 0.3, type: 'sine', gain: 0.2, delay: 0.09 }); }
  }

  // ---------- 狀態列與螢幕閱讀器 ----------
  function setStatus(s) { $('status').textContent = s || ''; }
  let lastSay = 0;
  function periodicSay(now) {
    if (!state.running || !simActive() || now - lastSay < 5000) return;
    lastSay = now;
    const K = C.kinematics(state.tr, state.P, state.sim), E = energiesNow();
    $('srSay').textContent = T('速率 ', 'Speed ') + num(K.speed, 1) + ' m/s' + T('，離地 ', ', height ') + num(K.y, 1) + ' m' +
      T('，動能 ', ', K ') + fmtE(E.K) + T('，位能 ', ', U ') + fmtE(E.U) + T('，熱能 ', ', Q ') + fmtE(E.Q) + T('。', '.');
  }

  // ---------- 事件處理 ----------
  function fx(kind, x, y, color) { if (!reducedMotion) state.fx.push({ kind: kind, x: x, y: y, color: color, t0: performance.now() }); }
  function carName(mode) { return mode === 'free' ? T('自由小車', 'Free car') : T('軌道車', 'Rail car'); }
  function ensureRow() {
    const run = state.run;
    if (run.row) return run.row;
    state.runCount++;
    const P = state.P, s = state.sim;
    run.row = { n: state.runCount, mode: P.mode, g: P.g, mu: P.mu, h0: s.start.y - state.tr.yLow, v0: P.v0, vb: NaN, Q: 0, res: '' };
    state.rows.push(run.row);
    while (state.rows.length > MAX_ROWS) state.rows.shift();
    return run.row;
  }
  function updateRow(res) {
    const row = ensureRow();
    if (res) row.res = res;
    row.Q = state.m * (state.sim.q + state.sim.qi);
    row.m = state.m;
    renderTable();
  }
  function handleEvents(evs) {
    const run = state.run, P = state.P, sim = state.sim;
    evs.forEach(function (ev) {
      switch (ev.type) {
        case 'bottom': {
          const first = !(run.bottomV >= 0);
          if (first) {
            run.bottomV = ev.v;
            const row = ensureRow(); row.vb = ev.v; updateRow('');
            const pred = C.speedFromDrop(P.g, sim.start.y - ev.y, P.v0);
            setStatus(T('通過最低點：v = ', 'Lowest point: v = ') + num(ev.v, 2) + ' m/s' +
              (P.mu === 0 ? T('（預測 ', ' (predicted ') : T('（無摩擦時會是 ', ' (without friction it would be ')) + num(pred, 2) + T(' m/s）', ' m/s)'));
          }
          const e = energyAt(ev.y, ev.v, ev.q, sim.qi);
          emit('bottom', { v: ev.v, t: ev.t, first: first, K: e.K, U: e.U, Q: e.Q, E: e.E });
          break;
        }
        case 'loopTop': {
          setStatus(T('迴圈頂點：v = ', 'Top of the loop: v = ') + num(ev.v, 2) + T(' m/s，正向力 N = ', ' m/s, normal force N = ') + num(ev.nmg, 2) + ' mg');
          emit('loopTop', { v: ev.v, nmg: ev.nmg });
          break;
        }
        case 'loopDone': {
          run.loopDone++;
          setStatus(T('繞完迴圈！頂點的正向力 N = ', 'Round the loop! Normal force at the top N = ') + num(ev.ntopMg, 2) + ' mg' + T('。', '.'));
          emit('loopDone', { v: ev.v, ntopMg: ev.ntopMg, nMinMg: ev.nMinMg, loops: run.loopDone });
          break;
        }
        case 'detach':
        case 'leave': {
          // 用離軌瞬間沿軌道的速度方向（v 的正負）決定車頭方向
          const G = state.tr.geom(ev.u);
          run.airSign = (ev.vx * G.tx + ev.vy * G.ty) >= 0 ? 1 : -1;
          run.cur = [[ev.x, ev.y]];
          run.lastFlightT = ev.t;
          sfx('leave');
          fx('ring', ev.x, ev.y, colors['b-wave']);
          if (ev.type === 'detach') {
            setStatus(T('正向力降到 0，自由小車離開軌道！（離迴圈底部 ', 'The normal force dropped to zero — the free car left the track! (') +
              (ev.inLoop ? num(ev.yRel, 2) + T(' m 高）', ' m above the bottom of the loop)') : T('離地 ', 'height ') + num(ev.y, 2) + T(' m）', ' m)')));
          } else setStatus(T('小車從軌道末端飛出。', 'The car flew off the end of the track.'));
          emit(ev.type, { x: ev.x, y: ev.y, v: ev.v, inLoop: !!ev.inLoop, yRel: ev.inLoop ? ev.yRel : null, phi: ev.inLoop ? ev.phi : null });
          break;
        }
        case 'attach': {
          if (run.cur) { run.cur.push([ev.x, ev.y]); run.flights.push(run.cur); run.cur = null; }
          sfx('attach');
          fx('ring', ev.x, ev.y, colors.equi);
          const lost = 0.5 * state.m * ev.vn * ev.vn;
          setStatus(T('落回軌道：垂直軌道的速度損失，', 'Back on the track: the velocity across the track is lost and ') + fmtE(lost) + T(' 變成熱能。', ' becomes heat.'));
          updateRow(T('落回軌道', 'landed on track'));
          emit('attach', { x: ev.x, y: ev.y, vn: ev.vn, flight: ev.flight, inLoop: !!ev.inLoop, yRel: ev.inLoop ? ev.yRel : null });
          break;
        }
        case 'land': {
          if (run.cur) { run.cur.push([ev.x, 0]); run.flights.push(run.cur); run.cur = null; }
          sfx('land');
          fx('dust', ev.x, 0, colors.muted);
          setStatus(T('落地：x = ', 'Hit the ground at x = ') + num(ev.x, 2) + T(' m，動能全部變成熱能。', ' m; all its kinetic energy became heat.'));
          endRun(T('落地 x = ', 'ground x = ') + num(ev.x, 2) + ' m');
          emit('land', { x: ev.x, v: ev.v, flight: ev.flight, fromEnd: !!ev.fromEnd });
          break;
        }
        case 'crash': {
          if (run.cur) { run.cur.push([ev.x, ev.y]); run.flights.push(run.cur); run.cur = null; }
          sfx('land');
          fx('dust', ev.x, ev.y, colors.muted);
          setStatus(T('小車撞上軌道的背面停住了。', 'The car hit the underside of the track and stopped.'));
          endRun(T('撞上軌道', 'hit the track'));
          emit('crash', { x: ev.x, y: ev.y });
          break;
        }
        case 'out': {
          if (run.cur) { run.cur.push([ev.x, ev.y]); run.flights.push(run.cur); run.cur = null; }
          setStatus(T('小車飛出畫面了。', 'The car flew out of the picture.'));
          endRun(T('飛出畫面', 'out of view'));
          emit('out', { x: ev.x, y: ev.y, fromEnd: !!ev.fromEnd });
          break;
        }
        case 'turn': {
          if (!run.turned) {
            run.turned = true;
            const lvl = sim.start.y + P.v0 * P.v0 / (2 * P.g);
            setStatus(T('在離地 ', 'Turned back at a height of ') + num(ev.y, 2) + T(' m 處折返', ' m') +
              (P.mu === 0 ? T('（能量水位 ', ' (energy level ') + num(lvl, 2) + T(' m）。', ' m).') : T('，比出發時低：一部分力學能變成了熱能。', ', lower than the start: some mechanical energy has become heat.')));
            updateRow(T('來回擺盪', 'swinging'));
          }
          break;
        }
        case 'stop': {
          sfx('stop');
          fx('ring', ev.x, ev.y, colors.accent);
          const e = energyAt(ev.y, 0, sim.q, sim.qi);
          setStatus(T('小車停住了：離地 ', 'The car stopped at a height of ') + num(ev.y, 2) + T(' m，熱能 Q = ', ' m; heat Q = ') + fmtE(e.Q) + T('。', '.'));
          endRun(T('停在 x = ', 'stopped at x = ') + num(ev.x, 2) + ' m');
          emit('stop', {
            x: ev.x, y: ev.y, slope: ev.slope, path: ev.path, hAboveLow: ev.y - state.tr.yLow, inLoop: !!ev.inLoop,
            phi: ev.inLoop ? ev.phi : null, loopDone: run.loopDone, bottomPassed: run.bottomV >= 0, K: e.K, U: e.U, Q: e.Q, E: e.E
          });
          break;
        }
      }
    });
  }
  function endRun(text) {
    const run = state.run;
    if (run.ended) return;
    run.ended = true;
    state.running = false;
    stopVoice();
    if (text) updateRow(text);
    pushSample(true);
    updatePlayButton();
  }

  // ---------- 紀錄表 ----------
  function renderTable() {
    const tb = $('recTable').querySelector('tbody');
    if (!state.rows.length) {
      tb.innerHTML = '<tr class="empty"><td colspan="9">' + T('還沒有紀錄。', 'No runs yet.') + '</td></tr>';
      return;
    }
    tb.innerHTML = state.rows.map(function (r) {
      const pred = C.speedFromDrop(r.g, r.h0, r.v0);
      return '<tr><th>' + r.n + '</th><td class="res">' + carName(r.mode) + '</td><td>' + num(r.g, 2) + '</td><td>' + num(r.mu, 3) +
        '</td><td>' + num(r.h0, 2) + '</td><td>' + num(r.vb, 2) + '</td><td>' + num(pred, 2) + '</td><td>' + fmtE(r.Q) + '</td><td class="res">' + (r.res || '…') + '</td></tr>';
    }).join('');
  }

  // ---------- 主迴圈 ----------
  let raf = 0, lastTs = 0, lastReadout = 0;
  function requestDraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(ts) {
    raf = 0;
    const dtReal = lastTs ? Math.min(1 / 30, Math.max(0, (ts - lastTs) / 1000)) : 0;
    lastTs = ts;
    if (state.running && simActive() && !state.drag) {
      const dt = dtReal * (state.slow ? SLOW : 1);
      if (dt > 0) {
        const evs = C.advance(state.tr, state.P, state.sim, dt);
        if (state.sim.phase === 'air' && state.run.cur && state.sim.t - state.run.lastFlightT > 0.02) {
          const K = C.kinematics(state.tr, state.P, state.sim);
          state.run.cur.push([K.x, K.y]);
          state.run.lastFlightT = state.sim.t;
        }
        pushSample(false);
        handleEvents(evs);
      }
    }
    updateVoice();
    if (ts - lastReadout > 90 || !state.running) { updateReadouts(); lastReadout = ts; }
    periodicSay(ts);
    draw();
    const fxOn = state.fx.some(function (f) { return ts - f.t0 < 900; });
    if ((state.running && simActive()) || fxOn) raf = requestAnimationFrame(frame);
    else lastTs = 0;
  }

  // ---------- 讀數 ----------
  const htmlCache = {};
  function setHTML(id, h) { if (htmlCache[id] !== h) { htmlCache[id] = h; $(id).innerHTML = h; } }
  function updateReadouts() {
    const s = state.sim, P = state.P;
    const K = C.kinematics(state.tr, P, s), E = energiesNow();
    setHTML('rT', num(s.t, 2) + ' s');
    setHTML('rV', num(K.speed, 2) + ' m/s');
    setHTML('rY', num(K.y, 2) + ' m');
    if (K.onTrack) {
      const N = state.m * K.N;
      setHTML('rN', num(N / 1000, 2) + ' kN<small>' + num(K.N / P.g, 2) + ' mg' + (P.mode === 'rail' && K.N < 0 ? T('（軌道把車拉向軌道）', ' (the rail pulls the car toward it)') : '') + '</small>');
    } else setHTML('rN', '0<small>' + T('在空中', 'in the air') + '</small>');
    setHTML('rK', fmtE(E.K));
    setHTML('rU', fmtE(E.U));
    setHTML('rEm', fmtE(E.Emech));
    setHTML('rQ', fmtE(E.Q) + (E.Qi > 0 ? '<small>' + T('摩擦 ', 'friction ') + fmtE(E.Qf) + T('、撞擊 ', ', impacts ') + fmtE(E.Qi) + '</small>' : ''));
    setHTML('rE', fmtE(E.E));
  }
  function updatePrediction() {
    const tr = state.tr, P = state.P || params(), s = state.sim;
    const y0 = s ? s.start.y : tr.heightAt(state.x0);
    const h0 = y0 - tr.yLow;
    setHTML('pH', num(h0, 2) + ' m');
    setHTML('pV', num(C.speedFromDrop(P.g, h0, P.v0), 2) + ' m/s');
    setHTML('pL', num(y0 + P.v0 * P.v0 / (2 * P.g), 2) + ' m');
    if (tr.loop) {
      const hl = y0 - tr.loop.ya, need = C.loopCriticalHeight(tr.loop.R);
      setHTML('pLoop', 'h ≥ ' + num(need, 2) + ' m<small>2.5R' + T('；目前 ', '; now ') + num(hl, 2) + ' m' +
        (P.v0 ? T('＋初速', ' + v0') : '') + '</small>');
    } else setHTML('pLoop', T('沒有迴圈', 'no loop'));
    const sel = state.drag && state.drag.type === 'pt' ? state.drag.i : (kb && kb.focused() && kb.index() >= 2 ? kb.index() - 2 : -1);
    const info = $('ptInfo');
    if (sel >= 0 && state.def.pts[sel]) {
      const p = state.def.pts[sel];
      info.textContent = T('控制點 ', 'Control point ') + (sel + 1) + T('：x = ', ': x = ') + num(p[0], 2) + ' m, y = ' + num(p[1], 2) + ' m';
    } else info.textContent = T('拖曳軌道上的圓形把手可以改變軌道形狀。', 'Drag the round handles on the track to change its shape.');
  }

  // ---------- 背景（格線、地面、軌道） ----------
  function buildBackground() {
    const key = [cw, ch, dpr, D.ver, state.trVer, state.preset].join('|');
    if (key === bgKey) return;
    bgKey = key;
    bg.width = cv.width; bg.height = cv.height;
    const c = bgctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    D.backdrop(c, cw, ch);
    const P = L.plot;
    // 天空：上方極淡的色調
    const sky = c.createLinearGradient(0, P.y, 0, P.y + P.h);
    sky.addColorStop(0, alpha(colors.accent, colors.dark ? 0.06 : 0.05));
    sky.addColorStop(1, alpha(colors.accent, 0));
    c.fillStyle = sky;
    c.fillRect(P.x, P.y, P.w, P.h);
    D.grid(c, P.x, P.y, P.x + P.w, P.y + P.h, 5 * L.k, L.k, X(0), Y(0));
    // 座標刻度
    c.font = fnt(L.narrow ? 10 : 11);
    c.fillStyle = colors.muted;
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let y = 0; y <= WH; y += 5) c.fillText(y + (y === 15 ? ' m' : ''), P.x - 5, Y(y));
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let x = 0; x <= 30; x += 5) c.fillText(x + (x === 30 ? ' m' : ''), X(x), Y(0) + L.groundPx + 4);
    // 地面
    const gy = Y(0);
    const earth = mix(colors.equi, colors.text, 0.45);
    const gg = c.createLinearGradient(0, gy, 0, gy + L.groundPx);
    gg.addColorStop(0, alpha(earth, colors.dark ? 0.5 : 0.3));
    gg.addColorStop(1, alpha(earth, colors.dark ? 0.25 : 0.12));
    c.fillStyle = gg;
    c.fillRect(P.x, gy, P.w, L.groundPx);
    c.save();
    c.beginPath(); c.rect(P.x, gy, P.w, L.groundPx); c.clip();
    c.strokeStyle = alpha(earth, colors.dark ? 0.45 : 0.3);
    c.lineWidth = 1;
    c.beginPath();
    for (let x = P.x - L.groundPx; x < P.x + P.w; x += 7) { c.moveTo(x, gy + L.groundPx); c.lineTo(x + L.groundPx, gy); }
    c.stroke();
    c.restore();
    c.strokeStyle = alpha(earth, colors.dark ? 0.9 : 0.7);
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(P.x, gy); c.lineTo(P.x + P.w, gy); c.stroke();
    // 跳台的落點標靶
    const target = C.PRESETS[state.preset].target;
    if (target) {
      const x0 = X(target - 0.25), x1 = X(target + 0.25);
      c.fillStyle = alpha(colors.probe, colors.dark ? 0.35 : 0.25);
      c.fillRect(X(target - 1), gy - 3, X(target + 1) - X(target - 1), 3);
      c.fillStyle = colors.probe;
      c.fillRect(x0, gy - 4, x1 - x0, 4);
      c.strokeStyle = colors.probe; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(X(target), gy - 4); c.lineTo(X(target), gy - 22); c.stroke();
      c.fillStyle = colors.probe;
      c.beginPath(); c.moveTo(X(target), gy - 22); c.lineTo(X(target) + 11, gy - 18); c.lineTo(X(target), gy - 14); c.closePath(); c.fill();
      D.pill(c, T('目標 ', 'Target ') + target + ' m', X(target), gy - 25, colors.probe, 'center', fnt(L.narrow ? 10 : 11, 600));
    }
    drawTrack(c);
  }
  /** 支架、枕木與軌道（管狀） */
  function drawTrack(c) {
    const tr = state.tr, S = state.trS, k = L.k, tw = L.tw;
    const mech = colors['b-mech'];
    // 支架：每隔約 2 m 一根柱子
    c.save();
    const postW = clamp(0.09 * k, 1.4, 3);
    const posts = [];
    for (let x = Math.ceil(tr.xMin / 2.5) * 2.5; x <= tr.xMax + 1e-9; x += 2.5) posts.push(x);
    if (tr.loop) posts.push(tr.loop.cx - tr.loop.R, tr.loop.cx + tr.loop.R);
    posts.forEach(function (x) {
      let y;
      if (tr.loop && Math.abs(x - (tr.loop.cx - tr.loop.R)) < 1e-9) y = tr.loop.cy;
      else if (tr.loop && Math.abs(x - (tr.loop.cx + tr.loop.R)) < 1e-9) y = tr.loop.cy;
      else {
        if (tr.loop && x > tr.loop.cx - tr.loop.R + 0.3 && x < tr.loop.cx + tr.loop.R - 0.3) return; // 迴圈底下不放柱子
        y = tr.heightAt(x);
      }
      if (!(y > 0.35)) return;
      const px = X(x), y0 = Y(y) + tw * 0.5, y1 = Y(0);
      const gpost = c.createLinearGradient(px - postW, 0, px + postW, 0);
      gpost.addColorStop(0, alpha(colors.muted, colors.dark ? 0.4 : 0.32));
      gpost.addColorStop(0.5, alpha(shade(colors.muted, 0.35), colors.dark ? 0.42 : 0.28));
      gpost.addColorStop(1, alpha(shade(colors.muted, -0.3), colors.dark ? 0.45 : 0.38));
      c.fillStyle = gpost;
      c.fillRect(px - postW / 2, y0, postW, y1 - y0);
      c.fillStyle = alpha(colors.muted, 0.55);
      D.roundRect(c, px - postW * 2.2, y1 - 2, postW * 4.4, 3, 1.5); c.fill();
    });
    c.restore();
    // 枕木：沿軌道每 0.6 m 一根，畫在軌道外側（小車的另一側）
    c.save();
    c.strokeStyle = alpha(shade(mech, -0.45), colors.dark ? 0.75 : 0.55);
    c.lineWidth = Math.max(1, tw * 0.28);
    c.lineCap = 'round';
    c.beginPath();
    let acc = 0;
    for (let i = 1; i < S.length; i++) {
      const dx = S[i].x - S[i - 1].x, dy = S[i].y - S[i - 1].y, ds = Math.hypot(dx, dy);
      acc += ds;
      if (acc < 0.6 || ds < 1e-9) continue;
      acc = 0;
      const tx = dx / ds, ty = dy / ds, nx = -ty, ny = tx; // 世界座標的法線（小車那一側）
      const px = X(S[i].x), py = Y(S[i].y);
      c.moveTo(px + nx * tw * 0.15, py - ny * tw * 0.15);
      c.lineTo(px - nx * tw * 1.15, py + ny * tw * 1.15);
    }
    c.stroke();
    c.restore();
    // 軌道
    D.tube(c, function (g) {
      S.forEach(function (p, i) { if (i) g.lineTo(X(p.x), Y(p.y)); else g.moveTo(X(p.x), Y(p.y)); });
    }, mech, tw);
  }

  // ---------- 畫面 ----------
  function draw() {
    if (!L || !state.sim) return;
    buildBackground();
    const c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    c.drawImage(bg, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const P = L.plot;
    c.save();
    c.beginPath(); c.rect(P.x - 2, 0, P.w + 4, Y(0) + L.groundPx); c.clip();
    drawZeroLine(c);
    if (state.show.trail) drawFlights(c);
    if (state.show.pts) drawControlPoints(c);
    drawStartFlag(c);
    if (state.show.level) drawLevel(c);
    drawFx(c);
    drawCar(c);
    c.restore();
    drawZeroTab(c);
    drawFlash(c);
    if (L.bars) drawBarsV(c, L.bars);
    drawKbFocus(c);
    drawGraph();
  }

  /** 位能零點（藍色虛線）與左側可拖曳的標籤 */
  function zeroTabRect() {
    const y = Y(state.yref);
    const w = L.narrow ? 26 : 32, h = 18;
    return { x: L.mL - w - 1, y: y - h / 2, w: w, h: h };
  }
  function drawZeroLine(c) {
    const y = Y(state.yref), P = L.plot;
    c.save();
    c.strokeStyle = alpha(colors.neg, 0.75);
    c.lineWidth = 1.5;
    c.setLineDash([7, 5]);
    c.beginPath(); c.moveTo(P.x, y); c.lineTo(P.x + P.w, y); c.stroke();
    c.restore();
  }
  function drawZeroTab(c) {
    const r = zeroTabRect();
    const hot = state.hover === 'ref' || (state.drag && state.drag.type === 'ref');
    c.save();
    c.shadowColor = D.shadowInk(0.25); c.shadowBlur = hot ? 6 : 3; c.shadowOffsetY = 1;
    D.roundRect(c, r.x, r.y, r.w, r.h, 5);
    c.fillStyle = hot ? shade(colors.neg, 0.1) : colors.neg;
    c.fill();
    c.restore();
    // 指向零點線的小三角
    c.fillStyle = colors.neg;
    c.beginPath(); c.moveTo(r.x + r.w, r.y + r.h / 2 - 5); c.lineTo(r.x + r.w + 5, r.y + r.h / 2); c.lineTo(r.x + r.w, r.y + r.h / 2 + 5); c.closePath(); c.fill();
    c.font = fnt(L.narrow ? 10 : 11, 700, true);
    c.fillStyle = '#fff';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('U=0', r.x + r.w / 2, r.y + r.h / 2 + 0.5);
  }
  function drawFlights(c) {
    const col = state.mode === 'free' ? colors['b-wave'] : colors['b-optics'];
    const line = function (pts, a) {
      if (!pts || pts.length < 2) return;
      c.save();
      c.strokeStyle = alpha(col, a);
      c.lineWidth = 2;
      c.setLineDash([2, 5]);
      c.lineCap = 'round';
      c.beginPath();
      pts.forEach(function (p, i) { if (i) c.lineTo(X(p[0]), Y(p[1])); else c.moveTo(X(p[0]), Y(p[1])); });
      c.stroke();
      c.restore();
    };
    state.ghosts.forEach(function (g) { g.flights.forEach(function (f) { line(f, 0.25); }); });
    state.run.flights.forEach(function (f) { line(f, 0.7); });
    if (state.run.cur) {
      const K = C.kinematics(state.tr, state.P, state.sim);
      line(state.run.cur.concat([[K.x, K.y]]), 0.85);
    }
  }
  function hitR() { return L.narrow ? 16 : 13; }
  function drawControlPoints(c) {
    const pts = state.def.pts, lp = state.def.loop;
    c.save();
    c.strokeStyle = alpha(colors.muted, 0.55);
    c.lineWidth = 1;
    c.setLineDash([3, 4]);
    c.beginPath();
    pts.forEach(function (p, i) { if (i) c.lineTo(X(p[0]), Y(p[1])); else c.moveTo(X(p[0]), Y(p[1])); });
    c.stroke();
    c.restore();
    pts.forEach(function (p, i) {
      const hot = (state.hover && state.hover.type === 'pt' && state.hover.i === i) || (state.drag && state.drag.type === 'pt' && state.drag.i === i) ||
        (kb && kb.focused() && kb.index() === i + 2);
      const r = (L.narrow ? 5 : 6) * (hot ? 1.3 : 1);
      const px = X(p[0]), py = Y(p[1]);
      const isAnchor = lp && i === lp.at;
      c.save();
      c.shadowColor = D.shadowInk(0.3); c.shadowBlur = 4; c.shadowOffsetY = 1;
      c.beginPath();
      if (isAnchor) { c.moveTo(px, py - r * 1.25); c.lineTo(px + r * 1.25, py); c.lineTo(px, py + r * 1.25); c.lineTo(px - r * 1.25, py); c.closePath(); }
      else c.arc(px, py, r, 0, Math.PI * 2);
      c.fillStyle = colors.surface;
      c.fill();
      c.restore();
      c.lineWidth = hot ? 2.5 : 2;
      c.strokeStyle = hot ? colors.accent : shade(colors['b-mech'], colors.dark ? 0.1 : -0.1);
      c.stroke();
      c.fillStyle = alpha(colors['b-mech'], 0.85);
      c.beginPath(); c.arc(px, py, Math.max(1.5, r * 0.35), 0, Math.PI * 2); c.fill();
      if (hot) {
        D.pill(c, '(' + num(p[0], 2) + ', ' + num(p[1], 2) + ') m', px, py - r - 6, colors.accent, 'center', fnt(L.narrow ? 10 : 11, 600));
      }
    });
    if (lp) {
      const L2 = state.tr.loop;
      c.font = fnt(L.narrow ? 10 : 11, 600, true);
      D.haloText(c, 'R = ' + num(L2.R, 2) + ' m', X(L2.cx), Y(L2.cy) + 4, alpha(colors.muted, 0.95), 'center', 'middle', fnt(L.narrow ? 10 : 11, 600));
      c.save();
      c.strokeStyle = alpha(colors.muted, 0.45); c.lineWidth = 1; c.setLineDash([2, 3]);
      c.beginPath(); c.moveTo(X(L2.cx), Y(L2.cy)); c.lineTo(X(L2.cx + L2.R * Math.cos(-0.6)), Y(L2.cy + L2.R * Math.sin(-0.6))); c.stroke();
      c.restore();
    }
  }
  function drawStartFlag(c) {
    const s = state.sim.start;
    const px = X(s.x), py = Y(s.y);
    const h = L.narrow ? 16 : 22;
    c.save();
    c.strokeStyle = alpha(colors.text, 0.6); c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(px, py - L.tw * 0.4); c.lineTo(px, py - h - L.tw * 0.4); c.stroke();
    c.fillStyle = colors.accent;
    c.beginPath(); c.moveTo(px, py - h - L.tw * 0.4); c.lineTo(px + h * 0.55, py - h * 0.78 - L.tw * 0.4); c.lineTo(px, py - h * 0.56 - L.tw * 0.4); c.closePath(); c.fill();
    c.restore();
  }
  /** 能量水位：y + v²/2g（力學能全部變成位能時的高度） */
  function drawLevel(c) {
    const K = C.kinematics(state.tr, state.P, state.sim);
    const lvl = K.y + K.speed * K.speed / (2 * state.P.g);
    const P = L.plot;
    let y = Y(lvl), over = false;
    if (y < P.y + 2) { y = P.y + 2; over = true; }
    c.save();
    c.strokeStyle = alpha(colors.accent, 0.8);
    c.lineWidth = 1.5;
    c.setLineDash([10, 4, 2, 4]);
    c.beginPath(); c.moveTo(P.x, y); c.lineTo(P.x + P.w, y); c.stroke();
    c.restore();
    const txt = T('能量水位 ', 'Energy level ') + num(lvl, 2) + ' m' + (over ? ' ↑' : '');
    // 標籤放在右端、中間或左端：選離小車最遠的位置（出發旗次要），免得蓋住小車
    c.font = fnt(L.narrow ? 10 : 11, 600);
    const w = c.measureText(txt).width + 16, cx = X(K.x), fx = X(state.sim.start.x);
    const gap = function (x, a, b) { return x < a ? a - x : x > b ? x - b : 0; };
    const cands = [[P.x + P.w - 4, 'right', P.x + P.w - 4 - w], [P.x + P.w / 2, 'center', P.x + P.w / 2 - w / 2], [P.x + 4, 'left', P.x + 4]];
    let best = cands[0], bestS = -1;
    cands.forEach(function (o, i) {
      const sc = Math.min(gap(cx, o[2], o[2] + w), 80) + 0.3 * Math.min(gap(fx, o[2], o[2] + w), 40) + (i ? 0 : 10);
      if (sc > bestS) { bestS = sc; best = o; }
    });
    D.pill(c, txt, best[0], over ? y + 18 : y - 3, colors.accent, best[1], fnt(L.narrow ? 10 : 11, 600));
  }
  function drawFx(c) {
    const now = performance.now();
    state.fx = state.fx.filter(function (f) { return now - f.t0 < 900; });
    state.fx.forEach(function (f) {
      const u = (now - f.t0) / 900;
      if (f.kind === 'dust') {
        c.save();
        for (let i = 0; i < 7; i++) {
          const a = Math.PI * (0.1 + 0.8 * i / 6), d = 6 + 26 * u;
          c.fillStyle = alpha(f.color, 0.45 * (1 - u));
          c.beginPath(); c.arc(X(f.x) + Math.cos(a) * d, Y(f.y) - Math.sin(a) * d * 0.6, 2.5 + 3 * u, 0, Math.PI * 2); c.fill();
        }
        c.restore();
      } else D.ripple(c, X(f.x), Y(f.y), 8, u, f.color);
    });
  }

  /** 小車：沿切線方向的車身、四個輪子（軌道車另有扣住軌道底部的輪子） */
  function carPose() {
    const s = state.sim, K = C.kinematics(state.tr, state.P, s);
    let tx, ty, face;
    if (K.onTrack) {
      tx = K.tx; ty = K.ty;
      face = s.phase === 'track' && s.v !== 0 ? Math.sign(s.v) : (s.dir || 1);
    } else if (s.phase === 'landed') {
      tx = 1; ty = 0; face = s.air && s.air.vx < 0 ? -1 : 1;
    } else {
      const sp = Math.hypot(K.vx, K.vy);
      const a = s.air || {};
      const vx = sp > 1e-9 ? K.vx : a.vx || 1, vy = sp > 1e-9 ? K.vy : (a.vy || 0) - state.P.g * (a.tau || 0);
      const n = Math.hypot(vx, vy) || 1;
      const sg = state.run.airSign || 1;
      tx = sg * vx / n; ty = sg * vy / n; face = sg;
    }
    const nx = -ty, ny = tx; // 世界座標：小車所在的一側
    const lift = L.tw / 2 + L.Lc * 0.12 * 1.3 + L.Lc * 0.36 / 2; // 接觸點到車身中心（px）
    const px = X(K.x), py = Y(K.y);
    return { K: K, tx: tx, ty: ty, nx: nx, ny: ny, face: face, px: px, py: py, cx: px + nx * lift, cy: py - ny * lift, ang: Math.atan2(-ty, tx) };
  }
  function drawCar(c) {
    const pose = carPose(), K = pose.K;
    const Lc = L.Lc, hc = Lc * 0.36, rw = Lc * 0.12, tw = L.tw;
    const body = state.P.mode === 'free' ? colors['b-wave'] : colors['b-optics'];
    // 在空中：地面上的影子
    if (!K.onTrack) D.contactShadow(c, pose.px, Y(0), Lc * 0.45, clamp(K.y / 12, 0, 1));
    c.save();
    c.translate(pose.px, pose.py);
    c.rotate(pose.ang);
    if (pose.face < 0) c.scale(-1, 1);
    const yW = -(tw / 2 + rw * 0.85);    // 上方輪子中心（輪子壓在軌道上）
    const yB0 = -(tw / 2 + rw * 1.3);    // 車身底
    const yB1 = yB0 - hc;                // 車身頂
    // 軌道車：扣住軌道底部的輪子與支架
    if (state.P.mode === 'rail') {
      // 底盤：從車身繞到軌道下方的扣件（軌道車不會離開軌道）
      c.strokeStyle = alpha(colors.field, 0.85);
      c.lineWidth = Math.max(1.2, rw * 0.32);
      c.lineCap = 'round';
      [-0.28, 0.28].forEach(function (f) {
        const xb = f * Lc;
        c.beginPath(); c.moveTo(xb - rw * 1.2, yB0); c.lineTo(xb - rw * 1.2, tw / 2 + rw * 0.55); c.lineTo(xb, tw / 2 + rw * 0.55); c.stroke();
      });
      [-0.28, 0.28].forEach(function (f) { D.ball(c, f * Lc, tw / 2 + rw * 0.55, rw * 0.55, colors.field, { shadow: false, glow: 0 }); });
    }
    // 車身
    D.block(c, -Lc / 2, yB1, Lc, hc, body, { r: hc * 0.38 });
    // 椅背與車頭
    c.fillStyle = alpha(shade(body, -0.35), 0.95);
    D.roundRect(c, -Lc / 2 + Lc * 0.08, yB1 - hc * 0.55, Lc * 0.16, hc * 0.75, 2.5); c.fill();
    D.roundRect(c, Lc * 0.02, yB1 - hc * 0.4, Lc * 0.14, hc * 0.6, 2.5); c.fill();
    c.fillStyle = alpha(shade(body, 0.75), 0.75);
    c.beginPath(); c.moveTo(Lc / 2 - 2, yB1 + 2); c.lineTo(Lc / 2 + Lc * 0.08, yB0 - 1); c.lineTo(Lc / 2 - 2, yB0 - 1); c.closePath(); c.fill();
    c.fillStyle = alpha(shade(body, 0.8), 0.6);
    c.fillRect(-Lc / 2 + 3, yB1 + hc * 0.42, Lc - 6, Math.max(1, hc * 0.12));
    // 輪子
    [-0.28, 0.28].forEach(function (f) { D.ball(c, f * Lc, yW, rw, colors.field, { glow: 0 }); });
    c.restore();
    // 向量（由車身中心畫起）
    const k = L.k, s = state.sim, P = state.P;
    const capped = function (len) { return len > MAX_ARROW ? MAX_ARROW : len; };
    const arr = function (dx, dy, lenM, color, label, w) {
      if (lenM * k < 3) return;
      const Lm = capped(lenM);
      D.arrow(c, pose.cx, pose.cy, pose.cx + dx * Lm * k, pose.cy - dy * Lm * k, color, w || 2.6, { label: (lenM > MAX_ARROW ? '≈' : '') + label });
    };
    if (state.show.f) {
      arr(0, -1, SCALE_F, colors.field, 'mg', 2.4);
      if (K.onTrack && s.phase === 'track') {
        const nmg = K.N / P.g;
        if (Math.abs(nmg) > 1e-6) arr(Math.sign(nmg) * K.nx, Math.sign(nmg) * K.ny, Math.abs(nmg) * SCALE_F, colors.probe, 'N', 2.4);
        if (P.mu > 0 && s.v !== 0) {
          const f = P.mu * Math.abs(nmg);
          arr(-Math.sign(s.v) * K.tx, -Math.sign(s.v) * K.ty, f * SCALE_F, colors.equi, 'f', 2.2);
        }
      } else if (K.onTrack && (s.phase === 'stopped')) {
        // 靜止在軌道上：正向力與靜摩擦力平衡重力
        const G = K.G, nmg = G.tx;
        arr(K.nx, K.ny, Math.abs(nmg) * SCALE_F, colors.probe, 'N', 2.4);
        const fs = -G.ty; // 沿切線（u 增加方向）的靜摩擦力（單位 mg）
        if (Math.abs(fs) > 1e-6) arr(Math.sign(fs) * K.tx, Math.sign(fs) * K.ty, Math.abs(fs) * SCALE_F, colors.equi, 'f', 2.2);
      }
    }
    if (state.show.v && K.speed > 0.05) {
      const ux = K.onTrack ? Math.sign(s.v) * K.tx : K.vx / K.speed, uy = K.onTrack ? Math.sign(s.v) * K.ty : K.vy / K.speed;
      arr(ux, uy, K.speed * SCALE_V, colors.pos, 'v', 2.8);
    }
  }
  function drawFlash(c) {
    if (state.msg && performance.now() - state.msg.t0 < 3000) {
      D.pill(c, state.msg.text, L.plot.x + L.plot.w / 2, L.plot.y + (L.narrow ? 24 : 30), colors.pos, 'center', fnt(L.narrow ? 10 : 12, 600));
    }
  }
  /** 時間與速率（長條圖標題下方） */
  function tvText() {
    const K = C.kinematics(state.tr, state.P, state.sim);
    return 't = ' + num(state.sim.t, 1) + ' s   v = ' + num(K.speed, 2) + ' m/s';
  }

  // ---------- 能量長條圖 ----------
  /** 長條圖與能量圖共用的刻度：涵蓋這一次所有可能的 K、U、E（J） */
  function energyRange() {
    const m = state.m, g = state.P.g, yr = state.yref, s = state.sim;
    const eTot = s.e0; // 每公斤，零點在地面
    const yTop = Math.max(state.tr.yMax, s.start.y + state.P.v0 * state.P.v0 / (2 * g));
    const E = m * eTot - m * g * yr;
    const lo = Math.min(0, -m * g * yr, E);
    const hi = Math.max(m * eTot, m * g * (yTop - yr), E, 1e-9);
    return { lo: lo - (hi - lo) * 0.02, hi: hi + (hi - lo) * 0.1 + 1e-9 };
  }
  function niceStep(span, n) {
    const raw = span / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
  }
  function unitE(rng) { return Math.max(Math.abs(rng.lo), Math.abs(rng.hi)) >= 2000 ? { d: 1000, n: 'kJ' } : { d: 1, n: 'J' }; }
  function barItems(E) {
    return [
      { key: 'K', v: E.K, col: colors.pos, name: T('動能', 'kinetic') },
      { key: 'U', v: E.U, col: colors.neg, name: T('位能', 'potential') },
      { key: 'Q', v: E.Q, sub: E.Qi, col: colors.equi, name: T('熱能', 'heat') },
      { key: 'E', v: E.E, col: colors.accent, name: T('總能', 'total') }
    ];
  }
  /** 直立長條圖（寬畫面：場景右側） */
  function drawBarsV(c, R) {
    const E = energiesNow(), rng = energyRange();
    c.save();
    D.roundRect(c, R.x, R.y, R.w, R.h, 9);
    c.fillStyle = alpha(colors.surface, colors.dark ? 0.35 : 0.7);
    c.fill();
    c.strokeStyle = alpha(colors.border, 0.9); c.lineWidth = 1; c.stroke();
    c.restore();
    c.font = fnt(12, 700);
    c.fillStyle = colors.text; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillText(T('能量', 'Energy'), R.x + 10, R.y + 8);
    const top = R.y + 48, bot = R.y + R.h - 40;
    const yOf = function (v) { return bot - (v - rng.lo) / (rng.hi - rng.lo) * (bot - top); };
    const y0 = yOf(0);
    const items = barItems(E);
    const slot = (R.w - 16) / 4, bw = Math.min(30, slot * 0.6);
    // 格線
    const u = unitE(rng), step = niceStep((rng.hi - rng.lo) / u.d, 4) * u.d;
    c.save();
    c.strokeStyle = alpha(colors.text, colors.dark ? 0.08 : 0.07); c.lineWidth = 1;
    c.beginPath();
    for (let v = Math.ceil(rng.lo / step) * step; v <= rng.hi + 1e-9; v += step) { const yy = Math.round(yOf(v)) + 0.5; c.moveTo(R.x + 8, yy); c.lineTo(R.x + R.w - 8, yy); }
    c.stroke();
    c.restore();
    items.forEach(function (it, i) {
      const cx = R.x + 8 + slot * (i + 0.5);
      const yv = yOf(it.v);
      const yt = Math.min(y0, yv), h = Math.abs(yv - y0);
      if (h >= 0.5) {
        c.save();
        c.shadowColor = D.shadowInk(0.2); c.shadowBlur = 4; c.shadowOffsetY = 1;
        const gr = c.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0);
        gr.addColorStop(0, shade(it.col, 0.25)); gr.addColorStop(0.45, it.col); gr.addColorStop(1, shade(it.col, -0.2));
        c.fillStyle = gr;
        D.roundRect(c, cx - bw / 2, yt, bw, h, Math.min(4, h / 2));
        c.fill();
        c.restore();
        // 熱能：撞擊生熱的部分加斜線
        if (it.key === 'Q' && it.sub > 0) {
          const hs = Math.abs(yOf(it.sub) - y0);
          c.save();
          D.roundRect(c, cx - bw / 2, y0 - hs, bw, hs, Math.min(4, hs / 2)); c.clip();
          c.strokeStyle = alpha(shade(it.col, 0.7), 0.8); c.lineWidth = 1.5;
          c.beginPath();
          for (let yy = y0 - hs - bw; yy < y0 + bw; yy += 6) { c.moveTo(cx - bw / 2, yy + bw); c.lineTo(cx + bw / 2, yy); }
          c.stroke();
          c.restore();
        }
      }
      // 數值
      c.font = fnt(10.5, 600);
      c.textAlign = 'center';
      const vtxt = fmtE(it.v);
      if (it.v >= 0) { c.textBaseline = 'bottom'; D.haloText(c, vtxt, cx, Math.min(yt, y0) - 3, it.col, 'center', 'bottom', fnt(10.5, 600)); }
      else { D.haloText(c, vtxt, cx, yv + 3, it.col, 'center', 'top', fnt(10.5, 600)); }
      // 名稱
      D.haloText(c, it.key, cx, bot + 14, it.col, 'center', 'middle', fnt(14, 700, true));
      // 名稱太長（英文）就縮小字體，還放不下就不寫
      let fpx = 10;
      c.font = fnt(fpx, 500);
      while (fpx > 8 && c.measureText(it.name).width > slot - 3) { fpx -= 0.5; c.font = fnt(fpx, 500); }
      if (c.measureText(it.name).width <= slot - 3) D.haloText(c, it.name, cx, bot + 29, colors.muted, 'center', 'middle', fnt(fpx, 500));
    });
    // 零線
    c.strokeStyle = alpha(colors.text, 0.55); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(R.x + 8, Math.round(y0) + 0.5); c.lineTo(R.x + R.w - 8, Math.round(y0) + 0.5); c.stroke();
    c.font = fnt(10); c.fillStyle = colors.muted; c.textAlign = 'right'; c.textBaseline = 'top';
    c.fillText('K + U + Q = E', R.x + R.w - 10, R.y + 10);
    c.font = fnt(10.5, 600); c.fillStyle = colors.text; c.textAlign = 'left';
    c.fillText(tvText(), R.x + 10, R.y + 27);
  }
  /** 橫式長條圖（窄畫面：能量圖上方） */
  function drawBarsH(c, R) {
    const E = energiesNow(), rng = energyRange();
    const items = barItems(E);
    const labW = 26, valW = 64;
    const x0 = R.x + labW, x1 = R.x + R.w - valW;
    const xOf = function (v) { return x0 + (v - rng.lo) / (rng.hi - rng.lo) * (x1 - x0); };
    const xz = xOf(0);
    c.font = fnt(11, 700);
    c.fillStyle = colors.text; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillText(T('能量', 'Energy') + '  K + U + Q = E', R.x, R.y);
    c.font = fnt(10.5, 600); c.textAlign = 'right';
    c.fillText(tvText(), R.x + R.w, R.y);
    const rowH = 22, ys = R.y + 22;
    items.forEach(function (it, i) {
      const yc = ys + i * rowH + rowH / 2;
      D.haloText(c, it.key, R.x + 8, yc, it.col, 'center', 'middle', fnt(13, 700, true));
      const xv = xOf(it.v), xa = Math.min(xz, xv), w = Math.abs(xv - xz), bh = 13;
      c.fillStyle = alpha(colors.text, colors.dark ? 0.06 : 0.05);
      c.fillRect(x0, yc - bh / 2, x1 - x0, bh);
      if (w >= 0.5) {
        const gr = c.createLinearGradient(0, yc - bh / 2, 0, yc + bh / 2);
        gr.addColorStop(0, shade(it.col, 0.25)); gr.addColorStop(0.5, it.col); gr.addColorStop(1, shade(it.col, -0.2));
        c.fillStyle = gr;
        D.roundRect(c, xa, yc - bh / 2, w, bh, Math.min(3, w / 2)); c.fill();
        if (it.key === 'Q' && it.sub > 0) {
          const ws = Math.abs(xOf(it.sub) - xz);
          c.save(); c.beginPath(); c.rect(xz, yc - bh / 2, ws, bh); c.clip();
          c.strokeStyle = alpha(shade(it.col, 0.7), 0.8); c.lineWidth = 1.5; c.beginPath();
          for (let xx = xz - bh; xx < xz + ws + bh; xx += 6) { c.moveTo(xx, yc + bh / 2); c.lineTo(xx + bh, yc - bh / 2); }
          c.stroke(); c.restore();
        }
      }
      D.haloText(c, fmtE(it.v), R.x + R.w, yc, it.col, 'right', 'middle', fnt(11, 600));
    });
    c.strokeStyle = alpha(colors.text, 0.55); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(Math.round(xz) + 0.5, ys - 2); c.lineTo(Math.round(xz) + 0.5, ys + 4 * rowH + 2); c.stroke();
  }

  // ---------- 能量圖 ----------
  function drawGraph() {
    const c = gtx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, gh);
    D.backdrop(c, cw, gh);
    const G = L.g;
    if (G.bars) drawBarsH(c, G.bars);
    const P = G.plot, rng = energyRange(), u = unitE(rng);
    const yOf = function (v) { return P.y + P.h - (v - rng.lo) / (rng.hi - rng.lo) * P.h; };
    // 標題
    c.font = fnt(L.narrow ? 11 : 12, 700);
    c.fillStyle = colors.text; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText((state.graph === 't' ? T('能量–時間圖', 'Energy vs time') : T('能量–位置圖', 'Energy vs position')) + T('（', ' (') + u.n + T('）', ')'), P.x, P.y - 16);
    // 格線與刻度
    const step = niceStep((rng.hi - rng.lo) / u.d, L.narrow ? 4 : 5) * u.d;
    c.save();
    c.fillStyle = alpha(colors.surface, colors.dark ? 0.25 : 0.55);
    c.fillRect(P.x, P.y, P.w, P.h);
    c.strokeStyle = alpha(colors.text, colors.dark ? 0.09 : 0.08); c.lineWidth = 1;
    c.beginPath();
    c.font = fnt(10); c.fillStyle = colors.muted; c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let v = Math.ceil(rng.lo / step - 1e-9) * step; v <= rng.hi + 1e-9; v += step) {
      const yy = Math.round(yOf(v)) + 0.5;
      c.moveTo(P.x, yy); c.lineTo(P.x + P.w, yy);
      c.fillText(num(v / u.d, step / u.d < 1 ? 1 : 0), P.x - 4, yy);
    }
    c.stroke();
    c.restore();
    let xOf, xTicks, xUnit;
    if (state.graph === 't') {
      const tNow = state.sim.t;
      const wT = WINDOWS.find(function (w) { return w >= tNow; }) || WINDOWS[WINDOWS.length - 1];
      xOf = function (t) { return P.x + t / wT * P.w; };
      const ts = niceStep(wT, L.narrow ? 5 : 8);
      xTicks = []; for (let t = 0; t <= wT + 1e-9; t += ts) xTicks.push(t);
      xUnit = 's';
    } else {
      xOf = function (x) { return P.x + x / WW * P.w; };
      xTicks = [0, 5, 10, 15, 20, 25, 30];
      xUnit = 'm';
    }
    c.save();
    c.strokeStyle = alpha(colors.text, colors.dark ? 0.06 : 0.05); c.lineWidth = 1;
    c.beginPath();
    xTicks.forEach(function (t) { const xx = Math.round(xOf(t)) + 0.5; c.moveTo(xx, P.y); c.lineTo(xx, P.y + P.h); });
    c.stroke();
    c.font = fnt(10); c.fillStyle = colors.muted; c.textAlign = 'center'; c.textBaseline = 'top';
    xTicks.forEach(function (t, i) { c.fillText(num(t, t % 1 ? 1 : 0) + (i === xTicks.length - 1 ? ' ' + xUnit : ''), xOf(t), P.y + P.h + 4); });
    c.restore();
    // 零線
    const yz = Math.round(yOf(0)) + 0.5;
    c.strokeStyle = alpha(colors.text, 0.45); c.lineWidth = 1;
    c.beginPath(); c.moveTo(P.x, yz); c.lineTo(P.x + P.w, yz); c.stroke();
    c.save();
    c.beginPath(); c.rect(P.x, P.y - 1, P.w, P.h + 2); c.clip();
    if (state.graph === 't') drawTimeCurves(c, xOf, yOf);
    else drawPositionCurves(c, xOf, yOf);
    c.restore();
    c.strokeStyle = alpha(colors.border, 1); c.lineWidth = 1;
    c.strokeRect(P.x + 0.5, P.y + 0.5, P.w - 1, P.h - 1);
    if (G.side) drawGraphSide(c, G.side);
  }
  function curve(c, pts, xOf, yOf, fx, fy, color, width, dash) {
    if (pts.length < 2) return;
    c.save();
    c.strokeStyle = color; c.lineWidth = width; c.lineJoin = 'round'; c.lineCap = 'round';
    if (dash) c.setLineDash(dash);
    c.beginPath();
    let started = false, lastX = -1e9;
    for (let i = 0; i < pts.length; i++) {
      const x = xOf(fx(pts[i]));
      if (started && Math.abs(x - lastX) < 0.6 && i < pts.length - 1) continue;
      const y = yOf(fy(pts[i]));
      if (!started) { c.moveTo(x, y); started = true; } else c.lineTo(x, y);
      lastX = x;
    }
    c.stroke();
    c.restore();
  }
  function drawTimeCurves(c, xOf, yOf) {
    const m = state.m, yr = state.yref;
    const tx = function (p) { return p.t; };
    const fK = function (p) { return m * p.k; };
    state.ghosts.forEach(function (gh) {
      const g = gh.g;
      curve(c, gh.samples, xOf, yOf, tx, fK, alpha(colors.pos, 0.22), 1.5);
      curve(c, gh.samples, xOf, yOf, tx, function (p) { return m * g * (p.y - yr); }, alpha(colors.neg, 0.22), 1.5);
      curve(c, gh.samples, xOf, yOf, tx, function (p) { return m * (p.q + p.qi); }, alpha(colors.equi, 0.22), 1.5);
    });
    const S = state.run.samples.slice();
    const sNow = state.sim;
    const Kn = C.kinematics(state.tr, state.P, sNow);
    S.push({ t: sNow.t, x: Kn.x, y: Kn.y, k: 0.5 * Kn.speed * Kn.speed, q: sNow.q, qi: sNow.qi });
    const g = state.P.g;
    const fE = function (p) { return m * (p.k + g * (p.y - yr) + p.q + p.qi); };
    curve(c, S, xOf, yOf, tx, fE, alpha(colors.accent, 0.9), 3.2);
    curve(c, S, xOf, yOf, tx, function (p) { return m * (p.q + p.qi); }, colors.equi, 2.2);
    curve(c, S, xOf, yOf, tx, function (p) { return m * g * (p.y - yr); }, colors.neg, 2.2);
    curve(c, S, xOf, yOf, tx, fK, colors.pos, 2.2);
    // 目前時刻的點
    const last = S[S.length - 1];
    [[fK, colors.pos], [function (p) { return m * g * (p.y - yr); }, colors.neg], [function (p) { return m * (p.q + p.qi); }, colors.equi], [fE, colors.accent]].forEach(function (a) {
      D.ball(c, xOf(last.t), yOf(a[0](last)), 3.2, a[1], { shadow: false, glow: 0 });
    });
  }
  function drawPositionCurves(c, xOf, yOf) {
    const m = state.m, g = state.P.g, yr = state.yref, tr = state.tr;
    const U = function (y) { return m * g * (y - yr); };
    // 軌道各點的位能 U(x)（形狀就是軌道本身）
    const base = yOf(Math.max(energyRange().lo, Math.min(0, U(0))));
    tr.pieces.forEach(function (pc) {
      const pts = state.trS.filter(function (p) { return p.u >= pc.u0 - 1e-9 && p.u <= pc.u1 + 1e-9; });
      if (pts.length < 2) return;
      if (pc.type === 'spline') {
        c.beginPath();
        c.moveTo(xOf(pts[0].x), base);
        pts.forEach(function (p) { c.lineTo(xOf(p.x), yOf(U(p.y))); });
        c.lineTo(xOf(pts[pts.length - 1].x), base);
        c.closePath();
        c.fillStyle = alpha(colors.neg, colors.dark ? 0.16 : 0.1);
        c.fill();
      }
      c.save();
      c.strokeStyle = alpha(colors.neg, 0.85); c.lineWidth = 2;
      c.beginPath();
      pts.forEach(function (p, i) { if (i) c.lineTo(xOf(p.x), yOf(U(p.y))); else c.moveTo(xOf(p.x), yOf(U(p.y))); });
      c.stroke();
      c.restore();
    });
    // 總能（水平線）與力學能 K + U 的歷程
    const E = energiesNow();
    c.save();
    c.strokeStyle = alpha(colors.accent, 0.95); c.lineWidth = 2.4; c.setLineDash([9, 5]);
    c.beginPath(); c.moveTo(xOf(0), yOf(E.E)); c.lineTo(xOf(WW), yOf(E.E)); c.stroke();
    c.restore();
    const S = state.run.samples;
    curve(c, S, xOf, yOf, function (p) { return p.x; }, function (p) { return m * (p.k + g * (p.y - yr)); }, alpha(colors.pos, 0.55), 1.6);
    // 小車所在位置：U（藍點）、K（紅）、Q（黃）疊起來 = E
    const K = C.kinematics(tr, state.P, state.sim);
    const xx = xOf(K.x), yU = yOf(E.U), yKU = yOf(E.U + E.K), yE = yOf(E.E);
    c.lineCap = 'round';
    c.strokeStyle = colors.pos; c.lineWidth = 5;
    if (Math.abs(yKU - yU) > 0.5) { c.beginPath(); c.moveTo(xx, yU); c.lineTo(xx, yKU); c.stroke(); }
    c.strokeStyle = colors.equi;
    if (Math.abs(yE - yKU) > 0.5) { c.beginPath(); c.moveTo(xx, yKU); c.lineTo(xx, yE); c.stroke(); }
    D.ball(c, xx, yU, 5, colors.neg, { glow: 0 });
    c.font = fnt(10.5, 600);
    const eBelow = yE - 20 < yOf(energyRange().hi); // 太靠近圖框上緣就寫在線的下方
    D.haloText(c, T('E（總能）', 'E (total)'), xOf(WW) - 4, eBelow ? yE + 6 : yE - 7, colors.accent, 'right', eBelow ? 'top' : 'bottom', fnt(10.5, 600));
    const yEnd = tr.ys[tr.ys.length - 1];
    D.haloText(c, T('U（軌道各點）', 'U along the track'), xOf(tr.xMax) - 2, yOf(U(yEnd)) - 6, colors.neg, 'right', 'bottom', fnt(10.5, 600));
  }
  /** 寬畫面：能量圖右側的圖例與目前數值 */
  function drawGraphSide(c, R) {
    const E = energiesNow();
    const rows = [
      [colors.pos, 'K', T('動能', 'kinetic'), E.K],
      [colors.neg, 'U', T('重力位能', 'potential'), E.U],
      [colors.equi, 'Q', T('熱能', 'thermal'), E.Q],
      [colors.accent, 'E', T('總能', 'total'), E.E]
    ];
    const y0 = R.y + 26, dy = Math.min(34, (R.h - 40) / 4);
    rows.forEach(function (r, i) {
      const y = y0 + i * dy;
      c.fillStyle = r[0];
      D.roundRect(c, R.x + 4, y - 2, 14, 4, 2); c.fill();
      D.haloText(c, r[1], R.x + 24, y, r[0], 'left', 'middle', fnt(13, 700, true));
      D.haloText(c, r[2], R.x + 38, y, colors.muted, 'left', 'middle', fnt(10.5));
      D.haloText(c, fmtE(r[3]), R.x + R.w - 4, y, r[0], 'right', 'middle', fnt(11, 600));
    });
    if (state.graph === 'x') {
      D.haloText(c, T('紅線：力學能 K + U', 'Red line: K + U'), R.x + 4, y0 + 4 * dy, alpha(colors.pos, 0.9), 'left', 'middle', fnt(10.5));
    } else if (state.ghosts.length) {
      D.haloText(c, T('淡色：前幾次', 'Faint: earlier runs'), R.x + 4, y0 + 4 * dy, colors.muted, 'left', 'middle', fnt(10.5));
    }
  }

  // ---------- 鍵盤焦點框 ----------
  let kb = null;
  const kbItems = [];
  function kbRect(i) {
    if (i === 0) { const p = carPose(); const r = L.Lc * 0.75; return { x: p.cx - r, y: p.cy - r, w: 2 * r, h: 2 * r }; }
    if (i === 1) { const r = zeroTabRect(); return { x: r.x - 4, y: r.y - 4, w: r.w + 12, h: r.h + 8 }; }
    const p = state.def.pts[i - 2];
    if (!p) return null;
    return { x: X(p[0]) - 12, y: Y(p[1]) - 12, w: 24, h: 24 };
  }
  function drawKbFocus(c) {
    if (!kb || !kb.focused()) return;
    const r = kbRect(kb.index());
    if (!r) return;
    c.save();
    c.strokeStyle = colors.accent; c.lineWidth = 2; c.setLineDash([5, 4]);
    D.roundRect(c, r.x, r.y, r.w, r.h, 8); c.stroke();
    c.restore();
  }

  // ---------- 編輯軌道 ----------
  /** 試著把第 i 個控制點移到 (x, y)；不合理就試著只改 x 或只改 y；成功傳回 true */
  function movePoint(i, x, y) {
    const def = clone(state.def), pts = def.pts, n = pts.length, lp = def.loop;
    const lo = i === 0 ? 0.5 : pts[i - 1][0] + C.MIN_GAP;
    const hi = i === n - 1 ? WW - 0.5 : pts[i + 1][0] - C.MIN_GAP;
    const nx = clamp(Math.round(x / SNAP) * SNAP, lo, hi), ny = clamp(Math.round(y / SNAP) * SNAP, 0.3, WH - 0.4);
    const tryXY = function (px, py) {
      const d = clone(def);
      d.pts[i][0] = r3(px);
      if (lp && (i === lp.at || i === lp.at - 1 || i === lp.at + 1)) { [lp.at - 1, lp.at, lp.at + 1].forEach(function (j) { d.pts[j][1] = r3(py); }); }
      else d.pts[i][1] = r3(py);
      const v = C.validate(d);
      return v.ok ? { d: d } : { err: v.reason };
    };
    const cur = pts[i];
    let r = tryXY(nx, ny);
    if (!r.d) { const r2 = tryXY(nx, cur[1]); if (r2.d) r = r2; else { const r3_ = tryXY(cur[0], ny); if (r3_.d) r = r3_; } }
    if (!r.d) { flash(reasonText(r.err)); return false; }
    if (r.d.pts[i][0] === cur[0] && r.d.pts[i][1] === cur[1]) return false;
    state.edited = true;
    setTrack(r.d);
    return true;
  }
  function flash(text) { if (text) { state.msg = { text: text, t0: performance.now() }; requestDraw(); setTimeout(requestDraw, 3100); } }

  // ---------- 拖曳 ----------
  function evPos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function hitTest(p, touch) {
    const tol = touch ? 20 : hitR();
    const zr = zeroTabRect();
    if (p.x >= zr.x - 4 && p.x <= zr.x + zr.w + 8 && p.y >= zr.y - (touch ? 10 : 4) && p.y <= zr.y + zr.h + (touch ? 10 : 4)) return { type: 'ref' };
    const pose = carPose();
    if (Math.hypot(p.x - pose.cx, p.y - pose.cy) <= Math.max(tol, L.Lc * 0.6)) return { type: 'car' };
    if (state.show.pts) {
      let best = null, bd = tol;
      state.def.pts.forEach(function (q, i) { const d = Math.hypot(p.x - X(q[0]), p.y - Y(q[1])); if (d <= bd) { bd = d; best = { type: 'pt', i: i }; } });
      if (best) return best;
    }
    return null;
  }
  /** 拖曳小車：取軌道上水平位置最接近的點（迴圈以外） */
  function setStartX(x) {
    const nx = clamp(Math.round(x * 100) / 100, state.tr.xMin, state.tr.xMax);
    if (nx === state.x0) return false;
    state.x0 = nx;
    syncSlider($('x0'), nx);
    newRun(true);
    return true;
  }
  function setRef(y) {
    const ny = clamp(Math.round(y / 0.05) * 0.05, 0, 15);
    if (ny === state.yref) return false;
    state.yref = r3(ny);
    syncSlider($('yref'), state.yref);
    return true;
  }
  function refMoved() {
    const K = C.kinematics(state.tr, state.P, state.sim), E = energiesNow();
    emit('refmove', { from: state.run.refFrom, to: state.yref, dRef: state.yref - state.run.refFrom, moving: simActive() && K.speed > 0.05, K: E.K, U: E.U, Q: E.Q, E: E.E });
    setStatus(T('位能零點移到離地 ', 'Zero of potential energy moved to a height of ') + num(state.yref, 2) + T(' m：U 與 E 都改變了，K、Q 與小車的運動都不變。', ' m: U and E changed, but K, Q and the motion did not.'));
  }
  cv.addEventListener('pointerdown', function (e) {
    if (!L) return;
    const p = evPos(e), h = hitTest(p, e.pointerType === 'touch');
    if (!h) return;
    acted();
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (x) { /* 忽略 */ }
    state.drag = Object.assign({ wasRunning: state.running, id: e.pointerId }, h);
    if (h.type === 'pt' && kb) kb.select(h.i + 2);
    if (h.type === 'car' && kb) kb.select(0);
    if (h.type === 'ref' && kb) kb.select(1);
    stopVoice();
    requestDraw();
  });
  cv.addEventListener('pointermove', function (e) {
    if (!L) return;
    const p = evPos(e);
    if (!state.drag) {
      const h = hitTest(p, e.pointerType === 'touch');
      const key = h ? h.type + (h.i == null ? '' : h.i) : '';
      const old = state.hover ? state.hover.type + (state.hover.i == null ? '' : state.hover.i) : '';
      state.hover = h;
      cv.style.cursor = h ? (h.type === 'ref' ? 'ns-resize' : 'grab') : 'default';
      if (key !== old) requestDraw();
      return;
    }
    const d = state.drag;
    cv.style.cursor = 'grabbing';
    if (d.type === 'ref') { if (setRef(wy(p.y))) requestDraw(); }
    else if (d.type === 'car') { if (setStartX(wx(p.x))) { state.running = false; requestDraw(); } }
    else if (d.type === 'pt') { if (movePoint(d.i, wx(p.x), wy(p.y))) { newRun(true); state.running = false; updatePrediction(); requestDraw(); } }
  });
  function endDrag(e) {
    const d = state.drag;
    if (!d) return;
    state.drag = null;
    cv.style.cursor = 'default';
    if (d.type === 'ref') refMoved();
    else {
      // 放開小車或控制點：沒有按過暫停就直接出發
      state.running = !state.userPaused;
      if (state.running && !simActive()) newRun(true);
      updatePlayButton();
    }
    updatePrediction();
    requestDraw();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (!state.drag && state.hover) { state.hover = null; requestDraw(); } });

  // ---------- 鍵盤操作（keys.js） ----------
  function rebuildKeyItems() {
    kbItems.length = 0;
    kbItems.push({
      name: function () { return T('小車（出發點）', 'car (starting point)'); },
      move: function (dx, dy, big) {
        if (!dx) return false;
        acted();
        if (!setStartX(state.x0 + dx * (big ? 0.5 : 0.05))) return false;
        state.running = !state.userPaused; updatePlayButton(); updatePrediction(); requestDraw();
        return true;
      },
      describe: function () { return T('出發點 x = ', 'Starting point x = ') + num(state.x0, 2) + T(' m，離地 ', ' m, height ') + num(state.sim.start.y, 2) + ' m'; }
    });
    kbItems.push({
      name: function () { return T('位能零點', 'zero of potential energy'); },
      move: function (dx, dy, big) {
        if (!dy) return false;
        acted();
        if (!setRef(state.yref + dy * (big ? 0.5 : 0.05))) return false;
        refMoved(); requestDraw();
        return true;
      },
      describe: function () { return T('位能零點高度 ', 'Zero of potential energy at a height of ') + num(state.yref, 2) + ' m'; }
    });
    state.def.pts.forEach(function (p, i) {
      kbItems.push({
        name: function () { return T('控制點 ', 'control point ') + (i + 1); },
        move: function (dx, dy, big) {
          acted();
          const s = big ? 1 : 0.1, q = state.def.pts[i];
          if (!q || !movePoint(i, q[0] + dx * s, q[1] + dy * s)) return false;
          restartAfterChange(); updatePrediction();
          return true;
        },
        describe: function () { const q = state.def.pts[i]; return q ? T('控制點 ', 'Control point ') + (i + 1) + T('：x = ', ': x = ') + num(q[0], 2) + ' m, y = ' + num(q[1], 2) + ' m' : ''; }
      });
    });
  }

  // ---------- 控制項 ----------
  let quiet = false;
  function syncSlider(el, v) {
    quiet = true;
    if (window.LabNum) window.LabNum.set(el, v); else el.value = v;
    quiet = false;
    showOut(el);
  }
  const units = { R: 'm', x0: 'm', v0: 'm/s', m: 'kg', g: 'm/s²', mu: '', yref: 'm' };
  function showOut(el) {
    const o = $(el.id + 'o');
    if (o) o.textContent = fmtSlider(val(el), el) + (units[el.id] ? ' ' + units[el.id] : '');
  }
  // 打開分享連結時 classroom.js 會代按按鈕、改滑桿：那不是學生的操作，不算數（免得一打開連結就完成任務）
  function acted() { if (window.LabShare && window.LabShare.restoring) return; state.userActed = true; }
  function updateModeUI() {
    $('modeRail').setAttribute('aria-pressed', String(state.mode === 'rail'));
    $('modeFree').setAttribute('aria-pressed', String(state.mode === 'free'));
    $('modeHint').textContent = state.mode === 'free'
      ? T('自由小車只能被軌道推離軌道面（N ≥ 0）；N 降到 0 就離開軌道，變成拋體。', 'The free car can only be pushed away from the track surface (N ≥ 0); when N drops to zero it leaves the track and becomes a projectile.')
      : T('軌道車的輪子夾住軌道上下兩側，軌道也能把車拉向軌道（N < 0），不會掉下來。', 'The rail car’s wheels grip the rail from both sides, so the rail can also pull the car toward the rail (N < 0) — it never falls off.');
  }
  function updateGButtons() {
    document.querySelectorAll('#gBox button').forEach(function (b) { b.setAttribute('aria-pressed', String(Math.abs(+b.dataset.g - state.g) < 1e-9)); });
  }
  function updatePresetButtons() {
    document.querySelectorAll('#presetBox button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.preset === state.preset)); });
  }
  function applyPreset(name) {
    const pr = C.PRESETS[name];
    if (!pr) return;
    state.preset = name;
    state.edited = false;
    state.x0 = pr.start;
    setTrack(clone(pr));
    syncSlider($('x0'), pr.start);
    updatePresetButtons();
    restartAfterChange();
    updatePrediction();
  }

  ['R', 'x0', 'v0', 'm', 'g', 'mu', 'yref'].forEach(function (id) {
    const el = $(id);
    el.addEventListener('input', function () {
      showOut(el);
      if (quiet) return;
      acted();
      const v = val(el);
      if (id === 'R') {
        if (!state.def.loop) return;
        let R = v;
        const d = clone(state.def);
        d.loop.R = R;
        // 太大時縮到合理的最大半徑
        while (!C.validate(d).ok && R > 2) { R = r3(R - 0.05); d.loop.R = R; }
        if (!C.validate(d).ok) return;
        if (R !== v) { syncSlider(el, R); flash(T('迴圈太大了，半徑改成 ', 'The loop is too big; radius set to ') + num(R, 2) + ' m'); }
        state.edited = state.edited || R !== (C.PRESETS[state.preset].loop || {}).R;
        setTrack(d);
        restartAfterChange();
      } else if (id === 'x0') { state.x0 = v; restartAfterChange(); }
      else if (id === 'v0') { state.v0 = v; restartAfterChange(); }
      else if (id === 'g') { state.g = v; updateGButtons(); restartAfterChange(); }
      else if (id === 'mu') { state.mu = v; restartAfterChange(); }
      else if (id === 'm') { state.m = v; requestDraw(); }
      else if (id === 'yref') { state.yref = v; requestDraw(); }
      updatePrediction();
      updateReadouts();
    });
    if (id === 'yref') el.addEventListener('change', function () { if (!quiet) refMoved(); });
  });

  document.querySelectorAll('#presetBox button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); applyPreset(b.dataset.preset); setStatus(T('換了軌道：', 'New track: ') + b.textContent + T('。', '.')); });
  });
  document.querySelectorAll('#gBox button').forEach(function (b) {
    b.addEventListener('click', function () { acted(); syncSlider($('g'), +b.dataset.g); state.g = +b.dataset.g; updateGButtons(); restartAfterChange(); updatePrediction(); });
  });
  function setMode(mo) {
    acted();
    if (state.mode === mo) return;
    state.mode = mo;
    updateModeUI();
    restartAfterChange();
  }
  $('modeRail').addEventListener('click', function () { setMode('rail'); });
  $('modeFree').addEventListener('click', function () { setMode('free'); });
  function setGraph(gm) {
    acted();
    state.graph = gm;
    $('graphT').setAttribute('aria-pressed', String(gm === 't'));
    $('graphX').setAttribute('aria-pressed', String(gm === 'x'));
    requestDraw();
  }
  $('graphT').addEventListener('click', function () { setGraph('t'); });
  $('graphX').addEventListener('click', function () { setGraph('x'); });

  $('play').addEventListener('click', function () {
    acted();
    if (state.running && simActive()) { state.userPaused = true; setRunning(false); setStatus(T('已暫停。', 'Paused.')); }
    else {
      state.userPaused = false;
      if (!simActive()) newRun(true);
      setRunning(true);
      setStatus('');
    }
  });
  $('restart').addEventListener('click', function () {
    acted();
    state.userPaused = false;
    newRun(true);
    setRunning(true);
    setStatus(T('重新出發。', 'Off again.'));
  });
  $('reset').addEventListener('click', function () {
    acted();
    state.ghosts = [];
    state.rows = [];
    state.runCount = 0;
    renderTable();
    newRun(false);
    state.running = !state.userPaused;
    updatePlayButton();
    setStatus(T('已全部清除：能量圖、舊紀錄、熱能與紀錄表都清空了，滑桿與軌道設定不變。', 'Everything is cleared: the graph, earlier runs, the heat and the record table. The sliders and the track are kept.'));
    requestDraw();
  });
  $('slow').addEventListener('change', function (ev) { acted(); state.slow = ev.target.checked; requestDraw(); });
  [['showV', 'v'], ['showF', 'f'], ['showLevel', 'level'], ['showPts', 'pts'], ['showTrail', 'trail']].forEach(function (pair) {
    $(pair[0]).addEventListener('change', function (ev) { acted(); state.show[pair[1]] = ev.target.checked; requestDraw(); });
  });

  // 喇叭按鈕：切換全站音效設定（齒輪面板也能切換，兩邊同步）
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
    requestDraw();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
  });

  // ---------- 鍵盤 ----------
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('雲霄飛車模擬畫布：軌道、小車與能量長條圖。按 Enter 依序選取小車、位能零點與各個控制點；方向鍵移動：小車左右移動出發點（每次 0.05 m），位能零點上下移動（每次 0.05 m），控制點上下左右移動（每次 0.1 m）；Shift 加方向鍵移動 10 倍。',
        'Roller coaster simulation: the track, the car and the energy bar chart. Press Enter to pick the car, the zero of potential energy or one of the control points in turn. Arrow keys move it: the car’s starting point left or right (0.05 m a step), the zero level up or down (0.05 m), a control point in any direction (0.1 m); hold Shift for steps 10 times larger.'),
      items: kbItems,
      onChange: function () { updatePrediction(); requestDraw(); }
    });
  } else cv.setAttribute('role', 'img');

  // ---------- 分享連結：軌道控制點（畫布上拖曳出來的狀態） ----------
  // classroom.js 由 settings.js 動態載入、比本檔晚執行：先放進 LAB_SHARE_EXTRAS，它載入後會補登記（已載入時 push 直接登記）
  {
    (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
      get: function () {
        return {
          p: state.preset, e: state.edited ? 1 : 0, x0: r3(state.x0),
          pts: state.def.pts.map(function (q) { return [r3(q[0]), r3(q[1])]; }),
          lp: state.def.loop ? [state.def.loop.at, r3(state.def.loop.R)] : null
        };
      },
      set: function (o) {
        if (!o || typeof o !== 'object') return;
        const okNum = function (v) { return typeof v === 'number' && isFinite(v); };
        if (typeof o.p === 'string' && C.PRESETS[o.p] && o.p !== state.preset) { state.preset = o.p; updatePresetButtons(); }
        let def = null;
        if (Array.isArray(o.pts) && o.pts.length >= 3 && o.pts.length <= 12 && o.pts.every(function (q) { return Array.isArray(q) && q.length === 2 && okNum(q[0]) && okNum(q[1]); })) {
          const pts = o.pts.map(function (q) { return [clamp(q[0], 0.5, WW - 0.5), clamp(q[1], 0.3, WH - 0.4)]; });
          let loop = null;
          if (Array.isArray(o.lp) && o.lp.length === 2 && okNum(o.lp[0]) && okNum(o.lp[1])) {
            const at = Math.round(o.lp[0]);
            if (at >= 1 && at <= pts.length - 2) loop = { at: at, R: clamp(o.lp[1], 2, 4.5) };
          }
          const d = { pts: pts, loop: loop };
          let inc = true;
          for (let i = 1; i < pts.length; i++) if (!(pts[i][0] > pts[i - 1][0])) inc = false;
          if (inc && C.validate(d).ok) def = d;
        }
        if (def) { state.edited = !!o.e; setTrack(def); }
        if (okNum(o.x0)) { state.x0 = clamp(o.x0, state.tr.xMin, state.tr.xMax); syncSlider($('x0'), state.x0); }
        restartAfterChange();
        updatePrediction();
      }
    });
  }

  // ---------- 啟動 ----------
  readColors();
  setTrack(clone(C.PRESETS.valley));
  ['R', 'x0', 'v0', 'm', 'g', 'mu', 'yref'].forEach(function (id) { showOut($(id)); });
  state.m = val($('m')); state.g = val($('g')); state.mu = val($('mu')); state.yref = val($('yref')); state.v0 = val($('v0'));
  updateModeUI();
  updateGButtons();
  newRun(false);
  state.running = !reducedMotion;
  updatePlayButton();
  updateSoundButton();
  renderTable();
  updatePrediction();
  function themeChanged() { readColors(); bgKey = ''; requestDraw(); }
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:settingschange', function () { bgKey = ''; requestDraw(); });
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
  }
  window.addEventListener('resize', function () { resize(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastTs = 0; requestDraw(); } });
  resize();
  setStatus(reducedMotion
    ? T('已偵測到「減少動態效果」設定：按「出發」開始。', 'Reduced motion is on: press “Go” to start.')
    : T('小車由靜止滑下。拖曳小車改變出發點，或拖曳圓形把手改變軌道形狀。', 'The car rolls down from rest. Drag the car to change where it starts, or drag the round handles to reshape the track.'));
})();
