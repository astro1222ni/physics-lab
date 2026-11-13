/* 任務可達成的證明腳本。用法：node tools/mission-proofs/code-tracing.js
 * 用 js/code-tracing-core.js 產生和 js/code-tracing.js 完全相同的事件資料（'finish'、'guess'），證明：
 *   1. 每個任務在滑桿範圍內做得到，印出解法；
 *   2. 預設狀態不觸發任務（頁面載入不送事件；每支程式用預設數字跑完，只完成低等級的公開任務，不完成任何隱藏任務）；
 *   3. 十個隱藏任務的解法彼此不會順便完成另一個隱藏任務（印出交叉檢查表）；
 *   4. 靠運氣的任務算出隨便設一個數字碰中的機率；
 *   5. 固定種子的亂按模擬（400 人 × 300 次操作），印出每個任務被碰巧完成的比例，隱藏任務都要 < 2%。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/code-tracing-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/code-tracing.js');
const byId = id => missions.find(m => m.id === 'code-tracing-' + id);
const hidden = missions.filter(m => m.hidden);
const short = id => id.replace('code-tracing-', '');

// ---------- 與 js/code-tracing.js 相同的事件資料 ----------
// 同一支程式＋同一組數字的結果固定，先存起來（亂按模擬會跑很多次）
const cache = new Map();
function built(id, params) {
  const p = K.program(id);
  const full = Object.assign(K.defaults(p), params || {});
  const key = K.configKey(id, full);
  if (cache.has(key)) return cache.get(key);
  const b = K.build(id, full);
  if (cache.size < 4000) cache.set(key, b);
  return b;
}
/** 模擬一個頁面：記得哪些「程式＋數字」已經開始跑過（看過答案）。run = 送出猜測（可省略）後一路跑到最後 */
function page() {
  const seen = new Set();
  return {
    run(id, params, guess) {
      const b = built(id, params);
      const key = K.configKey(id, b.params);
      const fresh = !seen.has(key);          // 頁面在送出猜測時判斷；按第一步時才記成「看過」
      seen.add(key);
      const evs = [{ type: 'finish', data: K.finishEvent(b) }];
      if (guess != null) evs.push({ type: 'guess', data: K.guessEvent(b, guess, fresh) });
      return evs;
    }
  };
}
const ans = (id, params) => { const b = built(id, params); return K.answerOf(b.def, b.trace); };

let fail = 0;
function hits(m, events) { m.mem = {}; return events.some(e => !!m.check(e, m.mem)); }
function expect(id, events, want, note) {
  const ok = hits(byId(id), events);
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(4) + (want ? ' 達成：' : ' 不觸發：') + note);
}

