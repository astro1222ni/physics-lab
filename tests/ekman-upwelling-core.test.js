// 以 Node 執行：node tests/ekman-upwelling-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/ekman-upwelling-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }

console.log('ekman-upwelling-core');

test('科氏參數 f = 2Ω sin φ；風應力 τ = ρ_air C_D U²（Large & Pond）', () => {
  near(K.coriolis(30), 7.2921e-5, 1e-12);
  near(K.coriolis(-30), -7.2921e-5, 1e-12);
  near(K.dragCoeff(8), 1.2e-3, 1e-12);
  near(K.dragCoeff(20), (0.49 + 1.3) * 1e-3, 1e-12);
  // 10 m/s 的風：約 0.146 N/m²
  near(K.windStress(10), 1.22 * 1.2e-3 * 100, 1e-12);
  near(K.windStress(-10), -K.windStress(10), 1e-12);
});

test('艾克曼螺旋：表面流偏 45°、到艾克曼深度剛好反向且只剩 e^{−π}', () => {
  const E = K.ekman({ lat: 35, U: 10, windFrom: 180, Av: 0.02 });   // 南風：往北吹
  near(E.windTo, 0, 1e-12);
  near(K.ekmanAt(E, 0).az, 45, 1e-9, '北半球偏右');
  near(K.ekmanAt(E, 0).speed, E.V0, 1e-12);
  const deep = K.ekmanAt(E, -E.DE);
  near(Math.abs(K.turn(K.ekmanAt(E, 0).az, deep.az)), 180, 1e-9, '艾克曼深度反向');
  near(deep.speed / E.V0, Math.exp(-Math.PI), 1e-12);
  const S = K.ekman({ lat: -35, U: 10, windFrom: 180, Av: 0.02 });
  near(K.ekmanAt(S, 0).az, 315, 1e-9, '南半球偏左');
  // 越深越往右轉（北半球）
  let prev = K.ekmanAt(E, 0).az;
  for (let z = -2; z >= -E.DE; z -= 2) { const a = K.ekmanAt(E, z).az; assert.ok(K.turn(prev, a) > 0); prev = a; }
});

test('艾克曼輸送：數值積分 = τ/(ρ|f|)，方向和風垂直（北半球偏右、南半球偏左）', () => {
  [[35, 10, 0.02, 1], [15, 6, 0.005, 1], [-50, 18, 0.08, -1]].forEach(q => {
    const E = K.ekman({ lat: q[0], U: q[1], windFrom: 30, Av: q[2] });
    const T = K.ekmanTransport(E);
    near(T.M / E.M, 1, 1e-5, '輸送量 lat ' + q[0]);
    near(K.turn(E.windTo, T.az), 90 * q[3], 1e-3, '輸送方向 lat ' + q[0]);
    near(E.M, E.tau / (K.RHO_W * Math.abs(E.f)), 1e-12);
    // 淨輸送和 Av 無關
    near(K.ekman({ lat: q[0], U: q[1], windFrom: 30, Av: q[2] * 3 }).M, E.M, 1e-12);
  });
});

test('典型數值：中緯度 10 m/s 的風，表面流約為風速的 1–3%、艾克曼深度數十公尺', () => {
  const E = K.ekman({ lat: 45, U: 10, windFrom: 0, Av: 0.02 });
  assert.ok(E.ratio > 0.008 && E.ratio < 0.04, 'V0/U = ' + E.ratio);
  assert.ok(E.DE > 40 && E.DE < 100, 'DE = ' + E.DE);
  // D_E = π √(2Av/|f|)
  near(E.DE, Math.PI * Math.sqrt(2 * 0.02 / Math.abs(K.coriolis(45))), 1e-12);
});

test('沿岸湧升：北半球海在西邊要北風、南半球（秘魯）要南風；方向反過來變成下沉', () => {
  const ca = K.coastal({ lat: 37, U: 10, windFrom: 0, coast: 'W', H1: 30, days: 5 });   // 加州：北風
  assert.ok(ca.Moff > 0 && ca.eta0 > 0);
  near(ca.Moff, ca.E.M, 1e-12, '風和海岸平行時整個輸送都離岸');
  const pe = K.coastal({ lat: -12, U: 8, windFrom: 180, coast: 'W', H1: 30, days: 5 });  // 秘魯：南風
  assert.ok(pe.Moff > 0);
  const dn = K.coastal({ lat: 37, U: 10, windFrom: 180, coast: 'W', H1: 30, days: 5 });
  assert.ok(dn.Moff < 0 && dn.eta0 < 0 && dn.sst0 === K.T_S, '下沉時岸邊仍是暖水');
  // 垂直海岸吹的風：輸送和海岸平行，不湧升
  near(K.coastal({ lat: 37, U: 10, windFrom: 90, coast: 'W', H1: 30, days: 5 }).Moff, 0, 1e-12);
});

