/* 任務可達成的證明腳本。用法：node tools/mission-proofs/shortest-path.js
 * 用計算核心模擬頁面（js/shortest-path.js）的狀態與事件：'settle' 與頁面 emitSettle 相同，'finish' 用核心的 report()（頁面也用它）。證明：
 *   1. 每個任務在滑桿範圍與精度內做得到（印出解法）；2. 預設狀態不觸發；
 *   3. 十個隱藏任務的解法不會順便完成另一個隱藏任務（交叉檢查表）；
 *   4. 固定種子的亂按模擬（400 人 × 每人 300 次，像學生隨便點每一個控制項），印出每個任務被碰巧完成的比例，隱藏任務都要 < 2%。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const S = require(ROOT + 'js/shortest-path-core.js');
const missions = [];
global.window = { ShortestPathCore: S, LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/shortest-path.js');
const byId = id => missions.find(m => m.id === 'shortest-path-' + id);
const hidden = missions.filter(m => m.hidden);
const CITY = {}; S.CITIES.forEach((c, i) => { CITY[c.zh] = i; });
const TW = S.taiwanGraph();
/** 臺灣地圖上連接兩城市的邊的編號 */
const twEdge = (a, b) => TW.edges.findIndex(e => (e.a === CITY[a] && e.b === CITY[b]) || (e.a === CITY[b] && e.b === CITY[a]));
const NEG = S.negGraph();
const negEdge = (a, b) => NEG.edges.findIndex(e => e.a === S.NEG_NAMES.indexOf(a) && e.b === S.NEG_NAMES.indexOf(b));

