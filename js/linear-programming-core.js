/* linear-programming-core.js — 「線性規劃：可行域與目標函數」的數學核心（純函式，瀏覽器與 Node 共用）
 *
 * 限制式 a x + b y ≤ c（或 ≥ c）各是一個半平面；全部同時成立的點組成可行域，是一個凸多邊形（可能沒有、可能往外無限延伸）。
 * 目標函數 z = p x + q y 的等高線 p x + q y = k 是一族平行線：k 變大時往 (p, q) 的方向平移。
 * 線性規劃基本定理：可行域有界且不空時，z 的最大值與最小值一定出現在頂點上；
 *   若目標函數的等高線剛好和某一條邊平行，那條邊上每一點都一樣好（無限多組最佳解）。
 * 可行域無界時，z 可能沒有最大（或最小）值。整數規劃：只取格子點時，最佳解不一定在離頂點最近的格子點。 */
(function (root) {
  'use strict';
  const BIG = 1e6;      // 判斷無界用的大方框
  const EPS = 1e-9;

  /** 把限制式整理成 a x + b y ≤ c 的形式（s = '>=' 時兩邊乘 −1）；a = b = 0 的式子保留（0 ≤ c 恆成立或恆不成立） */
  function norm(con) {
    const k = con.s === '>=' ? -1 : 1;
    return { a: k * con.a, b: k * con.b, c: k * con.c };
  }
  /** 全部的限制式（含 x ≥ 0、y ≥ 0），都化成 ≤ */
  function allCons(cons, opts) {
    const list = cons.filter(function (c) { return !c.off; }).map(norm);
    if (!opts || opts.nonneg !== false) { list.push({ a: -1, b: 0, c: 0, axis: 'x' }); list.push({ a: 0, b: -1, c: 0, axis: 'y' }); }
    return list;
  }
  /** 點 (x, y) 是否滿足全部限制式（容許誤差 tol） */
  function feasible(cons, x, y, opts, tol) {
    const t = tol === undefined ? 1e-9 : tol;
    return allCons(cons, opts).every(function (c) { return c.a * x + c.b * y <= c.c + t * (1 + Math.abs(c.c)); });
  }
  /** 用一個半平面 a x + b y ≤ c 切多邊形（Sutherland–Hodgman） */
  function clip(poly, c) {
    const out = [];
    const f = function (p) { return c.a * p[0] + c.b * p[1] - c.c; };
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i], Q = poly[(i + 1) % poly.length];
      const fp = f(P), fq = f(Q);
      if (fp <= EPS) out.push(P);
      if ((fp < -EPS && fq > EPS) || (fp > EPS && fq < -EPS)) {
        const t = fp / (fp - fq);
        out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]);
      }
    }
    // 去掉幾乎重合的相鄰點
    const clean = [];
    out.forEach(function (p) {
      const q = clean[clean.length - 1];
      if (!q || Math.abs(p[0] - q[0]) > 1e-9 * (1 + Math.abs(p[0])) || Math.abs(p[1] - q[1]) > 1e-9 * (1 + Math.abs(p[1]))) clean.push(p);
    });
    if (clean.length > 1) {
      const a = clean[0], b = clean[clean.length - 1];
      if (Math.abs(a[0] - b[0]) <= 1e-9 * (1 + Math.abs(a[0])) && Math.abs(a[1] - b[1]) <= 1e-9 * (1 + Math.abs(a[1]))) clean.pop();
    }
    return clean;
  }
  /** 可行域和方框 box = [x0, x1, y0, y1] 的交集（逆時針的多邊形頂點；空集合時 []） */
  function clipBox(cons, box, opts) {
    let poly = [[box[0], box[2]], [box[1], box[2]], [box[1], box[3]], [box[0], box[3]]];
    const list = allCons(cons, opts);
    for (let i = 0; i < list.length && poly.length; i++) {
      const c = list[i];
      if (Math.abs(c.a) < EPS && Math.abs(c.b) < EPS) { if (c.c < -EPS) poly = []; continue; }
      poly = clip(poly, c);
    }
    return poly.length >= 3 ? poly : [];
  }
  function area(poly) {
    let s = 0;
    for (let i = 0; i < poly.length; i++) { const P = poly[i], Q = poly[(i + 1) % poly.length]; s += P[0] * Q[1] - Q[0] * P[1]; }
    return Math.abs(s) / 2;
  }
  function onBig(p) { return Math.abs(Math.abs(p[0]) - BIG) < 1 || Math.abs(Math.abs(p[1]) - BIG) < 1; }

  /** 可行域：{ empty, bounded, vertices（真正的頂點，逆時針）, area（有界時）, big（大方框裁切後的多邊形） }
   *  只有一個點或一條線段（面積 0）時也算不空：vertices 是那些點 */
  function region(cons, opts) {
    const big = clipBox(cons, [-BIG, BIG, -BIG, BIG], opts);
    if (!big.length) {
      // 面積 0 的可行域（例如兩條限制線重合成一條線段、或只剩一點）：用所有交點檢查
      const pts = candidatePoints(cons, opts).filter(function (p) { return feasible(cons, p[0], p[1], opts, 1e-7); });
      if (!pts.length) return { empty: true, bounded: true, vertices: [], area: 0, big: [] };
      const uniq = dedupe(pts);
      return { empty: false, bounded: true, vertices: uniq, area: 0, big: [], degenerate: true };
    }
    const bounded = !big.some(onBig);
    // 大方框裁切會留下約 1e-10 的誤差：每個頂點改用它所在的兩條限制線精確求交點
    const lines = allCons(cons, opts).filter(function (c) { return Math.abs(c.a) > EPS || Math.abs(c.b) > EPS; });
    const vertices = big.filter(function (p) { return !onBig(p); }).map(function (p) {
      const on = lines.map(function (c) { return { c: c, r: Math.abs(c.a * p[0] + c.b * p[1] - c.c) / Math.hypot(c.a, c.b) }; })
        .sort(function (u, v) { return u.r - v.r; });
      for (let i = 0; i < on.length && on[i].r < 1e-6; i++) {
        for (let j = i + 1; j < on.length && on[j].r < 1e-6; j++) {
          const m = meet(on[i].c, on[j].c);
          if (m && Math.hypot(m[0] - p[0], m[1] - p[1]) < 1e-6) return m;
        }
      }
      return p;
    });
    big.forEach(function (p, i) { if (!onBig(p)) { const k = big.filter(function (q, j) { return j < i && !onBig(q); }).length; big[i] = vertices[k]; } });
    return { empty: false, bounded: bounded, vertices: vertices, area: bounded ? area(big) : Infinity, big: big };
  }
  function dedupe(pts) {
    const out = [];
    pts.forEach(function (p) { if (!out.some(function (q) { return Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-7; })) out.push(p); });
    return out;
  }
  /** 兩條限制線的交點（平行時 null） */
  function meet(c1, c2) {
    const det = c1.a * c2.b - c2.a * c1.b;
    if (Math.abs(det) < 1e-12) return null;
    return [(c1.c * c2.b - c2.c * c1.b) / det, (c1.a * c2.c - c2.a * c1.c) / det];
  }
  function candidatePoints(cons, opts) {
    const list = allCons(cons, opts).filter(function (c) { return Math.abs(c.a) > EPS || Math.abs(c.b) > EPS; });
    const out = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const m = meet(list[i], list[j]); if (m) out.push(m); }
    return out;
  }

  /** z = p x + q y 在可行域上的最大（sense = 'max'）或最小值
   *  { status: 'empty' | 'unbounded' | 'unique' | 'edge' | 'all', z, x, y, best（所有最佳頂點）, verts: [{ x, y, z }] } */
  function optimize(cons, p, q, sense, opts) {
    const R = region(cons, opts);
    const sg = sense === 'min' ? -1 : 1;
    if (R.empty) return { status: 'empty', z: NaN, x: NaN, y: NaN, best: [], verts: [], region: R };
    const verts = R.vertices.map(function (v) { return { x: v[0], y: v[1], z: p * v[0] + q * v[1] }; });
    if (Math.abs(p) < EPS && Math.abs(q) < EPS) {
      return { status: 'all', z: 0, x: verts.length ? verts[0].x : NaN, y: verts.length ? verts[0].y : NaN, best: verts, verts: verts, region: R };
    }
    if (!R.bounded) {
      // 沿著無界的方向 z 會不會一直變好：大方框邊上的點比所有真正頂點都好很多，就是沒有最佳值
      let bestV = -Infinity;
      verts.forEach(function (v) { bestV = Math.max(bestV, sg * v.z); });
      const farBest = R.big.reduce(function (m, v) { return Math.max(m, sg * (p * v[0] + q * v[1])); }, -Infinity);
      if (!verts.length || farBest > bestV + 1e-6 * BIG * 1e-3) return { status: 'unbounded', z: sg * Infinity, x: NaN, y: NaN, best: [], verts: verts, region: R };
    }
    let m = -Infinity;
    verts.forEach(function (v) { m = Math.max(m, sg * v.z); });
    const tol = 1e-9 * (1 + Math.abs(m));
    const best = verts.filter(function (v) { return sg * v.z >= m - tol; });
    // 和最佳頂點一樣好的「遠方」點（無界的邊與等高線平行）：也算無限多組解
    const rayTie = !R.bounded && R.big.some(function (v) { return onBig(v) && sg * (p * v[0] + q * v[1]) >= m - 1e-6; });
    const status = best.length >= 2 || rayTie ? 'edge' : 'unique';
    return { status: status, z: sg * m, x: best[0].x, y: best[0].y, best: best, verts: verts, region: R };
  }

  /** 可行域裡的格子點（只看方框 box 內；最多 limit 個） */
  function lattice(cons, box, opts, limit) {
    const out = [];
    const L = limit || 5000;
    for (let x = Math.ceil(box[0] - 1e-9); x <= box[1] + 1e-9; x++) {
      for (let y = Math.ceil(box[2] - 1e-9); y <= box[3] + 1e-9; y++) {
        if (feasible(cons, x, y, opts, 1e-9)) { out.push([x, y]); if (out.length >= L) return out; }
      }
    }
    return out;
  }
  /** 整數解的最佳值（可行域要有界）：{ status: 'empty' | 'unbounded' | 'ok', z, pts（所有最佳格子點）, n（格子點個數） } */
  function intOptimize(cons, p, q, sense, opts) {
    const R = region(cons, opts);
    if (R.empty) return { status: 'empty', z: NaN, pts: [], n: 0 };
    if (!R.bounded) return { status: 'unbounded', z: NaN, pts: [], n: NaN };
    const xs = R.vertices.map(function (v) { return v[0]; }), ys = R.vertices.map(function (v) { return v[1]; });
    const pts = lattice(cons, [Math.min.apply(null, xs), Math.max.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, ys)], opts, 200000);
    if (!pts.length) return { status: 'empty', z: NaN, pts: [], n: 0 };
    const sg = sense === 'min' ? -1 : 1;
    let m = -Infinity;
    pts.forEach(function (v) { m = Math.max(m, sg * (p * v[0] + q * v[1])); });
    const best = pts.filter(function (v) { return sg * (p * v[0] + q * v[1]) >= m - 1e-9; });
    return { status: 'ok', z: sg * m, pts: best, n: pts.length };
  }

  /** 等高線 p x + q y = k 在方框裡的線段（兩端點；不相交時 null） */
  function levelSegment(p, q, k, box) {
    return clipLine(p, q, k, box);
  }
  /** 直線 a x + b y = c 和方框的交線段 */
  function clipLine(a, b, c, box) {
    const pts = [];
    const add = function (x, y) { if (x >= box[0] - 1e-9 && x <= box[1] + 1e-9 && y >= box[2] - 1e-9 && y <= box[3] + 1e-9) pts.push([x, y]); };
    if (Math.abs(b) > EPS) { add(box[0], (c - a * box[0]) / b); add(box[1], (c - a * box[1]) / b); }
    if (Math.abs(a) > EPS) { add((c - b * box[2]) / a, box[2]); add((c - b * box[3]) / a, box[3]); }
    const u = dedupe(pts);
    if (u.length < 2) return null;
    let bi = 0, bj = 1, bd = -1;
    for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) { const d = Math.hypot(u[i][0] - u[j][0], u[i][1] - u[j][1]); if (d > bd) { bd = d; bi = i; bj = j; } }
    return [u[bi], u[bj]];
  }
  /** 等高線 z = k 和可行域的關係：'miss'（碰不到）、'touch'（只碰到邊界：支撐線）、'cross'（穿過內部） */
  function levelRelation(cons, p, q, k, opts) {
    const R = region(cons, opts);
    if (R.empty || (Math.abs(p) < EPS && Math.abs(q) < EPS)) return 'miss';
    const poly = R.degenerate ? R.vertices : R.big;
    let lo = Infinity, hi = -Infinity;
    poly.forEach(function (v) { const z = p * v[0] + q * v[1]; lo = Math.min(lo, z); hi = Math.max(hi, z); });
    const tol = 1e-6 * (1 + Math.abs(k));
    if (k < lo - tol || k > hi + tol) return 'miss';
    if (Math.abs(k - lo) <= tol || Math.abs(k - hi) <= tol) return 'touch';
    return 'cross';
  }

  /** 頁面與任務共用的整套分析：最佳解、反向的最佳解、整數解、格子點（邊上／內部）、頂點是否都是格子點、最佳頂點上有幾條不同的限制線 */
  function analyze(cons, p, q, sense, opts) {
    const opt = optimize(cons, p, q, sense, opts);
    const R = opt.region;
    const other = optimize(cons, p, q, sense === 'max' ? 'min' : 'max', opts);
    const ip = R.bounded && !R.empty ? intOptimize(cons, p, q, sense, opts) : { status: R.empty ? 'empty' : 'unbounded', z: NaN, pts: [], n: 0 };
    let latB = NaN, latI = NaN, nLat = NaN;
    if (R.bounded && !R.empty && !R.degenerate) {
      const xs = R.vertices.map(function (v) { return v[0]; }), ys = R.vertices.map(function (v) { return v[1]; });
      const pts = lattice(cons, [Math.min.apply(null, xs), Math.max.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, ys)], opts, 40000);
      const lines = allCons(cons, opts);
      latB = 0; latI = 0; nLat = pts.length;
      pts.forEach(function (w) { if (lines.some(function (c) { return Math.abs(c.a * w[0] + c.b * w[1] - c.c) < 1e-9 * (1 + Math.abs(c.c)); })) latB++; else latI++; });
    }
    const latticeVerts = R.vertices.length > 0 && R.vertices.every(function (v) { return Math.abs(v[0] - Math.round(v[0])) < 1e-9 && Math.abs(v[1] - Math.round(v[1])) < 1e-9; });
    let tight = 0;
    if (opt.status === 'unique') {
      const seen = [];
      allCons(cons, opts).forEach(function (c) {
        const n = Math.hypot(c.a, c.b);
        if (n < 1e-12 || Math.abs(c.a * opt.x + c.b * opt.y - c.c) / n > 1e-7) return;
        const u = [c.a / n, c.b / n, c.c / n];
        const same = function (w, s) { return Math.abs(w[0] - s * u[0]) < 1e-9 && Math.abs(w[1] - s * u[1]) < 1e-9 && Math.abs(w[2] - s * u[2]) < 1e-9; };
        if (!seen.some(function (w) { return same(w, 1) || same(w, -1); })) seen.push(u);
      });
      tight = seen.length;
    }
    return { opt: opt, R: R, other: other, ip: ip, latB: latB, latI: latI, nLat: nLat, latticeVerts: latticeVerts, tight: tight };
  }

  /** 幾個經典題目（x ≥ 0、y ≥ 0 都另外加上） */
  const PRESETS = {
    // 工廠做桌子與椅子：木材 x + 2y ≤ 14、工時 3x + y ≤ 18、y ≤ 6；利潤 z = 3x + 2y
    factory: { cons: [{ a: 1, b: 2, c: 14, s: '<=' }, { a: 3, b: 1, c: 18, s: '<=' }, { a: 0, b: 1, c: 6, s: '<=' }], p: 3, q: 2, sense: 'max' },
    // 營養：兩種飼料，蛋白質 2x + y ≥ 8、脂肪 x + 3y ≥ 9；成本 z = 4x + 5y 最小
    diet: { cons: [{ a: 2, b: 1, c: 8, s: '>=' }, { a: 1, b: 3, c: 9, s: '>=' }, { a: 1, b: 1, c: 10, s: '<=' }], p: 4, q: 5, sense: 'min' },
    // 教科書的基本題：x + y ≤ 5、x − y ≤ 3、y ≤ 4；z = 2x + y
    basic: { cons: [{ a: 1, b: 1, c: 5, s: '<=' }, { a: 1, b: -1, c: 3, s: '<=' }, { a: 0, b: 1, c: 4, s: '<=' }], p: 2, q: 1, sense: 'max' }
  };

  const LPCore = { norm: norm, allCons: allCons, feasible: feasible, clipBox: clipBox, area: area, region: region, meet: meet, optimize: optimize,
    lattice: lattice, intOptimize: intOptimize, analyze: analyze, levelSegment: levelSegment, clipLine: clipLine, levelRelation: levelRelation, PRESETS: PRESETS, BIG: BIG };
  if (typeof module !== 'undefined' && module.exports) module.exports = LPCore;
  else root.LPCore = LPCore;
})(typeof window !== 'undefined' ? window : this);
