/* pascal-triangle-core.js — 「巴斯卡三角形與二項式定理」的數學核心（純函式，瀏覽器與 Node 共用）
 *
 * 組合數 C(n, k) 用 BigInt 精確計算（第 63 列最大約 9.2 × 10^17，超過 Number 的精確範圍）；
 * 除以 m 的餘數用遞迴 C(n, k) = C(n − 1, k − 1) + C(n − 1, k) 直接在餘數上算。
 * 走格子：從 A = (0, 0) 每步向右或向上走到 B = (m, n)，路徑數 C(m + n, m)；有路障時用「每個點的走法數 = 左邊 + 下面」逐點加。
 * 二項式：(a x + b)^n 中 x^k 的係數 = C(n, k) a^k b^(n − k)。 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- 組合數
  const ROWS = [[1n]];
  function row(n) {
    while (ROWS.length <= n) {
      const p = ROWS[ROWS.length - 1], r = [1n];
      for (let k = 1; k < p.length; k++) r.push(p[k - 1] + p[k]);
      r.push(1n);
      ROWS.push(r);
    }
    return ROWS[n];
  }
  function C(n, k) { return k < 0 || k > n || n < 0 ? 0n : row(n)[k]; }
  /** 一般數字的組合數（n ≤ 60 以內精確到整數） */
  function Cn(n, k) { return Number(C(n, k)); }
  /** 0 到 N − 1 列除以 m 的餘數 */
  function modRows(N, m) {
    const out = [[1 % m]];
    for (let n = 1; n < N; n++) {
      const p = out[n - 1], r = [1 % m];
      for (let k = 1; k < n; k++) r.push((p[k - 1] + p[k]) % m);
      r.push(1 % m);
      out.push(r);
    }
    return out;
  }
  /** 第 n 列全是奇數 ⇔ n + 1 是 2 的次方 */
  function allOdd(n) { return n >= 0 && ((n + 1) & n) === 0; }
  /** 數值 v（BigInt）在 0 到 N − 1 列出現的位置 */
  function positionsOf(v, N) {
    const out = [];
    for (let n = 0; n < N; n++) { const r = row(n); for (let k = 0; k <= n; k++) if (r[k] === v) out.push([n, k]); }
    return out;
  }
  /** 第 s 條「淺對角線」（n + k = s）的和是費氏數 F(s + 1) */
  function shallowSum(s) { let t = 0n; for (let k = 0; 2 * k <= s; k++) t += C(s - k, k); return t; }
  /** 2 的 n 次方（BigInt） */
  function pow2(n) { return 1n << BigInt(n); }

  // ---------------------------------------------------------------- 走格子
  const key = function (i, j) { return i + ',' + j; };
  /** 每個點的走法數 W[i][j]（i = 0..m 向右、j = 0..n 向上）；blocked 是 Set('i,j') */
  function gridWays(m, n, blocked) {
    const W = [];
    for (let i = 0; i <= m; i++) {
      W.push([]);
      for (let j = 0; j <= n; j++) {
        if (blocked && blocked.has(key(i, j))) { W[i].push(0); continue; }
        if (i === 0 && j === 0) { W[i].push(1); continue; }
        W[i].push((i > 0 ? W[i - 1][j] : 0) + (j > 0 ? W[i][j - 1] : 0));
      }
    }
    return W;
  }
  function gridCount(m, n, blocked) { return gridWays(m, n, blocked)[m][n]; }
  /** 經過 (i, j) 的路徑數（沒有路障時） */
  function through(m, n, i, j) { return Cn(i + j, i) * Cn(m - i + n - j, m - i); }
  /** 路徑（點的陣列）合法：從 (0, 0) 開始、每步向右或向上一格、不踩路障 */
  function validPath(path, blocked) {
    if (!path.length || path[0][0] !== 0 || path[0][1] !== 0) return false;
    for (let t = 1; t < path.length; t++) {
      const di = path[t][0] - path[t - 1][0], dj = path[t][1] - path[t - 1][1];
      if (!((di === 1 && dj === 0) || (di === 0 && dj === 1))) return false;
      if (blocked && blocked.has(key(path[t][0], path[t][1]))) return false;
    }
    return true;
  }
  /** 隨機選一條路徑（每條路徑機率相同：每步依剩下的走法數決定方向） */
  function randomPath(m, n, blocked, rand) {
    // 從終點倒算「從這點到 B 的走法數」
    const R = [];
    for (let i = m; i >= 0; i--) {
      R[i] = [];
      for (let j = n; j >= 0; j--) {
        if (blocked && blocked.has(key(i, j))) { R[i][j] = 0; continue; }
        if (i === m && j === n) { R[i][j] = 1; continue; }
        R[i][j] = (i < m ? R[i + 1][j] : 0) + (j < n ? R[i][j + 1] : 0);
      }
    }
    if (!R[0][0]) return null;
    const path = [[0, 0]];
    let i = 0, j = 0;
    while (i < m || j < n) {
      const r = i < m ? R[i + 1][j] : 0, u = j < n ? R[i][j + 1] : 0;
      if (rand() * (r + u) < r) i++; else j++;
      path.push([i, j]);
    }
    return path;
  }

  // ---------------------------------------------------------------- 二項式
  /** (a x + b)^n 的係數，coefs[k] 是 x^k 的係數 */
  function expand(a, b, n) {
    const out = [];
    for (let k = 0; k <= n; k++) out.push(Cn(n, k) * Math.pow(a, k) * Math.pow(b, n - k));
    return out;
  }
  function evalPoly(coefs, x) { return coefs.reduce(function (s, c, k) { return s + c * Math.pow(x, k); }, 0); }

  // ---------------------------------------------------------------- 挑戰
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
  /** 出題「幾條路？」：格子 m × n（m 2–5、n 2–4），路障 0–2 個（不在起點終點，路徑數 ≥ 2），四個選項 */
  function genChallenge(rand, prev) {
    for (let t = 0; t < 400; t++) {
      const m = 2 + Math.floor(rand() * 4), n = 2 + Math.floor(rand() * 3), nb = Math.floor(rand() * 3);
      const blocks = [], set = new Set();
      for (let b = 0; b < nb; b++) {
        const i = Math.floor(rand() * (m + 1)), j = Math.floor(rand() * (n + 1));
        if ((i === 0 && j === 0) || (i === m && j === n) || set.has(key(i, j))) continue;
        set.add(key(i, j)); blocks.push([i, j]);
      }
      const count = gridCount(m, n, set), total = Cn(m + n, m);
      if (count < 2) continue;
      if (prev && prev.m === m && prev.n === n && prev.count === count) continue;
      // 干擾選項：沒有路障的總數、差一個路障的數、相鄰的數、加法錯成乘法的數
      const cand = [total, count + 1, count - 1, count + (m + n), m * n, Cn(m + n, m + 1), count * 2];
      blocks.forEach(function (b, idx) {
        const s2 = new Set(set); s2.delete(key(b[0], b[1]));
        cand.push(gridCount(m, n, s2));
        cand.push(total - through(m, n, b[0], b[1]) * (idx === 0 ? 2 : 1));
      });
      const opts = [count];
      for (let c = 0; c < cand.length && opts.length < 4; c++) {
        const v = cand[Math.floor(rand() * cand.length)];
        if (v > 0 && opts.indexOf(v) < 0) opts.push(v);
      }
      for (let d = 2; opts.length < 4; d++) { if (opts.indexOf(count + d) < 0) opts.push(count + d); }
      // 洗牌
      for (let a = opts.length - 1; a > 0; a--) { const b = Math.floor(rand() * (a + 1)); const tmp = opts[a]; opts[a] = opts[b]; opts[b] = tmp; }
      return { m: m, n: n, blocks: blocks, count: count, options: opts, answer: opts.indexOf(count) };
    }
    return null;
  }

  // ---------------------------------------------------------------- 文字
  function big(v) { return String(v); }
  /** 加千分位（數字很長時好讀） */
  function group(v) { return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  /** (a x + b)^n 展開式的 KaTeX */
  function expandTex(a, b, n) {
    const c = expand(a, b, n);
    let out = '';
    for (let k = n; k >= 0; k--) {
      const v = c[k];
      if (v === 0) continue;
      const abs = Math.abs(v), sg = v < 0 ? '-' : out ? '+' : '';
      const xs = k === 0 ? '' : k === 1 ? 'x' : 'x^{' + k + '}';
      out += sg + (abs === 1 && k > 0 ? '' : String(abs)) + xs;
    }
    return out || '0';
  }

  const api = {
    row: row, C: C, Cn: Cn, modRows: modRows, allOdd: allOdd, positionsOf: positionsOf, shallowSum: shallowSum, pow2: pow2,
    key: key, gridWays: gridWays, gridCount: gridCount, through: through, validPath: validPath, randomPath: randomPath,
    expand: expand, evalPoly: evalPoly, rng: rng, genChallenge: genChallenge, big: big, group: group, expandTex: expandTex
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PascalCore = api;
})(this);