// ---------- 與頁面相同的狀態與事件 ----------
class Sim {
  constructor() {
    this.store = {}; this.mode = 'taiwan'; this.g = S.taiwanGraph(); this.s = 1; this.t = 12;
    this.algo = 'dijkstra'; this.early = false; this.pick = 't'; this.sel = 0;
    this.rand = { n: 10, seed: 1 }; this.grid = { rows: 4, cols: 6, seed: 1 };
    this.ev = [];
    this.rebuild();
  }
  rebuild() { this.tr = S.run(this.g, this.algo, this.s, this.t, { earlyStop: this.early }); this.k = 0; this.manual = true; this.done = false; return this; }
  makeGraph(m) {
    if (m === 'taiwan') return { g: S.taiwanGraph(), s: 1, t: 12 };
    if (m === 'random') { const g = S.randomGraph(this.rand.n, this.rand.seed); return { g, s: 0, t: g.nodes.length - 1 }; }
    if (m === 'grid') { const g = S.gridGraph(this.grid.rows, this.grid.cols, this.grid.seed); return { g, s: 0, t: g.nodes.length - 1 }; }
    return { g: S.negGraph(), s: 0, t: 5 };
  }
  setMode(m) {
    if (m === this.mode) return this;
    this.store[this.mode] = { g: this.g, s: this.s, t: this.t };
    this.mode = m;
    const got = this.store[m] || this.makeGraph(m);
    this.g = got.g; this.s = got.s; this.t = got.t; this.sel = 0;
    return this.rebuild();
  }
  st(s, t) { this.s = s; this.t = t; return this.rebuild(); }
  swap() { return this.st(this.t, this.s); }
  setEarly(on) { this.early = on; return this.rebuild(); }
  setAlgo(a) { this.algo = a; return this.rebuild(); }
  range() { const m = this.mode; return [m === 'neg' ? -9 : 0, m === 'taiwan' ? 500 : m === 'neg' ? 9 : 20]; }
  weight(e, w) {
    this.sel = e;
    const r = this.range(); w = Math.max(r[0], Math.min(r[1], Math.round(w)));
    if (this.g.edges[e].w === w) return this;
    this.g.edges[e].w = w;
    return this.rebuild();
  }
  close(e, on) { this.sel = e; if (this.g.edges[e].closed === on) return this; this.g.edges[e].closed = on; return this.rebuild(); }
  restore() { this.g.edges.forEach(e => { e.w = e.w0; e.closed = false; }); return this.rebuild(); }
  ones() { this.g.edges.forEach(e => { e.w = 1; }); return this.rebuild(); }
  newRandom() { this.g = S.randomGraph(this.rand.n, this.rand.seed); this.s = 0; this.t = this.g.nodes.length - 1; this.sel = 0; return this.rebuild(); }
  rn(n) { if (n === this.rand.n) return this; this.rand.n = n; return this.mode === 'random' ? this.newRandom() : this; }
  nextRand() { this.rand.seed++; return this.newRandom(); }
  newGrid() { this.g = S.gridGraph(this.grid.rows, this.grid.cols, this.grid.seed); this.s = 0; this.t = this.g.nodes.length - 1; this.sel = 0; return this.rebuild(); }
  gr(v) { if (v === this.grid.rows) return this; this.grid.rows = v; return this.mode === 'grid' ? this.newGrid() : this; }
  gc(v) { if (v === this.grid.cols) return this; this.grid.cols = v; return this.mode === 'grid' ? this.newGrid() : this; }
  nextGrid() { this.grid.seed++; return this.newGrid(); }
  size(r, c) { return this.gr(r).gc(c); }
  // 播放控制（和頁面 advance／nextNode／back／resetRun 相同）
  advance(n, how) {
    const tr = this.tr, N = tr.steps.length;
    if (this.k >= N) { if (!this.done) this.finish(); return this; }
    if (how !== 'step') this.manual = false;
    const k0 = this.k, k1 = Math.min(N, k0 + Math.max(1, n));
    this.k = k1;
    let st = null;
    for (let i = k0; i < k1; i++) {
      const sp = tr.steps[i];
      if (sp.type !== 'pop') continue;
      st = st || S.stateAt(tr, k1);
      const nd = this.g.nodes[sp.u], wi = S.weightInfo(this.g);
      this.ev.push({ type: 'settle', data: { mode: this.mode, algo: this.algo, s: this.s, t: this.t, node: sp.u, key: nd.key || '', ord: sp.ord,
        d: st.d[sp.u], manual: this.manual, early: this.early, unedited: wi.unedited, V: this.g.nodes.length, k: this.k } });
    }
    if (k1 >= N) this.finish();
    return this;
  }
  finish() {
    if (this.done) return;
    this.done = true;
    this.last = S.report(this.g, this.mode, this.tr);
    this.ev.push({ type: 'finish', data: Object.assign({ manual: this.manual }, this.last.data) });
  }
  step(n) { for (let i = 0; i < (n || 1); i++) this.advance(1, 'step'); return this; }
  next() {
    const tr = this.tr, N = tr.steps.length;
    let i = this.k;
    if (i >= N) return this.advance(1, 'next');
    if (this.algo === 'bf') { while (i < N && !tr.steps[i].last) i++; i = Math.min(N, i + 1); }
    else { while (i < N && tr.steps[i].type !== 'pop') i++; if (i < N) i++; while (i < N && tr.steps[i].type !== 'pop') i++; }
    return this.advance(i - this.k, 'next');
  }
  play(n) { return this.advance(n, 'play'); }
  end() { return this.advance(this.tr.steps.length, 'end'); }
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
const all = (events) => missions.filter(m => run(m, events)).map(m => m.id.replace('shortest-path-', ''));

// ---------- 1. 預設狀態不觸發 ----------
console.log('預設狀態：');
{
  const s = new Sim();
  const ok = s.ev.length === 0;
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + '載入、預設值都不送出任何事件');
  // 只按「直接跑完」一次（臺北 → 高雄，原權重）：只完成第一個任務
  const got = all(new Sim().end().ev);
  const ok2 = got.join(',') === '1';
  if (!ok2) fail++;
  console.log((ok2 ? '  ✓ ' : '  ✗ ') + '預設狀態按「直接跑完」只完成：' + got.join('、'));
  // 四種模式、三種演算法的預設狀態各跑一次：沒有隱藏任務
  const s3 = new Sim();
  ['taiwan', 'random', 'grid', 'neg'].forEach(m => { s3.setMode(m); ['dijkstra', 'bfs', 'bf'].forEach(a => { s3.setAlgo(a).end(); s3.setEarly(true).end().setEarly(false); }); });
  const h = all(s3.ev).filter(x => /^h/.test(x));
  if (h.length) fail++;
  console.log((h.length ? '  ✗ ' : '  ✓ ') + '四種圖 × 三種演算法 × 找到終點就停的預設狀態都跑一次：隱藏任務 ' + (h.length ? h.join('、') : '一個都沒有完成'));
}

