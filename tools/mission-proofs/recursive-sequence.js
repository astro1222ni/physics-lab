/* 任務可達成的證明腳本。用法：node tools/mission-proofs/recursive-sequence.js
 * 用數學核心證明每個任務在滑桿範圍與打字精度內做得到（事件格式與 js/recursive-sequence.js 的 emitMode 相同），並確認預設狀態不會觸發任務。
 * 滑桿：p −1.5 到 1.5（打字到小數第 3 位）、q −5 到 5（2 位）、c 0 到 10（2 位）、k 0.1 到 5（3 位）、b 0.5 到 20（2 位）、r 0 到 4（3 位）、
 *       首項 −10 到 10（3 位）、邏輯斯諦首項 0 到 1（4 位）、項數 1 到 100；費氏型兩個起始項 −10 到 10（2 位）、項數 2 到 40。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const M = require(ROOT + 'js/recursive-sequence-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/recursive-sequence.js');
const byId = id => missions.find(m => m.id === 'recursive-sequence-' + id);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;
const dec = (v, d) => Math.abs(v * Math.pow(10, d) - Math.round(v * Math.pow(10, d))) < 1e-6;
const inR = (v, lo, hi, d) => v >= lo - 1e-12 && v <= hi + 1e-12 && dec(v, d);

const RANGE = { p: [-1.5, 1.5, 3], q: [-5, 5, 2], c: [0, 10, 2], k: [0.1, 5, 3], b: [0.5, 20, 2], r: [0, 4, 3] };
const DEF = { p: 0.5, q: 2, c: 1, k: 2, b: 10, r: 2.8 };
/** 蛛網圖事件：fn、參數（沒給的用預設）、首項、項數 */
function iter(fn, P0, a1, n) {
  const P = Object.assign({}, DEF, P0);
  Object.keys(P0).forEach(k => { const R = RANGE[k]; if (!inR(P[k], R[0], R[1], R[2])) throw new Error(k + ' 超出範圍：' + P[k]); });
  if (fn === 'logi' ? !inR(a1, 0, 1, 4) : !inR(a1, -10, 10, 3)) throw new Error('首項超出範圍：' + a1);
  if (!inR(n, 1, 100, 0)) throw new Error('項數超出範圍：' + n);
  const ts = M.iterate(fn, P, a1, n);
  return {
    type: 'iter', data: {
      fn: fn, p: P.p, q: P.q, c: P.c, k: P.k, b: P.b, r: P.r, a1: a1, n: n, ts: ts, an: ts.length === n ? ts[n - 1] : NaN,
      fixed: M.fixedPoints(fn, P).map(o => ({ x: o.x, stable: o.stable })), period: fn === 'logi' ? M.logiPeriod(P.r, a1) : null
    }
  };
}
function fib(a1, a2, n) {
  if (!(inR(a1, -10, 10, 2) && inR(a2, -10, 10, 2) && inR(n, 2, 40, 0))) throw new Error('費氏型超出範圍：' + a1 + '、' + a2 + '、' + n);
  const ts = M.fibTerms(a1, a2, n);
  return { type: 'fib', data: { a1: a1, a2: a2, n: n, ts: ts, an: ts[n - 1], ratio: ts[n - 2] !== 0 ? ts[n - 1] / ts[n - 2] : NaN } };
}

let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { ok = ok || !!m.check(e, m.mem); });
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}
function check(ok, msg) { if (!ok) fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + msg); }

// ---------- 預設狀態不觸發 ----------
{
  const evs = [iter('lin', {}, 0, 6), iter('sqrt', {}, 0, 6), iter('cf', {}, 0.5, 6), iter('cos', {}, 0, 6), iter('bab', {}, 0, 6), iter('logi', {}, 0.2, 6), fib(1, 1, 8)];
  const hit = missions.filter(m => { m.mem = {}; return evs.some(e => m.check(e, m.mem)); }).map(m => m.id);
  check(!hit.length, hit.length ? '預設狀態觸發了 ' + hit.join('、') : '預設狀態（六種遞迴各用預設參數、首項 0 或 0.2、6 項；費氏型 1, 1 前 8 項）依序切換都不觸發任務');
}