test('沿岸湧升的質量守恆：∫η dx = 離岸輸送 × 時間；w = M⊥/R', () => {
  const C = K.coastal({ lat: 37, U: 12, windFrom: 0, coast: 'W', H1: 40, days: 3 });
  let s = 0; const dx = C.Rd / 2000;
  for (let x = 0; x < 30 * C.Rd; x += dx) s += K.etaAt(C, x + dx / 2) * dx;
  near(s / (C.Moff * 3 * 86400), 1, 1e-6);
  near(C.w, C.Moff / C.Rd, 1e-15);
  near(C.Rd, Math.sqrt(K.GP_COAST * 40) / Math.abs(K.coriolis(37)), 1e-9);
  // 典型：數公尺到十幾公尺／天、R 約 10 km
  assert.ok(C.wDay > 5 && C.wDay < 30, 'w = ' + C.wDay);
  assert.ok(C.Rd > 5e3 && C.Rd < 3e4, 'R = ' + C.Rd);
});

test('冷水露頭：η(0) ≥ H1 時岸邊海溫低於表層，露頭的天數 = H1 R / M⊥', () => {
  const base = { lat: 37, U: 12, windFrom: 0, coast: 'W', H1: 30 };
  const t1 = K.coastal(Object.assign({ days: 0 }, base)).tOut;
  const a = K.coastal(Object.assign({ days: t1 * 0.99 }, base)), b = K.coastal(Object.assign({ days: t1 * 1.01 }, base));
  assert.ok(!a.out && a.sst0 === K.T_S);
  assert.ok(b.out && b.sst0 < K.T_S && b.front > 0);
  // 露頭位置：η(front) = H1
  near(K.etaAt(b, b.front), 30, 1e-9);
  // 營養鹽隨冷水上來
  const c = K.coastal(Object.assign({ days: t1 * 3 }, base));
  assert.ok(c.no3 > 5 && c.sst0 < b.sst0);
  // 原本剖面：表層暖、深層冷
  near(K.tempAt(0, 30), K.T_S, 0); near(K.tempAt(-2000, 30), K.T_D, 1e-6);
});

test('赤道太平洋：信風越強溫躍層越傾斜，Δh = τL/(ρg′H)，海面高低差 = (g′/g)Δh', () => {
  const Q = K.equator({ p: 1 });
  near(Q.U, 6, 1e-12); near(Q.tau, K.windStress(6), 1e-12);
  near(Q.dh, Q.tau * K.L_PAC / (K.RHO_W * K.GP_EQ * K.H_EQ), 1e-9);
  near(Q.hW - Q.hE, Q.dh, 1e-9);
  near(Q.deta, K.GP_EQ / K.G * Q.dh, 1e-12);
  // 平常：西邊約 200 m、東邊約 40 m、海面差約 0.5–0.7 m
  assert.ok(Q.hW > 180 && Q.hW < 220 && Q.hE > 25 && Q.hE < 55, Q.hW + ' ' + Q.hE);
  assert.ok(Q.deta > 0.4 && Q.deta < 0.8, 'Δη ' + Q.deta);
  // 沒有風：溫躍層平的；西風：東邊比較深
  const z = K.equator({ p: 0 }); near(z.dh, 0, 0); near(z.hE, K.H_EQ, 0);
  const w = K.equator({ p: -0.3 }); assert.ok(w.hE > w.hW && w.deta < 0);
  // 溫躍層深度沿赤道線性變化
  near(K.thermoAt(Q, 0), Q.hW, 1e-9); near(K.thermoAt(Q, 1), Q.hE, 1e-9);
});

test('東太平洋海溫：溫躍層越淺越冷；信風減弱 → 類似聖嬰、增強 → 類似反聖嬰', () => {
  const n = K.equator({ p: 1 });
  assert.strictEqual(K.ensoState(n).state, 'neutral');
  near(K.ensoState(n).anom, 0, 1e-12);
  assert.strictEqual(K.ensoState(K.equator({ p: 0.8 })).state, 'nino');
  assert.strictEqual(K.ensoState(K.equator({ p: 1.2 })).state, 'nina');
  assert.strictEqual(K.ensoState(K.equator({ p: 0.97 })).state, 'neutral');
  assert.strictEqual(K.ensoState(K.equator({ p: 1.03 })).state, 'neutral');
  // 溫躍層深度和應力成線性
  near(K.equator({ p: 0.5 }).dh * 2, K.equator({ p: 1 }).dh, 1e-9);
  assert.ok(K.equator({ p: 1.6 }).outcrop && !K.equator({ p: 1.4 }).outcrop);
  // 單調：風越強東邊越冷
  let prev = Infinity;
  for (let p = -0.5; p <= 2; p += 0.05) { const s = K.equator({ p: p }).sstE; assert.ok(s <= prev + 1e-12); prev = s; }
  // 西太平洋暖池一直是暖的
  assert.ok(n.sstW > 28.5);
});

console.log(`\n${passed} 項通過${process.exitCode ? '（有失敗）' : ''}`);
