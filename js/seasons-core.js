/*
 * seasons-core.js — 四季與太陽軌跡的物理核心（與畫面無關，可單獨測試）
 *
 * 時間：以 2026 年（平年）為例。t = 由 2026-01-01 00:00 UT 起算的日數（可帶小數）。
 *       當地「鐘錶時間」clock（小時）與時區 zone（UTC+zone）：t = (day − 1) + (clock − zone)/24。
 *
 * 1. 地球公轉（太陽的視位置）：Meeus《Astronomical Algorithms》第 2 版第 25 章的低精度太陽座標（精度約 0.01°），
 *    但中心差不用級數，而是直接解克卜勒方程式 E − e sin E = M（橢圓軌道，離心率 e ≈ 0.0167）：
 *      M  = 357.52911° + 35999.05029° T（平近點角，T 為 J2000.0 起算的儒略世紀數）
 *      L0 = 280.46646° + 36000.76983° T（太陽平黃經）
 *      ν  = 2 atan(√((1+e)/(1−e)) tan(E/2))（真近點角），λ = L0 + (ν − M) − 0.00569°（視黃經，含光行差）
 *      R  = 1.000001018 (1 − e cos E) + 0.0000312 cos D AU（日地距離；後一項是地球中心偏離地月質心，D 為月球的平均角距）
 *    忽略章動（< 0.005°）、行星的攝動與月球造成的黃經擺動（使太陽位置偏差約 0.003°）。
 *    2026 年的近日點 1/3 17:47、遠日點 7/6 18:29（UT），與美國海軍天文臺（USNO）的 1/3 17:15、7/6 17:30 相差 1 小時以內。
 * 2. 赤道座標：sin δ = sin ε sin λ，α = atan2(cos ε sin λ, cos λ)；ε 是自轉軸傾角（預設 23.44°，可改）。
 *    均時差 E = 4 min ×（L0 − 0.0057183° − α）。
 * 3. 時角 H = 15° ×（真太陽時 − 12 h），真太陽時 = UT + 經度/15° + E。
 *    高度角 sin h = sin φ sin δ + cos φ cos δ cos H；方位角 A（由正北向東量）= atan2(−cos δ sin H, sin δ cos φ − cos δ sin φ cos H)。
 * 4. 日出日落：太陽中心高度 h0 = −0.833°（大氣折射 34′ + 太陽視半徑 16′）或 0°（幾何）。
 *    cos H0 = (sin h0 − sin φ sin δ)/(cos φ cos δ)，再用逐次修正讓 δ 取日出、日落當時的值。
 * 5. 日照：水平地面每平方公尺的功率 I = (S0/R²) sin h（S0 = 1361 W/m²，R 以 AU 為單位）；
 *    可選大氣衰減（晴天直射光）：I × 0.7^(AM^0.678)（Meinel & Meinel 1976），
 *    大氣質量 AM 用 Kasten & Young（1989）公式。一天的總量（δ、R 取當地正午的值）：
 *      不計大氣：Q = (S0/R²)(86400 s/π)(H0 sin φ sin δ + cos φ cos δ sin H0)（H0 為幾何日落時角，弧度）
 *      計大氣：對時角做辛普森積分。
 */
(function (root) {
  'use strict';

  const DEG = Math.PI / 180, RAD = 180 / Math.PI;
  const S0 = 1361;              // W/m²：太陽常數（IAU 2015 決議 B3 的名目值；Kopp & Lean 2011 量得 1360.8 ± 0.5）
  const OBLIQ = 23.44;          // 預設自轉軸傾角（IAU 2006：J2000.0 為 23.4393°，每世紀約減少 0.013°）
  const YEAR = 2026;
  const JD_Y0 = 2461041.5;      // 2026-01-01 00:00 UT 的儒略日
  const J2000 = 2451545.0;
  const DAY_S = 86400;
  const H0_REFRACT = -0.833;    // 日出日落時太陽中心的高度（含折射）
  const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const DAYS = 365;
  const EMB_AU = 4671 / 149597870.7; // 地球中心到地月質心的距離（AU）

  function norm360(x) { x %= 360; return x < 0 ? x + 360 : x; }
  function norm180(x) { x = norm360(x); return x >= 180 ? x - 360 : x; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  // ---------- 日期 ----------
  /** 第 n 天（1–365）→ { m: 1–12, d } */
  function dateOfDay(n) {
    n = Math.round(n);
    n = ((n - 1) % DAYS + DAYS) % DAYS + 1;
    let m = 0;
    while (n > MONTH_DAYS[m]) { n -= MONTH_DAYS[m]; m++; }
    return { m: m + 1, d: n };
  }
  function dayOfDate(m, d) {
    let n = d;
    for (let i = 0; i < m - 1; i++) n += MONTH_DAYS[i];
    return n;
  }
  /** 當地第 day 天、鐘錶時間 clock（h）、時區 UTC+zone → t（由 2026-01-01 00:00 UT 起算的日數） */
  function tOf(day, clock, zone) { return (day - 1) + (clock - zone) / 24; }

  // ---------- 克卜勒方程式 ----------
  function solveKepler(M, e) {
    let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
    for (let i = 0; i < 30; i++) {
      const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-15) break;
    }
    return E;
  }

  /** 地球公轉：t（日）→ 太陽的視黃經 λ、日地距離 R（AU）、平近點角 M、真近點角 ν 等 */
  function orbit(t) {
    const d = (JD_Y0 + t) - J2000;
    const T = d / 36525;
    const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
    const M = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
    const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
    const E = solveKepler(M * DEG, e);
    const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    const C = norm180(nu * RAD - M);              // 中心差
    const lambda = norm360(L0 + C - 0.00569);      // 視黃經（含光行差 −20.5″）
    // 克卜勒橢圓描述的是地月質心；地球中心離質心 4671 km（朝月球的反方向），
    // 在日地方向的分量使距離多 ΔR = 4671 km × cos D（D：月球與太陽的平均角距，新月時 D = 0、地球在質心外側）。
    // 這一項只有 ±0.00003 AU，但近日點、遠日點附近 R 變化很慢，它會把日期移動約 1 天。黃經的對應項（≤ 6.4″）忽略。
    const D = (297.8501921 + 445267.1114034 * T) * DEG;
    const R = 1.000001018 * (1 - e * Math.cos(E)) + EMB_AU * Math.cos(D); // AU
    return { t: t, L0: L0, M: M, e: e, E: E * RAD, nu: norm360(nu * RAD), C: C, lambda: lambda, R: R, peri: norm360(L0 - M) };
  }

  /** 太陽的赤經、赤緯、均時差（分鐘）；eps 為自轉軸傾角（度） */
  function sunAt(t, eps) {
    const o = orbit(t);
    const e = (eps == null ? OBLIQ : eps) * DEG, l = o.lambda * DEG;
    const dec = Math.asin(clamp(Math.sin(e) * Math.sin(l), -1, 1)) * RAD;
    const ra = norm360(Math.atan2(Math.cos(e) * Math.sin(l), Math.cos(l)) * RAD);
    const eot = 4 * norm180(o.L0 - 0.0057183 - ra);
    o.dec = dec; o.ra = ra; o.eot = eot;
    return o;
  }
  /** 世界時（小時，0–24） */
  function utHours(t) { return ((t % 1) + 1) % 1 * 24; }
  /** 格林威治的「太陽時角＋經度」基準：θ = L0 − 0.0057183° + 15°·UT − 180°（格林威治子午線的赤經，度） */
  function greenwich(t, o) { return norm360(o.L0 - 0.0057183 + 15 * utHours(t) - 180); }
  /** 經度 lon（東經為正）的時角 H（度，−180～180，下午為正） */
  function hourAngle(t, lon, o) { return norm180(greenwich(t, o) + lon - o.ra); }
  /** 直射點（太陽在天頂的地點）：緯度 = δ、經度 = −H(格林威治) */
  function subsolar(t, o) { return { lat: o.dec, lon: norm180(o.ra - greenwich(t, o)) }; }

  /** 赤道座標 → 地平座標：高度角 alt、方位角 az（由正北向東量，0–360） */
  function horizontal(lat, dec, H) {
    const p = lat * DEG, d = dec * DEG, h = H * DEG;
    const sa = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(h);
    const alt = Math.asin(clamp(sa, -1, 1)) * RAD;
    const az = norm360(Math.atan2(-Math.cos(d) * Math.sin(h), Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(h)) * RAD);
    return { alt: alt, az: az };
  }
  /** 地平座標的單位向量（東、北、上） */
  function horizVec(alt, az) {
    const a = alt * DEG, z = az * DEG;
    return [Math.cos(a) * Math.sin(z), Math.cos(a) * Math.cos(z), Math.sin(a)];
  }

  /** 某地、某時刻的太陽：o = { lat, lon, zone, day, clock, eps } */
  function sunLocal(o) {
    const t = tOf(o.day, o.clock, o.zone);
    const s = sunAt(t, o.eps);
    const H = hourAngle(t, o.lon, s);
    const hz = horizontal(o.lat, s.dec, H);
    s.H = H; s.alt = hz.alt; s.az = hz.az; s.zen = 90 - hz.alt;
    return s;
  }

  /** 太陽過子午線（正午）的鐘錶時間與高度角 */
  function transit(o) {
    const q = Object.assign({}, o);
    let c = 12 + o.zone - o.lon / 15;
    for (let i = 0; i < 4; i++) {
      q.clock = c;
      const s = sunLocal(q);
      c -= s.H / 15; // 時角每小時 15°
    }
    q.clock = c;
    const s = sunLocal(q);
    return { clock: c, alt: s.alt, dec: s.dec, R: s.R, eot: s.eot, az: s.az, formula: 90 - Math.abs(o.lat - s.dec) };
  }

  /** 日落時角 H0（度）；polar：'day'（整天在 h0 之上）、'night'（整天在下）或 null */
  function sunsetHA(lat, dec, h0) {
    const p = lat * DEG, d = dec * DEG;
    const b = Math.cos(p) * Math.cos(d), a = Math.sin(p) * Math.sin(d), s0 = Math.sin(h0 * DEG);
    if (b < 1e-12) return a > s0 ? { H0: 180, polar: 'day' } : { H0: 0, polar: 'night' };
    const c = (s0 - a) / b;
    if (c <= -1) return { H0: 180, polar: 'day' };
    if (c >= 1) return { H0: 0, polar: 'night' };
    return { H0: Math.acos(c) * RAD, polar: null };
  }

  /**
   * 日出、日落、晝長。opts.refract：true → h0 = −0.833°，false → 0°（太陽中心碰到幾何地平線）。
   * 回傳 { rise, set（鐘錶時間 h）, len（h）, polar, riseAz, setAz, noon, noonAlt, h0 }
   */
  function riseSet(o, refract) {
    const h0 = refract ? H0_REFRACT : 0;
    const tr = transit(o);
    const first = sunsetHA(o.lat, tr.dec, h0);
    const out = { noon: tr.clock, noonAlt: tr.alt, h0: h0, polar: first.polar, rise: null, set: null, len: first.polar === 'day' ? 24 : 0, riseAz: null, setAz: null };
    if (first.polar) return out;
    const q = Object.assign({}, o);
    function solve(sign) {
      // 先用正午的 δ 估計，再改用當時的 δ 與時角逐次修正（割線法解 h(c) = h0）
      let c = tr.clock + sign * first.H0 / 15;
      for (let i = 0; i < 5; i++) {
        q.clock = c;
        const s = sunLocal(q);
        const ha = sunsetHA(o.lat, s.dec, h0);
        if (ha.polar) break;
        const target = sign * ha.H0;      // 日出 H = −H0、日落 H = +H0
        const dc = norm180(target - s.H) / 15;
        c += dc;
        if (Math.abs(dc) < 1e-7) break;
      }
      q.clock = c;
      return { c: c, az: sunLocal(q).az };
    }
    const r = solve(-1), s = solve(1);
    out.rise = r.c; out.set = s.c; out.riseAz = r.az; out.setAz = s.az;
    out.len = s.c - r.c;
    return out;
  }

  // ---------- 日照 ----------
  /** 大氣質量（Kasten & Young 1989），z 為天頂角（度） */
  function airMass(z) {
    if (z > 90) return Infinity;
    return 1 / (Math.cos(z * DEG) + 0.50572 * Math.pow(96.07995 - z, -1.6364));
  }
  /** 大氣的透射比（晴天直射光，Meinel & Meinel 1976）：0.7^(AM^0.678) */
  function transmit(alt) {
    if (alt <= 0) return 0;
    return Math.pow(0.7, Math.pow(airMass(90 - alt), 0.678));
  }
  /** 水平地面每平方公尺接收的功率（W/m²） */
  function irradiance(alt, R, atmos) {
    if (alt <= 0) return 0;
    const top = S0 / (R * R);
    return top * Math.sin(alt * DEG) * (atmos ? transmit(alt) : 1);
  }
  /** 一天的總日照量（J/m²），δ、R 視為一天內不變 */
  function dailyInsolation(lat, dec, R, atmos) {
    const p = lat * DEG, d = dec * DEG;
    const a = Math.sin(p) * Math.sin(d), b = Math.cos(p) * Math.cos(d);
    const H0 = sunsetHA(lat, dec, 0).H0 * DEG;
    const S = S0 / (R * R);
    if (!atmos) return S * DAY_S / Math.PI * (H0 * a + b * Math.sin(H0));
    if (H0 <= 0) return 0;
    // 辛普森積分 2∫0^H0 I dH × (86400 s / 2π)
    const N = 96, hstep = H0 / N;
    let sum = 0;
    for (let i = 0; i <= N; i++) {
      const H = i * hstep;
      const sa = a + b * Math.cos(H);
      const alt = Math.asin(clamp(sa, -1, 1)) * RAD;
      const f = alt > 0 ? sa * transmit(alt) : 0;
      sum += f * (i === 0 || i === N ? 1 : i % 2 ? 4 : 2);
    }
    return 2 * S * (sum * hstep / 3) * DAY_S / (2 * Math.PI);
  }

  // ---------- 竿影 ----------
  /** 竿長 L 的影子：長度、指向的方位角、尖端的位置（東、北） */
  function shadow(alt, az, L) {
    L = L == null ? 1 : L;
    if (alt <= 0) return null;
    const len = L / Math.tan(alt * DEG), dir = norm360(az + 180);
    return { len: len, az: dir, x: len * Math.sin(dir * DEG), y: len * Math.cos(dir * DEG) };
  }

  // ---------- 分至與近日點 ----------
  /** 太陽視黃經等於 lam（度）的時刻（由 2026-01-01 00:00 UT 起算的日數），在 t0 附近找 */
  function timeOfLongitude(lam, t0) {
    let t = t0;
    for (let i = 0; i < 12; i++) {
      const dl = norm180(lam - orbit(t).lambda);
      t += dl / 0.98564736;
      if (Math.abs(dl) < 1e-9) break;
    }
    return t;
  }
  let seasonCache = null;
  /** 2026 年的春分、夏至、秋分、冬至、近日點、遠日點（世界時的日數 t） */
  function seasons() {
    if (seasonCache) return seasonCache;
    const mar = timeOfLongitude(0, 78), jun = timeOfLongitude(90, 171), sep = timeOfLongitude(180, 265), dec = timeOfLongitude(270, 354);
    /** 日地距離最小（sgn = −1）或最大（sgn = +1）的時刻：在 t0 ± 4 天內先粗掃、再用黃金分割找極值 */
    function extremum(t0, sgn) {
      let best = t0, bv = -Infinity;
      for (let t = t0 - 4; t <= t0 + 4; t += 0.05) { const v = sgn * orbit(t).R; if (v > bv) { bv = v; best = t; } }
      let a = best - 0.05, b = best + 0.05;
      const g = (Math.sqrt(5) - 1) / 2;
      for (let i = 0; i < 60; i++) {
        const c = b - g * (b - a), d = a + g * (b - a);
        if (sgn * orbit(c).R > sgn * orbit(d).R) b = d; else a = c;
      }
      return (a + b) / 2;
    }
    seasonCache = { mar: mar, jun: jun, sep: sep, dec: dec, peri: extremum(2.7, -1), aph: extremum(186, 1) };
    return seasonCache;
  }
  /** UT 日數 t → 當地（UTC+zone）的第幾天與鐘錶時間 */
  function localOf(t, zone) {
    const lt = t + zone / 24;
    const day = Math.floor(lt) + 1;
    return { day: day, clock: (lt - Math.floor(lt)) * 24 };
  }

  /** 課本常見的近似式：δ ≈ −ε cos(360°(N + 10)/365)（N 為一年的第幾天） */
  function approxDec(n, eps) { return -(eps == null ? OBLIQ : eps) * Math.cos(2 * Math.PI * (n + 10) / 365); }

  // ---------- 一年的曲線（每天一點，δ、R 取當地正午） ----------
  function yearCurve(o, refract, atmos) {
    const out = { Q: [], len: [], noonAlt: [], R: [], dec: [] };
    const h0 = refract ? H0_REFRACT : 0;
    for (let n = 1; n <= DAYS; n++) {
      const t = tOf(n, 12 + o.zone - o.lon / 15, o.zone);
      const s = sunAt(t, o.eps);
      out.dec.push(s.dec);
      out.R.push(s.R);
      out.noonAlt.push(90 - Math.abs(o.lat - s.dec));
      out.len.push(2 * sunsetHA(o.lat, s.dec, h0).H0 / 15);
      out.Q.push(dailyInsolation(o.lat, s.dec, s.R, atmos) / 1e6);
    }
    return out;
  }

  /**
   * 這一刻的所有讀數（頁面與任務證明共用）：o = { lat, lon, zone, day, clock, eps, refract, atmos }
   */
  function snapshot(o) {
    const s = sunLocal(o);
    const rs = riseSet(o, !!o.refract);
    const tr = transit(o);
    const sh = shadow(s.alt, s.az, 1);
    const Q = dailyInsolation(o.lat, tr.dec, tr.R, !!o.atmos) / 1e6;
    const Qeq = dailyInsolation(0, tr.dec, tr.R, !!o.atmos) / 1e6;
    return {
      lat: o.lat, lon: o.lon, zone: o.zone, day: o.day, clock: o.clock, eps: o.eps, refract: !!o.refract, atmos: !!o.atmos,
      dec: s.dec, R: s.R, eot: s.eot, H: s.H, alt: s.alt, az: s.az, zen: s.zen, lambda: s.lambda,
      up: s.alt > rs.h0,
      ratio: sh ? sh.len : Infinity, shadowAz: sh ? sh.az : null,
      noon: tr.clock, noonAlt: tr.alt, noonFormula: tr.formula,
      rise: rs.rise, set: rs.set, dayLen: rs.len, polar: rs.polar, riseAz: rs.riseAz, setAz: rs.setAz,
      I: irradiance(s.alt, s.R, !!o.atmos), Itop: irradiance(s.alt, s.R, false), S: S0 / (s.R * s.R),
      Q: Q, Qeq: Qeq
    };
  }

  const api = {
    DEG: DEG, RAD: RAD, S0: S0, OBLIQ: OBLIQ, YEAR: YEAR, DAYS: DAYS, DAY_S: DAY_S, H0_REFRACT: H0_REFRACT, MONTH_DAYS: MONTH_DAYS,
    norm360: norm360, norm180: norm180,
    dateOfDay: dateOfDay, dayOfDate: dayOfDate, tOf: tOf, localOf: localOf,
    solveKepler: solveKepler, orbit: orbit, sunAt: sunAt, utHours: utHours, greenwich: greenwich, hourAngle: hourAngle, subsolar: subsolar,
    horizontal: horizontal, horizVec: horizVec, sunLocal: sunLocal, transit: transit, sunsetHA: sunsetHA, riseSet: riseSet,
    airMass: airMass, transmit: transmit, irradiance: irradiance, dailyInsolation: dailyInsolation,
    shadow: shadow, seasons: seasons, timeOfLongitude: timeOfLongitude, approxDec: approxDec, yearCurve: yearCurve, snapshot: snapshot
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SeasonsCore = api;
})(typeof window !== 'undefined' ? window : this);
