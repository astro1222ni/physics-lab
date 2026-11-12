/* 五度相生、純律與十二平均律：數學核心的單元測試。用法：node tests/temperament-core.test.js */
'use strict';
const T = require('../js/temperament-core.js');
const M = require('../js/music-theory.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
const c = T.cents;

test('基本常數：純五度 701.955、純大三度 386.314、純小三度 315.641、畢氏音差 23.460、同音差 21.506、小迪西斯 41.059 音分', function () {
  near(T.PURE5, 701.9550008653874, 1e-9);
  near(T.PURE_M3, 386.3137138648348, 1e-9);
  near(T.PURE_m3, 315.64128700055255, 1e-9);
  near(T.PYTH_COMMA, 23.460010384649, 1e-9);
  near(T.SYNTONIC, 21.506289596714, 1e-9);
  near(T.DIESIS, 41.058858405496, 1e-9);
  near(T.PYTH_COMMA, c(Math.pow(3, 12) / Math.pow(2, 19)), 1e-9, '3^12 / 2^19');
  near(T.SYNTONIC, c(81 / 80), 1e-9, '81/80');
});

test('畢氏音差：十二個純五度比七個八度多 3^12/2^19，等於 12 × 701.955 − 8400；疊疊樂第 12 個五度落在 C 上方 23.46 音分', function () {
  near(12 * T.PURE5 - 8400, T.PYTH_COMMA, 1e-9);
  const p = T.stackPoint(12, T.PURE5);
  near(p.offC, T.PYTH_COMMA, 1e-9, '離 C');
  ok(p.oct === 7 && p.pc === 0, '七個八度、最接近的音是 C');
  near(p.angle, T.PYTH_COMMA / 1200 * 360, 1e-9, '鐘面上的角度（約 7.04°）');
  ok(T.fifthName(12) === 'B♯' && T.fifthName(0) === 'C' && T.fifthName(7) === 'C♯' && T.fifthName(-5) === 'D♭' && T.fifthName(13) === null, '音名');
});

test('3 的次方永遠不等於 2 的次方（2、3 互質，算術基本定理）：前 60 個純五度沒有一個剛好落在 C 上', function () {
  for (let k = 1; k <= 60; k++) {
    ok(Math.pow(3, Math.min(k, 33)) % 2 === 1, '3^' + k + ' 是奇數');
    const p = T.stackPoint(k, T.PURE5);
    ok(Math.abs(p.offC) > 1, '第 ' + k + ' 個五度離 C 只有 ' + p.offC);
  }
});

test('53 個純五度和 31 個八度只差 3.615 音分（京房六十律）；41 個差 −19.84；在 60 個以內，53 是最接近的', function () {
  near(53 * T.PURE5 - 31 * 1200, 3.615045865, 1e-6);
  near(T.stackPoint(53, T.PURE5).offC, 3.615045865, 1e-6);
  near(T.stackPoint(41, T.PURE5).offC, -19.845, 1e-3);
  let best = 0, bestV = Infinity;
  for (let k = 1; k <= 60; k++) { const v = Math.abs(T.stackPoint(k, T.PURE5).offC); if (v < bestV) { bestV = v; best = k; } }
  ok(best === 53, '最接近的是第 ' + best + ' 個');
});

test('同音差：四個純五度疊出的大三度 81/64 比純律大三度 5/4 寬 81/80（21.51 音分）', function () {
  const pyth = T.intervalInfo('pythagorean', 0, 0, 60, 64);
  const just = T.intervalInfo('just', 0, 0, 60, 64);
  near(pyth.cents - just.cents, T.SYNTONIC, 1e-9);
  near(pyth.dev, T.SYNTONIC, 1e-9, '五度相生的大三度誤差');
  near(just.dev, 0, 1e-9, '純律的大三度');
  const r = T.pairRatio('pythagorean', 0, 60, 64);
  ok(r.p === 81 && r.q === 64, '81/64：' + JSON.stringify(r));
  near(c(Math.pow(1.5, 4) / 4), c(81 / 64), 1e-9, '(3/2)^4 / 4');
});

test('十二平均律：五度 −1.955、大三度 +13.686、小三度 −15.641 音分；每個調都一樣（換主音頻率不變）', function () {
  const e = T.errorTable('equal', 0, 0);
  e.forEach(function (r) {
    near(r.P5, -1.955000865, 1e-6, '五度');
    near(r.M3, 13.686286135, 1e-6, '大三度');
    near(r.m3, -15.641287000, 1e-6, '小三度');
  });
  for (let t = 0; t < 12; t++) for (let m = 60; m <= 72; m++) near(T.freq('equal', t, m, 0), M.midiToFreq(m), 1e-9, '主音 ' + t + '、鍵 ' + m);
});

test('主音的頻率在四種音律中都等於十二平均律（A4 = 440 Hz），十二平均律的 A4 = 440 Hz', function () {
  near(T.freq('equal', 0, 69, 0), 440, 1e-9);
  T.KINDS.forEach(function (k) { for (let t = 0; t < 12; t++) near(T.freq(k, t, 60 + t, 3.3), M.midiToFreq(60 + t), 1e-9, k + ' 主音 ' + t); });
});

test('五度相生律（主音 C）：從 D♭ 到 F♯ 都是純五度疊出來的，只有 F♯–D♭（C♯）是狼五度，窄了一個畢氏音差', function () {
  const bad = T.badFifths('pythagorean', 0, 0, 1e-6);
  ok(bad.length === 1 && bad[0].pc === 6, JSON.stringify(bad));
  near(bad[0].err, -T.PYTH_COMMA, 1e-9);
  const r = T.pairRatio('pythagorean', 0, 66, 73);
  ok(r.p === 262144 && r.q === 177147, '狼五度 2^18/3^11：' + JSON.stringify(r));
  ok(T.spell(0, 6) === 'F♯' && T.spell(0, 1) === 'D♭', '音名 F♯、D♭');
  // 和 music-theory.js 的五度相生比值一致
  for (let i = 0; i < 12; i++) near(T.ratioRel('pythagorean', i, 0), M.pythagoreanRatio(i), 1e-12, '第 ' + i + ' 個半音');
});

test('狼五度跟著主音移動：五度相生律以 G 為主音時，狼五度在 C♯–A♭（G♯），鍵盤上 C♯4–G♯4 就彈得到', function () {
  for (let t = 0; t < 12; t++) {
    const bad = T.badFifths('pythagorean', t, 0, 1e-6);
    ok(bad.length === 1 && bad[0].pc === (t + 6) % 12, '主音 ' + t + '：' + JSON.stringify(bad));
  }
  near(T.intervalInfo('pythagorean', 7, 0, 61, 68).dev, -T.PYTH_COMMA, 1e-9);
  ok(T.spell(7, 1) === 'C♯' && T.spell(7, 8) === 'A♭', '以 G 為主音的音名');
});

test('純律（主音 C）：D–A 與 B♭–F 比純五度窄一個同音差（40/27），F♯–C♯ 反而寬了 19.55 音分', function () {
  const bad = T.badFifths('just', 0, 0, 1e-6);
  ok(bad.length === 3, JSON.stringify(bad));
  const byPc = {}; bad.forEach(function (b) { byPc[b.pc] = b.err; });
  near(byPc[2], -T.SYNTONIC, 1e-9, 'D–A');
  near(byPc[10], -T.SYNTONIC, 1e-9, 'B♭–F');
  near(byPc[6], c(1024 / 675) - T.PURE5, 1e-9, 'F♯–C♯');
  near(byPc[6], 19.5526, 1e-4);
  const r = T.pairRatio('just', 0, 62, 69);
  ok(r.p === 40 && r.q === 27, 'D–A = 40/27：' + JSON.stringify(r));
});

test('主音換調：純律換成以 D 為主音，D–A 就是純五度 3/2、D–F♯–A 是 4:5:6；以 C 為主音時 D 大三和弦走音；C、D 大三和弦都純的主音只有 G、A、B', function () {
  near(T.freq('just', 2, 69, 0) / T.freq('just', 2, 62, 0), 1.5, 1e-12);
  const a = T.analyze('just', 2, 0, [62, 66, 69]);
  a.pairs.forEach(function (p) { near(p.beat, 0, 1e-9, '拍頻 ' + p.lo + '–' + p.hi); near(p.dev, 0, 1e-9); });
  const b = T.analyze('just', 0, 0, [62, 66, 69]);
  ok(b.pairs.some(function (p) { return p.beat > 1; }), '以 C 為主音時有一對會拍');
  // 純律以主音為準：C、F、G 大三和弦（I、IV、V）都是 4:5:6
  [[60, 64, 67], [65, 69, 72], [67, 71, 74]].forEach(function (ch) { T.analyze('just', 0, 0, ch).pairs.forEach(function (p) { near(p.beat, 0, 1e-9, ch.join('-')); }); });
  // 同時讓 C 大三和弦與 D 大三和弦都純的主音：G、A、B（純律以主音為準，I、♭II、♭III、IV、V、♭VI 上的大三和弦是 4:5:6）
  const both = [];
  for (let t = 0; t < 12; t++) {
    const pure = function (ch) { return T.analyze('just', t, 0, ch).pairs.every(function (p) { return p.beat < 0.01; }); };
    if (pure([60, 64, 67]) && pure([62, 66, 69])) both.push(t);
  }
  ok(both.join(',') === '7,9,11', '主音 ' + both.join(','));
});

test('調和律：w = 0 就是五度相生律；w = 畢氏音差/12（1.955）就是十二平均律，十二個五度剛好閉合', function () {
  for (let t = 0; t < 12; t++) for (let m = 60; m <= 79; m++) {
    near(T.freq('regular', t, m, 0), T.freq('pythagorean', t, m, 0), 1e-9, 'w = 0');
    near(T.freq('regular', t, m, T.PYTH_COMMA / 12), M.midiToFreq(m), 1e-9, 'w = 1.955');
  }
  near(T.regular(T.PYTH_COMMA / 12).gap12, 0, 1e-9);
  near(T.stackPoint(12, T.stackFifth('regular', T.PYTH_COMMA / 12)).offC, 0, 1e-9);
  near(T.stackPoint(12, T.stackFifth('equal', 0)).offC, 0, 1e-9, '十二平均律疊 12 個五度');
});

test('調和律的公式和逐一計算一致：五度 701.955 − w、大三度 21.51 − 4w、小三度 3w − 21.51、狼五度 11w − 23.46、減四度 8w − 1.955', function () {
  for (let w = 0; w <= 8; w += 0.37) {
    const R = T.regular(w), e = T.errorTable('regular', 0, w);
    near(R.gap12, T.PYTH_COMMA - 12 * w, 1e-9);
    near(R.M3, T.SYNTONIC - 4 * w, 1e-9);
    near(R.m3, 3 * w - T.SYNTONIC, 1e-9);
    // 主音 C：一般的五度（F♯ 以外）、一般的大三度（往上 4 個五度：F B♭ E♭ A♭ D♭ C G D）、一般的小三度
    [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11].forEach(function (pc) { near(e[pc].P5, -w, 1e-9, '五度 ' + pc); });
    near(e[6].P5, R.wolf, 1e-9, '狼五度');
    [0, 1, 2, 3, 5, 7, 8, 10].forEach(function (pc) { near(e[pc].M3, R.M3, 1e-9, '大三度 ' + pc); });
    [4, 6, 9, 11].forEach(function (pc) { near(e[pc].M3, R.dim4, 1e-9, '減四度 ' + pc); });
    [0, 2, 4, 5, 6, 7, 9, 10, 11].forEach(function (pc) { near(e[pc].m3, R.m3, 1e-9, '小三度 ' + pc); });
    near(R.wolf, 11 * w - T.PYTH_COMMA, 1e-9);
    near(R.dim4, 8 * w - (T.PYTH_COMMA - T.SYNTONIC), 1e-9);
  }
});

test('十二個音的五度加起來永遠剛好七個八度（任何音律）：誤差只能分給各個五度', function () {
  T.KINDS.forEach(function (k) {
    for (let t = 0; t < 12; t++) {
      const sum = T.errorTable(k, t, 4.2).reduce(function (s, r) { return s + r.P5 + T.PURE5; }, 0);
      near(sum, 8400, 1e-8, k + ' 主音 ' + t);
    }
  });
});

test('中全音律（w = 同音差/4 = 5.377）：八個大三度剛好純，十二個五度比七個八度少 41.06 音分（三個純大三度疊不到八度），狼五度寬 35.68', function () {
  const w = T.SYNTONIC / 4;
  near(T.regular(w).M3, 0, 1e-9);
  near(T.stackPoint(12, T.stackFifth('regular', w)).offC, -T.DIESIS, 1e-9);
  near(3 * T.PURE_M3 - 1200, -T.DIESIS, 1e-9, '三個純大三度');
  const bad = T.badFifths('regular', 0, w);
  ok(bad.length === 1 && bad[0].pc === 6, JSON.stringify(bad));
  near(bad[0].err, 35.6823, 1e-4);
  const p = T.intervalInfo('regular', 0, w, 60, 64);
  near(p.beat, 0, 1e-9, 'C–E 不拍');
});

test('其他特別的五度大小：三分之一同音差讓小三度純、七分之二同音差讓大小三度誤差相同、六分之一同音差讓增四度變成 45/32', function () {
  near(T.regular(T.SYNTONIC / 3).m3, 0, 1e-9);
  const R = T.regular(2 * T.SYNTONIC / 7);
  near(R.M3, R.m3, 1e-9);
  near(T.regular(T.SYNTONIC / 6).tritone, c(45 / 32), 1e-9);
  near(T.intervalInfo('regular', 0, T.SYNTONIC / 6, 60, 66).dev, 0, 1e-9, 'C–F♯');
  // 用調和律疊出不是 12 步的閉合：19 步（w ≈ 7.22）、31 步（w ≈ 5.18）
  near(T.stackPoint(19, 13200 / 19).offC, 0, 1e-9);
  near(T.stackPoint(31, 21600 / 31).offC, 0, 1e-9);
});

test('拍頻：十二平均律 C4–E4 是 E 的第 4 泛音和 C 的第 5 泛音差 10.38 Hz；C4–G4 五度 0.886 Hz；純音程不拍', function () {
  const e = T.intervalInfo('equal', 0, 0, 60, 64);
  ok(e.m === 5 && e.n === 4, '第 5 與第 4 泛音');
  near(e.beat, Math.abs(5 * M.midiToFreq(60) - 4 * M.midiToFreq(64)), 1e-9);
  near(Math.abs(e.fm - e.fn), 10.3824, 1e-4);
  const f = T.intervalInfo('equal', 0, 0, 60, 67);
  ok(f.m === 3 && f.n === 2, '五度：第 3 與第 2 泛音');
  near(f.beat, 0.88582, 1e-5);
  T.BASIC.concat(['regular']).forEach(function (k) { near(T.intervalInfo(k, 0, 0, 60, 72).beat, 0, 1e-9, k + ' 八度'); });
  near(T.intervalInfo('just', 0, 0, 60, 67).beat, 0, 1e-9);
  near(T.intervalInfo('just', 0, 0, 64, 67).beat, 0, 1e-9, '純律 E–G 小三度 6:5');
  near(T.intervalInfo('pythagorean', 0, 0, 60, 67).beat, 0, 1e-9);
  // 拍頻和頻率成正比：十二平均律的五度越低拍得越慢，C、C♯、D 開頭的五度每秒不到 1 次
  const slow = [];
  for (let m = 60; m < 72; m++) if (T.intervalInfo('equal', 0, 0, m, m + 7).beat < 1) slow.push(m);
  ok(slow.join(',') === '60,61,62', slow.join(','));
});

test('拍頻的包絡：兩個正弦相加，振幅在 |a1 − a2| 與 a1 + a2 之間，週期是 1/Δf；和逐點相加的波形一致', function () {
  const a1 = 1 / 5, a2 = 1 / 4, df = 10.38;
  near(T.envelope(a1, a2, df, 0), a1 + a2, 1e-12);
  near(T.envelope(a1, a2, df, 0.5 / df), Math.abs(a1 - a2), 1e-12);
  near(T.envelope(a1, a2, df, 1 / df), a1 + a2, 1e-12);
  // 逐點：x(t) = a1 sin(2π f1 t) + a2 sin(2π f2 t)；在一個載波週期內的最大值 ≈ 包絡
  const f1 = 1308.13, f2 = f1 + df;
  for (let t0 = 0.003; t0 < 0.09; t0 += 0.011) {
    let mx = 0;
    for (let i = 0; i < 400; i++) { const t = t0 + i / 400 / f1; mx = Math.max(mx, Math.abs(a1 * Math.sin(2 * Math.PI * f1 * t) + a2 * Math.sin(2 * Math.PI * f2 * t))); }
    near(mx, T.envelope(a1, a2, df, t0), 0.012, 't = ' + t0.toFixed(3));
  }
});

test('精確比值：純律 C–E 5/4、E–G 6/5、D–E 10/9、C–D 9/8；五度相生的大半音 2187/2048、小半音 256/243；平均律傳回半音數', function () {
  const eq = function (r, p, q, msg) { ok(r && r.p === p && r.q === q, msg + '：' + JSON.stringify(r)); };
  eq(T.pairRatio('just', 0, 60, 64), 5, 4, 'C–E');
  eq(T.pairRatio('just', 0, 64, 67), 6, 5, 'E–G');
  eq(T.pairRatio('just', 0, 62, 64), 10, 9, 'D–E');
  eq(T.pairRatio('just', 0, 60, 62), 9, 8, 'C–D');
  eq(T.pairRatio('just', 0, 60, 72), 2, 1, '八度');
  eq(T.pairRatio('pythagorean', 0, 61, 62), 2187, 2048, 'D♭–D 大半音');
  eq(T.pairRatio('pythagorean', 0, 60, 61), 256, 243, 'C–D♭ 小半音');
  near(T.intervalInfo('pythagorean', 0, 0, 61, 62).cents - T.intervalInfo('pythagorean', 0, 0, 60, 61).cents, T.PYTH_COMMA, 1e-9, '大半音 − 小半音 = 畢氏音差');
  near(T.intervalInfo('just', 0, 0, 60, 62).cents - T.intervalInfo('just', 0, 0, 62, 64).cents, T.SYNTONIC, 1e-9, '大全音 − 小全音 = 同音差');
  ok(T.pairRatio('equal', 0, 60, 67).et === 7, '平均律');
  ok(T.pairRatio('regular', 0, 60, 67) === null, '調和律沒有整數比');
  eq(T.tonicRatio('pythagorean', 0, 66), 729, 512, 'F♯');
  // 精確比值換成音分 = 直接算的音分
  T.BASIC.slice(0, 2).forEach(function (k) {
    for (let t = 0; t < 12; t++) for (let a = 60; a <= 72; a++) for (let b = a + 1; b <= 79; b++) {
      const r = T.pairRatio(k, t, a, b);
      near(c(r.p / r.q), T.intervalInfo(k, t, 0, a, b).cents, 1e-8, k + ' ' + t + ' ' + a + '–' + b);
    }
  });
});

test('偏差長條圖：五度相生最大 ±11.73、純律的 B♭ +17.60、E −13.69、A −15.64；調和律 w 時第 k 個五度的音偏 k(1.955 − w)', function () {
  const p = T.deviations('pythagorean', 0, 0), j = T.deviations('just', 0, 0);
  near(p[6], 11.7300, 1e-4); near(p[1], -9.7750, 1e-4);
  near(j[10], 17.5963, 1e-4); near(j[4], -13.6863, 1e-4); near(j[9], -15.6413, 1e-4);
  const w = 3.1;
  const r = T.deviations('regular', 0, w);
  for (let pc = 0; pc < 12; pc++) near(r[pc], T.POS[pc] * (T.PYTH_COMMA / 12 - w), 1e-9, '音 ' + pc);
});

test('疊疊樂：第 7 個純五度是 C♯，比 C 高一個大半音（113.69 音分）；拉回八度後永遠在 0–1200 之間', function () {
  near(T.stackPoint(7, T.PURE5).r, c(2187 / 2048), 1e-9);
  for (let k = 0; k <= 60; k++) {
    T.KINDS.forEach(function (kind) {
      const p = T.stackPoint(k, T.stackFifth(kind, 6.3));
      ok(p.r >= 0 && p.r < 1200 && Math.abs(p.offC) <= 600, kind + ' 第 ' + k + ' 個：' + JSON.stringify(p));
      near(p.oct * 1200 + p.r, p.total, 1e-9);
    });
  }
  const s = T.stackPair(12, T.PURE5);
  near(s.fx / s.fc, Math.pow(2, T.PYTH_COMMA / 1200), 1e-12);
  near(s.beat, s.fx - s.fc, 1e-9, '接近同度：拍頻 = 基頻差');
  near(s.beat, 3.5694, 1e-4);
  const m = T.stackPair(12, T.stackFifth('regular', T.SYNTONIC / 4));
  near(m.fc, M.midiToFreq(72), 1e-9, '中全音律疊 12 個落在 C5 下方，和 C5 一起聽');
});

test('音色與鍵盤：8 個泛音 1/k；鍵盤 C4–C5；最高的頻率不超過 8 kHz', function () {
  ok(T.PARTIALS.length === 8 && T.PARTIALS[3] === 0.25);
  ok(T.KEY_LO === 60 && T.KEY_HI === 72);
  let top = 0;
  T.KINDS.forEach(function (k) { for (let t = 0; t < 12; t++) for (let m = 60; m <= 79; m++) top = Math.max(top, 8 * T.freq(k, t, m, 8)); });
  ok(top < 8000, '最高泛音 ' + top);
});

console.log(`\n${pass} 項通過${fail ? `，${fail} 項失敗` : ''}。`);
process.exit(fail ? 1 : 0);
