/*
 * earthquake-core.js — 「地震波與震央定位」物理核心（與畫面無關，可單獨測試）
 *
 * 單位約定：距離 km、時間 s、波速 km/s、角度在函式內用 rad（介面另外換成度）、密度 g/cm³。
 *
 * 一、地殼中的體波與表面波（均勻、平坦的半無限地殼）
 *   P 波 Vp、S 波 Vs；震源深度 h、震央距離 Δ → 震源距離 R = √(Δ² + h²)
 *   走時 tP = R/Vp、tS = R/Vs，S−P 時間差 Δt = R(1/Vs − 1/Vp) → R = Δt · VpVs/(Vp − Vs)
 *   彈性介質：Vp² = (K + 4μ/3)/ρ、Vs² = μ/ρ；液體 μ = 0 → Vs = 0（S 波無法傳播）。
 *   雷利波（表面波）速度由雷利方程式精確求得（帕松固體 V_R = 0.9194 Vs），在均勻半空間中不頻散。
 *   表面波的到達時間用簡化模型 tR = h/Vs + Δ/V_R（S 波先到震央正上方的地表，再沿地表前進）。
 *   振幅只取趨勢（示意）：體波 ∝ 1/R、表面波 ∝ e^(−h/20 km)/√Δ；到達時間是精確計算。
 *
 * 二、定位：測站 (x_i, y_i)、由 S−P 換算的震源距離 R_i。
 *   兩兩相減得到「共同弦」（根軸）的一次方程式，最小平方解出震央 (x, y)；
 *   深度 h² = 平均(R_i² − Δ_i²)，再以高斯－牛頓法對 (x, y, h) 做非線性最小平方修正。
 *   資料精確時三條共同弦恰好交於震央（不論深度）。只有兩站時兩圓有兩個交點、無法分辨。
 *
 * 三、地球內部（球對稱、分層常速殼層）：PREM（Dziewonski & Anderson, 1981, Phys. Earth Planet. Inter. 25, 297–356）
 *   每個殼層的波速取 PREM 在殼層中點的值，殼層內射線是直線，界面上遵守司乃耳定律；
 *   球面上射線參數 p = r sin i / v 沿整條射線不變。S 波遇到液態外核（Vs = 0）就無法前進。
 *   PREM 頂部 3 km 的海水層改為上地殼（陸地測站）。
 */
