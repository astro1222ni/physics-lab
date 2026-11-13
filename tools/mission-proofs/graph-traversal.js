/* 任務可達成的證明腳本。用法：node tools/mission-proofs/graph-traversal.js
 * 用計算核心模擬頁面（js/graph-traversal.js）的狀態與事件：'found' 與頁面 emitFound 相同，'finish' 用核心的 mazeReport()／graphReport()（頁面也用它們）。證明：
 *   1. 每個任務在滑桿範圍與精度內做得到（印出解法）；2. 預設狀態不觸發；
 *   3. 十個隱藏任務的解法不會順便完成另一個隱藏任務（交叉檢查表），公開任務的解法也不會順便完成隱藏任務；
 *   4. 固定種子的亂按模擬（400 人 × 每人 300 次，像學生隨便點每一個控制項），印出每個任務被碰巧完成的比例，隱藏任務都要 < 2%。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const G = require(ROOT + 'js/graph-traversal-core.js');
const missions = [];
global.window = { GraphTraversalCore: G, LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/graph-traversal.js');
const byId = id => missions.find(m => m.id === 'graph-traversal-' + id);
const hidden = missions.filter(m => m.hidden);
// 程式裡的格子編號從 0 開始（cell(n, 列, 行)）；說明文字的座標寫成頁面上的 (列, 行)，從 1 數起。
const cell = (n, r, c) => r * n + c;

// ---------- 與頁面相同的狀態與事件 ----------
class Sim {
  constructor() {
    this.mode = 'maze'; this.early = true;
    this.mz = { n: 12, gen: 'dfs', seed: 1, loops: 0, order: 'NESW', s: 0, t: 143, edits: 0, m: null };
    this.gr = { preset: 'sample', V: 8, seed: 1, rev: false, s: 0, edits: 0, g: null };
    this.drawOn = false;
    this.ev = [];
    this.regen(); this.loadGraph();
    this.rebuild();
  }
  // ---- 迷宮 ----
  regen() { const z = this.mz; z.m = G.generate(z.n, z.gen, z.seed, z.loops); z.edits = 0; return this; }
  size(n) { n = Math.max(4, Math.min(40, Math.round(n))); const z = this.mz; if (n === z.n) return this; z.n = n; z.s = 0; z.t = n * n - 1; return this.regen().rebuild(); }
  gen(g) { if (g === this.mz.gen) return this; this.mz.gen = g; return this.regen().rebuild(); }
  loops(p) { p = Math.max(0, Math.min(40, Math.round(p))); if (p === this.mz.loops) return this; this.mz.loops = p; return this.regen().rebuild(); }
  newMaze() { this.mz.seed++; return this.regen().rebuild(); }
  /** 切換第 i 格往方向 d 的牆（外框不能打通） */
  wall(i, d) { const z = this.mz; const j = G.nb(z.m, i, d); if (j < 0) return this; G.setOpen(z.m, i, d, !G.isOpen(z.m, i, d)); z.edits++; return this.rebuild(); }
  /** 設定成指定狀態（拖曳畫牆：整條沿用第一面的新狀態） */
  setWall(i, d, open) { const z = this.mz; if (G.nb(z.m, i, d) < 0 || G.isOpen(z.m, i, d) === open) return this; G.setOpen(z.m, i, d, open); z.edits++; return this.rebuild(); }
  walls(list) { list.forEach(w => this.setWall(w[0], w[1], false)); return this; }
  st(s, t) { const z = this.mz; if (s === t) return this; z.s = s; z.t = t; return this.rebuild(); }
  S(s) { return this.st(s, this.mz.t); }
  T(t) { return this.st(this.mz.s, t); }
  swap() { return this.st(this.mz.t, this.mz.s); }
  order(o) { this.mz.order = o; return this.rebuild(); }
  setEarly(on) { this.early = on; return this.rebuild(); }
  // ---- 一般圖 ----
  loadGraph() { const q = this.gr; q.g = q.preset === 'sample' ? G.sampleGraph() : G.randomGraph(q.V, q.seed); q.edits = 0; if (q.s >= q.g.V) q.s = 0; return this; }
  preset(p) { if (p === this.gr.preset) return this; this.gr.preset = p; return this.loadGraph().rebuild(); }
  gV(v) { v = Math.max(5, Math.min(10, Math.round(v))); const q = this.gr; if (v === q.V) return this; q.V = v; if (q.preset === 'random') { this.loadGraph(); this.rebuild(); } return this; }
  newGraph() { const q = this.gr; q.preset = 'random'; q.seed++; return this.loadGraph().rebuild(); }
  edge(a, b) { const q = this.gr; if (a === b) return this; G.setEdge(q.g, a, b, !G.hasEdge(q.g, a, b)); q.edits++; return this.rebuild(); }
  cut(list) { list.forEach(e => { if (G.hasEdge(this.gr.g, e[0], e[1])) this.edge(e[0], e[1]); }); return this; }
  join(list) { list.forEach(e => { if (!G.hasEdge(this.gr.g, e[0], e[1])) this.edge(e[0], e[1]); }); return this; }
  gS(s) { this.gr.s = s; return this.rebuild(); }
  rev(on) { this.gr.rev = on; return this.rebuild(); }
  setMode(m) { if (m === this.mode) return this; this.mode = m; return this.rebuild(); }
  // ---- 走訪與播放（和頁面 rebuild／advance／back／resetRun 相同）----
  rebuild() {
    if (this.mode === 'maze') {
      const z = this.mz, adj = G.mazeAdj(z.m, z.order);
      this.trD = G.dfsTrace(adj, z.s, z.t, this.early); this.trB = G.bfsTrace(adj, z.s, z.t, this.early);
    } else {
      const q = this.gr, adj = G.graphAdj(q.g, q.rev);
      this.trD = G.dfsTrace(adj, q.s, -1, false); this.trB = G.bfsTrace(adj, q.s, -1, false);
    }
    this.L = Math.max(this.trD.steps.length, this.trB.steps.length);
    this.k = 0; this.manual = true; this.done = false;
    return this;
  }
  visitedAt(tr, k) { let v = 1; for (let i = 0; i < k; i++) { const sp = tr.steps[i]; v += sp.op === 'push' ? 1 : sp.op === 'deq' ? sp.add.length : 0; } return v; }
  advance(n, how) {
    if (this.k >= this.L) { if (!this.done) this.finish(); return this; }
    if (how !== 'step') this.manual = false;
    const k0 = this.k, k1 = Math.min(this.L, k0 + Math.max(1, n));
    this.k = k1;
    if (this.mode === 'maze') [this.trD, this.trB].forEach(tr => {
      if (tr.found > 0 && k0 < tr.found && tr.found <= k1)
        this.ev.push({ type: 'found', data: { mode: 'maze', algo: tr.algo, manual: this.manual, k: tr.found, path: tr.stats.path, visited: this.visitedAt(tr, tr.found) } });
    });
    if (k1 >= this.L) this.finish();
    return this;
  }
  finish() {
    if (this.done) return;
    this.done = true;
    if (this.mode === 'maze') {
      const z = this.mz;
      this.last = G.mazeReport(z.m, { gen: z.gen, seed: z.seed, loops: z.loops, edits: z.edits, s: z.s, t: z.t, early: this.early, order: z.order }, this.trD, this.trB);
    } else {
      const q = this.gr;
      this.last = G.graphReport(q.g, { preset: q.preset, s: q.s, rev: q.rev, edits: q.edits }, this.trD, this.trB);
    }
    this.ev.push({ type: 'finish', data: Object.assign({ manual: this.manual }, this.last) });
  }
  step(n) { for (let i = 0; i < (n || 1); i++) this.advance(1, 'step'); return this; }
  /** 播放：停在最後一步時按「播放」會從頭再放一次 */
  play(n) { if (this.k >= this.L) this.reset(); return this.advance(n === undefined ? this.L : n, 'play'); }
  end() { return this.advance(this.L, 'end'); }
  back() { if (this.k > 0) { this.k--; this.done = false; } return this; }
  reset() { this.k = 0; this.manual = true; this.done = false; return this; }
}
const run = (m, events) => { m.mem = {}; return events.some(e => { try { return !!m.check(e, m.mem); } catch (err) { return false; } }); };

