// 以 Node 執行：node tests/code-tracing-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/code-tracing-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.msg ? e.msg.zh : e.message)); process.exitCode = 1; }
}
const rand = C.rng(20261113);
const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
/** 直接跑一段程式碼 */
function runSrc(src, opts) { return C.run(C.parse(src), opts); }
function out(src) { const t = runSrc(src); if (!t.ok) throw new Error('出錯：' + t.error.msg.zh); return t.output; }
function errKey(src) { const t = runSrc(src); return t.error ? t.error.key : null; }
function parseErr(src) { try { C.parse(src); return null; } catch (e) { return e.key; } }

console.log('詞法與語法');
test('記號：數字、名稱、關鍵字、運算子、字串、註解', () => {
  const r = C.tokenize('int x = 12; // 註解\nx += 3; /* 區塊 */ printf("a\\n%d", x);');
  const kinds = r.tokens.map(t => t.t + ':' + t.v).join(' ');
  assert.ok(kinds.startsWith('kw:int id:x op:= num:12 op:; id:x op:+= num:3 op:; id:printf op:( str:a\n%d op:, id:x op:) op:;'), kinds);
  assert.strictEqual(r.comments.length, 2);
});
test('參數：$名字 換成數值，記下位置，負數是一個記號', () => {
  const f = C.fill('int a = $a;\nint b = $b + $a;', { a: -2147483648, b: 7 });
  assert.strictEqual(f.src, 'int a = -2147483648;\nint b = 7 + -2147483648;');
  assert.deepStrictEqual(f.spans.map(s => [s.name, s.line, s.col, s.len]), [['a', 1, 8, 11], ['b', 2, 8, 1], ['a', 2, 12, 11]]);
  const t = C.tokenize(f.src, f.spans).tokens.filter(x => x.param);
  assert.deepStrictEqual(t.map(x => x.v), [-2147483648, 7, -2147483648]);
  assert.strictEqual(C.run(C.parse(f.src, f.spans)).vars.b, -2147483641);
});
test('不認得的字元、太大的數字、沒結尾的字串、太長的程式都說明原因', () => {
  assert.strictEqual(parseErr('int x = 3 @ 4;'), 'badChar');
  assert.strictEqual(parseErr('int x = 2147483648;'), 'bigNum');
  assert.strictEqual(parseErr('printf("abc);'), 'badStr');
  assert.strictEqual(parseErr('int x = 1;\n'.repeat(81)), 'tooLong');
  assert.strictEqual(parseErr('int x = 1;'.repeat(401)), 'tooLong');
});
test('++、-- 與指定只能當敘述；少了分號會指出來', () => {
  assert.strictEqual(parseErr('int x = 1; int y = x++;'), 'incInExpr');
  assert.strictEqual(parseErr('int x = 1; int y = ++x;'), 'incInExpr');
  assert.strictEqual(parseErr('int x = 1; if (x = 2) { }'), 'assignInExpr');
  assert.strictEqual(parseErr('int x = 1 int y = 2;'), 'expect');
  assert.strictEqual(parseErr('int f(int a) { return a; } int y = f(1);'), 'noMain');
  assert.strictEqual(parseErr('int f(int a) { return a; } int main() { int y = f(1, 2); return 0; }'), 'argCount');
  assert.strictEqual(parseErr('printf("%d %d\\n", 1);'), 'printfFmt');
});

