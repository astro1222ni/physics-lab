/*
 * thin-lens-core.js — 「薄透鏡的成像」課本實驗的物理核心（與畫面無關，可單獨在 Node 測試）
 *
 * 單位：長度一律 cm，角度 rad。
 *
 * 符號約定（臺灣高中課本「實正虛負」，與 lens-mirror-core.js 相同）：
 *   成像公式 1/p + 1/q = 1/f，放大率 m = −q/p
 *   p > 0：實物（放在光入射的一側）
 *   q > 0：實像（在透鏡另一側）；q < 0：虛像（與物體同側）
 *   f > 0：凸透鏡；f < 0：凹透鏡
 *
 * 光凳座標：公制尺讀數 x（cm），光由左（光源）向右前進。透鏡在 xL，物（光源屏）在 xO，
 *   p = xL − xO，像在 xI = xL + q（實像在透鏡右邊，虛像在左邊）。
 *
 * 透鏡模型：理想薄透鏡。以光線斜率（tan）表示：在透鏡上橫向位置 L 的光線，出射斜率 u′ = u − L/f。
 *   這個規則把每一個物點完美地成像到一個像點（共線變換），所以任何一條視線都恰好對準像點。
 *   「含誤差」時可加三階球面像差：u′ = u − L/f − sgn(f)·c·|L|²·L（透鏡邊緣的屈光力略強）。
 *
 * 眼睛：針孔眼（只看通過瞳孔中心的那一條光線），看到的方向就是光線進入眼睛的方向。
 *   透過透鏡看物點時，解出光線在透鏡上的位置 L，眼睛看到的方向即由眼睛指向 L。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ThinLensCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 器材常數 ----------
  const BENCH = { min: 0, max: 100 };   // 光凳上的公制尺（1 m）
  const LENS_R = 2.5;                   // 透鏡半徑（直徑 5.0 cm）
  const PATTERN_HALF = 1.2;             // 光源屏鏤空圖案的半高（全高 2.4 cm）
  const ROD_TOP = 12;                   // 參考物頂端在主軸上方 12 cm（比透鏡上緣高）
  const EYE_BEHIND = 15;                // 觀察虛像時，眼睛在透鏡後方 15 cm
  const EYE_BEYOND_REAL = 25;           // 觀察實像時，眼睛在實像後方 25 cm（明視距離）
  const GAP = 3;                        // 光凳上兩個臺座標線的最小距離
  const LAMP_BACK = 5;                  // 光源屏左側被燈泡與燈座佔用的長度
  const SA_K = 0.05;                    // 「含誤差」的球面像差：透鏡邊緣的屈光力比中央強 5 %

  const LENSES = [
    { id: 'cx10', f: 10, zh: '凸透鏡 10', en: 'Convex 10' },
    { id: 'cx15', f: 15, zh: '凸透鏡 15', en: 'Convex 15' },
    { id: 'cx20', f: 20, zh: '凸透鏡 20', en: 'Convex 20' },
    { id: 'cxM', f: null, sign: 1, mystery: true, zh: '神秘凸透鏡', en: 'Mystery convex' },
    { id: 'cc10', f: -10, zh: '凹透鏡 10', en: 'Concave 10' },
    { id: 'cc15', f: -15, zh: '凹透鏡 15', en: 'Concave 15' },
    { id: 'cc20', f: -20, zh: '凹透鏡 20', en: 'Concave 20' },
    { id: 'ccM', f: null, sign: -1, mystery: true, zh: '神秘凹透鏡', en: 'Mystery concave' }
  ];
  LENSES.forEach(function (L) { if (L.f) L.sign = L.f > 0 ? 1 : -1; });

  const EPS = 1e-9;

  // ---------- 成像公式 ----------
  /** 由 1/q = 1/f − 1/p 求像距；物在焦點時回傳 Infinity（像在無窮遠） */
  function imageDistance(p, f) {
    const inv = 1 / f - 1 / p;
    if (Math.abs(inv) <= EPS / Math.max(Math.abs(p), Math.abs(f))) return Infinity;
    return 1 / inv;
  }
  /** 成像結果：像距、放大率與像的性質 */
  function solve(p, f) {
    const q = imageDistance(p, f);
    if (!isFinite(q)) return { p: p, f: f, q: Infinity, m: Infinity, atInfinity: true, real: false, upright: false, size: 'none' };
    const m = -q / p;
    const am = Math.abs(m);
    return {
      p: p, f: f, q: q, m: m, atInfinity: false,
      real: q > 0, upright: m > 0,
      size: Math.abs(am - 1) < 1e-9 ? 'same' : am > 1 ? 'magnified' : 'reduced'
    };
  }
  /** 物與像屏的距離 D 固定時，能在屏上成實像的兩個物距（共軛位置）；D < 4f 時沒有 */
  function conjugates(D, f) {
    if (!(f > 0) || D < 4 * f - 1e-12) return null;
    const r = Math.sqrt(Math.max(0, D * D - 4 * D * f));
    return { p1: (D - r) / 2, p2: (D + r) / 2, d: r };
  }
  /** 共軛法（貝索法）：物屏距離 D、兩個成像位置的透鏡距離 d → f = (D² − d²)/(4D) */
  function besselF(D, d) { return (D * D - d * d) / (4 * D); }
  /** 由一組 p、q 算焦距 f = pq/(p + q) */
  function focalFrom(p, q) {
    if (!isFinite(q)) return p;
    const s = p + q;
    return Math.abs(s) < EPS ? Infinity : p * q / s;
  }

  // ---------- 像屏上的模糊圈 ----------
  /**
   * 會聚（或發散）到像點的光錐，被距透鏡 L 的像屏截出的光斑直徑。
   * aperture：透鏡直徑。q 可以是負值（虛像：光錐由透鏡左方的 q 處發散出來）或 Infinity（平行光）。
   */
  function blurDiameter(q, L, aperture) {
    const D = aperture == null ? 2 * LENS_R : aperture;
    if (!isFinite(q)) return D;
    return D * Math.abs(q - L) / Math.abs(q);
  }
  /** 像屏上像的相對亮度（照度）∝ 1/m²，以等大像為 1 */
  function relBrightness(m) { return isFinite(m) && m !== 0 ? 1 / (m * m) : 0; }

  // ---------- 透過透鏡看東西（針孔眼） ----------
  /**
   * 物點在透鏡前 p（> 0）處、橫向座標 obj = [s, y]（相對主軸）；眼睛在透鏡後 d（> 0）處、橫向座標 eye。
   * 求「物點 → 透鏡 → 眼睛」那條光線在透鏡上的位置 L。sa：球面像差係數 c（0 = 理想透鏡）。
   * 回傳 { L: [s, y], ok }。ok = false 表示眼睛恰在實像上（無法看清）。
   */
  function lensCrossing(f, p, d, obj, eye, sa) {
    const k = 1 + d / p - d / f;
    const rs = eye[0] + d * obj[0] / p, ry = eye[1] + d * obj[1] / p;
    if (Math.abs(k) < 1e-9) return { L: [NaN, NaN], ok: false };
    let s = rs / k, y = ry / k;
    if (sa) {
      const sg = f > 0 ? 1 : -1;
      for (let i = 0; i < 60; i++) {
        const r2 = s * s + y * y;
        const ns = (rs + d * sg * sa * r2 * s) / k, ny = (ry + d * sg * sa * r2 * y) / k;
        const done = Math.abs(ns - s) + Math.abs(ny - y) < 1e-13;
        s = ns; y = ny;
        if (done) break;
      }
    }
    return { L: [s, y], ok: isFinite(s) && isFinite(y) };
  }
  /** 一條在透鏡上位置 L、由物點射來的光線，出射斜率（理想透鏡＋像差） */
  function outSlope(f, p, obj, L, sa) {
    const sg = f > 0 ? 1 : -1, r2 = L[0] * L[0] + L[1] * L[1];
    return [
      (L[0] - obj[0]) / p - L[0] / f - (sa ? sg * sa * r2 * L[0] : 0),
      (L[1] - obj[1]) / p - L[1] / f - (sa ? sg * sa * r2 * L[1] : 0)
    ];
  }
  /**
   * 眼睛透過透鏡看到物點的方向（小角度，rad；正值 = 偏右／偏上）以及是否在鏡框內看得到。
   * R：透鏡半徑。
   */
  function viewThroughLens(f, p, d, obj, eye, R, sa) {
    const c = lensCrossing(f, p, d, obj, eye, sa);
    const Rr = R == null ? LENS_R : R;
    if (!c.ok) return { a: [NaN, NaN], L: c.L, visible: false };
    const L = c.L;
    return { a: [(L[0] - eye[0]) / d, (L[1] - eye[1]) / d], L: L, visible: L[0] * L[0] + L[1] * L[1] <= Rr * Rr + 1e-12 };
  }
  /** 直接（不透過透鏡）看距離 dist 處、橫向座標 obj 的點 */
  function viewDirect(dist, obj, eye) { return [(obj[0] - eye[0]) / dist, (obj[1] - eye[1]) / dist]; }
  /** 球面像差係數：透鏡邊緣（半徑 R）的額外偏折為中央的 k 倍比例 → c = k/(|f| R²) */
  function saCoef(f, k, R) { const Rr = R == null ? LENS_R : R; return (k == null ? SA_K : k) / (Math.abs(f) * Rr * Rr); }

  // ---------- 光凳上的視差法 ----------
  /**
   * 眼睛的位置（光凳讀數）：看虛像時在透鏡後 EYE_BEHIND；看實像時至少在實像後 EYE_BEYOND_REAL。
   * xL 為透鏡（光心）位置，q 為像距。
   */
  function eyeX(xL, q) {
    if (isFinite(q) && q > 0) return Math.max(xL + EYE_BEHIND, xL + q + EYE_BEYOND_REAL);
    return xL + EYE_BEHIND;
  }
  /** 頭可以左右擺動的幅度：讓像的中心留在鏡框 70 % 以內（不超過 2 cm、不少於 0.3 cm） */
  function swingAmp(xL, q, xE, R) {
    const Rr = R == null ? LENS_R : R;
    const d = xE - xL;
    if (!isFinite(q)) return 2;
    const lim = 0.7 * Rr * (d - q) / Math.abs(q);
    return Math.max(0.3, Math.min(2, lim));
  }
  /**
   * 視差：眼睛橫移 sE 時，鏡內的像與鏡外參考物看起來的方向差（rad，正值 = 像在參考物右邊）。
   * xI：像的位置；xR：參考物位置；xE：眼睛位置。兩者重合時恆為 0。
   */
  function parallax(xE, xI, xR, sE) {
    return -sE * (1 / (xE - xI) - 1 / (xE - xR));
  }
  /**
   * 頭向右擺時參考物相對於像的移動方向：
   *   'with'：與頭同向（參考物比像遠離眼睛 → 應移近眼睛）
   *   'against'：與頭反向（參考物比像靠近眼睛 → 應移離眼睛）
   *   'none'：沒有視差
   */
  function parallaxSense(xE, xI, xR, tol) {
    const dl = (xE - xR) - (xE - xI); // 參考物比像遠多少（> 0：較遠）
    if (Math.abs(dl) <= (tol || 1e-9)) return 'none';
    return dl > 0 ? 'with' : 'against';
  }
  /** 頭擺到 sE 時，在參考物所在的距離上，參考物與「指向像的視線」錯開多少（cm） */
  function parallaxOffset(xE, xI, xR, sE) { return Math.abs(sE * (xI - xR) / (xE - xI)); }

  // ---------- 插針法（方格紙俯視） ----------
  /** 直線 AB 與主軸（s = 0）的交點 x；AB 與主軸平行時回傳 null */
  function lineAxis(A, B) {
    const ds = B[1] - A[1];
    if (Math.abs(ds) < 1e-12) return null;
    return A[0] - A[1] * (B[0] - A[0]) / ds;
  }
  /**
   * 俯視圖：透鏡在 x = 0、主軸 s = 0；針 P 在 (−p, 0)；觀測點 E = (xE, sE)，xE > 0。
   * 回傳 E 透過透鏡看到 P（高度 y 處，透鏡中心高 hc、眼睛高 he）時，光線在透鏡上的位置 L = [s, y − hc]。
   */
  function pinCrossing(f, p, E, y, hc, he, sa) {
    return lensCrossing(f, p, E[0], [0, y - hc], [E[1], he - hc], sa);
  }
  /**
   * 由觀測點 E 看到的 P 的像，在俯視圖上的方向所指向的主軸交點（「看起來」的像位置）。
   * 理想透鏡時恰為 q；有像差時隨觀測點偏離主軸而改變。
   */
  function apparentImageX(f, p, E, hc, he, sa) {
    const c = pinCrossing(f, p, E, hc, hc, he, sa);
    if (!c.ok) return NaN;
    return lineAxis([0, c.L[0]], E);
  }

  // ---------- 數據分析 ----------
  /** 最小平方直線 y = a + b x */
  function linFit(xs, ys) {
    const n = xs.length;
    if (n < 2) return null;
    let sx = 0, sy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
    const mx = sx / n, my = sy / n;
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - mx, dy = ys[i] - my;
      sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
    }
    if (sxx < 1e-18) return null;
    const b = sxy / sxx, a = my - b * mx;
    const r = syy > 0 ? sxy / Math.sqrt(sxx * syy) : 1;
    return { a: a, b: b, r: r, n: n };
  }
  function mean(a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; }
  function sd(a) {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1));
  }
  /**
   * 分析一組數據 rows = [{p, q}]（同一個透鏡）：
   *   每列 1/p、1/q、f = pq/(p+q)、p + q、m = −q/p；
   *   1/q 對 1/p 的最佳直線（斜率應為 −1）與兩個截距求得的焦距；
   *   斜率固定為 −1 時的焦距 1/f = 平均(1/p + 1/q)。
   * fTrue：真正的焦距（給出時計算百分誤差）。
   */
  function analyze(rows, fTrue) {
    const out = { n: rows.length, rows: [] };
    rows.forEach(function (r) {
      out.rows.push({ p: r.p, q: r.q, ip: 1 / r.p, iq: 1 / r.q, f: focalFrom(r.p, r.q), sum: r.p + r.q, m: -r.q / r.p });
    });
    if (!rows.length) return out;
    const fs = out.rows.map(function (r) { return r.f; }).filter(isFinite);
    out.meanF = fs.length ? mean(fs) : NaN;
    out.sdF = sd(fs);
    out.fFixed = 1 / mean(out.rows.map(function (r) { return r.ip + r.iq; }));
    const fit = linFit(out.rows.map(function (r) { return r.ip; }), out.rows.map(function (r) { return r.iq; }));
    if (fit) {
      out.fit = fit;
      out.slope = fit.b;
      out.fY = 1 / fit.a;                         // 縱軸截距 = 1/f
      out.fX = Math.abs(fit.a) > 1e-15 ? -fit.b / fit.a : NaN; // 橫軸截距 = 1/f
      out.fFit = 2 / (fit.a + (-fit.a / fit.b));  // 兩個截距的平均（倒數平均）
    }
    if (fTrue) {
      const err = function (f) { return isFinite(f) ? (f - fTrue) / Math.abs(fTrue) : NaN; };
      out.errMean = err(out.meanF);
      out.errFixed = err(out.fFixed);
      if (fit) out.errFit = err(out.fFit);
    }
    return out;
  }
  /**
   * 在數據中找共軛位置：物屏距離 D = p + q 相同（容許 tol）、透鏡位置相差 ≥ minD 的兩列。
   * 回傳最好的一對 { i, j, D, d, f }（d 越大越準），沒有則 null。只用實像。
   */
  function findConjugate(rows, tol, minD) {
    let best = null;
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (!(a.q > 0 && b.q > 0)) continue;
      const Da = a.p + a.q, Db = b.p + b.q;
      if (Math.abs(Da - Db) > (tol == null ? 0.15 : tol)) continue;
      const d = Math.abs(a.p - b.p);
      if (d < (minD == null ? 2 : minD)) continue;
      const D = (Da + Db) / 2;
      if (!best || d > best.d) best = { i: i, j: j, D: D, d: d, f: besselF(D, d) };
    }
    return best;
  }

  // ---------- 讀數與誤差 ----------
  function round1(x) { return Math.round(x * 10 + (x >= 0 ? 1e-9 : -1e-9)) / 10; }
  /** 可重現的亂數（mulberry32） */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** 「含誤差」的讀數：眼睛讀公制尺的隨機誤差（均勻 ±amp），再讀到最接近的 1 mm */
  function readScale(x, rand, amp) {
    return round1(x + (rand ? (rand() * 2 - 1) * (amp == null ? 0.06 : amp) : 0));
  }
  /** 神秘透鏡的焦距：|f| 在 11.0–19.0 cm（取到 0.1 cm），sign 決定凸或凹 */
  function mysteryF(rand, sign) {
    const v = round1(11 + rand() * 8);
    return sign < 0 ? -v : v;
  }
  /** 「含誤差」時透鏡光心與臺座標線的偏移：|δ| 在 0.2–0.5 cm，正負隨機 */
  function lensOffset(rand) {
    const v = 0.2 + rand() * 0.3;
    return round1((rand() < 0.5 ? -1 : 1) * v * 100) / 100;
  }

  // ---------- 光凳整體狀態 ----------
  /**
   * o = { f, xO, xL, xS?, xR?, dL?（透鏡光心偏移）}
   * 回傳真實物距、像距、像的位置、像屏上的模糊圈、視差等。
   */
  function bench(o) {
    const xLt = o.xL + (o.dL || 0);
    const pT = xLt - o.xO;
    const s = solve(pT, o.f);
    const out = { xLt: xLt, pTrue: pT, sol: s, q: s.q, xI: isFinite(s.q) ? xLt + s.q : NaN, pRead: o.xL - o.xO };
    if (o.xS != null) {
      const Ls = o.xS - xLt;
      out.blur = Ls > 0 ? blurDiameter(s.q, Ls) : NaN;
      out.qRead = o.xS - o.xL;
    }
    if (o.xR != null) {
      out.xE = eyeX(xLt, s.q);
      out.qRead = o.xR - o.xL;
      out.rodErr = isFinite(out.xI) ? o.xR - out.xI : NaN;
    }
    return out;
  }

  return {
    BENCH: BENCH, LENS_R: LENS_R, PATTERN_HALF: PATTERN_HALF, ROD_TOP: ROD_TOP, EYE_BEHIND: EYE_BEHIND,
    EYE_BEYOND_REAL: EYE_BEYOND_REAL, GAP: GAP, LAMP_BACK: LAMP_BACK, SA_K: SA_K, LENSES: LENSES,
    imageDistance: imageDistance, solve: solve, conjugates: conjugates, besselF: besselF, focalFrom: focalFrom,
    blurDiameter: blurDiameter, relBrightness: relBrightness,
    lensCrossing: lensCrossing, outSlope: outSlope, viewThroughLens: viewThroughLens, viewDirect: viewDirect, saCoef: saCoef,
    eyeX: eyeX, swingAmp: swingAmp, parallax: parallax, parallaxSense: parallaxSense, parallaxOffset: parallaxOffset,
    lineAxis: lineAxis, pinCrossing: pinCrossing, apparentImageX: apparentImageX,
    linFit: linFit, mean: mean, sd: sd, analyze: analyze, findConjugate: findConjugate,
    round1: round1, rng: rng, readScale: readScale, mysteryF: mysteryF, lensOffset: lensOffset, bench: bench
  };
});
