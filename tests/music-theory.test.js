/* 音樂科共用的音樂數學：單元測試。用法：node tests/music-theory.test.js */
'use strict';
const M = require('../js/music-theory.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }

test('A4 = 440 Hz、中央 C（C4）= 261.63 Hz、鋼琴最低 A0 = 27.5 Hz、最高 C8 ≈ 4186 Hz', function () {
  near(M.midiToFreq(69), 440, 1e-12);
  near(M.midiToFreq(60), 261.6255653, 1e-6, 'C4');
  near(M.midiToFreq(21), 27.5, 1e-12, 'A0');
  near(M.midiToFreq(108), 4186.009045, 1e-5, 'C8');
});

test('頻率與 MIDI 編號互為反函數；升高八度頻率加倍', function () {
  for (let m = 0; m <= 127; m += 0.37) near(M.freqToMidi(M.midiToFreq(m)), m, 1e-9);
  near(M.midiToFreq(81) / M.midiToFreq(69), 2, 1e-12);
  near(M.midiToFreq(69, 442), 442, 1e-12, '改標準音');
});

test('音名與解析：69 → A4、60 → C4、61 → C♯4／D♭4，反過來也對', function () {
  ok(M.noteName(69) === 'A4' && M.noteName(60) === 'C4' && M.noteName(61) === 'C♯4' && M.noteName(61, { flat: true }) === 'D♭4');
  ok(M.noteName(59) === 'B3' && M.noteName(12) === 'C0' && M.noteName(70, { octave: false }) === 'A♯');
  ok(M.parseNote('A4') === 69 && M.parseNote('C♯5') === 73 && M.parseNote('Db3') === 49 && M.parseNote('Bb2') === 46 && M.parseNote('x') === null);
  for (let m = 12; m < 120; m++) ok(M.parseNote(M.noteName(m)) === m && M.parseNote(M.noteName(m, { flat: true })) === m, '來回 ' + m);
});

test('音分：八度 1200、半音 100、純五度 701.955、純律大三度 386.314', function () {
  near(M.cents(2), 1200, 1e-9);
  near(M.cents(Math.pow(2, 1 / 12)), 100, 1e-9);
  near(M.cents(3 / 2), 701.955, 1e-3);
  near(M.cents(5 / 4), 386.314, 1e-3);
  near(M.fromCents(M.cents(1.37)), 1.37, 1e-12);
  near(M.cents(1.5 * 4 / 3), 1200, 1e-9, '五度加四度 = 八度（比值相乘 = 音分相加）');
});

test('畢氏音差 23.460 音分、同音差 21.506 音分；畢氏大三度 81/64 = 純律大三度 × 同音差', function () {
  near(M.cents(M.PYTHAGOREAN_COMMA), 23.460, 1e-3);
  near(M.cents(M.SYNTONIC_COMMA), 21.506, 1e-3);
  near(M.pythagoreanRatio(4), 81 / 64, 1e-12, '畢氏的 E');
  near(M.pythagoreanRatio(4) / (5 / 4), 81 / 80, 1e-12);
});

test('三種音律：都在 [1, 2) 之間、遞增；平均律剛好 2^(n/12)；純律主三和弦 4:5:6', function () {
  ['pythagorean', 'just', 'equal'].forEach(function (k) {
    let prev = 0;
    for (let pc = 0; pc < 12; pc++) {
      const r = M.TEMPERAMENTS[k].ratio(pc);
      ok(r >= 1 && r < 2 && r > prev, k + ' 第 ' + pc + ' 個音 ' + r);
      prev = r;
    }
  });
  for (let pc = 0; pc < 12; pc++) near(M.tuningRatio('equal', pc), Math.pow(2, pc / 12), 1e-12);
  near(M.tuningRatio('just', 4) / M.tuningRatio('just', 0), 5 / 4, 1e-12);
  near(M.tuningRatio('just', 7) / M.tuningRatio('just', 4), 6 / 5, 1e-12);
  near(M.tuningRatio('just', 9) / M.tuningRatio('just', 5), 5 / 4, 1e-12, 'F–A');
  near(M.tuningRatio('just', 14) / M.tuningRatio('just', 11), 6 / 5, 1e-12, 'B–D（下一個八度）');
  near(M.tuningRatio('pythagorean', 19), 3, 1e-12, 'G 往上一個八度 = 3 倍');
});

test('五度相生：11 個純五度、1 個狼五度（F♯ → D♭，比純五度小一個畢氏音差）', function () {
  let pure = 0, wolf = null;
  for (let pc = 0; pc < 12; pc++) {
    const up = M.mod(pc + 7, 12);
    let r = M.pythagoreanRatio(up) / M.pythagoreanRatio(pc);
    if (r < 1) r *= 2;
    if (Math.abs(r - 1.5) < 1e-12) pure++; else wolf = { pc: pc, c: M.cents(r) };
  }
  ok(pure === 11, '純五度 ' + pure + ' 個');
  ok(wolf.pc === 6, '狼五度從 F♯ 起');
  near(wolf.c, 701.955 - 23.460, 2e-3);
});

test('平均律相對純音程的偏差：五度 −1.955、大三度 +13.686、小三度 −15.641 音分', function () {
  near(M.cents(Math.pow(2, 7 / 12) / 1.5), -1.955, 1e-3);
  near(M.cents(Math.pow(2, 4 / 12) / 1.25), 13.686, 1e-3);
  near(M.cents(Math.pow(2, 3 / 12) / 1.2), -15.641, 1e-3);
});

test('音程表：13 個、半音數 0–12、純律比值都是最簡分數、音分和半音數相差不到 50', function () {
  ok(M.INTERVALS.length === 13);
  M.INTERVALS.forEach(function (iv, i) {
    ok(iv.semis === i);
    ok(M.gcd(iv.ratio[0], iv.ratio[1]) === 1, iv.short);
    ok(Math.abs(M.cents(iv.ratio[0] / iv.ratio[1]) - 100 * i) < 50, iv.short);
    ok(!/[⁰-₟]/.test(iv.zh + iv.en), '不可用上下標字元');
  });
});

test('最大公因數、最小公倍數、約分、連分數近似', function () {
  ok(M.gcd(12, 18) === 6 && M.lcm(4, 6) === 12 && M.gcdList([4, 5, 6]) === 1 && M.lcmList([2, 3, 4]) === 12);
  ok(M.simplify(10, 12).join('/') === '5/6');
  ok(M.approxRatio(1.5, 16).join('/') === '3/2');
  ok(M.approxRatio(Math.pow(2, 7 / 12), 20).join('/') === '3/2', '平均律五度最接近 3/2');
  ok(M.approxRatio(Math.pow(2, 4 / 12), 5).join('/') === '5/4', '分母不超過 5 時，平均律大三度最接近 5/4');
  ok(M.approxRatio(Math.PI, 7).join('/') === '22/7' && M.approxRatio(Math.PI, 200).join('/') === '355/113');
});

test('不協和度：同頻率為 0、永遠 ≥ 0、最大值在 Δf* 而且 Δf* 約為臨界頻帶的四分之一', function () {
  near(M.dissonancePair(440, 1, 440, 1), 0, 1e-12);
  for (let r = 1; r <= 2.3; r += 0.01) ok(M.dissonancePair(440, 1, 440 * r, 1) >= -1e-12);
  const g = M.maxDissonanceGap(440);
  const d = function (x) { return M.dissonancePair(440, 1, 440 + x, 1); };
  ok(d(g) > d(g - 2) && d(g) > d(g + 2), '最大值位置');
  near(g, 25.77, 0.05, 'Δf*（440 Hz）');
  // Zwicker 的臨界頻帶寬約 25 + 75(1 + 1.4 F²)^0.69 Hz（F 以 kHz 計），440 Hz 約 105 Hz
  const cb = 25 + 75 * Math.pow(1 + 1.4 * 0.44 * 0.44, 0.69);
  ok(g / cb > 0.2 && g / cb < 0.3, '約四分之一臨界頻帶：' + (g / cb).toFixed(3));
  ok(M.maxDissonanceGap(1000) > M.maxDissonanceGap(200), '頻率越高，最不協和的頻率差越大');
});

test('帶泛音的音：不協和曲線的谷底落在八度、五度、四度、大三度附近（純音沒有這些谷）', function () {
  const tone = function (f0) { return M.harmonicSpectrum(f0, 6, { rolloff: 0.5 }).map(function (p) { return { f: p.f, a: p.a }; }); };
  const D = function (r) { return M.dissonance(tone(261.63).concat(tone(261.63 * r))); };
  [2, 1.5, 4 / 3, 5 / 4].forEach(function (r) {
    ok(D(r) < D(r * 1.012) && D(r) < D(r / 1.012), '複音在 ' + r.toFixed(3) + ' 是局部最小');
  });
  const P = function (r) { return M.dissonancePair(261.63, 1, 261.63 * r, 1); };
  ok(!(P(1.5) < P(1.5 * 1.012) && P(1.5) < P(1.5 / 1.012)), '純音在 3/2 沒有谷');
});

test('泛音列：第 k 個頻率是 k 倍、振幅 1/k^p、奇次泛音模式只有奇數', function () {
  const h = M.harmonicSpectrum(110, 10, { rolloff: 1 });
  ok(h.length === 10 && h[4].f === 550 && Math.abs(h[4].a - 0.2) < 1e-12);
  const o = M.harmonicSpectrum(110, 10, { odd: true });
  ok(o.length === 5 && o.every(function (p) { return p.k % 2 === 1; }));
});

console.log('\n' + (fail ? fail + ' 項失敗、' : '') + pass + ' 項測試通過。');
if (fail) process.exit(1);
