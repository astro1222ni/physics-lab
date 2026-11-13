/* 音階與調式：數學核心的單元測試。用法：node tests/scales-modes-core.test.js */
'use strict';
const S = require('../js/scales-modes-core.js');
const M = require('../js/music-theory.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || '') + ' 得到 ' + JSON.stringify(a) + '，應為 ' + JSON.stringify(b)); }
const semisOf = function (id) { return S.semisFromSteps(S.scaleSteps(id)); };
const an = function (t, id) { return S.analyze(t, semisOf(id), id); };
/** 所有含 0 的音集合（0–11 的子集合） */
function allSets(k) {
  const out = [];
  for (let m = 1; m < 4096; m += 2) {
    const p = [];
    for (let i = 0; i < 12; i++) if (m >> i & 1) p.push(i);
    if (k == null || p.length === k) out.push(p);
  }
  return out;
}

test('C 大調：C D E F G A B，全是白鍵，步伐 2 2 1 2 2 2 1，沒有升降記號', function () {
  const a = an('C', 'ionian');
  eq(a.names, ['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  eq(a.steps, [2, 2, 1, 2, 2, 2, 1]);
  ok(a.white && a.sharps === 0 && a.flats === 0);
  eq(a.vsMajor, []);
});

test('只用白鍵的七個調式：C 伊奧尼亞、D 多利亞、E 弗里吉亞、F 利底亞、G 混合利底亞、A 伊奧利亞、B 洛克里亞', function () {
  const tonics = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  S.MODE_IDS.forEach(function (id, r) {
    const a = an(tonics[r], id);
    ok(a.white, tonics[r] + ' ' + id + ' 全是白鍵');
    eq(a.pcs, [0, 2, 4, 5, 7, 9, 11], id);
    ok(a.parent === 'C', id + ' 的母大調是 C');
  });
  eq(an('D', 'dorian').names, ['D', 'E', 'F', 'G', 'A', 'B', 'C']);
  eq(an('D', 'dorian').vsMajor, ['♭3', '♭7'], '多利亞：第 3、7 級降半音');
});

test('F 大調是 B♭ 不是 A♯；F 大調只有一個降記號', function () {
  const a = an('F', 'ionian');
  eq(a.names, ['F', 'G', 'A', 'B♭', 'C', 'D', 'E']);
  ok(a.names.indexOf('A♯') < 0 && a.flats === 1 && a.sharps === 0);
});

test('七個教會調式的步伐都是 W W H W W W H 的循環移位；辨認得出每一個', function () {
  S.MODE_IDS.forEach(function (id, r) {
    eq(S.scaleSteps(id), S.rotate([2, 2, 1, 2, 2, 2, 1], r), id);
    const idn = S.identify(semisOf(id));
    ok(idn && idn.family === 'diatonic' && idn.rot === r && idn.id === id, id);
  });
  // 七個轉位兩兩不同（7 是質數，而且步伐不是週期性的）
  const keys = S.MODE_IDS.map(function (id) { return S.scaleSteps(id).join(''); });
  ok(new Set(keys).size === 7, '七個轉位都不一樣');
});

test('每個字母只出現一次：17 種主音寫法 × 十一種七聲以下的預設音階', function () {
  S.TONICS.forEach(function (t) {
    ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian', 'harmonic', 'melodic'].forEach(function (id) {
      const sp = S.spell(t, semisOf(id));
      ok(sp.ok, t.name + ' ' + id + ' 拼得出來');
      const letters = sp.map(function (x) { return x.letter; });
      ok(new Set(letters).size === 7, t.name + ' ' + id + ' 七個字母都不同：' + sp.map(function (x) { return x.name; }).join(' '));
      ok(sp[0].name === t.name, '主音的寫法不變');
      sp.forEach(function (x) { ok(M.mod(S.LETTER_PC[x.letter] + x.acc, 12) === x.pc, '音名和音高一致：' + x.name); });
    });
  });
});

test('調號：B♭ 大調 2 降、A 大調 3 升、C♯ 多利亞 5 升、E♭ 弗里吉亞 7 降、A♯ 大調要用 3 個重升（所以寫 B♭ 大調）', function () {
  const b = an('B♭', 'ionian'); ok(b.flats === 2 && b.sharps === 0);
  const a = an('A', 'ionian'); ok(a.sharps === 3 && a.flats === 0);
  const cd = an('C♯', 'dorian'); ok(cd.sharps === 5 && cd.flats === 0, 'C♯ 多利亞 = B 大調的音');
  const ep = an('E♭', 'phrygian'); ok(ep.flats === 7 && ep.doubles === 0, 'E♭ 弗里吉亞 = C♭ 大調的音');
  const as = an('A♯', 'ionian'); ok(as.doubles === 3, 'A♯ 大調：' + as.names.join(' '));
  eq(as.names, ['A♯', 'B♯', 'C♯♯', 'D♯', 'E♯', 'F♯♯', 'G♯♯']);
  // 和聲小調升高的第 7 級：G♯ 小調要用重升 F♯♯（真實常用的調）
  const gh = an('G♯', 'harmonic');
  ok(gh.names[6] === 'F♯♯' && gh.doubles === 1, gh.names.join(' '));
  ok(an('G♯', 'aeolian').doubles === 0, 'G♯ 自然小調沒有重升');
});

test('亮暗階梯：利底亞 +21 → 洛克里亞 −21，每一格降一個音（亮度 −7）；和主音的寫法無關', function () {
  S.TONICS.forEach(function (t) {
    let prev = null;
    S.BRIGHT_ORDER.forEach(function (id, k) {
      const a = S.analyze(t.name, semisOf(id), id);
      if (a.brightness == null) throw new Error(t.name + ' ' + id + ' 沒有亮度');
      ok(a.brightness === 21 - 7 * k, t.name + ' ' + id + ' 亮度 ' + a.brightness);
      if (prev) {
        const diff = a.semis.map(function (s, i) { return s - prev.semis[i]; }).filter(function (x) { return x !== 0; });
        eq(diff, [-1], id + '：只有一個音低了一個半音');
      }
      prev = a;
    });
  });
  eq(['ionian', 'mixolydian', 'dorian', 'aeolian', 'phrygian', 'locrian'].map(function (id, k) { return S.ladderStep(S.BRIGHT_ORDER[k], 0, 1).degree; }), [4, 7, 3, 6, 2, 5], '依序降第 4、7、3、6、2、5 級');
});

test('亮暗循環：洛克里亞再往暗，主音降半音變成低半音的利底亞（同一組音高，只差主音）；反過來也一樣', function () {
  for (let t = 0; t < 12; t++) {
    const st = S.ladderStep('locrian', t, 1);
    ok(st.wrap && st.mode === 'lydian' && st.tonicPc === M.mod(t - 1, 12) && st.degree === 1);
    const loc = S.normPcs(semisOf('locrian').map(function (s) { return s + t; }));
    const lyd = S.normPcs(semisOf('lydian').map(function (s) { return s + t - 1; }));
    const onlyIn = loc.filter(function (p) { return lyd.indexOf(p) < 0; });
    eq(onlyIn, [t], '只有舊主音不見了');
    const back = S.ladderStep('lydian', M.mod(t - 1, 12), -1);
    ok(back.wrap && back.mode === 'locrian' && back.tonicPc === t);
  }
  ok(S.bestTonic(11, semisOf('lydian')).name === 'B', 'C 洛克里亞往暗 → B 利底亞');
});

test('3D 調式之塔：七層由亮到暗，相鄰兩層只有一根柱子斜一格（往低半音）', function () {
  const tw = S.tower();
  ok(tw.length === 7 && tw[0].id === 'lydian' && tw[6].id === 'locrian');
  tw.forEach(function (l, k) {
    ok(l.bright === 21 - 7 * k);
    if (k === 0) { ok(l.moved === -1); return; }
    l.semis.forEach(function (s, i) { const d = s - tw[k - 1].semis[i]; ok(i === l.moved ? d === -1 : d === 0, '第 ' + k + ' 層第 ' + i + ' 根'); });
  });
});

test('音程向量：大調 (2,5,4,3,6,1)、全音音階 (0,6,0,6,0,3)、半音音階 (12,12,12,12,12,6)、和聲小調 (3,3,5,4,4,2)；總和 = n(n−1)/2', function () {
  eq(an('C', 'ionian').iv, [2, 5, 4, 3, 6, 1]);
  eq(an('C', 'wholetone').iv, [0, 6, 0, 6, 0, 3]);
  eq(an('C', 'chromatic').iv, [12, 12, 12, 12, 12, 6]);
  eq(an('A', 'harmonic').iv, [3, 3, 5, 4, 4, 2]);
  eq(an('C', 'melodic').iv, [2, 5, 4, 4, 4, 2]);
  allSets().forEach(function (p) { const v = S.intervalVector(p), n = p.length; ok(v.reduce(function (a, b) { return a + b; }, 0) === n * (n - 1) / 2); });
  // 同一組白鍵的七個調式，音程向量都一樣（它是音集合的性質，和主音無關）
  S.MODE_IDS.forEach(function (id) { eq(S.intervalVector(semisOf(id)), [2, 5, 4, 3, 6, 1], id); });
});

test('音程向量六項都不同的七聲音階只有兩種：自然音階、和七個相鄰半音（6,5,4,3,2,1）', function () {
  const deep = allSets(7).filter(function (p) { return new Set(S.intervalVector(p)).size === 6; });
  ok(deep.length === 14, '共 ' + deep.length + ' 個含 0 的集合');
  deep.forEach(function (p) {
    const id = S.identify(p);
    const cluster = S.sameSetClass(p, [0, 1, 2, 3, 4, 5, 6]);
    ok((id && id.family === 'diatonic') || cluster, p.join(','));
    if (cluster) eq(S.intervalVector(p), [6, 5, 4, 3, 2, 1]);
  });
});

test('最大均勻（Clough & Douthett）：自然音階、五聲、全音、八聲、半音是；和聲小調、旋律小調不是；k 個音的最大均勻集合只有一種（差一個移位）', function () {
  ok(S.maxEven(semisOf('ionian')) && S.maxEven([0, 2, 4, 7, 9]) && S.maxEven(semisOf('wholetone')) && S.maxEven([0, 1, 3, 4, 6, 7, 9, 10]) && S.maxEven(semisOf('chromatic')));
  ok(!S.maxEven(semisOf('harmonic')) && !S.maxEven(semisOf('melodic')));
  for (let k = 1; k <= 12; k++) {
    const me = allSets().filter(function (p) { return p.length === k && S.maxEven(p); });
    // 每一個都是同一個集合類（彼此是移位）
    me.forEach(function (p) { ok(S.sameSetClass(p, me[0]), k + ' 個音：' + p.join(',')); });
    ok(me.length >= 1, k + ' 個音至少一個');
  }
  ok(allSets(7).filter(function (p) { return S.maxEven(p); }).every(function (p) { const id = S.identify(p); return id && id.family === 'diatonic'; }), '七個音的最大均勻集合 = 七個教會調式');
});

test('Myhill 性質：自然音階與五聲音階成立；和聲小調、旋律小調、全音音階不成立；同時最大均勻又 Myhill 的只有 5、7、11 個音', function () {
  ok(S.myhill(semisOf('ionian')) && S.myhill([0, 2, 4, 7, 9]));
  ok(!S.myhill(semisOf('harmonic')) && !S.myhill(semisOf('melodic')) && !S.myhill(semisOf('wholetone')) && !S.myhill(semisOf('chromatic')));
  // 大調的三度只有大三度（4）與小三度（3）
  eq(S.genericSizes(semisOf('ionian'))[1].sizes, [3, 4]);
  eq(S.genericSizes(semisOf('harmonic'))[0].sizes, [1, 2, 3], '和聲小調的二度有三種大小');
  const ks = {};
  allSets().forEach(function (p) { if (S.maxEven(p) && S.myhill(p)) ks[p.length] = (ks[p.length] || 0) + 1; });
  eq(Object.keys(ks).map(Number), [5, 7, 11]);
  // 這和「12 與 k 互質」一致：k 不整除 12d 時，跨 d 個音剛好兩種大小
  [5, 7, 11].forEach(function (k) { ok(M.gcd(12, k) === 1); });
});

test('Z 關係（Forte）：{0,1,4,6} 與 {0,1,3,7} 音程向量都是 (1,1,1,1,1,1)，卻不是移位或倒影', function () {
  eq(S.intervalVector([0, 1, 4, 6]), [1, 1, 1, 1, 1, 1]);
  eq(S.intervalVector([0, 1, 3, 7]), [1, 1, 1, 1, 1, 1]);
  ok(!S.sameSetClass([0, 1, 4, 6], [0, 1, 3, 7]));
  ok(S.sameSetClass([0, 4, 7], [0, 3, 7]), '大三和弦與小三和弦互為倒影');
  ok(S.sameSetClass([0, 2, 4, 5, 7, 9, 11], [2, 4, 6, 7, 9, 11, 1]), '移位');
});

test('移位對稱（梅湘的有限移位調式）：全音 2、八聲 3、增音階 4、減七和弦 3、半音 1；七個教會調式、和聲小調、旋律小調都沒有', function () {
  ok(S.transSym(semisOf('wholetone')) === 2 && S.transSym([0, 1, 3, 4, 6, 7, 9, 10]) === 3 && S.transSym([0, 3, 4, 7, 8, 11]) === 4);
  ok(S.transSym([0, 3, 6, 9]) === 3 && S.transSym(semisOf('chromatic')) === 1 && S.transSym([0, 1, 5, 6, 7, 11]) === 6);
  S.MODE_IDS.concat(['harmonic', 'melodic']).forEach(function (id) { ok(S.transSym(semisOf(id)) === 0, id); });
  // 對稱的最小移位一定整除 12，而且音的個數是 12 / t 的倍數
  for (const p of allSets()) { const t = S.transSym(p); if (t) ok(12 % t === 0 && p.length % (12 / t) === 0, p.join(',')); }
  ok(an('C', 'wholetone').sym === 2 && an('C', 'ionian').sym === 0);
});

test('辨認：自訂的音也認得出（多利亞、和聲小調、五聲宮調式、八聲音階、利底亞屬）；不是任何一族就是 null', function () {
  ok(S.identify([0, 2, 3, 5, 7, 9, 10]).id === 'dorian');
  ok(S.identify([10, 0, 3, 7, 2, 5, 9]).id === 'dorian', '亂序也可以');
  ok(S.identify([0, 2, 3, 5, 7, 8, 11]).family === 'harmonic');
  ok(S.identify([0, 2, 4, 7, 9]).zh === '五聲音階・宮調式');
  ok(S.identify([0, 2, 3, 5, 6, 8, 9, 11]).family === 'octatonic');
  ok(S.identify([0, 2, 4, 6, 7, 9, 10]).zh.indexOf('利底亞屬') === 0);
  ok(S.identify([0, 1, 2, 3, 4, 5, 6]) === null);
  ok(S.palindrome(S.scaleSteps('dorian')) && S.MODE_IDS.filter(function (id) { return S.palindrome(S.scaleSteps(id)); }).length === 1, '只有多利亞的步伐前後對稱');
});

test('主三和弦：大調大三和弦、自然小調小三和弦、洛克里亞是唯一的減三和弦（沒有純五度）', function () {
  const k = {};
  S.MODE_IDS.forEach(function (id) { k[id] = S.tonicTriad(semisOf(id)).kind; });
  eq(k, { ionian: 'major', dorian: 'minor', phrygian: 'minor', lydian: 'major', mixolydian: 'major', aeolian: 'minor', locrian: 'dim' });
  eq(S.sequence(semisOf('locrian'), 'arp'), [0, 3, 6, 12, 6, 3, 0]);
});

test('頻率：A 為主音時 440 Hz；平均律 2^(k/12)；純律以主音為準（C 大調的 E = 5/4 × C4）；比值與音分', function () {
  near(S.tonicFreq(9), 440, 1e-9);
  const a = S.analyze('C', semisOf('ionian'), 'ionian', { tuning: 'just' });
  near(a.notes[2].freq, M.midiToFreq(60) * 5 / 4, 1e-9);
  ok(a.notes[2].ratio.p === 5 && a.notes[2].ratio.q === 4);
  near(a.notes[2].dev, 1200 * Math.log2(5 / 4) - 400, 1e-9, '純大三度比平均律低 13.69 音分');
  ok(a.notes[7].ratio.p === 2 && a.notes[7].ratio.q === 1 && a.notes[7].semis === 12);
  const e = S.analyze('C', semisOf('ionian'), 'ionian', { tuning: 'equal' });
  near(e.notes[4].freq, M.midiToFreq(67), 1e-9);
  near(e.notes[4].cents, 700, 1e-9);
  const r = S.stepRatio('just', 0, 2); ok(r.p === 9 && r.q === 8);
  const r2 = S.stepRatio('just', 2, 4); ok(r2.p === 10 && r2.q === 9, '大全音 9/8、小全音 10/9');
  const r3 = S.stepRatio('just', 3, 4); ok(r3.p === 25 && r3.q === 24, '小三度到大三度：25/24（70.67 音分）');
  near(r3.cents, 70.672, 1e-3);
  ok(S.stepRatio('just', 11, 12).p === 16 && S.stepRatio('just', 11, 12).q === 15);
  near(S.stepRatio('equal', 4, 5).cents, 100, 1e-12);
});

test('頻率範圍：主音在 C4–B4，最高到 B5（987.77 Hz）；6 個泛音也不超過 8 kHz', function () {
  let lo = Infinity, hi = 0;
  for (let t = 0; t < 12; t++) S.TUNINGS.forEach(function (tu) {
    for (let s = 0; s <= 12; s++) { const f = S.freq(tu, t, s); lo = Math.min(lo, f); hi = Math.max(hi, f); }
  });
  near(lo, M.midiToFreq(60), 1e-9); near(hi, M.midiToFreq(83), 1e-9);
  ok(hi * 6 < 8000);
  eq(S.sequence(semisOf('ionian'), 'updown'), [0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0]);
  eq(S.sequence([0, 4, 7], 'down'), [12, 7, 4, 0]);
});

test('音名的八度：B♯ 大調不存在於選單，但 C♭ 這種寫法的八度以字母為準（C♭5 = B4）', function () {
  const x = { name: 'C♭', acc: -1 };
  ok(S.nameOct(x, 71) === 'C♭5');
  ok(S.nameOct({ name: 'B♯', acc: 1 }, 72) === 'B♯4');
  const a = an('D♭', 'dorian');
  eq(a.names, ['D♭', 'E♭', 'F♭', 'G♭', 'A♭', 'B♭', 'C♭']);
  ok(a.notes[6].nameOct === 'C♭5', a.notes[6].nameOct);
});

test('任務事件資料：eventData 不含音表、陣列是複本、extra 會併入', function () {
  const a = S.analyze('C', semisOf('ionian'), 'ionian', { ref: { tonicName: 'A', semis: semisOf('aeolian'), type: 'aeolian' } });
  const d = S.eventData(a, { src: 'pin' });
  ok(!d.notes && d.src === 'pin' && d.ref.common === 7 && d.ref.sameSet && d.ref.mode === 'aeolian');
  d.semis.push(99); ok(a.semis.length === 7, '複本');
});

test('不用任何 U+2070 以後的上下標或組合字元', function () {
  const fs = require('fs'), path = require('path');
  ['js/scales-modes-core.js', 'js/scales-modes.js', 'js/scales-modes-3d.js', 'js/missions/scales-modes.js', 'scales-modes.html'].forEach(function (f) {
    const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const bad = s.match(/[⁰-₟̀-ͯ⃐-⃿]/g);
    ok(!bad, f + ' 有 ' + (bad && bad.join(' ')));
  });
});

console.log(`\n${pass} 項通過${fail ? `，${fail} 項失敗` : ''}。`);
process.exit(fail ? 1 : 0);
