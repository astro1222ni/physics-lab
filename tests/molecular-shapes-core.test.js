// 以 Node 執行：node tests/molecular-shapes-core.test.js
'use strict';
const assert = require('assert');
const VC = require('../js/molecular-shapes-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`);
}
const P0 = VC.params();
const spec = function (center, ligs, lp) { return { center: center, ligs: ligs, lp: lp }; };
const rep = function (x, n) { return Array(n).fill(x); };
/** 能量最低的排列與它的分析 */
function best(s, P) {
  const doms = VC.domainsOf(s);
  const g = VC.globalMin(doms, P || P0);
  return { doms: doms, g: g, U: g.U, a: VC.analyze(s, doms, g.U, P || P0, g) };
}
/** 鍵角分組：[[角度, 個數], ...] */
function groups(s, P) {
  const b = best(s, P);
  return VC.groupAngles(VC.bondAngles(b.doms, b.U), 0.05).map(function (x) { return [x.a, x.n]; });
}
function lpIdx(doms) { const o = []; doms.forEach(function (d, i) { if (d.k === 'L') o.push(i); }); return o; }

// ---------------- 向量與角度量測 ----------------
test('角度量測：正交 90°、反向 180°、四面體頂點 109.47°、不必是單位向量', function () {
  near(VC.angleDeg([1, 0, 0], [0, 1, 0]), 90, 1e-12);
  near(VC.angleDeg([0, 0, 2], [0, 0, -5]), 180, 1e-9);
  near(VC.angleDeg([1, 1, 1], [1, -1, -1]), Math.acos(-1 / 3) * 180 / Math.PI, 1e-9);
  near(Math.acos(-1 / 3) * 180 / Math.PI, 109.4712, 1e-4);
  near(VC.angleDeg([3, 0, 0], [1, Math.sqrt(3), 0]), 60, 1e-9);
});
test('旋轉：羅德里格斯公式保持長度與夾角；rotateFromTo 把 a 轉到 b', function () {
  const v = VC.rotate([1, 0, 0], [0, 0, 1], Math.PI / 2);
  near(v[0], 0, 1e-12); near(v[1], 1, 1e-12); near(v[2], 0, 1e-12);
  const a = VC.unit([1, 2, 3]), b = VC.unit([-2, 0.5, 1]);
  const r = VC.rotateFromTo(a, a, b);
  near(VC.angleDeg(r, b), 0, 1e-6);
  const r2 = VC.rotateFromTo([0, 0, 1], [0, 0, 1], [0, 0, -1]);
  near(r2[2], -1, 1e-12);
});
test('鍵角分組：相近的角合併成「角度 × 個數」', function () {
  const g = VC.groupAngles([89.9, 90.1, 90, 120, 180], 0.6);
  assert.deepStrictEqual(g.map(function (x) { return x.n; }), [3, 1, 1]);
  near(g[0].a, 90, 1e-9);
});

// ---------------- 五種電子對幾何（沒有孤對電子） ----------------
test('2 個電子域：直線形 180°（BeCl2、CO2）', function () {
  assert.deepStrictEqual(groups(spec('Be', ['Cl', 'Cl'], 0)).map(function (x) { return x[1]; }), [1]);
  near(groups(spec('Be', ['Cl', 'Cl'], 0))[0][0], 180, 1e-4);
  near(groups(spec('C', ['O', 'O'], 0))[0][0], 180, 1e-4);
});
test('3 個電子域：平面三角形 120° ×3（BF3），三個鍵在同一平面', function () {
  const g = groups(spec('B', ['F', 'F', 'F'], 0));
  assert.strictEqual(g.length, 1); near(g[0][0], 120, 1e-4); assert.strictEqual(g[0][1], 3);
});
test('4 個電子域：正四面體 109.47° ×6（CH4）', function () {
  const g = groups(spec('C', rep('H', 4), 0));
  assert.strictEqual(g.length, 1); near(g[0][0], 109.4712, 1e-3); assert.strictEqual(g[0][1], 6);
});
test('5 個電子域：三角雙錐 90° ×6、120° ×3、180° ×1（PCl5）', function () {
  const g = groups(spec('P', rep('Cl', 5), 0));
  assert.strictEqual(g.length, 3);
  near(g[0][0], 90, 1e-3); assert.strictEqual(g[0][1], 6);
  near(g[1][0], 120, 1e-3); assert.strictEqual(g[1][1], 3);
  near(g[2][0], 180, 1e-3); assert.strictEqual(g[2][1], 1);
});
test('6 個電子域：正八面體 90° ×12、180° ×3（SF6）', function () {
  const g = groups(spec('S', rep('F', 6), 0));
  assert.strictEqual(g.length, 2);
  near(g[0][0], 90, 1e-3); assert.strictEqual(g[0][1], 12);
  near(g[1][0], 180, 1e-3); assert.strictEqual(g[1][1], 3);
});
test('沒有孤對電子時，排列與孤對電子的排斥強度 λ 無關', function () {
  [0.4, 1.3, 2].forEach(function (l) {
    const P = VC.params(l);
    near(groups(spec('C', rep('H', 4), 0), P)[0][0], 109.4712, 1e-3);
    near(groups(spec('S', rep('F', 6), 0), P)[0][0], 90, 1e-3);
  });
});

