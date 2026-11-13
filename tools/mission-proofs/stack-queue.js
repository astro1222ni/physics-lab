/* 任務可達成的證明腳本。用法：node tools/mission-proofs/stack-queue.js
 * 用計算核心模擬頁面（js/stack-queue.js）的狀態與事件：模式一 deskDo、模式二 ringDo 的事件資料就是頁面 emit 的資料；
 * 括號配對、後序式、中序轉後序的事件用核心的 scanEvent／evalEvent／convertEvent（頁面也用它們），只在跑到最後一步時送出。證明：
 *   1. 每個任務在滑桿範圍與精度內做得到（印出解法）；2. 預設狀態、所有範例都不觸發隱藏任務；
 *   3. 十個隱藏任務的解法不會順便完成另一個隱藏任務（交叉檢查表），公開任務的解法也不會；
 *   4. 固定種子的亂按模擬（400 人 × 每人 300 次，像學生隨便點每一個控制項；不打字），印出每個任務被碰巧完成的比例，隱藏任務都要 < 2%。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const S = require(ROOT + 'js/stack-queue-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/stack-queue.js');
const byId = id => missions.find(m => m.id === 'stack-queue-' + id);
const hidden = missions.filter(m => m.hidden);
const EX = S.EXAMPLES;

// ---------- 與頁面相同的狀態與事件 ----------
class Sim {
  constructor() {
    this.mode = 'desk';
    this.desk = S.newDesk({ cap: 6, rk: 'queue', next: 1, auto: true });
    this.ring = S.newRing(8, true);
    this.ev = [];
    this.x = {};
    ['paren', 'postfix', 'infix'].forEach(k => this.load(k, EX[k][0], k === 'postfix' ? 'example' : null));
  }
  emit(type, data) { this.ev.push({ type, data }); return this; }
  setMode(m) { this.mode = m; return this; }
  // ---------- 模式一 ----------
  d(op, n) { for (let i = 0; i < (n || 1); i++) { const r = S.deskDo(this.desk, op); this.ring.next = this.desk.next; this.emit('op', r.ev); } return this; }
  cap(n) { if (n !== this.desk.cap) S.deskSet(this.desk, { cap: n }); return this; }
  rk(k) { if (k !== this.desk.rk) S.deskSet(this.desk, { rk: k }); return this; }
  val(v) { this.desk.next = this.ring.next = v; return this; }
  auto(on) { this.desk.auto = this.ring.auto = on; return this; }
  vals(list) { this.auto(false); list.forEach(v => { this.val(v); this.d('enq'); }); return this.auto(true); }
  // ---------- 模式二 ----------
  r(op, n) { for (let i = 0; i < (n || 1); i++) { const r = S.ringDo(this.ring, op); this.desk.next = this.ring.next; this.emit('op', r.ev); } return this; }
  N(n) { if (n !== this.ring.N) this.rebuildRing(n, this.ring.wrap); return this; }
  wrap(on) { if (on !== this.ring.wrap) this.rebuildRing(this.ring.N, on); return this; }
  rebuildRing(n, w) { const keep = { next: this.ring.next, auto: this.ring.auto }; this.ring = Object.assign(S.newRing(n, w), keep); }
  // ---------- 模式三、四、五 ----------
  load(kind, str, src) {
    let res;
    if (kind === 'paren') res = S.parens(str);
    else if (kind === 'postfix') res = S.evalPostfix(str);
    else res = S.toPostfix(str);
    const typed = !S.isExample(kind, str);
    this.x[kind] = { str, res, k: 0, done: false, src: src || (typed ? 'typed' : 'example'), typed, fromParen: 0 };
    return this;
  }
  type(kind, str) { this.mode = kind; return this.load(kind, str); }
  example(kind, i) { this.mode = kind; return this.load(kind, EX[kind][i]); }
  adv(kind, n) {
    const x = this.x[kind], N = x.res.steps.length;
    if (!N) return this;
    x.k = Math.min(N, x.k + Math.max(1, n));
    if (x.k >= N && !x.done) {
      x.done = true;
      if (kind === 'paren') this.emit('scan', S.scanEvent(x.res, x.str));
      else if (kind === 'postfix') this.emit('eval', S.evalEvent(x.res, x.src, x.src === 'convert' ? x.typed : x.src === 'typed', x.fromParen));
      else this.emit('convert', S.convertEvent(x.res, x.str));
    }
    return this;
  }
  end(kind) { kind = kind || this.mode; return this.adv(kind, 1e9); }
  step(kind) { return this.adv(kind || this.mode, 1); }
  back(kind) { const x = this.x[kind || this.mode]; if (x.k > 0) { x.k--; x.done = false; } return this; }
  reset(kind) { const x = this.x[kind || this.mode]; x.k = 0; x.done = false; return this; }
  /** 「拿去求值」：中序轉後序成功時，把後序式送到後序式求值（不自動跑） */
  toEval() {
    const x = this.x.infix;
    if (!x.res.ok) return this;
    this.load('postfix', x.res.postfixStr, 'convert');
    this.x.postfix.typed = x.typed; this.x.postfix.fromParen = x.res.parenPairs;
    this.mode = 'postfix';
    return this;
  }
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
const all = events => missions.filter(m => run(m, events)).map(m => m.id.replace('stack-queue-', ''));