console.log('整數除法與取餘數（C99：向零取整）');
test('經典的例子：−7 / 2 = −3、−7 % 2 = −1，Python 是 −4、1', () => {
  assert.strictEqual(out('printf("%d %d %d %d %d %d\\n", -7 / 2, -7 % 2, 7 / -2, 7 % -2, -7 / -2, -7 % -2);'), '-3 -1 -3 1 3 -1\n');
  assert.strictEqual(out('printf("%d %d %d\\n", 7 / 2, 7 % 2, 0 / 5);'), '3 1 0\n');
  assert.deepStrictEqual([C.pydiv(-7, 2), C.pymod(-7, 2), C.pydiv(7, -2), C.pymod(7, -2), C.pydiv(-7, -2), C.pymod(-7, -2)], [-4, 1, -4, -1, 3, -1]);
});
test('20000 組隨機整數：/ 與 Math.trunc 一致、(a / b) * b + a % b = a、餘數和 a 同號而且 |a % b| < |b|', () => {
  for (let k = 0; k < 20000; k++) {
    const a = k % 4 === 0 ? ri(-2147483647, 2147483647) : ri(-1000, 1000);
    let b = k % 3 === 0 ? ri(-2147483647, 2147483647) : ri(-50, 50);
    if (b === 0) b = 7;
    const q = C.cdiv(a, b), r = C.cmod(a, b);
    assert.strictEqual(q, Math.trunc(a / b) || 0);
    assert.strictEqual(q * b + r, a);
    assert.ok(r === 0 || Math.sign(r) === Math.sign(a), a + ' % ' + b);
    assert.ok(Math.abs(r) < Math.abs(b));
    const pq = C.pydiv(a, b), pr = C.pymod(a, b);
    assert.strictEqual(pq * b + pr, a);
    assert.ok(pr === 0 || Math.sign(pr) === Math.sign(b));
    // 兩者不同，剛好是「有餘數而且 a、b 異號」的時候
    assert.strictEqual(pq !== q, r !== 0 && (a < 0) !== (b < 0));
  }
});
test('執行時記下 C 與 Python 不同的除法（pyDiff），同號或整除時不記', () => {
  let t = runSrc('int a = -7; int q = a / 2; int r = a % 2; int s = a / 7; int u = 7 / 2;');
  assert.strictEqual(t.stats.pyDiffs, 2);
  const d = t.steps.filter(s => s.pyDiff).map(s => s.pyDiff[0]);
  assert.deepStrictEqual(d.map(x => [x.op, x.a, x.b, x.c, x.py]), [['/', -7, 2, -3, -4], ['%', -7, 2, -1, 1]]);
  t = runSrc('int x = 9; x /= -2; x %= 3;');
  assert.strictEqual(t.vars.x, -1);
  assert.strictEqual(t.stats.pyDiffs, 2);  // 9 // −2 = −5；−4 % 3 = 2
});
test('除以 0、−2147483648 / −1 都停下來說明', () => {
  assert.strictEqual(errKey('int a = 5; int b = 0; int c = a / b;'), 'div0');
  assert.strictEqual(errKey('int a = 5; int c = a % 0;'), 'div0');
  assert.strictEqual(errKey('int a = -2147483647 - 1; int c = a / -1;'), 'overflow');
  assert.strictEqual(errKey('int a = -2147483647 - 1; int c = a % -1;'), 'overflow');
});

console.log('32 位元有號整數與溢位');
test('剛好在範圍內不出錯，多一點就停下來', () => {
  assert.strictEqual(out('int a = 2147483647; printf("%d\\n", a);'), '2147483647\n');
  assert.strictEqual(out('int a = -2147483647 - 1; printf("%d\\n", a);'), '-2147483648\n');
  assert.strictEqual(errKey('int a = 2147483647; a = a + 1;'), 'overflow');
  assert.strictEqual(errKey('int a = 2147483647; a++;'), 'overflow');
  assert.strictEqual(errKey('int a = -2147483647 - 1; a--;'), 'overflow');
  assert.strictEqual(errKey('int a = 46341; int b = a * a;'), 'overflow');   // 46341² = 2147488281
  assert.strictEqual(out('int a = 46340; printf("%d\\n", a * a);'), '2147395600\n');
  assert.strictEqual(errKey('int a = -2147483647 - 1; int b = -a;'), 'overflow');
});
test('階乘：12! = 479001600 還放得下，13! 溢位；2 的 30 次方可以、31 次方溢位、(−2) 的 31 次方剛好是最小的 int', () => {
  assert.strictEqual(C.build('factorial', { n: 12 }).trace.output, '479001600\n');
  assert.strictEqual(C.build('factorial', { n: 13 }).trace.error.key, 'overflow');
  assert.strictEqual(C.build('power', { b: 2, e: 30 }).trace.output, '1073741824\n');
  assert.strictEqual(C.build('power', { b: 2, e: 31 }).trace.error.key, 'overflow');
  assert.strictEqual(C.build('power', { b: -2, e: 31 }).trace.output, '-2147483648\n');
  assert.strictEqual(C.build('power', { b: -2, e: 32 }).trace.error.key, 'overflow');
});

