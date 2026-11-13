/* 任務可達成的證明腳本。用法：node tools/mission-proofs/derivative.js
 * 用數學核心證明每個任務在滑桿範圍與精度內做得到（事件格式與 js/derivative.js 相同），並確認預設狀態不會觸發任務。
 * 滑桿：切點 a 的間隔 0.01（點數字可打到 0.001）；h 0.001–2（對數滑桿，可打到 0.001）；三次函數係數 −3–3、間隔 0.1（可打到 0.01）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const DC = require(ROOT + 'js/derivative-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/derivative.js');
const byId = id => missions.find(m => m.id === 'derivative-' + id);

// ---------- 與 js/derivative.js 的 emitState 相同的事件資料 ----------
function stateEv(fn, a, h, k, opt) {
  opt = opt || {};
  k = k || DC.DEFAULT_COEF;
  const d1 = DC.d1(fn, a, k), dq = DC.diffQuot(fn, a, h, k), sq = DC.symQuot(fn, a, h, k), tan = DC.tangent(fn, a, k);
  const chal = !!opt.chal, showTan = opt.tan !== false;
  return { type: 'state', data: {
    fn: fn, k: Object.assign({}, k), x: a, h: h, fa: DC.inDomain(fn, a) ? DC.f(fn, a, k) : null, dq: dq, sq: sq, sym: !!opt.sym,
    d1: d1, d2: DC.d2(fn, a, k), err: d1 != null && dq != null ? Math.abs(dq - d1) : null, errSym: d1 != null && sq != null ? Math.abs(sq - d1) : null,
    chal: chal, tan: showTan && !chal, b: tan ? tan.b : null, xi: tan ? tan.xInt : null, roots: fn === 'cubic' ? DC.cubicRoots(k) : null } };
}
/** 沿著曲線走：和頁面一樣把 a 的範圍切成格子，走過的格子記下來 */
function traceEv(fn, from, to, k) {
  const bins = new Uint8Array(DC.TRACE_BINS);
  const R = DC.FUNCS[fn].aRange;
  const steps = 7 * 60;   // 7 秒、每秒 60 格畫面
  let a = Math.max(R[0], from);
  for (let i = 0; i < steps && a < to; i++) {
    const a1 = Math.min(to, a + (R[1] - R[0]) / steps);
    for (let j = DC.traceBin(fn, a); j <= DC.traceBin(fn, a1); j++) bins[j] = 1;
    a = a1;
  }
  let n = 0; bins.forEach(v => { n += v; });
  return { type: 'trace', data: { fn: fn, k: Object.assign({}, k || DC.DEFAULT_COEF), coverage: n / DC.TRACE_BINS } };
}
const grid = (v, step) => Math.round(v / step) * step;

let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { ok = ok || !!m.check(e, m.mem); });
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}

