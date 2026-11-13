/* 任務可達成的證明腳本。用法：node tools/mission-proofs/hanoi.js
 * 頁面（js/hanoi.js）的每個操作都直接呼叫計算核心的 Session，任務事件由 Session 送出；這裡用同一個 Session 模擬操作，證明：
 *   1. 每個任務都做得到（印出解法）；2. 預設狀態不觸發；3. 十個隱藏任務的解法不會順便完成另一個隱藏任務；
 *   4. 像試玩工具一樣亂按（點柱子、拖曳、上一步、重來、打亂、自動解、單步、跳過、廣度優先搜尋、挑戰、滑桿），隱藏任務被誤觸的機率。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const H = require(ROOT + 'js/hanoi-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/hanoi.js');
const byId = id => missions.find(m => m.id === 'hanoi-' + id);
const hidden = missions.filter(m => m.hidden);

// ---------- 模擬：Session 收集事件 ----------
function sess(n, seed) {
  const ev = [];
  const s = new H.Session({ n: 4, rng: H.rng(seed || 5), emit: (type, data) => ev.push({ type: type, data: JSON.parse(JSON.stringify(data)) }) });
  s.ev = ev;
  if (n && n !== 4) s.setN(n);
  return s;
}
const hand = (s, moves) => { moves.forEach(m => { const r = s.tryMove(m.from, m.to, 'hand'); if (!r.ok) throw new Error('不合法的移動 ' + JSON.stringify(m)); }); return s; };
/** 親手沿最短路走到某個狀態（用 BFS 距離表） */
function walk(s, code) {
  const d = H.bfs(code, s.n).dist;
  while (s.code() !== code) {
    const here = d[s.code()];
    const mv = H.legalMoves(s.pos, s.n).find(m => { const p = s.pos.slice(); p[H.tops(p, s.n)[m[0]]] = m[1]; return d[H.encode(p, s.n)] === here - 1; });
    s.tryMove(mv[0], mv[1], 'hand');
  }
  return s;
}
const reverse = moves => moves.slice().reverse().map(m => ({ disk: m.disk, from: m.to, to: m.from }));
/** 自動播放到完成（像按「自動解」） */
function autoAll(s) { const r = s.autoPlay(); if (!r.ok) throw new Error('不能自動解：' + r.reason); while (s.autoReady()) s.autoStep(false); return s; }
function undoAll(s) { while (s.stack.length) s.undo(); return s; }

const run = (m, events) => { m.mem = {}; return events.some(e => { try { return !!m.check(e, m.mem); } catch (err) { return false; } }); };
let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id);
  const ok = run(m, events);
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? ' 達成：' : ' 不觸發：') + note);
  return events;
}

// ---------- 1. 預設狀態不觸發 ----------
console.log('預設狀態（4 個盤子在 A、目標 C），動一下不改狀態的控制項：');
{
  const s = sess(4);
  s.setHint(false); s.legend(10, 1);
  const hit = missions.filter(m => run(m, s.ev)).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); } else console.log('  ✓ 沒有任何任務被觸發');
}