console.log('運算子的優先順序與短路求值');
/** 隨機運算式樹：同時產生 C 原始碼與參考值（用 JavaScript 照 C 的規則直接算，不經過本頁的剖析器） */
function randExpr(d) {
  if (d <= 0 || rand() < 0.25) { const v = ri(-9, 9); return { s: v < 0 ? '(' + v + ')' : String(v), v, b: false }; }
  const ops = ['+', '-', '*', '/', '%', '<', '<=', '>', '>=', '==', '!=', '&&', '||'];
  const op = ops[ri(0, ops.length - 1)];
  const l = randExpr(d - 1), r = randExpr(d - 1);
  const I = x => (typeof x === 'boolean' ? (x ? 1 : 0) : x);
  let v;
  switch (op) {
    case '+': v = I(l.v) + I(r.v); break;
    case '-': v = I(l.v) - I(r.v); break;
    case '*': v = I(l.v) * I(r.v); break;
    case '/': v = I(r.v) === 0 ? 'div0' : C.cdiv(I(l.v), I(r.v)); break;
    case '%': v = I(r.v) === 0 ? 'div0' : C.cmod(I(l.v), I(r.v)); break;
    case '<': v = I(l.v) < I(r.v); break;
    case '<=': v = I(l.v) <= I(r.v); break;
    case '>': v = I(l.v) > I(r.v); break;
    case '>=': v = I(l.v) >= I(r.v); break;
    case '==': v = I(l.v) === I(r.v); break;
    case '!=': v = I(l.v) !== I(r.v); break;
    case '&&': v = !I(l.v) ? false : !!I(r.v); break;
    case '||': v = I(l.v) ? true : !!I(r.v); break;
  }
  if (typeof v === 'number' && v === 0) v = 0;   // 不要 −0
  if (l.v === 'div0') v = 'div0';
  if (r.v === 'div0' && !((op === '&&' && !I(l.v)) || (op === '||' && l.v !== 'div0' && I(l.v)))) v = 'div0';
  return { s: '(' + l.s + ' ' + op + ' ' + r.s + ')', v, b: true };
}
test('3000 個隨機運算式（全部加括號）：本頁的結果和直接計算一致，含短路時右邊的除以 0 不會發生', () => {
  let n = 0;
  for (let k = 0; k < 3000; k++) {
    const e = randExpr(4);
    const t = runSrc('bool z = ' + e.s + ';\nint w = ' + e.s + ';');
    if (e.v === 'div0') { assert.strictEqual(t.error && t.error.key, 'div0', e.s); continue; }
    assert.ok(t.ok, e.s + ' ' + (t.error && t.error.key));
    const I = typeof e.v === 'boolean' ? (e.v ? 1 : 0) : e.v;
    assert.strictEqual(t.vars.w, I, e.s);
    assert.strictEqual(t.vars.z, I !== 0, e.s);
    n++;
  }
  assert.ok(n > 2000);
});
test('不加括號時照 C 的優先順序：* / % 先於 + −，比較先於 == !=，&& 先於 ||，一元的 ! 和 − 最先', () => {
  const cases = [
    ['2 + 3 * 4', 14], ['20 - 6 / 3 - 1', 17], ['7 - 3 - 2', 2], ['100 / 10 / 5', 2], ['17 % 5 * 2', 4], ['-3 * -2', 6], ['2 * -3 + 1', -5],
    ['1 + 2 < 4', 1], ['3 < 2 == 0', 1], ['1 == 1 < 2', 1], ['2 == 1 < 2', 0], ['2 > 1 > 0', 1], ['3 > 2 > 1', 0],
    ['1 || 0 && 0', 1], ['0 && 1 || 1', 1], ['!0 + 1', 2], ['!1 == 0', 1], ['-2 < 1 && 5 % 3 == 2', 1], ['!(1 < 2) || 3 != 3', 0]
  ];
  cases.forEach(([s, v]) => assert.strictEqual(runSrc('int w = ' + s + ';').vars.w, v, s));
});
test('短路求值：&& 左邊不成立、|| 左邊成立時，右邊完全不算（不會除以 0、不會越界）', () => {
  let t = runSrc('int z = 0; bool a = z != 0 && 10 / z > 1; bool b = z == 0 || 10 / z > 1;');
  assert.ok(t.ok);
  assert.strictEqual(t.vars.a, false); assert.strictEqual(t.vars.b, true);
  assert.strictEqual(t.stats.sc, 2);
  t = runSrc('int a[3] = {1, 2, 3}; int i = 0; while (i < 3 && a[i] != 9) { i++; }');
  assert.ok(t.ok); assert.strictEqual(t.vars.i, 3); assert.strictEqual(t.stats.sc, 1);
  assert.strictEqual(errKey('int a[3] = {1, 2, 3}; int i = 0; while (a[i] != 9 && i < 3) { i++; }'), 'index');
  // 條件代入數值的樣子：被跳過的右邊寫成 …
  const w = t.steps.filter(s => s.kind === 'while');
  assert.strictEqual(w[0].show, '0 < 3 && 1 != 9');
  assert.strictEqual(w[w.length - 1].show, '3 < 3 && …');
});

