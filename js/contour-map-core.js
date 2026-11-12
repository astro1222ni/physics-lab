/* contour-map-core.js — 「等高線與 3D 地形」的數學核心（與畫面無關，Node 可直接 require）
 *
 * 地形：8 km × 8 km 的虛擬島嶼，高度 h(x, y)（公尺）是解析函數（高斯山峰、圓錐火山、山脊與 V 形谷、海階的階梯）
 *   加上固定種子的分形雜訊（讓等高線像真的地形一樣彎曲）。x 向東、y 向北，單位公尺，原點在西南角。
 * 網格：201 × 201 點（間距 40 m），用來畫等高線（方格行進法 marching squares）、算河流（D8 流向與集水面積）、
 *   找窪地（優先佇列填窪 priority-flood）、算島嶼個數與陸地面積（8 連通：斜角相鄰的陸地算連在一起）。
 * 量測與剖面一律用解析函數（坡度用中央差分，步長 1 m），和網格無關，所以任務判定不受網格解析度影響。
 * 坡度分級依「山坡地土地可利用限度分類標準」：一級坡 ≤ 5%、二級坡 ≤ 15%、三級坡 ≤ 30%、四級坡 ≤ 40%、五級坡 ≤ 55%、六級坡 > 55%。
 * 通視：兩端各加 1.6 m 眼高；地球曲率與大氣折射的修正 d1·d2·(1 − k)/(2R)，k = 0.13（大地測量常用的折射係數）。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ContourCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SIZE = 8000, N = 201, CELL = SIZE / (N - 1);
  const EYE = 1.6, R_EARTH = 6371000, K_REFR = 0.13;
  const MIN_ISLAND_CELLS = 2;                 // 2 格（0.0032 km²）以上才算一座島，免得一顆礁石也算
  const PRESETS = ['twin', 'volcano', 'valley', 'terrace'];
  const DEG = Math.PI / 180;

  // ---------- 固定種子的平滑雜訊 ----------
  function hash(ix, iy, seed) {
    let h = (ix * 374761393 + iy * 668265263 + seed * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    h = h ^ (h >>> 16);
    return (h & 0xffffff) / 0xffffff * 2 - 1;
  }
  function vnoise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10), sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  /** 分形雜訊，x、y 以公里計，大約在 ±1 之間；只用三個八度，起伏平順，不會在山頂旁邊冒出一堆小山包 */
  function fbm(x, y, seed) {
    let s = 0, a = 1, f = 0.7, t = 0;
    for (let o = 0; o < 3; o++) { s += a * vnoise(x * f, y * f, seed + o * 17); t += a; a *= 0.45; f *= 2.03; }
    return s / t;
  }
  const g2 = function (dx, dy, sx, sy) { return Math.exp(-0.5 * ((dx / sx) * (dx / sx) + (dy / sy) * (dy / sy))); };
  const smooth = function (e0, e1, x) { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  /** 山峰周圍的放射狀蝕溝：k 條、相位 ph、深度 dep（比例）；溝窄、溝間的山脊寬；山頂附近與山腳不刻 */
  function gully(dx, dy, k, ph, dep) {
    const r = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
    const c = 0.5 + 0.5 * Math.cos(k * th + ph + 0.6 * Math.sin(2 * th + ph) + 0.9 * r);
    return 1 - dep * c * c * c * smooth(0.3, 0.75, r) * (1 - smooth(1.9, 2.8, r));
  }

  // ---------- 四座虛擬島嶼（座標以公里計，回傳公尺） ----------
  const SHAPES = {
    /** 雙峰島：兩座山峰之間有鞍部，山坡上有放射狀的蝕溝（等高線彎成 V 字），周圍有山腳的丘陵 */
    twin: function (x, y) {
      const a = gully(x - 2.9, y - 4.75, 9, 0.3, 0.16), b = gully(x - 5.35, y - 3.35, 7, 1.7, 0.16);
      let h = 560 * g2(x - 2.9, y - 4.75, 0.95, 0.85) * a + 290 * g2(x - 2.9, y - 4.75, 0.45, 0.42)
        + 470 * g2(x - 5.35, y - 3.35, 0.85, 0.8) * b + 190 * g2(x - 5.35, y - 3.35, 0.42, 0.4)
        + 240 * g2(x - 4.1, y - 4.05, 2.3, 1.9) - 85;
      h += 30 * fbm(x, y, 11) * smooth(-60, 120, h);
      return h;
    },
    /** 火山島：圓錐形，山頂有火山口，山坡有放射狀的蝕溝 */
    volcano: function (x, y) {
      const dx = x - 4.05, dy = y - 3.95, r = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
      const RIM = 0.5;
      const gully = 0.075 * (0.5 + 0.5 * Math.cos(11 * th + 0.8 + 0.6 * Math.sin(3 * th))) * smooth(0.75, 1.3, r) * (1 - smooth(2.6, 3.5, r));
      const cone = 1010 * Math.pow(Math.max(0, 1 - r / 3.7), 1.35) * (1 - gully);
      const rimH = 1010 * Math.pow(1 - RIM / 3.7, 1.35);
      const crater = rimH - 165 + 165 * (r / RIM) * (r / RIM);           // 碗形火山口，在 r = RIM 和山坡接上
      const k = 14;                                                       // 平滑的最小值：火山口邊緣是圓的稜線，不是刀口
      let h = -k * Math.log(Math.exp(-cone / k) + Math.exp(-crater / k));
      h += 16 * Math.cos(th * 3 - 0.5) * Math.exp(-Math.pow((r - RIM) / 0.3, 2));   // 火山口邊緣有三個高點、三個缺口
      h -= 60;
      h += 22 * fbm(x, y, 23) * smooth(-40, 80, h);
      return h;
    },
    /** 河谷島：一條東北—西南走向的山脈，兩側是 V 形谷，中間有一條橫切山脈的大河谷（山口） */
    valley: function (x, y) {
      const c = Math.cos(35 * DEG), s = Math.sin(35 * DEG);
      const u = (x - 4) * c + (y - 4) * s, v = -(x - 4) * s + (y - 4) * c;
      const along = Math.exp(-Math.pow(Math.abs(u) / 3.1, 4));
      const q = Math.pow(v * v + 0.09, 0.75) - Math.pow(0.09, 0.75);   // 山脊頂是圓的（寬約 300 m），往兩側變陡
      let h = 900 * Math.exp(-q / Math.pow(1.25, 1.5)) * along + 120 * along * Math.exp(-(v * v) / 8) - 70;
      h *= 1 - 0.38 * Math.exp(-Math.pow((u - 0.35) / 0.42, 2));                 // 橫切山脈的大河谷：中間降成山口
      const av = Math.abs(v);
      const ramp = smooth(0.15, 0.9, av) * (1 - smooth(2.2, 3.0, av));
      const side = v > 0 ? [-2.3, -1.15, 1.55, 2.5] : [-1.85, -0.75, 1.2, 2.2];
      const h0 = h;
      side.forEach(function (uk, i) {
        const w = 0.21 + 0.05 * (i % 2);
        const bend = 0.12 * av + 0.2 * Math.sin(1.9 * av + i * 1.7) * smooth(0.3, 1.2, av);   // 支谷微微彎曲
        const vee = Math.max(0, 1 - Math.abs(u - uk + bend) / w);
        h -= Math.min(170, 0.3 * Math.max(h0, 0) + 35) * vee * vee * ramp * along;            // 山越高、谷切得越深
      });
      h += 30 * fbm(x, y, 37) * smooth(-50, 100, h);
      return h;
    },
    /** 海階島：東岸是海崖，往內陸是一階一階的平臺（海階）與陡坎，西邊是丘陵 */
    terrace: function (x, y) {
      const dEast = 6.9 + 0.25 * Math.sin(y * 1.3) - x;        // 離東岸的距離（km）
      const wy = (y - 4.0) / 2.8 + 0.12 * fbm(x * 0.8, y * 0.8, 91);   // 南北兩岸彎彎曲曲，不是直線
      const mask = Math.exp(-Math.pow(Math.abs(wy), 2.8)) * smooth(-0.1, 0.9, x + 0.4 * fbm(x, y, 92) - 0.1) * smooth(0.05, 0.5, x);   // 西邊界一定是海
      const step = function (d0, w, H) { return H * smooth(d0 - w, d0 + w, dEast); };
      let h = step(0.06, 0.05, 72) + step(1.55, 0.09, 95) + step(3.05, 0.1, 115) + 16 * Math.max(0, dEast)   // 階面往海微微傾斜（約 1.6%）
        + 230 * g2(x - 1.7, y - 4.3, 1.0, 1.25);
      h = h * mask - 45 * (1 - mask) - 35 * smooth(0, -1, dEast);
      // 兩條往東流、切穿海階的河谷（海階上的河會下切，等高線在階崖上彎成 V 字）
      [3.0, 5.25].forEach(function (y0, i) {
        const vee = Math.max(0, 1 - Math.abs(y - y0 - 0.18 * Math.sin(1.6 * x + i)) / 0.2);
        h -= Math.min(70, 0.4 * Math.max(h, 0)) * vee * vee * smooth(1.6, 2.8, x);
      });
      h += 4 * fbm(x, y, 53) * smooth(-30, 60, h);
      return h;
    }
  };

  // ---------- 地形物件 ----------
  function make(id) {
    if (!SHAPES[id]) id = 'twin';
    const f = SHAPES[id];
    const T = { id: id, N: N, CELL: CELL, SIZE: SIZE };
    T.h = function (x, y) { return f(x / 1000, y / 1000); };
    const g = new Float32Array(N * N);
    let max = -Infinity, mi = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = T.h(i * CELL, j * CELL);
      g[j * N + i] = v;
      if (v > max) { max = v; mi = j * N + i; }
    }
    T.grid = g;
    // 最高點：從最高的格點往上坡細找
    T.summit = climb(T, (mi % N) * CELL, Math.floor(mi / N) * CELL);
    T.max = T.h(T.summit[0], T.summit[1]);
    T.landCells = 0;
    for (let k = 0; k < g.length; k++) if (g[k] > 0) T.landCells++;
    T.landArea = T.landCells * CELL * CELL / 1e6;
    return T;
  }
  /** 從 (x, y) 沿梯度往上爬到局部最高點（步長逐漸縮小） */
  function climb(T, x, y) {
    let st = 20;
    for (let it = 0; it < 400 && st > 0.01; it++) {
      const gr = grad(T, x, y), m = Math.hypot(gr[0], gr[1]);
      if (m < 1e-9) break;
      const nx = x + st * gr[0] / m, ny = y + st * gr[1] / m;
      if (T.h(nx, ny) > T.h(x, y)) { x = nx; y = ny; } else st *= 0.5;
    }
    return [x, y];
  }

  // ---------- 量測 ----------
  function grad(T, x, y) {
    const d = 1;
    return [(T.h(x + d, y) - T.h(x - d, y)) / (2 * d), (T.h(x, y + d) - T.h(x, y - d)) / (2 * d)];
  }
  function slopeClass(pct) { return pct <= 5 ? 1 : pct <= 15 ? 2 : pct <= 30 ? 3 : pct <= 40 ? 4 : pct <= 55 ? 5 : 6; }
  /** 坡度（%、度）、坡向（坡面朝向的方位角，北 0°、順時針；平地為 null） */
  function slope(T, x, y) {
    const gr = grad(T, x, y), m = Math.hypot(gr[0], gr[1]);
    const aspect = m < 1e-6 ? null : ((Math.atan2(-gr[0], -gr[1]) / DEG) + 360) % 360;
    return { pct: m * 100, deg: Math.atan(m) / DEG, aspect: aspect, cls: slopeClass(m * 100), gx: gr[0], gy: gr[1] };
  }
  /** 臨界點分類（坡度 < 3% 時）：山頂 peak、窪地底 pit、鞍部 saddle；用 Hessian（步長 20 m） */
  function crit(T, x, y) {
    const s = slope(T, x, y);
    if (s.pct >= 3) return null;
    const d = 20, h0 = T.h(x, y);
    const hxx = (T.h(x + d, y) - 2 * h0 + T.h(x - d, y)) / (d * d);
    const hyy = (T.h(x, y + d) - 2 * h0 + T.h(x, y - d)) / (d * d);
    const hxy = (T.h(x + d, y + d) - T.h(x + d, y - d) - T.h(x - d, y + d) + T.h(x - d, y - d)) / (4 * d * d);
    const det = hxx * hyy - hxy * hxy;
    if (det < 0) return 'saddle';
    if (det > 0) return hxx + hyy < 0 ? 'peak' : 'pit';
    return null;
  }

  // ---------- 等高線：方格行進法 ----------
  /** level 的等高線，傳回折線陣列（每條是 [[x, y], …]，公尺；closed 表示封閉） */
  function contours(T, level, grid) {
    const g = grid || T.grid;
    const segs = [];
    const key = function (i, j, e) { return (j * N + i) * 2 + e; };   // e = 0：格點 (i,j)→(i+1,j) 的水平邊；1：(i,j)→(i,j+1) 的垂直邊
    const pt = {};
    function edgePt(i, j, e) {
      const k = key(i, j, e);
      if (pt[k]) return k;
      const a = g[j * N + i], b = e === 0 ? g[j * N + i + 1] : g[(j + 1) * N + i];
      const t = (level - a) / (b - a);
      pt[k] = e === 0 ? [(i + t) * CELL, j * CELL] : [i * CELL, (j + t) * CELL];
      return k;
    }
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      const v0 = g[j * N + i], v1 = g[j * N + i + 1], v2 = g[(j + 1) * N + i + 1], v3 = g[(j + 1) * N + i];
      const c = (v0 > level ? 1 : 0) | (v1 > level ? 2 : 0) | (v2 > level ? 4 : 0) | (v3 > level ? 8 : 0);
      if (c === 0 || c === 15) continue;
      const B = function () { return edgePt(i, j, 0); }, R = function () { return edgePt(i + 1, j, 1); };
      const Tp = function () { return edgePt(i, j + 1, 0); }, L = function () { return edgePt(i, j, 1); };
      switch (c) {
        case 1: case 14: segs.push([L(), B()]); break;
        case 2: case 13: segs.push([B(), R()]); break;
        case 3: case 12: segs.push([L(), R()]); break;
        case 4: case 11: segs.push([R(), Tp()]); break;
        case 6: case 9: segs.push([B(), Tp()]); break;
        case 7: case 8: segs.push([L(), Tp()]); break;
        case 5: case 10: {
          const mid = (v0 + v1 + v2 + v3) / 4 > level;
          if ((c === 5) === mid) { segs.push([L(), Tp()]); segs.push([B(), R()]); }
          else { segs.push([L(), B()]); segs.push([R(), Tp()]); }
          break;
        }
      }
    }
    // 把線段接成折線
    const adj = {};
    segs.forEach(function (s, idx) { (adj[s[0]] = adj[s[0]] || []).push(idx); (adj[s[1]] = adj[s[1]] || []).push(idx); });
    const used = new Uint8Array(segs.length), lines = [];
    function walk(start, from) {
      const out = [from];
      let cur = from, si = start;
      while (si != null) {
        used[si] = 1;
        const s = segs[si], nxt = s[0] === cur ? s[1] : s[0];
        out.push(nxt);
        cur = nxt;
        si = null;
        const cand = adj[cur] || [];
        for (let q = 0; q < cand.length; q++) if (!used[cand[q]]) { si = cand[q]; break; }
      }
      return out;
    }
    // 先從端點（只有一條線段）開始，得到開放的線；剩下的是封閉環
    Object.keys(adj).forEach(function (k) {
      if (adj[k].length === 1 && !used[adj[k][0]]) { const ids = walk(adj[k][0], +k); lines.push({ pts: ids.map(function (q) { return pt[q]; }), closed: false }); }
    });
    for (let s = 0; s < segs.length; s++) if (!used[s]) {
      const ids = walk(s, segs[s][0]);
      lines.push({ pts: ids.map(function (q) { return pt[q]; }), closed: ids[0] === ids[ids.length - 1] });
    }
    return lines;
  }
  /** 封閉的等高線圍住的是窪地嗎（往下坡方向走一點會進到環裡面）：示坡線要畫在這種環上 */
  function isDepressionLoop(T, line) {
    if (!line.closed || line.pts.length < 8) return false;
    const p = line.pts[Math.floor(line.pts.length / 3)];
    const gr = grad(T, p[0], p[1]), m = Math.hypot(gr[0], gr[1]);
    if (m < 1e-9) return false;
    const q = [p[0] - gr[0] / m * 8, p[1] - gr[1] / m * 8];
    return pointInPoly(q, line.pts);
  }
  function pointInPoly(p, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }

  // ---------- 剖面與通視 ----------
  /**
   * A、B（公尺）之間的地形剖面，n 段；sea 是目前的海平面（預設 0）。傳回 { L, d[], h[], hA, hB, dh, avg（平均坡度 %）, maxSlope（最陡一段的坡度 %）, maxDeg,
   *   ascent、descent（累積爬升、下降）, minH, maxH, clear（視線離地形最小的距離，m，含地球曲率與折射）, visible, grazeAt、grazeH（最貼近處的距離與地面高度）,
   *   clearFlat（把地球當成平的時候的 clear）, landAll（全程在陸地上）, midPct（中點的坡度 %） }
   */
  function profile(T, A, B, n, sea) {
    n = n || 400;
    sea = sea || 0;
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const d = new Float64Array(n + 1), h = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      d[i] = t * L;
      h[i] = T.h(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t);
    }
    let asc = 0, desc = 0, maxS = 0, minH = Infinity, maxH = -Infinity, landAll = true;
    for (let i = 0; i <= n; i++) {
      if (h[i] < minH) minH = h[i];
      if (h[i] > maxH) maxH = h[i];
      if (h[i] <= sea) landAll = false;
      if (i) {
        const dh = h[i] - h[i - 1];
        if (dh > 0) asc += dh; else desc -= dh;
        if (L > 0) maxS = Math.max(maxS, Math.abs(dh) / (L / n));
      }
    }
    // 通視：眼高 1.6 m（在海上時離水面 1.6 m），地形加上曲率與折射造成的「隆起」；海面以下的地面用海面高度代替
    const hA = h[0], hB = h[n];
    const eA = Math.max(hA, sea) + EYE, eB = Math.max(hB, sea) + EYE;
    let clear = Infinity, at = 0, gi = 0, clearFlat = Infinity;
    for (let i = 1; i < n; i++) {
      const line = eA + (eB - eA) * i / n;
      const bulge = d[i] * (L - d[i]) * (1 - K_REFR) / (2 * R_EARTH);
      const ground = Math.max(h[i], sea);
      const c = line - (ground + bulge);
      if (c < clear) { clear = c; at = d[i]; gi = i; }
      if (line - ground < clearFlat) clearFlat = line - ground;
    }
    // 剖面中點的坡度（沿著等高線走時，腳下的山坡有多陡）
    const mid = slope(T, (A[0] + B[0]) / 2, (A[1] + B[1]) / 2).pct;
    return { L: L, d: d, h: h, hA: hA, hB: hB, dh: hB - hA, avg: L > 0 ? Math.abs(hB - hA) / L * 100 : 0, maxSlope: maxS * 100, maxDeg: Math.atan(maxS) / DEG,
      ascent: asc, descent: desc, minH: minH, maxH: maxH, clear: clear, visible: clear >= 0, grazeAt: at, grazeH: n >= 2 ? h[gi] : null,
      clearFlat: clearFlat, landAll: landAll, midPct: mid };
  }
  /** 在垂直誇大 v 倍的剖面圖上，真實坡度 deg 看起來的角度 */
  function apparentDeg(deg, v) { return Math.atan(v * Math.tan(deg * DEG)) / DEG; }

  // ---------- 海平面：島嶼個數與陸地面積（8 連通） ----------
  function islands(T, sea, grid) {
    const g = grid || T.grid, lab = new Int32Array(N * N).fill(-1), stack = new Int32Array(N * N);
    let count = 0, cells = 0, comp = 0;
    const sizes = [];
    for (let k = 0; k < N * N; k++) {
      if (g[k] <= sea || lab[k] >= 0) continue;
      let sp = 0, sz = 0;
      stack[sp++] = k; lab[k] = comp;
      while (sp) {
        const c = stack[--sp]; sz++;
        const i = c % N, j = (c - i) / N;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii = i + di, jj = j + dj;
          if ((!di && !dj) || ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
          const q = jj * N + ii;
          if (g[q] > sea && lab[q] < 0) { lab[q] = comp; stack[sp++] = q; }
        }
      }
      sizes.push(sz); cells += sz;
      if (sz >= MIN_ISLAND_CELLS) count++;
      comp++;
    }
    sizes.sort(function (a, b) { return b - a; });
    return { count: count, area: cells * CELL * CELL / 1e6, frac: T.landCells ? cells / T.landCells : 0, sizes: sizes.slice(0, 5).map(function (s) { return s * CELL * CELL / 1e6; }) };
  }
  /** 讓陸地剛好分成 k 座島（k ≥ 2）的海平面範圍：在 [0, max] 掃描，傳回第一段 [lo, hi]（解析度 0.5 m） */
  function islandRange(T, k) {
    let lo = null, hi = null;
    for (let s = 0; s <= T.max; s += 0.5) {
      const c = islands(T, s).count;
      if (c === k && lo == null) lo = s;
      if (lo != null && c !== k) { hi = s - 0.5; break; }
    }
    return lo == null ? null : [lo, hi == null ? T.max : hi];
  }

  // ---------- 水文：填窪、流向、集水面積 ----------
  /** 優先佇列填窪（Barnes 2014）：從海與邊界往內淹，得到每一格「水會積到的高度」與窪地深度 */
  function hydro(T) {
    if (T._hydro) return T._hydro;
    const g = T.grid, n = N * N;
    const fill = new Float32Array(n), done = new Uint8Array(n);
    // 二元堆積
    const heap = [], hv = [];
    function push(k, v) { heap.push(k); hv.push(v); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hv[p] <= hv[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; i = p; } }
    function pop() {
      const k = heap[0], last = heap.pop(), lv = hv.pop();
      if (heap.length) { heap[0] = last; hv[0] = lv; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && hv[l] < hv[m]) m = l; if (r < heap.length && hv[r] < hv[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m; } }
      return k;
    }
    for (let k = 0; k < n; k++) {
      const i = k % N, j = (k - i) / N;
      if (g[k] <= 0 || i === 0 || j === 0 || i === N - 1 || j === N - 1) { fill[k] = Math.max(g[k], 0); done[k] = 1; push(k, fill[k]); }
    }
    const order = [];
    while (heap.length) {
      const c = pop(); order.push(c);
      const i = c % N, j = (c - i) / N;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const q = jj * N + ii;
        if (done[q]) continue;
        done[q] = 1;
        fill[q] = Math.max(g[q], fill[c] + 1e-3);
        push(q, fill[q]);
      }
    }
    // D8 流向（在填窪後的高度上）與集水面積（由高往低累加）
    const down = new Int32Array(n).fill(-1), acc = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      if (g[k] <= 0) continue;
      const i = k % N, j = (k - i) / N;
      let best = -1, bs = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const q = jj * N + ii, s = (fill[k] - fill[q]) / Math.hypot(di, dj);
        if (s > bs) { bs = s; best = q; }
      }
      down[k] = best;
    }
    for (let o = order.length - 1; o >= 0; o--) {
      const k = order[o];
      if (g[k] <= 0) continue;
      acc[k] += 1;
      if (down[k] >= 0) acc[down[k]] += acc[k];
    }
    let amax = 0;
    for (let k = 0; k < n; k++) if (g[k] > 0 && acc[k] > amax) amax = acc[k];
    T._hydro = { fill: fill, down: down, acc: acc, maxKm2: amax * CELL * CELL / 1e6 };
    return T._hydro;
  }
  /** 河流：集水面積 ≥ minKm2 的格子連到下游，傳回線段 [[x1,y1,x2,y2,集水面積 km²], …] */
  function streams(T, minKm2) {
    const H = hydro(T), cellsMin = minKm2 * 1e6 / (CELL * CELL), out = [];
    for (let k = 0; k < N * N; k++) {
      if (H.acc[k] < cellsMin || H.down[k] < 0) continue;
      const i = k % N, j = (k - i) / N, q = H.down[k], qi = q % N, qj = (q - qi) / N;
      out.push([i * CELL, j * CELL, qi * CELL, qj * CELL, H.acc[k] * CELL * CELL / 1e6]);
    }
    return out;
  }
  /**
   * 河流折線：集水面積 ≥ minKm2 的格子當河道，源頭由 D8 決定；
   * 線條則從源頭沿「填窪後地面」的真實坡度往下連續追蹤（不受八方向限制，所以不會出現格線般的直線），
   * 碰到已畫好的河（匯流）或入海就停。平地與填平的窪地坡度幾乎為零，改用 D8 流向前進。
   * 傳回 [[[x, y, 集水 km², 地面高度 m], …], …]。
   */
  function riverLines(T, minKm2) {
    const H = hydro(T), thr = minKm2 * 1e6 / (CELL * CELL), n = N * N, g = T.grid, A = H.acc, Dn = H.down, F = H.fill;
    const isR = function (k) { return g[k] > 0 && A[k] >= thr; };
    const up = new Uint8Array(n), lines = [];
    for (let k = 0; k < n; k++) if (isR(k) && Dn[k] >= 0 && isR(Dn[k])) up[Dn[k]]++;
    const heads = [];
    for (let k = 0; k < n; k++) if (isR(k) && !up[k]) heads.push(k);
    // 先畫最長的河（主流），支流碰到主流就停
    const run = new Int32Array(n).fill(-1);
    heads.forEach(function (k) {
      let c = k, L = 0; const path = [];
      while (c >= 0 && g[c] > 0 && run[c] < 0 && L < n) { path.push(c); c = Dn[c]; L++; }
      let base = (c >= 0 && run[c] >= 0) ? run[c] : 0;
      for (let i = path.length - 1; i >= 0; i--) run[path[i]] = ++base;
    });
    heads.sort(function (a, b) { return run[b] - run[a]; });
    const owner = new Int32Array(n).fill(-1), ox = new Float32Array(n), oy = new Float32Array(n);
    const fAt = function (x, y) { return bilinear(F, x * CELL, y * CELL); };
    const catchAt = function (i, j) {
      let m = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        m = Math.max(m, A[jj * N + ii]);
      }
      return m * CELL * CELL / 1e6;
    };
    const STEP = 0.45;
    heads.forEach(function (h0, li) {
      let x = h0 % N, y = (h0 - x) / N, px = 0, py = 0, wPrev = 0, fRef = fAt(x, y), stall = 0, d8 = false, fEnter = 0, fMin = fRef;
      const pts = [];
      for (let it = 0; it < 6000; it++) {
        const i = Math.round(x), j = Math.round(y);
        if (i < 0 || j < 0 || i >= N || j >= N) break;
        const k = j * N + i;
        // 匯流：附近的格子已被別條河佔走，就接到那條河上
        // （兩條河相距不到約 60 m 就算匯流，免得兩條線在同一條谷底並排）
        let join = -1, jd = 1.5;
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
          const q = jj * N + ii;
          if (owner[q] < 0 || owner[q] === li) continue;
          const dq = Math.hypot(ox[q] - x, oy[q] - y);
          if (dq < jd) { jd = dq; join = q; }
        }
        wPrev = Math.max(wPrev, catchAt(i, j));
        const hh = bilinear(g, x * CELL, y * CELL);
        pts.push([x * CELL, y * CELL, wPrev, hh]);
        if (join >= 0) { pts.push([ox[join] * CELL, oy[join] * CELL, wPrev, bilinear(g, ox[join] * CELL, oy[join] * CELL)]); break; }
        if (hh <= 0 || g[k] <= 0) break;
        if (owner[k] < 0) { owner[k] = li; ox[k] = x; oy[k] = y; }
        // 坡度方向（填窪後的地面，中央差分）
        const e = 0.5;
        const gx = (fAt(x + e, y) - fAt(x - e, y)) / (2 * e * CELL), gy = (fAt(x, y + e) - fAt(x, y - e)) / (2 * e * CELL);
        const m = Math.hypot(gx, gy), d = Dn[k];
        // 平地、填平的窪地或坡度方向來回打轉：改沿 D8 一格一格走，直到比走過的最低處再低 1 m（保證不會繞圈）
        if (!d8 && (m < 2e-3 || stall > 8)) { d8 = true; fEnter = Math.min(fMin, fAt(x, y)); }
        if (d8) {
          if (d < 0) break;
          const di = d % N, dj = (d - di) / N, dm = Math.hypot(di - x, dj - y) || 1;
          px = (di - x) / dm; py = (dj - y) / dm;
          x = di; y = dj; fRef = fAt(x, y); fMin = Math.min(fMin, fRef); stall = 0;
          if (fRef < fEnter - 1 && m >= 2e-3) d8 = false;
          continue;
        }
        let dx = -gx / m, dy = -gy / m;
        // 帶一點慣性，避免在 V 形谷底左右來回
        if (px || py) { dx = 0.55 * dx + 0.45 * px; dy = 0.55 * dy + 0.45 * py; const dm = Math.hypot(dx, dy) || 1; dx /= dm; dy /= dm; }
        px = dx; py = dy;
        x += dx * STEP; y += dy * STEP;
        const f = fAt(x, y);
        fMin = Math.min(fMin, f);
        if (f < fRef - 0.02) { fRef = f; stall = 0; } else stall++;
      }
      if (pts.length >= 2) lines.push(pts);
    });
    return lines;
  }
  /** 網格的雙線性內插 */
  function bilinear(arr, x, y) {
    const fx = Math.max(0, Math.min(N - 1.000001, x / CELL)), fy = Math.max(0, Math.min(N - 1.000001, y / CELL));
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
    const a = arr[j * N + i], b = arr[j * N + i + 1], c = arr[(j + 1) * N + i], d = arr[(j + 1) * N + i + 1];
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  }
  /** (x, y) 所在窪地的深度（水會積到的高度 − 地面），不在窪地為 0 */
  function depression(T, x, y) {
    const H = hydro(T);
    return Math.max(0, bilinear(H.fill, x, y) - T.h(x, y));
  }
  /** (x, y) 的集水面積（km²，取最近的格點與周圍 8 格的最大值，點在河上時才會大） */
  function catchment(T, x, y) {
    const H = hydro(T), i = Math.round(x / CELL), j = Math.round(y / CELL);
    let m = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
      m = Math.max(m, H.acc[jj * N + ii]);
    }
    return m * CELL * CELL / 1e6;
  }

  // ---------- 任務事件的快照（頁面與證明腳本共用） ----------
  /**
   * st：{ preset, interval, vexag, sea, slice, layers:{tint, shade, rivers, contours}, view, probe:[x,y]|null, A, B（剖面端點或 null） }
   */
  function snapshot(T, st) {
    const r = function (v, d) { const p = Math.pow(10, d == null ? 3 : d); return v == null || !isFinite(v) ? null : Math.round(v * p) / p; };
    let probe = null;
    if (st.probe) {
      const x = st.probe[0], y = st.probe[1], s = slope(T, x, y), h = T.h(x, y);
      probe = { x: x, y: y, h: r(h, 2), land: h > st.sea, pct: r(s.pct), deg: r(s.deg), aspect: s.aspect == null ? null : r(s.aspect, 1), cls: s.cls,
        crit: crit(T, x, y), dSummit: r(Math.hypot(x - T.summit[0], y - T.summit[1]), 1), depression: r(depression(T, x, y), 2), catchment: r(catchment(T, x, y), 4),
        catchFrac: r(catchment(T, x, y) / hydro(T).maxKm2, 4),
        spacing: s.pct > 0.01 ? r(st.interval / (s.pct / 100), 1) : null };
    }
    let prof = null;
    if (st.A && st.B) {
      const P = profile(T, st.A, st.B, 400, st.sea);
      prof = { L: r(P.L, 1), hA: r(P.hA, 2), hB: r(P.hB, 2), dh: r(P.dh, 2), avg: r(P.avg), maxSlope: r(P.maxSlope), maxDeg: r(P.maxDeg),
        appDeg: r(apparentDeg(P.maxDeg, st.vexag)), ascent: r(P.ascent, 2), descent: r(P.descent, 2), minH: r(P.minH, 2), maxH: r(P.maxH, 2),
        clear: r(P.clear, 2), clearFlat: r(P.clearFlat, 2), visible: P.visible, grazeH: r(P.grazeH, 2), grazeFrac: P.L > 0 ? r(P.grazeAt / P.L, 4) : null,
        landAll: P.landAll, midPct: r(P.midPct) };
    }
    const isl = islands(T, st.sea);
    return {
      preset: T.id, max: r(T.max, 2), interval: st.interval, vexag: st.vexag, sea: st.sea, slice: st.slice, view: st.view || '2d',
      layers: st.layers || {}, islands: isl.count, land: r(isl.area, 4), landFrac: r(isl.frac, 4), probe: probe, prof: prof
    };
  }

  return {
    SIZE: SIZE, N: N, CELL: CELL, EYE: EYE, K_REFR: K_REFR, R_EARTH: R_EARTH, PRESETS: PRESETS, MIN_ISLAND_CELLS: MIN_ISLAND_CELLS,
    make: make, grad: grad, slope: slope, slopeClass: slopeClass, crit: crit, climb: climb,
    contours: contours, isDepressionLoop: isDepressionLoop, pointInPoly: pointInPoly,
    profile: profile, apparentDeg: apparentDeg, islands: islands, islandRange: islandRange,
    hydro: hydro, streams: streams, riverLines: riverLines, bilinear: bilinear, depression: depression, catchment: catchment,
    snapshot: snapshot, fbm: fbm
  };
});