// ---------- 1. 預設狀態 ----------
console.log('預設狀態：');
{
  const s = new Sim();
  const ok = s.ev.length === 0;
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + '載入、預設值都不送出任何事件');
  // 每個範例都跑完一次（中序的範例再按「拿去求值」跑完）：沒有隱藏任務
  const s2 = new Sim();
  EX.paren.forEach((e, i) => s2.example('paren', i).end());
  EX.postfix.forEach((e, i) => s2.example('postfix', i).end());
  EX.infix.forEach((e, i) => s2.example('infix', i).end().toEval().end());
  const got = all(s2.ev);
  const h = got.filter(x => /^h/.test(x));
  if (h.length) fail++;
  console.log((h.length ? '  ✗ ' : '  ✓ ') + '每個範例都跑完（含拿去求值）：完成的任務只有 ' + (got.length ? got.join('、') : '（沒有）') + '；隱藏任務 ' + (h.length ? h.join('、') : '一個都沒有'));
  // 範例的結果
  EX.paren.forEach(e => { const r = S.parens(e); console.log('       括號範例「' + e + '」：' + (r.ok ? '配對成功，深度 ' + r.maxDepth + '、' + r.kinds + ' 種括號' : r.err.code)); });
  EX.postfix.forEach(e => { const r = S.evalPostfix(e); console.log('       後序範例「' + e + '」：' + (r.ok ? '= ' + r.value : r.err.code)); });
  EX.infix.forEach(e => { const r = S.toPostfix(e); console.log('       中序範例「' + e + '」：' + r.postfixStr + ' = ' + r.value + '（運算子堆疊最高 ' + r.maxOps + '）'); });
}