console.log('迴圈的執行順序');
const kinds = t => t.steps.map(s => s.kind + (s.cond === undefined ? '' : s.cond ? '+' : '-')).join(' ');
test('for 的三段：初始化一次，然後「條件 → 本體 → 更新」，最後一次條件為假', () => {
  const t = runSrc('int x = 0;\nfor (int i = 0; i < 2; i++) {\n    x++;\n}');
  assert.strictEqual(kinds(t), 'decl init fcond+ assign upd fcond+ assign upd fcond-');
  assert.deepStrictEqual(t.steps.filter(s => s.part).map(s => s.part), ['init', 'cond', 'upd', 'cond', 'upd', 'cond']);
  // 標出 for 那一行裡的哪一段（欄位）
  const f = t.steps.filter(s => s.part);
  const line = 'for (int i = 0; i < 2; i++) {';
  assert.strictEqual(line.slice(f[0].c0, f[0].c1), 'int i = 0');
  assert.strictEqual(line.slice(f[1].c0, f[1].c1), 'i < 2');
  assert.strictEqual(line.slice(f[2].c0, f[2].c1), 'i++');
  assert.strictEqual(t.vars.x, 2);
});
test('continue 之後還是會做 for 的更新；break 直接離開、不做更新', () => {
  let t = runSrc('int s = 0;\nfor (int i = 0; i < 3; i++) {\n    if (i == 1) {\n        continue;\n    }\n    s += i;\n}');
  assert.strictEqual(kinds(t), 'decl init fcond+ if- assign upd fcond+ if+ continue upd fcond+ if- assign upd fcond-');
  assert.strictEqual(t.vars.s, 2);
  t = runSrc('int s = 0;\nfor (int i = 0; i < 3; i++) {\n    if (i == 1) {\n        break;\n    }\n    s += i;\n}');
  assert.strictEqual(kinds(t), 'decl init fcond+ if- assign upd fcond+ if+ break');
});
test('while 的條件一開始就不成立：本體一次都不執行，記成「零圈」', () => {
  const t = C.build('sum', { n: 0 }).trace;
  assert.strictEqual(t.output, '0\n');
  assert.deepStrictEqual(Object.values(t.stats.loops).map(l => [l.acts, l.iters, l.zero]), [[1, 0, 1]]);
});
test('巢狀迴圈：內圈每次重新數圈數；星號三角形 printf("*") 執行 n(n + 1)/2 次', () => {
  for (let n = 0; n <= 8; n++) {
    const b = C.build('triangle', { n });
    assert.strictEqual(b.trace.vars.c, n * (n + 1) / 2);
    assert.strictEqual(b.trace.stats.lineCounts[5] || 0, n * (n + 1) / 2);   // 第 5 行 printf("*")
  }
  const t = C.build('triangle', { n: 3 }).trace;
  const inner = t.steps.filter(s => s.kind === 'assign' && s.line === 6).map(s => s.loops.map(l => l.iter).join('/'));
  assert.deepStrictEqual(inner, ['1/1', '2/1', '2/2', '3/1', '3/2', '3/3']);
});
test('步數上限：無窮迴圈在 10000 步停下來；冰雹數從 0 出發就是無窮迴圈', () => {
  const t = runSrc('int x = 0;\nwhile (true) {\n    x++;\n}');
  assert.strictEqual(t.error.key, 'steps');
  assert.strictEqual(t.steps.length, C.LIM.steps + 1);
  assert.strictEqual(C.build('collatz', { n: 0 }).trace.error.key, 'steps');
});