let fail = 0;
function expect(id, events, want, note) {
  const ok = run(byId(id), events);
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? ' 達成：' : ' 不觸發：') + note);
  return events;
}
const all = (events) => missions.filter(m => run(m, events)).map(m => m.id.replace('graph-traversal-', ''));

// ---------- 常用的迷宮做法 ----------
/** 圍住第 i 格：把它四面打通的牆都砌起來 */
const enclose = (s, i) => { for (let d = 0; d < 4; d++) if (G.isOpen(s.mz.m, i, d)) s.setWall(i, d, false); return s; };
/** 梳子：n × n 空地，第 1 列是往右的主幹，第 0、2 列是一格長的齒；第 2、3 列之間砌牆，把下面隔開 */
function comb(s) {
  const n = s.mz.n;
  for (let c = 0; c < n; c++) {
    s.setWall(cell(n, 2, c), 2, false);
    if (c < n - 1) { s.setWall(cell(n, 0, c), 1, false); s.setWall(cell(n, 2, c), 1, false); }
  }
  return s;
}
/** 生成樹：n × n 空地，留下每一列的橫向通道與第 0 行的直向通道，其他直向通道都砌牆（梳子形的樹） */
function handTree(s) {
  const n = s.mz.n;
  for (let r = 0; r < n - 1; r++) for (let c = 1; c < n; c++) s.setWall(cell(n, r, c), 2, false);
  return s;
}
const center = n => (n * n - 1) / 2;

