/* 任務可達成的證明腳本。用法：node tools/mission-proofs/packet-routing.js
 * 用計算核心（js/packet-routing-core.js 的 World）模擬頁面（js/packet-routing.js）的操作與送出的事件，證明：
 *   1. 每個任務都做得到（印出解法）；2. 預設狀態不觸發；3. 十個隱藏任務的解法不會順便完成另一個隱藏任務（交叉檢查表）；
 *   4. 靠運氣的做法平均要試幾次；5. 固定種子的亂按模擬（400 人 × 每人 300 個操作），每個任務被碰巧完成的比例。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const R = require(ROOT + 'js/packet-routing-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/packet-routing.js');
const byId = id => missions.find(m => m.id === 'packet-routing-' + id);
const hidden = missions.filter(m => m.hidden);
const MSG = 'Hello from Astro Ni Lab';
const MISSION_EVENTS = { delivered: 1, finished: 1, failed: 1, dropped: 1, trace: 1, dv: 1 };

// ---------- 與頁面相同的操作與時間 ----------
// 頁面：1 倍速時每真實秒走 8 模擬毫秒；網路上沒有封包、也沒有距離向量在自動交換（只剩逾時計時器）時快轉 8 倍。
const MS_PER_SEC = 8, IDLE_FF = 8;
class Page {
  constructor() {
    this.w = new R.World('city');
    this.msg = MSG; this.k = 5; this.ttl = 16; this.loss = 0; this.speed = 1; this.paused = false; this.link = 0;
    this.ev = [];
    this.w.on((t, d) => { if (MISSION_EVENTS[t]) this.ev.push({ type: t, data: d }); });
  }
  L(a, b) { const n = this.w.net; return R.linkBetween(n, n.idx[a], n.idx[b]).i; }
  // ----- 按鈕 -----
  send() { this.w.send({ msg: this.msg, k: this.k, ttl: this.ttl, loss: this.loss / 100 }); return this; }
  trace() { this.w.trace({ loss: this.loss / 100 }); return this; }
  exchange() { this.w.dvExchange(true); return this; }
  algo(a) { this.w.setAlgo(a); return this; }
  auto(on) { this.w.setAuto(on); return this; }
  split(on) { this.w.setSplit(on); return this; }
  net(id) { this.w.reset(id); this.link = 0; return this; }
  cut(a, b) { this.w.setLink(this.L(a, b), false); return this; }
  join(a, b) { this.w.setLink(this.L(a, b), true); return this; }
  toggle(i) { const l = this.w.net.links[i]; this.w.setLink(i, !l.up); return this; }
  cost(a, b, c) { this.w.setCost(this.L(a, b), c); return this; }
  restoreAll() { this.w.restoreAll(); return this; }
  clearAll() { this.w.cancelJob(); return this; }
  step() { this.paused = true; this.w.stepEvent(); return this; }
  set(o) { Object.assign(this, o); return this; }
  // ----- 時間 -----
  /** 真實時間過了 sec 秒（照頁面的速度與快轉規則） */
  real(sec) {
    if (this.paused) return this;
    for (let t = 0; t < sec - 1e-9; t += 1 / 30) {
      const ff = !this.w.busyNet() && !this.w.dvPending ? IDLE_FF : 1;
      this.w.advance(Math.min(1 / 30, sec - t) * MS_PER_SEC * this.speed * ff);
    }
    return this;
  }
  /** 直接讓模擬時間過 ms 毫秒（解法用） */
  ms(ms) { this.w.advance(ms); return this; }
  /** 等到沒有事件（或最多 ms 毫秒） */
  settle(ms) { const end = this.w.t + (ms || 3000); while (this.w.evq.length && this.w.nextEventTime() <= end) this.w.advance(Math.min(50, end - this.w.t)); return this; }
  converge() { for (let k = 0; k < 60 && this.w.dv && !this.w.dv.converged; k++) this.ms(R.DV_PERIOD); return this.ms(1); }
}
const run = (m, events) => { m.mem = {}; return events.some(e => { try { return !!m.check(e, m.mem); } catch (err) { return false; } }); };

