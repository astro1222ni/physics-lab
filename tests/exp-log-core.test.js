/* 指數與對數：數學核心的單元測試。用法：node tests/exp-log-core.test.js */
'use strict';
const E = require('../js/exp-log-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }

test('複利：已知值、n 越大越多但不超過連續複利、n → ∞ 趨近 e^(rt)', function () {
  near(E.compound(0.1, 1, 2), 1.21, 1e-12, '年利率 10%、兩年');
  near(E.compound(0.12, 12, 1), Math.pow(1.01, 12), 1e-12, '每月 1%');
  near(E.compound(1, 1e6, 1), Math.E, 2e-6, '(1 + 1/n)^n，n = 10^6');
  // 誤差主項 e/(2n)
  [10, 100, 1000, 1e4].forEach(function (n) { near((Math.E - E.compound(1, n, 1)) * 2 * n / Math.E, 1, 2 / n + 1e-6, 'e − (1 + 1/n)^n ≈ e/(2n)，n = ' + n); });
  for (let r = 0.01; r <= 1; r += 0.07) {
    let prev = 0;
    [1, 2, 4, 12, 52, 365, 1e4, 1e6].forEach(function (n) {
      const v = E.compound(r, n, 3);
      ok(v > prev, 'n 越大越多 r = ' + r + ' n = ' + n);
      ok(v <= E.cont(r, 3) * (1 + 1e-12), '不超過連續複利');
      ok(v >= E.simple(r, 3) - 1e-12, '不少於單利');
      prev = v;
    });
  }
});

test('階梯：每期結束才入帳，期末等於複利公式；翻倍時間與 72 法則', function () {
  near(E.stair(0.12, 4, 0.2), 1, 0, '第一季還沒結束');
  near(E.stair(0.12, 4, 0.25), 1.03, 1e-12, '第一季結束');
  for (let k = 0; k <= 40; k++) near(E.stair(0.08, 4, k / 4), E.compound(0.08, 4, k / 4), 1e-12, '第 ' + k + ' 期');
  near(E.doublingTime(0.08, 1), Math.log(2) / Math.log(1.08), 1e-12);
  near(E.doublingTime(0.08, Infinity), Math.log(2) / 0.08, 1e-12);
  near(E.compound(0.08, 1, E.doublingTime(0.08, 1)), 2, 1e-12, '翻倍');
  [0.04, 0.06, 0.08, 0.1].forEach(function (r) { near(E.doublingTime(r, 1), 72 / (r * 100), 0.35, '72 法則 r = ' + r); });
  ok(E.doublingTime(0, 1) === null);
});

test('對數滑桿：n 與 C 的位置互為反函數，端點正確', function () {
  ok(E.nFromPos(0) === 1 && E.nFromPos(100) === 1e6);
  [1, 2, 4, 12, 365, 1000, 1e5].forEach(function (n) { ok(E.nFromPos(E.posFromN(n)) === n, 'n = ' + n); });
  near(E.cFromPos(0), 0.1, 1e-15); near(E.cFromPos(100), 1000, 1e-9);
  [0.1, 1, 50, 1000].forEach(function (c) { near(E.cFromPos(E.posFromC(c)), c, 1e-9 * c, 'C = ' + c); });
});

test('指數與對數互為反函數、換底公式、對數律', function () {
  [0.3, 0.5, 2, Math.E, 10].forEach(function (a) {
    for (let x = -3; x <= 3; x += 0.25) near(E.log(a, E.pow(a, x)), x, 1e-12, 'log_a a^x a = ' + a);
    [0.2, 1, 7, 100].forEach(function (y) { near(E.pow(a, E.log(a, y)), y, 1e-11 * y, 'a^(log_a y)'); });
    near(E.log(a, 6), E.log(a, 2) + E.log(a, 3), 1e-12, '積的對數');
    near(E.log(a, 8), 3 * E.log(a, 2), 1e-12, '冪的對數');
  });
  near(E.log(2, 8), 3, 1e-15); near(E.log(10, 1000), 3, 1e-14); near(E.log(0.5, 4), -2, 1e-15);
  ok(E.log(1, 5) === null && E.log(2, -1) === null && E.log(-2, 4) === null, '沒有定義');
});

test('a^x 與 log_a x 的交點：a > 1 在 y = x 上 0／1／2 個，e^(1/e) 相切，0 < a < e^(−e) 有三個', function () {
  near(E.E_1E, 1.444667861, 1e-9); near(E.E_ME, 0.0659880358, 1e-10);
  ok(E.meet(2).pts.length === 0, 'a = 2 沒有交點');
  const m = E.meet(Math.sqrt(2));
  ok(m.pts.length === 2, '√2：兩個交點');
  near(m.pts[0][0], 2, 1e-12, '√2 的交點 2'); near(m.pts[1][0], 4, 1e-12, '√2 的交點 4');
  const t = E.meet(E.E_1E);
  ok(t.tangent && t.pts.length === 1, '相切');
  near(t.pts[0][0], Math.E, 1e-9, '切點 (e, e)');
  ok(E.meet(E.E_1E + 1e-4).pts.length === 0 && E.meet(E.E_1E - 1e-4).pts.length === 2, '切點兩側');
  [0.5, 0.2, 0.1, 0.07].forEach(function (a) { ok(E.meet(a).pts.length === 1, 'a = ' + a + ' 一個交點'); });
  [0.065, 0.05, 0.02].forEach(function (a) {
    const p = E.meet(a).pts;
    ok(p.length === 3, 'a = ' + a + ' 三個交點，得到 ' + p.length);
    p.forEach(function (q) { near(q[1], E.pow(a, q[0]), 1e-12); near(q[1], E.log(a, q[0]), 1e-9, '在 log_a x 上'); });
    near(p[0][0], p[2][1], 1e-9, '兩個不在 y = x 上的交點互為鏡像');
  });
  // 每個交點都真的在兩條曲線上
  for (let a = 1.01; a < E.E_1E; a += 0.02) E.meet(a).pts.forEach(function (q) { near(E.pow(a, q[0]), q[0], 1e-9 * q[0], 'a = ' + a); });
  ok(E.meet(1).pts.length === 0 && E.meet(-2).pts.length === 0);
});

test('對數尺度：擬合在沒有誤差的資料上還原 C、b；範例資料的誤差很小', function () {
  const xs = [0, 1, 2, 3, 4, 5];
  [[3, 1.7], [250, 0.6], [0.5, 3.2]].forEach(function (p) {
    const ys = xs.map(function (x) { return p[0] * Math.pow(p[1], x); });
    const f = E.fitLog(xs, ys);
    near(f.C, p[0], 1e-9 * p[0]); near(f.b, p[1], 1e-12); near(f.rms, 0, 1e-12);
    near(f.slope, Math.log10(p[1]), 1e-12, '半對數圖的斜率是 log b');
  });
  ['bacteria', 'decay'].forEach(function (k) {
    const d = E.DATASETS[k];
    ok(d.xs.length === d.ys.length && d.ys.every(function (y) { return y > 0; }));
    const f = E.fitLog(d.xs, d.ys);
    ok(f.rms < 0.02, k + ' 擬合誤差 ' + f.rms);
    ok(E.rmsLog(d.xs, d.ys, d.C, d.b) < 0.02, k + ' 真實模型的誤差');
    near(Math.log10(f.b), Math.log10(d.b), 0.01, k + ' b');
  });
  // 擬合的 rms 一定不比任何其他模型大
  const d = E.DATASETS.decay, f = E.fitLog(d.xs, d.ys);
  for (let i = 0; i < 200; i++) ok(E.rmsLog(d.xs, d.ys, f.C * (1 + (i % 7 - 3) * 0.01), f.b * (1 + (i % 5 - 2) * 0.002)) >= f.rms - 1e-15, '最小平方');
});

test('挑戰：2000 題都在畫面範圍、用滑桿格點（C 位置 0.1、b 間隔 0.01）就做得到，而且和目前的模型差很多', function () {
  const rand = E.rng(7);
  let prev = null, n = 0;
  for (let i = 0; i < 2000; i++) {
    const cur = { C: 50, b: 1.5 };
    const ch = E.genChallenge(rand, cur, prev);
    ok(ch, '出得了題');
    n++;
    ok(E.rmsLog(ch.xs, ch.ys, cur.C, cur.b) >= 0.15, '和目前的模型差很多');
    ok(ch.b >= E.B_MIN && ch.b <= E.B_MAX && ch.C >= 0.1 && ch.C <= 1000);
    // 滑桿格點上最接近最佳擬合的組合
    const f = E.fitLog(ch.xs, ch.ys);
    const C = E.cFromPos(Math.round(E.posFromC(f.C) * 10) / 10), b = Math.round(f.b * 100) / 100;
    let hit = E.chalHit(ch, C, b);
    if (!hit) {   // 附近的格點
      for (let dp = -3; dp <= 3 && !hit; dp++) for (let db = -2; db <= 2 && !hit; db++) {
        hit = E.chalHit(ch, E.cFromPos(Math.round(E.posFromC(f.C) * 10) / 10 + dp * 0.1), Math.round(f.b * 100) / 100 + db * 0.01);
      }
    }
    ok(hit, '第 ' + i + ' 題格點對不準 C = ' + f.C + ' b = ' + f.b);
    ok(E.chalHit(ch, f.C, f.b), '最佳擬合一定對準');
    prev = ch;
  }
  ok(n === 2000);
});

test('文字：trim', function () {
  ok(E.trim(2.50, 2) === '2.5' && E.trim(-0.0001, 2) === '0' && E.trim(3, 2) === '3' && E.trim(1.23456, 3) === '1.235');
});

console.log('\n' + (fail ? fail + ' 項失敗、' : '') + pass + ' 項測試通過。');
if (fail) process.exit(1);
