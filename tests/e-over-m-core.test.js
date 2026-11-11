// 以 Node 執行：node tests/e-over-m-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/e-over-m-core.js');

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
const mu0 = 4 * Math.PI * 1e-7, e = 1.602176634e-19, me = 9.1093837015e-31;
const N = 130, R = 0.15;

console.log('e-over-m-core');

test('常數：e/m ≈ 1.7588 × 10^11 C/kg，(4/5)^(3/2) = 8/√125', () => {
  close(C.EM, e / me, 1e-15);
  close(C.EM, 1.75882001e11, 1e-8);
  close(C.HH, 8 / Math.sqrt(125), 1e-15);
});

test('亥姆霍茲線圈中心：兩個線圈在 a = R/2 處的軸上磁場相加 = 8μ0NI/(√125 R)', () => {
  for (const I of [0.3, 1, 1.75, 2.5]) {
    const B = C.centreField(N, R, I);
    close(B, 8 * mu0 * N * I / (Math.sqrt(125) * R), 1e-14);
    close(B, 2 * C.singleLoopCentreAt(N, R, I, R / 2), 1e-14, '兩線圈疊加');
    close(B, C.fieldAt(0, 0, 0, { N, R, I })[2], 1e-12, '橢圓積分公式在中心');
  }
});

test('課本試題數據：N = 130、R = 0.15 m，I = 0.60、0.80、0.90 A → B ≈ 4.7、6.2、7.0 × 10^-4 T', () => {
  near(C.centreField(N, R, 0.6) * 1e4, 4.7, 0.05);
  near(C.centreField(N, R, 0.8) * 1e4, 6.2, 0.05);
  near(C.centreField(N, R, 0.9) * 1e4, 7.0, 0.05);
  // e/m = 2V/(B²r²)，V = 200 V
  near(C.emFrom(200, C.centreField(N, R, 0.6), 0.10) / 1e11, 1.8, 0.05);
  near(C.emFrom(200, C.centreField(N, R, 0.8), 0.08) / 1e11, 1.6, 0.05);
  near(C.emFrom(200, C.centreField(N, R, 0.9), 0.07) / 1e11, 1.7, 0.05);
});

test('完全橢圓積分：K(0) = E(0) = π/2、K(0.5)、E(0.5) 與勒讓德關係', () => {
  const z = C.ellipKE(0);
  close(z.K, Math.PI / 2, 1e-15); close(z.E, Math.PI / 2, 1e-15);
  const h = C.ellipKE(0.5);
  close(h.K, 1.8540746773013719, 1e-14);
  close(h.E, 1.3506438810476755, 1e-14);
  for (const m of [0.1, 0.3, 0.7, 0.9, 0.99]) {
    const a = C.ellipKE(m), b = C.ellipKE(1 - m);
    close(a.E * b.K + b.E * a.K - a.K * b.K, Math.PI / 2, 1e-12, 'Legendre m=' + m);
  }
});

test('單一圓線圈：軸上 B = μ0Ia²/[2(a² + z²)^{3/2}]，離軸與畢歐—沙伐數值積分一致', () => {
  const a = 0.15, I = 2;
  for (const z of [0, 0.03, -0.075, 0.2]) {
    const f = C.loopField(a, I, 0, z);
    close(f.Bz, mu0 * I * a * a / (2 * Math.pow(a * a + z * z, 1.5)), 1e-12);
    assert.strictEqual(f.Brho, 0);
  }
  // 畢歐—沙伐：把圓線圈切成 20000 段
  const bs = (x, y, z) => {
    const n = 20000; let Bx = 0, By = 0, Bz = 0;
    for (let i = 0; i < n; i++) {
      const p = 2 * Math.PI * (i + 0.5) / n, dp = 2 * Math.PI / n;
      const lx = -a * Math.sin(p) * dp, ly = a * Math.cos(p) * dp;
      const rx = x - a * Math.cos(p), ry = y - a * Math.sin(p), rz = z;
      const r3 = Math.pow(rx * rx + ry * ry + rz * rz, 1.5);
      Bx += (ly * rz) / r3; By += (-lx * rz) / r3; Bz += (lx * ry - ly * rx) / r3;
    }
    const k = mu0 * I / (4 * Math.PI);
    return [k * Bx, k * By, k * Bz];
  };
  for (const [rho, z] of [[0.05, 0.02], [0.1, -0.04], [0.2, 0.1], [0.12, 0.0]]) {
    const f = C.loopField(a, I, rho, z), b = bs(rho, 0, z);
    close(f.Bz, b[2], 1e-6, 'Bz');
    near(f.Brho, b[0], 1e-6 * Math.abs(b[2]) + 1e-14, 'Bρ');
  }
});

