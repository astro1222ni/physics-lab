// 以 Node 執行：node tests/action-potential-core.test.js
'use strict';
const assert = require('assert');
const A = require('../js/action-potential-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b} ± ${tol}，得到 ${a}`);
}
const P0 = A.params({});
const pulse = (amp, dur, t0) => ({ pulses: [{ t0: t0 == null ? 1 : t0, dur: dur, amp: amp }] });
const cableRun = (o, xs, tMax) => {
  const cab = A.makeCable(Object.assign({ length: 10, diam: 476 }, o));
  xs.forEach(x => cab.stims.push({ x0: Math.max(0, x - 0.05), x1: Math.min(cab.L, x + 0.05), t0: 0.5, dur: 0.5, amp: 1500 }));
  while (cab.t < (tMax || 40)) { A.cableStep(cab); if (cab.t > 2 && !A.cableActive(cab)) break; }
  return cab;
};

console.log('action-potential-core');

test('速率函數：0/0 的點連續（α_m(−40) = 1、α_n(−55) = 0.1），溫度係數 φ = 3^((T − 6.3)/10)', () => {
  close(A.am(-40), 1.0, 1e-9);
  close(A.an(-55), 0.1, 1e-9);
  close(A.am(-40 + 1e-7), 1.0, 1e-6, '0/0 點附近');
  close(A.phi(6.3), 1, 1e-12);
  close(A.phi(16.3), 3, 1e-12);
  close(A.phi(18.5), Math.pow(3, 1.22), 1e-12);
});

test('靜止膜電位 −65.0 mV；靜止時的閘門 m∞ ≈ 0.0529、h∞ ≈ 0.596、n∞ ≈ 0.318（HH 1952 的參數）', () => {
  const s = A.restState(P0);
  close(s.V, -65, 0.05, '靜止膜電位');
  close(s.m, 0.0529, 0.0005); close(s.h, 0.5961, 0.0005); close(s.n, 0.3177, 0.0005);
  close(A.steadyCurrent(s.V, P0), 0, 1e-9, '靜止時淨電流為 0');
});

test('沒有刺激時一直維持靜止（50 ms 漂移 < 1e-6 mV）', () => {
  const rec = A.simulate(P0, { pulses: [] }, 50);
  const d = Math.max.apply(null, rec.V.map(v => Math.abs(v - rec.rest)));
  assert.ok(d < 1e-6, '漂移 ' + d);
});

test('電容充電：很弱的脈衝像 RC 電路，ΔV = (I/g)(1 − e^(−t g/C))，g 為靜止時的總電導（誤差 < 0.5%）', () => {
  const s = A.restState(P0);
  const g = P0.gNa * s.m * s.m * s.m * s.h + P0.gK * Math.pow(s.n, 4) + P0.gL;
  close(g, 0.677, 0.002, '靜止電導（mS/cm²）');
  for (const dur of [0.05, 0.1]) { // 時間再長，鈉通道開始打開，就不再是單純的 RC
    const rec = A.simulate(P0, pulse(1, dur, 1), 1 + dur + 0.01, { every: 0.01 });
    const i = rec.t.findIndex(t => t >= 1 + dur - 1e-9);
    const want = (1 / g) * (1 - Math.exp(-dur * g / P0.C));
    close((rec.V[i] - rec.rest) / want, 1, 0.005, dur + ' ms');
  }
  // 極短時就是 Q / C
  const rec = A.simulate(P0, pulse(4, 0.01, 1), 1.02, { every: 0.01 });
  close(rec.V[rec.t.findIndex(t => t >= 1.01 - 1e-9)] - rec.rest, 0.04, 0.0005);
});

test('能斯特方程式：RT/F（6.3 °C）= 24.08 mV；細胞外 K+ 變 10 倍，E_K 上升 (RT/F)·ln 10', () => {
  close(A.rtf(6.3), 24.08, 0.01);
  close(A.rtf(20) * Math.LN10, 58.17, 0.02, '20 °C 每十倍');
  const P = A.params({ kOut: 10 });
  close(P.EK - P0.EK, A.rtf(6.3) * Math.LN10, 1e-9);
  const Q = A.params({ naOut: 0.5, ttx: 0.25, tea: 0.5 });
  close(Q.ENa, 50 + A.rtf(6.3) * Math.log(0.5), 1e-9);
  close(Q.gNa, 90, 1e-9); close(Q.gK, 18, 1e-9);
});

