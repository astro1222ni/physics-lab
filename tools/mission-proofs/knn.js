/* 任務可達成的證明腳本。用法：node tools/mission-proofs/knn.js
 * 用計算核心的 Session（頁面 js/knn.js 也是用它送事件）模擬學生的操作，證明：
 *   1. 預設狀態（一打開是「兩團」、k = 5、歐氏、× 1）不觸發任何任務；
 *   2. 每個任務都做得到（印出解法），並列出「差一點」的反例；
 *   3. 十個隱藏任務的解法不會順便完成另一個隱藏任務（交叉表）；
 *   4. 像試玩工具一樣亂按（放點、拖點、移查詢點、換預設資料、拉 k、換距離與單位、單步），隱藏任務被誤觸的機率；
 *   5. 要靠預設資料「運氣」的任務（每按一次預設資料就換一份），平均要按幾次。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/knn-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/knn.js');
const byId = id => missions.find(m => m.id === 'knn-' + id);
const hidden = missions.filter(m => m.hidden);
const A = 0, B = 1, C = 2;

// ---------- 與頁面相同的事件 ----------
/** 頁面一打開：靜默載入「兩團」、k 由滑桿（5）、不標準化——都不送事件 */
function page() {
  const ev = [];
  const S = new K.Session({ emit: (type, data) => ev.push({ type: type, data: data }) });
  S.loadPreset('blobs', true);
  S.setCfg('k', 5, true);
  S.ev = ev;
  /** 自己放一串點：[[gx, gy, 類別], …] */
  S.put = list => { list.forEach(p => { if (!S.addPoint(p[0], p[1], p[2])) throw new Error('放不下 ' + p); }); return S; };
  S.go = (gx, gy) => { if (!S.moveQuery(gx, gy)) throw new Error('查詢點沒動'); return S; };
  S.k = k => { S.setCfg('k', k); return S; };
  S.step = t => { for (let i = 0; i < t; i++) S.walkStep(true); return S; };
  return S;
}
const run = (m, events) => { m.mem = {}; return events.some(e => { try { return !!m.check(e, m.mem); } catch (err) { return false; } }); };
const pct = v => (v * 100).toFixed(1) + '%';

let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id);
  const ok = run(m, events);
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? ' 達成：' : ' 不觸發：') + note);
  return events;
}
const last = S => S.ev[S.ev.length - 1].data;

// ---------- 1. 預設狀態不觸發 ----------
console.log('預設狀態（「兩團」、k = 5、歐氏、× 1、不標準化）：');
{
  const S = page();
  // 不改變任何東西的操作：再設一次同樣的 k、同樣的距離、同樣的單位（頁面上這些都不送事件）
  S.setCfg('k', 5); S.setCfg('metric', 'euclid'); S.setCfg('scale', 1); S.setCfg('std', false);
  const hit = missions.filter(m => run(m, S.ev)).map(m => m.id);
  if (S.ev.length || hit.length) { fail++; console.log('  ✗ 預設狀態送出了事件或觸發了 ' + hit.join('、')); } else console.log('  ✓ 沒有送出任何事件，沒有任何任務被觸發');
  // 只動一下查詢點（仍在 A 區）
  const T = page().go(-9, 4);
  const hit2 = missions.filter(m => run(m, T.ev)).map(m => m.id);
  if (hit2.length) { fail++; console.log('  ✗ 查詢點挪一格就觸發了 ' + hit2.join('、')); } else console.log('  ✓ 查詢點在 A 區挪一格，也沒有觸發任何任務');
}

