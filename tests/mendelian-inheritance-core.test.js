// 以 Node 執行：node tests/mendelian-inheritance-core.test.js
'use strict';
const assert = require('assert');
const M = require('../js/mendelian-inheritance-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b} ± ${tol}，得到 ${a}`);
}
const F = (n, d) => M.frac(n, d);
const same = (fs, exp, msg) => assert.deepStrictEqual(fs.map(M.fstr), exp, msg);
/** 獨立的 erf（泰勒級數，|z| ≤ 3 時誤差約 1e-13），用來核對 df = 1、3 的 p 值 */
function erf(z) {
  let sum = 0, term = z, n = 0;
  while (Math.abs(term) > 1e-18 * Math.max(1, Math.abs(sum)) || n < 5) {
    sum += term / (2 * n + 1);
    n++;
    term *= -z * z / n;
    if (n > 400) break;
  }
  return 2 / Math.sqrt(Math.PI) * sum;
}

console.log('mendelian-inheritance-core');

test('分數：約分、加法、乘法與最簡整數比', () => {
  assert.deepStrictEqual(F(6, 8), { n: 3, d: 4 });
  assert.deepStrictEqual(M.fadd(F(1, 4), F(1, 2)), { n: 3, d: 4 });
  assert.deepStrictEqual(M.fmul(F(3, 4), F(3, 4)), { n: 9, d: 16 });
  assert.deepStrictEqual(M.ratioOf([F(9, 16), F(3, 16), F(3, 16), F(1, 16)]), [9, 3, 3, 1]);
  assert.deepStrictEqual(M.ratioOf([F(1, 2), F(0), F(1, 2)]), [1, 0, 1]);
});

test('分離律：異型合子產生兩種配子各 1/2，同型合子只有一種', () => {
  assert.deepStrictEqual(M.gametes([1]).map(x => [x.a.join(''), M.fstr(x.p)]), [['1', '1/2'], ['0', '1/2']]);
  assert.deepStrictEqual(M.gametes([2]).map(x => [x.a.join(''), M.fstr(x.p)]), [['1', '1']]);
  assert.deepStrictEqual(M.gametes([0]).map(x => [x.a.join(''), M.fstr(x.p)]), [['0', '1']]);
});

test('自由分配律：RrYy 產生 RY、Ry、rY、ry 各 1/4；RRYy 產生 RY、Ry 各 1/2', () => {
  const sy = ['R', 'Y'];
  assert.deepStrictEqual(M.gametes([1, 1]).map(x => M.gameteStr(x.a, sy) + ' ' + M.fstr(x.p)), ['RY 1/4', 'Ry 1/4', 'rY 1/4', 'ry 1/4']);
  assert.deepStrictEqual(M.gametes([2, 1]).map(x => M.gameteStr(x.a, sy) + ' ' + M.fstr(x.p)), ['RY 1/2', 'Ry 1/2']);
  // 傳統方格：RRYy 的四格是 RY、Ry、RY、Ry（每格 1/4）
  assert.deepStrictEqual(M.gameteSlots([2, 1]).map(a => M.gameteStr(a, sy)), ['RY', 'Ry', 'RY', 'Ry']);
  // 每個配子的機率 = 各基因座機率的乘積
  for (const g of [[1, 1], [2, 1], [1, 0], [0, 2]]) {
    for (const x of M.gametes(g)) {
      let p = F(1);
      x.a.forEach((al, i) => { const one = M.gametes([g[i]]).find(y => y.a[0] === al); p = M.fmul(p, one.p); });
      assert.deepStrictEqual(x.p, p, '配子 ' + x.a.join(''));
    }
  }
});

test('單性狀：純種親代 RR × rr → 子一代全部 Rr（全部顯性）', () => {
  const c = M.cross([2], [0]);
  same(c.genoP, ['0', '1', '0']);
  same(c.phenoP, ['1', '0']);
  assert.strictEqual(M.crossKind([2], [0]), 'P');
  assert.strictEqual(M.crossKind([0], [2]), 'P');
});

