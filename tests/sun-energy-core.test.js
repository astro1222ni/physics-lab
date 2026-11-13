// 以 Node 執行：node tests/sun-energy-core.test.js
'use strict';
const assert = require('assert');
const S = require('../js/sun-energy-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
function rel(a, b, r, msg) { assert.ok(Math.abs(a / b - 1) <= r, (msg || '') + ` 期望 ${b}（相對誤差 ${r}），得到 ${a}`); }

console.log('sun-energy-core');

test('太陽：L = 4πR²σT⁴ 以 R☉、5772 K 算出 IAU 標稱光度；1 AU 的太陽常數 1361 W/m²', () => {
  rel(S.lum(1, S.TSUN), S.LSUN, 1e-3);
  near(S.S0, 1361, 1);
  rel(S.flux(S.LSUN, 1), S.S0, 1e-12);
});

test('平方反比：距離 2 倍、3 倍，每平方公尺的功率變成 1/4、1/9；distFor 是 flux 的反函數', () => {
  const L = S.LSUN;
  rel(S.flux(L, 2), S.flux(L, 1) / 4, 1e-12);
  rel(S.flux(L, 3), S.flux(L, 1) / 9, 1e-12);
  for (const d of [0.3, 1, 5.2, 30]) rel(S.distFor(L, S.flux(L, d)), d, 1e-12);
  // 半徑 4πd² 的球面上總功率永遠是 L（能量守恆）
  for (const d of [0.4, 1, 10]) rel(S.flux(L, d) * 4 * Math.PI * Math.pow(d * S.AU, 2), L, 1e-12);
});

test('史特凡–波茲曼：溫度 2 倍光度 16 倍；半徑 2 倍光度 4 倍', () => {
  rel(S.lum(1, 2 * 5772) / S.lum(1, 5772), 16, 1e-12);
  rel(S.lum(2, 5772) / S.lum(1, 5772), 4, 1e-12);
});

test('維恩位移定律：太陽輻射最強在約 502 nm（綠光）；光從太陽到地球約 499 秒', () => {
  near(S.wien(5772) * 1e9, 502, 0.5);
  near(S.lightTime(1), 499, 0.5);
});

test('真實恆星的光度數量級：比鄰星約 0.0017、天狼星 A 約 25、45 億年前的太陽約 0.7 L☉', () => {
  const L = id => { const s = S.STARS.find(x => x.id === id); return S.lum(s.R, s.T) / S.LSUN; };
  near(L('proxima'), 0.0017, 0.0003);
  near(L('sirius'), 25.4, 1);
  near(L('young'), 0.71, 0.02);
  assert.ok(L('giant') > 1000 && L('betelgeuse') > 5e4);
});

test('質量虧損：4 個氫原子比 1 個氦原子重 0.0287 u（0.71 %）→ 26.73 MeV；三步反應的能量加起來相同', () => {
  near(S.DM, 0.028697, 1e-6);
  near(S.DM / (4 * S.M_H), 0.00712, 1e-5);
  near(S.Q, 26.731, 0.002);
  const sum = S.PP.reduce((a, p) => a + p.Q * p.times, 0);
  near(sum, S.Q, 0.005);
  near(S.ETA, 0.00696, 1e-5);
});

test('每秒的核融合：E = Δmc² 前後一致；用掉的氫 − 做出的氦 = 少掉的質量；太陽每秒少約 43.6 億公斤', () => {
  const f = S.fusion(S.LSUN);
  rel(f.rate * S.Q_HEAT * S.MEV, S.LSUN, 1e-12);
  rel(f.dm * S.C * S.C, f.rate * S.Q * S.MEV, 1e-6);
  rel(f.H - f.He, f.dm, 1e-6);
  near(f.dm / 1e9, 4.36, 0.02);
  near(f.H / 1e11, 6.12, 0.03);
  near(f.rate / 1e37, 9.14, 0.05);
});

test('微中子：地球每平方公分每秒約 650 億個（標準太陽模型 6.5×10¹⁰）', () => {
  near(S.nuFlux(S.LSUN, 1) / 1e4 / 1e10, 6.5, 0.1);
  rel(S.nuFlux(S.LSUN, 2), S.nuFlux(S.LSUN, 1) / 4, 1e-12);
});

test('壽命：化學燃燒只有幾千年、重力收縮約 3000 萬年，都比地球的年齡短；核融合（燒掉 10 %）約 100 億年', () => {
  const t = S.lifetimes(S.LSUN, 1, 1, 0.1);
  assert.ok(t.chem > 3000 && t.chem < 8000, 'chem ' + t.chem);
  assert.ok(t.grav > 2e7 && t.grav < 5e7, 'grav ' + t.grav);
  near(t.nuc / 1e10, 1.03, 0.03);
  assert.ok(t.chem < t.grav && t.grav < S.EARTH_AGE && S.EARTH_AGE < t.nuc);
  // 壽命 ∝ 燃料 / 光度
  rel(S.lifetimes(2 * S.LSUN, 1, 1, 0.1).nuc, t.nuc / 2, 1e-12);
  rel(S.lifetimes(S.LSUN, 1, 1, 0.2).nuc, t.nuc * 2, 1e-12);
  rel(S.lifetimes(S.LSUN, 2, 1, 0.1).grav, t.grav * 4, 1e-12);
});

test('大氣質量：天頂 1、高度 30° 約 2（≈ 1/sin h）、越低越大；地面照度隨之變小', () => {
  near(S.airMass(90), 1, 1e-3);
  near(S.airMass(30), 1.994, 0.005);
  near(S.airMass(60), 1 / Math.sin(Math.PI / 3), 0.002);
  let prevM = 0, prevI = Infinity;
  for (let h = 90; h >= 3; h -= 3) {
    const m = S.airMass(h), I = S.ground(S.S0, 0.3, h);
    assert.ok(m > prevM && I < prevI, 'h=' + h);
    prevM = m; prevI = I;
  }
  rel(S.ground(S.S0, 0, 20), S.S0, 1e-12);
});

test('水盒：剛開始 ΔT ≈ Pt/C；很久以後趨近 P/k；學生算的照度永遠 ≤ α×地面照度，時間越短越接近', () => {
  const o = { S: S.S0, h: 60, tau: 0.3, alpha: 0.95, mw: 0.2 };
  const a = S.pan(Object.assign({ dur: 1 }, o));
  rel(a.dT, a.P * 1 / a.Cth, 1e-3);
  rel(a.Iest, 0.95 * a.Ig, 1e-3);
  const b = S.pan(Object.assign({ dur: 1e7 }, o));
  rel(b.dT, b.P / S.PAN.K, 1e-6);
  let prev = Infinity;
  for (const dur of [30, 120, 600, 1200]) {
    const r = S.pan(Object.assign({ dur: dur }, o));
    assert.ok(r.Iest < 0.95 * r.Ig && r.Iest < prev);
    prev = r.Iest;
  }
  // 能量守恆：吸收 = 水和盒子增加的熱 + 散掉的熱
  const r = S.pan(Object.assign({ dur: 600 }, o));
  let lost = 0; const n = 6000;
  for (let i = 0; i < n; i++) { const t = (i + 0.5) * 600 / n; lost += S.PAN.K * (r.Tat(t) - S.PAN.TAIR) * 600 / n; }
  rel(r.P * 600, r.Cth * r.dT + lost, 1e-4);
});

test('Langley 法：理想量測（全吸收、極短時間）外推回大氣外的 S 與光學厚度 τ；只有一種高度時無法外推', () => {
  for (const tau of [0.15, 0.3, 0.6]) {
    const pts = [20, 35, 50, 70, 88].map(h => { const q = S.pan({ S: S.S0, h: h, tau: tau, alpha: 1, mw: 0.5, dur: 1 }); return { m: q.m, I: q.Iest }; });
    const f = S.langley(pts);
    rel(f.S0, S.S0, 2e-3, 'tau=' + tau);
    near(f.tau, tau, 1e-3);
    near(f.r2, 1, 1e-9);
  }
  assert.strictEqual(S.langley([{ m: 1.2, I: 900 }]), null);
  assert.strictEqual(S.langley([{ m: 1.2, I: 900 }, { m: 1.2, I: 880 }]), null);
  // 吸收率與散熱讓每一點都乘上差不多的比例：外推值偏小，但 τ 仍然準
  const pts = [25, 40, 60, 85].map(h => { const q = S.pan({ S: S.S0, h: h, tau: 0.3, alpha: 0.9, mw: 0.2, dur: 300 }); return { m: q.m, I: q.Iest }; });
  const f = S.langley(pts);
  assert.ok(f.S0 < 0.9 * S.S0 && f.S0 > 0.8 * S.S0, 'S0 ' + f.S0);
  near(f.tau, 0.3, 0.03);
});

console.log(`sun-energy-core：${passed} 項通過`);
