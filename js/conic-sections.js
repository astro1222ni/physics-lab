/* conic-sections.js — 「圓錐曲線：用平面切圓錐」的畫面與互動（數學計算全部在 conic-sections-core.js；
 * 共用繪圖工具 LabDraw 在 drawkit.js；3D 檢視在 conic-sections-3d.js，切換到 3D 時才載入） */
(function () {
  'use strict';
  const CC = window.ConicCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // 本檔的版本號（?v=）：切換到 3D 時動態載入的 js/conic-sections-3d.js 沿用同一個版本號
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const DEG = Math.PI / 180;
  const D_REF = 3;        // 畫面縮放以 d = 3 的大小安排（改 d 時圖形真的會變大變小）
  const alpha = D.alpha, shade = D.shade, mix = D.mix;

  // ---------- 狀態 ----------
  const state = {
    alpha: 30, beta: 55, d: 2.5,
    sec: null,
    P: { br: 1, t: 1.15 },          // 曲線上 P 的參數（拋物線的 t 以 2p 為單位）
    show: { spheres: true, dir: true, gen: false, latus: false, asym: true },
    log: [],                         // 記下的點
    committedType: null,             // 上一次回報任務時的曲線類型
    hover: null, drag: null
  };

  // ---------- 色彩（lab.css 與本頁的代號） ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'accent-soft', 'surface', 'pos', 'neg', 'probe',
      'cs-cone', 'cs-plane', 'cs-curve', 'cs-sphere', 'cs-dir']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    C.dark = D.dark;
  }
  function fnt(px, weight, italic) { return (italic ? 'italic ' : '') + (weight ? weight + ' ' : '') + px + 'px ' + FONT; }

  // ---------- 數字格式 ----------
  function num(v, dec) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(dec);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  /** 有效數字較多的長度（很大或很小時自動調整小數位） */
  function len(v) {
    if (!isFinite(v)) return '∞';
    const a = Math.abs(v);
    return num(v, a >= 100 ? 0 : a >= 10 ? 1 : a >= 0.1 ? 2 : 3);
  }
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s;
  }
  function typeName(type) { const n = CC.NAMES[type]; return n ? T(n[0], n[1]) : type; }

  // ---------- 曲線上的點 P ----------
  /** P 的參數 → 曲線上的標準式座標（拋物線的參數以 2p 為單位，改 d 時 P 留在「同樣的相對位置」） */
  function pPoint(sec, par) {
    sec = sec || state.sec; par = par || state.P;
    if (sec.degenerate) return null;
    if (sec.type === 'parabola') return CC.pointAt(sec, { br: 1, t: par.t * 2 * sec.p });
    return CC.pointAt(sec, par);
  }
  function setPFromNearest(n) {
    const sec = state.sec;
    if (sec.type === 'parabola') state.P = { br: 1, t: n.par.t / (2 * sec.p) };
    else state.P = { br: n.par.br, t: n.par.t };
  }
  function defaultP(family) {
    if (family === 'hyperbola') return { br: 1, t: 0.75 };
    if (family === 'parabola') return { br: 1, t: 0.8 };
    return { br: 1, t: 1.15 };
  }
  function measureP() {
    const q = pPoint();
    return q ? CC.measure(state.sec, q.x, q.y) : null;
  }

  // ---------- 畫布與版面 ----------
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 300, L = null;
  const RAD = 9;
  function layout() {
    const narrow = cw < 600;
    const gap = narrow ? 8 : 10;
    if (narrow) {
      const h1 = Math.round(cw * 0.9), h2 = Math.round(cw * 0.86);
      return { narrow: narrow, gap: gap, side: { x: 0, y: 0, w: cw, h: h1 }, shape: { x: 0, y: h1 + gap, w: cw, h: h2 }, H: h1 + gap + h2 };
    }
    const pw = Math.floor((cw - gap) / 2);
    const h = Math.round(Math.min(pw * 1.04, 560));
    return { narrow: narrow, gap: gap, side: { x: 0, y: 0, w: pw, h: h }, shape: { x: pw + gap, y: 0, w: cw - pw - gap, h: h }, H: h };
  }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layout();
    ch = L.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    retarget(true);
    draw();
  }

  // ---------- 兩張圖的縮放與平移（目標值＋平順移動） ----------
  // 每張圖：世界座標 (cx, cy) 對到內容區中心，k = 每單位長的像素數
  const view = { side: null, shape: null }, target = { side: null, shape: null };
  const PAD = { side: { l: 16, r: 16, t: 34, b: 30 }, shape: { l: 16, r: 16, t: 34, b: 58 } };
  function contentCenter(R, pad) { return { x: R.x + pad.l + (R.w - pad.l - pad.r) / 2, y: R.y + pad.t + (R.h - pad.t - pad.b) / 2 }; }
  function fitBox(R, pad, box) {
    const w = R.w - pad.l - pad.r, h = R.h - pad.t - pad.b;
    const bw = Math.max(1e-6, box.x1 - box.x0), bh = Math.max(1e-6, box.y1 - box.y0);
    let k = Math.min(w / bw, h / bh);
    k = Math.pow(2, Math.floor(Math.log2(k) * 4) / 4); // 縮放分級（2 的 1/4 次方一級），改角度時不會一直跳
    return { k: k, cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2 };
  }
  /** 側視圖要涵蓋的範圍（用 d = D_REF 計算；距頂點太遠的部分截掉） */
  function sideBox() {
    const s = CC.section(state.alpha, state.beta, D_REF);
    const pts = [[0, 0], [s.foot[0], s.foot[2]]];
    s.spheres.forEach(function (S) {
      pts.push([0, S.zc + S.r], [0, S.zc - S.r], [S.r, S.zc], [-S.r, S.zc], [S.focus3[0], S.focus3[2]]);
    });
    (s.family === 'parabola' ? [0] : [-s.a, s.a]).forEach(function (x) { const X = CC.toSpace(s, x, 0); pts.push([X[0], X[2]]); });
    const RC = 3.4 * D_REF;
    const box = { x0: 0, x1: 0, y0: 0, y1: 0 };
    pts.forEach(function (p) {
      let x = p[0], z = p[1];
      const r = Math.hypot(x, z);
      if (r > RC) { x *= RC / r; z *= RC / r; }
      box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x);
      box.y0 = Math.min(box.y0, z); box.y1 = Math.max(box.y1, z);
    });
    // 頂點四周至少留一些空間（看得到兩條母線張開）
    const m = 0.55 * D_REF;
    box.x0 = Math.min(box.x0, -m); box.x1 = Math.max(box.x1, m);
    box.y0 = Math.min(box.y0, -m); box.y1 = Math.max(box.y1, m);
    return box;
  }
  /**
   * 形狀圖要涵蓋的範圍（標準式座標）。整條曲線放得下時用 d = D_REF 計算（改 d 時曲線在固定的格線上變大變小）；
   * 很扁的橢圓、很窄的雙曲線（接近拋物線）只放得下靠近焦點 F1 的頂點附近，這時用實際的 d（頂點的位置跟著 d 移動）。
   */
  function shapeBox() {
    const s3 = CC.section(state.alpha, state.beta, D_REF), s = state.sec;
    const CAP = 4.5 * D_REF;
    function nearVertex(vx, q, hl) {
      const yh = Math.max(1.8 * hl, 2.4 * q);
      return { x0: vx - 1.5 * q, x1: vx + 5 * q, y0: -yh, y1: yh };
    }
    if (s3.family === 'circle') return { x0: -s3.a, x1: s3.a, y0: -s3.a, y1: s3.a };
    if (s3.family === 'parabola') return nearVertex(0, s3.p, 2 * s3.p);
    if (s3.family === 'ellipse') {
      if (s3.a <= CAP) return { x0: -s3.a, x1: s3.a, y0: -s3.b, y1: s3.b };
      if (s.degenerate) return { x0: -1, x1: 1, y0: -1, y1: 1 };
      return nearVertex(-s.a, s.a - s.c, s.latus / 2);
    }
    const X = 1.45 * s3.c;
    if (X <= CAP) {
      const Y = Math.min(Math.max(s3.latus / 2 * 1.15, 1.25 * s3.b, 0.45 * X), 1.2 * X);
      return { x0: -X, x1: X, y0: -Y, y1: Y };
    }
    // 接近拋物線的雙曲線；平面過頂點時（兩條相交直線）以頂點為中心
    if (s.degenerate) { const h = 0.3 * CAP; return { x0: -h, x1: h, y0: -h, y1: h }; }
    return nearVertex(s.a, s.c - s.a, s.latus / 2);
  }
  /** P 跑到右圖外面時（例如橢圓被拉得很扁），把它移回畫面內、靠近焦點 F1 那一側的曲線上 */
  let lastShapeBox = null;
  function ensurePVisible() {
    const s = state.sec, B = lastShapeBox, q = pPoint();
    if (!q || !B) return false;
    const mx = (B.x1 - B.x0) * 0.06, my = (B.y1 - B.y0) * 0.06;
    if (q.x >= B.x0 + mx && q.x <= B.x1 - mx && q.y >= B.y0 + my && q.y <= B.y1 - my) return false;
    const fx = s.foci.length ? s.foci[0].x : (B.x0 + B.x1) / 2;
    const n = CC.nearest(s, fx + (B.x1 - B.x0) * 0.08, (B.y1 - B.y0) * 0.32);
    setPFromNearest(n);
    return true;
  }
  let frozen = false; // 在畫布上拖曳切平面時，側視圖不改變縮放（不然切平面會在手指下亂跑）
  function retarget(snap) {
    if (!L) return;
    if (!frozen) target.side = fitBox(L.side, PAD.side, sideBox());
    lastShapeBox = shapeBox();
    target.shape = fitBox(L.shape, PAD.shape, lastShapeBox);
    if (snap || reducedMotion || !view.side) {
      view.side = Object.assign({}, target.side);
      view.shape = Object.assign({}, target.shape);
    }
  }
  /** 每一幀讓畫面往目標移動；傳回 true 表示還沒到 */
  let lastT = 0;
  function easeViews(now) {
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016;
    lastT = now;
    const f = 1 - Math.exp(-dt / 0.11);
    let moving = false;
    ['side', 'shape'].forEach(function (k) {
      const v = view[k], t = target[k];
      if (!v || !t) return;
      const lk = Math.log(v.k), lt = Math.log(t.k);
      const nk = Math.abs(lt - lk) < 1e-3 ? t.k : Math.exp(lk + (lt - lk) * f);
      const tol = 0.25 / t.k;
      const ncx = Math.abs(t.cx - v.cx) < tol ? t.cx : v.cx + (t.cx - v.cx) * f;
      const ncy = Math.abs(t.cy - v.cy) < tol ? t.cy : v.cy + (t.cy - v.cy) * f;
      if (nk !== t.k || ncx !== t.cx || ncy !== t.cy) moving = true;
      v.k = nk; v.cx = ncx; v.cy = ncy;
    });
    return moving;
  }
  // 側視圖：世界 (x, z) → 畫面；形狀圖：標準式 (x′, y′) → 畫面
  function SX(x) { const v = view.side, c = contentCenter(L.side, PAD.side); return c.x + (x - v.cx) * v.k; }
  function SY(z) { const v = view.side, c = contentCenter(L.side, PAD.side); return c.y - (z - v.cy) * v.k; }
  function sideInv(px, py) { const v = view.side, c = contentCenter(L.side, PAD.side); return { x: v.cx + (px - c.x) / v.k, z: v.cy - (py - c.y) / v.k }; }
  function HX(x) { const v = view.shape, c = contentCenter(L.shape, PAD.shape); return c.x + (x - v.cx) * v.k; }
  function HY(y) { const v = view.shape, c = contentCenter(L.shape, PAD.shape); return c.y - (y - v.cy) * v.k; }
  function shapeInv(px, py) { const v = view.shape, c = contentCenter(L.shape, PAD.shape); return { x: v.cx + (px - c.x) / v.k, y: v.cy - (py - c.y) / v.k }; }

  // ---------- 繪圖小工具 ----------
  function snapPx(v) { return (Math.round(v * dpr) + 0.5) / dpr; }
  function panelClip(R) { D.roundRect(ctx, R.x, R.y, R.w, R.h, RAD); ctx.clip(); }
  /**
   * 帶下標的文字：'PF_1 + PF_2' 的 _1 畫成較小、較低的 1（畫布不可用 Unicode 的下標數字字元）。
   * 傳回寬度；draw = false 時只量寬度。
   */
  function rich(c, text, x, y, color, px, weight, draw, align) {
    const parts = String(text).split(/_(\w)/);
    const k = window.LabSettings ? 1 + ((+window.LabSettings.get('fs') || 1) - 1) * 0.7 : 1;
    const fMain = fnt(px, weight), fSub = fnt(Math.round(px * 0.72 * 10) / 10, weight);
    let w = 0;
    parts.forEach(function (p, i) { c.font = i % 2 ? fSub : fMain; w += c.measureText(p).width + (i % 2 ? 1 : 0); });
    if (draw === false) return w;
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    parts.forEach(function (p, i) {
      if (!p) return;
      const sub = i % 2 === 1;
      c.font = sub ? fSub : fMain;
      const yy = sub ? y + px * 0.3 * k : y;
      c.lineWidth = 4;
      c.strokeStyle = alpha(C['canvas-bg'], 0.9);
      c.strokeText(p, cx + (sub ? 0.5 : 0), yy);
      c.fillStyle = color;
      c.fillText(p, cx + (sub ? 0.5 : 0), yy);
      cx += c.measureText(p).width + (sub ? 1 : 0);
    });
    return w;
  }
  /** 圓角底框＋帶下標的文字；(x, y) 為框的中心（align = center）或左／右邊中點 */
  function richPill(c, text, x, y, color, px, weight, align) {
    const w = rich(c, text, 0, 0, color, px, weight, false);
    const h = px * 1.45 + 4, pw = w + 14;
    const bx = align === 'left' ? x : align === 'right' ? x - pw : x - pw / 2;
    D.roundRect(c, bx, y - h / 2, pw, h, h / 2);
    c.fillStyle = alpha(C['canvas-bg'], C.dark ? 0.88 : 0.92);
    c.fill();
    c.strokeStyle = alpha(color, C.dark ? 0.5 : 0.4);
    c.lineWidth = 1;
    c.stroke();
    rich(c, text, bx + 7, y + 0.5, color, px, weight);
    return { x: bx, y: y - h / 2, w: pw, h: h };
  }
  function title(R, text) {
    ctx.save();
    richPill(ctx, text, R.x + 10, R.y + 17, C.text, 12.5, 600, 'left');
    ctx.restore();
  }
  /** 格線間距：至少 22 px 一格 */
  function gridStep(k) {
    const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10];
    for (let i = 0; i < steps.length; i++) if (steps[i] * k >= 22) return steps[i];
    return 10;
  }
  function gridLegend(R, step, bottomPad) {
    const t = T('格線間距 ', 'Grid ') + (step < 1 ? String(step) : step.toFixed(0)) + T(' 單位長', step === 1 ? ' unit' : ' units');
    ctx.save();
    D.pill(ctx, t, R.x + 10, R.y + R.h - (bottomPad || 8), C.muted, 'left', fnt(11, 500));
    ctx.restore();
  }
  function dot(x, y, r, color) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }
  function line(x0, y0, x1, y1, color, w, dash) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = w || 1; ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.restore();
  }
  /** 直線 P0 + s·dir 與矩形（世界座標）的交段：傳回 [s0, s1] 或 null */
  function clipLine(px, py, dx, dy, x0, x1, y0, y1) {
    let lo = -Infinity, hi = Infinity;
    const slab = function (p, dd, a, b) {
      if (Math.abs(dd) < 1e-12) return p >= a && p <= b;
      let t0 = (a - p) / dd, t1 = (b - p) / dd;
      if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
      lo = Math.max(lo, t0); hi = Math.min(hi, t1);
      return true;
    };
    if (!slab(px, dx, x0, x1) || !slab(py, dy, y0, y1) || lo > hi) return null;
    return [lo, hi];
  }
  /** 側視圖目前可見的世界範圍 */
  function sideWorld(R, inset) {
    inset = inset || 0;
    const a = sideInv(R.x + inset, R.y + inset), b = sideInv(R.x + R.w - inset, R.y + R.h - inset);
    return { x0: a.x, x1: b.x, z0: b.z, z1: a.z };
  }

  // =====================================================================
  // 左：過軸的側視剖面
  // =====================================================================
  function knobPos() {
    // 切平面上的圓形把手：切口往 +u 方向、在畫面內（內縮 26 px）的那一端
    const sec = state.sec, R = L.side, W = sideWorld(R, 26);
    const fx = sec.foot[0], fz = sec.foot[2], ux = sec.u[0], uz = sec.u[2];
    const cl = clipLine(fx, fz, ux, uz, W.x0, W.x1, W.z0, W.z1);
    if (!cl) return null;
    const s = cl[1];
    return { x: SX(fx + s * ux), y: SY(fz + s * uz), s: s };
  }
  function drawSide() {
    const R = L.side, sec = state.sec;
    const al = sec.alpha, sa = Math.sin(al), ca = Math.cos(al);
    ctx.save();
    panelClip(R);
    ctx.save(); ctx.translate(R.x, R.y); D.backdrop(ctx, R.w, R.h); ctx.restore();
    const k = view.side.k, step = gridStep(k);
    D.grid(ctx, R.x, R.y, R.x + R.w, R.y + R.h, step * k, step * k >= 60 ? step * k / 5 : 0, SX(0), SY(0));

    const vx = SX(0), vy = SY(0);
    const far = Math.hypot(R.w, R.h) * 2; // 母線畫到畫面外
    // ---- 圓錐（角度漸層：左上受光、右側較暗；上下兩個錐） ----
    [[-Math.PI / 2, 1], [Math.PI / 2, -1]].forEach(function (o) {
      const mid = o[0], sgn = o[1];
      const ax = Math.cos(mid - al), ay = Math.sin(mid - al), bx = Math.cos(mid + al), by = Math.sin(mid + al);
      ctx.beginPath();
      ctx.moveTo(vx, vy);
      ctx.lineTo(vx + ax * far, vy + ay * far);
      ctx.lineTo(vx + bx * far, vy + by * far);
      ctx.closePath();
      if (ctx.createConicGradient) {
        const g = ctx.createConicGradient(mid - al, vx, vy);
        const span = 2 * al / (2 * Math.PI);
        const base = C['cs-cone'];
        // 上錐：從右側母線往左掃；下錐反過來，受光面都在左邊
        const lit = sgn > 0 ? [0.30, 0.15, 0.24, 0.10] : [0.10, 0.24, 0.15, 0.30];
        g.addColorStop(0, alpha(shade(base, -0.25), lit[0] * (C.dark ? 1.25 : 1)));
        g.addColorStop(span * 0.4, alpha(base, lit[1] * (C.dark ? 1.3 : 1)));
        g.addColorStop(span * 0.72, alpha(shade(base, 0.55), lit[2] * (C.dark ? 1.2 : 1)));
        g.addColorStop(span, alpha(shade(base, 0.3), lit[3] * (C.dark ? 1.3 : 1)));
        g.addColorStop(Math.min(1, span + 1e-4), 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
      } else ctx.fillStyle = alpha(C['cs-cone'], 0.15);
      ctx.fill();
    });
    // 軸（虛線）
    line(snapPx(vx), R.y, snapPx(vx), R.y + R.h, alpha(C.muted, 0.75), 1, [6, 5]);

    // ---- 丹德林球、相切圓（側看是線段）、相切圓所在的水平面延伸到切平面 → 準線 ----
    const fx = sec.foot[0], fz = sec.foot[2], ux = sec.u[0], uz = sec.u[2];
    if (state.show.spheres) {
      sec.spheres.forEach(function (S) {
        const cx = SX(0), cy = SY(S.zc), r = S.r * k;
        if (r < 0.5 || r > 4000) return;
        const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
        const sc = C['cs-sphere'];
        g.addColorStop(0, alpha(shade(sc, 0.75), C.dark ? 0.45 : 0.6));
        g.addColorStop(0.45, alpha(sc, C.dark ? 0.2 : 0.16));
        g.addColorStop(0.92, alpha(shade(sc, -0.15), C.dark ? 0.3 : 0.26));
        g.addColorStop(1, alpha(shade(sc, -0.3), C.dark ? 0.45 : 0.4));
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = alpha(sc, 0.85); ctx.lineWidth = 1.4; ctx.stroke();
        // 相切圓：側看是一條水平線段（兩端正好在母線上）
        const ry = SY(S.ringZ), rx = S.ringR * k;
        line(cx - rx, ry, cx + rx, ry, alpha(sc, 0.95), 2);
        dot(cx - rx, ry, 2.6, sc); dot(cx + rx, ry, 2.6, sc);
      });
    }
    // 準線：相切圓所在的水平面（虛線）與切平面的交點；準線垂直紙面，畫成 ⊙
    if (state.show.dir && !sec.degenerate) {
      sec.spheres.forEach(function (S, i) {
        if (S.sD == null) return;
        const px = fx + S.sD * ux, pz = fz + S.sD * uz;
        const X = SX(px), Y = SY(pz);
        const ry = SY(S.ringZ);
        line(SX(S.ringR * (px >= 0 ? 1 : -1)), ry, X, Y, alpha(C['cs-dir'], 0.7), 1.3, [5, 4]);
        ctx.beginPath(); ctx.arc(X, Y, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = alpha(C['canvas-bg'], 0.95); ctx.fill();
        ctx.strokeStyle = C['cs-dir']; ctx.lineWidth = 1.6; ctx.stroke();
        dot(X, Y, 1.9, C['cs-dir']);
        // 標籤放在 ⊙ 離軸較遠的那一側（不和焦點、球擠在一起）
        const dl = T('準線 ', 'directrix ') + (i + 1), dw = rich(ctx, dl, 0, 0, C['cs-dir'], 11.5, 600, false);
        let out = px >= 0 ? 1 : -1;
        if (out > 0 && X + 10 + dw > R.x + R.w - 4) out = -1;      // 右邊放不下就放左邊
        else if (out < 0 && X - 10 - dw < R.x + 4) out = 1;
        rich(ctx, dl, X + out * 10, Y, C['cs-dir'], 11.5, 600, true, out > 0 ? 'left' : 'right');
      });
    }

    // ---- 母線（管狀線）----
    [[sa, ca], [-sa, ca], [sa, -ca], [-sa, -ca]].forEach(function (g) {
      D.tube(ctx, function (c) { c.moveTo(vx, vy); c.lineTo(vx + g[0] * far, vy - g[1] * far); }, C['cs-cone'], 3.2);
    });

    // ---- 切平面（側看是一條直線）----
    const W = sideWorld(R, -4);
    const cl = clipLine(fx, fz, ux, uz, W.x0, W.x1, W.z0, W.z1);
    const P0 = function (s) { return [SX(fx + s * ux), SY(fz + s * uz)]; };
    if (cl) {
      const a = P0(cl[0]), b = P0(cl[1]);
      const hot = state.hover === 'line' || (state.drag && state.drag.kind === 'line');
      if (hot) line(a[0], a[1], b[0], b[1], alpha(C['cs-plane'], 0.28), 11);
      D.tube(ctx, function (c) { c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }, C['cs-plane'], 4.4);
    }
    // 切平面在錐內的部分＝曲線的主軸上（橢圓：2a 的弦）
    if (!sec.degenerate && (sec.family === 'ellipse' || sec.family === 'circle')) {
      const a = P0(sec.sC - sec.a), b = P0(sec.sC + sec.a);
      line(a[0], a[1], b[0], b[1], alpha(C['cs-curve'], 0.9), 2.2);
      // 標在弦上離軸較遠的四分之一處（中間常和 β 的角度記號擠在一起）
      const tq = Math.abs(a[0] + (b[0] - a[0]) * 0.25 - vx) >= Math.abs(a[0] + (b[0] - a[0]) * 0.75 - vx) ? 0.25 : 0.75;
      const mx = a[0] + (b[0] - a[0]) * tq, my = a[1] + (b[1] - a[1]) * tq;
      const nl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      let nx = -(b[1] - a[1]) / nl, ny = (b[0] - a[0]) / nl;
      if ((mx - vx) * nx + (my - vy) * ny < 0) { nx = -nx; ny = -ny; } // 放在弦遠離頂點的那一側
      if (nl > 60) rich(ctx, sec.family === 'circle' ? '2r' : '2a', mx + nx * 13, my + ny * 13, C['cs-curve'], 12, 700, true, 'center');
    }
    // 曲線與剖面的交點（曲線的頂點）
    if (!sec.degenerate) {
      (sec.family === 'parabola' ? [0] : [-sec.a, sec.a]).forEach(function (x) {
        const p = P0(x + sec.sC);
        D.ball(ctx, p[0], p[1], 3.8, C['cs-curve'], { shadow: false });
      });
    }

    // ---- 頂點到切平面的距離 d（垂線＋直角記號）與角度 α、β ----
    const ftX = SX(fx), ftY = SY(fz);
    if (sec.d > 1e-9) {
      line(vx, vy, ftX, ftY, alpha(C.text, 0.75), 1.3, [4, 4]);
      const mlen = 7, mxv = -sec.m[0], mzv = -sec.m[2]; // 從垂足指回頂點
      const q1x = ftX + ux * mlen, q1y = ftY - uz * mlen;
      const q2x = q1x + mxv * mlen, q2y = q1y - mzv * mlen;
      const q3x = ftX + mxv * mlen, q3y = ftY - mzv * mlen;
      ctx.save(); ctx.strokeStyle = alpha(C.text, 0.7); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(q1x, q1y); ctx.lineTo(q2x, q2y); ctx.lineTo(q3x, q3y); ctx.stroke(); ctx.restore();
      if (Math.hypot(ftX - vx, ftY - vy) > 26) {
        // 放在垂線離軸較遠的那一側
        const mx0 = (vx + ftX) / 2, my0 = (vy + ftY) / 2;
        const sg = Math.abs(mx0 + sec.u[0] * 10 - vx) >= Math.abs(mx0 - sec.u[0] * 10 - vx) ? 1 : -1;
        rich(ctx, 'd', mx0 + sg * sec.u[0] * 10, my0 - sg * sec.u[2] * 10, C.text, 13, 700, true, 'center');
      }
    }
    // α：畫在下錐（軸往下到右下母線；對頂角相等），上錐留給球與焦點
    const ra = 30;
    ctx.save(); ctx.strokeStyle = alpha(C.text, 0.7); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(vx, vy, ra, Math.PI / 2 - al, Math.PI / 2); ctx.stroke(); ctx.restore();
    rich(ctx, 'α', vx + Math.cos(Math.PI / 2 - al / 2) * (ra + 10), vy + Math.sin(Math.PI / 2 - al / 2) * (ra + 10), C.text, 13, 700, true, 'center');
    // β：切平面與軸的交點處（平面與軸平行時不畫）
    if (sec.axisHit != null && sec.betaDeg > 0.5 && sec.d > 1e-9) {
      const hx = SX(0), hy = SY(sec.axisHit);
      if (hy > R.y + 10 && hy < R.y + R.h - 10) {
        const rb = 26, a0 = -Math.PI / 2, a1 = Math.atan2(-uz, ux);
        ctx.save(); ctx.strokeStyle = alpha(C['cs-plane'], 0.95); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(hx, hy, rb, a0, a1); ctx.stroke(); ctx.restore();
        const am = (a0 + a1) / 2;
        rich(ctx, 'β', hx + Math.cos(am) * (rb + 10), hy + Math.sin(am) * (rb + 10), shade(C['cs-plane'], C.dark ? 0.1 : -0.25), 13, 700, true, 'center');
      }
    }

    // ---- 焦點（球與切平面的切點）----
    if (!sec.degenerate) {
      sec.spheres.forEach(function (S, i) {
        const X = SX(S.focus3[0]), Y = SY(S.focus3[2]);
        if (X < R.x - 20 || X > R.x + R.w + 20 || Y < R.y - 20 || Y > R.y + R.h + 20) return;
        const col = i ? C.neg : C.pos;
        D.ball(ctx, X, Y, 4.6, col, { glow: C.dark ? 0.35 : 0 });
        // 標籤放在切平面上不靠球的那一側
        const sg = sec.d - S.zc * Math.sin(sec.beta) >= 0 ? 1 : -1;
        const ox = sec.m[0] * sg, oy = -sec.m[2] * sg;
        if (sec.family !== 'circle' || i === 0) rich(ctx, sec.family === 'circle' ? 'F' : 'F_' + (i + 1), X + ox * 15, Y + oy * 15, col, 12.5, 700, true, 'center');
      });
    }

    // ---- P 的投影、過 P 的母線與切點 K ----
    const M = measureP();
    if (M) {
      const px = SX(M.P3[0]), py = SY(M.P3[2]);
      if (state.show.gen && Math.abs(M.P3[2]) > 1e-9) {
        const gx = M.P3[0], gz = M.P3[2], gl = Math.hypot(gx, gz);
        const ex = gx / gl * far / k * 1, ez = gz / gl * far / k;
        line(SX(-ex), SY(-ez), SX(ex), SY(ez), alpha(C.text, 0.55), 1.2, [3, 4]);
        M.K.forEach(function (K, i) {
          if (!K) return;
          const kx = SX(K[0]), ky = SY(K[2]), kc = i ? C.neg : C.pos, out = kx >= vx ? 1 : -1;
          ctx.save(); ctx.beginPath(); ctx.arc(kx, ky, 3.4, 0, Math.PI * 2); ctx.fillStyle = C['canvas-bg']; ctx.fill();
          ctx.strokeStyle = kc; ctx.lineWidth = 1.8; ctx.stroke(); ctx.restore();
          rich(ctx, 'K_' + (i + 1), kx + out * 8, ky - 7, kc, 11.5, 700, true, out > 0 ? 'left' : 'right');
        });
      }
      ctx.save();
      ctx.beginPath(); ctx.arc(px, py, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = alpha(C['canvas-bg'], 0.95); ctx.fill();
      ctx.strokeStyle = C.probe; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }

    // ---- 頂點 V ----
    D.ball(ctx, vx, vy, 4, C.text, { shadow: false });
    rich(ctx, 'V', vx - 9, vy + 1, C.text, 13, 700, true, 'right');

    // ---- 旋轉把手 ----
    const kn = knobPos();
    if (kn) {
      const hot = state.hover === 'knob' || (state.drag && state.drag.kind === 'knob');
      if (hot) { ctx.beginPath(); ctx.arc(kn.x, kn.y, 15, 0, Math.PI * 2); ctx.fillStyle = alpha(C['cs-plane'], 0.22); ctx.fill(); }
      D.ball(ctx, kn.x, kn.y, hot ? 9 : 8, C['cs-plane'], { glow: C.dark ? 0.3 : 0 });
      // 旋轉符號（兩段弧形箭頭）
      ctx.save(); ctx.strokeStyle = alpha(C['canvas-bg'], 0.95); ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(kn.x, kn.y, 4.2, -0.4, 1.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(kn.x, kn.y, 4.2, 2.75, 5.0); ctx.stroke();
      ctx.restore();
      // 切平面的名稱放在把手旁（往畫面內側）
      const inX = kn.x > R.x + R.w / 2 ? -1 : 1;
      D.pill(ctx, T('切平面', 'plane'), kn.x + inX * 14, kn.y + (kn.y < R.y + 40 ? 26 : -12), shade(C['cs-plane'], C.dark ? 0.1 : -0.3), inX > 0 ? 'left' : 'right', fnt(11.5, 600));
    }
    // 拖曳把手時：切平面始終與以 V 為圓心、半徑 d 的圓相切
    if (state.drag && state.drag.kind === 'knob' && sec.d > 1e-9) {
      ctx.save(); ctx.strokeStyle = alpha(C.text, 0.35); ctx.setLineDash([3, 5]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(vx, vy, sec.d * k, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    ctx.restore(); // panelClip

    title(R, T('側視：過軸的剖面', 'Side view: section through the axis'));
    gridLegend(R, step);
    // 外框
    ctx.save(); D.roundRect(ctx, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, RAD); ctx.strokeStyle = alpha(C.border, 0.9); ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
  }

  // =====================================================================
  // 右：切口的實際形狀（正對切平面）
  // =====================================================================
  function strokeCurve(path, color, width) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); path(ctx);
    ctx.strokeStyle = alpha(color, C.dark ? 0.22 : 0.14); ctx.lineWidth = width * 3.2; ctx.stroke();
    ctx.restore();
    D.tube(ctx, function (c) { path(c); }, color, width);
  }
  function drawShape() {
    const R = L.shape, sec = state.sec;
    ctx.save();
    panelClip(R);
    ctx.save(); ctx.translate(R.x, R.y); D.backdrop(ctx, R.w, R.h); ctx.restore();
    const k = view.shape.k, step = gridStep(k);
    D.grid(ctx, R.x, R.y, R.x + R.w, R.y + R.h, step * k, step * k >= 60 ? step * k / 5 : 0, HX(0), HY(0));
    const ox = HX(0), oy = HY(0);
    // 座標軸 x′、y′
    ctx.save();
    ctx.strokeStyle = alpha(C.text, 0.45); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(R.x, snapPx(oy)); ctx.lineTo(R.x + R.w, snapPx(oy)); ctx.moveTo(snapPx(ox), R.y); ctx.lineTo(snapPx(ox), R.y + R.h); ctx.stroke();
    ctx.restore();
    if (ox > R.x && ox < R.x + R.w - 10) D.haloText(ctx, 'y′', ox + 6, R.y + PAD.shape.t + 2, C.muted, 'left', 'top', fnt(12, 600, true));
    if (oy > R.y + 20 && oy < R.y + R.h - 10) D.haloText(ctx, 'x′', R.x + R.w - 8, oy - 6, C.muted, 'right', 'bottom', fnt(12, 600, true));

    const Wd = (Math.hypot(R.w, R.h) / k) + Math.hypot(view.shape.cx, view.shape.cy) + 1;
    // 漸近線
    if (sec.type === 'hyperbola' && state.show.asym) {
      [1, -1].forEach(function (sg) {
        line(HX(-Wd), HY(-sg * sec.slope * Wd), HX(Wd), HY(sg * sec.slope * Wd), alpha(C.muted, 0.8), 1.2, [7, 5]);
      });
      const ax = Math.min(sec.c * 1.25, (R.w / 2 - 30) / k + view.shape.cx);
      D.haloText(ctx, T('漸近線', 'asymptote'), HX(ax), HY(sec.slope * ax) - 8, C.muted, 'right', 'bottom', fnt(11, 500));
    }
    // 準線
    if (state.show.dir && !sec.degenerate) {
      sec.spheres.forEach(function (S, i) {
        if (S.dx == null) return;
        const X = HX(S.dx);
        if (X < R.x - 2 || X > R.x + R.w + 2) {
          // 在畫面外：邊上標示方向
          const right = X > R.x + R.w;
          D.pill(ctx, (right ? '' : '← ') + T('準線 ', 'directrix ') + (i + 1) + (right ? ' →' : ''), right ? R.x + R.w - 8 : R.x + 8, R.y + PAD.shape.t + 26 + i * 22, C['cs-dir'], right ? 'right' : 'left', fnt(11, 600));
          return;
        }
        line(snapPx(X), R.y, snapPx(X), R.y + R.h, alpha(C['cs-dir'], 0.85), 1.5, [7, 5]);
        D.pill(ctx, T('準線 ', 'directrix ') + (i + 1), X + (S.dx >= 0 ? -5 : 5), R.y + PAD.shape.t + 26 + i * 22, C['cs-dir'], S.dx >= 0 ? 'right' : 'left', fnt(11, 600));
      });
    }
    // 正焦弦
    if (state.show.latus && !sec.degenerate && sec.family !== 'circle') {
      const fxp = sec.foci[0].x, hl = sec.latus / 2;
      line(HX(fxp), HY(hl), HX(fxp), HY(-hl), alpha(C['cs-curve'], 0.8), 1.6, [2, 4]);
      [hl, -hl].forEach(function (y) { dot(HX(fxp), HY(y), 3, C['cs-curve']); });
      D.haloText(ctx, T('正焦弦', 'latus rectum'), HX(fxp) + 6, HY(-hl * 0.55), C['cs-curve'], 'left', 'middle', fnt(11, 600));
    }

    // 曲線
    if (sec.type === 'point') {
      D.ball(ctx, ox, oy, 6, C['cs-curve'], { glow: 0.4 });
    } else {
      const lines = CC.polylines(sec, Wd, null, 720);
      lines.forEach(function (pl) {
        strokeCurve(function (c) { pl.forEach(function (p, i) { const X = HX(p[0]), Y = HY(p[1]); if (i) c.lineTo(X, Y); else c.moveTo(X, Y); }); if (sec.type === 'ellipse' || sec.type === 'circle') c.closePath(); }, C['cs-curve'], 3.6);
      });
    }
    // 中心（或拋物線的頂點）
    if (!sec.degenerate) {
      ctx.save(); ctx.strokeStyle = alpha(C.text, 0.7); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(ox - 4, oy - 4); ctx.lineTo(ox + 4, oy + 4); ctx.moveTo(ox - 4, oy + 4); ctx.lineTo(ox + 4, oy - 4); ctx.stroke(); ctx.restore();
      D.haloText(ctx, 'O', ox - 6, oy + 6, C.muted, 'right', 'top', fnt(11.5, 600, true));
    }
    // 記下的點
    state.log.forEach(function (row, i) {
      const X = HX(row.x), Y = HY(row.y);
      ctx.save(); ctx.beginPath(); ctx.arc(X, Y, 3.2, 0, Math.PI * 2); ctx.fillStyle = alpha(C.probe, 0.85); ctx.fill(); ctx.restore();
      D.haloText(ctx, String(i + 1), X + 5, Y - 5, C.probe, 'left', 'bottom', fnt(10.5, 700));
    });

    // P 與距離
    const M = measureP();
    if (M) {
      const px = HX(M.x), py = HY(M.y);
      const segLabel = function (x0, y0, x1, y1, text, color, side) {
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, L2 = Math.hypot(x1 - x0, y1 - y0);
        if (L2 < 34) return;
        const nx = -(y1 - y0) / L2 * side, ny = (x1 - x0) / L2 * side;
        D.pill(ctx, text, mx + nx * 12, my + ny * 12 + 7, color, 'center', fnt(11, 700));
      };
      // 到準線 1 的垂線段
      const S1 = sec.spheres[0];
      if (state.show.dir && S1 && S1.dx != null) {
        const dX = HX(S1.dx);
        line(px, py, dX, py, alpha(C['cs-dir'], 0.95), 1.8, [5, 4]);
        const sg = dX > px ? -1 : 1;
        ctx.save(); ctx.strokeStyle = alpha(C['cs-dir'], 0.9); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(dX + sg * 6, py); ctx.lineTo(dX + sg * 6, py - 6); ctx.lineTo(dX, py - 6); ctx.stroke(); ctx.restore();
        segLabel(px, py, dX, py, len(M.PD[0]), C['cs-dir'], py > HY(0) ? -1 : 1);
      }
      sec.spheres.forEach(function (S, i) {
        if (sec.family === 'circle' && i > 0) return;
        const fx = HX(S.fx), fy = HY(0), col = i ? C.neg : C.pos;
        line(px, py, fx, fy, alpha(col, 0.95), 2.2);
        segLabel(px, py, fx, fy, len(M.PF[i]), col, i ? 1 : -1);
      });
      // 焦點
      sec.spheres.forEach(function (S, i) {
        const col = i ? C.neg : C.pos, X = HX(S.fx), Y = HY(0);
        D.ball(ctx, X, Y, 5.2, col, { glow: C.dark ? 0.4 : 0.15 });
        if (sec.family === 'circle') { if (!i) rich(ctx, 'F_1 = F_2', X + 8, Y + 12, col, 12, 700); }
        else rich(ctx, 'F_' + (i + 1), X, Y + 15, col, 12.5, 700, true, 'center');
      });
      // P
      const hot = state.hover === 'P' || (state.drag && state.drag.kind === 'P');
      if (hot) { ctx.beginPath(); ctx.arc(px, py, 16, 0, Math.PI * 2); ctx.fillStyle = alpha(C.probe, 0.2); ctx.fill(); }
      D.ball(ctx, px, py, hot ? 9 : 8, C.probe, { glow: C.dark ? 0.4 : 0.1 });
      rich(ctx, 'P', px + 11, py - 11, C.probe, 13.5, 800);
    }
    ctx.restore(); // panelClip

    title(R, T('正對切平面：切口的形狀', 'Face-on: the shape of the cut'));
    // 下方：保持不變的量
    drawInvariants(R, M);
    gridLegend(R, step, 8);
    ctx.save(); D.roundRect(ctx, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, RAD); ctx.strokeStyle = alpha(C.border, 0.9); ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
  }
  /** 形狀圖下方的「不變量」：和、差、比 */
  function drawInvariants(R, M) {
    const sec = state.sec, y = R.y + R.h - 42, cx = R.x + R.w / 2;
    const px = L.narrow ? 12 : 12.5;
    let text = null, color = C.text;
    if (sec.degenerate) {
      text = T('平面通過頂點：', 'Plane through the vertex: ') + typeName(sec.type);
      color = C.muted;
    } else if (M) {
      if (sec.family === 'ellipse') text = 'PF_1 + PF_2 = ' + len(M.sum) + T(' = 2a　　PF_1／PD_1 = ', ' = 2a    PF_1 / PD_1 = ') + num(M.ratio[0], 3) + ' = e';
      else if (sec.family === 'hyperbola') text = '|PF_1 − PF_2| = ' + len(M.diff) + T(' = 2a　　PF_1／PD_1 = ', ' = 2a    PF_1 / PD_1 = ') + num(M.ratio[0], 3) + ' = e';
      else if (sec.family === 'parabola') text = 'PF = ' + len(M.PF[0]) + '　PD = ' + len(M.PD[0]) + T('　　PF／PD = 1 = e', '    PF / PD = 1 = e');
      else text = 'PF = ' + len(M.PF[0]) + T(' = 半徑 r　　e = 0（準線在無窮遠處）', ' = radius r    e = 0 (directrix at infinity)');
      color = C.text;
    }
    if (!text) return;
    ctx.save();
    // 太長就縮小字（手機）
    let size = px;
    while (size > 9.5 && rich(ctx, text, 0, 0, color, size, 600, false) + 20 > R.w - 16) size -= 0.5;
    richPill(ctx, text, cx, y, color, size, 600, 'center');
    ctx.restore();
  }

  // ---------- 主繪圖 ----------
  let raf = 0;
  function draw() {
    if (!L || !state.sec) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    drawSide();
    drawShape();
    if (kb && kb.focused()) {
      const R = kb.index() === 0 ? L.shape : L.side;
      ctx.save(); ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      D.roundRect(ctx, R.x + 2, R.y + 2, R.w - 4, R.h - 4, RAD); ctx.stroke(); ctx.restore();
    }
  }
  function frame(now) {
    raf = 0;
    if (stage.classList.contains('is3d')) return;
    const moving = easeViews(now || performance.now());
    draw();
    if (moving) requestDraw(); else lastT = 0;
  }
  function requestDraw() {
    if (raf) return;
    raf = requestAnimationFrame(frame);
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  function showRow(id, on) { const dd = $(id), dt = dd.previousElementSibling; dd.hidden = !on; if (dt) dt.hidden = !on; }
  let eqKey = '';
  function updateReadouts() {
    const s = state.sec, f = s.family;
    setHTML('rType', '<span class="type-badge' + (s.degenerate ? ' deg' : '') + '">' + typeName(s.type) + '</span>');
    setHTML('rE', f === 'circle' ? '0' : f === 'parabola' ? '1' : num(s.e, 3) + (s.e < 1 ? ' &lt; 1' : ' &gt; 1'));
    const deg = s.degenerate;
    // a、b、c 的名稱隨類型改變
    setHTML('rAL', f === 'circle' ? T('半徑 r', 'Radius r') : f === 'parabola' ? T('焦距 p（頂點到焦點）', 'Focal length p (vertex to focus)') : f === 'hyperbola' ? T('半貫軸 a', 'Semi-transverse axis a') : T('半長軸 a', 'Semi-major axis a'));
    setHTML('rBL', f === 'hyperbola' ? T('半共軛軸 b', 'Semi-conjugate axis b') : T('半短軸 b', 'Semi-minor axis b'));
    setHTML('rA', deg ? '0' : len(f === 'parabola' ? s.p : s.a));
    showRow('rB', f === 'ellipse' || f === 'hyperbola');
    setHTML('rB', deg ? '0' : len(s.b));
    showRow('rC', f === 'ellipse' || f === 'hyperbola');
    setHTML('rC', deg ? '0' : len(s.c));
    setHTML('rLatus', deg || f === 'circle' ? '—' : len(s.latus) + (f === 'parabola' ? ' = 4p' : ' = 2b<sup>2</sup>/a'));
    showRow('rX', s.type === 'hyperbola' || s.type === 'lines');
    if (s.type === 'hyperbola' || s.type === 'lines') {
      setHTML('rXL', s.type === 'lines' ? T('兩條直線', 'The two lines') : T('漸近線', 'Asymptotes'));
      setHTML('rX', 'y′ = ±' + num(s.slope, 3) + ' x′<br><small>' + T('夾角 ', 'angle ') + num(2 * s.phi, 1) + '°</small>');
    }
    setHTML('rR', deg ? '—' : s.spheres.map(function (S, i) { return 'r<sub>' + (i + 1) + '</sub> = ' + len(S.r); }).join('、'.length && T('、', ', ')) + (f === 'parabola' ? T('（只有一顆）', ' (only one)') : ''));
    setHTML('rH', s.axisHit == null ? T('平行於軸', 'parallel to the axis') : len(s.axisHit));
    // 標準式（KaTeX）
    let tex, note = true;
    const sq = function (v) { return '{' + len(v) + '}^{2}'; };
    switch (s.type) {
      case 'circle': tex = "x'^{2} + y'^{2} = " + sq(s.a); break;
      case 'ellipse': tex = "\\dfrac{x'^{2}}{" + sq(s.a) + "} + \\dfrac{y'^{2}}{" + sq(s.b) + '} = 1'; break;
      case 'hyperbola': tex = "\\dfrac{x'^{2}}{" + sq(s.a) + "} - \\dfrac{y'^{2}}{" + sq(s.b) + '} = 1'; break;
      case 'parabola': tex = "y'^{2} = 4 \\times " + len(s.p) + "\\, x' = " + len(4 * s.p) + "\\, x'"; break;
      case 'lines': tex = "y' = \\pm " + num(s.slope, 3) + "\\, x'"; note = false; break;
      case 'line': tex = "y'^{2} = 0"; note = false; break;
      default: tex = "x'^{2} + y'^{2} = 0"; note = false;
    }
    const key = tex + '|' + (window.LabSettings ? window.LabSettings.lang : '');
    if (key !== eqKey) {
      eqKey = key;
      const el = $('rEq');
      if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
      else el.textContent = tex;
    }
    $('eqNote').textContent = note ? T('標準式：原點在中心（拋物線取頂點），x′ 軸沿主軸。', 'Standard form: origin at the centre (the vertex for a parabola), x′ along the main axis.')
      : T('平面通過頂點，原點就是頂點 V。', 'The plane passes through the vertex; the origin is the vertex V.');
    updatePReadouts();
  }
  function updatePReadouts() {
    const s = state.sec, f = s.family, M = measureP();
    const none = !M;
    setHTML('pXY', none ? '—' : '(' + len(M.x) + ', ' + len(M.y) + ')');
    setHTML('pF1', none ? '—' : len(M.PF[0]));
    showRow('pF2', f !== 'parabola');
    setHTML('pF2', none || M.PF.length < 2 ? '—' : len(M.PF[1]));
    showRow('pS', f === 'ellipse' || f === 'hyperbola' || f === 'circle');
    const sumL = f === 'hyperbola' ? '|PF<sub>1</sub> − PF<sub>2</sub>|' : 'PF<sub>1</sub> + PF<sub>2</sub>';
    setHTML('pSL', sumL + T('（= 2a）', ' (= 2a)'));
    setHTML('pS', none ? '—' : len(f === 'hyperbola' ? M.diff : M.sum));
    setHTML('pD1', none ? '—' : f === 'circle' ? '∞' : len(M.PD[0]));
    setHTML('pR', none ? '—' : f === 'circle' ? '0' : num(M.ratio[0], 3));
  }

  // ---------- 記下的點 ----------
  function renderLog() {
    const s = state.sec, f = s.family, tb = $('log');
    $('logEmpty').hidden = state.log.length > 0;
    if (!state.log.length) { tb.innerHTML = ''; return; }
    let head;
    if (f === 'parabola') head = ['#', 'PF', 'PD', 'PF／PD'];
    else if (f === 'circle') head = ['#', 'PF<sub>1</sub>', 'PF<sub>2</sub>', T('和', 'sum')];
    else head = ['#', 'PF<sub>1</sub>', 'PF<sub>2</sub>', f === 'hyperbola' ? T('差', 'diff.') : T('和', 'sum'), 'PD<sub>1</sub>', 'PF<sub>1</sub>／PD<sub>1</sub>'];
    let h = '<thead><tr>' + head.map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>';
    state.log.forEach(function (r, i) {
      let cells;
      if (f === 'parabola') cells = [i + 1, len(r.PF[0]), len(r.PD[0]), num(r.ratio[0], 3)];
      else if (f === 'circle') cells = [i + 1, len(r.PF[0]), len(r.PF[1]), len(r.sum)];
      else cells = [i + 1, len(r.PF[0]), len(r.PF[1]), len(f === 'hyperbola' ? r.diff : r.sum), len(r.PD[0]), num(r.ratio[0], 3)];
      h += '<tr>' + cells.map(function (x) { return '<td>' + x + '</td>'; }).join('') + '</tr>';
    });
    tb.innerHTML = h.replace(/／/g, T('／', '/')) + '</tbody>';
  }
  function markP() {
    const M = measureP();
    if (!M) { setStatus(T('切口退化了，沒有可以記錄的點。', 'The cut is degenerate: there is no point to record.')); return; }
    if (state.log.length >= 12) state.log.shift();
    state.log.push(M);
    renderLog();
    requestDraw();
    setStatus(T('已記下第 ', 'Recorded point ') + state.log.length + T(' 點。', '.'));
    emit('mark', Object.assign(baseData(), {
      n: state.log.length,
      rows: state.log.map(function (r) { return { x: r.x, y: r.y, PF1: r.PF[0], PF2: r.PF[1], sum: r.sum, diff: r.diff, ratio: r.ratio[0] }; })
    }));
  }
  function clearLog(quiet) {
    const had = state.log.length > 0;
    state.log = [];
    renderLog();
    requestDraw();
    if (!quiet) setStatus(T('已清除記下的點。', 'Recorded points cleared.'));
    return had;
  }

  // ---------- 狀態列與報讀 ----------
  function setStatus(t) { $('status').textContent = t || ''; }
  let sayTimer = 0;
  function say(msg) {
    const el = $('srSay');
    if (!el || !msg) return;
    clearTimeout(sayTimer);
    el.textContent = '';
    sayTimer = setTimeout(function () { el.textContent = msg; }, 60);
  }

  // ---------- 音效：切口的類型改變時一聲輕響（類型越「開」音越高） ----------
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  let lastChime = 0;
  function typeChime(type) {
    const S = sound(); if (!S) return;
    const t = performance.now();
    if (t - lastChime < 120) return;
    lastChime = t;
    const f = { circle: 523.25, ellipse: 659.25, parabola: 783.99, hyperbola: 987.77 }[type];
    if (f) {
      S.tone({ freq: f, dur: 0.2, type: 'sine', gain: 0.3 });
      S.tone({ freq: f * 2, dur: 0.09, type: 'sine', gain: 0.08, delay: 0.005 });
    } else {
      S.tone({ freq: 392, dur: 0.14, type: 'triangle', gain: 0.32 });
      S.tone({ freq: 294, dur: 0.18, type: 'sine', gain: 0.2, delay: 0.06 });
    }
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
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
  });

  // ---------- 任務模式（missions.js）：回報數學量 ----------
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function baseData() {
    const s = state.sec;
    return {
      alpha: s.alphaDeg, beta: s.betaDeg, d: s.d, type: s.type, family: s.family,
      e: s.e, a: s.a, b: s.b, c: s.c, p: s.p, latus: s.latus, slope: s.slope, phi: s.phi,
      r1: s.spheres[0] ? s.spheres[0].r : NaN, r2: s.spheres[1] ? s.spheres[1].r : NaN, h: s.axisHit
    };
  }
  /** 切法改變後（放開滑桿、打完數字、按快速切法、在畫布上拖完或按鍵）回報一次 */
  function emitParams(src) {
    const data = Object.assign(baseData(), { src: src, prevType: state.committedType });
    state.committedType = state.sec.type;
    emit('params', data);
  }
  function emitProbe(src) {
    const M = measureP();
    if (!M) return;
    emit('probe', Object.assign(baseData(), {
      src: src, x: M.x, y: M.y, PF1: M.PF[0], PF2: M.PF.length > 1 ? M.PF[1] : NaN, PD1: M.PD[0], PD2: M.PD.length > 1 ? M.PD[1] : NaN,
      sum: M.sum, diff: M.diff, ratio1: M.ratio[0], ratio2: M.ratio.length > 1 ? M.ratio[1] : NaN
    }));
  }

  // =====================================================================
  // 切法改變
  // =====================================================================
  const elA = $('alpha'), elB = $('beta'), elD = $('dist');
  let quiet = false; // 程式改滑桿（快速切法、畫布拖曳、按鍵）時，滑桿的 change 不算一次任務回報
  function refreshOutputs() {
    $('alphao').textContent = fmtSlider(val(elA), elA) + '°';
    $('betao').textContent = fmtSlider(val(elB), elB) + '°';
    $('disto').textContent = fmtSlider(val(elD), elD);
  }
  function compute() {
    const prev = state.sec;
    state.alpha = val(elA); state.beta = val(elB); state.d = val(elD);
    state.sec = CC.section(state.alpha, state.beta, state.d);
    const s = state.sec;
    if (prev && prev.family !== s.family) state.P = defaultP(s.family);
    if (prev && (prev.alphaDeg !== s.alphaDeg || prev.betaDeg !== s.betaDeg || prev.d !== s.d) && state.log.length) {
      clearLog(true);
      setStatus(T('切法改變了，記下的點已清除。', 'The cut changed, so the recorded points were cleared.'));
    }
    if (prev && prev.type !== s.type) {
      typeChime(s.type);
      say(T('切口變成', 'The cut is now ') + typeName(s.type) + (s.degenerate ? '' : T('，離心率 ', ', eccentricity ') + num(s.e, 3)));
    }
    return prev;
  }
  function paramsChanged() {
    refreshOutputs();
    compute();
    retarget(false);
    ensurePVisible();
    updateReadouts();
    renderLog();
    if (view3) view3.rebuild();
    requestDraw();
  }
  [elA, elB, elD].forEach(function (el) {
    el.addEventListener('input', function () { if (!quiet) setStatus(''); paramsChanged(); });
    el.addEventListener('change', function () { if (!quiet) emitParams('slider'); });
  });
  /** 程式設定滑桿（不觸發任務回報；呼叫端自己回報） */
  function setSlider(el, v) {
    quiet = true;
    if (window.LabNum) window.LabNum.set(el, v);
    else { el.value = v; el.dispatchEvent(new Event('input')); }
    quiet = false;
  }
  function applyPreset(kind) {
    const a = state.alpha;
    let b, d;
    if (kind === 'circle') { b = 90; d = 2; }
    else if (kind === 'ellipse') { b = Math.round(a + (90 - a) * 0.42); d = 2.5; }
    else if (kind === 'parabola') { b = a; d = 2; }
    else { b = Math.round(a * 0.3); d = 2.5; }
    setSlider(elB, b);
    setSlider(elD, d);
    emitParams('preset');
    const bs = fmtSlider(val(elB), elB) + '°', ds = fmtSlider(val(elD), elD);
    setStatus(T('快速切法：' + typeName(state.sec.type) + '（β = ' + bs + '、d = ' + ds + '）',
      'Quick cut: ' + typeName(state.sec.type) + ' (β = ' + bs + ', d = ' + ds + ')'));
  }
  document.querySelectorAll('#presets button').forEach(function (b) {
    b.addEventListener('click', function () { applyPreset(b.getAttribute('data-preset')); });
  });
  [['showSpheres', 'spheres'], ['showDir', 'dir'], ['showGen', 'gen'], ['showLatus', 'latus'], ['showAsym', 'asym']].forEach(function (pr) {
    $(pr[0]).addEventListener('change', function (ev) {
      state.show[pr[1]] = ev.target.checked;
      if (view3) view3.setShow();
      requestDraw();
    });
  });
  $('mark').addEventListener('click', markP);
  $('clear').addEventListener('click', function () { clearLog(false); });

  // =====================================================================
  // 畫布上的拖曳：P（右圖）、切平面與旋轉把手（左圖）
  // =====================================================================
  function evPos(ev) { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  function inRect(p, R) { return p.x >= R.x && p.x <= R.x + R.w && p.y >= R.y && p.y <= R.y + R.h; }
  function hitTest(p) {
    if (!L || !state.sec) return null;
    const touchPad = 6;
    if (inRect(p, L.shape)) {
      const q = pPoint();
      if (q && Math.hypot(HX(q.x) - p.x, HY(q.y) - p.y) <= 18 + touchPad) return 'P';
      return null;
    }
    if (inRect(p, L.side)) {
      const kn = knobPos();
      if (kn && Math.hypot(kn.x - p.x, kn.y - p.y) <= 16 + touchPad) return 'knob';
      // 到切平面（側看的直線）的距離
      const s = state.sec, fx = SX(s.foot[0]), fy = SY(s.foot[2]), ux = s.u[0], uy = -s.u[2];
      const dd = Math.abs((p.x - fx) * uy - (p.y - fy) * ux);
      if (dd <= 9 + touchPad) return 'line';
    }
    return null;
  }
  function setHover(h) {
    if (h === state.hover) return;
    state.hover = h;
    cv.style.cursor = h === 'P' || h === 'knob' ? 'grab' : h === 'line' ? 'move' : 'default';
    requestDraw();
  }
  function dragP(p) {
    const w = shapeInv(p.x, p.y);
    const n = CC.nearest(state.sec, w.x, w.y);
    setPFromNearest(n);
    afterPMove();
  }
  function afterPMove() {
    updatePReadouts();
    if (view3) view3.updateP();
    requestDraw();
  }
  function dragPlane(p, kind) {
    const w = sideInv(p.x, p.y);
    const s = state.sec;
    if (kind === 'line') {
      // 平移：d = m·Q（Q 為手指位置），限制在 0–3
      const d = Math.max(0, Math.min(3, -Math.cos(s.beta) * w.x + Math.sin(s.beta) * w.z));
      setSlider(elD, Math.round(d * 100) / 100);
    } else {
      // 旋轉：平面通過手指位置，且仍與半徑 d 的圓相切 → sin(β − ψ) = d／|Q|
      const r = Math.hypot(w.x, w.z);
      if (r < 1e-6) return;
      const psi = Math.atan2(w.x, w.z);
      const asn = Math.asin(Math.min(1, s.d / r));
      const cands = [psi + asn, psi + Math.PI - asn].map(function (b) {
        b = Math.atan2(Math.sin(b), Math.cos(b));
        return Math.max(0, Math.min(90, b / DEG));
      });
      const cur = s.betaDeg;
      const nb = Math.abs(cands[0] - cur) <= Math.abs(cands[1] - cur) ? cands[0] : cands[1];
      setSlider(elB, Math.round(nb * 10) / 10);
    }
  }
  let downAt = null;
  cv.addEventListener('pointerdown', function (ev) {
    const p = evPos(ev);
    const h = hitTest(p);
    downAt = { x: p.x, y: p.y, t: performance.now(), h: h };
    if (!h) return; // 不在可拖曳的東西上：讓頁面照常捲動
    state.drag = { kind: h, moved: false };
    if (h !== 'P') frozen = true;
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    ev.preventDefault();
    requestDraw();
  });
  // 手機：按在可拖曳的東西上時阻止頁面捲動
  cv.addEventListener('touchstart', function (ev) {
    const t = ev.touches[0]; if (!t) return;
    const r = cv.getBoundingClientRect();
    if (hitTest({ x: t.clientX - r.left, y: t.clientY - r.top })) ev.preventDefault();
  }, { passive: false });
  cv.addEventListener('pointermove', function (ev) {
    const p = evPos(ev);
    if (!state.drag) { if (ev.pointerType !== 'touch') setHover(hitTest(p)); return; }
    state.drag.moved = true;
    if (state.drag.kind === 'P') dragP(p); else dragPlane(p, state.drag.kind);
  });
  function endDrag(ev) {
    const dr = state.drag;
    if (!dr) {
      // 在右圖點一下（沒有拖曳）：P 跳到最近的曲線上的點（離曲線 30 px 以內）
      if (ev && ev.type === 'pointerup' && downAt && !downAt.h) {
        const p = evPos(ev);
        if (Math.hypot(p.x - downAt.x, p.y - downAt.y) < 6 && inRect(p, L.shape) && !state.sec.degenerate) {
          const w = shapeInv(p.x, p.y), n = CC.nearest(state.sec, w.x, w.y);
          if (n.dist * view.shape.k <= 30) { setPFromNearest(n); afterPMove(); emitProbe('tap'); }
        }
      }
      downAt = null;
      return;
    }
    state.drag = null;
    downAt = null;
    if (dr.kind !== 'P') { frozen = false; retarget(false); }
    setHover(ev && ev.pointerType === 'mouse' ? hitTest(evPos(ev)) : null);
    if (dr.moved) {
      if (dr.kind === 'P') emitProbe('drag'); else emitParams('drag');
    }
    requestDraw();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (!state.drag) setHover(null); });

  // ---------- 鍵盤操作（keys.js） ----------
  let kb = null;
  /** 沿曲線移動 P：每次大約走 0.02 單位長（Shift 0.2） */
  function stepP(dir, big) {
    const s = state.sec;
    if (s.degenerate) return false;
    const ds = (big ? 0.2 : 0.02) * dir;
    const par = state.P;
    const q = pPoint();
    // 參數對弧長的變化率（數值微分）
    const h = 1e-4, q2 = pPoint(s, { br: par.br, t: par.t + h });
    const speed = Math.hypot(q2.x - q.x, q2.y - q.y) / h || 1;
    state.P = { br: par.br, t: par.t + ds / speed };
    if (s.type === 'ellipse' || s.type === 'circle') state.P.t = Math.atan2(Math.sin(state.P.t), Math.cos(state.P.t));
    afterPMove();
    return true;
  }
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('圓錐曲線畫布。按 Enter 切換要操作的物件（點 P 或切平面），方向鍵移動，Shift 加方向鍵移動得更多。',
        'Conic sections canvas. Press Enter to choose the point P or the cutting plane, use the arrow keys to move it, Shift for bigger steps.'),
      items: [
        {
          name: function () { return T('曲線上的點 P', 'the point P on the curve'); },
          move: function (dx, dy, big) { const ok = stepP(dx || dy, big); if (ok) emitProbe('key'); return ok; },
          describe: function () {
            const M = measureP();
            if (!M) return T('切口退化，沒有點 P。', 'The cut is degenerate; there is no point P.');
            return 'P (' + len(M.x) + ', ' + len(M.y) + T(')，PF1 = ', '), PF1 = ') + len(M.PF[0]) + (M.PF.length > 1 ? T('，PF2 = ', ', PF2 = ') + len(M.PF[1]) : '');
          }
        },
        {
          name: function () { return T('切平面', 'the cutting plane'); },
          move: function (dx, dy, big) {
            if (dy) setSlider(elD, Math.max(0, Math.min(3, Math.round((state.d + dy * (big ? 0.25 : 0.05)) * 100) / 100)));
            if (dx) setSlider(elB, Math.max(0, Math.min(90, Math.round(state.beta - dx * (big ? 5 : 1)))));
            emitParams('key');
            return true;
          },
          describe: function () { return 'β = ' + fmtSlider(state.beta, elB) + '°' + T('，', ', ') + 'd = ' + fmtSlider(state.d, elD) + T('，', ', ') + typeName(state.sec.type); }
        }
      ],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 3D 檢視：切換到 3D 時才載入 js/conic-sections-3d.js 與 three.js（以 import() 動態載入）；切回 2D 時整個釋放
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  let rotatedOnce = false;
  const bridge = {
    CC: CC, T: T, D: D, state: state, reducedMotion: reducedMotion,
    colors: function () { return C; },
    pPoint: function () { return pPoint(); },
    measure: function () { return measureP(); },
    len: len, num: num, typeName: typeName,
    /** 3D 中按方向鍵沿曲線移動 P */
    stepP: function (dir, big) { if (stepP(dir, big)) emitProbe('key3d'); },
    /** 3D 中拖曳 P：(x′, y′) 為切平面上的標準式座標 */
    dragP: function (x, y) { const n = CC.nearest(state.sec, x, y); setPFromNearest(n); updatePReadouts(); requestDraw(); if (view3) view3.updateP(); },
    endDragP: function () { emitProbe('drag3d'); },
    onRotate: function () { emit('rotate3d', baseData()); if (!rotatedOnce) { rotatedOnce = true; } },
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
      if (window.Conic3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Conic3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/conic-sections-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Conic3D) throw new Error('conic-sections-3d.js did not load');
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
        if (token !== loadToken) return; // 載入期間已切回 2D
        stage.classList.add('is3d');
        view3 = window.Conic3D.create(lib, host3, bridge);
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

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  refreshOutputs();
  compute();
  state.committedType = state.sec.type;
  updateReadouts();
  renderLog();
  updateSoundButton();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    eqKey = '';
    updateReadouts();
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
  } else window.addEventListener('resize', resize);
  resize();
})();
