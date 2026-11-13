// 以 Node 執行：node tests/flame-test-core.test.js
'use strict';
const assert = require('assert');
const F = require('../js/flame-test-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`); }
function rel(a, b, tol, msg) { near(a / b, 1, tol, (msg || '') + `（${a} 對 ${b}）`); }
const base = { conc: 0.1, air: 0.8, h: F.flameShape(0.8).hp, res: 1, cobalt: false, lamp: false, TL: 2000 };
const S = function (o) { return F.spectrum(Object.assign({}, base, o)); };
const KCM = F.CM_K;   // 1 1/cm 換成 K

test('NIST 數據：鈉 D 線 588.995、589.592 nm；鋰 670.776；鉀 766.490；鍶 460.733；鋇 553.548；銫 455.528 nm', function () {
  const lam = function (s, i) { return F.METALS[s].lines[i].lam; };
  near(lam('Na', 0), 588.995095, 1e-9); near(lam('Na', 1), 589.592424, 1e-9);
  near(lam('Li', 3), 670.776, 1e-9); near(lam('K', 4), 766.489913, 1e-9);
  near(lam('Sr', 0), 460.7331, 1e-9); near(lam('Ba', 0), 553.5481, 1e-9); near(lam('Cs', 2), 455.52799, 1e-9);
  F.ORDER.forEach(function (s) { assert.ok(F.METALS[s].lines.length >= 2, s); });
});
test('每一條譜線：光子能量 hc/λ（空氣波長換成真空）＝上下能階差 E_k − E_i（誤差 < 0.02%）', function () {
  F.ORDER.forEach(function (s) {
    F.METALS[s].lines.forEach(function (l) {
      const eCm = F.photonEV(l.lam) * 8065.544;   // eV → 1/cm
      rel(eCm, l.Ek - l.Ei, 2e-4, s + ' ' + l.lam);
    });
  });
  near(F.photonEV(588.995095), 2.1044, 0.0005, '鈉 D2 約 2.104 eV');
  near(F.photonEV(670.776) * F.EV_KJ, 178.3, 0.2, '鋰紅線約 178 kJ/mol');
});
test('蒲朗克輻射：589 nm、1800 K 歸一化為 1；維恩位移 λ_max·T = 2.898 × 10^6 nm·K', function () {
  near(F.planck(589, 1800), 1, 1e-12);
  [1500, 2000, 3000].forEach(function (T) {
    let best = 0, bv = 0;
    for (let l = 200; l < 4000; l += 0.5) { const v = F.planck(l, T); if (v > bv) { bv = v; best = l; } }
    rel(best * T, 2.8978e6, 2e-3, 'T = ' + T);
  });
  assert.ok(F.planck(500, 2500) > F.planck(500, 2000), '溫度越高越亮');
});
test('都卜勒寬度：鈉 1800 K 的 1/e 半寬 = λ/c·√(2kT/m) ≈ 0.00224 nm（再乘碰撞加寬 2.5 倍）', function () {
  rel(F.dopplerWidth(589, 1800, 22.99) / F.BROAD, 2.243e-3, 0.005);
});
test('等值寬度：τ → 0 時 W = τ × 線形面積；τ 很大時 W ∝ √τ（勞侖茲翼）；隨 τ 單調增加', function () {
  rel(F.eqWidthUnit(1e-6), 1e-6 * F.PHI_AREA, 1e-9);
  rel(F.eqWidthUnit(1e-3), 1e-3 * F.PHI_AREA, 2e-3, '數值積分與小 τ 近似銜接');
  rel(F.eqWidthUnit(4e6) / F.eqWidthUnit(1e6), 2, 0.02, '平方根區');
  let prev = 0;
  [0.01, 0.1, 1, 10, 100, 1e3, 1e4].forEach(function (t) { const w = F.eqWidthUnit(t); assert.ok(w > prev, 'τ = ' + t); prev = w; });
});
test('光學薄極限：濃度很低時兩條線的亮度比 = g_k A λ^(−1) e^{−E_k/kT} 的比（波茲曼分布）', function () {
  const s = S({ metals: ['Na'], conc: 1e-7 }), T = s.T;
  const f = function (l) { return l.gk * l.A / l.lam * Math.exp(-l.Ek * KCM / T); };
  const L = F.METALS.Na.lines;
  rel(s.lines[0].net / s.lines[1].net, f(L[0]) / f(L[1]), 0.01, 'D2/D1');
  const k = S({ metals: ['K'], conc: 1e-7 }), KL = F.METALS.K.lines;
  rel(k.lines[0].net / k.lines[4].net, f(KL[0]) / f(KL[4]), 0.02, '鉀 404.4／766.5');
  // 濃度加倍 → 亮度加倍
  rel(S({ metals: ['Na'], conc: 2e-7 }).lines[0].net / s.lines[0].net, 2, 1e-3);
});
test('自吸收：0.1 M 鈉的 D 線光學深度 ≫ 1，濃度加 10 倍亮度增加遠小於 10 倍；光學薄的線照樣 10 倍', function () {
  const a = S({ metals: ['Na'], conc: 0.1 }), b = S({ metals: ['Na'], conc: 1 });
  assert.ok(a.lines[0].tau0 > 10, 'τ0 = ' + a.lines[0].tau0);
  const r = b.lines[0].net / a.lines[0].net;
  assert.ok(r > 1.5 && r < 4, '比值 ' + r);
  const c = S({ metals: ['Li'], conc: 0.01 }), d = S({ metals: ['Li'], conc: 0.1 });
  rel(d.lines[0].net / c.lines[0].net, 10, 0.01, '鋰 610.354（光學薄）');
});
test('克希何夫定律：背景燈的亮度溫度 = 火焰溫度時譜線消失；比火焰熱 → 暗線；比火焰冷 → 亮線', function () {
  const s0 = S({ metals: ['Na'] }), T = s0.T;
  near(S({ metals: ['Na'], lamp: true, TL: T }).lines[0].net, 0, 1e-15);
  assert.ok(S({ metals: ['Na'], lamp: true, TL: T + 300 }).lines[0].net < 0);
  assert.ok(S({ metals: ['Na'], lamp: true, TL: T - 300 }).lines[0].net > 0);
  const hot = S({ metals: ['Na'], lamp: true, TL: T + 300 });
  assert.ok(hot.eval(588.995095) < hot.continuum(588.995095), '暗線比連續光譜暗');
});
test('本生燈火焰：最熱的地方在內焰尖端上方；內焰裡溫度低；空氣孔全開最高 1820 K', function () {
  [0.3, 0.6, 1].forEach(function (a) {
    const Fs = F.flameShape(a);
    let best = 0, bv = 0;
    for (let h = 0; h <= 150; h += 0.1) { const t = F.temperature(h, a); if (t > bv) { bv = t; best = h; } }
    near(best, Fs.hp, 0.11, '最熱高度 a = ' + a); near(bv, Fs.Tmax, 0.05);
    assert.ok(Fs.hp > Fs.Hc, '最熱處在內焰上方');
    assert.ok(F.temperature(Fs.Hc * 0.5, a) < 0.5 * Fs.Tmax, '內焰中心是冷的');
  });
  near(F.flameShape(1).Tmax, 1820, 1e-9);
  assert.ok(F.flameShape(0).Tmax < F.flameShape(1).Tmax);
  // 連續：溫度曲線沒有跳躍
  for (let h = 0; h < 150; h += 0.05) assert.ok(Math.abs(F.temperature(h + 0.05, 0.8) - F.temperature(h, 0.8)) < 15, 'h = ' + h);
});
test('火焰顏色（人眼）：鋰深紅、鈉黃、鉀紫、銫藍、鈣磚紅、鍶紅、鋇黃綠、銅藍綠', function () {
  const want = { Li: ['深紅', '紅'], Na: ['黃'], K: ['紫', '紫紅（淡紫）', '洋紅'], Rb: ['紫', '紫紅（淡紫）', '洋紅'], Cs: ['藍', '藍紫'],
    Ca: ['橙紅（磚紅）'], Sr: ['紅', '深紅'], Ba: ['黃綠', '綠'], Cu: ['藍綠', '綠'] };
  F.ORDER.forEach(function (s) {
    const c = F.flameColor(S({ metals: [s] }));
    assert.ok(want[s].indexOf(c.name.zh) >= 0, s + ' 得到 ' + c.name.zh + '（主波長 ' + c.dw + '）');
  });
  near(F.dominantWavelength.apply(null, (function () { const c = F.cmf(589); const t = c[0] + c[1] + c[2]; return [c[0] / t, c[1] / t]; })()), 589, 1, '單色光的主波長');
});
test('鈷玻璃：擋掉鈉的黃光（589 nm 穿透 < 0.1%），讓鉀的紅線與紫線通過；鈉鉀混合透過鈷玻璃看是紫色系', function () {
  assert.ok(F.cobalt(589) < 1e-3, F.cobalt(589));
  assert.ok(F.cobalt(766.5) > 0.7 && F.cobalt(404.4) > 0.7);
  assert.equal(F.flameColor(S({ metals: ['Na', 'K'] })).name.zh, '黃', '沒有鈷玻璃：黃色蓋過紫色');
  const nk = F.flameColor(S({ metals: ['Na', 'K'], cobalt: true })).name.zh;
  assert.ok(['紫', '紫紅（淡紫）', '洋紅'].indexOf(nk) >= 0, '透過鈷玻璃：' + nk);
});
test('分光鏡解析度：狹縫 1 nm 時鈉 D 雙線分不開，0.3 nm 時分得開；找峰找到 D2（誤差 < 0.01 nm）', function () {
  assert.ok(!F.resolved(S({ metals: ['Na'], res: 1 }), 588.995095, 589.592424));
  assert.ok(F.resolved(S({ metals: ['Na'], res: 0.3 }), 588.995095, 589.592424));
  const s = S({ metals: ['Na'], res: 0.2 });
  near(F.findPeak(s, 588.9), 588.995095, 0.01);
  const m = F.measure(s, F.findPeak(s, 588.9));
  assert.ok(m.isPeak && m.near.el === 'Na' && m.resolvedD);
});
test('煤灰：空氣孔關閉時黃色發光火焰的連續光譜占九成以上；空氣孔開到 50% 以上沒有煤灰', function () {
  assert.ok(S({ metals: ['Na'], air: 0 }).sootShare() > 0.9);
  near(S({ metals: ['Na'], air: 0.8 }).sootShare(), 0, 1e-12);
  near(F.sootTau(550, 0.5), 0, 1e-12);
});
test('未知樣品：一種或兩種不同的金屬、不和上一題相同；集合比對不看順序', function () {
  const R = F.rng(7);
  let last = null;
  for (let i = 0; i < 200; i++) {
    const u = F.newUnknown(R, i % 2 === 1, last);
    assert.equal(u.metals.length, i % 2 ? 2 : 1);
    if (u.metals.length === 2) assert.notEqual(u.metals[0], u.metals[1]);
    assert.ok(!last || u.metals.join() !== last.join());
    assert.ok(u.conc >= 0.05 && u.conc <= 0.3);
    last = u.metals;
  }
  assert.ok(F.sameSet(['Na', 'K'], ['K', 'Na']) && !F.sameSet(['Na'], ['Na', 'K']));
});
test('沒有樣品時沒有譜線；所有讀數都是有限值', function () {
  const s = S({ metals: [] });
  assert.equal(s.lines.length, 0);
  near(s.eval(589), 0, 1e-15);
  F.ORDER.forEach(function (m) {
    [0, 0.5, 1].forEach(function (a) {
      [0, 30, 120].forEach(function (h) {
        const x = S({ metals: [m], air: a, h: h, conc: 1 });
        for (let l = 380; l <= 800; l += 7) assert.ok(isFinite(x.eval(l)) && x.eval(l) >= 0, m + ' ' + l);
      });
    });
  });
});

console.log('通過 ' + passed + ' 項');