test('預設的刺激（20 µA/cm²、0.5 ms）引發動作電位：振幅約 105 mV、過射約 40 mV、後過極化低於靜止', () => {
  const rec = A.simulate(P0, pulse(20, 0.5), 30);
  const an = A.analyze(rec);
  assert.strictEqual(an.n, 1);
  assert.ok(an.spikes[0].peak > 30 && an.spikes[0].peak < 50, '峰值 ' + an.spikes[0].peak);
  assert.ok(an.shape.amp > 95 && an.shape.amp < 115, '振幅 ' + an.shape.amp);
  assert.ok(an.shape.ahp < -72, '後過極化 ' + an.shape.ahp);
  assert.ok(an.shape.halfWidth > 1.0 && an.shape.halfWidth < 2.0, '半高寬 ' + an.shape.halfWidth);
});

test('強度–時間曲線：短脈衝時閾值 × 寬度（電荷）幾乎固定；寬度越長閾值越低，趨近基強度', () => {
  const t005 = A.threshold(P0, 0.05), t01 = A.threshold(P0, 0.1), t05 = A.threshold(P0, 0.5), t5 = A.threshold(P0, 5);
  close(t005 * 0.05 / (t01 * 0.1), 1, 0.02, '電荷比');
  assert.ok(t005 > t01 && t01 > t05 && t05 > t5);
  assert.ok(t5 > 2 && t5 < 2.6, '5 ms 的閾值 ' + t5);
  // 閾值的定義：稍低不發、稍高就發
  assert.ok(!A.fires(P0, t05 * 0.999, 0.5) && A.fires(P0, t05 * 1.001, 0.5));
});

test('全有全無：強度 1.5 倍與 5 倍閾值，峰值相差不到 3 mV；閾值以下只有小小的局部電位', () => {
  const th = A.threshold(P0, 0.5);
  const p1 = A.analyze(A.simulate(P0, pulse(1.5 * th, 0.5), 30)).spikes[0].peak;
  const p5 = A.analyze(A.simulate(P0, pulse(5 * th, 0.5), 30)).spikes[0].peak;
  assert.ok(Math.abs(p1 - p5) < 3, p1 + ' vs ' + p5);
  const sub = A.analyze(A.simulate(P0, pulse(0.9 * th, 0.5), 30));
  assert.strictEqual(sub.n, 0);
  assert.ok(sub.rise > 5 && sub.rise < 20, '局部電位 ' + sub.rise);
});

test('閾值附近延遲變長：剛好超過閾值 0.01% 時，峰值比強刺激晚 5 ms 以上', () => {
  const th = A.threshold(P0, 0.5);
  const slow = A.analyze(A.simulate(P0, pulse(th * 1.0001, 0.5), 40)).spikes[0].tPeak;
  const fast = A.analyze(A.simulate(P0, pulse(th * 5, 0.5), 40)).spikes[0].tPeak;
  assert.ok(slow - fast > 5, slow + ' vs ' + fast);
});

test('持續電流：6.0 µA/cm² 以下最多發兩次；6.5 以上反覆發放約 50–60 Hz；越強越快；太強（150）反而停住（去極化阻斷）', () => {
  const run = I => A.analyze(A.simulate(P0, { step: { t0: 5, amp: I } }, 205, { every: 0.05 }));
  assert.ok(run(6.0).n <= 2);
  const r65 = run(6.5);
  assert.ok(r65.n >= 8 && r65.rate > 50 && r65.rate < 62, '6.5 → ' + r65.rate);
  assert.ok(run(20).rate > run(10).rate && run(50).rate > run(20).rate);
  assert.ok(run(150).n <= 2, '150 → ' + run(150).n);
});