// ---------------- 孤對電子 ----------------
test('四面體類：CH4 > NH3 > H2O，而且和實驗值 106.7°、104.5° 相差 1.5° 以內', function () {
  const c = groups(spec('C', rep('H', 4), 0))[0][0];
  const n = groups(spec('N', rep('H', 3), 1))[0][0];
  const o = groups(spec('O', rep('H', 2), 2))[0][0];
  assert.ok(c > n && n > o, `CH4 ${c}、NH3 ${n}、H2O ${o} 沒有依序變小`);
  near(n, 106.7, 1.5, 'NH3：'); near(o, 104.5, 1.5, 'H2O：');
});
test('孤對電子的排斥強度 λ 越大，H2O 的鍵角越小；λ 調得到 104.5°', function () {
  let prev = 181;
  const ls = [0.4, 0.55, 0.7, 0.9, 1.2, 1.6, 2];
  const angs = ls.map(function (l) { return groups(spec('O', rep('H', 2), 2), VC.params(l))[0][0]; });
  angs.forEach(function (a, i) { assert.ok(a < prev, `λ = ${ls[i]} 時 ${a} 沒有比前一個小`); prev = a; });
  assert.ok(angs[0] > 104.5 && angs[angs.length - 1] < 104.5, '104.5° 不在 λ 的範圍內');
});
test('三角雙錐的孤對電子先佔赤道：SF4、ClF3、XeF2 的孤對電子都不在軸向', function () {
  [[spec('S', rep('F', 4), 1), 1], [spec('Cl', rep('F', 3), 2), 2], [spec('Xe', rep('F', 2), 3), 3]].forEach(function (c) {
    const b = best(c[0]);
    const ax = VC.axialFlags(b.U);
    const L = lpIdx(b.doms);
    assert.strictEqual(L.length, c[1]);
    L.forEach(function (i) { assert.ok(!ax[i], c[0].center + ' 的孤對電子跑到軸向'); });
  });
});
test('SF4：孤對電子在軸向的排列是局部最低點，能量比赤道高（所以按搖一搖可以離開）', function () {
  const s = spec('S', rep('F', 4), 1), doms = VC.domainsOf(s);
  const g = VC.globalMin(doms, P0);
  assert.ok(g.minima.length >= 2, '只有一個局部最低點');
  // 孤對電子放在軸向（0,0,1），四個 F 放在另一個軸向與赤道
  const S3 = Math.sqrt(3) / 2;
  const U0 = [[0, 0, -1], [1, 0, 0], [-0.5, S3, 0], [-0.5, -S3, 0], [0, 0, 1]];
  const r = VC.relax(doms, U0, P0, { tol: 1e-10 });
  assert.ok(r.converged);
  const ax = VC.axialFlags(r.U);
  assert.ok(ax[4], '從軸向出發，孤對電子應該停在軸向（局部最低點）');
  assert.ok(r.E > g.E + 1e-4, `軸向 ${r.E} 應比赤道 ${g.E} 高`);
  assert.ok(!VC.isGlobal(r.E, g.E));
});
test('蹺蹺板形、T 形、直線形：SF4 有 4 個約 90° 的角、ClF3 有接近 180° 的角、XeF2 是 180°', function () {
  const s = groups(spec('S', rep('F', 4), 1));
  const all = []; s.forEach(function (x) { for (let k = 0; k < x[1]; k++) all.push(x[0]); });
  assert.strictEqual(all.length, 6);
  assert.strictEqual(all.filter(function (a) { return a > 80 && a < 100; }).length, 4);
  assert.ok(all[4] < 120, `SF4 赤道上的 F–S–F ${all[4]} 應比 120° 小（被孤對電子擠）`);
  assert.ok(all[5] > 165);
  const t = groups(spec('Cl', rep('F', 3), 2));
  assert.ok(t[t.length - 1][0] > 170 && t[0][0] < 95);
  near(groups(spec('Xe', rep('F', 2), 3))[0][0], 180, 1e-3);
});
test('八面體類：BrF5 四方錐（4 個鍵在同一平面附近）、XeF4 兩對孤對電子相對 → 平面四方形', function () {
  const x = best(spec('Xe', rep('F', 4), 2));
  const L = lpIdx(x.doms);
  near(VC.angleDeg(x.U[L[0]], x.U[L[1]]), 180, 1e-3);
  const gx = VC.groupAngles(VC.bondAngles(x.doms, x.U), 0.05).map(function (q) { return [q.a, q.n]; });
  near(gx[0][0], 90, 1e-3); assert.strictEqual(gx[0][1], 4);
  near(gx[1][0], 180, 1e-3); assert.strictEqual(gx[1][1], 2);
  const b = best(spec('Br', rep('F', 5), 1));
  const lp = b.U[lpIdx(b.doms)[0]];
  // 頂端的 F 與孤對電子相對
  const ap = b.doms.map(function (d, i) { return i; }).filter(function (i) { return b.doms[i].k === 'B'; })
    .reduce(function (m, i) { return VC.angleDeg(b.U[i], lp) > VC.angleDeg(b.U[m], lp) ? i : m; }, 0);
  near(VC.angleDeg(b.U[ap], lp), 180, 1e-3);
  assert.strictEqual(b.a.shape, 'square-pyramidal');
});
test('XeF4 的另一種排列（孤對電子相鄰 90°）是能量較高的局部最低點', function () {
  const s = spec('Xe', rep('F', 4), 2), doms = VC.domainsOf(s);
  const g = VC.globalMin(doms, P0);
  const U0 = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [0, 1, 0], [-1, 0, 0.05], [0, -1, 0.05]].map(VC.unit);
  const r = VC.relax(doms, U0, P0, { tol: 1e-10 });
  assert.ok(r.E > g.E + 1e-4, `相鄰 ${r.E} 應比相對 ${g.E} 高`);
});
test('雙鍵佔的空間較大：SO2（雙鍵＋一對孤對電子）比 H2O 的角大', function () {
  const so2 = groups(spec('S', ['O', 'O'], 1))[0][0], h2o = groups(spec('O', rep('H', 2), 2))[0][0];
  assert.ok(so2 > h2o && so2 < 120);
});

