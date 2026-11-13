/* 任務可達成的證明腳本。用法：node tools/mission-proofs/twos-complement.js
 * 用計算核心模擬頁面（js/twos-complement.js 的 setA、doArith、doNegate、doExtend）送出的事件，證明：
 *   1. 每個任務在滑桿範圍與精度內做得到（印出解法）；2. 預設狀態不觸發任何任務；
 *   3. 十個隱藏任務的解法彼此不會順便完成另一個隱藏任務（交叉檢查表）；
 *   4. 旗標挑戰靠的是判斷不是運氣：亂猜連對 5 題的機率；
 *   5. 固定種子的亂按模擬（像學生隨便點每一個控制項），印出每個任務被碰巧完成的比例，隱藏任務都要 < 2%。
 * 控制項範圍：位元數 n 4–32（整數）、延伸到 m 位元 5–32（整數）；A、B 可點燈或打字（十進位依表示法、十六進位、二進位）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const T = require(ROOT + 'js/twos-complement-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/twos-complement.js');
const byId = id => missions.find(m => m.id === 'twos-complement-' + id);
const hidden = missions.filter(m => m.hidden);
const P = k => Math.pow(2, k);

// ---------- 與頁面相同的事件模擬 ----------
class Sim {
  constructor() { this.n = 8; this.rep = 'twos'; this.u = 0; this.vSrc = 'start'; this.b = 1; this.bSrc = 'start'; this.m = 16; this.last = null; this.ev = []; }
  setA(nu, src, opt) {
    opt = opt || {};
    const prev = this.u, prevN = opt.prevN != null ? opt.prevN : this.n;
    const pv = opt.pv != null ? opt.pv : T.value(prev, this.n, this.rep);
    const prevSrc = this.vSrc;
    this.u = nu;
    if (src === 'bits') { if (!opt.kept) this.vSrc = 'bits'; }
    else if (src !== 'rep') this.vSrc = src;
    this.ev.push({ type: 'value', data: { src: src, n: this.n, rep: this.rep, u: nu, prev: prev, prevN: prevN, v: T.value(nu, this.n, this.rep), pv: pv,
      negZero: T.isNegZero(nu, this.n, this.rep), C: opt.C == null ? null : opt.C, V: opt.V == null ? null : opt.V, kept: opt.kept == null ? null : opt.kept,
      vSrc: this.vSrc, prevSrc: prevSrc } });
    return this;
  }
  toggle(i) { return this.setA(T.toggle(this.u, i, this.n), 'toggle'); }
  bitsTo(u) { for (let i = 0; i < this.n; i++) if (T.bit(this.u, i) !== T.bit(u, i)) this.toggle(i); return this; }
  dec10(v, negZero) { const p = T.parse((negZero ? '-' : '') + v, 'dec', this.n, this.rep); if (!p.ok) throw new Error('放不下 ' + v); return this.setA(p.u, 'typeDec'); }
  hex(s) { const p = T.parse(s, 'hex', this.n, this.rep); if (!p.ok) throw new Error('放不下 ' + s); return this.setA(p.u, 'typeHex'); }
  bin(s) { const p = T.parse(s, 'bin', this.n, this.rep); if (!p.ok) throw new Error('放不下 ' + s); return this.setA(p.u, 'typeBin'); }
  inc() { const x = T.add(this.u, 1, this.n); return this.setA(x.r, 'inc', { C: x.C, V: x.V }); }
  dec() { const x = T.sub(this.u, 1, this.n); return this.setA(x.r, 'dec', { C: x.C, V: x.V }); }
  not() { return this.setA(T.not(this.u, this.n), 'not'); }
  clear() { return this.setA(0, 'clear'); }
  neg() {
    const g = T.negate(this.u, this.n, this.rep), src = this.vSrc, u = this.u;
    this.setA(g.u, 'neg');
    this.ev.push({ type: 'negate', data: { n: this.n, rep: this.rep, u: u, r: g.u, v: T.value(u, this.n, this.rep), w: T.value(g.u, this.n, this.rep), same: g.same, overflow: g.overflow, src: src } });
    return this;
  }
  setRep(rep) { if (rep === this.rep) return this; const pv = T.value(this.u, this.n, this.rep); this.rep = rep; return this.setA(this.u, 'rep', { pv: pv }); }
  bits(n) {
    if (n === this.n) return this;
    const prevN = this.n, pv = T.value(this.u, this.n, this.rep);
    const r = T.resize(this.u, this.n, n, this.rep), rb = T.resize(this.b, this.n, n, this.rep);
    this.n = n; this.b = rb.u; this.m = Math.min(32, 2 * n); this.last = null;
    return this.setA(r.u, 'bits', { prevN: prevN, pv: pv, kept: r.kept });
  }
  setM(m) { this.m = m; return this; }
  setB(v) { const p = T.parse(String(v), 'dec', this.n, this.rep); if (!p.ok) throw new Error('B 放不下 ' + v); this.b = p.u; this.bSrc = 'typeDec'; return this; }
  setBu(u) { this.b = u; this.bSrc = 'toggle'; return this; }
  arith(op) {
    const q = T.viaAdder(this.u, this.b, this.n, this.rep, op), x = q.res;
    this.last = { r: x.r, n: this.n };
    this.ev.push({ type: 'arith', data: { op: op, n: this.n, rep: this.rep, a: this.u, b: this.b, r: x.r, C: x.C, V: x.V, N: x.N, Z: x.Z,
      x: q.x, y: q.y, truth: q.truth, fits: q.fits, raw: q.raw, ok: q.ok, aSrc: this.vSrc, bSrc: this.bSrc } });
    return this;
  }
  add() { return this.arith('add'); }
  sub() { return this.arith('sub'); }
  result() { if (!this.last || this.last.n !== this.n) return this; return this.setA(this.last.r, 'result'); }
  extend() {
    if (this.m <= this.n) return this;
    const sx = T.signExtend(this.u, this.n, this.m);
    this.ev.push({ type: 'extend', data: { n: this.n, m: this.m, rep: this.rep, u: this.u, v: T.value(this.u, this.n, 'twos'), sx: sx, sv: T.value(sx, this.m, 'twos'),
      zx: this.u, zv: T.value(this.u, this.m, 'twos'), src: this.vSrc } });
    return this;
  }
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
console.log('預設狀態（8 位元、二補數、A = 0、B = 1、m = 16），只動一下不改值的控制項：');
{
  const s = new Sim();
  s.setRep('twos').bits(8).setM(16);
  const hit = missions.filter(m => run(m, s.ev)).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); } else console.log('  ✓ 沒有任何任務被觸發');
  const t = new Sim().add().sub().extend();
  const hit2 = missions.filter(m => run(m, t.ev)).map(m => m.id);
  if (hit2.length) { fail++; console.log('  ✗ 預設值直接按 A + B、A − B、延伸 觸發了 ' + hit2.join('、')); } else console.log('  ✓ 預設值直接按「A + B」「A − B」「延伸」也不觸發（0 + 1、0 − 1、延伸 0）');
}

// ---------- 2. 公開任務的解法 ----------
console.log('\n公開任務：');
expect('1', new Sim().dec().ev, true, '從 0 按 −1 → 1111 1111 = −1');
expect('1', new Sim().setRep('ones').dec10(-1).ev, false, '一補數的 −1（1111 1110）不算，要二補數');
expect('2', new Sim().setRep('sign').dec10(0, true).ev, true, '原碼輸入 −0 → 1000 0000');
expect('2', new Sim().setRep('ones').dec().ev, true, '或一補數從 0 按 −1 → 1111 1111 = −0');
expect('3', new Sim().dec10(5).neg().ev, true, '5 = 0000 0101 → 取反 1111 1010 → 加一 1111 1011 = −5');
expect('4', new Sim().dec10(-1).setB(1).add().ev, true, '−1 + 1 = 0：C = 1、V = 0');
expect('5', new Sim().dec10(100).setB(50).add().ev, true, '100 + 50 = 150 放不下 → −106：V = 1、C = 0');
expect('6', new Sim().setRep('sign').dec10(5).setB(-3).add().ev, true, '原碼 5 + (−3)：0000 0101 + 1000 0011 = 1000 1000 → −8，不是 2');
expect('6', new Sim().setRep('sign').dec10(5).setB(3).add().ev, false, '兩個正數相加原碼也對');
expect('7', new Sim().dec10(-42).setM(16).extend().ev, true, '−42 = 1101 0110 → 1111 1111 1101 0110 仍是 −42');
expect('7', new Sim().dec10(42).extend().ev, false, '正數不算（要負數）');
expect('8', new Sim().dec10(3).setB(5).sub().ev, true, '3 − 5 = −2：無號 3 < 5 要借位（C = 0），V = 0');
expect('9', new Sim().dec10(-100).setB(-100).add().ev, true, '−100 + (−100) = −200 放不下 → 56：C = 1、V = 1');
expect('10', new Sim().dec10(-128).neg().ev, true, '−128 = 1000 0000 → 取反 0111 1111 → 加一 1000 0000（還是 −128）');
expect('10', new Sim().bits(4).dec10(-8).neg().ev, true, '任何 n 都可以：4 位元的 −8');
expect('10', new Sim().neg().ev, false, '0 取負還是 0，不算');
expect('11', [1, 2, 3, 4, 5].map(k => ({ type: 'quiz', data: { ok: true, streak: k, n: 8, op: 'add' } })), true, '旗標挑戰連續答對 5 題');
expect('12', [{ type: 'round', data: { correct: 10, total: 10, time: 96.4, n: 8 } }], true, '8 位元一回合 10 題全對、96.4 秒');
expect('12', [{ type: 'round', data: { correct: 10, total: 10, time: 80, n: 6 } }], false, '6 位元不算（要至少 8 位元）');

// ---------- 3. 隱藏任務 ----------
console.log('\n隱藏任務（解法與交叉檢查）：');
const h = P(7);
const sol = {
  h1: ['16 位元輸入 200，把位元數改成 8 → 截斷成 1100 1000 = −56（Java 的 (byte) 200）', () => new Sim().bits(16).dec10(200).bits(8).ev],
  h2: ['二補數輸入 −42（1101 0110），切到偏移碼再輸入 −42（0101 0110）：兩排燈只差最高位', () => new Sim().dec10(-42).setRep('bias').dec10(-42).ev],
  h3: ['一補數 A = 5、B = −5（= 5 取反），A + B = 1111 1111 = −0，沒有進位', () => new Sim().setRep('ones').dec10(5).setB(-5).add().ev],
  h4: ['二補數 −128 + (−128) = 0：C = 1、V = 1、Z = 1', () => new Sim().dec10(-128).setB(-128).add().ev],
  h5: ['10 位元，十六進位輸入 3FF（週數 1023），按 +1 → 0（GPS 週數翻轉）', () => new Sim().bits(10).hex('3FF').inc().ev],
  h6: ['8 位元十六進位輸入 FF（字元 ÿ），延伸到 m = 32：符號延伸 = −1（= EOF）', () => new Sim().hex('FF').setM(32).extend().ev],
  h7: ['8 位元點亮最高兩位 1100 0000：二補數讀 −64，切到原碼也讀 −64', () => new Sim().toggle(7).toggle(6).setRep('sign').ev],
  h8: ['16 位元一補數 A = −3、B = 5，A + B 有進位（1 0000 0000 0000 0001），按「結果放回 A」再按 +1 → 2', () => new Sim().bits(16).setRep('ones').dec10(-3).setB(5).add().result().inc().ev],
  h9: ['32 位元十六進位輸入 7FFFFFFF（2 147 483 647），按 +1 → −2 147 483 648', () => new Sim().bits(32).hex('7FFFFFFF').inc().ev],
  h10: ['二補數 A = 5、B = −128：A + B 與 A − B 都是 1000 0101、C 都是 0，只有 A − B 的 V = 1', () => new Sim().dec10(5).setB(-128).add().sub().ev]
};
const keys = Object.keys(sol);
const table = [];
keys.forEach(k => {
  const ev = sol[k][1]();
  expect(k, ev, true, sol[k][0]);
  const others = hidden.filter(m => m.id !== 'twos-complement-' + k && run(m, ev)).map(m => m.id.replace('twos-complement-', ''));
  table.push(k.padEnd(4) + '→ ' + (others.length ? '✗ 也完成了 ' + others.join('、') : '沒有連帶完成其他隱藏任務'));
  if (others.length) fail++;
});
// 「差一點」的反例
expect('h1', new Sim().bits(16).dec10(100).bits(8).ev, false, '100 塞進 8 位元還是 100（沒變負）');
expect('h1', new Sim().bits(16).dec10(-1).inc().inc().bits(8).ev, false, '一路按 +1 滑到的值不算（要親手設定）');
expect('h1', new Sim().bits(16).dec10(300).bits(8).ev, false, '300 截斷是 44（正的）；而且 300 已經不是一個位元組裝得下的數');
expect('h2', new Sim().dec10(-42).setRep('bias').ev, false, '只換表示法、沒有在偏移碼裡輸入同一個數');
expect('h2', new Sim().dec10(0).setRep('bias').dec10(0).ev, false, '0 不算');
expect('h3', new Sim().setRep('ones').dec10(5).setB(-4).add().ev, false, '5 + (−4) 不是相反數');
expect('h3', new Sim().setRep('ones').setB(0).add().ev, false, '+0 + (−0) 不算（要非零的數）');
expect('h4', new Sim().dec10(-128).setB(-127).add().ev, false, '−128 + (−127) 不算');
expect('h5', new Sim().bits(10).dec().inc().ev, false, '從 0 按 −1 再 +1 不算（要親手設定 1023）');
expect('h5', new Sim().bits(9).hex('1FF').inc().ev, false, '9 位元的 511 + 1 不算');
expect('h6', new Sim().hex('FF').setM(16).extend().ev, false, '只延伸到 16 位元不算');
expect('h6', new Sim().dec().setM(32).extend().ev, false, '0 − 1 得到的 FF 不算（要親手設定那個字元）');
expect('h7', new Sim().toggle(7).toggle(6).ev, false, '只看二補數一種讀法不算');
expect('h7', new Sim().dec10(-64).dec().inc().setRep('sign').ev, false, '用 ±1 滑到的不算');
expect('h8', new Sim().bits(16).setRep('ones').dec10(-3).setB(5).add().result().ev, false, '放回 A 以後沒有做迴繞進位');
expect('h8', new Sim().bits(16).setRep('ones').dec10(3).setB(5).add().result().inc().ev, false, '沒有進位的加法不算');
expect('h9', new Sim().bits(32).dec10(-1).not().inc().ev, false, '−1 取反得到 0 再 +1 不算');
expect('h9', new Sim().bits(16).dec10(32767).inc().ev, false, '16 位元的 32767 + 1 不算（那是另一個故事）');
expect('h10', new Sim().dec10(5).setB(-128).add().ev, false, '只做 A + B 不算');
expect('h10', new Sim().dec10(-128).setB(-128).add().sub().ev, false, 'A = B 不算');
expect('h10', new Sim().dec10(5).setB(3).add().sub().ev, false, 'B = 3 時加減結果不同');
console.log('\n十個隱藏任務的交叉檢查：');
table.forEach(l => console.log('  ' + l));

// ---------- 4. 靠運氣的部分 ----------
console.log('\n旗標挑戰（C、V 各 2 種，四種組合機會均等）：亂猜一題答對機率 1/4，亂猜連對 5 題 = (1/4)^5 = ' + (Math.pow(0.25, 5) * 100).toFixed(3) + '%；連對 10 題 = ' + (Math.pow(0.25, 10) * 100).toExponential(1) + '%。');
{
  const rand = T.rng(2026), cnt = {};
  for (let k = 0; k < 20000; k++) { const q = T.question(rand, 8, null); cnt[q.C + '' + q.V] = (cnt[q.C + '' + q.V] || 0) + 1; }
  console.log('  出題 2 萬次的 (C, V) 分布：' + Object.keys(cnt).sort().map(k => k + ' ' + (cnt[k] / 200).toFixed(1) + '%').join('、') + '（只猜同一種組合也只有約 25%）');
}

// ---------- 5. 亂按模擬 ----------
const PEOPLE = 1000, STEPS = 300;
console.log(`\n亂按模擬：${PEOPLE} 人 × 每人 ${STEPS} 個隨機操作（固定種子）。操作比例：點燈 20%、+1／−1／取反／取負／歸零 各 5%、A + B／A − B 各 6%、結果放回 A 4%、延伸 4%、` +
  '改 n 6%、改 m 3%、換表示法 6%、點 B 的位元 8%、在 A 的三個欄位打字 6%、在 B 欄打字 6%（滑桿取隨機值、最小或最大；打字是 −300…300 的整數或隨機十六進位）：');
{
  const rand = T.rng(1113), hits = {};
  missions.forEach(m => { hits[m.id] = 0; });
  const pick = (lo, hi) => { const w = rand(); return w < 0.2 ? lo : w < 0.4 ? hi : lo + Math.floor(rand() * (hi - lo + 1)); };
  const REPS = ['twos', 'ones', 'sign', 'bias'];
  for (let p = 0; p < PEOPLE; p++) {
    const s = new Sim();
    for (let k = 0; k < STEPS; k++) {
      const u = rand() * 100;
      try {
        if (u < 20) s.toggle(Math.floor(rand() * s.n));
        else if (u < 25) s.inc(); else if (u < 30) s.dec(); else if (u < 35) s.not(); else if (u < 40) s.neg(); else if (u < 45) s.clear();
        else if (u < 51) s.add(); else if (u < 57) s.sub();
        else if (u < 61) s.result();
        else if (u < 65) s.extend();
        else if (u < 71) s.bits(pick(4, 32));
        else if (u < 74) s.setM(Math.max(s.n + 1, pick(5, 32)));
        else if (u < 80) s.setRep(REPS[Math.floor(rand() * 4)]);
        else if (u < 88) s.setBu(T.toggle(s.b, Math.floor(rand() * s.n), s.n));
        else if (u < 94) {
          const w = rand();
          if (w < 0.5) { const v = Math.floor(rand() * 601) - 300; const q = T.parse(String(v), 'dec', s.n, s.rep); if (q.ok) s.setA(q.u, 'typeDec'); }
          else if (w < 0.8) { const q = T.parse(Math.floor(rand() * P(Math.min(s.n, 16))).toString(16), 'hex', s.n, s.rep); if (q.ok) s.setA(q.u, 'typeHex'); }
          else { const q = T.parse(Math.floor(rand() * P(Math.min(s.n, 12))).toString(2), 'bin', s.n, s.rep); if (q.ok) s.setA(q.u, 'typeBin'); }
        } else {
          const v = Math.floor(rand() * 601) - 300; const q = T.parse(String(v), 'dec', s.n, s.rep); if (q.ok) { s.b = q.u; s.bSrc = 'typeDec'; }
        }
      } catch (e) { /* 放不下的輸入：頁面會提示，不送事件 */ }
    }
    missions.forEach(m => { if (run(m, s.ev)) hits[m.id]++; });
  }
  let worst = 0;
  missions.forEach(m => {
    const pr = hits[m.id] / PEOPLE;
    if (m.hidden) worst = Math.max(worst, pr);
    console.log('  ' + m.id.padEnd(22) + (m.hidden ? '（隱藏）' : '        ') + (pr * 100).toFixed(2).padStart(6) + '%');
  });
  if (worst >= 0.02) { fail++; console.log('  ✗ 有隱藏任務被亂按觸發的機率達到 2%'); } else console.log('  ✓ 每個隱藏任務被亂按觸發的機率都在 2% 以下（最高 ' + (worst * 100).toFixed(2) + '%）');
}

console.log(fail ? `\n✗ ${fail} 項不符合` : '\n全部任務都證明做得到，預設狀態不會觸發，十個隱藏任務彼此不連帶，亂按也不會誤觸。');
process.exitCode = fail ? 1 : 0;
