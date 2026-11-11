/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/circular-motion.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
// 用物理核心證明每個任務都做得到（事件格式與 js/circular-motion.js 相同）
'use strict';
const ROOT = __ROOT + '';
const CC = require(ROOT + 'js/circular-motion-core.js');
const missions = [];
global.window = { CircularCore: CC, LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/circular-motion.js');
const byId = id => missions.find(m => m.id === 'circular-motion-' + id);
const R2 = x => Math.round(x * 100) / 100;
const D2R = Math.PI / 180;

function setting(o) { // o: { r, T } 或 { r, v }（固定速率模式），m
  const hold = o.v != null ? 'v' : 'T';
  const T = hold === 'v' ? CC.periodFromSpeed(o.r, o.v) : o.T;
  const d = CC.derived({ r: o.r, T: T, m: o.m == null ? 0.5 : o.m });
  return { r: d.r, T: d.T, m: d.m, v: d.v, omega: d.omega, f: d.f, a: d.a, F: d.F, hold: hold };
}
const DEFAULT = setting({ r: 1.5, T: 3, m: 0.5 });
let committed = DEFAULT;
function params(o) { const cur = setting(o); const ev = Object.assign({ prev: committed }, cur); committed = cur; return { type: 'params', data: ev }; }
function cutData(o, thetaDeg, tCut) {
  const s = setting(o), th0 = thetaDeg * D2R;
  const c = CC.stateAt({ r: s.r, T: s.T, theta0: th0 }, tCut || 0);
  let th = CC.wrapAngle(c.theta) / D2R; if (th >= 360) th -= 360;
  return Object.assign(s, { theta0: th0, tCut: tCut || 0, theta: th, xc: c.x, yc: c.y, vx: c.vx, vy: c.vy });
}
function exitEv(o, thetaDeg) {
  const d = cutData(o, thetaDeg);
  const p = { r: d.r, T: d.T, theta0: d.theta0 };
  const tau = CC.exitTime(p, 3); // 飛出畫面（大約）
  const s = CC.releasedStateAt(p, 0, tau);
  return { type: 'exit', data: Object.assign(d, { tau: tau, x: s.x, y: s.y }) };
}
function pauseAttached(o, thetaDeg) {
  const s0 = setting(o), p = { r: s0.r, T: s0.T, theta0: thetaDeg * D2R };
  const s = CC.stateAt(p, 0);
  return { type: 'pause', data: Object.assign(s0, { attached: true, t: 0, theta: thetaDeg, x: s.x, y: s.y, vx: s.vx, vy: s.vy, ax: s.ax, ay: s.ay, d: Math.hypot(s.x, s.y), tau: 0 }) };
}
function pauseCut(o, thetaDeg, tau) {
  const s0 = setting(o), p = { r: s0.r, T: s0.T, theta0: thetaDeg * D2R };
  const s = CC.releasedStateAt(p, 0, tau);
  return { type: 'pause', data: Object.assign(s0, { attached: false, t: tau, theta: NaN, x: s.x, y: s.y, vx: s.vx, vy: s.vy, ax: 0, ay: 0, d: Math.hypot(s.x, s.y), tau: tau }) };
}
function lap(o, n) { return { type: 'lap', data: Object.assign(setting(o), { n: n }) }; }

let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { ok = !!m.check(e, m.mem); });
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}

// 預設狀態：所有任務都不觸發（預設設定的 params、播放中的 lap、預設設定下的暫停）
missions.forEach(m => {
  m.mem = {};
  const evs = [{ type: 'params', data: Object.assign({ prev: DEFAULT }, DEFAULT) }, { type: 'lap', data: Object.assign({}, DEFAULT, { n: 1 }) }, { type: 'lap', data: Object.assign({}, DEFAULT, { n: 5 }) },
    pauseAttached({ r: 1.5, T: 3 }, 37)];
  const hit = evs.some(e => m.check(e, m.mem));
  if (hit) { fail++; console.log('  ✗ 預設狀態觸發了 ' + m.id); }
});
console.log('  ✓ 預設狀態（未操作）不觸發任何任務');

