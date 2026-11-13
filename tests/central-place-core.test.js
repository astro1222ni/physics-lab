// 以 Node 執行：node tests/central-place-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/central-place-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
let seed = 2468;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
/** 在正六邊形（中心原點、相鄰中心間距 d、和 hexAround 同方向）裡均勻取一點 */
function inHex(x, y, d) {
  const a = d / 2;
  for (let m = 0; m < 3; m++) {
    const t = m * Math.PI / 3; // 指向六個鄰居的方向（0°、60°、120°）
    if (Math.abs(x * Math.cos(t) + y * Math.sin(t)) > a) return false;
  }
  return true;
}

test('門檻半徑與均衡間距：圓與六邊形各自剛好裝下門檻人數', () => {
  [[100, 2000], [37, 555], [1000, 1e5]].forEach(([rho, T]) => {
    const r = K.thresholdRadius(T, rho), d = K.spacingFor(T, rho);
    near(rho * Math.PI * r * r, T, 1e-9 * T);
    near(rho * K.hexArea(d), T, 1e-9 * T);
    near(K.circumradius(d) / r, Math.sqrt(2 * Math.PI / (3 * Math.sqrt(3))), 1e-12, '外接圓 ÷ 門檻半徑 = 1.0996');
  });
});

test('覆蓋率公式和蒙地卡羅一致（圓完全在裡面、超出六邊的弓形、整個蓋住）', () => {
  const d = 6;
  [1.5, 3, 3.2, 3.35, 3.46, 4].forEach(R => {
    let inside = 0, hit = 0;
    for (let n = 0; n < 200000; n++) {
      const x = (rnd() * 2 - 1) * d / Math.sqrt(3), y = (rnd() * 2 - 1) * d / Math.sqrt(3);
      if (!inHex(x, y, d)) continue;
      inside++;
      if (x * x + y * y <= R * R) hit++;
    }
    near(K.coverage(d, R), hit / inside, 0.006, 'R = ' + R);
  });
  assert.strictEqual(K.coverage(6, 6 / Math.sqrt(3)), 1);
  near(K.coverage(6, 3), Math.PI * 9 / K.hexArea(6), 1e-12, '內切圓 = π/(2√3)');
});

test('六邊形的方向：hexAround 的頂點正是三個相鄰中心的等距點', () => {
  const d = 5, pts = K.hexAround(0, 0, d, 3, 1);
  pts.forEach(p => {
    near(Math.hypot(p[0], p[1]), d / Math.sqrt(3), 1e-12);
    const ns = K.nearest(p[0], p[1], d, 3, 1, 3);
    near(ns[2].dist - ns[0].dist, 0, 1e-9, '三個一樣近');
  });
});

test('平均距離 0.351 d：和數值積分一致', () => {
  const d = 4;
  let sum = 0, n = 0;
  const h = d / 400;
  for (let x = -d / 2; x <= d / 2; x += h) for (let y = -d / Math.sqrt(3); y <= d / Math.sqrt(3); y += h) {
    if (!inHex(x + h / 2, y + h / 2, d)) continue;
    sum += Math.hypot(x + h / 2, y + h / 2); n++;
  }
  near(K.meanDist(d), sum / n, 2e-3 * d);
  near(K.MEAN_K / 2, 0.3510, 1e-4);
});

test('自由進入的均衡：每家店的顧客剛好等於門檻；三種結果的分界', () => {
  const rho = 100, T = 2000, s = K.single(rho, T, 5);
  assert.strictEqual(s.status, 'full'); near(s.d, s.dT, 1e-12); near(K.customers(s.d, 5, rho), T, 1e-6);
  near(s.mean, K.meanDist(s.dT), 1e-12); assert.strictEqual(s.coverage, 1);
  const rT = s.rT, c = K.circumradius(s.dT);
  assert.strictEqual(K.single(rho, T, rT * 0.999).status, 'none');
  assert.strictEqual(K.single(rho, T, rT * 1.001).status, 'gaps');
  assert.strictEqual(K.single(rho, T, c * 1.0001).status, 'full');
  for (let n = 0; n < 200; n++) {
    const r = 10 + rnd() * 990, TT = 50 + rnd() * 99950, R = rT * 0 + K.thresholdRadius(TT, r) * (1 + rnd() * 0.12);
    const q = K.single(r, TT, R);
    if (q.status === 'none') continue;
    near(K.customers(q.d, R, r) / TT, 1, 1e-9, '顧客 = 門檻');
    assert.ok(q.d >= q.dT - 1e-12 && q.d <= 2 * R + 1e-9, '均衡間距在 d_T 與 2R 之間');
    if (q.status === 'gaps') { assert.ok(K.circumradius(q.d) > R); near(q.coverage, TT / (r * K.hexArea(q.d)), 1e-9); }
  }
  // 商品圈剛好等於門檻半徑：店只能隔 2R（圓剛好相切），覆蓋率 = π/(2√3)
  const e = K.single(rho, T, rT * (1 + 1e-12));
  near(e.d, 2 * rT, 1e-6); near(e.coverage, Math.PI / (2 * Math.sqrt(3)), 1e-6);
});

test('縮放律：密度變 4 倍，間距變一半；門檻變 4 倍，間距變 2 倍', () => {
  near(K.spacingFor(2000, 400) / K.spacingFor(2000, 100), 0.5, 1e-12);
  near(K.spacingFor(8000, 100) / K.spacingFor(2000, 100), 2, 1e-12);
});

