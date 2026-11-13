/* 協和與不協和：數學核心的單元測試。用法：node tests/consonance-core.test.js */
'use strict';
const C = require('../js/consonance-core.js');
const M = require('../js/music-theory.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
const F0 = C.F1_DEFAULT;
const H6 = { mode: 'harmonic', n: 6, p: 1 };
const cents = C.cents;
const vOf = (f1, t) => C.valleys(C.curve(f1, t));
const has = (vs, c, tol) => vs.some(v => Math.abs(v.cents - c) <= (tol || 0.5));

test('預設下方音 C4 = 261.6256 Hz（A4 = 440 Hz 往下 9 個半音）；頻率比上限 2.3 = 1441.97 音分', function () {
  near(F0, 440 * Math.pow(2, -9 / 12), 1e-9);
  near(C.C_MAX, 1200 * Math.log2(2.3), 1e-9);
  near(C.fromCents(C.cents(1.5)), 1.5, 1e-12, '音分換算互逆');
});

test('音色：純音只有基頻；泛音第 k 個在 k·f、振幅 k^(−p)；奇次只留 1、3、5…；拉伸泛音在 k^s·f', function () {
  ok(C.partials({ mode: 'pure', n: 8 }).length === 1, '純音一個成分');
  const h = C.partials({ mode: 'harmonic', n: 4, p: 2 });
  ok(h.map(x => x.rho).join() === '1,2,3,4', '整數倍');
  near(h[2].a, 1 / 9, 1e-12, '第 3 泛音振幅 1/9');
  ok(C.partials({ mode: 'harmonic', n: 4, odd: true }).map(x => x.k).join() === '1,3,5,7', '奇次');
  const s = C.partials({ mode: 'stretched', n: 3, s: 1.1 });
  near(s[1].rho, Math.pow(2, 1.1), 1e-12, '第 2 成分 2^1.1');
  const z = C.normTimbre({ mode: 'x', n: 99, p: -3, s: 5 });
  ok(z.mode === 'harmonic' && z.n === 10 && z.p === 0 && z.s === 1.2, '超出範圍的參數被限制住');
});

test('分解計算和直接計算完全相等：曲線上的每一點 = MusicTheory.dissonance（兩個音所有成分合在一起）', function () {
  for (const t of [H6, { mode: 'stretched', n: 7, p: 0.5, s: 0.93 }, { mode: 'harmonic', n: 5, p: 1, odd: true }, { mode: 'pure' }]) {
    const cv = C.curve(330, t);
    for (const i of [0, 37, 386, 702, 1200, 1441]) {
      const r = C.fromCents(cv.c[i]), P = C.partials(t);
      near(cv.d[i], M.dissonance(C.spectrum(330, P).concat(C.spectrum(330 * r, P))), 1e-9, t.mode + ' 音分 ' + cv.c[i]);
    }
  }
});

test('同度恆等式：r = 1 時重合的成分不貢獻，D(1) = 4 × 一個音自己的內部不協和度', function () {
  for (const t of [H6, { mode: 'harmonic', n: 10, p: 0.3 }, { mode: 'stretched', n: 6, p: 1, s: 1.1 }]) {
    const P = C.partials(t), I = M.dissonance(C.spectrum(F0, P));
    near(C.dyad(F0, 1, t), 4 * I, 1e-9, t.mode);
  }
  near(C.dyad(F0, 1, { mode: 'pure' }), 0, 1e-15, '純音同度 = 0');
});

test('純音：曲線只有一個山（除了 r = 1 沒有谷），山頂在 Δf* = ln(b2/b1)/((b2 − b1)s)，約是臨界頻帶的 1/5 到 1/4', function () {
  for (const f of [110, F0, 440, 880]) {
    const cv = C.curve(f, { mode: 'pure' });
    ok(C.valleys(cv).length === 0, f + ' Hz 不應有谷');
    let peaks = 0;
    for (let i = 1; i < cv.d.length - 1; i++) if (cv.d[i] > cv.d[i - 1] && cv.d[i] >= cv.d[i + 1]) peaks++;
    ok(peaks === 1, f + ' Hz 只有一個山，得到 ' + peaks);
    const pm = C.pureMax(f);
    near(pm.df, M.maxDissonanceGap(f), 1e-12);
    near(f * (C.fromCents(cv.cmax) - 1), pm.df, f * 0.0012, f + ' Hz 取樣的山頂（1 音分精度）');
    // 解析：山頂兩側導數為 0
    const g = x => M.dissonancePair(f, 1, f + x, 1);
    ok(g(pm.df) > g(pm.df - 0.01) && g(pm.df) > g(pm.df + 0.01), '真的是最大值');
    const ratio = pm.df / C.criticalBand(f + pm.df / 2);
    ok(ratio > 0.18 && ratio < 0.27, f + ' Hz：Δf*/CB = ' + ratio.toFixed(3));
  }
});

test('純音：頻率差到一個臨界頻帶時 D 已降到最大值的 15% 以下，再遠就趨近 0（高音區的三全音、八度都幾乎是 0）', function () {
  for (const f of [110, F0, 440, 880]) {
    let df = 20; for (let k = 0; k < 60; k++) df = C.criticalBand(f + df / 2); // Δf = CB（中心頻率）的固定點
    const d = M.dissonancePair(f, 1, f + df, 1), dm = C.pureMax(f).d;
    ok(d / dm < 0.15, f + ' Hz：' + (d / dm).toFixed(3));
  }
  ok(C.dyad(880, Math.SQRT2, { mode: 'pure' }) / C.pureMax(880).d < 0.01, 'A5 的三全音 < 1%');
  ok(C.dyad(880, 2, { mode: 'pure' }) / C.pureMax(880).d < 1e-4, 'A5 的八度 ≈ 0');
});

test('臨界頻帶（Zwicker & Terhardt 1980）：100 Hz 約 100.7、1 kHz 約 162 Hz，隨頻率單調增加', function () {
  near(C.criticalBand(100), 100.72, 0.05);
  near(C.criticalBand(1000), 162.2, 0.2);
  let last = 0;
  for (let f = 50; f <= 5000; f += 50) { const b = C.criticalBand(f); ok(b > last, '單調'); last = b; }
});

test('6 個泛音（振幅 1/k）：1 到 2 之間剛好 6 個谷，就在 6/5、5/4、4/3、3/2、5/3、2/1（誤差 < 0.01 音分）', function () {
  const vs = vOf(F0, H6).filter(v => v.cents <= 1200.001);
  ok(vs.length === 6, '谷的數目 ' + vs.length);
  [[6, 5], [5, 4], [4, 3], [3, 2], [5, 3], [2, 1]].forEach(function (pq, i) {
    near(vs[i].cents, cents(pq[0] / pq[1]), 0.01, pq.join('/'));
    ok(vs[i].simple.p === pq[0] && vs[i].simple.q === pq[1] && vs[i].named, '最簡整數比 ' + pq.join('/'));
  });
  // 越簡單的比值，谷越深（顯著程度）：八度 > 五度 > 四度
  ok(vs[5].prom > vs[3].prom && vs[3].prom > vs[2].prom, '2/1 > 3/2 > 4/3 的谷深');
});

test('谷底的位置就是泛音重合的地方：在 3/2，下方音第 3 泛音 = 上方音第 2 泛音（拍頻 0），D 呈尖角', function () {
  const pr = C.pairs(F0, 1.5, H6);
  const p32 = pr.find(p => p.i === 3 && p.j === 2);
  near(p32.beat, 0, 1e-9);
  near(p32.d, 0, 1e-12);
  const d0 = C.dyad(F0, 1.5, H6), dl = C.dyad(F0, C.fromCents(701.955 - 0.5), H6), dr = C.dyad(F0, C.fromCents(701.955 + 0.5), H6);
  ok(dl > d0 && dr > d0, '兩邊都比較高');
});

test('泛音越多，谷越多：1 到 2 之間的谷數 n = 1…10 不會變少，n = 10 比 n = 2 多 10 個以上', function () {
  const counts = [];
  for (let n = 1; n <= 10; n++) counts.push(vOf(F0, { mode: 'harmonic', n: n, p: 1 }).filter(v => v.cents <= 1200.001).length);
  for (let i = 1; i < counts.length; i++) ok(counts[i] >= counts[i - 1], 'n = ' + (i + 1) + '：' + counts.join(','));
  ok(counts[0] === 0, '一個泛音就是純音：沒有谷');
  ok(counts[9] - counts[1] >= 10, counts.join(','));
});

test('7/4（自然七度）的谷要有第 7 個泛音才出現；10/9 的谷要 10 個泛音', function () {
  ok(!has(vOf(F0, { mode: 'harmonic', n: 6, p: 1 }), cents(7 / 4), 1), 'n = 6 沒有');
  ok(has(vOf(F0, { mode: 'harmonic', n: 7, p: 1 }), cents(7 / 4), 0.05), 'n = 7 有');
  ok(!has(vOf(F0, { mode: 'harmonic', n: 9, p: 0 }), cents(10 / 9), 1), 'n = 9 沒有 10/9');
  ok(has(vOf(F0, { mode: 'harmonic', n: 10, p: 0 }), cents(10 / 9), 0.05), 'n = 10、p = 0 有 10/9');
});

test('拉伸泛音：所有谷一起乘上 s（音分），「八度」的谷移到 2^s；s = 1.1 時在 2^1.1 = 2.1435', function () {
  const base = vOf(F0, H6);
  const st = vOf(F0, { mode: 'stretched', n: 6, p: 1, s: 1.1 });
  ok(st.length === base.length, '谷數一樣');
  st.forEach((v, i) => near(v.cents, 1.1 * base[i].cents, 0.01, '第 ' + (i + 1) + ' 個谷'));
  near(st[st.length - 1].r, Math.pow(2, 1.1), 1e-5, '拉伸的八度');
  ok(!has(st, 1200, 5), '2:1 不再是谷');
  // s = 700/701.955 時，平均律的五度（700 音分）變成谷底
  const s = 700 / cents(1.5);
  ok(has(vOf(F0, { mode: 'stretched', n: 6, p: 1, s: s }), 700, 0.01), '平均律五度變成谷');
});

test('只留奇次泛音（像單簧管）：五度 3/2 的谷消失，5/3 與 7/5 的谷還在', function () {
  for (const n of [3, 4, 5, 6, 8, 10]) {
    const vs = vOf(F0, { mode: 'harmonic', n: n, p: 1, odd: true });
    ok(!has(vs, cents(1.5), 3), 'n = ' + n + ' 不應在 3/2 有谷：' + vs.map(v => v.cents.toFixed(1)).join(' '));
    ok(has(vs, cents(5 / 3), 0.05), 'n = ' + n + ' 的 5/3');
  }
  ok(has(vOf(F0, { mode: 'harmonic', n: 4, p: 1, odd: true }), cents(7 / 5), 0.05), '7/5');
});

test('低音區的三度變混濁：泛音較暗（p = 2）時，5/4 的谷在 440 Hz 還在、261.63 Hz 已經消失（中間有一個臨界頻率）', function () {
  const t = { mode: 'harmonic', n: 6, p: 2 };
  ok(has(vOf(440, t), cents(1.25), 0.05), '440 Hz 有');
  ok(!has(vOf(F0, t), cents(1.25), 3), '261.63 Hz 沒有');
  let lo = F0, hi = 440;
  for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (has(vOf(m, t), cents(1.25), 0.05)) hi = m; else lo = m; }
  ok(hi - lo < 0.01 && hi > 300 && hi < 350, '臨界 ≈ ' + hi.toFixed(2) + ' Hz');
  ok(has(vOf(110, { mode: 'harmonic', n: 6, p: 1 }), cents(1.25), 0.05), '泛音亮（p = 1）時 110 Hz 還有');
});