(function (root) {
  'use strict';

  const DEG = Math.PI / 180;
  /** 地殼代表值（本模擬的「真實」地殼）：Vp 6.0 km/s、Vs 3.5 km/s、密度 2.7 g/cm³ */
  const CRUST = { vp: 6.0, vs: 3.5, rho: 2.7 };
  const WATER = { vp: 1.5, vs: 0, rho: 1.0 };

  // ======================= 一、波速、走時、S−P =======================
  /** S−P 換算係數 k = VpVs/(Vp − Vs)（km/s）：震源距離 R = k · Δt */
  function kFactor(vp, vs) { return vp * vs / (vp - vs); }
  function distanceFromSP(dt, vp, vs) { return dt * kFactor(vp, vs); }
  function spFromDistance(R, vp, vs) { return R / vs - R / vp; }
  function hypocentral(delta, h) { return Math.hypot(delta, h); }
  function epicentral(R, h) { return R > h ? Math.sqrt(R * R - h * h) : 0; }
  /** 合理的彈性固體：體積模數 K > 0 ⇔ Vp/Vs > 2/√3 */
  function validSpeeds(vp, vs) { return vp > 0 && vs > 0 && vp / vs > 2 / Math.sqrt(3); }
  /** 帕松比 ν = (r² − 2)/(2(r² − 1))，r = Vp/Vs（r = √3 → ν = 0.25） */
  function poisson(vp, vs) { const r2 = (vp / vs) * (vp / vs); return (r2 - 2) / (2 * (r2 - 1)); }
  /** 由波速與密度求彈性模數（GPa，ρ 用 g/cm³、v 用 km/s 時 ρv² 的單位正好是 GPa） */
  function moduli(vp, vs, rho) {
    const mu = rho * vs * vs, M = rho * vp * vp;
    return { mu: mu, M: M, K: M - 4 * mu / 3 };
  }
  /** 由彈性模數求波速：Vp = √((K + 4μ/3)/ρ)、Vs = √(μ/ρ) */
  function speedsFromModuli(K, mu, rho) { return { vp: Math.sqrt((K + 4 * mu / 3) / rho), vs: Math.sqrt(mu / rho) }; }

  /** 雷利方程式 f(ξ) = (2 − ξ²)² − 4√(1 − ξ²/κ²)√(1 − ξ²)，ξ = V_R/Vs、κ = Vp/Vs */
  function rayleighEq(xi, kappa) {
    const x2 = xi * xi;
    return (2 - x2) * (2 - x2) - 4 * Math.sqrt(1 - x2 / (kappa * kappa)) * Math.sqrt(1 - x2);
  }
  /** 雷利波速與 S 波速的比 ξ（0 < ξ < 1 的唯一根，二分法到機器精度） */
  function rayleighXi(kappa) {
    let lo = 0.2, hi = 1 - 1e-15; // f(ξ) < 0 在 0 附近、f(1) = 1 > 0：唯一的根
    let flo = rayleighEq(lo, kappa);
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2, fm = rayleighEq(mid, kappa);
      if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
      if (hi - lo < 1e-16) break;
    }
    return (lo + hi) / 2;
  }
  function rayleighSpeed(vp, vs) { return vs * rayleighXi(vp / vs); }
  /**
   * 雷利波的位移隨深度的分布（以地表的值正規化）。zl = 深度/波長。
   * 傳回 { h, v }：水平（徑向）與垂直分量的相對大小；地表 h = v = 1。另附地表的水平/垂直振幅比 hv。
   * 公式：r_α = √(1 − c²/α²)、r_β = √(1 − c²/β²)、k = 2π/λ
   *   U_x(z) = e^(−k r_α z) − (2 r_α r_β/(1 + r_β²)) e^(−k r_β z)
   *   U_z(z) = r_α e^(−k r_α z) − (2 r_α/(1 + r_β²)) e^(−k r_β z)
   */
  function rayleighEigen(vp, vs, zl) {
    const xi = rayleighXi(vp / vs), c2a = xi * xi * (vs * vs) / (vp * vp), c2b = xi * xi;
    const ra = Math.sqrt(1 - c2a), rb = Math.sqrt(1 - c2b), q = 1 + rb * rb, k = 2 * Math.PI;
    const ux = function (z) { return Math.exp(-k * ra * z) - (2 * ra * rb / q) * Math.exp(-k * rb * z); };
    const uz = function (z) { return ra * Math.exp(-k * ra * z) - (2 * ra / q) * Math.exp(-k * rb * z); };
    const ux0 = ux(0), uz0 = uz(0);
    return { h: ux(zl || 0) / ux0, v: uz(zl || 0) / uz0, hv: Math.abs(ux0 / uz0), xi: xi };
  }

  /** 震央距離 Δ、深度 h 的測站：各波的到達時間（起震時刻為 0） */
  function arrivals(delta, h, vp, vs) {
    const R = hypocentral(delta, h), vr = rayleighSpeed(vp, vs);
    const tP = R / vp, tS = R / vs;
    return { R: R, delta: delta, h: h, tP: tP, tS: tS, sp: tS - tP, vr: vr, tR: h / vs + delta / vr };
  }

  // ---------- 振幅（示意的趨勢）與波形 ----------
  const AMP = { S_OVER_P: 2.6, SURF: 1.5, H0: 20, R0: 8 };
  function ampP(R) { return 10 / Math.max(R, AMP.R0); }
  function ampS(R) { return AMP.S_OVER_P * ampP(R); }
  /** 表面波：震源越深越弱、離震央太近還沒發展完全 */
  function ampSurf(delta, h) {
    const d = Math.max(delta, 0);
    return AMP.SURF * 10 * Math.exp(-h / AMP.H0) / Math.sqrt(d + 10) * (1 - Math.exp(-d / (h + 5))) / 2.2;
  }
  /** 因果的小波：到達前為 0，到達後 sin(2πτ/T)·e^(−τ/τd) */
  function wavelet(tau, T, td) {
    if (!(tau > 0)) return 0;
    return Math.sin(2 * Math.PI * tau / T) * Math.exp(-tau / td);
  }
  /** 表面波的包絡（緩升、慢衰），τ = 到達後經過的時間 */
  function surfEnv(tau, rise, decay) {
    if (!(tau > 0)) return 0;
    return (1 - Math.exp(-tau / rise)) * Math.exp(-tau / decay);
  }
  const WAVE1 = { TP: 1.4, TS: 2.0, TR: 4.5, dP: 1.1, dS: 1.6, riseR: 2.5, decR: 7 };

  /**
   * 模式一：剖面上一個質點的位移（x 向右、y 向上；質點在 (x, −d)，震源在 (0, −h)）。
   * 傳回 { ux, uy, P: {ux,uy}, S: {...}, R: {...} }：P 沿射線方向（縱波）、S 垂直射線（剖面內的 SV 橫波）、
   * 表面波為雷利波的逆行橢圓（隨深度依精確的本徵函數衰減）。位移的大小是示意的相對值。
   */
  function sectionDisp(x, d, t, o) {
    const vp = o.vp, vs = o.vs, h = o.h;
    const dx = x, dy = h - d; // 由震源指向質點
    const R = Math.max(1e-9, Math.hypot(dx, dy));
    const rx = dx / R, ry = dy / R;
    const aP = ampP(R) * wavelet(t - R / vp, WAVE1.TP, WAVE1.dP);
    const aS = ampS(R) * wavelet(t - R / vs, WAVE1.TS, WAVE1.dS);
    const P = { ux: aP * rx, uy: aP * ry };
    const S = { ux: -aS * ry, uy: aS * rx };
    const Rw = { ux: 0, uy: 0 };
    const vr = o.vr || rayleighSpeed(vp, vs);
    const ad = Math.abs(x);
    const tau = t - (h / vs + ad / vr);
    if (tau > 0) {
      const lam = vr * WAVE1.TR; // 波長 = V_R × 週期
      const eg = o.eigen ? o.eigen(d / lam) : rayleighEigen(vp, vs, d / lam);
      const hv = o.hv || rayleighEigen(vp, vs, 0).hv;
      const A = ampSurf(ad, h) * surfEnv(tau, WAVE1.riseR, WAVE1.decR);
      const ph = 2 * Math.PI * tau / WAVE1.TR;
      const s = x >= 0 ? 1 : -1; // 往外傳；逆行：在波峰時質點往回（往震央方向）
      Rw.uy = A * eg.v * Math.sin(ph);
      Rw.ux = A * hv * eg.h * s * Math.cos(ph) * (1 - Math.exp(-tau / 0.6));
    }
    return { ux: P.ux + S.ux + Rw.ux, uy: P.uy + S.uy + Rw.uy, P: P, S: S, R: Rw };
  }

  // ---------- 隨機數（可重現） ----------
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
  /** 帶限雜訊（數個正弦波疊加，可重現），平均振幅約 1 */
  function makeNoise(seed, fmin, fmax, n) {
    const r = rng(seed), comps = [];
    for (let i = 0; i < (n || 9); i++) comps.push({ f: fmin + (fmax - fmin) * r(), ph: 2 * Math.PI * r(), a: 0.6 + 0.8 * r() });
    const norm = Math.sqrt(comps.reduce(function (s, c) { return s + c.a * c.a / 2; }, 0));
    return function (t) {
      let s = 0;
      for (let i = 0; i < comps.length; i++) s += comps[i].a * Math.sin(2 * Math.PI * comps[i].f * t + comps[i].ph);
      return s / norm;
    };
  }

  /**
   * 模式一的地震儀紀錄（測站在地表 x = Δ）：垂直分量 Z（上為正）與水平分量 H（徑向，離開震央為正）。
   * 直接取剖面模型中地表質點的位移，所以紀錄與畫面上的質點運動完全一致。
   */
  function station1(t, o) { const u = sectionDisp(o.delta, 0, t, o); return { z: u.uy, h: u.ux, u: u }; }

  /**
   * 模式二：一個測站的示意地震紀錄（單一分量）。s = {tP, tS, tR, R, delta, h, seed, noise}
   * P 小、S 大、表面波週期長（淺源時最大），每一相後面有尾波；到達時間精確。
   */
  function makeTrace(s) {
    const nz = makeNoise(s.seed || 1, 0.4, 2.2, 10);
    const cP = makeNoise((s.seed || 1) * 7 + 3, 0.5, 1.6, 7);
    const cS = makeNoise((s.seed || 1) * 13 + 5, 0.3, 1.0, 7);
    const aP = ampP(s.R), aS = ampS(s.R), aR = ampSurf(s.delta, s.h) * 0.9;
    const noise = (s.noise == null ? 0.04 : s.noise) * aP;
    const fn = function (t) {
      let v = noise * nz(t);
      const tp = t - s.tP, ts = t - s.tS, tr = t - s.tR;
      if (tp > 0) v += aP * (wavelet(tp, 0.7, 0.9) + 0.32 * cP(t) * (1 - Math.exp(-tp / 0.8)) * Math.exp(-tp / 9));
      if (ts > 0) v += aS * (wavelet(ts, 1.0, 1.3) + 0.38 * cS(t) * (1 - Math.exp(-ts / 1.0)) * Math.exp(-ts / 12));
      if (tr > 0) v += aR * surfEnv(tr, 2.5, 9) * Math.sin(2 * Math.PI * tr / (3.6 + 0.04 * tr));
      return v;
    };
    fn.peak = Math.max(aP, aS, aR * 0.9) * 1.25 + noise;
    return fn;
  }

  // ======================= 液體擋住 S 波：一維界面（正向入射） =======================
  /**
   * 介質 1（左）→ 介質 2（右），波阻抗 Z = ρv。位移的反射係數 r = (Z1 − Z2)/(Z1 + Z2)、透射係數 τ = 2Z1/(Z1 + Z2)。
   * 能量守恆：r² + (Z2/Z1)τ² = 1。液體中 Vs = 0（Z2 = 0）→ S 波全反射（r = 1，自由端），沒有透射波。
   */
  function interfaceCoeffs(rho1, v1, rho2, v2) {
    const Z1 = rho1 * v1, Z2 = rho2 * v2;
    const r = (Z1 - Z2) / (Z1 + Z2), tau = v2 > 0 ? 2 * Z1 / (Z1 + Z2) : 0;
    return { r: r, t: tau, Z1: Z1, Z2: Z2, Er: r * r, Et: Z1 > 0 ? Z2 / Z1 * tau * tau : 0 };
  }
  /**
   * 一維脈衝的解析解（d'Alembert）：介質 1 在 0 ≤ x ≤ L1，介質 2 在 x > L1；脈衝在 t = 0 由 x = 0 出發。
   * f(τ)：時間上的脈衝（τ < 0 為 0）。兩端不反射（吸收邊界）。
   */
  function chainDisp(x, t, L1, v1, v2, co, f) {
    if (x <= L1) {
      return f(t - x / v1) + co.r * f(t - (2 * L1 - x) / v1);
    }
    if (!(v2 > 0)) return 0;
    return co.t * f(t - L1 / v1 - (x - L1) / v2);
  }
  /** 一維界面用的脈衝：一個週期的平滑正弦（升餘弦包絡），寬度 T */
  function pulse(T) {
    return function (tau) {
      if (!(tau > 0) || tau >= T) return 0;
      return Math.sin(2 * Math.PI * tau / T) * 0.5 * (1 - Math.cos(2 * Math.PI * tau / T)) * 1.3;
    };
  }

  // ======================= 二、台灣地圖與定位 =======================
  /**
   * 經緯度 ↔ 平面 km（等距圓柱投影，以東經 121°、北緯 23.7° 為原點）。
   * 1° 緯度 = 110.754 km、1° 經度 = 101.994 km（WGS84 橢球在北緯 23.7° 的值）；台灣範圍內距離誤差 < 1.5%。
   */
  const LON0 = 121, LAT0 = 23.7;
  const KY = 111132.954e-3 - 559.822e-3 * Math.cos(2 * LAT0 * DEG) + 1.175e-3 * Math.cos(4 * LAT0 * DEG);
  const KX = 111412.84e-3 * Math.cos(LAT0 * DEG) - 93.5e-3 * Math.cos(3 * LAT0 * DEG) + 0.118e-3 * Math.cos(5 * LAT0 * DEG);
  function toXY(lon, lat) { return { x: (lon - LON0) * KX, y: (lat - LAT0) * KY }; }
  function toLonLat(x, y) { return { lon: LON0 + x / KX, lat: LAT0 + y / KY }; }
  /** 大圓距離（球半徑 6371 km），用來檢查投影誤差 */
  function greatCircle(lon1, lat1, lon2, lat2) {
    const a = Math.sin((lat2 - lat1) * DEG / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin((lon2 - lon1) * DEG / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /** 台灣本島海岸線（依經緯度自行簡化描繪的多邊形，公有領域資料不需引用；只供示意） */
  const TAIWAN = [
    [121.535, 25.297], [121.62, 25.25], [121.68, 25.20], [121.745, 25.155], [121.83, 25.13], [121.92, 25.11],
    [122.00, 25.01], [121.95, 24.97], [121.875, 24.89], [121.83, 24.76], [121.865, 24.62], [121.85, 24.52],
    [121.795, 24.43], [121.74, 24.30], [121.67, 24.16], [121.625, 24.045], [121.62, 23.96], [121.565, 23.82],
    [121.52, 23.63], [121.48, 23.45], [121.43, 23.29], [121.38, 23.11], [121.29, 22.95], [121.20, 22.82], [121.175, 22.75],
    [121.10, 22.68], [121.005, 22.58], [120.935, 22.42], [120.885, 22.27], [120.88, 22.13], [120.865, 22.00],
    [120.85, 21.90], [120.78, 21.94], [120.72, 21.925], [120.70, 22.03], [120.665, 22.18], [120.61, 22.32],
    [120.53, 22.40], [120.44, 22.48], [120.325, 22.54], [120.26, 22.63], [120.24, 22.73], [120.19, 22.86],
    [120.145, 23.00], [120.085, 23.13], [120.09, 23.26], [120.13, 23.38], [120.145, 23.50], [120.155, 23.62],
    [120.21, 23.77], [120.31, 23.92], [120.385, 24.04], [120.465, 24.17], [120.525, 24.30], [120.59, 24.43],
    [120.665, 24.55], [120.75, 24.66], [120.87, 24.77], [120.935, 24.87], [121.01, 24.98], [121.10, 25.06],
    [121.22, 25.12], [121.35, 25.16], [121.42, 25.20], [121.50, 25.285]
  ];
  /** 離島（中心經緯度與大約的半徑 km，只畫成小橢圓）；澎湖用簡化多邊形 */
  const PENGHU = [[119.52, 23.68], [119.60, 23.70], [119.69, 23.62], [119.67, 23.54], [119.61, 23.52], [119.55, 23.55], [119.50, 23.60]];
  const ISLETS = [
    { lon: 121.49, lat: 22.66, r: 3 },  // 綠島
    { lon: 121.55, lat: 22.05, r: 5 },  // 蘭嶼
    { lon: 120.37, lat: 22.34, r: 2 },  // 小琉球
    { lon: 121.95, lat: 24.84, r: 1.5 } // 龜山島
  ];
  /** 測站（中央氣象署氣象站所在城市的約略經緯度） */
  const CITIES = [
    { id: 'TPE', zh: '臺北', en: 'Taipei', lon: 121.51, lat: 25.04 },
    { id: 'HUA', zh: '花蓮', en: 'Hualien', lon: 121.61, lat: 23.98 },
    { id: 'KHH', zh: '高雄', en: 'Kaohsiung', lon: 120.32, lat: 22.57 },
    { id: 'TXG', zh: '臺中', en: 'Taichung', lon: 120.68, lat: 24.15 },
    { id: 'TTT', zh: '臺東', en: 'Taitung', lon: 121.15, lat: 22.75 },
    { id: 'HCN', zh: '恆春', en: 'Hengchun', lon: 120.75, lat: 22.00 },
    { id: 'ILA', zh: '宜蘭', en: 'Yilan', lon: 121.76, lat: 24.76 },
    { id: 'CYI', zh: '嘉義', en: 'Chiayi', lon: 120.43, lat: 23.50 },
    { id: 'HSZ', zh: '新竹', en: 'Hsinchu', lon: 121.01, lat: 24.83 },
    { id: 'TNN', zh: '臺南', en: 'Tainan', lon: 120.20, lat: 22.99 },
    { id: 'PEH', zh: '澎湖', en: 'Penghu', lon: 119.56, lat: 23.57 },
    { id: 'SML', zh: '日月潭', en: 'Sun Moon Lake', lon: 120.91, lat: 23.88 }
  ];
  /** 地圖範圍（經緯度） */
  const MAP = { lon0: 119.3, lon1: 122.45, lat0: 21.75, lat1: 25.5 };

  /** 點是否在多邊形內（射線法），poly 為 [[x, y], …] */
  function inPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function onLand(lon, lat) { return inPoly(lon, lat, TAIWAN); }

  /**
   * 隨機地震：震央在台灣本島或東部外海 60 km 內、深度 3–40 km。r 為 0–1 的亂數產生器。
   */
  function randomQuake(r) {
    for (let k = 0; k < 400; k++) {
      const lon = 120.15 + 1.95 * r(), lat = 22.1 + 3.0 * r();
      const land = onLand(lon, lat);
      // 東部外海：在海岸線東側 60 km 內（以同緯度的海岸點估計）
      let offshoreEast = false;
      if (!land) {
        const p = toXY(lon, lat);
        for (let i = 0; i < TAIWAN.length; i++) {
          const q = toXY(TAIWAN[i][0], TAIWAN[i][1]);
          if (TAIWAN[i][0] > 121.1 && Math.hypot(p.x - q.x, p.y - q.y) < 60 && p.x > q.x) { offshoreEast = true; break; }
        }
      }
      if (land || offshoreEast) return { lon: lon, lat: lat, h: Math.round((3 + 37 * r()) * 10) / 10 };
    }
    return { lon: 121, lat: 23.7, h: 10 };
  }

  /** 兩圓交點（平面）：0、1 或 2 個點 */
  function circleIntersections(x1, y1, r1, x2, y2, r2) {
    const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
    if (d < 1e-12 || d > r1 + r2 || d < Math.abs(r1 - r2)) return [];
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const hh = Math.sqrt(Math.max(0, r1 * r1 - a * a));
    const mx = x1 + a * dx / d, my = y1 + a * dy / d;
    if (hh < 1e-12) return [{ x: mx, y: my }];
    return [{ x: mx - hh * dy / d, y: my + hh * dx / d }, { x: mx + hh * dy / d, y: my - hh * dx / d }];
  }

  /**
   * 由測站與震源距離定位。st = [{ x, y, R }]（km）。
   * 傳回 { ok, x, y, h, n, candidates: [{x, y}], collinear, rms, residuals, method }
   *   n = 2：兩圓交點（把 R 當成平面上的半徑），通常有兩個可能的位置。
   *   n ≥ 3：共同弦的一次方程式做最小平方 → (x, y)；h² = 平均(R² − Δ²) → h；再用高斯－牛頓法修正 (x, y, h)。
   *   測站排成一直線時無法分辨直線兩側的鏡像位置（collinear = true，candidates 有兩個）。
   */
  function locate(st, opts) {
    opts = opts || {};
    const n = st.length;
    if (n < 2) return { ok: false, n: n, candidates: [] };
    if (n === 2) {
      const c = circleIntersections(st[0].x, st[0].y, st[0].R, st[1].x, st[1].y, st[1].R);
      return { ok: c.length > 0, n: 2, candidates: c, x: c.length ? c[0].x : NaN, y: c.length ? c[0].y : NaN, h: 0, method: 'two-circles', collinear: false };
    }
    const cs = chordSystem(st), det = cs.det, scale = cs.scale;
    // 共線判斷：測站到最佳直線的最大距離
    let mx = 0, my = 0;
    st.forEach(function (s) { mx += s.x / n; my += s.y / n; });
    let sxx = 0, sxy = 0, syy = 0;
    st.forEach(function (s) { sxx += (s.x - mx) ** 2; sxy += (s.x - mx) * (s.y - my); syy += (s.y - my) ** 2; });
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(th), uy = Math.sin(th);
    let off = 0;
    st.forEach(function (s) { off = Math.max(off, Math.abs(-(s.x - mx) * uy + (s.y - my) * ux)); });
    const collinear = off < (opts.collinearKm == null ? 2 : opts.collinearKm) || det <= 1e-10 * scale;
    let x, y;
    if (!collinear) {
      x = cs.x; y = cs.y;
    } else {
      // 共線：沿直線方向的位置由一次方程式決定，離直線的距離只知道大小（左右兩側鏡像）
      let s1 = 0, s2 = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const ai = 2 * ((st[j].x - st[i].x) * ux + (st[j].y - st[i].y) * uy);
        const pi = (st[i].x - mx) * ux + (st[i].y - my) * uy, pj = (st[j].x - mx) * ux + (st[j].y - my) * uy;
        const rhs = st[i].R * st[i].R - st[j].R * st[j].R + pj * pj - pi * pi;
        s1 += ai * ai; s2 += ai * rhs;
      }
      const u = s1 > 0 ? s2 / s1 : 0;
      let w2 = 0;
      st.forEach(function (s) { const p = (s.x - mx) * ux + (s.y - my) * uy, q = -(s.x - mx) * uy + (s.y - my) * ux; w2 += (s.R * s.R - (u - p) ** 2 - q * q) / n; });
      const w = Math.sqrt(Math.max(0, w2));
      const c1 = { x: mx + u * ux - w * uy, y: my + u * uy + w * ux }, c2 = { x: mx + u * ux + w * uy, y: my + u * uy - w * ux };
      return { ok: true, n: n, x: c1.x, y: c1.y, h: 0, candidates: [c1, c2], collinear: true, method: 'collinear' };
    }
    // 深度：h² = 平均(R² − Δ²)
    let h2 = 0;
    st.forEach(function (s) { h2 += (s.R * s.R - (s.x - x) ** 2 - (s.y - y) ** 2) / n; });
    let h = Math.sqrt(Math.max(0, h2));
    // 高斯－牛頓修正（最小化 Σ(√(Δ_i² + h²) − R_i)²），h 限制 ≥ 0
    const fitDepth = opts.fixDepth == null;
    if (opts.fixDepth != null) h = opts.fixDepth;
    for (let it = 0; it < 30; it++) {
      let J = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], g = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        const dx = x - st[i].x, dy = y - st[i].y, D = Math.sqrt(dx * dx + dy * dy + h * h) || 1e-9;
        const r = D - st[i].R, row = [dx / D, dy / D, fitDepth ? h / D : 0];
        for (let a = 0; a < 3; a++) { g[a] += row[a] * r; for (let b = 0; b < 3; b++) J[a][b] += row[a] * row[b]; }
      }
      if (!fitDepth || h < 1e-6) { J[2][2] += 1; } // 深度固定或在地表：避免奇異
      const s = solve3(J, g);
      if (!s) break;
      const lam = 1;
      x -= lam * s[0]; y -= lam * s[1];
      if (fitDepth) h = Math.max(0, h - lam * s[2]);
      if (Math.hypot(s[0], s[1], s[2]) < 1e-10) break;
    }
    const res = st.map(function (s) { return Math.sqrt((x - s.x) ** 2 + (y - s.y) ** 2 + h * h) - s.R; });
    const rms = Math.sqrt(res.reduce(function (a, r) { return a + r * r; }, 0) / n);
    return { ok: true, n: n, x: x, y: y, h: h, candidates: [{ x: x, y: y }], collinear: false, rms: rms, residuals: res, method: 'least-squares' };
  }
  /** 共同弦的一次方程式：2(x_j − x_i)x + 2(y_j − y_i)y = R_i² − R_j² + (x_j² + y_j²) − (x_i² + y_i²)，所有測站對的最小平方解 */
  function chordSystem(st) {
    const n = st.length;
    let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const ax = 2 * (st[j].x - st[i].x), ay = 2 * (st[j].y - st[i].y);
      const rhs = st[i].R * st[i].R - st[j].R * st[j].R + st[j].x * st[j].x + st[j].y * st[j].y - st[i].x * st[i].x - st[i].y * st[i].y;
      a11 += ax * ax; a12 += ax * ay; a22 += ay * ay; b1 += ax * rhs; b2 += ay * rhs;
    }
    const det = a11 * a22 - a12 * a12;
    return { det: det, scale: (a11 + a22) * (a11 + a22), x: (b1 * a22 - b2 * a12) / det, y: (a11 * b2 - a12 * b1) / det };
  }
  /**
   * 課本的作圖：n ≥ 3 個圓（以測站為圓心、震源距離 R 為半徑）兩兩的共同弦，交於震央。
   * 三個圓時三條共同弦恰好交於一點（根心）；更多圓時取最接近全部共同弦的一點。測站排成一直線時傳回 null。
   */
  function chordCenter(st) {
    if (st.length < 3) return null;
    const cs = chordSystem(st);
    if (!(Math.abs(cs.det) > 1e-10 * cs.scale)) return null;
    return { x: cs.x, y: cs.y };
  }
  /** 由震央 (x, y) 推算震源深度：每站 h² = R² − Δ²（Δ 是測站到震央的距離），取平均再開根號（平均為負時 h = 0） */
  function depthAt(st, x, y) {
    const each = st.map(function (s) { return s.R * s.R - (s.x - x) * (s.x - x) - (s.y - y) * (s.y - y); });
    const h2 = each.reduce(function (a, v) { return a + v; }, 0) / Math.max(1, st.length);
    return { h: Math.sqrt(Math.max(0, h2)), h2: h2, each: each };
  }
  /** 兩個標記與兩個可能的位置一對一配對（取較好的配法），傳回配對後較大的那個距離；數量不是 2 與 2 時傳回 Infinity */
  function pairErr(marks, cands) {
    if (!marks || !cands || marks.length !== 2 || cands.length !== 2) return Infinity;
    const d = function (a, b) { return Math.hypot(a.x - b.x, a.y - b.y); };
    return Math.min(Math.max(d(marks[0], cands[0]), d(marks[1], cands[1])), Math.max(d(marks[0], cands[1]), d(marks[1], cands[0])));
  }
  function solve3(A, b) {
    const M = A.map(function (r, i) { return r.concat([b[i]]); });
    for (let c = 0; c < 3; c++) {
      let p = c;
      for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-14) return null;
      const t = M[c]; M[c] = M[p]; M[p] = t;
      for (let r = 0; r < 3; r++) if (r !== c) {
        const f = M[r][c] / M[c][c];
        for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
      }
    }
    return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
  }
  /**
   * 三圓的「誤差三角形」：每一對圓的兩個交點中，取離估計點最近的一個。傳回三個頂點（交不到的那一對略過）。
   */
  function errorTriangle(st, ex, ey) {
    const pts = [];
    for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
      const c = circleIntersections(st[i].x, st[i].y, st[i].R, st[j].x, st[j].y, st[j].R);
      if (!c.length) continue;
      c.sort(function (p, q) { return Math.hypot(p.x - ex, p.y - ey) - Math.hypot(q.x - ex, q.y - ey); });
      pts.push(c[0]);
    }
    return pts;
  }
  /** 共同弦（兩圓交點連線）；圓不相交時傳回 null */
  function commonChord(a, b) {
    const c = circleIntersections(a.x, a.y, a.R, b.x, b.y, b.R);
    return c.length === 2 ? c : null;
  }

  // ======================= 三、地球內部：PREM 與射線追蹤 =======================
  const RE = 6371;
  const R_CMB = 3480, R_ICB = 1221.5;
  /** PREM 各區（等向版）：[r 下界, r 上界, Vp 係數, Vs 係數, 名稱]，v = a + b x + c x² + d x³，x = r/6371 */
  const PREM = [
    [0, 1221.5, [11.2622, 0, -6.3640, 0], [3.6678, 0, -4.4475, 0], 'ic'],
    [1221.5, 3480, [11.0487, -4.0362, 4.8023, -13.5732], [0, 0, 0, 0], 'oc'],
    [3480, 3630, [15.3891, -5.3181, 5.5242, -2.5514], [6.9254, 1.4672, -2.0834, 0.9783], 'lm'],
    [3630, 5600, [24.9520, -40.4673, 51.4832, -26.6419], [11.1671, -13.7818, 17.4575, -9.2777], 'lm'],
    [5600, 5701, [29.2766, -23.6027, 5.5242, -2.5514], [22.3459, -17.2473, -2.0834, 0.9783], 'lm'],
    [5701, 5771, [19.0957, -9.8672, 0, 0], [9.9839, -4.9324, 0, 0], 'um'],
    [5771, 5971, [39.7027, -32.6166, 0, 0], [22.3512, -18.5856, 0, 0], 'um'],
    [5971, 6151, [20.3926, -12.2569, 0, 0], [8.9496, -4.4597, 0, 0], 'um'],
    [6151, 6291, [4.1875, 3.9382, 0, 0], [2.1519, 2.3481, 0, 0], 'um'],
    [6291, 6346.6, [4.1875, 3.9382, 0, 0], [2.1519, 2.3481, 0, 0], 'um'],
    [6346.6, 6356, [6.8, 0, 0, 0], [3.9, 0, 0, 0], 'crust'],
    [6356, 6371, [5.8, 0, 0, 0], [3.2, 0, 0, 0], 'crust']
  ];
  function poly(c, x) { return c[0] + x * (c[1] + x * (c[2] + x * c[3])); }
  /** PREM 波速（km/s）。在界面上：below = true 取下方的值 */
  function prem(r, below) {
    for (let i = PREM.length - 1; i >= 0; i--) {
      const L = PREM[i];
      const inside = below ? (r > L[0] && r <= L[1]) || (r === 0 && L[0] === 0) : (r >= L[0] && r < L[1]) || (r === RE && L[1] === RE);
      if (inside) return { vp: poly(L[2], r / RE), vs: poly(L[3], r / RE), region: L[4] };
    }
    return { vp: NaN, vs: NaN, region: '' };
  }
  /**
   * 把地球切成常速殼層：每個 PREM 區再細分成厚度 ≤ dr 的殼層，波速取殼層中點的 PREM 值。由地表往下排列。
   */
  function buildShells(dr) {
    dr = dr || 10;
    const out = [];
    for (let i = PREM.length - 1; i >= 0; i--) {
      const L = PREM[i], n = Math.max(1, Math.ceil((L[1] - L[0]) / dr));
      for (let k = 0; k < n; k++) {
        const top = L[1] - (L[1] - L[0]) * k / n, bot = L[1] - (L[1] - L[0]) * (k + 1) / n, mid = (top + bot) / 2;
        out.push({ top: top, bot: bot, vp: poly(L[2], mid / RE), vs: poly(L[3], mid / RE), region: L[4] });
      }
    }
    return out;
  }
  /** 均勻球（測試用）：一個殼層 */
  function uniformShells(v) { return [{ top: RE, bot: 0, vp: v, vs: v / Math.sqrt(3), region: 'lm' }]; }

  /**
   * 追蹤一條由地表震源出發的射線（射線參數 p = r sin i / v，單位 s/rad；p = R sin i0 / v0）。
   * wave：'P' 或 'S'。傳回：
   *   { p, wave, blocked（S 波碰到液態外核）, delta（rad，震央角距）, time（s）, turnR（最深處半徑）,
   *     deepest（'crust' | 'um' | 'lm' | 'oc' | 'ic'）, phase, down: [[r, θ], …]（下行的路徑點）, crossings: [...] }
   * 殼層內射線為直線：通過半徑 r1 → r2 時角距增加 arccos(b/r1) − arccos(b/r2)、路徑長 √(r1² − b²) − √(r2² − b²)，b = p v。
   */
  function traceRay(shells, p, wave) {
    const down = [[RE, 0]], segV = [], crossings = [];
    let delta = 0, time = 0, turnR = 0, deepest = 'crust', blocked = false, reflected = '';
    let vPrev = null;
    for (let j = 0; j < shells.length; j++) {
      const sh = shells[j], v = wave === 'S' ? sh.vs : sh.vp;
      if (!(v > 0)) { blocked = true; turnR = sh.top; break; }
      const b = p * v;
      if (b >= sh.top) { // 進不去（全反射）：在界面轉回
        turnR = sh.top;
        if (vPrev != null && sh.region !== shells[j - 1].region) reflected = sh.region;
        break;
      }
      if (vPrev != null) crossings.push({ r: sh.top, vAbove: vPrev, vBelow: v, sinAbove: p * vPrev / sh.top, sinBelow: b / sh.top, from: shells[j - 1].region, to: sh.region, index: down.length - 1 });
      deepest = sh.region;
      if (b >= sh.bot) { // 在殼層內轉折
        delta += Math.acos(b / sh.top);
        time += Math.sqrt(sh.top * sh.top - b * b) / v;
        turnR = b;
        down.push([b, delta]); segV.push(v);
        break;
      }
      delta += Math.acos(b / sh.top) - Math.acos(b / sh.bot);
      time += (Math.sqrt(sh.top * sh.top - b * b) - Math.sqrt(sh.bot * sh.bot - b * b)) / v;
      down.push([sh.bot, delta]); segV.push(v);
      vPrev = v;
      turnR = sh.bot;
    }
    let phase;
    if (blocked) phase = 'S-blocked';
    else if (deepest === 'ic') phase = wave === 'P' ? 'PKIKP' : 'SKIKS';
    else if (deepest === 'oc') phase = reflected === 'ic' ? 'PKiKP' : 'PKP';
    else phase = wave;
    return {
      p: p, wave: wave, blocked: blocked, delta: blocked ? NaN : 2 * delta, time: blocked ? NaN : 2 * time,
      halfDelta: delta, halfTime: time, turnR: turnR, deepest: deepest, phase: phase, down: down, segV: segV, crossings: crossings
    };
  }
  /** 由出射角（自鉛直方向量起，度）求射線參數 */
  function pFromTakeoff(shells, deg, wave) {
    const v = wave === 'S' ? shells[0].vs : shells[0].vp;
    return RE * Math.sin(deg * DEG) / v;
  }
  /** 完整射線的路徑點（下行＋對稱的上行），[[r, θ], …]，θ 由震源量起（rad）；S 波被外核擋住時只有下行段 */
  function fullPath(ray) {
    const d = ray.down;
    if (ray.blocked) return d.slice();
    const out = d.slice();
    for (let i = d.length - 2; i >= 0; i--) out.push([d[i][0], ray.delta - d[i][1]]);
    return out;
  }
  /**
   * 為畫波前動畫做準備：完整路徑 pts、每段速度、每個路徑點的累積走時 cum（由各段長度 ÷ 速度累加，
   * 結果應與 traceRay 的解析走時一致，測試會檢查）。
   */
  function annotate(ray) {
    const pts = fullPath(ray), n = ray.segV.length;
    const speeds = ray.blocked ? ray.segV.slice() : ray.segV.concat(ray.segV.slice().reverse());
    const cum = [0], xy = pts.map(function (q) { return [q[0] * Math.sin(q[1]), q[0] * Math.cos(q[1])]; });
    for (let i = 1; i < pts.length; i++) {
      const len = Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
      cum.push(cum[i - 1] + len / speeds[i - 1]);
    }
    ray.pts = pts; ray.xy = xy; ray.cum = cum; ray.speeds = speeds; ray.total = cum[cum.length - 1]; ray.nDown = n;
    return ray;
  }
  /** 射線在時間 t（s）的位置 [x, y]（km，震源在 (0, R)、地心在原點、θ 往 +x）；t 超過總走時傳回 null */
  function positionAt(ray, t) {
    if (!ray.cum) annotate(ray);
    const c = ray.cum;
    if (t < 0 || t > c[c.length - 1] + 1e-9) return null;
    t = Math.min(t, c[c.length - 1]);
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= t) lo = m; else hi = m; }
    const u = c[hi] > c[lo] ? (t - c[lo]) / (c[hi] - c[lo]) : 0, a = ray.xy[lo], b = ray.xy[hi];
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  }

  /**
   * 掃描射線參數，得到各相的 (Δ, T) 走時曲線。傳回 { P: [...], S: [...], PKP: [...], PKIKP: [...], PKiKP: [...] }，
   * 每一點 { p, deg（0–180，超過 180° 的在另一側）, T }，依 p 由大到小排列。
   */
  function branches(shells, nP, nS) {
    const out = { P: [], S: [], PKP: [], PKIKP: [], PKiKP: [] };
    const v0p = shells[0].vp, v0s = shells[0].vs;
    const pmaxP = RE / v0p, pmaxS = RE / v0s;
    const cp = criticalP(shells);
    nP = nP || 1600; nS = nS || 900;
    // 均勻取樣＋在臨界射線參數（掠過核幔界面、內核界面）附近加密
    const listP = [];
    for (let i = 0; i <= nP; i++) listP.push(pmaxP * (1 - i / nP) * 0.99999);
    [cp.pGrazeP, cp.pOcIc, cp.pIc].forEach(function (pc) {
      for (let k = -40; k <= 40; k++) listP.push(pc * (1 + k * k * Math.sign(k) * 2e-6));
    });
    listP.sort(function (a, b) { return b - a; });
    listP.forEach(function (p) {
      if (!(p >= 0 && p < pmaxP)) return;
      const ray = traceRay(shells, p, 'P');
      let deg = ray.delta / DEG; if (deg > 180) deg = 360 - deg;
      (out[ray.phase] || (out[ray.phase] = [])).push({ p: p, deg: deg, T: ray.time, raw: ray.delta / DEG });
    });
    const listS = [];
    for (let i = 0; i <= nS; i++) listS.push(pmaxS * (1 - i / nS) * 0.99999);
    for (let k = 0; k <= 40; k++) listS.push(cp.pGrazeS * (1 + k * k * 2e-6));
    listS.sort(function (a, b) { return b - a; });
    listS.forEach(function (p) {
      if (!(p >= 0 && p < pmaxS)) return;
      const ray = traceRay(shells, p, 'S');
      if (ray.blocked) return;
      out.S.push({ p: p, deg: ray.delta / DEG, T: ray.time, raw: ray.delta / DEG });
    });
    return out;
  }
  /**
   * 臨界射線參數（s/rad）：
   *   pGrazeP、pGrazeS：恰好掠過核幔界面（在地函最底層轉折）的 P、S 波；比它小的 P 波進入外核、S 波被擋住。
   *   pOcIc：恰好到達內核界面的 PKP 波；pIc：恰好能進入內核的 P 波（比它小才進得去）。
   */
  function criticalP(shells) {
    let mantleBottom = null, ocBottom = null, icTop = null;
    for (let k = 0; k < shells.length; k++) {
      const s = shells[k];
      if (s.region !== 'oc' && s.region !== 'ic' && Math.abs(s.bot - R_CMB) < 1e-9) mantleBottom = s;
      if (s.region === 'oc' && Math.abs(s.bot - R_ICB) < 1e-9) ocBottom = s;
      if (s.region === 'ic' && icTop == null) icTop = s;
    }
    mantleBottom = mantleBottom || shells[shells.length - 1];
    return {
      pGrazeP: R_CMB / mantleBottom.vp, pGrazeS: R_CMB / mantleBottom.vs,
      pOcIc: ocBottom ? R_ICB / ocBottom.vp : 0, pIc: icTop ? R_ICB / icTop.vp : 0
    };
  }
  /** 黃金分割搜尋 f 在 [a, b] 的最小值 */
  function goldenMin(f, a, b, iters) {
    const g = (Math.sqrt(5) - 1) / 2;
    let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
    for (let i = 0; i < (iters || 80); i++) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
      else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
    }
    return { x: (a + b) / 2, f: Math.min(fc, fd) };
  }
  /**
   * 陰影區的邊界（度），直接由臨界射線計算（不靠取樣）：
   *   pMax：掠過核幔界面的直接 P 波角距；sMax：掠過核幔界面的直接 S 波角距；
   *   pkpMin：PKP 波的最小角距（焦散點，先密集掃描再用黃金分割求極小）；ikMin：剛進入內核的 PKIKP 角距。
   */
  function shadowZonesExact(shells) {
    const cp = criticalP(shells), e = 1e-9;
    const dP = function (p) { const r = traceRay(shells, p, 'P'); let d = r.delta / DEG; if (d > 180) d = 360 - d; return { d: d, ph: r.phase }; };
    const pMax = traceRay(shells, cp.pGrazeP * (1 + e), 'P').delta / DEG;
    const sMax = traceRay(shells, cp.pGrazeS * (1 + e), 'S').delta / DEG;
    // PKP：p 在 (pOcIc, pGrazeP) 之間
    const a = cp.pOcIc * (1 + 1e-7), b = cp.pGrazeP * (1 - 1e-7);
    let best = a, bestD = 1e9;
    for (let i = 0; i <= 600; i++) {
      const p = a + (b - a) * i / 600, q = dP(p);
      if (q.ph === 'PKP' && q.d < bestD) { bestD = q.d; best = p; }
    }
    const h = (b - a) / 600;
    const gm = goldenMin(function (p) { const q = dP(p); return q.ph === 'PKP' ? q.d : 1e9; }, Math.max(a, best - h), Math.min(b, best + h), 90);
    const ik = dP(cp.pIc * (1 - 1e-7));
    return { pMax: pMax, sMax: sMax, pkpMin: Math.min(gm.f, bestD), ikMin: ik.d, crit: cp };
  }
  /**
   * 陰影區（度）：
   *   pMax：直接 P 波（只經過地函）能到的最大角距；sMax：直接 S 波能到的最大角距；
   *   pkpMin：穿過外核的 PKP 波能到的最小角距；ikMin：穿過內核的 PKIKP 波能到的最小角距。
   *   P 波陰影區 = (pMax, pkpMin)；S 波陰影區 = (sMax, 180°]。
   */
  function shadowZones(br) {
    const maxOf = function (a) { return a.reduce(function (m, q) { return Math.max(m, q.deg); }, 0); };
    const minOf = function (a) { return a.reduce(function (m, q) { return Math.min(m, q.deg); }, 180); };
    return { pMax: maxOf(br.P), sMax: maxOf(br.S), pkpMin: minOf(br.PKP), ikMin: minOf(br.PKIKP) };
  }
  /**
   * 角距 deg（0–180）的測站收到哪些波：在每一支走時曲線上找跨過 deg 的線段並內插時間。
   * 傳回 [{ phase, T }]，依時間排序。
   */
  function arrivalsAt(br, deg, phases) {
    const out = [];
    (phases || ['P', 'PKP', 'PKIKP', 'S']).forEach(function (ph) {
      const a = br[ph] || [];
      for (let i = 1; i < a.length; i++) {
        const d0 = a[i - 1].deg, d1 = a[i].deg;
        if (Math.abs(d1 - d0) > 30) continue; // 跨過 180° 折返的不相鄰點
        if ((d0 - deg) * (d1 - deg) <= 0 && d0 !== d1) {
          const u = (deg - d0) / (d1 - d0);
          out.push({ phase: ph, T: a[i - 1].T + u * (a[i].T - a[i - 1].T) });
        }
      }
    });
    out.sort(function (x, y) { return x.T - y.T; });
    // 同一相在同一角距附近重複的點合併（曲線切成小段時可能重複）
    return out.filter(function (q, i) { return !out.slice(0, i).some(function (o) { return o.phase === q.phase && Math.abs(o.T - q.T) < 0.5; }); });
  }

  const api = {
    DEG: DEG, CRUST: CRUST, WATER: WATER, AMP: AMP, WAVE1: WAVE1,
    kFactor: kFactor, distanceFromSP: distanceFromSP, spFromDistance: spFromDistance,
    hypocentral: hypocentral, epicentral: epicentral, validSpeeds: validSpeeds, poisson: poisson,
    moduli: moduli, speedsFromModuli: speedsFromModuli,
    rayleighEq: rayleighEq, rayleighXi: rayleighXi, rayleighSpeed: rayleighSpeed, rayleighEigen: rayleighEigen,
    arrivals: arrivals, ampP: ampP, ampS: ampS, ampSurf: ampSurf, wavelet: wavelet, surfEnv: surfEnv,
    sectionDisp: sectionDisp, station1: station1, rng: rng, makeNoise: makeNoise, makeTrace: makeTrace,
    interfaceCoeffs: interfaceCoeffs, chainDisp: chainDisp, pulse: pulse,
    LON0: LON0, LAT0: LAT0, KX: KX, KY: KY, toXY: toXY, toLonLat: toLonLat, greatCircle: greatCircle,
    TAIWAN: TAIWAN, PENGHU: PENGHU, ISLETS: ISLETS, CITIES: CITIES, MAP: MAP, inPoly: inPoly, onLand: onLand,
    randomQuake: randomQuake, circleIntersections: circleIntersections, locate: locate, errorTriangle: errorTriangle, commonChord: commonChord,
    chordCenter: chordCenter, depthAt: depthAt, pairErr: pairErr,
    RE: RE, R_CMB: R_CMB, R_ICB: R_ICB, PREM: PREM, prem: prem, buildShells: buildShells, uniformShells: uniformShells,
    traceRay: traceRay, pFromTakeoff: pFromTakeoff, fullPath: fullPath, positionAt: positionAt, annotate: annotate,
    branches: branches, shadowZones: shadowZones, shadowZonesExact: shadowZonesExact, criticalP: criticalP, arrivalsAt: arrivalsAt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QuakeCore = api;
})(typeof window !== 'undefined' ? window : this);