// ---------- 2. 公開任務 ----------
console.log('\n公開任務：');
const K = CITY;
expect('1', new Sim().end().ev, true, '預設（臺北 → 高雄）按「直接跑完」：' + new Sim().end().last.data.dist + ' km');
expect('1', new Sim().st(1, 1).end().ev, false, '起點 = 終點');
expect('1', new Sim().setAlgo('bfs').end().ev, false, 'BFS 跑完不算');
{
  const s = new Sim(); let n = 0;
  while (!s.done) { s.step(); n++; }
  expect('2', s.ev, true, '只按「單步」從臺北跑到高雄被確定（共 ' + n + ' 步）');
  expect('2', new Sim().step(3).play(5).step(200).ev, false, '中間按過「播放」');
  expect('2', new Sim().st(1, 2).step(20).ev, false, '臺北 → 桃園：終點第 4 步就確定（不到 8 步）');
  expect('2', new Sim().st(1, 2).step(2).back().back().step(10).ev, false, '「上一步」退回再前進，終點仍是第 4 步確定');
}
{
  const s = new Sim().st(K['基隆'], K['屏東']).end();
  expect('3', s.ev, true, '基隆 → 屏東：' + s.last.data.dist + ' km，' + s.last.res.path.map(i => TW.nodes[i].zh).join('→'));
  expect('3', new Sim().st(K['屏東'], K['基隆']).end().ev, false, '方向相反（屏東 → 基隆）');
  expect('3', new Sim().weight(0, 30).st(K['基隆'], K['屏東']).end().ev, false, '改過權重');
}
{
  const ok = [];
  for (let s = 0; s < 18; s++) { const sim = new Sim().st(s, 12).end(); if (run(byId('4'), sim.ev)) ok.push(TW.nodes[s].zh); }
  expect('4', new Sim().st(K['苗栗'], 12).end().ev, true, '起點苗栗（臺中第 3 個確定）；全部可行的起點：' + ok.join('、'));
  expect('4', new Sim().st(K['臺中'], 12).end().ev, false, '起點臺中（臺中第 1 個）');
}
{
  const s = new Sim().setEarly(true).st(K['臺北'], K['桃園']).end();
  expect('5', s.ev, true, '找到終點就停，臺北 → 桃園：確定 ' + s.last.data.settled + ' ／ 18 個點');
  expect('5', new Sim().setEarly(true).st(K['臺北'], K['恆春']).end().ev, false, '臺北 → 恆春：要確定 ' + new Sim().setEarly(true).st(K['臺北'], K['恆春']).end().last.data.settled + ' 個點（超過一半）');
}
{
  const s = new Sim().st(K['桃園'], K['嘉義']).setAlgo('bfs').end();
  expect('6', s.ev, true, '桃園 → 嘉義 用 BFS：' + s.last.data.hops + ' 段 ' + s.last.data.bfsLen + ' km，Dijkstra ' + s.last.data.dijDist + ' km');
  expect('6', new Sim().st(K['桃園'], K['嘉義']).end().ev, false, '同一組用 Dijkstra 跑（要按 BFS）');
  expect('6', new Sim().st(K['臺北'], K['新竹']).setAlgo('bfs').end().ev, false, '臺北 → 新竹：BFS 與 Dijkstra 同一條路');
}
{
  const e = twEdge('花蓮', '宜蘭');
  const s = new Sim().st(K['基隆'], K['屏東']).weight(e, 120).end();
  expect('7', s.ev, true, '花蓮–宜蘭 改成 120 km：' + s.last.res.path.map(i => TW.nodes[i].zh).join('→') + '（' + s.last.data.dist + ' km）');
  expect('7', new Sim().st(K['基隆'], K['屏東']).close(twEdge('臺東', '花蓮'), true).end().ev, true, '或封閉臺東–花蓮');
  expect('7', new Sim().st(K['基隆'], K['屏東']).end().ev, false, '原權重走東部');
}
{
  const s = new Sim().setMode('grid').size(5, 6).ones().end();
  expect('8', s.ev, true, '方格 5 × 6，「全部設為 1」：最短路 ' + s.last.data.count + ' 條（C(9, 4) = 126）');
  expect('8', new Sim().setMode('grid').ones().end().ev, false, '預設 4 × 6 全設 1：' + new Sim().setMode('grid').ones().end().last.data.count + ' 條');
  let worst = 0;
  for (let r = 3; r <= 6; r++) for (let c = 3; c <= 8; c++) for (let seed = 1; seed <= 30; seed++) {
    const g = S.gridGraph(r, c, seed), tr = S.dijkstra(g, 0, g.nodes.length - 1, {});
    const cnt = S.countPaths(g, 0, tr.final.d)[g.nodes.length - 1];
    worst = Math.max(worst, cnt);
  }
  console.log('       （隨機權重的方格，所有大小 × 前 30 組權重，最短路最多 ' + worst + ' 條）');
}
{
  const s = new Sim().setMode('neg').weight(negEdge('A', 'B'), -5).end();
  expect('9', s.ev, true, '負權重：A → B 改成 −5，Dijkstra 算錯 ' + s.last.data.wrong + ' 個點（' + s.last.res.path.map(i => S.NEG_NAMES[i]).join('→') + '，正確 ' + s.last.data.truthDist + '）');
  expect('9', new Sim().setMode('neg').weight(negEdge('A', 'B'), -5).setAlgo('bf').end().ev, false, '同一張圖用 Bellman–Ford');
  expect('9', new Sim().setMode('neg').end().ev, false, '預設權重（都是正的）');
}
{
  const e = twEdge('屏東', '臺東');
  const s = new Sim().st(K['基隆'], K['屏東']).weight(e, 95).end();
  expect('10', s.ev, true, '屏東–臺東 66 → 95 km：東部與西部都是 ' + s.last.data.dist + ' km，' + s.last.data.count + ' 條');
  const s2 = new Sim().st(K['基隆'], K['屏東']).weight(twEdge('苗栗', '臺中'), 21).end();
  expect('10', s2.ev, true, '或苗栗–臺中 50 → 21 km：' + s2.last.data.dist + ' km，' + s2.last.data.count + ' 條');
  expect('10', new Sim().st(K['基隆'], K['屏東']).weight(e, 95).weight(0, 25).weight(0, 24).end().ev, true, '改過又改回原值也算只改一條');
  expect('10', new Sim().st(K['基隆'], K['屏東']).weight(e, 94).end().ev, false, '屏東–臺東 94 km：只有 1 條');
  let sols = 0;
  for (let e2 = 0; e2 < 25; e2++) for (let w = 0; w <= 500; w++) {
    const g = S.taiwanGraph(); if (w === g.edges[e2].w0) continue; g.edges[e2].w = w;
    const d = S.dijkstra(g, 0, 13, {}).final.d; const c = S.countPaths(g, 0, d);
    if (c && c[13] === 2) sols++;
  }
  console.log('       （只改一條邊、權重 0–500 的整數：共 ' + sols + ' 種做法，隨便改一條碰中的機率 ' + (sols / (25 * 500) * 100).toFixed(2) + '%）');
}
{
  const s = new Sim().setMode('grid').size(3, 3).ones();
  // 蛇形 0→1→2→5→4→3→6→7→8 以外的 4 條邊改成 20
  const snake = [[0, 1], [1, 2], [2, 5], [5, 4], [4, 3], [3, 6], [6, 7], [7, 8]];
  const isSnake = (e) => snake.some(p => (p[0] === e.a && p[1] === e.b) || (p[1] === e.a && p[0] === e.b));
  s.g.edges.forEach((e, i) => { if (!isSnake(e)) s.weight(i, 20); });
  s.end();
  expect('11', s.ev, true, '方格 3 × 3「全部設為 1」，蛇形以外的 4 條邊改成 20：路線 ' + s.last.data.pathKey + '（' + s.last.data.hops + ' 段，經過全部 9 點）');
  expect('11', new Sim().setMode('grid').size(3, 3).ones().end().ev, false, '3 × 3 全設 1（只走 4 段）');
}

