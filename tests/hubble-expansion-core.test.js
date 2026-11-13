// 以 Node 執行：node tests/hubble-expansion-core.test.js
'use strict';
const assert = require('assert');
const H = require('../js/hubble-expansion-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }

console.log('hubble-expansion-core');

test('哈伯時間：H0 = 70 是 139.7 億年；1 Mpc = 326 萬光年', () => {
  near(H.hubbleTime(70), 13.968, 0.002);
  // 1 Mpc / (1 km/s) 換成十億年
  const MPC_KM = 3.0856775814913673e19, GYR_S = 3.15576e16;
  near(H.GYR_INV_H, MPC_KM / GYR_S, 0.01);
  near(H.MLY_PER_MPC, 3.26156, 1e-5);
});

test('年齡的解析解：空的宇宙 = 1/H0；愛因斯坦–德西特 = 2/(3H0)；只有輻射 = 1/(2H0)', () => {
  const tH = H.hubbleTime(70);
  near(H.age(H.model(70, 0, 0, false)), tH, 1e-6 * tH);
  near(H.age(H.model(70, 1, 0, false)), 2 / 3 * tH, 1e-5 * tH);
  const rad = { H0: 70, Om: 0, OL: 0, Or: 1, Ok: 0 };
  near(H.age(rad), 0.5 * tH, 1e-5 * tH);
});

test('平坦的 ΛCDM：t0 = (2 / 3√ΩΛ)·asinh(√(ΩΛ/Ωm))/H0；Planck 2018 約 138 億年', () => {
  const M = H.model(67.4, 0.315, 0.685, false), tH = H.hubbleTime(67.4);
  const exact = 2 / (3 * Math.sqrt(0.685)) * Math.asinh(Math.sqrt(0.685 / 0.315)) * tH;
  near(H.age(M), exact, 1e-5 * exact);
  const P = H.model(67.4, 0.315, 0.685 - H.omegaR(67.4));     // 加上輻射、維持平坦
  near(H.age(P), 13.80, 0.03);
  near(H.omegaR(67.4), 9.2e-5, 0.3e-5);
});

test('開放的宇宙（Ωm = 0.3、ΩΛ = 0）：t0 = [1/(1−Ωm) − Ωm/(2(1−Ωm)^1.5)·acosh(2/Ωm − 1)]/H0', () => {
  const Om = 0.3, tH = H.hubbleTime(70);
  const exact = (1 / (1 - Om) - Om / (2 * Math.pow(1 - Om, 1.5)) * Math.acosh(2 / Om - 1)) * tH;
  near(H.age(H.model(70, Om, 0, false)), exact, 1e-5 * exact);
});

test('a(t) 的歷史和年齡的積分一致；現在 ȧ/a = H0', () => {
  for (const [Om, OL] of [[0.315, 0.685], [1, 0], [0.3, 0], [0.3, 0.3]]) {
    const M = H.model(70, Om, OL), h = H.history(M, 10);
    near(-h.bang, H.age(M), 0.01, 'Ωm ' + Om + ' ΩΛ ' + OL);
    const i = h.pts.findIndex(p => p.t === 0), p1 = h.pts[i + 1];
    near((p1.a - 1) / p1.t, 70 / H.GYR_INV_H, 0.002 * 70 / H.GYR_INV_H);
  }
});

test('封閉的宇宙（Ωm = 2）會大崩墜：膨脹時間 = 收縮時間，總壽命 = π·Ωm/(H0(Ωm−1)^1.5)', () => {
  const M = H.model(70, 2, 0, false), h = H.history(M, 80);
  assert.ok(h.crunch != null);
  const life = Math.PI * 2 / Math.pow(1, 1.5) * H.hubbleTime(70);
  near(h.crunch - h.bang, life, 0.02 * life);
  const top = h.pts.reduce((b, p) => p.a > b.a ? p : b);
  near(top.a, 2 / (2 - 1), 0.01);                 // a_max = Ωm/(Ωm−1)
  near(top.t - h.bang, life / 2, 0.02 * life);
});

test('ΩΛ 太大就沒有大霹靂（往回推會反彈）；q0 與開始加速的紅移', () => {
  const M = H.model(70, 0.3, 2.5, false);
  assert.strictEqual(H.hasBang(M), false); assert.strictEqual(H.age(M), null);
  assert.ok(H.history(M, 5).bounce);
  const P = H.model(67.4, 0.315, 0.685, false);
  near(H.q0(P), -0.5275, 1e-4);
  near(1 / H.aAccel(P) - 1, 0.632, 0.002);
  assert.strictEqual(H.aAccel(H.model(70, 1, 0, false)), null);
});

test('將來的命運：Ωm ≤ 1 而且 ΩΛ = 0 永遠膨脹；Ωm > 1 或 ΩΛ < 0 會大崩墜；有暗能量就算 Ωm 略大於 1 也停不下來', () => {
  assert.strictEqual(H.recollapses(H.model(70, 1, 0, false)), false);
  assert.strictEqual(H.recollapses(H.model(70, 1.02, 0, false)), true);
  assert.strictEqual(H.recollapses(H.model(70, 0.3, -0.1, false)), true);
  assert.strictEqual(H.recollapses(H.model(70, 1.2, 0.3, false)), false);
  assert.strictEqual(H.recollapses(H.model(67.4, 0.315, 0.685)), false);
});

test('回溯時間：z = 0 是 0、z → ∞ 是年齡；z 很小時 ≈ z/H0', () => {
  const M = H.model(70, 0.3, 0.7, false);
  near(H.lookback(M, 0), 0, 1e-9);
  near(H.lookback(M, 1e5), H.age(M), 0.01);
  near(H.lookback(M, 0.001), 0.001 * H.hubbleTime(70), 0.002 * 0.001 * H.hubbleTime(70));
});

test('標準燭光：週期 10 天的造父變星 M = −4.05；距離模數 30 = 10 Mpc', () => {
  near(H.cepheidM(10), -4.05, 1e-12);
  assert.ok(H.cepheidM(30) < H.cepheidM(10));          // 週期越長越亮
  near(H.distMod(10), 30, 1e-12);
  near(H.distFromMod(H.distMod(37.3)), 37.3, 1e-9);
});

test('星系目錄：仙女座星系在靠近（藍移）；遠的星系大致照 H0 = 70 遠離', () => {
  const m31 = H.CATALOG.find(g => g.id === 'm31');
  assert.ok(m31.v < 0);
  const far = H.CATALOG.filter(g => !g.real && g.d > 30);
  far.forEach(g => near(g.v / g.d, 70, 1000 / g.d, g.id));
  assert.strictEqual(H.CATALOG.length, 28);
  // 位置不重疊
  for (let i = 0; i < H.CATALOG.length; i++) for (let j = i + 1; j < H.CATALOG.length; j++) {
    const a = H.CATALOG[i], b = H.CATALOG[j]; assert.ok(Math.hypot(a.x - b.x, (a.y - b.y) * 0.75) > 0.06, a.id + ' ' + b.id);
  }
});

test('量測：造父變星只到 40 Mpc、超新星要 5 Mpc 以上；誤差符合 σ；哈伯的尺度少了約 7 倍', () => {
  const coma = H.CATALOG.findIndex(g => g.id === 'coma');
  assert.strictEqual(H.measure(coma, 'cepheid'), null);
  assert.ok(H.measure(coma, 'sn'));
  assert.strictEqual(H.measure(0, 'sn'), null);
  // 很多次（不同星系）的距離誤差的標準差 ≈ ln10/5·σ
  let s2 = 0, n = 0;
  H.CATALOG.forEach((g, i) => { const m = H.measure(i, 'sn'); if (m) { const r = Math.log(m.d / g.d); s2 += r * r; n++; } });
  near(Math.sqrt(s2 / n), Math.LN10 / 5 * 0.12, 0.03);
  const i87 = H.CATALOG.findIndex(g => g.id === 'm87'), a = H.measure(i87, 'cepheid'), b = H.measure(i87, 'hubble');
  near(b.m - b.M - b.mu, 5 * Math.log10(H.HUBBLE_1929), 1e-9);
  near(a.d / b.d, H.HUBBLE_1929, 0.6 * H.HUBBLE_1929);
  near(a.v, 1284, 100);
});

test('最小平方法（過原點）：完美的資料解回 H；用全部的超新星量到 70 ± 5 %；哈伯的尺度量到約 500', () => {
  const f = H.fitH([{ d: 10, v: 700 }, { d: 50, v: 3500 }, { d: 100, v: 7000 }]);
  near(f.H, 70, 1e-12); near(f.sH, 0, 1e-12); near(f.age1, 13.968, 0.002);
  const sn = []; H.CATALOG.forEach((g, i) => { const m = H.measure(i, 'sn'); if (m) sn.push(m); });
  const fs = H.fitH(sn); near(fs.H, 70, 3.5); assert.ok(fs.sH < 3, 'sH ' + fs.sH);
  const hb = []; H.CATALOG.forEach((g, i) => { const m = H.measure(i, 'hubble'); if (m && !g.local) hb.push(m); });
  const fh = H.fitH(hb); assert.ok(fh.H > 380 && fh.H < 650, 'H ' + fh.H);
  assert.ok(fh.age1 < H.EARTH_AGE, '哈伯的宇宙比地球還年輕：' + fh.age1);
  assert.strictEqual(H.fitH([]), null);
});

test('膨脹的盒子：任一個星系看出去都是 v ∝ r（沒有中心）；光走過來時波長拉長 1 + z = a1/a0', () => {
  const G = H.boxGalaxies(7); assert.strictEqual(G.length, 49);
  const Hn = 0.3;
  for (const home of [0, 24, 48]) G.forEach((g, k) => {
    if (k === home) return;
    const rx = g.x - G[home].x, ry = g.y - G[home].y, vx = Hn * rx, vy = Hn * ry;
    near(Math.hypot(vx, vy) / Math.max(1e-12, Math.hypot(rx, ry)), Hn, 1e-12);
  });
  const t = H.lightTrip(0.5, 1, 0.2, 1);
  near(t.a1, Math.exp(0.1), 1e-12);
  // 數值積分驗證：dχ/dτ = c/a
  let chi = 0, tau = 0; const dt = 1e-5; while (chi < 0.5) { chi += dt / (1 + 0.2 * (tau + dt / 2)); tau += dt; }
  near(tau, t.tau, 1e-4);
});

console.log(`hubble-expansion-core：${passed} 項通過`);
