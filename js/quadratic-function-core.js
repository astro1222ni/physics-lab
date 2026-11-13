/* quadratic-function-core.js — 「二次函數：頂點、判別式與配方」的數學核心（純函式，瀏覽器與 Node 共用）
 *
 * 二次函數 f(x) = a x² + b x + c（a ≠ 0）＝ a (x − h)² + k，h = −b/(2a)、k = c − b²/(4a)。
 * 判別式 D = b² − 4ac：D > 0 兩個實根、D = 0 一個（二重根，頂點在 x 軸上）、D < 0 沒有實根。
 * 拋物線與直線 y = m x + n 聯立：a x² + (b − m) x + (c − n) = 0，它的判別式決定交點個數，等於 0 就是切線。
 * 配方的幾何：x² + p x = q（p, q ≥ 0）。x² 的正方形加上 p × x 的長方形，把長方形切成兩半搬到兩邊，
 *   角落缺一塊 (p/2)²，補上就成為邊長 x + p/2 的正方形，所以 (x + p/2)² = q + (p/2)²。 */
(function (root) {
  'use strict';
  const EPS = 1e-9;
  const r6 = function (v) { const w = Math.round(v * 1e6) / 1e6; return w === 0 ? 0 : w; };

  /** 頂點 (h, k) */
  function vertex(a, b, c) { return { h: -b / (2 * a), k: c - b * b / (4 * a) }; }
  /** 由頂點式 a (x − h)² + k 求一般式的 b、c */
  function fromVertex(a, h, k) { return { b: -2 * a * h, c: a * h * h + k }; }
  function disc(a, b, c) { return b * b - 4 * a * c; }
  function evalQ(a, b, c, x) { return (a * x + b) * x + c; }
  /** D 很接近 0 時當成 0（滑桿的值都是有限小數，浮點誤差在 1e-9 以下） */
  function sgnD(D) { return Math.abs(D) < EPS ? 0 : D > 0 ? 1 : -1; }

  /** 實根（由小到大）：D = 0 時回傳一個（二重根）；用避免相減失準的公式 */
  function roots(a, b, c) {
    const D = disc(a, b, c), s = sgnD(D);
    if (s < 0) return [];
    if (s === 0) return [-b / (2 * a)];
    const sq = Math.sqrt(D);
    const q = -0.5 * (b + (b >= 0 ? sq : -sq));
    let r1 = q / a, r2 = q !== 0 ? c / q : -r1;
    if (q === 0) { r1 = Math.sqrt(-c / a); r2 = -r1; }
    return r1 < r2 ? [r1, r2] : [r2, r1];
  }

  /** 在閉區間 [p, q] 上的最大值與最小值（候選點：兩端與在區間裡的頂點） */
  function rangeOn(a, b, c, p, q) {
    const lo = Math.min(p, q), hi = Math.max(p, q);
    const xs = [lo, hi];
    const h = -b / (2 * a);
    if (h > lo && h < hi) xs.push(h);
    let max = -Infinity, min = Infinity, maxAt = [], minAt = [];
    xs.forEach(function (x) {
      const y = evalQ(a, b, c, x);
      if (y > max + EPS) { max = y; maxAt = [x]; } else if (Math.abs(y - max) <= EPS && maxAt.indexOf(x) < 0) maxAt.push(x);
      if (y < min - EPS) { min = y; minAt = [x]; } else if (Math.abs(y - min) <= EPS && minAt.indexOf(x) < 0) minAt.push(x);
    });
    return { lo: lo, hi: hi, max: max, min: min, maxAt: maxAt, minAt: minAt, vertexIn: h >= lo - EPS && h <= hi + EPS };
  }

  /** 拋物線與直線 y = m x + n 的交點 */
  function intersect(a, b, c, m, n) {
    const B = b - m, C = c - n, D = disc(a, B, C);
    const xs = roots(a, B, C);
    return { A: a, B: B, C: C, D: D, xs: xs, pts: xs.map(function (x) { return [x, m * x + n]; }) };
  }

  /** 配方的幾何量：x² + p x = q 的正根 */
  function completeSquare(p, q) {
    const half = p / 2, corner = half * half, S2 = q + corner;
    const S = Math.sqrt(Math.max(0, S2));
    return { half: half, corner: corner, S2: S2, S: S, root: S - half, other: -S - half };
  }
  /** 目前 x 時各塊的面積 */
  function pieces(x, p) { return { sq: x * x, rect: p * x, halfRect: p * x / 2, corner: p * p / 4, total: x * x + p * x, big: (x + p / 2) * (x + p / 2) }; }

  // ---------- 文字（KaTeX） ----------
  function num(v) {
    let s = (Math.round(v * 1e6) / 1e6).toFixed(6).replace(/\.?0+$/, '');
    if (s === '-0') s = '0';
    return s;
  }
  /** a x² + b x + c 的 TeX（係數 1、−1 省略，0 項不寫） */
  function quadTex(a, b, c, v) {
    v = v || 'x';
    const terms = [];
    const co = function (k, pow) {
      if (Math.abs(k) < 1e-12) return;
      const neg = k < 0, ak = Math.abs(k);
      const body = pow === 0 ? num(ak) : (Math.abs(ak - 1) < 1e-12 ? '' : num(ak)) + (pow === 2 ? v + '^2' : v);
      terms.push({ neg: neg, body: body });
    };
    co(a, 2); co(b, 1); co(c, 0);
    if (!terms.length) return '0';
    return terms.map(function (t, i) { return i === 0 ? (t.neg ? '-' : '') + t.body : (t.neg ? ' - ' : ' + ') + t.body; }).join('');
  }
  /** a (x − h)² + k 的 TeX */
  function vertexTex(a, h, k) {
    const aa = Math.abs(Math.abs(a) - 1) < 1e-12 ? (a < 0 ? '-' : '') : num(a);
    const inner = Math.abs(h) < 1e-12 ? 'x^2' : '(x ' + (h > 0 ? '- ' + num(h) : '+ ' + num(-h)) + ')^2';
    const tail = Math.abs(k) < 1e-12 ? '' : k > 0 ? ' + ' + num(k) : ' - ' + num(-k);
    return aa + inner + tail;
  }

  // ---------- 挑戰：看圖寫二次函數 ----------
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const A_CHOICES = [-2, -1, -0.5, 0.5, 1, 2];
  /** 頂點 (h, k) 是整數點，a 從 A_CHOICES 選，另給一個整數點；b、c 都在滑桿範圍 ±20 內 */
  function genChallenge(R, last) {
    for (let t = 0; t < 500; t++) {
      const a = A_CHOICES[Math.floor(R() * A_CHOICES.length)];
      const h = Math.floor(R() * 9) - 4, k = Math.floor(R() * 11) - 5;
      const bc = fromVertex(a, h, k), b = r6(bc.b), c = r6(bc.c);
      if (Math.abs(b) > 20 || Math.abs(c) > 20) continue;
      const s = (Math.abs(a) === 0.5 ? 2 : 1) * (R() < 0.5 ? -1 : 1);
      const px = h + s, py = k + a * s * s;
      if (Math.abs(px) > 6 || Math.abs(py) > 7.5) continue;
      if (last && last.a === a && last.h === h && last.k === k) continue;
      if (a === 1 && h === 1 && k === -4) continue; // 預設的函數
      return { a: a, b: b, c: c, h: h, k: k, pt: [px, py] };
    }
    return null;
  }

  const api = {
    EPS: EPS, r6: r6, vertex: vertex, fromVertex: fromVertex, disc: disc, evalQ: evalQ, sgnD: sgnD, roots: roots,
    rangeOn: rangeOn, intersect: intersect, completeSquare: completeSquare, pieces: pieces,
    num: num, quadTex: quadTex, vertexTex: vertexTex, rng: rng, A_CHOICES: A_CHOICES, genChallenge: genChallenge
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QuadCore = api;
})(typeof window !== 'undefined' ? window : this);