// ---------- 2. 公開任務 ----------
console.log('\n公開任務：');
const blobs1 = K.genBlobs(1);
const cfgE = { metric: 'euclid', scale: 1, std: false };
{
  const S = page().go(9, 0);
  expect('1', S.ev, true, '查詢點拖到 (0.45, 0)，B 團中央 → 猜 ' + 'ABC'[last(S).pred]);
  expect('1', page().go(-9, 0).ev, false, '拖到 A 團中央（猜 A）不算');
}
expect('2', page().step(5).ev, true, '按「單步」5 次（留一法走了 5 題）');
{
  const S = page().step(4);
  for (let i = 0; i < 10; i++) S.walkStep(false);
  expect('2', S.ev, false, '「單步」4 次、其餘用「播放」不算');
}
// knn-3：在「兩團」找一個 k = 1 與 k = 5 答案不同的查詢點
{
  let q = null;
  for (let gx = -20; gx <= 20 && !q; gx++) for (let gy = -20; gy <= 20 && !q; gy++) {
    if (blobs1.some(p => p.gx === gx && p.gy === gy)) continue;
    if (K.classify(blobs1, cfgE, gx, gy, 1).pred !== K.classify(blobs1, cfgE, gx, gy, 5).pred) q = [gx, gy];
  }
  const S = page().go(q[0], q[1]).k(1);
  expect('3', S.ev, true, '「兩團」查詢點 (' + q.map(v => (v / 20).toFixed(2)).join(', ') + ')，k = 5 → k = 1 答案改變');
  expect('3', page().go(q[0], q[1]).k(3).ev, false, 'k = 3 和 k = 5 不算（要 k = 1 對 k = 5）');
  expect('3', page().go(-9, 0).k(1).go(q[0], q[1]).ev, false, 'k = 1 在別處、k = 5 在這裡（查詢點不同）不算');
}
// knn-4：歐氏與曼哈頓選出不同的鄰居
{
  let q = null;
  const cfgM = { metric: 'manhattan', scale: 1, std: false };
  for (let gx = -20; gx <= 20 && !q; gx += 1) for (let gy = -20; gy <= 20 && !q; gy += 1) {
    const a = K.classify(blobs1, cfgE, gx, gy, 5).list.slice(0, 5).map(e => e.i).sort().join();
    const b = K.classify(blobs1, cfgM, gx, gy, 5).list.slice(0, 5).map(e => e.i).sort().join();
    if (a !== b) q = [gx, gy];
  }
  const S = page().go(q[0], q[1]);
  S.setCfg('metric', 'manhattan');
  expect('4', S.ev, true, '「兩團」查詢點 (' + q.map(v => (v / 20).toFixed(2)).join(', ') + ')，k = 5，按「曼哈頓」鄰居換了一個');
  const T = page().go(-9, 4); T.setCfg('metric', 'manhattan');
  expect('4', T.ev, false, '查詢點 (−0.45, 0.20)：兩種距離選出同樣 5 個鄰居，不算');
}
// knn-5：月牙，調 k 讓留一法 ≥ 95%
{
  const S = page();
  S.loadPreset('moons');
  const L = K.loo(S.points, cfgE);
  const ok = L.ks.filter((k, t) => L.correct[t] / L.n >= 0.95 - 1e-9);
  S.k(ok[0] === 5 ? 3 : ok[0]);
  if (ok[0] === 5) S.k(5);
  expect('5', S.ev, true, '按「月牙」（第 1 份），k = ' + ok.slice(0, 6).join('、') + '… 的留一法正確率 ≥ 95%（k = 1：' + pct(L.correct[0] / L.n) + '）');
  const T = page(); T.loadPreset('moons'); T.k(L.ks[L.ks.length - 1]);
  expect('5', T.ev, false, 'k = ' + L.ks[L.ks.length - 1] + '（其他全部）只剩 ' + pct(L.correct[L.correct.length - 1] / L.n));
}
// knn-6：k ≥ 點數，查詢點貼著人數較少的 A 類（兩團：A 18、B 22）
{
  const S = page().k(41);
  const a = S.points.find(p => p.c === A && !S.points.some(o => o.gx === p.gx + 1 && o.gy === p.gy));
  S.go(a.gx + 1, a.gy);
  const d = last(S);
  expect('6', S.ev, true, '「兩團」（A 18、B 22），k = 41，查詢點貼著一個 A 點 → 最近的是 ' + 'ABC'[d.nn1] + '，卻猜 ' + 'ABC'[d.pred]);
  const T = page().k(39); T.go(a.gx + 1, a.gy);
  expect('6', T.ev, false, 'k = 39 < 40 個點不算');
}
// knn-7：有雜訊，選留一法最好的 k，比 k = 1 至少高 8 個百分點
{
  const S = page();
  S.loadPreset('noisy');
  const L = K.loo(S.points, cfgE);
  const mx = Math.max(...L.correct), kb = L.ks[L.correct.indexOf(mx)];
  S.k(kb === 5 ? 3 : kb); if (kb === 5) S.k(5);
  expect('7', S.ev, true, '按「有雜訊」（第 1 份），k = ' + kb + '：' + pct(mx / L.n) + '，k = 1 只有 ' + pct(L.correct[0] / L.n));
  const T = page(); T.loadPreset('noisy');
  const second = L.ks.find((k, t) => L.correct[t] < mx && k > 1);
  T.k(second);
  expect('7', T.ev, false, 'k = ' + second + '（不是最好的 k）不算');
}
// knn-8：三類平手
{
  const S = page(); S.clear(); S.put([[-5, 0, A], [7, 0, B], [0, 9, C]]).go(0, 0).k(3);
  const d = last(S);
  expect('8', S.ev, true, '清空後放 A(−0.25, 0)、B(0.35, 0)、C(0, 0.45)，查詢點 (0, 0)，k = 3：票數 ' + d.votes.join(':') + '，靠距離總和判 ' + 'ABC'[d.pred]);
  const T = page(); T.clear(); T.put([[-5, 0, A], [7, 0, B]]).go(0, 0);
  expect('8', T.ev, false, '只有兩個點、k = 5（實際只問 2 個）的 1:1 不算');
}
// knn-9、knn-10：「兩團」的單位陷阱與標準化
{
  const S = page().go(-9, 4);
  S.setCfg('scale', 100);
  const s1 = S.ev[0].data.loo, s100 = last(S).loo;
  expect('9', S.ev, true, '「兩團」k = 5：× 1 ' + pct(s1) + ' → × 100 ' + pct(s100));
  S.setCfg('std', true);
  const z = last(S).loo;
  expect('10', S.ev, true, '接著勾「標準化」→ ' + pct(z) + '（和 × 1 差 ' + (Math.abs(z - s1) * 100).toFixed(1) + ' 個百分點）');
  const T = page(); T.setCfg('scale', 100);
  expect('9', T.ev, false, '只看了 × 100（× 1 時沒有任何事件）不算');
  const U = page().go(-9, 4); U.setCfg('scale', 100); U.k(7); U.setCfg('std', true);
  expect('10', U.ev, false, '中途把 k 改成 7，就不是同一組比較');
}
// knn-11：自己放 4 × 4 棋盤格（16 點）：上下左右是異類、斜對角是同類
{
  const grid = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) grid.push([-6 + 4 * i, -6 + 4 * j, (i + j) % 2]);
  const S = page(); S.clear(); S.put(grid);
  const d = last(S);
  expect('11', S.ev, true, '清空後放 4 × 4 棋盤格（間隔 0.2）：k = ' + d.ks.slice(0, 5).join('、') + ' 猜對 ' + d.curve.slice(0, 5).join('、') + ' 個 → 最好的 k = ' + d.bestKs.join('、'));
  const g3 = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) g3.push([-4 + 4 * i, -4 + 4 * j, (i + j) % 2]);
  const T = page(); T.clear(); T.put(g3);
  expect('11', T.ev, false, '3 × 3 棋盤格只有 9 點');
  const U = page(); U.loadPreset('checker');
  const L = K.loo(U.points, cfgE);
  expect('11', U.ev, false, '預設的「棋盤」不是自己放的（它的最好 k = ' + L.ks[L.correct.indexOf(Math.max(...L.correct))] + '）');
}