// ---------- 1. 預設狀態不觸發 ----------
console.log('預設狀態：');
{
  const s = new Sim();
  const ok = s.ev.length === 0;
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + '載入、預設值都不送出任何事件');
  const got = all(new Sim().end().ev);
  const ok2 = got.join(',') === '1';
  if (!ok2) fail++;
  console.log((ok2 ? '  ✓ ' : '  ✗ ') + '預設狀態按「直接跑完」只完成：' + got.join('、'));
  // 兩種模式、三種產生方式、8 種鄰居順序、找到終點就停開關的預設狀態都跑一次：沒有隱藏任務
  const s3 = new Sim();
  ['dfs', 'prim', 'open'].forEach(g => { s3.gen(g); G.ORDER_KEYS.forEach(o => { s3.order(o).end(); s3.setEarly(false).end().setEarly(true); }); });
  s3.setMode('graph').end().rev(true).end().preset('random').end().rev(false).end();
  const h = all(s3.ev).filter(x => /^h/.test(x));
  if (h.length) fail++;
  console.log((h.length ? '  ✗ ' : '  ✓ ') + '三種產生方式 × 8 種鄰居順序 × 找到終點就停開關、兩種一般圖 × 兩種順序都跑一次：隱藏任務 ' + (h.length ? h.join('、') : '一個都沒有完成'));
}