let fail = 0;
function expect(id, page, want, note) {
  const m = byId(id);
  const got = run(m, page.ev);
  const pass = got === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? ' 達成：' : ' 不觸發：') + note);
  return page;
}
const P = () => new Page();
const firstOf = (p, t) => { const e = p.ev.find(x => x.type === t); return e ? e.data : null; };

// ---------- 1. 預設狀態 ----------
console.log('預設狀態（城市網路、連結狀態、訊息 "' + MSG + '"、每包 5 字、TTL 16）：');
{
  const p = P().real(10);
  const hit = missions.filter(m => run(m, p.ev)).map(m => m.id);
  if (hit.length || p.ev.length) { fail++; console.log('  ✗ 沒有操作卻有事件或任務：' + hit.join('、')); } else console.log('  ✓ 停留 10 秒：沒有任何事件、沒有任務被觸發');
  const q = P().send().real(10).trace().real(20);
  const hh = hidden.filter(m => run(m, q.ev)).map(m => m.id);
  if (hh.length) { fail++; console.log('  ✗ 預設值傳送與追蹤路由觸發了隱藏任務 ' + hh.join('、')); } else console.log('  ✓ 用預設值「傳送訊息」與「追蹤路由」不觸發任何隱藏任務');
  const d = firstOf(q, 'delivered');
  console.log('    （預設：走 ' + d.path + '，' + d.hops + ' 台路由器、延遲和 ' + d.pathDelay + ' ms，' + d.P + ' 包，' + d.time + ' ms 送達；最快的每包字數 ' + d.bestKs.join('、') + '）');
}

// ---------- 2. 公開任務 ----------
console.log('\n公開任務：');
expect(1, P().send().settle(), true, '按「傳送訊息」');
expect(2, P().trace().settle(), true, '按「追蹤路由」');
{
  const p = P().auto(false).algo('dv');
  let n = 0; while (!p.w.dv.converged && n < 20) { p.exchange(); n++; }
  expect(3, p, true, '先取消「自動交換」再選距離向量，按「交換一輪」' + n + ' 次後不再改變');
  expect(3, P().algo('dv').real(8).auto(false).exchange().exchange(), false, '自動交換已經收斂後才按「交換一輪」');
}
expect(4, P().cut('R1', 'R4').send().settle(), true, '切斷 R1–R4（原本的路上），再傳送');
expect(4, P().cut('R2', 'R5').send().settle(), false, '切斷 R2–R5（不在原本的路上）');
expect(5, P().set({ ttl: 3 }).send().settle(), true, 'TTL = 3（路上有 6 台路由器）');
{
  const p = P().send().ms(9);
  const busy = p.w.pkts.find(x => x.kind === 'data' && x.where && !p.w.net.links[x.where.link].access);
  p.toggle(busy.where.link).settle();
  expect(6, p, true, '傳送後 9 ms，切斷正有封包在上面的 ' + R.NETWORKS.city.links[busy.where.link].slice(0, 2).join('–'));
  expect(7, p, true, '同上（改道後重送的那包比後面的晚到）');
}
expect(8, P().send().settle().algo('dv').converge().send().settle(), true, '連結狀態送一次（走 R4、R3、R6、R7），距離向量收斂後送一次（走 R2、R5）');
expect(9, P().set({ ttl: 7 }).send().settle(), true, 'TTL = 7（6 台路由器 + 1）');
expect(9, P().set({ ttl: 8 }).send().settle(), false, 'TTL = 8（剩 2）');
expect(10, P().cut('R2', 'R5').cut('R3', 'R6').send().settle(), true, '切斷 R2–R5、R3–R6 後傳送，重送 4 次後放棄');
expect(10, P().cut('R8', 'SV').send().settle(), false, '只切斷伺服器的線（不算）');
expect(11, P().algo('dv').converge().split(false).auto(false).cut('R5', 'R8').exchange().send().settle(), true, '距離向量收斂後，取消水平分割與自動交換，切斷 R5–R8，交換一輪（R1、R2 互指），傳送');
{
  const p = P();
  [3, 4, 5].forEach(k => p.set({ k }).send().settle());
  expect(12, p, true, '每包字數 3、4、5 各送一次（最快是 4：36.75 ms）');
  const q = P();
  [5, 6, 7].forEach(k => q.set({ k }).send().settle());
  expect(12, q, false, '只試 5、6、7（沒有試到最快的 4）');
}

