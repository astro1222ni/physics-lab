// 以 Node 執行：node tests/cpu-scheduling-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/cpu-scheduling-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= (tol || 1e-9), (msg || '') + ` 期望 ${b}，得到 ${a}`); }
/** [[到達, 執行, 優先權], …] → 行程陣列 */
const P = list => list.map(([arr, burst, pri]) => ({ arr: arr, burst: burst, pri: pri == null ? 1 : pri }));
const S = (procs, algo, opt) => C.schedule(procs, algo, opt || {});
const runs = res => res.segs.filter(s => s.kind === 'run').map(s => 'P' + (s.p + 1) + ':' + s.t0 + '-' + s.t1).join(' ');
/** 隨機行程（整數到達與執行時間） */
function randProcs(r, n, arrMax, burstMax, priMax) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ arr: Math.floor(r() * (arrMax + 1)), burst: 1 + Math.floor(r() * burstMax), pri: 1 + Math.floor(r() * (priMax || 5)) });
  return out;
}

console.log('課本的例子（Silberschatz, Galvin, Gagne《Operating System Concepts》第 10 版 5.3 節）');
test('FCFS：24、3、3 同時到達，平均等待 17；順序換成 3、3、24 只剩 3', () => {
  assert.strictEqual(S(P([[0, 24], [0, 3], [0, 3]]), 'fcfs').avgW, 17);
  assert.strictEqual(S(P([[0, 3], [0, 3], [0, 24]]), 'fcfs').avgW, 3);
});
test('SJF：6、8、7、3 同時到達，平均等待 7（順序 P4、P1、P3、P2）', () => {
  const r = S(P([[0, 6], [0, 8], [0, 7], [0, 3]]), 'sjf');
  assert.strictEqual(r.avgW, 7);
  assert.strictEqual(runs(r), 'P4:0-3 P1:3-9 P3:9-16 P2:16-24');
});
test('SRTF：(0, 8)、(1, 4)、(2, 9)、(3, 5)，平均等待 6.5', () => {
  const r = S(P([[0, 8], [1, 4], [2, 9], [3, 5]]), 'srtf');
  assert.strictEqual(r.avgW, 6.5);
  assert.strictEqual(runs(r), 'P1:0-1 P2:1-5 P4:5-10 P1:10-17 P3:17-26');
  assert.strictEqual(r.preempts, 1);
});
test('RR（q = 4）：24、3、3，平均等待 17/3', () => {
  const r = S(P([[0, 24], [0, 3], [0, 3]]), 'rr', { q: 4 });
  close(r.avgW, 17 / 3);
  assert.strictEqual(runs(r), 'P1:0-4 P2:4-7 P3:7-10 P1:10-30');
  assert.strictEqual(r.ticks.length, 4, 'P1 獨自一人時時間片用完直接續用（14、18、22、26），不算切換');
  assert.strictEqual(r.switches, 3);
});
test('優先權（非搶先）：執行 10、1、2、1、5，優先權 3、1、4、5、2，平均等待 8.2', () => {
  const r = S(P([[0, 10, 3], [0, 1, 1], [0, 2, 4], [0, 1, 5], [0, 5, 2]]), 'pn');
  close(r.avgW, 8.2);
  assert.strictEqual(runs(r), 'P2:0-1 P5:1-6 P1:6-16 P3:16-18 P4:18-19');
});

console.log('Stallings《Operating Systems: Internals and Design Principles》第 9 章五個行程 A–E 的例子（完成時間）');
{
  const ST = P([[0, 3], [2, 6], [4, 4], [6, 5], [8, 2]]);
  const fin = (algo, opt) => S(ST, algo, opt).fin.join(' ');
  test('FCFS 3 9 13 18 20；SPN（= SJF）3 9 15 20 11；SRT 3 15 8 20 10', () => {
    assert.strictEqual(fin('fcfs'), '3 9 13 18 20');
    assert.strictEqual(fin('sjf'), '3 9 15 20 11');
    assert.strictEqual(fin('srtf'), '3 15 8 20 10');
  });
  test('SRT 在 t = 10 時 B、D 剩餘都是 5：先到的 B 先做（平手比到達時間）', () => {
    const r = S(ST, 'srtf');
    assert.ok(runs(r).indexOf('P2:10-15 P4:15-20') >= 0, runs(r));
  });
  test('RR q = 4：3 17 11 20 19', () => assert.strictEqual(fin('rr', { q: 4 }), '3 17 11 20 19'));
  test('RR q = 1：4 18 17 20 15，平均周轉 10.8 —— 和「新到達的先排進佇列」一致', () => {
    assert.strictEqual(fin('rr', { q: 1 }), '4 18 17 20 15');
    close(S(ST, 'rr', { q: 1 }).avgT, 10.8);
  });
  test('RR q = 1 改成「剛被換下的先排」會得到不同的答案（3 18 15 20 16）', () => {
    assert.strictEqual(fin('rr', { q: 1, tie: 'old' }), '3 18 15 20 16');
  });
}

