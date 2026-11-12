/* 數列與函數的極限：數學核心的單元測試。用法：node tests/limits-core.test.js */
'use strict';
const M = require('../js/limits-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b); }
/** 用定義直接檢查 N：N 以後掃很多項都在帶子裡、N − 1 那一項不在（用精確的誤差公式 err，邊界剛好等於 ε 時不算在帶子裡） */
function checkN(sp, eps) {
  const N = M.Nmin(sp, eps);
  ok(N != null, '應該收斂');
  for (let n = N; n < N + 20000; n++) ok(M.err(sp, n) < eps, JSON.stringify(sp) + ' ε = ' + eps + '：第 ' + n + ' 項跑出去');
  if (N > 1) ok(!(M.err(sp, N - 1) < eps), JSON.stringify(sp) + ' ε = ' + eps + '：N − 1 = ' + (N - 1) + ' 應該在帶子外');
  return N;
}

test('數列的項與極限：err 等於 |a_n − L|；√(n² + n) − n 用不相消的寫法', function () {
  Object.keys(M.SEQS).forEach(function (k) {
    const sp = M.SEQS[k], lim = M.limit(sp);
    if (!lim.conv) return;
    for (let n = 1; n <= 3000; n += 7) near(M.err(sp, n), Math.abs(M.term(sp, n) - lim.L), 1e-12, k + ' 第 ' + n + ' 項');
  });
  near(M.term(M.SEQS.root, 5), Math.sqrt(30) - 5, 1e-12, '√30 − 5');
  near(M.term(M.SEQS.root, 1e8), 0.5, 1e-8, '很大的 n 還是精確');
  near(M.term(M.SEQS.e, 1), 2, 1e-15); near(M.term(M.SEQS.e, 2), 2.25, 1e-15);
  eq(M.limit({ kind: 'geo', r: 1 }).L, 1); ok(!M.limit({ kind: 'geo', r: -1 }).conv && !M.limit({ kind: 'geo', r: 1.01 }).conv && !M.limit(M.SEQS.osc).conv, '發散');
});

test('找 N（解析解）：1/n 在 ε = 0.01 是 101；(−1)^n/n 在 0.05 是 21；(2n+1)/(n+3) 在 0.1 是 48；(−0.9)^n 在 0.01 是 44', function () {
  eq(M.Nmin(M.SEQS.recip, 0.01), 101, '1/n');
  eq(M.Nmin(M.SEQS.recip, 0.001), 1001, '1/n 千分之一');
  eq(M.Nmin(M.SEQS.alt, 0.05), 21, '(−1)^n/n');
  eq(M.Nmin(M.SEQS.rat, 0.1), 48, '|a_n − 2| = 5/(n + 3) < 0.1 ⇔ n > 47');
  eq(M.Nmin({ kind: 'geo', r: -0.9 }, 0.01), Math.floor(Math.log(0.01) / Math.log(0.9)) + 1, '(−0.9)^n');
  eq(M.Nmin({ kind: 'geo', r: 0 }, 0.5), 1); eq(M.Nmin({ kind: 'geo', r: 1 }, 0.001), 1, '常數數列');
  eq(M.Nmin(M.SEQS.osc, 0.5), null); eq(M.Nmin({ kind: 'geo', r: 1.2 }, 0.5), null, '發散沒有 N');
});

test('找 N（用定義逐項檢查）：各種數列、各種 ε，N 以後兩萬項都在帶子裡、第 N − 1 項不在', function () {
  const eps = [0.5, 0.2, 0.1, 0.05, 0.02, 0.013, 0.01, 0.005, 0.002, 0.001];
  ['recip', 'rat', 'alt', 'sinn', 'geo', 'e', 'root'].forEach(function (k) { eps.forEach(function (e) { checkN(M.SEQS[k], e); }); });
  [-0.95, -0.5, 0.3, 0.99].forEach(function (r) { eps.forEach(function (e) { checkN({ kind: 'geo', r: r }, e); }); });
  // sin n / n 不是單調的：N 前面有些項早就進去了，但 N − 1 一定在外面
  const N = checkN(M.SEQS.sinn, 0.01);
  ok(N <= 101, 'sin n / n 的 N 不超過 1/ε + 1：' + N);
  // (1 + 1/n)^n 收斂到 e 很慢：e − a_n ≈ e/(2n)
  const Ne = M.Nmin(M.SEQS.e, 0.001);
  ok(Math.abs(Ne - Math.E / 2 / 0.001) < 5, '(1 + 1/n)^n 在 ε = 0.001 的 N = ' + Ne + '，約 e/(2ε)');
});

test('第一個跑出去的項：N 太小時找得到、N = Nmin 時沒有；發散數列繞著任何中心都會跑出去', function () {
  const sp = M.SEQS.recip;
  eq(M.firstOut(sp, 0.01, 101), null);
  eq(M.firstOut(sp, 0.01, 60), 60);
  eq(M.firstOut(M.SEQS.sinn, 0.05, M.Nmin(M.SEQS.sinn, 0.05)), null);
  [-0.5, 0, 0.5, 1].forEach(function (c) { ok(M.firstOutAround(M.SEQS.osc, c, 0.99, 50) != null, '(−1)^n 繞著 ' + c); });
  ok(M.firstOutAround({ kind: 'geo', r: 1.1 }, 0, 1, 1) != null, '1.1^n');
});

test('函數的 δ：(x² − 1)/(x − 1) 的 δ_max = ε；sin x / x 的 δ_max 讓 1 − sin δ/δ = ε；邊界上下用定義檢查', function () {
  [1, 0.5, 0.1, 0.01, 0.001].forEach(function (eps) { eq(M.deltaMax('hole', eps), eps); });
  [0.5, 0.1, 0.01, 0.001].forEach(function (eps) {
    const d = M.deltaMax('sinc', eps);
    near(1 - Math.sin(d) / d, eps, 1e-9, 'sinc ε = ' + eps);
    ok(d > Math.sqrt(6 * eps) * 0.95 && d < Math.sqrt(6 * eps) * 1.1, '小 ε 時約 √(6ε)');
  });
  eq(M.deltaMax('sinc', 1), Math.PI);
  // 每個有極限的函數：δ_max 以內細掃都在帶子裡，δ_max 外面一點點有跑出去的點
  ['hole', 'sinc', 'xsin', 'epow'].forEach(function (id) {
    const F = M.FUNCS[id];
    [0.5, 0.2, 0.05, 0.01].forEach(function (eps) {
      const d = M.deltaMax(id, eps);
      for (let i = 1; i <= 4000; i++) {
        const t = d * i / 4001;
        [F.a + t, F.a - t].forEach(function (x) { if (F.domainLo == null || x > F.domainLo) ok(Math.abs(F.f(x) - F.L) < eps, id + ' ε = ' + eps + ' 在 x = ' + x + ' 跑出去'); });
      }
      const out = [F.a + d * (1 + 1e-6), F.a - d * (1 + 1e-6)].some(function (x) { return !(Math.abs(F.f(x) - F.L) < eps); });
      ok(out, id + ' ε = ' + eps + '：δ_max = ' + d + ' 外面一點點應該有點跑出去');
      ok(M.deltaOK(id, eps, d) && !M.deltaOK(id, eps, d * 1.01), 'deltaOK');
    });
  });
  eq(M.deltaMax('sign', 0.5), null); eq(M.deltaMax('inv2', 0.5), null);
});

test('x sin(1/x) 夾在 ±|x| 之間（夾擠）；|x|/x 左右極限不同；(1 + x)^(1/x) → e', function () {
  for (let i = 1; i < 5000; i++) { const x = (i - 2500) / 2400; if (x) ok(Math.abs(M.FUNCS.xsin.f(x)) <= Math.abs(x) + 1e-15); }
  near(M.FUNCS.xsin.f(1e-6), 0, 1e-6);
  eq(M.FUNCS.sign.f(-1e-9), -1); eq(M.FUNCS.sign.f(1e-9), 1);
  near(M.FUNCS.epow.f(1e-7), Math.E, 1e-6); near(M.FUNCS.epow.f(-1e-7), Math.E, 1e-6);
  ok(M.FUNCS.epow.f(-0.5) > Math.E && M.FUNCS.epow.f(0.5) < Math.E, '左邊比 e 大、右邊比 e 小');
  ok(isNaN(M.FUNCS.hole.f(1)) && isNaN(M.FUNCS.sinc.f(0)), '洞：在 a 沒有定義');
});

test('無窮等比級數：S_n 公式和逐項相加一致；|r| < 1 時 S∞ = a/(1 − r)；0.9 + 0.09 + … = 1', function () {
  [[1, 0.5], [0.9, 0.1], [1.5, -0.5], [-2, 0.75], [3, -0.9], [1, 1], [1, -1], [0.5, 1.2]].forEach(function (p) {
    let s = 0;
    for (let n = 1; n <= 40; n++) { s += p[0] * Math.pow(p[1], n - 1); near(M.partial(p[0], p[1], n), s, 1e-9 * Math.max(1, Math.abs(s)), 'a = ' + p[0] + '、r = ' + p[1] + ' 的 S_' + n); }
  });
  eq(M.sumInf(1, 0.5), 2); eq(M.sumInf(0.9, 0.1), 1); eq(M.sumInf(1.5, -0.5), 1); eq(M.sumInf(1, 1), null); eq(M.sumInf(1, -1), null); eq(M.sumInf(0, 2), 0);
  near(M.partial(0.9, 0.1, 12), 1, 1e-11, '0.999999999999');
  eq(M.termsFor(1, 0.5, 0.001), 11, '1 + 1/2 + … 差 0.001 以內要 11 項');
});

test('挑戰：3000 題的 N 都在 4 到 80、就是 Nmin、和上一題不同', function () {
  const R = M.rng(31);
  let prev = null;
  const kinds = {};
  for (let t = 0; t < 3000; t++) {
    const c = M.genChallenge(R, prev);
    ok(c, '出得了題');
    eq(c.N, M.Nmin(c.spec, c.eps), '答案');
    ok(c.N >= 4 && c.N <= 80, 'N = ' + c.N);
    ok(M.EPS_CHOICES.indexOf(c.eps) >= 0);
    if (prev) ok(!(M.seqKey(prev.spec) === M.seqKey(c.spec) && prev.eps === c.eps), '和上一題不同');
    kinds[c.spec.kind] = 1;
    prev = c;
  }
  eq(Object.keys(kinds).sort().join(','), 'alt,geo,rat,recip', '四種數列都出現');
});

test('文字：數列的 KaTeX', function () {
  eq(M.seqTex(M.SEQS.rat), '\\frac{2n+1}{n+3}');
  eq(M.seqTex({ kind: 'rat', p: 1, q: -2, s: 1 }), '\\frac{n-2}{n+1}');
  eq(M.seqTex({ kind: 'geo', r: -0.5 }), '(-0.5)^{n}');
  eq(M.seqTex({ kind: 'alt', c: 2 }), '\\frac{2(-1)^{n}}{n}');
});

console.log('\n' + (fail ? fail + ' 項失敗、' : '') + pass + ' 項測試通過。');
if (fail) process.exit(1);
