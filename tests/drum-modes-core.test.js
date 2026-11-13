/* 鼓與板的振動模態：物理核心的單元測試。用法：node tests/drum-modes-core.test.js */
'use strict';
const C = require('../js/drum-modes-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
const st = o => Object.assign({}, C.DEFAULTS, o);
const info = o => C.analyze(st(o));

test('貝索函數的值與 Abramowitz & Stegun 表 9.1 一致', function () {
  near(C.besselJ(0, 1), 0.7651976866, 1e-9);
  near(C.besselJ(1, 1), 0.4400505857, 1e-9);
  near(C.besselJ(0, 5), -0.1775967713, 1e-9);
  near(C.besselJ(2, 3), 0.4860912606, 1e-9);
  near(C.besselJ(5, 10), -0.2340615282, 1e-9);
  near(C.besselJ(0, 0), 1, 1e-15);
  near(C.besselJ(3, 0), 0, 1e-15);
});

test('貝索函數的零點 j(m,n) 與 A&S 表 9.5 一致', function () {
  const tab = [[0, 1, 2.404825558], [0, 2, 5.520078110], [0, 3, 8.653727913], [1, 1, 3.831705970], [1, 2, 7.015586670],
    [2, 1, 5.135622302], [2, 2, 8.417244140], [3, 1, 6.380161896], [4, 1, 7.588342435], [4, 2, 11.064709488], [7, 1, 11.086370019]];
  tab.forEach(function (t) { near(C.besselZero(t[0], t[1]), t[2], 1e-7, 'j(' + t[0] + ',' + t[1] + ')'); });
});

test('遞迴關係 J(m−1) + J(m+1) = (2m/x) J(m)', function () {
  [0.7, 2.3, 5.1, 9.8, 12.3].forEach(function (x) {
    for (let m = 1; m <= 7; m++) near(C.besselJ(m - 1, x) + C.besselJ(m + 1, x), 2 * m / x * C.besselJ(m, x), 1e-11, 'm=' + m + ' x=' + x);
  });
});

test('模態清單：理想膜 19 個依 j 排序、全部 j ≤ 12.4；定音鼓 5 個；方板 m² + n² ≤ 50', function () {
  ok(C.MEMBRANE.length === 19, '理想膜 ' + C.MEMBRANE.length + ' 個');
  C.MEMBRANE.forEach(function (o, i) { ok(o.j <= C.J_MAX); if (i) ok(o.j >= C.MEMBRANE[i - 1].j, '沒有依 j 排序'); });
  ok(C.TIMPANI.length === 5);
  C.PLATE.forEach(function (o) { ok(o.m * o.m + o.n * o.n <= 50); });
  ok(C.PLATE.length === C.PLATE.filter(o => o.m >= 1 && o.n >= 1).length);
});

test('正規化：每個模態在鼓面上的均方值都是 1（數值積分），不同模態互相正交', function () {
  const N = 240, M = 96;
  const avg = function (f) {
    let s = 0, w = 0;
    for (let i = 0; i < N; i++) {
      const r = (i + 0.5) / N;
      for (let k = 0; k < M; k++) { const th = 2 * Math.PI * (k + 0.5) / M; s += f({ r: r, th: th }) * r; w += r; }
    }
    return s / w;
  };
  const md = k => C.byKey[k];
  ['0-1', '1-1', '2-1', '0-2', '1-2', '3-1'].forEach(function (k) {
    near(avg(p => Math.pow(C.modeValue('membrane', md(k), p, 0), 2)), 1, 2e-3, k + ' 的均方值');
  });
  near(avg(p => C.modeValue('membrane', md('0-1'), p, 0) * C.modeValue('membrane', md('0-2'), p, 0)), 0, 2e-3, '(0,1)·(0,2)');
  near(avg(p => C.modeValue('membrane', md('1-1'), p, 0) * C.modeValue('membrane', md('1-2'), p, 0)), 0, 2e-3, '(1,1)·(1,2)');
  near(avg(p => C.modeValue('membrane', md('0-1'), p, 0) * C.modeValue('membrane', md('1-1'), p, 0)), 0, 2e-3, '(0,1)·(1,1)');
  // 方板
  const NP = 200;
  let s = 0, x = 0;
  for (let i = 0; i < NP; i++) for (let j = 0; j < NP; j++) {
    const p = { x: (i + 0.5) / NP, y: (j + 0.5) / NP };
    const a = C.modeValue('plate', C.PLATE[0], p), b = C.modeValue('plate', C.PLATE[1], p);
    s += a * a; x += a * b;
  }
  near(s / NP / NP, 1, 1e-6, '方板 (1,1) 的均方值');
  near(x / NP / NP, 0, 1e-6, '方板 (1,1)·(1,2)');
});

test('理想膜的頻率 f = j c / (2π a)，c = √(T/σ)；(1,1) 是 (0,1) 的 1.593 倍', function () {
  const d = info({});
  const c = Math.sqrt(3000 / C.SIGMA);
  near(d.fBase, 2.404825558 * c / (2 * Math.PI * 0.3), 1e-6);
  near(C.mode(d, '1-1').ratio, 3.831705970 / 2.404825558, 1e-9);
  near(C.mode(d, '0-2').ratio, 5.520078110 / 2.404825558, 1e-9);
});

test('比例律：張力 ×4 → 高八度；半徑 ×2 → 低八度；方板邊長 ×2 → 低兩個八度、厚度 ×2 → 高八度', function () {
  near(C.cents(info({ T: 4000 }).fBase / info({ T: 1000 }).fBase), 1200, 1e-9);
  near(C.cents(info({ a: 0.4 }).fBase / info({ a: 0.2 }).fBase), -1200, 1e-9);
  near(C.cents(info({ drum: 'timpani', T: 8000 }).fBase / info({ drum: 'timpani', T: 2000 }).fBase), 1200, 1e-9);
  near(C.cents(info({ drum: 'plate', L: 0.4 }).fBase / info({ drum: 'plate', L: 0.2 }).fBase), -2400, 1e-9);
  near(C.cents(info({ drum: 'plate', h: 4 }).fBase / info({ drum: 'plate', h: 2 }).fBase), 1200, 1e-9);
});

test('方板的頻率 ∝ m² + n²：(1,2) = (2,1) = 2.5 倍、(2,2) = 4 倍', function () {
  const d = info({ drum: 'plate' });
  near(C.mode(d, '1-2').ratio, 2.5, 1e-12);
  near(C.mode(d, '2-1').ratio, 2.5, 1e-12);
  near(C.mode(d, '2-2').ratio, 4, 1e-12);
});

test('正中央敲理想膜：只有 m = 0 的模態響；定音鼓正中央幾乎無聲', function () {
  const d = info({ r: 0 });
  ok(!d.silent);
  d.modes.forEach(function (o) { if (o.m > 0) near(o.rel, 0, 1e-12, modeKey(o)); else ok(o.rel > 0.01 || o.n > 3, modeKey(o) + ' 太弱'); });
  ok(info({ drum: 'timpani', r: 0 }).silent, '定音鼓中央應該無聲');
});
function modeKey(o) { return '(' + o.m + ',' + o.n + ')'; }

test('敲在 (0,2) 的節圓 r = j01/j02 上，(0,2) 不響', function () {
  const r = 2.404825558 / 5.520078110;
  near(C.mode(info({ r: r }), '0-2').A, 0, 1e-9);
  near(C.nodalCircles(C.byKey['0-2'])[0], r, 1e-8);
  near(C.nodalCircles(C.byKey['1-2'])[0], 3.831705970 / 7.015586670, 1e-8);
});

test('直徑節線：(m,n) 有 m 條，方向跟著敲擊點轉；敲擊點永遠在波腹方向', function () {
  const md = C.byKey['2-1'];
  const ds = C.nodalDiameters(md, 0.3);
  ok(ds.length === 2);
  ds.forEach(function (a) { near(C.modeValue('membrane', md, { r: 0.5, th: a }, 0.3), 0, 1e-12); });
  const d = info({ r: 0.6, th: 77 });
  ok(C.mode(d, '2-1').A > 0 && C.mode(d, '3-1').A > 0, '敲擊點的模態值應該為正');
});

test('定音鼓：(1,1)…(5,1) 離 2 : 3 : 4 : 5 : 6 都在 45 音分以內，平均偏差遠小於理想膜', function () {
  const d = info({ drum: 'timpani', r: 0.6 });
  [['1-1', 2], ['2-1', 3], ['3-1', 4], ['4-1', 5], ['5-1', 6]].forEach(function (t) {
    ok(Math.abs(C.cents(C.mode(d, t[0]).ratio * 2 / t[1])) <= 45, t[0] + ' 偏 ' + C.cents(C.mode(d, t[0]).ratio * 2 / t[1]).toFixed(1));
  });
  const m = info({ r: 0.6 });
  ok(d.inharm < 25 && m.inharm > 60, '定音鼓 ' + d.inharm.toFixed(1) + '、理想膜 ' + m.inharm.toFixed(1));
});

test('方板中線 x = 0.5：所有 m 為偶數的模態都不響', function () {
  const d = info({ drum: 'plate', x: 0.5, y: 0.37 });
  d.modes.forEach(function (o) { if (o.m % 2 === 0) near(o.rel, 0, 1e-12, modeKey(o)); });
});

test('衰減：頻率越高衰減越快，τ 與 f 成反比', function () {
  const d = info({ damp: 2 });
  const a = C.mode(d, '0-1'), b = C.mode(d, '0-2');
  near(a.tau * a.f, b.tau * b.f, 1e-9);
  ok(a.tau > b.tau);
});

test('payload：鍵值完整、數字可序列化', function () {
  const p = C.payload(info({}), { via: 'button' });
  ['drum', 'fBase', 'fLow', 'rel', 'A', 'ratio', 'top', 'centroid', 'inharm', 'via'].forEach(function (k) { ok(k in p, '缺 ' + k); });
  ok(Object.keys(p.rel).length === 19);
  ok(JSON.parse(JSON.stringify(p)).fBase === p.fBase);
  ok(p.top[0] === info({}).strongest);
});

test('定音鼓調音：tensionFor 反算張力後頻率正確', function () {
  const T = C.tensionFor(110, C.byKey['1-1'].j, 0.35);
  near(info({ drum: 'timpani', a: 0.35, T: T }).fBase, 110, 1e-6);
});

console.log('\n' + pass + ' 項通過，' + fail + ' 項失敗');
process.exit(fail ? 1 : 0);