test('中央平面 z = 0：只有沿軸的分量；亥姆霍茲線圈的偏差 ∝ ρ^4（二階項抵消）', () => {
  const c = { N, R, I: 1.5 };
  for (const [x, y] of [[0.02, 0.01], [-0.04, 0.03], [0, -0.06]]) {
    const B = C.fieldAt(x, y, 0, c);
    near(B[0], 0, 1e-15); near(B[1], 0, 1e-15);
  }
  const d1 = 1 - C.midplaneRatio(0.01, N, R), d2 = 1 - C.midplaneRatio(0.02, N, R), d4 = 1 - C.midplaneRatio(0.04, N, R);
  close(d2 / d1, 16, 0.02, 'ρ 加倍偏差變 16 倍');
  close(d4 / d2, 16, 0.08);
  assert.ok(C.midplaneRatio(0.06, N, R) < 0.99 && C.midplaneRatio(0.06, N, R) > 0.98, '離軸 6 cm 約弱 1.3%');
  // 間距不是 R 時二階項不再抵消（偏差 ∝ ρ²）
  const c2 = { N, R, I: 1, sep: 0.6 * R };
  const r1 = 1 - C.fieldAt(0.01, 0, 0, c2)[2] / C.fieldAt(0, 0, 0, c2)[2];
  const r2 = 1 - C.fieldAt(0.02, 0, 0, c2)[2] / C.fieldAt(0, 0, 0, c2)[2];
  close(r2 / r1, 4, 0.05, '非亥姆霍茲間距：ρ²');
});

test('磁場的散度與旋度為零（數值微分）', () => {
  const c = { N, R, I: 1.2 }, h = 1e-5;
  for (const p of [[0.03, 0.02, 0.01], [-0.05, 0.01, 0.04], [0.1, -0.08, 0.06]]) {
    const f = (dx, dy, dz) => C.fieldAt(p[0] + dx, p[1] + dy, p[2] + dz, c);
    const dBx = (f(h, 0, 0)[0] - f(-h, 0, 0)[0]) / (2 * h);
    const dBy = (f(0, h, 0)[1] - f(0, -h, 0)[1]) / (2 * h);
    const dBz = (f(0, 0, h)[2] - f(0, 0, -h)[2]) / (2 * h);
    const scale = Math.abs(C.fieldAt(p[0], p[1], p[2], c)[2]) / 0.05;
    near(dBx + dBy + dBz, 0, 1e-5 * scale, 'div B');
    const cx = (f(0, h, 0)[2] - f(0, -h, 0)[2]) / (2 * h) - (f(0, 0, h)[1] - f(0, 0, -h)[1]) / (2 * h);
    const cz = (f(h, 0, 0)[1] - f(-h, 0, 0)[1]) / (2 * h) - (f(0, h, 0)[0] - f(0, -h, 0)[0]) / (2 * h);
    near(cx, 0, 1e-5 * scale, 'curl B x'); near(cz, 0, 1e-5 * scale, 'curl B z');
  }
});

