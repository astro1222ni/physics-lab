/*
 * tides-core.js — 潮汐物理核心（與畫面無關，可單獨用 Node 測試）
 *
 * 內容：
 *   1. 引潮力（差分重力）：某一點受天體的引力減去地心受的引力。
 *        精確式  a = GM [ (d − r)/|d − r|³ − d/|d|³ ]
 *        一階近似 a ≈ (GM/d³) [ 3 (r·d̂) d̂ − r ]   （|r| ≪ d；月下點與對蹠點 2GMR/d³，側面 −GMR/d³）
 *   2. 平衡潮理論（牛頓）：海面完全跟上引潮位能 W2 = (GM R²/d³)·P2(cos θ) 時，潮高 η = W2 / g，
 *        η = H·P2(cos θ)，H = (M/M_⊕)(R/d)³ R，P2(x) = (3x² − 1)/2，θ 是該點與月下點（或日下點）的角距離。
 *   3. 時間：太陽固定的座標（x 指向太陽、z 指向北極、太陽在天赤道上，相當於春分或秋分前後）；
 *        地球相對太陽每 24 小時自轉一圈，月球相對太陽每朔望月繞一圈（與太陽的夾角 ψ 每小時增加 360°/(24·29.53)）。
 *        月球的赤緯 δ 與距離由使用者設定，播放時不變。觀測點經度固定在東經 121°（臺灣），時間是當地的地方太陽時。
 *
 * 單位：長度 m、加速度 m/s²、時間 h（小時）、角度在參數中用「度」，內部用弧度。
 *
 * 常數來源：
 *   G = 6.6743×10^-11 N m^2 kg^-2（CODATA 2018）
 *   地球：質量 5.9722×10^24 kg、平均半徑 6371.000 km（NASA NSSDCA Earth Fact Sheet）
 *   月球：質量 0.07346×10^24 kg、軌道半長軸 384 400 km、近地點 363 300 km、遠地點 405 500 km、
 *         對地球赤道的傾角（＝最大赤緯）18.28°～28.58°（NASA NSSDCA Moon Fact Sheet）
 *   太陽：質量 1 988 400×10^24 kg（NASA NSSDCA Sun Fact Sheet）；1 AU = 149 597 870.7 km（IAU 2012 B2）
 *   朔望月 29.530 589 日（J. Meeus, Astronomical Algorithms）
 * （網頁上的上標一律用 <sup> 或在畫布上自己畫。）
 */