// ---------- 2. 公開任務 ----------
console.log('\n公開任務：');
{
  const s = new Sim().end();
  expect('1', s.ev, true, '預設 12 × 12 迷宮按「直接跑完」：DFS 拜訪 ' + s.last.dfs.visited + ' 格、BFS ' + s.last.bfs.visited + ' 格，路長都是 ' + s.last.bfs.path);
  expect('1', enclose(new Sim(), 143).end().ev, false, '終點被圍住（找不到）');
}
{
  const s = new Sim(); let n = 0;
  while (!s.ev.some(e => e.type === 'found' && e.data.algo === 'dfs')) { s.step(); n++; }
  expect('2', s.ev, true, '預設迷宮只按「單步」' + n + ' 次，DFS 走到終點');
  expect('2', new Sim().step(10).play(5).step(200).ev, false, '中間按過「播放」');
  expect('2', new Sim().size(4).step(40).ev, false, '4 × 4 迷宮：DFS 第 ' + new Sim().size(4).trD.found + ' 步就找到（不到 20 步）');
  expect('2', new Sim().step(30).back().back().step(40).ev, true, '（按「上一步」退回再前進也算只按單步）');
}
expect('3', new Sim().setMode('graph').end().ev, true, '「一般圖」範例圖跑完：DFS ' + new Sim().setMode('graph').end().last.orderD + '、BFS ' + new Sim().setMode('graph').end().last.orderB);
{
  const s = enclose(new Sim(), 143).end();
  expect('4', s.ev, true, '畫 ' + s.mz.edits + ' 面牆圍住終點：DFS、BFS 都只拜訪 ' + s.last.reach + ' 格就停');
  expect('4', new Sim().loops(20).end().ev, false, '打通牆不會讓終點走不到');
}
{
  const s = new Sim().setMode('graph').cut([[0, 3], [4, 6], [5, 7]]).end();
  expect('5', s.ev, true, '範例圖拿掉 A–D、E–G、F–H：D、G、H 走不到（' + s.last.reach + ' ／ 8）');
  expect('5', new Sim().setMode('graph').cut([[2, 5], [4, 5]]).end().ev, false, '只拿掉 C–F、E–F：F 還能經 H 走到');
}
{
  const s = new Sim().size(16).gen('open').end();
  expect('6', s.ev, true, '16 × 16 空地，左上 → 右下，上右下左：DFS 不退回，路長 ' + s.last.dfs.path);
  expect('6', new Sim().size(15).gen('open').end().ev, false, '15 × 15 空地：路長 ' + new Sim().size(15).gen('open').end().last.dfs.path);
  expect('6', new Sim().end().ev, false, '預設迷宮：DFS 退回 ' + new Sim().end().last.dfs.popsBefore + ' 次');
}
{
  const a = new Sim().end().last.dfs.visited, b = new Sim().order('NWSE').end().last.dfs.visited;
  expect('7', new Sim().end().order('NWSE').end().ev, true, '預設迷宮：上右下左 DFS 拜訪 ' + a + ' 格，換成上左下右 ' + b + ' 格');
  expect('7', new Sim().end().order('ESWN').end().ev, false, '換成右下左上：' + new Sim().order('ESWN').end().last.dfs.visited + ' 格（不到 2 倍）');
  expect('7', new Sim().end().newMaze().order('NWSE').end().ev, false, '換了迷宮');
  expect('7', new Sim().end().T(142).order('NWSE').end().ev, false, '換了終點');
  expect('7', new Sim().setEarly(false).end().order('NWSE').end().ev, false, '關掉「找到終點就停」');
}
{
  const s = new Sim().gen('open').order('SWNE').end();
  expect('8', s.ev, true, '12 × 12 空地，下左上右：DFS 路長 ' + s.last.dfs.path + '、BFS ' + s.last.bfs.path);
  expect('8', new Sim().gen('open').end().ev, false, '12 × 12 空地，上右下左：DFS 也是 ' + new Sim().gen('open').end().last.dfs.path);
}
{
  const s = new Sim().size(40).gen('open').st(cell(40, 20, 20), 0).end();
  expect('9', s.ev, true, '40 × 40 空地，起點在中央：BFS 佇列最長 ' + s.last.bfs.maxQueue + ' 格');
  expect('9', new Sim().size(30).gen('open').end().ev, false, '30 × 30 空地從角落出發：最長 ' + new Sim().size(30).gen('open').end().last.bfs.maxQueue);
}
{
  const s = new Sim().size(32).gen('open').setEarly(false).end();
  expect('10', s.ev, true, '32 × 32 空地、關掉「找到終點就停」：DFS 堆疊最高 ' + s.last.dfs.maxStack + ' 格（一路蛇行不退回）');
  expect('10', new Sim().size(31).gen('open').setEarly(false).end().ev, false, '31 × 31：最高 ' + new Sim().size(31).gen('open').setEarly(false).end().last.dfs.maxStack);
}
{
  const s = new Sim().newMaze().T(79).end();
  expect('11', s.ev, true, '第 2 號迷宮，終點 (7, 8)：DFS、BFS 都拜訪 ' + s.last.dfs.visited + ' 格');
  // 另一種做法：在一條沒有岔路的走廊上，兩者都只拜訪走廊上的格子
  const c = new Sim().size(32).gen('open').setEarly(true);
  for (let col = 0; col < 31; col++) c.setWall(cell(32, 0, col), 2, false);
  c.T(cell(32, 0, 31)).end();
  expect('11', c.ev, true, '（32 × 32 空地，第一列下方畫 31 面牆成走廊，終點右上角：兩者都拜訪 ' + c.last.dfs.visited + ' 格）');
  expect('11', new Sim().end().ev, false, '預設迷宮：DFS ' + new Sim().end().last.dfs.visited + '、BFS ' + new Sim().end().last.bfs.visited);
}
{
  const s = new Sim().T(68).end();
  expect('12', s.ev, true, '預設迷宮，終點放在離起點最遠的 (6, 9)（距離 ' + s.last.bfs.path + '）：BFS 拜訪 ' + s.last.bfs.visited + ' ／ ' + s.last.reach + ' 格才找到');
  expect('12', new Sim().end().ev, false, '預設終點：BFS 拜訪 ' + new Sim().end().last.bfs.visited + ' 格就找到');
  expect('12', new Sim().size(9).T(new Sim().size(9).trB.order[80]).end().ev, false, '9 × 9 迷宮（邊長不到 10）');
}

