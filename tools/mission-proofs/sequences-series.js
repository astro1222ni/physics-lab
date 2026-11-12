/* 任務可達成的證明腳本。用法：node tools/mission-proofs/sequences-series.js
 * 用數學核心證明每個任務在滑桿範圍與打字精度內做得到（事件格式與 js/sequences-series.js 的 emitMode 相同），並確認預設狀態不會觸發任務。
 * 滑桿：首項 a1 −10 到 10、公差 d −5 到 5（都打字到小數第 2 位）、公比 r −2 到 2（小數第 3 位）、項數 n 1 到 100；圖形數 n 1 到 50。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const M = require(ROOT + 'js/sequences-series-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/sequences-series.js');
const byId = id => missions.find(m => m.id === 'sequences-series-' + id);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;
const dec = (v, d) => Math.abs(v * Math.pow(10, d) - Math.round(v * Math.pow(10, d))) < 1e-6;
const inR = (v, lo, hi, d) => v >= lo - 1e-12 && v <= hi + 1e-12 && dec(v, d);

function arith(a1, d, n, pair) {
  if (!(inR(a1, -10, 10, 2) && inR(d, -5, 5, 2) && inR(n, 1, 100, 0))) throw new Error('等差超出範圍：' + a1 + '、' + d + '、' + n);
  const ts = M.terms('arith', a1, d, n);
  return { type: 'arith', data: { a1: a1, d: d, n: n, an: ts[n - 1], Sn: M.arithSum(a1, d, n), pair: !!pair } };
}
function geom(a1, r, n) {
  if (!(inR(a1, -10, 10, 2) && inR(r, -2, 2, 3) && inR(n, 1, 100, 0))) throw new Error('等比超出範圍：' + a1 + '、' + r + '、' + n);
  const ts = M.terms('geom', a1, r, n);
  return { type: 'geom', data: { a1: a1, r: r, n: n, an: ts[n - 1], Sn: M.geomSum(a1, r, n), Sinf: M.geomInf(a1, r), first99: M.firstWithin(a1, r, n, 0.01) } };
}
function fig(kind, n, joined) {
  if (!inR(n, 1, 50, 0)) throw new Error('圖形數超出範圍');
  return { type: 'fig', data: { kind: kind, n: n, count: kind === 'tri' ? M.tri(n) : M.oddSum(n), joined: kind === 'tri' && !!joined } };
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
  const evs = [arith(1, 3, 8), arith(1, 3, 8, true), geom(1, 0.5, 8), fig('tri', 4), fig('tri', 4, true), fig('odd', 4)];
  const hit = missions.filter(m => { m.mem = {}; return evs.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態（1, 4, 7, … 前 8 項、打開配對；1, 0.5, 0.25, … 前 8 項；三角形數與奇數和 n = 4）依序操作都不觸發任務');
}

// ---------- 等差 ----------
expect(1, [arith(1, 1, 100, true)], true, '1 + 2 + … + 100 = 5050，打開配對');
expect(1, [arith(1, 1, 100, false), arith(1, 1, 99, true)], false, '沒打開配對、只到 99 都不算');
expect(2, [arith(-5, 1, 11)], true, '−5 + −4 + … + 5 = 0');
expect(2, [arith(-1.5, 1, 4)], true, '−1.5 − 0.5 + 0.5 + 1.5 = 0（偶數項也行）');
expect(2, [arith(0, 0, 5), arith(-5, 1, 10)], false, '公差 0、和是 −5 都不算');
expect(3, [arith(-2, 3, 10)], true, 'a1 = −2：−2 + 9 × 3 = 25');
expect(3, [arith(-2, 3, 9), arith(-2, 2.5, 12)], false, '只畫到第 9 項、公差 2.5 都不算');
expect(4, [arith(9, 1, 8)], true, '9 + 10 + … + 16 = 100');
expect(4, [arith(7.25, 1.5, 8)], true, '打字 a1 = 7.25、d = 1.5 也可以：8 × (2 × 7.25 + 7 × 1.5)/2 = 100');
expect(4, [arith(10, 0, 8), arith(9, 1, 9)], false, '公差 0（10 × 8 = 80）、9 項都不算');
expect('h3', [arith(1, 2, 7), fig('odd', 7)], true, '1 + 3 + … + 13 = 49，再排出 7 × 7 方陣');
expect('h3', [fig('odd', 6), arith(1, 2, 6)], true, '先排方陣再做數列也可以');
expect('h3', [arith(1, 2, 7), fig('odd', 8), arith(1, 3, 8)], false, '項數不同、不是奇數都不算');
expect('h6', [arith(3, 1, 3)], true, '3, 4, 5');
expect('h6', [arith(1.5, 0.5, 3)], true, '1.5, 2, 2.5');
expect('h6', [arith(3, 1, 4), arith(2, 1, 3), arith(-5, -1, 3)], false, '4 項、2, 3, 4、負數都不算');
expect('h7', [arith(10, -1.5, 8), arith(10, -1.5, 7)], true, '10, 8.5, …, 1：第 8 項 −0.5 讓和變小，退回 7 項最大（S7 = 38.5）');
expect('h7', [arith(10, -1.5, 7)], false, '直接設 7 項（沒有先多走一步）不算');
expect('h7', [arith(10, -2, 7), arith(10, -2, 6)], false, '10, 8, …, 0：第 6 項 0，和不變，不算虧本');
expect('h7', [arith(10, -1.5, 9), arith(10, -1.5, 8)], false, '9 退到 8 項還不是最大');

// ---------- 等比 ----------
expect(5, [geom(1, 2, 10)], true, '1 + 2 + … + 512 = 1023');
expect(5, [geom(3, 2, 8)], false, '3 × 255 = 765');
expect(6, [geom(1.5, -0.5, 5)], true, '1.5 / (1 + 0.5) = 1');
expect(6, [geom(1.75, -0.75, 5)], true, '1.75 / 1.75 = 1');
expect(6, [geom(0.5, 0.5, 5), geom(1.5, -1, 5)], false, '公比正的、|r| = 1 都不算');
expect(7, [geom(0.9, 0.1, 5)], true, '0.9 + 0.09 + … + 0.00009 = 0.99999，S∞ = 1');
expect(7, [geom(0.9, 0.1, 4)], false, '4 項不算');
expect(8, [geom(1, 0.5, 11)], true, '|2 − S11| = 2^−10 ≈ 0.00098 < 0.001，|2 − S10| = 0.00195');
expect(8, [geom(1, 0.5, 10), geom(1, 0.5, 12)], false, '10 項不夠、12 項不是最少');
expect('h1', [arith(2, 0, 5), geom(2, 1, 5)], true, '2, 2, 2, 2, 2：公差 0 的等差，也是公比 1 的等比');
expect('h1', [geom(-3, 1, 4), arith(-3, 0, 4)], true, '倒過來的順序也可以');
expect('h1', [arith(2, 0, 5), geom(2, 1, 6), geom(0, 1, 5), arith(0, 0, 5)], false, '項數不同、首項 0 都不算');
expect('h2', [geom(2, -1, 49), geom(2, -1, 50)], true, '2, −2, …：49 項和 2，50 項和 0');
expect('h2', [geom(2, -1, 50)], false, '直接設 50 項不算');
expect('h2', [geom(2, -1, 47), geom(2, -1, 48)], false, '48 項還不夠久');
expect('h2', [geom(2, -1, 49), geom(3, -1, 50)], false, '中途換了首項');
expect('h5', [geom(1, 2, 64)], true, '1 + 2 + … + 2^63 = 2^64 − 1 ≈ 1.8447 × 10^19');
expect('h5', [geom(1, 2, 63), geom(2, 2, 64)], false, '63 格、首項 2 都不算');
expect('h8', [geom(1, 0.9, 44)], true, 'r = 0.9：0.9^44 ≈ 0.0097 < 0.01 ≤ 0.9^43 ≈ 0.0108');
expect('h8', [geom(-3, -0.8, 21)], true, 'r = −0.8：0.8^21 ≈ 0.0092 < 0.01 ≤ 0.8^20 ≈ 0.0115');
expect('h8', [geom(1, 0.5, 7), geom(1, 0.9, 45), geom(1, 0.9, 43)], false, 'r = 0.5 只要 7 項（太短）、45 不是最早、43 還不到');
expect('h9', [geom(1, 1.618, 6)], true, 'r = 1.618：r² − r − 1 ≈ −0.00008');
expect('h9', [geom(2, -0.618, 5)], true, 'r = −0.618 也滿足 r² = r + 1');
expect('h9', [geom(1, 1.6, 6), geom(1, 1.62, 6), geom(1, 1.618, 4)], false, '1.6、1.62 不夠準，4 項不算');
{
  // h9 的意義：r² = r + 1 時 a_(k+2) = a_(k+1) + a_k
  const t = M.terms('geom', 1, (1 + Math.sqrt(5)) / 2, 10);
  let ok = true;
  for (let k = 2; k < 10; k++) if (Math.abs(t[k] - t[k - 1] - t[k - 2]) > 1e-9) ok = false;
  if (!ok) { fail++; console.log('  ✗ 黃金比等比數列不滿足費氏遞迴'); } else console.log('  ✓ 公比 (1 + √5)/2 的等比數列每一項都是前兩項的和');
}

// ---------- 圖形數 ----------
expect(9, [fig('tri', 10, true)], true, '2 × 55 = 10 × 11');
expect(9, [fig('tri', 10, false), fig('tri', 9, true)], false, '沒拼、n = 9 都不算');
expect(10, [fig('odd', 12)], true, '1 + 3 + … + 23 = 144');
expect(10, [fig('tri', 12), fig('odd', 11)], false, '三角形、11 × 11 都不算');
expect('h4', [fig('tri', 8), fig('odd', 6)], true, 'T8 = 36 = 6²：三角形和正方形都是 36 顆');
expect('h4', [fig('tri', 8, true), fig('odd', 6)], true, '拼成長方形之後再換也可以');
expect('h4', [fig('odd', 6), fig('tri', 8)], false, '要先排三角形');
expect('h4', [fig('tri', 1), fig('odd', 1)], false, '1 顆不算');
expect('h4', [fig('tri', 8), fig('tri', 9), fig('odd', 6)], false, '中途換成 T9 = 45');
expect('h4', [fig('tri', 49), fig('odd', 35)], false, 'T49 是 h10 的，不算');
expect('h10', [fig('tri', 49), fig('odd', 35)], true, 'T49 = 1225 = 35²');
expect('h10', [fig('tri', 8), fig('odd', 6), fig('tri', 48), fig('odd', 35)], false, 'T8、T48 都不算');
{
  const both = [];
  for (let n = 2; n <= 50; n++) if (M.isSquare(M.tri(n))) both.push(n + '（' + M.tri(n) + ' = ' + Math.round(Math.sqrt(M.tri(n))) + '²）');
  const ok = both.length === 2 && both[0].indexOf('8') === 0 && both[1].indexOf('49') === 0 && Math.sqrt(M.tri(49)) <= 50;
  if (!ok) { fail++; console.log('  ✗ 範圍內的三角形平方數不是只有 8 與 49'); }
  else console.log('  ✓ 範圍內 n > 1 的三角形平方數只有 ' + both.join('、') + '；奇數和 n = 6、35 都在 1 到 50 之內');
}

// ---------- 挑戰 ----------
expect(11, [{ type: 'challenge', data: { time: 20, streak: 1, last3: null } }], true, '答對一題');
expect(12, [{ type: 'challenge', data: { time: 25, streak: 3, last3: 85 } }], true, '連續三題 85 秒');
expect(12, [{ type: 'challenge', data: { time: 35, streak: 3, last3: 91 } }], false, '超過 90 秒不算');
{
  const R = M.rng(7); let bad = 0, last = null;
  for (let t = 0; t < 1000; t++) {
    const g = M.genChallenge(R, last); last = g;
    try {
      if (g.kind === 'arith') arith(g.a1, g.s, 5); else geom(g.a1, g.s, 5);
      const mine = M.terms(g.kind, g.a1, g.s, 5);
      if (mine.some((v, i) => Math.abs(v - g.check[i]) > 1e-9)) throw new Error('算出來不同');
      if (g.kind === 'arith' && !(inR(g.a1, -10, 10, 1) && Math.abs(g.s * 2 - Math.round(g.s * 2)) < 1e-9)) throw new Error('滑桿拉不到');
      if (g.kind === 'geom' && Math.abs(g.s * 20 - Math.round(g.s * 20)) > 1e-9) throw new Error('滑桿拉不到');
    } catch (e) { bad++; }
  }
  if (bad) { fail++; console.log('  ✗ 有 ' + bad + ' 題做不到'); } else console.log('  ✓ 1000 題挑戰的答案都在滑桿刻度上（首項整數、公差 0.5 的倍數、公比 0.05 的倍數）');
}

// ---------- 任務之間不互相連帶 ----------
{
  // 每個任務的「最簡單做法」不可同時完成另一個任務
  const recipes = {
    1: [arith(1, 1, 100, true)], 2: [arith(-5, 1, 11)], 3: [arith(-2, 3, 10)], 4: [arith(9, 1, 8)],
    5: [geom(1, 2, 10)], 6: [geom(1.5, -0.5, 5)], 7: [geom(0.9, 0.1, 5)], 8: [geom(1, 0.5, 11)],
    9: [fig('tri', 10, true)], 10: [fig('odd', 12)],
    h1: [arith(2, 0, 5), geom(2, 1, 5)], h2: [geom(2, -1, 49), geom(2, -1, 50)], h3: [arith(1, 2, 7), fig('odd', 7)],
    h4: [fig('tri', 8), fig('odd', 6)], h5: [geom(1, 2, 64)], h6: [arith(3, 1, 3)], h7: [arith(10, -1.5, 8), arith(10, -1.5, 7)],
    h8: [geom(1, 0.9, 44)], h9: [geom(1, 1.618, 6)], h10: [fig('tri', 49), fig('odd', 35)]
  };
  const clash = [];
  Object.keys(recipes).forEach(k => {
    missions.forEach(m => {
      if (m.id === 'sequences-series-' + k || m.id.match(/-1[12]$/)) return;
      m.mem = {};
      if (recipes[k].some(e => m.check(e, m.mem))) clash.push(k + ' → ' + m.id.replace('sequences-series-', ''));
    });
  });
  if (clash.length) { fail++; console.log('  ✗ 做法連帶完成別的任務：' + clash.join('、')); }
  else console.log('  ✓ 20 個任務各自的做法都不會順便完成另一個任務');
}

const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const sp = pub.reduce((s, m) => s + starsOf(m), 0), sh = hid.reduce((s, m) => s + starsOf(m), 0);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('  ✗ 隱藏任務超過 20 顆'); }
if (hid.length !== 10 || hid.filter(m => m.level >= 7).length < 3 || hid.some(m => m.level < 3)) { fail++; console.log('  ✗ 隱藏任務要 10 個、3 到 10 級、至少 3 個 7 級以上'); }
console.log('\n公開 ' + pub.length + ' 個 ' + sp + ' 顆、隱藏 ' + hid.length + ' 個 ' + sh + ' 顆，共 ' + (sp + sh) + ' 顆。');
console.log(fail ? fail + ' 項失敗' : '全部通過');
if (fail) process.exit(1);
