/* space-vectors.js — 「空間向量：內積、外積與平面」的畫面與互動（數學計算在 space-vectors-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 2D：可以轉動的正投影（拖曳或方向鍵轉方位角與仰角），地板 z = 0 的格線、坐標軸、向量箭頭依遠近排序；
 *     勾「三視圖」時下面加前視、側視、俯視三張小圖。
 * 3D：js/space-vectors-3d.js（three.js 延遲載入）。
 * 四種模式：內積與投影、外積與面積、平行六面體、平面與距離。 */
(function () {
  'use strict';
  const SV = window.SVCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const alpha = D.alpha;
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const SCRIPT_V = (function () {
    const s = document.currentScript, m = s && /[?&]v=(\w+)/.exec(s.src);
    return m ? m[1] : '';
  })();
  const YAW0 = 30, PITCH0 = 20;
  const SPIN_DPS = 18;             // 自動旋轉每秒幾度

  // ---------- 狀態 ----------
  const state = {
    mode: 'inner', edit: 'a',
    v: { a: [-0.5, 2.5, 2], b: [-2, 0.5, 1.5], c: [1, -1, 2], n: [1, 1, 2], q: [2, -1, 3] }, d: 4,
    yaw: YAW0, pitch: PITCH0, spinning: false,
    show: { proj: true, arc: true, drop: true, views: false },
    chal: null, round: 0, streak: [], log: [],
    flags: {}
  };
  let rand = SV.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);
  let lastChal = null;
  let applying = false;

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'surface', 'probe',
      'sv-a', 'sv-b', 'sv-c', 'sv-x', 'sv-n', 'sv-plane', 'sv-proj']
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
  function tr(v, dec) { return SV.trim(v, dec == null ? 2 : dec).replace('-', '−'); }
  function vtxt(v, dec) { return '(' + v.map(function (x) { return tr(x, dec); }).join(', ') + ')'; }
  function tx(v, dec) { return SV.trim(v, dec == null ? 2 : dec); }                    // TeX 用
  function txp(v, dec) { const s = tx(v, dec); return v < 0 && s !== '0' ? '(' + s + ')' : s; }   // 乘式裡的負數加括號
  function tvec(v, dec) { return '(' + v.map(function (x) { return tx(x, dec); }).join(',\\ ') + ')'; }

  // ---------- 目前的量 ----------
  function Q() {
    const a = state.v.a, b = state.v.b, c = state.v.c, n = state.v.n, q = state.v.q, d = state.d;
    const x = SV.cross(a, b), bc = SV.cross(b, c);
    const sd = SV.signedDist(n, d, q);
    return {
      a: a, b: b, c: c, n: n, q: q, d: d,
      la: SV.norm(a), lb: SV.norm(b), lc: SV.norm(c),
      dot: SV.dot(a, b), angle: SV.angleDeg(a, b), comp: SV.compOn(a, b), proj: SV.projOn(a, b),
      cross: x, area: SV.norm(x), bc: bc, triple: SV.dot(a, bc),
      sdist: sd, dist: sd == null ? null : Math.abs(sd), foot: SV.foot(n, d, q), nq: SV.dot(n, q), ln: SV.norm(n)
    };
  }
  function stateForCore() { return { a: state.v.a, b: state.v.b, c: state.v.c, n: state.v.n, d: state.d, q: state.v.q }; }

  // ---------- 畫布與版面 ----------
  const cv = $('cv'), ctx = cv.getContext('2d');
  let dpr = 1, cw = 300, ch = 420, L = null;
  function layout() {
    const narrow = cw < 600;
    const hm = narrow ? Math.round(Math.max(320, Math.min(cw * 1.0, 420))) : Math.round(Math.max(400, Math.min(cw * 0.7, 540)));
    let vh = 0, pw = 0, gap = narrow ? 6 : 10;
    if (state.show.views) {
      pw = Math.floor(Math.min(narrow ? 999 : 210, (cw - 2 * gap - 8) / 3));
      vh = pw + (narrow ? 22 : 26) + 8;
    }
    return { narrow: narrow, hm: hm, pw: pw, gap: gap, vh: vh, H: hm + vh };
  }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = layout();
    ch = L.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    requestDraw();
  }

  // ---------- 幾何：這個模式要畫哪些點（決定縮放） ----------
  function crossScale(q) {
    // a × b 太長時縮短畫：每次減半，直到不超過 max(5, 1.5·max(|a|,|b|))
    const lim = Math.max(5, 1.5 * Math.max(q.la, q.lb));
    let k = 1;
    while (q.area * k > lim && k > 1 / 64) k /= 2;
    return k;
  }
  function boxR(q) {
    // 平面截面所用立方體的半邊長（至少 4，要把 Q 包進去）
    return Math.max(4, Math.ceil(Math.max(Math.abs(q.q[0]), Math.abs(q.q[1]), Math.abs(q.q[2])) + 0.5));
  }
  function pointsOf(q) {
    const m = state.mode, pts = [];
    if (m === 'inner') { pts.push(q.a, q.b); }
    else if (m === 'cross') { pts.push(q.a, q.b, SV.add(q.a, q.b), SV.scale(q.cross, crossScale(q))); }
    else if (m === 'volume') {
      const a = q.a, b = q.b, c = q.c;
      pts.push(a, b, c, SV.add(a, b), SV.add(a, c), SV.add(b, c), SV.add(SV.add(a, b), c));
    } else {
      const R = boxR(q);
      pts.push(q.q, [R, R, R * 0.8]);
    }
    return pts;
  }
  function extentOf(q) {
    let r = 3;
    pointsOf(q).forEach(function (p) { r = Math.max(r, SV.norm(p)); });
    return r;
  }

  // ---------- 投影 ----------
  let VB = SV.viewBasis(YAW0, PITCH0), S = 40, CX = 150, CY = 150;
  function P(p) { const r = SV.project(VB, p); return { x: CX + r.x * S, y: CY - r.y * S, z: r.z }; }

  // =====================================================================
  // 繪圖
  // =====================================================================
  let rafId = 0;
  function requestDraw() { if (!rafId) rafId = requestAnimationFrame(frame); }
  let lastT = 0;
  function frame(t) {
    rafId = 0;
    if (state.spinning) {
      const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
      state.yaw = (state.yaw + SPIN_DPS * dt) % 360;
      lastT = t;
      requestDraw();
    } else lastT = 0;
    if (view3 && view3.active) { view3.frame(); return; }
    draw();
  }

  function seg(c, p0, p1, color, width, dash) {
    const a = P(p0), b = P(p1);
    c.save();
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round';
    if (dash) c.setLineDash(dash);
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    c.restore();
  }
  /** 從 p0 到 p1 的箭頭（螢幕座標 a、b）；halo：先畫一圈底色讓箭頭從背景浮出來 */
  function arrow2(c, a, b, color, width, opts) {
    opts = opts || {};
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (len < 5) {
      c.strokeStyle = color; c.lineWidth = 2;
      c.beginPath(); c.arc(b.x, b.y, 6, 0, 2 * Math.PI); c.stroke();
      c.fillStyle = color; c.beginPath(); c.arc(b.x, b.y, 2.2, 0, 2 * Math.PI); c.fill();
      c.restore();
      return;
    }
    const ux = dx / len, uy = dy / len;
    const hl = Math.min(opts.head || 13, len * 0.45), hw = hl * 0.48;
    const bx = b.x - ux * hl, by = b.y - uy * hl;
    if (opts.halo !== false) {
      c.strokeStyle = alpha(C['canvas-bg'], 0.85); c.lineWidth = width + 4;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(bx, by); c.stroke();
    }
    c.strokeStyle = color; c.lineWidth = width;
    if (opts.dash) c.setLineDash(opts.dash);
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(bx + ux * 1, by + uy * 1); c.stroke();
    c.setLineDash([]);
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(b.x, b.y);
    c.lineTo(bx - uy * hw, by + ux * hw);
    c.lineTo(bx + ux * hl * 0.18, by + uy * hl * 0.18);
    c.lineTo(bx + uy * hw, by - ux * hw);
    c.closePath(); c.fill();
    c.restore();
  }
  function label(c, text, at, from, color, px, italic) {
    // 放在箭頭尖端外側（沿著箭頭方向再往外一點）
    let dx = at.x - from.x, dy = at.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) { dx = 1; dy = -1; } else { dx /= len; dy /= len; }
    const off = (px || 15) * 0.95;
    D.haloText(c, text, at.x + dx * off, at.y + dy * off, color, 'center', 'middle', fnt(px || 15, 700, italic !== false));
  }
  function poly(c, pts, fill, stroke, width, dash) {
    if (pts.length < 2) return;
    const sp = pts.map(P);
    c.save();
    c.beginPath(); c.moveTo(sp[0].x, sp[0].y);
    for (let i = 1; i < sp.length; i++) c.lineTo(sp[i].x, sp[i].y);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = width || 1.2; c.lineJoin = 'round'; if (dash) c.setLineDash(dash); c.stroke(); }
    c.restore();
  }
  /** 直角記號：在 p 點，沿著兩個單位向量 u1、u2 各走 s 個單位 */
  function rightMark(c, p, u1, u2, s, color) {
    const a = SV.add(p, SV.scale(u1, s)), b = SV.add(SV.add(p, SV.scale(u1, s)), SV.scale(u2, s)), d = SV.add(p, SV.scale(u2, s));
    const A = P(a), B = P(b), Dd = P(d);
    c.save();
    c.strokeStyle = color; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.lineTo(Dd.x, Dd.y); c.stroke();
    c.restore();
  }
  /** 從單位向量 u 轉到 v 的圓弧上的點（半徑 r） */
  function arcPts(u, v, r, nSeg) {
    const th = Math.acos(Math.max(-1, Math.min(1, SV.dot(u, v))));
    const w = SV.unit(SV.sub(v, SV.scale(u, SV.dot(u, v))));
    const pts = [];
    for (let i = 0; i <= nSeg; i++) {
      const t = th * i / nSeg;
      pts.push(SV.add(SV.scale(u, r * Math.cos(t)), SV.scale(w, r * Math.sin(t))));
    }
    return pts;
  }
  function strokePath(c, pts, color, width, dash) {
    const sp = pts.map(P);
    c.save();
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round';
    if (dash) c.setLineDash(dash);
    c.beginPath(); c.moveTo(sp[0].x, sp[0].y);
    for (let i = 1; i < sp.length; i++) c.lineTo(sp[i].x, sp[i].y);
    c.stroke();
    c.restore();
  }

  function drawFloorAxes(c, G) {
    // 地板 z = 0：淡淡的面＋格線
    poly(c, [[-G, -G, 0], [G, -G, 0], [G, G, 0], [-G, G, 0]], alpha(C.text, D.dark ? 0.035 : 0.03), null);
    c.save();
    for (let i = -G; i <= G; i++) {
      const major = i === 0 ? 0 : (i % 2 === 0 ? 0.13 : 0.075);
      if (!major) continue;
      seg(c, [i, -G, 0], [i, G, 0], alpha(C.text, major), 1);
      seg(c, [-G, i, 0], [G, i, 0], alpha(C.text, major), 1);
    }
    c.restore();
    // 坐標軸：正向實線＋箭頭，負向虛線
    const ax = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], names = ['x', 'y', 'z'];
    const L0 = G + 0.6;
    ax.forEach(function (u, i) {
      seg(c, [0, 0, 0], SV.scale(u, -G), alpha(C.muted, 0.6), 1.2, [4, 4]);
      const o = P([0, 0, 0]), e = P(SV.scale(u, L0));
      arrow2(c, o, e, alpha(C.text, 0.62), 1.5, { head: 10, halo: false });
      label(c, names[i], e, o, alpha(C.text, 0.8), 15, true);
      // 刻度：每 2 格一個數字（只標正向）
      for (let k = 2; k <= G; k += 2) {
        const t = P(SV.scale(u, k));
        D.haloText(c, String(k), t.x + 4, t.y + 9, alpha(C.muted, 0.95), 'left', 'middle', fnt(10.5));
      }
    });
  }

  function vecItem(name, v, color, from) {
    return { name: name, v: v, from: from || [0, 0, 0], color: color };
  }
  function drawVectors(c, items, opts) {
    opts = opts || {};
    const sorted = items.slice().sort(function (p, q) { return P(SV.add(p.from, p.v)).z - P(SV.add(q.from, q.v)).z; });
    sorted.forEach(function (it) {
      const tip = SV.add(it.from, it.v);
      if (state.show.drop && !opts.noDrop && Math.abs(tip[2]) > 1e-9) {
        seg(c, tip, [tip[0], tip[1], 0], alpha(it.color, 0.55), 1.2, [2, 4]);
        const f = P([tip[0], tip[1], 0]);
        c.save(); c.fillStyle = alpha(it.color, 0.6); c.beginPath(); c.arc(f.x, f.y, 2.6, 0, 2 * Math.PI); c.fill(); c.restore();
      }
      const a = P(it.from), b = P(tip);
      if (SV.isZero(it.v)) {
        D.ball(c, a.x, a.y, 4, it.color, { glow: 0.2 });
        label(c, it.name + ' = 0', b, { x: b.x - 1, y: b.y + 1 }, it.color, 13, false);
        return;
      }
      arrow2(c, a, b, it.color, it.width || 3.2);
      if (it.name) label(c, it.name, b, a, it.color, it.px || 16, it.italic !== false);
    });
  }

  function draw() {
    if (!L) return;
    const c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, cw, ch);
    D.backdrop(c, cw, ch);
    const q = Q();
    const R = extentOf(q);
    const G = Math.max(3, Math.min(12, Math.ceil(R)));
    VB = SV.viewBasis(state.yaw, state.pitch);
    S = Math.min(cw * 0.42, L.hm * 0.46) / G;
    CX = cw / 2; CY = L.hm * 0.53;
    c.save();
    c.beginPath(); c.rect(0, 0, cw, L.hm); c.clip();
    drawFloorAxes(c, G);
    const hide = !!state.chal;
    if (state.mode === 'inner') drawInner(c, q, hide);
    else if (state.mode === 'cross') drawCross(c, q, hide);
    else if (state.mode === 'volume') drawVolume(c, q, hide);
    else drawPlane(c, q, hide);
    // 視角說明
    D.haloText(c, T('方位 ', 'azimuth ') + Math.round(((state.yaw % 360) + 360) % 360) + '°・' + T('仰角 ', 'elevation ') + Math.round(state.pitch) + '°',
      cw - 8, L.hm - 10, alpha(C.muted, 0.95), 'right', 'middle', fnt(11));
    c.restore();
    if (state.show.views) drawViews(c, q);
  }

  // ---------- 內積與投影 ----------
  function drawInner(c, q, hide) {
    const a = q.a, b = q.b;
    const ok = !SV.isZero(a) && !SV.isZero(b);
    if (ok && state.show.proj && q.proj) {
      const pr = q.proj;
      // a 所在的直線延伸（投影落在 a 外面或反方向時看得出來）
      const ua = SV.unit(a);
      const t0 = Math.min(0, SV.dot(pr, ua)) - 0.6, t1 = Math.max(q.la, SV.dot(pr, ua)) + 0.6;
      seg(c, SV.scale(ua, t0), SV.scale(ua, t1), alpha(C['sv-a'], 0.35), 1.2, [6, 5]);
      // 從 b 的尖端垂直落到 a 的直線
      seg(c, b, pr, alpha(C['sv-proj'], 0.9), 1.5, [5, 4]);
      const perp = SV.sub(b, pr);
      if (SV.norm(perp) > 0.15) rightMark(c, pr, SV.scale(ua, SV.dot(pr, ua) >= 0 ? -1 : 1), SV.unit(perp), Math.min(0.32, 12 / S), alpha(C['sv-proj'], 0.95));
    }
    if (ok && state.show.arc) {
      const ang = q.angle;
      if (ang > 0.5 && ang < 179.5) {
        const r = Math.max(0.5, Math.min(q.la, q.lb) * 0.32);
        const pts = arcPts(SV.unit(a), SV.unit(b), r, 28);
        poly(c, [[0, 0, 0]].concat(pts), alpha(C.accent, 0.13), null);
        strokePath(c, pts, alpha(C.accent, 0.9), 1.6);
        const pm = P(SV.scale(pts[14], 1.9));
        if (!hide) D.haloText(c, 'θ = ' + num(ang, 1) + '°', pm.x, pm.y, C.accent, 'center', 'middle', fnt(12.5, 700));
        else D.haloText(c, 'θ', pm.x, pm.y, C.accent, 'center', 'middle', fnt(13, 700, true));
      }
    }
    const items = [vecItem('a', a, C['sv-a']), vecItem('b', b, C['sv-b'])];
    drawVectors(c, items);
    if (ok && state.show.proj && q.proj && !SV.isZero(q.proj)) {
      const o = P([0, 0, 0]), e = P(q.proj);
      arrow2(c, o, e, C['sv-proj'], 2.4, { head: 10 });
    }
  }

  // ---------- 外積與面積 ----------
  function drawCross(c, q, hide) {
    const a = q.a, b = q.b, ab = SV.add(a, b);
    const ok = !SV.isZero(a) && !SV.isZero(b);
    if (ok && q.area > 1e-9) {
      poly(c, [[0, 0, 0], a, ab, b], alpha(C['sv-x'], 0.16), alpha(C['sv-x'], 0.55), 1.2);
      seg(c, a, ab, alpha(C['sv-b'], 0.55), 1.4, [5, 4]);
      seg(c, b, ab, alpha(C['sv-a'], 0.55), 1.4, [5, 4]);
      const ctr = P(SV.scale(ab, 0.5));
      D.haloText(c, hide ? T('面積 ？', 'area ?') : T('面積 ', 'area ') + num(q.area, 2), ctr.x, ctr.y + 16, C['sv-x'], 'center', 'middle', fnt(12, 700));
    }
    if (ok && state.show.arc && q.angle > 0.5 && q.angle < 179.5) {
      // 右手定則：從 a 彎向 b 的箭頭
      const r = Math.max(0.6, Math.min(q.la, q.lb) * 0.42);
      const pts = arcPts(SV.unit(a), SV.unit(b), r, 30);
      strokePath(c, pts.slice(0, 27), alpha(C['sv-x'], 0.9), 2);
      arrow2(c, P(pts[26]), P(pts[30]), C['sv-x'], 2, { head: 9, halo: false });
    }
    const k = crossScale(q);
    const X = SV.scale(q.cross, k);
    if (ok && q.area > 1e-9) {
      const s = Math.min(0.3, 11 / S);
      rightMark(c, [0, 0, 0], SV.unit(X), SV.unit(a), s, alpha(C['sv-x'], 0.8));
      rightMark(c, [0, 0, 0], SV.unit(X), SV.unit(b), s, alpha(C['sv-x'], 0.8));
    }
    const items = [vecItem('a', a, C['sv-a']), vecItem('b', b, C['sv-b'])];
    if (ok) {
      const nm = 'a × b' + (k < 1 ? T('（畫成 1/' + Math.round(1 / k) + ' 長）', ' (drawn 1/' + Math.round(1 / k) + ' as long)') : '');
      const it = vecItem(nm, X, C['sv-x']); it.italic = false; it.px = 14; it.width = 3.4;
      if (q.area > 1e-9) items.push(it);
    }
    drawVectors(c, items);
    if (ok && q.area <= 1e-9) {
      const o = P([0, 0, 0]);
      D.pill(c, 'a × b = 0', o.x, o.y - 14, C['sv-x'], 'center', fnt(12.5, 700));
    }
  }

  // ---------- 平行六面體 ----------
  function drawVolume(c, q, hide) {
    const a = q.a, b = q.b, cc = q.c;
    const O = [0, 0, 0], ab = SV.add(a, b), ac = SV.add(a, cc), bc = SV.add(b, cc), abc = SV.add(ab, cc);
    const V = [O, a, b, cc, ab, ac, bc, abc];
    const faces = [[0, 1, 4, 2], [3, 5, 7, 6], [0, 1, 5, 3], [2, 4, 7, 6], [0, 2, 6, 3], [1, 4, 7, 5]];
    const flat = Math.abs(q.triple) < 1e-9;
    const col = q.triple >= 0 ? C['sv-c'] : C['sv-x'];
    faces.map(function (f) { return { f: f, z: f.reduce(function (s, i) { return s + P(V[i]).z; }, 0) / 4 }; })
      .sort(function (p, r) { return p.z - r.z; })
      .forEach(function (F, idx) {
        const base = F.f.join() === '0,2,6,3';
        poly(c, F.f.map(function (i) { return V[i]; }), alpha(col, base ? 0.2 : 0.07 + 0.02 * idx), alpha(col, 0.55), 1.1);
      });
    // 高：a 的尖端到底面（b、c 所在平面）的垂線
    if (!flat && !SV.isZero(q.bc)) {
      const u = SV.unit(q.bc), h = SV.dot(a, u), f = SV.sub(a, SV.scale(u, h));
      seg(c, a, f, alpha(C['sv-a'], 0.85), 1.5, [5, 4]);
      const inPlane = SV.unit(SV.sub([0, 0, 0], f));
      if (SV.norm(f) > 0.2) rightMark(c, f, SV.scale(u, h > 0 ? 1 : -1), inPlane, Math.min(0.3, 11 / S), alpha(C['sv-a'], 0.85));
      const m = P(SV.scale(SV.add(a, f), 0.5));
      if (!hide) D.haloText(c, T('高 ', 'h = ') + num(Math.abs(h), 2), m.x + 8, m.y, C['sv-a'], 'left', 'middle', fnt(11.5, 700));
    }
    drawVectors(c, [vecItem('a', a, C['sv-a']), vecItem('b', b, C['sv-b']), vecItem('c', cc, C['sv-c'])]);
    const top = P(abc);
    if (!hide) D.pill(c, flat ? T('體積 0（共平面）', 'volume 0 (coplanar)') : 'V = ' + num(Math.abs(q.triple), 2), top.x, top.y - 12, col, 'center', fnt(12, 700));
  }

  // ---------- 平面與距離 ----------
  function drawPlane(c, q, hide) {
    const R = boxR(q);
    const n = q.n;
    if (SV.isZero(n)) {
      const o = P([0, 0, 0]);
      D.pill(c, T('n 是零向量，決定不了平面', 'n is the zero vector, so there is no plane'), o.x, o.y - 20, C['sv-n'], 'center', fnt(12.5, 700));
      drawVectors(c, []);
      const Qp = P(q.q);
      D.ball(c, Qp.x, Qp.y, 6, C.probe, { glow: 0.3 });
      return;
    }
    const polyPts = SV.planeBoxPolygon(n, q.d, R);
    const sd = q.sdist, F = q.foot;
    const Qp = P(q.q), Fp = P(F);
    // Q 在平面後面（離觀看者較遠）時，先畫 Q 再畫平面
    let ctr = null;
    if (polyPts.length) {
      ctr = SV.scale(polyPts.reduce(SV.add, [0, 0, 0]), 1 / polyPts.length);
    }
    const qBehind = ctr && P(q.q).z < P(F).z - 1e-9;
    function drawQ() {
      if (Math.abs(sd) > 1e-9) {
        seg(c, q.q, F, alpha(C.probe, 0.95), 2, [6, 4]);
        const B = SV.planeBasis(n);
        rightMark(c, F, SV.scale(B.w, sd > 0 ? 1 : -1), B.u, Math.min(0.3, 11 / S), alpha(C.probe, 0.9));
        const m = { x: (Qp.x + Fp.x) / 2, y: (Qp.y + Fp.y) / 2 };
        D.haloText(c, hide ? T('距離 ？', 'distance ?') : T('距離 ', 'distance ') + num(Math.abs(sd), 2), m.x + 9, m.y, C.probe, 'left', 'middle', fnt(12, 700));
        D.ball(c, Fp.x, Fp.y, 3.6, C['sv-plane'], {});
        D.haloText(c, 'F', Fp.x - 8, Fp.y + 10, C['sv-plane'], 'center', 'middle', fnt(13, 700, true));
      }
      if (state.show.drop && Math.abs(q.q[2]) > 1e-9) seg(c, q.q, [q.q[0], q.q[1], 0], alpha(C.probe, 0.5), 1.2, [2, 4]);
      D.ball(c, Qp.x, Qp.y, 6, C.probe, { glow: Math.abs(sd) < 1e-9 ? 0.8 : 0.3, ring: Math.abs(sd) < 1e-9 ? C['sv-plane'] : undefined });
      D.haloText(c, 'Q', Qp.x + 10, Qp.y - 10, C.probe, 'left', 'middle', fnt(15, 700, true));
    }
    if (qBehind) drawQ();
    if (polyPts.length) {
      poly(c, polyPts, alpha(C['sv-plane'], 0.2), alpha(C['sv-plane'], 0.85), 1.5);
      // 平面上的格線（沿平面內兩個方向）讓斜度看得出來
      const B = SV.planeBasis(n), p0 = SV.planePoint(n, q.d);
      c.save();
      c.beginPath();
      const sp = polyPts.map(P);
      c.moveTo(sp[0].x, sp[0].y); for (let i = 1; i < sp.length; i++) c.lineTo(sp[i].x, sp[i].y); c.closePath();
      c.clip();
      const span = R * 2;
      for (let i = -span; i <= span; i += 1) {
        seg(c, SV.add(p0, SV.add(SV.scale(B.u, i), SV.scale(B.v, -span))), SV.add(p0, SV.add(SV.scale(B.u, i), SV.scale(B.v, span))), alpha(C['sv-plane'], 0.22), 1);
        seg(c, SV.add(p0, SV.add(SV.scale(B.v, i), SV.scale(B.u, -span))), SV.add(p0, SV.add(SV.scale(B.v, i), SV.scale(B.u, span))), alpha(C['sv-plane'], 0.22), 1);
      }
      c.restore();
      // 法向量從平面上離原點最近的點出發（不在框內時從截面中心）
      const inBox = p0.every(function (x) { return Math.abs(x) <= R + 1e-9; });
      const base = inBox ? p0 : ctr;
      const nd = SV.scale(SV.unit(n), Math.min(2.4, Math.max(1.4, q.ln)));
      drawVectors(c, [vecItem('n', nd, C['sv-n'], base)], { noDrop: true });
      const bp = P(base);
      c.save(); c.fillStyle = C['sv-n']; c.beginPath(); c.arc(bp.x, bp.y, 3, 0, 2 * Math.PI); c.fill(); c.restore();
    } else {
      const o = P([0, 0, 0]);
      D.pill(c, T('平面在畫面範圍外', 'The plane is outside the box shown'), o.x, o.y - 20, C['sv-plane'], 'center', fnt(12, 700));
    }
    if (!qBehind) drawQ();
  }

  // ---------- 三視圖 ----------
  function drawViews(c, q) {
    const pw = L.pw, top = L.hm + 6, gap = L.gap;
    const total = pw * 3 + gap * 2, x0 = (cw - total) / 2;
    const names = [
      { key: 'front', zh: '前視圖（從 +x 看）', en: 'Front (from +x)', ax: ['y', 'z'] },
      { key: 'side', zh: '側視圖（從 +y 看）', en: 'Side (from +y)', ax: ['−x', 'z'] },
      { key: 'top', zh: '俯視圖（從 +z 看）', en: 'Top (from +z)', ax: ['y', '−x'] }
    ];
    const R = Math.max(3, extentOf(q));
    const s = (pw / 2 - 10) / (R * 1.08);
    names.forEach(function (nm, i) {
      const bx = x0 + i * (pw + gap), by = top + (L.narrow ? 18 : 22);
      const B = SV.VIEWS[nm.key];
      const cx = bx + pw / 2, cy = by + pw / 2;
      const p2 = function (p) { const r = SV.project(B, p); return { x: cx + r.x * s, y: cy - r.y * s }; };
      c.save();
      D.haloText(c, T(nm.zh, nm.en), bx + pw / 2, top + 8, C.muted, 'center', 'middle', fnt(L.narrow ? 10 : 11.5, 600));
      D.roundRect(c, bx, by, pw, pw, 8);
      c.fillStyle = alpha(C.text, D.dark ? 0.04 : 0.025); c.fill();
      c.strokeStyle = alpha(C.border, 0.9); c.lineWidth = 1; c.stroke();
      c.beginPath(); D.roundRect(c, bx, by, pw, pw, 8); c.clip();
      // 格線與軸
      c.strokeStyle = alpha(C.text, 0.07); c.lineWidth = 1;
      for (let k = -Math.ceil(R); k <= Math.ceil(R); k++) {
        if (!k) continue;
        c.beginPath(); c.moveTo(cx + k * s, by); c.lineTo(cx + k * s, by + pw); c.stroke();
        c.beginPath(); c.moveTo(bx, cy - k * s); c.lineTo(bx + pw, cy - k * s); c.stroke();
      }
      c.strokeStyle = alpha(C.text, 0.4);
      c.beginPath(); c.moveTo(bx, cy); c.lineTo(bx + pw, cy); c.moveTo(cx, by); c.lineTo(cx, by + pw); c.stroke();
      D.haloText(c, nm.ax[0], bx + pw - 8, cy - 9, alpha(C.text, 0.7), 'center', 'middle', fnt(11, 700, true));
      D.haloText(c, nm.ax[1], cx + 10, by + 9, alpha(C.text, 0.7), 'center', 'middle', fnt(11, 700, true));
      const o = p2([0, 0, 0]);
      const arr = function (v, color, from) { const a = from ? p2(from) : o; arrow2(c, a, p2(from ? SV.add(from, v) : v), color, 2, { head: 8 }); };
      if (state.mode === 'plane') {
        if (!SV.isZero(q.n)) {
          const pp = SV.planeBoxPolygon(q.n, q.d, boxR(q));
          if (pp.length) {
            const sp = pp.map(p2);
            c.beginPath(); c.moveTo(sp[0].x, sp[0].y); for (let k = 1; k < sp.length; k++) c.lineTo(sp[k].x, sp[k].y); c.closePath();
            c.fillStyle = alpha(C['sv-plane'], 0.16); c.fill(); c.strokeStyle = alpha(C['sv-plane'], 0.7); c.lineWidth = 1; c.stroke();
          }
          const F = q.foot, Qp = p2(q.q), Fp = p2(F);
          c.setLineDash([4, 3]); c.strokeStyle = C.probe; c.lineWidth = 1.4;
          c.beginPath(); c.moveTo(Qp.x, Qp.y); c.lineTo(Fp.x, Fp.y); c.stroke(); c.setLineDash([]);
        }
        const Qp = p2(q.q);
        c.fillStyle = C.probe; c.beginPath(); c.arc(Qp.x, Qp.y, 3.6, 0, 2 * Math.PI); c.fill();
      } else {
        if (state.mode === 'cross' && q.area > 1e-9) {
          const pts = [[0, 0, 0], q.a, SV.add(q.a, q.b), q.b].map(p2);
          c.beginPath(); c.moveTo(pts[0].x, pts[0].y); pts.slice(1).forEach(function (p) { c.lineTo(p.x, p.y); }); c.closePath();
          c.fillStyle = alpha(C['sv-x'], 0.14); c.fill();
          arr(SV.scale(q.cross, crossScale(q)), C['sv-x']);
        }
        if (state.mode === 'volume') {
          const a = q.a, b = q.b, cc = q.c;
          const V = [[0, 0, 0], a, b, cc, SV.add(a, b), SV.add(a, cc), SV.add(b, cc), SV.add(SV.add(a, b), cc)].map(p2);
          const E = [[0, 1], [0, 2], [0, 3], [1, 4], [1, 5], [2, 4], [2, 6], [3, 5], [3, 6], [4, 7], [5, 7], [6, 7]];
          c.strokeStyle = alpha(C['sv-c'], 0.45); c.lineWidth = 1;
          E.forEach(function (e) { c.beginPath(); c.moveTo(V[e[0]].x, V[e[0]].y); c.lineTo(V[e[1]].x, V[e[1]].y); c.stroke(); });
          arr(cc, C['sv-c']);
        }
        arr(q.a, C['sv-a']); arr(q.b, C['sv-b']);
        if (state.mode === 'inner' && state.show.proj && q.proj) arr(q.proj, C['sv-proj']);
      }
      c.restore();
    });
  }

  // =====================================================================
  // 讀數與算式
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, h) { if (lastHTML[id] !== h) { lastHTML[id] = h; $(id).innerHTML = h; } }
  let eqKey = '';
  function setEq(tex) {
    if (eqKey === tex) return;
    eqKey = tex;
    const el = $('rEq');
    if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: true }); } catch (e) { el.textContent = tex; } }
    else el.textContent = tex;
  }
  const HID = '？';
  function updateReadouts() {
    const q = Q(), hide = !!state.chal, m = state.mode;
    // 正在編輯的向量
    const nm = { a: 'a', b: 'b', c: 'c', n: 'n', q: 'Q' }[state.edit];
    setHTML('vecNow', '<i>' + nm + '</i> = ' + vtxt(state.v[state.edit]) + (state.edit === 'q' ? '' : T('，', ', ') + '|<i>' + nm + '</i>| = ' + num(SV.norm(state.v[state.edit]), 3)));
    if (m === 'inner') {
      setHTML('iA', num(q.la, 3)); setHTML('iB', num(q.lb, 3));
      setHTML('iDot', num(q.dot, 3));
      setHTML('iAng', hide ? HID : q.angle == null ? '—' : num(q.angle, 2) + '°');
      setHTML('iComp', q.comp == null ? '—' : num(q.comp, 3));
      setHTML('iProj', q.proj == null ? '—' : vtxt(q.proj, 2));
      if (q.angle == null) setEq('\\vec a\\cdot\\vec b = ' + tx(q.dot, 3));
      else {
        const l1 = '\\vec a\\cdot\\vec b = ' + txp(q.a[0]) + '\\cdot' + txp(q.b[0]) + ' + ' + txp(q.a[1]) + '\\cdot' + txp(q.b[1]) + ' + ' + txp(q.a[2]) + '\\cdot' + txp(q.b[2]) + ' = ' + tx(q.dot, 3);
        const l2 = hide ? '\\cos\\theta = \\dfrac{\\vec a\\cdot\\vec b}{|\\vec a|\\,|\\vec b|} = \\ ?'
          : '\\cos\\theta = \\dfrac{' + tx(q.dot, 3) + '}{' + tx(q.la, 3) + '\\times' + tx(q.lb, 3) + '} \\approx ' + tx(q.dot / (q.la * q.lb), 4) + ',\\quad \\theta \\approx ' + tx(q.angle, 2) + '^\\circ';
        setEq('\\begin{gathered}' + l1 + '\\\\' + l2 + '\\end{gathered}');
      }
    } else if (m === 'cross') {
      setHTML('xX', vtxt(q.cross, 3));
      setHTML('xArea', hide ? HID : num(q.area, 3));
      setHTML('xAng', q.angle == null ? '—' : num(q.angle, 2) + '°');
      setHTML('xSin', hide ? HID : q.angle == null ? '—' : num(q.la * q.lb * Math.sin(q.angle * SV.DEG), 3));
      setHTML('xPerp', num(SV.dot(q.cross, q.a), 3) + '、' + num(SV.dot(q.cross, q.b), 3));
      const a = q.a, b = q.b, x = q.cross;
      const l1 = '\\vec a\\times\\vec b = \\big(' + txp(a[1]) + '\\cdot' + txp(b[2]) + ' - ' + txp(a[2]) + '\\cdot' + txp(b[1]) + ',\\ \\cdots\\big) = ' + tvec(x, 3);
      const l2 = hide ? '|\\vec a\\times\\vec b| = \\ ?' : '|\\vec a\\times\\vec b| = \\sqrt{' + [0, 1, 2].map(function (i) { return txp(x[i], 3) + '^2'; }).join(' + ') + '} \\approx ' + tx(q.area, 3);
      setEq('\\begin{gathered}' + l1 + '\\\\' + l2 + '\\end{gathered}');
    } else if (m === 'volume') {
      setHTML('vBC', vtxt(q.bc, 3));
      setHTML('vT', hide ? HID : num(q.triple, 3));
      setHTML('vVol', hide ? HID : num(Math.abs(q.triple), 3));
      const flat = Math.abs(q.triple) < 1e-9;
      setHTML('vHand', hide ? HID : flat ? T('共平面（壓扁）', 'coplanar (flat)') : q.triple > 0 ? T('右手系（正）', 'right-handed (+)') : T('左手系（負）', 'left-handed (−)'));
      const row = function (v) { return v.map(function (x) { return tx(x); }).join(' & '); };
      setEq('\\vec a\\cdot(\\vec b\\times\\vec c) = \\det\\begin{pmatrix}' + row(q.a) + '\\\\' + row(q.b) + '\\\\' + row(q.c) + '\\end{pmatrix} = ' + (hide ? '\\ ?' : tx(q.triple, 3)));
    } else {
      const ok = !SV.isZero(q.n);
      setHTML('pEq', ok ? planeHTML(q.n, q.d) : T('（n 不可為零向量）', '(n must not be zero)'));
      setHTML('pQ', vtxt(q.q));
      setHTML('pF', ok ? vtxt(q.foot, 2) : '—');
      setHTML('pS', hide ? HID : ok ? num(q.sdist, 3) : '—');
      setHTML('pD', hide ? HID : ok ? num(q.dist, 3) : '—');
      if (!ok) setEq('\\vec n = \\vec 0');
      else setEq('\\text{dist} = \\dfrac{|\\vec n\\cdot Q - d|}{|\\vec n|} = \\dfrac{|' + tx(q.nq, 3) + ' - ' + txp(q.d) + '|}{\\sqrt{' + q.n.map(function (x) { return txp(x) + '^2'; }).join(' + ') + '}}' + (hide ? ' = \\ ?' : ' \\approx ' + tx(q.dist, 3)));
    }
    setHTML('status', statusText(q));
  }
  function planeHTML(n, d) {
    const terms = [];
    ['x', 'y', 'z'].forEach(function (s, i) {
      const c = n[i];
      if (Math.abs(c) < 1e-9) return;
      const ac = Math.abs(c), cs = Math.abs(ac - 1) < 1e-9 ? '' : SV.trim(ac, 2);
      terms.push((terms.length ? (c < 0 ? ' − ' : ' + ') : (c < 0 ? '−' : '')) + cs + '<i>' + s + '</i>');
    });
    return terms.join('') + ' = ' + tr(d);
  }
  function statusText(q) {
    const m = state.mode;
    const za = SV.isZero(q.a), zb = SV.isZero(q.b);
    if (m === 'inner' || m === 'cross') {
      if (za || zb) return T('有零向量：夾角沒有定義。', 'One vector is zero, so the angle is undefined.');
      if (Math.abs(q.dot) < 1e-9) return T('a · b = 0：兩個向量互相垂直。', 'a · b = 0: the two vectors are perpendicular.');
      if (q.area < 1e-9) return q.dot > 0 ? T('a、b 同方向平行：外積是零向量，圍不出面積。', 'a and b point the same way: the cross product is zero and they enclose no area.')
        : T('a、b 反方向平行：外積是零向量，圍不出面積。', 'a and b point opposite ways: the cross product is zero and they enclose no area.');
      if (m === 'cross') return T('右手四指從 a 彎向 b，拇指指向 a × b；它和 a、b 都垂直。', 'Curl the fingers of the right hand from a to b: the thumb points along a × b, perpendicular to both.');
      return q.dot > 0 ? T('內積為正：夾角是銳角。', 'Positive dot product: the angle is acute.') : T('內積為負：夾角是鈍角，投影落在 a 的反方向。', 'Negative dot product: the angle is obtuse and the projection points against a.');
    }
    if (m === 'volume') {
      if (za || zb || SV.isZero(q.c)) return T('有零向量：盒子壓扁了。', 'One vector is zero, so the box is flat.');
      if (Math.abs(q.triple) < 1e-9) return T('a · (b × c) = 0：三個向量共平面，體積是 0。', 'a · (b × c) = 0: the three vectors are coplanar and the volume is 0.');
      return q.triple > 0 ? T('三重積為正：a、b、c 排成右手系。', 'Positive triple product: a, b, c are right-handed.') : T('三重積為負：a、b、c 排成左手系。', 'Negative triple product: a, b, c are left-handed.');
    }
    if (SV.isZero(q.n)) return T('法向量不可以是零向量。', 'The normal vector must not be zero.');
    if (Math.abs(q.sdist) < 1e-9) return T('n · Q = d：Q 在平面上。', 'n · Q = d: Q lies on the plane.');
    return q.sdist > 0 ? T('Q 在 n 指向的那一側（有號距離為正）。', 'Q is on the side n points to (positive signed distance).') : T('Q 在 n 的反方向那一側（有號距離為負）。', 'Q is on the side opposite to n (negative signed distance).');
  }

  // =====================================================================
  // 音效
  // =====================================================================
  function sound() { return window.LabSound && window.LabSound.enabled() ? window.LabSound : null; }
  function chime(ok, soft) {
    const S = sound(); if (!S) return;
    if (ok) {
      S.tone({ freq: 659.25, dur: 0.16, type: 'sine', gain: soft ? 0.18 : 0.28 });
      S.tone({ freq: 987.77, dur: 0.24, type: 'sine', gain: soft ? 0.16 : 0.24, delay: 0.11 });
    } else S.tone({ freq: 523.25, dur: 0.12, type: 'triangle', gain: 0.2 });
  }
  function ping(freq) { const S = sound(); if (S) S.tone({ freq: freq, dur: 0.22, type: 'sine', gain: 0.2 }); }
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
  /** 進入特別的狀態（垂直、平行、共平面、在平面上）時響一聲 */
  function checkFlags() {
    const q = Q(), m = state.mode, f = {};
    const ok2 = !SV.isZero(q.a) && !SV.isZero(q.b);
    if (m === 'inner' || m === 'cross') { f.perp = ok2 && Math.abs(q.dot) < 1e-9; f.par = ok2 && q.area < 1e-9; }
    if (m === 'volume') f.flat = ok2 && !SV.isZero(q.c) && Math.abs(q.triple) < 1e-9;
    if (m === 'plane') f.on = !SV.isZero(q.n) && Math.abs(q.sdist) < 1e-9;
    const freqs = { perp: 784, par: 587.33, flat: 523.25, on: 880 };
    Object.keys(f).forEach(function (k) { if (f[k] && !state.flags[k]) ping(freqs[k]); });
    state.flags = f;
  }

  // =====================================================================
  // 任務模式
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  function emitVec() {
    const q = Q();
    emit('vec', {
      mode: state.mode, a: q.a.slice(), b: q.b.slice(), c: q.c.slice(), n: q.n.slice(), q: q.q.slice(), d: q.d,
      dot: q.dot, angle: q.angle, comp: q.comp, cross: q.cross, area: q.area, triple: q.triple,
      dist: q.dist, sdist: q.sdist, chal: !!state.chal
    });
  }
  let rotAcc = 0;
  function noteRotate(deg) {
    rotAcc += Math.abs(deg);
    if (rotAcc >= 30) { rotAcc = 0; emit('rotate', { view: view3 && view3.active ? '3d' : '2d' }); }
  }

  // =====================================================================
  // 控制項
  // =====================================================================
  const lab = $('lab');
  const elX = [$('ex'), $('ey'), $('ez')], elD = $('dd');
  function fmt(el) {
    const dec = window.LabNum ? window.LabNum.decimals(el) : 2;
    return tr(val(el), dec);
  }
  function refreshOutputs() {
    elX.forEach(function (el) { $(el.id + 'o').textContent = fmt(el); });
    $('ddo').textContent = fmt(elD);
  }
  function loadSliders() {
    const v = state.v[state.edit];
    applying = true;
    elX.forEach(function (el, i) { if (window.LabNum) window.LabNum.set(el, v[i]); else el.value = v[i]; });
    if (window.LabNum) window.LabNum.set(elD, state.d); else elD.value = state.d;
    applying = false;
    refreshOutputs();
  }
  function changed(final) {
    refreshOutputs();
    updateReadouts();
    checkFlags();
    if (view3) view3.rebuild();
    requestDraw();
    emitVec();
    if (final) judgeChal();
  }
  elX.forEach(function (el, i) {
    el.addEventListener('input', function () {
      if (applying) return;
      state.v[state.edit][i] = val(el);
      changed(false);
    });
    el.addEventListener('change', function () { if (!applying) { state.v[state.edit][i] = val(el); changed(true); } });
  });
  elD.addEventListener('input', function () { if (applying) return; state.d = val(elD); changed(false); });
  elD.addEventListener('change', function () { if (!applying) { state.d = val(elD); changed(true); } });

  function setEdit(k) {
    state.edit = k;
    document.querySelectorAll('.tab').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === k)); });
    const nm = { a: 'a', b: 'b', c: 'c', n: 'n', q: 'Q' }[k];
    ['x', 'y', 'z'].forEach(function (s) { $('le' + s).textContent = nm + ' ' + T('的 ', '') + s + T(' 分量', ' component'); });
    if (k === 'q') ['x', 'y', 'z'].forEach(function (s) { $('le' + s).textContent = T('Q 的 ', 'Q: ') + s + T(' 坐標', ' coordinate'); });
    loadSliders();
    updateReadouts();
    requestDraw();
  }
  document.querySelectorAll('.tab').forEach(function (b) {
    b.addEventListener('click', function () { setEdit(b.getAttribute('data-v')); });
  });
  function setMode(m) {
    if (m === state.mode) return;
    if (state.chal) quitChal(true);
    state.mode = m;
    lab.setAttribute('data-mode', m);
    document.querySelectorAll('.modes button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === m)); });
    // 換到這個模式用不到的分頁時，改選第一個
    const allowed = m === 'plane' ? ['n', 'q'] : m === 'volume' ? ['a', 'b', 'c'] : ['a', 'b'];
    if (allowed.indexOf(state.edit) < 0) setEdit(allowed[0]);
    state.flags = {};
    checkFlags();
    updateReadouts();
    if (view3) view3.rebuild();
    resize();
    emitVec();
  }
  document.querySelectorAll('.modes button').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
  });
  $('swap').addEventListener('click', function () {
    const t = state.v.a; state.v.a = state.v.b; state.v.b = t;
    loadSliders(); changed(true);
  });
  $('negate').addEventListener('click', function () {
    const k = state.edit;
    state.v[k] = state.v[k].map(function (x) { return x === 0 ? 0 : -x; });
    if (k === 'n') state.d = state.d === 0 ? 0 : -state.d;   // n 與 d 一起變號：同一個平面，法向量反過來
    loadSliders(); changed(true);
  });
  [['showProj', 'proj'], ['showArc', 'arc'], ['showDrop', 'drop'], ['showViews', 'views']].forEach(function (p) {
    $(p[0]).addEventListener('change', function () {
      state.show[p[1]] = $(p[0]).checked;
      if (p[1] === 'views') resize(); else requestDraw();
      if (view3) view3.rebuild();
    });
  });
  function setSpin(on) {
    state.spinning = !!on;
    $('spin').textContent = on ? T('停止旋轉', 'Stop turning') : T('自動旋轉', 'Turn slowly');
    $('spin').setAttribute('aria-pressed', String(!!on));
    if (on) requestDraw();
  }
  $('spin').addEventListener('click', function () { setSpin(!state.spinning); });
  $('clear').addEventListener('click', function () {
    if (state.chal) quitChal(true);
    state.log = []; state.streak = []; state.round = 0; lastChal = null;
    setChalMsg('');
    renderLog();
    const S = sound(); if (S) S.tone({ freq: 392, dur: 0.1, type: 'triangle', gain: 0.14 });
  });

  // ---------- 拖曳轉動視角 ----------
  let drag = null;
  cv.addEventListener('pointerdown', function (ev) {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return;
    drag = { x: ev.clientX, y: ev.clientY, yaw: state.yaw, pitch: state.pitch, id: ev.pointerId };
    try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
    if (state.spinning) setSpin(false);
  });
  cv.addEventListener('pointermove', function (ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    state.yaw = drag.yaw - dx * 0.45;
    if (ev.pointerType === 'mouse' || ev.pointerType === 'pen') state.pitch = Math.max(-85, Math.min(89, drag.pitch + dy * 0.35));
    requestDraw();
  });
  function endDrag(ev) {
    if (!drag || (ev && ev.pointerId !== drag.id)) return;
    noteRotate(Math.abs(state.yaw - drag.yaw) + Math.abs(state.pitch - drag.pitch));
    drag = null;
  }
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  if (window.LabKeys) {
    window.LabKeys.attach(cv, {
      label: T('空間向量畫布。左右方向鍵轉方位角，上下方向鍵改仰角，Shift 加方向鍵轉得更多。', 'Space vectors canvas. Left and right arrow keys turn the view around, up and down change the elevation; hold Shift for bigger steps.'),
      items: [{
        name: function () { return T('視角', 'View'); },
        move: function (dx, dy, big) {
          const st = big ? 30 : 7.5;
          if (state.spinning) setSpin(false);
          state.yaw -= dx * st;
          state.pitch = Math.max(-85, Math.min(89, state.pitch + dy * st));
          noteRotate(Math.abs(dx * st) + Math.abs(dy * st));
          requestDraw();
          return true;
        },
        describe: function () { return T('方位 ', 'azimuth ') + Math.round(((state.yaw % 360) + 360) % 360) + '°，' + T('仰角 ', 'elevation ') + Math.round(state.pitch) + '°'; }
      }],
      onChange: function () { requestDraw(); }
    });
  }
  $('resetCam').addEventListener('click', function () {
    if (view3 && view3.active) { view3.resetCamera(); return; }
    setSpin(false);
    state.yaw = YAW0; state.pitch = PITCH0;
    requestDraw();
  });

  // =====================================================================
  // 挑戰
  // =====================================================================
  const chalMsg = $('chalMsg');
  function setChalMsg(msg, ok) { chalMsg.textContent = msg || ''; chalMsg.classList.toggle('ok', !!ok); }
  function kindText(kind, target) {
    switch (kind) {
      case 'angle': return T('讓 a、b 的夾角是 ' + target + '°（容許 ±1°）', 'make the angle between a and b equal to ' + target + '° (±1°)');
      case 'area': return T('讓 a、b 圍成的平行四邊形面積是 ' + tr(target, 1) + '（容許 ±0.05）', 'make the area of the parallelogram spanned by a and b equal to ' + tr(target, 1) + ' (±0.05)');
      case 'volume': return T('讓平行六面體的體積是 ' + tr(target, 1) + '（容許 ±0.05）', 'make the volume of the parallelepiped equal to ' + tr(target, 1) + ' (±0.05)');
      default: return T('讓 Q 到平面的距離是 ' + tr(target, 1) + '（容許 ±0.05）', 'make the distance from Q to the plane equal to ' + tr(target, 1) + ' (±0.05)');
    }
  }
  function startChal(forced) {
    const ch = forced || SV.genChallenge(rand, state.mode, stateForCore(), lastChal);
    if (!ch) { setChalMsg(T('這個設定出不了題，換一組向量再試。', 'No challenge fits this setting; change the vectors and try again.')); return; }
    state.round++;
    state.chal = { kind: ch.kind, target: ch.target, tol: ch.tol, t0: performance.now(), round: state.round };
    lastChal = ch;
    const who = { angle: 'b', area: 'b', volume: 'c', dist: 'Q' }[ch.kind];
    setChalMsg(T('第 ' + state.round + ' 題：' + kindText(ch.kind, ch.target) + '。只改 ' + who + ' 就做得到；調好放開滑桿就判定，讀數暫時藏起來。',
      'Challenge ' + state.round + ': ' + kindText(ch.kind, ch.target) + '. Changing ' + who + ' alone is enough; it is judged when you release a slider, and the readings are hidden for now.'));
    $('quitChal').hidden = false;
    $('newChal').textContent = T('換一題', 'Another one');
    updateReadouts();
    if (view3) view3.rebuild();
    requestDraw();
    emitVec();
  }
  function judgeChal() {
    const ch = state.chal;
    if (!ch) return;
    if (!SV.chalHit(ch, stateForCore())) return;
    const time = (performance.now() - ch.t0) / 1000;
    const got = SV.measure(ch.kind, stateForCore());
    state.log.push({ round: ch.round, kind: ch.kind, target: ch.target, got: got, time: time });
    state.streak.push(time);
    const last3 = state.streak.length >= 3 ? state.streak.slice(-3).reduce(function (s, x) { return s + x; }, 0) : null;
    state.chal = null;
    $('quitChal').hidden = true;
    $('newChal').textContent = T('出下一題', 'Next challenge');
    setChalMsg(T('答對！實際是 ', 'Got it! The actual value is ') + (ch.kind === 'angle' ? num(got, 2) + '°' : num(got, 3)) + T('，用了 ', ', in ') + time.toFixed(1) + T(' 秒。', ' s.'), true);
    chime(true);
    renderLog();
    updateReadouts();
    if (view3) view3.rebuild();
    requestDraw();
    emit('challenge', { kind: ch.kind, mode: state.mode, target: ch.target, time: time, streak: state.streak.length, last3: last3 });
    emitVec();
  }
  function quitChal(silent) {
    const ch = state.chal;
    if (!ch) return;
    state.log.push({ round: ch.round, kind: ch.kind, target: ch.target, got: null, time: null });
    state.chal = null;
    state.streak = [];
    $('quitChal').hidden = true;
    $('newChal').textContent = T('出一題', 'New challenge');
    if (!silent) setChalMsg(T('這題放棄了，連續答對重新計算。', 'Challenge given up; the streak starts over.'));
    else setChalMsg('');
    renderLog();
    updateReadouts();
    if (view3) view3.rebuild();
    requestDraw();
  }
  $('newChal').addEventListener('click', function () {
    if (state.chal) { quitChal(true); }
    startChal();
  });
  $('quitChal').addEventListener('click', function () { quitChal(false); });
  function renderLog() {
    const t = $('log');
    $('logEmpty').hidden = state.log.length > 0;
    if (!state.log.length) { t.innerHTML = ''; return; }
    const rows = state.log.slice(-8).reverse();
    const kn = { angle: T('夾角', 'angle'), area: T('面積', 'area'), volume: T('體積', 'volume'), dist: T('距離', 'distance') };
    let h = '<tr><th>' + T('題', '#') + '</th><th>' + T('目標', 'Target') + '</th><th>' + T('做到', 'Got') + '</th><th>' + T('秒', 's') + '</th></tr>';
    rows.forEach(function (r) {
      const unit = r.kind === 'angle' ? '°' : '';
      h += '<tr><td>' + r.round + '</td><td class="f">' + kn[r.kind] + ' ' + (r.kind === 'angle' ? r.target : tr(r.target, 1)) + unit + '</td><td>' +
        (r.got == null ? '—' : (r.kind === 'angle' ? num(r.got, 1) : num(r.got, 2)) + unit) + '</td><td>' +
        (r.time == null ? T('放棄', 'gave up') : r.time.toFixed(1)) + '</td></tr>';
    });
    t.innerHTML = h;
  }

  // =====================================================================
  // 3D 檢視（js/space-vectors-3d.js，按「3D 空間」時才載入）
  // =====================================================================
  let view3 = null, threeLib = null, loadToken = 0;
  const stage = $('stage'), host3 = $('view3'), viewMsg = $('viewMsg');
  const bridge = {
    T: T, D: D, SV: SV, state: state,
    colors: function () { readColors(); return C; },
    quantities: Q, crossScale: crossScale, boxR: boxR, extentOf: extentOf, num: num, vtxt: vtxt,
    yaw0: YAW0, pitch0: PITCH0,
    onRotate: function () { noteRotate(30); },
    onContextLost: function () {
      setView('2d');
      viewMsg.textContent = T('3D 繪圖環境中斷，已切回 2D 斜視圖。', 'The 3D graphics context was lost, so the view switched back to 2D.');
    }
  };
  function webglAvailable() {
    try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); }
    catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.SpaceVec3D) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (threeLib && window.SpaceVec3D) return Promise.resolve(threeLib);
    const base = new URL('vendor/three/', document.baseURI).href;
    const own = new URL('js/space-vectors-3d.js' + (SCRIPT_V ? '?v=' + SCRIPT_V : ''), document.baseURI).href;
    return Promise.all([import(base + 'three.module.min.js'), import(base + 'OrbitControls.js'), loadScript(own)]).then(function (mods) {
      if (!window.SpaceVec3D) throw new Error('space-vectors-3d.js did not load');
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
      setSpin(false);
      viewMsg.textContent = T('正在載入 3D 檢視…', 'Loading the 3D view…');
      loadThree().then(function (lib) {
        if (token !== loadToken) return;
        stage.classList.add('is3d');
        view3 = window.SpaceVec3D.create(lib, host3, bridge);
        viewMsg.textContent = '';
        $('spin').hidden = true;
        requestDraw();
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
      $('spin').hidden = false;
      if (/3D/.test(viewMsg.textContent) && !/2D/.test(viewMsg.textContent)) viewMsg.textContent = '';
      resize();
    }
  }
  function fail3D() {
    if (view3) { try { view3.dispose(); } catch (e) { /* 忽略 */ } view3 = null; }
    stage.classList.remove('is3d');
    setPressed('2d');
    $('spin').hidden = false;
    viewMsg.textContent = T('無法開啟 3D 檢視（這個瀏覽器不支援 WebGL，或 3D 程式載入失敗），維持 2D 斜視圖。',
      'The 3D view could not be started (WebGL is not available or the 3D library failed to load), so the 2D drawing is kept.');
    resize();
  }
  $('view2d').addEventListener('click', function () { setView('2d'); });
  $('view3d').addEventListener('click', function () { setView('3d'); });

  // 給測試用的介面（不影響畫面）
  window.__sv = {
    state: state, Q: Q,
    setVec: function (k, v) { state.v[k] = v.slice(); if (state.edit === k) loadSliders(); changed(true); },
    setD: function (d) { state.d = d; loadSliders(); changed(true); },
    startChal: function (c) { startChal(c); },
    seed: function (s) { rand = SV.rng(s); },
    view3: function () { return view3; }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  readColors();
  state.v.a = [val(elX[0]), val(elX[1]), val(elX[2])];
  state.d = val(elD);
  setEdit('a');
  renderLog();
  updateSoundButton();
  setSpin(false);
  checkFlags();
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    eqKey = '';
    renderLog(); updateReadouts(); updateSoundButton(); setSpin(state.spinning); setEdit(state.edit);
    if (view3) view3.onTheme();
    requestDraw();
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'lang') themeChanged(); });
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden && state.spinning) setSpin(false); });
  if (reducedMotion) setSpin(false);
  resize();
  updateReadouts();
})();
