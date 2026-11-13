/* 巴斯卡三角形與二項式定理：數學核心的單元測試。用法：node tests/pascal-triangle-core.test.js */
'use strict';
const P = require('../js/pascal-triangle-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b); }
/** 用階乘直接算（BigInt） */
function fact(n) { let f = 1n; for (let i = 2n; i <= BigInt(n); i++) f *= i; return f; }

test('組合數：和階乘公式 n! / (k!(n − k)!) 完全一致（到第 70 列）；對稱；列和 2^n；交錯和 0', function () {
  for (let n = 0; n <= 70; n++) {
    let s = 0n, alt = 0n;
    for (let k = 0; k <= n; k++) {
      const c = P.C(n, k);
      eq(c, fact(n) / (fact(k) * fact(n - k)), 'C(' + n + ', ' + k + ')');
      eq(c, P.C(n, n - k), '對稱');
      s += c; alt += (k % 2 ? -c : c);
    }
    eq(s, P.pow2(n), '第 ' + n + ' 列的和');
    eq(alt, n === 0 ? 1n : 0n, '第 ' + n + ' 列的交錯和');
  }
  eq(P.C(5, -1), 0n); eq(P.C(5, 6), 0n);
  eq(P.C(63, 31), 916312070471295267n, 'C(63, 31) 超過 2^53，仍精確');
});

test('巴斯卡遞迴、曲棍球棒恆等式、淺對角線和是費氏數', function () {
  for (let n = 1; n <= 60; n++) for (let k = 1; k < n; k++) eq(P.C(n, k), P.C(n - 1, k - 1) + P.C(n - 1, k), '遞迴');
  // 曲棍球棒：C(r, r) + C(r + 1, r) + … + C(n, r) = C(n + 1, r + 1)
  for (let r = 0; r <= 10; r++) for (let n = r; n <= 30; n++) {
    let s = 0n; for (let t = r; t <= n; t++) s += P.C(t, r);
    eq(s, P.C(n + 1, r + 1), '曲棍球棒');
  }
  let a = 0n, b = 1n;
  for (let s = 0; s <= 60; s++) { eq(P.shallowSum(s), b, '第 ' + s + ' 條淺對角線'); const t = a + b; a = b; b = t; }
});

test('除以 m 的餘數：遞迴算的餘數和精確值取餘數一致；第 2^k − 1 列全是奇數（盧卡斯定理）', function () {
  [2, 3, 4, 5, 7, 10].forEach(function (m) {
    const R = P.modRows(64, m);
    for (let n = 0; n < 64; n++) for (let k = 0; k <= n; k++) eq(R[n][k], Number(P.C(n, k) % BigInt(m)), 'mod ' + m + ' 的 C(' + n + ', ' + k + ')');
  });
  const R2 = P.modRows(64, 2);
  for (let n = 0; n < 64; n++) {
    const odd = R2[n].every(function (x) { return x === 1; });
    eq(odd, P.allOdd(n), '第 ' + n + ' 列全奇');
    // 奇數的個數是 2 的（n 的二進位中 1 的個數）次方
    const ones = n.toString(2).split('').filter(function (c) { return c === '1'; }).length;
    eq(R2[n].reduce(function (s, x) { return s + x; }, 0), Math.pow(2, ones), '第 ' + n + ' 列奇數的個數');
  }
  ok([0, 1, 3, 7, 15, 31, 63].every(P.allOdd) && ![2, 4, 5, 6, 8, 14, 16, 30, 62].some(P.allOdd));
});

test('數字出現的位置：120 在前 64 列出現 4 次；3003 在前 80 列出現 6 次（全部共 8 次，Singmaster）', function () {
  const p = P.positionsOf(120n, 64).map(function (x) { return x.join(','); }).join(' ');
  eq(p, '10,3 10,7 16,2 16,14', '120');
  eq(P.positionsOf(3003n, 80).length, 6, '3003（到第 80 列有 6 個，加上 C(3003, 1)、C(3003, 3002) 共 8 個）');
  eq(P.positionsOf(2n, 64).length, 1, '2 只出現一次');
});

test('走格子：沒有路障時路徑數 C(m + n, m)；每個點的走法數就是巴斯卡三角形轉 45°', function () {
  for (let m = 1; m <= 8; m++) for (let n = 1; n <= 8; n++) {
    const W = P.gridWays(m, n);
    eq(W[m][n], P.Cn(m + n, m), m + '×' + n);
    for (let i = 0; i <= m; i++) for (let j = 0; j <= n; j++) eq(W[i][j], P.Cn(i + j, i), '點 (' + i + ', ' + j + ')');
  }
  eq(P.gridCount(5, 5), 252, '5 × 5');
});

test('走格子：有路障時用排容原理核對；經過某點的路徑數；正方形格子擋住 (1, 0) 剛好少一半', function () {
  const rand = P.rng(5);
  for (let t = 0; t < 300; t++) {
    const m = 1 + Math.floor(rand() * 6), n = 1 + Math.floor(rand() * 6);
    const i = Math.floor(rand() * (m + 1)), j = Math.floor(rand() * (n + 1));
    if ((i === 0 && j === 0) || (i === m && j === n)) continue;
    const one = new Set([P.key(i, j)]);
    eq(P.gridCount(m, n, one), P.Cn(m + n, m) - P.through(m, n, i, j), '一個路障');
    const i2 = Math.floor(rand() * (m + 1)), j2 = Math.floor(rand() * (n + 1));
    if ((i2 === 0 && j2 === 0) || (i2 === m && j2 === n) || (i2 === i && j2 === j)) continue;
    // 兩個路障：總數 − 經過第一點 − 經過第二點 + 兩點都經過
    let both = 0;
    const p1 = [i, j], p2 = [i2, j2], lo = p1[0] <= p2[0] && p1[1] <= p2[1] ? [p1, p2] : p2[0] <= p1[0] && p2[1] <= p1[1] ? [p2, p1] : null;
    if (lo) both = P.Cn(lo[0][0] + lo[0][1], lo[0][0]) * P.Cn(lo[1][0] - lo[0][0] + lo[1][1] - lo[0][1], lo[1][0] - lo[0][0]) * P.Cn(m - lo[1][0] + n - lo[1][1], m - lo[1][0]);
    eq(P.gridCount(m, n, new Set([P.key(i, j), P.key(i2, j2)])), P.Cn(m + n, m) - P.through(m, n, i, j) - P.through(m, n, i2, j2) + both, '兩個路障');
  }
  for (let m = 1; m <= 8; m++) eq(P.gridCount(m, m, new Set(['1,0'])) * 2, P.Cn(2 * m, m), m + '×' + m + ' 擋 (1, 0)');
  // 4 × 4 用兩個路障剩 20 條：例如 (0, 1) 與 (2, 0)，70 − 35 − 15 + 0 = 20（兩點不在同一條路徑上）
  eq(P.gridCount(4, 4, new Set(['0,1', '2,0'])), 20, '4 × 4 擋 (0, 1)、(2, 0)');
});

test('隨機路徑：合法、走到終點、每條路徑機率相同（2 × 2 的 6 條各約 1/6）', function () {
  const rand = P.rng(9), cnt = {};
  for (let t = 0; t < 60000; t++) {
    const p = P.randomPath(2, 2, null, rand);
    ok(P.validPath(p) && p.length === 5 && p[4][0] === 2 && p[4][1] === 2, '合法');
    const s = p.map(function (q) { return q.join(''); }).join('-'); cnt[s] = (cnt[s] || 0) + 1;
  }
  eq(Object.keys(cnt).length, 6, '6 條路徑都出現');
  Object.keys(cnt).forEach(function (s) { ok(Math.abs(cnt[s] / 60000 - 1 / 6) < 0.01, s + ' 的比例 ' + (cnt[s] / 60000).toFixed(4)); });
  const blocked = new Set(['1,0', '1,1']);
  for (let t = 0; t < 200; t++) { const p = P.randomPath(3, 2, blocked, rand); ok(P.validPath(p, blocked), '避開路障'); }
  eq(P.randomPath(1, 1, new Set(['1,0', '0,1']), rand), null, '走不到時是 null');
  ok(!P.validPath([[0, 0], [1, 1]]) && !P.validPath([[0, 0], [1, 0]], new Set(['1,0'])), '斜走、踩路障都不合法');
});

test('二項式：係數 C(n, k) a^k b^(n − k)；代入 x = 1 得 (a + b)^n、x = −1 得 (b − a)^n；展開式文字', function () {
  for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) for (let n = 0; n <= 10; n++) {
    const c = P.expand(a, b, n);
    eq(P.evalPoly(c, 1), Math.pow(a + b, n), '代入 1');
    eq(P.evalPoly(c, -1), Math.pow(b - a, n), '代入 −1');
    for (let x = -2; x <= 2; x++) eq(P.evalPoly(c, x), Math.pow(a * x + b, n), '代入 ' + x);
  }
  eq(P.expand(1, -2, 6)[3], -160, '(x − 2)^6 的 x^3 係數');
  eq(P.expandTex(1, 1, 3), 'x^{3}+3x^{2}+3x+1');
  eq(P.expandTex(2, -1, 2), '4x^{2}-4x+1');
  eq(P.expandTex(0, 0, 2), '0');
  eq(P.expandTex(-1, 0, 3), '-x^{3}');
});

test('挑戰：2000 題的答案就是逐點加出來的路徑數、四個選項不同且都是正數、路障不在起點終點', function () {
  const R = P.rng(77);
  let prev = null;
  for (let t = 0; t < 2000; t++) {
    const c = P.genChallenge(R, prev);
    ok(c, '出得了題');
    ok(c.m >= 2 && c.m <= 5 && c.n >= 2 && c.n <= 4, '大小');
    const set = new Set(c.blocks.map(function (b) { return P.key(b[0], b[1]); }));
    ok(!set.has('0,0') && !set.has(c.m + ',' + c.n), '路障位置');
    eq(c.options[c.answer], P.gridCount(c.m, c.n, set), '答案');
    ok(c.count >= 2 && c.options.length === 4 && new Set(c.options).size === 4 && c.options.every(function (v) { return v > 0 && Number.isInteger(v); }), '選項 ' + c.options);
    prev = c;
  }
});

console.log('\n' + (fail ? fail + ' 項失敗、' : '') + pass + ' 項測試通過。');
if (fail) process.exit(1);