// ---------- 一次式 ----------
expect(1, [iter('lin', { p: 0.5, q: 2.5 }, 0, 10)], true, '0.5 a + 2.5，L = 5，從 0 出發第 10 項差 5 × 0.5^9 ≈ 0.0098');
expect(1, [iter('lin', { p: 0.8, q: 1 }, 0, 30)], true, '0.8 a + 1 也是 L = 5，第 30 項差 5 × 0.8^29 ≈ 0.0077');
expect(1, [iter('lin', { p: 0.5, q: 2 }, 0, 60), iter('lin', { p: 0.5, q: 2.5 }, 0, 9), iter('lin', { p: 0.5, q: 2.5 }, 4, 20), iter('lin', { p: -0.5, q: 3 }, 0, 20)], false, '預設的 L = 4、9 項還差 0.02、離 L 只有 1、p 是負的都不算');
expect(2, [iter('lin', { p: -0.5, q: -3 }, 0, 9)], true, '−0.5 a − 3，L = −2，從 0 出發第 9 項差 2 × 0.5^8 ≈ 0.0078');
expect(2, [iter('lin', { p: -0.5, q: 3 }, 0, 60), iter('lin', { p: -1, q: -4 }, 0, 20), iter('lin', { p: -0.5, q: -3 }, -1, 20)], false, 'L = 2、p = −1 永遠來回、離 L 只有 1 都不算');
expect(3, [iter('lin', { p: 1.5, q: 2 }, -3.9, 17)], true, '1.5 a + 2，L = −4，從 −3.9 出發第 17 項差 0.1 × 1.5^16 ≈ 65.7');
expect(3, [iter('lin', { p: 1.5, q: 2 }, -3.9, 16), iter('lin', { p: 1.5, q: 2 }, -4, 60), iter('lin', { p: 1.5, q: 2 }, -3, 30)], false, '16 項只差 43.8、從 L 出發不動、離 L 1 都不算');
expect(4, [iter('lin', { p: -0.5, q: 3 }, 2, 3)], true, '−0.5 a + 3 從 L = 2 出發：2, 2, 2');
expect(4, [iter('lin', { p: -1.5, q: 5 }, 2, 6)], true, '−1.5 a + 5，L = 2（不穩定，但剛好站在上面也不動）');
expect(4, [iter('lin', { p: 0.5, q: 2 }, 4, 5), iter('lin', { p: -0.5, q: 0 }, 0, 5), iter('lin', { p: -0.5, q: 3 }, 2, 2)], false, 'p 是正的、q = 0、只畫 2 項都不算');
{
  // 滑桿的端點與 0（亂按最常出現的值）碰不到負 p 的交點
  const hits = [];
  [-1.5, -1, -0.5, -0.05].forEach(p => [-5, -2.5, 2.5, 5].forEach(q => [-10, 0, 10].forEach(a => { const m = byId(4); m.mem = {}; if (m.check(iter('lin', { p: p, q: q }, a, 10), m.mem)) hits.push(p + ',' + q + ',' + a); })));
  check(!hits.length, hits.length ? '任務 4 用端點就做得到：' + hits.join('；') : '任務 4 用滑桿端點與 0 做不到（負 p 的交點 |L| < 5、不是 0）');
}
expect('h1', [iter('lin', { p: 1, q: 1 }, -4, 5)], true, 'a + 1 從 −4 出發：−4, −3, −2, −1, 0');
expect('h1', [iter('lin', { p: 1, q: -2.5 }, 10, 5)], true, 'a − 2.5 從 10 出發：第 5 項 0');
expect('h1', [iter('lin', { p: 1, q: 1 }, -3, 4), iter('lin', { p: 1, q: 0 }, 0, 9), iter('lin', { p: 0.5, q: -1 }, -2, 6)], false, '只畫 4 項、q = 0、p 不是 1 都不算');

