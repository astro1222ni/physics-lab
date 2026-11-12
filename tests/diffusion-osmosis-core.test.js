// 以 Node 執行：node tests/diffusion-osmosis-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/diffusion-osmosis-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1e-300);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }

console.log('diffusion-osmosis-core');

// ---------------------------------------------------------------- 常數
test('水的黏度與密度符合手冊值（20 °C 1.002 mPa·s、25 °C 0.890 mPa·s；4 °C 999.97、25 °C 997.05 kg/m³）', () => {
  near(K.waterViscosity(20) * 1e3, 1.002, 0.02, 'η(20 °C)');
  near(K.waterViscosity(25) * 1e3, 0.890, 0.02, 'η(25 °C)');
  near(K.waterViscosity(0) * 1e3, 1.792, 0.05, 'η(0 °C)');
  near(K.waterViscosity(40) * 1e3, 0.653, 0.015, 'η(40 °C)');
  near(K.waterDensity(4), 999.972, 0.005, 'ρ(4 °C)');
  near(K.waterDensity(25), 997.047, 0.005, 'ρ(25 °C)');
  assert.ok(K.waterDensity(4) > K.waterDensity(0) && K.waterDensity(4) > K.waterDensity(8), '水在 4 °C 最重');
});

// ---------------------------------------------------------------- 斯托克斯–愛因斯坦
test('斯托克斯–愛因斯坦：同溫時 D·r 固定；同半徑時 D ∝ T／η；葡萄糖在 25 °C 約 6.5×10^-10 m²/s', () => {
  const D1 = K.diffusionCoef(25, 0.5), D2 = K.diffusionCoef(25, 2);
  close(D1 / D2, 4, 1e-12, '半徑 4 倍，D 變 1/4');
  for (const Tc of [0, 10, 37, 40]) {
    const ratio = K.diffusionCoef(Tc, 1) / K.diffusionCoef(25, 1);
    close(ratio, ((Tc + 273.15) / 298.15) * (K.waterViscosity(25) / K.waterViscosity(Tc)), 1e-12, 'T=' + Tc);
  }
  // 文獻：葡萄糖在水中 25 °C 的擴散係數約 6.7×10^-10 m²/s（斯托克斯半徑 0.38 nm 算出 6.45×10^-10，差 4%）
  near(K.diffusionCoef(25, 0.38) / 6.7e-10, 1, 0.06, '葡萄糖');
  assert.ok(K.diffusionCoef(40, 1) > 2.9 * K.diffusionCoef(0, 1), '0 → 40 °C 擴散快約 3 倍（黏度下降是主因）');
});

// ---------------------------------------------------------------- 隨機漫步
test('反射壁：fold 把任何位置折回 [0, L]，而且是連續的鏡射', () => {
  const L = 7;
  for (let u = -40; u <= 40; u += 0.37) {
    const x = K.fold(u, L);
    assert.ok(x >= 0 && x <= L, 'u=' + u);
    close(K.fold(u + 2 * L, L), x, 1e-9, '週期 2L');
    close(K.fold(-u, L), x, 1e-9, '對 0 鏡射');
  }
  near(K.fold(L + 0.5, L), L - 0.5, 1e-12, '超出右牆 0.5 → 反彈到 L − 0.5');
  near(K.fold(-0.25, L), 0.25, 1e-12, '超出左牆 0.25 → 反彈到 0.25');
});

test('同一個種子產生同樣的結果（測試可重現）', () => {
  const a = K.createCloud({ N: 50 }, K.rng(7)), b = K.createCloud({ N: 50 }, K.rng(7));
  K.removePartition(a); K.removePartition(b);
  for (let k = 0; k < 20; k++) { K.stepCloud(a, 300, 0.05); K.stepCloud(b, 300, 0.05); }
  for (let i = 0; i < 150; i++) assert.strictEqual(a.u[i], b.u[i]);
  const c = K.createCloud({ N: 50 }, K.rng(8));
  assert.notStrictEqual(a.u[0], c.u[0], '不同種子不同');
});

