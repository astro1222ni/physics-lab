// 以 Node 執行：node tests/shortest-path-core.test.js
'use strict';
const assert = require('assert');
const S = require('../js/shortest-path-core.js');
const INF = Infinity;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const rnd = S.rng(20261112);
const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

/** 隨機改權重（lo–hi）、隨機封閉幾條邊 */
function scramble(g, lo, hi, pClose) {
  g.edges.forEach(e => { e.w = ri(lo, hi); e.closed = rnd() < (pClose || 0); });
  return g;
}
/** 一次執行的通用檢查：距離、前一站、計數上下限 */
function checkTrace(g, tr, truth, label) {
  const V = g.nodes.length, f = tr.final, s = tr.s;
  for (let v = 0; v < V; v++) {
    assert.strictEqual(f.d[v], truth[v], `${label}：點 ${v} 的距離 ${f.d[v]} ≠ 正確值 ${truth[v]}`);
    if (v !== s && f.d[v] < INF) {
      const e = g.edges[f.pe[v]];
      assert.ok(e && !e.closed, `${label}：點 ${v} 的前一站邊不存在`);
      const u = f.prev[v];
      assert.ok((e.a === u && e.b === v) || (!g.directed && e.a === v && e.b === u), `${label}：前一站邊接錯`);
      if (tr.algo !== 'bfs') assert.strictEqual(f.d[u] + e.w, f.d[v], `${label}：d[前一站] + w ≠ d[v]`);
      else assert.strictEqual(f.d[u] + 1, f.d[v]);
      const p = S.pathTo(f.prev, s, v);
      assert.ok(p && p[0] === s && p[p.length - 1] === v, `${label}：路徑沒有從起點到 ${v}`);
      if (tr.algo !== 'bfs') assert.strictEqual(S.pathLength(g, p), f.d[v], `${label}：路徑長度 ≠ d`);
      else assert.strictEqual(p.length - 1, f.d[v]);
    }
  }
}

console.log('大圓距離（半正矢公式）');
test('赤道上經度差 1° = 2πR/360、赤道到北極 = πR/2、對蹠點 = πR', () => {
  assert.ok(Math.abs(S.haversine(0, 0, 0, 1) - 2 * Math.PI * 6371 / 360) < 1e-9);
  assert.ok(Math.abs(S.haversine(0, 30, 90, 0) - Math.PI * 6371 / 2) < 1e-9);
  assert.ok(Math.abs(S.haversine(10, 20, -10, -160) - Math.PI * 6371) < 1e-3);   // 對蹠點附近 asin 的數值誤差較大（約 1e-4 km）
});
test('與球面餘弦定理一致、對稱、同一點為 0（隨機 2000 組）', () => {
  const r = Math.PI / 180;
  for (let i = 0; i < 2000; i++) {
    const a = [rnd() * 160 - 80, rnd() * 360 - 180], b = [rnd() * 160 - 80, rnd() * 360 - 180];
    const h = S.haversine(a[0], a[1], b[0], b[1]);
    const c = 6371 * Math.acos(Math.min(1, Math.max(-1, Math.sin(a[0] * r) * Math.sin(b[0] * r) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r))));
    assert.ok(Math.abs(h - c) < 1e-6, `${h} vs ${c}`);
    assert.ok(Math.abs(h - S.haversine(b[0], b[1], a[0], a[1])) < 1e-9);
  }
  assert.strictEqual(S.haversine(23.5, 121, 23.5, 121), 0);
});

