/* limits-core.js — 「數列與函數的極限」的數學核心（純函式，瀏覽器與 Node 共用）
 *
 * 數列：每個數列用一個 spec 描述（種類＋參數），term(spec, n) 是第 n 項（n 從 1 開始）。
 *   收斂時 err(spec, n) = |a_n − L|；bound(spec, n) 是遞減的上界（≥ err），用來快速找出 N 的範圍。
 *   Nmin(spec, ε) = 最小的 N，使得所有 n ≥ N 都有 |a_n − L| < ε（嚴格小於）；發散時是 null。
 * 函數：f(x) 在 x → a 的極限 L；deltaMax(id, ε) = 最大的 δ，使得 0 < |x − a| < δ 時 |f(x) − L| < ε。
 * 無窮等比級數：S_n = a(1 − r^n)/(1 − r)，|r| < 1 時 S∞ = a/(1 − r)。 */
(function (root) {
  'use strict';

  // ================================================================ 數列
  /** 頁面上的預設數列 */
  const SEQS = {
    recip: { kind: 'recip', c: 1 },
    rat: { kind: 'rat', p: 2, q: 1, s: 3 },
    alt: { kind: 'alt', c: 1 },
    sinn: { kind: 'sinn' },
    geo: { kind: 'geo', r: 0.8 },
    e: { kind: 'e' },
    root: { kind: 'root' },
    osc: { kind: 'osc' }
  };
  function term(sp, n) {
    switch (sp.kind) {
      case 'recip': return sp.c / n;
      case 'rat': return (sp.p * n + sp.q) / (n + sp.s);
      case 'alt': return (n % 2 ? -sp.c : sp.c) / n;
      case 'sinn': return Math.sin(n) / n;
      case 'geo': return Math.pow(sp.r, n);
      case 'e': return Math.pow(1 + 1 / n, n);
      case 'root': { const s = Math.sqrt(n * n + n); return n / (s + n); }   // = √(n² + n) − n，換成不會相消的寫法
      case 'osc': return n % 2 ? -1 : 1;
    }
    return NaN;
  }
  /** 極限：{ conv, L }（發散時 conv = false、L = null） */
  function limit(sp) {
    switch (sp.kind) {
      case 'recip': case 'alt': case 'sinn': return { conv: true, L: 0 };
      case 'rat': return { conv: true, L: sp.p };
      case 'geo':
        if (Math.abs(sp.r) < 1) return { conv: true, L: 0 };
        if (sp.r === 1) return { conv: true, L: 1 };
        return { conv: false, L: null };
      case 'e': return { conv: true, L: Math.E };
      case 'root': return { conv: true, L: 0.5 };
      case 'osc': return { conv: false, L: null };
    }
    return { conv: false, L: null };
  }
  function err(sp, n) {
    switch (sp.kind) {
      case 'recip': return Math.abs(sp.c) / n;
      case 'rat': return Math.abs(sp.q - sp.p * sp.s) / (n + sp.s);
      case 'alt': return Math.abs(sp.c) / n;
      case 'sinn': return Math.abs(Math.sin(n)) / n;
      case 'geo': return sp.r === 1 ? 0 : Math.pow(Math.abs(sp.r), n);
      case 'e': return Math.E - Math.pow(1 + 1 / n, n);
      case 'root': { const s = Math.sqrt(n * n + n); return n / (2 * (s + n) * (s + n)); }
    }
    const lim = limit(sp);
    return lim.conv ? Math.abs(term(sp, n) - lim.L) : Infinity;
  }
  /** 遞減的上界（≥ err）；sin n / n 用 1/n，其他的 err 本身就遞減 */
  function bound(sp, n) { return sp.kind === 'sinn' ? 1 / n : err(sp, n); }
  /** 最小的 N（所有 n ≥ N 都 |a_n − L| < ε）；發散時 null */
  function Nmin(sp, eps) {
    if (!limit(sp).conv || !(eps > 0)) return null;
    // 先找 M：bound(M) < ε（之後全部都在帶子裡）
    let hi = 1;
    while (bound(sp, hi) >= eps) { hi *= 2; if (hi > 1e9) return null; }
    let lo = Math.max(1, Math.floor(hi / 2));
    if (bound(sp, lo) < eps) hi = lo;
    else { while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (bound(sp, mid) < eps) hi = mid; else lo = mid; } }
    // M 以前逐項檢查，找最後一個跑出帶子的項
    for (let n = hi - 1; n >= 1; n--) if (!(err(sp, n) < eps)) return n + 1;
    return 1;
  }
  /** 從 N 開始第一個跑出帶子的項（找到 Nmin 以前就停；都在帶子裡時 null） */
  function firstOut(sp, eps, N, cap) {
    const lim = limit(sp);
    if (!lim.conv) {
      return null;
    }
    const M = Nmin(sp, eps);
    const end = Math.min(M == null ? (cap || 1e6) : M, cap || Infinity);
    for (let n = Math.max(1, N); n < end; n++) if (!(err(sp, n) < eps)) return n;
    return null;
  }
  /** 發散的數列：以 Lc 為中心、寬 ε 的帶子，從 N 起第一個跑出去的項（掃到 N + 2000） */
  function firstOutAround(sp, Lc, eps, N) {
    for (let n = Math.max(1, N); n < N + 2000; n++) if (!(Math.abs(term(sp, n) - Lc) < eps)) return n;
    return null;
  }

  // ================================================================ 函數
  const FUNCS = {
    hole: { id: 'hole', a: 1, L: 2, f: function (x) { return x === 1 ? NaN : (x * x - 1) / (x - 1); }, hole: true, w: 2 },
    sinc: { id: 'sinc', a: 0, L: 1, f: function (x) { return x === 0 ? NaN : Math.sin(x) / x; }, hole: true, w: 8 },
    xsin: { id: 'xsin', a: 0, L: 0, f: function (x) { return x === 0 ? NaN : x * Math.sin(1 / x); }, hole: true, w: 1.2, squeeze: true },
    sign: { id: 'sign', a: 0, L: null, left: -1, right: 1, f: function (x) { return x === 0 ? NaN : x > 0 ? 1 : -1; }, hole: true, w: 2 },
    inv2: { id: 'inv2', a: 0, L: null, left: Infinity, right: Infinity, f: function (x) { return x === 0 ? NaN : 1 / (x * x); }, hole: true, w: 2 },
    epow: { id: 'epow', a: 0, L: Math.E, f: function (x) { return x === 0 || x <= -1 ? NaN : Math.pow(1 + x, 1 / x); }, hole: true, w: 2.5, domainLo: -1 }
  };
  function bisect(g, lo, hi, it) {
    // g(lo) = false、g(hi) = true，找交界
    for (let i = 0; i < (it || 80); i++) { const m = (lo + hi) / 2; if (g(m)) hi = m; else lo = m; }
    return lo;
  }
  /** 最大的 δ：0 < |x − a| < δ 時 |f(x) − L| < ε；沒有極限時 null */
  function deltaMax(id, eps) {
    const F = FUNCS[id];
    if (!F || F.L == null || !(eps > 0)) return null;
    const bad = function (x) { return !(Math.abs(F.f(x) - F.L) < eps); };
    if (id === 'hole') return eps;   // |f(x) − 2| = |x − 1|
    if (id === 'sinc') {
      if (eps >= 1) return Math.PI;   // 1 − sin x / x 在 x = π 才到 1
      return bisect(function (x) { return bad(x); }, 0, Math.PI);   // 在 (0, π) 單調遞增，偶函數
    }
    if (id === 'xsin') {
      // |x sin(1/x)| ≤ |x|，所以 |x| < ε 一定在帶子裡；從 ε 開始細細往外找第一個跑出去的點（奇函數的絕對值是偶函數）
      let x = eps;
      if (bad(x)) return eps;
      while (x < 50) {
        const step = Math.max(x * x * 0.002, 1e-9);   // 1/x 的一個週期約是 2π x²
        const nx = x + step;
        if (bad(nx)) return bisect(bad, x, nx, 60);
        x = nx;
      }
      return Infinity;
    }
    if (id === 'epow') {
      // (1 + x)^(1/x) 在 (−1, ∞) 遞減：右邊比 e 小、左邊比 e 大
      let right = Infinity, left = 1;
      if (eps < Math.E - 1) right = bisect(function (x) { return bad(x); }, 1e-12, 1e6, 200);
      left = bisect(function (t) { return bad(-t); }, 1e-12, 1 - 1e-15, 200);
      return Math.min(left, right);
    }
    return null;
  }
  /** δ 可不可以用：δ ≤ δ_max（多留一點數值誤差） */
  function deltaOK(id, eps, delta) {
    const dm = deltaMax(id, eps);
    return dm != null && delta <= dm * (1 + 1e-9);
  }

  // ================================================================ 無窮等比級數
  function partial(a, r, n) { return r === 1 ? a * n : a * (1 - Math.pow(r, n)) / (1 - r); }
  function sumInf(a, r) { if (a === 0) return 0; return Math.abs(r) < 1 ? a / (1 - r) : null; }
  /** S_n 和 S∞ 的差在 tol 以內需要幾項（|r| < 1） */
  function termsFor(a, r, tol) {
    const S = sumInf(a, r);
    if (S == null) return null;
    for (let n = 1; n < 1e5; n++) if (Math.abs(S - partial(a, r, n)) < tol) return n;
    return null;
  }

  // ================================================================ 挑戰：找 N
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
  const EPS_CHOICES = [0.2, 0.1, 0.05, 0.04, 0.02, 0.01];
  /** 出題：數列（四種）＋ ε，答案 Nmin 在 4 到 80 之間 */
  function genChallenge(rand, prev) {
    for (let t = 0; t < 500; t++) {
      const k = Math.floor(rand() * 4);
      let sp;
      if (k === 0) sp = { kind: 'recip', c: 1 + Math.floor(rand() * 5) };
      else if (k === 1) { const rs = [-0.9, -0.8, -0.7, -0.6, -0.5, 0.5, 0.6, 0.7, 0.8, 0.9]; sp = { kind: 'geo', r: rs[Math.floor(rand() * rs.length)] }; }
      else if (k === 2) sp = { kind: 'alt', c: 1 + Math.floor(rand() * 3) };
      else {
        const p = 1 + Math.floor(rand() * 3), q = Math.floor(rand() * 7) - 3, s = 1 + Math.floor(rand() * 4);
        if (q === p * s) continue;
        sp = { kind: 'rat', p: p, q: q, s: s };
      }
      const eps = EPS_CHOICES[Math.floor(rand() * EPS_CHOICES.length)];
      const N = Nmin(sp, eps);
      if (N == null || N < 4 || N > 80) continue;
      if (prev && seqKey(prev.spec) === seqKey(sp) && prev.eps === eps) continue;
      return { spec: sp, eps: eps, N: N };
    }
    return null;
  }
  function seqKey(sp) { return [sp.kind, sp.c, sp.p, sp.q, sp.s, sp.r].join('|'); }

  // ================================================================ 文字（KaTeX）
  function num(v) { const s = String(Math.round(v * 1e6) / 1e6); return s; }
  function seqTex(sp) {
    switch (sp.kind) {
      case 'recip': return '\\frac{' + sp.c + '}{n}';
      case 'rat': return '\\frac{' + (sp.p === 1 ? '' : sp.p) + 'n' + (sp.q ? (sp.q > 0 ? '+' : '-') + Math.abs(sp.q) : '') + '}{n+' + sp.s + '}';
      case 'alt': return '\\frac{' + (sp.c === 1 ? '' : sp.c) + '(-1)^{n}}{n}';
      case 'sinn': return '\\frac{\\sin n}{n}';
      case 'geo': return (sp.r < 0 ? '(' + num(sp.r) + ')' : num(sp.r)) + '^{n}';
      case 'e': return '\\left(1+\\frac{1}{n}\\right)^{n}';
      case 'root': return '\\sqrt{n^2+n}-n';
      case 'osc': return '(-1)^{n}';
    }
    return '';
  }
  const FUNC_TEX = {
    hole: '\\frac{x^2-1}{x-1}', sinc: '\\frac{\\sin x}{x}', xsin: 'x\\sin\\frac{1}{x}', sign: '\\frac{|x|}{x}', inv2: '\\frac{1}{x^2}', epow: '(1+x)^{1/x}'
  };

  const api = {
    SEQS: SEQS, term: term, limit: limit, err: err, bound: bound, Nmin: Nmin, firstOut: firstOut, firstOutAround: firstOutAround,
    FUNCS: FUNCS, deltaMax: deltaMax, deltaOK: deltaOK,
    partial: partial, sumInf: sumInf, termsFor: termsFor,
    rng: rng, genChallenge: genChallenge, seqKey: seqKey, seqTex: seqTex, FUNC_TEX: FUNC_TEX, EPS_CHOICES: EPS_CHOICES
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LimitsCore = api;
})(this);