// 1 放手
expect(1, [exitEv({ r: 1.5, T: 3 }, 37)], true, '預設條件下任意角度剪斷，飛出畫面');
// 2 a = 10
expect(2, [params({ r: 1.6, v: 4 })], true, '固定速率：r = 1.6、v = 4 → a = ' + setting({ r: 1.6, v: 4 }).a.toFixed(4));
expect(2, [params({ r: 1.01, T: 2 })], true, '固定週期：T = 2、r = 1.01 → a = ' + setting({ r: 1.01, T: 2 }).a.toFixed(4));
expect(2, [params({ r: 1.5, T: 3 })], false, '預設 a = 6.58');
// 3 兩倍的力
committed = DEFAULT;
expect(3, [params({ r: 1.5, T: 3, m: 1 })], true, '預設 m = 0.5 → 1.0（半徑、週期不變）F：' + DEFAULT.F.toFixed(3) + ' → ' + setting({ r: 1.5, T: 3, m: 1 }).F.toFixed(3));
committed = DEFAULT;
expect(3, [params({ r: 1.5, T: 2, m: 1 })], false, '同時改了週期');
// 4 筆直向上
expect(4, [exitEv({ r: 1.5, T: 3 }, 0)], true, '在 θ = 0.0° 剪斷（暫停後按剪斷）');
expect(4, [exitEv({ r: 1.5, T: 3 }, 359)], true, 'θ = 359.0°（誤差 1°）');
expect(4, [exitEv({ r: 1.5, T: 3 }, 3)], false, 'θ = 3°');
// 5 半徑不同、加速度相同
committed = DEFAULT;
expect(5, [params({ r: 0.5, T: 3 }), params({ r: 0.5, T: 1 }), params({ r: 2, T: 1 }), params({ r: 2, T: 2 })], true,
  '固定週期：(r 0.5, T 1) 與 (r 2, T 2)，a = ' + setting({ r: 0.5, T: 1 }).a.toFixed(3) + ' 與 ' + setting({ r: 2, T: 2 }).a.toFixed(3));
