// 以 Node 執行：node tests/stack-queue-core.test.js
'use strict';
const assert = require('assert');
const S = require('../js/stack-queue-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const rand = S.rng(20261113);
const ri = n => Math.floor(rand() * n);

// ---------- 獨立的參考做法（不用堆疊的寫法） ----------
/** 反覆刪掉相鄰的 ()、[]、{}，最後是空字串才合法 */
function refBalanced(s) {
  let t = s.replace(/[^()[\]{}]/g, ''), prev;
  do { prev = t; t = t.replace(/\(\)|\[\]|\{\}/g, ''); } while (t !== prev);
  return t === '';
}
/** 遞迴下降剖析中序式：expr := term (('+'|'-') term)*；term := pow (('*'|'/'|'%') pow)*；pow := atom ('^' pow)?（右結合） */
function refParse(str) {
  const toks = S.tokenize(str).tokens;
  let i = 0;
  const peek = () => toks[i], next = () => toks[i++];
  function atom() {
    const t = next();
    if (!t) throw new Error('end');
    if (t.t === 'num') return { n: t.v };
    if (t.t === 'lp') { const e = expr(); const c = next(); if (!c || c.t !== 'rp') throw new Error('paren'); return e; }
    throw new Error('bad');
  }
  function pow() { const a = atom(); if (peek() && peek().v === '^') { next(); return { op: '^', a: a, b: pow() }; } return a; }
  function term() { let a = pow(); while (peek() && '*/%'.includes(peek().v) && peek().t === 'op') { const o = next().v; a = { op: o, a: a, b: pow() }; } return a; }
  function expr() { let a = term(); while (peek() && '+-'.includes(peek().v) && peek().t === 'op') { const o = next().v; a = { op: o, a: a, b: term() }; } return a; }
  const e = expr();
  if (i !== toks.length) throw new Error('trailing');
  return e;
}
function post(tree) { return tree.op ? post(tree.a) + ' ' + post(tree.b) + ' ' + tree.op : String(tree.n); }
/** 照 C 的規則（Math.trunc）用 Number 計算（數字小時精確），算樹的值 */
function refVal(tree) {
  if (!tree.op) return tree.n;
  const a = refVal(tree.a), b = refVal(tree.b);
  if (a === null || b === null) return null;
  const r = refOp(tree.op, a, b);
  return r === null ? null : r + 0;                    // +0：把 −0 變成 0
}
function refOp(op, a, b) {
  switch (op) {
    case '+': return a + b; case '-': return a - b; case '*': return a * b;
    case '/': return b === 0 ? null : Math.trunc(a / b) + 0;
    case '%': return b === 0 ? null : a - b * Math.trunc(a / b) + 0;
    case '^': { if (b < 0) return null; let r = 1; for (let k = 0; k < b; k++) r *= a; return Math.abs(r) > 1e15 ? null : r; }
  }
}
/** 隨機中序式（小數字、隨機括號） */
function randExpr(depth) {
  if (depth <= 0 || rand() < 0.3) return String(ri(13));
  const op = '+-*/%^'[ri(rand() < 0.15 ? 6 : 5)];
  let a = randExpr(depth - 1), b = randExpr(depth - 1);
  if (op === '^') b = String(ri(4));
  const s = a + ' ' + op + ' ' + b;
  return rand() < 0.4 ? '(' + s + ')' : s;
}

console.log('括號配對');
test('已知例子：合法、三種錯誤、最大深度、跳過其他字元', () => {
  const ok = S.parens('{[(1+2)*3]-4}/5');
  assert.ok(ok.ok); assert.strictEqual(ok.maxDepth, 3); assert.strictEqual(ok.kinds, 3); assert.strictEqual(ok.pairs.length, 3);
  assert.deepStrictEqual(ok.steps.map(s => s.act), ['push', 'push', 'push', 'match', 'match', 'match', 'endOk']);
  assert.strictEqual(S.parens('(1+2))*3').err.code, 'extraRight');
  assert.strictEqual(S.parens('(1+2))*3').err.pos, 5);
  assert.strictEqual(S.parens('((1+2)*3').err.code, 'extraLeft');
  assert.strictEqual(S.parens('((1+2)*3').err.left, 1);
  const mm = S.parens('[1+2)*3');
  assert.strictEqual(mm.err.code, 'mismatch'); assert.strictEqual(mm.err.top, '['); assert.strictEqual(mm.err.pos, 4);
  assert.ok(S.parens('if (a[i] > 0) { b = (c + d); }').ok);
  assert.ok(S.parens('沒有括號也可以').ok);
  assert.strictEqual(S.parens('   ').err.code, 'empty');
  assert.strictEqual(S.parens('('.repeat(61)).err.code, 'tooLong');
});
test('「([)]」每種括號左右一樣多，仍然左右不對應（只數個數不夠，要用堆疊）', () => {
  const r = S.parens('([)]');
  assert.ok(r.balancedCounts); assert.strictEqual(r.err.code, 'mismatch');
});
test('長度 ≤ 8 的全部 ()[] 字串（87380 個）：合法與否和「反覆刪掉相鄰配對」相同；錯誤類型正確', () => {
  const al = '()[]';
  let n = 0;
  for (let L = 1; L <= 8; L++) {
    const tot = Math.pow(4, L);
    for (let x = 0; x < tot; x++) {
      let s = '', y = x;
      for (let k = 0; k < L; k++) { s += al[y % 4]; y = Math.floor(y / 4); }
      const r = S.parens(s);
      assert.strictEqual(r.ok, refBalanced(s), s);
      if (!r.ok) {
        // 參考：掃到出錯的位置之前，堆疊（用刪除法）一定是合法前綴
        if (r.err.code === 'extraRight') { const pre = s.slice(0, r.err.pos); assert.ok(refBalanced(pre), s); }
        if (r.err.code === 'extraLeft') {
          const used = new Set(); r.pairs.forEach(p => { used.add(p[0]); used.add(p[1]); });
          const rest = [...s].filter((c, i) => !used.has(i));
          assert.ok(rest.every(c => c === '(' || c === '['), s); assert.strictEqual(rest.length, r.err.left, s);
        }
        if (r.err.code === 'mismatch') assert.notStrictEqual(r.err.top, { ')': '(', ']': '[' }[r.err.ch], s);
      }
      n++;
    }
  }
  assert.strictEqual(n, 87380);
});
test('只有一種括號時：某個前綴右括號比左括號多 → 多了右括號；否則左括號比較多 → 多了左括號', () => {
  for (let L = 1; L <= 12; L++) for (let x = 0; x < (1 << L); x++) {
    let s = '', bal = 0, neg = false;
    for (let k = 0; k < L; k++) { const c = (x >> k) & 1 ? ')' : '('; s += c; bal += c === '(' ? 1 : -1; if (bal < 0) neg = true; }
    const r = S.parens(s);
    if (neg) assert.strictEqual(r.err.code, 'extraRight', s);
    else if (bal > 0) { assert.strictEqual(r.err.code, 'extraLeft', s); assert.strictEqual(r.err.left, bal); }
    else assert.ok(r.ok, s);
  }
});
test('最大深度 = 堆疊最高時的高度 = 前綴（左 − 右）的最大值；山脈圖從 0 開始、回到 0', () => {
  for (let t = 0; t < 3000; t++) {
    const n = 1 + ri(10);
    const list = S.allBalanced(n);
    const s = list[ri(list.length)];
    const r = S.parens(s);
    let b = 0, m = 0;
    for (const c of s) { b += c === '(' ? 1 : -1; m = Math.max(m, b); }
    assert.strictEqual(r.maxDepth, m);
    const d = S.depthProfile(r);
    assert.strictEqual(d.length, s.length + 1); assert.strictEqual(d[0], 0); assert.strictEqual(d[d.length - 1], 0);
    assert.strictEqual(Math.max(...d), m);
  }
});
test('卡特蘭數：n 對括號的合法排列有 C(n) 個（1, 1, 2, 5, 14, 42, 132, 429, 1430），每一個都被判為合法', () => {
  const C = [1, 1, 2, 5, 14, 42, 132, 429, 1430];
  for (let n = 0; n <= 8; n++) {
    assert.strictEqual(S.catalan(n), C[n]);
    const all = S.allBalanced(n);
    assert.strictEqual(all.length, C[n]);
    assert.strictEqual(new Set(all).size, C[n]);
    all.forEach(s => assert.ok(n === 0 || S.parens(s).ok, s));
  }
  // 反過來：所有 2n 長度的 ( ) 字串裡，合法的剛好 C(n) 個
  for (let n = 1; n <= 7; n++) {
    let cnt = 0;
    for (let x = 0; x < (1 << (2 * n)); x++) {
      let s = '';
      for (let k = 0; k < 2 * n; k++) s += (x >> k) & 1 ? ')' : '(';
      if (S.parens(s).ok) cnt++;
    }
    assert.strictEqual(cnt, C[n]);
  }
});

console.log('後序式求值');
test('已知例子', () => {
  assert.strictEqual(S.evalPostfix('3 4 + 2 *').value, 14);
  assert.strictEqual(S.evalPostfix('5 1 2 + 4 * + 3 -').value, 14);
  assert.strictEqual(S.evalPostfix('2 3 4 * +').value, 14);
  assert.strictEqual(S.evalPostfix('7 2 / 2 *').value, 6);
  assert.strictEqual(S.evalPostfix('7 2 2 * /').value, 1);
  assert.strictEqual(S.evalPostfix('7 2 * 2 /').value, 7);
  assert.strictEqual(S.evalPostfix('2 3 2 ^ ^').value, 512);
  assert.strictEqual(S.evalPostfix('2 3 ^ 2 ^').value, 64);
  assert.strictEqual(S.evalPostfix('0 0 ^').value, 1);
  assert.strictEqual(S.evalPostfix('42').value, 42);
  assert.strictEqual(S.evalPostfix('3 4 －').value, -1);            // 全形減號
  assert.strictEqual(S.evalPostfix('６ ２ ÷ 3 ×').value, 9);        // 全形數字、÷、×
  assert.strictEqual(S.evalPostfix('5 1 2 + 4 * + 3 -').maxDepth, 3);
});
test('先取出的是右運算元：「8 2 −」= 6、「8 2 ÷」= 4、「2 10 ^」= 1024', () => {
  assert.strictEqual(S.evalPostfix('8 2 -').value, 6);
  assert.strictEqual(S.evalPostfix('8 2 /').value, 4);
  assert.strictEqual(S.evalPostfix('2 10 ^').value, 1024);
  const r = S.evalPostfix('8 2 -');
  assert.strictEqual(r.steps[2].a, 8); assert.strictEqual(r.steps[2].b, 2);
});
test('整數除法向零取整、餘數和被除數同號（C99、Java 的規則）：−7/2 = −3、−7%2 = −1、7/−2 = −3、7%−2 = 1', () => {
  assert.strictEqual(S.idiv(-7, 2), -3); assert.strictEqual(S.imod(-7, 2), -1);
  assert.strictEqual(S.idiv(7, -2), -3); assert.strictEqual(S.imod(7, -2), 1);
  assert.strictEqual(S.idiv(-7, -2), 3); assert.strictEqual(S.imod(-7, -2), -1);
  assert.strictEqual(S.evalPostfix('0 7 - 2 /').value, -3);
  assert.strictEqual(S.evalPostfix('0 7 - 2 %').value, -1);
  for (let t = 0; t < 20000; t++) {
    const a = ri(200001) - 100000, b = (ri(2) ? 1 : -1) * (1 + ri(500));
    const q = S.idiv(a, b), m = S.imod(a, b);
    assert.strictEqual(q, Math.trunc(a / b) + 0, a + '/' + b);
    assert.strictEqual(a, q * b + m);                               // a = (a / b)·b + a % b
    assert.ok(Math.abs(m) < Math.abs(b));
    assert.ok(m === 0 || Math.sign(m) === Math.sign(a));
  }
});
test('大數也精確：2^53 − 1 可以，再大就「數字太大」；|底數| ≥ 2 的大指數直接判定太大', () => {
  assert.strictEqual(S.evalPostfix('2 53 ^ 1 -').err.code, 'overflow');   // 2^53 本身就超過了
  assert.strictEqual(S.evalPostfix('2 52 ^ 1 - 2 * 1 +').value, Number.MAX_SAFE_INTEGER);
  assert.strictEqual(S.evalPostfix('99999 99999 * 99999 *').value, 999970000299999);
  assert.strictEqual(S.evalPostfix('99999 99999 * 99999 * 99999 *').err.code, 'overflow');
  assert.strictEqual(S.evalPostfix('1 99999 ^').value, 1);
  assert.strictEqual(S.evalPostfix('0 1 - 99999 ^').value, -1);
  assert.strictEqual(S.evalPostfix('2 61 ^').err.code, 'overflow');
  assert.strictEqual(S.evalPostfix('3 0 2 - ^').err.code, 'negExp');
});
test('錯誤：運算元不夠、多餘的運算元、除以 0、括號、看不懂的字元、空白、太長', () => {
  const u = S.evalPostfix('1 +');
  assert.strictEqual(u.err.code, 'underflow'); assert.strictEqual(u.err.have, 1);
  assert.strictEqual(S.evalPostfix('+').err.have, 0);
  const x = S.evalPostfix('1 2 3 +');
  assert.strictEqual(x.err.code, 'extra'); assert.strictEqual(x.err.left, 2);
  assert.strictEqual(S.evalPostfix('4 0 /').err.code, 'div0');
  assert.strictEqual(S.evalPostfix('4 0 %').err.code, 'div0');
  assert.strictEqual(S.evalPostfix('(1 2 +)').err.code, 'paren');
  assert.strictEqual(S.evalPostfix('1 2 &').err.code, 'badChar');
  assert.strictEqual(S.evalPostfix('1.5 2 +').err.code, 'badChar');
  assert.strictEqual(S.evalPostfix('   ').err.code, 'empty');
  assert.strictEqual(S.evalPostfix('1 '.repeat(31)).err.code, 'tooLong');
  assert.strictEqual(S.evalPostfix('1+'.repeat(21)).err.code, 'tooMany');
  assert.strictEqual(S.evalPostfix('123456 1 +').err.code, 'numBig');
  // 每個錯誤都有中英文訊息
  ['underflow', 'extra', 'div0', 'negExp', 'overflow', 'paren', 'badChar', 'empty', 'tooLong', 'tooMany', 'numBig', 'missingOp', 'missingNum', 'endOp', 'unary', 'extraRight', 'extraLeft', 'mismatch'].forEach(c => {
    const m = S.message({ code: c, pos: 0, tok: '+', ch: ')', have: 1, left: 2, a: 1, b: -1, top: '(' });
    assert.ok(m.zh && m.en && !/[一-鿿]/.test(m.en), c);
  });
});

console.log('中序轉後序（調度場演算法）');
test('已知例子；^ 是右結合（2^3^2 = 512），改成左結合（ALGOL 60 的規定）則是 64', () => {
  const r = S.toPostfix('(3 + 4) * 2');
  assert.strictEqual(r.postfixStr, '3 4 + 2 *'); assert.strictEqual(r.value, 14); assert.strictEqual(r.parenPairs, 1);
  assert.strictEqual(S.toPostfix('1 + 2 * 3 - 4').postfixStr, '1 2 3 * + 4 -');
  assert.strictEqual(S.toPostfix('8 / (3 - 1) ^ 2').postfixStr, '8 3 1 - 2 ^ /');
  assert.strictEqual(S.toPostfix('8 / (3 - 1) ^ 2').value, 2);
  assert.strictEqual(S.toPostfix('2 ^ 3 ^ 2').postfixStr, '2 3 2 ^ ^');
  assert.strictEqual(S.toPostfix('2 ^ 3 ^ 2').value, 512);
  assert.strictEqual(S.toPostfix('2 ^ 3 ^ 2', { powLeft: true }).postfixStr, '2 3 ^ 2 ^');
  assert.strictEqual(S.valueLeftPow('2 ^ 3 ^ 2'), 64);
  assert.strictEqual(S.valueLeftPow('2 ^ 2 ^ 2'), 16);
  assert.strictEqual(S.toPostfix('2 ^ 2 ^ 2').value, 16);
  assert.strictEqual(S.toPostfix('{[1 + 2] * 3}').value, 9);
  assert.strictEqual(S.toPostfix('10 - 4 - 3').value, 3);      // 左結合
  assert.strictEqual(S.toPostfix('100 / 10 / 5').value, 2);
});
test('多餘的括號不改變後序式：(1 + 2) + 3、((1 + 2)) + 3 和 1 + 2 + 3 都是「1 2 + 3 +」；1 + (2 + 3) 不同', () => {
  ['(1 + 2) + 3', '((1 + 2)) + 3', '1 + 2 + 3', '((1) + (2)) + (3)'].forEach(e => assert.strictEqual(S.toPostfix(e).postfixStr, '1 2 + 3 +', e));
  assert.strictEqual(S.toPostfix('1 + (2 + 3)').postfixStr, '1 2 3 + +');
  assert.strictEqual(S.toPostfix('((1)) + (2)').parenPairs, 3);
});
test('不用括號時，左結合的運算子在運算子堆疊裡最多疊 2 層；^ 右結合可以一直疊上去', () => {
  for (let t = 0; t < 3000; t++) {
    const n = 2 + ri(8);
    let s = String(ri(9));
    for (let k = 1; k < n; k++) s += ' ' + '+-*/%'[ri(5)] + ' ' + (1 + ri(9));
    assert.ok(S.toPostfix(s).maxOps <= 2, s);
  }
  const r = S.toPostfix('1 + 2 * 2 ^ 2 ^ 2');
  assert.strictEqual(r.maxOps, 4); assert.strictEqual(r.value, 33);
  assert.ok(S.numbersFirst(r.postfix));
  assert.ok(S.numbersFirst(S.toPostfix('1 + (2 + (3 + (4 + 5)))').postfix));
  assert.ok(!S.numbersFirst(S.toPostfix('1 + 2 + 3').postfix));
});
test('隨機 3000 個中序式：後序式與遞迴下降剖析樹的後序走訪相同；值相同（含除以 0 等算不出來的情況）；數字的先後順序不變；後序式沒有括號', () => {
  let n = 0;
  while (n < 3000) {
    const e = randExpr(4);
    if (e.length > 60) continue;
    const r = S.toPostfix(e);
    assert.ok(r.ok, e + ' ' + JSON.stringify(r.err));
    const tree = refParse(e);
    assert.strictEqual(r.postfixStr, post(tree), e);
    const v = refVal(tree);
    if (v === null) assert.strictEqual(r.value, null, e);
    else assert.strictEqual(r.value, v, e);
    const numsIn = S.tokenize(e).tokens.filter(t => t.t === 'num').map(t => t.v);
    assert.deepStrictEqual(r.postfix.filter(t => t.t === 'num').map(t => t.v), numsIn);
    assert.ok(r.postfix.every(t => t.t === 'num' || t.t === 'op'));
    assert.strictEqual(r.postfix.length, r.nNums + r.nOps);
    assert.strictEqual(r.nNums, r.nOps + 1);
    // 求值時堆疊的最大高度和轉換時記下的一致
    assert.strictEqual(S.evalPostfix(r.postfixStr).maxDepth, r.evalMaxDepth);
    n++;
  }
});
test('語法錯誤：缺運算子、缺數、運算子結尾、負號開頭、三種括號錯誤、空括號', () => {
  const code = e => (S.toPostfix(e).err || {}).code;
  assert.strictEqual(code('1 2'), 'missingOp');
  assert.strictEqual(code('2 (3)'), 'missingOp');
  assert.strictEqual(code('(1) 2'), 'missingOp');
  assert.strictEqual(code('1 + * 2'), 'missingNum');
  assert.strictEqual(code('* 2'), 'missingNum');
  assert.strictEqual(code('1 +'), 'endOp');
  assert.strictEqual(code('-3 + 4'), 'unary');
  assert.strictEqual(code('2 * -3'), 'unary');
  assert.strictEqual(code('(-3)'), 'unary');
  assert.strictEqual(code('(1 + 2'), 'extraLeft');
  assert.strictEqual(code('1 + 2)'), 'extraRight');
  assert.strictEqual(code(')1('), 'extraRight');
  assert.strictEqual(code('[1 + 2)'), 'mismatch');
  assert.strictEqual(code('()'), 'missingNum');
  assert.strictEqual(code('(1 +)'), 'missingNum');
  assert.strictEqual(code('1 + x'), 'badChar');
  assert.strictEqual(code(''), 'empty');
  // 出錯時最後一步是 error，前面的步驟照常
  const r = S.toPostfix('1 + 2)');
  assert.strictEqual(r.steps[r.steps.length - 1].act, 'error');
  assert.strictEqual(r.steps.filter(s => s.act === 'out').length, 2);
});
test('步驟：每一步只動一個記號（輸出、進堆疊、出堆疊、丟掉括號），最後一步的輸出就是後序式', () => {
  for (let t = 0; t < 500; t++) {
    const e = randExpr(3);
    if (e.length > 60) continue;
    const r = S.toPostfix(e);
    let prevOut = 0, prevSt = 0;
    r.steps.forEach(s => {
      const dOut = s.out.length - prevOut, dSt = s.stack.length - prevSt;
      if (s.act === 'out') assert.ok(dOut === 1 && dSt === 0);
      if (s.act === 'push' || s.act === 'lp') assert.ok(dOut === 0 && dSt === 1);
      if (s.act === 'pop' || s.act === 'flush') assert.ok(dOut === 1 && dSt === -1);
      if (s.act === 'drop') assert.ok(dOut === 0 && dSt === -1);
      prevOut = s.out.length; prevSt = s.stack.length;
    });
    const last = r.steps[r.steps.length - 1];
    assert.strictEqual(last.out.map(S.tokStr).join(' '), r.postfixStr);
    assert.strictEqual(last.stack.length, 0);
  }
});

console.log('環狀佇列');
test('N 格最多放 N − 1 個（留一格空位）：空是 front = rear，滿是 (rear + 1) mod N = front；rear 會繞回 0', () => {
  for (let N = S.RING_MIN; N <= S.RING_MAX; N++) {
    const q = S.newRing(N, true);
    assert.ok(S.ringEmpty(q)); assert.strictEqual(S.ringDo(q, 'deq').err, 'empty');
    for (let k = 0; k < N - 1; k++) assert.ok(S.ringDo(q, 'enq').ok);
    assert.ok(S.ringFull(q)); assert.strictEqual(S.ringSize(q), N - 1);
    const f = S.ringDo(q, 'enq');
    assert.strictEqual(f.err, 'full'); assert.strictEqual(S.ringSize(q), N - 1);
    assert.strictEqual(q.rear, N - 1); assert.strictEqual(q.front, 0);
    const d = S.ringDo(q, 'deq');
    assert.strictEqual(d.v, 1); assert.strictEqual(q.front, 1);
    const e = S.ringDo(q, 'enq');                          // rear 從 N − 1 繞回 0
    assert.ok(e.ok && e.wrapped); assert.strictEqual(e.idx, N - 1); assert.strictEqual(q.rear, 0);
    assert.ok(S.ringFull(q)); assert.strictEqual(q.front, 1);
    for (let k = 0; k < N - 1; k++) S.ringDo(q, 'deq');
    assert.ok(S.ringEmpty(q)); assert.strictEqual(q.front, 0); assert.strictEqual(q.frontWraps, 1);
  }
});
test('隨機 20000 次操作：和「陣列 + 個數」的參考做法比對內容、個數、空滿與指標公式', () => {
  for (let N = S.RING_MIN; N <= S.RING_MAX; N++) {
    const q = S.newRing(N, true);
    const ref = [];
    let enq = 0, deq = 0;
    for (let t = 0; t < 2000; t++) {
      if (rand() < 0.55) {
        const r = S.ringDo(q, 'enq');
        if (ref.length < N - 1) { assert.ok(r.ok); ref.push(r.v); enq++; } else assert.strictEqual(r.err, 'full');
      } else {
        const r = S.ringDo(q, 'deq');
        if (ref.length) { assert.ok(r.ok); assert.strictEqual(r.v, ref.shift()); deq++; } else assert.strictEqual(r.err, 'empty');
      }
      assert.strictEqual(S.ringSize(q), ref.length);
      assert.strictEqual(q.rear, enq % N); assert.strictEqual(q.front, deq % N);
      assert.strictEqual(S.ringEmpty(q), ref.length === 0);
      assert.strictEqual(S.ringFull(q), ref.length === N - 1);
      for (let k = 0; k < ref.length; k++) assert.strictEqual(q.buf[(q.front + k) % N], ref[k]);
    }
  }
});
test('不繞回的陣列佇列：最多 N 個；rear 到 N 就不能再放——前面空出來也一樣（假溢位）', () => {
  const q = S.newRing(6, false);
  for (let k = 0; k < 6; k++) assert.ok(S.ringDo(q, 'enq').ok);
  assert.ok(q.trueFull);
  for (let k = 0; k < 6; k++) assert.ok(S.ringDo(q, 'deq').ok);
  assert.ok(S.ringEmpty(q)); assert.strictEqual(S.ringSize(q), 0);
  const r = S.ringDo(q, 'enq');
  assert.strictEqual(r.err, 'full'); assert.strictEqual(r.ev.size, 0); assert.ok(r.ev.trueFull);
  S.ringDo(q, 'clear');
  assert.ok(S.ringDo(q, 'enq').ok); assert.ok(!q.trueFull);
});

console.log('堆疊與佇列（模式一）');
test('後進先出、先進先出；滿了放不進去（溢位）、空的拿不出來（下溢），內容都不變', () => {
  const d = S.newDesk({ cap: 4 });
  [1, 2, 3, 4].forEach(v => assert.strictEqual(S.deskDo(d, 'push').v, v));
  const o = S.deskDo(d, 'push');
  assert.strictEqual(o.err, 'overflow'); assert.deepStrictEqual(d.A, [1, 2, 3, 4]); assert.strictEqual(d.next, 5);
  assert.strictEqual(S.deskDo(d, 'top').v, 4);
  const out = []; for (let k = 0; k < 4; k++) out.push(S.deskDo(d, 'pop').v);
  assert.deepStrictEqual(out, [4, 3, 2, 1]);
  const u = S.deskDo(d, 'pop'); assert.strictEqual(u.err, 'underflow'); assert.deepStrictEqual(d.A, []);
  assert.deepStrictEqual(u.ev.cycA, undefined);
  [5, 6, 7].forEach(() => S.deskDo(d, 'enq'));
  assert.strictEqual(S.deskDo(d, 'front').v, 5);
  const q = []; for (let k = 0; k < 3; k++) q.push(S.deskDo(d, 'deq').v);
  assert.deepStrictEqual(q, [5, 6, 7]);
  assert.strictEqual(S.deskDo(d, 'deq').err, 'underflow');
});
test('基本操作次數：放入、取出、查看各 1；搬到另一邊、排到隊尾各 2；失敗的不算', () => {
  const d = S.newDesk({ cap: 5 });
  S.deskDo(d, 'push'); S.deskDo(d, 'push'); S.deskDo(d, 'top'); S.deskDo(d, 'toR'); S.deskDo(d, 'rot'); S.deskDo(d, 'pop'); S.deskDo(d, 'pop');
  assert.strictEqual(d.ops, 1 + 1 + 1 + 2 + 2 + 1);
});
test('一個堆疊依序放入 1…n（中間可以取出），能得到的取出順序有 C(n) 種；1、2、3 取不出「3、1、2」', () => {
  for (let n = 1; n <= 7; n++) {
    const seen = new Set();
    (function go(d, pushed, popped) {
      if (popped === n) { seen.add(d.outA.join(',')); return; }
      if (pushed < n) { const e = clone(d); S.deskDo(e, 'push'); go(e, pushed + 1, popped); }
      if (d.A.length) { const e = clone(d); S.deskDo(e, 'pop'); go(e, pushed, popped + 1); }
    })(S.newDesk({ cap: 10 }), 0, 0);
    assert.strictEqual(seen.size, S.catalan(n), 'n=' + n);
    if (n === 3) { assert.ok(!seen.has('3,1,2')); assert.ok(seen.has('3,2,1') && seen.has('1,2,3') && seen.has('2,3,1')); }
  }
  function clone(d) { return Object.assign({}, d, { A: d.A.slice(), R: d.R.slice(), outA: d.outA.slice(), outR: d.outR.slice(),
    cycA: { pushed: d.cycA.pushed.slice(), popped: d.cycA.popped.slice(), pure: d.cycA.pure }, cycR: Object.assign({}, d.cycR) }); }
});
test('事件：堆疊從空到空記成一段（放入與取出的順序）；佇列也是', () => {
  const d = S.newDesk({ cap: 6 });
  let ev;
  [1, 2, 3].forEach(() => S.deskDo(d, 'push')); S.deskDo(d, 'pop'); S.deskDo(d, 'push'); S.deskDo(d, 'pop'); S.deskDo(d, 'pop');
  ev = S.deskDo(d, 'pop').ev;
  assert.deepStrictEqual(ev.cycA, { pushed: [1, 2, 3, 4], popped: [3, 4, 2, 1], pure: true });
  [1, 2, 3].forEach(() => S.deskDo(d, 'enq')); S.deskDo(d, 'deq'); S.deskDo(d, 'deq');
  ev = S.deskDo(d, 'deq').ev;
  assert.deepStrictEqual(ev.cycR.pushed, [5, 6, 7]); assert.deepStrictEqual(ev.cycR.popped, [5, 6, 7]); assert.ok(ev.cycR.pure);
});
test('只用「佇列 → 堆疊」「堆疊 → 佇列」：全部搬過去再搬回來，佇列剛好倒過來（4n 次基本操作）', () => {
  const d = S.newDesk({ cap: 8 });
  for (let k = 0; k < 6; k++) S.deskDo(d, 'enq');
  const ops0 = d.ops;
  for (let k = 0; k < 6; k++) S.deskDo(d, 'toL');
  let ev;
  for (let k = 0; k < 6; k++) ev = S.deskDo(d, 'toR').ev;
  assert.deepStrictEqual(ev.pass, { base: [1, 2, 3, 4, 5, 6], result: [6, 5, 4, 3, 2, 1] });
  assert.strictEqual(d.ops - ops0, 4 * 6);
});
test('調車場排序（Knuth TAOCP 2.2.1）：n = 5 的 120 種排列中，經過一個堆疊一輪就能排好的剛好 C(5) = 42 種（不含「2 3 1」型樣的排列）', () => {
  const perms = [];
  (function p(a, rest) { if (!rest.length) { perms.push(a); return; } rest.forEach((x, i) => p(a.concat([x]), rest.slice(0, i).concat(rest.slice(i + 1)))); })([], [1, 2, 3, 4, 5]);
  let sortable = 0;
  perms.forEach(base => {
    let found = false;
    (function go(d, taken) {
      if (found) return;
      if (taken === 5 && !d.A.length) return;
      if (taken < 5) { const e = cl(d); const r = S.deskDo(e, 'toL'); if (r.ok) { if (r.ev.pass) chk(r.ev.pass); go(e, taken + 1); } }
      if (d.A.length) { const e = cl(d); const r = S.deskDo(e, 'toR'); if (r.ev.pass) chk(r.ev.pass); else go(e, taken); }
    })(load(base), 0);
    function chk(p) { if (p.result.join() === '1,2,3,4,5') found = true; }
    const has231 = (() => { for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) for (let k = j + 1; k < 5; k++) if (base[k] < base[i] && base[i] < base[j]) return true; return false; })();
    assert.strictEqual(found, !has231, base.join(''));
    if (found) sortable++;
  });
  assert.strictEqual(sortable, 42);
  function load(base) { const d = S.newDesk({ cap: 8, auto: false }); base.forEach(v => { S.deskSet(d, { next: v }); S.deskDo(d, 'enq'); }); return d; }
  function cl(d) { return Object.assign({}, d, { A: d.A.slice(), R: d.R.slice(), outA: d.outA.slice(), outR: d.outR.slice(), pass: d.pass && Object.assign({}, d.pass), jos: null,
    cycA: { pushed: [], popped: [], pure: true }, cycR: { pushed: [], popped: [], pure: true, rots: 0 } }); }
});
test('約瑟夫問題：用佇列「排到隊尾」k − 1 次再「離開」，最後留下的人和遞迴公式 J(m) = (J(m − 1) + k) mod m 相同；J(41, 3) = 31', () => {
  assert.strictEqual(S.josephusFormula(41, 3), 31);
  assert.strictEqual(S.josephus(41, 3).survivor, 31);
  for (let n = 1; n <= 30; n++) for (let k = 1; k <= 8; k++) assert.strictEqual(S.josephus(n, k).survivor, S.josephusFormula(n, k), n + ',' + k);
  for (let n = 5; n <= 10; n++) for (let k = 2; k <= 6; k++) {
    const d = S.newDesk({ cap: 10 });
    for (let i = 0; i < n; i++) S.deskDo(d, 'enq');
    let ev = null;
    for (let m = 0; m < n - 1; m++) { for (let r = 0; r < k - 1; r++) S.deskDo(d, 'rot'); ev = S.deskDo(d, 'deq').ev; }
    assert.ok(ev.jos, n + ',' + k);
    assert.strictEqual(ev.jos.k, k); assert.strictEqual(ev.jos.n, n);
    assert.strictEqual(ev.jos.survivor, S.josephusFormula(n, k));
    assert.deepStrictEqual(ev.jos.out, S.josephus(n, k).order);
  }
});
test('兩個堆疊做出佇列：放進 A，B 空了才把 A 全部搬到 B，再從 B 取出——取出順序和放入順序相同', () => {
  const d = S.newDesk({ cap: 8, rk: 'stack' });
  const outB = [];
  const pop = () => { if (!d.R.length) while (d.A.length) S.deskDo(d, 'toR'); const r = S.deskDo(d, 'popB'); outB.push(r.v); return r.ev; };
  for (let k = 0; k < 3; k++) S.deskDo(d, 'push');
  pop(); pop();
  for (let k = 0; k < 4; k++) S.deskDo(d, 'push');
  let ev; for (let k = 0; k < 5; k++) ev = pop();
  assert.deepStrictEqual(outB, [1, 2, 3, 4, 5, 6, 7]);
  assert.deepStrictEqual(ev.two.outB, [1, 2, 3, 4, 5, 6, 7]); assert.ok(ev.two.ok); assert.strictEqual(ev.two.firstOut, 3);
  // B 還沒空就把 A 搬過去，順序就亂了
  const e = S.newDesk({ cap: 8, rk: 'stack' });
  S.deskDo(e, 'push'); S.deskDo(e, 'push'); S.deskDo(e, 'toR'); S.deskDo(e, 'push'); S.deskDo(e, 'toR');
  assert.deepStrictEqual([S.deskDo(e, 'popB').v, S.deskDo(e, 'popB').v], [3, 2]);
});

console.log(`\n${passed} 項測試通過`);
