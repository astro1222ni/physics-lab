/*
 * 地震預警與盲區（quake-early-warning）物理核心：不碰 DOM，Node 與瀏覽器共用。
 *
 * 模型（區域型預警，照中央氣象署強震即時警報的做法簡化）：
 *   1. 震源在 (x0, y0) 深 h；P 波、S 波以等速 VP、VS 向外傳（均勻地殼，射線是直線）。
 *      某地的震源距離 R = √(d² + h²)，d 是震央距離；P 波到時 R / VP，S 波到時 R / VS。
 *   2. 測站網收到 P 波：第 N 個收到 P 波的測站的到時，再加上計算與發布的時間 t_proc，就是發布警報的時刻 T_a。
 *   3. 某地的預警時間 = S 波到時 − T_a。小於 0 的地方是「盲區」：S 波比警報先到。
 *      盲區半徑（震央距離）r_b = √((VS·T_a)² − h²)；VS·T_a ≤ h 時沒有盲區。
 *   4. 現地型預警：每個地方自己的儀器收到 P 波後，用 t_on 秒判斷，預警時間 = R(1/VS − 1/VP) − t_on。
 *   5. 地表最大加速度（PGA）用 Chang, Cotton & Angelier (2001, BSSA 91:5) 的臺灣衰減式：
 *        淺層地殼地震  ln A = 2.8096 + 0.8993 M − 0.4381 ln D_p − (1.0954 − 0.0079 D_p) ln D_e
 *        隱沒板塊地震  ln A = 4.7141 + 0.8468 M − 0.1745 ln D_p − 1.2972 ln D_h
 *      A：gal（cm/s²）；M：地震矩規模；D_e 震央距離、D_h 震源距離、D_p 震源深度（km）。
 *      本模型深度 < 35 km 用淺層式、≥ 35 km 用隱沒板塊式；震央距離小於 5 km 時用 5 km（公式在震央會發散）。
 *      標準差 σ(ln A) ≈ 0.6：真實的搖晃常在估計值的一半到兩倍之間。
 *   6. 震度：中央氣象署 2020 年起的分級，4 級以下照 PGA：
 *        0 級 < 0.8、1 級 0.8–2.5、2 級 2.5–8、3 級 8–25、4 級 25–80 gal；80 gal 以上是 5 級以上（再用 PGV 細分，本模型不細分）。
 *   7. 發布範圍（本模型的條件）：用「預估規模」算出的預估震度 ≥ 4 級的地方才發警報；預估規模 < 5 不發。
 */
