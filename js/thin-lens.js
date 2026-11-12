/* thin-lens.js — 「薄透鏡的成像」課本實驗的畫面與互動（物理計算在 thin-lens-core.js，繪圖工具 drawkit.js） */
(function () {
  'use strict';
  const TL = window.ThinLensCore;
  const LD = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FONT = LD.FONT;
  const R = TL.LENS_R, PH = TL.PATTERN_HALF;
  const PIN_H = 3.5, PIN_HEAD = 0.25, LENS_HC = 2.6, EYE_H = 2.6; // 插針法：針高、針頭半徑、透鏡中心高、眼睛高（cm）
  const SHARP = 0.05;   // 像屏上模糊圓斑 ≤ 0.5 mm 算「清楚」
  const RECORD_MAX_BLUR = 0.25;

  // ======================= 狀態 =======================
  const rnd = Math.random;
  const mystery = { cxM: TL.mysteryF(rnd, 1), ccM: TL.mysteryF(rnd, -1) };
  const offsets = {};
  TL.LENSES.forEach(function (L) { offsets[L.id] = TL.lensOffset(rnd); });

  const state = {
    method: 'screen', lens: 'cx10', mode: 'ideal',
    xO: 5, xL: 90, xS: 95, xR: 35,
    pin: { p: 20, A: [6, -1.2], B: [13, -2.4], E: [24, -7], lined: false },
    sel: 'lens', head: 0, auto: false, t0: 0,
    show: { beam: true, rays: false, guide: true },
    rows: [], graph: 'inv', revealed: {}, touched: false,
    visited: { screen: true, parallax: false, pin: false },
    flags: { setup: true, sharpSeen: false, swung: false, parSetup: false, pMoved: false, eyeMoved: false, pinsMoved: false }
  };
  let kb = null, vkb = null, headItem = null;   // 鍵盤操作（js/keys.js）：主畫布、放大圖（視差法擺頭）
  const kbItems = [], vkbItems = [];
  function lensObj(id) { id = id || state.lens; for (let i = 0; i < TL.LENSES.length; i++) if (TL.LENSES[i].id === id) return TL.LENSES[i]; return TL.LENSES[0]; }
  function fOf(id) { const L = lensObj(id); return L.f || mystery[L.id]; }
  function isMyst(id) { return !!lensObj(id).mystery; }
  function hidden(id) { return isMyst(id) && !state.revealed[id || state.lens]; }
  function dL() { return state.mode === 'error' ? offsets[state.lens] : 0; }
  function saC() { return state.mode === 'error' ? TL.saCoef(fOf()) : 0; }
  function ideal() { return state.mode === 'ideal'; }
  /** 參考物頂端的高度（cm，相對主軸）：在透鏡後方（看虛像）用高過透鏡的長桿；在透鏡與眼睛之間（看實像）改用頂端低於鏡框的短桿，才不會擋住鏡中的像 */
  const FRONT_ROD_TOP = -1.6;
  function rodTop() { return state.xR > state.xL + dL() ? FRONT_ROD_TOP : TL.ROD_TOP; }

  /** 光凳目前的物理狀態 */
  function bench() {
    const f = fOf();
    const o = { f: f, xO: state.xO, xL: state.xL, dL: dL() };
    if (state.method === 'screen') o.xS = state.xS;
    if (state.method === 'parallax') o.xR = state.xR;
    const b = TL.bench(o);
    b.f = f;
    if (state.method === 'parallax') {
      b.A = TL.swingAmp(b.xLt, b.q, b.xE);
      b.sE = state.head * b.A;
      b.d = b.xE - b.xLt;
    }
    return b;
  }

  // ======================= 數字格式 =======================
  function num(v, d) {
    if (!isFinite(v)) return v < 0 ? '−∞' : '∞';
    let s = v.toFixed(d);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function signed(v, d) { const s = num(v, d); return v > 0 && /[1-9]/.test(s) ? '+' + s : s; }
  function cm(v, d) { return num(v, d == null ? 1 : d) + ' cm'; }
  function pct(e) { return isFinite(e) ? signed(100 * e, Math.abs(e) < 0.1 ? 2 : 1) + ' %' : '—'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  const INV = 'cm<sup>−1</sup>';

  function lensName(id) {
    const L = lensObj(id);
    const conv = L.sign > 0;
    if (L.mystery) return conv ? T('神秘凸透鏡', 'mystery convex lens') : T('神秘凹透鏡', 'mystery concave lens');
    return (conv ? T('凸透鏡', 'convex lens') : T('凹透鏡', 'concave lens')) + ' ' + Math.abs(L.f) + ' cm';
  }
  function methodName(m, short) {
    if (m === 'screen') return short ? T('像屏', 'screen') : T('像屏法', 'screen method');
    if (m === 'parallax') return short ? T('視差', 'parallax') : T('視差法', 'parallax method');
    return short ? T('插針', 'pins') : T('插針法', 'pin method');
  }
  function natureText(s) {
    if (s.atInfinity) return T('不成像（像在無窮遠）', 'no image (at infinity)');
    const sep = T('、', ', ');
    return (s.upright ? T('正立', 'upright') : T('倒立', 'inverted')) + sep +
      (s.size === 'same' ? T('等大', 'same size') : s.size === 'magnified' ? T('放大', 'magnified') : T('縮小', 'reduced')) + sep +
      (s.real ? T('實像', 'real') : T('虛像', 'virtual'));
  }

  // ======================= 色彩 =======================
  const col = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['b-optics', 'b-wave'].forEach(function (k) { col[k] = cs.getPropertyValue('--' + k).trim() || '#7c3aed'; });
    const c = LD.c;
    col.dark = LD.dark;
    col.light = c.equi;                                        // 燈光（暖色）
    col.lightHi = LD.shade(c.equi, LD.dark ? 0.55 : 0.9);       // 亮處（接近白的暖色）
    col.metal = LD.mix(c.field, c['canvas-bg'], LD.dark ? 0.45 : 0.15);
    col.rod = c.pos;
    col.glass = c.neg;
    col.img = col['b-optics'];
    col.obj = c.equi;
    col.pinA = c.equi;
    col.pinB = c.probe;
    col.pinP = c.pos;
  }

  // ======================= 光凳上的擺放 =======================
  const BODY = { src: [TL.LAMP_BACK, 1.5], lens: [1.5, 1.5], screen: [1.5, 1.5], rod: [1.5, 1.5] };
  function present(it) {
    if (it === 'screen') return state.method === 'screen';
    if (it === 'rod') return state.method === 'parallax';
    return it === 'src' || it === 'lens';
  }
  function posOf(it) { return it === 'src' ? state.xO : it === 'lens' ? state.xL : it === 'screen' ? state.xS : state.xR; }
  function setPos(it, x) {
    if (it === 'src') state.xO = x; else if (it === 'lens') state.xL = x; else if (it === 'screen') state.xS = x; else state.xR = x;
  }
  function c1(x) { return Math.ceil(x * 10 - 1e-6) / 10; }
  function f1(x) { return Math.floor(x * 10 + 1e-6) / 10; }
  function rangeOf(it) {
    if (it === 'src') return [5, f1(state.xL - 3)];
    if (it === 'lens') return [c1(state.xO + 3), present('screen') ? f1(state.xS - 3) : 98.5];
    if (it === 'screen') return [c1(state.xL + 3), 98.5];
    const xE = TL.eyeX(state.xL + dL(), TL.imageDistance(state.xL + dL() - state.xO, fOf()));
    return [1.5, Math.min(98.5, f1(xE - 3))];
  }
  function forbidden(it) {
    const out = [];
    ['src', 'lens', 'screen', 'rod'].forEach(function (o) {
      if (o === it || !present(o)) return;
      if (it !== 'rod') return;   // 只有參考物要避開其他器材；移動其他器材時，擋路的參考物會被推開
      const ox = posOf(o), ob = BODY[o], ib = BODY[it];
      out.push([TL.round1(ox - ob[0] - ib[1]), TL.round1(ox + ob[1] + ib[0])]);
    });
    return out;
  }
  function place(it, want) {
    const r = rangeOf(it);
    if (r[1] < r[0]) return posOf(it);
    const fb = forbidden(it);
    const bad = function (v) { return v < r[0] - 1e-9 || v > r[1] + 1e-9 || fb.some(function (iv) { return v > iv[0] + 1e-9 && v < iv[1] - 1e-9; }); };
    let x = TL.round1(Math.min(r[1], Math.max(r[0], want)));
    if (bad(x)) {
      const cands = [r[0], r[1]];
      fb.forEach(function (iv) { cands.push(iv[0], iv[1]); });
      let best = null;
      cands.forEach(function (c) { if (!bad(c) && (best === null || Math.abs(c - want) < Math.abs(best - want))) best = c; });
      x = best === null ? posOf(it) : best;
    }
    return TL.round1(x);
  }
  /** 移動一個器材（含限制），再讓其他器材保持合法 */
  function moveItem(it, want) {
    setPos(it, place(it, want));
    if (present('rod') && it !== 'rod') {
      const x = place('rod', state.xR);
      state.xR = x;
    }
    state.pin.lined = state.pin.lined && it !== 'A' && it !== 'B';
  }
  function fixAll() {
    ['src', 'lens', 'screen', 'rod'].forEach(function (it) { if (present(it)) setPos(it, place(it, posOf(it))); });
  }

  // ---------- 插針法的器材 ----------
  function clampPin(it, v) {
    const P = state.pin;
    if (it === 'P') { P.p = TL.round1(Math.min(30, Math.max(2, v))); return; }
    let x = TL.round1(Math.min(31, Math.max(it === 'E' ? 3 : 1, v[0])));
    let s = TL.round1(Math.min(19.5, Math.max(-19.5, v[1])));
    if (Math.abs(s) < R + 0.3 && x < 1.2) x = 1.2;
    P[it] = [x, s];
    if (it === 'A' || it === 'B') P.lined = false;
  }

  // ======================= 畫布 =======================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const vcv = $('vcv'), vctx = vcv.getContext('2d');
  const gcv = $('gcv'), gctx = gcv.getContext('2d');
  let dpr = 1;
  let Lb = null;   // 光凳版面
  let Lp = null;   // 插針版面
  const bgB = document.createElement('canvas'), bgBc = bgB.getContext('2d');
  const blurCv = document.createElement('canvas'), blurC = blurCv.getContext('2d');

  function setupCanvas(c, h) {
    const w = c.clientWidth || 300;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.style.height !== h + 'px') c.style.height = h + 'px';
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (c.width !== W) c.width = W;
    if (c.height !== H) c.height = H;
    return { w: w, h: h };
  }

  // ---------- 光凳（側視） ----------
  const WX0 = -3, WX1 = 105;
  function benchLayout(w) {
    const narrow = w < 560;
    const kx = (w - 12) / (WX1 - WX0);
    const ky = narrow ? 2 * kx : kx;
    const top = 26;
    const oy = top + 14 * ky;
    const railTop = oy + 12 * ky, railBot = oy + 14.6 * ky;
    const loupeY = railBot + 5, loupeH = 40;
    const dim1 = loupeY + loupeH + 16, dim2 = dim1 + 24;
    return { narrow: narrow, w: w, kx: kx, ky: ky, ox: 6 - WX0 * kx, oy: oy, railTop: railTop, railBot: railBot, loupeY: loupeY, loupeH: loupeH, dim1: dim1, dim2: dim2, h: Math.round(dim2 + 16) };
  }
  function X(x) { return Lb.ox + x * Lb.kx; }
  function Y(y) { return Lb.oy - y * Lb.ky; }
  function wx(px) { return (px - Lb.ox) / Lb.kx; }

  function buildBenchBg() {
    bgB.width = cv.width; bgB.height = cv.height;
    const c = bgBc;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, Lb.w, Lb.h);
    LD.backdrop(c, Lb.w, Lb.h);
    // 桌面：光凳下方淡淡的漸層
    const tg = c.createLinearGradient(0, Lb.railTop, 0, Lb.h);
    tg.addColorStop(0, LD.alpha(LD.c.text, 0));
    tg.addColorStop(1, LD.alpha(LD.c.text, LD.dark ? 0.06 : 0.035));
    c.fillStyle = tg;
    c.fillRect(0, Lb.railTop, Lb.w, Lb.h - Lb.railTop);
    // 主軸（光凳上方 12 cm 的光學中心線）
    c.save();
    c.setLineDash([6, 5]);
    c.strokeStyle = LD.alpha(LD.c.muted, 0.35);
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(X(-1), Math.round(Lb.oy) + 0.5); c.lineTo(X(103), Math.round(Lb.oy) + 0.5); c.stroke();
    c.restore();
    // 光凳（鋁軌）：投影、頂面高光、正面的公制尺
    const x0 = X(-1.5), x1 = X(101.5), yT = Lb.railTop, yB = Lb.railBot;
    c.save();
    c.shadowColor = LD.shadowInk(0.25); c.shadowBlur = 8; c.shadowOffsetY = 3;
    LD.roundRect(c, x0, yT, x1 - x0, yB - yT, 3);
    const rg = c.createLinearGradient(0, yT, 0, yB);
    rg.addColorStop(0, LD.shade(col.metal, LD.dark ? 0.35 : 0.55));
    rg.addColorStop(0.25, LD.shade(col.metal, LD.dark ? 0.15 : 0.35));
    rg.addColorStop(1, LD.shade(col.metal, LD.dark ? -0.1 : 0.1));
    c.fillStyle = rg; c.fill();
    c.restore();
    // 尺面
    const sT = yT + Math.max(2, 0.35 * Lb.ky), sB = yB - Math.max(1.5, 0.2 * Lb.ky);
    c.fillStyle = LD.dark ? LD.mix(LD.c.surface, '#ffffff', 0.08) : LD.mix(LD.c.surface, LD.c.equi, 0.06);
    c.fillRect(X(-0.6), sT, X(100.6) - X(-0.6), sB - sT);
    c.strokeStyle = LD.alpha(LD.c.text, 0.25); c.lineWidth = 1;
    c.strokeRect(Math.round(X(-0.6)) + 0.5, Math.round(sT) + 0.5, Math.round(X(100.6) - X(-0.6)), Math.round(sB - sT));
    const sh = sB - sT;
    c.strokeStyle = LD.alpha(LD.c.text, 0.75);
    c.beginPath();
    for (let i = 0; i <= 100; i++) {
      const L = i % 10 === 0 ? 0.55 : i % 5 === 0 ? 0.38 : 0.22;
      const x = Math.round(X(i) * dpr) / dpr + 0.5 / dpr;
      c.moveTo(x, sT); c.lineTo(x, sT + sh * L);
    }
    c.lineWidth = 1 / dpr * (dpr > 1 ? 1.2 : 1);
    c.stroke();
    c.fillStyle = LD.c.text;
    c.font = '600 ' + (Lb.kx < 5 ? 9 : 10) + 'px ' + FONT;
    c.textAlign = 'center'; c.textBaseline = 'bottom';
    for (let i = 0; i <= 100; i += 10) c.fillText(String(i), X(i), sB - 0.5);
    c.textAlign = 'right';
    c.fillStyle = LD.c.muted;
    c.font = '600 10px ' + FONT;
    if (!Lb.narrow) c.fillText('cm', X(104.8), sB - 0.5);   // 窄螢幕放不下，省略單位
    // 光凳兩端的端蓋
    [x0, x1 - 4].forEach(function (x) {
      c.fillStyle = LD.shade(col.metal, LD.dark ? -0.2 : -0.1);
      c.fillRect(x, yT, 4, yB - yT);
    });
    if (Lb.narrow) {
      c.font = '11px ' + FONT; c.textAlign = 'right'; c.textBaseline = 'top';
      c.fillStyle = LD.alpha(LD.c.muted, 0.9);
      c.fillText(T('示意：鉛直方向放大 2 倍', 'Vertical scale ×2'), Lb.w - 6, 6);
    }
  }

  function resizeMain() {
    const w = cv.clientWidth || 300;
    if (state.method === 'pin') {
      Lp = pinLayout(w);
      setupCanvas(cv, Lp.h);
    } else {
      Lb = benchLayout(w);
      setupCanvas(cv, Lb.h);
      buildBenchBg();
    }
    cv.style.touchAction = state.method === 'pin' ? 'none' : 'pan-y';
    drawMain();
  }

  // ---------- 繪圖小工具 ----------
  function carrier(c, x, wcm, sel) {
    const x0 = X(x - wcm[0]), x1 = X(x + wcm[1]);
    const y0 = Y(-9.6), y1 = Y(-12);
    LD.block(c, x0, y0, x1 - x0, y1 - y0, col.metal, { r: 3 });
    if (sel) {
      c.save();
      LD.roundRect(c, x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6, 5);
      c.strokeStyle = LD.alpha(LD.c.accent, 0.85); c.lineWidth = 2; c.setLineDash([4, 3]); c.stroke();
      c.restore();
    }
    // 標線：指到尺上的紅色細線與小三角
    const xi = Math.round(X(x) * dpr) / dpr + 0.5 / dpr;
    c.save();
    c.strokeStyle = LD.c.pos; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(xi, y1 - 1); c.lineTo(xi, Lb.railTop + (Lb.railBot - Lb.railTop) * 0.62); c.stroke();
    c.fillStyle = LD.c.pos;
    c.beginPath(); c.moveTo(xi - 4, y1 - 1); c.lineTo(xi + 4, y1 - 1); c.lineTo(xi, y1 + 4); c.closePath(); c.fill();
    c.restore();
  }
  function stem(c, x, yTop) {
    const w = Math.max(3, 0.45 * Lb.kx);
    LD.tube(c, function (g) { g.moveTo(X(x), Y(yTop)); g.lineTo(X(x), Y(-9.6)); }, LD.mix(col.metal, LD.c.surface, 0.35), w);
  }

  /** 透鏡側視輪廓（凸／凹），中心在 (px, py)，半高 hh px */
  function lensPath(c, px, py, hh, conv, tC) {
    const thin = 2.4;
    const half = conv ? tC / 2 : thin / 2, edge = conv ? thin / 2 : tC / 2;
    const ctrl = 2 * half - edge;
    c.beginPath();
    c.moveTo(px - edge, py - hh);
    c.lineTo(px + edge, py - hh);
    c.quadraticCurveTo(px + ctrl, py, px + edge, py + hh);
    c.lineTo(px - edge, py + hh);
    c.quadraticCurveTo(px - ctrl, py, px - edge, py - hh);
    c.closePath();
  }
  function drawLensSide(c, px, py, hh, conv, tC, alphaK) {
    const glass = col.glass, a = alphaK == null ? 1 : alphaK;
    c.save();
    const g = c.createLinearGradient(px - tC, 0, px + tC, 0);
    g.addColorStop(0, LD.alpha(LD.shade(glass, 0.55), (col.dark ? 0.5 : 0.6) * a));
    g.addColorStop(0.45, LD.alpha(glass, (col.dark ? 0.3 : 0.22) * a));
    g.addColorStop(1, LD.alpha(LD.shade(glass, -0.25), (col.dark ? 0.45 : 0.36) * a));
    c.fillStyle = g;
    lensPath(c, px, py, hh, conv, tC); c.fill();
    const g2 = c.createLinearGradient(0, py - hh, 0, py + hh);
    g2.addColorStop(0, 'rgba(255,255,255,' + (col.dark ? 0.12 : 0.4) * a + ')');
    g2.addColorStop(0.5, 'rgba(255,255,255,0)');
    g2.addColorStop(1, 'rgba(0,0,0,' + (col.dark ? 0.12 : 0.05) * a + ')');
    c.fillStyle = g2;
    lensPath(c, px, py, hh, conv, tC); c.fill();
    c.strokeStyle = LD.alpha(LD.shade(glass, col.dark ? 0.2 : -0.15), 0.85 * a);
    c.lineWidth = 1.1;
    lensPath(c, px, py, hh, conv, tC); c.stroke();
    c.restore();
  }

  // ---------- 光凳：動態圖層 ----------
  function drawBench() {
    const c = ctx, b = bench(), f = b.f;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.drawImage(bgB, 0, 0, Lb.w, Lb.h);
    const xLt = b.xLt, s = b.sol;
    const scr = state.method === 'screen', par = state.method === 'parallax';
    const conv = f > 0;

    // ---- 光錐（由光源屏中心點經過透鏡口徑的光） ----
    if (state.show.beam) {
      const xEnd = scr ? b.xLt + Math.max(0, state.xS - xLt) : Math.min(WX1, par ? b.xE : WX1);
      const p = b.pTrue;
      const yAt = function (y0, x) { // 由透鏡上高度 y0 出發的邊緣光線，在 x 處的高度
        const u = y0 / p - y0 / f;
        return y0 + u * (x - xLt);
      };
      c.save();
      const lg = c.createLinearGradient(X(state.xO), 0, X(xEnd), 0);
      const a0 = col.dark ? 0.2 : 0.16;
      lg.addColorStop(0, LD.alpha(col.light, a0 * 1.3));
      lg.addColorStop(1, LD.alpha(col.light, a0 * 0.6));
      c.fillStyle = lg;
      if (col.dark) c.globalCompositeOperation = 'lighter';
      // 透鏡前
      c.beginPath(); c.moveTo(X(state.xO), Y(0)); c.lineTo(X(xLt), Y(R)); c.lineTo(X(xLt), Y(-R)); c.closePath(); c.fill();
      // 透鏡後：兩條邊緣光線之間（實像時交叉成兩個三角形）
      if (xEnd > xLt) {
        c.beginPath();
        c.moveTo(X(xLt), Y(R)); c.lineTo(X(xEnd), Y(yAt(R, xEnd)));
        c.lineTo(X(xEnd), Y(yAt(-R, xEnd))); c.lineTo(X(xLt), Y(-R)); c.closePath();
        c.fill('nonzero');
      }
      c.globalCompositeOperation = 'source-over';
      c.strokeStyle = LD.alpha(col.light, col.dark ? 0.55 : 0.5);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(X(state.xO), Y(0)); c.lineTo(X(xLt), Y(R)); c.lineTo(X(xEnd), Y(yAt(R, xEnd)));
      c.moveTo(X(state.xO), Y(0)); c.lineTo(X(xLt), Y(-R)); c.lineTo(X(xEnd), Y(yAt(-R, xEnd)));
      c.stroke();
      // 會聚點的小光點（實像）
      if (s.real && b.xI > xLt && b.xI <= xEnd + 1e-9 && b.xI < WX1) {
        const gx = X(b.xI), gy = Y(0), rr = 7;
        const gg = c.createRadialGradient(gx, gy, 0, gx, gy, rr);
        gg.addColorStop(0, LD.alpha(col.lightHi, 0.95));
        gg.addColorStop(1, LD.alpha(col.light, 0));
        c.fillStyle = gg; c.beginPath(); c.arc(gx, gy, rr, 0, 7); c.fill();
      }
      c.restore();
    }

    // ---- 燈泡與光源屏 ----
    carrier(c, state.xO, BODY.src, state.sel === 'src');
    const bx = state.xO - 3, by = 0.2;
    stem(c, bx, -2.6);
    LD.block(c, X(bx - 0.9), Y(-1.6), 1.8 * Lb.kx, 1.0 * Lb.ky, LD.mix(col.metal, LD.c.text, 0.2), { r: 2, shadow: false });
    // 燈泡：發光的玻璃球
    const br = Math.max(7, 1.8 * Math.min(Lb.kx, Lb.ky));
    const glow = c.createRadialGradient(X(bx), Y(by), br * 0.3, X(bx), Y(by), br * 2.6);
    glow.addColorStop(0, LD.alpha(col.lightHi, col.dark ? 0.55 : 0.45));
    glow.addColorStop(1, LD.alpha(col.light, 0));
    c.fillStyle = glow; c.beginPath(); c.arc(X(bx), Y(by), br * 2.6, 0, 7); c.fill();
    const bulb = c.createRadialGradient(X(bx) - br * 0.35, Y(by) - br * 0.35, br * 0.1, X(bx), Y(by), br);
    bulb.addColorStop(0, '#ffffff');
    bulb.addColorStop(0.45, col.lightHi);
    bulb.addColorStop(1, LD.alpha(col.light, 0.85));
    c.fillStyle = bulb; c.beginPath(); c.arc(X(bx), Y(by), br, 0, 7); c.fill();
    // 光源屏（側面看是一片薄板，挖空處透出光）
    stem(c, state.xO, -4);
    const pw = Math.max(3, 0.35 * Lb.kx);
    LD.block(c, X(state.xO) - pw / 2, Y(4), pw, 8 * Lb.ky, LD.dark ? LD.mix(col.metal, '#000000', 0.5) : LD.mix(LD.c.field, '#000000', 0.2), { r: 1.5 });
    c.fillStyle = LD.alpha(col.lightHi, 0.95);
    c.fillRect(X(state.xO) + pw / 2 - 1, Y(PH), 2, 2 * PH * Lb.ky);

    // ---- 像屏或參考物 ----
    if (scr) {
      carrier(c, state.xS, BODY.screen, state.sel === 'screen');
      stem(c, state.xS, -5);
      const sw = Math.max(3, 0.3 * Lb.kx);
      LD.block(c, X(state.xS) - sw / 2, Y(5), sw, 10 * Lb.ky, LD.dark ? LD.mix(LD.c.surface, '#ffffff', 0.55) : LD.mix(LD.c.surface, LD.c.text, 0.04), { r: 1.5 });
      // 光打在像屏上的範圍（像高＋模糊圓斑）
      if (state.show.beam && isFinite(b.blur)) {
        const hImg = s.atInfinity ? 0 : Math.abs(s.m) * PH;
        const hb = Math.min(5, hImg + b.blur / 2);
        const gl = c.createLinearGradient(0, Y(hb), 0, Y(-hb));
        gl.addColorStop(0, LD.alpha(col.lightHi, 0.0));
        gl.addColorStop(0.5, LD.alpha(col.lightHi, 0.9));
        gl.addColorStop(1, LD.alpha(col.lightHi, 0.0));
        c.fillStyle = gl;
        c.fillRect(X(state.xS) - sw / 2 - 2, Y(hb), 2.5, 2 * hb * Lb.ky);
      }
    }
    if (par) {
      carrier(c, state.xR, BODY.rod, state.sel === 'rod');
      const rw = Math.max(3.5, 0.45 * Lb.kx);
      LD.tube(c, function (g) { g.moveTo(X(state.xR), Y(rodTop())); g.lineTo(X(state.xR), Y(-9.6)); }, col.rod, rw);
    }

    // ---- 透鏡 ----
    carrier(c, state.xL, BODY.lens, state.sel === 'lens');
    stem(c, xLt, -R - 0.5);
    const hh = R * Lb.ky, tC = Math.max(8, 1.0 * Lb.kx);
    c.save();
    c.shadowColor = LD.shadowInk(0.3); c.shadowBlur = 6; c.shadowOffsetY = 2;
    LD.roundRect(c, X(xLt) - tC / 2 - 2.5, Y(R + 0.5), tC + 5, (2 * R + 1) * Lb.ky, 4);
    c.fillStyle = LD.alpha(col.metal, 0.35); c.fill();
    c.restore();
    LD.roundRect(c, X(xLt) - tC / 2 - 2.5, Y(R + 0.5), tC + 5, (2 * R + 1) * Lb.ky, 4);
    c.strokeStyle = LD.alpha(col.metal, 0.9); c.lineWidth = 2; c.stroke();
    drawLensSide(c, X(xLt), Y(0), hh, conv, tC);

    // ---- 眼睛 ----
    if (par) drawEyeSide(c, b.xE);

    // ---- 光線圖 ----
    if (state.show.rays) drawRayDiagram(c, b);

    // ---- 標籤 ----
    const labels = [
      { x: state.xO, y: 4, t: T('光源屏', 'Source'), c: col.obj },
      { x: xLt, y: R + 0.5, t: hidden() ? T('透鏡 f = ？', 'Lens f = ?') : T('透鏡 f = ', 'Lens f = ') + signed(f, 1) + ' cm', c: col.glass }
    ];
    if (scr) labels.push({ x: state.xS, y: 5, t: T('像屏', 'Screen'), c: LD.c.text });
    if (par) labels.push({ x: state.xR, y: Math.max(rodTop(), R + 0.5), t: T('參考物', 'Rod'), c: col.rod });
    placeLabels(c, labels);

    // ---- 讀數放大鏡與 p、q 尺寸線 ----
    drawLoupe(c);
    drawDims(c);
  }

  function placeLabels(c, labels) {
    labels.sort(function (a, b) { return a.x - b.x; });
    const placed = [];
    labels.forEach(function (L) {
      c.font = '600 12px ' + FONT;
      const w = c.measureText(L.t).width + 12, h = 18;
      let x = Math.max(4, Math.min(Lb.w - w - 4, X(L.x) - w / 2));
      let y = Math.min(Y(L.y) - 5, Lb.oy - 8) - h;
      for (let k = 0; k < 4; k++) {
        const hit = placed.some(function (p) { return x < p.x + p.w + 3 && p.x < x + w + 3 && y < p.y + p.h + 2 && p.y < y + h + 2; });
        if (!hit) break;
        y -= h + 3;
      }
      y = Math.max(2, y);
      const box = LD.pill(c, L.t, x, y + h, L.c, 'left');
      placed.push(box);
    });
  }

  function drawEyeSide(c, xE) {
    const vis = xE <= WX1 - 1;
    const px = vis ? X(xE) : X(WX1 - 1.2), py = Y(0);
    const s = Math.max(9, 1.3 * Math.min(Lb.kx, Lb.ky) * 1.2);
    c.save();
    // 側面的眼睛：杏仁形眼瞼，瞳孔朝左
    c.beginPath();
    c.moveTo(px - s, py);
    c.quadraticCurveTo(px - s * 0.1, py - s * 0.85, px + s * 0.55, py - s * 0.15);
    c.lineTo(px + s * 0.55, py + s * 0.15);
    c.quadraticCurveTo(px - s * 0.1, py + s * 0.85, px - s, py);
    c.closePath();
    c.fillStyle = LD.dark ? '#e9eef0' : '#ffffff';
    c.fill();
    c.strokeStyle = LD.c.text; c.lineWidth = 1.4; c.stroke();
    c.beginPath(); c.ellipse(px - s * 0.62, py, s * 0.18, s * 0.42, 0, 0, 7);
    c.fillStyle = LD.c.text; c.fill();
    c.restore();
    if (!vis) LD.pill(c, T('眼睛在 ', 'Eye at ') + num(xE, 1) + ' cm →', Lb.w - 4, py - s - 4, LD.c.muted, 'right', '600 11px ' + FONT);
  }

  function drawRayDiagram(c, b) {
    const f = b.f, xLt = b.xLt, p = b.pTrue;
    const ys = 3 * Lb.kx; // 光線圖的鉛直比例：水平的 3 倍
    const Yr = function (y) { return Lb.oy - y * ys; };
    const h = PH;
    const xRight = WX1, xLeft = WX0;
    c.save();
    c.lineCap = 'round';
    c.beginPath(); c.rect(0, 0, Lb.w, Lb.railTop - 1); c.clip();   // 光線只畫在光凳上方
    const rays = [];
    rays.push({ yL: h, c: LD.c.pos });                       // 平行主軸
    rays.push({ yL: 0, c: LD.c.probe });                     // 經過光心
    if (Math.abs(p - f) > 1e-6) rays.push({ yL: h * f / (f - p), c: LD.c.neg }); // 經過（或射向）焦點 F，出射平行
    const s = b.sol;
    rays.forEach(function (r) {
      const u = (r.yL - h) / p, u2 = u - r.yL / f;
      c.strokeStyle = LD.alpha(r.c, 0.9); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(X(state.xO), Yr(h)); c.lineTo(X(xLt), Yr(r.yL));
      c.lineTo(X(xRight), Yr(r.yL + u2 * (xRight - xLt))); c.stroke();
      if (!s.atInfinity && !s.real) {
        c.setLineDash([4, 4]); c.strokeStyle = LD.alpha(r.c, 0.6); c.lineWidth = 1;
        c.beginPath(); c.moveTo(X(xLt), Yr(r.yL)); c.lineTo(X(Math.max(xLeft, b.xI - 3)), Yr(r.yL + u2 * (Math.max(xLeft, b.xI - 3) - xLt))); c.stroke();
        c.setLineDash([]);
      }
      // 射向焦點的光在透鏡前的延長（凹透鏡：射向另一側的 F）
    });
    // 物與像的箭頭
    LD.arrow(c, X(state.xO), Yr(0), X(state.xO), Yr(h), col.obj, 2.4);
    if (!s.atInfinity && b.xI > WX0 && b.xI < WX1) {
      LD.arrow(c, X(b.xI), Yr(0), X(b.xI), Yr(s.m * h), col.img, 2.4, s.real ? {} : { dash: [4, 3] });
    }
    // 焦點
    [[xLt - f, 'F'], [xLt + f, 'F′']].forEach(function (q) {
      if (q[0] < WX0 || q[0] > WX1) return;
      c.fillStyle = col.img;
      c.beginPath(); c.arc(X(q[0]), Lb.oy, 3.5, 0, 7); c.fill();
      LD.haloText(c, q[1], X(q[0]), Lb.oy + 14, col.img, 'center', 'alphabetic', '700 12px ' + FONT);
    });
    c.restore();
    LD.pill(c, T('光線圖：鉛直方向放大 3 倍', 'Ray diagram: vertical ×3'), 6, Lb.narrow ? 40 : 22, LD.c.muted, 'left', '600 11px ' + FONT);
  }

  function drawLoupe(c) {
    const it = state.sel;
    if (!present(it)) return;
    const x = posOf(it);
    const w = 132, h = Lb.loupeH, k = 80; // 放大後每 cm 80 px
    let bx = X(x) - w / 2;
    bx = Math.max(4, Math.min(Lb.w - w - 4, bx));
    const by = Lb.loupeY;
    const cx = X(x);
    c.save();
    // 連接到標線的小三角
    c.fillStyle = LD.alpha(LD.c.surface, 0.95);
    c.beginPath(); c.moveTo(cx - 5, by + 1); c.lineTo(cx + 5, by + 1); c.lineTo(cx, by - 5); c.closePath(); c.fill();
    c.shadowColor = LD.shadowInk(0.25); c.shadowBlur = 6; c.shadowOffsetY = 2;
    LD.roundRect(c, bx, by, w, h, 7);
    c.fillStyle = LD.dark ? LD.mix(LD.c.surface, '#ffffff', 0.06) : LD.c.surface; c.fill();
    c.shadowColor = 'transparent';
    c.strokeStyle = LD.alpha(LD.c.accent, 0.7); c.lineWidth = 1.2; c.stroke();
    c.clip();
    const mid = bx + w / 2;
    c.strokeStyle = LD.alpha(LD.c.text, 0.85); c.lineWidth = 1;
    c.beginPath();
    const lo = Math.floor((x - w / 2 / k) * 10), hi = Math.ceil((x + w / 2 / k) * 10);
    for (let i = lo; i <= hi; i++) {
      const xx = Math.round(mid + (i / 10 - x) * k) + 0.5;
      const L = i % 10 === 0 ? 14 : i % 5 === 0 ? 10 : 6;
      c.moveTo(xx, by); c.lineTo(xx, by + L);
    }
    c.stroke();
    c.fillStyle = LD.c.text; c.font = '600 10px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'top';
    for (let i = Math.ceil(lo / 10); i <= Math.floor(hi / 10); i++) {
      const xx = mid + (i - x) * k;
      if (i >= 0 && i <= 100 && Math.abs(xx - mid) > 24) c.fillText(String(i), xx, by + 15);
    }
    c.strokeStyle = LD.c.pos; c.lineWidth = 2;
    c.beginPath(); c.moveTo(mid, by); c.lineTo(mid, by + 20); c.stroke();
    c.font = '700 12px ' + FONT; c.textBaseline = 'bottom';
    LD.haloText(c, num(x, 1) + ' cm', mid, by + h - 3, LD.c.accent, 'center', 'bottom', '700 12px ' + FONT);
    c.restore();
  }

  function dimLine(c, xa, xb, y, text, color) {
    const a = X(xa), b = X(xb);
    if (Math.abs(b - a) < 2) return;
    c.save();
    c.strokeStyle = LD.alpha(color, 0.35); c.lineWidth = 1; c.setLineDash([2, 3]);
    c.beginPath(); c.moveTo(a, Lb.railBot + 2); c.lineTo(a, y + 5); c.moveTo(b, Lb.railBot + 2); c.lineTo(b, y + 5); c.stroke();
    c.restore();
    LD.arrow(c, (a + b) / 2, y, a, y, color, 1.6);
    LD.arrow(c, (a + b) / 2, y, b, y, color, 1.6);
    LD.pill(c, text, (a + b) / 2, y + 8, color, 'center', '600 12px ' + FONT);
  }
  function drawDims(c) {
    dimLine(c, state.xO, state.xL, Lb.dim1, 'p = ' + cm(state.xL - state.xO), col.obj);
    if (state.method === 'screen') dimLine(c, state.xL, state.xS, Lb.dim2, 'q = ' + cm(state.xS - state.xL), col.img);
    else dimLine(c, state.xL, state.xR, Lb.dim2, 'q = ' + cm(state.xR - state.xL), col.img);
  }

  // ---------- 插針法（方格紙俯視） ----------
  function pinLayout(w) {
    const k = Math.min((w - 16) / 64, 10.5);
    return { w: w, k: k, ox: w / 2, oy: 12 + 20 * k, h: Math.round(40 * k + 24), narrow: w < 560 };
  }
  function PX(x) { return Lp.ox + x * Lp.k; }
  function PY(s) { return Lp.oy - s * Lp.k; }

  function drawPinBoard() {
    const c = ctx, k = Lp.k, P = state.pin, f = fOf();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(c, Lp.w, Lp.h);
    // 保麗龍板與方格紙
    const bx0 = PX(-32), by0 = PY(20), bw = 64 * k, bh = 40 * k;
    c.save();
    c.shadowColor = LD.shadowInk(0.28); c.shadowBlur = 10; c.shadowOffsetY = 3;
    LD.roundRect(c, bx0 - 6, by0 - 6, bw + 12, bh + 12, 6);
    c.fillStyle = LD.dark ? LD.mix(LD.c.surface, '#ffffff', 0.12) : '#fbfbf8'; c.fill();
    c.restore();
    const paper = LD.dark ? LD.mix(LD.c['canvas-bg'], col.glass, 0.12) : LD.mix('#ffffff', col.glass, 0.1);
    c.fillStyle = paper; c.fillRect(bx0, by0, bw, bh);
    const gridLine = function (step, a) {
      c.beginPath();
      for (let x = -32; x <= 32 + 1e-9; x += step) { const xx = Math.round(PX(x) * dpr) / dpr + 0.5 / dpr; c.moveTo(xx, by0); c.lineTo(xx, by0 + bh); }
      for (let s = -20; s <= 20 + 1e-9; s += step) { const yy = Math.round(PY(s) * dpr) / dpr + 0.5 / dpr; c.moveTo(bx0, yy); c.lineTo(bx0 + bw, yy); }
      c.strokeStyle = LD.alpha(col.glass, a); c.lineWidth = 1 / dpr; c.stroke();
    };
    if (k >= 8) gridLine(0.1, LD.dark ? 0.1 : 0.09);
    gridLine(0.5, LD.dark ? 0.12 : 0.12);
    gridLine(1, LD.dark ? 0.28 : 0.26);
    gridLine(5, LD.dark ? 0.5 : 0.45);
    // 主軸與垂直線（學生畫的兩條直線）
    c.strokeStyle = LD.alpha(LD.c.text, 0.8); c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(bx0, PY(0)); c.lineTo(bx0 + bw, PY(0)); c.stroke();
    c.strokeStyle = LD.alpha(LD.c.text, 0.45); c.lineWidth = 1;
    c.beginPath(); c.moveTo(PX(0), by0); c.lineTo(PX(0), by0 + bh); c.stroke();
    LD.haloText(c, T('主軸', 'axis'), bx0 + bw - 4, PY(0) - 5, LD.c.muted, 'right', 'alphabetic', '600 11px ' + FONT);

    // 連線與交點
    const lined = P.lined;
    if (state.show.rays) drawPinAnswer(c);
    if (lined) {
      const xi = TL.lineAxis(P.A, P.B);
      c.save();
      c.strokeStyle = LD.alpha(LD.c.accent, 0.85); c.lineWidth = 1.6; c.setLineDash([7, 5]);
      const dx = P.B[0] - P.A[0], ds = P.B[1] - P.A[1], L = Math.hypot(dx, ds) || 1;
      const t0 = -80, t1 = 80;
      c.beginPath(); c.rect(bx0, by0, bw, bh); c.clip();
      c.beginPath(); c.moveTo(PX(P.A[0] + dx / L * t0), PY(P.A[1] + ds / L * t0)); c.lineTo(PX(P.A[0] + dx / L * t1), PY(P.A[1] + ds / L * t1)); c.stroke();
      c.restore();
      if (xi !== null && Math.abs(xi) <= 32) {
        const ix = PX(xi), iy = PY(0), r = 6;
        c.strokeStyle = col.img; c.lineWidth = 2.2;
        c.beginPath(); c.moveTo(ix - r, iy - r); c.lineTo(ix + r, iy + r); c.moveTo(ix - r, iy + r); c.lineTo(ix + r, iy - r); c.stroke();
        LD.haloText(c, 'I', ix - 9, iy - 5, col.img, 'right', 'alphabetic', 'italic 700 13px ' + FONT);
        pinDim(c, xi, 0, 1.6, 'q = ' + cm(TL.round1(xi)), col.img, true);
      }
    }
    pinDim(c, -P.p, 0, -1.6, 'p = ' + cm(P.p), col.obj);

    // 透鏡（俯視）
    drawLensTop(c, f > 0);
    LD.haloText(c, 'O', PX(0) - 6, PY(0) + 13, LD.c.muted, 'right', 'alphabetic', 'italic 700 12px ' + FONT);
    // 眼睛、針
    drawEyeTop(c, P.E, state.sel === 'E');
    pinHead(c, [-P.p, 0], col.pinP, 'P', state.sel === 'P');
    pinHead(c, P.A, col.pinA, 'A', state.sel === 'A');
    pinHead(c, P.B, col.pinB, 'B', state.sel === 'B');
    if (state.mode === 'error') LD.pill(c, T('含誤差：透鏡有球面像差', 'With errors: the lens has spherical aberration'), 6, 22, LD.c.muted, 'left', '600 11px ' + FONT);
  }
  function pinDim(c, xa, xb, s, text, color, up) {
    const a = PX(xa), b = PX(xb), y = PY(s);
    if (Math.abs(b - a) < 3) return;
    LD.arrow(c, (a + b) / 2, y, a, y, color, 1.4);
    LD.arrow(c, (a + b) / 2, y, b, y, color, 1.4);
    LD.pill(c, text, (a + b) / 2, up ? y - 4 : y + 19, color, 'center', '600 11px ' + FONT);
  }
  function drawLensTop(c, conv) {
    const k = Lp.k, px = PX(0), hh = R * k, tC = Math.max(7, 0.8 * k);
    LD.contactShadow(c, px + 2, PY(0) + 2, Math.max(4, tC * 0.8), 0);
    c.save();
    c.translate(0, 0);
    drawLensSide(c, px, PY(0), hh, conv, tC, 1.15);
    c.restore();
  }
  function pinHead(c, pt, color, name, sel) {
    const k = Lp.k, r = Math.max(4.5, PIN_HEAD * k * 1.2);
    const x = PX(pt[0]), y = PY(pt[1]);
    if (sel) {
      c.save(); c.strokeStyle = LD.alpha(LD.c.accent, 0.85); c.lineWidth = 2; c.setLineDash([3, 3]);
      c.beginPath(); c.arc(x, y, r + 6, 0, 7); c.stroke(); c.restore();
    }
    LD.contactShadow(c, x + 3, y + 3, r * 0.8, 0.2);
    LD.ball(c, x, y, r, color);
    LD.haloText(c, name, x + r + 3, y - r - 1, color, 'left', 'alphabetic', 'italic 700 13px ' + FONT);
  }
  function drawEyeTop(c, E, sel) {
    const x = PX(E[0]), y = PY(E[1]);
    const ang = Math.atan2(-(0 - E[1]), 0 - E[0]); // 畫面座標中指向 O 的方向
    const s = Math.max(11, 1.1 * Lp.k);
    c.save();
    c.translate(x, y); c.rotate(ang);
    if (sel) { c.strokeStyle = LD.alpha(LD.c.accent, 0.85); c.lineWidth = 2; c.setLineDash([3, 3]); c.beginPath(); c.arc(0, 0, s + 6, 0, 7); c.stroke(); c.setLineDash([]); }
    c.beginPath();
    c.moveTo(s, 0);
    c.quadraticCurveTo(0, -s * 0.8, -s * 0.6, -s * 0.1);
    c.lineTo(-s * 0.6, s * 0.1);
    c.quadraticCurveTo(0, s * 0.8, s, 0);
    c.closePath();
    c.fillStyle = LD.dark ? '#e9eef0' : '#ffffff'; c.fill();
    c.strokeStyle = LD.c.text; c.lineWidth = 1.4; c.stroke();
    c.beginPath(); c.arc(s * 0.35, 0, s * 0.28, 0, 7); c.fillStyle = LD.c.text; c.fill();
    c.restore();
    LD.haloText(c, T('觀測點', 'eye'), x, y + s + 12, LD.c.text, 'center', 'alphabetic', '600 11px ' + FONT);
  }
  /** 答案：由 P 經透鏡到觀測點的真實光線，以及它的反向延長線所指的像 */
  function drawPinAnswer(c) {
    const P = state.pin, f = fOf();
    const cr = TL.pinCrossing(f, P.p, P.E, LENS_HC, LENS_HC, EYE_H, saC());
    if (!cr.ok) return;
    const sL = cr.L[0];
    c.save();
    c.strokeStyle = LD.alpha(col.light, 0.95); c.lineWidth = 2;
    c.beginPath(); c.moveTo(PX(-P.p), PY(0)); c.lineTo(PX(0), PY(sL)); c.lineTo(PX(P.E[0]), PY(P.E[1])); c.stroke();
    const xi = TL.lineAxis([0, sL], P.E);
    if (xi !== null && isFinite(xi)) {
      c.setLineDash([4, 4]); c.strokeStyle = LD.alpha(col.img, 0.8); c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(PX(0), PY(sL)); c.lineTo(PX(xi), PY(0)); c.stroke();
      c.setLineDash([]);
      c.fillStyle = col.img; c.beginPath(); c.arc(PX(xi), PY(0), 4, 0, 7); c.fill();
      LD.pill(c, T('像 ', 'image ') + cm(xi, 2), PX(xi), P.lined ? PY(1.6) - 26 : PY(0) - 10, col.img, 'center', '600 11px ' + FONT);
    }
    if (Math.abs(sL) > R) LD.pill(c, T('這條光線沒有通過透鏡', 'This ray misses the lens'), PX(0), PY(sL) - 8, LD.c.pos, 'center', '600 11px ' + FONT);
    c.restore();
  }

  function drawMain() {
    if (!cv.width) return;
    if (state.method === 'pin') { if (Lp) drawPinBoard(); }
    else if (Lb) drawBench();
    drawKeyFocus();
  }
  /** 鍵盤選取的器材周圍畫虛線圓角框（--accent），只在畫布有鍵盤焦點時 */
  function drawKeyFocus() {
    if (!kb || !kb.focused()) return;
    const it = kbItems[kb.index()];
    if (!it) return;
    const id = it.id, c = ctx;
    if (state.method === 'pin' ? !Lp : !Lb) return;
    c.save();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.strokeStyle = LD.c.accent; c.lineWidth = 2; c.setLineDash([5, 4]);
    if (state.method === 'pin') {
      const pt = pinPt(id), x = PX(pt[0]), y = PY(pt[1]);
      const r = (id === 'E' ? Math.max(11, 1.1 * Lp.k) : Math.max(4.5, PIN_HEAD * Lp.k * 1.2)) + 11;
      LD.roundRect(c, x - r, y - r, 2 * r, 2 * r, 8);
    } else {
      const x = posOf(id), bo = BODY[id];
      const top = id === 'src' ? 4 : id === 'lens' ? R + 0.5 : id === 'screen' ? 5 : rodTop();
      const x0 = X(x - bo[0]) - 7, x1 = X(x + bo[1]) + 7, y0 = Y(top) - 7, y1 = Y(-12) + 7;
      LD.roundRect(c, x0, y0, x1 - x0, y1 - y0, 8);
    }
    c.stroke();
    c.restore();
  }

  // ======================= 放大圖（vcv） =======================
  let V = null;
  function viewLayout(w) {
    const narrow = w < 560;
    let h;
    if (state.method === 'screen') h = narrow ? Math.round(Math.min(w * 0.9, 340)) : 290;
    else if (state.method === 'parallax') h = narrow ? Math.round(Math.min(w * 0.82, 300)) + 130 : 300;
    else h = narrow ? 270 : 300;
    return { w: w, h: h, narrow: narrow };
  }
  function resizeView() {
    V = viewLayout(vcv.clientWidth || 300);
    setupCanvas(vcv, V.h);
    vcv.style.touchAction = 'pan-y';
    drawView();
  }

  /** 光源屏的鏤空圖案（光源座標 s 向右、y 向上，cm）：上有箭頭的直桿、向右的小旗、底座短橫桿 */
  function patternPath(c) {
    c.beginPath();
    c.rect(-0.09, -1.2, 0.18, 2.05);               // 直桿
    c.moveTo(-0.33, 0.83); c.lineTo(0.33, 0.83); c.lineTo(0, 1.2); c.closePath(); // 箭頭
    c.moveTo(0.09, 0.78); c.lineTo(0.74, 0.52); c.lineTo(0.09, 0.26); c.closePath(); // 小旗
    c.rect(-0.38, -1.2, 0.76, 0.16);               // 底座
  }
  function withAffine(c, ax, bx, ay, by, fn) {
    c.save();
    c.setTransform(dpr * ax, 0, 0, dpr * ay, dpr * bx, dpr * by);
    fn(c);
    c.restore();
  }

  function drawView() {
    if (!V || !vcv.width) return;
    const c = vctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, V.w, V.h);
    LD.backdrop(c, V.w, V.h);
    if (state.method === 'screen') drawScreenView(c);
    else if (state.method === 'parallax') drawParallaxView(c);
    else drawPinEye(c);
  }

  // ---------- 像屏放大圖 ----------
  function drawScreenView(c) {
    const b = bench(), s = b.sol;
    const narrow = V.narrow;
    const S = narrow ? Math.min(V.w - 96, V.h - 34) : V.h - 40;
    const sx = narrow ? 10 : Math.max(14, V.w * 0.5 - S - 14), sy = 26;
    const K = S / 10; // px per cm（像屏 10 cm × 10 cm）
    // 標題
    LD.haloText(c, T('像屏（從透鏡這一側看）', 'Screen (seen from the lens side)'), sx, sy - 9, LD.c.text, 'left', 'alphabetic', '600 12px ' + FONT);
    // 屏面（暗室中的白屏：灰色）
    c.save();
    c.shadowColor = LD.shadowInk(0.3); c.shadowBlur = 10; c.shadowOffsetY = 3;
    LD.roundRect(c, sx, sy, S, S, 4);
    const base = LD.dark ? LD.mix(LD.c['canvas-bg'], '#ffffff', 0.12) : LD.mix(LD.c.text, '#ffffff', 0.62);
    c.fillStyle = base; c.fill();
    c.restore();
    c.save();
    LD.roundRect(c, sx, sy, S, S, 4); c.clip();
    // 光：清楚的像與模糊圓斑的疊合
    const cx = sx + S / 2, cy = sy + S / 2;
    const blurPx = isFinite(b.blur) ? b.blur * K : 0;
    const m = s.atInfinity ? 1 : s.m;
    const bright = s.atInfinity ? 0.25 : Math.sqrt(Math.min(1, Math.max(0.02, TL.relBrightness(m))));
    // 從透鏡這一側看像屏、也從透鏡這一側看光源屏：實像（m < 0）看起來只有上下顛倒
    paintBlurred(c, sx, sy, S, S, cx, cy, -m * K, -m * K, blurPx, bright, s);
    // 方格（印在屏上）
    c.globalCompositeOperation = 'source-over';
    const gl = function (step, a) {
      c.beginPath();
      for (let i = 0; i <= 10 / step + 1e-9; i++) {
        const v = Math.round((sx + i * step * K) * dpr) / dpr + 0.5 / dpr, h = Math.round((sy + i * step * K) * dpr) / dpr + 0.5 / dpr;
        c.moveTo(v, sy); c.lineTo(v, sy + S); c.moveTo(sx, h); c.lineTo(sx + S, h);
      }
      c.strokeStyle = LD.alpha(LD.dark ? '#ffffff' : LD.c.text, a); c.lineWidth = 1 / dpr; c.stroke();
    };
    if (K >= 18) gl(0.1, 0.05);
    gl(0.5, 0.09);
    gl(1, 0.2);
    c.restore();
    c.strokeStyle = LD.alpha(LD.c.text, 0.35); c.lineWidth = 1;
    LD.roundRect(c, sx + 0.5, sy + 0.5, S - 1, S - 1, 4); c.stroke();
    // 像很小時：在角落放一個圓形放大鏡，看清楚像的細節（正倒、清楚與否）
    const hImg = s.atInfinity ? Infinity : Math.abs(m) * PH;
    if (s.real && hImg < 0.5 && blurPx < 30) {
      const rL = Math.round(S * 0.19), lx = sx + rL + 8, ly = sy + rL + 8;
      const Z = Math.max(2, Math.min(12, 0.7 * rL / (K * hImg)));
      c.save();
      c.beginPath(); c.arc(lx, ly, rL, 0, 7);
      c.fillStyle = base; c.fill();
      c.clip();
      c.beginPath();
      const mm = K * Z * 0.1;
      for (let i = -Math.ceil(rL / mm); i <= Math.ceil(rL / mm); i++) {
        const v = Math.round((lx + i * mm) * dpr) / dpr + 0.5 / dpr, h = Math.round((ly + i * mm) * dpr) / dpr + 0.5 / dpr;
        c.moveTo(v, ly - rL); c.lineTo(v, ly + rL); c.moveTo(lx - rL, h); c.lineTo(lx + rL, h);
      }
      c.strokeStyle = LD.alpha(LD.dark ? '#ffffff' : LD.c.text, 0.12); c.lineWidth = 1 / dpr; c.stroke();
      paintBlurred(c, lx - rL, ly - rL, 2 * rL, 2 * rL, lx, ly, -m * K * Z, -m * K * Z, blurPx * Z, bright, s);
      c.restore();
      c.beginPath(); c.arc(lx, ly, rL, 0, 7);
      c.strokeStyle = LD.alpha(LD.c.accent, 0.85); c.lineWidth = 2; c.stroke();
      LD.pill(c, '×' + Math.round(Z) + T('（方格 1 mm）', ' (1 mm grid)'), lx, ly + rL + 18, LD.c.accent, 'center', '600 10px ' + FONT);
    }
    // 標示
    const sharp = isFinite(b.blur) && b.blur <= SHARP && !s.atInfinity && s.real;
    let tag = null;
    if (s.atInfinity || !s.real) tag = [T('找不到清楚的像', 'no sharp image anywhere'), LD.c.pos];
    else if (sharp) tag = [T('清楚', 'sharp'), LD.c.probe];
    else if (b.blur > 0.6) tag = [T('模糊', 'blurred'), LD.c.muted];
    if (tag) LD.pill(c, tag[0], sx + 6, sy + S - 6, tag[1], 'left', '700 12px ' + FONT);
    if (ideal() && isFinite(b.blur)) LD.pill(c, T('模糊圓斑 ', 'blur disc ') + num(b.blur * 10, b.blur < 1 ? 2 : 1) + ' mm', sx + S - 6, sy + S - 6, LD.c.muted, 'right', '600 11px ' + FONT);
    LD.pill(c, '1 cm', sx + S - 6, sy + 22, LD.c.muted, 'right', '600 10px ' + FONT);

    // 光源屏（比較用）
    const S2 = narrow ? Math.min(70, V.w - S - 30) : Math.round(S * 0.62);
    const tx = narrow ? sx + S + 10 : sx + S + 28, ty = narrow ? sy + 4 : sy + (S - S2) / 2 + 6;
    if (!narrow) LD.haloText(c, T('光源屏（從透鏡這一側看）', 'Source (seen from the lens side)'), tx, ty - 9, LD.c.text, 'left', 'alphabetic', '600 12px ' + FONT);
    const K2 = S2 / 8;
    c.save();
    c.shadowColor = LD.shadowInk(0.3); c.shadowBlur = 6; c.shadowOffsetY = 2;
    LD.roundRect(c, tx, ty, S2, S2, 4);
    c.fillStyle = LD.mix(LD.c.field, '#000000', LD.dark ? 0.75 : 0.35); c.fill();
    c.restore();
    withAffine(c, K2, tx + S2 / 2, -K2, ty + S2 / 2, function (g) {
      g.shadowColor = col.lightHi; g.shadowBlur = 8 * dpr;
      g.fillStyle = col.lightHi; patternPath(g); g.fill();
    });
    if (narrow) LD.pill(c, T('光源屏', 'source'), tx + S2 / 2, ty + S2 + 18, LD.c.muted, 'center', '600 10px ' + FONT);
    else LD.haloText(c, T('像高 ÷ 物高 = |m|（物高 2.4 cm）', 'image height ÷ 2.4 cm = |m|'), tx, ty + S2 + 18, LD.c.muted, 'left', 'alphabetic', '11px ' + FONT);
  }

  /** 畫出模糊的像：清楚的圖案與直徑 blurPx 的圓斑疊合（以多次平移取樣近似），亮度 bright */
  function paintBlurred(c, x0, y0, w, h, cx, cy, ax, ay, blurPx, bright, s) {
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (blurCv.width !== W) blurCv.width = W;
    if (blurCv.height !== H) blurCv.height = H;
    const g = blurC;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    const color = col.lightHi;
    const ext = (s.atInfinity ? 0 : Math.abs(s.m)) * PH * Math.abs(ax / (s.atInfinity ? 1 : s.m)); // 像的半高（px）
    if (blurPx > 34 || s.atInfinity) {
      // 圓斑遠大於圖案：只剩一團均勻的光
      const rr = blurPx / 2 + (s.atInfinity ? 0 : ext * 0.6);
      const I = Math.min(1, bright * (s.atInfinity ? 0.5 : 1) * 1.8 * Math.pow(Math.max(ext, 6) / Math.max(rr, 1), 2));
      const gr = g.createRadialGradient((cx - x0) * dpr, (cy - y0) * dpr, 0, (cx - x0) * dpr, (cy - y0) * dpr, rr * dpr);
      gr.addColorStop(0, LD.alpha(color, Math.max(0.2, I)));
      gr.addColorStop(0.85, LD.alpha(color, Math.max(0.17, I * 0.85)));
      gr.addColorStop(1, LD.alpha(color, 0));
      g.fillStyle = gr;
      g.beginPath(); g.arc((cx - x0) * dpr, (cy - y0) * dpr, rr * dpr, 0, 7); g.fill();
    } else {
      const N = blurPx < 0.6 ? 1 : Math.min(72, Math.ceil(blurPx * 2.2) + 4);
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < N; i++) {
        const rr = N === 1 ? 0 : blurPx / 2 * Math.sqrt((i + 0.5) / N), th = i * golden;
        const ox = rr * Math.cos(th), oy = rr * Math.sin(th);
        g.setTransform(dpr * ax, 0, 0, dpr * ay, dpr * (cx - x0 + ox), dpr * (cy - y0 + oy));
        g.globalAlpha = Math.min(1, bright / N * (N > 1 ? 1.15 : 1));
        g.fillStyle = color;
        patternPath(g); g.fill();
      }
      g.globalAlpha = 1;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.drawImage(blurCv, x0, y0, w, h);
    c.restore();
  }

  // ---------- 視差法：眼睛看到的景象 ----------
  function drawParallaxView(c) {
    const b = bench(), f = b.f, xLt = b.xLt, xE = b.xE, d = b.d, sE = b.sE;
    const narrow = V.narrow;
    const PW = narrow ? V.w : Math.min(V.h + 40, V.w * 0.48);
    const PHh = narrow ? V.h - 130 : V.h;
    const cx = PW / 2, cy = PHh * (state.xR > xLt ? 0.42 : 0.56);   // 短桿在鏡框下方：視野中心往上移，讓短桿看得到
    const rimPx = Math.min(PW, PHh) * 0.3;
    const K = rimPx / (R / d);       // px per rad
    const ac = -sE / d;               // 透鏡中心的方向
    const toX = function (a) { return cx + (a - ac) * K; };
    const toY = function (bb) { return cy - bb * K; };
    // 背景（暗房的牆）
    c.save();
    LD.roundRect(c, 4, 4, PW - 8, PHh - 8, 8); c.clip();
    const wall = c.createLinearGradient(0, 0, 0, PHh);
    wall.addColorStop(0, LD.dark ? LD.mix(LD.c['canvas-bg'], '#000000', 0.25) : LD.mix(LD.c.text, '#ffffff', 0.78));
    wall.addColorStop(1, LD.dark ? LD.mix(LD.c['canvas-bg'], '#ffffff', 0.04) : LD.mix(LD.c.text, '#ffffff', 0.7));
    c.fillStyle = wall; c.fillRect(0, 0, PW, PHh);
    // 光凳（往遠處縮小）
    const xNear = Math.min(100, xE - 2), xFar = 0;
    const railPt = function (x, s0, y0) { const D = xE - x; return [toX((s0 - sE) / D), toY(y0 / D)]; };
    const q1 = railPt(xFar, -2, -12), q2 = railPt(xFar, 2, -12), q3 = railPt(xNear, 2, -12), q4 = railPt(xNear, -2, -12);
    c.fillStyle = LD.mix(col.metal, LD.c['canvas-bg'], 0.25);
    c.beginPath(); c.moveTo(q1[0], q1[1]); c.lineTo(q2[0], q2[1]); c.lineTo(q3[0], q3[1]); c.lineTo(q4[0], q4[1]); c.closePath(); c.fill();
    // 物件（由遠到近）：光源屏組、參考物
    const objs = [{ kind: 'src', x: state.xO }];
    objs.push({ kind: 'rod', x: state.xR });
    objs.sort(function (a, bb) { return a.x - bb.x; });
    const rimPath = function (g) { g.beginPath(); g.arc(cx, cy, rimPx, 0, Math.PI * 2); };
    // 先畫透鏡後方的物件：鏡外直接看到的部分
    objs.forEach(function (o) {
      if (o.x >= xLt) return;
      c.save();
      c.beginPath(); c.rect(0, 0, PW, PHh); c.arc(cx, cy, rimPx, 0, Math.PI * 2, true); c.clip('evenodd');
      const D = xE - o.x;
      drawObjPlane(c, o.kind, K / D, toX((0 - sE) / D), K / D, cy, false, D);
      c.restore();
    });
    // 鏡框內：透過透鏡看到的像
    c.save();
    rimPath(c); c.clip();
    const tint = c.createRadialGradient(cx, cy, rimPx * 0.2, cx, cy, rimPx);
    tint.addColorStop(0, LD.alpha(col.glass, LD.dark ? 0.08 : 0.05));
    tint.addColorStop(1, LD.alpha(col.glass, LD.dark ? 0.2 : 0.14));
    c.fillStyle = tint; c.fillRect(cx - rimPx, cy - rimPx, 2 * rimPx, 2 * rimPx);
    let imgInfo = null, rodImg = null;
    objs.forEach(function (o) {
      if (o.x >= xLt) return;
      const p = xLt - o.x;
      const k = 1 + d / p - d / f;
      if (Math.abs(k) < 0.03) return;            // 眼睛恰在這個物體的實像上：一片模糊
      const g = 1 / (p * k);                     // rad / cm
      const a0 = sE * (1 / k - 1) / d;
      drawObjPlane(c, o.kind, K * g, toX(a0), K * g, cy, true, xE - (xLt + TL.imageDistance(p, f)));
      if (o.kind === 'src') imgInfo = { x: toX(a0), g: g };
      else rodImg = { x: toX(a0), g: g };
    });
    // 玻璃的光澤
    const sh = c.createLinearGradient(cx - rimPx, cy - rimPx, cx + rimPx, cy + rimPx);
    sh.addColorStop(0, 'rgba(255,255,255,' + (LD.dark ? 0.1 : 0.22) + ')');
    sh.addColorStop(0.4, 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(0,0,0,' + (LD.dark ? 0.12 : 0.06) + ')');
    c.fillStyle = sh; c.fillRect(cx - rimPx, cy - rimPx, 2 * rimPx, 2 * rimPx);
    c.restore();
    // 鏡框（金屬環）與支桿
    c.save();
    c.fillStyle = col.metal;
    c.fillRect(cx - 3, cy + rimPx + 3, 6, PHh);
    c.lineWidth = Math.max(5, rimPx * 0.07);
    c.strokeStyle = col.metal;
    c.beginPath(); c.arc(cx, cy, rimPx + c.lineWidth / 2, 0, 7); c.stroke();
    c.lineWidth = 1.2; c.strokeStyle = LD.alpha(LD.shade(col.metal, 0.6), 0.6);
    c.beginPath(); c.arc(cx, cy, rimPx + 1, Math.PI * 1.05, Math.PI * 1.6); c.stroke();
    c.restore();
    // 透鏡前方的參考物（看實像時放在透鏡與眼睛之間）
    let rodX = null;
    if (state.xR > xLt) {
      const D = xE - state.xR;
      drawObjPlane(c, 'rod', K / D, toX(-sE / D), K / D, cy, false, D, rodTop());
      rodX = toX(-sE / D);
    } else rodX = toX(-sE / (xE - state.xR));
    // 輔助線：通過像的中心的鉛直虛線
    const imgVis = imgInfo && Math.abs(imgInfo.x - cx) < rimPx;
    if (state.show.guide && imgVis) {
      c.save();
      c.setLineDash([5, 5]); c.strokeStyle = LD.alpha(col.img, 0.85); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(imgInfo.x, cy + rimPx); c.lineTo(imgInfo.x, 6); c.stroke();
      c.restore();
    }
    // 標籤
    if (imgVis) {
      const real = b.sol.real;
      LD.pill(c, real ? T('光源屏的實像', 'real image') : T('光源屏的虛像', 'virtual image'), Math.min(PW - 8, imgInfo.x + 12), cy + rimPx * 0.62, col.img, 'left', '600 11px ' + FONT);
    } else {
      LD.pill(c, T('鏡中看不到像', 'no image in the lens'), cx, cy + 8, LD.c.pos, 'center', '600 11px ' + FONT);
    }
    // 視差的數字提示（理想時）放左上角；參考物的標籤避開它
    let offBox = null;
    if (ideal() && imgVis && isFinite(b.xI)) {
      const off = TL.parallaxOffset(xE, b.xI, state.xR, sE);
      const sense = TL.parallaxSense(xE, b.xI, state.xR, 0.05);
      const txt = sense === 'none' ? T('沒有視差', 'no parallax') : T('錯開 ', 'apart ') + num(off * 10, 2) + ' mm';
      offBox = LD.pill(c, txt, 10, 26, sense === 'none' ? LD.c.probe : LD.c.muted, 'left', '700 11px ' + FONT);
    }
    const front = state.xR > xLt;
    const rAlign = rodX > PW * 0.6 ? 'right' : 'left', rx = Math.max(8, Math.min(PW - 8, rodX + (rAlign === 'right' ? -8 : 8)));
    let ry = front ? PHh - 34 : 26;
    if (offBox && !front && rx - 4 < offBox.x + offBox.w && (rAlign === 'left' || rx - 140 < offBox.x + offBox.w)) ry = 50;
    LD.pill(c, front ? T('參考物（短桿，鏡框下方）', 'rod (short, below the rim)') : T('參考物（鏡外）', 'rod (outside the lens)'), rx, ry, col.rod, rAlign, '600 11px ' + FONT);
    if (rodImg && Math.abs(rodImg.x - cx) < rimPx * 0.95 && state.xR < xLt) {
      LD.pill(c, T('參考物在鏡中的像（不要看它）', 'the rod’s own image (ignore)'), cx, cy - rimPx * 0.55, LD.c.muted, 'center', '600 10px ' + FONT);
    }
    // 頭的位置
    const hy = PHh - 12, hx = cx + state.head * Math.min(PW * 0.3, 70);
    c.strokeStyle = LD.alpha(LD.c.muted, 0.6); c.lineWidth = 1;
    c.beginPath(); c.moveTo(cx - Math.min(PW * 0.3, 70), hy); c.lineTo(cx + Math.min(PW * 0.3, 70), hy); c.stroke();
    LD.ball(c, hx, hy, 6, LD.c.text, { shadow: false });
    LD.haloText(c, T('頭', 'head'), hx, hy - 10, LD.c.muted, 'center', 'alphabetic', '600 10px ' + FONT);
    if (vkb && vkb.focused()) {
      c.save(); c.strokeStyle = LD.c.accent; c.lineWidth = 2; c.setLineDash([5, 4]);
      LD.roundRect(c, hx - 17, hy - 24, 34, 32, 8); c.stroke(); c.restore();
    }
    c.restore();

    // 俯視示意
    const tx = narrow ? 0 : PW + 10, ty = narrow ? PHh + 4 : 0, tw = narrow ? V.w : V.w - PW - 10, th = narrow ? 124 : V.h;
    drawTopSchematic(c, tx, ty, tw, th, b);
  }

  /**
   * 畫一個物件平面（光源屏組或參考物）。物件座標 (s, y) → 畫面 (bx + gx·s, by − gy·y)。
   * throughLens：在鏡內看到的像（物件的形狀照樣畫，變換已包含放大率與正倒）。
   */
  function drawObjPlane(c, kind, gx, bx, gy, by, throughLens, dist, top) {
    const rt = top == null ? TL.ROD_TOP : top;
    if (kind === 'src') {
      // 燈光的漫射光暈、黑色光源屏、發亮的鏤空圖案
      withAffine(c, gx, bx, -gy, by, function (g) {
        const halo = g.createRadialGradient(0, 0, 2, 0, 0, 7.5);
        halo.addColorStop(0, LD.alpha(col.light, LD.dark ? 0.35 : 0.3));
        halo.addColorStop(1, LD.alpha(col.light, 0));
        g.fillStyle = halo; g.fillRect(-8, -8, 16, 16);
        g.fillStyle = LD.mix(LD.c.field, '#000000', LD.dark ? 0.75 : 0.45);
        g.fillRect(-4, -4, 8, 8);
        g.fillRect(-0.3, -12, 0.6, 8);   // 支桿
        g.shadowColor = col.lightHi; g.shadowBlur = 10 * dpr;
        g.fillStyle = col.lightHi;
        patternPath(g); g.fill();
      });
    } else {
      withAffine(c, gx, bx, -gy, by, function (g) {
        const gr = g.createLinearGradient(-0.2, 0, 0.2, 0);
        gr.addColorStop(0, LD.shade(col.rod, 0.45));
        gr.addColorStop(0.45, col.rod);
        gr.addColorStop(1, LD.shade(col.rod, -0.35));
        g.fillStyle = gr;
        g.fillRect(-0.2, -9.6, 0.4, 9.6 + rt);
        g.fillStyle = LD.shade(col.rod, -0.2);
        g.beginPath(); g.ellipse(0, rt, 0.2, 0.1, 0, 0, 7); g.fill();
        g.fillStyle = col.metal; g.fillRect(-0.9, -12, 1.8, 2.4);  // 臺座
      });
    }
  }

  function drawTopSchematic(c, x0, y0, w, h, b) {
    c.save();
    LD.roundRect(c, x0 + 4, y0 + 4, w - 8, h - 8, 8);
    c.fillStyle = LD.alpha(LD.c.surface, LD.dark ? 0.35 : 0.6); c.fill();
    c.strokeStyle = LD.alpha(LD.c.border, 0.9); c.lineWidth = 1; c.stroke();
    c.clip();
    const xE = b.xE, xLt = b.xLt;
    const xa = Math.min(state.xO, state.xR) - 4, xb = xE + 5;
    const k = (w - 30) / (xb - xa);
    let lat = 4; // 左右方向放大（透鏡要放得進示意圖）
    while (lat > 1 && R * k * lat > h / 2 - 34) lat--;
    const sy = function (s) { return y0 + h / 2 + 8 - s * k * lat; };
    const sx = function (x) { return x0 + 15 + (x - xa) * k; };
    c.strokeStyle = LD.alpha(LD.c.muted, 0.5); c.setLineDash([4, 4]);
    c.beginPath(); c.moveTo(sx(xa), sy(0)); c.lineTo(sx(xb), sy(0)); c.stroke(); c.setLineDash([]);
    // 光源屏、透鏡、參考物
    c.fillStyle = LD.alpha(LD.mix(LD.c.field, '#000000', 0.3), 0.7);
    c.fillRect(sx(state.xO) - 1.5, sy(4), 3, sy(-4) - sy(4));
    c.fillStyle = LD.alpha(col.glass, 0.35); c.strokeStyle = col.glass; c.lineWidth = 1.2;
    c.beginPath(); c.ellipse(sx(xLt), sy(0), 3, R * k * lat, 0, 0, 7); c.fill(); c.stroke();
    LD.ball(c, sx(state.xR), sy(0), 4, col.rod, { shadow: false });
    const tag = function (t, x, y, color) { LD.haloText(c, t, x, y, color, 'center', 'alphabetic', '600 10px ' + FONT); };
    tag(T('光源屏', 'source'), sx(state.xO), sy(-4) + 13, LD.c.muted);
    tag(T('透鏡', 'lens'), sx(xLt), sy(-R) + 13, col.glass);
    tag(T('參考物', 'rod'), sx(state.xR), sy(0) - 9, col.rod);
    // 眼睛：目前位置與擺動範圍
    const sE = b.sE, A = b.A;
    c.strokeStyle = LD.alpha(LD.c.text, 0.3); c.lineWidth = 2;
    c.beginPath(); c.moveTo(sx(xE), sy(-A)); c.lineTo(sx(xE), sy(A)); c.stroke();
    // 進入眼睛的兩條視線：直接來自參考物、來自透鏡（光源屏中心的光）
    const L = TL.lensCrossing(b.f, b.pTrue, b.d, [0, 0], [sE, 0], 0).L[0];
    c.lineWidth = 1.6;
    c.strokeStyle = LD.alpha(col.rod, 0.9);
    c.beginPath(); c.moveTo(sx(state.xR), sy(0)); c.lineTo(sx(xE), sy(sE)); c.stroke();
    c.strokeStyle = LD.alpha(col.light, 0.95);
    c.beginPath(); c.moveTo(sx(state.xO), sy(0)); c.lineTo(sx(xLt), sy(L)); c.lineTo(sx(xE), sy(sE)); c.stroke();
    if (state.show.rays && isFinite(b.xI)) {
      c.setLineDash([4, 4]); c.strokeStyle = LD.alpha(col.img, 0.8); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(sx(xLt), sy(L)); c.lineTo(sx(b.xI), sy(0)); c.stroke(); c.setLineDash([]);
      c.fillStyle = col.img; c.beginPath(); c.arc(sx(b.xI), sy(0), 3.5, 0, 7); c.fill();
    }
    LD.ball(c, sx(xE), sy(sE), 5, LD.c.text, { shadow: false });
    LD.haloText(c, T('眼', 'eye'), sx(xE), sy(sE) - 9, LD.c.text, 'center', 'alphabetic', '600 11px ' + FONT);
    LD.haloText(c, T('俯視示意（左右方向放大 ', 'Top view (sideways ×') + lat + T(' 倍）', ')'), x0 + 12, y0 + 20, LD.c.muted, 'left', 'alphabetic', '600 11px ' + FONT);
    c.restore();
  }

  // ---------- 插針法：從觀測點看到的景象 ----------
  function drawPinEye(c) {
    const P = state.pin, f = fOf(), E = P.E, sa = saC();
    const W = V.w, H = V.h;
    const dist = Math.hypot(E[0], E[1]);
    const fx = -E[0] / dist, fs = -E[1] / dist;      // 前方（指向 O）
    const rx = fs, rs = -fx;                          // 右方
    const cx = W / 2, cy = H * 0.5;
    const rho = Math.min(H * 0.3, W * 0.3);
    const F = rho * dist / R;
    const proj = function (x, s, y) {
      const dx = x - E[0], ds = s - E[1];
      const dep = dx * fx + ds * fs;
      if (dep < 0.2) return null;
      return [cx + F * (dx * rx + ds * rs) / dep, cy - F * (y - EYE_H) / dep, dep];
    };
    c.save();
    LD.roundRect(c, 4, 4, W - 8, H - 8, 8); c.clip();
    // 牆與桌面
    const wall = c.createLinearGradient(0, 0, 0, cy);
    wall.addColorStop(0, LD.dark ? LD.mix(LD.c['canvas-bg'], '#000000', 0.2) : LD.mix(LD.c.text, '#ffffff', 0.86));
    wall.addColorStop(1, LD.dark ? LD.mix(LD.c['canvas-bg'], '#ffffff', 0.05) : LD.mix(LD.c.text, '#ffffff', 0.8));
    c.fillStyle = wall; c.fillRect(0, 0, W, cy);
    const paper = LD.dark ? LD.mix(LD.c['canvas-bg'], col.glass, 0.14) : LD.mix('#ffffff', col.glass, 0.12);
    c.fillStyle = paper; c.fillRect(0, cy, W, H - cy);
    // 方格紙上的格線（透視）
    const segLine = function (a, bb, step) {
      // 由 a 到 bb 取樣，去掉眼睛後方的部分
      const pts = [];
      for (let i = 0; i <= step; i++) {
        const t = i / step;
        pts.push(proj(a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, 0));
      }
      let open = false;
      pts.forEach(function (p) {
        if (!p) { open = false; return; }
        if (!open) { c.moveTo(p[0], p[1]); open = true; } else c.lineTo(p[0], p[1]);
      });
    };
    c.save();
    c.beginPath(); c.rect(0, 0, W, H); c.arc(cx, cy, 0.001, 0, 7); // 佔位（鏡框外的剪裁在下面另外做）
    c.beginPath();
    for (let x = -32; x <= 32; x += 2) segLine([x, -20], [x, 20], 24);
    for (let s = -20; s <= 20; s += 2) segLine([-32, s], [32, s], 32);
    c.strokeStyle = LD.alpha(col.glass, LD.dark ? 0.28 : 0.22); c.lineWidth = 1; c.stroke();
    c.beginPath(); segLine([-32, 0], [32, 0], 40);
    c.strokeStyle = LD.alpha(LD.c.text, 0.7); c.lineWidth = 1.6; c.stroke();
    c.restore();
    // 鏡框（透鏡平面上的圓）
    const rim = [];
    for (let i = 0; i < 48; i++) { const t = i / 48 * Math.PI * 2; const p = proj(0, R * Math.cos(t), LENS_HC + R * Math.sin(t)); if (p) rim.push(p); }
    const rimPath = function (g) { g.beginPath(); rim.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.closePath(); };
    const okRim = rim.length === 48;
    // 鏡外直接看到的 P
    const drawPin = function (x, s, color, name, alpha) {
      const top = proj(x, s, PIN_H), bot = proj(x, s, 0);
      if (!top || !bot) return null;
      const wpx = Math.max(1.2, F * 0.07 / top[2]);
      c.save();
      c.globalAlpha = alpha == null ? 1 : alpha;
      const gr = c.createLinearGradient(top[0] - wpx, 0, top[0] + wpx, 0);
      gr.addColorStop(0, LD.shade(col.metal, 0.6)); gr.addColorStop(1, LD.shade(col.metal, -0.1));
      c.fillStyle = gr;
      c.fillRect(top[0] - wpx / 2, top[1], wpx, bot[1] - top[1]);
      const hr = Math.max(3, F * PIN_HEAD / top[2]);
      LD.ball(c, top[0], top[1], hr, color, { shadow: false });
      c.restore();
      return { x: top[0], y: top[1], r: hr, dep: top[2] };
    };
    if (okRim) {
      c.save();
      c.beginPath(); c.rect(0, 0, W, H); rim.slice().reverse().forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.closePath();
      c.clip('evenodd');
      drawPin(-P.p, 0, col.pinP, 'P');
      c.restore();
    }
    // 鏡內：P 的像與主軸的像
    let Ix = null;
    if (okRim) {
      c.save();
      rimPath(c); c.clip();
      c.fillStyle = LD.alpha(col.glass, LD.dark ? 0.14 : 0.08);
      c.fillRect(0, 0, W, H);
      // 主軸（方格紙上的線）的像
      c.beginPath();
      let open = false;
      for (let i = 0; i <= 60; i++) {
        const xo = -0.3 - i * 0.5;
        const cr = TL.pinCrossing(f, -xo, E, 0, LENS_HC, EYE_H, sa);
        const pp = cr.ok ? proj(0, cr.L[0], LENS_HC + cr.L[1]) : null;
        if (!pp) { open = false; continue; }
        if (!open) { c.moveTo(pp[0], pp[1]); open = true; } else c.lineTo(pp[0], pp[1]);
      }
      c.strokeStyle = LD.alpha(LD.c.text, 0.55); c.lineWidth = 1.4; c.stroke();
      // P 的像：針身與針頭
      const im = function (y) { const cr = TL.pinCrossing(f, P.p, E, y, LENS_HC, EYE_H, sa); return cr.ok ? proj(0, cr.L[0], LENS_HC + cr.L[1]) : null; };
      const t = im(PIN_H), bo = im(0), hc = im(LENS_HC);
      if (t && bo) {
        const wpx = Math.max(1, Math.abs(t[1] - bo[1]) / PIN_H * 0.07);
        c.strokeStyle = LD.shade(col.metal, 0.3); c.lineWidth = wpx;
        c.beginPath(); c.moveTo(t[0], t[1]); c.lineTo(bo[0], bo[1]); c.stroke();
        const hr = Math.max(2.5, Math.abs(t[1] - bo[1]) / PIN_H * PIN_HEAD);
        LD.ball(c, t[0], t[1], hr, col.pinP, { shadow: false });
        Ix = hc ? hc[0] : t[0];
      }
      // 玻璃光澤
      const bb = rim.reduce(function (a, p) { return [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])]; }, [1e9, 1e9, -1e9, -1e9]);
      const sh = c.createLinearGradient(bb[0], bb[1], bb[2], bb[3]);
      sh.addColorStop(0, 'rgba(255,255,255,' + (LD.dark ? 0.12 : 0.28) + ')');
      sh.addColorStop(0.45, 'rgba(255,255,255,0)');
      c.fillStyle = sh; c.fillRect(bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1]);
      c.restore();
      rimPath(c);
      c.strokeStyle = LD.alpha(LD.shade(col.glass, LD.dark ? 0.3 : -0.2), 0.9); c.lineWidth = 2.2; c.stroke();
      // 透鏡的底座
      const base = proj(0, 0, 0);
      if (base) { c.fillStyle = col.metal; c.fillRect(base[0] - 10, base[1] - 3, 20, 5); }
    }
    // 鏡前的針（遠的先畫）
    const front = [{ p: P.A, c: col.pinA, n: 'A' }, { p: P.B, c: col.pinB, n: 'B' }].map(function (o) {
      const dx = o.p[0] - E[0], ds = o.p[1] - E[1];
      o.dep = dx * fx + ds * fs; return o;
    }).sort(function (a, bb) { return bb.dep - a.dep; });
    const shown = {};
    front.forEach(function (o) { shown[o.n] = drawPin(o.p[0], o.p[1], o.c, o.n); });
    // 標籤
    if (Ix !== null && Math.abs(Ix - cx) < W) LD.pill(c, T('P 的像 I', 'image I of P'), Ix, cy + rho * 0.75 + 20, col.img, 'center', '600 11px ' + FONT);
    else LD.pill(c, T('從這裡透過透鏡看不到 P 的像——把觀測點移近主軸', 'P’s image is not visible through the lens from here — move the eye closer to the axis'), cx, cy - rho - 10, LD.c.pos, 'center', '600 11px ' + FONT);
    ['A', 'B'].forEach(function (n) {
      const s = shown[n];
      if (s && s.x > -20 && s.x < W + 20) LD.haloText(c, n, s.x + s.r + 3, s.y - 2, n === 'A' ? col.pinA : col.pinB, 'left', 'alphabetic', 'italic 700 13px ' + FONT);
      else LD.pill(c, n + T(' 不在視野內', ' is out of view'), n === 'A' ? 10 : W - 10, H - 14, LD.c.muted, n === 'A' ? 'left' : 'right', '600 10px ' + FONT);
    });
    // 對齊的數字提示（理想時）
    if (ideal() && Ix !== null && shown.A && shown.B) {
      const mmA = (shown.A.x - Ix) / F * shown.A.dep * 10, mmB = (shown.B.x - shown.A.x) / F * shown.B.dep * 10;
      const t1 = T('A 與 I 錯開 ', 'A–I ') + num(Math.abs(mmA), 1) + ' mm', t2 = T('B 與 A 錯開 ', 'B–A ') + num(Math.abs(mmB), 1) + ' mm';
      LD.pill(c, t1, 10, 26, Math.abs(mmA) < 0.15 ? LD.c.probe : LD.c.muted, 'left', '700 11px ' + FONT);
      LD.pill(c, t2, 10, 48, Math.abs(mmB) < 0.15 ? LD.c.probe : LD.c.muted, 'left', '700 11px ' + FONT);
    }
    c.restore();
  }

  // ======================= 數據表與圖 =======================
  function rowsOf(id) { return state.rows.filter(function (r) { return r.lens === (id || state.lens); }); }
  function analysis() {
    const rows = rowsOf();
    const a = TL.analyze(rows, fOf());
    a.bes = TL.findConjugate(rows, 0.15, 2);
    if (a.bes) a.bes.err = (a.bes.f - fOf()) / Math.abs(fOf());
    return a;
  }

  function renderTable() {
    const tbl = $('tbl');
    const rows = rowsOf();
    const a = TL.analyze(rows, fOf());
    let h = '<thead><tr><th>' + T('次', '#') + '</th><th>' + T('方法', 'Method') + '</th>' +
      '<th>p<small>(cm)</small></th><th>q<small>(cm)</small></th>' +
      '<th>1/p<small>(' + INV + ')</small></th><th>1/q<small>(' + INV + ')</small></th>' +
      '<th>f = pq/(p+q)<small>(cm)</small></th><th>p + q<small>(cm)</small></th><th>m = −q/p</th></tr></thead><tbody>';
    if (!rows.length) {
      h += '<tr class="empty"><td colspan="9">' + esc(T('還沒有數據。找到像之後按「記錄」。', 'No data yet. Locate the image and press “Record”.')) + '</td></tr>';
    } else {
      a.rows.forEach(function (r, i) {
        const src = rows[i];
        h += '<tr' + (i === rows.length - 1 ? ' class="latest"' : '') + '><th>' + (i + 1) + '</th>' +
          '<td class="meth">' + esc(methodName(src.method, true)) + (src.mode === 'error' ? ' ±' : '') + '</td>' +
          '<td>' + num(r.p, 1) + '</td><td>' + num(r.q, 1) + '</td>' +
          '<td>' + num(r.ip, 4) + '</td><td>' + num(r.iq, 4) + '</td>' +
          '<td class="fcol">' + num(r.f, 2) + '</td><td>' + num(r.sum, 1) + '</td><td>' + num(r.m, 2) + '</td></tr>';
      });
    }
    h += '</tbody>';
    const others = {};
    state.rows.forEach(function (r) { if (r.lens !== state.lens) others[r.lens] = (others[r.lens] || 0) + 1; });
    const ol = Object.keys(others);
    const notes = [];
    if (rows.some(function (r) { return r.mode === 'error'; })) notes.push(T('± 表示在「含誤差」時記錄。', '± = recorded with errors on.'));
    if (ol.length) notes.push(T('其他透鏡的數據：', 'Other lenses: ') + ol.map(function (id) { return lensName(id) + ' ' + others[id] + T(' 筆', ''); }).join(T('、', ', ')) + T('（選該透鏡即可看到）。', ' (select a lens to see them).'));
    if (notes.length) h += '<tfoot><tr><td colspan="9">' + esc(notes.join(' ')) + '</td></tr></tfoot>';
    tbl.innerHTML = h;
  }

  function renderAnalysis() {
    const a = analysis(), f = fOf(), hid = hidden();
    let h = '';
    const row = function (dt, dd, cls) { h += '<dt>' + dt + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + dd + '</dd>'; };
    const note = function (t, cls) { h += '<dd class="' + (cls || 'note') + '">' + t + '</dd>'; };
    row(esc(T('透鏡', 'Lens')), esc(lensName()));
    row(esc(T('數據筆數', 'Rows')), String(a.n));
    if (a.n >= 1) row(esc(T('各列 f 的平均', 'Mean of f')), cm(a.meanF, 2) + (a.n > 1 ? '<small>± ' + num(a.sdF, 2) + ' cm</small>' : ''));
    if (a.fit) {
      row(esc(T('最佳直線的斜率', 'Slope of best-fit line')), num(a.slope, 3) + '<small>' + esc(T('理論 −1', 'theory −1')) + '</small>');
      row(esc(T('縱軸截距 → f', 'y-intercept → f')), num(1 / a.fY, 4) + ' ' + INV + '<small>f = ' + cm(a.fY, 2) + '</small>');
      row(esc(T('橫軸截距 → f', 'x-intercept → f')), num(1 / a.fX, 4) + ' ' + INV + '<small>f = ' + cm(a.fX, 2) + '</small>');
      row(esc(T('由兩截距求得', 'From the intercepts')), cm(a.fFit, 2), 'big');
    }
    row(esc(T('真正的焦距', 'True focal length')), hid ? '？' : cm(f, 1));
    if (!hid && a.n) {
      const e = a.fit ? a.errFit : a.errMean;
      row(esc(T('百分誤差', 'Percent error')), pct(e), Math.abs(e) <= 0.02 ? 'big' : '');
    }
    if (hid) note(esc(T('神秘透鏡：先量出焦距，再按「揭曉焦距」對答案。', 'Mystery lens: measure f first, then press “Reveal”.')));
    if (a.fit && Math.abs(a.slope + 1) > 0.15) note(esc(T('斜率離 −1 很遠：檢查是否有記錄錯誤或像沒有對準的數據。', 'The slope is far from −1: look for a wrong row or an image that was not located well.')), 'warn');
    if (a.n === 1) note(esc(T('至少要兩筆數據才能畫最佳直線；課本建議做 5 次。', 'Two rows are needed for a line; the textbook suggests five.')));
    $('anaOut').innerHTML = h;

    let g = '';
    const bes = a.bes;
    if (bes) {
      g += '<dt>' + esc(T('物屏距離 D', 'Object–screen distance D')) + '</dt><dd>' + cm(bes.D, 1) + '</dd>';
      g += '<dt>' + esc(T('兩個成像位置相距 d', 'Shift of the lens d')) + '</dt><dd>' + cm(bes.d, 1) + '</dd>';
      g += '<dt>f = (D<sup>2</sup> − d<sup>2</sup>)/(4D)</dt><dd class="big">' + cm(bes.f, 2) + '</dd>';
      if (!hid) g += '<dt>' + esc(T('百分誤差', 'Percent error')) + '</dt><dd>' + pct(bes.err) + '</dd>';
      g += '<dd class="note">' + esc(T('共軛法只用到 D 與 d，透鏡光心與臺座標線的偏差不會影響它。', 'Only D and d are used, so an offset between the lens and its index mark does not matter.')) + '</dd>';
    } else {
      g += '<dd class="note">' + esc(T('像屏法：光源屏與像屏都不動（D > 4f），移動透鏡找出兩個清楚的位置，各記錄一次，就能用共軛法求焦距：', 'Screen method: keep the source and the screen fixed (D > 4f), find the two lens positions that give a sharp image and record both; then the conjugate method gives ')) + 'f = (D<sup>2</sup> − d<sup>2</sup>)/(4D)' + '</dd>';
    }
    $('besOut').innerHTML = g;
  }

  // ---------- 圖 ----------
  let G = null;
  function resizeGraph() {
    const w = gcv.clientWidth || 300;
    G = { w: w, h: w < 560 ? 300 : 360 };
    setupCanvas(gcv, G.h);
    drawGraph();
  }
  function niceStep(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  }
  function drawGraph() {
    if (!G || !gcv.width) return;
    const c = gctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    LD.backdrop(c, G.w, G.h);
    const a = analysis(), f = fOf(), hid = hidden();
    const rows = a.rows;
    const inv = state.graph === 'inv';
    let pts, xl, yl;
    if (inv) {
      pts = rows.map(function (r) { return [r.ip, r.iq]; });
      xl = '1/p'; yl = '1/q';
    } else {
      pts = rows.filter(function (r) { return r.q > 0; }).map(function (r) { return [r.p, r.sum]; });
      xl = 'p'; yl = 'p + q';
    }
    const fRef = !hid ? f : (a.fit ? a.fFit : (a.n ? a.meanF : NaN));
    // 範圍
    let xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    if (inv) {
      xs = xs.concat([0]); ys = ys.concat([0]);
      if (isFinite(fRef)) { xs.push(1 / fRef); ys.push(1 / fRef); }
      if (!pts.length && !hid) { xs.push(1 / f * 1.4); ys.push(1 / f * 1.2); }
    } else {
      if (isFinite(fRef) && fRef > 0) { xs.push(fRef * 1.2, fRef * 4.5); ys.push(4 * fRef * 0.85, 4 * fRef * 1.6); }
      xs.push(0); ys.push(0);
    }
    let x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    if (x1 - x0 < 1e-9) { x1 = x0 + 0.1; }
    if (y1 - y0 < 1e-9) { y1 = y0 + 0.1; }
    const px = (x1 - x0) * 0.08, py = (y1 - y0) * 0.1;
    x0 -= px; x1 += px; y0 -= py; y1 += py;
    if (!inv) { x0 = Math.max(0, x0); y0 = Math.max(0, y0); }
    // 圖例放在圖的上方，不蓋住數據點
    const leg = [];
    if (inv) { if (!hid) leg.push([T('理論：1/p + 1/q = 1/f', 'theory: 1/p + 1/q = 1/f'), LD.c.muted, true]); if (a.fit) leg.push([T('最佳直線', 'best-fit line'), LD.c.accent, false]); }
    else if (isFinite(fRef) && fRef > 0) leg.push([hid ? T('由量得的 f 畫出的曲線', 'curve for the measured f') : T('理論：1/p + 1/q = 1/f', 'theory: 1/p + 1/q = 1/f'), LD.c.muted, true]);
    c.font = '11px ' + FONT;
    const legW = leg.map(function (g) { return c.measureText(g[0]).width + 26; });
    const legTot = legW.reduce(function (s0, v) { return s0 + v + 14; }, -14);
    const twoRows = leg.length > 1 && legTot > G.w - 72;
    const L = { l: 56, r: 16, t: leg.length ? (twoRows ? 44 : 28) : 14, b: 44 };
    const W = G.w - L.l - L.r, H = G.h - L.t - L.b;
    const gx = function (x) { return L.l + (x - x0) / (x1 - x0) * W; };
    const gy = function (y) { return L.t + (y1 - y) / (y1 - y0) * H; };
    // 格線與刻度
    const sx = niceStep(x1 - x0, G.w < 560 ? 4 : 7), sy = niceStep(y1 - y0, 6);
    c.save();
    c.beginPath(); c.rect(L.l, L.t, W, H); c.clip();
    // 格線：主格線對齊刻度，副格線每 1/5
    const gridLines = function (stx, sty, a) {
      c.beginPath();
      for (let v = Math.ceil(x0 / stx) * stx; v <= x1 + 1e-12; v += stx) { const X0 = Math.round(gx(v) * dpr) / dpr + 0.5 / dpr; c.moveTo(X0, L.t); c.lineTo(X0, L.t + H); }
      for (let v = Math.ceil(y0 / sty) * sty; v <= y1 + 1e-12; v += sty) { const Y0 = Math.round(gy(v) * dpr) / dpr + 0.5 / dpr; c.moveTo(L.l, Y0); c.lineTo(L.l + W, Y0); }
      c.strokeStyle = LD.alpha(LD.c.grid || LD.c.border, a); c.lineWidth = 1 / dpr; c.stroke();
    };
    gridLines(sx / 5, sy / 5, LD.dark ? 0.12 : 0.14);
    gridLines(sx, sy, LD.dark ? 0.3 : 0.32);

    c.restore();
    c.fillStyle = LD.c.muted; c.font = '11px ' + FONT;
    const dx = sx < 0.01 ? 3 : sx < 0.1 ? 2 : sx < 1 ? 1 : 0, dy = sy < 0.01 ? 3 : sy < 0.1 ? 2 : sy < 1 ? 1 : 0;
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let v = Math.ceil(x0 / sx) * sx; v <= x1 + 1e-12; v += sx) c.fillText(num(v, dx), gx(v), L.t + H + 5);
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let v = Math.ceil(y0 / sy) * sy; v <= y1 + 1e-12; v += sy) c.fillText(num(v, dy), L.l - 6, gy(v));
    // 座標軸（通過 0）
    c.strokeStyle = LD.alpha(LD.c.text, 0.6); c.lineWidth = 1.2;
    c.beginPath();
    if (y0 <= 0 && y1 >= 0) { c.moveTo(L.l, gy(0)); c.lineTo(L.l + W, gy(0)); }
    if (x0 <= 0 && x1 >= 0) { c.moveTo(gx(0), L.t); c.lineTo(gx(0), L.t + H); }
    c.stroke();
    c.strokeStyle = LD.alpha(LD.c.text, 0.25); c.strokeRect(L.l + 0.5, L.t + 0.5, W, H);
    // 軸名
    const axisName = function (base, x, y) {   // 置中於 x；倒數軸的單位 cm 加上標 −1
      const fnt = '600 12px ' + FONT;
      if (inv) {
        c.font = fnt; const wb = c.measureText(base + ' (cm').width, wc = c.measureText(')').width;
        c.font = '600 8.6px ' + FONT; const ws = c.measureText('−1').width + 0.5;
        const x0 = x - (wb + ws + wc) / 2;
        LD.supText(c, base + ' (cm', '−1', x0, y, LD.c.text, fnt, 'left');
        LD.haloText(c, ')', x0 + wb + ws + 0.5, y, LD.c.text, 'left', 'alphabetic', fnt);
        return;
      }
      LD.haloText(c, base + ' (cm)', x, y, LD.c.text, 'center', 'alphabetic', fnt);
    };
    axisName(xl, L.l + W / 2, G.h - 8);
    c.save(); c.translate(14, L.t + H / 2); c.rotate(-Math.PI / 2); axisName(yl, 0, 0); c.restore();
    c.save();
    c.beginPath(); c.rect(L.l, L.t, W, H); c.clip();
    if (inv) {
      // 理論線（已知焦距）
      if (!hid) {
        c.setLineDash([6, 5]); c.strokeStyle = LD.alpha(LD.c.muted, 0.8); c.lineWidth = 1.3;
        c.beginPath(); c.moveTo(gx(x0), gy(1 / f - x0)); c.lineTo(gx(x1), gy(1 / f - x1)); c.stroke(); c.setLineDash([]);
      }
      if (a.fit) {
        c.strokeStyle = LD.c.accent; c.lineWidth = 2.2;
        c.beginPath(); c.moveTo(gx(x0), gy(a.fit.a + a.fit.b * x0)); c.lineTo(gx(x1), gy(a.fit.a + a.fit.b * x1)); c.stroke();
        // 兩個截距
        [[0, a.fit.a], [-a.fit.a / a.fit.b, 0]].forEach(function (q) {
          c.fillStyle = LD.c.surface; c.strokeStyle = LD.c.accent; c.lineWidth = 2;
          c.beginPath(); c.arc(gx(q[0]), gy(q[1]), 5, 0, 7); c.fill(); c.stroke();
        });
      }
    } else if (isFinite(fRef) && fRef > 0) {
      c.setLineDash([6, 5]); c.strokeStyle = LD.alpha(LD.c.muted, 0.85); c.lineWidth = 1.3;
      c.beginPath();
      let first = true;
      for (let p = fRef * 1.02; p <= x1; p += (x1 - fRef) / 200) {
        const yv = p * p / (p - fRef);
        if (yv > y1 * 1.5) continue;
        if (first) { c.moveTo(gx(p), gy(yv)); first = false; } else c.lineTo(gx(p), gy(yv));
      }
      c.stroke();
      c.strokeStyle = LD.alpha(LD.c.pos, 0.8);
      c.beginPath(); c.moveTo(gx(x0), gy(4 * fRef)); c.lineTo(gx(x1), gy(4 * fRef)); c.stroke();
      c.setLineDash([]);
    }
    // 數據點
    pts.forEach(function (p, i) {
      LD.ball(c, gx(p[0]), gy(p[1]), 5, col.img, i === pts.length - 1 ? { ring: LD.c.accent } : {});
    });
    c.restore();
    // 標註
    if (inv && a.fit) {
      const tY = '1/f = ' + num(a.fit.a, 4), tX = '1/f = ' + num(-a.fit.a / a.fit.b, 4);
      LD.pill(c, tY, gx(0) + 8, gy(a.fit.a) - 6, LD.c.accent, 'left', '600 11px ' + FONT);
      LD.pill(c, tX, Math.min(L.l + W - 4, Math.max(L.l + 4, gx(-a.fit.a / a.fit.b))), gy(0) + (a.fit.a > 0 ? 24 : -8), LD.c.accent, 'center', '600 11px ' + FONT);
    }
    if (!inv && isFinite(fRef) && fRef > 0) LD.pill(c, '4f = ' + cm(4 * fRef, 1), L.l + W - 6, gy(4 * fRef) - 4, LD.c.pos, 'right', '600 11px ' + FONT);
    let msg = null;
    if (!pts.length) msg = inv ? T('按「記錄」加入數據點', 'Press “Record” to add points') : (fOf() < 0 ? T('p + q 圖只適用於凸透鏡的實像', 'The p + q graph is for real images of a convex lens') : T('記錄實像的數據後，這裡會畫出 p + q', 'Record real images to plot p + q here'));
    if (msg) LD.pill(c, msg, L.l + W / 2, L.t + H / 2, LD.c.muted, 'center', '600 12px ' + FONT);
    // 圖例（圖的上方）
    let lx = G.w - L.r - legTot;
    leg.forEach(function (g, i) {
      const wv = legW[i];
      const x = twoRows ? G.w - L.r - wv : lx, y = twoRows ? 16 + 16 * i : 18;
      c.strokeStyle = g[1]; c.lineWidth = 2; if (g[2]) c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x + 20, y - 4); c.stroke(); c.setLineDash([]);
      LD.haloText(c, g[0], x + 26, y, LD.c.text, 'left', 'alphabetic', '11px ' + FONT);
      lx += wv + 14;
    });
  }

  // ======================= 讀數與步驟 =======================
  function renderReadout() {
    let h = '';
    const row = function (dt, dd, cls) { h += '<dt>' + dt + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + dd + '</dd>'; };
    const note = function (t, cls) { h += '<dd class="' + (cls || 'note') + '">' + t + '</dd>'; };
    if (state.method === 'pin') {
      const P = state.pin, f = fOf();
      row(esc(T('物距 p（針 P 到 O）', 'Object distance p (P to O)')), cm(P.p));
      row(esc(T('針 A', 'Pin A')), '(' + num(P.A[0], 1) + ', ' + num(P.A[1], 1) + ') cm');
      row(esc(T('針 B', 'Pin B')), '(' + num(P.B[0], 1) + ', ' + num(P.B[1], 1) + ') cm');
      row(esc(T('觀測點', 'Eye')), '(' + num(P.E[0], 1) + ', ' + num(P.E[1], 1) + ') cm');
      const xi = TL.lineAxis(P.A, P.B);
      if (P.lined) row(esc(T('AB 延長線與主軸交點 → q', 'AB meets the axis → q')), xi === null ? '—' : cm(TL.round1(xi)), 'big');
      else note(esc(T('按「記錄」（或「連線」）時，會把 A、B 連線延長到主軸，讀出 q。', 'Recording joins A and B and extends the line to the axis to read q.')));
      if (ideal() && !hidden()) row(esc(T('理論像距', 'Theoretical q')), cm(TL.imageDistance(P.p, f), 2));
      note(esc(T('座標：以透鏡 O 為原點，x 沿主軸向右，y 向上（方格紙上）。', 'Coordinates: origin at the lens O, x along the axis, y up the paper.')));
    } else {
      const b = bench(), s = b.sol, scr = state.method === 'screen';
      row(esc(T('光源屏', 'Source')), cm(state.xO));
      row(esc(T('透鏡', 'Lens')), cm(state.xL));
      if (scr) row(esc(T('像屏', 'Screen')), cm(state.xS)); else row(esc(T('參考物', 'Rod')), cm(state.xR));
      row(esc(T('物距 p', 'Object distance p')), cm(state.xL - state.xO), 'big');
      row(esc(scr ? T('像距 q = 像屏 − 透鏡', 'q = screen − lens') : T('像距 q = 參考物 − 透鏡', 'q = rod − lens')), cm((scr ? state.xS : state.xR) - state.xL), 'big');
      if (scr) {
        const D = state.xS - state.xO;
        row(esc(T('物屏距離 D', 'Source–screen D')), cm(D));
        if (s.atInfinity) note(esc(T('物在焦點上：光離開透鏡後互相平行，像屏放在哪裡都是同樣大小的一團光。', 'The object is at the focus: the light leaves parallel, and the patch on the screen has the same size wherever the screen is.')), 'warn');
        else if (!s.real) note(esc(fOf() < 0 ? T('凹透鏡使光發散，像屏上永遠接不到像（虛像）——改用視差法或插針法。', 'A concave lens spreads the light: no image can ever be caught on the screen (it is virtual) — use the parallax or pin method.') : T('物距小於焦距：光離開透鏡後仍然發散，像屏上接不到像。這時的像是正立放大的虛像，要用視差法找（參考物放在光源屏後方）。', 'p < f: the light still diverges after the lens and no image reaches the screen. The image is virtual (upright, magnified) — find it with the parallax method, rod behind the source.')), 'warn');
        else if (!hidden() && 4 * fOf() > D) note(esc(T('D 小於 4f：透鏡放在哪裡都無法在像屏上成清楚的像。', 'D < 4f: no lens position gives a sharp image on the screen.')), 'warn');
        // 像的正倒、大小看得出來，兩種模式都顯示；放大率 m 是輔助數字，只在理想時、而且不是未揭曉的神秘透鏡時顯示
        if (s.real && !s.atInfinity && b.blur <= 1) row(esc(T('像的性質', 'Image')), esc(natureText(s)) + (ideal() && !hidden() ? '<small>m = ' + num(s.m, 2) + '</small>' : ''));
      } else {
        row(esc(T('眼睛的位置', 'Eye at')), cm(b.xE));
        row(esc(T('頭左右擺動', 'Head swing')), '± ' + cm(b.A));
        if (!s.atInfinity) row(esc(T('像的性質', 'Image')), esc(natureText(s)) + (ideal() && !hidden() ? '<small>m = ' + num(s.m, 2) + '</small>' : ''));
        if (ideal() && isFinite(b.xI)) {
          const sense = TL.parallaxSense(b.xE, b.xI, state.xR, 0.05);
          if (!state.flags.swung) note(esc(T('先左右擺頭（拖曳「頭的位置」或打開自動擺頭），看參考物與像有沒有相對移動。', 'Swing your head first (drag “Head position” or turn on the automatic swing) and see whether the rod and the image move apart.')));
          else if (sense === 'none') note(esc(T('沒有視差：參考物就在像的位置。讀數後按「記錄」。', 'No parallax: the rod is at the image. Record it.')), 'ok');
          else if (sense === 'against') note(esc(T('參考物與頭反向移動 → 它比像靠近眼睛，應移離眼睛（往左）。', 'The rod moves against your head → it is nearer than the image; move it away from your eye (to the left).')));
          else note(esc(T('參考物與頭同向移動 → 它比像遠，應移近眼睛（往右）。', 'The rod moves with your head → it is farther than the image; move it towards your eye (to the right).')));
        }
        if (s.atInfinity) note(esc(T('物在焦點上：像在無窮遠，參考物放在哪裡都對不準。', 'Object at the focus: the image is at infinity — no rod position works.')), 'warn');
        else if (isFinite(b.xI) && (b.xI < 1.5 || b.xI > 98.5)) note(esc(T('像落在光凳之外，參考物放不到那裡：改變物距。', 'The image is off the bench, beyond the reach of the rod: change p.')), 'warn');
      }
    }
    $('readout').innerHTML = h;
  }

  const STEPS = {
    screen: [
      ['選好凸透鏡；光源屏放在左端、像屏放在右端，透鏡緊靠像屏（可按「照課本擺好」）。', 'Choose a convex lens; source at the left end, screen at the right end, lens right next to the screen (or press “Set up as in the textbook”).'],
      ['把透鏡慢慢移向光源屏，直到像屏上出現清楚的像（看下方的像屏放大圖）。', 'Slide the lens slowly towards the source until a sharp image appears on the screen (see the close-up below).'],
      ['讀出物距 p 與像距 q，按「記錄」。', 'Read p and q and press “Record”.'],
      ['透鏡每次再移近光源屏 5.0 cm，調整像屏到最清楚並記錄；共做 5 次。', 'Move the lens 5.0 cm closer to the source each time, re-focus the screen and record; five rows in all.'],
      ['看 1/q 對 1/p 圖：斜率約 −1，兩個截距都是 1/f。', 'Look at the 1/q–1/p graph: slope about −1, both intercepts equal 1/f.']
    ],
    parallax: [
      ['光源屏與透鏡相距約 30 cm；參考物放在兩者之間，頂端高過透鏡（可按「照課本擺好」）。', 'Source about 30 cm from the lens; the rod between them, its top above the lens (or press “Set up as in the textbook”).'],
      ['從透鏡後方單眼看：鏡內的像與鏡外的參考物排在同一條鉛直線上。', 'Look through the lens with one eye: the image inside and the rod outside are in one vertical line.'],
      ['左右擺頭：參考物與頭反向 → 移離眼睛；與頭同向 → 移近眼睛。', 'Swing your head: rod moves against it → move the rod away from you; with it → towards you.'],
      ['調到沒有視差，讀出 p 與 q（虛像 q 取負），按「記錄」。', 'When there is no parallax, read p and q (q < 0 for a virtual image) and record.'],
      ['每次把透鏡移動 2–3 cm 改變 p，重做 3、4（至少 4 次）。', 'Move the lens 2–3 cm to change p and repeat 3–4 (at least four rows).']
    ],
    pin: [
      ['在主軸上插針 P 當作物，透鏡立在 O（用滑桿改變 p）。', 'Pin P on the axis is the object; the lens stands at O (change p with the slider).'],
      ['在透鏡後方、主軸外選一個觀測點（拖曳眼睛）。', 'Choose a viewing point behind the lens, off the axis (drag the eye).'],
      ['看鏡中 P 的像 I：插針 A 擋住 I，再插針 B 擋住 A 與 I。', 'Look at the image I of P in the lens: set pin A to hide I, then pin B to hide A and I.'],
      ['按「記錄」：A、B 連線延長到主軸，交點就是 I，讀出 q。', 'Press “Record”: the line AB extended meets the axis at I; read q.'],
      ['把 P 移動 2–3 cm，重做 2–4（至少 4 次）。', 'Move P by 2–3 cm and repeat 2–4 (at least four rows).']
    ]
  };
  function stepDone() {
    const m = state.method, fl = state.flags;
    const n = state.rows.filter(function (r) { return r.lens === state.lens && r.method === m; }).length;
    if (m === 'screen') return [fl.setup, fl.sharpSeen, n >= 1, n >= 5, n >= 5];
    if (m === 'parallax') return [fl.parSetup, fl.parSetup && state.touched, fl.swung, n >= 1, n >= 4];
    return [true, fl.eyeMoved || n >= 1, fl.pinsMoved || n >= 1, n >= 1, n >= 4];
  }
  function renderSteps() {
    const done = stepDone();
    const now = done.indexOf(false);
    const ol = $('steps');
    ol.innerHTML = STEPS[state.method].map(function (s, i) {
      return '<li class="' + (done[i] ? 'done' : i === now ? 'now' : '') + '">' + esc(T(s[0], s[1])) + '</li>';
    }).join('');
    const n = state.rows.filter(function (r) { return r.lens === state.lens && r.method === state.method; }).length;
    $('stepNote').textContent = now < 0 ? T('這個方法的步驟都完成了！換一個透鏡或方法試試看。', 'All steps done for this method! Try another lens or method.') : T('這個透鏡用' + methodName(state.method) + '已記錄 ' + n + ' 筆。', n + ' row(s) recorded with this lens and the ' + methodName(state.method) + '.');
  }

  function setStatus(t) { $('status').textContent = t || ''; }

  // ======================= 更新 =======================
  let syncing = false;
  function syncSliders() {
    syncing = true;
    const set = function (id, v) {
      const el = $(id);
      if (Math.abs(val(el) - v) > 1e-9) { if (window.LabNum) window.LabNum.set(el, v); else el.value = v; }
      $(id + 'o').textContent = num(v, 1) + ' cm';
    };
    set('xO', state.xO); set('xL', state.xL); set('xS', state.xS); set('xR', state.xR); set('pp', state.pin.p);
    syncing = false;
  }
  function headText() {
    if (state.method !== 'parallax') return '';
    const b = bench(), sE = b.sE;
    if (Math.abs(sE) < 0.05) return T('正中', 'centre');
    return (sE < 0 ? T('左 ', 'left ') : T('右 ', 'right ')) + num(Math.abs(sE), 1) + ' cm';
  }
  function itemName(id) {
    const names = { src: T('光源屏', 'source screen'), lens: T('透鏡', 'lens'), screen: T('像屏', 'image screen'), rod: T('參考物', 'reference rod'), P: T('針 P', 'pin P'), A: T('針 A', 'pin A'), B: T('針 B', 'pin B'), E: T('觀測點（眼睛）', 'eye') };
    return names[id] || '';
  }
  function selName() { return itemName(state.sel); }
  function updateUI() {
    document.querySelectorAll('[data-method]').forEach(function (bt) { bt.setAttribute('aria-pressed', String(bt.getAttribute('data-method') === state.method)); });
    document.querySelectorAll('[data-lens]').forEach(function (bt) { bt.setAttribute('aria-pressed', String(bt.getAttribute('data-lens') === state.lens)); });
    document.querySelectorAll('[data-mode]').forEach(function (bt) { bt.setAttribute('aria-pressed', String(bt.getAttribute('data-mode') === state.mode)); });
    document.querySelectorAll('[data-graph]').forEach(function (bt) { bt.setAttribute('aria-pressed', String(bt.getAttribute('data-graph') === state.graph)); });
    const pin = state.method === 'pin', par = state.method === 'parallax';
    $('benchSliders').hidden = pin; $('pinSliders').hidden = !pin;
    $('boxS').hidden = state.method !== 'screen'; $('boxR').hidden = !par;
    $('headBar').hidden = !par; $('guideBox').hidden = !par;
    $('showBeam').parentNode.hidden = pin;
    $('nudgeUD').hidden = !(pin && state.sel !== 'P');
    $('showRays').nextElementSibling.textContent = pin ? T('光的路徑與像（答案）', 'Light path and image (answer)') : T('光線圖（三條主光線）', 'Ray diagram (three principal rays)');
    $('selText').innerHTML = esc(T('選取：', 'Selected: ')) + '<b>' + esc(selName()) + '</b>';
    $('vTitle').innerHTML = state.method === 'screen' ? esc(T('像屏放大圖', 'Close-up of the screen')) + ' <small>' + esc(T('（依比例，方格 1 cm）', '(to scale, 1 cm grid)')) + '</small>'
      : par ? esc(T('眼睛看到的', 'What your eye sees')) + ' <small>' + esc(T('（由計算得到的視野）', '(calculated view)')) + '</small>'
        : esc(T('從觀測點看到的', 'View from the eye')) + ' <small>' + esc(T('（單眼、透視）', '(one eye, in perspective)')) + '</small>';
    $('sceneHint').textContent = state.method === 'screen'
      ? T('拖曳光源屏、透鏡或像屏（點一下選取，再用 1 mm 按鈕或方向鍵微調），紅色標線所指的就是尺上的讀數。下方是像屏上看到的畫面。', 'Drag the source, the lens or the screen (tap to select, then use the 1 mm buttons or arrow keys); the red index line shows the reading. Below: the picture on the screen.')
      : par ? (state.xR > state.xL ? T('拖曳參考物（紅色短桿）。看實像時，參考物在透鏡與眼睛之間，用頂端低於鏡框的短桿：下方的景象中，鏡框內是光源屏的實像，鏡框下方是參考物。左右擺頭，看兩者有沒有相對移動。', 'Drag the reference rod (red). For a real image the rod stands between the lens and your eye and is short, below the rim: in the view below, the real image is inside the rim and the rod below it. Swing your head and watch whether they move apart.')
        : T('拖曳參考物（紅色細桿）。下方是從透鏡後方單眼看到的景象：鏡框內是光源屏的像，鏡框上方是參考物本身。左右擺頭，看兩者有沒有相對移動。', 'Drag the reference rod (red). Below: the view through the lens with one eye — inside the rim the image of the source, above it the rod itself. Swing your head and watch whether they move apart.'))
        : T('方格紙俯視圖（每小格 1 mm、粗線 5 cm）：拖曳針 P（沿主軸）、針 A、針 B 與觀測點的眼睛。下方是從觀測點看到的景象。', 'Top view of the graph paper (1 mm squares, bold lines every 5 cm): drag pin P (along the axis), pins A and B and the eye. Below: the view from the eye.');
    const L = lensObj(), f = fOf();
    $('lensInfo').innerHTML = hidden() ? esc(T('焦距未知——用實驗量出來！透鏡直徑 5.0 cm。', 'Unknown focal length — measure it! Lens diameter 5.0 cm.'))
      : esc((L.sign > 0 ? T('凸透鏡', 'Convex lens') : T('凹透鏡', 'Concave lens')) + T('，焦距 f = ', ', f = ') + signed(f, 1) + ' cm' + T('，直徑 5.0 cm。', ', diameter 5.0 cm.'));
    $('reveal').hidden = !hidden();
    $('errHint').textContent = ideal()
      ? T('讀數準確到 1 mm，透鏡光心恰在臺座標線上；畫面會顯示模糊圓斑、視差與針的錯開等輔助數字。', 'Readings are exact to 1 mm and the lens sits exactly over its index mark; helper numbers (blur disc, parallax, pin offsets) are shown.')
      : T('每個透鏡的光心與臺座標線有一個看不見的偏差；每次讀數有最多 ±0.6 mm 的隨機誤差；插針法的透鏡有球面像差；輔助數字隱藏，要靠眼睛判斷。', 'Each lens is offset from its index mark by a hidden amount; every reading has a random error of up to ±0.6 mm; in the pin method the lens has spherical aberration; helper numbers are hidden — judge by eye.');
    $('headO').textContent = headText();
    $('undo').disabled = !rowsOf().length;
    $('clearAll').disabled = !state.rows.length;
    $('rec').textContent = T('記錄', 'Record');
    syncSliders();
    renderReadout();
    renderSteps();
    syncKeys();
    viewA11y();
  }

  let dirty = { main: true, view: true, graph: true };
  let raf = 0;
  function requestDraw(which) {
    which = which || 'all';
    if (which === 'all') { dirty.main = dirty.view = dirty.graph = true; }
    else dirty[which] = true;
    if (!raf) raf = requestAnimationFrame(frame);
  }
  let lastReadout = 0;
  function frame(t) {
    raf = 0;
    if (state.auto && state.method === 'parallax') {
      if (!state.t0) state.t0 = t;
      state.head = Math.sin(2 * Math.PI * (t - state.t0) / 2800);
      state.flags.swung = true;
      const hs = $('head');
      if (window.LabNum) window.LabNum.clear(hs);
      hs.value = String(Math.round(state.head * 50) / 50);
      $('headO').textContent = headText();
      dirty.view = true;
      if (t - lastReadout > 250) { lastReadout = t; renderReadout(); renderSteps(); }
      raf = requestAnimationFrame(frame);
    }
    if (dirty.main) { dirty.main = false; drawMain(); }
    if (dirty.view) { dirty.view = false; drawView(); }
    if (dirty.graph) { dirty.graph = false; drawGraph(); }
  }
  function refresh(which) { updateUI(); requestDraw(which); }

  // ======================= 任務事件 =======================
  function emit(type, data) { if (window.LabMission && state.touched) window.LabMission.emit(type, data); }
  function benchEvent() {
    if (state.method === 'pin') return;
    const b = bench(), s = b.sol;
    emit('bench', {
      method: state.method, lens: state.lens, kind: b.f > 0 ? 'convex' : 'concave', mystery: isMyst(), mode: state.mode,
      f: b.f, p: b.pTrue, pRead: b.pRead, q: s.q, real: s.real, atInfinity: s.atInfinity, blur: b.blur,
      sharp: isFinite(b.blur) && b.blur <= SHARP && s.real
    });
  }
  function touch() { state.touched = true; }

  // ======================= 記錄 =======================
  function reading(x) { return state.mode === 'error' ? TL.readScale(x, rnd) : TL.round1(x); }
  function record() {
    touch();
    const f = fOf();
    let row = null, extra = {}, warn = false;

    if (state.method === 'screen') {
      const b = bench();
      if (!(b.blur <= RECORD_MAX_BLUR) || !b.sol.real) {
        setStatus(b.sol.real ? T('像屏上的像還很模糊：先把像屏（或透鏡）調到最清楚再記錄。', 'The picture is still blurred: focus it first, then record.')
          : T('像屏上沒有清楚的像，無法記錄——這個設定的像是虛像（或在無窮遠）。', 'There is no sharp image on the screen to record — the image here is virtual (or at infinity).'));
        return;
      }
      const xo = reading(state.xO), xl = reading(state.xL), xs = reading(state.xS);
      row = { p: TL.round1(xl - xo), q: TL.round1(xs - xl) };
      extra = { blur: b.blur, sharp: b.blur <= SHARP, D: TL.round1(xs - xo) };
    } else if (state.method === 'parallax') {
      const b = bench();
      const xo = reading(state.xO), xl = reading(state.xL), xr = reading(state.xR);
      row = { p: TL.round1(xl - xo), q: TL.round1(xr - xl) };
      extra = { rodErr: isFinite(b.xI) ? Math.abs(state.xR - b.xI) : Infinity };
      if (ideal() && isFinite(b.xI) && Math.abs(state.xR - b.xI) > 0.3) warn = true;
    } else {
      const P = state.pin;
      const xi = TL.lineAxis(P.A, P.B);
      if (xi === null || !isFinite(xi)) { setStatus(T('A、B 的連線與主軸平行，找不到交點：移動針 A 或 B。', 'Line AB is parallel to the axis — move pin A or B.')); return; }
      if (Math.abs(xi) > 32) { setStatus(T('AB 延長線與主軸的交點落在方格紙外：調整觀測點或針的位置。', 'Line AB meets the axis off the paper — move the eye or the pins.')); return; }
      P.lined = true;
      row = { p: P.p, q: reading(xi) };
      extra = {};
    }
    if (!row || !isFinite(row.q) || row.q === 0) return;
    row.lens = state.lens; row.method = state.method; row.mode = state.mode; row.sharp = !!extra.sharp;
    state.rows.push(row);
    const a = analysis();
    const fi = TL.focalFrom(row.p, row.q);
    const rowsL = rowsOf();
    const ps = rowsL.filter(function (r) { return r.method === row.method; }).map(function (r) { return r.p; });
    const data = Object.assign({
      lens: state.lens, kind: f > 0 ? 'convex' : 'concave', mystery: isMyst(), method: state.method, mode: state.mode,
      p: row.p, q: row.q, m: -row.q / row.p, fi: fi, fTrue: f, err: Math.abs(fi - f) / Math.abs(f),
      n: rowsL.length, nm: ps.length, pSpan: ps.length ? Math.max.apply(null, ps) - Math.min.apply(null, ps) : 0,
      fit: a.fit ? a.fFit : NaN, errFit: a.fit ? Math.abs(a.errFit) : NaN, errMean: Math.abs(a.errMean),
      fitSame: (function () { const sub = TL.analyze(rowsL.filter(function (r) { return r.method === row.method; }), f); return sub.fit ? Math.abs(sub.errFit) : NaN; })(),
      bessel: a.bes ? { f: a.bes.f, err: Math.abs(a.bes.err), D: a.bes.D, d: a.bes.d } : null,
      revealed: !!state.revealed[state.lens],
      // 共軛：同一個透鏡、像屏法、都清楚的兩筆（物屏距離相同、透鏡位置不同）
      conj: (function () {
        const c = TL.findConjugate(rowsL.filter(function (r) { return r.method === 'screen' && r.sharp; }), 0.1001, 5);
        return c ? { D: c.D, d: c.d, f: c.f } : null;
      })(),
      // 含誤差時，只用含誤差的像屏法數據求共軛法焦距
      besselErr: (function () {
        const c = TL.findConjugate(rowsL.filter(function (r) { return r.method === 'screen' && r.mode === 'error'; }), 0.15, 2);
        return c ? { f: c.f, err: Math.abs(c.f - f) / Math.abs(f), D: c.D, d: c.d } : null;
      })(),
      methodsOk: (function () {
        const out = {};
        rowsL.forEach(function (r) { const e = Math.abs(TL.focalFrom(r.p, r.q) - f) / Math.abs(f); if (e <= 0.02) out[r.method] = true; });
        return out;
      })()
    }, extra);
    setStatus(T('已記錄第 ', 'Row ') + rowsL.length + T(' 筆：p = ', ' recorded: p = ') + cm(row.p) + T('，q = ', ', q = ') + cm(row.q) +
      (isFinite(fi) ? T('，由 1/p + 1/q = 1/f 算出 f = ', '; 1/p + 1/q = 1/f gives f = ') + cm(fi) : '') + T('。', '.') +
      (warn ? T('不過左右擺頭時，參考物與像仍會錯開——這一筆的 q 不太準。', ' But the rod and the image still move apart when you swing your head, so this q is not accurate.') : ''));

    if (state.method === 'pin') requestDraw('main');
    refresh('graph');
    renderTable(); renderAnalysis();
    emit('record', data);
  }

  // ======================= 互動 =======================
  function itemsPresent() { return state.method === 'pin' ? ['P', 'A', 'B', 'E'] : ['src', 'lens', 'screen', 'rod'].filter(present); }
  function evPos(e, el) { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  let drag = null;
  function hitBench(px, py) {
    if (py > Lb.railBot + 4) return null;
    let best = null, bd = 1e9;
    itemsPresent().forEach(function (it) {
      const x = posOf(it), bo = BODY[it];
      const lo = X(x - bo[0]), hi = X(x + bo[1]);
      const dd = Math.max(0, lo - px, px - hi);
      const tol = 22;
      const dc = Math.abs(px - X(x));
      if (dd <= tol && (dd < bd - 0.5 || (Math.abs(dd - bd) <= 0.5 && dc < Math.abs(px - X(posOf(best)))))) { best = it; bd = dd; }
    });
    return best;
  }
  function pinPt(it) { const P = state.pin; return it === 'P' ? [-P.p, 0] : P[it]; }
  function hitPin(px, py) {
    let best = null, bd = 1e9;
    itemsPresent().forEach(function (it) {
      const p = pinPt(it), dd = Math.hypot(px - PX(p[0]), py - PY(p[1]));
      if (dd <= 24 && dd < bd) { best = it; bd = dd; }
    });
    return best;
  }
  cv.addEventListener('pointerdown', function (e) {
    const p = evPos(e, cv);
    let it = null;
    if (state.method === 'pin') { if (Lp) it = hitPin(p[0], p[1]); }
    else if (Lb) it = hitBench(p[0], p[1]);
    if (!it) return;
    e.preventDefault();
    touch();
    state.sel = it;
    if (state.method === 'pin') {
      const pt = pinPt(it);
      drag = { it: it, off: [(p[0] - PX(pt[0])) / Lp.k, -(p[1] - PY(pt[1])) / Lp.k] };
    } else drag = { it: it, off: wx(p[0]) - posOf(it) };
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    cv.style.cursor = 'grabbing';
    refresh('main');
  });
  cv.addEventListener('pointermove', function (e) {
    const p = evPos(e, cv);
    if (!drag) {
      let it = null;
      if (state.method === 'pin') { if (Lp) it = hitPin(p[0], p[1]); } else if (Lb) it = hitBench(p[0], p[1]);
      cv.style.cursor = it ? 'grab' : 'default';
      return;
    }
    e.preventDefault();
    if (state.method === 'pin') {
      const x = (p[0] - Lp.ox) / Lp.k - drag.off[0], s = -(p[1] - Lp.oy) / Lp.k - drag.off[1];
      if (drag.it === 'P') { clampPin('P', -x); state.flags.pMoved = true; }
      else { clampPin(drag.it, [x, s]); if (drag.it === 'E') state.flags.eyeMoved = true; else state.flags.pinsMoved = true; }
    } else {
      moveItem(drag.it, wx(p[0]) - drag.off);
      afterBenchMove();
    }
    refresh('main'); requestDraw('view');
  });
  function endDrag() {
    if (!drag) return;
    const id = drag.it;
    drag = null;
    cv.style.cursor = 'grab';
    benchEvent();
    refresh('all');
    srSay(describeItem(id));
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('lostpointercapture', endDrag);

  function afterBenchMove() {
    if (state.method === 'screen') {
      if (state.xO <= 10 && state.xS >= 85 && state.xS - state.xL <= 10) state.flags.setup = true;
      const b = bench();
      if (state.flags.setup && b.sol.real && b.blur <= SHARP) state.flags.sharpSeen = true;
    }
    if (state.method === 'parallax') {
      const p = state.xL - state.xO;
      if (p >= 20 && p <= 40 && state.xR > state.xO && state.xR < state.xL) state.flags.parSetup = true;
    }
  }

  function nudge(dx, dy) {
    touch();
    const it = state.sel;
    if (state.method === 'pin') {
      if (it === 'P') { clampPin('P', state.pin.p - dx); state.flags.pMoved = true; }
      else { const p = state.pin[it]; clampPin(it, [p[0] + dx, p[1] + (dy || 0)]); if (it === 'E') state.flags.eyeMoved = true; else state.flags.pinsMoved = true; }
    } else {
      if (!present(it)) return;
      moveItem(it, posOf(it) + dx);
      afterBenchMove();
    }
    benchEvent();
    refresh('main'); requestDraw('view');
  }
  document.querySelectorAll('#nudge [data-step]').forEach(function (bt) {
    bt.addEventListener('click', function () { nudge(+bt.getAttribute('data-step'), 0); });
  });
  document.querySelectorAll('#nudge [data-stepy]').forEach(function (bt) {
    bt.addEventListener('click', function () { nudge(0, +bt.getAttribute('data-stepy')); });
  });
  // ---- 鍵盤操作（js/keys.js）：Enter 切換器材、方向鍵 1 mm、Shift 1 cm、R 記錄 ----
  // 走 nudge（與 1 mm／1 cm 按鈕相同）：同樣的位置限制、同樣送出 'bench' 任務事件
  function snap() { const P = state.pin; return [state.xO, state.xL, state.xS, state.xR, P.p, P.A[0], P.A[1], P.B[0], P.B[1], P.E[0], P.E[1]].join(','); }
  function keyMove(id, dx, dy, big) {
    if (state.method !== 'pin' || id === 'P') dy = 0;   // 光凳上的器材與針 P 只能沿主軸移動
    if (!dx && !dy) return false;
    state.sel = id;
    const before = snap(), step = big ? 1 : 0.1;
    nudge(dx * step, dy * step);
    return snap() !== before;
  }
  function describeItem(id) {
    const sep = T('，', ', ');
    if (state.method === 'pin') {
      const P = state.pin;
      if (id === 'P') return itemName(id) + sep + T('物距 p = ', 'object distance p = ') + cm(P.p) + T('。', '.');
      return itemName(id) + ' (' + num(P[id][0], 1) + ', ' + num(P[id][1], 1) + ') cm' + T('。', '.');
    }
    const b = bench(), s = b.sol, scr = state.method === 'screen';
    let t = itemName(id) + ' ' + cm(posOf(id)) + sep + 'p = ' + cm(state.xL - state.xO) + sep + 'q = ' + cm((scr ? state.xS : state.xR) - state.xL);
    if (scr) {
      if (!s.real || s.atInfinity) t += sep + T('像屏上接不到像', 'no image on the screen');
      else if (b.blur <= SHARP) t += sep + T('像清楚', 'the image is sharp');
      else t += sep + T('像模糊', 'the image is blurred') + (ideal() ? T('（模糊圓斑 ', ' (blur disc ') + num(b.blur * 10, 1) + T(' mm）', ' mm)') : '');
    }
    return t + T('。', '.');
  }
  function parallaxNote() {
    if (!ideal() || !state.flags.swung) return '';
    const b = bench();
    if (!isFinite(b.xI)) return '';
    const sense = TL.parallaxSense(b.xE, b.xI, state.xR, 0.05);
    return T('，', ', ') + (sense === 'none' ? T('沒有視差', 'no parallax') : sense === 'against' ? T('參考物與頭反向移動（比像靠近眼睛）', 'the rod moves against your head (nearer than the image)') : T('參考物與頭同向移動（比像遠）', 'the rod moves with your head (farther than the image)'));
  }
  let srTimer = 0;
  /** 拖曳結束時把結果念一次（螢幕閱讀器；不在每一格更新） */
  function srSay(text) {
    clearTimeout(srTimer);
    srTimer = setTimeout(function () { const el = $('srMeter'); if (el && el.textContent !== text) el.textContent = text; }, 450);
  }
  function keyItem(id) {
    return { id: id, name: function () { return itemName(id); }, move: function (dx, dy, big) { return keyMove(id, dx, dy, big); }, describe: function () { return describeItem(id); } };
  }
  /** 依目前的方法重建物件清單，並讓鍵盤的選取與 state.sel 一致 */
  function syncKeys() {
    const ids = itemsPresent();
    if (ids.length !== kbItems.length || ids.some(function (id, i) { return kbItems[i].id !== id; })) {
      kbItems.length = 0;
      ids.forEach(function (id) { kbItems.push(keyItem(id)); });
    }
    const want = ids.indexOf(state.sel);
    if (kb && want >= 0 && kb.index() !== want) kb.select(want);
    // 放大圖：只有視差法可以用鍵盤擺頭
    const par = state.method === 'parallax';
    if (headItem && par !== (vkbItems.length > 0)) { vkbItems.length = 0; if (par) vkbItems.push(headItem); }
  }
  cv.addEventListener('keydown', function (e) {
    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); record(); }
  });
  if (window.LabKeys) {
    syncKeys();
    kb = window.LabKeys.attach(cv, {
      label: T('實驗裝置圖：光具座上的燈泡與光源屏、透鏡、像屏或參考物（插針法時為方格紙的俯視圖）。拖曳器材可移動；鍵盤操作：Enter 切換器材，方向鍵移動 1 mm，Shift 加方向鍵移動 1 cm，R 記錄。',
        'The apparatus: lamp and source screen, lens, image screen or reference rod on the optical bench (a top view of the graph paper in the pin method). Drag a piece to move it. Keyboard: Enter picks a piece, the arrow keys move it 1 mm, Shift with an arrow key 1 cm, R records.'),
      items: kbItems,
      onChange: function () {
        const it = kbItems[kb.index()];
        if (it && it.id !== state.sel) state.sel = it.id;
        refresh('main');
      }
    });
    const want = kbItems.map(function (it) { return it.id; }).indexOf(state.sel);
    if (want >= 0) kb.select(want);
  }

  // 頭的位置
  $('head').addEventListener('input', function () {
    if (syncing) return;
    touch();
    state.head = val($('head'));
    if (Math.abs(state.head) > 0.4) state.flags.swung = true;
    $('headO').textContent = headText();
    renderReadout(); renderSteps();
    requestDraw('view');
  });
  $('autoSwing').addEventListener('change', function () {
    touch();
    state.auto = $('autoSwing').checked;
    state.t0 = 0;
    if (!state.auto) { state.head = val($('head')); }
    requestDraw('view');
  });
  // 在眼睛的視野上左右拖曳＝擺頭
  let vdrag = null;
  vcv.addEventListener('pointerdown', function (e) {
    if (state.method !== 'parallax') return;
    vdrag = { x: e.clientX, h: state.head };
    try { vcv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
  });
  vcv.addEventListener('pointermove', function (e) {
    if (!vdrag) return;
    touch();
    state.auto = false; $('autoSwing').checked = false;
    state.head = Math.max(-1, Math.min(1, vdrag.h + (e.clientX - vdrag.x) / 90));
    if (Math.abs(state.head) > 0.4) state.flags.swung = true;
    if (window.LabNum) window.LabNum.clear($('head'));
    $('head').value = String(Math.round(state.head * 50) / 50);
    $('headO').textContent = headText();
    renderReadout(); renderSteps();
    requestDraw('view');
  });
  const vend = function () { vdrag = null; };
  vcv.addEventListener('pointerup', vend); vcv.addEventListener('pointercancel', vend);
  headItem = {
    id: 'head',
    name: function () { return T('頭的位置', 'head position'); },
    move: function (dx, dy, big) {
      if (state.method !== 'parallax' || !dx) return false;
      const h = Math.max(-1, Math.min(1, Math.round((state.head + dx * (big ? 0.5 : 0.1)) * 100) / 100));
      if (h === state.head) return false;
      touch();
      state.auto = false; $('autoSwing').checked = false;
      state.head = h;
      if (Math.abs(h) > 0.4) state.flags.swung = true;
      syncing = true; if (window.LabNum) window.LabNum.set($('head'), h); else $('head').value = String(h); syncing = false;
      $('headO').textContent = headText();
      renderReadout(); renderSteps(); requestDraw('view');
      return true;
    },
    describe: function () { return T('頭的位置 ', 'Head position ') + headText() + parallaxNote() + T('。', '.'); }
  };
  if (window.LabKeys) {
    syncKeys();
    vkb = window.LabKeys.attach(vcv, { label: vcv.getAttribute('aria-label'), items: vkbItems, onChange: function () { requestDraw('view'); } });
    viewA11y();
  }
  /** 放大圖：視差法時可用鍵盤擺頭（application），其他方法只是一張圖（img），文字描述跟著狀態更新 */
  function viewA11y() {
    if (!vkb) return;
    const par = state.method === 'parallax';
    let t;
    if (par) {
      t = T('眼睛看到的景象（由計算得到的視野）：鏡框內是光源屏的像，另有參考物；左右擺頭看兩者有沒有相對移動。鍵盤操作：左右方向鍵擺頭，Shift 加方向鍵擺得較多。',
        'What your eye sees (calculated view): the image of the source inside the lens rim, and the reference rod. Swing your head and see whether they move apart. Keyboard: the left and right arrow keys swing your head, Shift with an arrow key swings it further.');
    } else if (state.method === 'screen') {
      const b = bench(), s = b.sol;
      t = T('像屏放大圖（依比例，方格 1 cm）：', 'Close-up of the screen (to scale, 1 cm grid): ') +
        (!s.real || s.atInfinity ? T('像屏上只有一片光，接不到像。', 'only a patch of light; no image is caught on the screen.')
          : b.blur <= SHARP ? T('清楚的像，', 'a sharp image, ') + natureText(s) + T('。', '.')
            : T('模糊的像', 'a blurred image') + (ideal() ? T('（模糊圓斑 ', ' (blur disc ') + num(b.blur * 10, 1) + T(' mm）', ' mm)') : '') + T('。', '.'));
    } else {
      t = T('從觀測點看到的景象（單眼、透視）：鏡中針 P 的像 I，以及鏡外的針 A、B；三者看起來排成一直線時，A、B 就在 I 的方向上。',
        'The view from the eye (one eye, in perspective): the image I of pin P in the lens, and pins A and B outside it; when all three line up, A and B point towards I.');
    }
    if (vcv.getAttribute('aria-label') !== t) vcv.setAttribute('aria-label', t);
    // 英文模式也同步 data-en-aria-label，免得載入完成時被 HTML 的靜態英文蓋回去
    if (T('0', '1') === '1') vcv.setAttribute('data-en-aria-label', t);
    if (par) {
      vcv.tabIndex = 0; vcv.setAttribute('role', 'application');
      vcv.setAttribute('aria-roledescription', T('互動實驗畫布', 'interactive simulation canvas'));
    } else {
      if (document.activeElement === vcv) vcv.blur();
      vcv.removeAttribute('tabindex'); vcv.setAttribute('role', 'img'); vcv.removeAttribute('aria-roledescription');
    }
  }

  // 滑桿
  [['xO', 'src'], ['xL', 'lens'], ['xS', 'screen'], ['xR', 'rod']].forEach(function (pr) {
    const el = $(pr[0]);
    el.addEventListener('input', function () {
      if (syncing) return;
      touch();
      state.sel = pr[1];
      moveItem(pr[1], val(el));
      afterBenchMove();
      refresh('main'); requestDraw('view');
    });
    el.addEventListener('change', function () { if (!syncing) benchEvent(); });
  });
  $('pp').addEventListener('input', function () {
    if (syncing) return;
    touch(); state.sel = 'P'; clampPin('P', val($('pp'))); state.flags.pMoved = true;
    refresh('main'); requestDraw('view');
  });

  // 方法、透鏡、誤差、顯示
  const PRESET = {
    screen: function () { state.xO = 5; state.xS = 95; state.xL = 90; state.flags.setup = true; },
    parallax: function () {
      if (fOf() < 0) { state.xO = 20; state.xL = 50; state.xR = 35; }          // 凹透鏡：p = 30 cm，參考物在光源屏與透鏡之間
      else { state.xO = 5; state.xL = 45; state.xR = 53; }                    // 凸透鏡：p = 40 cm，實像在透鏡另一側
      state.flags.parSetup = true;
    },
    pin: function () {
      const P = state.pin, f = fOf();
      if (f < 0) { P.p = 20; P.E = [24, -7]; P.A = [6, -1.2]; P.B = [13, -2.4]; }
      else { P.p = isMyst() ? 7 : Math.abs(f) / 2; P.E = [24, -4]; P.A = [6, -0.5]; P.B = [13, -1.4]; } // 凸透鏡：物在焦點內，像是虛像，才落在方格紙上
      P.lined = false; state.flags.pMoved = true;
    }
  };
  function setMethod(m) {
    if (m === state.method) return;
    state.method = m;
    if (!state.visited[m]) {
      state.visited[m] = true;
      if (m === 'parallax') { PRESET.parallax(); state.flags.parSetup = false; }
      if (m === 'pin') { PRESET.pin(); state.flags.pMoved = false; }
    }
    state.sel = m === 'pin' ? 'A' : m === 'parallax' ? 'rod' : 'lens';
    if (m !== 'parallax') { state.auto = false; $('autoSwing').checked = false; }
    fixAll();
    setStatus('');
    updateUI();
    resizeMain(); resizeView();
    benchEvent();
  }
  document.querySelectorAll('[data-method]').forEach(function (bt) {
    bt.addEventListener('click', function () { touch(); setMethod(bt.getAttribute('data-method')); });
  });
  document.querySelectorAll('[data-lens]').forEach(function (bt) {
    bt.addEventListener('click', function () {
      touch();
      state.lens = bt.getAttribute('data-lens');
      fixAll();
      setStatus('');
      refresh('all');
      renderTable(); renderAnalysis();
      benchEvent();
    });
  });
  document.querySelectorAll('[data-mode]').forEach(function (bt) {
    bt.addEventListener('click', function () {
      touch();
      state.mode = bt.getAttribute('data-mode');
      fixAll();
      refresh('all');
      benchEvent();
    });
  });
  document.querySelectorAll('[data-graph]').forEach(function (bt) {
    bt.addEventListener('click', function () { state.graph = bt.getAttribute('data-graph'); refresh('graph'); });
  });
  $('showBeam').addEventListener('change', function () { state.show.beam = $('showBeam').checked; requestDraw('main'); });
  $('showRays').addEventListener('change', function () { state.show.rays = $('showRays').checked; requestDraw('all'); });
  $('showGuide').addEventListener('change', function () { state.show.guide = $('showGuide').checked; requestDraw('view'); });
  $('reveal').addEventListener('click', function () {
    touch();
    state.revealed[state.lens] = true;
    setStatus(T('揭曉：', 'Revealed: ') + lensName() + ' f = ' + signed(fOf(), 1) + ' cm');
    refresh('all'); renderAnalysis();
    emit('reveal', { lens: state.lens, f: fOf() });
  });
  $('preset').addEventListener('click', function () {
    touch();
    PRESET[state.method]();
    fixAll();
    afterBenchMove();
    setStatus(state.method === 'screen' ? T('已擺好：光源屏在左端、像屏在右端，透鏡緊靠像屏。現在把透鏡慢慢移向光源屏。', 'Set up: source at the left end, screen at the right end, lens next to the screen. Now slide the lens towards the source.')
      : state.method === 'parallax' ? (fOf() < 0 ? T('已擺好：光源屏離透鏡 30 cm，參考物在兩者之間。左右擺頭，找出沒有視差的位置。', 'Set up: source 30 cm from the lens, rod between them. Swing your head and find the position without parallax.')
          : T('已擺好：光源屏離透鏡 40 cm，凸透鏡在另一側成實像；參考物放在透鏡與眼睛之間。左右擺頭，找出沒有視差的位置。', 'Set up: source 40 cm from the lens; the convex lens forms a real image on the far side, and the rod stands between the lens and your eye. Swing your head and find the position without parallax.'))
        : T('已擺好：P 在透鏡前 ' + cm(state.pin.p) + '。拖曳針 A、B，使它們與鏡中的像 I 重疊。', 'Set up: P is ' + cm(state.pin.p) + ' in front of the lens. Drag pins A and B until they cover the image I in the lens.'));
    refresh('all');
    benchEvent();
  });
  $('rec').addEventListener('click', record);
  $('undo').addEventListener('click', function () {
    const rows = rowsOf();
    if (!rows.length) return;
    state.rows.splice(state.rows.lastIndexOf(rows[rows.length - 1]), 1);
    setStatus(T('已刪除最後一筆。', 'Last row deleted.'));
    refresh('graph'); renderTable(); renderAnalysis();
  });
  $('clearAll').addEventListener('click', function () {
    state.rows = [];
    state.pin.lined = false;
    setStatus(T('已清除所有數據；器材位置與設定不變。', 'All data cleared; positions and settings kept.'));
    refresh('all'); renderTable(); renderAnalysis();
  });

  // ======================= 啟動 =======================
  function themeChanged() { readColors(); resizeMain(); resizeView(); requestDraw('all'); }
  window.addEventListener('lab:themechange', function () { setTimeout(themeChanged, 0); });
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = function () { setTimeout(themeChanged, 0); };
    if (mq.addEventListener) mq.addEventListener('change', h); else if (mq.addListener) mq.addListener(h);
  }
  const widths = new WeakMap();
  function observe(el, fn) {
    if (window.ResizeObserver) new ResizeObserver(function () { if (el.clientWidth !== widths.get(el)) { widths.set(el, el.clientWidth); fn(); } }).observe(el);
    window.addEventListener('resize', fn);
  }
  // classroom.js 在 DOMContentLoaded 才載入：還沒有 LabShare 時，等 load 再登記（還原在 load 之後才做）
  function regShare() {
    if (!window.LabShare) return false;
    window.LabShare.register({
      get: function () {
        const P = state.pin;
        return { xO: state.xO, xL: state.xL, xS: state.xS, xR: state.xR, pin: { p: P.p, A: P.A.slice(), B: P.B.slice(), E: P.E.slice() }, sel: state.sel };
      },
      set: function (o) {
        if (!o || typeof o !== 'object') return;
        const okN = function (v) { return typeof v === 'number' && isFinite(v); };
        const okP = function (a) { return Array.isArray(a) && a.length === 2 && okN(a[0]) && okN(a[1]); };
        // 從目前合法的擺放出發，逐一用拖曳時的 place 規則移過去（走兩輪：前一個移動後，後一個的範圍才放得開）；
        // 超出範圍或互相衝突的值會被夾在合法位置。目前方法用不到的器材先記下位置，換方法時 fixAll 會再整理
        const map = { xO: 'src', xL: 'lens', xS: 'screen', xR: 'rod' };
        for (let pass = 0; pass < 2; pass++) {
          Object.keys(map).forEach(function (k) {
            if (!okN(o[k])) return;
            const it = map[k], v = TL.round1(Math.min(98.5, Math.max(1.5, o[k])));
            if (present(it)) setPos(it, place(it, v)); else state[k] = v;
          });
        }
        fixAll();
        const pin = o.pin && typeof o.pin === 'object' ? o.pin : {};
        if (okN(pin.p)) clampPin('P', pin.p);
        ['A', 'B', 'E'].forEach(function (k) { if (okP(pin[k])) clampPin(k, pin[k]); });
        if (typeof o.sel === 'string' && itemsPresent().indexOf(o.sel) >= 0) state.sel = o.sel;
        afterBenchMove();
        refresh('all');
      }
    });
    return true;
  }
  if (!regShare()) window.addEventListener('load', regShare);

  readColors();
  updateUI();
  renderTable(); renderAnalysis();
  setStatus(T('準備好了：光源屏在左端、像屏在右端，透鏡緊靠像屏。把透鏡慢慢移向光源屏，直到像屏上出現清楚的像。', 'Ready: source at the left end, screen at the right end, lens next to the screen. Slide the lens towards the source until a sharp image appears.'));
  state.flags.setup = true;
  observe(cv, resizeMain);
  observe(vcv, resizeView);
  observe(gcv, resizeGraph);
  resizeMain(); resizeView(); resizeGraph();
  // 語言切換後重畫（畫布文字）
  window.addEventListener('lab:langchange', function () { refresh('all'); renderTable(); renderAnalysis(); });
})();
