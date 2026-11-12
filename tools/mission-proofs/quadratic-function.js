/* 任務可達成的證明腳本。用法：node tools/mission-proofs/quadratic-function.js
 * 用數學核心證明每個任務在滑桿範圍與打字精度內做得到（事件格式與 js/quadratic-function.js 的 emitGraph／emitLine／emitSquare 相同），並確認預設狀態不會觸發任務。
 * 滑桿：a −3 到 3（不為 0）、b、c −20 到 20、頂點 h −10 到 10、k −20 到 20（換算出來超出時滑桿會自動放寬；拖曳頂點時 h 在 ±6、k 在 ±8，b、c 要留在 ±20）、
 *   p、q（定義域）−7 到 7，都打字到小數第 2 位；
 *   直線 m −6 到 6、n −10 到 10；配方 p 0.5 到 10、q 0 到 80（小數第 2 位）、x 0 到 10（小數第 3 位）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const M = require(ROOT + 'js/quadratic-function-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/quadratic-function.js');
const byId = id => missions.find(m => m.id === 'quadratic-function-' + id);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;
const dec = (v, d) => Math.abs(v * Math.pow(10, d) - Math.round(v * Math.pow(10, d))) < 1e-6;
const inR = (v, lo, hi, d) => v >= lo - 1e-12 && v <= hi + 1e-12 && dec(v, d);

function fn(a, b, c) {
  if (!(a !== 0 && inR(a, -3, 3, 2) && inR(b, -20, 20, 2) && inR(c, -20, 20, 2))) throw new Error('a、b、c 超出範圍：' + a + '、' + b + '、' + c);
  const v = M.vertex(a, b, c);
  return { h: M.r6(v.h), k: M.r6(v.k) };
}
function graphEv(a, b, c, dom) {
  const v = fn(a, b, c), D = M.disc(a, b, c);
  let d = null;
  if (dom) {
    if (!(inR(dom[0], -7, 7, 2) && inR(dom[1], -7, 7, 2))) throw new Error('定義域超出範圍');
    const r = M.rangeOn(a, b, c, dom[0], dom[1]);
    d = { p: r.lo, q: r.hi, max: r.max, min: r.min, vertexIn: r.vertexIn };
  }
  return { type: 'graph', data: { a: a, b: b, c: c, h: v.h, k: v.k, D: D, roots: M.roots(a, b, c), dom: d, chal: false } };
}
function lineEv(a, b, c, m, n) {
  const v = fn(a, b, c);
  if (!(inR(m, -6, 6, 2) && inR(n, -10, 10, 2))) throw new Error('直線超出範圍');
  const I = M.intersect(a, b, c, m, n);
  return { type: 'line', data: { a: a, b: b, c: c, h: v.h, k: v.k, m: m, n: n, D: I.D, xs: I.xs } };
}
function squareEv(p, q, x, step) {
  if (!(inR(p, 0.5, 10, 2) && inR(q, 0, 80, 2) && inR(x, 0, 10, 3))) throw new Error('配方的值超出範圍');
  return { type: 'square', data: { p: p, q: q, x: x, step: step, root: M.completeSquare(p, q).root } };
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
  const evs = [graphEv(1, -2, -3), graphEv(1, -2, -3, [-1, 2]), lineEv(1, -2, -3, 1, 1), squareEv(4, 12, 1, 1)];
  const hit = missions.filter(m => evs.some(e => { m.mem = {}; return m.check(e, m.mem); })).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態（y = x² − 2x − 3、定義域 [−1, 2]、直線 y = x + 1、x² + 4x = 12 的第 1 步）不觸發任務');
}

// ---------- 圖形 ----------
expect(1, [graphEv(1, -4, 1)], true, 'y = x² − 4x + 1 = (x − 2)² − 3');
expect(1, [graphEv(1, -4, 2)], false, '頂點 (2, −2) 不算');
expect(2, [graphEv(1, -2, 1)], true, 'y = (x − 1)²');
expect(2, [graphEv(2, -5.2, 3.38)], true, 'y = 2(x − 1.3)²：浮點誤差下 D 仍判為 0');
expect(2, [graphEv(1, 0, 0), graphEv(1, -2, 1.1)], false, 'y = x²（頂點在原點）、D < 0 都不算');
expect(3, [graphEv(1, -2, 2)], true, 'y = x² − 2x + 2，D = −4');
expect(3, [graphEv(1, 0, 1), graphEv(-1, -2, -2)], false, 'b = 0、開口向下都不算');
expect(4, [graphEv(-1, 5, -4)], true, 'y = −(x − 1)(x − 4)');
expect(4, [graphEv(-1, 2, 3), graphEv(1, -5, 4)], false, '一正一負、開口向上都不算');
expect(5, [graphEv(-2, 2, 12)], true, 'y = −2(x + 2)(x − 3) = −2x² + 2x + 12');
expect(5, [graphEv(1, -1, -6)], false, 'y = (x + 2)(x − 3) 的 y 截距是 −6');
expect(6, [graphEv(1, -2, -3, [-2, 3])], true, 'y = x² − 2x − 3 在 [−2, 3]：最大 5（x = −2）、最小 −4（頂點）');
expect(6, [graphEv(1, -2, -3, [-2, 0.5]), graphEv(1, -2, -3)], false, '[−2, 0.5] 最小值不是 −4、沒限制定義域都不算');
expect('h3', [graphEv(1, 0, -3)], true, 'y = x² − 3：兩根 ±√3 和頂點 (0, −3) 成正三角形');
expect('h3', [graphEv(-0.5, 0, 6)], true, 'y = −0.5x² + 6：兩根 ±√12，頂點 (0, 6)');
expect('h3', [graphEv(1, 0, -4)], false, 'y = x² − 4 不是正三角形');
{
  // h3 的幾何：兩根 h ± d 與頂點 (h, k) 等邊 ⇔ |k| = √3 d ⇔ a k = −3
  const r = M.roots(1, 0, -3), d = (r[1] - r[0]) / 2, side = Math.hypot(d, 3);
  if (Math.abs(side - 2 * d) > 1e-12) { fail++; console.log('  ✗ h3 的三角形不是等邊'); } else console.log('  ✓ h3 幾何核對：三邊都是 2√3');
}

// ---------- 配方 ----------
expect(7, [squareEv(6, 12, 1, 4)], true, 'p = 6 的第 4 步，角落 3² = 9');
expect(7, [squareEv(6, 12, 1, 3), squareEv(4, 12, 1, 4)], false, '第 3 步、角落 4 都不算');
expect(8, [squareEv(10, 39, 3, 4)], true, 'x² + 10x = 39，第 4 步、x = 3');
expect(8, [squareEv(10, 39, 3, 3), squareEv(10, 39, 2.999, 4)], false, '第 3 步、x = 2.999 都不算');
expect('h1', [squareEv(1, 1, 0.618, 1)], true, 'x² + x = 1，x = 0.618（黃金比，和 (√5 − 1)/2 差 0.00003）');
expect('h1', [squareEv(1, 1, 0.62, 4)], false, 'x = 0.62 差 0.002，不算');

// ---------- 拋物線與直線 ----------
expect(9, [lineEv(1, -2, -3, 2, -7)], true, 'y = x² − 2x − 3 與 y = 2x − 7 相切於 (2, −3)');
expect(9, [lineEv(1, -2, -3, 0, -4)], false, '水平的切線 y = −4 不算');
expect(10, [lineEv(1, -2, -3, -1, -1)], true, 'y = −x − 1：x² − x − 2 = (x + 1)(x − 2)');
expect(10, [lineEv(1, -2, -3, 1, 1)], false, '預設直線交於 −1、4');
expect('h2', [lineEv(-1, 4, 0, 0, 4)], true, 'y = −x² + 4x 與 y = 4 切在頂點 (2, 4)');
expect('h2', [lineEv(1, -2, -3, 0, -4), lineEv(-1, 4, 0, 0, 3.9)], false, '開口向上（谷底）、沒碰到都不算');

// ---------- 挑戰 ----------
expect(11, [{ type: 'challenge', data: { time: 20, streak: 1, last3: null } }], true, '答對一題');
expect(12, [{ type: 'challenge', data: { time: 25, streak: 3, last3: 85 } }], true, '連續三題 85 秒');
expect(12, [{ type: 'challenge', data: { time: 35, streak: 3, last3: 91 } }], false, '超過 90 秒不算');
{
  const R = M.rng(7); let bad = 0, last = null;
  for (let t = 0; t < 1000; t++) {
    const g = M.genChallenge(R, last); last = g;
    try {
      fn(g.a, g.b, g.c);
      if (!(inR(g.h, -6, 6, 1) && inR(g.k, -8, 8, 1))) throw new Error('頂點拖不到');
      const bc = M.fromVertex(g.a, g.h, g.k);
      if (Math.abs(bc.b - g.b) > 1e-9 || Math.abs(bc.c - g.c) > 1e-9) throw new Error('拖頂點得到的 b、c 不同');
    } catch (e) { bad++; }
  }
  if (bad) { fail++; console.log('  ✗ 有 ' + bad + ' 題做不到'); } else console.log('  ✓ 1000 題挑戰都能用 a 的滑桿加上拖曳頂點（或打 a、b、c）做出來');
}

const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const sp = pub.reduce((s, m) => s + starsOf(m), 0), sh = hid.reduce((s, m) => s + starsOf(m), 0);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('  ✗ 隱藏任務超過 20 顆'); }
console.log('\n公開 ' + pub.length + ' 個 ' + sp + ' 顆、隱藏 ' + hid.length + ' 個 ' + sh + ' 顆，共 ' + (sp + sh) + ' 顆。');
console.log(fail ? fail + ' 項失敗' : '全部通過');
if (fail) process.exit(1);
