/* 黎曼和：數學核心的單元測試。用法：node tests/riemann-sum-core.test.js */
'use strict';
const R = require('../js/riemann-sum-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
const PI = Math.PI;

test('反導函數：F′ = f、G′ = f²（數值微分），已知的定積分', function () {
  R.KEYS.forEach(function (k) {
    const F = R.FUNCS[k], d = F.dom;
    for (let i = 1; i < 20; i++) {
      const x = d[0] + (d[1] - d[0]) * i / 20, h = 1e-5;
      if (k === 'semi' && Math.abs(x) > 1.9) continue;
      near((F.F(x + h) - F.F(x - h)) / (2 * h), F.f(x), 1e-6 * Math.max(1, Math.abs(F.f(x))), k + ' F′ x = ' + x);
      near((F.G(x + h) - F.G(x - h)) / (2 * h), F.f(x) * F.f(x), 1e-5 * Math.max(1, F.f(x) * F.f(x)), k + ' G′ x = ' + x);
    }
  });
  near(R.exact('sq', 0, 2), 8 / 3, 1e-15); near(R.exact('sin', 0, PI), 2, 1e-15); near(R.exact('sin', PI, 2 * PI), -2, 1e-15);
  near(R.exact('recip', 1, Math.E), 1, 1e-15); near(R.exact('semi', -2, 2), 2 * PI, 1e-14, '半圓面積 2π'); near(R.exact('sqrt', 0, 4), 16 / 3, 1e-14);
  near(R.exact('exp', 0, 1), Math.E - 1, 1e-15);
});

test('黎曼和的已知公式：x² 在 [0, 1] 的左和、右和、中點、梯形', function () {
  [1, 2, 5, 10, 100, 200].forEach(function (n) {
    near(R.sum('sq', 0, 1, n, 'left'), (n - 1) * (2 * n - 1) / (6 * n * n), 1e-14, '左和 n = ' + n);
    near(R.sum('sq', 0, 1, n, 'right'), (n + 1) * (2 * n + 1) / (6 * n * n), 1e-14, '右和 n = ' + n);
    near(R.sum('sq', 0, 1, n, 'mid'), 1 / 3 - 1 / (12 * n * n), 1e-14, '中點 n = ' + n);
    near(R.sum('sq', 0, 1, n, 'trap'), 1 / 3 + 1 / (6 * n * n), 1e-14, '梯形 n = ' + n);
  });
  // 一次函數：中點與梯形完全準確
  near(R.sum('sq', 0, 1, 7, 'trap') - R.sum('sq', 0, 1, 7, 'mid'), 1 / (4 * 49), 1e-14, '梯形 − 中點 = h²/4');
});

test('上和 ≥ 每一種和 ≥ 下和，而且上和 ≥ 積分 ≥ 下和；遞增函數的上下和就是右和、左和', function () {
  R.KEYS.forEach(function (k) {
    const F = R.FUNCS[k];
    [[F.dom[0], F.dom[1]], F.def].forEach(function (ab) {
      [1, 3, 8, 40, 200].forEach(function (n) {
        const s = R.all(k, ab[0], ab[1], n), e = 1e-12 * Math.max(1, Math.abs(s.upper));
        ['left', 'right', 'mid', 'trap'].forEach(function (r) { ok(s.upper >= s[r] - e && s[r] >= s.lower - e, k + ' ' + r + ' n = ' + n); });
        ok(s.upper >= s.exact - e && s.exact >= s.lower - e, k + ' 夾住積分 n = ' + n);
      });
    });
  });
  [['sqrt', 0, 7], ['exp', -3, 3], ['sq', 0, 3]].forEach(function (c) {
    [1, 5, 33].forEach(function (n) {
      near(R.sum(c[0], c[1], c[2], n, 'upper'), R.sum(c[0], c[1], c[2], n, 'right'), 1e-12, c[0] + ' 遞增：上和 = 右和');
      near(R.sum(c[0], c[1], c[2], n, 'lower'), R.sum(c[0], c[1], c[2], n, 'left'), 1e-12, c[0] + ' 遞增：下和 = 左和');
    });
  });
  // 遞減：反過來
  near(R.sum('recip', 1, 4, 9, 'upper'), R.sum('recip', 1, 4, 9, 'left'), 1e-12);
  // 單調函數的上和 − 下和 = |f(b) − f(a)|·h
  near(R.sum('sq', 0, 2, 80, 'upper') - R.sum('sq', 0, 2, 80, 'lower'), 4 * 2 / 80, 1e-12);
  // 有極值的段：sin 在 [0, π]、n = 1，上和 = π·1，下和 = 0
  near(R.sum('sin', 0, PI, 1, 'upper'), PI, 1e-15); near(R.sum('sin', 0, PI, 1, 'lower'), 0, 1e-15);
});

test('誤差的階：端點法約 1/n，中點、梯形約 1/n²（n 加倍誤差變 1/2、1/4）', function () {
  [['sq', 0, 2], ['exp', 0, 2], ['sin', 0.3, 2.5], ['sqrt', 1, 5], ['recip', 1, 4]].forEach(function (c) {
    [20, 50, 100].forEach(function (n) {
      near(R.shrink(c[0], c[1], c[2], 'left', n), 2, 0.12, c[0] + ' 左和 n = ' + n);
      near(R.shrink(c[0], c[1], c[2], 'right', n), 2, 0.12, c[0] + ' 右和 n = ' + n);
      near(R.shrink(c[0], c[1], c[2], 'mid', n), 4, 0.05, c[0] + ' 中點 n = ' + n);
      near(R.shrink(c[0], c[1], c[2], 'trap', n), 4, 0.05, c[0] + ' 梯形 n = ' + n);
    });
    // 中點誤差 ≈ −(梯形誤差)/2
    const I = R.exact(c[0], c[1], c[2]);
    near((R.sum(c[0], c[1], c[2], 100, 'mid') - I) / (R.sum(c[0], c[1], c[2], 100, 'trap') - I), -0.5, 0.01, c[0] + ' 中點誤差 ≈ −梯形誤差／2');
  });
  // n = 200 時各規則都很接近
  R.KEYS.forEach(function (k) { const d = R.FUNCS[k].def, s = R.all(k, d[0], d[1], 200); near(s.mid, s.exact, 2e-3, k + ' 中點 n = 200'); });
});

test('整個週期的 sin：n ≥ 2 時左和、右和都剛好是 0', function () {
  [2, 3, 7, 50].forEach(function (n) {
    near(R.sum('sin', 0, 2 * PI, n, 'left'), 0, 1e-13, 'n = ' + n);
    near(R.sum('sin', 1, 1 + 2 * PI, n, 'right'), 0, 1e-13, '平移的週期 n = ' + n);
  });
  ok(Math.abs(R.sum('sin', 0, 2 * PI, 1, 'left')) < 1e-15 && Math.abs(R.sum('sin', 0.5, 0.5 + 2 * PI, 1, 'left')) > 1, 'n = 1 只有起點 sin a，不一定是 0');
});

test('旋轉體：準確體積（球、拋物面）、圓盤與圓台的和收斂到 π∫f²', function () {
  near(R.volExact('semi', -2, 2), 32 * PI / 3, 1e-13, '半徑 2 的球');
  near(R.volExact('sqrt', 0, 4), 8 * PI, 1e-13, '拋物面：π·4²/2');
  near(R.volExact('sq', 0, 1), PI / 5, 1e-15);
  R.KEYS.forEach(function (k) {
    const d = R.FUNCS[k].def, V = R.volExact(k, d[0], d[1]);
    ['left', 'right', 'mid', 'trap', 'upper', 'lower'].forEach(function (r) { near(R.volSum(k, d[0], d[1], 200, r), V, 0.03 * Math.max(1, V), k + ' ' + r); });
    ok(R.volSum(k, d[0], d[1], 13, 'upper') >= V - 1e-9 && R.volSum(k, d[0], d[1], 13, 'lower') <= V + 1e-9, k + ' 外圈圓盤 ≥ V ≥ 內圈');
  });
  // 一片圓台：r 從 0 到 2、長 3 的圓錐
  near(R.volSum('sq', 0, 1, 1, 'trap'), PI * 1 * (0 + 0 + 1) / 3, 1e-15, '圓錐 π r² h/3');
  // 一片圓盤
  near(R.volSum('sq', 0, 2, 1, 'right'), PI * 16 * 2, 1e-12);
  // 中點圓盤對球的誤差也是 1/n²
  const e = function (n) { return R.volSum('semi', -2, 2, n, 'mid') - 32 * PI / 3; };
  near(e(40) / e(80), 4, 0.01, '球的中點圓盤 n 加倍誤差 ÷ 4');
});

test('區間限制：在定義域內、寬度至少 0.1、改哪一端就讓另一端讓位', function () {
  const c = R.clampAB('semi', -5, 5); ok(c[0] === -2 && c[1] === 2);
  const d = R.clampAB('recip', 0, 3); ok(d[0] === 0.2);
  const e = R.clampAB('sq', 1, 1, 'a'); ok(e[0] === 1 && Math.abs(e[1] - 1.1) < 1e-9, '改 a：b 往右讓');
  const f = R.clampAB('sq', 1, 1, 'b'); ok(Math.abs(f[0] - 0.9) < 1e-9 && f[1] === 1, '改 b：a 往左讓');
  const g = R.clampAB('sq', 3, 3, 'a'); ok(Math.abs(g[0] - 2.9) < 1e-9 && g[1] === 3, '頂到定義域右端');
  R.KEYS.forEach(function (k) { const d0 = R.FUNCS[k].def, h = R.clampAB(k, d0[0], d0[1]); ok(h[0] === d0[0] && h[1] === d0[1], k + ' 預設區間不變'); });
});

test('挑戰：2000 題都出得了、目標在範圍內、開始的 b 離答案夠遠、b 用 0.01 的格點就對得準', function () {
  const rand = R.rng(5);
  let prev = null;
  for (let i = 0; i < 2000; i++) {
    const ch = R.genChallenge(rand, prev);
    ok(ch, '第 ' + i + ' 題出不了');
    ok(ch.T >= 1 && ch.T <= 15 && ch.a >= R.FUNCS[ch.key].dom[0] && ch.bMax <= R.FUNCS[ch.key].dom[1]);
    ok(Math.abs(R.exact(ch.key, ch.a, ch.b0) - ch.T) >= 0.4 * ch.T, '開始的 b 太接近');
    ok(!R.chalHit(ch, ch.b0), '開始就答對');
    let hit = 0;
    for (let b = Math.round((ch.a + 0.1) * 100); b <= Math.round(ch.bMax * 100); b++) if (R.chalHit(ch, b / 100)) hit++;
    ok(hit >= 2, '第 ' + i + ' 題格點上只有 ' + hit + ' 個解：' + JSON.stringify(ch));
    prev = ch;
  }
});

test('文字：trim', function () {
  ok(R.trim(2.50, 2) === '2.5' && R.trim(-0.0001, 2) === '0' && R.trim(3, 2) === '3');
});

console.log('\n' + (fail ? fail + ' 項失敗、' : '') + pass + ' 項測試通過。');
if (fail) process.exit(1);