test('粒子數守恆：每一步左右兩半的粒子數相加都是 N，位置都在盒子裡；有隔板時全部在左邊', () => {
  const c = K.createCloud({}, K.rng(11));
  const p = [0, 0, 0];
  for (let k = 0; k < 30; k++) {
    K.stepCloud(c, 800, 0.1);
    for (let i = 0; i < c.N; i++) { K.posOf(c, i, p); assert.ok(p[0] >= 0 && p[0] <= c.a, '隔板左邊'); }
  }
  const s0 = K.cloudStats(c);
  assert.strictEqual(s0.nR, 0, '隔板還在時右邊沒有粒子');
  K.removePartition(c);
  for (let k = 0; k < 200; k++) {
    K.stepCloud(c, 800, 0.05);
    const s = K.cloudStats(c);
    assert.strictEqual(s.nL + s.nR, c.N);
    if (k % 20 === 0) for (let i = 0; i < c.N; i++) {
      K.posOf(c, i, p);
      assert.ok(p[0] >= 0 && p[0] <= c.Lx && p[1] >= 0 && p[1] <= c.Ly && p[2] >= 0 && p[2] <= c.Lz, '在盒子裡');
    }
  }
});

test('拿掉隔板那一刻位置不跳動，位移從 0 開始量', () => {
  const c = K.createCloud({ N: 100 }, K.rng(3));
  for (let k = 0; k < 10; k++) K.stepCloud(c, 900, 0.2);
  const before = [];
  for (let i = 0; i < c.N; i++) before.push(K.posOf(c, i).slice());
  K.removePartition(c);
  for (let i = 0; i < c.N; i++) { const p = K.posOf(c, i); for (let j = 0; j < 3; j++) near(p[j], before[i][j], 1e-9); }
  const s = K.cloudStats(c);
  assert.strictEqual(s.msdX, 0); assert.strictEqual(c.t, 0); assert.strictEqual(c.theta, 0);
});

test('均方位移與時間成正比：⟨Δx²⟩ = 2Dt（一維），⟨Δr²⟩ = 6Dt（三維），斜率誤差 < 3%', () => {
  const D = 400;
  const c = K.createCloud({ N: 6000 }, K.rng(20261112));
  K.removePartition(c);
  const ts = [], xs = [], rs = [];
  for (let k = 0; k < 60; k++) {
    K.stepCloud(c, D, 0.05);
    const s = K.cloudStats(c);
    ts.push(c.t); xs.push(s.msdX); rs.push(s.msd3);
  }
  near(K.fitSlope(ts, xs) / (2 * D), 1, 0.03, '一維斜率 ÷ 2D');
  near(K.fitSlope(ts, rs) / (6 * D), 1, 0.02, '三維斜率 ÷ 6D');
  close(c.theta, D * c.t, 1e-12, 'Θ = ∫D dt');
});

test('布朗運動可以任意切分步伐：一步 1 s 與 100 步各 0.01 s 的 ⟨Δx²⟩ 一樣（統計上）', () => {
  const D = 250;
  const a = K.createCloud({ N: 20000 }, K.rng(5)), b = K.createCloud({ N: 20000 }, K.rng(6));
  K.removePartition(a); K.removePartition(b);
  K.stepCloud(a, D, 1);
  for (let k = 0; k < 100; k++) K.stepCloud(b, D, 0.01);
  near(K.cloudStats(a).msdX / (2 * D), 1, 0.03, '一大步');
  near(K.cloudStats(b).msdX / (2 * D), 1, 0.03, '一百小步');
});

test('擬合斜率：資料剛好在直線上時算回原本的斜率', () => {
  const ts = [0.1, 0.5, 1, 2, 3], ys = ts.map(t => 3.7 * t);
  close(K.fitSlope(ts, ys), 3.7, 1e-12);
});

