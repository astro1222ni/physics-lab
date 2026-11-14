/* refractive-index.js — 「折射率的測定（插針法）」的畫面與互動（物理計算在 refractive-index-core.js） */
(function () {
  'use strict';
  const C = window.RefractiveIndexCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const DEG = Math.PI / 180;
  const G = C.GEOM;
  const v = C.v;
  const FONT = D.FONT;
  const clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  const reduced = D.reducedMotion();

  // ---------------- 版面常數 ----------------
  const YT = 9.6;      // 紙張上緣的 y（cm）
  let YSPAN = 26;      // 紙張露出的高度（cm）：長方形 26 cm；半圓形 22 cm（畫得大一點）
  let YB = YT - YSPAN;
  const TB = 50;       // 畫布上方放針插的軟木條（px）
  const M = 8;         // 紙張四周露出的軟木（px）
  const SNAP = 0.35;   // 半圓形：P 吸附到記號點的距離（cm）
  const R = G.semiR;

  // ---------------- 狀態 ----------------
  const seed = ((Date.now() & 0xffffffff) ^ Math.floor(Math.random() * 4294967296)) >>> 0;
  const st = {
    shape: 'rect', mat: 'crown', t: 6, dir: 'fwd',
    res: 1, err: false, hint: false, prot: true, zoom: 'wide', method: 'prot',
    phase: 'align', fade: 1,     // fade：透明塊的不透明度（1 在紙上、0 已移走）
    sel: 'eye', hover: null,
    traces: [], rows: [], meas: null, recorded: false, revealed: false,
    rand: C.rng(seed), sysRot: 0, unknown: 1.5, flash: 0
  };
  st.sysRot = C.systematicRot(st.rand);
  st.unknown = C.unknownN(st.rand);
  const MAT = {};
  C.MATERIALS.forEach(function (m) { MAT[m.id] = m; });

  // 每一種裝置各自記住針與眼睛的位置（切換形狀時不會弄丟）
  const CFG = {
    rect: { pins: { A: v(-6.0, 7.2), B: v(-2.2, 1.6), C: null, D: null }, eye: v(-1.8, -15.2) },
    semiF: { pins: { P: v(-3, Math.sqrt(R * R - 9)), P2: null }, eye: v(-3.2, -11.4) },
    semiR: { pins: { P: v(-4.5, -7.79), P2: null }, eye: v(2.0, 8.8) }
  };
  const PINDEF = {
    rect: [{ id: 'A', role: 'inc', lab: 'A' }, { id: 'B', role: 'inc', lab: 'B' }, { id: 'C', role: 'obs', lab: 'C' }, { id: 'D', role: 'obs', lab: 'D' }],
    semi: [{ id: 'P', role: 'inc', lab: 'P' }, { id: 'O', role: 'fix', lab: 'O' }, { id: 'P2', role: 'obs', lab: 'P′' }]
  };
  const MARKS = [1, 2, 3, 4, 5].map(function (k) { return v(-k, Math.sqrt(R * R - k * k)); });
  // 鍵盤操作（keys.js）：俯視圖與「眼睛看到的景象」各一組，選取的物體和 st.sel 同步
  let kb = null, vkb = null;
  const kbItems = [], vkbItems = [];

  function key() { return st.shape === 'rect' ? 'rect' : st.dir === 'rev' ? 'semiR' : 'semiF'; }
  function cfg() { return CFG[key()]; }
  function pinDefs() { return st.shape === 'rect' ? PINDEF.rect : PINDEF.semi; }
  function pinDef(id) { return pinDefs().filter(function (p) { return p.id === id; })[0]; }
  function nNow() { return st.mat === 'unknown' ? st.unknown : MAT[st.mat].n; }
  function nAcc(id) { return id === 'unknown' ? st.unknown : MAT[id].n; }
  function matName(id) { return T(MAT[id].zh, MAT[id].en); }
  function block() { return C.makeBlock({ shape: st.shape, t: st.t, w: G.rectW, R: R, rot: st.err ? st.sysRot : 0 }); }
  function faces() { const k = key(); return k === 'rect' ? ['top', 'bottom'] : k === 'semiF' ? ['flat', 'arc'] : ['arc', 'flat']; }
  function pinPos(id) { return id === 'O' ? v(0, 0) : cfg().pins[id] || null; }
  function isWater() { return st.mat === 'water'; }

  // ---------------- 顏色 ----------------
  const EXTRA = {};
  function readExtra() {
    const cs = getComputedStyle(document.documentElement);
    ['b-optics', 'b-wave', 'b-mech'].forEach(function (k) { EXTRA[k] = cs.getPropertyValue('--' + k).trim() || '#7c3aed'; });
  }
  readExtra();
  function matColor(id) { return id === 'water' ? D.c.neg : id === 'acrylic' ? EXTRA['b-wave'] : id === 'crown' ? D.c.probe : EXTRA['b-optics']; }
  function roleColor(role) { return role === 'inc' ? D.c.pos : role === 'obs' ? D.c.neg : D.c.equi; }
  function paperColor() { return D.dark ? D.shade(D.c['canvas-bg'], 0.07) : D.mix(D.c['canvas-bg'], '#ffffff', 0.7); }
  function corkColor() { return D.dark ? D.mix(D.c.equi, D.c['canvas-bg'], 0.72) : D.mix(D.c.equi, '#ffffff', 0.4); }
  function pencil(a) { return D.alpha(D.c.field, a); }

  // ---------------- 數字格式 ----------------
  const minus = function (s) { return String(s).replace('-', '−'); };
  /** 「A、B」／“A and B” */
  const and2 = function (a, b) { return a + T('、', ' and ') + b; };
  const andList = function (l) { return l.length < 2 ? l.join('') : T(l.join('、'), l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1]); };
  const fA = function (d) { return st.res === 0.5 ? d.toFixed(1) + '°' : d.toFixed(0) + '°'; };
  const f3 = function (x) { return isFinite(x) ? x.toFixed(3) : '—'; };
  const fcm = function (x) { return isFinite(x) ? x.toFixed(2) + ' cm' : '—'; };
  const fPct = function (p) { return isFinite(p) ? (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p).toFixed(Math.abs(p) < 10 ? 2 : 1) + '%' : '—'; };
  function fmtSlider(x, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = x.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s;
  }

  // ---------------- 主畫布 ----------------
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, s = 16, HW = 10;
  let staticLayer = null, staticKey = '';
  function layoutMain() {
    W = cv.clientWidth || 360;
    const semi = st.shape === 'semi';
    YSPAN = semi ? 22 : 26; YB = YT - YSPAN;
    s = clamp((W - 2 * M) / (semi ? 19 : 24), 12, 22);
    H = Math.round(TB + 2 * M + YSPAN * s);
    if (Math.abs(cv.clientHeight - H) > 0.5) cv.style.height = H + 'px';
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    HW = (W - 2 * M) / (2 * s);
    staticLayer = null;
  }
  const X = function (x) { return W / 2 + x * s; };
  const Y = function (y) { return TB + M + (YT - y) * s; };
  const WX = function (px) { return (px - W / 2) / s; };
  const WY = function (py) { return YT - (py - TB - M) / s; };

  /** 軟木板＋方格紙（不變的圖層，畫在離屏畫布） */
  function buildStatic() {
    const k = [W, H, dpr, D.ver, YSPAN].join('|');
    if (staticLayer && staticKey === k) return staticLayer;
    const c = document.createElement('canvas');
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 軟木板：底色＋細小顆粒＋暈影
    const cork = corkColor();
    const cg = g.createLinearGradient(0, 0, W, H);
    cg.addColorStop(0, D.shade(cork, 0.06)); cg.addColorStop(1, D.shade(cork, -0.08));
    g.fillStyle = cg; g.fillRect(0, 0, W, H);
    const r = C.rng(20261111);
    const nDots = Math.round(W * H / 26);
    for (let i = 0; i < nDots; i++) {
      const x = r() * W, y = r() * H, rr = 0.4 + r() * 1.3, dk = r() < 0.6;
      g.fillStyle = dk ? D.alpha(D.shade(cork, -0.45), 0.10 + r() * 0.22) : D.alpha(D.shade(cork, 0.5), 0.08 + r() * 0.18);
      g.beginPath(); g.ellipse(x, y, rr, rr * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2); g.fill();
    }
    D.backdrop && (function () {
      const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.65);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, D.dark ? 'rgba(0,0,0,0.3)' : 'rgba(40,25,10,0.12)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
    })();
    // 方格紙（陰影、紙色、1 cm 主格線、0.5 cm 與 0.1 cm 次格線，原點對準 O）
    const px0 = M, py0 = TB + M, pw = W - 2 * M, ph = H - TB - 2 * M;
    g.save();
    g.shadowColor = D.dark ? 'rgba(0,0,0,0.6)' : 'rgba(60,40,20,0.35)';
    g.shadowBlur = 10; g.shadowOffsetY = 3;
    g.fillStyle = paperColor(); g.fillRect(px0, py0, pw, ph);
    g.restore();
    const pg = g.createLinearGradient(px0, py0, px0 + pw, py0 + ph);
    pg.addColorStop(0, 'rgba(255,255,255,' + (D.dark ? 0.03 : 0.35) + ')'); pg.addColorStop(1, 'rgba(0,0,0,' + (D.dark ? 0.06 : 0.03) + ')');
    g.fillStyle = pg; g.fillRect(px0, py0, pw, ph);
    g.save();
    g.beginPath(); g.rect(px0, py0, pw, ph); g.clip();
    const ink = D.c.neg;
    const lines = function (step, a, wpx) {
      g.beginPath();
      const x0 = Math.ceil(-HW / step) * step, y0 = Math.ceil(YB / step) * step;
      for (let x = x0; x <= HW + 1e-9; x += step) { const sx = Math.round(X(x) * dpr) / dpr + 0.5 / dpr; g.moveTo(sx, py0); g.lineTo(sx, py0 + ph); }
      for (let y = y0; y <= YT + 1e-9; y += step) { const sy = Math.round(Y(y) * dpr) / dpr + 0.5 / dpr; g.moveTo(px0, sy); g.lineTo(px0 + pw, sy); }
      g.strokeStyle = D.alpha(ink, a); g.lineWidth = wpx; g.stroke();
    };
    if (s >= 18) lines(0.1, D.dark ? 0.045 : 0.06, 1 / dpr);
    lines(0.5, D.dark ? 0.08 : 0.12, 1 / dpr);
    lines(1, D.dark ? 0.14 : 0.27, 1 / dpr);
    lines(5, D.dark ? 0.2 : 0.34, 1.2);
    g.restore();
    staticLayer = c; staticKey = k;
    return c;
  }

  // ---------------- 標籤（含下標） ----------------
  /** parts：[[文字, ''｜'sub'], …]；(x, yb) 為底框底邊的參考點 */
  function richPill(c, parts, x, yb, color, align, px) {
    px = px || 12;
    const fM = '600 ' + px + 'px ' + FONT, fS = '600 ' + (px * 0.74).toFixed(1) + 'px ' + FONT;
    let w = 0, th = 15;
    parts.forEach(function (p) { c.font = p[1] ? fS : fM; const m = c.measureText(p[0]); w += m.width; if (!p[1]) th = D.textHeight(m, px * 1.25); });
    const pw = w + 12, ph = th + 3;
    let bx = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x;
    const by = yb - ph;
    D.roundRect(c, bx, by, pw, ph, ph / 2);
    c.fillStyle = D.alpha(D.c['canvas-bg'], D.dark ? 0.88 : 0.92); c.fill();
    c.strokeStyle = D.alpha(color || D.c.muted, D.dark ? 0.5 : 0.4); c.lineWidth = 1; c.stroke();
    c.fillStyle = color || D.c.text; c.textBaseline = 'middle'; c.textAlign = 'left';
    let cx = bx + 6;
    parts.forEach(function (p) {
      c.font = p[1] ? fS : fM;
      c.fillText(p[0], cx, by + ph / 2 + 0.5 + (p[1] ? px * 0.26 : 0));
      cx += c.measureText(p[0]).width;
    });
    return { x: bx, y: by, w: pw, h: ph };
  }
  function theta(sub, text) { return [['θ', ''], [sub, 'sub'], [text || '', '']]; }

  // ---------------- 視線與像（快取） ----------------
  let VC = null;
  function views() {
    if (VC) return VC;
    const c = cfg(), k = key(), eye = c.eye;
    const bReal = block();
    const b = st.phase === 'align' ? bReal : null;
    const n = nNow(), f = faces();
    const tgt = k === 'rect' ? C.toWorld(bReal, v(0, -st.t / 2)) : v(0, 0);
    const look = C.unit(C.sub(tgt, eye));
    const list = [], by = {};
    pinDefs().forEach(function (pd) {
      const p = pinPos(pd.id);
      if (!p) return;
      let vw;
      if (pd.id === 'O') {
        const d = C.sub(p, eye), dir = C.unit(d);
        vw = { upper: dir, lower: { ok: true, dir: dir, T: 1, direct: k === 'semiR' || !b }, dist: C.len(d) };
      } else vw = C.viewPin(b, n, p, eye, f[0], f[1]);
      const e = { id: pd.id, pd: pd, p: p, vw: vw, dist: vw.dist };
      list.push(e); by[pd.id] = e;
    });
    VC = { eye: eye, look: look, list: list, by: by, b: b, bReal: bReal, tgt: tgt };
    return VC;
  }
  const incIds = function () { return st.shape === 'rect' ? ['A', 'B'] : ['P', 'O']; };
  const obsIds = function () { return st.shape === 'rect' ? ['C', 'D'] : ['P2']; };
  /** 對準情形：入射側兩個像的角距離、觀察側各針與它們的角距離（rad） */
  function alignInfo() {
    const V = views();
    const ang = function (id) { const e = V.by[id]; return e && e.vw.lower.ok ? C.signedAngle(V.look, e.vw.lower.dir) : NaN; };
    const w = function (id) { const e = V.by[id]; return e ? G.pinShaft / e.dist : 0; };
    const ii = incIds(), placedInc = ii.every(function (id) { return !!V.by[id]; });
    const a = ang(ii[0]), b = ang(ii[1]);
    const dAB = a - b, tolAB = 0.6 * (w(ii[0]) + w(ii[1])) / 2;
    const abOK = isFinite(dAB) && Math.abs(dAB) < tolAB;
    const ref = (a + b) / 2;
    const obs = obsIds().map(function (id) {
      if (!V.by[id]) return { id: id, placed: false };
      const d = ang(id) - ref;
      return { id: id, placed: true, d: d, ok: isFinite(d) && Math.abs(d) < 0.6 * (w(id) + (w(ii[0]) + w(ii[1])) / 2) / 2 };
    });
    return {
      placedInc: placedInc, visA: isFinite(a), visB: isFinite(b), dAB: dAB, abOK: abOK, obs: obs,
      allPlaced: placedInc && obs.every(function (o) { return o.placed; }),
      allOK: abOK && obs.every(function (o) { return o.placed && o.ok; })
    };
  }
  /** 眼睛往右（+1）或往左（−1）移，哪一邊能讓入射側兩個像更接近 */
  function eyeHint() {
    const V = views();
    if (!V.b) return 0;
    const ii = incIds(), n = nNow(), f = faces();
    const right = v(V.look.y, -V.look.x);
    const dAt = function (eye) {
      const look = C.unit(C.sub(V.tgt, eye));
      const dirs = ii.map(function (id) {
        const p = pinPos(id);
        if (id === 'O') return C.unit(C.sub(p, eye));
        const vw = C.viewPin(V.b, n, p, eye, f[0], f[1]);
        return vw.lower.ok ? vw.lower.dir : null;
      });
      if (!dirs[0] || !dirs[1]) return NaN;
      return Math.abs(C.signedAngle(look, dirs[0]) - C.signedAngle(look, dirs[1]));
    };
    const p = dAt(C.add(V.eye, C.mul(right, 0.2))), m = dAt(C.add(V.eye, C.mul(right, -0.2)));
    if (!isFinite(p) && !isFinite(m)) return 0;
    if (!isFinite(m) || p < m) return 1;
    return -1;
  }

  // ---------------- 位置限制 ----------------
  function constrain(id, p) {
    const k = key(), b = block();
    const role = id === 'eye' ? 'eye' : pinDef(id).role;
    let q = v(clamp(p.x, -HW + 0.3, HW - 0.3), clamp(p.y, YB + 0.3, YT - 0.3));
    const pushOut = function (pt, r) { const L = C.len(pt); return L < r ? (L < 1e-6 ? v(0, -r) : C.mul(pt, r / L)) : pt; };
    if (k === 'rect') {
      const L = C.toLocal(b, q);
      if (role === 'inc') { if (L.y < 0.3) L.y = 0.3; }
      else { const lim = -st.t - (role === 'eye' ? 1.4 : 0.3); if (L.y > lim) L.y = lim; }
      q = C.toWorld(b, L);
    } else {
      const below = (k === 'semiF') === (role !== 'inc');
      if (below) {
        if (q.y > -0.3) q.y = -0.3;
        q = pushOut(q, R + (role === 'eye' ? 1.4 : 0.3));
      } else {
        if (q.y < (role === 'eye' ? 1.4 : 0.35)) q.y = role === 'eye' ? 1.4 : 0.35;
        q = pushOut(q, role === 'eye' ? 2.5 : 0.8);
      }
    }
    return v(clamp(q.x, -HW + 0.3, HW - 0.3), clamp(q.y, YB + 0.3, YT - 0.3));
  }
  function snapMark(p) {
    if (key() !== 'semiF') return p;
    for (let i = 0; i < MARKS.length; i++) if (C.len(C.sub(p, MARKS[i])) < SNAP) return v(MARKS[i].x, MARKS[i].y);
    return p;
  }
  function markOf(p) {
    for (let i = 0; i < MARKS.length; i++) if (p && C.len(C.sub(p, MARKS[i])) < 1e-6) return i + 1;
    return 0;
  }

  // ---------------- 量測（移走透明塊之後） ----------------
  function measureNow() {
    const b = block(), n = nNow(), c = cfg(), k = key();
    const sigA = st.err ? 0.25 : 0, sigL = st.err ? 0.02 : 0, r = st.rand;
    const base = { shape: st.shape, dir: st.shape === 'semi' ? st.dir : 'fwd', mat: st.mat, nAcc: n, err: st.err, res: st.res, t: st.t };
    if (k === 'rect') {
      const g = C.measureRect(b, c.pins.A, c.pins.B, c.pins.C, c.pins.D);
      if (!g.ok) return { ok: false, why: g.why };
      // 光若先碰到側面（側面全反射後才從下表面出來），畫出的 OO′ 就不是真正的光路
      const ir = C.incRay(b, c.pins.A, c.pins.B); // A、B 不限先後
      const tr = C.trace(b, n, ir.p, ir.u);
      if (tr.faces.length !== 2 || tr.faces[0] !== 'top' || tr.faces[1] !== 'bottom') return { ok: false, why: 'side' };
      const th1 = C.readAngle(g.th1 / DEG, st.res, sigA, r), th2 = C.readAngle(g.th2 / DEG, st.res, sigA, r);
      const th3 = C.readAngle(g.th3 / DEG, st.res, sigA, r), th4 = C.readAngle(g.th4 / DEG, st.res, sigA, r);
      const al = C.alignError(b, n, 'rect', c.pins);
      return Object.assign(base, {
        ok: true, g: g, side: g.side, th1: th1, th2: th2, th3: th3, th4: th4,
        s1: Math.sin(th1 * DEG), s2: Math.sin(th2 * DEG), nRow: Math.sin(th1 * DEG) / Math.sin(th2 * DEG),
        shift: C.readLength(g.shift, 0.01, sigL, r), shiftF: C.lateralShift(st.t, th1 * DEG, th2 * DEG),
        parallel: g.parallel / DEG, alignAng: al ? al.ang / DEG : NaN, alignOff: al ? al.off : NaN, mark: 0
      });
    }
    const g = C.measureSemi(b, c.pins.P, c.pins.P2, st.dir);
    if (!g.ok) return { ok: false, why: g.why };
    const th1 = C.readAngle(g.th1 / DEG, st.res, sigA, r), th2 = C.readAngle(g.th2 / DEG, st.res, sigA, r);
    const x1 = C.readLength(g.x1, 0.01, sigL, r), x2 = C.readLength(g.x2, 0.01, sigL, r);
    const al = C.alignError(b, n, 'semi', c.pins, st.dir);
    return Object.assign(base, {
      ok: true, g: g, side: g.side, th1: th1, th2: th2, x1: x1, x2: x2,
      s1: Math.sin(th1 * DEG), s2: Math.sin(th2 * DEG), nRow: Math.sin(th1 * DEG) / Math.sin(th2 * DEG), nRuler: x1 / x2,
      alignAng: al && isFinite(al.ang) ? al.ang / DEG : NaN, alignOff: al && isFinite(al.off) ? al.off : NaN,
      mark: st.dir === 'fwd' ? markOf(c.pins.P) : 0
    });
  }
  function rowSines(r) {
    if (r.shape === 'semi' && st.method === 'ruler') return [r.x2 / R, r.x1 / R];
    return [Math.sin(r.th2 * DEG), Math.sin(r.th1 * DEG)];
  }
  function groupStats(mat) {
    const rows = st.rows.filter(function (r) { return r.mat === mat; });
    const pick = function (list) {
      const xs = [], ys = [];
      list.forEach(function (r) { const p = rowSines(r); xs.push(p[0]); ys.push(p[1]); });
      return { xs: xs, ys: ys, fit: C.fitOrigin(xs, ys) };
    };
    const all = pick(rows), acc = nAcc(mat);
    const sub = function (f) { const p = pick(rows.filter(f)); return { N: p.xs.length, m: p.fit.m, pct: C.pctError(p.fit.m, acc) }; };
    const th1s = rows.map(function (r) { return r.th1; });
    const ns = rows.map(function (r) { const p = rowSines(r); return p[1] / p[0]; }).filter(isFinite);
    return {
      mat: mat, rows: rows, N: rows.length, xs: all.xs, ys: all.ys, fit: all.fit, line: C.fitLine(all.xs, all.ys),
      nAcc: acc, pct: C.pctError(all.fit.m, acc), revealed: mat !== 'unknown' || st.revealed,
      mean: ns.length ? ns.reduce(function (a, b) { return a + b; }, 0) / ns.length : NaN,
      left: sub(function (r) { return r.side < 0; }), right: sub(function (r) { return r.side > 0; }),
      rect: sub(function (r) { return r.shape === 'rect'; }), semi: sub(function (r) { return r.shape === 'semi'; }),
      th1Min: th1s.length ? Math.min.apply(null, th1s) : NaN, th1Max: th1s.length ? Math.max.apply(null, th1s) : NaN,
      marks: rows.filter(function (r) { return r.mark; }).map(function (r) { return r.mark; }),
      errAll: rows.length > 0 && rows.every(function (r) { return r.err; })
    };
  }

  // ---------------- 繪圖：紙上的線 ----------------
  function line(c, a, b, color, w, dash) {
    c.save(); c.strokeStyle = color; c.lineWidth = w || 1.2; c.lineCap = 'round';
    if (dash) c.setLineDash(dash);
    c.beginPath(); c.moveTo(X(a.x), Y(a.y)); c.lineTo(X(b.x), Y(b.y)); c.stroke(); c.restore();
  }
  function halo(c, text, x, y, color, align, base, px, weight) {
    D.haloText(c, text, x, y, color, align || 'left', base || 'middle', (weight || '600') + ' ' + (px || 12) + 'px ' + FONT);
  }
  function drawPaperMarks(c) {
    const k = key(), b = block();
    // L 線（沿方格線）與標籤
    line(c, v(-HW, 0), v(HW, 0), pencil(D.dark ? 0.55 : 0.5), 1.1);
    halo(c, 'L', X(-HW) + 6, Y(0) - 9, D.c.muted, 'left', 'middle', 12, 'italic 600');
    if (k === 'rect') {
      // L′：沿透明塊另一邊描出的線
      const a = C.toWorld(b, v(-G.rectW / 2 - 1.5, -st.t)), e = C.toWorld(b, v(G.rectW / 2 + 1.5, -st.t));
      line(c, a, e, pencil(D.dark ? 0.55 : 0.5), 1.1);
      halo(c, 'L′', X(a.x) - 4, Y(a.y) + 9, D.c.muted, 'right', 'middle', 12, 'italic 600');
    } else {
      // 法線 N、圓、記號點 P1–P5、圓心 O
      line(c, v(0, YT - 0.2), v(0, YB + 0.2), pencil(D.dark ? 0.45 : 0.4), 1);
      halo(c, 'N', X(0) + 6, Y(YT) + 10, D.c.muted, 'left', 'middle', 12, 'italic 600');
      c.save(); c.strokeStyle = pencil(D.dark ? 0.45 : 0.38); c.lineWidth = 1;
      c.beginPath(); c.arc(X(0), Y(0), R * s, 0, Math.PI * 2); c.stroke(); c.restore();
      if (k === 'semiF') {
        const pP = cfg().pins.P;
        MARKS.forEach(function (m, i) {
          const x = X(m.x), y = Y(m.y);
          if (pP && C.len(C.sub(pP, m)) < 1e-6) return; // P 插在這個記號點上：讓 P 的標籤說話
          c.save(); c.strokeStyle = pencil(0.7); c.lineWidth = 1.2;
          c.beginPath(); c.moveTo(x - 3, y - 3); c.lineTo(x + 3, y + 3); c.moveTo(x + 3, y - 3); c.lineTo(x - 3, y + 3); c.stroke(); c.restore();
          const u = C.unit(m);
          const lx = x + u.x * 15, ly = y - u.y * 15;
          const fM = 'italic 600 11px ' + FONT, fS = '600 8.5px ' + FONT;
          c.font = fM; const w1 = c.measureText('P').width;
          D.haloText(c, 'P', lx - (w1 + 5) / 2, ly, D.c.muted, 'left', 'middle', fM);
          D.haloText(c, String(i + 1), lx - (w1 + 5) / 2 + w1 + 0.5, ly + 3, D.c.muted, 'left', 'middle', fS);
        });
      }
    }
    // 以前做過的光路（淡淡的鉛筆線）
    st.traces.forEach(function (tr) {
      if (tr.key !== k) return;
      tr.segs.forEach(function (sg) { line(c, sg[0], sg[1], pencil(D.dark ? 0.32 : 0.28), 1); });
      tr.dots.forEach(function (p) { c.fillStyle = pencil(0.4); c.beginPath(); c.arc(X(p.x), Y(p.y), 1.6, 0, Math.PI * 2); c.fill(); });
    });
  }

  /** 透明塊（俯視）：半透明玻璃、邊緣較深、左上高光、柔和投影；水則是薄壁透明盒裝水 */
  function drawBlock(c, alpha) {
    if (alpha <= 0.01) return;
    const b = block();
    const pts = C.outline(b, 96).map(function (p) { return [X(p.x), Y(p.y)]; });
    const path = function () { c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.closePath(); };
    const tint = matColor(st.mat);
    const water = isWater();
    const bb = pts.reduce(function (a, p) { return [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])]; }, [1e9, 1e9, -1e9, -1e9]);
    c.save();
    c.globalAlpha = alpha;
    // 投影（光從左上方來）
    c.save();
    c.shadowColor = D.dark ? 'rgba(0,0,0,0.55)' : D.alpha(D.c.text, 0.3);
    c.shadowBlur = 14; c.shadowOffsetX = 4; c.shadowOffsetY = 6;
    path(); c.fillStyle = D.alpha(tint, D.dark ? 0.22 : 0.16); c.fill();
    c.restore();
    // 本體：斜向漸層
    const g = c.createLinearGradient(bb[0], bb[1], bb[2], bb[3]);
    g.addColorStop(0, D.alpha(D.shade(tint, 0.35), water ? 0.20 : 0.16));
    g.addColorStop(0.55, D.alpha(tint, water ? 0.24 : 0.20));
    g.addColorStop(1, D.alpha(D.shade(tint, -0.2), water ? 0.30 : 0.27));
    path(); c.fillStyle = g; c.fill();
    c.save(); path(); c.clip();
    // 厚玻璃的邊緣看起來較深（內側描邊）
    c.strokeStyle = D.alpha(D.shade(tint, -0.15), water ? 0.25 : 0.42);
    c.lineWidth = water ? 3 : 7; path(); c.stroke();
    // 斜向的反光帶
    const sx = bb[0] + (bb[2] - bb[0]) * 0.3;
    const sg = c.createLinearGradient(sx, bb[1], sx + (bb[2] - bb[0]) * 0.25, bb[1] + (bb[3] - bb[1]) * 0.6);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,' + (D.dark ? 0.07 : 0.22) + ')'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sg; c.fillRect(bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1]);
    // 左上邊緣的細高光
    c.translate(1.2, 1.2);
    c.strokeStyle = 'rgba(255,255,255,' + (D.dark ? 0.22 : 0.75) + ')'; c.lineWidth = 1.2; path(); c.stroke();
    c.restore();
    // 外框
    c.strokeStyle = water ? D.alpha(D.mix(D.c.muted, '#ffffff', D.dark ? 0.2 : 0.4), 0.9) : D.alpha(D.shade(tint, -0.35), 0.75);
    c.lineWidth = water ? 2.4 : 1.2; path(); c.stroke();
    if (water) { // 薄壁的內側線
      c.save(); path(); c.clip(); c.strokeStyle = D.alpha('#ffffff', D.dark ? 0.18 : 0.6); c.lineWidth = 1; c.translate(-1, -1); path(); c.stroke(); c.restore();
    }
    // 材料名稱
    const lp = st.shape === 'rect' ? C.toWorld(b, v(-G.rectW / 2 + 0.5, -st.t + 0.55)) : C.toWorld(b, v(0, -R * 0.66));
    halo(c, matName(st.mat) + (water ? T('（薄壁盒）', ' (thin-walled dish)') : ''), X(lp.x), Y(lp.y), D.alpha(D.shade(tint, D.dark ? 0.3 : -0.35), 0.95), st.shape === 'rect' ? 'left' : 'center', 'middle', 11, '600');
    c.restore();
  }

  // ---------------- 光束（提示用的真正光路） ----------------
  function beam(c, pts, a) {
    if (pts.length < 2 || a <= 0.01) return;
    const col = D.c.pos;
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    if (D.dark) c.globalCompositeOperation = 'lighter';
    [[10, 0.10], [5, 0.18]].forEach(function (gw) {
      c.strokeStyle = D.alpha(col, gw[1] * a); c.lineWidth = gw[0];
      c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(X(p.x), Y(p.y)); else c.moveTo(X(p.x), Y(p.y)); }); c.stroke();
    });
    c.restore();
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = D.alpha(col, 0.35 + 0.6 * a); c.lineWidth = 1.6;
    c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(X(p.x), Y(p.y)); else c.moveTo(X(p.x), Y(p.y)); }); c.stroke();
    c.restore();
  }
  function extend(p, u, L) { return C.add(p, C.mul(C.unit(u), L)); }
  function drawHint(c) {
    if (!st.hint || st.phase !== 'align') return;
    const b = block(), n = nNow(), k = key(), pn = cfg().pins;
    if (k === 'rect') {
      if (!pn.A || !pn.B) return;
      const ir = C.incRay(b, pn.A, pn.B);
      const tr = C.trace(b, n, ir.p, ir.u);
      if (tr.missed) { beam(c, [ir.p, extend(ir.p, ir.u, 40)], 0.8); return; }
      beam(c, tr.pts.concat([extend(tr.pOut, tr.uOut, 40)]), 0.9);
      if (tr.refl) beam(c, [tr.refl.p, extend(tr.refl.p, tr.refl.u, 8)], Math.sqrt(tr.refl.R) * 0.7);
      return;
    }
    if (!pn.P) return;
    const u = C.unit(C.sub(v(0, 0), pn.P));
    const nrm = C.toWorld(b, v(0, 1));
    if (k === 'semiF') {
      const r = C.refract(u, nrm, 1, n);
      beam(c, [pn.P, v(0, 0), C.mul(r.u, R), C.mul(r.u, 40)], 0.9);
      beam(c, [v(0, 0), extend(v(0, 0), C.sub(u, C.mul(nrm, 2 * C.dot(u, nrm))), 7)], Math.sqrt(1 - r.T) * 0.8);
    } else {
      const r = C.refract(u, nrm, n, 1);
      const refl = C.unit(C.sub(u, C.mul(nrm, 2 * C.dot(u, nrm))));
      beam(c, [pn.P, C.mul(u, -R), v(0, 0)], 0.9);
      beam(c, [v(0, 0), C.mul(refl, R), C.mul(refl, 40)], r.tir ? 0.9 : Math.sqrt(1 - r.T) * 0.85);
      if (!r.tir) beam(c, [v(0, 0), C.mul(r.u, 40)], Math.sqrt(r.T) * 0.9);
    }
  }

  // ---------------- 畫出的光路、法線、量角器（移走透明塊後） ----------------
  function arrowMid(c, a, b, color) {
    const ax = X(a.x), ay = Y(a.y), bx = X(b.x), by = Y(b.y);
    const L = Math.hypot(bx - ax, by - ay); if (L < 30) return;
    const ux = (bx - ax) / L, uy = (by - ay) / L, mx = ax + (bx - ax) * 0.55, my = ay + (by - ay) * 0.55, h = 6;
    c.save(); c.fillStyle = color; c.beginPath();
    c.moveTo(mx + ux * h, my + uy * h); c.lineTo(mx - ux * h - uy * h * 0.6, my - uy * h + ux * h * 0.6); c.lineTo(mx - ux * h + uy * h * 0.6, my - uy * h - ux * h * 0.6); c.closePath(); c.fill(); c.restore();
  }
  function arcAngle(c, O, a0, a1, rpx, color) {
    // 畫布角度（y 向下）：由 a0 掃到 a1，取較短的一邊
    let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    c.save();
    c.fillStyle = D.alpha(color, 0.14);
    c.beginPath(); c.moveTo(X(O.x), Y(O.y)); c.arc(X(O.x), Y(O.y), rpx, a0, a0 + d, d < 0); c.closePath(); c.fill();
    c.strokeStyle = color; c.lineWidth = 1.8;
    c.beginPath(); c.arc(X(O.x), Y(O.y), rpx, a0, a0 + d, d < 0); c.stroke();
    c.restore();
    return a0 + d / 2;
  }
  const cang = function (u) { return Math.atan2(-u.y, u.x); }; // 世界方向 → 畫布角度
  function protractor(c, O, rpx) {
    const ox = X(O.x), oy = Y(O.y);
    c.save();
    c.fillStyle = D.alpha(D.c.surface, D.dark ? 0.18 : 0.35);
    c.strokeStyle = D.alpha(D.c.field, D.dark ? 0.5 : 0.45); c.lineWidth = 1;
    c.beginPath(); c.arc(ox, oy, rpx, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.arc(ox, oy, rpx * 0.62, 0, Math.PI * 2); c.strokeStyle = D.alpha(D.c.field, 0.18); c.stroke();
    for (let d = 0; d < 360; d++) {
      const a = d * DEG - Math.PI / 2;            // 0° 在法線（上方）
      const big = d % 10 === 0, mid = d % 5 === 0;
      if (!mid && rpx < 70) continue;
      const r0 = rpx - (big ? 9 : mid ? 6 : 3.5);
      c.strokeStyle = D.alpha(D.c.field, big ? 0.6 : mid ? 0.42 : 0.28);
      c.lineWidth = big ? 1.1 : 0.8;
      c.beginPath(); c.moveTo(ox + Math.cos(a) * r0, oy + Math.sin(a) * r0); c.lineTo(ox + Math.cos(a) * rpx, oy + Math.sin(a) * rpx); c.stroke();
    }
    c.font = '9.5px ' + FONT; c.fillStyle = D.alpha(D.c.muted, 0.95); c.textAlign = 'center'; c.textBaseline = 'middle';
    [30, 60, 90].forEach(function (d) {
      [[1, -1], [-1, -1], [1, 1], [-1, 1]].forEach(function (q) {
        if (d === 90 && q[1] > 0) return;
        const r = rpx - 17;
        c.fillText(String(d), ox + q[0] * Math.sin(d * DEG) * r, oy + q[1] * Math.cos(d * DEG) * r);
      });
    });
    c.restore();
  }
  function drawConstruction(c, a) {
    const m = st.meas;
    if (!m || !m.ok || a <= 0.01) return;
    const k = key(), pn = cfg().pins, b = block();
    const ray = D.alpha(D.c.pos, 0.95), nCol = D.alpha(D.c.muted, 0.9);
    c.save(); c.globalAlpha = a;
    const rp = clamp(3.3 * s, 52, 84);
    if (k === 'rect') {
      const g = m.g, O = g.O, O2 = g.O2;
      const far = C.len(C.sub(pn.D, O2)) > C.len(C.sub(pn.C, O2)) ? pn.D : pn.C;
      const farA = C.len(C.sub(pn.A, O)) > C.len(C.sub(pn.B, O)) ? pn.A : pn.B;
      // 法線（O 與 O′）
      line(c, v(O.x, O.y + 4.2), v(O.x, O.y - st.t - 1.2), nCol, 1.1, [5, 4]);
      const n2 = C.toWorld(b, v(0, 1));
      line(c, C.add(O2, C.mul(n2, 1.6)), C.sub(O2, C.mul(n2, 2.2)), D.alpha(D.c.muted, 0.7), 1, [4, 4]);
      halo(c, 'N', X(O.x) + 5, Y(O.y + 4.2) + 2, D.c.muted, 'left', 'middle', 12, 'italic 600');
      if (st.prot) protractor(c, O, rp);
      // 入射線延長（虛線）與側向位移
      const uAB = C.unit(C.sub(O, farA)); // 入射方向（A、B 不限先後）
      const foot = C.add(pn.A, C.mul(uAB, C.dot(C.sub(O2, pn.A), uAB)));
      line(c, O, extend(foot, uAB, 1.2), D.alpha(D.c.pos, 0.45), 1.2, [6, 5]);
      // 光路：AB→O、OO′、O′→CD
      line(c, farA, O, ray, 1.8); line(c, O, O2, ray, 1.8); line(c, O2, far, ray, 1.8);
      arrowMid(c, farA, O, ray); arrowMid(c, O, O2, ray); arrowMid(c, O2, far, ray);
      // 角度
      if (st.prot) {
        const up = -Math.PI / 2, dn = Math.PI / 2;
        const m1 = arcAngle(c, O, up, cang(C.sub(farA, O)), rp * 0.5, D.c.equi);
        const m2 = arcAngle(c, O, dn, cang(C.sub(O2, O)), rp * 0.4, D.c.accent);
        const l1 = rp * 0.5 + 16, l2 = rp * 0.4 + 16;
        const p1x = X(O.x) + Math.cos(m1) * l1, p1y = Y(O.y) + Math.sin(m1) * l1;
        richPill(c, theta('1', ' = ' + fA(m.th1)), p1x, p1y - 2, D.c.equi, m.side < 0 ? 'right' : 'left');
        const p2x = X(O.x) + Math.cos(m2) * l2, p2y = Y(O.y) + Math.sin(m2) * l2;
        richPill(c, theta('2', ' = ' + fA(m.th2)), p2x, p2y + 18, D.c.accent, m.side < 0 ? 'left' : 'right');
      }
      // 側向位移標示
      if (C.len(C.sub(foot, O2)) > 0.25) {
        const fx = X(foot.x), fy = Y(foot.y), qx = X(O2.x), qy = Y(O2.y);
        c.save(); c.strokeStyle = D.alpha(D.c.text, 0.75); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(fx, fy); c.lineTo(qx, qy); c.stroke();
        const ux = (qx - fx), uy = (qy - fy), L = Math.hypot(ux, uy) || 1, nx = -uy / L * 4, ny = ux / L * 4;
        c.beginPath(); c.moveTo(fx - nx, fy - ny); c.lineTo(fx + nx, fy + ny); c.moveTo(qx - nx, qy - ny); c.lineTo(qx + nx, qy + ny); c.stroke();
        c.restore();
        // 標籤放在垂足外側（透明塊原來的位置，那裡沒有其他線）
        const ex = fx + (fx - qx) / L * 8, ey = fy + (fy - qy) / L * 8;
        richPill(c, [['d', ''], [' = ' + fcm(m.shift), '']], ex, ey + 9, D.c.text, fx >= qx ? 'left' : 'right', 11.5);
      }
      // O 的標籤放在沒有光線經過的一角（入射光的對側、透明塊裡）
      halo(c, 'O', X(O.x) + (m.side < 0 ? -8 : 8), Y(O.y) + 13, D.c.text, m.side < 0 ? 'right' : 'left', 'middle', 13, 'italic 700');
      halo(c, 'O′', X(O2.x) + (m.side < 0 ? -7 : 7), Y(O2.y) + 11, D.c.text, m.side < 0 ? 'right' : 'left', 'middle', 13, 'italic 700');
    } else {
      const O = v(0, 0), air = k === 'semiR' ? pn.P2 : pn.P, med = k === 'semiR' ? pn.P : pn.P2;
      const I1 = C.mul(C.unit(air), R), I2 = C.mul(C.unit(med), R);
      if (st.prot) protractor(c, O, rp);
      // 光路與它們和圓的交點
      const far1 = C.len(air) > R ? air : I1, far2 = C.len(med) > R ? med : I2;
      if (k === 'semiF') { line(c, far1, O, ray, 1.8); line(c, O, far2, ray, 1.8); arrowMid(c, far1, O, ray); arrowMid(c, O, far2, ray); }
      else { line(c, far2, O, ray, 1.8); line(c, O, far1, ray, 1.8); arrowMid(c, far2, O, ray); arrowMid(c, O, far1, ray); }
      // x1、x2：交點到法線的距離
      const dim = function (I, lab, val2, below) {
        const yy = Y(I.y), x0 = X(0), x1 = X(I.x);
        c.save(); c.strokeStyle = D.alpha(D.c.text, 0.8); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(x0, yy); c.lineTo(x1, yy); c.stroke();
        c.beginPath(); c.moveTo(x0, yy - 4); c.lineTo(x0, yy + 4); c.moveTo(x1, yy - 4); c.lineTo(x1, yy + 4); c.stroke();
        c.fillStyle = D.c.text; c.beginPath(); c.arc(x1, yy, 2.6, 0, Math.PI * 2); c.fill();
        c.restore();
        // 標籤放在法線另一側（那裡沒有光路），與這條線同高
        const lft = I.x < 0;
        richPill(c, [['x', ''], [lab, 'sub'], [' = ' + fcm(val2), '']], lft ? x0 + 7 : x0 - 7, yy + 9, D.c.text, lft ? 'left' : 'right', 11.5);
        void below;
      };
      dim(I1, '1', m.x1, false); dim(I2, '2', m.x2, true);
      if (st.prot) {
        const m1 = arcAngle(c, O, -Math.PI / 2, cang(air), rp * 0.5, D.c.equi);
        const m2 = arcAngle(c, O, Math.PI / 2, cang(med), rp * 0.4, D.c.accent);
        const l1 = rp * 0.5 + 16, l2 = rp * 0.4 + 16;
        richPill(c, theta('1', ' = ' + fA(m.th1)), X(0) + Math.cos(m1) * l1, Y(0) + Math.sin(m1) * l1 - 2, D.c.equi, air.x < 0 ? 'right' : 'left');
        richPill(c, theta('2', ' = ' + fA(m.th2)), X(0) + Math.cos(m2) * l2, Y(0) + Math.sin(m2) * l2 + 18, D.c.accent, med.x < 0 ? 'right' : 'left');
      }
    }
    c.restore();
  }

  // ---------------- 針、眼睛、針插 ----------------
  function headR() { return clamp(0.26 * s, 5, 6.5); }
  function drawPinTop(c, p, color, label, opts) {
    opts = opts || {};
    const x = X(p.x), y = Y(p.y), r = headR() * (opts.hover ? 1.08 : 1);
    // 針的影子：光從左上方照下來，直立的針在紙上投下往右下的細影
    const Ls = G.pinHeight * 0.38 * s;
    const sg = c.createLinearGradient(x, y, x + Ls * 0.8, y + Ls * 0.6);
    sg.addColorStop(0, D.shadowInk(D.dark ? 0.55 : 0.3)); sg.addColorStop(1, D.shadowInk(0));
    c.save(); c.strokeStyle = sg; c.lineWidth = 1.6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Ls * 0.8, y + Ls * 0.6); c.stroke(); c.restore();
    D.contactShadow(c, x + Ls * 0.8, y + Ls * 0.6, r * 0.9, 0.5);
    if (opts.sel) {
      const g = c.createRadialGradient(x, y, r, x, y, r + 11);
      g.addColorStop(0, D.alpha(D.c.accent, 0.45)); g.addColorStop(1, D.alpha(D.c.accent, 0));
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r + 11, 0, Math.PI * 2); c.fill();
      c.strokeStyle = D.c.accent; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, r + 4, 0, Math.PI * 2); c.stroke();
    }
    D.ball(c, x, y, r, color);
    if (label) {
      const pos = opts.labelPos || 'right';
      if (pos === 'up') D.pill(c, label, x, y - r - 5, color, 'center', '700 12px ' + FONT);
      else D.pill(c, label, pos === 'right' ? x + r + 4 : x - r - 4, y - r + 3, color, pos === 'right' ? 'left' : 'right', '700 12px ' + FONT);
    }
  }
  function drawEye(c, E, look, opts) {
    const x = X(E.x), y = Y(E.y), ang = Math.atan2(-look.y, look.x);
    const k = opts.hover ? 1.08 : 1;
    // 視野範圍（淡淡的扇形）
    const half = (st.zoom === 'zoom' ? 3 : 12) * DEG;
    const reach = Math.min(C.len(C.sub(views().tgt, E)) * s + 30, 900);
    const fg = c.createRadialGradient(x, y, 0, x, y, reach);
    fg.addColorStop(0, D.alpha(D.c.accent, D.dark ? 0.16 : 0.12)); fg.addColorStop(1, D.alpha(D.c.accent, 0));
    c.save(); c.fillStyle = fg; c.beginPath(); c.moveTo(x, y); c.arc(x, y, reach, ang - half, ang + half); c.closePath(); c.fill(); c.restore();
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(k, k);
    if (opts.sel) {
      const g = c.createRadialGradient(0, 0, 10, 0, 0, 30);
      g.addColorStop(0, D.alpha(D.c.accent, 0.4)); g.addColorStop(1, D.alpha(D.c.accent, 0));
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 30, 0, Math.PI * 2); c.fill();
    }
    c.shadowColor = D.dark ? 'rgba(0,0,0,0.6)' : D.alpha(D.c.text, 0.3); c.shadowBlur = 6; c.shadowOffsetY = 2;
    // 側面看的眼睛：眼白（杏仁形）＋朝向視線方向的虹膜
    c.beginPath(); c.moveTo(-15, 0); c.quadraticCurveTo(-2, -13, 12, -2); c.quadraticCurveTo(15, 0, 12, 2); c.quadraticCurveTo(-2, 13, -15, 0); c.closePath();
    c.fillStyle = D.dark ? '#e8eef0' : '#ffffff'; c.fill();
    c.shadowColor = 'transparent';
    c.strokeStyle = D.c.text; c.lineWidth = 1.6; c.stroke();
    const ig = c.createRadialGradient(5, -1.5, 0.5, 6, 0, 6.5);
    ig.addColorStop(0, D.shade(D.c.accent, 0.4)); ig.addColorStop(1, D.shade(D.c.accent, -0.25));
    c.fillStyle = ig; c.beginPath(); c.arc(6, 0, 6, -Math.PI / 2 - 0.9, Math.PI / 2 + 0.9); c.fill();
    c.fillStyle = '#10181b'; c.beginPath(); c.arc(8, 0, 2.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(6.6, -1.6, 1, 0, Math.PI * 2); c.fill();
    c.restore();
    if (opts.sel || opts.hover) {
      const lx = x - Math.cos(ang) * 24, ly = y + Math.sin(ang) * 24;
      D.pill(c, T('眼睛', 'Eye'), lx, ly + 8, D.c.accent, 'center', '600 11px ' + FONT);
    }
  }
  function trayList() {
    const c = cfg();
    return pinDefs().filter(function (pd) { return pd.role !== 'fix' && !c.pins[pd.id]; }).map(function (pd, i) {
      return { id: pd.id, pd: pd, x: W - M - 60 - i * 38, y: TB / 2 + 2 };
    });
  }
  function tp0y() { return TB / 2 + 8; }
  function drawTop(c) {
    // 針插（番茄造型的布針插）與還沒插的針
    const cx = W - M - 22, cy = TB / 2 + 6, rr = 15;
    c.save();
    c.shadowColor = D.dark ? 'rgba(0,0,0,0.6)' : 'rgba(60,30,10,0.35)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
    const tg = c.createRadialGradient(cx - 5, cy - 6, 2, cx, cy, rr);
    const red = D.mix(D.c.pos, '#c0392b', 0.4);
    tg.addColorStop(0, D.shade(red, 0.4)); tg.addColorStop(0.6, red); tg.addColorStop(1, D.shade(red, -0.35));
    c.fillStyle = tg; c.beginPath(); c.ellipse(cx, cy, rr, rr * 0.82, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    c.strokeStyle = D.alpha(D.shade(red, -0.45), 0.6); c.lineWidth = 1;
    [-0.5, 0, 0.5].forEach(function (k) { c.beginPath(); c.ellipse(cx + k * rr * 0.9, cy, rr * (1 - Math.abs(k)) * 0.55 + 1, rr * 0.8, 0, 0, Math.PI * 2); c.stroke(); });
    c.fillStyle = D.mix(D.c.probe, '#2e7d32', 0.5);
    c.beginPath(); c.ellipse(cx, cy - rr * 0.78, 6, 2.6, 0, 0, Math.PI * 2); c.fill();
    // 插在針插上當裝飾的針（不是可拖的針）
    [[-9, -9, D.c.equi], [7, -11, D.c.probe], [10, 2, EXTRA['b-optics']]].forEach(function (q) {
      c.strokeStyle = D.alpha(D.c.muted, 0.9); c.lineWidth = 1; c.beginPath(); c.moveTo(cx + q[0] * 0.5, cy + q[1] * 0.3); c.lineTo(cx + q[0], cy + q[1]); c.stroke();
      D.ball(c, cx + q[0], cy + q[1], 2.6, q[2], { shadow: false });
    });
    const tl = trayList();
    tl.forEach(function (tp) {
      const col = roleColor(tp.pd.role);
      if (st.hover === 'tray:' + tp.id) {
        const g = c.createRadialGradient(tp.x, tp.y, 5, tp.x, tp.y, 20);
        g.addColorStop(0, D.alpha(D.c.accent, 0.35)); g.addColorStop(1, D.alpha(D.c.accent, 0));
        c.fillStyle = g; c.beginPath(); c.arc(tp.x, tp.y, 20, 0, Math.PI * 2); c.fill();
      }
      // 直立插在軟木上的大頭針：金屬針身＋圓頭
      const hy = tp.y - 8, sg = c.createLinearGradient(tp.x - 1.2, 0, tp.x + 1.2, 0);
      sg.addColorStop(0, D.shade(D.c.muted, 0.6)); sg.addColorStop(0.5, D.c.muted); sg.addColorStop(1, D.shade(D.c.muted, -0.4));
      c.fillStyle = sg; c.fillRect(tp.x - 1.1, hy, 2.2, 22);
      D.contactShadow(c, tp.x + 2, hy + 22, 4, 0);
      D.ball(c, tp.x, hy, headR(), col);
      halo(c, tp.pd.lab, tp.x - headR() - 4, tp.y + 6, col, 'right', 'middle', 12, '700');
    });
    if (tl.length && st.phase === 'align') {
      const x0 = tl[tl.length - 1].x - headR() - 22;
      if (x0 > 170) halo(c, T('拖出 →', 'drag out →'), x0, tp0y(), D.c.muted, 'right', 'middle', 11, '600');
    }
    // 左上：材料與折射率
    const nm = matName(st.mat) + '  n = ' + (st.mat === 'unknown' && !st.revealed ? '?' : nAcc(st.mat).toFixed(st.mat === 'water' || st.mat === 'unknown' ? 3 : 2));
    D.pill(c, nm, M + 2, TB / 2 + 13, matColor(st.mat), 'left', '600 12px ' + FONT);
    // 左下：方格大小
    halo(c, T('方格 1 cm', 'grid 1 cm'), M + 6, H - M - 9, D.c.muted, 'left', 'middle', 11, '600');
  }

  function drawMain() {
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.drawImage(buildStatic(), 0, 0, W, H);
    c.save(); c.beginPath(); c.rect(M, TB + M, W - 2 * M, H - TB - 2 * M); c.clip();
    drawPaperMarks(c);
    drawBlock(c, st.fade);
    drawConstruction(c, 1 - st.fade);
    drawHint(c);
    const V = views();
    drawEye(c, V.eye, V.look, { sel: st.sel === 'eye', hover: st.hover === 'eye' });
    const k = key();
    pinDefs().forEach(function (pd) {
      const p = pinPos(pd.id);
      if (!p) return;
      const labelPos = k === 'rect' ? 'right' : pd.id === 'O' ? 'left' : (k === 'semiF' && pd.id === 'P') ? 'up' : p.x < 0 ? 'left' : 'right';
      drawPinTop(c, p, roleColor(pd.role), pd.lab, { sel: st.sel === pd.id, hover: st.hover === pd.id, labelPos: labelPos });
    });
    if (st.flash > 0) {
      const p = st.flashAt;
      if (p) D.ripple(c, X(p.x), Y(p.y), 10, 1 - st.flash, D.c.probe);
    }
    c.restore();
    drawTop(c);
    drawKbFocus(c);
  }
  /** 鍵盤焦點框：俯視圖上被選取的眼睛、針，或還在針插上的針 */
  function drawKbFocus(c) {
    if (!kb || !kb.focused()) return;
    const it = kbItems[kb.index()];
    if (!it) return;
    let b = null;
    if (it.id === 'eye') { const e = cfg().eye; b = [X(e.x) - 22, Y(e.y) - 22, 44, 44]; }
    else if (cfg().pins[it.id]) { const p = cfg().pins[it.id], r = headR() + 9; b = [X(p.x) - r, Y(p.y) - r, 2 * r, 2 * r]; }
    else {
      const tp = trayList().filter(function (q) { return q.id === it.id; })[0];
      if (tp) { const hy = tp.y - 8; b = [tp.x - 13, hy - headR() - 4, 26, headR() + 30]; }
    }
    if (!b) return;
    c.save(); c.setLineDash([5, 4]); c.strokeStyle = D.c.accent; c.lineWidth = 2;
    D.roundRect(c, b[0], b[1], b[2], b[3], 6); c.stroke(); c.restore();
  }

  // ---------------- 眼睛看到的景象 ----------------
  const vc = $('view'), vctx = vc.getContext('2d');
  let VWd = 0, VHd = 0, vdpr = 1;
  function layoutView() {
    VWd = vc.clientWidth || 360; VHd = vc.clientHeight || 170;
    vdpr = Math.min(2.5, window.devicePixelRatio || 1);
    vc.width = Math.round(VWd * vdpr); vc.height = Math.round(VHd * vdpr);
  }
  function kdeg() { return (VWd / 2 - 14) / (st.zoom === 'zoom' ? 3 : 12); }
  function drawView() {
    const c = vctx, Wv = VWd, Hv = VHd;
    c.setTransform(vdpr, 0, 0, vdpr, 0, 0);
    c.clearRect(0, 0, Wv, Hv);
    const V = views(), k = kdeg(), cx = Wv / 2, yh = Hv * 0.56, Fv = Hv * 2.2, ze = G.eyeHeight;
    const xOf = function (dir) { return cx - C.signedAngle(V.look, dir) / DEG * k; };
    // 背景：上方是牆、下方是紙面（透視的方格線）
    const bg = c.createLinearGradient(0, 0, 0, yh);
    bg.addColorStop(0, D.shade(D.c['canvas-bg'], D.dark ? 0.05 : -0.05)); bg.addColorStop(1, D.c['canvas-bg']);
    c.fillStyle = bg; c.fillRect(0, 0, Wv, yh);
    c.fillStyle = paperColor(); c.fillRect(0, yh, Wv, Hv - yh);
    c.lineWidth = 1;
    for (let d = 2; d < 80; d += 1) {
      const y = yh + Fv * ze / d;
      if (y > Hv) continue;
      const a = (D.dark ? 0.2 : 0.16) * clamp((y - yh) / 45, 0, 1);
      if (a < 0.015) break;
      c.strokeStyle = D.alpha(D.c.neg, a);
      c.beginPath(); c.moveTo(0, Math.round(y) + 0.5); c.lineTo(Wv, Math.round(y) + 0.5); c.stroke();
    }
    const hz = c.createLinearGradient(0, yh - 6, 0, yh + 8);
    hz.addColorStop(0, 'rgba(0,0,0,0)'); hz.addColorStop(1, D.dark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.06)');
    c.fillStyle = hz; c.fillRect(0, yh - 6, Wv, 14);
    // 透明塊（從側面看）：視角範圍、遠端上緣、近端上緣
    let yF = null;
    const hb = isWater() ? G.waterDepth : G.blockHeight;
    if (V.b) {
      const outl = C.outline(V.b, 48);
      let a0 = Infinity, a1 = -Infinity, dN = Infinity, dF = -Infinity;
      outl.forEach(function (p) {
        const d = C.sub(p, V.eye), x = xOf(C.unit(d)), pr = C.dot(d, V.look);
        a0 = Math.min(a0, x); a1 = Math.max(a1, x); dN = Math.min(dN, pr); dF = Math.max(dF, pr);
      });
      dN = Math.max(dN, 1); dF = Math.max(dF, dN + 0.5);
      if (st.shape === 'semi' && key() === 'semiF') dF = Math.max(dN + 0.5, C.dot(C.sub(v(0, 0), V.eye), V.look));
      yF = yh - Fv * (hb - ze) / dF;
      const yN = yh - Fv * (hb - ze) / dN;
      const xl = clamp(a0, -10, Wv + 10), xr = clamp(a1, -10, Wv + 10);
      const tint = matColor(st.mat);
      if (xr > xl) {
        // 頂面（透過頂面看到的帶狀區）
        c.fillStyle = D.alpha(tint, D.dark ? 0.16 : 0.12); c.fillRect(xl, yN, xr - xl, yF - yN);
        // 透過透明塊看的窗口
        const gg = c.createLinearGradient(0, yF, 0, Hv);
        gg.addColorStop(0, D.alpha(tint, D.dark ? 0.2 : 0.16)); gg.addColorStop(1, D.alpha(tint, D.dark ? 0.3 : 0.24));
        c.fillStyle = gg; c.fillRect(xl, yF, xr - xl, Hv - yF);
        c.strokeStyle = D.alpha(D.shade(tint, D.dark ? 0.3 : -0.2), 0.65); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(xl, yF + 0.5); c.lineTo(xr, yF + 0.5); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,' + (D.dark ? 0.25 : 0.7) + ')'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(xl, yN + 0.5); c.lineTo(xr, yN + 0.5); c.stroke();
        c.strokeStyle = D.alpha(D.shade(tint, -0.2), 0.5);
        [xl, xr].forEach(function (x) { if (x > 0 && x < Wv) { c.beginPath(); c.moveTo(x, yN); c.lineTo(x, Hv); c.stroke(); } });
        if (isWater()) { // 水面以上是盒子的薄壁
          const yTop = yh - Fv * (3 - ze) / dN;
          c.strokeStyle = D.alpha(D.c.muted, 0.35); c.setLineDash([3, 3]);
          c.strokeRect(xl, Math.max(2, yTop), xr - xl, yN - Math.max(2, yTop)); c.setLineDash([]);
        }
      }
    }
    // 透明塊的上緣：上面是直接看到的針、下面是透過透明塊看到的像
    if (yF !== null && yF > 52 && yF < Hv - 30) {
      halo(c, T('↑ 直接看到', '↑ seen directly'), Wv - 8, yF - 9, D.c.muted, 'right', 'middle', 10.5, '600');
      halo(c, T('↓ 透過透明塊', '↓ through the block'), Wv - 8, yF + 10, D.c.muted, 'right', 'middle', 10.5, '600');
    }
    // 針：由遠到近畫
    const shaft = D.mix(D.c.muted, D.c.text, 0.35);
    const list = V.list.slice().sort(function (a, b) { return b.dist - a.dist; });
    const labels = [];
    list.forEach(function (e) {
      const col = roleColor(e.pd.role);
      const xU = xOf(e.vw.upper);
      const wpx = Math.max(1.6, (G.pinShaft / e.dist) / DEG * k);
      const yBase = yh + Fv * ze / e.dist, yTop = yh - Fv * (G.pinHeight - ze) / e.dist;
      const through = !e.vw.lower.direct && yF !== null;
      const ySplit = through ? Math.max(yF, yTop + 4) : yTop;
      const blur = clamp((7 - e.dist) / 3, 0, 1.4); // 離眼睛很近的針會失焦
      const seg = function (x, y0, y1, a, tintCol) {
        if (y1 <= y0) return;
        if (blur > 0.05) { // 失焦：兩側加一層淡淡的暈
          c.fillStyle = D.alpha(shaft, 0.18 * a);
          c.fillRect(x - wpx / 2 - blur * 2, y0, wpx + blur * 4, y1 - y0);
        }
        const g = c.createLinearGradient(x - wpx / 2, 0, x + wpx / 2, 0);
        const base = tintCol ? D.mix(shaft, tintCol, 0.3) : shaft;
        g.addColorStop(0, D.alpha(D.shade(base, 0.55), a)); g.addColorStop(0.4, D.alpha(base, a)); g.addColorStop(1, D.alpha(D.shade(base, -0.4), a));
        c.fillStyle = g; c.fillRect(x - wpx / 2, y0, wpx, y1 - y0);
      };
      if (through) {
        if (e.vw.lower.ok) {
          const xL = xOf(e.vw.lower.dir);
          seg(xL, ySplit, Math.min(Hv, yBase), 0.35 + 0.65 * Math.sqrt(e.vw.lower.T), matColor(st.mat));
          labels.push({ x: xL, lab: e.pd.lab, col: col, id: e.id });
        } else labels.push({ x: xU, lab: e.pd.lab, col: col, id: e.id, hidden: true });
        seg(xU, Math.max(-2, yTop), ySplit, 1);
      } else {
        seg(xU, Math.max(-2, yTop), Math.min(Hv, yBase), 1);
        labels.push({ x: xU, lab: e.pd.lab, col: col, id: e.id });
      }
      const rh = clamp(Fv * (G.pinHead / 2) / e.dist * 1.3, 3, 10);
      if (yTop > -rh) D.ball(c, xU, yTop, rh, col, { shadow: false });
    });
    // 鍵盤焦點框：選取的針的像；選眼睛或針還在針插上時框住整個景象
    if (vkb && vkb.focused()) {
      const it = vkbItems[vkb.index()];
      const lb = it ? labels.filter(function (l) { return l.id === it.id; })[0] : null;
      c.save(); c.setLineDash([5, 4]); c.strokeStyle = D.c.accent; c.lineWidth = 2;
      if (lb && lb.x > 0 && lb.x < Wv) D.roundRect(c, lb.x - 11, 4, 22, Hv - 26, 6);
      else D.roundRect(c, 3, 3, Wv - 6, Hv - 6, 8);
      c.stroke(); c.restore();
    }
    // 中央的視線方向記號
    c.fillStyle = D.alpha(D.c.muted, 0.8);
    c.beginPath(); c.moveTo(cx - 5, 0); c.lineTo(cx + 5, 0); c.lineTo(cx, 6); c.closePath(); c.fill();
    // 下方的標籤：靠得很近的合併成一個
    labels.sort(function (a, b) { return a.x - b.x; });
    const groups = [];
    labels.forEach(function (l) {
      const g = groups[groups.length - 1];
      if (g && Math.abs(l.x - g.x1) < 16 && !l.hidden && !g.hidden) { g.items.push(l); g.x1 = l.x; }
      else groups.push({ items: [l], x0: l.x, x1: l.x, hidden: l.hidden });
    });
    groups.forEach(function (g) {
      const xm = (g.x0 + g.x1) / 2;
      const text = g.items.map(function (l) { return l.lab; }).join(' ') + (g.hidden ? T('（看不到像）', ' (no image)') : '');
      const col = g.items.length > 1 ? D.c.probe : g.items[0].col;
      if (xm < 4 || xm > Wv - 4) {
        const left = xm < 4;
        const ax = left ? 10 : Wv - 10;
        c.fillStyle = col; c.beginPath();
        if (left) { c.moveTo(4, Hv - 14); c.lineTo(12, Hv - 20); c.lineTo(12, Hv - 8); }
        else { c.moveTo(Wv - 4, Hv - 14); c.lineTo(Wv - 12, Hv - 20); c.lineTo(Wv - 12, Hv - 8); }
        c.closePath(); c.fill();
        D.pill(c, text, left ? ax + 6 : ax - 6, Hv - 26, col, left ? 'left' : 'right', '700 11px ' + FONT);
      } else D.pill(c, text, clamp(xm, 20, Wv - 20), Hv - 4, col, 'center', '700 11px ' + FONT);
    });
    // 左上：對準情形
    const ai = st.phase === 'align' ? alignInfo() : null;
    let msg, mc = D.c.text;
    if (!ai) { msg = T('已移走透明塊：針不再排成一直線', 'Block removed: the pins no longer line up'); mc = D.c.muted; }
    else if (ai.allOK) { msg = st.shape === 'rect' ? T('✓ 四針的像重疊', '✓ All four pins line up') : T('✓ 三針的像重疊', '✓ All three pins line up'); mc = D.c.probe; }
    else if (!ai.visA || !ai.visB) { msg = T('看不到入射側的針透過透明塊的像', 'Cannot see the far pin through the block'); mc = D.c.pos; }
    else {
      const ii = incIds().map(function (id) { return pinDef(id).lab; });
      msg = and2(ii[0], ii[1]) + T(' 的像相差 ', ' images differ by ') + Math.abs(ai.dAB / DEG).toFixed(2) + '°';
      if (ai.abOK) { msg = and2(ii[0], ii[1]) + T(' 的像重疊 ✓', ' images overlap ✓'); mc = D.c.probe; }
    }
    D.pill(c, msg, 6, 24, mc, 'left', '600 12px ' + FONT);
    // 右上：角度比例尺
    const bar = k * (st.zoom === 'zoom' ? 0.5 : 2), lab = st.zoom === 'zoom' ? '0.5°' : '2°';
    const bx1 = Wv - 10, bx0 = bx1 - bar, byy = 36;
    c.strokeStyle = D.c.muted; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(bx0, byy); c.lineTo(bx1, byy); c.moveTo(bx0, byy - 4); c.lineTo(bx0, byy + 4); c.moveTo(bx1, byy - 4); c.lineTo(bx1, byy + 4); c.stroke();
    halo(c, lab, (bx0 + bx1) / 2, byy - 9, D.c.muted, 'center', 'middle', 11, '600');
  }

  // ---------------- sin θ1–sin θ2 圖 ----------------
  const gc = $('graph'), gctx = gc.getContext('2d');
  let GW = 0, GH = 0, gdpr = 1;
  function layoutGraph() {
    GW = gc.clientWidth || 360; GH = gc.clientHeight || 300;
    gdpr = Math.min(2.5, window.devicePixelRatio || 1);
    gc.width = Math.round(GW * gdpr); gc.height = Math.round(GH * gdpr);
  }
  function graphAria() {
    const gs = groupStats(st.mat);
    let t = T('sin θ1 對 sin θ2 圖（', 'Graph of sin θ1 against sin θ2 (') + matName(st.mat) + T('）：', '): ') + gs.N + T(' 筆數據', ' rows');
    if (gs.N && isFinite(gs.fit.m)) t += T('，過原點最佳直線的斜率 n = ', '; slope of the best line through the origin n = ') + gs.fit.m.toFixed(3);
    if (gs.revealed) t += T('；公認值 ', '; accepted value ') + gs.nAcc.toFixed(3);
    gc.setAttribute('aria-label', t + T('。', '.'));
  }
  function drawGraph() {
    graphAria();
    const c = gctx;
    c.setTransform(gdpr, 0, 0, gdpr, 0, 0);
    c.clearRect(0, 0, GW, GH);
    D.backdrop(c, GW, GH);
    const L = 50, Rr = 16, Tp = 14, Bt = 42;
    const pw = GW - L - Rr, ph = GH - Tp - Bt;
    const gx = function (x) { return L + x * pw; }, gy = function (y) { return Tp + (1 - y) * ph; };
    // 格線：每 0.1 一條次格線、每 0.2 一條主格線（x、y 各自的刻度）
    c.lineWidth = 1 / gdpr;
    for (let i = 1; i <= 10; i++) {
      const major = i % 2 === 0, sx = Math.round(gx(i / 10) * gdpr) / gdpr + 0.5 / gdpr, sy = Math.round(gy(i / 10) * gdpr) / gdpr + 0.5 / gdpr;
      c.strokeStyle = D.alpha(D.c.text, major ? (D.dark ? 0.11 : 0.1) : (D.dark ? 0.05 : 0.04));
      c.beginPath(); c.moveTo(sx, Tp); c.lineTo(sx, Tp + ph); c.moveTo(L, sy); c.lineTo(L + pw, sy); c.stroke();
    }
    c.strokeStyle = D.alpha(D.c.text, 0.6); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(L, Tp); c.lineTo(L, Tp + ph); c.lineTo(L + pw, Tp + ph); c.stroke();
    c.font = '11px ' + FONT; c.fillStyle = D.c.muted;
    for (let i = 0; i <= 5; i++) {
      const t = (i / 5).toFixed(1);
      c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(t, gx(i / 5), Tp + ph + 5);
      c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(t, L - 6, gy(i / 5));
    }
    // 軸名
    const axisName = function (sub, x, y, rot) {
      c.save(); c.translate(x, y); if (rot) c.rotate(-Math.PI / 2);
      const fM = 'italic 600 12px ' + FONT, fS = '600 9px ' + FONT;
      c.font = fM; const w1 = c.measureText('sin θ').width; c.font = fS; const w2 = c.measureText(sub).width;
      D.haloText(c, 'sin θ', -(w1 + w2) / 2, 0, D.c.text, 'left', 'middle', fM);
      D.haloText(c, sub, -(w1 + w2) / 2 + w1 + 0.5, 4, D.c.text, 'left', 'middle', fS);
      c.restore();
    };
    axisName('2', L + pw / 2, GH - 10, false);
    axisName('1', 13, Tp + ph / 2, true);
    if (!st.rows.length) {
      halo(c, T('按「記錄」後，數據點會出現在這裡', 'Recorded data points will appear here'), L + pw / 2, Tp + ph * 0.42, D.c.muted, 'center', 'middle', 13, '600');
    }
    const mats = [];
    st.rows.forEach(function (r) { if (mats.indexOf(r.mat) < 0) mats.push(r.mat); });
    // 各材料的最佳直線與數據點
    const order = mats.filter(function (m) { return m !== st.mat; }).concat(mats.indexOf(st.mat) >= 0 ? [st.mat] : []);
    let curLabel = null;
    order.forEach(function (mat) {
      const gs = groupStats(mat), col = matColor(mat), cur = mat === st.mat;
      if (gs.N && isFinite(gs.fit.m)) {
        const x1 = Math.min(1, 1 / gs.fit.m);
        c.save(); c.strokeStyle = D.alpha(col, cur ? 0.95 : 0.35); c.lineWidth = cur ? 2.2 : 1.3;
        c.beginPath(); c.moveTo(gx(0), gy(0)); c.lineTo(gx(x1), gy(gs.fit.m * x1)); c.stroke(); c.restore();
        if (cur) curLabel = { x: gx(x1), y: gy(gs.fit.m * x1), m: gs.fit.m, col: col };
      }
      gs.rows.forEach(function (r, i) {
        const p = rowSines(r), x = gx(p[0]), y = gy(p[1]);
        const latest = r === st.rows[st.rows.length - 1];
        c.save();
        c.globalAlpha = cur ? 1 : 0.45;
        if (r.side > 0) { // 右側入射：菱形
          c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 6, y); c.lineTo(x, y + 6); c.lineTo(x - 6, y); c.closePath();
          c.fillStyle = cur ? col : D.alpha(col, 0.3); c.fill(); c.strokeStyle = D.c.surface; c.lineWidth = 1.2; c.stroke();
        } else D.ball(c, x, y, 5, col, { shadow: cur });
        if (latest && cur) { c.strokeStyle = D.c.text; c.lineWidth = 1.2; c.beginPath(); c.arc(x, y, 9, 0, Math.PI * 2); c.stroke(); }
        c.restore();
      });
    });
    // 公認值直線（虛線，畫在最佳直線上面，兩線重合時也看得到）
    if (st.mat !== 'unknown' || st.revealed) {
      const n = nAcc(st.mat), x1 = Math.min(1, 1 / n);
      c.save(); c.setLineDash([6, 5]); c.strokeStyle = D.alpha(D.c.text, D.dark ? 0.55 : 0.5); c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(gx(0), gy(0)); c.lineTo(gx(x1), gy(n * x1)); c.stroke(); c.restore();
    }
    // 標籤：最佳直線的斜率放在直線上段的左上方，公認值放在虛線中段的右下方，兩者不會重疊
    if (curLabel) {
      const xm = Math.min(0.9, 0.8 / curLabel.m), px = gx(xm), py = gy(curLabel.m * xm);
      richPill(c, [['n', ''], [T('（斜率）', ' (slope)'), ''], [' = ' + curLabel.m.toFixed(3), '']], Math.max(L + 150, px - 10), Math.max(Tp + 22, py - 4), curLabel.col, 'right', 12);
    }
    if (st.mat !== 'unknown' || st.revealed) {
      const n = nAcc(st.mat), xa = 0.42 / n;
      halo(c, T('公認值 ', 'accepted ') + n.toFixed(st.mat === 'acrylic' || st.mat === 'crown' ? 2 : 3), gx(xa) + 8, gy(n * xa) + 8, D.c.muted, 'left', 'middle', 11, '600');
    }
  }

  // ---------------- 數據表、分析、讀數、步驟 ----------------
  function buildTable() {
    const anySemi = st.rows.some(function (r) { return r.shape === 'semi'; });
    const h = ['#', T('材料', 'Material'), T('形狀', 'Shape'), T('入射側', 'Side'), 'θ<sub>1</sub>', 'θ<sub>2</sub>', 'sin θ<sub>1</sub>', 'sin θ<sub>2</sub>']
      .concat(anySemi ? ['x<sub>1</sub> (cm)', 'x<sub>2</sub> (cm)'] : []).concat(['n']);
    let html = '<thead><tr>' + h.map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>';
    if (!st.rows.length) {
      html += '<tr class="empty"><td colspan="' + h.length + '">' + T('還沒有數據：完成一次插針、移走透明塊量好角度後按「記錄」。', 'No data yet: line up the pins, remove the block, measure the angles and press “Record”.') + '</td></tr>';
    }
    st.rows.forEach(function (r, i) {
      const p = rowSines(r), n = p[1] / p[0];
      const cls = (i === st.rows.length - 1 ? 'latest' : '') + (r.mat !== st.mat ? ' other' : '');
      html += '<tr class="' + cls.trim() + '"><td>' + (i + 1) + '</td>' +
        '<td class="mat"><i style="background:' + matColor(r.mat) + '"></i>' + matName(r.mat) + '</td>' +
        '<td>' + (r.shape === 'rect' ? T('長方形', 'rect.') : r.dir === 'rev' ? T('半圓（弧面）', 'semi (curved)') : T('半圓', 'semi')) + '</td>' +
        '<td>' + (r.side < 0 ? T('左', 'left') : T('右', 'right')) + '</td>' +
        '<td>' + (r.res === 0.5 ? r.th1.toFixed(1) : r.th1.toFixed(0)) + '°</td><td>' + (r.res === 0.5 ? r.th2.toFixed(1) : r.th2.toFixed(0)) + '°</td>' +
        '<td>' + Math.sin(r.th1 * DEG).toFixed(3) + '</td><td>' + Math.sin(r.th2 * DEG).toFixed(3) + '</td>' +
        (anySemi ? '<td>' + (r.shape === 'semi' ? r.x1.toFixed(2) : '—') + '</td><td>' + (r.shape === 'semi' ? r.x2.toFixed(2) : '—') + '</td>' : '') +
        '<td>' + (isFinite(n) ? n.toFixed(3) : '—') + '</td></tr>';
    });
    $('tbl').innerHTML = html + '</tbody>';
    $('undo').disabled = !st.rows.length;
    $('methodBox').hidden = !st.rows.some(function (r) { return r.shape === 'semi'; }) && st.shape !== 'semi';
    // 圖例
    const mats = [];
    st.rows.forEach(function (r) { if (mats.indexOf(r.mat) < 0) mats.push(r.mat); });
    let lg = mats.map(function (m) { return '<span style="color:' + matColor(m) + '"><i class="dot" style="background:' + matColor(m) + '"></i>' + matName(m) + '</span>'; }).join('');
    lg += '<span>' + T('● 左側入射　◆ 右側入射', '● from the left   ◆ from the right') + '</span>';
    lg += '<span style="color:var(--muted)"><i class="dash"></i>' + T('公認值', 'accepted value') + '</span>';
    $('gLegend').innerHTML = lg;
  }
  function dl(rows) {
    return rows.map(function (r) {
      if (r.sec) return '<dt class="sec">' + r.sec + '</dt>';
      return '<dt>' + r[0] + '</dt><dd' + (r[2] ? ' class="' + r[2] + '"' : '') + '>' + r[1] + '</dd>';
    }).join('');
  }
  function buildFit() {
    const gs = groupStats(st.mat), rows = [];
    rows.push([T('材料', 'Material'), matName(st.mat)]);
    rows.push([T('數據點', 'Data points'), String(gs.N)]);
    const known = gs.revealed;
    rows.push([T('斜率（過原點）', 'Slope (through origin)'), gs.N ? gs.fit.m.toFixed(3) + (isFinite(gs.fit.se) ? ' <small>± ' + gs.fit.se.toFixed(3) + '</small>' : '') : '—']);
    rows.push([T('公認值', 'Accepted value'), known ? nAcc(st.mat).toFixed(3) : T('?（尚未揭曉）', '? (hidden)')]);
    rows.push([T('百分誤差', 'Percent error'), known && gs.N ? fPct(gs.pct) : '—', known && gs.N ? (Math.abs(gs.pct) <= 1 ? 'ok' : Math.abs(gs.pct) > 3 ? 'bad' : '') : '']);
    rows.push([T('各次 n 的平均', 'Mean of the single n'), gs.N ? gs.mean.toFixed(3) : '—']);
    if (gs.N >= 3 && isFinite(gs.line.m)) rows.push([T('一般直線：斜率、截距', 'Free line: slope, intercept'), gs.line.m.toFixed(3) + T('、', ', ') + minus(gs.line.c.toFixed(3))]);
    if (gs.left.N && gs.right.N) {
      rows.push([T('左側入射的斜率', 'Slope, light from the left'), gs.left.m.toFixed(3) + ' <small>(' + gs.left.N + ')</small>']);
      rows.push([T('右側入射的斜率', 'Slope, light from the right'), gs.right.m.toFixed(3) + ' <small>(' + gs.right.N + ')</small>']);
    }
    if (gs.N && isFinite(gs.fit.m) && gs.fit.m > 1) rows.push([T('由斜率算臨界角', 'Critical angle from the slope'), (Math.asin(1 / gs.fit.m) / DEG).toFixed(1) + '°']);
    $('fit').innerHTML = dl(rows);
    $('reveal').hidden = !(st.mat === 'unknown' && !st.revealed);
  }
  function buildReadout(ai) {
    const rows = [], m = st.meas, k = key();
    if (st.phase === 'align') {
      rows.push({ sec: T('對準情形（眼睛看到的像）', 'Lining up (as the eye sees it)') });
      const ii = incIds().map(function (id) { return pinDef(id).lab; });
      const fd = function (x) { return isFinite(x) ? Math.abs(x / DEG).toFixed(2) + '°' : T('看不到', 'not visible'); };
      rows.push([and2(ii[0], ii[1]) + T(' 的像相差', ' images differ by'), ai.placedInc ? fd(ai.dAB) : '—', ai.abOK ? 'ok' : '']);
      ai.obs.forEach(function (o) {
        rows.push([pinDef(o.id).lab + T(' 與它們相差', ' is off by'), o.placed ? fd(o.d) : T('還在針插上', 'in the pincushion'), o.placed && o.ok ? 'ok' : '']);
      });
      if (k === 'semiR' && cfg().pins.P) {
        const ri = C.reverseInfo(block(), nNow(), cfg().pins.P);
        const ang = C.angleBetween(C.sub(cfg().pins.P, v(0, 0)), v(0, -1)) / DEG;
        rows.push([T('PO 與法線的夾角（量角器）', 'Angle of PO from the normal'), fA(C.readAngle(ang, st.res, 0))]);
        rows.push([T('光在 O 點', 'Light at O'), ri.tir ? T('全反射', 'totally reflected') : T('可以射出', 'gets out') + ' <small>' + T('穿透率 ', 'transmitted ') + (ri.T * 100).toFixed(ri.T < 0.1 ? 1 : 0) + '%</small>', ri.tir ? 'bad' : '']);
      }
    }
    rows.push({ sec: T('量測（移走透明塊後）', 'Measured (block removed)') });
    const has = m && m.ok;
    rows.push([T('空氣中的角 θ<sub>1</sub>', 'Angle in air θ<sub>1</sub>'), has ? fA(m.th1) : '—']);
    rows.push([T('透明塊中的角 θ<sub>2</sub>', 'Angle in the block θ<sub>2</sub>'), has ? fA(m.th2) : '—']);
    rows.push(['sin θ<sub>1</sub>' + T('、', ', ') + 'sin θ<sub>2</sub>', has ? f3(m.s1) + T('、', ', ') + f3(m.s2) : '—']);
    rows.push([T('n = sin θ<sub>1</sub> / sin θ<sub>2</sub>', 'n = sin θ<sub>1</sub> / sin θ<sub>2</sub>'), has && isFinite(m.nRow) ? m.nRow.toFixed(3) : '—']);
    if (st.shape === 'rect') {
      rows.push([T('O′ 的角 θ<sub>3</sub>、θ<sub>4</sub>', 'At O′: θ<sub>3</sub>, θ<sub>4</sub>'), has ? fA(m.th3) + T('、', ', ') + fA(m.th4) : '—']);
      rows.push([T('AB 與 CD 的夾角', 'Angle between AB and CD'), has ? m.parallel.toFixed(2) + '°' : '—', has ? (m.parallel <= 0.5 ? 'ok' : '') : '']);
      rows.push([T('側向位移 d（直尺）', 'Sideways shift d (ruler)'), has ? fcm(m.shift) : '—']);
      rows.push([T('公式 t sin(θ<sub>1</sub>−θ<sub>2</sub>)/cos θ<sub>2</sub>', 'Formula t sin(θ<sub>1</sub>−θ<sub>2</sub>)/cos θ<sub>2</sub>'), has ? fcm(m.shiftF) : '—']);
    } else {
      rows.push(['x<sub>1</sub>' + T('、', ', ') + 'x<sub>2</sub>', has ? m.x1.toFixed(2) + T('、', ', ') + m.x2.toFixed(2) + ' cm' : '—']);
      rows.push(['n = x<sub>1</sub> / x<sub>2</sub>', has && isFinite(m.nRuler) ? m.nRuler.toFixed(3) : '—']);
    }
    rows.push({ sec: T('參考', 'Reference') });
    const known = st.mat !== 'unknown' || st.revealed;
    rows.push([T('公認折射率 n', 'Accepted n'), known ? nAcc(st.mat).toFixed(3) : '?']);
    rows.push([T('臨界角 θ<sub>c</sub>', 'Critical angle θ<sub>c</sub>'), known ? (C.criticalAngle(nAcc(st.mat)) / DEG).toFixed(1) + '°' : '?']);
    if (has && known && isFinite(m.nRow)) rows.push([T('這一次的百分誤差', 'Percent error, this trial'), fPct(C.pctError(m.shape === 'semi' && st.method === 'ruler' ? m.nRuler : m.nRow, nAcc(st.mat)))]);
    // 每一段各自成一欄（寬螢幕時並排）
    const groups = [];
    rows.forEach(function (r) { if (r.sec) groups.push({ t: r.sec, rows: [] }); else groups[groups.length - 1].rows.push(r); });
    $('readout').innerHTML = groups.map(function (g) { return '<div><h3>' + g.t + '</h3><dl class="readout">' + dl(g.rows) + '</dl></div>'; }).join('');
  }
  function stepTexts() {
    const k = key();
    if (k === 'rect') return [
      T('插 A、B：從針插拖出兩針，插在 L 的上方（B 靠近 L，A 離遠一點）。', 'Pins A and B: drag them out of the pincushion and push them in above L (B close to L, A further away).'),
      T('拖曳眼睛，從 L′ 那一側透過透明塊看，直到 A、B 的像（下半段）重疊。', 'Drag the eye and look through the block from the L′ side until the images (lower parts) of A and B line up.'),
      T('在這條視線上插 C、D，使四根針的像重疊。', 'Push C and D in along this line of sight so that all four pins line up.'),
      T('按「移走透明塊，畫出光路」：畫出 AB、OO′、CD 與法線。', 'Press “Remove the block”: AB, OO′, CD and the normal are drawn.'),
      T('讀量角器的 θ<sub>1</sub>、θ<sub>2</sub>，按「記錄」。之後 B 不動、移動 A，再做幾次。', 'Read θ<sub>1</sub> and θ<sub>2</sub> on the protractor and press “Record”. Then keep B, move A and repeat.')
    ];
    if (k === 'semiF') return [
      T('O 針已插在圓心。把 P 插在左上方的圓周上（靠近記號點會自動對準）。', 'Pin O is at the centre. Put P on the upper-left part of the circle (it snaps to the marks).'),
      T('拖曳眼睛，從弧面那一側透過水看，直到 P 與 O 的像重疊。', 'Drag the eye and look through the water from the curved side until P and O line up.'),
      T('在視線上插 P′，使 P′ 與 P、O 的像重疊。', 'Push P′ in on that line of sight so that it hides P and O.'),
      T('按「移走透明塊，畫出光路」，量 x<sub>1</sub>、x<sub>2</sub>（或 θ<sub>1</sub>、θ<sub>2</sub>）。', 'Press “Remove the block” and measure x<sub>1</sub> and x<sub>2</sub> (or θ<sub>1</sub> and θ<sub>2</sub>).'),
      T('按「記錄」，再換下一個記號點。', 'Press “Record”, then move P to the next mark.')
    ];
    return [
      T('O 針在圓心。把 P 插在弧面外側：光由弧面射入，沿半徑到達 O。', 'Pin O is at the centre. Put P outside the curved face: its light enters there and runs along a radius to O.'),
      T('拖曳眼睛，從平面那一側看，直到 P 與 O 的像重疊；怎麼移都對不上，就是全反射。', 'Drag the eye and look from the flat side until P and O line up; if they never do, the light is totally reflected.'),
      T('在視線上插 P′。', 'Push P′ in on the line of sight.'),
      T('按「移走透明塊，畫出光路」，量 θ<sub>1</sub>、θ<sub>2</sub>。', 'Press “Remove the block” and measure θ<sub>1</sub> and θ<sub>2</sub>.'),
      T('記錄。慢慢加大 P 的角度，找出像剛好消失的臨界角。', 'Record. Move P to larger angles and find where the image just disappears — the critical angle.')
    ];
  }
  function stepIndex(ai) {
    if (!ai.placedInc) return 0;
    if (st.phase === 'drawn') return st.recorded ? 5 : 4;
    if (ai.allPlaced) return 3;
    if (!ai.abOK && !ai.obs.some(function (o) { return o.placed; })) return 1;
    return 2;
  }
  function buildSteps(ai) {
    const idx = stepIndex(ai);
    $('steps').innerHTML = stepTexts().map(function (t, i) {
      return '<li class="' + (i < idx ? 'done' : i === idx ? 'now' : '') + '"' + (i === idx ? ' aria-current="step"' : '') + '>' + t + '</li>';
    }).join('');
  }
  let statusOverride = null, statusTimer = 0;
  function sayStatus(msg, ms) { statusOverride = msg; clearTimeout(statusTimer); statusTimer = setTimeout(function () { statusOverride = null; refresh(); }, ms || 3500); refresh(); }
  function buildStatus(ai) {
    const el = $('status');
    let msg = '', ok = false;
    const ii = incIds().map(function (id) { return pinDef(id).lab; });
    const oo = obsIds().map(function (id) { return pinDef(id).lab; });
    if (statusOverride) msg = statusOverride;
    else if (st.phase === 'drawn') {
      const m = st.meas;
      msg = st.recorded ? T('已記錄。', 'Recorded.') : (m && m.ok ? T('量得 θ<sub>1</sub> = ', 'Measured θ<sub>1</sub> = ') + fA(m.th1) + T('、θ<sub>2</sub> = ', ', θ<sub>2</sub> = ') + fA(m.th2) + T('，n = ', ', n = ') + (isFinite(m.nRow) ? m.nRow.toFixed(3) : '—') + T('。按「記錄」把這一次加進數據表。', '. Press “Record” to add it to the table.') : '');
    } else if (!ai.placedInc) msg = T('從右上角的針插拖出 ', 'Drag ') + andList(ii.filter(function (x) { return x !== 'O'; })) + T(' 插在紙上。', ' out of the pincushion onto the paper.');
    else if (!ai.visA || !ai.visB) msg = T('從眼睛的位置看不到入射側的針透過透明塊的像：把眼睛移到透明塊另一側、對著透明塊。', 'From here the eye cannot see the far pins through the block: move the eye to the other side, facing the block.');
    else if (ai.allOK) { msg = T('全部對齊了！按「移走透明塊，畫出光路」。', 'All lined up! Press “Remove the block and draw the rays”.'); ok = true; }
    else if (!ai.abOK) {
      const h = eyeHint();
      msg = and2(ii[0], ii[1]) + T(' 的像還沒重疊（相差 ', ' do not line up yet (') + Math.abs(ai.dAB / DEG).toFixed(2) + T('°）：把眼睛往', '° apart): move the eye to its ') + (h > 0 ? T('右', 'right') : T('左', 'left')) + T('移一點（以眼睛面對的方向為準）。', ' (as the eye faces).');
      if (ai.obs.some(function (o) { return o.placed; })) msg = and2(ii[0], ii[1]) + T(' 的像沒有重疊，觀察側的針插在錯的視線上；先移動眼睛。', ' do not line up, so the viewing-side pins are on a wrong line of sight; move the eye first.');
    } else {
      const bad = ai.obs.filter(function (o) { return !(o.placed && o.ok); });
      const un = bad.filter(function (o) { return !o.placed; });
      if (un.length === bad.length) { msg = and2(ii[0], ii[1]) + T(' 的像重疊了 ✓ 從針插拖出 ', ' line up ✓ Drag ') + andList(un.map(function (o) { return pinDef(o.id).lab; })) + T('，插在這條視線上（眼睛與透明塊之間）。', ' out and push them in on this line of sight (between the eye and the block).'); ok = true; }
      else {
        const o = bad.filter(function (q) { return q.placed; })[0];
        msg = pinDef(o.id).lab + T(' 的像偏了 ', ' is off by ') + Math.abs(o.d / DEG).toFixed(2) + T('°，往', '°: nudge it to the ') + (o.d > 0 ? T('右', 'right') : T('左', 'left')) + T('微移（點選它再按 ▶ 或 ◀）。', ' (select it, then use ◀ ▶).');
      }
    }
    el.innerHTML = msg; // 只含程式自己的字串（沒有使用者輸入）
    el.classList.toggle('ok', ok);
    announce(statusOverride ? 'o:' + msg : msg.replace(/[0-9.]+°/g, '#'), msg);
    void oo;
  }
  // 螢幕報讀：只在訊息的種類改變時念（跟著拖曳變的數字不念），最多每秒一次
  let srKind = '', srTimer = 0, srLast = 0, srPending = '';
  function announce(kind, html) {
    if (kind === srKind) return;
    srKind = kind;
    srPending = html.replace(/<[^>]+>/g, '');
    const say = function () { srTimer = 0; srLast = Date.now(); const sr = $('srStatus'); if (sr) sr.textContent = srPending; };
    if (!srTimer) srTimer = setTimeout(say, Math.max(0, 1000 - (Date.now() - srLast)));
  }
  function buildButtons(ai) {
    const db = $('drawBtn');
    db.textContent = st.phase === 'drawn' ? T('放回透明塊（重做這一次）', 'Put the block back (redo this trial)') : T('移走透明塊，畫出光路', 'Remove the block and draw the rays');
    db.disabled = st.phase === 'align' && !ai.allPlaced;
    $('recBtn').disabled = !(st.phase === 'drawn' && st.meas && st.meas.ok && !st.recorded);
    const sel = st.sel === 'eye' ? T('眼睛', 'eye') : (pinDef(st.sel) ? pinDef(st.sel).lab + T(' 針', ' pin') : '—');
    $('selName').innerHTML = T('微移：', 'Nudge: ') + '<b>' + sel + '</b>';
    const lockPin = st.phase === 'drawn' && st.sel !== 'eye';
    $('nudgeL').disabled = lockPin; $('nudgeR').disabled = lockPin;
  }

  // ---------------- 更新與重畫 ----------------
  let raf = 0, panelsDirty = true, dataDirty = true, lastT = 0, animating = false;
  function invalidate() { VC = null; panelsDirty = true; kbSync(); schedule(); }
  function refresh() { panelsDirty = true; schedule(); }
  function schedule() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016;
    lastT = now;
    animating = false;
    const target = st.phase === 'drawn' ? 0 : 1;
    if (st.fade !== target) {
      if (reduced) st.fade = target;
      else { st.fade += (target > st.fade ? 1 : -1) * dt / 0.35; st.fade = clamp(st.fade, 0, 1); if ((target === 0 && st.fade <= 0) || (target === 1 && st.fade >= 1)) st.fade = target; }
      animating = st.fade !== target;
    }
    if (st.flash > 0) { st.flash = reduced ? 0 : Math.max(0, st.flash - dt / 0.5); animating = animating || st.flash > 0; }
    drawMain();
    drawView();
    if (panelsDirty) {
      panelsDirty = false;
      const ai = alignInfo();
      buildReadout(ai); buildSteps(ai); buildStatus(ai); buildButtons(ai);
    }
    if (dataDirty) { dataDirty = false; buildTable(); buildFit(); drawGraph(); }
    if (animating) { schedule(); } else lastT = 0;
  }

  // ---------------- 任務事件 ----------------
  let touched = false;
  function emit(type, data) { if (touched && window.LabMission) window.LabMission.emit(type, data); }
  function measurePayload(m) {
    return {
      shape: m.shape, dir: m.dir, mat: m.mat, nAcc: m.nAcc, err: m.err, res: m.res, t: m.t, side: m.side,
      th1: m.th1, th2: m.th2, nRow: m.nRow, nRuler: m.nRuler, alignAng: m.alignAng, alignOff: m.alignOff,
      parallel: m.parallel, shift: m.shift, shiftF: m.shiftF, x1: m.x1, x2: m.x2, mark: m.mark,
      revealed: m.mat !== 'unknown' || st.revealed
    };
  }
  function groupPayload(gs) {
    return {
      mat: gs.mat, nAcc: gs.nAcc, revealed: gs.revealed, N: gs.N, slope: gs.fit.m, pct: gs.pct, errAll: gs.errAll,
      th1Min: gs.th1Min, th1Max: gs.th1Max, left: gs.left.N, right: gs.right.N, leftPct: gs.left.pct, rightPct: gs.right.pct,
      marks: gs.marks.slice(), rectN: gs.rect.N, semiN: gs.semi.N, rectPct: gs.rect.pct, semiPct: gs.semi.pct, method: st.method,
      rows: gs.rows.map(function (r) { return { shape: r.shape, dir: r.dir, side: r.side, err: r.err, res: r.res, th1: r.th1, th2: r.th2 }; })
    };
  }
  function emitReverse() {
    if (key() !== 'semiR' || !cfg().pins.P) return;
    const ri = C.reverseInfo(block(), nNow(), cfg().pins.P);
    emit('reverse', { mat: st.mat, thMed: ri.thMed / DEG, crit: ri.crit / DEG, tir: ri.tir, T: ri.T, err: st.err });
  }

  // ---------------- 操作 ----------------
  function setPin(id, p) {
    if (id === 'eye') cfg().eye = p; else cfg().pins[id] = p;
    invalidate();
  }
  function movable(id) { return id === 'eye' || st.phase === 'align'; }
  function hitTest(px, py) {
    if (st.phase === 'align') {
      const tl = trayList();
      for (let i = 0; i < tl.length; i++) if (Math.hypot(px - tl[i].x, py - tl[i].y) < 22) return { id: tl[i].id, tray: true };
    }
    let best = null, bd = 1e9;
    const c = cfg();
    pinDefs().forEach(function (pd) {
      if (pd.role === 'fix') return;
      const p = c.pins[pd.id]; if (!p) return;
      const d = Math.hypot(px - X(p.x), py - Y(p.y));
      if (d < 22 && d < bd) { bd = d; best = { id: pd.id }; }
    });
    const e = c.eye, de = Math.hypot(px - X(e.x), py - Y(e.y));
    if (de < 26 && de < bd) best = { id: 'eye' };
    return best;
  }
  function ptr(e, el) { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  let drag = null;
  cv.addEventListener('pointerdown', function (e) {
    const p = ptr(e, cv), h = hitTest(p.x, p.y);
    if (!h) return;
    e.preventDefault();
    touched = true;
    if (!movable(h.id)) { st.sel = h.id; sayStatus(T('透明塊已經移走、光路也畫好了：要移動針，先按「放回透明塊」。', 'The block is off and the rays are drawn: press “Put the block back” to move the pins.')); invalidate(); return; }
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    st.sel = h.id;
    if (h.tray) { setPin(h.id, constrain(h.id, v(WX(p.x), WY(Math.max(p.y, TB + M + 4))))); drag = { id: h.id, dx: 0, dy: 0, moved: true }; }
    else { const q = h.id === 'eye' ? cfg().eye : cfg().pins[h.id]; drag = { id: h.id, dx: X(q.x) - p.x, dy: Y(q.y) - p.y, moved: false }; }
    cv.style.cursor = 'grabbing';
    invalidate();
  });
  cv.addEventListener('pointermove', function (e) {
    const p = ptr(e, cv);
    if (drag) {
      drag.moved = true;
      const w = v(WX(p.x + drag.dx), WY(Math.max(TB + M + 2, p.y + drag.dy)));
      drag.overTray = p.y < TB + M && drag.id !== 'eye';
      setPin(drag.id, constrain(drag.id, w));
      return;
    }
    const h = hitTest(p.x, p.y);
    const hv = h ? (h.tray ? 'tray:' + h.id : h.id) : null;
    if (hv !== st.hover) { st.hover = hv; cv.style.cursor = h ? 'grab' : 'default'; schedule(); }
  });
  function endDrag(e) {
    if (!drag) return;
    const d = drag; drag = null;
    cv.style.cursor = 'grab';
    if (d.overTray && d.id !== 'eye') { cfg().pins[d.id] = null; if (st.sel === d.id) st.sel = 'eye'; invalidate(); return; }
    if (d.id === 'P') {
      const q = snapMark(cfg().pins.P);
      if (q !== cfg().pins.P) { cfg().pins.P = q; st.flash = 1; st.flashAt = q; }
    }
    invalidate();
    if (d.id === 'P' || d.id === 'eye') emitReverse();
    void e;
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (!drag && st.hover) { st.hover = null; schedule(); } });

  /** 選取的物體垂直於視線移動 dx（cm，往眼睛的右手邊為正） */
  function nudge(dx, along) {
    const id = st.sel;
    if (!movable(id)) { sayStatus(T('要移動針，先按「放回透明塊」。', 'Press “Put the block back” to move the pins.')); return; }
    touched = true;
    const V = views(), right = v(V.look.y, -V.look.x);
    const p = id === 'eye' ? cfg().eye : cfg().pins[id];
    if (!p) return;
    let q = C.add(p, C.mul(right, dx));
    if (along) q = C.add(q, C.mul(V.look, along));
    setPin(id, constrain(id, q));
    if (id === 'P' || id === 'eye') emitReverse();
  }
  function stepFor(id) { return id === 'eye' ? 0.05 : 0.02; }
  [['nudgeL', -1], ['nudgeR', 1]].forEach(function (b) {
    const el = $(b[0]);
    let timer = 0, rep = 0;
    const stop = function () { clearTimeout(timer); clearInterval(rep); timer = rep = 0; };
    el.addEventListener('pointerdown', function (e) {
      if (el.disabled) return;
      e.preventDefault();
      nudge(b[1] * stepFor(st.sel));
      timer = setTimeout(function () { rep = setInterval(function () { nudge(b[1] * stepFor(st.sel)); }, 80); }, 380);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { el.addEventListener(ev, stop); });
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nudge(b[1] * stepFor(st.sel)); } });
  });
  // ---------------- 鍵盤操作：和拖曳一樣經過 constrain()、movable()、P 的記號點吸附與 emitReverse() ----------------
  function kbIds() { return ['eye'].concat(pinDefs().filter(function (pd) { return pd.role !== 'fix'; }).map(function (pd) { return pd.id; })); }
  function objName(id) { return id === 'eye' ? T('眼睛', 'Eye') : T('針 ', 'Pin ') + pinDef(id).lab; }
  function objDesc(id) {
    if (id !== 'eye' && !cfg().pins[id]) return objName(id) + T('：還在針插上，按方向鍵把它插到紙上。', ': still in the pincushion; press an arrow key to push it into the paper.');
    const p = id === 'eye' ? cfg().eye : cfg().pins[id];
    let t = objName(id) + T('：x = ', ': x = ') + p.x.toFixed(2) + T(' cm、y = ', ' cm, y = ') + p.y.toFixed(2) + ' cm';
    if (st.phase === 'align') {
      const ai = alignInfo(), ii = incIds().map(function (q) { return pinDef(q).lab; });
      if (id === 'eye' || incIds().indexOf(id) >= 0) {
        if (ai.placedInc) t += T('；', '; ') + and2(ii[0], ii[1]) + (ai.abOK ? T(' 的像重疊了', ' line up') : T(' 的像還沒重疊', ' do not line up yet'));
      } else {
        const o = ai.obs.filter(function (q) { return q.id === id; })[0];
        if (o && o.placed) t += o.ok ? T('；已和入射側的像對齊', '; lined up with the images') : T('；和入射側的像相差 ', '; off from the images by ') + (isFinite(o.d) ? Math.abs(o.d / DEG).toFixed(2) + '°' : T('（看不到）', '(not visible)'));
      }
    }
    return t + T('。', '.');
  }
  /** 鍵盤把針從針插拿出來：插在目前視線上的預設位置（入射側在透明塊另一邊，觀察側在眼睛與透明塊之間），之後再用方向鍵移動 */
  function kbPlace(id) {
    const V = views(), pd = pinDef(id), dist = C.len(C.sub(V.tgt, V.eye));
    if (pd.role === 'inc') {
      const i = incIds().indexOf(id);
      return constrain(id, C.add(V.tgt, C.mul(V.look, (st.shape === 'rect' ? st.t / 2 : 0) + (i === 0 ? 5 : 2))));
    }
    const oi = obsIds(), j = oi.indexOf(id);
    return constrain(id, C.add(V.eye, C.mul(V.look, dist * (oi.length === 1 ? 0.5 : j === 0 ? 0.6 : 0.35))));
  }
  /**
   * 鍵盤移動一個物體。mode 'top'（俯視圖）：左右鍵垂直於視線、上下鍵沿視線，方向和畫面一致；
   * mode 'view'（眼睛看到的景象）：左右鍵和在景象中拖曳一樣（往眼睛的右手邊為正），上下鍵不動。
   * 步長：左右 0.02 cm（眼睛 0.05 cm），Shift 0.5 cm；上下 0.1 cm，Shift 1 cm。
   */
  function kbMove(id, dx, dy, big, mode) {
    if (mode === 'view' && dy) return false;
    if (!movable(id)) { sayStatus(T('要移動針，先按「放回透明塊」。', 'Press “Put the block back” to move the pins.')); return false; }
    touched = true;
    if (id !== 'eye' && !cfg().pins[id]) { st.sel = id; setPin(id, kbPlace(id)); return true; }
    const V = views(), p0 = id === 'eye' ? cfg().eye : cfg().pins[id];
    let right = v(V.look.y, -V.look.x), fwd = V.look;
    if (mode === 'top') { if (right.x < 0) right = C.mul(right, -1); if (fwd.y < 0) fwd = C.mul(fwd, -1); }
    let q = dx ? C.add(p0, C.mul(right, dx * (big ? 0.5 : stepFor(id)))) : C.add(p0, C.mul(fwd, dy * (big ? 1 : 0.1)));
    q = constrain(id, q);
    // P 靠近記號點時吸附（和放開滑鼠時一樣）；從記號點移開時不會被吸回去
    if (id === 'P' && key() === 'semiF') {
      for (let i = 0; i < MARKS.length; i++) {
        const dq = C.len(C.sub(q, MARKS[i]));
        if (dq < SNAP && dq < C.len(C.sub(p0, MARKS[i])) - 1e-9) { q = v(MARKS[i].x, MARKS[i].y); st.flash = 1; st.flashAt = q; break; }
      }
    }
    if (C.len(C.sub(q, p0)) < 1e-9) return false;
    st.sel = id;
    setPin(id, q);
    if (id === 'P' || id === 'eye') emitReverse();
    return true;
  }
  function kbFill(list, mode) {
    const ids = kbIds();
    if (list.map(function (it) { return it.id; }).join() === ids.join()) return;
    list.length = 0;
    ids.forEach(function (id) {
      list.push({ id: id, name: function () { return objName(id); }, describe: function () { return objDesc(id); },
        move: function (dx, dy, big) { return kbMove(id, dx, dy, big, mode); } });
    });
  }
  /** 讓兩組鍵盤選取跟著 st.sel（滑鼠點選、換裝置、記錄後回到眼睛時） */
  function kbSync() {
    [[kb, kbItems, 'top'], [vkb, vkbItems, 'view']].forEach(function (q) {
      if (!q[0]) return;
      kbFill(q[1], q[2]);
      let i = 0;
      q[1].forEach(function (it, n) { if (it.id === st.sel) i = n; });
      if (i !== q[0].index()) q[0].select(i);
    });
  }
  function kbChanged(k, list) {
    const it = list[k.index()];
    if (it && k.focused() && it.id !== st.sel) st.sel = it.id;
    invalidate();
  }
  /** Delete／Backspace：把選取的針放回針插（和把針拖回針插一樣） */
  function kbRemove(e, k, list) {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    const it = list[k.index()];
    if (!it || it.id === 'eye' || !cfg().pins[it.id]) return;
    e.preventDefault();
    if (!movable(it.id)) { sayStatus(T('要移動針，先按「放回透明塊」。', 'Press “Put the block back” to move the pins.')); return; }
    touched = true;
    cfg().pins[it.id] = null;
    invalidate();
    window.LabKeys.say(objName(it.id) + T('：已放回針插。', ': back in the pincushion.'));
  }
  if (window.LabKeys) {
    [cv, vc].forEach(function (el) { el.addEventListener('focus', kbSync); }); // 先對齊 st.sel，再讓 keys.js 念出選取的物體
    kbFill(kbItems, 'top'); kbFill(vkbItems, 'view');
    kb = window.LabKeys.attach(cv, {
      label: T('俯視圖：軟木板上的方格紙、透明塊、大頭針與眼睛。按 Enter 選眼睛或某一支針；左右鍵垂直於視線微移、上下鍵沿視線前後移，Shift 移得較多；還在針插上的針按方向鍵就插到紙上，Delete 把針放回針插。',
        'Top view: graph paper on a cork board with the transparent block, the pins and the eye. Press Enter to pick the eye or a pin; Left and Right nudge it across the line of sight, Up and Down move it along the line of sight, Shift moves further; an arrow key pushes a pin from the pincushion into the paper, and Delete puts it back.'),
      items: kbItems,
      onChange: function () { kbChanged(kb, kbItems); }
    });
    vkb = window.LabKeys.attach(vc, {
      label: T('眼睛看到的景象：針的上半段直接看到，下半段透過透明塊看到折射後的像。按 Enter 選要微調的物體，左右鍵讓它往眼睛的左右微移，Shift 移得較多。',
        'What the eye sees: the upper part of each pin directly, the lower part through the block. Press Enter to pick the object to fine-tune; Left and Right nudge it to the eye’s left or right, Shift moves further.'),
      items: vkbItems,
      onChange: function () { kbChanged(vkb, vkbItems); }
    });
    cv.addEventListener('keydown', function (e) { kbRemove(e, kb, kbItems); });
    vc.addEventListener('keydown', function (e) { kbRemove(e, vkb, vkbItems); });
  }
  // 在「眼睛看到的景象」中左右拖曳：微調選取的物體，使它的像跟著手指移動
  let vdrag = null;
  vc.addEventListener('pointerdown', function (e) {
    if (!movable(st.sel)) { sayStatus(T('要移動針，先按「放回透明塊」。', 'Press “Put the block back” to move the pins.')); return; }
    vdrag = { x: e.clientX };
    try { vc.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
  });
  vc.addEventListener('pointermove', function (e) {
    if (!vdrag) return;
    const dxp = e.clientX - vdrag.x;
    if (Math.abs(dxp) < 1) return;
    vdrag.x = e.clientX;
    // 針：像跟著手指走（往眼睛的右手邊移 Δ，像就往右轉 Δ/距離）；眼睛：往拖曳的方向移動
    const V = views(), id = st.sel;
    const dAng = dxp / kdeg() * DEG;
    const dist = id !== 'eye' && V.by[id] ? V.by[id].dist : 6;
    nudge(Math.tan(dAng) * dist);
  });
  const vEnd = function () { if (vdrag) { vdrag = null; } };
  vc.addEventListener('pointerup', vEnd); vc.addEventListener('pointercancel', vEnd);

  // 移走透明塊／放回
  $('drawBtn').addEventListener('click', function () {
    touched = true;
    if (st.phase === 'align') {
      const m = measureNow();
      if (!m.ok) {
        sayStatus(m.why === 'close' ? T('同一側的兩根針太近了，畫不出準確的直線。', 'Two pins on the same side are too close to draw a good line.') : m.why === 'side' ? T('這條入射線進入透明塊後會先碰到側面，量不到正確的折射角：調整 A、B，讓光從上表面進入、從下表面射出。', 'Along this line the light hits a side face of the block first, so the angles would be wrong: move A and B so the light enters the top face and leaves through the bottom face.') : T('這些針畫不出合理的光路：入射側與觀察側的針要分別在透明塊的兩側，光線要穿過透明塊的兩個面。', 'These pins do not give a sensible light path: the two groups must be on opposite sides and the line must pass through both faces of the block.'), 5000);
        return;
      }
      st.meas = m; st.phase = 'drawn'; st.recorded = false;
      if (st.sel !== 'eye') st.sel = 'eye';
      invalidate();
      emit('measure', measurePayload(m));
    } else {
      st.phase = 'align'; st.meas = null; st.recorded = false;
      invalidate();
    }
  });
  $('recBtn').addEventListener('click', function () {
    const m = st.meas;
    if (!m || !m.ok || st.recorded) return;
    touched = true;
    const row = { mat: m.mat, shape: m.shape, dir: m.dir, side: m.side, err: m.err, res: m.res, t: m.t, th1: m.th1, th2: m.th2, x1: m.x1, x2: m.x2, mark: m.mark };
    st.rows.push(row);
    st.recorded = true;
    // 這一次的光路留在紙上（淡淡的鉛筆線）
    const pn = cfg().pins, k = key();
    if (k === 'rect') {
      const far = C.len(C.sub(pn.D, m.g.O2)) > C.len(C.sub(pn.C, m.g.O2)) ? pn.D : pn.C;
      const farA = C.len(C.sub(pn.A, m.g.O)) > C.len(C.sub(pn.B, m.g.O)) ? pn.A : pn.B;
      st.traces.push({ key: k, segs: [[farA, m.g.O], [m.g.O, m.g.O2], [m.g.O2, far]], dots: [pn.A, pn.B, pn.C, pn.D] });
    } else {
      st.traces.push({ key: k, segs: [[pn.P, v(0, 0)], [v(0, 0), pn.P2]], dots: [pn.P, pn.P2] });
    }
    dataDirty = true;
    const gs = groupStats(m.mat);
    emit('record', { row: measurePayload(m), group: groupPayload(gs) });
    // 下一次：放回透明塊，觀察側的針回到針插
    setTimeout(function () {
      st.phase = 'align'; st.meas = null; st.recorded = false;
      obsIds().forEach(function (id) { cfg().pins[id] = null; });
      st.sel = 'eye';
      invalidate();
      sayStatus(st.shape === 'rect' ? T('已記錄第 ', 'Recorded row ') + st.rows.length + T(' 筆。B 不動、把 A 移到新的位置，再做一次。', '. Keep B, move A somewhere new and do it again.') : T('已記錄第 ', 'Recorded row ') + st.rows.length + T(' 筆。把 P 移到下一個位置，再做一次。', '. Move P to the next place and do it again.'), 5000);
    }, reduced ? 0 : 450);
    invalidate();
  });
  $('clearAll').addEventListener('click', function () {
    touched = true;
    st.rows = []; st.traces = []; st.meas = null; st.recorded = false; st.phase = 'align'; st.revealed = false;
    st.sysRot = C.systematicRot(st.rand); st.unknown = C.unknownN(st.rand);
    ['rect', 'semiF', 'semiR'].forEach(function (k) { const p = CFG[k].pins; Object.keys(p).forEach(function (id) { if (id === 'C' || id === 'D' || id === 'P2') p[id] = null; }); });
    st.sel = 'eye';
    dataDirty = true;
    invalidate();
    sayStatus(T('已全部清除：數據表與紙上的舊光路清掉了，觀察側的針回到針插。', 'Cleared: the table and the old rays are gone and the viewing-side pins are back in the pincushion.'));
  });
  $('undo').addEventListener('click', function () {
    if (!st.rows.length) return;
    st.rows.pop(); st.traces.pop();
    dataDirty = true; invalidate();
  });
  $('reveal').addEventListener('click', function () {
    st.revealed = true; dataDirty = true; invalidate();
    sayStatus(T('未知樣品的折射率是 ', 'The unknown sample has n = ') + st.unknown.toFixed(3) + T('。', '.'));
  });

  // 設定按鈕
  function segGroup(attr, apply) {
    const btns = Array.prototype.slice.call(document.querySelectorAll('[data-' + attr + ']'));
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        btns.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        touched = true;
        apply(b.getAttribute('data-' + attr));
      });
    });
    return function (value) { btns.forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-' + attr) === String(value) ? 'true' : 'false'); }); };
  }
  function backToAlign() { if (st.phase === 'drawn') { st.phase = 'align'; st.meas = null; st.recorded = false; } }
  segGroup('shape', function (x) { st.shape = x; backToAlign(); st.sel = 'eye'; syncBoxes(); relayout(); fixPositions(); });
  segGroup('mat', function (x) { st.mat = x; backToAlign(); syncBoxes(); dataDirty = true; invalidate(); });
  segGroup('dir', function (x) { st.dir = x; backToAlign(); st.sel = 'eye'; invalidate(); emitReverse(); });
  segGroup('res', function (x) {
    st.res = +x;
    if (st.phase === 'drawn' && !st.recorded) { const m = measureNow(); if (m.ok) st.meas = m; }
    invalidate();
  });
  segGroup('err', function (x) { st.err = x === '1'; backToAlign(); invalidate(); });
  segGroup('zoom', function (x) { st.zoom = x; schedule(); });
  segGroup('method', function (x) { st.method = x; dataDirty = true; invalidate(); });
  $('hint').addEventListener('change', function () { st.hint = this.checked; touched = true; schedule(); });
  $('prot').addEventListener('change', function () { st.prot = this.checked; schedule(); });
  const tEl = $('t');
  function readT() { st.t = val(tEl); $('to').textContent = fmtSlider(st.t, tEl) + ' cm'; }
  tEl.addEventListener('input', function () {
    readT(); backToAlign(); touched = true;
    // 長方形的針要留在透明塊外面
    const p = CFG.rect.pins;
    Object.keys(p).forEach(function (id) { if (p[id] && st.shape === 'rect') p[id] = constrain(id, p[id]); });
    if (st.shape === 'rect') CFG.rect.eye = constrain('eye', CFG.rect.eye);
    invalidate();
  });
  function syncBoxes() {
    $('rectBox').hidden = st.shape !== 'rect';
    $('semiBox').hidden = st.shape !== 'semi';
    const hints = {
      water: T('水裝在薄壁的透明盒裡；盒壁很薄，對光路的影響可以忽略。', 'The water is in a thin-walled clear dish; the walls are so thin that their effect on the light can be ignored.'),
      acrylic: T('壓克力（PMMA）磚，光學性質均勻、比玻璃輕。', 'An acrylic (PMMA) block — optically uniform and lighter than glass.'),
      crown: T('冕牌玻璃是常見的光學玻璃（例如 BK7），邊緣略帶綠色。', 'Crown glass is a common optical glass (such as BK7); its edges look slightly green.'),
      unknown: T('折射率保密！做完幾次量測，再按「揭曉」比對你的結果。', 'The refractive index is secret! Take some data, then reveal it to check your result.')
    };
    $('matHint').textContent = hints[st.mat];
  }

  // ---------------- 啟動 ----------------
  function relayout() { layoutMain(); layoutView(); layoutGraph(); VC = null; panelsDirty = true; dataDirty = true; schedule(); }
  /** 紙張範圍改變後，把針與眼睛留在紙上 */
  function fixPositions() {
    const c = cfg();
    Object.keys(c.pins).forEach(function (id) { if (c.pins[id]) c.pins[id] = constrain(id, c.pins[id]); });
    c.eye = constrain('eye', c.eye);
    invalidate();
  }
  if (window.ResizeObserver) {
    let lastW = -1, lastVW = -1, lastGW = -1;
    new ResizeObserver(function () {
      const a = cv.clientWidth, b = vc.clientWidth, g = gc.clientWidth;
      if (a !== lastW || b !== lastVW || g !== lastGW) { lastW = a; lastVW = b; lastGW = g; relayout(); }
    }).observe(document.querySelector('.wrap'));
  } else window.addEventListener('resize', relayout);
  window.addEventListener('lab:themechange', function () { readExtra(); staticLayer = null; dataDirty = true; invalidate(); syncBoxes(); });
  readT();
  syncBoxes();
  relayout();

  // 分享連結：三種裝置各自的針與眼睛位置（形狀、材料等按鈕與滑桿由 classroom.js 自動記錄）
  function shareGet() {
    const r4 = function (p) { return p ? [Math.round(p.x * 1e4) / 1e4, Math.round(p.y * 1e4) / 1e4] : null; };
    const o = {};
    Object.keys(CFG).forEach(function (k) {
      const pins = {};
      Object.keys(CFG[k].pins).forEach(function (id) { pins[id] = r4(CFG[k].pins[id]); });
      o[k] = { e: r4(CFG[k].eye), p: pins };
    });
    return o;
  }
  function shareSet(o) {
    if (!o || typeof o !== 'object') return;
    const ok = function (a) { return Array.isArray(a) && a.length === 2 && typeof a[0] === 'number' && typeof a[1] === 'number' && isFinite(a[0]) && isFinite(a[1]); };
    const keep = { shape: st.shape, dir: st.dir };
    try {
      Object.keys(CFG).forEach(function (k) {
        const q = o[k];
        if (!q || typeof q !== 'object') return;
        st.shape = k === 'rect' ? 'rect' : 'semi'; st.dir = k === 'semiR' ? 'rev' : 'fwd'; VC = null; // constrain() 用這個裝置的規則
        if (ok(q.e)) CFG[k].eye = constrain('eye', v(q.e[0], q.e[1]));
        if (q.p && typeof q.p === 'object') {
          Object.keys(CFG[k].pins).forEach(function (id) {
            if (!(id in q.p)) return;
            const a = q.p[id];
            if (a === null) { CFG[k].pins[id] = null; return; }
            if (!ok(a)) return;
            let pt = constrain(id, v(a[0], a[1]));
            if (k === 'semiF' && id === 'P') MARKS.forEach(function (m) { if (C.len(C.sub(pt, m)) < 1e-3) pt = v(m.x, m.y); });
            CFG[k].pins[id] = pt;
          });
        }
      });
    } finally { st.shape = keep.shape; st.dir = keep.dir; VC = null; }
    backToAlign();
    st.sel = 'eye';
    invalidate();
  }
  function regShare() {
    if (!window.LabShare) return false;
    window.LabShare.register({ get: shareGet, set: shareSet });
    return true;
  }
  if (!regShare()) window.addEventListener('load', regShare);

  // 測試用（Playwright 與任務證明）：讀取狀態、直接放針
  window.__ri = {
    st: st, CFG: CFG, views: views, alignInfo: alignInfo, measureNow: measureNow, groupStats: groupStats, block: block, nNow: nNow,
    place: function (id, p) { touched = true; if (id === 'eye') cfg().eye = p; else cfg().pins[id] = p; invalidate(); }
  };
})();
