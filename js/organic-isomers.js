/*
 * organic-isomers.js — 「同分異構物」的頁面程式（格子上組分子、命名、異構物圖鑑、沸點圖、3D 球棍模型與繞鍵旋轉、任務事件）
 * 化學計算（圖同構、命名、列舉、3D 座標、扭轉能）都在 js/organic-isomers-core.js（OICore）；
 * 3D 繪圖在 js/organic-isomers-3d.js（OI3D），three.js 只在切到 3D 時才載入。
 *
 * 任務事件（只在使用者操作過之後送出）：
 *   'mol'：分子改變（加原子、改鍵、刪除、復原、產生直鏈、從圖鑑載入、照光翻轉）或切到 3D
 *          { en（英文 IUPAC 名；順反未定時 null）, formula, cls, key, key0, W, bp, n, view（'2d'／'3d'）,
 *            pairDone（本次已做出同一結構的順式與反式）, wienerPair（本次已做出同分子式、同維納指數的兩種烷）, tetraStereo }
 *   'collect'：按「收進圖鑑」{ target, n, total, complete, added, en }
 *   'twist'：在 3D 拖「扭轉角」{ en, order, angle, E, eclipsed（單鍵前後的氫兩兩對齊，二面角 < 5°）, light }
 *   'photo'：照光後把雙鍵扭過 90° 放手，翻成另一個異構物 { from, to }
 */