console.log('平手規則');
test('同時到達依編號：FCFS 先做 P1；SJF 執行時間相同時也先做編號小的', () => {
  assert.strictEqual(runs(S(P([[0, 5], [0, 5], [0, 5]]), 'fcfs')), 'P1:0-5 P2:5-10 P3:10-15');
  assert.strictEqual(runs(S(P([[0, 4], [0, 2], [0, 2]]), 'sjf')), 'P2:0-2 P3:2-4 P1:4-8');
});
test('RR：新到達與剛用完時間片的同一刻要排隊 —— 兩種規則各自正確', () => {
  const pr = P([[0, 3], [2, 2]]);
  assert.strictEqual(runs(S(pr, 'rr', { q: 2 })), 'P1:0-2 P2:2-4 P1:4-5', '預設：新到達的 P2 先排');
  assert.strictEqual(runs(S(pr, 'rr', { q: 2, tie: 'old' })), 'P1:0-3 P2:3-5', '剛被換下的 P1 先排：它排第一，所以直接續用時間片');
  assert.strictEqual(S(pr, 'rr', { q: 2, tie: 'old' }).expires, 0);
});
test('RR：時間片用完的那一刻剛好做完，算做完（不回佇列、不算被換下）', () => {
  const r = S(P([[0, 4], [0, 4]]), 'rr', { q: 4 });
  assert.strictEqual(runs(r), 'P1:0-4 P2:4-8');
  assert.strictEqual(r.expires, 0);
});
test('SRTF：新來的剩餘時間和正在做的一樣時不搶先', () => {
  const r = S(P([[0, 4], [2, 2]]), 'srtf');
  assert.strictEqual(runs(r), 'P1:0-4 P2:4-6');
  assert.strictEqual(r.preempts, 0);
  assert.strictEqual(runs(S(P([[0, 4], [2, 1]]), 'srtf')), 'P1:0-2 P2:2-3 P1:3-5');
});
test('優先權（搶先）：數字嚴格比較小才搶先；一樣時不搶先', () => {
  assert.strictEqual(runs(S(P([[0, 5, 2], [1, 2, 2]]), 'pp')), 'P1:0-5 P2:5-7');
  assert.strictEqual(runs(S(P([[0, 5, 2], [1, 2, 1]]), 'pp')), 'P1:0-1 P2:1-3 P1:3-7');
});

console.log('情境切換成本');
test('三個同時到達、各 2，cs = 1：切換兩次，各花 1；平均等待 (0 + 3 + 6)/3 = 3', () => {
  const r = S(P([[0, 2], [0, 2], [0, 2]]), 'fcfs', { cs: 1 });
  assert.deepStrictEqual(r.segs.map(s => s.kind + ':' + s.t0 + '-' + s.t1).join(' '), 'run:0-2 cs:2-3 run:3-5 cs:5-6 run:6-8');
  assert.strictEqual(r.switches, 2); assert.strictEqual(r.csTime, 2); assert.strictEqual(r.avgW, 3);
  close(r.csShare, 2 / 8);
});
test('CPU 閒置之後開始執行不算切換', () => {
  const r = S(P([[0, 2], [5, 2]]), 'fcfs', { cs: 1 });
  assert.strictEqual(runs(r), 'P1:0-2 P2:5-7');
  assert.strictEqual(r.switches, 0); assert.strictEqual(r.csTime, 0); assert.strictEqual(r.gap, 3);
});
test('切換結束時才挑下一個：切換期間到達的短工作也能被 SJF 挑中', () => {
  const r = S(P([[0, 2], [0, 5], [3, 1]]), 'sjf', { cs: 1 });
  assert.strictEqual(runs(r), 'P1:0-2 P3:3-4 P2:5-10');
});
test('切換一定是換到另一個行程（隨機 3000 組，RR、SRTF、優先權搶先，cs = 0.5–2）', () => {
  const r = C.rng(31);
  for (let k = 0; k < 3000; k++) {
    const pr = randProcs(r, 3 + (k % 6), 10, 8);
    const algo = ['rr', 'srtf', 'pp'][k % 3], cs = [0.5, 1, 1.5, 2][k % 4];
    const res = S(pr, algo, { q: 1 + (k % 5), cs: cs, tie: k % 2 ? 'old' : 'new' });
    res.segs.forEach(s => { if (s.kind === 'cs') assert.notStrictEqual(s.from, s.to, JSON.stringify(pr)); });
    close(res.csTime, res.switches * cs);
  }
});

