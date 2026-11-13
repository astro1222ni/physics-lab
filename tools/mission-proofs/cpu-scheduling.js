/* 任務可達成的證明腳本。用法：node tools/mission-proofs/cpu-scheduling.js
 * 用排程核心模擬頁面（js/cpu-scheduling.js）送出的 'run' 事件，證明：
 *   1. 每個任務都做得到（印出解法）；2. 預設狀態（預設工作表、內建範例，只換方法、時間片、規則）不觸發隱藏任務；
 *   3. 十個隱藏任務的解法不會順便完成另一個隱藏任務；
 *   4. 像試玩工具一樣亂按（換方法、改行程數、隨機產生、範例、改格子、時間片、切換成本、同一時刻規則、播放、單步、直接跑完……），
 *      隱藏任務被誤觸的機率（每個都要 < 2%）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/cpu-scheduling-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/cpu-scheduling.js');
const byId = id => missions.find(m => m.id === 'cpu-scheduling-' + id);
const hidden = missions.filter(m => m.hidden);
const ALGOS = K.ALGOS;

// ---------- 與頁面相同的狀態與事件 ----------
const PRESETS = {
  convoy: [[0, 24, 1], [0, 3, 1], [0, 3, 1]],
  srtf: [[0, 8, 1], [1, 4, 1], [2, 9, 1], [3, 5, 1]],
  stallings: [[0, 3, 1], [2, 6, 1], [4, 4, 1], [6, 5, 1], [8, 2, 1]],
  equal: [[0, 4, 1], [0, 4, 1], [0, 4, 1], [0, 4, 1], [0, 4, 1]]
};
const DEFAULT_SHEET = [[0, 7, 3], [2, 4, 1], [3, 1, 4], [5, 5, 2], [6, 3, 5]];
const toProcs = list => list.map(r => ({ arr: r[0], burst: r[1], pri: r[2] == null ? 1 : r[2] }));
const pick = r => ({ avgW: r.avgW, avgT: r.avgT, avgR: r.avgR, switches: r.switches, preempts: r.preempts, expires: r.expires, gap: r.gap, csTime: r.csTime, makespan: r.makespan, fin: r.fin.slice(), wait: r.wait.slice() });

class Sim {
  constructor() {
    this.procs = toProcs(DEFAULT_SHEET); this.seed = 0; this.sheetSrc = 'default'; this.edits = 0;
    this.algo = 'fcfs'; this.q = 3; this.cs = 0; this.tie = 'new';
    this.t = 0; this.atEnd = false; this.ev = []; this._res = null;
  }
  opt() { return { q: this.q, cs: this.cs, tie: this.tie }; }
  res() { return this._res || (this._res = K.schedule(this.procs, this.algo, this.opt())); }
  times() {
    const r = this.res(), set = { 0: true };
    r.segs.forEach(s => { set[s.t0] = true; set[s.t1] = true; });
    r.events.forEach(e => { set[e.t] = true; });
    return Object.keys(set).map(Number).sort((a, b) => a - b);
  }
  /** 頁面的 eventData（js/cpu-scheduling.js） */
  data(src) {
    const P = this.procs, A = K.runAll(P, this.opt()), r = A[this.algo];
    const all = {};
    ALGOS.forEach(a => { all[a] = pick(A[a]); });
    const z = this.cs > 0 ? K.runAll(P, { q: this.q, cs: 0, tie: this.tie }) : A, zero = {};
    ALGOS.forEach(a => { zero[a] = z[a].avgW; });
    const other = this.algo === 'rr' ? K.schedule(P, 'rr', { q: this.q, cs: this.cs, tie: this.tie === 'new' ? 'old' : 'new' }) : r;
    const keys = {};
    ALGOS.forEach(a => { keys[K.ganttKey(A[a])] = true; });
    const scan = K.rrScan(P, { cs: this.cs, tie: this.tie });
    return {
      src: src, algo: this.algo, q: this.q, cs: this.cs, tie: this.tie, n: P.length,
      arr: P.map(p => p.arr), burst: P.map(p => p.burst), pri: P.map(p => p.pri), sheet: this.sheetSrc, edits: this.edits,
      avgW: r.avgW, avgT: r.avgT, avgR: r.avgR, maxW: r.maxW, wait: r.wait.slice(), tat: r.tat.slice(), resp: r.resp.slice(), fin: r.fin.slice(), first: r.first.slice(),
      switches: r.switches, preempts: r.preempts, expires: r.expires, gap: r.gap, idle: r.idle, csTime: r.csTime, csShare: r.csShare, makespan: r.makespan, util: r.util,
      sameAsFcfs: K.sameGantt(r, A.fcfs), renews: r.ticks.length, ganttKinds: Object.keys(keys).length, otherTieW: other.avgW,
      all: all, zero: zero, rrW: scan.avgW.slice(), rrSw: scan.switches.slice()
    };
  }
  emit(src) { this.ev.push({ type: 'run', data: this.data(src) }); }
  /** 工作表或設定改了：已經在最後一刻就直接顯示新結果並送出事件，否則回到 t = 0 */
  changed() { this._res = null; if (this.atEnd) { this.t = this.res().makespan; this.emit('update'); } else this.t = 0; return this; }
  finish(src) { this.t = this.res().makespan; this.atEnd = true; this.emit(src); return this; }
  // ----- 操作 -----
  algoTo(a) { this.algo = a; return this.changed(); }
  sheet(list) { this.procs = toProcs(list); this.sheetSrc = 'hand'; this.edits++; return this.changed(); }
  cell(i, k, v) {
    const lo = k === 'arr' ? 0 : 1, hi = k === 'arr' ? K.LIMITS.arrMax : k === 'burst' ? K.LIMITS.burstMax : K.LIMITS.priMax;
    const nv = Math.min(hi, Math.max(lo, Math.round(v)));
    if (nv === this.procs[i][k]) return this;
    this.procs[i][k] = nv; this.sheetSrc = 'hand'; this.edits++;
    return this.changed();
  }
  nTo(n) {
    n = Math.max(K.LIMITS.nMin, Math.min(K.LIMITS.nMax, n));
    if (n === this.procs.length) return this;
    while (this.procs.length > n) this.procs.pop();
    while (this.procs.length < n) this.procs.push(K.randomProc(this.seed + 1000, this.procs.length));
    return this.changed();
  }
  random() { this.seed++; this.procs = K.randomSheet(this.seed, this.procs.length); this.sheetSrc = 'random'; this.edits = 0; return this.changed(); }
  preset(k) { this.procs = toProcs(PRESETS[k]); this.sheetSrc = 'preset'; this.edits = 0; return this.changed(); }
  qTo(q) { this.q = q; return this.changed(); }
  csTo(c) { this.cs = c; return this.changed(); }
  tieTo(t) { this.tie = t; return this.changed(); }
  toEnd() { return this.finish('end'); }
  play() { if (this.atEnd) { this.t = 0; this.atEnd = false; } return this.finish('play'); }
  /** 播放到一半就被打斷 */
  playHalf() { if (this.atEnd) { this.atEnd = false; } this.t = this.res().makespan / 2; return this; }
  step() {
    if (this.atEnd) { this.t = 0; this.atEnd = false; }
    const T = this.times(), nt = T.find(v => v > this.t + 1e-9);
    const target = nt == null ? this.res().makespan : nt;
    this.t = target;
    if (target >= this.res().makespan - 1e-9) this.finish('step');
    return this;
  }
  back() { const T = this.times(); let pv = 0; T.forEach(v => { if (v < this.t - 1e-9) pv = v; }); this.t = pv; this.atEnd = false; return this; }
  reset() { this.t = 0; this.atEnd = false; return this; }
}
const run = (m, events) => { m.mem = {}; return events.some(e => { try { return !!m.check(e, m.mem); } catch (err) { return false; } }); };
const which = events => hidden.filter(m => run(m, events)).map(m => m.id.replace('cpu-scheduling-', ''));

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
console.log('預設狀態：');
{
  const s = new Sim();
  if (s.ev.length) { fail++; console.log('  ✗ 載入頁面就送出了事件'); } else console.log('  ✓ 載入頁面不送出任何事件（任務都要先操作）');
  // 預設工作表與內建範例：六種方法 × q = 1…20 × 兩種同一時刻規則 × 切換成本 0、0.5、1、2，全部跑到最後
  const hits = {};
  let count = 0;
  [null, 'convoy', 'srtf', 'stallings', 'equal'].forEach(pr => {
    const base = new Sim();
    if (pr) base.preset(pr);
    [0, 0.5, 1, 2].forEach(cs => ['new', 'old'].forEach(tie => {
      for (let q = 1; q <= 20; q++) ALGOS.forEach(a => {
        const t = new Sim();
        t.procs = base.procs.map(p => Object.assign({}, p)); t.sheetSrc = base.sheetSrc;
        t.algo = a; t.q = q; t.cs = cs; t.tie = tie;
        t.toEnd(); count++;
        which(t.ev).forEach(h => { hits[h] = (hits[h] || 0) + 1; });
      });
    }));
  });
  const hk = Object.keys(hits);
  if (hk.length) { fail++; console.log('  ✗ 預設或範例的工作表觸發了隱藏任務：' + hk.map(h => h + '×' + hits[h]).join('、')); }
  else console.log('  ✓ 預設工作表與 4 個範例 × 六種方法 × q 1–20 × 兩種規則 × 4 種切換成本（' + count + ' 種）都不觸發任何隱藏任務');
  // 公開任務：只有第 1 個（跑到最後）和第 2 個（RR 用完時間片）在預設工作表上一跑就完成
  const pub = missions.filter(m => !m.hidden);
  const s2 = new Sim();
  ALGOS.forEach(a => s2.algoTo(a).toEnd());
  console.log('  預設工作表六種方法各跑一次，完成的公開任務：' + pub.filter(m => run(m, s2.ev)).map(m => m.id.replace('cpu-scheduling-', '')).join('、'));
}

