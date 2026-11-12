/* microwave.js — 「認識電磁波（微波實驗）」的畫面與互動（物理計算在 microwave-core.js） */
(function () {
  'use strict';
  const C = window.MicrowaveCore;
  const D = window.LabDraw;
  const K = C.KIT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const DEG = Math.PI / 180;
  const FONT = D.FONT;
  const clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  const reduced = D.reducedMotion();
  const MODES = ['reflect', 'refract', 'standing', 'polar'];
  const OMEGA = 2 * Math.PI / 1.3;      // 畫面上的波動：每 1.3 s 一個週期（真實的 10 GHz 放慢約一百億倍）
  const FS = K.meterFS;                 // 電表滿刻度 1.0 mA
  const GRID_F = [0.3, 0.7];            // 偏極柵放在兩喇叭之間的位置（距離的比例）

  // ---------------- 亂數（未知頻率、未知材料、系統誤差） ----------------
  function mulberry(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry(((Date.now() & 0xffffffff) ^ Math.floor(Math.random() * 4294967296)) >>> 0);

  // ---------------- 狀態 ----------------
  const st = {
    mode: 'reflect', err: false, freq: '10.525', waves: !reduced,
    sens: { reflect: 1, refract: 1, standing: 1, polar: 1 },
    plate: false, thetaI: 20, psiR: 180,
    mat: 'polystyrene', psiP: 180,
    s: 40, N: 5, pending: null,
    d: 55, g1on: false, g1: 0, g2on: false, g2: 0, rx: 0,
    rows: { reflect: [], refract: [], standing: [], polar: [] },
    trace: { reflect: null, refract: null, standing: null, polar: null },
    revealed: { f: false, n: false },
    aligned: false, refractSeen: false, standMoved: false, polarAdj: false,
    fU: 10, nU: 1.5, tilt: 0, noisePh: [0, 0, 0, 0, 0, 0, 0, 0],
    needle: 0, over: false, tWave: 0, flash: 0, status: '', statusUntil: 0
  };
  function randomize() {
    st.fU = 8.8 + rand() * 2.8;                                   // 8.8–11.6 GHz
    st.nU = 1.40 + rand() * 0.22;                                 // 1.40–1.62
    st.tilt = (rand() < 0.5 ? -1 : 1) * (0.8 + rand() * 1.2);     // 發射器沒對準 0.8°–2.0°
    for (let i = 0; i < 8; i++) st.noisePh[i] = rand() * 2 * Math.PI;
  }
  randomize();

  // ---------------- 物理量 ----------------
  function fNow() { return st.freq === 'unknown' ? st.fU : +st.freq; }
  function lamNow() { return C.lambdaCm(fNow()); }
  function hpbwNow() { return K.hpbw * lamNow() / C.lambdaCm(K.fGHz); }   // 喇叭的波束寬度 ∝ λ
  function tiltNow() { return st.err ? st.tilt : 0; }
  function nNow() { return st.mat === 'unknown' ? st.nU : C.MATERIALS[st.mat]; }
  function fKnown() { return st.freq !== 'unknown' || st.revealed.f; }
  function nKnown() { return st.mat !== 'unknown' || st.revealed.n; }
  function reflectP(psi) { return { thetaI: st.thetaI, psi: psi == null ? st.psiR : psi, plate: st.plate, tilt: tiltNow(), lam: lamNow(), hpbw: hpbwNow() }; }
  function refractP(psi) { return { n: nNow(), A: K.prismA, psi: psi == null ? st.psiP : psi, lam: lamNow(), tilt: tiltNow() }; }
  function standP() { return { lam: lamNow(), tilt: tiltNow(), hpbw: hpbwNow() }; }
  let standCache = { key: '', pp: null };
  function standPP() {
    const p = standP(), key = p.lam + '|' + p.tilt + '|' + p.hpbw;
    if (standCache.key !== key) standCache = { key: key, pp: C.platePrep(C.standingScene(p)) };
    return standCache.pp;
  }
  function polarP() {
    return { g1: { on: st.g1on, ang: st.g1 }, g2: { on: st.g2on, ang: st.g2 }, rx: st.rx, d: st.d, lam: lamNow(),
      leak: st.err ? 0.04 : 0, tPerp: st.err ? 0.96 : 1 };
  }
  function signalS() {
    switch (st.mode) {
      case 'reflect': return C.reflectSignal(reflectP());
      case 'refract': return C.refractSignal(refractP());
      case 'standing': return C.standingSignal(standP(), st.s, 0, standPP());
      default: return C.polarSignal(polarP()).S;
    }
  }
  let sigMemo = { key: '', S: 0 };
  function sigKey() {
    return [st.mode, st.freq, st.fU, st.err, st.tilt, st.plate, st.thetaI, st.psiR, st.mat, st.nU, st.psiP, st.s, st.d, st.g1on, st.g1, st.g2on, st.g2, st.rx].join('|');
  }
  function S() { const k = sigKey(); if (k !== sigMemo.key) sigMemo = { key: k, S: signalS() }; return sigMemo.S; }
  function readingTrue() { return C.meter(S(), st.sens[st.mode], st.mode); }
  /** 緩慢變化的雜訊（含誤差模式）：相對 ±1.5%、零點 ±0.004 mA */
  function noise(t) {
    const p = st.noisePh;
    const a = (Math.sin(2.1 * t + p[0]) + 0.7 * Math.sin(5.3 * t + p[1]) + 0.5 * Math.sin(11.7 * t + p[2]) + 0.35 * Math.sin(17.9 * t + p[3])) / 1.45;
    const b = (Math.sin(3.7 * t + p[4]) + 0.6 * Math.sin(9.1 * t + p[5]) + 0.4 * Math.sin(23.3 * t + p[6])) / 1.25;
    return [a, b];
  }
  function readingAt(t) {
    let I = readingTrue();
    if (st.err) { const n = noise(t); I = I * (1 + 0.015 * n[0]) + 0.004 * n[1]; }
    return Math.max(0, I);
  }
  const now = function () { return (window.performance ? performance.now() : Date.now()) / 1000; };
  /** 接收器（相位中心）在反射實驗的位置；是否在金屬板的幾何影子裡 */
  function rxPos(psi) { return { x: -K.arm * Math.cos(psi * DEG), y: K.arm * Math.sin(psi * DEG) }; }
  function inShadow() {
    if (st.mode !== 'reflect' || !st.plate) return false;
    const r = rxPos(st.psiR), a = { x: -K.arm, y: 0 };
    const th = st.thetaI * DEG, tx = Math.sin(th), ty = Math.cos(th), hw = K.plateW / 2;
    // 線段 T→R 與金屬板（過 O、方向 (sin θi, cos θi)、長 25 cm）是否相交
    const dx = r.x - a.x, dy = r.y - a.y, den = dx * ty - dy * tx;
    if (Math.abs(den) < 1e-9) return false;
    const u = ((0 - a.x) * ty - (0 - a.y) * tx) / den;          // 沿 T→R 的比例
    const v = ((0 - a.x) * dy - (0 - a.y) * dx) / den;          // 沿板的距離（cm）
    return u > 0 && u < 1 && Math.abs(v) <= hw;
  }

  // ---------------- 數字格式 ----------------
  const minus = function (s) { return String(s).replace(/^-/, '−'); };
  const fsg = function (x, d) { return isFinite(x) ? (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d) : '—'; };
  const fPct = function (p) { return isFinite(p) ? fsg(p, Math.abs(p) < 10 ? 2 : 1) + '%' : '—'; };
  const round = function (x, d) { const p = Math.pow(10, d); return Math.round(x * p) / p; };

  // ---------------- 顏色 ----------------
  function metal() { return D.mix(D.c.muted, D.c['canvas-bg'], D.dark ? 0.25 : 0.42); }
  function txColor() { return D.c.equi; }
  function rxColor() { return D.c.neg; }
  function matColor() { return st.mat === 'paraffin' ? D.c.equi : st.mat === 'unknown' ? D.c.muted : D.c.neg; }
  let LUT = null;
  function buildLUT() {
    LUT = new Uint8ClampedArray(513 * 4);
    const p = D.rgb(D.c.pos), n = D.rgb(D.c.neg), amax = D.dark ? 0.9 : 0.8;
    for (let i = 0; i <= 512; i++) {
      const v = i / 256 - 1, a = Math.pow(Math.abs(v), 0.9) * amax, c = v >= 0 ? p : n;
      LUT[i * 4] = c[0]; LUT[i * 4 + 1] = c[1]; LUT[i * 4 + 2] = c[2]; LUT[i * 4 + 3] = Math.round(a * 255);
    }
  }

  // ---------------- 主畫布版面 ----------------
  const BOX = {
    reflect: { x0: -46, x1: 46, y0: -17, y1: 46 },
    refract: { x0: -46, x1: 46, y0: -17, y1: 46 },
    standing: { x0: -13, x1: 80, y0: -14.8, y1: 14.2 },
    polar: { x0: -23, x1: 94, y0: -14.8, y1: 14.2 }
  };
  const cv = $('cv'), ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, sc = 5, ox = 0, oy = 0, sceneH = 0, stripH = 0, topH = 0;
  function layoutMain() {
    W = cv.clientWidth || 360;
    const b = BOX[st.mode], bw = b.x1 - b.x0, bh = b.y1 - b.y0, pad = 10;
    topH = st.mode === 'standing' ? Math.round(clamp(W * 0.24, 104, 150)) : st.mode === 'polar' ? Math.round(clamp(W * 0.3, 128, 172)) : 0;
    const maxH = st.mode === 'reflect' || st.mode === 'refract' ? 470 : 250;
    sc = Math.min((W - 2 * pad) / bw, maxH / bh);
    ox = (W - bw * sc) / 2 - b.x0 * sc;
    oy = topH + pad + b.y1 * sc;
    sceneH = Math.round(topH + 2 * pad + bh * sc);
    stripH = Math.round(clamp(W * 0.24, 112, 140));
    H = sceneH + stripH;
    if (Math.abs(cv.clientHeight - H) > 0.5) cv.style.height = H + 'px';
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    staticLayer = null;
  }
  const X = function (x) { return ox + x * sc; };
  const Y = function (y) { return oy - y * sc; };
  const WX = function (px) { return (px - ox) / sc; };
  const WY = function (py) { return (oy - py) / sc; };
  const fpx = function (px, w) { return (w || 600) + ' ' + Math.round(px * 10) / 10 + 'px ' + FONT; };

  // ---------------- 電場的圖（複數振幅的格點；每一幀只換相位） ----------------
  let fmap = null, fjob = null;
  const ZERO = [0, 0];
  /** 電場圖的範圍：畫面看得到的整個區域（cm，取到 0.5 cm） */
  function viewBox() {
    const r = function (v) { return Math.round(v * 2) / 2; };
    return { x0: r(WX(0)) - 0.5, x1: r(WX(W)) + 0.5, y0: r(WY(sceneH)) - 0.5, y1: r(WY(topH)) + 0.5 };
  }
  function fieldSpec() {
    const lam = lamNow(), k = 2 * Math.PI / lam, cell = lam / 5.5, tilt = tiltNow(), vb = viewBox(), vk = [vb.x0, vb.x1, vb.y0, vb.y1].join(',');
    if (st.mode === 'reflect') {
      const g = C.reflectGeom(reflectP());
      const scn = { lam: lam, tx: g.tx, plate: g.plate }, pp = g.plate ? C.platePrep(scn) : null;
      return { key: ['R', lam, st.thetaI, st.plate, tilt, vk].join('|'), box: vb, cell: cell, ref: 1 / 26,
        fn: function (x, y) { return C.field(scn, x, y, pp); } };
    }
    if (st.mode === 'refract') {
      const n = nNow(), pa = C.prismAperture(refractP()), gm = C.refractGeom(K.prismA), tA = Math.tan(K.prismA * DEG);
      const pre = Math.SQRT1_2 * Math.sqrt(1 / lam), t1 = 2 / (1 + n), tau = tilt * DEG, cin = Math.cos(Math.asin(Math.sin(tau) / n));
      return { key: ['P', lam, n, tilt, vk].join('|'), box: vb, cell: cell, ref: 0.62,
        fn: function (x, y) {
          if (x < gm.xF) return ZERO;
          const xh = gm.xF + (y + gm.H / 2) * tA;
          if (y >= -gm.H / 2 && y <= gm.H / 2 && x <= xh) {          // 稜鏡內：準直的平面波
            if (Math.abs(y) >= K.mouthW / 2) return ZERO;
            const a = Math.cos(Math.PI * y / K.mouthW) * t1, ph = n * k * cin * (x - gm.xF) + k * Math.sin(tau) * y;
            return [a * Math.cos(ph), a * Math.sin(ph)];
          }
          if (!pa) return ZERO;
          const e = C.prismField(pa, x, y);                          // × e^{−iπ/4}/√λ（與開口上的場銜接）
          return [pre * (e[0] + e[1]), pre * (e[1] - e[0])];
        } };
    }
    if (st.mode === 'standing') {
      const p = standP(), scn = C.standingScene(p), pp = standPP();
      return { key: ['S', lam, tilt, vk].join('|'), box: vb, cell: cell, ref: 1 / 32,
        fn: function (x, y) { return (x < K.txS - 0.3 || x > K.plateS) ? ZERO : C.field(scn, x, y, pp); } };
    }
    const pr = polarP(), ch = C.polarSignal(pr).chain, hp = hpbwNow();
    const m1 = Math.hypot(ch[1][0], ch[1][1]), m2 = Math.hypot(ch[2][0], ch[2][1]);
    const xg1 = GRID_F[0] * st.d, xg2 = GRID_F[1] * st.d, xt = -K.pc;
    return { key: ['G', lam, st.d, m1, m2, vk].join('|'), box: vb, cell: cell, ref: 1 / 26,
      fn: function (x, y) {
        if (x > st.d || x < xt) return ZERO;
        const dx = x - xt, r = Math.max(0.3, Math.hypot(dx, y));
        const a = C.hornAmp(Math.atan2(y, dx), hp) / r * (x < xg1 ? 1 : x < xg2 ? m1 : m2);
        return [a * Math.cos(k * r), a * Math.sin(k * r)];
      } };
  }
  function ensureField() {
    const spec = fieldSpec();
    if (fmap && fmap.key === spec.key) { fjob = null; return; }
    if (fjob && fjob.key === spec.key) return;
    const b = spec.box, cell = spec.cell;
    const nx = Math.ceil((b.x1 - b.x0) / cell), ny = Math.ceil((b.y1 - b.y0) / cell);
    fjob = { key: spec.key, mode: st.mode, spec: spec, nx: nx, ny: ny, x0: b.x0, y1: b.y1, cell: cell,
      re: new Float32Array(nx * ny), im: new Float32Array(nx * ny), row: 0 };
    if (!fmap || fmap.mode !== st.mode) stepField(600);            // 換實驗時先同步算完（舊圖不能用）
  }
  function stepField(budget) {
    const j = fjob;
    if (!j) return;
    const t0 = performance.now(), fn = j.spec.fn, g = 1.7 / j.spec.ref;
    while (j.row < j.ny) {
      const y = j.y1 - (j.row + 0.5) * j.cell;
      let o = j.row * j.nx;
      for (let i = 0; i < j.nx; i++, o++) {
        const e = fn(j.x0 + (i + 0.5) * j.cell, y);
        j.re[o] = e[0] * g; j.im[o] = e[1] * g;
      }
      j.row++;
      if (performance.now() - t0 > budget) break;
    }
    if (j.row >= j.ny) {
      const c = document.createElement('canvas');
      c.width = j.nx; c.height = j.ny;
      const g2 = c.getContext('2d');
      fmap = { key: j.key, mode: j.mode, nx: j.nx, ny: j.ny, x0: j.x0, y1: j.y1, cell: j.cell, re: j.re, im: j.im,
        cv: c, g: g2, img: g2.createImageData(j.nx, j.ny), tPainted: NaN };
      fjob = null;
    }
  }
  function paintField(t) {
    if (!fmap || !LUT) return;
    if (fmap.tPainted === t) return;
    fmap.tPainted = t;
    const c = Math.cos(OMEGA * t), s = Math.sin(OMEGA * t);
    const d = fmap.img.data, re = fmap.re, im = fmap.im, L = LUT;
    for (let i = 0, n = re.length; i < n; i++) {
      let v = re[i] * c + im[i] * s;
      v = v / (1 + (v < 0 ? -v : v));                               // 柔和壓縮：弱的波也看得到
      const q = ((v + 1) * 256 + 0.5) | 0, o = i * 4, p = q * 4;
      d[o] = L[p]; d[o + 1] = L[p + 1]; d[o + 2] = L[p + 2]; d[o + 3] = L[p + 3];
    }
    fmap.g.putImageData(fmap.img, 0, 0);
  }
  function drawField(g) {
    if (!fmap || fmap.mode !== st.mode) return;
    g.save();
    g.beginPath();
    if (st.mode === 'standing' || st.mode === 'polar') g.rect(0, topH, W, Y(-9.2) - topH); else g.rect(0, topH, W, sceneH - topH);
    g.clip();
    g.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in g) g.imageSmoothingQuality = 'high';
    g.drawImage(fmap.cv, X(fmap.x0), Y(fmap.y1), fmap.nx * fmap.cell * sc, fmap.ny * fmap.cell * sc);
    g.restore();
  }

  // 駐波：軸上的場（放大鏡用），每 0.02 cm 一點
  let axial = { key: '', re: null, im: null, x0: 0, dx: 0.02, n: 0 };
  function axialField() {
    const p = standP(), key = p.lam + '|' + p.tilt;
    if (axial.key === key) return axial;
    const scn = C.standingScene(p), pp = standPP(), x0 = K.txS, x1 = K.plateS, dx = 0.02, n = Math.round((x1 - x0) / dx) + 1;
    const re = new Float32Array(n), im = new Float32Array(n);
    for (let i = 0; i < n; i++) { const e = C.field(scn, x0 + i * dx, 0, pp); re[i] = e[0]; im[i] = e[1]; }
    axial = { key: key, re: re, im: im, x0: x0, dx: dx, n: n };
    return axial;
  }

  // ---------------- 靜態圖層 ----------------
  let staticLayer = null, staticKey = '';
  function buildStatic() {
    const key = [st.mode, W, H, dpr, D.ver, sc].join('|');
    if (staticLayer && staticKey === key) return staticLayer;
    const c = document.createElement('canvas');
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.backdrop(g, W, sceneH);
    D.grid(g, 0, topH, W, sceneH, 10 * sc, 5 * sc, ox, oy);
    if (st.mode === 'reflect' || st.mode === 'refract') { drawArm(g, 180, 46); drawDisc(g); }
    else drawRuler(g);
    // 儀器列的底
    const sg = g.createLinearGradient(0, sceneH, 0, H);
    sg.addColorStop(0, D.mix(D.c.surface, D.c['canvas-bg'], 0.3));
    sg.addColorStop(1, D.mix(D.c.surface, D.c.bg, 0.5));
    g.fillStyle = sg; g.fillRect(0, sceneH, W, stripH);
    g.fillStyle = D.alpha(D.c.text, D.dark ? 0.16 : 0.1); g.fillRect(0, sceneH, W, 1);
    staticLayer = c; staticKey = key;
    return c;
  }
  /** 角度計的臂（鋁軌，附公分刻度）。ang：數學角（度） */
  function drawArm(g, ang, len) {
    const w = 3 * sc;
    g.save();
    g.translate(X(0), Y(0));
    g.rotate(-ang * DEG);
    D.block(g, 0, -w / 2, len * sc, w, metal(), { r: Math.min(4, 0.6 * sc) });
    g.beginPath();
    for (let cm = 2; cm <= len - 1; cm++) {
      const x = cm * sc, major = cm % 5 === 0;
      if (!major && sc < 4.5) continue;
      g.moveTo(x, -w / 2 + 1); g.lineTo(x, -w / 2 + 1 + (major ? 0.42 : 0.22) * w);
    }
    g.strokeStyle = D.alpha(D.c.text, D.dark ? 0.5 : 0.45); g.lineWidth = 1; g.stroke();
    if (sc >= 6.5) {
      g.font = fpx(Math.min(10, sc * 1.25), 500); g.fillStyle = D.alpha(D.c.text, 0.6); g.textAlign = 'center'; g.textBaseline = 'middle';
      const flip = Math.cos(ang * DEG) < -0.01;
      for (let cm = 10; cm <= len - 4; cm += 10) {
        g.save(); g.translate(cm * sc, w * 0.22); if (flip) g.rotate(Math.PI);
        g.fillText(String(cm), 0, 0); g.restore();
      }
    }
    g.restore();
  }
  /** 角度計的刻度盤（上半圈標 ψ）與中央轉台 */
  function drawDisc(g) {
    const R = 12 * sc, cx = X(0), cy = Y(0);
    g.save();
    g.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : D.alpha(D.c.text, 0.22); g.shadowBlur = 10; g.shadowOffsetY = 2;
    const rg = g.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    rg.addColorStop(0, D.mix(D.c.surface, D.c['canvas-bg'], 0.1));
    rg.addColorStop(1, D.mix(D.c.surface, D.c.text, D.dark ? 0.08 : 0.07));
    g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.fill();
    g.restore();
    g.strokeStyle = D.alpha(D.c.text, 0.28); g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.stroke();
    g.beginPath();
    for (let p = 0; p <= 180; p += 5) {
      const a = (180 - p) * DEG, L = (p % 30 === 0 ? 1.7 : p % 10 === 0 ? 1.1 : 0.6) * sc;
      g.moveTo(cx + (R - L) * Math.cos(a), cy - (R - L) * Math.sin(a)); g.lineTo(cx + R * Math.cos(a), cy - R * Math.sin(a));
    }
    g.strokeStyle = D.alpha(D.c.text, 0.55); g.lineWidth = 1; g.stroke();
    g.font = fpx(clamp(sc * 1.7, 8, 11), 600); g.fillStyle = D.alpha(D.c.text, 0.72); g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let p = 0; p <= 180; p += 30) {
      const a = (180 - p) * DEG, r = R - 3.1 * sc;
      g.fillText(String(p), cx + r * Math.cos(a), cy - r * Math.sin(a));
    }
    // 中央轉台
    const r2 = 6.6 * sc;
    const tg = g.createRadialGradient(cx - r2 * 0.3, cy - r2 * 0.3, r2 * 0.1, cx, cy, r2);
    tg.addColorStop(0, D.shade(metal(), 0.3)); tg.addColorStop(1, metal());
    g.fillStyle = tg; g.beginPath(); g.arc(cx, cy, r2, 0, 2 * Math.PI); g.fill();
    g.strokeStyle = D.alpha(D.c.text, 0.3); g.stroke();
  }
  /** 實驗三、四：光具座（軌道）與公分尺 */
  function drawRuler(g) {
    const b = BOX[st.mode], y0 = -12.6, y1 = -14.6;
    const xa = st.mode === 'standing' ? -12 : -22, xb = st.mode === 'standing' ? 79 : 93;
    // 軌道
    D.block(g, X(xa), Y(-9.2), (xb - xa) * sc, 3.2 * sc, metal(), { r: 3 });
    // 尺
    const rx0 = X(st.mode === 'standing' ? 0 : -20), rx1 = X(st.mode === 'standing' ? 80 : 92);
    D.block(g, rx0, Y(y0), rx1 - rx0, (y0 - y1) * sc, D.mix(D.c.equi, D.c['canvas-bg'], D.dark ? 0.62 : 0.78), { r: 2, shadow: true });
    g.beginPath();
    const a = st.mode === 'standing' ? 0 : -20, z = st.mode === 'standing' ? 80 : 92;
    for (let cm = a; cm <= z; cm++) {
      const x = X(cm) + 0.5, L = (cm % 10 === 0 ? 0.62 : cm % 5 === 0 ? 0.45 : 0.28) * (y0 - y1) * sc;
      if (cm % 5 !== 0 && sc < 3.2) continue;
      g.moveTo(x, Y(y0)); g.lineTo(x, Y(y0) + L);
    }
    g.strokeStyle = D.alpha(D.c.text, 0.6); g.lineWidth = 1; g.stroke();
    g.font = fpx(clamp(sc * 1.35, 8, 10.5), 600); g.fillStyle = D.alpha(D.c.text, 0.75); g.textAlign = 'center'; g.textBaseline = 'bottom';
    for (let cm = a; cm <= z; cm += 10) g.fillText(String(cm), X(cm), Y(y1) - 1);
    void b;
  }

  // ---------------- 器材 ----------------
  /** 喇叭天線（俯視）：(pcx, pcy) 相位中心、a 朝向（數學角，弧度）、kind 'tx' | 'rx' */
  function drawHorn(g, pcx, pcy, a, kind) {
    const ux = Math.cos(a), uy = Math.sin(a), mx = pcx + K.pc * ux, my = pcy + K.pc * uy;
    const L = K.hornLen * sc, hw = K.mouthW / 2 * sc, tw = 1.25 * sc, bL = K.boxL * sc, bw = K.boxW / 2 * sc;
    const body = kind === 'tx' ? txColor() : rxColor(), m = metal();
    g.save();
    g.translate(X(mx), Y(my));
    g.rotate(-a);
    // 盒子（耿氏振盪器／檢波器）
    D.block(g, -L - bL, -bw, bL, 2 * bw, D.mix(body, D.c['canvas-bg'], D.dark ? 0.25 : 0.12), { r: Math.min(5, 0.7 * sc) });
    // 喇叭：頂面梯形＋側壁
    g.save();
    g.shadowColor = D.dark ? 'rgba(0,0,0,0.45)' : D.alpha(D.c.text, 0.2); g.shadowBlur = 6; g.shadowOffsetY = 2;
    g.beginPath(); g.moveTo(-L, -tw); g.lineTo(0, -hw); g.lineTo(0, hw); g.lineTo(-L, tw); g.closePath();
    const hg = g.createLinearGradient(0, -hw, 0, hw);
    hg.addColorStop(0, D.shade(m, 0.32)); hg.addColorStop(0.45, D.shade(m, 0.08)); hg.addColorStop(1, D.shade(m, -0.22));
    g.fillStyle = hg; g.fill();
    g.restore();
    g.strokeStyle = D.alpha(D.shade(m, -0.5), 0.75); g.lineWidth = 1;
    g.beginPath(); g.moveTo(-L, -tw); g.lineTo(0, -hw); g.lineTo(0, hw); g.lineTo(-L, tw); g.closePath(); g.stroke();
    // 內壁（看得到開口裡面一點點）
    g.beginPath(); g.moveTo(-L + 0.6 * sc, -tw * 0.55); g.lineTo(-0.15 * sc, -hw + 0.5 * sc);
    g.moveTo(-L + 0.6 * sc, tw * 0.55); g.lineTo(-0.15 * sc, hw - 0.5 * sc);
    g.strokeStyle = D.alpha(D.shade(m, 0.6), D.dark ? 0.3 : 0.55); g.stroke();
    // 開口的邊（高光）
    g.fillStyle = D.shade(m, D.dark ? 0.2 : 0.45); g.fillRect(-Math.max(1.5, 0.35 * sc), -hw, Math.max(1.5, 0.35 * sc), 2 * hw);
    // 盒子上的指示燈（發射器）或接頭（接收器）
    if (kind === 'tx') { D.ball(g, -L - bL * 0.75, 0, Math.max(2, 0.55 * sc), D.c.pos, { glow: D.dark ? 0.5 : 0.25, shadow: false }); }
    else { D.ball(g, -L - bL * 0.75, 0, Math.max(2, 0.5 * sc), D.mix(D.c.text, D.c['canvas-bg'], 0.4), { shadow: false }); }
    g.restore();
  }
  /** 標籤：放在世界座標 (wx, wy) 的位置（底框的底邊），自動留在畫面內 */
  function label(g, text, wx, wy, color) {
    g.font = '600 12px ' + FONT;
    const w = g.measureText(text).width + 12;
    const px = clamp(X(wx), w / 2 + 3, W - w / 2 - 3);
    const py = clamp(Y(wy), topH + 20, sceneH - 3);
    return D.pill(g, text, px, py, color, 'center');
  }
  /** 金屬板（俯視）：中心 (cx, cy)、法線 (nx, ny)、寬 w */
  function drawPlate(g, cx, cy, nx, ny, w) {
    const tx = -ny, ty = nx, L = w * sc, th = Math.max(3.5, 0.6 * sc), m = metal();
    g.save();
    g.translate(X(cx), Y(cy));
    g.rotate(-Math.atan2(ty, tx));
    g.save();
    g.shadowColor = D.dark ? 'rgba(0,0,0,0.55)' : D.alpha(D.c.text, 0.3); g.shadowBlur = 8; g.shadowOffsetY = 3;
    const pg = g.createLinearGradient(-L / 2, 0, L / 2, 0);
    pg.addColorStop(0, D.shade(m, -0.15)); pg.addColorStop(0.3, D.shade(m, 0.5)); pg.addColorStop(0.55, D.shade(m, 0.1));
    pg.addColorStop(0.8, D.shade(m, 0.4)); pg.addColorStop(1, D.shade(m, -0.1));
    g.fillStyle = pg; g.fillRect(-L / 2, -th / 2, L, th);
    g.restore();
    g.strokeStyle = D.alpha(D.shade(m, -0.55), 0.8); g.lineWidth = 1; g.strokeRect(-L / 2, -th / 2, L, th);
    // 支撐座
    D.block(g, -1.6 * sc, -th / 2 - 1.1 * sc, 3.2 * sc, th + 2.2 * sc, D.shade(m, -0.25), { r: 2, shadow: false });
    g.restore();
  }
  function arcMath(g, cx, cy, r, a0, a1) { g.beginPath(); g.arc(cx, cy, r, -a0, -a1, a1 > a0); }
  function angleArc(g, r, a0, a1, color, name, sub, lr) {
    const cx = X(0), cy = Y(0);
    g.save();
    g.strokeStyle = color; g.lineWidth = 2; g.lineCap = 'round';
    arcMath(g, cx, cy, r * sc, a0 * DEG, a1 * DEG); g.stroke();
    g.restore();
    const am = (a0 + a1) / 2 * DEG, rr = (lr || r + 2.6) * sc;
    D.vecLabel(g, name, sub, cx + rr * Math.cos(am), cy - rr * Math.sin(am), color);
  }
  function dashed(g, x0, y0, x1, y1, color, w, dash) {
    g.save(); g.setLineDash(dash || [5, 4]); g.strokeStyle = color; g.lineWidth = w || 1.3;
    g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke(); g.restore();
  }

  // ---------------- 各實驗的畫面 ----------------
  function drawReflect(g) {
    const psi = st.psiR, th = st.thetaI, rx = rxPos(psi);
    if (st.plate) {
      const nx = -Math.cos(th * DEG), ny = Math.sin(th * DEG);
      dashed(g, 0, 0, nx * 21, ny * 21, D.alpha(D.c.text, 0.55), 1.2, [4, 4]);
      drawPlate(g, 0, 0, nx, ny, K.plateW);
    }
    drawHorn(g, -K.arm, 0, tiltNow() * DEG, 'tx');
    drawHorn(g, rx.x, rx.y, -psi * DEG, 'rx');
    // 中心線與角度
    dashed(g, -K.arm + K.pc, 0, -1, 0, D.alpha(txColor(), 0.85), 1.4, [6, 4]);
    const ra = (180 - psi) * DEG;
    dashed(g, 1.2 * Math.cos(ra), 1.2 * Math.sin(ra), (K.arm - K.pc) * Math.cos(ra), (K.arm - K.pc) * Math.sin(ra), D.alpha(rxColor(), 0.85), 1.4, [6, 4]);
    if (st.plate) {
      angleArc(g, 8.5, 180 - th, 180, txColor(), 'θ', 'i');
      const a0 = 180 - psi, a1 = 180 - th;
      if (Math.abs(a1 - a0) > 0.3) angleArc(g, 10.5, Math.min(a0, a1), Math.max(a0, a1), rxColor(), 'θ', 'r', 13);
      const e = { x: Math.sin(th * DEG) * 13.6, y: Math.cos(th * DEG) * 13.6 };
      if (sc >= 5) label(g, T('金屬板', 'Metal plate'), e.x + 2, e.y + 3, D.c.muted);
    }
    psiPointer(g, psi);
    label(g, T('發射器', 'Transmitter'), -37.5, -6, txColor());
    rxLabel(g, psi);
  }
  /** 接收器的標籤：放在接收臂外側 */
  function rxLabel(g, psi) {
    const ux = -Math.cos(psi * DEG), uy = Math.sin(psi * DEG), px = Math.sin(psi * DEG), py = Math.cos(psi * DEG);
    label(g, T('接收器', 'Receiver'), 37.5 * ux + 7.5 * px, 37.5 * uy + 7.5 * py + 1.2, rxColor());
  }
  /** 可動臂的指標與 ψ 讀數 */
  function psiPointer(g, psi) {
    const a = (180 - psi) * DEG, R = 12 * sc, cx = X(0), cy = Y(0);
    g.save(); g.translate(cx + (R + 0.4) * Math.cos(a), cy - (R + 0.4) * Math.sin(a)); g.rotate(-a);
    g.beginPath(); g.moveTo(-0.2 * sc, 0); g.lineTo(1.9 * sc, -1.1 * sc); g.lineTo(1.9 * sc, 1.1 * sc); g.closePath();
    g.fillStyle = D.c.accent; g.fill(); g.restore();
    const lr = 17.5, side = psi > 165 ? -1 : 1, la = a + side * (psi > 165 ? 16 : 12) * DEG;
    label(g, 'ψ = ' + psi.toFixed(1) + '°', lr * Math.cos(la), lr * Math.sin(la) + (psi > 165 ? -2 : 0), D.c.accent);
  }
  function drawRefract(g) {
    const psi = st.psiP, gm = C.refractGeom(K.prismA), A = K.prismA, rx = rxPos(psi), pts = gm.pts;
    // 稜鏡（半透明）
    g.save();
    g.beginPath(); g.moveTo(X(pts[0].x), Y(pts[0].y)); g.lineTo(X(pts[1].x), Y(pts[1].y)); g.lineTo(X(pts[2].x), Y(pts[2].y)); g.closePath();
    g.shadowColor = D.dark ? 'rgba(0,0,0,0.4)' : D.alpha(D.c.text, 0.18); g.shadowBlur = 10; g.shadowOffsetY = 3;
    const mc = matColor(), pg = g.createLinearGradient(X(pts[0].x), Y(pts[1].y), X(pts[2].x), Y(pts[0].y));
    pg.addColorStop(0, D.alpha(D.mix(mc, '#ffffff', 0.75), D.dark ? 0.32 : 0.5)); pg.addColorStop(1, D.alpha(D.mix(mc, '#ffffff', 0.45), D.dark ? 0.2 : 0.36));
    g.fillStyle = pg; g.fill();
    g.restore();
    g.save();
    g.beginPath(); g.moveTo(X(pts[0].x), Y(pts[0].y)); g.lineTo(X(pts[1].x), Y(pts[1].y)); g.lineTo(X(pts[2].x), Y(pts[2].y)); g.closePath();
    g.strokeStyle = D.alpha(D.shade(mc, D.dark ? 0.3 : -0.2), 0.85); g.lineWidth = 1.6; g.stroke();
    // 斜面上的高光
    g.beginPath(); g.moveTo(X(pts[0].x) + 2, Y(pts[0].y) - 3); g.lineTo(X(pts[2].x) - 3, Y(pts[2].y) + 1.5);
    g.strokeStyle = D.alpha('#ffffff', D.dark ? 0.18 : 0.6); g.lineWidth = 1.2; g.stroke();
    g.restore();
    // 頂角 A
    g.save(); g.strokeStyle = D.alpha(D.c.text, 0.7); g.lineWidth = 1.2;
    arcMath(g, X(pts[0].x), Y(pts[0].y), 3.4 * sc, (90 - A) * DEG, 90 * DEG); g.stroke(); g.restore();
    D.haloText(g, 'A = 30°', X(pts[0].x) + 3.2 * sc, Y(pts[0].y) - 5.4 * sc, D.c.text, 'left', 'middle', fpx(11.5, 600));
    // 法線、中心線
    const nxo = Math.cos(A * DEG), nyo = -Math.sin(A * DEG);
    dashed(g, -nxo * 7, -nyo * 7, nxo * 14, nyo * 14, D.alpha(D.c.text, 0.55), 1.2, [4, 4]);
    dashed(g, gm.xF, 0, -0.6, 0, D.alpha(txColor(), 0.85), 1.4, [6, 4]);
    const ra = (180 - psi) * DEG;
    dashed(g, 1.2 * Math.cos(ra), 1.2 * Math.sin(ra), (K.arm - K.pc) * Math.cos(ra), (K.arm - K.pc) * Math.sin(ra), D.alpha(rxColor(), 0.85), 1.4, [6, 4]);
    drawHorn(g, gm.xF - K.pc, 0, tiltNow() * DEG, 'tx');
    drawHorn(g, rx.x, rx.y, -psi * DEG, 'rx');
    angleArc(g, 3.4, 180 - A, 180, txColor(), 'θ', '1', 2.2);
    angleArc(g, 9.5, -A, 180 - psi, rxColor(), 'θ', '2', 12.4);
    psiPointer(g, psi);
    const mname = st.mat === 'polystyrene' ? T('聚苯乙烯稜鏡', 'Polystyrene prism') : st.mat === 'paraffin' ? T('石蠟稜鏡', 'Paraffin prism') : T('未知材料稜鏡', 'Unknown prism');
    label(g, mname, 1.5, -14.6, D.c.muted);
    label(g, T('發射器', 'Transmitter'), -20.7, -6, txColor());
    rxLabel(g, psi);
  }
  function drawStanding(g, t) {
    drawHorn(g, K.txS - K.pc, 0, tiltNow() * DEG, 'tx');
    drawPlate(g, K.plateS + 0.3, 0, -1, 0, K.plateW);
    // 探針：側邊的細桿＋頂端的小天線（鉛直的偶極，俯視是一個點）
    const s = st.s;
    if (st.pending) flagAt(g, st.pending.x0, T('起點', 'start'));
    D.tube(g, function (c) { c.moveTo(X(s), Y(-11.6)); c.lineTo(X(s), Y(-0.4)); }, D.mix(D.c.text, D.c['canvas-bg'], 0.45), Math.max(2.2, 0.45 * sc));
    D.block(g, X(s) - 1.3 * sc, Y(-9.6), 2.6 * sc, 2.6 * sc, D.c.probe, { r: 2 });
    g.beginPath(); g.moveTo(X(s) + 0.5, Y(-12.4)); g.lineTo(X(s) + 0.5, Y(-13.3));
    g.strokeStyle = D.c.probe; g.lineWidth = 2; g.stroke();
    D.ball(g, X(s), Y(0), Math.max(3.2, 0.55 * sc), D.c.probe, { glow: D.dark ? 0.45 : 0.15 });
    label(g, T('發射器', 'Transmitter'), -5.5, 6.2, txColor());
    label(g, T('金屬反射板', 'Metal reflector'), 64, 12.6, D.c.muted);
    drawMagnifier(g, t);
  }
  function flagAt(g, x, text) {
    const px = X(x), py = Y(-12.6);
    g.save(); g.fillStyle = D.c.accent;
    g.beginPath(); g.moveTo(px, py); g.lineTo(px - 4, py - 7); g.lineTo(px + 4, py - 7); g.closePath(); g.fill(); g.restore();
    D.haloText(g, text, px, py - 9, D.c.accent, 'center', 'bottom', fpx(11, 650));
  }
  /** 放大鏡：探針附近的電場（瞬間）與尺（mm 刻度） */
  function drawMagnifier(g, t) {
    const x0 = 10, y0 = 8, w = W - 20, h = topH - 14;
    const pxcm = clamp(w / 7.5, 40, 96), half = w / 2 / pxcm, s = st.s;
    // 把底下的位置框起來，連到放大鏡
    const bx0 = X(s - half), bx1 = X(s + half);
    g.save();
    g.strokeStyle = D.alpha(D.c.accent, 0.5); g.lineWidth = 1;
    g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(x0 + 6, y0 + h); g.lineTo(bx0, Y(10.6)); g.moveTo(x0 + w - 6, y0 + h); g.lineTo(bx1, Y(10.6)); g.stroke();
    g.setLineDash([]);
    g.strokeRect(bx0, Y(10.6), bx1 - bx0, Y(-10.6) - Y(10.6));
    g.restore();
    // 面板
    g.save();
    g.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : D.alpha(D.c.text, 0.18); g.shadowBlur = 10; g.shadowOffsetY = 2;
    D.roundRect(g, x0, y0, w, h, 10); g.fillStyle = D.dark ? D.shade(D.c['canvas-bg'], 0.05) : D.c.surface; g.fill();
    g.restore();
    D.roundRect(g, x0, y0, w, h, 10); g.strokeStyle = D.alpha(D.c.accent, 0.45); g.lineWidth = 1.2; g.stroke();
    g.save();
    D.roundRect(g, x0, y0, w, h, 10); g.clip();
    const cx = x0 + w / 2, rulerH = clamp(h * 0.3, 26, 34), ay = y0 + (h - rulerH) * 0.52, amp = (h - rulerH) * 0.36;
    const xp = function (x) { return cx + (x - s) * pxcm; };
    // 學生自己掃描到的讀數（淡色面積）
    const tr = st.trace.standing;
    if (tr && tr.pts.size > 1) {
      const pts = sortedTrace(tr), sens = st.sens.standing;
      g.beginPath(); let started = false, last = null;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]; if (p[0] < s - half - 0.2 || p[0] > s + half + 0.2) continue;
        const yv = y0 + h - rulerH - 2 - Math.min(1.05, p[1] * sens / FS) * (h - rulerH - 18);
        if (!started) { g.moveTo(xp(p[0]), y0 + h - rulerH - 2); g.lineTo(xp(p[0]), yv); started = true; } else g.lineTo(xp(p[0]), yv);
        last = p;
      }
      if (started && last) { g.lineTo(xp(last[0]), y0 + h - rulerH - 2); g.closePath(); g.fillStyle = D.alpha(D.c.accent, D.dark ? 0.16 : 0.12); g.fill(); }
    }
    // 軸上的瞬間電場
    const af = axialField(), c = Math.cos(OMEGA * t), sn = Math.sin(OMEGA * t);
    const i0 = Math.max(0, Math.floor((s - half - af.x0) / af.dx)), i1 = Math.min(af.n - 1, Math.ceil((s + half - af.x0) / af.dx));
    let amax = 1e-9;
    for (let i = i0; i <= i1; i++) amax = Math.max(amax, Math.hypot(af.re[i], af.im[i]));
    // 瞬間的電場（以視窗內的最大振幅為準）
    let first = true;
    g.beginPath();
    for (let px = x0; px <= x0 + w; px += 1.5) {
      const x = s + (px - cx) / pxcm, i = Math.round((x - af.x0) / af.dx);
      if (i < 0 || i >= af.n) { first = true; continue; }
      const v = (af.re[i] * c + af.im[i] * sn) / amax;
      const py = ay - v * amp;
      if (first) { g.moveTo(px, py); first = false; } else g.lineTo(px, py);
    }
    g.strokeStyle = D.c.pos; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
    g.beginPath(); g.moveTo(x0, ay); g.lineTo(x0 + w, ay); g.strokeStyle = D.alpha(D.c.text, 0.18); g.lineWidth = 1; g.stroke();
    // 尺：mm 刻度、每 cm 標數字
    const ry = y0 + h - rulerH;
    g.fillStyle = D.mix(D.c.equi, D.c['canvas-bg'], D.dark ? 0.62 : 0.8); g.fillRect(x0, ry, w, rulerH);
    g.beginPath();
    for (let mm = Math.ceil((s - half) * 10); mm <= Math.floor((s + half) * 10); mm++) {
      const px = Math.round(xp(mm / 10)) + 0.5, L = mm % 10 === 0 ? 0.5 : mm % 5 === 0 ? 0.36 : 0.22;
      g.moveTo(px, ry); g.lineTo(px, ry + L * rulerH);
    }
    g.strokeStyle = D.alpha(D.c.text, 0.7); g.lineWidth = 1; g.stroke();
    g.font = fpx(11, 600); g.fillStyle = D.c.text; g.textAlign = 'center'; g.textBaseline = 'bottom';
    for (let cm = Math.ceil(s - half); cm <= Math.floor(s + half); cm++) g.fillText(String(cm), xp(cm), ry + rulerH - 2);
    if (st.pending) {
      const px = xp(st.pending.x0);
      g.beginPath(); g.moveTo(px, y0 + 4); g.lineTo(px, ry); g.strokeStyle = D.alpha(D.c.accent, 0.7); g.setLineDash([4, 3]); g.stroke(); g.setLineDash([]);
    }
    // 探針
    g.beginPath(); g.moveTo(cx + 0.5, y0 + 6); g.lineTo(cx + 0.5, ry + rulerH * 0.6);
    g.strokeStyle = D.c.probe; g.lineWidth = 1.6; g.stroke();
    D.ball(g, cx, ay, 5, D.c.probe, { glow: D.dark ? 0.4 : 0.12 });
    g.restore();
    D.pill(g, 'x = ' + s.toFixed(2) + ' cm', clamp(cx + 10, x0 + 70, x0 + w - 70), y0 + 22, D.c.probe, 'left');
    D.haloText(g, T('放大鏡', 'Magnifier'), x0 + 10, y0 + 15, D.c.muted, 'left', 'middle', fpx(11.5, 600));
  }
  function gridX(i) { return GRID_F[i - 1] * st.d; }
  function drawGridTop(g, x, ang, name) {
    const m = metal(), L = 24 * sc, th = Math.max(4, 0.9 * sc);
    g.save();
    g.shadowColor = D.dark ? 'rgba(0,0,0,0.5)' : D.alpha(D.c.text, 0.25); g.shadowBlur = 6; g.shadowOffsetY = 2;
    g.fillStyle = D.shade(m, 0.1); g.fillRect(X(x) - th / 2, Y(12), th, L);
    g.restore();
    // 金屬條的端點（俯視）：鉛直的金屬條看起來是一排點，水平的是一條線
    const ca = Math.abs(Math.cos(ang * DEG));
    g.save();
    g.strokeStyle = D.alpha(D.shade(m, -0.5), 0.9); g.lineWidth = 1;
    g.strokeRect(X(x) - th / 2, Y(12), th, L);
    const nS = Math.max(6, Math.round(24 / 1.6));
    for (let i = 0; i <= nS; i++) {
      const yy = Y(12) + i * L / nS;
      g.fillStyle = D.alpha(D.shade(m, -0.55), 0.35 + 0.5 * (1 - ca));
      g.fillRect(X(x) - th / 2, yy - 0.6, th, 1.2);
    }
    g.restore();
    label(g, (sc < 5 ? '' : name + ' · ') + Math.round(ang * 10) / 10 + '°', x, -11.2, D.c.text);
  }
  function drawPolar(g, t) {
    drawHorn(g, -K.pc, 0, 0, 'tx');
    drawHorn(g, st.d + K.pc, 0, Math.PI, 'rx');
    if (st.g1on) drawGridTop(g, gridX(1), st.g1, T('柵 1', 'Grid 1'));
    if (st.g2on) drawGridTop(g, gridX(2), st.g2, T('柵 2', 'Grid 2'));
    label(g, T('發射器', 'Transmitter'), -11, 9.5, txColor());
    label(g, T('接收器', 'Receiver') + (st.rx ? ' · ρ = ' + st.rx + '°' : ''), st.d + 12, 9.5, rxColor());
    // d 的標示
    const yd = 7.2;
    g.save(); g.strokeStyle = D.alpha(D.c.text, 0.6); g.lineWidth = 1;
    g.beginPath(); g.moveTo(X(0), Y(yd - 1)); g.lineTo(X(0), Y(yd + 1)); g.moveTo(X(st.d), Y(yd - 1)); g.lineTo(X(st.d), Y(yd + 1)); g.stroke(); g.restore();
    D.arrow(g, X(st.d / 2), Y(yd), X(0) + 1, Y(yd), D.alpha(D.c.text, 0.55), 1.2);
    D.arrow(g, X(st.d / 2), Y(yd), X(st.d) - 1, Y(yd), D.alpha(D.c.text, 0.55), 1.2);
    D.pill(g, 'd = ' + st.d.toFixed(1) + ' cm', X(st.d / 2), Y(yd) - 4, D.c.text, 'center');
    drawAxialPanels(g, t);
  }
  /** 偏振：沿著光束看過去的四個小圓（電場的方向與大小） */
  function drawAxialPanels(g, t) {
    const pr = polarP(), res = C.polarSignal(pr), ch = res.chain, k = 2 * Math.PI / lamNow();
    const items = [
      { name: T('發射器', 'Transmitter'), x: 0, E: ch[0], grid: null, on: true },
      { name: T('柵 1 之後', 'After grid 1'), x: gridX(1), E: ch[1], grid: st.g1on ? st.g1 : null, on: st.g1on, Ein: ch[0] },
      { name: T('柵 2 之後', 'After grid 2'), x: gridX(2), E: ch[2], grid: st.g2on ? st.g2 : null, on: st.g2on, Ein: ch[1] },
      { name: T('接收器收到', 'Received'), x: st.d, E: ch[2], grid: null, on: true, rx: true }
    ];
    const n = items.length, cw = (W - 20) / n, R = Math.min(cw * 0.3, (topH - 50) / 2);
    const c = Math.cos(OMEGA * t), s = Math.sin(OMEGA * t);
    items.forEach(function (it, i) {
      const cx = 10 + cw * (i + 0.5), cy = 10 + 16 + R + 2;
      // 連到器材的位置
      g.save(); g.strokeStyle = D.alpha(D.c.muted, 0.35); g.setLineDash([2, 3]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(cx, cy + R + 22); g.lineTo(X(it.x), Y(11)); g.stroke(); g.restore();
      // 圓形視窗
      g.save();
      g.shadowColor = D.dark ? 'rgba(0,0,0,0.45)' : D.alpha(D.c.text, 0.16); g.shadowBlur = 8; g.shadowOffsetY = 2;
      g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.fillStyle = D.dark ? D.shade(D.c['canvas-bg'], 0.05) : D.c.surface; g.fill();
      g.restore();
      g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.clip();
      // 鉛直／水平的參考線
      g.strokeStyle = D.alpha(D.c.text, 0.1); g.lineWidth = 1;
      g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
      if (it.grid != null) {
        // 金屬條（隙縫方向 = 金屬條方向）
        const a = it.grid * DEG, ux = Math.cos(a), uy = -Math.sin(a), vx = -uy, vy = ux, gap = R / 3.4;
        g.strokeStyle = D.alpha(D.shade(metal(), -0.2), 0.95); g.lineWidth = Math.max(2, gap * 0.38); g.lineCap = 'butt';
        g.beginPath();
        for (let j = -4; j <= 4; j++) { const ox2 = cx + vx * j * gap, oy2 = cy + vy * j * gap; g.moveTo(ox2 - ux * R * 1.2, oy2 - uy * R * 1.2); g.lineTo(ox2 + ux * R * 1.2, oy2 + uy * R * 1.2); }
        g.stroke();
      }
      if (it.rx) {
        const a = st.rx * DEG, ax = -Math.sin(a), ay = -Math.cos(a);   // 接收天線方向 (−sin ρ, cos ρ)，畫面 y 向下
        g.save(); g.setLineDash([5, 4]); g.strokeStyle = D.alpha(rxColor(), 0.8); g.lineWidth = 2;
        g.beginPath(); g.moveTo(cx - ax * R, cy - ay * R); g.lineTo(cx + ax * R, cy + ay * R); g.stroke(); g.restore();
      }
      g.restore();
      g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.strokeStyle = D.alpha(D.c.text, 0.28); g.lineWidth = 1; g.stroke();
      // 電場（隨時間振盪的雙向箭頭）
      const ph = k * it.x, osc = Math.cos(OMEGA * t - ph);
      void c; void s;
      let ex = it.E[0], ey = it.E[1];
      if (it.rx) { const a = st.rx * DEG, axh = -Math.sin(a), axv = Math.cos(a), p = ex * axh + ey * axv; ex = p * axh; ey = p * axv; }
      const mag = Math.hypot(ex, ey);
      if (it.Ein && it.on) {
        const mi = Math.hypot(it.Ein[0], it.Ein[1]);
        if (mi > 0.02) {
          g.save(); g.setLineDash([3, 3]); g.strokeStyle = D.alpha(D.c.pos, 0.35); g.lineWidth = 1.5;
          g.beginPath(); g.moveTo(cx - it.Ein[0] * R * 0.85, cy + it.Ein[1] * R * 0.85); g.lineTo(cx + it.Ein[0] * R * 0.85, cy - it.Ein[1] * R * 0.85); g.stroke(); g.restore();
        }
      }
      if (mag > 0.01) {
        g.save(); g.strokeStyle = D.alpha(D.c.pos, 0.25); g.lineWidth = 3; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx - ex * R * 0.85, cy + ey * R * 0.85); g.lineTo(cx + ex * R * 0.85, cy - ey * R * 0.85); g.stroke(); g.restore();
        const q = reduced || !st.waves ? 1 : osc;
        if (Math.abs(q) * mag * R * 0.85 > 3) D.arrow(g, cx, cy, cx + ex * q * R * 0.85, cy - ey * q * R * 0.85, D.c.pos, 2.4);
      }
      D.ball(g, cx, cy, 2.4, D.c.text, { shadow: false });
      D.haloText(g, it.name, cx, 10 + 8, D.c.text, 'center', 'middle', fpx(11.5, 650));
      const pct = it.rx ? Math.abs(res.amp) : mag;
      D.haloText(g, (it.on || it.rx) ? T('振幅 ', 'amplitude ') + Math.round(pct * 100) + '%' : T('（未放）', '(none)'), cx, cy + R + 12, it.on || it.rx ? D.c.muted : D.alpha(D.c.muted, 0.7), 'center', 'middle', fpx(11, 600));
    });
  }

  // ---------------- 電表與讀數掃描 ----------------
  function drawStrip(g) {
    const pad = 8, y = sceneH + pad, h = stripH - 2 * pad;
    const mw = Math.round(clamp(W * 0.36, 150, 230));
    drawMeter(g, pad, y, mw, h);
    drawMini(g, pad + mw + 10, y, W - pad - (pad + mw + 10), h);
  }
  function drawMeter(g, x, y, w, h) {
    const body = D.mix(D.c.text, D.c['canvas-bg'], D.dark ? 0.78 : 0.72);
    D.block(g, x, y, w, h, body, { r: 9 });
    const fx0 = x + 6, fy0 = y + 6, fw = w - 12, fh = h - 12;
    D.roundRect(g, fx0, fy0, fw, fh, 6);
    const fg = g.createLinearGradient(0, fy0, 0, fy0 + fh);
    fg.addColorStop(0, D.dark ? D.shade(D.c['canvas-bg'], 0.1) : '#ffffff'); fg.addColorStop(1, D.dark ? D.shade(D.c['canvas-bg'], 0.03) : D.mix('#ffffff', D.c.bg, 0.6));
    g.fillStyle = fg; g.fill();
    const cx = fx0 + fw / 2, cy = fy0 + fh - 7, r = Math.min(fw / 2 - 12, fh - 22), span = 100 * DEG;
    const ang = function (v) { return (v / FS - 0.5) * span; };
    g.save();
    g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2 - span / 2, -Math.PI / 2 + span / 2); g.strokeStyle = D.alpha(D.c.text, 0.75); g.lineWidth = 1.2; g.stroke();
    g.beginPath();
    for (let i = 0; i <= 50; i++) {
      const v = i * 0.02, a = ang(v), L = i % 5 === 0 ? 8 : 4;
      g.moveTo(cx + r * Math.sin(a), cy - r * Math.cos(a)); g.lineTo(cx + (r - L) * Math.sin(a), cy - (r - L) * Math.cos(a));
    }
    g.strokeStyle = D.alpha(D.c.text, 0.75); g.lineWidth = 1; g.stroke();
    g.font = fpx(clamp(r * 0.17, 9, 11.5), 600); g.fillStyle = D.c.text; g.textAlign = 'center'; g.textBaseline = 'middle';
    const labs = r < 72 ? [0, 0.5, 1] : [0, 0.2, 0.4, 0.6, 0.8, 1];
    labs.forEach(function (v) {
      const a = ang(v), rr = r - 16;
      g.fillText(v === 0 ? '0' : v.toFixed(1), cx + rr * Math.sin(a), cy - rr * Math.cos(a));
    });
    g.font = fpx(clamp(r * 0.2, 10, 13), 700); g.fillStyle = D.c.muted;
    g.fillText('mA', cx, cy - Math.min(r * 0.42, r - 32));
    // 指針
    const nv = clamp(st.needle, -0.03, 1.04), a = ang(nv);
    g.save();
    g.shadowColor = D.dark ? 'rgba(0,0,0,0.6)' : D.alpha(D.c.text, 0.3); g.shadowBlur = 3; g.shadowOffsetX = 1.5; g.shadowOffsetY = 1.5;
    g.beginPath(); g.moveTo(cx - 2 * Math.cos(a), cy - 2 * Math.sin(a)); g.lineTo(cx + (r - 3) * Math.sin(a), cy - (r - 3) * Math.cos(a)); g.lineTo(cx + 2 * Math.cos(a), cy + 2 * Math.sin(a)); g.closePath();
    g.fillStyle = D.c.pos; g.fill();
    g.restore();
    D.ball(g, cx, cy, 4.5, D.mix(D.c.text, D.c['canvas-bg'], 0.25), { shadow: false });
    g.restore();
    // 數字讀數（讀到 0.01 mA）
    const txt = st.over ? T('超過滿刻度', 'Off scale') : st.needle.toFixed(2) + ' mA';
    D.pill(g, txt, fx0 + 6, fy0 + 22, st.over ? D.c.pos : D.c.text, 'left', fpx(11.5, 700));
    D.haloText(g, '×' + st.sens[st.mode].toFixed(2), fx0 + fw - 6, fy0 + 14, D.c.muted, 'right', 'middle', fpx(10.5, 600));
  }
  function scanSpec(mode) {
    mode = mode || st.mode;
    if (mode === 'reflect') return { x0: 30, x1: 180, name: 'ψ', unit: '°', v: st.psiR };
    if (mode === 'refract') return { x0: 110, x1: 180, name: 'ψ', unit: '°', v: st.psiP };
    if (mode === 'standing') return { x0: 14, x1: 68, name: 'x', unit: 'cm', v: st.s };
    if (st.g2on) return { x0: 0, x1: 180, name: T('柵 2 θ', 'grid 2 θ'), unit: '°', v: st.g2, key: 'g2' };
    if (st.g1on) return { x0: 0, x1: 180, name: T('柵 1', 'grid 1'), unit: '°', v: st.g1, key: 'g1' };
    if (st.rx) return { x0: 0, x1: 180, name: 'ρ', unit: '°', v: st.rx, key: 'rx' };
    return { x0: 30, x1: 70, name: 'd', unit: 'cm', v: st.d, key: 'd' };
  }
  function traceKey() {
    const m = st.mode, c = [m, st.freq, st.fU, st.err, st.tilt];
    if (m === 'reflect') c.push(st.plate, st.thetaI);
    else if (m === 'refract') c.push(st.mat, st.nU);
    else if (m === 'polar') { const sp = scanSpec(); c.push(sp.key, st.g1on, st.g2on, sp.key === 'g1' ? '' : st.g1, sp.key === 'g2' ? '' : st.g2, sp.key === 'rx' ? '' : st.rx, sp.key === 'd' ? '' : st.d); }
    return c.join('|');
  }
  function sampleTrace() {
    const k = traceKey();
    let tr = st.trace[st.mode];
    if (!tr || tr.key !== k) tr = st.trace[st.mode] = { key: k, pts: new Map(), sorted: null };
    const sp = scanSpec(), q = Math.round(sp.v * 100) / 100;
    const r = readingAt(now()) / st.sens[st.mode];
    tr.pts.set(q, r);
    tr.sorted = null;
    if (tr.pts.size > 4000) { const it = tr.pts.keys().next(); tr.pts.delete(it.value); }
    dataDirty = st.mode === 'refract' || st.mode === 'standing' || dataDirty;
  }
  function sortedTrace(tr) {
    if (!tr.sorted) { tr.sorted = Array.from(tr.pts.entries()).sort(function (a, b) { return a[0] - b[0]; }); }
    return tr.sorted;
  }
  function drawMini(g, x, y, w, h) {
    D.roundRect(g, x, y, w, h, 9);
    g.fillStyle = D.dark ? D.shade(D.c['canvas-bg'], 0.04) : D.alpha(D.c.surface, 0.9); g.fill();
    g.strokeStyle = D.alpha(D.c.text, 0.12); g.lineWidth = 1; g.stroke();
    const sp = scanSpec(), L = x + 34, R = x + w - 10, Tp = y + 20, B = y + h - 20;
    const px = function (v) { return L + (v - sp.x0) / (sp.x1 - sp.x0) * (R - L); };
    const py = function (v) { return B - Math.min(1.08, v / FS) * (B - Tp); };
    // 格線
    g.beginPath();
    for (let i = 0; i <= 5; i++) { const yy = Math.round(py(i * 0.2)) + 0.5; g.moveTo(L, yy); g.lineTo(R, yy); }
    g.strokeStyle = D.alpha(D.c.text, 0.08); g.lineWidth = 1; g.stroke();
    g.font = fpx(9.5, 600); g.fillStyle = D.c.muted; g.textAlign = 'right'; g.textBaseline = 'middle';
    [0, 0.5, 1].forEach(function (v) { g.fillText(v === 0 ? '0' : v.toFixed(1), L - 4, py(v)); });
    g.textAlign = 'center'; g.textBaseline = 'top';
    const tk = niceTicks(sp.x0, sp.x1, Math.max(3, Math.floor((R - L) / 55)));
    tk.forEach(function (v) { g.fillText(String(round(v, 3)), px(v), B + 3); });
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = fpx(11, 650); g.fillStyle = D.c.text;
    const unitTxt = 'I (mA) – ' + sp.name + ' (' + sp.unit + ')';
    g.font = fpx(10, 600);
    const uw = g.measureText(unitTxt).width;
    g.font = fpx(11, 650);
    if (w - uw - 24 > g.measureText(T('讀數掃描', 'Reading scan')).width) g.fillText(T('讀數掃描', 'Reading scan'), x + 8, y + 10);
    g.font = fpx(10, 600); g.fillStyle = D.c.muted; g.textAlign = 'right';
    g.fillText(unitTxt, R, y + 10);
    // 滿刻度
    g.save(); g.setLineDash([3, 3]); g.strokeStyle = D.alpha(D.c.pos, 0.5);
    g.beginPath(); g.moveTo(L, py(FS)); g.lineTo(R, py(FS)); g.stroke(); g.restore();
    // 掃描曲線
    const tr = st.trace[st.mode];
    if (tr && tr.pts.size) {
      const pts = sortedTrace(tr), sens = st.sens[st.mode];
      g.save(); g.beginPath(); g.rect(L, Tp - 6, R - L, B - Tp + 6); g.clip();
      g.beginPath();
      let prev = null;
      const gap = st.mode === 'standing' ? 0.6 : 4;
      pts.forEach(function (p) {
        const xx = px(p[0]), yy = py(p[1] * sens);
        if (!prev || p[0] - prev[0] > gap) g.moveTo(xx, yy); else g.lineTo(xx, yy);
        prev = p;
      });
      g.strokeStyle = D.c.accent; g.lineWidth = 1.6; g.lineJoin = 'round'; g.stroke();
      if (pts.length < 60) pts.forEach(function (p) { g.fillStyle = D.alpha(D.c.accent, 0.7); g.fillRect(px(p[0]) - 1.2, py(p[1] * sens) - 1.2, 2.4, 2.4); });
      g.restore();
    }
    const vx = px(clamp(sp.v, sp.x0, sp.x1));
    g.beginPath(); g.moveTo(vx + 0.5, Tp - 4); g.lineTo(vx + 0.5, B); g.strokeStyle = D.alpha(D.c.probe, 0.45); g.lineWidth = 1; g.stroke();
    D.ball(g, vx, py(Math.min(st.needle, 1.06)), 4, D.c.probe, { shadow: false });
  }
  function niceTicks(a, b, n) {
    const span = b - a, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0))), f = step0 / mag;
    const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag, out = [];
    for (let v = Math.ceil(a / step - 1e-9) * step; v <= b + 1e-9; v += step) out.push(round(v, 6));
    return out;
  }

  // ---------------- 主畫面 ----------------
  function drawMain(t) {
    if (!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(buildStatic(), 0, 0, W, H);
    if (st.mode === 'reflect' || st.mode === 'refract') drawArm(ctx, 180 - (st.mode === 'reflect' ? st.psiR : st.psiP), 46);
    paintField(t);
    drawField(ctx);
    if (st.mode === 'reflect') drawReflect(ctx);
    else if (st.mode === 'refract') drawRefract(ctx);
    else if (st.mode === 'standing') drawStanding(ctx, t);
    else drawPolar(ctx, t);
    if (fjob) D.haloText(ctx, T('計算電場中…', 'Computing the field…'), W - 10, topH + 14, D.c.muted, 'right', 'middle', fpx(11, 600));
    if (st.flash > 0) {
      ctx.fillStyle = D.alpha(D.c.accent, 0.18 * st.flash);
      ctx.fillRect(0, sceneH, W, stripH);
    }
    drawKeyFocus(ctx);
    drawStrip(ctx);
  }

  // ---------------- 數據圖 ----------------
  const gc = $('graph'), gctx = gc.getContext('2d');
  let GW = 0, GH = 0, gdpr = 1;
  function layoutGraph() {
    GW = gc.clientWidth || 360; GH = gc.clientHeight || 300;
    gdpr = Math.min(2.5, window.devicePixelRatio || 1);
    gc.width = Math.round(GW * gdpr); gc.height = Math.round(GH * gdpr);
  }
  function plotFrame(g, xr, yr, xl, yl, opts) {
    opts = opts || {};
    const L = 52, R = GW - 14, Tp = 16, B = GH - 42;
    const px = function (v) { return L + (v - xr[0]) / (xr[1] - xr[0]) * (R - L); };
    const py = function (v) { return B - (v - yr[0]) / (yr[1] - yr[0]) * (B - Tp); };
    D.backdrop(g, GW, GH);
    const xt = opts.xt || niceTicks(xr[0], xr[1], Math.max(3, Math.floor((R - L) / 70)));
    const yt = opts.yt || niceTicks(yr[0], yr[1], Math.max(3, Math.floor((B - Tp) / 45)));
    g.beginPath();
    xt.forEach(function (v) { const x = Math.round(px(v)) + 0.5; g.moveTo(x, Tp); g.lineTo(x, B); });
    yt.forEach(function (v) { const y = Math.round(py(v)) + 0.5; g.moveTo(L, y); g.lineTo(R, y); });
    g.strokeStyle = D.alpha(D.c.text, D.dark ? 0.1 : 0.08); g.lineWidth = 1; g.stroke();
    g.strokeStyle = D.alpha(D.c.text, 0.45); g.beginPath(); g.moveTo(L, Tp); g.lineTo(L, B); g.lineTo(R, B); g.stroke();
    g.font = fpx(11, 500); g.fillStyle = D.c.muted;
    g.textAlign = 'center'; g.textBaseline = 'top';
    xt.forEach(function (v) { g.fillText(minus(String(v)), px(v), B + 4); });
    g.textAlign = 'right'; g.textBaseline = 'middle';
    yt.forEach(function (v) { g.fillText(minus(String(v)), L - 6, py(v)); });
    g.font = fpx(12, 650); g.fillStyle = D.c.text; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.fillText(xl, (L + R) / 2, GH - 4);
    g.save(); g.translate(13, (Tp + B) / 2); g.rotate(-Math.PI / 2); g.textBaseline = 'middle'; g.fillText(yl, 0, 0); g.restore();
    return { px: px, py: py, L: L, R: R, T: Tp, B: B };
  }
  function drawGraph() {
    if (!GW) return;
    const g = gctx;
    g.setTransform(gdpr, 0, 0, gdpr, 0, 0);
    const m = st.mode, rows = st.rows[m];
    if (m === 'reflect') {
      const f = plotFrame(g, [0, 90], [0, 90], T('入射角 θi（°）', 'Angle of incidence θi (°)'), T('反射角 θr（°）', 'Angle of reflection θr (°)'));
      g.save(); g.setLineDash([6, 4]); g.strokeStyle = D.alpha(D.c.text, 0.45); g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(f.px(0), f.py(0)); g.lineTo(f.px(90), f.py(90)); g.stroke(); g.restore();
      D.haloText(g, 'θr = θi', f.px(70), f.py(76), D.c.muted, 'right', 'middle', fpx(11.5, 600));
      rows.forEach(function (r, i) { D.ball(g, f.px(r.thetaI), f.py(clamp(r.thetaR, 0, 90)), i === rows.length - 1 ? 5.5 : 4.5, D.c.accent); });
    } else if (m === 'refract' || m === 'standing') {
      const sp = scanSpec(m), sens = st.sens[m], tr = st.trace[m];
      let ymax = 1;
      if (tr) sortedTrace(tr).forEach(function (p) { ymax = Math.max(ymax, Math.min(1.1, p[1] * sens)); });
      const f = plotFrame(g, [sp.x0, sp.x1], [0, Math.ceil(ymax * 10) / 10],
        m === 'refract' ? T('角度計讀數 ψ（°）', 'Goniometer reading ψ (°)') : T('探針位置 x（cm）', 'Probe position x (cm)'),
        T('電表讀數 I（mA）', 'Meter reading I (mA)'));
      g.save(); g.setLineDash([3, 3]); g.strokeStyle = D.alpha(D.c.pos, 0.5); g.beginPath(); g.moveTo(f.L, f.py(FS)); g.lineTo(f.R, f.py(FS)); g.stroke(); g.restore();
      if (m === 'refract' && nKnown()) {
        const ex = 180 - C.deviation(nNow(), K.prismA);
        if (isFinite(ex)) {
          g.save(); g.setLineDash([6, 4]); g.strokeStyle = D.alpha(D.c.text, 0.45); g.beginPath(); g.moveTo(f.px(ex), f.T); g.lineTo(f.px(ex), f.B); g.stroke(); g.restore();
          D.haloText(g, T('司乃耳定律（中心）', 'Snell (centre ray)'), f.px(ex) - 4, f.T + 10, D.c.muted, 'right', 'middle', fpx(11, 600));
        }
      }
      if (tr && tr.pts.size) {
        g.save(); g.beginPath(); g.rect(f.L, f.T - 4, f.R - f.L, f.B - f.T + 4); g.clip();
        g.beginPath(); let prev = null;
        const gap = m === 'standing' ? 0.6 : 4;
        sortedTrace(tr).forEach(function (p) {
          const x = f.px(p[0]), y = f.py(Math.min(1.1, p[1] * sens));
          if (!prev || p[0] - prev[0] > gap) g.moveTo(x, y); else g.lineTo(x, y);
          prev = p;
        });
        g.strokeStyle = D.c.accent; g.lineWidth = 1.8; g.lineJoin = 'round'; g.stroke(); g.restore();
      }
      if (m === 'refract') rows.forEach(function (r) { if (r.mat === st.mat) D.ball(g, f.px(r.psi), f.py(Math.min(1.1, r.I)), 4.5, D.c.pos); });
      else {
        const mark = function (x, filled) {
          const X0 = f.px(x);
          g.save(); g.strokeStyle = D.alpha(filled ? D.c.pos : D.c.neg, 0.7); g.lineWidth = 1.4;
          g.beginPath(); g.moveTo(X0, f.B); g.lineTo(X0, f.B - 12); g.stroke(); g.restore();
          D.ball(g, X0, f.B - 14, 3.6, filled ? D.c.pos : D.c.neg, { shadow: false });
        };
        rows.forEach(function (r) { mark(r.x0, false); mark(r.x1, true); });
        if (st.pending) mark(st.pending.x0, false);
      }
    } else {
      const f = plotFrame(g, [0, 90], [0, 1.1], T('角度 θ（°）', 'Angle θ (°)'), T('I ／ I0', 'I / I0'), { xt: [0, 15, 30, 45, 60, 75, 90], yt: [0, 0.25, 0.5, 0.75, 1] });
      const curve = function (pw, dash, col) {
        g.save(); if (dash) g.setLineDash(dash); g.strokeStyle = col; g.lineWidth = 1.8; g.beginPath();
        for (let a = 0; a <= 90; a += 1) { const v = Math.pow(Math.cos(a * DEG), pw), x = f.px(a), y = f.py(v); if (a === 0) g.moveTo(x, y); else g.lineTo(x, y); }
        g.stroke(); g.restore();
      };
      curve(4, null, D.alpha(D.c.accent, 0.85));
      curve(2, [6, 4], D.alpha(D.c.muted, 0.8));
      polarRowsView().forEach(function (r) {
        if (r.ratio == null || r.theta > 90.01) return;
        if (r.kind === 'rx') { const x = f.px(r.theta), y = f.py(Math.min(1.1, r.ratio)); g.fillStyle = D.c.neg; g.fillRect(x - 4, y - 4, 8, 8); g.strokeStyle = D.alpha(D.c.surface, 0.9); g.strokeRect(x - 4, y - 4, 8, 8); }
        else D.ball(g, f.px(r.theta), f.py(Math.min(1.1, r.ratio)), 4.5, D.c.pos);
      });
    }
  }

  // ---------------- 數據表與分析 ----------------
  function polarAngle(r) {
    if (r.g2on) return { theta: r.g2, kind: 'g2' };
    if (r.g1on) return { theta: r.g1, kind: 'g1' };
    return { theta: r.rx, kind: 'rx' };
  }
  function sameCfg(a, b) {
    return a.g1on === b.g1on && a.g2on === b.g2on && Math.abs(a.d - b.d) < 0.005 && Math.abs(a.sens - b.sens) < 1e-6 && a.err === b.err && Math.abs(a.fTrue - b.fTrue) < 1e-9;
  }
  function isRef(r) { return (!r.g1on || Math.abs(r.g1) < 1e-6) && (!r.g2on || Math.abs(r.g2) < 1e-6) && Math.abs(r.rx) < 1e-6 && r.I > 0; }
  function refFor(rows, r) {
    for (let i = rows.length - 1; i >= 0; i--) if (sameCfg(rows[i], r) && isRef(rows[i])) return rows[i];
    return null;
  }
  function polarRowsView() {
    const rows = st.rows.polar;
    return rows.map(function (r) {
      const ref = refFor(rows, r), pa = polarAngle(r);
      return Object.assign({}, r, { theta: pa.theta, kind: pa.kind, ref: ref ? ref.I : null, ratio: ref ? r.I / ref.I : null });
    });
  }
  function thc(zh, en) { return '<th>' + T(zh, en) + '</th>'; }
  function buildTable() {
    const m = st.mode, rows = st.rows[m], tb = $('tbl');
    let h = '';
    const latest = rows.length - 1;
    if (m === 'reflect') {
      h += '<thead><tr><th>#</th>' + thc('入射角 θ<sub>i</sub>', 'θ<sub>i</sub>') + thc('角度計 ψ', 'Goniometer ψ') + thc('反射角 θ<sub>r</sub> = ψ − θ<sub>i</sub>', 'θ<sub>r</sub> = ψ − θ<sub>i</sub>') + thc('θ<sub>r</sub> − θ<sub>i</sub>', 'θ<sub>r</sub> − θ<sub>i</sub>') + thc('讀數 I (mA)', 'I (mA)') + '</tr></thead><tbody>';
      rows.forEach(function (r, i) {
        const d = r.thetaR - r.thetaI;
        h += '<tr' + (i === latest ? ' class="latest"' : '') + '><td>' + (i + 1) + '</td><td>' + r.thetaI.toFixed(1) + '°</td><td>' + r.psi.toFixed(1) + '°</td><td>' + r.thetaR.toFixed(1) +
          '°</td><td class="' + (Math.abs(d) <= 2 ? 'good' : Math.abs(d) > 4 ? 'off' : '') + '">' + fsg(d, 1) + '°</td><td>' + r.I.toFixed(2) + '</td></tr>';
      });
    } else if (m === 'refract') {
      h += '<thead><tr><th>#</th>' + thc('材料', 'Material') + thc('ψ', 'ψ') + thc('δ = 180° − ψ', 'δ = 180° − ψ') + thc('θ<sub>2</sub> = 30° + δ', 'θ<sub>2</sub> = 30° + δ') + thc('n = sin θ<sub>2</sub> ／ sin 30°', 'n = sin θ<sub>2</sub> / sin 30°') + thc('讀數 I (mA)', 'I (mA)') + '</tr></thead><tbody>';
      rows.forEach(function (r, i) {
        h += '<tr' + (i === latest ? ' class="latest"' : '') + '><td>' + (i + 1) + '</td><td>' + matName(r.mat) + '</td><td>' + r.psi.toFixed(1) + '°</td><td>' + r.delta.toFixed(1) + '°</td><td>' + r.theta2.toFixed(1) +
          '°</td><td>' + r.n.toFixed(3) + '</td><td>' + r.I.toFixed(2) + '</td></tr>';
      });
    } else if (m === 'standing') {
      h += '<thead><tr><th>#</th>' + thc('起點 x<sub>0</sub> (cm)', 'Start x<sub>0</sub> (cm)') + thc('終點 x<sub>1</sub> (cm)', 'End x<sub>1</sub> (cm)') + thc('波節數 N', 'Nodes N') + thc('Δx (cm)', 'Δx (cm)') + thc('λ = 2Δx ／ N (cm)', 'λ = 2Δx / N (cm)') + thc('f = c ／ λ (GHz)', 'f = c / λ (GHz)') + '</tr></thead><tbody>';
      rows.forEach(function (r, i) {
        h += '<tr' + (i === latest && !st.pending ? ' class="latest"' : '') + '><td>' + (i + 1) + '</td><td>' + r.x0.toFixed(2) + '</td><td>' + r.x1.toFixed(2) + '</td><td>' + r.N + '</td><td>' + r.dx.toFixed(2) +
          '</td><td>' + r.lam.toFixed(3) + '</td><td>' + r.f.toFixed(2) + '</td></tr>';
      });
      if (st.pending) h += '<tr class="pending"><td>' + (rows.length + 1) + '</td><td>' + st.pending.x0.toFixed(2) + '</td><td colspan="5">' + T('…移動探針，數波節，再按「記錄終點」', '…move the probe, count the nodes, then press “Record end”') + '</td></tr>';
    } else {
      h += '<thead><tr><th>#</th>' + thc('柵 1', 'Grid 1') + thc('柵 2（θ）', 'Grid 2 (θ)') + thc('接收器 ρ', 'Receiver ρ') + thc('d (cm)', 'd (cm)') + thc('讀數 I (mA)', 'I (mA)') + thc('I ／ I<sub>0</sub>', 'I / I<sub>0</sub>') + thc('cos<sup>4</sup>θ', 'cos<sup>4</sup>θ') + '</tr></thead><tbody>';
      polarRowsView().forEach(function (r, i) {
        const theo = r.kind === 'rx' ? Math.pow(Math.cos(r.theta * DEG), 2) : Math.pow(Math.cos(r.theta * DEG), 4);
        const good = r.ratio != null && Math.abs(r.ratio - theo) <= 0.05;
        h += '<tr' + (i === latest ? ' class="latest"' : '') + '><td>' + (i + 1) + '</td><td>' + (r.g1on ? r.g1 + '°' : '—') + '</td><td>' + (r.g2on ? r.g2 + '°' : '—') + '</td><td>' + r.rx + '°</td><td>' + r.d.toFixed(1) +
          '</td><td>' + r.I.toFixed(2) + '</td><td class="' + (r.ratio == null ? '' : good ? 'good' : 'off') + '">' + (r.ratio == null ? '—' : r.ratio.toFixed(3)) + '</td><td>' +
          (r.kind === 'rx' ? Math.pow(Math.cos(r.theta * DEG), 2).toFixed(3) + '<small> (cos<sup>2</sup>)</small>' : theo.toFixed(3)) + '</td></tr>';
      });
    }
    if (!rows.length && !(m === 'standing' && st.pending)) {
      const cols = m === 'polar' ? 8 : 7;
      h += '<tr class="empty"><td colspan="' + cols + '">' + emptyHint() + '</td></tr>';
    }
    tb.innerHTML = h + '</tbody>';
  }
  function emptyHint() {
    return {
      reflect: T('還沒有數據。裝上金屬板、找到讀數最大的位置，按「記錄」。', 'No data yet. Put the plate in place, find the largest reading and press “Record”.'),
      refract: T('還沒有數據。轉動接收臂找到讀數最大的位置，按「記錄」。', 'No data yet. Swing the receiver arm to the largest reading and press “Record”.'),
      standing: T('還沒有數據。找到一個波節，按「記錄起點」。', 'No data yet. Find a node and press “Record start”.'),
      polar: T('還沒有數據。放上偏極柵、按「記錄」；θ = 0° 的那一筆是 I0。', 'No data yet. Put the grids in and press “Record”; the row at θ = 0° is I0.')
    }[st.mode];
  }
  function matName(id) { return id === 'polystyrene' ? T('聚苯乙烯', 'Polystyrene') : id === 'paraffin' ? T('石蠟', 'Paraffin wax') : T('未知', 'Unknown'); }
  function dl(items) {
    return items.map(function (it) {
      if (it.sec) return '<dt class="sec">' + it.sec + '</dt>';
      return '<dt>' + it[0] + '</dt><dd' + (it[2] ? ' class="' + it[2] + '"' : '') + '>' + it[1] + '</dd>';
    }).join('');
  }
  function buildFit() {
    const m = st.mode, rows = st.rows[m], out = [];
    let reveal = null;
    if (m === 'reflect') {
      if (!rows.length) out.push([T('數據筆數', 'Rows'), '0']);
      else {
        const diffs = rows.map(function (r) { return r.thetaR - r.thetaI; });
        const k = C.slopeThroughOrigin(rows.map(function (r) { return r.thetaI; }), rows.map(function (r) { return r.thetaR; }));
        out.push([T('數據筆數', 'Rows'), String(rows.length)]);
        out.push([T('θ<sub>r</sub> − θ<sub>i</sub> 的平均', 'Mean of θ<sub>r</sub> − θ<sub>i</sub>'), fsg(C.mean(diffs), 2) + '°' + (rows.length > 1 ? '<small>± ' + C.sd(diffs).toFixed(2) + '°（' + T('標準差', 'std. dev.') + '）</small>' : '')]);
        out.push([T('θ<sub>r</sub> 對 θ<sub>i</sub> 的斜率', 'Slope of θ<sub>r</sub> vs θ<sub>i</sub>'), k.toFixed(3) + '<small>' + T('理論值 1', 'expected 1') + '</small>', Math.abs(k - 1) < 0.03 ? 'ok' : '']);
        const good = rows.filter(function (r) { return r.thetaI <= 60.5; });
        const big = rows.filter(function (r) { return r.thetaI > 60.5 && Math.abs(r.thetaR - r.thetaI) > 2; });
        out.push({ sec: T('結論', 'Conclusion') });
        out.push([T('入射角 ≤ 60°', 'θ<sub>i</sub> ≤ 60°'), good.length ? (good.every(function (r) { return Math.abs(r.thetaR - r.thetaI) <= 2; }) ? T('θ<sub>r</sub> = θ<sub>i</sub>（2° 內）', 'θ<sub>r</sub> = θ<sub>i</sub> (within 2°)') : T('有的差超過 2°：再找一次最大值', 'Some are more than 2° off: find the maximum again')) : '—']);
        if (big.length) out.push([T('入射角 70°、80°', 'θ<sub>i</sub> 70°, 80°'), T('偏離：見「問題與討論」1', 'Off: see Question 1')]);
      }
    } else if (m === 'refract') {
      const mine = rows.filter(function (r) { return r.mat === st.mat && (st.mat !== 'unknown' || Math.abs(r.nAcc - st.nU) < 1e-9); });
      out.push({ sec: matName(st.mat) });
      out.push([T('數據筆數', 'Rows'), String(mine.length)]);
      if (mine.length) {
        const ns = mine.map(function (r) { return r.n; }), nm = C.mean(ns);
        out.push([T('折射率 n 的平均', 'Mean n'), nm.toFixed(3) + (mine.length > 1 ? '<small>± ' + C.sd(ns).toFixed(3) + '</small>' : '')]);
        if (nKnown()) {
          const p = C.pctErr(nm, nNow());
          out.push([T('公認值', 'Accepted value'), nNow().toFixed(3) + (st.mat === 'unknown' ? '<small>' + T('已揭曉', 'revealed') + '</small>' : '')]);
          out.push([T('百分誤差', 'Percent error'), fPct(p), Math.abs(p) <= 2 ? 'ok' : Math.abs(p) > 5 ? 'bad' : '']);
        } else out.push([T('公認值', 'Accepted value'), '？']);
      }
      if (st.mat === 'unknown' && !st.revealed.n) reveal = T('揭曉未知材料的折射率', 'Reveal the unknown refractive index');
    } else if (m === 'standing') {
      out.push([T('數據筆數', 'Rows'), String(rows.length)]);
      if (rows.length) {
        const ls = rows.map(function (r) { return r.lam; }), lm = C.mean(ls), fm = C.freqGHz(lm);
        out.push([T('波長 λ 的平均', 'Mean λ'), lm.toFixed(3) + ' cm' + (rows.length > 1 ? '<small>± ' + C.sd(ls).toFixed(3) + ' cm</small>' : '')]);
        out.push([T('頻率 f = c ／ λ', 'Frequency f = c / λ'), fm.toFixed(3) + ' GHz']);
        const mixed = rows.some(function (r) { return Math.abs(r.fTrue - rows[0].fTrue) > 1e-9; });
        if (mixed) out.push([T('注意', 'Note'), T('表中有不同頻率的數據', 'The table mixes different frequencies'), 'bad']);
        else if (fKnown() || st.freq !== 'unknown') {
          const f0 = rows[0].fTrue, l0 = C.lambdaCm(f0), unk = rows[0].unknown;
          if (!unk || st.revealed.f) {
            const pl = C.pctErr(lm, l0), pf = C.pctErr(fm, f0);
            out.push({ sec: T('與設定值比較', 'Compared with the set value') });
            out.push([T('設定的頻率', 'Set frequency'), f0.toFixed(unk ? 3 : 3) + ' GHz<small>λ = c ／ f = ' + l0.toFixed(3) + ' cm</small>']);
            out.push([T('λ 的百分誤差', 'Error in λ'), fPct(pl), Math.abs(pl) <= 1 ? 'ok' : Math.abs(pl) > 3 ? 'bad' : '']);
            out.push([T('f 的百分誤差', 'Error in f'), fPct(pf), Math.abs(pf) <= 1 ? 'ok' : Math.abs(pf) > 3 ? 'bad' : '']);
          } else out.push([T('設定的頻率', 'Set frequency'), '？']);
        } else out.push([T('設定的頻率', 'Set frequency'), '？']);
      }
      if (st.freq === 'unknown' && !st.revealed.f) reveal = T('揭曉發射器的頻率', 'Reveal the transmitter frequency');
    } else {
      const v = polarRowsView().filter(function (r) { return r.ratio != null && r.kind !== 'rx'; });
      const vr = polarRowsView().filter(function (r) { return r.ratio != null && r.kind === 'rx'; });
      out.push([T('數據筆數', 'Rows'), String(st.rows.polar.length)]);
      const rms = function (list, pw) { if (!list.length) return NaN; let s = 0; list.forEach(function (r) { const e = r.ratio - Math.pow(Math.cos(r.theta * DEG), pw); s += e * e; }); return Math.sqrt(s / list.length); };
      if (v.length > 1) {
        const a4 = rms(v, 4), a2 = rms(v, 2);
        out.push({ sec: T('轉偏極柵（接收器不動）', 'Turning a grid (receiver fixed)') });
        out.push([T('與 cos<sup>4</sup>θ 的均方根差', 'RMS gap to cos<sup>4</sup>θ'), a4.toFixed(3), a4 < a2 ? 'ok' : '']);
        out.push([T('與 cos<sup>2</sup>θ 的均方根差', 'RMS gap to cos<sup>2</sup>θ'), a2.toFixed(3)]);
        out.push([T('比較接近', 'Closer to'), a4 < a2 ? 'cos<sup>4</sup>θ ' + T('（電場投影兩次）', '(the field is projected twice)') : 'cos<sup>2</sup>θ', a4 < a2 ? 'ok' : '']);
      } else out.push([T('提示', 'Tip'), T('先在 θ = 0° 記錄 I0，再記錄其他角度', 'Record I0 at θ = 0° first, then other angles')]);
      if (vr.length > 1) {
        out.push({ sec: T('只轉接收器（馬呂斯定律）', 'Turning only the receiver (Malus)') });
        out.push([T('與 cos<sup>2</sup>ρ 的均方根差', 'RMS gap to cos<sup>2</sup>ρ'), rms(vr, 2).toFixed(3), rms(vr, 2) < 0.05 ? 'ok' : '']);
      }
    }
    $('fit').innerHTML = dl(out);
    const rb = $('reveal');
    rb.hidden = !reveal;
    if (reveal) rb.textContent = reveal;
  }
  function buildReadout() {
    const m = st.mode, out = [];
    out.push({ sec: T('電表', 'Meter') });
    out.push([T('讀數 I', 'Reading I'), st.over ? T('超過滿刻度', 'Off scale') : st.needle.toFixed(2) + ' mA', st.over ? 'bad' : '']);
    out.push([T('靈敏度', 'Sensitivity'), '×' + st.sens[m].toFixed(2)]);
    if (m === 'reflect') {
      out.push({ sec: T('角度計', 'Goniometer') });
      out.push([T('金屬板', 'Metal plate'), st.plate ? T('裝上', 'in place') : T('取下', 'removed')]);
      if (st.plate) out.push([T('入射角 θ<sub>i</sub>', 'Incidence θ<sub>i</sub>'), st.thetaI.toFixed(1) + '°']);
      out.push([T('角度計 ψ', 'Goniometer ψ'), st.psiR.toFixed(1) + '°']);
      if (st.plate) out.push([T('反射角 θ<sub>r</sub> = ψ − θ<sub>i</sub>', 'θ<sub>r</sub> = ψ − θ<sub>i</sub>'), (st.psiR - st.thetaI).toFixed(1) + '°' + (inShadow() ? '<small>' + T('接收器在金屬板後面', 'receiver behind the plate') + '</small>' : '')]);
    } else if (m === 'refract') {
      const p = C.prismFromPsi(st.psiP, K.prismA);
      out.push({ sec: T('稜鏡', 'Prism') });
      out.push([T('材料', 'Material'), matName(st.mat) + (nKnown() ? '<small>n = ' + nNow().toFixed(2) + '</small>' : '<small>n = ？</small>')]);
      out.push([T('角度計 ψ', 'Goniometer ψ'), st.psiP.toFixed(1) + '°']);
      out.push([T('偏向角 δ = 180° − ψ', 'Deviation δ = 180° − ψ'), p.delta.toFixed(1) + '°']);
      out.push([T('折射角 θ<sub>2</sub> = 30° + δ', 'θ<sub>2</sub> = 30° + δ'), p.theta2.toFixed(1) + '°']);
      out.push([T('由 ψ 算出的 n', 'n from this ψ'), p.n.toFixed(3)]);
    } else if (m === 'standing') {
      out.push({ sec: T('探針', 'Probe') });
      out.push([T('位置 x', 'Position x'), st.s.toFixed(2) + ' cm']);
      out.push([T('到反射板的距離', 'Distance to the plate'), (K.plateS - st.s).toFixed(2) + ' cm']);
      if (st.pending) {
        out.push([T('起點 x<sub>0</sub>', 'Start x<sub>0</sub>'), st.pending.x0.toFixed(2) + ' cm']);
        out.push([T('Δx = |x − x<sub>0</sub>|', 'Δx = |x − x<sub>0</sub>|'), Math.abs(st.s - st.pending.x0).toFixed(2) + ' cm']);
      }
      out.push([T('要數到第 N 個波節', 'Count to node N'), String(st.N)]);
    } else {
      out.push({ sec: T('偏振', 'Polarization') });
      out.push([T('距離 d', 'Distance d'), st.d.toFixed(1) + ' cm']);
      out.push([T('柵 1', 'Grid 1'), st.g1on ? st.g1 + '°' : T('未放', 'not in place')]);
      out.push([T('柵 2', 'Grid 2'), st.g2on ? st.g2 + '°' : T('未放', 'not in place')]);
      out.push([T('接收器轉動 ρ', 'Receiver turned ρ'), st.rx + '°']);
    }
    out.push({ sec: T('微波', 'Microwaves') });
    out.push([T('頻率 f', 'Frequency f'), fKnown() ? fNow().toFixed(3) + ' GHz' : '？']);
    out.push([T('波長 λ = c ／ f', 'Wavelength λ = c / f'), fKnown() ? lamNow().toFixed(3) + ' cm' : '？']);
    $('readout').innerHTML = dl(out);
  }
  function buildSteps() {
    const m = st.mode, rows = st.rows[m];
    let items;
    if (m === 'reflect') {
      const cover = [20, 30, 40, 50, 60, 70, 80].every(function (a) { return rows.some(function (r) { return Math.abs(r.thetaI - a) < 0.01; }); });
      items = [
        [T('先取下金屬板，接收臂轉到 180°，確認兩喇叭正對時電表有讀數。', 'Remove the plate, turn the arm to 180° and check that the meter reads something with the horns face to face.'), st.aligned],
        [T('裝上金屬板，入射角調到 20°。', 'Put the plate in place and set the angle of incidence to 20°.'), st.plate || rows.length > 0],
        [T('轉動接收臂，找到讀數最大的位置，按「記錄」。', 'Swing the receiver arm to the largest reading and press “Record”.'), rows.length > 0],
        [T('入射角每次加 10°，做到 80°。', 'Increase the angle of incidence by 10° at a time up to 80°.'), cover],
        [T('看下方的分析：反射角與入射角有什麼關係？', 'Look at the analysis below: how is θr related to θi?'), cover]
      ];
    } else if (m === 'refract') {
      const tr = st.trace.refract, scanned = tr && sortedTrace(tr).filter(function (p) { return p[0] < 176; }).length >= 8;
      items = [
        [T('稜鏡放在轉台上，發射器緊貼 30° 角旁邊的那一面。選擇材料。', 'The prism sits on the turntable with the transmitter pressed against the face next to the 30° corner. Choose the material.'), st.refractSeen || rows.length > 0],
        [T('在斜面那一側轉動接收臂，找出讀數最大的位置。', 'Swing the receiver arm on the slanted side and find the largest reading.'), scanned || rows.length > 0],
        [T('按「記錄」：ψ 換算成 θ2，再用司乃耳定律算 n。', 'Press “Record”: ψ is converted to θ2 and Snell’s law gives n.'), rows.length > 0],
        [T('重做幾次（每次重新找最大值），取平均。', 'Repeat a few times (finding the maximum again each time) and average.'), rows.length >= 3]
      ];
    } else if (m === 'standing') {
      items = [
        [T('探針放在發射器與反射板的中間（約 40 cm）。', 'Put the probe half way between the transmitter and the plate (about 40 cm).'), st.standMoved || !!st.pending || rows.length > 0],
        [T('往發射器方向慢慢移動，找到讀數最小的位置（波節），按「記錄起點」。', 'Move slowly towards the transmitter to the smallest reading (a node) and press “Record start”.'), !!st.pending || rows.length > 0],
        [T('繼續移動並數波節，到第 N 個波節按「記錄終點」。', 'Keep moving and count the nodes; at node N press “Record end”.'), rows.length > 0],
        [T('重做 5 次，平均得到波長，再算出頻率。', 'Repeat 5 times, average the wavelength and work out the frequency.'), rows.length >= 5]
      ];
    } else {
      const rv = polarRowsView(), has = function (a) { return rv.some(function (r) { return r.g1on && r.g2on && Math.abs(r.g1) < 0.01 && Math.abs(r.rx) < 0.01 && Math.abs(r.g2 - a) < 0.01 && r.ratio != null; }); };
      const all = [30, 45, 60, 90].every(has);
      items = [
        [T('不放偏極柵，調整兩喇叭的距離，讓讀數夠大但不超過滿刻度。', 'Without the grids, adjust the distance so the reading is large but on the scale.'), st.polarAdj || rv.length > 0],
        [T('放上兩片偏極柵、隙縫都水平（0°），按「記錄」得到 I0。', 'Put in both grids with horizontal slits (0°) and press “Record” to get I0.'), has(0)],
        [T('把柵 2 轉到 30°、45°、60°、90°，各記錄一次。', 'Turn grid 2 to 30°, 45°, 60° and 90° and record each.'), all],
        [T('比較 I／I0 與 cos<sup>4</sup>θ：看下方的圖與分析。', 'Compare I/I0 with cos<sup>4</sup>θ: see the graph and analysis below.'), all]
      ];
    }
    let nowSet = false;
    $('steps').innerHTML = items.map(function (it) {
      let cls = it[1] ? 'done' : '';
      if (!it[1] && !nowSet) { cls = 'now'; nowSet = true; }
      return '<li' + (cls ? ' class="' + cls + '"' : '') + '>' + it[0] + '</li>';
    }).join('');
  }
  function defaultStatus() {
    if (st.over) return { t: T('指針超過滿刻度：把接收器的靈敏度調低。', 'The needle is off the scale: turn the receiver sensitivity down.'), c: 'warn' };
    const m = st.mode;
    if (m === 'reflect') {
      if (!st.plate) return { t: st.psiR >= 179.5 ? T('兩喇叭正對（ψ = 180°）。確認有讀數後，裝上金屬板。', 'The horns face each other (ψ = 180°). Once you see a reading, put the plate in place.') : T('先把接收臂轉到 180°，讓兩喇叭正對。', 'First turn the receiver arm to 180° so the horns face each other.') };
      return { t: T('拖曳接收器或按 ◀ ▶ 轉動接收臂，找到讀數最大的位置，再按「記錄」。', 'Drag the receiver or use ◀ ▶ to find the largest reading, then press “Record”.') };
    }
    if (m === 'refract') return { t: T('轉動接收臂（拖曳接收器或按 ◀ ▶），找到讀數最大的位置，按「記錄」。', 'Swing the receiver arm (drag it or use ◀ ▶) to the largest reading and press “Record”.') };
    if (m === 'standing') {
      return st.pending ? { t: T('起點已記下。繼續往同一方向移動，數到第 ', 'Start recorded. Keep moving the same way, count to node ') + st.N + T(' 個波節，按「記錄終點」。', ' and press “Record end”.') }
        : { t: T('移動探針（拖曳或按 ◀ ▶），找到讀數最小的位置，按「記錄起點」。', 'Move the probe (drag it or use ◀ ▶) to the smallest reading and press “Record start”.') };
    }
    return { t: T('調整偏極柵的角度，按「記錄」。θ = 0° 的那一筆是 I0。', 'Set the grid angles and press “Record”. The row at θ = 0° is I0.') };
  }
  function sayStatus(text, ms, cls) {
    st.status = text; st.statusCls = cls || ''; st.statusUntil = now() + (ms || 5000) / 1000;
    panelsDirty = true; schedule();
  }
  function buildStatus() {
    const el = $('status');
    let t, c = '';
    if (st.status && now() < st.statusUntil) { t = st.status; c = st.statusCls; }
    else { const d = defaultStatus(); t = d.t; c = d.c || ''; st.status = ''; }
    if (el.innerHTML !== t) el.innerHTML = t;
    el.className = 'status' + (c ? ' ' + c : '');
  }
  function buildButtons() {
    const rb = $('recBtn');
    const tx = st.mode === 'standing' ? (st.pending ? T('記錄終點', 'Record end') : T('記錄起點', 'Record start')) : T('記錄', 'Record');
    if (rb.textContent !== tx) rb.textContent = tx;
    const und = $('undo');
    und.disabled = !st.rows[st.mode].length && !(st.mode === 'standing' && st.pending);
    const sp = nudgeSpec();
    $('nudgeName').innerHTML = sp.name + ' <b>' + sp.fmt(val(sp.el)) + '</b>';
    $('dataTitle').textContent = {
      reflect: T('數據表：反射', 'Data: reflection'), refract: T('數據表：折射', 'Data: refraction'),
      standing: T('數據表：駐波與波長', 'Data: standing waves and wavelength'), polar: T('數據表：偏振', 'Data: polarization')
    }[st.mode];
    const lg = $('gLegend');
    const leg = {
      reflect: '<span style="color:var(--accent)"><i class="dot" style="background:var(--accent)"></i>' + T('數據', 'data') + '</span><span style="color:var(--muted)"><i class="dash"></i>θr = θi</span>',
      refract: '<span style="color:var(--accent)"><i style="background:var(--accent)"></i>' + T('讀數掃描', 'reading scan') + '</span><span style="color:var(--pos)"><i class="dot" style="background:var(--pos)"></i>' + T('記錄的位置', 'recorded') + '</span>' + (nKnown() ? '<span style="color:var(--muted)"><i class="dash"></i>' + T('司乃耳定律預測（中心射線）', 'Snell’s law (centre ray)') + '</span>' : ''),
      standing: '<span style="color:var(--accent)"><i style="background:var(--accent)"></i>' + T('讀數掃描', 'reading scan') + '</span><span style="color:var(--neg)"><i class="dot" style="background:var(--neg)"></i>' + T('起點', 'start') + '</span><span style="color:var(--pos)"><i class="dot" style="background:var(--pos)"></i>' + T('終點', 'end') + '</span>',
      polar: '<span style="color:var(--accent)"><i style="background:var(--accent)"></i>cos<sup>4</sup>θ</span><span style="color:var(--muted)"><i class="dash"></i>cos<sup>2</sup>θ</span><span style="color:var(--pos)"><i class="dot" style="background:var(--pos)"></i>' + T('轉偏極柵', 'grid turned') + '</span><span style="color:var(--neg)"><i class="dot" style="background:var(--neg);border-radius:1px"></i>' + T('只轉接收器', 'receiver turned') + '</span>'
    }[st.mode];
    if (lg.innerHTML !== leg) lg.innerHTML = leg;
  }

  // ---------------- 任務事件 ----------------
  let touched = false, silent = false;
  function emit(type, data) { if (touched && window.LabMission) window.LabMission.emit(type, data); }
  let stateTimer = 0;
  function emitState() {
    if (!touched || stateTimer) return;
    stateTimer = setTimeout(function () {
      stateTimer = 0;
      const pr = st.mode === 'polar' ? C.polarSignal(polarP()) : null;
      const I = readingTrue();
      emit('state', {
        mode: st.mode, err: st.err, plate: st.plate, thetaI: st.thetaI, psi: st.mode === 'refract' ? st.psiP : st.psiR,
        shadow: inShadow(), reading: I, over: I > FS, sens: st.sens[st.mode],
        g1on: st.g1on, g1: st.g1, g2on: st.g2on, g2: st.g2, rx: st.rx, d: st.d, amp2: pr ? pr.amp * pr.amp : null, s: st.s
      });
    }, 220);
  }

  // ---------------- 記錄 ----------------
  function peakPsiReflect() {
    const p = reflectP(), a = Math.max(30, 2 * st.thetaI - 30), b = Math.min(180, 2 * st.thetaI + 30);
    return C.extremum(function (x) { p.psi = x; return C.reflectSignal(p); }, a, b, 1, 240);
  }
  function peakPsiRefract() {
    const p = refractP();
    return C.extremum(function (x) { p.psi = x; return C.refractSignal(p); }, 110, 180, 1, 140);
  }
  function settled() { return Math.abs(st.needle - readingAt(now())) < 0.015 + 0.03 * st.needle; }
  function record() {
    touched = true;
    const m = st.mode, rows = st.rows[m], I = round(st.needle, 2);
    if (m !== 'standing' && st.over) { sayStatus(T('指針超過滿刻度，無法讀數：先把靈敏度調低。', 'The needle is off the scale, so it cannot be read: turn the sensitivity down first.'), 5000, 'warn'); return; }
    const shaky = !settled();
    let row = null;
    if (m === 'reflect') {
      if (!st.plate) { sayStatus(T('還沒有裝上金屬板：先按「裝上」。', 'The plate is not in place yet: press “In place” first.'), 4500, 'warn'); return; }
      row = { mode: m, thetaI: st.thetaI, psi: st.psiR, thetaR: st.psiR - st.thetaI, I: I, err: st.err, fTrue: fNow(), psiPeak: peakPsiReflect(), sens: st.sens[m] };
    } else if (m === 'refract') {
      const p = C.prismFromPsi(st.psiP, K.prismA);
      row = { mode: m, mat: st.mat, psi: st.psiP, delta: p.delta, theta2: p.theta2, n: p.n, I: I, nAcc: nNow(), unknown: st.mat === 'unknown', revealed: st.mat === 'unknown' && st.revealed.n,
        err: st.err, fTrue: fNow(), psiPeak: peakPsiRefract() };
      row.nPeak = C.prismFromPsi(row.psiPeak, K.prismA).n;
    } else if (m === 'standing') {
      const read = round(st.err ? st.s + (rand() * 2 - 1) * 0.03 : st.s, 2);
      if (!st.pending) {
        st.pending = { x0: read };
        sayStatus(T('起點 x0 = ', 'Start x0 = ') + read.toFixed(2) + T(' cm 已記下。繼續往同一方向移動，數到第 ', ' cm recorded. Keep moving the same way, count to node ') + st.N + T(' 個波節，按「記錄終點」。', ' and press “Record end”.'), 7000, 'ok');
        flash(); dataDirty = true; panelsDirty = true; schedule();
        emit('start', { x0: read, s: st.s, err: st.err });
        return;
      }
      const x0 = st.pending.x0, dx = Math.abs(read - x0);
      if (dx < 0.3) { sayStatus(T('終點和起點幾乎在同一個位置：先移動探針、數波節。', 'The end is at the start: move the probe and count the nodes first.'), 4500, 'warn'); return; }
      const lam = C.lambdaFromNodes(x0, read, st.N), f0 = fNow();
      row = { mode: m, x0: x0, x1: read, N: st.N, dx: dx, lam: lam, f: C.freqGHz(lam), fTrue: f0, lamTrue: C.lambdaCm(f0), unknown: st.freq === 'unknown', revealed: st.freq === 'unknown' && st.revealed.f, err: st.err };
      st.pending = null;
    } else {
      row = { mode: m, g1on: st.g1on, g1: st.g1, g2on: st.g2on, g2: st.g2, rx: st.rx, d: st.d, sens: st.sens[m], I: I, err: st.err, fTrue: fNow(), amp2: (function () { const r = C.polarSignal(polarP()); return r.amp * r.amp; })() };
      const ref = isRef(row) ? row : refFor(rows, row);
      row.ref = ref ? ref.I : null;
      row.ratio = ref ? row.I / ref.I : null;
      const pa = polarAngle(row); row.theta = pa.theta; row.kind = pa.kind;
    }
    rows.push(row);
    flash();
    dataDirty = true; panelsDirty = true;
    let msg = T('已記錄第 ', 'Recorded row ') + rows.length + T(' 筆。', '.');
    if (shaky && m !== 'standing') msg += T('（指針還在動，讀數可能不準：等它停下再記錄。）', ' (The needle was still moving — wait for it to settle.)');
    const cm = T('，', ', '), stop = T('。', '. ');
    if (m === 'reflect') msg += ' θ<sub>i</sub> = ' + row.thetaI.toFixed(1) + '°' + cm + 'θ<sub>r</sub> = ψ − θ<sub>i</sub> = ' + row.thetaR.toFixed(1) + '°' + stop + T('把入射角加 10°，再找一次最大值。', 'Add 10° to the angle of incidence and find the maximum again.');
    if (m === 'refract') msg += ' ' + T('偏向角', 'Deviation') + ' δ = ' + row.delta.toFixed(1) + '°' + cm + 'n = ' + row.n.toFixed(3) + T('。', '.');
    if (m === 'polar') msg += ' I = ' + row.I.toFixed(2) + ' mA' + (row.ratio != null ? cm + 'I/I<sub>0</sub> = ' + row.ratio.toFixed(3) : '') + T('。', '.');
    if (m === 'standing') msg += ' λ = ' + row.lam.toFixed(3) + ' cm。' + T('探針可以留在這裡當下一次的起點。', 'You can use this position as the next start.');
    sayStatus(msg, 6000, shaky && m !== 'standing' ? 'warn' : 'ok');
    schedule();
    emit('record', { mode: m, row: Object.assign({}, row), rows: rows.map(function (r) { return Object.assign({}, r); }), err: st.err, revealedF: st.revealed.f, revealedN: st.revealed.n });
  }
  function flash() { st.flash = reduced ? 0 : 1; }

  // ---------------- 介面 ----------------
  const els = {
    thetaI: $('thetaI'), psiR: $('psiR'), psiP: $('psiP'), probe: $('probe'), nNodes: $('nNodes'), dist: $('dist'),
    g1: $('g1'), g2: $('g2'), rxRot: $('rxRot'), sens: $('sens')
  };
  if (window.LabNum) {
    window.LabNum.register(els.sens, {
      toValue: function (p) { return Math.pow(10, (p - 500) / 500); },
      toPos: function (v) { return 500 + 500 * Math.log10(v); },
      min: 0.1, max: 10, decimals: 2
    });
  }
  const sensVal = function () { return clamp(val(els.sens), 0.1, 10); };
  function setOut(id, text) { const o = $(id + 'o'); if (o && o.textContent !== text) o.textContent = text; }
  function syncOutputs() {
    setOut('thetaI', st.thetaI.toFixed(1).replace(/\.0$/, '') + '°');
    setOut('psiR', st.psiR.toFixed(1) + '°');
    setOut('psiP', st.psiP.toFixed(1) + '°');
    setOut('probe', st.s.toFixed(2) + ' cm');
    setOut('nNodes', String(st.N));
    setOut('dist', st.d.toFixed(1) + ' cm');
    setOut('g1', String(st.g1).replace(/(\.\d)\d+$/, '$1') + '°');
    setOut('g2', String(st.g2).replace(/(\.\d)\d+$/, '$1') + '°');
    setOut('rxRot', String(st.rx) + '°');
    setOut('sens', '×' + st.sens[st.mode].toFixed(2));
    els.g1.disabled = !st.g1on; els.g2.disabled = !st.g2on;
    document.querySelectorAll('[data-g2]').forEach(function (b) { b.setAttribute('aria-pressed', String(st.g2on && Math.abs(+b.getAttribute('data-g2') - st.g2) < 1e-6)); });
  }
  // 可以移動的物件（拖曳、◀ ▶ 按鈕、鍵盤共用同一份設定與限制）。偏極柵不能拖曳，但 ◀ ▶ 與鍵盤可以轉。
  const fDeg1 = function (v) { return v.toFixed(1) + '°'; };
  const fDegR = function (v) { return round(v, 1) + '°'; };
  const KEYDEF = {
    arm: { el: function () { return st.mode === 'reflect' ? els.psiR : els.psiP; }, small: 0.5, big: 5, name: 'ψ', fmt: fDeg1,
      long: function () { return T('接收器（角度計讀數 ψ）', 'receiver (goniometer reading ψ)'); } },
    plate: { el: function () { return els.thetaI; }, small: 1, big: 5, name: 'θ<sub>i</sub>', fmt: fDeg1,
      long: function () { return T('金屬板（入射角 θi）', 'metal plate (angle of incidence θi)'); } },
    probe: { el: function () { return els.probe; }, small: 0.01, big: 0.1, name: 'x', fmt: function (v) { return v.toFixed(2) + ' cm'; },
      long: function () { return T('探針（位置 x）', 'probe (position x)'); } },
    g2: { el: function () { return els.g2; }, small: 1, big: 5, name: T('柵 2', 'Grid 2'), fmt: fDegR,
      long: function () { return T('偏極柵 2（隙縫角度）', 'grid 2 (slit angle)'); } },
    g1: { el: function () { return els.g1; }, small: 1, big: 5, name: T('柵 1', 'Grid 1'), fmt: fDegR,
      long: function () { return T('偏極柵 1（隙縫角度）', 'grid 1 (slit angle)'); } },
    rx: { el: function () { return els.dist; }, small: 0.1, big: 1, name: 'd', fmt: function (v) { return v.toFixed(1) + ' cm'; },
      long: function () { return T('接收器（兩喇叭距離 d）', 'receiver (horn distance d)'); } }
  };
  /** 目前這個實驗可以移動的物件（第一個是預設選取的） */
  function keyIds() {
    const m = st.mode;
    if (m === 'reflect') return st.plate ? ['arm', 'plate'] : ['arm'];
    if (m === 'refract') return ['arm'];
    if (m === 'standing') return ['probe'];
    const out = [];
    if (st.g2on) out.push('g2');
    if (st.g1on) out.push('g1');
    out.push('rx');
    return out;
  }
  let kSel = null;   // 選取的物件（拖曳或鍵盤選取後，◀ ▶ 也改動它）
  function curKey() { const ids = keyIds(); return ids.indexOf(kSel) >= 0 ? kSel : ids[0]; }
  function nudgeSpec() {
    const d = KEYDEF[curKey()];
    return { el: d.el(), small: d.small, big: d.big, name: typeof d.name === 'function' ? d.name() : d.name, fmt: d.fmt };
  }
  /** 依目前選取的物件微調；回傳是否真的動了 */
  function nudge(dir, big) {
    const sp = nudgeSpec(), el = sp.el, before = val(el);
    const v = clamp(round(before + dir * (big ? sp.big : sp.small), 4), +el.min, +el.max);
    touched = true;
    if (Math.abs(v - before) < 1e-9) return false;
    if (window.LabNum) window.LabNum.set(el, v); else { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
    return true;
  }
  [['nudgeLL', -1, true], ['nudgeL', -1, false], ['nudgeR', 1, false], ['nudgeRR', 1, true]].forEach(function (b) {
    const btn = $(b[0]);
    let timer = 0, count = 0;
    const stop = function () { if (timer) clearTimeout(timer); timer = 0; };
    const rep = function () { count++; nudge(b[1], b[2] || count > 14); timer = setTimeout(rep, 80); };
    btn.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault(); count = 0; nudge(b[1], b[2]); stop(); timer = setTimeout(rep, 420);
      try { btn.setPointerCapture(e.pointerId); } catch (er) { /* 忽略 */ }
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { btn.addEventListener(ev, stop); });
    btn.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nudge(b[1], b[2]); } });
  });

  function onChange(opts) {
    opts = opts || {};
    if (!silent) touched = true;
    syncOutputs();
    ensureField();
    if (!opts.noTrace) sampleTrace();
    if (st.mode === 'reflect' && !st.plate && st.psiR >= 179.5 && readingTrue() > 0.05) st.aligned = true;
    panelsDirty = true;
    if (!silent) { emitState(); srDue = Math.max(srDue, now() + 1); }
    schedule();
  }
  function bindRange(el, apply) {
    el.addEventListener('input', function () { apply(val(el)); onChange(); });
  }
  bindRange(els.thetaI, function (v) { st.thetaI = clamp(v, 10, 85); });
  bindRange(els.psiR, function (v) { st.psiR = clamp(v, 30, 180); });
  bindRange(els.psiP, function (v) { st.psiP = clamp(v, 110, 180); st.refractSeen = true; });
  bindRange(els.probe, function (v) { st.s = clamp(v, 14, 68); st.standMoved = true; });
  bindRange(els.nNodes, function (v) { st.N = Math.round(clamp(v, 1, 10)); });
  bindRange(els.dist, function (v) { st.d = clamp(v, 30, 70); st.polarAdj = true; });
  bindRange(els.g1, function (v) { st.g1 = clamp(v, 0, 180); });
  bindRange(els.g2, function (v) { st.g2 = clamp(v, 0, 180); });
  bindRange(els.rxRot, function (v) { st.rx = clamp(v, 0, 180); });
  els.sens.addEventListener('input', function () { st.sens[st.mode] = sensVal(); onChange({ noTrace: true }); });
  $('g1on').addEventListener('change', function () { st.g1on = this.checked; onChange(); });
  $('g2on').addEventListener('change', function () { st.g2on = this.checked; onChange(); });

  function segGroup(attr, apply) {
    const btns = Array.prototype.slice.call(document.querySelectorAll('[data-' + attr + ']'));
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        if (attr !== 'g2') btns.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        touched = true;
        apply(b.getAttribute('data-' + attr));
      });
    });
    return function (value) { btns.forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-' + attr) === String(value) ? 'true' : 'false'); }); };
  }
  const setModeBtns = segGroup('mode', function (m) { setMode(m); });
  segGroup('plate', function (x) { if (!st.plate && st.psiR >= 179.5) st.aligned = true; st.plate = x === '1'; onChange(); });
  segGroup('mat', function (x) { st.mat = x; st.refractSeen = true; onChange(); dataDirty = true; });
  segGroup('freq', function (x) { st.freq = x; onChange(); dataDirty = true; });
  segGroup('err', function (x) { st.err = x === '1'; onChange(); });
  segGroup('g2', function (x) {
    st.g2on = true; $('g2on').checked = true;
    if (window.LabNum) window.LabNum.set(els.g2, +x); else { els.g2.value = x; st.g2 = +x; onChange(); }
  });
  function setMode(m) {
    if (MODES.indexOf(m) < 0) return;
    st.mode = m;
    setModeBtns(m);
    MODES.forEach(function (k) { $('ctl-' + k).hidden = k !== m; });
    $('legNormal').hidden = m === 'standing' || m === 'polar';       // 這兩個實驗的圖上沒有法線
    silent = true;
    if (window.LabNum) window.LabNum.set(els.sens, st.sens[m]); else els.sens.value = 500 + 500 * Math.log10(st.sens[m]);
    silent = false;
    st.needle = readingAt(now()); st.over = st.needle > FS;
    layoutMain();
    ensureField();
    if (!st.trace[m]) sampleTrace();
    dataDirty = true; panelsDirty = true;
    if (view3) view3.onMode();
    schedule();
  }

  $('recBtn').addEventListener('click', record);
  $('clearAll').addEventListener('click', function () {
    touched = true;
    MODES.forEach(function (k) { st.rows[k] = []; st.trace[k] = null; });
    st.pending = null; st.revealed = { f: false, n: false };
    st.aligned = false; st.refractSeen = false; st.standMoved = false; st.polarAdj = false;
    randomize();
    silent = true;
    if (window.LabNum) window.LabNum.set(els.probe, 40); else els.probe.value = 40;
    st.s = 40;
    silent = false;
    onChange();
    dataDirty = true;
    sayStatus(T('已全部清除：四個實驗的數據表與讀數掃描都清掉了，探針回到 40 cm；未知頻率、未知材料與系統誤差都換了新的。', 'Cleared: the tables and reading scans of all four parts are empty and the probe is back at 40 cm; the unknown frequency, the unknown material and the systematic error are new.'), 6000);
  });
  $('undo').addEventListener('click', function () {
    touched = true;
    if (st.mode === 'standing' && st.pending) st.pending = null;
    else st.rows[st.mode].pop();
    dataDirty = true; panelsDirty = true; schedule();
  });
  $('reveal').addEventListener('click', function () {
    touched = true;
    if (st.mode === 'refract') { st.revealed.n = true; sayStatus(T('未知材料的折射率是 n = ', 'The unknown material has n = ') + st.nU.toFixed(3) + T('。', '.'), 8000, 'ok'); }
    else { st.revealed.f = true; sayStatus(T('發射器的頻率是 f = ', 'The transmitter frequency is f = ') + st.fU.toFixed(3) + T(' GHz（λ = ', ' GHz (λ = ') + C.lambdaCm(st.fU).toFixed(3) + T(' cm）。', ' cm).'), 8000, 'ok'); }
    dataDirty = true; panelsDirty = true; schedule();
  });
  $('waveBtn').addEventListener('click', function () {
    st.waves = !st.waves;
    this.setAttribute('aria-pressed', String(st.waves));
    this.textContent = st.waves ? T('暫停波動', 'Pause the waves') : T('播放波動', 'Play the waves');
    schedule();
  });
  if (reduced) { const wb = $('waveBtn'); wb.setAttribute('aria-pressed', 'false'); wb.textContent = T('播放波動', 'Play the waves'); }

  // ---------------- 拖曳 ----------------
  function ptr(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function hit(p) {
    if (p.y > sceneH) return null;
    const x = WX(p.x), y = WY(p.y), m = st.mode;
    if (m === 'reflect' || m === 'refract') {
      const r = Math.hypot(x, y);
      if (m === 'reflect' && st.plate && r < 13.5) {
        const th = st.thetaI * DEG, along = x * Math.sin(th) + y * Math.cos(th), off = -x * Math.cos(th) + y * Math.sin(th);
        if (Math.abs(along) <= 13 && Math.abs(off) < 2.6 && r > 2) return { kind: 'plate' };
      }
      if (r > 9 && y > -6) {
        const a = Math.atan2(y, -x) / DEG;
        if (Math.abs(a - (m === 'reflect' ? st.psiR : st.psiP)) < 25 || r > 14) return { kind: 'arm' };
      }
      return null;
    }
    if (m === 'standing') {
      if (p.y < topH) return { kind: 'mag', x0: p.x, s0: st.s };
      if (x > 10.5 && x < 69.5) return { kind: 'probe' };
      return null;
    }
    if (p.y < topH) return null;
    if (x > 8 && x < 94) return { kind: 'rx' };
    return null;
  }
  let drag = null;
  function applyDrag(p) {
    const x = WX(p.x), y = WY(p.y);
    if (drag.kind === 'arm') {
      const a = Math.atan2(y, -x) / DEG;
      const v = a < -90 ? 180 : a < 0 ? (st.mode === 'reflect' ? 30 : 180) : a;
      const el = st.mode === 'reflect' ? els.psiR : els.psiP;
      setVal(el, round(clamp(v, +el.min, +el.max) * 2, 0) / 2);
    } else if (drag.kind === 'plate') {
      const sx = y >= 0 ? 1 : -1;
      let th = Math.atan2(sx * x, sx * y) / DEG;
      setVal(els.thetaI, Math.round(clamp(th, 10, 85)));
    } else if (drag.kind === 'probe') {
      setVal(els.probe, round(clamp(x, 14, 68), 2));
    } else if (drag.kind === 'mag') {
      const pxcm = clamp((W - 20) / 7.5, 40, 96);
      setVal(els.probe, round(clamp(drag.s0 + (p.x - drag.x0) / pxcm, 14, 68), 2));
    } else if (drag.kind === 'rx') {
      setVal(els.dist, round(clamp(x - 1, 30, 70), 1));
    }
  }
  function setVal(el, v) { if (window.LabNum) window.LabNum.set(el, v); else { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } }
  cv.addEventListener('pointerdown', function (e) {
    const p = ptr(e), h = hit(p);
    if (!h) return;
    e.preventDefault();
    touched = true;
    drag = h;
    selectKey(h.kind === 'mag' ? 'probe' : h.kind);
    try { cv.setPointerCapture(e.pointerId); } catch (er) { /* 忽略 */ }
    cv.classList.add('grab');
    if (h.kind !== 'mag') applyDrag(p);
  });
  cv.addEventListener('pointermove', function (e) {
    const p = ptr(e);
    if (drag) { applyDrag(p); return; }
    cv.classList.toggle('grab', !!hit(p));
  });
  const endDrag = function () { drag = null; cv.classList.remove('grab'); };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------------- 鍵盤操作（js/keys.js）：Enter 切換物件、方向鍵移動（與 ◀ ▶ 同樣的步長與限制）、Shift 大步、R 記錄 ----------------
  const kbItems = [];   // 依實驗而變；LabKeys 直接讀這個陣列
  let kb = null, srDue = 0, lastSr = '';
  function meterText() { const r = readingAt(now()); return r > FS ? T('超過滿刻度', 'off scale') : r.toFixed(2) + ' mA'; }
  function describeKey(id) {
    const d = KEYDEF[id], el = d.el();
    const v = d.fmt(val(el)).replace(/<[^>]+>/g, '');
    return d.long() + ' ' + v + T('，電表讀數 ', ', meter reading ') + meterText() + T('。', '.');
  }
  function keyItem(id) {
    return {
      id: id,
      name: function () { return KEYDEF[id].long(); },
      move: function (dx, dy, big) {
        if (stage.classList.contains('is3d')) return false;
        kSel = id;
        const moved = nudge(dx || dy, big);
        srDue = 0;          // 鍵盤移動已由 keys.js 播報讀數，不必再播一次
        return moved;
      },
      describe: function () { return describeKey(id); }
    };
  }
  /** 依目前實驗重建物件清單，並讓鍵盤的選取與 kSel 一致 */
  function syncKeys() {
    const ids = keyIds();
    const same = ids.length === kbItems.length && ids.every(function (id, i) { return kbItems[i].id === id; });
    if (!same) { kbItems.length = 0; ids.forEach(function (id) { kbItems.push(keyItem(id)); }); }
    const want = ids.indexOf(curKey());
    if (kb && kb.index() !== want) kb.select(want);
  }
  function selectKey(id) { kSel = id; syncKeys(); panelsDirty = true; schedule(); }
  if (window.LabKeys) {
    syncKeys();
    kb = window.LabKeys.attach(cv, {
      label: T('俯視圖：角度計、微波發射器與接收器、金屬板或稜鏡或偏極柵、電場的波動，下方是毫安培計與讀數掃描圖。可拖曳接收器、金屬板或探針；鍵盤操作：Enter 切換物件，方向鍵移動，Shift 加方向鍵移動較多，R 記錄。',
        'Top view: the goniometer, the microwave transmitter and receiver, the metal plate, prism or grids, and the electric field of the waves; below are the milliammeter and a scan of the readings. Drag the receiver, the plate or the probe. Keyboard: Enter picks an object, the arrow keys move it, Shift with an arrow key moves it further, R records.'),
      items: kbItems,
      onChange: function () {
        const it = kbItems[kb.index()];
        if (it) kSel = it.id;      // 先記下鍵盤選的物件，再依目前實驗整理清單
        syncKeys();
        panelsDirty = true; schedule();
      }
    });
  }
  cv.addEventListener('keydown', function (e) {
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); record(); }
  });
  /** 鍵盤選取時，在選取的物件周圍畫虛線圓角框（--accent） */
  function drawKeyFocus(g) {
    if (!kb || !kb.focused()) return;
    const id = curKey(), pad = 5;
    g.save();
    g.strokeStyle = D.c.accent; g.lineWidth = 2; g.setLineDash([5, 4]); g.lineCap = 'round';
    if (id === 'arm' || id === 'rx') {
      // 接收器：喇叭開口在 r0，盒子尾端在 r0 + 喇叭長 + 盒長
      const ang = id === 'arm' ? 180 - (st.mode === 'reflect' ? st.psiR : st.psiP) : 0;
      const half = (K.hornLen + K.boxL) / 2, r0 = id === 'arm' ? K.arm - K.pc : st.d, rc = r0 + half;
      const cx = id === 'arm' ? rc * Math.cos(ang * DEG) : rc, cy = id === 'arm' ? rc * Math.sin(ang * DEG) : 0;
      const hl = half * sc + pad, hw = K.mouthW / 2 * sc + pad;
      g.translate(X(cx), Y(cy)); g.rotate(-ang * DEG);
      D.roundRect(g, -hl, -hw, 2 * hl, 2 * hw, 8); g.stroke();
    } else if (id === 'plate') {
      const th = st.thetaI * DEG, tx = -Math.sin(th), ty = -Math.cos(th);
      const hl = K.plateW / 2 * sc + pad, hw = Math.max(3.5, 0.6 * sc) / 2 + 1.1 * sc + pad;
      g.translate(X(0), Y(0)); g.rotate(-Math.atan2(ty, tx));
      D.roundRect(g, -hl, -hw, 2 * hl, 2 * hw, 8); g.stroke();
    } else if (id === 'probe') {
      const hw = Math.max(1.3 * sc, 6) + pad, y0 = Y(0) - Math.max(3.2, 0.55 * sc) - pad, y1 = Y(-13.3) + pad;
      D.roundRect(g, X(st.s) - hw, y0, 2 * hw, y1 - y0, 8); g.stroke();
    } else {
      const x = X(gridX(id === 'g1' ? 1 : 2)), hw = Math.max(4, 0.9 * sc) / 2 + pad;
      D.roundRect(g, x - hw, Y(12) - pad, 2 * hw, 24 * sc + 2 * pad, 8); g.stroke();
    }
    g.restore();
  }

  // ---------------- 動畫迴圈 ----------------
  let raf = 0, lastT = 0, panelsDirty = true, dataDirty = true, visible = true, lastPanel = 0;
  function schedule() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(ms) {
    raf = 0;
    const t = ms / 1000, dt = lastT ? Math.min(0.1, t - lastT) : 0;
    lastT = t;
    if (st.waves && !reduced) st.tWave += dt;
    if (fjob) stepField(12);
    // 指針
    const target = readingAt(now());
    st.over = target > FS;
    const goal = st.over ? 1.04 : target;
    const tau = st.err ? 0.3 : 0.12;
    const before = st.needle;
    st.needle = reduced || !dt ? goal : st.needle + (goal - st.needle) * (1 - Math.exp(-dt / tau));
    const moving = Math.abs(st.needle - goal) > 0.0005;
    if (Math.abs(before - st.needle) > 0.004 || st.over) { if (t - lastPanel > 0.12) panelsDirty = true; }
    if (st.flash > 0) st.flash = Math.max(0, st.flash - dt / 0.5);
    if (st.status && now() >= st.statusUntil) panelsDirty = true;
    if (view3 && view3.active) view3.frame(st.tWave);
    else drawMain(st.tWave);
    if (panelsDirty) { panelsDirty = false; lastPanel = t; syncKeys(); buildReadout(); buildSteps(); buildStatus(); buildButtons(); }
    // 螢幕閱讀器：讀數穩定後才念一次（最多每秒一次；不在每一格更新）
    if (srDue && now() >= srDue && !moving) {
      srDue = 0;
      const txt = T('電表讀數 ', 'Meter reading ') + meterText() + T('。', '.');
      if (txt !== lastSr) { lastSr = txt; $('srMeter').textContent = txt; }
    }
    if (dataDirty) { dataDirty = false; buildTable(); buildFit(); drawGraph(); }
    const animating = (st.waves && !reduced) || moving || fjob || st.err || st.flash > 0 || srDue || (st.status && now() < st.statusUntil + 0.2);
    if (animating && visible && !document.hidden) schedule(); else lastT = 0;
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) schedule(); });
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) schedule(); }).observe($('stage'));
  }

  // ---------------- 3D 檢視（three.js，切換到 3D 時才以 import() 動態載入 vendor/three/） ----------------
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  const bridge = {
    st: st, C: C, T: T, lamNow: lamNow, nNow: nNow, tiltNow: tiltNow, hpbwNow: hpbwNow, polarP: polarP, gridX: gridX,
    reading: function () { return st.over ? T('超過滿刻度', 'Off scale') : st.needle.toFixed(2) + ' mA'; },
    omega: OMEGA, reduced: reduced,
    lost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 平面。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  };
  function setPressed(m) { $('view2d').setAttribute('aria-pressed', String(m === '2d')); $('view3d').setAttribute('aria-pressed', String(m === '3d')); }
  function setView(m) {
    if (m === '3d') {
      if (view3 && view3.active) return;
      const token = ++loadToken;
      setPressed('3d');
      if (!webglAvailable() || !window.Microwave3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        view3 = window.Microwave3D.create(lib, host3, bridge);
        stage.classList.add('is3d');
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        schedule();
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
      relayout();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 平面。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    relayout();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ---------------- 啟動 ----------------
  function relayout() { layoutMain(); layoutGraph(); ensureField(); panelsDirty = true; dataDirty = true; schedule(); }
  if (window.ResizeObserver) {
    let lw = -1, lg = -1;
    new ResizeObserver(function () {
      const a = cv.clientWidth, b = gc.clientWidth;
      if ((a && a !== lw) || b !== lg) { if (a) lw = a; lg = b; relayout(); }
    }).observe(document.querySelector('.wrap'));
  } else window.addEventListener('resize', relayout);
  window.addEventListener('lab:themechange', function () {
    buildLUT(); staticLayer = null; if (fmap) fmap.tPainted = NaN;
    panelsDirty = true; dataDirty = true;
    if (view3) view3.onTheme();
    schedule();
  });
  buildLUT();
  silent = true;
  if (window.LabNum) window.LabNum.set(els.sens, 1);
  silent = false;
  syncOutputs();
  layoutMain();
  layoutGraph();
  ensureField();
  sampleTrace();
  st.needle = readingAt(now());
  schedule();

  // 測試用（Playwright 與任務證明）
  window.__mw = {
    st: st, C: C,
    reading: readingTrue, S: S, shadow: inShadow, peakReflect: peakPsiReflect, peakRefract: peakPsiRefract,
    set: function (el, v) { touched = true; setVal($(el), v); },
    settle: function () { st.needle = readingAt(now()); st.over = st.needle > FS; panelsDirty = true; schedule(); },
    record: record, mode: setMode, fieldReady: function () { return !fjob && !!fmap; }
  };
})();
