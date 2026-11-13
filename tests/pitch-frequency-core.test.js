/* 音高與頻率：數學核心的單元測試。用法：node tests/pitch-frequency-core.test.js */
'use strict';
const P = require('../js/pitch-frequency-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }

test('A4 = 440 Hz、C4 = 261.626 Hz、A0 = 27.5 Hz、C8 = 4186.009 Hz（標準音 440）', function () {
  near(P.etFreq(69, 440), 440, 1e-12);
  near(P.etFreq(60, 440), 261.6256, 1e-4);
  near(P.etFreq(21, 440), 27.5, 1e-12);
  near(P.etFreq(108, 440), 4186.0090, 1e-4);
  const a = P.analyze(261.6256, 440);
  ok(a.name === 'C4' && a.midi === 60 && Math.abs(a.cents) < 0.01, a.name + ' ' + a.cents);
});

test('標準音 442 Hz 時：C4 = 262.815 Hz；原本的 440 Hz 變成 A4 −7.85 音分', function () {
  near(P.etFreq(60, 442), 442 * Math.pow(2, -9 / 12), 1e-12);
  near(P.etFreq(60, 442), 262.8148, 1e-4);
  const a = P.analyze(440, 442);
  ok(a.name === 'A4', a.name);
  near(a.cents, 1200 * Math.log2(440 / 442), 1e-9);
  near(a.cents, -7.851, 0.001);
});

test('450 Hz 在 440 標準下是 A4 +38.9 音分；415 Hz 是 G♯4 −1.27 音分（巴洛克的 A 約低一個半音）', function () {
  const a = P.analyze(450, 440);
  ok(a.name === 'A4', a.name); near(a.cents, 38.906, 0.001);
  const b = P.analyze(415, 440);
  ok(b.name === 'G♯4' && b.midi === 68, b.name); near(b.cents, -1.271, 0.001);
  ok(P.label(68, { flat: true }) === 'A♭4', P.label(68, { flat: true }));
});

test('n 與 f 互為反函數：f = f_A4 · 2^(n/12)，n = 12 log2(f/f_A4)（四種標準音、整個鋼琴範圍）', function () {
  [415, 440, 442, 443].forEach(function (a4) {
    for (let n = -48; n <= 39; n += 0.37) {
      const f = a4 * Math.pow(2, n / 12);
      near(P.analyze(f, a4).n, n, 1e-9, 'a4 = ' + a4 + ', n = ' + n);
      near(P.etFreq(69 + n, a4), f, 1e-9 * f);
    }
  });
});

test('高八度 = 頻率加倍：每個 A 都是 27.5 × 2^k；「＋1 八度」剛好 1200 音分', function () {
  for (let k = 0; k <= 7; k++) near(P.etFreq(21 + 12 * k, 440), 27.5 * Math.pow(2, k), 1e-9);
  [27.5, 100, 261.63, 1000, 2000].forEach(function (f) {
    near(P.step(f, 12), 2 * f, 1e-9);
    near(P.cents(f, P.step(f, 12)), 1200, 1e-9);
    if (f * Math.pow(2, 1 / 12) <= P.F_MAX) near(P.cents(f, P.step(f, 1)), 100, 1e-9);
  });
  ok(P.step(3000, 12) === null, '超過 C8 不能再升八度');
  ok(P.step(40, -12) === null, '低於 A0 不能再降八度');
});

test('週期 T = 1/f、波長 λ = v/f（v = 343 m/s）：440 Hz 的 λ ≈ 0.78 m；1000 Hz 的 T = 1 ms、λ = 0.343 m', function () {
  const a = P.analyze(440, 440);
  near(a.T, 1000 / 440, 1e-12); near(a.lambda, 0.7795, 1e-4);
  const b = P.analyze(1000, 440);
  near(b.T, 1, 1e-12); near(b.lambda, 0.343, 1e-12);
  ok(b.name === 'B5', b.name); near(b.cents, 21.31, 0.01);
  near(P.analyze(343, 440).lambda, 1, 1e-12);
  // 週期 × 頻率 = 1、波長 × 頻率 = 聲速（整個範圍）
  for (let f = 27.5; f < 4200; f *= 1.37) { const x = P.analyze(f, 440); near(x.T * f, 1000, 1e-9); near(x.lambda * f, 343, 1e-9); }
});

test('對數滑桿：位置 = 比 A0 高幾音分；0 → 27.5 Hz、4800 → 440 Hz、8700 → C8；位置 ↔ 頻率互為反函數', function () {
  near(P.fFromPos(0), 27.5, 1e-12);
  near(P.fFromPos(4800), 440, 1e-9);
  near(P.fFromPos(8700), P.etFreq(108, 440), 1e-9);
  near(P.F_MAX, 4186.009, 0.001);
  for (let p = 0; p <= 8700; p += 123.4) near(P.posFromF(P.fFromPos(p)), p, 1e-9);
  // 每一格 1 音分：每 100 格（A = 440 時）剛好是一個鍵
  for (let p = 0; p <= 8700; p += 100) ok(P.analyze(P.fFromPos(p), 440).onKey, 'p = ' + p);
});

test('偏差永遠在 −50 到 +50 音分之間，且「最接近的音」的頻率 × 2^(偏差/1200) = f', function () {
  [415, 440, 443, 466].forEach(function (a4) {
    for (let f = 27.5; f <= P.F_MAX; f *= 1.0131) {
      const x = P.analyze(f, a4);
      ok(x.cents >= -50 - 1e-9 && x.cents < 50 + 1e-9, 'f = ' + f + '：' + x.cents);
      near(x.fNote * Math.pow(2, x.cents / 1200), f, 1e-9 * f);
    }
  });
});

test('「加 100 Hz」在低音區跨好幾個八度、在高音區不到一個半音：55 → 155 Hz 是 1794 音分；2000 → 2100 Hz 只有 84 音分', function () {
  near(P.add100(55).cents, 1200 * Math.log2(155 / 55), 1e-9);
  ok(P.add100(55).cents > 1200);
  near(P.add100(2000).cents, 84.47, 0.01);
  ok(P.add100(4100) === null, '超過上限');
  // 100 → 200 剛好一個八度；200 → 300 是純五度 3:2；300 → 400 純四度 4:3；400 → 500 純大三度 5:4（泛音列）
  near(P.add100(100).cents, 1200, 1e-9);
  near(P.add100(200).cents, 1200 * Math.log2(1.5), 1e-9);
  near(P.add100(300).cents, 1200 * Math.log2(4 / 3), 1e-9);
  near(P.add100(400).cents, 1200 * Math.log2(5 / 4), 1e-9);
  // 加 100 Hz 剛好一個半音的起點：100 / (2^(1/12) − 1) ≈ 1681.7 Hz
  near(P.add100Start(100), 1681.715, 0.001);
  near(P.cents(P.add100Start(100), P.add100Start(100) + 100), 100, 1e-9);
  near(P.add100Start(1200), 100, 1e-9);
});

test('鍵盤座標：52 個白鍵、36 個黑鍵；A0 中心 0.5、C8 中心 51.5；每個八度剛好 7 個白鍵寬（對數軸等距）', function () {
  let w = 0, b = 0;
  for (let m = P.KEY_LO; m <= P.KEY_HI; m++) { if (P.isBlack(m)) b++; else w++; }
  ok(w === 52 && b === 36, w + ' ' + b);
  near(P.keyCenter(21), 0.5, 1e-12); near(P.keyCenter(108), 51.5, 1e-12);
  for (let m = 21; m + 12 <= 108; m++) near(P.keyCenter(m + 12) - P.keyCenter(m), 7, 1e-12);
  for (let m = 21; m < 108; m++) ok(P.keyCenter(m + 1) > P.keyCenter(m), '中心要遞增');
  // xOfMidi 與 midiOfX 互為反函數、在鍵上等於鍵的中心
  for (let mf = 18; mf <= 111; mf += 0.137) near(P.midiOfX(P.xOfMidi(mf)), mf, 1e-9);
  for (let m = 21; m <= 108; m++) near(P.xOfMidi(m), P.keyCenter(m), 1e-12);
  // 點擊：白鍵下半部、黑鍵上半部
  ok(P.keyAt(0.5, 0.9) === 21, 'A0'); ok(P.keyAt(1.05, 0.3) === 22, 'A♯0'); ok(P.keyAt(51.5, 0.5) === 108, 'C8');
  ok(P.keyAt(23.5, 0.9) === 60, '中央 C');
});

test('樂器音域：鋼琴 A0–C8；440 Hz 在小提琴、長笛、女高音的音域內，不在短笛、男低音的音域內', function () {
  const at = function (f) { return P.analyze(f, 440).insts; };
  ok(at(27.5).indexOf('piano') >= 0 && at(P.F_MAX).indexOf('piano') >= 0);
  const a = at(440);
  ['violin', 'flute', 'soprano', 'piano'].forEach(function (id) { ok(a.indexOf(id) >= 0, id); });
  ['piccolo', 'bassv'].forEach(function (id) { ok(a.indexOf(id) < 0, id); });
  // 每一筆都是低音 < 高音、都在鋼琴範圍裡、都有來源
  P.INSTRUMENTS.forEach(function (x) { ok(x.lo < x.hi && x.lo >= 21 && x.hi <= 108 && x.src && x.zh && x.en, x.id); });
  // 音域邊界：最低音的鍵在內、再低半個半音以上就不在
  const v = P.instById('violin');
  ok(at(P.etFreq(v.lo, 440)).indexOf('violin') >= 0 && at(P.etFreq(v.lo - 0.6, 440)).indexOf('violin') < 0);
});

test('線性軸與對數軸：八度的邊界在對數軸上等距，在線性軸上每個比前一個寬一倍', function () {
  const e = P.octaveEdges(27.5, 4186.01);
  ok(e.length === 8 && e[7] === 3520, e.join(','));
  for (let i = 1; i + 1 < e.length; i++) {
    near(P.logPos(e[i + 1], 27.5, 3520) - P.logPos(e[i], 27.5, 3520), 1 / 7, 1e-12);
    near((P.linPos(e[i + 1], 3520) - P.linPos(e[i], 3520)) / (P.linPos(e[i], 3520) - P.linPos(e[i - 1], 3520)), 2, 1e-12);
  }
});

test('頻率之梯：線性高度柱頂是指數曲線（每八度高度翻倍）、對數高度柱頂是直線（每八度 1/7.25）', function () {
  near(P.ladderHeight(27.5, 'log'), 0, 1e-12); near(P.ladderHeight(P.F_MAX, 'log'), 1, 1e-12); near(P.ladderHeight(P.F_MAX, 'lin'), 1, 1e-12);
  for (let m = 21; m + 12 <= 108; m++) {
    const f = P.etFreq(m, 440), g = P.etFreq(m + 12, 440);
    near(P.ladderHeight(g, 'log') - P.ladderHeight(f, 'log'), 12 / 87, 1e-12);
    near(P.ladderHeight(g, 'lin') / P.ladderHeight(f, 'lin'), 2, 1e-12);
  }
});

test('同一個頻率換標準音：440 → 442 時偏差少 7.85 音分；剛好在兩鍵正中間附近的頻率會換名字', function () {
  const f = P.etFreq(64.2, 440);            // E4 +20：離中間遠
  const g = P.etFreq(63.55, 440);           // E4 −45：在 D♯4 與 E4 的中間附近
  const a = P.analyze(g, 440), b = P.analyze(g, 442);
  ok(a.name === 'E4' && b.name === 'D♯4', a.name + ' → ' + b.name);
  near(a.cents - b.cents + (a.midi - b.midi) * 100, 1200 * Math.log2(442 / 440), 1e-9);
  ok(P.analyze(f, 440).name === P.analyze(f, 442).name, '離中間遠的不換名字');
});

console.log('\n通過 ' + pass + ' 項，失敗 ' + fail + ' 項');
if (fail) process.exit(1);
