/* 任務可達成的證明腳本。用法：node tools/mission-proofs/lines-circles.js
 * 用數學核心證明每個任務在滑桿範圍與精度內做得到（事件格式與 js/lines-circles.js 的 emitNow 相同），並確認預設狀態不會觸發任務。
 * 滑桿：h、k 是 −8 到 8、r 是 0.5 到 8（間隔 0.5）；a、b 是 −10 到 10 的整數；c 是 −40 到 40（間隔 0.5）；P 是 −10 到 10（間隔 0.5）。
 * 點數字都可以打到小數第 2 位，拖曳 P 是 0.05 一格、拖曳直線讓 c 到 0.01。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const G = require(ROOT + 'js/lines-circles-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/lines-circles.js');
const byId = id => missions.find(m => m.id === 'lines-circles-' + id);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;
const DEF = { h: 0, k: 0, r: 4, a: 1, b: 2, c: -12, px: 7, py: 3 };

function lineEv(o, chal) {
  const s = Object.assign({}, DEF, o);
  const d = G.dist(s.a, s.b, s.c, s.h, s.k), rel = G.relation(d, s.r), q = G.quadratic(s.a, s.b, s.c, s.h, s.k, s.r);
  return { type: 'line', data: { a: s.a, b: s.b, c: s.c, h: s.h, k: s.k, r: s.r, d: d, rel: rel, chord: rel === 'cross' ? G.chord(d, s.r) : null,
    pts: G.intersections(s.a, s.b, s.c, s.h, s.k, s.r), foot: G.foot(s.a, s.b, s.c, s.h, s.k), disc: q ? q.disc : null, chal: !!chal } };
}
function tanEv(o) {
  const s = Object.assign({}, DEF, o), q = G.tangentsFrom(s.px, s.py, s.h, s.k, s.r);
  return { type: 'tan', data: { px: s.px, py: s.py, h: s.h, k: s.k, r: s.r, L: q.L, len: q.len, angle: q.on ? null : q.angle, on: q.on, inside: q.inside } };
}
/** 數值都在打字精度（0.01）上、在滑桿範圍內 */
function typed(o) {
  const lim = { h: 8, k: 8, r: 8, a: 10, b: 10, c: 40, px: 10, py: 10 };
  return Object.keys(o).every(k => Math.abs(o[k]) <= lim[k] + 1e-9 && Math.abs(o[k] * 100 - Math.round(o[k] * 100)) < 1e-6) && (o.r == null || o.r >= 0.5);
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
function reach(id, kind, o, note) {
  if (!typed(o)) { fail++; console.log('  ✗ ' + id + ' 的範例超出範圍或精度'); return; }
  expect(id, [kind === 'tan' ? tanEv(o) : lineEv(o)], true, note);
}

// ---------- 預設狀態不觸發 ----------
{
  const evs = [lineEv({}), tanEv({})];
  const hit = missions.filter(m => evs.some(e => { m.mem = {}; return m.check(e, m.mem); })).map(m => m.id);
  const q = lineEv({}).data, t = tanEv({}).data;
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態（d = ' + q.d.toFixed(3) + ' > r = 4；P 的切線長 ' + t.len.toFixed(3) + '、夾角 ' + t.angle.toFixed(1) + '°）不觸發任務');
}

// ---------- 一般任務 ----------
expect(1, [{ type: 'drag', data: { what: 'center' } }], true, '拖曳圓心');
expect(1, [{ type: 'drag', data: { what: 'line' } }], false, '拖直線不算');
reach(2, 'line', { a: 1, b: 2, c: 0 }, 'x + 2y = 0 通過原點（圓心）');
expect(2, [lineEv({ a: 0, b: 1, c: 0 })], false, '水平線 y = 0 不算（不是斜的）');
reach(3, 'line', { a: 3, b: 4, c: -20 }, '3x + 4y − 20 = 0：d = 20/5 = 4 = r');
expect(3, [lineEv({ a: 0, b: 1, c: -4 })], false, '水平線 y = 4 不算');
reach(3, 'line', { a: 1, b: 2, c: -8.94 }, 'x + 2y − 8.94 = 0：d = ' + (8.94 / Math.sqrt(5)).toFixed(4) + '（打字到 0.01）');
expect(4, [lineEv({ a: 3, b: 4, c: -25 }), lineEv({ a: 3, b: 4, c: -20 }), lineEv({ a: 3, b: 4, c: -10 })], true, '3x + 4y + c：c = −25 相離、−20 相切、−10 相交');
expect(4, [lineEv({ a: 3, b: 4, c: -25 }), lineEv({ a: 3, b: 4, c: -20 }), lineEv({ a: 3, b: 4, c: -10, r: 4.5 })], false, '中間改了半徑（換了一個圓）');
reach(5, 'line', { r: 5, a: 3, b: 4, c: -15 }, '半徑 5、3x + 4y − 15 = 0：d = 3，弦長 2√(25 − 9) = 8');
expect(5, [lineEv({ r: 4, a: 3, b: 4, c: 0 })], false, '半徑 4 的直徑也是 8，但半徑不是 5');
reach(6, 'tan', { r: 3, px: 5, py: 0 }, '半徑 3、P = (5, 0)：切線長 4');
reach(6, 'tan', { r: 3, px: 3, py: 4 }, 'P = (3, 4) 也是 PC = 5');
reach(7, 'tan', { r: 3, px: 3, py: 3 }, '半徑 3、P = (3, 3)：PC = 3√2，夾角 ' + G.tangentsFrom(3, 3, 0, 0, 3).angle.toFixed(4) + '°');
reach(7, 'tan', { r: 4, px: 5.66, py: 0 }, '半徑 4、P = (5.66, 0)（打字）：夾角 ' + G.tangentsFrom(5.66, 0, 0, 0, 4).angle.toFixed(3) + '°');
reach(8, 'tan', { r: 5, px: 3, py: 4 }, '半徑 5、P = (3, 4) 在圓上');
reach(8, 'tan', { r: 4, px: 2.83, py: 2.83 }, '半徑 4、P = (2.83, 2.83)：PC = ' + Math.hypot(2.83, 2.83).toFixed(4));
expect(8, [tanEv({ r: 4, px: 4, py: 0 })], false, 'P = (4, 0) 在水平線上（太簡單）');
reach(9, 'line', { r: 5, a: 3, b: 4, c: -25 }, 'x² + y² = 25 與 3x + 4y − 25 = 0 切於 (3, 4)');
expect(9, [lineEv({ r: 5, a: 6, b: 8, c: -40 })], false, '6x + 8y − 40 = 0：d = 4，沒有相切（6x + 8y − 50 = 0 才相切，但 c 超出範圍）');
expect(9, [lineEv({ r: 5, a: 4, b: 3, c: -25 })], false, '4x + 3y − 25 = 0 切於 (4, 3)，不是 (3, 4)');
reach(10, 'line', { r: 5, a: 1, b: -1, c: 1 }, 'x² + y² = 25 與 x − y + 1 = 0 交於 (−4, −3)、(3, 4)');
reach(10, 'line', { r: 5, a: 1, b: 7, c: -25 }, 'x + 7y − 25 = 0 交於 (−3, 4)、(4, 3)');
expect(10, [lineEv({ r: 5, a: 4, b: -3, c: 0 })], false, '4x − 3y = 0 通過圓心（交點 (3, 4)、(−3, −4)）不算');
expect(10, [lineEv({ r: 5, a: 0, b: 1, c: -3 })], false, '水平線 y = 3 交於 (±4, 3) 不算（不是斜的）');
expect(11, [{ type: 'challenge', data: { time: 30, streak: 1, last3: null } }], true, '答對一題（每題都做得到：見單元測試的 2000 題）');
expect(12, [{ type: 'challenge', data: { time: 25, streak: 3, last3: 80 } }], true, '三題共 80 秒');
expect(12, [{ type: 'challenge', data: { time: 40, streak: 3, last3: 100 } }], false, '三題共 100 秒');
expect(3, [lineEv({ a: 3, b: 4, c: -20 }, true)], false, '挑戰中不算一般任務');

// ---------- 隱藏任務 ----------
reach('h1', 'tan', { r: 0.5, px: 10, py: 10 }, '半徑 0.5、P = (10, 10)：夾角 ' + G.tangentsFrom(10, 10, 0, 0, 0.5).angle.toFixed(2) + '°');
reach('h1', 'tan', { r: 1, h: -8, k: -8, px: 10, py: 10 }, '圓心 (−8, −8)、半徑 1、P = (10, 10)：夾角 ' + G.tangentsFrom(10, 10, -8, -8, 1).angle.toFixed(2) + '°');
expect('h1', [tanEv({})], false, '預設夾角 ' + tanEv({}).data.angle.toFixed(1) + '°');
{
  // 弦長 = 半徑：d = r√3/2；半徑 4 時 d = 2√3 = 3.4641，直線 x = 3.46 → 用 a = 1、b = 1：c = −3.4641·√2 = −4.899
  const c = -Math.round(2 * Math.sqrt(3) * Math.SQRT2 * 100) / 100;
  const ev = lineEv({ r: 4, a: 1, b: 1, c: c });
  expect('h2', [ev], true, '半徑 4、x + y + (' + c + ') = 0：弦長 ' + ev.data.chord.toFixed(4));
  expect('h2', [lineEv({ r: 2, a: 0, b: 1, c: -1.73 })], true, '半徑 2、水平線 y = 1.73 也行：弦長 ' + lineEv({ r: 2, a: 0, b: 1, c: -1.73 }).data.chord.toFixed(4));
expect('h2', [lineEv({ r: 4, a: 0, b: 1, c: -3.46 })], false, '半徑 4、y = 3.46：弦長 ' + lineEv({ r: 4, a: 0, b: 1, c: -3.46 }).data.chord.toFixed(4) + '（半徑大時要用斜線細調）');
  expect('h2', [lineEv({ r: 4, a: 0, b: 1, c: -3.5 })], false, 'y = 3.5（滑桿格點）：弦長 ' + lineEv({ r: 4, a: 0, b: 1, c: -3.5 }).data.chord.toFixed(4));
}

// ---------- 星星總數 ----------
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const sp = pub.reduce((s, m) => s + starsOf(m), 0), sh = hid.reduce((s, m) => s + starsOf(m), 0);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('  ✗ 隱藏任務超過 20 顆'); }
console.log('\n公開 ' + pub.length + ' 個 ' + sp + ' 顆、隱藏 ' + hid.length + ' 個 ' + sh + ' 顆，共 ' + (sp + sh) + ' 顆。');
console.log(fail ? fail + ' 項失敗' : '全部通過');
if (fail) process.exit(1);