// ---------- 3. 隱藏任務 ----------
console.log('\n隱藏任務（解法）：');
const H8 = (() => { // 12 × 12、第 2 號、打通牆 1 %：只有一個 26 格的環；起點、終點在環上，DFS 走遠的那半圈
  const m = G.generate(12, 'dfs', 2, 1), cyc = G.cycleCells(G.mazeAdj(m, 'NESW'));
  return { m, cyc };
})();
const sol = {
  h1: ['「一般圖」範例圖，點鄰接矩陣補上 17 條邊成完全圖（8 點 28 邊）：DFS 樹深度 7、BFS 樹深度 1', () => {
    const s = new Sim().setMode('graph'); const l = []; for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) l.push([i, j]); return s.join(l).end().ev; }],
  h2: ['9 × 9 空地，起點放在正中央 (5, 5)，關掉「找到終點就停」：BFS 最遠一層是四個角（距離 8）', () => new Sim().size(9).gen('open').setEarly(false).st(center(9), 0).end().ev],
  h3: ['12 × 12 第 1 號迷宮打通牆 1 %（只有一個環，在路的中間）：BFS 路長 32，DFS 34', () => new Sim().loops(1).end().ev],
  h4: ['5 × 5 空地，畫 6 面牆：(1, 5) 下方、(2, 1)–(2, 4) 的下方、(4, 2) 右方；DFS 先往右走到 (1, 5) 碰壁退回，仍然走到右下角', () =>
    new Sim().size(5).gen('open').walls([[cell(5, 0, 4), 2], [cell(5, 1, 0), 2], [cell(5, 1, 1), 2], [cell(5, 1, 2), 2], [cell(5, 1, 3), 2], [cell(5, 3, 1), 1]]).end().ev],
  h5: ['「一般圖」範例圖拿掉 A–E、B–E、C–F、D–G：{A,B,C,D}、{E,F,G,H} 兩塊（鄰接矩陣對角線上兩個 4 × 4 方塊）', () =>
    new Sim().setMode('graph').cut([[0, 4], [1, 4], [2, 5], [3, 6]]).end().ev],
  h6: ['6 × 6 空地畫 25 面牆：每一列只留橫向通道，直向只留最左一行（梳子形的生成樹）', () => handTree(new Sim().size(6).gen('open')).end().ev],
  h7: ['「一般圖」範例圖拿掉 B–E、E–F、E–G、G–H 成一棵樹：DFS ABCFHDGE、BFS ABDECGFH，兩棵樹相同', () =>
    new Sim().setMode('graph').cut([[1, 4], [4, 5], [4, 6], [6, 7]]).end().ev],
  h8: ['12 × 12 第 2 號迷宮打通牆 1 %（26 格的環），起點 (5, 7)、終點 (9, 9) 都在環上：BFS 走近的半圈 6 步，DFS 走遠的半圈 20 步', () => {
    const s = new Sim().newMaze().loops(1); return s.st(54, 104).end().ev; }],
  h9: ['預設迷宮（樹）的中心是 (4, 5) 與 (4, 6)：起點放在 (4, 5)，關掉「找到終點就停」走完', () => new Sim().setEarly(false).S(40).end().ev],
  h10: ['8 × 8 空地畫 22 面牆成梳子（第 2 列是主幹），起點 (2, 1)、鄰居順序上左下右、完整走訪：24 格的順序完全相同', () =>
    comb(new Sim().size(8).gen('open')).order('NWSE').setEarly(false).S(cell(8, 1, 0)).end().ev]
};
Object.keys(sol).forEach(h => expect(h, sol[h][1](), true, sol[h][0]));