console.log('變數、陣列、區塊與函式');
test('區塊結束時裡面宣告的變數就消失；內層同名會遮住外層；同一層不能宣告兩次', () => {
  const t = runSrc('int x = 1;\nif (x == 1) {\n    int x = 5;\n    int y = x;\n}\nint z = x;');
  assert.ok(t.ok);
  assert.strictEqual(t.vars.z, 1);
  const inside = t.steps[3].frames[0].vars.map(v => v.name + '=' + v.v).join(' ');
  assert.strictEqual(inside, 'x=5 y=5');
  assert.strictEqual(t.steps[4].frames[0].vars.map(v => v.name).join(' '), 'x z');
  assert.strictEqual(errKey('int x = 1; int x = 2;'), 'redeclared');
  assert.strictEqual(errKey('int x; int y = x + 1;'), 'uninit');
  assert.strictEqual(errKey('int y = q;'), 'undeclared');
});
test('陣列：沒寫到的初值補 0；索引超出範圍就停下來', () => {
  const t = runSrc('int a[5] = {7, 8};\nint s = a[0] + a[1] + a[4];');
  assert.deepStrictEqual(t.vars.a, [7, 8, 0, 0, 0]);
  assert.strictEqual(t.vars.s, 15);
  assert.strictEqual(errKey('int a[3] = {0}; a[3] = 1;'), 'index');
  assert.strictEqual(errKey('int a[3] = {0}; int x = a[-1];'), 'index');
  assert.strictEqual(parseErr('int a[65];'), 'arrSize');
  assert.strictEqual(parseErr('int a[2] = {1, 2, 3};'), 'arrInit');
});
test('函式：參數傳值、return 帶回結果；遞迴的去程與回程；呼叫太深會停下來', () => {
  assert.strictEqual(C.build('square', { a: 3 }).trace.output, '25\n');
  const e = C.build('echo', { n: 4 }).trace;
  assert.strictEqual(e.output, '4 3 2 1 1 2 3 4 \n');
  assert.strictEqual(e.stats.maxDepth, 5);
  assert.strictEqual(e.steps.filter(s => s.kind === 'call').length, 5);
  assert.strictEqual(errKey('int f(int n) {\n    return f(n + 1);\n}\nint main() {\n    int x = f(0);\n    return 0;\n}'), 'depth');
  assert.strictEqual(errKey('int f(int n) {\n    if (n > 0) {\n        return 1;\n    }\n}\nint main() {\n    int x = f(0);\n    return 0;\n}'), 'noReturn');
  const t = runSrc('int add(int a, int b) {\n    a = a + b;\n    return a;\n}\nint main() {\n    int x = 2;\n    int y = add(x, 3);\n    printf("%d %d\\n", x, y);\n    return 0;\n}');
  assert.strictEqual(t.output, '2 5\n');   // 改了參數 a，呼叫端的 x 不變（傳值）
});
test('bool：比較的結果是 bool；printf 的 %d 印成 1 或 0；指定給 int 時是 1 或 0', () => {
  assert.strictEqual(out('bool b = 3 > 2;\nint k = b;\nprintf("%d %d %d\\n", b, k, !b);'), '1 1 0\n');
});