console.log('臺灣地圖');
test('18 個城市、25 條邊；權重 = 大圓距離四捨五入到公里；整張圖連通', () => {
  const g = S.taiwanGraph();
  assert.strictEqual(g.nodes.length, 18);
  assert.strictEqual(g.edges.length, 25);
  g.edges.forEach(e => {
    const a = S.CITIES[e.a], b = S.CITIES[e.b];
    assert.strictEqual(e.w, Math.round(S.haversine(a.lat, a.lon, b.lat, b.lon)));
    assert.ok(e.w > 0 && e.w === e.w0);
  });
  const comp = S.components(g);
  assert.ok(comp.every(c => c === comp[0]));
});
test('已知值：基隆—臺北 24 km、臺東—花蓮 142 km；基隆到屏東最短 336 km（走東部）；直徑 387 km（桃園—恆春）', () => {
  const g = S.taiwanGraph(), C = {};
  S.CITIES.forEach((c, i) => { C[c.key] = i; });
  const w = (a, b) => g.edges.find(e => (e.a === C[a] && e.b === C[b]) || (e.a === C[b] && e.b === C[a])).w;
  assert.strictEqual(w('keelung', 'taipei'), 24);
  assert.strictEqual(w('taitung', 'hualien'), 142);
  const tr = S.dijkstra(g, C.keelung, C.pingtung);
  assert.strictEqual(tr.final.d[C.pingtung], 336);
  assert.deepStrictEqual(S.pathTo(tr.final.prev, C.keelung, C.pingtung), [C.keelung, C.yilan, C.hualien, C.taitung, C.pingtung]);
  const dia = S.diameter(g);
  assert.strictEqual(dia.d, 387);
  assert.deepStrictEqual(dia.pairs, [[C.taoyuan, C.hengchun]]);
});
test('原始權重滿足三角不等式：相鄰兩城的最短路就是那條直達的邊，而且沒有平手', () => {
  const g = S.taiwanGraph(), D = S.floydWarshall(g);
  g.edges.forEach(e => assert.strictEqual(D[e.a][e.b], e.w));
  for (let s = 0; s < 18; s++) {
    const tr = S.dijkstra(g, s, -1);
    S.countPaths(g, s, tr.final.d).forEach(c => assert.strictEqual(c, 1));
  }
});
test('每個起點：Dijkstra、Bellman–Ford 與 Floyd–Warshall 完全相同；BFS 的邊數與「權重全為 1」的 Floyd–Warshall 相同', () => {
  const g = S.taiwanGraph(), D = S.floydWarshall(g);
  const u = S.clone(g); u.edges.forEach(e => { e.w = 1; });
  const H = S.floydWarshall(u);
  for (let s = 0; s < 18; s++) {
    checkTrace(g, S.dijkstra(g, s, -1), D[s], 'Dijkstra 起點 ' + s);
    checkTrace(g, S.bellmanFord(g, s, -1), D[s], 'Bellman–Ford 起點 ' + s);
    checkTrace(g, S.bfs(g, s, -1), H[s], 'BFS 起點 ' + s);
  }
});

