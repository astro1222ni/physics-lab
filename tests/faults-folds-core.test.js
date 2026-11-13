// 以 Node 執行：node tests/faults-folds-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/faults-folds-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const base = { z: 5, kH: 0.8, kh: 0.6, az: 0, lam: K.HYDRO, mu: 0.6, plane: 0, slip: 400, erode: false };
const O = o => Object.assign({}, base, o);

console.log('faults-folds-core');

test('垂直應力 = ρgz：5 km 深約 132 MPa；靜水孔隙壓力比 1000/2700', () => {
  near(K.stress(O()).Sv, 2700 * 9.81 * 5000 / 1e6, 1e-9);
  near(K.stress(O()).Sv, 132.4, 0.1);
  near(K.HYDRO, 0.37037, 1e-5);
});

test('安德森分類：Sv 最大 → 正斷層；居中 → 平移；最小 → 逆斷層', () => {
  assert.strictEqual(K.stress(O({ kH: 0.8, kh: 0.5 })).regime, 'normal');
  assert.strictEqual(K.stress(O({ kH: 1.6, kh: 0.6 })).regime, 'strike');
  assert.strictEqual(K.stress(O({ kH: 2.0, kh: 1.4 })).regime, 'reverse');
  // kh > kH 時自動對調
  const s = K.stress(O({ kH: 0.5, kh: 0.9 }));
  near(s.SH, 0.9 * s.Sv, 1e-9); near(s.Sh, 0.5 * s.Sv, 1e-9);
});

test('應力張量的主值與主方向就是輸入的 SH、Sh、Sv', () => {
  const s = K.stress(O({ kH: 1.7, kh: 0.9, az: 37 }));
  [[s.SH, s.eH], [s.Sh, s.eh], [s.Sv, [0, 0, 1]]].forEach(q => {
    const v = [0, 1, 2].map(i => K.dot(s.M[i], q[1]));
    for (let i = 0; i < 3; i++) near(v[i], q[0] * q[1][i], 1e-9);
  });
});

test('庫倫臨界：最佳破裂面上 τ/σn′ 剛好 = μ，臨界應力比 (√(1+μ²)+μ)²', () => {
  near(K.qCrit(0.6), 3.1200, 1e-3);
  near(K.qCrit(0), 1, 1e-12);
  // 調 Sh 讓應力比剛好等於 q，最佳面上的摩擦比 = μ
  [0.4, 0.6, 0.85].forEach(mu => {
    const lam = K.HYDRO, q = K.qCrit(mu);
    const kh = lam + (1 - lam) / q;  // 正斷層：(1−λ)/(kh−λ) = q
    const st = K.stress(O({ mu: mu, kH: 0.9, kh: kh }));
    near(st.ratio, q, 1e-9, 'μ = ' + mu);
    K.optimalPlanes(st).forEach(pl => { const r = K.resolve(st, pl); near(r.tau / r.snEff, mu, 1e-9, '最佳面 μ = ' + mu); });
    // 其他方向的面摩擦比都比較小
    for (let dip = 5; dip < 90; dip += 5) {
      const r = K.resolve(st, K.plane(0, dip)); assert.ok(r.tau / r.snEff <= mu + 1e-9, '傾角 ' + dip);
    }
  });
});

