/* torque-balance.js — 「力矩與靜力平衡」的畫面與互動（物理計算在 torque-balance-core.js；共用繪圖工具 LabDraw 在 drawkit.js） */
(function () {
  'use strict';
  const TC = window.TorqueCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const G = TC.G, D2R = TC.D2R;
  const SS = TC.SEESAW, KINDS = TC.KINDS, LADDER = TC.LADDER;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = D.reducedMotion();
  const alpha = D.alpha, shade = D.shade, mix = D.mix;
  const SND = function () { return window.LabSound && window.LabSound.enabled() ? window.LabSound : null; };
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  // ---------- 數字格式 ----------
  function num(v, d) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function sgn(v, d) { const s = num(v, d); return v > 0 && s !== num(0, d) ? '+' + s : s; }
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s;
  }
  function fnt(px, weight, italic) { return (italic ? 'italic ' : '') + (weight ? weight + ' ' : '') + px + 'px ' + FONT; }
  /** 1、2、5 × 10^n 的「整數」往上取 */
  function niceCeil(x) {
    if (!(x > 0)) return 1;
    const e = Math.pow(10, Math.floor(Math.log10(x))), f = x / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e;
  }

  // ---------- 顏色 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['--canvas-bg', '--text', '--muted', '--border', '--accent', '--accent-soft', '--surface', '--bg',
      '--pos', '--neg', '--equi', '--field', '--probe', '--b-mech', '--b-optics', '--b-em', '--b-wave']
      .forEach(function (k) { C[k.slice(2)] = cs.getPropertyValue(k).trim(); });
    C.dark = D.dark;
    C.ccw = C.neg; C.cw = C.pos;
    C.wood = mix(C.equi, C['canvas-bg'], C.dark ? 0.42 : 0.3);
    C.steel = C.dark ? mix(C.field, C['canvas-bg'], 0.25) : mix(C.field, C.muted, 0.35);
    C.brick = mix(C.pos, C.equi, 0.45);
    C.skin = mix(C.equi, '#ffe2c4', C.dark ? 0.55 : 0.68);
    C.floor = mix(C.equi, C['canvas-bg'], C.dark ? 0.62 : 0.72);
    C.wall = mix(C.muted, C['canvas-bg'], C.dark ? 0.55 : 0.62);
  }

  // ================= 狀態 =================
  const state = {
    mode: 'seesaw',
    slow: false,
    ss: {
      M: 5, p: 2, items: [], scale: null, nextId: 1,
      phase: 'held', dyn: TC.seesawState(), lastLand: null, supportFx: 0,
      show: { f: true, arm: true, tau: true, cm: false },
      tool: null, drag: null, hover: null
    },
    ld: {
      th: 60, mu: 0.4, ml: 15, mp: 60, d: 0.5, muw: 0.3, rough: false,
      phase: 'held', slide: null, climb: null, show: { f: true, crit: true }, drag: null, hover: null
    },
    fx: []
  };
  const ss = state.ss, ld = state.ld;
  let kb = null;            // 鍵盤操作（keys.js）
  const kbItems = [];       // 目前可用鍵盤選取的物件（隨模式與擺設重建）

  // ================= 畫布 =================
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let dpr = 1, cw = 600, ch = 400, V = null;
  const bg = document.createElement('canvas');
  const bgc = bg.getContext('2d');
  let bgKey = '';

  function layout() {
    const narrow = cw < 560;
    if (state.mode === 'seesaw') {
      const k = cw / 4.7;
      const band = narrow ? 80 : 88, gpx = narrow ? 9 : 12;
      const h = Math.round(cw * (narrow ? 0.95 : 0.64));
      return { mode: 'seesaw', narrow: narrow, k: k, ox: 0.35 * k, oy: h - band - gpx, band: band, gpx: gpx, h: h };
    }
    const h = narrow ? Math.round(cw * 1.08) : Math.min(Math.round(cw * 0.7), 600);
    const gpx = narrow ? 30 : 34;
    const k = Math.min((cw - 16) / 4.85, (h - gpx - 22) / 4.55);
    return { mode: 'ladder', narrow: narrow, k: k, ox: cw - 0.45 * k - 8, oy: h - gpx, gpx: gpx, h: h };
  }
  function X(x) { return V.ox + x * V.k; }
  function Y(y) { return V.oy - y * V.k; }

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    V = layout();
    ch = V.h;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    bgKey = '';
    draw();
  }

  // ================= 模式一：蹺蹺板 =================
  function cfgNow() { return { M: ss.M, p: ss.p, L: SS.L, H: SS.H, items: ss.items, scale: ss.scale }; }
  function cfgCopy() {
    return { M: ss.M, p: ss.p, L: SS.L, H: SS.H, items: ss.items.map(function (o) { return Object.assign({}, o); }), scale: ss.scale ? { x: ss.scale.x } : null };
  }
  function held() { return ss.phase === 'held'; }
  function theta() { return held() ? 0 : ss.dyn.theta; }
  function ssMoving() {
    if (ss.phase !== 'free') return false;
    const d = ss.dyn;
    if (d.rest) return !TC.stays(cfgNow(), d);
    if (d.omega !== 0) return true;
    const sm = TC.sums(cfgNow(), d.grounded);
    return Math.abs(sm.S) > sm.tol && sm.I > 0;
  }
  function snapshot(extra) { return Object.assign(TC.seesawSnapshot(cfgNow(), ss.dyn, held()), extra || {}); }

  function kindName(kind) {
    return {
      w1: T('1 kg 砝碼', '1 kg weight'), w2: T('2 kg 砝碼', '2 kg weight'), w5: T('5 kg 砝碼', '5 kg weight'),
      brick: T('磚塊（2.5 kg）', 'brick (2.5 kg)'), child: T('小孩（20 kg）', 'child (20 kg)'), adult: T('大人（60 kg）', 'adult (60 kg)'),
      scale: T('彈簧秤', 'spring scale')
    }[kind] || kind;
  }
  function itemsAt(x, hang) { return ss.items.filter(function (it) { return Math.abs(it.x - x) < 1e-9 && !!it.hang === !!hang; }); }
  /** 能不能放：傳回空字串或原因 */
  function placeProblem(kind, x, hang, ignoreId) {
    if (x < -1e-9 || x > SS.L + 1e-9) return T('要放在木板上。', 'It has to go on the board.');
    if (kind === 'scale') return '';
    const k = KINDS[kind];
    if (hang) {
      if (!k.hang) return T('只有砝碼可以吊在板下。', 'Only weights can hang below the board.');
      if (itemsAt(x, true).some(function (o) { return o.id !== ignoreId; })) return T('這個掛鉤已經掛了東西。', 'Something is already hanging from this hook.');
      return '';
    }
    const top = itemsAt(x, false).filter(function (o) { return o.id !== ignoreId; });
    if (k.person && top.length) return T('人要獨占一格。', 'A person needs a free point.');
    if (top.some(function (o) { return KINDS[o.kind].person; })) return T('這一格已經有人坐了。', 'Someone is already sitting there.');
    if (top.length >= SS.STACK) return T('同一格最多疊 3 個。', 'At most 3 objects can be stacked on one point.');
    return '';
  }

  /** 改變擺設：放開後的板子依角動量守恆接著動 */
  function edit(fn, quiet) {
    const old = cfgCopy();
    const wasBal = ss.phase === 'free' && (ss.dyn.rest === 'level' || ss.dyn.rest === 'scale');
    fn();
    if (ss.phase === 'free') {
      ss.dyn = TC.seesawEdit(old, cfgNow(), ss.dyn);
      if (ss.dyn.rest === 'level' || ss.dyn.rest === 'scale') {
        if (!wasBal) chime();
        emit('balance', snapshot());
      }
    }
    if (!quiet) refreshSeesaw();
    rebuildKeys();
    kick();
  }
  function addItem(kind, x, hang) {
    if (kind === 'scale') { placeScale(x); return true; }
    const why = placeProblem(kind, x, hang);
    if (why) { setStatus(why); return false; }
    edit(function () { ss.items.push({ id: 'i' + (ss.nextId++), kind: kind, m: KINDS[kind].m, x: x, hang: !!hang }); });
    setStatus(T('放上 ', 'Placed a ') + kindName(kind) + T('：x = ', ' at x = ') + num(x, 2) + ' m' + (hang ? T('（吊在板下）', ' (hanging)') : '') + T('。', '. ') + netText() + T('。', '.'));
    return true;
  }
  function placeScale(x) {
    edit(function () { ss.scale = { x: x }; });
    setStatus(T('彈簧秤掛在 x = ', 'Spring scale attached at x = ') + num(x, 2) + ' m' + T('，往上拉。', ', pulling up.'));
  }
  function removeItem(id) { edit(function () { ss.items = ss.items.filter(function (o) { return o.id !== id; }); }); }

  function setHeld() {
    ss.phase = 'held';
    ss.dyn = TC.seesawState();
    ss.lastLand = null;
    ss.supportFx = 0;
    refreshSeesaw();
  }
  function release() {
    const cfg = cfgNow();
    ss.phase = 'free';
    ss.dyn = TC.seesawRelease(cfg);
    ss.lastLand = null;
    ss.supportFx = reducedMotion ? 0 : 1;
    const s = SND();
    if (s) { s.tone({ freq: 523, dur: 0.06, type: 'triangle', gain: 0.16 }); s.sweep({ from: 700, to: 430, dur: 0.12, gain: 0.07, delay: 0.02 }); }
    const snap = snapshot();
    emit('release', snap);
    const tq = TC.torques(cfg, 0);
    if (ss.dyn.rest === 'level') {
      setStatus(T('淨力矩為零：木板保持水平，平衡了！支點的力 N = 總重 = ', 'The net torque is zero: the board stays level — balanced! Pivot force N = total weight = ') + num(snap.N, 2) + ' N' + T('。', '.'));
      chime(); emit('balance', snap);
    } else if (ss.dyn.rest === 'scale') {
      setStatus(T('彈簧秤把木板拉住，保持水平：讀數 F = ', 'The spring scale holds the board level: it reads F = ') + num(snap.F, 2) + ' N' + T('。', '.'));
      chime(); emit('balance', snap);
    } else {
      setStatus(T('放開了！淨力矩 Στ = ', 'Let go! Net torque Στ = ') + sgn(tq.net, 2) + ' N·m' + (tq.net > 0 ? T('（逆時針）→ 左端往下轉。', ' (counterclockwise) → the left end goes down.') : T('（順時針）→ 右端往下轉。', ' (clockwise) → the right end goes down.')));
    }
    refreshSeesaw();
    kick();
  }
  function chime() {
    const s = SND();
    if (s) { s.tone({ freq: 1046.5, dur: 0.55, gain: 0.14 }); s.tone({ freq: 1568, dur: 0.5, gain: 0.07, delay: 0.09 }); }
    if (!reducedMotion) state.fx.push({ kind: 'glow', t: 0, dur: 0.9 });
  }

  function stepSeesaw(dt) {
    const cfg = cfgNow();
    const r = TC.seesawAdvance(cfg, ss.dyn, dt);
    ss.dyn = r.st;
    r.events.forEach(function (e) {
      if (e.type === 'land') {
        const s = SND();
        const g = clamp(0.18 + 0.12 * e.vEnd, 0.18, 0.6);
        if (s) { s.noise({ dur: 0.1, filter: 650, q: 1.1, gain: g }); s.tone({ freq: 290, dur: 0.12, gain: g * 0.55 }); }
        const xe = e.side === 'L' ? 0 : SS.L;
        const ga = TC.groundAngles(cfg), th = e.side === 'L' ? ga.left : ga.right;
        const wx = cfg.p + (xe - cfg.p) * Math.cos(th);
        if (!reducedMotion) state.fx.push({ kind: 'ripple', x: wx, y: 0, t: 0, dur: 0.45 });
        const prev = ss.lastLand;
        ss.lastLand = e.side;
        setStatus((e.side === 'L' ? T('左端碰地', 'The left end hits the ground') : T('右端碰地', 'The right end hits the ground')) +
          T('：板端速率 ', ': end speed ') + num(e.vEnd, 2) + ' m/s' + T('，轉了 ', ' after ') + num(e.tRun, 2) + T(' s。按「撐回」再試一次。', ' s. Press “Support” to try again.'));
        emit('land', snapshot({ side: e.side, vEnd: e.vEnd, omegaHit: e.omega, tRun: e.tRun, prevSide: prev }));
      } else if (e.type === 'catch') {
        const s = SND();
        if (s) s.noise({ dur: 0.05, filter: 2200, q: 2, gain: 0.18 });
        if (ss.dyn.rest === 'scale') {
          chime();
          setStatus(T('彈簧秤拉緊，把木板停在水平：讀數 F = ', 'The spring scale goes taut and stops the board level: F = ') + num(TC.reactions(cfg, ss.dyn).F, 2) + ' N' + T('。', '.'));
          emit('balance', snapshot());
        }
      } else if (e.type === 'itemGround') {
        const s = SND();
        if (s) s.noise({ dur: 0.05, filter: 900, q: 1, gain: 0.12 });
      }
    });
  }

  // ---------- 蹺蹺板：繪圖 ----------
  function buildSeesawBg() {
    const key = ['ss', cw, ch, dpr, D.ver].join('|');
    if (key === bgKey) return;
    bgKey = key;
    bg.width = cv.width; bg.height = cv.height;
    const c = bgc;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, cw, ch);
    const g0 = Y(0);
    // 遠處的淡淡地平線光
    const sky = c.createLinearGradient(0, 0, 0, g0);
    sky.addColorStop(0, alpha(C.accent, C.dark ? 0.04 : 0.03));
    sky.addColorStop(1, alpha(C.accent, 0));
    c.fillStyle = sky; c.fillRect(0, 0, cw, g0);
    // 地面
    const gr = c.createLinearGradient(0, g0, 0, g0 + V.gpx);
    gr.addColorStop(0, shade(C.floor, C.dark ? 0.08 : -0.02));
    gr.addColorStop(1, shade(C.floor, -0.14));
    c.fillStyle = gr; c.fillRect(0, g0, cw, V.gpx);
    c.fillStyle = alpha(shade(C.floor, 0.5), 0.7); c.fillRect(0, g0, cw, 1);
    c.fillStyle = alpha(shade(C.floor, -0.4), 0.5); c.fillRect(0, g0 + V.gpx - 1, cw, 1);
    // 力臂帶（水平距離的尺）
    const y0 = g0 + V.gpx;
    c.fillStyle = alpha(C.text, C.dark ? 0.035 : 0.025);
    c.fillRect(0, y0, cw, ch - y0);
    c.strokeStyle = alpha(C.text, 0.1); c.lineWidth = 1;
    c.beginPath();
    for (let x = 0; x <= SS.L + 1e-9; x += SS.GRID) {
      const px = Math.round(X(x) * dpr) / dpr + 0.5 / dpr;
      const major = Math.abs(x - Math.round(x)) < 1e-9;
      c.moveTo(px, ch - (major ? 9 : 5)); c.lineTo(px, ch);
    }
    c.stroke();
    c.font = fnt(10.5); c.fillStyle = alpha(C.muted, 0.9); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    for (let x = 0; x <= SS.L; x++) c.fillText(x + ' m', X(x), ch - 11);
    c.textAlign = 'left';
    c.fillStyle = alpha(C.muted, 0.95); c.font = fnt(11, 600);
    c.fillText(T('力臂（水平距離）', 'Lever arms (horizontal)'), 6, y0 + 13);
  }

  /** 板上某格點（中心線）在畫布上的位置 */
  function boardPt(x, th, up) {
    const s = x - ss.p, c = Math.cos(th), sn = Math.sin(th);
    const px = X(ss.p + s * c), py = Y(SS.H + s * sn);
    return up ? [px - sn * up, py - c * up] : [px, py];
  }

  function drawWeightShape(c, kind, w, h, ghost) {
    // (0,0) 為底部中心，往上為負 y
    const col = C.steel;
    D.block(c, -w / 2, -h, w, h, col, { r: Math.min(4, w * 0.18), shadow: !ghost });
    // 開槽與刻字
    c.fillStyle = alpha(shade(col, -0.45), 0.55);
    c.fillRect(-w * 0.04, -h, w * 0.08, h * 0.42);
    c.strokeStyle = alpha(shade(col, 0.55), 0.5); c.lineWidth = 1;
    c.beginPath(); c.moveTo(-w / 2 + 2, -h * 0.5 + 0.5); c.lineTo(w / 2 - 2, -h * 0.5 + 0.5); c.stroke();
    // 掛環
    c.strokeStyle = shade(col, -0.2); c.lineWidth = Math.max(1.2, w * 0.07);
    c.beginPath(); c.arc(0, -h - Math.max(2.5, w * 0.16), Math.max(2, w * 0.13), 0, Math.PI * 2); c.stroke();
    if (w >= 20) {
      c.font = fnt(Math.min(11, Math.max(8, w * 0.3)), 700);
      c.fillStyle = C.dark ? alpha('#000000', 0.7) : alpha('#ffffff', 0.9);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(KINDS[kind].m), 0, -h * 0.28);
    }
  }
  function drawBrick(c, w, h, ghost) {
    D.block(c, -w / 2, -h, w, h, C.brick, { r: 2, shadow: !ghost });
    c.strokeStyle = alpha(shade(C.brick, 0.45), 0.55); c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-w / 2 + 1, -h / 2 + 0.5); c.lineTo(w / 2 - 1, -h / 2 + 0.5);
    c.moveTo(-w * 0.15, -h + 1); c.lineTo(-w * 0.15, -h / 2);
    c.moveTo(w * 0.22, -h / 2); c.lineTo(w * 0.22, -1);
    c.stroke();
  }
  function drawPerson(c, kind, w, h, ghost) {
    const body = kind === 'adult' ? C['b-optics'] : C['b-wave'];
    const headR = h * 0.17;
    // 盤腿坐著：腿、身體、手臂、頭
    D.block(c, -w / 2, -h * 0.2, w, h * 0.2, shade(body, -0.25), { r: h * 0.08, shadow: !ghost });
    D.block(c, -w * 0.32, -h * 0.68, w * 0.64, h * 0.52, body, { r: w * 0.22, shadow: false });
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = shade(body, -0.15); c.lineWidth = Math.max(2, w * 0.13);
    c.beginPath(); c.moveTo(w * 0.24, -h * 0.58); c.quadraticCurveTo(w * 0.44, -h * 0.4, w * 0.3, -h * 0.24); c.stroke();
    c.restore();
    D.ball(c, 0, -h * 0.68 - headR * 0.92, headR, C.skin, { shadow: !ghost, glow: 0 });
    c.fillStyle = alpha(shade(C.skin, -0.55), 0.85);
    c.beginPath(); c.arc(headR * 0.42, -h * 0.68 - headR * 1.0, Math.max(0.8, headR * 0.1), 0, Math.PI * 2); c.fill();
  }
  function drawItemShape(c, kind, ghost) {
    const k = V.k, K = KINDS[kind];
    const w = K.w * k, h = K.h * k;
    if (kind === 'brick') drawBrick(c, w, h, ghost);
    else if (K.person) drawPerson(c, kind, w, h, ghost);
    else drawWeightShape(c, kind, w, h, ghost);
  }

  function drawFulcrum(c) {
    const k = V.k, px = X(ss.p), py = Y(SS.H), gy = Y(0);
    const bw = Math.max(18, 0.36 * k);
    D.contactShadow(c, px, gy, bw * 0.6, 0);
    const hot = ss.hover === 'pivot' || (ss.drag && ss.drag.what === 'pivot');
    const col = C.dark ? mix(C.muted, C['canvas-bg'], 0.3) : mix(C.field, C.muted, 0.25);
    const gr = c.createLinearGradient(px - bw / 2, 0, px + bw / 2, 0);
    gr.addColorStop(0, shade(col, 0.22)); gr.addColorStop(0.5, col); gr.addColorStop(1, shade(col, -0.25));
    c.save();
    if (hot) { c.shadowColor = alpha(C.accent, 0.6); c.shadowBlur = 12; }
    c.beginPath(); c.moveTo(px, py + 2); c.lineTo(px + bw / 2, gy); c.lineTo(px - bw / 2, gy); c.closePath();
    c.fillStyle = gr; c.fill();
    c.restore();
    c.strokeStyle = alpha(shade(col, -0.4), 0.7); c.lineWidth = 1;
    c.beginPath(); c.moveTo(px, py + 2); c.lineTo(px + bw / 2, gy); c.lineTo(px - bw / 2, gy); c.closePath(); c.stroke();
    c.strokeStyle = alpha(shade(col, 0.6), 0.5);
    c.beginPath(); c.moveTo(px - 0.5, py + 4); c.lineTo(px - bw / 2 + 2, gy - 1); c.stroke();
    if (hot) { c.strokeStyle = alpha(C.accent, 0.8); c.lineWidth = 2; c.beginPath(); c.moveTo(px, py + 2); c.lineTo(px + bw / 2, gy); c.lineTo(px - bw / 2, gy); c.closePath(); c.stroke(); }
  }
  function drawSupports(c, u) {
    // u：1 = 撐住；放開後很快降下（純裝飾）
    if (u <= 0) return;
    const k = V.k, gy = Y(0);
    [0.3, SS.L - 0.3].forEach(function (x) {
      const px = X(x), top = Y(SS.H) + (1 - u) * (gy - Y(SS.H));
      const w = Math.max(8, 0.1 * k);
      D.contactShadow(c, px, gy, w, 0);
      D.block(c, px - w * 0.35, top + 3, w * 0.7, gy - top - 3, mix(C.muted, C['canvas-bg'], 0.2), { r: 2, shadow: false });
      D.block(c, px - w, top, w * 2, 4, shade(C.muted, -0.1), { r: 1.5, shadow: false });
    });
  }

  function drawBoard(c, th) {
    const k = V.k, tpx = Math.max(5, SS.THICK * k);
    c.save();
    c.translate(X(ss.p), Y(SS.H));
    c.rotate(-th);
    const x0 = -ss.p * k, x1 = (SS.L - ss.p) * k;
    const light = ss.M === 0;
    const col = light ? mix(C.wood, C['canvas-bg'], 0.45) : C.wood;
    D.block(c, x0, -tpx, x1 - x0, tpx, col, { r: 2 });
    // 木紋
    c.save();
    D.roundRect(c, x0, -tpx, x1 - x0, tpx, 2); c.clip();
    c.strokeStyle = alpha(shade(col, -0.35), 0.18); c.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      const yy = -tpx * (0.3 + 0.22 * i);
      c.moveTo(x0, yy);
      for (let x = x0; x <= x1; x += 24) c.lineTo(x, yy + Math.sin(x * 0.05 + i * 2) * 0.8);
      c.stroke();
    }
    c.restore();
    // 刻度：每 0.25 m 一個格點
    for (let i = 0; i <= SS.L / SS.GRID + 1e-9; i++) {
      const x = i * SS.GRID, u = (x - ss.p) * k;
      const major = i % 4 === 0, mid = i % 2 === 0;
      c.strokeStyle = alpha(shade(col, -0.55), major ? 0.75 : 0.45);
      c.lineWidth = major ? 1.4 : 1;
      c.beginPath(); c.moveTo(u, -tpx); c.lineTo(u, -tpx + (major ? tpx * 0.75 : mid ? tpx * 0.5 : tpx * 0.32)); c.stroke();
    }
    // 掛鉤（板下）
    c.strokeStyle = alpha(shade(col, -0.5), 0.55); c.lineWidth = 1;
    ss.items.forEach(function (it) {
      if (!it.hang) return;
      const u = (it.x - ss.p) * k;
      c.beginPath(); c.arc(u, 2.5, 2.2, 0, Math.PI * 2); c.stroke();
    });
    c.restore();
    return tpx;
  }

  /** 板上的物體（跟著木板轉） */
  function topStacks() {
    const map = {};
    ss.items.forEach(function (it) {
      if (it.hang) return;
      const key = it.x.toFixed(3);
      (map[key] = map[key] || []).push(it);
    });
    return map;
  }
  function drawTopItems(c, th, tpx) {
    const k = V.k, map = topStacks();
    const drag = ss.drag && ss.drag.item ? ss.drag.item.id : null;
    Object.keys(map).forEach(function (key) {
      let v = tpx;
      map[key].forEach(function (it) {
        if (it.id === drag) return;
        const K = KINDS[it.kind];
        c.save();
        c.translate(X(ss.p), Y(SS.H));
        c.rotate(-th);
        c.translate((it.x - ss.p) * k, -v);
        if (ss.hover === it.id) { c.shadowColor = alpha(C.accent, 0.7); c.shadowBlur = 10; }
        drawItemShape(c, it.kind);
        c.restore();
        v += K.h * k + 1;
      });
    });
  }
  function hangGeom(it, th) {
    const k = V.k, K = KINDS[it.kind];
    const hp = boardPt(it.x, th);
    const grounded = !held() && ss.dyn.grounded[it.id];
    let bottom = hp[1] + (SS.HOOK + K.h) * k;
    if (grounded) bottom = Y(0);
    return { hx: hp[0], hy: hp[1], top: bottom - K.h * k, bottom: bottom, w: K.w * k, h: K.h * k, grounded: grounded };
  }
  function drawHanging(c, th) {
    const drag = ss.drag && ss.drag.item ? ss.drag.item.id : null;
    ss.items.forEach(function (it) {
      if (!it.hang || it.id === drag) return;
      const g = hangGeom(it, th);
      c.save();
      c.lineCap = 'round';
      c.strokeStyle = alpha(C.text, 0.55); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(g.hx, g.hy + 2);
      const ringY = g.top - Math.max(2.5, g.w * 0.16) - Math.max(2, g.w * 0.13);
      if (g.grounded) c.quadraticCurveTo(g.hx + 8, (g.hy + ringY) / 2 + 6, g.hx, ringY);
      else c.lineTo(g.hx, ringY);
      c.stroke();
      c.restore();
      if (g.grounded) D.contactShadow(c, g.hx, Y(0), g.w * 0.6, 0);
      c.save();
      c.translate(g.hx, g.bottom);
      if (ss.hover === it.id) { c.shadowColor = alpha(C.accent, 0.7); c.shadowBlur = 10; }
      drawItemShape(c, it.kind);
      c.restore();
    });
  }

  /** 彈簧秤：手拿著、掛鉤固定在木板水平時的高度 */
  function scaleGeom(th, tpx) {
    const k = V.k;
    const xs = ss.scale.x;
    const A = boardPt(xs, th, tpx);
    const hook = Math.max(8, 0.08 * k), blen = Math.max(40, 0.36 * k), bw = Math.max(11, 0.075 * k);
    const level = boardPt(xs, 0, tpx);
    return { A: A, hook: hook, blen: blen, bw: bw, bx: A[0], bBottom: A[1] - hook, bTop: A[1] - hook - blen, clampX: level[0], clampY: 6 };
  }
  function scaleReading() {
    if (!ss.scale || held()) return null;
    const re = TC.reactions(cfgNow(), ss.dyn, false);
    return re.F;
  }
  function drawScale(c, th, tpx) {
    if (!ss.scale || (ss.drag && ss.drag.what === 'scale')) return;
    const g = scaleGeom(th, tpx);
    const F = scaleReading();
    const taut = F != null && F > 0;
    const col = C['b-mech'];
    // 夾具（手）
    D.block(c, g.clampX - 16, 0, 32, g.clampY + 4, mix(C.muted, C['canvas-bg'], 0.25), { r: 3, shadow: false });
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = alpha(C.text, 0.6); c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(g.clampX, g.clampY + 4);
    if (taut || held()) c.lineTo(g.bx, g.bTop);
    else c.quadraticCurveTo((g.clampX + g.bx) / 2 + 14, (g.clampY + g.bTop) / 2 + 18, g.bx, g.bTop);
    c.stroke();
    // 掛鉤
    c.strokeStyle = shade(col, -0.2); c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(g.bx, g.bBottom); c.lineTo(g.bx, g.A[1] - 4); c.arc(g.bx + 3, g.A[1] - 4, 3, Math.PI, Math.PI * 0.1, true); c.stroke();
    c.restore();
    // 秤身
    c.save();
    if (ss.hover === 'scale') { c.shadowColor = alpha(C.accent, 0.7); c.shadowBlur = 10; }
    D.block(c, g.bx - g.bw / 2, g.bTop, g.bw, g.blen, mix(C.surface, C['canvas-bg'], 0.3), { r: 3, stroke: alpha(col, 0.8) });
    c.restore();
    c.strokeStyle = alpha(C.text, 0.35); c.lineWidth = 1;
    c.beginPath();
    for (let i = 1; i < 8; i++) { const yy = g.bTop + 4 + (g.blen - 8) * i / 8; c.moveTo(g.bx - g.bw * 0.28, yy); c.lineTo(g.bx + g.bw * (i % 2 ? 0 : 0.28), yy); }
    c.stroke();
    const frac = F && F > 0 ? clamp(F / niceCeil(Math.max(50, F * 1.4)), 0, 1) : 0;
    const py = g.bTop + 4 + (g.blen - 8) * frac;
    c.strokeStyle = col; c.lineWidth = 2.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(g.bx - g.bw * 0.4, py); c.lineTo(g.bx + g.bw * 0.4, py); c.stroke();
    // 讀數
    const txt = held() ? T('彈簧秤', 'Spring scale') : (taut ? 'F = ' + num(F, 2) + ' N' : T('F = 0（鬆）', 'F = 0 (slack)'));
    placeLabel(c, txt, g.bx + g.bw / 2 + 6, g.bTop + g.blen * 0.45, col, 'left', fnt(12, 650), true);
  }

  // ---------- 標籤擺放（避免重疊） ----------
  let placed = [];
  function overlaps(r) {
    return placed.some(function (q) { return r.x < q.x + q.w + 2 && r.x + r.w + 2 > q.x && r.y < q.y + q.h + 1 && r.y + r.h + 1 > q.y; });
  }
  // 文字可以是字串，或 [[文字, 是否下標], …]（畫布上自己畫小字下標，不用 Unicode 下標字元）
  function subFont(font) { return font.replace(/(\d+(?:\.\d+)?)px/, function (m, n) { return (n * 0.76).toFixed(1) + 'px'; }); }
  function fontPx(font) { return parseFloat((/(\d+(?:\.\d+)?)px/.exec(font) || [0, 12])[1]); }
  function richWidth(c, parts, font) {
    if (!Array.isArray(parts)) { c.font = font; return c.measureText(parts).width; }
    let w = 0;
    parts.forEach(function (p) { c.font = p[1] ? subFont(font) : font; w += c.measureText(p[0]).width + (p[1] ? 0.6 : 0); });
    return w;
  }
  /** 從 x（左緣）開始畫，y 為中線 */
  function richText(c, parts, x, y, color, font, halo) {
    if (!Array.isArray(parts)) parts = [[parts, 0]];
    const px = fontPx(font);
    c.textAlign = 'left'; c.textBaseline = 'middle';
    parts.forEach(function (p) {
      c.font = p[1] ? subFont(font) : font;
      const yy = y + (p[1] ? px * 0.3 : 0);
      if (halo) { c.lineJoin = 'round'; c.lineWidth = 4; c.strokeStyle = alpha(C['canvas-bg'], 0.92); c.strokeText(p[0], x, yy); }
      c.fillStyle = color;
      c.fillText(p[0], x, yy);
      x += c.measureText(p[0]).width + (p[1] ? 0.6 : 0);
    });
  }
  function pillBox(c, text, x, yc, align, font) {
    const tw = richWidth(c, text, font);
    c.font = font;
    const w = tw + 12, h = D.textHeight(c.measureText('Mg'), 15) + 3;
    const bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    return { x: bx, y: yc - h / 2, w: w, h: h };
  }
  function drawPill(c, text, box, color, font) {
    D.roundRect(c, box.x, box.y, box.w, box.h, box.h / 2);
    c.fillStyle = alpha(C['canvas-bg'], C.dark ? 0.86 : 0.9); c.fill();
    c.strokeStyle = alpha(color, C.dark ? 0.45 : 0.35); c.lineWidth = 1; c.stroke();
    richText(c, text, box.x + 6, box.y + box.h / 2 + 0.5, color, font);
  }
  /** 放一個 pill：位置被占用時往上（dir = −1）或往下找空位；force 為真時一定畫 */
  function placeLabel(c, text, x, yc, color, align, font, force, dir) {
    font = font || fnt(12, 600);
    let box = pillBox(c, text, x, yc, align, font);
    box.x = clamp(box.x, 2, cw - box.w - 2);
    let tries = 0;
    const step = (box.h + 2) * (dir || -1);
    while (overlaps(box) && tries < 6) { box.y += step; tries++; }
    if (overlaps(box) && !force) return null;
    box.y = clamp(box.y, 2, ch - box.h - 2);
    drawPill(c, text, box, color, font);
    placed.push(box);
    return box;
  }
  /** 力矩標籤：圓角底框＋自己畫的旋轉方向小弧（不用 ↺↻ 字元） */
  function torquePill(c, text, x, yc, color, sense) {
    const font = fnt(11.5, 650);
    c.font = font;
    const m = c.measureText(text), h = D.textHeight(m, 15) + 3, w = m.width + 12 + h * 0.85;
    let box = { x: clamp(x - w / 2, 2, cw - w - 2), y: yc - h / 2, w: w, h: h };
    let tries = 0;
    while (overlaps(box) && tries < 6) { box.y -= h + 2; tries++; }
    if (overlaps(box)) return;
    placed.push(box);
    D.roundRect(c, box.x, box.y, w, h, h / 2);
    c.fillStyle = alpha(C['canvas-bg'], C.dark ? 0.86 : 0.9); c.fill();
    c.strokeStyle = alpha(color, C.dark ? 0.5 : 0.4); c.lineWidth = 1; c.stroke();
    const ax = box.x + h * 0.55, ay = box.y + h / 2, r = h * 0.26;
    if (sense) arcGlyph(c, ax, ay, r, sense, color);
    c.fillStyle = color; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(text, box.x + h * 0.85 + 4, ay + 0.5);
  }
  function arcGlyph(c, x, y, r, sense, color, lw) {
    // sense > 0：逆時針（畫面上），< 0：順時針
    c.save();
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = lw || 1.5; c.lineCap = 'round';
    const a0 = -Math.PI * 0.85, a1 = Math.PI * 0.55; // 從左上繞到右下
    c.beginPath();
    if (sense > 0) c.arc(x, y, r, a1, a0, true); else c.arc(x, y, r, a0, a1, false);
    c.stroke();
    const end = sense > 0 ? a0 : a1;
    const ex = x + r * Math.cos(end), ey = y + r * Math.sin(end);
    const tx = sense > 0 ? Math.sin(end) : -Math.sin(end), ty = sense > 0 ? -Math.cos(end) : Math.cos(end);
    const hl = Math.max(3, r * 0.75), nx = -ty, ny = tx;
    c.beginPath();
    c.moveTo(ex + tx * hl * 0.6, ey + ty * hl * 0.6);
    c.lineTo(ex - tx * hl * 0.5 + nx * hl * 0.55, ey - ty * hl * 0.5 + ny * hl * 0.55);
    c.lineTo(ex - tx * hl * 0.5 - nx * hl * 0.55, ey - ty * hl * 0.5 - ny * hl * 0.55);
    c.closePath(); c.fill();
    c.restore();
  }

  function dashedV(c, x, y0, y1, color) {
    c.save();
    c.setLineDash([4, 4]);
    c.strokeStyle = alpha(color, 0.55); c.lineWidth = 1;
    const sx = Math.round(x * dpr) / dpr + 0.5 / dpr;
    c.beginPath(); c.moveTo(sx, y0); c.lineTo(sx, y1); c.stroke();
    c.restore();
  }

  function drawSeesaw() {
    buildSeesawBg();
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.drawImage(bg, 0, 0, cw, ch);
    placed = [];
    const cfg = cfgNow(), th = theta(), k = V.k;
    const tq = TC.torques(cfg, th, held() ? null : ss.dyn.grounded);
    const re = TC.reactions(cfg, ss.dyn, held());
    const tpx = Math.max(5, SS.THICK * k);

    // 板子在地面的影子
    const ends = [boardPt(0, th), boardPt(SS.L, th)];
    const lift = clamp(1 - (Math.min(ends[0][1], ends[1][1]) - Y(SS.H)) / 60, 0, 1);
    D.contactShadow(c, (ends[0][0] + ends[1][0]) / 2, Y(0), (ends[1][0] - ends[0][0]) * 0.42, 0.65 + 0.2 * (1 - lift));

    drawSupports(c, held() ? 1 : ss.supportFx);
    drawFulcrum(c);
    drawHanging(c, th);
    drawBoard(c, th);
    D.ball(c, X(ss.p), Y(SS.H), Math.max(2.6, 0.022 * k), mix(C.field, C.muted, 0.3), { shadow: false, glow: 0 });
    drawTopItems(c, th, tpx);
    drawScale(c, th, tpx);

    // 力的作用線與力臂（下方的「力臂帶」：每條作用線到支點的水平距離）
    const groups = forceGroups(cfg, th, tpx);
    const bandTop = Y(0) + V.gpx;
    if (ss.show.arm) {
      dashedV(c, X(ss.p), Y(SS.H) + 4, ch, C.accent);
      const rows = groups.filter(function (g) { return Math.abs(g.arm) > 1e-9; }).sort(function (a, b) { return Math.abs(a.arm) - Math.abs(b.arm); });
      const r0 = bandTop + 22, r1 = ch - 26;
      const rowH = rows.length > 1 ? Math.min(15, (r1 - r0) / (rows.length - 1)) : 0;
      const tight = rows.length > 1 && rowH < 11;
      rows.forEach(function (g, i) {
        const col = g.color, yb = r0 + i * Math.max(rowH, 5);
        if (yb > r1 + 0.5) return;
        dashedV(c, g.ax, g.ay, yb + 3, col);
        const xa = X(ss.p), xb = g.ax;
        c.save();
        c.strokeStyle = col; c.lineWidth = tight ? 1.3 : 1.6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(xa, yb); c.lineTo(xb, yb); c.stroke();
        c.lineWidth = 1.1;
        c.beginPath(); c.moveTo(xb, yb - 3); c.lineTo(xb, yb + 3); c.stroke();
        c.restore();
        const t = num(Math.abs(g.arm), 2) + ' m';
        const f = fnt(10.5, 600);
        c.font = f;
        const tw = c.measureText(t).width;
        if (!tight && Math.abs(xb - xa) > tw + 10) D.haloText(c, t, (xa + xb) / 2, yb - 3, col, 'center', 'alphabetic', f);
        else if (tight) { // 擠的時候把數字放在線的外側端點旁
          const right = xb > xa, tx = right ? xb + 5 : xb - 5;
          if ((right ? cw - tx : tx) > tw + 4) D.haloText(c, t, tx, yb + 3.5, col, right ? 'left' : 'right', 'alphabetic', fnt(9.5, 600));
        }
      });
    }
    // 力的箭頭：板上物體與木板的重量畫成「壓在作用點上」（箭頭尖端在作用點），
    // 吊掛砝碼經由繩子往下拉（箭尾在掛鉤），支點、彈簧秤、地面的力從作用點往上。比例尺在右上角。
    const fScale = forceScale(groups, re, cfg);
    if (ss.show.f) {
      const later = []; // 先畫所有箭頭，再放標籤（標籤不會被別的箭頭壓到）
      groups.forEach(function (g) {
        if (g.topF > 0) {
          const len = g.topF * fScale.s;
          D.arrow(c, g.tx, g.ty - len, g.tx, g.ty, g.color, len < 18 ? 2 : 2.6);
          g.tailY = g.ty - len;
          if (len >= 16) later.push([num(g.topF, 1) + ' N', g.tx + 6, g.ty - len + 9, g.color, -1]);
        }
        if (g.hangF > 0) {
          const len = g.hangF * fScale.s;
          D.arrow(c, g.ax, g.ay + 1, g.ax, g.ay + 1 + len, g.color, len < 18 ? 2 : 2.4);
          if (len >= 16) later.push([num(g.hangF, 1) + ' N', g.ax + 6, g.ay + len * 0.6, g.color, 1]);
        }
      });
      if (!held()) {
        const pv = [X(ss.p), Y(SS.H)];
        if (re.N > 1e-9) {
          const len = re.N * fScale.s;
          D.arrow(c, pv[0], pv[1], pv[0], pv[1] - len, C.accent, 2.8, {});
          placeLabel(c, 'N = ' + num(re.N, 1) + ' N', pv[0] + 7, pv[1] - len + 4, C.accent, 'left', fnt(12, 650), true);
        }
        if (re.F > 0 && ss.scale) {
          const A = boardPt(ss.scale.x, th, tpx);
          D.arrow(c, A[0] + 7, A[1], A[0] + 7, A[1] - re.F * fScale.s, C['b-mech'], 2.6);
        }
        if (re.Ng > 0 && re.side) {
          const xe = re.side === 'L' ? 0 : SS.L, E = boardPt(xe, th);
          const len = re.Ng * fScale.s;
          D.arrow(c, E[0], E[1], E[0], E[1] - len, C.accent, 2.4);
          placeLabel(c, num(re.Ng, 1) + ' N', E[0] + (re.side === 'L' ? 6 : -6), E[1] - len - 6, C.accent, re.side === 'L' ? 'left' : 'right', fnt(11, 600));
        }
      }
      later.forEach(function (q) { placeLabel(c, q[0], q[1], q[2], q[3], 'left', fnt(10.5, 600), false, q[4]); });
      // 比例尺
      const bx = cw - 12, by = 14, blen = fScale.unit * fScale.s;
      c.save();
      c.strokeStyle = alpha(C.text, 0.6); c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx, by + blen); c.moveTo(bx - 3, by); c.lineTo(bx + 3, by); c.moveTo(bx - 3, by + blen); c.lineTo(bx + 3, by + blen); c.stroke();
      c.restore();
      D.haloText(c, num(fScale.unit, 0) + ' N', bx - 6, by + blen / 2 + 4, C.muted, 'right', 'alphabetic', fnt(10.5, 600));
      placed.push({ x: bx - 50, y: by - 2, w: 56, h: blen + 4 });
    }
    // 力矩標籤（放在這條作用線最上方：物體或箭尾的上面）
    if (ss.show.tau) {
      groups.forEach(function (g) {
        if (Math.abs(g.tau) < 1e-9) return;
        const top = Math.min(g.ly, g.tailY != null ? g.tailY - 12 : g.ly);
        torquePill(c, num(Math.abs(g.tau), 2) + ' N·m', g.lx, top, g.color, g.tau > 0 ? 1 : -1);
      });
      // 彈簧秤拉住時，它的力矩剛好抵消重力的淨力矩
      if (!held() && ss.scale && re.F > 0) {
        const tauS = re.F * (ss.scale.x - ss.p) * Math.cos(th), sg = scaleGeom(th, tpx);
        if (Math.abs(tauS) > 1e-9) torquePill(c, num(Math.abs(tauS), 2) + ' N·m', sg.bx, sg.bTop - 14, tauS > 0 ? C.ccw : C.cw, tauS > 0 ? 1 : -1);
      }
    }
    // 系統重心
    const sm = TC.sums(cfg, held() ? null : ss.dyn.grounded);
    if (ss.show.cm && sm.Mt > 0) {
      const P = boardPt(sm.xcm, th);
      dashedV(c, P[0], P[1], Y(0), C.equi);
      const r = 6.5;
      c.save();
      c.beginPath(); c.arc(P[0], P[1], r, 0, Math.PI * 2);
      c.fillStyle = alpha(C['canvas-bg'], 0.9); c.fill();
      c.fillStyle = C.equi;
      c.beginPath(); c.moveTo(P[0], P[1]); c.arc(P[0], P[1], r, -Math.PI / 2, 0); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(P[0], P[1]); c.arc(P[0], P[1], r, Math.PI / 2, Math.PI); c.closePath(); c.fill();
      c.strokeStyle = C.equi; c.lineWidth = 1.5;
      c.beginPath(); c.arc(P[0], P[1], r, 0, Math.PI * 2); c.stroke();
      c.restore();
      placeLabel(c, T('重心', 'CG') + ' x = ' + num(sm.xcm, 2) + ' m', P[0] + 9, Y(0) - 12, C.equi, 'left', fnt(11, 650), false, -1);
    }
    // 淨力矩（支點旁的弧形箭頭）
    drawNetTorque(c, held() || !ss.dyn.rest ? tq.net : 0);
    drawFx(c);
    drawStatePill(c, tq, re);
    drawDragGhost(c, th, tpx);
    drawKbFocus(c);
  }

  /** 同一條作用線（同一格點）上的重量合併：topF 為放在板上的、hangF 為吊在板下的（同一條鉛直線，力矩一起算） */
  function forceGroups(cfg, th, tpx) {
    const k = V.k, out = [], cs = Math.cos(th);
    const gnd = held() ? {} : ss.dyn.grounded;
    if (ss.M > 0) {
      const P = boardPt(SS.L / 2, th), Pm = boardPt(SS.L / 2, th, tpx / 2);
      const arm = (SS.L / 2 - ss.p) * cs;
      out.push({ x: SS.L / 2, F: ss.M * G, topF: ss.M * G, hangF: 0, arm: arm, tau: -ss.M * G * arm, ax: P[0], ay: P[1], tx: Pm[0], ty: Pm[1],
        lx: P[0], ly: boardPt(SS.L / 2, th, tpx + 14)[1], board: true });
    }
    const byX = {};
    ss.items.forEach(function (it) {
      if (gnd[it.id]) return;
      if (ss.drag && ss.drag.item && ss.drag.item.id === it.id) return;
      const key = it.x.toFixed(3);
      const b = (byX[key] = byX[key] || { x: it.x, top: 0, hang: 0, topH: 0 });
      if (it.hang) b.hang += it.m; else { b.top += it.m; b.topH += KINDS[it.kind].h * k + 1; }
    });
    Object.keys(byX).forEach(function (key) {
      const b = byX[key], P = boardPt(b.x, th), Pt = boardPt(b.x, th, tpx);
      const arm = (b.x - ss.p) * cs, m = b.top + b.hang;
      out.push({ x: b.x, F: m * G, topF: b.top * G, hangF: b.hang * G, arm: arm, tau: -m * G * arm, ax: P[0], ay: P[1], tx: Pt[0], ty: Pt[1],
        lx: P[0], ly: boardPt(b.x, th, tpx + b.topH + 12)[1] });
    });
    out.forEach(function (g) { g.color = Math.abs(g.tau) < 1e-9 ? C.muted : g.tau > 0 ? C.ccw : C.cw; });
    return out;
  }
  /** 力的比例：以總重（平衡時支點的力）為上限，放開前後比例不跳動 */
  function forceScale(groups, re, cfg) {
    let fmax = TC.sums(cfg, null).W;
    groups.forEach(function (g) { fmax = Math.max(fmax, g.F); });
    if (isFinite(re.N)) fmax = Math.max(fmax, re.N);
    fmax = Math.max(fmax, re.F || 0, re.Ng || 0, 20);
    const target = Math.min(V.k * 0.95, (Y(SS.H) - 60) * 0.8);
    const top = niceCeil(fmax);
    const s = target / top;
    let unit = top / 2;
    if (unit * s > 60) unit = top / 5;
    return { s: s, unit: unit };
  }
  /** 支點旁的弧形箭頭：實際的淨力矩（靜止時地面或彈簧秤的力矩已抵消，不畫）；撐住時畫重力的淨力矩（放開後會往哪轉） */
  function drawNetTorque(c, net) {
    if (!ss.show.tau) return;
    const px = X(ss.p), py = Y(SS.H);
    const r = Math.max(16, 0.2 * V.k);
    const col = Math.abs(net) < 1e-9 ? C.probe : net > 0 ? C.ccw : C.cw;
    if (Math.abs(net) > 1e-9) {
      c.save();
      c.strokeStyle = alpha(col, 0.85); c.lineWidth = 2.2; c.lineCap = 'round';
      const a0 = Math.PI * 0.12, a1 = Math.PI * 0.88; // 支點下方的弧（畫面座標）
      c.beginPath();
      if (net > 0) c.arc(px, py, r, a0, a1, false); else c.arc(px, py, r, a1, a0, true);
      c.stroke();
      const end = net > 0 ? a1 : a0;
      const ex = px + r * Math.cos(end), ey = py + r * Math.sin(end);
      const tx = net > 0 ? -Math.sin(end) : Math.sin(end), ty = net > 0 ? Math.cos(end) : -Math.cos(end);
      const hl = 7, nx = -ty, ny = tx;
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(ex + tx * hl * 0.7, ey + ty * hl * 0.7);
      c.lineTo(ex - tx * hl * 0.5 + nx * hl * 0.6, ey - ty * hl * 0.5 + ny * hl * 0.6);
      c.lineTo(ex - tx * hl * 0.5 - nx * hl * 0.6, ey - ty * hl * 0.5 - ny * hl * 0.6);
      c.closePath(); c.fill();
      c.restore();
    }
  }
  function drawStatePill(c, tq, re) {
    const d = ss.dyn;
    let txt, col = C.muted;
    if (held()) { txt = T('支架撐住', 'On supports'); }
    else if (d.rest === 'level') { txt = T('平衡：保持水平', 'Balanced: level'); col = C.probe; }
    else if (d.rest === 'scale') { txt = T('平衡：彈簧秤撐住', 'Balanced by the scale'); col = C.probe; }
    else if (d.rest === 'L') txt = T('左端著地', 'Left end down');
    else if (d.rest === 'R') txt = T('右端著地', 'Right end down');
    else if (ssMoving()) { txt = T('轉動中', 'Turning'); col = C['b-mech']; }
    else txt = T('靜止（隨遇平衡）', 'At rest (neutral)');
    const f1 = fnt(12.5, 700), f2 = fnt(12, 650);
    D.pill(c, txt, 8, 8 + 20, col, 'left', f1);
    const net = tq.net;
    const ntxt = [['Στ', 0], [T('重力', 'gravity'), 1], [' = ' + sgn(net, 2) + ' N·m' + (Math.abs(net) < 1e-9 ? '' : net > 0 ? T('（逆時針）', ' (ccw)') : T('（順時針）', ' (cw)')), 0]];
    const b = pillBox(c, ntxt, 8, 8 + 20 + 4 + 19 - 9.5, 'left', f2);
    drawPill(c, ntxt, b, Math.abs(net) < 1e-9 ? C.probe : net > 0 ? C.ccw : C.cw, f2);
    placed.push({ x: 6, y: 6, w: Math.max(b.w, 150) + 4, h: b.y + b.h - 4 });
    if (ss.tool) {
      const t2 = T('放置：', 'Placing: ') + kindName(ss.tool);
      const b2 = D.pill(c, t2, 8, b.y + b.h + 4 + 19, C.accent, 'left', fnt(11.5, 650));
      placed.push(b2);
    }
  }
  function drawDragGhost(c, th, tpx) {
    const dg = ss.drag;
    if (!dg || !dg.active || dg.what === 'pivot') return;
    const tg = dg.target;
    const k = V.k;
    if (tg) {
      const P = tg.hang ? boardPt(tg.x, th) : boardPt(tg.x, th, tpx);
      const ok = !tg.problem;
      c.save();
      c.strokeStyle = ok ? C.accent : C.pos; c.lineWidth = 2;
      c.setLineDash(ok ? [] : [3, 3]);
      c.beginPath(); c.arc(P[0], P[1] + (tg.hang ? 4 : -2), 7, 0, Math.PI * 2); c.stroke();
      c.restore();
      if (!ok) placeLabel(c, tg.problem, P[0], P[1] - 26, C.pos, 'center', fnt(11.5, 650), true);
    }
    c.save();
    c.globalAlpha = 0.72;
    if (dg.kind === 'scale') {
      D.block(c, dg.cx - 7, dg.cy - 40, 14, 40, mix(C.surface, C['canvas-bg'], 0.3), { r: 3, stroke: C['b-mech'] });
    } else {
      c.translate(dg.cx, dg.cy + KINDS[dg.kind].h * k / 2);
      drawItemShape(c, dg.kind, true);
    }
    c.restore();
  }

  // ---------- 效果（純裝飾） ----------
  function drawFx(c) {
    state.fx.forEach(function (f) {
      const u = f.t / f.dur;
      if (f.kind === 'ripple') D.ripple(c, X(f.x), Y(f.y), 10, u, C.text);
      else if (f.kind === 'glow' && state.mode === 'seesaw') {
        const P = [X(ss.p), Y(SS.H)];
        c.save();
        const gr = c.createRadialGradient(P[0], P[1], 4, P[0], P[1], 60 + 50 * u);
        gr.addColorStop(0, alpha(C.probe, 0.32 * (1 - u)));
        gr.addColorStop(1, alpha(C.probe, 0));
        c.fillStyle = gr;
        c.fillRect(P[0] - 120, P[1] - 120, 240, 240);
        c.restore();
      } else if (f.kind === 'dust' && state.mode === 'ladder') {
        f.p.forEach(function (q) {
          c.fillStyle = alpha(C.muted, 0.5 * (1 - u));
          c.beginPath(); c.arc(X(q.x + q.vx * f.t), Y(Math.max(0, q.vy * f.t - 2 * f.t * f.t)) - 2, 1.6 + 1.5 * u, 0, Math.PI * 2); c.fill();
        });
      }
    });
  }

  // ---------- 蹺蹺板：讀數 ----------
  function refreshSeesaw() {
    if (state.mode !== 'seesaw') return;
    const cfg = cfgNow(), h = held(), d = ss.dyn;
    const gnd = h ? null : d.grounded;
    const sm = TC.sums(cfg, gnd), tq = TC.torques(cfg, theta(), gnd), re = TC.reactions(cfg, d, h);
    let st;
    if (h) st = T('支架撐住', 'On its supports');
    else if (d.rest === 'level') st = T('平衡：保持水平', 'Balanced: stays level');
    else if (d.rest === 'scale') st = T('平衡：彈簧秤撐住', 'Balanced: held by the scale');
    else if (d.rest === 'L') st = T('左端著地', 'Left end on the ground');
    else if (d.rest === 'R') st = T('右端著地', 'Right end on the ground');
    else st = ssMoving() ? T('轉動中', 'Turning') : T('靜止（隨遇平衡）', 'At rest (neutral equilibrium)');
    $('rState').textContent = st;
    $('rWb').textContent = num(sm.Wb, 2) + ' N';
    $('rWi').textContent = num(sm.Wi, 2) + ' N';
    $('rCCW').textContent = num(tq.ccw, 2) + ' N·m';
    $('rCW').textContent = num(tq.cw, 2) + ' N·m';
    const net = tq.net;
    let noteS = '';
    if (!h && ss.scale && re.F > 0) noteS = '<small>' + T('彈簧秤的力矩 ', 'spring scale ') + sgn(re.F * (ss.scale.x - ss.p) * Math.cos(theta()), 2) + ' N·m' + T('，剛好抵消', ' cancels it') + '</small>';
    else if (!h && (d.rest === 'L' || d.rest === 'R') && Math.abs(net) > 1e-9) noteS = '<small>' + T('由地面撐住板端抵消', 'cancelled by the ground under the end') + '</small>';
    $('rNet').innerHTML = sgn(net, 2) + ' N·m<small>' + (Math.abs(net) < 1e-9 ? T('平衡', 'balanced') : net > 0 ? T('逆時針', 'counterclockwise') : T('順時針', 'clockwise')) + '</small>' + noteS;
    $('rNet').className = Math.abs(net) < 1e-9 ? 'ok' : net > 0 ? 'ccw' : 'cw';
    if (h) $('rN').innerHTML = '—<small>' + T('與支架分擔', 'shared with the supports') + '</small>';
    else {
      let s = num(re.N, 2) + ' N';
      if (!d.rest) {
        if (Math.abs(re.Nx) > 1e-6) s += '<small>' + T('水平分量 ', 'horizontal ') + sgn(re.Nx, 2) + ' N</small>';
        s += '<small>' + T('總重 ', 'total weight ') + num(sm.W, 2) + ' N</small>';
      }
      $('rN').innerHTML = s;
    }
    if (!ss.scale) $('rF').textContent = T('（沒有掛）', '(none)');
    else if (h) {
      const sc = TC.scaleNeed(cfg, null);
      $('rF').innerHTML = '—<small>' + (sc.atPivot ? T('掛在支點正上方：沒有力矩', 'Right above the pivot: no torque') :
        sc.F > 0 ? T('放開後要拉 ', 'After letting go it must pull ') + num(sc.F, 2) + ' N' : T('需要往下壓，彈簧秤做不到', 'It would have to push down — a spring scale cannot')) + '</small>';
    } else $('rF').textContent = num(re.F, 2) + ' N' + (re.F > 0 ? '' : T('（鬆）', ' (slack)'));
    $('rNg').textContent = re.Ng > 0 ? num(re.Ng, 2) + ' N' : '0 N';
    $('rXcm').innerHTML = sm.Mt > 0 ? num(sm.xcm, 3) + ' m<small>' + (Math.abs(sm.xcm - ss.p) < 5e-4 ? T('與支點在同一鉛直線', 'on the pivot’s vertical line') : T('在支點', '') + (sm.xcm < ss.p ? T('左方 ', '') + num(ss.p - sm.xcm, 3) + ' m' + T('', ' left of the pivot') : T('右方 ', '') + num(sm.xcm - ss.p, 3) + ' m' + T('', ' right of the pivot'))) + '</small>' : '—';
    $('rI').innerHTML = num(sm.I, 3) + ' kg·m<sup>2</sup>';
    $('rTh').textContent = sgn(theta() / D2R, 2) + '°';
    $('rOm').textContent = num(h ? 0 : d.omega, 3) + ' rad/s';
    $('rAl').innerHTML = h ? '—' : num(d.rest ? 0 : re.alpha, 3) + ' rad/s<sup>2</sup>';
    $('release').textContent = h ? T('放開', 'Let go') : T('撐回', 'Support');
    $('release').classList.toggle('primary', h);
  }

  // ---------- 蹺蹺板：拖曳與放置 ----------
  function pointerPos(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  function targetAt(cx, cy, kind) {
    const th = theta(), k = V.k;
    const wx = (cx - V.ox) / k, wy = (V.oy - cy) / k;
    const dx = wx - ss.p, dy = wy - SS.H, c = Math.cos(th), s = Math.sin(th);
    const u = dx * c + dy * s, v = -dx * s + dy * c;
    const x = ss.p + u;
    if (x < -0.2 || x > SS.L + 0.2 || v < -0.8 || v > 1.4) return null;
    const xg = clamp(Math.round(x / SS.GRID) * SS.GRID, 0, SS.L);
    const hang = kind !== 'scale' && v < 0;
    return { x: xg, hang: hang };
  }
  function hitTest(pt) {
    const th = theta(), k = V.k, tpx = Math.max(5, SS.THICK * k);
    const pad = Math.max(6, 22 - 0.14 * k);
    if (ss.scale && !held() || ss.scale) {
      const g = scaleGeom(th, tpx);
      if (pt[0] > g.bx - g.bw / 2 - pad && pt[0] < g.bx + g.bw / 2 + pad && pt[1] > g.bTop - pad && pt[1] < g.A[1] + 4) return { what: 'scale' };
    }
    // 板上的物體（由上往下找）
    const map = topStacks();
    let best = null;
    Object.keys(map).forEach(function (key) {
      let v = tpx;
      map[key].forEach(function (it) {
        const K = KINDS[it.kind], w = K.w * k, h = K.h * k;
        const cx = (it.x - ss.p) * k, cy = -(v + h / 2);
        const c = Math.cos(-th), s = Math.sin(-th);
        const ox = X(ss.p) + cx * c - cy * s, oy = Y(SS.H) + cx * s + cy * c;
        const dx = pt[0] - ox, dy = pt[1] - oy;
        const lu = dx * Math.cos(th) - dy * Math.sin(th), lv = dx * Math.sin(th) + dy * Math.cos(th);
        if (Math.abs(lu) <= w / 2 + pad && Math.abs(lv) <= h / 2 + pad * 0.6) best = { what: 'item', item: it };
        v += h + 1;
      });
    });
    if (best) return best;
    for (let i = 0; i < ss.items.length; i++) {
      const it = ss.items[i];
      if (!it.hang) continue;
      const g = hangGeom(it, th);
      if (Math.abs(pt[0] - g.hx) <= g.w / 2 + pad && pt[1] >= g.top - pad && pt[1] <= g.bottom + pad * 0.5) return { what: 'item', item: it };
    }
    const px = X(ss.p), bw = Math.max(18, 0.36 * k);
    if (Math.abs(pt[0] - px) <= bw / 2 + 6 && pt[1] >= Y(SS.H) + 4 && pt[1] <= Y(0) + 4) return { what: 'pivot' };
    return null;
  }
  function updateDragTarget() {
    const dg = ss.drag;
    if (!dg || dg.what === 'pivot') return;
    const tg = targetAt(dg.cx, dg.cy, dg.kind);
    if (tg) tg.problem = dg.kind === 'scale' ? '' : placeProblem(dg.kind, tg.x, tg.hang, dg.item ? dg.item.id : null);
    dg.target = tg;
  }
  function startItemDrag(pt, item, kind) {
    ss.drag = { what: kind === 'scale' ? 'scale' : 'item', item: item || null, kind: kind, cx: pt[0], cy: pt[1], active: true, target: null };
    if (item) { // 拿起來：從板上移除
      ss.drag.orig = { x: item.x, hang: item.hang };
      edit(function () { ss.items = ss.items.filter(function (o) { return o.id !== item.id; }); }, true);
    } else if (kind === 'scale' && ss.scale) {
      ss.drag.orig = { x: ss.scale.x };
      edit(function () { ss.scale = null; }, true);
    }
    updateDragTarget();
    cv.classList.add('grabbing');
  }
  function finishDrag() {
    const dg = ss.drag;
    ss.drag = null;
    cv.classList.remove('grabbing');
    if (!dg) return;
    if (dg.what === 'pivot') { pivotChanged(true); return; }
    const tg = dg.target;
    if (tg && !tg.problem) {
      if (dg.kind === 'scale') placeScale(tg.x);
      else if (dg.item) {
        const it = dg.item;
        edit(function () { ss.items.push({ id: it.id, kind: it.kind, m: it.m, x: tg.x, hang: tg.hang }); });
        setStatus(kindName(it.kind) + T(' 移到 x = ', ' moved to x = ') + num(tg.x, 2) + ' m' + (tg.hang ? T('（吊在板下）', ' (hanging)') : '') + T('。', '.'));
      } else addItem(dg.kind, tg.x, tg.hang);
    } else if (dg.item || dg.kind === 'scale' && dg.orig) {
      setStatus(T('已移除 ', 'Removed the ') + kindName(dg.kind) + T('。', '.'));
      refreshSeesaw();
    } else if (tg && tg.problem) setStatus(tg.problem);
    refreshSeesaw();
    draw();
  }

  function pivotChanged(final) {
    if (!held()) setHeld();
    refreshSeesaw();
    draw();
    if (final) setStatus(T('支點移到 p = ', 'Pivot moved to p = ') + num(ss.p, 3) + ' m' + T('；支架重新撐住木板。', '; the supports hold the board again.'));
  }

  // ================= 模式二：靠牆的梯子 =================
  function ldParams() {
    return { L: LADDER.L, ml: ld.ml, mp: ld.mp, d: ld.mp > 0 ? ld.d : 0, theta: ld.th * D2R, mu: ld.mu, muw: ld.rough ? ld.muw : 0 };
  }
  function ldSnap(extra) { return Object.assign(TC.ladderSnapshot(ldParams()), extra || {}); }
  function ldHeld() { return ld.phase === 'held'; }

  function ladderRelease(cause) {
    const o = ldParams(), r = TC.ladderStatics(o);
    if (r.slips) startSlide(cause || 'release');
    else {
      ld.phase = 'free';
      if (cause === 'release' || !cause) {
        const s = SND();
        if (s) { s.tone({ freq: 784, dur: 0.4, gain: 0.1 }); s.tone({ freq: 1175, dur: 0.35, gain: 0.05, delay: 0.08 }); }
        setStatus(T('梯子站得住：地面需要 ', 'The ladder holds: the floor must supply ') + num(r.fg, 1) + ' N' + T('，最多可以提供 ', ' of friction and can supply up to ') + num(r.fgMax, 1) + ' N' + T('。', '.'));
      }
      emit('ladderStand', ldSnap({ cause: cause || 'release' }));
    }
    refreshLadder();
    kick();
  }
  function startSlide(cause) {
    const o = ldParams(), r = TC.ladderStatics(o);
    emit('ladderSlip', ldSnap({ cause: cause, climbFrom: ld.climb ? ld.climb.from : null }));
    ld.phase = 'slide';
    ld.climb = null;
    ld.slideO = o;
    ld.slide = TC.ladderSlideInit(o);
    const s = SND();
    if (s) { s.noise({ dur: 0.55, filter: 1700, q: 0.7, gain: 0.24, attack: 0.04 }); s.sweep({ from: 620, to: 300, dur: 0.5, gain: 0.05, type: 'triangle' }); }
    setStatus(T('滑倒了！地面需要 ', 'It slips! The floor would need ') + num(r.fg, 1) + ' N' + T(' 的摩擦力，但最多只有 μsN = ', ' of friction but can give only μsN = ') + num(r.fgMax, 1) + ' N' + T('。', '.'));
    $('climb').textContent = T('往上爬', 'Climb up');
    $('climb').classList.remove('on');
  }
  function ladderReset() {
    ld.phase = 'held'; ld.slide = null; ld.climb = null;
    $('climb').textContent = T('往上爬', 'Climb up');
    $('climb').classList.remove('on');
    refreshLadder();
  }
  /** 參數改變（放開滑桿、打完數字、拖曳結束）：放手後的梯子馬上判斷會不會滑 */
  function ladderChanged(final) {
    if (ld.phase === 'slide' || ld.phase === 'down') ladderReset();
    if (ld.phase === 'free') {
      const r = TC.ladderStatics(ldParams());
      if (r.slips) startSlide('change');
      else if (final) emit('ladderStand', ldSnap({ cause: 'change' }));
    }
    refreshLadder();
    draw();
    kick();
  }
  function stepLadder(dt) {
    if (ld.phase === 'slide') {
      const r = TC.ladderSlideAdvance(ld.slideO, ld.slide, dt);
      ld.slide = r.st;
      r.events.forEach(function (e) {
        if (e.type === 'down') {
          const s = SND();
          if (s) { s.noise({ dur: 0.16, filter: 520, q: 0.9, gain: 0.5 }); s.tone({ freq: 262, dur: 0.16, gain: 0.3 }); }
          ld.phase = 'down';
          if (!reducedMotion) state.fx.push({ kind: 'ripple', x: ld.slide.xb + LADDER.L * 0.6, y: 0, t: 0, dur: 0.5 });
          setStatus(T('梯子倒在地上了。按「扶起來」重新放好。', 'The ladder is down. Press “Set up again” to stand it back up.'));
          refreshLadder();
        }
      });
      if (ld.phase === 'slide' && !reducedMotion && Math.random() < dt * 30) {
        const xb = ld.slide.phase === 'wall' ? -LADDER.L * Math.cos(ld.slide.theta) : ld.slide.xb;
        state.fx.push({ kind: 'dust', t: 0, dur: 0.6, p: [0, 1, 2].map(function () { return { x: xb, vx: -0.3 - Math.random() * 0.4, vy: 0.4 + Math.random() * 0.6 }; }) });
      }
    } else if (ld.climb && ld.phase === 'free') {
      const o = ldParams();
      const dSlip = TC.ladderSlipD(o);
      let d = ld.d + 0.4 * dt;
      if (isFinite(dSlip) && dSlip >= ld.d - 1e-9 && dSlip <= Math.min(d, LADDER.L)) {
        setD(Math.max(ld.d, dSlip));
        startSlide('climb');
        refreshLadder();
        return;
      }
      if (d >= LADDER.L) {
        d = LADDER.L; setD(d);
        ld.climb = null;
        $('climb').textContent = T('往上爬', 'Climb up'); $('climb').classList.remove('on');
        setStatus(T('爬到頂端了，梯子還站得住！', 'Made it to the top and the ladder still holds!'));
        emit('ladderStand', ldSnap({ cause: 'climb' }));
      } else setD(d);
      refreshLadder();
    }
  }
  function setD(d) {
    ld.d = d;
    const el = $('ld');
    if (window.LabNum) window.LabNum.clear(el);
    el.value = d;
    $('ldo').textContent = fmtSlider(d, el) + ' m';
  }

  // ---------- 梯子：繪圖 ----------
  function ladderPose() {
    const L = LADDER.L;
    if ((ld.phase === 'slide' || ld.phase === 'down') && ld.slide) {
      const s = ld.slide;
      const xb = s.phase === 'wall' ? -L * Math.cos(s.theta) : s.xb;
      return { xb: xb, th: s.theta, moving: true };
    }
    const th = ld.th * D2R;
    return { xb: -L * Math.cos(th), th: th, moving: false };
  }
  function buildLadderBg() {
    const key = ['ld', cw, ch, dpr, D.ver, ld.mu.toFixed(3), ld.rough, (ld.rough ? ld.muw : 0).toFixed(3)].join('|');
    if (key === bgKey) return;
    bgKey = key;
    bg.width = cv.width; bg.height = cv.height;
    const c = bgc, k = V.k;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(c, cw, ch);
    const g0 = Y(0);
    // 地板：摩擦係數越大紋理越粗
    const gr = c.createLinearGradient(0, g0, 0, ch);
    gr.addColorStop(0, shade(C.floor, C.dark ? 0.06 : -0.02));
    gr.addColorStop(1, shade(C.floor, -0.16));
    c.fillStyle = gr; c.fillRect(0, g0, cw, ch - g0);
    c.fillStyle = alpha(shade(C.floor, 0.5), 0.7); c.fillRect(0, g0, cw, 1);
    let seed = 3;
    const rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const nGrain = Math.round(cw * (0.2 + 1.6 * ld.mu));
    c.fillStyle = alpha(shade(C.floor, -0.45), 0.35);
    for (let i = 0; i < nGrain; i++) c.fillRect(rnd() * cw, g0 + 2 + rnd() * (V.gpx - 4), 1.2, 1.2);
    // 牆
    const wx = X(0), ww = cw - wx;
    const wg = c.createLinearGradient(wx, 0, cw, 0);
    wg.addColorStop(0, shade(C.wall, 0.1)); wg.addColorStop(1, shade(C.wall, -0.12));
    c.fillStyle = wg; c.fillRect(wx, 0, ww, g0);
    c.fillStyle = alpha(shade(C.wall, -0.45), 0.6); c.fillRect(wx, 0, 1.5, g0);
    if (ld.rough) {
      const n = Math.round(g0 * ww * 0.02 * (0.3 + ld.muw));
      c.fillStyle = alpha(shade(C.wall, -0.5), 0.4);
      for (let i = 0; i < n; i++) c.fillRect(wx + 2 + rnd() * (ww - 2), rnd() * g0, 1.3, 1.3);
    } else {
      const sh = c.createLinearGradient(wx, 0, wx + 10, 0);
      sh.addColorStop(0, alpha('#ffffff', C.dark ? 0.12 : 0.4)); sh.addColorStop(1, alpha('#ffffff', 0));
      c.fillStyle = sh; c.fillRect(wx + 1.5, 0, 10, g0);
    }
    c.strokeStyle = alpha(shade(C.wall, -0.4), 0.25); c.lineWidth = 1;
    c.beginPath();
    for (let y = 0.5; y < 4.6; y += 0.5) { c.moveTo(wx + 2, Y(y) + 0.5); c.lineTo(cw, Y(y) + 0.5); }
    c.stroke();
  }
  function drawLadderShape(c, xb, th, alphaK) {
    const k = V.k, L = LADDER.L;
    const bx = X(xb), by = Y(0), tx = X(xb + L * Math.cos(th)), ty = Y(L * Math.sin(th));
    const rw = Math.max(3, 0.05 * k);
    const off = [-Math.max(2.5, 0.035 * k), -Math.max(2, 0.03 * k)]; // 後面那根扶手（略偏左上）
    const rail = mix(C.equi, C.muted, 0.35);
    c.save();
    if (alphaK != null) c.globalAlpha = alphaK;
    D.tube(c, function (g) { g.moveTo(bx + off[0], by + off[1]); g.lineTo(tx + off[0], ty + off[1]); }, shade(rail, -0.18), rw * 0.9);
    // 橫桿
    c.strokeStyle = shade(rail, -0.1); c.lineWidth = Math.max(1.6, rw * 0.55); c.lineCap = 'round';
    c.beginPath();
    for (let s = 0.3; s < L - 0.05; s += 0.3) {
      const x = bx + (tx - bx) * s / L, y = by + (ty - by) * s / L;
      c.moveTo(x + off[0], y + off[1]); c.lineTo(x, y);
    }
    c.stroke();
    D.tube(c, function (g) { g.moveTo(bx, by); g.lineTo(tx, ty); }, rail, rw);
    // 腳墊
    c.fillStyle = shade(C.muted, -0.3);
    c.beginPath(); c.arc(bx, by - 1, rw * 0.7, 0, Math.PI * 2); c.fill();
    c.restore();
    return { bx: bx, by: by, tx: tx, ty: ty };
  }
  /** 爬梯子的人（示意圖，物理上人的重量作用在所站的梯級）：腳踩梯級、身體略往梯子傾、雙手抓住上方的梯子 */
  function drawClimber(c, xb, th, down) {
    if (!(ld.mp > 0)) return;
    const k = V.k, L = LADDER.L, d = Math.min(L, ld.d);
    const body = C['b-optics'], pants = mix(C.field, C.muted, C.dark ? 0.75 : 0.35), skin = C.skin;
    const sc = 0.62 + 0.38 * Math.min(1, ld.mp / 70);   // 體型隨質量略變（示意）
    const H = 1.7 * sc;                                  // 身高（m）
    const hot = ld.hover === 'person' || (ld.drag && ld.drag.what === 'person');
    const P = function (q) { return [X(q[0]), Y(q[1])]; };
    const limb = function (a, b, m, col, w) {
      const A = P(a), B = P(b), M = m ? P(m) : null;
      D.tube(c, function (g) { g.moveTo(A[0], A[1]); if (M) g.lineTo(M[0], M[1]); g.lineTo(B[0], B[1]); }, col, w);
    };
    const wLimb = Math.max(2.6, 0.068 * H * k), wTorso = Math.max(5, 0.135 * H * k);
    c.save();
    if (hot) { c.shadowColor = alpha(C.accent, 0.65); c.shadowBlur = 12; }
    if (down) { // 摔下來坐在地上
      const x0 = xb + d * Math.cos(th);
      const hip = [x0, 0.1 * H], sh = [x0 - 0.06 * H, 0.42 * H], knee = [x0 + 0.24 * H, 0.2 * H], foot = [x0 + 0.42 * H, 0.03 * H];
      limb(hip, foot, knee, pants, wLimb);
      limb(hip, sh, null, body, wTorso);
      limb(sh, [x0 + 0.1 * H, 0.08 * H], [x0 - 0.02 * H, 0.22 * H], shade(body, -0.12), wLimb * 0.85);
      c.restore();
      const hp = P([sh[0] - 0.02 * H, sh[1] + 0.1 * H]);
      D.ball(c, hp[0], hp[1], 0.068 * H * k, skin, { glow: 0 });
      return;
    }
    const cs = Math.cos(th), sn = Math.sin(th);
    const at = function (s) { s = clamp(s, 0, L); return [xb + s * cs, s * sn]; };
    const ladX = function (y) { return xb + y / Math.max(1e-6, Math.tan(th)); }; // 梯子在高度 y 的水平位置
    const F1 = at(d), F2 = at(Math.min(L, d + 0.3));
    const hip = [F1[0] - 0.03 * H, F1[1] + 0.47 * H];
    // 上身往梯子傾：肩膀離梯子約 0.45 m（最多傾 35°）
    const ys0 = hip[1] + 0.3 * H;
    const lean = clamp(Math.atan2(ladX(ys0) - 0.45 - hip[0], 0.3 * H), 0, 35 * D2R);
    const bdir = [Math.sin(lean), Math.cos(lean)];
    const sh = [hip[0] + bdir[0] * 0.3 * H, hip[1] + bdir[1] * 0.3 * H];
    const head = [sh[0] + bdir[0] * 0.105 * H, sh[1] + bdir[1] * 0.105 * H];
    // 手抓住離肩膀最近的梯子位置（稍微往上），但不超過手臂能及的範圍
    const sNear = (sh[0] - xb) * cs + sh[1] * sn;
    const sHand = clamp(sNear + 0.12 * H, d + 0.2, Math.min(L, d + 0.75 * H));
    const hand = at(sHand);
    // 關節：大腿、小腿各 0.25 H，膝蓋往前（朝牆）彎
    const joint = function (a, b, len, forward) {
      const dx = b[0] - a[0], dy = b[1] - a[1], D2 = Math.hypot(dx, dy) || 1e-6;
      const half = Math.min(D2 / 2, len), off = Math.sqrt(Math.max(0, len * len - half * half));
      let nx = -dy / D2, ny = dx / D2;
      if ((forward ? nx : -nx) < 0) { nx = -nx; ny = -ny; }
      return [a[0] + dx / 2 + nx * off, a[1] + dy / 2 + ny * off];
    };
    // 膝蓋不可穿過梯子
    const knee = function (f) { const q = joint(hip, f, 0.25 * H, true); q[0] = Math.min(q[0], ladX(q[1]) - 0.06); return q; };
    const k1 = knee(F1), k2 = knee(F2);
    const el = joint(sh, hand, 0.17 * H, false);
    // 後面的腿與手臂（較暗），再畫身體、前面的腿、頭、手臂
    limb(hip, F2, k2, shade(pants, -0.2), wLimb * 0.95);
    limb(sh, hand, el, shade(body, -0.3), wLimb * 0.8);
    limb(hip, sh, null, body, wTorso);
    limb(hip, F1, k1, pants, wLimb);
    c.restore();
    const hp = P(head);
    D.ball(c, hp[0], hp[1], 0.072 * H * k, skin, { glow: 0, shadow: false });
    c.save();
    limb(sh, hand, joint(sh, hand, 0.17 * H, false), shade(body, -0.05), wLimb * 0.85);
    // 手掌與鞋子
    const Hd = P(hand), Ft = P(F1);
    c.fillStyle = skin;
    c.beginPath(); c.arc(Hd[0], Hd[1], Math.max(2, wLimb * 0.45), 0, Math.PI * 2); c.fill();
    c.fillStyle = shade(pants, -0.3);
    D.roundRect(c, Ft[0] - wLimb * 0.6, Ft[1] - wLimb * 0.55, wLimb * 1.6, wLimb * 0.7, wLimb * 0.3); c.fill();
    c.restore();
  }
  function drawLadder() {
    buildLadderBg();
    const c = ctx, k = V.k, L = LADDER.L;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.drawImage(bg, 0, 0, cw, ch);
    placed = [];
    const o = ldParams(), r = TC.ladderStatics(o), pose = ladderPose();
    const down = ld.phase === 'down';
    // 臨界角的虛線梯子
    if (ld.show.crit && !pose.moving && r.thetaC > 0 && r.thetaC < Math.PI / 2) {
      const tc = r.thetaC;
      c.save();
      c.setLineDash([6, 5]);
      c.strokeStyle = alpha(C.muted, 0.75); c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(X(-L * Math.cos(tc)), Y(0)); c.lineTo(X(0), Y(L * Math.sin(tc))); c.stroke();
      c.restore();
      const mx = -L * Math.cos(tc) * 0.55, my = L * Math.sin(tc) * 0.45;
      placeLabel(c, sub('θ', 'c', ' = ' + num(tc / D2R, 1) + '°'), X(mx) - 6, Y(my) + 4, C.muted, 'right', fnt(11.5, 650));
    }
    // 影子、梯子、擋塊
    D.contactShadow(c, X(pose.xb + L * Math.cos(pose.th) / 2), Y(0), L * Math.cos(pose.th) * k * 0.45, 0.6);
    if (ldHeld()) {
      const bx = X(pose.xb), s = Math.max(10, 0.12 * k);
      c.save();
      c.beginPath(); c.moveTo(bx - 4, Y(0)); c.lineTo(bx - 4 - s, Y(0)); c.lineTo(bx - 4, Y(0) - s * 0.8); c.closePath();
      c.fillStyle = mix(C.muted, C['canvas-bg'], 0.15); c.fill();
      c.strokeStyle = alpha(shade(C.muted, -0.4), 0.7); c.lineWidth = 1; c.stroke();
      c.restore();
    }
    const P = drawLadderShape(c, pose.xb, pose.th);
    drawClimber(c, pose.xb, pose.th, down);
    if (ld.hover === 'top' || (ld.drag && ld.drag.what === 'top')) {
      c.save(); c.strokeStyle = alpha(C.accent, 0.8); c.lineWidth = 2;
      c.beginPath(); c.arc(P.tx, P.ty, 9, 0, Math.PI * 2); c.stroke(); c.restore();
    }
    // 角度弧
    if (!down) {
      const ar = Math.max(26, 0.45 * k);
      c.save();
      c.strokeStyle = alpha(C.text, 0.55); c.lineWidth = 1.2;
      c.beginPath(); c.arc(P.bx, P.by, ar, -pose.th, 0); c.stroke();
      c.restore();
      D.haloText(c, 'θ = ' + num(pose.th / D2R, 1) + '°', P.bx + ar + 5, P.by - 6, C.text, 'left', 'alphabetic', fnt(12, 650));
      placed.push({ x: P.bx + ar, y: P.by - 20, w: 80, h: 18 });
    }
    // 力（依比例）
    if (ld.show.f && !pose.moving) drawLadderForces(c, o, r, P);
    drawLadderGauge(c, r);
    drawFx(c);
    // 狀態
    let txt, col = C.muted;
    if (ldHeld()) txt = T('底端有擋塊頂住', 'Foot held by a stop');
    else if (ld.phase === 'free') { txt = ld.climb ? T('往上爬…', 'Climbing…') : T('站得住', 'Holding'); col = C.probe; }
    else if (ld.phase === 'slide') { txt = T('滑倒中！', 'Slipping!'); col = C.pos; }
    else { txt = T('倒在地上', 'Fallen'); col = C.pos; }
    const b = D.pill(c, txt, 8, 28, col, 'left', fnt(12.5, 700));
    placed.push(b);
    drawKbFocus(c);
  }
  function sub(main, s, rest) { return [[main, 0], [s, 1], [rest || '', 0]]; }
  function drawLadderForces(c, o, r, P) {
    const k = V.k, L = LADDER.L, th = o.theta;
    const fmax = Math.max(r.W, r.Ng, r.Nw, r.fg, r.fgMax, 50);
    const top = niceCeil(fmax);
    const lx = -L * Math.cos(th) / 2, ly = L * Math.sin(th) / 2;
    // 比例：最大的力約 1 m 長；梯子重量的箭頭不可穿過地板
    let s = Math.min(1.1 * k, (Y(0) - 40) * 0.42) / top; // px/N
    if (r.Wl > 0) s = Math.min(s, (ly * k - 8) / r.Wl);
    const lw = 2.6, fS = fnt(11, 600);
    const heldNow = ldHeld();
    const tW = T('梯', 'ladder'), tP = T('人', 'person'), tG = T('地', 'floor'), tWall = T('牆', 'wall');
    // 重力：梯子的重量從重心往下；人的重量壓在所站的梯級上（箭頭尖端在梯級）
    D.arrow(c, X(lx), Y(ly), X(lx), Y(ly) + r.Wl * s, C.neg, lw);
    placeLabel(c, sub('W', tW, ' ' + num(r.Wl, 0) + ' N'), X(lx) + 7, Y(ly) + r.Wl * s * 0.55, C.neg, 'left', fS, false, 1);
    if (o.mp > 0) {
      const px = -L * Math.cos(th) + o.d * Math.cos(th), py = o.d * Math.sin(th), len = r.Wp * s;
      D.arrow(c, X(px), Y(py) - len, X(px), Y(py), C.neg, lw);
      placeLabel(c, sub('W', tP, ' ' + num(r.Wp, 0) + ' N'), X(px) + 7, Y(py) - len + 8, C.neg, 'left', fS, false, -1);
    }
    // 地面：正向力往上、摩擦力朝牆（畫在地板裡，最大靜摩擦力用刻線標出）
    D.arrow(c, P.bx, P.by, P.bx, P.by - r.Ng * s, C.accent, lw);
    placeLabel(c, sub('N', tG, ' ' + num(r.Ng, 0) + ' N'), P.bx - 7, P.by - r.Ng * s + 8, C.accent, 'right', fS, true);
    const fl = r.fg * s, cap = r.fgMax * s, fy = P.by + Math.min(12, V.gpx * 0.38);
    if (r.fg > 1e-6) D.arrow(c, P.bx, fy, P.bx + fl, fy, C.pos, lw, heldNow ? { dash: [5, 4] } : {});
    if (o.mu > 0) {
      c.save();
      c.strokeStyle = r.slips ? C.pos : C.probe; c.lineWidth = 2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(P.bx + cap, fy - 6); c.lineTo(P.bx + cap, fy + 6); c.stroke();
      c.restore();
    }
    if (r.fg > 1e-6) placeLabel(c, sub('f', tG, ' ' + num(r.fg, 0) + ' N'), P.bx + Math.max(fl, cap) + 7, fy, C.pos, 'left', fS, true, 1);
    // 牆：正向力往外、摩擦力往上
    if (r.Nw > 1e-6) {
      D.arrow(c, P.tx, P.ty, P.tx - r.Nw * s, P.ty, C.accent, lw);
      placeLabel(c, sub('N', tWall, ' ' + num(r.Nw, 0) + ' N'), P.tx - r.Nw * s - 7, P.ty, C.accent, 'right', fS, true, -1);
    }
    if (r.fw > 1e-6) {
      D.arrow(c, P.tx - 5, P.ty, P.tx - 5, P.ty - r.fw * s, C.pos, lw);
      placeLabel(c, sub('f', tWall, ' ' + num(r.fw, 0) + ' N'), P.tx - 12, P.ty - r.fw * s, C.pos, 'right', fS, false, -1);
    }
    // 比例尺（地板上，左下角）
    const unit = top / 2, bl = unit * s, bx = 12, by = ch - 8;
    c.save();
    c.strokeStyle = alpha(C.text, 0.65); c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(bx, by - 2); c.lineTo(bx + bl, by - 2); c.moveTo(bx, by - 5); c.lineTo(bx, by + 1); c.moveTo(bx + bl, by - 5); c.lineTo(bx + bl, by + 1); c.stroke();
    c.restore();
    D.haloText(c, num(unit, 0) + ' N', bx + bl + 6, by + 1, C.muted, 'left', 'alphabetic', fnt(10.5, 600));
    placed.push({ x: bx - 2, y: by - 14, w: bl + 50, h: 18 });
  }
  function drawLadderGauge(c, r) {
    // 左上角：需要的地面摩擦力 vs 最大靜摩擦力（窄螢幕、大字時標題放不下就把「站得住／會滑」移到下一行）
    const x0 = 8, y0 = 38;
    const f1 = fnt(11.5, 650), f2 = fnt(10.5, 600);
    const tG = T('地', 'floor');
    const title = [[T('地面摩擦力 ', 'Floor friction '), 0], ['f', 0], [tG, 1]];
    const ok = !r.slips;
    const tag = ok ? T('站得住', 'holds') : T('不夠 → 會滑', 'too little → slips');
    const maxLine = [[T('最多 ', 'max '), 0], ['μ', 0], ['s', 1], ['N', 0], [tG, 1], [' = ' + num(r.fgMax, 1) + ' N', 0]];
    const tw = richWidth(c, title, f1), gw = richWidth(c, tag, f1), mw = richWidth(c, maxLine, f2);
    const wMax = Math.max(140, cw - 16);
    let w = Math.min(wMax, Math.max(156, Math.min(230, cw * 0.32), mw + 20));
    let split = false;
    if (tw + gw + 34 > w) {
      if (tw + gw + 34 <= Math.min(wMax, 300)) w = tw + gw + 34;
      else { split = true; w = Math.min(wMax, Math.max(w, tw + 20, gw + 20)); }
    }
    c.font = f1;
    const lh = D.textHeight(c.measureText('Mg'), 14);
    const extra = split ? lh + 4 : 0;
    const h = lh * 3 + 34 + extra;
    c.save();
    D.roundRect(c, x0, y0, w, h, 9);
    c.fillStyle = alpha(C['canvas-bg'], C.dark ? 0.84 : 0.9); c.fill();
    c.strokeStyle = alpha(C.border, 0.9); c.lineWidth = 1; c.stroke();
    c.restore();
    placed.push({ x: x0, y: y0, w: w, h: h });
    const yT = y0 + lh / 2 + 7;
    richText(c, title, x0 + 10, yT, C.text, f1, true);
    if (split) D.haloText(c, tag, x0 + 10, yT + lh + 4, ok ? C.probe : C.pos, 'left', 'middle', f1);
    else D.haloText(c, tag, x0 + w - 10, yT, ok ? C.probe : C.pos, 'right', 'middle', f1);
    const top = Math.max(r.fg, r.fgMax, 1) * 1.08;
    const bw = w - 20, bh = 7;
    const yA = y0 + lh + 12 + extra, yB = yA + bh + lh + 5;
    // 需要
    c.fillStyle = alpha(C.pos, 0.14); D.roundRect(c, x0 + 10, yA, bw, bh, 3); c.fill();
    c.fillStyle = C.pos; D.roundRect(c, x0 + 10, yA, Math.max(2, bw * Math.min(1, r.fg / top)), bh, 3); c.fill();
    richText(c, [[T('需要 ', 'needed ') + num(r.fg, 1) + ' N', 0]], x0 + 10, yA + bh + lh / 2 + 2, C.pos, f2, true);
    // 最多
    c.strokeStyle = C.accent; c.lineWidth = 1.5;
    D.roundRect(c, x0 + 10.5, yB + 0.5, Math.max(2, bw * Math.min(1, r.fgMax / top)) - 1, bh - 1, 3); c.stroke();
    richText(c, maxLine, x0 + 10, yB + bh + lh / 2 + 2, C.accent, f2, true);
  }
  // ---------- 梯子：讀數 ----------
  function refreshLadder() {
    if (state.mode !== 'ladder') return;
    const o = ldParams(), r = TC.ladderStatics(o);
    let st;
    if (ldHeld()) st = T('擋塊頂住', 'Held by the stop') + '<small>' + (r.slips ? T('放手會滑', 'would slip if let go') : T('放手也站得住', 'would hold if let go')) + '</small>';
    else if (ld.phase === 'free') st = T('站得住', 'Holding');
    else if (ld.phase === 'slide') st = T('滑倒中', 'Slipping');
    else st = T('倒在地上', 'Fallen');
    $('lState').innerHTML = st;
    $('lW').innerHTML = num(r.W, 1) + ' N<small>' + num(r.Wl, 1) + ' + ' + num(r.Wp, 1) + '</small>';
    $('lNg').textContent = num(r.Ng, 2) + ' N';
    $('lfg').textContent = num(r.fg, 2) + ' N';
    $('lfg').className = r.slips ? 'bad' : '';
    $('lfmax').textContent = num(r.fgMax, 2) + ' N';
    $('lfmax').className = r.slips ? 'bad' : 'ok';
    $('lNw').textContent = num(r.Nw, 2) + ' N';
    $('lfw').innerHTML = o.muw > 0 ? num(r.fw, 2) + ' N<small>' + T('最多 μwN = ', 'max μwN = ') + num(r.fwMax, 2) + ' N</small>' : T('0（光滑）', '0 (smooth)');
    $('lthc').textContent = r.thetaC <= 0 ? T('任何角度都不滑', 'never slips') : num(r.thetaC / D2R, 2) + '°';
    $('lmumin').textContent = num(r.muMin, 3);
    let ds;
    if (!(o.mp > 0)) ds = T('（沒有人）', '(nobody)');
    else if (r.dSlip >= LADDER.L) ds = T('頂端也不滑', 'the top, safely');
    else if (r.dSlip < 0) ds = T('一站上去就滑', 'nowhere: it slips at once');
    else ds = 'd = ' + num(r.dSlip, 3) + ' m<small>' + T('再往上就會滑', 'any higher and it slips') + '</small>';
    $('ldslip').innerHTML = ds;
    $('lRoughNote').hidden = !ld.rough;
    $('release').textContent = ldHeld() ? T('放手', 'Let go') : T('扶起來', 'Set up again');
    $('release').classList.toggle('primary', ldHeld());
    $('climb').disabled = !(ld.mp > 0) || ld.phase === 'slide' || ld.phase === 'down' || ld.d >= LADDER.L - 1e-9;
  }

  // ================= 主迴圈 =================
  let raf = 0, lastT = 0;
  function needsAnim() {
    if (state.fx.length) return true;
    if (state.mode === 'seesaw') return ssMoving() || ss.supportFx > 0;
    return ld.phase === 'slide' || !!ld.climb;
  }
  function kick() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); } }
  function frame(now) {
    raf = 0;
    const dt = Math.min(1 / 30, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    const sdt = dt * (state.slow ? 0.25 : 1);
    if (state.mode === 'seesaw') {
      if (ssMoving()) { stepSeesaw(sdt); refreshSeesaw(); }
      if (ss.supportFx > 0) ss.supportFx = Math.max(0, ss.supportFx - dt / 0.22);
    } else stepLadder(sdt);
    state.fx.forEach(function (f) { f.t += dt; });
    state.fx = state.fx.filter(function (f) { return f.t < f.dur; });
    draw();
    if (needsAnim()) raf = requestAnimationFrame(frame);
  }
  function draw() {
    if (!V) return;
    if (state.mode === 'seesaw') drawSeesaw(); else drawLadder();
  }
  function setStatus(s) { $('status').textContent = s; }

  // ================= 控制項 =================
  // 喇叭按鈕
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
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
  });
  updateSoundButton();
  $('slow').addEventListener('change', function (ev) { state.slow = ev.target.checked; });

  $('release').addEventListener('click', function () {
    if (state.mode === 'seesaw') {
      if (held()) release();
      else { setHeld(); setStatus(T('支架重新撐住木板。', 'The supports hold the board again.')); draw(); }
    } else {
      if (ldHeld()) ladderRelease('release');
      else { ladderReset(); setStatus(T('梯子扶起來了，底端有擋塊頂住。', 'The ladder is set up again with its foot against the stop.')); draw(); }
    }
  });
  $('clearAll').addEventListener('click', function () {
    ss.items = []; ss.scale = null; ss.tool = null;
    syncChips();
    setHeld();
    rebuildKeys();
    setStatus(T('已全部清除：移除所有物體與彈簧秤，木板回到支架上（滑桿設定不變）。', 'Cleared: every object and the spring scale are removed and the board is back on its supports (sliders kept).'));
    draw();
  });
  $('climb').addEventListener('click', function () {
    if (ld.climb) {
      ld.climb = null;
      $('climb').textContent = T('往上爬', 'Climb up'); $('climb').classList.remove('on');
      if (ld.phase === 'free') emit('ladderStand', ldSnap({ cause: 'climbStop' }));
      refreshLadder();
      return;
    }
    if (!(ld.mp > 0) || ld.d >= LADDER.L - 1e-9) return;
    if (ldHeld()) { ladderRelease('release'); if (ld.phase !== 'free') return; }
    if (ld.phase !== 'free') return;
    ld.climb = { from: ld.d };
    $('climb').textContent = T('停', 'Stop'); $('climb').classList.add('on');
    setStatus(T('人沿梯子往上爬（0.4 m/s）…', 'The person climbs at 0.4 m/s…'));
    kick();
  });

  // ---------- 蹺蹺板的滑桿 ----------
  const elM = $('mass'), elP = $('pivot');
  function showSS() {
    $('masso').textContent = fmtSlider(val(elM), elM) + ' kg';
    $('pivoto').textContent = fmtSlider(val(elP), elP) + ' m';
  }
  elM.addEventListener('input', function () { ss.M = val(elM); showSS(); if (!held()) setHeld(); refreshSeesaw(); draw(); });
  elP.addEventListener('input', function () { ss.p = val(elP); showSS(); if (!held()) setHeld(); refreshSeesaw(); draw(); });
  elM.addEventListener('change', function () { setStatus(ss.M === 0 ? T('M = 0：輕桿（木板沒有重量）。', 'M = 0: a light rod (the board weighs nothing).') : T('木板質量 M = ', 'Board mass M = ') + num(ss.M, 2) + ' kg' + T('；支架重新撐住木板。', '; the supports hold the board again.')); });
  elP.addEventListener('change', function () { pivotChanged(true); });

  // ---------- 工具箱 ----------
  const chips = Array.prototype.slice.call(document.querySelectorAll('#toolbox .chip'));
  function syncChips() {
    chips.forEach(function (b) { b.setAttribute('aria-pressed', String(ss.tool === b.dataset.kind)); });
    cv.classList.toggle('place', !!ss.tool);
  }
  chips.forEach(function (b) {
    let start = null, dragged = false;
    b.addEventListener('pointerdown', function (ev) {
      if (ev.button && ev.button !== 0) return;
      start = [ev.clientX, ev.clientY, ev.pointerId];
      dragged = false;
      try { b.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    });
    b.addEventListener('pointermove', function (ev) {
      if (!start || ev.pointerId !== start[2]) return;
      const r = cv.getBoundingClientRect();
      const pt = [ev.clientX - r.left, ev.clientY - r.top];
      if (!dragged && Math.hypot(ev.clientX - start[0], ev.clientY - start[1]) > 6) {
        dragged = true;
        startItemDrag(pt, null, b.dataset.kind);
      }
      if (dragged && ss.drag) { ss.drag.cx = pt[0]; ss.drag.cy = pt[1]; updateDragTarget(); draw(); }
    });
    const end = function (ev) {
      if (!start || ev.pointerId !== start[2]) return;
      start = null;
      if (dragged && ss.drag) {
        const r = cv.getBoundingClientRect();
        const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
        if (!inside) ss.drag.target = null;
        finishDrag();
        b.dataset.justDragged = '1';
        setTimeout(function () { delete b.dataset.justDragged; }, 0);
      }
    };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', function (ev) { if (ss.drag) { ss.drag.target = null; finishDrag(); } start = null; void ev; });
    b.addEventListener('click', function () {
      if (b.dataset.justDragged) return;
      ss.tool = ss.tool === b.dataset.kind ? null : b.dataset.kind;
      syncChips();
      setStatus(ss.tool ? T('已選 ', 'Selected: ') + kindName(ss.tool) + T('。點板上的格點放置：點在板子上方就放上去，點在下方就吊起來；再按一次按鈕取消。', '. Tap a point on the board: above the board to put it on top, below to hang it. Tap the button again to stop.') : '');
      draw();
    });
  });

  // ---------- 精確放置 ----------
  (function () {
    const sel = $('pX');
    for (let x = 0; x <= SS.L + 1e-9; x += SS.GRID) {
      const o = document.createElement('option');
      o.value = x.toFixed(2); o.textContent = x.toFixed(2) + ' m';
      if (Math.abs(x - 1) < 1e-9) o.selected = true;
      sel.appendChild(o);
    }
  })();
  $('pTop').addEventListener('click', function () { addItem($('pKind').value, +$('pX').value, false); });
  $('pHang').addEventListener('click', function () {
    const kind = $('pKind').value;
    if (kind === 'scale') { setStatus(T('彈簧秤只能往上拉：請用「放在板上」。', 'The spring scale only pulls up: use “Put on top”.')); return; }
    addItem(kind, +$('pX').value, true);
  });
  $('pDel').addEventListener('click', function () {
    const x = +$('pX').value;
    const n = ss.items.filter(function (o) { return Math.abs(o.x - x) < 1e-9; }).length + (ss.scale && Math.abs(ss.scale.x - x) < 1e-9 ? 1 : 0);
    edit(function () {
      ss.items = ss.items.filter(function (o) { return Math.abs(o.x - x) > 1e-9; });
      if (ss.scale && Math.abs(ss.scale.x - x) < 1e-9) ss.scale = null;
    });
    setStatus(n ? T('清空了 x = ', 'Cleared x = ') + num(x, 2) + ' m' + T('。', '.') : T('這一格本來就是空的。', 'That point was already empty.'));
  });

  // ---------- 畫布指標 ----------
  cv.addEventListener('pointerdown', function (ev) {
    if (ev.button && ev.button !== 0) return;
    const pt = pointerPos(ev);
    if (state.mode === 'seesaw') {
      const h = hitTest(pt);
      if (h && h.what === 'item') { startItemDrag(pt, h.item, h.item.kind); }
      else if (h && h.what === 'scale') { startItemDrag(pt, null, 'scale'); }
      else if (h && h.what === 'pivot') { ss.drag = { what: 'pivot', active: true, dx: pt[0] - X(ss.p) }; cv.classList.add('grabbing'); }
      else if (ss.tool) {
        const tg = targetAt(pt[0], pt[1], ss.tool);
        if (tg) addItem(ss.tool, tg.x, tg.hang);
        else setStatus(T('點在木板的格點附近（上方或下方）。', 'Tap near a point of the board (above or below it).'));
        draw();
        return;
      } else return;
      try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
      ev.preventDefault();
      draw();
    } else {
      const h = ladderHit(pt);
      if (!h) return;
      ld.drag = { what: h };
      try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
      ev.preventDefault();
      cv.classList.add('grabbing');
      ladderDrag(pt);
    }
  });
  cv.addEventListener('pointermove', function (ev) {
    const pt = pointerPos(ev);
    if (state.mode === 'seesaw') {
      const dg = ss.drag;
      if (dg && dg.what === 'pivot') {
        const x = clamp(Math.round(((pt[0] - dg.dx - V.ox) / V.k) / 0.05) * 0.05, SS.P_MIN, SS.P_MAX);
        if (Math.abs(x - ss.p) > 1e-9) {
          ss.p = x;
          if (window.LabNum) window.LabNum.clear(elP);
          elP.value = x;
          showSS();
          if (!held()) setHeld();
          refreshSeesaw();
        }
        draw();
        return;
      }
      if (dg) { dg.cx = pt[0]; dg.cy = pt[1]; updateDragTarget(); draw(); return; }
      const h = hitTest(pt);
      const hv = h ? (h.what === 'item' ? h.item.id : h.what) : null;
      if (hv !== ss.hover) { ss.hover = hv; draw(); }
      cv.classList.toggle('grab', !!h);
    } else {
      if (ld.drag) { ladderDrag(pt); return; }
      const h = ladderHit(pt);
      if (h !== ld.hover) { ld.hover = h; draw(); }
      cv.classList.toggle('grab', !!h);
    }
  });
  function endPointer() {
    if (state.mode === 'seesaw') { if (ss.drag) finishDrag(); }
    else if (ld.drag) {
      ld.drag = null;
      cv.classList.remove('grabbing');
      ladderChanged(true);
    }
  }
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);
  cv.addEventListener('pointerleave', function () {
    if (state.mode === 'seesaw' && ss.hover && !ss.drag) { ss.hover = null; draw(); }
    if (state.mode === 'ladder' && ld.hover && !ld.drag) { ld.hover = null; draw(); }
  });
  window.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && ss.tool) { ss.tool = null; syncChips(); setStatus(''); draw(); }
  });

  // ---------- 梯子的拖曳 ----------
  function ladderHit(pt) {
    if (ld.phase === 'slide' || ld.phase === 'down') return null;
    const pose = ladderPose(), k = V.k, L = LADDER.L;
    const tx = X(pose.xb + L * Math.cos(pose.th)), ty = Y(L * Math.sin(pose.th));
    if (Math.hypot(pt[0] - tx, pt[1] - ty) < 24) return 'top';
    if (ld.mp > 0) {
      const fx = X(pose.xb + ld.d * Math.cos(pose.th)), fy = Y(ld.d * Math.sin(pose.th));
      if (pt[0] > fx - 0.4 * k - 10 && pt[0] < fx + 0.25 * k + 10 && pt[1] < fy + 10 && pt[1] > fy - 1.7 * k) return 'person';
    }
    return null;
  }
  const elTh = $('lth'), elMu = $('lmu'), elMl = $('lml'), elMp = $('lmp'), elD = $('ld'), elMuw = $('lmuw');
  function ladderDrag(pt) {
    const L = LADDER.L, k = V.k;
    if (ld.drag.what === 'top') {
      const y = (V.oy - pt[1]) / k;
      const th = clamp(Math.round(Math.asin(clamp(y / L, -1, 1)) / D2R * 10) / 10, LADDER.TH_MIN, LADDER.TH_MAX);
      if (th !== ld.th) {
        ld.th = th;
        if (window.LabNum) window.LabNum.clear(elTh);
        elTh.value = th;
        showLD();
        ladderChanged(false);
      }
    } else if (ld.drag.what === 'person') {
      const pose = ladderPose();
      const wx = (pt[0] - V.ox) / k, wy = (V.oy - pt[1]) / k;
      const d = clamp(Math.round(((wx - pose.xb) * Math.cos(pose.th) + wy * Math.sin(pose.th)) / 0.05) * 0.05, 0, L);
      if (d !== ld.d) {
        ld.d = d;
        if (window.LabNum) window.LabNum.clear(elD);
        elD.value = d;
        showLD();
        ladderChanged(false);
      }
    }
    draw();
  }

  // ---------- 梯子的滑桿 ----------
  function showLD() {
    $('ltho').textContent = fmtSlider(val(elTh), elTh) + '°';
    $('lmuo').textContent = fmtSlider(val(elMu), elMu);
    $('lmlo').textContent = fmtSlider(val(elMl), elMl) + ' kg';
    $('lmpo').textContent = fmtSlider(val(elMp), elMp) + ' kg';
    $('ldo').textContent = fmtSlider(val(elD), elD) + ' m';
    $('lmuwo').textContent = fmtSlider(val(elMuw), elMuw);
  }
  function readLD() {
    ld.th = val(elTh); ld.mu = val(elMu); ld.ml = val(elMl); ld.mp = val(elMp); ld.d = val(elD); ld.muw = val(elMuw);
  }
  [elTh, elMu, elMl, elMp, elD, elMuw].forEach(function (el) {
    el.addEventListener('input', function () {
      readLD(); showLD();
      if (el === elMu || el === elMuw) bgKey = '';
      if (ld.climb && el !== elD) { ld.climb = null; $('climb').textContent = T('往上爬', 'Climb up'); $('climb').classList.remove('on'); }
      ladderChanged(false);
    });
    el.addEventListener('change', function () {
      readLD(); ladderChanged(true);
      if (ldHeld() && state.mode === 'ladder') setStatus(ladderText());
    });
  });
  function setWall(rough) {
    ld.rough = rough;
    $('wallSmooth').setAttribute('aria-pressed', String(!rough));
    $('wallRough').setAttribute('aria-pressed', String(rough));
    $('muwBox').hidden = !rough;
    bgKey = '';
    ladderChanged(true);
  }
  $('wallSmooth').addEventListener('click', function () { if (ld.rough) setWall(false); });
  $('wallRough').addEventListener('click', function () { if (!ld.rough) setWall(true); });
  $('showLF').addEventListener('change', function (ev) { ld.show.f = ev.target.checked; draw(); });
  $('showCrit').addEventListener('change', function (ev) { ld.show.crit = ev.target.checked; draw(); });
  [['showF', 'f'], ['showArm', 'arm'], ['showTau', 'tau'], ['showCM', 'cm']].forEach(function (p) {
    $(p[0]).addEventListener('change', function (ev) { ss.show[p[1]] = ev.target.checked; draw(); });
  });

  // ---------- 分頁 ----------
  const tabs = [$('tabSeesaw'), $('tabLadder')];
  function setMode(mode, focus) {
    state.mode = mode;
    const s = mode === 'seesaw';
    tabs.forEach(function (t) {
      const on = t.dataset.mode === mode;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    document.querySelectorAll('[data-for]').forEach(function (el) { el.hidden = el.dataset.for !== mode; });
    $('toolbox').hidden = !s;
    $('clearAll').hidden = !s;
    $('climb').hidden = s;
    $('legSeesaw').hidden = !s; $('legLadder').hidden = s;
    $('hintSeesaw').hidden = !s; $('hintLadder').hidden = s;
    state.fx = [];
    ss.drag = null; ld.drag = null; ss.hover = null; ld.hover = null;
    // 只維護 #ladder；分享連結的 #s=… 留給 classroom.js
    if (!location.hash || location.hash === '#ladder') {
      try { history.replaceState(null, '', s ? location.pathname + location.search : '#ladder'); } catch (e) { /* 忽略 */ }
    }
    setStatus('');
    resize();
    if (s) refreshSeesaw(); else refreshLadder();
    rebuildKeys();
    if (kb) kb.select(0); // 換模式時鍵盤選取回到第一個物件（支點／梯子頂端）
    kick();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { if (t.dataset.mode !== state.mode) setMode(t.dataset.mode); });
    t.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        const j = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : 1 - i;
        setMode(tabs[j].dataset.mode, true);
      }
    });
  });

  // ---------- 鍵盤操作（js/keys.js）：與拖曳完全相同的限制與事件 ----------
  function netText() {
    const tq = TC.torques(cfgNow(), theta(), held() ? null : ss.dyn.grounded);
    return T('淨力矩 Στ = ', 'net torque Στ = ') + sgn(tq.net, 2) + ' N·m';
  }
  function ladderText() {
    const r = TC.ladderStatics(ldParams());
    return (r.slips ? T('放手會滑：', 'It would slip: ') : T('放手站得住：', 'It would hold: ')) +
      T('地面需要摩擦力 ', 'the floor must supply ') + num(r.fg, 1) + ' N' + T('，最多 ', ' of friction, at most ') + num(r.fgMax, 1) + ' N' +
      T('；臨界角 θc = ', '; critical angle θc = ') + (r.thetaC > 0 ? num(r.thetaC / D2R, 2) + '°' : T('無（任何角度都不滑）', 'none (never slips)')) + T('。', '.');
  }
  function stackOffset(it) {
    const tpx = Math.max(5, SS.THICK * V.k);
    let v = tpx;
    for (let i = 0; i < ss.items.length; i++) {
      const o = ss.items[i];
      if (o === it) break;
      if (!o.hang && Math.abs(o.x - it.x) < 1e-9) v += KINDS[o.kind].h * V.k + 1;
    }
    return v;
  }
  function itemBox(it) {
    const th = theta(), K = KINDS[it.kind], w = K.w * V.k, h = K.h * V.k;
    if (it.hang) { const g = hangGeom(it, th); return [g.hx - g.w / 2, g.top - 6, g.w, g.bottom - g.top + 6]; }
    const P = boardPt(it.x, th, stackOffset(it) + h / 2);
    const cs = Math.abs(Math.cos(th)), sn = Math.abs(Math.sin(th));
    const ew = (w * cs + h * sn) / 2, eh = (w * sn + h * cs) / 2;
    return [P[0] - ew, P[1] - eh, 2 * ew, 2 * eh];
  }
  function itemText(it) {
    return kindName(it.kind) + T('：x = ', ' at x = ') + num(it.x, 2) + ' m' + (it.hang ? T('，吊在板下', ', hanging') : T('，放在板上', ', on top')) + T('；', '; ') + netText() + T('。', '.');
  }
  function keyMoveItem(it, dx, dy, big) {
    if (dy) { // 上：放到板上；下：吊到板下（只有砝碼）
      const hang = dy < 0;
      if (hang === !!it.hang) return false;
      const why = placeProblem(it.kind, it.x, hang, it.id);
      if (why) { setStatus(why); return false; }
      edit(function () { it.hang = hang; });
      setStatus(itemText(it));
      return true;
    }
    const step = big ? 1 : SS.GRID;
    for (let x = it.x + dx * step; x >= -1e-9 && x <= SS.L + 1e-9; x += dx * step) {
      const xr = Math.round(x / SS.GRID) * SS.GRID;
      if (!placeProblem(it.kind, xr, it.hang, it.id)) {
        edit(function () { it.x = xr; });
        setStatus(itemText(it));
        return true;
      }
    }
    return false;
  }
  function fireSet(el, v) {
    if (window.LabNum) window.LabNum.set(el, v);
    else { el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); }
  }
  function rebuildKeys() {
    kbItems.length = 0;
    if (state.mode === 'seesaw') {
      kbItems.push({
        name: function () { return T('支點', 'Pivot'); },
        move: function (dx, dy, big) {
          const v = clamp(ss.p + (dx || dy) * (big ? 0.25 : 0.05), SS.P_MIN, SS.P_MAX);
          if (Math.abs(v - ss.p) < 1e-9) return false;
          fireSet(elP, v);
          return true;
        },
        describe: function () { return T('支點 p = ', 'Pivot at p = ') + num(ss.p, 2) + ' m' + T('；', '; ') + netText() + T('。', '.'); },
        box: function () { const bw = Math.max(18, 0.36 * V.k); return [X(ss.p) - bw / 2, Y(SS.H), bw, Y(0) - Y(SS.H)]; }
      });
      ss.items.forEach(function (it) {
        kbItems.push({
          name: function () { return kindName(it.kind); },
          move: function (dx, dy, big) { return keyMoveItem(it, dx, dy, big); },
          describe: function () { return itemText(it); },
          box: function () { return itemBox(it); }
        });
      });
      if (ss.scale) {
        kbItems.push({
          name: function () { return kindName('scale'); },
          move: function (dx, dy, big) {
            if (!ss.scale) return false;
            const x = clamp(Math.round((ss.scale.x + (dx || dy) * (big ? 1 : SS.GRID)) / SS.GRID) * SS.GRID, 0, SS.L);
            if (Math.abs(x - ss.scale.x) < 1e-9) return false;
            placeScale(x);
            return true;
          },
          describe: function () {
            if (!ss.scale) return '';
            const F = scaleReading();
            return T('彈簧秤在 x = ', 'Spring scale at x = ') + num(ss.scale.x, 2) + ' m' + (F != null ? T('，讀數 ', ', reading ') + num(F, 2) + ' N' : '') + T('。', '.');
          },
          box: function () {
            if (!ss.scale) return null;
            const g = scaleGeom(theta(), Math.max(5, SS.THICK * V.k));
            return [g.bx - g.bw / 2, g.bTop, g.bw, g.A[1] - g.bTop];
          }
        });
      }
    } else {
      kbItems.push({
        name: function () { return T('梯子頂端（角度）', 'Top of the ladder (angle)'); },
        move: function (dx, dy, big) {
          if (ld.phase === 'slide' || ld.phase === 'down') return false;
          const v = clamp(ld.th + (dy || dx) * (big ? 5 : 0.5), LADDER.TH_MIN, LADDER.TH_MAX);
          if (Math.abs(v - ld.th) < 1e-9) return false;
          fireSet(elTh, v);
          return true;
        },
        describe: function () { return 'θ = ' + num(ld.th, 1) + '°' + T('；', '; ') + ladderText(); },
        box: function () {
          const pose = ladderPose(), tx = X(pose.xb + LADDER.L * Math.cos(pose.th)), ty = Y(LADDER.L * Math.sin(pose.th));
          return [tx - 10, ty - 10, 20, 20];
        }
      });
      kbItems.push({
        name: function () { return T('爬梯子的人', 'Person on the ladder'); },
        move: function (dx, dy, big) {
          if (!(ld.mp > 0) || ld.phase === 'slide' || ld.phase === 'down') return false;
          const v = clamp(ld.d + (dy || dx) * (big ? 0.25 : 0.05), 0, LADDER.L);
          if (Math.abs(v - ld.d) < 1e-9) return false;
          fireSet(elD, v);
          return true;
        },
        describe: function () {
          return ld.mp > 0 ? T('人在 d = ', 'Person at d = ') + num(ld.d, 2) + ' m' + T('；', '; ') + ladderText() :
            T('梯子上沒有人（人的質量為 0）。', 'Nobody is on the ladder (the person’s mass is 0).');
        },
        box: function () {
          if (!(ld.mp > 0) || ld.phase === 'slide' || ld.phase === 'down') return null;
          const pose = ladderPose(), k = V.k, sc = 0.55 + 0.45 * Math.min(1, ld.mp / 70);
          const fx = X(pose.xb + ld.d * Math.cos(pose.th)), fy = Y(ld.d * Math.sin(pose.th)), hgt = 1.65 * sc * k;
          return [fx - 0.42 * k, fy - hgt - 0.12 * k, 0.6 * k, hgt + 0.12 * k];
        }
      });
    }
    if (kb && kb.index() >= kbItems.length) kb.select(0);
  }
  function drawKbFocus(c) {
    if (!kb || !kb.focused()) return;
    const it = kbItems[kb.index()];
    const b = it && it.box ? it.box() : null;
    if (!b) return;
    c.save();
    c.setLineDash([5, 4]);
    c.strokeStyle = C.accent; c.lineWidth = 2;
    D.roundRect(c, b[0] - 6, b[1] - 6, b[2] + 12, b[3] + 12, 8);
    c.stroke();
    c.restore();
  }
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('力矩與靜力平衡畫布。按 Enter 切換要移動的物件：蹺蹺板是支點、板上每個物體與彈簧秤，梯子是梯子頂端與人。左右鍵移動（物體每次一格 0.25 m、支點 0.05 m），物體按上鍵放到板上、下鍵吊到板下；梯子按上下鍵改角度（每次 0.5°）或人的位置（每次 0.05 m）。Shift 加方向鍵移動得更多。',
        'Torque and static equilibrium canvas. Press Enter to pick what to move: on the seesaw the pivot, each object and the spring scale; on the ladder its top and the person. Left and right move it (objects by one 0.25 m mark, the pivot by 0.05 m); for an object, up puts it on top and down hangs it below. On the ladder, up and down change the angle (0.5° a step) or the person’s position (0.05 m a step). Hold Shift for bigger steps.'),
      items: kbItems,
      onChange: function () { draw(); }
    });
  }

  // ---------- 分享連結：畫布上擺的物體與彈簧秤（滑桿、模式、牆面由 classroom.js 自動記錄） ----------
  // classroom.js 由 settings.js 在 DOMContentLoaded 才載入：還沒有 LabShare 就等 load 再登記（還原在 load 之後才做）
  let shareOn = false;
  function regShare() {
    if (shareOn || !window.LabShare) return;
    shareOn = true;
    window.LabShare.register({
      get: function () {
        return { it: ss.items.map(function (o) { return [o.kind, +o.x.toFixed(2), o.hang ? 1 : 0]; }), sc: ss.scale ? +ss.scale.x.toFixed(2) : null };
      },
      set: function (o) {
        if (!o || typeof o !== 'object') return;
        ss.items = []; ss.scale = null; ss.nextId = 1;
        (Array.isArray(o.it) ? o.it : []).slice(0, 60).forEach(function (a) {
          if (!Array.isArray(a) || !KINDS[a[0]] || !isFinite(+a[1])) return;
          const x = clamp(Math.round(+a[1] / SS.GRID) * SS.GRID, 0, SS.L), hang = !!a[2] && !!KINDS[a[0]].hang;
          if (placeProblem(a[0], x, hang)) return;
          ss.items.push({ id: 'i' + (ss.nextId++), kind: a[0], m: KINDS[a[0]].m, x: x, hang: hang });
        });
        if (o.sc != null && isFinite(+o.sc)) ss.scale = { x: clamp(Math.round(+o.sc / SS.GRID) * SS.GRID, 0, SS.L) };
        setHeld();
        rebuildKeys();
        draw();
      }
    });
  }
  regShare();
  if (!shareOn) window.addEventListener('load', regShare);

  // ---------- 測試與縮圖用的介面 ----------
  window.__tb = {
    add: function (kind, x, hang) { return addItem(kind, x, !!hang); },
    scale: function (x) { placeScale(x); },
    release: function () { if (held()) release(); },
    support: function () { setHeld(); },
    set: function (id, v) { const el = $(id); if (window.LabNum) window.LabNum.set(el, v); else { el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); } },
    mode: function (m) { setMode(m); },
    state: function () { return { ss: { M: ss.M, p: ss.p, phase: ss.phase, dyn: ss.dyn, items: ss.items, scale: ss.scale }, ld: { phase: ld.phase, th: ld.th, d: ld.d, mu: ld.mu } }; }
  };

  // ---------- 啟動 ----------
  readColors();
  showSS();
  readLD(); showLD();
  syncChips();
  function themeChanged() { readColors(); bgKey = ''; draw(); }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
  }
  window.addEventListener('resize', function () { resize(); });
  if (location.hash === '#ladder') setMode('ladder');
  else { resize(); refreshSeesaw(); rebuildKeys(); }
})();
