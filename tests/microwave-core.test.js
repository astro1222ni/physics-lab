// 以 Node 執行：node tests/microwave-core.test.js
'use strict';
const assert = require('assert');
const M = require('../js/microwave-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}，得到 ${a}（容許 ${tol}）`);
}
const DEG = Math.PI / 180;
const lam = M.lambdaCm(10.525);

/** 掃描 [a, b] 找出 f 的所有局部極小 */
function minima(f, a, b, h) {
  const out = [];
  let p0 = f(a), p1 = f(a + h);
  for (let x = a + 2 * h; x <= b; x += h) {
    const p2 = f(x);
    if (p1 < p0 && p1 <= p2) out.push(M.extremum(f, x - 2 * h, x, -1, 4));
    p0 = p1; p1 = p2;
  }
  return out;
}

console.log('microwave-core');

test('λ = c / f：10.525 GHz 的波長約 2.848 cm，f 與 λ 互換一致', () => {
  close(lam, 2.99792458e8 / 10.525e9 * 100, 1e-12);
  close(lam, 2.848, 0.001);
  for (const f of [8.5, 9.4, 10.525, 12]) close(M.freqGHz(M.lambdaCm(f)), f, 1e-12);
});

test('喇叭方向圖：軸上為 1、對稱、±HPBW/2 處功率約減半、背向為 0', () => {
  close(M.hornAmp(0), 1, 1e-15);
  close(M.hornAmp(0.2), M.hornAmp(-0.2), 1e-15);
  const h = M.KIT.hpbw / 2 * DEG;
  close(M.hornAmp(h) ** 2, 0.5, 0.01);
  assert.strictEqual(M.hornAmp(Math.PI / 2), 0);
  assert.strictEqual(M.hornAmp(Math.PI), 0);
});

// 方向圖很寬的波源（近似點波源）：物理光學積分的駐相點結果正好是鏡像波源
test('很寬的金屬板：物理光學積分 = 鏡像波源的球面波（Γ = −1）', () => {
  const sc = { lam: lam, tx: { x: -30, y: 0, ax: 0, hpbw: 160 }, plate: { x: 0, y: 0, nx: -1, ny: 0, w: 600 } };
  for (const x of [-20, -12, -5]) {
    const f = M.fieldParts(sc, x, 0);
    const r = 30 + Math.abs(x), k = 2 * Math.PI / lam;
    const img = [-Math.cos(k * r) / r, -Math.sin(k * r) / r];
    const err = Math.hypot(f.pre - img[0], f.pim - img[1]) / (1 / r);
    assert.ok(err < 0.02, `x = ${x}：與鏡像波相差 ${(err * 100).toFixed(2)}%`);
  }
});

test('Babinet：很寬的金屬板後方幾乎沒有訊號（影子）', () => {
  const sc = { lam: lam, tx: { x: -30, y: 0, ax: 0, hpbw: 160 }, plate: { x: 0, y: 0, nx: -1, ny: 0, w: 600 } };
  const free = 1 / 50;
  const f = M.fieldParts(sc, 20, 0);
  assert.ok(Math.hypot(f.re, f.im) < 0.03 * free, '板後的振幅 ' + Math.hypot(f.re, f.im) / free);
});

test('沒有金屬板、兩喇叭正對（ψ = 180°）：S = (40/50)^2 = 0.64', () => {
  close(M.reflectSignal({ thetaI: 45, psi: 180, lam: lam, plate: false }), 0.64, 1e-9);
});

test('反射定律：讀數最大時 θr = θi（θi = 15°～60°，誤差 < 0.5°）', () => {
  for (const th of [15, 20, 30, 40, 45, 50, 60]) {
    const pk = M.extremum(function (psi) { return M.reflectSignal({ thetaI: th, psi: psi, lam: lam }); }, 2 * th - 25, 2 * th + 25, 1, 200);
    close(pk - th, th, 0.5, `θi = ${th}°：`);
  }
});

test('反射：發射器的軸偏了 τ，峰值跟著偏（系統誤差），θr 不再等於 θi', () => {
  const pk = M.extremum(function (psi) { return M.reflectSignal({ thetaI: 40, psi: psi, lam: lam, tilt: 2 }); }, 60, 100, 1, 200);
  assert.ok(Math.abs(pk - 80) > 1, '峰值 ' + pk);
});