// =====================================================================
console.log('預設狀態');
{
  // 頁面載入時不送任何事件；只有把程式跑到最後一步才送。
  // 每支程式用預設數字跑完（不猜、或猜錯）：只能完成 code-tracing-1，不能完成別的。
  const P = page();
  const evs = [];
  K.PROGRAMS.forEach(p => { evs.push(...P.run(p.id, {})); });
  const P2 = page();
  K.PROGRAMS.forEach(p => { evs.push(...P2.run(p.id, {}, 'xyz')); });
  const hit = missions.filter(m => m.id !== 'code-tracing-1' && hits(m, evs)).map(m => short(m.id));
  if (hit.length) { fail++; console.log('  ✗ 預設數字跑完觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 22 支程式用預設數字跑完（不猜或猜錯）都只完成 1');
  // 猜中預設答案：只完成 1、2（「先猜再看」），不完成隱藏任務
  const P3 = page();
  const ev3 = [];
  K.PROGRAMS.forEach(p => { ev3.push(...P3.run(p.id, {}, ans(p.id, {}))); });
  const hit3 = missions.filter(m => hits(m, ev3)).map(m => short(m.id));
  console.log('  ・22 支程式都用預設數字先猜中再跑完，會完成：' + hit3.join('、') + '（11 是連猜五中，屬於公開任務）');
  if (hit3.some(id => /^h/.test(id))) { fail++; console.log('  ✗ 預設數字猜中觸發了隱藏任務'); }
  const zero = K.PROGRAMS.filter(p => K.finishEvent(built(p.id, {})).zeroLoop).map(p => p.id);
  if (zero.length) { fail++; console.log('  ✗ 預設數字就有一圈也不跑的迴圈：' + zero.join('、')); }
}

// =====================================================================
console.log('\n公開任務的解法');
expect('1', page().run('swap', {}), true, '「交換兩個變數」直接跑完');
expect('1', page().run('factorial', { n: 13 }), false, '溢位停下來不算「跑到最後」');
expect('2', page().run('swap', {}, 'a = 8, b = 3'), true, '「交換兩個變數」先猜 a = 8, b = 3 再跑完');
expect('2', page().run('swap', {}, 'a=8,b=3'), true, '空白不同也算猜中');
{ const P = page(); P.run('swap', {}); expect('2', P.run('swap', {}, 'a = 8, b = 3'), false, '同一組數字已經跑過（看過答案）再猜中不算'); }
expect('2', page().run('swap', {}, 'a = 3, b = 8'), false, '猜錯');
expect('2', page().run('leap', {}, 'false'), true, '「閏年」問的是變數 leap：猜 false');
expect('3', page().run('offbyone', { n: 0 }), true, '「差一圈」n = 0：兩個迴圈都…第一個一圈也不跑');
expect('3', page().run('digits', { n: -5 }), true, '「拆出每一位數」n = −5：while (n > 0) 一開始就不成立');
expect('3', page().run('sum', {}), false, '1 加到 10');
expect('4', page().run('offbyone', { n: 3 }, '3 4'), true, '「差一圈」n = 3 先猜「3 4」');
expect('4', page().run('offbyone', { n: 2 }, '2 3'), false, 'n = 2 太小');
expect('4', page().run('offbyone', { n: 3 }, '3 3'), false, '猜錯');
expect('5', page().run('divmod', { a: -7, b: 2 }), true, '「整數除法與餘數」a = −7、b = 2：C 得 −3 與 −1，Python 得 −4 與 1');
expect('5', page().run('divmod', { a: 7, b: -2 }), true, 'a = 7、b = −2');
expect('5', page().run('divmod', { a: -8, b: 2 }), false, 'a = −8、b = 2 整除，兩邊一樣');
expect('5', page().run('divmod', { a: 7, b: 0 }), false, 'b = 0：除以 0，程式停下來');
expect('6', page().run('guard', { n: 5, t: 9 }), true, '「短路求值」n = 5、t = 9：i 走到 5 時 a[5] 不必算');
expect('6', page().run('guard', { n: 5, t: 0 }), false, 'n = 5、t = 0：在 i = 2 找到');
expect('6', page().run('guard', { n: 6, t: 9 }), false, 'n = 6、t = 9：讀 a[5]，索引超出範圍（' + K.finishEvent(built('guard', { n: 6, t: 9 })).error + '）');
expect('7', page().run('factorial', { n: 13 }), true, '「階乘」n = 13：12! = 479001600，再乘 13 就超過 int');
expect('7', page().run('factorial', { n: 12 }), false, 'n = 12 放得下');
expect('7', page().run('power', { b: 2, e: 31 }), true, '「次方」2 的 31 次方 = 2147483648 超過');
expect('7', page().run('power', { b: -2, e: 31 }), false, '(−2) 的 31 次方 = −2147483648 剛好是最小的 int');
expect('8', page().run('collatz', { n: 0 }), true, '「冰雹數」n = 0：0 是偶數，除以 2 還是 0，永遠到不了 1');
expect('8', page().run('collatz', { n: 1 }), false, 'n = 1：一圈也不跑');
{
  // 迴圈圈數用一般的輾轉相除法算（先抽 3000 組和直譯器核對），再數 0–1000 的所有組合
  const gcdIters = (a, b) => { let n = 0; while (b !== 0) { const r = a % b; a = b; b = r; n++; } return n; };
  const R0 = K.rng(7);
  for (let i = 0; i < 3000; i++) {
    const a = Math.floor(R0() * 1001), b = Math.floor(R0() * 1001);
    if (K.finishEvent(K.build('gcd', { a, b })).loops[0].iters !== gcdIters(a, b)) { fail++; console.log('  ✗ 圈數和直譯器不一致：' + a + ', ' + b); break; }
  }
  let best = null, cnt = 0, cnt15 = 0, tot = 0;
  for (let a = 0; a <= 1000; a++) for (let b = 0; b <= 1000; b++) {
    tot++;
    const n = gcdIters(a, b);
    if (n >= 12) { cnt++; if (!best || a + b < best[0] + best[1]) best = [a, b]; }
    if (n >= 15) cnt15++;
  }
  globalThis.GCD15 = cnt15 + ' / ' + tot;
  expect('9', page().run('gcd', { a: best[0], b: best[1] }), true, '「輾轉相除法」a = ' + best[0] + '、b = ' + best[1] + '（費氏數）跑 ' + gcdIters(best[0], best[1]) + ' 圈；0–1000 的所有組合中有 ' + cnt + ' / ' + tot + ' 組（' + (cnt / tot * 100).toFixed(3) + '%）至少 12 圈');
  expect('9', page().run('gcd', {}), false, '預設 84、36 只跑 ' + K.finishEvent(built('gcd', {})).loops[0].iters + ' 圈');
}
expect('10', page().run('echo', { n: 4 }, '4 3 2 1 1 2 3 4'), true, '「遞迴」n = 4 先猜「4 3 2 1 1 2 3 4」');
expect('10', page().run('echo', { n: 3 }, '3 2 1 1 2 3'), false, 'n = 3 太小');
expect('10', page().run('echo', { n: 4 }, '4 3 2 1'), false, '只猜到去程');
{
  const P = page();
  const evs = [].concat(P.run('swap', {}, 'a = 8, b = 3'), P.run('divmod', {}, '3 2 17'), P.run('max3', {}, '9'), P.run('grade', {}, 'C'), P.run('sum', {}, '55'));
  expect('11', evs, true, '交換、除法、取最大、等第、1 加到 n 連續猜中');
  const P2 = page();
  const ev2 = [].concat(P2.run('swap', {}, 'a = 8, b = 3'), P2.run('divmod', {}, '3 2 17'), P2.run('max3', {}, '9'), P2.run('grade', {}, 'B'), P2.run('sum', {}, '55'), P2.run('fizz', {}, '1 2 Fizz 4 Buzz Fizz'));
  expect('11', ev2, false, '第四支猜錯就重新算（之後只連中 2 支）');
  const P3 = page();
  const ev3 = [].concat(P3.run('swap', {}, 'a = 8, b = 3'), P3.run('swap', { a: 1 }, 'a = 8, b = 1'), P3.run('swap', { a: 2 }, 'a = 8, b = 2'), P3.run('swap', { a: 4 }, 'a = 8, b = 4'), P3.run('swap', { a: 5 }, 'a = 8, b = 5'));
  expect('11', ev3, false, '同一支程式猜中 5 次不算');
}
expect('12', page().run('collatz', { n: 27 }, '111'), true, '「冰雹數」n = 27 先猜 111（這個解法也會完成 h5）');
expect('12', page().run('collatz', { n: 7 }, '16'), false, 'n = 7 只有 16 步');
{
  let n12 = 2; while (+ans('collatz', { n: n12 }) < 20) n12++;
  const a12 = String(ans('collatz', { n: n12 })).trim();
  expect('12', page().run('collatz', { n: n12 }, a12), true, '最小的例子 n = ' + n12 + '：先猜 ' + a12 + ' 步（不會完成 h5）');
  expect('h5', page().run('collatz', { n: n12 }, a12), false, '同上，h5 沒有被順便完成');
}

// =====================================================================
console.log('\n隱藏任務的解法');
const SOL = {
  h1: ['「1 加到 n」n = 100（高斯）', () => page().run('sum', { n: 100 })],
  h2: ['「成績等第」分數 59 和 60 各跑一次', () => { const P = page(); return [].concat(P.run('grade', { s: 59 }), P.run('grade', { s: 60 })); }],
  h3: ['「閏年」2000 和 1900 各跑一次', () => { const P = page(); return [].concat(P.run('leap', { y: 2000 }), P.run('leap', { y: 1900 })); }],
  h4: ['「拆出每一位數」n = 0', () => page().run('digits', { n: 0 })],
  h5: ['「冰雹數」n = 27', () => page().run('collatz', { n: 27 })],
  h6: ['「把數字倒過來」1234 與 −1234 各跑一次', () => { const P = page(); return [].concat(P.run('reverse', { n: 1234 }), P.run('reverse', { n: -1234 })); }],
  h7: ['「平方和」a = 20（400 + 441 = 841 = 29 的平方）', () => page().run('square', { a: 20 })],
  h8: ['「輾轉相除法」a = 610、b = 987', () => page().run('gcd', { a: 610, b: 987 })],
  h9: ['「1 加到 n」n = 1000 先猜 500500', () => page().run('sum', { n: 1000 }, '500500')],
  h10: ['「冰雹數」n = 703', () => page().run('collatz', { n: 703 })]
};
Object.keys(SOL).forEach(k => expect(k, SOL[k][1](), true, SOL[k][0]));
console.log('  反例：');
{ const P = page(); expect('h2', [].concat(P.run('grade', { s: 58 }), P.run('grade', { s: 60 })), false, '58 與 60 不相鄰'); }
{ const P = page(); expect('h2', [].concat(P.run('grade', { s: 60 }), P.run('grade', { s: 61 })), false, '60 與 61 在分界的同一邊'); }
{ const P = page(); expect('h3', [].concat(P.run('leap', { y: 1800 }), P.run('leap', { y: 1900 }), P.run('leap', { y: 2100 })), false, '只跑不是閏年的整百年'); }
{ const P = page(); expect('h3', [].concat(P.run('leap', { y: 2000 }), P.run('leap', { y: 2024 })), false, '2000 和一般閏年'); }
expect('h4', page().run('digits', { n: -7 }), false, '負數也是 0 位，但不是「寫得出來卻數成沒有」的那個數');
{ const P = page(); expect('h6', [].concat(P.run('reverse', { n: 99999 }), P.run('reverse', { n: -99999 })), false, '±99999 是回文數（把 n 拉到最小、最大各跑一次）'); }
{ const P = page(); expect('h6', [].concat(P.run('reverse', { n: 1234 }), P.run('reverse', { n: -4321 })), false, '絕對值不同'); }
{ const P = page(); expect('h6', [].concat(P.run('reverse', { n: 7 }), P.run('reverse', { n: -7 })), false, '一位數'); }
expect('h7', page().run('square', { a: 3 }), false, 'a = 3：9 + 16 = 25 是最小的那一組（人人都知道）');
expect('h7', page().run('square', { a: -4 }), false, 'a = −4：16 + 9 = 25');
expect('h9', page().run('sum', { n: 1000 }), false, '沒先猜');
{ const P = page(); P.run('sum', { n: 1000 }); expect('h9', P.run('sum', { n: 1000 }, '500500'), false, '看過答案再猜'); }
expect('h9', page().run('collatz', { n: 0 }, '0'), false, '「冰雹數」n = 0 跑到 10000 步出錯：沒有答案');
{
  const peak = [];
  for (let n = 1; n <= 1000; n++) { const d = K.finishEvent(built('collatz', { n })); if (d.ok && d.peaks.n >= 250504) peak.push(n); }
  let most = 0, mostN = 0;
  for (let n = 1; n <= 1000; n++) { const d = K.finishEvent(built('collatz', { n })); if (d.ok && d.vars.steps > most) { most = d.vars.steps; mostN = n; } }
  console.log('  ・h10：1 到 1000 之中最高點 ≥ 250504 的 n：' + peak.join('、') + '；走最久的是 n = ' + mostN + '（' + most + ' 步）');
  if (peak.indexOf(mostN) >= 0) { fail++; console.log('  ✗ 謎語說「被拋得最高的不是待得最久的」，但兩者相同'); }
  cache.clear();
}

console.log('\n隱藏任務交叉表（列＝解法，欄＝被完成的隱藏任務）');
let cross = 0;
{
  const ids = Object.keys(SOL);
  console.log('        ' + ids.map(x => x.padStart(4)).join(''));
  ids.forEach(k => {
    const evs = SOL[k][1]();
    const row = ids.map(j => { const h = hits(byId(j), evs); if (h && j !== k) cross++; return (h ? (j === k ? '●' : '✗') : '·').padStart(4); });
    console.log('  ' + k.padEnd(5) + ' ' + row.join(''));
  });
  if (cross) { fail++; console.log('  ✗ 有 ' + cross + ' 個解法順便完成了別的隱藏任務'); }
  else console.log('  ✓ 每個解法只完成自己那一個隱藏任務');
}

// =====================================================================
console.log('\n靠運氣的機會：隨便設一個數字（範圍內均勻）就碰中的機率');
function luck(note, list, f) {
  let hit = 0;
  list.forEach(v => { if (f(v)) hit++; });
  console.log('  ・' + note + '：' + hit + ' / ' + list.length + '（' + (hit / list.length * 100).toFixed(3) + '%）');
  return hit / list.length;
}
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
luck('h1「1 加到 n」n = 0–1000', range(0, 1000), n => hits(byId('h1'), page().run('sum', { n })));
luck('h4「拆出每一位數」n = −99999–99999', range(-99999, 99999).filter((_, i) => i % 7 === 0).concat([0]), n => hits(byId('h4'), page().run('digits', { n })));
cache.clear();
luck('h5「冰雹數」n = 0–1000', range(0, 1000), n => hits(byId('h5'), page().run('collatz', { n })));
luck('h7「平方和」a = −50–50', range(-50, 50), a => hits(byId('h7'), page().run('square', { a })));
console.log('  ・h8「輾轉相除法」0–1000 的所有 (a, b) 中跑到 15 圈的：' + globalThis.GCD15 + '（只有 610、987）');
cache.clear();
luck('h10「冰雹數」n = 0–1000', range(0, 1000), n => hits(byId('h10'), page().run('collatz', { n })));
cache.clear();

// =====================================================================
// 亂按模擬：像學生隨便點每個控制項（固定種子，400 人 × 300 次操作），
// 算出每個任務被碰巧完成的人數比例。隱藏任務都要 < 2%（目標 ≤ 1%）。
console.log('\n亂按模擬（種子 20261113，400 人 × 300 次操作）');
{
  const STUDENTS = 400, ACTIONS = 300;
  const R = K.rng(20261113);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const pick = arr => arr[Math.floor(R() * arr.length)];
  const IDS = K.PROGRAMS.map(p => p.id);
  const JUNK = ['', '?', 'abc', '1', '0', '2', '10', 'true', 'false', '1 2 3', 'a = 3, b = 8', 'C', 'A', '-1', '100', '42'];
  const got = {};
  missions.forEach(m => { got[m.id] = 0; });
  for (let stu = 0; stu < STUDENTS; stu++) {
    // 頁面的初始狀態（和 js/code-tracing.js 一樣：「交換兩個變數」、預設數字；每支程式各自記住數字）
    const st = { id: 'swap', saved: {}, guess: null };
    const P = page();
    const done = new Set();
    missions.forEach(m => { m.mem = {}; });
    const params = () => st.saved[st.id] || (st.saved[st.id] = K.defaults(K.program(st.id)));
    for (let k = 0; k < ACTIONS; k++) {
      const u = R();
      if (u < 0.14) { st.id = pick(IDS); st.guess = null; }                 // 換程式（猜測清掉）
      else if (u < 0.40) {                                                   // 拉滑桿或在數字上打字：常常拉到最小或最大
        const pa = pick(K.program(st.id).params);
        const v = R();
        params()[pa.name] = v < 0.3 ? pa.min : v < 0.6 ? pa.max : v < 0.7 ? pa.def : ri(pa.min, pa.max);
        st.guess = null;
      } else if (u < 0.52) {                                                 // 在「先猜再看」亂打再送出
        const v = R();
        st.guess = v < 0.7 ? pick(JUNK) : String(ri(-20, 200));
      } else if (u < 0.88) {                                                 // 跑到最後一步（單步、播放、直接跑完）
        const evs = P.run(st.id, Object.assign({}, params()), st.guess);
        st.guess = null;
        evs.forEach(ev => missions.forEach(m => { if (!done.has(m.id) && m.check(ev, m.mem)) done.add(m.id); }));
      } else if (u < 0.92) { st.guess = null; }                              // 全部清除（記住的數字與看過的答案不變）
      // 其餘：看畫面、按上一步、重來、切換 C／Python（不送事件）
    }
    done.forEach(id => { got[id]++; });
  }
  let worst = 0;
  const rows = missions.map(m => {
    const p = got[m.id] / STUDENTS;
    if (m.hidden) worst = Math.max(worst, p);
    return '  ' + (m.hidden ? (p < 0.02 ? (p <= 0.01 ? '✓ ' : '△ ') : '✗ ') : '  ') + short(m.id).padEnd(4) + ' ' + (m.hidden ? '隱藏' : '公開') + ' ' + String(m.level).padStart(2) + ' 級：' + (p * 100).toFixed(2) + '%';
  });
  console.log(rows.join('\n'));
  if (worst >= 0.02) { fail++; console.log('  ✗ 有隱藏任務亂按就有 2% 以上的人碰巧完成'); }
  else console.log('  ✓ 每個隱藏任務被碰巧完成的比例都 < 2%（最高 ' + (worst * 100).toFixed(2) + '%）');
}

// =====================================================================
const pub = missions.filter(m => !m.hidden);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;
const stars = missions.reduce((s, m) => s + starsOf(m), 0);
console.log(`\n公開 ${pub.length} 個、隱藏 ${hidden.length} 個，共 ${stars} 顆星（公開 ${pub.reduce((s, m) => s + m.level, 0)}、隱藏 ${hidden.reduce((s, m) => s + starsOf(m), 0)}，隱藏任務是等級 × 2）。`);
console.log('隱藏任務等級：' + hidden.map(m => short(m.id) + '=' + m.level).join('、') + '（7 級以上 ' + hidden.filter(m => m.level >= 7).length + ' 個）');
if (hidden.length !== 10) { fail++; console.log('隱藏任務不是 10 個。'); }
if (hidden.filter(m => m.level >= 7).length < 3) { fail++; console.log('7 級以上的隱藏任務少於 3 個。'); }
if (hidden.some(m => m.level < 3 || m.level > 10 || !m.riddle || !m.riddle.zh || !m.riddle.en || m.desc)) { fail++; console.log('隱藏任務的等級或謎語格式不對。'); }
if (pub.length < 8 || pub.length > 12) { fail++; console.log('公開任務不是 8–12 個。'); }
if (pub.some(m => m.level < 1 || m.level > 10 || !m.title || !m.desc || !m.desc.en)) { fail++; console.log('公開任務的等級或說明格式不對。'); }
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發，隱藏任務彼此不會順便完成。');
