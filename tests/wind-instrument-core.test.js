/* 管樂器：物理核心的單元測試。用法：node tests/wind-instrument-core.test.js */
'use strict';
const W = require('../js/wind-instrument-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
const tube = function (o) { return W.analyze(Object.assign({ inst: 'tube', type: 'open', L: 0.6, d: 19, T: 20, m: 1, corr: 'unflanged' }, o)); };
const rec = function (holes, o) { return W.analyze(Object.assign({ inst: 'recorder', T: 20, holes: holes, pull: 0 }, o)); };

test('聲速：0 °C 是 331.3 m/s、20 °C 是 343.42 m/s；0–40 °C 內線性近似和 √T 精確式相差不到 0.3%', function () {
  near(W.soundSpeed(0), 331.3, 1e-12);
  near(W.soundSpeed(20), 343.42, 1e-9);
  for (let T = 0; T <= 40; T += 0.5) ok(Math.abs(W.soundSpeed(T) / W.soundSpeedExact(T) - 1) < 0.003, 'T = ' + T);
  near(W.tempFor(W.soundSpeed(14.36)), 14.36, 1e-9);
});

test('溫度升高 10 °C，同一根管子的音升高約 30 音分（20 → 30 °C 為 30.3 音分），而且和管型、模式無關', function () {
  [['open', 1], ['closed', 1], ['open', 3], ['closed', 2]].forEach(function (p) {
    const a = tube({ type: p[0], m: p[1], T: 20 }), b = tube({ type: p[0], m: p[1], T: 30 });
    near(W.cents(b.f / a.f), 1200 * Math.log2(349.48 / 343.42), 1e-9);
    near(W.cents(b.f / a.f), 30.3, 0.1);
  });
});

test('同長度：不計管口修正時，閉管剛好比開管低一個八度（1200 音分）；計入修正後略少於八度', function () {
  [0.1, 0.4, 1.5].forEach(function (L) {
    const o = tube({ L: L, corr: 'none' }), c = tube({ L: L, corr: 'none', type: 'closed' });
    near(W.cents(o.f / c.f), 1200, 1e-9);
    const o2 = tube({ L: L }), c2 = tube({ L: L, type: 'closed' });
    const k = W.cents(o2.f / c2.f);
    ok(k < 1200 && k > 1100, 'L = ' + L + '：' + k);
    near(o2.f / c2.f, 2 * (L + c2.delta) / (L + 2 * c2.delta), 1e-12, '比值 2(L + δ)/(L + 2δ)');
  });
});

test('閉管只有奇數倍的共振（1 : 3 : 5 : 7 : 9），開管是全部整數倍（1 : 2 : 3 : 4 : 5）', function () {
  const c = tube({ type: 'closed' }), o = tube({});
  c.res.forEach(function (f, i) { near(f / c.res[0], 2 * i + 1, 1e-12); });
  o.res.forEach(function (f, i) { near(f / o.res[0], i + 1, 1e-12); });
  const sp = W.toneSpectrum('closed', 'tube', 12);
  sp.forEach(function (a, j) { ok((j + 1) % 2 ? a > 0 : a === 0, '閉管的第 ' + (j + 1) + ' 泛音'); });
  ok(W.toneSpectrum('open', 'tube', 12).every(function (a) { return a > 0; }), '開管全部泛音都在');
});

test('超吹：開管第 2 模式剛好 ×2（八度 1200 音分）、第 3 模式 ×3；閉管第 2 模式 ×3（十二度 1901.955 音分）、第 3 模式 ×5', function () {
  const o1 = tube({}), o2 = tube({ m: 2 }), o3 = tube({ m: 3 });
  near(W.cents(o2.f / o1.f), 1200, 1e-9);
  near(o3.f / o1.f, 3, 1e-12);
  const c1 = tube({ type: 'closed' }), c2 = tube({ type: 'closed', m: 2 }), c3 = tube({ type: 'closed', m: 3 });
  near(W.cents(c2.f / c1.f), 1901.955, 1e-3);
  near(c3.f / c1.f, 5, 1e-12);
  near(c2.n, 3, 0); near(c3.n, 5, 0);
});

test('管口修正讓音變低：δ = 0.6133 r（無凸緣）< 0.8216 r（有凸緣）；粗管影響大，細管影響小', function () {
  near(W.endCorrection(20, 'unflanged'), 0.6133 * 0.01, 1e-15);
  near(W.endCorrection(20, 'flanged'), 0.8216 * 0.01, 1e-15);
  near(W.endCorrection(20, 'none'), 0, 0);
  ['open', 'closed'].forEach(function (type) {
    const f0 = tube({ type: type, corr: 'none' }).f, f1 = tube({ type: type }).f, f2 = tube({ type: type, corr: 'flanged' }).f;
    ok(f2 < f1 && f1 < f0, type);
  });
  const thin = W.cents(tube({ d: 8, corr: 'none' }).f / tube({ d: 8 }).f), fat = W.cents(tube({ d: 30, corr: 'none' }).f / tube({ d: 30 }).f);
  ok(fat > 3 * thin && thin > 0, '細管 ' + thin.toFixed(2) + '、粗管 ' + fat.toFixed(2) + ' 音分');
});

test('反算管長：lengthFor 算出的長度，analyze 回去剛好是目標頻率（六種管型 × 模式、三種修正）', function () {
  ['open', 'closed'].forEach(function (type) {
    [1, 2, 3].forEach(function (m) {
      W.CORRS.forEach(function (corr) {
        const L = W.lengthFor(440, type, m, 15, corr, 23.5);
        near(tube({ type: type, m: m, corr: corr, d: 15, T: 23.5, L: L }).f, 440, 1e-9);
      });
    });
  });
});

test('駐波：開口端（有效開口）是壓力節點、位移腹點；閉口端是壓力腹點、位移節點；p = −(dξ/du)/k', function () {
  for (let n = 1; n <= 5; n++) {
    const a = W.shapeAt('open', n, 0), b = W.shapeAt('open', n, 1);
    near(a.p, 0, 1e-12); near(b.p, 0, 1e-12); near(Math.abs(a.xi), 1, 1e-12); near(Math.abs(b.xi), 1, 1e-12);
  }
  [1, 3, 5, 7].forEach(function (n) {
    const a = W.shapeAt('closed', n, 0), b = W.shapeAt('closed', n, 1);
    near(Math.abs(a.p), 1, 1e-12); near(a.xi, 0, 1e-12); near(b.p, 0, 1e-12); near(Math.abs(b.xi), 1, 1e-12);
  });
  const h = 1e-6;
  [['open', 3, 1], ['closed', 5, 0.5]].forEach(function (c) {
    const k = c[1] * Math.PI * c[2];
    for (let u = 0.05; u < 1; u += 0.1) {
      const dxi = (W.shapeAt(c[0], c[1], u + h).xi - W.shapeAt(c[0], c[1], u - h).xi) / (2 * h);
      near(W.shapeAt(c[0], c[1], u).p, -dxi / k, 1e-6, c[0] + ' u = ' + u.toFixed(2));
    }
  });
  const on = W.nodesOf('open', 3), cn = W.nodesOf('closed', 5);
  near(on.pNodes.length, 4, 0); near(on.pAnti.length, 3, 0);
  near(cn.pNodes.length, 3, 0); near(cn.pAnti.length, 3, 0);
  cn.pNodes.forEach(function (u) { near(W.shapeAt('closed', 5, u).p, 0, 1e-12); });
  on.pAnti.forEach(function (u) { near(Math.abs(W.shapeAt('open', 3, u).p), 1, 1e-12); });
});

test('閉管：有效長度剛好是 1/4 波長（第 1 模式）；開管是 1/2 波長；第 m 模式依序是 (2m − 1)/4 與 m/2 波長', function () {
  [1, 2, 3].forEach(function (m) {
    const c = tube({ type: 'closed', m: m }), o = tube({ m: m });
    near(c.Lp / c.lambda, (2 * m - 1) / 4, 1e-12);
    near(o.Lp / o.lambda, m / 2, 1e-12);
  });
});

test('按孔模型的極限：孔和管一樣粗 → 幾乎在孔的地方截斷（只剩孔自己的管口修正）；孔非常小 → 幾乎沒有截斷（E → 下面的管長）', function () {
  const l = 0.05;
  const big = W.holeLen(12.5, 12.5, 0), small = W.holeLen(0.3, 12.5, 4);
  near(big, 1.5 * 0.00625, 1e-12, '和管一樣粗、管壁很薄：h = 1.5 b');
  ok(small > 5, '小孔的 h = ' + small);
  const E = function (h) { return h * l / (h + l); };
  ok(E(big) < 0.2 * l && E(small) > 0.99 * l, 'E 大孔 ' + E(big) + '、小孔 ' + E(small));
  near(E(1e-9), 0, 1e-8, 'h → 0 時完全截斷');
  // 同一個位置，孔越小，音越低（截得越不完全）
  const xs = W.REC.xs.slice(), Lb = W.REC.L;
  const save = W.REC.holeD[4];
  const g = W.FINGERINGS.G5;
  W.REC.holeD[4] = 3; const lSmall = W.recorderLength(xs, Lb, g, 0, 'unflanged').Lp;
  W.REC.holeD[4] = 10; const lBig = W.recorderLength(xs, Lb, g, 0, 'unflanged').Lp;
  W.REC.holeD[4] = save;
  ok(lSmall > lBig, '小孔的等效長度 ' + lSmall + ' 應該比大孔 ' + lBig + ' 長');
});

test('直笛：孔的位置由上往下排列、都在管內，正面孔距 1–4 cm；背面的拇指孔在第 1 孔上方 0.5–2 cm', function () {
  const x = W.REC.xs;
  ok(x[1] - x[0] > 0.005 && x[1] - x[0] < 0.02, '拇指孔在第 1 孔上方 ' + (x[1] - x[0]));
  for (let k = 2; k < 8; k++) ok(x[k] - x[k - 1] > 0.01 && x[k] - x[k - 1] < 0.04, '第 ' + (k - 1) + '–' + k + ' 孔相距 ' + (x[k] - x[k - 1]));
  ok(x[0] > 0.05 && x[7] < W.REC.L - 0.02, '孔都在管內');
  near(W.REC.L, 0.3205, 0.0001, '唇口到管尾');
});

test('直笛：20 °C 時 8 個常用指法 C5…C6、拇指全開的 D6、拇指半開的 E6，都在十二平均律 ±1 音分內', function () {
  W.fingeringTable(20, 0).forEach(function (r) { ok(Math.abs(r.cents) <= 1, r.name + ' ' + r.cents); });
  ok(rec(W.FINGERINGS.E6).m === 2 && rec(W.FINGERINGS.C5).m === 1, '半開 = 第 2 模式');
  near(rec([0.5, 0, 0, 0, 0, 0, 0, 0]).f / rec(W.FINGERINGS.C5).f, 2, 1e-12, '拇指半開剛好高八度');
  W.SCALE.forEach(function (n) { near(rec(W.FINGERINGS[n]).name === n ? 1 : 0, 1, 0, n); });
});

test('直笛：溫度改變時每個指法一起移動同樣的音分（只有聲速變了）', function () {
  const c = W.cents(W.soundSpeed(32) / W.soundSpeed(20));
  W.SCALE.forEach(function (n) { near(W.cents(rec(W.FINGERINGS[n], { T: 32 }).f / rec(W.FINGERINGS[n]).f), c, 1e-9, n); });
});

test('叉指：G5 再蓋住第 5 孔，音降低 20–50 音分；德式 F（5、6、7 孔全開）比叉指的 F 高將近半音', function () {
  const g = rec(W.FINGERINGS.G5), fork = rec([0, 0, 0, 0, 1, 0, 1, 1]);
  const dc = W.cents(fork.f / g.f);
  ok(dc < -20 && dc > -50, '降了 ' + dc);
  const german = rec([0, 0, 0, 0, 0, 1, 1, 1]), baroque = rec(W.FINGERINGS.F5);
  const k = W.cents(german.f / baroque.f);
  ok(k > 30 && k < 100, '德式 F 高 ' + k + ' 音分');
});

test('頭管拉出：所有音都變低，越高的音降得越多（拉出 3 mm 時 C5 降約 16 音分、C6 降約 31 音分）', function () {
  const t = W.fingeringTable(20, 3);
  for (let i = 1; i < 8; i++) ok(t[i].cents < t[i - 1].cents, t[i].name);
  near(t[0].cents, -15.8, 0.3); near(t[7].cents, -31.2, 0.3);
});

test('頻率範圍：最低（閉管、1.5 m、0 °C、30 mm）約 54.9 Hz，最高（開管、0.1 m、40 °C、第 3 模式、不計修正）約 5.3 kHz', function () {
  const lo = tube({ type: 'closed', L: 1.5, T: 0, d: 30 });
  near(lo.f, 54.88, 0.01);
  ok(tube({ type: 'closed', L: 1.5, T: 0, d: 8 }).f > 55, '細管就低不到 55 Hz');
  const hi = tube({ L: 0.1, T: 40, m: 3, d: 8, corr: 'none' });
  near(hi.f, 5333.1, 0.1);
});

test('預設（長笛的近似：開管 0.645 m、內徑 19 mm、20 °C）是 C4（±1 音分）', function () {
  const a = W.analyze(W.DEFAULT);
  ok(a.name === 'C4' && Math.abs(a.cents) < 1, a.name + ' ' + a.cents);
});

console.log('\n通過 ' + pass + ' 項，失敗 ' + fail + ' 項');
if (fail) process.exit(1);