console.log('守恆、沒有重疊、不空轉（隨機大量檢查）');
test('六種演算法 × 各種 q、cs、平手規則：每個行程的執行時間總和不變；甘特圖首尾相接不重疊；閒置時沒有人在等', () => {
  const r = C.rng(2026);
  let count = 0;
  for (let k = 0; k < 4000; k++) {
    const pr = randProcs(r, 3 + Math.floor(r() * 6), 30, 20, 9);
    const opt = { q: 1 + Math.floor(r() * 20), cs: [0, 0, 0.5, 1, 2][Math.floor(r() * 5)], tie: r() < 0.5 ? 'new' : 'old' };
    C.ALGOS.forEach(a => {
      const res = S(pr, a, opt);
      const errs = C.validate(pr, res);
      assert.deepStrictEqual(errs, [], a + ' ' + JSON.stringify(opt) + ' ' + JSON.stringify(pr) + '\n' + errs.join('\n'));
      count++;
    });
  }
  assert.ok(count === 24000);
});
test('周轉 = 等待 + 執行；平均周轉 = 平均等待 + 平均執行時間；使用率 = 執行時間總和 ÷ 總時間', () => {
  const r = C.rng(5);
  for (let k = 0; k < 500; k++) {
    const pr = randProcs(r, 5, 12, 10);
    C.ALGOS.forEach(a => {
      const res = S(pr, a, { q: 3, cs: 0.5 });
      pr.forEach((p, i) => close(res.tat[i], res.wait[i] + p.burst));
      close(res.avgT, res.avgW + pr.reduce((s, p) => s + p.burst, 0) / pr.length);
      close(res.util, res.busy / res.makespan);
    });
  }
});
test('就緒佇列長度對時間的面積 = 所有行程等待時間的總和', () => {
  const r = C.rng(77);
  for (let k = 0; k < 1500; k++) {
    const pr = randProcs(r, 3 + (k % 6), 15, 12);
    const a = C.ALGOS[k % 6];
    const res = S(pr, a, { q: 1 + (k % 7), cs: [0, 0.5, 1][k % 3] });
    close(C.queueArea(res), res.wait.reduce((s, v) => s + v, 0), 1e-9, a + ' ' + JSON.stringify(pr));
  }
});
test('非搶先（FCFS、SJF、優先權）：每個行程只執行一段，所以等待時間 = 回應時間', () => {
  const r = C.rng(9);
  for (let k = 0; k < 1000; k++) {
    const pr = randProcs(r, 3 + (k % 6), 20, 15);
    ['fcfs', 'sjf', 'pn'].forEach(a => {
      const res = S(pr, a, { cs: [0, 1][k % 2] });
      assert.strictEqual(res.segs.filter(s => s.kind === 'run').length, pr.length);
      pr.forEach((p, i) => close(res.wait[i], res.resp[i]));
      assert.strictEqual(res.preempts + res.expires, 0);
    });
  }
});
test('stateAt：任何時刻，就緒佇列裡的都是已到達、還沒做完、不在 CPU 上的行程', () => {
  const r = C.rng(15);
  for (let k = 0; k < 300; k++) {
    const pr = randProcs(r, 3 + (k % 6), 12, 8);
    const res = S(pr, C.ALGOS[k % 6], { q: 2, cs: [0, 1][k % 2] });
    for (let t = 0; t <= res.makespan; t += 0.25) {
      const st = C.stateAt(res, t);
      const want = pr.map((p, i) => i).filter(i => pr[i].arr <= t && res.fin[i] > t && i !== st.cur);
      // 事件剛好發生的時刻（到達、切換）以事件之後的狀態為準；這裡只比對不在事件時刻的點
      if (res.events.some(e => Math.abs(e.t - t) < 1e-9) || res.segs.some(s => Math.abs(s.t0 - t) < 1e-9)) continue;
      assert.deepStrictEqual(st.ready.slice().sort(), want.sort(), 't = ' + t + ' ' + JSON.stringify(pr));
    }
  }
});

