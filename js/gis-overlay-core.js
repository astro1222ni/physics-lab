/* gis-overlay-core.js — 圖層疊合與選址的計算核心（純函式，瀏覽器與 Node 共用）
 *
 * 一個虛構的「濱海縣」：西邊是海，東邊是山，一條河由東向西流進海裡，河口北岸有一座城，東南有一個村，
 * 一條活動斷層斜斜穿過全縣，幾條道路。全縣切成 64 × 48 個網格（每格 250 m × 250 m，全縣 16 km × 12 km）。
 * 每一格有這些圖層（都由解析函數產生，不讀外部資料）：
 *   高程 z（m）、坡度 slope（%，由高程網格的中央差分算出）、
 *   離河高度 hand（m，這一格比最近的河床高多少；淹水深度 = max(0, 河水上漲高度 − hand)）、
 *   離斷層 fault（m）、離道路 road（m）、離住宅區 town（m）、土地使用 land（0 水域 1 住宅 2 農地 3 森林 4 保護區）。
 * 疊合：
 *   布林疊合：每一個條件都要通過（AND），結果是「可以 / 不可以」的網格。
 *   加權疊合：每一個條件換成 0–1 的分數，乘上權重相加 → 適宜度 0–100；土地使用不准的格子仍是 0（限制條件）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GisCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const NX = 64, NY = 48, CELL = 0.25;            // 公里
  const CELL_AREA = CELL * CELL;                    // 0.0625 平方公里
  const LAND = ['water', 'town', 'farm', 'forest', 'reserve'];
  const TOWN = { x: 4.5, y: 7.6, r: 1.55 }, VILLAGE = { x: 11.2, y: 3.0, r: 0.6 };
  const FAULT = [[2.6, 12.2], [7.2, 6.4], [12.6, 0]];
  const ROADS = [
    [[1.4, 0], [1.6, 4], [1.5, 8], [1.7, 12]],                                // 濱海公路（南北）
    [[1.6, 7.0], [4.5, 7.4], [8, 7.7], [11.4, 8.3], [15.5, 9.0]],             // 沿河北岸的省道
    [[4.5, 7.4], [6.5, 5.2], [9.0, 3.6], [11.2, 3.0], [13.5, 2.0]],           // 往東南村莊
    [[4.5, 7.4], [4.8, 10], [5.2, 12]]                                        // 往北
  ];
  const clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  // ---------------- 地形 ----------------
  function riverY(x) { return 6.2 + 0.9 * Math.sin(0.55 * x + 0.4) + 0.08 * x; }       // 河道中心線
  function riverBed(x) { return 0.5 + 0.9 * x + 0.075 * x * x; }                       // 河床高程（河口 0.5 m）
  function terrain(x, y) {
    const east = 520 / (1 + Math.exp(-(x - 12.5) / 1.3));                                // 東邊的山
    const hill = 230 * Math.exp(-(Math.pow((x - 8.6) / 1.5, 2) + Math.pow((y - 10.2) / 1.2, 2)));
    const ridge = 160 * Math.exp(-(Math.pow((x - 10.5) / 2.2, 2) + Math.pow((y - 1.4) / 1.0, 2)));
    const g2 = function (cx, cy, sx, sy, h) { return h * Math.exp(-(Math.pow((x - cx) / sx, 2) + Math.pow((y - cy) / sy, 2))); };
    const hills = g2(6.2, 2.0, 1.4, 1.0, 150) + g2(3.0, 11.0, 0.9, 0.8, 95) + g2(9.6, 5.0, 0.8, 0.7, 70) + g2(2.4, 2.6, 0.7, 0.9, 60);
    const plain = 3 + 3.2 * x + 0.6 * Math.abs(y - riverY(x)) + hills;
    const wig = 9 * Math.sin(1.7 * x + 0.8 * y) * Math.sin(1.1 * y - 0.6 * x) * clamp((x - 3) / 6, 0, 1);
    return plain + east * (0.75 + 0.25 * Math.sin(0.9 * y + 0.5)) + hill + ridge + wig;
  }
  function elevation(x, y) {
    const t = terrain(x, y), d = Math.abs(y - riverY(x)), zr = riverBed(x);
    const g = Math.exp(-Math.pow(d / 1.1, 2));             // 河谷：靠近河的地方被拉向河床高度（氾濫平原）
    const z = zr + 0.4 + (t - zr) * (1 - g) + 1.6 * d;
    return Math.max(zr, z);
  }

  // ---------------- 距離 ----------------
  function segDist(px, py, a, b) {
    const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy;
    const t = L2 ? clamp(((px - a[0]) * vx + (py - a[1]) * vy) / L2, 0, 1) : 0;
    return Math.hypot(px - a[0] - t * vx, py - a[1] - t * vy);
  }
  function lineDist(px, py, pts) {
    let m = Infinity;
    for (let i = 0; i + 1 < pts.length; i++) m = Math.min(m, segDist(px, py, pts[i], pts[i + 1]));
    return m;
  }
  function inTown(x, y) {
    return Math.hypot(x - TOWN.x, (y - TOWN.y) * 1.15) < TOWN.r || Math.hypot(x - VILLAGE.x, y - VILLAGE.y) < VILLAGE.r;
  }

  // ---------------- 建立全部圖層 ----------------
  let cache = null;
  function layers() {
    if (cache) return cache;
    const n = NX * NY;
    const L = {
      z: new Float64Array(n), slope: new Float64Array(n), hand: new Float64Array(n), fault: new Float64Array(n),
      road: new Float64Array(n), town: new Float64Array(n), land: new Uint8Array(n), river: new Float64Array(n)
    };
    const cx = function (i) { return (i + 0.5) * CELL; };
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i, x = cx(i), y = cx(j);
      L.z[k] = elevation(x, y);
      L.river[k] = Math.abs(y - riverY(x)) * 1000;
      L.hand[k] = L.z[k] - riverBed(x);
      L.fault[k] = lineDist(x, y, FAULT) * 1000;
      let r = Infinity;
      ROADS.forEach(function (p) { r = Math.min(r, lineDist(x, y, p)); });
      L.road[k] = r * 1000;
    }
    // 坡度（%）：中央差分，邊界用單邊差分
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      const iL = Math.max(0, i - 1), iR = Math.min(NX - 1, i + 1), jD = Math.max(0, j - 1), jU = Math.min(NY - 1, j + 1);
      const dzx = (L.z[j * NX + iR] - L.z[j * NX + iL]) / ((iR - iL) * CELL * 1000);
      const dzy = (L.z[jU * NX + i] - L.z[jD * NX + i]) / ((jU - jD) * CELL * 1000);
      L.slope[k] = 100 * Math.hypot(dzx, dzy);
    }
    // 土地使用
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i, x = cx(i), y = cx(j);
      let u;
      if (x < 0.75 || L.river[k] < 135) u = 0;
      else if (inTown(x, y)) u = 1;
      else if (L.z[k] > 330) u = 4;                          // 水源保護區（高山集水區）
      else if (L.slope[k] > 18 || L.z[k] > 130) u = 3;
      else u = 2;
      L.land[k] = u;
    }
    // 離住宅區的距離（m）：住宅格子中心之間的最短距離
    const towns = [];
    for (let k = 0; k < n; k++) if (L.land[k] === 1) towns.push(k);
    for (let k = 0; k < n; k++) {
      if (L.land[k] === 1) { L.town[k] = 0; continue; }
      const i = k % NX, j = (k - i) / NX;
      let m = Infinity;
      for (let q = 0; q < towns.length; q++) {
        const t = towns[q], ti = t % NX, tj = (t - ti) / NX;
        const d = (ti - i) * (ti - i) + (tj - j) * (tj - j);
        if (d < m) m = d;
      }
      L.town[k] = Math.sqrt(m) * CELL * 1000;
    }
    cache = L;
    return L;
  }

  // ---------------- 條件 ----------------
  // 每個條件：on（有沒有用）、v（門檻）；town 另有 near（true = 要靠近住宅，false = 要遠離）
  // land：允許的土地使用（陣列，元素是 0–4）
  const CRIT = ['slope', 'flood', 'fault', 'road', 'town', 'land'];
  const PRESETS = {
    incinerator: { stage: 2, slope: { on: true, v: 10 }, flood: { on: true, v: 0 }, fault: { on: true, v: 1000 }, road: { on: true, v: 500 }, town: { on: true, v: 2500, near: false }, land: { on: true, v: [2] },
      w: { slope: 2, flood: 3, fault: 3, road: 2, town: 4 } },
    school: { stage: 2, slope: { on: true, v: 5 }, flood: { on: true, v: 0 }, fault: { on: true, v: 500 }, road: { on: true, v: 300 }, town: { on: true, v: 600, near: true }, land: { on: true, v: [1, 2] },
      w: { slope: 2, flood: 4, fault: 3, road: 2, town: 4 } },
    solar: { stage: 2, slope: { on: true, v: 5 }, flood: { on: true, v: 0 }, fault: { on: false, v: 500 }, road: { on: true, v: 500 }, town: { on: false, v: 500, near: false }, land: { on: true, v: [2] },
      w: { slope: 4, flood: 3, fault: 0, road: 2, town: 0 } }
  };
  function preset(id) { return JSON.parse(JSON.stringify(PRESETS[id])); }
  function depthAt(L, k, stage) { return Math.max(0, stage - L.hand[k]); }

  /** 一格是否通過某個條件 */
  function passes(L, k, cfg, c) {
    const q = cfg[c];
    if (!q || !q.on) return true;
    switch (c) {
      case 'slope': return L.slope[k] <= q.v + 1e-9;
      case 'flood': return depthAt(L, k, cfg.stage) <= q.v + 1e-9;
      case 'fault': return L.fault[k] >= q.v - 1e-9;
      case 'road': return L.road[k] <= q.v + 1e-9;
      case 'town': return q.near ? L.town[k] <= q.v + 1e-9 : L.town[k] >= q.v - 1e-9;
      case 'land': return q.v.indexOf(L.land[k]) >= 0;
    }
    return true;
  }
  /** 0–1 的分數（加權疊合用）：門檻處 0.5，理想值 1，兩倍門檻 0 */
  function score(L, k, cfg, c) {
    const q = cfg[c];
    switch (c) {
      case 'slope': return clamp(1 - L.slope[k] / (2 * Math.max(q.v, 1)), 0, 1);
      case 'flood': return clamp(1 - depthAt(L, k, cfg.stage) / (2 * Math.max(q.v, 0.25)), 0, 1);
      case 'fault': return clamp(L.fault[k] / (2 * Math.max(q.v, 100)), 0, 1);
      case 'road': return clamp(1 - L.road[k] / (2 * Math.max(q.v, 100)), 0, 1);
      case 'town': return q.near ? clamp(1 - L.town[k] / (2 * Math.max(q.v, 100)), 0, 1) : clamp(L.town[k] / (2 * Math.max(q.v, 100)), 0, 1);
    }
    return 1;
  }

  /** 4 連通的區塊：回傳 { id（每格的區塊編號，0 = 不是），sizes（每塊的格數，索引 1 起） } */
  function patches(mask) {
    const n = NX * NY, id = new Int32Array(n), sizes = [0], stack = [];
    let next = 0;
    for (let s = 0; s < n; s++) {
      if (!mask[s] || id[s]) continue;
      next++; id[s] = next; stack.push(s);
      let cnt = 0;
      while (stack.length) {
        const k = stack.pop(); cnt++;
        const i = k % NX;
        const nb = [i > 0 ? k - 1 : -1, i < NX - 1 ? k + 1 : -1, k - NX, k + NX];
        for (let m = 0; m < 4; m++) { const q = nb[m]; if (q >= 0 && q < n && mask[q] && !id[q]) { id[q] = next; stack.push(q); } }
      }
      sizes.push(cnt);
    }
    return { id: id, sizes: sizes };
  }

  /** 布林疊合 */
  function boolean(cfg) {
    const L = layers(), n = NX * NY, mask = new Uint8Array(n), fail = {};
    CRIT.forEach(function (c) { fail[c] = 0; });
    let cnt = 0;
    for (let k = 0; k < n; k++) {
      let ok = true;
      for (let m = 0; m < CRIT.length; m++) {
        if (!passes(L, k, cfg, CRIT[m])) { ok = false; fail[CRIT[m]]++; }
      }
      if (ok) { mask[k] = 1; cnt++; }
    }
    const P = patches(mask);
    let big = 0, bigId = 0;
    for (let q = 1; q < P.sizes.length; q++) if (P.sizes[q] > big) { big = P.sizes[q]; bigId = q; }
    let cx = 0, cy = 0;
    if (bigId) { for (let k = 0; k < n; k++) if (P.id[k] === bigId) { cx += k % NX; cy += Math.floor(k / NX); } cx /= big; cy /= big; }
    return {
      mask: mask, cells: cnt, area: cnt * CELL_AREA, patchId: P.id,
      patches: P.sizes.length - 1, largest: big * CELL_AREA, fail: fail,
      center: bigId ? [(cx + 0.5) * CELL, (cy + 0.5) * CELL] : null,
      sitesBig: P.sizes.filter(function (s, q) { return q > 0 && s * CELL_AREA >= 0.25 - 1e-9; }).length   // 至少 0.25 km² 的連續用地有幾塊
    };
  }

  /** 加權疊合：適宜度 0–100 */
  function weighted(cfg, w) {
    const L = layers(), n = NX * NY, S = new Float64Array(n);
    const used = ['slope', 'flood', 'fault', 'road', 'town'].filter(function (c) { return (w[c] || 0) > 0; });
    const W = used.reduce(function (a, c) { return a + w[c]; }, 0);
    let best = -1, bestK = -1, hi = 0, sum = 0, valid = 0;
    for (let k = 0; k < n; k++) {
      if (cfg.land.on && cfg.land.v.indexOf(L.land[k]) < 0) { S[k] = 0; continue; }
      let s = 0;
      used.forEach(function (c) { s += w[c] * score(L, k, cfg, c); });
      S[k] = W > 0 ? 100 * s / W : 0;
      valid++; sum += S[k];
      if (S[k] >= 70) hi++;
      if (S[k] > best + 1e-12) { best = S[k]; bestK = k; }
    }
    return {
      score: S, best: best, bestK: bestK, bestXY: bestK >= 0 ? xyOf(bestK) : null,
      area70: hi * CELL_AREA, mean: valid ? sum / valid : 0, weights: W
    };
  }

  function xyOf(k) { const i = k % NX; return [(i + 0.5) * CELL, ((k - i) / NX + 0.5) * CELL]; }
  function cellAt(x, y) {
    const i = Math.floor(x / CELL), j = Math.floor(y / CELL);
    if (i < 0 || j < 0 || i >= NX || j >= NY) return -1;
    return j * NX + i;
  }
  /** 一格的全部資料 */
  function inspect(k, cfg) {
    const L = layers();
    const out = { k: k, x: xyOf(k)[0], y: xyOf(k)[1], z: L.z[k], slope: L.slope[k], hand: L.hand[k], depth: depthAt(L, k, cfg.stage), fault: L.fault[k], road: L.road[k], town: L.town[k], land: L.land[k], pass: {} };
    CRIT.forEach(function (c) { out.pass[c] = passes(L, k, cfg, c); });
    out.all = CRIT.every(function (c) { return out.pass[c]; });
    return out;
  }
  /** 淹水面積（km²）與淹水的住宅格數 */
  function floodStats(stage) {
    const L = layers();
    let a = 0, t = 0;
    for (let k = 0; k < NX * NY; k++) if (L.land[k] !== 0 && depthAt(L, k, stage) > 0) { a++; if (L.land[k] === 1) t++; }
    return { area: a * CELL_AREA, town: t * CELL_AREA };
  }

  return {
    NX: NX, NY: NY, CELL: CELL, CELL_AREA: CELL_AREA, LAND: LAND, TOWN: TOWN, VILLAGE: VILLAGE, FAULT: FAULT, ROADS: ROADS, CRIT: CRIT, PRESETS: PRESETS,
    riverY: riverY, riverBed: riverBed, elevation: elevation, segDist: segDist, lineDist: lineDist,
    layers: layers, preset: preset, depthAt: depthAt, passes: passes, score: score, patches: patches,
    boolean: boolean, weighted: weighted, xyOf: xyOf, cellAt: cellAt, inspect: inspect, floodStats: floodStats
  };
});
