/*
 * thin-film-core.js — 薄膜干涉（肥皂膜、空氣劈、牛頓環）的物理核心（與畫面無關，可在 Node 單獨測試）
 *
 * 單位約定：
 *   薄膜厚度 d、波長 lambda 在「單層膜」函式裡用同一種長度單位即可（只有比值 d/λ 有意義）；
 *   顏色表與查表函式一律用 nm。空氣劈、牛頓環的幾何量用 SI（m）。
 *
 * 模型：三層介質 n1 | n2（厚 d）| n3，光由 n1 以入射角 θ1 射入。
 *   界面的振幅反射、透射係數用菲涅耳公式（s、p 兩種偏振分開算；自然光取兩者強度的平均）。
 *   膜內來回一次的相位差 δ = 4π n2 d cosθ2 / λ（光程差 2 n2 d cosθ2）。
 *   多光束（精確，艾里公式）：r = (r12 + r23 e^{iδ}) / (1 + r12 r23 e^{iδ})，R = |r|²，
 *                              t = t12 t23 e^{iδ/2} / (1 + r12 r23 e^{iδ})，T = (n3 cosθ3)/(n1 cosθ1)·|t|²；
 *                              沒有吸收時 R + T = 1。
 *   雙光束（近似）：只取第一道反射光與在膜底反射一次的光：r ≈ r12 + t12 t21 r23 e^{iδ}，t12 t21 = 1 − r12²。
 *   從低折射率射向高折射率的界面，r 為負值，也就是反射時多了 π 的相位（半波損失）。
 *
 * 白光顏色：CIE 1931 2° 標準觀察者配色函數 x̄、ȳ、z̄ 與 CIE 標準光源 D65 的相對光譜，
 *   兩者都取 CIE 官方資料表（CIE 015:2018；CIE 資料集 files.cie.co.at：CIE_xyz_1931_2deg、CIE_std_illum_D65）
 *   380–780 nm 每 5 nm 一點，積分時以線性內插到每 1 nm。XYZ → 線性 sRGB 用 IEC 61966-2-1 的矩陣。
 */