console.log('隨機圖與方格（大量隨機測試）');
test('隨機圖的建立：Gabriel 圖一定連通、邊不交叉、權重 1–9、點依 x 由左到右；同一個種子結果相同', () => {
  const cross = (p, q, r, s) => {
    const o = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    return o(p, q, r) * o(p, q, s) < 0 && o(r, s, p) * o(r, s, q) < 0;
  };
  for (let seed = 1; seed <= 300; seed++) {
    const n = 6 + (seed % 11);
    const g = S.randomGraph(n, seed);
    assert.strictEqual(g.nodes.length, n);
    const comp = S.components(g);
    assert.ok(comp.every(c => c === comp[0]), `種子 ${seed} 不連通`);
    for (let i = 1; i < n; i++) assert.ok(g.nodes[i].x >= g.nodes[i - 1].x);
    g.edges.forEach(e => assert.ok(e.w >= 1 && e.w <= 9));
    const N = g.nodes;
    for (let i = 0; i < g.edges.length; i++) for (let j = i + 1; j < g.edges.length; j++) {
      const a = g.edges[i], b = g.edges[j];
      if (a.a === b.a || a.a === b.b || a.b === b.a || a.b === b.b) continue;
      assert.ok(!cross(N[a.a], N[a.b], N[b.a], N[b.b]), `種子 ${seed} 有交叉的邊`);
    }
    assert.strictEqual(S.signature(S.randomGraph(n, seed)), S.signature(g));
  }
});
test('隨機圖 2000 張（權重 0–20、部分封閉）：三種演算法的距離與 Floyd–Warshall 相同，前一站與路徑長度一致', () => {
  for (let k = 0; k < 2000; k++) {
    const g = scramble(S.randomGraph(ri(6, 16), ri(1, 1e6)), 0, 20, 0.12);
    const V = g.nodes.length, D = S.floydWarshall(g), s = ri(0, V - 1);
    const u = S.clone(g); u.edges.forEach(e => { e.w = 1; });
    checkTrace(g, S.dijkstra(g, s, -1), D[s], 'Dijkstra');
    checkTrace(g, S.bellmanFord(g, s, -1), D[s], 'Bellman–Ford');
    checkTrace(g, S.bfs(g, s, -1), S.floydWarshall(u)[s], 'BFS');
  }
});
test('小圖（n ≤ 9）與暴力列舉所有簡單路徑比對：最短距離相同；權重都 > 0 時「最短路有幾條」也相同', () => {
  for (let k = 0; k < 1500; k++) {
    const g = scramble(S.randomGraph(ri(6, 9), ri(1, 1e6)), k % 3 ? 1 : 0, ri(2, 9), 0.1);
    const s = ri(0, g.nodes.length - 1);
    const bf = S.bruteForce(g, s), tr = S.dijkstra(g, s, -1);
    assert.deepStrictEqual(tr.final.d, bf.d);
    const cnt = S.countPaths(g, s, tr.final.d);
    const hasZero = g.edges.some(e => !e.closed && e.w === 0 && tr.final.d[e.a] < INF);
    if (hasZero) assert.strictEqual(cnt, null);
    else assert.deepStrictEqual(cnt, bf.count.map((c, i) => (tr.final.d[i] < INF ? c : 0)));
  }
});
test('方格 600 個（3–6 列 × 3–8 行，權重 0–20、部分封閉）：與 Floyd–Warshall 相同', () => {
  for (let k = 0; k < 600; k++) {
    const g = scramble(S.gridGraph(ri(3, 6), ri(3, 8), ri(1, 1e6)), 0, 20, 0.1);
    const s = ri(0, g.nodes.length - 1), D = S.floydWarshall(g);
    checkTrace(g, S.dijkstra(g, s, -1), D[s], 'Dijkstra');
    checkTrace(g, S.bellmanFord(g, s, -1), D[s], 'Bellman–Ford');
  }
});
test('方格權重全為 1：左上角到右下角的最短路有 C(r + c − 2, r − 1) 條（巴斯卡三角形）', () => {
  const C = (n, k) => { let x = 1; for (let i = 1; i <= k; i++) x = x * (n - k + i) / i; return Math.round(x); };
  for (let r = 2; r <= 6; r++) for (let c = 2; c <= 8; c++) {
    const g = S.gridGraph(r, c, 1); g.edges.forEach(e => { e.w = 1; });
    const tr = S.dijkstra(g, 0, -1);
    assert.strictEqual(S.countPaths(g, 0, tr.final.d)[r * c - 1], C(r + c - 2, r - 1));
    assert.strictEqual(tr.final.d[r * c - 1], r + c - 2);
  }
});

