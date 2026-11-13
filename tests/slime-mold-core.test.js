// 以 Node 執行：node tests/slime-mold-core.test.js
'use strict';
const assert = require('assert');
const S = require('../js/slime-mold-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b} ± ${tol}，得到 ${a}`);
}
/** 兩條平行路線：節點 0 = 入口、1 = 出口；路線 k 有 len[k] 段長度 1 的管子 */
function parallel(lens) {
  const nodes = [[0, 0], [10, 0]], edges = [];
  lens.forEach(function (n, k) {
    let prev = 0;
    for (let i = 1; i < n; i++) { nodes.push([i, k + 1]); edges.push([prev, nodes.length - 1]); prev = nodes.length - 1; }
    edges.push([prev, 1]);
  });
  return S.graph(nodes, edges, edges.map(function () { return 1; }));
}
function routeD(s, g, lens) {
  // 每條路線第一段管子的導度（同一條路線上各段相同）
  const out = [];
  let e = 0;
  lens.forEach(function (n) { out.push(s.D[e]); e += n; });
  return out;
}

console.log('slime-mold-core');

test('Kirchhoff：串聯與並聯的電阻（帶狀 Cholesky 解）', () => {
  // 0 —(R=2)— 1 —(R=3)— 2，且 0 —(R=6)— 2；從 0 注入 1、從 2 流出 1
  const g = S.graph([[0, 0], [1, 0], [2, 0]], [[0, 1], [1, 2], [0, 2]], [2, 3, 6]);
  const cond = new Float64Array([1 / 2, 1 / 3, 1 / 6]);
  const p = S.solve(g, cond, new Float64Array([1, 0, -1]));
  // 串聯 5 與 6 並聯 → 30/11
  close(p[0] - p[2], 30 / 11, 1e-9, '總電壓');
  const q1 = cond[0] * (p[0] - p[1]), q3 = cond[2] * (p[0] - p[2]);
  close(q1 + q3, 1, 1e-9, '總電流');
  close(q1, 6 / 11, 1e-9, '串聯支路');
  close(cond[1] * (p[1] - p[2]), q1, 1e-9, '節點 1 流進等於流出');
});

test('Kirchhoff：每個交會點流進等於流出（迷宮、隨機導度）', () => {
  const M = S.maze(9, 7, 10, 3), g = M.g, r = S.rng(5);
  const cond = new Float64Array(g.m).map(() => 0.05 + r());
  const b = new Float64Array(g.n); b[0] = 1; b[g.n - 1] = -1;
  const p = S.solve(g, cond, b);
  const net = new Float64Array(g.n);
  for (let e = 0; e < g.m; e++) { const q = cond[e] * (p[g.ea[e]] - p[g.eb[e]]); net[g.ea[e]] -= q; net[g.eb[e]] += q; }
  for (let i = 0; i < g.n; i++) close(net[i] + b[i], 0, 1e-9, '節點 ' + i);
});

test('迷宮：完美迷宮任兩格只有一條路；多拆 k 面牆就多 k 個環', () => {
  [[8, 6, 0, 1], [12, 8, 6, 2], [20, 15, 25, 3]].forEach(c => {
    const M = S.maze(c[0], c[1], c[2], c[3]), g = M.g;
    assert.strictEqual(g.n, c[0] * c[1]);
    assert.strictEqual(g.m, g.n - 1 + c[2], '邊數 = 點數 − 1 + 環數');
    const d = S.bfs(g, 0);
    for (let i = 0; i < g.n; i++) assert.ok(d[i] >= 0, '每一格都走得到');
    assert.ok(S.bandwidth(g) <= c[0], '一列一列編號，帶寬不超過一列');
  });
});

test('μ = 1、兩條平行路線（長 2 與 3）：短的留下（D → I0），長的消失', () => {
  const lens = [2, 3], g = parallel(lens);
  const s = S.create({ g: g, foods: [0, 1], rule: 'pow', mu: 1, I0: 1, dt: 0.3 });
  S.run(s, 4000, 1e-9);
  const d = routeD(s, g, lens);
  close(d[0], 1, 1e-4, '短路線');
  assert.ok(d[1] < 1e-3, '長路線 ' + d[1]);
});

test('μ = 1、兩條一樣長的路線：兩條都留下，比例維持起始的比例', () => {
  const lens = [3, 3], g = parallel(lens);
  const s = S.create({ g: g, foods: [0, 1], rule: 'pow', mu: 1, I0: 1, dt: 0.3 });
  for (let e = 0; e < 3; e++) s.D[e] = 0.6;
  for (let e = 3; e < 6; e++) s.D[e] = 0.2;
  S.run(s, 6000, 1e-10);
  const d = routeD(s, g, lens);
  close(d[0] + d[1], 1, 1e-4, '總和 = I0');
  close(d[0] / d[1], 3, 1e-3, '比例不變');
});

