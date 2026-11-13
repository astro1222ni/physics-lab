/* complex-plane-core.js — 「複數平面：乘法是旋轉與伸縮」的數學核心（純函式，瀏覽器與 Node 共用）
 *
 * 複數 z = a + bi 對應平面上的點 (a, b)；極式 z = r(cos θ + i sin θ)，r = |z|、θ = arg z。
 * 加法是平移（平行四邊形法則）；乘法 z·w 把 w 轉 arg z、再伸縮 |z| 倍：|zw| = |z||w|、arg(zw) = arg z + arg w。
 * 所以三角形 (0, 1, z) 和 (0, w, zw) 相似。
 * 棣美弗定理：z^n = r^n (cos nθ + i sin nθ)；z^n = c 的 n 個根平均分布在半徑 |c|^(1/n) 的圓上，圍成正 n 邊形。 */
(function (root) {
  'use strict';
  const D2R = Math.PI / 180;

  function C(re, im) { return { re: re, im: im || 0 }; }
  function add(z, w) { return C(z.re + w.re, z.im + w.im); }
  function sub(z, w) { return C(z.re - w.re, z.im - w.im); }
  function mul(z, w) { return C(z.re * w.re - z.im * w.im, z.re * w.im + z.im * w.re); }
  function conj(z) { return C(z.re, -z.im); }
  function abs(z) { return Math.hypot(z.re, z.im); }
  function div(z, w) {
    const d = w.re * w.re + w.im * w.im;
    if (d === 0) return C(NaN, NaN);
    return C((z.re * w.re + z.im * w.im) / d, (z.im * w.re - z.re * w.im) / d);
  }
  /** 主幅角（度），範圍 (−180, 180]；z = 0 時傳回 NaN */
  function argDeg(z) {
    if (z.re === 0 && z.im === 0) return NaN;
    let t = Math.atan2(z.im, z.re) / D2R;
    if (t <= -180) t += 360;
    return t;
  }
  /** 幅角換到 [0, 360) */
  function arg360(z) { const t = argDeg(z); return isNaN(t) ? NaN : (t < 0 ? t + 360 : t); }
  function polar(r, deg) { return C(r * Math.cos(deg * D2R), r * Math.sin(deg * D2R)); }
  /** 整數次方：用連乘（和學生一步一步乘的結果一致），n 可以是 0 或負整數 */
  function powInt(z, n) {
    let out = C(1, 0);
    const k = Math.abs(n);
    for (let i = 0; i < k; i++) out = mul(out, z);
    return n < 0 ? div(C(1, 0), out) : out;
  }
  /** z, z², …, z^n 的列表（第 0 項是 1） */
  function powers(z, n) {
    const list = [C(1, 0)];
    for (let i = 1; i <= n; i++) list.push(mul(list[i - 1], z));
    return list;
  }
  /** z^n = c 的 n 個根，第 k 個是 |c|^(1/n) cis((arg c + 360k)/n)，k = 0, …, n − 1 */
  function roots(c, n) {
    const r = Math.pow(abs(c), 1 / n), t0 = abs(c) === 0 ? 0 : argDeg(c);
    const out = [];
    for (let k = 0; k < n; k++) out.push(polar(r, (t0 + 360 * k) / n));
    return out;
  }
  /** 乘以 z 的過程：在時間 t ∈ [0, 1] 時，先轉 t·arg z、伸縮 |z|^t 倍（對數螺線的插值） */
  function partial(z, t) {
    const r = abs(z);
    if (r === 0) return C(1 - t, 0);
    return polar(Math.pow(r, t), t * argDeg(z));
  }
  /** 兩個複數是否夠近 */
  function near(z, w, tol) { return Math.hypot(z.re - w.re, z.im - w.im) <= (tol === undefined ? 1e-9 : tol); }
  /** 是否高斯整數（實部、虛部都是整數） */
  function isGauss(z, tol) {
    const t = tol === undefined ? 1e-9 : tol;
    return Math.abs(z.re - Math.round(z.re)) <= t && Math.abs(z.im - Math.round(z.im)) <= t;
  }
  /** 三角形 (0, 1, z) 和 (0, w, zw) 的三邊比（應該都等於 |w|） */
  function similarRatios(z, w) {
    const zw = mul(z, w);
    return [abs(w) / 1, abs(zw) / abs(z), abs(sub(zw, w)) / abs(sub(z, C(1, 0)))];
  }
  /** 把數字寫成 a + bi 的字串（數學記號用「−」） */
  function fmtNum(v, d) {
    const k = Math.pow(10, d === undefined ? 3 : d);
    let s = String(Math.round(v * k) / k);
    if (s === '-0') s = '0';
    return s.replace('-', '−');
  }
  function fmt(z, d) {
    const a = Math.round(z.re * Math.pow(10, d === undefined ? 3 : d)) / Math.pow(10, d === undefined ? 3 : d);
    const b = Math.round(z.im * Math.pow(10, d === undefined ? 3 : d)) / Math.pow(10, d === undefined ? 3 : d);
    if (b === 0) return fmtNum(a, d);
    const bi = Math.abs(b) === 1 ? 'i' : fmtNum(Math.abs(b), d) + 'i';
    if (a === 0) return (b < 0 ? '−' : '') + bi;
    return fmtNum(a, d) + (b < 0 ? ' − ' : ' + ') + bi;
  }

  /** 挑戰「找出 z」：一個隱藏的 z 讓方格紙轉動、伸縮；z 用極式出題（r、θ 都是好看的值），答案寫成 a + bi 時取到 3 位 */
  function challenge(rand) {
    const R = [0.5, 1, 1.5, 2, 2.5, 3];
    const T = [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];
    for (let t = 0; t < 100; t++) {
      const r = R[Math.floor(rand() * R.length)], th = T[Math.floor(rand() * T.length)];
      if (r === 1 && (th === 180)) continue;
      return { r: r, deg: th, z: polar(r, th) };
    }
    return { r: 2, deg: 90, z: C(0, 2) };
  }
  /** 回答 w 和答案 z 是否一致：|w − z| ≤ 0.02·max(1, |z|) */
  function answerOK(w, z) { return abs(sub(w, z)) <= 0.02 * Math.max(1, abs(z)); }

  const CxCore = { C: C, add: add, sub: sub, mul: mul, div: div, conj: conj, abs: abs, argDeg: argDeg, arg360: arg360, polar: polar,
    powInt: powInt, powers: powers, roots: roots, partial: partial, near: near, isGauss: isGauss, similarRatios: similarRatios,
    fmt: fmt, fmtNum: fmtNum, challenge: challenge, answerOK: answerOK, D2R: D2R };
  if (typeof module !== 'undefined' && module.exports) module.exports = CxCore;
  else root.CxCore = CxCore;
})(typeof window !== 'undefined' ? window : this);
