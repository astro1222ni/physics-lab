/* 泛音列與音色：數學核心的單元測試。用法：node tests/harmonic-series-core.test.js */
'use strict';
const H = require('../js/harmonic-series-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
const PI = Math.PI;
const arr = function (o) { const a = new Array(16).fill(0); Object.keys(o).forEach(function (k) { a[k - 1] = o[k]; }); return a; };
const exact = function (coef, N) { const c = []; for (let k = 1; k <= N; k++) { const v = coef(k); if (v) c.push({ k: k, c: v, p: 0 }); } return c; };
const r = H.rng(7);
const randA = function () { const a = []; for (let k = 0; k < 16; k++) a.push(r() < 0.3 ? 0 : Math.round((r() * 2 - 1) * 100) / 100); return a; };

test('對數基頻滑桿：0 → 110 Hz、1000 → 880 Hz、每 333.3 格一個八度，兩個換算互為反函數', function () {
  near(H.f0FromPos(0), 110, 1e-12); near(H.f0FromPos(1000), 880, 1e-9);
  near(H.f0FromPos(1000 / 3), 220, 1e-9); near(H.f0FromPos(2000 / 3), 440, 1e-9);
  for (let p = 0; p <= 1000; p += 7.3) near(H.posFromF0(H.f0FromPos(p)), p, 1e-9);
});

test('精確的傅立葉係數：方波 4/(πk)（只有奇次）、鋸齒波 ±2/(πk)、三角波 ±8/(π²k²)（只有奇次）', function () {
  near(H.squareCoef(1), 4 / PI, 1e-15); near(H.squareCoef(3), 4 / (3 * PI), 1e-15); ok(H.squareCoef(2) === 0 && H.squareCoef(16) === 0);
  near(H.sawCoef(1), 2 / PI, 1e-15); near(H.sawCoef(2), -1 / PI, 1e-15); near(H.sawCoef(5), 2 / (5 * PI), 1e-15);
  near(H.triangleCoef(1), 8 / (PI * PI), 1e-15); near(H.triangleCoef(3), -8 / (9 * PI * PI), 1e-15); near(H.triangleCoef(5), 8 / (25 * PI * PI), 1e-15);
  ok(H.triangleCoef(4) === 0);
});

test('係數真的是傅立葉係數：b_k = 2∫x(t) sin(2πkt) dt（數值積分對照理想波形）', function () {
  const n = 200000;
  ['square', 'sawtooth', 'triangle'].forEach(function (kind) {
    const coef = kind === 'square' ? H.squareCoef : kind === 'sawtooth' ? H.sawCoef : H.triangleCoef;
    for (let k = 1; k <= 9; k++) {
      let s = 0;
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; s += H.idealWave(kind, t) * Math.sin(2 * PI * k * t); }
      near(2 * s / n, coef(k), 2e-5, kind + ' k = ' + k);
    }
  });
});

test('部分和收斂到理想波形：三角波（係數 ∝ 1/k²）比方波（∝ 1/k）收斂得快很多', function () {
  // 三角波：最大誤差隨 N 變小，大約 ∝ 1/N
  const t5 = H.supError('triangle', 5), t15 = H.supError('triangle', 15), t51 = H.supError('triangle', 51);
  ok(t15 < t5 / 2.5 && t51 < t15 / 3, '三角波誤差 ' + [t5, t15, t51].join('、'));
  ok(t51 < 0.01, '三角波 51 項的最大誤差 ' + t51);
  // 方波：在跳躍點附近的最大誤差不會變小（取樣點離跳躍越來越近，部分和還來不及跟上）
  const s5 = H.supError('square', 5), s51 = H.supError('square', 51);
  ok(s5 > 0.9 && s51 > 0.9, '方波最大誤差 ' + s5 + '、' + s51);
  // 但均方誤差（能量）兩者都趨近 0，方波的較慢：Σ_{k>N} b_k²/2
  const tail = function (coef, N) { let s = 0; for (let k = N + 1; k < 200000; k++) s += coef(k) * coef(k) / 2; return s; };
  ok(tail(H.triangleCoef, 15) < tail(H.squareCoef, 15) / 100, '三角波尾巴的能量遠小於方波');
});

