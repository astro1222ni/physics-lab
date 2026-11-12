/* derivative-core.js — 「導數與切線」的數學核心（與畫面分離，Node 單元測試：tests/derivative-core.test.js）
 *
 * 五種函數：三次多項式 ax³ + bx² + cx + d（係數可調）、sin x、eˣ、ln x、|x|。
 * 每種函數都有 f、f′、f″、f‴ 的解析式；差商、對稱差商、切線、單邊導數、
 * 斜率等於 m 的點、三次函數的實根，以及挑戰題的出題。
 * 這裡的導數全部用公式算，不用數值微分；數值的差商只用來和導數比較。 */
(function (root) {
  'use strict';

  const TAU = 2 * Math.PI;

  // ---------- 五種函數 ----------
  // 每一種：f(x, c)、d1、d2、d3（c 是三次函數的係數 {a, b, c, d}，其他函數不用）；
  // dom(x)：x 是否在定義域內；diff(x)：x 是否可微；view：預設的 x 範圍與 a 的範圍。
  const FUNCS = {
    cubic: {
      f: function (x, k) { return ((k.a * x + k.b) * x + k.c) * x + k.d; },
      d1: function (x, k) { return (3 * k.a * x + 2 * k.b) * x + k.c; },
      d2: function (x, k) { return 6 * k.a * x + 2 * k.b; },
      d3: function (x, k) { return 6 * k.a; },
      dom: function () { return true; },
      diff: function () { return true; },
      x: [-4, 4], aRange: [-4, 4]
    },
    sin: {
      f: function (x) { return Math.sin(x); },
      d1: function (x) { return Math.cos(x); },
      d2: function (x) { return -Math.sin(x); },
      d3: function (x) { return -Math.cos(x); },
      dom: function () { return true; },
      diff: function () { return true; },
      x: [-TAU, TAU], aRange: [-6.28, 6.28], y: [-1.6, 1.6], dy: [-1.6, 1.6]
    },
    exp: {
      f: function (x) { return Math.exp(x); },
      d1: function (x) { return Math.exp(x); },
      d2: function (x) { return Math.exp(x); },
      d3: function (x) { return Math.exp(x); },
      dom: function () { return true; },
      diff: function () { return true; },
      x: [-4, 2.6], aRange: [-4, 2.5], y: [-1, 8], dy: [-1, 8]
    },
    ln: {
      f: function (x) { return x > 0 ? Math.log(x) : NaN; },
      d1: function (x) { return x > 0 ? 1 / x : NaN; },
      d2: function (x) { return x > 0 ? -1 / (x * x) : NaN; },
      d3: function (x) { return x > 0 ? 2 / (x * x * x) : NaN; },
      dom: function (x) { return x > 0; },
      diff: function (x) { return x > 0; },
      x: [-0.6, 7], aRange: [0.1, 7], y: [-3.2, 2.6], dy: [-0.8, 5]
    },
    abs: {
      f: function (x) { return Math.abs(x); },
      d1: function (x) { return x > 0 ? 1 : x < 0 ? -1 : NaN; },
      d2: function (x) { return x !== 0 ? 0 : NaN; },
      d3: function (x) { return x !== 0 ? 0 : NaN; },
      dom: function () { return true; },
      diff: function (x) { return x !== 0; },
      x: [-4, 4], aRange: [-4, 4], y: [-1, 4.5], dy: [-1.8, 1.8]
    }
  };
  const IDS = ['cubic', 'sin', 'exp', 'ln', 'abs'];
  const DEFAULT_COEF = { a: 0.3, b: -0.6, c: -0.9, d: 1.2 };

  function F(id) { return FUNCS[id] || FUNCS.cubic; }
  function f(id, x, k) { return F(id).f(x, k); }
  /** f′(x)；不可微或不在定義域時回傳 null */
  function d1(id, x, k) { const g = F(id); return g.dom(x) && g.diff(x) ? g.d1(x, k) : null; }
  function d2(id, x, k) { const g = F(id); return g.dom(x) && g.diff(x) ? g.d2(x, k) : null; }
  function d3(id, x, k) { const g = F(id); return g.dom(x) && g.diff(x) ? g.d3(x, k) : null; }
  function inDomain(id, x) { return F(id).dom(x); }

  /** 單邊導數 { left, right }：|x| 在 0 是 −1、+1；其他可微的點左右相同；不在定義域時都是 null */
  function oneSided(id, x, k) {
    if (id === 'abs' && x === 0) return { left: -1, right: 1 };
    const v = d1(id, x, k);
    return { left: v, right: v };
  }

  /** 差商 [f(a + h) − f(a)] / h；a 或 a + h 不在定義域、或 h = 0 時回傳 null */
  function diffQuot(id, a, h, k) {
    if (!h || !inDomain(id, a) || !inDomain(id, a + h)) return null;
    return (f(id, a + h, k) - f(id, a, k)) / h;
  }
  /** 對稱差商 [f(a + h) − f(a − h)] / (2h) */
  function symQuot(id, a, h, k) {
    if (!h || !inDomain(id, a + h) || !inDomain(id, a - h)) return null;
    return (f(id, a + h, k) - f(id, a - h, k)) / (2 * h);
  }
  /** 切線 y = m(x − a) + f(a)：{ m, y0（= f(a)）, b（y 截距）, xInt（x 截距，水平線為 null） } */
  function tangent(id, a, k) {
    const m = d1(id, a, k);
    if (m == null) return null;
    const y0 = f(id, a, k);
    return { m: m, y0: y0, b: y0 - m * a, xInt: m !== 0 ? a - y0 / m : null };
  }
  /** 差商的主要誤差項（泰勒展開的第一項）：前向 h·f″(a)/2，對稱 h²·f‴(a)/6 */
  function leadErr(id, a, h, k, sym) {
    if (sym) { const t = d3(id, a, k); return t == null ? null : h * h * t / 6; }
    const s = d2(id, a, k); return s == null ? null : h * s / 2;
  }

  // ---------- h 的對數滑桿：位置 0–100 → h 由 2 縮小到 0.001 ----------
  const H_MAX = 2, H_MIN = 0.001, H_SPAN = Math.log10(H_MAX / H_MIN);
  function hFromPos(pos) { return H_MAX * Math.pow(10, -H_SPAN * pos / 100); }
  function posFromH(h) { return -Math.log10(Math.abs(h) / H_MAX) / H_SPAN * 100; }

  // ---------- 斜率等於 m 的點 ----------
  /** 在 [lo, hi] 裡 f′(x) = m 的所有 x（由小到大）；|x| 沒有孤立的解，回傳空陣列 */
  function slopePoints(id, m, k, lo, hi) {
    const out = [];
    const push = function (x) { if (x >= lo - 1e-12 && x <= hi + 1e-12 && inDomain(id, x)) out.push(x); };
    if (id === 'cubic') {
      const A = 3 * k.a, B = 2 * k.b, C = k.c - m;
      if (Math.abs(A) < 1e-14) { if (Math.abs(B) > 1e-14) push(-C / B); }
      else {
        const disc = B * B - 4 * A * C;
        if (disc >= 0) {
          const s = Math.sqrt(disc);
          // 避免相消誤差的二次公式
          const q = -0.5 * (B + (B >= 0 ? s : -s));
          const r1 = q / A, r2 = q !== 0 ? C / q : r1;
          push(Math.min(r1, r2));
          if (disc > 0) push(Math.max(r1, r2));
        }
      }
    } else if (id === 'sin') {
      if (m >= -1 && m <= 1) {
        const t = Math.acos(m);
        for (let n = Math.floor((lo - t) / TAU) - 1; n <= Math.ceil((hi + t) / TAU) + 1; n++) {
          push(t + n * TAU);
          if (t > 0 && t < Math.PI) push(-t + n * TAU);   // m = ±1 時只有一族解
        }
      }
    } else if (id === 'exp') { if (m > 0) push(Math.log(m)); }
    else if (id === 'ln') { if (m > 0) push(1 / m); }
    out.sort(function (p, q) { return p - q; });
    return out.filter(function (x, i) { return i === 0 || x - out[i - 1] > 1e-9; });
  }

  // ---------- 三次函數的實根 ----------
  /** ax³ + bx² + cx + d = 0 的相異實根（由小到大）；a = 0 時退化成二次或一次 */
  function cubicRoots(k) {
    const a = k.a, b = k.b, c = k.c, d = k.d;
    const roots = [];
    if (Math.abs(a) < 1e-14) {
      if (Math.abs(b) < 1e-14) { if (Math.abs(c) > 1e-14) roots.push(-d / c); }
      else {
        const disc = c * c - 4 * b * d;
        if (disc >= 0) { const s = Math.sqrt(disc); roots.push((-c - s) / (2 * b), (-c + s) / (2 * b)); }
      }
    } else {
      // 用極值點切成單調區間，每段用二分法（再用牛頓法修整）找變號
      const crit = slopePoints('cubic', 0, k, -Infinity, Infinity);
      const g = function (x) { return ((a * x + b) * x + c) * x + d; };
      const R = 1 + Math.max(Math.abs(b / a), Math.abs(c / a), Math.abs(d / a));   // 柯西根的界
      const pts = [-R].concat(crit.filter(function (x) { return x > -R && x < R; }), [R]);
      for (let i = 0; i + 1 < pts.length; i++) {
        let lo = pts[i], hi = pts[i + 1], glo = g(lo), ghi = g(hi);
        if (glo === 0) { roots.push(lo); continue; }
        if (glo * ghi > 0) continue;
        for (let it = 0; it < 200 && hi - lo > 1e-15 * Math.max(1, Math.abs(lo)); it++) {
          const mid = (lo + hi) / 2, gm = g(mid);
          if (gm === 0) { lo = hi = mid; break; }
          if (gm * glo < 0) { hi = mid; } else { lo = mid; glo = gm; }
        }
        roots.push((lo + hi) / 2);
      }
      if (g(R) === 0) roots.push(R);
      // 重根：極值點剛好是根
      crit.forEach(function (x) { if (Math.abs(g(x)) < 1e-12 * Math.max(1, Math.abs(d))) roots.push(x); });
    }
    roots.sort(function (p, q) { return p - q; });
    return roots.filter(function (x, i) { return i === 0 || x - roots[i - 1] > 1e-7; });
  }

  // ---------- 畫面範圍 ----------
  const NICE = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20];
  function niceUp(v) { for (let i = 0; i < NICE.length; i++) if (v <= NICE[i] + 1e-9) return NICE[i]; return NICE[NICE.length - 1]; }
  /** 依函數決定縱軸範圍：三次函數取樣後分級調整（避免一直跳動），其他函數固定 */
  function viewY(id, k, which, cap) {
    const g = F(id);
    if (id !== 'cubic') return which === 'd' ? g.dy.slice() : g.y.slice();
    cap = cap || (which === 'd' ? 12 : 8);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i <= 160; i++) {
      const x = g.x[0] + (g.x[1] - g.x[0]) * i / 160;
      const v = which === 'd' ? g.d1(x, k) : g.f(x, k);
      if (v < lo) lo = v; if (v > hi) hi = v;
    }
    lo = Math.max(-cap, lo); hi = Math.min(cap, hi);
    let top = hi > 0 ? niceUp(hi * 1.12) : 0.5, bot = lo < 0 ? -niceUp(-lo * 1.12) : -0.5;
    if (top - bot < 2) { const mid = (top + bot) / 2; top = Math.max(top, mid + 1); bot = Math.min(bot, mid - 1); }
    return [Math.max(-cap, bot), Math.min(cap, top)];
  }

  // ---------- 挑戰：找出切線斜率等於 m 的點 ----------
  /** 挑戰用的三次函數（形狀不同、係數都在滑桿格點上） */
  const CHAL_CUBICS = [
    { a: 0.3, b: 0, c: -2, d: 0 }, { a: -0.2, b: 0.3, c: 1.5, d: -1 }, { a: 0.1, b: 0.4, c: -1, d: -2 },
    { a: 0.25, b: -0.6, c: -1, d: 1.5 }, { a: -0.3, b: -0.5, c: 1, d: 2 }, { a: 0.2, b: 0, c: 0, d: -1 },
    { a: 0, b: 0.4, c: -1, d: -2 }, { a: 0.1, b: 0.3, c: -1.8, d: 0.5 }
  ];
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
  /** 一題挑戰的解是否「好找」：解都在 a 的範圍內、離邊界 ≥ 0.3、該處 |f″| ≥ 0.25（切線不會貼著曲線一大段）、
   *  離目前的 a 至少 0.5；回傳解的陣列或 null */
  function chalSolutions(id, m, k, curA) {
    const R = F(id).aRange;
    const xs = slopePoints(id, m, k, R[0] + 0.3, R[1] - 0.3);
    if (!xs.length) return null;
    for (let i = 0; i < xs.length; i++) {
      if (Math.abs(d2(id, xs[i], k)) < 0.25) return null;
      if (curA != null && Math.abs(xs[i] - curA) < 0.5) return null;
    }
    return xs;
  }
  /** 出一題：{ fn, coef, m, sols }；m 取 0.1 的倍數（exp、ln 取 0.05 的倍數），和上一題不同 */
  function genChallenge(rand, prev, curA) {
    const ids = ['cubic', 'cubic', 'sin', 'exp', 'ln'];
    for (let tries = 0; tries < 500; tries++) {
      const id = ids[Math.floor(rand() * ids.length)];
      const coef = id === 'cubic' ? Object.assign({}, CHAL_CUBICS[Math.floor(rand() * CHAL_CUBICS.length)]) : Object.assign({}, DEFAULT_COEF);
      let m;
      if (id === 'cubic') {
        const yr = viewY('cubic', coef, 'd');
        m = Math.round((yr[0] + (yr[1] - yr[0]) * (0.1 + 0.8 * rand())) * 10) / 10;
      } else if (id === 'sin') m = Math.round((-0.9 + 1.8 * rand()) * 10) / 10;
      else if (id === 'exp') m = Math.round((0.2 + 5.5 * rand()) * 20) / 20;
      else m = Math.round((0.2 + 2.3 * rand()) * 20) / 20;
      if (m === 0 && rand() < 0.6) continue;   // 水平切線偶爾出就好
      if (prev && prev.fn === id && Math.abs(prev.m - m) < 0.25) continue;
      const sols = chalSolutions(id, m, coef, curA != null && (!prev || prev.fn === id) ? curA : null);
      if (!sols || sols.length > 4) continue;
      return { fn: id, coef: coef, m: m, sols: sols };
    }
    return { fn: 'exp', coef: Object.assign({}, DEFAULT_COEF), m: 2, sols: [Math.log(2)] };
  }
  /** a 是否對準某一個解（容許 tol，預設 0.02） */
  function chalHit(sols, a, tol) {
    tol = tol == null ? 0.02 : tol;
    for (let i = 0; i < sols.length; i++) if (Math.abs(a - sols[i]) <= tol + 1e-12) return true;
    return false;
  }

  // ---------- 描點涵蓋率 ----------
  const TRACE_BINS = 240;
  /** 描點的格子數：a 的範圍切成 TRACE_BINS 格 */
  function traceBin(id, x) {
    const R = F(id).aRange;
    return Math.max(0, Math.min(TRACE_BINS - 1, Math.floor((x - R[0]) / (R[1] - R[0]) * TRACE_BINS)));
  }
  function binCenter(id, i) { const R = F(id).aRange; return R[0] + (i + 0.5) / TRACE_BINS * (R[1] - R[0]); }

  // ---------- 文字 ----------
  function trim(v, dec) {
    let s = (Math.abs(v) < 0.5 * Math.pow(10, -dec) ? 0 : v).toFixed(dec);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '-0') s = '0';
    return s;
  }
  /** 三次函數的 TeX：省略 0 的項與係數 1 */
  function cubicTex(k) {
    const terms = [];
    const add = function (c, pow) {
      if (Math.abs(c) < 1e-12) return;
      const neg = c < 0, ac = Math.abs(c);
      const cs = pow > 0 && Math.abs(ac - 1) < 1e-12 ? '' : trim(ac, 3);
      const xs = pow === 0 ? '' : pow === 1 ? 'x' : 'x^{' + pow + '}';
      terms.push({ neg: neg, s: cs + xs });
    };
    add(k.a, 3); add(k.b, 2); add(k.c, 1); add(k.d, 0);
    if (!terms.length) return '0';
    return terms.map(function (t, i) { return (i === 0 ? (t.neg ? '-' : '') : (t.neg ? ' - ' : ' + ')) + t.s; }).join('');
  }
  /** f′ 的 TeX（三次函數） */
  function cubicDerivTex(k) { return cubicTex({ a: 0, b: 3 * k.a, c: 2 * k.b, d: k.c }); }

  const api = {
    FUNCS: FUNCS, IDS: IDS, DEFAULT_COEF: DEFAULT_COEF, TAU: TAU,
    f: f, d1: d1, d2: d2, d3: d3, inDomain: inDomain, oneSided: oneSided,
    diffQuot: diffQuot, symQuot: symQuot, tangent: tangent, leadErr: leadErr,
    H_MIN: H_MIN, H_MAX: H_MAX, hFromPos: hFromPos, posFromH: posFromH,
    slopePoints: slopePoints, cubicRoots: cubicRoots, viewY: viewY, niceUp: niceUp,
    CHAL_CUBICS: CHAL_CUBICS, rng: rng, genChallenge: genChallenge, chalSolutions: chalSolutions, chalHit: chalHit,
    TRACE_BINS: TRACE_BINS, traceBin: traceBin, binCenter: binCenter,
    trim: trim, cubicTex: cubicTex, cubicDerivTex: cubicDerivTex
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DerivCore = api;
})(typeof window !== 'undefined' ? window : this);
