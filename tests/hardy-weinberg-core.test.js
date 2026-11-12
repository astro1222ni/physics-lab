// 以 Node 執行：node tests/hardy-weinberg-core.test.js
'use strict';
const assert = require('assert');
const H = require('../js/hardy-weinberg-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b} ± ${tol}，得到 ${a}`);
}

console.log('hardy-weinberg-core');

test('ln Γ：與階乘一致', () => {
  close(H.lgamma(1), 0, 1e-12);
  close(H.lgamma(11), Math.log(3628800), 1e-10);
  close(H.lgamma(0.5), Math.log(Math.sqrt(Math.PI)), 1e-12);
  close(H.lgamma(171), 706.5730622457874, 1e-8);
});

test('哈溫比例：p² + 2pq + q² = 1；F 使異型合子減少 F 倍', () => {
  [0, 0.1, 0.37, 0.5, 0.9, 1].forEach(p => {
    const g = H.genotypes(p);
    close(g[0] + g[1] + g[2], 1, 1e-15);
    close(g[0], p * p, 1e-15); close(g[1], 2 * p * (1 - p), 1e-15);
    close(H.alleleP(g), p, 1e-15);
    const gf = H.genotypes(p, 0.3);
    close(gf[1], 0.7 * 2 * p * (1 - p), 1e-15);
    close(H.alleleP(gf), p, 1e-15);
  });
  close(H.inbreedingF(H.genotypes(0.3, 0.25)), 0.25, 1e-12);
});

test('隨機交配：從任何基因型組成出發，一代就到哈溫平衡，對偶基因頻率不變', () => {
  [[0.5, 0, 0.5], [0, 1, 0], [0.7, 0.1, 0.2], [0.1, 0.2, 0.7]].forEach(g0 => {
    const g1 = H.mate(g0, 0), p = H.alleleP(g0);
    close(H.alleleP(g1), p, 1e-15);
    close(H.hwDev(g1), 0, 1e-15);
    const g2 = H.mate(g1, 0);
    g2.forEach((x, i) => close(x, g1[i], 1e-15, '之後不再改變'));
  });
  assert.ok(H.hwDev([0.5, 0, 0.5]) > 0.2);
});

test('自花授粉：全部自交時異型合子每代減半；部分自交時 F 趨近 σ/(2 − σ)', () => {
  let g = [0, 1, 0];
  for (let t = 1; t <= 5; t++) { g = H.mate(g, 1); close(g[1], Math.pow(0.5, t), 1e-15); close(H.alleleP(g), 0.5, 1e-15); }
  [0.2, 0.5, 0.9].forEach(s => {
    let x = H.genotypes(0.3);
    for (let t = 0; t < 200; t++) x = H.mate(x, s);
    close(H.inbreedingF(x), H.selfingF(s), 1e-9);
    close(H.alleleP(x), 0.3, 1e-12);
  });
  close(H.selfingF(1), 1, 1e-15); close(H.selfingF(0), 0, 1e-15);
});

test('二項分布抽樣：平均 np、變異數 np(1 − p)；固定種子可重現', () => {
  const cases = [[10, 0.3], [24, 0.5], [25, 0.5], [200, 0.02], [2000, 0.5], [10000, 0.001], [10000, 0.97]];
  cases.forEach(c => {
    const n = c[0], p = c[1], rnd = H.rng(7 + n);
    let s = 0, s2 = 0;
    const M = 40000;
    for (let i = 0; i < M; i++) { const k = H.binom(n, p, rnd); assert.ok(k >= 0 && k <= n); s += k; s2 += k * k; }
    const mean = s / M, v = s2 / M - mean * mean, ev = n * p * (1 - p);
    close(mean, n * p, 5 * Math.sqrt(ev / M) + 1e-9, `n=${n} p=${p} 平均`);
    close(v / ev, 1, 0.05, `n=${n} p=${p} 變異數比`);
  });
  // 小 n 的機率分布逐點比對
  const rnd = H.rng(99), cnt = new Array(41).fill(0), M = 200000;
  for (let i = 0; i < M; i++) cnt[H.binom(40, 0.35, rnd)]++;
  for (let k = 5; k <= 25; k++) {
    const pk = Math.exp(H.lgamma(41) - H.lgamma(k + 1) - H.lgamma(41 - k) + k * Math.log(0.35) + (40 - k) * Math.log(0.65));
    close(cnt[k] / M, pk, 5 * Math.sqrt(pk / M) + 1e-4, `P(K=${k})`);
  }
  const a = H.rng(5), b = H.rng(5);
  for (let i = 0; i < 20; i++) assert.strictEqual(H.binom(500, 0.4, a), H.binom(500, 0.4, b));
  assert.strictEqual(H.binom(100, 0, a), 0); assert.strictEqual(H.binom(100, 1, a), 100);
});