// ---------- 3. 隱藏任務 ----------
console.log('\n隱藏任務（解法與交叉檢查）：');
const ring8 = [[-12, -4, A], [-6, -4, A], [0, -4, A], [6, -4, A], [12, -4, A], [-6, 4, A], [0, 4, A], [6, 4, A]];
const sol = {
  h1: ['兩點 A(−0.2, 0)、B(0.2, 0)，k = 1，查詢點放在 (0, 0.25)：垂直平分線上，兩點一樣遠',
    () => { const S = page(); S.clear(); return S.put([[-4, 0, A], [4, 0, B]]).k(1).go(0, 5).ev; }],
  h2: ['B 三點在 0.1 處、A 四點在 0.25 處，查詢點 (0, 0)，k = 7：最近的三票都輸（距離比 2.5）',
    () => { const S = page(); S.clear(); return S.put([[2, 0, B], [-2, 0, B], [0, 2, B], [0, -5, A], [5, 0, A], [-5, 0, A], [0, 5, A]]).go(0, 0).k(7).ev; }],
  h3: ['清空，k = 9，自己放 5 個 A、5 個 B：留一法拿掉誰，誰那一類就少一票',
    () => { const S = page(); S.clear(); S.k(9); return S.put([[-10, 6, A], [-6, -8, A], [-14, 0, A], [-4, 2, A], [-12, -12, A], [10, 6, B], [6, -8, B], [14, 0, B], [4, 2, B], [12, -12, B]]).ev; }],
  h4: ['五個點都在半徑 0.25 的圓上（3-4-5 直角三角形的格點），查詢點在圓心，k = 5',
    () => { const S = page(); S.clear(); return S.put([[5, 0, A], [0, 5, B], [-5, 0, A], [0, -5, B], [3, 4, C]]).go(0, 0).ev; }],
  h5: ['A(0.1, 0)、B(0, 0.2)，再放 A(0.3, 0)、B(−0.3, 0)，查詢點 (0, 0)，k = 3：第 3 席兩點一樣遠，先放的 A 坐下',
    () => { const S = page(); S.clear(); return S.put([[2, 0, A], [0, 4, B], [6, 0, A], [-6, 0, B]]).go(0, 0).k(3).ev; }],
  h6: ['四對「A 緊貼 B」（間隔 0.1）分在四個角落，k = 1：每個點最近的都是異類',
    () => { const S = page(); S.clear(); return S.put([[-16, -16, A], [-14, -16, B], [16, -16, A], [14, -16, B], [-16, 16, B], [-14, 16, A], [16, 16, B], [14, 16, A]]).k(1).ev; }],
  h7: ['A(−0.2, −0.2)、B(0.2, 0.2)，「曼哈頓」、k = 1，查詢點 (0.75, −0.25)：兩邊都走 1.0，歐氏卻是 0.95 對 0.71',
    () => { const S = page(); S.clear(); S.put([[-4, -4, A], [4, 4, B]]); S.setCfg('metric', 'manhattan'); return S.k(1).go(15, -5).ev; }],
  h8: ['A(0.25, 0)、B(−0.25, 0)、C(0, 0.25)，查詢點 (0, 0)，k = 3：1:1:1、距離也相同，最先放的 A 勝',
    () => { const S = page(); S.clear(); return S.put([[5, 0, A], [-5, 0, B], [0, 5, C]]).go(0, 0).k(3).ev; }],
  h9: ['A 放在 x2 = −0.05、B 放在 x2 = +0.05，沿 x1 交錯排（間隔 0.2）：× 1 時看到的是 x1，× 100 才看見真正的差別',
    () => { const S = page(); S.clear(); S.put([[-18, -1, A], [-14, 1, B], [-10, -1, A], [-6, 1, B], [-2, -1, A], [2, 1, B], [6, -1, A], [10, 1, B], [14, -1, A], [18, 1, B]]); S.setCfg('scale', 100); return S.ev; }],
  h10: ['8 個 A 排成兩排，2 個 B 遠遠放在兩個角落：不管 k 多少，A 永遠猜對、B 永遠猜錯',
    () => { const S = page(); S.clear(); return S.put(ring8.concat([[-20, 20, B], [20, -20, B]])).ev; }]
};
const keys = Object.keys(sol);
const table = [];
keys.forEach(k => {
  const ev = sol[k][1]();
  expect(k, ev, true, sol[k][0]);
  const others = hidden.filter(m => m.id !== 'knn-' + k && run(m, ev)).map(m => m.id.replace('knn-', ''));
  table.push(k.padEnd(4) + '→ ' + (others.length ? '✗ 也完成了 ' + others.join('、') : '沒有連帶完成其他隱藏任務'));
  if (others.length) fail++;
});
// 「差一點」的反例
{
  let S = page(); S.clear(); S.put([[-4, 0, A], [4, 0, B]]).go(0, 5);
  expect('h1', S.ev, false, 'k = 5（實際問 2 個，1:1 平手）不算，要 k = 1');
  S = page(); S.clear(); S.put([[-4, 0, A], [4, 0, B]]).k(1).go(1, 5);
  expect('h1', S.ev, false, '查詢點偏一格 (0.05, 0.25) 不算');
  S = page(); S.clear(); S.put([[2, 0, B], [-2, 0, B], [0, 4, A], [0, -4, A], [4, 0, A]]).go(0, 0);
  expect('h2', S.ev, false, 'k = 5：最近的只有兩票輸，不算');
  S = page(); S.clear(); S.put([[3, 0, B], [-3, 0, B], [0, 3, B], [0, -4, A], [4, 0, A], [-4, 0, A], [0, 4, A]]).go(0, 0).k(7);
  expect('h2', S.ev, false, '輸家在 0.15、贏家在 0.2：距離比 1.33 < 1.5 不算');
  S = page(); S.clear(); S.k(9); S.put([[-10, 6, A], [-6, -8, A], [-14, 0, A], [-4, 2, A], [-12, -12, A], [0, 18, A], [10, 6, B], [6, -8, B], [14, 0, B], [4, 2, B]]);
  expect('h3', S.ev, false, '6 對 4（兩類人數不同）不算');
  S = page(); S.loadPreset('moons'); S.k(99); S.clear(); S.k(9);
  S.put([[-10, 6, A], [-6, -8, A], [-14, 0, A], [-4, 2, A], [-12, -12, A], [10, 6, B], [6, -8, B], [14, 0, B], [4, 2, B]]); S.k(5);
  expect('h3', S.ev, false, '9 點、k = 5 不算（要 10 點以上、k ≥ 點數 − 1）');
  S = page(); S.clear(); S.put([[5, 0, A], [0, 5, B], [-5, 0, A], [0, -5, B]]).go(0, 0);
  expect('h4', S.ev, false, '只有 4 個點一樣遠（k = 5 實際問 4 個）不算');
  S = page(); S.clear(); S.put([[2, 0, A], [0, 4, A], [6, 0, A], [-6, 0, B]]).go(0, 0).k(3);
  expect('h5', S.ev, false, '最後一席有人搶，但前兩席已經是 A，結果不變，不算');
  S = page(); S.clear(); S.put([[2, 0, A], [0, 4, B], [6, 0, A], [-6, 0, B]]).go(0, 0);
  expect('h5', S.ev, false, 'k = 5 只有 4 個點（座位沒坐滿）不算');
  S = page(); S.clear(); S.put([[-16, -16, A], [-14, -16, B], [16, -16, A], [14, -16, B], [-16, 16, B], [-14, 16, A]]).k(1);
  expect('h6', S.ev, false, '只有三對（6 點）不算');
  S = page(); S.clear(); S.put([[-4, -4, A], [4, 4, B]]); S.setCfg('metric', 'manhattan'); S.k(1).go(4, -4);
  expect('h7', S.ev, false, '曼哈頓的「中線」上 (0.2, −0.2)：歐氏也一樣遠（比 1.00），不算');
  S = page(); S.clear(); S.put([[5, 0, A], [-6, 0, B], [0, 7, C]]).go(0, 0).k(3);
  expect('h8', S.ev, false, '三點距離各不相同：1:1:1 但靠距離總和分出勝負，不算');
  S = page(); S.setCfg('scale', 100);
  expect('h9', S.ev, false, '「兩團」改 × 100 是變差，不算');
  S = page(); S.clear(); S.put([[-18, -1, A], [-14, 1, B], [-10, -1, A], [-6, 1, B], [-2, -1, A], [2, 1, B], [6, -1, A], [10, 1, B], [14, -1, A], [18, 1, B], [0, 12, A], [0, -12, B]]); S.setCfg('scale', 100);
  expect('h9', S.ev, false, '多放兩個「放錯邊」的點：× 100 只到 ' + pct(last(S).loo) + '（要 90% 以上）');
  S = page(); S.clear(); S.put(ring8.concat([[-20, 20, B], [-16, 20, B]]));
  expect('h10', S.ev, false, '兩個 B 擠在一起：k = 1 時互相猜對，曲線不平');
}
console.log('\n十個隱藏任務的交叉檢查：');
table.forEach(l => console.log('  ' + l));

