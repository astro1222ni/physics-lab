/* 任務可達成的證明腳本。用法：node tools/mission-proofs/plane-vectors.js
 * 用數學核心證明每個任務在滑桿範圍與打字精度內做得到（事件格式與 js/plane-vectors.js 的 emitLin／emitDot 相同），並確認預設狀態不會觸發任務。
 * 滑桿：a、b 的分量是 −5 到 5 的整數；x、y 是 −4 到 4（打字到小數第 3 位，拖曳 P 時會吸到 0.5 的倍數）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const M = require(ROOT + 'js/plane-vectors-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/plane-vectors.js');
const byId = id => missions.find(m => m.id === 'plane-vectors-' + id);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;
const dec = (v, d) => Math.abs(v * Math.pow(10, d) - Math.round(v * Math.pow(10, d))) < 1e-6;
const intv = u => u.every(c => Number.isInteger(c) && c >= -5 && c <= 5);

function linEv(a, b, x, y, region) {
  if (!intv(a) || !intv(b)) throw new Error('向量超出範圍');
  if (!(x >= -4 && x <= 4 && y >= -4 && y <= 4 && dec(x, 3) && dec(y, 3))) throw new Error('係數超出範圍或精度：' + x + '、' + y);
  return { type: 'lin', data: { a: a, b: b, x: x, y: y, det: M.det(a, b), region: region || 'none', inside: M.inRegion(region || 'none', x, y, 1e-9), chal: false } };
}
function dotEv(a, b) {
  if (!intv(a) || !intv(b)) throw new Error('向量超出範圍');
  return { type: 'dot', data: { a: a, b: b, dot: M.dot(a, b), det: M.det(a, b), aa: M.dot(a, a), bb: M.dot(b, b) } };
}

let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { ok = ok || !!m.check(e, m.mem); });
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}

// ---------- 預設狀態不觸發 ----------
{
  const evs = [linEv([2, 1], [1, 2], 1, 1), dotEv([2, 1], [1, 2])];
  const hit = missions.filter(m => evs.some(e => { m.mem = {}; return m.check(e, m.mem); })).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態（a = (2, 1)、b = (1, 2)、P = a + b）不觸發任務');
}

// ---------- 線性組合 ----------
expect(1, [linEv([2, 1], [1, 2], 2, 1)], true, 'P = 2a + b = (5, 4)');
expect(1, [linEv([2, 1], [4, 2], 2, 1), linEv([2, 1], [1, 2], 1, 2)], false, 'a、b 平行、x 和 y 對調都不算');
expect(2, [linEv([2, 1], [1, 2], -0.5, 1.5, 'line')], true, 'x + y = 1、x = −0.5、y = 1.5（拖曳時會吸到這個格點）');
expect(2, [linEv([2, 1], [1, 2], 1.5, -0.5, 'line'), linEv([2, 1], [1, 2], -0.5, 1.4, 'line'), linEv([2, 1], [1, 2], -0.5, 1.5, 'none')], false, 'x > 0、不在直線上、沒標範圍都不算');
expect(3, [linEv([2, 1], [-4, -2], 1, 1)], true, 'a = (2, 1)、b = (−4, −2)');
expect(3, [linEv([2, 1], [0, 0], 1, 1)], false, 'b 是零向量不算');
expect(4, [linEv([3, 0], [1, 3], 0.333, 0.333)], true, '打 x = y = 0.333');
expect(4, [linEv([3, 0], [1, 3], 0.3, 0.35)], false, 'x = 0.3 差 0.033 太遠');
{
  const P = M.comb([3, 0], [1, 3], 0.667, 0.333), A = [3, 0], B = [1, 3];
  const r = M.len(M.sub(P, A)) / M.len(M.sub(B, P));
  expect(5, [linEv([3, 0], [1, 3], 0.667, 0.333)], true, '打 x = 0.667、y = 0.333：AP : PB = ' + r.toFixed(4));
}
expect(5, [linEv([3, 0], [1, 3], 0.333, 0.667), linEv([3, 0], [1, 3], 0.65, 0.35)], false, '1 : 2 反過來、差太多都不算');

// ---------- 內積 ----------
expect(6, [dotEv([2, 1], [-1, 2])], true, '(2, 1) · (−1, 2) = 0');
expect(6, [dotEv([2, 0], [0, 3]), dotEv([2, 1], [1, 2])], false, 'a 在座標軸上、不垂直都不算');
expect(7, [dotEv([2, 0], [-1, 3])], true, 'a = (2, 0)、b = (−1, 3)：正射影 (−1, 0) = −a/2');
expect(7, [dotEv([2, 2], [-2, 0])], true, 'a = (2, 2)、b = (−2, 0)：a · b = −4 = −|a|²/2，正射影 (−1, −1) = −a/2');
expect(7, [dotEv([2, 2], [-1, 0])], false, 'a = (2, 2)、b = (−1, 0)：正射影是 −a/4，不算');
expect(8, [dotEv([3, 1], [1, 4])], false, '(3, 1)、(1, 4) 面積 11');
expect(8, [dotEv([3, 1], [-1, 3])], true, '(3, 1)、(−1, 3)：det = 10');
expect(8, [dotEv([5, 0], [1, 2])], false, 'a 在座標軸上不算');
expect(9, [dotEv([3, 4], [-4, 3])], true, '(3, 4)、(−4, 3)');
expect(9, [dotEv([5, 0], [0, 5]), dotEv([3, 4], [4, 3])], false, '在座標軸上、不垂直都不算');
expect('h1', [dotEv([2, 1], [4, 2])], true, 'b = 2a：影子就是 b 自己');
expect('h1', [dotEv([2, 1], [0, 0])], false, '零向量不算');
expect('h2', [dotEv([1, 0], [1, 1])], true, '(1, 0)、(1, 1)：a · b = det = 1，夾角 45°');
expect('h2', [dotEv([2, 1], [1, 3])], true, '(2, 1)、(1, 3)：a · b = det = 5，夾角 45°');
expect('h2', [dotEv([1, 0], [-1, 1])], false, '135° 時 a · b < 0 不算');

// ---------- 挑戰 ----------
expect(10, [{ type: 'challenge', data: { time: 15, streak: 1, last3: null } }], true, '答對一題');
expect(11, [{ type: 'challenge', data: { time: 15, streak: 3, last3: 55 } }], true, '連續三題 55 秒');
expect(11, [{ type: 'challenge', data: { time: 25, streak: 3, last3: 61 } }], false, '超過 60 秒不算');
{
  const R = M.rng(7); let bad = 0, last = null;
  for (let t = 0; t < 1000; t++) {
    const c = M.genChallenge(R, last); last = c;
    try { linEv(c.a, c.b, c.x, c.y); } catch (e) { bad++; }
  }
  if (bad) { fail++; console.log('  ✗ 有 ' + bad + ' 題超出滑桿範圍'); } else console.log('  ✓ 1000 題挑戰的 a、b、x、y 都在滑桿範圍內');
}

const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const sp = pub.reduce((s, m) => s + starsOf(m), 0), sh = hid.reduce((s, m) => s + starsOf(m), 0);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('  ✗ 隱藏任務超過 20 顆'); }
console.log('\n公開 ' + pub.length + ' 個 ' + sp + ' 顆、隱藏 ' + hid.length + ' 個 ' + sh + ' 顆，共 ' + (sp + sh) + ' 顆。');
console.log(fail ? fail + ' 項失敗' : '全部通過');
if (fail) process.exit(1);
