// 以 Node 執行：node tests/parallax-core.test.js
'use strict';
const assert = require('assert');
const P = require('../js/parallax-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const star = (id) => P.STARS.find(s => s.id === id);

console.log('parallax-core');

test('秒差距：視差 1″ 的距離是 206265 AU、3.26 光年；比鄰星 1.30 pc、4.25 光年', () => {
  near(P.distOf(1).au, 206264.8, 0.1);
  near(P.distOf(1).ly, 3.2616, 1e-4);
  near(P.AU_PER_PC, 180 * 3600 / Math.PI, 1e-3);
  near(P.distOf(0.76807).pc, 1.302, 0.001);
  near(P.distOf(0.76807).ly, 4.246, 0.002);
  assert.strictEqual(P.distOf(0), null);
  assert.strictEqual(P.distOf(-0.1), null);
});

test('赤道 → 黃道座標：春分點不動、北黃極在黃緯 90°、比鄰星黃緯約 −44.8°、北極星約 +66°', () => {
  const e0 = P.eqToEcl(0, 0); near(e0.lam, 0, 1e-9); near(e0.beta, 0, 1e-9);
  near(P.eqToEcl(270, 90 - P.OBL).beta, 90, 1e-6);
  near(P.eqToEcl(90, P.OBL).beta, 0, 1e-9); near(P.eqToEcl(90, P.OBL).lam, 90, 1e-9);
  near(star('proxima').beta, -44.76, 0.05);
  near(star('polaris').beta, 66.1, 0.2);
});

test('自行換座標大小不變；巴納德星每年 10.4″ 最快', () => {
  P.STARS.forEach(s => near(Math.hypot(s.mux, s.muy), Math.hypot(s.pmra, s.pmdec), 1e-9, s.id));
  const fastest = P.STARS.slice().sort((a, b) => Math.hypot(b.mux, b.muy) - Math.hypot(a.mux, a.muy))[0];
  assert.strictEqual(fastest.id, 'barnard');
});

test('視差因子的公式和向量算法（觀測者在地球）一致', () => {
  for (const s of P.STARS) for (let t = 0; t < 1; t += 0.07) {
    const f = P.pfactor(s.lam, s.beta, t), v = P.shiftAt(P.earthPos(t), s.lam, s.beta, 1);
    near(f.x, v.x, 1e-12); near(f.y, v.y, 1e-12);
  }
  // 地球在太陽的對面：太陽黃經 1 月 1 日約 280°，7 月初約 100°
  near(P.sunLon(0), 280.46, 1e-9); near(P.sunLon(0.5), 100.46, 1e-9);
});

test('一年畫一個橢圓：半長軸 p、半短軸 p|sin β|；黃極是圓、黃道上是直線段', () => {
  const ell = (lam, beta) => { let mx = 0, my = 0; for (let t = 0; t < 1; t += 1 / 2000) { const f = P.pfactor(lam, beta, t); mx = Math.max(mx, Math.abs(f.x)); my = Math.max(my, Math.abs(f.y)); } return { mx, my }; };
  const a = ell(40, 30); near(a.mx, 1, 1e-5); near(a.my, 0.5, 1e-5);
  const pole = ell(0, 90); near(pole.mx, 1, 1e-5); near(pole.my, 1, 1e-5);
  const ecl = ell(123, 0); near(ecl.mx, 1, 1e-5); near(ecl.my, 0, 1e-12);
  // 相隔半年的兩個位置剛好相反，張角 2p
  const f1 = P.pfactor(200, 10, 0.1), f2 = P.pfactor(200, 10, 0.6);
  near(f1.x, -f2.x, 1e-12); near(f1.y, -f2.y, 1e-12);
});

test('自行讓恆星沿直線走，視差在上面畫圈：兩年後回到「直線上」同一個相位', () => {
  const s = star('barnard'), a = P.apparent(s, 0.3), b = P.apparent(s, 2.3);
  near(b.x - a.x, 2 * s.mux, 1e-9); near(b.y - a.y, 2 * s.muy, 1e-9);
});

test('拉長基線：θ（″）= B（AU）/ d（pc）；地球軌道直徑 2 AU 看比鄰星是 2p', () => {
  near(P.baselineShift(2, 1 / 0.76807), 2 * 0.76807, 1e-12);
  near(P.baselineShift(1, 1), 1, 1e-12);
  // 和精確的幾何（兩條視線的夾角）比較：47 AU 看 1.3 pc 的恆星
  const dAU = 1.302 * P.AU_PER_PC, exact = 2 * Math.atan(23.5 / dAU) * P.AU_PER_PC;
  near(P.baselineShift(47, 1.302), exact, 1e-6);
});

test('常態亂數：決定性、平均 0、標準差 1', () => {
  assert.strictEqual(P.gauss(7, 3), P.gauss(7, 3));
  let s = 0, s2 = 0; const N = 20000;
  for (let k = 0; k < N; k++) { const g = P.gauss(11, k); s += g; s2 += g * g; }
  near(s / N, 0, 0.03); near(Math.sqrt(s2 / N), 1, 0.03);
});

test('最小平方法：沒有誤差時完全解回視差與自行', () => {
  const s = star('barnard'), ph = [];
  for (let k = 0; k < 9; k++) { const t = k * 0.27, a = P.apparent(s, t); ph.push({ t: t, x: a.x + 3, y: a.y - 1, sigma: 0.01 }); }
  const f = P.fit(ph, s.lam, s.beta, true);
  near(f.p, s.p, 1e-9); near(f.mux, s.mux, 1e-9); near(f.muy, s.muy, 1e-9); near(f.x0, 3, 1e-9); near(f.y0, -1, 1e-9);
  near(f.chi2, 0, 1e-12);
  // 照片太少解不出來
  assert.strictEqual(P.fit(ph.slice(0, 2), s.lam, s.beta, true), null);
});

test('誤差估計可信：很多次重做，算出的 p 散布 ≈ 報告的標準差；照片越多越準（∝ 1/√N）', () => {
  const s = star('cyg61'), sig = 0.15;
  const run = (seed, N) => { const ph = []; for (let k = 0; k < N; k++) ph.push(P.photo(s, 0.05 + 2 * k / N, sig, seed, k)); return P.fit(ph, s.lam, s.beta, true); };
  const ps = [], sps = [];
  for (let seed = 1; seed <= 400; seed++) { const f = run(seed, 12); ps.push(f.p); sps.push(f.sp); }
  const mean = ps.reduce((a, b) => a + b) / ps.length, sd = Math.sqrt(ps.reduce((a, b) => a + (b - mean) * (b - mean), 0) / ps.length);
  near(mean, s.p, 0.02);
  near(sd / sps[0], 1, 0.12);
  near(run(1, 48).sp / run(1, 12).sp, 0.5, 0.05);
});

test('只拍半年又要解自行：視差和自行分不開，誤差大很多；拍滿兩年就好', () => {
  const s = star('vega'), mk = (span) => { const ph = []; for (let k = 0; k < 8; k++) ph.push(P.photo(s, span * k / 7, 0.01, 3, k)); return P.fit(ph, s.lam, s.beta, true); };
  assert.ok(mk(0.4).sp > 3 * mk(2).sp, mk(0.4).sp + ' vs ' + mk(2).sp);
  // 已知沒有自行時，半年兩張就夠
  const ph2 = [P.photo(Object.assign({}, s, { mux: 0, muy: 0 }), 0.1, 0.01, 3, 0), P.photo(Object.assign({}, s, { mux: 0, muy: 0 }), 0.6, 0.01, 3, 1)];
  const f = P.fit(ph2, s.lam, s.beta, false);
  assert.ok(f && Math.abs(f.p - s.p) < 0.03);
});

test('儀器：第谷的肉眼（60″）量不到任何恆星的視差；貝索量得到天鵝座 61；Gaia 量得到參宿四', () => {
  const sig = id => P.INSTRUMENTS.find(i => i.id === id).sigma;
  assert.ok(Math.max.apply(null, P.STARS.map(s => s.p)) < sig('eye') / 50);
  // 貝索：一張照片的誤差比視差還大，但拍 24 張、跨一年半，就能量到 ±20 % 以內
  const c = star('cyg61'), ph = []; for (let k = 0; k < 24; k++) ph.push(P.photo(c, 1.5 * k / 23, sig('bessel'), 5, k));
  const f = P.fit(ph, c.lam, c.beta, true);
  assert.ok(sig('bessel') > c.p / 2 && f.sp < c.p / 5, 'sp ' + f.sp);
  assert.ok(star('betelgeuse').p > 20 * sig('gaia'));
});

test('日期：1 月 1 日、7 月 2 日左右', () => {
  const d0 = P.dateOf(0); assert.ok(d0.month === 1 && d0.day === 1);
  const d1 = P.dateOf(0.5); assert.ok(d1.month === 7 && d1.day >= 1 && d1.day <= 3, JSON.stringify(d1));
  const d2 = P.dateOf(1.999); assert.ok(d2.year === 1 && d2.month === 12 && d2.day === 31, JSON.stringify(d2));
});

console.log(`parallax-core：${passed} 項通過`);