test('能量守恆與向心力：v = √(2eV/m)、r = mv/(eB)、e/m = 2V/(B²r²)', () => {
  for (const V of [50, 100, 250]) for (const I of [0.8, 1.5, 2.2]) {
    const B = C.centreField(N, R, I), v = C.speed(V);
    close(0.5 * me * v * v, e * V, 1e-12, '½mv² = eV');
    const r = C.radius(V, B);
    close(r, me * v / (e * B), 1e-12);
    close(C.emFrom(V, B, r), e / me, 1e-12);
    close(C.currentForRadius(V, r, N, R), I, 1e-12);
  }
  // r ∝ √V / B
  close(C.radius(400, 1e-3) / C.radius(100, 1e-3), 2, 1e-12);
  close(C.radius(100, 2e-3) / C.radius(100, 1e-3), 0.5, 1e-12);
  // 週期與速率無關
  close(C.period(1e-3), 2 * Math.PI * me / (e * 1e-3), 1e-12);
  assert.ok(C.speed(300) / C.C_LIGHT < 0.035, '300 V 時 v/c < 0.035，可不計相對論');
});

test('理想均勻場的軌跡：圓心在電子槍正上方 r 處、半徑 r、水平寬度 2r、繞一圈回到電子槍', () => {
  for (const [V, I] of [[100, 1.0], [150, 1.4], [200, 1.8], [250, 2.2]]) {
    const o = C.orbit({ V, I, uniform: true });
    const c = C.idealCircle(V, I);
    assert.ok(o.closed && !o.hitGlass, '完整的圓');
    close(o.D, 2 * c.r, 2e-5, 'D = 2r');
    for (const p of o.pts) close(Math.hypot(p[0] - c.cx, p[1] - c.cy), c.r, 2e-5, '距圓心 = r');
    close(C.emFrom(V, c.B, o.D / 2), C.EM, 5e-5, '由軌跡量回 e/m');
    close(o.yMax, c.top, 2e-5 * c.r / Math.abs(c.top || 1) + 1e-6, '最高點');
  }
});

test('電子向上偏轉（B 射出畫面、電子沿 +x 射出）且繞行方向為逆時針', () => {
  const o = C.orbit({ V: 100, I: 1.5, uniform: true });
  assert.ok(o.pts[5][1] > C.APP.gun.y, '先往上彎');
  const q = o.pts[Math.floor(o.pts.length / 4)];
  assert.ok(q[0] > 0 && q[1] > C.APP.gun.y, '四分之一圈在右上');
});

test('圓太大時打到玻璃；沒有磁場時直線打到玻璃', () => {
  const o = C.orbit({ V: 300, I: 1.0, uniform: true });
  assert.ok(o.hitGlass && !o.closed);
  close(Math.hypot(o.end[0], o.end[1], o.end[2]), C.APP.bulbR, 1e-9);
  const s = C.orbit({ V: 100, I: 0, uniform: true });
  assert.ok(s.hitGlass);
  near(s.end[1], C.APP.gun.y, 1e-12, '直線');
  close(s.end[0], Math.sqrt(C.APP.bulbR ** 2 - C.APP.gun.y ** 2), 1e-9);
});

test('螺旋線（電子槍轉角 α）：投影半徑 r cos α、每圈沿 B 前進螺距 2πr sin α', () => {
  const V = 100, I = 1.92, a = 6 * Math.PI / 180;
  const o = C.orbit({ V, I, uniform: true, alpha: a });
  const B = C.centreField(N, R, I), h = C.helix(V, B, a);
  close(h.r, C.radius(V, B) * Math.cos(a), 1e-12);
  close(h.pitch, 2 * Math.PI * C.radius(V, B) * Math.sin(a), 1e-12);
  close(o.D, 2 * h.r, 1e-4, '投影的直徑');
  // 速度方向每轉一圈，z 前進一個螺距：找轉第一圈時的 z
  const T = o.turns;
  assert.ok(T > 3 && o.hitGlass, '多圈後打到玻璃');
  close(o.zMax / T, h.pitch, 0.02, '平均每圈前進螺距');
});