// ---------- 3. 隱藏任務 ----------
console.log('\n隱藏任務（解法與交叉檢查）：');
const sol = {
  h1: () => P().set({ msg: 'Hello, world', k: 4 }).send().settle(),
  h2: () => P().cost('R2', 'R5', 14).algo('dv').converge().send().settle(),
  h3: () => P().algo('dv').converge().cost('R1', 'R2', 20).cost('R2', 'R5', 20).cost('R5', 'R8', 20).send().settle(),
  h4: () => P().algo('dv').converge().split(false).auto(false).cut('R5', 'R8').exchange().send().ms(20).exchange().settle(),
  h5: () => P().cut('R1', 'R3').cut('R1', 'R4').cut('R2', 'R5').cut('R6', 'R8').cut('R7', 'R8').send().settle(),
  h6: () => P().cut('R1', 'R4').send().ms(10).cost('R3', 'R6', 20).settle(),
  h7: () => P().algo('dv').converge().split(false).cut('R8', 'SV').converge().settle(),
  h8: () => P().cut('R2', 'R5').cut('R3', 'R6').send().settle(),
  h9: () => { const p = P().set({ msg: 'LOGIN', k: 1 }).send(); while (p.w.job.text.length < 2) p.w.stepEvent(); return p.cut('R8', 'SV').settle(); },
  h10: () => P().algo('dv').converge().split(false).auto(false).cut('R5', 'R8').exchange().trace().settle()
};
const notes = {
  h1: '訊息改成 "Hello, world"（12 字）、每包字數 4：每包 4 字元的資料 + 4 位元組的表頭',
  h2: 'R2–R5 延遲改成 14，選距離向量：走 R2、R5（4 台），延遲 26 = 2 × 13（連結狀態的最短延遲）',
  h3: '距離向量，R1–R2、R2–R5、R5–R8 延遲都改成 20：往返超過 100 ms 的初始逾時，沒遺失也重送',
  h4: '距離向量收斂後取消水平分割與自動交換，切斷 R5–R8，交換一輪（R1↔R2 迴圈），傳送，20 ms 後再交換一輪',
  h5: '切斷 R1–R3、R1–R4、R2–R5、R6–R8、R7–R8：只剩 R1 R2 R4 R3 R6 R7 R5 R8 這條路',
  h6: '切斷 R1–R4，傳送後 10 ms 把 R3–R6 延遲改成 20：前面的封包被改道繞遠路，最後一包最先到',
  h7: '距離向量收斂後取消水平分割，切斷 R8–SV，讓它自動交換到收斂',
  h8: '切斷 R2–R5、R3–R6（最小割 = 2）後傳送，放棄',
  h9: '訊息 "LOGIN"、每包 1 字，L、O 到達後（可用「暫停」「單步」）切斷 R8–SV',
  h10: '同 h4 的迴圈（切斷 R5–R8、交換一輪）後按「追蹤路由」：R1 R2 R1 R2 …'
};
const table = ['         ' + hidden.map(m => m.id.replace('packet-routing-', '').padStart(4)).join('')];
hidden.forEach(m => {
  const key = m.id.replace('packet-routing-', '');
  const p = sol[key]();
  const row = hidden.map(o => run(o, p.ev));
  const self = row[hidden.indexOf(m)];
  const others = hidden.filter((o, i) => o !== m && row[i]).map(o => o.id);
  if (!self || others.length) fail++;
  console.log((self && !others.length ? '  ✓ ' : '  ✗ ') + key.padEnd(4) + ' 達成：' + notes[key] + (others.length ? '（✗ 順便完成 ' + others.join('、') + '）' : ''));
  table.push('  ' + key.padEnd(5) + '  ' + row.map(x => (x ? '●' : '·').padStart(4)).join(''));
  if (key === 'h6') { const d = firstOf(p, 'delivered'); console.log('        到達順序第一包是第 ' + (d.firstSeq + 1) + ' 包（共 ' + d.P + ' 包），亂序 ' + d.ooo + ' 次'); }
  if (key === 'h7') { const mx = Math.max.apply(null, p.ev.filter(e => e.type === 'dv').map(e => e.data.climbSv)); console.log('        到伺服器的距離連續上升 ' + mx + ' 輪才到 16'); }
});
// 反例：條件邊界
console.log('  反例：');
expect('h1', P().set({ k: 4 }).send().settle(), false, '預設訊息（23 字）每包 4 字：最後一包只有 3 字');
expect('h2', P().algo('dv').converge().send().settle(), false, '沒改延遲：距離向量 19 ms，不是 26');
expect('h3', P().algo('dv').converge().set({ loss: 30 }).send().settle(3000), false, '遺失率 30% 造成的重送（真的有遺失）');
expect('h4', P().algo('dv').converge().send().ms(9).cut('R5', 'R8').settle(), false, '傳送中才切斷（連線改變）');
expect('h7', P().algo('dv').converge().cut('R8', 'SV').converge().settle(), false, '水平分割開著（三台以上的迴圈仍會慢慢數，但不算）');
expect('h8', P().net('ring').cut('R2', 'R3').cut('R5', 'R6').send().settle(), false, '環狀網路（任兩刀分在兩邊就斷）不算');
expect('h8', P().cut('R2', 'R5').cut('R3', 'R6').cut('R1', 'R2').send().settle(), false, '多剪一刀 R1–R2');
expect('h10', P().algo('dv').converge().cut('R5', 'R8').trace().settle(), false, '水平分割開著：沒有兩台互指的迴圈');
console.log('\n十個隱藏任務的交叉檢查（列：用該任務的解法；欄：完成了哪些任務）：');
table.forEach(l => console.log('  ' + l));

