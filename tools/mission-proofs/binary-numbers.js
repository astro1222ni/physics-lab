/* 任務可達成的證明腳本。用法：node tools/mission-proofs/binary-numbers.js
 * 用計算核心模擬頁面（js/binary-numbers.js 的 setValue）送出的事件，證明：
 *   1. 每個任務都做得到（印出解法）；2. 預設狀態不觸發；3. 十個隱藏任務的解法不會順便完成另一個隱藏任務；
 *   4. 像試玩工具一樣亂按（點燈、+1、−1、×2、÷2、歸零、改位元數與進位），隱藏任務被誤觸的機率。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const B = require(ROOT + 'js/binary-numbers-core.js');
const missions = [];
global.window = { BinaryCore: B, LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/binary-numbers.js');
const byId = id => missions.find(m => m.id === 'binary-numbers-' + id);
const hidden = missions.filter(m => m.hidden);

// ---------- 與頁面相同的事件模擬 ----------
class Sim {
  constructor(n, b) { this.n = n || 8; this.v = 0; this.b = b || 3; this.chain = 0; this.shlRun = 0; this.runStart = null; this.vSrc = 'start'; this.ev = []; }
  set(nv, src, opt) {
    opt = opt || {};
    const prev = this.v, n = this.n;
    const order = opt.order || B.changedBits(prev, nv, n);
    this.v = nv;
    const prevSrc = this.vSrc;
    if (src !== 'base' && (nv !== prev || src !== 'bits')) this.vSrc = src;
    if (src !== 'base') {
      if (nv === 0) this.chain = 0;
      else if ((src === 'inc' || src === 'shl') && this.chain >= 0) this.chain++;
      else if (src !== 'bits' || nv !== prev) this.chain = -1;
      if (src === 'shl') { if (this.shlRun === 0) this.runStart = prev; this.shlRun++; }
      else if (src !== 'bits' || nv !== prev) { this.shlRun = 0; this.runStart = null; }
    }
    this.ev.push({ type: 'value', data: { src: src, n: n, v: nv, prev: prev, changed: order.length, overflow: !!opt.overflow, ones: B.popcount(nv),
      b: this.b, inB: B.toBase(nv, this.b), hex: B.toBase(nv, 16), chain: this.chain, shlRun: this.shlRun, runStart: this.runStart, vSrc: this.vSrc, prevSrc: prevSrc } });
    return this;
  }
  toggle(i) { return this.set(B.toggle(this.v, i, this.n), 'toggle'); }
  bitsTo(v) { const want = B.bitsOf(v, this.n); for (let i = 0; i < this.n; i++) if (B.bit(this.v, i) !== want[i]) this.toggle(i); return this; }
  inc(src) { const r = B.inc(this.v, this.n); return this.set(r.v, src || 'inc', { order: r.flipped, overflow: r.overflow }); }
  dec() { const r = B.dec(this.v, this.n); return this.set(r.v, 'dec', { order: r.flipped, overflow: r.overflow }); }
  shl() { const r = B.shl(this.v, this.n); return this.set(r.v, 'shl', { overflow: r.overflow }); }
  shr() { const r = B.shr(this.v, this.n); return this.set(r.v, 'shr', {}); }
  clear() { return this.set(0, 'clear'); }
  type(b, s) { const v = B.fromBase(s, b); if (!(v <= B.maxOf(this.n))) throw new Error('放不下 ' + s); return this.set(v, 'type' + b); }
  bits(n) { this.n = n; return this.set(B.wrap(this.v, n), 'bits'); }
  base(b) { this.b = b; this.ev.push({ type: 'value', data: { src: 'base', n: this.n, v: this.v, prev: this.v, changed: 0, overflow: false, ones: B.popcount(this.v), b: b, inB: B.toBase(this.v, b), hex: B.toBase(this.v, 16), chain: this.chain, shlRun: this.shlRun, runStart: this.runStart, vSrc: this.vSrc, prevSrc: this.vSrc } }); return this; }
  ladder(stepped) { this.ev.push({ type: 'ladder', data: { v: this.v, steps: B.ladder(this.v).length, stepped: stepped } }); return this; }
}
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
console.log('預設狀態（8 位元、值 0、b = 3），只動一下不改值的控制項：');
{
  const s = new Sim(8, 3);
  s.base(3).bits(8);
  const hit = missions.filter(m => run(m, s.ev)).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); } else console.log('  ✓ 沒有任何任務被觸發');
}

// ---------- 2. 每個任務的解法 ----------
console.log('\n公開任務：');
expect('1', new Sim().toggle(2).toggle(0).ev, true, '點亮第 2、0 位 → 101（二）= 5');
expect('2', new Sim().type(16, '2A').ev, true, '十六進位輸入 2A（= 42）');
expect('3', new Sim().bitsTo(7).inc().ev, true, '0111 按 +1 → 1000，4 盞燈改變');
expect('3', new Sim().bitsTo(6).inc().ev, false, '0110 按 +1 只改 1 盞，不算');
expect('4', new Sim().type(10, '165').ladder(true).ev, true, '165 用「下一步」除到底（8 步）');
expect('4', new Sim().type(10, '165').ladder(false).ev, false, '按「全部顯示」不算');
expect('5', new Sim().bits(12).type(10, '4095').ev, true, '12 位元全亮 = 4095');
expect('6', new Sim().type(10, '255').inc().ev, true, '8 位元 255 按 +1 → 0（溢位）');
expect('7', new Sim().bits(10).type(10, '1000').ev, true, '10 位元輸入 1000（9 位元最多 511，放不下）');
expect('7', new Sim().bits(11).type(10, '1000').ev, false, '11 位元不算「最少」');
expect('8', new Sim().bits(16).type(16, 'FFF0').ev, true, '16 位元，十六進位輸入 FFF0（12 個 1）');
expect('8', new Sim().bits(16).type(16, 'EEEE').ev, true, '或 EEEE（每個 E = 1110，3 × 4 = 12）');
expect('9', new Sim().bits(9).base(7).type(10, '343').ev, true, 'b = 7、十進位 343 → 1000（七）');
expect('10', [1, 2, 3, 4, 5].map(k => ({ type: 'quiz', data: { ok: true, streak: k, n: 8, kind: 'set', base: 10 } })), true, '轉換挑戰連續答對 5 題');
{
  const s = new Sim().clear();
  B.toBase(100, 2).split('').forEach((bitv, k) => { if (k > 0) s.shl(); if (bitv === '1') s.inc(); });   // 100 = 1100100（二）：由高位往低位讀
  expect('11', s.ev, true, '歸零 → +1 ×2 +1 ×2 ×2 ×2 +1 ×2 ×2，共 ' + s.chain + ' 步做出 ' + s.v + '（最少步數 = ' + B.minBuildSteps(100) + '）');
  const t = new Sim().clear();
  for (let k = 0; k < 100; k++) t.inc();
  expect('11', t.ev, false, '按 100 次 +1 也做得出 100，但不是最少步數');
}
expect('12', [{ type: 'round', data: { correct: 10, total: 10, time: 74.2, n: 8 } }], true, '8 位元一回合 10 題全對、74.2 秒（每題約 7 秒）');
expect('12', [{ type: 'round', data: { correct: 10, total: 10, time: 95, n: 8 } }], false, '超過 90 秒不算');

console.log('\n隱藏任務（解法與交叉檢查）：');
const sol = {
  h1: ['16 位元十六進位輸入 5555（0101…0101，記憶體測試的棋盤圖樣）', () => new Sim().bits(16).type(16, '5555').ev],
  h2: ['11 位元以上，從 1 開始連按十次 ×2 → 1024（2^10，「千」與「Ki」）', () => { const s = new Sim().bits(12).toggle(0); for (let k = 0; k < 10; k++) s.shl(); return s.ev; }],
  h3: ['12 位元以上，親手設成 2048（只有最高位亮），按 ×2 → 0', () => new Sim().bits(12).type(10, '2048').shl().ev],
  h4: ['16 位元十六進位輸入 CAFE（Java 類別檔開頭的 CAFEBABE）', () => new Sim().bits(16).type(16, 'CAFE').ev],
  h5: ['在三種進位裡都顯示 121：b = 3 值 16、b = 7 值 64、b = 12 值 169（121 在任何 b ≥ 3 進位都是 (b+1)²）', () => new Sim().base(3).type(10, '16').base(7).type(10, '64').base(12).type(10, '169').ev],
  h6: ['8 位元輸入 127 = 0111 1111（梅森質數 2^7 − 1，前面還留一盞暗燈）', () => new Sim().type(10, '127').ev],
  h7: ['9 位元以上輸入 496 = 111110000（完全數，五個 1 接四個 0）', () => new Sim().bits(9).type(10, '496').ev],
  h8: ['16 位元親手設成 32767，按 +1 → 32768（Ariane 5：塞不進 16 位元有號整數的值）', () => new Sim().bits(16).type(10, '32767').inc().ev],
  h9: ['13 位元輸入 7447 = 1110100010111（十進位與二進位都是回文，燈排剛好填滿）', () => new Sim().bits(13).type(10, '7447').ev],
  h10: ['b = 5，值 31 → 11111（二）= 111（五）（Goormaghtigh：同時是兩種進位的「全是 1」）', () => new Sim().base(5).type(10, '31').ev]
};
const keys = Object.keys(sol);
const table = [];
keys.forEach(k => {
  const ev = sol[k][1]();
  expect(k, ev, true, sol[k][0]);
  const others = hidden.filter(m => m.id !== 'binary-numbers-' + k && run(m, ev)).map(m => m.id.replace('binary-numbers-', ''));
  table.push(k.padEnd(4) + '→ ' + (others.length ? '✗ 也完成了 ' + others.join('、') : '沒有連帶完成其他隱藏任務'));
  if (others.length) fail++;
});
// 幾個「差一點」的反例
expect('h1', new Sim().type(16, '55').ev, false, '8 位元的 0101 0101 不算（要 12 位元以上）');
expect('h2', new Sim().bits(12).type(10, '1024').ev, false, '直接輸入 1024 不算（要從 1 一路加倍）');
expect('h3', new Sim().bits(8).type(10, '128').shl().ev, false, '8 位元的 1000 0000 ×2 → 0 不算（要 12 位元以上）');
expect('h3', new Sim().bits(12).type(10, '4095').shr().inc().shl().ev, false, '一路 ÷2、+1 滑到 2048 再 ×2 不算（要親手設定）');
expect('h5', new Sim().base(3).type(10, '16').base(7).type(10, '64').ev, false, '只在兩種進位顯示 121 不算');
expect('h6', new Sim().type(10, '255').shr().ev, false, '全亮再 ÷2 滑到 127 不算（要親手設定）');
expect('h6', new Sim().bits(7).type(10, '127').ev, false, '7 位元全亮的 127 不算（要留暗燈）');
expect('h6', new Sim().type(10, '31').ev, false, '31 也是梅森質數，但沒超過一百');
expect('h7', new Sim().type(10, '28').ev, false, '28 也是完全數，但只有兩位數');
expect('h8', new Sim().bits(16).type(10, '65535').inc().ev, false, '65535 + 1 是溢位，不是這一步');
expect('h8', new Sim().bits(16).dec().shr().inc().ev, false, '0 − 1 → ÷2 滑到 32767 再 +1 不算（要親手設定）');
expect('h9', new Sim().bits(16).type(10, '7447').ev, false, '16 位元的 7447 前面有暗燈，燈排讀起來不對稱');
expect('h10', new Sim().base(2).type(10, '31').ev, false, 'b = 2 時只是同一種語言');
{
  const s = new Sim().bits(16);
  for (let k = 0; k < 600; k++) s.inc('auto');
  const hit = hidden.filter(m => run(m, s.ev)).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 自動數數經過的值觸發了 ' + hit.join('、')); } else console.log('  ✓ 自動數數 600 步（經過 0x0000–0x0257）不觸發任何隱藏任務');
}
console.log('\n十個隱藏任務的交叉檢查：');
table.forEach(l => console.log('  ' + l));

// ---------- 3. 亂按（像試玩工具）的誤觸率 ----------
console.log('\n亂按模擬：每回合 150 個隨機操作（點燈 40%、+1／−1／×2／÷2／歸零 各 8%、改位元數 10%、改進位 b 10%）×（滑桿取隨機值、最小、最大）：');
{
  const rand = B.rng(1112);
  const R = 4000, hits = {};
  hidden.forEach(m => { hits[m.id] = 0; });
  for (let r = 0; r < R; r++) {
    const s = new Sim(8, 3);
    for (let k = 0; k < 150; k++) {
      const u = rand();
      const pick = (lo, hi) => { const w = rand(); return w < 0.2 ? lo : w < 0.4 ? hi : lo + Math.floor(rand() * (hi - lo + 1)); };
      if (u < 0.4) s.toggle(Math.floor(rand() * s.n));
      else if (u < 0.48) s.inc(); else if (u < 0.56) s.dec(); else if (u < 0.64) s.shl(); else if (u < 0.72) s.shr(); else if (u < 0.8) s.clear();
      else if (u < 0.9) s.bits(pick(1, 16)); else s.base(pick(2, 16));
    }
    hidden.forEach(m => { if (run(m, s.ev)) hits[m.id]++; });
  }
  let worst = 0;
  hidden.forEach(m => { const p = hits[m.id] / R; worst = Math.max(worst, p); console.log('  ' + m.id.padEnd(20) + (p * 100).toFixed(2) + '%'); });
  if (worst > 0.02) { fail++; console.log('  ✗ 有隱藏任務被亂按觸發的機率超過 2%'); } else console.log('  ✓ 每個隱藏任務被亂按觸發的機率都在 2% 以下');
}

console.log(fail ? `\n✗ ${fail} 項不符合` : '\n全部任務都證明做得到，預設狀態與亂按都不會誤觸。');
process.exitCode = fail ? 1 : 0;
