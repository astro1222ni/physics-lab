/* trig-functions.js — 「三角函數：單位圓與正弦波」的畫面與互動（數學計算在 trig-functions-core.js；
 * 共用繪圖工具 LabDraw 在 drawkit.js；3D 螺旋在 trig-functions-3d.js，切換到 3D 時才載入） */
(function () {
  'use strict';
  const TC = window.TrigCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const PI = Math.PI, DEG = PI / 180, TAU = 2 * PI;
  const alpha = D.alpha, shade = D.shade;
  const MATCH_TOL = 0.05;     // 挑戰：整條曲線與目標相差都不超過這個值才算對準
  const X_CHECK = 4 * PI;     // 挑戰比對的範圍 [0, 4π]

  // ---------- 狀態 ----------
  const state = {
    mode: 'unit',
    theta: 30,                                   // 單位圓模式的角（度）
    p: { A: 1, w: 1, phi: 0, k: 0 },             // 波形模式
    a: 1.5, b: 1,                                // 疊合模式
    x0: 2,                                       // 波形、疊合模式的游標（弧度）
    show: { cos: true, tan: false, snap: true, base: true, guides: true, parts: true },
    playing: false,
    target: null, targetT0: 0, matched: false, streak: 0, times: [], log: [], nTarget: 0,
    drag: null, hover: null
  };

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'accent-soft', 'surface', 'probe',
      'tf-circle', 'tf-sin', 'tf-cos', 'tf-tan', 'tf-sum', 'tf-target']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight, italic) { return (italic ? 'italic ' : '') + (weight ? weight + ' ' : '') + px + 'px ' + FONT; }

  // ---------- 數字格式 ----------
  function num(v, dec) {
    if (!isFinite(v)) return '—';
    let s = v.toFixed(dec);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function trimN(v, dec) { return TC.trim(v, dec).replace('-', '−'); }
  /** 弧度寫成「π 的分數 ≈ 小數」或只寫小數 */
  function radText(rad) {
    const deg = rad / DEG;
    const pt = TC.piText(deg);
    if (pt !== null) return pt === '0' ? '0' : pt + ' ≈ ' + num(rad, 3);
    return num(rad, 3);
  }
  function radShort(rad) { const pt = TC.piText(rad / DEG); return pt !== null ? pt : num(rad, 3); }
  function degText(deg) { return trimN(deg, 1) + '°'; }

  // ---------- 目前的曲線（三種模式共用的「參考圓」描述） ----------
  /** 目前模式下的正弦波參數（unit：sin x；sum：r sin(x + φ)） */
  function curP() {
    if (state.mode === 'wave') return state.p;
    if (state.mode === 'sum') { const s = TC.superpose(state.a, state.b); return { A: s.r, w: 1, phi: s.phi, k: 0 }; }
    return { A: 1, w: 1, phi: 0, k: 0 };
  }
  /** 游標的 x（弧度） */
  function cursorX() { return state.mode === 'unit' ? state.theta * DEG : state.x0; }
  /** 圓上的點 P（世界座標：橫向 u、縱向 y）與圓心、半徑 */
  function circleInfo() {
    const x = cursorX();
    if (state.mode === 'unit') {
      const u = TC.unit(state.theta);
      return { cx: 0, cy: 0, r: 1, P: { u: u.cos, y: u.sin } };
    }
    if (state.mode === 'wave') {
      const p = state.p, t = p.w * x + p.phi * DEG;
      return { cx: 0, cy: p.k, r: Math.abs(p.A), P: { u: p.A * Math.cos(t), y: p.A * Math.sin(t) + p.k } };
    }
    const s = TC.superpose(state.a, state.b);
    const Pa = { u: state.a * Math.cos(x), y: state.a * Math.sin(x) };
    return { cx: 0, cy: 0, r: s.r, Pa: Pa, P: { u: Pa.u - state.b * Math.sin(x), y: Pa.y + state.b * Math.cos(x) } };
  }

  // ---------- 畫布與版面 ----------
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 300, L = null;
  const RAD = 9;
  function layout() {
    const narrow = cw < 600;
    const gap = narrow ? 6 : 10;
    const padT = narrow ? 22 : 26, padB = narrow ? 30 : 40;
    const plotH = narrow ? Math.round(Math.max(150, cw * 0.46)) : Math.round(Math.min(Math.max(cw * 0.34, 240), 380));
    const H = padT + plotH + padB;
    const cwid = Math.round(plotH * 0.84) + (narrow ? 6 : 18);
    return {
      narrow: narrow, gap: gap, padT: padT, padB: padB, plotH: plotH, H: H, midY: padT + plotH / 2,
      circ: { x: 0, y: 0, w: cwid, h: H }, graph: { x: cwid + gap, y: 0, w: cw - cwid - gap, h: H },
      gl: narrow ? 24 : 30, gr: narrow ? 8 : 12
    };
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
    requestDraw();
  }

  // ---------- 縱軸比例（分級，平順地移過去）與橫軸視窗 ----------
  const LEVELS = [1.4, 1.75, 2.3, 2.9, 3.5, 4.1, 4.7, 5.8, 7];
  let viewR = 1.4, targetR = 1.4;
  function neededR() {
    let need = 1;
    if (state.mode === 'wave') {
      need = Math.max(1, Math.abs(state.p.A) + Math.abs(state.p.k));
      if (state.target) need = Math.max(need, Math.abs(state.target.A) + Math.abs(state.target.k));
    } else if (state.mode === 'sum') {
      need = Math.max(1, TC.superpose(state.a, state.b).r);
    }
    const want = need * 1.2;
    for (let i = 0; i < LEVELS.length; i++) if (LEVELS[i] >= want - 1e-9) return LEVELS[i];
    return LEVELS[LEVELS.length - 1];
  }
  function retarget(snap) {
    targetR = neededR();
    if (snap || reducedMotion) viewR = targetR;
  }
  let lastT = 0;
  function easeView(now) {
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016;
    lastT = now;
    if (Math.abs(Math.log(viewR / targetR)) < 1e-3) { viewR = targetR; return false; }
    const f = 1 - Math.exp(-dt / 0.1);
    viewR = Math.exp(Math.log(viewR) + (Math.log(targetR) - Math.log(viewR)) * f);
    return true;
  }
  function ky() { return L.plotH / (2 * viewR); }
  function Y(y) { return L.midY - y * ky(); }
  function Yinv(py) { return (L.midY - py) / ky(); }
  function circCX() { return L.circ.x + L.circ.w / 2; }
  function CU(u) { return circCX() + u * ky(); }
  /** 橫軸視窗：寬螢幕 0–4π；窄螢幕 2π 寬 */
  function xWin() {
    const xw = L.narrow ? TAU : 2 * TAU;
    // 單位圓模式的角超過畫面（窄螢幕 2π 以後）就換到下一頁 [2π, 4π]，像翻頁一樣（拖曳時不會亂跑）
    const xs = state.mode === 'unit' && state.theta * DEG > xw + 1e-9 ? xw : 0;
    return { xs: xs, xw: xw };
  }
  function gx0() { return L.graph.x + L.gl; }
  function gx1() { return L.graph.x + L.graph.w - L.gr; }
  function kx() { return (gx1() - gx0()) / xWin().xw; }
  function X(x) { return gx0() + (x - xWin().xs) * kx(); }
  function Xinv(px) { return xWin().xs + (px - gx0()) / kx(); }

  // =====================================================================
  // 繪圖
  // =====================================================================
  function panelBg(R) {
    ctx.save();
    D.roundRect(ctx, R.x, R.y, R.w, R.h, RAD);
    ctx.clip();
    ctx.translate(R.x, R.y);
    D.backdrop(ctx, R.w, R.h);
    ctx.restore();
  }
  function panelFrame(R) {
    ctx.save(); D.roundRect(ctx, R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1, RAD); ctx.strokeStyle = alpha(C.border, 0.9); ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
  }
  function snapPx(v) { return (Math.round(v * dpr) + 0.5) / dpr; }
  function hLine(x0, x1, y, color, a, w, dash) {
    ctx.save();
    ctx.strokeStyle = alpha(color, a); ctx.lineWidth = w || 1;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x0, snapPx(y)); ctx.lineTo(x1, snapPx(y)); ctx.stroke();
    ctx.restore();
  }
  function vLine(x, y0, y1, color, a, w, dash) {
    ctx.save();
    ctx.strokeStyle = alpha(color, a); ctx.lineWidth = w || 1;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(snapPx(x), y0); ctx.lineTo(snapPx(x), y1); ctx.stroke();
    ctx.restore();
  }
  /** 縱軸格線的間距（單位）：太密時加大 */
  function yStep() { const k = ky(); return k >= 26 ? 1 : 2; }
  function plotTop() { return L.padT; }
  function plotBot() { return L.padT + L.plotH; }
  function grad(c0, c1, x0, y0, x1, y1) { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }

  // ---------- 左：單位圓／參考圓 ----------
  function drawCirclePanel() {
    const R = L.circ;
    panelBg(R);
    ctx.save();
    D.roundRect(ctx, R.x, R.y, R.w, R.h, RAD); ctx.clip();
    const k = ky(), cx = circCX();
    // 格線：與右邊的縱軸對齊（同一個比例）
    const st = yStep();
    D.grid(ctx, R.x, plotTop() - 6, R.x + R.w, plotBot() + 6, st * k, k * st >= 60 ? k * st / 5 : 0, cx, Y(0));
    // 坐標軸
    hLine(R.x + 4, R.x + R.w - 4, Y(0), C.text, 0.42, 1);
    vLine(cx, plotTop() - 4, plotBot() + 4, C.text, 0.42, 1);
    const ci = circleInfo();
    const ccx = CU(ci.cx), ccy = Y(ci.cy), rr = ci.r * k;
    const P = { x: CU(ci.P.u), y: Y(ci.P.y) };

    if (state.mode === 'unit') drawUnitCircle(ci, P, ccx, ccy, rr);
    else if (state.mode === 'wave') drawRefCircle(ci, P, ccx, ccy, rr);
    else drawSumCircle(ci, P, ccx, ccy, rr);

    // 點 P
    const hot = state.hover === 'P' || (state.drag && (state.drag.kind === 'P' || state.drag.kind === 'ring'));
    D.ball(ctx, P.x, P.y, hot ? 8.5 : 7.5, C.probe);
    ctx.restore();
    // 標題
    D.pill(ctx, state.mode === 'unit' ? T('單位圓', 'Unit circle') : state.mode === 'wave' ? T('參考圓', 'Reference circle') : T('箭頭相加', 'Adding arrows'),
      R.x + 8, R.y + (L.narrow ? 19 : 22), C.muted, 'left', fnt(L.narrow ? 11 : 12, 600));
    panelFrame(R);
    return P;
  }
  function ringTube(ccx, ccy, rr, color, width) {
    if (rr < 0.5) return;
    D.tube(ctx, function (c) { c.arc(ccx, ccy, rr, 0, TAU); }, color, width);
  }
  function drawUnitCircle(ci, P, ccx, ccy, rr) {
    const k = ky(), u = TC.unit(state.theta);
    // 象限編號
    ctx.save();
    ctx.font = fnt(L.narrow ? 11 : 12.5, 600);
    ctx.fillStyle = alpha(C.muted, 0.55);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [['I', 1, 1], ['II', -1, 1], ['III', -1, -1], ['IV', 1, -1]].forEach(function (q) {
      ctx.fillText(q[0], ccx + q[1] * rr * 0.5, ccy - q[2] * rr * 0.5);
    });
    ctx.restore();
    ringTube(ccx, ccy, rr, C['tf-circle'], L.narrow ? 3 : 3.6);
    // 角 θ 的弧（轉超過一圈時畫成往外擴的螺旋）
    const th = state.theta * DEG;
    ctx.save();
    ctx.strokeStyle = alpha(C.text, 0.75); ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    ctx.beginPath();
    const r0 = Math.max(11, rr * 0.2), grow = Math.max(3, rr * 0.06);
    const n = Math.max(8, Math.ceil(th / (4 * DEG)));
    for (let i = 0; i <= n; i++) {
      const t = th * i / n, r = r0 + grow * t / TAU;
      const x = ccx + r * Math.cos(t), y = ccy - r * Math.sin(t);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (th > 0.12) {
      const rEnd = r0 + grow * th / TAU, a = th;
      const hx = ccx + rEnd * Math.cos(a), hy = ccy - rEnd * Math.sin(a);
      const tx = -Math.sin(a), ty = -Math.cos(a); // 逆時針方向（螢幕座標）
      ctx.fillStyle = alpha(C.text, 0.75);
      ctx.beginPath();
      ctx.moveTo(hx + tx * 5, hy + ty * 5);
      ctx.lineTo(hx - tx * 1.5 + Math.cos(a) * 3.2, hy - ty * 1.5 - Math.sin(a) * 3.2);
      ctx.lineTo(hx - tx * 1.5 - Math.cos(a) * 3.2, hy - ty * 1.5 + Math.sin(a) * 3.2);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    const lr = r0 + grow * th / TAU + 11, la = Math.min(th, TAU) / 2 || 0.3;
    D.haloText(ctx, 'θ', ccx + lr * Math.cos(la), ccy - lr * Math.sin(la), C.text, 'center', 'middle', fnt(L.narrow ? 12 : 13.5, 600, true));
    // tan：終邊延長到直線 x = 1
    if (state.show.tan && isFinite(u.tan)) {
      const lim = viewR * 0.98;
      const ty = Math.max(-lim, Math.min(lim, u.tan));
      const ex = CU(1), ey = Y(ty);
      vLine(ex, Y(-viewR), Y(viewR), C['tf-tan'], 0.35, 1, [3, 4]);
      ctx.save();
      ctx.strokeStyle = alpha(C['tf-tan'], 0.6); ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(ccx, ccy);
      const s = Math.abs(u.cos) > 1e-9 ? ty / u.tan : 1;
      ctx.lineTo(CU(s), Y(s * u.tan));
      ctx.stroke(); ctx.restore();
      ctx.save(); ctx.strokeStyle = C['tf-tan']; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ex, Y(0)); ctx.lineTo(ex, ey); ctx.stroke(); ctx.restore();
      if (Math.abs(u.tan) <= lim) D.ball(ctx, ex, ey, 4, C['tf-tan'], { shadow: false });
      D.haloText(ctx, 'tan θ', ex + 6, (Y(0) + ey) / 2, C['tf-tan'], 'left', 'middle', fnt(L.narrow ? 10.5 : 12, 600));
    }
    // cos（橫向）與 sin（縱向）兩段
    const k2 = L.narrow ? 3.2 : 4;
    if (state.show.cos) {
      ctx.save(); ctx.strokeStyle = C['tf-cos']; ctx.lineWidth = k2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ccx, ccy); ctx.lineTo(P.x, ccy); ctx.stroke(); ctx.restore();
      if (Math.abs(P.x - ccx) > 18) D.haloText(ctx, 'cos θ', (ccx + P.x) / 2, ccy + (u.sin >= 0 ? 12 : -12), C['tf-cos'], 'center', 'middle', fnt(L.narrow ? 10.5 : 12, 600));
    }
    // 半徑 OP
    ctx.save(); ctx.strokeStyle = alpha(C.text, 0.8); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ccx, ccy); ctx.lineTo(P.x, P.y); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.strokeStyle = C['tf-sin']; ctx.lineWidth = k2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(P.x, ccy); ctx.lineTo(P.x, P.y); ctx.stroke(); ctx.restore();
    if (Math.abs(P.y - ccy) > 18) {
      const f = fnt(L.narrow ? 10.5 : 12, 600);
      ctx.font = f;
      const tw = ctx.measureText('sin θ').width;
      // 預設放在線段外側；放不下（會超出這一格）就放到內側
      let right = u.cos >= 0;
      if (right && P.x + 7 + tw > L.circ.x + L.circ.w - 4) right = false;
      if (!right && P.x - 7 - tw < L.circ.x + 4) right = true;
      D.haloText(ctx, 'sin θ', P.x + (right ? 7 : -7), (ccy + P.y) / 2, C['tf-sin'], right ? 'left' : 'right', 'middle', f);
    }
    // 坐標軸與圓的交點刻度 1、−1
    ctx.save();
    ctx.font = fnt(L.narrow ? 9.5 : 10.5); ctx.fillStyle = alpha(C.muted, 0.9);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('1', CU(1) + 3, Y(0) + 2);
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('1', ccx - 3, Y(1) - 1);
    ctx.restore();
  }
  function drawRefCircle(ci, P, ccx, ccy, rr) {
    const p = state.p;
    // 中線 y = k
    if (Math.abs(p.k) > 1e-9) hLine(L.circ.x + 4, L.circ.x + L.circ.w - 4, ccy, C['tf-sin'], 0.45, 1, [6, 3, 1.5, 3]);
    ringTube(ccx, ccy, rr, C['tf-circle'], L.narrow ? 3 : 3.6);
    // 起始的位置（x = 0 時的點）：小空心圈
    if (rr > 2) {
      const t0 = p.phi * DEG;
      const sx = CU(p.A * Math.cos(t0)), sy = Y(p.A * Math.sin(t0) + p.k);
      ctx.save(); ctx.strokeStyle = alpha(C.text, 0.6); ctx.lineWidth = 1.4; ctx.fillStyle = C['canvas-bg'];
      ctx.beginPath(); ctx.arc(sx, sy, 4, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      if (!L.narrow) D.haloText(ctx, 'x = 0', sx + (Math.cos(t0) * p.A >= 0 ? 7 : -7), sy, C.muted, Math.cos(t0) * p.A >= 0 ? 'left' : 'right', 'middle', fnt(10.5));
    }
    // 半徑與高度
    ctx.save(); ctx.strokeStyle = alpha(C.text, 0.8); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ccx, ccy); ctx.lineTo(P.x, P.y); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.strokeStyle = C['tf-sin']; ctx.lineWidth = L.narrow ? 3.2 : 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(P.x, ccy); ctx.lineTo(P.x, P.y); ctx.stroke(); ctx.restore();
    if (rr > 14) D.haloText(ctx, '|A|', (ccx + P.x) / 2 - 6, (ccy + P.y) / 2 - 6, C.text, 'right', 'bottom', fnt(L.narrow ? 10.5 : 12, 600, true));
    D.haloText(ctx, 'ωx + φ', ccx + 6, ccy + 14, C.muted, 'left', 'middle', fnt(L.narrow ? 10 : 11.5, 600, true));
  }
  function drawSumCircle(ci, P, ccx, ccy, rr) {
    // 合成的圓（半徑 r）
    ctx.save(); ctx.strokeStyle = alpha(C['tf-sum'], 0.45); ctx.lineWidth = 1.4; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(ccx, ccy, rr, 0, TAU); ctx.stroke(); ctx.restore();
    const Pa = { x: CU(ci.Pa.u), y: Y(ci.Pa.y) };
    const w = L.narrow ? 2.4 : 2.8;
    if (Math.hypot(Pa.x - ccx, Pa.y - ccy) > 3) D.arrow(ctx, ccx, ccy, Pa.x, Pa.y, C['tf-sin'], w, { label: 'a' });
    if (Math.hypot(P.x - Pa.x, P.y - Pa.y) > 3) D.arrow(ctx, Pa.x, Pa.y, P.x, P.y, C['tf-cos'], w, { label: 'b' });
    // 直角記號
    const la = Math.hypot(Pa.x - ccx, Pa.y - ccy), lb = Math.hypot(P.x - Pa.x, P.y - Pa.y);
    if (la > 14 && lb > 14) {
      const ux = (ccx - Pa.x) / la, uy = (ccy - Pa.y) / la, vx = (P.x - Pa.x) / lb, vy = (P.y - Pa.y) / lb, s = 7;
      ctx.save(); ctx.strokeStyle = alpha(C.text, 0.6); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Pa.x + ux * s, Pa.y + uy * s); ctx.lineTo(Pa.x + (ux + vx) * s, Pa.y + (uy + vy) * s); ctx.lineTo(Pa.x + vx * s, Pa.y + vy * s); ctx.stroke(); ctx.restore();
    }
    if (rr > 3) D.arrow(ctx, ccx, ccy, P.x, P.y, C['tf-sum'], w + 0.6, { label: 'r' });
  }

  // ---------- 右：函數圖形 ----------
  /** 在 [xa, xb] 畫 y = f(x)（截在畫面範圍內） */
  function pathFn(f, xa, xb, clipR) {
    const n = Math.max(24, Math.ceil((X(xb) - X(xa)) / 2));
    let pen = false;
    for (let i = 0; i <= n; i++) {
      const x = xa + (xb - xa) * i / n, y = f(x);
      if (!isFinite(y) || Math.abs(y) > clipR) { pen = false; continue; }
      if (!pen) { ctx.moveTo(X(x), Y(y)); pen = true; } else ctx.lineTo(X(x), Y(y));
    }
  }
  function strokeFn(f, xa, xb, color, width, opt) {
    opt = opt || {};
    if (xb <= xa) return;
    if (opt.tube) {
      D.tube(ctx, function (c) { pathFnOn(c, f, xa, xb, viewR * 1.05); }, color, width);
      return;
    }
    ctx.save();
    ctx.strokeStyle = opt.a != null ? alpha(color, opt.a) : color;
    ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (opt.dash) ctx.setLineDash(opt.dash);
    ctx.beginPath(); pathFn(f, xa, xb, opt.clip || viewR * 1.05); ctx.stroke();
    ctx.restore();
  }
  function pathFnOn(c, f, xa, xb, clipR) {
    const n = Math.max(24, Math.ceil((X(xb) - X(xa)) / 2));
    let pen = false;
    for (let i = 0; i <= n; i++) {
      const x = xa + (xb - xa) * i / n, y = f(x);
      if (!isFinite(y) || Math.abs(y) > clipR) { pen = false; continue; }
      if (!pen) { c.moveTo(X(x), Y(y)); pen = true; } else c.lineTo(X(x), Y(y));
    }
  }
  function drawGraphPanel() {
    const R = L.graph;
    panelBg(R);
    ctx.save();
    D.roundRect(ctx, R.x, R.y, R.w, R.h, RAD); ctx.clip();
    const win = xWin(), xa = win.xs, xb = win.xs + win.xw;
    const k = ky(), kxv = kx();
    const top = plotTop(), bot = plotBot();
    // 格線：縱向每 π/2（太密時每 π），橫向每 1（或 2）
    const xStep = kxv * PI / 2 >= 34 ? PI / 2 : PI;
    const dprv = dpr;
    ctx.save();
    ctx.lineWidth = 1 / dprv;
    ctx.beginPath();
    for (let x = Math.ceil(xa / (PI / 4) - 1e-9) * PI / 4; x <= xb + 1e-9; x += PI / 4) { const px = snapPx(X(x)); ctx.moveTo(px, top - 4); ctx.lineTo(px, bot + 4); }
    ctx.strokeStyle = alpha(C.text, 0.04); ctx.stroke();
    ctx.beginPath();
    for (let x = Math.ceil(xa / xStep - 1e-9) * xStep; x <= xb + 1e-9; x += xStep) { const px = snapPx(X(x)); ctx.moveTo(px, top - 4); ctx.lineTo(px, bot + 4); }
    const st = yStep();
    for (let y = -Math.floor(viewR / st) * st; y <= viewR + 1e-9; y += st) { const py = snapPx(Y(y)); ctx.moveTo(R.x, py); ctx.lineTo(R.x + R.w, py); }
    ctx.strokeStyle = alpha(C.text, 0.1); ctx.stroke();
    ctx.restore();
    // x 軸、y 軸
    hLine(R.x + 2, R.x + R.w - 2, Y(0), C.text, 0.45, 1);
    if (xa <= 1e-9) vLine(X(0), top - 6, bot + 6, C.text, 0.45, 1);
    // 刻度：x 軸用 π 的分數（單位圓模式另外標角度）
    ctx.save();
    const fz = L.narrow ? 10 : 11;
    ctx.font = fnt(fz); ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let x = Math.ceil(xa / xStep - 1e-9) * xStep; x <= xb + 1e-9; x += xStep) {
      if (Math.abs(x) < 1e-9) continue;
      const px = X(x);
      if (px < gx0() + 6 || px > R.x + R.w - 6) continue;
      ctx.fillText(TC.piText(x / DEG), px, bot + 4);
      if (state.mode === 'unit' && !L.narrow) { ctx.fillStyle = alpha(C.muted, 0.75); ctx.fillText(trimN(x / DEG, 0) + '°', px, bot + 4 + fz + 3); ctx.fillStyle = C.muted; }
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let y = -Math.floor(viewR / st) * st; y <= viewR + 1e-9; y += st) {
      if (Math.abs(Y(y) - Y(0)) < 1 && xa <= 1e-9) { ctx.fillText('0', gx0() - 4, Y(0) + 7); continue; }
      ctx.fillText(num(y, 0), gx0() - 4, Y(y));
    }
    ctx.restore();

    if (state.mode === 'unit') drawUnitGraph(xa, xb);
    else if (state.mode === 'wave') drawWaveGraph(xa, xb);
    else drawSumGraph(xa, xb);
    ctx.restore();
    panelFrame(R);
  }
  function drawUnitGraph(xa, xb) {
    const th = state.theta * DEG;
    // tan
    if (state.show.tan) {
      for (let n = Math.floor(xa / PI - 0.5); n * PI + PI / 2 <= xb + PI; n++) {
        const asy = n * PI + PI / 2;
        if (asy >= xa && asy <= xb) vLine(X(asy), plotTop(), plotBot(), C['tf-tan'], 0.3, 1, [3, 4]);
        strokeFn(Math.tan, Math.max(xa, asy - PI + 1e-4), Math.min(xb, asy - 1e-4), C['tf-tan'], 1.6, { a: 0.85 });
      }
    }
    // cos
    if (state.show.cos) {
      strokeFn(Math.cos, xa, xb, C['tf-cos'], 1.5, { a: 0.35, dash: [6, 4] });
      strokeFn(Math.cos, xa, Math.min(th, xb), C['tf-cos'], 2.2, { dash: [7, 4] });
    }
    // sin：整條淡淡的，0 到 θ 這一段畫亮
    strokeFn(Math.sin, xa, xb, C['tf-sin'], 1.6, { a: 0.3 });
    if (th > xa) strokeFn(Math.sin, xa, Math.min(th, xb), C['tf-sin'], L.narrow ? 3.4 : 4, { tube: true });
    // 曲線名稱：sin 放在離游標最遠的波峰上方，cos 放在離游標最遠的波谷下方
    labelOnCurve('y = sin x', Math.sin, farthest(PI / 2, xa, xb, th), C['tf-sin'], -1);
    if (state.show.cos) labelOnCurve('y = cos x', Math.cos, farthest(PI, xa, xb, th), C['tf-cos'], 1);
    // 游標
    const u = TC.unit(state.theta);
    if (th >= xa && th <= xb) {
      vLine(X(th), plotTop(), plotBot(), C.text, 0.25, 1, [2, 3]);
      if (state.show.cos) D.ball(ctx, X(th), Y(u.cos), 4.5, C['tf-cos'], { shadow: false });
      if (state.show.tan && isFinite(u.tan) && Math.abs(u.tan) < viewR) D.ball(ctx, X(th), Y(u.tan), 4, C['tf-tan'], { shadow: false });
      D.ball(ctx, X(th), Y(u.sin), state.hover === 'X' ? 7.5 : 6.5, C['tf-sin']);
    }
  }
  /** x0 + 2πn 之中（在畫面內、離左右邊緣夠遠）離 avoid 最遠的一個 */
  function farthest(x0, xa, xb, avoid) {
    let best = null, bd = -1;
    const m = (xb - xa) * 0.08;
    for (let x = x0 + Math.ceil((xa - x0) / TAU) * TAU; x <= xb; x += TAU) {
      if (x < xa + m || x > xb - m) continue;
      const d = Math.abs(x - avoid);
      if (d > bd) { bd = d; best = x; }
    }
    return best == null ? (xa + xb) / 2 : best;
  }
  /** 曲線名稱：放在 x 處、曲線上方（dir = −1）或下方（1） */
  function labelOnCurve(text, f, x, color, dir) {
    const y = f(x);
    if (!isFinite(y)) return;
    D.pill(ctx, text, X(x), Y(y) + (dir < 0 ? -6 : 22), color, 'center', fnt(L.narrow ? 10.5 : 11.5, 600));
  }
  function drawWaveGraph(xa, xb) {
    const p = state.p, info = TC.waveInfo(p);
    const f = function (x) { return TC.waveY(p, x); };
    if (state.show.base) strokeFn(Math.sin, xa, xb, C.muted, 1.4, { a: 0.55, dash: [5, 4] });
    // 最大值、最小值、中線、週期
    if (state.show.guides) {
      const gxa = L.graph.x + 2, gxb = L.graph.x + L.graph.w - 2;
      hLine(gxa, gxb, Y(p.k), C['tf-sin'], 0.55, 1, [7, 3, 1.5, 3]);
      if (info.amp > 1e-9) {
        hLine(gxa, gxb, Y(info.max), C['tf-sin'], 0.32, 1, [2, 3]);
        hLine(gxa, gxb, Y(info.min), C['tf-sin'], 0.32, 1, [2, 3]);
      }
    }
    // 目標曲線
    if (state.target) {
      const tg = state.target;
      const tf = function (x) { return TC.waveY(tg, x); };
      if (state.matched) {
        strokeFn(tf, xa, xb, C['tf-target'], 9, { a: 0.18 });
        strokeFn(tf, xa, xb, C['tf-target'], 2.4);
      } else strokeFn(tf, xa, xb, C['tf-target'], 2.6, { dash: [9, 6] });
    }
    strokeFn(f, xa, xb, C['tf-sin'], L.narrow ? 3.4 : 4, { tube: true });
    if (state.show.guides) drawWaveGuides(p, info, xa, xb);
    if (state.show.base) labelOnCurve('y = sin x', Math.sin, xa + (xb - xa) * 0.93, C.muted, 1);
    // 游標
    const x0 = state.x0;
    vLine(X(x0), plotTop(), plotBot(), C.text, 0.25, 1, [2, 3]);
    D.ball(ctx, X(x0), Y(f(x0)), state.hover === 'X' ? 7.5 : 6.5, C['tf-sin']);
  }
  function drawWaveGuides(p, info, xa, xb) {
    const fz = fnt(L.narrow ? 10 : 11, 600);
    const rx = L.graph.x + L.graph.w - 6;
    if (info.amp > 1e-9) {
      D.haloText(ctx, T('最大 ', 'max ') + trimN(info.max, 2), rx, Y(info.max) - 7, C['tf-sin'], 'right', 'middle', fz);
      D.haloText(ctx, T('最小 ', 'min ') + trimN(info.min, 2), rx, Y(info.min) + 8, C['tf-sin'], 'right', 'middle', fz);
    }
    if (Math.abs(p.k) > 1e-9 || info.amp < 1e-9) D.haloText(ctx, T('中線 y = ', 'midline y = ') + trimN(p.k, 2), gx0() + 6, Y(p.k) - 8, C['tf-sin'], 'left', 'middle', fz);
    // 週期：第一個最高點到下一個最高點的雙箭頭
    if (info.amp > 1e-9) {
      const x1 = info.firstMax, x2 = x1 + info.period;
      if (x2 <= xb + 1e-9 && X(x2) - X(x1) > 26) {
        const yy = Y(info.max) - (L.narrow ? 9 : 11);
        if (yy > 8) {
          ctx.save(); ctx.strokeStyle = alpha(C.text, 0.7); ctx.fillStyle = alpha(C.text, 0.7); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(X(x1), yy); ctx.lineTo(X(x2), yy); ctx.stroke();
          [[X(x1), 1], [X(x2), -1]].forEach(function (e) {
            ctx.beginPath(); ctx.moveTo(e[0], yy); ctx.lineTo(e[0] + 6 * e[1], yy - 3.2); ctx.lineTo(e[0] + 6 * e[1], yy + 3.2); ctx.closePath(); ctx.fill();
          });
          vLine(X(x1), yy - 4, Y(info.max), C.text, 0.35, 1);
          vLine(X(x2), yy - 4, Y(info.max), C.text, 0.35, 1);
          ctx.restore();
          D.pill(ctx, 'T = ' + radShort(info.period), (X(x1) + X(x2)) / 2, yy - 3, C.text, 'center', fnt(L.narrow ? 10 : 11, 600));
        }
      }
      if (x1 >= xa && x1 <= xb) {
        ctx.save(); ctx.strokeStyle = C['tf-sin']; ctx.lineWidth = 1.6; ctx.fillStyle = C['canvas-bg'];
        ctx.beginPath(); ctx.arc(X(x1), Y(info.max), 5, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
  }
  function drawSumGraph(xa, xb) {
    const a = state.a, b = state.b, s = TC.superpose(a, b);
    const gxa = L.graph.x + 2, gxb = L.graph.x + L.graph.w - 2;
    if (s.r > 1e-9) { hLine(gxa, gxb, Y(s.r), C['tf-sum'], 0.35, 1, [2, 3]); hLine(gxa, gxb, Y(-s.r), C['tf-sum'], 0.35, 1, [2, 3]); }
    if (state.show.parts) {
      strokeFn(function (x) { return a * Math.sin(x); }, xa, xb, C['tf-sin'], 2, { dash: [6, 4] });
      strokeFn(function (x) { return b * Math.cos(x); }, xa, xb, C['tf-cos'], 2, { dash: [6, 4] });
    }
    strokeFn(function (x) { return TC.sumY(a, b, x); }, xa, xb, C['tf-sum'], L.narrow ? 3.4 : 4, { tube: true });
    if (s.r > 1e-9) {
      const fz = fnt(L.narrow ? 10 : 11, 600), rx = L.graph.x + L.graph.w - 6;
      D.haloText(ctx, 'r = ' + trimN(s.r, 3), rx, Y(s.r) - 7, C['tf-sum'], 'right', 'middle', fz);
      D.haloText(ctx, '−r', rx, Y(-s.r) + 8, C['tf-sum'], 'right', 'middle', fz);
    }
    // 游標：在 x₀ 把 a sin x₀ 與 b cos x₀ 疊成一根柱子
    const x0 = state.x0, ya = a * Math.sin(x0), yb = b * Math.cos(x0);
    vLine(X(x0), plotTop(), plotBot(), C.text, 0.25, 1, [2, 3]);
    if (state.show.parts) {
      const px = X(x0) + 5;
      ctx.save(); ctx.lineCap = 'butt'; ctx.lineWidth = 4;
      ctx.strokeStyle = C['tf-sin']; ctx.beginPath(); ctx.moveTo(px, Y(0)); ctx.lineTo(px, Y(ya)); ctx.stroke();
      ctx.strokeStyle = C['tf-cos']; ctx.beginPath(); ctx.moveTo(px, Y(ya)); ctx.lineTo(px, Y(ya + yb)); ctx.stroke();
      ctx.restore();
      D.ball(ctx, X(x0), Y(ya), 4, C['tf-sin'], { shadow: false });
      D.ball(ctx, X(x0), Y(yb), 4, C['tf-cos'], { shadow: false });
    }
    D.ball(ctx, X(x0), Y(ya + yb), state.hover === 'X' ? 7.5 : 6.5, C['tf-sum']);
  }

  // ---------- 兩格之間：P 的高度水平連到圖形 ----------
  function drawConnector(P) {
    const x = cursorX(), win = xWin();
    if (x < win.xs - 1e-9 || x > win.xs + win.xw + 1e-9) return;
    const gx = X(x);
    const col = state.mode === 'sum' ? C['tf-sum'] : C['tf-sin'];
    ctx.save();
    ctx.strokeStyle = alpha(col, 0.7); ctx.lineWidth = 1.3; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(P.x + 8, P.y); ctx.lineTo(gx - 7, P.y); ctx.stroke();
    ctx.restore();
  }

  function draw() {
    if (!L) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    drawGraphPanel();
    const P = drawCirclePanel();
    drawConnector(P);
    if (kb && kb.focused()) {
      ctx.save(); ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      D.roundRect(ctx, 2, 2, cw - 4, ch - 4, RAD); ctx.stroke(); ctx.restore();
    }
  }
  let raf = 0;
  function frame(now) {
    raf = 0;
    if (stage.classList.contains('is3d')) { if (state.playing) { stepPlay(now); requestDraw(); } return; }
    now = now || performance.now();
    if (state.playing) stepPlay(now);
    const moving = easeView(now);
    draw();
    if (moving || state.playing) requestDraw(); else lastT = 0;
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
  let eqKey = '';
  function setEq(tex) {
    if (tex === eqKey) return;
    eqKey = tex;
    const el = $('rEq');
    if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
    else el.textContent = tex;
  }
  function quadName(u) {
    if (u.quadrant) return [T('第一象限', 'Quadrant I'), T('第二象限', 'Quadrant II'), T('第三象限', 'Quadrant III'), T('第四象限', 'Quadrant IV')][u.quadrant - 1];
    return (u.std === 0 || u.std === 180) ? T('在 x 軸上', 'On the x-axis') : T('在 y 軸上', 'On the y-axis');
  }
  function valWithExact(v, ex) {
    if (ex && ex.undefined) return T('沒有定義', 'undefined');
    const s = num(v, 4);
    if (ex && ex.text !== '0' && ex.text !== '1' && ex.text !== '−1') return s + '（' + ex.text + '）';
    return s;
  }
  function degTex(deg) { return TC.trim(deg, 1).replace('-', '-') + '^\\circ'; }
  function updateReadouts() {
    if (state.mode === 'unit') {
      const u = TC.unit(state.theta);
      setHTML('uDeg', degText(state.theta) + (state.theta >= 360 ? T('（同界角 ', ' (coterminal with ') + degText(u.std) + T('）', ')') : ''));
      setHTML('uRad', radText(u.rad));
      setHTML('uQuad', quadName(u));
      setHTML('uRef', degText(u.ref));
      const es = TC.exactSin(state.theta), ec = TC.exactCos(state.theta), et = TC.exactTan(state.theta);
      setHTML('uSin', valWithExact(u.sin, es));
      setHTML('uCos', valWithExact(u.cos, ec));
      setHTML('uTan', isFinite(u.tan) ? valWithExact(u.tan, et) : T('沒有定義', 'undefined'));
      const d = degTex(state.theta);
      let tex;
      if (es) {
        tex = '\\begin{aligned}\\sin ' + d + ' &= ' + es.tex + '\\\\ \\cos ' + d + ' &= ' + ec.tex + '\\\\ \\tan ' + d + ' &= ' +
          (et.undefined ? '\\text{' + T('沒有定義', 'undefined') + '}' : et.tex) + '\\end{aligned}';
      } else {
        tex = '\\begin{aligned}\\sin ' + d + ' &\\approx ' + num(u.sin, 4).replace('−', '-') + '\\\\ \\cos ' + d + ' &\\approx ' + num(u.cos, 4).replace('−', '-') +
          '\\\\ \\tan ' + d + ' &\\approx ' + num(u.tan, 4).replace('−', '-') + '\\end{aligned}';
      }
      setEq(tex);
    } else if (state.mode === 'wave') {
      const info = TC.waveInfo(state.p);
      setHTML('wAmp', trimN(info.amp, 2));
      setHTML('wPer', radText(info.period));
      setHTML('wMax', trimN(info.max, 2) + T('、', ', ') + trimN(info.min, 2));
      setHTML('wMid', 'y = ' + trimN(state.p.k, 2));
      const h = info.shift;
      setHTML('wShift', Math.abs(h) < 1e-12 ? T('沒有平移', 'none') : (h < 0 ? T('向左 ', 'left ') : T('向右 ', 'right ')) + radText(Math.abs(h)));
      setHTML('wFirst', isFinite(info.firstMax) ? radText(info.firstMax) : '—');
      setEq(TC.waveTex(state.p));
    } else {
      const s = TC.superpose(state.a, state.b);
      const r2 = state.a * state.a + state.b * state.b;
      const r2i = Math.round(r2);
      let rs = trimN(s.r, 3);
      if (Math.abs(r2 - r2i) < 1e-6 && r2i > 0 && Math.abs(Math.sqrt(r2i) - Math.round(Math.sqrt(r2i))) > 1e-9) rs = '√' + r2i + ' ≈ ' + num(s.r, 3);
      setHTML('sR', rs);
      const pt = TC.piText(s.phi);
      setHTML('sPhi', s.r < 1e-12 ? '—' : degText(s.phi) + '（' + (pt !== null ? pt : num(s.phi * DEG, 3)) + ' rad）');
      setHTML('sMax', s.r < 1e-12 ? '—' : radText(s.maxAt));
      setEq(sumTex(state.a, state.b, s));
    }
  }
  function sumTex(a, b, s) {
    const as = TC.trim(a, 3), bs = TC.trim(Math.abs(b), 3);
    let left = '';
    if (a !== 0) left = (as === '1' ? '' : as === '-1' ? '-' : as) + '\\sin x';
    if (b !== 0) left += (left ? (b < 0 ? ' - ' : ' + ') : (b < 0 ? '-' : '')) + (bs === '1' ? '' : bs) + '\\cos x';
    if (!left) left = '0';
    if (s.r < 1e-12) return left + ' = 0';
    const rs = TC.trim(s.r, 3);
    const ph = Math.abs(s.phi) < 1e-9 ? '' : (s.phi < 0 ? ' - ' : ' + ') + TC.phaseTex(Math.abs(s.phi));
    return left + ' = ' + (rs === '1' ? '' : rs) + '\\sin' + (ph ? '\\left(x' + ph + '\\right)' : ' x');
  }

  // =====================================================================
  // 狀態列、報讀、音效
  // =====================================================================
  function setStatus(t) { $('status').textContent = t || ''; }
  let sayTimer = 0;
  function say(msg) {
    const el = $('status');
    if (!el || !msg) return;
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () { el.textContent = msg; }, 30);
  }
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  let voice = null;
  /** 持續的音：音高跟著目前的高度 y（越高越高音） */
  function voiceUpdate() {
    const S = sound();
    const active = state.playing || (state.drag && state.drag.moved);
    if (!S || !active) { voiceStop(); return; }
    const ci = circleInfo();
    const yn = Math.max(-1, Math.min(1, ci.P.y / viewR));
    const f = 494 * Math.pow(2, 0.9 * yn);
    if (!voice) voice = S.voice({ freq: f, type: 'sine', gain: 0.13 });
    else voice.set({ freq: f }, 0.03);
  }
  function voiceStop() { if (voice) { voice.stop(0.12); voice = null; } }
  function chime(ok) {
    const S = sound(); if (!S) return;
    if (ok) {
      S.tone({ freq: 659.25, dur: 0.16, type: 'sine', gain: 0.28 });
      S.tone({ freq: 987.77, dur: 0.24, type: 'sine', gain: 0.24, delay: 0.11 });
    } else S.tone({ freq: 523.25, dur: 0.12, type: 'triangle', gain: 0.22 });
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
    if (!on) voiceStop();
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) {
    if (ev.detail && ev.detail.name === 'sound') updateSoundButton();
  });

  // =====================================================================
  // 任務模式：回報數學量
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitAngle(src) {
    const u = TC.unit(state.theta);
    emit('angle', { src: src, theta: state.theta, sin: u.sin, cos: u.cos, tan: u.tan, quadrant: u.quadrant, std: u.std });
  }
  function emitWave(src) {
    const i = TC.waveInfo(state.p);
    emit('wave', { src: src, A: i.A, w: i.w, phi: i.phi, k: i.k, amp: i.amp, period: i.period, max: i.max, min: i.min, firstMax: i.firstMax });
  }
  function emitSum(src) {
    const s = TC.superpose(state.a, state.b);
    emit('sum', { src: src, a: s.a, b: s.b, r: s.r, phi: s.phi });
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  const elTh = $('theta'), elA = $('amp'), elW = $('omega'), elP = $('phi'), elK = $('kk'), ela = $('aa'), elb = $('bb');
  let quiet = false;
  function fmtSlider(v, el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    const stepDec = (String(el.step).split('.')[1] || '').length;
    let s = v.toFixed(dec);
    while (s.indexOf('.') >= 0 && s.length - s.indexOf('.') - 1 > stepDec && s.slice(-1) === '0') s = s.slice(0, -1);
    if (s.slice(-1) === '.') s = s.slice(0, -1);
    return s.replace('-', '−');
  }
  function refreshOutputs() {
    $('thetao').textContent = fmtSlider(val(elTh), elTh) + '°';
    $('ampo').textContent = fmtSlider(val(elA), elA);
    $('omegao').textContent = fmtSlider(val(elW), elW);
    $('phio').textContent = fmtSlider(val(elP), elP) + '°';
    $('kko').textContent = fmtSlider(val(elK), elK);
    $('aao').textContent = fmtSlider(val(ela), ela);
    $('bbo').textContent = fmtSlider(val(elb), elb);
  }
  function readSliders() {
    state.theta = val(elTh);
    state.p = { A: val(elA), w: val(elW), phi: val(elP), k: val(elK) };
    state.a = val(ela); state.b = val(elb);
  }
  function changed() {
    refreshOutputs();
    readSliders();
    retarget(false);
    updateReadouts();
    if (view3) view3.update();
    requestDraw();
  }
  function setSlider(el, v) {
    quiet = true;
    if (window.LabNum) window.LabNum.set(el, v);
    else { el.value = v; el.dispatchEvent(new Event('input')); }
    quiet = false;
  }
  elTh.addEventListener('input', function () { if (!quiet) { stopPlay(); setStatus(''); } changed(); });
  elTh.addEventListener('change', function () { if (!quiet) emitAngle('slider'); });
  [elA, elW, elP, elK].forEach(function (el) {
    el.addEventListener('input', function () { if (!quiet) setStatus(''); changed(); });
    el.addEventListener('change', function () { if (!quiet) { emitWave('slider'); checkMatch(); } });
  });
  [ela, elb].forEach(function (el) {
    el.addEventListener('input', function () { if (!quiet) setStatus(''); changed(); });
    el.addEventListener('change', function () { if (!quiet) emitSum('slider'); });
  });
  [['showCos', 'cos'], ['showTan', 'tan'], ['snap', 'snap'], ['showBase', 'base'], ['showGuides', 'guides'], ['showParts', 'parts']].forEach(function (pr) {
    $(pr[0]).addEventListener('change', function (ev) {
      state.show[pr[1]] = ev.target.checked;
      if (view3) view3.update();
      requestDraw();
    });
  });

  // ---------- 模式 ----------
  const lab = $('lab');
  const modeBtns = Array.prototype.slice.call(document.querySelectorAll('.modes button'));
  function setMode(m, silent) {
    if (m === state.mode && !silent) return;
    state.mode = m;
    lab.setAttribute('data-mode', m);
    modeBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)); });
    stopPlay();
    eqKey = '';
    retarget(false);
    updateReadouts();
    updatePlayLabel();
    if (view3) view3.update();
    requestDraw();
    if (!silent) say(m === 'unit' ? T('單位圓模式', 'Unit circle mode') : m === 'wave' ? T('波形模式：y = A sin(ωx + φ) + k', 'Wave mode: y = A sin(ωx + φ) + k') : T('疊合模式：a sin x + b cos x', 'Adding mode: a sin x + b cos x'));
  }
  modeBtns.forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
  });

  // ---------- 播放 ----------
  const playBtn = $('play');
  let playLast = 0;
  function updatePlayLabel() {
    playBtn.textContent = state.playing ? T('暫停', 'Pause') : T('播放', 'Play');
    playBtn.setAttribute('aria-pressed', String(state.playing));
  }
  function startPlay() {
    state.playing = true; playLast = 0;
    if (state.mode === 'unit' && state.theta >= 719.5) setSlider(elTh, 0);
    updatePlayLabel(); requestDraw();
  }
  function stopPlay(fromUser) {
    if (!state.playing) return;
    state.playing = false;
    voiceStop();
    updatePlayLabel();
    if (fromUser && state.mode === 'unit') { setSlider(elTh, Math.round(state.theta * 10) / 10); emitAngle('pause'); }
  }
  function stepPlay(now) {
    const dt = playLast ? Math.min(0.05, (now - playLast) / 1000) : 0;
    playLast = now;
    if (state.mode === 'unit') {
      let th = state.theta + 45 * dt;
      if (th > 720) th -= 720;
      state.theta = th;
      // 播放時只移動滑桿的位置與數字，不觸發 input（不重建 3D、不回報任務）；暫停時才把精確值寫回滑桿
      if (window.LabNum) window.LabNum.clear(elTh);
      elTh.value = String(th);
      $('thetao').textContent = fmtSlider(th, elTh) + '°';
    } else {
      const win = xWin();
      let x = state.x0 + 0.85 * dt;
      if (x > win.xs + win.xw) x = win.xs;
      state.x0 = x;
    }
    updateReadouts();
    voiceUpdate();
    if (view3) view3.updateP();
  }
  playBtn.addEventListener('click', function () { if (state.playing) stopPlay(true); else startPlay(); });

  // ---------- 全部清除 ----------
  $('clear').addEventListener('click', function () {
    stopPlay();
    state.target = null; state.matched = false; state.streak = 0; state.times = []; state.log = []; state.nTarget = 0;
    renderLog();
    updateChallengeUI();
    if (state.mode === 'unit') { setSlider(elTh, 0); }
    else state.x0 = 0;
    retarget(false);
    if (view3) view3.update();
    setStatus(T('已清除挑戰紀錄，點 P 回到起點。', 'Challenge record cleared; P is back at the start.'));
    requestDraw();
  });

  // =====================================================================
  // 挑戰：對準目標曲線
  // =====================================================================
  function nowS() { return performance.now() / 1000; }
  function newTarget() {
    if (state.target && !state.matched) state.streak = 0; // 沒對準就換題：連勝中斷
    state.target = TC.randomTarget(Math.random, state.p);
    state.matched = false;
    state.targetT0 = nowS();
    state.nTarget++;
    retarget(false);
    updateChallengeUI();
    chime(false);
    say(T('新的目標曲線：調整 A、ω、φ、k，讓你的曲線和虛線完全重合。', 'New target curve: adjust A, ω, φ and k until your curve lies exactly on the dashed one.'));
    requestDraw();
  }
  function checkMatch() {
    if (!state.target || state.matched) return;
    const gap = TC.curveGap(state.p, state.target, 0, X_CHECK, 800);
    if (gap > MATCH_TOL) return;
    state.matched = true;
    const secs = nowS() - state.targetT0;
    state.streak++;
    state.times.push(secs);
    if (state.times.length > 3) state.times.shift();
    const last3 = state.streak >= 3 ? state.times.reduce(function (s, v) { return s + v; }, 0) : NaN;
    state.log.push({ n: state.nTarget, tex: TC.waveTex(state.target), secs: secs });
    renderLog();
    updateChallengeUI();
    chime(true);
    say(T('對準了！用了 ', 'Matched! It took ') + num(secs, 1) + T(' 秒。', ' s.') + (state.streak > 1 ? T('連續對準 ', ' Streak: ') + state.streak + T(' 題。', '.') : ''));
    const t = state.target;
    emit('match', { streak: state.streak, secs: secs, last3: last3, A: t.A, w: t.w, phi: t.phi, k: t.k });
    requestDraw();
  }
  function updateChallengeUI() {
    const b = $('newTarget'), m = $('chalMsg');
    if (!state.target) { b.textContent = T('挑戰：對準目標曲線', 'Challenge: match a curve'); m.textContent = ''; m.className = 'chal-msg'; return; }
    b.textContent = state.matched ? T('下一題', 'Next curve') : T('換一題', 'Another curve');
    if (state.matched) {
      m.textContent = T('對準了！', 'Matched!') + (state.streak > 1 ? T('（連續 ', ' (streak ') + state.streak + T(' 題）', ')') : '');
      m.className = 'chal-msg ok';
    } else {
      m.textContent = T('第 ', 'Curve ') + state.nTarget + T(' 題：讓你的曲線和綠色虛線完全重合。', ': lay your curve exactly on the green dashed one.');
      m.className = 'chal-msg';
    }
  }
  $('newTarget').addEventListener('click', newTarget);
  function renderLog() {
    const tb = $('log');
    if (!state.log.length) { tb.innerHTML = ''; $('logEmpty').hidden = false; return; }
    $('logEmpty').hidden = true;
    let h = '<thead><tr><th>' + T('題', '#') + '</th><th>' + T('目標曲線', 'Target curve') + '</th><th>' + T('用時（秒）', 'Time (s)') + '</th></tr></thead><tbody>';
    state.log.forEach(function (r) {
      let f = '';
      try { f = window.katex ? window.katex.renderToString(r.tex, { throwOnError: false }) : r.tex; } catch (e) { f = r.tex; }
      h += '<tr><td>' + r.n + '</td><td class="f">' + f + '</td><td>' + num(r.secs, 1) + '</td></tr>';
    });
    tb.innerHTML = h + '</tbody>';
  }

  // =====================================================================
  // 畫布上的拖曳：點 P（沿圓）、圖形上的游標
  // =====================================================================
  function evPos(ev) { const r = cv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  function inRect(p, R) { return p.x >= R.x && p.x <= R.x + R.w && p.y >= R.y && p.y <= R.y + R.h; }
  function curveY(x) {
    if (state.mode === 'unit') return Math.sin(x);
    if (state.mode === 'wave') return TC.waveY(state.p, x);
    return TC.sumY(state.a, state.b, x);
  }
  function hitTest(p) {
    if (!L) return null;
    const pad = 8;
    if (inRect(p, L.circ)) {
      const ci = circleInfo();
      const P = { x: CU(ci.P.u), y: Y(ci.P.y) };
      if (Math.hypot(P.x - p.x, P.y - p.y) <= 16 + pad) return 'P';
      const d = Math.hypot(p.x - CU(ci.cx), p.y - Y(ci.cy)), rr = ci.r * ky();
      if (rr > 6 && Math.abs(d - rr) <= 12 + pad) return 'ring';
      return null;
    }
    if (inRect(p, L.graph)) {
      const x = cursorX();
      if (Math.hypot(X(x) - p.x, Y(curveY(x)) - p.y) <= 16 + pad) return 'X';
      const xp = Xinv(p.x), win = xWin();
      if (xp >= win.xs && xp <= win.xs + win.xw && Math.abs(Y(curveY(xp)) - p.y) <= 12 + pad) return 'X';
    }
    return null;
  }
  function setHover(h) {
    if (h === state.hover) return;
    state.hover = h;
    cv.style.cursor = h ? 'grab' : 'default';
    requestDraw();
  }
  /** 吸附特殊角（15° 的倍數，3° 以內） */
  function snapDeg(deg) {
    if (!state.show.snap) return Math.round(deg * 10) / 10;
    const s = Math.round(deg / 15) * 15;
    return Math.abs(deg - s) <= 3 ? s : Math.round(deg);
  }
  function screenAngle(p) {
    const ci = circleInfo();
    return Math.atan2(-(p.y - Y(ci.cy)), p.x - CU(ci.cx)) / DEG;
  }
  /** 拖曳圓上的點：用角度的「變化量」累加（可以轉超過一圈） */
  function dragRing(p) {
    const a = screenAngle(p);
    const dr = state.drag;
    if (dr.lastA == null) {
      // 一按下就跳到手指的位置（目前的角加上兩者的差）
      let cur;
      if (state.mode === 'unit') cur = state.theta;
      else if (state.mode === 'wave') cur = (state.p.w * state.x0 + state.p.phi * DEG) / DEG + (state.p.A < 0 ? 180 : 0);
      else cur = (state.x0 / DEG) + TC.superpose(state.a, state.b).phi;
      dr.lastA = cur;
    }
    let delta = TC.wrap180(a - dr.lastA);
    dr.lastA += delta;
    if (state.mode === 'unit') {
      dr.raw = (dr.raw == null ? state.theta : dr.raw) + delta;
      dr.raw = Math.max(0, Math.min(720, dr.raw));
      setSlider(elTh, Math.max(0, Math.min(720, snapDeg(dr.raw))));
    } else {
      const win = xWin();
      const w = state.mode === 'wave' ? state.p.w : 1;
      let x = state.x0 + delta * DEG / w;
      x = Math.max(win.xs, Math.min(win.xs + win.xw, x));
      state.x0 = x;
    }
    afterMove();
  }
  function dragX(p) {
    const win = xWin();
    let x = Math.max(win.xs, Math.min(win.xs + win.xw, Xinv(p.x)));
    if (state.mode === 'unit') setSlider(elTh, Math.max(0, Math.min(720, snapDeg(x / DEG))));
    else state.x0 = x;
    afterMove();
  }
  function afterMove() {
    updateReadouts();
    voiceUpdate();
    if (view3) view3.updateP();
    requestDraw();
  }
  let downAt = null;
  cv.addEventListener('pointerdown', function (ev) {
    const p = evPos(ev);
    const h = hitTest(p);
    downAt = { x: p.x, y: p.y, h: h };
    if (!h) return;
    stopPlay();
    state.drag = { kind: h, moved: false, lastA: null, raw: null };
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    ev.preventDefault();
    if (h === 'ring') { state.drag.moved = true; dragRing(p); }
    else if (h === 'X') { dragX(p); }
    requestDraw();
  });
  cv.addEventListener('touchstart', function (ev) {
    const t = ev.touches[0]; if (!t) return;
    const r = cv.getBoundingClientRect();
    if (hitTest({ x: t.clientX - r.left, y: t.clientY - r.top })) ev.preventDefault();
  }, { passive: false });
  cv.addEventListener('pointermove', function (ev) {
    const p = evPos(ev);
    if (!state.drag) { if (ev.pointerType !== 'touch') setHover(hitTest(p)); return; }
    state.drag.moved = true;
    if (state.drag.kind === 'X') dragX(p); else dragRing(p);
  });
  function endDrag(ev) {
    const dr = state.drag;
    state.drag = null;
    downAt = null;
    voiceStop();
    if (!dr) return;
    setHover(ev && ev.pointerType === 'mouse' ? hitTest(evPos(ev)) : null);
    if (state.mode === 'unit') emitAngle('drag');
    requestDraw();
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', function () { if (!state.drag) setHover(null); });

  // ---------- 鍵盤操作（keys.js） ----------
  let kb = null;
  if (window.LabKeys) {
    kb = window.LabKeys.attach(cv, {
      label: T('三角函數畫布。方向鍵沿圓移動點 P（單位圓模式每次 1°，Shift 每次 15°；其他模式移動圖形上的游標）。',
        'Trigonometric functions canvas. Use the arrow keys to move the point P around the circle (1° per press in unit-circle mode, 15° with Shift; in the other modes they move the cursor along the graph).'),
      items: [{
        name: function () { return T('點 P', 'the point P'); },
        move: function (dx, dy, big) {
          const dir = dx || dy;
          if (!dir) return false;
          stopPlay();
          if (state.mode === 'unit') {
            const step = big ? 15 : 1;
            let th = Math.round((state.theta + dir * step) / step) * step;
            th = Math.max(0, Math.min(720, th));
            setSlider(elTh, th);
            emitAngle('key');
          } else {
            const win = xWin();
            state.x0 = Math.max(win.xs, Math.min(win.xs + win.xw, Math.round((state.x0 + dir * (big ? PI / 12 : PI / 72)) / (PI / 72)) * (PI / 72)));
          }
          afterMove();
          return true;
        },
        describe: function () {
          if (state.mode === 'unit') {
            const u = TC.unit(state.theta);
            return 'θ = ' + degText(state.theta) + T('，sin θ = ', ', sin θ = ') + num(u.sin, 3) + T('，cos θ = ', ', cos θ = ') + num(u.cos, 3);
          }
          return 'x = ' + radText(state.x0) + T('，y = ', ', y = ') + num(curveY(state.x0), 3);
        }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 3D 檢視：切換到 3D 時才載入 js/trig-functions-3d.js 與 three.js
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    TC: TC, T: T, D: D, state: state, reducedMotion: reducedMotion,
    colors: function () { return C; },
    curve: function () { return curP(); },
    cursor: function () { return cursorX(); },
    num: num, radShort: radShort,
    onRotate: function () { emit('rotate3d', { mode: state.mode }); },
    onAxis: function (ang) { emit('axis3d', { angle: ang, mode: state.mode }); },
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
      if (window.Trig3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.Trig3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/trig-functions-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.Trig3D) throw new Error('trig-functions-3d.js did not load');
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
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        view3 = window.Trig3D.create(lib, host3, bridge);
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

  // 給測試與任務證明用的介面（不影響畫面）
  window.__tf = {
    state: state, setMode: setMode, newTarget: newTarget,
    setTarget: function (t) { state.target = t; state.matched = false; state.targetT0 = nowS(); state.nTarget++; retarget(false); updateChallengeUI(); requestDraw(); }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  refreshOutputs();
  readSliders();
  // 分享連結還原的模式（classroom.js 會按下對應的按鈕）；預設單位圓
  setMode(lab.getAttribute('data-mode') || 'unit', true);
  renderLog();
  updateChallengeUI();
  updateSoundButton();
  updatePlayLabel();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    eqKey = '';
    updateReadouts();
    renderLog();
    if (view3 && view3.active) view3.onTheme();
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(cv);
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden) { stopPlay(); } });
  resize();
})();
