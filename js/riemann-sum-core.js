/* riemann-sum-core.js — 「黎曼和、定積分與旋轉體」的數學核心（與畫面分離，Node 單元測試：tests/riemann-sum-core.test.js）
 *
 * 一、黎曼和：把 [a, b] 等分成 n 段，寬 h = (b − a)/n；左端點、右端點、中點、梯形、上和（每段的最大值）、下和（每段的最小值）。
 * 二、定積分：用反導函數算準確值 F(b) − F(a)（微積分基本定理）。
 * 三、旋轉體：y = f(x) 繞 x 軸旋轉，體積 π∫ f(x)² dx；近似用圓盤（或梯形對應的圓台）一片片疊起來。
 * 四、誤差：端點法、上下和的誤差約和 1/n 成正比，中點法、梯形法約和 1/n² 成正比。 */
(function (root) {
  'use strict';
  const PI = Math.PI;

  // ---------- 函數 ----------
  /** 每個函數：f、反導函數 F、f² 的反導函數 G、定義域 dom、預設區間 def、[l, r] 內的臨界點 crit（求每段的最大最小值用） */
  const FUNCS = {
    sq: {
      f: function (x) { return x * x; }, F: function (x) { return x * x * x / 3; }, G: function (x) { return Math.pow(x, 5) / 5; },
      dom: [-3, 3], def: [0, 2], crit: function (l, r) { return l < 0 && r > 0 ? [0] : []; },
      tex: 'x^2', Ftex: '\\frac{x^3}{3}'
    },
    sin: {
      f: Math.sin, F: function (x) { return -Math.cos(x); }, G: function (x) { return x / 2 - Math.sin(2 * x) / 4; },
      dom: [-7, 7], def: [0, 3.1416], crit: function (l, r) {
        const out = [];
        for (let k = Math.ceil((l - PI / 2) / PI); PI / 2 + k * PI < r; k++) { const c = PI / 2 + k * PI; if (c > l) out.push(c); }
        return out;
      },
      tex: '\\sin x', Ftex: '-\\cos x'
    },
    sqrt: {
      f: function (x) { return Math.sqrt(Math.max(0, x)); }, F: function (x) { return 2 / 3 * Math.pow(Math.max(0, x), 1.5); }, G: function (x) { return x * x / 2; },
      dom: [0, 7], def: [0, 4], crit: function () { return []; },
      tex: '\\sqrt{x}', Ftex: '\\frac{2}{3}x^{3/2}'
    },
    exp: {
      f: Math.exp, F: Math.exp, G: function (x) { return Math.exp(2 * x) / 2; },
      dom: [-3, 3], def: [0, 2], crit: function () { return []; },
      tex: 'e^x', Ftex: 'e^x'
    },
    recip: {
      f: function (x) { return 1 / x; }, F: Math.log, G: function (x) { return -1 / x; },
      dom: [0.2, 7], def: [1, 4], crit: function () { return []; },
      tex: '\\frac{1}{x}', Ftex: '\\ln x'
    },
    semi: {
      f: function (x) { return Math.sqrt(Math.max(0, 4 - x * x)); },
      F: function (x) { const u = Math.max(-2, Math.min(2, x)); return (u * Math.sqrt(Math.max(0, 4 - u * u)) + 4 * Math.asin(u / 2)) / 2; },
      G: function (x) { return 4 * x - x * x * x / 3; },
      dom: [-2, 2], def: [-2, 2], crit: function (l, r) { return l < 0 && r > 0 ? [0] : []; },
      tex: '\\sqrt{4 - x^2}', Ftex: '\\tfrac12\\left(x\\sqrt{4-x^2} + 4\\sin^{-1}\\tfrac{x}{2}\\right)'
    }
  };
  const KEYS = ['sq', 'sin', 'sqrt', 'exp', 'recip', 'semi'];
  const RULES = ['left', 'right', 'mid', 'trap', 'upper', 'lower'];
  const N_MAX = 200, MIN_W = 0.1;

  /** 把區間限制在定義域內、寬度至少 MIN_W；moved = 'a' 或 'b'（使用者剛改的那一端，另一端讓位） */
  function clampAB(key, a, b, moved) {
    const d = FUNCS[key].dom;
    a = Math.max(d[0], Math.min(d[1] - MIN_W, a));
    b = Math.max(d[0] + MIN_W, Math.min(d[1], b));
    if (b - a < MIN_W - 1e-12) {
      if (moved === 'a') b = Math.min(d[1], a + MIN_W);
      else a = Math.max(d[0], b - MIN_W);
      if (b - a < MIN_W - 1e-12) { if (moved === 'a') a = b - MIN_W; else b = a + MIN_W; }
    }
    return [round6(a), round6(b)];
  }
  function round6(v) { return Math.round(v * 1e6) / 1e6; }

  /** [l, r] 上 f 的最大值與最小值（端點與臨界點） */
  function extremes(key, l, r) {
    const F = FUNCS[key], pts = [l, r].concat(F.crit(l, r));
    let mx = -Infinity, mn = Infinity;
    pts.forEach(function (x) { const y = F.f(x); if (y > mx) mx = y; if (y < mn) mn = y; });
    return [mn, mx];
  }
  /** 第 i 段（0 起算）的取樣點與高度；回傳 { l, r, x（取樣點，梯形為 null）, y（長方形高度；梯形為平均高度） , yl, yr } */
  function piece(key, a, b, n, rule, i) {
    const F = FUNCS[key], h = (b - a) / n, l = a + i * h, r = i === n - 1 ? b : a + (i + 1) * h;
    if (rule === 'left') return { l: l, r: r, x: l, y: F.f(l) };
    if (rule === 'right') return { l: l, r: r, x: r, y: F.f(r) };
    if (rule === 'mid') { const m = (l + r) / 2; return { l: l, r: r, x: m, y: F.f(m) }; }
    if (rule === 'trap') { const yl = F.f(l), yr = F.f(r); return { l: l, r: r, x: null, y: (yl + yr) / 2, yl: yl, yr: yr }; }
    const e = extremes(key, l, r);
    return { l: l, r: r, x: null, y: rule === 'upper' ? e[1] : e[0] };
  }
  /** 黎曼和（用 Kahan 加總，n = 200 也不會累積誤差） */
  function sum(key, a, b, n, rule) {
    const h = (b - a) / n;
    let s = 0, comp = 0;
    for (let i = 0; i < n; i++) {
      const v = piece(key, a, b, n, rule, i).y - comp, t = s + v;
      comp = (t - s) - v; s = t;
    }
    return s * h;
  }
  function exact(key, a, b) { const F = FUNCS[key]; return F.F(b) - F.F(a); }
  function all(key, a, b, n) {
    const o = { exact: exact(key, a, b) };
    RULES.forEach(function (r) { o[r] = sum(key, a, b, n, r); });
    return o;
  }

  // ---------- 旋轉體 ----------
  function volExact(key, a, b) { const F = FUNCS[key]; return PI * (F.G(b) - F.G(a)); }
  /** 第 i 片：圓盤（半徑 r）或圓台（半徑 rl、rr）；upper／lower 用 |f| 在這段的最大／最小值 */
  function disk(key, a, b, n, rule, i) {
    const F = FUNCS[key], h = (b - a) / n, l = a + i * h, r = i === n - 1 ? b : a + (i + 1) * h;
    if (rule === 'trap') return { l: l, r: r, rl: Math.abs(F.f(l)), rr: Math.abs(F.f(r)) };
    if (rule === 'upper' || rule === 'lower') {
      const e = extremes(key, l, r);
      const big = Math.max(Math.abs(e[0]), Math.abs(e[1])), small = (e[0] <= 0 && e[1] >= 0) ? 0 : Math.min(Math.abs(e[0]), Math.abs(e[1]));
      const rad = rule === 'upper' ? big : small;
      return { l: l, r: r, rl: rad, rr: rad };
    }
    const p = piece(key, a, b, n, rule, i), rad = Math.abs(p.y);
    return { l: l, r: r, rl: rad, rr: rad };
  }
  /** 近似體積：圓盤 π r² h；圓台 π h (r₁² + r₁r₂ + r₂²)/3 */
  function volSum(key, a, b, n, rule) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const d = disk(key, a, b, n, rule, i), h = d.r - d.l;
      s += PI * h * (d.rl * d.rl + d.rl * d.rr + d.rr * d.rr) / 3;
    }
    return s;
  }

  // ---------- 誤差 ----------
  /** n = 1…N 的誤差 S_n − I */
  function errSeries(key, a, b, rule, N) {
    const I = exact(key, a, b), out = [];
    for (let n = 1; n <= N; n++) out.push(sum(key, a, b, n, rule) - I);
    return out;
  }
  /** 從 n 到 2n 誤差縮小的倍數 */
  function shrink(key, a, b, rule, n) {
    const I = exact(key, a, b);
    return (sum(key, a, b, n, rule) - I) / (sum(key, a, b, 2 * n, rule) - I);
  }

  // ---------- 挑戰：估計面積 ----------
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
  const CHAL_TOL = 0.03;
  /** 挑戰的範圍：函數都是正的，b 的上限讓圖不會太高 */
  const CHAL = {
    sq: { a: [0, 1], b: 3 }, sqrt: { a: [0, 2], b: 7 }, exp: { a: [-2, 0], b: 2 }, recip: { a: [0.3, 1.5], b: 7 }, semi: { a: [-2, -0.5], b: 2 }
  };
  /** 隨機出題：函數與 a 固定，要把 b 調到面積等於 T（±3%）；b0 是開始時的 b（離答案夠遠） */
  function genChallenge(rand, prev) {
    const keys = Object.keys(CHAL);
    for (let tries = 0; tries < 400; tries++) {
      const key = keys[Math.floor(rand() * keys.length)], c = CHAL[key];
      if (prev && prev.key === key && keys.length > 1 && rand() < 0.7) continue;
      const a = Math.round((c.a[0] + rand() * (c.a[1] - c.a[0])) * 10) / 10;
      const bAns = Math.round((a + 0.8 + rand() * (c.b - a - 0.8)) * 100) / 100;
      if (bAns > c.b || bAns - a < 0.8) continue;
      const T = Math.round(exact(key, a, bAns) * 10) / 10;
      if (!(T >= 1 && T <= 15)) continue;
      // 開始的 b：面積和目標差 40% 以上
      let b0 = null;
      for (let k = 0; k < 30; k++) {
        const cand = Math.round((a + MIN_W + rand() * (c.b - a - MIN_W)) * 10) / 10;
        if (Math.abs(exact(key, a, cand) - T) >= 0.4 * T) { b0 = cand; break; }
      }
      if (b0 == null) continue;
      return { key: key, a: a, T: T, b0: b0, bMax: c.b, tol: CHAL_TOL * T };
    }
    return null;
  }
  function chalHit(ch, b) { return Math.abs(exact(ch.key, ch.a, b) - ch.T) <= ch.tol; }

  function trim(v, dec) {
    let s = (Math.abs(v) < 0.5 * Math.pow(10, -dec) ? 0 : v).toFixed(dec);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (s === '-0') s = '0';
    return s;
  }

  const api = {
    FUNCS: FUNCS, KEYS: KEYS, RULES: RULES, N_MAX: N_MAX, MIN_W: MIN_W, CHAL: CHAL, CHAL_TOL: CHAL_TOL,
    clampAB: clampAB, extremes: extremes, piece: piece, sum: sum, exact: exact, all: all,
    volExact: volExact, disk: disk, volSum: volSum, errSeries: errSeries, shrink: shrink,
    rng: rng, genChallenge: genChallenge, chalHit: chalHit, trim: trim
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RiemannCore = api;
})(typeof window !== 'undefined' ? window : this);
