/* von-thunen-core.js — 杜能（J. H. von Thünen）農業區位論的計算核心（純函式，瀏覽器與 Node 共用）
 *
 * 假設（杜能的「孤立國」）：一片均質平原，中央一座城市是唯一的市場；所有農產品都運到城裡賣，
 * 運費和距離成正比。每一種作物在距離 d 的一公頃土地上能付出的地租（區位地租）是
 *
 *   R(d) = Y (p − c) − Y f m d
 *
 *   Y：每公頃產量（噸／公頃・年）　p：城裡的價格（元／噸）　c：生產成本（元／噸）
 *   f：運費（元／噸・公里）　m：運輸技術的倍率（全部作物一起乘；1 = 杜能的設定）
 *
 * 每一塊地種「能付最高地租」的作物；地租都 ≤ 0 的地方沒有人耕種（荒野）。
 * 地租線是直線：在城市的高度 A = Y(p − c)，每公里下降 B = Y f m。坡度越陡的作物排在越內圈。
 *
 * 河流：一條通過城市、東西向的河，河運每噸公里的運費是陸運的 k 倍（0 < k ≤ 1），沿岸任何地方都能上船。
 * 一塊地 (x, y)（公里，城市在原點，河在 x 軸）運到城裡的最省成本換算成陸路距離 D：
 *   先走陸路到河邊、再坐船，最省的上岸點使陸路段和河的夾角 θ 滿足 cos θ = k（和光的折射同一個道理）；
 *   |x| ≥ k|y| / √(1 − k²) 時 D = k|x| + |y|√(1 − k²)，否則直接走陸路 D = √(x² + y²)。
 * 同一個 D 的點連起來是「圓弧＋兩條切線」的梭形，所以每一個圈都順著河拉長；沿河方向延伸成 1/k 倍。
 * D ≤ r 的面積 = π S(k) r²，S(k) = 2[arcsin k + √(1 − k²)/k] / π（k = 1 時 S = 1，就是圓）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VonCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const IDS = ['veg', 'wood', 'grain', 'live'];
  /** 杜能的設定（虛構但比例合理的數字）：圈的邊界 12.5、19、44.7 km，農業最外緣 90 km */
  const DEFAULTS = {
    veg: { Y: 20, p: 800, c: 500, f: 20 },     // 蔬菜與牛奶：產量高、容易壞，運費貴
    wood: { Y: 10, p: 300, c: 150, f: 4 },     // 林木（薪柴與木材）：又重又占體積
    grain: { Y: 4, p: 500, c: 220, f: 5 },     // 穀物：耐放
    live: { Y: 0.5, p: 2000, c: 1100, f: 10 }  // 放牧：每公頃產量低，牲口自己走路進城
  };
  const LIMITS = {
    Y: [0.1, 40], p: [0, 3000], c: [0, 3000], f: [0.5, 40], m: [0.25, 2], k: [0.05, 1]
  };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  /** 作物在城市（d = 0）的地租 A 與每公里下降量 B */
  function A(cr) { return cr.Y * (cr.p - cr.c); }
  function B(cr, m) { return cr.Y * cr.f * (m == null ? 1 : m); }
  function rent(cr, d, m) { return A(cr) - B(cr, m) * d; }

  /** 取出要算的作物：crops = { veg: {Y,p,c,f,on}, … }；on === false 的不種 */
  function active(crops) {
    return IDS.filter(function (id) { return crops[id] && crops[id].on !== false; })
      .map(function (id) { return { id: id, cr: crops[id] }; });
  }

  /**
   * 地租線的上包絡：回傳由內而外的圈 [{ id, from, to, rFrom, rTo }]（距離是換算成陸路的 D，公里）
   * 與農業的最外緣 frontier（地租降到 0 的距離；沒有任何作物有正地租時為 0）。
   * 同一點兩種作物地租相同時，交給坡度較緩（之後會贏）的作物；寬度為 0 的圈不列出。
   */
  function rings(crops, m) {
    m = m == null ? 1 : m;
    const L = active(crops).map(function (o) { return { id: o.id, a: A(o.cr), b: B(o.cr, m) }; });
    const out = [];
    if (!L.length) return { rings: out, frontier: 0 };
    // 起點：城市地租最高；同高時坡度較緩的贏
    let cur = null;
    L.forEach(function (l) { if (!cur || l.a > cur.a + 1e-9 || (Math.abs(l.a - cur.a) <= 1e-9 && l.b < cur.b)) cur = l; });
    if (cur.a <= 0) return { rings: out, frontier: 0 };
    let d = 0;
    for (let guard = 0; guard < 16; guard++) {
      const d0 = cur.a / cur.b;
      let next = null, dn = Infinity;
      L.forEach(function (l) {
        if (l === cur || l.b >= cur.b) return;
        const x = (cur.a - l.a) / (cur.b - l.b);
        if (x < d - 1e-9) return;
        if (x < dn - 1e-9 || (Math.abs(x - dn) <= 1e-9 && l.b < next.b)) { dn = x; next = l; }
      });
      if (!next || dn >= d0) {
        if (d0 > d) out.push({ id: cur.id, from: d, to: d0, rFrom: cur.a - cur.b * d, rTo: 0 });
        return { rings: out, frontier: d0 > d ? d0 : d };
      }
      if (dn > d + 1e-9) out.push({ id: cur.id, from: d, to: dn, rFrom: cur.a - cur.b * d, rTo: cur.a - cur.b * dn });
      d = Math.max(d, dn); cur = next;
    }
    return { rings: out, frontier: d };
  }

  /** 距離 D 的地方種什麼：{ id, rent }（荒野 id 為 null） */
  function bestAt(crops, D, m) {
    let best = null, br = 0;
    active(crops).forEach(function (o) {
      const r = rent(o.cr, D, m);
      if (r > br + 1e-9 || (best && Math.abs(r - br) <= 1e-9 && B(o.cr, m) < B(crops[best], m))) { best = o.id; br = r; }
    });
    return { id: best, rent: best ? br : 0 };
  }

  /**
   * 一塊地 (x, y) 運到城裡的最省路線。river：{ on, k }。
   * 回傳 { D（換算成陸路的距離）, dist（直線距離）, usesRiver, land（陸路段長度）, water（河運段長度）,
   *        landing（上岸點的 x）, angle（陸路段和河的夾角，度；沒走河時為 null） }
   */
  function route(x, y, river) {
    const dist = Math.hypot(x, y);
    const k = river && river.on ? river.k : 1;
    if (!(k < 1)) return { D: dist, dist: dist, usesRiver: false, land: dist, water: 0, landing: null, angle: null };
    const ax = Math.abs(x), ay = Math.abs(y), sq = Math.sqrt(1 - k * k);
    const t = k * ay / sq;                // 上岸點到 (x, 0) 的水平距離
    if (ax < t) return { D: dist, dist: dist, usesRiver: false, land: dist, water: 0, landing: null, angle: null };
    const land = Math.hypot(t, ay), water = ax - t;
    return { D: k * water + land, dist: dist, usesRiver: true, land: land, water: water, landing: Math.sign(x || 1) * water, angle: Math.acos(k) * 180 / Math.PI };
  }
  function costDist(x, y, river) { return route(x, y, river).D; }

  /** 面積倍數：有河時 D ≤ r 的面積是沒有河時的 S(k) 倍 */
  function areaFactor(river) {
    const k = river && river.on ? river.k : 1;
    if (!(k < 1)) return 1;
    return 2 * (Math.asin(k) + Math.sqrt(1 - k * k) / k) / Math.PI;
  }
  /** D ≤ r 的區域面積（平方公里） */
  function areaWithin(r, river) { return Math.PI * areaFactor(river) * r * r; }

  /**
   * D = r 的等距線（梭形）上的點，逆時針，用來畫圖：回傳 [[x, y], …]（公里）
   * 沒有河時是圓；有河時是圓弧加上通到 (±r/k, 0) 的切線。
   */
  function levelPath(r, river, n) {
    n = n || 96;
    const k = river && river.on ? river.k : 1;
    const pts = [];
    if (!(k < 1)) {
      for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n; pts.push([r * Math.cos(a), r * Math.sin(a)]); }
      return pts;
    }
    const phi = Math.acos(k), tip = r / k;
    const arc = function (a0, a1) {
      const m = Math.max(2, Math.ceil(n * (a1 - a0) / (2 * Math.PI)));
      for (let i = 0; i <= m; i++) { const a = a0 + (a1 - a0) * i / m; pts.push([r * Math.cos(a), r * Math.sin(a)]); }
    };
    pts.push([tip, 0]);
    arc(phi, Math.PI - phi);
    pts.push([-tip, 0]);
    arc(Math.PI + phi, 2 * Math.PI - phi);
    return pts;
  }

  /**
   * 各圈的面積（平方公里）與全區總地租（元／年）。1 平方公里 = 100 公頃。
   * 總地租 = ∫ R dA，dA = 2π S r dr；每一圈的地租是直線，可以積出來。
   */
  function totals(crops, m, river) {
    const g = rings(crops, m), S = areaFactor(river);
    let tr = 0;
    const areas = {};
    IDS.forEach(function (id) { areas[id] = 0; });
    g.rings.forEach(function (s) {
      const cr = crops[s.id], a = A(cr), b = B(cr, m), r0 = s.from, r1 = s.to;
      areas[s.id] += Math.PI * S * (r1 * r1 - r0 * r0);
      tr += 2 * Math.PI * S * (a * (r1 * r1 - r0 * r0) / 2 - b * (r1 * r1 * r1 - r0 * r0 * r0) / 3) * 100;
    });
    return { rings: g.rings, frontier: g.frontier, areas: areas, farm: Math.PI * S * g.frontier * g.frontier, totalRent: tr, S: S };
  }

  /** 兩種作物的地租線交點（距離 D）；平行時回傳 null */
  function crossing(c1, c2, m) {
    const db = B(c1, m) - B(c2, m);
    if (Math.abs(db) < 1e-12) return null;
    return (A(c1) - A(c2)) / db;
  }

  /**
   * 整體摘要（頁面讀數、任務事件、任務證明共用）：
   * set = { crops, m, river: { on, k }, probe: { x, y } 或 null }
   */
  function summary(set) {
    const crops = set.crops, m = set.m, river = set.river && set.river.on ? set.river : { on: false, k: 1 };
    const t = totals(crops, m, river);
    const allOn = IDS.every(function (id) { return crops[id].on !== false; });
    const present = {}, width = {}, inner = {}, outer = {}, share = {};
    IDS.forEach(function (id) { present[id] = false; width[id] = 0; inner[id] = null; outer[id] = null; share[id] = 0; });
    t.rings.forEach(function (s) {
      present[s.id] = true; width[s.id] += s.to - s.from;
      if (inner[s.id] == null) inner[s.id] = s.from;
      outer[s.id] = s.to;
    });
    IDS.forEach(function (id) { share[id] = t.farm > 0 ? t.areas[id] / t.farm : 0; });
    const cr = {};
    IDS.forEach(function (id) {
      const c = crops[id];
      cr[id] = { on: c.on !== false, Y: c.Y, p: c.p, c: c.c, f: c.f, A: A(c), B: B(c, m), d0: A(c) > 0 ? A(c) / B(c, m) : 0 };
    });
    const changedYPC = IDS.some(function (id) {
      const c = crops[id], d = DEFAULTS[id];
      return Math.abs(c.Y - d.Y) > 1e-9 || Math.abs(c.p - d.p) > 1e-9 || Math.abs(c.c - d.c) > 1e-9;
    });
    // 三條地租線交在同一點（而且就在最高的包絡線上）：三組交點距離的最大差
    const on = IDS.filter(function (id) { return cr[id].on && cr[id].A > 0; });
    let tie3 = null;
    for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) for (let l = j + 1; l < on.length; l++) {
      const a = crops[on[i]], b = crops[on[j]], c = crops[on[l]];
      const x1 = crossing(a, b, m), x2 = crossing(a, c, m), x3 = crossing(b, c, m);
      if (x1 == null || x2 == null || x3 == null) continue;
      const lo = Math.min(x1, x2, x3), hi = Math.max(x1, x2, x3), d = (lo + hi) / 2;
      if (!(lo > 0)) continue;
      const r = Math.min(rent(a, d, m), rent(b, d, m), rent(c, d, m));
      const best = bestAt(crops, d, m).rent;
      if (r <= 0 || r < best - Math.max(1, 0.01 * best)) continue;
      if (!tie3 || hi - lo < tie3.spread) tie3 = { spread: hi - lo, d: d, ids: [on[i], on[j], on[l]] };
    }
    // 兩條地租線平行（坡度相同）：最接近的一對的坡度比
    let parallel = null;
    for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) {
      const q = Math.abs(cr[on[i]].B / cr[on[j]].B - 1);
      if (!parallel || q < parallel.q) parallel = { q: q, ids: [on[i], on[j]] };
    }
    let probe = null;
    if (set.probe) {
      const rt = route(set.probe.x, set.probe.y, river), b = bestAt(crops, rt.D, m);
      probe = { x: set.probe.x, y: set.probe.y, dist: rt.dist, D: rt.D, usesRiver: rt.usesRiver, land: rt.land, water: rt.water,
        landing: rt.landing, angle: rt.angle, id: b.id, rent: b.rent };
    }
    return {
      river: !!river.on, k: river.on ? river.k : 1, m: m, crops: cr, allOn: allOn, changedYPC: changedYPC,
      rings: t.rings, order: t.rings.map(function (s) { return s.id; }), present: present, width: width, inner: inner, outer: outer,
      frontier: t.frontier, frontierRiver: river.on && river.k < 1 ? t.frontier / river.k : t.frontier,
      areas: t.areas, share: share, farm: t.farm, S: t.S, totalRent: t.totalRent,
      tie3: tie3, parallel: parallel, probe: probe
    };
  }
  /** 杜能設定（沒有河、運費倍率 1）的全區總地租 */
  const TOTAL0 = (function () {
    const o = {};
    IDS.forEach(function (id) { o[id] = Object.assign({ on: true }, DEFAULTS[id]); });
    return totals(o, 1, null).totalRent;
  })();

  /** 杜能設定的複本（可以放心修改） */
  function defaults() {
    const o = {};
    IDS.forEach(function (id) { o[id] = Object.assign({ on: true }, DEFAULTS[id]); });
    return o;
  }

  return {
    IDS: IDS, DEFAULTS: DEFAULTS, LIMITS: LIMITS, clamp: clamp,
    A: A, B: B, rent: rent, rings: rings, bestAt: bestAt, route: route, costDist: costDist,
    areaFactor: areaFactor, areaWithin: areaWithin, levelPath: levelPath, totals: totals, crossing: crossing, defaults: defaults,
    summary: summary, TOTAL0: TOTAL0
  };
});