console.log('計數與平手規則');
test('非負權重時 Dijkstra 從不出現「錯過」的步驟；每條（可走到的）邊最多檢查一次；取出 = 可到達的點數；比較 ≤ V(V − 1)/2', () => {
  for (let k = 0; k < 1500; k++) {
    const g = k % 2 ? scramble(S.randomGraph(ri(6, 16), ri(1, 1e6)), 0, 20, 0.15) : scramble(S.gridGraph(ri(3, 6), ri(3, 8), ri(1, 1e6)), 0, 9, 0.1);
    const V = g.nodes.length, s = ri(0, V - 1), tr = S.dijkstra(g, s, -1), f = tr.final;
    const reach = f.d.filter(x => x < INF).length;
    const comp = S.components(g);
    const Ereach = g.edges.filter(e => !e.closed && comp[e.a] === comp[s]).length;
    assert.strictEqual(tr.stats.late, 0);
    assert.strictEqual(tr.stats.pops, reach);
    assert.strictEqual(tr.stats.checks, Ereach);
    assert.ok(tr.stats.relax <= tr.stats.checks && tr.stats.relax >= reach - 1);
    assert.ok(tr.stats.cmp <= V * (V - 1) / 2);
    const seen = new Set();
    tr.steps.forEach(sp => { if (sp.type === 'check') { assert.ok(!seen.has(sp.e)); seen.add(sp.e); } });
  }
});
test('平手規則：權重都 ≥ 1 時，Dijkstra 確定的順序依 (距離, 編號) 由小到大；只有嚴格變小才更新前一站', () => {
  for (let k = 0; k < 1500; k++) {
    const g = scramble(S.gridGraph(ri(3, 6), ri(3, 8), ri(1, 1e6)), 1, 3, 0);
    const s = ri(0, g.nodes.length - 1), tr = S.dijkstra(g, s, -1), d = tr.final.d, o = tr.final.order;
    for (let i = 1; i < o.length; i++) assert.ok(d[o[i - 1]] < d[o[i]] || (d[o[i - 1]] === d[o[i]] && o[i - 1] < o[i]), '順序不對');
    tr.steps.forEach(sp => { if (sp.type === 'check') assert.strictEqual(sp.ok, sp.nd < sp.old); });
    // 前一站 = 第一個讓它達到最終距離的點（確定順序最早的那個）
    for (let v = 0; v < g.nodes.length; v++) {
      if (v === s) continue;
      const cands = S.adjacency(g)[v].filter(a => d[a.v] + a.w === d[v]).map(a => a.v);
      const first = cands.sort((p, q) => o.indexOf(p) - o.indexOf(q))[0];
      assert.strictEqual(tr.final.prev[v], first);
    }
  }
});
test('BFS：先進先出；確定的順序依邊數由小到大；權重全部相等時 Dijkstra 的距離 = BFS 的邊數 × 權重', () => {
  for (let k = 0; k < 800; k++) {
    const g = S.randomGraph(ri(6, 16), ri(1, 1e6)), s = ri(0, g.nodes.length - 1);
    const b = S.bfs(g, s, -1), d = b.final.d, o = b.final.order;
    for (let i = 1; i < o.length; i++) assert.ok(d[o[i - 1]] <= d[o[i]]);
    const c = ri(1, 9), h = S.clone(g); h.edges.forEach(e => { e.w = c; });
    const dj = S.dijkstra(h, s, -1);
    dj.final.d.forEach((x, i) => assert.strictEqual(x, d[i] * c));
  }
});
test('找到終點就停：終點的距離與完整執行相同，取出的點數不會比較多', () => {
  for (let k = 0; k < 800; k++) {
    const g = scramble(S.randomGraph(ri(6, 16), ri(1, 1e6)), 0, 12, 0.1);
    const V = g.nodes.length, s = ri(0, V - 1), t = ri(0, V - 1);
    ['dijkstra', 'bfs'].forEach(al => {
      const full = S.run(g, al, s, t, {}), early = S.run(g, al, s, t, { earlyStop: true });
      assert.strictEqual(early.final.d[t], full.final.d[t]);
      assert.ok(early.stats.pops <= full.stats.pops);
      if (full.final.d[t] < INF) assert.strictEqual(early.final.order[early.final.order.length - 1], t);
    });
  }
});
test('一步一步播放：第 k 步的狀態 = 從頭套用 k 步；最後一步的狀態 = 結果', () => {
  for (let k = 0; k < 120; k++) {
    const g = scramble(S.gridGraph(ri(3, 5), ri(3, 6), ri(1, 1e6)), 0, 9, 0.1);
    const al = ['dijkstra', 'bfs', 'bf'][k % 3], tr = S.run(g, al, 0, g.nodes.length - 1, {});
    let prevChecks = -1;
    for (let i = 0; i <= tr.steps.length; i++) {
      const st = S.stateAt(tr, i);
      assert.strictEqual(st.k, i);
      assert.ok(st.checks >= prevChecks); prevChecks = st.checks;
    }
    assert.deepStrictEqual(S.stateAt(tr, tr.steps.length).d, tr.final.d);
  }
});

