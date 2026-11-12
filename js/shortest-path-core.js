/* shortest-path-core.js — 「最短路徑：Dijkstra 演算法」的計算核心（與畫面分離，Node 單元測試：tests/shortest-path-core.test.js）
 *
 * 圖：V 個點、E 條邊，每條邊有整數權重 w（可以封閉＝暫時拿掉）。臺灣地圖、隨機圖、方格是無向圖（權重 ≥ 0）；
 *     「負權重」是有向無環圖（權重可以是負數，沒有環所以不會有負環）。
 * 臺灣地圖：城市位置取火車站或市中心附近，經緯度到小數第二位；邊的權重 = 兩城市的大圓距離（半正矢公式，
 *     地球平均半徑 R = 6371 km），四捨五入到公里。是直線距離，不是公路里程。
 *
 * 三種演算法都寫成「步驟產生器」：先把每一步記下來（trace），畫面再一步一步播放；上一步 = 從頭重播。
 *   Dijkstra（Dijkstra 1959 的原始做法）：每次從「候選」裡取出 d 最小的點並確定它，再看它通往「還沒確定」的點的每一條邊，
 *     若 d[u] + w < d[v] 就更新（鬆弛）。優先佇列用最簡單的陣列掃描：取一次要比較 (佇列長度 − 1) 次。
 *     平手規則：d 相同時取編號小的點；只有「嚴格變小」才更新，所以先找到的前一站會保留。鄰居依編號由小到大看。
 *     通往「已確定」的點的邊 Dijkstra 不看；若那條邊其實更短（只可能在有負權重時發生），另外記一步 'late'，讓畫面標出它錯過了什麼。
 *   BFS（廣度優先搜尋）：不看權重，只數邊數；先進先出的佇列。鄰居依編號由小到大加入。
 *   Bellman–Ford：每一輪依固定順序（邊的編號；無向邊先 a→b 再 b→a）把每條邊都鬆弛一次，最多 V − 1 輪；
 *     某一輪完全沒有更新就提早結束。可以處理負權重（沒有負環時）。
 * 參考解：Floyd–Warshall、暴力列舉所有簡單路徑（小圖），單元測試用它們檢查上面三種演算法。
 */