// ---------------- 能量最低化 ----------------
test('梯度下降：從隨機起點出發能量只降不升、梯度收斂到 0，CH4 每次都到 109.47°', function () {
  const s = spec('C', rep('H', 4), 0), doms = VC.domainsOf(s);
  const rng = VC.mulberry32(7);
  for (let k = 0; k < 6; k++) {
    const U0 = doms.map(function () { return VC.randomUnit(rng); });
    const r = VC.relax(doms, U0, P0, { tol: 1e-10 });
    assert.ok(r.converged, '沒有收斂');
    const G = VC.gradient(doms, r.U, P0);
    G.forEach(function (g) { assert.ok(VC.norm(g) < 1e-6, "梯度 " + VC.norm(g)); });
    VC.bondAngles(doms, r.U).forEach(function (x) { near(x.a, 109.4712, 1e-3); });
    assert.ok(r.E <= VC.energy(doms, U0, P0));
  }
});
test('動畫的過阻尼運動：每一小步能量都不增加，最後停在能量最低的排列', function () {
  const s = spec('N', rep('H', 3), 1), doms = VC.domainsOf(s);
  const g = VC.globalMin(doms, P0);
  const rng = VC.mulberry32(11);
  let U = doms.map(function () { return VC.randomUnit(rng); });
  const mob = 7 / VC.stiffness(doms, P0);
  let E = VC.energy(doms, U, P0);
  for (let k = 0; k < 2400; k++) {
    const r = VC.flow(doms, U, P0, 1 / 60, { mob: mob, maxRate: 2.4 });
    assert.ok(r.E <= E + 1e-9 * Math.max(1, E), `第 ${k} 步能量上升 ${E} → ${r.E}`);
    U = r.U; E = r.E;
  }
  const fin = VC.relax(doms, U, P0, { tol: 1e-10 });
  near(fin.E, g.E, 1e-6 * g.E);
});
test('尾段加速（tail）：能量照樣只降不升、停在同一個排列，而且三角雙錐 PCl5、SF4 很快就停', function () {
  ['PCl5', 'SF4', 'NH3'].forEach(function (id) {
    const doms = VC.domainsOf(VC.preset(id)), g = VC.globalMin(doms, P0);
    const mob = 7 / VC.stiffness(doms, P0), dt = 1 / 60;
    const steps = function (tail) {
      let U = VC.scatter(doms, g.U, P0, 0.55, VC.mulberry32(3)), E = VC.energy(doms, U, P0), k = 0;
      for (; k < 6000; k++) {
        const r = VC.flow(doms, U, P0, dt, { mob: mob, maxRate: 2.4, tail: tail });
        assert.ok(r.E <= E + 1e-9 * Math.max(1, E), `${id} 第 ${k} 步能量上升`);
        U = r.U; E = r.E;
        if (mob * r.gmax < 0.004) break;
      }
      near(VC.relax(doms, U, P0, { tol: 1e-10 }).E, g.E, 1e-6 * g.E);
      return k;
    };
    const slow = steps(false), fast = steps(true);
    assert.ok(fast <= slow, `${id}：加速 ${fast} 步、原本 ${slow} 步`);
    assert.ok(fast * dt < 3, `${id}：要 ${(fast * dt).toFixed(1)} 秒才停`);
  });
});
test('選常見分子的起始排列（scatter）：每個都會回到能量最低的排列，而且沒有整體轉走', function () {
  VC.PRESETS.forEach(function (p) {
    const doms = VC.domainsOf(p), g = VC.globalMin(doms, P0), rng = VC.mulberry32(8);
    for (let t = 0; t < 4; t++) {
      const U0 = VC.scatter(doms, g.U, P0, 0.55, rng);
      const r = VC.relax(doms, U0, P0, { tol: 1e-9 });
      assert.ok(VC.isGlobal(r.E, g.E), p.id + ' 起始排列落到局部最低點');
      // 有推開（看得到電子域互相推開），但平均不超過約 0.55 rad
      let s = 0;
      U0.forEach(function (u, i) { s += VC.angleDeg(u, g.U[i]); });
      assert.ok(s / U0.length > 3 && s / U0.length < 60, p.id + ' 平均偏了 ' + (s / U0.length).toFixed(1) + '°');
    }
  });
});
test('被抓住的電子域（pin）不會移動；梯度只有球面的切線分量', function () {
  const s = spec('S', rep('F', 4), 1), doms = VC.domainsOf(s);
  const rng = VC.mulberry32(3);
  const U = doms.map(function () { return VC.randomUnit(rng); });
  const r = VC.flow(doms, U, P0, 0.1, { pin: 2, mob: 1 });
  assert.deepStrictEqual(r.U[2], U[2]);
  VC.gradient(doms, U, P0).forEach(function (g, i) { near(VC.dot(g, U[i]), 0, 1e-12); });
});
test('梯度和數值微分一致', function () {
  const s = spec('Cl', ['F', 'F', 'O'], 1), doms = VC.domainsOf(s);
  const rng = VC.mulberry32(5);
  const U = doms.map(function () { return VC.randomUnit(rng); });
  const G = VC.gradient(doms, U, P0);
  const h = 1e-6;
  for (let i = 0; i < U.length; i++) {
    const t = VC.unit(VC.cross(U[i], [0.3, 0.5, 0.8]));
    const Up = U.slice(), Um = U.slice();
    Up[i] = VC.unit([U[i][0] + h * t[0], U[i][1] + h * t[1], U[i][2] + h * t[2]]);
    Um[i] = VC.unit([U[i][0] - h * t[0], U[i][1] - h * t[1], U[i][2] - h * t[2]]);
    const num = (VC.energy(doms, Up, P0) - VC.energy(doms, Um, P0)) / (2 * h);
    near(VC.dot(G[i], t), num, 1e-5 * Math.max(1, Math.abs(num)));
  }
});
/** 和頁面的「搖一搖」相同：一輪郎之萬退火（溫度 T0×E最低×e^(−t/τ)）＋過阻尼運動到穩定，再精確放鬆 */
function annealRound(doms, U, g, cfg, mob, rng) {
  let V = U.slice();
  const dt = 1 / 60;
  for (let t = 0; t < cfg.dur; t += dt) {
    V = VC.thermal(V, cfg.T0 * g.E * Math.exp(-t / cfg.tau), mob, dt, rng);
    V = VC.flow(doms, V, P0, dt, { mob: mob, maxRate: 2.4 }).U;
  }
  for (let k = 0; k < 1500; k++) { const r = VC.flow(doms, V, P0, dt, { mob: mob, maxRate: 2.4, tail: true }); V = r.U; if (mob * r.gmax < 0.004) break; }
  return VC.relax(doms, V, P0);
}
/** 按一次「搖一搖」：第一輪依狀態輕搖或用力搖，還在局部最低點就再用力搖，最多 ANNEAL.rounds 輪；傳回最後是不是能量最低 */
function pressShake(doms, U, g, mob, rng) {
  let r = VC.relax(doms, U, P0);
  let cfg = VC.isGlobal(r.E, g.E) ? VC.ANNEAL.gentle : VC.ANNEAL.hot;
  for (let k = 0; k < VC.ANNEAL.rounds; k++) {
    r = annealRound(doms, r.U, g, cfg, mob, rng);
    if (VC.isGlobal(r.E, g.E)) return true;
    cfg = VC.ANNEAL.hot;
  }
  return false;
}
test('模擬退火（郎之萬動力學）：溫度 0 時就是過阻尼運動；熱擾動的大小 = √(2·mob·T·dt)', function () {
  const U = [[0, 0, 1], [1, 0, 0]];
  assert.deepStrictEqual(VC.thermal(U, 0, 1, 1 / 60, VC.mulberry32(1)), U.map(function (u) { return VC.unit(u); }));
  // 很多次的切線偏移平方平均 ≈ 2 × (2·mob·T·dt)（切平面有兩個方向）
  const rng = VC.mulberry32(4);
  let s2 = 0; const n = 4000, T = 0.01, mob = 2, dt = 1 / 60;
  for (let k = 0; k < n; k++) { const v = VC.thermal([[0, 0, 1]], T, mob, dt, rng)[0]; s2 += v[0] * v[0] + v[1] * v[1]; }
  near(s2 / n, 2 * 2 * mob * T * dt, 0.1 * 2 * 2 * mob * T * dt);
});
test('去掉整體轉動（despin）：純轉動被轉回原位；夾角與能量不變；直線形不出錯', function () {
  const doms = VC.domainsOf(VC.preset('NH3')), g = VC.globalMin(doms, P0);
  const k = VC.unit([0.3, -0.5, 0.8]);
  // 小角度的整體轉動：幾乎完全轉回去
  const R = g.U.map(function (u) { return VC.rotate(u, k, 0.02); });
  const back = VC.despin(g.U, R);
  back.forEach(function (u, i) { assert.ok(VC.angleDeg(u, g.U[i]) < 1e-3, '轉回後差 ' + VC.angleDeg(u, g.U[i])); });
  // 隨機推開再去掉轉動：夾角與能量和推開後一樣（只是整體轉動）
  const J = VC.jiggle(g.U, 0.3, VC.mulberry32(5));
  const D = VC.despin(g.U, J);
  near(VC.energy(doms, D, P0), VC.energy(doms, J, P0), 1e-9);
  for (let i = 0; i < D.length; i++) for (let j = i + 1; j < D.length; j++) near(VC.angleDeg(D[i], D[j]), VC.angleDeg(J[i], J[j]), 1e-7);
  // 去掉轉動之後，剩下的偏移沒有整體的角動量：Σ u × δ ≈ 0（一階）
  const spin = function (V) {
    const L = [0, 0, 0];
    V.forEach(function (u, i) { const c = VC.cross(g.U[i], [u[0] - g.U[i][0], u[1] - g.U[i][1], u[2] - g.U[i][2]]); L[0] += c[0]; L[1] += c[1]; L[2] += c[2]; });
    return VC.norm(L);
  };
  const Js = VC.jiggle(g.U, 0.01, VC.mulberry32(6));
  const before = spin(Js), after = spin(VC.despin(g.U, Js));
  assert.ok(after < 0.05 * before, 'Σ u × δ：' + before + ' → ' + after);
  // 直線形（BeCl2）：A 矩陣在分子軸方向是 0，也要得到有限的結果
  const lin = VC.despin([[0, 0, 1], [0, 0, -1]], [VC.unit([0.1, 0, 1]), VC.unit([-0.1, 0, -1])]);
  lin.forEach(function (u) { assert.ok(u.every(Number.isFinite)); });
  near(Math.abs(lin[0][2]), 1, 1e-4);
});
test('搖一搖：SF4 從軸向的局部最低點，按一次（最多 5 輪退火）幾乎都回到能量最低的排列', function () {
  const s = spec('S', rep('F', 4), 1), doms = VC.domainsOf(s);
  const g = VC.globalMin(doms, P0);
  const S3 = Math.sqrt(3) / 2;
  const U = VC.relax(doms, [[0, 0, -1], [1, 0, 0], [-0.5, S3, 0], [-0.5, -S3, 0], [0, 0, 1]], P0).U;
  assert.ok(!VC.isGlobal(VC.energy(doms, U, P0), g.E));
  const rng = VC.mulberry32(2026);
  const mob = 7 / VC.stiffness(doms, P0);
  let ok = 0;
  for (let trial = 0; trial < 12; trial++) if (pressShake(doms, U, g, mob, rng)) ok++;
  assert.ok(ok >= 11, `12 次只有 ${ok} 次回到能量最低`);
});
test('搖一搖：已經是能量最低的排列時輕輕搖，最後仍是能量最低（SF4、ClF3、XeF4）', function () {
  ['SF4', 'ClF3', 'XeF4'].forEach(function (id) {
    const doms = VC.domainsOf(VC.preset(id)), g = VC.globalMin(doms, P0);
    const rng = VC.mulberry32(77), mob = 7 / VC.stiffness(doms, P0);
    let ok = 0;
    for (let trial = 0; trial < 6; trial++) if (pressShake(doms, g.U, g, mob, rng)) ok++;
    assert.ok(ok >= 5, `${id}：6 次只有 ${ok} 次`);
  });
});
test('可設定種子：同樣的種子得到同樣的亂數與排列', function () {
  const a = VC.mulberry32(42), b = VC.mulberry32(42);
  for (let i = 0; i < 5; i++) assert.strictEqual(a(), b());
  const ra = VC.jiggle([[0, 0, 1], [1, 0, 0]], 0.3, VC.mulberry32(9));
  const rb = VC.jiggle([[0, 0, 1], [1, 0, 0]], 0.3, VC.mulberry32(9));
  assert.deepStrictEqual(ra, rb);
});
test('擺正方向只是整體旋轉：鍵角不變，孤對電子朝上（+z）', function () {
  const b = best(spec('N', rep('H', 3), 1));
  const lp = b.U[lpIdx(b.doms)[0]];
  near(lp[2], 1, 1e-9);
  const rng = VC.mulberry32(1);
  const U = b.doms.map(function () { return VC.randomUnit(rng); });
  const V = VC.orient(b.doms, U);
  for (let i = 0; i < U.length; i++) for (let j = i + 1; j < U.length; j++) near(VC.angleDeg(V[i], V[j]), VC.angleDeg(U[i], U[j]), 1e-9);
});
test('擺正方向的四元數：orient = 用 orientQuat 轉；擺正兩次不再轉；轉一部分（動畫）介於中間', function () {
  VC.PRESETS.forEach(function (p) {
    const doms = VC.domainsOf(p), g = VC.globalMin(doms, P0);
    // 隨機整體轉一下
    const k = VC.unit([0.2, 0.9, -0.4]);
    const U = g.U.map(function (u) { return VC.rotate(u, k, 1.1); });
    const q = VC.orientQuat(doms, U), V = VC.orient(doms, U);
    U.forEach(function (u, i) { const w = VC.qRot(q, u); for (let c = 0; c < 3; c++) near(w[c], V[i][c], 1e-9); });
    // 擺正之後再擺正：不用再轉（動畫結束後不會又轉一次）
    assert.ok(VC.qAngle(VC.orientQuat(doms, V)) < 1e-6, p.id + ' 擺正兩次還要轉 ' + VC.qAngle(VC.orientQuat(doms, V)) + '°');
    // 有孤對電子時，孤對電子的合方向朝上
    const L = doms.map(function (d, i) { return d.k === 'L' ? i : -1; }).filter(function (i) { return i >= 0; });
    if (L.length) {
      const s = [0, 0, 0];
      L.forEach(function (i) { s[0] += V[i][0]; s[1] += V[i][1]; s[2] += V[i][2]; });
      if (VC.norm(s) > 0.2) near(VC.unit(s)[2], 1, 1e-9);
    }
    // 轉一半：角度剛好一半；轉 0 不動、轉 1 到位
    near(VC.qAngle(VC.qPart(q, 0.5)), VC.qAngle(q) / 2, 1e-6);
    assert.ok(VC.qAngle(VC.qPart(q, 0)) < 1e-9);
    U.forEach(function (u, i) { const w = VC.qRot(VC.qPart(q, 1), u); for (let c = 0; c < 3; c++) near(w[c], V[i][c], 1e-9); });
  });
});
test('新電子域放在離其他電子域最遠的方向', function () {
  const d = VC.freeDirection([[0, 0, 1]]);
  assert.ok(d[2] < -0.99);
  const e = VC.freeDirection([[0, 0, 1], [0, 0, -1]]);
  assert.ok(Math.abs(e[2]) < 0.1);
});