test('μ < 1：兩條路線都留下，流量比 Q1/Q2 = (L2/L1)^(1/(1−μ))', () => {
  [[0.5, [1, 2]], [0.7, [2, 3]]].forEach(c => {
    const mu = c[0], lens = c[1], g = parallel(lens);
    const s = S.create({ g: g, foods: [0, 1], rule: 'pow', mu: mu, I0: 1, dt: 0.3 });
    S.run(s, 20000, 1e-11);
    const q1 = Math.abs(s.Q[0]), q2 = Math.abs(s.Q[lens[0]]);
    close(q1 + q2, 1, 1e-6, '流量守恆');
    close(q1 / q2, Math.pow(lens[1] / lens[0], 1 / (1 - mu)), 1e-3, 'μ = ' + mu);
    // 穩定時 D = Q^μ
    close(s.D[0], Math.pow(q1, mu), 1e-5, 'D = Q^μ');
  });
});

test('μ > 1：贏家全拿——一開始比較粗的那條留下，即使它比較長', () => {
  const lens = [3, 4], g = parallel(lens);
  const s = S.create({ g: g, foods: [0, 1], rule: 'pow', mu: 2, I0: 1, dt: 0.3 });
  for (let e = 0; e < 3; e++) s.D[e] = 0.2;     // 短路線一開始很細
  for (let e = 3; e < 7; e++) s.D[e] = 1;
  S.run(s, 6000, 1e-9);
  const d = routeD(s, g, lens);
  assert.ok(d[0] < 1e-3 && d[1] > 0.99, '長路線勝出：' + d.join(', '));
  // 對照：μ = 1 時同樣的起點，短的還是勝出
  const s1 = S.create({ g: g, foods: [0, 1], rule: 'pow', mu: 1, I0: 1, dt: 0.3 });
  for (let e = 0; e < 3; e++) s1.D[e] = 0.2;
  for (let e = 3; e < 7; e++) s1.D[e] = 1;
  S.run(s1, 8000, 1e-9);
  const d1 = routeD(s1, g, lens);
  assert.ok(d1[0] > 0.99 && d1[1] < 1e-3, 'μ = 1 短的勝出：' + d1.join(', '));
});

test('迷宮（μ = 1）：死路先消失，最後收斂到最短路徑（多個迷宮）', () => {
  [[12, 8, 6, 1], [12, 8, 6, 4], [14, 10, 8, 2], [20, 15, 25, 1]].forEach(c => {
    const M = S.maze(c[0], c[1], c[2], c[3]), g = M.g, R = S.mazeRoutes(g, 0, g.n - 1);
    if (R.nShortest !== 1) return;
    const s = S.create({ g: g, foods: [0, g.n - 1], rule: 'pow', mu: 1, I0: 1, dt: 0.3, noise: 0.1, seed: 9 });
    S.run(s, 6000, 1e-4);
    const r = S.mazeResult(s, R);
    assert.ok(r.single && r.isShortest, c.join('×') + '：' + JSON.stringify(r));
    // 最短路上的導度 ≈ I0
    let mn = Infinity;
    for (let e = 0; e < g.m; e++) if (s.D[e] > 1e-3) mn = Math.min(mn, s.D[e]);
    close(mn, 1, 0.01, '路上的 D');
  });
});

test('最短路線、第二短路線與最短路線的條數', () => {
  // 3×2 的格子全部打通：從左上到右下最短 3 步，共 3 條
  const nodes = [], edges = [];
  for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) nodes.push([i, j]);
  [[0, 1], [1, 2], [3, 4], [4, 5], [0, 3], [1, 4], [2, 5]].forEach(e => edges.push(e));
  const g = S.graph(nodes, edges);
  const R = S.mazeRoutes(g, 0, 5);
  assert.strictEqual(R.shortest, 3);
  assert.strictEqual(R.nShortest, 3);
  assert.strictEqual(R.second, 3, '拿掉一條最短路上的邊後，仍然有長 3 的路');
});