test('真實線圈磁場：小圓與均勻場幾乎相同，大圓因離軸磁場變弱而偏大', () => {
  const small = C.orbit({ V: 100, I: 1.8, uniform: false }), smallU = C.orbit({ V: 100, I: 1.8, uniform: true });
  close(small.D, smallU.D, 1e-3);
  const big = C.orbit({ V: 150, I: 0.9, uniform: false }), bigU = C.orbit({ V: 150, I: 0.9, uniform: true });
  assert.ok(big.D > bigU.D * 1.02, '大圓偏大 2% 以上');
  assert.ok(big.closed && !big.hitGlass);
  // 中央平面上，軌跡留在平面上
  for (const p of big.pts) near(p[2], 0, 1e-12);
});

test('視差：眼睛正對著點時沒有偏差；眼睛不動時看到的直徑變成 L/(L + d) 倍', () => {
  const eye = { x: 0.03, y: 0 };
  const q = C.project(0.03, 0.01, 0, eye);
  near(q[0], 0.03, 1e-15);
  const o = C.orbit({ V: 100, I: 1.5, uniform: true });
  for (const xe of [-0.05, 0, 0.04]) {
    const ed = C.apparentEdges(o.pts, { x: xe, y: 0 });
    close(ed.right - ed.left, o.D * C.parallaxShrink(), 1e-4, 'xe = ' + xe);
  }
  // 讀左緣時眼睛在左緣正前方、讀右緣時在右緣正前方 → 沒有偏差
  const L = C.apparentEdges(o.pts, { x: o.xMin, y: 0 }).left, Rr = C.apparentEdges(o.pts, { x: o.xMax, y: 0 }).right;
  close(Rr - L, o.D, 1e-6);
  // 標尺平面上的點（z = d）不受眼睛位置影響
  near(C.project(0.02, 0, C.APP.scaleD, { x: -0.1, y: 0.05 })[0], 0.02, 1e-15);
});

test('電表讀數：校正誤差與解析度', () => {
  near(C.meter(100, 0, 1), 100, 1e-12);
  near(C.meter(150, 0.004, 1), 151, 1e-12);
  near(C.meter(1.234, 0, 0.01), 1.23, 1e-12);
  near(C.meter(1.5, -0.003, 0.01), 1.5, 1e-12);
});

test('數據分析：完美數據的最佳直線斜率與平均都等於 e/m', () => {
  const rows = [[100, 1.2], [150, 1.5], [200, 1.7], [250, 2.0]].map(([V, I]) => ({ V, I, D: 2 * C.radius(V, C.centreField(N, R, I)) }));
  const A = C.analyze(rows);
  assert.strictEqual(A.n, 4);
  close(A.fit.slope, C.EM, 1e-12);
  close(A.mean, C.EM, 1e-12);
  near(A.fitErr, 0, 1e-12);
  close(A.fit.r2, 1, 1e-12);
  for (const w of A.rows) close(w.y / w.x, C.EM, 1e-12);
  const L = C.fitLine([1, 2, 3], [3, 5, 7]);
  close(L.slope, 2, 1e-12); close(L.intercept, 1, 1e-12);
});

test('磁力線：由線圈內部出發的磁力線繞過線圈外側回到起點（封閉曲線）', () => {
  const cfg = { N, R, I: 1 };
  const pts = C.fieldLine(0.08, 0, cfg, { ds: 0.001, maxLen: 3, box: 1 });
  const end = pts[pts.length - 1];
  near(Math.hypot(end[0] - 0.08, end[1]), 0, 0.002, '回到起點');
  assert.ok(pts.some(p => p[0] > R), '經過線圈外側');
  // 中心線沿著軸
  const axis = C.fieldLine(0, 0, cfg, { ds: 0.002, maxLen: 0.3, box: 0.25 });
  for (const p of axis) near(p[0], 0, 1e-12);
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗項目' : ''));
