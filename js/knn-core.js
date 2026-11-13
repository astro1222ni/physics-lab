/* knn-core.js — 「k 最近鄰分類」的計算核心（與畫面分離，Node 單元測試：tests/knn-core.test.js）
 *
 * k 最近鄰（k-nearest neighbours，Fix & Hodges 1951；Cover & Hart 1967）：要猜一個新點的類別，
 * 就找訓練資料裡離它最近的 k 個點，讓它們投票，票最多的類別就是答案。沒有「訓練」這一步，資料本身就是模型。
 *
 * 座標：資料點與查詢點都吸附在 0.05 的格點上，內部存整數 g = 20·x（x 在 [−1, 1]），所以距離可以精確比較。
 * 特徵：f1 = x1，f2 = s·x2，s 是 x2 的單位（「× 1」或「× 100」，例如公尺改成公分）。
 *   勾選「標準化」時，每個特徵減去平均、除以標準差（母體標準差，除以 n）；這時 s 會被約掉，結果和單位無關。
 * 距離（都在特徵空間裡算）：
 *   歐氏 d = √(Δf1² + Δf2²)，曼哈頓 d = |Δf1| + |Δf2|。
 *   比較遠近用「鍵」（key）：不標準化時，歐氏的鍵 = Δg1² + s²·Δg2²、曼哈頓的鍵 = |Δg1| + s·|Δg2|，都是整數，平手可以精確判斷。
 *   標準化時，令 V1 = n·Σg1² − (Σg1)²（= n²·σ1²，格點單位），歐氏的鍵 = Δg1²·V2 + Δg2²·V1（仍是整數）、
 *   d = n·√(鍵 ÷ (V1·V2))；曼哈頓 d = n·(|Δg1|/√V1 + |Δg2|/√V2)（無理數，比較時容許 10^−12 的相對誤差）。
 *   某個特徵的標準差是 0（所有點同一條線上）時，那個特徵的標準差當成 1 格（0.05）。
 *
 * 規則（頁面與說明都照這裡寫）：
 *   1. 鄰居的取捨：照距離由近到遠排；距離相同時，先放的點（資料裡排在前面的）先選。
 *   2. 投票：k 個鄰居一點一票，票最多的類別勝出。
 *   3. 平手（兩類以上票數一樣多）：比較這幾類鄰居的「距離總和」，總和較小（整體比較近）的勝出；
 *      距離總和也一樣（容許十億分之一的捨入誤差）時，選排序最前面（最近、同距離時最先放）的那個鄰居的類別。
 *   4. 實際用的 k：查詢點用 min(k, n)；留一法用 min(k, n − 1)（被拿出來的點不能當自己的鄰居）。
 *   5. 留一法交叉驗證：每個點輪流拿出來當考題，用其他 n − 1 個點（標準化也只用這 n − 1 個點的平均與標準差）來猜它，
 *      猜對的比例就是留一法正確率。
 */