// ---------- 2. 每個任務的解法 ----------
console.log('\n公開任務：');
expect('1', hand(sess(3), H.hanoiMoves(3, 0, 2)).ev, true, '3 個盤子親手 A → C');
expect('1', autoAll(sess(3)).ev, false, '按「自動解」做完不算');
expect('2', hand(sess(3), H.hanoiMoves(3, 0, 2)).ev, true, '3 個盤子 7 步（第 k 步搬的盤 = k 的二進位尾端 0 的個數 + 1：1 2 1 3 1 2 1）');
{ const s = sess(3); s.setHint(true); expect('2', hand(s, H.hanoiMoves(3, 0, 2)).ev, false, '開「顯示最短路」跟著走不算'); }
{ const s = sess(3); s.tryMove(0, 1); s.tryMove(1, 2); expect('2', hand(s, H.pathToPerfect(s.pos, 3, 2)).ev, false, '多走一步（8 步）不算'); }
{ const s = sess(4); s.legend(64, 1); expect('3', s.ev, true, 'N = 64、每秒 1 步 → 2^64 − 1 秒 ≈ 5850 億年'); }
expect('4', autoAll(sess(4)).ev, true, '4 個盤子選「遞迴」按「自動解」');
expect('4', autoAll(sess(3)).ev, false, '3 個盤子不算');
{ const s = sess(5); s.bfsRun(); expect('5', s.ev, true, '5 個盤子在 A 按「廣度優先搜尋」→ 到 C 31 步，搜完 243 個狀態、31 層'); }
expect('6', hand(sess(4), H.hanoiMoves(4, 0, 2)).ev, true, '4 個盤子親手 15 步');
{ const s = sess(6); s.autoSkip(); s.autoSkip(); s.autoSkip(); expect('7', s.ev, true, '6 個盤子按三次「跳過子問題」：31 步、搬盤 6、31 步'); }
{ const s = sess(6); s.autoStep(true); s.autoSkip(); s.autoSkip(); s.autoSkip(); while (s.autoReady()) s.autoSkip(); expect('7', s.ev, false, '先按過「單步」不算'); }
{ const s = sess(4); for (let i = 0; i < 5; i++) { s.quizNew('disk'); s.quizAnswer(s.quiz.ans.disk); } expect('8', s.ev, true, '「出題」連續答對 5 題（答案 = k 的二進位尾端 0 的個數 + 1）'); }
{ const s = sess(4); for (let i = 0; i < 5; i++) { s.quizNew('disk'); s.quizAnswer(i === 2 ? (s.quiz.ans.disk % 10) + 1 : s.quiz.ans.disk); } expect('8', s.ev, false, '中間答錯一題，連續答對中斷'); }
{ const s = sess(6); s.alg = 'iter'; expect('9', autoAll(s).ev, true, '6 個盤子「最小盤輪流」自動解完，63 步都和遞迴相同'); }
expect('10', hand(sess(5), H.hanoiMoves(5, 0, 2)).ev, true, '5 個盤子親手 31 步');
{
  const s = sess(6, 21);
  do s.shuffle(); while (s.seg.startDist < 20);
  const d0 = s.seg.startDist, st = s.state();
  hand(s, H.pathToPerfect(s.pos, 6, 2));
  expect('11', s.ev, true, '6 個盤子打亂成 ' + st + '（離 C ' + d0 + ' 步），親手照最短路搬完');
  const t = sess(6, 21);
  do t.shuffle(); while (t.seg.startDist < 20);
  t.tryMove(...H.legalMoves(t.pos, 6).find(m => { const p = t.pos.slice(); p[H.tops(p, 6)[m[0]]] = m[1]; return t.distOf(p) > t.dist(); }));
  expect('11', hand(t, H.pathToPerfect(t.pos, 6, 2)).ev, false, '多走一步不算');
}
console.log('       （挑戰題亂猜：連續猜對 5 題盤號的機率 = (1/10)^5 = 0.001%，平均要猜 10 萬回；搬法題 6 選 1，連續猜對 3 題 = 1/216）');
{ const s = sess(4); for (let i = 0; i < 3; i++) { s.quizNew('move'); s.quizAnswer([s.quiz.ans.from, s.quiz.ans.to]); } expect('12', s.ev, true, '「進階題」連續答對 3 題（盤 d 沿固定方向繞：(n − d) 偶數 A → C → B，奇數 A → B → C）'); }