test('卡方檢定：30、40、30 → χ² = 4、P ≈ 0.0455；臨界值 3.841 對應 0.05', () => {
  const r = H.hwTest([30, 40, 30]);
  close(r.p, 0.5, 1e-15); close(r.chi2, 4, 1e-12); close(r.pval, 0.0455, 0.0002);
  close(H.chi2p1(3.841459), 0.05, 1e-6);
  close(H.chi2p1(6.634897), 0.01, 1e-6);
  const ok = H.hwTest([25, 50, 25]);
  close(ok.chi2, 0, 1e-12); close(ok.pval, 1, 1e-9);
  close(H.hwTest([30, 40, 30]).Fhat, 0.2, 1e-12);
  // 哈溫族群抽樣：大約 5% 的檢定會拒絕（第一型錯誤）
  const rnd = H.rng(2024), g = H.genotypes(0.4);
  let rej = 0;
  const M = 4000;
  for (let i = 0; i < M; i++) if (H.hwTest(H.sample(200, g, rnd)).pval < 0.05) rej++;
  close(rej / M, 0.05, 0.012);
  // 有近親交配（F = 0.3）時，抽 200 個幾乎都能檢定出來
  const gi = H.genotypes(0.4, 0.3);
  let rej2 = 0;
  for (let i = 0; i < 500; i++) if (H.hwTest(H.sample(200, gi, rnd)).pval < 0.05) rej2++;
  assert.ok(rej2 / 500 > 0.9, '檢定力 ' + rej2 / 500);
});

test('中性漂變：平均 p 不變、異型合子度照 (1 − 1/(2N))^t 下降、固定的比例 ≈ p₀', () => {
  const o = { N: 20, pops: 2000, p0: 0.3, gens: 30, w: [1, 1, 1], seed: 11 };
  const s = H.simulate(o);
  close(s.meanP[30], 0.3, 0.02);
  [5, 10, 20, 30].forEach(t => close(s.meanH[t] / H.hetDecay(s.meanH[0], 20, t), 1, 0.05, `t=${t}`));
  const long = H.simulate({ N: 10, pops: 3000, p0: 0.3, gens: 400, w: [1, 1, 1], seed: 3 });
  const c = H.census(long, 400);
  assert.strictEqual(c.seg, 0, '400 代後都已固定或消失');
  close(c.fixed / 3000, 0.3, 0.03);
  close(H.fixProb(0.3, 10, [1, 1, 1]), 0.3, 1e-9);
});

test('隱性致死（1, 1, 0）：q_t = q₀ / (1 + t·q₀)', () => {
  const tr = H.detTraj(0.5, 100, { w: [1, 1, 0] });
  [1, 10, 50, 100].forEach(t => close(1 - tr[t], 0.5 / (1 + t * 0.5), 1e-12, `t=${t}`));
});

