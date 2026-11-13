/*
 * humidity-dewpoint-core.js — 「溼度與露點」的物理核心（與畫面無關，可單獨用 Node 測試）
 *
 * 1. 飽和水氣壓：液態水面用 Murphy & Koop (2005) 式 (10)，冰面用式 (7)（與 cloud-formation 同一套）。
 *      D. M. Murphy & T. Koop, 2005: Review of the vapour pressures of ice and supercooled water for atmospheric
 *      applications. Q. J. R. Meteorol. Soc. 131, 1539–1565.
 *    相對溼度照 WMO 的定義：水氣壓 ÷ 同溫度「液態水面」的飽和水氣壓（0 °C 以下也一樣）。
 *    露點：e = e_w(Td)；霜點：e = e_i(Tf)（牛頓法）。0 °C 以下霜點比露點高，所以冷的表面先結霜。
 *    混合比 r = ε e/(p − e)、比溼 q = ε e/(p − (1 − ε) e)、絕對溼度 ρv = e/(Rv T)。
 * 2. 乾溼球溫度計（WMO《氣象儀器與觀測方法指南》WMO-No. 8，附錄 4.B）：
 *      e = e_w(Tw) − A·p·(T − Tw)
 *    通風乾溼計（阿斯曼）A = 6.53 × 10^-4 (1 + 0.000944 Tw) K^-1；
 *    放在百葉箱、沒有通風 A = 7.99 × 10^-4 K^-1（英國氣象局溼度表的百葉箱乾溼計係數）；
 *    溼球結冰（冰球）時改用冰面：e = e_i(Ti) − A_i·p·(T − Ti)，通風 A_i = 5.75 × 10^-4 K^-1，
 *    沒通風時照同樣的比例放大。由 T、e、p 反求 Tw 用二分法（左邊對 Tw 單調遞增）。
 *    溫度計讀數的變化：一階反應 dT/dt = (T平衡 − T)/τ，通風 τ = 30 s、沒通風 τ = 150 s（實際上通風乾溼計要等 2–3 分鐘才穩定）。
 * 3. 冷杯子：金屬杯裡的水被冰箱的冷水（6 °C）、冰水（0.5 °C）或冰加鹽（−9 °C）冷卻，杯溫照牛頓冷卻定律
 *    T = T浴 + (T0 − T浴) e^(−t/τ)、τ = 60 s 趨近；杯壁比露點冷就結露（0 °C 以下、比霜點冷就結霜）。
 *    看得到的水膜：凝結量 M 的變化率正比於「比露點（霜點）冷了幾度」，M 累積到 M0 才看得出起霧，
 *    所以冷得越快，看到起霧時的杯溫比真正的露點低越多；慢慢冷卻才量得準。固定 0.05 s 的子步驟，結果和畫面的影格無關。
 * 4. 一天的溫度：最低溫在日出（05:30）、最高溫在 14:00，兩段各用半個餘弦接起來；
 *    空氣裡的水氣量（e0）整天不變，除非氣溫降到露點（0 °C 以下是霜點）：多的水氣凝結成露（或霜），
 *    空氣保持飽和；日出後氣溫回升，露水蒸發回空氣，e 回到 e0。
 *
 * 單位：溫度 °C（函式內換 K）、氣壓 hPa、水氣壓 hPa、混合比 g/kg、絕對溼度 g/m³。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HumCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TK = 273.15, RD = 287.04, RV = 461.5, EPS = RD / RV, G0 = 9.80665;
  const P0 = 1013.25;                       // 海平面標準氣壓（hPa）

  // ---------- 飽和水氣壓 ----------
  /** 液態水面（hPa），Murphy & Koop (2005) 式 (10)，T 單位 °C */
  function esw(Tc) {
    const T = Tc + TK, lnT = Math.log(T);
    return Math.exp(54.842763 - 6763.22 / T - 4.210 * lnT + 0.000367 * T +
      Math.tanh(0.0415 * (T - 218.8)) * (53.878 - 1331.22 / T - 9.44523 * lnT + 0.014025 * T)) / 100;
  }
  /** 冰面（hPa），Murphy & Koop (2005) 式 (7) */
  function esi(Tc) {
    const T = Tc + TK;
    return Math.exp(9.550426 - 5723.265 / T + 3.53068 * Math.log(T) - 0.00728332 * T) / 100;
  }
  /** 會結露或結霜的那一種：0 °C 以上用水面，以下用冰面 */
  function esSurf(Tc) { return Tc >= 0 ? esw(Tc) : esi(Tc); }
  /** 反函數：f(T) = e 的溫度（牛頓法，數值微分） */
  function invert(f, e, guess) {
    if (!(e > 0)) return NaN;
    let T = guess;
    for (let i = 0; i < 40; i++) {
      const v = f(T), d = (f(T + 1e-4) - f(T - 1e-4)) / 2e-4, step = (v - e) / d;
      T -= step; if (Math.abs(step) < 1e-10) break;
    }
    return T;
  }
  function bolton(e) { const x = Math.log(e / 6.112); return 243.5 * x / (17.67 - x); }
  /** 露點（°C）：對液態水面飽和的溫度 */
  function dewPoint(e) { return invert(esw, e, bolton(e)); }
  /** 霜點（°C）：對冰面飽和的溫度 */
  function frostPoint(e) { return invert(esi, e, bolton(e) * 0.9); }
  /** 表面開始結露或結霜的溫度：露點在 0 °C 以上就是露點，否則是霜點 */
  function depositPoint(e) { const td = dewPoint(e); return td >= 0 ? td : frostPoint(e); }

  // ---------- 溼度的各種量 ----------
  function rh(Tc, e) { return e / esw(Tc); }
  function eFromRH(Tc, f) { return f * esw(Tc); }
  function mixRatio(e, p) { return 1000 * EPS * e / (p - e); }
  function specHum(e, p) { return 1000 * EPS * e / (p - (1 - EPS) * e); }
  function absHum(Tc, e) { return e * 100 / (RV * (Tc + TK)) * 1000; }
  /** 標準大氣的氣壓（hPa），對流層 0–11 km */
  function pressureAt(z) { return P0 * Math.pow(1 - 0.0065 * z / 288.15, G0 / (RD * 0.0065)); }

  // ---------- 乾溼球 ----------
  const PSY = {
    vent: { A: function (tw) { return 6.53e-4 * (1 + 0.000944 * tw); }, Ai: 5.75e-4, tau: 30 },
    still: { A: function () { return 7.99e-4; }, Ai: 5.75e-4 * 7.99 / 6.53, tau: 150 }
  };
  /** 乾溼計公式：由乾球 T、溼球 Tw、氣壓 p 算水氣壓（hPa）；溼球在 0 °C 以下當作冰球 */
  function ePsy(T, Tw, p, type) {
    const k = PSY[type || 'vent'];
    return Tw >= 0 ? esw(Tw) - k.A(Tw) * p * (T - Tw) : esi(Tw) - k.Ai * p * (T - Tw);
  }
  /** 由 T、e、p 求溼球溫度（二分法） */
  function wetBulb(T, e, p, type) {
    let lo = Math.min(dewPoint(e), T) - 30, hi = T;
    if (ePsy(T, hi, p, type) <= e) return T;
    for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (ePsy(T, m, p, type) > e) hi = m; else lo = m; }
    return (lo + hi) / 2;
  }
  /** 由乾溼球讀數算相對溼度（0–1） */
  function rhPsy(T, Tw, p, type) { return Math.max(0, ePsy(T, Tw, p, type)) / esw(T); }
  /** 查表：rows 乾球溫度、cols 乾溼球溫度差 → 相對溼度（%，四捨五入；算出來 ≤ 0 是 null） */
  function table(p, type, rows, cols) {
    return rows.map(function (T) { return cols.map(function (d) { const f = rhPsy(T, T - d, p, type); return f > 0.005 ? Math.round(f * 100) : null; }); });
  }
  /** 一階反應：從 x0 經過 dt 秒趨近 xe */
  function relax(x0, xe, dt, tau) { return xe + (x0 - xe) * Math.exp(-dt / tau); }

  // ---------- 冷杯子 ----------
  const BATH = { cold: 6, ice: 0.5, salt: -9 };       // 杯裡的水最後的溫度（°C）
  const CUP_TAU = 60;                                   // 杯壁溫度的時間常數（s）
  const CUP_M0 = 1.28;                                  // 看得出起霧的凝結量（°C·s）
  const CUP_DT = 0.05;                                  // 子步驟（s）
  /** 杯壁的凝結速率（任意單位，每秒）：正是結露（或結霜），負是蒸發 */
  function condenseRate(Tcup, e) { return (e - esSurf(Tcup)); }
  /** 新的一杯：杯溫 T0（室溫） */
  function cupInit(T0) { return { T: T0, t: 0, M: 0, acc: 0, onset: null }; }
  /** 杯子往前走 dt 秒（浴溫 bath、空氣水氣壓 e）；第一次看得出起霧時記下 onset = { T, kind: 'dew' 或 'frost', t } */
  function cupStep(c, bath, e, dt) {
    const tdw = dewPoint(e), tdi = frostPoint(e), k = Math.exp(-CUP_DT / CUP_TAU);
    c.acc += dt;
    while (c.acc >= CUP_DT - 1e-12) {
      c.acc -= CUP_DT; c.t += CUP_DT;
      c.T = bath + (c.T - bath) * k;
      const drive = (c.T < 0 ? tdi : tdw) - c.T;          // 比露點（霜點）冷了幾度
      c.M = Math.max(0, c.M + drive * CUP_DT);
      if (!c.onset && c.M >= CUP_M0) c.onset = { T: c.T, kind: c.T < 0 ? 'frost' : 'dew', t: c.t };
    }
    return c;
  }

  // ---------- 一天的溫度 ----------
  const H_MIN = 5.5, H_MAX = 14;
  /** 氣溫的形狀 −1（最低）到 +1（最高） */
  function dayShape(h) {
    h = ((h % 24) + 24) % 24;
    if (h >= H_MIN && h <= H_MAX) return -Math.cos(Math.PI * (h - H_MIN) / (H_MAX - H_MIN));
    const span = 24 - (H_MAX - H_MIN), s = h > H_MAX ? h - H_MAX : h + 24 - H_MAX;
    return Math.cos(Math.PI * s / span);
  }
  /** 一天裡某時刻的狀態：Tmean 日均溫、range 日較差、e0 水氣壓。回傳 T、e、RH、Td、是否結露／結霜、露水量（g/m³ 空氣） */
  function dayState(h, Tmean, range, e0) {
    const T = Tmean + range / 2 * dayShape(h), es = esSurf(T), e = Math.min(e0, es);
    const sat = e0 >= es;
    return { h: h, T: T, e: e, rh: rh(T, e), Td: dewPoint(e), sat: sat, frost: sat && T < 0, dew: sat ? absHum(T, e0) - absHum(T, e) : 0 };
  }
  /** 一天裡最低溫與開始結露的時刻（結不了露是 null） */
  function dayDew(Tmean, range, e0) {
    const tp = depositPoint(e0), Tmin = Tmean - range / 2;
    if (Tmin > tp) return { Tmin: Tmin, tp: tp, start: null, end: null };
    // 黃昏到清晨氣溫一路下降：二分法找 T = tp 的時刻（14:00 → 隔天 05:30）
    const T = function (s) { return Tmean + range / 2 * dayShape(H_MAX + s); }, span = 24 - (H_MAX - H_MIN);
    let lo = 0, hi = span; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (T(m) > tp) lo = m; else hi = m; }
    const start = (H_MAX + lo) % 24;
    // 早上回升：05:30 → 14:00
    const U = function (s) { return Tmean + range / 2 * dayShape(H_MIN + s); };
    lo = 0; hi = H_MAX - H_MIN; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (U(m) < tp) lo = m; else hi = m; }
    return { Tmin: Tmin, tp: tp, start: start, end: H_MIN + lo };
  }

  return {
    TK: TK, RD: RD, RV: RV, EPS: EPS, P0: P0, PSY: PSY, BATH: BATH, CUP_TAU: CUP_TAU, CUP_M0: CUP_M0, CUP_DT: CUP_DT, H_MIN: H_MIN, H_MAX: H_MAX,
    cupInit: cupInit, cupStep: cupStep,
    esw: esw, esi: esi, esSurf: esSurf, dewPoint: dewPoint, frostPoint: frostPoint, depositPoint: depositPoint,
    rh: rh, eFromRH: eFromRH, mixRatio: mixRatio, specHum: specHum, absHum: absHum, pressureAt: pressureAt,
    ePsy: ePsy, wetBulb: wetBulb, rhPsy: rhPsy, table: table, relax: relax, condenseRate: condenseRate,
    dayShape: dayShape, dayState: dayState, dayDew: dayDew
  };
});