test('網路評比：環的容錯 1、樹的容錯 0、總長與平均距離', () => {
  // 正方形四個角 + 對角線不連：環
  const sq = S.graph([[0, 0], [1, 0], [1, 1], [0, 1]], [[0, 1], [1, 2], [2, 3], [3, 0]]);
  const all = new Uint8Array(4).fill(1);
  const r = S.netStats(sq, all, [0, 1, 2, 3]);
  close(r.TL, 4, 1e-12); close(r.FT, 1, 1e-12);
  close(r.MD, (1 + 2 + 1 + 1 + 2 + 1) / 6, 1e-12);
  // 拿掉一邊變成一條線（樹）
  const tree = new Uint8Array([1, 1, 1, 0]);
  const t = S.netStats(sq, tree, [0, 1, 2, 3]);
  close(t.TL, 3, 1e-12); close(t.FT, 0, 1e-12);
  // 只要兩端是城市：中間節點的「枝」不影響
  const t2 = S.netStats(sq, tree, [0, 3]);
  close(t2.FT, 0, 1e-12); close(t2.MD, 3, 1e-12);
  // 斷開
  const cut = new Uint8Array([1, 0, 1, 0]);
  assert.strictEqual(S.netStats(sq, cut, [0, 3]).connected, false);
});

test('臺灣格子：約 850 個交會點、彼此連通、帶寬小；城市都在陸地上', () => {
  const TW = S.taiwan(7), g = TW.g;
  assert.ok(g.n > 700 && g.n < 1000, '節點 ' + g.n);
  assert.ok(S.bandwidth(g) < 30, '帶寬 ' + S.bandwidth(g));
  const d = S.bfs(g, 0);
  for (let i = 0; i < g.n; i++) assert.ok(d[i] >= 0);
  S.CITIES.forEach(c => {
    const n = TW.city[c.id], p = S.proj(c.lat, c.lon);
    close(g.x[n], p[0], 1e-9); close(g.y[n], p[1], 1e-9);
    assert.ok(S.inside(p[0], p[1]), c.zh + ' 在海岸線內');
  });
  // 示意地形：玉山附近最高、西部平原很低
  const yu = S.proj(23.47, 120.96), tn = S.proj(23.0, 120.25);
  assert.ok(S.elev(yu[0], yu[1]) > 0.9 && S.elev(tn[0], tn[1]) < 0.05);
  // 臺鐵（簡化）是一個環加一條海線：容錯 1
  const ids = S.CITIES.filter(c => c.on).map(c => TW.city[c.id]);
  const rs = S.netStats(g, S.railEdges(TW), ids);
  assert.ok(rs.connected); close(rs.FT, 1, 1e-12);
});

test('多個食物源（Tero 2010）：I0 小 → 接近最小生成樹；I0 大 → 多留備援、容錯變高', () => {
  const TW = S.taiwan(7), g = TW.g;
  const ids = S.CITIES.filter(c => c.on).map(c => TW.city[c.id]);
  S.setMountain(g, 0);
  const ms = S.netStats(g, S.mstEdges(g, ids), ids);
  close(ms.FT, 0, 1e-12, '最小生成樹的容錯');
  const res = [1, 6].map(I0 => {
    const s = S.create({ g: g, foods: ids, rule: 'sig', gamma: 1.8, I0: I0, dt: 0.5 });
    S.run(s, 1500, 1e-4);
    assert.ok(s.change < 1e-4, '收斂');
    return S.netStats(g, S.alive(s), ids);
  });
  assert.ok(res[0].connected && res[1].connected);
  assert.ok(res[0].TL / ms.TL < 1.05 && res[0].FT < 0.01, 'I0 = 1：' + (res[0].TL / ms.TL) + ', ' + res[0].FT);
  assert.ok(res[1].TL / ms.TL > 1.5 && res[1].FT > 0.9, 'I0 = 6：' + (res[1].TL / ms.TL) + ', ' + res[1].FT);
  assert.ok(res[1].MD < res[0].MD, '備援讓平均距離變短');
});

test('山區阻力：阻力大時管子繞過中央山脈', () => {
  const TW = S.taiwan(7), g = TW.g;
  const ids = ['tpe', 'txg', 'khh', 'hun', 'ttt'].map(k => TW.city[k]);
  const hmax = [0, 8].map(M => {
    S.setMountain(g, M);
    const s = S.create({ g: g, foods: ids, rule: 'sig', gamma: 1.8, I0: 1, dt: 0.5 });
    S.run(s, 1500, 1e-4);
    return S.maxElev(g, S.alive(s));
  });
  S.setMountain(g, 0);
  assert.ok(hmax[0] > 0.5 && hmax[1] < 0.35, '最高點：' + hmax.join(', '));
});

test('半隱式更新：D 不會變負，步長很大也穩定', () => {
  const lens = [2, 3], g = parallel(lens);
  const s = S.create({ g: g, foods: [0, 1], rule: 'pow', mu: 1, I0: 1, dt: 50 });
  S.run(s, 200, 1e-12);
  for (let e = 0; e < g.m; e++) assert.ok(s.D[e] >= 0 && isFinite(s.D[e]));
  close(routeD(s, g, lens)[0], 1, 1e-6);
});

console.log(passed + ' 項通過');