test('最接近的音程與最簡整數比：400 音分是大三度（比純律 5/4 寬 13.69）；1.5 → 3/2；2^(1/3) 的最佳近似是 5/4', function () {
  const iv = C.nearestInterval(400);
  ok(iv.semis === 4 && iv.p === 5 && iv.q === 4, '大三度');
  near(iv.justDev, 400 - cents(1.25), 1e-9);
  near(iv.etDev, 0, 1e-12);
  ok(C.nearestInterval(1404).short === 'M9' && C.nearestInterval(1310).short === 'm9', '九度');
  const s = C.nearestSimple(1.5, 10); ok(s.p === 3 && s.q === 2 && Math.abs(s.err) < 1e-9, '3/2');
  const t = C.nearestSimple(Math.pow(2, 1 / 3), 10); ok(t.p === 5 && t.q === 4, '5/4'); near(t.err, 13.686, 0.001);
  ok(C.ratioName(7, 4).zh === '自然七度' && C.ratioName(3, 2).zh === '完全五度' && C.ratioName(13, 11) === null, '名稱');
});

test('三音和弦：分解計算的曲面 = 直接計算，而且對 r1、r2 對稱', function () {
  const t = { mode: 'harmonic', n: 5, p: 0.7 }, g = C.chordGrid(300, t, 24, 1200);
  for (const [i, j] of [[0, 0], [3, 17], [17, 3], [12, 24], [24, 24], [8, 14]]) {
    const v = g.z[i * 25 + j];
    near(v, C.chord(300, C.fromCents(i * 50), C.fromCents(j * 50), t), 1e-9, '(' + i + ',' + j + ')');
    near(v, g.z[j * 25 + i], 1e-12, '對稱');
  }
  // 第三個音和下方音同度時，D3 = 兩個音的 D + 多出來那個音自己的內部 + 它和另外兩個音之間（重合的成分貢獻 0）
  const P = C.partials(t), A = C.spectrum(300, P), B = C.spectrum(450, P), I = M.dissonance(A);
  near(C.chord(300, 1, 1.5, t), C.dyad(300, 1.5, t) + I + (I * 2) + C.cross(A, B), 1e-9, '同度的第三個音');
});

