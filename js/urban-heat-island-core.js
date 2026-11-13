/* urban-heat-island-core.js — 都市熱島的計算核心（瀏覽器與 Node 共用）
 *
 * 虛構城市放在 40 km × 40 km 的平原上（80 × 80 格，每格 0.5 km），西風吹向東。
 * 每一格的「加熱量」S 來自不透水面（柏油、水泥、屋頂白天儲熱、夜裡放熱）與人為廢熱（車輛、冷氣、工廠），
 * 水體與公園（植物蒸散）讓 S 變小；郊區（農田、林地）是參考點，S = 0。
 * 空氣溫度的偏差 T（比郊區高多少 °C）滿足穩態的平流－擴散－鬆弛方程：
 *     λ T − K ∇²T + u ∂T/∂x = S
 * K 是亂流擴散、λ 是向大氣散失熱量的速率、u 是風把熱往下風處帶。用高斯－賽德爾疊代求解。
 * 振幅依 Oke（1973）歐洲城市的經驗式校準：晴朗無風的夜裡，最大熱島強度 ΔT_max = 2.01 log10(P) − 4.06（P 為人口）。
 * 風越大，亂流把城裡的熱和郊區的空氣混在一起，熱島越弱；風速到達臨界風速
 * u_crit = 3.4 log10(P) − 11.6（m/s，Oke 與 Hannell 1970）時熱島消失（這裡簡化成線性遞減）。
 * 一天中的時刻與雲量再乘上係數（夜裡最強、午後最弱；雲越多越弱）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HeatCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const N = 80, CELL = 0.5, CX = 40, CY = 40;        // 格數、每格 km、市中心
  const DENS = 6000;                                 // 都市區平均人口密度（人／km^2）
  const K_DIFF = 1, LAMBDA = 0.12, U_PER_MS = 0.55;  // 擴散（格^2）、鬆弛、每 m/s 的平流速度（格）
  const PARK_R = 2;                                  // 使用者放的公園半徑（格）＝ 1 km
  const P_MIN = 1e4, P_MAX = 3e6, MAX_PARKS = 3;
  const sg = x => 1 / (1 + Math.exp(-x));
  function hash(i, j, k) {
    let h = (i * 374761393 + j * 668265263 + (k || 0) * 2147483647) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /** Oke（1973）歐洲城市：晴朗無風夜晚的最大熱島強度（°C） */
  const oke = P => Math.max(0, 2.01 * Math.log10(P) - 4.06);
  /** 臨界風速（m/s）：超過它，熱島消失（Oke 與 Hannell 1970） */
  const ucrit = P => Math.max(0.5, 3.4 * Math.log10(P) - 11.6);
  /** 風的係數：無風為 1，到臨界風速為 0 */
  const windFactor = (u, P) => Math.max(0, 1 - Math.max(0, u) / ucrit(P));
  /** 郊區（參考點）的氣溫（°C）：盛夏晴天下午 2 點最高；雲多時日夜溫差變小 */
  const rural = (h, c) => 27.5 + 4 * Math.cos(2 * Math.PI * (h - 14) / 24) * (1 - 0.6 * Math.max(0, Math.min(1, c || 0)));
  /** 都市半徑（km）：人口 ÷ 平均密度 = 面積 */
  const radiusKm = P => Math.sqrt(P / (Math.PI * DENS));
  /** 河：從西到東穿過城市南邊（格的 j 座標） */
  const riverJ = i => 49 + 4 * Math.sin(i / 11 + 0.8);
  /** 一天中的時刻係數：凌晨 2 點最強（1），下午 2 點最弱（0.3） */
  const hourFactor = h => 0.65 + 0.35 * Math.cos(2 * Math.PI * (h - 2) / 24);
  /** 雲量係數：陰天時地面向天空的長波輻射散熱少，城郊溫差變小 */
  const cloudFactor = c => 1 - 0.75 * Math.max(0, Math.min(1, c)) ** 1.5;

  /**
   * 地表：o = { P（人口）, green（新增綠地比例 0–0.5）, cool（涼屋頂 0–1）, parks（[{i, j}] 使用者放的公園） }
   * 回傳 { urb, imp, water, park, anth, S }（每格一個 Float32Array）
   */
  function landcover(o) {
    const n = N * N, urbA = new Float32Array(n), imp = new Float32Array(n), water = new Float32Array(n), park = new Float32Array(n), anth = new Float32Array(n), S = new Float32Array(n);
    const R = radiusKm(o.P) / CELL, w = 0.15 * R + 1, green = Math.max(0, Math.min(0.5, o.green || 0)), cool = Math.max(0, Math.min(1, o.cool || 0));
    const parks = o.parks || [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, r = Math.hypot(i + 0.5 - CX, j + 0.5 - CY);
      const urb = 1 - sg((r - R) / w * 4);                 // 0（郊區）– 1（市區）
      urbA[k] = urb;
      if (Math.abs(j + 0.5 - riverJ(i)) < 1.3) { water[k] = 1; continue; }
      let f = urb * (0.8 + 0.15 * hash(i, j, 1)) * (0.85 + 0.15 * Math.exp(-r / (0.4 * R + 1)));
      let pk = 0;
      parks.forEach(p => { if (Math.hypot(i - p.i, j - p.j) <= PARK_R) pk = 1; });
      if (pk) { f = 0; park[k] = 1; }
      imp[k] = f * (1 - green);
      anth[k] = urb * Math.exp(-r / (0.5 * R + 1)) * (pk ? 0 : 1);
      // 不透水面（涼屋頂讓白天吸收的熱少一半）＋人為廢熱；公園植物蒸散，水體降溫
      S[k] = imp[k] * (1 - 0.5 * cool) + 0.3 * anth[k] - 0.25 * park[k] - 0.15 * urb * green;
    }
    // 河：水面蒸發、河道也是風的通道，比旁邊涼
    for (let k = 0; k < n; k++) if (water[k]) S[k] = -0.2;
    return { urb: urbA, imp, water, park, anth, S };
  }

  /** 解 λT − K∇²T + u ∂T/∂x = S（u 是風速 m/s，向東為正；西、南、北邊界 T = 0，有風時東邊界讓熱流出）。回傳 Float32Array */
  function solve(S, wind, iters) {
    const T = new Float32Array(N * N), u = Math.max(0, wind) * U_PER_MS;
    const diag = LAMBDA + 4 * K_DIFF + u;                // 一階迎風差分
    const it = iters || 260;
    for (let s = 0; s < it; s++) {
      for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
        const k = j * N + i;
        T[k] = (S[k] + K_DIFF * (T[k - 1] + T[k + 1] + T[k - N] + T[k + N]) + u * T[k - 1]) / diag;
      }
      // 東邊（下風處）的邊界：熱跟著風流出去，不在邊界上被硬壓成 0
      if (u > 0) for (let j = 1; j < N - 1; j++) T[j * N + N - 1] = T[j * N + N - 2];
    }
    return T;
  }

  const REF = new Map();
  const keyOf = (P, u) => Math.round(Math.log10(P) * 1000) + '|' + Math.round(Math.max(0, u) * 100);
  /** 基準城市（同樣人口與風速、沒有綠地、涼屋頂與公園）解出來的場：{ T, max, maxK }（快取） */
  function base(P, u) {
    const key = keyOf(P, u);
    let v = REF.get(key);
    if (!v) {
      const T = solve(landcover({ P, green: 0, cool: 0, parks: [] }).S, u);
      let max = -1e9, maxK = 0;
      for (let k = 0; k < T.length; k++) if (T[k] > max) { max = T[k]; maxK = k; }
      if (REF.size > 400) REF.clear();
      v = { T, max, maxK };
      REF.set(key, v);
    }
    return v;
  }
  const refMax = (P, u) => base(P, u || 0).max;

  /**
   * 完整計算：o = { P, wind（m/s）, hour（0–24）, cloud（0–1）, green, cool, parks }
   * 回傳 { lc, T（°C 偏差）, max, maxK, center（市中心的偏差）, peakKm（最熱點在市中心東邊幾 km）, area2（偏差 ≥ 2 °C 的面積 km^2）,
   *        amp（校準係數）, oke（這個人口的 Oke 值）, profile（通過市中心的東西向剖面） }
   */
  function compute(o) {
    const P = Math.max(P_MIN, Math.min(P_MAX, o.P)), u = Math.max(0, o.wind || 0), h = o.hour == null ? 2 : o.hour;
    const plain = !(o.green > 0) && !(o.cool > 0) && !(o.parks && o.parks.length);
    const b = base(P, u), lc = landcover(Object.assign({}, o, { P })), raw = plain ? b.T : solve(lc.S, u);
    // 校準：基準城市的最大值 = Oke 的值 × 風、時刻、雲量的係數
    const amp = oke(P) * windFactor(u, P) * hourFactor(h) * cloudFactor(o.cloud || 0) / b.max;
    const T = new Float32Array(N * N);
    let max = -1e9, maxK = 0, a2 = 0;
    for (let k = 0; k < T.length; k++) { T[k] = raw[k] * amp; if (T[k] > max) { max = T[k]; maxK = k; } if (T[k] >= 2) a2 += CELL * CELL; }
    const cK = Math.floor(CY) * N + Math.floor(CX);
    const center = (T[cK] + T[cK - 1] + T[cK - N] + T[cK - N - 1]) / 4;
    const profile = new Float32Array(N);
    for (let i = 0; i < N; i++) profile[i] = (T[Math.floor(CY) * N + i] + T[(Math.floor(CY) - 1) * N + i]) / 2;
    return {
      lc, T, max: Math.max(0, max), maxK, center, peakKm: ((maxK % N) + 0.5 - CX) * CELL, area2: a2, amp, profile,
      oke: oke(P), ucrit: ucrit(P), maxBase: b.max * amp, peakBaseKm: ((b.maxK % N) + 0.5 - CX) * CELL, peakBaseK: b.maxK,
      rural: rural(h, o.cloud || 0)
    };
  }

  /** 任務與讀數用的摘要：o 同 compute，probe = { i, j } 或 null。r 可以傳入已算好的 compute 結果 */
  function summary(o, probe, r) {
    r = r || compute(o);
    const parks = o.parks || [];
    let centerNoPark = r.center;
    if (parks.length) centerNoPark = compute(Object.assign({}, o, { parks: [] })).center;
    let pr = null;
    if (probe && probe.i >= 0 && probe.i < N && probe.j >= 0 && probe.j < N) {
      const k = probe.j * N + probe.i, km = kmOf(probe.i, probe.j), mi = N - 1 - probe.i;
      pr = {
        x: km[0], y: km[1], dT: r.T[k], t: r.rural + r.T[k], water: !!r.lc.water[k], park: !!r.lc.park[k], urb: r.lc.urb[k], imp: r.lc.imp[k],
        mirror: r.T[probe.j * N + mi], r: Math.hypot(km[0], km[1])
      };
    }
    const peakParked = parks.some(p => Math.hypot((r.peakBaseK % N) - p.i, Math.floor(r.peakBaseK / N) - p.j) <= PARK_R);
    return {
      P: o.P, wind: o.wind || 0, hour: o.hour, cloud: o.cloud || 0, green: o.green || 0, cool: o.cool || 0, parks: parks.length,
      max: r.max, center: r.center, centerNoPark, peakKm: r.peakKm, peakBaseKm: r.peakBaseKm, peakParked, area2: r.area2,
      oke: r.oke, ucrit: r.ucrit, maxBase: r.maxBase, mitig: r.maxBase > 1e-9 ? 1 - r.max / r.maxBase : 0, rural: r.rural, R: radiusKm(o.P), probe: pr
    };
  }

  /** 畫面座標：格 (i, j) 的中心離市中心的 km（東正、南正） */
  const kmOf = (i, j) => [(i + 0.5 - CX) * CELL, (j + 0.5 - CY) * CELL];
  /** km → 格 */
  const cellOf = (x, y) => [Math.floor(x / CELL + CX), Math.floor(y / CELL + CY)];

  return { N, CELL, CX, CY, DENS, K_DIFF, LAMBDA, U_PER_MS, PARK_R, P_MIN, P_MAX, MAX_PARKS, oke, ucrit, windFactor, rural, radiusKm, riverJ, hourFactor, cloudFactor, landcover, solve, base, refMax, compute, summary, kmOf, cellOf, hash };
});