console.log('\n隱藏任務（解法與交叉檢查）：');
// h8：最大盤搬一次或兩次一樣短（AAB → ABA：d1 = d2 = 6）
function twoWays() {
  const n = 3, s0 = H.parse('AAB'), t = H.parse('ABA');
  const i = s0[n], j = t[n], k = 3 - i - j;
  const sP = s0.slice(0, n), tP = t.slice(0, n);
  const p1 = H.pathToPerfect(sP, n - 1, k).concat([{ disk: n, from: i, to: j }], reverse(H.pathToPerfect(tP, n - 1, k)));
  const p2 = H.pathToPerfect(sP, n - 1, j).concat([{ disk: n, from: i, to: k }], H.hanoiMoves(n - 1, j, i), [{ disk: n, from: k, to: j }], reverse(H.pathToPerfect(tP, n - 1, i)));
  const s = walk(sess(3), H.encode(s0, n));
  s.setCustom(H.encode(t, n));
  hand(s, p1); undoAll(s); hand(s, p2);
  return { s: s, p1: p1.length, p2: p2.length };
}
const sol = {
  h1: ['4 個盤子親手 15 步搬完，再連按 15 次「上一步」退回起點（呼叫堆疊：後進先出）', () => undoAll(hand(sess(4), H.hanoiMoves(4, 0, 2))).ev],
  h2: ['每秒 1 步：N = 58 要 2^58 − 1 秒 ≈ 91 億年（比宇宙年齡 138 億年短），N = 59 ≈ 183 億年（比較長）；兩個連著看', () => { const s = sess(4); s.legend(58, 1); s.legend(59, 1); return s.ev; }],
  h3: ['4 個盤子、目標 C：第一步把盤 1 放到 C（正確是 B），距離仍是 15；再照最短路 15 步，共 16 步', () => { const s = sess(4); s.tryMove(0, 2); return hand(s, H.pathToPerfect(s.pos, 4, 2)).ev; }],
  h4: ['「最小盤輪流」自動解四種情形：3 個盤 A→C、A→B，4 個盤 A→C、A→B（最小盤的方向由 n 的奇偶與目標決定）', () => {
    const s = sess(3); s.alg = 'iter';
    autoAll(s); s.reset(); s.setTarget(1); autoAll(s); s.setN(4); s.setTarget(2); autoAll(s); s.reset(); s.setTarget(1); autoAll(s);
    return s.ev;
  }],
  h5: ['4 個盤子親手 A → C（15 步）再 C → B（15 步）：連續拜訪三種「整疊」共 30 步', () => hand(hand(sess(4), H.hanoiMoves(4, 0, 2)), H.hanoiMoves(4, 2, 1)).ev],
  h6: ['5 個盤子，自動解（「單步」）16 步後，親手照最短路做完剩下 15 步，總共 31 步', () => {
    const s = sess(5); for (let i = 0; i < 16; i++) s.autoStep(true);
    return hand(s, H.pathToPerfect(s.pos, 5, 2)).ev;
  }],
  h7: ['5 個盤子親手：盤 1–4 到 C（15）、盤 5 到 B、盤 1–4 回 A（15）、盤 5 到 C：第 32 = 2^5 步時最大盤到過三根柱', () => {
    const s = sess(5);
    return hand(s, H.hanoiMoves(4, 0, 2).concat([{ disk: 5, from: 0, to: 1 }], H.hanoiMoves(4, 2, 0), [{ disk: 5, from: 1, to: 2 }])).ev;
  }],
  h8: ['3 個盤子親手走到 AAB，在狀態圖點 ABA 當目標（d1 = d2 = 6）；最大盤搬一次走完，按「上一步」退回，再用最大盤搬兩次的路走完', () => twoWays().s.ev],
  h9: ['4 個盤子、目標 B，每一步都照 A → B → C → A 的方向（單行道），用最少的 Q(4) = 43 步搬完（Q(n) = 2R(n−1) + 1、R(n) = 2R(n−1) + Q(n−1) + 2）', () => { const s = sess(4); s.setTarget(1); return hand(s, H.cyclicMoves(4, 0, 1)).ev; }],
  h10: ['3 個盤子親手走到 AAB，在狀態圖點 BBA 當目標：最大盤直接 B → A 要 7 步，經過 C 兩次只要 5 步；親手照最短路走完', () => {
    const s = walk(sess(3), H.encode(H.parse('AAB'), 3)); s.setCustom(H.encode(H.parse('BBA'), 3));
    return walk(s, s.target.code).ev;
  }]
};
const keys = Object.keys(sol);
const table = [];
keys.forEach(k => {
  const ev = sol[k][1]();
  expect(k, ev, true, sol[k][0]);
  const others = hidden.filter(m => m.id !== 'hanoi-' + k && run(m, ev)).map(m => m.id.replace('hanoi-', ''));
  table.push(k.padEnd(4) + '→ ' + (others.length ? '✗ 也完成了 ' + others.join('、') : '沒有連帶完成其他隱藏任務'));
  if (others.length) fail++;
});
{ const w = twoWays(); console.log('       （h8 的兩條路：最大盤搬一次 ' + w.p1 + ' 步、搬兩次 ' + w.p2 + ' 步）'); }
// 公開任務的解法也不可以順便完成隱藏任務
{
  const pub = [hand(sess(3), H.hanoiMoves(3, 0, 2)).ev, hand(sess(5), H.hanoiMoves(5, 0, 2)).ev, autoAll(sess(6)).ev, (() => { const s = sess(6); s.alg = 'iter'; return autoAll(s).ev; })(),
    (() => { const s = sess(8); s.bfsRun(); return s.ev; })(), (() => { const s = sess(4); s.legend(64, 1); return s.ev; })()];
  const hit = new Set();
  pub.forEach(ev => hidden.forEach(m => { if (run(m, ev)) hit.add(m.id); }));
  if (hit.size) { fail++; console.log('  ✗ 公開任務的解法完成了 ' + [...hit].join('、')); } else console.log('  ✓ 公開任務的解法（親手解、自動解、BFS、傳說）不會完成任何隱藏任務');
}
// 幾個「差一點」的反例
expect('h1', (() => { const s = hand(sess(4), H.hanoiMoves(4, 0, 2)); for (let i = 0; i < 14; i++) s.undo(); return s.ev; })(), false, '只退 14 步（還沒回到起點）不算');
expect('h1', undoAll(hand(sess(3), H.hanoiMoves(3, 0, 2))).ev, false, '3 個盤子不算（要 4 個以上）');
expect('h2', (() => { const s = sess(4); s.legend(58, 1); s.legend(60, 1); s.legend(59, 1); return s.ev; })(), false, '58 → 60 → 59，沒有連著比較界線兩邊');
expect('h2', (() => { const s = sess(4); s.legend(58, 1000); s.legend(59, 1000); return s.ev; })(), false, '每秒 1000 步不算');
expect('h3', (() => { const s = sess(4); s.tryMove(0, 1); s.tryMove(1, 0); s.tryMove(0, 2); return hand(s, H.pathToPerfect(s.pos, 4, 2)).ev; })(), false, '來回多走兩步才走錯（共 18 步）不算');
expect('h3', (() => { const s = sess(4); s.tryMove(0, 1); return hand(s, H.pathToPerfect(s.pos, 4, 2)).ev; })(), false, '第一步就走對（15 步）不算');
expect('h4', (() => { const s = sess(3); s.alg = 'iter'; autoAll(s); s.reset(); s.setTarget(1); autoAll(s); s.setN(4); s.setTarget(2); autoAll(s); return s.ev; })(), false, '只看了三種情形');
expect('h5', hand(hand(sess(4), H.hanoiMoves(4, 0, 2)), [{ disk: 1, from: 2, to: 0 }, { disk: 1, from: 0, to: 2 }].concat(H.hanoiMoves(4, 2, 1))).ev, false, '中途多走兩步不算');
expect('h5', (() => { const s = autoAll(sess(4)); return hand(s, H.hanoiMoves(4, 2, 1)).ev; })(), false, '第一段用自動解不算');
expect('h6', (() => { const s = sess(5); for (let i = 0; i < 24; i++) s.autoStep(true); return hand(s, H.pathToPerfect(s.pos, 5, 2)).ev; })(), false, '自動解 24 步、親手只做 7 步不算');
expect('h6', (() => { const s = sess(5); for (let i = 0; i < 8; i++) s.autoStep(true); return hand(s, H.pathToPerfect(s.pos, 5, 2)).ev; })(), false, '自動解只做 8 步（不到一半）不算');
expect('h7', (() => { const s = hand(sess(5), H.hanoiMoves(5, 0, 2)); return hand(s, H.hanoiMoves(4, 2, 0).concat([{ disk: 5, from: 2, to: 1 }])).ev; })(), false, '先搬完到 C 再把最大盤搬到 B（第 47 步）不算');
expect('h8', (() => { const s = walk(sess(3), H.encode(H.parse('AAB'), 3)); s.setCustom(H.encode(H.parse('ABA'), 3)); return walk(s, s.target.code).ev; })(), false, '只走了其中一條路');
expect('h9', hand(sess(4), H.cyclicMoves(4, 0, 2)).ev, true, '目標 C：照單行道要往前兩格，R(4) = 59 步也算');
expect('h9', hand(sess(4), H.cyclicMoves(4, 0, 1, -1)).ev, true, '反方向的單行道（A → C → B → A）也算：目標 C 只要往前一格，43 步');
expect('h9', hand(sess(3), H.cyclicMoves(3, 0, 2)).ev, false, '3 個盤子不算（要 4 個以上）');
expect('h9', (() => { const s = sess(4); s.setTarget(1); s.tryMove(0, 1); s.tryMove(1, 2); s.tryMove(2, 0); return hand(s, H.cyclicMoves(4, 0, 1)).ev; })(), false, '照單行道但先繞了一圈（多 3 步）不算');
expect('h10', (() => { const s = walk(sess(3), H.encode(H.parse('AAB'), 3)); s.setCustom(H.encode(H.parse('BBA'), 3)); s.setHint(true); return walk(s, s.target.code).ev; })(), false, '開「顯示最短路」跟著走不算');
expect('h10', (() => { const s = walk(sess(3), H.encode(H.parse('AAB'), 3)); s.setCustom(H.encode(H.parse('BAA'), 3)); return walk(s, s.target.code).ev; })(), false, 'AAB → BAA：最大盤直接搬比較短（d1 < d2）');
console.log('\n十個隱藏任務的交叉檢查：');
table.forEach(l => console.log('  ' + l));