console.log('\n隱藏任務（不觸發的情況）：');
{
  const s = new Sim().setMode('graph'); const l = []; for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) l.push([i, j]);
  expect('h1', s.join(l).edge(6, 7).end().ev, false, '差一條邊（G–H）就是完全圖');
  const r = new Sim().setMode('graph').preset('random').gV(6); const l6 = []; for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) l6.push([i, j]);
  expect('h1', r.join(l6).end().ev, false, '6 個點的完全圖（太小）');
}
expect('h2', new Sim().size(9).gen('open').setEarly(false).st(center(9) + 1, 0).end().ev, false, '起點偏離中央一格');
expect('h2', new Sim().size(10).gen('open').setEarly(false).st(cell(10, 5, 5), 0).end().ev, false, '偶數邊長（沒有正中央那一格）');
expect('h2', new Sim().size(9).gen('open').st(center(9), 0).end().ev, false, '開著「找到終點就停」（沒有傳到四個角）');
expect('h2', new Sim().size(9).gen('open').setEarly(false).st(center(9), 0).wall(0, 1).end().ev, false, '空地上多了一面牆');
expect('h3', new Sim().loops(2).end().ev, false, '打通牆 2 %：' + new Sim().loops(2).end().last.cycles + ' 個迴路');
expect('h3', new Sim().size(4).loops(1).end().ev, false, '4 × 4（太小）');
expect('h3', new Sim().newMaze().loops(1).st(54, 104).end().ev, false, 'h8 的做法：起點、終點都在環上');
expect('h4', new Sim().size(5).gen('open').walls([[cell(5, 0, 4), 2]]).end().ev, false, '只畫一面牆（DFS 也會退回）');
expect('h4', new Sim().size(6).gen('open').walls([[cell(6, 0, 5), 2], [cell(6, 1, 0), 2], [cell(6, 1, 1), 2], [cell(6, 1, 2), 2], [cell(6, 1, 3), 2], [cell(6, 3, 1), 1]]).end().ev, false, '6 × 6（不是 25 個房間）');
expect('h4', new Sim().size(5).gen('open').walls([[cell(5, 1, 0), 2], [cell(5, 1, 1), 2], [cell(5, 1, 2), 2], [cell(5, 1, 3), 2], [cell(5, 3, 1), 1], [cell(5, 3, 2), 1]]).end().ev, false, '6 面牆但 DFS 一路沒有退回');
expect('h4', new Sim().size(5).end().ev, false, '5 × 5 隨機 DFS 迷宮（不是自己蓋的）');
expect('h5', new Sim().setMode('graph').cut([[0, 4], [1, 4], [2, 5], [3, 6], [4, 6], [6, 7]]).end().ev, false, '再拿掉 E–G、G–H：G 自成一塊，變成三塊');
expect('h5', new Sim().setMode('graph').cut([[0, 3], [0, 4], [1, 4], [4, 5], [6, 7]]).end().ev, false, '分成 {A,B,C,F,H}、{D,E,G} 兩塊，但字母不連續（矩陣不是對角線上的方塊）');
expect('h6', new Sim().size(6).end().ev, false, '6 × 6 隨機 DFS 迷宮（本來就是樹，不是自己砌的）');
expect('h6', handTree(new Sim().size(6).gen('open')).wall(cell(6, 0, 3), 2).end().ev, false, '多砌一面牆：有一塊走不到');
expect('h6', handTree(new Sim().size(5).gen('open')).end().ev, false, '5 × 5（太小）');
expect('h7', new Sim().setMode('graph').cut([[1, 4], [4, 5], [4, 6]]).end().ev, false, '少拿掉一條（還有迴路，兩棵樹不同）');
{
  const s = new Sim().setMode('graph').preset('random').gV(8);
  const sl = []; for (let i = 1; i < 8; i++) for (let j = 0; j < 8; j++) if (i !== j && G.hasEdge(s.gr.g, i, j)) sl.push([Math.min(i, j), Math.max(i, j)]);
  s.cut(sl); s.join([[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7]]);
  expect('h7', s.end().ev, false, '星形（從中心出發 DFS 與 BFS 的順序也相同）');
}
expect('h8', new Sim().newMaze().loops(1).st(104, 54).end().ev, false, '起點終點對調：DFS 剛好走近的那半圈（路長 ' + new Sim().newMaze().loops(1).st(104, 54).end().last.dfs.path + '）');
expect('h8', new Sim().newMaze().loops(1).st(54, 0).end().ev, false, '終點不在環上');
expect('h8', new Sim().newMaze().loops(2).st(54, 104).end().ev, false, '打通牆 2 %：兩個迴路');
expect('h9', new Sim().setEarly(false).S(41).end().ev, true, '（另一個中心 (4, 6) 也可以）');
expect('h9', new Sim().setEarly(false).S(42).end().ev, false, '起點偏離中心一格');
expect('h9', new Sim().S(40).end().ev, false, '開著「找到終點就停」');
expect('h9', new Sim().loops(1).setEarly(false).S(40).end().ev, false, '有迴路（不是樹）');
expect('h10', comb(new Sim().size(8).gen('open')).order('NESW').setEarly(false).S(cell(8, 1, 0)).end().ev, false, '同一把梳子用上右下左（齒還沒走完就往主幹前進）');
expect('h10', comb(new Sim().size(8).gen('open')).order('NWSE').S(cell(8, 1, 0)).end().ev, false, '開著「找到終點就停」');
{
  const s = new Sim().size(8).gen('open');
  for (let c = 0; c < 8; c++) s.setWall(cell(8, 0, c), 2, false);
  expect('h10', s.setEarly(false).end().ev, false, '一條沒有岔路的長廊（兩者順序相同但沒有岔路口）');
}

