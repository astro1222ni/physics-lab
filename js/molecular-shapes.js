/* molecular-shapes.js — 「分子的形狀（VSEPR）」的畫面與互動
 * 化學計算（排斥位能、梯度下降、能量最低的排列、極性、電子數）全部在 molecular-shapes-core.js；
 * 共用繪圖工具 LabDraw 在 drawkit.js；3D 檢視在 molecular-shapes-3d.js（第一次切到 3D 時才載入，three.js 也是那時才 import）。 */
(function () {
  'use strict';
  const VC = window.VseprCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // 本檔的版本號（?v=）：切換到 3D 時動態載入的 js/molecular-shapes-3d.js 沿用同一個版本號
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const alpha = D.alpha, shade = D.shade, mix = D.mix;
  const LAM0 = VC.MODEL.lam;
  const RATE = 7;            // 動畫的鬆弛速率（1/s）：最硬的振動模式約 1/7 秒衰減
  const MAX_RATE = 2.4;      // 電子域最快每秒轉 2.4 rad（約 140°）
  const SWAP_DEG = 20;       // 放手時離另一個電子域原本的位置 20° 以內，就和它換位
  const SETTLE = 0.004;      // 角速度小於 0.004 rad/s 視為穩定
  const LP_LEN = 1.05;       // 孤對電子瓣的長度（Å，示意）

  // ---------- 色彩 ----------
  let C = { el: {} };
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'accent-soft', 'surface', 'pos', 'neg', 'probe', 'ms-lp', 'ms-dip', 'ms-bond', 'ms-poly']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    Object.keys(VC.ELEMENTS).forEach(function (e) { C.el[e] = cs.getPropertyValue('--el-' + e).trim() || '#888888'; });
    C.dark = D.dark;
  }
  function fnt(px, weight) { return (weight ? weight + ' ' : '') + px + 'px ' + FONT; }
  function lum(c) { const r = D.rgb(c); return (0.2126 * r[0] + 0.7152 * r[1] + 0.0722 * r[2]) / 255; }

  // ---------- 數字 ----------
  function num(v, dec) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(dec);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function deg(a) { return num(a, 1) + '°'; }

  // ---------- 狀態 ----------
  let nextId = 1;
  const state = {
    spec: { center: 'C', ligs: ['H', 'H', 'H', 'H'], lp: 0 },
    doms: [],              // { id, k, lig, bo, u }
    lam: LAM0, P: VC.params(LAM0),
    glob: null, mob: 1,
    moving: false, settled: false,
    anneal: null,          // { t, dur, T0（起始溫度，能量單位）, tau }
    present: null,         // 穩定後轉到課本方向的動畫 { U0, q（四元數）, t, dur }
    drag: null,            // { id, start（拖動開始時的方向）, max（離開原位的最大角度）, kbd }
    autoShakes: 0,
    sel: [],               // 量鍵角：選到的兩個鍵（電子域 id）
    preset: 'CH4', custom: false,
    cause: null, user: false, fromLocal: false, dragAngle: 0,
    hist: [], simT: 0,
    info: null,            // 最近一次穩定時的分析
    last: null,            // 最近一次穩定時的狀態（給搖一搖判斷 fromLocal）
    show: { lp: true, net: true, bd: false, poly: false },
    R: null,               // 2D 檢視的旋轉矩陣（列向量為螢幕的右、上、朝向觀看者）
    hover: null
  };
  const rng = VC.mulberry32(20261112);

  function U() { return state.doms.map(function (d) { return d.u; }); }
  function domIndex(id) { for (let i = 0; i < state.doms.length; i++) if (state.doms[i].id === id) return i; return -1; }
  function bondLen(d) { return d.k === 'L' ? LP_LEN : VC.bondLength(state.spec.center, d.lig, d.bo); }
  function ballR(el) { return 0.2 + 0.3 * VC.ELEMENTS[el].r; }
  /** 每個鍵結原子的標籤：同一種元素有兩個以上時加上編號（F1、F2…） */
  function ligLabels() {
    const cnt = {}, seen = {};
    state.doms.forEach(function (d) { if (d.k === 'B') cnt[d.lig] = (cnt[d.lig] || 0) + 1; });
    return state.doms.map(function (d) {
      if (d.k !== 'B') return null;
      seen[d.lig] = (seen[d.lig] || 0) + 1;
      return { el: d.lig, sub: cnt[d.lig] > 1 ? String(seen[d.lig]) : '' };
    });
  }
  function labelText(l) { return l ? l.el + l.sub : ''; }
  function labelHTML(l) { return l ? l.el + (l.sub ? '<sub>' + l.sub + '</sub>' : '') : ''; }

  // ---------- 組成改變 ----------
  function rebuildModel() {
    state.P = VC.params(state.lam);
    const doms = state.doms.map(function (d) { return { k: d.k, lig: d.lig, bo: d.bo }; });
    state.glob = VC.globalMin(doms, state.P);
    state.mob = RATE / VC.stiffness(doms, state.P);
  }
  function domsFromSpec(spec) {
    return VC.domainsOf(spec).map(function (d) { return { id: nextId++, k: d.k, lig: d.lig, bo: d.bo, u: [0, 0, 1] }; });
  }
  /** 套用一個組成（快速選單、分享連結）：從能量最低的排列附近、加一點擾動開始，讓電子域自己排好 */
  function applySpec(spec, opts) {
    opts = opts || {};
    state.spec = { center: spec.center, ligs: spec.ligs.slice(), lp: spec.lp };
    state.doms = domsFromSpec(state.spec);
    state.sel = [];
    rebuildModel();
    const G = state.glob.U;
    const kick = opts.scatter == null ? 0.55 : opts.scatter;
    // 每個電子域隨機推開一點、去掉整體的轉動（放手後分子回到原本好看的方向，不會在畫面上轉走），
    // 而且推開的方式保證會回到能量最低的排列
    const U0 = kick ? VC.scatter(state.doms, G, state.P, kick, rng) : G;
    state.doms.forEach(function (d, i) { d.u = U0[i].slice(); });
    if (opts.U) state.doms.forEach(function (d, i) { if (opts.U[i]) d.u = VC.unit(opts.U[i]); });
    afterStructure();
  }
  function afterStructure() {
    state.hist = [];
    buildBondChips();
    buildLigChips();
    updateBuilder();
    updatePresetButtons();
    if (view3 && view3.active) view3.rebuild();
  }

  // ---------- 動畫：過阻尼運動與模擬退火 ----------
  let raf = 0, lastT = 0;
  function startMove(cause, user, opts) {
    opts = opts || {};
    state.cause = cause;
    state.user = !!user;
    state.moving = true;
    state.settled = false;
    state.present = null;
    if (opts.anneal) startAnneal(opts.anneal);
    setStatus(T('電子域互相推開，正在調整…', 'The electron domains are pushing each other apart…'));
    kick();
  }
  /** 開始一輪退火：cfg = VC.ANNEAL 的 gentle、hot 或 build（溫度以這個組合的最低能量為單位） */
  function startAnneal(cfg) {
    state.anneal = { t: 0, dur: cfg.dur, T0: cfg.T0 * Math.max(1e-6, state.glob ? state.glob.E : 1), tau: cfg.tau };
  }
  function kick() { if (!raf) { lastT = 0; raf = requestAnimationFrame(frame); } }
  function frame(t) {
    raf = 0;
    const dt = lastT ? Math.min(1 / 30, (t - lastT) / 1000) : 1 / 60;
    lastT = t;
    step(dt);
    presentStep(dt);
    drawAll();
    if (state.moving || state.present) raf = requestAnimationFrame(frame);
  }
  /**
   * 選常見分子、穩定在能量最低的排列之後，把整個分子慢慢轉到課本常見的方向（孤對電子朝上等，見 orientQuat）。
   * 只是整體旋轉：鍵角、能量、極性都不變，任務也已經在穩定時判定完了。
   */
  function startPresent() {
    const Ucur = U();
    const q = VC.orientQuat(state.doms, Ucur);
    const ang = VC.qAngle(q);
    if (ang < 1.5) return;
    if (reducedMotion) {
      state.doms.forEach(function (d, i) { d.u = VC.unit(VC.qRot(q, Ucur[i])); });
      if (view3 && view3.active) view3.update();
      return;
    }
    state.present = { U0: Ucur, q: q, t: 0, dur: Math.min(1.2, 0.45 + ang / 150) };
    kick();
  }
  function presentStep(dt) {
    const p = state.present;
    if (!p) return;
    p.t = Math.min(p.dur, p.t + dt);
    const s = p.t / p.dur, e = s * s * (3 - 2 * s);
    const q = VC.qPart(p.q, e);
    state.doms.forEach(function (d, i) { d.u = VC.unit(VC.qRot(q, p.U0[i])); });
    if (p.t >= p.dur) state.present = null;
    if (view3 && view3.active) view3.update();
  }
  function step(dt) {
    if (!state.moving) return;
    const pin = state.drag ? domIndex(state.drag.id) : -1;
    let Ucur = U();
    if (state.anneal) {
      const a = state.anneal;
      Ucur = VC.thermal(Ucur, a.T0 * Math.exp(-a.t / a.tau), state.mob, dt, rng, pin);
      a.t += dt;
      if (a.t >= a.dur) state.anneal = null;
    }
    const r = VC.flow(state.doms, Ucur, state.P, dt, { pin: pin, mob: state.mob, maxRate: MAX_RATE, tail: !state.drag && !state.anneal });
    state.doms.forEach(function (d, i) { d.u = r.U[i]; });
    state.simT += dt;
    state.hist.push({ t: state.simT, E: r.E });
    if (state.hist.length > 900) state.hist.splice(0, state.hist.length - 900);
    if (state.drag) {
      const i = domIndex(state.drag.id);
      if (i >= 0) state.drag.max = Math.max(state.drag.max, VC.angleDeg(state.drag.start, state.doms[i].u));
    }
    if (!state.drag && !state.anneal && state.mob * r.gmax < SETTLE) settle();
    if (view3 && view3.active) view3.update();
    // settle() 已經寫好穩定後的讀數；這時再更新會把「狀態」蓋回「調整中…」
    if (state.moving) updateLive();
  }
  /** 穩定下來：再精確求一次局部最低點（變化小於 0.01°），分析、回報任務、出聲 */
  function settle() {
    const r = VC.relax(state.doms, U(), state.P, { tol: 1e-10 });
    state.doms.forEach(function (d, i) { d.u = r.U[i]; });
    state.moving = false;
    state.settled = true;
    const info = analyze();
    const auto = state.cause === 'preset' || state.cause === 'build' || state.cause === 'lam' || state.cause === 'init' || state.cause === 'share';
    // 自動的變化（換分子、加減電子域、改排斥強度）或按了「搖一搖」之後，若還停在局部最低點，就再用力搖一輪（一次最多連搖 4 輪）
    if (!info.isGlobal && (auto || state.cause === 'shake') && state.autoShakes < VC.ANNEAL.rounds - 1) {
      state.autoShakes++;
      state.moving = true; state.settled = false;
      startAnneal(VC.ANNEAL.hot);
      setStatus(state.cause === 'shake'
        ? T('還停在局部最低點，再搖一次（第 ' + (state.autoShakes + 1) + ' 輪）…', 'Still in a local minimum — shaking again (round ' + (state.autoShakes + 1) + ')…')
        : T('停在局部最低點，自動搖一搖，尋找能量最低的排列…', 'Stuck in a local minimum — shaking automatically to find the lowest-energy arrangement…'));
      playShake();
      kick();
      return;
    }
    state.autoShakes = 0;
    state.info = info;
    updateReadouts();
    if (view3 && view3.active) view3.update();
    if (info.isGlobal && (state.cause === 'preset' || state.cause === 'init')) startPresent();
    setStatus(info.isGlobal
      ? T('穩定：這是能量最低的排列。', 'Settled: this is the lowest-energy arrangement.')
      : (state.cause === 'shake'
        ? T('連搖 ' + VC.ANNEAL.rounds + ' 輪還是停在局部最低點（退火是機率性的），再按一次「搖一搖（退火）」試試看。能量比最低的排列多 ', 'Still in a local minimum after ' + VC.ANNEAL.rounds + ' rounds (annealing is a matter of chance): press “Shake (anneal)” again. The energy is ') + num(info.E - info.Eg, 4) + T('。', ' above the lowest arrangement.')
        : T('穩定在局部最低點：能量比最低的排列多 ', 'Settled in a local minimum: the energy is ') + num(info.E - info.Eg, 4) + T('。按「搖一搖（退火）」讓它找到能量最低的排列。', ' above the lowest arrangement. Press “Shake (anneal)” to let it find the lowest one.')));
    playSettle(info.isGlobal);
    if (state.user) emitSettle(info);
    state.last = { isGlobal: info.isGlobal, key: info.key };
    state.user = false;
    emitMeasure();
    drawAll();
  }
  function analyze() {
    const a = VC.analyze(state.spec, state.doms, U(), state.P, state.glob);
    a.lpAxial = 0;
    if (a.N === 5) {
      const ax = VC.axialFlags(U());
      state.doms.forEach(function (d, i) { if (d.k === 'L' && ax[i]) a.lpAxial++; });
    }
    return a;
  }

  // ---------- 任務事件 ----------
  function baseData(info) {
    return {
      center: state.spec.center, ligs: state.spec.ligs.slice().sort(), lp: state.spec.lp,
      m: info.m, n: info.n, N: info.N, key: info.key, axe: info.axe, std: info.m + ',' + info.n,
      isGlobal: info.isGlobal, lam: state.lam, lamDefault: Math.abs(state.lam - LAM0) < 1e-9,
      preset: state.preset, custom: state.custom, lpAxial: info.lpAxial || 0
    };
  }
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitSettle(info) {
    const d = baseData(info);
    Object.assign(d, {
      cause: state.cause, formula: info.formula.text, shape: info.shape, egeom: info.egeom,
      E: info.E, Eg: info.Eg, angles: info.angles.map(function (x) { return x.a; }),
      polar: info.polar, dip: info.dipole.mag, charge: info.charge, valid: info.valid,
      dragAngle: state.cause === 'drag' ? state.dragAngle : 0,
      fromLocal: state.cause === 'shake' ? state.fromLocal : false, lpAxial: info.lpAxial
    });
    emit('settle', d);
  }
  let lastMeasureKey = '';
  /** 選好兩個鍵而且已經穩定：回報量到的鍵角（同一個狀態只回報一次） */
  function emitMeasure() {
    if (state.sel.length !== 2 || !state.settled || !state.info || !state.measureUser) return;
    const i = domIndex(state.sel[0]), j = domIndex(state.sel[1]);
    if (i < 0 || j < 0) return;
    const a = VC.angleDeg(state.doms[i].u, state.doms[j].u);
    const key = state.sel.join(',') + '|' + a.toFixed(4) + '|' + state.info.key;
    if (key === lastMeasureKey) return;
    lastMeasureKey = key;
    const d = baseData(state.info);
    d.angle = a;
    d.ligA = state.doms[i].lig; d.ligB = state.doms[j].lig;
    emit('measure', d);
  }

  // ---------- 使用者操作 ----------
  function userChanged(cause) {
    state.autoShakes = 0;
    lastMeasureKey = '';
    startMove(cause, true, cause === 'build' ? { anneal: VC.ANNEAL.build } : null);
  }
  function choosePreset(id) {
    const p = VC.preset(id);
    if (!p) return;
    state.preset = id;
    state.custom = false;
    applySpec(p);
    userChanged('preset');
  }
  /** 「自己組合」：改中心原子 */
  function setCenter(el) {
    if (el === state.spec.center || !canCenter(el)) return;
    state.spec.center = el;
    state.preset = null; state.custom = true;
    afterStructure();
    userChanged('build');
  }
  function addLigand(x) {
    if (!canAdd(x)) return;
    const nb = state.spec.ligs.length;
    state.spec.ligs.push(x);
    const d = { id: nextId++, k: 'B', lig: x, bo: VC.LIGANDS[x].bo, u: VC.freeDirection(U()) };
    state.doms.splice(nb, 0, d);
    state.preset = null; state.custom = true;
    rebuildModel();
    afterStructure();
    userChanged('build');
  }
  function removeLigand(id) {
    const i = domIndex(id);
    if (i < 0 || state.doms[i].k !== 'B' || !canRemoveLig()) return;
    state.doms.splice(i, 1);
    state.spec.ligs.splice(i, 1);
    state.sel = state.sel.filter(function (s) { return s !== id; });
    state.preset = null; state.custom = true;
    rebuildModel();
    afterStructure();
    userChanged('build');
  }
  function addLP() {
    if (!canAddLP()) return;
    state.spec.lp++;
    state.doms.push({ id: nextId++, k: 'L', lig: null, bo: 0, u: VC.freeDirection(U()) });
    state.preset = null; state.custom = true;
    rebuildModel();
    afterStructure();
    userChanged('build');
  }
  function removeLP() {
    if (!canRemoveLP()) return;
    for (let i = state.doms.length - 1; i >= 0; i--) if (state.doms[i].k === 'L') { state.doms.splice(i, 1); break; }
    state.spec.lp--;
    state.preset = null; state.custom = true;
    rebuildModel();
    afterStructure();
    userChanged('build');
  }
  function shake() {
    if (state.drag) return;
    // 正停在局部最低點：用力搖（才越得過能障）；已經是能量最低的排列：輕輕搖。搖完還在局部最低點，會自動再搖（一次最多 4 輪）
    const local = !!(state.settled && state.info && !state.info.isGlobal);
    state.fromLocal = local;
    state.autoShakes = 0;
    lastMeasureKey = '';
    startMove('shake', true, { anneal: local ? VC.ANNEAL.hot : VC.ANNEAL.gentle });
    playShake();
  }
  /** 預覽組成：試著加一個東西之後是否合理 */
  function trySpec(mod) {
    const s = { center: state.spec.center, ligs: state.spec.ligs.slice(), lp: state.spec.lp };
    mod(s);
    return s;
  }
  function specOK(s) {
    const N = s.ligs.length + s.lp;
    if (N > VC.MAX_DOMAINS || N < VC.MIN_DOMAINS || s.ligs.length < 1 || s.lp > VC.MAX_LP || s.lp < 0) return false;
    return VC.lewis(s).octetOK;
  }
  function canAdd(x) { return specOK(trySpec(function (s) { s.ligs.push(x); })); }
  function canRemoveLig() { return specOK(trySpec(function (s) { s.ligs.pop(); })); }
  function canAddLP() { return specOK(trySpec(function (s) { s.lp++; })); }
  function canRemoveLP() { return state.spec.lp > 0 && specOK(trySpec(function (s) { s.lp--; })); }
  function canCenter(el) { return specOK(trySpec(function (s) { s.center = el; })); }

  // ---------- 面板：常見分子、自己組合、量鍵角 ----------
  function updatePresetButtons() {
    document.querySelectorAll('#presets button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.preset === state.preset)); });
  }
  const cBox = $('centers'), aBox = $('addLig'), lChips = $('ligChips'), bChips = $('bondChips');
  VC.CENTERS.forEach(function (el) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.c = el;
    b.innerHTML = '<i></i>' + el;
    b.addEventListener('click', function () { setCenter(el); });
    cBox.appendChild(b);
  });
  VC.LIGAND_ORDER.forEach(function (x) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.add = x;
    // 半形加號、整段不換行（「+=O」在窄欄裡曾經擠成兩行）
    b.innerHTML = '<i></i><span>+' + (x === 'O' ? '=O' : x) + '</span>';
    b.setAttribute('aria-label', x === 'O' ? T('加一個雙鍵 O', 'Add a double-bonded O') : T('加一個 ', 'Add one ') + x);
    b.setAttribute('data-en-aria-label', x === 'O' ? 'Add a double-bonded O' : 'Add one ' + x);
    b.addEventListener('click', function () { addLigand(x); });
    aBox.appendChild(b);
  });
  function paintSwatches() {
    cBox.querySelectorAll('button').forEach(function (b) { b.querySelector('i').style.background = C.el[b.dataset.c]; });
    aBox.querySelectorAll('button').forEach(function (b) { b.querySelector('i').style.background = C.el[b.dataset.add]; });
    lChips.querySelectorAll('button i').forEach(function (i) { i.style.background = C.el[i.dataset.el]; });
    bChips.querySelectorAll('button i').forEach(function (i) { i.style.background = C.el[i.dataset.el]; });
  }
  function buildLigChips() {
    const labels = ligLabels();
    lChips.innerHTML = '';
    state.doms.forEach(function (d, i) {
      if (d.k !== 'B') return;
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<i data-el="' + d.lig + '"></i>' + (d.bo === 2 ? '=' : '') + labelHTML(labels[i]);
      b.setAttribute('aria-label', T('移除 ', 'Remove ') + labelText(labels[i]));
      b.addEventListener('click', function () { removeLigand(d.id); });
      lChips.appendChild(b);
    });
    paintSwatches();
  }
  function buildBondChips() {
    const labels = ligLabels();
    bChips.innerHTML = '';
    let any = false;
    state.doms.forEach(function (d, i) {
      if (d.k !== 'B') return;
      any = true;
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.id = d.id;
      b.innerHTML = '<i data-el="' + d.lig + '"></i>' + state.spec.center + (d.bo === 2 ? '=' : '–') + labelHTML(labels[i]);
      b.setAttribute('aria-pressed', String(state.sel.indexOf(d.id) >= 0));
      b.addEventListener('click', function () { toggleSel(d.id); });
      bChips.appendChild(b);
    });
    if (!any) bChips.innerHTML = '<span class="none">—</span>';
    paintSwatches();
    updateAngleOut();
  }
  function toggleSel(id) {
    const k = state.sel.indexOf(id);
    if (k >= 0) state.sel.splice(k, 1);
    else {
      if (state.sel.length >= 2) state.sel.shift();
      state.sel.push(id);
    }
    state.measureUser = true;
    lastMeasureKey = '';
    bChips.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(state.sel.indexOf(+b.dataset.id) >= 0)); });
    updateAngleOut();
    if (state.sel.length === 2) playTick();
    emitMeasure();
    if (view3 && view3.active) view3.update();
    drawAll();
  }
  function updateAngleOut() {
    const out = $('angleOut');
    if (state.sel.length < 2) {
      out.innerHTML = '<small>' + (state.sel.length ? T('再選一個鍵', 'Pick one more bond') : T('還沒有選鍵', 'No bonds picked yet')) + '</small>';
      return;
    }
    const labels = ligLabels();
    const i = domIndex(state.sel[0]), j = domIndex(state.sel[1]);
    if (i < 0 || j < 0) { out.textContent = '—'; return; }
    const a = VC.angleDeg(state.doms[i].u, state.doms[j].u);
    out.innerHTML = deg(a) + '<small>' + labelHTML(labels[i]) + '–' + state.spec.center + '–' + labelHTML(labels[j]) +
      (state.settled ? '' : T('（還在調整）', ' (still moving)')) + '</small>';
  }
  function updateBuilder() {
    cBox.querySelectorAll('button').forEach(function (b) {
      const el = b.dataset.c;
      b.setAttribute('aria-pressed', String(el === state.spec.center));
      b.disabled = el !== state.spec.center && !canCenter(el);
      b.title = b.disabled ? T('第二週期的原子價殼層最多 8 個電子', 'A period-2 atom holds at most 8 valence electrons') : '';
    });
    aBox.querySelectorAll('button').forEach(function (b) { b.disabled = !canAdd(b.dataset.add); });
    lChips.querySelectorAll('button').forEach(function (b) { b.disabled = !canRemoveLig(); });
    $('lpAdd').disabled = !canAddLP();
    $('lpDel').disabled = !canRemoveLP();
    const lw = VC.lewis(state.spec), c = VC.ELEMENTS[state.spec.center];
    const N = state.spec.ligs.length + state.spec.lp;
    let s = T('中心原子 ', 'Central atom ') + state.spec.center + T(' 有 ', ' has ') + c.v + T(' 個價電子；', ' valence electrons; ') +
      T('價殼層共 ', 'its valence shell holds ') + lw.shell + T(' 個電子（', ' electrons (') + N + T(' 個電子域）。', ' electron domains). ');
    const info = $('eInfo');
    info.classList.remove('warn');
    if (lw.charge === 0) s += T('電中性的分子。', 'A neutral molecule.');
    else if (Math.abs(lw.charge) === 1) s += T('要帶 ', 'This needs a charge of ') + (lw.charge > 0 ? '+1' : '−1') + T(' 的電荷，是離子。', ': it is an ion.');
    else { s += T('要帶 ', 'This needs a charge of ') + (lw.charge > 0 ? '+' : '−') + Math.abs(lw.charge) + T(' 的電荷，很少見。', ', which is very unusual.'); info.classList.add('warn'); }
    if (N >= VC.MAX_DOMAINS) s += T('已經 6 個電子域，不能再加。', ' Six domains is the most.');
    else if (c.period === 2 && lw.shell >= 8) s += T('第二週期的原子價殼層最多 8 個電子，不能再加。', ' A period-2 atom holds at most 8 valence electrons, so nothing more can be added.');
    info.textContent = s;
  }

  // ---------- 讀數 ----------
  const lastHTML = {};
  function setHTML(el, h) { if (lastHTML[el.id] !== h) { lastHTML[el.id] = h; el.innerHTML = h; } }
  function formulaHTML(f) {
    let h = f.parts.map(function (p) { return p.el + (p.n > 1 ? '<sub>' + p.n + '</sub>' : ''); }).join('');
    if (f.charge) h += '<sup>' + (Math.abs(f.charge) > 1 ? Math.abs(f.charge) : '') + (f.charge > 0 ? '+' : '−') + '</sup>';
    return h;
  }
  function axeHTML(m, n) { return 'AX' + (m > 1 ? '<sub>' + m + '</sub>' : '') + (n ? 'E' + (n > 1 ? '<sub>' + n + '</sub>' : '') : ''); }
  function shapeName(id) { const s = VC.SHAPES[id]; return s ? T(s[0], s[1]) : '—'; }
  function anglesHTML(groups) {
    if (!groups.length) return '—';
    return groups.map(function (g) { return deg(g.a) + (g.n > 1 ? ' ×' + g.n : ''); }).join(T('、', ', '));
  }
  function updateReadouts() {
    const info = state.info || analyze();
    const rows = [];
    rows.push(['<dt>' + T('分子', 'Species') + '</dt>', '<dd class="big">' + formulaHTML(info.formula) + '</dd>']);
    rows.push(['<dt>' + T('類型', 'Type') + '</dt>', '<dd>' + axeHTML(info.m, info.n) + '</dd>']);
    rows.push(['<dt>' + T('電子域', 'Electron domains') + '</dt>', '<dd>' + info.N + '<small>' + T('鍵結 ', 'bonds ') + info.m + T('、孤對 ', ', lone pairs ') + info.n + '</small></dd>']);
    rows.push(['<dt>' + T('電子對幾何', 'Electron-pair geometry') + '</dt>', '<dd>' + shapeName(info.egeom) + '</dd>']);
    rows.push(['<dt>' + T('分子形狀', 'Shape') + '</dt>', '<dd>' + shapeName(info.shape) + (info.isGlobal ? '' : '<small>' + T('（目前不是能量最低的排列）', '(not the lowest-energy arrangement yet)') + '</small>') + '</dd>']);
    rows.push(['<dt>' + T('鍵角', 'Bond angles') + '</dt>', '<dd id="angCell">' + anglesHTML(info.groups) + '</dd>']);
    const pol = info.polar ? T('極性分子', 'polar') : T('非極性分子', 'non-polar');
    rows.push(['<dt>' + T('極性', 'Polarity') + '</dt>', '<dd>' + pol + '<small>' + T('淨偶極 ', 'net dipole ') + num(info.dipole.mag < 5e-4 ? 0 : info.dipole.mag, 2) + T('（電負度差）', ' (in Δχ)') + '</small></dd>']);
    rows.push(['<dt>' + T('能量', 'Energy') + '</dt>', '<dd id="eCell">' + num(info.E, 3) + '<small>' + T('最低 ', 'lowest ') + num(info.Eg, 3) + T('（相對單位）', ' (relative units)') + '</small></dd>']);
    rows.push(['<dt>' + T('狀態', 'State') + '</dt>', '<dd id="stCell" class="' + (state.settled ? (info.isGlobal ? 'good' : 'warn') : '') + '">' + stateText(info) + '</dd>']);
    setHTML($('readout'), rows.map(function (r) { return r.join(''); }).join(''));
    updateAngleOut();
  }
  function stateText(info) {
    if (!state.settled) return T('調整中…', 'moving…');
    return info.isGlobal ? T('能量最低', 'lowest energy') : T('局部最低', 'local minimum');
  }
  /** 動畫中只更新會變的格子 */
  function updateLive() {
    const a = $('angCell'), e = $('eCell'), s = $('stCell');
    if (!a || !e || !s) return;
    const ang = VC.groupAngles(VC.bondAngles(state.doms, U()));
    a.innerHTML = anglesHTML(ang);
    const E = state.hist.length ? state.hist[state.hist.length - 1].E : 0;
    e.innerHTML = num(E, 3) + '<small>' + T('最低 ', 'lowest ') + num(state.glob.E, 3) + T('（相對單位）', ' (relative units)') + '</small>';
    s.className = '';
    s.textContent = T('調整中…', 'moving…');
    delete lastHTML.readout;
    updateAngleOut();
  }
  function setStatus(t) { $('status').textContent = t; }

  // ---------- 音效 ----------
  const S = function () { return window.LabSound; };
  function playSettle(global) {
    if (!S() || !S().enabled()) return;
    if (global) {
      S().tone({ freq: 523.25, dur: 0.22, type: 'sine', gain: 0.22 });
      setTimeout(function () { S().tone({ freq: 783.99, dur: 0.3, type: 'sine', gain: 0.2 }); }, 90);
    } else {
      S().tone({ freq: 392, dur: 0.28, type: 'triangle', gain: 0.22 });
      setTimeout(function () { S().tone({ freq: 370, dur: 0.3, type: 'triangle', gain: 0.18 }); }, 110);
    }
  }
  function playShake() { if (S() && S().enabled()) S().noise({ dur: 0.35, gain: 0.25, filter: 2400, q: 0.9 }); }
  function playTick() { if (S() && S().enabled()) S().tone({ freq: 1046.5, dur: 0.06, type: 'sine', gain: 0.18 }); }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // =====================================================================
  // 2D 投影（楔形實線／虛線）
  // =====================================================================
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let W = 600, H = 450, dpr = 1, scale = 60, cx = 300, cy = 225;
  const PERSP = 9; // 透視：觀看者在 9 Å 外
  function matMul(A, B) {
    const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
    return R;
  }
  function rotM(axis, th) {
    const k = VC.unit(axis), c = Math.cos(th), s = Math.sin(th), t = 1 - c, x = k[0], y = k[1], z = k[2];
    return [[t * x * x + c, t * x * y - s * z, t * x * z + s * y], [t * x * y + s * z, t * y * y + c, t * y * z - s * x], [t * x * z - s * y, t * y * z + s * x, t * z * z + c]];
  }
  function apply(R, v) { return [R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2], R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2], R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2]]; }
  function applyT(R, v) { return [R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2], R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2], R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2]]; }
  /** 預設視角：由斜上方、偏左看（z 朝上） */
  function defaultView() {
    // 方位角 50°、仰角 30°：把所有常見分子擺正（orientQuat）後掃描選出來的，
    // 原子與孤對電子在畫面上都不互相重疊，視線也離每個鍵 30° 以上
    const az = 50 * Math.PI / 180, el = 30 * Math.PI / 180;
    // 先讓 z 朝上（螢幕 y），再繞直立軸轉方位角、繞水平軸轉仰角
    const base = [[1, 0, 0], [0, 0, 1], [0, -1, 0]]; // 世界 x→螢幕右、z→螢幕上、−y→朝向觀看者
    return matMul(rotM([1, 0, 0], el), matMul(base, rotM([0, 0, 1], az)));
  }
  state.R = defaultView();
  function proj(p) {
    const v = apply(state.R, p);
    const f = PERSP / (PERSP - v[2]);
    return { x: cx + v[0] * scale * f, y: cy - v[1] * scale * f, z: v[2], f: f };
  }
  function resize() {
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    sizeSub();
    drawAll();
  }
  function fitScale() {
    let Rm = 1.4;
    state.doms.forEach(function (d) { Rm = Math.max(Rm, d.k === 'L' ? LP_LEN + 0.25 : bondLen(d) + ballR(d.lig)); });
    cx = W / 2; cy = H / 2 + H * 0.02;
    scale = Math.min(W, H) * 0.4 / Rm;
  }
  /** 一個電子域在 2D 上的「把手」位置（原子中心或孤對電子瓣的尖端附近） */
  function handleOf(d) {
    const L = d.k === 'L' ? LP_LEN * 0.8 : bondLen(d);
    return proj([d.u[0] * L, d.u[1] * L, d.u[2] * L]);
  }
  /** 2D 放手的位置落在哪一個電子域「開始拖之前」的握把上（和點選用同樣的半徑）；沒有就傳回 null */
  function dropTarget2D(pt, dragId) {
    if (!state.drag || !state.drag.all) return null;
    let best = null, bd = Infinity;
    state.doms.forEach(function (d, k) {
      if (d.id === dragId || !state.drag.all[k]) return;
      const h = handleOf({ k: d.k, lig: d.lig, bo: d.bo, u: state.drag.all[k] });
      const r = Math.max(16, (d.k === 'L' ? 0.32 : ballR(d.lig)) * scale * h.f + 4);
      const dist = Math.hypot(pt.x - h.x, pt.y - h.y);
      if (dist <= r && dist < bd) { bd = dist; best = d.id; }
    });
    return best;
  }
  function hitDomain(x, y) {
    let best = null;
    state.doms.forEach(function (d) {
      const h = handleOf(d);
      const r = Math.max(16, (d.k === 'L' ? 0.32 : ballR(d.lig)) * scale * h.f + 4);
      const dist = Math.hypot(x - h.x, y - h.y);
      if (dist <= r && (!best || h.z > best.z)) best = { d: d, z: h.z };
    });
    return best ? best.d : null;
  }

  function drawAll() {
    draw2D();
    drawLewis();
    drawEnergy();
  }
  function draw2D() {
    if (stage.classList.contains('is3d')) return;
    fitScale();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(ctx, W, H);
    const cen = state.spec.center, rc = ballR(cen);
    const labels = ligLabels();
    // 依深度排序：在中心原子後面的先畫
    const items = state.doms.map(function (d, i) {
      const L = d.k === 'L' ? LP_LEN * 0.55 : bondLen(d);
      const v = apply(state.R, [d.u[0] * L, d.u[1] * L, d.u[2] * L]);
      return { d: d, i: i, z: v[2] };
    });
    items.sort(function (a, b) { return a.z - b.z; });
    // 電子對幾何（示意多面體）在最底層
    if (state.show.poly) drawPoly();
    // 地面陰影（分子下方的柔和橢圓）
    D.contactShadow(ctx, cx, cy + scale * 2.05, scale * 1.15, 0.35);
    const back = items.filter(function (it) { return it.z < 0; }), front = items.filter(function (it) { return it.z >= 0; });
    back.forEach(function (it) { drawItem(it, labels); });
    const c0 = proj([0, 0, 0]);
    D.ball(ctx, c0.x, c0.y, rc * scale * c0.f, C.el[cen], { glow: C.dark ? 0.25 : 0 });
    atomText(cen, '', c0.x, c0.y, rc * scale * c0.f, C.el[cen]);
    front.forEach(function (it) { drawItem(it, labels); });
    drawAngleArc();
    drawDipoles();
    drawHud2D();
    drawKbdFocus();
  }
  function depthFade(color, z) {
    // 越後面越淡（往背景色混合），前面保持原色
    const k = Math.max(0, Math.min(0.42, -z * 0.16));
    return mix(color, C['canvas-bg'], k);
  }
  function drawItem(it, labels) {
    const d = it.d;
    if (d.k === 'L') { if (state.show.lp) drawLobe(d); return; }
    const cen = state.spec.center, rc = ballR(cen), L = bondLen(d), rl = ballR(d.lig);
    const a3 = [d.u[0] * rc * 0.9, d.u[1] * rc * 0.9, d.u[2] * rc * 0.9];
    const b3 = [d.u[0] * (L - rl * 0.6), d.u[1] * (L - rl * 0.6), d.u[2] * (L - rl * 0.6)];
    const A = proj(a3), B = proj(b3), P = proj([d.u[0] * L, d.u[1] * L, d.u[2] * L]);
    const dz = apply(state.R, d.u)[2]; // 鍵朝向觀看者的程度（−1 到 1）
    const sel = state.sel.indexOf(d.id) >= 0;
    const bc = sel ? C.accent : depthFade(C['ms-bond'], dz);
    const wB = Math.max(3, 0.2 * scale * P.f);
    if (d.bo >= 2) drawMulti(A, B, d.bo, bc, wB * 0.55);
    else if (dz > 0.34) wedge(A, B, bc, wB);
    else if (dz < -0.34) hashed(A, B, bc, wB);
    else D.tube(ctx, function (g) { g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); }, bc, Math.max(3, 0.13 * scale * P.f));
    const r = rl * scale * P.f;
    const col = depthFade(C.el[d.lig], dz * 1.2);
    if (sel) {
      ctx.save();
      ctx.strokeStyle = alpha(C.accent, 0.9); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(P.x, P.y, r + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    if (state.hover === d.id || (state.drag && state.drag.id === d.id)) {
      ctx.save();
      ctx.fillStyle = alpha(C.accent, 0.16);
      ctx.beginPath(); ctx.arc(P.x, P.y, r + 7, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    D.ball(ctx, P.x, P.y, r * (state.drag && state.drag.id === d.id ? 1.08 : 1), col, { glow: C.dark ? 0.2 : 0 });
    atomText(d.lig, labels[it.i] ? labels[it.i].sub : '', P.x, P.y, r, col);
  }
  function atomText(el, sub, x, y, r, col) {
    const px = Math.max(10, Math.min(18, r * 0.95));
    const ink = lum(col) > 0.55 ? '#1d2930' : '#ffffff';
    ctx.save();
    ctx.font = fnt(px, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w1 = ctx.measureText(el).width;
    ctx.font = fnt(px * 0.62, 700);
    const w2 = sub ? ctx.measureText(sub).width : 0;
    const x0 = x - (w1 + w2) / 2;
    ctx.textAlign = 'left';
    ctx.font = fnt(px, 700);
    ctx.fillStyle = ink;
    ctx.fillText(el, x0, y + 0.5);
    if (sub) { ctx.font = fnt(px * 0.62, 700); ctx.fillText(sub, x0 + w1 + 0.5, y + px * 0.32); }
    ctx.restore();
  }
  /** 實心楔形：窄端在中心原子、寬端在鍵結原子（朝向觀看者） */
  function wedge(A, B, color, w) {
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    ctx.save();
    const g = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
    g.addColorStop(0, shade(color, 0.12)); g.addColorStop(1, shade(color, -0.12));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(A.x + nx * 1, A.y + ny * 1);
    ctx.lineTo(B.x + nx * w, B.y + ny * w);
    ctx.lineTo(B.x - nx * w, B.y - ny * w);
    ctx.lineTo(A.x - nx * 1, A.y - ny * 1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = alpha(shade(color, -0.35), 0.6); ctx.lineWidth = 0.8; ctx.stroke();
    ctx.restore();
  }
  /** 虛線楔形（一條條橫線，越遠越寬）：遠離觀看者 */
  function hashed(A, B, color, w) {
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const n = Math.max(4, Math.round(L / 5));
    ctx.save();
    ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let k = 1; k <= n; k++) {
      const t = k / n, x = A.x + dx * t, y = A.y + dy * t, h = 1 + (w - 1) * t;
      ctx.moveTo(x + nx * h, y + ny * h); ctx.lineTo(x - nx * h, y - ny * h);
    }
    ctx.stroke();
    ctx.restore();
  }
  function drawMulti(A, B, bo, color, w) {
    const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const gap = Math.max(4, w * 1.5);
    for (let k = 0; k < bo; k++) {
      const o = (k - (bo - 1) / 2) * gap;
      D.tube(ctx, function (g) { g.moveTo(A.x + nx * o, A.y + ny * o); g.lineTo(B.x + nx * o, B.y + ny * o); }, color, Math.max(2.5, w));
    }
  }
  /** 孤對電子：從中心原子長出來的半透明瓣（正對觀看者時看起來是圓的），尖端附近畫兩個電子 */
  function drawLobe(d) {
    const tip = proj([d.u[0] * LP_LEN, d.u[1] * LP_LEN, d.u[2] * LP_LEN]);
    const o = proj([0, 0, 0]);
    const vx = tip.x - o.x, vy = tip.y - o.y, Lp = Math.hypot(vx, vy);
    const wpx = 0.36 * scale * tip.f;
    const ang = Math.atan2(vy, vx);
    const semiA = Math.max(wpx, Lp * 0.56), semiB = wpx;
    const mx = o.x + vx * 0.5, my = o.y + vy * 0.5;
    const dz = apply(state.R, d.u)[2];
    const hot = state.hover === d.id || (state.drag && state.drag.id === d.id);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(ang);
    const g = ctx.createRadialGradient(semiA * 0.35, -semiB * 0.25, semiB * 0.1, 0, 0, semiA);
    const a0 = (C.dark ? 0.55 : 0.42) * (dz < 0 ? 0.75 : 1) + (hot ? 0.15 : 0);
    g.addColorStop(0, alpha(shade(C['ms-lp'], 0.45), a0));
    g.addColorStop(0.7, alpha(C['ms-lp'], a0 * 0.75));
    g.addColorStop(1, alpha(C['ms-lp'], a0 * 0.35));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, semiA, semiB, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = alpha(C['ms-lp'], hot ? 0.95 : 0.6); ctx.lineWidth = hot ? 2 : 1.1;
    ctx.stroke();
    ctx.restore();
    // 兩個電子：在瓣的外側三分之一，垂直於瓣的方向排開
    const ex = o.x + vx * 0.72, ey = o.y + vy * 0.72;
    const nx = Lp > 1 ? -vy / Lp : 1, ny = Lp > 1 ? vx / Lp : 0;
    const sep = Math.max(3.2, 0.11 * scale * tip.f);
    [-1, 1].forEach(function (s) { D.ball(ctx, ex + nx * sep * s, ey + ny * sep * s, Math.max(2.2, 0.055 * scale * tip.f), C['ms-lp'], { shadow: false, glow: 0 }); });
  }
  function drawPoly() {
    const Uc = U(), h = VC.hull(Uc);
    let Rp = 0;
    state.doms.forEach(function (d) { Rp += d.k === 'L' ? LP_LEN : bondLen(d); });
    Rp /= Math.max(1, state.doms.length);
    const pts = Uc.map(function (u) { return proj([u[0] * Rp, u[1] * Rp, u[2] * Rp]); });
    ctx.save();
    h.faces.forEach(function (f) {
      ctx.fillStyle = alpha(C['ms-poly'], C.dark ? 0.05 : 0.04);
      ctx.beginPath(); ctx.moveTo(pts[f[0]].x, pts[f[0]].y); ctx.lineTo(pts[f[1]].x, pts[f[1]].y); ctx.lineTo(pts[f[2]].x, pts[f[2]].y); ctx.closePath(); ctx.fill();
    });
    h.edges.forEach(function (e) {
      const a = pts[e[0]], b = pts[e[1]], back = (a.z + b.z) / 2 < 0;
      ctx.strokeStyle = alpha(C['ms-poly'], back ? 0.35 : 0.65);
      ctx.lineWidth = 1.3;
      ctx.setLineDash(back ? [4, 4] : []);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    });
    ctx.setLineDash([]);
    pts.forEach(function (p) { ctx.fillStyle = alpha(C['ms-poly'], 0.6); ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
  }
  /** 量到的鍵角：兩個鍵之間的弧（真正的 3D 圓弧投影上來）與角度標籤 */
  function arcPoints(i, j, r, n) {
    const a = state.doms[i].u, b = state.doms[j].u;
    const th = Math.acos(Math.max(-1, Math.min(1, VC.dot(a, b))));
    let ax = VC.cross(a, b);
    if (VC.norm(ax) < 1e-6) ax = VC.cross(a, Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
    ax = VC.unit(ax);
    const out = [];
    for (let k = 0; k <= n; k++) { const v = VC.rotate(a, ax, th * k / n); out.push([v[0] * r, v[1] * r, v[2] * r]); }
    return { pts: out, th: th };
  }
  function drawAngleArc() {
    if (state.sel.length !== 2) return;
    const i = domIndex(state.sel[0]), j = domIndex(state.sel[1]);
    if (i < 0 || j < 0) return;
    const r = 0.62 * Math.min(bondLen(state.doms[i]), bondLen(state.doms[j]));
    const A = arcPoints(i, j, r, 40);
    const P = A.pts.map(proj);
    const o = proj([0, 0, 0]);
    ctx.save();
    ctx.fillStyle = alpha(C.accent, 0.14);
    ctx.beginPath(); ctx.moveTo(o.x, o.y); P.forEach(function (p) { ctx.lineTo(p.x, p.y); }); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.accent; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); P.forEach(function (p, k) { if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.stroke();
    ctx.restore();
    const mid = A.pts[20], m3 = VC.unit(mid);
    const lab = proj([m3[0] * (r + 0.42), m3[1] * (r + 0.42), m3[2] * (r + 0.42)]);
    D.pill(ctx, deg(A.th * VC.DEG), lab.x, lab.y + 9, C.accent, 'center', fnt(13, 700));
  }
  /** 偶極箭頭：每個鍵的偶極（由 δ+ 指向 δ−，長度 ∝ 電負度差）與淨偶極 */
  const DIP_K = 1.1; // 每 1 單位電負度差畫成 1.1 Å
  function drawDipoles() {
    const info = currentDipole();
    if (state.show.bd) {
      state.doms.forEach(function (d, i) {
        const v = info.bonds[i];
        if (!v) return;
        const q = VC.norm(v);
        if (q < 0.02) return;
        const L = bondLen(d), toLig = VC.dot(v, d.u) > 0;
        const s0 = toLig ? 0.3 : 0.85, s1 = toLig ? Math.min(0.92, 0.3 + q * DIP_K / L) : Math.max(0.2, 0.85 - q * DIP_K / L);
        const off = perp2D(d.u, 0.26);
        const a = proj([d.u[0] * L * s0 + off[0], d.u[1] * L * s0 + off[1], d.u[2] * L * s0 + off[2]]);
        const b = proj([d.u[0] * L * s1 + off[0], d.u[1] * L * s1 + off[1], d.u[2] * L * s1 + off[2]]);
        D.arrow(ctx, a.x, a.y, b.x, b.y, C['ms-dip'], 2);
        // 偶極符號尾端的「+」：一小段垂直線
        const dx = b.x - a.x, dy = b.y - a.y, Lp = Math.hypot(dx, dy);
        if (Lp > 8) {
          const nx = -dy / Lp * 4.5, ny = dx / Lp * 4.5, tx = a.x + dx / Lp * 4, ty = a.y + dy / Lp * 4;
          ctx.save(); ctx.strokeStyle = C['ms-dip']; ctx.lineWidth = 2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(tx + nx, ty + ny); ctx.lineTo(tx - nx, ty - ny); ctx.stroke(); ctx.restore();
        }
      });
    }
    if (state.show.net) {
      const o = proj([0, 0, 0]);
      if (info.mag < 0.01 * info.sumAbs + 1e-6 || info.mag < 1e-3) {
        if (state.settled) D.pill(ctx, T('淨偶極 = 0', 'net dipole = 0'), o.x, H - 12, C['ms-dip'], 'center', fnt(12.5, 600));
      } else {
        const v = VC.unit(info.net), L = Math.max(0.5, Math.min(2.6, info.mag * DIP_K * 1.2));
        const start = proj([-v[0] * 0.15, -v[1] * 0.15, -v[2] * 0.15]);
        const tip = proj([v[0] * L, v[1] * L, v[2] * L]);
        D.arrow(ctx, start.x, start.y, tip.x, tip.y, C['ms-dip'], 3.6, { label: 'μ', lx: (tip.x - start.x) / Math.max(1, Math.hypot(tip.x - start.x, tip.y - start.y)) * 14, ly: (tip.y - start.y) / Math.max(1, Math.hypot(tip.x - start.x, tip.y - start.y)) * 14 });
      }
    }
  }
  /** 和鍵垂直、而且盡量平行螢幕的偏移（3D 向量，長度 s Å） */
  function perp2D(u, s) {
    const toViewer = applyT(state.R, [0, 0, 1]);
    let p = VC.cross(u, toViewer);
    if (VC.norm(p) < 1e-3) p = VC.cross(u, [0, 0, 1]);
    p = VC.unit(p);
    return [p[0] * s, p[1] * s, p[2] * s];
  }
  function currentDipole() { return VC.dipole(state.spec, state.doms, U()); }
  function drawHud2D() {
    const info = state.info || analyze();
    const f = VC.formula(state.spec);
    ctx.save();
    // 左上：化學式與形狀
    const t1 = f.text.replace(/(\d)/g, '$1') ;
    void t1;
    hudFormula(10, 12, f);
    D.pill(ctx, shapeName(info.shape), 10, 56, C.muted, 'left', fnt(12.5, 600));
    // 右上：狀態
    const st = state.settled ? (info.isGlobal ? T('能量最低', 'lowest energy') : T('局部最低', 'local minimum')) : T('調整中…', 'moving…');
    D.pill(ctx, st, W - 10, 32, state.settled ? (info.isGlobal ? C.probe : C.pos) : C.muted, 'right', fnt(12.5, 700));
    ctx.restore();
  }
  /** 畫布上的化學式：數字畫成小一號的下標，電荷畫成上標（畫布不可用 Unicode 上下標字元） */
  function hudFormula(x, y, f) {
    const big = fnt(17, 700), small = fnt(11.5, 700);
    ctx.font = big;
    let w = 0;
    f.parts.forEach(function (p) { ctx.font = big; w += ctx.measureText(p.el).width; if (p.n > 1) { ctx.font = small; w += ctx.measureText(String(p.n)).width + 1; } });
    const q = f.charge ? (Math.abs(f.charge) > 1 ? Math.abs(f.charge) : '') + (f.charge > 0 ? '+' : '−') : '';
    if (q) { ctx.font = small; w += ctx.measureText(q).width + 2; }
    D.roundRect(ctx, x, y, w + 16, 30, 15);
    ctx.fillStyle = alpha(C['canvas-bg'], C.dark ? 0.86 : 0.9); ctx.fill();
    ctx.strokeStyle = alpha(C.muted, 0.35); ctx.lineWidth = 1; ctx.stroke();
    let xx = x + 8;
    ctx.fillStyle = C.text; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    f.parts.forEach(function (p) {
      ctx.font = big; ctx.fillText(p.el, xx, y + 21); xx += ctx.measureText(p.el).width;
      if (p.n > 1) { ctx.font = small; ctx.fillText(String(p.n), xx + 0.5, y + 25); xx += ctx.measureText(String(p.n)).width + 1; }
    });
    if (q) { ctx.font = small; ctx.fillText(q, xx + 1, y + 12); }
  }

  // ---------- 2D 的拖曳、點選、旋轉 ----------
  let ptr = null;
  function evPos(ev) { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  /** 螢幕上的點 → 電子域的新方向（在半徑 r 的球面上；超出球的輪廓就貼在輪廓上，從輪廓回來會換到另一個半球） */
  function screenToDir(x, y, d) {
    const r = d.k === 'L' ? LP_LEN * 0.8 : bondLen(d);
    const h = handleOf(d);
    const f = h.f;
    let vx = (x - cx) / (scale * f) / r, vy = -(y - cy) / (scale * f) / r;
    const q = vx * vx + vy * vy;
    let vz;
    if (q >= 1) { const k = 1 / Math.sqrt(q); vx *= k; vy *= k; vz = 0; ptr.rim = true; }
    else {
      let sgn = ptr.hemi;
      if (ptr.rim) { sgn = -sgn; ptr.hemi = sgn; ptr.rim = false; }
      vz = sgn * Math.sqrt(1 - q);
    }
    return VC.unit(applyT(state.R, [vx, vy, vz]));
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (ev.button !== 0) return;
    const p = evPos(ev);
    const d = hitDomain(p.x, p.y);
    ptr = { id: ev.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y, dom: d ? d.id : null, moved: false, rim: false, hemi: 1 };
    if (d) ptr.hemi = apply(state.R, d.u)[2] >= 0 ? 1 : -1;
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    ev.preventDefault();
  });
  cv.addEventListener('pointermove', function (ev) {
    const p = evPos(ev);
    if (!ptr || ev.pointerId !== ptr.id) {
      if (ev.pointerType !== 'touch') {
        const d = hitDomain(p.x, p.y), id = d ? d.id : null;
        if (id !== state.hover) { state.hover = id; cv.classList.toggle('on-dom', !!id); if (!state.moving) draw2D(); }
      }
      return;
    }
    const dx = p.x - ptr.x, dy = p.y - ptr.y;
    if (!ptr.moved && Math.hypot(p.x - ptr.x0, p.y - ptr.y0) < 5) return;
    if (!ptr.moved) {
      ptr.moved = true;
      if (ptr.dom != null) beginDrag(ptr.dom, false);
      cv.classList.add('dragging');
    }
    ptr.x = p.x; ptr.y = p.y;
    if (ptr.dom != null) {
      const i = domIndex(ptr.dom);
      if (i >= 0) dragTo(ptr.dom, screenToDir(p.x, p.y, state.doms[i]));
    } else {
      // 拖曳空白處：轉動整個分子（只是換視角，電子域不動）
      const k = 0.0105;
      state.R = matMul(rotM([0, 1, 0], dx * k), state.R);
      state.R = matMul(rotM([1, 0, 0], dy * k), state.R);
      orthonormalize();
      if (!state.moving) drawAll();
    }
    ev.preventDefault();
  });
  function pointerEnd(ev) {
    if (!ptr || ev.pointerId !== ptr.id) return;
    const p = ptr;
    ptr = null;
    cv.classList.remove('dragging');
    if (p.moved && p.dom != null) endDrag(dropTarget2D(evPos(ev), p.dom));
    else if (p.moved) onViewChanged('2d');
    else if (p.dom != null) {
      const d = state.doms[domIndex(p.dom)];
      if (d && d.k === 'B') toggleSel(d.id);
      else setStatus(T('孤對電子不是鍵，沒有鍵角；請點鍵結原子。', 'A lone pair is not a bond and has no bond angle: tap a bonded atom.'));
    }
  }
  cv.addEventListener('pointerup', pointerEnd);
  cv.addEventListener('pointercancel', pointerEnd);
  cv.addEventListener('pointerleave', function () { if (!ptr && state.hover != null) { state.hover = null; cv.classList.remove('on-dom'); if (!state.moving) draw2D(); } });
  function orthonormalize() {
    const R = state.R;
    let x = VC.unit(R[0]), y = R[1];
    const p = VC.dot(x, y);
    y = VC.unit([y[0] - p * x[0], y[1] - p * x[1], y[2] - p * x[2]]);
    state.R = [x, y, VC.cross(x, y)];
  }

  // 拖曳電子域（2D、3D、鍵盤共用）
  function beginDrag(id, kbd) {
    const i = domIndex(id);
    if (i < 0) return;
    state.drag = { id: id, start: state.doms[i].u.slice(), all: U().map(function (u) { return u.slice(); }), max: 0, kbd: !!kbd };
    state.anneal = null;
    state.present = null;
    state.cause = 'drag';
    state.user = true;
    state.moving = true; state.settled = false;
    setStatus(T('抓住電子域：其他電子域被推開…', 'Holding an electron domain: the others are pushed away…'));
    kick();
  }
  function dragTo(id, u) {
    const i = domIndex(id);
    if (i < 0 || !state.drag) return;
    state.doms[i].u = VC.unit(u);
    state.drag.max = Math.max(state.drag.max, VC.angleDeg(state.drag.start, state.doms[i].u));
    kick();
  }
  /**
   * 放手：dropId 是畫面上放手的位置落在哪一個電子域「開始拖之前的位置」上（2D、3D 由畫面距離判斷）；
   * 沒給（鍵盤）就看方向是否在 SWAP_DEG 以內。落在別人的位置上就兩者換位，再一起推開（見 VC.dropSwap 的說明）。
   */
  function endDrag(dropId) {
    if (!state.drag) return;
    state.dragAngle = state.drag.max;
    const i = domIndex(state.drag.id);
    const sw = i < 0 ? null : (dropId != null ? VC.swapDomains(state.drag.all, i, domIndex(dropId)) : VC.dropSwap(state.drag.all, i, state.doms[i].u, SWAP_DEG));
    if (sw) state.doms.forEach(function (d, k) { d.u = sw.U[k]; });
    state.drag = null;
    state.autoShakes = 3; // 放手後停在哪裡就是哪裡（可能是局部最低點）
    lastMeasureKey = '';
    state.cause = 'drag'; state.user = true;
    state.moving = true; state.settled = false;
    setStatus(sw
      ? T('放在另一個電子域原本的位置：兩個交換位置，再互相推開…', 'Dropped on another domain’s place: the two swap places, then push each other and settle…')
      : T('放手了：電子域互相推開，正在穩定下來…', 'Let go: the domains push each other and settle…'));
    kick();
  }
  /** 視角轉完：看視線和哪個鍵最接近平行（隱藏任務） */
  function onViewChanged(mode, viewDir) {
    const dir = viewDir || applyT(state.R, [0, 0, 1]);
    let along = 180;
    state.doms.forEach(function (d) { if (d.k === 'B') along = Math.min(along, VC.angleDeg(d.u, dir), 180 - VC.angleDeg(d.u, dir)); });
    emit('view', { along: along, settled: state.settled, m: state.spec.ligs.length, mode: mode });
  }

  // 鍵盤：Enter 選擇物件（視角、各個電子域），方向鍵移動
  let kb = null;
  const kbItems = [];
  let kbTimer = 0;
  function refreshKbItems() {
    kbItems.length = 0;
    kbItems.push({
      name: function () { return T('視角', 'View'); },
      move: function (dx, dy, big) {
        const a = (big ? 15 : 5) * Math.PI / 180;
        if (dx) state.R = matMul(rotM([0, 1, 0], dx * a), state.R);
        if (dy) state.R = matMul(rotM([1, 0, 0], -dy * a), state.R);
        orthonormalize();
        clearTimeout(kbTimer);
        kbTimer = setTimeout(function () { onViewChanged('2d'); }, 500);
        drawAll();
        return true;
      },
      describe: function () { return T('方向鍵轉動分子', 'Arrow keys turn the molecule'); }
    });
    const labels = ligLabels();
    state.doms.forEach(function (d, i) {
      kbItems.push({
        name: function () { return d.k === 'L' ? T('孤對電子', 'Lone pair') : T('鍵結原子 ', 'Bonded atom ') + labelText(labels[i]); },
        move: function (dx, dy, big) {
          const j = domIndex(d.id);
          if (j < 0) return false;
          if (!state.drag || state.drag.id !== d.id) beginDrag(d.id, true);
          const a = (big ? 12 : 4) * Math.PI / 180;
          let u = state.doms[j].u;
          if (dx) u = VC.rotate(u, applyT(state.R, [0, 1, 0]), dx * a);
          if (dy) u = VC.rotate(u, applyT(state.R, [1, 0, 0]), -dy * a);
          dragTo(d.id, u);
          clearTimeout(kbTimer);
          kbTimer = setTimeout(function () { if (state.drag && state.drag.kbd) endDrag(); }, 700);
          return true;
        },
        describe: function () {
          const j = domIndex(d.id);
          return j < 0 ? '' : (d.k === 'L' ? T('孤對電子', 'Lone pair') : labelText(labels[i])) + T('，按住方向鍵移動，放開後其他電子域會重新排好', ': hold the arrow keys to move it; when you stop, the domains rearrange');
        }
      });
    });
    if (kb) kb.select(0);
  }
  function drawKbdFocus() {
    if (!kb || !kb.focused()) return;
    const k = kb.index();
    ctx.save();
    ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    if (k === 0) { D.roundRect(ctx, 4, 4, W - 8, H - 8, 10); ctx.stroke(); }
    else {
      const d = state.doms[k - 1];
      if (d) { const h = handleOf(d); ctx.beginPath(); ctx.arc(h.x, h.y, Math.max(18, (d.k === 'L' ? 0.4 : ballR(d.lig)) * scale * h.f + 7), 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.restore();
  }

  // =====================================================================
  // 路易斯結構
  // =====================================================================
  const lcv = $('lcv'), lctx = lcv.getContext('2d');
  let LW = 300, LH = 225;
  const ecv = $('ecv'), ectx = ecv.getContext('2d');
  let EW = 300, EH = 225;
  function sizeSub() {
    [[lcv, 'L'], [ecv, 'E']].forEach(function (p) {
      const r = p[0].getBoundingClientRect();
      if (!r.width) return;
      p[0].width = Math.round(r.width * dpr); p[0].height = Math.round(r.height * dpr);
      if (p[1] === 'L') { LW = r.width; LH = r.height; } else { EW = r.width; EH = r.height; }
    });
  }
  /** 路易斯結構的版面：每種電子域數的位置（度，0 = 右、90 = 上），孤對電子優先放的位置與鍵優先放的位置 */
  function lewisSlots(m, n) {
    const N = m + n;
    let slots, lpPref, bPref;
    if (N === 2) { slots = [180, 0]; lpPref = [0, 180]; bPref = [180, 0]; }
    else if (N === 3) { slots = [90, 210, 330]; lpPref = [90, 330, 210]; bPref = [210, 330, 90]; }
    else if (N === 4) { slots = [90, 180, 270, 0]; lpPref = [90, 270, 0, 180]; bPref = [180, 0, 270, 90]; }
    else if (N === 5) {
      if (n === 0) return { b: [90, 162, 234, 306, 18], l: [] };
      if (n === 1) return { b: [135, 45, 225, 315], l: [90] };
      if (n === 2) return { b: [180, 0, 270], l: [60, 120] };
      return { b: [180, 0], l: [60, 120, 270] };
    } else {
      slots = [90, 150, 210, 270, 330, 30];
      if (n === 0) return { b: slots, l: [] };
      if (n === 1) return { b: [150, 210, 270, 330, 30], l: [90] };
      if (n === 2) return { b: [150, 210, 330, 30], l: [90, 270] };
      return { b: [30, 150, 270], l: [90, 210, 330] };
    }
    const l = lpPref.slice(0, n);
    const b = bPref.filter(function (a) { return l.indexOf(a) < 0; }).slice(0, m);
    return { b: b, l: l };
  }
  function drawLewis() {
    const g = lctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(g, LW, LH);
    const spec = state.spec, lw = VC.lewis(spec);
    const m = spec.ligs.length, n = spec.lp;
    const sl = lewisSlots(m, n);
    const ox = LW / 2, oy = LH / 2 + 4;
    const R = Math.min(LW, LH) * 0.3;
    const fs = Math.max(13, Math.min(22, Math.min(LW, LH) * 0.085));
    const ink = C.text;
    const dot = function (x, y) { g.fillStyle = ink; g.beginPath(); g.arc(x, y, Math.max(1.8, fs * 0.11), 0, Math.PI * 2); g.fill(); };
    const pairAt = function (x, y, angDeg, dist, sep) {
      const a = angDeg * Math.PI / 180, ux = Math.cos(a), uy = -Math.sin(a), nx = -uy, ny = ux;
      const px = x + ux * dist, py = y + uy * dist;
      dot(px + nx * sep, py + ny * sep); dot(px - nx * sep, py - ny * sep);
    };
    const sym = function (t, x, y, col) {
      g.font = fnt(fs, 700); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col || ink; g.fillText(t, x, y + 1);
    };
    // 中心原子
    sym(spec.center, ox, oy, mix(C.el[spec.center], ink, 0.55));
    // 中心原子的孤對電子
    sl.l.forEach(function (a) { pairAt(ox, oy, a, fs * 0.82, fs * 0.2); });
    // 鍵與鍵結原子（含它們的孤對電子）
    spec.ligs.forEach(function (x, i) {
      const a = sl.b[i] * Math.PI / 180, ux = Math.cos(a), uy = -Math.sin(a), nx = -uy, ny = ux;
      const bo = VC.LIGANDS[x].bo;
      const r0 = fs * 0.62, r1 = R - fs * 0.62;
      g.strokeStyle = ink; g.lineWidth = Math.max(1.6, fs * 0.09); g.lineCap = 'round';
      for (let k = 0; k < bo; k++) {
        const o = (k - (bo - 1) / 2) * fs * 0.24;
        g.beginPath(); g.moveTo(ox + ux * r0 + nx * o, oy + uy * r0 + ny * o); g.lineTo(ox + ux * r1 + nx * o, oy + uy * r1 + ny * o); g.stroke();
      }
      const lx = ox + ux * R, ly = oy + uy * R;
      sym(x, lx, ly, mix(C.el[x], ink, 0.55));
      const nlp = lw.outerLP[i];
      const base = sl.b[i];
      const dirs = nlp === 3 ? [base, base + 90, base - 90] : nlp === 2 ? [base + 60, base - 60] : [];
      dirs.forEach(function (ad) { pairAt(lx, ly, ad, fs * 0.82, fs * 0.2); });
    });
    // 電荷：離子加中括號與電荷
    if (lw.charge) {
      const q = (Math.abs(lw.charge) > 1 ? Math.abs(lw.charge) : '') + (lw.charge > 0 ? '+' : '−');
      const ext = R + fs * 1.25;
      g.strokeStyle = ink; g.lineWidth = 1.6;
      const bx0 = Math.max(4, ox - ext), bx1 = Math.min(LW - 18, ox + ext), by0 = Math.max(6, oy - ext * 0.92), by1 = Math.min(LH - 6, oy + ext * 0.92);
      g.beginPath();
      g.moveTo(bx0 + 7, by0); g.lineTo(bx0, by0); g.lineTo(bx0, by1); g.lineTo(bx0 + 7, by1);
      g.moveTo(bx1 - 7, by0); g.lineTo(bx1, by0); g.lineTo(bx1, by1); g.lineTo(bx1 - 7, by1);
      g.stroke();
      g.font = fnt(fs * 0.75, 700); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = ink;
      g.fillText(q, bx1 + 3, by0 + 3);
    }
    // 角落：價電子總數
    g.font = fnt(12, 600); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    D.haloText(g, T('價電子共 ', 'Valence electrons: ') + lw.total, 8, LH - 9, C.muted, 'left', 'alphabetic', fnt(12, 600));
  }

  // =====================================================================
  // 能量隨時間（最近 8 秒的模擬時間）
  // =====================================================================
  function drawEnergy() {
    const g = ectx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(g, EW, EH);
    const padL = 12, padR = 12, padT = 30, padB = 26;
    const x0 = padL, x1 = EW - padR, y0 = padT, y1 = EH - padB;
    const Eg = state.glob ? state.glob.E : 0;
    const span = 8;
    const tEnd = state.hist.length ? state.hist[state.hist.length - 1].t : 0, tStart = tEnd - span;
    const pts = state.hist.filter(function (p) { return p.t >= tStart; });
    let Emax = Eg * 1.02 + 1e-6;
    pts.forEach(function (p) { Emax = Math.max(Emax, p.E); });
    const Emin = Eg - (Emax - Eg) * 0.12;
    const X = function (t) { return x0 + (t - tStart) / span * (x1 - x0); };
    const Y = function (E) { return y1 - (E - Emin) / (Emax - Emin) * (y1 - y0); };
    D.grid(g, x0, y0, x1, y1, (x1 - x0) / 4, 0, x0, y1);
    // 最低能量（虛線）
    g.save();
    g.strokeStyle = alpha(C.probe, 0.9); g.lineWidth = 1.5; g.setLineDash([6, 4]);
    g.beginPath(); g.moveTo(x0, Y(Eg)); g.lineTo(x1, Y(Eg)); g.stroke();
    g.restore();
    D.haloText(g, T('最低能量', 'lowest energy'), x1 - 2, Y(Eg) + 14, C.probe, 'right', 'alphabetic', fnt(11.5, 600));
    if (pts.length > 1) {
      g.save();
      const grad = g.createLinearGradient(0, y0, 0, y1);
      grad.addColorStop(0, alpha(C.accent, 0.28)); grad.addColorStop(1, alpha(C.accent, 0.02));
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(X(pts[0].t), y1);
      pts.forEach(function (p) { g.lineTo(X(p.t), Y(p.E)); });
      g.lineTo(X(pts[pts.length - 1].t), y1); g.closePath(); g.fill();
      g.strokeStyle = C.accent; g.lineWidth = 2.2; g.lineJoin = 'round';
      g.beginPath(); pts.forEach(function (p, k) { if (k) g.lineTo(X(p.t), Y(p.E)); else g.moveTo(X(p.t), Y(p.E)); }); g.stroke();
      const lp = pts[pts.length - 1];
      D.ball(g, X(lp.t), Y(lp.E), 4, C.accent, { shadow: false });
      g.restore();
    }
    const Enow = pts.length ? pts[pts.length - 1].E : (state.info ? state.info.E : Eg);
    D.pill(g, 'E = ' + num(Enow, 3), 8, 24, C.accent, 'left', fnt(12.5, 700));
    D.pill(g, 'ΔE = ' + num(Math.max(0, Enow - Eg), 4), EW - 8, 24, C.muted, 'right', fnt(12, 600));
    D.haloText(g, T('模擬時間（最近 8 秒）→', 'simulation time (last 8 s) →'), x0, EH - 8, C.muted, 'left', 'alphabetic', fnt(11.5, 500));
  }

  // =====================================================================
  // 3D 檢視：切換到 3D 時才載入 js/molecular-shapes-3d.js 與 three.js（以 import() 動態載入）；切回 2D 時整個釋放
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    VC: VC, T: T, D: D, state: state, reducedMotion: reducedMotion, LP_LEN: LP_LEN,
    colors: function () { return C; },
    bondLen: bondLen, ballR: ballR, ligLabels: ligLabels, labelHTML: labelHTML, shapeName: shapeName, num: num, deg: deg,
    formulaHTML: formulaHTML, defaultView: defaultView,
    analyze: function () { return state.info || analyze(); },
    dipole: currentDipole, DIP_K: DIP_K,
    stateText: function () { return state.settled ? ((state.info && state.info.isGlobal) ? 'ok' : 'warn') : 'm'; },
    dragStart: function (id) { beginDrag(id, false); },
    dragTo: function (id, u) { dragTo(id, u); },
    dragEnd: function (dropId) { endDrag(dropId); },
    /** 拖曳中：各電子域開始拖之前的方向（3D 判斷放在誰原本的位置上） */
    dragFrom: function () { return state.drag && state.drag.all ? state.doms.map(function (d, k) { return { id: d.id, d: d, u: state.drag.all[k] }; }) : null; },
    pick: function (id) {
      const d = state.doms[domIndex(id)];
      if (d && d.k === 'B') toggleSel(id);
      else setStatus(T('孤對電子不是鍵，沒有鍵角；請點鍵結原子。', 'A lone pair is not a bond and has no bond angle: tap a bonded atom.'));
    },
    rotated: function (dir) { onViewChanged('3d', dir); },
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
      if (window.Vsepr3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Vsepr3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/molecular-shapes-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Vsepr3D) throw new Error('molecular-shapes-3d.js did not load');
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function setPressed(mode) {
    $('view2d').setAttribute('aria-pressed', String(mode === '2d'));
    $('view3d').setAttribute('aria-pressed', String(mode === '3d'));
  }
  function savePref(mode) { try { localStorage.setItem('ms-view', mode); } catch (e) { /* 無法儲存就算了 */ } }
  function setView(mode, auto) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!auto) savePref('3d');
      if (!webglAvailable()) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return; // 載入期間已切回 2D
        stage.classList.add('is3d');
        view3 = window.Vsepr3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      if (!auto) savePref('2d');
      if (view3) {
        // 2D 的視角接續 3D 的視角
        const R = view3.viewMatrix && view3.viewMatrix();
        if (R) state.R = R;
        view3.dispose(); view3 = null;
      }
      stage.classList.remove('is3d');
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () {
    if (view3 && view3.active) view3.resetCamera();
    else { state.R = defaultView(); drawAll(); }
  });

  // =====================================================================
  // 控制項
  // =====================================================================
  document.querySelectorAll('#presets button').forEach(function (b) { b.addEventListener('click', function () { choosePreset(b.dataset.preset); }); });
  $('lpAdd').addEventListener('click', addLP);
  $('lpDel').addEventListener('click', removeLP);
  $('shake').addEventListener('click', shake);
  $('clearAll').addEventListener('click', function () {
    state.sel = [];
    state.hist = state.hist.length ? [state.hist[state.hist.length - 1]] : [];
    lastMeasureKey = '';
    buildBondChips();
    if (view3 && view3.active) view3.update();
    drawAll();
  });
  const elLam = $('lam');
  function fmtLam(v) { return num(v, 3).replace(/0+$/, '').replace(/\.$/, '.0'); }
  function refreshLam() { $('lamo').textContent = fmtLam(val(elLam)); }
  elLam.addEventListener('input', function () {
    state.lam = val(elLam);
    refreshLam();
    rebuildModel();
    state.measureUser = state.measureUser || state.sel.length === 2;
    if (view3 && view3.active) view3.update();
    userChanged('lam');
  });
  [['showLP', 'lp'], ['showNet', 'net'], ['showBD', 'bd'], ['showPoly', 'poly']].forEach(function (p) {
    const el = $(p[0]);
    state.show[p[1]] = el.checked;
    el.addEventListener('change', function () {
      state.show[p[1]] = el.checked;
      if (view3 && view3.active) view3.rebuild();
      drawAll();
    });
  });

  // 分享連結：記下組成與各電子域的方向（滑桿與勾選框由 classroom.js 自動記）
  (window.LAB_SHARE_EXTRAS = window.LAB_SHARE_EXTRAS || []).push({
    get: function () {
      return { c: state.spec.center, l: state.spec.ligs.join(','), p: state.spec.lp, s: state.preset || '',
        u: state.doms.map(function (d) { return d.u.map(function (x) { return +x.toFixed(4); }); }) };
    },
    set: function (v) {
      if (!v || !v.c || !VC.ELEMENTS[v.c]) return;
      const ligs = String(v.l || '').split(',').filter(function (x) { return VC.LIGANDS[x]; });
      const spec = { center: v.c, ligs: ligs, lp: Math.max(0, Math.min(VC.MAX_LP, v.p | 0)) };
      if (!specOK(spec)) return;
      state.preset = VC.preset(v.s) ? v.s : null;
      state.custom = !state.preset;
      applySpec(spec, { scatter: 0, U: Array.isArray(v.u) && v.u.length === spec.ligs.length + spec.lp ? v.u : null });
      startMove('share', false);
    }
  });

  // 說明區的「模型與實驗值」表：用和畫面相同的計算
  function fillCompare() {
    const tb = $('cmpTable');
    if (!tb) return;
    const P0 = VC.params(LAM0);
    const rows = VC.PRESETS.map(function (p) {
      const doms = VC.domainsOf(p);
      const g = VC.globalMin(doms, P0);
      const groups = VC.groupAngles(VC.bondAngles(doms, g.U));
      const f = VC.formula(p);
      const shape = VC.shapeOf(p.ligs.length, p.lp);
      const model = groups.map(function (x) { return deg(x.a); }).join(T('、', ', '));
      const exp = p.exp.map(function (e) { return deg(e.a); }).join(T('、', ', '));
      return '<tr><td>' + formulaHTML(f) + '</td><td>' + shapeName(shape) + '</td><td>' + model + '</td><td>' + exp + '</td></tr>';
    });
    tb.innerHTML = '<tr><th>' + T('分子', 'Molecule') + '</th><th>' + T('分子形狀', 'Shape') + '</th><th>' + T('本模型的鍵角', 'Angles in this model') + '</th><th>' + T('實驗值', 'Experiment') + '</th></tr>' + rows.join('');
  }

  // 給縮圖與測試用的介面（不回報任務事件）
  window.__ms = {
    state: state, VC: VC,
    preset: function (id) { const p = VC.preset(id); if (!p) return; state.preset = id; state.custom = false; applySpec(p, { scatter: 0 }); startMove('init', false); },
    settleNow: function () { let n = 0; while (state.moving && n++ < 2000) step(1 / 60); drawAll(); },
    view: function (m) { setView(m); },
    /** 2D 畫面上第 i 個電子域的握把位置（相對於畫布左上角，CSS px），給端到端測試做真的拖曳 */
    handleXY: function (i) { const h = handleOf(state.doms[i]); return { x: h.x, y: h.y }; },
    /** 拖曳中：畫布座標 (x, y) 放手的話會和誰換位（給端到端測試） */
    view3: function () { return view3; },
    dropAt: function (x, y) { return state.drag ? dropTarget2D({ x: x, y: y }, state.drag.id) : undefined; }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  refreshLam();
  kb = window.LabKeys ? window.LabKeys.attach(cv, {
    label: T('分子的 2D 投影。按 Enter 選擇要移動的物件（視角或某個電子域），方向鍵移動，Shift 加方向鍵移動得更多。',
      '2D projection of the molecule. Press Enter to choose what to move (the view or an electron domain), the arrow keys move it, Shift with an arrow key moves further.'),
    items: kbItems,
    onChange: function () { drawAll(); }
  }) : null;
  // 預設：甲烷，從散開的位置開始，看電子域自己推開、排好（不回報任務）
  applySpec(VC.preset('CH4'), { scatter: reducedMotion ? 0 : 0.9 });
  refreshKbItems();
  updateSoundButton();
  fillCompare();
  updateReadouts();
  startMove('init', false);
  if (reducedMotion) { window.__ms.settleNow(); }
  function themeChanged() {
    readColors();
    paintSwatches();
    for (const id in lastHTML) delete lastHTML[id];
    if (view3 && view3.active) view3.onTheme();
    drawAll();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:langchange', function () { buildBondChips(); buildLigChips(); updateBuilder(); updateReadouts(); fillCompare(); drawAll(); });
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { const w = stage.clientWidth; if (w !== lastW) { lastW = w; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  resize();
  // 3D 是這個實驗的主角：瀏覽器支援 WebGL、而且使用者沒有選過 2D，就在頁面載入後自動切到 3D
  let pref = null;
  try { pref = localStorage.getItem('ms-view'); } catch (e) { pref = null; }
  if (pref !== '2d' && webglAvailable()) setTimeout(function () { setView('3d', true); }, 60);
})();
