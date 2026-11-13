/*
 * esterification.js — 「酯化反應」的頁面程式（迴流裝置、分子示意圓、操作、讀數、三種圖、平衡紀錄、分液、3D 切換、音效、任務事件）
 * 化學核心在 js/esterification-core.js（EsterCore）；3D 機構在 js/esterification-3d.js（ES3D，three.js 切到 3D 才載入）。
 * 畫面上的氣泡、冷凝水滴、分子的漂動只是裝飾；莫耳數、體積、產率、Q、K 都直接來自核心的計算。
 *
 * 任務事件（只在使用者操作過之後送出）：
 *   'tick'：每 0.5 秒 { acid, alc, label, n{A,B,E,W}, n0{…}, add{…}, sieves, cat, T, Tmin, Tmax, t, xi, yield, yA, yB,
 *            eq（已達平衡）, lnQK0（起始組成的 ln(Q/K)，溫度沒變過時才有）, t50（產率第一次到 50% 的時間；有加料或分子篩時 null）, running, worked }
 *   'equil'：達到平衡的那一刻 { rec, log（這一段之前的平衡紀錄） }；rec = { acid, alc, label, n0, add, sieves, cat, T, Tmin, Tmax, t, n, xi, yield, yA, yB, fresh }
 *   'shift'：平衡被擾動（加料、分子篩、改溫度）後又回到平衡 { base（擾動前的平衡 rec）, now（新的平衡 rec）, adds{A,B,E,W}, sieves（期間加的分子篩次數）, T0, T1 }
 *   'workup'：分出酯層 { acid, alc, label, esterMol, esterMass, yield, xi, t }
 */
