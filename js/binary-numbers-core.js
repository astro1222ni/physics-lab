/* binary-numbers-core.js — 「二進位與進位制」的計算核心（與畫面分離，Node 單元測試：tests/binary-numbers-core.test.js）
 *
 * 位值記數法：b 進位的數字 d(k−1) … d1 d0 代表 Σ d(i)·b^i（0 ≤ d(i) < b）。
 * n 個位元（無號整數）可以表示 0 到 2^n − 1，共 2^n 種組合；超出範圍時只留下最低的 n 個位元（溢位）。
 * +1：從最低位開始，1 變 0 並進位，直到遇到第一個 0 變 1——改變的燈數 = 尾端連續的 1 的個數 + 1。
 * 十進位轉二進位：連續除以 2，餘數由下往上讀。
 * 只用「+1」「×2」從 0 做出 v 的最少步數 = 位元長度 + 1 的個數 − 1（由最高位往下讀：遇到 1 就 +1，每往下一位就 ×2）。
 * 所有數字都在 0 到 2^16 − 1 之內，用一般的 Number 整數運算（不會有浮點誤差）。
 */
(function (root) {
  'use strict';
  const MAX_BITS = 16;
  const DIGITS = '0123456789ABCDEF';

  /** n 個位元能表示的最大值 2^n − 1 */
  function maxOf(n) { return Math.pow(2, n) - 1; }
  /** 只留最低的 n 個位元 */
  function wrap(v, n) { const m = Math.pow(2, n); return ((v % m) + m) % m; }

  /** 非負整數 v 寫成 b 進位（2 ≤ b ≤ 16，大寫 A–F） */
  function toBase(v, b) {
    if (!(b >= 2 && b <= 16) || !(v >= 0) || v !== Math.floor(v)) return '';
    if (v === 0) return '0';
    let s = '';
    while (v > 0) { s = DIGITS[v % b] + s; v = Math.floor(v / b); }
    return s;
  }
  /** b 進位字串轉成數字；可有空白與底線分隔、前綴 0b／0o／0x（要和 b 相符）；不合法回傳 NaN */
  function fromBase(str, b) {
    let s = String(str == null ? '' : str).trim().toUpperCase().replace(/[\s_]/g, '');
    if (b === 2 && /^0B/.test(s)) s = s.slice(2);
    else if (b === 8 && /^0O/.test(s)) s = s.slice(2);
    else if (b === 16 && /^0X/.test(s)) s = s.slice(2);
    if (!s || s.length > 20) return NaN;
    let v = 0;
    for (let i = 0; i < s.length; i++) {
      const d = DIGITS.indexOf(s[i]);
      if (d < 0 || d >= b) return NaN;
      v = v * b + d;
    }
    return v;
  }
  /** 數字 v 在 b 進位的各位數（最低位在前）與位值 */
  function digitsOf(v, b) {
    const s = toBase(v, b), out = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.length - 1 - i;
      out.push({ k: k, d: DIGITS.indexOf(s[i]), place: Math.pow(b, k) });
    }
    return out.reverse();
  }
  /** 位元長度：表示 v 至少要幾個位元（v = 0 時算 1） */
  function bitLength(v) { return v <= 0 ? 1 : toBase(v, 2).length; }
  /** 1 的個數（亮著的燈數） */
  function popcount(v) { let c = 0; while (v > 0) { c += v % 2; v = Math.floor(v / 2); } return c; }
  /** 第 i 個位元（0 = 最低位） */
  function bit(v, i) { return Math.floor(v / Math.pow(2, i)) % 2; }
  /** n 個位元，最低位在前 */
  function bitsOf(v, n) { const a = []; for (let i = 0; i < n; i++) a.push(bit(v, i)); return a; }
  /** 兩個數在 n 個位元內有哪些位元不同（最低位在前的索引） */
  function changedBits(a, b, n) { const out = []; for (let i = 0; i < n; i++) if (bit(a, i) !== bit(b, i)) out.push(i); return out; }
  function toggle(v, i, n) { return wrap(bit(v, i) ? v - Math.pow(2, i) : v + Math.pow(2, i), n); }

  /** +1：回傳新值、是否溢位、改變的位元（由低到高，就是進位傳遞的順序） */
  function inc(v, n) {
    const raw = v + 1, nv = wrap(raw, n);
    return { v: nv, overflow: raw > maxOf(n), flipped: changedBits(v, nv, n) };
  }
  /** −1：0 再減一會借位繞回 2^n − 1（也算溢位） */
  function dec(v, n) {
    const raw = v - 1, nv = wrap(raw, n);
    return { v: nv, overflow: raw < 0, flipped: changedBits(v, nv, n) };
  }
  /** ×2（左移一位）：最高位被推出去時溢位 */
  function shl(v, n) {
    const raw = v * 2, nv = wrap(raw, n);
    return { v: nv, overflow: raw > maxOf(n), lost: bit(v, n - 1), flipped: changedBits(v, nv, n) };
  }
  /** ÷2（右移一位，取整數商）：最低位被推出去，就是除以 2 的餘數 */
  function shr(v, n) {
    const nv = Math.floor(v / 2);
    return { v: nv, overflow: false, lost: v % 2, flipped: changedBits(v, nv, n) };
  }

  /** 十進位轉二進位的除法階梯：[{ q（被除數）, quo（商）, r（餘數） }]，v = 0 時一列 */
  function ladder(v) {
    const rows = [];
    if (v === 0) return [{ q: 0, quo: 0, r: 0 }];
    while (v > 0) { rows.push({ q: v, quo: Math.floor(v / 2), r: v % 2 }); v = Math.floor(v / 2); }
    return rows;
  }
  /** 只用 +1 與 ×2 從 0 做出 v 的最少步數 */
  function minBuildSteps(v) { return v <= 0 ? 0 : bitLength(v) + popcount(v) - 1; }

  /** 字串是否左右對稱 */
  function isPalindrome(s) { s = String(s); for (let i = 0, j = s.length - 1; i < j; i++, j--) if (s[i] !== s[j]) return false; return true; }
  function isPrime(v) {
    if (v < 2 || v !== Math.floor(v)) return false;
    if (v % 2 === 0) return v === 2;
    for (let d = 3; d * d <= v; d += 2) if (v % d === 0) return false;
    return true;
  }
  /** 完全數：所有小於自己的正因數加起來等於自己 */
  function isPerfect(v) {
    if (v < 2) return false;
    let s = 1;
    for (let d = 2; d * d <= v; d++) if (v % d === 0) { s += d; if (d * d !== v) s += v / d; }
    return s === v;
  }
  /** 梅森質數：2^p − 1 形式的質數（二進位全是 1，而且是質數） */
  function isMersennePrime(v) { return v > 1 && /^1+$/.test(toBase(v, 2)) && isPrime(v); }
  /** b 進位寫出來全是 1、至少 k 位（重複單位數） */
  function isRepunit(v, b, k) { const s = toBase(v, b); return s.length >= (k || 1) && /^1+$/.test(s); }
  /** n 個位元一亮一暗交錯（記憶體測試常用的棋盤圖樣，例如 0101… 或 1010…） */
  function isAlternating(v, n) {
    if (n < 2) return false;
    for (let i = 1; i < n; i++) if (bit(v, i) === bit(v, i - 1)) return false;
    return true;
  }
  /** 二進位分組（每 k 位一組，從右邊分），回傳字串陣列（左到右） */
  function groups(v, n, k) {
    const s = toBase(v, 2).padStart(n, '0'), out = [];
    for (let end = s.length; end > 0; end -= k) out.unshift(s.slice(Math.max(0, end - k), end));
    return out;
  }

  /** 有種子的亂數產生器（mulberry32），回傳 [0, 1) */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** 轉換挑戰的一題：kind 'set'（照題目的數設燈）或 'read'（看燈寫十進位）；base 10、16、8；值在 1 到 2^n − 1，避開上一題 */
  function question(rand, n, prev) {
    const m = maxOf(n);
    let v = 0;
    for (let t = 0; t < 20 && (v === 0 || v === prev); t++) v = 1 + Math.floor(rand() * m);
    if (v === 0) v = 1;
    const r = rand();
    if (r < 0.45) return { kind: 'set', base: 10, v: v };
    if (r < 0.75) return { kind: 'set', base: n >= 4 ? 16 : 10, v: v };
    if (r < 0.85) return { kind: 'set', base: n >= 3 ? 8 : 10, v: v };
    return { kind: 'read', base: 10, v: v };
  }

  const api = {
    MAX_BITS: MAX_BITS, DIGITS: DIGITS,
    maxOf: maxOf, wrap: wrap, toBase: toBase, fromBase: fromBase, digitsOf: digitsOf,
    bitLength: bitLength, popcount: popcount, bit: bit, bitsOf: bitsOf, changedBits: changedBits, toggle: toggle,
    inc: inc, dec: dec, shl: shl, shr: shr, ladder: ladder, minBuildSteps: minBuildSteps,
    isPalindrome: isPalindrome, isPrime: isPrime, isPerfect: isPerfect, isMersennePrime: isMersennePrime,
    isRepunit: isRepunit, isAlternating: isAlternating, groups: groups, rng: rng, question: question
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BinaryCore = api;
})(typeof window !== 'undefined' ? window : this);