console.log('內建的小程式');
test('每一支程式的預設值都順利跑完，答案是預期的值', () => {
  const want = {
    swap: 'a = 8, b = 3\n', divmod: '3 2\n17\n', max3: '9\n', grade: 'C\n', leap: 'false', sum: '55\n', offbyone: '4 5\n', countdown: '10 7 4 1 \n',
    factorial: '120\n', power: '1024\n', digits: '4 10\n', reverse: '4321\n', gcd: '12\n', collatz: '8\n', fizz: '1\n2\nFizz\n4\nBuzz\nFizz\n',
    skip: '37\n', find: '4\n', guard: '2\n', triangle: '10', flip: '6 5 4 3 2 1 \n', square: '13\n', echo: '3 2 1 1 2 3 \n'
  };
  assert.strictEqual(C.PROGRAMS.length, 22);
  C.PROGRAMS.forEach(p => {
    const b = C.build(p.id, {});
    assert.ok(b.trace.ok, p.id);
    assert.strictEqual(C.answerOf(p, b.trace), want[p.id], p.id);
    assert.ok(b.trace.steps.length >= 4 && b.trace.steps.length <= 80, p.id + ' 預設步數 ' + b.trace.steps.length);
  });
});
test('每一支程式在參數的最小、最大與 200 組隨機值都不會讓直譯器本身出錯（只會有說明過的停止原因）', () => {
  const allowed = ['overflow', 'steps', 'div0', 'index'];
  C.PROGRAMS.forEach(p => {
    const sets = [C.defaults(p)];
    p.params.forEach(pa => { sets.push(Object.assign(C.defaults(p), { [pa.name]: pa.min })); sets.push(Object.assign(C.defaults(p), { [pa.name]: pa.max })); });
    for (let k = 0; k < 200; k++) { const o = {}; p.params.forEach(pa => { o[pa.name] = ri(pa.min, pa.max); }); sets.push(o); }
    sets.forEach(s => { const t = C.build(p.id, s).trace; if (!t.ok) assert.ok(allowed.includes(t.error.key), p.id + ' ' + JSON.stringify(s) + ' ' + t.error.key); });
  });
});
test('有名的數：高斯 1 + … + 100 = 5050；輾轉相除 (987, 610) 要 14 圈、0 到 1000 之間最多 15 圈只有 (610, 987)；冰雹數 27 走 111 步最高到 9232；1000 以內 871 走最久、703 衝最高', () => {
  assert.strictEqual(C.build('sum', { n: 100 }).trace.output, '5050\n');
  const g = C.build('gcd', { a: 987, b: 610 }).trace;
  assert.strictEqual(g.output, '1\n');
  assert.strictEqual(Object.values(g.stats.loops)[0].iters, 14);
  assert.strictEqual(Object.values(C.build('gcd', { a: 610, b: 987 }).trace.stats.loops)[0].iters, 15);
  let most = 0, who = [];
  for (let a = 0; a <= 1000; a++) for (let b = 0; b <= 1000; b++) {
    let x = a, y = b, k = 0;
    while (y !== 0) { const r = x % y; x = y; y = r; k++; }
    if (k > most) { most = k; who = []; }
    if (k === most) who.push(a + ',' + b);
  }
  assert.strictEqual(most, 15); assert.deepStrictEqual(who, ['610,987']);
  const c27 = C.build('collatz', { n: 27 }).trace;
  assert.strictEqual(c27.output, '111\n');
  assert.strictEqual(c27.stats.peaks.n, 9232);
  let best = [0, 0], high = [0, 0];
  for (let n = 1; n <= 1000; n++) {
    const t = C.build('collatz', { n }).trace;
    const s = +t.output;
    if (s > best[1]) best = [n, s];
    if (t.stats.peaks.n > high[1]) high = [n, t.stats.peaks.n];
  }
  assert.deepStrictEqual(best, [871, 178]);
  assert.deepStrictEqual(high, [703, 250504]);
});
test('閏年：1900 不是、2000 是、2024 是、2026 不是；1900 時 && 的右邊有算、2026 時右邊被短路', () => {
  const L = y => C.build('leap', { y }).trace;
  assert.deepStrictEqual([1900, 2000, 2024, 2026, 2100].map(y => L(y).vars.leap), [false, true, true, false, false]);
  assert.strictEqual(L(2026).stats.sc, 1);
  assert.strictEqual(L(1900).stats.sc, 0);
});
test('反轉負數：C 照樣得到 −4321，而且每一步的 / 與 % 都標出和 Python 不同', () => {
  const t = C.build('reverse', { n: -1234 }).trace;
  assert.strictEqual(t.output, '-4321\n');
  assert.strictEqual(t.stats.pyDiffs, 8);
});

