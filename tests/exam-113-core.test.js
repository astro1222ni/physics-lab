'use strict';
// 113 學測物理核心：圖 8、圖 9 讀點對得上原卷，磁鐵穿環圈的正負號與對稱，眼睛對焦，四種力，冰箱房間。
const assert = require('node:assert/strict');
const C = require('../js/exam/113-core');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` ${a} vs ${b}`);

// 圖 8：電子束約 1.8 cm 歸零；質子峰約 11.5 cm、約 13 cm 歸零；15 cm 只剩兩條 X 光（第 22 題 E）
assert.equal(C.dose('electron', 1.9), 0);
let peak = 0, at = 0; for (let x = 8; x <= 13; x += .01) { const d = C.dose('proton', x); if (d > peak) { peak = d; at = x; } }
near(at, 11.5, .2, '質子峰位置'); assert.ok(peak > .95);
assert.equal(C.dose('proton', 13), 0);
assert.ok(C.dose('x4', 15) > .3 && C.dose('x20', 15) > .5 && C.dose('electron', 15) === 0 && C.dose('proton', 15) === 0);
// 第 23 題 D：2–10 cm 之間 20 MeV X 光是四條裡最高的
for (let x = 2; x <= 10; x += .1) for (const b of ['electron', 'x4', 'proton']) assert.ok(C.dose('x20', x) >= C.dose(b, x) - 1e-9, `2–10 cm 的 ${b} @${x}`);
// 第 23 題 B：腫瘤在 10–11 cm，質子的劑量比最好；A（電子打 10 cm）最差
const r = b => C.doseRatio(b, 10, 11).ratio;
assert.ok(r('proton') > r('x20') && r('proton') > r('x4') && r('proton') > r('electron'));
assert.equal(C.doseRatio('electron', 10, 11).tumor, 0);
// 第 23 題 C：0–2 cm 用 4 MeV X 光，後面還留很多劑量；電子束的劑量比好得多
assert.ok(C.doseRatio('electron', 0, 2).ratio > 3 * C.doseRatio('x4', 0, 2).ratio);
// 第 22 題 C：光子頻率比 = 能量比 = 5；D：150 MeV 質子仍慢於光
near(C.photonFrequency(20) / C.photonFrequency(4), 5, 1e-12);
near(C.photonFrequency(4), 9.67e20, 1e18, '4 MeV 光子頻率');
assert.ok(C.protonBeta(150) < .51 && C.protonBeta(150) > .5);

// 圖 9：飽和約 262 kPa，一半約 131 kPa 在 30 ms 左右（第 26 題 C）
near(C.pressure(60), 262, 1); near(C.timeFor(C.SAT / 2), 30, 1.5, '半飽和時間');
assert.ok(C.timeFor(C.SAT / 2) > 20 && C.timeFor(C.SAT / 2) < 40);
for (let t = 0; t < 60; t += .5) assert.ok(C.pressure(t + .5) >= C.pressure(t) - 1e-9, '壓力單調上升');
// 第 27 題：50 kg、30→15 m/s、0.030 s → −25000 N（向西）；Δt 加倍力減半
const k = C.crash(50, C.kmh(108), C.kmh(54), .030);
near(k.F, -25000, 1e-6); near(k.a, -500, 1e-9); near(k.dp, -750, 1e-9);
near(C.crash(50, 30, 15, .060).F, k.F / 2, 1e-6);

// 第 44–46 題：0–6 s 負、6–12 s 正，3 s 附近最負，對 (6,0) 點對稱，力恆向上
let tmin = 0, imin = 0; for (let t = .5; t < 6; t += .01) { const i = C.current(t); if (i < imin) { imin = i; tmin = t; } }
near(tmin, 3, .15, '最負在 3 秒'); assert.ok(imin < 0);
for (let t = .5; t < 5.5; t += .25) { assert.ok(C.current(t) < 0, '0–6 s 為負 @' + t); near(C.current(12 - t), -C.current(t), 1e-6, '點對稱 @' + t); }
for (let t = 6.5; t < 11.5; t += .25) assert.ok(C.current(t) > 0, '6–12 s 為正 @' + t);
near(C.current(6), 0, 1e-3, '6 秒電流為零');
let tmax = 0, imax = 0; for (let t = 6; t < 12; t += .01) { const i = C.current(t); if (i > imax) { imax = i; tmax = t; } }
near(tmax, 9, .15, '最正在 9 秒');
for (let t = .5; t < 11.5; t += .5) assert.ok(C.forceUp(t) >= 0, '磁力向上 @' + t);
// 第 45 題：同一位置，速度加倍電流加倍（D）；圈數加倍電流加倍（E 錯）；乙不在式子裡（B）
const tD = 2.4;
near(C.current(tD / 2, { v: 2 }), 2 * C.current(tD), 1e-6, '速度加倍');
near(C.current(tD, { turns: 2 }), 2 * C.current(tD), 1e-9, '圈數加倍');
assert.notEqual(C.current(tD, { a: .8 }), C.current(tD), '甲的面積變了電流就變（A 錯）');

// 第 21 題：放鬆看無窮遠清楚、看 25 cm 要多 4 D；瞳孔只改亮度不改焦點
assert.ok(C.eyeImage(Infinity, C.relaxed).sharp);
assert.ok(!C.eyeImage(.25, C.relaxed).sharp && C.eyeImage(.25, C.relaxed + 4).sharp);
const wide = C.eyeImage(.25, C.relaxed, 8e-3), small = C.eyeImage(.25, C.relaxed, 2e-3);
near(wide.q, small.q, 1e-12); assert.ok(wide.light > small.light && wide.blur > small.blur);

// 第 20 題：1 fm 強力最大；1 cm 時強力、弱力實際上是零，電力、重力都還在（都是平方反比）
const f1 = C.forces(1e-15), f2 = C.forces(1e-2);
assert.ok(f1.strong > f1.em && f1.em > f1.weak && f1.em > f1.grav);
assert.ok(f2.strong === 0 && f2.weak === 0 && f2.em > 0 && f2.grav > 0);
near(f2.em / C.forces(2e-2).em, 4, 1e-9); near(f2.grav / C.forces(2e-2).grav, 4, 1e-9);

// 第 24 題：密閉房間 2 小時、150 W → 室溫升 3.6 K；放熱 = 吸熱 + 功
const rm = C.room(2); near(rm.T - 26, 3.6, 1e-9); near(rm.Qh, rm.Qc + rm.W, 1e-6);
// 第 25 題：1 度、COP 2.5 → 9.0×10^6 J
near(C.heatMoved(1, 2.5).Q, 9e6, 1e-6);
console.log('113 學測物理核心全部通過');
