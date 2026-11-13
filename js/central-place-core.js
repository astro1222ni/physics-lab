/* central-place-core.js — 克里斯泰勒（W. Christaller）中地理論的計算核心（純函式，瀏覽器與 Node 共用）
 *
 * 均質平原、消費者均勻分布（密度 ρ，人／平方公里），每個人都到最近的中地買東西。
 * 一種商品有兩個界限：
 *   門檻人口 T：一家店至少要有 T 位顧客才能經營 → 門檻半徑 r_T = √(T / πρ)
 *   商品圈（最大範圍）R：顧客最遠願意走 R 公里去買
 * 自由進入：只要還有超額利潤，就會有新店開張，店越來越密，直到每家店的市場區剛好 T 人。
 * 店排成正三角形格子（間距 d）時，每家店的市場區是正六邊形：
 *   面積 = (√3 / 2) d²，內切圓半徑 d / 2，外接圓半徑 d / √3（最遠的顧客）
 *   均衡間距 d_T = √(2T / (√3 ρ))
 *   d_T / √3 ≤ R：人人買得到；R ≥ r_T 但 d_T / √3 > R：六邊形的角落買不到；R < r_T：根本開不了店。
 *   （d_T / √3 = 1.0996 r_T，所以「有空隙」只出現在 r_T ≤ R < 1.0996 r_T 這一小段）
 *
 * 中地體系：最低級中地排成間距 d₁ 的三角形格子；第 L 級中地是其中的子格子，間距 d₁ (√k)^(L−1)。
 *   k = 3（市場原則）：低級中地在高級市場區的六個角，由三個高級中地共用。
 *   k = 4（交通原則）：低級中地在兩個高級中地連線（道路）的中點。
 *   k = 7（行政原則）：六個低級中地完全在一個高級市場區裡面。
 * 格子座標 (i, j) 對應平面位置 d₁ (i + j/2, j √3/2)。子格子由整數矩陣 M 產生（M 的兩欄是 v 和 v 轉 60°）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CentralCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const R3 = Math.sqrt(3), HEX = R3 / 2;
  const MEAN_K = (2 / 3 + Math.log(3) / 2) / R3; // 正六邊形裡到中心的平均距離 = MEAN_K × 內切圓半徑

  function thresholdRadius(T, rho) { return Math.sqrt(T / (Math.PI * rho)); }
  function spacingFor(T, rho) { return Math.sqrt(2 * T / (R3 * rho)); }
  function hexArea(d) { return HEX * d * d; }
  function circumradius(d) { return d / R3; }
  function meanDist(d) { return MEAN_K * d / 2; }

  /** 正六邊形（相鄰中心間距 d）裡、離中心 R 以內的面積比例 */
  function coverage(d, R) {
    const a = d / 2, c = d / R3, A = hexArea(d);
    if (R >= c) return 1;
    if (R <= a) return Math.PI * R * R / A;
    const seg = R * R * Math.acos(a / R) - a * Math.sqrt(R * R - a * a); // 超出一條邊的弓形
    return (Math.PI * R * R - 6 * seg) / A;
  }
  /** 間距 s 的店，每家能賣給的人數（市場區 = 六邊形 ∩ 商品圈） */
  function customers(s, R, rho) { return rho * coverage(s, R) * hexArea(s); }

  /** 自由進入後的均衡間距：每家店的顧客（六邊形 ∩ 商品圈裡的人）剛好等於門檻。
   *  人人買得到時就是 d_T；有空隙時顧客比整個六邊形少，店要隔得比 d_T 遠一點（二分法，在 [d_T, 2R] 之間）。
   *  開不了店（R < r_T）回傳 null。 */
  function equilibrium(rho, T, R) {
    const rT = thresholdRadius(T, rho), dT = spacingFor(T, rho);
    if (R < rT - 1e-12) return null;
    if (circumradius(dT) <= R + 1e-12) return dT;
    let lo = dT, hi = Math.max(dT, 2 * R);
    for (let n = 0; n < 80; n++) {
      const mid = (lo + hi) / 2;
      if (customers(mid, R, rho) >= T) hi = mid; else lo = mid;
    }
    return hi;
  }

  /** 一種商品：門檻、商品圈與自由進入後的結果 */
  function single(rho, T, R) {
    const rT = thresholdRadius(T, rho), dT = spacingFor(T, rho);
    const d = equilibrium(rho, T, R);
    const supplied = d != null;
    const status = !supplied ? 'none' : (circumradius(d) <= R + 1e-9 ? 'full' : 'gaps');
    return {
      rT: rT, dT: dT, R: R, status: status, d: d,
      area: supplied ? hexArea(d) : null,
      perK: supplied ? 1000 / hexArea(d) : 0,             // 每 1000 平方公里幾家店
      coverage: supplied ? coverage(d, R) : 0,              // 買得到的人占全部的比例
      mean: status === 'full' ? meanDist(d) : null,
      far: supplied ? Math.min(R, circumradius(d)) : null,
      ratioRT: R / rT,                                      // 商品圈 ÷ 門檻半徑
      ratioRC: supplied ? R / circumradius(d) : null,       // 商品圈 ÷ 六邊形角落的距離
      close: Math.sqrt(3) * R,                              // 間距縮到這裡，最後的空隙闔上
      start: supplied ? 2 * R : null                        // 開店動畫：從商品圈剛好相切開始
    };
  }

  // ---------------- 中地體系 ----------------
  const SYS = {
    3: { M: [[1, -1], [1, 2]], name: 'market' },     // 欄向量 v1 = (1, 1)、v2 = (−1, 2)
    4: { M: [[2, 0], [0, 2]], name: 'transport' },
    7: { M: [[2, -1], [1, 3]], name: 'admin' }
  };
  /** 第 L 級格子相對第 1 級的旋轉角（弧度） */
  function levelAngle(k, L) {
    const M = SYS[k].M, x = M[0][0] + M[1][0] / 2, y = M[1][0] * HEX; // v1 的方向
    return (L - 1) * Math.atan2(y, x);
  }
  function levelSpacing(d1, k, L) { return d1 * Math.pow(k, (L - 1) / 2); }
  function toXY(i, j, d1) { return [d1 * (i + j / 2), d1 * j * HEX]; }
  /** 格子點 (i, j) 的等級（1…N）：能被 M 整除幾次 */
  function orderOf(i, j, k, N) {
    const M = SYS[k].M;
    let L = 1;
    while (L < N) {
      // 解 M (i', j') = (i, j)：(i', j') = adj(M) (i, j) / k
      const a = M[0][0], b = M[0][1], c = M[1][0], dd = M[1][1];
      const ni = dd * i - b * j, nj = -c * i + a * j;
      if (ni % k !== 0 || nj % k !== 0) break;
      i = ni / k; j = nj / k; L++;
    }
    return L;
  }
  /** 視窗 [x0, x1] × [y0, y1] 裡的中地：[{ i, j, x, y, L }] */
  function centersIn(x0, y0, x1, y1, d1, k, N) {
    const out = [];
    const j0 = Math.floor(y0 / (d1 * HEX)) - 1, j1 = Math.ceil(y1 / (d1 * HEX)) + 1;
    for (let j = j0; j <= j1; j++) {
      const i0 = Math.floor(x0 / d1 - j / 2) - 1, i1 = Math.ceil(x1 / d1 - j / 2) + 1;
      for (let i = i0; i <= i1; i++) {
        const p = toXY(i, j, d1);
        if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) continue;
        out.push({ i: i, j: j, x: p[0], y: p[1], L: orderOf(i, j, k, N) });
      }
    }
    return out;
  }
  /** 第 L 級市場區（正六邊形）的六個頂點 */
  function hexAround(x, y, d1, k, L) {
    const c = circumradius(levelSpacing(d1, k, L)), a0 = levelAngle(k, L) + Math.PI / 6, pts = [];
    for (let m = 0; m < 6; m++) pts.push([x + c * Math.cos(a0 + m * Math.PI / 3), y + c * Math.sin(a0 + m * Math.PI / 3)]);
    return pts;
  }
  /** 離 (x, y) 最近的幾個第 L 級以上中地：[{ x, y, dist }]，由近到遠（取前 n 個） */
  function nearest(x, y, d1, k, L, n) {
    const dL = levelSpacing(d1, k, L), al = levelAngle(k, L);
    const b1 = [dL * Math.cos(al), dL * Math.sin(al)], b2 = [dL * Math.cos(al + Math.PI / 3), dL * Math.sin(al + Math.PI / 3)];
    const det = b1[0] * b2[1] - b1[1] * b2[0];
    const u = (x * b2[1] - y * b2[0]) / det, v = (b1[0] * y - b1[1] * x) / det;
    const out = [];
    for (let du = -2; du <= 3; du++) for (let dv = -2; dv <= 3; dv++) {
      const U = Math.floor(u) + du, V = Math.floor(v) + dv;
      const px = U * b1[0] + V * b2[0], py = U * b1[1] + V * b2[1];
      out.push({ x: px, y: py, dist: Math.hypot(px - x, py - y) });
    }
    out.sort(function (p, q) { return p.dist - q.dist; });
    return out.slice(0, n || 3);
  }
  /** 中地體系各級的數字（第 1 級到第 N 級） */
  function hierarchy(rho, d1, k, N) {
    const out = [];
    for (let L = 1; L <= N; L++) {
      const d = levelSpacing(d1, k, L), A = hexArea(d);
      out.push({
        L: L, d: d, area: A, pop: rho * A,
        areas: Math.pow(k, N - L),                                         // 一個最高級市場區裡有幾個第 L 級市場區
        centers: L === N ? 1 : Math.pow(k, N - L) - Math.pow(k, N - L - 1), // 一個最高級市場區裡「剛好是第 L 級」的中地（共用的照比例算）
        far: circumradius(d)
      });
    }
    return out;
  }
  /** 一種商品放進中地體系：在哪一級提供（市場區人數 ≥ 門檻的最低一級），有多少人買得到 */
  function goodIn(rho, d1, k, N, T, R) {
    const H = hierarchy(rho, d1, k, N);
    const lv = H.find(function (h) { return h.pop >= T - 1e-9; }) || null;
    if (!lv) return { L: null, fill: null, coverage: 0, reach: null, tight: null };
    return {
      L: lv.L, fill: T / lv.pop,                 // 門檻 ÷ 市場區人數（1 = 剛好沒有超額利潤）
      coverage: coverage(lv.d, R),               // 市場區裡在商品圈以內的比例
      reach: R / lv.far,                         // 商品圈 ÷ 最遠顧客的距離
      spacing: lv.d, pop: lv.pop
    };
  }

  return {
    R3: R3, HEX: HEX, MEAN_K: MEAN_K, SYS: SYS,
    thresholdRadius: thresholdRadius, spacingFor: spacingFor, hexArea: hexArea, circumradius: circumradius, meanDist: meanDist,
    coverage: coverage, customers: customers, equilibrium: equilibrium, single: single,
    levelAngle: levelAngle, levelSpacing: levelSpacing, toXY: toXY, orderOf: orderOf, centersIn: centersIn,
    hexAround: hexAround, nearest: nearest, hierarchy: hierarchy, goodIn: goodIn
  };
});