test('反射：金屬板擋在中間時，板後只剩很弱的繞射訊號', () => {
  const S0 = M.reflectSignal({ thetaI: 10, psi: 180, lam: lam, plate: false });
  const S = M.reflectSignal({ thetaI: 10, psi: 180, lam: lam });
  assert.ok(S < 0.1 * S0 && S > 0.001 * S0, 'S/S0 = ' + S / S0);
});

test('駐波：相鄰波節間距 = λ/2（平均誤差 < 0.5%，每一段 < 4%）', () => {
  for (const f of [10.525, 9.4]) {
    const L = M.lambdaCm(f), p = { lam: L };
    const pp = M.platePrep(M.standingScene(p));
    const g = function (s) { return M.standingSignal(p, s, 0, pp); };
    const mins = minima(g, 25, 66, 0.02);
    assert.ok(mins.length > 20, '波節數 ' + mins.length);
    const d = mins.slice(1).map(function (x, i) { return x - mins[i]; });
    const avg = d.reduce(function (a, b) { return a + b; }) / d.length;
    close(avg, L / 2, 0.005 * L / 2, `f = ${f} GHz 平均間距：`);
    d.forEach(function (x) { close(x, L / 2, 0.04 * L / 2, `f = ${f} GHz：`); });
  }
});

test('駐波：反射板（導體）表面是波節，靠近板的波節距板 m·λ/2', () => {
  const p = { lam: lam }, pp = M.platePrep(M.standingScene(p));
  const g = function (s) { return M.standingSignal(p, s, 0, pp); };
  for (let m = 2; m <= 5; m++) {
    const x = M.KIT.plateS - m * lam / 2;
    const mn = M.extremum(g, x - lam / 6, x + lam / 6, -1, 60);
    close(mn, x, 0.03, `m = ${m}：`);
    close(M.nodeNear(p, mn), x, 1e-9);
  }
});

test('駐波：5 個波節相隔 2.5 λ → λ = 距離 ÷ 2.5', () => {
  const p = { lam: lam }, pp = M.platePrep(M.standingScene(p));
  const g = function (s) { return M.standingSignal(p, s, 0, pp); };
  const mins = minima(g, 30, 42, 0.02);
  const n = mins.length;
  const L5 = M.lambdaFromNodes(mins[n - 1], mins[n - 6], 5);
  close(L5, lam, 0.01 * lam);
  close(M.lambdaFromNodes(40, 32.875, 5), 2.85, 1e-12);
});

test('駐波：波節的讀數遠小於波腹（越靠近反射板越明顯）', () => {
  const p = { lam: lam }, pp = M.platePrep(M.standingScene(p));
  const g = function (s) { return M.standingSignal(p, s, 0, pp); };
  const near = M.KIT.plateS - 4 * lam / 2;
  const mn = g(M.extremum(g, near - 0.4, near + 0.4, -1, 40));
  const mx = g(M.extremum(g, near + lam / 4 - 0.4, near + lam / 4 + 0.4, 1, 40));
  assert.ok(mn < 0.05 * mx, '波節/波腹 = ' + mn / mx);
});

test('偏振（馬呂斯定律）：沒有偏極柵，接收器轉 θ → 讀數 ∝ cos^2θ', () => {
  const S0 = M.polarSignal({ d: 50, rx: 0 }).S;
  for (const t of [0, 15, 30, 45, 60, 75, 90]) close(M.polarSignal({ d: 50, rx: t }).S / S0, Math.cos(t * DEG) ** 2, 1e-12, `θ = ${t}°：`);
});

test('偏振：兩片偏極柵 0° 與 θ、接收器不動 → 讀數 ∝ cos^4θ（每片取 cos，接收天線再取一次）', () => {
  const S0 = M.polarSignal({ g1: { on: true, ang: 0 }, g2: { on: true, ang: 0 }, d: 50, lam: lam }).S;
  for (const t of [0, 30, 45, 60, 90]) {
    const S = M.polarSignal({ g1: { on: true, ang: 0 }, g2: { on: true, ang: t }, d: 50, lam: lam }).S;
    close(S / S0, Math.cos(t * DEG) ** 4, 1e-12, `θ = ${t}°：`);
  }
});

test('偏振：隙縫鉛直（90°）的偏極柵完全擋住鉛直的電場；轉 180° 的柵效果相同', () => {
  close(M.polarSignal({ g1: { on: true, ang: 90 }, d: 50 }).S, 0, 1e-30);
  close(M.polarSignal({ g2: { on: true, ang: 30 }, d: 50 }).S, M.polarSignal({ g2: { on: true, ang: 210 }, d: 50 }).S, 1e-15);
});

