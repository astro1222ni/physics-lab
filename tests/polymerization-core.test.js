// 以 Node 執行：node tests/polymerization-core.test.js
'use strict';
const assert = require('assert');
const P = require('../js/polymerization-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`); }
function rel(a, b, tol, msg) { near(a / b, 1, tol, (msg || '') + `（${a} 對 ${b}）`); }
function runTo(s, t) { while (s.t < t - 1e-9) P.step(s, Math.min(1, t - s.t)); return s; }
function runToConv(s, x) { while (P.stats(s).conv < x && !P.ended(s)) P.step(s, 0.25); return P.stats(s); }
/** 加成聚合的單體守恆：未反應單體 + 所有鏈（含還在長的自由基）的單體數 = N */
function addBalance(s) { let u = s.NM; s.dead.forEach(n => { u += n; }); s.rad.forEach(n => { u += n; }); return u; }
/** 縮合聚合逐個分子核對端基與計數 */
function condCheck(s) {
  let u = 0, A = 0, B = 0, mix = 0, s2 = 0, w = 0;
  for (let i = 0; i < s.M; i++) {
    const n = s.n[i], a = s.a[i], b = s.b[i];
    assert.strictEqual(a + b, 2, '每個線形分子剛好兩個端基');
    if (!s.ab) assert.ok(n % 2 === 0 ? (a === 1 && b === 1) : (a === 2 || b === 2), '交替鏈：偶數個單體兩端不同、奇數個兩端相同');
    u += n; A += a; B += b; mix += a * b; s2 += n * n; w += s.ww[i];
    assert.strictEqual(s.ww[i], n - 1, 'Fenwick 權重 = 鍵數');
  }
  assert.strictEqual(u, s.N, '單體數守恆');
  assert.strictEqual(A, s.NA); assert.strictEqual(B, s.NB); assert.strictEqual(mix, s.mix); assert.strictEqual(s2, s.s2);
  assert.strictEqual(w, s.L, '鍵的總數');
  assert.strictEqual(s.L + s.M, s.N, '每多一個鍵就少一個分子');
  assert.strictEqual(s.NA0 - s.NA, s.L); assert.strictEqual(s.NB0 - s.NB, s.L);
  assert.strictEqual(s.W + s.Wout, s.L, '水的守恆：生成的水 = 鍵數');
}

test('莫耳質量（IUPAC 慣用原子量）：苯乙烯 104.15、MMA 100.12、水 18.015、耐綸-66 重複單位 226.32、PET 192.17、PLA 72.06', function () {
  near(P.M_H2O, 18.015, 0.001);
  near(P.ADD_MON.styrene.M, 104.15, 0.01); near(P.ADD_MON.mma.M, 100.12, 0.01);
  near(P.ADD_MON.ethylene.M, 28.05, 0.01); near(P.ADD_MON.vinylchloride.M, 62.50, 0.01);
  near(P.ADD_MON.tfe.M, 100.02, 0.01); near(P.ADD_MON.propylene.M, 42.08, 0.01);
  near(P.COND.nylon66.unit, 226.32, 0.01); near(P.COND.pet.unit, 192.17, 0.01); near(P.COND.pla.unit, 72.06, 0.01);
  near(P.COND.nylon66.A.M, 116.21, 0.01); near(P.COND.nylon66.B.M, 146.14, 0.01);
});

test('加成聚合：單體守恆（結合與歧化，跑到結束）', function () {
  ['comb', 'disp'].forEach(function (term) {
    const s = P.createAdd({ init: 0.02, term: term, N: 300000, seed: 11 });
    runTo(s, 50); assert.strictEqual(addBalance(s), s.N);
    while (!P.ended(s)) P.step(s, 20);
    assert.strictEqual(addBalance(s), s.N);
    let u = 0; s.dead.forEach(n => { u += n; });
    near(s.s1, u, 0, '聚合物單體數'); near(s.nPoly, s.dead.length, 0, '結束時沒有自由基');
  });
});

test('加成聚合：自由基數、轉化率與穩定態解析式一致（−ln(1 − x) = 2kp[R•]0/kd·(1 − e^(−kd t/2))）', function () {
  const I = 0.005, s = P.createAdd({ init: I, seed: 21 });
  const th = P.addTheory(I);
  let sumR = 0, nR = 0;
  for (let t = 20; t <= 60; t += 1) { runTo(s, t); sumR += s.rad.length; nR++; }
  rel(sumR / nR / s.N, th.R * Math.exp(-P.KADD.kd * 40 / 2), 0.12, '平均自由基濃度');
  [60, 150, 400].forEach(function (t) { runTo(s, t); rel(P.stats(s).conv, P.addConv(I, t), 0.03, 't = ' + t + ' s 的轉化率'); });
});

test('加成聚合：起始劑耗盡（dead-end）的極限轉化率與解析式一致', function () {
  [0.0002, 0.0005, 0.002].forEach(function (I) {
    const s = P.createAdd({ init: I, seed: 31 });
    while (!P.ended(s)) P.step(s, 50);
    near(P.stats(s).conv, P.addTheory(I).xDeadEnd, 0.02, '[I] = ' + I);
  });
});

test('加成聚合：低轉化率時結合終止 Xn ≈ 2ν、Đ ≈ 1.5；歧化終止 Xn ≈ ν、Đ ≈ 2', function () {
  const I = 0.005, nu = P.addTheory(I, 0.95).nu;
  let s = P.createAdd({ init: I, term: 'comb', seed: 41 });
  let st = runToConv(s, 0.10);
  rel(st.Xn, 2 * nu, 0.1, '結合'); near(st.PDI, 1.5, 0.06, '結合 Đ');
  s = P.createAdd({ init: I, term: 'disp', seed: 42 });
  st = runToConv(s, 0.10);
  rel(st.Xn, nu, 0.1, '歧化'); near(st.PDI, 2.0, 0.08, '歧化 Đ');
});

test('加成聚合：起始劑變 4 倍，聚合度約變一半（ν ∝ [I]^(−1/2)），速率約變 2 倍', function () {
  const a = P.createAdd({ init: 0.002, seed: 51 }), b = P.createAdd({ init: 0.008, seed: 52 });
  const xa = runToConv(a, 0.1), xb = runToConv(b, 0.1);
  rel(xa.Xn / xb.Xn, 2, 0.1, 'Xn 比');
  rel(a.t / b.t, 2, 0.1, '到 10% 轉化率的時間比');
});

test('加成聚合：液體單體的體積收縮（MMA 全部聚合收縮 1 − 0.944/1.18 = 20%）', function () {
  const s = P.createAdd({ mon: 'mma', init: 0.05, N: 200000, seed: 61 });
  while (!P.ended(s)) P.step(s, 50);
  near(P.stats(s).shrink, 1 - 0.944 / 1.18, 1e-3);
  near(P.stats(P.createAdd({ mon: 'styrene' })).shrink, 0, 1e-12, '還沒聚合不收縮');
  assert.strictEqual(P.stats(P.createAdd({ mon: 'ethylene' })).shrink, null, '氣體單體不算');
});

test('縮合聚合：端基、鍵數、水的守恆（AA＋BB、AB；除水與密閉；含大量水解）', function () {
  [{ pair: 'nylon66', dry: true, q: 1 }, { pair: 'pet', dry: false, q: 1.1 }, { pair: 'pla', dry: false }, { pair: 'nylon66', dry: false, q: 0.8 }].forEach(function (o) {
    const s = P.createCond(Object.assign({ N: 20000, seed: 71 }, o));
    runTo(s, 5); condCheck(s);
    runTo(s, 120); condCheck(s);
    if (!o.dry) assert.ok(s.nRev > 1000, '密閉時有水解');
  });
});

test('縮合聚合：卡羅瑟斯方程式（計數上恆等，r = 1 與 r ≠ 1）', function () {
  [1, 0.9, 1.25, 2].forEach(function (q) {
    const s = P.createCond({ pair: 'nylon66', q: q, N: 20000, seed: 81 });
    [10, 60, 400].forEach(function (t) {
      runTo(s, t);
      const st = P.stats(s);
      near(st.Xn, P.carothers(st.r, st.conv), 1e-9, 'q = ' + q + ', t = ' + t);
    });
  });
  // 比例 2:1 反應完：Xn → 3
  const s = P.createCond({ pair: 'nylon66', q: 2, seed: 82 });
  while (P.pMin(s) < 0.9995) P.step(s, 20);
  near(P.stats(s).Xn, 3, 0.01, 'q = 2');
});

test('縮合聚合：除水、r = 1 時 1/(1 − p) = 1 + k[A]0·t（Flory 1939 的直線）', function () {
  const s = P.createCond({ pair: 'nylon66', seed: 91 });
  [20, 60].forEach(function (t) { runTo(s, t); rel(1 / (1 - P.pMin(s)), 1 + P.KCOND.k * t, 0.05, 't = ' + t); });
});

test('縮合聚合：密閉的平衡（K = 1 → p = 0.5、Xn = 2；耐綸 K = 300 → Xn = 1 + √K）', function () {
  near(P.peqClosed(1, 1, 1), 0.5, 1e-12);
  near(P.peqClosed(300, 1, 1), Math.sqrt(300) / (1 + Math.sqrt(300)), 1e-12);
  const x = P.peqClosed(4, 1, 1.5);
  near(x * x / ((1 - x) * (1.5 - x)), 4, 1e-9, '一般情形');
  [['pet', 0.5], ['pla', 0.5], ['nylon66', Math.sqrt(300) / (1 + Math.sqrt(300))]].forEach(function (c) {
    const s = P.createCond({ pair: c[0], dry: false, seed: 101 });
    runTo(s, 150);
    let sp = 0; for (let k = 0; k < 20; k++) { runTo(s, 150 + 5 * (k + 1)); sp += P.pMin(s); }
    near(sp / 20, c[1], 0.004, c[0]);
    near(P.stats(s).Xn, 1 / (1 - c[1]), c[0] === 'nylon66' ? 0.8 : 0.03, c[0] + ' Xn');
  });
});

test('縮合聚合：Flory 最可能分布（數量分率 (1 − p)p^(x−1)、Đ ≈ 1 + p）', function () {
  // 四份樣品平均（每份 6 萬個單體，p ≈ 0.9 時約 6000 個分子）
  const acc = { 1: 0, 2: 0, 3: 0, 5: 0 };
  let s, p, pdi = 0;
  for (let k = 0; k < 4; k++) {
    s = P.createCond({ pair: k % 2 ? 'nylon66' : 'pla', seed: 111 + k });
    while (P.pMin(s) < 0.9) P.step(s, 0.05);
    p = P.pMin(s);
    const cnt = {};
    for (let i = 0; i < s.M; i++) cnt[s.n[i]] = (cnt[s.n[i]] || 0) + 1;
    [1, 2, 3, 5].forEach(function (x) { acc[x] += cnt[x] / s.M / P.floryNumber(x, p) / 4; });
    pdi += P.stats(s).PDI / (1 + p) / 4;
  }
  [1, 2, 3, 5].forEach(function (x) { near(acc[x], 1, 0.05, x + ' 聚體（模擬 ÷ 理論）'); });
  near(pdi, 1, 0.03, 'Đ ÷ (1 + p)');
  // 直方圖積分 = 1
  const h = P.histogram(s, 40, 0, 4); let sum = 0; for (let k = 0; k < 40; k++) sum += h[k] * 0.1;
  near(sum, 1, 1e-9);
});

test('縮合聚合：質量守恆（原料 = 瓶內 + 收集的水；Mn = 瓶內聚合物質量 ÷ 分子的莫耳數）', function () {
  const s = P.createCond({ pair: 'nylon66', q: 1.05, seed: 121 });
  runTo(s, 200);
  const st = P.stats(s);
  near(st.mFeed, 0.1 * P.COND.nylon66.A.M + s.nBB / s.nAA * 0.1 * P.COND.nylon66.B.M, 1e-9);
  near(st.mFlask + st.waterOut, st.mFeed, 1e-9);
  near(st.mPolymer + st.waterIn, st.mFlask, 1e-9);
  near(st.Mn, st.mPolymer / st.molMolecules, 1e-6);
  near(st.waterMax, 0.2 * 18.015, 1e-3, '理論最多的水');
});

console.log(process.exitCode ? '有測試失敗' : '全部通過（' + passed + ' 項）');
