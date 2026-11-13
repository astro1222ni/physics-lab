// 以 Node 執行：node tests/fronts-core.test.js
'use strict';
const assert = require('assert');
const F = require('../js/fronts-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const COLD = { type: 'cold', Tw: 25, Tdw: 20, Tc: 15, Tdc: 9, slope: 1 / 80, U: 36, V: 10 };
const WARM = { type: 'warm', Tw: 20, Tdw: 15, Tc: 8, Tdc: 2, slope: 1 / 150, U: 30, V: 6 };
const STAT = { type: 'stat', Tw: 28, Tdw: 25, Tc: 24, Tdc: 18, slope: 1 / 100, U: 3, V: 12 };
const mk = function (o, extra) { return F.make(Object.assign({}, o, extra || {})); };

console.log('fronts-core');

test('舉升凝結高度：Bolton 公式和「每差 1 °C 約 125 m」差不到 5 %；飽和時是 0；露點比氣溫高時當成飽和', () => {
  for (const T of [5, 15, 25, 32]) for (const d of [1, 4, 8, 15]) { const z = F.zLCL(T, T - d); near(z / (125 * d), 1, 0.05, T + '/' + d); }
  near(F.zLCL(20, 20), 0, 1e-6); near(F.zLCL(20, 25), 0, 1e-6);
});

test('溼絕熱減溫率：20 °C、1000 hPa 約 4.2 K/km，0 °C 約 6.5，−30 °C 接近乾絕熱 9.8；氣壓低時比較小', () => {
  near(F.gammaM(20, 1000) * 1000, 4.3, 0.2); near(F.gammaM(0, 1000) * 1000, 6.5, 0.2); near(F.gammaM(-30, 1000) * 1000, 9.2, 0.3);
  assert.ok(F.gammaM(-30, 1000) < F.GAMMA_D && F.gammaM(10, 500) < F.gammaM(10, 1000));
  near(F.GAMMA_D * 1000, 9.75, 0.01);
});

test('氣塊：凝結高度以下乾絕熱、混合比不變；以上混合比遞減；溼絕熱上的相當位溫（Bolton）守恆到 0.3 K', () => {
  const pc = F.parcel(25, 20), zl = pc.zl;
  const a = F.at(pc, 0), b = F.at(pc, zl * 0.9);
  near((a.T - b.T) / (zl * 0.9), F.G * (1 + pc.r0) / (F.CP + pc.r0 * F.CPV), 1e-9);  // 溼空氣的乾絕熱（比 g/cp 小 1 % 左右） near(b.r, pc.r0, 1e-12);
  for (let z = zl + 100; z < 10000; z += 250) assert.ok(F.at(pc, z + 250).r < F.at(pc, z).r);
  const th = function (q) { const t = q.T + 273.15, rg = q.r * 1000; return t * Math.pow(1000 / q.p, 0.2854 * (1 - 0.28e-3 * rg)) * Math.exp((3.376 / t - 0.00254) * rg * (1 + 0.81e-3 * rg)); };
  for (const [T, Td] of [[25, 20], [10, 2], [30, 26]]) {
    const p = F.parcel(T, Td), ref = th(F.at(p, p.zl + 50));
    for (let z = p.zl + 500; z <= 10000; z += 500) near(th(F.at(p, z)), ref, 0.3, T + '/' + Td + ' z=' + z);
  }
  const top = F.at(pc, 10000); assert.ok(top.p > 250 && top.p < 300 && top.T < -30);
});

test('抬升與降雨：w = V·tan α；降水率 = ρ·w·(雲底的混合比 − 雲頂的混合比)；風加倍雨也加倍；暖空氣那一邊不下雨', () => {
  const f = mk(COLD);
  near(f.w, 10 / 80, 1e-12);
  const c = f.cloud(10), b = F.at(f.pc, c.base), t = F.at(f.pc, F.Z_TOP);
  near(c.rate, b.rho * f.w * (b.r - t.r) * 3600, 1e-9);
  near(c.base, f.zl, 1e-9);                                  // 鋒面面還很低：雲底是凝結高度
  near(mk(COLD, { V: 20 }).rain(10) / f.rain(10), 2, 1e-9);
  assert.strictEqual(f.rain(-5), 0); assert.strictEqual(f.cloud(-5), null);
  near(f.rain(10), 7.1, 0.3);                                // 冷鋒：每小時 7 mm 左右
});

test('雲：鋒面面比凝結高度高以後，雲底跟著鋒面面升高、雨變小；雲底超過 2 km 地面就沒雨；暖鋒由遠而近是卷層雲、高層雲、雨層雲', () => {
  const f = mk(WARM);
  const s1 = f.zl / (1000 * f.tan) + 20, s2 = s1 + 100;
  near(f.cloud(s1).base, s1 * 1000 * f.tan, 1e-6);
  assert.ok(f.cloud(s2).rate < f.cloud(s1).rate);
  near(f.sRain, 2000 / (1000 / 150), 1e-9);
  assert.ok(f.rain(f.sRain - 1) > 0 && f.rain(f.sRain + 1) === 0);
  assert.strictEqual(f.cloud(f.sRain + 50).kind, 'as'); assert.strictEqual(f.cloud(1000).kind, 'cs'); assert.strictEqual(f.cloud(100).kind, 'ns');
  assert.strictEqual(f.cloud(f.sCloud + 1), null);
  assert.strictEqual(mk(COLD).cloud(10).kind, 'cb');          // 強烈抬升：積雨雲
  // 很乾的暖空氣：凝結高度超過 2 km，雲下的雨下不到地面
  const d = mk(WARM, { Tdw: -2 }); assert.ok(d.zl > 2000 && d.sRain === null && d.rain(50) === 0 && d.cloud(400));
});

test('地面氣壓：頭上冷空氣越厚氣壓越高（靜力平衡），冷空氣最多算 2.5 km', () => {
  const f = mk(COLD), s = 100, h = s * 1000 / 80;
  const rc = F.P0 * 100 / (F.RD * (15 + F.TK)), rw = F.P0 * 100 / (F.RD * (25 + F.TK));
  near(f.dp(s), F.G * h * (rc - rw) / 100, 1e-9);
  near(f.dp(-10), 0, 0); near(f.dp(1000), f.dp(200), 1e-9);
  assert.ok(f.dp(50) > 0 && f.dp(100) > f.dp(50));
});

test('冷鋒過境：先下大雨、時間短；氣溫露點下降、氣壓上升、風從西南轉西北；雨量 = ∫R ds ÷ U', () => {
  const f = mk(COLD), p = F.pass(f);
  assert.ok(p.passed && !p.capped && p.dT < -9 && p.dTd < -9 && p.dP > 5 && p.wind0 === 225 && p.wind1 === 315);
  assert.deepStrictEqual(p.clouds, ['cb', 'as']);              // 雨帶過後，頭上還有雲底升高的高層雲
  near(p.tFront, 120 / 36, 0.03);
  let I = 0; const n = 20000; for (let i = 0; i < n; i++) { const s = (i + 0.5) / n * f.sRain; I += f.rain(s) * f.sRain / n; }
  near(p.total, I / 36, 0.01 * p.total);
  near(p.hours, f.sRain / 36, 0.05);
  const p2 = F.pass(mk(COLD, { U: 18 })); near(p2.total / p.total, 2, 0.01);   // 走得慢一半，雨量加倍
});

test('暖鋒：雲由高到低一路來，雨小時間長；過境後變暖、氣壓先降；梅雨鋒面幾乎不動，雨量很大', () => {
  const w = F.pass(mk(WARM)), c = F.pass(mk(COLD));
  assert.deepStrictEqual(w.clouds, ['cs', 'as', 'ns']);
  assert.ok(w.dT > 10 && w.dP < -5 && w.peak < c.peak && w.hours > c.hours && w.wind0 === 120 && w.wind1 === 225);
  assert.ok(w.tStart > 30 && w.tFront > w.tStart);           // 先看到卷雲，一天多以後才下雨
  const s = F.pass(mk(STAT));
  assert.ok(s.total > 200 && s.capped && s.hours > 30);
});

test('雨量分級的統計：任意 1、3、24 小時的最大雨量遞增、不超過總雨量；冷鋒的雨不到一天就下完時 24 小時 = 總雨量；地面 0 °C 以下落下的是雪', () => {
  const c = F.pass(mk(COLD));
  assert.ok(c.max1 <= c.max3 + 1e-9 && c.max3 <= c.max24 + 1e-9 && c.max24 <= c.total + 1e-9);
  near(c.max24, c.total, 1e-6); near(c.max1, c.peak, 0.02 * c.peak);   // 雨率變化慢：最大 1 小時雨量 ≈ 最大雨率 × 1 h
  const s = F.pass(mk(STAT, { U: 5 })); assert.ok(s.max24 < s.total && s.max24 > 0.5 * s.total);
  assert.strictEqual(c.snow, 0);
  const sn = F.pass(mk(COLD, { Tw: 12, Tdw: 10, Tc: -5, Tdc: -8 })); assert.ok(sn.snow > 0.9 * sn.total && sn.snow <= sn.total + 1e-9);
  const w = F.pass(mk(WARM, { Tw: 20, Tdw: 18, Tc: 0, Tdc: -1, slope: 1 / 60, V: 15 }));
  assert.ok(w.snow > 0 && w.total - w.snow > 1);                 // 暖鋒前先下雪，鋒面靠近、變暖後轉成雨
  assert.ok(F.pass(mk(WARM)).tCloud < F.pass(mk(WARM)).tStart);  // 先看到雲才下雨
});

test('Margules：坡度和風切互為反函數；溫差越大坡度越緩；緯度越高（f 越大）坡度越陡', () => {
  const t = F.margulesSlope(30, 15, 10, 8);
  near(1 / t, 373, 2);
  near(F.margulesShear(30, 15, t, 8), 10, 1e-9);
  assert.ok(F.margulesSlope(30, 15, 10, 16) < t && F.margulesSlope(50, 15, 10, 8) > t);
  near(F.coriolis(90), 2 * 7.2921e-5, 1e-12); near(F.coriolis(0), 0, 1e-15);
});

console.log(`fronts-core：${passed} 項通過`);
