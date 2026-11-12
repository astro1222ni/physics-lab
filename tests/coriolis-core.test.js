// 以 Node 執行：node tests/coriolis-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/coriolis-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const H = 3600;
const uni = (G) => ({ type: 'uniform', G: G });
const low = (dp) => ({ type: 'low', dp: dp, sigma: K.SIGMA });
const high = (dp) => ({ type: 'high', dp: dp, sigma: K.SIGMA });

console.log('coriolis-core');

test('科氏參數 f = 2Ω sin φ：45° 為 1.031×10⁻⁴ s⁻¹，赤道為 0，南半球為負', () => {
  near(K.coriolisParam(45), 1.0313e-4, 1e-7);
  near(K.coriolisParam(0), 0, 1e-18);
  assert.ok(K.coriolisParam(-30) < 0);
  near(K.coriolisParam(-30), -K.coriolisParam(30), 1e-18);
});

test('慣性振盪週期 2π/|f|：北極 11.97 h（半個恆星日）、30° 23.93 h、赤道無限大', () => {
  near(K.inertialPeriod(90) / H, 86164.09 / 2 / H, 0.001);
  near(K.inertialPeriod(30) / H, 23.934, 0.002);
  assert.strictEqual(K.inertialPeriod(0), Infinity);
});

test('氣壓梯度：均勻場每 100 km 1 hPa＝0.001 Pa/m；低氣壓的梯度指向外（氣壓梯度力指向中心）', () => {
  const g = K.gradP(uni(1), 0, 0);
  near(g[1], -0.001, 1e-12);
  const gl = K.gradP(low(20), 200e3, 0);
  assert.ok(gl[0] > 0, '低氣壓：越往外氣壓越高');
  const gh = K.gradP(high(20), 200e3, 0);
  assert.ok(gh[0] < 0, '高氣壓：越往外氣壓越低');
  // 數值微分核對
  for (const F of [low(20), high(15)]) {
    const x = 150e3, y = -220e3, h = 1;
    const nx = (K.pressure(F, x + h, y) - K.pressure(F, x - h, y)) / (2 * h);
    const ny = (K.pressure(F, x, y + h) - K.pressure(F, x, y - h)) / (2 * h);
    const a = K.gradP(F, x, y);
    near(a[0], nx, 1e-9); near(a[1], ny, 1e-9);
  }
});

test('地轉風速 = |∇p|/(ρf)：25°N、每 100 km 1 hPa 約 13.5 m/s', () => {
  const v = K.geostrophicSpeed(uni(1), 0, 0, 25);
  near(v, 0.001 / (1.2 * 2 * K.OMEGA * Math.sin(25 * K.DEG)), 1e-9);
  near(v, 13.5, 0.1);
  assert.strictEqual(K.geostrophicSpeed(uni(1), 0, 0, 0), Infinity);
});

test('科氏力垂直於速度、不作功；北半球往右偏、南半球往左偏', () => {
  const s = { x: 0, y: 0, u: 10, v: 3 };
  const P = { lat: 30, k: 0, field: { type: 'none' } };
  const c = K.forces(P, s).cor;
  near(c[0] * s.u + c[1] * s.v, 0, 1e-15);
  assert.ok(s.u * c[1] - s.v * c[0] < 0, '北半球：科氏力在速度的右邊（叉積為負）');
  const cs = K.forces(Object.assign({}, P, { lat: -30 }), s).cor;
  assert.ok(s.u * cs[1] - s.v * cs[0] > 0, '南半球：在速度的左邊');
  near(Math.hypot(c[0], c[1]), K.coriolisParam(30) * Math.hypot(10, 3), 1e-15, '大小 f|v|');
});

test('均勻氣壓梯度：四階 Runge–Kutta 與解析解一致（含摩擦、從靜止或有初速）', () => {
  for (const P of [{ lat: 25, k: 0, field: uni(1.5) }, { lat: 40, k: 3e-5, field: uni(2) }, { lat: -20, k: 1e-5, field: uni(1) }, { lat: 60, k: 0, field: { type: 'none' } }]) {
    const s0 = { x: 1e5, y: -2e5, u: 4, v: -6 };
    const arr = K.integrate(P, s0, 48 * H, 120);
    const e = arr[arr.length - 1], a = K.analytic(P, s0, 48 * H);
    near(e.x, a.x, 5, 'x'); near(e.y, a.y, 5, 'y'); near(e.u, a.u, 1e-4, 'u'); near(e.v, a.v, 1e-4, 'v');
  }
});