// ---------- 根號、連分數、cos、巴比倫 ----------
expect(5, [iter('sqrt', { c: 6 }, 0, 10)], true, '√(a + 6)：0, 2.449, 2.907, 2.984, …，第 10 項差 ' + (3 - M.iterate('sqrt', { c: 6 }, 0, 10)[9]).toExponential(1));
expect(5, [iter('sqrt', { c: 6 }, 0, 9), iter('sqrt', { c: 6 }, 10, 6), iter('sqrt', { c: 5.99 }, 0, 30)], false, '9 項、從 10 出發只畫 6 項、c = 5.99 都不算');
expect(6, [iter('cos', {}, 0, 17)], true, 'cos 從 0 出發：第 16 項差 ' + Math.abs(M.iterate('cos', {}, 0, 16)[15] - M.DOTTIE).toFixed(4) + '，第 17 項才差 ' + Math.abs(M.iterate('cos', {}, 0, 17)[16] - M.DOTTIE).toFixed(4));
expect(6, [iter('cos', {}, -10, 14)], true, '從 −10 出發是第 14 項');
expect(6, [iter('cos', {}, 0, 16), iter('cos', {}, 0, 18), iter('cos', {}, 0, 100), iter('cos', {}, 0.739, 4)], false, '16 項還不到、18 和 100 項多畫了、從 0.739 出發只有 4 項都不算');
expect('h3', [iter('sqrt', { c: 2 }, 0, 9)], true, '√(2 + √(2 + …)) 第 9 項差 ' + (2 - M.iterate('sqrt', { c: 2 }, 0, 9)[8]).toExponential(1));
expect('h3', [iter('sqrt', { c: 2 }, 0, 8), iter('sqrt', { c: 2 }, 2, 20), iter('sqrt', { c: 6 }, 0, 30)], false, '8 項還差 1.5 × 10^−4、從 2 出發、c = 6 都不算');
expect('h4', [iter('cf', { k: 1 }, 1, 15)], true, '1 + 1/a 從 1 出發：1, 2, 1.5, 1.667, …（費氏數的比），第 15 項差 ' + Math.abs(M.iterate('cf', { k: 1 }, 1, 15)[14] - M.PHI).toExponential(1));
expect('h4', [iter('cf', { k: 1 }, 1, 14), iter('cf', { k: 2 }, 1, 40), iter('cf', { k: 1 }, 1.618, 12)], false, '14 項、k = 2、只畫 12 項都不算');
expect('h9', [iter('bab', { b: 2 }, 1, 5)], true, '從 1 出發：1, 1.5, 1.41667, 1.4142157, 1.41421356（第 4 項差 2.1 × 10^−6，第 5 項才到）');
expect('h9', [iter('bab', { b: 2 }, 2, 5)], true, '從 2 出發也是第 5 項');
expect('h9', [iter('bab', { b: 2 }, 1, 4), iter('bab', { b: 2 }, 1, 6), iter('bab', { b: 2 }, -1, 5), iter('bab', { b: 3 }, 1, 5)], false, '4 項不夠、6 項多走了一步、負的首項走到 −√2、b = 3 都不算');
{
  // 從 0.1 到 10 的每個首項（0.1 一格），「第一個」都在第 2 到第 9 項之間：多一步、少一步都不算
  let ok = true;
  for (let a = 1; a <= 100; a++) {
    const ts = M.iterate('bab', { b: 2 }, a / 10, 20);
    const k = ts.findIndex(v => Math.abs(v - Math.SQRT2) < 1e-6);
    if (k < 1 || k > 8) ok = false;
  }
  check(ok, '巴比倫法從 0.1 到 10 出發，第一個差不到 10^−6 的項都在第 2 到第 9 項（只有剛好停在那一項才算）');
}