// ---------- 2. 公開任務 ----------
console.log('\n公開任務：');
expect('1', new Sim().d('push', 3).d('pop', 3).ev, true, '放入 1、2、3，取出 3、2、1');
expect('1', new Sim().d('push', 2).d('pop', 2).ev, false, '只放 2 個');
expect('1', new Sim().d('push').d('pop').d('push', 2).d('pop', 2).ev, false, '中途空過一次：兩段各不到 3 個');
expect('2', new Sim().d('enq', 3).d('deq', 3).ev, true, '排入 1、2、3，離開 1、2、3');
expect('2', new Sim().d('enq', 3).d('rot').d('deq', 3).ev, false, '中間用了「排到隊尾」（離開順序 2、3、1）');
expect('3', new Sim().cap(3).d('push', 4).ev, true, '容量 3，第 4 次放入溢位');
expect('3', new Sim().cap(3).d('enq', 4).ev, false, '佇列滿了（不是堆疊）');
expect('4', new Sim().type('paren', '{[(1+2)*3]-4}/5').end().ev, true, '「{[(1+2)*3]-4}/5」：三種括號、深度 3');
expect('4', new Sim().example('paren', 2).end().ev, false, '範例「if (a[i] > 0) { b = (c + d); }」：三種但深度只有 2');
expect('5', new Sim().type('paren', '(1+2))').end().type('paren', '((1+2)').end().type('paren', '[1+2)').end().ev, true, '「(1+2))」「((1+2)」「[1+2)」');
expect('5', new Sim().type('paren', '(1+2))').end().example('paren', 3).end().ev, false, '只做出兩種');
{
  const s = new Sim().type('postfix', '1 2 + 3 + 4 *').end();
  expect('6', s.ev, true, '「1 2 + 3 + 4 *」= ' + s.x.postfix.res.value);
  expect('6', new Sim().type('postfix', '4 6 *').end().ev, false, '「4 6 *」只有 2 個數字');
}
expect('7', new Sim().val(1).d('push', 3).d('pop', 2).d('push', 2).d('pop', 3).ev, true, '放 1、2、3，取 3、2，放 4、5，取 5、4、1');
expect('7', new Sim().val(1).d('push', 5).d('pop', 5).ev, false, '全部放完再取：5、4、3、2、1');
expect('8', new Sim().setMode('ring').N(5).r('enq', 4).r('deq').r('enq', 2).ev, true, 'N = 5：排入 4 個（滿）、離開 1 個、再排入（rear 繞回 0）、再排入 → 滿，front = 1');
expect('8', new Sim().setMode('ring').N(5).r('enq', 5).ev, false, '一開始就排滿（front = 0）');
{
  const s = new Sim().type('infix', '(3 + 4) * 2 - 1').end().toEval().end();
  expect('9', s.ev, true, '「(3 + 4) * 2 - 1」→「' + s.x.infix.res.postfixStr + '」，拿去求值 = ' + s.x.postfix.res.value);
  expect('9', new Sim().type('infix', '(3 + 4) * 2 - 1').end().ev, false, '只轉換、沒拿去求值');
  expect('9', new Sim().type('infix', '3 + 4 * 2 - 1').end().toEval().end().ev, false, '沒有括號');
}
expect('10', new Sim().d('enq', 5).d('toL', 5).d('toR', 5).ev, true, '排入 1–5，全部「佇列 → 堆疊」再全部「堆疊 → 佇列」：5、4、3、2、1（' + (4 * 5) + ' 次基本操作）');
expect('10', new Sim().d('enq', 5).d('toL', 2).d('toR', 2).d('toL', 3).d('toR', 3).ev, false, '兩個兩個翻：不是倒過來（2、1 換位而已）');
expect('10', new Sim().d('enq', 4).d('toL', 4).d('toR', 4).ev, false, '只有 4 個');
{
  const s = new Sim().rk('stack').d('push', 3).d('toR', 3).d('popB', 2).d('push', 3).d('popB').d('toR', 3).d('popB', 3);
  expect('11', s.ev, true, '放 1、2、3 → 全搬到 B → 取 1、2 → 放 4、5、6 → 取 3 → B 空了才把 4、5、6 全搬過去 → 取 4、5、6');
  expect('11', new Sim().rk('stack').d('push', 6).d('toR', 6).d('popB', 6).ev, false, '6 個全部放完才開始取（沒有穿插）');
  expect('11', new Sim().rk('stack').d('push', 3).d('toR', 3).d('popB', 2).d('push', 3).d('toR', 3).d('popB', 4).ev, false, 'B 還沒空就把 A 搬過去：取出 6、5、4、3（順序亂了）');
}
{
  const s = new Sim().type('infix', '1 + 2 * 2 ^ 2 ^ 2').end();
  expect('12', s.ev, true, '「1 + 2 * 2 ^ 2 ^ 2」：運算子堆疊 + × ^ ^ 疊到 ' + s.x.infix.res.maxOps + ' 層（^ 是右結合），值 ' + s.x.infix.res.value);
  expect('12', new Sim().type('infix', '1 + 2 * 3 - 4 / 5 % 6 + 7').end().ev, false, '只有左結合的運算子：最多 ' + S.toPostfix('1 + 2 * 3 - 4 / 5 % 6 + 7').maxOps + ' 層');
  expect('12', new Sim().type('infix', '1 + (2 * (3 - (4 + 5)))').end().ev, false, '有括號（括號也疊上去，但不算）');
}

// ---------- 3. 隱藏任務 ----------
console.log('\n隱藏任務（解法）：');
const CAT = ['((()))', '(()())', '(())()', '()(())', '()()()'];
const sol = {
  h1: ['後序式「1 2 + 3 + 4 + 5 + 6 +」：6 個數，堆疊最高只有 2 層（= 21）', () => new Sim().type('postfix', '1 2 + 3 + 4 + 5 + 6 +').end().ev],
  h2: ['「1 + 2 + 3」和「((1 + 2)) + 3」：多了 2 對括號，後序式都是「1 2 + 3 +」', () => new Sim().type('infix', '1 + 2 + 3').end().type('infix', '((1 + 2)) + 3').end().ev],
  h3: ['括號「([)]」：每種括號左右一樣多，仍然左右不對應', () => new Sim().type('paren', '([)]').end().ev],
  h4: ['不繞回、N = 4：排入 4 個（真的滿）、全部離開、再排入 → 一個都沒有卻「已滿」（假溢位）', () => new Sim().setMode('ring').wrap(false).N(4).r('enq', 4).r('deq', 4).r('enq').ev],
  h5: ['後序式「9 2 / 2 *」= 8 與「9 2 2 / *」= 9：同樣的數與運算子，整數除法的先後不同，答案不同', () => new Sim().type('postfix', '9 2 / 2 *').end().type('postfix', '9 2 2 / *').end().ev],
  h6: ['中序「2 ^ 3 ^ 2」：本頁（右結合）= 512，ALGOL 60（由左往右）= 64', () => new Sim().type('infix', '2 ^ 3 ^ 2').end().ev],
  h7: ['佇列排入 1、2、3、4，排到隊尾 3 次離開 4、2 次離開 3、1 次離開 2、離開 1：4、3、2、1', () => new Sim().d('enq', 4).d('rot', 3).d('deq').d('rot', 2).d('deq').d('rot').d('deq').d('deq').ev],
  h8: ['括號配對打出三對小括號的全部 5 種合法排法：' + CAT.join('、'), () => { const s = new Sim(); CAT.forEach(c => s.type('paren', c).end()); return s.ev; }],
  h9: ['佇列排入 1–6，每次「排到隊尾」2 次再「離開」，做 5 次：淘汰 ' + S.josephus(6, 3).order.join('、') + '，留下 ' + S.josephus(6, 3).survivor + '（J(6, 3)）', () => new Sim().d('enq', 6).d('rot', 2).d('deq').d('rot', 2).d('deq').d('rot', 2).d('deq').d('rot', 2).d('deq').d('rot', 2).d('deq').ev],
  h10: ['關掉自動加一，佇列排入 3、1、2、5、4；佇列 → 堆疊 3、1，堆疊 → 佇列 1，佇列 → 堆疊 2，堆疊 → 佇列 2、3，佇列 → 堆疊 5、4，堆疊 → 佇列 4、5：1、2、3、4、5', () =>
    new Sim().vals([3, 1, 2, 5, 4]).d('toL', 2).d('toR').d('toL').d('toR', 2).d('toL', 2).d('toR', 2).ev]
};
Object.keys(sol).forEach(h => expect(h, sol[h][1](), true, sol[h][0]));

console.log('\n隱藏任務（不觸發的情況）：');
expect('h1', new Sim().type('postfix', '1 2 + 3 + 4 + 5 +').end().ev, false, '只有 5 個數');
expect('h1', new Sim().type('postfix', '1 2 3 4 5 6 + + + + +').end().ev, false, '6 個數全部先放：深度 6');
expect('h2', new Sim().type('infix', '1 + 2 + 3').end().type('infix', '(1 + 2) + 3').end().ev, false, '只多 1 對括號');
expect('h2', new Sim().type('infix', '1 + 2 + 3').end().type('infix', '1 + ((2 + 3))').end().ev, false, '括號改變了順序（後序式不同）');
expect('h3', new Sim().type('paren', '[1+2)').end().ev, false, '左右不對應，但數量也不平衡');
expect('h3', new Sim().type('paren', '(1+2))(').end().ev, false, '數量平衡，但錯誤是「多了右括號」');
expect('h4', new Sim().setMode('ring').wrap(false).N(4).r('enq', 2).r('deq', 2).r('enq', 2).r('enq').ev, false, '沒有真的滿過（只是 rear 到底，裡面還有 2 個）');
expect('h4', new Sim().setMode('ring').N(4).r('enq', 3).r('deq', 3).r('enq', 4).ev, false, '環狀佇列：滿的時候裡面有 3 個');
expect('h5', new Sim().type('postfix', '8 2 / 2 *').end().type('postfix', '8 2 2 / *').end().ev, false, '8 能整除：兩種順序都是 8');
expect('h5', new Sim().example('postfix', 2).end().type('postfix', '7 2 2 / *').end().ev, false, '其中一個是範例「7 2 / 2 *」');
expect('h6', new Sim().type('infix', '2 ^ 2 ^ 2').end().ev, false, '2 ^ 2 ^ 2：兩種算法都是 16');
expect('h6', new Sim().type('infix', '(2 ^ 3) ^ 2').end().ev, false, '有括號：沒有爭議');
expect('h7', new Sim().d('enq', 3).d('rot', 2).d('deq').d('rot').d('deq').d('deq').ev, false, '只有 3 個');
expect('h7', new Sim().d('enq', 4).d('deq', 4).ev, false, '直接離開（1、2、3、4）');
expect('h8', (() => { const s = new Sim(); CAT.slice(0, 4).forEach(c => s.type('paren', c).end()); return s.ev; })(), false, '只排了 4 種');
expect('h8', (() => { const s = new Sim(); CAT.forEach(c => s.type('paren', c + '()').end()); return s.ev; })(), false, '四對括號（不是三對）');
expect('h9', new Sim().d('enq', 6).d('deq', 5).ev, false, '不轉，直接離開（k = 1）');
expect('h9', new Sim().d('enq', 6).d('rot', 2).d('deq').d('rot').d('deq').d('rot', 2).d('deq').d('rot', 2).d('deq').d('rot', 2).d('deq').ev, false, '有一次只轉 1 次（每次要一樣）');
expect('h9', new Sim().d('enq', 4).d('rot', 2).d('deq').d('rot', 2).d('deq').d('rot', 2).d('deq').ev, false, '只有 4 個人');
expect('h10', new Sim().vals([5, 4, 3, 2, 1]).d('toL', 5).d('toR', 5).ev, false, '5、4、3、2、1 倒過來（那是「整排倒過來」）');
expect('h10', new Sim().d('enq', 5).d('toL').d('toR').d('toL').d('toR').d('toL').d('toR').d('toL').d('toR').d('toL').d('toR').ev, false, '本來就排好了');
{
  // 被堆疊排序的排列都避開「2 3 1」型樣：例如 2、3、1 就排不好
  const base = [2, 3, 1, 5, 4];
  let any = false;
  // 窮舉全部的「佇列 → 堆疊」「堆疊 → 佇列」序列（每個數恰好進出一次）
  const seqs = [];
  (function gen(sq, inA, taken) { if (taken === 5 && inA === 0) { seqs.push(sq); return; } if (taken < 5) gen(sq.concat(['toL']), inA + 1, taken + 1); if (inA > 0) gen(sq.concat(['toR']), inA - 1, taken); })([], 0, 0);
  seqs.forEach(sq => { const s = new Sim().vals(base); sq.forEach(o => s.d(o)); if (run(byId('h10'), s.ev)) any = true; });
  if (any) fail++;
  console.log((any ? '  ✗ ' : '  ✓ ') + 'h10 不觸發：佇列 2、3、1、5、4（含「2 3 1」型樣）試遍全部 ' + seqs.length + ' 種搬法，都排不好');
}

// ---------- 交叉檢查 ----------
console.log('\n十個隱藏任務的交叉檢查（列：用哪個解法；欄：同時完成了哪些隱藏任務）：');
{
  const hs = hidden.map(m => m.id.replace('stack-queue-', ''));
  console.log('        ' + hs.map(h => h.padStart(4)).join(''));
  Object.keys(sol).forEach(h => {
    const ev = sol[h][1]();
    const row = hidden.map(m => run(m, ev));
    const extra = row.filter((x, i) => x && hs[i] !== h).length;
    if (extra) fail++;
    console.log('  ' + h.padEnd(5) + ' ' + row.map(x => (x ? '●' : '·').padStart(4)).join('') + (extra ? '   ✗ 連帶完成' : ''));
  });
  const pubSol = {
    '1': () => new Sim().d('push', 3).d('pop', 3).ev, '2': () => new Sim().d('enq', 3).d('deq', 3).ev, '3': () => new Sim().cap(3).d('push', 4).ev,
    '4': () => new Sim().type('paren', '{[(1+2)*3]-4}/5').end().ev,
    '5': () => new Sim().type('paren', '(1+2))').end().type('paren', '((1+2)').end().type('paren', '[1+2)').end().ev,
    '6': () => new Sim().type('postfix', '1 2 + 3 + 4 *').end().ev, '7': () => new Sim().val(1).d('push', 3).d('pop', 2).d('push', 2).d('pop', 3).ev,
    '8': () => new Sim().setMode('ring').N(5).r('enq', 4).r('deq').r('enq', 2).ev, '9': () => new Sim().type('infix', '(3 + 4) * 2 - 1').end().toEval().end().ev,
    '10': () => new Sim().d('enq', 5).d('toL', 5).d('toR', 5).ev,
    '11': () => new Sim().rk('stack').d('push', 3).d('toR', 3).d('popB', 2).d('push', 3).d('popB').d('toR', 3).d('popB', 3).ev,
    '12': () => new Sim().type('infix', '1 + 2 * 2 ^ 2 ^ 2').end().ev
  };
  const bad = [];
  Object.keys(pubSol).forEach(p => { const ev = pubSol[p](); hidden.forEach(m => { if (run(m, ev)) bad.push(p + '→' + m.id.replace('stack-queue-', '')); }); });
  if (bad.length) fail++;
  console.log((bad.length ? '  ✗ ' : '  ✓ ') + '公開任務的解法' + (bad.length ? '順便完成了隱藏任務：' + bad.join('、') : '都不會順便完成隱藏任務'));
}

// ---------- 4. 亂按模擬 ----------
const PEOPLE = 400, ACTIONS = 300;
console.log('\n亂按模擬（固定種子）：' + PEOPLE + ' 人 × 每人 ' + ACTIONS + ' 次，每次從畫面上看得到的控制項中隨機挑一個（不打字）：');
console.log('  五個模式按鈕、全部清除；模式一：放入、取出、看頂端、排入／放入 B、離開／取出 B、看前端／看 B 頂端、排到隊尾、兩個搬運按鈕、清空、');
console.log('  要放的數滑桿、放入後自動加一、容量滑桿、右邊放（佇列／第二個堆疊）；模式二：排入、離開、清空、要放的數、自動加一、陣列格數滑桿、繞回；');
console.log('  模式三、四、五：範例選單、上一步、單步、播放（隨機跑幾步）、直接跑完、重來、（中序）拿去求值。滑桿 20% 拉到最小、20% 最大、60% 隨機。');
{
  const rand = S.rng(20261113);
  const ri = n => Math.floor(rand() * n);
  const slider = (lo, hi) => { const u = rand(); return u < 0.2 ? lo : u < 0.4 ? hi : lo + ri(hi - lo + 1); };
  const hits = {}; missions.forEach(m => { hits[m.id] = 0; });
  for (let p = 0; p < PEOPLE; p++) {
    const s = new Sim();
    for (let a = 0; a < ACTIONS; a++) {
      const acts = [() => s.setMode('desk'), () => s.setMode('ring'), () => s.setMode('paren'), () => s.setMode('postfix'), () => s.setMode('infix'),
        () => { if (s.mode === 'desk') s.d('clear'); else if (s.mode === 'ring') s.r('clear'); else s.reset(); }];
      const Q = s.desk.rk === 'queue';
      if (s.mode === 'desk') acts.push(() => s.d('push'), () => s.d('pop'), () => s.d('top'), () => s.d(Q ? 'enq' : 'pushB'), () => s.d(Q ? 'deq' : 'popB'), () => s.d(Q ? 'front' : 'topB'),
        () => s.d('toR'), () => s.d('toL'), () => s.d('clear'), () => s.val(slider(S.VAL_MIN, S.VAL_MAX)), () => s.auto(!s.desk.auto), () => s.cap(slider(S.CAP_MIN, S.CAP_MAX)),
        () => s.rk('queue'), () => s.rk('stack'));
      if (s.mode === 'desk' && Q) acts.push(() => s.d('rot'));
      if (s.mode === 'ring') acts.push(() => s.r('enq'), () => s.r('deq'), () => s.r('clear'), () => s.val(slider(S.VAL_MIN, S.VAL_MAX)), () => s.auto(!s.ring.auto),
        () => s.N(slider(S.RING_MIN, S.RING_MAX)), () => s.wrap(!s.ring.wrap));
      if (/paren|postfix|infix/.test(s.mode)) {
        const k = s.mode;
        acts.push(() => s.example(k, ri(EX[k].length)), () => s.back(), () => s.step(), () => s.adv(k, 1 + ri(12)), () => s.end(), () => s.reset());
        if (k === 'infix') acts.push(() => s.toEval());
      }
      acts[ri(acts.length)]();
    }
    missions.forEach(m => { if (run(m, s.ev)) hits[m.id]++; });
  }
  let worst = 0, worstId = '';
  console.log('  公開任務：' + missions.filter(m => !m.hidden).map(m => m.id.replace('stack-queue-', '') + ' ' + (hits[m.id] / PEOPLE * 100).toFixed(1) + '%').join('、'));
  hidden.forEach(m => {
    const q = hits[m.id] / PEOPLE;
    if (q > worst) { worst = q; worstId = m.id; }
    console.log('  ' + m.id.padEnd(18) + '等級 ' + String(m.level).padStart(2) + '　' + (q * 100).toFixed(2) + '%（' + hits[m.id] + ' ／ ' + PEOPLE + ' 人）');
  });
  if (worst >= 0.02) { fail++; console.log('  ✗ ' + worstId + ' 被亂按完成的比例 ≥ 2%'); }
  else console.log('  ✓ 每個隱藏任務被亂按完成的比例都 < 2%（最高 ' + (worst * 100).toFixed(2) + '%）');
}

console.log(fail ? `\n✗ ${fail} 項不符合` : '\n全部任務都證明做得到；預設狀態與範例不觸發隱藏任務；隱藏任務互不連帶；亂按誤觸都 < 2%。');
process.exitCode = fail ? 1 : 0;