// ---------- 4. 靠運氣的做法 ----------
console.log('\n靠運氣的做法（固定種子，各 400 次）：');
{
  // h9 的另一種做法：遺失率 30%、每包 1 字傳 "LOGIN"，等到剛好只收到 L、O 就放棄
  let ok = 0, n = 400, fails = 0;
  for (let i = 0; i < n; i++) {
    const p = P().set({ msg: 'LOGIN', k: 1, loss: 30 });
    p.w.seedBase = 9000 + i * 13;
    p.send().settle(5000);
    if (firstOf(p, 'failed')) fails++;
    if (run(byId('h9'), p.ev)) ok++;
  }
  console.log('  h9  遺失率 30%、每包 1 字傳 LOGIN：放棄的機率 ' + (fails / n * 100).toFixed(1) + '%，剛好停在 "LO" 的機率 ' + (ok / n * 100).toFixed(2) + '%' + (ok ? '（平均約 ' + Math.round(n / ok) + ' 次）' : '（幾乎不可能，要用切斷）'));
  let ok2 = 0;
  for (let i = 0; i < n; i++) {
    const p = P().set({ loss: 30 });
    p.w.seedBase = 7000 + i * 17;
    p.send().settle(5000);
    if (run(byId(7), p.ev)) ok2++;
  }
  console.log('  公開 7（亂序）用遺失率 30% 碰運氣：每次成功的機率 ' + (ok2 / n * 100).toFixed(1) + '%（平均約 ' + (n / Math.max(1, ok2)).toFixed(1) + ' 次）');
}