console.log('轉成 Python');
const py = (src, o) => C.toPython(C.parse(src), o).lines.join('\n');
test('能寫成 range 的 for 用 range；改到迴圈變數或界限、或更新不是固定的步長時改用 while', () => {
  assert.strictEqual(py('int s = 0;\nfor (int i = 0; i < 10; i++) {\n    s += i;\n}'), 's = 0\nfor i in range(10):\n    s += i');
  assert.strictEqual(py('int n = 5;\nfor (int i = 1; i <= n; i += 2) {\n}'), 'n = 5\nfor i in range(1, n + 1, 2):\n    pass');
  assert.strictEqual(py('for (int i = 10; i >= 0; i--) {\n}'), 'for i in range(10, -1, -1):\n    pass');
  assert.strictEqual(py('int n = 5;\nfor (int i = 0; i < n; i++) {\n    n--;\n}'), 'n = 5\ni = 0\nwhile i < n:\n    n -= 1\n    i += 1');
  assert.strictEqual(py('int k = 2;\nfor (int i = 9; i > 0; i -= k) {\n}'), 'k = 2\ni = 9\nwhile i > 0:\n    pass\n    i -= k');
});
test('while 版的 for 遇到 continue：先做更新再 continue（不然 Python 會停不下來）', () => {
  const s = py('int k = 2;\nint s = 0;\nfor (int i = 0; i < 9; i += k) {\n    if (i == 4) {\n        continue;\n    }\n    s += i;\n}');
  assert.strictEqual(s, 'k = 2\ns = 0\ni = 0\nwhile i < 9:\n    if i == 4:\n        i += k\n        continue\n    s += i\n    i += k');
});
test('運算子換成 Python 的寫法，必要時加括號（比較不會變成連鎖比較、not 的範圍不變）', () => {
  assert.strictEqual(py('bool b = !(1 < 2) || 3 != 3 && true;'), 'b = not (1 < 2) or 3 != 3 and True');
  assert.strictEqual(py('int a = 3;\nbool b = a < 2 == false;'), 'a = 3\nb = (a < 2) == False');
  assert.strictEqual(py('int a = 7;\nint b = a - (a - 2) / 2 % 3;'), 'a = 7\nb = a - (a - 2) // 2 % 3');
  assert.strictEqual(py('int a = 7;\nint b = -(a + 1) * 2;'), 'a = 7\nb = -(a + 1) * 2');
  assert.strictEqual(py('int a = 7;\na /= 2;\na %= 2;'), 'a = 7\na //= 2\na %= 2');
  assert.strictEqual(py('bool f = 2 > 1;\nint k = f;\nint m = f + 1;'), 'f = 2 > 1\nk = int(f)\nm = int(f) + 1');
});
test('printf 換成 print：換行、end=""、f 字串；bool 印成 int', () => {
  assert.strictEqual(py('int x = 3;\nprintf("%d\\n", x);\nprintf("%d ", x);\nprintf("\\n");\nprintf("x = %d, {ok}\\n", x);\nprintf("*");\nprintf("%d\\n", x > 1);'),
    'x = 3\nprint(x)\nprint(x, end=" ")\nprint()\nprint(f"x = {x}, {{ok}}")\nprint("*", end="")\nprint(int(x > 1))');
});
test('陣列、函式、遞迴、main 的 return 0', () => {
  assert.strictEqual(py('int a[4] = {1, 2};\nint b[3] = {0};\nint c[2] = {5, 6};'), 'a = [1, 2] + [0] * 2\nb = [0] * 3\nc = [5, 6]');
  const e = C.toPython(C.build('echo', { n: 2 }).prog);
  assert.strictEqual(e.lines.join('\n'), 'def f(n):\n    if n == 0:\n        return\n    print(n, end=" ")\n    f(n - 1)\n    print(n, end=" ")\n\n\nf(2)\nprint()');
});
test('每一支內建程式：每一個執行到的步驟（除了函式結束、main 的 return）都對應得到 Python 的某一行', () => {
  C.PROGRAMS.forEach(p => {
    const b = C.build(p.id, {});
    const P = C.toPython(b.prog);
    b.trace.steps.forEach(s => {
      if (s.kind === 'fend' || s.kind === 'error') return;
      const n = b.prog.nodes[s.node];
      if (b.prog.hasMain && n && n.k === 'return' && b.prog.mainFunc.body.body.includes(n)) return;
      let lines = P.map[s.node] || P.byLine[s.line] || [];
      if (s.part && P.parts[s.node]) lines = P.parts[s.node][s.part];
      assert.ok(lines.length > 0, p.id + ' 第 ' + s.line + ' 行的 ' + s.kind);
    });
  });
});

