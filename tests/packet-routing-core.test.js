// 以 Node 執行：node tests/packet-routing-core.test.js
'use strict';
const assert = require('assert');
const R = require('../js/packet-routing-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e)); process.exitCode = 1; }
}
const MSG = 'Hello from Astro Ni Lab';
const near = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-9);
function world(net) {
  const w = new R.World(net || 'city');
  const ev = [], fx = [];
  w.on((t, d) => { if (t === 'fx') fx.push(d); else ev.push([t, d]); });
  return { w, ev, fx };
}
const L = (w, a, b) => R.linkBetween(w.net, w.net.idx[a], w.net.idx[b]).i;
const names = (w, p) => p.map(i => w.name(i)).join('>');
const first = (ev, type) => { const e = ev.find(x => x[0] === type); return e ? e[1] : null; };
/** 列出 s 到 t 的所有簡單路徑（只走通的線、主機不轉送） */
function allPaths(net, s, t) {
  const out = [];
  (function go(u, path, seen) {
    if (u === t) { out.push(path.slice()); return; }
    if (net.nodes[u].host && u !== s) return;
    R.nbrs(net, u).forEach(e => { if (!seen[e.v]) { seen[e.v] = true; path.push(e.v); go(e.v, path, seen); path.pop(); seen[e.v] = false; } });
  })(s, [s], { [s]: true });
  return out;
}
function bfsHops(net, s, t) {
  const d = {}; d[s] = 0; const q = [s];
  while (q.length) { const u = q.shift(); if (net.nodes[u].host && u !== s) continue; R.nbrs(net, u).forEach(e => { if (d[e.v] == null) { d[e.v] = d[u] + 1; q.push(e.v); } }); }
  return d[t] == null ? Infinity : d[t];
}
function randomCuts(net, rand, k) {
  const rl = net.links.filter(l => !l.access);
  for (let i = 0; i < k; i++) rl[Math.floor(rand() * rl.length)].up = false;
}

console.log('網路資料');
test('三種網路：主機各接一台路由器，延遲都是 1–20 的整數，城市網路不切斷時任何一條線斷掉都還連得通', () => {
  R.NET_IDS.forEach(id => {
    const net = R.buildNet(id);
    assert.ok(net.gw[net.pc] && net.gw[net.sv], id);
    net.links.forEach(l => assert.ok(Number.isInteger(l.cost) && l.cost >= 1 && l.cost <= 20));
    net.nodes.filter(n => n.host).forEach(h => assert.strictEqual(R.nbrs(net, h.i).length, 1));
    net.links.filter(l => !l.access).forEach(l => { l.up = false; assert.ok(R.connected(net, net.pc, net.sv), id + ' 斷 ' + l.i); l.up = true; });
  });
});
test('城市網路的設計：OSPF（延遲）與 RIP（跳數）選不同的路，而且最短延遲的路只有一條', () => {
  const net = R.buildNet('city');
  const ls = R.bestPath(net, 'ls'), dv = R.bestPath(net, 'dv');
  assert.strictEqual(names({ name: i => net.nodes[i].id }, ls.path), 'PC>R1>R4>R3>R6>R7>R8>SV');
  assert.strictEqual(names({ name: i => net.nodes[i].id }, dv.path), 'PC>R1>R2>R5>R8>SV');
  const ds = allPaths(net, net.pc, net.sv).map(p => R.pathDelay(net, p)).sort((a, b) => a - b);
  assert.strictEqual(ds[0], 13); assert.ok(ds[1] > 13);
  assert.strictEqual(R.pathDelay(net, dv.path), 19);
});

