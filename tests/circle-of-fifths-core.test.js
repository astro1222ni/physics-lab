/* 五度圈、調號與轉調：數學核心的單元測試。用法：node tests/circle-of-fifths-core.test.js */
'use strict';
const F = require('../js/circle-of-fifths-core.js');
const M = require('../js/music-theory.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || '') + ' 得到 ' + JSON.stringify(a) + '，應為 ' + JSON.stringify(b)); }
/** 直接用調號 j 分析（不經過格子與寫法的選擇） */
const byJ = function (j, mode) {
  const spell = j > 6 ? 'sharp' : j < -5 ? 'flat' : 'auto';
  const a = F.analyze({ pos: F.posOf(j), spell: spell, mode: mode || 'major' });
  if (a.j !== j) throw new Error('寫法選擇錯誤：想要 j = ' + j + '，得到 ' + a.j);
  return a;
};

console.log('調號');
test('C 大調、a 小調：沒有升降記號；音階 C D E F G A B 與 A B C D E F G', function () {
  const c = byJ(0), a = byJ(0, 'minor');
  eq(c.names, ['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  eq(a.names, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  ok(c.sharps === 0 && c.flats === 0 && a.label === 'a');
});
test('G 大調 1 個升記號 F♯；F 大調 1 個降記號 B♭', function () {
  eq(byJ(1).sig.marks.map(function (m) { return m.name; }), ['F♯']);
  eq(byJ(-1).sig.marks.map(function (m) { return m.name; }), ['B♭']);
  eq(byJ(1).names, ['G', 'A', 'B', 'C', 'D', 'E', 'F♯']);
  eq(byJ(-1).names, ['F', 'G', 'A', 'B♭', 'C', 'D', 'E']);
});
test('C♯ 大調 7 個升記號、C♭ 大調 7 個降記號，記號順序 F C G D A E B 與 B E A D G C F', function () {
  const cs = byJ(7), cb = byJ(-7);
  eq(cs.tonicName, 'C♯'); eq(cb.tonicName, 'C♭');
  eq(cs.sig.marks.map(function (m) { return m.name; }), ['F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'E♯', 'B♯']);
  eq(cb.sig.marks.map(function (m) { return m.name; }), ['B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭', 'F♭']);
  ok(cs.names.every(function (n) { return /♯$/.test(n); }) && cb.names.every(function (n) { return /♭$/.test(n); }), '七個音都帶記號');
});
test('每往升記號方向轉一格，主音升高五度（+7 個半音），多出來的升記號是新調的第 7 級', function () {
  for (let j = 0; j < 7; j++) {
    const a = byJ(j), b = byJ(j + 1);
    eq(F.mod(b.tonicPc - a.tonicPc, 12), 7, 'j = ' + j);
    eq(b.sig.marks[j].name, b.names[6], '新記號是第 7 級（導音）');
  }
});
test('每往降記號方向轉一格，主音降低五度，多出來的降記號是新調的第 4 級', function () {
  for (let j = 0; j > -7; j--) {
    const b = byJ(j - 1);
    eq(b.sig.marks[-j].name, b.names[3], 'j = ' + (j - 1));
  }
});
test('15 個常用調號：升記號數＝j、降記號數＝−j，主音由 j 決定（tonic = 7j mod 12）', function () {
  const want = { '-7': 'C♭', '-6': 'G♭', '-5': 'D♭', '-4': 'A♭', '-3': 'E♭', '-2': 'B♭', '-1': 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F♯', 7: 'C♯' };
  for (let j = -7; j <= 7; j++) {
    const a = byJ(j);
    eq(a.tonicName, want[j], 'j = ' + j);
    eq(a.tonicPc, F.mod(7 * j, 12));
    eq(a.sharps - a.flats, j);
    eq(a.sig.marks.length, Math.abs(j));
  }
});
test('關係小調：同調號、主音低小三度（D 大調 → b 小調，E♭ 大調 → c 小調）', function () {
  eq(byJ(2).rel.label, 'b'); eq(byJ(-3).rel.label, 'c');
  for (let j = -7; j <= 7; j++) eq(F.mod(byJ(j).tonicPc - byJ(j, 'minor').tonicPc, 12), 3, 'j = ' + j);
});
test('平行調：同主音（C 大調 ↔ c 小調，c 小調是 3 個降記號）', function () {
  const p = F.parallel(0, 'major');
  eq(p, { j: -3, mode: 'minor' });
  eq(F.keyLabel(p.j, p.mode), 'c');
  eq(F.parallel(-3, 'minor'), { j: 0, mode: 'major' });
});
test('理論上的調：G♯ 大調 8 個升記號（F 重升）、F♭ 大調 8 個降記號（B 重降）', function () {
  const g = F.analyze({ pos: 8, spell: 'sharp', mode: 'major' }), f = F.analyze({ pos: 4, spell: 'flat', mode: 'major' });
  eq(g.tonicName, 'G♯'); eq(g.doubles, 1); eq(g.sig.marks[0].name, 'F♯♯'); eq(g.names[6], 'F♯♯');
  eq(f.tonicName, 'F♭'); eq(f.doubles, 1); eq(f.sig.marks[0].name, 'B♭♭');
  ok(g.theoretical && f.theoretical && !byJ(7).theoretical);
});
test('「常用」寫法：每一格選記號最少的（6 個時用升記號）；B／C♭、F♯／G♭、C♯／D♭ 三格有兩種常用寫法', function () {
  const auto = []; for (let p = 0; p < 12; p++) auto.push(F.jOf(p, 'auto'));
  eq(auto, [0, 1, 2, 3, 4, 5, 6, -5, -4, -3, -2, -1]);
  for (let p = 0; p < 12; p++) eq(F.enharmonicPos(p), F.standardJs(p).length === 2, 'pos ' + p);
  eq(F.standardJs(5), [5, -7]); eq(F.standardJs(7), [-5, 7]);
});

console.log('同名異音與共同音');
test('同名異音：j 與 j − 12 是同一組音，升記號數＋降記號數 = 12（F♯／G♭ 6＋6、C♯／D♭ 7＋5）', function () {
  for (let j = 1; j <= 11; j++) {
    eq(F.keyPcs(j), F.keyPcs(j - 12), 'j = ' + j);
    const s1 = F.signature(j), s2 = F.signature(j - 12);
    eq(s1.sharps + s2.flats, 12);
  }
  const c = F.compare(7, 'major', -5, 'major');
  ok(c.enharm && c.sameSet && c.common === 7 && c.d === 0);
});
test('相鄰的調（屬調、下屬調）共同音 6 個，只改一個音（C → G：F → F♯；C → F：B → B♭）', function () {
  for (let j = -6; j <= 6; j++) { eq(F.commonPcs(j, j + 1).length, 6); eq(F.changedNotes(j, j + 1).length, 1); }
  eq(F.changedNotes(0, 1), [{ letter: 'F', from: 'F', to: 'F♯', fromPc: 5, toPc: 6 }]);
  eq(F.changedNotes(0, -1)[0].to, 'B♭');
});
test('共同音數 = 7 − |d|（d 是五度圈上的距離），相距 6 格也是 2；和集合的計算完全一致', function () {
  for (let a = -11; a <= 11; a++) for (let b = -11; b <= 11; b++) eq(F.commonPcs(a, b).length, F.commonByDist(b - a), a + ' vs ' + b);
  eq([0, 1, 2, 3, 4, 5, 6].map(F.commonByDist), [7, 6, 5, 4, 3, 2, 2]);
});
test('近關係調：五個，和原調共同音都 ≥ 6（關係調 7 個，其他 6 個）', function () {
  for (let j = -6; j <= 6; j++) ['major', 'minor'].forEach(function (m) {
    const n = F.nearKeys(j, m);
    eq(n.length, 5);
    n.forEach(function (x) { const c = F.compare(j, m, x.j, x.mode); ok(c.common === (x.role === 'relative' ? 7 : 6), x.role); });
  });
});
test('平行調共同音 4 個（C 大調與 c 小調：C D F G）', function () {
  const c = F.compare(0, 'major', -3, 'minor');
  eq(c.common, 4); ok(c.sameTonic);
  eq(c.commonPcs, [0, 2, 5, 7]);
});
test('主三和弦的共同音：關係調 2、平行調 2、屬調 1；C 大調與 d 小調 0（相鄰的調卻沒有共同的主和弦音）', function () {
  eq(F.compare(0, 'major', 0, 'minor').triadCommon, 2);
  eq(F.compare(0, 'major', -3, 'minor').triadCommon, 2);
  eq(F.compare(0, 'major', 1, 'major').triadCommon, 1);
  const d = F.compare(0, 'major', -1, 'minor');
  eq(d.common, 6); eq(d.triadCommon, 0);
});
test('共同音表：五度順序是循環矩陣（每一列是上一列往右移一格），對角線都是 7；半音順序是重排後的同一張表', function () {
  const hf = F.heatTable('fifths'), hc = F.heatTable('chrom');
  for (let i = 0; i < 12; i++) for (let k = 0; k < 12; k++) {
    eq(hf[i][k], hf[(i + 1) % 12][(k + 1) % 12]);
    eq(hc[i][k], hf[F.mod(7 * i, 12)][F.mod(7 * k, 12)]);
  }
  for (let i = 0; i < 12; i++) eq(hf[i][i], 7);
  eq(hf[0], [7, 6, 5, 4, 3, 2, 2, 2, 3, 4, 5, 6]);
});

console.log('乘 k');
test('k = 7：一個圈，12 個點，就是五度圈 C G D A E B F♯ C♯ G♯ D♯ A♯ F', function () {
  const c = F.cycles(7);
  eq(c.length, 1); eq(c[0].length, 12);
  eq(c[0].map(function (pc) { return M.SHARP_NAMES[pc]; }).join(' '), 'C G D A E B F♯ C♯ G♯ D♯ A♯ F');
});
test('gcd(k, 12) 個圈、每圈 12 / gcd 個點；k = 4 是 4 個三角形（增三和弦），k = 6 是 6 對三全音', function () {
  for (let k = 1; k <= 11; k++) {
    const c = F.cycles(k), g = M.gcd(k, 12);
    eq(c.length, g); c.forEach(function (x) { eq(x.length, 12 / g); });
    const all = [].concat.apply([], c).sort(function (a, b) { return a - b; });
    eq(all, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], '每個音剛好出現一次');
  }
  eq(F.cycles(4), [[0, 4, 8], [1, 5, 9], [2, 6, 10], [3, 7, 11]]);
  eq(F.cycles(6).length, 6);
});
test('只有 k = 1、5、7、11（與 12 互質）走一個圈就走遍 12 個音', function () {
  const one = []; for (let k = 1; k <= 11; k++) if (F.cycles(k).length === 1) one.push(k);
  eq(one, [1, 5, 7, 11]);
});
test('乘 k 序列從主音開始、回到主音：k = 7 從 C 是 13 個音，k = 4 是 4 個音', function () {
  eq(F.kSequence(0, 7).length, 13); eq(F.kSequence(0, 7)[12], 0);
  eq(F.kSequence(2, 4), [2, 6, 10, 2]);
  const m = F.kMidis(0, 7);
  ok(m.every(function (x, i) { return x >= 60 && x <= 72; }) && m[0] === 60 && m[12] === 72);
});
test('重排 n ↦ 7n：偶數的音不動，奇數的音換到正對面（五度圈＝半音圈把一半的音和三全音交換）', function () {
  for (let n = 0; n < 12; n++) eq(F.slotOf(n, 7), n % 2 === 0 ? n : F.mod(n + 6, 12));
});
test('1、5、7、11 乘兩次都等於 1；三個不同的非 1 元素相乘也等於 1（克萊因四元群）', function () {
  [1, 5, 7, 11].forEach(function (a) { eq(F.mod(a * a, 12), 1); });
  eq(F.mod(5 * 7 * 11, 12), 1);
  eq(F.mod(5 * 7, 12), 11);
});
test('在五度圈排列（×7）上，加 7 個半音只跨 1 格；加 1 個半音跨 7 格（十二角星）', function () {
  eq(F.slotStep(7, 7), 1); eq(F.slotStep(7, 1), 7); eq(F.slotStep(5, 7), 11); eq(F.slotStep(1, 5), 5);
});

console.log('頻率、和弦與事件');
test('主音在 C4–B4，A4 = 440 Hz：A 大調主音 440 Hz，音階最後一個是高八度 880 Hz', function () {
  const m = F.scaleMidis(3, 'major');
  near(F.freq(m[0]), 440, 1e-9); near(F.freq(m[7]), 880, 1e-9);
  eq(F.scaleMidis(0, 'minor').map(function (x) { return x - 69; }), [0, 2, 3, 5, 7, 8, 10, 12], 'a 小調從 A4 開始');
});
test('和弦：C 大調 I–IV–V 是 C E G、F A C、G B D；a 小調的 V 是 E G♯ B（和聲小調）', function () {
  eq(F.chord(0, 'major', 1).pcs, [0, 4, 7]); eq(F.chord(0, 'major', 4).pcs, [5, 9, 0]); eq(F.chord(0, 'major', 5).pcs, [7, 11, 2]);
  eq(F.chord(0, 'minor', 5).pcs, [4, 8, 11]);
  F.cadence(2, 'major').forEach(function (c) {
    ok(c.midis[1] >= 55 && c.midis[1] <= 66, '根音在 G3–F♯4');
    ok(c.midis.every(function (x, i, a) { return i === 0 || x > a[i - 1]; }), '由低到高');
    ok(c.midis.every(function (x) { return F.freq(x) >= 90 && F.freq(x) < 1000; }), '頻率在 90–1000 Hz');
  });
});
test('轉調示範：7 個和弦，前 4 個在第一個調、後 3 個在第二個調，最後一個是第二個調的主和弦', function () {
  const m = F.modulation(0, 'major', 1, 'major');
  eq(m.length, 7); eq(m.map(function (c) { return c.key; }), [1, 1, 1, 1, 2, 2, 2]);
  eq(m[6].pcs, [7, 11, 2]);
});
test('分析與事件資料：預設 C 大調，比較 G 大調時共同音 6、距離 1、要改 1 個音', function () {
  const a = F.analyze({ pos: 0, spell: 'auto', mode: 'major', target: { j: 1, mode: 'major' }, k: 7, a: 1 });
  const d = F.eventData(a, { src: 'test' });
  eq([d.j, d.t.common, d.t.d, d.t.changed, d.g, d.slotStep, d.src], [0, 6, 1, 1, 1, 7, 'test']);
  ok(JSON.stringify(d).length < 1500, '事件資料精簡');
});
test('同名異音的比較依音高配對（只是換寫法）：F♯ 對 G♭、C♯ 對 D♭、d♯ 小調對 e♭ 小調', function () {
  const pairs = function (t) { return t.respell.map(function (q) { return q.from + '>' + q.to; }).join(' '); };
  [[6, 'major', -6, 'major'], [7, 'major', -5, 'major'], [6, 'minor', -6, 'minor'], [5, 'major', -7, 'major']].forEach(function (c) {
    const t = F.compare(c[0], c[1], c[2], c[3]);
    eq([t.common, t.changed.length, t.respell.length], [7, 0, 7]);
    t.respell.forEach(function (q) { ok(q.fromPc === q.toPc, q.from + ' 與 ' + q.to + ' 是同一個音高'); });
  });
  eq(pairs(F.compare(6, 'major', -6, 'major')), 'F♯>G♭ G♯>A♭ A♯>B♭ B>C♭ C♯>D♭ D♯>E♭ E♯>F');
  eq(pairs(F.compare(7, 'major', -5, 'major')), 'C♯>D♭ D♯>E♭ E♯>F F♯>G♭ G♯>A♭ A♯>B♭ B♯>C');
  eq(pairs(F.compare(6, 'minor', -6, 'minor')), 'D♯>E♭ E♯>F F♯>G♭ G♯>A♭ A♯>B♭ B>C♭ C♯>D♭');
  eq(F.compare(6, 'major', -6, 'major').enharm, true);
});
test('一般的比較仍逐字母：C 對 G 是 F → F♯，C 對 F 是 B → B♭；關係調（C 對 a）不必改也不必換寫法', function () {
  const g = F.compare(0, 'major', 1, 'major'), f = F.compare(0, 'major', -1, 'major'), a = F.compare(0, 'major', 0, 'minor');
  eq(g.changed.map(function (q) { return q.from + '>' + q.to; }), ['F>F♯']);
  eq(f.changed.map(function (q) { return q.from + '>' + q.to; }), ['B>B♭']);
  eq([g.respell.length, f.respell.length, a.respell.length, a.changed.length, a.common], [0, 0, 0, 0, 7]);
  // 共同音少於 7 時一律逐字母（相距 6 格的 C 與 F♯ 也是）
  eq([F.compare(0, 'major', 6, 'major').respell.length, F.compare(0, 'major', 6, 'major').changed.length], [0, 6]);
});
test('3D 螺旋：同名異音在同一條直線上（角度相同），高度相差 12 層', function () {
  const a = F.helix(6, 'major', 0.2), b = F.helix(-6, 'major', 0.2);
  near(a.angle, b.angle, 1e-12); near(a.y - b.y, 12 * 0.2, 1e-12);
  near(F.helix(1, 'major').angle - F.helix(0, 'major').angle, Math.PI / 6, 1e-12);
});

console.log('\n' + pass + ' 項通過，' + fail + ' 項失敗');
if (fail) process.exit(1);