test('異型合子優勢收斂到 p̂；異型合子劣勢的 p̂ 不穩定', () => {
  const w = [0.88, 1, 0.14];
  const ph = H.hetEquilibrium(w);
  close(ph, 0.86 / 0.98, 1e-12);
  [0.05, 0.5, 0.99].forEach(p0 => close(H.detTraj(p0, 400, { w: w })[400], ph, 1e-6));
  const wu = [1, 0.8, 1], pu = H.hetEquilibrium(wu);
  close(pu, 0.5, 1e-12);
  assert.ok(H.detTraj(0.51, 300, { w: wu })[300] > 0.99);
  assert.ok(H.detTraj(0.49, 300, { w: wu })[300] < 0.01);
  assert.strictEqual(H.selKind(w), 'het'); assert.strictEqual(H.selKind(wu), 'under');
  assert.strictEqual(H.selKind([1, 1, 1]), 'neutral'); assert.strictEqual(H.selKind([1.1, 1.05, 1]), 'A');
  assert.strictEqual(H.selKind([1, 1, 1.2]), 'a');
});

test('突變–天擇平衡：隱性有害（s = 0.5、u = 10⁻⁴）時 q̂ ≈ √(u/s)', () => {
  const o = { w: [1, 1, 0.5], u: 1e-4 };
  const q = 1 - H.detTraj(0.999, 20000, o)[20000];
  close(q / Math.sqrt(1e-4 / 0.5), 1, 0.03);
});

test('遷移：無限大族群時 p 以 (1 − m)^t 的速度靠近移入者的頻率', () => {
  const tr = H.detTraj(0.1, 50, { m: 0.05, pm: 0.8 });
  [1, 10, 50].forEach(t => close(tr[t], 0.8 + (0.1 - 0.8) * Math.pow(0.95, t), 1e-12));
});

test('固定機率：數值積分與 Kimura 加成公式一致，並和模擬相符', () => {
  [[50, 0.01, 0.01], [100, 0.05, 0.005], [20, -0.02, 0.2], [500, 0.02, 0.001]].forEach(c => {
    const N = c[0], s = c[1], p0 = c[2];
    // 加成型：w = (1 + 2s, 1 + s, 1)，與 Kimura 的 (1 − e^{−4Nsp})/(1 − e^{−4Ns}) 在 s 小時一致
    const num = H.fixProb(p0, N, [1 + 2 * s, 1 + s, 1]);
    close(num / H.kimuraAdditive(p0, N, s), 1, 0.03, `N=${N} s=${s}`);
  });
  const N = 50, s = 0.05;
  const u = H.fixProb(1 / (2 * N), N, [1 + 2 * s, 1 + s, 1]);
  const sim = H.simulate({ N: N, pops: 4000, p0: 1 / (2 * N), gens: 600, w: [1 + 2 * s, 1 + s, 1], seed: 77 });
  const c = H.census(sim, 600);
  assert.ok(c.seg <= 4, '幾乎都已分出結果');
  const sd = Math.sqrt(u * (1 - u) / 4000);
  close(c.fixed / 4000, u, 3.5 * sd, '新突變的固定比例');
  assert.ok(u > 5 / (2 * N), '有利突變的固定機率遠大於中性的 1/(2N)');
});

test('有利基因：大族群照確定性的軌跡走；小族群的結果分散', () => {
  const o = { N: 5000, pops: 20, p0: 0.1, gens: 120, w: [1.1, 1.05, 1], seed: 8 };
  const s = H.simulate(o);
  close(s.meanP[120], s.det[120], 0.03);
  assert.ok(s.det[120] > 0.9);
  const small = H.simulate(Object.assign({}, o, { N: 10, seed: 9 }));
  const c = H.census(small, 120);
  assert.ok(c.lost > 0, '小族群裡有利的 A 也可能消失');
});

test('直方圖：消失、固定與中間區間的總數 = 族群數', () => {
  const s = H.simulate({ N: 15, pops: 300, p0: 0.5, gens: 40, w: [1, 1, 1], seed: 4 });
  const h = H.histogram(s, 40, 10);
  assert.strictEqual(h.lost + h.fixed + h.h.reduce((a, b) => a + b, 0), 300);
  const c = H.census(s, 40);
  assert.strictEqual(h.lost, c.lost); assert.strictEqual(h.fixed, c.fixed);
});

console.log(passed + ' 項通過');