console.log('連結狀態（Dijkstra）');
test('每對節點的最短延遲 = 暴力枚舉所有簡單路徑的最小值（三種網路，各隨機切斷 0–3 條線 60 次）', () => {
  const rand = R.rng(7);
  R.NET_IDS.forEach(id => {
    for (let trial = 0; trial < 60; trial++) {
      const net = R.buildNet(id);
      randomCuts(net, rand, trial % 4);
      net.links.forEach(l => { if (rand() < 0.3) l.cost = 1 + Math.floor(rand() * 20); });
      const ls = R.lsTables(net);
      net.routers.forEach(r => net.nodes.forEach(t => {
        if (t.i === r) return;
        const ps = allPaths(net, r, t.i);
        const best = ps.length ? Math.min.apply(null, ps.map(p => R.pathDelay(net, p))) : Infinity;
        assert.strictEqual(ls.dist[r][t.i], best, id + ' ' + r + '→' + t.i);
      }));
    }
  });
});
test('照路由表的「下一站」一站一站走，一定走到目的地，延遲加起來等於最短距離（不會繞圈）', () => {
  R.NET_IDS.forEach(id => {
    const net = R.buildNet(id), ls = R.lsTables(net);
    net.routers.forEach(r => net.nodes.forEach(t => {
      if (t.i === r) return;
      let u = r, sum = 0, steps = 0;
      while (u !== t.i && steps++ < 30) { const v = ls.next[u][t.i]; sum += R.linkBetween(net, u, v).cost; u = v; if (net.nodes[u].host && u !== t.i) break; }
      assert.strictEqual(u, t.i); assert.strictEqual(sum, ls.dist[r][t.i]);
    }));
  });
});

console.log('距離向量（RIP 式）');
test('從冷啟動一輪一輪交換：收斂後每台路由器的距離 = 廣度優先搜尋的最少跳數，輪數不超過網路直徑 + 1', () => {
  R.NET_IDS.forEach(id => {
    const net = R.buildNet(id), dv = R.dvCold(net);
    let rounds = 0;
    while (!dv.converged && rounds < 30) { R.dvRound(net, dv, true); rounds++; }
    let diam = 0;
    net.routers.forEach(r => net.nodes.forEach(t => { if (t.i !== r) { const h = bfsHops(net, r, t.i); diam = Math.max(diam, h); assert.strictEqual(dv.metric[r][t.i], h, id); } }));
    assert.ok(rounds <= diam + 1, id + ' rounds=' + rounds + ' diam=' + diam);
  });
});
test('收斂後照下一站走不會繞圈，跳數等於表上的距離', () => {
  const net = R.buildNet('grid'), dv = R.dvCold(net);
  for (let k = 0; k < 20; k++) R.dvRound(net, dv, true);
  net.routers.forEach(r => net.nodes.forEach(t => {
    if (t.i === r) return;
    let u = r, hops = 0;
    while (u !== t.i && hops < 20) { u = R.dvNextOf(net, dv, u, t.i); hops++; }
    assert.strictEqual(u, t.i); assert.strictEqual(hops, dv.metric[r][t.i]);
  }));
});
test('計數到無限大：切斷伺服器的線、不用水平分割，各路由器到伺服器的距離一輪一輪往上數，最後全部是 16', () => {
  const net = R.buildNet('city'), dv = R.dvCold(net);
  for (let k = 0; k < 10; k++) R.dvRound(net, dv, false);
  const l = net.links[net.gw[net.sv].link];
  l.up = false; R.dvLinkChange(net, dv, l);
  let maxClimb = 0, rounds = 0;
  const seen = [];
  while (!dv.converged && rounds < 40) { const r = R.dvRound(net, dv, false); maxClimb = Math.max(maxClimb, r.climb); seen.push(dv.metric[net.idx.R1][net.sv]); rounds++; }
  net.routers.forEach(r => assert.strictEqual(dv.metric[r][net.sv], R.INF));
  assert.ok(maxClimb >= 4, '最長連續上升 ' + maxClimb);
  // R1 的距離是一路往上數的（中間沒有直接跳到 16）
  const climbs = seen.filter((v, i) => i && v > seen[i - 1]).length;
  assert.ok(climbs >= 4, 'R1：' + seen.join(','));
});
test('水平分割（毒性逆轉）擋住兩台路由器之間的迴圈：切斷 R5–R8 後交換一輪，關掉時 R1、R2 互指，打開時沒有迴圈', () => {
  const run = split => {
    const net = R.buildNet('city'), dv = R.dvCold(net);
    for (let k = 0; k < 10; k++) R.dvRound(net, dv, split);
    const l = R.linkBetween(net, net.idx.R5, net.idx.R8);
    l.up = false; R.dvLinkChange(net, dv, l);
    R.dvRound(net, dv, split);
    return R.followPath(net, (r, d) => R.dvNextOf(net, dv, r, d));
  };
  const off = run(false), on = run(true);
  assert.ok(off.loop, '關掉水平分割應該有迴圈');
  assert.ok(!on.loop, '打開水平分割不應該有迴圈');
});
test('距離向量只看跳數：改延遲不影響距離向量的路，只影響連結狀態的路', () => {
  const net = R.buildNet('city');
  const before = R.bestPath(net, 'dv').path.join(',');
  R.linkBetween(net, net.idx.R2, net.idx.R5).cost = 20;
  assert.strictEqual(R.bestPath(net, 'dv').path.join(','), before);
  R.linkBetween(net, net.idx.R1, net.idx.R4).cost = 20;
  assert.notStrictEqual(R.bestPath(net, 'ls').path.join(','), 'PC,R1,R4,R3,R6,R7,R8,SV');
});

