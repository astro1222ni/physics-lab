// 以 Node 執行：node tests/stars-hr-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/stars-hr-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
function rel(a, b, r, msg) { near(a, b, Math.abs(b) * r, msg); }
/** π ∫ B_λ dλ（對數格點的數值積分） */
function totalNum(T, lo, hi) { let s = 0; const q = 1.0002, lq = Math.log(q); for (let l = lo || 1e-9; l < (hi || 1e-2); l *= q) s += K.planck(l * Math.sqrt(q), T) * l * Math.sqrt(q) * lq; return Math.PI * s; }

console.log('stars-hr-core');

test('普朗克定律積分 = σT⁴（史蒂芬－波茲曼），3000–30000 K', () => {
  for (const T of [3000, 5772, 10000, 30000]) rel(totalNum(T), K.flux(T), 1e-6, 'T = ' + T);
});

test('維恩位移：數值找到的峰值波長 = b/T；太陽約 502 nm', () => {
  for (const T of [3000, 5772, 20000]) {
    let best = 0, bl = 0;
    for (let l = 50e-9; l < 3e-6; l += 0.01e-9) { const p = K.planck(l, T); if (p > best) { best = p; bl = l; } }
    rel(bl, K.peak(T), 2e-5, 'T = ' + T);
  }
  near(K.peak(5772) * 1e9, 502.0, 0.1);
});

test('L = 4πR²σT⁴：太陽的名目值彼此一致；以太陽為單位的換算可逆', () => {
  rel(K.lum(K.R_SUN, K.T_SUN), K.L_SUN, 1e-5);
  near(K.lumSun(2, K.T_SUN), 4, 1e-12);
  near(K.lumSun(1, 2 * K.T_SUN), 16, 1e-12);
  rel(K.radiusSun(K.lumSun(37, 4200), 4200), 37, 1e-12);
  rel(K.tempOf(K.lumSun(0.3, 9000), 0.3), 9000, 1e-12);
});

test('熱星等：太陽 4.74；光度 100 倍 = 亮 5 等', () => {
  near(K.mbol(1), 4.74, 1e-12);
  near(K.mbol(1) - K.mbol(100), 5, 1e-12);
});

test('波段比例：級數和數值積分一致；峰值波長以下約佔 25%；太陽的可見光約 44%', () => {
  for (const T of [3000, 5772, 15000]) {
    const all = totalNum(T), vis = totalNum(T, 380e-9, 750e-9);
    near(K.visibleFraction(T), vis / all, 6e-5, 'T = ' + T + '（數值積分的邊界落在格點中間，誤差約 2 × 10⁻⁵）');
  }
  near(K.fractionBelow(K.peak(5000), 5000), 0.25005, 2e-4);
  near(K.fractionBelow(1, 5000), 1, 1e-9);
  const b = K.bands(K.T_SUN);
  near(b.uv + b.vis + b.ir, 1, 1e-12);
  near(b.vis, 0.438, 0.002);
});

test('黑體色度和 Kim 等（2002）的 Planckian locus 一致（2200–25000 K 差 ≤ 0.004，4000 K 以上 ≤ 0.001）', () => {
  for (const T of [2200, 2856, 3500, 4000, 5000, 6504, 8000, 12000, 25000]) {
    const q = K.xyz(T), k = K.locusKim(T), d = Math.hypot(q.x - k.x, q.y - k.y);
    assert.ok(d <= (T >= 4000 ? 0.001 : 0.004), T + ' K 差 ' + d.toFixed(4));
  }
  near(K.xyz(2856).x, 0.4476, 0.002, 'CIE 標準光源 A（2856 K）');
});

test('顏色：冷星偏紅、熱星偏藍、6000–7000 K 接近白色', () => {
  const r = K.rgbLinear(3000), b = K.rgbLinear(20000), w = K.rgbLinear(6500);
  assert.ok(r[0] > r[1] && r[1] > r[2], '3000 K ' + r);
  assert.ok(b[2] >= b[1] && b[1] > b[0], '20000 K ' + b);
  assert.ok(w.every(v => v > 0.9), '6500 K ' + w);
  assert.ok(K.whiteDist(6400) < K.whiteDist(5000) && K.whiteDist(6400) < K.whiteDist(9000));
  assert.ok(/^#[0-9a-f]{6}$/.test(K.colorHex(4000)));
});

test('主序星：1 M☉ = 太陽；質量－光度分段處接近連續；越重的星壽命越短；由壽命反解質量', () => {
  const s = K.mainSequence(1);
  near(s.L, 1, 1e-12); near(s.R, 1, 1e-12); near(s.T, K.T_SUN, 1e-9); near(s.life, 1e10, 1e-3);
  rel(K.msLum(0.4299999), K.msLum(0.43), 0.05);
  rel(K.msLum(1.9999999), K.msLum(2), 0.02);
  let last = Infinity;
  for (let m = 0.1; m <= 20; m *= 1.1) { const t = K.msLife(m); assert.ok(t < last, 'm = ' + m); last = t; }
  rel(K.massForLife(13.8e9), Math.pow(1e10 / 13.8e9, 1 / 3), 1e-9, '0.43–2 M☉ 時 t = 10¹⁰ M⁻³');
  assert.strictEqual(K.mainSequence(1).cls, 'G');
  assert.strictEqual(K.mainSequence(15).cls, 'O');
  assert.strictEqual(K.mainSequence(0.2).cls, 'M');
});

test('真實恆星：半徑由 L 與 T 算出且和文獻相近；光譜型與分類合理', () => {
  const S = id => K.STARS.find(s => s.id === id);
  near(S('sun').R, 1, 1e-12);
  rel(S('sirius').R, 1.71, 0.03, '天狼星 A');
  rel(S('sirius-b').R, 0.0084, 0.05, '天狼星 B（白矮星，和地球差不多大）');
  rel(S('betelgeuse').R, 800, 0.2, '參宿四');
  K.STARS.forEach(s => rel(K.lumSun(s.R, s.T), s.L, 1e-9, s.id));
  K.STARS.filter(s => s.kind === 'wd').forEach(s => assert.ok(s.R < 0.02, s.id));
  K.STARS.filter(s => s.kind === 'super').forEach(s => assert.ok(s.L > 1000, s.id));
  assert.strictEqual(K.spectral(S('sun').T), 'G');
  assert.strictEqual(K.spectral(S('sirius').T), 'A');
  assert.strictEqual(K.spectral(S('betelgeuse').T), 'M');
  assert.strictEqual(K.spectral(S('spica').T), 'B');
  assert.ok(S('sirius-b').R * K.R_SUN / K.R_EARTH < 1, '天狼星 B 比地球小');
});

console.log(`\n${passed} 項通過${process.exitCode ? '（有失敗）' : ''}`);