(function (root) {
  'use strict';
  const QC = (typeof module !== 'undefined' && module.exports) ? require('./earthquake-core.js') : root.QuakeCore;

  const VP = 6.0, VS = 3.5;          // 臺灣地殼的平均 P 波、S 波速度（km/s）
  const T_ON = 3;                     // 現地型：收到 P 波後判斷所需的時間（s）
  const DE_MIN = 5;                   // 衰減式的最小震央距離（km）
  const DEEP = 35;                    // 這個深度以上用隱沒板塊式（km）
  const PGA_STEPS = [0.8, 2.5, 8, 25, 80];
  const ALERT_I = 4, ALERT_M = 5;

  /** 實際發生過的地震（中央氣象署地震報告的震央、深度；規模用地震矩規模 Mw 的約略值） */
  const QUAKES = [
    { id: 'hualien2024', zh: '2024 花蓮', en: '2024 Hualien', lon: 121.67, lat: 23.77, h: 15.5, M: 7.4, ML: 7.2, date: '2024-04-03' },
    { id: 'chichi1999', zh: '1999 集集', en: '1999 Chi-Chi', lon: 120.82, lat: 23.85, h: 8.0, M: 7.6, ML: 7.3, date: '1999-09-21' },
    { id: 'meinong2016', zh: '2016 美濃', en: '2016 Meinong', lon: 120.54, lat: 22.92, h: 14.6, M: 6.4, ML: 6.6, date: '2016-02-06' },
    { id: 'chishang2022', zh: '2022 池上', en: '2022 Chishang', lon: 121.20, lat: 23.14, h: 7.8, M: 6.9, ML: 6.8, date: '2022-09-18' }
  ];

  /** 外海觀測站（示意）：宜蘭外海與花東外海的海底觀測點 */
  const SEA_ST = [
    { lon: 122.05, lat: 24.80 }, { lon: 122.25, lat: 24.62 }, { lon: 122.45, lat: 24.45 },
    { lon: 121.95, lat: 23.90 }, { lon: 121.80, lat: 23.30 }, { lon: 121.60, lat: 22.75 }
  ];

  function hypo(d, h) { return Math.hypot(d, h); }
  function tP(d, h, vp) { return hypo(d, h) / (vp || VP); }
  function tS(d, h, vs) { return hypo(d, h) / (vs || VS); }

  /**
   * 測站網：本島內的正三角形格點（間距 s km），加上澎湖、綠島、蘭嶼各一站；sea = true 時加上外海觀測站。
   * 傳回 [{ x, y, lon, lat, sea }]（x、y 是 km）。
   */
  function stations(s, sea) {
    const out = [];
    const b = QC.toXY(QC.MAP.lon0, QC.MAP.lat0), t = QC.toXY(QC.MAP.lon1, QC.MAP.lat1);
    const dy = s * Math.sqrt(3) / 2;
    let row = 0;
    for (let y = b.y + dy / 2; y <= t.y; y += dy, row++) {
      for (let x = b.x + (row % 2 ? s / 2 : 0); x <= t.x; x += s) {
        const ll = QC.toLonLat(x, y);
        if (QC.onLand(ll.lon, ll.lat)) out.push({ x: x, y: y, lon: ll.lon, lat: ll.lat, sea: false });
      }
    }
    [[119.58, 23.58], [121.49, 22.66], [121.55, 22.05]].forEach(function (p) {
      const q = QC.toXY(p[0], p[1]); out.push({ x: q.x, y: q.y, lon: p[0], lat: p[1], sea: false });
    });
    if (sea) SEA_ST.forEach(function (p) { const q = QC.toXY(p.lon, p.lat); out.push({ x: q.x, y: q.y, lon: p.lon, lat: p.lat, sea: true }); });
    return out;
  }

  /**
   * 發布警報的時刻。q = { x, y, h }；st 測站；n 需要幾個測站；proc 計算與發布時間（s）。
   * 傳回 { Ta, tFirst, tN, used: [測站索引…依到時排序前 n 個] }。
   */
  function alertTime(q, st, n, proc, vp) {
    const arr = st.map(function (s, i) { return { i: i, t: tP(Math.hypot(s.x - q.x, s.y - q.y), q.h, vp) }; });
    arr.sort(function (a, b) { return a.t - b.t; });
    const k = Math.max(1, Math.min(n, arr.length));
    const tN = arr[k - 1].t;
    return { Ta: tN + proc, tFirst: arr[0].t, tN: tN, used: arr.slice(0, k).map(function (a) { return a.i; }) };
  }

  /** 盲區半徑（震央距離 km）：S 波在 T_a 時刻到達地表的距離 */
  function blindRadius(Ta, h, vs) {
    const r = (vs || VS) * Ta;
    return r > h ? Math.sqrt(r * r - h * h) : 0;
  }
  /** 現地型的盲區半徑：R(1/VS − 1/VP) = t_on */
  function onsiteBlindRadius(h, ton, vp, vs) {
    const R = (ton == null ? T_ON : ton) / (1 / (vs || VS) - 1 / (vp || VP));
    return R > h ? Math.sqrt(R * R - h * h) : 0;
  }
  /** 波前在地表的半徑（震央距離）：時刻 t 時 √((v t)² − h²) */
  function surfaceRadius(t, h, v) { const r = v * t; return r > h ? Math.sqrt(r * r - h * h) : 0; }

  /** 地表最大加速度（gal） */
  function pga(M, d, h) {
    const Dp = Math.max(1, h);
    if (h >= DEEP) {
      const Dh = hypo(d, h);
      return Math.exp(4.7141 + 0.8468 * M - 0.1745 * Math.log(Dp) - 1.2972 * Math.log(Dh));
    }
    const De = Math.max(DE_MIN, d);
    return Math.exp(2.8096 + 0.8993 * M - 0.4381 * Math.log(Dp) - (1.0954 - 0.0079 * Dp) * Math.log(De));
  }
  /** 震度（0–5；5 代表 5 級以上） */
  function intensity(a) { let i = 0; while (i < PGA_STEPS.length && a >= PGA_STEPS[i]) i++; return i; }
  /** 某個震度的 PGA 下限（gal） */
  function pgaOf(i) { return i <= 0 ? 0 : PGA_STEPS[i - 1]; }
  /**
   * 預估震度達到 i 級的最大震央距離（km）：pga 隨距離單調遞減，二分法。到處都達到時傳回 Infinity，到處都不到時傳回 −1。
   */
  function radiusFor(M, h, i) {
    const a = pgaOf(i);
    if (pga(M, 0, h) < a) return -1;
    if (pga(M, 2000, h) >= a) return Infinity;
    let lo = 0, hi = 2000;
    for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (pga(M, m, h) >= a) lo = m; else hi = m; }
    return lo;
  }

  /**
   * 整個情境：q = { x, y, h, M, dM }，opt = { spacing, n, proc, sea, onsite, ton }。
   * 傳回 { Ta, tFirst, rb, rbOn, Mest, rAlert（預估 4 級的半徑）, r4（真實 4 級的半徑）, st, used, site(x, y) }
   */
  function scenario(q, opt) {
    const st = stations(opt.spacing, !!opt.sea);
    const a = alertTime(q, st, opt.n, opt.proc);
    const Mest = q.M + (q.dM || 0);
    const issue = Mest >= ALERT_M;
    const rAlert = issue ? radiusFor(Mest, q.h, ALERT_I) : -1;
    const ton = opt.ton == null ? T_ON : opt.ton;
    const res = {
      Ta: a.Ta, tFirst: a.tFirst, tN: a.tN, used: a.used, st: st, Mest: Mest, issue: issue,
      rb: blindRadius(a.Ta, q.h), rbOn: opt.onsite ? onsiteBlindRadius(q.h, ton) : null,
      rAlert: rAlert, r4: radiusFor(q.M, q.h, ALERT_I), r5: radiusFor(q.M, q.h, 5)
    };
    /** 某一點（x、y km）的情況 */
    res.site = function (x, y) {
      const d = Math.hypot(x - q.x, y - q.y);
      const p = tP(d, q.h), s = tS(d, q.h);
      const A = pga(q.M, d, q.h), Ae = pga(Mest, d, q.h);
      const alerted = issue && intensity(Ae) >= ALERT_I;
      const lead = alerted ? s - a.Ta : null;
      const leadOn = opt.onsite ? s - (p + ton) : null;
      let best = lead;
      if (leadOn != null && (best == null || leadOn > best)) best = leadOn;
      return {
        d: d, R: hypo(d, q.h), tP: p, tS: s, sp: s - p, pga: A, I: intensity(A), pgaEst: Ae, Iest: intensity(Ae),
        alerted: alerted, lead: lead, leadOn: leadOn, best: best, blind: best == null ? null : best <= 0
      };
    };
    return res;
  }

  const api = {
    VP: VP, VS: VS, T_ON: T_ON, DE_MIN: DE_MIN, DEEP: DEEP, PGA_STEPS: PGA_STEPS, ALERT_I: ALERT_I, ALERT_M: ALERT_M,
    QUAKES: QUAKES, SEA_ST: SEA_ST, QC: QC,
    hypo: hypo, tP: tP, tS: tS, stations: stations, alertTime: alertTime, blindRadius: blindRadius,
    onsiteBlindRadius: onsiteBlindRadius, surfaceRadius: surfaceRadius, pga: pga, intensity: intensity, pgaOf: pgaOf,
    radiusFor: radiusFor, scenario: scenario
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EEWCore = api;
})(typeof window !== 'undefined' ? window : this);
