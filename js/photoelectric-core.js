/*
 * photoelectric-core.js — 光電效應物理核心（與畫面無關，可單獨測試）
 *
 * 單位約定：
 *   波長 lambda ........ nm
 *   頻率 f ............. Hz
 *   能量 ............... eV（另提供焦耳）
 *   功函數 phi ......... eV
 *   光功率 P ........... W（畫面上用 μW）
 *   電壓 V ............. V（陽極相對於陰極的電位；V > 0 加速、V < 0 減速）
 *   電流 I ............. A
 *
 * 愛因斯坦光電方程式：K_max = hf − φ（hf > φ 才有光電子），停止電壓 V_s = K_max / e，
 * 截止頻率 f0 = φ / h，截止波長 λ0 = hc / φ。
 *
 * 光電管模型（理想化、可解析）：
 *   兩片平行的金屬板，陰極寬 Wc、陽極寬 Wa（Wa > Wc），相距 d，板間為均勻電場 E = V/d（邊緣效應不計）。
 *   光均勻照在陰極上，每秒 N = P/(hf) 個光子，每個光子以量子效率 η 打出一個光電子。
 *   光電子：
 *     出發點 y0 在陰極上均勻分布；
 *     動能 K 在 0 ～ K_max 之間均勻分布（簡化）；
 *     出射方向依餘弦定律（朗伯分布，二維）：與法線夾角 θ 的機率 ∝ cos θ，等同 sin θ 在 (−1, 1) 均勻分布。
 *   電子在板間做等加速度運動 a = eV/(m d)（朝陽極為正）：
 *     垂直板面：x = v_n t + ½ a t²，平行板面：y = y0 + v_t t。
 *   到達陽極平面且落在陽極上（|y| ≤ Wa/2）才算入電流。
 *   側向位移（以 d 為單位）只和 k = K/K_max、s = sin θ、v = eV/K_max 有關：
 *     Δ/d = 2√k s / (√k c + √(k c² + v))，c = cos θ。
 *   電流 I = η e N · F(V/K_max)，F 為「被陽極收集的比例」，由上式積分而得（數值積分，可達 1e-9 精度）。
 *   V ≤ −V_s 時 F = 0；V 很大時 F → 1，電流達到飽和 I_sat = η e N。
 */
