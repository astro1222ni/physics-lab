/* lines-circles-core.js — 「直線與圓：距離、交點與切線」的數學核心（純函式，瀏覽器與 Node 共用）
 *
 * 直線 L：a x + b y + c = 0（a、b 不同時為 0）；圓 C：(x − h)² + (y − k)² = r²。
 *   點到直線的距離 d = |a h + b k + c| / √(a² + b²)；d > r 相離、d = r 相切、d < r 相交兩點，弦長 2√(r² − d²)。
 *   代入法：把直線代入圓的方程式得到一元二次方程式，判別式 Δ 的正負號和 r − d 相同（Δ/4 = b²[(a² + b²)r² − (a h + b k + c)²]）。
 *   圓外一點 P 的兩條切線：切線長 √(|PC|² − r²)，兩切線夾角 2 arcsin(r / |PC|)。 */
(function (root) {
  'use strict';

  const TOL_TOUCH = 0.005;   // 判定相切、點在圓上的容許值（距離與半徑差）

  function round6(v) { return Math.round(v * 1e6) / 1e6; }
  function trim(v, dec) {
    if (v == null || !isFinite(v)) return '—';
    let s = (+v).toFixed(dec == null ? 2 : dec);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '-0') s = '0';
    return s;
  }

  /** 有號距離（a h + b k + c）/ √(a² + b²)；a、b 都是 0 時 null */
  function signedDist(a, b, c, x, y) {
    const n = Math.hypot(a, b);
    if (!(n > 1e-12)) return null;
    return (a * x + b * y + c) / n;
  }
  function dist(a, b, c, x, y) { const s = signedDist(a, b, c, x, y); return s == null ? null : Math.abs(s); }
  /** 垂足 */
  function foot(a, b, c, x, y) {
    const n2 = a * a + b * b;
    if (!(n2 > 1e-24)) return null;
    const t = (a * x + b * y + c) / n2;
    return [x - a * t, y - b * t];
  }
  /** 位置關係：'apart'（相離）、'tangent'（相切）、'cross'（相交兩點） */
  function relation(d, r, tol) {
    const e = tol == null ? TOL_TOUCH : tol;
    if (d == null) return null;
    if (Math.abs(d - r) <= e) return 'tangent';
    return d > r ? 'apart' : 'cross';
  }
  /** 交點（相切時一個，相交時兩個，沿直線方向排序）；用垂足 ± 半弦長，數值穩定 */
  function intersections(a, b, c, h, k, r, tol) {
    const d = dist(a, b, c, h, k);
    if (d == null) return [];
    const rel = relation(d, r, tol);
    const f = foot(a, b, c, h, k);
    if (rel === 'apart') return [];
    if (rel === 'tangent') return [f];
    const n = Math.hypot(a, b), ux = -b / n, uy = a / n, s = Math.sqrt(Math.max(0, r * r - d * d));
    const p = [[f[0] - s * ux, f[1] - s * uy], [f[0] + s * ux, f[1] + s * uy]];
    return p.sort(function (P, Q) { return P[0] - Q[0] || P[1] - Q[1]; });
  }
  function chord(d, r) { return d == null || d > r ? null : 2 * Math.sqrt(Math.max(0, r * r - d * d)); }

  /**
   * 代入法：b ≠ 0 時把 y = −(a x + c)/b 代入圓，得 A x² + B x + C = 0（已乘 b²）；
   * b = 0（鉛直線 x = −c/a）時改代 x，得 y 的二次方程式。回傳 { v（'x' 或 'y'）, A, B, C, disc }
   */
  function quadratic(a, b, c, h, k, r) {
    if (Math.abs(b) > 1e-12) {
      const ck = c + b * k;
      const A = a * a + b * b, B = 2 * (a * ck - b * b * h), C = b * b * h * h + ck * ck - b * b * r * r;
      return { v: 'x', A: A, B: B, C: C, disc: B * B - 4 * A * C };
    }
    if (Math.abs(a) > 1e-12) {
      const x0 = -c / a, A = 1, B = -2 * k, C = k * k + (x0 - h) * (x0 - h) - r * r;
      return { v: 'y', A: A, B: B, C: C, disc: B * B - 4 * A * C };
    }
    return null;
  }

  /** 圓外一點 P 的切線：{ L（|PC|）, inside, on, len（切線長）, angle（兩切線夾角，度）, pts（切點）, lines（切線 {a, b, c}） } */
  function tangentsFrom(px, py, h, k, r, tol) {
    const dx = px - h, dy = py - k, L = Math.hypot(dx, dy), e = tol == null ? TOL_TOUCH : tol;
    if (Math.abs(L - r) <= e) {
      // 點在圓上：只有一條切線，和半徑垂直
      return { L: L, inside: false, on: true, len: 0, angle: 180, pts: [[px, py]], lines: [{ a: dx, b: dy, c: -(dx * px + dy * py) }] };
    }
    if (L < r) return { L: L, inside: true, on: false, len: null, angle: null, pts: [], lines: [] };
    const len = Math.sqrt(L * L - r * r);
    const base = Math.atan2(dy, dx), phi = Math.acos(r / L);
    const pts = [base - phi, base + phi].map(function (t) { return [h + r * Math.cos(t), k + r * Math.sin(t)]; });
    const lines = pts.map(function (T) { return lineThrough([px, py], T); });
    return { L: L, inside: false, on: false, len: len, angle: 2 * Math.asin(r / L) * 180 / Math.PI, pts: pts, lines: lines };
  }
  /** 過兩點的直線 a x + b y + c = 0（a² + b² = 1，a ≥ 0） */
  function lineThrough(P, Q) {
    let a = Q[1] - P[1], b = P[0] - Q[0];
    const n = Math.hypot(a, b);
    if (!(n > 1e-12)) return null;
    a /= n; b /= n;
    if (a < 0 || (a === 0 && b < 0)) { a = -a; b = -b; }
    return { a: a, b: b, c: -(a * P[0] + b * P[1]) };
  }
  /** 兩條直線的夾角（0–90°） */
  function angleBetween(l1, l2) {
    const cs = Math.abs(l1.a * l2.a + l1.b * l2.b) / (Math.hypot(l1.a, l1.b) * Math.hypot(l2.a, l2.b));
    return Math.acos(Math.min(1, cs)) * 180 / Math.PI;
  }

  // ---------- 亂數與挑戰 ----------
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const CHAL_TOL = 0.03;
  const C_RANGE = [-40, 40];
  /**
   * 挑戰：圓（h、k 是 −5 到 5 的整數，r 是 1.5 到 6、每 0.5）與直線的方向 a、b（−6 到 6 的整數，都不是 0）固定，
   * 只能調 c，讓直線和圓相切。兩個答案 c = −(a h + b k) ± r√(a² + b²)，至少一個在滑桿範圍 −40 到 40 內，而且不是格點（要細調）。
   */
  function genChallenge(rand, prev) {
    for (let t = 0; t < 200; t++) {
      const h = Math.floor(rand() * 11) - 5, k = Math.floor(rand() * 11) - 5;
      const r = 1.5 + Math.floor(rand() * 10) * 0.5;
      let a = Math.floor(rand() * 13) - 6, b = Math.floor(rand() * 13) - 6;
      if (!a || !b) continue;
      const g = gcd(Math.abs(a), Math.abs(b)); a /= g; b /= g;
      const n = Math.hypot(a, b), c0 = -(a * h + b * k);
      const cs = [c0 - r * n, c0 + r * n].filter(function (c) { return c >= C_RANGE[0] && c <= C_RANGE[1]; });
      if (!cs.length) continue;
      if (prev && prev.h === h && prev.k === k && prev.a === a && prev.b === b) continue;
      // 開始的 c：離兩個答案都夠遠（相差至少 3）
      let c1 = null;
      for (let q = 0; q < 30; q++) {
        const c = Math.round((rand() * 60 - 30) * 2) / 2;
        if (cs.every(function (x) { return Math.abs(x - c) >= 3; }) && [c0 - r * n, c0 + r * n].every(function (x) { return Math.abs(x - c) >= 3; })) { c1 = c; break; }
      }
      if (c1 == null) continue;
      return { h: h, k: k, r: r, a: a, b: b, c0: c1, cs: cs };
    }
    return null;
  }
  function gcd(x, y) { while (y) { const t = x % y; x = y; y = t; } return x || 1; }
  function chalHit(ch, c) {
    const d = dist(ch.a, ch.b, c, ch.h, ch.k);
    return d != null && Math.abs(d - ch.r) <= CHAL_TOL + 1e-9;
  }

  // ---------- 文字 ----------
  /** 直線方程式 a x + b y + c = 0 的文字（係數修成最多 dec 位小數） */
  function lineEq(a, b, c, dec) {
    const D = dec == null ? 2 : dec;
    const parts = [];
    const term = function (coef, v) {
      const t = trim(Math.abs(coef), D);
      if (t === '0') return;
      const sgn = coef < 0 ? '−' : '+';
      const body = v ? (t === '1' ? v : t + v) : t;
      parts.push({ sgn: sgn, body: body });
    };
    term(a, 'x'); term(b, 'y'); term(c, '');
    if (!parts.length) return '0 = 0';
    return parts.map(function (p, i) { return i === 0 ? (p.sgn === '−' ? '−' : '') + p.body : ' ' + p.sgn + ' ' + p.body; }).join('') + ' = 0';
  }
  /** 圓的方程式 (x − h)² + (y − k)² = r² */
  function circleEq(h, k, r, dec) {
    const D = dec == null ? 2 : dec;
    const part = function (v, c) { const t = trim(Math.abs(c), D); return t === '0' ? v + '²' : '(' + v + (c < 0 ? ' + ' : ' − ') + t + ')²'; };
    return part('x', h) + ' + ' + part('y', k) + ' = ' + trim(r * r, D + 2);
  }

  const api = {
    TOL_TOUCH: TOL_TOUCH, CHAL_TOL: CHAL_TOL, C_RANGE: C_RANGE,
    round6: round6, trim: trim, signedDist: signedDist, dist: dist, foot: foot, relation: relation,
    intersections: intersections, chord: chord, quadratic: quadratic, tangentsFrom: tangentsFrom,
    lineThrough: lineThrough, angleBetween: angleBetween, rng: rng, genChallenge: genChallenge, chalHit: chalHit,
    lineEq: lineEq, circleEq: circleEq, gcd: gcd
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LinesCirclesCore = api;
})(typeof window !== 'undefined' ? window : this);
