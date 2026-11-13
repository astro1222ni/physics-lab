/* graph-traversal-core.js — 「圖的走訪：DFS 與 BFS 走迷宮」的計算核心（與畫面分離，Node 單元測試：tests/graph-traversal-core.test.js）
 *
 * 迷宮：n × n 個格子（點），相鄰兩格之間沒有牆就是一條通道（邊）。每格用 4 個位元記錄四面的通道：上 1、右 2、下 4、左 8。
 *   產生器（有種子，同一組 (n, 方式, 編號) 每次都一樣）：
 *     'dfs'  隨機 DFS（recursive backtracker）：從隨機一格出發，隨機挑一個沒去過的鄰格打通、走過去；四周都去過就退回。長走廊、岔路少。
 *     'prim' 隨機 Prim：已連上的區域旁邊的格子放進候選清單，每次隨機挑一個候選格，打通它和區域之間隨機一面牆。很多短的死巷。
 *     'open' 空地：所有內牆都拿掉。
 *   'dfs'、'prim' 產生的都是「生成樹」：每一格都走得到，而且通道數 = 格子數 − 1，所以任兩格之間恰好一條路（單元測試驗證）。
 *   「打通牆」：把剩下的內牆用同一個種子洗牌，依百分比拿掉最前面的幾面（百分比越大，拿掉的牆包含百分比小時拿掉的牆）。拿掉 k 面就多出 k 個獨立的迴路。
 *   手畫的牆可以讓迷宮變得不連通或有迴路，就不一定是樹了（report 會算出是不是樹、有幾個連通塊、幾個獨立迴路）。
 *
 * 一般圖：V 個點（A、B、C…），鄰接矩陣 M（對稱、對角線是 0）。鄰接串列由矩陣產生：每個點的鄰居照字母順序（或倒過來）。
 *
 * 兩種走訪都寫成「步驟產生器」：先把每一步記下來（trace），畫面再照著播放；上一步 = 從頭重播。
 *   鄰居順序：迷宮照選定的方向順序（例如「上右下左」）列出打通的鄰格；一般圖照鄰接串列的順序。
 *   DFS（深度優先）：本頁用「遞迴版 DFS 改寫成明確堆疊」的寫法——堆疊裡放的就是「從起點到目前這一格的路」。
 *     每一步看堆疊頂端那一格 u，從上次看到的地方繼續照鄰居順序往下找：找到第一個還沒拜訪的鄰居 v，就標記 v、把 v 推進堆疊（前進，'push'）；
 *     u 的鄰居都看完了還找不到，就把 u 彈出（退回，'pop'）。這樣拜訪（標記）的順序和遞迴版 visit(u){ 標記 u; for v in 鄰居(u): if 未拜訪 visit(v) } 完全相同。
 *     另一種常見寫法「彈出 u、把 u 所有鄰居都推進堆疊」只要把鄰居倒過來推，也會得到同樣的拜訪順序；照原順序推就會變成反過來的順序（單元測試都驗證）。
 *   BFS（廣度優先）：先進先出的佇列。每一步從佇列前面取出一格 u，照鄰居順序把還沒拜訪的鄰居全部標記、排到佇列後面（'deq'）。
 *   「拜訪」= 標記：DFS 是被推進堆疊的時候，BFS 是被排進佇列的時候；每個走得到的格子恰好拜訪一次。
 *   「找到終點就停」：DFS 在終點被推進堆疊的那一步停（此時堆疊就是找到的路）；BFS 在終點被排進佇列的那一步做完時停（那一步其他的鄰居照樣排進去）。
 *   檢查鄰居：每看一個鄰居算一次。完整走訪時，兩者都剛好 2E′ 次（E′ = 起點那一塊的通道數，每條通道兩頭各看一次）；
 *   DFS 的步數 = 2 × 拜訪的格數 − 1（起點以外每格推進一次，每格彈出一次），BFS 的步數 = 拜訪的格數。
 */