console.log('最佳性（暴力列舉驗證）');
test('全部同時到達：SJF 的平均等待時間是所有 n! 種順序中最小的（n ≤ 6，800 組）；反過來由長到短是最大的', () => {
  const r = C.rng(42);
  for (let k = 0; k < 800; k++) {
    const n = 2 + (k % 5);
    const pr = randProcs(r, n, 0, 20);
    const rg = C.nonPreemptiveRange(pr);
    close(S(pr, 'sjf').avgW, rg.min, 1e-9, JSON.stringify(pr));
    const desc = pr.map((p, i) => i).sort((a, b) => pr[b].burst - pr[a].burst || a - b);
    close(C.orderWait(pr, desc), rg.max, 1e-9);
  }
});
test('到達時間不同時，不搶先的 SJF 不一定最好：A(0, 2)、B(0, 3)、E(3, 1)、F(3, 1) —— 先做較長的 B 反而少等', () => {
  const pr = P([[0, 2, 3], [0, 3, 1], [3, 1, 2], [3, 1, 2]]);
  const sjf = S(pr, 'sjf'), pn = S(pr, 'pn');
  close(sjf.avgW, 7 / 4);
  close(pn.avgW, 6 / 4);
  assert.strictEqual(runs(pn), 'P2:0-3 P3:3-4 P4:4-5 P1:5-7');
  close(C.nonPreemptiveRange(pr).min, 6 / 4);
});
test('不搶先的最佳排程（n! 種順序、每個盡早開始）永遠不比 SJF、FCFS、優先權差（隨機 600 組）', () => {
  const r = C.rng(8);
  for (let k = 0; k < 600; k++) {
    const pr = randProcs(r, 3 + (k % 4), 10, 8);
    const m = C.nonPreemptiveRange(pr).min;
    ['fcfs', 'sjf', 'pn'].forEach(a => assert.ok(m <= S(pr, a).avgW + 1e-9));
  }
});
test('SRTF 的平均等待時間是所有排程（可搶先、可故意閒置）中最小的：和動態規劃窮舉的最佳值相同（n ≤ 5，600 組）', () => {
  const r = C.rng(123);
  for (let k = 0; k < 600; k++) {
    const pr = randProcs(r, 2 + (k % 4), 6, 4);
    close(S(pr, 'srtf').avgW, C.optimalPreemptive(pr), 1e-9, JSON.stringify(pr));
  }
});
test('沒有切換成本時，SRTF 不輸給任何一種方法（隨機 2000 組，RR 的 q 也隨機）', () => {
  const r = C.rng(321);
  for (let k = 0; k < 2000; k++) {
    const pr = randProcs(r, 3 + (k % 6), 20, 15, 9);
    const best = S(pr, 'srtf').avgW;
    C.ALGOS.forEach(a => assert.ok(best <= S(pr, a, { q: 1 + (k % 20) }).avgW + 1e-9, a + ' ' + JSON.stringify(pr)));
  }
});

console.log('RR 與 FCFS');
test('時間片 q ≥ 最長的執行時間：RR 和 FCFS 完全一樣（甘特圖與所有指標；兩種平手規則、各種切換成本）', () => {
  const r = C.rng(64);
  for (let k = 0; k < 2000; k++) {
    const pr = randProcs(r, 3 + (k % 6), 25, 20);
    const maxB = Math.max.apply(null, pr.map(p => p.burst));
    const opt = { q: maxB + (k % 3), cs: [0, 0.5, 1, 2][k % 4], tie: k % 2 ? 'old' : 'new' };
    const a = S(pr, 'rr', opt), b = S(pr, 'fcfs', opt);
    assert.ok(C.sameGantt(a, b), JSON.stringify(pr));
    close(a.avgW, b.avgW); close(a.avgR, b.avgR); assert.strictEqual(a.switches, b.switches); assert.strictEqual(a.expires, 0);
  }
});
test('rrScan：q 從 1 到 20；q 到達最長執行時間以後平均等待時間就等於 FCFS', () => {
  const pr = P([[0, 7], [1, 3], [2, 5], [4, 2]]);
  const sc = C.rrScan(pr, { cs: 0 });
  assert.strictEqual(sc.avgW.length, 20);
  for (let q = 7; q <= 20; q++) close(sc.avgW[q - 1], S(pr, 'fcfs').avgW);
  assert.ok(sc.switches[0] > sc.switches[19], 'q 越小切換越多');
});

console.log('工作表與工具');
test('隨機工作表可重現；增加行程數時前面的行程不變；sanitize 把數值夾在範圍內', () => {
  assert.deepStrictEqual(C.randomSheet(5, 6), C.randomSheet(5, 6));
  assert.deepStrictEqual(C.randomSheet(5, 8).slice(0, 6), C.randomSheet(5, 6));
  assert.notDeepStrictEqual(C.randomSheet(5, 6), C.randomSheet(6, 6));
  C.randomSheet(9, 8).forEach(p => { assert.ok(p.arr >= 0 && p.arr <= 12 && p.burst >= 1 && p.burst <= 10 && p.pri >= 1 && p.pri <= 5); });
  assert.deepStrictEqual(C.sanitize({ arr: -3, burst: 99, pri: 0 }), { arr: 0, burst: 20, pri: 1 });
  assert.deepStrictEqual(C.sanitize({ arr: 2.6, burst: 'x', pri: 12 }), { arr: 3, burst: 1, pri: 9 });
});
test('fmt：四捨五入、不顯示 −0', () => {
  assert.strictEqual(C.fmt(17 / 3), '5.67');
  assert.strictEqual(C.fmt(-0.0001), '0');
  assert.strictEqual(C.fmt(NaN), '—');
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗項目' : ''));