console.log('封包與儲存轉送');
test('切封包：封包數 = ⌈M ÷ k⌉，依序接起來就是原訊息；只留可列印的 ASCII', () => {
  for (let M = 1; M <= 48; M++) for (let k = 1; k <= 16; k++) {
    const s = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, M);
    const parts = R.split(s, k);
    assert.strictEqual(parts.length, Math.ceil(M / k));
    assert.strictEqual(parts.join(''), s);
  }
  assert.strictEqual(R.cleanMsg('Hi 你好！\tOK~'), 'Hi OK~');
  assert.strictEqual(R.cleanMsg('x'.repeat(100)).length, R.MSG_MAX);
});
test('儲存轉送公式：1 個封包走 N 條線 = N·L/R + Σd；P 個一樣大的封包 = (N + P − 1)·L/R + Σd', () => {
  const props = [1, 2, 2, 3, 2, 2, 1];
  [1, 2, 3, 4, 6, 8, 12].forEach(k => {
    const M = 24, P = M / k, L = R.HEADER + k;
    assert.ok(near(R.theoryTime(props, M, k), R.pipelineFormula(props, P, L)), 'k=' + k);
  });
  assert.ok(near(R.theoryTime(props, 23, 23), 7 * (R.HEADER + 23) / R.RATE + 13));
});
test('模擬的送達時間 = 理論時間（三種網路的最短路、k = 1–16、訊息長度 1–48 抽樣）', () => {
  R.NET_IDS.forEach(id => {
    for (let k = 1; k <= 16; k++) for (const M of [1, 7, 23, 48]) {
      const { w, ev } = world(id);
      const msg = 'x'.repeat(M);
      const path = w.currentPath().path;
      const props = []; for (let i = 1; i < path.length; i++) props.push(R.linkBetween(w.net, path[i - 1], path[i]).cost);
      w.send({ msg, k, ttl: 16 }); w.advance(2000);
      const d = first(ev, 'delivered');
      assert.ok(d, id + ' k=' + k + ' M=' + M);
      assert.ok(near(d.time, R.theoryTime(props, M, k), 1e-6), id + ' k=' + k + ' M=' + M + ' ' + d.time);
    }
  });
});
test('城市網路的預設訊息（23 字）：最快的每包字數是 4（36.75 ms），預設 5 字是 37.25 ms', () => {
  const b = R.bestSizes([1, 2, 2, 3, 2, 2, 1], 23);
  assert.deepStrictEqual(b.ks, [4]); assert.ok(near(b.time, 36.75));
  assert.ok(near(R.theoryTime([1, 2, 2, 3, 2, 2, 1], 23, 5), 37.25));
});

