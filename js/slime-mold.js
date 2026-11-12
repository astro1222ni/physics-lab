/* slime-mold.js — 「黏菌找路」的畫面與互動（模型全部在 slime-mold-core.js；3D 在 slime-mold-3d.js，切換時才載入） */
(function () {
  'use strict';
  const S = window.SlimeCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const FONT = D.FONT;
  const MAX_ROWS = 12;
  const THR = 1e-3;            // 小於這個導度的管子不畫、不算
  const DT1 = 0.3, DT2 = 0.5;  // 兩部分的時間步長（無單位）
  const MAXSTEP1 = 6000, MAXSTEP2 = 1500, TOL = 1e-4;

  // =====================================================================
  // 顏色
  // =====================================================================
  const C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['sm-agar', 'sm-agar2', 'sm-wall', 'sm-tube', 'sm-tube-hi', 'sm-food', 'sm-food-edge', 'sm-sea', 'sm-low', 'sm-mid', 'sm-high',
      'sm-coast', 'sm-rail', 'sm-mst', 'sm-best']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }

  // =====================================================================
  // 數字
  // =====================================================================
  function num(v, d) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function pct(x, d) { return num(100 * x, d == null ? 0 : d) + '%'; }
  function niceStep(span, target) {
    const raw = span / target, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function cityName(c) { return T(c.zh, c.en); }

  // =====================================================================
  // 滑桿
  // =====================================================================
  const el = {
    mu: $('mu'), noise: $('noise'), mw: $('mw'), mh: $('mh'), loops: $('loops'),
    I0: $('I0'), gam: $('gam'), mtn: $('mtn')
  };
  function refreshOutputs() {
    const set = function (id, s) { const o = $(id); if (o) o.textContent = s; };
    set('muo', num(val(el.mu), 2)); set('noiseo', pct(val(el.noise), 0));
    set('mwo', num(val(el.mw), 0)); set('mho', num(val(el.mh), 0)); set('loopso', num(val(el.loops), 0));
    set('I0o', num(val(el.I0), 2)); set('gamo', num(val(el.gam), 2)); set('mtno', num(val(el.mtn), 1));
  }

  // =====================================================================
  // 音效、狀態
  // =====================================================================
  function sound() { const S0 = window.LabSound; return S0 && S0.enabled() ? S0 : null; }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  let lastTick = 0;
  /** 一段管子萎縮消失：輕輕的「啵」，越後面消失的越高 */
  function sndPrune(frac) {
    const S0 = sound(), now = performance.now();
    if (!S0 || now - lastTick < 90) return;
    lastTick = now;
    S0.tone({ freq: 330 + 500 * Math.min(1, frac), dur: 0.05, gain: 0.045, type: 'triangle' });
  }
  /** 穩定下來：上行的三個音 */
  function sndDone(good) {
    const S0 = sound();
    if (!S0) return;
    const f = good ? [523, 659, 784] : [440, 523, 587];
    f.forEach(function (x, i) { S0.tone({ freq: x, dur: 0.16, gain: 0.06, delay: i * 0.12, type: 'sine' }); });
  }
  function setStatus(s) { $('status').textContent = s; }
  function setStatus2(s) { $('status2').textContent = s; }
  function say(s) { const e = $('srSay'); e.textContent = ''; setTimeout(function () { e.textContent = s; }, 30); }
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }

  // =====================================================================
  // 繪圖共用
  // =====================================================================
  function fit(c, g, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth || 300;
    c.style.height = h + 'px';
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h, dpr: dpr };
  }
  function plotFrame(g, p) {
    D.roundRect(g, p.x0 - 4, p.y0 - 4, p.x1 - p.x0 + 8, p.y1 - p.y0 + 8, 8);
    g.fillStyle = D.alpha(D.c.surface, D.dark ? 0.35 : 0.7); g.fill();
    g.strokeStyle = D.alpha(D.c.border, 0.9); g.lineWidth = 1; g.stroke();
  }
  function hLine(g, p, y, a) {
    g.strokeStyle = D.alpha(D.c.text, a); g.lineWidth = 1;
    g.beginPath(); g.moveTo(p.x0, Math.round(y) + 0.5); g.lineTo(p.x1, Math.round(y) + 0.5); g.stroke();
  }
  function yTicks(g, p, lo, hi, step, fmt, yOf) {
    g.font = '11px ' + FONT; g.fillStyle = D.c.muted; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) {
      const y = yOf(v);
      g.fillText(fmt(v), p.x0 - 7, y);
      hLine(g, p, y, Math.abs(v - lo) < 1e-9 ? 0.22 : 0.07);
    }
  }
  function xTicks(g, p, lo, hi, step, fmt, xOf, unit) {
    g.font = '11px ' + FONT; g.fillStyle = D.c.muted; g.textBaseline = 'top';
    g.textAlign = 'right';
    const wl = g.measureText(unit).width;
    g.fillText(unit, p.x1, p.y1 + 6);
    g.textAlign = 'center';
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) {
      const x = xOf(v);
      if (x > p.x1 - wl - 14) break;
      g.fillText(fmt(v), x, p.y1 + 6);
      g.strokeStyle = D.alpha(D.c.text, 0.05);
      g.beginPath(); g.moveTo(Math.round(x) + 0.5, p.y0); g.lineTo(Math.round(x) + 0.5, p.y1); g.stroke();
    }
  }
  function title(g, s, x, y, col) { D.haloText(g, s, x, y, col || D.c.text, 'left', 'middle', '600 12px ' + FONT); }
  function evPos(c, ev) { const r = c.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  /** 管徑：導度 D ∝ r⁴（Poiseuille），所以畫的寬度 ∝ D^(1/4) */
  function widthOf(Dv, Dref, wmax) { return wmax * Math.pow(Math.min(1, Dv / Dref), 0.25); }
  /** 燕麥片 */
  function oat(g, x, y, r, rot, hi) {
    g.save();
    g.translate(x, y); g.rotate(rot);
    g.beginPath(); g.ellipse(1.2, 1.8, r, r * 0.72, 0, 0, 2 * Math.PI);
    g.fillStyle = D.alpha('#000000', D.dark ? 0.35 : 0.16); g.fill();
    const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    gr.addColorStop(0, D.shade(C['sm-food'], 0.35)); gr.addColorStop(1, C['sm-food']);
    g.beginPath(); g.ellipse(0, 0, r, r * 0.72, 0, 0, 2 * Math.PI);
    g.fillStyle = gr; g.fill();
    g.strokeStyle = C['sm-food-edge']; g.lineWidth = Math.max(1, r * 0.1); g.stroke();
    g.strokeStyle = D.alpha(C['sm-food-edge'], 0.55); g.lineWidth = Math.max(0.8, r * 0.07);
    g.beginPath(); g.moveTo(-r * 0.55, 0); g.quadraticCurveTo(0, -r * 0.18, r * 0.55, 0); g.stroke();
    if (hi) {
      g.setLineDash([4, 3]); g.strokeStyle = D.c.accent; g.lineWidth = 2;
      g.beginPath(); g.ellipse(0, 0, r + 5, r * 0.72 + 5, 0, 0, 2 * Math.PI); g.stroke();
      g.setLineDash([]);
    }
    g.restore();
  }
  /** 依寬度分組，一組畫一次（立體管子：暗底、亮面、高光） */
  function drawTubes(g, list, color) {
    const groups = {};
    list.forEach(function (it) {
      const k = Math.round(it.w * 2) / 2;
      if (k <= 0) return;
      (groups[k] = groups[k] || []).push(it);
    });
    const keys = Object.keys(groups).map(Number).sort(function (a, b) { return a - b; });
    const layers = [[D.shade(color, -0.32), 1, 0], [color, 0.66, -0.16], [D.alpha(D.shade(color, 0.65), D.dark ? 0.4 : 0.6), 0.24, -0.26]];
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    layers.forEach(function (L) {
      keys.forEach(function (k) {
        g.beginPath();
        groups[k].forEach(function (it) { g.moveTo(it.x0, it.y0 + k * L[2]); g.lineTo(it.x1, it.y1 + k * L[2]); });
        g.strokeStyle = L[0]; g.lineWidth = Math.max(0.6, k * L[1]); g.stroke();
      });
    });
    g.restore();
  }

  // =====================================================================
  // 一・迷宮
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W1 = 0, H1 = 0, L1 = null;
  const m1 = { seed: 1, maze: null, foods: null, routes: null, sim: null, playing: false, done: false, hist: [], res: null, total: 0, alive0: 0, dragK: -1, phase: 0, lastPr: 0 };
  let rows1 = [], runNo1 = 0;

  function buildMaze(keepFoods) {
    const Wc = Math.round(val(el.mw)), Hc = Math.round(val(el.mh)), loops = Math.round(val(el.loops));
    m1.maze = S.maze(Wc, Hc, loops, m1.seed);
    const n = Wc * Hc;
    if (!keepFoods || !m1.foods || m1.foods.some(function (f) { return f >= n; }) || m1.foods[0] === m1.foods[1]) m1.foods = [0, n - 1];
    m1.routes = S.mazeRoutes(m1.maze.g, m1.foods[0], m1.foods[1]);
    let tot = 0;
    for (let e = 0; e < m1.maze.g.m; e++) tot += m1.maze.g.len[e];
    m1.total = tot;
    reset1();
  }
  function moved1() { const n = m1.maze.W * m1.maze.H; return !(m1.foods[0] === 0 && m1.foods[1] === n - 1) && !(m1.foods[1] === 0 && m1.foods[0] === n - 1); }
  function reset1(keepPlaying) {
    m1.sim = S.create({ g: m1.maze.g, foods: m1.foods, rule: 'pow', mu: val(el.mu), I0: 1, dt: DT1, noise: val(el.noise), seed: m1.seed * 31 + 7 });
    m1.playing = !!keepPlaying; m1.done = false; m1.res = null; m1.hist = [{ t: 0, kept: 1 }]; m1.alive0 = m1.maze.g.m;
    m1.params = { mu: val(el.mu), noise: val(el.noise) };
    updateRun1Button();
    updateReadouts1();
    request();
  }
  function keptNow() {
    const s = m1.sim, g = s.g;
    let k = 0, a = 0;
    for (let e = 0; e < g.m; e++) if (s.D[e] >= THR) { k += g.len[e]; a++; }
    return { kept: k / (m1.total || 1), alive: a };
  }
  function step1(n) {
    for (let i = 0; i < n && !m1.done; i++) {
      S.step(m1.sim);
      const kn = keptNow();
      if (kn.alive < m1.alive0) { sndPrune(1 - kn.kept); m1.alive0 = kn.alive; }
      if (m1.sim.steps % 2 === 0 || m1.sim.change < TOL) m1.hist.push({ t: m1.sim.t, kept: kn.kept });
      if (m1.sim.change < TOL || m1.sim.steps >= MAXSTEP1) finishRun1();
    }
  }
  function finishRun1() {
    if (m1.done) return;
    m1.done = true; m1.playing = false;
    const r = S.mazeResult(m1.sim, m1.routes, THR);
    const conv = m1.sim.change < TOL;
    m1.res = r;
    const ev = {
      mu: m1.params.mu, noise: m1.params.noise, W: m1.maze.W, H: m1.maze.H, loops: Math.round(val(el.loops)), cells: m1.maze.W * m1.maze.H,
      moved: moved1(), converged: conv, connected: r.connected, single: r.single, len: r.len, shortest: r.shortest, second: r.second,
      nShortest: r.nShortest, cyc: r.cyc, isShortest: r.isShortest, onShortOnly: r.onShortOnly, t: m1.sim.t
    };
    m1.ev = ev;
    rows1.push({ no: ++runNo1, ev: ev });
    renderRows1();
    updateRun1Button();
    updateReadouts1();
    const msg = resultText1(ev);
    setStatus(msg); say(msg);
    sndDone(r.isShortest || (r.cyc > 0 && r.onShortOnly));
    emit('maze', ev);
    request();
  }
  function resultText1(ev) {
    if (!ev.converged) return T('跑了很久還沒有完全穩定：', 'Not fully settled after a long time: ') + routeText(ev);
    if (ev.single && ev.isShortest) return T('穩定了：只剩一條路，而且就是最短的那條（', 'Settled: one route left, and it is the shortest (') + ev.len + T(' 格）。', ' cells).') +
      (ev.nShortest >= 2 ? T('雖然有 ' + ev.nShortest + ' 條一樣短的路，μ 大於 1 時只留下一條。', ' There were ' + ev.nShortest + ' equally short routes, but with μ above 1 only one stays.') : '');
    if (ev.single) return T('穩定了：只剩一條路，但比最短的長（', 'Settled: one route left, but longer than the shortest (') + ev.len + T(' 格，最短 ', ' cells; shortest ') + ev.shortest + T(' 格）。', ').');
    if (ev.onShortOnly && ev.cyc > 0) return T('穩定了：留下的管子都在最短路線上——有 ' + ev.nShortest + ' 條一樣短的路，黏菌哪條都捨不得放。', 'Settled: every tube left is on a shortest route — there are ' + ev.nShortest + ' equally short routes, and the mould keeps them all.');
    return T('穩定了：', 'Settled: ') + routeText(ev);
  }
  function routeText(ev) {
    if (!ev.connected) return T('兩個食物之間斷開了。', 'the two foods are no longer connected.');
    return T('好幾條路一起分攤流量（獨立的環 ', 'several routes share the flow (') + ev.cyc + T(' 個）。', ev.cyc === 1 ? ' loop).' : ' loops).');
  }
  function updateRun1Button() {
    const b = $('run1');
    b.textContent = m1.playing ? T('暫停', 'Pause') : (m1.done ? T('重新生長', 'Grow again') : (m1.sim && m1.sim.steps > 0 ? T('繼續', 'Resume') : T('開始生長', 'Grow')));
  }
  function play1() {
    if (m1.done) reset1(true);
    else m1.playing = !m1.playing;
    if (m1.playing && reducedMotion) { finish1(); return; }
    updateRun1Button();
    if (m1.playing) setStatus(T('黏菌鋪滿了整個迷宮；沒有流動的管子會慢慢萎縮。', 'The mould fills the whole maze; tubes with no flow slowly wither.'));
    request();
  }
  function finish1() {
    if (m1.done) reset1();
    let guard = 0;
    while (!m1.done && guard++ < MAXSTEP1 + 5) step1(1);
  }

  function resize1() {
    const w = cv.clientWidth || 300;
    const wide = w >= 640;
    const h = 440;
    const r = fit(cv, ctx, h);
    W1 = r.w; H1 = r.h;
    const Wc = m1.maze.W, Hc = m1.maze.H;
    let area, chart;
    if (wide) {
      const cw = Math.min(300, Math.max(230, W1 * 0.32));
      area = { x0: 10, y0: 10, x1: W1 - cw - 18, y1: H1 - 10 };
      chart = { x0: W1 - cw + 30, y0: 54, x1: W1 - 14, y1: H1 - 58 };
    } else {
      area = { x0: 8, y0: 8, x1: W1 - 8, y1: H1 - 168 };
      chart = { x0: 48, y0: H1 - 128, x1: W1 - 14, y1: H1 - 30 };
    }
    const cs = Math.max(8, Math.min((area.x1 - area.x0 - 16) / Wc, (area.y1 - area.y0 - 16) / Hc));
    const mw = cs * Wc, mh = cs * Hc;
    L1 = { wide: wide, area: area, chart: chart, cs: cs, mx: area.x0 + (area.x1 - area.x0 - mw) / 2, my: area.y0 + (area.y1 - area.y0 - mh) / 2, mw: mw, mh: mh };
    request();
  }
  function cellXY(c) { const i = c % m1.maze.W, j = (c - i) / m1.maze.W; return [L1.mx + (i + 0.5) * L1.cs, L1.my + (j + 0.5) * L1.cs]; }
  function cellAt(pt) {
    const i = Math.floor((pt[0] - L1.mx) / L1.cs), j = Math.floor((pt[1] - L1.my) / L1.cs);
    if (i < 0 || j < 0 || i >= m1.maze.W || j >= m1.maze.H) return -1;
    return j * m1.maze.W + i;
  }

  function draw1() {
    if (!L1) return;
    const g = ctx;
    D.backdrop(g, W1, H1);
    drawMaze(g);
    drawChart1(g);
  }
  function drawMaze(g) {
    const M = m1.maze, cs = L1.cs, x0 = L1.mx, y0 = L1.my, mg = M.g, s = m1.sim;
    // 洋菜膠
    const pad = Math.max(6, cs * 0.35);
    D.roundRect(g, x0 - pad, y0 - pad, L1.mw + 2 * pad, L1.mh + 2 * pad, 12);
    const gr = g.createLinearGradient(x0, y0, x0 + L1.mw, y0 + L1.mh);
    gr.addColorStop(0, C['sm-agar']); gr.addColorStop(1, C['sm-agar2']);
    g.fillStyle = gr; g.fill();
    g.strokeStyle = D.alpha(C['sm-wall'], 0.6); g.lineWidth = 1.5; g.stroke();
    // 最短路線的淡色提示（結束後才顯示）
    if (m1.done) {
      g.save(); g.strokeStyle = D.alpha(C['sm-best'], 0.22); g.lineWidth = cs * 0.9; g.lineCap = 'round';
      g.beginPath();
      for (let e = 0; e < mg.m; e++) if (m1.routes.onShort[e]) { const a = cellXY(mg.ea[e]), b = cellXY(mg.eb[e]); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); }
      g.stroke(); g.restore();
    }
    // 管子
    let Dmax = 1;
    for (let e = 0; e < mg.m; e++) if (s.D[e] > Dmax) Dmax = s.D[e];
    const list = [], wmax = cs * 0.56;
    for (let e = 0; e < mg.m; e++) {
      if (s.D[e] < THR) continue;
      const a = cellXY(mg.ea[e]), b = cellXY(mg.eb[e]);
      list.push({ x0: a[0], y0: a[1], x1: b[0], y1: b[1], w: Math.max(1, widthOf(s.D[e], Dmax, wmax)), e: e });
    }
    drawTubes(g, list, C['sm-tube']);
    // 流動的亮紋（只在生長時動）
    if (m1.playing && !reducedMotion) {
      g.save(); g.lineCap = 'round';
      g.strokeStyle = D.alpha(C['sm-tube-hi'], 0.85);
      g.setLineDash([cs * 0.12, cs * 0.5]);
      list.forEach(function (it) {
        const q = s.Q[it.e];
        if (Math.abs(q) < 0.02) return;
        const fw = q > 0;
        g.lineWidth = Math.max(1, it.w * 0.35);
        g.lineDashOffset = -m1.phase * cs * (0.6 + 1.6 * Math.min(1, Math.abs(q)));
        g.beginPath();
        if (fw) { g.moveTo(it.x0, it.y0); g.lineTo(it.x1, it.y1); } else { g.moveTo(it.x1, it.y1); g.lineTo(it.x0, it.y0); }
        g.stroke();
      });
      g.restore();
    }
    // 牆
    g.save();
    g.strokeStyle = C['sm-wall']; g.lineCap = 'round'; g.lineWidth = Math.max(2, cs * 0.14);
    g.beginPath();
    const key = M.key, Wc = M.W, Hc = M.H;
    for (let j = 0; j < Hc; j++) for (let i = 0; i < Wc; i++) {
      const c = j * Wc + i, x = x0 + i * cs, y = y0 + j * cs;
      if (i < Wc - 1 && !M.open[key(c, c + 1)]) { g.moveTo(x + cs, y); g.lineTo(x + cs, y + cs); }
      if (j < Hc - 1 && !M.open[key(c, c + Wc)]) { g.moveTo(x, y + cs); g.lineTo(x + cs, y + cs); }
    }
    g.rect(x0, y0, L1.mw, L1.mh);
    g.stroke();
    g.restore();
    // 食物
    const sel = kb1 && kb1.focused() ? kb1.index() : -1;
    m1.foods.forEach(function (f, k) { const p = cellXY(f); oat(g, p[0], p[1], cs * 0.36, k ? 0.5 : -0.4, sel === k || m1.dragK === k); });
    m1.foods.forEach(function (f, k) {
      const p = cellXY(f);
      D.haloText(g, k ? 'B' : 'A', p[0], p[1] - cs * 0.36 - 8, D.c.text, 'center', 'middle', '700 11px ' + FONT);
    });
  }
  function drawChart1(g) {
    const p = L1.chart;
    plotFrame(g, p);
    title(g, T('剩下的管子（占全部）', 'Tube left (share of all)'), p.x0 - (L1.wide ? 28 : 40), p.y0 - 20);
    const h = m1.hist, tmax = Math.max(20, h.length ? h[h.length - 1].t * 1.08 : 20);
    const xOf = function (t) { return p.x0 + (p.x1 - p.x0) * t / tmax; };
    const yOf = function (v) { return p.y1 - (p.y1 - p.y0) * v; };
    yTicks(g, p, 0, 1, 0.25, function (v) { return pct(v, 0); }, yOf);
    xTicks(g, p, 0, tmax, niceStep(tmax, L1.wide ? 4 : 6), function (v) { return num(v, 0); }, xOf, T('時間', 'time'));
    // 只剩最短路線時的比例
    const ys = yOf(m1.routes.shortest / (m1.total || 1));
    g.save(); g.setLineDash([5, 4]); g.strokeStyle = C['sm-best']; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(p.x0, ys); g.lineTo(p.x1, ys); g.stroke(); g.restore();
    D.haloText(g, T('只剩最短路', 'shortest only'), p.x1 - 4, ys - 9, C['sm-best'], 'right', 'middle', '11px ' + FONT);
    g.save();
    g.beginPath(); g.rect(p.x0, p.y0 - 2, p.x1 - p.x0, p.y1 - p.y0 + 4); g.clip();
    g.strokeStyle = D.shade(C['sm-tube'], -0.15); g.lineWidth = 2.4; g.lineJoin = 'round';
    g.beginPath();
    h.forEach(function (pt, i) { const x = xOf(pt.t), y = yOf(pt.kept); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
    g.restore();
    const last = h[h.length - 1];
    if (last) D.ball(g, xOf(last.t), yOf(last.kept), 4, C['sm-tube']);
  }
  function legend1() {
    const sw = function (col, txt, cls) { return '<span><i' + (cls ? ' class="' + cls + '"' : '') + ' style="background:' + col + ';color:' + col + '"></i>' + txt + '</span>'; };
    $('legend').innerHTML = sw(C['sm-tube'], T('黏菌的管子（越粗導度越大）', 'Slime mould tubes (thicker = more conductance)')) +
      sw(C['sm-food'], T('燕麥片（食物，可拖曳）', 'Oat flakes (food; drag them)'), 'dot') +
      sw(C['sm-best'], T('最短路線（結束後顯示）', 'Shortest route (shown at the end)'), 'dash');
  }
  function renderRows1() {
    const t = $('runs1');
    if (!rows1.length) { t.innerHTML = ''; return; }
    let h = '<thead><tr><th>#</th><th>μ</th><th>' + T('迷宮', 'Maze') + '</th><th>' + T('最短（條數）', 'Shortest (routes)') + '</th><th>' + T('第二短', '2nd') + '</th><th>' +
      T('結果', 'Result') + '</th><th>' + T('最短？', 'Shortest?') + '</th><th>' + T('時間', 'Time') + '</th></tr></thead><tbody>';
    rows1.slice(-MAX_ROWS).reverse().forEach(function (x) {
      const ev = x.ev;
      const res = !ev.connected ? T('斷開', 'cut') : ev.single ? T('一條路 ', 'one route, ') + ev.len + T(' 格', ' cells') : T('環 ', 'loops: ') + ev.cyc;
      const ok = ev.single ? ev.isShortest : (ev.connected && ev.onShortOnly);
      h += '<tr><td>' + x.no + '</td><td>' + num(ev.mu, 2) + '</td><td>' + ev.W + '×' + ev.H + ' (+' + ev.loops + ')</td><td>' + ev.shortest + ' (' + ev.nShortest + ')</td><td>' +
        (isFinite(ev.second) ? ev.second : '—') + '</td><td>' + res + '</td><td' + (ok ? ' class="yes"' : '') + '>' + (ok ? T('是', 'yes') : T('否', 'no')) + '</td><td>' +
        num(ev.t, 0) + (ev.converged ? '' : '+') + '</td></tr>';
    });
    t.innerHTML = h + '</tbody>';
  }
  function updateReadouts1() {
    const s = m1.sim, R = m1.routes, kn = keptNow();
    const rows = [
      [T('時間', 'Time'), num(s.t, 1) + '<small>' + T('沒有單位；真的黏菌要幾個小時', 'arbitrary units; a real slime mould takes hours') + '</small>'],
      [T('剩下的管子', 'Tube left'), pct(kn.kept, 0) + '<small>' + kn.alive + ' / ' + m1.maze.g.m + T(' 段', ' segments') + '</small>'],
      [T('最短路線', 'Shortest route'), R.shortest + T(' 格', ' cells') + '<small>' + (R.nShortest > 1 ? T('有 ' + R.nShortest + ' 條一樣短', R.nShortest + ' equally short') : T('只有一條', 'unique')) +
        T('；第二短 ', '; next shortest ') + (isFinite(R.second) ? R.second + T(' 格', ' cells') : '—') + '</small>'],
      [T('狀態', 'State'), m1.done ? (m1.res.single ? T('只剩一條路：', 'One route: ') + m1.res.len + T(' 格', ' cells') : (m1.res.connected ? T('好幾條路（環 ', 'Several routes (') + m1.res.cyc + T(' 個）', ' loops)') : T('斷開', 'Cut'))) :
        (s.steps ? T('還在調整', 'Still adapting') : T('鋪滿整個迷宮', 'Covering the maze'))]
    ];
    $('ro1').innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('');
  }

  // 拖曳食物
  cv.addEventListener('pointerdown', function (ev) {
    if (!L1) return;
    const pt = evPos(cv, ev);
    let best = -1, bd = L1.cs * 0.75;
    m1.foods.forEach(function (f, k) { const p = cellXY(f), d = Math.hypot(p[0] - pt[0], p[1] - pt[1]); if (d < bd) { bd = d; best = k; } });
    if (best < 0) return;
    m1.dragK = best;
    cv.setPointerCapture(ev.pointerId);
    ev.preventDefault();
    request();
  });
  cv.addEventListener('pointermove', function (ev) {
    if (m1.dragK < 0) return;
    const c = cellAt(evPos(cv, ev));
    if (c < 0 || c === m1.foods[1 - m1.dragK] || c === m1.foods[m1.dragK]) return;
    m1.foods[m1.dragK] = c;
    foodsChanged();
  });
  const endDrag = function () { if (m1.dragK >= 0) { m1.dragK = -1; request(); } };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
  function foodsChanged() {
    m1.routes = S.mazeRoutes(m1.maze.g, m1.foods[0], m1.foods[1]);
    reset1();
    setStatus(T('食物換了位置：按「開始生長」讓黏菌重新找路。', 'The food moved: press “Grow” to let the mould find its way again.'));
  }
  const kb1 = window.LabKeys ? window.LabKeys.attach(cv, {
    label: T('迷宮：Enter 切換燕麥片 A、B，方向鍵把它移到相鄰的格子。', 'Maze: Enter switches between oat flakes A and B; the arrow keys move it to the next cell.'),
    items: [0, 1].map(function (k) {
      return {
        name: function () { return T('燕麥片 ', 'Oat flake ') + (k ? 'B' : 'A'); },
        move: function (dx, dy, big) {
          const Wc = m1.maze.W, Hc = m1.maze.H, c = m1.foods[k], st = big ? 3 : 1;
          let i = c % Wc, j = (c - i) / Wc;
          i = Math.max(0, Math.min(Wc - 1, i + dx * st)); j = Math.max(0, Math.min(Hc - 1, j + dy * st));
          const nc = j * Wc + i;
          if (nc === c || nc === m1.foods[1 - k]) return false;
          m1.foods[k] = nc; foodsChanged();
          return true;
        },
        describe: function () {
          const c = m1.foods[k], i = c % m1.maze.W, j = (c - i) / m1.maze.W;
          return T('燕麥片 ' + (k ? 'B' : 'A') + '：第 ' + (j + 1) + ' 列、第 ' + (i + 1) + ' 行；最短路線 ' + m1.routes.shortest + ' 格',
            'Oat flake ' + (k ? 'B' : 'A') + ': row ' + (j + 1) + ', column ' + (i + 1) + '; shortest route ' + m1.routes.shortest + ' cells');
        }
      };
    }),
    onChange: function () { request(); }
  }) : null;

  // =====================================================================
  // 二・臺灣
  // =====================================================================
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  let W2 = 0, H2 = 0, L2 = null;
  const TW = S.taiwan(7), TG = TW.g;
  const RAIL_OK = S.railEdges(TW);
  const CITY = S.CITIES;
  const DEFAULT_ON = CITY.map(function (c) { return !!c.on; });
  const net = { on: DEFAULT_ON.slice(), sim: null, playing: false, done: false, stats: null, mst: null, mstStats: null, railStats: null, ev: null, selCity: 0, params: null };
  let rows2 = [], runNo2 = 0;
  const RIGHT = { kee: 1, tpe: 1, ila: 1, hun: 1, ttt: 1, pif: 1, hch: 1 };   // 名稱寫在右邊（東邊）的城市
  const EAST = { hun: 1, ttt: 1 }, WEST = { tpe: 1, tyn: 1, hsz: 1, mia: 1, txg: 1, chw: 1, yun: 1, cyi: 1, tnn: 1, khh: 1, pif: 1 };

  function foods2() { const f = []; CITY.forEach(function (c, i) { if (net.on[i]) f.push(TW.city[c.id]); }); return f; }
  function onIds() { return CITY.filter(function (c, i) { return net.on[i]; }).map(function (c) { return c.id; }); }
  function isDefault15() { return net.on.every(function (o, i) { return o === DEFAULT_ON[i]; }); }
  function reset2(keepPlaying) {
    S.setMountain(TG, val(el.mtn));
    const f = foods2();
    net.params = { I0: val(el.I0), gamma: val(el.gam), M: val(el.mtn) };
    net.sim = f.length >= 2 ? S.create({ g: TG, foods: f, rule: 'sig', gamma: net.params.gamma, I0: net.params.I0, dt: DT2 }) : null;
    net.playing = !!keepPlaying && !!net.sim; net.done = false; net.ev = null;
    if (f.length >= 2) {
      net.mst = S.mstEdges(TG, f);
      net.mstStats = S.netStats(TG, net.mst, f);
      net.railStats = isDefault15() ? S.netStats(TG, RAIL_OK, f) : null;
    } else { net.mst = null; net.mstStats = null; net.railStats = null; }
    net.stats = null;
    updateRun2Button();
    updateReadouts2();
    if (view3 && view3.active) view3.rebuild();
    request();
  }
  function step2(n) {
    if (!net.sim) return;
    for (let i = 0; i < n && !net.done; i++) {
      S.step(net.sim);
      if (net.sim.change < TOL || net.sim.steps >= MAXSTEP2) finishRun2();
    }
    if (!net.done && net.sim.steps % 6 === 0) { net.stats = S.netStats(TG, S.alive(net.sim, THR), net.sim.foods); updateReadouts2(); }
  }
  function ratios(st) {
    const m = net.mstStats;
    return { TL: st.TL / m.TL, MD: st.connected ? st.MD / m.MD : Infinity, FT: st.FT };
  }
  function finishRun2() {
    if (net.done || !net.sim) return;
    net.done = true; net.playing = false;
    const f = net.sim.foods, ok = S.alive(net.sim, THR), st = S.netStats(TG, ok, f), r = ratios(st);
    net.stats = st;
    const ids = onIds(), d15 = isDefault15(), rs = net.railStats;
    const beat = !!(d15 && rs && st.connected && st.TL <= rs.TL && st.MD <= rs.MD && st.FT >= 0.95);
    const ev = {
      cities: f.length, ids: ids, default15: d15, all17: f.length === CITY.length,
      I0: net.params.I0, gamma: net.params.gamma, M: net.params.M, converged: net.sim.change < TOL, t: net.sim.t,
      connected: st.connected, TL: st.TL, MD: st.MD, FT: st.FT, TLr: r.TL, MDr: r.MD,
      railTL: rs ? rs.TL : null, railMD: rs ? rs.MD : null, railFT: rs ? rs.FT : null, beatRail: beat,
      maxH: S.maxElev(TG, ok), east: ids.some(function (k) { return EAST[k]; }), west: ids.some(function (k) { return WEST[k]; })
    };
    net.ev = ev;
    rows2.push({ no: ++runNo2, ev: ev });
    renderRows2();
    updateRun2Button();
    updateReadouts2();
    const msg = resultText2(ev);
    setStatus2(msg); say(msg);
    sndDone(beat || ev.FT >= 0.9);
    emit('net', ev);
    if (view3 && view3.active) view3.rebuild();
    request();
  }
  function resultText2(ev) {
    if (!ev.connected) return T('有城市被隔開了。', 'Some cities were cut off.');
    let s = (ev.converged ? T('穩定了：', 'Settled: ') : T('跑了很久還沒完全穩定：', 'Not fully settled: ')) +
      T('總長是最小生成樹的 ', 'length ') + num(ev.TLr, 2) + T(' 倍、平均距離 ', '× the spanning tree, mean distance ') + num(ev.MDr, 2) + T(' 倍、容錯 ', '×, fault tolerance ') + pct(ev.FT, 0) + T('。', '.');
    if (ev.FT < 0.05) s += T('這是一棵樹：斷任何一段都會隔開城市。', ' It is a tree: any break cuts a city off.');
    if (ev.beatRail) s += T('總長和平均距離都不輸臺鐵，而且一樣耐用！', ' As short and as quick as the railway, and as robust!');
    return s;
  }
  function updateRun2Button() {
    const b = $('run2');
    b.textContent = net.playing ? T('暫停', 'Pause') : (net.done ? T('重新生長', 'Grow again') : (net.sim && net.sim.steps > 0 ? T('繼續', 'Resume') : T('開始生長', 'Grow')));
  }
  function play2() {
    if (!net.sim) { setStatus2(T('至少要兩個城市有食物。', 'At least two cities need food.')); return; }
    if (net.done) reset2(true);
    else net.playing = !net.playing;
    if (net.playing && reducedMotion) { finish2(); return; }
    updateRun2Button();
    if (net.playing) setStatus2(T('黏菌一開始鋪滿全島；食物之間流量大的管子會變粗。', 'The mould starts out covering the island; tubes carrying flow between the foods grow thicker.'));
    request();
  }
  function finish2() {
    if (!net.sim) return;
    if (net.done) reset2();
    let guard = 0;
    while (!net.done && guard++ < MAXSTEP2 + 5) step2(1);
  }

  // ---------- 版面 ----------
  let bbox = null;
  (function () {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    S.COAST_KM.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    bbox = { x0: x0, x1: x1, y0: y0, y1: y1 };
  })();
  function resize2() {
    const w = cv2.clientWidth || 300, wide = w >= 640;
    const h = wide ? 600 : 860;
    const r = fit(cv2, ctx2, h);
    W2 = r.w; H2 = r.h;
    let map, bars, sc;
    if (wide) {
      const mwid = Math.min(Math.max(300, W2 * 0.46), 420);
      map = { x0: 8, y0: 8, x1: mwid, y1: H2 - 8 };
      bars = { x0: mwid + 22, y0: 16, x1: W2 - 12, y1: 280 };
      sc = { x0: mwid + 62, y0: 340, x1: W2 - 18, y1: H2 - 44 };
    } else {
      map = { x0: 6, y0: 6, x1: W2 - 6, y1: 486 };
      bars = { x0: 10, y0: 500, x1: W2 - 10, y1: 690 };
      sc = { x0: 52, y0: 728, x1: W2 - 16, y1: H2 - 40 };
    }
    // 地圖比例：留給城市名稱的邊
    const mpadX = wide ? 64 : 58, mpadY = 18;
    const s = Math.min((map.x1 - map.x0 - 2 * mpadX) / (bbox.x1 - bbox.x0), (map.y1 - map.y0 - 2 * mpadY) / (bbox.y1 - bbox.y0));
    const cx = (map.x0 + map.x1) / 2, cy = (map.y0 + map.y1) / 2;
    L2 = { wide: wide, map: map, bars: bars, sc: sc, s: s,
      ox: cx - s * (bbox.x0 + bbox.x1) / 2, oy: cy + s * (bbox.y0 + bbox.y1) / 2, dpr: r.dpr };
    terrain = null;
    if (view3 && view3.active) view3.resize();
    request();
  }
  function X(x) { return L2.ox + L2.s * x; }
  function Y(y) { return L2.oy - L2.s * y; }

  // ---------- 示意地形（離屏畫一次） ----------
  let terrain = null;
  function buildTerrain() {
    const m = L2.map, dpr = L2.dpr, k = 2;   // 每 2 個裝置像素算一次
    const wpx = Math.ceil((m.x1 - m.x0) * dpr / k), hpx = Math.ceil((m.y1 - m.y0) * dpr / k);
    const cvs = document.createElement('canvas');
    cvs.width = wpx; cvs.height = hpx;
    const g = cvs.getContext('2d'), img = g.createImageData(wpx, hpx), d = img.data;
    const hs = new Float32Array(wpx * hpx), ins = new Uint8Array(wpx * hpx);
    const rgbOf = function (c) { const v = c.match(/[\d.]+/g); return c[0] === '#' ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)] : [+v[0], +v[1], +v[2]]; };
    const lo = rgbOf(C['sm-low']), mid = rgbOf(C['sm-mid']), hi = rgbOf(C['sm-high']);
    for (let j = 0; j < hpx; j++) for (let i = 0; i < wpx; i++) {
      const px = m.x0 + (i + 0.5) * k / dpr, py = m.y0 + (j + 0.5) * k / dpr;
      const x = (px - L2.ox) / L2.s, y = (L2.oy - py) / L2.s;
      const id = j * wpx + i;
      if (S.inside(x, y)) { ins[id] = 1; hs[id] = S.elev(x, y); }
    }
    const kmPerPx = k / dpr / L2.s;
    for (let j = 0; j < hpx; j++) for (let i = 0; i < wpx; i++) {
      const id = j * wpx + i;
      if (!ins[id]) continue;
      const h = hs[id];
      const hx = (hs[j * wpx + Math.min(wpx - 1, i + 1)] - hs[j * wpx + Math.max(0, i - 1)]) / (2 * kmPerPx);
      const hy = (hs[Math.max(0, j - 1) * wpx + i] - hs[Math.min(hpx - 1, j + 1) * wpx + i]) / (2 * kmPerPx);
      // 光從西北方來
      const shade = Math.max(0.55, Math.min(1.25, 1 + 9 * (hx * 0.6 - hy * 0.8)));
      let c;
      if (h < 0.4) { const u = Math.max(0, (h - 0.04) / 0.36); c = [lo[0] + (mid[0] - lo[0]) * u, lo[1] + (mid[1] - lo[1]) * u, lo[2] + (mid[2] - lo[2]) * u]; }
      else { const u = Math.min(1, (h - 0.4) / 0.6); c = [mid[0] + (hi[0] - mid[0]) * u, mid[1] + (hi[1] - mid[1]) * u, mid[2] + (hi[2] - mid[2]) * u]; }
      const o = id * 4;
      d[o] = Math.min(255, c[0] * shade); d[o + 1] = Math.min(255, c[1] * shade); d[o + 2] = Math.min(255, c[2] * shade); d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    terrain = { cvs: cvs, ver: D.ver };
  }

  function draw2() {
    if (!L2) return;
    const g = ctx2;
    D.backdrop(g, W2, H2);
    drawMap(g);
    drawBars(g);
    drawScatter(g);
  }
  function drawMap(g) {
    const m = L2.map;
    // 海
    D.roundRect(g, m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0, 12);
    const sg = g.createLinearGradient(m.x0, m.y0, m.x1, m.y1);
    sg.addColorStop(0, C['sm-sea']); sg.addColorStop(1, D.shade(C['sm-sea'], D.dark ? -0.2 : -0.06));
    g.fillStyle = sg; g.fill();
    if (!terrain || terrain.ver !== D.ver) buildTerrain();
    g.save();
    D.roundRect(g, m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0, 12); g.clip();
    g.imageSmoothingEnabled = true;
    g.drawImage(terrain.cvs, m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0);
    // 海岸線
    g.beginPath();
    S.COAST_KM.forEach(function (p, i) { if (i) g.lineTo(X(p[0]), Y(p[1])); else g.moveTo(X(p[0]), Y(p[1])); });
    g.closePath();
    g.strokeStyle = C['sm-coast']; g.lineWidth = 1.3; g.stroke();
    g.restore();
    // 比例尺
    const km = 50, sx = m.x0 + 14, sy = m.y1 - 16;
    g.strokeStyle = D.c.text; g.lineWidth = 2;
    g.beginPath(); g.moveTo(sx, sy - 4); g.lineTo(sx, sy); g.lineTo(sx + km * L2.s, sy); g.lineTo(sx + km * L2.s, sy - 4); g.stroke();
    D.haloText(g, km + ' km', sx + km * L2.s / 2, sy - 9, D.c.text, 'center', 'middle', '11px ' + FONT);
    // 最小生成樹與臺鐵
    const edgePath = function (ok) { g.beginPath(); for (let e = 0; e < TG.m; e++) if (ok[e]) { g.moveTo(X(TG.x[TG.ea[e]]), Y(TG.y[TG.ea[e]])); g.lineTo(X(TG.x[TG.eb[e]]), Y(TG.y[TG.eb[e]])); } };
    // 黏菌
    const s = net.sim;
    if (s) {
      let Dmax = 0;
      for (let e = 0; e < TG.m; e++) if (s.D[e] > Dmax) Dmax = s.D[e];
      const list = [], wmax = Math.max(3, Math.min(6, 7 * L2.s * 0.75));
      for (let e = 0; e < TG.m; e++) {
        if (s.D[e] < THR) continue;
        list.push({ x0: X(TG.x[TG.ea[e]]), y0: Y(TG.y[TG.ea[e]]), x1: X(TG.x[TG.eb[e]]), y1: Y(TG.y[TG.eb[e]]), w: Math.max(0.8, widthOf(s.D[e], Dmax || 1, wmax)) });
      }
      drawTubes(g, list, C['sm-tube']);
    }
    if ($('showMst').checked && net.mst) {
      g.save(); g.setLineDash([2, 4]); g.lineCap = 'round'; g.strokeStyle = C['sm-mst']; g.lineWidth = 2.2;
      edgePath(net.mst); g.stroke(); g.restore();
    }
    if ($('showRail').checked) {
      g.save(); g.setLineDash([7, 5]); g.lineCap = 'round'; g.strokeStyle = D.alpha(C['sm-rail'], 0.85); g.lineWidth = 1.8;
      edgePath(RAIL_OK); g.stroke(); g.restore();
    }
    // 城市
    const sel = kb2 && kb2.focused() ? net.selCity : -1;
    L2.cityPts = [];
    CITY.forEach(function (c, i) {
      const n = TW.city[c.id], x = X(TG.x[n]), y = Y(TG.y[n]);
      const right = RIGHT[c.id] === 1;
      if (net.on[i]) oat(g, x, y, 6.5, (i * 1.7) % 3 - 1.5, sel === i);
      else {
        g.beginPath(); g.arc(x, y, 3.6, 0, 2 * Math.PI);
        g.fillStyle = D.c.surface; g.fill(); g.strokeStyle = D.c.muted; g.lineWidth = 1.4; g.stroke();
        if (sel === i) { g.setLineDash([3, 3]); g.strokeStyle = D.c.accent; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 9, 0, 2 * Math.PI); g.stroke(); g.setLineDash([]); }
      }
      const dy = c.id === 'tpe' ? 8 : c.id === 'kee' ? -6 : c.id === 'chw' ? 6 : c.id === 'txg' ? -5 : c.id === 'pif' ? 7 : c.id === 'khh' ? -3 : 0;
      const lx = right ? x + 10 : x - 10;
      D.haloText(g, cityName(c), lx, y + dy, net.on[i] ? D.c.text : D.c.muted, right ? 'left' : 'right', 'middle', (net.on[i] ? '600 ' : '') + '11.5px ' + FONT);
      L2.cityPts.push([x, y, lx, y + dy, right]);
    });
  }
  function drawBars(g) {
    const p = L2.bars;
    title(g, T('三項評比（÷ 最小生成樹）', 'Three scores (÷ minimum spanning tree)'), p.x0, p.y0 + 4);
    const st = net.stats, ms = net.mstStats, rs = net.railStats;
    const rowsDef = [
      { k: 'TL', zh: '總長（成本，越短越省）', en: 'Total length (cost; lower is cheaper)', max: 2, fmt: function (v) { return num(v, 2); } },
      { k: 'MD', zh: '平均距離（越短越快）', en: 'Mean distance (lower is quicker)', max: 1.25, fmt: function (v) { return num(v, 2); } },
      { k: 'FT', zh: '容錯（越高越耐用）', en: 'Fault tolerance (higher is more robust)', max: 1, fmt: function (v) { return pct(v, 0); } }
    ];
    const series = [
      { zh: '黏菌', en: 'Slime mould', col: C['sm-tube'], r: st && ms ? ratios(st) : null },
      { zh: '臺鐵', en: 'Railway', col: C['sm-rail'], r: rs && ms ? ratios(rs) : null },
      { zh: '最小生成樹', en: 'Spanning tree', col: C['sm-mst'], r: ms ? { TL: 1, MD: 1, FT: 0 } : null }
    ];
    const top = p.y0 + 22, rowH = (p.y1 - top) / 3, labW = L2.wide ? 92 : 86;
    g.font = '11px ' + FONT;
    rowsDef.forEach(function (rd, ri) {
      const y0 = top + ri * rowH;
      g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = D.c.muted;
      g.fillText(T(rd.zh, rd.en), p.x0, y0 + 9);
      const bx0 = p.x0 + labW, bx1 = p.x1 - 44, bh = Math.max(9, Math.min(14, (rowH - 26) / 3 - 3));
      let mx = rd.max;
      series.forEach(function (sr) { if (sr.r && isFinite(sr.r[rd.k])) mx = Math.max(mx, sr.r[rd.k] * 1.05); });
      // 1 的參考線
      if (rd.k !== 'FT') {
        const x1 = bx0 + (bx1 - bx0) / mx;
        g.strokeStyle = D.alpha(D.c.text, 0.2); g.setLineDash([3, 3]); g.lineWidth = 1;
        g.beginPath(); g.moveTo(x1, y0 + 18); g.lineTo(x1, y0 + 20 + 3 * (bh + 3)); g.stroke(); g.setLineDash([]);
      }
      series.forEach(function (sr, si) {
        const y = y0 + 20 + si * (bh + 3);
        g.textAlign = 'right'; g.fillStyle = D.c.text; g.textBaseline = 'middle';
        g.fillText(T(sr.zh, sr.en), bx0 - 6, y + bh / 2);
        D.roundRect(g, bx0, y, bx1 - bx0, bh, 3); g.fillStyle = D.alpha(D.c.text, 0.05); g.fill();
        const v = sr.r ? sr.r[rd.k] : null;
        if (v == null || !isFinite(v)) {
          g.textAlign = 'left'; g.fillStyle = D.c.muted;
          g.fillText(sr.r == null && si === 1 ? T('（鐵路 15 城時才比）', '(15 railway cities only)') : '—', bx0 + 6, y + bh / 2);
          return;
        }
        const wv = Math.max(2, (bx1 - bx0) * Math.min(1, v / mx));
        D.roundRect(g, bx0, y, wv, bh, 3);
        const lg = g.createLinearGradient(0, y, 0, y + bh);
        lg.addColorStop(0, D.shade(sr.col, 0.25)); lg.addColorStop(1, sr.col);
        g.fillStyle = lg; g.fill();
        g.textAlign = 'left'; g.fillStyle = D.c.text;
        g.fillText(rd.fmt(v), bx1 + 6, y + bh / 2);
      });
    });
  }
  function drawScatter(g) {
    const p = L2.sc;
    plotFrame(g, p);
    title(g, T('成本與容錯（每次的結果）', 'Cost and fault tolerance (each run)'), p.x0 - (L2.wide ? 40 : 40), p.y0 - 20);
    let xmax = 2;
    rows2.forEach(function (r) { if (isFinite(r.ev.TLr)) xmax = Math.max(xmax, r.ev.TLr * 1.05); });
    xmax = Math.ceil(xmax * 4) / 4;
    const xOf = function (v) { return p.x0 + (p.x1 - p.x0) * (v - 0.9) / (xmax - 0.9); };
    const yOf = function (v) { return p.y1 - (p.y1 - p.y0) * v; };
    yTicks(g, p, 0, 1, 0.25, function (v) { return pct(v, 0); }, yOf);
    xTicks(g, p, 1, xmax, xmax > 2.6 ? 0.5 : 0.25, function (v) { return num(v, 2); }, xOf, T('總長 ÷ 樹', 'length ÷ tree'));
    D.haloText(g, T('↖ 便宜又耐用', '↖ cheap and robust'), p.x0 + 8, p.y0 + 12, D.c.muted, 'left', 'middle', '11px ' + FONT);
    // 最小生成樹
    if (net.mstStats) {
      const x = xOf(1), y = yOf(0);
      g.fillStyle = C['sm-mst']; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); g.fill();
    }
    if (net.railStats && net.mstStats) {
      const r = ratios(net.railStats), x = xOf(r.TL), y = yOf(r.FT);
      g.fillStyle = C['sm-rail']; g.fillRect(x - 5, y - 5, 10, 10);
      D.haloText(g, T('臺鐵', 'Railway'), x + 9, y + 4, D.c.text, 'left', 'middle', '11px ' + FONT);
    }
    rows2.forEach(function (r, i) {
      const ev = r.ev;
      if (!isFinite(ev.TLr)) return;
      const last = i === rows2.length - 1;
      D.ball(g, xOf(ev.TLr), yOf(ev.FT), last ? 6 : 4, last ? C['sm-tube'] : D.alpha(C['sm-tube'], 0.7));
    });
  }
  function legend2() {
    const sw = function (col, txt, cls) { return '<span><i' + (cls ? ' class="' + cls + '"' : '') + ' style="background:' + col + ';color:' + col + '"></i>' + txt + '</span>'; };
    $('legend2').innerHTML = sw(C['sm-tube'], T('黏菌的管子', 'Slime mould tubes')) + sw(C['sm-rail'], T('臺鐵主要路線（簡化）', 'Main railway lines (simplified)'), 'dash') +
      sw(C['sm-mst'], T('最小生成樹', 'Minimum spanning tree'), 'dash') + sw(C['sm-food'], T('有食物的城市', 'Cities with food'), 'dot');
  }
  function renderRows2() {
    const t = $('runs2');
    if (!rows2.length) { t.innerHTML = ''; return; }
    let h = '<thead><tr><th>#</th><th>' + T('城市', 'Cities') + '</th><th>I<sub>0</sub></th><th>γ</th><th>' + T('山區阻力', 'Mountains') + '</th><th>' + T('總長', 'Length') + '</th><th>' +
      T('平均距離', 'Distance') + '</th><th>' + T('容錯', 'Tolerance') + '</th><th>' + T('不輸臺鐵', 'Beats rail') + '</th></tr></thead><tbody>';
    rows2.slice(-MAX_ROWS).reverse().forEach(function (x) {
      const ev = x.ev;
      h += '<tr><td>' + x.no + '</td><td>' + ev.cities + '</td><td>' + num(ev.I0, 2) + '</td><td>' + num(ev.gamma, 2) + '</td><td>' + num(ev.M, 1) + '</td><td>' +
        num(ev.TLr, 2) + ' (' + num(ev.TL, 0) + ' km)</td><td>' + num(ev.MDr, 2) + ' (' + num(ev.MD, 0) + ' km)</td><td>' + pct(ev.FT, 0) + '</td><td' + (ev.beatRail ? ' class="yes"' : '') + '>' +
        (ev.default15 ? (ev.beatRail ? T('是', 'yes') : T('否', 'no')) : '—') + '</td></tr>';
    });
    t.innerHTML = h + '</tbody>';
  }
  function updateReadouts2() {
    const s = net.sim, st = net.stats, ms = net.mstStats, rs = net.railStats;
    const rows = [
      [T('有食物的城市', 'Cities with food'), foods2().length + T(' 個', '') + (isDefault15() ? '<small>' + T('鐵路 15 城', 'the 15 railway cities') + '</small>' : '')],
      [T('時間', 'Time'), s ? num(s.t, 0) + '<small>' + (net.done ? T('已穩定', 'settled') : (s.steps ? T('還在調整', 'still adapting') : T('鋪滿全島', 'covering the island'))) + '</small>' : '—'],
      [T('黏菌網', 'Slime mould network'), st ? num(st.TL, 0) + ' km<small>' + T('平均距離 ', 'mean distance ') + num(st.MD, 0) + ' km' + T('，容錯 ', ', fault tolerance ') + pct(st.FT, 0) + '</small>' : '—'],
      [T('最小生成樹', 'Minimum spanning tree'), ms ? num(ms.TL, 0) + ' km<small>' + T('平均距離 ', 'mean distance ') + num(ms.MD, 0) + ' km' + T('，容錯 0%', ', fault tolerance 0%') + '</small>' : '—'],
      [T('臺鐵（簡化）', 'Railway (simplified)'), rs ? num(rs.TL, 0) + ' km<small>' + T('平均距離 ', 'mean distance ') + num(rs.MD, 0) + ' km' + T('，容錯 ', ', fault tolerance ') + pct(rs.FT, 0) + '</small>' :
        '—<small>' + T('只在鐵路 15 城時比較', 'compared only for the 15 railway cities') + '</small>']
    ];
    $('ro2').innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('');
  }

  // ---------- 城市按鈕 ----------
  function renderCities() {
    $('cities').innerHTML = CITY.map(function (c, i) {
      return '<button type="button" data-i="' + i + '" aria-pressed="' + net.on[i] + '">' + cityName(c) + '</button>';
    }).join('');
  }
  function toggleCity(i) {
    const n = net.on.filter(Boolean).length;
    if (net.on[i] && n <= 2) { setStatus2(T('至少要兩個城市有食物。', 'At least two cities need food.')); return; }
    net.on[i] = !net.on[i];
    renderCities();
    citiesChanged();
  }
  function citiesChanged() {
    reset2();
    setStatus2(T('城市換了：按「開始生長」讓黏菌重新連線。', 'The cities changed: press “Grow” to let the mould connect them again.'));
  }
  $('cities').addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-i]');
    if (b) toggleCity(+b.getAttribute('data-i'));
  });
  $('cityDefault').addEventListener('click', function () { net.on = DEFAULT_ON.slice(); renderCities(); citiesChanged(); });
  $('cityAll').addEventListener('click', function () { net.on = CITY.map(function () { return true; }); renderCities(); citiesChanged(); });
  cv2.addEventListener('click', function (ev) {
    if (!L2 || !L2.cityPts) return;
    const pt = evPos(cv2, ev);
    let best = -1, bd = 16;
    L2.cityPts.forEach(function (c, i) {
      const d = Math.min(Math.hypot(c[0] - pt[0], c[1] - pt[1]), Math.hypot(c[2] + (c[4] ? 14 : -14) - pt[0], c[3] - pt[1]));
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) { net.selCity = best; toggleCity(best); }
  });
  const kb2 = window.LabKeys ? window.LabKeys.attach(cv2, {
    label: T('臺灣地圖：左右方向鍵選城市，上方向鍵放上或拿掉食物。', 'Map of Taiwan: left and right arrows pick a city; the up arrow adds or removes its food.'),
    items: [{
      name: function () { return T('城市', 'City'); },
      move: function (dx, dy) {
        if (dx) { net.selCity = (net.selCity + dx + CITY.length) % CITY.length; return true; }
        if (dy) { toggleCity(net.selCity); return true; }
        return false;
      },
      describe: function () { const c = CITY[net.selCity]; return cityName(c) + T(net.on[net.selCity] ? '：有食物' : '：沒有食物', net.on[net.selCity] ? ': has food' : ': no food'); }
    }],
    onChange: function () { request(); }
  }) : null;

  // =====================================================================
  // 動畫
  // =====================================================================
  let raf = 0, lastNow = 0;
  function request() { if (!raf) raf = requestAnimationFrame(tick); }
  function tick(now) {
    raf = 0;
    let more = false;
    const dts = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0.016;
    lastNow = now;
    if (m1.playing) {
      m1.phase += dts * 6;
      step1(1);
      updateReadouts1();
      if (!m1.done) more = true;
    }
    if (net.playing) {
      step2(1);
      if (!net.done) more = true;
    }
    if (!more) lastNow = 0;
    draw1();
    if (view3 && view3.active) { view3.frame(); if (view3.busy && view3.busy()) more = true; }
    else draw2();
    if (more) request();
  }

  // =====================================================================
  // 3D 檢視：切換時才載入 js/slime-mold-3d.js 與 three.js；切回 2D 時整個釋放。
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage2'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    S: S, T: T, D: D, num: num, pct: pct, reducedMotion: reducedMotion, TW: TW, CITY: CITY, RAIL: RAIL_OK, THR: THR,
    colors: function () { return C; },
    net: function () { return net; },
    showRail: function () { return $('showRail').checked; },
    showMst: function () { return $('showMst').checked; },
    request: function () { request(); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 地圖。', 'The 3D graphics context was lost, so the view switched back to the 2D map.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.SM3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.SM3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/slime-mold-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.SM3D) throw new Error('slime-mold-3d.js did not load');
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
        view3 = window.SM3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        requestAnimationFrame(function () { if (view3) { view3.onShow(); request(); } });
        request();
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
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      $('resetCam').hidden = true;
      resize2();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 地圖。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D map is kept.');
    resize2();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // =====================================================================
  // 事件綁定
  // =====================================================================
  $('run1').addEventListener('click', play1);
  $('finish1').addEventListener('click', finish1);
  $('reset1').addEventListener('click', function () { reset1(); setStatus(T('黏菌重新鋪滿了迷宮。', 'The mould fills the maze again.')); });
  $('newMaze').addEventListener('click', function () { m1.seed++; buildMaze(true); resize1(); setStatus(T('換了一個新的迷宮（第 ' + m1.seed + ' 號）。', 'A new maze (number ' + m1.seed + ').')); });
  $('clear1').addEventListener('click', function () { rows1 = []; renderRows1(); reset1(); setStatus(T('已清除紀錄表、重新鋪滿；設定沒有改變。', 'Table cleared and the maze refilled; the settings are unchanged.')); });
  [el.mu, el.noise].forEach(function (r) {
    r.addEventListener('input', function () {
      refreshOutputs();
      const was = m1.sim.steps || m1.done;
      reset1();
      if (was) setStatus(T('設定改了：黏菌重新鋪滿，按「開始生長」再試一次。', 'Settings changed: the mould refills the maze; press “Grow” to try again.'));
    });
  });
  [el.mw, el.mh, el.loops].forEach(function (r) {
    r.addEventListener('input', function () { refreshOutputs(); buildMaze(r === el.loops); resize1(); });
  });
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  $('run2').addEventListener('click', play2);
  $('finish2').addEventListener('click', finish2);
  $('reset2').addEventListener('click', function () { reset2(); setStatus2(T('黏菌重新鋪滿全島。', 'The mould covers the island again.')); });
  $('clear2').addEventListener('click', function () { rows2 = []; renderRows2(); reset2(); setStatus2(T('已清除紀錄表、重新鋪滿；設定沒有改變。', 'Table cleared and the island covered again; the settings are unchanged.')); });
  [el.I0, el.gam, el.mtn].forEach(function (r) {
    r.addEventListener('input', function () {
      refreshOutputs();
      const was = net.sim && (net.sim.steps || net.done);
      reset2();
      if (was) setStatus2(T('設定改了：黏菌重新鋪滿全島，按「開始生長」再試一次。', 'Settings changed: the mould covers the island again; press “Grow” to try again.'));
    });
  });
  ['showRail', 'showMst'].forEach(function (id) { $(id).addEventListener('change', function () { if (view3 && view3.active) view3.rebuild(); request(); }); });

  // ---------- 分享目前設定（滑桿與勾選由共用程式記錄；這裡記迷宮編號、食物位置、城市） ----------
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () { return { s: m1.seed, f: m1.foods.slice(), c: net.on.map(function (o) { return o ? 1 : 0; }).join('') }; },
    set: function (o) {
      refreshOutputs();
      if (o && o.s) m1.seed = Math.max(1, Math.round(+o.s) || 1);
      buildMaze(false);
      if (o && Array.isArray(o.f) && o.f.length === 2) {
        const n = m1.maze.W * m1.maze.H, a = Math.round(+o.f[0]), b = Math.round(+o.f[1]);
        if (a >= 0 && b >= 0 && a < n && b < n && a !== b) { m1.foods = [a, b]; m1.routes = S.mazeRoutes(m1.maze.g, a, b); reset1(); }
      }
      if (o && typeof o.c === 'string' && o.c.length === CITY.length && (o.c.match(/1/g) || []).length >= 2) {
        net.on = o.c.split('').map(function (ch) { return ch === '1'; });
        renderCities();
      }
      reset2();
      resize1();
    }
  });

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  refreshOutputs();
  updateSoundButton();
  renderCities();
  legend1(); legend2();
  function themeChanged() {
    readColors();
    terrain = null;
    if (view3 && view3.active) view3.onTheme();
    legend1(); legend2();
    request();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  buildMaze(false);
  reset2();
  setStatus(T('按「開始生長」：黏菌一開始鋪滿整個迷宮，兩片燕麥片之間有原生質流動。', 'Press “Grow”: the mould starts out filling the whole maze, with protoplasm flowing between the two oat flakes.'));
  setStatus2(T('先用預設值按「開始生長」，再把 I0 調大、把山區阻力調高，看網路怎麼變。', 'Press “Grow” with the defaults, then raise I0 and the mountain resistance and see how the network changes.'));
  if (reducedMotion) $('status2').textContent += T('（已偵測到「減少動態效果」：直接顯示結果。）', ' (Reduced motion is on: results are shown at once.)');
  if (window.ResizeObserver) {
    const watch = function (c, fn) { let lw = 0; new ResizeObserver(function () { if (c.clientWidth && c.clientWidth !== lw) { lw = c.clientWidth; fn(); } }).observe(c); };
    watch(cv, resize1); watch(cv2, resize2);
  } else window.addEventListener('resize', function () { resize1(); resize2(); });
  resize1(); resize2();
  request();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastNow = 0; request(); } });
  // 測試與縮圖用
  window.__sm = {
    S: S, m1: m1, net: net, TW: TW,
    grow1: play1, finish1: finish1, reset1: reset1,
    newMaze: function (seed) { m1.seed = seed || m1.seed + 1; buildMaze(true); resize1(); },
    setFoods: function (a, b) { m1.foods = [a, b]; foodsChanged(); },
    grow2: play2, finish2: finish2, reset2: reset2,
    setCities: function (ids) { net.on = CITY.map(function (c) { return ids.indexOf(c.id) >= 0; }); renderCities(); reset2(); },
    setView: setView
  };
})();