// ---------- 3. 隱藏任務 ----------
console.log('\n隱藏任務（解法）：');
const e = twEdge;
const sol = {
  h1: ['基隆–臺北、臺北–桃園都改成 0，基隆 → 桃園：不相鄰、2 段、距離 0', () => new Sim().weight(e('基隆', '臺北'), 0).weight(e('臺北', '桃園'), 0).st(K['基隆'], K['桃園']).end().ev],
  h2: ['臺北–桃園改成 500 km，臺北 → 桃園：直通的路還在，最短路卻繞 7 段（臺北→宜蘭→花蓮→埔里→臺中→苗栗→新竹→桃園 345 km）', () => new Sim().weight(e('臺北', '桃園'), 500).st(K['臺北'], K['桃園']).end().ev],
  h3: ['負權重：S→A、A→B、B→D、D→T 都改成 −1，Dijkstra：S→A→B→D→T（4 段都是負的）而且沒有算錯', () => {
    const s = new Sim().setMode('neg'); [['S', 'A'], ['A', 'B'], ['B', 'D'], ['D', 'T']].forEach(p => s.weight(negEdge(p[0], p[1]), -1)); return s.end().ev; }],
  h4: ['彰化–南投改成 21 km：彰化 → 埔里 走臺中（17 + 34），埔里 → 彰化 走南投（30 + 21），都是 51 km', () => new Sim().weight(e('彰化', '南投'), 21).st(K['彰化'], K['埔里']).end().st(K['埔里'], K['彰化']).end().ev],
  h5: ['方格 4 × 4 與 5 × 5 都「全部設為 1」，左上 → 右下：C(6, 3) = 20 條、C(8, 4) = 70 條（巴斯卡三角形的中央係數）', () => new Sim().setMode('grid').size(4, 4).ones().end().size(5, 5).ones().end().ev],
  h6: ['原權重，桃園 → 恆春、恆春 → 桃園都跑一次：387 km（全島最遠的一對＝圖的直徑）', () => new Sim().st(K['桃園'], K['恆春']).end().st(K['恆春'], K['桃園']).end().ev],
  h7: ['封閉苗栗–臺中與花蓮–宜蘭，臺北 → 高雄：北部 6 城、南部 12 城，到不了', () => new Sim().close(e('苗栗', '臺中'), true).close(e('花蓮', '宜蘭'), true).st(K['臺北'], K['高雄']).end().ev],
  h8: ['起點花蓮，基隆–宜蘭 12、屏東–臺東 232、南投–埔里 237、彰化–南投 3 km：每一次檢查都更新', () =>
    new Sim().weight(e('基隆', '宜蘭'), 12).weight(e('屏東', '臺東'), 232).weight(e('南投', '埔里'), 237).weight(e('彰化', '南投'), 3).st(K['花蓮'], K['基隆']).end().ev],
  h9: ['負權重：S→A、A→B、B→C、C→D、D→T 都改成 −1，Bellman–Ford：5 輪每一輪都有更新（V − 1 輪的最壞情況）', () => {
    const s = new Sim().setMode('neg'); [['S', 'A'], ['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'T']].forEach(p => s.weight(negEdge(p[0], p[1]), -1)); return s.setAlgo('bf').end().ev; }],
  h10: ['起點彰化，臺中–埔里、彰化–斗六、臺南–臺東、臺東–花蓮改成 500 km：最短路徑樹 = 最小生成樹（660 km）', () => {
    const s = new Sim(); [['臺中', '埔里'], ['彰化', '斗六'], ['臺南', '臺東'], ['臺東', '花蓮']].forEach(p => s.weight(e(p[0], p[1]), 500)); return s.st(K['彰化'], K['高雄']).end().ev; }]
};
Object.keys(sol).forEach(h => expect(h, sol[h][1](), true, sol[h][0]));

console.log('\n隱藏任務（不觸發的情況）：');
expect('h1', new Sim().weight(e('基隆', '臺北'), 0).st(K['基隆'], K['臺北']).end().ev, false, '相鄰的兩點距離 0');
expect('h2', new Sim().weight(e('臺北', '桃園'), 80).st(K['臺北'], K['桃園']).end().ev, false, '臺北–桃園 80 km：直通仍是最短');
expect('h2', new Sim().weight(e('臺中', '彰化'), 100).st(K['臺中'], K['彰化']).end().ev, false, '臺中–彰化 100 km：繞南投只有 2 段（26 + 24 = 50 km）');
expect('h2', new Sim().st(K['臺北'], K['桃園']).end().ev, false, '原權重（三角不等式成立，直通最短）');
expect('h3', new Sim().setMode('neg').weight(negEdge('A', 'B'), -5).end().ev, false, 'Dijkstra 算錯');
expect('h3', new Sim().setMode('neg').weight(negEdge('S', 'B'), -1).weight(negEdge('B', 'D'), -1).weight(negEdge('D', 'T'), -1).end().ev, true, '（S→B→D→T 三段都負也可以）');
expect('h4', new Sim().weight(e('彰化', '南投'), 21).st(K['彰化'], K['埔里']).end().ev, false, '只跑去程');
expect('h4', new Sim().weight(e('彰化', '南投'), 21).st(K['彰化'], K['埔里']).end().weight(e('彰化', '南投'), 22).st(K['埔里'], K['彰化']).end().ev, false, '回程時權重已經不同');
expect('h4', new Sim().st(K['臺北'], K['高雄']).end().swap().end().ev, false, '原權重沒有平手，去回同一條路');
expect('h5', new Sim().setMode('grid').size(5, 5).ones().end().ev, false, '只做了 5 × 5 一種大小');
expect('h5', new Sim().setMode('grid').size(5, 5).ones().end().ones().end().ev, false, '同一個大小做兩次');
expect('h5', new Sim().setMode('grid').size(3, 3).ones().end().size(5, 5).ones().end().ev, false, '3 × 3（太小）＋ 5 × 5');
expect('h5', new Sim().setMode('grid').size(4, 4).ones().end().size(5, 5).ones().st(0, 23).end().ev, false, '5 × 5 的終點不在對角');
expect('h5', new Sim().setMode('grid').size(4, 4).ones().end().size(5, 6).ones().end().ev, false, '5 × 6（不是正方形）');
expect('h5', new Sim().setMode('grid').size(4, 4).ones().end().size(5, 5).end().ev, false, '5 × 5 隨機權重');
expect('h5', new Sim().setMode('grid').size(6, 6).ones().st(5, 30).end().size(4, 4).ones().st(12, 3).end().ev, true, '（另一條對角線、6 × 6 與 4 × 4 也可以）');
expect('h6', new Sim().st(K['桃園'], K['恆春']).end().ev, false, '只跑一個方向');
expect('h7', new Sim().close(e('苗栗', '臺中'), true).close(e('花蓮', '宜蘭'), true).st(K['臺北'], K['新竹']).end().ev, false, 's、t 在同一邊');
expect('h7', new Sim().close(e('基隆', '臺北'), true).close(e('基隆', '宜蘭'), true).st(K['基隆'], K['高雄']).end().ev, false, '只切下基隆一城');
expect('h8', new Sim().st(K['花蓮'], K['基隆']).end().ev, false, '原權重：檢查 ' + new Sim().st(K['花蓮'], K['基隆']).end().last.data.checks + ' 次、更新 ' + new Sim().st(K['花蓮'], K['基隆']).end().last.data.relax + ' 次');
expect('h9', new Sim().setMode('neg').setAlgo('bf').end().ev, false, '預設權重：Bellman–Ford ' + new Sim().setMode('neg').setAlgo('bf').end().last.data.updRounds + ' 輪有更新');
expect('h10', new Sim().st(K['彰化'], K['高雄']).end().ev, false, '原權重');
expect('h10', new Sim().ones().end().ev, false, '「全部設為 1」：任何生成樹都一樣輕（最小生成樹不唯一，不算）');
{
  const s = new Sim(); [['臺中', '埔里'], ['彰化', '斗六'], ['臺南', '臺東'], ['臺東', '花蓮']].forEach(p => s.weight(e(p[0], p[1]), 500));
  expect('h10', s.st(K['基隆'], K['高雄']).end().ev, false, '同一組權重但起點基隆（最短路徑樹還用到基隆–宜蘭、花蓮–宜蘭）');
}
{
  // 原權重下每個起點都不是
  let any = false;
  for (let s = 0; s < 18; s++) if (run(byId('h10'), new Sim().st(s, (s + 1) % 18).end().ev)) any = true;
  if (any) fail++;
  console.log((any ? '  ✗ ' : '  ✓ ') + 'h10 不觸發：原權重下 18 個起點都不是');
}

// ---------- 交叉檢查 ----------
console.log('\n十個隱藏任務的交叉檢查（列：用哪個解法；欄：同時完成了哪些隱藏任務）：');
{
  const hs = hidden.map(m => m.id.replace('shortest-path-', ''));
  console.log('        ' + hs.map(h => h.padStart(4)).join(''));
  Object.keys(sol).forEach(h => {
    const ev = sol[h][1]();
    const row = hidden.map(m => run(m, ev));
    const extra = row.filter((x, i) => x && hs[i] !== h).length;
    if (extra) fail++;
    console.log('  ' + h.padEnd(5) + ' ' + row.map(x => (x ? '●' : '·').padStart(4)).join('') + (extra ? '   ✗ 連帶完成' : ''));
  });
  // 公開任務的解法也不應順便完成隱藏任務
  const pubSol = {
    '1': () => new Sim().end().ev, '2': () => new Sim().step(400).ev, '3': () => new Sim().st(K['基隆'], K['屏東']).end().ev,
    '4': () => new Sim().st(K['苗栗'], 12).end().ev, '5': () => new Sim().setEarly(true).st(K['臺北'], K['桃園']).end().ev,
    '6': () => new Sim().st(K['桃園'], K['嘉義']).setAlgo('bfs').end().ev, '7': () => new Sim().st(K['基隆'], K['屏東']).weight(e('花蓮', '宜蘭'), 120).end().ev,
    '8': () => new Sim().setMode('grid').size(5, 6).ones().end().ev, '9': () => new Sim().setMode('neg').weight(negEdge('A', 'B'), -5).end().ev,
    '10': () => new Sim().st(K['基隆'], K['屏東']).weight(e('屏東', '臺東'), 95).end().ev
  };
  const bad = [];
  Object.keys(pubSol).forEach(p => { const ev = pubSol[p](); hidden.forEach(m => { if (run(m, ev)) bad.push(p + '→' + m.id.replace('shortest-path-', '')); }); });
  if (bad.length) fail++;
  console.log((bad.length ? '  ✗ ' : '  ✓ ') + '公開任務的解法' + (bad.length ? '順便完成了隱藏任務：' + bad.join('、') : '都不會順便完成隱藏任務'));
}

// ---------- 4. 亂按模擬 ----------
const PEOPLE = 400, ACTIONS = 300;
console.log('\n亂按模擬（固定種子）：' + PEOPLE + ' 人 × 每人 ' + ACTIONS + ' 次，每次從畫面上看得到的控制項中隨機挑一個：');
console.log('  四個圖的按鈕、上一步、單步、下一個點、播放（隨機跑幾步）、直接跑完、重來、全部清除、起點／終點選單、起點終點對調、');
console.log('  畫布點地點（設成起點或終點）、畫布點路、點地點時設為起點／終點、找到終點就停、三個演算法、要改的邊、權重滑桿、封閉這條路、');
console.log('  恢復原來的權重、全部設為 1、（隨機圖）點數滑桿與換一張、（方格）列數、行數滑桿與換一組權重；滑桿 20% 拉到最小、20% 最大、60% 隨機。');
{
  const rand = S.rng(20261112);
  const ri = (n) => Math.floor(rand() * n);
  const slider = (lo, hi) => { const u = rand(); return u < 0.2 ? lo : u < 0.4 ? hi : lo + ri(hi - lo + 1); };
  const hits = {}; missions.forEach(m => { hits[m.id] = 0; });
  for (let p = 0; p < PEOPLE; p++) {
    const s = new Sim();
    for (let a = 0; a < ACTIONS; a++) {
      const V = s.g.nodes.length, E = s.g.edges.length;
      const acts = [
        () => s.setMode('taiwan'), () => s.setMode('random'), () => s.setMode('grid'), () => s.setMode('neg'),
        () => s.back(), () => s.step(), () => s.next(), () => s.play(1 + ri(30)), () => s.end(), () => s.reset(), () => s.reset(),
        () => s.st(ri(V), s.t), () => s.st(s.s, ri(V)), () => s.swap(),
        () => { const v = ri(V); if (s.pick === 's') s.st(v, s.t); else s.st(s.s, v); }, () => { s.sel = ri(E); },
        () => { s.pick = 's'; }, () => { s.pick = 't'; }, () => s.setEarly(!s.early),
        () => s.setAlgo('dijkstra'), () => s.setAlgo('bfs'), () => s.setAlgo('bf'),
        () => { s.sel = ri(E); }, () => { const r = s.range(); s.weight(s.sel, slider(r[0], r[1])); }, () => s.close(s.sel, !s.g.edges[s.sel].closed),
        () => s.restore(), () => s.ones()
      ];
      if (s.mode === 'random') acts.push(() => s.rn(slider(6, 16)), () => s.nextRand());
      if (s.mode === 'grid') acts.push(() => s.gr(slider(3, 6)), () => s.gc(slider(3, 8)), () => s.nextGrid());
      acts[ri(acts.length)]();
    }
    missions.forEach(m => { if (run(m, s.ev)) hits[m.id]++; });
  }
  let worst = 0, worstId = '';
  console.log('  公開任務：' + missions.filter(m => !m.hidden).map(m => m.id.replace('shortest-path-', '') + ' ' + (hits[m.id] / PEOPLE * 100).toFixed(1) + '%').join('、'));
  hidden.forEach(m => {
    const q = hits[m.id] / PEOPLE;
    if (q > worst) { worst = q; worstId = m.id; }
    console.log('  ' + m.id.padEnd(20) + '等級 ' + String(m.level).padStart(2) + '　' + (q * 100).toFixed(2) + '%（' + hits[m.id] + ' ／ ' + PEOPLE + ' 人）');
  });
  if (worst >= 0.02) { fail++; console.log('  ✗ ' + worstId + ' 被亂按完成的比例 ≥ 2%'); }
  else console.log('  ✓ 每個隱藏任務被亂按完成的比例都 < 2%（最高 ' + (worst * 100).toFixed(2) + '%）');
}

console.log(fail ? `\n✗ ${fail} 項不符合` : '\n全部任務都證明做得到；預設狀態不觸發；隱藏任務互不連帶；亂按誤觸都 < 2%。');
process.exitCode = fail ? 1 : 0;