(function (root) {
  'use strict';

  // ======================= 方向與鄰居順序 =======================
  const DIRS = [
    { key: 'N', dr: -1, dc: 0, bit: 1 },
    { key: 'E', dr: 0, dc: 1, bit: 2 },
    { key: 'S', dr: 1, dc: 0, bit: 4 },
    { key: 'W', dr: 0, dc: -1, bit: 8 }
  ];
  const OPP = [2, 3, 0, 1];
  // 8 種鄰居順序：從上／右／下／左開始，順時針或逆時針
  const ORDERS = {
    NESW: [0, 1, 2, 3], ESWN: [1, 2, 3, 0], SWNE: [2, 3, 0, 1], WNES: [3, 0, 1, 2],
    NWSE: [0, 3, 2, 1], WSEN: [3, 2, 1, 0], SENW: [2, 1, 0, 3], ENWS: [1, 0, 3, 2]
  };
  const ORDER_KEYS = ['NESW', 'ESWN', 'SWNE', 'WNES', 'NWSE', 'WSEN', 'SENW', 'ENWS'];
  const GEN_CODE = { dfs: 1, prim: 2, open: 3 };

  /** mulberry32：可重現的虛擬亂數 */
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

  // ======================= 迷宮 =======================
  function blankMaze(n) { return { n: n, open: new Uint8Array(n * n) }; }
  function cloneMaze(m) { return { n: m.n, open: new Uint8Array(m.open) }; }
  /** 第 i 格往方向 d 的鄰格（出界傳回 −1） */
  function nb(m, i, d) {
    const n = m.n, r = (i / n) | 0, c = i % n, rr = r + DIRS[d].dr, cc = c + DIRS[d].dc;
    return rr < 0 || cc < 0 || rr >= n || cc >= n ? -1 : rr * n + cc;
  }
  function isOpen(m, i, d) { return (m.open[i] & DIRS[d].bit) !== 0; }
  /** 打通（on = true）或砌起（on = false）第 i 格方向 d 的那面牆；有改變才傳回 true。外框不能打通。 */
  function setOpen(m, i, d, on) {
    const j = nb(m, i, d);
    if (j < 0) return false;
    if (isOpen(m, i, d) === on) return false;
    if (on) { m.open[i] |= DIRS[d].bit; m.open[j] |= DIRS[OPP[d]].bit; }
    else { m.open[i] &= ~DIRS[d].bit; m.open[j] &= ~DIRS[OPP[d]].bit; }
    return true;
  }
  /** 所有內牆（每面只列一次：每格的右牆與下牆），[格, 方向] */
  function internalWalls(m) {
    const out = [], n = m.n;
    for (let i = 0; i < n * n; i++) {
      if (i % n < n - 1 && !isOpen(m, i, 1)) out.push([i, 1]);
      if (((i / n) | 0) < n - 1 && !isOpen(m, i, 2)) out.push([i, 2]);
    }
    return out;
  }
  function countOpen(m) {
    let e = 0;
    for (let i = 0; i < m.open.length; i++) { if (m.open[i] & 2) e++; if (m.open[i] & 4) e++; }
    return e;
  }
  function seedOf(n, gen, seed) { return (Math.imul(seed | 0, 2654435761) ^ Math.imul(n, 97) ^ Math.imul(GEN_CODE[gen] || 0, 1013904223)) >>> 0; }

  function carveDFS(m, rnd) {
    const N = m.n * m.n, seen = new Uint8Array(N);
    const s = Math.floor(rnd() * N);
    seen[s] = 1;
    const st = [s];
    while (st.length) {
      const u = st[st.length - 1];
      const cand = [];
      for (let d = 0; d < 4; d++) { const j = nb(m, u, d); if (j >= 0 && !seen[j]) cand.push(d); }
      if (!cand.length) { st.pop(); continue; }
      const d = cand[Math.floor(rnd() * cand.length)], j = nb(m, u, d);
      setOpen(m, u, d, true);
      seen[j] = 1;
      st.push(j);
    }
  }
  function carvePrim(m, rnd) {
    const N = m.n * m.n, inT = new Uint8Array(N), inF = new Uint8Array(N), F = [];
    const add = function (u) {
      for (let d = 0; d < 4; d++) { const j = nb(m, u, d); if (j >= 0 && !inT[j] && !inF[j]) { inF[j] = 1; F.push(j); } }
    };
    const s = Math.floor(rnd() * N);
    inT[s] = 1; add(s);
    while (F.length) {
      const k = Math.floor(rnd() * F.length), u = F[k];
      F[k] = F[F.length - 1]; F.pop();
      const ds = [];
      for (let d = 0; d < 4; d++) { const j = nb(m, u, d); if (j >= 0 && inT[j]) ds.push(d); }
      setOpen(m, u, ds[Math.floor(rnd() * ds.length)], true);
      inT[u] = 1;
      add(u);
    }
  }
  /**
   * 產生迷宮。gen：'dfs'／'prim'／'open'；seed：編號（1, 2, 3…）；loops：打通剩下內牆的百分比（0–100）。
   */
  function generate(n, gen, seed, loops) {
    const m = blankMaze(n);
    const rnd = rng(seedOf(n, gen, seed));
    if (gen === 'open') { for (let i = 0; i < n * n; i++) { setOpen(m, i, 1, true); setOpen(m, i, 2, true); } }
    else if (gen === 'prim') carvePrim(m, rnd);
    else carveDFS(m, rnd);
    const walls = internalWalls(m);
    for (let i = walls.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const x = walls[i]; walls[i] = walls[j]; walls[j] = x; }
    const k = Math.round(walls.length * Math.max(0, Math.min(100, loops || 0)) / 100);
    for (let i = 0; i < k; i++) setOpen(m, walls[i][0], walls[i][1], true);
    return m;
  }
  /** 迷宮 → 鄰接串列（每格的鄰居照方向順序 orderKey） */
  function mazeAdj(m, orderKey) {
    const ord = ORDERS[orderKey] || ORDERS.NESW, N = m.n * m.n, adj = new Array(N);
    for (let i = 0; i < N; i++) {
      const l = [];
      for (let k = 0; k < 4; k++) { const d = ord[k]; if (m.open[i] & DIRS[d].bit) l.push(nb(m, i, d)); }
      adj[i] = l;
    }
    return adj;
  }
  /** 迷宮的指紋（同一組牆壁就相同） */
  function mazeSig(m) {
    let h = 2166136261 ^ m.n;
    for (let i = 0; i < m.open.length; i++) { h ^= m.open[i]; h = Math.imul(h, 16777619); }
    return m.n + ':' + (h >>> 0).toString(16);
  }

  // ======================= 一般圖 =======================
  const NAMES = 'ABCDEFGHIJKL'.split('');
  // 範例圖：8 個點、11 條邊（有迴路；DFS 與 BFS 的拜訪順序不同）
  const SAMPLE_POS = [[0.16, 0.18], [0.5, 0.08], [0.84, 0.2], [0.1, 0.62], [0.46, 0.46], [0.88, 0.62], [0.3, 0.92], [0.7, 0.92]];
  const SAMPLE_EDGES = [[0, 1], [0, 3], [0, 4], [1, 2], [1, 4], [2, 5], [3, 6], [4, 5], [4, 6], [5, 7], [6, 7]];
  function blankGraph(V) { return { V: V, M: new Uint8Array(V * V), pos: [], names: NAMES.slice(0, V) }; }
  function setEdge(g, a, b, on) {
    if (a === b || a < 0 || b < 0 || a >= g.V || b >= g.V) return false;
    const v = on ? 1 : 0;
    if (g.M[a * g.V + b] === v) return false;
    g.M[a * g.V + b] = v; g.M[b * g.V + a] = v;
    return true;
  }
  function hasEdge(g, a, b) { return g.M[a * g.V + b] === 1; }
  function sampleGraph() {
    const g = blankGraph(8);
    g.pos = SAMPLE_POS.map(function (p) { return { x: p[0], y: p[1] }; });
    SAMPLE_EDGES.forEach(function (e) { setEdge(g, e[0], e[1], true); });
    return g;
  }
  /** 隨機連通圖：先連成一棵隨機樹，再加 ⌊V/2⌋ 條邊（所以一定有迴路）；點排在一個圓上 */
  function randomGraph(V, seed) {
    const g = blankGraph(V), rnd = rng((Math.imul(seed | 0, 2246822519) ^ Math.imul(V, 3266489917)) >>> 0);
    for (let i = 0; i < V; i++) {
      const a = -Math.PI / 2 + 2 * Math.PI * i / V;
      g.pos.push({ x: 0.5 + 0.42 * Math.cos(a), y: 0.5 + 0.42 * Math.sin(a) });
    }
    for (let i = 1; i < V; i++) setEdge(g, i, Math.floor(rnd() * i), true);
    let extra = Math.floor(V / 2), guard = 0;
    while (extra > 0 && guard++ < 500) {
      const a = Math.floor(rnd() * V), b = Math.floor(rnd() * V);
      if (a !== b && !hasEdge(g, a, b)) { setEdge(g, a, b, true); extra--; }
    }
    return g;
  }
  function cloneGraph(g) { return { V: g.V, M: new Uint8Array(g.M), pos: g.pos.map(function (p) { return { x: p.x, y: p.y }; }), names: g.names.slice() }; }
  /** 一般圖 → 鄰接串列（字母順序；rev = true 時倒過來） */
  function graphAdj(g, rev) {
    const adj = [];
    for (let i = 0; i < g.V; i++) {
      const l = [];
      for (let j = 0; j < g.V; j++) if (j !== i && g.M[i * g.V + j]) l.push(j);
      if (rev) l.reverse();
      adj.push(l);
    }
    return adj;
  }
  function graphEdges(g) {
    let e = 0;
    for (let i = 0; i < g.V; i++) for (let j = i + 1; j < g.V; j++) if (g.M[i * g.V + j]) e++;
    return e;
  }
  function graphSig(g) { let s = g.V + ':'; for (let i = 0; i < g.V; i++) for (let j = i + 1; j < g.V; j++) s += g.M[i * g.V + j]; return s; }

  // ======================= 走訪（步驟產生器） =======================
  /**
   * DFS。adj：鄰接串列；s：起點；t：終點（−1 表示沒有終點、走完全部）；early：找到終點就停。
   * 傳回 { algo, s, t, early, steps, found（找到終點時已走的步數，−1 = 沒找到）, order（拜訪順序）, parent, stats }
   *   步驟：{ op: 'push', u, v, chk } 從 u 前進到新的一格 v；{ op: 'pop', u, chk } 從 u 退回。chk = 這一步檢查了幾個鄰居。
   */
  function dfsTrace(adj, s, t, early) {
    const V = adj.length, mark = new Uint8Array(V), ptr = new Int32Array(V), parent = new Int32Array(V).fill(-1);
    const steps = [], order = [s], stack = [s];
    mark[s] = 1;
    let found = s === t ? 0 : -1, pops = 0, popsBefore = s === t ? 0 : -1, maxStack = 1, checks = 0, path = s === t ? [s] : null;
    if (!(early && found === 0)) {
      while (stack.length) {
        const u = stack[stack.length - 1];
        let chk = 0, v = -1;
        const l = adj[u];
        while (ptr[u] < l.length) { const w = l[ptr[u]++]; chk++; if (!mark[w]) { v = w; break; } }
        checks += chk;
        if (v >= 0) {
          mark[v] = 1; parent[v] = u; order.push(v); stack.push(v);
          if (stack.length > maxStack) maxStack = stack.length;
          steps.push({ op: 'push', u: u, v: v, chk: chk });
          if (v === t && found < 0) { found = steps.length; popsBefore = pops; path = stack.slice(); if (early) break; }
        } else {
          stack.pop(); pops++;
          steps.push({ op: 'pop', u: u, chk: chk });
        }
      }
    }
    return {
      algo: 'dfs', s: s, t: t, early: !!early, steps: steps, found: found, order: order, parent: parent,
      stats: { visited: order.length, steps: steps.length, pops: pops, popsBefore: popsBefore, maxLen: maxStack, checks: checks,
        path: path ? path.length - 1 : null, pathCells: path, depth: maxStack - 1 }
    };
  }
  /**
   * BFS。步驟：{ op: 'deq', u, add（這一步新排進佇列的格子）, chk }。
   */
  function bfsTrace(adj, s, t, early) {
    const V = adj.length, mark = new Uint8Array(V), dist = new Int32Array(V).fill(-1), parent = new Int32Array(V).fill(-1);
    const steps = [], order = [s], queue = [s];
    mark[s] = 1; dist[s] = 0;
    let head = 0, found = s === t ? 0 : -1, maxQ = 1, checks = 0, depth = 0;
    if (!(early && found === 0)) {
      while (head < queue.length) {
        const u = queue[head++], add = [];
        let chk = 0;
        const l = adj[u];
        for (let k = 0; k < l.length; k++) {
          const w = l[k]; chk++;
          if (!mark[w]) { mark[w] = 1; dist[w] = dist[u] + 1; parent[w] = u; order.push(w); queue.push(w); add.push(w); if (dist[w] > depth) depth = dist[w]; }
        }
        checks += chk;
        steps.push({ op: 'deq', u: u, add: add, chk: chk });
        if (queue.length - head > maxQ) maxQ = queue.length - head;
        if (found < 0 && t >= 0 && mark[t]) { found = steps.length; if (early) break; }
      }
    }
    let path = null;
    if (found >= 0) { path = []; for (let v = t; v >= 0; v = parent[v]) path.push(v); path.reverse(); }
    return {
      algo: 'bfs', s: s, t: t, early: !!early, steps: steps, found: found, order: order, parent: parent, dist: dist,
      stats: { visited: order.length, steps: steps.length, pops: 0, popsBefore: 0, maxLen: maxQ, checks: checks,
        path: path ? path.length - 1 : null, pathCells: path, depth: depth }
    };
  }
  /** 遞迴版 DFS 的拜訪順序（對照用；深度大時用 Node 預設的呼叫堆疊也夠：迷宮最多 1600 格） */
  function dfsRecursiveOrder(adj, s) {
    const mark = new Uint8Array(adj.length), out = [];
    (function visit(u) { mark[u] = 1; out.push(u); adj[u].forEach(function (v) { if (!mark[v]) visit(v); }); })(s);
    return out;
  }
  /** 另一種常見的 DFS：彈出 u，若還沒拜訪就標記，再把 u 的鄰居全部推進堆疊。reverse = true 時倒過來推。 */
  function dfsPushAllOrder(adj, s, reverse) {
    const mark = new Uint8Array(adj.length), out = [], st = [s];
    while (st.length) {
      const u = st.pop();
      if (mark[u]) continue;
      mark[u] = 1; out.push(u);
      const l = reverse ? adj[u].slice().reverse() : adj[u];
      l.forEach(function (v) { if (!mark[v]) st.push(v); });
    }
    return out;
  }

  // ======================= 播放：第 k 步的狀態 =======================
  /** 起始狀態（第 0 步）。status：0 還沒拜訪、1 在堆疊／佇列裡、2 已經離開（DFS 退回、BFS 取出） */
  function initState(tr, V) {
    const st = { algo: tr.algo, k: 0, status: new Uint8Array(V), num: new Int32Array(V), visited: 1, pops: 0, checks: 0, maxLen: 1,
      foundAt: -1, path: null, cur: tr.s, last: null };
    st.status[tr.s] = 1; st.num[tr.s] = 1;
    if (tr.algo === 'dfs') st.stack = [tr.s];
    else { st.queue = [tr.s]; st.head = 0; st.dist = new Int32Array(V).fill(-1); st.dist[tr.s] = 0; st.parent = new Int32Array(V).fill(-1); st.depth = 0; st.cur = -1; }
    if (tr.found === 0) { st.foundAt = 0; st.path = [tr.s]; }
    return st;
  }
  /** 往前走一步（第 st.k 步）；傳回狀態改變的格子 */
  function applyStep(st, tr) {
    const sp = tr.steps[st.k];
    if (!sp) return [];
    st.k++;
    st.last = sp;
    st.checks += sp.chk;
    if (sp.op === 'push') {
      st.status[sp.v] = 1; st.num[sp.v] = ++st.visited; st.stack.push(sp.v); st.cur = sp.v;
      if (st.stack.length > st.maxLen) st.maxLen = st.stack.length;
      if (sp.v === tr.t && st.foundAt < 0) { st.foundAt = st.k; st.path = st.stack.slice(); }
      return [sp.u, sp.v];
    }
    if (sp.op === 'pop') {
      st.status[sp.u] = 2; st.stack.pop(); st.pops++; st.cur = st.stack.length ? st.stack[st.stack.length - 1] : -1;
      return [sp.u];
    }
    // deq
    const u = st.queue[st.head++];
    st.status[u] = 2; st.cur = u;
    sp.add.forEach(function (v) {
      st.status[v] = 1; st.num[v] = ++st.visited; st.dist[v] = st.dist[u] + 1; st.parent[v] = u; st.queue.push(v);
      if (st.dist[v] > st.depth) st.depth = st.dist[v];
    });
    if (st.queue.length - st.head > st.maxLen) st.maxLen = st.queue.length - st.head;
    if (st.foundAt < 0 && tr.t >= 0 && st.num[tr.t]) {
      st.foundAt = st.k;
      const p = []; for (let v = tr.t; v >= 0; v = st.parent[v]) p.push(v);
      st.path = p.reverse();
    }
    return [u].concat(sp.add);
  }
  function stateAt(tr, V, k) {
    const st = initState(tr, V);
    const K = Math.min(k, tr.steps.length);
    while (st.k < K) applyStep(st, tr);
    return st;
  }
  /** 目前在堆疊或佇列裡的格子（DFS 由底到頂；BFS 由前到後） */
  function frontier(st) { return st.algo === 'dfs' ? st.stack : st.queue.slice(st.head); }

  // ======================= 圖的分析 =======================
  /** 連通塊：comp[i] = 第幾塊（0, 1, …），sizes = 每塊的點數 */
  function components(adj) {
    const V = adj.length, comp = new Int32Array(V).fill(-1), sizes = [];
    for (let s = 0; s < V; s++) {
      if (comp[s] >= 0) continue;
      const id = sizes.length, q = [s];
      comp[s] = id;
      for (let h = 0; h < q.length; h++) adj[q[h]].forEach(function (v) { if (comp[v] < 0) { comp[v] = id; q.push(v); } });
      sizes.push(q.length);
    }
    return { comp: comp, sizes: sizes, count: sizes.length };
  }
  function bfsDist(adj, s) {
    const d = new Int32Array(adj.length).fill(-1), q = [s];
    d[s] = 0;
    for (let h = 0; h < q.length; h++) { const u = q[h]; adj[u].forEach(function (v) { if (d[v] < 0) { d[v] = d[u] + 1; q.push(v); } }); }
    return d;
  }
  function maxOf(d) { let m = 0, at = 0; for (let i = 0; i < d.length; i++) if (d[i] > m) { m = d[i]; at = i; } return { m: m, at: at }; }
  /** 單環圖（連通、邊數 = 點數）上那個環的點：一直拔掉度數 1 的點，剩下的就是環 */
  function cycleCells(adj) {
    const V = adj.length, deg = new Int32Array(V), gone = new Uint8Array(V), q = [];
    for (let i = 0; i < V; i++) { deg[i] = adj[i].length; if (deg[i] <= 1) q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      if (gone[u]) continue;
      gone[u] = 1;
      adj[u].forEach(function (v) { if (!gone[v]) { deg[v]--; if (deg[v] === 1) q.push(v); } });
    }
    const out = [];
    for (let i = 0; i < V; i++) if (!gone[i]) out.push(i);
    return out;
  }
  /** 樹的直徑與半徑（兩次 BFS）；ecc(s) = 半徑 ⟺ s 是樹的中心（Jordan 1869：中心是一個點或相鄰的兩個點） */
  function treeCenterInfo(adj, s) {
    const a = maxOf(bfsDist(adj, s));
    const b = maxOf(bfsDist(adj, a.at));
    const diam = b.m, radius = Math.ceil(diam / 2);
    return { diam: diam, radius: radius, ecc: a.m, isCenter: a.m === radius };
  }
  /** 把一棵樹（或任何圖）上所有點的離心率算出來，傳回中心（離心率最小的點） */
  function centers(adj) {
    let best = Infinity, out = [];
    for (let i = 0; i < adj.length; i++) {
      const e = maxOf(bfsDist(adj, i)).m;
      if (e < best) { best = e; out = [i]; } else if (e === best) out.push(i);
    }
    return { radius: best, cells: out };
  }
  function sameArr(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
  function treeDepth(parent, order) {
    const dep = {}; let m = 0;
    order.forEach(function (v) { const p = parent[v]; dep[v] = p < 0 ? 0 : dep[p] + 1; if (dep[v] > m) m = dep[v]; });
    return m;
  }

  /**
   * 迷宮跑完後的整理（頁面送任務事件、任務證明腳本都用它，兩邊一定相同）。
   * info：{ gen, seed, loops, edits（手畫改了幾面牆）, s, t, early, order }
   */
  function mazeReport(m, info, trD, trB) {
    const n = m.n, N = n * n, adj = mazeAdj(m, 'NESW');
    const E = countOpen(m), cc = components(adj), comp = cc.comp;
    const reach = cc.sizes[comp[info.s]];
    const connected = cc.count === 1;
    const isTree = connected && E === N - 1;
    const cycles = E - N + cc.count;
    let onCycle = false;
    if (connected && cycles === 1) { const cyc = cycleCells(adj); onCycle = cyc.indexOf(info.s) >= 0 && cyc.indexOf(info.t) >= 0; }
    let branch = 0;
    for (let i = 0; i < N; i++) if (comp[i] === comp[info.s] && adj[i].length >= 3) branch++;
    const ci = isTree ? treeCenterInfo(adj, info.s) : null;
    const dS = trD.stats, bS = trB.stats;
    let adjST = false;
    for (let d = 0; d < 4; d++) if (nb(m, info.s, d) === info.t && isOpen(m, info.s, d)) adjST = true;
    const fullD = !info.early || trD.found < 0, fullB = !info.early || trB.found < 0;
    return {
      mode: 'maze', n: n, cells: N, gen: info.gen, seed: info.seed, loops: info.loops, edits: info.edits, order: info.order, early: !!info.early,
      s: info.s, t: info.t, adjST: adjST, E: E, walls: 2 * n * (n - 1) - E, comps: cc.count, connected: connected, isTree: isTree, cycles: cycles, onCycle: onCycle,
      reach: reach, branch: branch, found: trD.found >= 0,
      radius: ci ? ci.radius : null, ecc: ci ? ci.ecc : null, isCenter: !!(ci && ci.isCenter),
      sameOrder: fullD && fullB && sameArr(trD.order, trB.order),
      sig: mazeSig(m),
      dfs: { visited: dS.visited, steps: dS.steps, pops: dS.pops, popsBefore: dS.popsBefore, maxStack: dS.maxLen, path: dS.path, checks: dS.checks, foundStep: trD.found },
      bfs: { visited: bS.visited, steps: bS.steps, maxQueue: bS.maxLen, path: bS.path, checks: bS.checks, depth: bS.depth, foundStep: trB.found }
    };
  }
  /** 一般圖跑完後的整理。info：{ preset, s, rev, edits } */
  function graphReport(g, info, trD, trB) {
    const adj = graphAdj(g, false), V = g.V, E = graphEdges(g), cc = components(adj);
    const reach = cc.sizes[cc.comp[info.s]];
    // 每個連通塊的點是不是一段連續的字母（鄰接矩陣排成對角線上的方塊）
    const lo = [], hi = [];
    for (let i = 0; i < V; i++) { const c = cc.comp[i]; if (lo[c] === undefined) lo[c] = i; hi[c] = i; }
    let blockDiag = true;
    cc.sizes.forEach(function (sz, c) { if (hi[c] - lo[c] + 1 !== sz) blockDiag = false; });
    let sameTree = true;
    trD.order.forEach(function (v) { if (trD.parent[v] !== trB.parent[v]) sameTree = false; });
    if (trD.order.length !== trB.order.length) sameTree = false;
    let ring = cc.count === 1 && E === V;
    if (ring) for (let i = 0; i < V; i++) if (adj[i].length !== 2) ring = false;
    const letters = function (o) { return o.map(function (v) { return g.names[v]; }).join(''); };
    return {
      mode: 'graph', preset: info.preset, V: V, E: E, s: info.s, rev: !!info.rev, edits: info.edits,
      comps: cc.count, sizes: cc.sizes.slice(), connected: cc.count === 1, reach: reach, blockDiag: blockDiag,
      isTree: cc.count === 1 && E === V - 1, complete: E === V * (V - 1) / 2, ring: ring,
      orderD: letters(trD.order), orderB: letters(trB.order), sameOrder: sameArr(trD.order, trB.order), sameTree: sameTree,
      depthD: treeDepth(trD.parent, trD.order), depthB: trB.stats.depth, maxStack: trD.stats.maxLen, maxQueue: trB.stats.maxLen,
      sig: graphSig(g)
    };
  }

  const api = {
    DIRS: DIRS, OPP: OPP, ORDERS: ORDERS, ORDER_KEYS: ORDER_KEYS, NAMES: NAMES, SAMPLE_EDGES: SAMPLE_EDGES,
    rng: rng, blankMaze: blankMaze, cloneMaze: cloneMaze, nb: nb, isOpen: isOpen, setOpen: setOpen, internalWalls: internalWalls,
    countOpen: countOpen, generate: generate, mazeAdj: mazeAdj, mazeSig: mazeSig,
    blankGraph: blankGraph, setEdge: setEdge, hasEdge: hasEdge, sampleGraph: sampleGraph, randomGraph: randomGraph, cloneGraph: cloneGraph,
    graphAdj: graphAdj, graphEdges: graphEdges, graphSig: graphSig,
    dfsTrace: dfsTrace, bfsTrace: bfsTrace, dfsRecursiveOrder: dfsRecursiveOrder, dfsPushAllOrder: dfsPushAllOrder,
    initState: initState, applyStep: applyStep, stateAt: stateAt, frontier: frontier,
    components: components, bfsDist: bfsDist, cycleCells: cycleCells, treeCenterInfo: treeCenterInfo, centers: centers, treeDepth: treeDepth,
    mazeReport: mazeReport, graphReport: graphReport
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GraphTraversalCore = api;
})(typeof self !== 'undefined' ? self : this);
