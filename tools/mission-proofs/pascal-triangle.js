/* 任務可達成的證明腳本。用法：node tools/mission-proofs/pascal-triangle.js
 * 用數學核心證明每個任務在滑桿範圍內做得到（事件格式與 js/pascal-triangle.js 的 emitTri／emitCell／emitGrid／emitBinom 相同），並確認預設狀態不會觸發任務。
 * 滑桿：列數 1–64、m 2–10；格子向右、向上各 1–8；a、b 是 −3 到 3、n 是 0 到 10（都是整數）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const P = require(ROOT + 'js/pascal-triangle-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/pascal-triangle.js');
const byId = id => missions.find(m => m.id === 'pascal-triangle-' + id);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;

const triEv = (rows, mod) => ({ type: 'tri', data: { rows: rows, mod: mod } });
function cellEv(n, k, mod, rows) {
  rows = rows || 64;
  if (n >= rows || k < 0 || k > n) throw new Error('格子 (' + n + ', ' + k + ') 不在 ' + rows + ' 列裡');
  return { type: 'cell', data: { n: n, k: k, value: String(P.C(n, k)), mod: mod == null ? null : mod, rows: rows } };
}
function gridEv(m, n, blocks) {
  if (m < 1 || m > 8 || n < 1 || n > 8) throw new Error('格子超出範圍');
  const set = new Set(blocks || []);
  set.forEach(k => { const p = k.split(',').map(Number); if (p[0] > m || p[1] > n || (p[0] === 0 && p[1] === 0) || (p[0] === m && p[1] === n)) throw new Error('路障 ' + k + ' 不合法'); });
  return { type: 'grid', data: { m: m, n: n, nb: set.size, count: P.gridCount(m, n, set), total: P.Cn(m + n, m) } };
}
function binomEv(a, b, n, sub) {
  if (Math.abs(a) > 3 || Math.abs(b) > 3 || n < 0 || n > 10) throw new Error('二項式超出範圍');
  return { type: 'binom', data: { a: a, b: b, n: n, coefs: P.expand(a, b, n), sub: sub == null ? null : sub } };
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
  const evs = [triEv(12, null), gridEv(4, 3, []), binomEv(1, 1, 4, null)];
  const hit = missions.filter(m => evs.some(e => { m.mem = {}; return m.check(e, m.mem); })).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態（12 列不上色、4 × 3 格子 35 條路、(x + 1)^4）不觸發任務');
}

// ---------- 三角形 ----------
expect(1, [cellEv(4, 2, null, 12)], true, '點第 4 列第 2 格（6）');
expect(2, [triEv(32, 2)], true, '32 列、除以 2 的餘數');
expect(2, [triEv(31, 2), triEv(40, 3)], false, '31 列或 m = 3 都不算');
expect(3, [triEv(16, 2), triEv(16, 3), triEv(20, 5)], true, '16 列以上看 m = 2、3、5');
expect(3, [triEv(16, 2), triEv(16, 3), triEv(15, 5), triEv(20, null)], false, '第三種只有 15 列、或沒上色，不算');
{
  const pos = P.positionsOf(120n, 64);
  if (pos.length !== 4) { fail++; console.log('  ✗ 120 應出現 4 次，算到 ' + pos.length); }
  expect(4, pos.map(p => cellEv(p[0], p[1])), true, '120 的四個位置 ' + pos.map(p => '(' + p.join(', ') + ')').join('、') + '（列數 ≥ 17 就都看得到）');
  expect(4, [cellEv(10, 3), cellEv(10, 3), cellEv(10, 7), cellEv(16, 2)], false, '同一格點兩次只算一格');
}
expect('h1', [cellEv(7, 3, 2, 8)], true, '依除以 2 上色、點第 7 列（全是奇數）');
expect('h1', [cellEv(3, 1, 2, 8), cellEv(8, 3, 2, 12), cellEv(15, 4, null, 16)], false, '第 3 列太短、第 8 列不全奇、沒上色都不算');
expect('h1', [cellEv(63, 30, 2, 64)], true, '第 63 列也可以');

// ---------- 走格子 ----------
expect(5, [{ type: 'path', data: { m: 4, n: 3, nb: 0 } }], true, '自己走到 B（「隨機一條路」不發這個事件）');
{
  const hits = [];
  for (let m = 1; m <= 8; m++) for (let n = 1; n <= 8; n++) if (P.Cn(m + n, m) === 252) hits.push(m + '×' + n);
  expect(6, [gridEv(5, 5, [])], true, '5 × 5 沒有路障：C(10, 5) = 252（範圍內只有 ' + hits.join('、') + '）');
  expect(6, [gridEv(5, 5, ['2,2'])], false, '有路障就不算');
}
expect(7, [gridEv(3, 3, ['1,0'])], true, '3 × 3 擋住 (1, 0)：20 → 10');
expect(7, [gridEv(4, 2, ['1,1'])], false, '4 × 2 擋 (1, 1)：' + gridEv(4, 2, ['1,1']).data.count + ' ≠ 15 / 2');
{
  // 4 × 4 兩個路障剩 20 條：找出所有做法
  const pts = [];
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) if (!(i === 0 && j === 0) && !(i === 4 && j === 4)) pts.push(i + ',' + j);
  const ways = [];
  for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) if (P.gridCount(4, 4, new Set([pts[a], pts[b]])) === 20) ways.push('(' + pts[a] + ') 和 (' + pts[b] + ')');
  if (!ways.length) { fail++; console.log('  ✗ 8：找不到兩個路障剩 20 條的放法'); }
  else expect(8, [gridEv(4, 4, ways[0].replace(/[()]/g, '').split(' 和 '))], true, '4 × 4 擋 ' + ways[0] + '（共 ' + ways.length + ' 種放法）');
  expect(8, [gridEv(4, 4, ['1,0'])], false, '只放一個路障（35 條）不算');
}
expect('h2', [gridEv(3, 3, ['0,1', '1,1', '2,1'])], true, '3 × 3 擋 (0, 1)、(1, 1)、(2, 1)：只剩沿著下邊再往上的一條');
expect('h2', [gridEv(1, 5, []), gridEv(3, 3, ['0,1', '1,0'])], false, '1 × 5 本來就只有一條、全部擋死（0 條）都不算');

// ---------- 二項式 ----------
expect(9, [binomEv(1, 1, 4, 1), binomEv(1, 1, 4, -1)], true, '(x + 1)^4 代入 1 和 −1：16 與 0');
expect(9, [binomEv(1, 1, 4, 1), binomEv(1, 2, 4, -1)], false, '換了式子再代入 −1 不算');
expect(9, [binomEv(1, 1, 3, 1), binomEv(1, 1, 3, -1)], false, 'n = 3 不算');
{
  const hits = [];
  for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) for (let n = 0; n <= 10; n++) if (P.expand(a, b, n).indexOf(-160) >= 0) hits.push('(' + a + 'x + ' + b + ')^' + n);
  expect(10, [binomEv(1, -2, 6)], true, '(x − 2)^6 的 x^3 係數 C(6, 3)·(−2)^3 = −160（範圍內共 ' + hits.length + ' 種）');
  expect(10, [binomEv(1, 2, 6)], false, '(x + 2)^6 是 +160');
}

// ---------- 挑戰 ----------
expect(11, [{ type: 'challenge', data: { time: 20, streak: 1, last3: null } }], true, '答對一題');
expect(12, [{ type: 'challenge', data: { time: 15, streak: 3, last3: 45 } }], true, '連續三題 45 秒');
expect(12, [{ type: 'challenge', data: { time: 25, streak: 3, last3: 61 } }, { type: 'challenge', data: { time: 9, streak: 2, last3: null } }], false, '超過 60 秒、或還不到三題都不算');
{
  // 挑戰題都能在心裡逐點加出來：答案就是 gridCount，選項裡剛好有一個
  const R = P.rng(2024); let bad = 0;
  for (let t = 0; t < 500; t++) { const c = P.genChallenge(R, null); if (!c || c.options.filter(v => v === c.count).length !== 1) bad++; }
  if (bad) { fail++; console.log('  ✗ 挑戰有 ' + bad + ' 題選項不對'); } else console.log('  ✓ 500 題挑戰的正確答案都剛好出現一次');
}

const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const sp = pub.reduce((s, m) => s + starsOf(m), 0), sh = hid.reduce((s, m) => s + starsOf(m), 0);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('  ✗ 隱藏任務超過 20 顆'); }
console.log('\n公開 ' + pub.length + ' 個 ' + sp + ' 顆、隱藏 ' + hid.length + ' 個 ' + sh + ' 顆，共 ' + (sp + sh) + ' 顆。');
console.log(fail ? fail + ' 項失敗' : '全部通過');
if (fail) process.exit(1);
