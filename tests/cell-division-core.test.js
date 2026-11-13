// 以 Node 執行：node tests/cell-division-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/cell-division-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b} ± ${tol}，得到 ${a}`);
}
const at = (mode, k, f) => { const i = C.STAGES[mode].findIndex(s => s.k === k); return C.stageStart(mode, i) + f * C.STAGES[mode][i].d; };
const cellsAt = (rec, k, f) => C.counts(rec, at(rec.mode, k, f)).cells;

console.log('cell-division-core');

test('有絲分裂（2n = 6）：G1 每個細胞 6 條染色體、2C；S 期 DNA 由 2C 連續增加到 4C、染色體數不變；後期 12 條；兩個子細胞各 6 條、2C', () => {
  const r = C.make({ mode: 'mitosis', n: 3, seed: 1 });
  let c = cellsAt(r, 'G1', 0.5); assert.strictEqual(c.length, 1); assert.strictEqual(c[0].chrom, 6); close(c[0].dna, 2, 1e-12);
  c = cellsAt(r, 'S', 0.5); assert.strictEqual(c[0].chrom, 6); close(c[0].dna, 3, 1e-12, 'S 期中點');
  c = cellsAt(r, 'G2', 0.5); assert.strictEqual(c[0].chrom, 6); assert.strictEqual(c[0].chromatids, 12); close(c[0].dna, 4, 1e-12);
  c = cellsAt(r, 'meta', 0.5); assert.strictEqual(c[0].chrom, 6); close(c[0].dna, 4, 1e-12);
  c = cellsAt(r, 'ana', 0.5); assert.strictEqual(c[0].chrom, 12, '後期著絲點分開'); close(c[0].dna, 4, 1e-12);
  c = cellsAt(r, 'telo', 1); assert.strictEqual(c.length, 2);
  c.forEach(x => { assert.strictEqual(x.chrom, 6); assert.strictEqual(x.chromatids, 6); close(x.dna, 2, 1e-12); });
});

test('有絲分裂的子細胞與親代完全相同：每對同源染色體各一條、沒有互換', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const r = C.make({ mode: 'mitosis', n: 4, seed });
    assert.strictEqual(r.xo.length, 0);
    r.gametes.forEach(g => {
      for (let p = 0; p < 4; p++) {
        const hs = g.filter(q => q.p === p).map(q => q.h).sort().join('');
        assert.strictEqual(hs, '01', '第 ' + p + ' 對');
      }
    });
  }
});

test('減數分裂（2n = 4）：第一次分裂後每個細胞 n = 2 條、仍是 2C；後期 II 暫時 4 條；四個配子各 2 條、1C', () => {
  const r = C.make({ mode: 'meiosis', n: 2, seed: 3 });
  let c = cellsAt(r, 'pro1', 0.5); assert.strictEqual(c[0].chrom, 4); close(c[0].dna, 4, 1e-12);
  c = cellsAt(r, 'pro2', 0.5); assert.strictEqual(c.length, 2);
  c.forEach(x => { assert.strictEqual(x.chrom, 2); assert.strictEqual(x.chromatids, 4); close(x.dna, 2, 1e-12); });
  c = cellsAt(r, 'ana2', 0.5); c.forEach(x => { assert.strictEqual(x.chrom, 4); close(x.dna, 2, 1e-12); });
  c = cellsAt(r, 'telo2', 1); assert.strictEqual(c.length, 4);
  c.forEach(x => { assert.strictEqual(x.chrom, 2); assert.strictEqual(x.chromatids, 2); close(x.dna, 1, 1e-12); });
});

test('DNA 守恆：每一刻所有細胞的 DNA 總量 = 2C（複製前）或 4C（複製後），染色分體總數 = 2n 或 4n', () => {
  ['mitosis', 'meiosis'].forEach(mode => {
    const r = C.make({ mode, n: 3, seed: 7, nd: mode === 'meiosis' ? 1 : 0 });
    const T = C.total(mode);
    for (let t = 0; t <= T; t += 0.05) {
      const k = C.counts(r, t);
      const dna = k.cells.reduce((a, x) => a + x.dna, 0), ct = k.cells.reduce((a, x) => a + x.chromatids, 0);
      close(dna, 2 + 2 * k.replicated, 1e-9, mode + ' t=' + t.toFixed(2));
      assert.strictEqual(ct, k.replicated > 0 ? 12 : 6);
    }
  });
});

test('每個配子的每一對同源染色體剛好一條（沒有不分離時），而且減數分裂的兩次分裂後四個配子合起來 = 四條分體各一', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const r = C.make({ mode: 'meiosis', n: 3, seed });
    assert.strictEqual(r.gametes.length, 4);
    r.gametes.forEach(g => { for (let p = 0; p < 3; p++) assert.strictEqual(g.filter(q => q.p === p).length, 1); });
    const all = [].concat.apply([], r.gametes).map(q => q.p + '' + q.h + q.s).sort();
    assert.strictEqual(new Set(all).size, 12);
  }
});