test('濃度剖面的理論：粒子總數守恆、Θ = 0 是階梯、Θ → ∞ 變均勻；右半邊比例從 0 單調增加到 1/2', () => {
  const N = 600, a = 100, L = 200;
  for (const th of [0, 10, 300, 3000, 30000, 3e5]) {
    const bins = K.expectedBins(N, a, L, th, 20);
    near(bins.reduce((s, v) => s + v, 0), N, 1e-6 * N, 'Θ=' + th + ' 總數');
  }
  const b0 = K.expectedBins(N, a, L, 0, 20);
  near(b0[0], N / 10, 1e-9, '起始：左半每格 N/10'); near(b0[15], 0, 1e-9, '起始：右半是 0');
  const bInf = K.expectedBins(N, a, L, 1e6, 20);
  bInf.forEach(v => near(v, N / 20, 1e-6, '均勻'));
  let prev = -1;
  for (let th = 0; th <= 20000; th += 500) {
    const f = K.fracRightTheory(a, L, th);
    assert.ok(f >= prev - 1e-12 && f <= 0.5 + 1e-9, 'Θ=' + th);
    prev = f;
  }
  near(K.fracRightTheory(a, L, 1e6), 0.5, 1e-9);
});

test('模擬的濃度剖面與擴散方程式的解相符（含反射壁；600 個粒子，每格偏差在統計誤差內）', () => {
  const D = 500;
  let worst = 0, sumChi = 0, runs = 0;
  for (let r = 0; r < 40; r++) {
    const c = K.createCloud({}, K.rng(100 + r));
    K.removePartition(c);
    for (let k = 0; k < 40; k++) K.stepCloud(c, D, 0.1);   // Θ = 2000 μm²
    const h = K.histogram(c, 10), e = K.expectedBins(c.N, c.a, c.Lx, c.theta, 10);
    let chi = 0;
    for (let b = 0; b < 10; b++) chi += (h[b] - e[b]) ** 2 / e[b];
    sumChi += chi; runs++;
    worst = Math.max(worst, Math.abs(K.cloudStats(c).fracR - K.fracRightTheory(c.a, c.Lx, c.theta)));
  }
  // 卡方的平均值應接近自由度 9（多項分布），不會差到 2 倍
  assert.ok(sumChi / runs > 5 && sumChi / runs < 14, '平均卡方 ' + (sumChi / runs));
  assert.ok(worst < 0.08, '右半邊比例與理論最多差 ' + worst);
});

test('D 中途改變時，剖面與均方位移的理論只看 Θ = ∫D dt', () => {
  const c = K.createCloud({ N: 8000 }, K.rng(77));
  K.removePartition(c);
  for (let k = 0; k < 20; k++) K.stepCloud(c, 200, 0.1);
  for (let k = 0; k < 20; k++) K.stepCloud(c, 800, 0.1);
  close(c.theta, 200 * 2 + 800 * 2, 1e-12, 'Θ');
  near(K.cloudStats(c).msdX / (2 * c.theta), 1, 0.04, '⟨Δx²⟩ = 2Θ');
  near(K.cloudStats(c).fracR, K.fracRightTheory(c.a, c.Lx, c.theta), 0.02, '右半邊比例');
});

// ---------------------------------------------------------------- 滲透
test('凡特荷夫：π = iCRT；1 mmol/L、25 °C 是 2.479 kPa，0.9% 食鹽水約 7.6 atm', () => {
  near(K.osmoticPressure(1, 25), 2478.96, 0.05, '1 mOsm/L');
  const C = K.molarFromPercent(0.9, K.SOLUTES.nacl.M);
  near(C, 154.0, 0.1, '0.9% NaCl 的濃度');
  near(K.osmoticPressure(2 * C, 37) / 101325, 7.83, 0.02, '37 °C 理想值（atm）');
  close(K.osmoticPressure(2, 40) / K.osmoticPressure(2, 0), 313.15 / 273.15, 1e-12, 'π ∝ T');
  near(K.percentWV(154, K.SOLUTES.nacl.M), 0.9, 0.001, '回算百分濃度');
});

test('滲透計平衡：ρgh 正好等於「稀釋後」的滲透壓差，解析解、二分法與時間模擬三者一致', () => {
  for (const [osm, Tc] of [[0.5, 0], [1, 25], [2, 25], [4, 37], [6, 40]]) {
    const st = K.osmoCreate({ iL: 1, CL: 0, iR: osm >= 4 ? (osm >= 6 ? 3 : 2) : 1, CR: osm >= 4 ? (osm >= 6 ? 2 : 2) : osm });
    const eq = K.osmoEquilibrium(st, Tc, 0);
    assert.strictEqual(eq.limited, null);
    const sR = st.sR, CReq = sR / (K.LB + eq.x);
    close(K.waterDensity(Tc) * K.G * eq.h, K.osmoticPressure(st.iR * CReq, Tc), 1e-9, 'ρgh = π（osm=' + osm + '）');
    close(K.osmoEqPureLeft(st.iR * st.CR0, Tc), eq.h, 1e-9, '解析解');
    // 不考慮稀釋時 h0 = π0／(ρg) 比較大
    assert.ok(K.osmoticPressure(st.iR * st.CR0, Tc) / (K.waterDensity(Tc) * K.G) > eq.h, '稀釋讓液面差變小');
    for (let k = 0; k < 200; k++) K.osmoStep(st, Tc, 0, 60);
    near(2 * st.x, eq.h, 1e-5, '模擬 200 分鐘後');
  }
});

test('滲透計守恆：溶質量不變（濃度 × 體積）、液體總量不變（左右液面相加不變）', () => {
  const st = K.osmoCreate({ iL: 2, CL: 0.4, iR: 1, CR: 1.7 });
  const nL0 = K.concL(st) * (K.LB - st.x), nR0 = K.concR(st) * (K.LB + st.x);
  for (let k = 0; k < 50; k++) {
    K.osmoStep(st, 30, 0, 30);
    const r = K.osmoReadout(st, 30, 0);
    close(r.CL * (K.LB - st.x), nL0, 1e-12, '左邊溶質');
    close(r.CR * (K.LB + st.x), nR0, 1e-12, '右邊溶質');
    close(r.hL + r.hR, 2 * K.UTUBE.L0, 1e-12, '液體體積');
  }
});

test('極限：兩邊的滲透濃度相同（即使溶質不同）就沒有淨水流', () => {
  const same = K.osmoCreate({ iL: 1, CL: 1.2, iR: 1, CR: 1.2 });
  near(K.osmoRate(same, 0, 25, 0), 0, 1e-18, '同溶質同濃度');
  const diff = K.osmoCreate({ iL: 2, CL: 0.6, iR: 1, CR: 1.2 });   // 食鹽 0.6 對 葡萄糖 1.2：iC 都是 1.2
  near(K.osmoRate(diff, 0, 25, 0), 0, 1e-18, '食鹽 0.6 對葡萄糖 1.2');
  for (let k = 0; k < 100; k++) K.osmoStep(diff, 25, 0, 60);
  near(diff.x, 0, 1e-12, '模擬 100 分鐘仍是 0');
  const pure = K.osmoCreate({ CL: 0, CR: 0 });
  K.osmoStep(pure, 25, 0, 3600);
  near(pure.x, 0, 1e-15, '兩邊都是純水');
});

test('滲透壓的定義：活塞壓力 P = π 時液面差維持 0；P 大於 π 時水被壓回純水那一側（逆滲透）', () => {
  const st = K.osmoCreate({ iL: 1, CL: 0, iR: 2, CR: 0.8 });
  const pi0 = K.osmoticPressure(1.6, 25);
  near(K.osmoDrive(st, 0, 25, pi0), 0, 1e-9, '驅動壓力為 0');
  const eq = K.osmoEquilibrium(st, 25, pi0);
  near(eq.h, 0, 1e-10, '平衡液面差 0');
  const ro = K.osmoCreate({ iL: 1, CL: 0, iR: 2, CR: 0.8 });
  for (let k = 0; k < 120; k++) K.osmoStep(ro, 25, pi0 + 3000, 60);
  assert.ok(ro.x < -0.1, '逆滲透：右管降低 ' + ro.x);
  const r = K.osmoReadout(ro, 25, pi0 + 3000);
  near(r.dpi - r.rhogh - r.P, 0, 1, '逆滲透的平衡：Δπ − ρgh − P = 0（Pa）');
  assert.ok(r.CR > 0.8, '溶液被濃縮');
});

test('滲透計：溫度越高，平衡液面差越大；濃度相同時食鹽（i = 2）約是葡萄糖的兩倍', () => {
  const h = Tc => K.osmoEqPureLeft(1, Tc);
  assert.ok(h(40) > h(25) && h(25) > h(0));
  const g = K.osmoEqPureLeft(0.5, 25), n = K.osmoEqPureLeft(1.0, 25);   // 葡萄糖 0.5 → osm 0.5；食鹽 0.5 → osm 1.0
  assert.ok(n / g > 1.8 && n / g < 2, '稀釋讓比值略小於 2：' + n / g);
});

test('滲透計在所有滑桿範圍內都不會溢出管頂；液面不會穿過彎管（太極端時標示 limited）', () => {
  let worst = 0;
  for (const iR of [1, 2, 3]) for (const CR of [0, 1, 2]) for (const Tc of [0, 40]) {
    const st = K.osmoCreate({ iL: 1, CL: 0, iR: iR, CR: CR });
    const eq = K.osmoEquilibrium(st, Tc, 0);
    worst = Math.max(worst, K.UTUBE.L0 + Math.abs(eq.x));
    assert.ok(eq.x < K.UTUBE.L0, '左管沒有流乾');
  }
  assert.ok(worst < K.UTUBE.top, '最高液面 ' + worst);
  const ex = K.osmoCreate({ iL: 3, CL: 2, iR: 1, CR: 0 });
  const eq = K.osmoEquilibrium(ex, 40, 6000);
  assert.strictEqual(eq.limited, 'right', '左邊很濃又加壓：右管的水被壓光');
  for (let k = 0; k < 300; k++) K.osmoStep(ex, 40, 6000, 60);
  near(ex.x, -(K.UTUBE.L0 - K.UTUBE.margin), 1e-12, '停在彎管上方');
});

// ---------------------------------------------------------------- 細胞
test('紅血球：平衡體積遵守 Boyle–van’t Hoff（V = V_b + n／C）；300 mOsm/L 時 90 fL', () => {
  near(K.cellEquilibrium('rbc', 300, 25).V, 90, 1e-9, '等張');
  near(K.cellEquilibrium('rbc', 600, 25).V, 36 + 27, 1e-9, '兩倍濃度：只有可滲透的部分減半');
  near(K.cellEquilibrium('rbc', 150, 37).V, 36 + 108, 1e-9, '一半濃度，與溫度無關');
  near(K.cellRate('rbc', 90, 300, 25), 0, 1e-12, '等張時沒有淨水流');
});

test('紅血球：膨脹到與表面積相同的球（約 149 fL）就溶血；門檻約 143 mOsm/L（約 0.42% 食鹽水）', () => {
  near(K.RBC.Vlysis, 149.1, 0.1, '球形體積');
  const Cth = K.RBC.n / (K.RBC.Vlysis - K.RBC.Vb);
  near(Cth, 143.2, 0.1, '門檻');
  near(K.percentWV(Cth / 2, K.SOLUTES.nacl.M), 0.42, 0.005, '食鹽水百分濃度');
  assert.ok(K.cellEquilibrium('rbc', Cth - 0.5, 25).lysis && !K.cellEquilibrium('rbc', Cth + 0.5, 25).lysis);
  const c = K.cellCreate('rbc');
  for (let k = 0; k < 60; k++) K.cellStep(c, 0, 25, 0.1);
  assert.ok(c.lysed, '純水中會溶血');
  const v = c.V;
  K.cellStep(c, 900, 25, 10);
  assert.strictEqual(c.V, v, '溶血後不再回縮（不可逆）');
});

test('紅血球：時間模擬收斂到平衡體積，膨脹與皺縮都是單調的（沒有過衝）', () => {
  for (const C of [160, 250, 300, 450, 900]) {
    const c = K.cellCreate('rbc');
    const eq = K.cellEquilibrium('rbc', C, 25).V;
    let prev = c.V;
    for (let k = 0; k < 1500; k++) {   // 低張時時間常數較長（約 4 秒），模擬 75 秒
      K.cellStep(c, C, 25, 0.05);
      if (C < 300) assert.ok(c.V >= prev - 1e-9); else assert.ok(c.V <= prev + 1e-9);
      prev = c.V;
    }
    near(c.V, eq, 0.01, 'C=' + C);
  }
});

test('植物細胞：在清水中膨壓等於細胞液的滲透壓（約 0.86 MPa），不會破；平衡時 π_in − π_out = P', () => {
  const eq = K.cellEquilibrium('plant', 0, 25);
  near(eq.P, 856, 2, '膨壓 kPa');
  close(K.piIn('plant', eq.V, 25) - 0, eq.P, 1e-9, 'π_in = P');
  for (const C of [0, 100, 250, 350]) {
    const e = K.cellEquilibrium('plant', C, 30);
    close(K.piIn('plant', e.V, 30) - K.RTkPa(30) * C, e.P, 1e-7, 'C=' + C);
    assert.ok(e.V > 1 && e.P > 0, '低張：膨脹、有膨壓');
  }
  const c = K.cellCreate('plant', 25);
  for (let k = 0; k < 100; k++) K.cellStep(c, 0, 25, 0.1);
  assert.ok(!c.lysed && c.V < 1.2, '有細胞壁撐住');
});

test('植物細胞：外液 400 mOsm/L 時剛好初始質壁分離（膨壓 0、原生質體貼著細胞壁）；更濃時 V = V_b + (1 − V_b)·400／C', () => {
  const e = K.cellEquilibrium('plant', 400, 20);
  near(e.V, 1, 1e-9); near(e.P, 0, 1e-6);
  for (const C of [500, 800, 1200]) near(K.cellEquilibrium('plant', C, 25).V, 0.1 + 0.9 * 400 / C, 1e-9, 'C=' + C);
  const c = K.cellCreate('plant', 25);
  for (let k = 0; k < 600; k++) K.cellStep(c, 800, 25, 0.1);
  near(c.V, 0.55, 1e-3, '質壁分離後的體積');
  near(K.turgor('plant', c.V), 0, 0, '沒有膨壓');
});

test('同一套模型：同一杯清水裡紅血球溶血、植物細胞卻只是變硬', () => {
  const r = K.cellCreate('rbc'), p = K.cellCreate('plant', 25);
  for (let k = 0; k < 100; k++) { K.cellStep(r, 0, 25, 0.1); K.cellStep(p, 0, 25, 0.1); }
  assert.ok(r.lysed && !p.lysed && K.turgor('plant', p.V) > 800);
});

test('張力的判斷：相差 3% 以內是等張，低於是低張、高於是高張', () => {
  assert.strictEqual(K.tonicity(300, 300), 'iso');
  assert.strictEqual(K.tonicity(308, 300), 'iso', '0.9% 食鹽水（理想 308 mOsm/L）');
  assert.strictEqual(K.tonicity(150, 300), 'hypo');
  assert.strictEqual(K.tonicity(600, 300), 'hyper');
  assert.strictEqual(K.tonicity(330, 300, 0.05), 'hyper');
});

test('紅血球外形（畫面用）：90 fL 是 Evans–Fung 雙凹圓盤、溶血前是同表面積的球，中間內插的體積與物理體積相符', () => {
  near(K.rbcShapeVolume(0, 1), 90, 0.05, '圓盤');
  near(K.rbcShapeVolume(1, 1), K.RBC.Vlysis, 0.05, '球');
  for (const V of [95, 110, 130, 145]) {
    const s = K.rbcShape(V);
    near(K.rbcShapeVolume(s.s, s.f), V, 0.3, 'V=' + V);
  }
  const cr = K.rbcShape(60);
  near(K.rbcShapeVolume(cr.s, cr.f), 60, 0.05, '皺縮：變薄後的體積');
  assert.ok(cr.cren > 0 && K.rbcShape(90).cren === 0);
  // 中央凹陷：圓盤中心比邊緣薄
  assert.ok(K.rbcProfilePoint(0, 0, 1)[1] < K.rbcProfilePoint(1.0, 0, 1)[1]);
});

console.log(`\n${passed} 項測試通過`);