test('不反應期：3 ms 內第二個脈衝再強（400）也沒有第二個動作電位；30 ms 後閾值恢復（±5%）', () => {
  const th = A.threshold(P0, 0.5);
  assert.strictEqual(A.pairedThreshold(P0, 2 * th, 0.5, 3), Infinity);
  const r8 = A.pairedThreshold(P0, 2 * th, 0.5, 8), r30 = A.pairedThreshold(P0, 2 * th, 0.5, 30);
  assert.ok(r8 > 3 * th, '8 ms：' + r8 / th);
  close(r30 / th, 1, 0.05, '30 ms');
});

test('河豚毒素：阻斷 90% 的鈉通道，400 µA/cm² 以內都引發不了動作電位；阻斷 50% 閾值變高', () => {
  assert.strictEqual(A.threshold(A.params({ ttx: 0.9 }), 0.5), Infinity);
  assert.ok(A.threshold(A.params({ ttx: 0.5 }), 0.5) > 1.5 * A.threshold(P0, 0.5));
  assert.strictEqual(A.threshold(A.params({ ttx: 1 }), 0.5), Infinity);
});

test('降低細胞外 Na+：峰值跟著 E_Na 下降（Hodgkin & Katz 1949）；0.15 倍時峰值低於 0 mV、振幅仍超過 50 mV', () => {
  const pk = na => A.analyze(A.simulate(A.params({ naOut: na }), pulse(40, 0.5), 30));
  const a = pk(1), b = pk(0.5), c = pk(0.15);
  const dE = A.params({ naOut: 0.5 }).ENa - P0.ENa;
  const slope = (b.spikes[0].peak - a.spikes[0].peak) / dE;
  assert.ok(slope > 0.6 && slope < 1.05, '峰值／E_Na 斜率 ' + slope);
  assert.ok(c.n === 1 && c.spikes[0].peak < 0 && c.spikes[0].peak - c.rest > 50);
});

test('細胞外 K+ 提高：靜止膜電位上升；2 倍時自己反覆放電，3 倍時去極化阻斷', () => {
  const r2 = A.params({ kOut: 2 }), r3 = A.params({ kOut: 3 });
  assert.ok(A.restingPotential(r2) > -55 && A.restingPotential(r3) > -45);
  assert.ok(A.analyze(A.simulate(r2, pulse(2, 0.5), 60)).n >= 3, '2 倍：一次小刺激後一直放電');
  assert.strictEqual(A.threshold(r3, 0.5), Infinity);
});

test('陽極斷電興奮：−5 µA/cm² 的過極化脈衝 10 ms，放開時引發動作電位', () => {
  const an = A.analyze(A.simulate(P0, pulse(-5, 10), 40));
  assert.strictEqual(an.n, 1);
  assert.ok(an.spikes[0].t > 11, '在脈衝結束之後');
});

test('被動纜線（沒有鈉鉀通道）：穩態電壓沿軸突以空間常數 λ = √(a / 2R_i g_L) ≈ 1.06 cm 衰減', () => {
  const P = A.params({ ttx: 1, tea: 1 });
  const cab = A.makeCable({ P: P, length: 10, diam: 476, dx: 0.0125 });
  cab.stims.push({ x0: 0, x1: 0.0125 * 0.5, t0: 0, dur: 1e9, amp: 20 });
  A.cableRun(cab, 60);
  const lam = Math.sqrt(0.0238 / (2 * 35.4) * 1000 / 0.3);
  close(lam, 1.0583, 0.001);
  const dv = x => cab.V[A.cableIndex(cab, x)] - cab.rest;
  const want = Math.cosh((10 - 3) / lam) / Math.cosh((10 - 2) / lam);
  close(dv(3) / dv(2), want, 0.003, 'V(3)/V(2)');
});

test('傳導速度：18.5 °C、直徑 476 µm 約 18.8 m/s（HH 1952 的計算值，±2%）；步長減半改變 < 1.5%', () => {
  const S = { stimAmp: 1500, stimDur: 0.5, length: 10, x1: 3, x2: 7 };
  const P = A.params({ T: 18.5 });
  const v = A.measureVelocity(Object.assign({ P: P, diam: 476 }, S)).v;
  close(v / 18.8, 1, 0.02, 'v = ' + v);
  const vf = A.measureVelocity(Object.assign({ P: P, diam: 476, dx: 0.0125, dt: 0.0025 }, S)).v;
  close(v / vf, 1, 0.015, '收斂');
});