test('沒有摩擦、從靜止開始：慣性振盪，平均速度＝地轉風、最大風速＝地轉風的兩倍、每 2π/f 回到靜止', () => {
  const P = { lat: 30, k: 0, field: uni(1) };
  const Tp = K.inertialPeriod(30), vg = K.geostrophicSpeed(P.field, 0, 0, 30);
  const s0 = { x: 0, y: 0, u: 0, v: 0 };
  const half = K.analytic(P, s0, Tp / 2), full = K.analytic(P, s0, Tp);
  near(Math.hypot(half.u, half.v), 2 * vg, 1e-9, '半週期時 2 倍');
  near(Math.hypot(full.u, full.v), 0, 1e-9, '一週期回到靜止');
  near(full.x / Tp, vg, 1e-6, '一週期平均速度＝地轉風（向東：北邊是低壓，北半球低壓在左手邊）');
  near(full.y, 0, 1e-3, '沒有跨越等壓線的淨位移');
});

test('有摩擦：最後的穩定風吹向低壓，角度 = atan(k/|f|)，風速 = 地轉風 × cos(角度)', () => {
  const P = { lat: 25, k: 3e-5, field: uni(1) };
  const st = K.steadyWind(P);
  const f = K.coriolisParam(25);
  near(st.angle, Math.atan(3e-5 / f) / K.DEG, 1e-9);
  near(st.speed, K.geostrophicSpeed(P.field, 0, 0, 25) * Math.cos(st.angle * K.DEG), 1e-9);
  const late = K.analytic(P, { x: 0, y: 0, u: 0, v: 0 }, 400 * H);
  near(K.crossAngle(P.field, late), st.angle, 1e-6, '數值上確實吹向低壓');
  // k = f 時剛好 45°
  near(K.steadyWind({ lat: 25, k: f, field: uni(1) }).angle, 45, 1e-9);
});

test('赤道（f = 0）：沒有偏向，空氣直直衝向低氣壓中心', () => {
  const P = { lat: 0, k: 0, field: low(20) };
  const arr = K.integrate(P, { x: 400e3, y: 0, u: 0, v: 0 }, 6 * H, 60);
  arr.forEach(s => near(s.y, 0, 1e-6));
  assert.ok(arr[arr.length - 1].x < 400e3);
  const d = K.deflection(P.field, arr[20]);
  near(d, 0, 1e-9);
});

test('北半球低氣壓逆時針、南半球順時針、北半球高氣壓順時針（白貝羅定律的旋轉方向）', () => {
  const turn = (P, s0) => {
    const arr = K.integrate(P, s0, 30 * H, 60);
    let w = 0;
    for (let i = 1; i < arr.length; i++) {
      let d = Math.atan2(arr[i].y, arr[i].x) - Math.atan2(arr[i - 1].y, arr[i - 1].x);
      if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      w += d;
    }
    return w;
  };
  const vg = (lat, F, r) => K.geostrophicSpeed(F, r, 0, lat);
  assert.ok(turn({ lat: 25, k: 1e-5, field: low(20) }, { x: 300e3, y: 0, u: 0, v: 0 }) > 0, '北半球低壓：逆時針');
  assert.ok(turn({ lat: -25, k: 1e-5, field: low(20) }, { x: 300e3, y: 0, u: 0, v: 0 }) < 0, '南半球低壓：順時針');
  assert.ok(turn({ lat: 25, k: 0, field: high(10) }, { x: 300e3, y: 0, u: 0, v: -0.5 * vg(25, high(10), 300e3) }) < 0, '北半球高壓：順時針');
});

test('沒有摩擦時守恆：動能＋氣壓位能（科氏力不作功）、圓形氣壓場的絕對角動量', () => {
  const P = { lat: 30, k: 0, field: low(25) };
  const s0 = { x: 350e3, y: 100e3, u: -3, v: 5 };
  const arr = K.integrate(P, s0, 72 * H, 60);
  const E0 = K.energy(P.field, s0), M0 = K.absAngMom(30, s0);
  arr.forEach(s => {
    near(K.energy(P.field, s), E0, 1e-4 * Math.abs(E0) * 1e-3 + 1e-3, '能量');
    near(K.absAngMom(30, s), M0, Math.abs(M0) * 1e-7, '絕對角動量');
  });
});

test('轉盤：慣性座標走直線；轉動座標裡的加速度 = 科氏加速度 −2Ω×v′ ＋ 離心加速度 Ω²r′', () => {
  const res = K.turntable({ omega: 1.2, v0: 0.8, aim: 20, r0: 0.4, R: 1 });
  const h = 1e-4;
  for (const t of [0.2, 0.5, 0.9]) {
    const p = K.turntableAt(res, t).rotating, pa = K.turntableAt(res, t - h).rotating, pb = K.turntableAt(res, t + h).rotating;
    const v = [(pb[0] - pa[0]) / (2 * h), (pb[1] - pa[1]) / (2 * h)];
    const a = [(pb[0] - 2 * p[0] + pa[0]) / (h * h), (pb[1] - 2 * p[1] + pa[1]) / (h * h)];
    const w = 1.2;
    const cor = [2 * w * v[1], -2 * w * v[0]];            // −2Ω ẑ × v′
    const cen = [w * w * p[0], w * w * p[1]];              // −Ω×(Ω×r′) = Ω² r′
    near(a[0], cor[0] + cen[0], 1e-4, 'ax'); near(a[1], cor[1] + cen[1], 1e-4, 'ay');
    const va = K.rotatingVelocity(res, t);
    near(va[0], v[0], 1e-6); near(va[1], v[1], 1e-6);
  }
});