console.log('TTL');
test('每經過一台路由器 TTL 減 1：抵達時的 TTL = 出發的 TTL − 經過的路由器數', () => {
  for (let ttl = 7; ttl <= 32; ttl += 5) {
    const { w, ev } = world('city');
    w.send({ msg: MSG, k: 5, ttl }); w.advance(500);
    const d = first(ev, 'delivered');
    assert.strictEqual(d.hops, 6); assert.strictEqual(d.ttlMin, ttl - 6); assert.strictEqual(d.ttlMax, ttl - 6);
  }
});
test('TTL = 路由器數 + 1 時剛好抵達（剩 1）；TTL = 路由器數時在最後一台路由器被丟掉', () => {
  let { w, ev } = world('city');
  w.send({ msg: MSG, k: 5, ttl: 7 }); w.advance(200);
  assert.strictEqual(first(ev, 'delivered').ttlMax, 1);
  ({ w, ev } = world('city'));
  w.send({ msg: MSG, k: 5, ttl: 6 }); w.advance(90);
  const drops = ev.filter(e => e[0] === 'dropped');
  assert.ok(drops.length >= 5 && drops.every(e => e[1].reason === 'ttl' && e[1].at === 'R8'));
  assert.ok(!first(ev, 'delivered'));
});
test('每個封包最後不是抵達目的地，就是在半路被丟掉（一個都不會憑空消失或重複）', () => {
  const rand = R.rng(99);
  for (let trial = 0; trial < 40; trial++) {
    const { w, fx } = world(R.NET_IDS[trial % 3]);
    w.setAlgo(trial % 2 ? 'dv' : 'ls');
    w.advance(30);
    w.send({ msg: MSG, k: 1 + Math.floor(rand() * 8), ttl: 3 + Math.floor(rand() * 14), loss: rand() * 0.3 });
    for (let s = 0; s < 30; s++) {
      w.advance(rand() * 15);
      if (rand() < 0.25) { const l = w.net.links[Math.floor(rand() * w.net.links.length)]; w.setLink(l.i, !l.up); }
    }
    w.advance(5000);
    const ends = {};
    fx.forEach(f => { if (f.p && (f.kind === 'hostArrive' || f.kind === 'drop' || f.kind === 'lost')) { assert.ok(!ends[f.p.id], '封包 ' + f.p.id + ' 結束兩次'); ends[f.p.id] = 1; } });
    assert.strictEqual(w.pkts.length, 0);
    assert.strictEqual(Object.keys(ends).length, w.pid, '建立 ' + w.pid + ' 個、結束 ' + Object.keys(ends).length + ' 個');
  }
});