test('第一次分裂分開的是同源染色體：同一個次級細胞裡的兩條姊妹分體來自同一條（著絲點處同源）', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const r = C.make({ mode: 'meiosis', n: 3, seed });
    for (let p = 0; p < 3; p++) for (let h = 0; h < 2; h++)
      assert.strictEqual(r.dest.d1[r.idx(p, h, 0)], r.dest.d1[r.idx(p, h, 1)]);
    for (let p = 0; p < 3; p++) assert.notStrictEqual(r.dest.d1[r.idx(p, 0, 0)], r.dest.d1[r.idx(p, 1, 0)]);
  }
});

test('不分離：第一次分裂不分離 → 四個配子 n+1、n+1、n−1、n−1；第二次分裂不分離 → n、n、n+1、n−1', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const a = C.make({ mode: 'meiosis', n: 3, nd: 1, ndPair: 1, seed }).gametes.map(g => g.length).sort().join(',');
    assert.strictEqual(a, '2,2,4,4');
    const b = C.make({ mode: 'meiosis', n: 3, nd: 2, ndPair: 1, seed }).gametes.map(g => g.length).sort().join(',');
    assert.strictEqual(b, '2,3,3,4');
    const r = C.make({ mode: 'meiosis', n: 3, nd: 1, ndPair: 1, seed });
    r.gametes.forEach(g => { assert.ok([0, 2].includes(g.filter(q => q.p === 1).length)); });
    const r2 = C.make({ mode: 'meiosis', n: 3, nd: 2, ndPair: 1, seed, xo: false });
    const two = r2.gametes.find(g => g.filter(q => q.p === 1).length === 2).filter(q => q.p === 1);
    assert.strictEqual(two[0].h, two[1].h, '第二次分裂不分離：多出來的是姊妹分體（同一來源）');
    const r1 = C.make({ mode: 'meiosis', n: 3, nd: 1, ndPair: 1, seed, xo: false });
    const g4 = r1.gametes.find(g => g.filter(q => q.p === 1).length === 2).filter(q => q.p === 1);
    assert.notStrictEqual(g4[0].h, g4[1].h, '第一次分裂不分離：多出來的是同源染色體（一母一父）');
  }
});

test('獨立分配：n 對、沒有互換時，配子在著絲點處的來源組合每種機率 2^−n（卡方檢定），n = 3 時 8 種都出現', () => {
  const N = 4000, cnt = {};
  const R = C.rng(11);
  for (let i = 0; i < N; i++) {
    const r = C.make({ mode: 'meiosis', n: 3, xo: false, seed: Math.floor(R() * 4e9) + 1 });
    const g = r.gametes[0];
    const k = C.originPattern(g, 3); cnt[k] = (cnt[k] || 0) + 1;
  }
  assert.strictEqual(Object.keys(cnt).length, 8);
  let chi = 0; Object.values(cnt).forEach(o => { chi += (o - N / 8) * (o - N / 8) / (N / 8); });
  assert.ok(chi < 24.3, '卡方 ' + chi.toFixed(2) + '（自由度 7、p = 0.001 的臨界值 24.3）');
  close(C.expectDistinct(3, 1e6), 8, 1e-9);
  close(C.expectDistinct(23, 1), 1, 1e-9);
  assert.strictEqual(Math.pow(2, 23), 8388608, '人類 2^23 ≈ 838 萬種');
});

test('互換：交叉的數目平均每 Morgan 2 個（卜瓦松），重組率符合 Haldane 作圖函數 r = (1 − e^(−2d))/2', () => {
  [0.05, 0.2, 0.5, 1.5].forEach(d => {
    const b = C.batch({ d, n: 1, N: 6000, seed: 21 });
    const r = b.rec / b.total, ci = C.wilson(b.rec, b.total);
    const h = C.haldane(d);
    assert.ok(h >= ci[0] - 0.005 && h <= ci[1] + 0.005, `d = ${d}：模擬 ${r.toFixed(4)}（${ci[0].toFixed(3)}–${ci[1].toFixed(3)}），Haldane ${h.toFixed(4)}`);
    close(b.counts.Ab, b.counts.aB, 0.04 * b.total, '兩種重組型一樣多');
    close(b.counts.AB, b.counts.ab, 0.04 * b.total, '兩種親代型一樣多');
  });
  let s = 0; const R = C.rng(3); for (let i = 0; i < 50000; i++) s += C.poisson(1.6, R);
  close(s / 50000, 1.6, 0.03, '卜瓦松平均');
});

