// 以 Node 執行：node tests/measurement-core.test.js
'use strict';
const assert = require('assert');
const M = require('../js/measurement-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}

console.log('measurement-core');

// ---------------- 游標尺 ----------------
test('游標原理：N 格總長 (N − 1) mm，精度 1/N mm', () => {
  for (const N of [20, 50]) {
    const V = M.VERNIER[N];
    close(V.div * N, N - 1, 1e-12, '游標總長');
    close(1 - V.div, V.c, 1e-12, '主尺一格比游標一格長 c');
    assert.strictEqual(V.cUm, Math.round(1000 / N));
  }
});

test('游標尺讀數：對齊格數 k 與讀數（20 格與 50 格各種讀數）', () => {
  const cases = [
    [20, 23450, 23, 9], [20, 0, 0, 0], [20, 50, 0, 1], [20, 950, 0, 19], [20, 12000, 12, 0], [20, 39950, 39, 19],
    [50, 23460, 23, 23], [50, 20, 0, 1], [50, 980, 0, 49], [50, 7020, 7, 1], [50, 15500, 15, 25]
  ];
  for (const [N, x, main, k] of cases) {
    const r = M.vernierRead(x, N);
    assert.strictEqual(r.mainMm, main, `主尺讀數 x=${x}`);
    assert.strictEqual(r.k, k, `對齊格數 x=${x}`);
    assert.strictEqual(r.valueUm, x, `讀數 x=${x}`);
    assert.strictEqual(r.mismatchUm, 0);
  }
});

test('游標尺：在格點上時第 k 條刻線與主尺刻線完全重合，其他刻線至少差 c', () => {
  for (const N of [20, 50]) {
    const c = M.VERNIER[N].cUm;
    for (let x = 3000; x < 5000; x += c) {
      const k = M.vernierRead(x, N).k;
      const off = M.vernierOffsets(x, N);
      off.forEach((o, j) => {
        if (j === k || (k === 0 && j === N)) close(o, 0, 1e-6, `N=${N} x=${x} 第 ${j} 條應對齊`);
        else assert.ok(Math.abs(o) >= c - 1e-6, `N=${N} x=${x} 第 ${j} 條不該對齊（差 ${o} µm）`);
      });
    }
  }
});

test('游標尺：讀數為整數 mm 時，第 0 條與最末一條（第 N 條）同時對齊', () => {
  for (const N of [20, 50]) {
    const off = M.vernierOffsets(17000, N);
    close(off[0], 0, 1e-6); close(off[N], 0, 1e-6);
    for (let j = 1; j < N; j++) assert.ok(Math.abs(off[j]) > 1);
  }
});

test('游標尺：刻線離對齊的距離隨格數線性變化（每格多差 c）', () => {
  const N = 20, x = 23450, k = 9, c = 50;
  const off = M.vernierOffsets(x, N);
  for (let j = 0; j <= 18; j++) close(Math.abs(off[j]), Math.min(Math.abs(j - k) * c, 1000 - Math.abs(j - k) * c), 1e-6, `第 ${j} 條`);
});

test('游標尺：不在格點上的位置取最對齊的刻線，誤差不超過半格', () => {
  const rng = M.mulberry32(7);
  for (const N of [20, 50]) {
    const c = M.VERNIER[N].cUm;
    for (let i = 0; i < 2000; i++) {
      const x = -3000 + rng() * 60000;
      const r = M.vernierRead(x, N);
      assert.ok(Math.abs(r.mismatchUm) <= c / 2 + 1e-9);
      assert.ok(r.k >= 0 && r.k < N);
      assert.strictEqual(Math.abs(r.valueUm % c), 0);
      // 與直接四捨五入到格點相同
      assert.strictEqual(r.valueUm, (Math.round(x / c) * c) || 0);
    }
  }
});

test('游標尺：負的零點誤差（游標 0 在主尺 0 的左邊）', () => {
  let r = M.vernierRead(-150, 20);
  assert.strictEqual(r.mainMm, -1); assert.strictEqual(r.k, 17); assert.strictEqual(r.valueUm, -150);
  close(-(20 - r.k) * 50, -150, 0, '−(N − k)·c');
  r = M.vernierRead(-40, 50);
  assert.strictEqual(r.mainMm, -1); assert.strictEqual(r.k, 48); assert.strictEqual(r.valueUm, -40);
});

test('零點誤差修正：讀數 R = L + e，修正後 L = R − e', () => {
  const rng = M.mulberry32(11);
  for (const N of [20, 50]) for (const kind of ['outer', 'inner', 'depth']) for (let i = 0; i < 200; i++) {
    const it = M.makeVernierItem(rng, N, kind, true);
    assert.strictEqual(it.readingUm, it.sizeUm + it.zeroUm);
    assert.strictEqual(M.vernierRead(it.readingUm, N).valueUm, it.readingUm, '讀數在格點上');
    assert.strictEqual(it.readingUm - it.zeroUm, M.expectedUm(it, false));
    assert.strictEqual(M.expectedUm(it, true), it.zeroUm);
    assert.ok(it.zeroUm !== 0 && Math.abs(it.zeroUm) <= (N === 20 ? 300 : 200));
    assert.strictEqual(Math.abs(it.zeroUm % M.VERNIER[N].cUm), 0);
    const r = M.V_RANGE[kind];
    assert.ok(it.sizeUm >= r[0] && it.sizeUm <= r[1]);
  }
});

// ---------------- 螺旋測微器 ----------------
test('螺旋測微器讀數：套筒（含半毫米）＋套管格數 × 0.01 mm', () => {
  const cases = [
    // 讀數 µm, 套筒 µm, 半毫米, 格數（整）, 十分之一格
    [2874, 2500, true, 37, 4], [2374, 2000, false, 37, 4], [500, 500, true, 0, 0], [499, 0, false, 49, 9],
    [12, 0, false, 1, 2], [7005, 7000, false, 0, 5], [14999, 14500, true, 49, 9], [10, 0, false, 1, 0]
  ];
  for (const [x, sl, half, d, t] of cases) {
    const r = M.microRead(x);
    assert.strictEqual(r.sleeveUm, sl, `套筒 x=${x}`);
    assert.strictEqual(r.halfShown, half, `半毫米 x=${x}`);
    assert.strictEqual(r.divInt, d, `格數 x=${x}`);
    assert.strictEqual(r.tenth, t, `估讀 x=${x}`);
    assert.strictEqual(r.valueUm, x);
    assert.strictEqual(r.sleeveUm + r.divInt * 10 + r.tenth, x);
  }
});

test('螺旋測微器：負的零點誤差 −0.008 mm（套管 49.2 格、蓋過 0 刻線一點）', () => {
  const r = M.microRead(-8);
  assert.strictEqual(r.sleeveUm, -500); close(r.div, 49.2, 1e-9); assert.strictEqual(r.valueUm, -8);
  close(-(50 - r.div) * 0.01, -0.008, 1e-12);
});

test('螺旋測微器：套管轉一圈前進 0.5 mm（螺距），一圈 50 格', () => {
  close(M.thimbleTurns(500), 1, 1e-12);
  close(M.thimbleTurns(25000), 50, 1e-12);
  close(M.MICRO.pitch / M.MICRO.divisions, M.MICRO.c, 1e-15);
});

test('螺旋測微器的題目：尺寸在 0.001 mm 格點、範圍內，零點誤差 2–15 µm', () => {
  const rng = M.mulberry32(3);
  for (const kind of ['wire', 'sheet', 'ball']) for (let i = 0; i < 300; i++) {
    const it = M.makeMicroItem(rng, kind, true);
    assert.ok(Number.isInteger(it.sizeUm) && Number.isInteger(it.zeroUm));
    const r = M.M_RANGE[kind];
    assert.ok(it.sizeUm >= r[0] && it.sizeUm <= r[1]);
    assert.ok(Math.abs(it.zeroUm) >= 2 && Math.abs(it.zeroUm) <= 15);
    assert.ok(it.readingUm < M.MICRO.rangeMm * 1000);
  }
  assert.strictEqual(M.makeMicroItem(rng, 'wire', false).zeroUm, 0);
});

// ---------------- 輸入與核對 ----------------
test('讀數輸入：全形數字、逗號、mm、各種負號', () => {
  let p = M.parseReading('２３.４５');
  assert.strictEqual(p.um, 23450); assert.strictEqual(p.decimals, 2);
  p = M.parseReading(' 23,40 mm '); assert.strictEqual(p.um, 23400); assert.strictEqual(p.decimals, 2);
  p = M.parseReading('−0.15'); assert.strictEqual(p.um, -150);
  p = M.parseReading('.5'); assert.strictEqual(p.um, 500); assert.strictEqual(p.decimals, 1);
  p = M.parseReading('12.'); assert.strictEqual(p.um, 12000); assert.strictEqual(p.decimals, 0);
  assert.strictEqual(M.parseReading(''), null);
  assert.strictEqual(M.parseReading('abc'), null);
  assert.strictEqual(M.parseReading('1.2.3'), null);
  p = M.parseReading('2.8745'); assert.strictEqual(p.exactUm, false);
});

test('游標尺核對：數值與位數都要對（末位的 0 也要寫）', () => {
  assert.ok(M.checkVernier('23.45', 23450).ok);
  let r = M.checkVernier('23.4', 23400);
  assert.ok(r.valueOk && !r.formatOk && !r.ok, '23.4 少寫末位的 0');
  assert.ok(M.checkVernier('23.40', 23400).ok);
  r = M.checkVernier('23.450', 23450); assert.ok(r.valueOk && !r.formatOk, '多寫一位');
  assert.ok(!M.checkVernier('23.50', 23450).valueOk);
  assert.ok(M.checkVernier('-0.15', -150).ok);
  assert.ok(M.checkVernier('0.00', 0).ok);
  assert.ok(!M.checkVernier('0', 0).ok);
});

test('螺旋測微器核對：估讀位容許 ±0.001 mm，要寫到 3 位小數', () => {
  let r = M.checkMicro('2.874', 2874); assert.ok(r.ok && r.exact);
  r = M.checkMicro('2.875', 2874); assert.ok(r.ok && !r.exact);
  r = M.checkMicro('2.873', 2874); assert.ok(r.ok && !r.exact);
  assert.ok(!M.checkMicro('2.876', 2874).valueOk);
  r = M.checkMicro('2.87', 2874); assert.ok(!r.valueOk);
  r = M.checkMicro('2.870', 2870); assert.ok(r.ok);
  r = M.checkMicro('2.87', 2870); assert.ok(r.valueOk && !r.formatOk, '沒有估讀位');
  assert.ok(!M.checkMicro('2.374', 2874).valueOk, '漏看半毫米刻線差 0.5 mm');
  assert.ok(M.checkMicro('-0.008', -8).ok);
});

// ---------------- 四捨五入與有效數字 ----------------
test('四捨五入：避開浮點誤差（2.0775 → 2.078）', () => {
  assert.strictEqual(M.roundHalfUp(2.0775, 3), 2.078);
  assert.strictEqual(M.roundHalfUp(8.31 / 4, 3), 2.078);
  assert.strictEqual(M.roundHalfUp(1.005, 2), 1.01);
  assert.strictEqual(M.roundHalfUp(2.07749, 3), 2.077);
  assert.strictEqual(M.roundHalfUp(-2.0775, 3), -2.078);
  assert.strictEqual(M.roundHalfUp(165.8333, 2), 165.83);
  assert.strictEqual(M.roundHalfUp(14.575, 2), 14.58);
  assert.strictEqual(M.roundHalfUp(187.625, 2), 187.63);
  assert.strictEqual(M.fixed(65.2, 4), '65.2000');
  assert.strictEqual(M.fixed(-0.0001, 2), '0.00');
});

test('有效數字的判定（含邊界情況）', () => {
  const n = s => M.sigFigs(s).n;
  assert.strictEqual(n('16.72'), 4);
  assert.strictEqual(n('2009.1704'), 8);
  assert.strictEqual(n('0.0049'), 2);
  assert.strictEqual(n('173.400'), 6);
  assert.strictEqual(n('23.40'), 4);
  assert.strictEqual(n('0.150'), 3);
  assert.strictEqual(n('0.00'), 0);
  assert.strictEqual(n('-0.15'), 2);
  assert.strictEqual(n('100.'), 3);
  const a = M.sigFigs('7000');
  assert.ok(a.ambiguous && a.min === 1, '7000 無法判斷');
  assert.ok(!M.sigFigs('7001').ambiguous);
  assert.strictEqual(M.sigFigs('abc'), null);
});

test('不確定度取法：無條件進位取 2 位有效數字，第 3 位是 0 就捨去（講義的例子）', () => {
  const U = u => M.roundUncertainty(u).str;
  assert.strictEqual(U(0.0131), '0.014');      // 單擺週期
  assert.strictEqual(U(0.1748), '0.18');
  assert.strictEqual(U(1.0775), '1.1');
  assert.strictEqual(U(0.76525), '0.77');
  assert.strictEqual(U(1.44995), '1.5');
  assert.strictEqual(U(0.0028867), '0.0029');  // B 類 0.01/(2√3)
  assert.strictEqual(U(0.57735), '0.58');
  assert.strictEqual(U(0.1417), '0.15');
  assert.strictEqual(U(0.1407), '0.14');       // 第 3 位是 0：捨去
  assert.strictEqual(U(0.4101), '0.41');
  assert.strictEqual(U(0.14), '0.14');         // 剛好 2 位：不進位
  assert.strictEqual(U(0.29), '0.29');         // 浮點 0.28999… 也要得到 0.29
  assert.strictEqual(U(0.0010233), '0.0011');
  assert.strictEqual(U(0.000783), '0.00079');
  assert.strictEqual(U(0.995), '1.0');         // 進位到下一個數量級
  assert.strictEqual(U(9.95), '10');
  assert.strictEqual(U(23.1), '24');
  assert.strictEqual(M.roundUncertainty(0), null);
  assert.strictEqual(M.roundUncertainty(NaN), null);
});

test('測量結果：平均值四捨五入到與不確定度末位一致（講義的例子）', () => {
  let r = M.formatResult(2.0775, 0.0262995 / 2);
  assert.strictEqual(r.best, '2.078'); assert.strictEqual(r.unc, '0.014'); assert.strictEqual(r.sig, 4);
  r = M.formatResult(165.8333, 0.5244 / 3); assert.strictEqual(r.best + ' ± ' + r.unc, '165.83 ± 0.18');
  r = M.formatResult(165.8333, 3.2326 / 3); assert.strictEqual(r.best + ' ± ' + r.unc, '165.8 ± 1.1');
  r = M.formatResult(65.20, 0.01 / (2 * Math.sqrt(3))); assert.strictEqual(r.best + ' ± ' + r.unc, '65.2000 ± 0.0029');
  r = M.formatResult(598, Math.hypot(0.29, 0.29)); assert.strictEqual(r.best + ' ± ' + r.unc, '598.00 ± 0.41');
  r = M.formatResult(14.575, Math.hypot(0.18, 0.29)); assert.strictEqual(r.best + ' ± ' + r.unc, '14.58 ± 0.35');
  r = M.formatResult(0.14978, 0.00307 / 3); assert.strictEqual(r.best + ' ± ' + r.unc, '0.1498 ± 0.0011');
  assert.strictEqual(M.formatResult(1, 0), null);
});

// ---------------- 統計 ----------------
test('平均值、母體標準差（n）、樣本標準差（n − 1）', () => {
  const a = [45, 50, 55, 60, 65, 70, 75];
  close(M.mean(a), 60, 1e-12);
  close(M.popStd(a), 10, 1e-12);
  close(M.sampleStd(a), Math.sqrt(700 / 6), 1e-12);
  assert.strictEqual(M.sampleStd(a).toFixed(2), '10.80');
  const T = [2.10, 2.08, 2.09, 2.04];
  close(M.mean(T), 2.0775, 1e-12);
  close(M.sampleStd(T), 0.0262995, 1e-7);
  close(M.stdError(T), 0.0262995 / 2, 1e-7);
  assert.ok(isNaN(M.sampleStd([3])));
  close(M.popStd([3]), 0, 0);
});

test('標準差的極限情況：全部相同 → 0；平移不變、縮放成比例', () => {
  close(M.sampleStd([5, 5, 5, 5]), 0, 0);
  const a = [1.2, 3.4, 2.2, 5.1, 0.7], b = a.map(x => x + 1000), c = a.map(x => 3 * x);
  close(M.sampleStd(b), M.sampleStd(a), 1e-9);
  close(M.sampleStd(c), 3 * M.sampleStd(a), 1e-12);
  close(M.sampleStd(a) * M.sampleStd(a) * 4, M.popStd(a) * M.popStd(a) * 5, 1e-12, 's²(n−1) = σ²n');
});

test('B 類與組合不確定度（講義：0.18 與 0.29 組合成 0.35）', () => {
  close(M.typeB(1), 0.28867513, 1e-8);
  close(M.typeB(0.02), 0.0057735, 1e-7);
  close(M.combine(0.18, 0.29), 0.341321, 1e-6);
  assert.strictEqual(M.roundUncertainty(M.combine(0.18, 0.29)).str, '0.35');
  assert.strictEqual(M.roundUncertainty(M.combine(0.14, 0.29)).str, '0.33');
  close(M.combine(0, 0.29), 0.29, 1e-15);
});

test('要量幾次：s/√n ≤ 目標', () => {
  assert.strictEqual(M.nForTarget(0.05, 0.01), 25);
  assert.strictEqual(M.nForTarget(0.051, 0.01), 27);
  assert.strictEqual(M.nForTarget(0.001, 0.01), 2);
  const n = M.nForTarget(0.05, 0.01);
  assert.ok(0.05 / Math.sqrt(n) <= 0.01 + 1e-12 && 0.05 / Math.sqrt(n - 1) > 0.01);
});

test('直方圖：各組次數總和 = 數據個數，組界在格點上', () => {
  const rng = M.mulberry32(5);
  const v = Array.from({ length: 500 }, () => 25 + 0.05 * M.gaussian(rng));
  const h = M.histogram(v, 0.02, 0);
  assert.strictEqual(h.reduce((s, b) => s + b.count, 0), 500);
  h.forEach(b => { close(b.x1 - b.x0, 0.02, 1e-12); close(Math.round(b.x0 / 0.02) * 0.02, b.x0, 1e-9); });
});

// ---------------- 模擬讀數與統計 ----------------
test('種子相同 → 讀數完全相同（可重現）', () => {
  const run = seed => { const r = M.mulberry32(seed); return Array.from({ length: 20 }, () => M.simulateReading(12345, 'v50', 0.03, 0, r)); };
  assert.deepStrictEqual(run(42), run(42));
  assert.notDeepStrictEqual(run(42), run(43));
});

test('沒有隨機誤差：每次讀數相同，取到儀器的格點（游標尺 0.05／0.02 mm、測微器 0.001 mm）', () => {
  const r = M.mulberry32(1);
  for (let i = 0; i < 10; i++) {
    assert.strictEqual(M.simulateReading(12345, 'v20', 0, 0, r), 12350);
    assert.strictEqual(M.simulateReading(12345, 'v50', 0, 0, r), 12340);
    assert.strictEqual(M.simulateReading(12345, 'micro', 0, 0, r), 12345);
    assert.strictEqual(M.simulateReading(12345, 'micro', 0, 0.1, r), 12445);
  }
});

test('大量測量：平均值 → 真值 + 系統誤差，樣本標準差 → σ，標準誤差 ∝ 1/√n', () => {
  const r = M.mulberry32(2026);
  const xs = Array.from({ length: 40000 }, () => M.simulateReading(10000, 'micro', 0.02, 0.05, r) / 1000);
  close(M.mean(xs), 10.05, 0.0006);
  close(M.sampleStd(xs), 0.02, 0.0005);
  const s = M.summarize(xs.slice(0, 100).map(x => Math.round(x * 1000)), 'micro', 10, 'A');
  close(s.uA, s.s / 10, 1e-12);
  // 平均值的標準差 ≈ σ/√n（把 40000 筆分成 400 組、每組 100 筆）
  const means = [];
  for (let g = 0; g < 400; g++) means.push(M.mean(xs.slice(g * 100, g * 100 + 100)));
  close(M.sampleStd(means), 0.02 / 10, 0.0003);
});

test('summarize：全部相同、精密但不準確、準確但不精密', () => {
  let s = M.summarize([12350, 12350, 12350], 'v20', 12.345, 'AB');
  assert.ok(s.allSame); close(s.s, 0, 0); close(s.uA, 0, 0);
  close(s.u, M.typeB(0.05), 1e-15);
  assert.strictEqual(s.result.unc, '0.015'); assert.strictEqual(s.result.best, '12.350');
  assert.ok(s.precise && s.accurate && s.contains);
  // 精密但不準確：系統誤差 0.20 mm、隨機誤差很小
  const r = M.mulberry32(9);
  let rd = Array.from({ length: 20 }, () => M.simulateReading(12000, 'v50', 0.005, 0.2, r));
  s = M.summarize(rd, 'v50', 12, 'AB');
  assert.ok(s.precise && !s.accurate && !s.contains);
  // 準確但不精密
  rd = Array.from({ length: 40 }, () => M.simulateReading(12000, 'v50', 0.2, 0, r));
  s = M.summarize(rd, 'v50', 12, 'AB');
  assert.ok(!s.precise && s.accurate);
  // 只有 1 筆：沒有標準差、沒有結果
  s = M.summarize([12000], 'micro', 12, 'AB');
  assert.ok(isNaN(s.s) && s.result === null);
});

test('組合不確定度不會小於 B 類；A 類模式等於 s/√n', () => {
  const r = M.mulberry32(77);
  for (const k of ['v20', 'v50', 'micro']) {
    const rd = Array.from({ length: 30 }, () => M.simulateReading(8000, k, 0.01, 0, r));
    const ab = M.summarize(rd, k, 8, 'AB'), a = M.summarize(rd, k, 8, 'A');
    assert.ok(ab.u >= ab.uB - 1e-15);
    close(a.u, a.s / Math.sqrt(30), 1e-15);
    close(ab.u * ab.u, a.u * a.u + ab.uB * ab.uB, 1e-15);
  }
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗！' : ''));