console.log('遺失、重送與重組');
test('遺失率 20%：訊息仍完整重組；每個遺失的資料封包都被重送；同一個種子結果完全相同', () => {
  const runOnce = () => {
    const { w, ev } = world('city');
    w.send({ msg: MSG, k: 3, ttl: 16, loss: 0.2 }); w.advance(5000);
    return { w, ev };
  };
  const a = runOnce(), b = runOnce();
  assert.strictEqual(JSON.stringify(a.ev), JSON.stringify(b.ev));
  const fin = first(a.ev, 'finished') || first(a.ev, 'failed');
  assert.ok(fin);
  const d = first(a.ev, 'delivered');
  if (d) { assert.ok(d.retx >= d.lostData, 'retx ' + d.retx + ' lost ' + d.lostData); assert.strictEqual(a.w.job.text, MSG); }
});
test('遺失率 p：大量傳送時，資料封包在路上遺失的比例接近 p（誤差在 4 個標準差內）', () => {
  [0.1, 0.3].forEach(q => {
    let sent = 0, lost = 0;
    for (let n = 0; n < 150; n++) {
      const { w } = world('city');
      w.seedBase = 5000 + n * 7;
      w.send({ msg: MSG, k: 2, ttl: 16, loss: q }); w.advance(8000);
      sent += w.job.sent; lost += w.job.lostData;
    }
    const f = lost / sent, sd = Math.sqrt(q * (1 - q) / sent);
    assert.ok(Math.abs(f - q) < 4 * sd, 'p=' + q + ' 實際 ' + f.toFixed(3) + '（' + sent + ' 包）');
  });
});
test('不同的種子（第幾次傳送）遺失的封包不同', () => {
  const { w, ev } = world('city');
  const sig = [];
  for (let k = 0; k < 6; k++) { ev.length = 0; w.send({ msg: MSG, k: 3, ttl: 16, loss: 0.2 }); w.advance(3000); const d = first(ev, 'delivered'); sig.push(d ? d.lostData + '/' + d.retx : 'x'); }
  assert.ok(new Set(sig).size > 1, sig.join(' '));
});
test('第一個確認回來後，逾時時間 RTO = 2 × 量到的往返時間（之後依 SRTT = 0.875 SRTT + 0.125 RTT 平滑）', () => {
  const { w } = world('city');
  w.send({ msg: 'abcd', k: 4, ttl: 16 });
  assert.strictEqual(w.job.rto, R.RTO_INIT);
  w.advance(300);
  // 一包、7 條線：去程 7×2 + 13 = 27 ms，確認 7×1 + 13 = 20 ms，往返 47 ms
  assert.ok(near(w.job.srtt, 47)); assert.ok(near(w.job.rto, 94));
});
test('封包在線上時切斷那條線：它遺失（原因「斷線」），連結狀態立刻改道，重送後訊息仍送達', () => {
  const { w, ev } = world('city');
  w.send({ msg: MSG, k: 5, ttl: 16 });
  w.advance(9);
  const busy = w.pkts.find(p => p.kind === 'data' && p.where && !w.net.links[p.where.link].access);
  assert.ok(busy);
  w.setLink(busy.where.link, false);
  w.advance(3000);
  const d = first(ev, 'delivered');
  assert.ok(d && d.lost.cut >= 1 && d.retx >= 1);
  assert.strictEqual(w.job.text, MSG);
});
test('改道造成亂序：接收端記下亂序的封包，依序號重組回原來的訊息', () => {
  const { w, ev } = world('city');
  w.setLink(L(w, 'R1', 'R4'), false);
  w.send({ msg: MSG, k: 5, ttl: 16 }); w.advance(10);
  w.setCost(L(w, 'R3', 'R6'), 20);
  w.advance(3000);
  const d = first(ev, 'delivered');
  assert.ok(d.ooo >= 1 && d.paths >= 2, JSON.stringify(d));
  assert.strictEqual(w.job.text, MSG);
});
test('網路被切成兩半：封包全部送不到，同一包重送 MAX_RETX 次後放棄；最少要剪的線數與暴力枚舉相同', () => {
  const { w, ev } = world('city');
  w.setLink(L(w, 'R2', 'R5'), false); w.setLink(L(w, 'R3', 'R6'), false);
  w.send({ msg: MSG, k: 5, ttl: 16 }); w.advance(5000);
  const f = first(ev, 'failed');
  assert.ok(f && f.partition && !f.accessCut && f.routerCuts === 2 && f.minCut === 2 && !f.delivered);
  assert.ok(!first(ev, 'delivered'));
  assert.ok(w.job.retx >= R.MAX_RETX && w.job.attempts.some(a => a === R.MAX_RETX + 1));
  // 暴力：最少剪幾條路由器之間的線，PC 和 SV 就不通
  R.NET_IDS.forEach(id => {
    const net = R.buildNet(id), rl = net.links.filter(l => !l.access);
    let best = Infinity;
    const n = rl.length;
    for (let mask = 1; mask < (1 << n); mask++) {
      let c = 0; for (let i = 0; i < n; i++) if (mask & (1 << i)) c++;
      if (c >= best) continue;
      rl.forEach((l, i) => { l.up = !(mask & (1 << i)); });
      if (!R.connected(net, net.pc, net.sv)) best = c;
    }
    rl.forEach(l => { l.up = true; });
    assert.strictEqual(R.minCut(net, net.gw[net.pc].router, net.gw[net.sv].router), best, id);
  });
});

