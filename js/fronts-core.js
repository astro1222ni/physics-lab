/*
 * fronts-core.js — 「冷鋒、暖鋒與梅雨鋒面」的物理核心（與畫面無關，可單獨用 Node 測試）
 *
 * 剖面模型（垂直於鋒面的二維剖面）：冷氣團像楔子躲在暖氣團下面，交界面（鋒面面）是一個斜面，
 *   坡度 tan α（冷鋒約 1/50–1/100、暖鋒約 1/150–1/300、梅雨鋒面約 1/100）。
 *   s ＝ 從地面的鋒面線往冷氣團那一邊量的距離（km）；s > 0 的地方頭上有冷空氣，鋒面面的高度 h(s) = s·tan α。
 * 1. 暖空氣沿鋒面面爬升：相對鋒面的風速 V（m/s）爬上坡度 tan α，上升速度 w = V·tan α。
 * 2. 暖空氣的氣塊：地面氣溫 T、露點 Td；舉升凝結高度照 Bolton (1980) 式 15 的 T_LCL，
 *      z_LCL = (T − T_LCL)/Γd，Γd = g/cp = 9.77 K/km；
 *    以上照（假）溼絕熱減溫率 Γm = g (1 + r)(1 + Lv r/(Rd T)) / (cp + r c_pv + Lv² r (ε + r)/(Rd T²))（AMS 氣象辭典；L = 2.501 × 10^6 − 2370·T J/kg 隨溫度變）一路積分到 Z_TOP（對流層頂 10 km），
 *    凝結高度以下的乾絕熱用溼空氣的比熱 g(1 + r)/(cp + r c_pv)；氣壓照靜力平衡 dp/dz = −p g/(Rd Tv)（虛溫）。
 *    檢查：沿著溼絕熱，Bolton 的相當位溫守恆到 0.3 K 以內（單元測試）。飽和水氣壓用 Bolton 公式，混合比 r = ε e/(p − e)。
 * 3. 雲底 z_b = max(z_LCL, h(s))（雲長在鋒面面之上、凝結高度之上）；z_b < Z_TOP 就有雲。
 *    整根氣柱以 w 上升，凝結率對高度積分：降水率 R = ρ(z_b)·w·[r(z_b) − r_s(Z_TOP)]（kg m⁻² s⁻¹ = mm/s）。
 *    雲底 ≤ Z_RAIN = 2 km 雨才落得到地面（再高的雲下的雨在冷空氣裡蒸發掉，成為雨幡）。
 *    雲的種類依雲底高度：≤ 2 km 是會下雨的雲（w ≥ 0.1 m/s 的強烈抬升是積雨雲，否則雨層雲）、2–6 km 高層雲、6 km 以上卷層雲與卷雲。
 *    （真正的大氣還要看穩定度；這裡用抬升速度簡化。）
 * 4. 地面氣壓：頭上的冷空氣比同高度的暖空氣重，靜力平衡多出 Δp = g·h·(ρc − ρw)，ρ = p/(Rd T)；冷氣團的厚度通常只有 1–3 km（再往上兩邊的溫差就小了），所以冷空氣深度最多算到 H_CAP = 2.5 km。
 *    所以冷鋒過境氣壓上升、暖鋒接近時氣壓下降。
 * 5. 測站：鋒面線以 U（km/h）移動；冷鋒從測站西邊 120 km、梅雨鋒面從北邊 30 km、暖鋒從雲最前緣再遠 40 km（最多 1500 km）開始。冷鋒與梅雨鋒面往暖空氣那邊推（測站的 s 隨時間增加），
 *    暖鋒往冷空氣那邊推（s 隨時間減少）。測站的氣溫、露點在鋒面線前後 ±8 km 內平滑地換成另一個氣團的值。
 *    風向（北半球）：冷鋒前西南風、後西北風；暖鋒前東南風、後西南風；梅雨鋒面南邊西南風、北邊東北風。
 * 6. Margules 公式（地轉平衡下兩個氣團交界面的坡度）：tan α = f·T̄·Δv / (g·ΔT)，f = 2Ω sin φ；
 *    反過來：要撐住坡度 tan α，兩邊沿鋒面的風要差 Δv = g ΔT tan α /(f T̄)。
 *
 * 單位：溫度 °C、距離 km、高度 m、時間 h、風速 m/s（U 用 km/h）、氣壓 hPa、降水率 mm/h、雨量 mm。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FrontCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const TK = 273.15, G = 9.80665, RD = 287.04, RV = 461.5, CP = 1005.7, CPV = 1870, LV = 2.501e6, EPS = RD / RV;
  const GAMMA_D = G / CP;                  // 9.75 K/km
  const Z_TOP = 10000, Z_RAIN = 2000, Z_AS = 6000, H_CAP = 2500, DZ = 25, P0 = 1013.25, W_CB = 0.1, MIX = 8;
  const OMEGA = 7.2921e-5;

  // ---------- 水氣 ----------
  function esw(Tc) { return 6.112 * Math.exp(17.67 * Tc / (Tc + 243.5)); }
  function mixR(e, p) { return EPS * e / (p - e); }                 // kg/kg
  function dewPoint(e) { const l = Math.log(e / 6.112); return 243.5 * l / (17.67 - l); }
  /** Bolton (1980) 式 15：舉升凝結的溫度（°C） */
  function tLCL(T, Td) { const tk = T + TK, dk = Td + TK; return 1 / (1 / (dk - 56) + Math.log(tk / dk) / 800) + 56 - TK; }
  function zLCL(T, Td) { Td = Math.min(T, Td); return Math.max(0, (T - tLCL(T, Td)) / GAMMA_D); }
  /** 溼絕熱減溫率（K/m） */
  function gammaM(Tc, p) {
    const T = Tc + TK, r = mixR(esw(Tc), p), L = LV - 2370 * Tc;
    return G * (1 + r) * (1 + L * r / (RD * T)) / (CP + r * CPV + L * L * r * (EPS + r) / (RD * T * T));
  }
  /**
   * 暖空氣氣塊從地面抬升到 Z_TOP 的剖面：每 DZ 公尺一點 {z, T, p, r（氣塊的混合比 kg/kg）, rho}
   * 凝結高度以下乾絕熱、混合比不變；以上溼絕熱、混合比 = 飽和混合比。
   */
  function parcel(T, Td, p0) {
    p0 = p0 || P0; Td = Math.min(T, Td);
    const r0 = mixR(esw(Td), p0), gd = G * (1 + r0) / (CP + r0 * CPV), zl = Math.max(0, (T - tLCL(T, Td)) / gd), out = [];
    let Tz = T, p = p0;
    for (let z = 0; z <= Z_TOP + 1e-9; z += DZ) {
      const sat = z >= zl;
      const r = sat ? mixR(esw(Tz), p) : r0;
      out.push({ z: z, T: Tz, p: p, r: Math.min(r, r0), rho: p * 100 / (RD * (Tz + TK) * (1 + 0.61 * Math.min(r, r0))) });
      // 往上一格：RK2
      const tv = function (Tq, pq, zq) { const rr = zq + 1e-9 >= zl ? Math.min(r0, mixR(esw(Tq), pq)) : r0; return (Tq + TK) * (1 + rr / EPS) / (1 + rr); };
      const step = function (Tq, pq, zq) { return [-(zq + 1e-9 >= zl ? gammaM(Tq, pq) : gd), -pq * G / (RD * tv(Tq, pq, zq))]; };
      const k1 = step(Tz, p, z), k2 = step(Tz + k1[0] * DZ, p + k1[1] * DZ, z + DZ);
      // 跨過凝結高度的那一格分兩段
      if (z < zl && z + DZ > zl) {
        const a = zl - z, Tl = Tz - gd * a, pl = p * Math.exp(-G * a / (RD * tv(Tz - gd * a / 2, p, z)));
        const b = DZ - a, g2 = gammaM(Tl, pl), Tn = Tl - g2 * b, pn = pl * Math.exp(-G * b / (RD * tv((Tl + Tn) / 2, pl, zl)));
        Tz = Tn; p = pn; continue;
      }
      Tz += (k1[0] + k2[0]) / 2 * DZ; p += (k1[1] + k2[1]) / 2 * DZ;
    }
    return { zl: zl, r0: r0, pts: out };
  }
  function at(pc, z) {
    const pts = pc.pts, i = Math.max(0, Math.min(pts.length - 2, Math.floor(z / DZ))), u = Math.max(0, Math.min(1, (z - pts[i].z) / DZ));
    const a = pts[i], b = pts[i + 1];
    return { z: z, T: a.T + (b.T - a.T) * u, p: a.p + (b.p - a.p) * u, r: a.r + (b.r - a.r) * u, rho: a.rho + (b.rho - a.rho) * u };
  }

  // ---------- 鋒面 ----------
  const TYPES = {
    cold: { dir: 1, windW: 225, windC: 315 },     // 冷鋒：測站的 s 隨時間增加；風向是「從哪裡吹來」（度）
    warm: { dir: -1, windW: 225, windC: 120 },
    stat: { dir: 1, windW: 225, windC: 45 }
  };
  /**
   * 建立一個鋒面情境。o：{ type, Tw, Tdw（暖氣團地面氣溫、露點）, Tc, Tdc（冷氣團）, slope（tan α）, U（km/h）, V（m/s） }
   */
  function make(o) {
    const pc = parcel(o.Tw, o.Tdw), tan = o.slope, w = o.V * tan;
    const top = at(pc, Z_TOP);
    const f = {
      o: o, pc: pc, tan: tan, w: w, zl: pc.zl,
      /** 鋒面面的高度（m），s（km） */
      h: function (s) { return s > 0 ? s * 1000 * tan : 0; },
      /** s 處的雲：null 或 {base, top, kind, rain（地面降水率 mm/h）, rate（雲裡的凝結率 mm/h）} */
      cloud: function (s) {
        if (s < 0 || w <= 0) return null;
        const base = Math.max(pc.zl, s * 1000 * tan);
        if (base >= Z_TOP - 1) return null;
        const b = at(pc, base), rate = b.rho * w * Math.max(0, b.r - top.r) * 3600;
        if (rate <= 0) return null;
        const kind = base <= Z_RAIN ? (w >= W_CB ? 'cb' : 'ns') : base <= Z_AS ? 'as' : 'cs';
        return { base: base, top: Z_TOP, kind: kind, rate: rate, rain: base <= Z_RAIN ? rate : 0 };
      },
      rain: function (s) { const c = f.cloud(s); return c ? c.rain : 0; },
      /** 地面下雨的範圍 s ∈ [0, sRain]（km）；雲底比 2 km 高就不下雨（null） */
      sRain: pc.zl <= Z_RAIN && w > 0 ? Z_RAIN / (1000 * tan) : null,
      /** 頭上有雲的最遠處（km） */
      sCloud: w > 0 && pc.zl < Z_TOP ? Z_TOP / (1000 * tan) : null,
      /** 頭上冷空氣造成的地面氣壓增加（hPa） */
      dp: function (s) {
        const hc = Math.min(H_CAP, f.h(s)); if (hc <= 0) return 0;
        const rc = P0 * 100 / (RD * (o.Tc + TK)), rw = P0 * 100 / (RD * (o.Tw + TK));
        return G * hc * (rc - rw) / 100;
      },
      /** 測站在 s 的天氣 */
      station: function (s) {
        const u = 0.5 + 0.5 * Math.tanh(s / MIX * 1.5), ty = TYPES[o.type];   // 0：暖氣團、1：冷氣團
        const c = f.cloud(s);
        return {
          s: s, cold: s > 0, T: o.Tw + (o.Tc - o.Tw) * u, Td: o.Tdw + (o.Tdc - o.Tdw) * u, p: P0 + f.dp(s),
          wind: s > 0 ? ty.windC : ty.windW, rain: c ? c.rain : 0, cloud: c ? c.kind : null, base: c ? c.base : null
        };
      }
    };
    return f;
  }
  /** 測站開始與結束的位置（km）與時間上限（h） */
  const T_MAX = 72;
  function course(f) {
    const ty = TYPES[f.o.type];
    if (ty.dir > 0) { const end = (f.sRain != null ? f.sRain : 0) + 60; return { s0: f.o.type === 'stat' ? -30 : -120, s1: end }; }
    const reach = f.sCloud != null ? f.sCloud : (f.sRain != null ? f.sRain : 0);
    return { s0: Math.min(reach + 40, 1500), s1: -80 };
  }
  /**
   * 讓鋒面通過測站：回傳逐時間的紀錄與統計。dt（h）預設 0.02。
   * 統計：total（雨量 mm）, hours（下雨的時數）, peak（最大降水率）, tStart/tEnd（開始、停止下雨的時刻）,
   *   dT（結束 − 開始的氣溫）, dTd, dP, pMin, pMax, wind0, wind1, clouds（依序看到的雲的種類）, passed（鋒面線通過了）, tFront, tEndRun, capped（到 72 h 還沒走完）,
   *   max1、max3、max24（任意連續 1、3、24 小時的最大雨量）, tCloud（第一次看到鋒面雲）, snow（地面氣溫 0 °C 以下時落下的量：雪）
   */
  function pass(f, dt) {
    dt = dt || 0.02;
    const c = course(f), dir = TYPES[f.o.type].dir, U = f.o.U;
    const rec = []; let t = 0, s = c.s0, total = 0, hours = 0, peak = 0, tStart = null, tEnd = null, tFront = null;
    const clouds = []; let pMin = 1e9, pMax = -1e9;
    for (;;) {
      const st = f.station(s); st.t = t; rec.push(st);
      if (st.cloud && clouds[clouds.length - 1] !== st.cloud) clouds.push(st.cloud);
      pMin = Math.min(pMin, st.p); pMax = Math.max(pMax, st.p);
      const done = dir > 0 ? s >= c.s1 : s <= c.s1;
      if (done || t >= T_MAX - 1e-9) break;
      const sN = s + dir * U * dt, stN = f.station(sN), r = (st.rain + stN.rain) / 2;
      total += r * dt; if (r > 0.1) hours += dt; peak = Math.max(peak, st.rain, stN.rain);
      if (r > 0.1 && tStart == null) tStart = t;
      if (r > 0.1) tEnd = t + dt;
      if (tFront == null && (s > 0) !== (sN > 0)) tFront = t + dt * Math.abs(s) / Math.max(1e-9, Math.abs(sN - s));
      s = sN; t += dt;
    }
    const a = rec[0], b = rec[rec.length - 1];
    // 任意連續 1、3、24 小時的最大雨量（中央氣象署：1 小時 40 mm 或 24 小時 80 mm 大雨；24 小時 200 mm 或 3 小時 100 mm 豪雨；
    // 24 小時 350 mm 大豪雨；24 小時 500 mm 超大豪雨）
    const cum = [0]; for (let i = 1; i < rec.length; i++) cum.push(cum[i - 1] + (rec[i - 1].rain + rec[i].rain) / 2 * (rec[i].t - rec[i - 1].t));
    const maxIn = function (H) { let best = 0, j = 0; for (let i = 0; i < rec.length; i++) { while (rec[i].t - rec[j].t > H + 1e-9) j++; best = Math.max(best, cum[i] - cum[j]); } return best; };
    let tCloud = null, snow = 0; for (let i = 0; i < rec.length; i++) { if (tCloud == null && rec[i].cloud) tCloud = rec[i].t; if (i && rec[i].T <= 0 && rec[i - 1].T <= 0) snow += cum[i] - cum[i - 1]; }
    return { rec: rec, total: total, max1: maxIn(1), max3: maxIn(3), max24: maxIn(24), tCloud: tCloud, snow: snow, hours: hours, peak: peak, tStart: tStart, tEnd: tEnd, dT: b.T - a.T, dTd: b.Td - a.Td, dP: b.p - a.p, pMin: pMin, pMax: pMax,
      wind0: a.wind, wind1: b.wind, clouds: clouds, passed: tFront != null, tFront: tFront, tEndRun: t, capped: t >= T_MAX - 1e-9 && !(dir > 0 ? s >= c.s1 : s <= c.s1), s0: c.s0, s1: c.s1 };
  }

  // ---------- Margules ----------
  function coriolis(latDeg) { return 2 * OMEGA * Math.sin(latDeg * Math.PI / 180); }
  function margulesSlope(lat, Tmean, dv, dT) { return coriolis(lat) * (Tmean + TK) * dv / (G * dT); }
  function margulesShear(lat, Tmean, tan, dT) { return G * dT * tan / (coriolis(lat) * (Tmean + TK)); }

  return {
    TK: TK, G: G, RD: RD, CP: CP, CPV: CPV, LV: LV, EPS: EPS, GAMMA_D: GAMMA_D, Z_TOP: Z_TOP, Z_RAIN: Z_RAIN, Z_AS: Z_AS, H_CAP: H_CAP, P0: P0, W_CB: W_CB, T_MAX: T_MAX, TYPES: TYPES,
    esw: esw, mixR: mixR, dewPoint: dewPoint, tLCL: tLCL, zLCL: zLCL, gammaM: gammaM, parcel: parcel, at: at,
    make: make, course: course, pass: pass, coriolis: coriolis, margulesSlope: margulesSlope, margulesShear: margulesShear
  };
});
