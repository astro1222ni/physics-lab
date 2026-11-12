/* space-vectors-core.js — 「空間向量：內積、外積與平面」的數學核心（與畫面分離，Node 單元測試：tests/space-vectors-core.test.js）
 *
 * 向量一律用長度 3 的陣列 [x, y, z]（右手坐標系，z 軸朝上）。
 * 內積、夾角、投影、外積、純量三重積、平面 n·x = d、點到平面的距離、平面和立方體的截面多邊形、
 * 斜投影（可轉動的正投影）與三視圖的基底、挑戰出題。 */
(function (root) {
  'use strict';
  const DEG = Math.PI / 180;
  const EPS = 1e-9;

  // ---------- 基本運算 ----------
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function scale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { return Math.hypot(a[0], a[1], a[2]); }
  function isZero(a, eps) { return norm(a) <= (eps == null ? EPS : eps); }
  function unit(a) { const n = norm(a); return n > 0 ? scale(a, 1 / n) : [0, 0, 0]; }
  /** 有幾個分量不是 0（判斷向量是不是躺在坐標軸上） */
  function nonzeroCount(a) { return (Math.abs(a[0]) > EPS) + (Math.abs(a[1]) > EPS) + (Math.abs(a[2]) > EPS); }
  function onAxis(a) { return nonzeroCount(a) <= 1; }
  /** 夾角（度）；有零向量時回傳 null。用 atan2(|a×b|, a·b)，在 0° 與 180° 附近也準 */
  function angleDeg(a, b) {
    if (isZero(a) || isZero(b)) return null;
    return Math.atan2(norm(cross(a, b)), dot(a, b)) / DEG;
  }
  /** b 在 a 方向上的純量投影 a·b/|a| */
  function compOn(a, b) { const n = norm(a); return n > 0 ? dot(a, b) / n : null; }
  /** b 在 a 上的投影向量 (a·b/|a|²) a */
  function projOn(a, b) { const n2 = dot(a, a); return n2 > 0 ? scale(a, dot(a, b) / n2) : null; }
  function parallel(a, b) { return !isZero(a) && !isZero(b) && norm(cross(a, b)) <= EPS * Math.max(1, norm(a) * norm(b)); }
  function triple(a, b, c) { return dot(a, cross(b, c)); }
  function area(a, b) { return norm(cross(a, b)); }

  // ---------- 平面 n·x = d ----------
  /** 點 q 到平面的有號距離（正：在 n 指向的那一側）；n = 0 時回傳 null */
  function signedDist(n, d, q) { const m = norm(n); return m > 0 ? (dot(n, q) - d) / m : null; }
  /** q 在平面上的垂足 */
  function foot(n, d, q) { const n2 = dot(n, n); return n2 > 0 ? sub(q, scale(n, (dot(n, q) - d) / n2)) : null; }
  /** 平面上離原點最近的點 (d/|n|²) n */
  function planePoint(n, d) { const n2 = dot(n, n); return n2 > 0 ? scale(n, d / n2) : null; }
  /** 平面上兩個互相垂直的單位向量（和 n 一起組成右手系） */
  function planeBasis(n) {
    const w = unit(n);
    const ref = Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u = unit(cross(ref, w));
    const v = cross(w, u);
    return { u: u, v: v, w: w };
  }
  /** 平面和立方體 [−R, R]³ 的截面（凸多邊形，頂點依序排好）；沒有交集時回傳 [] */
  function planeBoxPolygon(n, d, R) {
    if (isZero(n)) return [];
    const pts = [];
    const corners = [];
    for (let i = 0; i < 8; i++) corners.push([(i & 1) ? R : -R, (i & 2) ? R : -R, (i & 4) ? R : -R]);
    const edges = [];
    for (let i = 0; i < 8; i++) for (let k = 0; k < 3; k++) { const j = i ^ (1 << k); if (j > i) edges.push([i, j]); }
    edges.forEach(function (e) {
      const p = corners[e[0]], q = corners[e[1]];
      const fp = dot(n, p) - d, fq = dot(n, q) - d;
      if (Math.abs(fp) < 1e-12) pts.push(p.slice());
      if (Math.abs(fq) < 1e-12) pts.push(q.slice());
      if (fp * fq < 0) { const t = fp / (fp - fq); pts.push(add(p, scale(sub(q, p), t))); }
    });
    // 去掉重複的點
    const uniq = [];
    pts.forEach(function (p) { if (!uniq.some(function (u) { return norm(sub(u, p)) < 1e-9; })) uniq.push(p); });
    if (uniq.length < 3) return [];
    const ctr = scale(uniq.reduce(add, [0, 0, 0]), 1 / uniq.length);
    const B = planeBasis(n);
    uniq.sort(function (p, q) {
      const dp = sub(p, ctr), dq = sub(q, ctr);
      return Math.atan2(dot(dp, B.v), dot(dp, B.u)) - Math.atan2(dot(dq, B.v), dot(dq, B.u));
    });
    return uniq;
  }

  // ---------- 投影（畫面） ----------
  /** 可轉動的正投影：方位角 yaw（繞 z 軸）、仰角 pitch。
   *  e：指向觀看者的方向；r：畫面向右；u：畫面向上（r × u = e，右手系）。 */
  function viewBasis(yawDeg, pitchDeg) {
    const t = yawDeg * DEG, p = pitchDeg * DEG;
    const ct = Math.cos(t), st = Math.sin(t), cp = Math.cos(p), sp = Math.sin(p);
    return { e: [cp * ct, cp * st, sp], r: [-st, ct, 0], u: [-sp * ct, -sp * st, cp] };
  }
  /** 三視圖的基底：前視圖從 +x 看（y 向右、z 向上）、側視圖從 +y 看（−x 向右、z 向上）、俯視圖從 +z 看（y 向右、−x 向上） */
  const VIEWS = {
    front: { e: [1, 0, 0], r: [0, 1, 0], u: [0, 0, 1] },
    side: { e: [0, 1, 0], r: [-1, 0, 0], u: [0, 0, 1] },
    top: { e: [0, 0, 1], r: [0, 1, 0], u: [-1, 0, 0] }
  };
  function project(B, p) { return { x: dot(p, B.r), y: dot(p, B.u), z: dot(p, B.e) }; }

  // ---------- 挑戰出題 ----------
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const STEP = 0.5, LIM = 4;
  /** 滑桿格點上的隨機向量（分量 −4 到 4、間隔 0.5），不是零向量 */
  function randVec(rand) {
    for (;;) {
      const v = [0, 1, 2].map(function () { return Math.round((rand() * 2 * LIM - LIM) / STEP) * STEP; });
      if (!isZero(v)) return v;
    }
  }
  /** 各模式要算的量 */
  function measure(kind, s) {
    switch (kind) {
      case 'angle': return angleDeg(s.a, s.b);
      case 'area': return area(s.a, s.b);
      case 'volume': return Math.abs(triple(s.a, s.b, s.c));
      case 'dist': { const v = signedDist(s.n, s.d, s.q); return v == null ? null : Math.abs(v); }
      default: return null;
    }
  }
  const KIND = { inner: 'angle', cross: 'area', volume: 'volume', plane: 'dist' };
  const TOL = { angle: 1, area: 0.05, volume: 0.05, dist: 0.05 };
  /** 依目前的模式出一題：用格點上的隨機向量算出目標值再取整（角度取整數度、其他取 0.1），
   *  保證用滑桿就做得到；目標和目前的值至少差一段，也和上一題不同。
   *  s：{ a, b, c, n, d, q }。回傳 { kind, target, tol, witness（做得到的一組向量） } */
  function genChallenge(rand, mode, s, prev) {
    const kind = KIND[mode] || 'angle';
    const cur = measure(kind, s);
    for (let tries = 0; tries < 400; tries++) {
      const t = { a: s.a, b: s.b, c: s.c, n: s.n, d: s.d, q: s.q };
      // 換一個向量（角度、面積換 b；體積換 c；距離換 Q）
      if (kind === 'angle' || kind === 'area') t.b = randVec(rand);
      else if (kind === 'volume') t.c = randVec(rand);
      else t.q = randVec(rand);
      const v = measure(kind, t);
      if (v == null) continue;
      const target = kind === 'angle' ? Math.round(v) : Math.round(v * 10) / 10;
      if (Math.abs(measure(kind, t) - target) > TOL[kind] - 1e-9) continue;
      if (kind === 'angle' && (target < 10 || target > 170)) continue;
      if (kind !== 'angle' && (target < 0.5 || target > 30)) continue;
      const gap = kind === 'angle' ? 20 : Math.max(1, 0.25 * target);
      if (cur != null && Math.abs(cur - target) < gap) continue;
      if (prev && prev.kind === kind && Math.abs(prev.target - target) < gap) continue;
      return { kind: kind, target: target, tol: TOL[kind], witness: t };
    }
    return null;
  }
  function chalHit(ch, s) { const v = measure(ch.kind, s); return v != null && Math.abs(v - ch.target) <= ch.tol + 1e-9; }

  // ---------- 文字 ----------
  function trim(v, dec) {
    let s = (Math.abs(v) < 0.5 * Math.pow(10, -dec) ? 0 : v).toFixed(dec);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '-0') s = '0';
    return s;
  }
  function vecText(v, dec) { return '(' + v.map(function (x) { return trim(x, dec == null ? 2 : dec); }).join(', ') + ')'; }
  /** 平面方程式 ax + by + cz = d 的 TeX（省略 0 與係數 1） */
  function planeTex(n, d) {
    const terms = [];
    ['x', 'y', 'z'].forEach(function (s, i) {
      const c = n[i];
      if (Math.abs(c) < EPS) return;
      const ac = Math.abs(c), cs = Math.abs(ac - 1) < EPS ? '' : trim(ac, 2);
      terms.push((terms.length ? (c < 0 ? ' - ' : ' + ') : (c < 0 ? '-' : '')) + cs + s);
    });
    return (terms.length ? terms.join('') : '0') + ' = ' + trim(d, 2);
  }

  const api = {
    DEG: DEG, EPS: EPS, STEP: STEP, LIM: LIM,
    add: add, sub: sub, scale: scale, dot: dot, cross: cross, norm: norm, unit: unit, isZero: isZero,
    nonzeroCount: nonzeroCount, onAxis: onAxis, angleDeg: angleDeg, compOn: compOn, projOn: projOn,
    parallel: parallel, triple: triple, area: area,
    signedDist: signedDist, foot: foot, planePoint: planePoint, planeBasis: planeBasis, planeBoxPolygon: planeBoxPolygon,
    viewBasis: viewBasis, VIEWS: VIEWS, project: project,
    rng: rng, randVec: randVec, measure: measure, KIND: KIND, TOL: TOL, genChallenge: genChallenge, chalHit: chalHit,
    trim: trim, vecText: vecText, planeTex: planeTex
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SVCore = api;
})(typeof window !== 'undefined' ? window : this);
