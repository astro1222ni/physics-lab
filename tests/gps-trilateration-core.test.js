// 以 Node 執行：node tests/gps-trilateration-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/gps-trilateration-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = a => Math.hypot(a[0], a[1], a[2]);

test('星系：24 顆衛星都在半徑 26,560 km 的軌道上；週期半個恆星日', () => {
  for (let id = 0; id < K.NSAT; id++) {
    near(norm(K.satellite(id, 37)), K.RS, 1e-6);
    // 一個恆星日後，衛星回到地固座標的同一點（兩圈、地球轉一圈）
    const a = K.satellite(id, 100), b = K.satellite(id, 100 + K.T_SID);
    near(norm(sub(a, b)), 0, 1e-6, '衛星 ' + id);
  }
  // 克卜勒第三定律：T = 2π √(a³ / GM)，GM = 398,600.4418 km³/s²
  near(2 * Math.PI * Math.sqrt(K.RS ** 3 / 398600.4418) / 60, K.T_ORB, 0.5);
  // 傾角 55°：衛星最高到緯度 55°
  let mz = 0; for (let t = 0; t < K.T_ORB; t += 1) mz = Math.max(mz, K.satellite(0, t)[2]);
  near(Math.asin(mz / K.RS) * 180 / Math.PI, 55, 0.05);
});

test('東北天：三個單位向量互相垂直；天頂方向的衛星仰角 90°', () => {
  [[0, 0], [23.5, 121], [-40, -70], [89, 10]].forEach(([la, lo]) => {
    const B = K.enuBasis(la, lo);
    [B.e, B.n, B.u].forEach(v => near(norm(v), 1, 1e-12));
    near(B.e[0] * B.n[0] + B.e[1] * B.n[1] + B.e[2] * B.n[2], 0, 1e-12);
    near(B.e[0] * B.u[0] + B.e[1] * B.u[1] + B.e[2] * B.u[2], 0, 1e-12);
    near(B.n[0] * B.u[0] + B.n[1] * B.u[1] + B.n[2] * B.u[2], 0, 1e-12);
  });
  // 地平線上的衛星仰角 0：從測站沿東方向看
  const r = K.station(10, 20, 0), B = K.enuBasis(10, 20);
  const s = [r[0] + 1000 * B.e[0], r[1] + 1000 * B.e[1], r[2] + 1000 * B.e[2]];
  const d = sub(s, r);
  near(Math.asin((d[0] * B.u[0] + d[1] * B.u[1] + d[2] * B.u[2]) / norm(d)), 0, 1e-12);
});

test('三維定位：沒有雜訊時，四顆以上的衛星解出真正的位置與時鐘偏差', () => {
  [[23.5, 121, 0], [-33, 151, 300], [64, -20, 900], [0, 0, 1200]].forEach(([la, lo, t]) => {
    const v = K.sky({ lat: la, lon: lo, t, mask: 5 }).filter(s => s.visible);
    assert.ok(v.length >= 4, '看得到 ' + v.length + ' 顆');
    const r = K.station(la, lo, 0), tau = -321.5;
    const sol = K.solve3(v.map(s => s.pos), v.map(s => s.range + K.C * tau));
    near(norm(sub(sol.x, r)) * 1000, 0, 1e-3, '位置（m）');
    near(sol.tau, tau, 1e-6, '時鐘（μs）');
    // 只有三顆：四個未知數解不出來
    assert.strictEqual(K.solve3(v.slice(0, 3).map(s => s.pos), v.slice(0, 3).map(s => s.range)), null);
  });
});

test('時鐘當作準的：三顆衛星也能解，但時鐘偏 1 μs（300 m）就讓位置偏好幾百公尺；線性化和完整迭代一致', () => {
  const o = { lat: 23.5, lon: 121, t: 0, mask: 5 };
  const v = K.sky(o).filter(s => s.visible).slice(0, 3), r = K.station(o.lat, o.lon, 0);
  const sol = K.solve3(v.map(s => s.pos), v.map(s => s.range + K.C * 1), 0, r);
  const e = K.toENU(sub(sol.x, r), o.lat, o.lon);
  const lin = K.scatter(v, 0, 1, 1, null, 1);
  [0, 1, 2].forEach(j => near(lin.bias[j], e[j], 0.5, '分量 ' + j));
  assert.ok(norm(e) > 300, '偏了 ' + norm(e).toFixed(0) + ' m');
  // 時鐘真的準：沒有誤差
  const ok = K.solve3(v.map(s => s.pos), v.map(s => s.range), 0, r);
  near(norm(sub(ok.x, r)) * 1000, 0, 1e-3);
});

test('DOP：和 (GᵀG)⁻¹ 的對角線一致；衛星擠在一起時變大；隨機雜訊的水平均方根 ≈ HDOP × σ', () => {
  const v = K.sky({ lat: 23.5, lon: 121, t: 0, mask: 5 }).filter(s => s.visible);
  const D = K.dop(K.geometry3(v));
  near(D.g * D.g, D.p * D.p + D.t * D.t, 1e-9);
  near(D.p * D.p, D.h * D.h + D.v * D.v, 1e-9);
  assert.ok(D.p >= 1 && D.p < 3);
  // 理想幾何：一顆在天頂、三顆在仰角 −19.47°（正四面體）→ 只看 E、N、U 的 GᵀG = (4/3) I，PDOP = √(3 × 3/4)
  const t = Math.asin(1 / 3);
  const tet = [{ enu: [0, 0, 1] }].concat([0, 120, 240].map(a => ({ enu: [Math.cos(t) * Math.sin(a * Math.PI / 180), Math.cos(t) * Math.cos(a * Math.PI / 180), -1 / 3] })));
  near(K.dopFixed(tet).p, Math.sqrt(9 / 4), 1e-9);
  // 衛星擠在同一個方向：DOP 很大
  const tight = [0, 1, 2, 3].map(i => { const q = 0.03 + 0.02 * i; return { enu: [q * Math.cos(2 * i), q * Math.sin(2 * i), Math.sqrt(1 - q * q)] }; });
  assert.ok(K.dop(K.geometry3(tight)).p > 50);
  // 四顆衛星都在同一個仰角（同一個圓錐上）：高度和時鐘分不開，矩陣奇異
  const cone = [0, 90, 180, 270].map(a => ({ enu: [0.8 * Math.sin(a * Math.PI / 180), 0.8 * Math.cos(a * Math.PI / 180), 0.6] }));
  assert.strictEqual(K.dop(K.geometry3(cone)), null);
  const sc = K.scatter(v, 4, 20000, 3);
  near(sc.hrms / (D.h * 4), 1, 0.03);
  near(Math.hypot(sc.mean[0], sc.mean[1]), 0, 0.15, '沒有偏差時平均在正確位置');
});