// ---------- 5. 亂按模擬 ----------
// 照試玩工具的權重：按鈕 30、滑桿 25（20% 拉到最小、20% 拉到最大）、數字欄 10（極端值）、勾選 8、下拉選單 8、畫布 15（30% 點、70% 拖曳）、等 1 秒 4。
// 一般操作之間約 0.35 秒。畫布有三個（網路圖、封包列、時間圖），只有點在網路圖的連線上才會切斷或接回。
console.log('\n亂按模擬：400 人 × 每人 300 個操作（固定種子；按鈕 30、滑桿 25、數字欄 10、勾選 8、選單 8、畫布 15、等待 4）：');
{
  const rand = R.rng(20261112);
  const pick = a => a[Math.floor(rand() * a.length)];
  const CW = 800, CH = 450;
  function tapCanvas(p) {
    const x = (0.05 + 0.9 * rand()) * CW, y = (0.05 + 0.9 * rand()) * CH;
    const net = p.w.net;
    const pos = n => [n.x * CW, (0.06 + 0.88 * n.y) * CH];
    for (const n of net.nodes) { const q = pos(n); if (Math.hypot(q[0] - x, q[1] - y) < 24) return; }   // 點到路由器：只是選它看路由表
    for (const l of net.links) {
      const a = pos(net.nodes[l.a]), b = pos(net.nodes[l.b]);
      const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
      if (Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y) < 14) { p.link = l.i; p.toggle(l.i); return; }
    }
  }
  const SL = {
    speed: [0.25, 4, v => { p0.speed = v; }],
    k: [1, 16, v => { p0.k = Math.round(v); }],
    ttl: [1, 32, v => { p0.ttl = Math.round(v); }],
    loss: [0, 30, v => { p0.loss = Math.round(v); }],
    cost: [1, 20, v => { p0.w.setCost(p0.link, Math.round(v)); }]
  };
  let p0 = null;
  const W = { button: 30, range: 25, num: 10, check: 8, select: 8, canvas: 15, wait: 4 };
  const kinds = Object.keys(W), tot = kinds.reduce((s, k) => s + W[k], 0);
  const BUTTONS = ['send', 'trace', 'pause', 'step', 'clear', 'exchange', 'cutToggle', 'restoreAll', 'sound', 'ls', 'dv'];
  const STU = 400, STEPS = 300;
  const hits = {}; missions.forEach(m => { hits[m.id] = 0; });
  for (let s = 0; s < STU; s++) {
    const p = p0 = new Page();
    for (let step = 0; step < STEPS; step++) {
      let r = rand() * tot, kind = kinds[0];
      for (const k of kinds) { if (r < W[k]) { kind = k; break; } r -= W[k]; }
      let dt = 0.35;
      if (kind === 'button') {
        const b = pick(BUTTONS);
        if (b === 'send') p.send();
        else if (b === 'trace') p.trace();
        else if (b === 'pause') p.paused = !p.paused;
        else if (b === 'step') p.step();
        else if (b === 'clear') p.clearAll();
        else if (b === 'exchange') p.exchange();
        else if (b === 'cutToggle') p.toggle(p.link);
        else if (b === 'restoreAll') p.restoreAll();
        else if (b === 'ls' || b === 'dv') p.algo(b);
      } else if (kind === 'range' || kind === 'num') {
        const name = pick(Object.keys(SL)), sl = SL[name];
        const m = rand();
        const v = m < 0.2 ? sl[0] : m < 0.4 ? sl[1] : sl[0] + (sl[1] - sl[0]) * (kind === 'num' ? (rand() < 0.5 ? 0 : 1) : rand());
        sl[2](v);
      } else if (kind === 'check') {
        if (rand() < 0.5) p.auto(!p.w.auto); else p.split(!p.w.split);
      } else if (kind === 'select') {
        const which = rand();
        if (which < 1 / 3) p.net(pick(R.NET_IDS));
        else if (which < 2 / 3) p.link = Math.floor(rand() * p.w.net.links.length);
        // 路由器選單只換顯示的路由表
      } else if (kind === 'canvas') {
        if (rand() < 1 / 3 && rand() < 0.3) tapCanvas(p);
      } else dt = 1;
      p.real(dt);
    }
    p.real(30);   // 最後再看 30 秒
    missions.forEach(m => { if (run(m, p.ev)) hits[m.id]++; });
  }
  let worst = 0;
  missions.forEach(m => {
    const f = hits[m.id] / STU;
    if (m.hidden) worst = Math.max(worst, f);
    console.log('  ' + m.id.padEnd(20) + (m.hidden ? '隱藏 ' : '公開 ') + (f * 100).toFixed(2).padStart(6) + '%' + (m.hidden && f >= 0.02 ? '  ✗' : ''));
  });
  if (worst >= 0.02) { fail++; console.log('  ✗ 有隱藏任務被亂按完成的比例達到 2%'); }
  else console.log('  ✓ 每個隱藏任務被亂按完成的比例都在 2% 以下（最高 ' + (worst * 100).toFixed(2) + '%）');
}

console.log(fail ? `\n✗ ${fail} 項不符合` : '\n全部任務都證明做得到，預設狀態不觸發，隱藏任務彼此不連帶完成，亂按誤觸低於 2%。');
if (fail) process.exitCode = 1;
