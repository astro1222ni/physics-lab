/* 缺基頻：數學核心的單元測試。用法：node tests/missing-fundamental-core.test.js */
'use strict';
const M = require('../js/missing-fundamental-core.js');
const MT = require('../js/music-theory.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
const on = function (ks) { const a = new Array(10).fill(false); ks.forEach(function (k) { a[k - 1] = true; }); return a; };
const st = function (o) { return Object.assign({ f0: 200, on: on([1, 2, 3, 4, 5, 6, 7, 8]), low: 0, filter: 'none', cut: 500, delta: 0 }, o); };
const TAU = 2 * Math.PI;

test('最大公因數：200、300、400 Hz → 100 Hz；1030、1230、1430 Hz → 10 Hz', function () {
  ok(M.gcdList([200, 300, 400]) === 100);
  ok(M.gcdList([1030, 1230, 1430]) === 10);
  ok(M.gcdList([MT.gcd(12, 18)]) === 6, '和 MusicTheory.gcd 一致');
});

test('拿掉基頻：200、300、400 Hz 的自相關峰在 10 ms（音高 100 Hz），r = 1', function () {
  const R = M.analyze(st({ f0: 100, on: on([2, 3, 4]) }));
  near(R.tau * 1000, 10, 1e-6, '峰的位置（ms）');
  near(R.pitch, 100, 1e-4);
  near(R.pitchR, 1, 1e-9);
  ok(!R.hasFund && R.missing, '基頻不在、音高是「不存在的音」');
});

test('只要成分是 f0 的整數倍、次數的公因數是 1，不論拿掉哪些，音高都等於 f0（5 個基頻 × 所有子集合）', function () {
  let n = 0;
  [100, 137, 200, 263, 400].forEach(function (f0) {
    for (let m = 1; m < 1024; m++) {
      const ks = [];
      for (let k = 1; k <= 10; k++) if (m & (1 << (k - 1))) ks.push(k);
      if (ks.length < 2 || ks.reduce(function (g, k) { return M.gcd(g, k); }, 0) !== 1) continue;
      const R = M.analyze(st({ f0: f0, on: on(ks) }));
      near(R.pitch, f0, f0 * 1e-6, f0 + ' Hz、{' + ks.join(',') + '}');
      ok(R.gcd === f0, '最大公因數 ' + R.gcd);
      n++;
    }
  });
  ok(n > 3000, '測了 ' + n + ' 組');
});

test('只留偶次泛音（2、4、6、8）→ 音高 2 f0；只留 3、6、9 → 3 f0（缺的不只是基頻）', function () {
  near(M.analyze(st({ on: on([2, 4, 6, 8]) })).pitch, 400, 1e-4);
  near(M.analyze(st({ f0: 100, on: on([3, 6, 9]) })).pitch, 300, 1e-4);
  near(M.analyze(st({ f0: 100, on: on([6, 9]) })).pitch, 300, 1e-4);
});

test('只有一根成分：音高就是它自己的頻率（缺基頻的魔術要至少兩根）', function () {
  [[200, 1], [200, 3], [400, 10], [100, 7]].forEach(function (p) {
    const R = M.analyze(st({ f0: p[0], on: on([p[1]]) }));
    near(R.pitch, p[0] * p[1], 1e-3, p[0] + ' Hz 的第 ' + p[1] + ' 根');
    ok(!R.missing);
  });
});

test('自相關恆等式：Σ w cos(2πfτ)/Σ w 等於把波形 x(t)x(t+τ) 在一個公週期上平均、再除以均方值', function () {
  const R = M.analyze(st({ f0: 150, on: on([2, 3, 5, 7]), filter: 'phone' }));
  const list = R.present.map(function (c) { return { f: c.f, a: c.a }; });
  const P = 1 / R.gcd, n = 20000;
  let ms = 0;
  for (let i = 0; i < n; i++) { const x = M.waveAt(list, P * i / n); ms += x * x; }
  ms /= n;
  near(ms, M.meanSquare(list), 1e-9, '均方值（帕塞瓦爾）');
  [0.0011, 0.0037, 1 / 150, 0.0123].forEach(function (tau) {
    let s = 0;
    for (let i = 0; i < n; i++) { const t = P * i / n; s += M.waveAt(list, t) * M.waveAt(list, t + tau); }
    near(s / n / ms, M.acf(R.present, tau), 1e-9, 'τ = ' + tau);
  });
});

test('拿掉基頻後波形的週期不變：x(t + 1/f0) = x(t)；只剩偶次時 x(t + 1/(2f0)) = x(t)', function () {
  const f0 = 220;
  const a = M.analyze(st({ f0: f0, on: on([2, 3, 5]) })).present;
  for (let i = 0; i < 50; i++) { const t = i * 0.000173; near(M.waveAt(a, t + 1 / f0), M.waveAt(a, t), 1e-9); }
  const b = M.analyze(st({ f0: f0, on: on([2, 4, 6]) })).present;
  for (let i = 0; i < 50; i++) { const t = i * 0.000173; near(M.waveAt(b, t + 1 / (2 * f0)), M.waveAt(b, t), 1e-9); }
  // 拿掉基頻後，半個週期就不重複了（不然音高會高一個八度）
  let d = 0;
  for (let i = 0; i < 200; i++) { const t = i * 0.0000731; d = Math.max(d, Math.abs(M.waveAt(a, t + 1 / (2 * f0)) - M.waveAt(a, t))); }
  ok(d > 0.1, '半週期的差 ' + d);
});

test('濾波器：四階巴特沃斯在截止頻率是 1/√2；手機小喇叭 110 Hz 只剩不到 0.1；電話 300–3400 Hz', function () {
  near(M.hp(250, 250), Math.SQRT1_2, 1e-12);
  near(M.lp(3400, 3400), Math.SQRT1_2, 1e-12);
  ok(M.gainAt(110, 'speaker') < 0.1 && M.gainAt(220, 'speaker') > 0.4, '喇叭');
  ok(M.gainAt(150, 'phone') < 0.1 && M.gainAt(1000, 'phone') > 0.99 && M.gainAt(8000, 'phone') < 0.1, '電話');
  near(M.gainAt(500, 'custom', 500), Math.SQRT1_2, 1e-12);
  ok(M.gainAt(50, 'none') === 1);
  // 每八度 24 dB：遠低於截止頻率時，頻率減半、增益變成 1/16
  near(M.hp(10, 1000) / M.hp(20, 1000), 1 / 16, 1e-6);
  ok(M.cutoffOf('speaker', 999) === 250 && M.cutoffOf('phone', 999) === 300 && M.cutoffOf('custom', 640) === 640 && M.cutoffOf('none', 640) === 0);
});

test('手機小喇叭放不出 110 Hz，卻仍然聽到 110 Hz（A2）；電話裡 120 Hz 的男聲也一樣', function () {
  const a = M.analyze(st({ f0: 110, filter: 'speaker' }));
  ok(!a.hasFund && a.comps[0].why === 'filter', '基頻被擋掉');
  near(a.pitch, 110, 1e-4);
  const b = M.analyze(st({ f0: 120, filter: 'phone' }));
  ok(!b.hasFund && b.lowest >= 240, '最低成分 ' + b.lowest);
  near(b.pitch, 120, 1e-4);
});

test('位移實驗：全部平移 +30 Hz（1030、1230、1430 Hz），峰往短的方向移、音高約 205 Hz，和 de Boer 的 f0 + Δ/n 相符', function () {
  const base = M.analyze(st({ on: on([5, 6, 7]) }));
  const up = M.analyze(st({ on: on([5, 6, 7]), delta: 30 }));
  const dn = M.analyze(st({ on: on([5, 6, 7]), delta: -30 }));
  ok(up.tau < base.tau && dn.tau > base.tau, '方向：' + [dn.tau, base.tau, up.tau].join(' / '));
  near(up.pitch, 205, 0.5, '往上');
  near(dn.pitch, 195, 0.5, '往下');
  ok(up.deBoer.n === 6 && Math.abs(up.deBoer.f - 205) < 1e-9, 'de Boer');
  ok(up.gcd === 10 && Math.abs(up.period - 0.1) < 1e-12, '數學上真正的週期 0.1 s（最大公因數 10 Hz）');
});

test('位移越大、泛音次數越低，音高移得越多（Δ/n）；平移一整格（Δ = f0）就回到原來的音高', function () {
  const a = M.analyze(st({ on: on([3, 4, 5]), delta: 20 })).pitch - 200;
  const b = M.analyze(st({ on: on([7, 8, 9]), delta: 20 })).pitch - 200;
  ok(a > b && a > 0 && b > 0, '低泛音 ' + a + '、高泛音 ' + b);
  const c = M.analyze(st({ f0: 100, delta: 100 }));
  near(c.pitch, 100, 1e-4);
  ok(c.freqs[0] === 200 && c.gcd === 100);
});

test('平移半格（Δ = f0/2）：成分變成 f0/2 的奇數倍，最大公因數只剩 f0/2，週期加倍', function () {
  const R = M.analyze(st({ on: on([3, 4, 5]), delta: 100 }));
  ok(R.gcd === 100, '公因數 ' + R.gcd);
  near(R.period, 0.01, 1e-12);
  ok(R.freqs.every(function (f) { return (f / 100) % 2 === 1; }), '奇數倍');
});

test('低於 20 Hz 的成分丟掉；近似最大公因數容許一點誤差', function () {
  const R = M.analyze(st({ f0: 100, on: on([1, 2, 3]), delta: -90 }));
  ok(R.comps[0].why === 'sub' && R.present.length === 2, '100 − 90 = 10 Hz 丟掉');
  near(M.approxGcd([200, 300, 400]), 100, 1e-9);
  near(M.approxGcd([201, 299, 400], 0.03), 100, 0.5);
  ok(M.approxGcd([1030, 1230, 1430], 0.02, 100) === null, '位移後就不是整數倍了');
});

test('完整音（A／B 的 A）：補上基頻、不濾波、不平移；missionData 不含 NaN', function () {
  const A = M.completeState(st({ on: on([4, 5, 6]), low: 2, filter: 'phone', delta: 30 }));
  ok(A.on.slice(0, 6).every(Boolean) && !A.on[6] && A.filter === 'none' && A.delta === 0 && A.low === 0);
  const d = M.missionData(st({ on: on([4, 5, 6]) }));
  ok(JSON.stringify(d).indexOf('NaN') < 0 && d.deBoer === null, '沒有平移時 de Boer 是 null');
  ok(d.present.join() === '4,5,6' && d.pitch === 200 && d.missing && !d.hasFund && d.lowest === 800);
  const e = M.missionData(st({ on: on([]) }));
  ok(e.pitch === null && e.present.length === 0, '全部關掉');
});

test('聲音參數：公因數 ≥ 20 Hz 用一個週期波（k = f/公因數），否則改成各自的正弦；峰值不超過上限', function () {
  const a = M.audioParts(st({ on: on([2, 3, 4]) }), 0.3, 0.95);
  ok(a.base === 200 && a.partials.map(function (p) { return p.k; }).join() === '2,3,4');
  const b = M.audioParts(st({ on: on([5, 6, 7]), delta: 30 }), 0.3, 0.95);
  ok(b.base === 10 || b.modes, '10 Hz 的公因數');
  ok(b.modes && b.modes.length === 3 && b.modes[0].f === 1030);
  const sum = b.modes.reduce(function (s, m) { return s + m.a; }, 0);
  ok(sum <= 0.95 + 1e-9, '峰值上限 ' + sum);
  ok(M.audioParts(st({ on: on([]) })) === null);
});

test('音名：200 Hz ≈ G3 +35 音分（196 Hz 才是 G3）、110 Hz = A2', function () {
  const p = M.pitchInfo(200, MT);
  ok(p.name === MT.noteName(55) && Math.round(p.cents) === 35, p.name + ' ' + p.cents);
  ok(M.pitchInfo(110, MT).name === MT.noteName(45) && Math.abs(M.pitchInfo(110, MT).cents) < 1e-9);
  void TAU;
});

console.log('\n' + pass + ' 通過，' + fail + ' 失敗');
if (fail) process.exit(1);