(function (root) {
  'use strict';
  const R_EARTH = 6371.0;
  const INF = Infinity;

  // ======================= 臺灣地圖 =======================
  // 編號照表上的順序（大致由北往南、先西後東）；平手時編號小的先。side：名字標在點的哪一邊（l／r／t／b）。
  const CITIES = [
    { key: 'keelung', zh: '基隆', en: 'Keelung', lat: 25.13, lon: 121.74, side: 'r' },
    { key: 'taipei', zh: '臺北', en: 'Taipei', lat: 25.05, lon: 121.52, side: 't' },
    { key: 'taoyuan', zh: '桃園', en: 'Taoyuan', lat: 24.99, lon: 121.31, side: 'l' },
    { key: 'hsinchu', zh: '新竹', en: 'Hsinchu', lat: 24.80, lon: 120.97, side: 'l' },
    { key: 'miaoli', zh: '苗栗', en: 'Miaoli', lat: 24.57, lon: 120.82, side: 'l' },
    { key: 'taichung', zh: '臺中', en: 'Taichung', lat: 24.14, lon: 120.69, side: 'r' },
    { key: 'changhua', zh: '彰化', en: 'Changhua', lat: 24.08, lon: 120.54, side: 'l' },
    { key: 'nantou', zh: '南投', en: 'Nantou', lat: 23.91, lon: 120.68, side: 'b' },
    { key: 'puli', zh: '埔里', en: 'Puli', lat: 23.97, lon: 120.97, side: 'r' },
    { key: 'douliu', zh: '斗六', en: 'Douliu', lat: 23.71, lon: 120.54, side: 'l' },
    { key: 'chiayi', zh: '嘉義', en: 'Chiayi', lat: 23.48, lon: 120.44, side: 'l' },
    { key: 'tainan', zh: '臺南', en: 'Tainan', lat: 23.00, lon: 120.21, side: 'l' },
    { key: 'kaohsiung', zh: '高雄', en: 'Kaohsiung', lat: 22.64, lon: 120.30, side: 'l' },
    { key: 'pingtung', zh: '屏東', en: 'Pingtung', lat: 22.67, lon: 120.49, side: 'r' },
    { key: 'hengchun', zh: '恆春', en: 'Hengchun', lat: 22.00, lon: 120.74, side: 'l' },
    { key: 'taitung', zh: '臺東', en: 'Taitung', lat: 22.79, lon: 121.12, side: 'r' },
    { key: 'hualien', zh: '花蓮', en: 'Hualien', lat: 23.99, lon: 121.60, side: 'r' },
    { key: 'yilan', zh: '宜蘭', en: 'Yilan', lat: 24.75, lon: 121.76, side: 'r' }
  ];
  const C = {}; CITIES.forEach(function (c, i) { C[c.key] = i; });
  // 示意路網（大致照主要公路與鐵路：西部走廊、北宜、蘇花、花東、南迴、中橫、南橫……）
  const TW_EDGES = [
    ['keelung', 'taipei'], ['keelung', 'yilan'], ['taipei', 'taoyuan'], ['taipei', 'yilan'],
    ['taoyuan', 'hsinchu'], ['hsinchu', 'miaoli'], ['miaoli', 'taichung'], ['taichung', 'changhua'],
    ['taichung', 'nantou'], ['taichung', 'puli'], ['changhua', 'nantou'], ['changhua', 'douliu'],
    ['nantou', 'puli'], ['nantou', 'douliu'], ['douliu', 'chiayi'], ['chiayi', 'tainan'],
    ['tainan', 'kaohsiung'], ['kaohsiung', 'pingtung'], ['pingtung', 'hengchun'], ['pingtung', 'taitung'],
    ['hengchun', 'taitung'], ['taitung', 'hualien'], ['hualien', 'yilan'], ['puli', 'hualien'], ['tainan', 'taitung']
  ].map(function (p) { return [C[p[0]], C[p[1]]]; });
  // 臺灣本島的簡化海岸線（示意用，只拿來畫背景；緯度、經度）
  const COAST = [
    [25.30, 121.54], [25.23, 121.64], [25.21, 121.69], [25.15, 121.76], [25.13, 121.92], [25.01, 122.00], [24.93, 121.90],
    [24.86, 121.83], [24.72, 121.83], [24.59, 121.87], [24.46, 121.80], [24.30, 121.76], [24.17, 121.66], [23.98, 121.63],
    [23.90, 121.60], [23.60, 121.52], [23.48, 121.51], [23.32, 121.45], [23.10, 121.38], [22.97, 121.30], [22.75, 121.17],
    [22.70, 121.06], [22.61, 121.01], [22.36, 120.90], [22.27, 120.90], [22.20, 120.88], [22.00, 120.87], [21.90, 120.85],
    [21.92, 120.74], [22.07, 120.70], [22.19, 120.68], [22.26, 120.65], [22.37, 120.59], [22.43, 120.51], [22.46, 120.45],
    [22.50, 120.39], [22.56, 120.33], [22.61, 120.27], [22.73, 120.25], [22.88, 120.18], [22.99, 120.15], [23.13, 120.08],
    [23.27, 120.11], [23.45, 120.14], [23.58, 120.14], [23.78, 120.18], [23.93, 120.31], [24.06, 120.40], [24.27, 120.51],
    [24.37, 120.57], [24.49, 120.66], [24.62, 120.75], [24.70, 120.85], [24.85, 120.92], [24.91, 120.97], [24.99, 121.02],
    [25.05, 121.08], [25.08, 121.18], [25.12, 121.30], [25.15, 121.40], [25.18, 121.42], [25.26, 121.49]
  ];
  const LAT0 = 23.6, LON0 = 120.95;

  /** 大圓距離（公里）：半正矢（haversine）公式 */
  function haversine(lat1, lon1, lat2, lon2) {
    const r = Math.PI / 180;
    const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  /** 畫圖用的投影（等距圓柱投影，以北緯 23.6° 為準；單位公里，y 向下） */
  function project(lat, lon) {
    const r = Math.PI / 180;
    return { x: (lon - LON0) * r * R_EARTH * Math.cos(LAT0 * r), y: -(lat - LAT0) * r * R_EARTH };
  }

  // ======================= 亂數 =======================
  /** 有種子的亂數（mulberry32），同一個種子每次都得到同一串數 */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ======================= 建圖 =======================
  function edgeObj(a, b, w) { return { a: a, b: b, w: w, w0: w, closed: false }; }

  function taiwanGraph() {
    const nodes = CITIES.map(function (c, i) {
      const p = project(c.lat, c.lon);
      return { id: i, key: c.key, zh: c.zh, en: c.en, lat: c.lat, lon: c.lon, x: p.x, y: p.y, side: c.side };
    });
    const edges = TW_EDGES.map(function (p) {
      const a = CITIES[p[0]], b = CITIES[p[1]];
      return edgeObj(p[0], p[1], Math.round(haversine(a.lat, a.lon, b.lat, b.lon)));
    });
    return { mode: 'taiwan', directed: false, nodes: nodes, edges: edges };
  }

  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  /**
   * 隨機圖：n 個點（6–16）散在 1.5 × 1 的長方形裡（彼此不太近），用 Gabriel 圖連邊
   *（以兩點連線為直徑的圓裡沒有別的點才連；一定連通、邊不交叉），權重是 1–9 的隨機整數。
   * 點依 x 由左到右命名 A、B、C……
   */
  function randomGraph(n, seed) {
    n = Math.max(2, Math.min(16, Math.round(n)));
    const rnd = rng((Math.imul(seed >>> 0, 2654435761) ^ (n * 40503)) >>> 0);
    const pts = [];
    let minD = 0.62 / Math.sqrt(n), tries = 0;
    while (pts.length < n) {
      const p = { x: 0.07 + 1.36 * rnd(), y: 0.09 + 0.82 * rnd() };
      let ok = true;
      for (let i = 0; i < pts.length; i++) if (Math.hypot(pts[i].x - p.x, pts[i].y - p.y) < minD) { ok = false; break; }
      if (ok) pts.push(p);
      if (++tries > 4000) { minD *= 0.9; tries = 0; }
    }
    pts.sort(function (p, q) { return p.x - q.x; });
    const nodes = pts.map(function (p, i) { return { id: i, zh: LETTERS[i], en: LETTERS[i], x: p.x, y: p.y }; });
    const edges = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const mx = (pts[i].x + pts[j].x) / 2, my = (pts[i].y + pts[j].y) / 2;
      const r2 = (Math.pow(pts[i].x - pts[j].x, 2) + Math.pow(pts[i].y - pts[j].y, 2)) / 4;
      let empty = true;
      for (let k = 0; k < n && empty; k++) {
        if (k === i || k === j) continue;
        if (Math.pow(pts[k].x - mx, 2) + Math.pow(pts[k].y - my, 2) < r2 * (1 - 1e-9)) empty = false;
      }
      if (empty) edges.push(edgeObj(i, j, 0));
    }
    edges.forEach(function (e) { e.w = e.w0 = 1 + Math.floor(rnd() * 9); });
    return { mode: 'random', directed: false, nodes: nodes, edges: edges, seed: seed, n: n };
  }

  /** 方格：rows × cols 個點，上下左右相連，權重是 1–9 的隨機整數。點的編號由左上角一列一列往右數。 */
  function gridGraph(rows, cols, seed) {
    rows = Math.max(2, Math.min(6, Math.round(rows)));
    cols = Math.max(2, Math.min(8, Math.round(cols)));
    const rnd = rng((Math.imul(seed >>> 0, 2246822519) ^ (rows * 97 + cols)) >>> 0);
    const nodes = [], edges = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) nodes.push({ id: r * cols + c, r: r, c: c, x: c, y: r, zh: '', en: '' });
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (c + 1 < cols) edges.push(edgeObj(i, i + 1, 0));
      if (r + 1 < rows) edges.push(edgeObj(i, i + cols, 0));
    }
    edges.forEach(function (e) { e.w = e.w0 = 1 + Math.floor(rnd() * 9); });
    return { mode: 'grid', directed: false, nodes: nodes, edges: edges, rows: rows, cols: cols, seed: seed };
  }

  /**
   * 負權重：6 個點 S、A、B、C、D、T 的有向無環圖（單行道、沒有環，所以權重是負的也不會有負環）。
   * 邊的編號（Bellman–Ford 每一輪檢查的順序）故意從靠近 T 的邊排到靠近 S 的邊——對 Bellman–Ford 最不利的順序。
   */
  const NEG_NAMES = ['S', 'A', 'B', 'C', 'D', 'T'];
  const NEG_POS = [[0.12, 0.5], [0.5, 0.16], [0.5, 0.84], [1.0, 0.16], [1.0, 0.84], [1.38, 0.5]];
  const NEG_EDGES = [[4, 5, 6], [3, 4, 2], [3, 5, 3], [2, 3, 7], [2, 4, 3], [1, 2, 2], [1, 3, 5], [0, 1, 4], [0, 2, 1]];
  function negGraph() {
    const nodes = NEG_NAMES.map(function (nm, i) { return { id: i, zh: nm, en: nm, x: NEG_POS[i][0], y: NEG_POS[i][1] }; });
    const edges = NEG_EDGES.map(function (e) { return edgeObj(e[0], e[1], e[2]); });
    return { mode: 'neg', directed: true, nodes: nodes, edges: edges };
  }

  function clone(g) {
    const h = Object.assign({}, g);
    h.nodes = g.nodes.map(function (n) { return Object.assign({}, n); });
    h.edges = g.edges.map(function (e) { return Object.assign({}, e); });
    return h;
  }

  // ======================= 圖的工具 =======================
  /** 鄰接串列：adj[u] = [{ v, e, w }]，只含沒有封閉的邊，依 v 由小到大 */
  function adjacency(g) {
    const adj = g.nodes.map(function () { return []; });
    g.edges.forEach(function (ed, e) {
      if (ed.closed) return;
      adj[ed.a].push({ v: ed.b, e: e, w: ed.w });
      if (!g.directed) adj[ed.b].push({ v: ed.a, e: e, w: ed.w });
    });
    adj.forEach(function (l) { l.sort(function (p, q) { return p.v - q.v || p.e - q.e; }); });
    return adj;
  }
  /** Bellman–Ford 的固定順序：邊的編號由小到大；無向邊先 a→b 再 b→a */
  function directedList(g) {
    const out = [];
    g.edges.forEach(function (ed, e) {
      if (ed.closed) return;
      out.push({ u: ed.a, v: ed.b, e: e, w: ed.w });
      if (!g.directed) out.push({ u: ed.b, v: ed.a, e: e, w: ed.w });
    });
    return out;
  }
  function blank(V, s) {
    const d = [], prev = [], pe = [], status = [];
    for (let i = 0; i < V; i++) { d.push(INF); prev.push(-1); pe.push(-1); status.push('none'); }
    if (s >= 0 && s < V) { d[s] = 0; status[s] = 'queue'; }
    return { d: d, prev: prev, pe: pe, status: status };
  }

  // ======================= 三種演算法（產生步驟） =======================
  /**
   * Dijkstra。opts.earlyStop：取出終點就停。
   * 步驟：{ type: 'pop', u, cmp（這次找最小值比較了幾次）, q（取之前佇列有幾個點）, ord（第幾個確定） }
   *       { type: 'check', u, v, e, w, old, nd, ok }      看 u 通往還沒確定的 v 的邊；ok = 有沒有更新
   *       { type: 'late', u, v, e, w, old, nd }           v 已確定，但這條邊其實更短（只在有負權重時發生；Dijkstra 不會改）
   */
  function dijkstra(g, s, t, opts) {
    opts = opts || {};
    const V = g.nodes.length, adj = adjacency(g), st = blank(V, s), steps = [];
    let ord = 0;
    for (;;) {
      let best = -1, cmp = 0, q = 0;
      for (let u = 0; u < V; u++) {
        if (st.status[u] !== 'queue') continue;
        q++;
        if (best < 0) best = u;
        else { cmp++; if (st.d[u] < st.d[best]) best = u; }
      }
      if (best < 0) break;
      steps.push({ type: 'pop', u: best, cmp: cmp, q: q, ord: ++ord });
      st.status[best] = 'done';
      if (opts.earlyStop && best === t) break;
      const du = st.d[best];
      adj[best].forEach(function (a) {
        const nd = du + a.w;
        if (st.status[a.v] === 'done') {
          if (nd < st.d[a.v]) steps.push({ type: 'late', u: best, v: a.v, e: a.e, w: a.w, old: st.d[a.v], nd: nd });
          return;
        }
        const ok = nd < st.d[a.v];
        steps.push({ type: 'check', u: best, v: a.v, e: a.e, w: a.w, old: st.d[a.v], nd: nd, ok: ok });
        if (ok) { st.d[a.v] = nd; st.prev[a.v] = best; st.pe[a.v] = a.e; st.status[a.v] = 'queue'; }
      });
    }
    return finishTrace(g, 'dijkstra', s, t, opts, steps);
  }

  /** BFS：d = 邊數。步驟格式同 Dijkstra（cmp = 0；ok = 第一次發現 v）。 */
  function bfs(g, s, t, opts) {
    opts = opts || {};
    const V = g.nodes.length, adj = adjacency(g), st = blank(V, s), steps = [], queue = [s];
    let ord = 0;
    while (queue.length) {
      const u = queue.shift();
      steps.push({ type: 'pop', u: u, cmp: 0, q: queue.length + 1, ord: ++ord });
      st.status[u] = 'done';
      if (opts.earlyStop && u === t) break;
      adj[u].forEach(function (a) {
        if (st.status[a.v] === 'done') return;
        const nd = st.d[u] + 1, ok = st.d[a.v] === INF;
        steps.push({ type: 'check', u: u, v: a.v, e: a.e, w: a.w, old: st.d[a.v], nd: nd, ok: ok });
        if (ok) { st.d[a.v] = nd; st.prev[a.v] = u; st.pe[a.v] = a.e; st.status[a.v] = 'queue'; queue.push(a.v); }
      });
    }
    return finishTrace(g, 'bfs', s, t, opts, steps);
  }

  /**
   * Bellman–Ford：每一輪依固定順序鬆弛每一條（有向）邊，最多 V − 1 輪，一輪沒有更新就停。
   * 步驟：{ type: 'check', r（第幾輪）, j（這輪第幾條）, m（這輪共幾條）, u, v, e, w, old, nd, ok, last（這輪最後一條）, upd（這輪更新次數，只在 last 上） }
   */
  function bellmanFord(g, s, t, opts) {
    opts = opts || {};
    const V = g.nodes.length, list = directedList(g), st = blank(V, s), steps = [];
    for (let r = 1; r <= V - 1 && list.length; r++) {
      let upd = 0;
      list.forEach(function (de, j) {
        const du = st.d[de.u];
        const nd = du === INF ? INF : du + de.w;
        const ok = nd < st.d[de.v];
        steps.push({ type: 'check', r: r, j: j + 1, m: list.length, u: de.u, v: de.v, e: de.e, w: de.w, old: st.d[de.v], nd: nd, ok: ok });
        if (ok) { st.d[de.v] = nd; st.prev[de.v] = de.u; st.pe[de.v] = de.e; if (st.status[de.v] === 'none') st.status[de.v] = 'queue'; upd++; }
      });
      steps[steps.length - 1].last = true;
      steps[steps.length - 1].upd = upd;
      if (!upd) break;
    }
    return finishTrace(g, 'bf', s, t, opts, steps);
  }

  function run(g, algo, s, t, opts) {
    return algo === 'bfs' ? bfs(g, s, t, opts) : algo === 'bf' ? bellmanFord(g, s, t, opts) : dijkstra(g, s, t, opts);
  }

  /** 從起始狀態套用前 k 步，得到第 k 步之後的狀態（上一步 = 從頭重播） */
  function stateAt(tr, k) {
    const V = tr.V, st = blank(V, tr.s);
    st.order = []; st.queue = tr.algo === 'bfs' ? [tr.s] : null;
    st.pops = 0; st.checks = 0; st.relax = 0; st.cmp = 0; st.late = 0; st.round = 0; st.updRounds = 0;
    k = Math.max(0, Math.min(tr.steps.length, k));
    for (let i = 0; i < k; i++) apply(st, tr.steps[i], tr.algo);
    st.k = k;
    st.end = k >= tr.steps.length;
    if (st.end && tr.algo === 'bf') for (let i = 0; i < V; i++) if (st.d[i] < INF) st.status[i] = 'done';
    return st;
  }
  function apply(st, sp, algo) {
    if (sp.type === 'pop') {
      st.status[sp.u] = 'done'; st.order.push(sp.u); st.pops++; st.cmp += sp.cmp;
      if (st.queue) st.queue.shift();
    } else if (sp.type === 'check') {
      st.checks++;
      if (algo === 'bf') st.round = sp.r;
      if (sp.ok) {
        st.relax++;
        st.d[sp.v] = sp.nd; st.prev[sp.v] = sp.u; st.pe[sp.v] = sp.e;
        if (st.status[sp.v] === 'none') st.status[sp.v] = 'queue';
        if (st.queue) st.queue.push(sp.v);
      }
      if (algo === 'bf' && sp.last && sp.upd) st.updRounds++;
    } else if (sp.type === 'late') st.late++;
  }

  function finishTrace(g, algo, s, t, opts, steps) {
    const tr = { algo: algo, s: s, t: t, V: g.nodes.length, earlyStop: !!opts.earlyStop, steps: steps };
    const fin = stateAt(tr, steps.length);
    tr.final = fin;
    let rounds = 0;
    steps.forEach(function (sp) { if (sp.r) rounds = sp.r; });
    tr.stats = { steps: steps.length, pops: fin.pops, checks: fin.checks, relax: fin.relax, cmp: fin.cmp, late: fin.late, rounds: rounds, updRounds: fin.updRounds };
    return tr;
  }

  // ======================= 參考解與分析 =======================
  /** Floyd–Warshall：所有點對的最短距離（沒有負環時正確） */
  function floydWarshall(g) {
    const V = g.nodes.length, D = [];
    for (let i = 0; i < V; i++) { D.push([]); for (let j = 0; j < V; j++) D[i].push(i === j ? 0 : INF); }
    g.edges.forEach(function (ed) {
      if (ed.closed) return;
      if (ed.w < D[ed.a][ed.b]) D[ed.a][ed.b] = ed.w;
      if (!g.directed && ed.w < D[ed.b][ed.a]) D[ed.b][ed.a] = ed.w;
    });
    for (let k = 0; k < V; k++) for (let i = 0; i < V; i++) {
      if (D[i][k] === INF) continue;
      for (let j = 0; j < V; j++) if (D[i][k] + D[k][j] < D[i][j]) D[i][j] = D[i][k] + D[k][j];
    }
    return D;
  }
  /** 暴力列舉從 s 出發的所有簡單路徑（小圖用）：每個點的最短長度與「最短的路有幾條」 */
  function bruteForce(g, s) {
    const V = g.nodes.length, adj = adjacency(g), best = [], cnt = [], seen = [];
    for (let i = 0; i < V; i++) { best.push(INF); cnt.push(0); seen.push(false); }
    (function dfs(u, len) {
      if (len < best[u]) { best[u] = len; cnt[u] = 1; } else if (len === best[u]) cnt[u]++;
      seen[u] = true;
      adj[u].forEach(function (a) { if (!seen[a.v]) dfs(a.v, len + a.w); });
      seen[u] = false;
    })(s, 0);
    return { d: best, count: cnt };
  }
  /** 沿著前一站往回走，得到 s → t 的路徑（點的編號）；到不了回傳 null */
  function pathTo(prev, s, t) {
    if (t === s) return [s];
    if (prev[t] < 0) return null;
    const p = [t];
    let u = t, guard = 0;
    while (u !== s && guard++ < prev.length + 2) { u = prev[u]; if (u < 0) return null; p.push(u); }
    return u === s ? p.reverse() : null;
  }
  /** 一條路徑（點的序列）用到的邊：取兩點之間最短的那條沒封閉的邊 */
  function pathEdges(g, path) {
    const out = [];
    for (let i = 0; i + 1 < (path ? path.length : 0); i++) {
      const u = path[i], v = path[i + 1];
      let best = -1;
      g.edges.forEach(function (ed, e) {
        if (ed.closed) return;
        const fits = (ed.a === u && ed.b === v) || (!g.directed && ed.a === v && ed.b === u);
        if (fits && (best < 0 || ed.w < g.edges[best].w)) best = e;
      });
      out.push(best);
    }
    return out;
  }
  function pathLength(g, path) {
    if (!path) return INF;
    return pathEdges(g, path).reduce(function (acc, e) { return acc + (e >= 0 ? g.edges[e].w : INF); }, 0);
  }
  /**
   * 從 s 到每一點的最短路有幾條（d 是正確的最短距離）。
   * 無向圖要所有（可走到的）邊權重都 > 0 才算得出來（有 0 時回傳 null）；有向無環圖照編號順序（拓撲順序）算。
   */
  function countPaths(g, s, d) {
    const V = g.nodes.length, cnt = [];
    for (let i = 0; i < V; i++) cnt.push(0);
    if (!(s >= 0 && s < V)) return cnt;
    const adj = adjacency(g);
    if (!g.directed) {
      for (let u = 0; u < V; u++) if (d[u] < INF) for (const a of adj[u]) if (a.w <= 0) return null;
    }
    cnt[s] = 1;
    const order = [];
    for (let i = 0; i < V; i++) if (d[i] < INF) order.push(i);
    if (!g.directed) order.sort(function (p, q) { return d[p] - d[q] || p - q; });
    order.forEach(function (u) {
      adj[u].forEach(function (a) { if (d[u] + a.w === d[a.v] && (g.directed || d[a.v] > d[u])) cnt[a.v] += cnt[u]; });
    });
    return cnt;
  }
  /** 連通分量（有向圖當成無向）：comp[i] = 分量編號 */
  function components(g) {
    const V = g.nodes.length, par = [];
    for (let i = 0; i < V; i++) par.push(i);
    const find = function (x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    g.edges.forEach(function (ed) { if (!ed.closed) { const a = find(ed.a), b = find(ed.b); if (a !== b) par[a] = b; } });
    return g.nodes.map(function (n, i) { return find(i); });
  }
  /** 最小生成樹（Kruskal，權重相同時邊的編號小的先）：{ weight, edges } */
  function mst(g) {
    const V = g.nodes.length, par = [];
    for (let i = 0; i < V; i++) par.push(i);
    const find = function (x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    const idx = [];
    g.edges.forEach(function (ed, e) { if (!ed.closed) idx.push(e); });
    idx.sort(function (p, q) { return g.edges[p].w - g.edges[q].w || p - q; });
    let weight = 0;
    const used = [];
    idx.forEach(function (e) {
      const a = find(g.edges[e].a), b = find(g.edges[e].b);
      if (a !== b) { par[a] = b; weight += g.edges[e].w; used.push(e); }
    });
    return { weight: weight, edges: used.sort(function (p, q) { return p - q; }) };
  }
  /**
   * 最小生成樹是不是唯一的：每一條不在樹上（也沒封閉）的邊 (a, b, w)，樹上 a 到 b 的路徑中最重的邊都必須比 w 輕。
   * （有一條邊剛好一樣重，就可以和它交換，得到另一棵一樣輕的樹。）
   */
  function mstUnique(g) {
    const V = g.nodes.length, M = mst(g), inT = {}, adj = [];
    for (let i = 0; i < V; i++) adj.push([]);
    M.edges.forEach(function (e) { inT[e] = true; const ed = g.edges[e]; adj[ed.a].push({ v: ed.b, w: ed.w }); adj[ed.b].push({ v: ed.a, w: ed.w }); });
    const maxOnPath = function (a, b) {
      const best = [], seen = [];
      for (let i = 0; i < V; i++) { best.push(-INF); seen.push(false); }
      const stack = [a]; seen[a] = true;
      while (stack.length) {
        const u = stack.pop();
        if (u === b) return best[u];
        adj[u].forEach(function (x) { if (!seen[x.v]) { seen[x.v] = true; best[x.v] = Math.max(best[u], x.w); stack.push(x.v); } });
      }
      return null;
    };
    return g.edges.every(function (ed, e) {
      if (ed.closed || inT[e] || ed.a === ed.b) return true;
      const m = maxOnPath(ed.a, ed.b);
      return m === null || m < ed.w;
    });
  }
  /** 圖的直徑：所有能互相到達的點對中，最短距離的最大值（無向圖） */
  function diameter(g) {
    const D = floydWarshall(g), V = g.nodes.length;
    let best = -1, pairs = [];
    for (let i = 0; i < V; i++) for (let j = i + 1; j < V; j++) {
      if (D[i][j] === INF) continue;
      if (D[i][j] > best) { best = D[i][j]; pairs = [[i, j]]; } else if (D[i][j] === best) pairs.push([i, j]);
    }
    return { d: best, pairs: pairs };
  }
  /** 權重與封閉狀態的指紋（判斷兩次執行是不是同一張圖） */
  function signature(g) { return g.edges.map(function (e) { return e.closed ? 'x' : String(e.w); }).join(','); }

  /** 權重的修改情形：edits（和原值不同的邊數）、closed（封閉的邊數）、allEqual（沒封閉的邊權重都相同）、unedited、sig */
  function weightInfo(g) {
    let edits = 0, closed = 0, allEqual = true, first = null;
    g.edges.forEach(function (e) {
      if (e.w !== e.w0) edits++;
      if (e.closed) { closed++; return; }
      if (first === null) first = e.w; else if (e.w !== first) allEqual = false;
    });
    return { edits: edits, closed: closed, allEqual: allEqual && first !== null, unedited: edits === 0 && closed === 0, sig: signature(g) };
  }

  let twDiam = null;
  /**
   * 一次執行跑完之後的整理：畫面要的對照資料（res）與任務事件 'finish' 的資料（data，頁面另外加上 manual）。
   * 頁面與任務證明腳本都用這個函式，兩邊的事件資料一定相同。
   * g：圖；mode：'taiwan'／'random'／'grid'／'neg'；tr：這次執行的步驟記錄（run 的傳回值）。
   */
  function report(g, mode, tr) {
    const s = tr.s, t = tr.t, algo = tr.algo, early = tr.earlyStop, f = tr.final, V = g.nodes.length;
    const path = pathTo(f.prev, s, t);
    const full = !early;
    const truthTr = g.directed || algo === 'bf' ? bellmanFord(g, s, t, {}) : (algo === 'dijkstra' && full ? tr : dijkstra(g, s, t, {}));
    const truth = truthTr.final.d;
    const dijTr = algo === 'dijkstra' && full ? tr : dijkstra(g, s, t, {});
    const bfsTr = algo === 'bfs' && full ? tr : bfs(g, s, t, {});
    const dijPath = pathTo(dijTr.final.prev, s, t), bfsPath = pathTo(bfsTr.final.prev, s, t);
    const truthPath = pathTo(truthTr.final.prev, s, t);
    const key = function (p) { return p ? p.join('-') : ''; };
    const cntArr = countPaths(g, s, truth);
    const count = cntArr && truth[t] < INF ? cntArr[t] : null;
    // 負權重：Dijkstra 確定的點裡，和正確值（Bellman–Ford）不同的點
    let wrong = 0, wrongSet = null;
    if (g.directed && algo === 'dijkstra') {
      wrongSet = {};
      for (let i = 0; i < V; i++) if (f.status[i] === 'done' && f.d[i] !== truth[i]) { wrongSet[i] = true; wrong++; }
    }
    // 對照路線：Dijkstra 對 BFS、BFS 對 Dijkstra、負權重時 Dijkstra 對真正的最短路
    let ghost = null;
    if (algo === 'dijkstra' && !g.directed && bfsPath && key(bfsPath) !== key(path)) ghost = bfsPath;
    else if (algo === 'bfs' && dijPath && path && key(dijPath) !== key(path)) ghost = dijPath;
    else if (algo === 'dijkstra' && g.directed && truthPath && path && key(truthPath) !== key(path)) ghost = truthPath;
    const comp = components(g);
    const side = function (x) { return comp.filter(function (c) { return c === comp[x]; }).length; };
    const wi = weightInfo(g);
    let sptW = 0, reachAll = true;
    for (let i = 0; i < V; i++) { if (f.d[i] === INF) reachAll = false; if (f.pe[i] >= 0) sptW += g.edges[f.pe[i]].w; }
    // 最短路徑樹就是那一棵（唯一的）最小生成樹：總權重相同，而且最小生成樹沒有平手（全部權重相等時任何樹都一樣輕，不算）
    const sptMst = algo === 'dijkstra' && full && reachAll && !g.directed && sptW === mst(g).weight && mstUnique(g);
    const adjST = s !== t && g.edges.some(function (e) { return !e.closed && ((e.a === s && e.b === t) || (!g.directed && e.a === t && e.b === s)); });
    let corners = false, square = false;
    if (mode === 'grid') {
      const c1 = g.cols - 1, c2 = (g.rows - 1) * g.cols, c3 = V - 1;
      corners = (s === 0 && t === c3) || (s === c3 && t === 0) || (s === c1 && t === c2) || (s === c2 && t === c1);
      square = g.rows === g.cols;
    }
    const negOnPath = truthPath ? pathEdges(g, truthPath).filter(function (e) { return e >= 0 && g.edges[e].w < 0; }).length : 0;
    const reach = f.d.filter(function (x) { return x < INF; }).length;
    const dist = algo === 'bfs' ? (path ? pathLength(g, path) : null) : (f.d[t] < INF ? f.d[t] : null);
    if (mode === 'taiwan' && twDiam === null) twDiam = diameter(taiwanGraph()).d;
    const res = {
      path: path, dist: dist, hops: path ? path.length - 1 : null, count: count, truth: truth, wrong: wrong, wrongSet: wrongSet, ghost: ghost,
      dijDist: dijTr.final.d[t] < INF ? dijTr.final.d[t] : null, dijPath: dijPath, bfsPath: bfsPath,
      bfsLen: bfsPath ? pathLength(g, bfsPath) : null, truthPath: truthPath
    };
    const data = {
      mode: mode, algo: algo, s: s, t: t, sKey: g.nodes[s].key || '', tKey: g.nodes[t].key || '',
      V: V, E: g.edges.filter(function (e) { return !e.closed; }).length, reach: reach, settled: f.pops,
      steps: tr.steps.length, checks: tr.stats.checks, relax: tr.stats.relax, cmp: tr.stats.cmp, late: tr.stats.late,
      rounds: tr.stats.rounds, updRounds: tr.stats.updRounds, early: early,
      dist: dist, hops: res.hops, pathKey: key(path), count: count,
      unedited: wi.unedited, edits: wi.edits, closed: wi.closed, allEqual: wi.allEqual, wsig: wi.sig,
      dijDist: res.dijDist, dijPathKey: key(dijPath), bfsPathKey: key(bfsPath), bfsLen: res.bfsLen,
      wrong: wrong, wrongT: !!(wrongSet && wrongSet[t]), truthDist: truth[t] < INF ? truth[t] : null,
      truthHops: truthPath ? truthPath.length - 1 : null, negOnPath: negOnPath,
      adjST: adjST, sideS: side(s), sideT: side(t), sep: comp[s] !== comp[t],
      isDiam: mode === 'taiwan' && wi.unedited && algo === 'dijkstra' && dist === twDiam,
      sptMst: sptMst, rows: g.rows || 0, cols: g.cols || 0, corners: corners, square: square
    };
    return { res: res, data: data };
  }

  const api = {
    R_EARTH: R_EARTH, INF: INF, CITIES: CITIES, TW_EDGES: TW_EDGES, COAST: COAST, NEG_NAMES: NEG_NAMES, LETTERS: LETTERS,
    haversine: haversine, project: project, rng: rng,
    taiwanGraph: taiwanGraph, randomGraph: randomGraph, gridGraph: gridGraph, negGraph: negGraph, clone: clone,
    adjacency: adjacency, directedList: directedList,
    dijkstra: dijkstra, bfs: bfs, bellmanFord: bellmanFord, run: run, stateAt: stateAt,
    floydWarshall: floydWarshall, bruteForce: bruteForce, pathTo: pathTo, pathEdges: pathEdges, pathLength: pathLength,
    countPaths: countPaths, components: components, mst: mst, diameter: diameter, signature: signature,
    mstUnique: mstUnique, weightInfo: weightInfo, report: report
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShortestPathCore = api;
})(typeof window !== 'undefined' ? window : this);