(function (root) {
  'use strict';
  const GRID = 20;              // 1 個座標單位 = 20 格（每格 0.05）
  const MAX_POINTS = 80;
  const K_MAX = 99;
  const NCLS = 3;               // 最多三類：A、B、C（0、1、2）
  const SCALES = [1, 100];

  // ---------------------------------------------------------------- 亂數
  /** 有種子的亂數產生器（mulberry32），回傳 [0, 1) */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** 常態分布（Box–Muller） */
  function gauss(r) { let u = 0; while (u <= 1e-12) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }

  // ---------------------------------------------------------------- 點
  function clampG(g) { return Math.max(-GRID, Math.min(GRID, Math.round(g))); }
  function toGrid(x) { return clampG(x * GRID); }
  function pt(gx, gy, c, extra) { const p = { gx: gx, gy: gy, x: gx / GRID, y: gy / GRID, c: c }; return extra ? Object.assign(p, extra) : p; }
  function counts(points) { const a = [0, 0, 0]; points.forEach(function (p) { a[p.c]++; }); return a; }
  function dataKey(points) { return points.map(function (p) { return p.gx + ',' + p.gy + ',' + p.c; }).join(';'); }

  // ---------------------------------------------------------------- 預設資料（有種子：同一份編號永遠一樣）
  /** 把一個點吸附到格點、限制在 [−0.95, 0.95]，重複的格點不要 */
  function adder(list, used) {
    return function (x, y, c, extra) {
      const gx = Math.max(-19, Math.min(19, Math.round(x * GRID))), gy = Math.max(-19, Math.min(19, Math.round(y * GRID)));
      const key = gx + ',' + gy;
      if (used[key]) return false;
      used[key] = 1;
      list.push(pt(gx, gy, c, extra));
      return true;
    };
  }
  /** 兩團：A 在左、B 在右；兩團在 x1 方向分開、在 x2 方向拉得很長（所以只看 x2 分不出來） */
  function genBlobs(serial) {
    const r = rng(serial * 7919 + 101), out = [], add = adder(out, {});
    const want = [18, 22];
    [[-0.45, 0, 0], [0.45, 0, 1]].forEach(function (cfg) {
      let k = 0, guard = 0;
      while (k < want[cfg[2]] && guard++ < 5000) if (add(cfg[0] + 0.21 * gauss(r), cfg[1] + 0.42 * gauss(r), cfg[2])) k++;
    });
    return out;
  }
  /** 三團：A、B、C 三團排成三角形 */
  function genThree(serial) {
    const r = rng(serial * 6271 + 202), out = [], add = adder(out, {});
    const n = [13, 14, 15];
    for (let c = 0; c < 3; c++) {
      const th = Math.PI / 2 + c * 2 * Math.PI / 3, cx = 0.52 * Math.cos(th), cy = 0.48 * Math.sin(th) - 0.05;
      let k = 0, guard = 0;
      while (k < n[c] && guard++ < 5000) if (add(cx + 0.2 * gauss(r), cy + 0.2 * gauss(r), c)) k++;
    }
    return out;
  }
  /** 月牙：兩個交錯的半圓（A 在上、B 在下） */
  function genMoons(serial) {
    const r = rng(serial * 4513 + 303), out = [], add = adder(out, {});
    const want = [22, 20], sc = 0.6;
    for (let c = 0; c < 2; c++) {
      let k = 0, guard = 0;
      while (k < want[c] && guard++ < 5000) {
        const t = Math.PI * r();
        let x = c === 0 ? Math.cos(t) : 1 - Math.cos(t), y = c === 0 ? Math.sin(t) : 0.5 - Math.sin(t);
        x = (x - 0.5) * sc + 0.07 * gauss(r); y = (y - 0.25) * sc * 1.25 + 0.07 * gauss(r);
        if (add(x, y, c)) k++;
      }
    }
    return out;
  }
  /** 棋盤：四個象限交錯（右上、左下是 A；左上、右下是 B），41 個點，離分界太近的點不要 */
  function genChecker(serial) {
    const r = rng(serial * 3307 + 404), out = [], add = adder(out, {});
    let guard = 0;
    while (out.length < 41 && guard++ < 5000) {
      const x = (r() * 2 - 1) * 0.92, y = (r() * 2 - 1) * 0.92;
      if (Math.abs(x) < 0.08 || Math.abs(y) < 0.08) continue;
      add(x, y, (x > 0) === (y > 0) ? 0 : 1);
    }
    return out;
  }
  /** 有雜訊：兩團靠得比較近，再把大約 15% 的點的類別標反（標記 noise） */
  function genNoisy(serial) {
    const r = rng(serial * 1931 + 505), out = [], add = adder(out, {});
    [[-0.38, 0.05, 0], [0.38, -0.05, 1]].forEach(function (cfg) {
      let k = 0, guard = 0;
      while (k < 22 && guard++ < 5000) if (add(cfg[0] + 0.26 * gauss(r), cfg[1] + 0.3 * gauss(r), cfg[2])) k++;
    });
    let flips = 0, guard = 0;
    while (flips < 7 && guard++ < 1000) {
      const p = out[Math.floor(r() * out.length)];
      if (p.noise) continue;
      p.c = 1 - p.c; p.noise = true; flips++;
    }
    return out;
  }
  const PRESETS = { blobs: genBlobs, three: genThree, moons: genMoons, checker: genChecker, noisy: genNoisy };

  // ---------------------------------------------------------------- 距離
  /**
   * 準備距離計算：points（訓練點）、cfg = { metric: 'euclid'／'manhattan', scale: 1／100, std: 布林 }。
   * 傳回 { key(i, qx, qy), dist(key), exact, eq(a, b) }；qx、qy 是查詢點的格點座標（可以是小數，區域上色時用）。
   */
  function prepare(points, cfg) {
    const n = points.length, man = cfg.metric === 'manhattan', s = cfg.scale === 100 ? 100 : 1;
    const gx = new Float64Array(n), gy = new Float64Array(n);
    for (let i = 0; i < n; i++) { gx[i] = points[i].gx; gy[i] = points[i].gy; }
    const P = { n: n, gx: gx, gy: gy, man: man, std: !!cfg.std, scale: s, exact: true };
    if (cfg.std) {
      let s1 = 0, s2 = 0, q1 = 0, q2 = 0;
      for (let i = 0; i < n; i++) { s1 += gx[i]; s2 += gy[i]; q1 += gx[i] * gx[i]; q2 += gy[i] * gy[i]; }
      let V1 = n * q1 - s1 * s1, V2 = n * q2 - s2 * s2;
      const nn = Math.max(1, n) * Math.max(1, n);
      if (!(V1 > 0)) V1 = nn;          // 標準差是 0：當成 1 格
      if (!(V2 > 0)) V2 = nn;
      P.V1 = V1; P.V2 = V2; P.nn = Math.max(1, n);
      if (man) { P.exact = false; P.r1 = P.nn / Math.sqrt(V1); P.r2 = P.nn / Math.sqrt(V2); }
      else P.dk = P.nn / Math.sqrt(V1 * V2);
    }
    return finishPrep(P);
  }
  /** 留一法用：拿掉第 skip 個點之後的標準化統計量（不標準化時與全部相同） */
  function prepareFold(full, points, cfg, skip) {
    if (!cfg.std) return full;
    const rest = points.filter(function (p, i) { return i !== skip; });
    const P = prepare(rest, cfg);
    // 索引仍沿用原本的（key 只看 gx、gy）
    P.gx = full.gx; P.gy = full.gy; P.n = full.n;
    return P;
  }
  function finishPrep(P) {
    const s = P.scale;
    if (!P.std) {
      P.key = P.man
        ? function (i, qx, qy) { return Math.abs(P.gx[i] - qx) + s * Math.abs(P.gy[i] - qy); }
        : function (i, qx, qy) { const a = P.gx[i] - qx, b = P.gy[i] - qy; return a * a + s * s * b * b; };
      P.dist = P.man ? function (k) { return k / GRID; } : function (k) { return Math.sqrt(k) / GRID; };
    } else if (!P.man) {
      P.key = function (i, qx, qy) { const a = P.gx[i] - qx, b = P.gy[i] - qy; return a * a * P.V2 + b * b * P.V1; };
      P.dist = function (k) { return Math.sqrt(k) * P.dk; };
    } else {
      P.key = function (i, qx, qy) { return Math.abs(P.gx[i] - qx) * P.r1 + Math.abs(P.gy[i] - qy) * P.r2; };
      P.dist = function (k) { return k; };
    }
    P.eq = P.exact ? function (a, b) { return a === b; } : function (a, b) { return Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b)); };
    return P;
  }
  /** 歐氏距離（特徵空間，與 cfg 的單位、標準化一致；不論選哪一種距離都可以算） */
  function euclidOf(P, i, qx, qy) {
    const a = P.gx[i] - qx, b = P.gy[i] - qy;
    if (!P.std) return Math.sqrt(a * a + P.scale * P.scale * b * b) / GRID;
    return P.nn * Math.sqrt(a * a / P.V1 + b * b / P.V2);
  }

  // ---------------------------------------------------------------- 最近鄰與投票
  /**
   * 由近到遠排好的鄰居（不含 skip）：[{ i, key, d }]。同距離照索引（先放的在前）。
   * limit：只要前 limit 個（插入法；limit 小時比全部排序快），不給就全部排。
   */
  function neighbors(P, qx, qy, skip, limit) {
    const n = P.n, eq = P.eq;
    const less = function (a, b) { return eq(a.key, b.key) ? a.i < b.i : a.key < b.key; };
    if (limit != null && limit < 24) {
      const top = [];
      for (let i = 0; i < n; i++) {
        if (i === skip) continue;
        const e = { i: i, key: P.key(i, qx, qy) };
        if (top.length === limit && !less(e, top[top.length - 1])) continue;
        if (top.length < limit) top.push(e); else top[limit - 1] = e;
        let j = top.length - 1;
        while (j > 0 && less(top[j], top[j - 1])) { const t = top[j]; top[j] = top[j - 1]; top[j - 1] = t; j--; }
      }
      top.forEach(function (e) { e.d = P.dist(e.key); });
      return top;
    }
    const all = [];
    for (let i = 0; i < n; i++) if (i !== skip) all.push({ i: i, key: P.key(i, qx, qy) });
    all.sort(function (a, b) { return eq(a.key, b.key) ? a.i - b.i : a.key - b.key; });
    const out = limit != null ? all.slice(0, limit) : all;
    out.forEach(function (e) { e.d = P.dist(e.key); });
    return out;
  }
  function closeSum(a, b) { return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)); }
  /**
   * 前 k 個鄰居投票（list 已排好、classOf(i) 給類別）。
   * 傳回 { pred, votes[3], sums[3], tie: 'none'／'dist'（靠距離總和分出勝負）／'first'（距離總和也相同，看最前面的鄰居）, tied（平手的類別） }
   */
  function vote(list, k, classOf) {
    const votes = [0, 0, 0], sums = [0, 0, 0], first = [Infinity, Infinity, Infinity];
    const m = Math.min(k, list.length);
    for (let j = 0; j < m; j++) {
      const c = classOf(list[j].i);
      votes[c]++; sums[c] += list[j].d;
      if (first[c] === Infinity) first[c] = j;
    }
    return decide(votes, sums, first);
  }
  function decide(votes, sums, first) {
    let mx = 0;
    for (let c = 0; c < NCLS; c++) mx = Math.max(mx, votes[c]);
    if (mx === 0) return { pred: -1, votes: votes.slice(), sums: sums.slice(), tie: 'none', tied: [] };
    let tied = [];
    for (let c = 0; c < NCLS; c++) if (votes[c] === mx) tied.push(c);
    if (tied.length === 1) return { pred: tied[0], votes: votes.slice(), sums: sums.slice(), tie: 'none', tied: [] };
    const all = tied.slice();
    let best = Infinity;
    tied.forEach(function (c) { best = Math.min(best, sums[c]); });
    const near = tied.filter(function (c) { return closeSum(sums[c], best); });
    if (near.length === 1) return { pred: near[0], votes: votes.slice(), sums: sums.slice(), tie: 'dist', tied: all };
    let pick = near[0];
    near.forEach(function (c) { if (first[c] < first[pick]) pick = c; });
    return { pred: pick, votes: votes.slice(), sums: sums.slice(), tie: 'first', tied: all };
  }
  /** 直接分類一個查詢點（方便測試）：傳回 vote 的結果加上 list（全部鄰居，排好） */
  function classify(points, cfg, qx, qy, k, skip) {
    const P = prepare(points, cfg);
    const list = neighbors(P, qx, qy, skip == null ? -1 : skip);
    const r = vote(list, k, function (i) { return points[i].c; });
    r.list = list;
    return r;
  }

  /**
   * 查詢點的完整分析（頁面讀數與任務事件用）。
   * 傳回 { kEff, list（前 kEff + 1 個）, pred, votes, sums, tie, tied, nn1, kth（第 k 近的鍵）, kthD,
   *        allEqual, orderSensitive, lastSeat, losersCloser, loserRatio }
   */
  function analyzeQuery(points, P, qx, qy, k) {
    const n = points.length, kEff = Math.min(k, n);
    const full = neighbors(P, qx, qy, -1);
    const classOf = function (i) { return points[i].c; };
    const r = vote(full, kEff, classOf);
    const out = { kEff: kEff, list: full.slice(0, Math.min(n, kEff + 1)), pred: r.pred, votes: r.votes, sums: r.sums, tie: r.tie, tied: r.tied,
      nn1: n ? points[full[0].i].c : -1, nn1D: n ? full[0].d : 0, kth: kEff ? full[kEff - 1].key : 0, kthD: kEff ? full[kEff - 1].d : 0,
      allEqual: false, orderSensitive: false, lastSeat: false, losersCloser: false, nLosers: 0, loserRatio: 0, full: full };
    if (!kEff) return out;
    const eq = P.eq;
    out.allEqual = kEff >= 2 && eq(full[0].key, full[kEff - 1].key) && full[0].key > 0;
    // 換成「同距離時後放的先選」，答案會不會變？
    const kk = full[kEff - 1].key;
    let lo = 0;
    while (lo < n && !eq(full[lo].key, kk) && full[lo].key < kk) lo++;
    let hi = lo;
    while (hi < n && eq(full[hi].key, kk)) hi++;
    if (hi - lo > kEff - lo) {
      const alt = full.slice(0, lo).concat(full.slice(lo, hi).slice().reverse());
      const r2 = vote(alt, kEff, classOf);
      out.orderSensitive = r2.pred !== r.pred;
    }
    out.lastSeat = kEff >= 3 && out.orderSensitive && full[kEff - 2].key < kk && !eq(full[kEff - 2].key, kk);
    // 最近的幾個鄰居（至少兩個）全都落選：落選類別的鄰居每一個都比勝出類別的鄰居近
    let maxL = -Infinity, minW = Infinity, nL = 0, maxLe = 0, minWe = Infinity;
    for (let j = 0; j < kEff; j++) {
      const e = full[j], c = points[e.i].c, eu = euclidOf(P, e.i, qx, qy);
      if (c === r.pred) { minW = Math.min(minW, e.key); minWe = Math.min(minWe, eu); }
      else { maxL = Math.max(maxL, e.key); nL++; maxLe = Math.max(maxLe, eu); }
    }
    if (nL >= 2 && minW < Infinity && maxL < minW && !eq(maxL, minW)) { out.losersCloser = true; out.nLosers = nL; out.loserRatio = maxLe > 0 ? minWe / maxLe : Infinity; }
    return out;
  }

  /** k 的清單：1, 3, 5, …，到第一個 ≥ n − 1 的奇數為止（上限 K_MAX）——留一法正確率對 k 的圖用 */
  function kList(n) {
    const out = [];
    const top = Math.min(K_MAX, Math.max(1, n - 1));
    for (let k = 1; k <= K_MAX; k += 2) { out.push(k); if (k >= top) break; }
    return out;
  }
  /**
   * 留一法交叉驗證：每個點輪流拿出來，用其他點猜它。
   * 傳回 { ks, correct[ks.length]（每個 k 猜對幾個）, n, perPoint[i][t]（第 i 個點在第 t 個 k 是否猜對；只在 detail 時給，否則是 null）, distCount（算了幾次距離）}
   */
  function loo(points, cfg, opts) {
    opts = opts || {};
    const n = points.length, ks = kList(n), correct = ks.map(function () { return 0; });
    const full = prepare(points, cfg);
    const classOf = function (i) { return points[i].c; };
    const detail = opts.detail ? [] : null;
    let distCount = 0;
    if (n < 2) return { ks: ks, correct: correct, n: n, perPoint: detail, distCount: 0 };
    for (let i = 0; i < n; i++) {
      const P = prepareFold(full, points, cfg, i);
      const list = neighbors(P, points[i].gx, points[i].gy, i);
      distCount += n - 1;
      const votes = [0, 0, 0], sums = [0, 0, 0], first = [Infinity, Infinity, Infinity];
      let j = 0;
      const row = detail ? [] : null;
      for (let t = 0; t < ks.length; t++) {
        const kEff = Math.min(ks[t], n - 1);
        for (; j < kEff; j++) {
          const c = classOf(list[j].i);
          votes[c]++; sums[c] += list[j].d;
          if (first[c] === Infinity) first[c] = j;
        }
        const ok = decide(votes, sums, first).pred === points[i].c;
        if (ok) correct[t]++;
        if (row) row.push(ok);
      }
      if (detail) detail.push(row);
    }
    return { ks: ks, correct: correct, n: n, perPoint: detail, distCount: distCount };
  }
  /** 某個 k 在留一法清單裡的索引（k 比清單大時用最後一個，也就是「其他全部」） */
  function kIndex(ks, k) { return Math.max(0, Math.min(ks.length - 1, Math.floor((k - 1) / 2))); }
  /** 自己考自己（重新代入）的正確率：每個點用全部的點（包括它自己）來猜 */
  function resubstitution(points, cfg, k) {
    const n = points.length;
    if (!n) return { correct: 0, n: 0 };
    const P = prepare(points, cfg);
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const list = neighbors(P, points[i].gx, points[i].gy, -1, Math.min(k, n));
      if (vote(list, Math.min(k, n), function (j) { return points[j].c; }).pred === points[i].c) ok++;
    }
    return { correct: ok, n: n };
  }

  // ---------------------------------------------------------------- 決策區域（分批計算）
  /**
   * 整片平面每個格子的預測類別與信心（得票 ÷ k）。格子中心在 [−L, L]² 的 N × N 網格上。
   * job.run(ms) 每次最多算 ms 毫秒（頁面每一幀呼叫一次，不卡畫面），算完 job.done = true。
   * cls：Int8Array（−1 = 沒有資料）；conf：Float32Array。
   */
  function RegionJob(points, cfg, k, N, L) {
    this.N = N; this.L = L;
    this.cls = new Int8Array(N * N).fill(-1);
    this.conf = new Float32Array(N * N);
    this.row = 0; this.done = points.length === 0;
    this.points = points; this.k = Math.min(k, points.length);
    this.P = prepare(points, cfg);
    this.classes = points.map(function (p) { return p.c; });
    if (this.done) this.row = N;
  }
  RegionJob.prototype.run = function (ms) {
    if (this.done) return true;
    const clock = (typeof performance !== 'undefined' && performance.now) ? function () { return performance.now(); } : function () { return Date.now(); };
    const t0 = clock(), N = this.N, L = this.L, k = this.k, P = this.P, cls = this.classes;
    const classOf = function (i) { return cls[i]; };
    while (this.row < N) {
      const j = this.row;
      const y = L - (j + 0.5) * 2 * L / N;
      for (let i = 0; i < N; i++) {
        const x = -L + (i + 0.5) * 2 * L / N;
        const list = neighbors(P, x * GRID, y * GRID, -1, k);
        const r = vote(list, k, classOf);
        this.cls[j * N + i] = r.pred;
        this.conf[j * N + i] = r.pred >= 0 ? r.votes[r.pred] / k : 0;
      }
      this.row++;
      if (ms != null && clock() - t0 >= ms) break;
    }
    if (this.row >= N) this.done = true;
    return this.done;
  };

  // ---------------------------------------------------------------- 頁面與任務證明共用的工作階段
  const PRESET_NAMES = ['blobs', 'three', 'moons', 'checker', 'noisy'];
  function zeroEdits() { return { added: 0, removed: 0, moved: 0 }; }
  /**
   * 一個工作階段：資料點、設定、查詢點，以及送給任務的事件。
   * opt.emit(type, data)：'state'（使用者每做一個改變之後）、'looStep'（留一法走一步）、'looDone'（留一法走完）。
   * 頁面與 tools/mission-proofs/knn.js 都用這個類別，所以兩邊的事件資料完全相同。
   */
  function Session(opt) {
    opt = opt || {};
    this.emit = opt.emit || function () {};
    this.cfg = { k: 5, metric: 'euclid', scale: 1, std: false };
    this.points = [];
    this.nextId = 1;
    this.set = 'empty'; this.base = 'empty';
    this.edits = zeroEdits();
    this.serial = { blobs: 0, three: 0, moons: 0, checker: 0, noisy: 0 };
    this.q = { gx: -8, gy: 4 };
    this.walk = null;
    this._cacheKey = ''; this._loo = null;
    this.recompute();
  }
  Session.prototype._mark = function (pts, user) {
    const self = this;
    return pts.map(function (p) { return Object.assign({}, p, { id: self.nextId++, user: !!user, noise: !!p.noise }); });
  };
  Session.prototype.cfgKey = function () { const c = this.cfg; return c.metric + '|' + c.scale + '|' + (c.std ? 1 : 0); };
  Session.prototype.recompute = function () {
    const key = dataKey(this.points) + '#' + this.cfgKey();
    if (key !== this._cacheKey) {
      this._cacheKey = key;
      this.P = prepare(this.points, this.cfg);
      this._loo = loo(this.points, this.cfg, { detail: true });
      this.walk = null;
    }
    this.qa = analyzeQuery(this.points, this.P, this.q.gx, this.q.gy, this.cfg.k);
    return this.qa;
  };
  Session.prototype.looAt = function (k) {
    const L = this._loo;
    if (!L || L.n < 2) return null;
    const t = kIndex(L.ks, k);
    return { k: L.ks[t], kEff: Math.min(k, L.n - 1), correct: L.correct[t], acc: L.correct[t] / L.n };
  };
  Session.prototype.best = function () {
    const L = this._loo;
    if (!L || L.n < 2) return null;
    let mx = -1;
    L.correct.forEach(function (c) { mx = Math.max(mx, c); });
    const ks = L.ks.filter(function (k, t) { return L.correct[t] === mx; });
    return { correct: mx, acc: mx / L.n, ks: ks };
  };
  Session.prototype.loadPreset = function (name, silent) {
    if (!PRESETS[name]) return false;
    this.serial[name]++;
    this.points = this._mark(PRESETS[name](this.serial[name]), false);
    this.set = name; this.base = name;
    this.edits = zeroEdits();
    this._changed('preset', silent);
    return true;
  };
  Session.prototype.indexAt = function (gx, gy) {
    for (let i = 0; i < this.points.length; i++) if (this.points[i].gx === gx && this.points[i].gy === gy) return i;
    return -1;
  };
  Session.prototype.addPoint = function (gx, gy, c) {
    gx = clampG(gx); gy = clampG(gy);
    if (this.points.length >= MAX_POINTS || this.indexAt(gx, gy) >= 0 || !(c >= 0 && c < NCLS)) return false;
    this.points.push(this._mark([pt(gx, gy, c)], true)[0]);
    this.edits.added++;
    this.set = 'custom';
    this._changed('add');
    return true;
  };
  Session.prototype.removeAt = function (i) {
    if (i < 0 || i >= this.points.length) return false;
    this.points.splice(i, 1);
    this.edits.removed++;
    this.set = 'custom';
    this._changed('remove');
    return true;
  };
  Session.prototype.movePoint = function (i, gx, gy, silent) {
    gx = clampG(gx); gy = clampG(gy);
    const p = this.points[i];
    if (!p || (p.gx === gx && p.gy === gy)) return false;
    const j = this.indexAt(gx, gy);
    if (j >= 0 && j !== i) return false;
    p.gx = gx; p.gy = gy; p.x = gx / GRID; p.y = gy / GRID;
    if (!p.moved) { p.moved = true; this.edits.moved++; }
    this.set = 'custom';
    this._changed('move', silent);
    return true;
  };
  Session.prototype.clear = function () {
    this.points = [];
    this.set = 'custom'; this.base = 'empty';
    this.edits = zeroEdits();
    this._changed('clear');
  };
  Session.prototype.moveQuery = function (gx, gy, silent) {
    gx = clampG(gx); gy = clampG(gy);
    if (gx === this.q.gx && gy === this.q.gy) return false;
    this.q.gx = gx; this.q.gy = gy;
    this._changed('query', silent);
    return true;
  };
  Session.prototype.setCfg = function (k, v, silent) {
    if (k === 'k') v = Math.max(1, Math.min(K_MAX, 2 * Math.round((Math.round(v) - 1) / 2) + 1));
    if (k === 'scale') v = v === 100 ? 100 : 1;
    if (k === 'std') v = !!v;
    if (this.cfg[k] === v) return false;
    this.cfg[k] = v;
    this._changed(k, silent);
    return true;
  };
  Session.prototype._changed = function (src, silent) {
    this.recompute();
    if (!silent) this.emit('state', this.snapshot(src));
  };
  /** 送給任務的資料（只有數字、字串與布林，任務檔不需要核心） */
  Session.prototype.snapshot = function (src) {
    const pts = this.points, n = pts.length, c = counts(pts), qa = this.qa, cfg = this.cfg, L = this._loo;
    const cur = this.looAt(cfg.k), best = this.best();
    let nClasses = 0, majority = -1, majUnique = false, mx = -1;
    c.forEach(function (v, i) { if (v > 0) nClasses++; if (v > mx) { mx = v; majority = i; majUnique = true; } else if (v === mx) majUnique = false; });
    const d = {
      src: src, set: this.set, base: this.base, edited: this.set === 'custom', n: n, counts: c, nClasses: nClasses,
      majority: majUnique ? majority : -1,
      userAll: n > 0 && pts.every(function (p) { return p.user; }),
      added: this.edits.added, removed: this.edits.removed, moved: this.edits.moved,
      k: cfg.k, kEff: qa.kEff, metric: cfg.metric, scale: cfg.scale, std: cfg.std,
      qx: this.q.gx, qy: this.q.gy, onPoint: this.indexAt(this.q.gx, this.q.gy) >= 0,
      pred: qa.pred, votes: qa.votes.slice(), tie: qa.tie, nn1: qa.nn1, kthD: qa.kthD,
      nbr: qa.list.slice(0, qa.kEff).map(function (e) { return pts[e.i].id; }),
      allEqual: qa.allEqual, orderSensitive: qa.orderSensitive, lastSeat: qa.lastSeat, losersCloser: qa.losersCloser, nLosers: qa.nLosers, loserRatio: qa.loserRatio,
      key: dataKey(pts),
      kLoo: n >= 2 ? Math.min(cfg.k, n - 1) : 0,
      loo: cur ? cur.acc : null, looCorrect: cur ? cur.correct : null,
      bestAcc: best ? best.acc : null, bestKs: best ? best.ks.slice() : [],
      curve: L && L.n >= 2 ? L.correct.slice() : [], ks: L ? L.ks.slice() : []
    };
    // 只有兩個點（不同類）時：兩點到查詢點的距離是否完全相等、兩點的歐氏距離比
    if (n === 2 && pts[0].c !== pts[1].c) {
      const P = this.P;
      d.eqDist = P.eq(P.key(0, this.q.gx, this.q.gy), P.key(1, this.q.gx, this.q.gy));
      const e0 = euclidOf(P, 0, this.q.gx, this.q.gy), e1 = euclidOf(P, 1, this.q.gx, this.q.gy);
      d.euRatio = Math.min(e0, e1) > 0 ? Math.max(e0, e1) / Math.min(e0, e1) : Infinity;
    } else { d.eqDist = false; d.euRatio = 0; }
    return d;
  };

  // ---------- 留一法一步一步走 ----------
  Session.prototype.walkReset = function () { this.walk = null; };
  Session.prototype._walkStart = function () {
    if (this.walk) return this.walk;
    const n = this.points.length;
    this.walk = { pos: 0, n: n, correct: 0, stepped: 0, dist: 0, k: this.cfg.k, last: null, done: n < 2, results: [] };
    return this.walk;
  };
  /** 留一法的下一個點。user：使用者按了「單步」。傳回這一步的紀錄（走完或點太少時傳回 null） */
  Session.prototype.walkStep = function (user) {
    const w = this._walkStart();
    if (w.done) return null;
    if (w.k !== this.cfg.k) { this.walk = null; return this.walkStep(user); }
    const pts = this.points, n = pts.length, i = w.pos;
    const full = this.P;
    const P = prepareFold(full, pts, this.cfg, i);
    const list = neighbors(P, pts[i].gx, pts[i].gy, i);
    const kEff = Math.min(this.cfg.k, n - 1);
    const r = vote(list, kEff, function (j) { return pts[j].c; });
    const ok = r.pred === pts[i].c;
    w.pos++; w.dist += n - 1;
    if (ok) w.correct++;
    if (user) w.stepped++;
    const rec = { i: i, ok: ok, pred: r.pred, votes: r.votes, tie: r.tie, kEff: kEff, list: list.slice(0, kEff), pos: w.pos, n: n, correct: w.correct };
    w.last = rec;
    w.results.push(ok);
    this.emit('looStep', { pos: w.pos, n: n, ok: ok, correct: w.correct, stepped: w.stepped, user: !!user, k: this.cfg.k, set: this.set });
    if (w.pos >= n) {
      w.done = true;
      this.emit('looDone', { n: n, k: this.cfg.k, kEff: kEff, correct: w.correct, acc: w.correct / n, stepped: w.stepped, dist: w.dist,
        set: this.set, metric: this.cfg.metric, scale: this.cfg.scale, std: this.cfg.std });
    }
    return rec;
  };

  const api = {
    GRID: GRID, MAX_POINTS: MAX_POINTS, K_MAX: K_MAX, NCLS: NCLS, SCALES: SCALES, PRESET_NAMES: PRESET_NAMES, PRESETS: PRESETS,
    rng: rng, gauss: gauss, toGrid: toGrid, pt: pt, counts: counts, dataKey: dataKey,
    genBlobs: genBlobs, genThree: genThree, genMoons: genMoons, genChecker: genChecker, genNoisy: genNoisy,
    prepare: prepare, prepareFold: prepareFold, euclidOf: euclidOf, neighbors: neighbors, vote: vote, decide: decide, classify: classify,
    analyzeQuery: analyzeQuery, kList: kList, kIndex: kIndex, loo: loo, resubstitution: resubstitution,
    RegionJob: RegionJob, Session: Session
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KnnCore = api;
})(typeof window !== 'undefined' ? window : this);
