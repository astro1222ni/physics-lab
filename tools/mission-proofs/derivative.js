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
    chal: chal, tan: showTan && !chal, b: tan ? tan.b : null, roots: fn === 'cubic' ? DC.cubicRoots(k) : null } };
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

// ---------- 總覽 ----------
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const stars = missions.reduce((s, m) => s + m.level, 0);
console.log(`\n公開 ${pub.length} 個、隱藏 ${hid.length} 個，共 ${stars} 顆星（公開 ${pub.reduce((s, m) => s + m.level, 0)}、隱藏 ${hid.reduce((s, m) => s + m.level, 0)}）。`);
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發。');
