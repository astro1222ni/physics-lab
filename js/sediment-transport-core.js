/* sediment-transport-core.js — 侵蝕、搬運與沉積：沉降速度、起動條件與 Hjulström–Sundborg 圖（純函式，Node 與瀏覽器共用）
 *
 * 水的黏度：Bingham 式（CRC 手冊）1/μ = 2.1482[(T − 8.435) + √(8078.4 + (T − 8.435)^2)] − 120（1/μ 是流動度，單位 1/泊；0–40 °C 誤差約 0.2 %），密度用 Tanaka 等人（2001）的式子。
 * 沉降速度：Ferguson & Church（2004）w = R g D^2 / (C1 ν + √(0.75 C2 R g D^3))，R = ρs/ρ − 1；C1 = 18；
 *   C2 = 0.4（光滑的球）或 1.0（天然的砂粒）。細粒趨近史托克斯定律 R g D^2/(18ν)，粗粒趨近牛頓阻力 √(4RgD/(3C2))。
 * 起動（侵蝕）：Shields 準則，臨界 Shields 數用 Soulsby & Whitehouse（1997）：
 *   θc = 0.30/(1 + 1.2D*) + 0.055(1 − e^(−0.020 D*))，D* = D (gR/ν^2)^(1/3)；τc = θc (ρs − ρ) g D。
 *   黏土與粉砂的黏聚力（凡得瓦力 ∝ D，平均到面積 ∝ 1/D^2）：τ_黏 = β/D，β = 5×10^−6 N/m（鬆散的沉積物；固結過的乘上 consol 倍）。
 * 平均流速：對數流速剖面在水深 h 上平均，U = (u* ÷ κ)(ln(h/z0) − 1)，κ = 0.41，z0 = ks/30 + ν/(9u*)，ks = 2.5D（光滑到粗糙的過渡）。
 * 沉積：移動中的顆粒，懸浮（u* > w）或推移（u* > K·u*c，K = 2/3，滾動中的顆粒比靜止的容易維持運動）都做不到時才停下來：
 *   u*_沉積 = min(w, K·u*c)。黏聚力只阻礙「挖起來」，不幫助顆粒停下來。
 * 從山到海：河道的平均流速沿途遞減 U(x) = U_sea + (U0 − U_sea)(1 − x)^1.6（x：0 山上 – 1 海口），各種大小的顆粒停在 U 降到沉積流速的地方。
 */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.SedCore = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const g = 9.81;
  const KAPPA = 0.41;
  const BETA = 5e-6;          // 黏聚力係數（N/m）
  const K_MOVE = 2 / 3;       // 移動中顆粒維持運動的門檻比例
  const RHO_QUARTZ = 2650;

  /** 水的動力黏度（Pa·s），T 是 °C */
  function mu(T) { const x = T - 8.435; return 0.1 / (2.1482 * (x + Math.sqrt(8078.4 + x * x)) - 120); }
  /** 純水的密度（kg/m^3），Tanaka et al. 2001 */
  function rhoW(T) { return 999.974950 * (1 - (T - 3.983035) * (T - 3.983035) * (T + 301.797) / (522528.9 * (T + 69.34881))); }
  /** 動黏度（m^2/s） */
  function nu(T) { return mu(T) / rhoW(T); }

  /** 沉降速度（m/s）：D（m）、R（相對浸水密度）、ν、C2（0.4 球，1.0 天然砂） */
  function settle(D, R, nuv, C2) {
    return R * g * D * D / (18 * nuv + Math.sqrt(0.75 * (C2 == null ? 1 : C2) * R * g * D * D * D));
  }
  function stokes(D, R, nuv) { return R * g * D * D / (18 * nuv); }
  function newton(D, R, C2) { return Math.sqrt(4 * R * g * D / (3 * (C2 == null ? 1 : C2))); }
  /** 顆粒雷諾數 */
  function reP(D, w, nuv) { return w * D / nuv; }

  function dstar(D, R, nuv) { return D * Math.pow(g * R / (nuv * nuv), 1 / 3); }
  /** 臨界 Shields 數（Soulsby & Whitehouse 1997） */
  function shields(Ds) { return 0.30 / (1 + 1.2 * Ds) + 0.055 * (1 - Math.exp(-0.020 * Ds)); }

  /**
   * 一種顆粒、一種水流的全部量。o：{ D（m）, h（水深 m）, T（°C）, rhoS（kg/m^3）, C2, consol（黏聚力倍數，預設 1）}
   * 傳回 { nu, R, w, Rep, Ds, theta, tauSh, tauCoh, tauC, usC（起動的 u*）, usD（沉積的 u*）, Ue（起動流速）, Ud（沉積流速） }
   */
  function grain(o) {
    const T = o.T == null ? 20 : o.T, rw = rhoW(T), nuv = mu(T) / rw;
    const R = (o.rhoS == null ? RHO_QUARTZ : o.rhoS) / rw - 1;
    const D = o.D, h = o.h == null ? 1 : o.h;
    const w = settle(D, R, nuv, o.C2);
    const Ds = dstar(D, R, nuv), th = shields(Ds);
    const tauSh = th * R * rw * g * D;
    const tauCoh = BETA * (o.consol == null ? 1 : o.consol) / D;
    const tauC = tauSh + tauCoh;
    const usC = Math.sqrt(tauC / rw);
    const usD = Math.min(w, K_MOVE * Math.sqrt(tauSh / rw));
    return {
      nu: nuv, rhoW: rw, R: R, w: w, Rep: w * D / nuv, Ds: Ds, theta: th, tauSh: tauSh, tauCoh: tauCoh, tauC: tauC,
      usC: usC, usD: usD, Ue: meanU(usC, h, D, nuv), Ud: meanU(usD, h, D, nuv)
    };
  }

  /** 水深平均流速（m/s）：剪力速度 us、水深 h、床面顆粒 D */
  function meanU(us, h, D, nuv) {
    if (us <= 0) return 0;
    const z0 = 2.5 * D / 30 + nuv / (9 * us);
    return Math.max(0, us / KAPPA * (Math.log(h / z0) - 1));
  }
  /** 反過來：平均流速 U → 剪力速度 u*（二分法；meanU 對 u* 單調遞增） */
  function shearVel(U, h, D, nuv) {
    if (U <= 0) return 0;
    let lo = 0, hi = U;
    while (meanU(hi, h, D, nuv) < U) hi *= 2;
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (meanU(mid, h, D, nuv) < U) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }

  /**
   * 河床上的顆粒在平均流速 U 下的命運。moving：顆粒本來就在水裡移動（從上游帶來的）。
   * 傳回 { us, gr: grain(), state: 'rest'（留在床上）| 'deposit'（停下來沉積）| 'bedload'（推移：滾動、跳躍）| 'suspend'（懸浮）, rouse（w/(κu*)）}
   */
  function fate(o, U, moving) {
    const gr = grain(o), h = o.h == null ? 1 : o.h;
    const us = shearVel(U, h, o.D, gr.nu);
    const going = moving ? us > gr.usD : us > gr.usC;
    let state;
    if (!going) state = moving ? 'deposit' : 'rest';
    else state = us > gr.w ? 'suspend' : 'bedload';
    return { us: us, gr: gr, state: state, rouse: us > 0 ? gr.w / (KAPPA * us) : Infinity };
  }

  /** Wentworth 粒徑分級（D 單位 m） */
  const CLASSES = [
    { id: 'clay', zh: '黏土', en: 'Clay', max: 0.0039e-3 },
    { id: 'silt', zh: '粉砂', en: 'Silt', max: 0.0625e-3 },
    { id: 'sand', zh: '砂', en: 'Sand', max: 2e-3 },
    { id: 'granule', zh: '細礫', en: 'Granule', max: 4e-3 },
    { id: 'pebble', zh: '中礫', en: 'Pebble', max: 64e-3 },
    { id: 'cobble', zh: '粗礫', en: 'Cobble', max: 256e-3 },
    { id: 'boulder', zh: '巨礫', en: 'Boulder', max: Infinity }
  ];
  function classOf(D) { for (const c of CLASSES) if (D < c.max) return c; return CLASSES[CLASSES.length - 1]; }

  /** 河流從山到海的平均流速；x 0–1 */
  const U_SEA = 0.02;
  function riverU(x, U0) { const s = Math.max(0, Math.min(1, x)); return U_SEA + (U0 - U_SEA) * Math.pow(1 - s, 1.6); }
  /**
   * 顆粒從山上出發的去處。o 同 grain（h 是河的水深），U0：山上的流速。
   * 傳回 { picked（山上挖得起來嗎）, x（停下來的位置 0–1；到海裡還沒停是 null）, gr }
   */
  function riverStop(o, U0) {
    const gr = grain(o);
    if (U0 <= gr.Ue) return { picked: false, x: 0, gr: gr };
    if (gr.Ud <= U_SEA) return { picked: true, x: null, gr: gr };
    if (gr.Ud >= U0) return { picked: true, x: 0, gr: gr };
    // (1 − x)^1.6 = (Ud − U_SEA)/(U0 − U_SEA)
    const x = 1 - Math.pow((gr.Ud - U_SEA) / (U0 - U_SEA), 1 / 1.6);
    return { picked: true, x: x, gr: gr };
  }

  /** 真實的沉積物顆粒（D 單位 m） */
  const SAMPLES = [
    { id: 'clay', zh: '黏土', en: 'Clay', D: 0.002e-3 },
    { id: 'silt', zh: '粉砂', en: 'Silt', D: 0.02e-3 },
    { id: 'fine', zh: '細砂', en: 'Fine sand', D: 0.2e-3 },
    { id: 'coarse', zh: '粗砂', en: 'Coarse sand', D: 1e-3 },
    { id: 'pebble', zh: '中礫', en: 'Pebble', D: 20e-3 },
    { id: 'cobble', zh: '粗礫', en: 'Cobble', D: 100e-3 }
  ];
  const MINERALS = [
    { id: 'quartz', zh: '石英', en: 'Quartz', rho: 2650 },
    { id: 'magnetite', zh: '磁鐵礦', en: 'Magnetite', rho: 5180 },
    { id: 'gold', zh: '金', en: 'Gold', rho: 19300 },
    { id: 'coal', zh: '煤', en: 'Coal', rho: 1350 }
  ];

  return {
    g: g, KAPPA: KAPPA, BETA: BETA, K_MOVE: K_MOVE, RHO_QUARTZ: RHO_QUARTZ, U_SEA: U_SEA,
    CLASSES: CLASSES, SAMPLES: SAMPLES, MINERALS: MINERALS,
    mu: mu, rhoW: rhoW, nu: nu, settle: settle, stokes: stokes, newton: newton, reP: reP,
    dstar: dstar, shields: shields, grain: grain, meanU: meanU, shearVel: shearVel, fate: fate,
    classOf: classOf, riverU: riverU, riverStop: riverStop
  };
});