committed = DEFAULT;
expect(5, [params({ r: 0.5, v: 2 }), params({ r: 2, v: 2 }), params({ r: 2, v: 4 })], true, '固定速率：(0.5, v 2) 與 (2, v 4)，a = 8');
// 6 影子的極值
expect(6, [params({ r: 1, T: 3.14 })], true, '固定週期：r = 1.00、T = 3.14 → rω = ' + (setting({ r: 1, T: 3.14 }).v).toFixed(4) + '、rω² = ' + setting({ r: 1, T: 3.14 }).a.toFixed(4));
expect(6, [params({ r: 1, v: 2 })], true, '固定速率：r = 1.00、v = 2.00');
// 7 兩倍半徑
{
  const s = setting({ r: 1, T: 8 });
  const tau = Math.sqrt(3) / s.omega;
  expect(7, [pauseCut({ r: 1, T: 8 }, 50, tau)], true, 'r = 1、T = 8：剪斷後 τ = √3/ω = ' + tau.toFixed(3) + ' s 暫停（d = 2.00 m）');
  const rate = s.v * Math.sqrt(3) / 2; // dd/dτ
  console.log('      容許時間窗 ±' + (0.02 / rate).toFixed(3) + ' s（模擬時間；慢動作下實際 ±' + (0.02 / rate / 0.25).toFixed(2) + ' s）；讀數「與圓心距離」顯示到 0.01 m');
  expect(7, [pauseCut({ r: 1, T: 8 }, 50, tau * 1.05)], false, '晚 5%');
}
// 8 影子的加速度
{
  const o = { r: 2, T: 4.4 }, s = setting(o);
  const th = Math.acos(-2 / s.a) / D2R; // a_x = −a cosθ = +2
  expect(8, [pauseAttached(o, Math.round(th * 10) / 10)], true, 'r = 2、T = 4.4（a = ' + s.a.toFixed(3) + '）：在 θ = ' + th.toFixed(1) + '°（x = ' + (-2 / s.omega ** 2).toFixed(3) + ' m）暫停');
  const dth = 0.1 / (s.a * Math.sin(th * D2R)) / D2R;
  console.log('      容許角度窗 ±' + dth.toFixed(2) + '°；ω = ' + (s.omega / D2R).toFixed(1) + '°/s，慢動作 ' + (s.omega / D2R * 0.25).toFixed(1) + '°/s');
  expect(8, [pauseAttached(o, 180)], false, 'θ = 180°（a_x = a = ' + s.a.toFixed(2) + '）');
  expect(8, [pauseAttached({ r: 1, v: 1.41 }, 180)], false, 'a < 4 時（a = 1.99、θ = 180°）不算');
}
// 9 穿過角落
{
  for (const r of [1.5, 1.0]) {
    const th = CC.aimAngle(r, 2, 2) / D2R, L = Math.sqrt(8 - r * r);
    expect(9, [exitEv({ r: r, T: 8 }, Math.round(th * 10) / 10)], true, 'r = ' + r + '：在 θ = ' + th.toFixed(2) + '°（= 45° − arccos(r/2√2)）剪斷；容許角度 ±' + (0.03 / L / D2R).toFixed(2) + '°');
  }
  expect(9, [exitEv({ r: 2, T: 8 }, 0)], false, 'r = 2（> 1.5）在 θ = 0 剪斷雖然也會通過 (2, 2)，但不算');
}
// 10 一秒後兩公尺
{
  const o = { r: 1.2, v: 1.6 };
  const th = 100;
  expect(10, [pauseCut(o, th, 1.00)], true, '固定速率 r = 1.2、v = 1.6（√(r² + v²) = 2）：任意角度剪斷，1.00 s 時暫停 d = ' + CC.releaseDistance({ r: 1.2, T: CC.periodFromSpeed(1.2, 1.6) }, 1).toFixed(4));
  expect(10, [pauseCut({ r: 1.2, T: 4.71 }, th, 1.01)], true, '固定週期 r = 1.2、T = 4.71（v = ' + setting({ r: 1.2, T: 4.71 }).v.toFixed(4) + '）：1.01 s 暫停');
  expect(10, [pauseCut({ r: 1.6, v: 1.2 }, th, 1.00)], true, '另一解 r = 1.6、v = 1.2');
  expect(10, [pauseCut({ r: 1.5, T: 3 }, th, 1.0)], false, '預設條件 1.00 s 時 d = ' + CC.releaseDistance({ r: 1.5, T: 3 }, 1).toFixed(3));
}
// 11 指定的速度向量
{
  const dir = Math.atan2(1.6, -1.2) / D2R, th = dir - 90;
  expect(11, [exitEv({ r: 2, v: 2 }, Math.round(th * 10) / 10)], true, '固定速率 v = 2.00（任意 r，例如 2）：在 θ = ' + th.toFixed(2) + '° 剪斷（速度方向 ' + dir.toFixed(2) + '°）');
  expect(11, [exitEv({ r: 1, T: 3.14 }, 36.9)], true, '固定週期 r = 1、T = 3.14（v = 2.001）：θ = 36.9°');
  console.log('      容許角度窗約 ±' + (0.03 / 1.6 / D2R).toFixed(2) + '°');
  expect(11, [exitEv({ r: 2, v: 2 }, 39)], false, 'θ = 39°');
}
// 12 準時命中
{
  const th = CC.aimAngle(1.2, -2, 0) / D2R;
  expect(12, [exitEv({ r: 1.2, v: 1.6 }, Math.round(th * 10) / 10)], true, '固定速率 r = 1.2、v = 1.6：在 θ = ' + th.toFixed(2) + '°（180° − arccos 0.6）剪斷 → τ = 1.000 s');
  expect(12, [exitEv({ r: 1.2, T: 4.71 }, 126.9)], true, '固定週期 r = 1.2、T = 4.71：θ = 126.9°');
  expect(12, [exitEv({ r: 1.5, T: 3 }, CC.aimAngle(1.5, -2, 0) / D2R)], false, '預設條件瞄準 (−2, 0)：τ = ' + CC.passPoint({ r: 1.5, T: 3, theta0: CC.aimAngle(1.5, -2, 0) }, 0, -2, 0).tau.toFixed(3) + ' s');
  console.log('      容許角度窗約 ±' + (0.03 / 1.6 / D2R).toFixed(2) + '°');
}
// h1 細繩呻吟 F ≥ 200 N
expect('h1', [params({ r: 0.5, v: 8, m: 2 })], true, '固定速率 r = 0.5、v = 8、m = 2 → F = ' + setting({ r: 0.5, v: 8, m: 2 }).F.toFixed(1) + ' N');
expect('h1', [params({ r: 2, T: 1, m: 2 })], false, '固定週期的最大值 r = 2、T = 1、m = 2 → F = ' + setting({ r: 2, T: 1, m: 2 }).F.toFixed(1) + ' N（不夠）');
// h2 同一條路
expect('h2', [exitEv({ r: 1.5, T: 3 }, 20), exitEv({ r: 1.5, T: 6 }, 20.5)], true, 'r = 1.5，同在 θ ≈ 20° 剪斷，T = 3 與 6（速率比 2）');
expect('h2', [exitEv({ r: 1.5, T: 3 }, 20), exitEv({ r: 1.5, T: 4 }, 20)], false, '速率比 1.33');
// h3 最輕的牽引
expect('h3', [lap({ r: 0.5, T: 8, m: 0.1 }, 1)], true, 'r = 0.5、T = 8、m = 0.1 → F = ' + setting({ r: 0.5, T: 8, m: 0.1 }).F.toFixed(4) + ' N，轉滿一圈');
expect('h3', [lap({ r: 2, v: 1, m: 0.1 }, 1)], false, '固定速率最小 F（r 2、v 1、m 0.1）= ' + setting({ r: 2, v: 1, m: 0.1 }).F.toFixed(3) + ' N');

console.log(fail ? '\n有 ' + fail + ' 項失敗' : '\n全部通過');
process.exitCode = fail ? 1 : 0;
