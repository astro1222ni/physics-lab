// 以 Node 執行：node tests/perceptron-core.test.js
'use strict';
const assert = require('assert');
const P = require('../js/perceptron-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}，得到 ${a}`);
const G = P.GRID;
/** 隨機的格點資料（可能可分也可能不可分） */
function randomPoints(rand, n) {
  const pts = [], used = {};
  while (pts.length < n) {
    const gx = Math.round((rand() * 2 - 1) * G), gy = Math.round((rand() * 2 - 1) * G);
    if (used[gx + ',' + gy]) continue;
    used[gx + ',' + gy] = 1;
    pts.push(P.pt(gx, gy, rand() < 0.5 ? 1 : -1));
  }
  return pts;
}
/** 隨機的可分資料：用一條隨機的線（不要求間隔），兩類都要有 */
function randomSeparable(rand, n) {
  for (;;) {
    const a = rand() * 2 - 1, b = rand() * 2 - 1, c = (rand() * 2 - 1) * 0.5;
    const pts = randomPoints(rand, n).map(p => P.pt(p.gx, p.gy, a * p.x + b * p.y + c > 0 ? 1 : -1));
    const np = pts.filter(p => p.c > 0).length;
    if (np > 0 && np < n && P.maxMargin(pts, true).separable) return pts;
  }
}
/** 獨立的對照算法：Gilbert（1966）迭代法求原點到 conv{y·x̃} 的距離（和核心的「枚舉單純形」完全不同的做法） */
function gilbertDistance(points, bias) {
  const Z = points.map(p => [p.c * p.x, p.c * p.y, p.c * (bias ? 1 : 0)]);
  const d3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  let x = Z[0].slice();
  for (let it = 0; it < 200000; it++) {
    let s = Z[0], sm = Infinity;
    Z.forEach(z => { const v = d3(z, x); if (v < sm) { sm = v; s = z; } });
    const xx = d3(x, x);
    if (xx - sm <= 1e-13 * Math.max(1, xx)) break;     // 對偶間隙夠小
    const dx = [x[0] - s[0], x[1] - s[1], x[2] - s[2]], dd = d3(dx, dx);
    if (dd === 0) break;
    const t = Math.max(0, Math.min(1, d3(x, dx) / dd));
    x = [x[0] - t * dx[0], x[1] - t * dx[1], x[2] - t * dx[2]];
    if (d3(x, x) < 1e-20) break;
  }
  // 可分 ⇔ 最近點 x 本身就是一個分開的方向（每個 z·x > 0）
  const ok = Z.every(z => d3(z, x) > 1e-12);
  return { dist: Math.sqrt(d3(x, x)), separable: ok };
}

/** 第二個對照算法：硬間隔支持向量機的對偶座標上升法（min ‖w‖²，y·(w·x̃) ≥ 1；γ = 1/‖w‖）。只在可分時使用 */
function dualMargin(points, bias) {
  const Z = points.map(p => [p.c * p.x, p.c * p.y, p.c * (bias ? 1 : 0)]);
  const d3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const al = Z.map(() => 0);
  let w = [0, 0, 0];
  for (let sweep = 0; sweep < 200000; sweep++) {
    let viol = 0;
    for (let i = 0; i < Z.length; i++) {
      const z = Z[i], q = d3(z, z);
      if (q === 0) continue;
      const g = 1 - d3(z, w);
      const na = Math.max(0, al[i] + g / q), d = na - al[i];
      if (al[i] > 0 || g > 0) viol = Math.max(viol, Math.abs(d) * q);
      if (d) { w = [w[0] + d * z[0], w[1] + d * z[1], w[2] + d * z[2]]; al[i] = na; }
    }
    if (viol < 1e-13) break;
  }
  return 1 / Math.sqrt(d3(w, w));
}

console.log('學習規則');
test('AND（零初始、固定順序、η = 1）前兩步的權重與手算相同：分錯時 w ← w + η·y·x、b ← b + η·y', () => {
  const t = new P.Trainer(P.gate('and'), { eta: 1 });
  let r = t.step();   // (0,0) → (−0.6, −0.6)，y = −1，z = 0（在線上，算分錯）
  assert.ok(r.wrong);
  near(r.after[0], 0.6, 1e-12); near(r.after[1], 0.6, 1e-12); near(r.after[2], -1, 1e-12);
  r = t.step();       // (0,1) → (−0.6, 0.6)，y = −1，z = −0.36 + 0.36 − 1 = −1 < 0：分對，不變
  assert.ok(!r.wrong);
  near(r.z, -1, 1e-12);
  near(t.weights()[2], -1, 1e-12);
});
test('和 w ← w + η(t − ŷ)x（t ∈ {0, 1}、ŷ = 1 若 z > 0）是同一條規則：隨機初始、隨機資料逐步比對 200 組', () => {
  const rand = P.rng(42);
  for (let k = 0; k < 200; k++) {
    const pts = randomPoints(rand, 6 + Math.floor(rand() * 10));
    const eta = 0.05 + rand() * 2;
    const t = new P.Trainer(pts, { eta: eta, init: 'random', seed: 1 + k });
    let w = t.weights().slice();
    for (let s = 0; s < 60; s++) {
      const r = t.step();
      if (!r) break;
      const p = r.p, tt = p.c > 0 ? 1 : 0;
      const z = w[0] * p.x + w[1] * p.y + w[2];
      const yhat = z > 0 ? 1 : 0;
      const d = eta * (tt - yhat);
      w = [w[0] + d * p.x, w[1] + d * p.y, w[2] + d];
      const a = t.weights();
      for (let j = 0; j < 3; j++) near(a[j], w[j], 1e-9, `第 ${k} 組第 ${s} 步`);
    }
  }
});
test('零初始時學習率只是把權重整個放大：w(η) = η·w(1)，更新次數、輪數都一樣（含打亂順序、不用偏差）', () => {
  const rand = P.rng(7);
  for (let k = 0; k < 150; k++) {
    const pts = randomSeparable(rand, 5 + Math.floor(rand() * 15));
    const order = k % 2 ? 'shuffle' : 'fixed';
    const bias = k % 5 !== 0;
    const a = P.train(pts, { eta: 1, order: order, seed: 3 + k, bias: bias });
    for (const eta of [0.01, 0.37, 10]) {
      const b = P.train(pts, { eta: eta, order: order, seed: 3 + k, bias: bias });
      assert.strictEqual(b.updates, a.updates);
      assert.strictEqual(b.epochs, a.epochs);
      assert.deepStrictEqual(b.S, a.S);
      for (let j = 0; j < 3; j++) near(b.w[j], eta * a.w[j], 1e-9);
    }
  }
});

console.log('收斂與 Novikoff 定理');
test('線性可分的資料一定收斂，收斂後沒有任何點分錯（300 組，各種順序、初始權重、學習率）', () => {
  const rand = P.rng(2026);
  for (let k = 0; k < 300; k++) {
    const pts = randomSeparable(rand, 3 + Math.floor(rand() * 30));
    const cfg = { eta: [0.01, 0.3, 1, 5][k % 4], init: k % 3 ? 'zero' : 'random', order: k % 2 ? 'shuffle' : 'fixed', seed: 1 + k, maxEpochs: 100000 };
    const r = P.train(pts, cfg);
    assert.ok(r.converged, `第 ${k} 組沒有收斂`);
    assert.strictEqual(P.mistakes(r.w, pts, true), 0);
    assert.strictEqual(r.errs[r.errs.length - 1], 0);
  }
});
test('零初始時更新次數 k ≤ (R/γ)²（Novikoff），300 組可分資料、固定與打亂順序都成立', () => {
  const rand = P.rng(1962);
  let worst = 0;
  for (let k = 0; k < 300; k++) {
    const pts = randomSeparable(rand, 3 + Math.floor(rand() * 25));
    const mm = P.maxMargin(pts, true);
    const r = P.train(pts, { eta: 1, order: k % 2 ? 'shuffle' : 'fixed', seed: k + 1, maxEpochs: 100000 });
    assert.ok(r.updates <= mm.bound + 1e-9, `k = ${r.updates} 超過上界 ${mm.bound}`);
    worst = Math.max(worst, r.updates / mm.bound);
  }
  assert.ok(worst <= 1);
});
test('上界剛好用完的例子：(1, 0) 是 +1、(−1, 0) 是 −1 → R = √2、γ = 1、(R/γ)² = 2，而且真的更新 2 次', () => {
  const pts = [P.pt(20, 0, 1), P.pt(-20, 0, -1)];
  const mm = P.maxMargin(pts, true);
  near(mm.R, Math.SQRT2, 1e-12); near(mm.gamma, 1, 1e-12); near(mm.bound, 2, 1e-9);
  assert.strictEqual(P.train(pts, {}).updates, 2);
});
test('XOR 不可分：判定不可分，零初始固定順序時每一輪四個點全錯、權重每輪回到 0（週期 1 輪），1000 輪都不收斂', () => {
  const pts = P.gate('xor');
  assert.ok(!P.maxMargin(pts, true).separable);
  const r = P.train(pts, { eta: 1 });
  assert.ok(!r.converged && r.epochs === P.MAX_EPOCHS);
  assert.ok(r.errs.every(e => e === 4));
  assert.deepStrictEqual(r.cycle, { from: 0, to: 1, period: 1 });
  for (const order of ['fixed', 'shuffle']) for (const init of ['zero', 'random']) {
    const q = P.train(pts, { eta: 0.5, order: order, init: init, seed: 9 });
    assert.ok(!q.converged && q.errs.every(e => e >= 1), order + ' ' + init);
  }
});
test('不可分的資料永遠不收斂：隨機不可分資料 100 組，每一輪至少分錯一個點', () => {
  const rand = P.rng(1969);
  let cnt = 0;
  while (cnt < 100) {
    const pts = randomPoints(rand, 4 + Math.floor(rand() * 12));
    if (P.maxMargin(pts, true).separable) continue;
    cnt++;
    const r = P.train(pts, { eta: 1, order: cnt % 2 ? 'shuffle' : 'fixed', seed: cnt, maxEpochs: 300 });
    assert.ok(!r.converged && r.errs.every(e => e >= 1));
  }
});

console.log('可分性與最大間隔');
test('AND 的最大間隔 γ = 0.6/√2.36（增廣空間，解析解），上界 (R/γ)² = 1.72/γ²', () => {
  const mm = P.maxMargin(P.gate('and'), true);
  near(mm.gamma, 0.6 / Math.sqrt(2.36), 1e-12);
  near(mm.R, Math.sqrt(1.72), 1e-12);
  near(mm.bound, 1.72 * 2.36 / 0.36, 1e-9);
  for (const g of ['or', 'nand']) near(P.maxMargin(P.gate(g), true).gamma, 0.6 / Math.sqrt(2.36), 1e-12);
});
test('最大間隔的雙向證明：方向 u 讓每個點 y·(u·x̃) ≥ γ（γ 做得到）；凸組合 Σλ·y·x̃ 的長度 = γ（γ 不可能更大）；並與兩種迭代算法對照（300 組）', () => {
  const rand = P.rng(77);
  for (let k = 0; k < 300; k++) {
    const bias = k % 4 !== 0;
    const pts = randomPoints(rand, 2 + Math.floor(rand() * 9));
    const mm = P.maxMargin(pts, bias);
    const gb = gilbertDistance(pts, bias);
    assert.strictEqual(gb.separable, mm.separable, `第 ${k} 組：兩種算法對「可不可分」意見不同`);
    if (mm.separable) {
      // Gilbert 的點一直在凸包裡，長度只會從上方逼近真正的距離；對偶座標上升法收斂得快，拿來比到 1e-6
      assert.ok(gb.dist >= mm.gamma - 1e-9, `第 ${k} 組：Gilbert 找到比 γ 更近的點`);
      near(dualMargin(pts, bias), mm.gamma, 1e-6 * mm.gamma, `第 ${k} 組 γ（對偶座標上升法）`);
      // 下界：u 是單位向量，每個點都至少有 γ
      near(Math.hypot(mm.u[0], mm.u[1], mm.u[2]), 1, 1e-12);
      pts.forEach(p => { const a = [p.x, p.y, bias ? 1 : 0]; assert.ok(p.c * (mm.u[0] * a[0] + mm.u[1] * a[1] + mm.u[2] * a[2]) >= mm.gamma - 1e-9); });
      // 上界：凸組合的長度就是 γ（任何單位向量 v 都有 min y·(v·x̃) ≤ v·Σλ·y·x̃ ≤ ‖Σλ·y·x̃‖）
      const q = [0, 0, 0];
      let ls = 0;
      mm.support.forEach((i, j) => { const p = pts[i], l = mm.weights[j]; assert.ok(l >= 0); ls += l; q[0] += l * p.c * p.x; q[1] += l * p.c * p.y; q[2] += l * p.c * (bias ? 1 : 0); });
      near(ls, 1, 1e-12);
      near(Math.hypot(q[0], q[1], q[2]), mm.gamma, 1e-9);
    }
  }
});
test('感知器學到的任何解，間隔都不超過最大間隔 γ', () => {
  const rand = P.rng(5);
  for (let k = 0; k < 100; k++) {
    const pts = randomSeparable(rand, 4 + Math.floor(rand() * 15));
    const mm = P.maxMargin(pts, true);
    const r = P.train(pts, { eta: 0.3 + rand(), init: k % 2 ? 'random' : 'zero', seed: k + 1, maxEpochs: 100000 });
    const m = P.marginOf(r.w, pts, true);
    assert.ok(m > 0 && m <= mm.gamma + 1e-12);
  }
});
test('不用偏差（線必須經過原點）時，AND、OR、NAND 也變成不可分，而且學不會', () => {
  for (const g of ['and', 'or', 'nand', 'xor']) {
    assert.ok(!P.maxMargin(P.gate(g), false).separable, g);
    const r = P.train(P.gate(g), { bias: false, maxEpochs: 200 });
    assert.ok(!r.converged && r.w[2] === 0, g);
  }
  // 經過原點就能分開的資料，不用偏差也學得會
  const pts = [P.pt(10, 4, 1), P.pt(6, -8, 1), P.pt(-9, 2, -1), P.pt(-3, -12, -1)];
  assert.ok(P.maxMargin(pts, false).separable);
  assert.ok(P.train(pts, { bias: false }).converged);
});

console.log('資料與工具');
test('隨機可分資料：24 個點、兩類各至少 6 個、可分、座標在格點上而且不重複；同一個種子每次都一樣', () => {
  for (let s = 1; s <= 60; s++) {
    const pts = P.genSeparable(s);
    assert.strictEqual(pts.length, 24);
    const np = pts.filter(p => p.c > 0).length;
    assert.ok(np >= 6 && 24 - np >= 6);
    assert.ok(P.maxMargin(pts, true).separable);
    assert.strictEqual(new Set(pts.map(p => p.gx + ',' + p.gy)).size, 24);
    pts.forEach(p => { assert.ok(Number.isInteger(p.gx) && Math.abs(p.gx) <= 18 && Math.abs(p.gy) <= 18); near(p.x, p.gx / G, 0); });
    assert.deepStrictEqual(P.genSeparable(s), pts);
  }
});
test('有雜訊的資料：剛好 3 個點的類別被翻過來、整體不可分；把這 3 個點拿掉就可分', () => {
  for (let s = 1; s <= 40; s++) {
    const pts = P.genNoisy(s);
    assert.strictEqual(pts.filter(p => p.noise).length, 3);
    assert.ok(!P.maxMargin(pts, true).separable);
    assert.ok(P.maxMargin(pts.filter(p => !p.noise), true).separable);
  }
});
test('打亂順序可以用種子重現：同一個種子結果相同，不同種子的順序不同', () => {
  const pts = P.genSeparable(3);
  const a = P.train(pts, { order: 'shuffle', seed: 11 }), b = P.train(pts, { order: 'shuffle', seed: 11 });
  assert.deepStrictEqual(a, b);
  const t1 = new P.Trainer(pts, { order: 'shuffle', seed: 1 }), t2 = new P.Trainer(pts, { order: 'shuffle', seed: 2 });
  assert.notDeepStrictEqual(t1.order, t2.order);
  assert.deepStrictEqual(new P.Trainer(pts, { order: 'fixed' }).order, pts.map((p, i) => i));
  const r1 = new P.Trainer(pts, { init: 'random', seed: 5 }), r2 = new P.Trainer(pts, { init: 'random', seed: 5 });
  assert.deepStrictEqual(r1.w0, r2.w0);
  assert.ok(r1.w0.every(v => v >= -1 && v <= 1) && !r1.zeroInit);
});
test('決策線和方框的交點都在線上、也都在方框邊上；斜率為 0 或沒有線的情況', () => {
  const rand = P.rng(3);
  for (let k = 0; k < 500; k++) {
    const w = [rand() * 4 - 2, rand() * 4 - 2, rand() * 2 - 1];
    const seg = P.clipLine(w, 1);
    if (!seg) continue;
    seg.forEach(q => {
      near(w[0] * q[0] + w[1] * q[1] + w[2], 0, 1e-9);
      assert.ok(Math.abs(q[0]) <= 1 + 1e-9 && Math.abs(q[1]) <= 1 + 1e-9);
      assert.ok(Math.abs(Math.abs(q[0]) - 1) < 1e-9 || Math.abs(Math.abs(q[1]) - 1) < 1e-9);
    });
  }
  assert.deepStrictEqual(P.clipLine([0, 1, 0], 1).map(q => q.map(v => v + 0)).sort(), [[-1, 0], [1, 0]]);
  assert.strictEqual(P.clipLine([0, 0, 1], 1), null);
  assert.strictEqual(P.clipLine([1, 0, -3], 1), null);
});

console.log('工作階段與事件（頁面與任務證明共用）');
test('載入預設資料可以不送事件；按「單步」才送 step；學完送每一輪的 epoch 與最後的 train', () => {
  const ev = [];
  const s = new P.Session({ emit: (t, d) => ev.push({ t, d }) });
  s.loadPreset('and', true);
  assert.strictEqual(ev.length, 0);
  s.step(false);
  assert.strictEqual(ev.length, 0);
  s.step(true);
  assert.deepStrictEqual(ev.map(e => e.t), ['step']);
  s.learn();
  const types = ev.map(e => e.t);
  assert.strictEqual(types[types.length - 1], 'train');
  const tr = ev[ev.length - 1].d;
  assert.ok(tr.converged && tr.set === 'and' && !tr.edited && tr.updates === 3 && tr.epochs === 3);
  assert.strictEqual(types.filter(t => t === 'epoch').length, 3);
  assert.strictEqual(s.history.length, 1);
});
test('編輯資料會記下新增、刪除、移動與刪掉的雜訊點，並把資料標成自訂', () => {
  const ev = [];
  const s = new P.Session({ emit: (t, d) => ev.push({ t, d }) });
  s.loadPreset('noisy', true);
  const iNoise = s.points.findIndex(p => p.noise);
  s.removeAt(iNoise);
  s.movePoint(0, s.points[0].gx + 1 > 20 ? s.points[0].gx - 1 : s.points[0].gx + 1, s.points[0].gy);
  assert.ok(s.addPoint(0, 0, 1) || s.addPoint(1, 0, 1));
  assert.ok(!s.addPoint(s.points[0].gx, s.points[0].gy, -1), '同一個位置不能放兩個點');
  assert.deepStrictEqual(s.edits, { added: 1, removed: 1, moved: 1, removedNoise: 1, removedClean: 0 });
  assert.strictEqual(s.set, 'custom');
  assert.strictEqual(s.base, 'noisy');
  assert.ok(ev.every(e => e.t === 'data'));
});
test('改設定（學習率、初始權重、順序、種子、偏差）都會從頭學起', () => {
  const s = new P.Session();
  s.loadPreset('or', true);
  s.step(false); s.step(false);
  assert.ok(s.trainer.checks === 2);
  for (const [k, v] of [['eta', 0.5], ['init', 'random'], ['order', 'shuffle'], ['seed', 4], ['bias', false]]) {
    s.step(false);
    assert.ok(s.setCfg(k, v));
    assert.strictEqual(s.trainer.checks, 0, k);
  }
  assert.ok(!s.setCfg('seed', 4), '值沒變就不重來');
});

console.log(`\n${passed} 項測試通過` + (process.exitCode ? '，有測試失敗' : ''));