// ---------- 2. 一般任務 ----------
console.log('\n一般任務：');
expect('1', new Sim().play().ev, true, '預設工作表按「播放」跑到最後');
expect('2', new Sim().algoTo('rr').toEnd().ev, true, '選 RR（q = 3）直接跑完：P1 在 t = 3 用完時間片');
expect('2', new Sim().algoTo('rr').qTo(7).toEnd().ev, false, 'q = 7 時沒有人用完時間片');
expect('3', new Sim().cell(4, 'arr', 30).toEnd().ev, true, '把 P5 的到達時間改成 30（CPU 在 t = 20–30 閒置）');
expect('3', new Sim().toEnd().ev, false, '預設工作表沒有空檔');
expect('4', new Sim().preset('convoy').toEnd().ev, true, '範例「課本：24、3、3 同時到達」用 FCFS：平均等待 17，SJF 只有 3');
expect('4', new Sim().preset('convoy').algoTo('sjf').toEnd().ev, false, '同一張表但選 SJF 不算（要選 FCFS）');
expect('5', new Sim().sheet([[0, 10], [1, 1], [1, 1]]).algoTo('srtf').toEnd().ev, true, '長工作 (0, 10) 後面跟著兩個 (1, 1)：SRTF 平均等待 1，SJF 6.33');
expect('5', new Sim().preset('srtf').algoTo('srtf').toEnd().ev, false, '課本 SRTF 例子：6.5 對 7.75，只差 1.25');
expect('6', new Sim().preset('stallings').algoTo('rr').qTo(4).toEnd().ev, false, 'Stallings 的表 RR q = 4（7.0）沒有比 FCFS（3.6）少');
expect('6', new Sim().preset('convoy').nTo(5).algoTo('rr').qTo(4).toEnd().ev, true, '範例 24、3、3 再加兩個行程（n = 5），RR q = 4');
expect('7', new Sim().sheet([[0, 8, 5], [1, 5, 3], [2, 2, 1]]).algoTo('pp').toEnd().ev, true, '優先權 5、3、1 依序晚 1 到：P1 被 P2 搶、P2 被 P3 搶');
expect('7', new Sim().algoTo('pp').toEnd().ev, false, '預設工作表只被搶先 1 次');
expect('8', new Sim().algoTo('rr').qTo(1).csTo(1).toEnd().ev, true, '預設工作表 RR q = 1、切換成本 1');
expect('9', new Sim().preset('equal').algoTo('rr').qTo(1).toEnd().ev, true, '範例「五個一樣長、同時到達」RR q = 1：回應 2（其他 8），周轉 18（其他 12）');
expect('9', new Sim().preset('convoy').algoTo('rr').qTo(4).toEnd().ev, false, '24、3、3 的 RR 回應比 SJF 慢');
{
  // 第 10 個：找一張表，RR 在某個 q 比 q = 1 和 FCFS 都少而且是最少
  const s = new Sim().preset('stallings').algoTo('rr');
  const sc = K.rrScan(s.procs, { cs: 0, tie: 'new' });
  const best = sc.avgW.indexOf(Math.min.apply(null, sc.avgW)) + 1;
  const ok = new Sim().preset('convoy').algoTo('rr');
  const sc2 = K.rrScan(ok.procs, { cs: 0, tie: 'new' });
  const best2 = sc2.avgW.indexOf(Math.min.apply(null, sc2.avgW)) + 1;
  expect('10', ok.qTo(best2).toEnd().ev, true, '範例 24、3、3：RR 在 q = ' + best2 + ' 平均等待 ' + K.fmt(sc2.avgW[best2 - 1]) + '（q = 1 是 ' + K.fmt(sc2.avgW[0]) + '，FCFS 17）');
  expect('10', s.qTo(best).toEnd().ev, false, 'Stallings 的表最好的 q = ' + best + '（' + K.fmt(sc.avgW[best - 1]) + '）還是比 FCFS（3.6）多');
  expect('10', new Sim().preset('convoy').algoTo('rr').qTo(1).toEnd().ev, false, '24、3、3 的 q = 1 不是最少');
}
expect('11', new Sim().sheet([[0, 8], [0, 6], [0, 4], [0, 2]]).toEnd().ev, true, '8、6、4、2 同時到達：FCFS 平均等待 (0+8+14+18)/4 = 10，SJF (0+2+6+12)/4 = 5');

