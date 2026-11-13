/* 音程與頻率比：數學核心的單元測試。用法：node tests/intervals-core.test.js */
'use strict';
const I = require('../js/intervals-core.js');
const M = require('../js/music-theory.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || '') + ' 得到 ' + JSON.stringify(a) + '，應為 ' + JSON.stringify(b)); }
const N = I.parseNote;
const iv = function (a, b) { return I.between(N(a), N(b)); };
const an = function (lo, n, q, tuning, chain) { return I.analyze({ lo: N(lo), n: n, q: q, tuning: tuning || 'just', chain: chain || null }); };
/** 所有下方音（7 個字母 × 升降 −1…+1） */
const LOWERS = [];
for (let L = 0; L < 7; L++) for (let a = -1; a <= 1; a++) LOWERS.push(I.note(L, a, 4));

test('音名與頻率：C4 = MIDI 60 = 261.626 Hz，A4 = 440 Hz，C♯4 與 D♭4 同一個鍵、不同拼寫', function () {
  eq(N('C4').midi, 60); near(I.freqOf(N('C4')), 261.6256, 1e-3); near(I.freqOf(N('A4')), 440, 1e-9);
  eq(N('C♯4').midi, N('D♭4').midi); ok(N('C♯4').d !== N('D♭4').d, '五線譜位置應不同');
  eq(N('Bbb3').name, 'B♭♭'); eq(N('F##5').midi, 79); eq(N('B♯4').midi, 72); eq(N('C♭4').midi, 59);
});

test('C–G：完全五度、7 個半音、純律 3/2 = 701.955 音分、平均律 700 音分', function () {
  const A = an('C4', 5, 'P');
  eq(A.hi.full, 'G4'); eq(A.semis, 7); eq(A.ratio, [3, 2]); near(A.centsJ, 701.955, 1e-3); eq(A.centsE, 700);
  eq(I.name(5, 'P', 'zh'), '完全五度'); eq(I.name(5, 'P', 'en'), 'perfect fifth');
  eq(iv('C4', 'G4'), { n: 5, q: 'P', semis: 7, short: 'P5' });
});

test('C–E♭ 是小三度、C–D♯ 是增二度：同樣 3 個半音，名字不同', function () {
  const a = iv('C4', 'E♭4'), b = iv('C4', 'D♯4');
  eq(a.short, 'm3'); eq(b.short, 'A2'); eq(a.semis, 3); eq(b.semis, 3);
  eq(I.name(2, 'A', 'zh'), '增二度'); eq(I.name(3, 'm', 'zh'), '小三度');
  eq(I.justRatio(3, 'm'), [6, 5]); eq(I.justRatio(2, 'A'), [75, 64]);
  near(I.cents(6 / 5) - I.cents(75 / 64), I.cents(128 / 125), 1e-9, '小三度與增二度在純律差一個小迪耶西斯');
});

test('拼寫：每個下方音、每個度數與性質，上方音再量回來都得到同一個音程', function () {
  let n = 0;
  LOWERS.forEach(function (lo) {
    for (let k = 1; k <= 15; k++) I.allowedQualities(k).forEach(function (q) {
      const hi = I.upperOf(lo, k, q);
      if (!hi) return;
      const b = I.between(lo, hi);
      if (b.n !== k || b.q !== q || b.semis !== I.semisOf(k, q)) throw new Error(lo.full + ' + ' + q + k + ' → ' + hi.full + ' 量回來是 ' + JSON.stringify(b));
      ok(hi.d - lo.d === k - 1, '字母相差 ' + (k - 1) + ' 格');
      n++;
    });
  });
  ok(n > 1000, '檢查了 ' + n + ' 組');
});

test('常見的拼寫：E–C 小六度、B–F 減五度、F–B 增四度、B♭–D♭ 小三度、A–C♯ 大三度、E♭–A 增四度', function () {
  eq(iv('E4', 'C5').short, 'm6'); eq(iv('B4', 'F5').short, 'd5'); eq(iv('F4', 'B4').short, 'A4');
  eq(iv('B♭4', 'D♭5').short, 'm3'); eq(iv('A4', 'C♯5').short, 'M3'); eq(iv('E♭4', 'A4').short, 'A4');
  eq(iv('C4', 'C♯4').short, 'A1'); eq(iv('C4', 'D♭♭4').short, 'd2'); eq(iv('C4', 'E5').short, 'M10');
  eq(I.between(N('E4'), N('C4')), null, '上方音在下方音之下時沒有音程');
});

test('大、小、完全音程的純律比值和 music-theory.js 的 INTERVALS 一致（增四度 45/32）', function () {
  const map = { 0: [1, 'P'], 1: [2, 'm'], 2: [2, 'M'], 3: [3, 'm'], 4: [3, 'M'], 5: [4, 'P'], 6: [4, 'A'], 7: [5, 'P'], 8: [6, 'm'], 9: [6, 'M'], 10: [7, 'm'], 11: [7, 'M'], 12: [8, 'P'] };
  M.INTERVALS.forEach(function (x) {
    const m = map[x.semis];
    eq(I.justRatio(m[0], m[1]), x.ratio, x.zh);
    eq(I.semisOf(m[0], m[1]), x.semis, x.zh + ' 的半音數');
  });
});

test('音分 = 1200 × log2(比)：八度 1200、半音（平均律）100、純律大三度 386.314', function () {
  near(I.cents(2), 1200, 1e-12); near(I.cents(Math.pow(2, 1 / 12)), 100, 1e-9); near(I.cents(5 / 4), 386.3137, 1e-4);
  near(I.cents(5 / 4) - 400, -13.686, 1e-3, '純律大三度比平均律低');
});

test('比值相乘 = 音分相加：5/4 × 6/5 = 3/2（大三 + 小三 = 完全五度）、3/2 × 4/3 = 2', function () {
  eq(I.mul([5, 4], [6, 5]), [3, 2]); eq(I.mul([3, 2], [4, 3]), [2, 1]);
  near(I.cents(5 / 4) + I.cents(6 / 5), I.cents(3 / 2), 1e-9);
  const s = I.stack(N('C4'), [{ n: 3, q: 'M' }, { n: 3, q: 'm' }]);
  eq(s.total.short, 'P5'); eq(s.prod, [3, 2]); near(s.centsJ, 701.955, 1e-3); eq(s.notes.map(function (x) { return x.full; }), ['C4', 'E4', 'G4']);
  const s2 = I.stack(N('C4'), [{ n: 5, q: 'P' }, { n: 4, q: 'P' }]);
  eq(s2.total.short, 'P8'); eq(s2.prod, [2, 1]); eq(s2.tableDiff, 0);
});

test('轉位：大三度 ↔ 小六度、完全四度 ↔ 完全五度、增四度 ↔ 減五度；度數相加 9、半音相加 12', function () {
  eq(I.invert(3, 'M'), { n: 6, q: 'm' }); eq(I.invert(4, 'P'), { n: 5, q: 'P' }); eq(I.invert(4, 'A'), { n: 5, q: 'd' });
  eq(I.invert(1, 'P'), { n: 8, q: 'P' }); eq(I.invert(10, 'M'), { n: 6, q: 'm' }, '複音程先化成單音程');
  for (let k = 1; k <= 8; k++) I.allowedQualities(k).forEach(function (q) {
    const v = I.invert(k, q);
    if (k === 8 && q === 'A') return;     // 增八度的轉位是減一度
    ok(k + v.n === 9, q + k + ' 度數相加');
    ok(I.semisOf(k, q) + I.semisOf(v.n, v.q) === 12, q + k + ' 半音相加');
  });
});

test('轉位相乘：表上每一對都剛好是 2，只有大二度 9/8 × 小七度 9/5 = 2 × 81/80', function () {
  const odd = [];
  for (let k = 1; k <= 8; k++) I.allowedQualities(k).forEach(function (q) {
    if (k === 8 && q === 'A') return;
    const A = an('C4', k, q);
    if (!A.inv.prodTwo) odd.push(q + k + '：' + I.fstr(A.inv.prod));
  });
  eq(odd, ['M2：81/40', 'm7：81/40']);
  const A = an('C4', 2, 'M');
  eq(A.inv.prodComma.r, [81, 80]); near(A.inv.prodComma.cents, 21.506, 1e-3);
});

test('增四度與減五度：平均律都是 600 音分；純律 45/32 = 590.22 與 64/45 = 609.78，差 2048/2025', function () {
  eq(I.centsOf(4, 'A', 'equal'), 600); eq(I.centsOf(5, 'd', 'equal'), 600);
  near(I.centsOf(4, 'A', 'just'), 590.224, 1e-3); near(I.centsOf(5, 'd', 'just'), 609.776, 1e-3);
  const A = an('C4', 4, 'A');
  eq(A.enh.map(function (e) { return e.short; }), ['d5']);
  eq(A.enh[0].comma.r, [2048, 2025]); near(A.enh[0].diffJ, 19.553, 1e-3);
  eq(I.respell(N('C4'), 4, 'A').short, 'd5'); eq(I.respell(N('C4'), 5, 'd').short, 'A4');
});

test('等音程：八度有三個名字（增七度、完全八度、減九度），「等音」按鈕輪流換', function () {
  eq(I.enharmonics(8, 'P').map(function (e) { return e.short; }), ['A7', 'd9']);
  let x = { n: 8, q: 'P' }; const seen = [];
  for (let k = 0; k < 3; k++) { x = I.respell(N('C4'), x.n, x.q); seen.push(x.short); }
  eq(seen, ['d9', 'A7', 'P8']);
  eq(I.respell(N('C4'), 3, 'm').short, 'A2'); eq(I.respell(N('C4'), 2, 'A').short, 'm3');
});

test('疊兩個大三度 = 增五度 25/16，比純律小六度 8/5 小一個小迪耶西斯 128/125 = 41.06 音分', function () {
  const s = I.stack(N('C4'), [{ n: 3, q: 'M' }, { n: 3, q: 'M' }]);
  eq(s.total.short, 'A5'); eq(s.prod, [25, 16]); eq(s.notes[2].full, 'G♯4');
  near(I.cents(8 / 5) - s.centsJ, 41.059, 1e-3);
  eq(I.commaOf(I.div([8, 5], s.prod)).r, [128, 125]);
  const A = an('C4', 6, 'm', 'just', { start: N('C4'), bricks: [{ n: 3, q: 'M' }, { n: 3, q: 'M' }] });
  near(A.chain.mainDiff, -41.059, 1e-3); eq(A.chain.mainComma.r, [128, 125]);
});

test('三個大三度回不到八度：C–E–G♯–B♯ 增七度 125/64，比八度少 41.06 音分；平均律剛好 1200', function () {
  const s = I.stack(N('C4'), [{ n: 3, q: 'M' }, { n: 3, q: 'M' }, { n: 3, q: 'M' }]);
  eq(s.total.short, 'A7'); eq(s.notes[3].full, 'B♯4'); eq(s.prod, [125, 64]); eq(s.centsE, 1200);
  near(1200 - s.centsJ, 41.059, 1e-3); eq(s.tableDiff, 0, '增七度表上就是 125/64');
});

test('兩個大二度 81/64 比大三度 5/4 高一個同音差；四個五度 81/16 比兩個八度加大三度高一個同音差', function () {
  const s = I.stack(N('C4'), [{ n: 2, q: 'M' }, { n: 2, q: 'M' }]);
  eq(s.total.short, 'M3'); eq(s.prod, [81, 64]); near(s.tableDiff, 21.506, 1e-3); eq(s.tableComma.r, [81, 80]);
  const f = I.stack(N('C4'), [{ n: 5, q: 'P' }, { n: 5, q: 'P' }, { n: 5, q: 'P' }, { n: 5, q: 'P' }]);
  eq(f.total.short, 'M17'); eq(f.prod, [81, 16]); eq(f.table, [5, 1]); eq(f.tableComma.r, [81, 80]);
  eq(f.notes.map(function (x) { return x.full; }).join(' '), 'C4 G4 D5 A5 E6');
});

test('三個小三度 = 減七度 216/125：比表上的 128/75 多同音差、比大六度 5/3 多大迪耶西斯 648/625', function () {
  const s = I.stack(N('C4'), [{ n: 3, q: 'm' }, { n: 3, q: 'm' }, { n: 3, q: 'm' }]);
  eq(s.total.short, 'd7'); eq(s.notes[3].full, 'B♭♭4'); eq(s.prod, [216, 125]); eq(s.tableComma.r, [81, 80]);
  eq(I.commaOf(I.div(s.prod, [5, 3])).r, [648, 625]); near(I.cents(648 / 625), 62.565, 1e-3);
});

test('疊音程的限制：最多 4 塊、三個八度；拼不出來（三重升降）就不能疊', function () {
  const C = N('C4');
  eq(I.canPush(C, [{ n: 8, q: 'P' }, { n: 8, q: 'P' }, { n: 8, q: 'P' }], { n: 2, q: 'm' }).ok, false);
  eq(I.canPush(C, [{ n: 8, q: 'P' }, { n: 8, q: 'P' }], { n: 8, q: 'P' }).ok, true);
  eq(I.canPush(C, [{ n: 2, q: 'm' }, { n: 2, q: 'm' }, { n: 2, q: 'm' }], { n: 2, q: 'm' }).ok, false, '四個小二度 C–D♭–E♭♭–F♭♭♭ 要三重降');
  eq(I.canPush(N('D♭4'), [{ n: 3, q: 'd' }], { n: 3, q: 'd' }).why, 'acc', 'D♭–F♭♭–A♭♭♭');
});

test('複音程：大十度 = 大三度 × 2 = 5/2；大九度 9/4；完全十五度 = 4（兩個八度）', function () {
  eq(I.justRatio(10, 'M'), [5, 2]); eq(I.justRatio(9, 'M'), [9, 4]); eq(I.justRatio(15, 'P'), [4, 1]);
  eq(I.semisOf(10, 'M'), 16); eq(I.simpleNum(10), 3); eq(I.simpleNum(15), 8); eq(I.simpleNum(8), 8);
  eq(I.name(10, 'M', 'zh'), '大十度'); eq(I.name(17, 'M', 'zh'), '大十七度'); eq(I.name(12, 'P', 'en'), 'perfect twelfth');
});

test('純律與平均律差最多的大、小、完全音程是小七度（17.60 音分）', function () {
  let best = null;
  for (let k = 1; k <= 8; k++) I.allowedQualities(k).filter(function (q) { return q === 'P' || q === 'M' || q === 'm'; }).forEach(function (q) {
    const d = Math.abs(I.centsOf(k, q, 'just') - I.centsOf(k, q, 'equal'));
    if (!best || d > best.d) best = { s: q + k, d: d };
  });
  eq(best.s, 'm7'); near(best.d, 17.596, 1e-3);
});

test('5 限格子：比值 = 2^a 3^b 5^c；3/2 → (−1, 1, 0)、5/4 → (−2, 0, 1)、81/80 → (−4, 4, −1)', function () {
  eq(I.exps([3, 2]), { a: -1, b: 1, c: 0, other: false }); eq(I.exps([5, 4]), { a: -2, b: 0, c: 1, other: false });
  eq(I.exps([81, 80]), { a: -4, b: 4, c: -1, other: false });
  for (let k = 1; k <= 15; k++) I.allowedQualities(k).forEach(function (q) { const r = I.justRatio(k, q); if (r) ok(!I.exps(r).other, q + k + ' 只有 2、3、5'); });
  // 每個比值的音分 = a·1200 + b·1901.955 + c·2786.314
  const r = [225, 128], e = I.exps(r);
  near(I.cents(225 / 128), e.a * 1200 + e.b * I.cents(3) + e.c * I.cents(5), 1e-9);
});

test('疊音程：每一塊的音分加起來 = 比值相乘的音分；平均律總是 100 × 半音數', function () {
  const bricks = [{ n: 3, q: 'm' }, { n: 6, q: 'M' }, { n: 2, q: 'A' }];
  const s = I.stack(N('E♭4'), bricks);
  ok(s.ok); near(s.centsJ, I.cents(I.fval(s.prod)), 1e-9);
  near(s.centsJ, s.bricks.reduce(function (t, b) { return t + b.centsJ; }, 0), 1e-9);
  eq(s.centsE, 100 * s.semis); eq(s.total.n, 3 + 6 + 2 - 2, '度數相加要減掉重複數的音');
});

test('鍵盤拼法：C 上點 E♭ → 小三度、F♯ → 增四度、B♭ → 小七度；E 上點 C → 小六度；黑鍵當下方音照升降方向', function () {
  const C = N('C4');
  eq(I.spellUpper(C, 63).hi.full, 'E♭4'); eq(I.spellUpper(C, 66).hi.full, 'F♯4'); eq(I.spellUpper(C, 70).hi.full, 'B♭4');
  eq(I.spellUpper(N('E4'), 72).hi.full, 'C5'); eq(I.spellUpper(N('A4'), 73).hi.full, 'C♯5'); eq(I.spellUpper(C, 59), null);
  eq(I.spellLower(61, 0).full, 'D♭4'); eq(I.spellLower(61, 1).full, 'C♯4'); eq(I.spellLower(66, 0).full, 'F♯4'); eq(I.spellLower(64, -1).full, 'E4');
});

test('分析結果：頻率（純律時上方音 = 下方音 × 比值），事件資料沒有 NaN', function () {
  const A = an('A4', 5, 'P', 'just');
  near(A.fLo, 440, 1e-9); near(A.fHi, 660, 1e-9);
  const B = an('A4', 5, 'P', 'equal');
  near(B.fHi, 659.255, 1e-3);
  const d = I.eventData(an('C4', 3, 'M', 'just', { start: N('C4'), bricks: [{ n: 2, q: 'M' }, { n: 2, q: 'M' }] }), { src: 'test' });
  ok(JSON.stringify(d).indexOf('NaN') < 0, '沒有 NaN');
  eq(d.chain.shorts, ['M2', 'M2']); eq(d.chain.total, 'M3'); eq(d.chain.tableComma, 'syntonic comma'); eq(d.chain.mainSame, false);
  eq(d.src, 'test');
});

console.log(`\n通過 ${pass} 項，失敗 ${fail} 項`);
if (fail) process.exit(1);