test('單性狀子二代：Rr × Rr → 基因型 1:2:1、表現型 3:1（精確分數）', () => {
  const c = M.cross([1], [1]);
  same(c.genoP, ['1/4', '1/2', '1/4']);
  same(c.phenoP, ['3/4', '1/4']);
  assert.deepStrictEqual(c.genoRatio, [1, 2, 1]);
  assert.deepStrictEqual(c.phenoRatio, [3, 1]);
  assert.strictEqual(M.crossKind([1], [1]), 'F2');
});

test('單性狀試交：Rr × rr → 1:1；RR × rr → 全部顯性', () => {
  const c = M.cross([1], [0]);
  same(c.genoP, ['0', '1/2', '1/2']);
  same(c.phenoP, ['1/2', '1/2']);
  assert.strictEqual(M.crossKind([1], [0]), 'test');
  assert.strictEqual(M.crossKind([0], [1]), 'test');
  same(M.cross([2], [0]).phenoP, ['1', '0']);
});

test('雙性狀子二代：RrYy × RrYy → 表現型 9:3:3:1、基因型 1:2:1:2:4:2:1:2:1', () => {
  const c = M.cross([1, 1], [1, 1]);
  same(c.phenoP, ['9/16', '3/16', '3/16', '1/16']);
  assert.deepStrictEqual(c.phenoRatio, [9, 3, 3, 1]);
  assert.deepStrictEqual(c.genoRatio, [1, 2, 1, 2, 4, 2, 1, 2, 1]);
  assert.strictEqual(c.cells.length, 4);
  assert.strictEqual(c.cells[0].length, 4);
  // 表現型 = 兩個 3:1 獨立相乘（自由分配律）
  const one = M.cross([1], [1]).phenoP;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) assert.deepStrictEqual(c.phenoP[a * 2 + b], M.fmul(one[a], one[b]));
  assert.strictEqual(M.crossKind([1, 1], [1, 1]), 'F2');
  assert.strictEqual(M.crossKind([2, 2], [0, 0]), 'P');
  assert.strictEqual(M.crossKind([2, 0], [0, 2]), 'P'); // RRyy × rrYY 也是兩個純種
});

test('雙性狀試交：RrYy × rryy → 1:1:1:1；RRYy × rryy → 1:1:0:0', () => {
  const c = M.cross([1, 1], [0, 0]);
  same(c.phenoP, ['1/4', '1/4', '1/4', '1/4']);
  assert.deepStrictEqual(c.phenoRatio, [1, 1, 1, 1]);
  assert.strictEqual(M.crossKind([1, 1], [0, 0]), 'test');
  same(M.cross([2, 1], [0, 0]).phenoP, ['1/2', '1/2', '0', '0']);
  same(M.cross([1, 2], [0, 0]).phenoP, ['1/2', '0', '1/2', '0']);
  same(M.cross([2, 2], [0, 0]).phenoP, ['1', '0', '0', '0']);
  assert.strictEqual(M.crossKind([2, 1], [1, 2]), 'other');
  assert.strictEqual(M.crossKind([2, 1], [2, 1]), 'same');
});

test('每一種雜交的機率總和都是 1，表現型由基因型決定', () => {
  const G = [0, 1, 2];
  for (const a of G) for (const b of G) for (const c of G) for (const d of G) {
    const cr = M.cross([a, b], [c, d]);
    assert.deepStrictEqual(cr.genoP.reduce(M.fadd, F(0)), F(1));
    assert.deepStrictEqual(cr.phenoP.reduce(M.fadd, F(0)), F(1));
    // 表現型機率 = 對應基因型機率的和
    const ph = [F(0), F(0), F(0), F(0)];
    cr.genoP.forEach((p, k) => { const i = M.phenoIndex(M.genoOf(k, 2)); ph[i] = M.fadd(ph[i], p); });
    assert.deepStrictEqual(ph, cr.phenoP);
  }
});

test('基因型、表現型的編號與文字', () => {
  assert.strictEqual(M.genoStr([1, 2], ['R', 'Y']), 'RrYY');
  assert.strictEqual(M.genoStr([0], ['T']), 'tt');
  assert.strictEqual(M.phenoIndex([2, 1]), 0);
  assert.strictEqual(M.phenoIndex([1, 0]), 1);
  assert.strictEqual(M.phenoIndex([0, 2]), 2);
  assert.strictEqual(M.phenoIndex([0, 0]), 3);
  assert.deepStrictEqual(M.phenoBits(2, 2), [false, true]);
  for (let k = 0; k < 9; k++) assert.strictEqual(M.genoIndex(M.genoOf(k, 2)), k);
  assert.deepStrictEqual(M.genoOf(0, 2), [2, 2]);
  assert.deepStrictEqual(M.genoOf(4, 2), [1, 1]);
});

