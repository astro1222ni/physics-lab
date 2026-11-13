/* 五聲音階：數學核心的單元測試。用法：node tests/pentatonic-core.test.js */
'use strict';
const P = require('../js/pentatonic-core.js');
const M = require('../js/music-theory.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || '') + ' 得到 ' + JSON.stringify(a) + '，應為 ' + JSON.stringify(b)); }
const an = function (t, k, opt) { return P.analyze(t, P.modeSemis(k), P.MODES[k].id, opt); };
function allSets(k) {
  const out = [];
  for (let m = 1; m < 4096; m += 2) { const p = []; for (let i = 0; i < 12; i++) if (m >> i & 1) p.push(i); if (k == null || p.length === k) out.push(p); }
  return out;
}

console.log('三分損益');
test('先損（《史記・律書》）：宮 81 → 徵 54 → 商 72 → 羽 48 → 角 64，損益交替', function () {
  const c = P.chain(5, 'sun', 81);
  eq(c.notes.map(function (x) { return x.len.value; }), [81, 54, 72, 48, 64]);
  eq(c.notes.map(function (x) { return x.role; }), ['宮', '徵', '商', '羽', '角']);
  eq(c.notes.map(function (x) { return x.op; }), [null, 'sun', 'yi', 'sun', 'yi']);
  ok(c.allInt, '五個都是整數');
});
test('先益（《管子・地員》）：宮 81 → 徵 108 → 商 72 → 羽 96 → 角 64', function () {
  const c = P.chain(5, 'yi', 81);
  eq(c.notes.map(function (x) { return x.len.value; }), [81, 108, 72, 96, 64]);
  eq(c.notes.map(function (x) { return x.op; }), [null, 'yi', 'sun', 'yi', 'sun']);
});
test('每一步都是乘 2/3 或乘 4/3（13 個音，兩種起手）', function () {
  ['sun', 'yi'].forEach(function (o) {
    const c = P.chain(13, o, 81);
    for (let i = 1; i < 13; i++) {
      const r = c.notes[i].len.value / c.notes[i - 1].len.value;
      ok(Math.abs(r - 2 / 3) < 1e-12 || Math.abs(r - 4 / 3) < 1e-12, o + ' 第 ' + (i + 1) + ' 個音的比 ' + r);
      ok((r < 1) === (c.notes[i].op === 'sun'), '損益標記');
    }
  });
});
test('三分損益和五度相生相同：第 n 個音比宮高 (n − 1) 個純五度（音分差是 1200 的整數倍）', function () {
  const c = P.chain(13, 'sun', 81);
  c.notes.forEach(function (x, q) {
    const c5 = q * M.cents(1.5);
    const k = Math.round((c5 - x.cents) / 1200);
    near(c5 - x.cents, 1200 * k, 1e-9, '第 ' + (q + 1) + ' 個音');
    near(x.cents, M.cents(81 / x.len.value), 1e-9, '頻率 ∝ 1／弦長');
  });
});
test('宮商角徵羽對到 music-theory.js 的五度相生律：C D E G A 的比值 1、9/8、81/64、3/2、27/16', function () {
  const a = an('C', 0);
  eq(a.notes.slice(0, 5).map(function (x) { return x.ratio.p + '/' + x.ratio.q; }), ['1/1', '9/8', '81/64', '3/2', '27/16']);
  a.notes.slice(0, 5).forEach(function (x) { near(x.ratio.value, M.tuningRatio('pythagorean', x.semis), 1e-12, x.name); });
});
test('宮 → 角是畢氏大三度 81/64，比純律大三度 5/4 高一個同音差 81/80（約 21.51 音分）', function () {
  const c = P.chain(5, 'sun', 81);
  const gong = c.notes[0], jue = c.notes[4];
  const pr = P.pairInfo([gong.q, gong.b], [jue.q, jue.b]);
  eq([pr.p, pr.q], [81, 64]);
  near(pr.cents - M.cents(5 / 4), M.cents(M.SYNTONIC_COMMA), 1e-9);
  near(pr.cents - M.cents(5 / 4), 21.506, 0.001);
});
test('五個音的步伐只有兩種：大全音 9/8（×3）與畢氏小三度 32/27（×2）；沒有半音', function () {
  const c = P.chain(5, 'sun', 81);
  eq(c.kinds.map(function (k) { return k.p + '/' + k.q + '×' + k.count; }), ['32/27×2', '9/8×3']);
  eq(c.minGapSemis, 2);
  eq(c.semitonePairs.length, 0);
});
test('第 6 步（變宮）開始出現半音：256/243（約 90.22 音分），步伐變成三種', function () {
  const c = P.chain(6, 'sun', 81);
  eq(c.notes[5].role, '變宮');
  eq([c.notes[5].len.n, c.notes[5].len.d], [128, 3], '變宮的弦長 128/3');
  ok(!c.allInt, '42⅔ 不是整數');
  eq(c.kinds.length, 3);
  eq(c.minGapSemis, 1);
  near(c.minCents, M.cents(256 / 243), 1e-9);
});
test('7 個音（雅樂音階）又只剩兩種步伐（9/8 ×5、256/243 ×2）；12 個音也是兩種（256/243 ×7、2187/2048 ×5）', function () {
  const c7 = P.chain(7, 'sun', 81), c12 = P.chain(12, 'sun', 81);
  eq(c7.kinds.map(function (k) { return k.p + '/' + k.q + '×' + k.count; }), ['9/8×5', '256/243×2']);
  eq(c12.kinds.map(function (k) { return k.p + '/' + k.q + '×' + k.count; }), ['2187/2048×5', '256/243×7']);
});
test('只有 2、3、5、7、12 個音時步伐剛好兩種（三分損益 2–13 個音逐一檢查）', function () {
  const two = [];
  for (let g = 2; g <= 13; g++) if (P.chain(g, 'sun', 81).kinds.length === 2) two.push(g);
  eq(two, [2, 3, 5, 7, 12]);
});
test('第 13 個音回不到宮：弦長 524288/6561 ≈ 79.91，差一個畢氏音差 3^12/2^19（約 23.46 音分）', function () {
  const c = P.chain(13, 'sun', 81);
  eq([c.notes[12].len.n, c.notes[12].len.d], [524288, 6561]);
  near(c.notes[12].len.value, 79.9098, 1e-3);
  near(c.comma.cents, M.cents(M.PYTHAGOREAN_COMMA), 1e-9);
  near(c.comma.cents, 23.460, 0.001);
});
test('要讓前 n 個弦長都是整數，宮的弦長必須是 3^(n−1) 的倍數：5 個音 81、7 個音 729', function () {
  [1, 2, 3, 4, 5, 6, 7, 8].forEach(function (n) {
    const need = P.minIntegerL0(n);
    ok(P.chain(n, 'sun', need).allInt && P.chain(n, 'yi', need).allInt, n + ' 個音用 ' + need);
    for (let L = 1; L < need; L++) ok(!P.chain(n, 'sun', L).allInt, n + ' 個音用 ' + L + ' 不應全是整數');
  });
  eq(P.minIntegerL0(5), 81);
  eq(P.minIntegerL0(7), 729);
  eq(P.chain(7, 'sun', 729).notes.map(function (x) { return x.len.value; }), [729, 486, 648, 432, 576, 384, 512]);
});
test('弦長都落在一個八度裡：先損 (L/2, L]、先益 (2L/3, 4L/3]', function () {
  const a = P.chain(13, 'sun', 81), b = P.chain(13, 'yi', 81);
  a.notes.forEach(function (x) { ok(x.len.value <= 81 + 1e-9 && x.len.value > 40.5, '先損 ' + x.len.value); });
  b.notes.forEach(function (x) { ok(x.len.value <= 108 + 1e-9 && x.len.value > 54, '先益 ' + x.len.value); });
});

console.log('\n五聲音階與調式');
test('C 宮調式：C D E G A，步伐 2 2 3 2 3，沒有升降記號', function () {
  const a = an('C', 0);
  eq(a.names, ['C', 'D', 'E', 'G', 'A']);
  eq(a.steps, [2, 2, 3, 2, 3]);
  ok(a.white && a.sharps === 0 && a.flats === 0);
  eq(a.notes.slice(0, 5).map(function (x) { return x.roleZh; }), ['宮', '商', '角', '徵', '羽']);
  eq(a.notes.slice(0, 5).map(function (x) { return x.solf; }), ['Do', 'Re', 'Mi', 'Sol', 'La']);
});
test('五種調式的步伐是 2 2 3 2 3 的循環移位（宮 22323、商 23232、角 32322、徵 23223、羽 32232）', function () {
  eq([0, 1, 2, 3, 4].map(function (k) { return P.modeSteps(k).join(''); }), ['22323', '23232', '32322', '23223', '32232']);
  [0, 1, 2, 3, 4].forEach(function (k) { eq(P.stepsOf(P.modeSemis(k)), P.modeSteps(k), '調式 ' + k); eq(P.pentMode(P.modeSemis(k)), k); });
});
test('只用白鍵的五種調式：C 宮、D 商、E 角、G 徵、A 羽，宮都是 C', function () {
  ['C', 'D', 'E', 'G', 'A'].forEach(function (t, k) {
    const a = an(t, k);
    ok(a.white, t + ' 全是白鍵');
    eq(a.pcs, [0, 2, 4, 7, 9]);
    eq(a.gongName, 'C');
  });
});
test('黑鍵 F♯ G♯ A♯ C♯ D♯ 是 F♯ 宮（G♭ 宮的寫法是 G♭ A♭ B♭ D♭ E♭）', function () {
  const a = an('F♯', 0), b = an('G♭', 0);
  eq(a.names, ['F♯', 'G♯', 'A♯', 'C♯', 'D♯']);
  ok(a.black && a.sharps === 5);
  eq(b.names, ['G♭', 'A♭', 'B♭', 'D♭', 'E♭']);
  ok(b.black && b.flats === 5);
});
test('只有黑鍵的五聲音階：每種調式剛好一個主音音高（F♯ 宮、G♯ 商、A♯ 角、C♯ 徵、D♯ 羽）', function () {
  const sol = [];
  P.TONICS.forEach(function (t) { [0, 1, 2, 3, 4].forEach(function (k) { if (an(t.name, k).black) sol.push(t.pc + ':' + k); }); });
  const uniq = sol.filter(function (x, i) { return sol.indexOf(x) === i; }).sort();
  eq(uniq.length, 5);
  ok(uniq.indexOf('6:0') >= 0 && uniq.indexOf('8:1') >= 0 && uniq.indexOf('10:2') >= 0 && uniq.indexOf('1:3') >= 0 && uniq.indexOf('3:4') >= 0, uniq.join(' '));
});
test('拼音：A 羽調式 A C D E G（宮 C）；E♭ 羽調式 E♭ G♭ A♭ B♭ D♭（宮 G♭）；B 角調式 B D E G A（宮 G）', function () {
  eq(an('A', 4).names, ['A', 'C', 'D', 'E', 'G']);
  eq(an('E♭', 4).names, ['E♭', 'G♭', 'A♭', 'B♭', 'D♭']);
  eq(an('E♭', 4).gongName, 'G♭');
  eq(an('B', 2).names, ['B', 'D', 'E', 'G', 'A']);
  eq(an('B', 2).gongName, 'G');
});
test('五聲音階的每個字母最多用一次，而且每個音名的音高都對', function () {
  P.TONICS.forEach(function (t) {
    [0, 1, 2, 3, 4].forEach(function (k) {
      const a = an(t.name, k);
      const L = a.names.map(function (n) { return n.charAt(0); });
      ok(L.every(function (x, i) { return L.indexOf(x) === i; }), t.name + ' ' + k + ' 字母重複 ' + a.names.join(' '));
      a.notes.slice(0, 5).forEach(function (x) {
        const base = P.LETTER_PC[P.LETTERS.indexOf(x.name.charAt(0))];
        const acc = (x.name.match(/♯/g) || []).length - (x.name.match(/♭/g) || []).length;
        eq(P.mod(base + acc, 12), x.pc, x.name);
      });
    });
  });
});
test('亮度（五度鏈上的位置和）：宮 +10、徵 +5、商 0、羽 −5、角 −10；同一個主音依序換調式，每次只動一個音', function () {
  eq([0, 3, 1, 4, 2].map(function (k) { return an('C', k).brightness; }), [10, 5, 0, -5, -10]);
  const order = [0, 3, 1, 4, 2];
  for (let i = 0; i + 1 < order.length; i++) {
    const a = P.modeSemis(order[i]), b = P.modeSemis(order[i + 1]);
    const diff = a.filter(function (x) { return b.indexOf(x) < 0; }).length;
    eq(diff, 1, P.MODES[order[i]].zh + ' → ' + P.MODES[order[i + 1]].zh);
  }
});
test('商調式的步伐 2 3 2 3 2 前後對稱（上行與下行步伐一樣），其他四種不對稱', function () {
  [0, 1, 2, 3, 4].forEach(function (k) {
    const s = P.modeSteps(k), r = s.slice().reverse();
    eq(JSON.stringify(s) === JSON.stringify(r), k === 1, P.MODES[k].zh);
  });
});
test('五聲音階最大均勻、音程向量 (0,3,2,1,4,0)：沒有半音、沒有三全音', function () {
  const a = an('C', 0);
  ok(a.maxEven);
  eq(a.iv, [0, 3, 2, 1, 4, 0]);
  eq(a.semitones, 0); eq(a.tritones, 0); eq(a.minStep, 2);
});
test('窮舉：含主音的 5 個音集合裡，最大均勻的都是五聲音階（5 種調式）', function () {
  const me = allSets(5).filter(function (p) { return P.maxEven(p); });
  eq(me.length, 5);
  ok(me.every(function (p) { return P.pentMode(p) >= 0; }));
});
test('沒有半音的 5 音集合有三類：五聲（2 2 3 2 3 的轉位）、3 3 2 2 2 的轉位、4 2 2 2 2 的轉位', function () {
  const no = allSets(5).filter(function (p) { return Math.min.apply(null, P.stepsOf(p)) >= 2; });
  eq(no.length, 15);
  eq(no.filter(function (p) { return P.pentMode(p) >= 0; }).length, 5);
});
test('沒有半音的 6 音集合只有全音音階；7 個音以上一定有半音', function () {
  const six = allSets(6).filter(function (p) { return Math.min.apply(null, P.stepsOf(p)) >= 2; });
  eq(six, [[0, 2, 4, 6, 8, 10]]);
  for (let k = 7; k <= 12; k++) eq(allSets(k).filter(function (p) { return Math.min.apply(null, P.stepsOf(p)) >= 2; }).length, 0, k + ' 個音');
});
test('五聲音階加清角、變宮是清樂音階（大調）；加變徵、變宮是雅樂；加清角、閏是燕樂', function () {
  eq(P.sevenAt([0, 2, 4, 5, 7, 9, 11], 0), 'qing');
  eq(P.sevenAt([0, 2, 4, 6, 7, 9, 11], 0), 'ya');
  eq(P.sevenAt([0, 2, 4, 5, 7, 9, 10], 0), 'yan');
  // 白鍵：以 C 為宮是清樂、以 F 為宮是雅樂、以 G 為宮是燕樂
  const a = P.analyze('C', [0, 2, 4, 5, 7, 9, 11], 'custom');
  eq(a.sevenGongs.map(function (x) { return x.pc + x.id; }), ['0qing', '5ya', '7yan']);
});
test('三分損益生到 7 個音（宮徵商羽角變宮變徵）就是雅樂音階', function () {
  const c = P.chain(7, 'sun', 81);
  const rel = c.notes.map(function (x) { return x.pcG; }).sort(function (a, b) { return a - b; });
  eq(P.sevenAt(rel, 0), 'ya');
});

console.log('\n頻率與弦長');
test('十二平均律：比主音高 k 個半音 = 2^(k/12)；主音用 A4 = 440 Hz 的十二平均律（A 羽調式的主音 440 Hz）', function () {
  const a = an('A', 4, { tuning: 'equal' });
  near(a.notes[0].freq, 440, 1e-9);
  a.notes.forEach(function (x) { near(x.freq, 440 * Math.pow(2, x.semis / 12), 1e-9, x.name); });
});
test('五度相生和平均律的差：宮調式的角 +7.82 音分、徵 +1.96、商 +3.91、羽 +5.87', function () {
  const a = an('C', 0);
  near(a.notes[2].dev, 7.820, 0.001); near(a.notes[3].dev, 1.955, 0.001); near(a.notes[1].dev, 3.910, 0.001); near(a.notes[4].dev, 5.865, 0.001);
});
test('音表的弦長：先損的宮調式 81 72 64 54 48 40.5；先益的徵調式剛好是《管子》的 108 96 81 72 64 54', function () {
  eq(an('C', 0).notes.map(function (x) { return x.len.value; }), [81, 72, 64, 54, 48, 40.5]);
  eq(an('G', 3, { order: 'yi' }).notes.map(function (x) { return x.len.value; }), [108, 96, 81, 72, 64, 54]);
  eq(an('A', 4).notes.map(function (x) { return x.len.value; }), [48, 40.5, 36, 32, 27, 24]);
});
test('弦長 × 頻率 = 定值（同一根弦、同樣張力）：音表每一列都相同', function () {
  [0, 1, 2, 3, 4].forEach(function (k) {
    ['pyth', 'equal'].forEach(function (tu) {
      ['sun', 'yi'].forEach(function (o) {
        const a = an('D', k, { tuning: tu, order: o, L0: 100 });
        const c = a.notes[0].len.value * a.notes[0].freq;
        a.notes.forEach(function (x) { near(x.len.value * x.freq, c, 1e-6 * c, k + tu + o + x.name); });
      });
    });
  });
});
test('平均律的弦長：宮 81 的角 = 81 / 2^(4/12) ≈ 64.29（比三分損益的 64 長一點點）', function () {
  near(an('C', 0, { tuning: 'equal' }).notes[2].len.value, 81 / Math.pow(2, 1 / 3), 1e-9);
  near(81 / Math.pow(2, 1 / 3), 64.29, 0.005);
});

console.log('\n隨機旋律與播放順序');
test('隨機旋律：16 拍、最後一個音回到主音、範圍在主音下 2 個音到上方 n + 2 個音、同一個種子結果相同', function () {
  for (let seed = 1; seed < 400; seed++) {
    const m = P.melody(seed, 5);
    near(m.reduce(function (s, x) { return s + x.beats; }, 0), 16, 1e-9, '種子 ' + seed);
    ok(m[m.length - 1].d === 0 || m[m.length - 1].d === 5, '結束音 ' + m[m.length - 1].d);
    ok(Math.abs(m[m.length - 2].d - m[m.length - 1].d) === 1, '倒數第二個音從相鄰的音走過去');
    ok(m.every(function (x) { return x.d >= -2 && x.d <= 7; }), '範圍');
    eq(P.melody(seed, 5), m);
  }
  ok(JSON.stringify(P.melody(1, 5)) !== JSON.stringify(P.melody(2, 5)), '不同種子不同旋律');
});
test('音級 → 半音：羽調式第 −1 級是低八度的徵（−2 個半音）、第 5 級是高八度主音（12）', function () {
  const s = P.modeSemis(4);
  eq(P.degreeSemis(s, -1), 10 - 12);
  eq(P.degreeSemis(s, 5), 12);
  eq(P.degreeSemis(s, 7), 12 + 5);
});
test('播放順序：上行 0…5、下行 5…0、上行再下行 0…5…0', function () {
  eq(P.sequence(5, 'up').map(function (x) { return x.i; }), [0, 1, 2, 3, 4, 5]);
  eq(P.sequence(5, 'down').map(function (x) { return x.i; }), [5, 4, 3, 2, 1, 0]);
  eq(P.sequence(5, 'updown').map(function (x) { return x.i; }), [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0]);
});

console.log(`\n${pass} 項通過，${fail} 項失敗`);
if (fail) process.exit(1);
