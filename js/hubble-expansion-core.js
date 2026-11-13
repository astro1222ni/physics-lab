/* hubble-expansion-core.js — 哈伯定律與宇宙年齡（純函式，Node 與瀏覽器共用）
 *
 * 單位：距離 Mpc（百萬秒差距，1 Mpc = 3.26156 百萬光年）；速度 km/s；哈伯常數 H0 用 km/s/Mpc；時間用 Gyr（十億年）。
 * 1/H0 = 977.792 / H0 Gyr（哈伯時間）。
 *
 * 一、膨脹：星系的共動座標 x 不變，真正的距離 r = a(t)·x；任何一個星系看別的星系，相對速度 v = (ȧ/a)·r = H·r（沒有中心）。
 *     光在途中的波長跟著宇宙一起拉長：1 + z = a(收到) / a(發出)。
 * 二、量測：近處（z < 0.03）v ≈ cz；距離用標準燭光：造父變星的週光關係 M_V = −2.43(log P − 1) − 4.05（Benedict 等 2007），
 *     Ia 型超新星的最亮絕對星等約 −19.3；距離模數 m − M = 5 log(d / 10 pc)。最小平方法（過原點）v = H0·d 解出 H0。
 *     這個模擬的宇宙用 H0 = 70，星系另有本動速度（標準差 250 km/s，截在 ±500）；本星系群的星系與真實星系用實測值。
 * 三、年齡：Friedmann 方程 H(a)² = H0²·E(a)²，E² = Ωr/a⁴ + Ωm/a³ + Ωk/a² + ΩΛ，Ωk = 1 − Ωm − ΩΛ − Ωr；
 *     年齡 t0 = ∫0^1 da / (a·H(a))；加速方程 ä/a = −(H0²/2)(2Ωr/a⁴ + Ωm/a³ − 2ΩΛ)。
 */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.HubCore = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const C_KMS = 299792.458;
  const GYR_INV_H = 977.792;          // 1 / (1 km/s/Mpc) = 977.792 Gyr
  const MLY_PER_MPC = 3.26156;
  const H0_SIM = 70;                  // 模擬宇宙的哈伯常數
  const PLANCK = { H0: 67.4, Om: 0.315, OL: 0.685 };   // Planck 2018
  const SHOES = { H0: 73.04, sH: 1.04 };               // Riess 等 2022（造父變星＋Ia 超新星）
  const EARTH_AGE = 4.54, OLDEST_STARS = 12.5;          // Gyr
  const HUBBLE_1929 = 7.2;            // 哈伯 1929 年的距離尺度，後來修正為約 7.2 倍

  /** 輻射（光子＋三種無質量微中子）的密度參數 */
  function omegaR(H0) { const h = H0 / 100; return 4.18e-5 / (h * h); }
  /** 宇宙模型：rad = false 時不計輻射 */
  function model(H0, Om, OL, rad) {
    const Or = rad === false ? 0 : omegaR(H0);
    return { H0: H0, Om: Om, OL: OL, Or: Or, Ok: 1 - Om - OL - Or };
  }
  function hubbleTime(H0) { return GYR_INV_H / H0; }
  /** F(a) = a²E(a)² = (ȧ/H0)² */
  function F(M, a) { return M.Or / (a * a) + M.Om / a + M.Ok + M.OL * a * a; }
  function E(M, a) { return Math.sqrt(Math.max(0, F(M, a))) / a; }
  /** 減速參數 q0 = Ωr + Ωm/2 − ΩΛ（負的是加速膨脹） */
  function q0(M) { return M.Or + M.Om / 2 - M.OL; }
  /** 有沒有大霹靂：0 < a ≤ 1 時 F(a) 都要大於 0，否則往回推會先反彈 */
  function hasBang(M) {
    for (let k = 1; k <= 4000; k++) { const a = k / 4000; if (F(M, a) <= 0) return false; }
    return true;
  }
  /** 將來會不會停止膨脹、收縮回來（大崩墜）：a ≥ 1 時 F(a) 會掉到 0 以下 */
  function recollapses(M) {
    for (let k = 1; k <= 600; k++) { const a = Math.pow(10, 4 * k / 600); if (F(M, a) <= 0) return true; }
    return false;
  }
  /** 從 a1 到 a2 經過的時間（Gyr）：∫ da / √F；a = u² 讓 a → 0 時平滑 */
  function timeBetween(M, a1, a2, N) {
    N = N || 2000; const u1 = Math.sqrt(a1), u2 = Math.sqrt(a2), h = (u2 - u1) / N;
    const f = function (u) { const a = u * u; return a <= 0 ? 0 : 2 * u / Math.sqrt(F(M, a)); };
    let s = f(u1) + f(u2);
    for (let i = 1; i < N; i++) s += (i % 2 ? 4 : 2) * f(u1 + i * h);
    return s * h / 3 * hubbleTime(M.H0);
  }
  /** 宇宙年齡（Gyr）；沒有大霹靂是 null */
  function age(M) { return hasBang(M) ? timeBetween(M, 0, 1) : null; }
  /** 回溯時間（Gyr）：紅移 z 的光走了多久 */
  function lookback(M, z) { return timeBetween(M, 1 / (1 + z), 1); }
  /** 開始加速膨脹時的尺度因子（不計輻射；ΩΛ ≤ 0 是 null） */
  function aAccel(M) { return M.OL > 0 ? Math.cbrt(M.Om / (2 * M.OL)) : null; }

  /** a(t) 的歷史：從現在（t = 0，a = 1）往回推到大霹靂、往後推到 tMax 或大崩墜。t 單位 Gyr。
   *  回傳 { pts: [{t, a}]（時間由小到大）, bang（大霹靂的 t，負數）, crunch（大崩墜的 t）, bounce（往回推會反彈） } */
  function history(M, tMax, tMin) {
    tMax = tMax == null ? 40 : tMax; tMin = tMin == null ? -60 : tMin;
    const Hg = M.H0 / GYR_INV_H;                       // 1/Gyr
    const acc = function (a) { return -0.5 * Hg * Hg * (2 * M.Or / (a * a * a) + M.Om / (a * a) - 2 * M.OL * a); };
    function run(dir) {
      const out = []; let a = 1, v = Hg * Math.sqrt(Math.max(0, F(M, 1))), t = 0, end = null;
      const fwd = dir > 0; out.push({ t: 0, a: 1 });
      for (let i = 0; i < 200000; i++) {
        const dt = dir * Math.min(0.02, 0.02 * a / Math.max(1e-9, Math.abs(v)));
        // RK4（a, v）
        const k1a = v, k1v = acc(a);
        const k2a = v + 0.5 * dt * k1v, k2v = acc(Math.max(1e-6, a + 0.5 * dt * k1a));
        const k3a = v + 0.5 * dt * k2v, k3v = acc(Math.max(1e-6, a + 0.5 * dt * k2a));
        const k4a = v + dt * k3v, k4v = acc(Math.max(1e-6, a + dt * k3a));
        const an = a + dt / 6 * (k1a + 2 * k2a + 2 * k3a + k4a), vn = v + dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v);
        t += dt;
        if (an <= 2e-3) {
          // 剩下一小段用積分補上（a 很小時 ODE 步長太細）
          const rest = timeBetween(M, 0, Math.max(2e-3, a), 200);
          t = t - dt + dir * rest; out.push({ t: t, a: 0 }); end = fwd ? 'crunch' : 'bang'; break;
        }
        if (!fwd && vn <= 0 && v > 0) { out.push({ t: t, a: an }); end = 'bounce'; a = an; break; }
        a = an; v = vn; out.push({ t: t, a: a });
        if (fwd ? t >= tMax : t <= tMin) break;
        if (a > 50) break;
      }
      return { pts: out, end: end, t: t };
    }
    const back = run(-1), fwd = run(1);
    const pts = back.pts.slice(1).reverse().concat(fwd.pts);
    return {
      pts: pts,
      bang: back.end === 'bang' ? back.t : null,
      bounce: back.end === 'bounce',
      crunch: fwd.end === 'crunch' ? fwd.t : null
    };
  }

  // ───── 標準燭光 ─────
  /** 造父變星的週光關係（V 波段絕對星等）；P 單位天 */
  function cepheidM(P) { return -2.43 * (Math.log10(P) - 1) - 4.05; }
  const SN_M = -19.3;
  function distMod(dMpc) { return 5 * Math.log10(dMpc * 1e6) - 5; }
  function distFromMod(mu) { return Math.pow(10, (mu + 5) / 5) / 1e6; }

  // ───── 決定性的亂數 ─────
  function hash(a, b) {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  /** 標準常態亂數（Box–Muller），種子 seed、序號 k */
  function gauss(seed, k) {
    const u1 = Math.max(1e-12, hash(seed, 2 * k + 1)), u2 = hash(seed + 7919, 2 * k + 2);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // ───── 星系目錄 ─────
  // 真實星系：距離（Mpc）與日心速度（km/s），取自 NASA/IPAC 河外星系資料庫（NED）的代表值
  const REAL = [
    { id: 'm31', zh: '仙女座星系 M31', en: 'Andromeda M31', d: 0.765, v: -300, x: 0.12, y: 0.22, type: 'S', size: 1.6, local: true },
    { id: 'm33', zh: '三角座星系 M33', en: 'Triangulum M33', d: 0.84, v: -179, x: 0.27, y: 0.62, type: 'S', size: 1.15, local: true },
    { id: 'm81', zh: '波德星系 M81', en: 'Bode’s Galaxy M81', d: 3.6, v: -34, x: 0.46, y: 0.16, type: 'S', size: 1.0 },
    { id: 'm101', zh: '風車星系 M101', en: 'Pinwheel M101', d: 6.4, v: 241, x: 0.71, y: 0.28, type: 'S', size: 1.05 },
    { id: 'n4258', zh: 'NGC 4258（M106）', en: 'NGC 4258 (M106)', d: 7.6, v: 448, x: 0.87, y: 0.55, type: 'S', size: 0.85 },
    { id: 'm87', zh: '室女座星系團 M87', en: 'Virgo cluster M87', d: 16.4, v: 1284, x: 0.57, y: 0.72, type: 'E', size: 0.8 },
    { id: 'coma', zh: '后髮座星系團', en: 'Coma cluster', d: 99, v: 6925, x: 0.9, y: 0.86, type: 'E', size: 0.42 }
  ];
  const N_SYN = 21, SEED_CAT = 1929;
  function buildCatalog() {
    const list = REAL.map(function (g) { return Object.assign({ real: true }, g); });
    const taken = list.map(function (g) { return [g.x, g.y]; });
    for (let i = 0; i < N_SYN; i++) {
      // 距離大致對數均勻地分布在 2–120 Mpc
      const d = Math.round(2 * Math.pow(60, (i + 0.5 * hash(SEED_CAT, i)) / N_SYN) * 10) / 10;
      let x = 0, y = 0;
      for (let tr = 0; tr < 200; tr++) {
        x = 0.06 + 0.88 * hash(SEED_CAT + 1, i * 211 + tr); y = 0.08 + 0.84 * hash(SEED_CAT + 2, i * 211 + tr);
        let ok = true; for (const p of taken) if (Math.hypot(p[0] - x, (p[1] - y) * 0.75) < 0.11) { ok = false; break; }
        if (ok) break;
      }
      taken.push([x, y]);
      const vpec = Math.round(250 * Math.max(-2, Math.min(2, gauss(SEED_CAT + 3, i))));   // 截在 ±2σ
      list.push({ id: 'g' + String(i + 1).padStart(2, '0'), zh: '星系 G-' + String(i + 1).padStart(2, '0'), en: 'Galaxy G-' + String(i + 1).padStart(2, '0'),
        d: d, v: Math.round(H0_SIM * d + vpec), x: x, y: y, type: hash(SEED_CAT + 4, i) < 0.65 ? 'S' : 'E', size: 0.55 + 0.5 * hash(SEED_CAT + 5, i), real: false });
    }
    return list;
  }
  const CATALOG = buildCatalog();

  /** 量距離的方法：σ 是距離模數的誤差（星等），reach 是最遠能用的真實距離（Mpc），scale 是距離尺度的系統誤差 */
  const METHODS = [
    { id: 'hubble', zh: '哈伯 1929 年的尺度', en: 'Hubble’s 1929 scale', sigma: 0.35, reach: 20, scale: 1 / HUBBLE_1929 },
    { id: 'cepheid', zh: '造父變星（哈伯太空望遠鏡）', en: 'Cepheids (Hubble Space Telescope)', sigma: 0.15, reach: 40, scale: 1 },
    { id: 'sn', zh: 'Ia 型超新星', en: 'Type Ia supernova', sigma: 0.12, reach: 1e9, min: 5, scale: 1 }
  ];
  const METHOD = {}; METHODS.forEach(function (m) { METHOD[m.id] = m; });
  /** 這個方法能不能量這個星系 */
  function canMeasure(g, mid) { const m = METHOD[mid]; return g.d <= m.reach && g.d >= (m.min || 0); }
  /** 造父變星的週期（天）：每個星系固定一顆 */
  function cepPeriod(i) { return Math.round((8 + 52 * hash(77, i)) * 10) / 10; }

  /** 量一個星系：回傳 { d（量到的距離 Mpc）, sd（誤差）, v（量到的速度）, z, m（視星等）, M（絕對星等）, P（造父變星週期） } */
  function measure(i, mid) {
    const g = CATALOG[i], m = METHOD[mid];
    if (!g || !m || !canMeasure(g, mid)) return null;
    const k = METHODS.indexOf(m);
    const err = m.sigma * gauss(4242 + k, i);
    const muTrue = distMod(g.d);
    let M, P = null;
    if (mid === 'sn') M = SN_M; else { P = cepPeriod(i); M = cepheidM(P); }
    const mApp = M + muTrue + err;
    // 哈伯 1929 年的尺度：絕對星等的零點錯了，距離模數少了 5 log(7.2)
    const mu = mApp - M + 5 * Math.log10(m.scale);
    const d = distFromMod(mu), sd = d * Math.LN10 / 5 * m.sigma;
    const z = (1 + g.v / C_KMS) * (1 + 1e-4 * gauss(999, i)) - 1;     // 光譜的誤差約 30 km/s
    return { d: d, sd: sd, v: C_KMS * z, z: z, m: mApp, M: M, P: P, mu: mu };
  }

  /** 過原點的最小平方法 v = H·d：回傳 { H, sH, n, age1（1/H，Gyr）, ageL（Planck 的 Ωm、ΩΛ 時的年齡）, chi } */
  function fitH(pts) {
    const n = pts.length; if (n < 1) return null;
    let sdd = 0, svd = 0; pts.forEach(function (p) { sdd += p.d * p.d; svd += p.v * p.d; });
    if (sdd <= 0) return null;
    const H = svd / sdd; let rss = 0; pts.forEach(function (p) { rss += (p.v - H * p.d) * (p.v - H * p.d); });
    const sH = n >= 2 ? Math.sqrt(rss / (n - 1) / sdd) : null;
    return { H: H, sH: sH, n: n, rms: Math.sqrt(rss / n), age1: H > 0 ? hubbleTime(H) : null,
      ageL: H > 0 ? age(model(H, PLANCK.Om, PLANCK.OL)) : null };
  }

  // ───── 膨脹的盒子 ─────
  /** 共動格子上的星系（0–1 的盒子），種子固定 */
  function boxGalaxies(n) {
    n = n || 7; const out = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const k = i * n + j;
      out.push({ x: (i + 0.5 + 0.55 * (hash(31, k) - 0.5)) / n - 0.5, y: (j + 0.5 + 0.55 * (hash(32, k) - 0.5)) / n - 0.5, s: 0.6 + 0.6 * hash(33, k), type: hash(34, k) < 0.6 ? 'S' : 'E' });
    }
    return out;
  }
  /** 光在膨脹的宇宙裡走：共動距離 dχ/dt = c/a。盒子單位：共動距離 L，a(τ) 由呼叫者給。
   *  這裡給一個簡單的版本：a(τ) = a0 + k·τ，從 χ0 走到 0 要多久（解析解）與到達時的 a。 */
  function lightTrip(chi0, a0, k, c) {
    // ∫ c dτ / (a0 + kτ) = (c/k) ln(a1/a0) = chi0 → a1 = a0·exp(k chi0 / c)
    if (Math.abs(k) < 1e-12) return { a1: a0, tau: chi0 * a0 / c };
    const a1 = a0 * Math.exp(k * chi0 / c);
    return { a1: a1, tau: (a1 - a0) / k };
  }

  return {
    C_KMS: C_KMS, GYR_INV_H: GYR_INV_H, MLY_PER_MPC: MLY_PER_MPC, H0_SIM: H0_SIM, PLANCK: PLANCK, SHOES: SHOES,
    EARTH_AGE: EARTH_AGE, OLDEST_STARS: OLDEST_STARS, HUBBLE_1929: HUBBLE_1929,
    omegaR: omegaR, model: model, hubbleTime: hubbleTime, F: F, E: E, q0: q0, hasBang: hasBang, timeBetween: timeBetween,
    age: age, lookback: lookback, recollapses: recollapses, aAccel: aAccel, history: history,
    cepheidM: cepheidM, SN_M: SN_M, distMod: distMod, distFromMod: distFromMod, hash: hash, gauss: gauss,
    REAL: REAL, CATALOG: CATALOG, METHODS: METHODS, METHOD: METHOD, canMeasure: canMeasure, cepPeriod: cepPeriod, measure: measure, fitH: fitH,
    boxGalaxies: boxGalaxies, lightTrip: lightTrip
  };
});