// ---------------- 極性 ----------------
test('非極性：BeCl2、CO2、BF3、CH4、PCl5、XeF2、SF6、XeF4（鍵偶極互相抵消）', function () {
  ['BeCl2', 'CO2', 'BF3', 'CH4', 'PCl5', 'XeF2', 'SF6', 'XeF4'].forEach(function (id) {
    const b = best(VC.preset(id));
    assert.ok(!b.a.polar, id + ' 應該是非極性，淨偶極 ' + b.a.dipole.mag);
    assert.ok(b.a.dipole.mag < 1e-6);
  });
});
test('極性：SO2、NH3、H2O、SF4、ClF3、BrF5', function () {
  ['SO2', 'NH3', 'H2O', 'SF4', 'ClF3', 'BrF5'].forEach(function (id) {
    assert.ok(best(VC.preset(id)).a.polar, id + ' 應該是極性');
  });
});
test('偶極方向：由電負度小的指向大的（H2O 的淨偶極朝向孤對電子那一側）', function () {
  const b = best(VC.preset('H2O'));
  const lp = lpIdx(b.doms).map(function (i) { return b.U[i]; });
  const s = [lp[0][0] + lp[1][0], lp[0][1] + lp[1][1], lp[0][2] + lp[1][2]];
  assert.ok(VC.dot(b.a.dipole.net, s) > 0);
  // O–H 的鍵偶極大小 = |χO − χH| = 1.24
  near(VC.norm(b.a.dipole.bonds[0]), 1.24, 1e-9);
});
test('相同的形狀、不同的原子：CH3F 有極性；CF2Cl2 也有；四個鍵都一樣的 CF4 沒有', function () {
  assert.ok(best(spec('C', ['H', 'H', 'H', 'F'], 0)).a.polar);
  assert.ok(best(spec('C', ['F', 'F', 'Cl', 'Cl'], 0)).a.polar);
  assert.ok(!best(spec('C', rep('F', 4), 0)).a.polar);
  // 三角雙錐：兩個軸向放 Cl、三個赤道放 F（PF3Cl2 的能量最低排列依排斥模型，鍵結原子種類不影響位置） → 對稱位置的判斷交給頁面任務；這裡確認非極性判斷用的容許值
  const d = VC.dipole(spec('Xe', ['F', 'F', 'F', 'F'], 2), VC.domainsOf(spec('Xe', rep('F', 4), 2)), best(spec('Xe', rep('F', 4), 2)).U);
  assert.ok(!d.polar);
});