(function (root) {
  'use strict';

  // ---------- 物理常數（SI，2019 年定義值） ----------
  const H = 6.62607015e-34;        // 普朗克常數 J·s
  const E_CHARGE = 1.602176634e-19; // 基本電荷 C
  const C_LIGHT = 299792458;        // 光速 m/s
  const M_E = 9.1093837015e-31;     // 電子質量 kg
  const HC_EV_NM = H * C_LIGHT / E_CHARGE * 1e9; // hc ≈ 1239.84 eV·nm
  const H_OVER_E = H / E_CHARGE;    // 密立坎圖的斜率 h/e ≈ 4.136e-15 V·s

  // ---------- 陰極金屬（課本常用的功函數，eV） ----------
  const METALS = [
    { id: 'Cs', zh: '銫', en: 'Caesium', phi: 2.1 },
    { id: 'K', zh: '鉀', en: 'Potassium', phi: 2.3 },
    { id: 'Na', zh: '鈉', en: 'Sodium', phi: 2.28 },
    { id: 'Zn', zh: '鋅', en: 'Zinc', phi: 4.3 },
    { id: 'Cu', zh: '銅', en: 'Copper', phi: 4.7 },
    { id: 'Pt', zh: '鉑', en: 'Platinum', phi: 5.6 }
  ];
  function metal(id) { return METALS.find(function (m) { return m.id === id; }) || null; }

  // ---------- 光電管幾何與量子效率 ----------
  const GEOMETRY = { d: 0.010, Wc: 0.014, Wa: 0.030 }; // m：板距 1.0 cm、陰極寬 1.4 cm、陽極寬 3.0 cm
  const ETA = 1e-3;                 // 量子效率：每 1000 個光子打出 1 個光電子（金屬的典型數量級）
  const V_MIN = -5, V_MAX = 5;      // 電源範圍（V）
  const I_ZERO = 5e-13;             // A：電流表的解析度一半（0.0005 nA），小於此值顯示 0.000 nA

  // ---------- 光子 ----------
  /** 由波長（nm）求光子：頻率 f、能量（J 與 eV） */
  function photon(lambdaNm) {
    const f = C_LIGHT / (lambdaNm * 1e-9);
    const EJ = H * f;
    return { lambda: lambdaNm, f: f, EJ: EJ, EeV: EJ / E_CHARGE };
  }
  function frequency(lambdaNm) { return C_LIGHT / (lambdaNm * 1e-9); }
  function wavelengthOf(f) { return C_LIGHT / f * 1e9; }
  function photonEnergyEV(lambdaNm) { return photon(lambdaNm).EeV; }

  /** 是否射出光電子：hf > φ（等於時動能為零，視為不射出） */
  function emits(lambdaNm, phi) { return photonEnergyEV(lambdaNm) > phi; }

  /** 最大動能 K_max = hf − φ（eV）；低於截止頻率時為 0 */
  function kmax(lambdaNm, phi) { return Math.max(0, photonEnergyEV(lambdaNm) - phi); }

  /** 停止電壓 V_s = K_max / e（V）；數值上等於以 eV 為單位的 K_max */
  function stoppingVoltage(lambdaNm, phi) {
    const KJ = kmax(lambdaNm, phi) * E_CHARGE; // J
    return KJ / E_CHARGE;
  }

  /** 截止頻率 f0 = φ/h（Hz） */
  function thresholdFrequency(phi) { return phi * E_CHARGE / H; }

  /** 截止波長 λ0 = hc/φ（nm） */
  function thresholdWavelength(phi) { return HC_EV_NM / phi; }

  /** 每秒入射的光子數 N = P/(hf) */
  function photonRate(P, lambdaNm) { return P > 0 ? P / photon(lambdaNm).EJ : 0; }

  /** 飽和電流 I_sat = η e N（所有光電子都被陽極收集時；A） */
  function saturationCurrent(P, lambdaNm, phi, eta) {
    if (!emits(lambdaNm, phi)) return 0;
    return (eta == null ? ETA : eta) * E_CHARGE * photonRate(P, lambdaNm);
  }

  // ---------- 收集比例 F(v)，v = eV / K_max ----------
  /** 側向位移（以 d 為單位）：Δ/d = 2√k s / (√k c + √(k c² + v))；到不了陽極時傳回 NaN */
  function lateralDrift(k, s, v) {
    const c2 = 1 - s * s, kn = k * c2;
    if (kn + v < 0) return NaN;
    const den = Math.sqrt(kn) + Math.sqrt(kn + v);
    if (den <= 0) return NaN;
    return 2 * Math.sqrt(k) * s / den;
  }

  /** 出發點均勻分布時，側向位移 D（≥ 0，以 d 為單位）的電子落在陽極上的比例 */
  function overlapFraction(D, g) {
    const wc = g.Wc / g.d, wa = g.Wa / g.d;
    const hi = Math.min(wc / 2, wa / 2 - D), lo = Math.max(-wc / 2, -wa / 2 - D);
    return Math.max(0, hi - lo) / wc;
  }

  // 8 點高斯－勒讓德積分（區間 [-1, 1]）
  const GX = [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498,
    0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363];
  const GW = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620,
    0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];
  function gauss(fn, a, b) {
    if (!(b > a)) return 0;
    const h = (b - a) / 2, m = (a + b) / 2;
    let s = 0;
    for (let i = 0; i < 8; i++) s += GW[i] * fn(m + h * GX[i]);
    return s * h;
  }

  /** 固定 s = sin θ，對動能比例 k 積分：∫ [到得了] · overlap(Δ) dk */
  function innerK(s, v, g) {
    const c2 = 1 - s * s, c = Math.sqrt(c2);
    const kMin = v < 0 ? -v / c2 : 0;
    if (!(kMin < 1)) return 0;
    const span = 1 - kMin;
    // 變數代換 k = kMin + span·u²，消除端點的平方根奇異性
    const kOf = function (u) { return kMin + span * u * u; };
    const fu = function (u) {
      const D = Math.abs(lateralDrift(kOf(u), s, v));
      return (isFinite(D) ? overlapFraction(D, g) : 0) * 2 * span * u;
    };
    // 分段點：Δ(k) 等於 (Wa−Wc)/2 或 (Wa+Wc)/2 之處（overlap 的轉折）
    const cuts = [0, 1];
    if (v !== 0 && s > 0) {
      [(g.Wa - g.Wc) / 2 / g.d, (g.Wa + g.Wc) / 2 / g.d].forEach(function (D) {
        const den = 4 * s * (s - c * D);
        if (den === 0) return;
        const k = v * D * D / den;
        if (k > kMin && k < 1 && Math.abs(lateralDrift(k, s, v) - D) < 1e-9 * Math.max(1, D)) {
          cuts.push(Math.sqrt((k - kMin) / span));
        }
      });
    }
    cuts.sort(function (a, b) { return a - b; });
    let sum = 0;
    for (let i = 0; i + 1 < cuts.length; i++) sum += gauss(fu, cuts[i], cuts[i + 1]);
    return sum;
  }

  /**
   * 收集比例 F(v)：v = eV/K_max（V 以伏特、K_max 以 eV 計時就是 V/K_max）。
   * sin θ 在 (−1, 1) 均勻、k 在 (0, 1) 均勻；左右對稱，只積 s ∈ [0, 1]。
   */
  function collectedFraction(v, geo) {
    const g = geo || GEOMETRY;
    if (!(v > -1)) return 0;
    if (v >= Math.pow(4 * g.d / (g.Wa - g.Wc), 2)) return 1; // 側向位移最多 2d/√v，全部落在陽極上
    const sMax = v < 0 ? Math.sqrt(1 + v) : 1;
    const PANELS = 48;
    let sum = 0;
    // 在 s 方向分段做高斯積分；靠近 sMax 時用 s = sMax(1 − w²) 加密
    const fs = function (w) { const s = sMax * (1 - w * w); return innerK(s, v, g) * 2 * sMax * w; };
    for (let i = 0; i < PANELS; i++) sum += gauss(fs, i / PANELS, (i + 1) / PANELS);
    return Math.max(0, Math.min(1, sum));
  }

  /**
   * 光電流 I（A）。p = { lambda (nm), phi (eV), P (W), V (V), eta?, geo? }
   */
  function current(p) {
    const Is = saturationCurrent(p.P, p.lambda, p.phi, p.eta);
    if (!(Is > 0)) return 0;
    const K = kmax(p.lambda, p.phi);
    return Is * collectedFraction(p.V / K, p.geo);
  }

  /** 電流表是否顯示 0（小於解析度的一半） */
  function isZeroCurrent(I) { return !(I >= I_ZERO); }

  /** 完整的狀態摘要 */
  function analyze(p) {
    const ph = photon(p.lambda);
    const K = kmax(p.lambda, p.phi);
    const on = emits(p.lambda, p.phi);
    const Is = saturationCurrent(p.P, p.lambda, p.phi, p.eta);
    const I = current(p);
    return {
      lambda: p.lambda, f: ph.f, EJ: ph.EJ, EeV: ph.EeV, phi: p.phi, P: p.P, V: p.V,
      emits: on, Kmax: K, KmaxJ: K * E_CHARGE, Vs: K,
      f0: thresholdFrequency(p.phi), lambda0: thresholdWavelength(p.phi),
      N: photonRate(p.P, p.lambda), Ne: on ? (p.eta == null ? ETA : p.eta) * photonRate(p.P, p.lambda) : 0,
      Isat: Is, I: I, zero: isZeroCurrent(I),
      collected: Is > 0 ? I / Is : 0
    };
  }

  /**
   * 「記錄停止電壓」的檢查：電壓 V 必須讓電流表剛好歸零（V 時為 0，往正方向 0.05 V 時不為 0）。
   * 傳回 'ok'、'noLight'、'noEmission'、'outOfRange'、'notZero'、'notEdge'。
   */
  function stopCheck(p) {
    if (!(p.P > 0)) return 'noLight';
    if (!emits(p.lambda, p.phi)) return 'noEmission';
    if (kmax(p.lambda, p.phi) > -V_MIN) return 'outOfRange';
    if (!isZeroCurrent(current(p))) return 'notZero';
    const q = Object.assign({}, p, { V: p.V + 0.05 });
    if (isZeroCurrent(current(q))) return 'notEdge';
    return 'ok';
  }

  // ---------- 單一電子的運動（動畫用；與電流模型相同的假設） ----------
  /**
   * 電子 e0 = { y0 (m), K (eV), s = sin θ }；電壓 V。
   * 傳回 { vn, vt (m/s), a (m/s²), reaches, tEnd (s), yEnd (m), hit }：
   *   reaches = 到達陽極平面；hit = 落在陽極上；tEnd 為到達陽極平面或回到陰極的時間。
   */
  function electronFate(e0, V, geo) {
    const g = geo || GEOMETRY;
    const v = Math.sqrt(2 * e0.K * E_CHARGE / M_E);
    const c = Math.sqrt(Math.max(0, 1 - e0.s * e0.s));
    const vn = v * c, vt = v * e0.s;
    const a = E_CHARGE * V / (M_E * g.d);
    const disc = vn * vn + 2 * a * g.d;
    let reaches = disc > 0 && (vn > 0 || a > 0), tEnd;
    if (reaches) tEnd = 2 * g.d / (vn + Math.sqrt(disc));
    else tEnd = a < 0 ? 2 * vn / -a : 0;
    const yEnd = e0.y0 + vt * tEnd;
    return { vn: vn, vt: vt, a: a, reaches: reaches, tEnd: tEnd, yEnd: yEnd, hit: reaches && Math.abs(yEnd) <= g.Wa / 2 };
  }
  /** 電子在 t（s）時的位置與速度（x 由陰極量起，m） */
  function electronAt(fate, e0, t) {
    return {
      x: fate.vn * t + 0.5 * fate.a * t * t,
      y: e0.y0 + fate.vt * t,
      vx: fate.vn + fate.a * t,
      vy: fate.vt
    };
  }

  /** x(τ) = x0 + vx τ + ½ a τ² 第一次到達 target 的時間（0 < τ ≤ dt）；沒有則傳回 null */
  function firstCrossing(x0, vx, a, target, dt) {
    const c0 = x0 - target; // ½a τ² + vx τ + c0 = 0
    const roots = [];
    if (Math.abs(a) < 1e-30) { if (vx !== 0) roots.push(-c0 / vx); }
    else {
      const disc = vx * vx - 2 * a * c0;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        // 數值穩定的二次公式
        const q = -(vx + (vx >= 0 ? sq : -sq));
        if (q !== 0) { roots.push(q / a); roots.push(2 * c0 / q); } else roots.push(0);
      }
    }
    let best = null;
    roots.forEach(function (t) { if (t > 1e-18 && t <= dt && (best == null || t < best)) best = t; });
    return best;
  }
  /**
   * 板間電子前進 dt（s），加速度 a = eV/(m d)：電壓中途改變時，以當時的位置與速度為新起點，運動仍是精確解。
   * st = { x, y, vx, vy }（m、m/s）。傳回 { st, event, t }：
   *   event = 'anode'（落在陽極上）、'miss'（到達陽極平面但不在陽極上）、'cathode'（回到陰極平面）或 null。
   */
  function stepElectron(st, a, dt, geo) {
    const g = geo || GEOMETRY;
    const tA = firstCrossing(st.x, st.vx, a, g.d, dt);
    const tK = (st.x > 0 || st.vx < 0 || a < 0) ? firstCrossing(st.x, st.vx, a, 0, dt) : null;
    let t = dt, event = null;
    if (tA != null && (tK == null || tA <= tK)) { t = tA; event = 'anode'; }
    else if (tK != null) { t = tK; event = 'cathode'; }
    const n = {
      x: st.x + st.vx * t + 0.5 * a * t * t,
      y: st.y + st.vy * t,
      vx: st.vx + a * t,
      vy: st.vy
    };
    if (event === 'anode') { n.x = g.d; if (Math.abs(n.y) > g.Wa / 2) event = 'miss'; }
    if (event === 'cathode') n.x = 0;
    return { st: n, event: event, t: t };
  }
  /** 電子的初始狀態（在陰極表面 x = 0） */
  function electronStart(e0) {
    const v = Math.sqrt(2 * e0.K * E_CHARGE / M_E);
    const c = Math.sqrt(Math.max(0, 1 - e0.s * e0.s));
    return { x: 0, y: e0.y0, vx: v * c, vy: v * e0.s };
  }
  /** 板間電子的加速度 a = eV/(m d)（朝陽極為正） */
  function accelOf(V, geo) { return E_CHARGE * V / (M_E * (geo || GEOMETRY).d); }

  // ---------- 直線擬合（密立坎圖） ----------
  /** 最小平方法：點 [{x, y}] → { n, slope, intercept, r2 } */
  function fitLine(pts) {
    const n = pts.length;
    if (n < 2) return null;
    let sx = 0, sy = 0;
    pts.forEach(function (p) { sx += p.x; sy += p.y; });
    const mx = sx / n, my = sy / n;
    let sxx = 0, sxy = 0, syy = 0;
    pts.forEach(function (p) { sxx += (p.x - mx) * (p.x - mx); sxy += (p.x - mx) * (p.y - my); syy += (p.y - my) * (p.y - my); });
    if (!(sxx > 0)) return null;
    const slope = sxy / sxx, intercept = my - slope * mx;
    return { n: n, slope: slope, intercept: intercept, r2: syy > 0 ? sxy * sxy / (sxx * syy) : 1 };
  }
  /**
   * 密立坎圖：點 [{f (Hz), Vs (V)}] → 斜率 h/e、h、截止頻率 f0、功函數 φ、頻率範圍 span。
   * 直線 V_s = (h/e) f − φ/e。
   */
  function millikanFit(pts) {
    const L = fitLine(pts.map(function (p) { return { x: p.f, y: p.Vs }; }));
    if (!L) return null;
    let fmin = Infinity, fmax = -Infinity;
    pts.forEach(function (p) { fmin = Math.min(fmin, p.f); fmax = Math.max(fmax, p.f); });
    return {
      n: L.n, slope: L.slope, intercept: L.intercept, r2: L.r2,
      h: L.slope * E_CHARGE, f0: -L.intercept / L.slope, phi: -L.intercept, span: fmax - fmin
    };
  }

  const api = {
    H: H, E_CHARGE: E_CHARGE, C_LIGHT: C_LIGHT, M_E: M_E, HC_EV_NM: HC_EV_NM, H_OVER_E: H_OVER_E,
    METALS: METALS, metal: metal, GEOMETRY: GEOMETRY, ETA: ETA, V_MIN: V_MIN, V_MAX: V_MAX, I_ZERO: I_ZERO,
    photon: photon, frequency: frequency, wavelengthOf: wavelengthOf, photonEnergyEV: photonEnergyEV,
    emits: emits, kmax: kmax, stoppingVoltage: stoppingVoltage,
    thresholdFrequency: thresholdFrequency, thresholdWavelength: thresholdWavelength,
    photonRate: photonRate, saturationCurrent: saturationCurrent,
    lateralDrift: lateralDrift, overlapFraction: overlapFraction, collectedFraction: collectedFraction,
    current: current, isZeroCurrent: isZeroCurrent, analyze: analyze, stopCheck: stopCheck,
    electronFate: electronFate, electronAt: electronAt,
    firstCrossing: firstCrossing, stepElectron: stepElectron, electronStart: electronStart, accelOf: accelOf,
    fitLine: fitLine, millikanFit: millikanFit
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PhotoCore = api;
})(typeof window !== 'undefined' ? window : this);