test('偏振：接收器轉 90° 收不到；中間斜放 45° 的偏極柵，訊號回到 1/4', () => {
  const S0 = M.polarSignal({ d: 50 }).S;
  close(M.polarSignal({ d: 50, rx: 90 }).S, 0, 1e-30);
  close(M.polarSignal({ d: 50, rx: 90, g2: { on: true, ang: 45 } }).S / S0, 0.25, 1e-12);
});

test('偏振：接收器轉 180°（上下顛倒）讀數不變——電場是來回振盪的', () => {
  const a = M.polarSignal({ d: 50, rx: 0, g2: { on: true, ang: 20 } }).S;
  const b = M.polarSignal({ d: 50, rx: 180, g2: { on: true, ang: 20 } }).S;
  close(a, b, 1e-15);
});

test('偏振：兩喇叭之間的多次反射使讀數隨距離以 λ/2 為週期起伏', () => {
  const g = function (d) { return M.polarSignal({ d: d, lam: lam }).S * (d + 6) * (d + 6); };
  close(g(50), g(50 + lam / 2), 1e-9);
  assert.ok(Math.abs(g(50) - g(50 + lam / 4)) > 0.05 * g(50));
});

test('菲涅耳（TE）：穿透率 + 反射率 = 1；正向入射 T = 4n/(1+n)^2', () => {
  for (const n of [1.3, 1.59, 2]) {
    close(M.fresnelT(1, n, 0), 4 * n / (1 + n) ** 2, 1e-12);
    for (const a of [0, 10, 30, 50, 70]) close(M.fresnelT(1, n, a * DEG) + M.fresnelR(1, n, a * DEG), 1, 1e-12);
    for (const a of [5, 20, 35]) {
      const ti = a * DEG;
      if (n * Math.sin(ti) < 1) close(M.fresnelT(n, 1, ti) + M.fresnelR(n, 1, ti), 1, 1e-12);
    }
  }
});

test('稜鏡：中心射線遵守司乃耳定律 n sin A = sin θ2；ψ = 180° − (θ2 − A)', () => {
  close(M.exitAngle(1.59, 30), Math.asin(0.795) / DEG, 1e-12);
  const r = M.prismFromPsi(180 - M.deviation(1.59, 30), 30);
  close(r.n, 1.59, 1e-12);
  close(M.prismFromPsi(157, 30).theta2, 53, 1e-12);
  close(M.prismFromPsi(157, 30).n, Math.sin(53 * DEG) / 0.5, 1e-12);
});

test('稜鏡：讀數最大的方向在中心射線附近（1.5° 內），空氣（n = 1）則直直穿過', () => {
  for (const n of [1.49, 1.59]) {
    const pk = M.extremum(function (psi) { return M.refractSignal({ n: n, A: 30, psi: psi, lam: lam }); }, 130, 180, 1, 100);
    close(pk, 180 - M.deviation(n, 30), 1.5, `n = ${n}：`);
  }
  const p0 = M.extremum(function (psi) { return M.refractSignal({ n: 1, A: 30, psi: psi, lam: lam }); }, 165, 180, 1, 60);
  close(p0, 180, 0.4);
});

test('稜鏡：光束偏向後，ψ = 180° 的讀數遠小於峰值', () => {
  const pk = M.refractSignal({ n: 1.59, A: 30, psi: 180 - M.deviation(1.59, 30), lam: lam });
  assert.ok(M.refractSignal({ n: 1.59, A: 30, psi: 180, lam: lam }) < 0.15 * pk);
});

test('數據分析：過原點最佳直線、平均與標準差、百分誤差', () => {
  close(M.slopeThroughOrigin([1, 2, 3], [2, 4, 6]), 2, 1e-12);
  close(M.mean([1, 2, 3, 4]), 2.5, 1e-12);
  close(M.sd([2, 4, 4, 4, 5, 5, 7, 9]), Math.sqrt(32 / 7), 1e-12);
  close(M.pctErr(2.9, 2.848), (2.9 - 2.848) / 2.848 * 100, 1e-12);
});

test('電表：讀數與 S、靈敏度成正比', () => {
  close(M.meter(0.5, 2, 'polar'), 2 * M.meter(0.5, 1, 'polar'), 1e-15);
  close(M.meter(1, 1, 'reflect'), M.KIT.meterK * M.CAL.reflect, 1e-15);
});

console.log(`${passed} 個測試通過`);
