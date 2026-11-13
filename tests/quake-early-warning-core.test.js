// 以 Node 執行：node tests/quake-early-warning-core.test.js
'use strict';
const assert = require('assert');
const E = require('../js/quake-early-warning-core.js');
const QC = E.QC;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }

console.log('quake-early-warning-core');

test('到時：震央正上方 P 波 h/VP、S 波 h/VS；S−P 時差 = R(1/VS − 1/VP)', () => {
  near(E.tP(0, 12), 2, 1e-12);
  near(E.tS(0, 14), 4, 1e-12);
  const R = Math.hypot(30, 40);
  near(E.tS(30, 40) - E.tP(30, 40), R * (1 / 3.5 - 1 / 6), 1e-12);
});

test('盲區半徑：S 波在 T_a 時刻剛好到達 r_b（r_b 上預警時間 = 0）', () => {
  near(E.blindRadius(10, 10), Math.sqrt(35 * 35 - 100), 1e-12);
  [[8, 5], [12, 20], [20, 60]].forEach(function (c) {
    const rb = E.blindRadius(c[0], c[1]);
    near(E.tS(rb, c[1]), c[0], 1e-9, 'T_a=' + c[0] + ', h=' + c[1]);
  });
  // 深源：VS·T_a ≤ h 時沒有盲區
  assert.strictEqual(E.blindRadius(10, 35), 0);
  assert.strictEqual(E.blindRadius(10, 50), 0);
  // 盲區隨 T_a 單調變大
  let last = -1;
  for (let t = 3; t < 30; t += 1) { const r = E.blindRadius(t, 10); assert.ok(r > last); last = r; }
});

test('現地型盲區：R(1/VS − 1/VP) = t_on，震源距離 25.2 km', () => {
  const R = 3 / (1 / 3.5 - 1 / 6);
  near(R, 25.2, 0.01);
  near(E.onsiteBlindRadius(10), Math.sqrt(R * R - 100), 1e-9);
  assert.strictEqual(E.onsiteBlindRadius(30), 0);
});

test('波前在地表的半徑：t = R/v 時剛好到達震央距離 d', () => {
  near(E.surfaceRadius(Math.hypot(40, 10) / 6, 10, 6), 40, 1e-9);
  assert.strictEqual(E.surfaceRadius(1, 10, 6), 0);
});

test('測站網：間距 20 km 約 100 站（臺灣本島約 3.6 萬 km²），間距減半約變 4 倍；全部在陸上或三個離島', () => {
  const s20 = E.stations(20), s10 = E.stations(10);
  assert.ok(s20.length > 85 && s20.length < 130, '20 km：' + s20.length);
  const r = (s10.length - 3) / (s20.length - 3);
  assert.ok(r > 3.6 && r < 4.4, '比值 ' + r);
  s20.slice(0, -3).forEach(function (s) { assert.ok(QC.onLand(s.lon, s.lat)); });
  assert.strictEqual(E.stations(20, true).length, s20.length + E.SEA_ST.length);
});

test('發布時刻：N = 1 是最近測站的 P 波到時 + t_proc；N 越大越晚', () => {
  const st = E.stations(20), q = { x: 10, y: 5, h: 10 };
  let best = Infinity;
  st.forEach(function (s) { best = Math.min(best, E.tP(Math.hypot(s.x - q.x, s.y - q.y), 10)); });
  near(E.alertTime(q, st, 1, 0).Ta, best, 1e-12);
  near(E.alertTime(q, st, 1, 4).Ta, best + 4, 1e-12);
  let last = 0;
  for (let n = 1; n <= 10; n++) { const a = E.alertTime(q, st, n, 4).Ta; assert.ok(a >= last); last = a; }
  // 測站越密，警報越早
  assert.ok(E.alertTime(q, E.stations(10), 6, 4).Ta < E.alertTime(q, E.stations(30), 6, 4).Ta);
});