test('Haldane 函數：d 很小時 r ≈ d；r 永遠 < 50%；反函數互逆', () => {
  close(C.haldane(0.01), 0.01, 0.0002);
  close(C.haldane(10), 0.5, 1e-8);
  assert.ok(C.haldane(3) < 0.5);
  [0.01, 0.1, 0.3, 0.45].forEach(r => close(C.haldane(C.haldaneInv(r)), r, 1e-12));
  assert.strictEqual(C.haldaneInv(0.5), Infinity);
  assert.strictEqual(C.haldane(0), 0);
});

test('互換只交換非姊妹分體的對應片段：每條分體的片段首尾相接覆蓋 0–1，同一位置上母方與父方各兩條', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const r = C.make({ mode: 'meiosis', n: 2, seed, lengths: [2.5, 1] });
    r.chromatids.forEach(segs => {
      close(segs[0].a, 0, 1e-12); close(segs[segs.length - 1].b, 1, 1e-12);
      for (let i = 1; i < segs.length; i++) { close(segs[i].a, segs[i - 1].b, 1e-12); assert.notStrictEqual(segs[i].o, segs[i - 1].o); }
    });
    for (let p = 0; p < 2; p++) for (const x of [0.05, 0.3, 0.61, 0.97]) {
      // 著絲點那一段的來源 = 這條分體的身分 h（決定它往哪一極走）
      [0, 1].forEach(h => [0, 1].forEach(sI => assert.strictEqual(C.originAt(r.chromatids[r.idx(p, h, sI)], r.cens[p]), h, '著絲點')));
      const os = [0, 1].flatMap(h => [0, 1].map(s => C.originAt(r.chromatids[r.idx(p, h, s)], x)));
      assert.strictEqual(os.reduce((a, b) => a + b, 0), 2, '位置 ' + x);
    }
  }
});

test('相引相：沒有互換時配子只有 AB 與 ab；有互換時才會出現 Ab、aB', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const r = C.make({ mode: 'meiosis', n: 2, xo: false, seed });
    r.gametes.forEach(g => assert.ok(['AB', 'ab'].includes(C.genotype(g))));
  }
  let rec = 0;
  for (let seed = 1; seed <= 200; seed++) rec += C.make({ mode: 'meiosis', n: 2, seed }).gametes.filter(g => C.isRecombinant(C.genotype(g))).length;
  assert.ok(rec > 0);
});

test('時間軸與畫面：所有時刻的座標都是有限數；中期 I 二價體排在赤道兩側、中期 II 染色體排在赤道上；後期往各自的極移動', () => {
  ['mitosis', 'meiosis'].forEach(mode => {
    const r = C.make({ mode, n: 3, seed: 5, nd: mode === 'meiosis' ? 2 : 0 });
    const T = C.total(mode);
    for (let t = 0; t <= T + 1e-9; t += 0.03) {
      const f = C.frame(r, t);
      f.chromatids.forEach(q => { ['x', 'y', 'y3', 'z', 'ang', 'len', 'cond', 'rep'].forEach(k => assert.ok(isFinite(q[k]), mode + ' ' + k + ' t=' + t.toFixed(2))); });
      f.cells.forEach(c => assert.ok(c.r > 0));
    }
  });
  const r = C.make({ mode: 'meiosis', n: 3, seed: 9 });
  const m1 = C.frame(r, at('meiosis', 'meta1', 0.99));
  m1.chromatids.forEach(q => { const side = r.dest.d1[q.c] ? 1 : -1; assert.ok(q.x * side > 0 && Math.abs(q.x) < 0.12); });
  const a1 = C.frame(r, at('meiosis', 'ana1', 0.99));
  a1.chromatids.forEach(q => { assert.ok(Math.abs(q.x) > 0.5); });
  const m2 = C.frame(r, at('meiosis', 'meta2', 0.99));
  m2.chromatids.forEach(q => assert.ok(Math.abs(q.y) < 0.03));
  const mm = C.make({ mode: 'mitosis', n: 3, seed: 9 });
  const ma = C.frame(mm, at('mitosis', 'meta', 0.5));
  ma.chromatids.forEach(q => assert.ok(Math.abs(q.x) < 0.04));
});

test('時期：stageAt 依序走過每一期，總長 = 各期加總；超過結尾停在末期', () => {
  ['mitosis', 'meiosis'].forEach(mode => {
    const st = C.STAGES[mode];
    st.forEach((s, i) => { assert.strictEqual(C.stageAt(mode, C.stageStart(mode, i) + s.d / 2).k, s.k); });
    const e = C.stageAt(mode, C.total(mode) + 5);
    assert.strictEqual(e.k, st[st.length - 1].k); assert.strictEqual(e.f, 1);
  });
});

console.log(`  ${passed} 項通過`);