test('吉布斯現象：方波截斷後，跳躍旁的過衝不會隨 N 消失，而是趨近跳躍量的約 8.95%（(1/π)·Si(π) − 1/2）', function () {
  // Si(π) 用辛普森法數值積分
  let si = 0; const m = 20000;
  for (let i = 0; i <= m; i++) { const x = PI * i / m, f = x === 0 ? 1 : Math.sin(x) / x; si += (i === 0 || i === m ? 1 : i % 2 ? 4 : 2) * f; }
  si *= PI / m / 3;
  const limit = si / PI - 0.5;
  near(limit, 0.08949, 1e-4, '極限值');
  const g = [3, 7, 15, 31, 101, 1001].map(H.gibbsSquare);
  for (let i = 1; i < g.length; i++) ok(g[i] < g[i - 1] + 1e-12, '過衝隨 N 單調趨近極限：' + g.join('、'));
  near(g[g.length - 1], limit, 2e-5, 'N = 1001');
  ok(g[2] > 0.089 && g[2] < 0.091, 'N = 15 的過衝 ' + g[2] + ' 已經接近 9%');
  // 與直接取樣找最大值一致
  near(H.peak(exact(H.squareCoef, 15)), 1 + 2 * g[2], 1e-6, '取樣找到的峰值');
});

test('帕塞瓦爾定理：均方值 = Σ c²/2，和直接對一個週期積分一致（隨機的 200 組長條、兩種相位）', function () {
  for (let i = 0; i < 200; i++) {
    const a = randA(), N = 1 + Math.floor(r() * 16);
    ['sine', 'random'].forEach(function (mode) {
      const c = H.components(a, N, mode, 1 + i);
      near(H.meanSquareNumeric(c, 64), H.meanSquare(c), 1e-12, '第 ' + i + ' 組 ' + mode);
    });
  }
  // 理想方波的均方值是 1：Σ (4/πk)²/2 = (8/π²)·(π²/8) = 1
  near(H.meanSquare(exact(H.squareCoef, 20001)), 1, 1e-4, '方波');
  // 理想三角波、鋸齒波的均方值是 1/3
  near(H.meanSquare(exact(H.triangleCoef, 2001)), 1 / 3, 1e-9, '三角波');
  near(H.meanSquare(exact(H.sawCoef, 200001)), 1 / 3, 1e-5, '鋸齒波');
});

test('相位改變波形、不改變頻譜：振幅譜、均方根、頻譜重心都一樣，波形與峰值不一樣', function () {
  ['square', 'sawtooth', 'violin', 'oboe'].forEach(function (id) {
    const a = H.preset(id, 220);
    const s = H.analyze(a, 12, 'sine', 1, 220), q = H.analyze(a, 12, 'random', 3, 220);
    // 振幅譜相同
    const ms = s.comp.map(function (x) { return Math.abs(x.c); }), mq = q.comp.map(function (x) { return x.c; });
    ok(JSON.stringify(ms) === JSON.stringify(mq), id + ' 振幅譜');
    near(q.rms, s.rms, 1e-12, id + ' 均方根'); near(q.cr, s.cr, 1e-12, id + ' 頻譜重心');
    // 波形不同
    let d = 0; for (let i = 0; i < 400; i++) d = Math.max(d, Math.abs(H.waveAt(s.comp, i / 400) - H.waveAt(q.comp, i / 400)));
    ok(d > 0.1, id + ' 波形應該不同（最大差 ' + d + '）');
    ok(Math.abs(q.peak - s.peak) > 1e-3, id + ' 峰值應該不同');
    near(q.crestSine, s.crest, 1e-12, id + ' 同相時的峰值因數');
  });
  // 不同組的隨機相位不同、同一組永遠相同
  const p1 = H.randomPhases(1), p1b = H.randomPhases(1), p2 = H.randomPhases(2);
  ok(JSON.stringify(p1) === JSON.stringify(p1b) && JSON.stringify(p1) !== JSON.stringify(p2));
  ok(p1.every(function (x) { return x >= 0 && x < 2 * PI; }));
});