// ---------- 邏輯斯諦 ----------
expect(7, [iter('logi', { r: 3.2 }, 0.513, 10)], true, 'r = 3.2：兩點循環 0.5130、0.7995，首項打 0.513');
expect(7, [iter('logi', { r: 3.4 }, 0.8422, 10)], true, 'r = 3.4：首項 0.8422');
expect(7, [iter('logi', { r: 3.2 }, 0.2, 60), iter('logi', { r: 3.2 }, 0.52, 30), iter('logi', { r: 2.8 }, 0.6429, 60), iter('logi', { r: 3.2 }, 0.6875, 60)], false, '首項 0.2 只是最後才來回、0.52 差太多、r = 2.8 停在一點、站在不動點 0.6875 都不算');
{
  const hits = [];
  for (let i = 300; i <= 345; i++) for (let j = 0; j <= 100; j++) { const m = byId(7); m.mem = {}; if (m.check(iter('logi', { r: i / 100 }, j / 100, 10), m.mem)) hits.push(i / 100 + ',' + j / 100); }
  check(hits.length <= 6, '任務 7 用滑桿刻度（r、首項都 0.01 一格）只有 ' + hits.length + ' 組（共 4646 組）剛好落在兩點循環上：' + hits.join('；'));
}
expect(8, [iter('logi', { r: 3.5 }, 0.2, 30)], true, 'r = 3.5：四點循環');
expect(8, [iter('logi', { r: 3.2 }, 0.2, 40), iter('logi', { r: 3.55 }, 0.2, 40)], false, 'r = 3.2 是 2、3.55 是 8 都不算');
expect('h5', [iter('logi', { r: 3.83 }, 0.2, 30)], true, 'r = 3.83：三點循環');
expect('h5', [iter('logi', { r: 3.84 }, 0.5, 50)], true, 'r = 3.84 也是');
expect('h5', [iter('logi', { r: 3.7 }, 0.2, 50), iter('logi', { r: 3.83 }, 0.2, 29)], false, 'r = 3.7 混沌、29 項都不算');
expect('h6', [iter('logi', { r: 3.55 }, 0.2, 30)], true, 'r = 3.55：八點循環');
expect('h6', [iter('logi', { r: 3.5 }, 0.2, 30), iter('logi', { r: 3.57 }, 0.2, 30)], false, '3.5 是 4、3.57 已經混沌');
{
  const per = [];
  for (let i = 0; i <= 400; i++) { const r = i / 100, p = M.logiPeriod(r, 0.2); if (p === 8) per.push(r); }
  check(per.length >= 1, '滑桿刻度上（0.01 一格）八點循環的 r：' + per.join('、'));
}
expect('h2', [iter('logi', { r: 4 }, 0.75, 20)], true, 'r = 4、首項 0.75：4 × 0.75 × 0.25 = 0.75，一直不動');
expect('h2', [iter('logi', { r: 4 }, 0.75, 19), iter('logi', { r: 3.9 }, 0.75, 30), iter('logi', { r: 4 }, 0.74, 30)], false, '19 項、r = 3.9、首項 0.74 都不算');
expect('h8', [iter('logi', { r: 4 }, 0.2, 15), iter('logi', { r: 4 }, 0.2001, 15)], true, '0.2 → 0.2001（差 0.0001），第 15 項差 ' + Math.abs(M.iterate('logi', { r: 4 }, 0.2, 15)[14] - M.iterate('logi', { r: 4 }, 0.2001, 15)[14]).toFixed(3));
expect('h8', [iter('logi', { r: 4 }, 0.5, 30), iter('logi', { r: 4 }, 0.501, 30)], true, '0.5 → 0.501，第 30 項差 ' + Math.abs(M.iterate('logi', { r: 4 }, 0.5, 30)[29] - M.iterate('logi', { r: 4 }, 0.501, 30)[29]).toFixed(3));
expect('h8', [iter('logi', { r: 4 }, 0.2, 20), iter('logi', { r: 4 }, 0.2001, 20)], false, '0.2 → 0.2001 只畫 20 項時剛好又靠近（差 0.43），要換項數再試');
expect('h8', [iter('logi', { r: 4 }, 0.2, 20), iter('logi', { r: 4 }, 0.21, 20)], false, '用滑桿差 0.01 太多了');
expect('h8', [iter('logi', { r: 4 }, 0.2, 5), iter('logi', { r: 4 }, 0.2001, 5)], false, '只畫 5 項，差距還很小');
expect('h8', [iter('logi', { r: 3.5 }, 0.2, 30), iter('logi', { r: 3.5 }, 0.2001, 30)], false, 'r = 3.5 是四點循環，兩條都走進同一個循環');
expect('h8', [iter('logi', { r: 4 }, 0.2, 20), iter('logi', { r: 3.9 }, 0.2, 20), iter('logi', { r: 4 }, 0.2001, 20)], false, '中間換過 r 要重來');
expect('h8', [iter('logi', { r: 4 }, 0.7501, 30), iter('logi', { r: 4 }, 0.75, 30)], false, '落在不動點 0.75 那一次不算（避免和 h2 同時完成）');
expect('h10', [iter('logi', { r: 4 }, 0.1883, 4)], true, '0.1883 → 0.6113 → 0.9505 → 0.1883（a4 − a1 = ' + (M.iterate('logi', { r: 4 }, 0.1883, 4)[3] - 0.1883).toFixed(4) + '）');
expect('h10', [iter('logi', { r: 4 }, 0.117, 4)], true, '另一個三點循環 0.117 → 0.4132 → 0.9698');
expect('h10', [iter('logi', { r: 4 }, 0.75, 10), iter('logi', { r: 4 }, 0.3455, 10), iter('logi', { r: 4 }, 0.19, 10), iter('logi', { r: 3.83 }, 0.1883, 10)], false, '不動點、兩點循環 0.3455、滑桿刻度 0.19、r = 3.83 都不算');
{
  // 用滑桿（0.01 一格）拉不到：每一格 a4 − a1 都至少差 0.001
  const hits = [];
  for (let i = 0; i <= 100; i++) { const m = byId('h10'); m.mem = {}; if (m.check(iter('logi', { r: 4 }, i / 100, 10), m.mem)) hits.push(i / 100); }
  check(!hits.length, hits.length ? 'h10 用滑桿就拉得到：' + hits.join('、') : 'r = 4 時首項用滑桿 0 到 1（0.01 一格）都拉不到三點循環，要打字到第 4 位');
  const hits8 = [];
  for (let i = 0; i < 100; i++) for (let j = 0; j <= 100; j++) {
    if (i === j) continue;
    const m = byId('h8'); m.mem = {};
    m.check(iter('logi', { r: 4 }, i / 100, 30), m.mem);
    if (m.check(iter('logi', { r: 4 }, j / 100, 30), m.mem)) { hits8.push(i + '→' + j); break; }
  }
  check(!hits8.length, hits8.length ? 'h8 用滑桿就做得到：' + hits8.slice(0, 5).join('、') : 'h8 用滑桿（0.01 一格）換兩個起點都做不到，要打字');
}

