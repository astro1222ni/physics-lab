/* current-balance.js — 「電流天平」課本實驗的畫面與互動
 * 物理計算在 current-balance-core.js；3D 檢視在 current-balance-3d.js（three.js 切換到 3D 時才動態載入）。
 *
 * 世界座標（m，與物理核心相同）：z 沿螺線管軸、指向支點（管口 z = 0）；y 鉛直向上；x 水平、離開觀察者。
 * 2D 畫面用斜投影（cabinet）：正面（y–z 平面）不變形，所以長度、天平的傾角都依比例；
 * 深度 x 往右上方退後（每 1 cm 深度 → 畫面右移 0.40 cm、上移 0.28 cm）。螺線管與端板只畫後半塊（剖面圖）。
 */
(function () {
  'use strict';
  const C = window.CurrentBalanceCore;
  const LD = window.LabDraw;
  const cv = document.getElementById('cv');
  if (!C || !LD || !cv) return;
  const ctx = cv.getContext('2d');
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const isEn = function () { return !!(window.LabSettings && window.LabSettings.lang === 'en'); };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const A = LD.alpha, SH = LD.shade, MIX = LD.mix;
  const APP = C.APP, G = C.G;

  // ---------- 裝置尺寸（m） ----------
  const ZP = APP.zP;                               // 支點軸（管口外 1.5 cm）
  const YT = -0.050;                               // 桌面高度
  const KX = 0.40, KY = 0.28;                      // 斜投影的深度係數
  const S0 = -APP.len;                             // 繞線左端（管口在 z = 0）
  const RIN = APP.bore, RFO = 0.0265, ROUT = APP.rOut; // 管子內半徑、管壁外半徑、繞線外半徑
  const PT = 0.005, PH = 0.040, PXW = 0.040;       // 端板厚度、上緣高度、半寬
  const BWH = APP.boardW / 2, BT = 0.0015;         // 絕緣板半寬、半厚
  const UBC = APP.zBC - ZP;                        // bc 段在板上的位置（u = −d1）
  const U0 = UBC - 0.007, U1 = APP.rodR;           // 板子兩端（u 由支點量起，往外端為正）
  const UH = APP.d2, UTIP = APP.rTip;              // 掛勾、指針尖
  const ARM = APP.L / 2, SW = 0.0016;              // 側臂位置、銅條半寬
  const POSTX = 0.0245, POSTR = 0.0028;            // 支架銅柱
  const CARD = { x: 0.010, z0: ZP + 0.163, z1: ZP + 0.181, y0: -0.023, y1: 0.023 }; // 水平刻度板
  const STOPY = 0.168 * Math.sin(APP.thetaMax) + 0.0022; // 擋塊銷的高度
  const WX0 = -0.276, WX1 = 0.228, WY0 = -0.083, WY1 = 0.070; // 主畫面的世界範圍
  const FREF = 2e-3;                               // 受力箭頭：2 mN 的長度 = aRef
  const FBC_IDEAL = C.MU0 * APP.n * APP.L;         // 理想 bc 受力（每 A·A）
  const REAL = C.realFactor();                     // 真實螺線管：bc 與側臂的受力
  const USIDE = -REAL.side / REAL.sideForce;       // 側臂合力的作用位置（u）

  // ---------- 狀態 ----------
  const rnd = function (a) { return (Math.random() * 2 - 1) * a; };
  const cal = { e1: rnd(0.006), e2: rnd(0.006), eS: rnd(0.003) }; // 「含誤差」的電表與電子秤校正誤差（每次開頁不同）
  const st = {
    power: false, fromMin: false, I1: 0, I2: 0, s1: -1, s2: 1, // 一開始 ㄈ字形電路接反了（步驟 3 要學會把一個電流反向）
    len: 2.5, hung: false, piece: null, nut: APP.nutX0, mode: 'ideal', realSol: false, part: 1, graph: 1,
    show: { labels: true, field: true, force: true, flow: !LD.reducedMotion() },
    rows: [], steps: [false, false, false, false, false, false], combos: {}
  };
  const beam = { th: 0, om: 0 };
  let resting = true, flowT = 0;

  function cutPiece() {
    const dev = st.mode === 'real' ? rnd(0.02) : 0;
    const m = C.wireMass(st.len / 100, dev);
    const mg = Math.round(C.meter(m * 1e6, st.mode === 'real' ? cal.eS : 0, 1));
    st.piece = { len: st.len, m: m, mg: mg };
  }
  function I1t() { return st.power ? st.I1 : 0; }
  function I2t() { return st.power ? st.I2 : 0; }
  function I1m() { return Math.round(C.meter(I1t(), st.mode === 'real' ? cal.e1 : 0, 0.01) * 100) / 100; }
  function I2m() { return Math.round(C.meter(I2t(), st.mode === 'real' ? cal.e2 : 0, 0.01) * 100) / 100; }
  function torque() {
    return C.netTorque({ m: st.hung ? st.piece.m : 0, I1: I1t(), I2: I2t(), s1: st.s1, s2: st.s2, nut: st.nut, real: st.realSol });
  }
  function fric() { return st.mode === 'real' ? APP.tauF : 0; }
  function zeroOffMg() { return C.torqueToMass(APP.nutM * G * (st.nut - APP.nutOK) * 1e-3) * 1e6; }
  function tipUp() { return -C.tipOf(beam.th) * 1000; } // 指針尖偏離水平刻線（mm，外端偏高為正）
  function isLevel() { return Math.abs(tipUp()) <= APP.levelTip * 1000 + 1e-9; }
  function atStop() { return Math.abs(beam.th) >= APP.thetaMax - 1e-9; }
  function atRest() {
    if (beam.om !== 0) return false;
    const net = torque() - APP.kappa * Math.sin(beam.th);
    if (atStop() && net * beam.th > 0) return true;
    return Math.abs(net) <= fric() + 1e-10;
  }
  function currents() { return st.power && st.I1 > 0 && st.I2 > 0; }
  function magDown() { return currents() && st.s1 * st.s2 > 0; } // bc 受力向下（外端上翹）
  function Fbc() { return I1t() * I2t() * (st.realSol ? REAL.bcForce : FBC_IDEAL); }

  // ---------- 畫布版面 ----------
  let dpr = 1, W = 0, H = 0, s = 1000, ox = 0, oy = 0, narrow = false, aRef = 40;
  let meters = [], insA = null, insB = null, sceneH = 0;
  const tok = {};
  function readTokens() {
    const cs = getComputedStyle(document.documentElement);
    ['cb-copper', 'cb-board', 'cb-plate', 'cb-metal', 'cb-brass', 'cb-tube', 'cb-wire', 'cb-table', 'cb-led', 'cb-panel', 'cb-lead', 'cb-card']
      .forEach(function (k) { tok[k.slice(3)] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function layout() {
    W = cv.clientWidth;
    if (!W) return false;
    narrow = W < 600;
    s = W / (WX1 - WX0);
    ox = -WX0 * s; oy = WY1 * s;
    sceneH = (WY1 - WY0) * s;
    aRef = Math.max(16, Math.min(56, 0.026 * s));
    // 電表列：螺線管電源、天平電源、電子秤（放在各自裝置的下方）
    const my = Math.round(sceneH + 6), mh = narrow ? 64 : 78;
    if (narrow) {
      const mw = (W - 16) / 3;
      meters = [0, 1, 2].map(function (i) { return { x: i * (mw + 8), y: my, w: mw, h: mh }; });
    } else {
      const mw = Math.min(176, W * 0.22);
      const cx = [Math.max(mw / 2 + 2, X(S0 - 0.01) + mw * 0.32), X(ZP), Math.min(W - mw / 2 - 2, X(ZP + 0.16))];
      if (cx[1] - cx[0] < mw + 10) cx[1] = cx[0] + mw + 10;
      if (cx[2] - cx[1] < mw + 10) cx[2] = cx[1] + mw + 10;
      meters = cx.map(function (c) { return { x: c - mw / 2, y: my, w: mw, h: mh }; });
    }
    const iy = my + mh + 10, ih = narrow ? 190 : 206, iw = (W - 10) / 2;
    insA = { x: 0, y: iy, w: iw, h: ih };
    insB = { x: iw + 10, y: iy, w: iw, h: ih };
    H = Math.round(iy + ih + 2);
    return true;
  }
  function resize() {
    if (!layout()) return;
    dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.style.height = H + 'px';
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    stCv.width = cv.width; stCv.height = cv.height;
    stKey = '';
    draw();
  }
  function X(z) { return ox + z * s; }
  /** 世界點（m）→ 畫面像素 */
  function P(x, y, z) { return [ox + (z + x * KX) * s, oy - (y + x * KY) * s]; }

  let drawPending = false;
  function requestDraw() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(function () { drawPending = false; if (!(view3 && view3.active)) draw(); });
  }

  // ---------- 小工具 ----------
  function font(px, w) { return (w || '') + ' ' + px + 'px ' + LD.FONT; }
  function poly(g, pts, close) {
    g.beginPath();
    for (let i = 0; i < pts.length; i++) { if (i) g.lineTo(pts[i][0], pts[i][1]); else g.moveTo(pts[i][0], pts[i][1]); }
    if (close !== false) g.closePath();
  }
  function fillPoly(g, pts, fill, stroke, lw) {
    poly(g, pts);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); }
  }
  /** 方塊：畫看得到的三個面（前面 x = x0、上面 y = y1、右端 z = z1） */
  function box(g, x0, x1, y0, y1, z0, z1, color) {
    const edge = A(SH(color, -0.5), 0.45);
    fillPoly(g, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], SH(color, -0.16), edge, 0.8);
    const a = P(x0, y1, z0), b = P(x0, y0, z0);
    const gf = g.createLinearGradient(0, a[1], 0, b[1]);
    gf.addColorStop(0, SH(color, 0.06)); gf.addColorStop(1, SH(color, -0.12));
    fillPoly(g, [P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)], gf, edge, 0.8);
    fillPoly(g, [P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0)], SH(color, 0.17), edge, 0.8);
    const c = P(x0, y1, z1);
    g.strokeStyle = A(SH(color, 0.75), 0.55); g.lineWidth = 1;
    g.beginPath(); g.moveTo(a[0], a[1] + 0.5); g.lineTo(c[0], c[1] + 0.5); g.stroke();
  }
  /** 鉛直圓柱（支架、柱子）：左右明暗漸層＋頂面橢圓 */
  function vcyl(g, x, z, y0, y1, r, color) {
    const a = P(x, y1, z), b = P(x, y0, z), w = r * s * 1.077;
    const gr = g.createLinearGradient(a[0] - w, 0, a[0] + w, 0);
    gr.addColorStop(0, SH(color, -0.35)); gr.addColorStop(0.3, SH(color, 0.4)); gr.addColorStop(0.55, color); gr.addColorStop(1, SH(color, -0.5));
    g.fillStyle = gr;
    g.fillRect(a[0] - w, a[1], 2 * w, b[1] - a[1]);
    disk(g, x, y1, z, r, SH(color, 0.28), A(SH(color, -0.4), 0.5));
  }
  /** 水平圓（x–z 平面，高度 y）：斜投影成橢圓 */
  function disk(g, x, y, z, r, fill, stroke) {
    g.beginPath();
    for (let i = 0; i <= 28; i++) {
      const ph = i / 28 * Math.PI * 2, q = P(x + r * Math.cos(ph), y, z + r * Math.sin(ph));
      if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]);
    }
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 0.8; g.stroke(); }
  }
  /** 斜線剖面紋（剖開的切面） */
  function hatch(g, pts, color) {
    g.save(); poly(g, pts); g.clip();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    pts.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    g.strokeStyle = color; g.lineWidth = 0.8;
    g.beginPath();
    for (let x = x0 - (y1 - y0); x < x1; x += 4) { g.moveTo(x, y1); g.lineTo(x + (y1 - y0), y0); }
    g.stroke(); g.restore();
  }
  /** 導線（兩層線條的管狀） */
  function cable(g, pts, color, w) {
    LD.tube(g, function (c) {
      c.moveTo(pts[0][0], pts[0][1]);
      if (pts.length === 4) c.bezierCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
      else for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    }, color, w);
  }
  /** ⊙（指向觀察者）或 ⊗（離開觀察者） */
  function dotCross(g, x, y, r, out, color, alpha) {
    g.save();
    g.globalAlpha = alpha == null ? 1 : alpha;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = A(LD.c['canvas-bg'], 0.9); g.fill();
    g.strokeStyle = color; g.lineWidth = Math.max(1.1, r * 0.22); g.stroke();
    if (out) { g.beginPath(); g.arc(x, y, Math.max(1.3, r * 0.3), 0, Math.PI * 2); g.fillStyle = color; g.fill(); }
    else {
      const q = r * 0.5;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(x - q, y - q); g.lineTo(x + q, y + q); g.moveTo(x + q, y - q); g.lineTo(x - q, y + q); g.stroke();
    }
    g.restore();
  }
  /** 帶上下標的文字：segs = [[文字, 'sub'|'sup'|null], …]，回傳寬度 */
  function rich(g, segs, x, y, color, px, weight, align, halo) {
    const fMain = font(px, weight), fSmall = font(+(px * 0.72).toFixed(1), weight);
    let w = 0;
    segs.forEach(function (sg) { g.font = sg[1] ? fSmall : fMain; w += g.measureText(sg[0]).width + (sg[1] ? 0.5 : 0); });
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    segs.forEach(function (sg) {
      const f = sg[1] ? fSmall : fMain, dy = sg[1] === 'sub' ? px * 0.26 : sg[1] === 'sup' ? -px * 0.38 : 0;
      if (halo) LD.haloText(g, sg[0], cx, y + dy, color, 'left', 'alphabetic', f);
      else { g.font = f; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = color; g.fillText(sg[0], cx, y + dy); }
      g.font = f; cx += g.measureText(sg[0]).width + (sg[1] ? 0.5 : 0);
    });
    return w;
  }
  /** 圓角底框標籤；avoid：已放好的方框（重疊時沿 dir 移開，放不下就不畫）；to：引線指向的點 */
  function tag(g, text, x, yb, color, align, avoid, dir, to, f) {
    f = f || font(narrow ? 11 : 12, '600');
    g.font = f;
    const m = g.measureText(text), th = LD.textHeight(m, 15);
    const pw = m.width + 12, ph = th + 3;
    let bx = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x;
    bx = Math.max(2, Math.min(bx, W - pw - 2));
    let by = Math.max(2, yb - ph);
    if (avoid) {
      const hits = function (y) { return avoid.some(function (r) { return bx < r.x + r.w + 3 && bx + pw + 3 > r.x && y < r.y + r.h + 2 && y + ph + 2 > r.y; }); };
      for (let k = 0; k < 10 && hits(by); k++) by = Math.max(2, by + (dir || -1) * (ph * 0.5 + 1));
      if (hits(by)) return null;
      avoid.push({ x: bx, y: by, w: pw, h: ph });
    }
    if (to) {
      const tx = Math.max(bx + 6, Math.min(bx + pw - 6, to[0])), ty = to[1] < by ? by : by + ph;
      g.strokeStyle = A(color, 0.55); g.lineWidth = 1;
      g.beginPath(); g.moveTo(tx, ty); g.lineTo(to[0], to[1]); g.stroke();
      g.beginPath(); g.arc(to[0], to[1], 1.8, 0, Math.PI * 2); g.fillStyle = color; g.fill();
    }
    LD.roundRect(g, bx, by, pw, ph, ph / 2);
    g.fillStyle = A(LD.c['canvas-bg'], LD.dark ? 0.88 : 0.92); g.fill();
    g.strokeStyle = A(color, LD.dark ? 0.5 : 0.38); g.lineWidth = 1; g.stroke();
    g.font = f; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, bx + pw / 2, by + ph / 2 + 0.5);
    return { x: bx, y: by, w: pw, h: ph };
  }
  /** 簡單的換行（中文逐字、英文逐詞） */
  function wrap(g, text, maxW) {
    const words = /[㐀-鿿]/.test(text) ? Array.from(text) : text.split(/(\s+)/);
    const lines = [];
    let cur = '';
    words.forEach(function (w) {
      const t = cur + w;
      if (cur && g.measureText(t.trim()).width > maxW) { lines.push(cur.trim()); cur = w.trim() ? w : ''; }
      else cur = t;
    });
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  }

  // ---------- 磁力線（真實螺線管的磁場；在通過軸的平面上，ρ 可正可負） ----------
  let FL = null;
  function fieldLines() {
    if (FL) return FL;
    FL = [];
    const box = { r: 0.09, z0: -0.31, z1: 0.11 };
    [0.0045, 0.0105, 0.0160, 0.0210].forEach(function (r0) {
      const f = C.fieldLine(r0, APP.zBC, { ds: 0.004, maxLen: 0.6, panels: 24, box: box, dir: 1 });
      const b = C.fieldLine(r0, APP.zBC, { ds: 0.004, maxLen: 0.6, panels: 24, box: box, dir: -1 });
      const pts = b.slice().reverse().concat(f.slice(1)); // 沿 +B 方向（I2 > 0 時）排列
      FL.push(pts);
      FL.push(pts.map(function (p) { return [-p[0], p[1]]; }));
    });
    return FL;
  }

  // =====================================================================
  // 靜態圖層：牆、桌子、螺線管、端板、磁力線、支架、刻度板、導線、電表
  // =====================================================================
  const stCv = document.createElement('canvas'), stCtx = stCv.getContext('2d');
  let stKey = '', stLabels = [];
  function staticKey() {
    return [W, H, dpr, LD.ver, st.show.field, st.show.labels, st.power, st.s2, I2t().toFixed(3), I1m(), I2m(),
      st.piece.mg, st.mode, st.realSol, isEn(), I1t().toFixed(2)].join('|');
  }
  function buildStatic() {
    const g = stCtx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, stCv.width, stCv.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(g, W, H);
    stLabels = [];
    g.save();
    g.beginPath(); g.rect(0, 0, W, sceneH + 2); g.clip();
    drawWall(g);
    drawTable(g);
    drawShadows(g);
    drawPlate(g, S0 - PT, S0, true);
    drawSolenoid(g);
    drawPlate(g, 0, PT, false);
    drawTerminals(g);
    drawField(g);
    drawStand(g);
    drawCard(g);
    g.restore();
    drawCables(g);
    drawMeters(g);
    if (st.show.labels) staticLabels(g);
  }
  function drawWall(g) {
    // 牆面到桌子後緣：極淡的由上而下漸層
    const yb = P(0, YT, 0)[1];
    const gr = g.createLinearGradient(0, 0, 0, yb);
    gr.addColorStop(0, A(LD.c.text, 0));
    gr.addColorStop(1, A(LD.c.text, LD.dark ? 0.05 : 0.035));
    g.fillStyle = gr; g.fillRect(0, 0, W, yb);
  }
  function drawTable(g) {
    const yBack = P(0.10, YT, 0)[1], yFront = P(-0.075, YT, 0)[1], edge = 0.010 * s;
    const gr = g.createLinearGradient(0, yBack, 0, yFront);
    gr.addColorStop(0, SH(tok.table, -0.1)); gr.addColorStop(1, SH(tok.table, 0.06));
    g.fillStyle = gr; g.fillRect(0, yBack, W, yFront - yBack);
    // 木紋般的細線
    g.strokeStyle = A(SH(tok.table, -0.4), 0.08); g.lineWidth = 1;
    for (let k = 1; k < 6; k++) { const y = yBack + (yFront - yBack) * k / 6; g.beginPath(); g.moveTo(0, Math.round(y) + 0.5); g.lineTo(W, Math.round(y) + 0.5); g.stroke(); }
    const ge = g.createLinearGradient(0, yFront, 0, yFront + edge);
    ge.addColorStop(0, SH(tok.table, -0.18)); ge.addColorStop(1, SH(tok.table, -0.34));
    g.fillStyle = ge; g.fillRect(0, yFront, W, edge);
    g.fillStyle = A(SH(tok.table, 0.6), 0.5); g.fillRect(0, yFront, W, 1);
  }
  function drawShadows(g) {
    const sh = function (x, z, rx) { const q = P(x, YT, z); LD.contactShadow(g, q[0], q[1], rx * s, 0); };
    sh(0.02, S0 - PT / 2, 0.022);
    sh(0.02, PT / 2, 0.022);
    sh(0.0, -0.125, 0.12);
    sh(0.0, ZP, 0.03);
    sh(CARD.x, (CARD.z0 + CARD.z1) / 2, 0.012);
  }
  /** 端板（後半塊）：zf..zb 為厚度範圍；left = true 是左端（我們看到它朝管內的那一面） */
  function drawPlate(g, za, zb, left) {
    const col = tok.plate, zF = zb; // 朝 +z 的面在 z = zb
    const arc = function (r, z, f0, f1, n) {
      const pts = [];
      for (let i = 0; i <= n; i++) { const f = f0 + (f1 - f0) * i / n; pts.push(P(r * Math.cos(f), r * Math.sin(f), z)); }
      return pts;
    };
    // 朝 +z 的面（挖掉孔）
    const face = [P(0, YT, zF), P(PXW, YT, zF), P(PXW, PH, zF), P(0, PH, zF), P(0, RIN, zF)]
      .concat(arc(RIN, zF, Math.PI / 2, -Math.PI / 2, 24)).concat([P(0, -RIN, zF)]);
    const gf = g.createLinearGradient(0, P(PXW, PH, zF)[1], 0, P(0, YT, zF)[1]);
    gf.addColorStop(0, SH(col, -0.02)); gf.addColorStop(1, SH(col, -0.2));
    fillPoly(g, face, gf, A(SH(col, -0.5), 0.5), 0.8);
    if (left) {
      // 孔的內部（看出去是管外，較暗）
      const hole = [P(0, RIN, zF)].concat(arc(RIN, zF, Math.PI / 2, -Math.PI / 2, 24));
      fillPoly(g, hole, A(LD.c.text, LD.dark ? 0.25 : 0.12));
    }
    // 上面
    fillPoly(g, [P(0, PH, za), P(0, PH, zb), P(PXW, PH, zb), P(PXW, PH, za)], SH(col, 0.2), A(SH(col, -0.5), 0.45), 0.8);
    // 剖面（x = 0）：孔的上下兩塊，加剖面斜線
    [[RIN, PH], [YT, -RIN]].forEach(function (yy) {
      const q = [P(0, yy[0], za), P(0, yy[0], zb), P(0, yy[1], zb), P(0, yy[1], za)];
      fillPoly(g, q, SH(col, 0.06), A(SH(col, -0.5), 0.5), 0.8);
      hatch(g, q, A(SH(col, -0.55), 0.35));
    });
  }
  /** 螺線管（後半塊）：繞線外圍、管子內壁、上下剖面（管壁＋四層銅線）、電流方向 */
  function halfTube(g, r, z0, z1) {
    const fm = Math.atan2(1, KY), pts = [];
    pts.push(P(0, -r, z0), P(0, -r, z1));
    for (let i = 0; i <= 30; i++) { const f = -Math.PI / 2 + (fm + Math.PI / 2) * i / 30; pts.push(P(r * Math.cos(f), r * Math.sin(f), z1)); }
    for (let i = 30; i >= 0; i--) { const f = -Math.PI / 2 + (fm + Math.PI / 2) * i / 30; pts.push(P(r * Math.cos(f), r * Math.sin(f), z0)); }
    return pts;
  }
  function drawSolenoid(g) {
    // 繞線外圍（只露出上緣一點點）
    const outer = halfTube(g, ROUT, S0, 0);
    const go = g.createLinearGradient(0, P(0, ROUT * 1.05, 0)[1], 0, P(0, -ROUT, 0)[1]);
    go.addColorStop(0, SH(tok.copper, 0.25)); go.addColorStop(1, SH(tok.copper, -0.35));
    fillPoly(g, outer, go);
    // 管子內壁（凹面：上方背光較暗、下方受光較亮）
    const inner = halfTube(g, RIN, S0, 0);
    const yT = P(0, RIN, 0)[1], yB = P(0, -RIN, 0)[1];
    const gi = g.createLinearGradient(0, yT, 0, yB);
    gi.addColorStop(0, SH(tok.tube, -0.45)); gi.addColorStop(0.45, SH(tok.tube, -0.16)); gi.addColorStop(1, SH(tok.tube, 0.04));
    fillPoly(g, inner, gi);
    g.save(); poly(g, inner); g.clip();
    // 遠端較暗（深處）
    const gd = g.createLinearGradient(X(S0), 0, X(S0 + 0.07), 0);
    gd.addColorStop(0, A('#000000', LD.dark ? 0.32 : 0.16)); gd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gd; g.fillRect(X(S0) - 4, yT - 20, 0.08 * s, yB - yT + 40);
    // 環形細線（每 2.5 cm，讓人看出是圓管）
    g.strokeStyle = A(SH(tok.tube, -0.6), 0.1); g.lineWidth = 1;
    for (let k = 1; k < 10; k++) {
      const z = S0 + k * 0.025;
      g.beginPath();
      for (let i = 0; i <= 20; i++) { const f = -Math.PI / 2 + Math.PI * i / 20, q = P(RIN * Math.cos(f), RIN * Math.sin(f), z); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
      g.stroke();
    }
    g.restore();
    // 上下剖面：管壁（斜線）與四層銅線
    [1, -1].forEach(function (sg) {
      const wall = [P(0, sg * RIN, S0), P(0, sg * RIN, 0), P(0, sg * RFO, 0), P(0, sg * RFO, S0)];
      fillPoly(g, wall, SH(tok.tube, -0.05));
      hatch(g, wall, A(SH(tok.tube, -0.6), 0.35));
      const a = P(0, sg * RFO, S0), b = P(0, sg * ROUT, 0);
      const gc = g.createLinearGradient(0, a[1], 0, b[1]);
      gc.addColorStop(0, SH(tok.copper, -0.1)); gc.addColorStop(0.5, SH(tok.copper, 0.22)); gc.addColorStop(1, SH(tok.copper, -0.2));
      g.fillStyle = gc; g.fillRect(a[0], Math.min(a[1], b[1]), b[0] - a[0], Math.abs(b[1] - a[1]));
      g.strokeStyle = A(SH(tok.copper, -0.55), 0.4); g.lineWidth = 0.7;
      for (let k = 1; k < 4; k++) {
        const y = P(0, sg * (RFO + (ROUT - RFO) * k / 4), 0)[1];
        g.beginPath(); g.moveTo(a[0], y); g.lineTo(b[0], y); g.stroke();
      }
      // 銅線截面的細點（畫面夠大時）
      if (s * 0.001 >= 2.2) {
        g.fillStyle = A(SH(tok.copper, 0.6), 0.35);
        for (let k = 0; k < 4; k++) {
          const y = P(0, sg * (RFO + (ROUT - RFO) * (k + 0.5) / 4), 0)[1];
          for (let z = S0 + 0.0005; z < 0; z += 0.001) { g.fillRect(X(z) - 0.5, y - 0.5, 1, 1); }
        }
      }
    });
    // 繞線電流方向：上緣與下緣的 ⊙ ⊗
    if (I2t() > 0) {
      const r = Math.max(4, Math.min(7, 0.0042 * s));
      for (let k = 0; k < 5; k++) {
        const z = -0.225 + 0.05 * k;
        const t = P(0, (RFO + ROUT) / 2, z), b = P(0, -(RFO + ROUT) / 2, z);
        dotCross(g, t[0], t[1], r, st.s2 > 0, LD.c.equi);
        dotCross(g, b[0], b[1], r, st.s2 < 0, LD.c.equi);
      }
    }
  }
  function drawTerminals(g) {
    // 螺線管的兩個接線柱（左端板上面）
    [[0.012, LD.c.pos], [0.029, tok.lead]].forEach(function (t) {
      const z = S0 - PT / 2;
      vcyl(g, t[0], z, PH, PH + 0.004, 0.0032, tok.brass);
      vcyl(g, t[0], z, PH + 0.004, PH + 0.009, 0.0036, SH(t[1], 0.05));
    });
  }
  function drawField(g) {
    if (!st.show.field || !(I2t() > 0)) return;
    const a = 0.35 + 0.6 * Math.min(1, I2t() / 3), col = LD.c.neg;
    g.save();
    g.beginPath(); g.rect(0, 0, W, P(0, YT, 0)[1]); g.clip();
    g.lineCap = 'round'; g.lineJoin = 'round';
    const step = 0.075, hs = narrow ? 4.2 : 5.5;
    fieldLines().forEach(function (pts) {
      g.beginPath();
      for (let i = 0; i < pts.length; i++) { const q = P(0, pts[i][0], pts[i][1]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
      g.strokeStyle = A(col, a * 0.85); g.lineWidth = narrow ? 1.1 : 1.4; g.stroke();
      // 箭頭（沿磁場方向）
      let acc = 0, next = 0.045;
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        acc += d;
        if (acc >= next && i < pts.length - 2) {
          next += step;
          const q0 = P(0, pts[i - 1][0], pts[i - 1][1]), q1 = P(0, pts[i][0], pts[i][1]);
          let dx = q1[0] - q0[0], dy = q1[1] - q0[1];
          const L = Math.hypot(dx, dy) || 1; dx = dx / L * st.s2; dy = dy / L * st.s2;
          g.beginPath();
          g.moveTo(q1[0] + dx * hs, q1[1] + dy * hs);
          g.lineTo(q1[0] - dx * hs * 0.6 - dy * hs * 0.6, q1[1] - dy * hs * 0.6 + dx * hs * 0.6);
          g.lineTo(q1[0] - dx * hs * 0.6 + dy * hs * 0.6, q1[1] - dy * hs * 0.6 - dx * hs * 0.6);
          g.closePath(); g.fillStyle = A(col, Math.min(1, a + 0.1)); g.fill();
        }
      }
    });
    g.restore();
    const q = P(0, 0.0135, -0.205);
    LD.vecLabel(g, 'B', '', q[0], q[1], col);
  }
  function drawStand(g) {
    // 底座
    box(g, -0.034, 0.034, YT, YT + 0.006, ZP - 0.009, ZP + 0.020, SH(tok.metal, -0.28)); // 前緣讓開管口的端板
    // 後面的銅柱（前面的銅柱畫在板子之後）
    post(g, POSTX);
    // 接線端子（下方）
    [-POSTX, POSTX].forEach(function (x) { const q = P(x, YT + 0.013, ZP); g.beginPath(); g.arc(q[0], q[1], Math.max(1.8, 0.0022 * s), 0, Math.PI * 2); g.fillStyle = SH(tok.brass, -0.2); g.fill(); });
  }
  function post(g, x) {
    vcyl(g, x, ZP, YT + 0.006, -0.0026, POSTR, tok.metal);
    // 頂端的 V 形槽座
    box(g, x - 0.0035, x + 0.0035, -0.0042, -0.0016, ZP - 0.0035, ZP + 0.0035, tok.brass);
  }
  function drawCard(g) {
    const zc = (CARD.z0 + CARD.z1) / 2;
    box(g, CARD.x - 0.006, CARD.x + 0.010, YT, YT + 0.004, zc - 0.012, zc + 0.012, SH(tok.metal, -0.28));
    vcyl(g, CARD.x + 0.002, zc, YT + 0.004, CARD.y0, 0.0016, tok.metal);
    const q = [P(CARD.x, CARD.y0, CARD.z0), P(CARD.x, CARD.y0, CARD.z1), P(CARD.x, CARD.y1, CARD.z1), P(CARD.x, CARD.y1, CARD.z0)];
    g.save();
    g.shadowColor = LD.shadowInk(0.25); g.shadowBlur = 5; g.shadowOffsetY = 1.5;
    fillPoly(g, q, tok.card);
    g.restore();
    fillPoly(g, q, null, A(LD.c.text, 0.35), 0.8);
    // 刻度（每 5 mm）與水平線
    for (let k = -4; k <= 4; k++) {
      const y = k * 0.005, a = P(CARD.x, y, CARD.z0 + 0.007), b = P(CARD.x, y, CARD.z1 - (k % 2 ? 0.006 : 0.002));
      g.strokeStyle = k === 0 ? LD.c.probe : A('#000000', 0.45); g.lineWidth = k === 0 ? 1.6 : 0.8;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
    // 擋塊銷（限制傾角）
    [STOPY, -STOPY].forEach(function (y) {
      const a = P(CARD.x, y, ZP + 0.168), b = P(-0.004, y, ZP + 0.168);
      LD.tube(g, function (c) { c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }, SH(tok.metal, -0.2), Math.max(2, 0.002 * s));
    });
  }
  function drawCables(g) {
    const w = narrow ? 2.2 : 3;
    // 螺線管 → 螺線管電源
    const m2 = meters[0];
    [[0.012, LD.c.pos, 0.36], [0.029, tok.lead, 0.62]].forEach(function (t) {
      const a = P(t[0], PH + 0.009, S0 - PT / 2);
      const ex = m2.x + m2.w * t[2], ey = m2.y + 1;
      const xl = Math.min(a[0] - 0.012 * s, ex - 4);
      cable(g, [a, [xl, a[1] - 0.01 * s], [xl, ey - 0.05 * s], [ex, ey]], SH(t[1], -0.05), w);
    });
    // 支架 → 天平電源
    const m1 = meters[1];
    [[-POSTX, LD.c.pos, 0.36], [POSTX, tok.lead, 0.64]].forEach(function (t) {
      const a = P(t[0], YT + 0.013, ZP);
      const ex = m1.x + m1.w * t[2], ey = m1.y + 1;
      cable(g, [a, [a[0] + (t[0] < 0 ? -0.01 : 0.012) * s, a[1] + 0.006 * s], [ex, ey - 0.03 * s], [ex, ey]], SH(t[1], -0.05), w);
    });
  }
  // ---- 電表（七段顯示器） ----
  const SEG = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '' };
  function seg7(g, text, xr, yc, h, on) {
    const cells = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '.') { if (cells.length) cells[cells.length - 1].dot = true; continue; }
      cells.push({ ch: ch, dot: false });
    }
    const w = h * 0.56, gap = h * 0.2, t = Math.max(1.4, h * 0.13), sk = h * 0.1, led = tok.led, dg = h * 0.3;
    let x = xr - cells.length * (w + gap) + gap - cells.filter(function (c) { return c.dot; }).length * dg;
    for (let n = 0; n < cells.length; n++) {
      const c = cells[n], segs = SEG[c.ch] || '', top = yc - h / 2;
      const Q = function (px, py) { return [x + px + sk * (1 - py / h), top + py]; };
      const def = {
        a: [[t * 0.6, 0], [w - t * 0.6, 0]], d: [[t * 0.6, h], [w - t * 0.6, h]], g: [[t * 0.6, h / 2], [w - t * 0.6, h / 2]],
        b: [[w, t * 0.6], [w, h / 2 - t * 0.5]], c: [[w, h / 2 + t * 0.5], [w, h - t * 0.6]],
        f: [[0, t * 0.6], [0, h / 2 - t * 0.5]], e: [[0, h / 2 + t * 0.5], [0, h - t * 0.6]]
      };
      g.lineCap = 'round';
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach(function (k) {
        const lit = on && segs.indexOf(k) >= 0, p = Q(def[k][0][0], def[k][0][1]), q = Q(def[k][1][0], def[k][1][1]);
        g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]);
        if (lit) { g.strokeStyle = A(led, 0.35); g.lineWidth = t * 2.2; g.stroke(); g.strokeStyle = SH(led, 0.18); g.lineWidth = t; g.stroke(); }
        else { g.strokeStyle = A(led, 0.07); g.lineWidth = t; g.stroke(); }
      });
      if (c.dot) {
        const d = Q(w + (gap + dg) * 0.5, h);
        g.beginPath(); g.arc(d[0], d[1] - t * 0.3, t * 0.7, 0, Math.PI * 2);
        g.fillStyle = on ? SH(led, 0.18) : A(led, 0.07); g.fill();
      }
      x += w + gap + (c.dot ? dg : 0);
    }
  }
  function drawMeters(g) {
    const lab = [
      [[T('螺線管 I', 'Solenoid I'), null], ['2', 'sub']],
      [[T('天平 I', 'Balance I'), null], ['1', 'sub']],
      [[T('電子秤', 'Scale'), null]]
    ];
    const vals = [
      st.power ? I2m().toFixed(2) : ' .  ', st.power ? I1m().toFixed(2) : ' .  ', st.piece ? String(st.piece.mg) : ''
    ];
    const units = ['A', 'A', 'mg'];
    meters.forEach(function (m, i) {
      LD.block(g, m.x, m.y, m.w, m.h, tok.panel, { r: 7 });
      const light = MIX(tok.panel, '#ffffff', 0.78);
      rich(g, lab[i], m.x + 9, m.y + 15, light, narrow ? 10.5 : 11.5, '600', 'left', false);
      const on = i < 2 ? st.power : true;
      if (i < 2) { // 電源指示燈
        const lx = m.x + m.w - 9, ly = m.y + 11;
        if (on) { const gl = g.createRadialGradient(lx, ly, 0, lx, ly, 7); gl.addColorStop(0, A('#4cff7a', 0.7)); gl.addColorStop(1, A('#4cff7a', 0)); g.fillStyle = gl; g.beginPath(); g.arc(lx, ly, 7, 0, Math.PI * 2); g.fill(); }
        g.beginPath(); g.arc(lx, ly, 2.6, 0, Math.PI * 2); g.fillStyle = on ? '#7dffa0' : SH(tok.panel, 0.25); g.fill();
      }
      const dx = m.x + 7, dy = m.y + 22, dw = m.w - 14, dh = m.h - 29;
      LD.roundRect(g, dx, dy, dw, dh, 4);
      g.fillStyle = SH(tok.panel, -0.55); g.fill();
      g.strokeStyle = A('#000000', 0.5); g.lineWidth = 1; g.stroke();
      g.font = font(narrow ? 10.5 : 12, '600');
      const uw = g.measureText(units[i]).width;
      g.fillStyle = on ? SH(tok.led, 0.1) : A(tok.led, 0.2); g.textAlign = 'right'; g.textBaseline = 'alphabetic';
      g.fillText(units[i], dx + dw - 5, dy + dh - 6);
      seg7(g, vals[i], dx + dw - uw - 10, dy + dh / 2, Math.min(dh * 0.62, 26), on);
    });
  }
  function staticLabels(g) {
    const q = P(0, ROUT, -0.13);
    const r = tag(g, T('螺線管（1000 匝）', 'Solenoid (1000 turns)'), q[0], q[1] - 6, LD.c.text, 'center', stLabels, -1);
    const c = P(CARD.x, CARD.y1, (CARD.z0 + CARD.z1) / 2);
    tag(g, T('水平刻度', 'Level scale'), c[0], c[1] - 4, LD.c.text, 'center', stLabels, -1);
    if (I2t() > 0) {
      const t = P(0, ROUT + 0.004, -0.235);
      const w = rich(g, [['I', null], ['2', 'sub']], t[0] - 4, t[1] - 3, LD.c.equi, 13, 'italic 600', 'right', true);
      stLabels.push({ x: t[0] - 4 - w, y: t[1] - 16, w: w, h: 16 });
    }
    return r;
  }

  // =====================================================================
  // 動態圖層：天平（隨傾角轉動）、受力、電流、標籤、兩個放大圖
  // =====================================================================
  function drawDynamic(g) {
    const avoid = stLabels.slice();
    const th = beam.th, c = Math.cos(th), sn = Math.sin(th);
    const PB = function (u, x, v) { return P(x, -u * sn + v * c, ZP + u * c + v * sn); };
    g.save();
    g.beginPath(); g.rect(0, 0, W, sceneH + 2); g.clip();
    // 掛勾與漆包線（在板子正下方，被板子前緣擋住一點）
    const hk = PB(UH, 0, -BT);
    const hb = [hk[0], hk[1] + 0.0055 * s];
    if (st.hung) { const sq = P(0, YT, ZP + UH); LD.contactShadow(g, sq[0], sq[1], 0.007 * s, 0.6); }
    g.strokeStyle = SH(tok.metal, -0.25); g.lineWidth = Math.max(1.2, 0.0009 * s); g.lineCap = 'round';
    g.beginPath(); g.moveTo(hk[0], hk[1]); g.lineTo(hb[0], hb[1] - 0.0014 * s);
    g.arc(hb[0] - 0.0012 * s, hb[1] - 0.0014 * s, 0.0012 * s, 0, Math.PI * 0.9); g.stroke();
    let wireBottom = hb[1];
    if (st.hung) {
      const half = st.piece.len / 200 * s, d = Math.max(1.6, 0.0013 * s), wd = Math.max(1.5, 0.0008 * s);
      wireBottom = hb[1] - 0.0012 * s + half;
      LD.tube(g, function (cc) {
        cc.moveTo(hb[0] - d, hb[1] - 0.0012 * s + half);
        cc.lineTo(hb[0] - d, hb[1] - 0.0012 * s);
        cc.arc(hb[0], hb[1] - 0.0012 * s, d, Math.PI, 0);
        cc.lineTo(hb[0] + d, hb[1] - 0.0012 * s + half * 0.96);
      }, tok.wire, wd * 1.6);
    }
    // 後面的轉軸銷
    pin(g, PB, 1);
    // 絕緣板
    const top = [PB(U0, -BWH, BT), PB(U1, -BWH, BT), PB(U1, BWH, BT), PB(U0, BWH, BT)];
    const front = [PB(U0, -BWH, -BT), PB(U1, -BWH, -BT), PB(U1, -BWH, BT), PB(U0, -BWH, BT)];
    const end = [PB(U1, -BWH, -BT), PB(U1, BWH, -BT), PB(U1, BWH, BT), PB(U1, -BWH, BT)];
    const bc = tok.board;
    fillPoly(g, end, SH(bc, -0.2), A(SH(bc, -0.6), 0.6), 0.8);
    fillPoly(g, front, SH(bc, -0.3), A(SH(bc, -0.6), 0.6), 0.8);
    const gt = g.createLinearGradient(0, top[0][1], 0, top[3][1]);
    gt.addColorStop(0, SH(bc, 0.12)); gt.addColorStop(1, SH(bc, -0.06));
    fillPoly(g, top, gt, A(SH(bc, -0.6), 0.6), 0.8);
    g.strokeStyle = A(SH(bc, 0.7), 0.5); g.lineWidth = 1;
    g.beginPath(); g.moveTo(top[0][0], top[0][1] + 0.5); g.lineTo(top[1][0], top[1][1] + 0.5); g.stroke();
    // ㄈ字形銅條
    const vv = BT + 0.0002;
    const strip = function (u0, u1, x0, x1) { return [PB(u0, x0, vv), PB(u1, x0, vv), PB(u1, x1, vv), PB(u0, x1, vv)]; };
    const cu = tok.copper;
    [strip(UBC - SW, 0.003, -ARM - SW, -ARM + SW), strip(UBC - SW, 0.003, ARM - SW, ARM + SW), strip(UBC - SW, UBC + SW, -ARM - SW, ARM + SW)].forEach(function (q) {
      fillPoly(g, q, SH(cu, 0.12), A(SH(cu, -0.5), 0.6), 0.6);
    });
    // 管內較暗
    g.save();
    g.beginPath(); top.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.closePath();
    front.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.closePath();
    g.clip();
    const gs = g.createLinearGradient(X(-0.012), 0, X(0.008), 0);
    gs.addColorStop(0, A('#000000', LD.dark ? 0.3 : 0.2)); gs.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gs; g.fillRect(X(S0), 0, X(0.008) - X(S0), sceneH);
    g.restore();
    // 外端的螺桿（兼指針）與歸零螺母
    const r0 = PB(U1, 0, 0), r1 = PB(UTIP - 0.003, 0, 0), tip = PB(UTIP, 0, 0);
    const rw = Math.max(2, 0.0024 * s);
    LD.tube(g, function (cc) { cc.moveTo(r0[0], r0[1]); cc.lineTo(r1[0], r1[1]); }, tok.metal, rw);
    g.beginPath(); g.moveTo(r1[0], r1[1] - rw / 2); g.lineTo(tip[0], tip[1]); g.lineTo(r1[0], r1[1] + rw / 2); g.closePath();
    g.fillStyle = SH(tok.metal, -0.1); g.fill();
    if (s * 0.0008 >= 1.6) {
      g.strokeStyle = A(SH(tok.metal, -0.6), 0.45); g.lineWidth = 0.6;
      for (let u = U1 + 0.0008; u < UTIP - 0.003; u += 0.0008) { const p = PB(u, 0, 0); g.beginPath(); g.moveTo(p[0] - rw * 0.15, p[1] - rw / 2); g.lineTo(p[0] + rw * 0.15, p[1] + rw / 2); g.stroke(); }
    }
    const un = U1 + 0.0025 + st.nut * 1e-3;
    nut(g, PB, un);
    // 前面的轉軸銷與銅柱
    pin(g, PB, -1);
    post(g, -POSTX);
    // 電流（移動的小點）
    if (st.show.flow && st.power && st.I1 > 0) drawFlow(g, PB);
    // 受力箭頭
    if (st.show.force) {
      const aw = narrow ? 2.2 : 2.6;
      const F = Fbc(), down = st.s1 * st.s2 > 0;
      if (F > 1e-7) {
        const q = PB(UBC, 0, BT), L = F / FREF * aRef;
        LD.arrow(g, q[0], q[1], q[0], q[1] + (down ? L : -L), LD.c.pos, aw, { label: 'F', lx: 11, ly: down ? -6 : 6 });
        avoid.push({ x: q[0] - 4, y: Math.min(q[1], q[1] + (down ? L : -L)) - 4, w: 24, h: L + 8 });
        if (st.realSol) {
          const Fs = Math.abs(REAL.sideForce) * I1t() * I2t() / 2, Ls = Fs / FREF * aRef;
          [-ARM, ARM].forEach(function (x) {
            const p = PB(USIDE, x, BT);
            LD.arrow(g, p[0], p[1], p[0], p[1] + (down ? -Ls : Ls), A(LD.c.pos, 0.85), aw * 0.8);
          });
        }
      }
      if (st.hung) {
        const W0 = st.piece.m * G, L = W0 / FREF * aRef, x = hb[0] + 0.0026 * s + 3;
        LD.arrow(g, x, hb[1], x, hb[1] + L, LD.c.probe, aw, { label: 'mg', lx: 15, ly: -2 });
        avoid.push({ x: x - 4, y: hb[1] - 4, w: 34, h: L + 8 });
      }
    }
    // 標籤
    if (st.show.labels) {
      const qb = PB(UBC, -ARM, BT);
      if (!narrow) {
        LD.haloText(g, 'b', qb[0] - 4, qb[1] + 2, LD.c.text, 'right', 'top', font(11.5, 'italic 600'));
        const qc = PB(UBC, ARM, BT);
        LD.haloText(g, 'c', qc[0] - 3, qc[1] - 3, LD.c.text, 'right', 'bottom', font(11.5, 'italic 600'));
      }
      const qm = PB(UBC + 0.03, -ARM, BT);
      tag(g, T('ㄈ字形電路（bc 長 3.00 cm）', 'U-shaped circuit (bc = 3.00 cm)'), qm[0], qm[1] + (narrow ? 34 : 46), LD.c.text, 'left', avoid, 1, qm);
      const kp = P(-POSTX, 0, ZP);
      tag(g, T('支點 K', 'Pivot K'), kp[0] + 10, kp[1] - 0.026 * s, LD.c.text, 'left', avoid, -1, kp);
      if (st.hung) {
        tag(g, T('漆包線 ', 'Wire ') + st.piece.mg + ' mg', hb[0] - 10, wireBottom + 4 + (narrow ? 16 : 20), LD.c.text, 'right', avoid, 1, [hb[0] - 2, wireBottom - 2]);
      } else if (!narrow) {
        tag(g, T('掛勾', 'Hook'), hb[0] - 10, hb[1] + 22, LD.c.muted, 'right', avoid, 1, [hb[0] - 2, hb[1]]);
      }
      const np = PB(un, 0, 0.003);
      tag(g, T('歸零螺母', 'Zero nut'), np[0] - 8, np[1] - (narrow ? 14 : 22), LD.c.text, 'right', avoid, -1, np);
    }
    g.restore();
    drawMouth(g, insA);
    drawMag(g, insB);
  }
  /** 轉軸銷：side = −1 前（觀察者這側）、+1 後 */
  function pin(g, PB, side) {
    const a = PB(0, side * BWH, 0), b = PB(0, side * (POSTX + 0.002), 0);
    LD.tube(g, function (c) { c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }, tok.brass, Math.max(2.2, 0.0026 * s));
  }
  function nut(g, PB, u) {
    const hw = 0.002, hh = 0.0028, col = tok.brass;
    const pts = function (x, v) { return [PB(u - hw, x, v), PB(u + hw, x, v)]; };
    const f = pts(-hh, -hh).concat(pts(-hh, hh).reverse());          // 前面
    const t = pts(-hh, hh).concat(pts(hh, hh).reverse());            // 上面
    const e = [PB(u + hw, -hh, -hh), PB(u + hw, hh, -hh), PB(u + hw, hh, hh), PB(u + hw, -hh, hh)]; // 外側
    fillPoly(g, e, SH(col, -0.2), A(SH(col, -0.6), 0.6), 0.6);
    fillPoly(g, f, SH(col, -0.02), A(SH(col, -0.6), 0.6), 0.6);
    fillPoly(g, t, SH(col, 0.25), A(SH(col, -0.6), 0.6), 0.6);
  }
  function drawFlow(g, PB) {
    const vv = BT + 0.0004;
    const path = [[0, -POSTX - 0.002, 0], [0, -ARM, vv], [UBC, -ARM, vv], [UBC, ARM, vv], [0, ARM, vv], [0, POSTX + 0.002, 0]];
    if (st.s1 < 0) path.reverse();
    const segs = [];
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      const L = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]);
      segs.push(L); total += L;
    }
    const sp = 0.012, ph = (flowT * 0.010 * st.I1) % sp, r = Math.max(1.5, 0.0011 * s);
    g.save();
    g.globalCompositeOperation = LD.dark ? 'lighter' : 'source-over';
    for (let d = ph; d < total; d += sp) {
      let k = 0, rem = d;
      while (k < segs.length - 1 && rem > segs[k]) { rem -= segs[k]; k++; }
      const t = Math.min(1, rem / segs[k]), p0 = path[k], p1 = path[k + 1];
      const q = PB(p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t);
      const gl = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], r * 2.2);
      gl.addColorStop(0, A(SH(LD.c.equi, 0.4), 0.95)); gl.addColorStop(0.45, A(LD.c.equi, 0.75)); gl.addColorStop(1, A(LD.c.equi, 0));
      g.fillStyle = gl; g.beginPath(); g.arc(q[0], q[1], r * 2.2, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  // ---------- 放大圖外框 ----------
  function panel(g, b, title) {
    LD.roundRect(g, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 10);
    g.fillStyle = MIX(LD.c['canvas-bg'], LD.c.text, LD.dark ? 0.035 : 0.022); g.fill();
    g.strokeStyle = A(LD.c.text, 0.16); g.lineWidth = 1; g.stroke();
    if (typeof title === 'string') LD.haloText(g, title, b.x + 10, b.y + 18, LD.c.text, 'left', 'alphabetic', font(12, '700'));
    else rich(g, title, b.x + 10, b.y + 18, LD.c.text, 12, '700', 'left', true);
  }
  // ---------- 放大圖一：從管口往內看（右手開掌定則） ----------
  function drawMouth(g, b) {
    panel(g, b, T('從管口往內看', 'Looking into the mouth'));
    const wide = b.w >= 330;
    let R, cx, cy;
    if (wide) { R = Math.min((b.h - 44) / 2, b.w * 0.2); cx = b.x + 18 + R; cy = b.y + 28 + (b.h - 32) / 2; }
    else { R = Math.min((b.h - 82) / 2, b.w / 2 - 16); cx = b.x + b.w / 2; cy = b.y + 28 + R; }
    const k = R / ROUT;
    // 繞線（銅）與管壁
    const ring = function (r0, r1, fill) {
      g.beginPath(); g.arc(cx, cy, r1 * k, 0, Math.PI * 2); g.arc(cx, cy, r0 * k, 0, Math.PI * 2, true);
      g.fillStyle = fill; g.fill();
    };
    const gc = g.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.2, cx, cy, R * 1.05);
    gc.addColorStop(0, SH(tok.copper, 0.35)); gc.addColorStop(1, SH(tok.copper, -0.3));
    ring(RFO, ROUT, gc);
    ring(RIN, RFO, SH(tok.tube, -0.05));
    const gi = g.createRadialGradient(cx, cy, 0, cx, cy, RIN * k);
    gi.addColorStop(0, SH(tok.tube, -0.7)); gi.addColorStop(1, SH(tok.tube, -0.38));
    g.beginPath(); g.arc(cx, cy, RIN * k, 0, Math.PI * 2); g.fillStyle = gi; g.fill();
    // 管內磁場 ⊙／⊗
    const on2 = I2t() > 0;
    if (on2 && st.show.field) {
      const al = 0.35 + 0.65 * Math.min(1, I2t() / 3), gs = R * 0.3, rr = Math.max(3.2, Math.min(5, R * 0.07));
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
        const x = cx + i * gs, y = cy + j * gs;
        if (Math.hypot(x - cx, y - cy) > RIN * k - rr - 2) continue;
        dotCross(g, x, y, rr, st.s2 > 0, LD.c.neg, al);
      }
    }
    // 繞線電流的方向（從 +z 看，s2 > 0 為逆時針）
    if (on2) {
      const rm = (RFO + ROUT) / 2 * k;
      for (let n = 0; n < 4; n++) {
        const f = Math.PI / 4 + n * Math.PI / 2, d = st.s2 > 0 ? 1 : -1;
        const p = [cx + rm * Math.cos(f), cy - rm * Math.sin(f)];
        const tx = -Math.sin(f) * d, ty = -Math.cos(f) * d, L = Math.max(9, R * 0.22);
        LD.arrow(g, p[0] - tx * L / 2, p[1] - ty * L / 2, p[0] + tx * L / 2, p[1] + ty * L / 2, LD.c.equi, 2);
      }
    }
    // bc 段（隨天平上下）與絕緣板
    const ybc = -UBC * Math.sin(beam.th);
    const by = cy - ybc * k;
    LD.block(g, cx - BWH * k, by - BT * k, 2 * BWH * k, Math.max(3, 2 * BT * k), tok.board, { r: 1.5, shadow: false });
    const sy = by - BT * k - Math.max(2, 0.0007 * k);
    g.fillStyle = SH(tok.copper, 0.15);
    g.fillRect(cx - (ARM + SW) * k, sy, 2 * (ARM + SW) * k, Math.max(2, 0.0007 * k));
    // 側臂（沿 z 方向）的電流：⊗ 進入、⊙ 出來
    if (st.power && st.I1 > 0) {
      const rr = Math.max(3, Math.min(4.5, R * 0.06));
      dotCross(g, cx - ARM * k, sy - rr - 1, rr, st.s1 < 0, LD.c.equi);
      dotCross(g, cx + ARM * k, sy - rr - 1, rr, st.s1 > 0, LD.c.equi);
      const ay = sy - 2 * rr - 7, L = (2 * ARM - 0.006) * k;
      const x0 = cx - st.s1 * L / 2, x1 = cx + st.s1 * L / 2;
      LD.arrow(g, x0, ay, x1, ay, LD.c.equi, 2.2);
      rich(g, [['I', null], ['1', 'sub']], x1 + st.s1 * 4 + (st.s1 > 0 ? 0 : -2), ay + 4, LD.c.equi, 13, 'italic 600', st.s1 > 0 ? 'left' : 'right', true);
    }
    // 磁力
    const F = Fbc();
    if (F > 1e-7 && st.show.force) {
      const L = Math.min(R * 1.25, F / FREF * R * 0.55), down = st.s1 * st.s2 > 0;
      LD.arrow(g, cx, by + (down ? BT * k : -BT * k - 6), cx, by + (down ? L : -L - 6), LD.c.pos, 2.4, { label: 'F', lx: 10, ly: 0 });
    }
    if (on2 && st.show.field) {
      const lx = cx + RIN * k * 0.62, ly = cy - RIN * k * 0.72;
      LD.vecLabel(g, 'B', '', lx, ly, LD.c.neg);
    }
    // 說明文字
    const txt = LD.c.text, mut = LD.c.muted;
    let state;
    if (!currents()) state = [T('通電後才有磁力', 'No force until both currents flow'), mut];
    else if (magDown()) state = [T('bc 受力向下 → 外端上翹', 'Force on bc is down → outer end rises'), LD.c.probe];
    else state = [T('bc 受力向上 → 外端下垂', 'Force on bc is up → outer end drops'), LD.c.pos];
    if (wide) {
      const tx = cx + R + 18, maxW = b.x + b.w - 10 - tx;
      let y = b.y + 48;
      g.font = font(12.5, '700');
      LD.haloText(g, T('右手開掌定則', 'Right-hand (open palm) rule'), tx, y, txt, 'left', 'alphabetic', font(12.5, '700'));
      y += 22;
      [T('拇指：電流 I 的方向', 'Thumb: the current I'), T('四指：磁場 B 的方向', 'Fingers: the field B'), T('掌心推出：磁力 F 的方向', 'Palm pushes: the force F')].forEach(function (l) {
        g.font = font(12);
        wrap(g, l, maxW).forEach(function (ln) { LD.haloText(g, ln, tx, y, txt, 'left', 'alphabetic', font(12)); y += 17; });
      });
      y += 8;
      g.font = font(12, '700');
      wrap(g, state[0], maxW).forEach(function (ln) { LD.haloText(g, ln, tx, y, state[1], 'left', 'alphabetic', font(12, '700')); y += 17; });
    } else {
      let y = cy + R + 18;
      g.font = font(11);
      wrap(g, T('右手開掌：拇指 I、四指 B、掌心 F', 'Right hand: thumb I, fingers B, palm F'), b.w - 16).forEach(function (ln) {
        LD.haloText(g, ln, b.x + b.w / 2, y, txt, 'center', 'alphabetic', font(11)); y += 15;
      });
      g.font = font(11, '700');
      wrap(g, state[0], b.w - 16).slice(0, 2).forEach(function (ln) {
        if (y < b.y + b.h - 4) LD.haloText(g, ln, b.x + b.w / 2, y, state[1], 'center', 'alphabetic', font(11, '700'));
        y += 15;
      });
    }
  }
  // ---------- 放大圖二：指針與水平刻度 ----------
  function drawMag(g, b) {
    const x0 = b.x + 8, y0 = b.y + 28, w = b.w - 16, h = b.h - 28 - 34;
    const k = h / 0.019;               // ±9.5 mm
    const mag = Math.round(k / s);
    panel(g, b, T('指針放大 ×', 'Pointer close-up ×') + mag);
    const cx = x0 + w * 0.4, cy = y0 + h / 2, zt = ZP + UTIP;
    const MX = function (z) { return cx + (z - zt) * k; }, MY = function (y) { return cy - y * k; };
    g.save();
    LD.roundRect(g, x0, y0, w, h, 6); g.clip();
    g.fillStyle = MIX(LD.c['canvas-bg'], LD.c.text, 0.06); g.fillRect(x0, y0, w, h);
    // 刻度板
    const c0 = MX(CARD.z0), c1 = MX(CARD.z1);
    g.fillStyle = tok.card; g.fillRect(c0, y0, c1 - c0, h);
    g.fillStyle = A(LD.c.probe, 0.18); g.fillRect(c0, MY(APP.levelTip), c1 - c0, APP.levelTip * 2 * k);
    for (let j = -9; j <= 9; j++) {
      const y = MY(j * 0.001), big = j % 5 === 0;
      g.strokeStyle = j === 0 ? LD.c.probe : A('#000000', big ? 0.6 : 0.4); g.lineWidth = j === 0 ? 2 : big ? 1.2 : 0.8;
      g.beginPath(); g.moveTo(MX(zt + 0.0012), y); g.lineTo(MX(zt + (big ? 0.0075 : 0.0048)), y); g.stroke();
      if (big) {
        g.font = font(11, '600'); g.fillStyle = j === 0 ? SH(LD.c.probe, -0.25) : A('#000000', 0.7); g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(j === 0 ? '0' : (j > 0 ? '+' : '−') + Math.abs(j), MX(zt + 0.0085), y);
      }
    }
    g.font = font(10, '600'); g.fillStyle = A('#000000', 0.55); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText('mm', MX(zt + 0.0085), y0 + 13);
    // 螺桿、螺母、指針尖（依真實傾角）
    const th = beam.th, c = Math.cos(th), sn = Math.sin(th);
    const RP = function (u, v) { return [MX(ZP + u * c + v * sn), MY(-u * sn + v * c)]; };
    const rr = 0.0012;
    const a0 = RP(UTIP - 0.03, 0), a1 = RP(UTIP - 0.003, 0), tp = RP(UTIP, 0);
    LD.tube(g, function (cc) { cc.moveTo(a0[0], a0[1]); cc.lineTo(a1[0], a1[1]); }, tok.metal, 2 * rr * k);
    g.strokeStyle = A(SH(tok.metal, -0.6), 0.5); g.lineWidth = 0.8;
    for (let u = UTIP - 0.03; u < UTIP - 0.0035; u += 0.0008) {
      const p = RP(u, -rr), q = RP(u + 0.0003, rr);
      g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke();
    }
    const gcn = g.createLinearGradient(0, a1[1] - rr * k, 0, a1[1] + rr * k);
    gcn.addColorStop(0, SH(tok.metal, 0.3)); gcn.addColorStop(1, SH(tok.metal, -0.35));
    const e1 = RP(UTIP - 0.003, rr), e2 = RP(UTIP - 0.003, -rr);
    g.beginPath(); g.moveTo(e1[0], e1[1]); g.lineTo(tp[0], tp[1]); g.lineTo(e2[0], e2[1]); g.closePath(); g.fillStyle = gcn; g.fill();
    const un = U1 + 0.0025 + st.nut * 1e-3;
    if (ZP + un + 0.002 > ZP + UTIP - 0.03) {
      const q = [RP(un - 0.002, -0.0028), RP(un + 0.002, -0.0028), RP(un + 0.002, 0.0028), RP(un - 0.002, 0.0028)];
      const gn = g.createLinearGradient(0, q[3][1], 0, q[0][1]);
      gn.addColorStop(0, SH(tok.brass, 0.3)); gn.addColorStop(0.5, tok.brass); gn.addColorStop(1, SH(tok.brass, -0.35));
      fillPoly(g, q, gn, A(SH(tok.brass, -0.6), 0.7), 1);
      g.strokeStyle = A(SH(tok.brass, -0.5), 0.5);
      const m1 = RP(un - 0.002, 0.0011), m2 = RP(un + 0.002, 0.0011), m3 = RP(un - 0.002, -0.0011), m4 = RP(un + 0.002, -0.0011);
      g.beginPath(); g.moveTo(m1[0], m1[1]); g.lineTo(m2[0], m2[1]); g.moveTo(m3[0], m3[1]); g.lineTo(m4[0], m4[1]); g.stroke();
    }
    g.restore();
    // 超出刻度範圍時的提示
    const tu = tipUp();
    if (Math.abs(tu) > 9.2) {
      const up = tu > 0, ay = up ? y0 + 6 : y0 + h - 6;
      LD.arrow(g, cx, ay + (up ? 16 : -16), cx, ay, LD.c.pos, 2.2);
    }
    // 讀數
    let txt, col;
    if (isLevel()) { txt = T('水平', 'Level') + '（' + (tu >= 0 ? '+' : '−') + Math.abs(tu).toFixed(2) + ' mm）'; col = LD.c.probe; }
    else { txt = (tu > 0 ? T('外端偏高 ', 'Outer end high by ') : T('外端偏低 ', 'Outer end low by ')) + Math.abs(tu).toFixed(1) + ' mm'; col = LD.c.text; }
    if (isEn()) txt = txt.replace('（', ' (').replace('）', ')');
    let sub = '';
    if (!resting) sub = T('擺動中…', 'swinging…');
    else if (atStop()) sub = T('靠在擋塊上', 'resting on a stop');
    LD.haloText(g, txt, b.x + b.w / 2, b.y + b.h - 18, col, 'center', 'alphabetic', font(narrow ? 12 : 13, '700'));
    if (sub) LD.haloText(g, sub, b.x + b.w / 2, b.y + b.h - 4, LD.c.muted, 'center', 'alphabetic', font(11, '600'));
  }

  function draw() {
    if (!W || !st.piece) return;
    const key = staticKey();
    if (key !== stKey) { buildStatic(); stKey = key; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(stCv, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawDynamic(ctx);
  }

  // =====================================================================
  // 天平的運動（只有擺動中或電流流動動畫時才跑）
  // =====================================================================
  let raf = 0, lastT = 0, lastTilt = 0;
  function flowing() { return st.show.flow && st.power && st.I1 > 0 && !LD.reducedMotion(); }
  function needLoop() { return !document.hidden && (!resting || flowing()); }
  function physics(dt) {
    const tq = torque(), f = fric();
    const r = C.stepBeam(beam, tq, dt, f);
    if (r.hit > 0.02) knock(r.hit);
    if (f === 0) {
      const eq = C.eqAngle(tq);
      // 剩下的擺動小於指針尖 0.03 mm（畫面與讀數都看不出來）就直接停在平衡角，不必等阻尼慢慢磨完
      if (Math.abs(beam.th - eq) < 1.5e-4 && Math.abs(beam.om) < 4e-4) { beam.th = eq; beam.om = 0; }
    }
  }
  function loop(t) {
    raf = 0;
    const dt = lastT ? Math.min(1 / 30, (t - lastT) / 1000) : 1 / 60;
    lastT = t;
    if (!resting) {
      physics(dt);
      if (atRest()) { resting = true; onSettle(); }
    }
    if (flowing()) flowT += dt;
    if (view3 && view3.active) view3.frame(); else draw();
    if (t - lastTilt > 90 || resting) { lastTilt = t; updateTilt(); }
    if (needLoop()) raf = requestAnimationFrame(loop); else lastT = 0;
  }
  function kick() { if (!raf && needLoop()) { lastT = 0; raf = requestAnimationFrame(loop); } }
  /** 力矩改變後：如果還靜止（摩擦撐住）就維持靜止，否則開始擺動 */
  function disturb() {
    if (resting && !atRest()) resting = false;
    kick();
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { kick(); requestDraw(); } });

  // ---------- 讀數與步驟 ----------
  function setHTML(id, h) { const el = $(id); if (el && el.innerHTML !== h) el.innerHTML = h; }
  const sup4 = ' × 10<sup>−4</sup> N';
  function updateTilt() {
    const tp = tipUp(), lv = isLevel(), el = $('rTilt');
    let txt;
    if (lv) txt = T('水平', 'Level');
    else txt = (tp > 0 ? T('外端偏高 ', 'Outer end high ') : T('外端偏低 ', 'Outer end low ')) + Math.abs(tp).toFixed(1) + ' mm';
    if (!resting) txt += T('（擺動中）', ' (swinging)');
    else if (atStop()) txt += T('（擋塊）', ' (stop)');
    if (el.textContent !== txt) el.textContent = txt;
    el.className = lv ? 'lv' : 'off';
  }
  function updateReadouts() {
    setHTML('rI1', st.power ? I1m().toFixed(2) + ' A' : '—');
    setHTML('rI2', st.power ? I2m().toFixed(2) + ' A' : '—');
    setHTML('rM', st.piece.mg + ' mg' + (st.hung ? '' : T('（未掛）', ' (not hung)')));
    setHTML('rW', st.hung ? (st.piece.mg * 1e-6 * G * 1e4).toFixed(2) + sup4 : '—');
    const B = C.MU0 * APP.n * I2m();
    setHTML('rB', st.power ? (B * 1e3).toFixed(2) + ' mT' : '—');
    setHTML('rF', st.power ? (I1m() * APP.L * B * 1e4).toFixed(2) + sup4 : '—');
    $('power').textContent = st.power ? T('關閉電源', 'Power off') : T('開啟電源', 'Power on');
    $('power').setAttribute('aria-pressed', String(st.power));
    $('hang').textContent = st.hung ? T('取下漆包線', 'Take the wire off') : T('掛上天平', 'Hang it on the balance');
    $('hang').setAttribute('aria-pressed', String(st.hung));
    $('rev1').setAttribute('aria-pressed', String(st.s1 < 0));
    $('rev2').setAttribute('aria-pressed', String(st.s2 < 0));
    updateTilt();
    updateCanvasLabel();
  }
  /** 畫布的文字描述（螢幕閱讀器；不設 aria-live，狀態改變時更新） */
  function updateCanvasLabel() {
    const tp = tipUp();
    const bal = isLevel() ? T('天平水平', 'the balance is level')
      : (tp > 0 ? T('外端偏高 ', 'the outer end is ') + Math.abs(tp).toFixed(1) + T(' mm', ' mm high') : T('外端偏低 ', 'the outer end is ') + Math.abs(tp).toFixed(1) + T(' mm', ' mm low'));
    const cur = st.power ? T('電流表 I1 = ' + I1m().toFixed(2) + ' A、I2 = ' + I2m().toFixed(2) + ' A', 'ammeters I1 = ' + I1m().toFixed(2) + ' A, I2 = ' + I2m().toFixed(2) + ' A') : T('電源關閉', 'power off');
    const wire = st.hung ? T('外端掛著 ' + st.piece.mg + ' mg 的漆包線', 'a ' + st.piece.mg + ' mg piece of wire hangs on the outer end') : T('掛勾上沒有東西', 'nothing on the hook');
    const t = T('電流天平示意圖：剖開一半的螺線管與伸進管內的ㄈ字形電路。目前' + cur + '，' + wire + '，' + bal + '。',
      'Diagram of the current balance: a solenoid cut open with the U-shaped circuit reaching into it. Now ' + cur + ', ' + wire + ', and ' + bal + '.');
    if (cv.getAttribute('aria-label') !== t) cv.setAttribute('aria-label', t);
    // 英文模式也同步 data-en-aria-label，免得載入完成時被 HTML 的靜態英文蓋回去
    if (cv.hasAttribute('data-en-aria-label') && T('0', '1') === '1') cv.setAttribute('data-en-aria-label', t);
  }
  function analysis() {
    return C.analyze(st.rows.map(function (r) { return { part: r.part, m: r.m * 1e-6, I1: r.I1, I2: r.I2 }; }));
  }
  function updateSteps() {
    const s0 = st.steps;
    if (resting && isLevel() && !st.hung && !(I1t() > 0 && I2t() > 0)) s0[0] = true;
    if (st.power && st.fromMin) s0[1] = true;
    if (magDown() && st.I1 >= 0.995 && st.I1 <= 3.005 && st.I2 >= 1) s0[2] = true;
    const An = analysis();
    if (An.p1.n >= 1) s0[3] = true;
    if (An.p1.distinctM >= 5) s0[4] = true;
    if (An.p2.distinctM >= 5) s0[5] = true;
    const items = $('steps').children;
    let now = -1;
    for (let i = 0; i < items.length; i++) {
      items[i].classList.toggle('done', !!s0[i]);
      if (now < 0 && !s0[i]) now = i;
      items[i].classList.toggle('now', i === now);
      if (s0[i]) items[i].setAttribute('aria-label', T('已完成：', 'Done: ') + items[i].textContent);
      else items[i].removeAttribute('aria-label');
    }
    return { now: now, A: An };
  }
  const SUB1 = 'I<sub>1</sub>', SUB2 = 'I<sub>2</sub>';
  function stepHint(now, An) {
    const knob = st.part === 1 ? SUB2 : SUB1;
    if (now === 0 && I1t() > 0 && I2t() > 0) return T('歸零要在沒有電流時做：先把電流轉到 0 或關掉電源。', 'Zero the balance with no current: turn the currents to 0 or switch off.');
    if (now === 0 && st.hung) return T('歸零時掛勾上不能有東西：先按「取下漆包線」。', 'Nothing may hang on the hook while zeroing: take the wire off first.');
    if (now >= 2 && currents() && !magDown()) {
      return T('外端下垂：bc 被往上推了。按「' + SUB1 + ' 反向」或「' + SUB2 + ' 反向」其中一個（兩個都按等於沒改）。',
        'The outer end drops: bc is pushed up. Press “Reverse ' + SUB1 + '” or “Reverse ' + SUB2 + '”, but not both.');
    }
    if (now >= 3 && st.hung && magDown()) {
      if (!resting) return T('天平還在擺動，等它停下來再判斷。', 'The balance is still swinging; wait for it to stop.');
      if (isLevel()) return T('天平平衡了！按「記錄」。', 'Balanced! Press “Record”.');
      if (tipUp() > 0) return T('外端偏高：磁力太大，把 ' + knob + ' 調小一點。', 'Outer end high: the magnetic force is too big. Lower ' + knob + ' a little.');
      return T('外端偏低：磁力不夠，把 ' + knob + ' 調大一點。', 'Outer end low: the magnetic force is too small. Raise ' + knob + ' a little.');
    }
    switch (now) {
      case 0: return T('步驟 1：不通電、不掛重物，拖曳「歸零螺母」滑桿，讓指針對準水平刻線（看「指針放大」圖）。', 'Step 1: with no current and nothing on the hook, move the “zero nut” slider until the pointer lines up with the level mark (see the pointer close-up).');
      case 1: return T('步驟 2：兩個電流旋鈕都轉到 0，再按「開啟電源」。', 'Step 2: turn both current knobs to 0, then press “Power on”.');
      case 2: return T('步驟 3：把 ' + SUB1 + ' 調到 1.00–3.00 A、' + SUB2 + ' 調到約 2 A，外端應該上翹。', 'Step 3: set ' + SUB1 + ' to 1.00–3.00 A and ' + SUB2 + ' to about 2 A; the outer end should rise.');
      case 3: return T('步驟 4：剪一段漆包線、按「掛上天平」，再慢慢調 ' + knob + ' 讓指針回到水平並停穩，按「記錄」。', 'Step 4: cut a piece of wire and hang it on, then slowly adjust ' + knob + ' until the pointer is level and still, and press “Record”.');
      case 4: return T('步驟 5：' + SUB1 + ' 保持不變，換 5 種長度的漆包線各平衡一次並記錄（已做 ' + (An.p1.distinctM || 0) + ' 種）。', 'Step 5: keep ' + SUB1 + ' fixed and balance 5 different lengths of wire (' + (An.p1.distinctM || 0) + ' so far).');
      case 5: return T('步驟 6：按「實驗二」，把 ' + SUB2 + ' 固定在 3.00–5.00 A，改調 ' + SUB1 + ' 平衡，做 5 種長度（已做 ' + (An.p2.distinctM || 0) + ' 種）。', 'Step 6: choose “Part 2”, fix ' + SUB2 + ' at 3.00–5.00 A and balance with ' + SUB1 + ' for 5 lengths (' + (An.p2.distinctM || 0) + ' so far).');
      default: return T('六個步驟都完成了！看看下方的分析；也可以試試「含誤差」與「真實螺線管」。', 'All six steps done! Look at the analysis below, then try “With errors” and “Real solenoid”.');
    }
  }
  let pinned = 0;
  function setStatus(html) { const el = $('status'); if (el.innerHTML !== html) el.innerHTML = html; }
  function stepStatus() {
    const u = updateSteps();
    if (performance.now() < pinned) return;
    setStatus(stepHint(u.now, u.A));
  }
  function flash(html, ms) { setStatus(html); pinned = performance.now() + (ms || 4000); }

  // ---------- 任務事件 ----------
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function info() {
    return {
      power: st.power, fromMin: st.fromMin, I1: I1t(), I2: I2t(), I1m: I1m(), I2m: I2m(), s1: st.s1, s2: st.s2,
      magDown: magDown(), currents: currents(), hung: st.hung, mg: st.piece.mg, mTrue: st.piece.m * 1e6, len: st.piece.len,
      nut: st.nut, zeroOff: zeroOffMg(), tip: tipUp(), level: isLevel(), rest: resting, stop: atStop(),
      mode: st.mode, realSol: st.realSol, part: st.part, combos: Object.keys(st.combos).length
    };
  }
  function onSettle() {
    if (currents()) st.combos[st.s1 + ',' + st.s2] = true;
    updateReadouts();
    stepStatus();
    if (isLevel() && st.hung && currents()) chime();
    emit('state', info());
    if (view3 && view3.active) view3.update();
    requestDraw();
  }
  /** 使用者改變了設定：重算、重畫、通知任務 */
  function afterChange(user) {
    disturb();
    updateReadouts();
    stepStatus();
    if (view3 && view3.active) view3.update();
    requestDraw();
    if (user) emit('state', info());
  }

  // ---------- 音效 ----------
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  function clickSound() { const S = sound(); if (!S) return; S.noise({ dur: 0.03, gain: 0.5, filter: 2400, q: 1 }); S.tone({ freq: 1150, dur: 0.05, type: 'triangle', gain: 0.22 }); }
  function chime() { const S = sound(); if (!S) return; S.tone({ freq: 784, dur: 0.18, type: 'sine', gain: 0.16 }); setTimeout(function () { const S2 = sound(); if (S2) S2.tone({ freq: 1175, dur: 0.26, type: 'sine', gain: 0.13 }); }, 110); }
  let lastKnock = 0;
  function knock(om) {
    const S = sound(); if (!S) return;
    const t = performance.now(); if (t - lastKnock < 120) return; lastKnock = t;
    const v = Math.min(1, om / 0.25);
    S.noise({ dur: 0.04, gain: 0.25 + 0.5 * v, filter: 1500, q: 1.2 });
    S.tone({ freq: 520, dur: 0.06, type: 'triangle', gain: 0.08 + 0.18 * v });
  }
  function powerSound(on) {
    const S = sound(); if (!S) return;
    S.noise({ dur: 0.035, gain: 0.6, filter: 1800, q: 0.8 });
    if (on) S.sweep({ from: 300, to: 620, dur: 0.3, type: 'sine', gain: 0.1 });
    else S.sweep({ from: 600, to: 280, dur: 0.22, type: 'sine', gain: 0.08 });
  }
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

  // ---------- 控制項 ----------
  const elI1 = $('I1'), elI2 = $('I2'), elWl = $('wl'), elNut = $('nut');
  function outs() {
    $('I1o').textContent = val(elI1).toFixed(3) + ' A';
    $('I2o').textContent = val(elI2).toFixed(3) + ' A';
    $('wlo').textContent = val(elWl).toFixed(1) + ' cm';
    $('nuto').textContent = val(elNut).toFixed(2) + ' mm';
  }
  function read() { st.I1 = val(elI1); st.I2 = val(elI2); st.nut = val(elNut); }
  [elI1, elI2, elNut].forEach(function (el) {
    el.addEventListener('input', function () { read(); outs(); afterChange(false); });
    el.addEventListener('change', function () { read(); outs(); afterChange(true); });
  });
  elWl.addEventListener('input', function () { st.len = val(elWl); cutPiece(); outs(); afterChange(false); });
  elWl.addEventListener('change', function () { st.len = val(elWl); if (st.piece.len !== st.len) cutPiece(); outs(); afterChange(true); });
  $('power').addEventListener('click', function () {
    st.power = !st.power;
    if (st.power) {
      st.fromMin = st.I1 === 0 && st.I2 === 0;
      if (!st.fromMin) flash(T('提醒：開電源前應先把兩個電流旋鈕轉到 0（步驟 2）。請關掉電源、歸零後再開一次。', 'Note: turn both current knobs to 0 before switching on (step 2). Switch off, turn them to 0 and switch on again.'), 6000);
    } else st.fromMin = false;
    powerSound(st.power);
    afterChange(true);
    emit('power', { on: st.power, fromMin: st.fromMin });
  });
  $('rev1').addEventListener('click', function () { st.s1 = -st.s1; clickSound(); afterChange(true); });
  $('rev2').addEventListener('click', function () { st.s2 = -st.s2; clickSound(); afterChange(true); });
  $('hang').addEventListener('click', function () { st.hung = !st.hung; clickSound(); afterChange(true); });
  function setMode(m) {
    if (m === st.mode) return;
    st.mode = m;
    $('modeIdeal').setAttribute('aria-pressed', String(m === 'ideal'));
    $('modeReal').setAttribute('aria-pressed', String(m === 'real'));
    cutPiece();
    modeHint();
    afterChange(true);
  }
  function modeHint() {
    const a = st.mode === 'ideal'
      ? T('理想：電表與電子秤準確，支點沒有摩擦。', 'Ideal: exact meters and scale, no friction at the pivot.')
      : T('含誤差：電流表最多 ±0.6%、電子秤最多 ±0.3% 的校正誤差；每段漆包線的線密度略有不同；支點有一點摩擦。', 'With errors: ammeters up to ±0.6% and the scale up to ±0.3% off; each piece of wire is slightly different; a little friction at the pivot.');
    const b = st.realSol
      ? T('真實螺線管：有限長，管口磁場向外散開，側臂受到與 bc 相反的力。', ' Real solenoid: finite length; the field spreads at the mouth and pushes the side arms the opposite way to bc.')
      : T('長螺線管近似：管內 B = μ0nI2 均勻，側臂不受力。', ' Long-solenoid model: uniform B = μ0nI2 inside, no force on the side arms.');
    $('modeHint').innerHTML = (a + b).replace('μ0nI2', 'μ<sub>0</sub>nI<sub>2</sub>');
  }
  $('modeIdeal').addEventListener('click', function () { setMode('ideal'); });
  $('modeReal').addEventListener('click', function () { setMode('real'); });
  $('realSol').addEventListener('change', function (ev) { st.realSol = ev.target.checked; modeHint(); afterChange(true); });
  [['showLabels', 'labels'], ['showField', 'field'], ['showForce', 'force'], ['showFlow', 'flow']].forEach(function (p) {
    $(p[0]).addEventListener('change', function (ev) {
      st.show[p[1]] = ev.target.checked; requestDraw(); kick();
      if (view3 && view3.active) view3.update();
    });
  });
  function setPart(p) {
    st.part = p;
    $('part1').setAttribute('aria-pressed', String(p === 1));
    $('part2').setAttribute('aria-pressed', String(p === 2));
    setGraph(p);
    stepStatus();
  }
  $('part1').addEventListener('click', function () { setPart(1); });
  $('part2').addEventListener('click', function () { setPart(2); });
  function setGraph(p) {
    st.graph = p;
    $('g1').setAttribute('aria-pressed', String(p === 1));
    $('g2').setAttribute('aria-pressed', String(p === 2));
    drawGraph();
  }
  $('g1').addEventListener('click', function () { setGraph(1); });
  $('g2').addEventListener('click', function () { setGraph(2); });

  // ---------- 記錄與數據表 ----------
  function rowsInfo() {
    const An = analysis();
    const rows = st.rows.map(function (r, i) {
      const w = An.rows[i];
      return Object.assign({ F: w.F, B: w.B, mu0: w.mu0, err: w.mu0 / C.MU0 - 1 }, r);
    });
    return { An: An, rows: rows };
  }
  $('record').addEventListener('click', function () {
    if (!st.power) { flash(T('請先開啟電源。', 'Switch the power on first.')); return; }
    if (!st.hung) { flash(T('先剪一段漆包線、按「掛上天平」，再把天平調到平衡。', 'Hang a piece of wire on the balance first, then balance it.')); return; }
    if (!(I1m() > 0 && I2m() > 0)) { flash(T('兩個電流表的讀數都要大於 0。', 'Both ammeters must read more than 0.')); return; }
    if (!resting) { flash(T('天平還在擺動，等它停穩再記錄。', 'The balance is still swinging; wait until it stops.')); return; }
    if (!isLevel()) {
      flash(tipUp() > 0 ? T('外端偏高 ' + tipUp().toFixed(1) + ' mm，還沒平衡（要在 ±0.5 mm 內）。', 'The outer end is ' + tipUp().toFixed(1) + ' mm high: not balanced yet (it must be within ±0.5 mm).')
        : T('外端偏低 ' + (-tipUp()).toFixed(1) + ' mm，還沒平衡（要在 ±0.5 mm 內）。', 'The outer end is ' + (-tipUp()).toFixed(1) + ' mm low: not balanced yet (it must be within ±0.5 mm).'));
      return;
    }
    if (st.rows.length >= 30) { flash(T('數據表最多 30 筆，請先刪除一些。', 'The table holds at most 30 rows; delete some first.')); return; }
    const row = {
      part: st.part, m: st.piece.mg, I1: I1m(), I2: I2m(), mode: st.mode, realSol: st.realSol,
      zeroOff: Math.round(zeroOffMg() * 100) / 100, mTrue: st.piece.m * 1e6, tip: tipUp()
    };
    // 同一個實驗裡，固定的電流換了？
    const same = st.rows.filter(function (r) { return r.part === row.part; });
    const fixedKey = row.part === 1 ? 'I1' : 'I2';
    const changed = same.length && same.some(function (r) { return Math.abs(r[fixedKey] - row[fixedKey]) > 0.011; });
    st.rows.push(row);
    clickSound();
    renderTable();
    const R = rowsInfo(), last = R.rows[R.rows.length - 1];
    let msg = T('已記錄第 ' + st.rows.length + ' 筆：μ<sub>0</sub> = ' + (last.mu0 * 1e7).toFixed(3) + ' × 10<sup>−7</sup> T·m/A。',
      'Row ' + st.rows.length + ' recorded: μ<sub>0</sub> = ' + (last.mu0 * 1e7).toFixed(3) + ' × 10<sup>−7</sup> T·m/A.');
    if (changed) msg += T(' 注意：這個實驗的 ' + (row.part === 1 ? SUB1 : SUB2) + ' 應該保持不變。', ' Note: ' + (row.part === 1 ? SUB1 : SUB2) + ' should stay the same in this part.');
    flash(msg, 4500);
    updateSteps();
    const An = R.An;
    emit('record', {
      row: last, rows: R.rows, n: An.n,
      p1: { n: An.p1.n, mu0: An.p1.mu0, err: An.p1.err, distinctM: An.p1.distinctM || 0, I1spread: An.p1.I1spread, intercept: An.p1.line ? An.p1.line.intercept : null },
      p2: { n: An.p2.n, B: An.p2.B, Bth: An.p2.Bth, err: An.p2.err, mu0: An.p2.mu0, distinctM: An.p2.distinctM || 0, I2spread: An.p2.I2spread },
      mu0Mean: An.mu0Mean, meanErr: An.meanErr
    });
  });
  $('undo').addEventListener('click', function () {
    if (!st.rows.length) return;
    st.rows.pop(); renderTable(); stepStatus();
  });
  $('clearAll').addEventListener('click', function () {
    st.rows = []; renderTable(); stepStatus();
    emit('clear', {});
  });
  function fx(v, d) { return isFinite(v) ? v.toFixed(d) : '—'; }
  const pct = function (e) { return (e >= 0 ? '+' : '−') + Math.abs(e * 100).toFixed(1) + '%'; };
  function renderTable() {
    const body = $('recBody'), R = rowsInfo(), An = R.An;
    if (!st.rows.length) {
      body.innerHTML = '<tr class="empty"><td colspan="8">' + T('還沒有數據：讓天平平衡後按「記錄」。', 'No data yet: balance the scale and press “Record”.') + '</td></tr>';
    } else {
      body.innerHTML = R.rows.map(function (r, i) {
        let tg = '';
        if (r.mode === 'real') tg += '<span class="tag" title="' + T('含誤差', 'With errors') + '">' + T('誤', 'err') + '</span>';
        if (r.realSol) tg += '<span class="tag" title="' + T('真實螺線管', 'Real solenoid') + '">' + T('管', 'sol') + '</span>';
        if (Math.abs(r.zeroOff) > 0.9) tg += '<span class="tag" title="' + T('沒有歸零', 'Not zeroed') + '">' + T('偏', 'off') + '</span>';
        return '<tr><td>' + (i + 1) + tg + '</td><td class="' + (r.part === 2 ? 'p2' : '') + '">' + (r.part === 1 ? T('一', '1') : T('二', '2')) + '</td><td>' + r.m +
          '</td><td>' + r.I1.toFixed(2) + '</td><td>' + r.I2.toFixed(2) + '</td><td>' + fx(r.F * 1e4, 3) + '</td><td>' + fx(r.B * 1e3, 2) +
          '</td><td class="em">' + fx(r.mu0 * 1e7, 3) + '</td></tr>';
      }).join('');
    }
    const u7 = ' × 10<sup>−7</sup> T·m/A';
    const p1 = An.p1, p2 = An.p2;
    setHTML('aS1', p1.fit ? (p1.fit.slope * 1e3).toFixed(3) + ' mT/A' : '—');
    setHTML('aMu1', p1.mu0 ? (p1.mu0 * 1e7).toFixed(3) + u7 + '（' + pct(p1.err) + '）' : '—');
    setHTML('aC1', p1.line && p1.n >= 2 ? (p1.line.intercept * 1e3 >= 0 ? '+' : '−') + Math.abs(p1.line.intercept * 1e3).toFixed(2) + ' mT' : '—');
    setHTML('aS2', p2.fit ? (p2.fit.slope * 1e4).toFixed(3) + ' × 10<sup>−4</sup> N/A' : '—');
    setHTML('aB2', p2.B ? (p2.B * 1e3).toFixed(2) + ' mT（' + T('理論 ', 'theory ') + (p2.Bth * 1e3).toFixed(2) + ' mT，' + pct(p2.err) + '）' : '—');
    setHTML('aMean', An.mu0Mean ? (An.mu0Mean * 1e7).toFixed(3) + u7 + '（' + pct(An.meanErr) + '）' : '—');
    setHTML('aAcc', (C.MU0_CODATA * 1e7).toFixed(7) + u7);
    if (isEn()) {
      ['aMu1', 'aB2', 'aMean'].forEach(function (id) { $(id).innerHTML = $(id).innerHTML.replace('（', ' (').replace('）', ')').replace('，', ', '); });
    }
    drawGraph();
  }

  // ---------- 分析圖 ----------
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  const nice = function (v, steps) { const s0 = Math.pow(10, Math.floor(Math.log10(v / steps))); const m = [1, 2, 2.5, 5, 10].find(function (q) { return q * s0 * steps >= v; }); return m * s0; };
  function drawGraph() {
    const w = gcv.clientWidth, h = gcv.clientHeight;
    if (!w || !h) return;
    const r = Math.min(3, window.devicePixelRatio || 1);
    if (gcv.width !== Math.round(w * r) || gcv.height !== Math.round(h * r)) { gcv.width = Math.round(w * r); gcv.height = Math.round(h * r); }
    const g = gctx;
    g.setTransform(r, 0, 0, r, 0, 0);
    LD.backdrop(g, w, h);
    const An = analysis(), p = st.graph;
    const L = 52, Rr = 14, Tt = 16, B = 42, fz = 11;
    // 點：實驗一 (I2, B mT)；實驗二 (I1, F 10^-4 N)
    const pts = [];
    An.rows.forEach(function (wr, i) {
      const row = st.rows[i];
      if (!wr.ok || row.part !== p) return;
      pts.push(p === 1 ? [row.I2, wr.B * 1e3] : [row.I1, wr.F * 1e4]);
    });
    let xmax = p === 1 ? 5 : 4, ymax = p === 1 ? 25 : 30;
    pts.forEach(function (q) { xmax = Math.max(xmax, q[0] * 1.08); ymax = Math.max(ymax, q[1] * 1.12); });
    const dx = nice(xmax, 5), dy = nice(ymax, 5);
    xmax = Math.ceil(xmax / dx - 1e-9) * dx; ymax = Math.ceil(ymax / dy - 1e-9) * dy;
    const px = function (x) { return L + x / xmax * (w - L - Rr); };
    const py = function (y) { return h - B - y / ymax * (h - B - Tt); };
    LD.grid(g, L, Tt, w - Rr, h - B, (w - L - Rr) * dx / xmax, (w - L - Rr) * dx / xmax / 5, L, h - B);
    g.strokeStyle = A(LD.c.text, 0.7); g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(L, Tt - 4); g.lineTo(L, h - B); g.lineTo(w - Rr + 4, h - B); g.stroke();
    g.font = font(fz); g.fillStyle = LD.c.muted; g.textAlign = 'center'; g.textBaseline = 'top';
    for (let x = 0; x <= xmax + 1e-9; x += dx) g.fillText(String(+x.toFixed(2)), px(x), h - B + 4);
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let y = 0; y <= ymax + 1e-9; y += dy) g.fillText(String(+y.toFixed(2)), L - 5, py(y));
    // 軸名稱
    const fa = 11.5;
    rich(g, [['I', null], [p === 1 ? '2' : '1', 'sub'], [' (A)', null]], (L + w - Rr) / 2, h - 8, LD.c.text, fa, '600', 'center', true);
    g.save(); g.translate(14, (Tt + h - B) / 2); g.rotate(-Math.PI / 2);
    if (p === 1) rich(g, [['B (mT)', null]], 0, 4, LD.c.text, fa, '600', 'center', true);
    else rich(g, [['F (10', null], ['−4', 'sup'], [' N)', null]], 0, 4, LD.c.text, fa, '600', 'center', true);
    g.restore();
    // 理論線
    let kth = null;
    if (p === 1) kth = C.MU0 * APP.n * 1e3;                         // mT/A
    else if (An.p2.n) kth = C.MU0 * APP.n * An.p2.I2 * APP.L * 1e4;  // 10^-4 N/A
    const seg = function (k, b0) {
      const xe = k > 0 ? Math.min(xmax, (ymax - b0) / k) : xmax;
      const xs = b0 < 0 && k > 0 ? Math.min(xe, -b0 / k) : 0;
      g.beginPath(); g.moveTo(px(xs), py(b0 + k * xs)); g.lineTo(px(xe), py(b0 + k * xe)); g.stroke();
    };
    g.lineCap = 'round';
    if (kth) { g.setLineDash([6, 5]); g.strokeStyle = A(LD.c.muted, 0.85); g.lineWidth = 1.3; seg(kth, 0); g.setLineDash([]); }
    const fit = p === 1 ? An.p1.fit : An.p2.fit, line = p === 1 ? An.p1.line : An.p2.line;
    const scl = p === 1 ? 1e3 : 1e4;
    if (fit) { g.strokeStyle = LD.c.accent; g.lineWidth = 2.2; seg(fit.slope * scl, 0); }
    let showLine = false;
    if (line && pts.length >= 3 && Math.abs(line.intercept * scl) > 0.025 * ymax) {
      showLine = true;
      g.setLineDash([3, 4]); g.strokeStyle = A(LD.c.accent, 0.9); g.lineWidth = 1.5; seg(line.slope * scl, line.intercept * scl); g.setLineDash([]);
    }
    pts.forEach(function (q) { LD.ball(g, px(q[0]), py(q[1]), 4.5, p === 1 ? LD.c.neg : LD.c.pos); });
    // 圖例
    const lf = font(10.5, '600');
    let ly = Tt + 12;
    const items = [[LD.c.accent, p === 1 ? T('最佳直線（過原點，斜率 = μ0n）', 'best fit through 0 (slope = μ0n)') : T('最佳直線（過原點，斜率 = LB）', 'best fit through 0 (slope = LB)'), 0]];
    if (showLine) items.push([LD.c.accent, T('一般最佳直線（看截距）', 'ordinary best fit (intercept)'), [3, 4]]);
    if (kth) items.push([LD.c.muted, p === 1 ? T('理論 B = μ0nI2', 'theory B = μ0nI2') : T('理論 F = μ0nI2L·I1', 'theory F = μ0nI2L·I1'), [5, 4]]);
    items.forEach(function (it) {
      g.strokeStyle = it[0]; g.lineWidth = 2; if (it[2]) g.setLineDash(it[2]);
      g.beginPath(); g.moveTo(L + 10, ly); g.lineTo(L + 30, ly); g.stroke(); g.setLineDash([]);
      // μ0、I2 等的下標
      const parts = it[1].split(/(μ0|I2|I1)/).filter(Boolean).map(function (t) {
        return t === 'μ0' ? [['μ', null], ['0', 'sub']] : t === 'I2' ? [['I', null], ['2', 'sub']] : t === 'I1' ? [['I', null], ['1', 'sub']] : [[t, null]];
      }).reduce(function (a, b) { return a.concat(b); }, []);
      g.font = lf;
      rich(g, parts, L + 36, ly + 4, LD.c.text, 10.5, '600', 'left', true);
      ly += 17;
    });
    if (!pts.length) LD.haloText(g, T('記錄數據後，點會出現在這裡', 'Recorded points will appear here'), (L + w) / 2, (Tt + h - B) / 2 + 14, LD.c.muted, 'center', 'middle', font(12, '600'));
  }

  // =====================================================================
  // 3D 檢視（three.js 以 import() 延遲載入；場景在 current-balance-3d.js）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), viewMsg = $('viewMsg');
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadThree() {
    if (threeLib) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js')]).then(function (mods) {
      threeLib = { THREE: mods[0], OrbitControls: mods[1].OrbitControls };
      return threeLib;
    });
  }
  function state3() {
    return {
      th: beam.th, power: st.power, I1: I1t(), I2: I2t(), s1: st.s1, s2: st.s2, hung: st.hung, len: st.piece.len,
      nut: st.nut, show: st.show, realSol: st.realSol, flowT: flowT, flowing: flowing(), lines: st.show.field ? fieldLines() : null,
      F: Fbc(), Fside: Math.abs(REAL.sideForce) * I1t() * I2t() / 2, uSide: USIDE, W: st.hung ? st.piece.m * G : 0, FREF: FREF,
      level: isLevel(), tip: tipUp(), mg: st.piece.mg, I1m: I1m(), I2m: I2m()
    };
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
      if (!webglAvailable() || !window.CurrentBalance3D) { fail3D(); return; }
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        view3 = window.CurrentBalance3D.create(lib, {
          host: $('view3'), core: C, T: T, state: state3, tokens: function () { readTokens(); return Object.assign({}, tok, LD.c, { dark: LD.dark }); },
          lost: function () { setView('2d'); viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D。', 'The 3D graphics context was lost, so the view switched back to 2D.'); }
        });
        viewMsg.textContent = '';
        $('resetCam').hidden = false;
        view3.update();
        kick();
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
      kick();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('resetCam').hidden = true;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D view is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });
  $('resetCam').addEventListener('click', function () { if (view3) view3.resetCamera(); });

  // ---------- 啟動 ----------
  function onTheme() {
    readTokens();
    stKey = '';
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
    drawGraph();
  }
  readTokens();
  window.addEventListener('lab:themechange', onTheme);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', onTheme);
  }
  if (LD.reducedMotion()) { st.show.flow = false; $('showFlow').checked = false; }
  // 分享連結：兩個「反向」按鈕是切換鈕（預設 I1 已反向），classroom.js 只會補按「按下」的按鈕，所以電流方向另外記錄
  // classroom.js 在 DOMContentLoaded 才載入：還沒有 LabShare 時，等 load 再登記（還原在 load 之後才做）
  function regShare() {
    if (!window.LabShare) return false;
    window.LabShare.register({
      get: function () { return { s1: st.s1, s2: st.s2 }; },
      set: function (o) {
        if (!o || typeof o !== 'object') return;
        if (o.s1 === 1 || o.s1 === -1) st.s1 = o.s1;
        if (o.s2 === 1 || o.s2 === -1) st.s2 = o.s2;
        afterChange(false);
      }
    });
    return true;
  }
  if (!regShare()) window.addEventListener('load', regShare);
  read(); st.len = val(elWl); outs();
  cutPiece();
  beam.th = C.eqAngle(torque()); beam.om = 0; resting = true;
  modeHint();
  updateSoundButton();
  updateReadouts();
  renderTable();
  stepStatus();
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
    let lastG = 0;
    new ResizeObserver(function () { if (gcv.clientWidth !== lastG) { lastG = gcv.clientWidth; drawGraph(); } }).observe(gcv);
  }
  window.addEventListener('resize', function () { resize(); drawGraph(); });
  resize();
  kick();
})();