// ---------- 交叉檢查 ----------
console.log('\n十個隱藏任務的交叉檢查（列：用哪個解法；欄：同時完成了哪些隱藏任務）：');
{
  const hs = hidden.map(m => m.id.replace('graph-traversal-', ''));
  console.log('        ' + hs.map(h => h.padStart(4)).join(''));
  Object.keys(sol).forEach(h => {
    const ev = sol[h][1]();
    const row = hidden.map(m => run(m, ev));
    const extra = row.filter((x, i) => x && hs[i] !== h).length;
    if (extra) fail++;
    console.log('  ' + h.padEnd(5) + ' ' + row.map(x => (x ? '●' : '·').padStart(4)).join('') + (extra ? '   ✗ 連帶完成' : ''));
  });
  const pubSol = {
    '1': () => new Sim().end().ev, '2': () => new Sim().step(70).ev, '3': () => new Sim().setMode('graph').end().ev,
    '4': () => enclose(new Sim(), 143).end().ev, '5': () => new Sim().setMode('graph').cut([[0, 3], [4, 6], [5, 7]]).end().ev,
    '6': () => new Sim().size(16).gen('open').end().ev, '7': () => new Sim().end().order('NWSE').end().ev,
    '8': () => new Sim().gen('open').order('SWNE').end().ev, '9': () => new Sim().size(40).gen('open').st(cell(40, 20, 20), 0).end().ev,
    '10': () => new Sim().size(32).gen('open').setEarly(false).end().ev, '11': () => new Sim().newMaze().T(79).end().ev,
    '12': () => new Sim().T(68).end().ev
  };
  const bad = [];
  Object.keys(pubSol).forEach(p => { const ev = pubSol[p](); hidden.forEach(m => { if (run(m, ev)) bad.push(p + '→' + m.id.replace('graph-traversal-', '')); }); });
  if (bad.length) fail++;
  console.log((bad.length ? '  ✗ ' : '  ✓ ') + '公開任務的解法' + (bad.length ? '順便完成了隱藏任務：' + bad.join('、') : '都不會順便完成隱藏任務'));
}

