/* twos-complement-core.js — 「負數與二補數」的計算核心（與畫面分離，Node 單元測試：tests/twos-complement-core.test.js）
 *
 * 一排 n 個位元是一個「位元圖樣」u（0 ≤ u < 2^n，就是把它當成無號數讀出來的值）。同一個圖樣可以用不同的規則讀成有號數：
 *   二補數 twos：最高位的權重是 −2^(n−1)，其他位照常 → 範圍 −2^(n−1) … 2^(n−1) − 1，只有一個 0。
 *   一補數 ones：負數 = 把正數的每一位取反 → 範圍 −(2^(n−1) − 1) … 2^(n−1) − 1，有 +0（000…0）與 −0（111…1）。
 *   原碼 sign（符號＋大小）：最高位是符號、其餘是大小 → 範圍同一補數，有 +0 與 −0（100…0）。
 *   偏移碼 bias（excess-2^(n−1)）：值 = u − 2^(n−1) → 範圍同二補數，只有一個 0（100…0）。
 * 加法器：逐位相加，c(0) = 進位輸入，c(i+1) = 第 i 位送出的進位。
 *   C 旗標 = c(n)（最高位送出的進位）。減法 A − B 用同一個加法器算 A + B̄ + 1，C 仍是這個加法的進位輸出，
 *     所以減法時 C = 1 表示「沒有借位」（A ≥ B，當成無號數）——ARM、PowerPC、6502 的慣例；x86 的 CF 反過來，記的是借位。
 *   V 旗標 = c(n) ⊕ c(n−1)，等價於「兩個同號的數相加，結果變號」，也等價於「真正的有號結果超出範圍」。
 *   N = 結果的最高位，Z = 結果是不是全 0。
 * n 最多 32 位元：所有數都在 ±2^32 之內，用一般的 Number 整數運算（完全精確，不用 JavaScript 的 32 位元位元運算子）。
 */