test('多路徑：反射讓距離只會變長，造成系統偏差；高仰角衛星不受影響', () => {
  assert.strictEqual(K.multipathBias(30, 20, 20), 0);
  near(K.multipathBias(0, 20, 20), 20, 1e-12);
  near(K.multipathBias(10, 20, 20), 10, 1e-12);
  const v = K.sky({ lat: 23.5, lon: 121, t: 0, mask: 5 }).filter(s => s.visible);
  const a = K.scatter(v, 0, 1, 1, { m: 20, el: 20 });
  // 每顆都加同樣的偏差，只會被時鐘吸收，位置不動
  const same = K.scatter(v.map(s => Object.assign({}, s, { el: 0 })), 0, 1, 1, { m: 20, el: 20 });
  near(Math.hypot(same.bias[0], same.bias[1], same.bias[2]), 0, 1e-6);
  assert.ok(a.biasH > 0.1);
});

test('遮蔽：仰角遮罩與街谷（建築頂的仰角隨方位角變化）', () => {
  assert.strictEqual(K.blockedBy(4, 0, 5, null), 'mask');
  assert.strictEqual(K.blockedBy(6, 0, 5, null), '');
  // 南北向的街：沿街方向看不到建築，垂直街道方向擋到 w
  assert.strictEqual(K.blockedBy(10, 0, 0, { w: 60, dir: 0 }), '');
  assert.strictEqual(K.blockedBy(59, 90, 0, { w: 60, dir: 0 }), 'building');
  assert.strictEqual(K.blockedBy(61, 270, 0, { w: 60, dir: 0 }), '');
  // 方位 45°：tan(lim) = tan60° × sin45°
  const lim = Math.atan(Math.tan(Math.PI / 3) * Math.SQRT1_2) * 180 / Math.PI;
  assert.strictEqual(K.blockedBy(lim - 0.01, 45, 0, { w: 60, dir: 0 }), 'building');
  assert.strictEqual(K.blockedBy(lim + 0.01, 45, 0, { w: 60, dir: 0 }), '');
  const open = K.sky({ lat: 23.5, lon: 121, t: 0, mask: 5 }).filter(s => s.visible).length;
  const city = K.sky({ lat: 23.5, lon: 121, t: 0, mask: 5, canyon: { w: 60, dir: 0 } }).filter(s => s.visible).length;
  assert.ok(city < open);
});

test('平面練習：時鐘修正對了，三個圓交在一點；錯了就交不在一起；兩座塔有兩個交點', () => {
  const T = K.TOWERS.slice(0, 3), r = [17, 13], tau = 15;
  const rho = K.pseudo2(T, r, tau);
  const s = K.solve2(T, rho);
  near(s.x, r[0], 1e-9); near(s.y, r[1], 1e-9); near(s.tau, tau, 1e-9);
  near(K.miss2(T, rho, tau), 0, 1e-9);
  assert.ok(K.miss2(T, rho, tau + 2) > 0.05);
  // 圓的半徑 = 虛擬距離 − cτ̂；兩座塔：兩個交點，其中一個是真正的位置
  const X = K.circleX(T[0], rho[0] - K.C * tau, T[1], rho[1] - K.C * tau);
  assert.strictEqual(X.length, 2);
  assert.ok(X.some(p => Math.hypot(p[0] - r[0], p[1] - r[1]) < 1e-9));
  // 站在兩座塔的連線上：兩個圓相切，只有一個交點
  const m = [(T[0].x + T[1].x) / 2, (T[0].y + T[1].y) / 2];
  assert.strictEqual(K.circleX(T[0], Math.hypot(T[0].x - m[0], T[0].y - m[1]), T[1], Math.hypot(T[1].x - m[0], T[1].y - m[1])).length, 1);
  // 有雜訊時，最小平方解的誤差和雜訊同一個數量級
  const n = K.TOWER_NOISE.slice(0, 4).map(z => 0.1 * z);
  const T4 = K.TOWERS.slice(0, 4), s4 = K.solve2(T4, K.pseudo2(T4, r, tau, n));
  assert.ok(Math.hypot(s4.x - r[0], s4.y - r[1]) < 1);
});

test('平面的 DOP：和三維一樣由幾何決定，塔圍著接收機時比較小', () => {
  const inside = K.dop(K.geometry2(K.TOWERS.slice(0, 4), [20, 15]));
  const outside = K.dop(K.geometry2(K.TOWERS.slice(0, 4), [39, 29]));
  assert.ok(inside.h < outside.h);
  // 三座塔、接收機在三角形中心附近：HDOP 有限
  assert.ok(K.dop(K.geometry2(K.TOWERS.slice(0, 3), [20, 18])).h < 3);
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗' : ''));
