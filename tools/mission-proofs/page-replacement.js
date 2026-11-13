/* 任務可達成的證明腳本。用法：node tools/mission-proofs/page-replacement.js
 * 用分頁置換核心模擬頁面（js/page-replacement.js）送出的 'run' 事件，證明：
 *   1. 每個任務都做得到（印出解法）；2. 預設狀態（預設字串、內建範例，只換框數、LFU 算法、倒過來）不觸發隱藏任務；
 *   3. 十個隱藏任務的解法不會順便完成另一個隱藏任務（交叉檢查表）；
 *   4. 像試玩工具一樣亂按（範例、隨機產生、長度與頁面種類滑桿、亂打字串、倒過來、框數、LFU 算法、播放、單步、直接跑完……），
 *      隱藏任務被誤觸的機率（每個都要 < 2%）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/page-replacement-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/page-replacement.js');
const byId = id => missions.find(m => m.id === 'page-replacement-' + id);
const hidden = missions.filter(m => m.hidden);
const pub = missions.filter(m => !m.hidden);
const short = m => m.id.replace('page-replacement-', '');

// ---------- 與頁面相同的狀態與事件（js/page-replacement.js） ----------
const PRESETS = {
  silb: [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1],
  belady: [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5],
  loop: [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4]
};
const DEFAULT = { refs: PRESETS.silb, frames: 3, len: 20, kinds: 6 };
class Sim {
  constructor() {
    this.refs = DEFAULT.refs.slice(); this.sheet = 'default'; this.preset = ''; this.seed = 0; this.len = DEFAULT.len; this.kinds = DEFAULT.kinds;
    this.frames = DEFAULT.frames; this.lfuKeep = false; this.t = 0; this.atEnd = false; this.ev = [];
  }
  data(src) { return Object.assign({ src: src, refs: this.refs.slice(), sheet: this.sheet, preset: this.preset }, K.summary(this.refs, this.frames, this.lfuKeep)); }
  emit(src) { this.ev.push({ type: 'run', data: this.data(src) }); }
  /** 字串或設定改了：已經在最後一步就直接顯示新結果並送出事件，否則回到第 0 步 */
  changed() { if (this.atEnd) { this.t = this.refs.length; this.emit('update'); } else this.t = 0; return this; }
  finish(src) { this.t = this.refs.length; this.atEnd = true; this.emit(src); return this; }
  // ----- 操作 -----
  presetTo(k) { this.refs = PRESETS[k].slice(); this.sheet = 'preset'; this.preset = k; return this.changed(); }
  random() { this.seed++; this.refs = K.randomRefs(this.seed, this.len, this.kinds); this.sheet = 'random'; this.preset = ''; return this.changed(); }
  lenTo(v) { this.len = v; this.seed = Math.max(1, this.seed); this.refs = K.randomRefs(this.seed, this.len, this.kinds); this.sheet = 'random'; this.preset = ''; return this.changed(); }
  kindsTo(v) { this.kinds = v; this.seed = Math.max(1, this.seed); this.refs = K.randomRefs(this.seed, this.len, this.kinds); this.sheet = 'random'; this.preset = ''; return this.changed(); }
  type(text) {
    const p = K.parse(text);
    if (!p.ok) return this;
    if (p.refs.join(',') === this.refs.join(',')) return this;
    this.refs = p.refs; this.sheet = 'hand'; this.preset = '';
    return this.changed();
  }
  hand(str) { return this.type(str); }
  reverse() { this.refs = this.refs.slice().reverse(); return this.changed(); }
  framesTo(f) { f = Math.max(1, Math.min(7, f)); if (f === this.frames) return this; this.frames = f; return this.changed(); }
  keepTo(b) { if (b === this.lfuKeep) return this; this.lfuKeep = b; return this.changed(); }
  toEnd() { return this.finish('end'); }
  play() { if (this.atEnd) { this.t = 0; this.atEnd = false; } return this.finish('play'); }
  playHalf() { if (this.atEnd) { this.t = 0; this.atEnd = false; } this.t = Math.floor(this.refs.length / 2); return this; }
  step() {
    if (this.atEnd) { this.t = 0; this.atEnd = false; }
    this.t++;
    if (this.t >= this.refs.length) this.finish('step');
    return this;
  }
  back() { this.t = Math.max(0, this.t - 1); this.atEnd = false; return this; }
  reset() { this.t = 0; this.atEnd = false; return this; }
}
const run = (m, events) => { m.mem = {}; return events.some(e => { try { return !!m.check(e, m.mem); } catch (err) { return false; } }); };
const which = (events, list) => (list || hidden).filter(m => run(m, events)).map(short);

let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id);
  const ok = run(m, events);
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? ' 達成：' : ' 不觸發：') + note);
  return events;
}
const sum = (s, f, keep) => { const d = K.summary(s, f, keep); return 'FIFO ' + d.faults.fifo + '、LRU ' + d.faults.lru + '、LFU ' + d.faults.lfu + '、OPT ' + d.faults.opt; };
const S = str => str.split(' ').map(Number);

// ---------- 1. 預設狀態不觸發 ----------
console.log('預設狀態：');
{
  const s = new Sim();
  if (s.ev.length) { fail++; console.log('  ✗ 載入頁面就送出了事件'); } else console.log('  ✓ 載入頁面不送出任何事件（任務都要先操作）');
  // 預設字串與 3 個範例（也試倒過來）× 框數 1–7 × LFU 兩種算法，全部跑到最後
  const hits = {};
  let count = 0;
  [null, 'silb', 'belady', 'loop'].forEach(pr => [false, true].forEach(rev => {
    for (let f = 1; f <= 7; f++) [false, true].forEach(keep => {
      const t = new Sim();
      if (pr) t.presetTo(pr);
      if (rev) t.reverse();
      t.framesTo(f).keepTo(keep).toEnd(); count++;
      which(t.ev).forEach(h => { hits[h] = (hits[h] || 0) + 1; });
    });
  }));
  // 一次把所有組合連著按（同一個人依序操作，讓有記憶的任務也有機會）
  const all = new Sim();
  [null, 'silb', 'belady', 'loop'].forEach(pr => { if (pr) all.presetTo(pr); for (let f = 1; f <= 7; f++) { all.framesTo(f).toEnd(); all.keepTo(!all.lfuKeep); all.reverse(); all.reverse(); } });
  which(all.ev).forEach(h => { hits[h + '（連續）'] = 1; });
  const hk = Object.keys(hits);
  if (hk.length) { fail++; console.log('  ✗ 預設或範例觸發了隱藏任務：' + hk.join('、')); }
  else console.log('  ✓ 預設字串與 3 個範例 × 正反兩個方向 × 框數 1–7 × LFU 兩種算法（' + count + ' 種，另加連續操作一遍）都不觸發任何隱藏任務');
  const s2 = new Sim();
  for (let f = 1; f <= 7; f++) s2.framesTo(f).toEnd();
  console.log('  預設字串用框數 1–7 各跑一次，完成的公開任務：' + which(s2.ev, pub).join('、'));
  console.log('  預設字串（Silberschatz 課本）3 個框：' + sum(PRESETS.silb, 3) + '；曲線 ' + JSON.stringify(K.curves(PRESETS.silb)));
}

// ---------- 2. 一般任務 ----------
console.log('\n一般任務：');
expect('1', new Sim().play().ev, true, '預設字串按「播放」跑到最後');
expect('2', new Sim().hand('1 2 1 2 3 1 3 1 4 1 4 1').toEnd().ev, true, '1 2 1 2 3 1 3 1 4 1 4 1，3 個框：' + sum(S('1 2 1 2 3 1 3 1 4 1 4 1'), 3) + '（LRU 命中 8／12）');
expect('2', new Sim().toEnd().ev, false, '預設字串 3 個框：LRU 命中 8／20 = 40%');
expect('3', new Sim().presetTo('belady').toEnd().framesTo(4).ev, true, '範例 Belady 3 框跑完（FIFO 9），再改 4 框（已在最後一步，直接顯示：FIFO 10）');
expect('3', new Sim().presetTo('belady').framesTo(4).toEnd().framesTo(3).ev, true, '反過來先 4 框再 3 框也算');
expect('3', new Sim().presetTo('belady').framesTo(4).toEnd().ev, false, '只跑 4 框不算（要兩種都看過）');
expect('3', new Sim().presetTo('silb').toEnd().framesTo(4).ev, false, '課本字串 3 → 4 框 FIFO 15 → 10，沒有異常');
expect('4', new Sim().framesTo(4).toEnd().ev, true, '預設字串：OPT 3 框 9 次；LRU 3 框 12、4 框 8 → 最少 4 框');
expect('4', new Sim().framesTo(5).toEnd().ev, false, '5 框（LRU 7）也追上了，但不是最少的框數');
expect('5', new Sim().hand('3 5 4 5 1 0 4 1 3').toEnd().ev, true, '3 5 4 5 1 0 4 1 3，3 個框：' + sum(S('3 5 4 5 1 0 4 1 3'), 3));
expect('5', new Sim().presetTo('belady').toEnd().ev, false, '範例 Belady 3 框 LRU 10 > FIFO 9，但範例不算（要自己輸入或隨機）');
expect('6', new Sim().hand('1 2 3 4 5 1 2 3 4 5 1 2 3 4 5').framesTo(4).toEnd().ev, true, '1–5 繞三圈、4 個框：LRU 15 次全缺頁');
expect('6', new Sim().presetTo('loop').toEnd().ev, false, '範例「迴圈」3 個框 LRU 也全缺頁，但框數要至少 4');
expect('7', new Sim().hand('1 2 1 2 3 3 4 4 3 4 5 5 5 6 6 5 6').framesTo(2).toEnd().ev, true, '1 2 1 2 3 3 4 4 3 4 5 5 5 6 6 5 6，2 個框：' + sum(S('1 2 1 2 3 3 4 4 3 4 5 5 5 6 6 5 6'), 2) + '（= 不同頁數 6）');
expect('7', new Sim().hand('1 2 1 2 3 4 3 4 5 6 5 6').framesTo(2).toEnd().ev, false, '1 2 1 2 3 4 3 4 5 6 5 6：新頁只用一次就被 LFU 換掉（' + sum(S('1 2 1 2 3 4 3 4 5 6 5 6'), 2) + '）');
expect('8', new Sim().hand('1 1 1 1 2 3 4 2 3 4 2 3 4').toEnd().ev, true, '1 1 1 1 2 3 4 2 3 4 2 3 4，3 個框：' + sum(S('1 1 1 1 2 3 4 2 3 4 2 3 4'), 3) + '（1 用了 4 次一直占著框）');
expect('8', new Sim().toEnd().ev, false, '預設字串 LFU 11、LRU 12');
expect('9', new Sim().hand('0 5 2 4 1 0 5 3 0 5 2 4 1 3').framesTo(5).toEnd().ev, true, '0 5 2 4 1 0 5 3 0 5 2 4 1 3：FIFO 曲線 ' + K.curves(S('0 5 2 4 1 0 5 3 0 5 2 4 1 3')).fifo.join(',') + '，5 框比 4 框多');
expect('9', new Sim().hand('1 2 3 4 1 2 5 1 2 3 4 5').framesTo(4).toEnd().ev, false, '自己打經典字串不算');
expect('9', new Sim().hand('0 5 2 4 1 0 5 3 0 5 2 4 1 3').framesTo(4).toEnd().ev, false, '同一串用 4 框（異常在 4 → 5）不算');
expect('10', new Sim().hand('1 2 0 4 1 2 3 4 1').toEnd().ev, true, '1 2 0 4 1 2 3 4 1，3 個框：' + sum(S('1 2 0 4 1 2 3 4 1'), 3));
expect('10', new Sim().toEnd().ev, false, '預設字串 LFU 只比 OPT 多 2');

// ---------- 3. 隱藏任務 ----------
console.log('\n隱藏任務（解法與交叉檢查）：');
const sol = {
  h1: ['0 1 2 3 4 5 6 7 8 9，7 個框：每一頁都只出現一次，四種方法都缺頁 10 次', () => new Sim().hand('0 1 2 3 4 5 6 7 8 9').framesTo(7).toEnd().ev],
  h2: ['1 1 2 2 3 3 4 4 1 1 2 2，1 個框：只有緊接著重複才命中，命中 6／12', () => new Sim().hand('1 1 2 2 3 3 4 4 1 1 2 2').framesTo(1).toEnd().ev],
  h3: ['0 1 1 3 3 4 0 2 1 2，3 個框，LFU 先用預設（歸零）跑完：' + K.faultsOf(S('0 1 1 3 3 4 0 2 1 2'), 3, 'lfu') + ' 次，再勾「保留次數」：' + K.faultsOf(S('0 1 1 3 3 4 0 2 1 2'), 3, 'lfu', { lfuKeep: true }) + ' 次', () => new Sim().hand('0 1 1 3 3 4 0 2 1 2').toEnd().keepTo(true).ev],
  h4: ['1 0 2 4 1 0 2 1，3 個框跑完（' + sum(S('1 0 2 4 1 0 2 1'), 3) + '），按「倒過來」（' + sum(S('1 2 0 1 4 2 0 1'), 3) + '）', () => new Sim().hand('1 0 2 4 1 0 2 1').toEnd().reverse().ev],
  h5: ['1 3 2 0 3 2 2 1 3 2 0 3 2 1 3，3 個框：' + sum(S('1 3 2 0 3 2 2 1 3 2 0 3 2 1 3'), 3) + '（不同頁 4）', () => new Sim().hand('1 3 2 0 3 2 2 1 3 2 0 3 2 1 3').toEnd().ev],
  h6: ['2 0 1 5 1 2 3 1 7 0 2 6 5：LRU 曲線 ' + K.curves(S('2 0 1 5 1 2 3 1 7 0 2 6 5')).lru.join(',') + '（堆疊距離 2、3、…、7 各出現一次）', () => new Sim().hand('2 0 1 5 1 2 3 1 7 0 2 6 5').toEnd().ev],
  h7: ['3 5 4 5 1 0 4 1 3，3 個框：' + sum(S('3 5 4 5 1 0 4 1 3'), 3) + '（不同頁 5）', () => new Sim().hand('3 5 4 5 1 0 4 1 3').toEnd().ev],
  h8: ['3 2 4 0 3 2 1 3 5 2 0 1 3 5，4 個框：FIFO 曲線 ' + K.curves(S('3 2 4 0 3 2 1 3 5 2 0 1 3 5')).fifo.join(',') + '（3 框 10、4 框 12）', () => new Sim().hand('3 2 4 0 3 2 1 3 5 2 0 1 3 5').framesTo(4).toEnd().ev],
  h9: ['0 1 0 4 1 6 0 4 5 1 7 8 6：FIFO ' + K.curves(S('0 1 0 4 1 6 0 4 5 1 7 8 6')).fifo.join(',') + '，LRU ' + K.curves(S('0 1 0 4 1 6 0 4 5 1 7 8 6')).lru.join(','), () => new Sim().hand('0 1 0 4 1 6 0 4 5 1 7 8 6').toEnd().ev],
  h10: ['4 0 0 5 4 5 3 0 3 0，3 個框、LFU 預設（換出歸零）：LFU 曲線 ' + K.curves(S('4 0 0 5 4 5 3 0 3 0')).lfu.join(',') + '（2 框 6、3 框 7）', () => new Sim().hand('4 0 0 5 4 5 3 0 3 0').toEnd().ev]
};
const table = [];
Object.keys(sol).forEach(k => {
  const ev = sol[k][1]();
  expect(k, ev, true, sol[k][0]);
  const others = hidden.filter(m => short(m) !== k && run(m, ev)).map(short);
  table.push(k.padEnd(4) + '→ ' + (others.length ? '✗ 也完成了 ' + others.join('、') : '沒有連帶完成其他隱藏任務') + '；順便完成的公開任務：' + (which(ev, pub).join('、') || '無'));
  if (others.length) fail++;
});
// 「差一點」的反例
expect('h1', new Sim().hand('0 1 2 3 4 5 6 7 8 9').framesTo(6).toEnd().ev, false, '框數不是最大（6）不算');
expect('h1', new Sim().hand('0 1 2 3 4 5 6 7 8').framesTo(7).toEnd().ev, false, '只有 9 頁不算');
expect('h2', new Sim().hand('1 1 2 2 3 3 1 1 2 2 3 3').framesTo(1).toEnd().ev, false, '只有 3 種頁不算');
expect('h2', new Sim().hand('1 1 2 2 3 3 4 4 1 1 2 2').framesTo(2).toEnd().ev, false, '2 個框不算');
expect('h3', new Sim().hand('0 1 1 3 3 4 0 2 1 2').toEnd().ev, false, '只看過一種算法不算');
expect('h3', new Sim().hand('1 1 1 1 2 3 4 2 3 4 2 3 4').toEnd().keepTo(true).ev, false, '1 1 1 1 2 3 4 2 3 4 2 3 4：兩種算法都是 10，不算');
expect('h4', new Sim().hand('1 0 2 4 1 0 2 1').toEnd().framesTo(4).reverse().ev, false, '倒過來時框數不同不算');
expect('h4', new Sim().presetTo('silb').toEnd().reverse().ev, false, '範例倒過來不算（要自己輸入）');
expect('h4', new Sim().hand('1 2 3 4 3 2 1').toEnd().reverse().ev, false, '正反一樣的字串不算');
expect('h5', new Sim().toEnd().ev, false, '預設字串：LRU 12、OPT 9');
expect('h5', new Sim().hand('0 1 4 0 2 0 2 2 4 2 2 1 4 1 4').toEnd().ev, false, '0 1 4 0 2 0 2 2 4 2 2 1 4 1 4：' + sum(S('0 1 4 0 2 0 2 2 4 2 2 1 4 1 4'), 3) + '，OPT 只比不同頁數多 1、FIFO 只多 2，不算');
expect('h6', new Sim().hand('2 0 1 5 1 2 3 1 7 0 2 6 5 1').toEnd().ev, false, '後面多一個 1：LRU 曲線 ' + K.curves(S('2 0 1 5 1 2 3 1 7 0 2 6 5 1')).lru.join(',') + '，有一階站了兩個人，不算');
expect('h6', new Sim().toEnd().ev, false, '預設字串 LRU 曲線 ' + K.curves(PRESETS.silb).lru.join(',') + '（6、7 框一樣）');
expect('h7', new Sim().hand('3 5 4 5 1 0 4 1 3').framesTo(2).toEnd().ev, false, '同一串用 2 個框不算');
expect('h7', new Sim().hand('3 5 4 5 1 0 4 1 3 3 3 3 3').toEnd().ev, false, '同一串後面加到 13 個（結果一樣）就太長，不算');
expect('h2', (() => { const t = new Sim(); t.refs = S('1 1 2 2 3 3 4 4 1 1 2 2'); t.sheet = 'random'; return t.framesTo(1).toEnd().ev; })(), false, '同一串若是「隨機產生」得到的不算（要自己輸入）');
expect('h3', new Sim().hand('0 1 1 3 3 4 0 2 1 2 0 1 1').toEnd().keepTo(true).ev, false, '13 個參考就太長，不算');
expect('h8', new Sim().presetTo('belady').framesTo(4).toEnd().ev, false, '經典的 Belady 只多 1 次');
expect('h9', new Sim().hand('3 5 4 5 1 0 4 1 3').toEnd().ev, false, '3 5 4 5 1 0 4 1 3：LRU ' + K.curves(S('3 5 4 5 1 0 4 1 3')).lru.join(',') + '、FIFO ' + K.curves(S('3 5 4 5 1 0 4 1 3')).fifo.join(',') + '，不是每種框數都輸');
expect('h10', new Sim().hand('4 0 0 5 4 5 3 0 3 0').keepTo(true).toEnd().ev, false, '勾「保留次數」時 LFU 是堆疊演算法，曲線 ' + K.curves(S('4 0 0 5 4 5 3 0 3 0'), { lfuKeep: true }).lfu.join(',') + '，不算');
expect('h10', new Sim().hand('4 0 0 5 4 5 3 0 3 0').framesTo(2).toEnd().ev, false, '用 2 個框跑（異常在 2 → 3）不算');
console.log('\n十個隱藏任務的交叉檢查：');
table.forEach(l => console.log('  ' + l));

// ---------- 4. 亂按（像試玩工具）的誤觸率 ----------
const R = 400, STEPS = 300;
console.log('\n亂按模擬：' + R + ' 人 × 每人 ' + STEPS + ' 個隨機操作（框數 16%、隨機產生 12%、長度滑桿 6%、頁面種類滑桿 6%、範例 6%、亂打字串 10%、倒過來 6%、LFU 算法 5%、' +
  '播放 8%（一半播到最後）、單步 10%、直接跑完 10%、上一步 3%、重來 1%、全部清除 1%）；滑桿取隨機值、最小、最大；已在最後一步時每次改設定都送出事件：');
{
  const rand = K.rng(20261113);
  const hits = {}, pubHits = {};
  hidden.forEach(m => { hits[m.id] = 0; });
  let events = 0, multi = 0;
  const val = (lo, hi) => { const w = rand(); return w < 0.2 ? lo : w < 0.4 ? hi : lo + Math.floor(rand() * (hi - lo + 1)); };
  const PK = Object.keys(PRESETS);
  const junk = () => {
    const w = rand(), n = 1 + Math.floor(rand() * 34);
    let s = '';
    if (w < 0.4) { for (let i = 0; i < n; i++) s += Math.floor(rand() * 10); }
    else if (w < 0.8) { const a = []; for (let i = 0; i < n; i++) a.push(Math.floor(rand() * (rand() < 0.8 ? 10 : 120))); s = a.join(rand() < 0.5 ? ' ' : ','); }
    else s = ['abc', '1 2 x', '-3 4', '', '3.5 2', '９ ８', '1,,2,,3', '42'][Math.floor(rand() * 8)];
    return s;
  };
  for (let r = 0; r < R; r++) {
    const s = new Sim();
    for (let k = 0; k < STEPS; k++) {
      const u = rand();
      if (u < 0.16) s.framesTo(val(1, 7));
      else if (u < 0.28) s.random();
      else if (u < 0.34) s.lenTo(val(6, 30));
      else if (u < 0.40) s.kindsTo(val(2, 10));
      else if (u < 0.46) s.presetTo(PK[Math.floor(rand() * PK.length)]);
      else if (u < 0.56) s.type(junk());
      else if (u < 0.62) s.reverse();
      else if (u < 0.67) s.keepTo(!s.lfuKeep);
      else if (u < 0.75) { if (rand() < 0.5) s.play(); else s.playHalf(); }
      else if (u < 0.85) s.step();
      else if (u < 0.95) s.toEnd();
      else if (u < 0.98) s.back();
      else s.reset();
    }
    events += s.ev.length;
    hidden.forEach(m => { if (run(m, s.ev)) hits[m.id]++; });
    pub.forEach(m => { if (run(m, s.ev)) pubHits[m.id] = (pubHits[m.id] || 0) + 1; });
    s.ev.forEach(e => { const h = hidden.filter(m => { try { return m.check(e, {}); } catch (err) { return false; } }); if (h.length > 1) multi++; });
  }
  console.log('  （平均每人送出 ' + (events / R).toFixed(1) + ' 個 run 事件）');
  let worst = 0;
  hidden.forEach(m => { const p = hits[m.id] / R; worst = Math.max(worst, p); console.log('  ' + m.id.padEnd(22) + (p * 100).toFixed(2) + '%'); });
  if (worst >= 0.02) { fail++; console.log('  ✗ 有隱藏任務被亂按觸發的機率達到 2%'); } else console.log('  ✓ 每個隱藏任務被亂按觸發的機率都在 2% 以下');
  if (multi) { fail++; console.log('  ✗ 有 ' + multi + ' 個事件同時完成兩個以上的隱藏任務'); } else console.log('  ✓ 沒有任何一個事件同時完成兩個隱藏任務');
  console.log('  （參考：一般任務被亂按完成的比例 ' + pub.map(m => short(m) + ' ' + Math.round((pubHits[m.id] || 0) / R * 100) + '%').join('、') + '）');
}

// ---------- 5. 總覽 ----------
{
  console.log('\n總覽：一般任務 ' + pub.length + ' 個（等級 ' + pub.map(m => m.level).join('、') + '），隱藏任務 ' + hidden.length + ' 個（等級 ' + hidden.map(m => m.level).join('、') + '）');
  const okCount = pub.length >= 8 && pub.length <= 12 && hidden.length === 10 && hidden.every(m => m.level >= 3 && m.level <= 10 && m.riddle && m.riddle.zh && m.riddle.en && !m.desc) &&
    hidden.filter(m => m.level >= 7).length >= 3 && hidden.every(m => m.level * 2 <= 20);
  if (!okCount) { fail++; console.log('  ✗ 數量、等級或謎語不符合規則'); } else console.log('  ✓ 數量、等級（隱藏 3–10 級、' + hidden.filter(m => m.level >= 7).length + ' 個在 7 級以上、星星 ≤ 20）與謎語都符合規則');
}

console.log(fail ? `\n✗ ${fail} 項不符合` : '\n全部任務都證明做得到，預設狀態與亂按都不會誤觸。');
process.exitCode = fail ? 1 : 0;