test('最佳破裂面的方向：正斷層傾角 45° + φ/2（μ = 0.6 → 60.5°），逆斷層 45° − φ/2（29.5°），平移斷層垂直、和 SH 夾 29.5°', () => {
  const phi = Math.atan(0.6) * 180 / Math.PI;
  const n = K.optimalPlanes(K.stress(O({ kH: 0.8, kh: 0.5 })));
  n.forEach(p => { near(p.dip, 45 + phi / 2, 1e-9); near(Math.abs(Math.sin((p.strike - 0) * Math.PI / 180)), 0, 1e-9, '走向平行 SH'); });
  near(Math.abs(n[0].dd - n[1].dd), 180, 1e-9, '兩個共軛面的傾向相反');
  const r = K.optimalPlanes(K.stress(O({ kH: 2.0, kh: 1.4, az: 30 })));
  r.forEach(p => { near(p.dip, 45 - phi / 2, 1e-9); near(Math.abs(Math.cos((p.strike - 30) * Math.PI / 180)), 0, 1e-9, '走向垂直 SH'); });
  const s = K.optimalPlanes(K.stress(O({ kH: 1.6, kh: 0.6, az: 0 })));
  s.forEach(p => {
    near(p.dip, 90, 1e-9);
    const a = Math.abs(((p.strike % 180) + 180) % 180), d = Math.min(a, 180 - a);
    near(d, 45 - phi / 2, 1e-9, '和 SH 的夾角');
  });
});

test('滑動方向（華勒斯－博特）：正斷層 rake −90、逆斷層 +90、平移斷層 0 或 180，兩個共軛面左移右移相反', () => {
  K.optimalPlanes(K.stress(O({ kH: 0.8, kh: 0.5 }))).forEach(p => near(K.resolve(K.stress(O({ kH: 0.8, kh: 0.5 })), p).rake, -90, 1e-6));
  const sr = K.stress(O({ kH: 2.0, kh: 1.4, az: 70 }));
  K.optimalPlanes(sr).forEach(p => near(K.resolve(sr, p).rake, 90, 1e-6));
  const ss = K.stress(O({ kH: 1.6, kh: 0.6, az: 20 }));
  const rk = K.optimalPlanes(ss).map(p => K.resolve(ss, p).rake);
  rk.forEach(r => assert.ok(Math.abs(Math.sin(r * Math.PI / 180)) < 1e-6, 'rake ' + r));
  const f0 = K.fault(O({ kH: 1.6, kh: 0.4, az: 20, plane: 0 })), f1 = K.fault(O({ kH: 1.6, kh: 0.4, az: 20, plane: 1 }));
  assert.ok(f0.d > 0 && f1.d > 0);
  assert.notStrictEqual(f0.lateral, f1.lateral, '共軛的兩個平移斷層一左一右');
  // 滑動方向一定在斷層面上
  [f0, f1].forEach(f => near(K.dot(f.u, f.pl.n), 0, 1e-9));
});

test('沒有達到臨界就不滑動；孔隙壓力升高可以讓斷層滑動', () => {
  const a = K.fault(O());               // kh = 0.6、靜水壓：(1−0.37)/(0.6−0.37) = 2.74 < 3.12
  assert.ok(!a.st.crit && a.d === 0 && a.throw === 0);
  const b = K.fault(O({ lam: 0.45 }));  // (0.55)/(0.15) = 3.67
  assert.ok(b.st.crit && !b.st.critHydro && b.d === 400);
  // 有效應力為負（張裂）：一定破裂
  const c = K.fault(O({ kh: 0.35, lam: 0.4 }));
  assert.ok(c.st.tensile && c.st.crit);
});

test('正斷層：上盤下降、水平拉開；逆斷層：上盤上升、水平縮短；落差 = 滑移 × sin(傾角)', () => {
  const n = K.fault(O({ kh: 0.4 }));
  near(n.throw, -400 * Math.sin(n.pl.dip * Math.PI / 180), 1e-6);
  assert.ok(n.heave > 0, '正斷層上盤往傾向移動（拉開）');
  const r = K.fault(O({ kH: 2.6, kh: 1.5 }));
  assert.ok(r.st.regime === 'reverse' && r.st.crit);
  near(r.throw, 400 * Math.sin(r.pl.dip * Math.PI / 180), 1e-6);
  assert.ok(r.heave < 0, '逆斷層上盤往反傾向移動（縮短）');
});