test('無髓鞘軸突的速度 ∝ √直徑：直徑 4 倍、速度約 2 倍（±2%）；溫度升高、速度變快', () => {
  const S = { stimAmp: 1500, stimDur: 0.5, length: 10, x1: 3, x2: 7 };
  const v1 = A.measureVelocity(Object.assign({ P: P0, diam: 119 }, S)).v;
  const v4 = A.measureVelocity(Object.assign({ P: P0, diam: 476 }, S)).v;
  close(v4 / v1, 2, 0.04);
  const vw = A.measureVelocity(Object.assign({ P: A.params({ T: 18.5 }), diam: 476 }, S)).v;
  assert.ok(vw > v4 * 1.3);
});

test('髓鞘（示意）：同樣直徑，跳躍傳導的速度是無髓鞘的 3 倍以上；衝動在蘭氏結之間「跳」', () => {
  const S = { stimAmp: 1500, stimDur: 0.5, length: 10, x1: 3, x2: 7 };
  const u = A.measureVelocity(Object.assign({ P: P0, diam: 476 }, S)).v;
  const r = A.measureVelocity(Object.assign({ P: P0, diam: 476, myelin: true }, S));
  assert.ok(r.v > 3 * u, r.v + ' vs ' + u);
  // 只有蘭氏結有鈉鉀通道：節間段的膜電容與漏電導是很小的倍數
  const cab = r.cab;
  let nodes = 0;
  for (let i = 0; i < cab.N; i++) if (cab.node[i]) nodes++;
  assert.ok(nodes >= 20 && nodes <= 23, '蘭氏結數 ' + nodes);
  assert.ok(cab.Ci[A.cableIndex(cab, 3.25)] < 0.01 && cab.Ci[A.cableIndex(cab, 3.0)] === 1);
});

test('兩端同時刺激：兩道衝動在中點相撞後一起消失（不反應期），沒有任何一段被興奮兩次', () => {
  const cab = cableRun({ P: P0 }, [1, 9]);
  const s = A.cableSummary(cab);
  assert.ok(s.collided && !s.twice && s.left && s.right);
  close(s.xMeet, 5, 0.15, '相撞的位置');
  const one = A.cableSummary(cableRun({ P: P0 }, [1]));
  assert.ok(!one.collided && one.left && one.right);
});

test('熱阻斷：30 °C 仍能傳導，37 °C 衝動傳不到另一端；部分阻斷鈉通道時速度變慢', () => {
  assert.ok(A.cableSummary(cableRun({ P: A.params({ T: 30 }) }, [1])).right);
  assert.ok(!A.cableSummary(cableRun({ P: A.params({ T: 37 }) }, [1])).right);
  const v0 = A.velocity(cableRun({ P: P0 }, [1]), 3, 7), v7 = A.velocity(cableRun({ P: A.params({ ttx: 0.7 }) }, [1]), 3, 7);
  assert.ok(v7 < 0.7 * v0 && v7 > 0.5 * v0, v7 / v0);
});

test('極強的超極化電流（滑桿最小 −49.1 µA/cm² 持續 50 ms）：數值不發散，膜電位趨近 E_L + I/g_L（試玩 11/12 抓到 RK4 發散）', () => {
  const I = -(Math.pow(10, 1.7) - 1);
  [P0, A.params({ T: 40, tea: 0.7, ttx: 0.13 })].forEach(P => {
    const rec = A.simulate(P, pulse(I, 60, 0), 50);
    for (let i = 0; i < rec.V.length; i++) assert.ok(isFinite(rec.V[i]) && isFinite(rec.m[i]) && isFinite(rec.h[i]) && isFinite(rec.n[i]), '第 ' + i + ' 筆不是有限值');
    close(rec.V[rec.V.length - 1], P.EL + I / P.gL, 0.5, '超極化的穩定膜電位');
  });
});

console.log(passed + ' 項通過');