test('抽樣可重現：同一個種子得到同樣的子代', () => {
  const cr = M.cross([1, 1], [1, 1]);
  const a = M.sampleCounts(cr, 500, M.rng(42)), b = M.sampleCounts(cr, 500, M.rng(42));
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a, M.sampleCounts(cr, 500, M.rng(43)));
  assert.strictEqual(a.N, 500);
  assert.strictEqual(a.pheno.reduce((x, y) => x + y), 500);
});

test('大量抽樣收斂：子二代 3:1、9:3:3:1，試交 1:1:1:1（各類別在 4 個標準差內）', () => {
  const checks = [[[1], [1]], [[1, 1], [1, 1]], [[1, 1], [0, 0]], [[1], [0]], [[2, 1], [1, 0]]];
  for (const [g1, g2] of checks) {
    const cr = M.cross(g1, g2), N = 400000;
    const s = M.sampleCounts(cr, N, M.rng(20261112));
    cr.phenoP.forEach((p, i) => {
      const q = M.fval(p), sd = Math.sqrt(N * q * (1 - q));
      close(s.pheno[i], N * q, 4 * sd + 1e-9, g1 + '×' + g2 + ' 類別 ' + i);
    });
    cr.genoP.forEach((p, i) => {
      const q = M.fval(p), sd = Math.sqrt(N * q * (1 - q));
      close(s.geno[i], N * q, 4 * sd + 1e-9, g1 + '×' + g2 + ' 基因型 ' + i);
    });
  }
  // 子二代每一格（傳統方格）的機率都是 1/16
  const cr = M.cross([1, 1], [1, 1]), s = M.sampleCounts(cr, 160000, M.rng(7));
  s.cell.forEach((c, i) => close(c, 10000, 4 * Math.sqrt(160000 * (1 / 16) * (15 / 16)), '格 ' + i));
});

test('抽樣的卡方值服從卡方分布：p < 0.05 的比例約 5%', () => {
  const cr = M.cross([1, 1], [1, 1]), r = M.rng(99);
  let rej = 0;
  const T = 4000;
  for (let t = 0; t < T; t++) {
    const s = M.sampleCounts(cr, 400, r);
    if (M.chiSquare(s.pheno, cr.phenoP).p < 0.05) rej++;
  }
  close(rej / T, 0.05, 4 * Math.sqrt(0.05 * 0.95 / T), '型一錯誤率');
});

test('ln Γ：整數階乘與 Γ(1/2) = √π', () => {
  let f = 0;
  for (let n = 1; n <= 30; n++) { f += Math.log(n); close(M.lnGamma(n + 1), f, 1e-12 * Math.max(1, f), 'ln ' + n + '!'); }
  close(M.lnGamma(0.5), 0.5 * Math.log(Math.PI), 1e-14, 'Γ(1/2)');
  close(M.lnGamma(1.5), Math.log(Math.sqrt(Math.PI) / 2), 1e-14, 'Γ(3/2)');
});

test('不完全 Gamma：P + Q = 1；整數階有封閉式', () => {
  for (const a of [0.5, 1, 1.5, 2, 4.5, 10]) for (const x of [0.01, 0.3, 1, 2.5, 7, 20, 60]) {
    close(M.gammaP(a, x) + M.gammaQ(a, x), 1, 1e-13, 'a=' + a + ' x=' + x);
  }
  // Q(1, x) = e^(−x)；Q(2, x) = e^(−x)(1 + x)
  for (const x of [0.1, 1, 3.7, 15]) {
    close(M.gammaQ(1, x), Math.exp(-x), 1e-14, 'Q(1,' + x + ')');
    close(M.gammaQ(2, x), Math.exp(-x) * (1 + x), 1e-14, 'Q(2,' + x + ')');
  }
});