console.log('先猜再看');
test('猜輸出：忽略多餘的空白與換行、等號逗號旁的空白、全形字；猜變數：整數或 true／false', () => {
  const sw = C.build('swap', {});
  assert.strictEqual(C.checkGuess(sw.def, sw.trace, 'a = 8, b = 3'), true);
  assert.strictEqual(C.checkGuess(sw.def, sw.trace, 'a=8,b=3'), true);
  assert.strictEqual(C.checkGuess(sw.def, sw.trace, 'a = 3, b = 8'), false);
  const fz = C.build('fizz', {});
  assert.strictEqual(C.checkGuess(fz.def, fz.trace, '1 2 Fizz 4 Buzz Fizz'), true);
  assert.strictEqual(C.checkGuess(fz.def, fz.trace, '12Fizz4BuzzFizz'), false);
  const dv = C.build('divmod', { a: -7, b: 2 });
  assert.strictEqual(C.checkGuess(dv.def, dv.trace, '−3 −1 −7'), true);
  assert.strictEqual(C.checkGuess(dv.def, dv.trace, '-4 1 -7'), false);
  const lp = C.build('leap', { y: 2000 });
  assert.ok(['true', 'True', '1', '真'].every(g => C.checkGuess(lp.def, lp.trace, g)));
  assert.strictEqual(C.checkGuess(lp.def, lp.trace, 'false'), false);
  const tr = C.build('triangle', { n: 5 });
  assert.strictEqual(C.checkGuess(tr.def, tr.trace, '１５'), true);
  assert.strictEqual(C.checkGuess(tr.def, tr.trace, '15.0'), false);
  assert.strictEqual(C.checkGuess(tr.def, tr.trace, ''), false);
  assert.strictEqual(C.checkGuess(C.program('factorial'), C.build('factorial', { n: 13 }).trace, '0'), null);   // 出錯時不判定
});

console.log('\n' + passed + ' 項通過' + (process.exitCode ? '，有失敗' : ''));