(function () {
  'use strict';
  const O = window.OICore, LD = window.LabDraw;
  if (!O || !LD) return;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const isEn = function () { return T('0', '1') === '1'; };
  const reducedMotion = LD.reducedMotion();
  function fsz(px) { return px * (window.LabSettings && window.LabSettings.get('fs') || 1); }
  function num(x, d) {
    if (x == null || !isFinite(x)) return '—';
    const s = (+x).toFixed(d == null ? 0 : d);
    return s.charAt(0) === '-' ? (/^-0(\.0*)?$/.test(s) ? s.slice(1) : '−' + s.slice(1)) : s;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ======================= 格子 =======================
  const QMAX = 11, YMAX = 7;
  const S3 = Math.sqrt(3) / 2;
  function inGrid(q, r) { const y = r + q / 2; return q >= 0 && q <= QMAX && y >= -1e-9 && y <= YMAX + 1e-9; }
  const kq = function (q, r) { return q + ',' + r; };

  // ======================= 狀態 =======================
  const state = {
    atoms: [], bonds: [], sel: -1, prev: -1, pen: 'C', draw: 'full', nums: true,
    target: 'C5H12', view: '2d', chart: 'bar', cur: { q: 4, r: 2 }, bond3: -1, twist: 0, light: false
  };
  let an = { ok: false, err: 'empty' };
  let userActed = false;
  function acted() { userActed = true; }
  function emit(type, data) { if (userActed && window.LabMission) window.LabMission.emit(type, data); }
  function snd() { return window.LabSound && window.LabSound.enabled(); }
  function tone(f, d, type, g, delay) { if (snd()) window.LabSound.tone({ freq: f, dur: d, type: type || 'sine', gain: g || 0.06, delay: delay || 0 }); }
  function sweep(a, b, d, type) { if (snd()) window.LabSound.sweep({ from: a, to: b, dur: d, gain: 0.05, type: type || 'sine' }); }
  function sndBad() { tone(300, 0.12, 'triangle', 0.06); }

  // ======================= 分子 =======================
  function atomAt(q, r) {
    for (let i = 0; i < state.atoms.length; i++) if (state.atoms[i].q === q && state.atoms[i].r === r) return i;
    return -1;
  }
  function bondIdx(a, b) {
    for (let k = 0; k < state.bonds.length; k++) { const x = state.bonds[k]; if ((x.a === a && x.b === b) || (x.a === b && x.b === a)) return k; }
    return -1;
  }
  function used(i) { let s = 0; state.bonds.forEach(function (b) { if (b.a === i || b.b === i) s += b.o; }); return s; }
  function free(i) { return O.VAL[state.atoms[i].el] - used(i); }
  function adjacent(a, b) { const A = state.atoms[a], B = state.atoms[b]; return O.ldir(A.q, A.r, B.q, B.r) >= 0; }
  function toMol() {
    return {
      atoms: state.atoms.map(function (a) {
        const p = O.lxy(a.q, a.r), c = O.lcolor(a.q, a.r);
        return { el: a.el, x: p.x, y: p.y, z: c === 1 ? 0.35 : c === 2 ? -0.35 : 0 };
      }),
      bonds: state.bonds.map(function (b) { return { a: b.a, b: b.b, o: b.o }; })
    };
  }
  function snapshot() { return JSON.stringify({ a: state.atoms, b: state.bonds, s: state.sel }); }
  const undoStack = [];
  function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 50) undoStack.shift(); }
  function restore(s) { const o = JSON.parse(s); state.atoms = o.a; state.bonds = o.b; state.sel = o.s; state.prev = -1; }

  function chainAtoms(n) {
    const atoms = [], bonds = [];
    let q = Math.max(0, Math.floor((QMAX - (n - 1)) / 2));
    if (q % 2) q--;
    let r = 4 - q / 2;
    for (let i = 0; i < n; i++) {
      atoms.push({ el: 'C', q: q, r: r });
      if (i) bonds.push({ a: i - 1, b: i, o: 1 });
      const d = i % 2 === 0 ? O.DIRS[5] : O.DIRS[0];
      q += d[0]; r += d[1];
    }
    return { atoms: atoms, bonds: bonds };
  }

  // ======================= 分析與事件 =======================
  const seenCT = {}, seenW = {};
  let E3 = null, side3 = null, curve = null;
  function analyzeNow() {
    an = O.analyze(toMol());
    E3 = null; side3 = null; curve = null;
    if (state.bond3 >= state.bonds.length) state.bond3 = -1;
    state.twist = 0;
  }
  function emitMol() {
    if (!an.ok || !userActed) return;
    let pairDone = false, wienerPair = false;
    if (an.stereo.some(function (s) { return s.rel; }) && !an.stereoUndef) {
      (seenCT[an.key0] = seenCT[an.key0] || {})[an.key] = true;
      pairDone = Object.keys(seenCT[an.key0]).length >= 2;
    }
    if (an.cls === 'alkane') {
      const k = an.ftext + '|' + an.W;
      (seenW[k] = seenW[k] || {})[an.key] = true;
      wienerPair = Object.keys(seenW[k]).length >= 2;
    }
    emit('mol', {
      en: an.en, formula: an.ftext, cls: an.cls, key: an.key, key0: an.key0, W: an.W, bp: an.bp, n: state.atoms.length,
      view: state.view, pairDone: pairDone, wienerPair: wienerPair, tetraStereo: !!an.tetraStereo
    });
  }
  /** 分子改變之後：重新分析、更新畫面、送事件 */
  function changed(silent) {
    state.bond3 = -1;
    analyzeNow();
    updateMolCard();
    updateDex();
    drawGraph();
    if (state.view === '3d') refresh3D(true);
    request();
    if (!silent) emitMol();
  }
  function status(msg, kind) {
    const el = $('status');
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  // ======================= 編輯動作 =======================
  function elName(el) { return el === 'O' ? T('氧', 'oxygen') : T('碳', 'carbon'); }
  function addAtom(q, r, parent) {
    const el = state.pen;
    if (!inGrid(q, r) || atomAt(q, r) >= 0) return false;
    if (state.atoms.length >= O.MAX_ATOMS) { status(T('這個實驗最多 10 個碳和氧。', 'This lab allows at most 10 carbon and oxygen atoms.'), 'warn'); sndBad(); return false; }
    if (parent >= 0) {
      if (free(parent) < 1) { status(valMsg(parent), 'warn'); sndBad(); return false; }
      if (el === 'O' && state.atoms[parent].el === 'O') { status(ooMsg(), 'warn'); sndBad(); return false; }
    }
    pushUndo();
    state.atoms.push({ el: el, q: q, r: r });
    const i = state.atoms.length - 1;
    if (parent >= 0) state.bonds.push({ a: parent, b: i, o: 1 });
    state.prev = state.sel; state.sel = i;
    state.cur = { q: q, r: r };
    tone(el === 'O' ? 660 : 520, 0.08);
    status('');
    changed();
    return true;
  }
  function valMsg(i) {
    return state.atoms[i].el === 'O' ? T('氧只能有 2 個鍵，這個氧已經滿了。', 'Oxygen forms only 2 bonds, and this one is already full.')
      : T('碳最多只有 4 個鍵，這個碳已經滿了。', 'Carbon forms at most 4 bonds, and this one is already full.');
  }
  function ooMsg() { return T('兩個氧直接相連（過氧化物）不在這個實驗的範圍。', 'Two oxygens bonded together (a peroxide) are not part of this lab.'); }
  function maxOrder(a, b) { return state.atoms[a].el === 'C' && state.atoms[b].el === 'C' ? 3 : 2; }
  /** 加鍵或把鍵級循環 1 → 2 → 3 → 1（跳過價數不允許的） */
  function cycleBond(a, b, want) {
    if (state.atoms[a].el === 'O' && state.atoms[b].el === 'O') { status(ooMsg(), 'warn'); sndBad(); return false; }
    const k = bondIdx(a, b), o = k >= 0 ? state.bonds[k].o : 0;
    const ok = function (n) { return n <= maxOrder(a, b) && free(a) + o >= n && free(b) + o >= n; };
    let n = -1;
    if (want) { if (want !== o && ok(want)) n = want; }
    else if (o === 0) { if (ok(1)) n = 1; }
    else {
      for (let s = 1; s <= 2; s++) { const c = ((o - 1 + s) % 3) + 1; if (ok(c)) { n = c; break; } }
    }
    if (n < 0) {
      if (want === o) return false;
      status(free(a) + o < 1 || free(b) + o < 1 ? valMsg(free(a) + o < 1 ? a : b)
        : T('價數不夠，不能改成這種鍵。', 'Not enough free valence for that bond.'), 'warn');
      sndBad(); return false;
    }
    pushUndo();
    if (k >= 0) state.bonds[k].o = n; else state.bonds.push({ a: a, b: b, o: n });
    tone([0, 440, 587, 784][n], 0.09);
    status('');
    changed();
    return true;
  }
  function deleteAtom(i) {
    if (i < 0 || i >= state.atoms.length) return;
    pushUndo();
    const nbr = state.bonds.filter(function (b) { return b.a === i || b.b === i; }).map(function (b) { return b.a === i ? b.b : b.a; });
    state.atoms.splice(i, 1);
    state.bonds = state.bonds.filter(function (b) { return b.a !== i && b.b !== i; })
      .map(function (b) { return { a: b.a > i ? b.a - 1 : b.a, b: b.b > i ? b.b - 1 : b.b, o: b.o }; });
    const nx = nbr.length ? nbr[0] : -1;
    state.sel = nx < 0 ? -1 : nx > i ? nx - 1 : nx;
    state.prev = -1;
    sweep(500, 300, 0.14);
    status('');
    changed();
  }
  function swapEl(i) {
    if (i < 0) { status(T('先點一個原子，再按「C ⇄ O」。', 'Tap an atom first, then press “C ⇄ O”.'), 'warn'); return; }
    const a = state.atoms[i], to = a.el === 'C' ? 'O' : 'C';
    if (to === 'O') {
      const bs = state.bonds.filter(function (b) { return b.a === i || b.b === i; });
      if (used(i) > 2 || bs.some(function (b) { return b.o > 2; })) { status(T('這個位置有 3 個以上的鍵，氧接不了。', 'This position has more than 2 bonds, which oxygen cannot make.'), 'warn'); sndBad(); return; }
      if (bs.some(function (b) { return state.atoms[b.a === i ? b.b : b.a].el === 'O'; })) { status(ooMsg(), 'warn'); sndBad(); return; }
    }
    pushUndo();
    a.el = to;
    tone(to === 'O' ? 660 : 520, 0.08);
    status('');
    changed();
  }
  function setMolecule(atoms, bonds, sel) {
    pushUndo();
    state.atoms = atoms; state.bonds = bonds; state.sel = sel == null ? -1 : sel; state.prev = -1;
    state.bond3 = -1;
    changed();
  }

  // ======================= 2D 畫布 =======================
  const cv = $('cv'), ctx = cv.getContext('2d');
  let cw = 600, ch = 480, dpr = 1, s = 50, ox = 0, oy = 0;
  let col = {};
  function readColors() {
    if (LD.refresh) LD.refresh();
    const cs = getComputedStyle(document.documentElement);
    const g = function (n, d) { return (cs.getPropertyValue(n) || '').trim() || d; };
    col = { C: g('--el-C', '#3b4450'), O: g('--el-O', '#d4372f'), H: g('--el-H', '#8a96a3'), bond: g('--oi-bond', '#4a5563'), nw: g('--oi-new', '#0d7f57') };
  }
  /** 畫面上看得到的格子範圍：桌機是整張格子；窄螢幕只看 8 欄 × 6 列，跟著分子移動（分子太大時才縮小看整張） */
  const win = { x0: 0, y0: 0, w: QMAX * S3, h: YMAX };
  function fitWindow() {
    const narrow = cw < 560;
    let W = (narrow ? 7 : QMAX) * S3, Hh = narrow ? 5 : YMAX;
    let x0 = win.x0, y0 = win.y0;
    if (state.atoms.length) {
      const xs = state.atoms.map(function (a) { return O.lxy(a.q, a.r).x; }), ys = state.atoms.map(function (a) { return O.lxy(a.q, a.r).y; });
      const nx0 = Math.max(0, Math.min.apply(null, xs) - S3), nx1 = Math.min(QMAX * S3, Math.max.apply(null, xs) + S3);
      const ny0 = Math.max(0, Math.min.apply(null, ys) - 1), ny1 = Math.min(YMAX, Math.max.apply(null, ys) + 1);
      // 分子比窄螢幕的視窗大：視窗放大到剛好裝得下（字仍盡量大）
      if (nx1 - nx0 > W + 1e-9) W = nx1 - nx0;
      if (ny1 - ny0 > Hh + 1e-9) Hh = ny1 - ny0;
      if (nx0 < x0) x0 = nx0;
      if (nx1 > x0 + W) x0 = nx1 - W;
      if (ny0 < y0) y0 = ny0;
      if (ny1 > y0 + Hh) y0 = ny1 - Hh;
    }
    x0 = Math.max(0, Math.min(QMAX * S3 - W, x0));
    y0 = Math.max(0, Math.min(YMAX - Hh, y0));
    win.x0 = Math.round(x0 / S3) * S3; win.y0 = Math.round(y0 * 2) / 2; win.w = W; win.h = Hh;
    s = Math.min((cw - 24) / (W + 1.1), (ch - 24) / (Hh + 1.1));
    ox = (cw - W * s) / 2 - win.x0 * s; oy = (ch - Hh * s) / 2 - win.y0 * s;
  }
  function inView(q, r) {
    const p = O.lxy(q, r);
    return p.x >= win.x0 - 1e-6 && p.x <= win.x0 + win.w + 1e-6 && p.y >= win.y0 - 1e-6 && p.y <= win.y0 + win.h + 1e-6;
  }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = w; ch = Math.round(w * (w < 560 ? 0.84 : 0.8));
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    fitWindow();
    request();
  }
  function px(q, r) { const p = O.lxy(q, r); return [ox + p.x * s, oy + p.y * s]; }
  function nearestPoint(x, y) {
    const cx = (x - ox) / s, cy = (y - oy) / s;
    const q0 = Math.round(cx / S3);
    let best = null, bd = 1e9;
    for (let q = q0 - 1; q <= q0 + 1; q++) {
      const r0 = Math.round(cy - q / 2);
      for (let r = r0 - 1; r <= r0 + 1; r++) {
        if (!inGrid(q, r) || !inView(q, r)) continue;
        const p = O.lxy(q, r), d = Math.hypot(p.x - cx, p.y - cy);
        if (d < bd) { bd = d; best = { q: q, r: r, d: d }; }
      }
    }
    return best;
  }
  function hitBond(x, y) {
    let best = -1, bd = 0.24 * s;
    state.bonds.forEach(function (b, k) {
      const A = state.atoms[b.a], B = state.atoms[b.b], p = px(A.q, A.r), q = px(B.q, B.r);
      const d = Math.hypot((p[0] + q[0]) / 2 - x, (p[1] + q[1]) / 2 - y);
      if (d < bd) { bd = d; best = k; }
    });
    return best;
  }
  function hLabel(i) {
    const a = state.atoms[i], h = Math.max(0, free(i));
    if (a.el === 'O') return h ? (rightOnly(i) ? [['H', 0], ['O', 0]] : [['O', 0], ['H', 0]]) : [['O', 0]];
    if (!h) return [['C', 0]];
    const H = [['H', 0]].concat(h > 1 ? [[String(h), 1]] : []);
    if (state.atoms.length === 1) return [['C', 0], ['H', 0], ['4', 1]];
    return rightOnly(i) ? H.concat([['C', 0]]) : [['C', 0]].concat(H);
  }
  function rightOnly(i) {
    const nb = state.bonds.filter(function (b) { return b.a === i || b.b === i; });
    if (!nb.length) return false;
    const A = state.atoms[i];
    return nb.every(function (b) { const B = state.atoms[b.a === i ? b.b : b.a]; return O.lxy(B.q, B.r).x > O.lxy(A.q, A.r).x + 0.1; });
  }
  /** 畫「CH3」這種有下標的標籤，置中於元素符號（不是整串字）；傳回外框 */
  function drawLabel(x, y, parts, color, big) {
    const fb = '700 ' + big.toFixed(1) + 'px ' + LD.FONT, fs = '700 ' + (big * 0.66).toFixed(1) + 'px ' + LD.FONT;
    const ws = parts.map(function (p) { ctx.font = p[1] ? fs : fb; return ctx.measureText(p[0]).width; });
    const elIdx = parts.findIndex(function (p) { return p[0] === 'C' || p[0] === 'O'; });
    let before = 0;
    for (let k = 0; k < elIdx; k++) before += ws[k];
    const tot = ws.reduce(function (a, b) { return a + b; }, 0);
    let x0 = x - before - ws[elIdx] / 2;
    const bx = x0 - big * 0.18, bw = tot + big * 0.36, bh = big * 1.18, by = y - bh / 2;
    LD.roundRect(ctx, bx, by, bw, bh, bh * 0.42);
    ctx.fillStyle = LD.alpha(LD.c['canvas-bg'], 0.94);
    ctx.fill();
    ctx.textBaseline = 'middle';
    parts.forEach(function (p, k) {
      ctx.font = p[1] ? fs : fb;
      ctx.textAlign = 'left';
      ctx.fillStyle = color;
      ctx.fillText(p[0], x0, y + (p[1] ? big * 0.28 : big * 0.04));
      x0 += ws[k];
    });
    return { x: bx, y: by, w: bw, h: bh };
  }
  let drag = null;
  let kb = null;
  function draw() {
    if (!drag) fitWindow();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(ctx, cw, ch);
    // 格點
    const dotR = Math.max(1.3, s * 0.035);
    ctx.fillStyle = LD.alpha(LD.c.muted, LD.dark ? 0.42 : 0.38);
    for (let q = 0; q <= QMAX; q++) for (let r = -Math.ceil(q / 2); r <= YMAX; r++) {
      if (!inGrid(q, r) || !inView(q, r)) continue;
      const p = px(q, r);
      ctx.beginPath(); ctx.arc(p[0], p[1], dotR, 0, Math.PI * 2); ctx.fill();
    }
    if (!state.atoms.length) {
      LD.haloText(ctx, T('點任一個格點放第一個原子，或按「產生直鏈」', 'Tap any grid point for the first atom, or press “Straight chain”'), cw / 2, ch / 2 - s * 0.6, LD.c.muted, 'center', 'middle', '600 ' + fsz(14) + 'px ' + LD.FONT);
    }
    const skel = state.draw === 'skel';
    // 選取原子可以加原子的位置
    if (state.sel >= 0 && state.sel < state.atoms.length && free(state.sel) > 0 && state.atoms.length < O.MAX_ATOMS && !drag) {
      const A = state.atoms[state.sel];
      O.DIRS.forEach(function (d) {
        const q = A.q + d[0], r = A.r + d[1];
        if (!inGrid(q, r) || !inView(q, r) || atomAt(q, r) >= 0) return;
        const p = px(q, r);
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = LD.alpha(LD.c.accent, 0.55);
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(p[0], p[1], s * 0.2, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = LD.alpha(LD.c.accent, 0.7);
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(p[0] - s * 0.08, p[1]); ctx.lineTo(p[0] + s * 0.08, p[1]); ctx.moveTo(p[0], p[1] - s * 0.08); ctx.lineTo(p[0], p[1] + s * 0.08); ctx.stroke();
      });
    }
    // 鍵
    const W = Math.max(3, s * 0.11);
    const center = [0, 0];
    state.atoms.forEach(function (a) { const p = px(a.q, a.r); center[0] += p[0]; center[1] += p[1]; });
    if (state.atoms.length) { center[0] /= state.atoms.length; center[1] /= state.atoms.length; }
    const ringIn = an.G ? state.bonds.map(function (b) { return O.bondInRing(an.G, b.a, b.b); }) : [];
    state.bonds.forEach(function (b, k) {
      const A = state.atoms[b.a], B = state.atoms[b.b];
      const p = px(A.q, A.r), q = px(B.q, B.r);
      const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
      const line = function (o1, sh) {
        const sx = dx * sh, sy = dy * sh;
        LD.tube(ctx, function (c) { c.moveTo(p[0] + nx * o1 + sx, p[1] + ny * o1 + sy); c.lineTo(q[0] + nx * o1 - sx, q[1] + ny * o1 - sy); }, col.bond, b.o > 1 ? W * 0.72 : W);
      };
      if (b.o === 1) line(0, 0);
      else if (b.o === 3) { line(0, 0); line(s * 0.13, skel ? 0.12 : 0); line(-s * 0.13, skel ? 0.12 : 0); }
      else if (!skel) { line(s * 0.075, 0); line(-s * 0.075, 0); }
      else {
        // 鍵線式：第二條線畫在取代基多的一側（環上畫在環內）
        let side = 0;
        if (ringIn[k]) {
          let rx = 0, ry = 0, n = 0;
          state.atoms.forEach(function (a) { const t = px(a.q, a.r); rx += t[0]; ry += t[1]; n++; });
          side = ((rx / n - p[0]) * nx + (ry / n - p[1]) * ny) >= 0 ? 1 : -1;
        } else {
          state.bonds.forEach(function (c) {
            if (c === b) return;
            let o = -1;
            if (c.a === b.a || c.a === b.b) o = c.b; else if (c.b === b.a || c.b === b.b) o = c.a;
            if (o < 0) return;
            const t = px(state.atoms[o].q, state.atoms[o].r);
            side += ((t[0] - p[0]) * nx + (t[1] - p[1]) * ny) > 0 ? 1 : -1;
          });
          side = side >= 0 ? 1 : -1;
        }
        line(0, 0); line(side * s * 0.17, 0.14);
      }
    });
    // 拖曳中的預覽
    if (drag && drag.from >= 0 && drag.moved) {
      const A = state.atoms[drag.from], p = px(A.q, A.r), t = drag.to;
      const ok = t && O.ldir(A.q, A.r, t.q, t.r) >= 0;
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = LD.alpha(ok ? LD.c.accent : LD.c.muted, 0.85);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p[0], p[1]);
      if (ok) { const q = px(t.q, t.r); ctx.lineTo(q[0], q[1]); } else ctx.lineTo(drag.x, drag.y);
      ctx.stroke();
      ctx.restore();
      if (ok && atomAt(t.q, t.r) < 0) LD.ball(ctx, px(t.q, t.r)[0], px(t.q, t.r)[1], s * 0.16, LD.alpha(state.pen === 'O' ? col.O : col.C, 0.6), { shadow: false });
    }
    // 選取光暈
    if (state.sel >= 0 && state.sel < state.atoms.length) {
      const A = state.atoms[state.sel], p = px(A.q, A.r);
      const g = ctx.createRadialGradient(p[0], p[1], s * 0.1, p[0], p[1], s * 0.48);
      g.addColorStop(0, LD.alpha(LD.c.accent, 0.3));
      g.addColorStop(1, LD.alpha(LD.c.accent, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p[0], p[1], s * 0.48, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = LD.c.accent; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(p[0], p[1], s * 0.36, 0, Math.PI * 2); ctx.stroke();
    }
    // 原子
    const big = Math.max(11, Math.min(22, s * 0.36)) * (1 + ((window.LabSettings && window.LabSettings.get('fs') || 1) - 1) * 0.5);
    state.atoms.forEach(function (a, i) {
      const p = px(a.q, a.r);
      const color = a.el === 'O' ? col.O : col.C;
      if (skel && a.el === 'C' && state.atoms.length > 1) {
        LD.ball(ctx, p[0], p[1], Math.max(2.5, s * 0.075), col.C, { shadow: false });
        return;
      }
      drawLabel(p[0], p[1], hLabel(i), color, big);
    });
    // 主鏈編號與順反
    if (an.ok && an.name && an.name.ok) {
      if (state.nums && an.name.loc && an.name.chain && an.name.chain.length > 1) {
        an.name.chain.forEach(function (x, i) {
          const A = state.atoms[x], p = px(A.q, A.r);
          // 編號放在離所有鍵最遠的方向（每 30° 試一次；同分時偏好上方）
          const angs = [];
          state.bonds.forEach(function (b) {
            if (b.a !== x && b.b !== x) return;
            const B = state.atoms[b.a === x ? b.b : b.a], t = px(B.q, B.r);
            angs.push(Math.atan2(t[1] - p[1], t[0] - p[0]));
          });
          let best = -Math.PI / 2, bs = -1;
          for (let k = 0; k < 12; k++) {
            const a = -Math.PI / 2 + k * Math.PI / 6;
            let m = Math.PI;
            angs.forEach(function (b) { let d = Math.abs(a - b) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; m = Math.min(m, d); });
            const sc = m - Math.abs(Math.sin(a / 2 + Math.PI / 4)) * 0.01 - (Math.sin(a) > 0 ? 0.02 : 0);
            if (sc > bs + 1e-9) { bs = sc; best = a; }
          }
          const d = s * 0.56;
          LD.pill(ctx, String(i + 1), p[0] + Math.cos(best) * d, p[1] + Math.sin(best) * d + fsz(8), LD.c.accent, 'center', '700 ' + fsz(11) + 'px ' + LD.FONT);
        });
      }
      (an.name.cisTrans || []).forEach(function (c) {
        const x = an.name.chain[c.loc - 1], y = an.name.chain[c.loc];
        const A = state.atoms[x], B = state.atoms[y], p = px(A.q, A.r), q = px(B.q, B.r);
        LD.pill(ctx, c.cis ? T('順', 'cis') : T('反', 'trans'), (p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - s * 0.22, col.nw, 'center', '700 ' + fsz(12) + 'px ' + LD.FONT);
      });
    }
    if (an.ok && an.stereoUndef) {
      an.stereo.forEach(function (st) {
        if (st.rel) return;
        const A = state.atoms[st.a], B = state.atoms[st.b], p = px(A.q, A.r), q = px(B.q, B.r);
        const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
        ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = LD.c.pos; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(mx, my, s * 0.55, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        // 「?」放在鍵的垂直方向、離分子重心遠的一側
        const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
        let nx = -(q[1] - p[1]) / L, ny = (q[0] - p[0]) / L;
        if ((center[0] - mx) * nx + (center[1] - my) * ny > 0) { nx = -nx; ny = -ny; }
        LD.pill(ctx, '?', mx + nx * s * 0.8, my + ny * s * 0.8 + fsz(8), LD.c.pos, 'center', '700 ' + fsz(13) + 'px ' + LD.FONT);
      });
    }
    // 鍵盤游標
    if (kb && kb.focused()) {
      const p = px(state.cur.q, state.cur.r);
      ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = LD.c.accent; ctx.lineWidth = 2;
      LD.roundRect(ctx, p[0] - s * 0.42, p[1] - s * 0.42, s * 0.84, s * 0.84, 6); ctx.stroke(); ctx.restore();
    }
  }

  // ======================= 畫布操作 =======================
  function canvasPoint(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  cv.addEventListener('pointerdown', function (ev) {
    if (ev.button && ev.button !== 0) return;
    const p = canvasPoint(ev), pt = nearestPoint(p[0], p[1]);
    const ai = pt && pt.d < 0.45 ? atomAt(pt.q, pt.r) : -1;
    drag = { x0: p[0], y0: p[1], x: p[0], y: p[1], from: ai, pt: pt, moved: false, to: null, id: ev.pointerId };
    if (ai >= 0) { try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ } }
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!drag || drag.from < 0) return;
    const p = canvasPoint(ev);
    drag.x = p[0]; drag.y = p[1];
    if (Math.hypot(p[0] - drag.x0, p[1] - drag.y0) > s * 0.3) drag.moved = true;
    drag.to = nearestPoint(p[0], p[1]);
    if (drag.moved) { ev.preventDefault(); request(); }
  });
  function endDrag(ev) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (ev.type === 'pointercancel') { request(); return; }
    acted();
    const p = canvasPoint(ev);
    if (d.from >= 0 && d.moved) {
      const t = nearestPoint(p[0], p[1]), A = state.atoms[d.from];
      if (!t || O.ldir(A.q, A.r, t.q, t.r) < 0) { status(T('只能接到相鄰的格點。', 'You can only connect to a neighbouring grid point.'), 'warn'); request(); return; }
      const bi = atomAt(t.q, t.r);
      if (bi < 0) addAtom(t.q, t.r, d.from);
      else cycleBond(d.from, bi);
      request();
      return;
    }
    tapAt(p[0], p[1]);
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  function tapAt(x, y) {
    const pt = nearestPoint(x, y);
    const bk = hitBond(x, y);
    const ai = pt && pt.d < 0.42 ? atomAt(pt.q, pt.r) : -1;
    if (bk >= 0 && ai < 0) { const b = state.bonds[bk]; cycleBond(b.a, b.b); return; }
    if (!pt) return;
    state.cur = { q: pt.q, r: pt.r };
    if (ai >= 0) { selectAtom(ai); return; }
    if (pt.d > 0.5) return;
    placeAt(pt.q, pt.r);
  }
  function selectAtom(i) {
    if (state.sel !== i) { state.prev = state.sel; state.sel = i; tone(state.atoms[i].el === 'O' ? 880 : 700, 0.04, 'sine', 0.03); }
    status('');
    request();
  }
  /** 在空格點放原子：沒有原子時放第一個；否則接到相鄰的選取原子（或唯一一個相鄰、還有空位的原子） */
  function placeAt(q, r) {
    if (!state.atoms.length) {
      pushUndo();
      state.atoms.push({ el: state.pen, q: q, r: r });
      state.sel = 0; state.prev = -1;
      tone(state.pen === 'O' ? 660 : 520, 0.08);
      status('');
      changed();
      return;
    }
    const nb = [];
    O.DIRS.forEach(function (d) { const j = atomAt(q + d[0], r + d[1]); if (j >= 0) nb.push(j); });
    if (!nb.length) { status(T('新原子要接在已有的原子旁邊：先點一個原子，再點它旁邊的格點。', 'A new atom must sit next to an existing one: tap an atom, then a grid point beside it.'), 'warn'); request(); return; }
    let parent = -1;
    if (nb.indexOf(state.sel) >= 0) parent = state.sel;
    else {
      const fr = nb.filter(function (j) { return free(j) > 0; });
      if (fr.length === 1) parent = fr[0];
      else if (!fr.length) { status(valMsg(nb[0]), 'warn'); sndBad(); return; }
      else { status(T('旁邊有好幾個原子：先點要接的那一個原子。', 'Several atoms are next to that point: tap the one you want to bond to first.'), 'warn'); request(); return; }
    }
    addAtom(q, r, parent);
  }

  // ======================= 讀數 =======================
  function nameOf(a) { return a && a.ok && a.name && a.name.ok ? (isEn() ? a.name.en : a.name.zh) : null; }
  function errText(a) {
    switch (a.err) {
      case 'empty': return T('還沒有原子', 'No atoms yet');
      case 'split': return T('分子斷成好幾塊', 'The molecule is in pieces');
      case 'noC': return T('有機化合物至少要有一個碳', 'An organic compound needs at least one carbon');
      case 'big': return T('原子太多了', 'Too many atoms');
      case 'oo': return T('不能有 O–O 鍵', 'No O–O bonds allowed');
      case 'valence': return T('有原子的鍵太多', 'An atom has too many bonds');
      default: return T('無法分析', 'Cannot analyse');
    }
  }
  function ctText(a) {
    if (!a.stereo || !a.stereo.length) return T('沒有順反異構', 'No cis–trans isomers');
    if (a.stereoUndef) return T('未定：雙鍵碳上的鍵畫成一直線', 'Undecided: a bond on the C=C is drawn straight');
    const ct = a.name && a.name.cisTrans ? a.name.cisTrans : [];
    if (ct.length) return ct.map(function (c) { return (c.cis ? T('順式', 'cis') : T('反式', 'trans')) + T('（' + c.loc + ' 號雙鍵）', ' (double bond at ' + c.loc + ')'); }).join(T('、', ', '));
    return T('有（以構造判斷）', 'Yes');
  }
  function targetLabel(t) {
    const n = O.targetCount(t.id);
    if (t.scope === 'alkane') return t.id + T('：烷類（' + n + ' 種）', ': alkanes (' + n + ')');
    return t.id.replace(/-ene$/, '') + T('：' + t.zh + '（' + n + ' 種）', ': ' + t.en + ' (' + n + ')');
  }
  function matchTargets(a) { return O.TARGETS.filter(function (t) { return O.inTarget(a, t); }); }
  function updateMolCard() {
    const mN = $('mName'), mS = $('mSub'), out = $('mOut');
    if (!an.ok) {
      mN.textContent = errText(an); mN.className = 'molname none';
      mS.textContent = an.err === 'split' ? T('把各塊連成一個分子，或刪掉多出來的原子。', 'Join the pieces into one molecule, or delete the extra atoms.') : '';
      out.innerHTML = '<dt>' + T('原子數', 'Atoms') + '</dt><dd>' + state.atoms.length + '</dd>';
      return;
    }
    const nm = nameOf(an);
    mN.className = 'molname' + (nm ? '' : ' none');
    mN.textContent = nm ? nm + (an.stereoUndef ? ' ?' : '') : T('這個分子不在命名範圍內', 'This molecule is outside the naming rules here');
    const sub = [];
    if (an.common && nm) sub.push(T('俗名 ', 'also called ') + (isEn() ? an.common.en : an.common.zh));
    sub.push(T(an.clsName[0], an.clsName[1]));
    mS.textContent = sub.join(T('・', ' · '));
    const rows = [];
    rows.push([T('分子式', 'Formula'), an.fhtml]);
    if (an.condHTML) rows.push([T('示性式', 'Condensed'), an.condHTML]);
    rows.push([T('不飽和度', 'Unsaturation'), String(an.dou) + (an.rings ? T('<small>含 ' + an.rings + ' 個環</small>', '<small>' + an.rings + ' ring' + (an.rings > 1 ? 's' : '') + '</small>') : '')]);
    rows.push([T('順反', 'Cis–trans'), esc(ctText(an))]);
    rows.push([T('沸點', 'Boiling point'), an.bp != null ? num(an.bp, 1) + ' °C' + (an.en === 'ethyne' ? T('<small>昇華</small>', '<small>sublimes</small>') : '') + '<small>' + T('1 atm，CRC 手冊', '1 atm, CRC Handbook') + '</small>' :
      '—<small>' + (an.stereoUndef ? T('先決定順式或反式', 'decide cis or trans first') : T('資料表沒有收錄', 'not in the data table')) + '</small>']);
    if (an.mp != null) rows.push([T('熔點', 'Melting point'), num(an.mp, 1) + ' °C']);
    rows.push([T('維納指數', 'Wiener index'), String(an.W) + '<small>' + T('碳、氧兩兩之間的鍵數總和', 'sum of bond counts between all pairs of C and O') + '</small>']);
    const ts = matchTargets(an);
    if (ts.length) rows.push([T('同分異構物', 'Isomers'), ts.map(function (t) { return esc(targetLabel(t)); }).join('<br>')]);
    out.innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('');
  }

  // ======================= 異構物圖鑑 =======================
  const DEX_KEY = 'oi-dex-v1';
  let dex = {};
  function loadDex() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(DEX_KEY) || 'null'); } catch (e) { raw = null; }
    dex = {};
    if (!raw || typeof raw !== 'object') return;
    O.TARGETS.forEach(function (t) {
      const L = Array.isArray(raw[t.id]) ? raw[t.id] : [];
      const seen = {};
      dex[t.id] = [];
      L.forEach(function (it) {
        try {
          const atoms = it.a.map(function (x) { return { el: x[0] === 'O' ? 'O' : 'C', q: +x[1], r: +x[2] }; });
          const bonds = it.b.map(function (x) { return { a: +x[0], b: +x[1], o: +x[2] }; });
          const m = { atoms: atoms.map(function (a) { const p = O.lxy(a.q, a.r); return { el: a.el, x: p.x, y: p.y }; }), bonds: bonds };
          const a = O.analyze(m);
          if (!a.ok || a.stereoUndef || !O.inTarget(a, t) || seen[a.key]) return;
          seen[a.key] = true;
          dex[t.id].push({ key: a.key, atoms: atoms, bonds: bonds, an: a });
        } catch (e) { /* 壞掉的資料略過 */ }
      });
    });
  }
  function saveDex() {
    const out = {};
    Object.keys(dex).forEach(function (id) {
      out[id] = dex[id].map(function (it) { return { a: it.atoms.map(function (x) { return [x.el, x.q, x.r]; }), b: it.bonds.map(function (x) { return [x.a, x.b, x.o]; }) }; });
    });
    try { localStorage.setItem(DEX_KEY, JSON.stringify(out)); } catch (e) { /* 無痕模式等 */ }
  }
  function list() { return dex[state.target] || (dex[state.target] = []); }
  function fillTargets() {
    const sel = $('target');
    sel.innerHTML = O.TARGETS.map(function (t) { return '<option value="' + t.id + '">' + esc(targetLabel(t)) + '</option>'; }).join('');
    sel.value = state.target;
  }
  let flashKey = null;
  function updateDex() {
    const t = O.target(state.target), L = list(), N = O.targetCount(t.id);
    $('dexCount').textContent = L.length + ' / ' + N;
    $('dexDots').innerHTML = Array.from({ length: N }, function (_, i) { return '<i' + (i < L.length ? ' class="on"' : '') + '></i>'; }).join('');
    const items = L.slice().sort(function (a, b) { return (b.an.bp == null ? -999 : b.an.bp) - (a.an.bp == null ? -999 : a.an.bp); });
    const box = $('dexList');
    if (!items.length) { box.innerHTML = '<p class="none">' + T('還沒有收集。組出一個 ' + t.id.replace(/-ene$/, '') + ' 的分子，按「收進圖鑑」。', 'Nothing collected yet. Build a ' + t.id.replace(/-ene$/, '') + ' molecule and press “Add to collection”.') + '</p>'; }
    else {
      box.innerHTML = items.map(function (it) {
        const cur = an.ok && an.key === it.key;
        return '<button type="button" data-key="' + esc(it.key) + '"' + (it.key === flashKey ? ' class="flash"' : '') + (cur ? ' aria-current="true"' : '') + '><span>' + esc(nameOf(it.an) || it.an.ftext) + '</span><small>' +
          (it.an.bp != null ? num(it.an.bp, 1) + ' °C' : '—') + '</small></button>';
      }).join('');
    }
  }
  function collect() {
    acted();
    const t = O.target(state.target), L = list(), N = O.targetCount(t.id), msg = $('dexMsg');
    flashKey = null;
    msg.className = 'dexmsg warn';
    if (!an.ok) { msg.textContent = T('先組出一個完整的分子。', 'Build a complete molecule first.'); sndBad(); updateDex(); return; }
    if (an.stereoUndef) { msg.textContent = T('雙鍵的順反還沒決定：把雙鍵碳上的一個鍵改畫成斜的，再收。', 'Cis or trans is not decided yet: draw a bond on the C=C at an angle, then add it.'); sndBad(); updateDex(); return; }
    if (!O.inTarget(an, t)) {
      msg.textContent = T('這是 ' + an.ftext + '（' + an.clsName[0] + '），不屬於「' + targetLabel(t) + '」。', 'This is ' + an.ftext + ' (' + an.clsName[1] + '), not part of “' + targetLabel(t) + '”.');
      sndBad(); updateDex(); return;
    }
    const nm = nameOf(an) || an.ftext;
    if (L.some(function (it) { return it.key === an.key; })) {
      flashKey = an.key;
      msg.textContent = T('圖鑑裡已經有「' + nm + '」了：畫法不同，但是同一個分子。', '“' + nm + '” is already in the collection: drawn differently, but the same molecule.');
      tone(392, 0.16, 'triangle', 0.07);
      updateDex();
      emit('collect', { target: t.id, n: L.length, total: N, complete: L.length >= N, added: false, en: an.en });
      return;
    }
    L.push({ key: an.key, atoms: state.atoms.map(function (a) { return { el: a.el, q: a.q, r: a.r }; }), bonds: state.bonds.map(function (b) { return { a: b.a, b: b.b, o: b.o }; }), an: an });
    flashKey = an.key;
    saveDex();
    const done = L.length >= N;
    msg.className = 'dexmsg good';
    msg.textContent = done ? T('全部收齊！' + t.id.replace(/-ene$/, '') + ' 共 ' + N + ' 種，一個也不少。', 'Complete! All ' + N + ' of them, not one missing.')
      : T('收進圖鑑：' + nm + '（' + L.length + ' / ' + N + '）', 'Added: ' + nm + ' (' + L.length + ' / ' + N + ')');
    if (done) [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.14, 'sine', 0.07, i * 0.1); });
    else { tone(784, 0.1, 'sine', 0.08); tone(1175, 0.18, 'sine', 0.08, 0.11); }
    updateDex(); drawGraph(); updateWhy();
    emit('collect', { target: t.id, n: L.length, total: N, complete: done, added: true, en: an.en });
  }
  function clearDex() {
    acted();
    dex[state.target] = [];
    saveDex();
    flashKey = null;
    $('dexMsg').className = 'dexmsg';
    $('dexMsg').textContent = T('已清空這個分子式的圖鑑。', 'The collection for this formula has been emptied.');
    updateDex(); drawGraph(); updateWhy();
  }
  $('dexList').addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-key]');
    if (!b) return;
    acted();
    const it = list().filter(function (x) { return x.key === b.getAttribute('data-key'); })[0];
    if (!it) return;
    if (state.view === '3d') state.bond3 = -1;
    setMolecule(it.atoms.map(function (a) { return { el: a.el, q: a.q, r: a.r }; }), it.bonds.map(function (x) { return { a: x.a, b: x.b, o: x.o }; }), -1);
    $('dexMsg').className = 'dexmsg';
    $('dexMsg').textContent = T('已載入：' + (nameOf(an) || an.ftext), 'Loaded: ' + (nameOf(an) || an.ftext));
  });

  // ======================= 沸點圖 =======================
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  let gw = 600, gh = 340;
  function chartData() {
    const t = O.target(state.target);
    const L = list().filter(function (it) { return it.an.bp != null; }).map(function (it) { return { an: it.an, cur: an.ok && it.key === an.key, coll: true }; });
    if (an.ok && an.bp != null && O.inTarget(an, t) && !L.some(function (d) { return d.cur; })) L.push({ an: an, cur: true, coll: false });
    return L;
  }
  function nice(lo, hi, n) {
    const span = Math.max(1e-9, hi - lo), raw = span / (n || 5), p = Math.pow(10, Math.floor(Math.log10(raw)));
    const st = [1, 2, 5, 10].map(function (m) { return m * p; }).filter(function (x) { return x >= raw; })[0] || 10 * p;
    return { lo: Math.floor(lo / st) * st, hi: Math.ceil(hi / st) * st, step: st };
  }
  function resizeGraph() {
    const w = gcv.clientWidth;
    if (!w) return;
    const D = chartData();
    const rowH = fsz(24);
    gw = w;
    gh = state.chart === 'bar' ? Math.round(Math.max(240, 70 + Math.max(3, D.length) * rowH)) : Math.round(Math.max(260, Math.min(420, w * 0.62)));
    gcv.style.height = gh + 'px';
    const d = Math.min(window.devicePixelRatio || 1, 2);
    gcv.width = Math.round(gw * d); gcv.height = Math.round(gh * d);
    gctx.setTransform(d, 0, 0, d, 0, 0);
  }
  function drawGraph() {
    resizeGraph();
    const g = gctx, D = chartData(), t = O.target(state.target);
    LD.backdrop(g, gw, gh);
    const f12 = fsz(12) + 'px ' + LD.FONT, f11 = fsz(11) + 'px ' + LD.FONT;
    const hint = $('gHint');
    if (!D.length) {
      LD.haloText(g, T('圖鑑裡還沒有 ' + t.id.replace(/-ene$/, '') + ' 的分子', 'No ' + t.id.replace(/-ene$/, '') + ' molecules in the collection yet'), gw / 2, gh / 2, LD.c.muted, 'center', 'middle', '600 ' + fsz(14) + 'px ' + LD.FONT);
      hint.textContent = T('組出「' + targetLabel(t) + '」裡的分子並收進圖鑑，這裡就會畫出它們的沸點。', 'Build molecules from “' + targetLabel(t) + '” and add them to the collection to plot their boiling points.');
      gcv.setAttribute('aria-label', T('沸點圖：還沒有資料', 'Boiling point graph: no data yet'));
      return;
    }
    const bps = D.map(function (d) { return d.an.bp; });
    if (state.chart === 'bar') {
      D.sort(function (a, b) { return b.an.bp - a.an.bp; });
      const ax = nice(Math.min.apply(null, bps) - 2, Math.max.apply(null, bps) + 2, 5);
      g.font = '600 ' + f12;
      const labW = Math.min(gw * 0.46, Math.max.apply(null, D.map(function (d) { return g.measureText(nameOf(d.an) || d.an.ftext).width; })) + 14);
      const x0 = labW + 8, x1 = gw - 56, y0 = 30, rowH = (gh - y0 - 34) / D.length;
      const X = function (v) { return x0 + (v - ax.lo) / (ax.hi - ax.lo) * (x1 - x0); };
      // 格線
      for (let v = ax.lo; v <= ax.hi + 1e-9; v += ax.step) {
        const x = X(v);
        g.strokeStyle = LD.alpha(LD.c.text, Math.abs(v) < 1e-9 ? 0.3 : 0.08); g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y0 - 6); g.lineTo(x, gh - 30); g.stroke();
        LD.haloText(g, num(v, ax.step < 1 ? 1 : 0), x, gh - 14, LD.c.muted, 'center', 'middle', f11);
      }
      LD.haloText(g, T('沸點（°C，1 atm）', 'Boiling point (°C, 1 atm)'), x1, 14, LD.c.muted, 'right', 'middle', '600 ' + f11);
      D.forEach(function (d, i) {
        const y = y0 + rowH * (i + 0.5), h = Math.min(rowH * 0.62, fsz(16));
        const color = d.an.cls === 'alcohol' ? LD.c.neg : d.an.cls === 'ether' ? LD.c.field : d.an.cls === 'ketone' || d.an.cls === 'aldehyde' ? LD.c.pos : LD.c.accent;
        const xa = X(ax.lo), xb = X(d.an.bp);
        if (d.coll) LD.block(g, xa, y - h / 2, Math.max(3, xb - xa), h, color, { r: 4 });
        else {
          g.save(); g.setLineDash([5, 4]); g.strokeStyle = color; g.lineWidth = 1.6;
          LD.roundRect(g, xa, y - h / 2, Math.max(3, xb - xa), h, 4); g.stroke(); g.restore();
        }
        LD.haloText(g, nameOf(d.an) || d.an.ftext, labW, y, d.cur ? LD.c.accent : LD.c.text, 'right', 'middle', (d.cur ? '700 ' : '600 ') + f12);
        LD.haloText(g, num(d.an.bp, 1) + (d.coll ? '' : T('（目前）', ' (now)')), xb + 6, y, LD.c.text, 'left', 'middle', f11);
      });
    } else {
      const Ws = D.map(function (d) { return d.an.W; });
      const axX = nice(Math.min.apply(null, Ws) - 1, Math.max.apply(null, Ws) + 1, 5), axY = nice(Math.min.apply(null, bps) - 3, Math.max.apply(null, bps) + 3, 5);
      const x0 = 52, x1 = gw - 18, y0 = 22, y1 = gh - 42;
      const X = function (v) { return x0 + (v - axX.lo) / (axX.hi - axX.lo) * (x1 - x0); }, Y = function (v) { return y1 - (v - axY.lo) / (axY.hi - axY.lo) * (y1 - y0); };
      for (let v = axX.lo; v <= axX.hi + 1e-9; v += axX.step) {
        g.strokeStyle = LD.alpha(LD.c.text, 0.08); g.beginPath(); g.moveTo(X(v), y0); g.lineTo(X(v), y1); g.stroke();
        LD.haloText(g, num(v, 0), X(v), y1 + 14, LD.c.muted, 'center', 'middle', f11);
      }
      for (let v = axY.lo; v <= axY.hi + 1e-9; v += axY.step) {
        g.strokeStyle = LD.alpha(LD.c.text, Math.abs(v) < 1e-9 ? 0.3 : 0.08); g.beginPath(); g.moveTo(x0, Y(v)); g.lineTo(x1, Y(v)); g.stroke();
        LD.haloText(g, num(v, axY.step < 1 ? 1 : 0), x0 - 6, Y(v), LD.c.muted, 'right', 'middle', f11);
      }
      LD.haloText(g, T('維納指數 W（越大越伸展）', 'Wiener index W (larger = more stretched out)'), (x0 + x1) / 2, gh - 10, LD.c.muted, 'center', 'middle', '600 ' + f11);
      LD.haloText(g, T('沸點（°C）', 'Boiling point (°C)'), x0 + 4, y0 - 10, LD.c.muted, 'left', 'middle', '600 ' + f11);
      g.lineWidth = 1;
      const many = D.length > 8;
      const lo = Math.min.apply(null, bps), hi = Math.max.apply(null, bps);
      D.forEach(function (d) {
        const x = X(d.an.W), y = Y(d.an.bp);
        if (d.coll) LD.ball(g, x, y, 6, d.cur ? LD.c.pos : LD.c.accent);
        else { g.save(); g.setLineDash([3, 3]); g.strokeStyle = LD.c.pos; g.lineWidth = 1.8; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.stroke(); g.restore(); }
        if (!many || d.cur || d.an.bp === lo || d.an.bp === hi) {
          const right = x < (x0 + x1) / 2;
          LD.haloText(g, nameOf(d.an) || d.an.ftext, x + (right ? 10 : -10), y - 9, d.cur ? LD.c.pos : LD.c.text, right ? 'left' : 'right', 'middle', (d.cur ? '700 ' : '') + f11);
        }
      });
    }
    const lo = D.slice().sort(function (a, b) { return a.an.bp - b.an.bp; });
    hint.textContent = state.chart === 'bar'
      ? T('長條是 CRC 手冊的沸點；虛線框是目前組的分子（還沒收進圖鑑）。顏色：藍＝烴、紅＝醇、綠＝醚、橙＝醛酮。', 'Bars show CRC Handbook boiling points; a dashed bar is the molecule you are building (not yet collected). Colours: blue = hydrocarbon, red = alcohol, green = ether, orange = aldehyde or ketone.')
      : T('橫軸是維納指數：分子越長、支鏈越少，W 越大。烷類的沸點大致隨 W 上升，但不是完全一致。', 'The horizontal axis is the Wiener index: the longer and less branched the molecule, the larger W. Alkane boiling points mostly rise with W, though not perfectly.');
    gcv.setAttribute('aria-label', T('沸點：', 'Boiling points: ') + lo.map(function (d) { return (nameOf(d.an) || d.an.ftext) + ' ' + num(d.an.bp, 1) + ' °C'; }).join(T('、', ', ')));
  }
  function updateWhy() {
    const t = O.target(state.target), L = list().filter(function (it) { return it.an.bp != null; });
    let txt;
    if (t.scope === 'alkane') txt = T('烷類分子之間只有倫敦分散力，作用在分子互相接觸的地方。直鏈分子長長的，能和鄰居大面積並排；支鏈多的分子緊湊、接近球形，接觸面積小，吸引力弱，沸點就低。',
      'Alkane molecules attract one another only by London dispersion forces, acting where they touch. A straight chain can lie alongside its neighbours over a large area; a branched molecule is compact and nearly spherical, touches less, attracts less, and boils lower.');
    else if (t.scope === 'ene') txt = T('烯類的沸點也是直鏈高、支鏈低。順式的兩個烷基在雙鍵同一側，分子有一點極性，沸點略高於反式：順-2-丁烯 3.7 °C，反-2-丁烯 0.9 °C。',
      'Alkenes also boil higher when straight and lower when branched. In a cis isomer both alkyl groups are on one side, giving a small dipole, so it boils a little higher than the trans: cis-2-butene 3.7 °C, trans-2-butene 0.9 °C.');
    else if (t.scope === 'hc') txt = T('一個環和一個雙鍵一樣，都讓分子少兩個氫，所以環烷和烯類可以是同分異構物（官能基異構）。環狀分子比較緊湊、剛硬，排得整齊，沸點常比同碳數的烯類高。',
      'A ring removes two hydrogens just as a double bond does, so cycloalkanes and alkenes can be isomers of each other. Ring molecules are rigid and pack neatly, and often boil higher than the alkenes with the same carbons.');
    else if (t.scope === 'any') txt = T('醇的 O–H 能和鄰近分子的氧形成氫鍵，醚的氧上沒有氫，彼此之間形成不了氫鍵，所以同分子式的醇沸點比醚高得多。',
      'The O–H of an alcohol forms hydrogen bonds with the oxygen of neighbouring molecules; an ether has no H on its oxygen and cannot, so an alcohol boils far higher than its isomeric ether.');
    else txt = T('醛和酮都有極性很強的 C=O，分子之間有偶極–偶極力，沸點比同大小的烷類高；但它們沒有 O–H，沸點又比同大小的醇低。',
      'Aldehydes and ketones have a strongly polar C=O, so dipole–dipole forces raise their boiling points above alkanes of similar size; with no O–H they still boil below the alcohols.');
    if (L.length >= 2) {
      const s2 = L.slice().sort(function (a, b) { return b.an.bp - a.an.bp; });
      const hi = s2[0].an, lo = s2[s2.length - 1].an;
      txt += T(' 你收集的 ' + L.length + ' 種裡，沸點最高的是' + nameOf(hi) + '（' + num(hi.bp, 1) + ' °C），最低的是' + nameOf(lo) + '（' + num(lo.bp, 1) + ' °C），相差 ' + num(hi.bp - lo.bp, 1) + ' °C。',
        ' Of the ' + L.length + ' you collected, ' + nameOf(hi) + ' boils highest (' + num(hi.bp, 1) + ' °C) and ' + nameOf(lo) + ' lowest (' + num(lo.bp, 1) + ' °C), ' + num(hi.bp - lo.bp, 1) + ' °C apart.');
    }
    $('whyOut').textContent = txt;
  }

  // ======================= 3D 與繞鍵旋轉 =======================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  function getE() {
    if (!E3 && an.ok) E3 = O.embed3D(toMol());
    return E3;
  }
  function bondName(k) {
    const b = state.bonds[k];
    const lab = function (i) {
      const loc = an.ok && an.name && an.name.loc ? an.name.loc[i] : null;
      return state.atoms[i].el + (loc ? loc : '');
    };
    const sym = b.o === 1 ? '–' : b.o === 2 ? '=' : '≡';
    const kind = b.o === 1 ? T('單鍵', 'single') : b.o === 2 ? T('雙鍵', 'double') : T('參鍵', 'triple');
    return lab(b.a) + sym + lab(b.b) + ' ' + kind;
  }
  function fillBonds() {
    const sel = $('bondSel');
    const opts = ['<option value="-1">' + T('（點 3D 模型上的鍵，或從這裡選）', '(tap a bond in the 3D model, or pick one here)') + '</option>'];
    if (an.ok) state.bonds.forEach(function (b, k) { opts.push('<option value="' + k + '">' + esc(bondName(k)) + '</option>'); });
    sel.innerHTML = opts.join('');
    sel.value = String(state.bond3);
  }
  /** 這個鍵可以轉嗎？不行時傳回原因 */
  function twistBlock(k) {
    if (k < 0 || !an.ok) return T('先選一個鍵。', 'Choose a bond first.');
    const b = state.bonds[k], E = getE();
    if (O.bondInRing(an.G, b.a, b.b)) return T('環上的鍵轉不動：一轉，環就要斷開。', 'A bond in a ring cannot turn: turning it would break the ring.');
    if (b.o === 3) return T('參鍵兩端和它排成一直線，繞著它轉，形狀完全不變。', 'The atoms on a triple bond lie in a straight line, so turning about it changes nothing.');
    const cnt = function (x, y) { return E.bonds.filter(function (e) { return (e.a === x && e.b !== y) || (e.b === x && e.a !== y); }).length; };
    if (!cnt(b.a, b.b) || !cnt(b.b, b.a)) return T('這個鍵有一端沒有接別的原子，轉了也看不出差別。', 'One end of this bond carries nothing else, so turning it shows no change.');
    return null;
  }
  function positions() {
    const E = getE();
    if (!E) return null;
    if (state.bond3 < 0 || !state.twist || !side3) return E.atoms;
    const b = state.bonds[state.bond3];
    return O.rotateSide(E, b.a, b.b, side3, state.twist);
  }
  function piFactor() { const c = Math.cos(state.twist * Math.PI / 180); return c * c; }
  function energyAt(th) {
    const b = state.bonds[state.bond3], E = getE();
    if (b.o === 2) return O.PI_BOND * Math.pow(Math.sin(th * Math.PI / 180), 2);
    return O.twistEnergy(E, b.a, b.b, O.rotateSide(E, b.a, b.b, side3, th), 0, 1).E;
  }
  function selectBond(k) {
    state.bond3 = k;
    state.twist = 0;
    side3 = null; curve = null;
    LNclear();
    const why = k >= 0 ? twistBlock(k) : null;
    if (k >= 0 && !why) {
      const b = state.bonds[k];
      side3 = O.side3D(getE(), b.a, b.b);
      curve = [];
      for (let th = -180; th <= 180; th += 4) curve.push([th, energyAt(th)]);
    }
    $('bondSel').value = String(k);
    tone(620, 0.05, 'sine', 0.03);
    updateTwist(why);
    if (view3) view3.update(false);
  }
  function LNclear() { const tw = $('twist'); if (window.LabNum) window.LabNum.clear(tw); tw.value = '0'; }
  function twistNow() {
    if (state.bond3 < 0 || !side3) return null;
    const b = state.bonds[state.bond3];
    if (b.o === 2) return { E: state.light ? null : energyAt(state.twist), order: 2, minHH: 999 };
    const E = getE(), r = O.twistEnergy(E, b.a, b.b, positions(), 0, 1);
    return { E: r.E, order: 1, minHH: r.minHH };
  }
  function updateTwist(why) {
    const tw = $('twist'), msg = $('twMsg'), out = $('twOut');
    const ok = state.bond3 >= 0 && !!side3;
    tw.disabled = !ok;
    $('twReset').disabled = !ok;
    $('twisto').textContent = num(state.twist, 0) + '°';
    if (why === undefined) why = state.bond3 >= 0 ? twistBlock(state.bond3) : null;
    if (!an.ok) msg.textContent = T('先在 2D 平面組好一個完整的分子。', 'Build a complete molecule in 2D first.');
    else if (state.bond3 < 0) msg.textContent = T('點 3D 模型上的一個鍵，或從上面的選單選一個鍵。', 'Tap a bond in the 3D model, or pick one from the menu above.');
    else if (why) msg.textContent = why;
    else {
      const b = state.bonds[state.bond3];
      msg.textContent = b.o === 2
        ? (state.light ? T('照光把 π 鍵打開了：可以自由扭轉。扭過 90° 放手，看看會變成什麼。', 'Light has opened the π bond, so it twists freely. Let go past 90° and see what forms.')
          : T('雙鍵要先打斷 π 鍵才轉得動，最多只能扭到 90°，放手就彈回。', 'The π bond must break before a double bond turns: you can twist only to 90°, and it springs back when you let go.'))
        : T('單鍵可以自由旋轉。看看前後兩個碳上的原子團對齊（重疊式）時，能量最高。', 'A single bond turns freely. Watch the energy peak when the groups on the two carbons line up (eclipsed).');
    }
    const tn = ok ? twistNow() : null;
    if (!tn) out.innerHTML = '<dt>' + T('扭轉能', 'Twist energy') + '</dt><dd>—</dd>';
    else {
      const rows = [[T('鍵', 'Bond'), esc(bondName(state.bond3))], [T('扭轉角', 'Twist angle'), num(state.twist, 0) + '°']];
      if (tn.E == null) rows.push([T('扭轉能', 'Twist energy'), T('≈ 0<small>π 鍵已被光打開</small>', '≈ 0<small>the π bond is opened by light</small>')]);
      else {
        rows.push([T('扭轉能', 'Twist energy'), num(tn.E, 1) + ' kJ/mol']);
        rows.push([T('相當於', 'Compared with RT'), num(tn.E / O.RT298, tn.E / O.RT298 < 10 ? 1 : 0) + T(' 倍 RT', ' × RT') + '<small>' + T('室溫 RT = 2.48 kJ/mol', 'room temperature RT = 2.48 kJ/mol') + '</small>']);
      }
      out.innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('');
    }
    drawEnergy();
  }
  const ecv = $('ecv'), ectx = ecv.getContext('2d');
  function drawEnergy() {
    const w = ecv.clientWidth, h = ecv.clientHeight || 130;
    if (!w) return;
    const d = Math.min(window.devicePixelRatio || 1, 2);
    if (ecv.width !== Math.round(w * d) || ecv.height !== Math.round(h * d)) { ecv.width = Math.round(w * d); ecv.height = Math.round(h * d); }
    const g = ectx;
    g.setTransform(d, 0, 0, d, 0, 0);
    LD.backdrop(g, w, h);
    const f11 = fsz(11) + 'px ' + LD.FONT;
    if (!curve) { LD.haloText(g, T('選一個可以轉的鍵，這裡會畫出扭轉能曲線', 'Choose a bond that can turn to see its energy curve'), w / 2, h / 2, LD.c.muted, 'center', 'middle', f11); return; }
    const b = state.bonds[state.bond3];
    const emax = b.o === 2 ? 300 : nice(0, Math.max(4, Math.max.apply(null, curve.map(function (c) { return c[1]; })) * 1.12), 3).hi;
    const x0 = 40, x1 = w - 8, y0 = 10, y1 = h - 22;
    const X = function (t) { return x0 + (t + 180) / 360 * (x1 - x0); }, Y = function (e) { return y1 - e / emax * (y1 - y0); };
    g.strokeStyle = LD.alpha(LD.c.text, 0.1); g.lineWidth = 1;
    [-180, -90, 0, 90, 180].forEach(function (t) { g.beginPath(); g.moveTo(X(t), y0); g.lineTo(X(t), y1); g.stroke(); LD.haloText(g, t + '°', X(t), y1 + 11, LD.c.muted, 'center', 'middle', f11); });
    [0, emax / 2, emax].forEach(function (e) { LD.haloText(g, num(e, 0), x0 - 4, Y(e), LD.c.muted, 'right', 'middle', f11); });
    LD.haloText(g, 'kJ/mol', x0 + 4, y0 + 6, LD.c.muted, 'left', 'middle', f11);
    // RT 的高度
    g.save(); g.setLineDash([4, 3]); g.strokeStyle = LD.alpha(LD.c.pos, 0.8);
    g.beginPath(); g.moveTo(x0, Y(O.RT298)); g.lineTo(x1, Y(O.RT298)); g.stroke(); g.restore();
    LD.haloText(g, 'RT', x1 - 2, Y(O.RT298) - 7, LD.c.pos, 'right', 'middle', '600 ' + f11);
    g.save();
    if (b.o === 2 && state.light) { g.globalAlpha = 0.35; g.setLineDash([5, 4]); }
    g.strokeStyle = LD.c.accent; g.lineWidth = 2.2;
    g.beginPath();
    curve.forEach(function (c, i) { if (i) g.lineTo(X(c[0]), Y(c[1])); else g.moveTo(X(c[0]), Y(c[1])); });
    g.stroke(); g.restore();
    if (b.o === 2 && state.light) {
      g.strokeStyle = LD.c.neg; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(x0, Y(4)); g.lineTo(x1, Y(4)); g.stroke();
      LD.haloText(g, T('照光：π 鍵打開', 'light: π bond open'), (x0 + x1) / 2, Y(4) - 9, LD.c.neg, 'center', 'middle', '600 ' + f11);
    }
    const tn = twistNow();
    const ey = tn && tn.E != null ? tn.E : 4;
    LD.ball(g, X(state.twist), Y(Math.min(emax, ey)), 5.5, LD.c.pos);
  }
  // 雙鍵放手彈回：唯一的動畫迴圈
  let anim = null, raf = 0, dirty = false;
  function request() { dirty = true; kick(); }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    if (anim) {
      const u = Math.min(1, (performance.now() - anim.t0) / anim.dur), e = 1 - Math.pow(1 - u, 3);
      state.twist = anim.from * (1 - e);
      if (u >= 1) { state.twist = 0; anim = null; }
      $('twist').value = String(Math.round(state.twist));
      updateTwist();
      if (view3) view3.update(false);
      if (anim) kick();
    }
    if (dirty) { dirty = false; if (state.view === '2d') draw(); }
  }
  function springBack() {
    if (!state.twist) return;
    sweep(700, 350, 0.25);
    if (window.LabNum) window.LabNum.clear($('twist'));
    if (reducedMotion) { state.twist = 0; $('twist').value = '0'; updateTwist(); if (view3) view3.update(false); return; }
    anim = { from: state.twist, t0: performance.now(), dur: 420 };
    kick();
  }
  function onTwistInput() {
    acted();
    if (state.bond3 < 0 || !side3) return;
    anim = null;
    const b = state.bonds[state.bond3];
    let v = window.LabNum ? window.LabNum.value($('twist')) : +$('twist').value;
    if (!isFinite(v)) v = 0;
    v = Math.max(-180, Math.min(180, v));
    if (b.o === 2 && !state.light && Math.abs(v) > 90) { v = v > 0 ? 90 : -90; if (window.LabNum) window.LabNum.clear($('twist')); $('twist').value = String(v); }
    state.twist = v;
    updateTwist();
    if (view3) view3.update(false);
    const tn = twistNow();
    emit('twist', { en: an.en, order: b.o, angle: v, E: tn ? tn.E : null, eclipsed: !!tn && tn.order === 1 && tn.minHH < 5, light: state.light });
  }
  function onTwistRelease() {
    if (state.bond3 < 0 || !side3) return;
    const b = state.bonds[state.bond3];
    if (b.o !== 2) return;
    if (state.light && Math.abs(state.twist) > 90) photoFlip();
    else springBack();
  }
  /** 照光翻轉：把雙鍵一端的原子團在格子上鏡射到另一側（順反互換） */
  function photoFlip() {
    const k = state.bond3, b = state.bonds[k], from = an.en;
    const tryFlip = function (a, c) {
      const side = O.sideOf(an.G, a, c);
      if (!side) return null;
      const A = state.atoms[a], C = state.atoms[c], inS = {};
      side.forEach(function (i) { inS[i] = true; });
      const np = {};
      for (const i of side) {
        if (i === c) continue;
        const p = O.lreflect(state.atoms[i].q, state.atoms[i].r, A.q, A.r, C.q, C.r);
        if (!inGrid(p.q, p.r)) return null;
        const o = atomAt(p.q, p.r);
        if (o >= 0 && !inS[o]) return null;
        np[i] = p;
      }
      return np;
    };
    let np = tryFlip(b.a, b.b) || tryFlip(b.b, b.a);
    if (!np) {
      status(T('格子上擺不下翻過去的那一半：先在 2D 把分子拉開一點。', 'The flipped half does not fit on the grid: spread the molecule out in 2D first.'), 'warn');
      springBack(); return;
    }
    pushUndo();
    Object.keys(np).forEach(function (i) { state.atoms[+i].q = np[i].q; state.atoms[+i].r = np[i].r; });
    sweep(400, 1200, 0.3);
    analyzeNow();
    state.bond3 = k;
    selectBondQuiet(k);
    updateMolCard(); updateDex(); drawGraph(); fillBonds();
    if (view3) view3.update(false);
    request();
    const to = an.en;
    const same = from === to;
    $('twMsg').textContent = same ? T('翻過去還是同一個分子：這個雙鍵沒有順反異構。', 'Still the same molecule: this double bond has no cis–trans isomers.')
      : T('光讓雙鍵翻了身：', 'Light flipped the double bond: ') + (nameOf(an) || an.ftext);
    emit('photo', { from: from, to: to });
    emitMol();
  }
  function selectBondQuiet(k) {
    state.twist = 0; LNclear();
    side3 = null; curve = null;
    if (k >= 0 && !twistBlock(k)) {
      const b = state.bonds[k];
      side3 = O.side3D(getE(), b.a, b.b);
      curve = [];
      for (let th = -180; th <= 180; th += 4) curve.push([th, energyAt(th)]);
    }
    updateTwist();
  }
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
      mol: function () {
        const E = getE();
        if (!E) return null;
        const P = positions(), nh = state.bonds.length;
        return {
          atoms: E.atoms.map(function (a, i) { return { el: a.el, x: P[i].x, y: P[i].y, z: P[i].z }; }),
          bonds: E.bonds.map(function (b, k) { return { a: b.a, b: b.b, o: b.o, heavy: k < nh, pi: k === state.bond3 && b.o === 2 ? piFactor() : 1 }; })
        };
      },
      selected: function () { return state.bond3; },
      pick: function (k) { acted(); selectBond(k); },
      dark: function () { return LD.dark; },
      accent: function () { return LD.c.accent; },
      hud: function () {
        const nm = nameOf(an);
        return {
          tl: an.ok ? (nm || an.ftext) : T('先在 2D 平面組好一個分子', 'Build a molecule in 2D first'),
          tr: state.bond3 >= 0 && side3 ? bondName(state.bond3) + '  ' + num(state.twist, 0) + '°' : ''
        };
      },
      contextLost: function () { setView('2d'); viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.'); }
    };
  }
  function refresh3D(refit) {
    fillBonds();
    selectBondQuiet(state.bond3);
    if (view3) view3.update(refit);
  }
  function setPressed(mode) {
    $('twCard').hidden = mode !== '3d'; $('view2d').setAttribute('aria-pressed', String(mode === '2d')); $('view3d').setAttribute('aria-pressed', String(mode === '3d')); }
  function setView(mode) {
    if (mode === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable() || !window.OI3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        state.view = '3d';
        refresh3D(false);
        view3 = window.OI3D.create(lib, bridge());
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        view3.update(true);
        emitMol();
      }).catch(function (err) {
        if (token !== loadToken) return;
        if (window.console) console.warn('3D view unavailable:', err);
        fail3D();
      });
    } else {
      loadToken++;
      setPressed('2d');
      state.view = '2d';
      anim = null; state.twist = 0;
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
    state.view = '2d';
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }

  // ======================= 控制項 =======================
  function setPen(el) { state.pen = el; $('penC').setAttribute('aria-pressed', String(el === 'C')); $('penO').setAttribute('aria-pressed', String(el === 'O')); }
  function setDraw(m) { state.draw = m; $('drawFull').setAttribute('aria-pressed', String(m === 'full')); $('drawSkel').setAttribute('aria-pressed', String(m === 'skel')); request(); }
  function setChart(m) { state.chart = m; $('chartBar').setAttribute('aria-pressed', String(m === 'bar')); $('chartW').setAttribute('aria-pressed', String(m === 'W')); drawGraph(); }
  $('penC').addEventListener('click', function () { acted(); setPen('C'); });
  $('penO').addEventListener('click', function () { acted(); setPen('O'); });
  $('swapBtn').addEventListener('click', function () { acted(); swapEl(state.sel); });
  $('delBtn').addEventListener('click', function () {
    acted();
    if (state.sel < 0) { status(T('先點一個原子，再按「刪除原子」。', 'Tap an atom first, then press “Delete atom”.'), 'warn'); return; }
    deleteAtom(state.sel);
  });
  $('undoBtn').addEventListener('click', function () {
    acted();
    if (!undoStack.length) { status(T('沒有可以復原的步驟。', 'Nothing to undo.'), 'warn'); return; }
    restore(undoStack.pop());
    sweep(600, 420, 0.1);
    status('');
    changed();
  });
  $('clearBtn').addEventListener('click', function () {
    acted();
    if (!state.atoms.length) return;
    setMolecule([], [], -1);
    sweep(500, 260, 0.18);
  });
  $('drawFull').addEventListener('click', function () { acted(); setDraw('full'); });
  $('drawSkel').addEventListener('click', function () { acted(); setDraw('skel'); });
  $('numChk').addEventListener('change', function () { acted(); state.nums = $('numChk').checked; request(); });
  $('nC').addEventListener('input', function () { $('nCo').textContent = String(Math.round(window.LabNum ? window.LabNum.value($('nC')) : +$('nC').value)); });
  $('chainBtn').addEventListener('click', function () {
    acted();
    const n = Math.max(1, Math.min(8, Math.round(window.LabNum ? window.LabNum.value($('nC')) : +$('nC').value)));
    const c = chainAtoms(n);
    setMolecule(c.atoms, c.bonds, n - 1);
    tone(520, 0.08); tone(660, 0.1, 'sine', 0.06, 0.09);
  });
  $('collectBtn').addEventListener('click', collect);
  $('dexClear').addEventListener('click', clearDex);
  $('target').addEventListener('change', function () {
    acted();
    state.target = $('target').value;
    flashKey = null;
    $('dexMsg').textContent = '';
    updateDex(); updateMolCard(); drawGraph(); updateWhy();
  });
  $('chartBar').addEventListener('click', function () { acted(); setChart('bar'); });
  $('chartW').addEventListener('click', function () { acted(); setChart('W'); });
  $('view2d').addEventListener('click', function () { acted(); setView('2d'); });
  $('view3d').addEventListener('click', function () { acted(); setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });
  $('bondSel').addEventListener('change', function () { acted(); selectBond(+$('bondSel').value); });
  $('twist').addEventListener('input', onTwistInput);
  $('twist').addEventListener('change', onTwistRelease);
  $('light').addEventListener('change', function () {
    acted();
    state.light = $('light').checked;
    if (state.light) tone(980, 0.12, 'sine', 0.05);
    if (!state.light && state.bond3 >= 0 && state.bonds[state.bond3] && state.bonds[state.bond3].o === 2 && Math.abs(state.twist) > 0) springBack();
    updateTwist();
  });
  $('twReset').addEventListener('click', function () { acted(); anim = null; state.twist = 0; LNclear(); updateTwist(); if (view3) view3.update(false); });
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
    if (ev.detail && ev.detail.name === 'fs') { resize(); drawGraph(); drawEnergy(); }
  });

  // ======================= 鍵盤 =======================
  function cursorDescribe() {
    const c = state.cur, i = atomAt(c.q, c.r);
    if (i < 0) return T('空格點', 'empty point') + (state.atoms.length ? '' : T('，按 C 或 O 放第一個原子', '; press C or O for the first atom'));
    const h = Math.max(0, free(i));
    return elName(state.atoms[i].el) + T('，接了 ' + h + ' 個氫', ', with ' + h + ' hydrogens') + (an.ok && nameOf(an) ? T('；分子：', '; molecule: ') + nameOf(an) : '');
  }
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('組分子的格子。方向鍵移動游標；按 C 或 O 在游標處加碳或氧（接在剛才選取的原子上）；游標移到原子上就選取它；按 1、2、3 把它和上一個選取的原子之間改成單鍵、雙鍵、參鍵；Delete 刪除原子。',
        'Building grid. Arrow keys move the cursor; press C or O to add carbon or oxygen at the cursor (bonded to the atom selected before); moving onto an atom selects it; 1, 2, 3 set the bond to the previously selected atom to single, double or triple; Delete removes the atom.'),
      items: [{
        name: function () { return T('游標', 'Cursor'); },
        move: function (dx, dy) {
          if (!dx && !dy) return false;
          const c = state.cur;
          let d;
          const yInt = Math.abs(((c.r + c.q / 2) % 1)) < 1e-9;
          if (dx > 0) d = yInt ? O.DIRS[5] : O.DIRS[0];
          else if (dx < 0) d = yInt ? O.DIRS[3] : O.DIRS[2];
          else if (dy > 0) d = O.DIRS[4];
          else d = O.DIRS[1];
          const q = c.q + d[0], r = c.r + d[1];
          if (!inGrid(q, r) || !inView(q, r)) return false;
          acted();
          state.cur = { q: q, r: r };
          const i = atomAt(q, r);
          if (i >= 0 && i !== state.sel) { state.prev = state.sel; state.sel = i; }
          request();
          return true;
        },
        describe: cursorDescribe
      }],
      onChange: function () { request(); }
    });
    cv.addEventListener('keydown', function (e) {
      const k = e.key;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const c = state.cur, i = atomAt(c.q, c.r);
      if (k === 'c' || k === 'C' || k === 'o' || k === 'O') {
        e.preventDefault(); acted();
        setPen(k.toUpperCase());
        if (i < 0) placeAt(c.q, c.r);
        else if (state.atoms[i].el !== k.toUpperCase()) swapEl(i);
        kb.say(cursorDescribe());
      } else if (k === 'Delete' || k === 'Backspace') {
        e.preventDefault(); acted();
        if (i >= 0) { deleteAtom(i); kb.say(T('已刪除。', 'Deleted. ') + cursorDescribe()); }
      } else if (k === '1' || k === '2' || k === '3') {
        e.preventDefault(); acted();
        const j = state.prev;
        if (i < 0 || j < 0 || j === i || j >= state.atoms.length || !adjacent(i, j)) { kb.say(T('游標上的原子要和上一個選取的原子相鄰。', 'The atom at the cursor must be next to the previously selected atom.')); return; }
        if (bondIdx(i, j) >= 0 && state.bonds[bondIdx(i, j)].o === +k) return;
        cycleBond(j, i, +k);
        kb.say(cursorDescribe());
      }
    });
  }

  // ======================= 主題與尺寸 =======================
  function themeChanged() {
    readColors();
    if (view3) view3.onTheme();
    request(); drawGraph(); drawEnergy();
  }
  window.addEventListener('lab:themechange', themeChanged);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  if (window.ResizeObserver) {
    let lw = 0, lg = 0, le = 0;
    new ResizeObserver(function () { if (cv.clientWidth && cv.clientWidth !== lw) { lw = cv.clientWidth; resize(); } }).observe(cv);
    new ResizeObserver(function () { if (gcv.clientWidth && gcv.clientWidth !== lg) { lg = gcv.clientWidth; drawGraph(); } }).observe(gcv);
    new ResizeObserver(function () { if (ecv.clientWidth && ecv.clientWidth !== le) { le = ecv.clientWidth; drawEnergy(); } }).observe(ecv);
  } else window.addEventListener('resize', function () { resize(); drawGraph(); drawEnergy(); });

  // ======================= 測試介面（Playwright、試玩） =======================
  window.__oi = {
    state: state, an: function () { return an; }, O: O,
    /** 用格子座標直接放一個分子：atoms [[q, r, el]]、bonds [[a, b, o]] */
    set: function (atoms, bonds) {
      acted();
      setMolecule(atoms.map(function (a) { return { el: a[2] || 'C', q: a[0], r: a[1] }; }), bonds.map(function (b) { return { a: b[0], b: b[1], o: b[2] || 1 }; }), -1);
      return an.en;
    },
    /** 用核心的列舉結果放分子（英文名） */
    build: function (target, en) {
      const t = O.target(target);
      const x = O.enumerate(t.C, t.O, t.H, t.scope).filter(function (y) {
        const pos = O.layout(y.S, y.stereo);
        if (!pos) return false;
        return O.analyze({ atoms: y.S.el.map(function (e, i) { const p = O.lxy(pos[i].q, pos[i].r); return { el: e, x: p.x, y: p.y }; }), bonds: y.S.e.map(function (b) { return { a: b[0], b: b[1], o: b[2] }; }) }).en === en;
      })[0];
      if (!x) return null;
      const pos = O.layout(x.S, x.stereo);
      const mq = Math.min.apply(null, pos.map(function (p) { return p.q; }));
      const dq = 2 - mq + (mq % 2 ? 1 : 0);
      const moved = pos.map(function (p) { return { q: p.q + dq, r: p.r - dq / 2 }; });
      const my = Math.min.apply(null, moved.map(function (p) { return p.r + p.q / 2; }));
      const dy = Math.round(2 - my);
      return window.__oi.set(x.S.el.map(function (e, i) { return [moved[i].q, moved[i].r + dy, e]; }), x.S.e);
    },
    collect: collect, target: function (id) { $('target').value = id; $('target').dispatchEvent(new Event('change')); },
    view: function (m) { acted(); setView(m); },
    bond: function (k) { acted(); selectBond(k); },
    twist: function (v) { const tw = $('twist'); if (window.LabNum) window.LabNum.clear(tw); tw.value = String(v); onTwistInput(); },
    release: onTwistRelease,
    light: function (on) { $('light').checked = !!on; $('light').dispatchEvent(new Event('change')); },
    point: function (q, r) { const p = px(q, r); return [p[0], p[1]]; },
    dex: function () { return dex; }
  };

  // ======================= 啟動 =======================
  readColors();
  $('twCard').hidden = true;
  loadDex();
  fillTargets();
  updateSoundButton();
  setPen('C');
  {
    const c = chainAtoms(4);
    state.atoms = c.atoms; state.bonds = c.bonds; state.sel = -1;
    state.cur = { q: c.atoms[0].q, r: c.atoms[0].r };
  }
  $('nCo').textContent = $('nC').value;
  resize();
  analyzeNow();
  updateMolCard();
  updateDex();
  updateWhy();
  fillBonds();
  updateTwist();
  drawGraph();
  request();
})();
