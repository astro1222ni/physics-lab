/* 任務可達成的證明腳本。用法：node tools/mission-proofs/space-vectors.js
 * 用數學核心證明每個任務在滑桿範圍與精度內做得到（事件格式與 js/space-vectors.js 的 emitVec 相同），並確認預設狀態不會觸發任務。
 * 滑桿：向量分量 −4 到 4、間隔 0.5（點數字可打到 0.01）；d 是 −10 到 10、間隔 0.5。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const SV = require(ROOT + 'js/space-vectors-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/space-vectors.js');
const byId = id => missions.find(m => m.id === 'space-vectors-' + id);

const DEF = { a: [-0.5, 2.5, 2], b: [-2, 0.5, 1.5], c: [1, -1, 2], n: [1, 1, 2], q: [2, -1, 3], d: 4 };
/** 與頁面的 emitVec 相同的事件資料 */
function vecEv(mode, s, opt) {
  s = Object.assign({}, DEF, s);
  const x = SV.cross(s.a, s.b), sd = SV.signedDist(s.n, s.d, s.q);
  return { type: 'vec', data: {
    mode: mode, a: s.a, b: s.b, c: s.c, n: s.n, q: s.q, d: s.d,
    dot: SV.dot(s.a, s.b), angle: SV.angleDeg(s.a, s.b), comp: SV.compOn(s.a, s.b), cross: x, area: SV.norm(x),
    triple: SV.triple(s.a, s.b, s.c), dist: sd == null ? null : Math.abs(sd), sdist: sd, chal: !!(opt && opt.chal) } };
}
/** 每個分量都在滑桿範圍內、而且落在 0.5 的格點上 */
function onGrid(s) {
  const vs = ['a', 'b', 'c', 'n', 'q'].map(k => (s[k] || DEF[k]));
  const okV = vs.every(v => v.every(x => Math.abs(x) <= 4 && Math.abs(x * 2 - Math.round(x * 2)) < 1e-12));
  const d = s.d == null ? DEF.d : s.d;
  return okV && Math.abs(d) <= 10 && Math.abs(d * 2 - Math.round(d * 2)) < 1e-12;
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
function reach(id, mode, s, note) {
  if (!onGrid(s)) { fail++; console.log('  ✗ ' + id + ' 的範例不在滑桿格點上'); return; }
  expect(id, [vecEv(mode, s)], true, note);
}

// ---------- 預設狀態不觸發 ----------
{
  const defaults = ['inner', 'cross', 'volume', 'plane'].map(m => vecEv(m, {}));
  // 交換 a、b，與對每個向量按「反向」
  ['inner', 'cross', 'volume'].forEach(m => {
    defaults.push(vecEv(m, { a: DEF.b, b: DEF.a }));
    ['a', 'b', 'c'].forEach(k => defaults.push(vecEv(m, { [k]: DEF[k].map(x => -x) })));
  });
  defaults.push(vecEv('plane', { n: DEF.n.map(x => -x), d: -DEF.d }), vecEv('plane', { q: DEF.q.map(x => -x) }));
  const hit = missions.filter(m => { m.mem = {}; return defaults.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態、四種模式、交換 a 與 b、每個向量反向，都不觸發任何任務');
}

// ---------- 一般任務 ----------
expect(1, [{ type: 'rotate', data: { view: '2d' } }], true, '轉動視角 30° 以上');
reach(2, 'inner', { a: [1, 1, 0], b: [1, -1, 0] }, 'a = (1, 1, 0)、b = (1, −1, 0)，a · b = 0');
expect(2, [vecEv('inner', { a: [2, 0, 0], b: [0, 3, 0] })], false, '兩個都在坐標軸上（太簡單）');
reach(3, 'inner', { a: [1, 1, 0], b: [0, 1, 1] }, 'a = (1, 1, 0)、b = (0, 1, 1)，cos θ = 1/2，θ = 60°');
reach(4, 'inner', { a: [1, 2, 2], b: [3, 1, 2] }, 'a = (1, 2, 2)、b = (3, 1, 2)，a · b / |a| = 9 / 3 = 3');
expect(4, [vecEv('inner', { a: [1, 2, 2], b: [1, 2, 2] })], false, 'b 和 a 平行（投影就是它自己）');
reach(5, 'cross', { a: [1, 1, 0], b: [-2, 4, 0] }, 'a = (1, 1, 0)、b = (−2, 4, 0)，a × b = (0, 0, 6)');
expect(5, [vecEv('cross', { a: [1, 0, 0], b: [0, 6, 0] })], false, '在坐標軸上的 (1, 0, 0) × (0, 6, 0)');
reach(6, 'cross', { a: [4, 0, 0], b: [1, 2.5, 0] }, 'a = (4, 0, 0)、b = (1, 2.5, 0)，面積 10，夾角 68.2°');
expect(6, [vecEv('cross', { a: [4, 0, 0], b: [0, 2.5, 0] })], false, '垂直的長方形 4 × 2.5');
reach(7, 'volume', { a: [1, 1, 0], b: [0, 1, 1], c: [3, 0, 3] }, 'a = (1, 1, 0)、b = (0, 1, 1)、c = (3, 0, 3)，三重積 6');
reach(8, 'volume', { a: [3, 1, 1], b: [1, 2.5, 1], c: [4, 3.5, 2] }, 'c = a + b，三重積 0');
expect(8, [vecEv('volume', { c: [-1, 5, 4] })], false, 'c 和 a 平行（不算）');
expect(9, [vecEv('plane', { n: [1, 1, 1], d: -1.2 }), vecEv('plane', { n: [1, 1, 1], d: -1.2, q: [-2, -2, -2.4] })], true, 'n = (1, 1, 1)、d 打成 −1.2：預設 Q = (2, −1, 3) 距離 5.2 / √3 = ' + (5.2 / Math.sqrt(3)).toFixed(4) + '；Q = (−2, −2, −2.4) 在另一側，距離 5.2 / √3');
expect(9, [vecEv('plane', { n: [1, 1, 1], d: -1.2 })], false, '只有一側不夠');
expect(9, [vecEv('plane', { n: [1, 1, 1], d: -1.2 }), vecEv('plane', { n: [1, 1, 1], d: 9.2, q: [2, -1, 3] })], false, '換了平面：d = 9.2 時同一個 Q 在另一側、距離也是 3，但 d 不同不算');
expect(9, [vecEv('plane', { n: [1, 2, 2], d: 0, q: [1, 2, 2] })], false, 'n = (1, 2, 2) 的長度是 3（開得盡）');
expect(9, [vecEv('plane', { n: [1, 1, 0], d: 0, q: [3, 1.24, 0] })], false, 'n 有一個分量是 0');
{ // 只用滑桿格點（間隔 0.5）亂按，能不能剛好碰到？
  let hits = 0, tot = 0; const g = []; for (let x = -4; x <= 4; x += 0.5) g.push(x);
  const m9 = byId(9); const qs = [[2, -1, 3], [1, 1, 1], [0.5, -2, 1.5]];
  g.forEach(x => g.forEach(y => g.forEach(z => { if (!x || !y || !z) return; qs.forEach(q => { for (let d = -10; d <= 10; d += 0.5) { tot++; m9.mem = {}; m9.check(vecEv('plane', { n: [x, y, z], q: q, d: d }), m9.mem); if (m9.mem.side && (m9.mem.side.p || m9.mem.side.m)) hits++; } }); })));
  console.log('  ・ 只用 0.5 格點：' + tot + ' 種組合中 ' + hits + ' 種剛好有一側達成（還要另一側）（' + (100 * hits / tot).toFixed(3) + '%）');
}
reach(10, 'plane', { n: [1, 1, 1], d: 3, q: [2, 0.5, 0.5] }, 'n = (1, 1, 1)、d = 3、Q = (2, 0.5, 0.5)');
expect(10, [vecEv('plane', { n: [1, 1, 1], d: 3, q: [1, 1, 1] })], false, 'Q = (1, 1, 1) 和 n 平行（就是垂足，太簡單）');
expect(11, [{ type: 'challenge', data: { kind: 'angle', mode: 'inner', target: 47, time: 20, streak: 1, last3: null } }, { type: 'challenge', data: { kind: 'dist', mode: 'plane', target: 2.3, time: 25, streak: 2, last3: null } }], true, '內積模式、平面模式各答對一題');
expect(11, [{ type: 'challenge', data: { kind: 'angle', mode: 'inner', target: 47, time: 20, streak: 1, last3: null } }, { type: 'challenge', data: { kind: 'angle', mode: 'inner', target: 30, time: 20, streak: 2, last3: null } }], false, '同一個模式答對兩題不算');
expect(12, [{ type: 'challenge', data: { kind: 'dist', mode: 'plane', target: 2.3, time: 15, streak: 3, last3: 52 } }], true, '連續三題共 52 秒');
expect(12, [{ type: 'challenge', data: { kind: 'dist', mode: 'plane', target: 2.3, time: 15, streak: 3, last3: 61 } }], false, '連續三題共 61 秒');
// 挑戰中不算一般任務
expect(3, [vecEv('inner', { a: [1, 1, 0], b: [0, 1, 1] }, { chal: true })], false, '挑戰中不算');

// ---------- 隱藏任務 ----------
reach('h1', 'inner', { a: [1, 2, 0.5], b: [-2, -4, -1] }, 'b = −2a（反方向平行）');
expect('h1', [vecEv('inner', { a: [1, 2, 0.5], b: [2, 4, 1] })], false, '同方向平行不算');
reach('h2', 'volume', { a: [2, 2, 1], b: [-2, 1, 2], c: [1, -2, 2] }, '(2, 2, 1)、(−2, 1, 2)、(1, −2, 2) 兩兩垂直、長度都是 3');
reach('h3', 'cross', { a: [1, 1, 0], b: [0, 1, 0] }, 'a = (1, 1, 0)、b = (0, 1, 0)：夾角 45°，|a × b| = a · b = 1');

// ---------- 11/13 新增的隱藏任務 h4–h10 ----------
/** 學生打數字：在 −4 到 4 之間、最多小數第 2 位 */
function typed(s) {
  const vs = ['a', 'b', 'c', 'n', 'q'].map(k => (s[k] || DEF[k]));
  const d = s.d == null ? DEF.d : s.d;
  return vs.every(v => v.every(x => Math.abs(x) <= 4 && Math.abs(x * 100 - Math.round(x * 100)) < 1e-9)) && Math.abs(d) <= 10 && Math.abs(d * 100 - Math.round(d * 100)) < 1e-9;
}
/** 像學生一樣一個分量一個分量改：從 from 改到 to，每改一個分量發一次事件（第一個事件是換模式） */
function walk(mode, from, to) {
  const s = JSON.parse(JSON.stringify(Object.assign({}, DEF, from)));
  const evs = [vecEv(mode, s)];
  ['a', 'b', 'c', 'n', 'q'].forEach(k => {
    if (!to[k]) return;
    for (let i = 0; i < 3; i++) if (s[k][i] !== to[k][i]) { s[k][i] = to[k][i]; evs.push(vecEv(mode, s)); }
    if (k === 'n' && to.d != null && s.d !== to.d) { s.d = to.d; evs.push(vecEv(mode, s)); }
  });
  if (to.d != null && s.d !== to.d) { s.d = to.d; evs.push(vecEv(mode, s)); }
  return { evs: evs, s: s };
}
function reachT(id, mode, s, note) {
  if (!typed(s)) { fail++; console.log('  ✗ ' + id + ' 的範例超出範圍或超過小數第 2 位'); return; }
  expect(id, [vecEv(mode, s)], true, note);
}
expect('h4', [vecEv('inner', { a: [0, 3, 4], b: [2, 3, 4] }), vecEv('inner', { a: [0, 3, 4], b: [-1, 3, 4] })], true, 'a = (0, 3, 4)：b = (2, 3, 4) 和 b = (−1, 3, 4) 的 a · b 都是 25 = |a|²，投影長都是 5 = |a|');
expect('h4', [vecEv('inner', { a: [1, 1, 0], b: [3, -1, 2.5] }), vecEv('inner', { a: [1, 1, 0], b: [0.5, 1.5, -2] })], true, 'a = (1, 1, 0)：b = (3, −1, 2.5)、(0.5, 1.5, −2)，a · b 都是 2 = |a|²（|a| = √2 也可以）');
expect('h4', [vecEv('inner', { a: [0, 3, 4], b: [2, 3, 4] })], false, '只找到一個 b 不夠');
expect('h4', [vecEv('inner', { a: [0, 3, 4], b: [2, 3, 4] }), vecEv('inner', { a: [0, 3, 4], b: [0, 3, 4] })], false, 'b = a（平行）不算');
expect('h4', [vecEv('inner', { a: [0, 3, 4], b: [2, 3, 4] }), vecEv('inner', { a: [0, 3, 4], b: [-2, 3, 4.01] })], false, 'a · b = 25.04，差一點點也不算');
expect('h4', [vecEv('cross', { a: [0, 3, 4], b: [2, 3, 4] }), vecEv('cross', { a: [0, 3, 4], b: [-1, 3, 4] })], false, '要在「內積與投影」模式');
expect('h4', [vecEv('inner', { a: [0, 0, 3], b: [2, 1, 3] }), vecEv('inner', { a: [0, 0, 3], b: [1, 2, 3] })], false, 'a 在坐標軸上（太簡單）');
expect('h4', [vecEv('inner', { a: [0, 3, 4], b: [2, 3, 4] }), vecEv('inner', { a: [0, 4, 3], b: [2, 4, 3] })], false, '中途換了 a');
reachT('h5', 'volume', { a: [1, 1, 0], b: [0, 1, 1], c: [1, -1, 1] }, 'a = (1, 1, 0)、b = (0, 1, 1)、c = a × b = (1, −1, 1)：體積 3 = |a × b|²');
expect('h5', [vecEv('volume', { a: [1, 1, 0], b: [0, 1, 1], c: [-1, 1, -1] })], false, 'c = b × a（反過來）不算');
expect('h5', [vecEv('volume', { a: [1, 1, 0], b: [0, 1, 1], c: [2, -2, 2] })], false, 'c = 2(a × b) 方向對、長度不對');
expect('h5', [vecEv('volume', { a: [2, 0, 0], b: [0, 2, 0], c: [0, 0, 4] })], false, 'a、b 在坐標軸上（太簡單）');
reachT('h6', 'plane', { n: [1, 1, 1], d: 0 }, 'n = (1, 1, 1)、d = 0：截面是正六邊形');
reachT('h6', 'plane', { n: [-2, 2, 2], d: 0 }, 'n = (−2, 2, 2)、d = 0 也是');
expect('h6', [vecEv('plane', { n: [1, 1, 1], d: 1 })], false, 'd = 1：六邊形的邊不一樣長');
expect('h6', [vecEv('plane', { n: [1, 1, 2], d: 0 })], false, 'n = (1, 1, 2)：不是正六邊形');
{
  const P = { n: [1, 2, 4], d: 4 };
  const w1 = walk('plane', {}, Object.assign({ q: [4, 0, 0] }, P)), w2 = walk('plane', w1.s, { q: [0, 2, 0] }), w3 = walk('plane', w2.s, { q: [0, 0, 1] });
  expect('h7', w1.evs.concat(w2.evs.slice(1), w3.evs.slice(1)), true, 'n = (1, 2, 4)、d = 4：Q 依序放到 (4, 0, 0)、(0, 2, 0)、(0, 0, 1)（一個分量一個分量改）');
  expect('h7', [vecEv('plane', Object.assign({ q: [4, 0, 0] }, P)), vecEv('plane', Object.assign({ q: [0, 2, 0] }, P))], false, '只放兩個軸');
  expect('h7', [vecEv('plane', { n: [1, 1, 2], d: 4, q: [4, 0, 0] }), vecEv('plane', { n: [1, 1, 2], d: 4, q: [0, 4, 0] }), vecEv('plane', { n: [1, 1, 2], d: 4, q: [0, 0, 2] })], false, '預設平面 n = (1, 1, 2)、d = 4：截距 4、4、2 有兩個一樣，不算');
  expect('h7', [vecEv('plane', Object.assign({ q: [4, 0, 0] }, P)), vecEv('plane', Object.assign({ q: [0, 2, 0] }, P)), vecEv('plane', { n: [1, 2, 4], d: 8, q: [0, 0, 2] })], false, '中途換了平面');
}
{
  const P = { n: [1, 1, 1], d: 3 };
  const w1 = walk('plane', {}, Object.assign({ q: [3, 2, 1] }, P)), w2 = walk('plane', w1.s, { q: [1, 0, -1] });
  expect('h8', w1.evs.concat(w2.evs.slice(1)), true, 'n = (1, 1, 1)、d = 3：Q = (3, 2, 1)（距離 √3），再放鏡像 Q\' = (1, 0, −1)');
  expect('h8', [vecEv('plane', Object.assign({ q: [3, 2, 1] }, P)), vecEv('plane', Object.assign({ q: [1, 2, -1] }, P))], false, 'Q\' = (1, 2, −1) 在另一側、一樣遠，但連線不和平面垂直');
  expect('h8', [vecEv('plane', Object.assign({ q: [3, 2, 1] }, P)), vecEv('plane', { n: [1, 1, 1], d: 3.5, q: [1, 0, -1] })], false, '換了平面不算');
  expect('h8', [vecEv('plane', { n: [1, 1, 1], d: 0, q: [2, 1, 0] }), vecEv('plane', { n: [1, 1, 1], d: 0, q: [0, -1, -2] })], false, 'd = 0（過原點的平面）不算');
}
reachT('h9', 'volume', { a: [-1, 1, 1], b: [1, -1, 1], c: [1, 1, -1] }, '(−1, 1, 1)、(1, −1, 1)、(1, 1, −1)：兩兩內積 −1 = −|a|²/3，夾角 ' + SV.angleDeg([-1, 1, 1], [1, -1, 1]).toFixed(2) + '°');
reachT('h9', 'volume', { a: [2, 2, 2], b: [2, -2, -2], c: [-2, 2, -2] }, '(2, 2, 2)、(2, −2, −2)、(−2, 2, −2) 也是');
expect('h9', [vecEv('volume', { a: [-1, 1, 1], b: [1, -1, 1], c: [2, 2, -2] })], false, 'c 方向對、長度不一樣');
expect('h9', [vecEv('volume', { a: [1, 1, 0], b: [0, 1, 1], c: [1, 0, 1] })], false, '兩兩夾 60°（正四面體的邊）不算');
reachT('h10', 'volume', { a: [1, 1, 1], b: [1, 2, 1], c: [1, 1, 2] }, '(1, 1, 1)、(1, 2, 1)、(1, 1, 2)：三重積 ' + SV.triple([1, 1, 1], [1, 2, 1], [1, 1, 2]));
reachT('h10', 'volume', { a: [2, 1, 1], b: [1, 1, 1], c: [3, 2, 1] }, '(2, 1, 1)、(1, 1, 1)、(3, 2, 1)：三重積 ' + SV.triple([2, 1, 1], [1, 1, 1], [3, 2, 1]));
expect('h10', [vecEv('volume', { a: [1, 0, 0], b: [0, 1, 0], c: [0, 0, 1] })], false, '單位立方體本身（有 0）不算');
expect('h10', [vecEv('volume', { a: [1, 1, 0], b: [0, 1, 1], c: [1, 1, 1] })], false, '(1, 1, 0)、(0, 1, 1)、(1, 1, 1) 體積 1 但有 0');
expect('h10', [vecEv('volume', { a: [0.5, 1, 1], b: [1, 2, 1], c: [1, 1, 2] })], false, '分量不是整數');
expect('h10', [vecEv('volume', { a: [1, 1, 1], b: [1, 2, 1], c: [1, 1, 3] })], false, '(1, 1, 1)、(1, 2, 1)、(1, 1, 3) 體積 2');
{ // h10 有多少組：分量都在 ±1、±2 時
  let cnt = 0; const g = [-2, -1, 1, 2]; const vs = []; g.forEach(x => g.forEach(y => g.forEach(z => vs.push([x, y, z]))));
  vs.forEach(a => vs.forEach(b => vs.forEach(c => { if (Math.abs(Math.abs(SV.triple(a, b, c)) - 1) < 1e-9) cnt++; })));
  console.log('  ・ h10 分量都在 ±1、±2 時有 ' + cnt + ' 組 (a, b, c)（佔 ' + (100 * cnt / Math.pow(vs.length, 3)).toFixed(2) + '%）');
}

// 亂按模擬：像學生一樣換模式、換分頁、拉滑桿（0.5 一格）、偶爾打數字（整數或小數）、交換、反向
{
  const rand = SV.rng(1113);
  const ri = n => Math.floor(rand() * n);
  const grid = () => (ri(17) - 8) / 2;
  const tabsOf = mode => mode === 'plane' ? ['n', 'q'] : mode === 'volume' ? ['a', 'b', 'c'] : ['a', 'b'];
  const hid = missions.filter(m => /-h(4|5|6|7|8|9|10)$/.test(m.id));
  const all = missions.filter(m => m.id !== 'space-vectors-1' && !/-(11|12)$/.test(m.id));
  const runs = 2000, steps = 150, cnt = {};
  for (let r = 0; r < runs; r++) {
    const s = JSON.parse(JSON.stringify(DEF)); let mode = 'inner', edit = 'a';
    all.forEach(m => { m.mem = {}; m.got = false; });
    for (let t = 0; t < steps; t++) {
      const u = rand(); let ev = true;
      if (u < 0.1) { const m2 = ['inner', 'cross', 'volume', 'plane'][ri(4)]; if (m2 === mode) ev = false; mode = m2; if (tabsOf(mode).indexOf(edit) < 0) edit = tabsOf(mode)[0]; }
      else if (u < 0.2) { const tb = tabsOf(mode); edit = tb[ri(tb.length)]; ev = false; }
      else if (u < 0.65) { if (mode === 'plane' && rand() < 0.25) s.d = (ri(41) - 20) / 2; else s[edit][ri(3)] = grid(); }
      else if (u < 0.8) { const v = rand() < 0.5 ? ri(9) - 4 : Math.round((rand() * 8 - 4) * 100) / 100; if (mode === 'plane' && rand() < 0.25) s.d = Math.round(v * 2 * 100) / 100; else s[edit][ri(3)] = v; }
      else if (u < 0.88) { if (mode === 'plane') ev = false; else { const tmp = s.a; s.a = s.b; s.b = tmp; } }
      else if (u < 0.96) { s[edit] = s[edit].map(x => x === 0 ? 0 : -x); if (edit === 'n') s.d = s.d === 0 ? 0 : -s.d; }
      else ev = false;
      if (!ev) continue;
      const e = vecEv(mode, s);
      all.forEach(m => { if (!m.got && m.check(e, m.mem)) { m.got = true; cnt[m.id] = (cnt[m.id] || 0) + 1; } });
    }
  }
  const lines = Object.keys(cnt).map(k => k.replace('space-vectors-', '') + ' ' + cnt[k] + ' 次');
  const worst = Math.max(0, ...hid.map(m => cnt[m.id] || 0));
  const ok = worst <= runs * 0.015;
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + '亂按 ' + runs + ' 回（每回 ' + steps + ' 步）：' + (lines.join('、') || '都沒有完成') + '（新的隱藏任務每回都不到 1.5%）');
}

// 做法交叉檢查：每個新隱藏任務照上面的做法（一個分量一個分量改）時，不會順便完成別的任務
{
  const w8a = walk('plane', {}, { n: [1, 1, 1], d: 3, q: [3, 2, 1] }), w8b = walk('plane', w8a.s, { q: [1, 0, -1] });
  const w7a = walk('plane', {}, { n: [1, 2, 4], d: 4, q: [4, 0, 0] }), w7b = walk('plane', w7a.s, { q: [0, 2, 0] }), w7c = walk('plane', w7b.s, { q: [0, 0, 1] });
  const ways = {
    h4: (() => { const w = walk('inner', {}, { a: [0, 3, 4], b: [2, 3, 4] }); return w.evs.concat(walk('inner', w.s, { b: [-1, 3, 4] }).evs.slice(1)); })(),
    h5: walk('volume', {}, { a: [1, 1, 0], b: [0, 1, 1], c: [1, -1, 1] }).evs,
    h6: walk('plane', {}, { n: [1, 1, 1], d: 0 }).evs,
    h7: w7a.evs.concat(w7b.evs.slice(1), w7c.evs.slice(1)),
    h8: w8a.evs.concat(w8b.evs.slice(1)),
    h9: walk('volume', {}, { a: [-1, 1, 1], b: [1, -1, 1], c: [1, 1, -1] }).evs,
    h10: walk('volume', {}, { a: [1, 1, 1], b: [1, 2, 1], c: [1, 1, 2] }).evs
  };
  // 最後的做法（只看完成時的那幾個狀態）
  const finals = {
    h4: [vecEv('inner', { a: [0, 3, 4], b: [2, 3, 4] }), vecEv('inner', { a: [0, 3, 4], b: [-1, 3, 4] })],
    h5: [vecEv('volume', { a: [1, 1, 0], b: [0, 1, 1], c: [1, -1, 1] })],
    h6: [vecEv('plane', { n: [1, 1, 1], d: 0 })],
    h7: [[4, 0, 0], [0, 2, 0], [0, 0, 1]].map(q => vecEv('plane', { n: [1, 2, 4], d: 4, q: q })),
    h8: [[3, 2, 1], [1, 0, -1]].map(q => vecEv('plane', { n: [1, 1, 1], d: 3, q: q })),
    h9: [vecEv('volume', { a: [-1, 1, 1], b: [1, -1, 1], c: [1, 1, -1] })],
    h10: [vecEv('volume', { a: [1, 1, 1], b: [1, 2, 1], c: [1, 1, 2] })]
  };
  const run = evs => missions.filter(m => { m.mem = {}; let g = false; evs.forEach(e => { g = m.check(e, m.mem) || g; }); return g; }).map(m => m.id.replace('space-vectors-', ''));
  const bad = [], passBy = [];
  Object.keys(finals).forEach(h => {
    const got = run(finals[h]);
    if (got.length !== 1 || got[0] !== h) bad.push(h + ' → ' + got.join('、'));
    const way = run(ways[h]);
    if (way.some(x => x !== h && /^h/.test(x))) bad.push(h + ' 的過程碰到 ' + way.filter(x => x !== h).join('、'));
    else if (way.length > 1) passBy.push(h + ' 途中經過公開任務 ' + way.filter(x => x !== h).join('、'));
  });
  if (bad.length) { fail++; console.log('  ✗ 做法會連帶完成別的任務：' + bad.join('；')); }
  else console.log('  ✓ 新隱藏任務的做法都只完成它自己；一個分量一個分量改的過程中也不會碰到別的隱藏任務' + (passBy.length ? '（' + passBy.join('；') + '，是改到一半的中間狀態，看改的順序）' : ''));
}
{
  const hid = missions.filter(m => m.hidden);
  const lv = hid.map(m => m.level);
  const ok = hid.length === 10 && lv.every(l => l >= 3 && l <= 10) && lv.filter(l => l >= 7).length >= 3;
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + '隱藏任務 ' + hid.length + ' 個，等級 ' + lv.join('、') + '（7 級以上 ' + lv.filter(l => l >= 7).length + ' 個）');
}

// ---------- 挑戰：每一題都能用滑桿做到 ----------
{
  let bad = 0, n = 0;
  const rand = SV.rng(20261112);
  ['inner', 'cross', 'volume', 'plane'].forEach(mode => {
    let prev = null;
    for (let i = 0; i < 500; i++) {
      const s = { a: SV.randVec(rand), b: SV.randVec(rand), c: SV.randVec(rand), n: SV.randVec(rand), q: SV.randVec(rand), d: Math.round((rand() * 20 - 10) * 2) / 2 };
      const ch = SV.genChallenge(rand, mode, s, prev);
      if (!ch) continue;
      n++;
      prev = ch;
      if (!onGrid(ch.witness) || !SV.chalHit(ch, ch.witness)) bad++;
    }
  });
  if (bad) { fail++; console.log('  ✗ 挑戰：' + bad + ' 題的示範解不在格點上或對不準'); }
  else console.log('  ✓ 挑戰：' + n + ' 題（四種模式）都附有一組滑桿格點上的解');
}

// ---------- 總覽 ----------
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;   // 隱藏任務星星加倍（與 js/missions.js 的 LabMission.starsOf 相同）
const stars = missions.reduce((s, m) => s + starsOf(m), 0);
console.log(`\n公開 ${pub.length} 個、隱藏 ${hid.length} 個，共 ${stars} 顆星（公開 ${pub.reduce((s, m) => s + m.level, 0)}、隱藏 ${hid.reduce((s, m) => s + starsOf(m), 0)}，隱藏任務是等級 × 2）。`);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('隱藏任務超過 20 顆星（規則上限）。'); }
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發。');