// ---------- 3. 隱藏任務 ----------
console.log('\n隱藏任務（解法與交叉檢查）：');
const sol = {
  h1: ['五個行程一個接一個剛好到：(0,2) (2,3) (5,1) (6,4) (10,2)，FCFS 跑完——沒有人等、CPU 不閒置', () => new Sim().sheet([[0, 2], [2, 3], [5, 1], [6, 4], [10, 2]]).toEnd().ev],
  h2: ['(0,4) (1,4) (3,4)，RR q = 3 跑完（P1 在 t = 3 用完時間片的同一刻 P3 到達，新到達的先排：平均等待 5.67），再勾選「被換下的先排」→ 4.67', () => new Sim().sheet([[0, 4], [1, 4], [3, 4]]).algoTo('rr').toEnd().tieTo('old').ev],
  h3: ['五個同時到達、執行時間 9、7、5、3、1，FCFS：平均等待 (0+9+16+21+24)/5 = 14，所有順序中最多', () => new Sim().sheet([[0, 9], [0, 7], [0, 5], [0, 3], [0, 1]]).toEnd().ev],
  h4: ['(0,10) (1,8) (2,6) (3,4) (4,2)，SRTF：每個後來的都比台上的剩餘時間短，搶先 4 次', () => new Sim().sheet([[0, 10], [1, 8], [2, 6], [3, 4], [4, 2]]).algoTo('srtf').toEnd().ev],
  h5: ['(0,2) (0,1) (3,10) (13,1)，RR q = 3：P3 獨自一人，時間片用完都沒人接班，甘特圖和 FCFS 一樣；SJF（0.25）比 FCFS（0.5）好', () => new Sim().sheet([[0, 2], [0, 1], [3, 10], [13, 1]]).algoTo('rr').toEnd().ev],
  h6: ['P1 (0,20) 加上 7 個 (1,3)(4,3)…(19,3)，SRTF：短工作一個接一個，P1 等到 t = 22 才繼續，等待 21', () => new Sim().sheet([[0, 20, 9], [1, 3, 1], [4, 3, 1], [7, 3, 1], [10, 3, 1], [13, 3, 1], [16, 3, 1], [19, 3, 1]]).algoTo('srtf').toEnd().ev],
  h7: ['(0,6) (2,2) (5,3) (6,1) (10,4)，FCFS：每一個都在前一個到達後「自己的執行時間」那麼久才到，周轉時間都是 6，平均等待 2.8', () => new Sim().sheet([[0, 6], [2, 2], [5, 3], [6, 1], [10, 4]]).toEnd().ev],
  h8: ['A(0,2,優先 3) B(0,3,優先 1) C(3,1,優先 2) D(3,1,優先 2)，優先權（不搶先）：平均等待 1.5，SJF 1.75', () => new Sim().sheet([[0, 2, 3], [0, 3, 1], [3, 1, 2], [3, 1, 2]]).algoTo('pn').toEnd().ev],
  h9: ['(0,6) (1,1) (1,1) (5,1)，RR q = 1：兩次用完時間片，平均等待 1 = SRTF，FCFS 與 SJF 都是 3.5', () => new Sim().sheet([[0, 6], [1, 1], [1, 1], [5, 1]]).algoTo('rr').qTo(1).toEnd().ev],
  h10: ['(0,3,優先 4) (1,2,3) (5,1,1) (6,6,2) (6,7,2)，q = 6：執行時間互不相同，甘特圖有 ' + (function () { const A = K.runAll(toProcs([[0, 3, 4], [1, 2, 3], [5, 1, 1], [6, 6, 2], [6, 7, 2]]), { q: 6, cs: 0, tie: 'new' }); return new Set(ALGOS.map(a => K.ganttKey(A[a]))).size + ' 種，六種方法平均等待都是 ' + K.fmt(A.fcfs.avgW); })(), () => new Sim().sheet([[0, 3, 4], [1, 2, 3], [5, 1, 1], [6, 6, 2], [6, 7, 2]]).qTo(6).toEnd().ev]
};
const keys = Object.keys(sol);
const table = [];
keys.forEach(k => {
  const ev = sol[k][1]();
  expect(k, ev, true, sol[k][0]);
  const others = hidden.filter(m => m.id !== 'cpu-scheduling-' + k && run(m, ev)).map(m => m.id.replace('cpu-scheduling-', ''));
  table.push(k.padEnd(4) + '→ ' + (others.length ? '✗ 也完成了 ' + others.join('、') : '沒有連帶完成其他隱藏任務'));
  if (others.length) fail++;
});
// 幾個「差一點」的反例
expect('h1', new Sim().sheet([[0, 2], [2, 3], [5, 1], [6, 4]]).toEnd().ev, false, '只有四個行程不算');
expect('h1', new Sim().sheet([[0, 2], [2, 3], [5, 1], [7, 4], [11, 2]]).toEnd().ev, false, '中間 CPU 空了一下（t = 6–7）不算');
expect('h2', new Sim().algoTo('rr').tieTo('old').toEnd().ev, false, '只看過「被換下的先排」一種不算');
expect('h2', new Sim().algoTo('rr').qTo(7).toEnd().tieTo('old').ev, false, 'q = 7 時兩種規則結果一樣，不算');
expect('h2', new Sim().algoTo('rr').toEnd().tieTo('old').ev, false, '預設工作表 RR q = 3：8.4 對 8.6，只差 0.2，不算');
expect('h2', new Sim().sheet([[0, 4], [1, 4], [3, 4]]).algoTo('rr').csTo(0.5).toEnd().tieTo('old').ev, false, '有切換成本時不算');
expect('h3', new Sim().preset('equal').toEnd().ev, false, '五個一樣長不算');
expect('h3', new Sim().sheet([[0, 9], [0, 7], [0, 7], [0, 3], [0, 1]]).toEnd().ev, false, '9、7、7、3、1 有兩個一樣長，不算（要嚴格由長到短）');
expect('h3', new Sim().sheet([[0, 9], [0, 7], [0, 5], [0, 3], [0, 1]]).algoTo('rr').qTo(20).toEnd().ev, false, '同一張表用 RR（q = 20，結果和 FCFS 一樣）也不算，要選 FCFS');
expect('h4', new Sim().sheet([[0, 10], [1, 8], [2, 6], [3, 4], [4, 2]]).algoTo('srtf').csTo(0.5).toEnd().ev, false, '有切換成本時不算');
expect('h4', new Sim().sheet([[0, 10], [1, 8], [2, 6], [3, 4], [4, 5]]).algoTo('srtf').toEnd().ev, false, '最後一個 (4,5) 沒有比台上的 (3,4) 剩下的 3 短，只搶先 3 次');
expect('h5', new Sim().sheet([[0, 1], [0, 2], [3, 10], [13, 1]]).algoTo('rr').toEnd().ev, false, '先短後長時 FCFS 已經是最好的順序，不算');
expect('h5', new Sim().sheet([[0, 2], [0, 1], [3, 10], [13, 1]]).algoTo('rr').qTo(10).toEnd().ev, false, 'q 不小於最長的執行時間時一定和 FCFS 一樣，不算');
expect('h6', new Sim().sheet([[0, 20, 9], [1, 3, 1], [4, 3, 1], [7, 3, 1], [10, 3, 1], [13, 3, 1], [16, 3, 1], [19, 3, 1]]).algoTo('sjf').toEnd().ev, false, '同一張表用 SJF（不搶先）時 P1 先做完');
expect('h6', new Sim().sheet([[0, 20, 9], [1, 3, 1], [4, 3, 1], [7, 3, 1], [10, 3, 1], [13, 3, 1]]).algoTo('srtf').toEnd().ev, false, '只有 6 個行程時 P1 等待 15，不夠久');
expect('h7', new Sim().sheet([[0, 6], [2, 2], [5, 3], [6, 1], [10, 4]]).algoTo('sjf').toEnd().ev, false, '同一張表用 SJF：周轉時間 6、7、7、1、6，不算');
expect('h7', new Sim().sheet([[0, 2], [2, 2], [4, 2], [6, 2], [8, 2]]).toEnd().ev, false, '周轉時間都是 2，但沒有人等過，不算');
expect('h7', new Sim().sheet([[0, 6], [2, 2], [5, 3], [6, 1]]).toEnd().ev, false, '只有四位不算');
expect('h8', new Sim().sheet([[0, 2, 3], [0, 3, 1], [3, 1, 2], [3, 1, 2]]).algoTo('sjf').toEnd().ev, false, '同一張表選 SJF 不算');
expect('h8', new Sim().preset('convoy').algoTo('pn').toEnd().ev, false, '24、3、3 的優先權全一樣，和 FCFS 相同、比 SJF 差');
expect('h9', new Sim().sheet([[0, 6], [1, 1], [1, 1], [5, 1]]).algoTo('rr').qTo(1).tieTo('old').toEnd().ev, false, '改成「被換下的先排」不算（要預設規則）');
expect('h9', new Sim().sheet([[0, 6], [1, 1], [1, 1], [5, 1]]).algoTo('srtf').toEnd().ev, false, '直接選 SRTF 不算');
expect('h10', new Sim().preset('equal').toEnd().ev, false, '五個一樣長：六種方法也一樣，但執行時間全相同不算');
expect('h10', new Sim().sheet([[0, 4, 2], [0, 4, 1], [0, 5, 3], [0, 6, 4], [0, 7, 5]]).qTo(7).toEnd().ev, false, '同時到達 4、4、5、6、7（優先權讓 P2 先做）：六種方法也一樣，但有兩位一樣長，不算');
expect('h10', new Sim().sheet([[0, 3, 4], [1, 2, 3], [5, 1, 1], [6, 6, 2], [6, 7, 2]]).qTo(2).toEnd().ev, false, '同一張表 q = 2 時 RR 的平均等待不同，不算');
expect('h10', new Sim().sheet([[0, 1], [2, 1], [4, 1], [6, 1], [8, 2]]).toEnd().ev, false, '沒有人等過（六種方法都是 0）不算');
console.log('\n十個隱藏任務的交叉檢查：');
table.forEach(l => console.log('  ' + l));