(function (root) {
  'use strict';

  const DEG = Math.PI / 180;
  const TAU = 2 * Math.PI;

  // ---------- 常數（SI） ----------
  const G = 6.6743e-11;
  const M_EARTH = 5.9722e24;
  const R_EARTH = 6.371e6;
  const M_MOON = 7.346e22;
  const A_MOON = 3.844e8;          // 月地平均距離（軌道半長軸）
  const PERIGEE = 3.633e8;
  const APOGEE = 4.055e8;
  const M_SUN = 1.9884e30;
  const AU = 1.495978707e11;
  const G_SURF = G * M_EARTH / (R_EARTH * R_EARTH); // 9.820 m/s²（與 NASA 的平均表面重力 9.820 一致）
  const P_SYN = 29.530589;         // 朔望月（日）
  const DEC_MAX = 28.58;           // 月球赤緯可達的最大值（18.6 年週期中的大值）
  const DEC_MAX_LOW = 18.28;       // 18.6 年週期中最大赤緯的小值
  const SITE_LON = 121;            // 觀測點的經度（東經，度）：只用來把地圖轉到正確位置

  /** 太陽固定座標中，月球與太陽的夾角 ψ 每小時增加的度數（= 360°/朔望月） */
  const PSI_RATE = 360 / (24 * P_SYN);
  /** 地球相對太陽每小時轉 15°；相對月球每小時轉 15° − PSI_RATE */
  const EARTH_RATE = 15;
  const MOON_HA_RATE = EARTH_RATE - PSI_RATE;
  /** 太陰日：月球連續兩次上中天的間隔（h） */
  const LUNAR_DAY = 360 / MOON_HA_RATE;
  /** 只有月球時，相鄰兩次高潮的間隔（半個太陰日） */
  const HIGH_INTERVAL = LUNAR_DAY / 2;

  // ---------- 向量 ----------
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function scale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function len(a) { return Math.hypot(a[0], a[1], a[2]); }
  function unit(a) { const L = len(a); return L > 0 ? scale(a, 1 / L) : [0, 0, 0]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

  /** 把角度化到 [0, 360) */
  function norm360(x) { x %= 360; return x < 0 ? x + 360 : x; }
  /** 把角度化到 (−180, 180] */
  function wrap180(x) { x = norm360(x); return x > 180 ? x - 360 : x; }

  // =====================================================================
  // 1. 引潮力
  // =====================================================================
  /** 精確的差分重力：地表（或任一）點 r（相對地心，m）受質量 M、位於 dVec（相對地心，m）的天體 */
  function tidalAccelExact(M, dVec, r) {
    const q = sub(dVec, r);
    const qd = len(q), dd = len(dVec);
    const a1 = scale(q, G * M / (qd * qd * qd));
    const a0 = scale(dVec, G * M / (dd * dd * dd));
    return sub(a1, a0);
  }
  /** 一階近似（潮汐近似）：a ≈ (GM/d³)[3(r·d̂)d̂ − r] */
  function tidalAccelApprox(M, dVec, r) {
    const d = len(dVec), dh = scale(dVec, 1 / d);
    const k = G * M / (d * d * d);
    return scale(sub(scale(dh, 3 * dot(r, dh)), r), k);
  }
  /** 月下點（或對蹠點）引潮力的大小（近似）：2GMR/d³ */
  function subPointAccel(M, d) { return 2 * G * M * R_EARTH / (d * d * d); }
  /** 平衡潮的特徵高度 H = (M/M_⊕)(R/d)³R（月下點的隆起高度；與月下點相隔 90° 處是 −H/2） */
  function eqHeight(M, d) { const k = R_EARTH / d; return (M / M_EARTH) * k * k * k * R_EARTH; }
  /** 太陽與月球（平均距離）引潮力之比：(M☉/M☾)(a☾/AU)³ ≈ 0.459 */
  function sunMoonRatio() { return (M_SUN / M_MOON) * Math.pow(A_MOON / AU, 3); }
  const H_MOON = eqHeight(M_MOON, A_MOON);  // ≈ 0.357 m
  const H_SUN = eqHeight(M_SUN, AU);         // ≈ 0.164 m

  /** 勒讓德多項式 P2 與其導數 */
  function P2(x) { return 1.5 * x * x - 0.5; }
  function dP2(x) { return 3 * x; }

  // =====================================================================
  // 2. 方向（太陽固定座標：x 指向太陽、z 指向北極）
  // =====================================================================
  /** 月球方向：與太陽的夾角 ψ（度，在天赤道上由太陽方向往東量）、赤緯 δ（度） */
  function moonDir(psi, dec) {
    const a = psi * DEG, d = dec * DEG;
    return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  }
  const SUN_DIR = [1, 0, 0];
  /** 觀測點的方位角（度，從太陽方向往東量）：地方時 12:00 時面向太陽 */
  function siteAz(lt) { return (lt - 12) * 15; }
  /** 觀測點方向：緯度（度）、地方時 lt（h） */
  function siteDir(lat, lt) {
    const p = lat * DEG, a = siteAz(lt) * DEG;
    return [Math.cos(p) * Math.cos(a), Math.cos(p) * Math.sin(a), Math.sin(p)];
  }
  /** 地表上經度 lon、緯度 lat 的點在此刻的方向（地方時 lt 是東經 SITE_LON 的地方時） */
  function geoDir(lat, lon, lt) {
    const p = lat * DEG, a = (siteAz(lt) + lon - SITE_LON) * DEG;
    return [Math.cos(p) * Math.cos(a), Math.cos(p) * Math.sin(a), Math.sin(p)];
  }

  // =====================================================================
  // 3. 平衡潮
  // =====================================================================
  /**
   * 參數 p = { dec: 月球赤緯（度）, dist: 月地距離（平均距離的倍數）, sun: 是否加入太陽 }
   * 月球的平衡潮高度 H☾ = H_MOON / dist³
   */
  function moonH(p) { const k = p.dist == null ? 1 : p.dist; return H_MOON / (k * k * k); }
  function sunH(p) { return p.sun === false ? 0 : H_SUN; }
  function moonDist(p) { return A_MOON * (p.dist == null ? 1 : p.dist); }
  /** 此刻（ψ）方向 rh 的海面高度（m）：{ moon, sun, total } */
  function heightDir(p, psi, rh) {
    const m = moonH(p) * P2(dot(rh, moonDir(psi, p.dec || 0)));
    const s = sunH(p) * P2(dot(rh, SUN_DIR));
    return { moon: m, sun: s, total: m + s };
  }
  /** 緯度 lat、地方時 lt、ψ 時觀測點的潮高（m） */
  function heightAt(p, lat, lt, psi) { return heightDir(p, psi, siteDir(lat, lt)); }

  // ---------- 時間：t（小時，從第 0 天 00:00 起算）；ψ(t) = psi0 + PSI_RATE·t ----------
  function psiAt(psi0, t) { return psi0 + PSI_RATE * t; }
  function ltAt(t) { return ((t % 24) + 24) % 24; }
  /** 觀測點在時間 t 的潮高（m）：p、緯度 lat、t = 0 時的 psi0 */
  function heightT(p, lat, psi0, t) { return heightAt(p, lat, ltAt(t), psiAt(psi0, t)).total; }
  /** 解析的時間導數 dη/dt（m/h）：dc/dt = ω_E (ẑ×r̂)·m̂ + ω_m r̂·(ẑ×m̂) */
  function dHeightDt(p, lat, psi0, t) {
    const rh = siteDir(lat, ltAt(t)), mh = moonDir(psiAt(psi0, t), p.dec || 0);
    const we = EARTH_RATE * DEG, wm = PSI_RATE * DEG;
    const zr = [-rh[1], rh[0], 0], zm = [-mh[1], mh[0], 0];
    const cm = dot(rh, mh), dcm = we * dot(zr, mh) + wm * dot(rh, zm);
    const cs = rh[0], dcs = we * zr[0];
    return moonH(p) * dP2(cm) * dcm + sunH(p) * dP2(cs) * dcs;
  }
  /** 月球的時角（度，−180～180）：0 表示月球正在觀測點的子午線上（上中天） */
  function moonHourAngle(lt, psi) { return wrap180(siteAz(lt) - psi); }
  /** t 之後（含 t）月球下一次上中天的時刻 */
  function nextTransit(psi0, t) {
    // 時角 H(t) = 15(t − 12) − psi0 − PSI_RATE·t ＝ MOON_HA_RATE·t − 180 − psi0；求 H = 360k
    const k = Math.ceil((MOON_HA_RATE * t - 180 - psi0) / 360 - 1e-12);
    return (360 * k + 180 + psi0) / MOON_HA_RATE;
  }

  /**
   * 在 [t0, t1] 中找觀測點的高潮與低潮（導數變號處，二分法求到 1e-9 h）。
   * 傳回 { highs: [{t, h}], lows: [{t, h}] }。海面完全不動時（例如極點）兩者都是空的。
   */
  function extrema(p, lat, psi0, t0, t1, step) {
    step = step || 0.2;
    const highs = [], lows = [];
    const f = function (t) { return dHeightDt(p, lat, psi0, t); };
    // 太小的導數視為零（極點等海面不動的情況，避免把數值雜訊當成高潮）
    const scaleH = Math.max(moonH(p), sunH(p), 1e-12);
    const eps = scaleH * 1e-9;
    let ta = t0, fa = f(ta);
    const n = Math.max(1, Math.ceil((t1 - t0) / step));
    for (let i = 1; i <= n; i++) {
      const tb = t0 + (t1 - t0) * i / n, fb = f(tb);
      if (Math.abs(fa) > eps || Math.abs(fb) > eps) {
        if ((fa > 0 && fb <= 0) || (fa < 0 && fb >= 0)) {
          let lo = ta, hi = tb, flo = fa;
          for (let k = 0; k < 60 && hi - lo > 1e-10; k++) {
            const mid = (lo + hi) / 2, fm = f(mid);
            if ((flo > 0) === (fm > 0) && fm !== 0) { lo = mid; flo = fm; } else hi = mid;
          }
          const tm = (lo + hi) / 2;
          const e = { t: tm, h: heightT(p, lat, psi0, tm) };
          if (fa > 0) highs.push(e); else lows.push(e);
        }
      }
      ta = tb; fa = fb;
    }
    return { highs: highs, lows: lows };
  }
  /** t 之後的第一次高潮（找不到則傳回 null） */
  function nextHigh(p, lat, psi0, t) {
    const r = extrema(p, lat, psi0, t + 1e-6, t + 2 * LUNAR_DAY);
    return r.highs.length ? r.highs[0] : null;
  }
  function nextLow(p, lat, psi0, t) {
    const r = extrema(p, lat, psi0, t + 1e-6, t + 2 * LUNAR_DAY);
    return r.lows.length ? r.lows[0] : null;
  }
  /** 以 t 為中心、一個太陰日內的最高、最低潮位與潮差（m） */
  function dayRange(p, lat, psi0, t) {
    const a = t - LUNAR_DAY / 2, b = t + LUNAR_DAY / 2;
    const r = extrema(p, lat, psi0, a, b);
    let hi = Math.max(heightT(p, lat, psi0, a), heightT(p, lat, psi0, b));
    let lo = Math.min(heightT(p, lat, psi0, a), heightT(p, lat, psi0, b));
    r.highs.forEach(function (e) { hi = Math.max(hi, e.h); });
    r.lows.forEach(function (e) { lo = Math.min(lo, e.h); });
    return { hi: hi, lo: lo, range: hi - lo, highs: r.highs, lows: r.lows };
  }
  /** 從 t 起一個太陰日內有幾次高潮（半日潮 2 次、全日潮 1 次） */
  function highsPerLunarDay(p, lat, psi0, t) {
    return extrema(p, lat, psi0, t, t + LUNAR_DAY).highs.length;
  }

  // ---------- 大潮與小潮 ----------
  /** [t0, t1] 內 ψ 經過 0°、90°、180°、270°（朔、上弦、望、下弦）的時刻：kind = 'new' | 'fq' | 'full' | 'lq' */
  function phaseEvents(psi0, t0, t1) {
    const out = [], kinds = ['new', 'fq', 'full', 'lq'];
    const k0 = Math.ceil(psiAt(psi0, t0) / 90 - 1e-12), k1 = Math.floor(psiAt(psi0, t1) / 90 + 1e-12);
    for (let k = k0; k <= k1; k++) {
      const t = (k * 90 - psi0) / PSI_RATE;
      const kind = kinds[((k % 4) + 4) % 4];
      out.push({ t: t, kind: kind, spring: kind === 'new' || kind === 'full' });
    }
    return out;
  }
  /** 月齡（日）：新月之後經過的天數 */
  function moonAge(psi) { return norm360(psi) / 360 * P_SYN; }

  // ---------- 全球的形狀 ----------
  /**
   * 此刻沿赤道一圈海面的最高減最低（m）。赤道上 η(α) = 常數 + (3/4)[H☾cos²δ cos 2(α−ψ) + H☉ cos 2α]，
   * 所以高低差 = (3/2)|H☾cos²δ e^{−2iψ} + H☉|。月球與太陽半日潮剛好抵消時為 0。
   */
  function equatorRange(p, psi) {
    const a = moonH(p) * Math.pow(Math.cos((p.dec || 0) * DEG), 2), s = sunH(p), w = -2 * psi * DEG;
    return 1.5 * Math.hypot(a * Math.cos(w) + s, a * Math.sin(w));
  }
  /** 此刻全球海面的最高與最低（數值掃描球面；用來設定畫面的誇大倍率） */
  function globalExtremes(p, psi) {
    let hi = -Infinity, lo = Infinity;
    for (let i = 0; i <= 36; i++) {
      const la = -90 + i * 5;
      for (let j = 0; j < 72; j++) {
        const lo2 = j * 5, c = Math.cos(la * DEG);
        const h = heightDir(p, psi, [c * Math.cos(lo2 * DEG), c * Math.sin(lo2 * DEG), Math.sin(la * DEG)]).total;
        if (h > hi) hi = h; if (h < lo) lo = h;
      }
    }
    return { hi: hi, lo: lo };
  }

  // ---------- 引潮力場（地表） ----------
  /**
   * 方向 rh 的地表點此刻受的引潮力（m/s²，向量）：月球（距離 dist 倍平均距離）＋太陽（1 AU，若開啟）。
   * exact = true 用精確的差分重力；否則用一階近似。
   */
  function forceDir(p, psi, rh, exact) {
    const r = scale(rh, R_EARTH);
    const fn = exact ? tidalAccelExact : tidalAccelApprox;
    let a = fn(M_MOON, scale(moonDir(psi, p.dec || 0), moonDist(p)), r);
    if (p.sun !== false) a = add(a, fn(M_SUN, scale(SUN_DIR, AU), r));
    return a;
  }
  /** 把向量分成垂直（沿 rh，向外為正）與水平分量 */
  function splitVR(a, rh) {
    const v = dot(a, rh);
    return { v: v, h: sub(a, scale(rh, v)) };
  }

  const api = {
    DEG: DEG, TAU: TAU,
    G: G, M_EARTH: M_EARTH, R_EARTH: R_EARTH, M_MOON: M_MOON, A_MOON: A_MOON, PERIGEE: PERIGEE, APOGEE: APOGEE,
    M_SUN: M_SUN, AU: AU, G_SURF: G_SURF, P_SYN: P_SYN, DEC_MAX: DEC_MAX, DEC_MAX_LOW: DEC_MAX_LOW, SITE_LON: SITE_LON,
    PSI_RATE: PSI_RATE, EARTH_RATE: EARTH_RATE, MOON_HA_RATE: MOON_HA_RATE, LUNAR_DAY: LUNAR_DAY, HIGH_INTERVAL: HIGH_INTERVAL,
    H_MOON: H_MOON, H_SUN: H_SUN, SUN_DIR: SUN_DIR,
    dot: dot, sub: sub, add: add, scale: scale, len: len, unit: unit, cross: cross, norm360: norm360, wrap180: wrap180,
    tidalAccelExact: tidalAccelExact, tidalAccelApprox: tidalAccelApprox, subPointAccel: subPointAccel,
    eqHeight: eqHeight, sunMoonRatio: sunMoonRatio, P2: P2, dP2: dP2,
    moonDir: moonDir, siteAz: siteAz, siteDir: siteDir, geoDir: geoDir,
    moonH: moonH, sunH: sunH, moonDist: moonDist, heightDir: heightDir, heightAt: heightAt,
    psiAt: psiAt, ltAt: ltAt, heightT: heightT, dHeightDt: dHeightDt, moonHourAngle: moonHourAngle, nextTransit: nextTransit,
    extrema: extrema, nextHigh: nextHigh, nextLow: nextLow, dayRange: dayRange, highsPerLunarDay: highsPerLunarDay,
    phaseEvents: phaseEvents, moonAge: moonAge, equatorRange: equatorRange, globalExtremes: globalExtremes,
    forceDir: forceDir, splitVR: splitVR
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TidesCore = api;
})(typeof window !== 'undefined' ? window : this);