test('峰值因數：純音與任何單獨的泛音都是 √2、三角波 √3、方波因吉布斯過衝約 1.18；任何波形都 ≥ 1', function () {
  near(H.crest([{ k: 1, c: 1, p: 0 }]), Math.SQRT2, 1e-9, '純音');
  near(H.crest([{ k: 5, c: 0.3, p: 1.1 }]), Math.SQRT2, 1e-9, '任一個單獨的泛音');
  near(H.crest(exact(H.triangleCoef, 401)), Math.sqrt(3), 2e-3, '三角波');
  // 方波與鋸齒波有吉布斯過衝，峰值多出約 9% 的跳躍量
  near(H.crest(exact(H.squareCoef, 2001)), 1 + 2 * 0.0895, 2e-3, '方波（含過衝）');
  for (let i = 0; i < 100; i++) { const c = H.components(randA(), 16, i % 2 ? 'sine' : 'random', i + 1); if (c.length) ok(H.crest(c) >= 1 - 1e-12, '峰值因數 < 1'); }
});

test('只有奇次泛音時，後半週期是前半週期倒過來：x(t + T/2) = −x(t)（任何相位都成立）', function () {
  const odd = arr({ 1: 1, 3: 0.5, 5: -0.3, 7: 0.2, 9: 0.1 });
  ['sine', 'random'].forEach(function (mode) {
    for (let seed = 1; seed <= 5; seed++) {
      const c = H.components(odd, 16, mode, seed);
      for (let i = 0; i < 200; i++) { const t = i / 200; near(H.waveAt(c, t + 0.5), -H.waveAt(c, t), 1e-12, mode + ' t = ' + t); }
    }
  });
  // 有偶次泛音就不成立
  const c2 = H.components(arr({ 1: 1, 2: 0.5 }), 16, 'sine', 1);
  ok(Math.abs(H.waveAt(c2, 0.6) + H.waveAt(c2, 0.1)) > 0.1);
});

test('最大公因數：只留偶次 → 波形每半個週期就重複（高八度）；缺基頻但有 2、3 → 仍以基頻重複', function () {
  const g = function (o) { return H.harmonicGcd(H.components(arr(o), 16, 'sine', 1)); };
  ok(g({ 2: 1, 4: 0.5, 6: 0.3 }) === 2, '只有偶次');
  ok(g({ 2: 1, 3: 1 }) === 1, '缺基頻的 2、3');
  ok(g({ 3: 1, 6: 1, 9: 1 }) === 3 && g({ 4: 1 }) === 4 && g({ 4: 1, 5: 1, 6: 1 }) === 1);
  const c = H.components(arr({ 2: 1, 4: 0.5, 6: 0.3 }), 16, 'random', 4);
  for (let i = 0; i < 50; i++) near(H.waveAt(c, i / 50 + 0.5), H.waveAt(c, i / 50), 1e-12, '週期 T/2');
});

test('頻譜重心（振幅平方加權）：純音 = 1、兩個等強的泛音在中間、與整體大小無關', function () {
  near(H.centroidRatio(H.components(arr({ 1: 1 }), 16, 'sine', 1)), 1, 1e-15);
  near(H.centroidRatio(H.components(arr({ 2: 0.5, 4: 0.5 }), 16, 'sine', 1)), 3, 1e-15);
  // (1·1 + 3·(1/3)²) / (1 + 1/9) = 1.2
  near(H.centroidRatio(H.components(arr({ 1: 1, 3: 1 / 3 }), 16, 'sine', 1)), 1.2, 1e-12);
  const a = randA(), b = a.map(function (x) { return 0.37 * x; });
  near(H.centroidRatio(H.components(a, 16, 'sine', 1)), H.centroidRatio(H.components(b, 16, 'sine', 1)), 1e-12, '縮放不變');
  // 鋸齒波：Σk·(1/k²) / Σ(1/k²) = H_N / Σ1/k²，隨 N 像 ln N 一樣慢慢變大（越加越亮、沒有上限）
  let h = 0, s2 = 0; for (let k = 1; k <= 12; k++) { h += 1 / k; s2 += 1 / (k * k); }
  near(H.analyze(H.preset('sawtooth'), 12, 'sine', 1, 220).cr, h / s2, 1e-12, '鋸齒波 N = 12');
});

test('奇偶能量：方波、三角波、單簧管（近似）偶次幾乎是 0；雙簧管差不多一半一半', function () {
  const oe = function (id) { const x = H.analyze(H.preset(id, 220), 16, 'sine', 1, 220); return x.odd / (x.even || 1e-300); };
  ok(oe('square') > 1e100 && oe('triangle') > 1e100);
  ok(oe('clarinet') > 50, '單簧管 ' + oe('clarinet'));
  ok(oe('oboe') > 0.5 && oe('oboe') < 2, '雙簧管 ' + oe('oboe'));
});