(function () {
  'use strict';
  const C = window.EsterCore, LD = window.LabDraw;
  if (!C || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const reducedMotion = LD.reducedMotion();
  const SPEEDS = [1, 60, 600, 6000, 60000];
    const SP = ['A', 'B', 'E', 'W'];

  // ======================= 數字格式 =======================
  function num(x, d) {
    if (x == null || !isFinite(x)) return '—';
    const s = (+x).toFixed(d == null ? 0 : d);
    return s.charAt(0) === '-' ? (/^-0(\.0*)?$/.test(s) ? s.slice(1) : '−' + s.slice(1)) : s;
  }
  function sciParts(x, sig) {
    if (x == null || !isFinite(x) || x === 0) return { m: x === 0 ? '0' : '—', e: null };
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= -2 && e < 4) return { m: num(x, Math.max(0, (sig || 3) - 1 - e)), e: null };
    const m = x / Math.pow(10, e);
    if (Math.abs(+m.toFixed((sig || 3) - 1)) >= 10) return sciParts(Math.sign(x) * Math.pow(10, e + 1), sig);
    return { m: num(m, (sig || 3) - 1), e: e };
  }
  function sciHTML(x, sig) {
    const p = sciParts(x, sig);
    return p.e == null ? p.m : p.m + ' × 10<sup>' + num(p.e, 0) + '</sup>';
  }
  function sigf(x, sig) {
    if (x == null || !isFinite(x)) return '—';
    if (x === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(x)));
    return num(x, Math.max(0, Math.min(6, (sig || 3) - 1 - e)));
  }
  function pct(x, d) { return x == null || !isFinite(x) ? '—' : num(x * 100, d == null ? 1 : d) + '%'; }
  function fmtT(t) {
    if (t < 120) return num(t, 0) + ' ' + T('秒', 's');
    if (t < 7200) return num(t / 60, t < 600 ? 1 : 0) + ' ' + T('分鐘', 'min');
    if (t < 172800) return num(t / 3600, 1) + ' ' + T('小時', 'h');
    return num(t / 86400, 1) + ' ' + T('天', 'days');
  }
  /** 示性式 → HTML（數字下標） */
  function fH(s) { return s.replace(/([A-Za-z\)])(\d+)/g, '$1<sub>$2</sub>'); }
  /** 示性式 → 畫布 parts（數字下標） */
  function fP(s) {
    const out = [];
    s.split(/(\d+)/).forEach(function (p, i) { if (p) out.push([p, i % 2 ? -1 : 0]); });
    return out;
  }

  // ======================= 名稱 =======================
  function acidName(k) { const a = C.ACIDS[k || state.acid]; return T(a.zh, a.en); }
  function alcName(k) { const b = C.ALCS[k || state.alc]; return T(b.zh, b.en); }
  function esterOf(a, b) { return C.ester(a || state.acid, b || state.alc); }
  function esterName(a, b) { const e = esterOf(a, b); return T(e.zh, e.en); }
  function spName(sp) { return sp === 'A' ? acidName() : sp === 'B' ? alcName() : sp === 'E' ? esterName() : T('水', 'water'); }
  function spShort(sp) { return sp === 'A' ? T('酸', 'acid') : sp === 'B' ? T('醇', 'alcohol') : sp === 'E' ? T('酯', 'ester') : T('水', 'water'); }

  // ======================= 顏色 =======================
  let col = {};
  function readColors() {
    const c = LD.c, cs = getComputedStyle(document.documentElement);
    const v = function (k, d) { const s = cs.getPropertyValue(k).trim(); return s || d; };
    col = {
      text: c.text, muted: c.muted, border: c.border, accent: c.accent, bg: c['canvas-bg'], surface: c.surface, dark: LD.dark,
      A: c.pos || '#d1453b', B: c.neg || '#2f6fd0', E: c.probe || '#0d7f57', W: c.field || '#7a5bd0',
      elC: v('--el-c', '#4a5260'), elO: v('--el-o', '#e0453a'), elH: v('--el-h', '#f2f4f7'), el18: v('--el-18', '#d39b06'),
      bath: v('--es-bath', '#9ccbe6'), glass: v('--es-glass', '#7d97a5'), liq: v('--es-liq', '#e9eef2'), ester: v('--es-ester', '#f3d58a'),
      steel: LD.dark ? '#aab3bc' : '#8d969f', plate: LD.dark ? '#3c434b' : '#5b636c', hot: LD.dark ? '#ff7a5c' : '#d9462f'
    };
    molSprites = {};
  }

  // ======================= 狀態 =======================
  const state = { acid: 'acetic', alc: 'ethanol', speed: 1, tab: 'n', view: '2d', running: false };
  const el = { nA: $('nA'), nB: $('nB'), nE: $('nE'), nW: $('nW'), cat: $('cat'), temp: $('temp'), label: $('label18') };
  let run = null, samples = [], ghosts = [], eqLog = [], eqSeq = 0;
  let eqArmed = true, lastEq = null, pend = null;
  let t50 = null, pure = true;
  let worked = null, workT = 0;
  let userActed = false, syncing = false;
  let lastFormedStep = 0, lastSoundAt = 0;
  let statusMsg = '', statusCls = '';
  const cv = $('cv'), ctx = cv.getContext('2d');
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  function val(e) { return window.LabNum ? window.LabNum.value(e) : +e.value; }
  function setVal(e, v) { syncing = true; if (window.LabNum) window.LabNum.set(e, v); else e.value = v; syncing = false; }
  function snd() { return window.LabSound && window.LabSound.enabled(); }
  function acted() { userActed = true; }

  function setupOpts() {
    return { acid: state.acid, alc: state.alc, A: val(el.nA), B: val(el.nB), E: val(el.nE), W: val(el.nW), cat: val(el.cat), T: val(el.temp), label: el.label.checked };
  }
  /** 重新配一瓶（設定保留）；舊的一瓶有做過就留一條淡淡的曲線 */
  function newRun() {
    if (run && run.t > 0 && samples.length > 2) {
      ghosts.push({ name: esterName(run.acid, run.alc), pts: samples.map(function (s) { return [s.t, s.E, s.Q, s.K]; }), tag: ++ghostSeq });
      if (ghosts.length > 5) ghosts.shift();
    }
    run = C.createRun(setupOpts());
    samples = []; sample(true);
    eqArmed = true; lastEq = null; pend = null;
    t50 = null; pure = true;
    worked = null;
    lastFormedStep = 0;
    state.running = false;
    syncMols(true);
    updateButtons();
  }
  let ghostSeq = 0;
  function sample(force) {
    const last = samples[samples.length - 1];
    if (!force && last && run.t - last.t < Math.max(0.5, run.t * 0.004)) return;
    samples.push({ t: run.t, A: run.A, B: run.B, E: run.E, W: run.W, Q: C.Q(run), K: C.K(run.T) });
    if (samples.length > 2400) samples = samples.filter(function (s, i) { return i % 2 === 0 || i === samples.length - 1; });
  }

  // ======================= 平衡、擾動、事件 =======================
  function rec() {
    const inA = C.inTotal(run, 'A'), inB = C.inTotal(run, 'B');
    const addsum = run.add.A + run.add.B + run.add.E + run.add.W;
    return {
      id: ++eqSeq, acid: run.acid, alc: run.alc, label: run.label,
      n0: Object.assign({}, run.n0), add: Object.assign({}, run.add), sieves: run.sieves, cat: run.cat,
      T: run.T, Tmin: run.Tmin, Tmax: run.Tmax, t: run.t,
      n: { A: run.A, B: run.B, E: run.E, W: run.W }, xi: run.xi, yield: C.yieldOf(run),
      yA: inA > 1e-9 ? run.xi / inA : null, yB: inB > 1e-9 ? run.xi / inB : null,
      fresh: addsum < 1e-12 && run.sieves === 0 && run.Tmax - run.Tmin <= 1
    };
  }
  function emit(type, data) { if (userActed && window.LabMission) window.LabMission.emit(type, data); }
  function onEquilibrium() {
    eqArmed = false;
    const r = rec();
    lastEq = r;
    const log = eqLog.slice();
    eqLog.push(r);
    renderTable();
    emit('equil', { rec: r, log: log });
    if (pend && pend !== 'broken') {
      emit('shift', { base: pend.base, now: r, adds: pend.adds, sieves: pend.sieves, T0: pend.T0, T1: run.T });
      const d = r.n.E - pend.base.n.E;
      setStatus(Math.abs(d) < 0.0005 ? T('又回到平衡了，而且酯的量幾乎沒變。', 'Back at equilibrium — and the amount of ester has hardly changed.') :
        d > 0 ? T('又回到平衡：這次酯多了 ', 'Back at equilibrium: there is now ') + num(d, 3) + T(' mol。', ' mol more ester.') :
          T('又回到平衡：這次酯少了 ', 'Back at equilibrium: there is now ') + num(-d, 3) + T(' mol。', ' mol less ester.'), 'good');
    } else {
      setStatus(T('達到平衡了：Q 等於 K，正反應和逆反應一樣快，酯不再增加。', 'Equilibrium: Q equals K, the forward and backward reactions run equally fast, and the ester stops increasing.'), 'good');
    }
    pend = null;
    if (snd()) { window.LabSound.tone({ freq: 660, dur: 0.14, gain: 0.07 }); window.LabSound.tone({ freq: 990, dur: 0.22, gain: 0.06, delay: 0.12 }); }
  }
  /** 平衡被擾動：kind 'add'（sp）、'sieve'、'T' */
  function perturb(kind, sp) {
    if (!eqArmed && lastEq) pend = { base: lastEq, adds: { A: 0, B: 0, E: 0, W: 0 }, sieves: 0, T0: lastEq.T };
    else if (!pend) pend = 'broken';
    if (pend && pend !== 'broken') {
      if (kind === 'add') pend.adds[sp] += 0.1;
      else if (kind === 'sieve') pend.sieves++;
    }
    eqArmed = true;
    if (kind !== 'T') pure = false;
  }
  function tickData() {
    const inA = C.inTotal(run, 'A'), inB = C.inTotal(run, 'B');
    const q0 = C.Q(run.n0);
    return {
      acid: run.acid, alc: run.alc, label: run.label,
      n: { A: run.A, B: run.B, E: run.E, W: run.W }, n0: Object.assign({}, run.n0), add: Object.assign({}, run.add),
      sieves: run.sieves, cat: run.cat, T: run.T, Tmin: run.Tmin, Tmax: run.Tmax, t: run.t, xi: run.xi,
      yield: C.yieldOf(run), yA: inA > 1e-9 ? run.xi / inA : null, yB: inB > 1e-9 ? run.xi / inB : null,
      eq: C.atEquilibrium(run), lnQK0: run.Tmax - run.Tmin <= 0.5 && q0 > 0 && isFinite(q0) ? Math.log(q0 / C.K(run.T)) : null,
      t50: t50, running: state.running, worked: !!worked
    };
  }

  // ======================= 主迴圈 =======================
  let raf = 0, lastTs = 0, lastUi = 0, lastDraw = 0, phase = 0;
  function startLoop() { if (!raf) { lastTs = 0; raf = requestAnimationFrame(loop); } }
  function loop(ts) {
    raf = 0;
    const dtw = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (dtw > 0) {
      if (state.running && !worked) advance(dtw * SPEEDS[state.speed]);
      if (!reducedMotion) { phase += dtw; driftMols(dtw); }
      fx.forEach(function (f) { f.u += dtw / f.dur; });
      fx = fx.filter(function (f) { return f.u < 1; });
    }
    const now = performance.now();
    const busy = state.running || fx.length > 0 || (worked && now - workT < 4000);
    if (state.view === '2d' && (busy || now - lastDraw > 50)) { drawStage(); lastDraw = now; }
    if (now - lastUi > 200) { lastUi = now; updateReadouts(); drawGraph(); }
    if (busy || (!reducedMotion && state.view === '2d')) raf = requestAnimationFrame(loop);
  }
  function advance(dt) {
    const fine = pure && t50 == null && run.t < 7200;
    let left = dt;
    while (left > 1e-9) {
      // 第一次到 50% 之前每段 ≤ 10 s；之後每段不超過目前時間的 1%（圖上的取樣、平衡的判定都夠細）
      const h = fine ? Math.min(left, 10) : Math.min(left, Math.max(10, (run.t + left) * 0.01));
      const y0 = C.yieldOf(run), t0 = run.t;
      C.step(run, h);
      left -= h;
      const y1 = C.yieldOf(run);
      if (pure && t50 == null && y0 != null && y1 != null && y0 < 0.5 && y1 >= 0.5) t50 = t0 + (run.t - t0) * (0.5 - y0) / (y1 - y0);
      sample(false);
      if (eqArmed && C.atEquilibrium(run)) { onEquilibrium(); }
    }
    syncMols(false);
    formedSound();
  }
  function formedSound() {
    const k = Math.floor(run.xi / 0.05 + 1e-9);
    if (k === lastFormedStep) return;
    const up = k > lastFormedStep;
    lastFormedStep = k;
    const now = performance.now();
    if (!snd() || now - lastSoundAt < 110) return;
    lastSoundAt = now;
    const y = C.yieldOf(run);
    const f = up ? 420 + 500 * Math.max(0, Math.min(1, y == null ? 0.5 : y)) : 360;
    window.LabSound.tone({ freq: f, dur: 0.07, gain: 0.05, type: up ? 'sine' : 'triangle' });
  }

  // ======================= 操作 =======================
  function setStatus(s, cls) { statusMsg = s || ''; statusCls = cls || ''; renderStatus(); }
  function renderStatus() {
    const st = $('status');
    st.className = 'status' + (statusCls ? ' ' + statusCls : '');
    st.innerHTML = statusMsg || autoStatus();
  }
  function autoStatus() {
    if (worked) return '';
    if (!state.running && run.t === 0) return T('配好了。按「開始加熱」讓反應開始。', 'Ready. Press “Start heating” to begin.');
    return '';
  }
  function togglePlay() {
    if (worked) return;
    if (!(run.A + run.B > 0 && run.E + run.W >= 0) || (run.A === 0 && run.E === 0) || (run.B === 0 && run.W === 0) || (run.A * run.B === 0 && run.E * run.W === 0)) {
      setStatus(T('瓶裡沒有可以反應的組合：要有酸和醇，或酯和水。', 'Nothing in the flask can react: you need acid and alcohol, or ester and water.'), 'warn');
      if (snd()) window.LabSound.tone({ freq: 300, dur: 0.15, gain: 0.06, type: 'triangle' });
      return;
    }
    state.running = !state.running;
    if (state.running) {
      setStatus(run.t === 0 ? (run.cat > 0 ? T('加熱中。濃硫酸讓反應加快。', 'Heating. The sulfuric acid speeds the reaction up.') :
        T('加熱中，但沒有加濃硫酸：反應會非常慢，試試把時間倍率調大。', 'Heating, but without sulfuric acid the reaction is very slow — try a bigger speed-up.')) : '');
      if (snd()) window.LabSound.sweep({ from: 440, to: 660, dur: 0.18, gain: 0.06 });
    } else setStatus(T('暫停。', 'Paused.'));
    updateButtons();
    startLoop();
  }
  function doAdd(sp) {
    if (worked) return;
    acted();
    if (!C.addSpecies(run, sp)) {
      setStatus(T('燒瓶已經快滿了（超過六分滿），不能再加。', 'The flask is nearly full (over 60%) — no more can go in.'), 'warn');
      if (snd()) window.LabSound.tone({ freq: 300, dur: 0.15, gain: 0.06, type: 'triangle' });
      return;
    }
    if (run.t > 0) perturb('add', sp);
    else { pure = false; }
    sample(true);
    syncMols(false);
    const dir = C.direction(run);
    setStatus(T('加入 0.10 mol ', 'Added 0.10 mol of ') + spName(sp) + T('。', '. ') +
      (dir === 'fwd' ? T('現在 Q < K：反應向右，酯會變多。', 'Now Q < K: the reaction moves forward and the ester increases.') :
        dir === 'rev' ? T('現在 Q > K：反應向左，酯會水解變少。', 'Now Q > K: the reaction moves backward and some ester is hydrolysed.') : ''));
    if (snd()) window.LabSound.sweep({ from: 760, to: 380, dur: 0.16, gain: 0.07 });
    fx.push({ kind: 'drop', u: 0, dur: 0.6 });
    refreshAll();
    startLoop();
  }
  function doSieves() {
    if (worked) return;
    acted();
    if (!C.addSieves(run)) { setStatus(T('分子篩最多加 5 次（100 g）。', 'At most 5 portions (100 g) of molecular sieves.'), 'warn'); return; }
    if (run.t > 0) perturb('sieve'); else pure = false;
    setStatus(T('加入 20 g 分子篩：它的小孔只容得下水分子，會把水慢慢吸走。', 'Added 20 g of molecular sieves: their pores only fit water molecules, so they slowly soak the water up.'));
    if (snd()) window.LabSound.noise({ dur: 0.25, gain: 0.25, filter: 3200, q: 1.5 });
    fx.push({ kind: 'drop', u: 0, dur: 0.6 });
    refreshAll();
    startLoop();
  }
  function doWorkup() {
    if (worked) return;
    acted();
    if (run.t === 0) { setStatus(T('還沒有開始反應。先加熱一段時間，再分出酯層。', 'Nothing has reacted yet. Heat for a while first, then separate the ester.'), 'warn'); return; }
    state.running = false;
    worked = C.workup(run);
    worked.name = esterName(); worked.smell = esterOf().smell;
    workT = performance.now();
    syncMols(true);
    const y = C.yieldOf(run);
    emit('workup', { acid: run.acid, alc: run.alc, label: run.label, esterMol: run.E, esterMass: worked.esterMass, yield: y, xi: run.xi, t: run.t });
    setStatus(T('倒進飽和碳酸鈉溶液：剩下的酸被中和、冒出二氧化碳；酯浮在上層，大約 ', 'Poured into saturated sodium carbonate: the leftover acids are neutralised and fizz out carbon dioxide; the ester floats on top — about ') +
      num(worked.esterVol, 1) + T(' mL。聞起來像', ' mL. It smells of ') + T(worked.smell[0], worked.smell[1]) + T('。', '.'), 'good');
    if (snd()) window.LabSound.noise({ dur: 1.2, gain: 0.2, filter: 2400, q: 0.8 });
    updateButtons();
    refreshAll();
    startLoop();
  }
  function changed() {
    acted();
    newRun();
    setStatus(T('重新配好一瓶。', 'A fresh flask is ready.'));
    refreshAll();
  }

  // ======================= 分子示意圓 =======================
  let mols = [], fx = [], molSprites = {};
  /** 目前瓶中（或分液後的酯層）四種分子的目標個數（最大餘數法） */
  function targetCounts() {
    const n = worked ? { A: 0, B: 0, E: run.E, W: 0 } : { A: run.A, B: run.B, E: run.E, W: run.W };
    const tot = n.A + n.B + n.E + n.W;
    const out = { A: 0, B: 0, E: 0, W: 0 };
    if (tot <= 0) return out;
    const NM = nMol();
    const N = worked ? Math.max(1, Math.round(NM * 0.6)) : NM;
    const rem = [];
    let used = 0;
    SP.forEach(function (k) { const x = n[k] / tot * N; out[k] = Math.floor(x); used += out[k]; rem.push([x - out[k], k]); });
    rem.sort(function (a, b) { return b[0] - a[0]; });
    for (let i = 0; used < N; i++, used++) out[rem[i % 4][1]]++;
    return out;
  }
  function rnd() { return Math.random(); }
  /** 圓裡畫幾個分子：依圓的大小，大螢幕 32 個、手機約 18 個 */
  function nMol() { return G ? Math.max(14, Math.min(32, Math.round(G.circ.r * G.circ.r / 640))) : 32; }
  /** 新分子放在離其他分子最遠的候選位置（取 24 個隨機點裡最好的），一開始就不會疊在一起 */
  function newMol(type) {
    let best = null, bd = -1;
    for (let k = 0; k < 24; k++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.78, x = r * Math.cos(a), y = r * Math.sin(a);
      let d = 1e9;
      mols.forEach(function (m) { d = Math.min(d, Math.hypot(m.x - x, m.y - y)); });
      if (d > bd) { bd = d; best = [x, y]; }
    }
    return { type: type, x: best[0], y: best[1], vx: 0, vy: 0, ang: rnd() * Math.PI * 2, va: (rnd() - 0.5) * 0.6 };
  }
  function syncMols(reset) {
    const tg = targetCounts();
    if (reset) { mols = []; SP.forEach(function (k) { for (let i = 0; i < tg[k]; i++) mols.push(newMol(k)); }); return; }
    const cnt = { A: 0, B: 0, E: 0, W: 0 };
    mols.forEach(function (m) { cnt[m.type]++; });
    const d = {}; SP.forEach(function (k) { d[k] = tg[k] - cnt[k]; });
    const pick = function (type, near) {
      let best = -1, bd = 1e9;
      mols.forEach(function (m, i) { if (m.type !== type) return; const dd = near ? Math.hypot(m.x - near.x, m.y - near.y) : rnd(); if (dd < bd) { bd = dd; best = i; } });
      return best;
    };
    // 酸＋醇 → 酯＋水（一對一對地變，畫一個閃光）
    while (d.E > 0 && d.W > 0 && d.A < 0 && d.B < 0) {
      const ia = pick('A'); if (ia < 0) break;
      const ib = pick('B', mols[ia]); if (ib < 0) break;
      mols[ia].type = 'E'; mols[ib].type = 'W';
      if (!reducedMotion) fx.push({ kind: 'react', x: (mols[ia].x + mols[ib].x) / 2, y: (mols[ia].y + mols[ib].y) / 2, u: 0, dur: 0.5, fwd: true });
      d.E--; d.W--; d.A++; d.B++;
    }
    while (d.A > 0 && d.B > 0 && d.E < 0 && d.W < 0) {
      const ie = pick('E'); if (ie < 0) break;
      const iw = pick('W', mols[ie]); if (iw < 0) break;
      mols[ie].type = 'A'; mols[iw].type = 'B';
      if (!reducedMotion) fx.push({ kind: 'react', x: (mols[ie].x + mols[iw].x) / 2, y: (mols[ie].y + mols[iw].y) / 2, u: 0, dur: 0.5, fwd: false });
      d.E++; d.W++; d.A--; d.B--;
    }
    // 其他差額（加料、分子篩吸水、分液）：多的換成少的，或增減分子
    SP.forEach(function (k) {
      while (d[k] < 0) {
        const i = pick(k); if (i < 0) break;
        const to = SP.filter(function (q) { return d[q] > 0; })[0];
        if (to) { mols[i].type = to; d[to]--; } else mols.splice(i, 1);
        d[k]++;
      }
    });
    SP.forEach(function (k) { while (d[k] > 0) { mols.push(newMol(k)); d[k]--; } });
  }
  function driftMols(dt) {
    const sp = state.running ? 0.35 + 0.35 * (run.T - 20) / 60 : 0.12;
    // 分子之間輕輕互相推開，避免疊成一團（只是畫面效果）
    for (let i = 0; i < mols.length; i++) {
      for (let j = i + 1; j < mols.length; j++) {
        const a = mols[i], b = mols[j], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 > 0.06 || d2 < 1e-8) continue;
        const d = Math.sqrt(d2), f = (0.245 - d) * 0.9 * dt / d;
        a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
        a.x -= dx * f * 0.5; a.y -= dy * f * 0.5; b.x += dx * f * 0.5; b.y += dy * f * 0.5;
      }
    }
    mols.forEach(function (m) {
      m.vx += (rnd() - 0.5) * 2.2 * sp * dt; m.vy += (rnd() - 0.5) * 2.2 * sp * dt;
      m.vx *= 0.985; m.vy *= 0.985;
      const v = Math.hypot(m.vx, m.vy), vmax = 0.12 * sp + 0.02;
      if (v > vmax) { m.vx *= vmax / v; m.vy *= vmax / v; }
      m.x += m.vx * dt; m.y += m.vy * dt;
      const r = Math.hypot(m.x, m.y);
      if (r > 0.8) { m.x *= 0.8 / r; m.y *= 0.8 / r; const nx = m.x / r, ny = m.y / r, dot = m.vx * nx + m.vy * ny; if (dot > 0) { m.vx -= 2 * dot * nx; m.vy -= 2 * dot * ny; } }
      m.ang += m.va * dt * sp;
    });
  }
  /** 分子的 2D 骨架（省略碳上的氫）：[el, x, y, 標記]，鍵 [i, j, 鍵級] */
  function molShape(type) {
    const at = [], bd = [];
    const add = function (e, x, y, lab) { at.push([e, x, y, !!lab]); return at.length - 1; };
    const chainL = function (from, key, dir) {   // 醇的烷基鏈，往 dir 方向（−1 左、+1 右）
      const x0 = at[from][1], y0 = at[from][2];
      const c1 = add('C', x0 + dir * 9, y0 + 1); bd.push([from, c1, 1]);
      if (key === 'methanol') return;
      const c2 = add('C', x0 + dir * 18, y0 - 5); bd.push([c1, c2, 1]);
      if (key === 'ethanol') return;
      const c3 = add('C', x0 + dir * 27, y0 + 1); bd.push([c2, c3, 1]);
      const c4 = add('C', x0 + dir * 36, y0 - 5); bd.push([c3, c4, 1]);
      const c5 = add('C', x0 + dir * 27, y0 + 11); bd.push([c3, c5, 1]);
    };
    const acidR = function (cc, key) {
      if (key === 'formic') { const h = add('H', -7.5, 0); bd.push([cc, h, 1]); return; }
      const c1 = add('C', -9.5, 0); bd.push([cc, c1, 1]);
      if (key === 'acetic') return;
      const c2 = add('C', -18.5, -5.5); bd.push([c1, c2, 1]);
      const c3 = add('C', -27.5, 0); bd.push([c2, c3, 1]);
    };
    const lab = el.label.checked || (run && run.label);
    if (type === 'W') { const o = add('O', 0, 0); bd.push([o, add('H', -6, 4.6), 1], [o, add('H', 6, 4.6), 1]); }
    else if (type === 'A') {
      const cc = add('C', 0, 0), oc = add('O', 6, -7.5), oh = add('O', 7.5, 6), h = add('H', 13.5, 3.5);
      bd.push([cc, oc, 2], [cc, oh, 1], [oh, h, 1]);
      acidR(cc, state.acid);
    } else if (type === 'B') {
      const o = add('O', 0, 0, lab), h = add('H', 5.5, -4.5);
      bd.push([o, h, 1]);
      chainL(o, state.alc, -1);
    } else {
      const cc = add('C', 0, 0), oc = add('O', 6, -7.5), ob = add('O', 7.5, 6, lab);
      bd.push([cc, oc, 2], [cc, ob, 1]);
      acidR(cc, state.acid);
      chainL(ob, state.alc, 1);
    }
    return { at: at, bd: bd };
  }
  function molSprite(type, s) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const lab = el.label.checked || (run && run.label);
    const key = type + '|' + state.acid + '|' + state.alc + '|' + (lab ? 1 : 0) + '|' + s.toFixed(2) + '|' + dpr;
    if (molSprites[key]) return molSprites[key];
    const sh = molShape(type);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    sh.at.forEach(function (a) { x0 = Math.min(x0, a[1]); x1 = Math.max(x1, a[1]); y0 = Math.min(y0, a[2]); y1 = Math.max(y1, a[2]); });
    const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2;
    const pad = 9, W = (x1 - x0) * s + pad * 2 * s + 4, H = (y1 - y0) * s + pad * 2 * s + 4;
    const c = document.createElement('canvas');
    c.width = Math.ceil(W * dpr); c.height = Math.ceil(H * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const P = function (a) { return [W / 2 + (a[1] - cxm) * s, H / 2 + (a[2] - cym) * s]; };
    g.lineCap = 'round';
    sh.bd.forEach(function (b) {
      const p = P(sh.at[b[0]]), q = P(sh.at[b[1]]);
      const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      const offs = b[2] === 2 ? [-1.4 * s, 1.4 * s] : [0];
      offs.forEach(function (o) {
        g.strokeStyle = LD.shade(col.elC, col.dark ? -0.2 : 0.15);
        g.lineWidth = Math.max(1.4, 2.1 * s);
        g.beginPath(); g.moveTo(p[0] + nx * o, p[1] + ny * o); g.lineTo(q[0] + nx * o, q[1] + ny * o); g.stroke();
      });
    });
    const RA = { C: 4.6, O: 4.3, H: 2.9 };
    sh.at.slice().sort(function (a, b) { return (a[0] === 'H') - (b[0] === 'H'); }).forEach(function (a) {
      const p = P(a);
      const colr = a[0] === 'C' ? col.elC : a[0] === 'H' ? col.elH : a[3] ? col.el18 : col.elO;
      LD.ball(g, p[0], p[1], RA[a[0]] * s, colr, { shadow: false, glow: 0, ring: a[3] ? LD.shade(col.el18, -0.35) : undefined });
    });
    const sp = { c: c, w: W, h: H };
    molSprites[key] = sp;
    return sp;
  }

  // ======================= 版面 =======================
  let cw = 0, ch = 0, dpr = 1, G = null;
  function fsz(px) { return px * (window.LabSettings && window.LabSettings.get('fs') || 1); }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = w;
    ch = w < 600 ? narrowH(w) : Math.round(Math.max(400, Math.min(540, w * 0.62)));
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    const n0 = G ? nMol() : 0;
    layout();
    molSprites = {};
    if (run && nMol() !== n0) syncMols(true);
    drawStage();
  }
  /** 窄螢幕：裝置在上、分子圓在下，高度照實際需要算（方程式、圓、圖例、Q／K 條都要放得下） */
  function narrowH(w) {
    const pad = 10, appH = Math.round(w * 0.8), r = Math.round(w * 0.3);
    return Math.round(pad + appH + fsz(13) * 2.2 + 2 * r + fsz(12) * 1.5 + 6 + fsz(12) * 1.2 + 8 + 8 + fsz(11) * 2.3 + 8 + 14 + pad);
  }
  function layout() {
    const narrow = cw < 600;
    const pad = narrow ? 10 : 16;
    let app, circ;
    if (narrow) {
      app = { x: pad, y: pad, w: cw - pad * 2, h: Math.round(cw * 0.8) };
      const r = Math.round(cw * 0.3);
      circ = { x: cw / 2, y: app.y + app.h + fsz(13) * 2.2 + r, r: r };
    } else {
      app = { x: pad, y: pad, w: cw * 0.55, h: ch - pad * 2 };
      const r = Math.min(cw * 0.19, ch * 0.33);
      circ = { x: cw * 0.78, y: pad + fsz(13) * 2.6 + r, r: r };
    }
    G = { narrow: narrow, pad: pad, app: app, circ: circ };
  }
  /** 球形燒瓶中，液體占 f（0–1）時的液面高度（從球底算起，以半徑為單位） */
  function capHeight(f) {
    f = Math.max(0, Math.min(1, f));
    let a = 0, b = 2;
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (m * m * (3 - m) / 4 < f) a = m; else b = m; }
    return (a + b) / 2;
  }

  // ======================= 畫布：裝置 =======================
  function richW(g, ps, size, weight) {
    const f0 = (weight || '') + ' ' + size + 'px ' + LD.FONT, f1 = (weight || '') + ' ' + (size * 0.72).toFixed(1) + 'px ' + LD.FONT;
    let w = 0;
    ps.forEach(function (p) { g.font = p[1] ? f1 : f0; w += g.measureText(p[0]).width; });
    return w;
  }
  function rich(g, ps, x, y, color, size, align, weight) {
    size = size || fsz(12);
    const f0 = (weight || '') + ' ' + size + 'px ' + LD.FONT, f1 = (weight || '') + ' ' + (size * 0.72).toFixed(1) + 'px ' + LD.FONT;
    const w = richW(g, ps, size, weight);
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    ps.forEach(function (p) {
      const f = p[1] ? f1 : f0, dy = p[1] < 0 ? size * 0.28 : p[1] > 0 ? -size * 0.38 : 0;
      LD.haloText(g, p[0], cx, y + dy, color, 'left', 'alphabetic', f);
      g.font = f; cx += g.measureText(p[0]).width;
    });
    return w;
  }
  function drawStage() {
    if (!G || !run) return;
    const g = ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(g, cw, ch);
    if (worked) drawFunnel(g); else drawApparatus(g);
    drawCircle(g);
  }
  function drawApparatus(g) {
    const A = G.app, cx = A.x + A.w * 0.52;
    const plateH = Math.max(26, A.h * 0.07), plateW = Math.min(A.w * 0.78, 300);
    const yb = A.y + A.h - 4;
    const plateY = yb - plateH;
    const bathW = Math.min(A.w * 0.66, 250), bathH = Math.min(A.h * 0.3, 170);
    const bathTop = plateY - bathH;
    const rBase = Math.min(A.w * 0.16, A.h * 0.105, 70);
    const rf = Math.min(rBase * Math.cbrt(run.flask / 250), bathW * 0.42, A.h * 0.16);
    const fy = bathTop + bathH * 0.5;
    const neckW = Math.max(10, rf * 0.34), neckTop = fy - rf - Math.max(14, A.h * 0.035);
    const condTop = A.y + fsz(12) * 1.6 + 6, condW = Math.max(18, neckW * 1.9);
    const heat = Math.max(0, Math.min(1, (run.T - 20) / 60));
    // 鐵架
    const rodX = cx - bathW / 2 - 18;
    LD.block(g, rodX - 26, yb - 8, 70, 8, col.plate, { r: 3 });
    LD.tube(g, function (p) { p.moveTo(rodX, yb - 8); p.lineTo(rodX, condTop + 10); }, col.steel, 6);
    [neckTop + 6, condTop + (neckTop - condTop) * 0.5].forEach(function (yy) {
      LD.tube(g, function (p) { p.moveTo(rodX, yy); p.lineTo(cx - condW * 0.55, yy); }, col.steel, 4);
      LD.block(g, cx - condW * 0.75, yy - 5, 9, 10, col.plate, { r: 2, shadow: false });
    });
    // 加熱板
    LD.contactShadow(g, cx, yb, plateW * 0.5, 0);
    LD.block(g, cx - plateW / 2, plateY, plateW, plateH, col.plate, { r: 6 });
    if (state.running && heat > 0) {
      g.save(); g.globalAlpha = 0.25 + 0.5 * heat;
      const hg = g.createLinearGradient(0, plateY - 4, 0, plateY + 4);
      hg.addColorStop(0, LD.alpha(col.hot, 0)); hg.addColorStop(0.5, LD.alpha(col.hot, 0.9)); hg.addColorStop(1, LD.alpha(col.hot, 0));
      g.fillStyle = hg; g.fillRect(cx - bathW * 0.45, plateY - 4, bathW * 0.9, 8); g.restore();
    }
    // 加熱板的顯示器
    const lw = Math.min(64, plateW * 0.28), lh = plateH * 0.56;
    LD.roundRect(g, cx + plateW / 2 - lw - 10, plateY + (plateH - lh) / 2, lw, lh, 4);
    g.fillStyle = '#17201f'; g.fill();
    g.font = '600 ' + Math.min(fsz(12), lh * 0.72) + 'px ' + LD.FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = state.running ? '#ffb38a' : '#8ef0c4';
    g.fillText(num(run.T, 0) + ' °C', cx + plateW / 2 - lw / 2 - 10, plateY + plateH / 2 + 0.5);
    // 水浴燒杯（後壁）
    const bx0 = cx - bathW / 2, bx1 = cx + bathW / 2;
    g.save();
    LD.roundRect(g, bx0, bathTop, bathW, bathH, 8);
    g.fillStyle = LD.alpha(col.glass, col.dark ? 0.1 : 0.07); g.fill();
    g.restore();
    // 燒瓶與液體
    drawFlask(g, cx, fy, rf, neckW, neckTop, heat);
    // 水浴的水（蓋在燒瓶下半）
    const wl = bathTop + bathH * 0.22;
    g.save();
    g.beginPath();
    const amp = state.running && !reducedMotion ? 1.2 + 1.5 * heat : 0.6;
    g.moveTo(bx0 + 3, wl);
    for (let x = bx0 + 3; x <= bx1 - 3; x += 6) g.lineTo(x, wl + Math.sin(x * 0.09 + phase * 2.5) * amp);
    g.lineTo(bx1 - 3, bathTop + bathH - 3); g.lineTo(bx0 + 3, bathTop + bathH - 3); g.closePath();
    const wg = g.createLinearGradient(0, wl, 0, bathTop + bathH);
    wg.addColorStop(0, LD.alpha(col.bath, col.dark ? 0.55 : 0.42)); wg.addColorStop(1, LD.alpha(LD.shade(col.bath, -0.25), col.dark ? 0.7 : 0.55));
    g.fillStyle = wg; g.fill();
    g.strokeStyle = LD.alpha(LD.shade(col.bath, 0.5), 0.8); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(bx0 + 3, wl);
    for (let x = bx0 + 3; x <= bx1 - 3; x += 6) g.lineTo(x, wl + Math.sin(x * 0.09 + phase * 2.5) * amp);
    g.stroke();
    g.restore();
    // 水浴燒杯（前壁、高光）
    g.save();
    LD.roundRect(g, bx0, bathTop, bathW, bathH, 8);
    g.strokeStyle = LD.alpha(col.glass, 0.9); g.lineWidth = 2; g.stroke();
    g.fillStyle = LD.alpha('#ffffff', col.dark ? 0.08 : 0.35);
    g.fillRect(bx0 + 7, bathTop + 10, 4, bathH - 22);
    g.fillStyle = LD.alpha('#ffffff', col.dark ? 0.05 : 0.2);
    g.fillRect(bx1 - 12, bathTop + 14, 2.5, bathH - 30);
    g.restore();
    // 水浴的蒸氣
    if (state.running && heat > 0.55 && !reducedMotion) {
      g.save();
      for (let i = 0; i < 4; i++) {
        const u = (phase * 0.35 + i / 4) % 1, x = bx0 + bathW * (0.15 + 0.22 * i) + Math.sin(phase + i) * 4;
        g.globalAlpha = (1 - u) * 0.22 * (heat - 0.5) * 2;
        g.strokeStyle = col.muted; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x, wl - 4 - u * 26); g.quadraticCurveTo(x + 5, wl - 10 - u * 26, x, wl - 18 - u * 26); g.stroke();
      }
      g.restore();
    }
    // 溫度計（插在水浴裡）
    const tx = bx0 + bathW * 0.12, tTop = bathTop - 46, tBot = bathTop + bathH * 0.78;
    LD.roundRect(g, tx - 3.5, tTop, 7, tBot - tTop, 3.5);
    g.fillStyle = LD.alpha(col.surface, 0.85); g.fill(); g.strokeStyle = LD.alpha(col.glass, 0.9); g.lineWidth = 1; g.stroke();
    const tf = (run.T - 0) / 100, ty = tBot - (tBot - tTop - 8) * tf;
    g.fillStyle = col.hot; g.fillRect(tx - 1.2, ty, 2.4, tBot - ty);
    LD.ball(g, tx, tBot, 5, col.hot, { shadow: false, glow: 0 });
    LD.pill(g, T('水浴 ', 'Bath ') + num(run.T, 0) + ' °C', tx - 6, tTop - 3, col.hot, 'left', '600 ' + fsz(12) + 'px ' + LD.FONT);
    // 冷凝管
    drawCondenser(g, cx, condTop, neckTop, condW, neckW, heat);
    // 標籤
    const f12 = '600 ' + fsz(12) + 'px ' + LD.FONT;
    LD.pill(g, T('迴流冷凝管', 'Reflux condenser'), cx + condW / 2 + 8, condTop + (neckTop - condTop) * 0.42, col.muted, 'left', f12);
    const fl = T('圓底燒瓶 ', 'Flask ') + run.flask + ' mL';
    LD.pill(g, fl, cx + rf + 10, fy - rf * 0.15, col.muted, 'left', f12);
    if (run.cat > 0) LD.pill(g, T('濃硫酸 ', 'Sulfuric acid ') + num(run.cat, 1) + ' mL', cx + rf + 10, fy - rf * 0.15 + fsz(12) * 1.5 + 4, col.muted, 'left', f12);
    if (run.sieves) LD.pill(g, T('分子篩 ', 'Sieves ') + run.sieves * 20 + ' g', cx + rf + 10, fy - rf * 0.15 + fsz(12) * 3 + 8, col.muted, 'left', f12);
  }
  function drawFlask(g, cx, fy, rf, neckW, neckTop, heat) {
    const Vt = C.volume(run), f = Math.min(1, Vt / run.flask);
    const h = capHeight(f) * rf, ly = fy + rf - h;
    const nE = run.A + run.B + run.E + run.W, xE = nE > 0 ? run.E / nE : 0;
    const liq = LD.mix(col.liq, col.ester, Math.min(1, xE * 1.3));
    // 頸
    g.save();
    g.beginPath(); g.rect(cx - neckW / 2, neckTop, neckW, fy - rf * 0.8 - neckTop);
    g.fillStyle = LD.alpha(col.glass, col.dark ? 0.12 : 0.08); g.fill();
    g.strokeStyle = LD.alpha(col.glass, 0.95); g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(cx - neckW / 2, neckTop); g.lineTo(cx - neckW / 2, fy - rf * 0.93); g.moveTo(cx + neckW / 2, neckTop); g.lineTo(cx + neckW / 2, fy - rf * 0.93); g.stroke();
    g.restore();
    // 球
    g.save();
    g.beginPath(); g.arc(cx, fy, rf, 0, Math.PI * 2);
    const bg = g.createRadialGradient(cx - rf * 0.35, fy - rf * 0.4, rf * 0.1, cx, fy, rf);
    bg.addColorStop(0, LD.alpha('#ffffff', col.dark ? 0.1 : 0.32)); bg.addColorStop(1, LD.alpha(col.glass, col.dark ? 0.16 : 0.12));
    g.fillStyle = bg; g.fill();
    g.clip();
    if (f > 0) {
      g.beginPath(); g.rect(cx - rf, ly, rf * 2, rf * 2 + 2);
      const lg = g.createLinearGradient(0, ly, 0, fy + rf);
      lg.addColorStop(0, LD.alpha(LD.shade(liq, 0.25), 0.85)); lg.addColorStop(1, LD.alpha(LD.shade(liq, -0.12), 0.95));
      g.fillStyle = lg; g.fill();
      // 彎月面
      const hw = Math.sqrt(Math.max(0, rf * rf - (ly - fy) * (ly - fy)));
      g.strokeStyle = LD.alpha(LD.shade(liq, -0.35), 0.8); g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(cx - hw, ly - 2.5); g.quadraticCurveTo(cx - hw + 5, ly, cx, ly); g.quadraticCurveTo(cx + hw - 5, ly, cx + hw, ly - 2.5); g.stroke();
      // 沸石與分子篩
      for (let i = 0; i < 3; i++) LD.ball(g, cx - rf * 0.25 + i * rf * 0.2, fy + rf * 0.86, Math.max(2.2, rf * 0.045), col.steel, { shadow: false, glow: 0 });
      const ns = run.sieves * 5;
      const sat = run.cap > 0 ? run.bound / run.cap : 0;
      for (let i = 0; i < ns; i++) {
        const a = Math.PI * (0.32 + 0.36 * ((i * 0.618) % 1)), rr = rf * (0.78 + 0.1 * ((i * 0.37) % 1));
        LD.ball(g, cx + Math.cos(a) * rr * 0.95, fy + Math.sin(a) * rr, Math.max(2.4, rf * 0.05), LD.mix('#e6dcc4', col.bath, sat), { shadow: false, glow: 0 });
      }
      // 沸騰的小氣泡（裝飾）
      if (state.running && heat > 0.6 && !reducedMotion) {
        const nb = Math.round(8 * (heat - 0.6) / 0.4 + 2);
        for (let i = 0; i < nb; i++) {
          const u = (phase * (0.6 + 0.07 * i) + i * 0.37) % 1;
          const x = cx + (((i * 0.731) % 1) - 0.5) * rf * 0.9, y = fy + rf * 0.85 - u * (fy + rf * 0.85 - ly);
          g.strokeStyle = LD.alpha('#ffffff', 0.7 * (1 - u * 0.5)); g.lineWidth = 1;
          g.beginPath(); g.arc(x, y, 1.6 + u * 1.6, 0, Math.PI * 2); g.stroke();
        }
      }
    }
    g.restore();
    g.save();
    g.beginPath(); g.arc(cx, fy, rf, 0, Math.PI * 2);
    g.strokeStyle = LD.alpha(col.glass, 0.95); g.lineWidth = 1.8; g.stroke();
    g.strokeStyle = LD.alpha('#ffffff', col.dark ? 0.25 : 0.7); g.lineWidth = 2.4;
    g.beginPath(); g.arc(cx, fy, rf * 0.8, Math.PI * 1.1, Math.PI * 1.38); g.stroke();
    g.restore();
    // 水滴從冷凝管流回（裝飾）
    if (state.running && heat > 0.55 && !reducedMotion) {
      const u = (phase * 0.8) % 1, y = neckTop + u * (ly - neckTop);
      if (y < ly) LD.ball(g, cx + 1, y, 1.8, LD.mix(col.liq, col.ester, 0.4), { shadow: false, glow: 0 });
    }
    // 起始時的提示：液體體積
    LD.haloText(g, num(Vt, Vt < 10 ? 1 : 0) + ' mL', cx, fy + rf * 0.55, col.text, 'center', 'middle', '600 ' + fsz(12) + 'px ' + LD.FONT);
  }
  function drawCondenser(g, cx, top, bot, W, neckW, heat) {
    const jx0 = cx - W / 2, jTop = top + 8, jBot = bot - 10;
    // 外套（冷卻水）
    g.save();
    LD.roundRect(g, jx0, jTop, W, jBot - jTop, W / 2);
    const jg = g.createLinearGradient(jx0, 0, jx0 + W, 0);
    jg.addColorStop(0, LD.alpha(col.bath, col.dark ? 0.32 : 0.28)); jg.addColorStop(0.5, LD.alpha(col.bath, col.dark ? 0.16 : 0.12)); jg.addColorStop(1, LD.alpha(col.bath, col.dark ? 0.34 : 0.3));
    g.fillStyle = jg; g.fill();
    g.strokeStyle = LD.alpha(col.glass, 0.95); g.lineWidth = 1.6; g.stroke();
    g.restore();
    // 內管
    g.save();
    g.beginPath(); g.rect(cx - neckW * 0.3, top, neckW * 0.6, bot - top);
    g.fillStyle = LD.alpha(col.surface, col.dark ? 0.12 : 0.4); g.fill();
    g.strokeStyle = LD.alpha(col.glass, 0.8); g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx - neckW * 0.3, top); g.lineTo(cx - neckW * 0.3, bot); g.moveTo(cx + neckW * 0.3, top); g.lineTo(cx + neckW * 0.3, bot); g.stroke();
    g.fillStyle = LD.alpha('#ffffff', col.dark ? 0.1 : 0.4); g.fillRect(jx0 + 3, jTop + W / 2, 2.5, jBot - jTop - W);
    g.restore();
    // 進出水口
    const inY = jBot - W * 0.6, outY = jTop + W * 0.6;
    LD.tube(g, function (p) { p.moveTo(jx0 + W, inY); p.lineTo(jx0 + W + 14, inY); }, col.glass, 5);
    LD.tube(g, function (p) { p.moveTo(jx0, outY); p.lineTo(jx0 - 14, outY); }, col.glass, 5);
    const f11 = fsz(11);
    LD.arrow(g, jx0 + W + 30, inY, jx0 + W + 16, inY, col.B, 2);
    LD.haloText(g, T('冷水進', 'in'), jx0 + W + 33, inY, col.B, 'left', 'middle', '600 ' + f11 + 'px ' + LD.FONT);
    LD.arrow(g, jx0 - 16, outY, jx0 - 30, outY, col.B, 2);
    LD.haloText(g, T('出', 'out'), jx0 - 33, outY, col.B, 'right', 'middle', '600 ' + f11 + 'px ' + LD.FONT);
    // 冷凝的液滴（裝飾）
    if (state.running && heat > 0.55 && !reducedMotion) {
      for (let i = 0; i < 3; i++) {
        const u = (phase * 0.5 + i / 3) % 1;
        LD.ball(g, cx + (i - 1) * neckW * 0.15, top + 20 + u * (bot - top - 24), 1.7, LD.mix(col.liq, col.ester, 0.3), { shadow: false, glow: 0 });
      }
    }
  }
  function drawFunnel(g) {
    const A = G.app, cx = A.x + A.w * (G.narrow ? 0.3 : 0.36);
    const top = A.y + 44, bot = A.y + A.h * 0.6;
    const W = Math.min(A.w * 0.4, 170);
    const wv = worked.esterVol, aq = 60 + C.volume(run) - wv;     // 下層：飽和碳酸鈉約 60 mL＋其餘液體
    const tot = wv + aq;
    const shape = function (p) {   // 梨形分液漏斗
      p.moveTo(cx - 8, top);
      p.bezierCurveTo(cx - W * 0.25, top + 10, cx - W / 2, top + (bot - top) * 0.25, cx - W / 2, top + (bot - top) * 0.5);
      p.bezierCurveTo(cx - W / 2, top + (bot - top) * 0.75, cx - 12, bot - 18, cx - 5, bot);
      p.lineTo(cx + 5, bot);
      p.bezierCurveTo(cx + 12, bot - 18, cx + W / 2, top + (bot - top) * 0.75, cx + W / 2, top + (bot - top) * 0.5);
      p.bezierCurveTo(cx + W / 2, top + (bot - top) * 0.25, cx + W * 0.25, top + 10, cx + 8, top);
      p.closePath();
    };
    // 鐵環
    LD.tube(g, function (p) { p.moveTo(A.x + 6, top + (bot - top) * 0.62); p.lineTo(cx - W * 0.45, top + (bot - top) * 0.62); }, col.steel, 4);
    g.save();
    g.beginPath(); shape(g); g.clip();
    // 液體：下層水溶液、上層酯（體積換成高度：粗略的形狀比例）
    const liqTop = top + (bot - top) * 0.22, H = bot - liqTop;
    const yInt = bot - H * Math.min(0.95, aq / tot);
    const ag = g.createLinearGradient(0, yInt, 0, bot);
    ag.addColorStop(0, LD.alpha(col.bath, 0.55)); ag.addColorStop(1, LD.alpha(LD.shade(col.bath, -0.2), 0.7));
    g.fillStyle = ag; g.fillRect(cx - W, yInt, W * 2, bot - yInt + 2);
    const eg = g.createLinearGradient(0, liqTop, 0, yInt);
    eg.addColorStop(0, LD.alpha(LD.shade(col.ester, 0.25), 0.75)); eg.addColorStop(1, LD.alpha(col.ester, 0.85));
    g.fillStyle = eg; g.fillRect(cx - W, liqTop, W * 2, yInt - liqTop);
    g.strokeStyle = LD.alpha(LD.shade(col.ester, -0.4), 0.8); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(cx - W, yInt); g.lineTo(cx + W, yInt); g.stroke();
    // 二氧化碳氣泡
    const age = (performance.now() - workT) / 1000;
    if (age < 4 && !reducedMotion && worked.co2 > 0) {
      const nb = Math.round(18 * (1 - age / 4));
      for (let i = 0; i < nb; i++) {
        const u = ((age * (0.5 + 0.05 * i)) + i * 0.29) % 1;
        const x = cx + (((i * 0.618) % 1) - 0.5) * W * 0.7, y = bot - 6 - u * (bot - liqTop - 6);
        g.strokeStyle = LD.alpha('#ffffff', 0.8 * (1 - u)); g.lineWidth = 1;
        g.beginPath(); g.arc(x, y, 1.5 + 2 * u, 0, Math.PI * 2); g.stroke();
      }
    }
    g.restore();
    g.save();
    g.beginPath(); shape(g);
    g.strokeStyle = LD.alpha(col.glass, 0.95); g.lineWidth = 1.8; g.stroke();
    g.strokeStyle = LD.alpha('#ffffff', col.dark ? 0.25 : 0.65); g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(cx - W * 0.38, top + (bot - top) * 0.33); g.quadraticCurveTo(cx - W * 0.44, top + (bot - top) * 0.5, cx - W * 0.36, top + (bot - top) * 0.66); g.stroke();
    g.restore();
    // 活栓與出口管
    LD.tube(g, function (p) { p.moveTo(cx, bot); p.lineTo(cx, bot + 34); }, col.glass, 5);
    LD.block(g, cx - 13, bot + 10, 26, 8, col.plate, { r: 3, shadow: false });
    // 瓶塞
    LD.block(g, cx - 10, top - 10, 20, 12, col.plate, { r: 3 });
    // 氣味
    if (!reducedMotion) {
      g.save();
      for (let i = 0; i < 3; i++) {
        const u = (phase * 0.3 + i / 3) % 1, x = cx + (i - 1) * 16 + Math.sin(phase * 1.3 + i) * 5;
        g.globalAlpha = 0.45 * (1 - u); g.strokeStyle = col.E; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x, top - 16 - u * 20); g.bezierCurveTo(x + 7, top - 22 - u * 20, x - 7, top - 30 - u * 20, x, top - 36 - u * 20); g.stroke();
      }
      g.restore();
    }
    // 標籤：漏斗右邊放兩層的名稱（太寬就縮小字），下方放 CO2、氣味、標記
    const lx = cx + W / 2 + 10, lw = A.x + A.w - lx - 6;
    const fit = function (text, x, yb, color, maxW, align) {
      let f = fsz(12);
      g.font = '600 ' + f + 'px ' + LD.FONT;
      while (f > 9 && g.measureText(text).width + 14 > maxW) { f -= 0.5; g.font = '600 ' + f + 'px ' + LD.FONT; }
      LD.pill(g, text, x, yb, color, align || 'left', '600 ' + f + 'px ' + LD.FONT);
      return f;
    };
    const ym = (liqTop + yInt) / 2;
    fit(T('上層：', 'Top: ') + worked.name, lx, ym - 2, col.E, lw);
    fit(num(worked.esterVol, 1) + ' mL', lx, ym + fsz(12) * 1.5 + 2, col.E, lw);
    fit(T('下層：水溶液', 'Bottom: aqueous'), lx, Math.max((yInt + bot) / 2 + 6, ym + fsz(12) * 3.2 + 6), col.B, lw);
    const mx = G.narrow ? A.x + A.w / 2 : cx, fw = G.narrow ? A.w - 8 : Math.min(A.w - 8, 2 * (cx - A.x) - 8);
    rich(g, [[T('放出 ', '')], ['CO'], ['2', -1], [T(' ', ' given off: ') + num(worked.co2, 3) + ' mol']], mx, bot + 54, col.muted, fsz(12), 'center');
    fit(T('氣味：', 'Smell: ') + T(worked.smell[0], worked.smell[1]), mx, bot + 54 + fsz(12) * 1.9, col.E, fw, 'center');
    if (worked.label) fit(T('酯的莫耳質量 ', 'Ester molar mass ') + num(C.esterM(run), 2) + T(' g/mol（含氧-18）', ' g/mol (with O-18)'), mx, bot + 54 + fsz(12) * 3.8, col.el18, fw, 'center');
  }

  // ======================= 畫布：分子圓 =======================
  function drawCircle(g) {
    const c = G.circ, R = c.r;
    const f12 = '600 ' + fsz(12) + 'px ' + LD.FONT;
    // 方程式（名稱）
    const eqTxt = worked ? T('上層的酯', 'The ester layer') : acidName() + ' + ' + alcName() + ' ⇌ ' + esterName() + ' + ' + T('水', 'water');
    g.font = '600 ' + fsz(12.5) + 'px ' + LD.FONT;
    let fs = fsz(12.5);
    const maxW = G.narrow ? cw - 2 * G.pad : cw - G.app.w - G.pad * 3;
    while (fs > 9 && (g.font = '600 ' + fs + 'px ' + LD.FONT, g.measureText(eqTxt).width > maxW)) fs -= 0.5;
    LD.haloText(g, eqTxt, c.x, c.y - R - fsz(12) * 1.1 - 6, col.text, 'center', 'alphabetic', '600 ' + fs + 'px ' + LD.FONT);
    // 圓
    g.save();
    g.beginPath(); g.arc(c.x, c.y, R, 0, Math.PI * 2);
    const bg = g.createRadialGradient(c.x - R * 0.3, c.y - R * 0.35, R * 0.1, c.x, c.y, R);
    bg.addColorStop(0, LD.alpha(col.surface, col.dark ? 0.5 : 0.95)); bg.addColorStop(1, LD.alpha(LD.mix(col.surface, col.bath, 0.35), col.dark ? 0.6 : 0.9));
    g.fillStyle = bg; g.fill();
    g.clip();
    const s = R / 118;
    mols.forEach(function (m) {
      const sp = molSprite(m.type, s);
      // 物種的淡色光暈（顏色和下方圖例、圖表一致）
      g.fillStyle = LD.alpha(col[m.type], col.dark ? 0.24 : 0.16);
      g.beginPath(); g.arc(c.x + m.x * R, c.y + m.y * R, Math.max(sp.w, sp.h) * 0.36, 0, Math.PI * 2); g.fill();
      g.save();
      g.translate(c.x + m.x * R, c.y + m.y * R);
      g.rotate(m.ang);
      g.drawImage(sp.c, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
      g.restore();
    });
    fx.forEach(function (f) {
      if (f.kind === 'react') LD.ripple(g, c.x + f.x * R, c.y + f.y * R, 6 * s, f.u, f.fwd ? col.E : col.A);
    });
    g.restore();
    // 放大鏡的框
    g.save();
    g.beginPath(); g.arc(c.x, c.y, R, 0, Math.PI * 2);
    g.lineWidth = 7; g.strokeStyle = LD.shade(col.plate, col.dark ? 0.1 : 0.2); g.stroke();
    g.lineWidth = 2; g.strokeStyle = LD.alpha('#ffffff', col.dark ? 0.2 : 0.55);
    g.beginPath(); g.arc(c.x, c.y, R - 1, Math.PI * 1.05, Math.PI * 1.45); g.stroke();
    g.restore();
    // 圖例與計數
    const tg = targetCounts();
    const ly = c.y + R + fsz(12) * 1.5 + 6;
    const items = SP.filter(function (k) { return !worked || k === 'E'; }).map(function (k) { return [k, spShort(k) + ' ' + tg[k]]; });
    g.font = f12;
    const iw = items.map(function (it) { return g.measureText(it[1]).width + 20; });
    const totW = iw.reduce(function (a, b) { return a + b; }, 0) + (items.length - 1) * 8;
    let x = c.x - totW / 2;
    items.forEach(function (it, i) {
      LD.ball(g, x + 6, ly - fsz(12) * 0.35, 5, col[it[0]], { shadow: false, glow: 0 });
      LD.haloText(g, it[1], x + 14, ly, col.text, 'left', 'alphabetic', f12);
      x += iw[i] + 8;
    });
    if (!worked) drawQK(g, c.x, ly + fsz(12) * 1.2 + 8, Math.min(R * 2, maxW));
    if ((el.label.checked || run.label) && !worked) {
      LD.ball(g, c.x - R * 0.72, c.y - R * 0.78, 4.5, col.el18, { shadow: false, glow: 0 });
      LD.haloText(g, T('= 氧-18', '= oxygen-18'), c.x - R * 0.72 + 8, c.y - R * 0.78, col.el18, 'left', 'middle', f12);
    }
  }
  /** Q 與 K 的對數刻度條 */
  function drawQK(g, cx, y, W) {
    const q = C.Q(run), k = C.K(run.T);
    const x0 = cx - W / 2, x1 = cx + W / 2, h = 8;
    LD.roundRect(g, x0, y, W, h, 4);
    const gr = g.createLinearGradient(x0, 0, x1, 0);
    gr.addColorStop(0, LD.alpha(col.E, 0.35)); gr.addColorStop(0.5, LD.alpha(col.muted, 0.15)); gr.addColorStop(1, LD.alpha(col.A, 0.35));
    g.fillStyle = gr; g.fill();
    g.strokeStyle = LD.alpha(col.muted, 0.6); g.lineWidth = 1; g.stroke();
    // K 在中間，±2 個數量級
    g.strokeStyle = col.text; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx, y - 4); g.lineTo(cx, y + h + 4); g.stroke();
    const f11 = fsz(11);
    let qx = null;
    if (q === 0) qx = x0; else if (!isFinite(q) && !isNaN(q)) qx = x1; else if (isFinite(q)) qx = cx + Math.max(-1, Math.min(1, Math.log10(q / k) / 2)) * W / 2;
    if (qx != null) {
      g.fillStyle = col.accent;
      g.beginPath(); g.moveTo(qx, y - 2); g.lineTo(qx - 6, y - 11); g.lineTo(qx + 6, y - 11); g.closePath(); g.fill();
    }
    const dir = C.direction(run);
    const dtxt = dir === 'fwd' ? T('Q < K → 向右（生成酯）', 'Q < K → forward (ester forms)') : dir === 'rev' ? T('Q > K → 向左（酯水解）', 'Q > K → backward (ester hydrolyses)') :
      dir === 'eq' ? T('Q = K：平衡', 'Q = K: equilibrium') : '';
    LD.haloText(g, 'Q = ' + (isFinite(q) ? sigf(q, 3) : q === 0 ? '0' : '∞') + '    K = ' + num(k, 2), cx, y + h + f11 + 6, col.text, 'center', 'alphabetic', '600 ' + f11 + 'px ' + LD.FONT);
    if (dtxt) LD.haloText(g, dtxt, cx, y + h + f11 * 2.3 + 8, dir === 'rev' ? col.A : col.E, 'center', 'alphabetic', '600 ' + f11 + 'px ' + LD.FONT);
  }

  // ======================= 圖表 =======================
  let gw = 0, gh = 0;
  function resizeGraph() {
    const w = gcv.clientWidth;
    if (!w) return;
    gw = w; gh = w < 560 ? 280 : 320;
    gcv.style.height = gh + 'px';
    gcv.width = Math.round(gw * dpr); gcv.height = Math.round(gh * dpr);
  }
  function niceStep(span, n) {
    const raw = span / (n || 5), p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function timeUnit(tmax) {
    if (tmax <= 300) return [1, T('秒', 's')];
    if (tmax <= 3 * 3600) return [60, T('分鐘', 'min')];
    if (tmax <= 3 * 86400) return [3600, T('小時', 'h')];
    return [86400, T('天', 'days')];
  }
  function axes(g, B, x0, x1, y0, y1, xl, yl, opt) {
    opt = opt || {};
    const f11 = fsz(11) + 'px ' + LD.FONT;
    const X = function (v) { return B.l + (v - x0) / (x1 - x0) * (B.r - B.l); };
    const Y = function (v) { return B.b - (v - y0) / (y1 - y0) * (B.b - B.t); };
    g.save();
    g.fillStyle = LD.alpha(col.surface, col.dark ? 0.25 : 0.5);
    g.fillRect(B.l, B.t, B.r - B.l, B.b - B.t);
    const xs = niceStep(x1 - x0, B.r - B.l < 320 ? 4 : 6), ys = opt.ystep || niceStep(y1 - y0, 5);
    g.strokeStyle = LD.alpha(col.text, col.dark ? 0.1 : 0.08); g.lineWidth = 1;
    g.beginPath();
    for (let v = Math.ceil(x0 / xs) * xs; v <= x1 + 1e-9; v += xs) { const x = Math.round(X(v)) + 0.5; g.moveTo(x, B.t); g.lineTo(x, B.b); }
    for (let v = Math.ceil(y0 / ys) * ys; v <= y1 + 1e-9; v += ys) { const y = Math.round(Y(v)) + 0.5; g.moveTo(B.l, y); g.lineTo(B.r, y); }
    g.stroke();
    g.strokeStyle = LD.alpha(col.text, 0.5);
    g.beginPath(); g.moveTo(B.l + 0.5, B.t); g.lineTo(B.l + 0.5, B.b + 0.5); g.lineTo(B.r, B.b + 0.5); g.stroke();
    g.font = f11; g.fillStyle = col.muted;
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (let v = Math.ceil(x0 / xs) * xs; v <= x1 + 1e-9; v += xs) g.fillText(opt.xfmt ? opt.xfmt(v) : sigf(v, 3).replace(/\.0+$/, ''), X(v), B.b + 4);
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = Math.ceil(y0 / ys) * ys; v <= y1 + 1e-9; v += ys) g.fillText(opt.yfmt ? opt.yfmt(v) : num(v, ys < 0.1 ? 2 : ys < 1 ? 1 : 0), B.l - 5, Y(v));
    g.textAlign = 'right'; g.textBaseline = 'bottom';
    g.fillText(xl, B.r, B.b + fsz(11) * 2.6);
    g.textAlign = 'left'; g.textBaseline = 'bottom';
    g.fillText(yl, B.l - 30, B.t - 6);
    g.restore();
    return { X: X, Y: Y };
  }
  function graphBox() {
    return { l: 46, r: gw - 14, t: 26, b: gh - fsz(11) * 3 - 6 };
  }
  function line(g, pts, X, Y, color, w, dash, alphaV) {
    if (pts.length < 2) return;
    g.save();
    g.strokeStyle = alphaV == null ? color : LD.alpha(color, alphaV);
    g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round';
    if (dash) g.setLineDash(dash);
    g.beginPath();
    pts.forEach(function (p, i) { const x = X(p[0]), y = Y(p[1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
    g.restore();
  }
  function drawGraph() {
    if (!gw || !run) return;
    const g = gctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(g, gw, gh);
    const B = graphBox();
    if (state.tab === 'n') graphN(g, B); else if (state.tab === 'q') graphQ(g, B); else graphR(g, B);
  }
  const DASH = { A: null, B: [7, 5], E: null, W: [2, 5] };
  function graphN(g, B) {
    let tmax = Math.max(60, run.t);
    ghosts.forEach(function (gh2) { tmax = Math.max(tmax, gh2.pts[gh2.pts.length - 1][0]); });
    tmax = Math.min(tmax, Math.max(60, run.t) * 4);
    const u = timeUnit(tmax);
    let ymax = 0.1;
    samples.forEach(function (s) { ymax = Math.max(ymax, s.A, s.B, s.E, s.W); });
    ghosts.forEach(function (gh2) { gh2.pts.forEach(function (p) { ymax = Math.max(ymax, p[1]); }); });
    ymax = Math.ceil(ymax * 1.1 / niceStep(ymax, 5)) * niceStep(ymax, 5);
    const ax = axes(g, B, 0, tmax / u[0], 0, ymax, T('時間（', 'time (') + u[1] + T('）', ')'), T('莫耳數（mol）', 'amount (mol)'));
    const X = function (t) { return ax.X(t / u[0]); };
    ghosts.forEach(function (gh2, i) {
      line(g, gh2.pts.filter(function (p) { return p[0] <= tmax; }).map(function (p) { return [p[0], p[1]]; }), X, ax.Y, col.E, 1.6, [4, 4], 0.25 + 0.08 * i);
    });
    // 平衡時的酯（預測，不計分子篩）
    if (!worked) {
      const eq = C.equilibrium(run, run.T);
      if (eq.E > 0) {
        g.save(); g.setLineDash([3, 6]); g.strokeStyle = LD.alpha(col.E, 0.7); g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(B.l, ax.Y(eq.E)); g.lineTo(B.r, ax.Y(eq.E)); g.stroke(); g.restore();
        LD.haloText(g, T('平衡時的酯', 'ester at equilibrium'), B.r - 4, ax.Y(eq.E) - 5, col.E, 'right', 'alphabetic', fsz(11) + 'px ' + LD.FONT);
      }
    }
    SP.forEach(function (k) {
      const pts = samples.map(function (s) { return [s.t, s[k]]; });
      if (state.running || run.t > 0) pts.push([run.t, run[k]]);
      line(g, pts, X, ax.Y, col[k], k === 'E' ? 3 : 2, DASH[k]);
    });
    SP.forEach(function (k) { LD.ball(g, X(run.t), ax.Y(run[k]), 3.5, col[k], { shadow: false, glow: 0 }); });
  }
  function graphQ(g, B) {
    let tmax = Math.max(60, run.t);
    const u = timeUnit(tmax);
    const pts = samples.filter(function (s) { return s.Q > 0 && isFinite(s.Q); }).map(function (s) { return [s.t, Math.log10(s.Q)]; });
    const kp = samples.map(function (s) { return [s.t, Math.log10(s.K)]; });
    kp.push([run.t, Math.log10(C.K(run.T))]);
    let lo = Math.log10(C.K(run.T)) - 1, hi = Math.log10(C.K(run.T)) + 1;
    pts.forEach(function (p) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); });
    lo = Math.max(-3, Math.floor(lo)); hi = Math.min(3, Math.ceil(hi));
    const ax = axes(g, B, 0, tmax / u[0], lo, hi, T('時間（', 'time (') + u[1] + T('）', ')'), T('Q 與 K（對數刻度）', 'Q and K (log scale)'),
      { ystep: 1, yfmt: function (v) { return v >= 0 ? String(Math.round(Math.pow(10, v))) : Math.pow(10, v).toFixed(-v); } });
    const X = function (t) { return ax.X(t / u[0]); };
    ghosts.forEach(function (gh2, i) {
      line(g, gh2.pts.filter(function (p) { return p[2] > 0 && isFinite(p[2]) && p[0] <= tmax; }).map(function (p) { return [p[0], Math.max(lo, Math.min(hi, Math.log10(p[2])))]; }), X, ax.Y, col.accent, 1.4, [4, 4], 0.25 + 0.08 * i);
    });
    line(g, kp.map(function (p) { return [p[0], p[1]]; }), X, ax.Y, col.text, 1.6, [6, 4]);
    LD.haloText(g, 'K', B.r - 4, ax.Y(kp[kp.length - 1][1]) - 6, col.text, 'right', 'alphabetic', '600 ' + fsz(12) + 'px ' + LD.FONT);
    line(g, pts.map(function (p) { return [p[0], Math.max(lo, Math.min(hi, p[1]))]; }), X, ax.Y, col.accent, 2.6);
    const q = C.Q(run);
    if (q > 0 && isFinite(q)) LD.ball(g, X(run.t), ax.Y(Math.max(lo, Math.min(hi, Math.log10(q)))), 4, col.accent, { shadow: false, glow: 0 });
  }
  function graphR(g, B) {
    const Kv = C.K(run.T), x1 = 8;
    const ax = axes(g, B, 0, x1, 0, 100, T('醇 ÷ 酸（莫耳比）', 'alcohol ÷ acid (mole ratio)'), T('平衡產率（%）', 'equilibrium yield (%)'), { ystep: 20 });
    const pts = [], pts25 = [];
    for (let r = 0.02; r <= x1 + 1e-9; r += 0.04) { pts.push([r, 100 * C.yieldAtRatio(r, Kv)]); pts25.push([r, 100 * C.yieldAtRatio(r, 1e6)]); }
    line(g, pts25, ax.X, ax.Y, col.muted, 1.2, [3, 5]);
    line(g, pts, ax.X, ax.Y, col.E, 2.6);
    const f11 = fsz(11) + 'px ' + LD.FONT;
    LD.haloText(g, 'K = ' + num(Kv, 2) + T('（', ' (') + num(run.T, 0) + T(' °C）', ' °C)'), ax.X(5), ax.Y(100 * C.yieldAtRatio(5, Kv)) + 16, col.E, 'center', 'alphabetic', '600 ' + f11);
    LD.haloText(g, T('K 非常大時', 'if K were huge'), ax.X(3), ax.Y(100) + 14, col.muted, 'center', 'alphabetic', f11);
    // 平衡紀錄（從酸＋醇出發、沒有加料與分子篩）
    eqLog.forEach(function (r) {
      if (!r.fresh || r.n0.E > 0 || r.n0.W > 0 || !(r.n0.A > 0) || !(r.n0.B > 0) || r.yield == null) return;
      const x = r.n0.B / r.n0.A;
      if (x > x1) return;
      LD.ball(g, ax.X(x), ax.Y(100 * r.yield), 4.5, col.accent, { shadow: false, glow: 0 });
    });
    // 目前的配方（預測）
    if (run.n0.E === 0 && run.n0.W === 0 && run.n0.A > 0 && run.n0.B > 0) {
      const x = run.n0.B / run.n0.A;
      if (x <= x1) {
        g.save(); g.strokeStyle = col.text; g.lineWidth = 1.6;
        g.beginPath(); g.arc(ax.X(x), ax.Y(100 * C.yieldAtRatio(x, Kv)), 6.5, 0, Math.PI * 2); g.stroke(); g.restore();
      }
    }
  }
  function updateLegend() {
    const lg = $('gLegend'), hint = $('gHint');
    if (state.tab === 'n') {
      lg.innerHTML = SP.map(function (k) {
        return '<span style="color:' + col[k] + '"><i class="ln' + (k === 'B' ? ' dash' : k === 'W' ? ' dot' : '') + '"></i></span><span>' + spName(k) + '</span>';
      }).join(' ') + (ghosts.length ? ' <span style="color:' + col.E + '"><i class="ln dash" style="opacity:.45"></i></span><span>' + T('之前幾瓶的酯', 'ester in earlier flasks') + '</span>' : '');
      hint.textContent = T('虛線是用目前的組成和溫度算出的「平衡時的酯」。', 'The dotted line is the ester you would have at equilibrium, worked out from the present amounts and temperature.');
    } else if (state.tab === 'q') {
      lg.innerHTML = '<span style="color:' + col.accent + '"><i class="ln"></i></span><span>' + T('反應商 Q', 'reaction quotient Q') + '</span> <span style="color:' + col.text + '"><i class="ln dash"></i></span><span>' + T('平衡常數 K', 'equilibrium constant K') + '</span>';
      hint.textContent = T('Q 往 K 靠近：Q 在 K 下面時反應向右，在上面時向左。改變溫度時 K 也會移動。', 'Q heads towards K: below K the reaction goes forward, above K it goes backward. Changing the temperature moves K.');
    } else {
      lg.innerHTML = '<span style="color:' + col.E + '"><i class="ln"></i></span><span>' + T('這個溫度的理論值', 'theory at this temperature') + '</span> <span style="color:' + col.accent + '"><i class="dotm" style="background:' + col.accent + '"></i></span><span>' + T('你做到的平衡', 'your equilibria') + '</span> <span><i class="dotm" style="border:1.6px solid ' + col.text + '"></i></span><span>' + T('目前的配方', 'present recipe') + '</span>';
      hint.textContent = T('從酸和醇出發（沒有酯、水，也沒有加料、分子篩）的平衡會落在曲線上。產率以量較少的那一個反應物計算。', 'Equilibria started from acid and alcohol only (no ester, water, additions or sieves) fall on the curve. The yield is based on whichever reactant there is less of.');
    }
  }
  function renderTable() {
    const t = $('tbl');
    let h = '<thead><tr><th>#</th><th class="l">' + T('酯', 'Ester') + '</th><th>T<br><small>°C</small></th><th>' + T('催化劑', 'Catalyst') + '<br><small>mL</small></th>' +
      '<th>' + T('起始 酸／醇／酯／水', 'Start: acid / alc. / ester / water') + '<br><small>mol</small></th>' +
      '<th>' + T('平衡 酸／醇／酯／水', 'Equilibrium: acid / alc. / ester / water') + '<br><small>mol</small></th>' +
      '<th>' + T('算出的 K', 'K from data') + '</th><th>' + T('產率', 'Yield') + '</th></tr></thead><tbody>';
    if (!eqLog.length) h += '<tr class="empty"><td colspan="8">' + T('還沒有達到平衡的紀錄。每次達到平衡會自動記一行。', 'No equilibria yet. A row is added every time equilibrium is reached.') + '</td></tr>';
    eqLog.forEach(function (r, i) {
      const s = function (n) { return [n.A, n.B, n.E, n.W].map(function (v) { return num(v, 3); }).join(T('／', ' / ')); };
      const kk = r.n.E * r.n.W / (r.n.A * r.n.B);
      h += '<tr><td>' + (i + 1) + '</td><td class="l">' + esterName(r.acid, r.alc) + (r.sieves ? T('（分子篩）', ' (sieves)') : '') + '</td><td>' + num(r.T, 0) + '</td><td>' + num(r.cat, 1) + '</td><td>' +
        s({ A: r.n0.A + r.add.A, B: r.n0.B + r.add.B, E: r.n0.E + r.add.E, W: r.n0.W + r.add.W }) + '</td><td>' + s(r.n) + '</td><td>' + sigf(kk, 3) + '</td><td>' + (r.yield == null ? '—' : pct(r.yield, 1)) + '</td></tr>';
    });
    t.innerHTML = h + '</tbody>';
  }

  // ======================= 讀數與卡片 =======================
  function updateReadouts() {
    if (!run) return;
    const q = C.Q(run), k = C.K(run.T), y = C.yieldOf(run), hy = C.hydrolysisOf(run);
    const eq = C.equilibrium(run, run.T);
    const inA = C.inTotal(run, 'A'), inB = C.inTotal(run, 'B'), base = Math.min(inA, inB);
    const r = C.rate(run) * 60;
    const sw = function (k2) { return '<span class="sw" style="background:' + col[k2] + '"></span>'; };
    const rows = [
      [T('時間', 'Time'), fmtT(run.t)],
      [T('平衡常數 K', 'Equilibrium constant K') + '<small>' + num(run.T, 0) + ' °C</small>', num(k, 2)],
      [T('反應商 Q', 'Reaction quotient Q'), isFinite(q) ? sigf(q, 3) : q === 0 ? '0' : '∞'],
      [sw('A') + acidName(), num(run.A, 3) + ' mol'],
      [sw('B') + alcName(), num(run.B, 3) + ' mol'],
      [sw('E') + esterName(), num(run.E, 3) + ' mol'],
      [sw('W') + T('水', 'Water') + (run.sieves ? '<small>' + T('分子篩已吸走 ', 'sieves have taken ') + num(run.bound, 3) + ' / ' + num(run.cap, 3) + ' mol</small>' : ''), num(run.W, 3) + ' mol'],
      [T('生成的酯（反應進度）', 'Ester formed (extent)'), (run.xi >= 0 ? '' : '') + num(run.xi, 3) + ' mol'],
      [T('產率', 'Yield') + '<small>' + T('以限量的反應物計', 'based on the limiting reactant') + '</small>', y == null ? (hy == null ? '—' : T('水解 ', 'hydrolysed ') + pct(hy, 1)) : y < 0 ? T('逆向進行', 'going backward') : pct(y, 1), 'big'],
      [T('平衡時的產率（預測）', 'Yield at equilibrium (predicted)') + (run.sieves ? '<small>' + T('不計分子篩', 'ignoring the sieves') + '</small>' : ''), base > 1e-9 ? pct((eq.E - C.inTotal(run, 'E')) / base, 1) : '—'],
      [T('淨反應速率', 'Net rate'), Math.abs(r) < 1e-12 ? '0' : sciHTML(r, 2) + ' mol/min'],
      [T('混合液體積', 'Volume of mixture'), num(C.volume(run), 1) + ' mL'],
      [T('硫酸濃度', 'Sulfuric acid concentration'), num(C.cH(run), 2) + ' M']
    ];
    $('readout').innerHTML = rows.map(function (rw) { return '<dt>' + rw[0] + '</dt><dd' + (rw[2] ? ' class="' + rw[2] + '"' : '') + '>' + rw[1] + '</dd>'; }).join('');
    // 自己算 K
    const kc = $('kCalc');
    if (run.A > 0 && run.B > 0) {
      kc.innerHTML = 'Q = <span style="color:' + col.E + '">' + num(run.E, 3) + '</span> × <span style="color:' + col.W + '">' + num(run.W, 3) + '</span> ÷ (<span style="color:' + col.A + '">' + num(run.A, 3) + '</span> × <span style="color:' + col.B + '">' + num(run.B, 3) + '</span>) = <span class="res">' + (isFinite(q) ? sigf(q, 3) : '—') + '</span><br>' +
        T('平衡常數 K（', 'Equilibrium constant K (') + num(run.T, 0) + ' °C）= <span class="res">' + num(k, 2) + '</span><br>' +
        (C.atEquilibrium(run) ? T('Q = K：已達平衡，這就是 K 的實驗值。', 'Q = K: at equilibrium, so this is an experimental value of K.') :
          C.direction(run) === 'fwd' ? T('Q < K：還沒到平衡，反應向右。', 'Q < K: not at equilibrium yet; the reaction goes forward.') : T('Q > K：反應向左（水解）。', 'Q > K: the reaction goes backward (hydrolysis).'));
    } else kc.textContent = T('酸或醇是 0，Q 沒有意義（分母為 0）。', 'With no acid or no alcohol, Q has no meaning (division by zero).');
    renderStatus();
  }
  function updateEsterCard() {
    const e = esterOf(), a = C.ACIDS[state.acid], b = C.ALCS[state.alc];
    const lab = el.label.checked;
    $('prodLine').innerHTML = T('產物：', 'Product: ') + '<b>' + esterName() + '</b> ' + fH(e.cond) + T('＋水', ' + water');
    $('esterName').innerHTML = '<b>' + esterName() + '</b><br>' + fH(e.cond);
    $('esterSmell').textContent = T('聞起來像：', 'Smells of: ') + T(e.smell[0], e.smell[1]);
    const rows = [
      [T('莫耳質量', 'Molar mass'), num(e.M + (lab ? C.O18 : 0), 2) + ' g/mol' + (lab ? T('（含 O-18）', ' (with O-18)') : '')],
      [T('密度', 'Density'), num(e.rho, 3) + ' g/mL'],
      [T('沸點', 'Boiling point'), num(e.bp, 1) + ' °C'],
      [acidName() + T('的氣味', ' smells of'), T(a.smell[0], a.smell[1])],
      [alcName() + T('的沸點', ' boils at'), num(b.bp, 1) + ' °C']
    ];
    $('esterInfo').innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd style="white-space:normal">' + r[1] + '</dd>'; }).join('');
    $('nALbl').textContent = acidName(); $('nBLbl').textContent = alcName(); $('nELbl').textContent = esterName();
  }
  function updateOutputs() {
    ['nA', 'nB', 'nE', 'nW'].forEach(function (id) { $(id + 'o').textContent = num(val(el[id]), 2) + ' mol'; });
    $('cato').textContent = num(val(el.cat), 1) + ' mL';
    $('tempo').textContent = num(val(el.temp), 0) + ' °C';
  }
  function updateButtons() {
    $('play').textContent = worked ? T('已分液', 'Separated') : state.running ? T('暫停', 'Pause') : run && run.t > 0 ? T('繼續加熱', 'Keep heating') : T('開始加熱', 'Start heating');
    $('play').disabled = !!worked;
    ['addA', 'addB', 'addE', 'addW', 'addS', 'workup'].forEach(function (id) { $(id).disabled = !!worked; });
    for (let i = 0; i < SPEEDS.length; i++) $('sp' + i).setAttribute('aria-pressed', String(i === state.speed));
  }
  function syncSegs() {
    document.querySelectorAll('#acidSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.acid === state.acid)); });
    document.querySelectorAll('#alcSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.alc === state.alc)); });
    document.querySelectorAll('#tabs button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === state.tab)); });
    updateButtons();
  }
  function refreshAll() {
    updateOutputs(); updateEsterCard(); updateReadouts(); updateLegend(); renderTable(); drawStage(); drawGraph();
    if (view3) view3.update(false);
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  function buildDataTable() {
    const t = $('dataTable');
    let h = '<thead><tr><th class="l">' + T('物質', 'Substance') + '</th><th>M<br><small>g/mol</small></th><th>' + T('密度', 'Density') + '<br><small>g/mL</small></th><th>' + T('沸點', 'b.p.') + '<br><small>°C</small></th><th class="l">' + T('氣味', 'Smell') + '</th></tr></thead><tbody>';
    const row = function (name, f, d, smell) { h += '<tr><td class="l">' + name + ' ' + fH(f) + '</td><td>' + num(d.M, 2) + '</td><td>' + num(d.rho, 3) + '</td><td>' + num(d.bp, 1) + '</td><td class="l" style="white-space:normal">' + (smell || '') + '</td></tr>'; };
    Object.keys(C.ACIDS).forEach(function (k) { const a = C.ACIDS[k]; row(T(a.zh, a.en), a.cond, a, T(a.smell[0], a.smell[1])); });
    Object.keys(C.ALCS).forEach(function (k) { const b = C.ALCS[k]; row(T(b.zh, b.en), b.cond, b, ''); });
    Object.keys(C.ACIDS).forEach(function (a) { Object.keys(C.ALCS).forEach(function (b) { const e = C.ester(a, b); row(T(e.zh, e.en), e.cond, e, T(e.smell[0], e.smell[1])); }); });
    row(T('水', 'water'), 'H2O', C.WATER, '');
    t.innerHTML = h + '</tbody>';
  }

  // ======================= 3D =======================
  let view3 = null, threeLib = null, loadToken = 0;
  const host3 = $('view3'), stage = $('stage'), viewMsg = $('viewMsg');
  const mech = { p: 0, playing: false, alt: false, t0: 0, raf: 0 };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (m) {
      threeLib = { THREE: m[0], OrbitControls: m[1].OrbitControls };
      return threeLib;
    });
  }
  function bridge() {
    return {
      T: T, host: host3,
      mech: function () { return C.mechanism(state.acid, state.alc, mech.alt ? 'alkyl' : 'acyl'); },
      key: function () { return state.acid + '|' + state.alc + '|' + (mech.alt ? 'alkyl' : 'acyl'); },
      progress: function () { return mech.p; },
      label: function () { return el.label.checked; },
      dark: function () { return LD.dark; },
      hud: function () {
        const e = esterOf(), lab = el.label.checked, mode = mech.alt ? 'alkyl' : 'acyl';
        const tl = acidName() + ' + ' + alcName() + (mech.p < 0.5 ? '' : ' → ' + esterName() + ' + ' + T('水', 'water'));
        const r = { acid: state.acid, alc: state.alc, label: lab };
        let tr = '';
        if (mech.p >= 0.75) {
          tr = T('酯 ', 'Ester ') + num(C.esterM(r, mode), 2) + ' g/mol<br>' + T('水 ', 'Water ') + num(C.waterM(r, mode), 2) + ' g/mol';
          if (lab) tr += '<br><span class="lab18">' + (mode === 'acyl' ? T('氧-18 在酯裡', 'O-18 is in the ester') : T('氧-18 在水裡', 'O-18 is in the water')) + '</span>';
        } else if (lab) tr = '<span class="lab18">' + T('金色 = 醇的氧-18', 'gold = the alcohol’s O-18') + '</span>';
        return { tl: tl + (mech.alt ? T('（錯誤的猜想）', ' (wrong guess)') : ''), tr: tr, e: e };
      },
      contextLost: function () { setView('2d'); viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 實驗。', 'The 3D graphics context was lost, so the view switched back to 2D.'); }
    };
  }
  function setPressed(mode) { $('view2d').setAttribute('aria-pressed', String(mode === '2d')); $('view3d').setAttribute('aria-pressed', String(mode === '3d')); }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable() || !window.ES3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        state.view = '3d';
        view3 = window.ES3D.create(lib, bridge());
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        view3.update(true);
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      state.view = '2d';
      stopMech();
      if (view3) { view3.dispose(); view3 = null; }
      stage.classList.remove('is3d');
      $('resetCam').hidden = true;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
      startLoop();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    state.view = '2d';
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 實驗。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  function setMechP(p, fromSlider) {
    mech.p = Math.max(0, Math.min(1, p));
    if (!fromSlider) setVal($('mechP'), Math.round(mech.p * 100));
    $('mechPo').textContent = num(mech.p * 100, 0) + '%';
    if (view3) view3.update(false);
  }
  function stopMech() { mech.playing = false; if (mech.raf) cancelAnimationFrame(mech.raf); mech.raf = 0; $('mechPlay').textContent = T('播放反應', 'Play the reaction'); }
  function playMech() {
    if (mech.playing) { stopMech(); return; }
    if (mech.p >= 0.999) setMechP(0);
    mech.playing = true;
    $('mechPlay').textContent = T('暫停', 'Pause');
    let last = 0;
    const dur = 5;
    const stepM = function (ts) {
      mech.raf = 0;
      if (!mech.playing) return;
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
      last = ts;
      const p0 = mech.p;
      setMechP(mech.p + dt / dur);
      if (p0 < 0.5 && mech.p >= 0.5 && snd()) window.LabSound.tone({ freq: 784, dur: 0.12, gain: 0.06 });
      if (mech.p >= 1) { stopMech(); if (snd()) { window.LabSound.tone({ freq: 660, dur: 0.12, gain: 0.06 }); window.LabSound.tone({ freq: 990, dur: 0.18, gain: 0.05, delay: 0.1 }); } return; }
      mech.raf = requestAnimationFrame(stepM);
    };
    mech.raf = requestAnimationFrame(stepM);
  }

  // ======================= 事件 =======================
  [el.nA, el.nB, el.nE, el.nW, el.cat].forEach(function (e) {
    e.addEventListener('input', function () { if (syncing) return; updateOutputs(); changed(); });
  });
  el.label.addEventListener('change', function () { molSprites = {}; changed(); });
  el.temp.addEventListener('input', function () {
    if (syncing) return;
    acted();
    const Tn = val(el.temp);
    if (Math.abs(Tn - run.T) < 1e-9) { updateOutputs(); return; }
    if (run.t === 0) { run.T = Tn; run.Tmin = Tn; run.Tmax = Tn; }
    else { C.setT(run, Tn); perturb('T'); sample(true); }
    updateOutputs();
    refreshAll();
  });
  document.querySelectorAll('#acidSeg button').forEach(function (b) { b.addEventListener('click', function () { if (b.dataset.acid === state.acid) return; state.acid = b.dataset.acid; molSprites = {}; syncSegs(); changed(); }); });
  document.querySelectorAll('#alcSeg button').forEach(function (b) { b.addEventListener('click', function () { if (b.dataset.alc === state.alc) return; state.alc = b.dataset.alc; molSprites = {}; syncSegs(); changed(); }); });
  document.querySelectorAll('#tabs button').forEach(function (b) { b.addEventListener('click', function () { acted(); state.tab = b.dataset.tab; syncSegs(); updateLegend(); drawGraph(); }); });
  $('play').addEventListener('click', function () { acted(); togglePlay(); });
  $('restart').addEventListener('click', function () { changed(); });
  $('workup').addEventListener('click', doWorkup);
  $('clearAll').addEventListener('click', function () {
    acted();
    ghosts = []; eqLog = [];
    renderTable(); updateLegend(); drawGraph();
    setStatus(T('已清除舊的曲線與平衡紀錄（目前這瓶保留）。', 'The old curves and the table of equilibria have been cleared (the present flask is kept).'));
  });
  ['A', 'B', 'E', 'W'].forEach(function (k) { $('add' + k).addEventListener('click', function () { doAdd(k); }); });
  $('addS').addEventListener('click', doSieves);
  for (let i = 0; i < SPEEDS.length; i++) (function (k) { $('sp' + k).addEventListener('click', function () { acted(); state.speed = k; syncSegs(); }); })(i);
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  $('view2d').addEventListener('click', function () { acted(); setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  $('mechPlay').addEventListener('click', function () { acted(); playMech(); });
  $('mechP').addEventListener('input', function () { if (syncing) return; acted(); stopMech(); setMechP(val($('mechP')) / 100, true); });
  $('mechAlt').addEventListener('change', function () { acted(); mech.alt = $('mechAlt').checked; if (view3) view3.update(true); });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
    if (ev.detail && ev.detail.name === 'fs') { resize(); resizeGraph(); drawGraph(); }
  });
  function themeChanged() {
    if (LD.refresh) LD.refresh();
    readColors();
    refreshAll();
    if (view3) view3.onTheme();
  }
  window.addEventListener('lab:themechange', themeChanged);
  if (window.matchMedia) {
    const dm = window.matchMedia('(prefers-color-scheme: dark)');
    if (dm.addEventListener) dm.addEventListener('change', themeChanged);
  }
  if (window.ResizeObserver) {
    let lw = 0, lg = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth !== lg) { lg = gcv.clientWidth; resizeGraph(); drawGraph(); } }).observe(gcv);
  } else window.addEventListener('resize', function () { resize(); resizeGraph(); drawGraph(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) startLoop(); });
  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('實驗畫面。空白鍵開始或暫停加熱。按 Enter 選要調整的項目，方向鍵改變水浴溫度。', 'Experiment. Space starts or pauses heating. Press Enter to choose an item; the arrow keys change the bath temperature.'),
      items: [
        { name: function () { return T('水浴溫度', 'Bath temperature'); },
          move: function (dx, dy, big) { const d = dx || -dy; if (!d) return false; const v = Math.max(20, Math.min(80, val(el.temp) + d * (big ? 10 : 1))); if (window.LabNum) window.LabNum.set(el.temp, v); else { el.temp.value = v; el.temp.dispatchEvent(new Event('input')); } return true; },
          describe: function () { return num(run.T, 0) + T(' °C，', ' °C, ') + esterName() + ' ' + num(run.E, 3) + ' mol'; } }
      ],
      onChange: function () { drawStage(); }
    });
    cv.addEventListener('keydown', function (e) { if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); acted(); togglePlay(); } });
  }

  // 任務：每 0.5 秒回報目前狀態
  setInterval(function () { if (userActed && run) emit('tick', tickData()); }, 500);

  // 測試用（Playwright）：讀取狀態、快轉
  window.__es = {
    state: state, run: function () { return run; }, eqLog: function () { return eqLog; }, tick: tickData,
    ffwd: function (sec) { acted(); advance(sec); refreshAll(); },
    add: doAdd, sieves: doSieves, workup: doWorkup, setView: setView, mech: function (p, alt) { if (alt != null) { mech.alt = !!alt; $('mechAlt').checked = !!alt; } setMechP(p); }
  };

  // ======================= 啟動 =======================
  readColors();
  cw = cv.clientWidth || 600; ch = 440; layout();
  syncSegs();
  newRun();
  buildDataTable();
  updateSoundButton();
  setMechP(0);
  resize();
  resizeGraph();
  refreshAll();
  startLoop();
})();
