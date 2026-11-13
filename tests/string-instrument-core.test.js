/* 弦樂器：物理核心的單元測試。用法：node tests/string-instrument-core.test.js */
'use strict';
const S = require('../js/string-instrument-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }

test('梅森定律：張力變成 4 倍，頻率剛好變成 2 倍（高八度 1200 音分）', function () {
  [[0.65, 20, 0.0005], [0.328, 40, 0.0012], [1.2, 15, 0.01]].forEach(function (p) {
    const f1 = S.fundamental(p[0], p[1], p[2]), f2 = S.fundamental(p[0], 4 * p[1], p[2]);
    near(f2 / f1, 2, 1e-12);
    near(S.cents(f2 / f1), 1200, 1e-9);
  });
});

test('梅森定律：弦長減半升高八度；線密度變 4 倍降低八度；張力加倍升高 600 音分（三全音）', function () {
  const L = 0.65, T = 70, mu = 0.00342;
  const f = S.fundamental(L, T, mu);
  near(S.fundamental(L / 2, T, mu) / f, 2, 1e-12);
  near(S.fundamental(L, T, 4 * mu) / f, 0.5, 1e-12);
  near(S.cents(S.fundamental(L, 2 * T, mu) / f), 600, 1e-9);
  near(S.cents(S.fundamental(L * 2 / 3, T, mu) / f), 701.955, 1e-3, '弦長變 2/3：純五度');
});

test('波速 v = √(T/μ) = 2L·f₁（基頻的波長是弦長的 2 倍），反算張力、線密度一致', function () {
  const L = 0.65, T = 69.94, mu = 0.00342;
  const f = S.fundamental(L, T, mu), v = S.waveSpeed(T, mu);
  near(v, 2 * L * f, 1e-9);
  near(S.tensionFor(f, L, mu), T, 1e-9);
  near(S.muFor(f, L, T), mu, 1e-15);
  for (let n = 1; n <= 10; n++) near(S.harmonic(n, L, T, mu), n * f, 1e-9);
});

test('A2 弦：μ = 3.42 g/m、L = 0.65 m 時，110 Hz 需要約 69.9 N（7.13 公斤重）', function () {
  const T = S.tensionFor(110, 0.65, 0.00342);
  near(T, 69.94, 0.01);
  near(S.kgw(T), 7.132, 0.001);
});

test('材料：μ = ρπd²/4；同樣直徑，鋼弦要 7850/1140 ≈ 6.89 倍張力才和尼龍弦同音', function () {
  near(S.muWire(1140, 1) * 1000, 1140 * Math.PI / 4 / 1000, 1e-12, '尼龍 1 mm');
  near(S.diameterFor(S.muWire(7850, 0.42), 7850), 0.42, 1e-12);
  const L = 0.65, f = 220;
  const Tn = S.tensionFor(f, L, S.muWire(S.MATERIALS.nylon.rho, 0.8)), Ts = S.tensionFor(f, L, S.muWire(S.MATERIALS.steel.rho, 0.8));
  near(Ts / Tn, 7850 / 1140, 1e-12);
});

test('為什麼要纏繞：實心尼龍做 E2（L = 0.65 m、70 N）要粗到約 2.6 mm，是預設纏繞弦（1.09 mm）的 2.4 倍', function () {
  const mu = S.muFor(S.freqOf(40), 0.65, 70);
  const d = S.diameterFor(mu, 1140);
  near(d, 2.61, 0.01);
  const w = S.INSTRUMENTS.guitar.strings[0];
  ok(d / w.d > 2.3 && d / w.d < 2.5, '粗細比 ' + (d / w.d));
  // 纏繞弦的「等效密度」比尼龍大很多
  const rhoEff = (w.muG / 1000) / (Math.PI * Math.pow(w.d / 1000, 2) / 4);
  ok(rhoEff > 5 * 1140, '等效密度 ' + rhoEff.toFixed(0));
});

test('品格：第 12 品剛好在弦長的中點，相鄰品格間距比為 2^(−1/12)，第 n 品的頻率比 2^(n/12)', function () {
  [0.65, 0.328, 1.0].forEach(function (L) {
    near(S.fretX(12, L, 'et'), L / 2, 1e-15);
    for (let n = 1; n < 19; n++) {
      const g1 = S.fretX(n, L) - S.fretX(n - 1, L), g2 = S.fretX(n + 1, L) - S.fretX(n, L);
      near(g2 / g1, Math.pow(2, -1 / 12), 1e-12, '第 ' + n + ' 品間距');
      ok(g2 < g1, '間距往琴身越來越小');
    }
  });
  for (let n = 0; n <= 19; n++) near(S.cents(1 / S.fretRatio(n, 'et')), 100 * n, 1e-9);
  near(S.fretXi(7), 1 - Math.pow(2, -7 / 12), 1e-15);
  near(S.touchFret(S.fretXi(5)), 5, 1e-12);
});

test('18 法則：每一品低 1.045 音分；第 12 品低 12.5 音分；位置誤差最大在第 17 品（650 mm 弦長約 2.51 mm）', function () {
  near(S.rule18Cents(1), 1200 * Math.log2(18 / 17) - 100, 1e-12);
  near(S.rule18Cents(1), -1.045, 0.001);
  near(S.rule18Cents(12), -12.545, 0.001);
  near(S.cents(1 / S.fretRatio(12, 'r18')), 1200 + S.rule18Cents(12), 1e-9);
  ok(S.fretX(12, 1, 'r18') < 0.5, '18 法則的第 12 品不到中點');
  // 位置差 Δx(n) = L[(17/18)ⁿ − 2^(−n/12)] 先變大再變小：連續的極大在 n = ln(ln b / ln a) / ln(a/b) ≈ 17.40
  const a = 17 / 18, b = Math.pow(2, -1 / 12);
  const nStar = Math.log(Math.log(b) / Math.log(a)) / Math.log(a / b);
  near(nStar, 17.40, 0.01, '連續極大');
  near(S.rule18Worst(19), 17, 0);
  ok(S.rule18Gap(17, 1) > S.rule18Gap(18, 1) && S.rule18Gap(18, 1) > S.rule18Gap(16, 1), '17 > 18 > 16');
  near(S.rule18Gap(17, 0.65) * 1000, 2.5123, 0.0005, '第 17 品（mm）');
  // 用真正的常數 17.817 就和十二平均律完全一樣
  near(S.RULE18_K, 17.8172, 0.0001);
  for (let n = 1; n <= 19; n++) near(S.fretX(n, 0.65, 'k'), S.fretX(n, 0.65, 'et'), 1e-12);
});

test('撥弦係數：撥在正中間（β = 1/2），偶次泛音全部為 0；撥在 1/3，3 的倍數全部為 0', function () {
  for (let n = 2; n <= 40; n += 2) near(S.pluckCoeff(n, 0.5, 1), 0, 1e-15, 'n = ' + n);
  for (let n = 1; n <= 39; n += 2) ok(Math.abs(S.pluckCoeff(n, 0.5, 1)) > 1e-4, '奇次 n = ' + n + ' 不為 0');
  for (let n = 3; n <= 30; n += 3) near(S.pluckCoeff(n, 1 / 3, 1), 0, 1e-15);
  const sp = S.spectrum({ beta: 0.5 });
  for (let n = 2; n <= 24; n += 2) near(sp.A[n - 1], 0, 1e-15);
  near(sp.A[0], 1, 1e-12);
});

test('撥的瞬間（t = 0）：模態疊加收斂到三角形（2000 個模態，誤差 < 0.002h）', function () {
  [0.05, 0.12, 0.3, 0.5].forEach(function (beta) {
    const N = 2000, amps = [];
    for (let n = 1; n <= N; n++) amps.push(S.pluckCoeff(n, beta, 1));
    let worst = 0;
    for (let i = 0; i <= 200; i++) {
      const u = i / 200;
      worst = Math.max(worst, Math.abs(S.shapeAt(u, amps, 0) - S.triangle(u, beta, 1)));
    }
    ok(worst < 0.002, 'β = ' + beta + ' 最大誤差 ' + worst);
  });
  // 模態越多越準：誤差大約和 1/N 成正比
  const err = function (N) { const amps = []; for (let n = 1; n <= N; n++) amps.push(S.pluckCoeff(n, 0.2, 1)); return Math.abs(S.shapeAt(0.2, amps, 0) - 1); };
  ok(err(400) < err(100) / 3, '收斂：' + err(100) + ' → ' + err(400));
});

test('半個週期後（t = 1/(2f₁)）：弦形上下翻轉並左右對調；撥在正中間時就是單純上下翻轉', function () {
  const N = 600;
  [0.2, 0.5].forEach(function (beta) {
    const amps = []; for (let n = 1; n <= N; n++) amps.push(S.pluckCoeff(n, beta, 1));
    for (let i = 0; i <= 50; i++) {
      const u = i / 50;
      near(S.shapeAt(u, amps, Math.PI), -S.shapeAt(1 - u, amps, 0), 1e-9, 'β = ' + beta + ', u = ' + u);
      if (beta === 0.5) near(S.shapeAt(u, amps, Math.PI), -S.shapeAt(u, amps, 0), 1e-9);
    }
    // 一個完整週期後回到原來的形狀
    for (let i = 0; i <= 20; i++) near(S.shapeAt(i / 20, amps, 2 * Math.PI), S.shapeAt(i / 20, amps, 0), 1e-9);
  });
});

test('輕觸：觸在 1/3 處只留下 3 的倍數；觸在第 12、7、5、4 品，聽到第 2、3、4、5 泛音', function () {
  const sp = S.spectrum({ beta: 0.15, touch: 1 / 3 });
  for (let n = 1; n <= 24; n++) {
    if (n % 3) near(sp.g[n - 1], 0, 1e-12, 'n = ' + n + ' 應消失');
    else near(sp.g[n - 1], 1, 1e-12, 'n = ' + n + ' 應留下');
  }
  near(sp.lowest, 3, 0);
  [[12, 2], [7, 3], [5, 4], [4, 5], [19, 3]].forEach(function (p) {
    near(S.spectrum({ beta: 0.12, touch: S.fretXi(p[0]) }).lowest, p[1], 0, '第 ' + p[0] + ' 品');
  });
  // 觸在 2/3（第 19 品附近）和 1/3 一樣是第 3 泛音
  near(S.spectrum({ beta: 0.12, touch: 2 / 3 }).lowest, 3, 0);
  // 觸在 3/4（第 24 品的位置）和 1/4 一樣是第 4 泛音
  near(S.spectrum({ beta: 0.12, touch: 0.75 }).lowest, 4, 0);
});

test('輕觸 1/3 又撥在 1/3：留下的模態剛好都被撥弦位置消掉 → 幾乎無聲；觸在 1/2、撥在 1/2 也一樣', function () {
  ok(S.spectrum({ beta: 1 / 3, touch: 1 / 3 }).silent, '1/3');
  ok(S.spectrum({ beta: 0.5, touch: 0.5 }).silent, '1/2');
  ok(!S.spectrum({ beta: 0.2, touch: 1 / 3 }).silent, '撥在別處就有聲音');
  ok(!S.spectrum({ beta: 0.25, touch: 1 / 3 }).silent);
});

test('擦弦（亥姆霍茲運動）：弦形是兩段直線（一個尖角），最大位移的包絡是 4u(1 − u)', function () {
  const N = 1500, sp = S.spectrum({ bow: true, N: N });
  // 在 ωt = π/2：尖角在正中間，弦形 = 1 − |2u − 1|·…；檢查包絡與直線
  const ph = Math.PI / 2;
  near(S.shapeAt(0.5, sp.a, ph, null, true), 1, 0.002, '正中間的最大位移');
  // 任一時刻，尖角以外的部分是直線（二階差分 ≈ 0）
  const ph2 = 0.9, du = 0.01;
  let corner = 0, straight = 0;
  for (let i = 2; i < 98; i++) {
    const u = i / 100;
    const d2 = S.shapeAt(u + du, sp.a, ph2, null, true) - 2 * S.shapeAt(u, sp.a, ph2, null, true) + S.shapeAt(u - du, sp.a, ph2, null, true);
    if (Math.abs(d2) > 0.01) corner++; else straight++;
  }
  ok(corner <= 3 && straight > 90, '尖角 ' + corner + ' 處、直線 ' + straight + ' 處');
  // 包絡：掃一個週期找每個 u 的最大位移
  [0.2, 0.35, 0.5].forEach(function (u) {
    let m = 0;
    for (let k = 0; k <= 400; k++) m = Math.max(m, Math.abs(S.shapeAt(u, sp.a, 2 * Math.PI * k / 400, null, true)));
    near(m, 4 * u * (1 - u), 0.01, 'u = ' + u);
  });
});

test('標準調弦（A4 = 440 Hz）：E2 82.41、A2 110、D3 146.83、G3 196.00、B3 246.94、E4 329.63 Hz', function () {
  const want = [82.407, 110, 146.832, 195.998, 246.942, 329.628];
  S.INSTRUMENTS.guitar.strings.forEach(function (s, i) { near(S.freqOf(s.midi), want[i], 0.001); });
  near(S.freqOf(S.INSTRUMENTS.violin.strings[2].midi), 440, 1e-9);
  near(S.freqOf(S.INSTRUMENTS.erhu.strings[0].midi), 293.665, 0.001);
});

test('樂器預設：剛好調準的張力在 25–90 N；拿出琴盒的狀態每條弦都偏 10 音分以上（要調音）', function () {
  S.INST_IDS.forEach(function (id) {
    const I = S.INSTRUMENTS[id], P = S.presetInstrument(id);
    near(P.L, I.L, 0);
    I.strings.forEach(function (s, i) {
      const T0 = S.inTuneTension(id, i);
      ok(T0 > 25 && T0 < 90, id + ' ' + s.label + ' T0 = ' + T0);
      near(S.fundamental(I.L, T0, S.presetMuG(s) / 1000), S.freqOf(s.midi), 1e-9);
      const p = P.strings[i];
      ok(p.T >= S.RANGES.T[0] && p.T <= S.RANGES.T[1], '張力在滑桿範圍內');
      ok(p.muG >= S.RANGES.muG[0] && p.muG <= S.RANGES.muG[1], '線密度在滑桿範圍內');
      const dev = S.cents(S.fundamental(I.L, p.T, p.muG / 1000) / S.freqOf(s.midi));
      ok(Math.abs(dev) >= 10 && Math.abs(dev - s.detune) < 1, id + ' ' + s.label + ' 偏 ' + dev.toFixed(2));
    });
  });
});

test('analyze()：按第 12 品是空弦的 2 倍；輕觸第 7 品聽到 3 倍；18 法則第 12 品低 12.5 音分', function () {
  const P = S.presetInstrument('guitar');
  const base = { inst: 'guitar', L: P.L, strings: P.strings, si: 1, hand: 'press', fret: 0, finger: 0, rule: 'et', touch: 0.5, beta: 0.2 };
  const open = S.analyze(base);
  const f12 = S.analyze(Object.assign({}, base, { fret: 12 }));
  near(f12.f1 / open.f1, 2, 1e-12);
  near(f12.Leff, P.L / 2, 1e-15);
  const h7 = S.analyze(Object.assign({}, base, { hand: 'touch', touch: S.fretXi(7) }));
  near(h7.lowest, 3, 0); near(h7.fSound / open.fOpen, 3, 1e-12);
  near(h7.centsUp, 1901.955, 0.001);
  const r12 = S.analyze(Object.assign({}, base, { fret: 12, rule: 'r18' }));
  near(r12.centsUp, 1200 + S.rule18Cents(12), 1e-9);
  // 無品樂器：手指在 12 個半音也是一半長
  const V = S.presetInstrument('violin');
  const v12 = S.analyze({ inst: 'violin', L: V.L, strings: V.strings, si: 2, hand: 'press', finger: 12, rule: 'et', touch: 0.5, beta: 0.2 });
  near(v12.Leff, V.L / 2, 1e-15);
  near(v12.fret, null, 0);
  // 每條弦的偏差（調弦表）
  near(open.devs.length, 6, 0);
  near(open.devs[1], S.INSTRUMENTS.guitar.strings[1].detune, 1);
});

test('材料模式：線密度改用 ρπd²/4', function () {
  const st = { T: 50, muG: 1, mode: 'mat', mat: 'steel', d: 0.3 };
  near(S.stringMu(st), 7850 * Math.PI * 0.0003 * 0.0003 / 4, 1e-15);
  near(S.stringMu({ T: 50, muG: 1.234, mode: 'mu', mat: 'nylon', d: 1 }), 0.001234, 1e-15);
});

test('衰減：高次泛音衰減較快，τ 都是正的有限值', function () {
  ['guitar', 'violin', 'erhu'].forEach(function (id) {
    for (let n = 1; n < 24; n++) {
      const t1 = S.decayTau(n, 110, id), t2 = S.decayTau(n + 1, 110, id);
      ok(t1 > 0 && isFinite(t1) && t2 < t1, id + ' n = ' + n);
    }
  });
});

console.log('\n通過 ' + pass + ' 項，失敗 ' + fail + ' 項');
if (fail) process.exit(1);