// ---------- 費氏型 ----------
expect(9, [fib(4, 10, 7)], true, '4, 10, 14, 24, 38, 62, 100');
expect(9, [fib(6, 4, 8)], true, '6, 4, 10, …, 100：8 × 6 + 13 × 4 = 100');
expect(9, [fib(-10, 8, 11)], true, '−10, 8：21 × (−10) + 34 × 8 = 100');
expect(9, [fib(1, 1, 12), fib(1, 1, 11), fib(10, 10, 5)], false, '144、89、50 都不是');
expect(10, [fib(1, 2, 11)], true, '1, 2：第 11 項 / 第 10 項 = 144/89，差 ' + Math.abs(144 / 89 - M.PHI).toExponential(1) + '（前一個比 89/55 差 ' + Math.abs(89 / 55 - M.PHI).toExponential(1) + '）');
expect(10, [fib(3, 10, 12)], true, '3, 10 開始是第 12 項');
expect(10, [fib(1, 2, 10), fib(1, 2, 12), fib(1, 1, 11), fib(-1, 2, 30)], false, '10 項還不到、12 項多畫了、兩項一樣、有負數都不算');
expect('h7', [fib(10, -6.18, 10)], true, '10, −6.18：比 −0.618，之後 3.82, −2.36, 1.46, …');
expect('h7', [fib(-5, 3.09, 12)], true, '−5, 3.09 也是');
expect('h7', [fib(8, -5, 20), fib(10, -6.2, 20), fib(10, -6.18, 9)], false, '8, −5（−0.625）、10, −6.2、只畫 9 項都不算');
{
  const hits = [];
  for (let a = -10; a <= 10; a++) for (let b = -10; b <= 10; b++) { if (!a) continue; const m = byId('h7'); m.mem = {}; if (m.check(fib(a, b, 20), m.mem)) hits.push(a + ', ' + b); }
  check(!hits.length, hits.length ? 'h7 用整數就做得到：' + hits.join('；') : 'h7 用滑桿的整數做不到，要打字到小數');
}