// ---------- 4. 亂按模擬 ----------
const PEOPLE = 400, ACTIONS = 300;
console.log('\n亂按模擬（固定種子）：' + PEOPLE + ' 人 × 每人 ' + ACTIONS + ' 次，每次從畫面上看得到的控制項中隨機挑一個：');
console.log('  「迷宮」「一般圖」、上一步、單步、播放（一半放到底、一半隨機幾步）、直接跑完、重來、全部清除、找到終點就停、鄰居順序；');
console.log('  迷宮：拖曳起點、終點到隨機的格子、起點終點對調、邊長滑桿、產生方式、打通牆滑桿、換一個迷宮、畫牆開關、');
console.log('  （畫牆打開時）點一面隨機的牆或沿直線拖曳 2–6 面；一般圖：圖（範例圖／隨機圖）、點數 V、換一張、起點、點節點、點鄰接矩陣的格子。');
console.log('  滑桿 20% 拉到最小、20% 最大、60% 隨機。');
{
  const rand = G.rng(20261113);
  const ri = (n) => Math.floor(rand() * n);
  const slider = (lo, hi) => { const u = rand(); return u < 0.2 ? lo : u < 0.4 ? hi : lo + ri(hi - lo + 1); };
  const hits = {}; missions.forEach(m => { hits[m.id] = 0; });
  const t0 = Date.now();
  for (let p = 0; p < PEOPLE; p++) {
    const s = new Sim();
    for (let a = 0; a < ACTIONS; a++) {
      const acts = [
        () => s.setMode('maze'), () => s.setMode('graph'),
        () => s.back(), () => s.step(), () => (rand() < 0.5 ? s.play() : s.play(1 + ri(60))), () => s.end(), () => s.reset(), () => s.reset(),
        () => s.setEarly(!s.early)
      ];
      if (s.mode === 'maze') {
        const n = s.mz.n, N = n * n;
        acts.push(
          () => s.order(G.ORDER_KEYS[ri(8)]), () => s.S(ri(N)), () => s.T(ri(N)), () => s.swap(),
          () => s.size(slider(4, 40)), () => s.gen(['dfs', 'prim', 'open'][ri(3)]), () => s.loops(slider(0, 40)), () => s.newMaze(),
          () => { s.drawOn = !s.drawOn; }
        );
        if (s.drawOn) acts.push(
          () => s.wall(ri(N), ri(4)), () => s.wall(ri(N), ri(4)),
          () => { // 沿直線拖曳：整條沿用第一面的新狀態
            let i = ri(N); const d = ri(4), along = [1, 2][ri(2)], len = 2 + ri(5);
            const open = !G.isOpen(s.mz.m, i, d);
            for (let k = 0; k < len && i >= 0; k++) { s.setWall(i, d, open); i = G.nb(s.mz.m, i, along); }
          });
      } else {
        const V = s.gr.g.V;
        acts.push(
          () => s.rev(!s.gr.rev), () => s.preset(['sample', 'random'][ri(2)]), () => s.gV(slider(5, 10)), () => s.newGraph(),
          () => s.gS(ri(V)), () => s.gS(ri(V)), () => s.edge(ri(V), ri(V)), () => s.edge(ri(V), ri(V)), () => s.edge(ri(V), ri(V))
        );
      }
      acts[ri(acts.length)]();
    }
    missions.forEach(m => { if (run(m, s.ev)) hits[m.id]++; });
  }
  let worst = 0, worstId = '';
  console.log('  公開任務：' + missions.filter(m => !m.hidden).map(m => m.id.replace('graph-traversal-', '') + ' ' + (hits[m.id] / PEOPLE * 100).toFixed(1) + '%').join('、'));
  hidden.forEach(m => {
    const q = hits[m.id] / PEOPLE;
    if (q > worst) { worst = q; worstId = m.id; }
    console.log('  ' + m.id.padEnd(20) + '等級 ' + String(m.level).padStart(2) + '　' + (q * 100).toFixed(2) + '%（' + hits[m.id] + ' ／ ' + PEOPLE + ' 人）');
  });
  if (worst >= 0.02) { fail++; console.log('  ✗ ' + worstId + ' 被亂按完成的比例 ≥ 2%'); }
  else console.log('  ✓ 每個隱藏任務被亂按完成的比例都 < 2%（最高 ' + (worst * 100).toFixed(2) + '%）');
  console.log('  （模擬花了 ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒）');
}

console.log(fail ? `\n✗ ${fail} 項不符合` : '\n全部任務都證明做得到；預設狀態不觸發；隱藏任務互不連帶；亂按誤觸都 < 2%。');
process.exitCode = fail ? 1 : 0;
