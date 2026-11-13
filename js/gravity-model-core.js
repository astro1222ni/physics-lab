/* gravity-model-core.js — 重力模型與距離衰減的計算核心（瀏覽器與 Node 共用）
 *
 * 互動量（重力模型）：T_ij = P_i P_j / d_ij^b（P 以萬人計，d 以公里或分鐘計；只比較相對大小）
 * 雷利零售引力法則的分界點：從 i 出發走 x，使 P_i / x^b = P_j / (d − x)^b ⇒ x = d / (1 + (P_j / P_i)^(1/b))
 * 勢力範圍：地圖上每一點歸給「引力」P_k / d^b 最大的城市（雷利法則推廣到多城市）
 * 距離：直線距離（大圓距離）、開車時間（直線距離 × 道路繞行係數 ÷ 平均車速）、開車＋高鐵（取比較快的走法）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GravityCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const R_EARTH = 6371.0;
  /** 臺灣本島 19 個縣市（縣市政府所在地附近；人口取到萬人的約略值，2024 年底戶籍人口；外島未列入） */
  const CITIES = [
    { id: 'tpe', zh: '臺北', en: 'Taipei', lon: 121.565, lat: 25.038, pop: 249, hsr: 'tpe' },
    { id: 'ntp', zh: '新北', en: 'New Taipei', lon: 121.459, lat: 25.012, pop: 405, hsr: 'bq' },
    { id: 'kee', zh: '基隆', en: 'Keelung', lon: 121.744, lat: 25.131, pop: 36 },
    { id: 'tyn', zh: '桃園', en: 'Taoyuan', lon: 121.301, lat: 24.994, pop: 232, hsr: 'ty' },
    { id: 'hsc', zh: '新竹市', en: 'Hsinchu City', lon: 120.968, lat: 24.804, pop: 45 },
    { id: 'hsz', zh: '新竹縣', en: 'Hsinchu County', lon: 121.004, lat: 24.839, pop: 59, hsr: 'hc' },
    { id: 'mia', zh: '苗栗', en: 'Miaoli', lon: 120.821, lat: 24.560, pop: 54, hsr: 'ml' },
    { id: 'txg', zh: '臺中', en: 'Taichung', lon: 120.647, lat: 24.162, pop: 285, hsr: 'tc' },
    { id: 'chw', zh: '彰化', en: 'Changhua', lon: 120.542, lat: 24.081, pop: 122, hsr: 'ch' },
    { id: 'ntc', zh: '南投', en: 'Nantou', lon: 120.684, lat: 23.910, pop: 48 },
    { id: 'yun', zh: '雲林', en: 'Yunlin', lon: 120.543, lat: 23.709, pop: 66, hsr: 'yl' },
    { id: 'cyi', zh: '嘉義市', en: 'Chiayi City', lon: 120.449, lat: 23.480, pop: 26 },
    { id: 'cyq', zh: '嘉義縣', en: 'Chiayi County', lon: 120.333, lat: 23.459, pop: 48, hsr: 'cy' },
    { id: 'tnn', zh: '臺南', en: 'Tainan', lon: 120.227, lat: 22.992, pop: 185, hsr: 'tn' },
    { id: 'khh', zh: '高雄', en: 'Kaohsiung', lon: 120.312, lat: 22.621, pop: 272, hsr: 'zy' },
    { id: 'pif', zh: '屏東', en: 'Pingtung', lon: 120.488, lat: 22.670, pop: 79 },
    { id: 'ila', zh: '宜蘭', en: 'Yilan', lon: 121.753, lat: 24.757, pop: 45 },
    { id: 'hua', zh: '花蓮', en: 'Hualien', lon: 121.607, lat: 23.991, pop: 32 },
    { id: 'ttt', zh: '臺東', en: 'Taitung', lon: 121.146, lat: 22.756, pop: 21 }
  ];
  /** 高鐵車站（約略位置），由北到南 */
  const HSR = [
    { id: 'ng', lon: 121.616, lat: 25.053 }, { id: 'tpe', lon: 121.517, lat: 25.048 }, { id: 'bq', lon: 121.464, lat: 25.014 },
    { id: 'ty', lon: 121.214, lat: 25.013 }, { id: 'hc', lon: 121.040, lat: 24.808 }, { id: 'ml', lon: 120.826, lat: 24.605 },
    { id: 'tc', lon: 120.616, lat: 24.112 }, { id: 'ch', lon: 120.575, lat: 23.874 }, { id: 'yl', lon: 120.416, lat: 23.736 },
    { id: 'cy', lon: 120.323, lat: 23.459 }, { id: 'tn', lon: 120.286, lat: 22.925 }, { id: 'zy', lon: 120.308, lat: 22.687 }
  ];
  /** 本島海岸線（簡化的示意輪廓，經度、緯度） */
  const COAST = [
    [121.537, 25.298], [121.64, 25.23], [121.74, 25.15], [121.92, 25.13], [122.00, 25.01], [121.86, 24.86], [121.83, 24.70],
    [121.87, 24.59], [121.80, 24.45], [121.76, 24.30], [121.70, 24.18], [121.62, 24.00], [121.55, 23.75], [121.52, 23.60],
    [121.45, 23.40], [121.38, 23.10], [121.25, 22.90], [121.16, 22.75], [121.00, 22.60], [120.90, 22.35], [120.85, 22.10],
    [120.85, 21.90], [120.73, 21.93], [120.70, 22.05], [120.59, 22.37], [120.45, 22.47], [120.27, 22.60], [120.20, 22.80],
    [120.10, 23.00], [120.07, 23.15], [120.12, 23.40], [120.15, 23.47], [120.18, 23.70], [120.25, 23.95], [120.40, 24.08],
    [120.50, 24.27], [120.60, 24.45], [120.70, 24.60], [120.90, 24.82], [121.00, 24.95], [121.08, 25.04], [121.25, 25.12],
    [121.40, 25.18], [121.50, 25.29]
  ];

  // ---------------- 距離 ----------------
  const RAD = Math.PI / 180;
  /** 大圓距離（km），半正矢公式 */
  function haversine(a, b) {
    const p1 = a.lat * RAD, p2 = b.lat * RAD, dp = p2 - p1, dl = (b.lon - a.lon) * RAD;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  const ROAD = 1.3, CAR = 60;            // 道路繞行係數、平均車速（km/h）
  const HSR_V = 200, HSR_WAIT = 25;      // 高鐵平均速度（含停站，km/h）、進出車站與等車（分鐘）
  /** 開車時間（分鐘） */
  const carMin = km => km * ROAD / CAR * 60;
  /** 兩地之間的「距離」：mode = 'km'（直線距離）、'car'（開車分鐘）、'hsr'（開車與「開車到高鐵站＋高鐵＋開車」取快的） */
  function dist(a, b, mode) {
    const km = haversine(a, b);
    if (mode === 'km' || !mode) return km;
    const car = carMin(km);
    if (mode === 'car') return car;
    let best = car;
    // 最近的高鐵站（各自開車過去）
    const sa = nearestStation(a), sb = nearestStation(b);
    if (sa.st.id !== sb.st.id) {
      const rail = haversine(sa.st, sb.st) / HSR_V * 60;
      best = Math.min(best, carMin(sa.km) + carMin(sb.km) + HSR_WAIT + rail);
    }
    return best;
  }
  function nearestStation(p) {
    let st = HSR[0], km = Infinity;
    HSR.forEach(s => { const d = haversine(p, s); if (d < km) { km = d; st = s; } });
    return { st, km };
  }

  // ---------------- 重力模型 ----------------
  /** 互動量 T = Pi Pj / d^b（d 太小時以 1 計，避免無限大） */
  function interaction(Pi, Pj, d, b) { return Pi * Pj / Math.pow(Math.max(d, 1), b); }
  /** 某一個城市對其他城市的互動：回傳依大小排序的 [{ j, T, d, share }] */
  function flowsFrom(list, i, b, mode) {
    const out = [];
    let sum = 0;
    list.forEach((c, j) => {
      if (j === i) return;
      const d = dist(list[i], c, mode), T = interaction(list[i].pop, c.pop, d, b);
      out.push({ j, T, d }); sum += T;
    });
    out.forEach(o => { o.share = o.T / sum; });
    out.sort((x, y) => y.T - x.T);
    return out;
  }
  /** 所有城市對（i < j）的互動 */
  function allPairs(list, b, mode) {
    const out = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const d = dist(list[i], list[j], mode);
      out.push({ i, j, d, T: interaction(list[i].pop, list[j].pop, d, b) });
    }
    out.sort((x, y) => y.T - x.T);
    return out;
  }
  /** 雷利分界點：從 i 出發、在 i 與 j 連線上的距離比例 x/d */
  function breakFrac(Pi, Pj, b) { return 1 / (1 + Math.pow(Pj / Pi, 1 / b)); }
  /** 引力（某一點受城市 c 吸引的大小） */
  function pull(c, p, b, mode) { return c.pop / Math.pow(Math.max(dist(c, p, mode), 1), b); }
  /** 某一點的勢力歸屬：回傳 { k（最大的城市）, ratio（第一名 ÷ 第二名） } */
  function dominant(list, p, b, mode) {
    let k = -1, f1 = -1, f2 = -1;
    list.forEach((c, i) => { const f = pull(c, p, b, mode); if (f > f1) { f2 = f1; f1 = f; k = i; } else if (f > f2) f2 = f; });
    return { k, ratio: f2 > 0 ? f1 / f2 : Infinity };
  }
  /** 最小平方法：由 (d, T/(PiPj)) 的對數擬合 b（斜率的負值） */
  function fitB(pairs, list) {
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    pairs.forEach(p => {
      const x = Math.log(Math.max(p.d, 1)), y = Math.log(p.T / (list[p.i].pop * list[p.j].pop));
      n++; sx += x; sy += y; sxx += x * x; sxy += x * y;
    });
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    return -slope;
  }

  // ---------------- 地圖 ----------------
  const LAT0 = 23.7, KX = 111.32 * Math.cos(LAT0 * RAD), KY = 110.57;
  /** 經緯度 → 平面 km（以 120°E、21.8°N 為原點，等距圓柱投影） */
  const toXY = p => [(p.lon - 120) * KX, (p.lat - 21.8) * KY];
  const fromXY = (x, y) => ({ lon: 120 + x / KX, lat: 21.8 + y / KY });
  function inside(pt) {
    let c = false;
    for (let i = 0, j = COAST.length - 1; i < COAST.length; j = i++) {
      const [xi, yi] = COAST[i], [xj, yj] = COAST[j];
      if ((yi > pt.lat) !== (yj > pt.lat) && pt.lon < (xj - xi) * (pt.lat - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  /** 島上的格子（每格 step km），只留在本島範圍內的格子；每格附上離它最近的高鐵站 */
  const GRID = new Map();
  function grid(step) {
    let g = GRID.get(step);
    if (g) return g;
    const W = 2.1 * KX, H = 3.5 * KY, nx = Math.ceil(W / step), ny = Math.ceil(H / step), cells = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const p = fromXY((i + 0.5) * step, (j + 0.5) * step);
      if (inside(p)) cells.push({ i, j, p, ns: nearestStation(p) });
    }
    g = { step, nx, ny, cells };
    GRID.set(step, g);
    return g;
  }
  /** 勢力範圍：每一格歸給引力最大的城市；回傳 { grid, k（每格的城市編號）, ratio（第一名 ÷ 第二名）, area（每個城市的面積 km^2） } */
  function areas(list, b, mode, step) {
    const g = grid(step || 3), n = g.cells.length, k = new Int16Array(n), ratio = new Float32Array(n), area = list.map(() => 0);
    const cs = list.map(c => nearestStation(c));
    for (let q = 0; q < n; q++) {
      const cell = g.cells[q], p = cell.p;
      let f1 = -1, f2 = -1, best = -1;
      for (let i = 0; i < list.length; i++) {
        const c = list[i], km = haversine(c, p);
        let d = km;
        if (mode === 'hsr') {
          d = carMin(km);
          if (cs[i].st.id !== cell.ns.st.id) d = Math.min(d, carMin(cs[i].km) + carMin(cell.ns.km) + HSR_WAIT + haversine(cs[i].st, cell.ns.st) / HSR_V * 60);
        }
        const f = c.pop / Math.pow(Math.max(d, 1), b);
        if (f > f1) { f2 = f1; f1 = f; best = i; } else if (f > f2) f2 = f;
      }
      k[q] = best; ratio[q] = f2 > 0 ? f1 / f2 : 1e9; area[best] += g.step * g.step;
    }
    return { grid: g, k, ratio, area };
  }
  /** 加入虛擬新市鎮後的城市清單 */
  function withTown(town) {
    if (!town) return CITIES.slice();
    return CITIES.concat([{ id: 'new', zh: '新市鎮', en: 'New town', lon: town.lon, lat: town.lat, pop: town.pop }]);
  }

  /**
   * 任務事件用的摘要（頁面與任務證明共用）。
   * st = { view, mode, b, from, to, town（null 或 { lon, lat }）, pop }；ar = 勢力範圍（只在勢力範圍畫面傳入）
   */
  function summary(st, ar) {
    const list = withTown(st.town ? { lon: st.town.lon, lat: st.town.lat, pop: st.pop } : null);
    const ix = id => list.findIndex(c => c.id === id);
    const fl = flowsFrom(list, ix(st.from), st.b, st.mode), shares = {};
    fl.forEach(o => { shares[list[o.j].id] = o.share; });
    const a = list[ix(st.from)], b = list[ix(st.to)];
    let pair = null;
    if (a && b && a.id !== b.id) {
      const km = haversine(a, b), f = breakFrac(a.pop, b.pop, st.b), pa = toXY(a), pb = toXY(b);
      const bp = fromXY(pa[0] + f * (pb[0] - pa[0]), pa[1] + f * (pb[1] - pa[1]));
      let near = null, nk = Infinity;
      CITIES.forEach(c => { if (c.id === a.id || c.id === b.id) return; const d = haversine(c, bp); if (d < nk) { nk = d; near = c.id; } });
      pair = { km, car: dist(a, b, 'car'), hsr: dist(a, b, 'hsr'), frac: f, fracBig: a.pop >= b.pop ? f : 1 - f,
        popRatio: Math.max(a.pop, b.pop) / Math.min(a.pop, b.pop), near, nearKm: nk, at: bp };
    }
    let town = null;
    if (st.town) {
      const ti = list.length - 1, t = list[ti], tf = flowsFrom(list, ti, st.b, st.mode);
      const pulls = CITIES.map(c => ({ id: c.id, f: pull(c, t, st.b, st.mode) })).sort((x, y) => y.f - x.f);
      let off = null;
      if (pair && a.id !== 'new' && b.id !== 'new') {
        const pa = toXY(a), pb = toXY(b), pt = toXY(t), dx = pb[0] - pa[0], dy = pb[1] - pa[1];
        const u = Math.max(0, Math.min(1, ((pt[0] - pa[0]) * dx + (pt[1] - pa[1]) * dy) / (dx * dx + dy * dy)));
        off = Math.hypot(pt[0] - pa[0] - u * dx, pt[1] - pa[1] - u * dy);
      }
      town = { lon: t.lon, lat: t.lat, pop: st.pop, top: list[tf[0].j].id, dom: pulls[0].id, top3: pulls[0].f / pulls[2].f,
        pf: a && a.id !== 'new' ? pull(a, t, st.b, st.mode) : null, pt: b && b.id !== 'new' ? pull(b, t, st.b, st.mode) : null,
        off, area: ar ? ar.area[ti] : null };
    }
    let area = null;
    if (ar) { area = {}; list.forEach((c, i) => { area[c.id] = ar.area[i]; }); }
    return { view: st.view, mode: st.mode, b: st.b, from: st.from, to: st.to, order: fl.map(o => list[o.j].id), shares, pair, town, area, flows: fl, list };
  }

  return {
    summary,
    R_EARTH, CITIES, HSR, COAST, ROAD, CAR, HSR_V, HSR_WAIT, KX, KY,
    haversine, carMin, dist, nearestStation, interaction, flowsFrom, allPairs, breakFrac, pull, dominant, fitB,
    toXY, fromXY, inside, withTown, grid, areas
  };
});
