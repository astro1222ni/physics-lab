/* 拍頻與調音：數學核心的單元測試。用法：node tests/beats-tuning-core.test.js */
'use strict';
const C = require('../js/beats-tuning-core.js');
const M = require('../js/music-theory.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
const A3 = 220, C4 = M.midiToFreq(60), E2 = M.midiToFreq(40), C3 = M.midiToFreq(48), F3 = M.midiToFreq(53);

test('範圍：參考音 A1 = 55 Hz 到 A5 = 880 Hz；預設 A4 = 440 Hz、偏差 +3 Hz', function () {
  near(C.REF_MIN, 55, 1e-9); near(C.REF_MAX, 880, 1e-9);
  near(M.midiToFreq(C.REF_DEFAULT_MIDI), C.REF_DEFAULT, 1e-9);
  const a = C.analyze({});
  ok(a.iv === 'unison' && a.target === 'just' && a.mode === 'rich', '預設：同度、純律、帶泛音');
  near(a.f2, 443, 1e-9, '預設待調音');
  near(a.beat, 3, 1e-9, '預設每秒 3 拍');
});

test('兩個純音相加：440 Hz 與 442 Hz 每秒 2 拍（拍頻 = 頻率差）', function () {
  const a = C.analyze({ fRef: 440, offset: 2, iv: 'unison', mode: 'pure' });
  near(a.beat, 2, 1e-9);
  ok(a.side === 'wide', '待調音偏高 = 寬');
  near(a.period, 0.5, 1e-9, '每 0.5 秒一拍');
  const b = C.analyze({ fRef: 440, offset: -2, iv: 'unison', mode: 'pure' });
  near(b.beat, 2, 1e-9); ok(b.side === 'narrow', '偏低 = 窄');
});

test('直接把兩個正弦波相加，數響度的高峰：10 秒內的拍數 = |Δf| × 10', function () {
  for (const df of [0.7, 2, 3.5]) {
    const f1 = 440, f2 = 440 + df, sr = 20000, Ttot = 10, W = 1 / 440;   // 每個載波週期取一次最大值當作包絡
    const env = [];
    for (let k = 0; k * W < Ttot; k++) {
      let mx = 0;
      for (let i = 0; i < 46; i++) { const t = k * W + i * W / 46; mx = Math.max(mx, Math.abs(Math.sin(2 * Math.PI * f1 * t) + Math.sin(2 * Math.PI * f2 * t))); }
      env.push(mx);
    }
    let peaks = 0;
    for (let i = 1; i < env.length - 1; i++) if (env[i] > 1.9 && env[i] >= env[i - 1] && env[i] > env[i + 1]) { peaks++; i += 20; }
    // t = 0 時同相（響度最大），之後每 1/Δf 秒一個高峰
    near(peaks + 1, Math.floor(df * Ttot) + 1, 1, 'Δf = ' + df + ' Hz 的高峰數');
    void sr;
  }
});

test('包絡公式 A² = a² + b² + 2ab cos θ：和直接相加的最大值一致；a = b 時最小值為 0（完全抵消）', function () {
  for (const [a, b] of [[1, 1], [1, 0.5], [1 / 3, 1 / 2]]) {
    for (const th of [0, 0.9, 2, Math.PI]) {
      // 兩個同頻率、相位差 th 的正弦波相加後的振幅
      let mx = 0;
      for (let i = 0; i < 4000; i++) { const x = i / 4000 * 2 * Math.PI; mx = Math.max(mx, a * Math.sin(x) + b * Math.sin(x + th)); }
      near(C.envelope(a, b, th), mx, 1e-5, 'a=' + a + ' b=' + b + ' θ=' + th);
    }
  }
  near(C.envelope(1, 1, Math.PI), 0, 1e-12);
  near(C.envelope(1, 0.5, Math.PI), 0.5, 1e-12, '振幅不同時抵消不完');
});

test('純律目標：每一種音程旋鈕歸零就不拍（拍頻 0）', function () {
  for (const iv of C.IV_KEYS) {
    const a = C.analyze({ fRef: 261.63, offset: 0, iv: iv });
    near(a.beat, 0, 1e-9, iv);
    near(a.centsJust, 0, 1e-9);
  }
});

test('五度聽的是 3f1 與 2f2：A3 = 220 Hz 的平均律五度 |3·220 − 2·329.63| ≈ 0.74 拍／秒，而且是窄的', function () {
  const s = C.etBeatSigned(A3, 'fifth');
  near(C.etFreq(A3, 'fifth'), 329.6276, 1e-4);
  near(s, 2 * 220 * Math.pow(2, 7 / 12) - 3 * 220, 1e-12);
  near(Math.abs(s), 0.7448, 1e-4);
  ok(s < 0, '平均律五度比純五度窄（2f2 < 3f1）');
  const a = C.analyze({ fRef: A3, offset: C.etFreq(A3, 'fifth') - 330, iv: 'fifth', target: 'equal' });
  near(a.beat, 0.7448, 1e-4); near(a.err, 0, 1e-9); ok(a.sideOk === true, '方向對'); near(a.cents, 0, 1e-9);
  near(a.centsJust, 700 - 1200 * Math.log2(1.5), 1e-9, '比純五度低 1.955 音分');
});

test('大三度 C4–E4 平均律：|5·261.63 − 4·329.63| ≈ 10.4 拍／秒，寬的；比五度快 10 倍以上', function () {
  const s = C.etBeatSigned(C4, 'third');
  near(s, 10.38, 0.01); ok(s > 0, '平均律大三度比純大三度寬');
  const r = Math.abs(C.etBeatSigned(C4, 'third')) / Math.abs(C.etBeatSigned(C4, 'fifth'));
  ok(r > 10 && r < 13, '大三度／五度 = ' + r.toFixed(2));
  near(r, Math.abs(5 - 4 * Math.pow(2, 4 / 12)) / Math.abs(3 - 2 * Math.pow(2, 7 / 12)), 1e-9, '比值和音高無關');
});

test('平均律的拍頻和音高成正比：高一個八度，拍快一倍；八度本身不拍', function () {
  for (const iv of ['fifth', 'fourth', 'third']) near(C.etBeatSigned(440, iv), 2 * C.etBeatSigned(220, iv), 1e-9, iv);
  near(C.etBeatSigned(330, 'octave'), 0, 1e-9, '平均律八度 = 純八度');
  near(C.etBeatSigned(330, 'unison'), 0, 1e-12);
});

test('四度與五度的檢查：平均律四度 C3–F3 與五度 F3–C4 拍得一樣快（都是 3·F3 對 4·C3），一寬一窄', function () {
  const b4 = C.etBeatSigned(C3, 'fourth'), b5 = C.etBeatSigned(F3, 'fifth');
  near(Math.abs(b4), Math.abs(b5), 1e-9);
  near(Math.abs(b4), 0.591, 0.001);
  ok(b4 > 0 && b5 < 0, '四度寬、五度窄');
});

test('吉他泛音調音：E2 弦第 5 格泛音（4·E2）對 A 弦第 7 格泛音（3·A2）＝四度的 4f1 對 3f2；調到不拍是純四度，比平均律低約 2 音分', function () {
  near(E2, 82.4069, 1e-4);
  const a = C.analyze({ fRef: E2, offset: 0, iv: 'fourth' });
  near(a.fa, 4 * E2, 1e-9); near(a.fb, 3 * a.f2, 1e-9); near(a.beat, 0, 1e-9);
  near(a.f2, 109.876, 0.001, '純四度的 A');
  near(a.centsEt, -1.955, 0.001);
});

test('一音分有多小：A4 偏高 1 音分 = 0.254 Hz，每 3.9 秒才拍一次', function () {
  const off = 440 * (Math.pow(2, 1 / 1200) - 1);
  near(off, 0.2542, 1e-4);
  const a = C.analyze({ fRef: 440, offset: off, iv: 'unison' });
  near(a.cents, 1, 1e-9); near(a.period, 3.934, 0.001);
});

test('純音只有同度有拍；其他音程沒有重合的成分（拍頻是 null）', function () {
  ok(C.analyze({ mode: 'pure', iv: 'unison' }).hasPair, '同度有');
  for (const iv of ['octave', 'fifth', 'fourth', 'third']) {
    const a = C.analyze({ mode: 'pure', iv: iv, offset: 2 });
    ok(!a.hasPair && a.beat === null && a.twin === null, iv);
  }
  ok(C.pairs(440, 662, 'pure').length === 1, '純音的「泛音對」只有基頻對基頻');
});

test('泛音對：互質、都在 8 以內、由慢到快排序；五度附近最慢的是 (3, 2)', function () {
  const P = C.pairs(220, 330.5, 'rich');
  ok(P.every(p => M.gcd(p.m, p.n) === 1 && p.m <= 8 && p.n <= 8), '互質、8 以內');
  ok(P.every((p, i) => !i || P[i - 1].beat <= p.beat), '排序');
  ok(P[0].m === 3 && P[0].n === 2, '最慢的一對 = (3, 2)');
  near(P[0].beat, 1, 1e-9);
  near(P[0].a, 1 / 3, 1e-12); near(P[0].b, 1 / 2, 1e-12);
});

test('兩對泛音拍得一樣快：f2/f1 = 7/5（五度與四度的中間）時，(3, 2) 與 (4, 3) 的拍頻相等', function () {
  const a = C.analyze({ fRef: 110, offset: 154 - 165, iv: 'fifth' });
  near(a.f2 / a.fRef, 7 / 5, 1e-12);
  ok(a.twin && a.twin.m === 4 && a.twin.n === 3, '另一對是 (4, 3)');
  near(a.twin.beat, a.beat, 1e-9); near(a.beat, 22, 1e-9);
  ok(C.analyze({ fRef: 110, offset: -3, iv: 'fifth' }).twin === null, '一般的位置沒有');
  ok(C.analyze({}).twin === null, '預設沒有');
});

test('跟著拍按：間隔一樣時數到的拍頻 = 1 / 間隔；按得不穩時只取最後穩定的那幾下；最多 8 下', function () {
  const t = [0, 0.5, 1, 1.5, 2, 2.5];
  const r = C.tapRate(t);
  near(r.rate, 2, 1e-12); ok(r.taps === 6);
  const r2 = C.tapRate([0, 0.2, 3, 3.5, 4, 4.5]);
  ok(r2.taps === 4, '前面亂按的不算'); near(r2.rate, 2, 1e-12);
  ok(C.tapRate([1]) === null && C.tapRate([]) === null, '不到 2 下');
  ok(C.tapRate([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).taps === 8, '最多 8 下');
});

test('時間窗：至少看得到 2.5 拍（不拍時 10 秒）', function () {
  ok(C.windowFor(3) === 1 && C.windowFor(0.74) === 5 && C.windowFor(20) === 0.25 && C.windowFor(0) === 10 && C.windowFor(null) === 10);
  for (const b of [0.3, 1, 2.6, 7, 15]) ok(C.windowFor(b) * b >= 2.5, String(b));
});

test('3D 相量：合成相量的長度就是響度包絡；寬（s > 0）逆時針轉，窄順時針轉；轉一圈要 1/|s| 秒', function () {
  for (const t of [0, 0.13, 0.4, 1.7]) near(C.phasor(1 / 3, 1 / 2, 0.74, t).len, C.envelope(1 / 3, 1 / 2, 2 * Math.PI * 0.74 * t), 1e-12);
  ok(C.phasor(1, 1, 2, 0.05).y > 0 && C.phasor(1, 1, -2, 0.05).y < 0, '轉向');
  const p0 = C.phasor(1, 0.5, 0.8, 0), p1 = C.phasor(1, 0.5, 0.8, 1 / 0.8);
  near(p1.x, p0.x, 1e-12); near(p1.y, p0.y, 1e-12);
});

test('超出範圍的狀態被限制住', function () {
  const s = C.normState({ fRef: 5000, offset: 99, iv: 'x', target: 'y', mode: 'z' });
  ok(s.fRef <= 880 + 1e-6 && s.offset === 21 && s.iv === 'unison' && s.target === 'just' && s.mode === 'rich');
});

console.log(`\n${pass} 項通過，${fail} 項失敗`);
process.exit(fail ? 1 : 0);