test('卡方 p 值與封閉式完全一致（df = 1、2、3、4）', () => {
  for (const x of [0.1, 0.47, 1, 3.841, 6.2, 11]) {
    const z = Math.sqrt(x / 2);
    close(M.chi2Sf(x, 1), 1 - erf(z), 1e-12, 'df=1, χ²=' + x);
    close(M.chi2Sf(x, 2), Math.exp(-x / 2), 1e-14, 'df=2, χ²=' + x);
    close(M.chi2Sf(x, 3), 1 - erf(z) + Math.sqrt(2 * x / Math.PI) * Math.exp(-x / 2), 1e-12, 'df=3, χ²=' + x);
    close(M.chi2Sf(x, 4), Math.exp(-x / 2) * (1 + x / 2), 1e-14, 'df=4, χ²=' + x);
  }
});

test('卡方 p 值與教科書的臨界值表相符', () => {
  // 臨界值表通常只到小數第 3 位，所以 p 值只會接近 0.05、0.01
  close(M.chi2Sf(3.841, 1), 0.05, 1e-4, 'df=1 χ²=3.841');
  close(M.chi2Sf(5.991, 2), 0.05, 1e-4, 'df=2 χ²=5.991');
  close(M.chi2Sf(7.815, 3), 0.05, 1e-4, 'df=3 χ²=7.815');
  close(M.chi2Sf(6.635, 1), 0.01, 1e-4, 'df=1 χ²=6.635');
  close(M.chi2Sf(11.345, 3), 0.01, 1e-4, 'df=3 χ²=11.345');
  // 反過來求臨界值（精確值）
  close(M.chi2Inv(0.05, 1), 3.841458820694124, 1e-9, '臨界值 df=1');
  close(M.chi2Inv(0.05, 2), 5.991464547107979, 1e-9, '臨界值 df=2');
  close(M.chi2Inv(0.05, 3), 7.814727903251178, 1e-9, '臨界值 df=3');
  close(M.chi2Inv(0.01, 3), 11.344866730144373, 1e-9, '臨界值 df=3, 0.01');
  close(M.chi2Inv(0.05, 8), 15.507313055865453, 1e-9, '臨界值 df=8');
  close(M.chi2Sf(M.chi2Inv(0.05, 1), 1), 0.05, 1e-12);
});

test('卡方檢定：自由度 = 類別數 − 1；機率 0 的類別不算；假說不可能的結果直接推翻', () => {
  const r = M.chiSquare([75, 25], [F(3, 4), F(1, 4)]);
  assert.strictEqual(r.df, 1);
  assert.strictEqual(r.chi2, 0);
  assert.strictEqual(r.p, 1);
  const r2 = M.chiSquare([30, 0, 0, 0], M.cross([2, 2], [0, 0]).phenoP);
  assert.strictEqual(r2.df, 0);
  assert.strictEqual(r2.p, 1);
  const r3 = M.chiSquare([10, 1], [F(1), F(0)]);
  assert.ok(r3.impossible);
  assert.strictEqual(r3.p, 0);
  // 試交：RR 的假說遇到一個隱性子代就被推翻
  assert.ok(M.chiSquare([7, 1], M.cross([2], [0]).phenoP).impossible);
  // 最小期望值
  close(M.chiSquare([5, 3, 2, 0], M.cross([1, 1], [1, 1]).phenoP).minExpected, 10 / 16, 1e-15);
});

test('孟德爾的數據：種子形狀 5474：1850 的卡方值 = 2643964/10057683（約 0.263），p ≈ 0.608', () => {
  const r = M.chiSquare(M.TRAITS.shape.mendel, [F(3, 4), F(1, 4)]);
  close(r.chi2, 2643964 / 10057683, 1e-14, 'χ²');
  close(r.p, 1 - erf(Math.sqrt(r.chi2 / 2)), 1e-12, 'p');
  close(r.p, 0.6081, 5e-4, 'p 約 0.608');
  assert.strictEqual(r.N, 7324);
  // 其他三個性狀
  const want = { color: [8023, 0.015], flower: [929, 0.3908], height: [1064, 0.6065] };
  for (const k of Object.keys(want)) {
    const t = M.chiSquare(M.TRAITS[k].mendel, [F(3, 4), F(1, 4)]);
    assert.strictEqual(t.N, want[k][0], k + ' 總數');
    close(t.chi2, want[k][1], 5e-4, k + ' χ²');
    assert.ok(t.p > 0.05, k + ' 與 3:1 相符');
  }
  // 子葉顏色：E = 6017.25、2005.75，O − E = ±4.75
  close(M.chiSquare([6022, 2001], [F(3, 4), F(1, 4)]).chi2, 4.75 * 4.75 * (1 / 6017.25 + 1 / 2005.75), 1e-14);
});