console.log('負權重（有向無環圖）');
test('預設權重都是正的：Dijkstra 正確；把 A→B 改成 −5，Dijkstra 在 B 算錯（B 先被確定了），Bellman–Ford 正確', () => {
  const g = S.negGraph();
  const D = S.floydWarshall(g)[0];
  assert.deepStrictEqual(S.dijkstra(g, 0, 5).final.d, D);
  assert.deepStrictEqual(D, [0, 4, 1, 8, 4, 10]);
  g.edges[5].w = -5;   // A→B
  const dj = S.dijkstra(g, 0, 5), bf = S.bellmanFord(g, 0, 5), truth = S.floydWarshall(g)[0];
  assert.deepStrictEqual(bf.final.d, truth);
  assert.strictEqual(truth[2], -1);
  assert.strictEqual(dj.final.d[2], 1);
  assert.ok(dj.stats.late > 0);
});
test('隨機權重 −9…9 共 20000 組：Bellman–Ford = Floyd–Warshall = 暴力列舉；Dijkstra 算錯 ⇔ 出現「錯過」的步驟', () => {
  let wrongRuns = 0;
  for (let k = 0; k < 20000; k++) {
    const g = S.negGraph();
    g.edges.forEach(e => { e.w = ri(-9, 9); });
    const truth = S.floydWarshall(g)[0];
    const bf = S.bellmanFord(g, 0, 5);
    assert.deepStrictEqual(bf.final.d, truth);
    assert.deepStrictEqual(S.bruteForce(g, 0).d, truth);
    checkTrace(g, bf, truth, 'Bellman–Ford');
    const dj = S.dijkstra(g, 0, 5);
    const wrong = dj.final.d.some((x, i) => x !== truth[i]);
    if (wrong) wrongRuns++;
    assert.strictEqual(wrong, dj.stats.late > 0);
    assert.ok(bf.stats.rounds <= 5);
  }
  assert.ok(wrongRuns > 1000 && wrongRuns < 19000, '算錯的比例不合理：' + wrongRuns);
});
test('Bellman–Ford 的輪數：照拓撲順序排邊時 1 輪就更新完；這裡的順序（從終點那頭排起）最多要 V − 1 = 5 輪', () => {
  const g = S.negGraph();
  g.edges.forEach(e => { e.w = 9; });
  [7, 5, 3, 1, 0].forEach(i => { g.edges[i].w = -9; });   // S→A→B→C→D→T 這條鏈最短
  const bf = S.bellmanFord(g, 0, 5);
  assert.strictEqual(bf.stats.updRounds, 5);
  assert.strictEqual(bf.stats.rounds, 5);
  const topo = S.clone(g); topo.edges.reverse();
  const bt = S.bellmanFord(topo, 0, 5);
  assert.strictEqual(bt.stats.updRounds, 1);
  assert.strictEqual(bt.stats.rounds, 2);
  assert.deepStrictEqual(bt.final.d, bf.final.d);
});
test('有向無環圖上「最短路有幾條」與暴力列舉相同（含負權重）', () => {
  for (let k = 0; k < 3000; k++) {
    const g = S.negGraph();
    g.edges.forEach(e => { e.w = ri(-3, 3); });
    const truth = S.floydWarshall(g)[0];
    assert.deepStrictEqual(S.countPaths(g, 0, truth), S.bruteForce(g, 0).count);
  }
});