// ---------- 挑戰 ----------
expect(11, [{ type: 'challenge', data: { time: 20, streak: 1, last3: null } }], true, '答對一題');
expect(12, [{ type: 'challenge', data: { time: 25, streak: 3, last3: 85 } }], true, '連續三題 85 秒');
expect(12, [{ type: 'challenge', data: { time: 35, streak: 3, last3: 91 } }], false, '超過 90 秒不算');
{
  const R = M.rng(7); let bad = 0, last = null;
  for (let t = 0; t < 1000; t++) {
    const g = M.genChallenge(R, last); last = g;
    try {
      const e = iter('lin', { p: g.p, q: g.q }, g.a1, 6);
      if (e.data.ts.some((v, i) => Math.abs(v - g.check[i]) > 1e-9)) throw new Error('算出來不同');
      if (!dec(g.p * 20, 0) || !dec(g.q * 10, 0) || !dec(g.a1 * 10, 0)) throw new Error('滑桿拉不到');
      // 答案唯一：前三項決定 p、q
      const p = (g.shown[2] - g.shown[1]) / (g.shown[1] - g.shown[0]);
      if (Math.abs(p - g.p) > 1e-9) throw new Error('p 不唯一');
    } catch (e) { bad++; }
  }
  check(!bad, bad ? '有 ' + bad + ' 題做不到' : '1000 題挑戰的答案都在滑桿刻度上（p 是 0.05 的倍數、q 和首項是整數），而且由前三項唯一決定');
}

// ---------- 任務之間不互相連帶 ----------
{
  const recipes = {
    1: [iter('lin', { p: 0.5, q: 2.5 }, 0, 10)], 2: [iter('lin', { p: -0.5, q: -3 }, 0, 9)], 3: [iter('lin', { p: 1.5, q: 2 }, -3.9, 17)],
    4: [iter('lin', { p: -0.5, q: 3 }, 2, 3)], 5: [iter('sqrt', { c: 6 }, 0, 10)], 6: [iter('cos', {}, 0, 17)],
    7: [iter('logi', { r: 3.2 }, 0.513, 10)], 8: [iter('logi', { r: 3.5 }, 0.2, 30)], 9: [fib(4, 10, 7)], 10: [fib(1, 2, 11)],
    h1: [iter('lin', { p: 1, q: 1 }, -4, 5)], h2: [iter('logi', { r: 4 }, 0.75, 20)], h3: [iter('sqrt', { c: 2 }, 0, 9)],
    h4: [iter('cf', { k: 1 }, 1, 15)], h5: [iter('logi', { r: 3.83 }, 0.2, 30)], h6: [iter('logi', { r: 3.55 }, 0.2, 30)],
    h7: [fib(10, -6.18, 10)], h8: [iter('logi', { r: 4 }, 0.2, 15), iter('logi', { r: 4 }, 0.2001, 15)],
    h9: [iter('bab', { b: 2 }, 1, 5)], h10: [iter('logi', { r: 4 }, 0.1883, 4)]
  };
  const clash = [];
  Object.keys(recipes).forEach(k => {
    missions.forEach(m => {
      if (m.id === 'recursive-sequence-' + k || m.id.match(/-1[12]$/)) return;
      m.mem = {};
      if (recipes[k].some(e => m.check(e, m.mem))) clash.push(k + ' → ' + m.id.replace('recursive-sequence-', ''));
    });
  });
  check(!clash.length, clash.length ? '做法連帶完成別的任務：' + clash.join('、') : '20 個任務各自的做法都不會順便完成另一個任務');
}

const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const sp = pub.reduce((s, m) => s + starsOf(m), 0), sh = hid.reduce((s, m) => s + starsOf(m), 0);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('  ✗ 隱藏任務超過 20 顆'); }
if (hid.length !== 10 || hid.filter(m => m.level >= 7).length < 3 || hid.some(m => m.level < 3)) { fail++; console.log('  ✗ 隱藏任務要 10 個、3 到 10 級、至少 3 個 7 級以上'); }
console.log('\n公開 ' + pub.length + ' 個 ' + sp + ' 顆、隱藏 ' + hid.length + ' 個 ' + sh + ' 顆，共 ' + (sp + sh) + ' 顆。');
console.log(fail ? fail + ' 項失敗' : '全部通過');
if (fail) process.exit(1);
