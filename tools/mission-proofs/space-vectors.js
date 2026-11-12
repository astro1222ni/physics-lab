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