// ---------- 預設狀態不觸發 ----------
{
  const h0 = DC.hFromPos(9.1);
  const defaults = [stateEv('cubic', 2.2, h0), stateEv('cubic', 2.2, -h0)];
  // 換到每一種函數（a 保持 2.2；ln 也是 2.2，exp 被限制在 2.5 以內）
  ['sin', 'exp', 'ln', 'abs'].forEach(fn => defaults.push(stateEv(fn, Math.min(2.2, DC.FUNCS[fn].aRange[1]), h0)));
  const hit = missions.filter(m => { m.mem = {}; return defaults.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態（三次函數、a = 2.2、h = ' + h0.toFixed(3) + '）與只換函數都不觸發任何任務');
}

// ---------- 逐一證明 ----------
expect('1', [stateEv('cubic', 2.2, 0.01)], true, 'h = 0.01');
expect('1', [stateEv('cubic', 2.2, DC.hFromPos(100))], true, '滑桿拉到最右：h = ' + DC.hFromPos(100));
expect('1', [stateEv('cubic', 2.2, 0.011)], false, 'h = 0.011');
expect('1', [stateEv('cubic', 2.2, 0.005, null, { chal: true })], false, '挑戰中不算');
expect('2', [{ type: 'shrink', data: { fn: 'cubic', from: 1.5, to: DC.hFromPos(100) } }], true, '「讓 h → 0」從 1.5 跑到 0.001（h 已很小時按鈕也會從 1.5 開始）');
expect('2', [{ type: 'shrink', data: { fn: 'cubic', from: 0.5, to: 0.001 } }], false, '從 0.5 開始不算');
expect('3', [stateEv('sin', 1.57, 0.5)], true, 'sin x 在 a = 1.57（f′ = ' + DC.d1('sin', 1.57).toFixed(5) + '）');
expect('3', [stateEv('sin', -1.57, 0.5)], false, 'a = −1.57 是谷底');
expect('3', [stateEv('cubic', -0.535, 0.5)], true, '預設三次函數在 a = −0.535（打字輸入；f′ = ' + DC.d1('cubic', -0.535, DC.DEFAULT_COEF).toFixed(5) + '）');
expect('4', [stateEv('abs', 0, 0.01), stateEv('abs', 0, -0.01)], true, '|x| 在 0：h = 0.01 再按「h < 0」');
expect('4', [stateEv('abs', 0, 0.01), stateEv('abs', 0, 0.5)], false, '只看右邊');
expect('4', [stateEv('abs', 0, 0.02), stateEv('abs', 0, -0.02)], false, 'h = 0.02 太大');
expect('5', [traceEv('sin', -Infinity, Infinity)], true, '沿著 sin x 從頭走到尾（涵蓋 ' + traceEv('sin', -Infinity, Infinity).data.coverage + '）');
expect('5', [traceEv('sin', -6.28, 4)], false, '只走到 4（涵蓋 ' + traceEv('sin', -6.28, 4).data.coverage.toFixed(3) + '）');
expect('5', [traceEv('sin', -5.2, 6.28)], true, '從 −5.2 走到尾（涵蓋 ' + traceEv('sin', -5.2, 6.28).data.coverage.toFixed(3) + '）');
expect('6', [stateEv('cubic', 2.2, 1, { a: 1, b: -3, c: 0, d: 0.5 })], true, 'a = 1、b = −3、c = 0（d 任意）');
expect('6', [stateEv('cubic', 2.2, 1, { a: 1, b: -3, c: 0.1, d: 0 })], false, 'c = 0.1');
expect('7', [stateEv('exp', 1, 0.5)], true, 'eˣ 在 a = 1（截距 ' + DC.tangent('exp', 1).b + '）');
expect('7', [stateEv('exp', 1.01, 0.5)], false, 'a = 1.01（截距 ' + DC.tangent('exp', 1.01).b.toFixed(4) + '）');
expect('7', [stateEv('exp', 1, 0.5, null, { tan: false })], false, '切線沒有顯示');
expect('8', [stateEv('cubic', 0, 0.5, { a: 1, b: 0, c: 0, d: 0 })], true, 'x³ 在 0');
expect('8', [stateEv('cubic', 1, 0.5, { a: 1, b: -3, c: 3, d: -1 })], true, '(x − 1)³ 在 1');
expect('8', [stateEv('cubic', 0, 0.5, { a: 0, b: 1, c: 0, d: 0 })], false, 'x² 在 0（不是三次函數）');
expect('8', [stateEv('cubic', 0.01, 0.5, { a: 1, b: 0, c: 0, d: 0 })], false, 'x³ 在 0.01：f″ = 0.06 太大（要正好在反曲點）');
expect('9', [stateEv('sin', 1, 0.1, null, { sym: true })], true, 'sin x、a = 1、h = 0.1（單邊差 ' + Math.abs(DC.diffQuot('sin', 1, 0.1) - Math.cos(1)).toFixed(4) + '、對稱差 ' + Math.abs(DC.symQuot('sin', 1, 0.1) - Math.cos(1)).toFixed(5) + '）');
expect('9', [stateEv('sin', 1, 0.1, null, { sym: false })], false, '沒有勾對稱差商');
expect('9', [stateEv('cubic', 0, 0.1, { a: 0, b: 1, c: 0, d: 0 }, { sym: true })], true, 'x²：對稱差商完全沒有誤差、單邊差 0.1');
expect('9', [stateEv('sin', 1, 0.05, null, { sym: true })], false, 'h = 0.05 太小');
expect('10', [{ type: 'challenge', data: { fn: 'exp', m: 2, time: 12, streak: 1, last3: null } }], true, '對準一題');
expect('11', [stateEv('ln', 2.72, 0.5)], true, 'ln x 在 a = 2.72（截距 ' + DC.tangent('ln', 2.72).b.toFixed(5) + '）');
expect('11', [stateEv('ln', 2.71, 0.5)], false, 'a = 2.71（截距 ' + DC.tangent('ln', 2.71).b.toFixed(5) + '）');
expect('11', [stateEv('ln', 2.718, 0.5)], true, '打字 a = 2.718');
expect('12', [{ type: 'challenge', data: { fn: 'sin', m: 0.5, time: 14, streak: 3, last3: 40 } }], true, '連續三題共 40 秒');
expect('12', [{ type: 'challenge', data: { fn: 'sin', m: 0.5, time: 14, streak: 3, last3: 46 } }], false, '共 46 秒');
expect('12', [{ type: 'challenge', data: { fn: 'sin', m: 0.5, time: 5, streak: 2, last3: null } }], false, '只有兩題');
expect('h1', [traceEv('exp', -Infinity, Infinity)], true, '沿著 eˣ 走完');
expect('h1', [traceEv('sin', -Infinity, Infinity)], false, 'sin x 不算');
expect('h2', [stateEv('abs', 0, 0.3, null, { sym: true })], true, '|x| 在 0、勾對稱差商：算出 ' + DC.symQuot('abs', 0, 0.3));
expect('h2', [stateEv('abs', 0.01, 0.3, null, { sym: true })], false, 'a = 0.01');
{
  const k = { a: 1, b: 0, c: -1, d: 0 };   // x³ − x：根 −1、0、1
  expect('h3', [stateEv('cubic', -0.5, 0.5, k)], true, 'x³ − x 在 −1、0 的中點 −0.5（切線通過 1）');
  expect('h3', [stateEv('cubic', 0, 0.5, k)], true, 'x³ − x 在 −1、1 的中點 0（切線 y = −x 通過 0）');
  expect('h3', [stateEv('cubic', -0.5, 0.5, k, { tan: false })], false, '切線沒有顯示');
  expect('h3', [stateEv('cubic', -0.52, 0.5, k)], false, 'a = −0.52');
  // 預設的三次函數：根 (1 − √17)/2、1、(1 + √17)/2，中點 0.5 剛好在格點上
  const r = DC.cubicRoots(DC.DEFAULT_COEF);
  expect('h3', [stateEv('cubic', grid((r[0] + r[2]) / 2, 0.01), 0.5)], true, '預設三次函數，兩個無理根的中點 ' + grid((r[0] + r[2]) / 2, 0.01).toFixed(2));
}

// ---------- 挑戰題：每一題都在 0.01 的格點上做得到 ----------
{
  const r = DC.rng(99);
  let prev = null, bad = 0;
  for (let i = 0; i < 3000; i++) {
    const c = DC.genChallenge(r, prev, 1.5);
    if (!c.sols.some(x => DC.chalHit(c.sols, grid(x, 0.01)))) bad++;
    prev = c;
  }
  if (bad) { fail++; console.log('  ✗ 挑戰：' + bad + ' 題在 0.01 的格點上對不準'); }
  else console.log('  ✓ 挑戰：3000 題的每一題，拖曳 a（間隔 0.01）都對得準');
}

// ---------- 11/13 新增的隱藏任務 h4–h10 ----------
{
  const K = (a, b, c, d) => ({ a: a, b: b, c: c, d: d });
  const H0 = DC.hFromPos(9.1);   // 頁面預設的 h
  // h4 反曲點
  const k4 = K(1, -3, 1, 3);
  expect('h4', [stateEv('cubic', 1, 0.5, k4)], true, 'x³ − 3x² + x + 3 的反曲點 x = −b/(3a) = 1，切線斜率 −2，從曲線一側穿到另一側');
  expect('h4', [stateEv('cubic', 0.667, 0.5)], true, '預設三次函數的反曲點 x = 2/3，打 0.667');
  expect('h4', [stateEv('cubic', 1.01, 0.5, k4)], false, 'x = 1.01 差一點');
  expect('h4', [stateEv('cubic', 0, 0.5, K(1, 0, -1, 0))], false, 'x³ − x 的反曲點在 0（b = 0，太簡單；那是 h3 的例子）');
  expect('h4', [stateEv('cubic', 1, 0.5, K(1, -3, 3, 0))], false, 'x³ − 3x² + 3x 在 1：切線水平（那是任務 8）');
  expect('h4', [stateEv('cubic', 1, 0.5, k4, { tan: false })], false, '切線沒有顯示');
  // h5 重根
  const k5 = K(1, 0, -3, 2);
  expect('h5', [stateEv('cubic', 1, 0.5, k5)], true, 'x³ − 3x + 2 = (x − 1)²(x + 2) 在 x = 1：f = f′ = 0，切線就是 x 軸');
  expect('h5', [stateEv('cubic', -1, 0.5, K(-1, 0, 3, 2))], true, '−x³ + 3x + 2 = −(x + 1)²(x − 2) 在 x = −1');
  expect('h5', [stateEv('cubic', -2, 0.5, k5)], false, '單根 x = −2（切線斜率 9）');
  expect('h5', [stateEv('cubic', 0, 0.5, K(1, 0, 0, 0))], false, 'x³ 的三重根（f″ = 0）');
  expect('h5', [stateEv('cubic', 1, 0.5, K(1, 0, -3, 2.01))], false, 'd = 2.01：只是很靠近，沒有真的碰到');
  // h6 均值定理
  const c6 = (4 - Math.sqrt(28)) / 6;
  expect('h6', [stateEv('cubic', -1, 2), stateEv('cubic', -0.215, 2)], true, '預設三次函數：割線 [−1, 1] 斜率 −0.6；切點 c = (4 − √28)/6 ≈ ' + c6.toFixed(4) + '，打 −0.215 時 f′ = ' + DC.d1('cubic', -0.215, DC.DEFAULT_COEF).toFixed(4));
  expect('h6', [stateEv('sin', 0, 2), stateEv('sin', Math.round(Math.acos(Math.sin(2) / 2) * 1000) / 1000, 2)], true, 'sin x：割線 [0, 2] 斜率 sin 2 / 2；切點 arccos(sin 2 / 2) ≈ ' + Math.acos(Math.sin(2) / 2).toFixed(3));
  expect('h6', [stateEv('cubic', -1, 2, K(0, 1, 0, 0)), stateEv('cubic', 0, 2, K(0, 1, 0, 0))], false, 'x² 的切點正好在中間（太簡單）');
  expect('h6', [stateEv('cubic', -1, 2), stateEv('cubic', 1.549, 2)], false, '斜率也是 −0.6 的 x = 1.549 在區間外面');
  expect('h6', [stateEv('cubic', -0.1, 0.3), stateEv('cubic', 0.02, 0.3)], false, '割線太短（|h| < 0.5）');
  expect('h6', [stateEv('cubic', -1, 2), stateEv('cubic', 0.5, 2), stateEv('cubic', -0.215, 2)], false, '中間先去了別的點：要比的是上一條割線（[0.5, 2.5]），不是 [−1, 1]');
  expect('h6', [stateEv('cubic', -1, 2), stateEv('cubic', -0.213, 2)], false, '打 −0.213：f′ = ' + DC.d1('cubic', -0.213, DC.DEFAULT_COEF).toFixed(4) + '，差超過 0.001');
  // h7 反函數
  expect('h7', [stateEv('exp', 1.5, 0.5), stateEv('ln', 4.482, 0.5)], true, 'eˣ 在 x = 1.5 的斜率 e^1.5 ≈ 4.4817，ln x 在 x = 4.482 的斜率 1/4.482，相乘 ' + (Math.exp(1.5) / 4.482).toFixed(5));
  expect('h7', [stateEv('ln', 0.368, 0.5), stateEv('exp', -1, 0.5)], true, '先 ln x 在 0.368（斜率 2.717），再 eˣ 在 −1（斜率 0.3679），相乘 ' + (Math.exp(-1) / 0.368).toFixed(5));
  expect('h7', [stateEv('exp', 1.5, 0.5), stateEv('ln', 4.4, 0.5)], false, 'ln x 在 4.4（不是 e^1.5）');
  expect('h7', [stateEv('exp', 0.2, 0.5), stateEv('ln', 1.221, 0.5)], false, '|p| < 0.5 太靠近 (0, 1) 與 (1, 0)');
  // h8 誤差的階
  expect('h8', [stateEv('cubic', 2.2, 0.2, null, { sym: true }), stateEv('cubic', 2.2, 0.02, null, { sym: true })], true, '預設三次函數、a = 2.2：h = 0.2 → 0.02，單邊誤差 ' + (DC.diffQuot('cubic', 2.2, 0.2, DC.DEFAULT_COEF) - DC.d1('cubic', 2.2, DC.DEFAULT_COEF)).toFixed(4) + ' → ' + (DC.diffQuot('cubic', 2.2, 0.02, DC.DEFAULT_COEF) - DC.d1('cubic', 2.2, DC.DEFAULT_COEF)).toFixed(5) + '，對稱誤差剛好是 a·h²：0.012 → 0.00012');
  expect('h8', [stateEv('sin', 1, 0.5, null, { sym: true }), stateEv('sin', 1, 0.05, null, { sym: true })], true, 'sin x、a = 1：h = 0.5 → 0.05');
  expect('h8', [stateEv('cubic', 2.2, 0.2, null, { sym: true }), stateEv('cubic', 2.2, 0.05, null, { sym: true })], false, 'h 只縮成四分之一');
  expect('h8', [stateEv('cubic', 2.2, 0.2), stateEv('cubic', 2.2, 0.02)], false, '沒有勾對稱差商');
  expect('h8', [stateEv('cubic', 2.2, 0.2, null, { sym: true }), stateEv('cubic', 2.3, 0.02, null, { sym: true })], false, '中途換了切點');
  expect('h8', [stateEv('cubic', 2.2, 0.1, null, { sym: true }), stateEv('cubic', 2.2, 0.01, null, { sym: true })], true, 'h = 0.1 → 0.01（最小到 0.01）');
  expect('h8', [stateEv('cubic', 2.2, 0.05, null, { sym: true }), stateEv('cubic', 2.2, 0.005, null, { sym: true })], false, 'h = 0.005 太小（捨入誤差會干擾）');
  // h9 牛頓法收斂
  const n9 = [0.5, 0.847, 0.988, 1];
  n9.forEach((x, i) => { if (i) { const t = DC.tangent('ln', n9[i - 1]); if (Math.abs(t.xInt - x) > 0.002) { fail++; console.log('  ✗ h9 例子的第 ' + i + ' 步沒有對準 x 截距 ' + t.xInt); } } });
  expect('h9', n9.map(x => stateEv('ln', x, H0)), true, 'ln x 從 0.5 出發：0.5 → 0.847 → 0.988 → 1（每次打切線 x 截距的前 3 位）');
  expect('h9', [stateEv('ln', 0.5, H0), stateEv('ln', 0.988, H0), stateEv('ln', 1, H0)], false, '跳過一步');
  expect('h9', [stateEv('ln', 0.5, H0), stateEv('ln', 0.847, H0), stateEv('ln', 0.988, H0)], false, '還沒落在根上（f = −0.012）');
  expect('h9', [stateEv('ln', 0.9, H0), stateEv('ln', 0.995, H0), stateEv('ln', 1, H0), stateEv('ln', 1, H0)], false, '從 0.9 出發離根太近');
  const k9 = K(1, 0, 0, -2), n9b = [2, 1.5, 1.296, 1.261, 1.26];
  expect('h9', n9b.map(x => stateEv('cubic', x, H0, k9)), true, 'x³ − 2 從 2 出發：2 → 1.5 → 1.296 → 1.261 → 1.26（∛2 ≈ 1.2599）');
  expect('h9', n9.map(x => stateEv('ln', x, H0, null, { tan: false })), false, '切線沒有顯示');
  // h10 兩步循環
  const k10 = K(1, 0, -2, 2);
  expect('h10', [stateEv('cubic', 0, H0, k10), stateEv('cubic', 1, H0, k10), stateEv('cubic', 0, H0, k10)], true, 'x³ − 2x + 2 從 0 出發：切線 x 截距是 1，從 1 出發的切線 x 截距又回到 0');
  expect('h10', [stateEv('cubic', 0, H0, k10), stateEv('cubic', 1, H0, k10), stateEv('cubic', 0.5, H0, k10)], false, '第二步沒有照切線走');
  expect('h10', [stateEv('cubic', 0, H0, k10), stateEv('cubic', 0, H0, k10)], false, '原地不動不算');
}

// 亂按模擬：換函數、拉係數（0.1 一格）、拉切點（0.01 一格）、拉 h（對數滑桿 0.5 一格）、偶爾打數字、h 正負、勾選切線與對稱差商
{
  const rand = DC.rng(1113);
  const ri = n => Math.floor(rand() * n);
  const hid = missions.filter(m => /-h(4|5|6|7|8|9|10)$/.test(m.id));
  const all = missions.filter(m => !/-(1|2|5|10|12)$/.test(m.id) && !/-h1$/.test(m.id));
  const runs = 2000, steps = 150, cnt = {};
  for (let r = 0; r < runs; r++) {
    let fn = 'cubic', k = Object.assign({}, DC.DEFAULT_COEF), a = 2.2, hp = 9.1, sg = 1, sym = false, tan = true;
    all.forEach(m => { m.mem = {}; m.got = false; });
    for (let t = 0; t < steps; t++) {
      const u = rand();
      const R = DC.FUNCS[fn].aRange;
      if (u < 0.08) { fn = DC.IDS[ri(5)]; const R2 = DC.FUNCS[fn].aRange; if (fn === 'ln' && a < 0.1) a = 1; a = Math.max(R2[0], Math.min(R2[1], a)); continue; }
      else if (u < 0.3) { if (fn !== 'cubic') continue; const key = 'abcd'[ri(4)]; k[key] = rand() < 0.7 ? (ri(61) - 30) / 10 : (rand() < 0.5 ? ri(7) - 3 : Math.round((rand() * 6 - 3) * 100) / 100); k = Object.assign({}, k); }
      else if (u < 0.55) { a = rand() < 0.7 ? Math.round((R[0] + rand() * (R[1] - R[0])) * 100) / 100 : Math.round((R[0] + rand() * (R[1] - R[0])) * 1000) / 1000; }
      else if (u < 0.7) { hp = rand() < 0.7 ? ri(201) / 2 : DC.posFromH(Math.max(0.001, Math.round(rand() * 2 * 1000) / 1000)); }
      else if (u < 0.78) sg = -sg;
      else if (u < 0.88) sym = !sym;
      else if (u < 0.94) tan = !tan;
      else continue;
      const h = sg * Math.round(DC.hFromPos(hp) * 1000) / 1000 || sg * 0.001;
      const e = stateEv(fn, a, h, k, { sym: sym, tan: tan });
      all.forEach(m => { if (!m.got && m.check(e, m.mem)) { m.got = true; cnt[m.id] = (cnt[m.id] || 0) + 1; } });
    }
  }
  const lines = Object.keys(cnt).map(x => x.replace('derivative-', '') + ' ' + cnt[x] + ' 次');
  const worst = Math.max(0, ...hid.map(m => cnt[m.id] || 0));
  const ok = worst <= runs * 0.015;
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + '亂按 ' + runs + ' 回（每回 ' + steps + ' 步）：' + (lines.join('、') || '都沒有完成') + '（新的隱藏任務每回都不到 1.5%）');
}

// 做法交叉檢查：每個新隱藏任務的做法只完成它自己
{
  const K = (a, b, c, d) => ({ a: a, b: b, c: c, d: d });
  const H0 = DC.hFromPos(9.1);
  const ways = {
    h4: [stateEv('cubic', 1, H0, K(1, -3, 1, 3))],
    h5: [stateEv('cubic', 1, H0, K(1, 0, -3, 2))],
    h6: [stateEv('cubic', -1, 2), stateEv('cubic', -0.215, 2)],
    h7: [stateEv('exp', 1.5, H0), stateEv('ln', 4.482, H0)],
    h8: [stateEv('cubic', 2.2, 0.2, null, { sym: true }), stateEv('cubic', 2.2, 0.02, null, { sym: true })],
    h9: [0.5, 0.847, 0.988, 1].map(x => stateEv('ln', x, H0)),
    h10: [0, 1, 0].map(x => stateEv('cubic', x, H0, K(1, 0, -2, 2)))
  };
  const bad = [];
  Object.keys(ways).forEach(h => {
    const got = missions.filter(m => { m.mem = {}; let g = false; ways[h].forEach(e => { g = m.check(e, m.mem) || g; }); return g; }).map(m => m.id.replace('derivative-', ''));
    if (got.length !== 1 || got[0] !== h) bad.push(h + ' → ' + got.join('、'));
  });
  if (bad.length) { fail++; console.log('  ✗ 做法會連帶完成別的任務：' + bad.join('；')); }
  else console.log('  ✓ 新隱藏任務的做法都只完成它自己');
}
{
  const hid = missions.filter(m => m.hidden);
  const lv = hid.map(m => m.level);
  const ok = hid.length === 10 && lv.every(l => l >= 3 && l <= 10) && lv.filter(l => l >= 7).length >= 3;
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + '隱藏任務 ' + hid.length + ' 個，等級 ' + lv.join('、') + '（7 級以上 ' + lv.filter(l => l >= 7).length + ' 個）');
}

// ---------- 總覽 ----------
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;   // 隱藏任務星星加倍（與 js/missions.js 的 LabMission.starsOf 相同）
const stars = missions.reduce((s, m) => s + starsOf(m), 0);
console.log(`\n公開 ${pub.length} 個、隱藏 ${hid.length} 個，共 ${stars} 顆星（公開 ${pub.reduce((s, m) => s + m.level, 0)}、隱藏 ${hid.reduce((s, m) => s + starsOf(m), 0)}，隱藏任務是等級 × 2）。`);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('隱藏任務超過 20 顆星（規則上限）。'); }
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發。');
