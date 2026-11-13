// 以 Node 執行：node tests/graph-traversal-core.test.js
'use strict';
const assert = require('assert');
const G = require('../js/graph-traversal-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const rnd = G.rng(20261113);
const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = a => a[Math.floor(rnd() * a.length)];

/** 暴力：列舉 s 出發的所有簡單路徑，傳回到每一格的路徑條數與最短長度（只用在小迷宮） */
function allSimplePaths(adj, s) {
  const V = adj.length, cnt = new Array(V).fill(0), best = new Array(V).fill(Infinity), on = new Uint8Array(V);
  (function go(u, len) {
    on[u] = 1; cnt[u]++; if (len < best[u]) best[u] = len;
    adj[u].forEach(v => { if (!on[v]) go(v, len + 1); });
    on[u] = 0;
  })(s, 0);
  return { cnt, best };
}
/** 和 BFS 無關的最短距離：一直鬆弛每一條通道到不再改變（Bellman–Ford，權重都是 1） */
function relaxDist(adj, s) {
  const d = new Array(adj.length).fill(Infinity); d[s] = 0;
  let changed = true;
  while (changed) { changed = false; adj.forEach((l, u) => l.forEach(v => { if (d[u] + 1 < d[v]) { d[v] = d[u] + 1; changed = true; } })); }
  return d;
}
function isPath(m, cells) {
  for (let i = 1; i < cells.length; i++) {
    const a = cells[i - 1], b = cells[i];
    const d = [0, 1, 2, 3].find(k => G.nb(m, a, k) === b);
    if (d === undefined || !G.isOpen(m, a, d)) return false;
  }
  return true;
}
function randomMaze() {
  const n = ri(2, 18), gen = pick(['dfs', 'prim', 'open']), loops = pick([0, 0, 5, 15, 40]);
  const m = G.generate(n, gen, ri(1, 999), loops);
  // 偶爾隨機砌幾面牆（可能變得不連通）
  if (rnd() < 0.3) for (let k = 0; k < ri(1, n * 2); k++) G.setOpen(m, ri(0, n * n - 1), ri(0, 3), false);
  return m;
}

console.log('迷宮產生器');
test('隨機 DFS 與隨機 Prim：n = 2–40、每種 30 個種子，都是生成樹（全部連通、通道數 = 格子數 − 1）', () => {
  for (const gen of ['dfs', 'prim']) for (let n = 2; n <= 40; n++) for (let seed = 1; seed <= 30; seed++) {
    if (n > 20 && seed > 6) break;
    const m = G.generate(n, gen, seed, 0), adj = G.mazeAdj(m, 'NESW');
    const cc = G.components(adj);
    assert.strictEqual(cc.count, 1, `${gen} n=${n} 種子 ${seed} 不連通`);
    assert.strictEqual(G.countOpen(m), n * n - 1, `${gen} n=${n} 種子 ${seed} 的通道數 ${G.countOpen(m)} ≠ ${n * n - 1}`);
  }
});
test('任兩格之間恰好一條路（n = 2–5 的生成樹，暴力列舉所有簡單路徑）', () => {
  for (const gen of ['dfs', 'prim']) for (let n = 2; n <= 5; n++) for (let seed = 1; seed <= 8; seed++) {
    const m = G.generate(n, gen, seed, 0), adj = G.mazeAdj(m, 'NESW');
    for (let s = 0; s < n * n; s++) {
      const r = allSimplePaths(adj, s);
      r.cnt.forEach((c, v) => assert.strictEqual(c, 1, `${gen} n=${n} ${s}→${v} 有 ${c} 條路`));
    }
  }
});
test('同一組 (n, 方式, 編號) 每次都一樣；換編號就不一樣；外框永遠是牆、每面牆兩側記錄一致', () => {
  for (const gen of ['dfs', 'prim', 'open']) {
    const a = G.generate(12, gen, 7, 10), b = G.generate(12, gen, 7, 10);
    assert.strictEqual(G.mazeSig(a), G.mazeSig(b));
    if (gen !== 'open') assert.notStrictEqual(G.mazeSig(a), G.mazeSig(G.generate(12, gen, 8, 10)));
  }
  for (let k = 0; k < 200; k++) {
    const m = randomMaze(), n = m.n;
    for (let i = 0; i < n * n; i++) for (let d = 0; d < 4; d++) {
      const j = G.nb(m, i, d);
      if (j < 0) assert.ok(!G.isOpen(m, i, d), '外框被打通');
      else assert.strictEqual(G.isOpen(m, i, d), G.isOpen(m, j, G.OPP[d]), '牆的兩側不一致');
    }
  }
});
test('「打通牆」：拿掉的牆數 = round(剩下內牆數 × 百分比)，獨立迴路數 = 拿掉的牆數；百分比越大，拿掉的牆包含百分比小時的牆', () => {
  for (const gen of ['dfs', 'prim']) for (let n = 3; n <= 25; n += 2) {
    const W = (n - 1) * (n - 1);
    let prev = G.generate(n, gen, 3, 0);
    for (let p = 0; p <= 40; p += 1) {
      const m = G.generate(n, gen, 3, p);
      const E = G.countOpen(m);
      assert.strictEqual(E - (n * n - 1), Math.round(W * p / 100), `n=${n} ${p}%`);
      const adj = G.mazeAdj(m, 'NESW'), cc = G.components(adj);
      assert.strictEqual(E - n * n + cc.count, Math.round(W * p / 100), '迴路數');
      for (let i = 0; i < n * n; i++) assert.strictEqual(prev.open[i] & m.open[i], prev.open[i], '小百分比打通的牆，大百分比也要打通');
      prev = m;
    }
  }
});
test('「空地」：所有內牆都打通，通道數 = 2n(n − 1)', () => {
  for (let n = 2; n <= 40; n++) assert.strictEqual(G.countOpen(G.generate(n, 'open', 1, 0)), 2 * n * (n - 1));
});

console.log('DFS 的寫法與拜訪順序');
test('本頁的 DFS（遞迴改寫成明確堆疊）拜訪順序 = 遞迴版 = 「彈出後把鄰居倒過來推進堆疊」版（8 種鄰居順序、600 個迷宮）', () => {
  for (let k = 0; k < 600; k++) {
    const m = randomMaze(), order = pick(G.ORDER_KEYS), adj = G.mazeAdj(m, order), s = ri(0, m.n * m.n - 1);
    const a = G.dfsTrace(adj, s, -1, false).order;
    assert.deepStrictEqual(a, G.dfsRecursiveOrder(adj, s));
    assert.deepStrictEqual(a, G.dfsPushAllOrder(adj, s, true));
  }
});
test('照原順序把鄰居推進堆疊（不倒過來）＝ 鄰居順序反過來的遞迴版；在空地上和本頁的順序不同', () => {
  for (let k = 0; k < 300; k++) {
    const m = randomMaze(), adj = G.mazeAdj(m, pick(G.ORDER_KEYS)), s = ri(0, m.n * m.n - 1);
    const rev = adj.map(l => l.slice().reverse());
    assert.deepStrictEqual(G.dfsPushAllOrder(adj, s, false), G.dfsRecursiveOrder(rev, s));
  }
  const m = G.generate(4, 'open', 1, 0), adj = G.mazeAdj(m, 'NESW');
  assert.notDeepStrictEqual(G.dfsPushAllOrder(adj, 0, false), G.dfsTrace(adj, 0, -1, false).order);
});
test('每一步的堆疊都是「從起點到頂端那一格」的一條路；推進的格子都還沒拜訪過', () => {
  for (let k = 0; k < 200; k++) {
    const m = randomMaze(), adj = G.mazeAdj(m, pick(G.ORDER_KEYS)), s = ri(0, m.n * m.n - 1);
    const tr = G.dfsTrace(adj, s, -1, false), st = G.initState(tr, adj.length);
    while (st.k < tr.steps.length) {
      const sp = tr.steps[st.k];
      if (sp.op === 'push') { assert.strictEqual(st.status[sp.v], 0, '推進已拜訪的格子'); assert.strictEqual(sp.u, st.stack[st.stack.length - 1]); }
      G.applyStep(st, tr);
      assert.strictEqual(st.stack[0] === s || st.stack.length === 0, true);
      assert.ok(isPath(m, st.stack), '堆疊不是一條路');
    }
    assert.strictEqual(st.stack.length, 0, '完整走訪後堆疊應該是空的');
  }
});

console.log('完整走訪：每個走得到的格子恰好拜訪一次');
test('DFS、BFS 拜訪的格子 = 起點所在的連通塊，沒有重複；步數、檢查鄰居的次數符合公式（1000 個迷宮）', () => {
  for (let k = 0; k < 1000; k++) {
    const m = randomMaze(), adj = G.mazeAdj(m, pick(G.ORDER_KEYS)), s = ri(0, m.n * m.n - 1);
    const cc = G.components(adj), comp = [];
    for (let i = 0; i < adj.length; i++) if (cc.comp[i] === cc.comp[s]) comp.push(i);
    const E2 = comp.reduce((a, i) => a + adj[i].length, 0);   // 2E′
    for (const tr of [G.dfsTrace(adj, s, -1, false), G.bfsTrace(adj, s, -1, false)]) {
      assert.strictEqual(new Set(tr.order).size, tr.order.length, tr.algo + ' 重複拜訪');
      assert.deepStrictEqual(tr.order.slice().sort((a, b) => a - b), comp, tr.algo + ' 沒有拜訪到整個連通塊');
      assert.strictEqual(tr.stats.checks, E2, tr.algo + ' 檢查鄰居 ≠ 2E′');
      assert.strictEqual(tr.stats.steps, tr.algo === 'dfs' ? 2 * comp.length - 1 : comp.length, tr.algo + ' 步數');
    }
  }
});

console.log('BFS 的距離與最短路');
test('BFS 距離 = 暴力列舉所有簡單路徑的最短長度（n ≤ 5，含迴路與不連通）', () => {
  for (let k = 0; k < 300; k++) {
    const n = ri(2, 5), m = G.generate(n, pick(['dfs', 'prim', 'open']), ri(1, 99), pick([0, 20, 60, 100]));
    if (rnd() < 0.3) G.setOpen(m, ri(0, n * n - 1), ri(0, 3), false);
    const adj = G.mazeAdj(m, pick(G.ORDER_KEYS)), s = ri(0, n * n - 1);
    const b = G.bfsTrace(adj, s, -1, false), brute = allSimplePaths(adj, s).best;
    brute.forEach((x, v) => assert.strictEqual(b.dist[v], x === Infinity ? -1 : x, `n=${n} ${s}→${v}`));
  }
});
test('BFS 距離 = 和 BFS 無關的鬆弛法（2000 個大小不一的迷宮）；找到的路是一條合法的最短路', () => {
  for (let k = 0; k < 2000; k++) {
    const m = randomMaze(), N = m.n * m.n, adj = G.mazeAdj(m, pick(G.ORDER_KEYS)), s = ri(0, N - 1), t = ri(0, N - 1);
    const d = relaxDist(adj, s), b = G.bfsTrace(adj, s, t, rnd() < 0.5);
    if (!b.early) d.forEach((x, v) => assert.strictEqual(b.dist[v], x === Infinity ? -1 : x));
    if (d[t] === Infinity) { assert.strictEqual(b.found, -1); continue; }
    assert.strictEqual(b.stats.path, d[t]);
    assert.ok(isPath(m, b.stats.pathCells) && b.stats.pathCells[0] === s && b.stats.pathCells[b.stats.pathCells.length - 1] === t);
  }
});
test('BFS 的佇列：距離由小到大，任何時候佇列裡最多兩種距離（相差 1）', () => {
  for (let k = 0; k < 300; k++) {
    const m = randomMaze(), adj = G.mazeAdj(m, pick(G.ORDER_KEYS)), s = ri(0, m.n * m.n - 1);
    const tr = G.bfsTrace(adj, s, -1, false), st = G.initState(tr, adj.length);
    while (st.k < tr.steps.length) {
      G.applyStep(st, tr);
      const q = G.frontier(st).map(v => st.dist[v]);
      for (let i = 1; i < q.length; i++) assert.ok(q[i] >= q[i - 1]);
      if (q.length) assert.ok(q[q.length - 1] - q[0] <= 1);
    }
  }
});

console.log('DFS 找到的路');
test('DFS 找到終點時堆疊就是找到的路；生成樹迷宮裡 DFS 的路 = BFS 的路（任兩格只有一條路）', () => {
  for (let k = 0; k < 800; k++) {
    const n = ri(2, 20), tree = rnd() < 0.5;
    const m = G.generate(n, pick(['dfs', 'prim']), ri(1, 999), tree ? 0 : pick([5, 20, 50]));
    const adj = G.mazeAdj(m, pick(G.ORDER_KEYS)), s = ri(0, n * n - 1), t = ri(0, n * n - 1);
    const dT = G.dfsTrace(adj, s, t, true), bT = G.bfsTrace(adj, s, t, true);
    assert.ok(isPath(m, dT.stats.pathCells) && dT.stats.pathCells[0] === s && dT.stats.pathCells[dT.stats.pathCells.length - 1] === t);
    if (s !== t) assert.strictEqual(dT.steps[dT.steps.length - 1].v, t, 'DFS 應該在推進終點的那一步停');
    assert.ok(dT.stats.path >= bT.stats.path, 'DFS 的路不可能比最短路短');
    if (tree) assert.deepStrictEqual(dT.stats.pathCells, bT.stats.pathCells);
  }
});
test('方格是二部圖：同一對格子之間每一條路的長度奇偶相同，所以 DFS 的路 − BFS 的路一定是偶數', () => {
  for (let k = 0; k < 1500; k++) {
    const m = randomMaze(), N = m.n * m.n, adj = G.mazeAdj(m, pick(G.ORDER_KEYS)), s = ri(0, N - 1), t = ri(0, N - 1);
    const dT = G.dfsTrace(adj, s, t, true), bT = G.bfsTrace(adj, s, t, true);
    if (dT.found < 0) { assert.strictEqual(bT.found, -1); continue; }
    assert.strictEqual((dT.stats.path - bT.stats.path) % 2, 0);
    const dr = Math.abs(((s / m.n) | 0) - ((t / m.n) | 0)), dc = Math.abs(s % m.n - t % m.n);
    assert.strictEqual((bT.stats.path - dr - dc) % 2, 0, '路長和曼哈頓距離同奇偶');
  }
});
test('「找到終點就停」：BFS 在終點被排進佇列的那一步停；空地上 BFS 的路長 = 曼哈頓距離', () => {
  for (let k = 0; k < 400; k++) {
    const n = ri(2, 20), m = G.generate(n, 'open', 1, 0), adj = G.mazeAdj(m, pick(G.ORDER_KEYS)), s = ri(0, n * n - 1), t = ri(0, n * n - 1);
    const b = G.bfsTrace(adj, s, t, true);
    if (s !== t) assert.ok(b.steps[b.steps.length - 1].add.indexOf(t) >= 0);
    assert.strictEqual(b.stats.path, Math.abs(((s / n) | 0) - ((t / n) | 0)) + Math.abs(s % n - t % n));
  }
});

console.log('播放（第 k 步的狀態）');
test('一步一步往前 = 從頭重播 k 步；最後的讀數 = 步驟記錄的統計', () => {
  for (let k = 0; k < 150; k++) {
    const m = randomMaze(), N = m.n * m.n, adj = G.mazeAdj(m, pick(G.ORDER_KEYS)), s = ri(0, N - 1), t = ri(0, N - 1), early = rnd() < 0.6;
    for (const tr of [G.dfsTrace(adj, s, t, early), G.bfsTrace(adj, s, t, early)]) {
      const st = G.initState(tr, N);
      let maxSeen = 1;
      while (st.k < tr.steps.length) {
        G.applyStep(st, tr);
        maxSeen = Math.max(maxSeen, G.frontier(st).length);
        if (rnd() < 0.05) {
          const re = G.stateAt(tr, N, st.k);
          assert.deepStrictEqual(Array.from(re.status), Array.from(st.status));
          assert.deepStrictEqual(G.frontier(re), G.frontier(st));
        }
      }
      assert.strictEqual(st.visited, tr.stats.visited);
      assert.strictEqual(st.checks, tr.stats.checks);
      assert.strictEqual(st.maxLen, tr.stats.maxLen);
      assert.strictEqual(maxSeen, tr.stats.maxLen);
      assert.strictEqual(st.foundAt, tr.found);
      if (tr.found >= 0) assert.strictEqual(st.path.length - 1, tr.stats.path);
      if (tr.algo === 'dfs') assert.strictEqual(st.pops, tr.stats.pops);
    }
  }
});

console.log('樹、迴路與中心');
test('樹的中心（Jordan 1869）：中心是一格或相鄰的兩格；兩次 BFS 判斷的中心 = 暴力算每一格的離心率', () => {
  for (let k = 0; k < 120; k++) {
    const n = ri(2, 12), m = G.generate(n, pick(['dfs', 'prim']), ri(1, 999), 0), adj = G.mazeAdj(m, 'NESW');
    const c = G.centers(adj);
    assert.ok(c.cells.length === 1 || c.cells.length === 2);
    if (c.cells.length === 2) assert.ok(adj[c.cells[0]].indexOf(c.cells[1]) >= 0, '兩個中心要相鄰');
    for (let s = 0; s < n * n; s++) {
      const ci = G.treeCenterInfo(adj, s);
      assert.strictEqual(ci.isCenter, c.cells.indexOf(s) >= 0);
      assert.strictEqual(ci.radius, c.radius);
    }
  }
});
test('單環迷宮：從生成樹拿掉一面牆就剛好多一個環；找出的環上每一格在環上都恰好有兩個鄰居', () => {
  for (let k = 0; k < 300; k++) {
    const n = ri(3, 15), m = G.generate(n, pick(['dfs', 'prim']), ri(1, 999), 0);
    const w = pick(G.internalWalls(m));
    G.setOpen(m, w[0], w[1], true);
    const adj = G.mazeAdj(m, 'NESW'), cyc = G.cycleCells(adj), set = new Set(cyc);
    assert.ok(cyc.length >= 4 && cyc.length % 2 === 0, '方格裡的環長度是偶數、至少 4');
    cyc.forEach(v => assert.strictEqual(adj[v].filter(x => set.has(x)).length, 2));
    assert.ok(set.has(w[0]) && set.has(G.nb(m, w[0], w[1])), '打通的那面牆兩側都在環上');
  }
});
test('梳子形的迷宮（齒在前、脊在後）：完整走訪時 DFS 與 BFS 的拜訪順序完全相同；一般的生成樹迷宮則不同', () => {
  // 8 × 8：第 2 列是往右的脊，第 1、3 列是一格長的齒；鄰居順序「上左下右」讓齒先於下一節脊
  const n = 8, m = G.blankMaze(n);
  for (let c = 0; c < n; c++) { const sp = n + c; G.setOpen(m, sp, 0, true); G.setOpen(m, sp, 2, true); if (c < n - 1) G.setOpen(m, sp, 1, true); }
  const adj = G.mazeAdj(m, 'NWSE');
  const d = G.dfsTrace(adj, n, -1, false), b = G.bfsTrace(adj, n, -1, false);
  assert.strictEqual(d.order.length, 24);
  assert.deepStrictEqual(d.order, b.order);
  const t = G.generate(12, 'dfs', 1, 0), ta = G.mazeAdj(t, 'NESW');
  assert.notDeepStrictEqual(G.dfsTrace(ta, 0, -1, false).order, G.bfsTrace(ta, 0, -1, false).order);
});

console.log('一般圖');
test('範例圖：8 點 11 邊；從 A 出發 DFS = A B C F E G D H、BFS = A B D E C G F H（字母順序）', () => {
  const g = G.sampleGraph(), adj = G.graphAdj(g, false);
  assert.strictEqual(G.graphEdges(g), 11);
  const name = o => o.map(v => g.names[v]).join('');
  assert.strictEqual(name(G.dfsTrace(adj, 0, -1, false).order), 'ABCFEGDH');
  assert.strictEqual(name(G.bfsTrace(adj, 0, -1, false).order), 'ABDECGFH');
  for (let i = 0; i < g.V; i++) for (let j = 0; j < g.V; j++) assert.strictEqual(G.hasEdge(g, i, j), G.hasEdge(g, j, i), '鄰接矩陣要對稱');
  const rev = G.graphAdj(g, true);
  assert.deepStrictEqual(rev[0], adj[0].slice().reverse());
});
test('隨機圖：連通、邊數 = V − 1 + ⌊V/2⌋（一定有迴路）、同一個編號每次都一樣', () => {
  for (let V = 5; V <= 10; V++) for (let seed = 1; seed <= 40; seed++) {
    const g = G.randomGraph(V, seed), adj = G.graphAdj(g, false);
    assert.strictEqual(G.components(adj).count, 1);
    assert.strictEqual(G.graphEdges(g), V - 1 + Math.floor(V / 2));
    assert.strictEqual(G.graphSig(g), G.graphSig(G.randomGraph(V, seed)));
  }
});
test('定理：從同一點出發，DFS 樹和 BFS 樹一模一樣 ⟹ 這張圖本身就是那棵樹（隨機 20000 張小圖驗證，兩種鄰居順序）', () => {
  let same = 0;
  for (let k = 0; k < 20000; k++) {
    const V = ri(2, 8), g = G.blankGraph(V), p = rnd() * 0.7;
    for (let i = 0; i < V; i++) for (let j = i + 1; j < V; j++) if (rnd() < p) G.setEdge(g, i, j, true);
    const adj = G.graphAdj(g, rnd() < 0.5), s = ri(0, V - 1);
    const d = G.dfsTrace(adj, s, -1, false), b = G.bfsTrace(adj, s, -1, false);
    const rp = G.graphReport(g, { preset: 'x', s: s, rev: false, edits: 0 }, d, b);
    if (rp.sameTree) {
      same++;
      // 起點那一塊的邊數 = 那一塊的點數 − 1（沒有樹以外的邊）
      const comp = new Set(d.order);
      let e = 0; comp.forEach(i => comp.forEach(j => { if (i < j && G.hasEdge(g, i, j)) e++; }));
      assert.strictEqual(e, comp.size - 1);
    }
  }
  assert.ok(same > 1000, '樣本裡兩棵樹相同的情況太少：' + same);
});
test('完全圖：DFS 樹是一條長鏈（深度 V − 1），BFS 樹是一顆星（深度 1）', () => {
  for (let V = 2; V <= 10; V++) {
    const g = G.blankGraph(V);
    for (let i = 0; i < V; i++) for (let j = i + 1; j < V; j++) G.setEdge(g, i, j, true);
    const adj = G.graphAdj(g, false), d = G.dfsTrace(adj, 0, -1, false), b = G.bfsTrace(adj, 0, -1, false);
    const rp = G.graphReport(g, { preset: 'x', s: 0, rev: false, edits: 0 }, d, b);
    assert.ok(rp.complete);
    assert.strictEqual(rp.depthD, V - 1);
    assert.strictEqual(rp.depthB, 1);
    assert.strictEqual(rp.maxStack, V);
  }
});
test('連通塊與鄰接矩陣的方塊：兩塊各是一段連續字母時 blockDiag = true，交錯時 false', () => {
  const g = G.blankGraph(8);
  [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [6, 7]].forEach(e => G.setEdge(g, e[0], e[1], true));
  const adj = G.graphAdj(g, false), d = G.dfsTrace(adj, 0, -1, false), b = G.bfsTrace(adj, 0, -1, false);
  let rp = G.graphReport(g, { preset: 'x', s: 0, edits: 0 }, d, b);
  assert.ok(rp.blockDiag && rp.comps === 2 && rp.reach === 4);
  const h = G.blankGraph(8);
  [[0, 2], [2, 4], [4, 6], [1, 3], [3, 5], [5, 7]].forEach(e => G.setEdge(h, e[0], e[1], true));
  const ha = G.graphAdj(h, false);
  rp = G.graphReport(h, { preset: 'x', s: 0, edits: 0 }, G.dfsTrace(ha, 0, -1, false), G.bfsTrace(ha, 0, -1, false));
  assert.ok(!rp.blockDiag && rp.comps === 2);
});

console.log('任務用的整理（mazeReport）');
test('預設迷宮（12 × 12、隨機 DFS、第 1 號、左上到右下）：是樹、DFS 與 BFS 的路一樣長；報告和直接計算一致', () => {
  const n = 12, m = G.generate(n, 'dfs', 1, 0), adj = G.mazeAdj(m, 'NESW');
  const d = G.dfsTrace(adj, 0, n * n - 1, true), b = G.bfsTrace(adj, 0, n * n - 1, true);
  const rp = G.mazeReport(m, { gen: 'dfs', seed: 1, loops: 0, edits: 0, s: 0, t: n * n - 1, early: true, order: 'NESW' }, d, b);
  assert.ok(rp.isTree && rp.connected && rp.cycles === 0 && rp.found);
  assert.strictEqual(rp.dfs.path, rp.bfs.path);
  assert.strictEqual(rp.walls, (n - 1) * (n - 1));
  assert.strictEqual(rp.dfs.visited, d.order.length);
  assert.strictEqual(rp.bfs.visited, b.order.length);
  assert.ok(!rp.sameOrder);
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗！' : '。'));