test('三音和弦的盆地：大三和弦 4:5:6、小三和弦 10:12:15、3:4:5 都是盆地底；大三和弦比小三和弦協和', function () {
  const maj = C.basin(F0, cents(1.25) + 3, cents(1.5) - 2, H6);
  ok(maj.converged && Math.abs(maj.c1 - cents(1.25)) < 1 && Math.abs(maj.c2 - cents(1.5)) < 1, '大三和弦 ' + maj.c1.toFixed(2) + ',' + maj.c2.toFixed(2));
  const min = C.basin(F0, cents(1.2) - 2, cents(1.5) + 2, H6);
  ok(min.converged && Math.abs(min.c1 - cents(1.2)) < 1 && Math.abs(min.c2 - cents(1.5)) < 1, '小三和弦');
  const t345 = C.basin(F0, cents(4 / 3), cents(5 / 3), H6);
  ok(t345.converged && t345.steps <= 1, '3:4:5');
  ok(C.chord(F0, 1.25, 1.5, H6) < C.chord(F0, 1.2, 1.5, H6), '大三 < 小三');
  const a = C.analyzeChord({ f1: F0, r1: 1.25, r2: 1.5, timbre: H6 });
  ok(a.atBasin, 'analyzeChord 判定在盆地');
  ok(!C.analyzeChord({ f1: F0, r1: C.fromCents(100), r2: C.fromCents(900), timbre: H6 }).atBasin, '預設和弦（100、900 音分）不是盆地');
});