test('中地格子：每升一級間距 ×√k，第 L 級以上的中地占 1/k^(L−1)', () => {
  [3, 4, 7].forEach(k => {
    const d1 = 2, N = 4, W = 90, n = Math.pow(k, N - 1);
    const P = K.centersIn(-W, -W, W, W, d1, k, N).filter(p => Math.hypot(p.x, p.y) < W);
    // (i, j) 走遍 k^(N−1) × k^(N−1) 的方塊（子格子的週期），第 L 級以上的點剛好占 1/k^(L−1)
    const cnt = [0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cnt[K.orderOf(i, j, k, N)]++;
    for (let L = 2; L <= N; L++) {
      let atLeast = 0;
      for (let q = L; q <= N; q++) atLeast += cnt[q];
      assert.strictEqual(atLeast * Math.pow(k, L - 1), n * n, 'k = ' + k + '，L = ' + L);
      const top = P.filter(p => p.L >= L);
      // 同一級裡最近的兩點距離 = levelSpacing
      const a = top.reduce((b, p) => Math.hypot(p.x, p.y) < Math.hypot(b.x, b.y) ? p : b);
      const dmin = Math.min.apply(null, top.filter(p => p !== a).map(p => Math.hypot(p.x - a.x, p.y - a.y)));
      near(dmin, K.levelSpacing(d1, k, L), 1e-9, 'k = ' + k + ' 第 ' + L + ' 級間距');
    }
  });
});

test('三種原則：第 1 級中地到最近的第 2 級中地，k = 3 有 3 個、k = 4 有 2 個、k = 7 只有 1 個', () => {
  const want = { 3: 3, 4: 2, 7: 1 };
  [3, 4, 7].forEach(k => {
    const d1 = 3, P = K.centersIn(-20, -20, 20, 20, d1, k, 2).filter(p => p.L === 1);
    P.forEach(p => {
      const ns = K.nearest(p.x, p.y, d1, k, 2, 6), d0 = ns[0].dist;
      const ties = ns.filter(q => q.dist <= d0 * 1.0001).length;
      assert.strictEqual(ties, want[k], 'k = ' + k + ' 在 (' + p.x.toFixed(2) + ', ' + p.y.toFixed(2) + ')');
      // k = 3：在高級市場區的角上；k = 4：在兩個高級中地連線的中點；k = 7：在高級市場區裡面
      const c2 = K.circumradius(K.levelSpacing(d1, k, 2));
      if (k === 3) near(d0, c2, 1e-9);
      if (k === 4) near(d0, K.levelSpacing(d1, k, 2) / 2, 1e-9);
      if (k === 7) assert.ok(d0 < K.levelSpacing(d1, k, 2) / 2 - 1e-9);
    });
  });
});

test('市場區鋪滿平面：第 L 級六邊形面積 × 中地密度 = 1', () => {
  [3, 4, 7].forEach(k => {
    for (let L = 1; L <= 3; L++) {
      const dL = K.levelSpacing(1.5, k, L), pts = K.hexAround(0, 0, 1.5, k, L);
      let A = 0;
      for (let m = 0; m < 6; m++) { const p = pts[m], q = pts[(m + 1) % 6]; A += p[0] * q[1] - p[1] * q[0]; }
      near(Math.abs(A) / 2, K.hexArea(dL), 1e-9);
      // 六邊形的每個頂點和三個第 L 級中地等距（邊界正確）
      pts.forEach(p => { const ns = K.nearest(p[0], p[1], 1.5, k, L, 3); near(ns[2].dist - ns[0].dist, 0, 1e-9, 'k = ' + k + ' L = ' + L); });
    }
  });
});

test('各級的數字：市場區數 k^(N−L)，各級人口 = 密度 × 面積', () => {
  const H = K.hierarchy(100, 6, 3, 4);
  assert.deepStrictEqual(H.map(h => h.areas), [27, 9, 3, 1]);
  assert.deepStrictEqual(H.map(h => h.centers), [18, 6, 2, 1]);
  H.forEach(h => near(h.pop, 100 * K.hexArea(6 * Math.pow(3, (h.L - 1) / 2)), 1e-9));
  near(H[3].d, 6 * Math.pow(3, 1.5), 1e-12);
});

test('商品在哪一級賣：市場區人口 ≥ 門檻的最低一級', () => {
  const H = K.hierarchy(100, 6, 3, 3);
  assert.strictEqual(K.goodIn(100, 6, 3, 3, H[0].pop * 0.5, 30).L, 1);
  assert.strictEqual(K.goodIn(100, 6, 3, 3, H[0].pop * 1.01, 30).L, 2);
  assert.strictEqual(K.goodIn(100, 6, 3, 3, H[2].pop, 30).L, 3);
  assert.strictEqual(K.goodIn(100, 6, 3, 3, H[2].pop * 1.01, 30).L, null);
  const g = K.goodIn(100, 6, 3, 3, 9340, 10);
  near(g.fill, 9340 / H[1].pop, 1e-12); near(g.reach, 10 / H[1].far, 1e-12); near(g.coverage, K.coverage(H[1].d, 10), 1e-12);
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗' : ''));
