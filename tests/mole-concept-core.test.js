// 以 Node 執行：node tests/mole-concept-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/mole-concept-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`); }
function rel(a, b, tol, msg) { near(a / b, 1, tol, (msg || '') + `（${a} 對 ${b}）`); }

test('常數：N_A = 6.02214076e23（定義值）、R = 8.314462618、V_m(STP) = 22.414 L、V_m(25 °C) = 24.465 L', function () {
  assert.strictEqual(C.NA, 6.02214076e23);
  near(C.VM.stp, 22.41397, 1e-4); near(C.VM.rt, 24.46540, 1e-4);
  // 洛施密特常數 2.686780111e19 cm⁻³（CODATA 2018，273.15 K、101.325 kPa）
  rel(C.LOSCHMIDT, 2.686780111e19, 1e-8);
  // V_m 與溫度成正比（查理定律）
  near(C.VM.rt / C.VM.stp, 298.15 / 273.15, 1e-12);
});

test('莫耳質量：由 IUPAC 原子量算出（H2O 18.015、CO2 44.009、NaCl 58.44、蔗糖 342.30、油酸 282.47）', function () {
  near(C.SUB.H2O.M, 18.015, 0.0005); near(C.SUB.CO2.M, 44.009, 0.0005);
  near(C.SUB.NaCl.M, 58.44, 0.0005); near(C.SUB.C12H22O11.M, 342.297, 0.001);
  near(C.OLEIC.M, 282.468, 0.001); near(C.SUB.C2H5OH.M, 46.069, 0.0005);
});

test('原子數與電子數：H2O 每個分子 3 個原子、10 個電子；NaCl 2 個離子、28 個電子；蔗糖 45 個原子', function () {
  assert.strictEqual(C.SUB.H2O.atoms, 3); assert.strictEqual(C.SUB.H2O.electrons, 10);
  assert.strictEqual(C.SUB.NaCl.atoms, 2); assert.strictEqual(C.SUB.NaCl.electrons, 28);
  assert.strictEqual(C.SUB.C12H22O11.atoms, 45);
  // 等電子：H2O、NH3、CH4 都是 10 個電子；N2 與 CO 都是 14 個
  ['NH3', 'CH4'].forEach(id => assert.strictEqual(C.SUB[id].electrons, 10));
  assert.strictEqual(C.SUB.N2.electrons, C.SUB.CO.electrons);
});

test('換算互逆：每種物質、每個單位 toMol(fromMol(n)) = n', function () {
  C.SUBS.forEach(s => ['g', 'mol', 'N', 'V'].forEach(u => ['stp', 'rt'].forEach(cd => {
    const n = 0.3172;
    rel(C.toMol(s, u, C.fromMol(s, u, n, cd), cd), n, 1e-12, s.id + ' ' + u);
  })));
});

test('1 mol 水 = 18.015 g = 6.022e23 個分子 = 1.807e24 個原子，體積 18.07 mL（25 °C）', function () {
  const w = C.sample(C.SUB.H2O, 1, 'stp');
  near(w.m, 18.015, 0.001); rel(w.N, 6.02214076e23, 1e-12); rel(w.atoms, 3 * 6.02214076e23, 1e-12);
  near(w.V, 18.068, 0.002);
  rel(w.mOne, 2.9915e-23, 1e-3, '一個水分子的質量（g）');
});

test('亞佛加厥定律：同溫同壓下，1 mol 任何氣體的體積都一樣；體積比 = 莫耳數比', function () {
  const a = C.sample(C.SUB.H2, 2, 'stp'), b = C.sample(C.SUB.O2, 1, 'stp');
  near(a.V / b.V, 2, 1e-12);
  near(C.sample(C.SUB.Cl2, 1, 'rt').V, C.sample(C.SUB.He, 1, 'rt').V, 1e-9);
  // 氣體密度 = M / V_m：O2 在 STP 1.4276 g/L
  near(C.sample(C.SUB.O2, 1, 'stp').density * 1000, 1.4276, 0.0005);
});

test('莫耳體積：鐵 7.0923 與銅 7.0922 cm³/mol 幾乎一樣；金 10.21、汞 14.82、水 18.07', function () {
  near(C.SUB.Fe.Vm, 7.0923, 1e-4); near(C.SUB.Cu.Vm, 7.0922, 1e-4);
  near(C.SUB.Au.Vm, 10.206, 1e-3); near(C.SUB.Hg.Vm, 14.821, 1e-3); near(C.SUB.H2O.Vm, 18.068, 1e-3);
});

test('晶格：面心立方與岩鹽結構每個晶胞 4 個（化學式單位），由密度算的結果與晶格常數一致（0.5% 以內）', function () {
  ['Cu', 'Au', 'NaCl'].forEach(id => { const z = C.ZOOM[id]; near(C.countInCube(z, z.lattice), 4, 0.02, id); });
  // 面心立方：最近原子距離 a/√2 = 2r
  near(C.ZOOM.Cu.lattice / Math.SQRT2, 2 * C.ZOOM.Cu.r, 0.002);
  near(C.ZOOM.Au.lattice / Math.SQRT2, 2 * C.ZOOM.Au.r, 0.002);
});

test('放大到原子：粒子數與 L³ 成正比；在間距 d 的立方體裡剛好 1 個；一滴 0.05 mL 的水約 1.67e21 個分子', function () {
  const z = C.ZOOM.H2O;
  near(C.countInCube(z, 2) / C.countInCube(z, 1), 8, 1e-9);
  near(C.countInCube(z, C.spacing(z)), 1, 1e-9);
  near(C.spacing(z), 0.3107, 1e-3);
  rel(C.countInVolume(z, 0.05), 1.6664e21, 1e-3);
  // L = 1 cm（1e7 nm）的立方體就是 1 mL
  rel(C.countInCube(z, 1e7), C.countInVolume(z, 1), 1e-12);
});