test('衰減式（Chang 等 2001）：淺層與隱沒板塊兩式照公式算', () => {
  // 淺層：M 6、震央距離 20 km、深度 10 km
  const lnA = 2.8096 + 0.8993 * 6 - 0.4381 * Math.log(10) - (1.0954 - 0.0079 * 10) * Math.log(20);
  near(E.pga(6, 20, 10), Math.exp(lnA), 1e-9);
  near(E.pga(6, 20, 10), 63.55, 0.01);
  // 隱沒板塊：M 6、震央正上方、深度 50 km
  near(E.pga(6, 0, 50), Math.exp(4.7141 + 0.8468 * 6 - 0.1745 * Math.log(50) - 1.2972 * Math.log(50)), 1e-9);
  // 震央距離小於 5 km 用 5 km
  near(E.pga(6, 0, 10), E.pga(6, 5, 10), 1e-12);
  near(E.pga(6, 3, 10), E.pga(6, 5, 10), 1e-12);
});

test('衰減式：距離越遠越小、規模越大越大；規模多 1，PGA 約變 e^0.9 ≈ 2.46 倍', () => {
  [10, 30].forEach(function (h) {
    let last = Infinity;
    for (let d = 5; d < 400; d += 5) { const a = E.pga(6.5, d, h); assert.ok(a < last); last = a; }
  });
  near(E.pga(7, 50, 10) / E.pga(6, 50, 10), Math.exp(0.8993), 1e-9);
});

test('震度：中央氣象署 PGA 分級的邊界', () => {
  [[0.79, 0], [0.8, 1], [2.49, 1], [2.5, 2], [7.99, 2], [8, 3], [24.9, 3], [25, 4], [79.9, 4], [80, 5], [900, 5]].forEach(function (c) {
    assert.strictEqual(E.intensity(c[0]), c[1], c[0] + ' gal');
  });
});

test('預估震度 4 級的半徑：PGA 剛好 25 gal', () => {
  [[6, 10], [7, 15], [6.5, 40]].forEach(function (c) {
    const r = E.radiusFor(c[0], c[1], 4);
    assert.ok(r > 0 && isFinite(r));
    near(E.pga(c[0], r, c[1]), 25, 1e-6);
  });
  assert.strictEqual(E.radiusFor(3, 10, 4), -1);
});

test('情境：盲區邊上的預警時間 = 0；預估規模低估，發警報的範圍變小；預估規模 < 5 不發', () => {
  const p = QC.toXY(121.67, 23.77);
  const q = { x: p.x, y: p.y, h: 15.5, M: 7.4, dM: 0 };
  const s = E.scenario(q, { spacing: 20, n: 6, proc: 4 });
  const e = s.site(q.x + s.rb, q.y);
  assert.ok(e.alerted);
  near(e.lead, 0, 1e-9);
  assert.ok(s.site(q.x + s.rb + 1, q.y).lead > 0 && s.site(q.x + s.rb - 1, q.y).lead < 0);
  const low = E.scenario(Object.assign({}, q, { dM: -0.6 }), { spacing: 20, n: 6, proc: 4 });
  assert.ok(low.rAlert < s.rAlert);
  const none = E.scenario(Object.assign({}, q, { M: 5.2, dM: -0.4 }), { spacing: 20, n: 6, proc: 4 });
  assert.strictEqual(none.issue, false);
  assert.strictEqual(none.site(q.x + 30, q.y).alerted, false);
});

test('現地型：近處預警時間比區域型長（盲區縮小）', () => {
  const q = { x: 0, y: 0, h: 10, M: 6.5, dM: 0 };
  const opt = { spacing: 20, n: 6, proc: 4, onsite: true };
  const s = E.scenario(q, opt);
  assert.ok(s.rbOn < s.rb);
  const e = s.site(30, 0);
  near(e.leadOn, e.sp - 3, 1e-12);
  assert.ok(e.best >= e.lead);
});

test('2024 花蓮地震（模型）：盲區約 30–45 km，臺北預警時間 20–35 秒', () => {
  const p = QC.toXY(121.67, 23.77);
  const s = E.scenario({ x: p.x, y: p.y, h: 15.5, M: 7.4, dM: 0 }, { spacing: 20, n: 6, proc: 4 });
  assert.ok(s.rb > 30 && s.rb < 45, 'r_b = ' + s.rb);
  const tpe = QC.toXY(121.51, 25.04), e = s.site(tpe.x, tpe.y);
  assert.ok(e.lead > 20 && e.lead < 35, '臺北 ' + e.lead);
});

console.log('quake-early-warning-core：' + passed + ' 項通過');