console.log('其他工具');
test('最小生成樹（Kruskal）的總權重 = Prim 演算法；直徑 = Floyd–Warshall 的最大值', () => {
  for (let k = 0; k < 500; k++) {
    const g = scramble(S.randomGraph(ri(6, 16), ri(1, 1e6)), 1, 20, 0);
    const V = g.nodes.length, adj = S.adjacency(g), inT = [true], key = [0];
    for (let i = 1; i < V; i++) { inT.push(false); key.push(INF); }
    adj[0].forEach(a => { key[a.v] = Math.min(key[a.v], a.w); });
    let total = 0;
    for (let it = 1; it < V; it++) {
      let b = -1;
      for (let i = 0; i < V; i++) if (!inT[i] && (b < 0 || key[i] < key[b])) b = i;
      inT[b] = true; total += key[b];
      adj[b].forEach(a => { if (!inT[a.v]) key[a.v] = Math.min(key[a.v], a.w); });
    }
    const m = S.mst(g);
    assert.strictEqual(m.weight, total);
    assert.strictEqual(m.edges.length, V - 1);
    const D = S.floydWarshall(g);
    let mx = 0; D.forEach(r => r.forEach(x => { if (x < INF) mx = Math.max(mx, x); }));
    assert.strictEqual(S.diameter(g).d, mx);
  }
});
test('封閉的邊：不能走；把圖切開時到不了的點距離是 ∞、沒有路徑', () => {
  const g = S.taiwanGraph(), C = {};
  S.CITIES.forEach((c, i) => { C[c.key] = i; });
  g.edges.forEach(e => {
    const k = [S.CITIES[e.a].key, S.CITIES[e.b].key].sort().join('-');
    if (k === 'miaoli-taichung' || k === 'hualien-yilan') e.closed = true;
  });
  const tr = S.dijkstra(g, C.taipei, C.kaohsiung);
  assert.strictEqual(tr.final.d[C.kaohsiung], INF);
  assert.strictEqual(S.pathTo(tr.final.prev, C.taipei, C.kaohsiung), null);
  const comp = S.components(g);
  assert.strictEqual(comp.filter(c => c === comp[C.taipei]).length, 6);
});
test('最小生成樹唯一性：和「列舉所有生成樹」比對（隨機小圖 400 張，權重 1–3 常有平手）', () => {
  const rnd = S.rng(4242);
  for (let it = 0; it < 400; it++) {
    const g = S.randomGraph(5 + Math.floor(rnd() * 3), 300 + it);
    g.edges.forEach(e => { e.w = 1 + Math.floor(rnd() * 3); });
    const E = g.edges.length, V = g.nodes.length, M = S.mst(g).weight;
    let best = INF, cnt = 0;
    // 列舉 V − 1 條邊的組合，用並查集判斷是不是生成樹
    const pick = [];
    (function rec(i) {
      if (pick.length === V - 1) {
        const par = g.nodes.map((n, k) => k), find = x => (par[x] === x ? x : (par[x] = find(par[x])));
        let w = 0;
        for (const e of pick) { const a = find(g.edges[e].a), b = find(g.edges[e].b); if (a === b) return; par[a] = b; w += g.edges[e].w; }
        if (w < best) { best = w; cnt = 1; } else if (w === best) cnt++;
        return;
      }
      if (i >= E || E - i < V - 1 - pick.length) return;
      pick.push(i); rec(i + 1); pick.pop(); rec(i + 1);
    })(0);
    assert.strictEqual(best, M);
    assert.strictEqual(S.mstUnique(g), cnt === 1, 'it=' + it);
  }
  assert.strictEqual(S.mstUnique(S.taiwanGraph()), true);
  const g1 = S.taiwanGraph(); g1.edges.forEach(e => { e.w = 1; });
  assert.strictEqual(S.mstUnique(g1), false);
});
test('執行後的整理（report）：和直接計算一致', () => {
  const g = S.taiwanGraph(), C = {};
  S.CITIES.forEach((c, i) => { C[c.key] = i; });
  const d = S.report(g, 'taiwan', S.run(g, 'dijkstra', C.keelung, C.pingtung, {})).data;
  assert.strictEqual(d.dist, 336); assert.strictEqual(d.count, 1); assert.strictEqual(d.unedited, true);
  assert.strictEqual(d.settled, 18); assert.strictEqual(d.sptMst, false);
  assert.ok(d.checks <= 25 && d.relax <= d.checks);
  const b = S.report(g, 'taiwan', S.run(g, 'bfs', C.taoyuan, C.chiayi, {})).data;
  assert.strictEqual(b.dist, b.bfsLen); assert.strictEqual(b.dijDist, 200); assert.ok(b.bfsLen > 200);
  const dm = S.report(g, 'taiwan', S.run(g, 'dijkstra', C.taoyuan, C.hengchun, {})).data;
  assert.strictEqual(dm.isDiam, true);
  // 負權重：A→B = −5 時 Dijkstra 算錯，report 的 wrong 與 Bellman–Ford 比對
  const n = S.negGraph(); n.edges.forEach(e => { if (S.NEG_NAMES[e.a] === 'A' && S.NEG_NAMES[e.b] === 'B') e.w = -5; });
  const nr = S.report(n, 'neg', S.run(n, 'dijkstra', 0, 5, {}));
  const bf = S.bellmanFord(n, 0, 5, {}).final.d, dj = S.dijkstra(n, 0, 5, {}).final.d;
  assert.strictEqual(nr.data.wrong, bf.filter((x, i) => x !== dj[i]).length);
  assert.ok(nr.data.wrong > 0 && nr.data.late > 0);
  // 方格對角：全部設為 1 時條數 = C(r + c − 2, r − 1)，corners、square 正確
  const q = S.gridGraph(5, 5, 1); q.edges.forEach(e => { e.w = 1; });
  const qd = S.report(q, 'grid', S.run(q, 'dijkstra', 0, 24, {})).data;
  assert.strictEqual(qd.count, 70); assert.ok(qd.corners && qd.square && qd.allEqual);
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗的項目' : ''));