// ---------- 4. 亂按（像試玩工具）的誤觸率 ----------
const R = 400, STEPS = 300;
console.log('\n亂按模擬：' + R + ' 人 × 每人 ' + STEPS + ' 個隨機操作（換方法 18%、改格子 18%、隨機產生 10%、行程數 8%、時間片 8%、範例 6%、切換成本 6%、同一時刻規則 4%、' +
  '播放 6%（一半播到最後）、單步 6%、直接跑完 6%、上一步 2%、重來 1%、全部清除 1%）；滑桿與格子取隨機值、最小、最大；已在最後一刻時每次改設定都送出事件：');
{
  const rand = K.rng(20261113);
  const hits = {}, pubHits = {};
  hidden.forEach(m => { hits[m.id] = 0; });
  let events = 0, multi = 0;
  const val = (lo, hi) => { const w = rand(); return w < 0.2 ? lo : w < 0.4 ? hi : lo + Math.floor(rand() * (hi - lo + 1)); };
  const PK = Object.keys(PRESETS);
  for (let r = 0; r < R; r++) {
    const s = new Sim();
    for (let k = 0; k < STEPS; k++) {
      const u = rand();
      if (u < 0.18) s.algoTo(ALGOS[Math.floor(rand() * 6)]);
      else if (u < 0.36) {
        const i = Math.floor(rand() * s.procs.length), f = ['arr', 'burst', 'pri'][Math.floor(rand() * 3)];
        const w = rand();
        s.cell(i, f, w < 0.1 ? 999 : w < 0.15 ? -5 : f === 'arr' ? val(0, 30) : f === 'burst' ? val(1, 20) : val(1, 9));
      } else if (u < 0.46) s.random();
      else if (u < 0.54) s.nTo(val(3, 8));
      else if (u < 0.62) s.qTo(val(1, 20));
      else if (u < 0.68) s.preset(PK[Math.floor(rand() * PK.length)]);
      else if (u < 0.74) s.csTo(val(0, 4) / 2);
      else if (u < 0.78) s.tieTo(s.tie === 'new' ? 'old' : 'new');
      else if (u < 0.84) { if (rand() < 0.5) s.play(); else s.playHalf(); }
      else if (u < 0.90) s.step();
      else if (u < 0.96) s.toEnd();
      else if (u < 0.98) s.back();
      else s.reset();
    }
    events += s.ev.length;
    hidden.forEach(m => { if (run(m, s.ev)) hits[m.id]++; });
    missions.filter(m => !m.hidden).forEach(m => { if (run(m, s.ev)) pubHits[m.id] = (pubHits[m.id] || 0) + 1; });
    // 同一個事件同時完成兩個隱藏任務？
    s.ev.forEach(e => { const h = hidden.filter(m => { try { return m.check(e, {}); } catch (err) { return false; } }); if (h.length > 1) multi++; });
  }
  console.log('  （平均每人送出 ' + (events / R).toFixed(1) + ' 個 run 事件）');
  let worst = 0;
  hidden.forEach(m => { const p = hits[m.id] / R; worst = Math.max(worst, p); console.log('  ' + m.id.padEnd(20) + (p * 100).toFixed(2) + '%'); });
  if (worst >= 0.02) { fail++; console.log('  ✗ 有隱藏任務被亂按觸發的機率達到 2%'); } else console.log('  ✓ 每個隱藏任務被亂按觸發的機率都在 2% 以下');
  if (multi) { fail++; console.log('  ✗ 有 ' + multi + ' 個事件同時完成兩個以上的隱藏任務'); } else console.log('  ✓ 沒有任何一個事件同時完成兩個隱藏任務');
  console.log('  （參考：一般任務被亂按完成的比例 ' + missions.filter(m => !m.hidden).map(m => m.id.replace('cpu-scheduling-', '') + ' ' + Math.round((pubHits[m.id] || 0) / R * 100) + '%').join('、') + '）');
}

// ---------- 5. 總覽 ----------
{
  const pub = missions.filter(m => !m.hidden);
  console.log('\n總覽：一般任務 ' + pub.length + ' 個（等級 ' + pub.map(m => m.level).join('、') + '），隱藏任務 ' + hidden.length + ' 個（等級 ' + hidden.map(m => m.level).join('、') + '）');
  const okCount = pub.length >= 8 && pub.length <= 12 && hidden.length === 10 && hidden.every(m => m.level >= 3 && m.level <= 10 && m.riddle && m.riddle.zh && m.riddle.en) &&
    hidden.filter(m => m.level >= 7).length >= 3 && hidden.every(m => m.level * 2 <= 20);
  if (!okCount) { fail++; console.log('  ✗ 數量、等級或謎語不符合規則'); } else console.log('  ✓ 數量、等級（隱藏 3–10 級、' + hidden.filter(m => m.level >= 7).length + ' 個在 7 級以上、星星 ≤ 20）與謎語都符合規則');
}

console.log(fail ? `\n✗ ${fail} 項不符合` : '\n全部任務都證明做得到，預設狀態與亂按都不會誤觸。');
process.exitCode = fail ? 1 : 0;