test('拍：包絡最大 a1 + a2、最小 |a1 − a2|、週期 1/拍頻；pairs 的拍頻 = |i·f1 − j·f2|', function () {
  near(C.envelope(1, 0.5, 4, 0), 1.5, 1e-12);
  near(C.envelope(1, 0.5, 4, 0.125), 0.5, 1e-12);
  near(C.envelope(1, 0.5, 4, 0.25), 1.5, 1e-12);
  const pr = C.pairs(200, 1.01, { mode: 'pure' });
  ok(pr.length === 1, '純音只有一對'); near(pr[0].beat, 2, 1e-9, '200 Hz 與 202 Hz 拍 2 次');
  const a = C.analyze({ f1: 250, r: 1.004, timbre: { mode: 'pure' } });
  near(a.beat, 1, 1e-9, '250 Hz 與 251 Hz：每秒 1 次');
});

test('analyze：預設狀態（泛音 6 個、C4、平均律小二度）很刺耳但不在谷底；最大的一對是兩個基頻', function () {
  const a = C.analyze({ f1: F0, r: C.fromCents(100), timbre: H6 });
  ok(!a.atValley && a.pair[0] === 1 && a.pair[1] === 1, '不在谷底');
  ok(a.D / a.Dmax > 0.95, 'D 接近曲線最大值：' + (a.D / a.Dmax).toFixed(3));
  ok(a.count12 === 6 && a.valleys.length === 6, '谷數');
  ok(a.key === 'harmonic|6|1.00|0@261.63', a.key);
});

console.log(`\n${pass} 項通過，${fail} 項失敗`);
if (fail) process.exit(1);
