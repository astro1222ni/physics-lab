/* lines-circles.js — 「直線與圓：距離、交點與切線」的畫面與互動（數學計算在 lines-circles-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 直線與圓：坐標平面（x、y 同單位長）上的圓、直線 ax + by + c = 0、圓心到直線的垂線段與距離 d、交點與弦、相切的切點；
 *   讀數有幾何判法（d 和 r 比）與代數判法（代入後的判別式）。可拖曳圓心、半徑把手、直線（平行移動）。
 * 過一點作切線：圓外一點 P 的兩條切線、切點、與半徑垂直的直角記號、切線長、兩切線的夾角。
 * 挑戰：圓與直線方向固定，只調 c 讓直線和圓相切。 */
(function () {
  'use strict';
  const G = window.LinesCirclesCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha;
  const DEF = { h: 0, k: 0, r: 4, a: 1, b: 2, c: -12, px: 7, py: 3 };

  // ---------- 狀態 ----------
  const state = {
    mode: 'line',
    h: DEF.h, k: DEF.k, r: DEF.r, a: DEF.a, b: DEF.b, c: DEF.c, px: DEF.px, py: DEF.py,
    showDist: true,
    chal: null, round: 0, streak: [], log: [],
    lastRel: null, flags: {}
  };
  let rand = G.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);
  let lastChal = null;
  let applying = false;

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'lc-circle', 'lc-line', 'lc-dist', 'lc-chord', 'lc-pt', 'lc-p']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight, italic) { return (italic ? 'italic ' : '') + (weight ? weight + ' ' : '') + px + 'px ' + FONT; }

  // ---------- 數字 ----------
  function num(v, dec) {
    if (v == null || !isFinite(v)) return '—';
    let s = v.toFixed(dec);
    if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
    return s.replace('-', '−');
  }
  function tr(v, dec) { return G.trim(v, dec == null ? 2 : dec).replace('-', '−'); }
  function tx(v, dec) { return G.trim(v, dec == null ? 3 : dec); }
  function txp(v, dec) { const s = tx(v, dec); return s.charAt(0) === '-' ? '(' + s + ')' : s; }
  function pt(p, dec) { return '(' + tr(p[0], dec == null ? 2 : dec) + ', ' + tr(p[1], dec == null ? 2 : dec) + ')'; }
  function relName(rel) { return rel === 'apart' ? T('相離', 'miss') : rel === 'tangent' ? T('相切', 'touch') : rel === 'cross' ? T('相交兩點', 'cut at two points') : '—'; }

  // ---------- 目前的量 ----------
  function QL() {
    const d = G.dist(state.a, state.b, state.c, state.h, state.k);
    const rel = G.relation(d, state.r);
    return {
      d: d, rel: rel, foot: G.foot(state.a, state.b, state.c, state.h, state.k),
      pts: G.intersections(state.a, state.b, state.c, state.h, state.k, state.r), chord: rel === 'cross' ? G.chord(d, state.r) : rel === 'tangent' ? 0 : null,
      quad: G.quadratic(state.a, state.b, state.c, state.h, state.k, state.r)
    };
  }
  function QT() { return G.tangentsFrom(state.px, state.py, state.h, state.k, state.r); }
  function hiding() { return !!state.chal; }

  // ---------- 畫布 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 480, F = null;
  function layout() {
    const narrow = cw < 600;
    const H = narrow ? Math.round(Math.max(330, Math.min(cw * 1.08, 440))) : 500;
    const pad = 10, top = pad, bottom = H - pad;
    const k = (bottom - top) / 21;           // y 方向 −10.5 到 10.5
    const cx = cw / 2;
    return { narrow: narrow, H: H, r: { x0: pad, x1: cw - pad, y0: top, y1: bottom }, k: k, ox: cx, oy: (top + bottom) / 2 };
  }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    const Lo = layout();
    ch = Lo.H;
    F = Lo;
    F.X = function (x) { return Lo.ox + x * Lo.k; };
    F.Y = function (y) { return Lo.oy - y * Lo.k; };
    F.ux = function (px) { return (px - Lo.ox) / Lo.k; };
    F.uy = function (py) { return (Lo.oy - py) / Lo.k; };
    F.xr = [F.ux(Lo.r.x0), F.ux(Lo.r.x1)]; F.yr = [F.uy(Lo.r.y1), F.uy(Lo.r.y0)];
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    requestDraw();
  }
  let rafId = 0;
  function requestDraw() { if (!rafId) rafId = requestAnimationFrame(function () { rafId = 0; draw(); }); }

  // ---------- 繪圖 ----------
  function clip(c) { const r = F.r; c.beginPath(); c.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); c.clip(); }
  function drawGrid(c) {
    const r = F.r;
    c.save();
    D.roundRect(c, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, 8);
    c.fillStyle = alpha(C.text, D.dark ? 0.03 : 0.022); c.fill();
    clip(c);
    c.lineWidth = 1;
    const lab = F.narrow ? 5 : 2;
    for (let x = Math.ceil(F.xr[0]); x <= F.xr[1]; x++) {
      c.strokeStyle = alpha(C.text, x % lab === 0 ? 0.09 : 0.04);
      c.beginPath(); c.moveTo(F.X(x), r.y0); c.lineTo(F.X(x), r.y1); c.stroke();
    }
    for (let y = Math.ceil(F.yr[0]); y <= F.yr[1]; y++) {
      c.strokeStyle = alpha(C.text, y % lab === 0 ? 0.09 : 0.04);
      c.beginPath(); c.moveTo(r.x0, F.Y(y)); c.lineTo(r.x1, F.Y(y)); c.stroke();
    }
    c.strokeStyle = alpha(C.text, 0.42); c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(r.x0, F.Y(0)); c.lineTo(r.x1, F.Y(0)); c.moveTo(F.X(0), r.y0); c.lineTo(F.X(0), r.y1); c.stroke();
    c.font = fnt(10.5); c.fillStyle = C.muted;
    for (let x = Math.ceil(F.xr[0]); x <= F.xr[1]; x++) {
      if (x === 0 || x % lab !== 0) continue;
      c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(tr(x, 0), F.X(x), F.Y(0) + 4);
    }
    for (let y = Math.ceil(F.yr[0]); y <= F.yr[1]; y++) {
      if (y === 0 || y % lab !== 0) continue;
      c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(tr(y, 0), F.X(0) - 5, F.Y(y));
    }
    c.restore();
    D.haloText(c, 'x', r.x1 - 8, F.Y(0) - 6, C.muted, 'right', 'bottom', fnt(13, 600, true));
    D.haloText(c, 'y', F.X(0) + 8, r.y0 + 6, C.muted, 'left', 'top', fnt(13, 600, true));
  }
  /** 畫整條直線 ax + by + c = 0（裁在框內） */
  function fullLine(c, a, b, cc, color, width, dash) {
    const r = F.r;
    c.save(); clip(c);
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round';
    if (dash) c.setLineDash(dash);
    c.beginPath();
    if (Math.abs(b) > 1e-9) {
      const x0 = F.xr[0] - 1, x1 = F.xr[1] + 1;
      c.moveTo(F.X(x0), F.Y(-(a * x0 + cc) / b)); c.lineTo(F.X(x1), F.Y(-(a * x1 + cc) / b));
    } else if (Math.abs(a) > 1e-9) {
      const x = -cc / a; c.moveTo(F.X(x), r.y0); c.lineTo(F.X(x), r.y1);
    }
    c.stroke(); c.restore();
  }
  function seg(c, P, Q, color, width, dash) {
    c.save(); clip(c);
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round';
    if (dash) c.setLineDash(dash);
    c.beginPath(); c.moveTo(F.X(P[0]), F.Y(P[1])); c.lineTo(F.X(Q[0]), F.Y(Q[1])); c.stroke(); c.restore();
  }
  /** 直角記號：在 V 點、沿 u、v 兩個方向（單位向量，數學坐標） */
  function rightMark(c, V, u, v, color) {
    const s = 9 / F.k;
    const A = [V[0] + u[0] * s, V[1] + u[1] * s], B = [A[0] + v[0] * s, A[1] + v[1] * s], Cc = [V[0] + v[0] * s, V[1] + v[1] * s];
    c.save(); c.strokeStyle = color; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(F.X(A[0]), F.Y(A[1])); c.lineTo(F.X(B[0]), F.Y(B[1])); c.lineTo(F.X(Cc[0]), F.Y(Cc[1])); c.stroke(); c.restore();
  }
  function unit(v) { const n = Math.hypot(v[0], v[1]) || 1; return [v[0] / n, v[1] / n]; }
  function inView(p, m) { const e = m || 0; return p[0] >= F.xr[0] - e && p[0] <= F.xr[1] + e && p[1] >= F.yr[0] - e && p[1] <= F.yr[1] + e; }
  function handlePos() {
    // 半徑把手：放在圓周上離直線（或 P）遠的一側，初始 −35°
    let ang = -35 * Math.PI / 180;
    if (state.mode === 'tan') { ang = Math.atan2(state.py - state.k, state.px - state.h) + Math.PI * 0.75; }
    return [state.h + state.r * Math.cos(ang), state.k + state.r * Math.sin(ang)];
  }
  function drawCircle(c) {
    const cx = F.X(state.h), cy = F.Y(state.k), R = state.r * F.k;
    c.save(); clip(c);
    const g = c.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
    g.addColorStop(0, alpha(C['lc-circle'], D.dark ? 0.16 : 0.1)); g.addColorStop(1, alpha(C['lc-circle'], D.dark ? 0.07 : 0.04));
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = alpha(C['lc-circle'], 0.22); c.lineWidth = 7; c.stroke();
    c.strokeStyle = C['lc-circle']; c.lineWidth = 2.4; c.stroke();
    c.restore();
    // 半徑把手
    if (!state.chal) {
      const H = handlePos();
      seg(c, [state.h, state.k], H, alpha(C['lc-circle'], 0.6), 1.4, [4, 4]);
      const hx = F.X(H[0]), hy = F.Y(H[1]);
      c.save(); c.fillStyle = C['canvas-bg'] || C.surface; c.strokeStyle = C['lc-circle']; c.lineWidth = 2;
      D.roundRect(c, hx - 6, hy - 6, 12, 12, 3); c.fill(); c.stroke(); c.restore();
      const mid = [(state.h + H[0]) / 2, (state.k + H[1]) / 2];
      D.haloText(c, 'r = ' + tr(state.r, 2), F.X(mid[0]) + 6, F.Y(mid[1]) + 4, C['lc-circle'], 'left', 'top', fnt(11.5, 600));
    }
    // 圓心
    D.ball(c, F.X(state.h), F.Y(state.k), 5.5, C['lc-circle']);
    D.haloText(c, 'C' + (state.chal ? '' : pt([state.h, state.k], 2)), F.X(state.h) - 8, F.Y(state.k) - 8, C['lc-circle'], 'right', 'bottom', fnt(11.5, 600));
  }
  function draw() {
    if (!F) return;
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    D.backdrop(c, cw, ch);
    drawGrid(c);
    if (state.mode === 'line') drawLineMode(c); else drawTanMode(c);
    if (kb && kb.focused()) {
      c.save(); c.strokeStyle = C.accent; c.setLineDash([4, 4]); c.lineWidth = 1.5;
      D.roundRect(c, F.r.x0 + 3, F.r.y0 + 3, F.r.x1 - F.r.x0 - 6, F.r.y1 - F.r.y0 - 6, 8); c.stroke(); c.restore();
    }
  }
  function drawLineMode(c) {
    const q = QL(), hide = hiding();
    drawCircle(c);
    // 弦
    if (q.rel === 'cross') { seg(c, q.pts[0], q.pts[1], alpha(C['lc-chord'], 0.3), 9); }
    // 直線
    fullLine(c, state.a, state.b, state.c, alpha(C['lc-line'], 0.22), 8);
    fullLine(c, state.a, state.b, state.c, C['lc-line'], 2.6);
    if (q.rel === 'cross') seg(c, q.pts[0], q.pts[1], C['lc-chord'], 3.6);
    // 垂線段與距離
    if (state.showDist && q.foot && !hide) {
      seg(c, [state.h, state.k], q.foot, C['lc-dist'], 2, [6, 4]);
      const u = unit([q.foot[0] - state.h, q.foot[1] - state.k]), v = unit([-state.b, state.a]);
      if (q.d > 0.3) rightMark(c, q.foot, [-u[0], -u[1]], v, C['lc-dist']);
      const m = [(state.h + q.foot[0]) / 2, (state.k + q.foot[1]) / 2];
      if (inView(m)) D.pill(c, 'd = ' + tr(q.d, 3), F.X(m[0]) + (u[1] >= 0 ? 10 : -10), F.Y(m[1]) + 5, C['lc-dist'], u[1] >= 0 ? 'left' : 'right', fnt(12, 600));
      if (inView(q.foot)) D.ball(c, F.X(q.foot[0]), F.Y(q.foot[1]), 3.5, C['lc-dist']);
    }
    // 交點
    q.pts.forEach(function (p, i) {
      if (!inView(p, 0.2)) return;
      const big = q.rel === 'tangent';
      if (big) {
        c.save(); c.strokeStyle = alpha(C['lc-pt'], 0.45); c.lineWidth = 2;
        c.beginPath(); c.arc(F.X(p[0]), F.Y(p[1]), 12, 0, Math.PI * 2); c.stroke(); c.restore();
      }
      D.ball(c, F.X(p[0]), F.Y(p[1]), 6, C['lc-pt'], { glow: big ? 0.45 : null });
      if (!hide) {
        const n = unit([p[0] - state.h, p[1] - state.k]);
        D.haloText(c, pt(p, 2), F.X(p[0]) + n[0] * 14, F.Y(p[1]) - n[1] * 14, C['lc-pt'], n[0] >= 0 ? 'left' : 'right', n[1] >= 0 ? 'bottom' : 'top', fnt(11.5, 600));
      }
    });
    if (q.rel === 'cross' && !hide) {
      const m = [(q.pts[0][0] + q.pts[1][0]) / 2, (q.pts[0][1] + q.pts[1][1]) / 2];
      if (q.chord > 1.2) {
        const n = unit([state.a, state.b]), side = ((m[0] - state.h) * n[0] + (m[1] - state.k) * n[1]) >= 0 ? 1 : -1;
        const lp = [m[0] + n[0] * side * 0.9 + (-n[1]) * 1.2, m[1] + n[1] * side * 0.9 + n[0] * 1.2];
        if (inView(lp)) D.pill(c, T('弦長 ', 'chord ') + tr(q.chord, 3), F.X(lp[0]), F.Y(lp[1]) + 5, C['lc-chord'], 'center', fnt(12, 600));
      }
    }
    // 位置關係
    const rel = hide ? T('讓直線和圓相切', 'make the line touch the circle') : relName(q.rel) + (q.rel === 'apart' ? '：d > r' : q.rel === 'tangent' ? '：d = r' : q.rel === 'cross' ? '：d < r' : '');
    D.pill(c, rel, F.r.x0 + 12, F.r.y0 + 24, q.rel === 'tangent' && !hide ? C['lc-pt'] : C.text, 'left', fnt(13, 700));
    // 直線方程式
    D.haloText(c, G.lineEq(state.a, state.b, state.c, 2), F.r.x1 - 10, F.r.y0 + 10, C['lc-line'], 'right', 'top', fnt(12.5, 600));
  }
  function drawTanMode(c) {
    const q = QT(), P = [state.px, state.py], Cc = [state.h, state.k];
    drawCircle(c);
    seg(c, Cc, P, alpha(C.muted, 0.8), 1.5, [5, 5]);
    if (q.on) {
      const l = q.lines[0];
      fullLine(c, l.a, l.b, l.c, alpha(C['lc-line'], 0.22), 8);
      fullLine(c, l.a, l.b, l.c, C['lc-line'], 2.6);
      rightMark(c, P, unit([Cc[0] - P[0], Cc[1] - P[1]]), unit([-l.b, l.a]), C['lc-dist']);
    } else if (!q.inside) {
      q.lines.forEach(function (l) { fullLine(c, l.a, l.b, l.c, alpha(C['lc-line'], 0.18), 7); fullLine(c, l.a, l.b, l.c, alpha(C['lc-line'], 0.75), 2); });
      q.pts.forEach(function (Tp) {
        seg(c, P, Tp, C['lc-line'], 3.2);
        seg(c, Cc, Tp, C['lc-dist'], 1.8, [5, 4]);
        rightMark(c, Tp, unit([Cc[0] - Tp[0], Cc[1] - Tp[1]]), unit([P[0] - Tp[0], P[1] - Tp[1]]), C['lc-dist']);
        D.ball(c, F.X(Tp[0]), F.Y(Tp[1]), 5.5, C['lc-pt']);
      });
      // 切線長標在上面那一條
      const T0 = q.pts[0][1] > q.pts[1][1] ? q.pts[0] : q.pts[1];
      const m = [(P[0] + T0[0]) / 2, (P[1] + T0[1]) / 2];
      if (inView(m)) D.pill(c, T('切線長 ', 'tangent ') + tr(q.len, 3), F.X(m[0]), F.Y(m[1]) - 10, C['lc-line'], 'center', fnt(12, 600));
      // 夾角弧
      const a1 = Math.atan2(-(q.pts[0][1] - P[1]), q.pts[0][0] - P[0]), a2 = Math.atan2(-(q.pts[1][1] - P[1]), q.pts[1][0] - P[0]);
      let s = a1, e = a2, d = e - s;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      c.save(); c.strokeStyle = C['lc-p']; c.lineWidth = 2;
      c.beginPath(); c.arc(F.X(P[0]), F.Y(P[1]), 26, s, s + d, d < 0); c.stroke(); c.restore();
      const mid = s + d / 2;
      D.haloText(c, tr(q.angle, 1) + '°', F.X(P[0]) + Math.cos(mid) * 44, F.Y(P[1]) + Math.sin(mid) * 44, C['lc-p'], 'center', 'middle', fnt(12, 700));
    }
    D.ball(c, F.X(P[0]), F.Y(P[1]), 7, C['lc-p'], { glow: 0.4 });
    D.haloText(c, 'P' + pt(P, 2), F.X(P[0]) + 10, F.Y(P[1]) - 10, C['lc-p'], 'left', 'bottom', fnt(12, 700));
    const msg = q.inside ? T('P 在圓內：沒有切線', 'P is inside: no tangent') : q.on ? T('P 在圓上：只有一條切線', 'P is on the circle: one tangent') : T('兩條切線一樣長', 'the two tangents are equally long');
    D.pill(c, msg, F.r.x0 + 12, F.r.y0 + 24, q.on ? C['lc-pt'] : C.text, 'left', fnt(13, 700));
  }

  // =====================================================================
  // 讀數與算式
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  const eqKey = {};
  function setEq(id, tex) {
    if (eqKey[id] === tex) return;
    eqKey[id] = tex;
    const el = $(id);
    if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
    else el.textContent = tex;
  }
  function polyTex(A, B, Cc, v) {
    const term = function (k, s, first) {
      const t = G.trim(Math.abs(k), 3);
      if (t === '0') return '';
      const sg = k < 0 ? '-' : first ? '' : '+';
      return sg + (s && t === '1' ? '' : t) + s;
    };
    let out = term(A, v + '^2', true);
    const b = term(B, v, !out); out += (b && out && b.charAt(0) !== '-' && b.charAt(0) !== '+' ? '+' : '') + b;
    const c0 = term(Cc, '', !out); out += (c0 && out && c0.charAt(0) !== '-' && c0.charAt(0) !== '+' ? '+' : '') + c0;
    return (out || '0') + ' = 0';
  }
  function updateReadouts() {
    const hide = hiding();
    if (state.mode === 'line') {
      const q = QL();
      setHTML('rL', G.lineEq(state.a, state.b, state.c, 2));
      setHTML('rC', G.circleEq(state.h, state.k, state.r, 2).replace(/²/g, '<sup>2</sup>'));
      setHTML('rD', hide ? '?' : num(q.d, 3));
      setHTML('rRel', hide ? '?' : relName(q.rel));
      setHTML('rP', hide ? '?' : q.pts.length ? q.pts.map(function (p) { return pt(p, 2); }).join(' ') : T('沒有', 'none'));
      setHTML('rCh', hide ? '?' : q.rel === 'cross' ? num(q.chord, 3) : q.rel === 'tangent' ? '0' : '—');
      if (!(Math.hypot(state.a, state.b) > 0)) { setEq('rEq', 'a = b = 0'); setEq('rEq2', ''); }
      else if (hide) {
        setEq('rEq', 'd = \\frac{|a h + b k + c|}{\\sqrt{a^2 + b^2}} = \\frac{|' + txp(state.a, 2) + '\\cdot' + txp(state.h, 2) + ' + ' + txp(state.b, 2) + '\\cdot' + txp(state.k, 2) + ' + c|}{\\sqrt{' + txp(state.a, 2) + '^2 + ' + txp(state.b, 2) + '^2}} \\overset{?}{=} ' + tx(state.r, 2));
        setEq('rEq2', '\\Delta \\overset{?}{=} 0');
      } else {
        const cmp = q.rel === 'tangent' ? '=' : q.rel === 'apart' ? '>' : '<';
        setEq('rEq', 'd = \\frac{|' + txp(state.a, 2) + '\\cdot' + txp(state.h, 2) + ' + ' + txp(state.b, 2) + '\\cdot' + txp(state.k, 2) + ' + ' + txp(state.c, 2) + '|}{\\sqrt{' + txp(state.a, 2) + '^2 + ' + txp(state.b, 2) + '^2}} \\approx ' + tx(q.d, 3) + '\\;' + cmp + '\\; r = ' + tx(state.r, 2));
        const Q = q.quad;
        if (Q) {
          const dc = q.rel === 'tangent' ? '= 0' : Q.disc > 0 ? '> 0' : '< 0';
          setEq('rEq2', polyTex(Q.A, Q.B, Q.C, Q.v) + ',\\quad \\Delta = ' + (q.rel === 'tangent' ? '0' : tx(Q.disc, 2)) + (q.rel === 'tangent' ? '' : '\\;' + dc.charAt(0) + '\\;0'));
        }
      }
    } else {
      const q = QT();
      setHTML('tL', num(q.L, 3));
      setHTML('tT', q.inside ? T('沒有（P 在圓內）', 'none (P inside)') : num(q.len, 3));
      setHTML('tA', q.inside ? '—' : q.on ? T('只有一條', 'only one') : num(q.angle, 2) + '°');
      setHTML('tP', q.pts.length ? q.pts.map(function (p) { return pt(p, 2); }).join(' ') : '—');
      setEq('rEq', 'PC = \\sqrt{(' + tx(state.px, 2) + ' - ' + txp(state.h, 2) + ')^2 + (' + tx(state.py, 2) + ' - ' + txp(state.k, 2) + ')^2} \\approx ' + tx(q.L, 3));
      if (q.inside) setEq('rEq2', 'PC < r');
      else if (q.on) setEq('rEq2', 'PC = r,\\quad PT = 0');
      else setEq('rEq2', 'PT = \\sqrt{PC^2 - r^2} \\approx ' + tx(q.len, 3) + ',\\quad \\theta = 2\\arcsin\\frac{r}{PC} \\approx ' + tx(q.angle, 2) + '^\\circ');
    }
    setHTML('status', statusText());
  }
  function statusText() {
    if (state.chal) return T('只調 c（或拖曳直線），讓直線剛好碰到圓；放開才判定。', 'Adjust only c (or drag the line) until it just touches the circle; judged when you let go.');
    if (state.mode === 'line') {
      const q = QL();
      if (q.d == null) return T('a 和 b 不能同時是 0。', 'a and b cannot both be 0.');
      if (q.rel === 'tangent') return T('相切：圓心到直線的距離剛好等於半徑，判別式等於 0，只有一個交點（切點）。', 'Tangent: the distance from the centre equals the radius, the discriminant is 0, and there is one common point.');
      if (q.rel === 'cross') return q.d < 0.01 ? T('直線通過圓心：弦就是直徑，最長。', 'The line passes through the centre: the chord is a diameter, the longest one.')
        : T('相交兩點：d < r，判別式大於 0；弦長 = 2√(r² − d²)。', 'Two crossing points: d < r and the discriminant is positive; chord = 2√(r² − d²).');
      return T('相離：d > r，判別式小於 0，沒有實數解。', 'No contact: d > r and the discriminant is negative, so there is no real solution.');
    }
    const q = QT();
    if (q.inside) return T('P 在圓內：任何過 P 的直線都會穿過圓，沒有切線。', 'P is inside: every line through P cuts the circle, so there is no tangent.');
    if (q.on) return T('P 在圓上：切線和半徑 CP 垂直，只有一條。', 'P is on the circle: the tangent is perpendicular to the radius CP, and there is only one.');
    return T('切線和半徑在切點垂直；切線長² + r² = PC²。', 'Each tangent is perpendicular to the radius at its point of contact; tangent² + r² = PC².');
  }

  // =====================================================================
  // 音效
  // =====================================================================
  function sound() { return window.LabSound && window.LabSound.enabled() ? window.LabSound : null; }
  function chime(ok) {
    const S = sound(); if (!S) return;
    if (ok) {
      S.tone({ freq: 659.25, dur: 0.16, type: 'sine', gain: 0.26 });
      S.tone({ freq: 987.77, dur: 0.24, type: 'sine', gain: 0.22, delay: 0.11 });
    } else S.tone({ freq: 523.25, dur: 0.12, type: 'triangle', gain: 0.2 });
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
  /** 位置關係改變時發聲：相離低音、相交兩個音、相切亮的和弦 */
  function relSound() {
    let rel;
    if (state.mode === 'line') rel = state.chal ? null : QL().rel;
    else { const q = QT(); rel = q.inside ? 'in' : q.on ? 'on' : 'out'; }
    if (rel && state.lastRel && rel !== state.lastRel) {
      const S = sound();
      if (S) {
        if (rel === 'tangent' || rel === 'on') chime(true);
        else if (rel === 'cross' || rel === 'in') { S.tone({ freq: 440, dur: 0.08, type: 'triangle', gain: 0.14 }); S.tone({ freq: 554.37, dur: 0.1, type: 'triangle', gain: 0.14, delay: 0.07 }); }
        else S.tone({ freq: 329.63, dur: 0.1, type: 'triangle', gain: 0.14 });
      }
    }
    state.lastRel = rel;
  }

  // =====================================================================
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitNow() {
    if (state.mode === 'line') {
      const q = QL();
      emit('line', { a: state.a, b: state.b, c: state.c, h: state.h, k: state.k, r: state.r, d: q.d, rel: q.rel, chord: q.rel === 'cross' ? q.chord : null, pts: q.pts, foot: q.foot, disc: q.quad ? q.quad.disc : null, chal: !!state.chal });
    } else {
      const q = QT();
      emit('tan', { px: state.px, py: state.py, h: state.h, k: state.k, r: state.r, L: q.L, len: q.len, angle: q.on ? null : q.angle, on: q.on, inside: q.inside });
    }
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  const lab = $('lab');
  const el = { h: $('hh'), k: $('kk'), r: $('rr'), a: $('la'), b: $('lb'), c: $('lc'), px: $('px'), py: $('py') };
  function readAll() { Object.keys(el).forEach(function (k) { state[k] = val(el[k]); }); }
  function refreshOutputs() {
    Object.keys(el).forEach(function (k) { $(el[k].id + 'o').textContent = tr(state[k], 2); });
  }
  function changed(final) {
    readAll();
    refreshOutputs(); updateReadouts(); relSound(); requestDraw();
    if (final) { emitNow(); judgeChal(); }
  }
  Object.keys(el).forEach(function (k) {
    el[k].addEventListener('input', function () { if (!applying) changed(false); });
    el[k].addEventListener('change', function () { if (!applying) changed(true); });
  });
  function setSlider(e, v) {
    applying = true;
    if (window.LabNum) window.LabNum.set(e, v); else e.value = v;
    applying = false;
  }
  $('distC').addEventListener('change', function () { state.showDist = $('distC').checked; requestDraw(); });
  function setMode(m) {
    if (m === state.mode) return;
    if (state.chal) quitChal(true);
    state.mode = m;
    lab.setAttribute('data-mode', m);
    document.querySelectorAll('.modes button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)); });
    state.lastRel = null;
    for (const id in eqKey) delete eqKey[id];
    updateReadouts(); relSound(); requestDraw();
    emitNow();
  }
  document.querySelectorAll('.modes button').forEach(function (b) { b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); }); });
  $('clear').addEventListener('click', function () {
    if (state.chal) quitChal(true);
    state.log = []; state.streak = []; state.round = 0; lastChal = null;
    Object.keys(DEF).forEach(function (k) { setSlider(el[k], DEF[k]); });
    setChalMsg(''); renderLog();
    state.lastRel = null;
    changed(true);
    const S = sound(); if (S) S.tone({ freq: 392, dur: 0.1, type: 'triangle', gain: 0.14 });
  });

  // ---------- 在圖上拖曳 ----------
  let drag = null;   // { id, what }
  function posOf(ev) { const rc = cv.getBoundingClientRect(); return { px: ev.clientX - rc.left, py: ev.clientY - rc.top }; }
  function near(px, py, P, R) { return Math.hypot(F.X(P[0]) - px, F.Y(P[1]) - py) <= R; }
  function lineHit(px, py, R) {
    const x = F.ux(px), y = F.uy(py), d = G.dist(state.a, state.b, state.c, x, y);
    return d != null && d * F.k <= R;
  }
  function snap(v, s) { return Math.round(v / s) * s; }
  function clampv(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function dragTo(what, px, py) {
    const x = F.ux(px), y = F.uy(py);
    if (what === 'center') { setSlider(el.h, clampv(snap(x, 0.5), -8, 8)); setSlider(el.k, clampv(snap(y, 0.5), -8, 8)); }
    else if (what === 'radius') setSlider(el.r, clampv(snap(Math.hypot(x - state.h, y - state.k), 0.5), 0.5, 8));
    else if (what === 'P') { setSlider(el.px, clampv(snap(x, 0.05), -10, 10)); setSlider(el.py, clampv(snap(y, 0.05), -10, 10)); }
    else if (what === 'line') setSlider(el.c, clampv(Math.round(-(state.a * x + state.b * y) * 100) / 100, -40, 40));
    changed(false);
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (!F) return;
    const p = posOf(ev), touch = ev.pointerType === 'touch' || ev.pointerType === 'pen', R = touch ? 22 : 14;
    let what = null;
    if (state.mode === 'tan' && near(p.px, p.py, [state.px, state.py], R)) what = 'P';
    else if (!state.chal && near(p.px, p.py, [state.h, state.k], R)) what = 'center';
    else if (!state.chal && near(p.px, p.py, handlePos(), R)) what = 'radius';
    else if (state.mode === 'line' && lineHit(p.px, p.py, R)) what = 'line';
    if (!what) return;
    ev.preventDefault();
    drag = { id: ev.pointerId, what: what };
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!F) return;
    const p = posOf(ev);
    if (!drag) {
      const R = 14;
      const hov = (state.mode === 'tan' && near(p.px, p.py, [state.px, state.py], R)) || (!state.chal && (near(p.px, p.py, [state.h, state.k], R) || near(p.px, p.py, handlePos(), R))) || (state.mode === 'line' && lineHit(p.px, p.py, R));
      cv.style.cursor = hov ? 'grab' : 'default';
      return;
    }
    if (drag.id !== ev.pointerId) return;
    cv.style.cursor = 'grabbing';
    dragTo(drag.what, p.px, p.py);
  });
  function endDrag(ev) {
    if (!drag || drag.id !== ev.pointerId) return;
    const w = drag.what; drag = null;
    cv.style.cursor = 'default';
    changed(true);
    emit('drag', { what: w });
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  // ---------- 鍵盤 ----------
  let kb = null;
  if (window.LabKeys) {
    const step = function (e, k, dv, lo, hi) { setSlider(e, clampv(Math.round((state[k] + dv) * 100) / 100, lo, hi)); };
    kb = window.LabKeys.attach(cv, {
      label: T('直線與圓畫布。Enter 切換要移動的東西（圓心、半徑、直線或點 P），方向鍵移動，Shift 移得更多。', 'Lines and circles canvas. Enter picks what to move (centre, radius, line or point P); the arrow keys move it, Shift for bigger steps.'),
      items: [{
        name: function () { return T('圓心', 'centre'); },
        move: function (dx, dy, big) { if (state.chal) return false; if (dx) step(el.h, 'h', dx * (big ? 2 : 0.5), -8, 8); if (dy) step(el.k, 'k', dy * (big ? 2 : 0.5), -8, 8); changed(true); return true; },
        describe: function () { return 'C' + pt([state.h, state.k], 2); }
      }, {
        name: function () { return T('半徑', 'radius'); },
        move: function (dx, dy, big) { if (state.chal) return false; const v = dx || dy; if (!v) return false; step(el.r, 'r', v * (big ? 1 : 0.5), 0.5, 8); changed(true); return true; },
        describe: function () { return 'r = ' + tr(state.r, 2); }
      }, {
        name: function () { return state.mode === 'line' ? T('直線（c）', 'line (c)') : T('點 P', 'point P'); },
        move: function (dx, dy, big) {
          if (state.mode === 'line') { const v = dx || dy; if (!v) return false; step(el.c, 'c', v * (big ? 2 : 0.1), -40, 40); }
          else { if (dx) step(el.px, 'px', dx * (big ? 0.5 : 0.05), -10, 10); if (dy) step(el.py, 'py', dy * (big ? 0.5 : 0.05), -10, 10); }
          changed(true); return true;
        },
        describe: function () {
          if (state.mode === 'line') { const q = QL(); return G.lineEq(state.a, state.b, state.c, 2) + (state.chal ? '' : '，' + relName(q.rel)); }
          return 'P' + pt([state.px, state.py], 2);
        }
      }],
      onChange: function () { requestDraw(); }
    });
  }

  // =====================================================================
  // 挑戰
  // =====================================================================
  const chalMsg = $('chalMsg');
  function setChalMsg(msg, ok) { chalMsg.textContent = msg || ''; chalMsg.classList.toggle('ok', !!ok); }
  function lockSliders(on) { ['h', 'k', 'r', 'a', 'b'].forEach(function (k) { el[k].disabled = on; }); }
  function startChal(forced) {
    const chg = forced || G.genChallenge(rand, lastChal);
    if (!chg) { setChalMsg(T('出不了題，請再按一次。', 'Could not make a challenge; please try again.')); return; }
    state.round++;
    state.chal = { h: chg.h, k: chg.k, r: chg.r, a: chg.a, b: chg.b, cs: chg.cs, t0: performance.now(), round: state.round };
    lastChal = chg;
    ['h', 'k', 'r', 'a', 'b'].forEach(function (k) { setSlider(el[k], chg[k]); });
    setSlider(el.c, chg.c0);
    lockSliders(true);
    setChalMsg(T('第 ' + state.round + ' 題：只調 c，讓直線和圓相切（放開才判定）。', 'Challenge ' + state.round + ': adjust only c so the line touches the circle (judged when you let go).'));
    $('quitChal').hidden = false;
    $('newChal').textContent = T('換一題', 'Another one');
    for (const id in eqKey) delete eqKey[id];
    changed(false);
  }
  function judgeChal() {
    const chg = state.chal;
    if (!chg || !G.chalHit(chg, state.c)) return;
    const time = (performance.now() - chg.t0) / 1000;
    state.log.push({ round: chg.round, eq: G.lineEq(chg.a, chg.b, state.c, 2), time: time });
    state.streak.push(time);
    const last3 = state.streak.length >= 3 ? state.streak.slice(-3).reduce(function (s, x) { return s + x; }, 0) : null;
    state.chal = null;
    lockSliders(false);
    $('quitChal').hidden = true;
    $('newChal').textContent = T('出下一題', 'Next challenge');
    const other = chg.cs.length > 1 ? T('另一個答案是 c ≈ ', ' The other answer is c ≈ ') + tr(chg.cs.reduce(function (b, x) { return Math.abs(x - state.c) > Math.abs(b - state.c) ? x : b; }, chg.cs[0]), 2) + T('（圓的另一側）。', ' (the other side of the circle).') : '';
    setChalMsg(T('相切了！用了 ', 'Touching! ') + time.toFixed(1) + T(' 秒。', ' s.') + other, true);
    chime(true);
    renderLog();
    for (const id in eqKey) delete eqKey[id];
    state.lastRel = null;
    updateReadouts(); relSound(); requestDraw();
    emit('challenge', { time: time, streak: state.streak.length, last3: last3 });
    emitNow();
  }
  function quitChal(silent) {
    const chg = state.chal;
    if (!chg) return;
    state.log.push({ round: chg.round, eq: null, time: null });
    state.chal = null; state.streak = [];
    lockSliders(false);
    $('quitChal').hidden = true;
    $('newChal').textContent = T('出一題', 'New challenge');
    setChalMsg(silent ? '' : T('這題放棄了。答案是 c ≈ ', 'Given up. The answer was c ≈ ') + chg.cs.map(function (x) { return tr(x, 2); }).join(T(' 或 ', ' or ')) + T('；連續答對重新計算。', '; the streak starts over.'));
    renderLog();
    for (const id in eqKey) delete eqKey[id];
    updateReadouts(); requestDraw();
  }
  $('newChal').addEventListener('click', function () { if (state.chal) quitChal(true); startChal(); });
  $('quitChal').addEventListener('click', function () { quitChal(false); });
  function renderLog() {
    const t = $('log');
    $('logEmpty').hidden = state.log.length > 0;
    if (!state.log.length) { t.innerHTML = ''; return; }
    let h = '<tr><th>' + T('題', '#') + '</th><th>' + T('切線', 'tangent') + '</th><th>' + T('秒', 's') + '</th></tr>';
    state.log.slice(-8).reverse().forEach(function (r) {
      h += '<tr><td>' + r.round + '</td><td>' + (r.eq || '—') + '</td><td>' + (r.time == null ? T('放棄', 'gave up') : r.time.toFixed(1)) + '</td></tr>';
    });
    t.innerHTML = h;
  }

  // 給測試用的介面（不影響畫面）
  window.__lc = {
    state: state, QL: QL, QT: QT,
    startChal: function (c) { startChal(c); },
    seed: function (s) { rand = G.rng(s); },
    frame: function () { return F; }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  readAll();
  refreshOutputs();
  renderLog();
  updateSoundButton();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    for (const id in eqKey) delete eqKey[id];
    renderLog(); refreshOutputs(); updateReadouts(); updateSoundButton();
    $('newChal').textContent = state.chal ? T('換一題', 'Another one') : T('出一題', 'New challenge');
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'lang') themeChanged(); });
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe($('stage'));
  } else window.addEventListener('resize', resize);
  resize();
  updateReadouts();
  relSound();
})();
