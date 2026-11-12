/* time-zones-core.js — 「經緯度、時區與換日線」的數學核心（與畫面無關，Node 可直接 require）
 *
 * 時間：一年 365 天（不考慮閏年），模擬時刻 = UTC 的「第幾天 day（1–365）」加上「UTC 鐘點 utc（0–24 小時）」。
 *   超出範圍的 day 會換到前一年或下一年（day 0 = 去年 12 月 31 日，day 366 = 明年 1 月 1 日）。
 * 太陽位置：NOAA 全球監測實驗室公開的近似公式（以「年角」γ 的傅立葉級數算赤緯 δ 與均時差 E），誤差約 1 分鐘、0.1°。
 *   公式原本的節氣時刻比現在晚約 1.1 天（曆年和回歸年的相位慢慢錯開），所以把年角提前 PHASE = 1.1 天，
 *   對準 2026 年前後的實際節氣（春分 3/20、夏至 6/21、秋分 9/23、冬至 12/21；四年一閏造成的 ±0.75 天不另外處理）。
 *   直射點：緯度 δ，經度 λs = −15°·(UTC − 12 + E/60)。
 *   時角 H = 15°·(UTC − 12) + λ + E/4（度），太陽仰角 sin h = sin φ sin δ + cos φ cos δ cos H。
 *   日出日落：太陽上緣碰到地平線，h0 = −0.833°（大氣折射 34′ 加太陽半徑 16′）。
 * 地方時：地方平時（LMT）= UTC + λ/15；視太陽時 = 地方平時 + E（日晷的時間）。
 * 理想時區：以 15° 的倍數為中央經線，每區寬 15°；±12 區在 180° 經線兩側各寬 7.5°，中間就是理想的換日線。
 * 城市：用各地官方的「標準時間」（不含夏令時間），資料來自 IANA 時區資料庫（公有領域）；座標取市中心，到 0.01°。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TimeZoneCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const DEG = Math.PI / 180, R_EARTH = 6371, H0 = -0.833, PHASE = 1.1;
  const MLEN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // 城市：id、中文、英文、緯度、經度（東正西負）、官方標準時間 UTC+off（小時）
  const CITIES = [
    ['taipei', '臺北', 'Taipei', 25.03, 121.56, 8],
    ['kaohsiung', '高雄', 'Kaohsiung', 22.63, 120.30, 8],
    ['tokyo', '東京', 'Tokyo', 35.68, 139.69, 9],
    ['seoul', '首爾', 'Seoul', 37.57, 126.98, 9],
    ['beijing', '北京', 'Beijing', 39.90, 116.40, 8],
    ['manila', '馬尼拉', 'Manila', 14.60, 120.98, 8],
    ['singapore', '新加坡', 'Singapore', 1.35, 103.82, 8],
    ['newdelhi', '新德里', 'New Delhi', 28.61, 77.21, 5.5],
    ['kathmandu', '加德滿都', 'Kathmandu', 27.72, 85.32, 5.75],
    ['dubai', '杜拜', 'Dubai', 25.20, 55.27, 4],
    ['moscow', '莫斯科', 'Moscow', 55.76, 37.62, 3],
    ['nairobi', '奈洛比', 'Nairobi', -1.29, 36.82, 3],
    ['cairo', '開羅', 'Cairo', 30.04, 31.24, 2],
    ['capetown', '開普敦', 'Cape Town', -33.92, 18.42, 2],
    ['longyearbyen', '朗伊爾城', 'Longyearbyen', 78.22, 15.65, 1],
    ['madrid', '馬德里', 'Madrid', 40.42, -3.70, 1],
    ['london', '倫敦', 'London', 51.51, -0.13, 0],
    ['reykjavik', '雷克雅維克', 'Reykjavík', 64.15, -21.94, 0],
    ['saopaulo', '聖保羅', 'São Paulo', -23.55, -46.63, -3],
    ['newyork', '紐約', 'New York', 40.71, -74.01, -5],
    ['losangeles', '洛杉磯', 'Los Angeles', 34.05, -118.24, -8],
    ['anchorage', '安克拉治', 'Anchorage', 61.22, -149.90, -9],
    ['honolulu', '檀香山', 'Honolulu', 21.31, -157.86, -10],
    ['pagopago', '帕果帕果', 'Pago Pago', -14.28, -170.70, -11],
    ['apia', '阿庇亞', 'Apia', -13.83, -171.76, 13],
    ['kiritimati', '聖誕島（吉里巴斯）', 'Kiritimati', 1.87, -157.40, 14],
    ['auckland', '奧克蘭', 'Auckland', -36.85, 174.76, 12],
    ['sydney', '雪梨', 'Sydney', -33.87, 151.21, 10]
  ].map(function (a) { return { id: a[0], zh: a[1], en: a[2], lat: a[3], lon: a[4], off: a[5] }; });
  const CITY = {};
  CITIES.forEach(function (c) { CITY[c.id] = c; });

  // ---------- 小工具 ----------
  function mod(a, n) { return ((a % n) + n) % n; }
  function n180(x) { return mod(x + 180, 360) - 180; }        // 換到 [−180, 180)
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  // ---------- 日期 ----------
  /** 第幾天 → { y（−1 去年、0 今年、1 明年…）, m, d } */
  function dateOf(day) {
    let d = Math.round(day), y = 0;
    while (d < 1) { d += 365; y--; }
    while (d > 365) { d -= 365; y++; }
    let m = 0;
    while (d > MLEN[m]) { d -= MLEN[m]; m++; }
    return { y: y, m: m + 1, d: d };
  }
  function dayOf(m, d) { let n = d; for (let i = 0; i < m - 1; i++) n += MLEN[i]; return n; }

  /** UTC 第 day 天、utc 時的時刻，在 UTC+off 的地方是第幾天、幾點（clock 0–24） */
  function local(day, utc, off) {
    const t = utc + off, sh = Math.floor(t / 24);
    return { day: day + sh, clock: t - 24 * sh, shift: sh };
  }

  // ---------- 太陽 ----------
  /** NOAA 近似式：赤緯 dec（度）、均時差 eot（分鐘，視太陽時 − 平太陽時）、直射點 lat/lon */
  function sun(day, utc) {
    const g = 2 * Math.PI / 365 * (day - 1 + PHASE + (utc - 12) / 24);
    const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const dec = (0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
      - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)) / DEG;
    return { dec: dec, eot: eot, lat: dec, lon: n180(-15 * (utc - 12 + eot / 60)) };
  }
  /** 時角（度，−180～180，負 = 上午、太陽還在東邊） */
  function hourAngle(lon, utc, eot) { return n180(15 * (utc - 12) + lon + eot / 4); }
  /** (lat, lon) 在 day、utc 時的太陽仰角 alt、方位角 az（由北順時針）、時角 H */
  function altAz(lat, lon, day, utc) {
    const s = sun(day, utc), H = hourAngle(lon, utc, s.eot), h = H * DEG, f = lat * DEG, d = s.dec * DEG;
    const sa = Math.sin(f) * Math.sin(d) + Math.cos(f) * Math.cos(d) * Math.cos(h);
    const alt = Math.asin(clamp(sa, -1, 1)) / DEG;
    const az = mod(Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(f) - Math.tan(d) * Math.cos(f)) / DEG + 180, 360);
    return { alt: alt, az: az, H: H, dec: s.dec, eot: s.eot };
  }
  /** 晨昏線：直射點 sub 的晨昏線在經度 lon 的緯度（度）。δ = 0 時晨昏線是經線，傳回 null（另行處理） */
  function terminatorLat(lon, sub) {
    const t = Math.tan(sub.lat * DEG);
    if (Math.abs(t) < 1e-9) return null;
    return Math.atan(-Math.cos((lon - sub.lon) * DEG) / t) / DEG;
  }
  /**
   * 某地「當地日期」的日出、日落：off 是當地鐘的 UTC 偏移，day 是當地日期（UTC 天數的寫法）。
   * 傳回 { rise, set（當地鐘點，可能 < 0 或 > 24 表示在前一天或後一天）, len（晝長，小時）, polar: null | 'day' | 'night', noon（中天的當地鐘點）, noonAlt }
   */
  function riseSet(lat, lon, day, off) {
    const f = lat * DEG;
    const at = function (utc) {
      const s = sun(day, utc), d = s.dec * DEG;
      let tr = 12 - lon / 15 - s.eot / 60;                 // 中天的 UTC 鐘點
      while (tr + off < 0) tr += 24;
      while (tr + off >= 24) tr -= 24;
      return { s: s, d: d, tr: tr, c: (Math.sin(H0 * DEG) - Math.sin(f) * Math.sin(d)) / (Math.cos(f) * Math.cos(d)) };
    };
    const n = at(12 - off), noonAlt = 90 - Math.abs(lat - n.s.dec);
    const res = { rise: null, set: null, len: 0, polar: null, noon: n.tr + off, noonAlt: noonAlt };
    if (n.c <= -1) { res.polar = 'day'; res.len = 24; return res; }
    if (n.c >= 1) { res.polar = 'night'; res.len = 0; return res; }
    const solve = function (sign) {
      let utc = n.tr + sign * Math.acos(n.c) / DEG / 15;
      for (let it = 0; it < 3; it++) {
        const a = at(utc);
        const c = clamp(a.c, -1, 1);
        utc = a.tr + sign * Math.acos(c) / DEG / 15;
      }
      return utc + off;
    };
    res.rise = solve(-1); res.set = solve(1); res.len = res.set - res.rise;
    return res;
  }

  // ---------- 時區 ----------
  /** 理想時區（−12～+12）：以 15° 的倍數為中央經線；180° 經線兩側各半區 */
  function zoneOf(lon) {
    const x = n180(lon);
    if (x >= 172.5) return 12;
    if (x < -172.5) return -12;
    return Math.round(x / 15) || 0;
  }
  /** 理想時區的西界、東界（經度） */
  function zoneBounds(z) {
    if (z === 12) return [172.5, 180];
    if (z === -12) return [-180, -172.5];
    return [15 * z - 7.5, 15 * z + 7.5];
  }
  /** 此刻（理想時區）各個日期占地球經度的比例：[{ day, frac }]，由舊到新 */
  function dateShares(day, utc) {
    const m = {};
    for (let z = -12; z <= 12; z++) {
      const b = zoneBounds(z), w = (b[1] - b[0]) / 360, L = local(day, utc, z);
      m[L.day] = (m[L.day] || 0) + w;
    }
    return Object.keys(m).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return { day: k, frac: m[k] }; });
  }
  /** 理想時區裡，日期在哪一條經線上換（午夜所在的時區西界）；0:00 剛好在時區界上 */
  function midnightLon(utc) {
    // 區時 = utc + z；剛過午夜的時區：(utc + z) mod 24 最小的那一區
    let best = null, bv = Infinity;
    for (let z = -12; z <= 12; z++) {
      const c = mod(utc + z, 24);
      if (c < bv - 1e-9) { bv = c; best = z; }
    }
    return zoneBounds(best)[0];
  }

  // ---------- 大圓 ----------
  function toVec(lon, lat) { const a = lon * DEG, b = lat * DEG; return [Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)]; }
  function gcAngle(a, b) {
    const p = toVec(a[0], a[1]), q = toVec(b[0], b[1]);
    const cr = [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    return Math.atan2(Math.hypot(cr[0], cr[1], cr[2]), p[0] * q[0] + p[1] * q[1] + p[2] * q[2]);
  }
  /** 兩點（[經度, 緯度]）的大圓距離（km） */
  function gcDist(a, b) { return gcAngle(a, b) * R_EARTH; }
  /** 大圓上從 a 到 b 的第 f（0–1）處，傳回 [經度, 緯度] */
  function gcPoint(a, b, f) {
    const w = gcAngle(a, b);
    if (w < 1e-12) return [a[0], a[1]];
    const p = toVec(a[0], a[1]), q = toVec(b[0], b[1]), s = Math.sin(w);
    const ka = Math.sin((1 - f) * w) / s, kb = Math.sin(f * w) / s;
    const v = [ka * p[0] + kb * q[0], ka * p[1] + kb * q[1], ka * p[2] + kb * q[2]];
    return [Math.atan2(v[1], v[0]) / DEG, Math.asin(clamp(v[2], -1, 1)) / DEG];
  }

  // ---------- 飛行 ----------
  /** 一般噴射客機的巡航速度（km/h）與起降多出來的時間，用來建議飛行時間 */
  const CRUISE = 850, OVERHEAD = 0.5;
  function suggestDur(dep, arr) { return Math.round((gcDist([dep.lon, dep.lat], [arr.lon, arr.lat]) / CRUISE + OVERHEAD) * 4) / 4; }
  /** 早晚比較：先比日期再比鐘點 */
  function before(a, b) { return a.day < b.day || (a.day === b.day && a.clock < b.clock - 1e-9); }
  /**
   * 從 dep 飛到 arr（城市物件），UTC 第 day 天 utc 時起飛，飛 dur 小時（等速沿大圓）。
   * 每 2 分鐘取樣一次：飛機正下方的太陽仰角、地方平時（經度連續展開，不會在 180° 跳 24 小時）。
   */
  function flight(dep, arr, day, utc, dur) {
    const A = [dep.lon, dep.lat], B = [arr.lon, arr.lat], dist = gcDist(A, B);
    const n = Math.max(8, Math.ceil(dur * 30));
    const path = [];
    // 日出日落用 ±0.05° 的遲滯判斷：太陽貼著地平線時，取樣的小抖動不會被算成好幾次
    let lonU = dep.lon, prevLon = dep.lon, sunrises = 0, sunsets = 0, minAlt = Infinity, maxAlt = -Infinity, drift = 0, up = null;
    const lmt0 = utc + dep.lon / 15;
    for (let i = 0; i <= n; i++) {
      const f = i / n, p = gcPoint(A, B, f), t = utc + dur * f;
      lonU += n180(p[0] - prevLon); prevLon = p[0];
      const a = altAz(p[1], p[0], day, t).alt;
      if (up === null) up = a >= H0;
      else if (!up && a >= H0 + 0.05) { up = true; sunrises++; }
      else if (up && a < H0 - 0.05) { up = false; sunsets++; }
      minAlt = Math.min(minAlt, a); maxAlt = Math.max(maxAlt, a);
      const lmt = t + lonU / 15;
      drift = Math.max(drift, Math.abs(lmt - lmt0));
      path.push({ lon: p[0], lat: p[1], t: t, alt: a });
    }
    const dl = local(day, utc, dep.off), al = local(day, utc + dur, arr.off);
    return {
      dep: dep.id, arr: arr.id, dist: dist, dur: dur, day: day, utc: utc,
      depLocal: dl, arrLocal: al, depDate: dateOf(dl.day), arrDate: dateOf(al.day),
      earlierClock: before(al, dl), earlierDate: al.day < dl.day, dateDiff: al.day - dl.day,
      clockDiff: (al.day * 24 + al.clock) - (dl.day * 24 + dl.clock),
      sunrises: sunrises, sunsets: sunsets, minAlt: minAlt, maxAlt: maxAlt,
      lmtDrift: drift, dLonU: lonU - dep.lon, westward: lonU - dep.lon < 0, path: path
    };
  }

  // ---------- 地點的讀數 ----------
  /** 某地此刻的各種時間與太陽：off = 官方時間（城市）或理想時區 */
  function place(lat, lon, day, utc, off) {
    const s = altAz(lat, lon, day, utc), z = zoneOf(lon);
    const o = off == null ? z : off;
    const L = local(day, utc, o), lmt = local(day, utc, lon / 15), ast = local(day, utc, lon / 15 + s.eot / 60);
    const rs = riseSet(lat, lon, L.day, o);
    return {
      lat: lat, lon: lon, zone: z, off: o, day: L.day, clock: L.clock, date: dateOf(L.day),
      lmt: lmt.clock, lmtDay: lmt.day, ast: ast.clock, alt: s.alt, az: s.az, H: s.H,
      rise: rs.rise, set: rs.set, dayLen: rs.len, polar: rs.polar, noon: rs.noon, noonAlt: rs.noonAlt,
      offMinusLmt: o - lon / 15            // 官方鐘比地方平時快幾小時
    };
  }
  /** 天空狀態：白天、民用／航海／天文曙暮光、黑夜 */
  function skyOf(alt) { return alt >= H0 ? 'day' : alt >= -6 ? 'civil' : alt >= -12 ? 'nautical' : alt >= -18 ? 'astro' : 'night'; }

  // ---------- 任務事件的快照（頁面與證明腳本共用） ----------
  /**
   * st：{ day, utc, probe: { lon, lat, city（城市 id 或 null） }, flight（剛落地的飛行，或 null）, moving（播放中）, view, center, layers }
   */
  function snapshot(st) {
    const r = function (v, d) { const p = Math.pow(10, d == null ? 4 : d); return v == null || !isFinite(v) ? null : Math.round(v * p) / p; };
    const day = st.day, utc = st.utc, s = sun(day, utc);
    const shares = dateShares(day, utc);
    let maxShare = 0;
    shares.forEach(function (x) { maxShare = Math.max(maxShare, x.frac); });
    const cityDays = {}, cities = {};
    CITIES.forEach(function (c) {
      const L = local(day, utc, c.off), a = altAz(c.lat, c.lon, day, utc);
      cityDays[L.day] = 1;
      cities[c.id] = { day: L.day, clock: r(L.clock), alt: r(a.alt), H: r(a.H) };
    });
    const tp = place(CITY.taipei.lat, CITY.taipei.lon, day, utc, CITY.taipei.off);
    let probe = null;
    if (st.probe) {
      const c = st.probe.city ? CITY[st.probe.city] : null;
      const P = place(st.probe.lat, st.probe.lon, day, utc, c ? c.off : null);
      probe = {
        lon: r(P.lon), lat: r(P.lat), city: c ? c.id : null, zone: P.zone, off: P.off, day: P.day, clock: r(P.clock), date: P.date,
        lmt: r(P.lmt), ast: r(P.ast), alt: r(P.alt), H: r(P.H), dayLen: r(P.dayLen), polar: P.polar,
        offMinusLmt: r(P.offMinusLmt),
        lmtMinusTaipei: r((P.lon - CITY.taipei.lon) / 15),
        dSub: r(gcAngle([P.lon, P.lat], [s.lon, s.lat]) / DEG)
      };
    }
    let fl = null;
    if (st.flight) {
      const F = st.flight;
      fl = { dep: F.dep, arr: F.arr, dist: r(F.dist, 1), dur: F.dur, earlierClock: F.earlierClock, earlierDate: F.earlierDate, dateDiff: F.dateDiff,
        clockDiff: r(F.clockDiff), depDate: F.depDate, arrDate: F.arrDate, sunrises: F.sunrises, sunsets: F.sunsets,
        minAlt: r(F.minAlt, 2), lmtDrift: r(F.lmtDrift), westward: F.westward, dLon: r(F.dLonU, 2) };
    }
    return {
      day: day, utc: r(utc), date: dateOf(day), dec: r(s.dec), eot: r(s.eot), sub: { lat: r(s.lat), lon: r(s.lon) },
      dates: shares.length, minority: r(1 - maxShare), cityDates: Object.keys(cityDays).length,
      taipei: { clock: r(tp.clock), day: tp.day, alt: r(tp.alt), H: r(tp.H), dayLen: r(tp.dayLen) },
      cities: cities, probe: probe, flight: fl, moving: !!st.moving, view: st.view || '2d', center: st.center == null ? 0 : st.center, layers: st.layers || {}
    };
  }

  return {
    DEG: DEG, R_EARTH: R_EARTH, H0: H0, PHASE: PHASE, MLEN: MLEN, CITIES: CITIES, CITY: CITY, CRUISE: CRUISE, OVERHEAD: OVERHEAD,
    mod: mod, n180: n180, dateOf: dateOf, dayOf: dayOf, local: local,
    sun: sun, hourAngle: hourAngle, altAz: altAz, terminatorLat: terminatorLat, riseSet: riseSet, skyOf: skyOf,
    zoneOf: zoneOf, zoneBounds: zoneBounds, dateShares: dateShares, midnightLon: midnightLon,
    gcAngle: gcAngle, gcDist: gcDist, gcPoint: gcPoint, suggestDur: suggestDur, flight: flight, before: before,
    place: place, snapshot: snapshot
  };
});
