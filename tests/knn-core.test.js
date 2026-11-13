// 以 Node 執行：node tests/knn-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/knn-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e)); process.exitCode = 1; }
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}，得到 ${a}`);
const G = K.GRID;
const CFGS = [];
['euclid', 'manhattan'].forEach(m => [1, 100].forEach(s => [false, true].forEach(z => CFGS.push({ metric: m, scale: s, std: z }))));
const cfgTxt = c => c.metric + '・×' + c.scale + (c.std ? '・標準化' : '');
/** 隨機的格點資料，classes 類 */
function randomPoints(rand, n, classes, span) {
  const pts = [], used = {};
  span = span || G;
  while (pts.length < n) {
    const gx = Math.round((rand() * 2 - 1) * span), gy = Math.round((rand() * 2 - 1) * span);
    if (used[gx + ',' + gy]) continue;
    used[gx + ',' + gy] = 1;
    pts.push(K.pt(gx, gy, Math.floor(rand() * (classes || 2))));
  }
  return pts;
}
/** 對照用：直接照定義算特徵與距離（浮點數，不用整數鍵） */
function refDist(points, cfg, i, qx, qy) {
  const n = points.length;
  let f = points.map(p => [p.gx / G, cfg.scale * p.gy / G]);
  let q = [qx / G, cfg.scale * qy / G];
  if (cfg.std) {
    const m = [0, 1].map(j => f.reduce((a, v) => a + v[j], 0) / n);
    const sd = [0, 1].map(j => { const v = Math.sqrt(f.reduce((a, r) => a + (r[j] - m[j]) ** 2, 0) / n); return v > 0 ? v : cfg.scale ** j / G; });
    f = f.map(r => [(r[0] - m[0]) / sd[0], (r[1] - m[1]) / sd[1]]);
    q = [(q[0] - m[0]) / sd[0], (q[1] - m[1]) / sd[1]];
  }
  const a = f[i][0] - q[0], b = f[i][1] - q[1];
  return cfg.metric === 'euclid' ? Math.hypot(a, b) : Math.abs(a) + Math.abs(b);
}
/** 對照用：暴力排序（距離相同時照索引） */
function bruteNeighbors(points, cfg, qx, qy, skip) {
  const P = K.prepare(points, cfg);
  const list = [];
  points.forEach((p, i) => { if (i !== skip) list.push({ i: i, key: P.key(i, qx, qy) }); });
  list.sort((a, b) => P.eq(a.key, b.key) ? a.i - b.i : a.key - b.key);
  return list.map(e => e.i);
}
/** 對照用：照定義投票（票最多 → 距離總和最小 → 排最前面） */
function refVote(points, cfg, qx, qy, k, skip) {
  const idx = bruteNeighbors(points, cfg, qx, qy, skip).slice(0, k);
  const votes = [0, 0, 0], sums = [0, 0, 0];
  idx.forEach(i => { votes[points[i].c]++; sums[points[i].c] += refDist(points, cfg, i, qx, qy); });
  const mx = Math.max.apply(null, votes);
  let cand = [0, 1, 2].filter(c => votes[c] === mx);
  if (cand.length > 1) {
    const mn = Math.min.apply(null, cand.map(c => sums[c]));
    cand = cand.filter(c => Math.abs(sums[c] - mn) <= 1e-9 * Math.max(1, mn));
  }
  if (cand.length > 1) { for (const i of idx) if (cand.indexOf(points[i].c) >= 0) return points[i].c; }
  return cand[0];
}

console.log('距離與特徵');
test('距離和照定義直接算的一樣（歐氏／曼哈頓 × 單位 1／100 × 標準化與否）', () => {
  const r = K.rng(11);
  for (let t = 0; t < 40; t++) {
    const pts = randomPoints(r, 3 + Math.floor(r() * 20), 3);
    CFGS.forEach(cfg => {
      const P = K.prepare(pts, cfg);
      const qx = Math.round((r() * 2 - 1) * G), qy = Math.round((r() * 2 - 1) * G);
      pts.forEach((p, i) => near(P.dist(P.key(i, qx, qy)), refDist(pts, cfg, i, qx, qy), 1e-9 * (1 + refDist(pts, cfg, i, qx, qy)), cfgTxt(cfg) + ' '));
    });
  }
});
test('不標準化時的鍵是精確的整數：歐氏 Δg1² + s²Δg2²、曼哈頓 |Δg1| + s|Δg2|', () => {
  const pts = [K.pt(3, -7, 0), K.pt(-20, 20, 1)];
  const E = K.prepare(pts, { metric: 'euclid', scale: 100, std: false }), M = K.prepare(pts, { metric: 'manhattan', scale: 100, std: false });
  assert.strictEqual(E.key(0, 0, 0), 9 + 10000 * 49);
  assert.strictEqual(M.key(1, 1, 1), 21 + 100 * 19);
  const Z = K.prepare(pts, { metric: 'euclid', scale: 1, std: true });
  assert.ok(Number.isInteger(Z.key(0, 5, 5)), '標準化的歐氏鍵也是整數');
});
test('標準化之後，x2 的單位（× 1 或 × 100）完全不影響距離的遠近順序與距離值', () => {
  const r = K.rng(12);
  for (let t = 0; t < 30; t++) {
    const pts = randomPoints(r, 5 + Math.floor(r() * 25), 3);
    ['euclid', 'manhattan'].forEach(m => {
      const A = K.prepare(pts, { metric: m, scale: 1, std: true }), B = K.prepare(pts, { metric: m, scale: 100, std: true });
      const qx = Math.round((r() * 2 - 1) * G), qy = Math.round((r() * 2 - 1) * G);
      assert.deepStrictEqual(K.neighbors(A, qx, qy, -1).map(e => e.i), K.neighbors(B, qx, qy, -1).map(e => e.i));
      pts.forEach((p, i) => near(A.dist(A.key(i, qx, qy)), B.dist(B.key(i, qx, qy)), 1e-9));
    });
  }
});

console.log('最近鄰與投票');
test('最近鄰和暴力排序一致（含距離相同時先放的在前；全部排序與只取前 k 個兩種寫法）', () => {
  const r = K.rng(21);
  let ties = 0;
  for (let t = 0; t < 120; t++) {
    const pts = randomPoints(r, 2 + Math.floor(r() * 40), 3);
    CFGS.forEach(cfg => {
      const P = K.prepare(pts, cfg);
      const qx = Math.round((r() * 2 - 1) * 8), qy = Math.round((r() * 2 - 1) * 8);   // 靠近中間，比較容易出現同距離
      const skip = r() < 0.3 ? Math.floor(r() * pts.length) : -1;
      const want = bruteNeighbors(pts, cfg, qx, qy, skip);
      assert.deepStrictEqual(K.neighbors(P, qx, qy, skip).map(e => e.i), want, cfgTxt(cfg));
      for (const lim of [1, 3, 7, 23]) assert.deepStrictEqual(K.neighbors(P, qx, qy, skip, lim).map(e => e.i), want.slice(0, lim), cfgTxt(cfg) + ' 前 ' + lim + ' 個');
      const full = K.neighbors(P, qx, qy, skip);
      for (let j = 1; j < full.length; j++) if (P.eq(full[j].key, full[j - 1].key)) { ties++; assert.ok(full[j].i > full[j - 1].i, '同距離時索引小的在前'); }
    });
  }
  assert.ok(ties > 100, '測試資料裡要有夠多同距離的情況（實際 ' + ties + ' 次）');
});
test('投票結果和照定義直接投票一致（隨機資料、三類、k = 1…15）', () => {
  const r = K.rng(22);
  let tieDist = 0, tieFirst = 0;
  for (let t = 0; t < 150; t++) {
    const pts = randomPoints(r, 3 + Math.floor(r() * 25), 3, t % 2 ? G : 5);   // 一半的資料擠在小範圍裡，比較容易出現同距離
    CFGS.forEach(cfg => {
      const qx = Math.round((r() * 2 - 1) * 5), qy = Math.round((r() * 2 - 1) * 5);
      const k = 1 + 2 * Math.floor(r() * 8);
      const res = K.classify(pts, cfg, qx, qy, Math.min(k, pts.length));
      assert.strictEqual(res.pred, refVote(pts, cfg, qx, qy, Math.min(k, pts.length), -1), cfgTxt(cfg) + ' k = ' + k);
      if (res.tie === 'dist') tieDist++; if (res.tie === 'first') tieFirst++;
    });
  }
  assert.ok(tieDist > 20 && tieFirst > 3, '要測到兩種平手規則（距離總和 ' + tieDist + ' 次、看最前面 ' + tieFirst + ' 次）');
});
test('平手規則的手算例子', () => {
  const E = { metric: 'euclid', scale: 1, std: false };
  // k = 3，三類各一票：距離總和 A 0.1、B 0.2、C 0.3 → A
  let pts = [K.pt(2, 0, 0), K.pt(0, 4, 1), K.pt(-6, 0, 2)];
  let r = K.classify(pts, E, 0, 0, 3);
  assert.deepStrictEqual(r.votes, [1, 1, 1]); assert.strictEqual(r.tie, 'dist'); assert.strictEqual(r.pred, 0);
  // 三個點一樣遠（0.1）：距離總和也相同 → 最前面的鄰居：同距離時先放的在前
  pts = [K.pt(2, 0, 2), K.pt(0, 2, 1), K.pt(-2, 0, 0)];
  r = K.classify(pts, E, 0, 0, 3);
  assert.strictEqual(r.tie, 'first'); assert.strictEqual(r.pred, 2, '先放的 C 勝');
  pts = [K.pt(-2, 0, 0), K.pt(0, 2, 1), K.pt(2, 0, 2)];
  assert.strictEqual(K.classify(pts, E, 0, 0, 3).pred, 0, '換成先放 A，A 勝');
  // k = 5，A 2 票、B 2 票、C 1 票：A 兩個在 0.05、0.3（總和 0.35），B 兩個在 0.1、0.2（總和 0.3）→ B
  pts = [K.pt(1, 0, 0), K.pt(6, 0, 0), K.pt(0, 2, 1), K.pt(0, -4, 1), K.pt(-3, 0, 2)];
  r = K.classify(pts, E, 0, 0, 5);
  assert.deepStrictEqual(r.votes, [2, 2, 1]); assert.strictEqual(r.tie, 'dist'); assert.strictEqual(r.pred, 1);
  // 沒有平手
  pts = [K.pt(1, 0, 1), K.pt(2, 0, 0), K.pt(3, 0, 0)];
  r = K.classify(pts, E, 0, 0, 3);
  assert.strictEqual(r.pred, 0); assert.strictEqual(r.tie, 'none');
  assert.strictEqual(K.classify(pts, E, 0, 0, 1).pred, 1, 'k = 1 只看最近的 B');
});
test('兩類、k 是奇數時投票不會平手', () => {
  const r = K.rng(23);
  for (let t = 0; t < 300; t++) {
    const pts = randomPoints(r, 2 + Math.floor(r() * 30), 2);
    const k = 1 + 2 * Math.floor(r() * 10);
    if (k > pts.length) continue;
    const res = K.classify(pts, CFGS[Math.floor(r() * 8)], Math.round((r() * 2 - 1) * G), Math.round((r() * 2 - 1) * G), k);
    assert.strictEqual(res.tie, 'none');
  }
});
test('k ≥ n 時，不論查詢點在哪裡，都猜人數唯一最多的那一類（區域上色也是一整片）', () => {
  const r = K.rng(24);
  let n = 0;
  for (let t = 0; t < 200; t++) {
    const pts = randomPoints(r, 3 + Math.floor(r() * 30), 3);
    const c = K.counts(pts), mx = Math.max.apply(null, c);
    if (c.filter(v => v === mx).length !== 1) continue;
    n++;
    const maj = c.indexOf(mx);
    const cfg = CFGS[t % 8];
    for (let j = 0; j < 10; j++) assert.strictEqual(K.classify(pts, cfg, Math.round((r() * 2 - 1) * G), Math.round((r() * 2 - 1) * G), pts.length + 2 * j).pred, maj);
    if (t % 10 === 0) { const job = new K.RegionJob(pts, cfg, pts.length, 12, 1.12); job.run(); assert.ok(Array.from(job.cls).every(v => v === maj)); }
  }
  assert.ok(n > 100);
});

console.log('查詢點的分析');
test('「全都一樣遠」「先放的先選會改變答案」「最後一席」「近的全落選」的判斷', () => {
  const E = { metric: 'euclid', scale: 1, std: false }, M = { metric: 'manhattan', scale: 1, std: false };
  // 曼哈頓距離 0.5（10 格）的六個點，k = 5：全都一樣遠
  let pts = [K.pt(10, 0, 0), K.pt(0, 10, 0), K.pt(-10, 0, 1), K.pt(0, -10, 1), K.pt(5, 5, 0), K.pt(-5, -5, 1)];
  let a = K.analyzeQuery(pts, K.prepare(pts, M), 0, 0, 5);
  assert.ok(a.allEqual, '全都一樣遠');
  assert.ok(!a.lastSeat, '前面也是同距離，不算「只有最後一席」');
  // 最後一席：兩個最近的 A、一個近的 B，第 3 名由一樣遠的 B（先放）與 A（後放）搶
  pts = [K.pt(2, 0, 0), K.pt(-2, 0, 1), K.pt(0, 6, 1), K.pt(0, -6, 0), K.pt(0, 1, 0)];
  a = K.analyzeQuery(pts, K.prepare(pts, E), 0, 0, 3);
  assert.deepStrictEqual(a.list.slice(0, 3).map(e => e.i), [4, 0, 1]);
  assert.strictEqual(a.pred, 0);
  assert.ok(!a.lastSeat, '同距離的兩個都選進去了，沒有人搶位子');
  pts = [K.pt(0, 1, 0), K.pt(2, 0, 1), K.pt(0, 3, 1), K.pt(-3, 0, 0)];   // 最近 A（0.05）、B（0.1），第 3 名 B（先放）和 A（後放）都是 0.15
  a = K.analyzeQuery(pts, K.prepare(pts, E), 0, 0, 3);
  assert.strictEqual(a.pred, 1);
  assert.ok(a.orderSensitive && a.lastSeat, '換成後放的先選會變成 A');
  // 近的全落選：兩個 B 很近，三個 A 遠一點，k = 5 → A
  pts = [K.pt(1, 0, 1), K.pt(-1, 0, 1), K.pt(6, 0, 0), K.pt(-6, 1, 0), K.pt(0, 7, 0)];
  a = K.analyzeQuery(pts, K.prepare(pts, E), 0, 0, 5);
  assert.strictEqual(a.pred, 0); assert.ok(a.losersCloser); near(a.loserRatio, 6, 1e-12);
});

console.log('留一法交叉驗證');
test('留一法和「把那個點真的拿掉再分類」的直接重算一致（每個 k、每種設定，含標準化只用其他點）', () => {
  const r = K.rng(31);
  for (let t = 0; t < 25; t++) {
    const pts = randomPoints(r, 2 + Math.floor(r() * 18), 1 + Math.floor(r() * 3));
    CFGS.forEach(cfg => {
      const res = K.loo(pts, cfg, { detail: true });
      res.ks.forEach((k, ti) => {
        let ok = 0;
        pts.forEach((p, i) => {
          const rest = pts.filter((q, j) => j !== i);
          const pred = refVote(rest, cfg, p.gx, p.gy, Math.min(k, rest.length), -1);
          if (pred === p.c) ok++;
          assert.strictEqual(res.perPoint[i][ti], pred === p.c);
        });
        assert.strictEqual(res.correct[ti], ok, cfgTxt(cfg) + ' k = ' + k);
      });
      assert.strictEqual(res.distCount, pts.length * (pts.length - 1));
    });
  }
});
test('被考的點不會當自己的鄰居：兩個不同類的點，k = 1 時留一法 0%；自己考自己卻是 100%', () => {
  const pts = [K.pt(0, 0, 0), K.pt(10, 0, 1)];
  const res = K.loo(pts, CFGS[0]);
  assert.strictEqual(res.correct[0], 0);
  const r = K.rng(32);
  for (let t = 0; t < 50; t++) {
    const p2 = randomPoints(r, 2 + Math.floor(r() * 40), 3);
    assert.strictEqual(K.resubstitution(p2, CFGS[t % 8], 1).correct, p2.length, 'k = 1 自己考自己一定全對');
  }
});
test('兩類人數相同時，k = n − 1 的留一法正確率一定是 0（拿掉一個，那一類就少一票）', () => {
  const r = K.rng(33);
  for (let t = 0; t < 60; t++) {
    const m = 2 + Math.floor(r() * 12);
    const pts = randomPoints(r, 2 * m, 2).map((p, i) => K.pt(p.gx, p.gy, i % 2));
    const res = K.loo(pts, CFGS[t % 8]);
    assert.strictEqual(res.ks[res.ks.length - 1] >= 2 * m - 1, true);
    assert.strictEqual(res.correct[res.correct.length - 1], 0);
  }
});
test('k 的清單：1, 3, 5, … 到第一個 ≥ n − 1 的奇數（上限 99）；kIndex 對應正確', () => {
  assert.deepStrictEqual(K.kList(2), [1]);
  assert.deepStrictEqual(K.kList(5), [1, 3, 5]);
  assert.deepStrictEqual(K.kList(6), [1, 3, 5]);
  assert.deepStrictEqual(K.kList(7), [1, 3, 5, 7]);
  assert.strictEqual(K.kList(80).slice(-1)[0], 79);
  assert.strictEqual(K.kIndex(K.kList(10), 99), K.kList(10).length - 1);
  assert.strictEqual(K.kIndex(K.kList(10), 5), 2);
});
test('標準化時，x2 的單位 × 1 和 × 100 的留一法曲線一模一樣', () => {
  const r = K.rng(34);
  for (let t = 0; t < 30; t++) {
    const pts = randomPoints(r, 4 + Math.floor(r() * 30), 3);
    ['euclid', 'manhattan'].forEach(m => assert.deepStrictEqual(K.loo(pts, { metric: m, scale: 1, std: true }).correct, K.loo(pts, { metric: m, scale: 100, std: true }).correct));
  }
});

console.log('區域上色');
test('分批計算的區域和逐點直接分類一致（每次只算一列也一樣）', () => {
  const r = K.rng(41);
  for (let t = 0; t < 12; t++) {
    const pts = randomPoints(r, 5 + Math.floor(r() * 30), 3), cfg = CFGS[t % 8], k = 1 + 2 * (t % 4), N = 18, Lh = 1.12;
    const job = new K.RegionJob(pts, cfg, k, N, Lh);
    let calls = 0;
    while (!job.run(0)) calls++;
    assert.strictEqual(calls + 1, N, '每次只算一列，要呼叫 N 次');
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -Lh + (i + 0.5) * 2 * Lh / N, y = Lh - (j + 0.5) * 2 * Lh / N;
      assert.strictEqual(job.cls[j * N + i], K.classify(pts, cfg, x * G, y * G, Math.min(k, pts.length)).pred);
    }
  }
});

console.log('預設資料與工作階段');
test('預設資料：同一個編號完全重現、點在 [−0.95, 0.95] 內、沒有重複的格點、人數符合設計', () => {
  const want = { blobs: [18, 22, 0], three: [13, 14, 15], moons: [22, 20, 0] };
  K.PRESET_NAMES.forEach(name => {
    for (let s = 1; s <= 15; s++) {
      const a = K.PRESETS[name](s), b = K.PRESETS[name](s);
      assert.strictEqual(K.dataKey(a), K.dataKey(b));
      const seen = {};
      a.forEach(p => { assert.ok(Math.abs(p.gx) <= 19 && Math.abs(p.gy) <= 19); assert.ok(!seen[p.gx + ',' + p.gy]); seen[p.gx + ',' + p.gy] = 1; });
      if (want[name]) assert.deepStrictEqual(K.counts(a), want[name], name);
      if (name === 'checker') assert.strictEqual(a.length, 41);
      if (name === 'noisy') assert.strictEqual(a.filter(p => p.noise).length, 7);
    }
    assert.notStrictEqual(K.dataKey(K.PRESETS[name](1)), K.dataKey(K.PRESETS[name](2)), '不同編號不同資料');
  });
});
test('「兩團」：x2 改成 × 100（不標準化）時留一法大跌，標準化又救回來', () => {
  for (let s = 1; s <= 10; s++) {
    const pts = K.genBlobs(s);
    const a = K.loo(pts, { metric: 'euclid', scale: 1, std: false }).correct[2] / pts.length;
    const b = K.loo(pts, { metric: 'euclid', scale: 100, std: false }).correct[2] / pts.length;
    const z = K.loo(pts, { metric: 'euclid', scale: 100, std: true }).correct[2] / pts.length;
    assert.ok(a - b >= 0.2, '第 ' + s + ' 份：' + a + ' → ' + b);
    assert.ok(Math.abs(z - a) <= 0.05, '第 ' + s + ' 份標準化：' + z + ' 對 ' + a);
  }
});
test('工作階段：載入時不送事件；每個操作送一個 state；留一法一步步走完的結果與 loo 相同', () => {
  const ev = [];
  const S = new K.Session({ emit: (t, d) => ev.push({ t, d }) });
  S.loadPreset('blobs', true);
  assert.strictEqual(ev.length, 0);
  S.moveQuery(10, 0); S.setCfg('k', 7); S.setCfg('k', 7); S.setCfg('metric', 'manhattan'); S.addPoint(0, 0, 2); S.loadPreset('moons');
  assert.deepStrictEqual(ev.map(e => e.d.src), ['query', 'k', 'metric', 'add', 'preset']);
  assert.strictEqual(ev[1].d.k, 7);
  ev.length = 0;
  let r; while ((r = S.walkStep(false))) { /* 走完 */ }
  const done = ev.filter(e => e.t === 'looDone');
  assert.strictEqual(done.length, 1);
  assert.strictEqual(done[0].d.correct, S.looAt(7).correct);
  assert.strictEqual(ev.filter(e => e.t === 'looStep').length, S.points.length);
  assert.strictEqual(S.setCfg('k', 4), true, '偶數會變成奇數');
  assert.strictEqual(S.cfg.k, 5);
});
test('只有兩個不同類的點時：查詢點在垂直平分線上，兩點完全一樣遠', () => {
  const ev = [];
  const S = new K.Session({ emit: (t, d) => ev.push(d) });
  S.clear(); S.addPoint(-6, 2, 0); S.addPoint(4, -8, 1); S.setCfg('k', 1);
  S.moveQuery(-1, -3);   // 中點
  assert.ok(ev[ev.length - 1].eqDist);
  S.moveQuery(4, 2);     // (−6,2) 到 (4,2) 是 10，(4,−8) 到 (4,2) 也是 10
  assert.ok(ev[ev.length - 1].eqDist);
  S.moveQuery(3, 2);
  assert.ok(!ev[ev.length - 1].eqDist);
});

console.log(`\n${passed} 項通過${process.exitCode ? '，有失敗項目' : '，全部通過'}。`);