test('預設音色：都正規化到最大 1；雙簧管第 2–5 泛音比基頻強；人聲的共振峰固定在約 700、1200 Hz', function () {
  H.PRESET_IDS.forEach(function (id) {
    [110, 220, 440, 880].forEach(function (f0) {
      const a = H.preset(id, f0);
      ok(a.length === 16, id);
      near(Math.max.apply(null, a.map(Math.abs)), 1, 1e-12, id + ' 最大值');
    });
  });
  const ob = H.preset('oboe');
  ok([2, 3, 4, 5].every(function (k) { return ob[k - 1] > ob[0]; }), '雙簧管');
  // 人聲：基頻 110 Hz 時最強的是第 6 泛音（660 Hz，靠近 F1）；基頻 220 Hz 時是第 3 泛音（660 Hz）
  ok(H.analyze(H.preset('voice', 110), 16, 'sine', 1, 110).strongest === 6);
  ok(H.analyze(H.preset('voice', 220), 16, 'sine', 1, 220).strongest === 3);
  // 基頻高過第一共振峰（約 700 Hz）以後，最強的就是基頻
  [700, 760, 880].forEach(function (f0) { ok(H.analyze(H.preset('voice', f0), 16, 'sine', 1, f0).strongest === 1, '人聲 ' + f0 + ' Hz'); });
  // 共振峰增益：在 F1 附近比兩側大
  ok(H.formantGain(700) > H.formantGain(400) && H.formantGain(700) > H.formantGain(950));
  // 理想波形的預設：精確的傅立葉係數，基頻正規化成 1
  near(H.preset('square')[2], 1 / 3, 1e-12); near(H.preset('sawtooth')[1], -1 / 2, 1e-12); near(H.preset('triangle')[2], -1 / 9, 1e-12);
});

test('形狀誤差：預設的方波、鋸齒波、三角波和自己的目標完全相同；手拼到 0.01 精度也在容許內', function () {
  near(H.shapeError(H.preset('square'), 16, 'square'), 0, 1e-12);
  near(H.shapeError(H.preset('sawtooth'), 16, 'sawtooth'), 0, 1e-12);
  near(H.shapeError(H.preset('triangle'), 16, 'triangle'), 0, 1e-12);
  ok(H.shapeError(H.preset('sawtooth'), 16, 'sawPlus') > 0.9, '正負號不同');
  near(H.shapeError(H.preset('sawtooth'), 16, 'sawPlus', true), 0, 1e-12, '只比振幅');
  ok(H.shapeError(arr({ 1: 1, 3: 0.33, 5: 0.2, 7: 0.14 }), 7, 'square') < 0.005);
  ok(H.shapeError(arr({ 2: 1 }), 7, 'square') === Infinity, '沒有基頻');
});

test('任務資料：同相時 quarter 是 x(T/4)；只看前 N 個泛音；雙簧管的參考重心隨 N 改變', function () {
  const d = H.missionData({ a: H.preset('square'), f0: 220, N: 7, mode: 'sine', seed: 1, preset: 'square', edited: false });
  near(d.quarter, 1 - 1 / 3 + 1 / 5 - 1 / 7, 1e-12);
  ok(d.active.join() === '1,3,5,7' && d.N === 7 && d.a[8] === 0);
  near(d.err.square, 0, 1e-12);
  const d12 = H.missionData({ a: H.preset('square'), f0: 220, N: 12, mode: 'sine', seed: 1, preset: 'square', edited: false });
  ok(d12.crOboe > d.crOboe, '泛音越多，雙簧管越亮');
  near(d12.rep, 220, 1e-9); ok(d12.strongest === 1);
});

test('音名：220 Hz 是 A3、261.63 Hz 是 C4（+0 音分）', function () {
  const p = H.pitchInfo(220);
  ok(p.near === 57 && Math.abs(p.cents) < 1e-9);
  const c = H.pitchInfo(261.6255653);
  ok(c.near === 60 && Math.abs(c.cents) < 1e-6);
});

console.log('\n' + (fail ? fail + ' 項失敗、' : '') + pass + ' 項測試通過。');
if (fail) process.exit(1);