(function (root) {
  'use strict';
  const MIN_BITS = 4, MAX_BITS = 32;
  const REPS = ['twos', 'ones', 'sign', 'bias'];

  function pow2(n) { return Math.pow(2, n); }
  /** 只留最低的 n 個位元（v mod 2^n，結果在 0 … 2^n − 1） */
  function wrap(v, n) { const m = pow2(n); return ((v % m) + m) % m; }
  /** 第 i 個位元（0 = 最低位） */
  function bit(u, i) { return Math.floor(u / pow2(i)) % 2; }
  /** n 個位元，最低位在前 */
  function bitsOf(u, n) { const a = []; for (let i = 0; i < n; i++) a.push(bit(u, i)); return a; }
  /** 每一位取反（NOT）：2^n − 1 − u */
  function not(u, n) { return pow2(n) - 1 - u; }
  function toggle(u, i, n) { return wrap(bit(u, i) ? u - pow2(i) : u + pow2(i), n); }
  /** 兩個圖樣有哪些位元不同（最低位在前的索引） */
  function changedBits(a, b, n) { const out = []; for (let i = 0; i < n; i++) if (bit(a, i) !== bit(b, i)) out.push(i); return out; }
  function popcount(u) { let c = 0; while (u > 0) { c += u % 2; u = Math.floor(u / 2); } return c; }

  // ---------------- 讀值與編碼 ----------------
  /** 圖樣 u 用表示法 rep 讀出的值（負零回傳 0；用 isNegZero 分辨） */
  function value(u, n, rep) {
    const h = pow2(n - 1), m = pow2(n);
    switch (rep) {
      case 'unsigned': return u;
      case 'ones': return u >= h ? (u === m - 1 ? 0 : u - (m - 1)) : u;
      case 'sign': return u >= h ? (u === h ? 0 : -(u - h)) : u;
      case 'bias': return u - h;
      default: return u >= h ? u - m : u;   // 二補數
    }
  }
  /** 這個圖樣是不是「負零」（只有一補數 111…1 與原碼 100…0） */
  function isNegZero(u, n, rep) { return (rep === 'ones' && u === pow2(n) - 1) || (rep === 'sign' && u === pow2(n - 1)); }
  /** 表示法 rep、n 位元的範圍：{ min, max, zeros（0 有幾種寫法）, values（能表示幾個不同的數） } */
  function range(n, rep) {
    const h = pow2(n - 1), m = pow2(n);
    if (rep === 'unsigned') return { min: 0, max: m - 1, zeros: 1, values: m };
    if (rep === 'ones' || rep === 'sign') return { min: -(h - 1), max: h - 1, zeros: 2, values: m - 1 };
    return { min: -h, max: h - 1, zeros: 1, values: m };   // 二補數、偏移碼
  }
  function inRange(v, n, rep) { const r = range(n, rep); return v >= r.min && v <= r.max && v === Math.floor(v); }
  /** 值 v 用表示法 rep 寫成 n 位元的圖樣；超出範圍回傳 null。negZero = true 時寫成負零（只有一補數、原碼有） */
  function encode(v, n, rep, negZero) {
    if (!inRange(v, n, rep)) return null;
    const h = pow2(n - 1), m = pow2(n);
    if (v === 0 && negZero) { if (rep === 'ones') return m - 1; if (rep === 'sign') return h; }
    switch (rep) {
      case 'unsigned': return v;
      case 'ones': return v >= 0 ? v : m - 1 + v;
      case 'sign': return v >= 0 ? v : h - v;
      case 'bias': return v + h;
      default: return wrap(v, n);
    }
  }
  /** 二補數的權重：第 i 位是 2^i，最高位是 −2^(n−1) */
  function weight(i, n) { return i === n - 1 ? -pow2(n - 1) : pow2(i); }

  // ---------------- 加法器與旗標 ----------------
  /** 逐位相加 a + b + cin：回傳結果 r、每一位的進位 carries（c(0) = cin … c(n)）與旗標 C、V、N、Z */
  function adder(a, b, n, cin) {
    const carries = [cin ? 1 : 0];
    let r = 0;
    for (let i = 0; i < n; i++) {
      const s = bit(a, i) + bit(b, i) + carries[i];
      if (s % 2) r += pow2(i);
      carries.push(s >= 2 ? 1 : 0);
    }
    const C = carries[n], V = carries[n] ^ carries[n - 1];
    return { r: r, carries: carries, C: C, V: V, N: bit(r, n - 1), Z: r === 0 ? 1 : 0 };
  }
  /** A + B：bIn 是實際送進加法器的第二個數 */
  function add(a, b, n) { const x = adder(a, b, n, 0); x.op = 'add'; x.a = a; x.b = b; x.bIn = b; x.cin = 0; return x; }
  /** A − B = A + B̄ + 1（B 取反、進位輸入 1）；C = 1 表示沒有借位，borrow = 1 − C */
  function sub(a, b, n) { const nb = not(b, n); const x = adder(a, nb, n, 1); x.op = 'sub'; x.a = a; x.b = b; x.bIn = nb; x.cin = 1; x.borrow = 1 - x.C; return x; }
  function arith(a, b, n, op) { return op === 'sub' ? sub(a, b, n) : add(a, b, n); }
  /** V 的「同號規則」：加法時 A、B 同號而結果異號；減法時 A、B 異號而結果和 A 異號 */
  function vBySigns(a, b, r, n, op) {
    const sa = bit(a, n - 1), sb = bit(b, n - 1), sr = bit(r, n - 1);
    return (op === 'sub' ? (sa !== sb && sr !== sa) : (sa === sb && sr !== sa)) ? 1 : 0;
  }
  /** 真正的有號結果（二補數讀法）是否超出範圍 */
  function vByRange(a, b, n, op) {
    const x = value(a, n, 'twos'), y = value(b, n, 'twos'), t = op === 'sub' ? x - y : x + y;
    return inRange(t, n, 'twos') ? 0 : 1;
  }
  /** 無號的觀點：加法 C = 1 ⇔ A + B ≥ 2^n；減法 C = 1 ⇔ A ≥ B（沒有借位） */
  function cByRange(a, b, n, op) { return (op === 'sub' ? a >= b : a + b >= pow2(n)) ? 1 : 0; }

  // ---------------- 取負 ----------------
  /**
   * 依表示法取負：二補數 = 取反再加一；一補數 = 取反；原碼 = 翻轉符號位；偏移碼 = 2^n − u。
   * 回傳 { u（新圖樣）, inv（取反後的圖樣，二補數與一補數才有）, carries（二補數「加一」的進位）, same（取負後圖樣不變）, overflow（−最小值放不下） }
   */
  function negate(u, n, rep) {
    const h = pow2(n - 1), m = pow2(n);
    if (rep === 'ones') { const v = not(u, n); return { u: v, inv: v, carries: null, same: v === u, overflow: false }; }
    if (rep === 'sign') { const v = u >= h ? u - h : u + h; return { u: v, inv: null, carries: null, same: false, overflow: false }; }
    if (rep === 'bias') { const v = wrap(m - u, n); return { u: v, inv: null, carries: null, same: v === u, overflow: u === 0 }; }
    const inv = not(u, n), x = adder(inv, 0, n, 1);
    return { u: x.r, inv: inv, carries: x.carries, same: x.r === u, overflow: u === h };
  }

  // ---------------- 位元數改變 ----------------
  /** 符號延伸：n 位元延伸到 m 位元，新的高位都複製符號位（二補數的值不變） */
  function signExtend(u, n, m) { return bit(u, n - 1) ? u + (pow2(m) - pow2(n)) : u; }
  /** 補零延伸：新的高位都補 0（無號數的值不變） */
  function zeroExtend(u) { return u; }
  /** 截斷：只留最低的 m 個位元 */
  function truncate(u, m) { return wrap(u, m); }
  /**
   * 位元數從 n 改成 m：值在新範圍裝得下就保留值（二補數變寬就是符號延伸、變窄就是截斷高位），
   * 裝不下就截斷（只留最低的 m 個位元，值會改變）。回傳 { u, kept（值不變）, how：'same'|'extend'|'narrow'|'truncate' }
   */
  function resize(u, n, m, rep) {
    if (m === n) return { u: u, kept: true, how: 'same' };
    const v = value(u, n, rep), nz = isNegZero(u, n, rep);
    const e = encode(v, m, rep, nz);
    if (e !== null) return { u: e, kept: true, how: m > n ? 'extend' : 'narrow' };
    return { u: truncate(u, m), kept: false, how: 'truncate' };
  }

  // ---------------- 同一個加法器、不同的表示法 ----------------
  /**
   * 把 A、B 用表示法 rep 讀成數，交給「二補數的加法器」（只會做 mod 2^n 的二進位加法）算，再用 rep 讀回結果：
   * 二補數不必修正；一補數要做「迴繞進位」（最高位送出的進位加回最低位；減法寫成 A + B̄）；
   * 偏移碼要翻轉最高位（加減一個偏移量）；原碼沒辦法直接用（要先比符號與大小）。
   * 回傳 { x, y, truth（正確答案）, fits（正確答案在範圍內）, raw（加法器直接給的答案）, rawNegZero, ok, fixed（照該表示法的規則修正後的圖樣，原碼為 null）, fixedOk }
   */
  function viaAdder(a, b, n, rep, op) {
    const x = value(a, n, rep), y = value(b, n, rep), truth = op === 'sub' ? x - y : x + y;
    const res = arith(a, b, n, op), raw = value(res.r, n, rep);
    const h = pow2(n - 1), m = pow2(n);
    let fixed = null;
    if (rep === 'twos') fixed = res.r;
    else if (rep === 'bias') fixed = res.r >= h ? res.r - h : res.r + h;
    else if (rep === 'ones') {
      const t = a + (op === 'sub' ? not(b, n) : b);
      fixed = t >= m ? t - m + 1 : t;      // 迴繞進位
    }
    const fits = inRange(truth, n, rep);
    return {
      x: x, y: y, truth: truth, fits: fits, raw: raw, rawNegZero: isNegZero(res.r, n, rep), ok: raw === truth,
      res: res, fixed: fixed, fixedOk: fixed === null ? false : value(fixed, n, rep) === truth
    };
  }
  /** 一補數加法（含迴繞進位），網際網路校驗和（RFC 1071）用的就是 16 位元的這種加法 */
  function onesAdd(a, b, n) { const t = a + b, m = pow2(n); return t >= m ? t - m + 1 : t; }

  // ---------------- 格式 ----------------
  /** 千分位（英文逗號）與真正的減號 −（U+2212） */
  function intText(v) {
    const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return v < 0 ? '−' + s : s;
  }
  /** 有號值的文字：負零寫成 −0，正數加 + 號（plus = true 時） */
  function valText(u, n, rep, plus) {
    if (isNegZero(u, n, rep)) return '−0';
    const v = value(u, n, rep);
    return (plus && v > 0 ? '+' : '') + intText(v);
  }
  /** 二進位字串（最高位在左，每 4 位一組用空格分開） */
  function binText(u, n, group) {
    const s = u.toString(2).padStart(n, '0');
    if (!group) return s;
    const out = [];
    for (let end = s.length; end > 0; end -= 4) out.unshift(s.slice(Math.max(0, end - 4), end));
    return out.join(' ');
  }
  /** 十六進位（大寫，補滿 ⌈n/4⌉ 位） */
  function hexText(u, n) { return u.toString(16).toUpperCase().padStart(Math.ceil(n / 4), '0'); }
  /**
   * 解析輸入的文字。kind：'dec'（十進位有號值，可寫 −0）、'hex'、'bin'（直接是位元圖樣）。
   * 回傳 { ok, u, v, negZero, err：'syntax'|'range'|'wide' }
   */
  function parse(text, kind, n, rep) {
    let s = String(text == null ? '' : text).normalize('NFKC').trim().replace(/[−–—]/g, '-').replace(/[\s_,]/g, '');
    if (kind === 'dec') {
      if (!/^[+-]?\d{1,12}$/.test(s)) return { ok: false, err: 'syntax' };
      const neg = s[0] === '-';
      const v = parseInt(s, 10) || 0;
      const nz = neg && v === 0 && (rep === 'ones' || rep === 'sign');
      const u = encode(v, n, rep, nz);
      if (u === null) return { ok: false, err: 'range', v: v };
      return { ok: true, u: u, v: v, negZero: nz };
    }
    const b = kind === 'hex' ? 16 : 2;
    if (b === 16) s = s.replace(/^0x/i, ''); else s = s.replace(/^0b/i, '');
    const re = b === 16 ? /^[0-9a-f]{1,8}$/i : /^[01]{1,32}$/;
    if (!re.test(s)) return { ok: false, err: 'syntax' };
    const u = parseInt(s, b);
    if (u >= pow2(n)) return { ok: false, err: 'wide', u: u };
    return { ok: true, u: u, v: value(u, n, rep), negZero: isNegZero(u, n, rep) };
  }

  // ---------------- 旗標挑戰 ----------------
  /** 有種子的亂數產生器（mulberry32），回傳 [0, 1) */
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
  /**
   * 出一題：先隨機選要考的 (C, V) 組合與運算（四種組合機會均等），再找符合的 A、B（二補數，n 位元）。
   * B 不為 0；避開和上一題完全相同。回傳 { a, b, op, C, V }
   */
  function question(rand, n, prev) {
    const m = pow2(n);
    const op = rand() < 0.5 ? 'add' : 'sub';
    const want = Math.floor(rand() * 4), wC = want >> 1, wV = want & 1;
    for (let t = 0; t < 400; t++) {
      const a = Math.floor(rand() * m), b = 1 + Math.floor(rand() * (m - 1));
      const x = arith(a, b, n, op);
      if (x.C !== wC || x.V !== wV) continue;
      if (prev && prev.a === a && prev.b === b && prev.op === op) continue;
      return { a: a, b: b, op: op, C: x.C, V: x.V };
    }
    const a = 1, b = 1, x = arith(a, b, n, op);     // 理論上到不了這裡
    return { a: a, b: b, op: op, C: x.C, V: x.V };
  }

  const api = {
    MIN_BITS: MIN_BITS, MAX_BITS: MAX_BITS, REPS: REPS,
    pow2: pow2, wrap: wrap, bit: bit, bitsOf: bitsOf, not: not, toggle: toggle, changedBits: changedBits, popcount: popcount,
    value: value, isNegZero: isNegZero, range: range, inRange: inRange, encode: encode, weight: weight,
    adder: adder, add: add, sub: sub, arith: arith, vBySigns: vBySigns, vByRange: vByRange, cByRange: cByRange,
    negate: negate, signExtend: signExtend, zeroExtend: zeroExtend, truncate: truncate, resize: resize,
    viaAdder: viaAdder, onesAdd: onesAdd,
    intText: intText, valText: valText, binText: binText, hexText: hexText, parse: parse,
    rng: rng, question: question
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TwosCore = api;
})(typeof window !== 'undefined' ? window : this);
