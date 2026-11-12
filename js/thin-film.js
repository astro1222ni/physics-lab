/* thin-film.js — 「薄膜干涉（肥皂膜、空氣劈與牛頓環）」的畫面與互動（物理計算在 thin-film-core.js） */
(function () {
  'use strict';
  const C = window.ThinFilmCore;
  const D = window.LabDraw;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const FONT = D.FONT;
  const NM = 1e-9, UM = 1e-6, MM = 1e-3, CM = 1e-2, DEG = Math.PI / 180;
  const clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  const reduced = D.reducedMotion();
  const TAU_DRAIN = 0.6;          // 排液的示意時間尺度（s）
  const N_G = C.N_GLASS;

  // ---------------- 亂數（神秘細線、神秘透鏡） ----------------
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
    mode: 'soap',
    light: { soap: { white: true, lam: 589 }, wedge: { white: false, lam: 589 }, newton: { white: false, lam: 589 } },
    beams: 'multi',
    soap: { n: 1.33, ang: 0, hb: 1000, h0: 1000, t: 0, play: false, z: 0.55, specLam: null },
    wedge: { D: 20, L: 10, n: 1, x0: 5, vw: 10, cx: null, mys: null },
    newton: { R: 1, n: 1, e: 0, view: 'R', enh: false, cx: null, mys: null, dust: false },
    rec: { wedge: [], newton: [] },
    revealed: { wedge: false, newton: false }
  };

  // ---------------- 物理量（神秘模式時用藏起來的值） ----------------
  function lightNow() { return st.light[st.mode]; }
  function lamNm() { return lightNow().lam; }
  function isWhite() { return lightNow().white; }
  function soapLayer() { return C.layer(1, st.soap.n, 1, Math.cos(st.soap.ang * DEG), st.beams); }
  function gapLayer(n) { return C.layer(N_G, n, N_G, 1, st.beams); }
  function wedgeD() { return st.wedge.mys ? st.wedge.mys.D : st.wedge.D; }          // μm
  function newtonR() { return st.newton.mys ? st.newton.mys.R : st.newton.R; }      // m
  function newtonE() { return st.newton.mys ? st.newton.mys.e : st.newton.e; }      // nm
  function wedgeP() { return { D: wedgeD() * UM, L: st.wedge.L * CM, n: st.wedge.n, lambda: lamNm() * NM }; }
  function newtonP() { return { R: newtonR(), n: st.newton.n, e: newtonE() * NM, lambda: lamNm() * NM }; }
  function layerNow() {
    if (st.mode === 'soap') return soapLayer();
    return gapLayer(st.mode === 'wedge' ? st.wedge.n : st.newton.n);
  }
  function whichNow() { return st.mode === 'newton' && st.newton.view === 'T' ? 'T' : 'R'; }
  function hidden() { return st.mode === 'wedge' ? !!st.wedge.mys : st.mode === 'newton' ? !!st.newton.mys : false; }

  // ---------------- 強度與顏色（線性 RGB；亮度 = R/R_max 或透射的對應值） ----------------
  let L0 = null, Lkey = '';
  let lut = null, lutKey = '';
  let avgV = 0;                     // 對所有 δ 平均（不同調相加）時的亮度
  let monoLin = [1, 1, 1];
  let norm = 1, off = 0, funC = null;
  function prep() {
    const L = layerNow();
    const which = whichNow(), enh = which === 'T' && st.newton.enh;
    const key = [st.mode, L.n1, L.n2, L.n3, L.cos1, L.beams, which, enh].join('|');
    if (key !== Lkey) {
      Lkey = key; L0 = L;
      const pol = st.mode === 'soap' && st.soap.ang > 0;
      funC = which === 'T' ? (pol ? L.Tc : L.Tsc) : (pol ? L.Rc : L.Rsc);
      if (which === 'T') { off = enh ? L.Tmin : 0; norm = enh ? Math.max(1e-9, L.Tmax - L.Tmin) : L.Tmax; }
      else { off = 0; norm = L.Rmax; }
      let s = 0;
      for (let k = 0; k < 64; k++) s += funC(Math.cos(2 * Math.PI * (k + 0.5) / 64));
      avgV = norm > 1e-9 ? (s / 64 - off) / norm : 0;
    }
    if (isWhite()) {
      const tMax = st.mode === 'soap' ? 3000 : Math.ceil(8000 / L0.n2 / L0.cos2);
      const k2 = key + '|' + tMax;
      if (k2 !== lutKey) { lutKey = k2; lut = C.colorTable(L0, tMax, 2, { which: which, enhance: enh }); }
    } else monoLin = C.monoLinear(lamNm());
    return L0;
  }
  /** 厚度 t（nm）的線性 RGB 寫入 out（不平均） */
  function colorAt(t, out) {
    if (isWhite()) {
      if (norm <= 1e-9) { out[0] = out[1] = out[2] = 0; return out; }
      if (t >= lut.tMax) { out[0] = out[1] = out[2] = avgV; return out; }
      const u = Math.max(0, t) / lut.step, i = Math.floor(u), f = u - i, a = 3 * i, b = a + 3;
      out[0] = lut.lin[a] + (lut.lin[b] - lut.lin[a]) * f;
      out[1] = lut.lin[a + 1] + (lut.lin[b + 1] - lut.lin[a + 1]) * f;
      out[2] = lut.lin[a + 2] + (lut.lin[b + 2] - lut.lin[a + 2]) * f;
      return out;
    }
    const v = intensityMono(t);
    out[0] = v * monoLin[0]; out[1] = v * monoLin[1]; out[2] = v * monoLin[2];
    return out;
  }
  /** 單色光的相對亮度（R/R_max，或透射的對應值） */
  function intensityMono(t) {
    if (norm <= 1e-9) return 0;
    const K = 4 * Math.PI * L0.n2 * L0.cos2 / lamNm();
    return clamp((funC(Math.cos(K * t)) - off) / norm, 0, 1.0001);
  }
  /** 白光的相對亮度 Y（查表） */
  function lumAt(t) {
    if (!isWhite()) return intensityMono(t);
    if (norm <= 1e-9) return 0;
    if (t >= lut.tMax) return avgV;
    const u = Math.max(0, t) / lut.step, i = Math.floor(u), f = u - i;
    return lut.Y[i] + (lut.Y[Math.min(lut.n - 1, i + 1)] - lut.Y[i]) * f;
  }
  /** 厚度區間 [t0, t1] 的平均顏色（條紋比像素還細時，像素顯示平均） */
  const tmpC = [0, 0, 0];
  function colorAvg(t0, t1, out) {
    const span = Math.abs(t1 - t0);
    const per = (isWhite() ? 380 : lamNm()) / (2 * L0.n2 * L0.cos2); // 一條條紋對應的厚度
    if (span > 12 * per && !isWhite()) {
      out[0] = avgV * monoLin[0]; out[1] = avgV * monoLin[1]; out[2] = avgV * monoLin[2]; return out;
    }
    const ns = clamp(Math.ceil(span / per * 6), 1, 72);
    let r = 0, g = 0, b = 0;
    for (let k = 0; k < ns; k++) {
      colorAt(t0 + (k + 0.5) / ns * (t1 - t0), tmpC);
      r += tmpC[0]; g += tmpC[1]; b += tmpC[2];
    }
    out[0] = r / ns; out[1] = g / ns; out[2] = b / ns;
    return out;
  }
  // 線性值 → sRGB 0–255 的查表
  const GAM = new Uint8Array(4097);
  for (let i = 0; i <= 4096; i++) GAM[i] = C.toSrgb8(i / 4096);
  const g8 = function (v) { return GAM[Math.round(clamp(v, 0, 1) * 4096)]; };
  const cssLin = function (c, a) { return 'rgba(' + g8(c[0]) + ',' + g8(c[1]) + ',' + g8(c[2]) + ',' + (a == null ? 1 : a) + ')'; };

  // ---------------- 色彩代號 ----------------
  const K = {};
  const TOK = ['velvet', 'velvet-hi', 'ink', 'ink-dim', 'pill', 'metal', 'glass', 'water', 'wire', 'lamp'];
  function readTokens() {
    const cs = getComputedStyle(document.documentElement);
    TOK.forEach(function (k) { K[k] = cs.getPropertyValue('--tf-' + k).trim(); });
  }
  /** 光線的顏色：白光用琥珀色（--equi），單色光用波長顏色（淺色模式略加深，免得在亮背景上看不見） */
  function rayColor() {
    if (isWhite()) return D.c.equi;
    const c = monoLin.map(g8);
    return D.dark ? 'rgb(' + c.join(',') + ')' : D.mix('rgb(' + c.join(',') + ')', '#000000', 0.25);
  }

  // ---------------- 數字格式 ----------------
  const minus = function (s) { return String(s).replace(/-/g, '−'); };
  const fx = function (v, d) { return isFinite(v) ? minus(v.toFixed(d)) : '—'; };
  const trim = function (v, d) { let s = v.toFixed(d); if (d > 0) s = s.replace(/\.?0+$/, ''); return minus(s); };
  /** a × 10^b（上標用 <sup>，不用上標字元） */
  function sci(v, d) {
    if (!isFinite(v) || v === 0) return fx(v, d);
    const e = Math.floor(Math.log10(Math.abs(v)));
    if (e >= -2 && e <= 3) return fx(v, d);
    return fx(v / Math.pow(10, e), d) + ' × 10<sup>' + minus(String(e)) + '</sup>';
  }

  // ---------------- 畫布 ----------------
  function mk(id) { const cv = $(id); return { cv: cv, ctx: cv.getContext('2d'), w: 0, h: 0, dpr: 1 }; }
  const scene = mk('scene'), graph = mk('graph'), fitC = mk('fit');
  function size(o) {
    o.dpr = Math.min(3, window.devicePixelRatio || 1);
    o.w = o.cv.clientWidth; o.h = o.cv.clientHeight;
    o.cv.width = Math.max(1, Math.round(o.w * o.dpr));
    o.cv.height = Math.max(1, Math.round(o.h * o.dpr));
  }
  const off1 = document.createElement('canvas'), off1c = off1.getContext('2d');   // 一維條紋圖（肥皂膜、空氣劈）
  const off2 = document.createElement('canvas'), off2c = off2.getContext('2d');   // 空氣劈全長俯視
  const ringCv = document.createElement('canvas'), ringCx = ringCv.getContext('2d'); // 牛頓環視野
  let ringKey = '';

  /** n 個顏色（由 fn(i, out) 給線性 RGB）畫成 1 × n 或 n × 1 的小圖 */
  function strip(cv, cx, n, vertical, fn) {
    if (vertical) { cv.width = 1; cv.height = n; } else { cv.width = n; cv.height = 1; }
    const img = cx.createImageData(cv.width, cv.height), d = img.data, c = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      fn(i, c);
      d[4 * i] = g8(c[0]); d[4 * i + 1] = g8(c[1]); d[4 * i + 2] = g8(c[2]); d[4 * i + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
  }

  /** 暗色視野上的標籤（半透明深色底框） */
  function darkPill(ctx, text, x, yb, color, align, font) {
    ctx.font = font || '600 12px ' + FONT;
    const m = ctx.measureText(text), tw = m.width, th = D.textHeight(m, 15);
    const pw = tw + 12, ph = th + 3;
    const bx = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x, by = yb - ph;
    D.roundRect(ctx, bx, by, pw, ph, ph / 2);
    ctx.fillStyle = K.pill; ctx.fill();
    ctx.strokeStyle = D.alpha(color || K.ink, 0.35); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = color || K.ink;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + pw / 2, by + ph / 2 + 0.5);
    return { x: bx, y: by, w: pw, h: ph };
  }
  /** 半透明玻璃（多邊形）：上亮下暗、邊緣高光，看得出厚度 */
  function glass(ctx, pts, tint, alpha) {
    const ys = pts.map(function (p) { return p[1]; }), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    ctx.save();
    ctx.beginPath(); pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath();
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    const a = alpha == null ? 1 : alpha;
    g.addColorStop(0, D.alpha(D.shade(tint, 0.45), (D.dark ? 0.42 : 0.55) * a));
    g.addColorStop(0.5, D.alpha(tint, (D.dark ? 0.3 : 0.38) * a));
    g.addColorStop(1, D.alpha(D.shade(tint, -0.25), (D.dark ? 0.45 : 0.5) * a));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = D.alpha(D.shade(tint, -0.35), 0.75); ctx.lineWidth = 1; ctx.stroke();
    // 上緣高光
    ctx.beginPath(); ctx.moveTo(pts[0][0] + 1, pts[0][1] + 1.2); ctx.lineTo(pts[1][0] - 1, pts[1][1] + 1.2);
    ctx.strokeStyle = D.alpha('#ffffff', D.dark ? 0.35 : 0.75); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }
  function probeOnDark() { return D.dark ? D.c.probe : D.mix(D.c.probe, '#ffffff', 0.55); }
  function labelFont(px, w) { return (w || 500) + ' ' + px + 'px ' + FONT; }

  // ====================================================================
  // 版面
  // ====================================================================
  let lay = null;
  function layout() {
    const W = scene.w, H = scene.h, wide = W >= 560;
    const o = { W: W, H: H, wide: wide };
    if (st.mode === 'soap') {
      if (wide) {
        o.fx = W * 0.07; o.fw = W * 0.33; o.fy = H * 0.1; o.fh = H * 0.74;
        o.px = o.fx + o.fw + W * 0.05; o.pw = W * 0.12;
        o.ix = W * 0.62; o.iy = H * 0.08; o.iw = W * 0.355; o.ih = H * 0.84;
      } else {
        o.fx = W * 0.08; o.fw = W * 0.44; o.fy = H * 0.09; o.fh = H * 0.44;
        o.px = o.fx + o.fw + W * 0.09; o.pw = W * 0.3;
        o.ix = W * 0.025; o.iy = H * 0.635; o.iw = W * 0.95; o.ih = H * 0.355;
      }
    } else if (st.mode === 'wedge') {
      const pad = wide ? 14 : 8;
      o.mx = pad; o.my = pad; o.mw = W - 2 * pad; o.mh = H * (wide ? 0.45 : 0.42);
      o.sx = pad + (wide ? 34 : 14); o.sw = W - o.sx - pad - (wide ? 40 : 18);
      o.ty = o.my + o.mh + H * (wide ? 0.1 : 0.12); o.th = Math.max(10, H * 0.045);
      o.by = H - pad - (wide ? 30 : 30); o.bth = Math.max(9, H * 0.035);
      o.Lp = st.wedge.L * 1.08; // 畫出的玻璃長度（cm）：比細線位置略長
    } else {
      if (wide) {
        o.fr = Math.min(W * 0.27, H * 0.44); o.fcx = W * 0.05 + o.fr + 10; o.fcy = H / 2;
        o.vx = o.fcx + o.fr + W * 0.07; o.vw = W - o.vx - W * 0.03; o.vy = H * 0.14; o.vh = H * 0.72;
      } else {
        o.fr = Math.min(W * 0.43, H * 0.3); o.fcx = W / 2; o.fcy = o.fr + 34;
        o.vx = W * 0.05; o.vw = W * 0.9; o.vy = o.fcy + o.fr + H * 0.05; o.vh = H - o.vy - H * 0.03;
      }
    }
    lay = o;
    return o;
  }
  /** 牛頓環視野半徑（m）：約看得到 10 個暗環（以 589 nm、空氣計），只隨 R 改變，換波長或介質時看得出環變大變小 */
  function newtonView() {
    const r = Math.sqrt(10 * 589e-9 * newtonR());
    const steps = [0.5, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12];
    for (let i = 0; i < steps.length; i++) if (steps[i] * MM >= r) return steps[i] * MM;
    return 12 * MM;
  }

  // ====================================================================
  // 繪圖：場景
  // ====================================================================
  function drawScene() {
    const o = scene, ctx = o.ctx;
    ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
    D.backdrop(ctx, o.w, o.h);
    if (!o.w || !o.h) return;
    prep();
    layout();
    focusRects = [];
    if (st.mode === 'soap') drawSoap(ctx);
    else if (st.mode === 'wedge') drawWedge(ctx);
    else drawNewton(ctx);
    if (kbS && kbS.focused()) focusFrame(ctx, focusRects[kbS.index()]);
  }
  let focusRects = [];
  /** 鍵盤選取中的物件：--accent 色虛線圓角框 */
  function focusFrame(ctx, r) {
    if (!r) return;
    ctx.save();
    ctx.setLineDash([5, 4]); ctx.strokeStyle = D.c.accent; ctx.lineWidth = 2;
    D.roundRect(ctx, r[0], r[1], r[2], r[3], 7); ctx.stroke();
    ctx.restore();
  }

  // ---------- 肥皂膜 ----------
  function soapCursorH() { return C.soapThickness(st.soap.z, st.soap.hb); }
  function drawSoap(ctx) {
    const o = lay, s = st.soap;
    // 黑色背景板（從反射方向看膜時的暗背景）
    const vx = o.fx - 16, vy = o.fy - 18, vw = o.fw + 32, vh = o.fh + 34;
    ctx.save();
    ctx.shadowColor = D.shadowInk(0.35); ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
    D.roundRect(ctx, vx, vy, vw, vh, 10);
    const gv = ctx.createLinearGradient(0, vy, 0, vy + vh);
    gv.addColorStop(0, K['velvet-hi']); gv.addColorStop(1, K.velvet);
    ctx.fillStyle = gv; ctx.fill();
    ctx.restore();
    D.roundRect(ctx, vx + 0.5, vy + 0.5, vw - 1, vh - 1, 10);
    ctx.strokeStyle = D.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    // 膜：每一列的厚度 h = h底 · z
    const rows = Math.max(2, Math.round(o.fh * scene.dpr));
    strip(off1, off1c, rows, true, function (i, c) {
      colorAvg(s.hb * i / rows, s.hb * (i + 1) / rows, c);
    });
    ctx.save();
    D.roundRect(ctx, o.fx, o.fy, o.fw, o.fh, 6); ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off1, 0, 0, 1, rows, o.fx, o.fy, o.fw, o.fh);
    // 極淡的光澤（裝飾，不改變顏色分布）
    const sh = ctx.createLinearGradient(o.fx, o.fy, o.fx + o.fw, o.fy + o.fh * 0.6);
    sh.addColorStop(0, 'rgba(255,255,255,0.05)'); sh.addColorStop(0.35, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh; ctx.fillRect(o.fx, o.fy, o.fw, o.fh);
    ctx.restore();
    // 金屬框與把手
    const metal = K.metal, hx = o.fx + o.fw / 2;
    D.tube(ctx, function (c) { c.moveTo(hx, o.fy + o.fh + 3); c.lineTo(hx, Math.min(o.H - 4, o.fy + o.fh + 40)); }, D.shade(metal, -0.1), 5);
    D.tube(ctx, function (c) { D.roundRect(c, o.fx - 2, o.fy - 2, o.fw + 4, o.fh + 4, 7); }, metal, 4.5);
    // 游標
    const y = o.fy + s.z * o.fh, h = soapCursorH();
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = D.alpha(K.ink, 0.85); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(o.fx - 10, y); ctx.lineTo(o.px + o.pw + 4, y); ctx.stroke();
    ctx.restore();
    D.ball(ctx, o.fx - 10, y, 5, D.c.probe, { glow: 0.3 });
    focusRects[0] = [o.fx - 20, y - 13, o.px + o.pw + 12 - (o.fx - 20), 26];
    const lab = 'h = ' + Math.round(h) + ' nm';
    if (o.wide) darkPill(ctx, lab, o.fx + o.fw - 6, y - 5, K.ink, 'right');
    else darkPill(ctx, lab, o.fx + o.fw - 4, y - 5, K.ink, 'right', '600 11px ' + FONT);
    // 上下標示
    D.haloText(ctx, T('薄（頂端）', 'thin (top)'), o.fx + o.fw / 2, o.fy - 23, D.c.muted, 'center', 'alphabetic', labelFont(11));
    if (o.wide) D.haloText(ctx, T('厚（底部）', 'thick (bottom)'), o.fx - 16, o.fy + o.fh + 32, D.c.muted, 'left', 'alphabetic', labelFont(11));
    drawSoapProfile(ctx, y, h);
    drawSoapInset(ctx, h);
  }
  /** 剖面：厚度隨高度增加（橫向大幅放大） */
  function drawSoapProfile(ctx, yc, h) {
    const o = lay, s = st.soap;
    const hs = Math.max(100, niceUp(s.hb));
    const X = function (t) { return o.px + t / hs * o.pw; };
    // 刻度
    ctx.save();
    ctx.strokeStyle = D.alpha(D.c.text, 0.12); ctx.lineWidth = 1;
    [0, 0.5, 1].forEach(function (u) {
      const x = Math.round(X(u * hs)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, o.fy); ctx.lineTo(x, o.fy + o.fh); ctx.stroke();
    });
    ctx.restore();
    // 膜的剖面（楔形）
    ctx.save();
    ctx.beginPath(); ctx.moveTo(X(0), o.fy); ctx.lineTo(X(s.hb), o.fy + o.fh); ctx.lineTo(X(0), o.fy + o.fh); ctx.closePath();
    const g = ctx.createLinearGradient(X(0), 0, X(hs), 0);
    g.addColorStop(0, D.alpha(K.water, 0.55)); g.addColorStop(1, D.alpha(K.water, 0.25));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = D.alpha(D.shade(K.water, D.dark ? 0.2 : -0.2), 0.9); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(X(0), o.fy); ctx.lineTo(X(s.hb), o.fy + o.fh); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = D.alpha(D.c.text, 0.5); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(X(0) + 0.5, o.fy); ctx.lineTo(X(0) + 0.5, o.fy + o.fh); ctx.stroke();
    const f = labelFont(10.5);
    D.haloText(ctx, '0', X(0), o.fy + o.fh + 13, D.c.muted, 'center', 'alphabetic', f);
    D.haloText(ctx, trim(hs, 0), X(hs), o.fy + o.fh + 13, D.c.muted, 'center', 'alphabetic', f);
    D.haloText(ctx, T('厚度（nm）', 'thickness (nm)'), X(hs / 2), o.fy + o.fh + 27, D.c.muted, 'center', 'alphabetic', f);
    D.haloText(ctx, T('剖面', 'profile'), X(0), o.fy - 8, D.c.muted, 'left', 'alphabetic', labelFont(11, 600));
    D.ball(ctx, X(h), yc, 4, D.c.probe, { glow: 0 });
  }
  /** 字太長就縮小字級（最小 8.5 px），回傳字型字串 */
  function fitFont(ctx, text, maxW, px, weight) {
    let p = px;
    for (; p > 8.5; p -= 0.5) { ctx.font = labelFont(p, weight); if (ctx.measureText(text).width <= maxW) break; }
    return labelFont(p, weight);
  }
  /** 放大圖：兩道反射光、半波損失（寬版：圖在上、說明在下；窄版：圖在左、說明在右） */
  function drawSoapInset(ctx, h) {
    const o = lay, s = st.soap, L = L0;
    const x0 = o.ix, y0 = o.iy, w = o.iw, hh = o.ih, big = o.wide;
    ctx.save();
    D.roundRect(ctx, x0, y0, w, hh, 10);
    ctx.fillStyle = D.alpha(D.c.surface, D.dark ? 0.55 : 0.75); ctx.fill();
    ctx.strokeStyle = D.alpha(D.c.text, 0.12); ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    const title = T('放大：膜的上下表面各反射一道光', 'Close-up: one ray from each surface');
    D.haloText(ctx, title, x0 + 10, y0 + (big ? 19 : 16), D.c.text, 'left', 'alphabetic', fitFont(ctx, title, w - 20, big ? 12.5 : 11.5, 600));
    // 圖的範圍與說明文字的範圍
    const dx0 = x0 + 8, dx1 = big ? x0 + w - 8 : x0 + w * 0.47, dy0 = y0 + (big ? 40 : 26), dy1 = big ? y0 + hh - 92 : y0 + hh - 8;
    const tx = big ? x0 + 12 : x0 + w * 0.51, tw = big ? w - 24 : x0 + w - 8 - tx;
    const dh = dy1 - dy0, dw = dx1 - dx0;
    const top = dy0 + dh * 0.44, bot = top + dh * 0.27;
    const fl = labelFont(big ? 11.5 : 10);
    // 膜
    ctx.save();
    const gf = ctx.createLinearGradient(0, top, 0, bot);
    gf.addColorStop(0, D.alpha(K.water, 0.45)); gf.addColorStop(1, D.alpha(K.water, 0.22));
    ctx.fillStyle = gf; ctx.fillRect(dx0, top, dw, bot - top);
    ctx.strokeStyle = D.alpha(D.shade(K.water, D.dark ? 0.25 : -0.25), 0.9); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(dx0, top + 0.5); ctx.lineTo(dx1, top + 0.5); ctx.moveTo(dx0, bot - 0.5); ctx.lineTo(dx1, bot - 0.5); ctx.stroke();
    ctx.restore();
    D.haloText(ctx, T('空氣', 'air') + ' n = 1', dx1 - 3, top - 5, D.c.muted, 'right', 'alphabetic', fl);
    D.haloText(ctx, T('膜', 'film') + ' n = ' + trim(s.n, 3), dx1 - 3, (top + bot) / 2 + 4, D.c.text, 'right', 'alphabetic', fl);
    D.haloText(ctx, T('空氣', 'air') + ' n = 1', dx1 - 3, bot + (big ? 15 : 13), D.c.muted, 'right', 'alphabetic', fl);
    // 光線：角度照實際的 θ 與 θt，但至少 25°（窄版 30°），免得兩道光疊在一起（示意）
    const th = Math.max(big ? 25 : 30, s.ang) * DEG;
    const tht = Math.asin(Math.sin(th) / s.n);
    const col = rayColor();
    const up = top - dy0;
    const P1 = [dx0 + dw * (big ? 0.3 : 0.24), top];
    const S0 = [P1[0] - Math.tan(th) * up, dy0];
    const P2 = [P1[0] + Math.tan(tht) * (bot - top), bot];
    const P3 = [P2[0] + Math.tan(tht) * (bot - top), top];
    const R1 = [P1[0] + Math.tan(th) * up, dy0], R2 = [P3[0] + Math.tan(th) * up, dy0];
    D.arrow(ctx, S0[0], S0[1], P1[0], P1[1], col, 2.4, {});
    D.arrow(ctx, P1[0], P1[1], R1[0], R1[1], col, 2.2, {});
    ctx.save(); ctx.strokeStyle = D.alpha(col, 0.85); ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(P1[0], P1[1]); ctx.lineTo(P2[0], P2[1]); ctx.lineTo(P3[0], P3[1]); ctx.stroke(); ctx.restore();
    D.arrow(ctx, P3[0], P3[1], R2[0], R2[1], col, 2.2, { dash: [6, 4] });
    // 透射（淡）
    const down = Math.min(dy1 - bot - 4, big ? 40 : 26);
    ctx.save(); ctx.strokeStyle = D.alpha(col, 0.3); ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(P2[0], P2[1]); ctx.lineTo(P2[0] + Math.tan(th) * down, bot + down); ctx.stroke(); ctx.restore();
    D.haloText(ctx, '1', R1[0] - 8, R1[1] + 12, col, 'right', 'alphabetic', labelFont(12, 700));
    D.haloText(ctx, '2', R2[0] + 7, R2[1] + 12, col, 'left', 'alphabetic', labelFont(12, 700));
    // 反射時的相位：上表面 π（半波損失），下表面 0
    const badge = function (p, txt, good) {
      const r = big ? 9 : 8;
      ctx.save();
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fillStyle = D.mix(D.c['canvas-bg'], good ? D.c.probe : D.c.pos, 0.2); ctx.fill();
      ctx.strokeStyle = good ? D.c.probe : D.c.pos; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.restore();
      D.haloText(ctx, txt, p[0], p[1] + 0.5, good ? D.c.probe : D.c.pos, 'center', 'middle', labelFont(big ? 11 : 10, 700));
    };
    badge(P1, 'π', false);
    badge(P2, '0', true);
    // 說明文字
    const path = L.path(h);
    const lines = big ? [
      [T('π：上表面反射（低 n → 高 n），半波損失', 'π: top surface (low n → high n), half-wave loss'), D.c.pos, 600],
      [T('0：下表面反射（高 n → 低 n），不反轉', '0: bottom surface (high n → low n), no flip'), D.c.probe, 600],
      [T('光程差 2nh cosθt = ', 'path difference 2nh cosθt = ') + Math.round(path) + ' nm', D.c.text, 500]
    ] : [
      [T('π：上表面，半波損失', 'π: top, half-wave loss'), D.c.pos, 600],
      [T('0：下表面，不反轉', '0: bottom, no flip'), D.c.probe, 600],
      ['2nh cosθt = ' + Math.round(path) + ' nm', D.c.text, 500]
    ];
    if (isWhite()) lines.push(big ? [T('白光：各波長的相位差不同 → 顏色', 'white light: the phase differs with λ → colour'), D.c.muted, 500] : [T('白光：各色相位不同', 'white: phase varies with λ'), D.c.muted, 500]);
    else {
      const ord = path / lamNm(), cyc = ord + 0.5, fr = cyc - Math.round(cyc);
      const stt = Math.abs(fr) < 0.06 ? T('亮紋', 'bright') : Math.abs(Math.abs(fr) - 0.5) < 0.06 ? T('暗紋', 'dark') : T('介於亮暗之間', 'in between');
      lines.push([trim(ord, 2) + 'λ + ½λ = ' + trim(cyc, 2) + 'λ → ' + stt, D.c.muted, 500]);
    }
    lines.push([big ? T('示意，未依比例', 'schematic, not to scale') : T('示意圖', 'schematic'), D.c.muted, 400]);
    const lh = big ? 17 : 16, ty = big ? y0 + hh - 84 : y0 + 40;
    lines.forEach(function (l, i) {
      const px0 = big ? 11.5 : 10.5;
      D.haloText(ctx, l[0], tx, ty + i * lh, l[1], 'left', 'alphabetic', fitFont(ctx, l[0], tw, i === lines.length - 1 ? px0 - 1 : px0, l[2]));
    });
  }
  function niceUp(v) {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, v))));
    const m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }

  // ---------- 空氣劈 ----------
  function wedgeGapNm(xm) { const p = wedgeP(); return xm * p.D / p.L / NM; }
  function wedgeX(xcm) { return lay.sx + xcm / lay.Lp * lay.sw; }   // 側視圖與全長俯視的橫座標
  function drawWedge(ctx) {
    const o = lay, w = st.wedge, p = wedgeP();
    // ---- 讀數顯微鏡視野 ----
    const xa = (w.x0 * CM) - w.vw / 2 * MM, xb = xa + w.vw * MM; // m
    ctx.save();
    ctx.shadowColor = D.shadowInk(0.35); ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
    D.roundRect(ctx, o.mx, o.my, o.mw, o.mh, 10); ctx.fillStyle = K.velvet; ctx.fill();
    ctx.restore();
    const cols = Math.max(2, Math.round(o.mw * scene.dpr));
    strip(off1, off1c, cols, false, function (i, c) {
      const x1 = xa + (xb - xa) * i / cols, x2 = xa + (xb - xa) * (i + 1) / cols;
      if (x2 <= 0 || x1 >= p.L) { c[0] = c[1] = c[2] = 0; return; }
      colorAvg(wedgeGapNm(Math.max(0, x1)), wedgeGapNm(Math.min(p.L, x2)), c);
      if (x1 < 0 || x2 > p.L) { const u = (Math.min(p.L, x2) - Math.max(0, x1)) / (x2 - x1); c[0] *= u; c[1] *= u; c[2] *= u; }
    });
    ctx.save();
    D.roundRect(ctx, o.mx, o.my, o.mw, o.mh, 10); ctx.clip();
    ctx.imageSmoothingEnabled = cols < o.mw * scene.dpr * 1.5;
    ctx.drawImage(off1, 0, 0, cols, 1, o.mx, o.my, o.mw, o.mh);
    // 玻璃表面的細微反光（裝飾）
    const gl = ctx.createLinearGradient(0, o.my, 0, o.my + o.mh);
    gl.addColorStop(0, 'rgba(255,255,255,0.06)'); gl.addColorStop(0.3, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = gl; ctx.fillRect(o.mx, o.my, o.mw, o.mh);
    ctx.restore();
    const MX = function (xm) { return o.mx + (xm - xa) / (xb - xa) * o.mw; };
    // 目鏡刻度尺（mm，從接觸線算起）：視野底部一條半透明暗帶，主刻度標數字、中間加短刻度
    const stepMm = niceUp(w.vw / (o.wide ? 10 : 6)), sh = 24, sy = o.my + o.mh - sh;
    ctx.save();
    D.roundRect(ctx, o.mx, o.my, o.mw, o.mh, 10); ctx.clip();
    const gs = ctx.createLinearGradient(0, sy, 0, sy + sh);
    gs.addColorStop(0, 'rgba(8,10,14,0.5)'); gs.addColorStop(1, 'rgba(8,10,14,0.72)');
    ctx.fillStyle = gs; ctx.fillRect(o.mx, sy, o.mw, sh);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(o.mx, sy + 0.5); ctx.lineTo(o.mx + o.mw, sy + 0.5); ctx.stroke();
    const k0 = Math.ceil(xa / MM / stepMm * 2), k1 = Math.floor(xb / MM / stepMm * 2);
    for (let k = k0; k <= k1; k++) {
      const x = Math.round(MX(k * stepMm / 2 * MM)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x, sy + (k % 2 ? 4 : 8)); ctx.stroke();
    }
    ctx.font = labelFont(10.5, 600); ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (let k = Math.ceil(k0 / 2); k <= Math.floor(k1 / 2); k++) {
      const x = MX(k * stepMm * MM);
      if (x < o.mx + 16 || x > o.mx + o.mw - 42) continue;
      ctx.fillText(trim(k * stepMm, 2), x, sy + sh - 4);
    }
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('mm', o.mx + o.mw - 8, sy + sh - 4);
    ctx.restore();
    // 游標（十字線）
    focusRects[0] = w.cx != null && MX(w.cx) >= o.mx && MX(w.cx) <= o.mx + o.mw ? [MX(w.cx) - 12, o.my + 3, 24, o.mh - 6] : [o.mx + 3, o.my + 3, o.mw - 6, o.mh - 6];
    if (w.cx != null) {
      const x = MX(w.cx);
      if (x >= o.mx && x <= o.mx + o.mw) {
        ctx.save();
        ctx.strokeStyle = D.c.probe; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, o.my + 4); ctx.lineTo(x, o.my + o.mh - 4); ctx.stroke();
        ctx.strokeStyle = D.alpha(D.c.probe, 0.5); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - 9, o.my + o.mh / 2); ctx.lineTo(x + 9, o.my + o.mh / 2); ctx.stroke();
        ctx.restore();
        const s = 'x = ' + fx(w.cx / MM, 3) + ' mm';
        ctx.font = '600 12px ' + FONT;
        const pw = ctx.measureText(s).width + 12, px = clamp(x, o.mx + pw / 2 + 4, o.mx + o.mw - pw / 2 - 4);
        ctx.font = '600 11.5px ' + FONT;
        const tw = ctx.measureText(T('讀數顯微鏡視野（俯視）', 'Measuring microscope (top view)')).width + 12;
        darkPill(ctx, s, px, o.my + (px - pw / 2 < o.mx + 8 + tw + 6 ? 50 : 26), probeOnDark(), 'center');
      }
    }
    darkPill(ctx, T('讀數顯微鏡視野（俯視）', 'Measuring microscope (top view)'), o.mx + 8, o.my + 26, K.ink, 'left', '600 11.5px ' + FONT);

    // ---- 全長俯視（未放大：條紋太密時像素顯示平均） ----
    const sx0 = wedgeX(0), sxL = wedgeX(w.L), sxE = wedgeX(o.Lp);
    const n2 = Math.max(2, Math.round((sxE - sx0) * scene.dpr));
    strip(off2, off2c, n2, false, function (i, c) {
      const x1 = o.Lp * CM * i / n2, x2 = o.Lp * CM * (i + 1) / n2;
      if (x1 >= p.L) { c[0] = c[1] = c[2] = 0.04; return; }
      colorAvg(wedgeGapNm(x1), wedgeGapNm(Math.min(p.L, x2)), c);
    });
    ctx.save();
    D.roundRect(ctx, sx0, o.ty, sxE - sx0, o.th, 3); ctx.fillStyle = K.velvet; ctx.fill(); ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off2, 0, 0, n2, 1, sx0, o.ty, sxE - sx0, o.th);
    ctx.restore();
    D.haloText(ctx, T('整片玻璃俯視（未放大）', 'whole plate from above (unmagnified)'), sx0, o.ty - 6, D.c.muted, 'left', 'alphabetic', labelFont(11));
    // 顯微鏡位置框
    const wa = wedgeX(Math.max(0, xa / CM)), wb = wedgeX(Math.min(o.Lp, xb / CM));
    ctx.save();
    ctx.strokeStyle = D.c.accent; ctx.lineWidth = 1.6;
    D.roundRect(ctx, wa - 1, o.ty - 3, Math.max(3, wb - wa + 2), o.th + 6, 3); ctx.stroke();
    focusRects[1] = [wa - 7, o.ty - 9, Math.max(3, wb - wa) + 14, o.th + 18];
    ctx.restore();

    // ---- 側視示意圖（角度放大） ----
    const yb = o.by, gapPx = clamp(6 + Math.sqrt(wedgeD()) * 2.2, 10, 38);
    const bot = [[sx0, yb], [sxE, yb], [sxE, yb + o.bth], [sx0, yb + o.bth]];
    // 介質（水等）
    const tanPx = gapPx / (sxL - sx0);
    const topAt = function (x) { return yb - (x - sx0) * tanPx; };
    if (w.n > 1.004) {
      ctx.save();
      ctx.beginPath(); ctx.moveTo(sx0, yb); ctx.lineTo(sxL, topAt(sxL)); ctx.lineTo(sxL, yb); ctx.closePath();
      ctx.fillStyle = D.alpha(K.water, clamp(0.15 + (w.n - 1) * 0.6, 0.15, 0.55)); ctx.fill();
      ctx.restore();
    }
    D.contactShadow(ctx, (sx0 + sxE) / 2, yb + o.bth + 2, (sxE - sx0) / 2, 0);
    glass(ctx, bot, K.glass);
    // 上片玻璃（傾斜）
    const ang = Math.atan(tanPx);
    const tthk = o.bth, ca = Math.cos(ang), sa = Math.sin(ang);
    const t0 = [sx0, yb], t1 = [sxE, topAt(sxE)];
    const topPts = [[t0[0] - sa * tthk, t0[1] - ca * tthk], [t1[0] - sa * tthk, t1[1] - ca * tthk], t1, t0];
    glass(ctx, topPts, K.glass);
    // 細線
    D.ball(ctx, sxL, yb - gapPx / 2, gapPx / 2, K.wire, { glow: 0 });
    // 光線與顯微鏡位置
    const xm = wedgeX(clamp(w.x0, 0, o.Lp));
    const col = rayColor();
    D.arrow(ctx, xm, topAt(xm) - tthk - 30, xm, topAt(xm) - tthk - 2, col, 2.2, {});
    ctx.save(); ctx.strokeStyle = D.alpha(D.c.accent, 0.55); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(xm, o.ty + o.th + 4); ctx.lineTo(xm, topAt(xm) - tthk - 32); ctx.stroke(); ctx.restore();
    // 標示
    const f = labelFont(o.wide ? 11.5 : 10.5);
    D.haloText(ctx, T('接觸線', 'contact line'), sx0, yb - tthk - 7, D.c.muted, 'left', 'alphabetic', f);
    const dTxt = st.wedge.mys && !st.revealed.wedge ? 'D = ?' : 'D = ' + trim(wedgeD(), 2) + ' μm';
    const wTxt = (o.wide ? T('細線 ', 'thread ') : '') + dTxt;
    ctx.font = '600 11.5px ' + FONT;
    D.pill(ctx, wTxt, Math.min(sxL + gapPx / 2 + 6, o.W - 6 - ctx.measureText(wTxt).width - 16), yb - gapPx - 6, K.wire, 'left', '600 11.5px ' + FONT);
    // L 尺寸線
    const ly = yb + o.bth + 8;
    ctx.save(); ctx.strokeStyle = D.alpha(D.c.text, 0.45); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx0, ly + 10); ctx.lineTo(sxL, ly + 10); ctx.moveTo(sx0, ly + 5); ctx.lineTo(sx0, ly + 15); ctx.moveTo(sxL, ly + 5); ctx.lineTo(sxL, ly + 15); ctx.stroke(); ctx.restore();
    D.haloText(ctx, 'L = ' + trim(w.L, 2) + ' cm', (sx0 + sxL) / 2, ly + 14, D.c.text, 'center', 'alphabetic', f);
    D.haloText(ctx, T('側視示意（間隙放大）', 'side view (gap magnified)'), sxE, yb - gapPx - tthk - 20, D.c.muted, 'right', 'alphabetic', labelFont(10.5));
    if (w.n > 1.004) D.haloText(ctx, 'n = ' + trim(w.n, 3), sx0 + (sxL - sx0) * 0.7, yb - 3, D.dark ? K.ink : D.shade(K.water, -0.45), 'center', 'alphabetic', labelFont(10.5, 600));
  }

  // ---------- 牛頓環 ----------
  function drawNewton(ctx) {
    const o = lay, nw = st.newton, p = newtonP(), rv = newtonView();
    // 視野外的暗色鏡筒
    ctx.save();
    ctx.shadowColor = D.shadowInk(0.4); ctx.shadowBlur = 14; ctx.shadowOffsetY = 3;
    ctx.beginPath(); ctx.arc(o.fcx, o.fcy, o.fr + 9, 0, Math.PI * 2);
    const gr = ctx.createRadialGradient(o.fcx - o.fr * 0.3, o.fcy - o.fr * 0.3, o.fr * 0.2, o.fcx, o.fcy, o.fr + 9);
    gr.addColorStop(0, D.shade(K.metal, 0.25)); gr.addColorStop(0.8, D.shade(K.metal, -0.15)); gr.addColorStop(1, D.shade(K.metal, -0.45));
    ctx.fillStyle = gr; ctx.fill();
    ctx.restore();
    // 圓環（徑向分布 → 圓形圖，參數改變才重算）
    const S = Math.max(4, Math.round(2 * o.fr * scene.dpr));
    const which = whichNow();
    const key = [S, rv, p.R, p.n, p.e, isWhite() ? 'W' : lamNm(), which, nw.enh, st.beams, D.ver].join('|');
    if (key !== ringKey) {
      ringKey = key;
      const nr = Math.ceil(S / 2) + 2;
      const prof = new Float32Array(3 * nr), c = [0, 0, 0];
      for (let i = 0; i < nr; i++) {
        const r0 = rv * i / (S / 2), r1 = rv * (i + 1) / (S / 2);
        colorAvg(C.lensGap(r0, p.R, p.e) / NM, C.lensGap(r1, p.R, p.e) / NM, c);
        prof[3 * i] = c[0]; prof[3 * i + 1] = c[1]; prof[3 * i + 2] = c[2];
      }
      ringCv.width = S; ringCv.height = S;
      const img = ringCx.createImageData(S, S), d = img.data, h = S / 2;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const rr = Math.hypot(x + 0.5 - h, y + 0.5 - h);
          const k = 4 * (y * S + x);
          if (rr > h + 1) { d[k + 3] = 0; continue; }
          const u = Math.min(nr - 2, rr), i = Math.floor(u), f = u - i, a = 3 * i;
          d[k] = g8(prof[a] + (prof[a + 3] - prof[a]) * f);
          d[k + 1] = g8(prof[a + 1] + (prof[a + 4] - prof[a + 1]) * f);
          d[k + 2] = g8(prof[a + 2] + (prof[a + 5] - prof[a + 2]) * f);
          d[k + 3] = 255;
        }
      }
      ringCx.putImageData(img, 0, 0);
    }
    ctx.save();
    ctx.beginPath(); ctx.arc(o.fcx, o.fcy, o.fr, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = K.velvet; ctx.fillRect(o.fcx - o.fr, o.fcy - o.fr, 2 * o.fr, 2 * o.fr);
    ctx.drawImage(ringCv, o.fcx - o.fr, o.fcy - o.fr, 2 * o.fr, 2 * o.fr);
    const vg = ctx.createRadialGradient(o.fcx, o.fcy, o.fr * 0.7, o.fcx, o.fcy, o.fr);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = vg; ctx.fillRect(o.fcx - o.fr, o.fcy - o.fr, 2 * o.fr, 2 * o.fr);
    // 刻度（沿水平直徑）
    const RX = function (r) { return o.fcx + r / rv * o.fr; };
    const stepMm = niceUp(rv / MM / (o.fr > 150 ? 5 : 3));
    ctx.strokeStyle = D.alpha(K.ink, 0.55); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(o.fcx - o.fr, o.fcy + 0.5); ctx.lineTo(o.fcx + o.fr, o.fcy + 0.5); ctx.stroke();
    for (let k = -Math.floor(rv / MM / stepMm); k <= Math.floor(rv / MM / stepMm); k++) {
      const x = Math.round(RX(k * stepMm * MM)) + 0.5, hh = k % 2 ? 4 : 7;
      ctx.beginPath(); ctx.moveTo(x, o.fcy - hh); ctx.lineTo(x, o.fcy + hh); ctx.stroke();
    }
    // 十字線游標
    focusRects[0] = nw.cx != null ? [RX(nw.cx) - 12, o.fcy - o.fr - 4, 24, 2 * o.fr + 8] : [o.fcx - o.fr - 6, o.fcy - o.fr - 6, 2 * o.fr + 12, 2 * o.fr + 12];
    if (nw.cx != null) {
      const x = RX(nw.cx);
      ctx.strokeStyle = D.c.probe; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x, o.fcy - o.fr); ctx.lineTo(x, o.fcy + o.fr); ctx.stroke();
    }
    ctx.restore();
    // 鏡筒內緣
    ctx.save();
    ctx.beginPath(); ctx.arc(o.fcx, o.fcy, o.fr + 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = D.alpha('#000000', 0.55); ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(o.fcx, o.fcy, o.fr + 5, Math.PI * 1.05, Math.PI * 1.6);
    ctx.strokeStyle = D.alpha('#ffffff', 0.35); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
    const fs = o.fr > 150 ? 11.5 : 10.5;
    darkPill(ctx, T('刻度 ', 'ticks ') + trim(stepMm, 2) + ' mm', o.fcx, o.fcy + o.fr - 10, K.ink, 'center', '600 ' + fs + 'px ' + FONT);
    if (nw.cx != null) darkPill(ctx, 'r = ' + fx(Math.abs(nw.cx) / MM, 3) + ' mm', clamp(RX(nw.cx), o.fcx - o.fr + 50, o.fcx + o.fr - 50), o.fcy - o.fr + 30, probeOnDark(), 'center', '600 ' + fs + 'px ' + FONT);
    D.haloText(ctx, which === 'T' ? T('透射光（從下方看）', 'transmitted light (seen from below)') : T('反射光（從上方看）', 'reflected light (seen from above)'),
      o.fcx, o.fcy - o.fr - 15, D.c.muted, 'center', 'alphabetic', labelFont(fs, 600));
    drawNewtonSide(ctx, rv);
  }
  /** 側視：平凸透鏡放在平板玻璃上（曲率、間隙放大示意） */
  function drawNewtonSide(ctx, rv) {
    const o = lay, nw = st.newton;
    const cx = o.vx + o.vw / 2, a = o.vw * 0.44;
    const plateY = o.vy + o.vh * 0.62, pth = Math.max(10, o.vh * 0.1);
    const sag = clamp(o.vh * 0.2 / Math.sqrt(Math.max(0.1, newtonR())), 8, o.vh * 0.3);
    const ePx = clamp(newtonE() / 1000 * 10, 0, 10);
    const lensBot = plateY - ePx, lensTopY = lensBot - sag - Math.max(10, o.vh * 0.1);
    const xL = cx - a, xR = cx + a;
    const curve = function (x) { const u = (x - cx) / a; return lensBot - sag * u * u; }; // 拋物線近似的弧
    // 間隙中的介質
    if (nw.n > 1.004) {
      ctx.save(); ctx.beginPath(); ctx.moveTo(xL, plateY);
      for (let x = xL; x <= xR; x += 2) ctx.lineTo(x, curve(x));
      ctx.lineTo(xR, plateY); ctx.closePath();
      ctx.fillStyle = D.alpha(K.water, clamp(0.15 + (nw.n - 1) * 0.6, 0.15, 0.55)); ctx.fill(); ctx.restore();
    }
    D.contactShadow(ctx, cx, plateY + pth + 2, a * 1.1, 0);
    glass(ctx, [[o.vx, plateY], [o.vx + o.vw, plateY], [o.vx + o.vw, plateY + pth], [o.vx, plateY + pth]], K.glass);
    // 透鏡
    const pts = [[xL, lensTopY], [xR, lensTopY]];
    for (let x = xR; x >= xL; x -= 2) pts.push([x, curve(x)]);
    glass(ctx, pts, K.glass, 1.1);
    // 光線：在游標半徑處
    const rr = nw.cx == null ? rv * 0.5 : Math.abs(nw.cx);
    const xr = cx + clamp(rr / rv, 0, 1) * a * (nw.cx != null && nw.cx < 0 ? -1 : 1);
    const col = rayColor();
    const yTop = lensTopY - 26;
    if (nw.view === 'T') {
      D.arrow(ctx, xr, yTop, xr, lensTopY - 1, col, 2.2, {});
      D.arrow(ctx, xr, plateY + pth + 1, xr, plateY + pth + 24, col, 2.2, {});
    } else {
      D.arrow(ctx, xr - 5, yTop, xr - 5, lensTopY - 1, col, 2.2, {});
      D.arrow(ctx, xr + 2, lensTopY - 1, xr + 2, yTop + 4, col, 2, {});
      D.arrow(ctx, xr + 8, lensTopY - 1, xr + 8, yTop + 4, col, 2, { dash: [5, 3] });
    }
    ctx.save(); ctx.strokeStyle = D.alpha(col, 0.55); ctx.lineWidth = 1.2; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(xr, lensTopY); ctx.lineTo(xr, plateY); ctx.stroke(); ctx.restore();
    const f = labelFont(o.wide ? 11.5 : 10.5);
    const rTxt = st.newton.mys && !st.revealed.newton ? 'R = ?' : 'R = ' + trim(newtonR(), 3) + ' m';
    D.haloText(ctx, T('平凸透鏡 ', 'plano-convex lens ') + rTxt, cx, lensTopY - 34, D.c.text, 'center', 'alphabetic', f);
    if (o.wide) {
      D.haloText(ctx, T('平板玻璃', 'flat glass plate'), cx, plateY + pth + 15 + (nw.view === 'T' ? 22 : 0), D.c.muted, 'center', 'alphabetic', f);
      D.haloText(ctx, T('側視示意（曲率、間隙放大）', 'side view (curvature and gap magnified)'), cx, o.vy + o.vh + 2, D.c.muted, 'center', 'alphabetic', labelFont(10.5));
    } else {
      const ly = Math.min(o.H - 4, plateY + pth + 14);
      const pl = T('平板玻璃', 'flat glass plate');
      D.haloText(ctx, pl, o.vx, ly, D.c.muted, 'left', 'alphabetic', f);
      ctx.font = f;
      D.haloText(ctx, T('（側視示意，已放大）', '(side view, magnified)'), o.vx + ctx.measureText(pl).width + 6, ly, D.c.muted, 'left', 'alphabetic', labelFont(10));
    }
    if (ePx > 0.5) {
      D.haloText(ctx, 'e', cx + 5, plateY - ePx / 2 + 3, D.c.pos, 'left', 'alphabetic', labelFont(10.5, 700));
    }
  }

  // ====================================================================
  // 繪圖：下方的圖（反射光譜或亮度分布）
  // ====================================================================
  let gl = null;
  function drawGraph() {
    const o = graph, ctx = o.ctx;
    ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
    D.backdrop(ctx, o.w, o.h);
    if (!o.w || !o.h) return;
    prep();
    const PL = 46, PR = 14, PT = 14, PB = 40;
    const g = { x: PL, y: PT, w: o.w - PL - PR, h: o.h - PT - PB };
    gl = g;
    if (kbG && kbG.focused()) focusFrame(ctx, [g.x - 6, g.y - 8, g.w + 12, g.h + 16]);
    if (st.mode === 'soap' && isWhite()) return drawSpectrum(ctx, g);
    // 亮度分布：橫軸為位置（或厚度），縱軸為相對亮度
    let x0, x1, unit, tOf, curX, title;
    if (st.mode === 'soap') {
      x0 = 0; x1 = Math.max(10, st.soap.hb); unit = 'nm'; tOf = function (h) { return h; }; curX = soapCursorH();
      title = T('膜的厚度 h（nm）', 'film thickness h (nm)');
    } else if (st.mode === 'wedge') {
      x0 = st.wedge.x0 * 10 - st.wedge.vw / 2; x1 = x0 + st.wedge.vw; unit = 'mm';
      tOf = function (xmm) { return xmm <= 0 ? 0 : wedgeGapNm(Math.min(st.wedge.L * CM, xmm * MM)); };
      curX = st.wedge.cx == null ? null : st.wedge.cx / MM;
      title = T('位置 x（mm，從接觸線算起）', 'position x (mm from the contact line)');
    } else {
      const p = newtonP();
      x0 = 0; x1 = newtonView() / MM; unit = 'mm';
      tOf = function (rmm) { return C.lensGap(rmm * MM, p.R, p.e) / NM; };
      curX = st.newton.cx == null ? null : Math.abs(st.newton.cx) / MM;
      title = T('離中心的距離 r（mm）', 'distance from the centre r (mm)');
    }
    g.x0 = x0; g.x1 = x1;
    const X = function (v) { return g.x + (v - x0) / (x1 - x0) * g.w; };
    const Y = function (v) { return g.y + g.h - v / 1.08 * g.h; };
    D.grid(ctx, g.x, g.y, g.x + g.w, g.y + g.h, g.h / 2.16, g.h / 10.8, g.x, Y(0));
    // 顏色帶
    const n = Math.max(2, Math.round(g.w * o.dpr));
    strip(off1, off1c, n, false, function (i, c) {
      const a = x0 + (x1 - x0) * i / n, b = x0 + (x1 - x0) * (i + 1) / n;
      if (st.mode === 'wedge' && (b <= 0 || a >= st.wedge.L * 10)) { c[0] = c[1] = c[2] = 0; return; }
      colorAvg(tOf(Math.max(0, a)), tOf(Math.max(0, b)), c);
    });
    ctx.save();
    D.roundRect(ctx, g.x, g.y + g.h + 4, g.w, 8, 3); ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off1, 0, 0, n, 1, g.x, g.y + g.h + 4, g.w, 8);
    ctx.restore();
    // 曲線
    const pts = Math.min(1600, Math.max(200, Math.round(g.w * 2)));
    ctx.save();
    ctx.beginPath(); ctx.rect(g.x, g.y - 2, g.w, g.h + 4); ctx.clip();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= pts; i++) {
      const v = x0 + (x1 - x0) * i / pts;
      let I;
      if (st.mode === 'wedge' && (v < 0 || v > st.wedge.L * 10)) I = 0;
      else I = lumAt(tOf(Math.max(0, v)));
      const px = X(v), py = Y(clamp(I, 0, 1.05));
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.strokeStyle = D.alpha(D.c['canvas-bg'], 0.8); ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = D.c.field; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.restore();
    axes(ctx, g, x0, x1, title, isWhite() ? T('亮度 Y', 'brightness Y') : (whichNow() === 'T' ? T('透射 T', 'transmitted T') : 'R / R' + 'max'), X, Y);
    if (curX != null) {
      const x = X(curX);
      if (x >= g.x - 1 && x <= g.x + g.w + 1) {
        ctx.save(); ctx.strokeStyle = D.c.probe; ctx.lineWidth = 1.4; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(x, g.y); ctx.lineTo(x, g.y + g.h); ctx.stroke(); ctx.restore();
        const I = (st.mode === 'wedge' && (curX < 0 || curX > st.wedge.L * 10)) ? 0 : lumAt(tOf(Math.max(0, curX)));
        D.ball(ctx, x, Y(clamp(I, 0, 1.05)), 4, D.c.probe, { glow: 0 });
      }
    }
    if (whichNow() === 'T' && !st.newton.enh) {
      D.haloText(ctx, T('透射光的明暗只差約 ', 'transmitted light varies by only about ') + Math.round(L0.Rmax * 100) + ' %', g.x + g.w - 4, g.y + g.h * 0.62, D.c.muted, 'right', 'alphabetic', labelFont(11));
    }
  }
  function axes(ctx, g, x0, x1, title, ytitle, X, Y) {
    ctx.save();
    ctx.strokeStyle = D.alpha(D.c.text, 0.55); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.x + 0.5, g.y); ctx.lineTo(g.x + 0.5, g.y + g.h + 0.5); ctx.lineTo(g.x + g.w, g.y + g.h + 0.5); ctx.stroke();
    ctx.restore();
    const f = labelFont(10.5);
    [0, 0.5, 1].forEach(function (v) { D.haloText(ctx, trim(v, 1), g.x - 5, Y(v) + 4, D.c.muted, 'right', 'alphabetic', f); });
    const step = niceUp((x1 - x0) / (g.w > 400 ? 8 : 4));
    for (let v = Math.ceil(x0 / step) * step; v <= x1 + 1e-9; v += step) {
      const x = X(v);
      ctx.strokeStyle = D.alpha(D.c.text, 0.4);
      ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, g.y + g.h); ctx.lineTo(Math.round(x) + 0.5, g.y + g.h + 3); ctx.stroke();
      D.haloText(ctx, trim(v, step < 1 ? (step < 0.1 ? 2 : 1) : 0), x, g.y + g.h + 24, D.c.muted, 'center', 'alphabetic', f);
    }
    D.haloText(ctx, title, g.x + g.w, g.y + g.h + 37, D.c.text, 'right', 'alphabetic', labelFont(11, 600));
    D.haloText(ctx, ytitle, g.x + 4, g.y + 10, D.c.text, 'left', 'alphabetic', labelFont(11, 600));
  }
  /** 白光：游標處的反射光譜 R(λ)，曲線下填上各波長的顏色，右邊是混合後看到的顏色 */
  function drawSpectrum(ctx, g) {
    const L = L0, h = soapCursorH();
    const sw = Math.min(70, g.w * 0.18);
    const gw = g.w - sw - 14;
    const X = function (nm) { return g.x + (nm - 380) / 400 * gw; };
    const Rtop = niceUp(L.Rmax * 100 * 1.05);
    const Y = function (Rp) { return g.y + g.h - Rp / Rtop * g.h; };
    g.x0 = 380; g.x1 = 780; g.gw = gw;
    D.grid(ctx, g.x, g.y, g.x + gw, g.y + g.h, g.h / 2, g.h / 10, g.x, Y(0));
    // 曲線下的光譜色
    ctx.save();
    for (let nm = 380; nm < 780; nm += 2) {
      const R = L.R(h, nm + 1) * 100;
      const c = C.monoLinear(nm + 1), wv = C.cmf(nm + 1)[1];
      const vis = clamp(Math.pow(wv, 0.35) * 1.3, 0.12, 1);
      ctx.fillStyle = cssLin(c, 0.75 * vis);
      ctx.fillRect(X(nm), Y(R), X(nm + 2) - X(nm) + 0.6, Y(0) - Y(R));
    }
    ctx.beginPath();
    for (let nm = 380; nm <= 780; nm += 1) { const y = Y(L.R(h, nm) * 100); if (nm === 380) ctx.moveTo(X(nm), y); else ctx.lineTo(X(nm), y); }
    ctx.strokeStyle = D.c.field; ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.restore();
    // R_max 虛線
    ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = D.alpha(D.c.text, 0.35);
    ctx.beginPath(); ctx.moveTo(g.x, Y(L.Rmax * 100)); ctx.lineTo(g.x + gw, Y(L.Rmax * 100)); ctx.stroke(); ctx.restore();
    D.haloText(ctx, 'Rmax', g.x + gw - 2, Y(L.Rmax * 100) - 4, D.c.muted, 'right', 'alphabetic', labelFont(10));
    // 軸
    ctx.save(); ctx.strokeStyle = D.alpha(D.c.text, 0.55); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(g.x + 0.5, g.y); ctx.lineTo(g.x + 0.5, g.y + g.h + 0.5); ctx.lineTo(g.x + gw, g.y + g.h + 0.5); ctx.stroke(); ctx.restore();
    const f = labelFont(10.5);
    [0, Rtop / 2, Rtop].forEach(function (v) { D.haloText(ctx, trim(v, 1), g.x - 5, Y(v) + 4, D.c.muted, 'right', 'alphabetic', f); });
    for (let nm = 400; nm <= 780; nm += (gw > 380 ? 50 : 100)) D.haloText(ctx, String(nm), X(nm), g.y + g.h + 15, D.c.muted, 'center', 'alphabetic', f);
    D.haloText(ctx, T('波長 λ（nm）', 'wavelength λ (nm)'), g.x + gw, g.y + g.h + 31, D.c.text, 'right', 'alphabetic', labelFont(11, 600));
    D.haloText(ctx, T('反射率 R（%）　游標處 h = ', 'reflectance R (%)   at h = ') + Math.round(h) + ' nm', g.x + 4, g.y + 10, D.c.text, 'left', 'alphabetic', labelFont(11, 600));
    // 波長游標
    if (st.soap.specLam != null) {
      const x = X(st.soap.specLam);
      ctx.save(); ctx.strokeStyle = D.c.probe; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(x, g.y); ctx.lineTo(x, g.y + g.h); ctx.stroke(); ctx.restore();
      const R = L.R(h, st.soap.specLam) * 100;
      D.ball(ctx, x, Y(R), 4, D.c.probe, { glow: 0 });
      D.pill(ctx, Math.round(st.soap.specLam) + ' nm：' + fx(R, 2) + ' %', clamp(x, g.x + 60, g.x + gw - 60), Y(R) - 8, D.c.probe, 'center', '600 11px ' + FONT);
    }
    // 看到的顏色
    const col = C.filmColor(L, h);
    const bx = g.x + g.w - sw, by = g.y + 6, bh = g.h - 6;
    ctx.save();
    ctx.shadowColor = D.shadowInk(0.3); ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
    D.roundRect(ctx, bx, by, sw, bh, 8); ctx.fillStyle = 'rgb(' + col.srgb.join(',') + ')'; ctx.fill();
    ctx.restore();
    D.roundRect(ctx, bx + 0.5, by + 0.5, sw - 1, bh - 1, 8); ctx.strokeStyle = D.alpha(D.c.text, 0.25); ctx.lineWidth = 1; ctx.stroke();
    D.haloText(ctx, T('看到的顏色', 'colour seen'), bx + sw / 2, g.y + g.h + 15, D.c.muted, 'center', 'alphabetic', labelFont(10.5));
  }

  // ====================================================================
  // 量測紀錄與最佳直線
  // ====================================================================
  function sig() {
    const l = isWhite() ? 'W' : lamNm();
    if (st.mode === 'wedge') return ['w', l, wedgeD(), st.wedge.L, st.wedge.n, st.beams].join('|');
    return ['n', l, newtonR(), st.newton.n, newtonE()].join('|');
  }
  function rows() { return st.mode === 'newton' ? st.rec.newton : st.rec.wedge; }
  function goodRows() { const s = sig(); return rows().filter(function (r) { return r.sig === s; }); }
  function fitNow() {
    const g = goodRows();
    if (st.mode === 'newton') return C.fitLine(g.map(function (r) { return r.k; }), g.map(function (r) { return r.v * r.v; }));
    return C.fitLine(g.map(function (r) { return r.k; }), g.map(function (r) { return r.v; }));
  }
  function renderTable() {
    const tb = $('tbl'), nwt = st.mode === 'newton', all = rows(), s = sig();
    let h = '<thead><tr><th>' + (nwt ? '<i>m</i>' : '<i>k</i>') + '</th><th>' + (nwt ? '<i>r</i> (mm)' : '<i>x</i> (mm)') + '</th>' +
      (nwt ? '<th><i>r</i><sup>2</sup> (mm<sup>2</sup>)</th>' : '') + '</tr></thead><tbody>';
    if (!all.length) h += '<tr class="empty"><td colspan="' + (nwt ? 3 : 2) + '">' + T('還沒有紀錄', 'No data yet') + '</td></tr>';
    all.forEach(function (r, i) {
      const cls = r.sig !== s ? 'stale' : i === all.length - 1 ? 'latest' : '';
      h += '<tr class="' + cls + '"><td>' + r.k + '</td><td>' + fx(r.v, 3) + '</td>' + (nwt ? '<td>' + fx(r.v * r.v, 4) + '</td>' : '') + '</tr>';
    });
    tb.innerHTML = h + '</tbody>';
    const stale = all.some(function (r) { return r.sig !== s; });
    $('recNote').textContent = stale ? T('劃線的紀錄是在不同的設定下量的，不列入直線擬合。', 'Struck-out rows were measured with different settings and are left out of the fit.') : '';
    renderFit();
  }
  function renderFit() {
    const nwt = st.mode === 'newton', f = fitNow(), n = f.n, out = $('fitOut'), hide = hidden() && !st.revealed[st.mode];
    let h = '<dt>' + T('列入擬合的資料', 'Points in the fit') + '</dt><dd>' + n + '</dd>';
    if (n >= 2 && isFinite(f.slope)) {
      if (nwt) {
        h += '<dt>' + T('斜率', 'Slope') + ' Δ(<i>r</i><sup>2</sup>)/Δ<i>m</i></dt><dd>' + fx(f.slope, 5) + ' mm<sup>2</sup></dd>';
        h += '<dt>' + T('截距', 'Intercept') + '</dt><dd>' + fx(f.intercept, 4) + ' mm<sup>2</sup></dd>';
        if (!isWhite()) {
          const Rf = f.slope * MM * MM * st.newton.n / (lamNm() * NM);
          h += '<dt>' + T('推得 ', 'Gives ') + '<i>R</i> = ' + T('斜率', 'slope') + '·<i>n</i>/λ</dt><dd' + (hide ? ' class="hide"' : '') + '>' + (hide ? T('自己算', 'work it out') : fx(Rf, 4) + ' m') + '</dd>';
          if (!hide) {
            const lf = f.slope * MM * MM * st.newton.n / newtonR();
            h += '<dt>' + T('推得 ', 'Gives ') + 'λ = ' + T('斜率', 'slope') + '·<i>n</i>/<i>R</i></dt><dd>' + fx(lf / NM, 1) + ' nm</dd>';
          }
        }
      } else {
        h += '<dt>' + T('斜率（條紋間距）', 'Slope (fringe spacing)') + ' Δ<i>x</i></dt><dd>' + fx(f.slope, 4) + ' mm</dd>';
        if (!isWhite()) {
          const Df = wireFromSpacing(f.slope);
          h += '<dt>' + T('推得 ', 'Gives ') + '<i>D</i> = λ<i>L</i>/(2<i>n</i>Δ<i>x</i>)</dt><dd' + (hide ? ' class="hide"' : '') + '>' + (hide ? T('自己算', 'work it out') : fx(Df, 2) + ' μm') + '</dd>';
        }
      }
    }
    out.innerHTML = h;
    fitC.cv.setAttribute('aria-label', (nwt ? T('r² 對暗環序數 m 的圖', 'Graph of r² against the dark ring number m') : T('暗紋位置 x 對編號 k 的圖', 'Graph of dark-fringe position x against fringe number k')) + T('：', ': ') + n + T(' 個點', ' points') +
      (n >= 2 && isFinite(f.slope) ? T('，最佳直線斜率 ', ', best-fit slope ') + fx(f.slope, 4) + (nwt ? ' mm²' : ' mm') : '') + T('。', '.'));
    drawFit(f);
  }
  function wireFromSpacing(slopeMm) { return C.wireFromSpacing(Math.abs(slopeMm) * MM, st.wedge.L * CM, st.wedge.n, lamNm() * NM) / UM; }
  function drawFit(f) {
    const o = fitC, ctx = o.ctx;
    if (!o.w) return;
    ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
    D.backdrop(ctx, o.w, o.h);
    const nwt = st.mode === 'newton', g = goodRows();
    const PL = 46, PR = 10, PT = 12, PB = 34;
    const gx = PL, gy = PT, gw = o.w - PL - PR, gh = o.h - PT - PB;
    const xs = g.map(function (r) { return r.k; }), ys = g.map(function (r) { return nwt ? r.v * r.v : r.v; });
    let xa = 0, xb = Math.max(5, xs.length ? Math.max.apply(null, xs) + 1 : 5);
    let ya = 0, yb = ys.length ? Math.max.apply(null, ys) * 1.1 : 1;
    if (!nwt && ys.length) { ya = Math.min.apply(null, ys); yb = Math.max.apply(null, ys); const pad = Math.max(0.2, (yb - ya) * 0.12); ya -= pad; yb += pad; xa = Math.max(0, Math.min.apply(null, xs) - 1); }
    if (nwt && ys.length && f.n >= 2 && isFinite(f.intercept)) ya = Math.min(0, f.intercept * 1.1);
    yb = niceUp(yb - ya) + ya;
    const X = function (v) { return gx + (v - xa) / (xb - xa) * gw; }, Y = function (v) { return gy + gh - (v - ya) / (yb - ya) * gh; };
    D.grid(ctx, gx, gy, gx + gw, gy + gh, gh / 4, 0, gx, gy + gh);
    ctx.save(); ctx.strokeStyle = D.alpha(D.c.text, 0.55); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx + 0.5, gy); ctx.lineTo(gx + 0.5, gy + gh + 0.5); ctx.lineTo(gx + gw, gy + gh + 0.5); ctx.stroke(); ctx.restore();
    const fnt = labelFont(10);
    [ya, (ya + yb) / 2, yb].forEach(function (v) { D.haloText(ctx, trim(v, Math.abs(yb - ya) < 5 ? 2 : 1), gx - 4, Y(v) + 3, D.c.muted, 'right', 'alphabetic', fnt); });
    const st1 = niceUp((xb - xa) / 5);
    for (let v = Math.ceil(xa / st1) * st1; v <= xb + 1e-9; v += st1) D.haloText(ctx, trim(v, 0), X(v), gy + gh + 13, D.c.muted, 'center', 'alphabetic', fnt);
    D.haloText(ctx, nwt ? T('暗環序數 m', 'dark ring number m') : T('暗紋編號 k', 'dark fringe number k'), gx + gw, gy + gh + 27, D.c.text, 'right', 'alphabetic', labelFont(10.5, 600));
    if (nwt) D.supText(ctx, 'r', '2', gx + 4, gy + 9, D.c.text, labelFont(10.5, 600));
    else D.haloText(ctx, 'x (mm)', gx + 4, gy + 9, D.c.text, 'left', 'alphabetic', labelFont(10.5, 600));
    if (nwt) D.haloText(ctx, '(mm²)', gx + 18, gy + 9, D.c.text, 'left', 'alphabetic', labelFont(10.5, 600));
    if (f.n >= 2 && isFinite(f.slope)) {
      ctx.save(); ctx.beginPath(); ctx.rect(gx, gy, gw, gh); ctx.clip();
      ctx.strokeStyle = D.c.accent; ctx.lineWidth = 1.8; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(X(xa), Y(f.intercept + f.slope * xa)); ctx.lineTo(X(xb), Y(f.intercept + f.slope * xb)); ctx.stroke();
      ctx.restore();
    }
    for (let i = 0; i < xs.length; i++) D.ball(ctx, X(xs[i]), Y(ys[i]), 4, D.c.pos, { glow: 0 });
    if (!xs.length) D.haloText(ctx, T('記錄幾個點後，這裡畫出最佳直線', 'Record a few points to see the best-fit line'), gx + gw / 2, gy + gh / 2, D.c.muted, 'center', 'middle', labelFont(11));
  }

  // ====================================================================
  // 讀數
  // ====================================================================
  function row(dt, dd, cls) { return '<dt>' + dt + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + dd + '</dd>'; }
  function updateReadout() {
    prep();
    let h = '';
    const hide = hidden() && !st.revealed[st.mode], q = T('？', '?');
    if (st.mode === 'soap') {
      const s = st.soap, L = L0, th = soapCursorH(), path = L.path(th);
      h += row(T('游標處的厚度 <i>h</i>', 'Thickness at the cursor <i>h</i>'), Math.round(th) + ' nm');
      h += row(T('折射角 θ<sub>t</sub>', 'Refraction angle θ<sub>t</sub>'), fx(Math.acos(L.cos2) / DEG, 1) + '°');
      h += row(T('光程差 2<i>nh</i> cosθ<sub>t</sub>', 'Path difference 2<i>nh</i> cosθ<sub>t</sub>'), Math.round(path) + ' nm');
      if (!isWhite()) {
        const ord = path / lamNm(), cyc = ord + 0.5, fr = cyc - Math.round(cyc);
        const stt = Math.abs(fr) < 0.06 ? T('亮紋', 'bright') : Math.abs(Math.abs(fr) - 0.5) < 0.06 ? T('暗紋', 'dark') : T('亮暗之間', 'in between');
        h += row(T('加上半波損失', 'With the half-wave loss'), trim(cyc, 3) + 'λ（' + stt + '）'.replace('（', T('（', ' (')).replace('）', T('）', ')')));
        const Rv = L.R(th, lamNm());
        h += row(T('反射率 <i>R</i>', 'Reflectance <i>R</i>'), fx(Rv * 100, 2) + ' %');
        h += row('<i>R</i><sub>s</sub> / <i>R</i><sub>p</sub>', fx(L.Rs(th, lamNm()) * 100, 2) + ' % / ' + fx(L.Rp(th, lamNm()) * 100, 2) + ' %');
      } else {
        const col = C.filmColor(L, th);
        h += row(T('看到的顏色', 'Colour seen'), '<span class="swatch" style="background:rgb(' + col.srgb.join(',') + ')"></span>' + T('亮度 ', 'brightness ') + fx(col.Y, 2));
        h += row('<i>R</i><sub>s</sub> / <i>R</i><sub>p</sub>（550 nm）', fx(L.Rs(th, 550) * 100, 2) + ' % / ' + fx(L.Rp(th, 550) * 100, 2) + ' %');
      }
      h += row(T('最大反射率 <i>R</i><sub>max</sub>', 'Maximum reflectance <i>R</i><sub>max</sub>'), fx(L.Rmax * 100, 2) + ' %');
      h += row(T('排液時間', 'Draining time'), fx(s.t, 1) + ' s');
      $('readNote').textContent = T('頂端厚度為 0：兩道反射光只差半波損失，互相抵消而全黑。', 'At the top the thickness is 0: the two reflected rays differ only by the half-wave loss, cancel, and the film is black.');
    } else if (st.mode === 'wedge') {
      const p = wedgeP(), w = C.wedge(p);
      h += row(T('楔角 θ ≈ <i>D</i>/<i>L</i>', 'Wedge angle θ ≈ <i>D</i>/<i>L</i>'), hide ? q : sci(w.theta, 2) + ' rad', hide ? 'hide' : '');
      if (!isWhite()) {
        h += row(T('條紋間距 Δ<i>x</i> = λ<i>L</i>/(2<i>nD</i>)', 'Fringe spacing Δ<i>x</i> = λ<i>L</i>/(2<i>nD</i>)'), hide ? q : fx(w.dx / MM, 4) + ' mm', hide ? 'hide' : '');
        h += row(T('接觸線到細線的暗紋數', 'Dark fringes from contact to thread'), hide ? q : String(w.darkCount), hide ? 'hide' : '');
      }
      if (st.wedge.cx != null) {
        h += row(T('游標位置 <i>x</i>', 'Cursor position <i>x</i>'), fx(st.wedge.cx / MM, 3) + ' mm');
        const t = wedgeGapNm(clamp(st.wedge.cx, 0, p.L));
        h += row(T('游標處的間隙 <i>t</i>', 'Gap at the cursor <i>t</i>'), hide ? q : fx(t / 1000, 3) + ' μm', hide ? 'hide' : '');
        h += row(T('相對亮度', 'Relative brightness'), fx(lumAt(t), 3));
      } else h += row(T('游標位置 <i>x</i>', 'Cursor position <i>x</i>'), T('在視野中點一下', 'tap the view'));
      $('readNote').textContent = st.wedge.n > 1.515 && st.wedge.n < 1.525
        ? T('楔中介質的折射率與玻璃相同：界面不反射，條紋消失。', 'The medium has the same index as the glass: no reflection, so the fringes disappear.')
        : T('接觸線（間隙 0）是暗紋：半波損失。', 'The contact line (zero gap) is dark: the half-wave loss.');
    } else {
      const p = newtonP(), nw = st.newton;
      if (!isWhite()) {
        const r1 = C.darkRingRadius(Math.max(1, Math.ceil(2 * p.n * p.e / p.lambda - 1e-9)), p);
        h += row(T('第 5 暗環半徑 <i>r</i><sub>5</sub>', '5th dark ring radius <i>r</i><sub>5</sub>'), hide || p.e > 0 ? (hide ? q : '—') : fx(C.darkRingRadius(5, p) / MM, 4) + ' mm', hide ? 'hide' : '');
        h += row(T('最內側暗環半徑', 'Innermost dark ring radius'), hide ? q : fx(r1 / MM, 4) + ' mm', hide ? 'hide' : '');
        const c = 2 * p.n * p.e / p.lambda + 0.5, fr = c - Math.round(c);
        const centre = whichNow() === 'T'
          ? (Math.abs(fr) < 0.06 ? T('暗點', 'dark spot') : Math.abs(Math.abs(fr) - 0.5) < 0.06 ? T('亮點', 'bright spot') : T('不亮不暗', 'in between'))
          : (Math.abs(fr) < 0.06 ? T('亮點', 'bright spot') : Math.abs(Math.abs(fr) - 0.5) < 0.06 ? T('暗點', 'dark spot') : T('不亮不暗', 'in between'));
        h += row(T('中心', 'Centre'), hide ? q : centre, hide ? 'hide' : '');
      }
      if (nw.cx != null) {
        const r = Math.abs(nw.cx), t = C.lensGap(r, p.R, p.e) / NM;
        h += row(T('游標半徑 <i>r</i>', 'Cursor radius <i>r</i>'), fx(r / MM, 3) + ' mm');
        h += row(T('游標處的間隙 <i>t</i>', 'Gap at the cursor <i>t</i>'), hide ? q : Math.round(t) + ' nm', hide ? 'hide' : '');
        h += row(T('相對亮度', 'Relative brightness'), fx(lumAt(t), 3));
      } else h += row(T('游標半徑 <i>r</i>', 'Cursor radius <i>r</i>'), T('在視野中點一下', 'tap the view'));
      $('readNote').textContent = whichNow() === 'T'
        ? T('透射光與反射光互補：T = 1 − R，中心是亮點。', 'Transmitted light is complementary to reflected light: T = 1 − R, and the centre is bright.')
        : T('中心接觸處（間隙 0）是暗點：半波損失。', 'The point of contact (zero gap) is a dark spot: the half-wave loss.');
    }
    $('readout').innerHTML = h;
  }

  // ====================================================================
  // 控制項
  // ====================================================================
  function bind(id, fmt, onInput, html) {
    const el = $(id), out = $(id + 'o');
    const upd = function () { if (html) out.innerHTML = fmt(val(el)); else out.textContent = fmt(val(el)); };
    el.addEventListener('input', function () { onInput(val(el)); upd(); changed(); });
    upd();
    return { el: el, upd: upd, set: function (v) { if (window.LabNum) window.LabNum.set(el, v); else { el.value = v; el.dispatchEvent(new Event('input')); } } };
  }
  function lamLabel(v) {
    const c = C.monoLinear(v).map(g8);
    return '<span class="swatch" style="background:rgb(' + c.join(',') + ')"></span>' + trim(v, 1) + ' nm';
  }
  const sLam = bind('lam', lamLabel, function (v) { lightNow().lam = v; }, true);
  const sSh = bind('sh', function (v) { return Math.round(v) + ' nm'; }, function (v) { st.soap.hb = v; st.soap.h0 = v; st.soap.t = 0; });
  bind('sn', function (v) { return trim(v, 3); }, function (v) { st.soap.n = v; });
  bind('sa', function (v) { return trim(v, 1) + '°'; }, function (v) { st.soap.ang = v; });
  const sWD = bind('wD', function (v) { return st.wedge.mys && !st.revealed.wedge ? '?' : trim(v, 2) + ' μm'; }, function (v) { st.wedge.D = v; });
  const sWx = bind('wx', function (v) { return trim(v, 2) + ' cm'; }, function (v) { st.wedge.x0 = v; });
  bind('wL', function (v) { return trim(v, 2) + ' cm'; }, function (v) {
    st.wedge.L = v;
    $('wx').max = String(Math.round(v * 1.08 * 100) / 100);
    if (st.wedge.x0 > v * 1.08) sWx.set(v);
    sWx.upd();
  });
  const sWn = bind('wn', function (v) { return trim(v, 3); }, function (v) { st.wedge.n = v; });
  bind('wv', function (v) { return trim(v, 1) + ' mm'; }, function (v) { st.wedge.vw = v; });
  const sNR = bind('nR', function (v) { return st.newton.mys && !st.revealed.newton ? '?' : trim(v, 3) + ' m'; }, function (v) { st.newton.R = v; });
  const sNn = bind('nn', function (v) { return trim(v, 3); }, function (v) { st.newton.n = v; });
  const sNe = bind('ne', function (v) { return st.newton.mys && !st.revealed.newton ? '?' : trim(v, 1) + ' nm'; }, function (v) { st.newton.e = v; });
  const sIdx = bind('idx', function (v) { return String(Math.round(v)); }, function (v) { nextIdx[st.mode] = Math.round(v); });
  const nextIdx = { soap: 0, wedge: 0, newton: 1 };
  /** 程式改編號（不觸發 input 事件） */
  function setIdx(v) {
    nextIdx[st.mode] = v;
    const el = $('idx');
    if (window.LabNum) window.LabNum.clear(el);
    el.value = String(v); sIdx.upd();
  }

  document.querySelectorAll('[data-lam]').forEach(function (b) { b.addEventListener('click', function () { setSource('mono'); sLam.set(+b.dataset.lam); }); });
  document.querySelectorAll('[data-wn]').forEach(function (b) { b.addEventListener('click', function () { sWn.set(+b.dataset.wn); }); });
  document.querySelectorAll('[data-nn]').forEach(function (b) { b.addEventListener('click', function () { sNn.set(+b.dataset.nn); }); });

  function press(sel, attr, v) { document.querySelectorAll(sel).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === v)); }); }
  function setSource(src) {
    lightNow().white = src === 'white';
    press('[data-src]', 'data-src', src);
    $('monoRows').hidden = src === 'white';
    $('whiteNote').hidden = src !== 'white';
    changed();
  }
  document.querySelectorAll('[data-src]').forEach(function (b) { b.addEventListener('click', function () { setSource(b.dataset.src); }); });
  document.querySelectorAll('[data-beams]').forEach(function (b) {
    b.addEventListener('click', function () { st.beams = b.dataset.beams; press('[data-beams]', 'data-beams', st.beams); changed(); });
  });
  document.querySelectorAll('[data-view]').forEach(function (b) {
    b.addEventListener('click', function () { st.newton.view = b.dataset.view; press('[data-view]', 'data-view', st.newton.view); $('enhRow').hidden = st.newton.view !== 'T'; changed(); });
  });
  $('enh').addEventListener('change', function () { st.newton.enh = $('enh').checked; changed(); });

  function setMode(m) {
    stopDrain();
    st.mode = m;
    press('[data-mode]', 'data-mode', m);
    $('soapCard').hidden = m !== 'soap';
    $('wedgeCard').hidden = m !== 'wedge';
    $('newtonCard').hidden = m !== 'newton';
    $('measCard').hidden = m === 'soap';
    $('soapBtns').hidden = m !== 'soap';
    // 光源卡片顯示這個實驗自己的光源設定
    const l = lightNow();
    press('[data-src]', 'data-src', l.white ? 'white' : 'mono');
    $('monoRows').hidden = l.white; $('whiteNote').hidden = !l.white;
    if (window.LabNum) window.LabNum.set($('lam'), l.lam); else $('lam').value = l.lam;
    sLam.upd();
    setIdx(nextIdx[m]);
    $('idxLabel').innerHTML = m === 'newton' ? T('暗環序數 <i>m</i>', 'Dark ring number <i>m</i>') : T('暗紋編號 <i>k</i>（接觸線為 0）', 'Dark fringe number <i>k</i> (contact line = 0)');
    $('enhRow').hidden = st.newton.view !== 'T';
    $('sceneHint').textContent = m === 'soap'
      ? T('拖曳膜上的游標（或用上下方向鍵），讀出各高度的厚度與顏色；黑色背景板讓反射光看得清楚。', 'Drag the cursor on the film (or use the up and down arrow keys) to read the thickness and colour at each height; the black board behind makes the reflected light easy to see.')
      : m === 'wedge'
        ? T('上：讀數顯微鏡視野，點一下或拖曳放十字線量暗紋位置；中、下：整片玻璃與側視示意，可拖曳移動顯微鏡。', 'Top: the measuring microscope — tap or drag to place the crosshair on a dark fringe. Middle and bottom: the whole plate and a side view — drag to move the microscope.')
        : T('在顯微鏡視野中點一下或拖曳十字線（或用左右方向鍵）量環的半徑；側視圖為示意。', 'Tap or drag the crosshair in the microscope view (or use the left and right arrow keys) to measure ring radii; the side view is schematic.');
    renderMys();
    renderTable();
    renderLegend();
    setKeyItems();
    changed(true);
  }
  document.querySelectorAll('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { setMode(b.dataset.mode); }); });

  function renderLegend() {
    const lg = $('legend');
    if (st.mode === 'soap' && isWhite()) {
      lg.innerHTML = '<span><i style="background:var(--field)"></i>' + T('游標處的反射光譜 R(λ)', 'reflected spectrum R(λ) at the cursor') + '</span>' +
        '<span><i style="background:linear-gradient(90deg,#4f00ff,#00ff00,#ff0000)"></i>' + T('各波長的顏色', 'colour of each wavelength') + '</span>';
    } else {
      lg.innerHTML = '<span><i style="background:var(--field)"></i>' + (isWhite() ? T('亮度 Y', 'brightness Y') : T('相對亮度', 'relative brightness')) + '</span>' +
        '<span><i style="background:linear-gradient(90deg,#000,#888,#000)"></i>' + T('實際看到的顏色', 'colour actually seen') + '</span>' +
        '<span><i style="background:var(--probe)"></i>' + T('游標', 'cursor') + '</span>';
    }
  }

  // ---------- 排液動畫 ----------
  let raf = 0, lastT = 0;
  function syncDrainBtn() { $('drain').textContent = st.soap.play ? T('暫停排液', 'Pause') : T('排液 ▶', 'Drain ▶'); }
  function stopDrain() { st.soap.play = false; syncDrainBtn(); }
  $('drain').addEventListener('click', function () {
    st.soap.play = !st.soap.play;
    if (st.soap.play && st.soap.hb < 15) { st.soap.h0 = st.soap.hb; }
    syncDrainBtn();
    if (st.soap.play) { lastT = 0; loop(); }
  });
  $('reblow').addEventListener('click', function () {
    stopDrain();
    st.soap.t = 0;
    sSh.set(1200);
  });
  let lastEmit = 0;
  function loop() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function (ts) {
      if (!st.soap.play || st.mode !== 'soap') return;
      const dt = lastT ? Math.min(1 / 30, (ts - lastT) / 1000) : 0;
      lastT = ts;
      st.soap.t += dt;
      st.soap.hb = C.drain(st.soap.h0, st.soap.t, TAU_DRAIN);
      const el = $('sh');
      if (window.LabNum) window.LabNum.clear(el);
      el.value = String(st.soap.hb);
      $('sho').textContent = Math.round(st.soap.hb) + ' nm';
      drawScene(); drawGraph();
      if (ts - lastEmit > 250) { lastEmit = ts; updateReadout(); emitSoon(0); }
      loop();
    });
  }

  // ---------- 神秘細線、神秘透鏡 ----------
  function renderMys() {
    const wm = st.wedge.mys, nm = st.newton.mys;
    $('wMys').textContent = wm ? T('結束挑戰', 'End challenge') : T('神秘細線', 'Mystery thread');
    $('nMys').textContent = nm ? T('結束挑戰', 'End challenge') : T('神秘透鏡', 'Mystery lens');
    $('wD').disabled = !!wm; $('nR').disabled = !!nm; $('ne').disabled = !!nm;
    $('dust').disabled = !!nm;
    const on = st.mode === 'wedge' ? !!wm : st.mode === 'newton' ? !!nm : false;
    $('ansRow').hidden = !on;
    $('ansLabel').innerHTML = st.mode === 'wedge' ? T('你算出的 <i>D</i>（μm）', 'Your <i>D</i> (μm)') : T('你算出的 <i>R</i>（m）', 'Your <i>R</i> (m)');
    sWD.upd(); sNR.upd(); sNe.upd();
  }
  $('wMys').addEventListener('click', function () {
    if (st.wedge.mys) { st.wedge.mys = null; st.revealed.wedge = false; }
    else { st.wedge.mys = { D: Math.round((12 + rand() * 78) * 10) / 10 }; st.revealed.wedge = false; $('ansMsg').textContent = ''; $('ans').value = ''; }
    renderMys(); renderTable(); changed();
  });
  $('nMys').addEventListener('click', function () {
    if (st.newton.mys) { st.newton.mys = null; st.revealed.newton = false; }
    else {
      st.newton.mys = { R: Math.round((0.6 + rand() * 2.9) * 100) / 100, e: st.newton.dust ? Math.round(60 + rand() * 340) : 0, dust: st.newton.dust };
      st.revealed.newton = false; $('ansMsg').textContent = ''; $('ans').value = '';
    }
    renderMys(); renderTable(); changed();
  });
  $('dust').addEventListener('change', function () { st.newton.dust = $('dust').checked; });
  $('ansBtn').addEventListener('click', function () {
    const g = parseFloat(String($('ans').value).replace(',', '.'));
    const msg = $('ansMsg');
    if (!isFinite(g) || g <= 0) { msg.className = ''; msg.textContent = T('請輸入數字', 'Enter a number'); return; }
    const wedge = st.mode === 'wedge';
    const truth = wedge ? st.wedge.mys && st.wedge.mys.D : st.newton.mys && st.newton.mys.R;
    if (!truth) return;
    const err = (g - truth) / truth;
    const ok = Math.abs(err) <= 0.02;
    msg.className = ok ? 'ok' : '';
    msg.textContent = ok ? T('正確！誤差 ', 'Correct! Error ') + fx(err * 100, 1) + ' %' : (Math.abs(err) <= 0.1 ? T('很接近了，再量準一點', 'Close — measure more carefully') : T('還差得遠，檢查一下公式與單位', 'Not yet — check the formula and units'));
    if (window.LabMission && userActed) {
      window.LabMission.emit('answer', { kind: wedge ? 'wire' : 'lens', truth: truth, guess: g, err: err, dust: !wedge && !!st.newton.mys.e, e: wedge ? 0 : st.newton.mys.e, revealed: st.revealed[st.mode] });
    }
  });
  $('reveal').addEventListener('click', function () {
    st.revealed[st.mode] = true;
    const msg = $('ansMsg');
    msg.className = '';
    msg.textContent = st.mode === 'wedge'
      ? T('答案：D = ', 'Answer: D = ') + trim(st.wedge.mys.D, 1) + ' μm'
      : T('答案：R = ', 'Answer: R = ') + trim(st.newton.mys.R, 2) + ' m' + (st.newton.mys.e ? T('，灰塵厚 e = ', ', dust e = ') + st.newton.mys.e + ' nm' : '');
    renderMys(); changed();
  });

  // ---------- 記錄 ----------
  $('rec').addEventListener('click', function () {
    const nwt = st.mode === 'newton', cx = nwt ? st.newton.cx : st.wedge.cx;
    if (cx == null) { $('recNote').textContent = T('先在顯微鏡視野中放好十字線。', 'Place the crosshair in the microscope view first.'); return; }
    const k = Math.round(val($('idx')));
    rows().push({ k: k, v: nwt ? Math.abs(cx) / MM : cx / MM, sig: sig() });
    if (k < +$('idx').max) setIdx(k + 1);
    renderTable(); emitSoon();
    liveFit(T('已記錄 ', 'Recorded ') + (nwt ? 'm' : 'k') + ' = ' + k + T('，', ', ') + (nwt ? 'r' : 'x') + ' = ' + fx(nwt ? Math.abs(cx) / MM : cx / MM, 3) + ' mm' + T('。', '.'));
  });
  $('undo').addEventListener('click', function () {
    const r = rows(); if (!r.length) return;
    const last = r.pop();
    setIdx(last.k);
    renderTable(); emitSoon();
    liveFit(T('已刪除最後一筆。', 'Removed the last row.'));
  });
  $('clearAll').addEventListener('click', function () {
    rows().length = 0;
    setIdx(st.mode === 'newton' ? 1 : 0);
    renderTable(); emitSoon();
    liveSay(T('已清除所有紀錄。', 'All records cleared.'));
  });

  // ---------- 游標：拖曳、點擊、方向鍵 ----------
  let drag = null;
  function sceneHit(x, y) {
    const o = lay;
    if (!o) return null;
    if (st.mode === 'soap') {
      if (x >= o.fx - 26 && x <= o.px + o.pw + 10 && y >= o.fy - 10 && y <= o.fy + o.fh + 10) return 'soap';
      return null;
    }
    if (st.mode === 'wedge') {
      if (y >= o.my && y <= o.my + o.mh) return 'micro';
      if (y >= o.ty - 14) return 'pan';
      return null;
    }
    if (Math.hypot(x - o.fcx, y - o.fcy) <= o.fr + 12) return 'ring';
    return null;
  }
  function applyDrag(kind, x, y) {
    const o = lay;
    if (kind === 'soap') st.soap.z = clamp((y - o.fy) / o.fh, 0, 1);
    else if (kind === 'micro') {
      const xa = st.wedge.x0 * CM - st.wedge.vw / 2 * MM;
      st.wedge.cx = xa + clamp((x - o.mx) / o.mw, 0, 1) * st.wedge.vw * MM;
    } else if (kind === 'pan') {
      const v = clamp((x - o.sx) / o.sw * o.Lp, 0, o.Lp);
      sWx.set(Math.round(v * 100) / 100);
      return;
    } else if (kind === 'ring') {
      const rv = newtonView();
      st.newton.cx = clamp((x - o.fcx) / o.fr, -1, 1) * rv;
    }
    changed();
  }
  function pos(cv, ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
  scene.cv.addEventListener('pointerdown', function (ev) {
    const p = pos(scene.cv, ev), k = sceneHit(p[0], p[1]);
    if (!k) return;
    drag = k;
    try { scene.cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    applyDrag(k, p[0], p[1]);
    ev.preventDefault();
  });
  scene.cv.addEventListener('pointermove', function (ev) {
    const p = pos(scene.cv, ev);
    if (drag) { applyDrag(drag, p[0], p[1]); return; }
    const k = sceneHit(p[0], p[1]);
    scene.cv.style.cursor = k === 'soap' ? 'ns-resize' : k === 'pan' ? 'ew-resize' : k ? 'crosshair' : 'default';
  });
  const endDrag = function () { if (drag) { drag = null; emitSoon(); } };
  scene.cv.addEventListener('pointerup', endDrag);
  scene.cv.addEventListener('pointercancel', endDrag);
  // 下方圖：點擊、拖曳移動游標
  let gdrag = false;
  function graphAt(ev) {
    if (!gl) return;
    const p = pos(graph.cv, ev);
    if (st.mode === 'soap' && isWhite()) {
      st.soap.specLam = clamp(380 + (p[0] - gl.x) / gl.gw * 400, 380, 780);
    } else {
      const v = gl.x0 + clamp((p[0] - gl.x) / gl.w, 0, 1) * (gl.x1 - gl.x0);
      if (st.mode === 'soap') st.soap.z = clamp(v / Math.max(1e-9, st.soap.hb), 0, 1);
      else if (st.mode === 'wedge') st.wedge.cx = v * MM;
      else st.newton.cx = (st.newton.cx != null && st.newton.cx < 0 ? -1 : 1) * v * MM;
    }
    changed();
  }
  graph.cv.addEventListener('pointerdown', function (ev) { gdrag = true; try { graph.cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ } graphAt(ev); });
  graph.cv.addEventListener('pointermove', function (ev) { if (gdrag) graphAt(ev); });
  graph.cv.addEventListener('pointerup', function () { gdrag = false; emitSoon(); });
  graph.cv.addEventListener('pointercancel', function () { gdrag = false; });

  // ---------- 鍵盤操作（js/keys.js）：Enter 切換物件、方向鍵移動、Shift 大步；限制與拖曳相同 ----------
  let kbMoved = 0;
  function keyMoved() { kbMoved = Date.now(); changed(); }
  /** 肥皂膜游標：一次一個像素（Shift 十個） */
  function moveSoap(sgn, big) {
    const z0 = st.soap.z;
    st.soap.z = clamp(z0 + sgn / Math.max(50, lay && lay.fh ? lay.fh : 300) * (big ? 10 : 1), 0, 1);
    if (st.soap.z === z0) return false;
    keyMoved(); return true;
  }
  /** 空氣劈十字線：一次 1/4 像素（看相對亮度讀數微調；Shift 2.5 像素），限制在顯微鏡視野內 */
  function moveWedgeCx(sgn, big) {
    const xa = st.wedge.x0 * CM - st.wedge.vw / 2 * MM, xb = xa + st.wedge.vw * MM;
    const step = st.wedge.vw * MM / (4 * Math.max(100, lay && lay.mw ? lay.mw : 600)) * (big ? 10 : 1);
    const c0 = st.wedge.cx;
    st.wedge.cx = clamp(c0 == null ? st.wedge.x0 * CM : c0 + sgn * step, xa, xb);
    if (st.wedge.cx === c0) return false;
    keyMoved(); return true;
  }
  /** 牛頓環十字線：一次 1/4 像素（Shift 2.5 像素），限制在視野內 */
  function moveNewtonCx(sgn, big) {
    const rv = newtonView(), step = rv / (4 * Math.max(80, lay && lay.fr ? lay.fr : 200)) * (big ? 10 : 1);
    const c0 = st.newton.cx;
    st.newton.cx = clamp(c0 == null ? 0 : c0 + sgn * step, -rv, rv);
    if (st.newton.cx === c0) return false;
    keyMoved(); return true;
  }
  /** 顯微鏡位置：與滑桿相同（每次 0.05 cm，Shift 0.5 cm） */
  function moveScope(sgn, big) {
    const v0 = st.wedge.x0, mx = +$('wx').max;
    const v = clamp(Math.round((v0 + sgn * (big ? 0.5 : 0.05)) * 100) / 100, 0, mx);
    if (v === v0) return false;
    kbMoved = Date.now(); sWx.set(v); return true;
  }
  const sgnX = function (dx, dy) { return dx || -dy; }; // 右、下 = +1；左、上 = −1
  function descNow() {
    prep();
    if (st.mode === 'soap') {
      const h = soapCursorH();
      let t = T('游標處厚度 ', 'Thickness at the cursor ') + Math.round(h) + ' nm';
      if (!isWhite()) {
        const ord = L0.path(h) / lamNm() + 0.5, fr = ord - Math.round(ord);
        t += T('，', ', ') + (Math.abs(fr) < 0.06 ? T('亮紋', 'bright fringe') : Math.abs(Math.abs(fr) - 0.5) < 0.06 ? T('暗紋', 'dark fringe') : T('介於亮暗之間', 'between bright and dark'));
      } else t += T('，亮度 ', ', brightness ') + fx(C.filmColor(L0, h).Y, 2);
      return t;
    }
    if (st.mode === 'wedge') {
      if (st.wedge.cx == null) return T('十字線尚未放置', 'Crosshair not placed');
      const t = wedgeGapNm(clamp(st.wedge.cx, 0, st.wedge.L * CM));
      return T('十字線 x = ', 'Crosshair x = ') + fx(st.wedge.cx / MM, 3) + ' mm' + T('，相對亮度 ', ', relative brightness ') + fx(lumAt(t), 3);
    }
    if (st.newton.cx == null) return T('十字線尚未放置', 'Crosshair not placed');
    const p = newtonP(), t = C.lensGap(Math.abs(st.newton.cx), p.R, p.e) / NM;
    return T('十字線 r = ', 'Crosshair r = ') + fx(Math.abs(st.newton.cx) / MM, 3) + ' mm' + T('，相對亮度 ', ', relative brightness ') + fx(lumAt(t), 3);
  }
  const sceneItems = [], graphItems = [];
  function setKeyItems() {
    sceneItems.length = 0; graphItems.length = 0;
    if (st.mode === 'soap') {
      sceneItems.push({ name: function () { return T('膜上的游標（上下移動）', 'Cursor on the film (moves up and down)'); }, move: function (dx, dy, big) { return moveSoap(sgnX(dx, dy), big); }, describe: descNow });
    } else if (st.mode === 'wedge') {
      sceneItems.push({ name: function () { return T('顯微鏡十字線', 'Microscope crosshair'); }, move: function (dx, dy, big) { return moveWedgeCx(sgnX(dx, dy), big); }, describe: descNow });
      sceneItems.push({ name: function () { return T('顯微鏡位置', 'Microscope position'); }, move: function (dx, dy, big) { return moveScope(sgnX(dx, dy), big); },
        describe: function () { return T('顯微鏡位置 ', 'Microscope position ') + trim(st.wedge.x0, 2) + ' cm'; } });
    } else {
      sceneItems.push({ name: function () { return T('顯微鏡十字線', 'Microscope crosshair'); }, move: function (dx, dy, big) { return moveNewtonCx(sgnX(dx, dy), big); }, describe: descNow });
    }
    graphItems.push({
      name: function () { return st.mode === 'soap' && isWhite() ? T('波長游標', 'Wavelength cursor') : T('圖上的游標', 'Graph cursor'); },
      move: function (dx, dy, big) {
        const sg = sgnX(dx, dy);
        if (st.mode === 'soap' && isWhite()) {
          const v0 = st.soap.specLam;
          st.soap.specLam = clamp(v0 == null ? 550 : v0 + sg * (big ? 10 : 1), 380, 780);
          if (st.soap.specLam === v0) return false;
          keyMoved(); return true;
        }
        if (st.mode === 'soap') return moveSoap(sg, big);
        if (st.mode === 'wedge') return moveWedgeCx(sg, big);
        return moveNewtonCx(sg, big);
      },
      describe: function () {
        if (st.mode === 'soap' && isWhite()) {
          prep();
          const l = st.soap.specLam == null ? 550 : st.soap.specLam;
          return T('波長 ', 'Wavelength ') + Math.round(l) + T(' nm 的反射率 ', ' nm, reflectance ') + fx(L0.R(soapCursorH(), l) * 100, 2) + ' %';
        }
        return descNow();
      }
    });
    if (kbS && kbS.index() >= sceneItems.length) kbS.select(0);
    if (kbG && kbG.index() >= graphItems.length) kbG.select(0);
  }
  const redraw = function () { changed(true); };
  let kbS = null, kbG = null;
  if (window.LabKeys) {
    kbS = window.LabKeys.attach(scene.cv, {
      label: T('薄膜干涉實驗畫面。按 Enter 切換要移動的物件（游標、顯微鏡位置），方向鍵移動，Shift 加方向鍵移動得更多。', 'Thin-film interference view. Press Enter to pick an object (cursor, microscope position), the arrow keys to move it, and Shift with an arrow key to move it further.'),
      items: sceneItems, onChange: redraw
    });
    kbG = window.LabKeys.attach(graph.cv, {
      label: T('亮度分布圖（白光肥皂膜時為反射光譜）。用左右方向鍵移動圖上的游標，Shift 加方向鍵移動得更多。', 'Brightness graph (the reflected spectrum for a soap film in white light). Use the left and right arrow keys to move the cursor on the graph, and Shift with an arrow key for bigger steps.'),
      items: graphItems, onChange: redraw
    });
  }

  // ---------- 分享連結：畫布上的游標位置（滑桿、按鈕由 classroom.js 記錄） ----------
  // classroom.js 由 settings.js 動態載入，可能比本程式晚到：沒有的話等 load 再登記（還原在 load 之後才做）
  function shareReg(LS) {
    LS.register({
      get: function () {
        return { z: +st.soap.z.toFixed(4), sl: st.soap.specLam == null ? null : Math.round(st.soap.specLam),
          wc: st.wedge.cx == null ? null : +(st.wedge.cx / MM).toFixed(4), nc: st.newton.cx == null ? null : +(st.newton.cx / MM).toFixed(4) };
      },
      set: function (o) {
        if (!o || typeof o !== 'object') return;
        const num = function (v) { return typeof v === 'number' && isFinite(v); };
        if (num(o.z)) st.soap.z = clamp(o.z, 0, 1);
        if (o.sl === null) st.soap.specLam = null; else if (num(o.sl)) st.soap.specLam = clamp(o.sl, 380, 780);
        if (o.wc === null) st.wedge.cx = null; else if (num(o.wc)) st.wedge.cx = clamp(o.wc, 0, st.wedge.L * 1.08 * 10) * MM;
        if (o.nc === null) st.newton.cx = null; else if (num(o.nc)) st.newton.cx = clamp(o.nc, -12, 12) * MM;
        changed(true);
      }
    });
  }
  if (window.LabShare) shareReg(window.LabShare);
  else window.addEventListener('load', function () { if (window.LabShare) shareReg(window.LabShare); });

  // ====================================================================
  // 任務模式（missions.js）：使用者親自操作後、狀態穩定約 0.3 s 才回報
  // ====================================================================
  let userActed = false, emitTimer = 0;
  ['input', 'change', 'click', 'pointerdown', 'keydown'].forEach(function (t) {
    document.querySelector('.lab').addEventListener(t, function (e) { if (e.isTrusted) userActed = true; }, true);
  });
  function emitSoon(delay) {
    if (!window.LabMission || !userActed) return;
    clearTimeout(emitTimer);
    if (drag || gdrag) return;
    emitTimer = setTimeout(emitState, delay == null ? 300 : delay);
  }
  function missionData() {
    prep();
    const d = { mode: st.mode, white: isWhite(), lam: isWhite() ? NaN : lamNm(), beams: st.beams };
    if (st.mode === 'soap') {
      const s = st.soap, L = L0, h = soapCursorH(), path = L.path(h);
      const col = C.filmColor(L, h), hv = C.hsv(col.srgb);
      Object.assign(d, { n: s.n, ang: s.ang, hb: s.hb, t: s.t, h: h, path: path, ord: isWhite() ? NaN : path / lamNm(),
        R: isWhite() ? NaN : L.R(h, lamNm()), Rmax: L.Rmax, Rs: L.Rs(h, isWhite() ? 550 : lamNm()), Rp: L.Rp(h, isWhite() ? 550 : lamNm()),
        rgb: col.srgb, hue: hv.h, sat: hv.s, val: hv.v, brewster: Math.atan(s.n) / DEG });
    } else if (st.mode === 'wedge') {
      const p = wedgeP(), w = C.wedge(p), f = fitNow();
      Object.assign(d, { D: wedgeD(), L: st.wedge.L, n: st.wedge.n, dx: w.dx / MM, count: w.darkCount, mys: !!st.wedge.mys,
        cx: st.wedge.cx == null ? NaN : st.wedge.cx / MM, nRec: f.n, fitDx: f.slope, fitD: isWhite() || !(f.n >= 2) ? NaN : wireFromSpacing(f.slope) });
    } else {
      const p = newtonP(), f = fitNow(), r = st.newton.cx == null ? NaN : Math.abs(st.newton.cx);
      const t = isFinite(r) ? C.lensGap(r, p.R, p.e) : NaN;
      Object.assign(d, { R: p.R, n: p.n, e: newtonE(), view: st.newton.view, mys: !!st.newton.mys, dust: !!(st.newton.mys && st.newton.mys.e),
        r5: p.e > 0 ? NaN : C.darkRingRadius(5, p) / MM, r: r / MM, ord: isWhite() ? NaN : 2 * p.n * t / p.lambda,
        centre: isWhite() ? NaN : 2 * p.n * p.e / p.lambda, nRec: f.n, slope: f.slope,
        fitR: isWhite() ? NaN : f.slope * MM * MM * p.n / p.lambda, fitLam: f.slope * MM * MM * p.n / p.R / NM });
    }
    return d;
  }
  function emitState() {
    if (!window.LabMission || !userActed) return;
    window.LabMission.emit('state', missionData());
  }
  window.__thinfilm = { st: st, missionData: missionData }; // 測試用

  // ====================================================================
  // 更新與重畫
  // ====================================================================
  let pending = false;
  function changed(noEmit) {
    if (!pending) {
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        drawScene(); drawGraph(); updateReadout(); renderLegend();
        if (st.mode !== 'soap') renderTable();
      });
    }
    if (!noEmit) { emitSoon(); liveSoon(); }
  }

  // ---------- 讀數播報（螢幕閱讀器）：改參數後停約 0.8 s、按下記錄時才念；排液動畫中不念，至少間隔 1 s ----------
  let liveTimer = 0, liveLast = 0;
  function liveSay(text) {
    const el = $('live');
    if (!el || !text) return;
    el.textContent = '';
    setTimeout(function () { el.textContent = text; liveLast = Date.now(); }, 30);
  }
  function liveSoon() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () {
      if (st.soap.play && st.mode === 'soap') return;
      if (drag || gdrag || Date.now() - kbMoved < 1200) return; // 拖曳中不念；方向鍵移動時 keys.js 已經念過
      if (Date.now() - liveLast < 1000) { liveSoon(); return; }
      liveSay(liveSummary());
    }, 800);
  }
  /** 目前最重要的結果（一句話） */
  function liveSummary() {
    prep();
    const hide = hidden() && !st.revealed[st.mode];
    if (st.mode === 'soap') {
      const h = soapCursorH();
      return T('肥皂膜：底部厚度 ', 'Soap film: bottom thickness ') + Math.round(st.soap.hb) + ' nm' + T('；', '; ') + descNow() + T('，光程差 ', ', path difference ') + Math.round(L0.path(h)) + ' nm' + T('。', '.');
    }
    if (st.mode === 'wedge') {
      const w = C.wedge(wedgeP());
      if (hide || isWhite()) return T('空氣劈：', 'Air wedge: ') + descNow() + T('。', '.');
      return T('空氣劈：條紋間距 ', 'Air wedge: fringe spacing ') + fx(w.dx / MM, 4) + ' mm' + T('，暗紋 ', ', ') + w.darkCount + T(' 條。', ' dark fringes.');
    }
    const p = newtonP();
    if (hide || isWhite() || p.e > 0) return T('牛頓環：', "Newton's rings: ") + descNow() + T('。', '.');
    return T('牛頓環：第 5 暗環半徑 ', "Newton's rings: 5th dark ring radius ") + fx(C.darkRingRadius(5, p) / MM, 4) + ' mm' + T('；', '; ') + descNow() + T('。', '.');
  }
  /** 記錄、復原、全部清除之後：念出擬合結果 */
  function liveFit(prefix) {
    const f = fitNow(), nwt = st.mode === 'newton';
    let t = prefix + T('列入擬合 ', ' Points in the fit: ') + f.n + T(' 筆', '');
    if (f.n >= 2 && isFinite(f.slope)) t += nwt ? T('，r² 對 m 的斜率 ', ', slope of r² against m ') + fx(f.slope, 5) + ' mm²' : T('，條紋間距 ', ', fringe spacing ') + fx(f.slope, 4) + ' mm';
    liveSay(t + T('。', '.'));
  }

  // 光譜色帶
  (function () {
    const stops = [];
    for (let w = 380; w <= 750; w += 10) stops.push('rgb(' + C.monoLinear(w).map(g8).join(',') + ') ' + ((w - 380) / 370 * 100).toFixed(1) + '%');
    document.querySelectorAll('.spectrum').forEach(function (e) { e.style.background = 'linear-gradient(90deg,' + stops.join(',') + ')'; });
  })();

  function onResize() {
    size(scene); size(graph); size(fitC);
    ringKey = '';
    drawScene(); drawGraph(); updateReadout();
    if (st.mode !== 'soap') renderFit();
  }
  readTokens();
  window.addEventListener('lab:themechange', function () { readTokens(); ringKey = ''; onResize(); });
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const f = function () { setTimeout(function () { readTokens(); ringKey = ''; onResize(); }, 0); };
    if (mq.addEventListener) mq.addEventListener('change', f); else if (mq.addListener) mq.addListener(f);
  }
  if (window.ResizeObserver) {
    let roP = false;
    const ro = new ResizeObserver(function () {
      if (roP) return; roP = true;
      requestAnimationFrame(function () { roP = false; onResize(); });
    });
    ro.observe(scene.cv); ro.observe(graph.cv); ro.observe(fitC.cv);
  } else window.addEventListener('resize', onResize);
  syncDrainBtn();
  setMode('soap');
  onResize();
})();