test('地層查詢：下盤不動、上盤依位移查回原位；侵蝕後逆斷層把老地層推到新地層旁邊', () => {
  const n = K.fault(O({ kh: 0.4 })), pl = n.pl;
  // 下盤：深度 600 m 是第 2 層
  const pf = [-pl.hd[0] * 800, -pl.hd[1] * 800, -600];
  assert.ok(!K.hangingSide(n, pf));
  assert.strictEqual(K.faultLayerAt(n, pf[0], pf[1] - 500, -600), 2);
  // 上盤的地表比下盤低 |落差|
  const ph = [pl.hd[0] * 800, pl.hd[1] * 800 + 500, n.throw + 10];
  assert.strictEqual(K.faultLayerAt(n, ph[0], ph[1], ph[2]), K.AIR);
  assert.strictEqual(K.faultLayerAt(n, ph[0], ph[1], n.throw - 10), 0);
  // 逆斷層 1100 m（落差約 539 m），侵蝕到原地表：上盤露出第 2 層、下盤第 0 層
  const r = K.fault(O({ kH: 2.6, kh: 1.5, slip: 1100, erode: true }));
  assert.strictEqual(r.e, 0);
  assert.deepStrictEqual(r.expo, { fw: 0, hw: Math.floor(r.throw / K.H) });
  assert.ok(r.expo.hw >= 2);
  // 正斷層侵蝕後：下盤露出較老的地層
  const ne = K.fault(O({ kh: 0.4, slip: 700, erode: true }));
  assert.ok(ne.expo.fw > ne.expo.hw, JSON.stringify(ne.expo));
  // 岩脈：上盤的岩脈跟著移動
  assert.strictEqual(K.faultLayerAt(n, -800 * pl.hd[0], -800 * pl.hd[1], -100), K.DIKE);
});

test('褶皺：翼部傾角 arctan(2πA/λ)、縮短率由弧長算出、Fleuty 分類', () => {
  const f = K.fold({ lam: 4000, A: 0, plunge: 0, az: 90, e: 2000 });
  near(f.shortening, 0, 1e-12); near(f.interlimb, 180, 1e-12); assert.strictEqual(f.cls, 'gentle');
  const g = K.fold({ lam: 4000, A: 400, plunge: 0, az: 90, e: 2000 });
  near(g.limbDip, Math.atan(2 * Math.PI * 0.1) * 180 / Math.PI, 1e-12);
  // 弧長和細分的折線長度比較
  let s = 0, prev = null;
  for (let i = 0; i <= 200000; i++) { const x = i / 200000 * 4000, y = 400 * Math.cos(2 * Math.PI * x / 4000); if (prev) s += Math.hypot(x - prev[0], y - prev[1]); prev = [x, y]; }
  near(g.arc, s, 0.01);
  near(g.shortening, 1 - 4000 / s, 1e-6);
  assert.strictEqual(K.foldClass(100), 'open'); assert.strictEqual(K.foldClass(50), 'close'); assert.strictEqual(K.foldClass(20), 'tight');
});

test('褶皺的地層：侵蝕後背斜核心露出較老的地層、向斜核心較年輕；傾沒時地層往傾沒方向變年輕', () => {
  const f = K.fold({ lam: 3000, A: 800, plunge: 0, az: 90, e: -300 });
  const ex = K.foldExposure(f);
  assert.ok(ex.crest > ex.trough, JSON.stringify(ex));
  // 沒侵蝕（e 很高）：地表全是最上面那一層
  const f0 = K.fold({ lam: 3000, A: 800, plunge: 0, az: 90, e: 1500 });
  assert.deepStrictEqual(K.foldExposure(f0).kinds, [0]);
  // 傾沒：沿著軸往 +y′ 走，同一個侵蝕面露出的地層越來越年輕
  const fp = K.fold({ lam: 3000, A: 800, plunge: 20, az: 90, e: -300 });
  const a = K.foldLayerAt(fp, 0, 1000, -301), b = K.foldLayerAt(fp, 0, -1000, -301);
  // σ1 東西向（az = 90）→ 軸南北向，y′ = −y
  assert.ok(a > b, a + ' ' + b);
});

console.log(`\n${passed} 項通過${process.exitCode ? '（有失敗）' : ''}`);