test('轉盤：從中心直直推向目標，逆時針轉的盤上球落在目標右邊 ΩR/v0 弧度；往前瞄這麼多就打中', () => {
  const T = { omega: 0.8, v0: 1.5, aim: 0, r0: 0, R: 1 };
  const r = K.turntable(T);
  near(r.T, 1 / 1.5, 1e-12);
  near(r.miss, -0.8 / 1.5 / K.DEG, 1e-9, '落點偏右（順時針，負角）');
  near(K.turntable(Object.assign({}, T, { aim: K.aimToHit(0.8, 1.5, 1) })).miss, 0, 1e-9);
  near(K.turntable(Object.assign({}, T, { omega: -0.8 })).miss, 0.8 / 1.5 / K.DEG, 1e-9, '順時針轉：偏左');
});

test('轉盤：發射點不在中心時，球帶著盤的轉動速度 Ωr0；初速 0 的球在轉動座標裡繞圈', () => {
  const r = K.turntable({ omega: 1, v0: 0, aim: 0, r0: 0.5, R: 1 });
  near(r.V[1], -0.5, 1e-12);
  assert.ok(isFinite(r.T));
  const r2 = K.turntable({ omega: 1, v0: 0, aim: 0, r0: 0, R: 1 });
  assert.strictEqual(r2.T, Infinity, '在中心靜止：永遠不動');
  // 「慣性座標裡靜止」的球（盤上看）：用 v0 = Ωr0 往 +y 推，抵消盤的速度
  const r3 = K.turntable({ omega: 1, v0: 0.5, aim: 90, r0: 0.5, R: 1 });
  near(Math.hypot(r3.V[0], r3.V[1]), 0, 1e-12);
  const p = K.turntableAt(r3, Math.PI / 2).rotating;
  near(Math.hypot(p[0], p[1]), 0.5, 1e-12, '轉動座標裡沿半徑 0.5 的圓');
  near(p[1], 0.5, 1e-12, '順時針繞（盤逆時針轉）');
});

test('追蹤器：慣性圓第一次轉滿一圈的時間＝2π/|f|（北半球順時針、南半球逆時針）', () => {
  for (const lat of [29.9, 90, -45]) {
    const p = K.parcel({ lat: lat, k: 0, field: { type: 'none' } }, 0, 0, 10, 0);
    K.advance(p, 30 * 3600, 60);
    const s = K.snapshot(p);
    near(s.loopT, K.inertialPeriod(lat) / 3600, 2e-4, '週期 ' + lat);
    assert.ok(lat > 0 ? s.turns < -1 : s.turns > 1, '轉向 ' + lat);
  }
});

test('追蹤器：赤道上從靜止放出，直直衝向低氣壓中心；北半球逆時針繞、南半球順時針繞', () => {
  const low = { type: 'low', dp: 20 };
  const e = K.parcel({ lat: 0, k: 1e-5, field: low }, 400e3, 300e3, 0, 0);
  K.advance(e, 60 * 3600, 60);
  const se = K.snapshot(e);
  assert.ok(se.minR < 1 && se.maxOff < 1e-4, '直線 ' + se.maxOff);
  const n = K.parcel({ lat: 25, k: 1e-5, field: low }, 500e3, 0, 0, 0);
  const s = K.parcel({ lat: -25, k: 1e-5, field: low }, 500e3, 0, 0, 0);
  K.advance(n, 120 * 3600, 60); K.advance(s, 120 * 3600, 60);
  const a = K.snapshot(n), b = K.snapshot(s);
  assert.ok(a.winding > 2 && a.minR < 50, '北半球 ' + a.winding);
  near(b.winding, -a.winding, 1e-9, '南北對稱');
  near(b.minR, a.minR, 1e-9);
});

test('追蹤器：以地轉風當初速，24 小時內方向與速度都不變', () => {
  const F = { type: 'uniform', G: 1 };
  const vg = K.geostrophicSpeed(F, 0, 0, 25);
  const p = K.parcel({ lat: 25, k: 0, field: F }, -800e3, 0, vg, 0);
  K.advance(p, 24 * 3600, 60);
  const s = K.snapshot(p);
  assert.ok(s.dirDev < 1e-6 && s.spdErr < 1e-9, s.dirDev + ' ' + s.spdErr);
  near(s.alpha, 0, 1e-6, '沿等壓線');
  near(s.deflect, 90, 1e-6, '在氣壓梯度力右邊 90°');
});

console.log(`\n${passed} 項通過${process.exitCode ? '（有失敗）' : ''}`);