test('對切：一滴水最多切 70 刀；切完剩 1–2 個', function () {
  const N = C.countInVolume(C.ZOOM.H2O, 0.05), k = C.maxCuts(N);
  assert.strictEqual(k, 70);
  const left = N / Math.pow(2, k);
  assert.ok(left >= 1 && left < 2);
  assert.strictEqual(C.maxCuts(1), 0); assert.strictEqual(C.maxCuts(2), 1); assert.strictEqual(C.maxCuts(0.7), 0);
  // 數 1 mol 要 1.9e16 年，是宇宙年齡的 140 萬倍
  near(C.countYears(C.NA) / C.UNIVERSE_YEARS / 1e6, 1.383, 0.01);
});

test('油酸：分子體積 0.524 nm³、單分子膜厚 1.139 nm；立方體假設得到 N_A ≈ 2.13e23（偏小約 2.8 倍）', function () {
  near(C.OLEIC.vmol, 0.52408, 1e-4);
  near(C.OLEIC.h, 1.1393, 1e-4);
  rel(C.estimateNA(C.OLEIC.h, 1), 2.134e23, 2e-3);
  // 形狀假設 k = 高 ÷ 寬（真值）時，估計值剛好等於 N_A
  rel(C.estimateNA(C.OLEIC.h, C.OLEIC.k), C.NA, 1e-12);
  near(C.OLEIC.k, 1.680, 1e-3);
});

test('油膜形狀：面積精確等於「油酸體積 ÷ 膜厚」（數值積分 0.1% 以內）', function () {
  const s = C.createSession();
  const t = C.newTray(s, { dropper: 'mid', D: 1000, powder: 'thin' });
  C.drip(s, t); C.drip(s, t);
  let A = 0; const NS = 3600;
  for (let j = 0; j < NS; j++) { const r = C.filmR(t, 2 * Math.PI * j / NS); A += 0.5 * r * r * 2 * Math.PI / NS; }
  rel(A, t.Voil / (C.OLEIC.h * 1e-7), 1e-3);
  // 數格子的「精確覆蓋面積」與真實面積一致（8×8 取樣，0.5% 以內）
  rel(C.countCells(t, 0.5).exact, A, 5e-3);
});

test('油膜面積與滴數成正比（每滴體積有 ±4% 的差異），粉太厚面積只剩 75%', function () {
  const s = C.createSession(), t = C.newTray(s, { dropper: 'mid', D: 2000, powder: 'thin' });
  for (let i = 0; i < 4; i++) C.drip(s, t);
  near(t.A / 4 / (0.02 / 2000 / 1.1393e-7), 1, 0.04);
  const s2 = C.createSession(), t2 = C.newTray(s2, { dropper: 'mid', D: 2000, powder: 'thick' });
  for (let i = 0; i < 4; i++) C.drip(s2, t2);
  near(t2.A / t.A, 0.75, 1e-12, '同樣的滴（同一串偽亂數）');
});

test('校正滴管：5 mL 校正的估計值在 0.5% 以內；每一滴 ±4%', function () {
  ['fine', 'mid', 'wide'].forEach(d => {
    const c = C.calibrate(C.createSession(), d, 5);
    near(c.v / C.DROPPERS[d], 1, 0.006, d);
  });
  for (let i = 0; i < 500; i++) near(C.dropVolume('mid', i) / 0.02, 1, 0.04 + 1e-12);
});

test('數格子：超過半格算一格；大油膜（1 cm 格）誤差 2% 以內；碰到盤邊時面積被擋住', function () {
  const s = C.createSession(), t = C.newTray(s, { dropper: 'mid', D: 1000, powder: 'thin' });
  C.drip(s, t); C.drip(s, t); C.drip(s, t);
  const c1 = C.countCells(t, 1);
  near(c1.area / t.A, 1, 0.02);
  assert.ok(!C.touches(t));
  const t2 = C.newTray(s, { dropper: 'wide', D: 200, powder: 'thin' });
  C.drip(s, t2);
  assert.ok(C.touches(t2), '1:200 的一滴（約 1100 cm²）應該碰到盤邊');
  assert.ok(C.countCells(t2, 1).exact < t2.A * 0.98, '盤邊擋住，量到的面積變小');
});

test('分析：過原點直線的斜率 = 1/h；直線法與單次法用同一組數據的結果一致', function () {
  const rows = [1, 2, 3, 4].map(n => ({ Voil: n * 1e-5, A: n * 1e-5 / 1.2e-7, grid: 1, edge: false, powder: 'thin', dropper: 'mid', calVol: 5, D: 2000, tray: 0, drops: n }));
  const f = C.fitThroughOrigin(rows);
  near(f.h, 1.2, 1e-9); near(f.r2, 1, 1e-12);
  const a = C.analyze(rows, 'fit', 1), b = C.analyze(rows, 'last', 1);
  near(a.h, b.h, 1e-9);
  rel(a.NA, C.OLEIC.M / (C.OLEIC.rho * Math.pow(1.2e-7, 3)), 1e-12);
  // k 加倍 → N_A 變 4 倍
  rel(C.analyze(rows, 'fit', 2).NA, 4 * a.NA, 1e-12);
});

console.log(process.exitCode ? '有測試失敗' : '全部 ' + passed + ' 項通過');