(function (root) {
  'use strict';

  const N_AIR = 1.0;     // 空氣（實際約 1.0003，差 0.03%，與課本一樣取 1）
  const N_WATER = 1.33;  // 水
  const N_GLASS = 1.52;  // 冕牌玻璃
  const N_SOAP = 1.33;   // 肥皂水（與水幾乎相同）

  // ====================================================================
  // 菲涅耳係數與單層膜
  // ====================================================================

  /** 司乃耳定律：由 n1、cosθ1 求 cosθ2；全反射時回傳 NaN */
  function cosRefr(n1, n2, cos1) {
    const s1 = Math.sqrt(Math.max(0, 1 - cos1 * cos1));
    const s2 = n1 * s1 / n2;
    return s2 > 1 ? NaN : Math.sqrt(1 - s2 * s2);
  }

  /**
   * 界面 1 → 2 的菲涅耳振幅係數（c1 = cosθ1、c2 = cosθ2）。
   *   rs = (n1c1 − n2c2)/(n1c1 + n2c2)，ts = 2n1c1/(n1c1 + n2c2)
   *   rp = (n2c1 − n1c2)/(n2c1 + n1c2)，tp = 2n1c1/(n2c1 + n1c2)
   * 正入射時 rs = (n1 − n2)/(n1 + n2)：n1 < n2（射向光密介質）為負，即反射多了 π 相位。
   */
  function fresnel(n1, c1, n2, c2) {
    const a = n1 * c1, b = n2 * c2, c = n2 * c1, d = n1 * c2;
    return { rs: (a - b) / (a + b), ts: 2 * a / (a + b), rp: (c - d) / (c + d), tp: 2 * a / (c + d) };
  }

  /** 由 a = r12、b = r23、c = cosδ 算反射率（多光束精確或雙光束近似） */
  function reflOf(a, b, c, two) {
    if (two) {
      const k = 1 - a * a;
      return a * a + k * k * b * b + 2 * a * k * b * c;
    }
    const ab = a * b;
    return (a * a + b * b + 2 * ab * c) / (1 + ab * ab + 2 * ab * c);
  }
  /** 透射率；tt = (t12 t23)²，f = (n3 cosθ3)/(n1 cosθ1) */
  function transOf(a, b, c, tt, f, two) {
    const ab = a * b;
    if (two) return f * tt * (1 + ab * ab - 2 * ab * c);
    return f * tt / (1 + ab * ab + 2 * ab * c);
  }

  /**
   * 建立一個單層膜：n1 |n2（膜）| n3，入射角 cosθ1 = cos1（預設 1，正入射），beams = 'multi'（預設）或 'two'。
   * 回傳的物件可重複計算不同厚度、波長：
   *   R(d, λ)、T(d, λ)、Rs、Rp、Ts、Tp（d、λ 同單位）
   *   Rc(cosδ)、Tc(cosδ)：直接以 cosδ 計算（查表用）
   *   path(d) = 2 n2 d cosθ2（光程差）；order(d, λ) = 光程差 / λ
   *   flips：反射時發生半波損失的界面數（正入射判斷：n1 < n2 一次、n2 < n3 一次）
   *   Rmax、Rmin、Tmax、Tmin：對所有厚度（所有 δ）的最大、最小值
   */
  function layer(n1, n2, n3, cos1, beams) {
    cos1 = cos1 == null ? 1 : cos1;
    const two = beams === 'two';
    const c2 = cosRefr(n1, n2, cos1), c3 = cosRefr(n1, n3, cos1);
    const f12 = fresnel(n1, cos1, n2, c2), f23 = fresnel(n2, c2, n3, c3);
    const f = (n3 * c3) / (n1 * cos1);
    const as = f12.rs, bs = f23.rs, ap = f12.rp, bp = f23.rp;
    const tts = f12.ts * f12.ts * f23.ts * f23.ts, ttp = f12.tp * f12.tp * f23.tp * f23.tp;
    const K = 4 * Math.PI * n2 * c2;
    const L = {
      n1: n1, n2: n2, n3: n3, cos1: cos1, cos2: c2, cos3: c3, beams: two ? 'two' : 'multi',
      rs12: as, rs23: bs, rp12: ap, rp23: bp,
      flips: (n1 < n2 ? 1 : 0) + (n2 < n3 ? 1 : 0),
      delta: function (d, lam) { return K * d / lam; },
      path: function (d) { return 2 * n2 * d * c2; },
      order: function (d, lam) { return 2 * n2 * d * c2 / lam; },
      Rsc: function (c) { return reflOf(as, bs, c, two); },
      Rpc: function (c) { return reflOf(ap, bp, c, two); },
      Tsc: function (c) { return transOf(as, bs, c, tts, f, two); },
      Tpc: function (c) { return transOf(ap, bp, c, ttp, f, two); },
      Rc: function (c) { return 0.5 * (reflOf(as, bs, c, two) + reflOf(ap, bp, c, two)); },
      Tc: function (c) { return 0.5 * (transOf(as, bs, c, tts, f, two) + transOf(ap, bp, c, ttp, f, two)); }
    };
    const cosd = function (d, lam) { return Math.cos(K * d / lam); };
    L.Rs = function (d, lam) { return L.Rsc(cosd(d, lam)); };
    L.Rp = function (d, lam) { return L.Rpc(cosd(d, lam)); };
    L.Ts = function (d, lam) { return L.Tsc(cosd(d, lam)); };
    L.Tp = function (d, lam) { return L.Tpc(cosd(d, lam)); };
    L.R = function (d, lam) { return L.Rc(cosd(d, lam)); };
    L.T = function (d, lam) { return L.Tc(cosd(d, lam)); };
    // R、T 對 cosδ 是單調函數（分子分母都是 cosδ 的一次式），極值在 cosδ = ±1
    const Ra = L.Rc(1), Rb = L.Rc(-1), Ta = L.Tc(1), Tb = L.Tc(-1);
    L.Rmax = Math.max(Ra, Rb); L.Rmin = Math.min(Ra, Rb);
    L.Tmax = Math.max(Ta, Tb); L.Tmin = Math.min(Ta, Tb);
    // 很厚時（或白光的同調性用完時）各次反射光不再干涉：強度直接相加的反射率
    const incoh = function (a, b) { const A = a * a, B = b * b; return (A + B - 2 * A * B) / (1 - A * B); };
    L.Rincoh = 0.5 * (incoh(as, bs) + incoh(ap, bp));
    return L;
  }

  /**
   * 反射（或透射）光的干涉級數條件。flips 為奇數（肥皂膜、空氣劈、牛頓環都是）時：
   *   反射亮紋 2 n d cosθt = (m + ½) λ，反射暗紋 2 n d cosθt = m λ；flips 為偶數時兩者對調。
   * 回傳光程差為 order 個波長時，反射光的「有效相位」以週期計：order + flips/2（整數 = 亮）。
   */
  function reflPhaseCycles(order, flips) { return order + (flips % 2) / 2; }

  // ====================================================================
  // 顏色：CIE 1931 配色函數與 D65 光源（380–780 nm，每 5 nm）
  // ====================================================================
  const CMF_X = [.001368, .002236, .004243, .00765, .01431, .02319, .04351, .07763, .13438, .21477, .2839, .3285, .34828, .34806, .3362, .3187, .2908, .2511, .19536, .1421, .09564, .05795, .03201, .0147, .0049, .0024, .0093, .0291, .06327, .1096, .1655, .22575, .2904, .3597, .43345, .51205, .5945, .6784, .7621, .8425, .9163, .9786, 1.0263, 1.0567, 1.0622, 1.0456, 1.0026, .9384, .85445, .7514, .6424, .5419, .4479, .3608, .2835, .2187, .1649, .1212, .0874, .0636, .04677, .0329, .0227, .01584, .011359, .0081109, .0057903, .0041095, .0028993, .0020492, .00144, .00099995, .00069008, .00047602, .0003323, .00023483, .00016615, .00011741, .000083075, .000058707, .00004151];
  const CMF_Y = [.000039, .000064, .00012, .000217, .000396, .00064, .00121, .00218, .004, .0073, .0116, .01684, .023, .0298, .038, .048, .06, .0739, .09098, .1126, .13902, .1693, .20802, .2586, .323, .4073, .503, .6082, .71, .7932, .862, .91485, .954, .9803, .99495, 1, .995, .9786, .952, .9154, .87, .8163, .757, .6949, .631, .5668, .503, .4412, .381, .321, .265, .217, .175, .1382, .107, .0816, .061, .04458, .032, .0232, .017, .01192, .00821, .005723, .004102, .002929, .002091, .001484, .001047, .00074, .00052, .0003611, .0002492, .0001719, .00012, .0000848, .00006, .0000424, .00003, .0000212, .00001499];
  const CMF_Z = [.00645, .01055, .02005, .03621, .06785, .1102, .2074, .3713, .6456, 1.0391, 1.3856, 1.623, 1.7471, 1.7826, 1.7721, 1.7441, 1.6692, 1.5281, 1.2876, 1.0419, .81295, .6162, .46518, .3533, .272, .2123, .1582, .1117, .07825, .05725, .04216, .02984, .0203, .0134, .00875, .00575, .0039, .00275, .0021, .0018, .00165, .0014, .0011, .001, .0008, .0006, .00034, .00024, .00019, .0001, .00005, .00003, .00002, .00001, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const D65 = [49.9755, 52.3118, 54.6482, 68.7015, 82.7549, 87.1204, 91.486, 92.4589, 93.4318, 90.057, 86.6823, 95.7736, 104.865, 110.936, 117.008, 117.41, 117.812, 116.336, 114.861, 115.392, 115.923, 112.367, 108.811, 109.082, 109.354, 108.578, 107.802, 106.296, 104.79, 106.239, 107.689, 106.047, 104.405, 104.225, 104.046, 102.023, 100, 98.1671, 96.3342, 96.0611, 95.788, 92.2368, 88.6856, 89.3459, 90.0062, 89.8026, 89.5991, 88.6489, 87.6987, 85.4936, 83.2886, 83.4939, 83.6992, 81.863, 80.0268, 80.1207, 80.2146, 81.2462, 82.2778, 80.281, 78.2842, 74.0027, 69.7213, 70.6652, 71.6091, 72.979, 74.349, 67.9765, 61.604, 65.7448, 69.8856, 72.4863, 75.087, 69.3398, 63.5927, 55.0054, 46.4182, 56.6118, 66.8054, 65.0941, 63.3828];
  const TAB_LO = 380, TAB_HI = 780, TAB_STEP = 5;

  /** 表格線性內插（380–780 nm 以外為 0） */
  function interp(tab, nm) {
    if (!(nm >= TAB_LO && nm <= TAB_HI)) return 0;
    const u = (nm - TAB_LO) / TAB_STEP, i = Math.min(tab.length - 2, Math.floor(u)), f = u - i;
    return tab[i] + (tab[i + 1] - tab[i]) * f;
  }
  /** CIE 1931 2° 配色函數 [x̄, ȳ, z̄]（nm） */
  function cmf(nm) { return [interp(CMF_X, nm), interp(CMF_Y, nm), interp(CMF_Z, nm)]; }
  /** D65 相對光譜功率（560 nm = 100） */
  function d65(nm) { return interp(D65, nm); }

  /**
   * 白光（D65）的積分權重：λ 從 380 到 780 nm 每 step nm（預設 1）一點，
   * wX = S(λ) x̄(λ) / Σ S ȳ，wY、wZ 同理，所以完全反射（R = 1）時 Y = 1。
   * 回傳 { n, nm, inv（1/λ，nm⁻¹）, wX, wY, wZ }
   */
  function whiteSpectrum(step) {
    step = step || 1;
    const n = Math.floor((TAB_HI - TAB_LO) / step + 1e-9) + 1;
    const out = { n: n, step: step, nm: new Float64Array(n), inv: new Float64Array(n),
      wX: new Float64Array(n), wY: new Float64Array(n), wZ: new Float64Array(n) };
    let N = 0;
    for (let i = 0; i < n; i++) {
      const w = TAB_LO + i * step, s = d65(w), c = cmf(w);
      out.nm[i] = w; out.inv[i] = 1 / w;
      out.wX[i] = s * c[0]; out.wY[i] = s * c[1]; out.wZ[i] = s * c[2];
      N += s * c[1];
    }
    for (let i = 0; i < n; i++) { out.wX[i] /= N; out.wY[i] /= N; out.wZ[i] /= N; }
    return out;
  }
  let specCache = null;
  function spec1() { return specCache || (specCache = whiteSpectrum(1)); }

  /** XYZ → 線性 sRGB（IEC 61966-2-1，D65 白點） */
  function xyzToLinear(X, Y, Z) {
    return [3.2406 * X - 1.5372 * Y - 0.4986 * Z,
      -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
      0.0557 * X - 0.2040 * Y + 1.0570 * Z];
  }
  /**
   * 色域對應：負的分量（sRGB 顯示不出來的飽和色）往「同亮度的灰色」減少飽和度直到最小分量為 0（亮度 Y 不變），
   * 若仍有分量大於 1，則等比例縮小（色度不變）。回傳 [r, g, b]，0–1 的線性值。
   */
  function gamutMap(rgb, Y) {
    let r = rgb[0], g = rgb[1], b = rgb[2];
    const mn = Math.min(r, g, b);
    if (mn < 0) {
      if (Y <= 0) return [0, 0, 0];
      const k = Y / (Y - mn);
      r = Y + k * (r - Y); g = Y + k * (g - Y); b = Y + k * (b - Y);
    }
    const mx = Math.max(r, g, b);
    if (mx > 1) { r /= mx; g /= mx; b /= mx; }
    return [Math.max(0, r), Math.max(0, g), Math.max(0, b)];
  }
  /** 線性值 0–1 → sRGB 0–255（含 γ 校正） */
  function toSrgb8(v) {
    v = Math.max(0, Math.min(1, v));
    return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  }
  function srgb8ToLinear(c) {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  /** 反射率光譜 Rfun(λ nm)（0–1）在 D65 白光照射下的 XYZ */
  function spectrumXYZ(Rfun, spec) {
    spec = spec || spec1();
    let X = 0, Y = 0, Z = 0;
    for (let i = 0; i < spec.n; i++) {
      const R = Rfun(spec.nm[i]);
      X += spec.wX[i] * R; Y += spec.wY[i] * R; Z += spec.wZ[i] * R;
    }
    return [X, Y, Z];
  }
  /** XYZ → { lin（線性 sRGB，已做色域對應）, srgb（0–255）, x, y（色度座標）} */
  function xyzColor(xyz) {
    const lin = gamutMap(xyzToLinear(xyz[0], xyz[1], xyz[2]), xyz[1]);
    const s = xyz[0] + xyz[1] + xyz[2];
    return { lin: lin, srgb: lin.map(toSrgb8), Y: xyz[1], x: s > 0 ? xyz[0] / s : NaN, y: s > 0 ? xyz[1] / s : NaN };
  }

  /**
   * 單色光 λ 的顯示顏色：由配色函數換成線性 sRGB；光譜色都在 sRGB 色域外，
   * 負的分量直接取 0（光譜色若往灰色降飽和，深紅會偏洋紅），再把最大分量放大到 1（「最亮的這種顏色」）。
   * 回傳線性 [r, g, b]。
   */
  function monoLinear(nm) {
    const c = cmf(nm);
    if (c[1] <= 0 && c[0] <= 0 && c[2] <= 0) return [0, 0, 0];
    const lin = xyzToLinear(c[0], c[1], c[2]).map(function (v) { return Math.max(0, v); });
    const mx = Math.max(lin[0], lin[1], lin[2]);
    return mx > 0 ? [lin[0] / mx, lin[1] / mx, lin[2] / mx] : [0, 0, 0];
  }

  /** sRGB 0–255 → 色相（度，0–360）、HSV 飽和度、明度（0–1） */
  function hsv(rgb) {
    const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
    let h = 0;
    if (c > 1e-9) {
      if (mx === r) h = 60 * (((g - b) / c) % 6);
      else if (mx === g) h = 60 * ((b - r) / c + 2);
      else h = 60 * ((r - g) / c + 4);
    }
    if (h < 0) h += 360;
    return { h: h, s: mx > 0 ? c / mx : 0, v: mx };
  }

  /**
   * 薄膜在白光下的顏色查表（線性 sRGB，已除以曝光基準 norm）：
   *   厚度 0、step、2·step、…、tMax（nm），共 n 格；which = 'R'（反射）或 'T'（透射）。
   *   norm：曝光基準，畫面亮度 = R / norm（預設 L.Rmax，就像相機自動曝光：此膜最亮的反射 = 1）；
   *   enhance（只用於透射）：把 T 換成 (T − Tmin)/(1 − Tmin)，讓透射光很淡的明暗看得出來（示意）。
   * 回傳 { step, n, lin: Float32Array(3n), Y: Float32Array(n) }。
   */
  function colorTable(L, tMax, step, opt) {
    opt = opt || {};
    const spec = opt.spec || spec1();
    const which = opt.which || 'R';
    const n = Math.floor(tMax / step + 1e-9) + 1;
    const lin = new Float32Array(3 * n), Yt = new Float32Array(n);
    const K = 4 * Math.PI * L.n2 * L.cos2;
    const pol = Math.abs(L.rs12 - (-L.rp12)) > 1e-12 || Math.abs(L.rs23 - (-L.rp23)) > 1e-12; // 斜射時 s、p 不同
    const fun = which === 'T' ? (pol ? L.Tc : L.Tsc) : (pol ? L.Rc : L.Rsc);
    let norm, off = 0;
    if (which === 'T') {
      if (opt.enhance) { off = L.Tmin; norm = Math.max(1e-9, L.Tmax - L.Tmin); }
      else norm = opt.norm || L.Tmax;
    } else norm = opt.norm || L.Rmax;
    const ok = norm > 1e-9;
    for (let j = 0; j < n; j++) {
      const t = j * step;
      let X = 0, Y = 0, Z = 0;
      if (ok) {
        for (let i = 0; i < spec.n; i++) {
          const v = (fun(Math.cos(K * t * spec.inv[i])) - off) / norm;
          X += spec.wX[i] * v; Y += spec.wY[i] * v; Z += spec.wZ[i] * v;
        }
      }
      const c = gamutMap(xyzToLinear(X, Y, Z), Y);
      lin[3 * j] = c[0]; lin[3 * j + 1] = c[1]; lin[3 * j + 2] = c[2];
      Yt[j] = Y;
    }
    return { step: step, n: n, tMax: (n - 1) * step, lin: lin, Y: Yt, norm: norm, off: off };
  }

  /** 單一厚度 t（nm）在白光下的反射顏色（不查表，精確積分；norm 同 colorTable） */
  function filmColor(L, t, opt) {
    opt = opt || {};
    const norm = opt.norm || L.Rmax;
    const xyz = spectrumXYZ(function (nm) { return L.R(t, nm) / norm; }, opt.spec);
    return xyzColor(xyz);
  }

  // ====================================================================
  // 肥皂膜：直立在框上，上薄下厚（楔形）；重力排液使整片膜隨時間變薄
  // ====================================================================

  /** 高度比例 z（0 = 頂端、1 = 底部）處的厚度：楔形 h = h底 · z */
  function soapThickness(z, hBottom) { return hBottom * Math.max(0, Math.min(1, z)); }
  /**
   * 排液後的底部厚度：h(t) = h0 / √(1 + t/τ)。
   * 取自重力排液的相似解 h ∝ √(η z / ρ g t)（Mysels 等人 1959）在長時間的 t^(−1/2) 規律；
   * τ 只是示意的時間尺度（實際與表面活性劑、黏度、溫度有關）。
   */
  function drain(h0, t, tau) { return h0 / Math.sqrt(1 + Math.max(0, t) / tau); }

  // ====================================================================
  // 空氣劈：兩片平板玻璃一端接觸、另一端夾細線（直徑 D，離接觸線 L）
  // ====================================================================

  /**
   * p = { D, L, n, lambda }（m）。楔角 tanθ = D/L，x 處的間隙 t = x·D/L（正入射，光程差 2 n t）。
   * 反射暗紋 2 n t = m λ → x_m = m λ L / (2 n D)，間距 Δx = λ/(2 n tanθ) = λL/(2nD)；
   * 0 ≤ x ≤ L 之間的暗紋數 = ⌊2nD/λ⌋ + 1（含接觸線上 m = 0 的暗紋）。
   */
  function wedge(p) {
    const tanT = p.D / p.L;
    return {
      theta: Math.atan(tanT), tanTheta: tanT,
      dx: p.lambda / (2 * p.n * tanT),
      darkCount: Math.floor(2 * p.n * p.D / p.lambda + 1e-9) + 1,
      orders: 2 * p.n * p.D / p.lambda
    };
  }
  function wedgeGap(x, p) { return x * p.D / p.L; }
  function wedgeDarkX(m, p) { return m * p.lambda * p.L / (2 * p.n * p.D); }
  /** 由量到的條紋間距反推細線直徑：D = λ L / (2 n Δx) */
  function wireFromSpacing(dx, L, n, lambda) { return lambda * L / (2 * n * dx); }

  // ====================================================================
  // 牛頓環：平凸透鏡（曲率半徑 R）放在平板玻璃上；e 為中心的間隙（灰塵、抬高）
  // ====================================================================

  /** 離中心 r 處的間隙 t = e + R − √(R² − r²)（≈ e + r²/2R） */
  function lensGap(r, R, e) { return (e || 0) + R - Math.sqrt(Math.max(0, R * R - r * r)); }
  /** 間隙為 t 的半徑（t ≥ e），精確：r² = 2R(t − e) − (t − e)² */
  function radiusAtGap(t, R, e) {
    const u = t - (e || 0);
    return u < 0 ? NaN : Math.sqrt(Math.max(0, 2 * R * u - u * u));
  }
  /**
   * p = { R, lambda, n, e }（m）。反射光第 m 個暗環：2 n t = m λ。e = 0 時 m = 0 為中心暗點。
   * 精確半徑由 radiusAtGap 求；近似 r_m = √(m λ R / n)（e = 0）。
   */
  function darkRingRadius(m, p) { return radiusAtGap(m * p.lambda / (2 * p.n), p.R, p.e); }
  function darkRingApprox(m, p) { return Math.sqrt(Math.max(0, (m * p.lambda / p.n - 2 * (p.e || 0)) * p.R)); }
  /** 反射光第 m 個亮環（m = 1, 2, …）：2 n t = (m − ½) λ */
  function brightRingRadius(m, p) { return radiusAtGap((m - 0.5) * p.lambda / (2 * p.n), p.R, p.e); }

  /** 最小平方法直線 y = a + b x；回傳 { n, slope, intercept, r2 } */
  function fitLine(xs, ys) {
    const n = Math.min(xs.length, ys.length);
    if (n < 2) return { n: n, slope: NaN, intercept: NaN, r2: NaN };
    let sx = 0, sy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
    const mx = sx / n, my = sy / n;
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - mx, dy = ys[i] - my;
      sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
    }
    if (sxx === 0) return { n: n, slope: NaN, intercept: NaN, r2: NaN };
    const b = sxy / sxx;
    return { n: n, slope: b, intercept: my - b * mx, r2: syy > 0 ? sxy * sxy / (sxx * syy) : 1 };
  }

  const api = {
    N_AIR: N_AIR, N_WATER: N_WATER, N_GLASS: N_GLASS, N_SOAP: N_SOAP,
    cosRefr: cosRefr, fresnel: fresnel, layer: layer, reflPhaseCycles: reflPhaseCycles,
    CMF_X: CMF_X, CMF_Y: CMF_Y, CMF_Z: CMF_Z, D65: D65,
    cmf: cmf, d65: d65, whiteSpectrum: whiteSpectrum, xyzToLinear: xyzToLinear, gamutMap: gamutMap,
    toSrgb8: toSrgb8, srgb8ToLinear: srgb8ToLinear, spectrumXYZ: spectrumXYZ, xyzColor: xyzColor,
    monoLinear: monoLinear, hsv: hsv, colorTable: colorTable, filmColor: filmColor,
    soapThickness: soapThickness, drain: drain,
    wedge: wedge, wedgeGap: wedgeGap, wedgeDarkX: wedgeDarkX, wireFromSpacing: wireFromSpacing,
    lensGap: lensGap, radiusAtGap: radiusAtGap, darkRingRadius: darkRingRadius, darkRingApprox: darkRingApprox,
    brightRingRadius: brightRingRadius, fitLine: fitLine
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ThinFilmCore = api;
})(this);