// ---------- 3. 亂按（像試玩工具）的誤觸率 ----------
const R = 2000, STEPS = 300;
console.log('\n亂按模擬：' + R + ' 回合，每回合 ' + STEPS + ' 個隨機操作（試玩工具的比例：按鈕 30、滑桿 25、數字輸入 10、勾選 8、畫布 15、等待 4）：');
{
  const rand = H.rng(1112);
  const hits = {};
  hidden.forEach(m => { hits[m.id] = 0; });
  const NUMS = [0, -5, -0.0001, 99999999, 3.14159265358979, 1e9, 0.000001];
  for (let r = 0; r < R; r++) {
    const s = sess(4, 1000 + r);
    let sel = -1, playing = false, pick = false, legendN = 10, rate = 1;
    const stop = () => { playing = false; };
    const handMove = (a, b) => { stop(); s.tryMove(a, b, 'hand'); };
    const peg = p => { if (sel < 0) { if (s.top(p)) sel = p; } else { if (sel !== p) handMove(sel, p); sel = -1; } };
    const setRange = (which, v) => {
      if (which === 0) { stop(); sel = -1; if (s.setN(v) && pick && s.n > H.GRAPH_MAX) pick = false; }
      else if (which === 1) { legendN = Math.max(1, Math.min(100, Math.round(v))); s.legend(legendN, rate); }
      // which === 2：速度，不送事件
    };
    for (let k = 0; k < STEPS; k++) {
      if (playing) { const m = 1 + Math.floor(rand() * 8); for (let i = 0; i < m && s.autoReady(); i++) s.autoStep(false); if (!s.autoReady()) playing = false; }
      let u = rand() * 92;
      if ((u -= 30) < 0) {               // 按鈕（24 個）
        const b = Math.floor(rand() * 24);
        if (b < 3) peg(b);
        else if (b === 3) { stop(); s.undo(); }
        else if (b === 4) { stop(); sel = -1; s.reset(); }
        else if (b === 5) { stop(); sel = -1; s.shuffle(); }
        else if (b === 6) { stop(); sel = -1; s.clearAll(); }
        else if (b === 7) s.alg = 'rec';
        else if (b === 8) s.alg = 'iter';
        else if (b === 9) { if (playing) stop(); else if (s.autoPlay().ok) playing = true; }
        else if (b === 10) { stop(); s.autoStep(true); }
        else if (b === 11) { stop(); s.autoSkip(); }
        else if (b === 12) { stop(); s.setTarget(1); pick = false; }
        else if (b === 13) { stop(); s.setTarget(2); pick = false; }
        else if (b === 14) { if (s.n <= H.GRAPH_MAX) pick = true; }
        else if (b === 15) s.bfsRun();
        else if (b === 16) s.quizNew('disk');
        else if (b === 17) s.quizNew('move');
        else if (b === 18) { rate = 1; s.legend(legendN, rate); }
        else if (b === 19) { rate = 1000; s.legend(legendN, rate); }
        else if (b === 20) { rate = 1e9; s.legend(legendN, rate); }
        else if (s.quiz.open) {           // 答案按鈕（題目開著時才看得到）
          if (s.quiz.kind === 'disk') s.quizAnswer(1 + Math.floor(rand() * 10));
          else { const a = Math.floor(rand() * 3), b2 = (a + 1 + Math.floor(rand() * 2)) % 3; s.quizAnswer([a, b2]); }
        }
      } else if ((u -= 25) < 0) {        // 滑桿：20% 最小、20% 最大、其他隨機位置
        const which = Math.floor(rand() * 3), w = rand(), lo = which === 1 ? 1 : 1, hi = which === 1 ? 100 : 10;
        setRange(which, w < 0.2 ? lo : w < 0.4 ? hi : lo + Math.floor(rand() * (hi - lo + 1)));
      } else if ((u -= 10) < 0) {        // 點滑桿數字直接輸入奇怪的值（夾在範圍內、四捨五入）
        const which = Math.floor(rand() * 3), v = NUMS[Math.floor(rand() * NUMS.length)], hi = which === 1 ? 100 : 10;
        setRange(which, Math.max(1, Math.min(hi, Math.round(v))));
      } else if ((u -= 8) < 0) {         // 勾選「顯示最短路」
        s.setHint(!s.hintOn);
      } else if ((u -= 15) < 0) {        // 畫布：主畫面（點或拖曳）、狀態圖（點）、遞迴圖（沒有作用）
        const c = Math.floor(rand() * 3);
        if (c === 0) {
          const a = Math.floor(rand() * 3), b = Math.floor(rand() * 3);
          if (rand() < 0.3) peg(a); else if (a !== b) { sel = -1; handMove(a, b); }
        } else if (c === 1 && pick && s.n <= H.GRAPH_MAX) { stop(); s.setCustom(Math.floor(rand() * Math.pow(3, s.n))); }
      }
    }
    hidden.forEach(m => { if (run(m, s.ev)) hits[m.id]++; });
  }
  let worst = 0;
  hidden.forEach(m => { const p = hits[m.id] / R; worst = Math.max(worst, p); console.log('  ' + m.id.padEnd(12) + (p * 100).toFixed(2) + '%'); });
  if (worst > 0.02) { fail++; console.log('  ✗ 有隱藏任務被亂按觸發的機率超過 2%'); } else console.log('  ✓ 每個隱藏任務被亂按觸發的機率都在 2% 以下');
}

console.log(fail ? `\n✗ ${fail} 項不符合` : '\n全部任務都證明做得到，預設狀態與亂按都不會誤觸。');
process.exitCode = fail ? 1 : 0;