test('孟德爾的雙性狀數據 315：108：101：32 → χ² = 0.470，p ≈ 0.925', () => {
  const c = M.MENDEL_DIHYBRID.counts;
  assert.strictEqual(c.reduce((a, b) => a + b), 556);
  const r = M.chiSquare(c, M.cross([1, 1], [1, 1]).phenoP);
  const E = [312.75, 104.25, 104.25, 34.75];
  const exact = c.reduce((s, o, i) => s + (o - E[i]) * (o - E[i]) / E[i], 0);
  close(r.chi2, exact, 1e-14, 'χ²');
  close(r.chi2, 0.470024, 1e-6, 'χ² 數值');
  assert.strictEqual(r.df, 3);
  close(r.p, 1 - erf(Math.sqrt(r.chi2 / 2)) + Math.sqrt(2 * r.chi2 / Math.PI) * Math.exp(-r.chi2 / 2), 1e-12, 'p 封閉式');
  close(r.p, 0.9254, 5e-4, 'p');
  // 試交數據（雜種當母本 31:26:27:26、當父本 24:25:22:27）與 1:1:1:1
  const t1 = M.chiSquare(M.MENDEL_TESTCROSS.hybridSeed, M.cross([1, 1], [0, 0]).phenoP);
  close(t1.chi2, 17 / 27.5, 1e-14, '試交一');
  const t2 = M.chiSquare(M.MENDEL_TESTCROSS.hybridPollen, M.cross([1, 1], [0, 0]).phenoP);
  close(t2.chi2, 13 / 24.5, 1e-14, '試交二');
  assert.ok(t1.p > 0.8 && t2.p > 0.8);
});

test('二項與多項分布：總和為 1；子二代 16 個恰好 9:3:3:1 的機率', () => {
  let s = 0;
  for (let k = 0; k <= 30; k++) s += M.binomPmf(k, 30, 0.25);
  close(s, 1, 1e-12);
  close(M.binomPmf(2, 4, 0.5), 6 / 16, 1e-14);
  close(M.binomAtLeast(1, 4, 0.25), 1 - Math.pow(0.75, 4), 1e-13);
  // 16!/(9!3!3!1!) (9/16)^9 (3/16)^6 (1/16)
  const exact = 1601600 * Math.pow(9 / 16, 9) * Math.pow(3 / 16, 6) / 16;
  close(M.multinomPmf([9, 3, 3, 1], [9 / 16, 3 / 16, 3 / 16, 1 / 16]), exact, 1e-14);
});

test('神秘豌豆：一定是顯性表現型；試交證據的判斷', () => {
  const r = M.rng(5), seen = {};
  for (let k = 0; k < 400; k++) { const g = M.mysteryPick(2, r); assert.ok(g.every(x => x >= 1)); seen[g.join('')] = 1; }
  assert.deepStrictEqual(Object.keys(seen).sort(), ['11', '12', '21', '22']);
  assert.deepStrictEqual(M.recessiveSeen([5, 2, 0, 1], 2), [1, 3]);
  // 猜 Rr：要看過皺的子代；猜 RR：至少 8 個子代且沒有皺的
  assert.ok(M.guessJustified([1], [6, 1], 8));
  assert.ok(!M.guessJustified([1], [6, 0], 8));
  assert.ok(M.guessJustified([2], [8, 0], 8));
  assert.ok(!M.guessJustified([2], [7, 0], 8));
  assert.ok(M.guessJustified([2, 1], [4, 4, 0, 0], 8));
  assert.ok(!M.guessJustified([1, 1], [4, 4, 0, 0], 8));
});

console.log(passed + ' 項通過');