// ---------- 4. 亂按的誤觸率 ----------
const R = 400, STEPS = 300;
console.log('\n亂按模擬：' + R + ' 人 × 每人 ' + STEPS + ' 個隨機操作（放點 25%、移查詢點 22%、拖點 10%、刪點 5%、換預設資料 8%、清空 2%、拉 k 12%、換距離／單位／標準化 各 3%、單步 7%）：');
{
  const rand = K.rng(20261113);
  const hits = {};
  hidden.forEach(m => { hits[m.id] = 0; });
  const ri = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const near = (S, v) => Math.max(-20, Math.min(20, v + ri(-3, 3)));
  const t0 = Date.now();
  for (let r = 0; r < R; r++) {
    const S = page();
    for (let s = 0; s < STEPS; s++) {
      const u = rand(), n = S.points.length;
      if (u < 0.25) S.addPoint(ri(-20, 20), ri(-20, 20), ri(0, 2));
      else if (u < 0.47) S.moveQuery(rand() < 0.5 ? near(S, S.q.gx) : ri(-20, 20), rand() < 0.5 ? near(S, S.q.gy) : ri(-20, 20));
      else if (u < 0.57) { if (n) { const i = ri(0, n - 1); S.movePoint(i, near(S, S.points[i].gx), near(S, S.points[i].gy)); } }
      else if (u < 0.62) { if (n) S.removeAt(ri(0, n - 1)); }
      else if (u < 0.70) S.loadPreset(K.PRESET_NAMES[ri(0, 4)]);
      else if (u < 0.72) S.clear();
      else if (u < 0.84) { const w = rand(); S.setCfg('k', w < 0.2 ? 1 : w < 0.3 ? 99 : 2 * ri(0, 49) + 1); }
      else if (u < 0.87) S.setCfg('metric', S.cfg.metric === 'euclid' ? 'manhattan' : 'euclid');
      else if (u < 0.90) S.setCfg('scale', S.cfg.scale === 1 ? 100 : 1);
      else if (u < 0.93) S.setCfg('std', !S.cfg.std);
      else S.walkStep(true);
    }
    hidden.forEach(m => { if (run(m, S.ev)) hits[m.id]++; });
  }
  let worst = 0;
  hidden.forEach(m => { const p = hits[m.id] / R; worst = Math.max(worst, p); console.log('  ' + m.id.padEnd(8) + (p * 100).toFixed(2) + '%'); });
  console.log('  （' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒）');
  if (worst >= 0.02) { fail++; console.log('  ✗ 有隱藏任務被亂按觸發的機率達 2%'); } else console.log('  ✓ 每個隱藏任務被亂按觸發的機率都在 2% 以下');
}

// ---------- 5. 靠預設資料運氣的任務 ----------
console.log('\n每按一次預設資料就換一份；前 50 份裡做得到的比例（平均要按幾次）：');
{
  const N = 50;
  const rate = (name, ok) => { let c = 0; for (let s = 1; s <= N; s++) if (ok(K.PRESETS[name](s))) c++; return c; };
  const acc = (pts, cfg) => { const L = K.loo(pts, cfg); return L.correct.map(c => c / L.n); };
  const r5 = rate('moons', p => acc(p, cfgE).some(a => a >= 0.95 - 1e-9));
  const r7 = rate('noisy', p => { const a = acc(p, cfgE); return Math.max(...a) >= a[0] + 0.08 - 1e-9; });
  // knn-9、10：任選一個 k 與距離就可以；這裡統計「存在某個 k、某種距離做得到」
  const both = (p, f) => ['euclid', 'manhattan'].some(m => {
    const s1 = acc(p, { metric: m, scale: 1, std: false }), s100 = acc(p, { metric: m, scale: 100, std: false }), z = acc(p, { metric: m, scale: 100, std: true });
    return s1.some((v, t) => f(v, s100[t], z[t]));
  });
  const r9 = rate('blobs', p => both(p, (a, b) => a - b >= 0.2 - 1e-9));
  const r10 = rate('blobs', p => both(p, (a, b, z) => a - b >= 0.2 - 1e-9 && Math.abs(z - a) <= 0.05 + 1e-9));
  const r95 = rate('blobs', p => { const a = acc(p, cfgE), b = acc(p, { metric: 'euclid', scale: 100, std: false }); return a[2] - b[2] >= 0.2 - 1e-9; });
  const line = (id, c, note) => { console.log('  ' + id.padEnd(7) + c + '/' + N + (c ? '（平均約 ' + (N / c).toFixed(1) + ' 次）' : '') + '　' + note); if (!c) fail++; };
  line('knn-5', r5, '「月牙」存在 k 使留一法 ≥ 95%');
  line('knn-7', r7, '「有雜訊」最好的 k 比 k = 1 高 8 個百分點以上');
  line('knn-9', r9, '「兩團」存在 k、距離使 × 1 比 × 100 高 20 個百分點（預設 k = 5 歐氏：' + r95 + '/' + N + '）');
  line('knn-10', r10, '「兩團」同上，而且標準化後回到 × 1 的 5 個百分點內');
}

console.log(fail ? `\n✗ ${fail} 項不符合` : '\n全部任務都證明做得到，預設狀態與亂按都不會誤觸。');
process.exitCode = fail ? 1 : 0;
