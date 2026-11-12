/* seawater-core.js — 「海水的溫度、鹽度與密度」的物理核心（與畫面無關，UMD：瀏覽器 window.SeawaterCore、Node require）
 *
 * 單位：溫度 °C、鹽度用實用鹽度（PSS-78，無單位，約等於每公斤海水含幾公克鹽）、壓力 dbar（海面 = 0；1 dbar ≈ 1 m 深）、密度 kg/m³。
 * - 狀態方程式：UNESCO 1981 國際海水狀態方程式 EOS-80（Millero & Poisson 1981；UNESCO 技術報告 36、44）。
 *   ρ(S, T, p) = ρ(S, T, 0) / (1 − p/K(S, T, p))，p 以 bar 代入（= dbar / 10）。
 * - 冰點：UNESCO 1983（Millero 1978）。
 * - 絕熱遞減率與位溫：Bryden（1973）多項式，Fofonoff（1977）四階 Runge–Kutta（UNESCO 技術報告 44 的演算法）。
 * - 深度換壓力：Saunders（1981）。
 * EOS-80 的溫度是 IPTS-68；與 ITS-90 只差約 0.024%（0–30 °C 差不到 0.01 °C），本實驗不另外換算。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SeawaterCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 狀態方程式 EOS-80 ----------
  /** 純水（SMOW）在一大氣壓的密度 */
  function rhoW(T) {
    return 999.842594 + T * (6.793952e-2 + T * (-9.095290e-3 + T * (1.001685e-4 + T * (-1.120083e-6 + T * 6.536332e-9))));
  }
  /** 一大氣壓（p = 0）的海水密度 */
  function rho0(S, T) {
    const s15 = S * Math.sqrt(S);
    return rhoW(T)
      + S * (0.824493 + T * (-4.0899e-3 + T * (7.6438e-5 + T * (-8.2467e-7 + T * 5.3875e-9))))
      + s15 * (-5.72466e-3 + T * (1.0227e-4 - T * 1.6546e-6))
      + 4.8314e-4 * S * S;
  }
  /** 割線體積模數 K（bar），p 以 bar 代入 */
  function secantK(S, T, pb) {
    const s15 = S * Math.sqrt(S);
    const Kw = 19652.21 + T * (148.4206 + T * (-2.327105 + T * (1.360477e-2 - T * 5.155288e-5)));
    const K0 = Kw + S * (54.6746 + T * (-0.603459 + T * (1.09987e-2 - T * 6.1670e-5))) + s15 * (7.944e-2 + T * (1.6483e-2 - T * 5.3009e-4));
    const Aw = 3.239908 + T * (1.43713e-3 + T * (1.16092e-4 - T * 5.77905e-7));
    const A = Aw + S * (2.2838e-3 + T * (-1.0981e-5 - T * 1.6078e-6)) + 1.91075e-4 * s15;
    const Bw = 8.50935e-5 + T * (-6.12293e-6 + T * 5.2787e-8);
    const B = Bw + S * (-9.9348e-7 + T * (2.0816e-8 + T * 9.1697e-10));
    return K0 + pb * (A + pb * B);
  }
  /** 現場密度 ρ(S, T, p)，p 單位 dbar */
  function rho(S, T, p) {
    p = p || 0;
    if (!p) return rho0(S, T);
    const pb = p / 10;
    return rho0(S, T) / (1 - pb / secantK(S, T, pb));
  }
  /** σ = ρ − 1000（海洋學慣用；σ_t 用現場溫度、σ_θ 用位溫，都是 p = 0） */
  function sigma(S, T, p) { return rho(S, T, p) - 1000; }

  /** 熱膨脹係數 α = −(1/ρ) ∂ρ/∂T 與鹽收縮係數 β = (1/ρ) ∂ρ/∂S（數值微分） */
  function alpha(S, T, p) { const h = 1e-3; return -(rho(S, T + h, p) - rho(S, T - h, p)) / (2 * h) / rho(S, T, p); }
  function beta(S, T, p) { const h = 1e-3, s = Math.max(h, S); return (rho(s + h, T, p) - rho(s - h, T, p)) / (2 * h) / rho(S, T, p); }

  /** 最大密度的溫度（p = 0）：∂ρ/∂T = 0，在 −10 到 10 °C 間用黃金分割求最大值 */
  function tMaxDensity(S) {
    let a = -10, b = 10;
    const g = (Math.sqrt(5) - 1) / 2;
    let c = b - g * (b - a), d = a + g * (b - a);
    for (let i = 0; i < 80; i++) {
      if (rho0(S, c) > rho0(S, d)) b = d; else a = c;
      c = b - g * (b - a); d = a + g * (b - a);
    }
    return (a + b) / 2;
  }

  // ---------- 冰點 ----------
  /** 海水的冰點（°C），UNESCO 1983 */
  function freezing(S, p) {
    return (-0.0575 + 1.710523e-3 * Math.sqrt(S) - 2.154996e-4 * S) * S - 7.53e-4 * (p || 0);
  }

  // ---------- 絕熱遞減率與位溫 ----------
  /** 絕熱遞減率（°C/dbar），Bryden 1973 */
  function adiabat(S, T, P) {
    const DS = S - 35;
    return (((-2.1687e-16 * T + 1.8676e-14) * T - 4.6206e-13) * P
      + ((2.7759e-12 * T - 1.1351e-10) * DS + ((-5.4481e-14 * T + 8.733e-12) * T - 6.7795e-10) * T + 1.8741e-8)) * P
      + (-4.2393e-8 * T + 1.8932e-6) * DS + ((6.6228e-10 * T - 6.836e-8) * T + 8.5258e-6) * T + 3.5803e-5;
  }
  /** 位溫：把在壓力 P（dbar）、溫度 T 的海水絕熱搬到參考壓力 PR（預設 0）時的溫度 */
  function theta(S, T, P, PR) {
    PR = PR || 0;
    const H = PR - P;
    let XK = H * adiabat(S, T, P);
    T += 0.5 * XK; let Q = XK; P += 0.5 * H;
    XK = H * adiabat(S, T, P);
    T += 0.29289322 * (XK - Q); Q = 0.58578644 * XK + 0.121320344 * Q;
    XK = H * adiabat(S, T, P);
    T += 1.707106781 * (XK - Q); Q = 3.414213562 * XK - 4.121320344 * Q;
    P += 0.5 * H;
    XK = H * adiabat(S, T, P);
    return T + (XK - 2 * Q) / 6;
  }
  /** 由位溫（參考海面）反求在壓力 P 的現場溫度（牛頓法） */
  function tFromTheta(S, th, P) {
    let T = th;
    for (let i = 0; i < 20; i++) { const e = theta(S, T, P, 0) - th; T -= e; if (Math.abs(e) < 1e-10) break; }
    return T;
  }

  // ---------- 深度 ↔ 壓力 ----------
  /** 深度（m）換壓力（dbar），Saunders 1981；lat 為緯度（度，預設 30） */
  function pressure(z, lat) {
    const s = Math.sin((lat == null ? 30 : lat) * Math.PI / 180);
    const c1 = (5.92 + 5.25 * s * s) * 1e-3;
    return ((1 - c1) - Math.sqrt((1 - c1) * (1 - c1) - 8.84e-6 * z)) / 4.42e-6;
  }

  // ---------- 混合 ----------
  /** 兩團水依質量比混合（f = B 所佔的比例）：位溫與鹽度都近似守恆，線性混合 */
  function mix(a, b, f) { return { T: a.T + (b.T - a.T) * f, S: a.S + (b.S - a.S) * f }; }

  // ---------- 典型剖面（位溫 θ 與鹽度 S 對深度；依 WOA 氣候值的大致形狀整理的示意剖面） ----------
  // 每列 [深度 m, θ °C, S]
  const PROFILES = {
    wpac: { zh: '熱帶西太平洋', en: 'Tropical western Pacific', rows: [
      [0, 29.5, 34.30], [50, 29.3, 34.40], [100, 28.0, 34.90], [150, 24.5, 35.15], [200, 18.5, 34.95], [300, 12.0, 34.70],
      [500, 8.0, 34.55], [700, 6.0, 34.50], [1000, 4.4, 34.55], [1500, 2.8, 34.60], [2000, 2.1, 34.65], [3000, 1.6, 34.68], [4000, 1.3, 34.69]] },
    natl: { zh: '北大西洋副熱帶（夏）', en: 'Subtropical North Atlantic (summer)', rows: [
      [0, 26.0, 36.60], [50, 24.0, 36.60], [100, 20.5, 36.62], [200, 18.6, 36.55], [400, 17.6, 36.45], [600, 15.0, 36.10],
      [800, 10.5, 35.45], [1000, 7.5, 35.15], [1500, 4.6, 35.00], [2000, 3.6, 34.97], [3000, 2.6, 34.93], [4000, 2.1, 34.90]] },
    npac: { zh: '北太平洋亞寒帶（冬）', en: 'Subpolar North Pacific (winter)', rows: [
      [0, 6.0, 32.60], [100, 5.8, 32.70], [150, 4.6, 33.70], [200, 4.2, 33.90], [300, 4.0, 34.00], [500, 3.6, 34.10],
      [1000, 2.9, 34.40], [2000, 1.9, 34.60], [3000, 1.6, 34.66], [4000, 1.5, 34.68]] },
    wedd: { zh: '南極威德爾海（冬）', en: 'Weddell Sea, Antarctica (winter)', rows: [
      [0, -1.85, 34.30], [100, -1.80, 34.40], [200, 0.30, 34.65], [500, 0.50, 34.68], [1000, 0.40, 34.68],
      [2000, 0.00, 34.67], [3000, -0.50, 34.66], [4000, -0.80, 34.65]] }
  };
  const Z_MAX = 4000;
  /** 剖面在深度 z 的 θ、S（線性內插） */
  function profileAt(key, z) {
    const r = PROFILES[key].rows;
    if (z <= r[0][0]) return { z: z, T: r[0][1], S: r[0][2] };
    for (let i = 1; i < r.length; i++) if (z <= r[i][0]) {
      const f = (z - r[i - 1][0]) / (r[i][0] - r[i - 1][0]);
      return { z: z, T: r[i - 1][1] + f * (r[i][1] - r[i - 1][1]), S: r[i - 1][2] + f * (r[i][2] - r[i - 1][2]) };
    }
    const l = r[r.length - 1];
    return { z: z, T: l[1], S: l[2] };
  }
  /** 剖面的 σθ（位密度，參考海面） */
  function profileSigma(key, z) { const q = profileAt(key, z); return sigma(q.S, q.T, 0); }
  /** 一團水（θ、S）放進剖面會停在哪裡：從海面往下找第一個「周圍和它一樣重」的深度（σθ 比較）。
   *  回傳 { z, where: 'surface'（比表層還輕，浮在最上面）／'mid'／'bottom'（比海底的水還重） } */
  function settle(key, T, S) {
    const s = sigma(S, T, 0);
    if (s <= profileSigma(key, 0)) return { z: 0, where: 'surface', sigma: s };
    const dz = 1;
    let prev = profileSigma(key, 0);
    for (let z = dz; z <= Z_MAX; z += dz) {
      const cur = profileSigma(key, z);
      if (cur >= s) {
        const f = (s - prev) / ((cur - prev) || 1e-12);
        return { z: z - dz + f * dz, where: 'mid', sigma: s };
      }
      prev = cur;
    }
    return { z: Z_MAX, where: 'bottom', sigma: s };
  }
  /** 剖面是否穩定（往下 σθ 不減少）的檢查：傳回最大的逆轉量 */
  function profileInversion(key) {
    let worst = 0, prev = profileSigma(key, 0);
    for (let z = 5; z <= Z_MAX; z += 5) { const c = profileSigma(key, z); worst = Math.max(worst, prev - c); prev = Math.max(prev, c); }
    return worst;
  }

  // ---------- 水團（代表性的核心值：位溫 θ °C、鹽度；Talley 等 2011《Descriptive Physical Oceanography》等的典型值，約略值） ----------
  const MASSES = [
    { id: 'aabw', zh: '南極底層水', en: 'Antarctic Bottom Water', short: 'AABW', T: -0.5, S: 34.65 },
    { id: 'nadw', zh: '北大西洋深層水', en: 'North Atlantic Deep Water', short: 'NADW', T: 2.5, S: 34.92 },
    { id: 'aaiw', zh: '南極中層水', en: 'Antarctic Intermediate Water', short: 'AAIW', T: 4.0, S: 34.25 },
    { id: 'npiw', zh: '北太平洋中層水', en: 'North Pacific Intermediate Water', short: 'NPIW', T: 5.5, S: 34.05 },
    { id: 'mw', zh: '地中海水（大西洋 1000 m）', en: 'Mediterranean Water (Atlantic, 1000 m)', short: 'MW', T: 11.8, S: 36.5 },
    { id: 'mode18', zh: '北大西洋 18 度水', en: 'Eighteen Degree Water', short: '18°', T: 18.0, S: 36.5 },
    { id: 'warmpool', zh: '西太平洋暖池表層水', en: 'Western Pacific warm-pool surface water', short: 'WP', T: 29.5, S: 34.3 },
    { id: 'kuroshio', zh: '黑潮表層水（臺灣東方）', en: 'Kuroshio surface water (east of Taiwan)', short: 'KS', T: 27.5, S: 34.5 },
    { id: 'ww', zh: '南極冬季表層水', en: 'Antarctic Winter Water', short: 'WW', T: -1.8, S: 34.3 },
    { id: 'arctic', zh: '北極表層水', en: 'Arctic surface water', short: 'ARC', T: -1.6, S: 31.5 }
  ];

  return {
    rhoW: rhoW, rho0: rho0, secantK: secantK, rho: rho, sigma: sigma, alpha: alpha, beta: beta, tMaxDensity: tMaxDensity,
    freezing: freezing, adiabat: adiabat, theta: theta, tFromTheta: tFromTheta, pressure: pressure, mix: mix,
    PROFILES: PROFILES, Z_MAX: Z_MAX, profileAt: profileAt, profileSigma: profileSigma, settle: settle, profileInversion: profileInversion,
    MASSES: MASSES
  };
});