console.log('追蹤路由');
test('追蹤路由依序列出路徑上的每台路由器，最後一行是伺服器；行數 = 路由器數 + 1，往返時間一站比一站長', () => {
  R.NET_IDS.forEach(id => ['ls', 'dv'].forEach(algo => {
    const { w, ev, fx } = world(id);
    w.setAlgo(algo); w.advance(100);
    const path = w.currentPath().path;
    w.trace({}); w.advance(3000);
    const t = first(ev, 'trace');
    assert.ok(t.reached);
    assert.strictEqual(t.names.join('>'), names(w, path.slice(1)));
    assert.strictEqual(t.lines, path.length - 1);
    const rtts = fx.filter(f => f.kind === 'traceLine').map(f => f.line.rtt);
    rtts.forEach((r, i) => { if (i) assert.ok(r > rtts[i - 1]); });
  }));
});
test('路由迴圈時，追蹤路由會看到同一台路由器出現兩次以上', () => {
  const { w, ev } = world('city');
  w.setAlgo('dv'); w.advance(100); w.setSplit(false); w.setAuto(false);
  w.setLink(L(w, 'R5', 'R8'), false); w.dvExchange(true);
  w.trace({}); w.advance(5000);
  const t = first(ev, 'trace');
  assert.ok(t.repeat && !t.reached, JSON.stringify(t));
});

console.log('收斂後走最短路徑');
test('連結狀態：送達的路徑延遲 = 所有路徑中最小的；距離向量（收斂後）：跳數 = 最少跳數', () => {
  R.NET_IDS.forEach(id => {
    let { w, ev } = world(id);
    w.send({ msg: MSG, k: 5, ttl: 16 }); w.advance(1000);
    let d = first(ev, 'delivered');
    const ps = allPaths(w.net, w.net.pc, w.net.sv);
    assert.strictEqual(d.pathDelay, Math.min.apply(null, ps.map(p => R.pathDelay(w.net, p))));
    ({ w, ev } = world(id));
    w.setAlgo('dv'); w.advance(100);
    w.send({ msg: MSG, k: 5, ttl: 16 }); w.advance(1000);
    d = first(ev, 'delivered');
    assert.strictEqual(d.hops + 1, bfsHops(w.net, w.net.pc, w.net.sv));
  });
});
test('距離向量沒收斂前切斷線，封包可能在迴圈裡繞到 TTL 歸零；交換到收斂後就不再繞圈', () => {
  const { w, ev } = world('city');
  w.setAlgo('dv'); w.advance(100); w.setSplit(false); w.setAuto(false);
  w.setLink(L(w, 'R5', 'R8'), false); w.dvExchange(true);
  w.send({ msg: MSG, k: 5, ttl: 16 }); w.advance(300);
  assert.ok(ev.some(e => e[0] === 'dropped' && e[1].reason === 'ttl' && e[1].looped));
  for (let k = 0; k < 10; k++) w.dvExchange(true);
  ev.length = 0;
  w.send({ msg: MSG, k: 5, ttl: 16 }); w.advance(300);
  const d = first(ev, 'delivered');
  assert.ok(d && !d.looped && d.hops + 1 === bfsHops(w.net, w.net.pc, w.net.sv));
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '（有失敗）' : ''));