// ---------------- 電子數、電荷、名稱 ----------------
test('路易斯結構：價殼層電子數、形式電荷、八隅體限制', function () {
  const h2o = VC.lewis(spec('O', ['H', 'H'], 2));
  assert.strictEqual(h2o.shell, 8); assert.strictEqual(h2o.charge, 0); assert.strictEqual(h2o.total, 8); assert.ok(h2o.valid);
  const co2 = VC.lewis(spec('C', ['O', 'O'], 0));
  assert.strictEqual(co2.shell, 8); assert.strictEqual(co2.charge, 0); assert.strictEqual(co2.total, 16);
  assert.deepStrictEqual(co2.outerLP, [2, 2]);
  assert.strictEqual(VC.lewis(spec('N', rep('H', 4), 0)).charge, 1);   // NH4+
  assert.strictEqual(VC.lewis(spec('B', rep('F', 4), 0)).charge, -1);  // BF4−
  assert.strictEqual(VC.lewis(spec('N', rep('H', 2), 2)).charge, -1);  // NH2−
  const sf6 = VC.lewis(spec('S', rep('F', 6), 0));
  assert.strictEqual(sf6.shell, 12); assert.ok(sf6.octetOK); assert.strictEqual(sf6.charge, 0); assert.strictEqual(sf6.total, 48);
  assert.ok(!VC.lewis(spec('N', rep('F', 5), 0)).octetOK, '第二週期的 N 不能有 10 個價殼層電子');
  const xef4 = VC.lewis(spec('Xe', rep('F', 4), 2));
  assert.strictEqual(xef4.shell, 12); assert.strictEqual(xef4.charge, 0); assert.strictEqual(xef4.total, 36);
  assert.ok(!VC.lewis(spec('C', rep('H', 2), 0)).valid, 'CH2 要帶 +2 的電荷，不合理');
});
test('常見分子都是電中性、合理的組合', function () {
  VC.PRESETS.forEach(function (p) {
    const l = VC.lewis(p);
    assert.strictEqual(l.charge, 0, p.id + ' 的電荷');
    assert.ok(l.valid, p.id);
  });
});
test('化學式：H2O、NH3、CH4、SF4、XeF4、CO2、NH4+、BF4−', function () {
  assert.strictEqual(VC.formula(spec('O', ['H', 'H'], 2)).text, 'H2O');
  assert.strictEqual(VC.formula(spec('N', rep('H', 3), 1)).text, 'NH3');
  assert.strictEqual(VC.formula(spec('C', rep('H', 4), 0)).text, 'CH4');
  assert.strictEqual(VC.formula(spec('S', rep('F', 4), 1)).text, 'SF4');
  assert.strictEqual(VC.formula(spec('Xe', rep('F', 4), 2)).text, 'XeF4');
  assert.strictEqual(VC.formula(spec('C', ['O', 'O'], 0)).text, 'CO2');
  assert.strictEqual(VC.formula(spec('N', rep('H', 4), 0)).text, 'NH4+');
  assert.strictEqual(VC.formula(spec('B', rep('F', 4), 0)).text, 'BF4-');
  assert.strictEqual(VC.formula(spec('C', ['H', 'F', 'Cl', 'Cl'], 0)).text, 'CHFCl2');
});
test('13 種 AXmEn 的形狀名稱與記號', function () {
  const want = {
    '2,0': 'linear', '3,0': 'trigonal-planar', '2,1': 'bent', '4,0': 'tetrahedral', '3,1': 'trigonal-pyramidal', '2,2': 'bent',
    '5,0': 'trigonal-bipyramidal', '4,1': 'seesaw', '3,2': 't-shaped', '2,3': 'linear', '6,0': 'octahedral', '5,1': 'square-pyramidal', '4,2': 'square-planar'
  };
  assert.strictEqual(VC.STANDARD13.length, 13);
  VC.STANDARD13.forEach(function (k) { const mn = k.split(',').map(Number); assert.strictEqual(VC.shapeOf(mn[0], mn[1]), want[k], k); });
  assert.strictEqual(VC.axe(4, 2), 'AX4E2');
  assert.strictEqual(VC.axe(2, 0), 'AX2');
  assert.strictEqual(VC.axe(3, 1), 'AX3E');
  Object.keys(VC.SHAPES).forEach(function (k) { assert.ok(VC.SHAPES[k][0] && VC.SHAPES[k][1]); });
});
test('分析：能量最低的排列 isGlobal 為真，電子對幾何與分子形狀正確', function () {
  const b = best(VC.preset('ClF3'));
  assert.ok(b.a.isGlobal);
  assert.strictEqual(b.a.egeom, 'trigonal-bipyramidal');
  assert.strictEqual(b.a.shape, 't-shaped');
  assert.strictEqual(b.a.axe, 'AX3E2');
  assert.strictEqual(b.a.N, 5);
});
test('凸包：四面體 4 面 6 邊、八面體 8 面 12 邊、三角雙錐 6 面 9 邊', function () {
  const t = VC.hull(VC.IDEAL[4]);
  assert.strictEqual(t.faces.length, 4); assert.strictEqual(t.edges.length, 6);
  const o = VC.hull(VC.IDEAL[6]);
  assert.strictEqual(o.edges.length, 12);
  const p = VC.hull(VC.IDEAL[5]);
  assert.strictEqual(p.faces.length, 6); assert.strictEqual(p.edges.length, 9);
});
test('鍵長（顯示用）：共價半徑相加，雙鍵較短', function () {
  near(VC.bondLength('C', 'H', 1), 1.07, 1e-9);
  near(VC.bondLength('S', 'F', 1), 1.62, 1e-9);
  assert.ok(VC.bondLength('C', 'O', 2) < VC.ELEMENTS.C.r + VC.ELEMENTS.O.r);
});
test('電負度（鮑林）與價電子數', function () {
  near(VC.ELEMENTS.F.chi, 3.98, 1e-9); near(VC.ELEMENTS.O.chi, 3.44, 1e-9); near(VC.ELEMENTS.H.chi, 2.20, 1e-9);
  assert.strictEqual(VC.ELEMENTS.Xe.v, 8); assert.strictEqual(VC.ELEMENTS.N.v, 5); assert.strictEqual(VC.ELEMENTS.Be.v, 2);
});

console.log(`\n分子的形狀核心：${passed} 項通過`);
