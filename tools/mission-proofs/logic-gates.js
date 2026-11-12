/* 任務可達成的證明腳本。用法：node tools/mission-proofs/logic-gates.js
 * 用邏輯核心（js/logic-gates-core.js）實際模擬電路，產生和 js/logic-gates.js 相同的事件資料，證明：
 *   1. 每個任務都做得到（給出具體的操作）；預設狀態不觸發任何任務；
 *   2. 10 個隱藏任務互不順便完成（交叉檢查表）；
 *   3. 沒有靠運氣的任務；另外用固定種子「亂按」模擬（像學生隨便點），統計每個任務被碰巧完成的比例。
 * 控制項範圍：位元數 4／8；A、B 滑桿 0–2ⁿ−1（整數）；拼圖閘數 k 1–6；每個閘的兩隻腳可接 A、B 或前面的閘。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const LC = require(ROOT + 'js/logic-gates-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/logic-gates.js');
const byId = id => missions.find(m => m.id === 'logic-gates-' + id);
const NAND_DEMO = { NOT: true, AND: true, OR: true, NAND: true };

// =====================================================================
// 與 js/logic-gates.js 相同的電路與事件資料
// =====================================================================
function gateCirc(type, nand) { return nand && NAND_DEMO[type] ? LC.nandForm(type) : LC.gateCircuit(type); }
function gateIns(type, a, b) { return LC.GATES[type].arity === 1 ? [a] : [a, b]; }
/** 「邏輯閘」模式：撥開關或換閘之後 */
function gateEv(type, a, b, nand, src) {
  const c = gateCirc(type, nand), v = LC.steady(c, gateIns(type, a, b));
  return { type: 'gate', data: { src: src || 'toggle', gate: type, a: a, b: LC.GATES[type].arity === 2 ? b : null, out: v[c.idx.Y], nand: !!(nand && NAND_DEMO[type]) } };
}
/** 「萬用閘拼圖」：接線改變之後 */
function buildEv(type, conns, target, src) {
  const r = LC.buildUniversal(type, conns);
  target = target || 'AND';
  return { type: 'build', data: { src: src || 'wire', type: type, k: conns.length, count: r.count, depth: r.depth, mask: r.tt ? r.mask : -1, target: target, match: !!r.tt && r.mask === LC.TARGETS[target] } };
}
function halfEv(o, nw) {
  const c = LC.halfAdder(), sim = LC.simulate(c, o, nw);
  return { type: 'half', data: { src: 'toggle', a: nw[0], b: nw[1], s: sim.final[c.idx.S], c: sim.final[c.idx.C], settle: sim.settle } };
}
function fullEv(o, nw) {
  const c = LC.fullAdder(), sim = LC.simulate(c, o, nw);
  return { type: 'full', data: { src: 'toggle', a: nw[0], b: nw[1], cin: nw[2], s: sim.final[c.idx.S], cout: sim.final[c.idx.COUT], settle: sim.settle, glitch: LC.glitchy(sim, c.idx.COUT) } };
}
/** 「多位元加法器」：o、nw = [a, b, cin] */
function adderEv(n, o, nw, signed, src) {
  const c = LC.rippleAdder(n);
  const sim = LC.simulate(c, LC.adderInputs(n, o[0], o[1], o[2]), LC.adderInputs(n, nw[0], nw[1], nw[2]));
  const res = LC.adderRead(c, sim.final), info = LC.carryInfo(n, nw[0], nw[1], nw[2]);
  let maxFlips = 0;
  for (let i = 0; i < n; i++) maxFlips = Math.max(maxFlips, LC.flips(sim, c.idx['S' + i]));
  maxFlips = Math.max(maxFlips, LC.flips(sim, c.idx['C' + n]));
  return { type: 'adder', data: { src: src || 'bit', n: n, a: nw[0], b: nw[1], cin: nw[2], s: res.s, cout: res.cout, sum: nw[0] + nw[1] + nw[2], signed: !!signed,
    sa: LC.signedOf(nw[0], n), sb: LC.signedOf(nw[1], n), ss: LC.signedOf(res.s, n), v: LC.overflowV(n, nw[0], nw[1], nw[2]),
    settle: sim.settle, chain: info.chain, maxFlips: maxFlips, prev: { a: o[0], b: o[1], cin: o[2] } } };
}
/** 按「單步」走到每一個 t = 1 … settle 的事件（頁面在沒有變化或 settle = 0 時不發出）；預設是關掉「自動播放」一步一步走 */
function stepEvs(mode, c, o, nw, extra) {
  const sim = LC.simulate(c, o, nw);
  if (!sim.settle) return [];
  const names = mode === 'gate' ? ['Y'] : mode === 'build' ? [c.names[c.names.length - 1]] : mode === 'half' ? ['S', 'C'] : mode === 'full' ? ['S', 'COUT'] : null;
  const list = names || (function () { const a = []; for (let i = 0; i < c.n; i++) a.push('S' + i); a.push('C' + c.n); return a; })();
  const out = [];
  for (let t = 1; t <= sim.settle; t++) {
    const outs = {};
    list.forEach(nm => {
      const node = c.idx[nm];
      outs[mode === 'build' ? 'Y' : nm] = { v0: sim.init[node], v: LC.valueAt(sim, node, t), v1: sim.final[node] };
    });
    out.push({ type: 'step', data: Object.assign({ mode: mode, t: t, settle: sim.settle, outs: outs, auto: false }, extra || {}) });
  }
  return out;
}
function buildStepEvs(type, conns, o, nw) {
  const r = LC.buildUniversal(type, conns);
  return stepEvs('build', r.c, o, nw, { mask: r.tt ? r.mask : -1, type: type });
}

// =====================================================================
// 判定工具
// =====================================================================
let fail = 0;
function runOn(m, events) { m.mem = {}; let ok = false; events.forEach(e => { ok = !!m.check(e, m.mem) || ok; }); return ok; }
function expect(id, events, want, note) {
  const ok = runOn(byId(id), events);
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}
const fromMin = (type, mask) => LC.minGates(type, mask, 6).conns;   // 窮舉找到的最少閘接法（頁面的格式）

// ---------- 預設狀態 ----------
{
  // 頁面預設：邏輯閘 AND、A = B = 0；拼圖 NAND、k = 3、全部沒接；半加器、全加器全 0；加法器 4 位元 11 + 3、Cin = 0
  const defaults = [
    gateEv('AND', 0, 0, false), gateEv('AND', 0, 0, true),
    buildEv('NAND', [[null, null], [null, null], [null, null]]),
    halfEv([0, 0], [0, 0]), fullEv([0, 0, 0], [0, 0, 0]),
    adderEv(4, [11, 3, 0], [11, 3, 0], false), adderEv(4, [11, 3, 0], [11, 3, 0], true)
  ];
  const hit = missions.filter(m => runOn(m, defaults)).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 每個模式的預設狀態（含打開「有號數」、「用 NAND 組成」）都不觸發任何任務');
}

// ---------- 公開任務 ----------
console.log('公開任務：');
expect('1', [gateEv('AND', 1, 0), gateEv('AND', 1, 1)], true, 'AND：A 撥成 1、再把 B 撥成 1');
expect('1', [gateEv('AND', 1, 1, true)], true, '打開「用 NAND 組成」也一樣');
expect('1', [gateEv('AND', 1, 0), gateEv('OR', 1, 0)], false, 'AND 只撥一個；OR 亮不算');
expect('2', [gateEv('OR', 1, 1), gateEv('XOR', 1, 1, false, 'gate')], true, 'OR 撥成 11，再換成 XOR');
expect('2', [gateEv('OR', 1, 1)], false, '只做 OR');
expect('2', [gateEv('XOR', 1, 0), gateEv('OR', 1, 0)], false, '輸入不是 11');
expect('3', [gateEv('NOR', 1, 0), gateEv('NOR', 1, 1), gateEv('NOR', 0, 1), gateEv('NOR', 0, 0)], true, 'NOR：從 00 開始依序撥 A、B、A、B');
expect('3', [gateEv('AND', 1, 0), gateEv('AND', 1, 1), gateEv('OR', 0, 1, false, 'gate'), gateEv('OR', 0, 0)], false, '四列分散在兩種閘');
expect('3', [gateEv('NOT', 1, 0), gateEv('NOT', 0, 0)], false, 'NOT 只有一個輸入，不算');
expect('4', [halfEv([0, 0], [1, 0]), halfEv([1, 0], [1, 1])], true, '半加器 A、B 都撥成 1：C = 1、S = 0');
expect('4', [halfEv([0, 0], [1, 0])], false, '只有 A = 1');
const and2 = [['A', 'B'], [0, 0]];
expect('5', [buildEv('NAND', and2)], true, 'G1 = NAND(A, B)、G2 = NAND(G1, G1)（2 個）');
expect('5', [buildEv('NAND', [['A', 'B'], [0, 0], [null, null]])], false, '預設 k = 3 而 G3 沒接：輸出未知（要把 k 改成 2，或把 G3 也接好）');
expect('5', [buildEv('NAND', [['A', 'B'], ['B', 'A'], [0, 1]])], true, '不改 k = 3：G3 = NAND(G1, G2)，G1、G2 都是 NAND(A, B)');
expect('5', [buildEv('NAND', [['A', 'B'], [0, 0], [1, 1]])], false, 'k = 3：G3 = NAND(G2, G2) 又變回 NAND');
expect('5', [buildEv('NOR', [['A', 'A'], ['B', 'B'], [0, 1]])], false, '用 NOR 拼出 AND 不算這個任務');
expect('6', [fullEv([0, 0, 0], [1, 0, 0]), fullEv([1, 0, 0], [1, 1, 0]), fullEv([1, 1, 0], [1, 1, 1])], true, '全加器依序撥 A、B、Cin：11₂');
const or3 = fromMin('NAND', 14);
expect('7', [buildEv('NAND', or3)], true, 'NAND 拼 OR：' + JSON.stringify(or3) + '（' + or3.length + ' 個）');
expect('7', [buildEv('NAND', and2)], false, '拼出的是 AND');
expect('8', [adderEv(4, [11, 3, 0], [9, 3, 0], false, 'slider'), adderEv(4, [9, 3, 0], [9, 7, 0], false, 'slider')], true, '4 位元：A 拉到 9、B 拉到 7 → S = 0、Cout = 1');
expect('8', [adderEv(8, [11, 3, 0], [9, 7, 0], false, 'slider')], false, '8 位元的 9 + 7 不算');
expect('9', [adderEv(8, [254, 0, 1], [255, 0, 1])], true, '8 位元 B = 0、Cin = 1，A 調到 255：進位從 Cin 一路傳出（chain = 8）');
expect('9', [adderEv(8, [254, 1, 0], [255, 1, 0])], false, '255 + 1（Cin = 0）不算：那是另一個（隱藏）的玩法');
expect('9', [adderEv(8, [0, 0, 1], [127, 0, 1])], false, '127 + 0 + 1：只傳 7 位');
expect('10', [adderEv(4, [11, 3, 0], [5, 3, 0], true, 'slider')], true, '打開「有號數」、4 位元 5 + 3 → −8');
expect('10', [adderEv(8, [0, 0, 0], [100, 100, 0], true, 'slider')], true, '8 位元 100 + 100 → −56');
expect('10', [adderEv(4, [11, 3, 0], [5, 3, 0], false, 'slider')], false, '沒打開「有號數」不算');
expect('10', [adderEv(4, [0, 0, 0], [9, 9, 0], true, 'slider')], false, '負 + 負（−7 + −7）不算');
const xor4 = fromMin('NAND', 6);
expect('11', [buildEv('NAND', xor4)], true, 'NAND 拼 XOR：' + JSON.stringify(xor4) + '（' + xor4.length + ' 個）');
expect('11', [buildEv('NAND', [['A', 'A'], ['B', 'B'], ['A', 1], ['B', 0], [2, 3]])], false, '5 個 NAND 的 XOR（A·¬B + ¬A·B 的接法）');
expect('12', [adderEv(8, [254, 0, 1], [255, 0, 1])], true, '8 位元：B = 0、Cin = 1、A 從 254 改成 255（只撥 A0）→ 17 個閘延遲');
expect('12', [adderEv(8, [255, 0, 0], [255, 0, 1], false, 'toggle')], false, '改 Cin 只要 2n = 16 個');
expect('12', [adderEv(4, [14, 0, 1], [15, 0, 1])], false, '4 位元最多 9 個');
{ // 8 位元：任意兩組輸入之間的轉換，穩定時間都不超過 17（抽樣 20000 組）
  const r = LC.rng(7);
  let mx = 0;
  for (let i = 0; i < 20000; i++) {
    const o = [Math.floor(r() * 256), Math.floor(r() * 256), r() < 0.5 ? 1 : 0], nw = [Math.floor(r() * 256), Math.floor(r() * 256), r() < 0.5 ? 1 : 0];
    mx = Math.max(mx, adderEv(8, o, nw).data.settle);
  }
  const ok = mx <= 17;
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + '12  上限：隨機 20000 次轉換最慢 ' + mx + ' 個閘延遲（不會超過 2n + 1 = 17）');
}

// ---------- 隱藏任務 ----------
console.log('隱藏任務：');
const buf = [['A', 'A'], [0, 0]];                         // NAND(NAND(A, A)) = A（NOR 也一樣）
const one = [['A', 'A'], ['A', 0]];                       // NAND(A, ¬A) = 1
const norAnd = [['A', 'A'], ['B', 'B'], [0, 1]];           // NOR(¬A, ¬B) = A·B（3 個 NOR）
const xnor5 = fromMin('NAND', 9);
const norZero = [['A', 'A'], ['A', 0]];                   // NOR(A, ¬A) = 0（2 個 NOR）
const nandZero = [['A', 'A'], ['A', 0], [1, 1]];          // NAND(NAND(A, ¬A)) = 0（3 個 NAND）
const oneNor = [['A', 'A'], ['A', 0], [1, 1]];            // NOT(NOR(A, ¬A)) = 1（3 個 NOR）
const HID = {
  h1: [buildEv('NAND', buf), buildEv('NOR', buf)],
  h2: [buildEv('NAND', one), buildEv('NOR', oneNor)],
  h3: [adderEv(8, [11, 3, 0], [255, 1, 0], false, 'slider')],
  h4: [adderEv(8, [11, 3, 0], [200, 200, 0], false, 'slider')],
  h5: stepEvs('full', LC.fullAdder(), [1, 1, 1], [0, 1, 1]),
  h6: [adderEv(8, [126, 1, 0], [127, 1, 0])],
  h7: [adderEv(8, [100, 0, 0], [100, 155, 0], false, 'slider'), adderEv(8, [100, 155, 0], [100, 155, 1], false, 'toggle')],
  h8: [buildEv('NOR', norAnd)],
  h9: [buildEv('NAND', xnor5)],
  h10: buildStepEvs('NOR', norZero, [1, 0], [0, 0])
};
const HNOTE = {
  h1: '拼圖只放 2 個閘：G1 = NAND(A, A)、G2 = NAND(G1, G1)，輸出等於 A；再換成 NOR（同樣接法）也等於 A',
  h2: '拼圖 NAND：G1 = NAND(A, A)、G2 = NAND(A, G1) 永遠 1；NOR：G1 = NOR(A, A)、G2 = NOR(A, G1)、G3 = NOR(G2, G2) 永遠 1',
  h3: '8 位元、無號數 A = 255（第 256 關）+ B = 1 = 0（小精靈第 256 關）',
  h4: '8 位元 200 + 200（11001000 左移一位，最高位掉出去）',
  h5: '全加器 B = Cin = 1，A 從 1 撥成 0，關掉自動播放按「單步」到 t = 2：Cout 1 → 0 → 1',
  h6: '8 位元 127 + 1 = 128（有號數 −128；2038 年問題）',
  h7: '8 位元 A = 100，B 設成 155（= ¬A），最後把 Cin 撥成 1 → 0（A + ¬A + 1 = A − A）',
  h8: '只用 NOR 拼 AND：3 個（阿波羅導航電腦只用 NOR 閘）',
  h9: '只用 NAND 拼 XNOR：' + JSON.stringify(xnor5) + '（' + xnor5.length + ' 個，最少）',
  h10: '拼圖 NOR：G1 = NOR(A, A)、G2 = NOR(A, G1)（永遠 0），A 從 1 撥成 0 後按「單步」：t = 1 時 Y 閃成 1'
};
Object.keys(HID).forEach(h => expect(h, HID[h], true, HNOTE[h]));
expect('h1', [buildEv('NAND', [['A', 'A']])], false, '只有 1 個 NAND：NOT A');
expect('h1', [buildEv('NAND', buf)], false, '只做 NAND 的雙重否定（NOR 還沒做）');
expect('h1', [buildEv('NAND', [['A', 'A'], [0, 0], [1, 1], [2, 2]]), buildEv('NOR', [['A', 'A'], [0, 0], [1, 1], [2, 2]])], false, '反相四次（用了 4 個閘）不算「兩次」');
expect('h1', [buildEv('NAND', [['A', 'A'], [null, null], [0, 0]]), buildEv('NOR', [['A', 'A'], [null, null], [0, 0]])], false, '板子上放了 3 個閘（有一個閒著）不算：只能說兩次「不」');
expect('h2', [buildEv('NAND', [['A', null], ['A', 0]])], false, '有腳沒接（X）時輸出未知');
expect('h2', [buildEv('NAND', one)], false, '只做 NAND 的永遠 1（NOR 還沒做）');
expect('h3', [adderEv(4, [0, 0, 0], [15, 1, 0])], false, '4 位元 15 + 1 不算');
expect('h3', [adderEv(8, [11, 3, 0], [255, 1, 0], true, 'slider')], false, '有號數模式：255 是 −1，−1 + 1 = 0 本來就對');
expect('h3', [adderEv(8, [11, 3, 0], [1, 255, 0], false, 'slider')], false, '關卡計數器是 A：A = 1、B = 255 不算');
expect('h4', [adderEv(8, [0, 0, 0], [100, 100, 0], false, 'slider')], false, '100 + 100：最高位是 0，沒有人掉下去');
expect('h4', [adderEv(8, [0, 0, 0], [255, 255, 0], false, 'slider')], false, '255 + 255：全是 1，看不出整排往前移');
expect('h4', [adderEv(8, [0, 0, 0], [128, 128, 0], false, 'slider')], false, '128 + 128：只有排頭一個人，不是「整排人」');
expect('h5', stepEvs('full', LC.fullAdder(), [0, 1, 1], [1, 1, 1]), false, '反方向（A 0 → 1）Cout 沒有眨眼');
expect('h5', [fullEv([1, 1, 1], [0, 1, 1])], false, '只撥開關、不按「單步」');
expect('h5', stepEvs('full', LC.fullAdder(), [1, 1, 1], [0, 1, 1], { auto: true }), false, '「自動播放」開著時按「單步」碰巧停在 t = 2 不算');
expect('h6', [adderEv(4, [0, 0, 0], [7, 1, 0])], false, '4 位元 7 + 1 不算');
expect('h7', [adderEv(8, [254, 0, 1], [255, 0, 1])], false, '255 + 0 + 1（最慢的那一次）不算：A 要介於 0 和 2ⁿ − 1 之間');
expect('h7', [adderEv(8, [100, 155, 1], [100, 154, 1])], false, 'B 不是 ¬A');
expect('h7', [adderEv(4, [5, 10, 0], [5, 10, 1], false, 'toggle')], false, '4 位元不算（只在 8 位元）');
expect('h7', [adderEv(8, [100, 0, 1], [100, 155, 1], false, 'slider')], false, '先把 Cin 撥成 1、最後才把 B 調成 ¬A：順序不對（要「翻面」之後「再添」）');
expect('h8', [buildEv('NOR', [['A', 'A'], ['B', 'B'], [0, 1], [2, 2], [3, 3]])], false, '5 個 NOR 才拼出 AND');
expect('h9', [buildEv('NAND', [['A', 'B'], ['A', 0], ['B', 0], [1, 2], [3, 3], [4, 4]])], false, '6 個 NAND 的 XNOR');
expect('h10', buildStepEvs('NOR', norZero, [0, 0], [1, 0]), false, '同一個電路 A 從 0 撥成 1：NOR(A, ¬A) 沒有突波');
expect('h10', buildStepEvs('NAND', nandZero, [0, 0], [1, 0]), true, '3 個 NAND 的永遠 0，A 從 0 撥成 1：t = 2 時 Y 閃成 1');
expect('h10', [buildEv('NOR', norZero)], false, '只接好線、不按「單步」');

// ---------- 交叉檢查：每個隱藏任務的做法，會不會順便完成別的隱藏任務 ----------
{
  const ids = Object.keys(HID);
  console.log('\n交叉檢查（列：用哪個隱藏任務的做法；欄：哪些隱藏任務被完成）');
  console.log('       ' + ids.map(h => h.padStart(4)).join(''));
  let cross = 0;
  ids.forEach(row => {
    const cells = ids.map(col => {
      const hit = runOn(byId(col), HID[row]);
      if (hit && col !== row) cross++;
      return (hit ? (col === row ? '●' : '✗') : '·').padStart(4);
    });
    console.log('  ' + row.padEnd(5) + cells.join(''));
  });
  if (cross) { fail++; console.log('  ✗ 有 ' + cross + ' 格順便完成了別的隱藏任務'); }
  else console.log('  ✓ 每個隱藏任務的做法只完成它自己');
  // 公開任務的做法會不會順便完成隱藏任務（只列出來參考）
  const pubWays = {
    '5': [buildEv('NAND', and2)], '7': [buildEv('NAND', or3)], '8': [adderEv(4, [9, 3, 0], [9, 7, 0])], '9': [adderEv(8, [254, 0, 1], [255, 0, 1])],
    '10': [adderEv(4, [11, 3, 0], [5, 3, 0], true)], '11': [buildEv('NAND', xor4)], '12': [adderEv(8, [254, 0, 1], [255, 0, 1])]
  };
  const leaks = [];
  Object.keys(pubWays).forEach(p => ids.forEach(h => { if (runOn(byId(h), pubWays[p])) leaks.push(p + ' → ' + h); }));
  console.log(leaks.length ? '  ・公開任務的做法順便完成：' + leaks.join('、') : '  ✓ 公開任務的示範做法都不會順便完成隱藏任務');
}

// ---------- 亂按模擬（像學生隨便點；固定種子） ----------
{
  const SESS = 400, ACTS = 300;
  const r = LC.rng(2026);
  const pick = arr => arr[Math.floor(r() * arr.length)];
  const count = {};
  missions.forEach(m => { count[m.id] = 0; });
  for (let s = 0; s < SESS; s++) {
    missions.forEach(m => { m.mem = {}; m.doneHere = false; });
    const st = { mode: 'gate', gate: 'AND', a: 0, b: 0, nand: false, utype: 'NAND', k: 3, conns: [0, 1, 2, 3, 4, 5].map(() => [null, null]), ba: 0, bb: 0,
      h: [0, 0], f: [0, 0, 0], n: 4, A: [11, 3, 0], signed: false, auto: true, last: null };
    const evs = [];
    const fire = list => list.forEach(e => missions.forEach(m => { if (!m.doneHere && m.check(e, m.mem)) m.doneHere = true; }));
    for (let i = 0; i < ACTS; i++) {
      const x = r();
      evs.length = 0;
      if (x < 0.08) { st.mode = pick(['gate', 'build', 'half', 'full', 'adder']); st.last = null; continue; }
      if (st.mode === 'gate') {
        if (x < 0.25) { st.gate = pick(LC.GATE_LIST); evs.push(gateEv(st.gate, st.a, st.b, st.nand, 'gate')); st.last = null; }
        else if (x < 0.3) { st.nand = !st.nand; st.last = null; }
        else if (x < 0.9) {
          const o = gateIns(st.gate, st.a, st.b);
          if (r() < 0.5 || LC.GATES[st.gate].arity === 1) st.a ^= 1; else st.b ^= 1;
          evs.push(gateEv(st.gate, st.a, st.b, st.nand));
          st.last = { c: gateCirc(st.gate, st.nand), o: o, nw: gateIns(st.gate, st.a, st.b), t: st.auto ? 99 : 0 };
        } else st.auto = !st.auto;
      } else if (st.mode === 'build') {
        const conns = () => st.conns.slice(0, st.k);
        if (x < 0.55) {
          const i2 = Math.floor(r() * st.k), pin = r() < 0.5 ? 0 : 1, opts = [null, 'A', 'B'];
          for (let j = 0; j < i2; j++) opts.push(j);
          st.conns[i2][pin] = pick(opts);
          evs.push(buildEv(st.utype, conns()));
          st.last = null;
        } else if (x < 0.62) { st.k = 1 + Math.floor(r() * 6); evs.push(buildEv(st.utype, conns(), 'AND', 'count')); st.last = null; }
        else if (x < 0.66) { st.utype = st.utype === 'NAND' ? 'NOR' : 'NAND'; evs.push(buildEv(st.utype, conns(), 'AND', 'type')); st.last = null; }
        else if (x < 0.9) {
          const o = [st.ba, st.bb];
          if (r() < 0.5) st.ba ^= 1; else st.bb ^= 1;
          st.last = { c: LC.buildUniversal(st.utype, conns()).c, o: o, nw: [st.ba, st.bb], t: st.auto ? 99 : 0, build: LC.buildUniversal(st.utype, conns()) };
        } else st.auto = !st.auto;
      } else if (st.mode === 'half' || st.mode === 'full') {
        if (x < 0.85) {
          const v = st.mode === 'half' ? st.h : st.f, o = v.slice();
          v[Math.floor(r() * v.length)] ^= 1;
          evs.push(st.mode === 'half' ? halfEv(o, v.slice()) : fullEv(o, v.slice()));
          st.last = { c: st.mode === 'half' ? LC.halfAdder() : LC.fullAdder(), o: o, nw: v.slice(), t: st.auto ? 99 : 0 };
        } else st.auto = !st.auto;
      } else {
        const M = Math.pow(2, st.n) - 1, o = st.A.slice();
        let src = 'bit';
        if (x < 0.45) { const w = r() < 0.5 ? 0 : 1; st.A[w] ^= 1 << Math.floor(r() * st.n); }
        else if (x < 0.7) { const w = r() < 0.5 ? 0 : 1, y = r(); st.A[w] = y < 0.2 ? 0 : y < 0.4 ? M : Math.floor(r() * (M + 1)); src = 'slider'; }
        else if (x < 0.8) { st.A[2] ^= 1; src = 'toggle'; }
        else if (x < 0.85) { st.n = st.n === 4 ? 8 : 4; const M2 = Math.pow(2, st.n) - 1; st.A[0] &= M2; st.A[1] &= M2; evs.push(adderEv(st.n, st.A, st.A, st.signed, 'width')); st.last = null; fire(evs); continue; }
        else if (x < 0.9) { st.signed = !st.signed; continue; }
        else { st.auto = !st.auto; continue; }
        evs.push(adderEv(st.n, o, st.A.slice(), st.signed, src));
        const c = LC.rippleAdder(st.n);
        c.n = st.n;
        st.last = { c: c, o: LC.adderInputs(st.n, o[0], o[1], o[2]), nw: LC.adderInputs(st.n, st.A[0], st.A[1], st.A[2]), t: st.auto ? 99 : 0 };
      }
      fire(evs);
      // 偶爾按「單步」：自動播放時直接跳到穩定後；關掉自動播放時從 t = 0 一步一步走
      if (st.last && r() < 0.25) {
        const L = st.last;
        const all = L.build ? stepEvs('build', L.c, L.o, L.nw, { mask: L.build.tt ? L.build.mask : -1, type: st.utype, auto: st.auto }) : stepEvs(st.mode, L.c, L.o, L.nw, { auto: st.auto });
        if (all.length) {
          const settle = all.length;
          L.t = L.t >= settle ? 0 : L.t + 1;
          if (L.t > 0) fire([all[L.t - 1]]);
          else {
            const z = JSON.parse(JSON.stringify(all[0]));
            z.data.t = 0;
            Object.keys(z.data.outs).forEach(k => { z.data.outs[k].v = z.data.outs[k].v0; });
            fire([z]);
          }
        }
      }
    }
    missions.forEach(m => { if (m.doneHere) count[m.id]++; });
  }
  console.log('\n亂按模擬：' + SESS + ' 個學生、每人隨機操作 ' + ACTS + ' 次（固定種子；拉滑桿時有 4 成拉到最小或最大，和試玩工具一樣），每個任務被碰巧完成的比例：');
  const row = ms => ms.map(m => m.id.replace('logic-gates-', '') + ' ' + (count[m.id] / SESS * 100).toFixed(1) + '%').join('、');
  console.log('  公開：' + row(missions.filter(m => !m.hidden)));
  console.log('  隱藏：' + row(missions.filter(m => m.hidden)));
  console.log('  （沒有任何任務需要運氣：每個任務都有確定的做法，見上面的「達成」）');
}

// ---------- 總覽 ----------
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;   // 隱藏任務星星加倍（與 js/missions.js 的 LabMission.starsOf 相同）
const stars = missions.reduce((s, m) => s + starsOf(m), 0);
console.log(`\n公開 ${pub.length} 個、隱藏 ${hid.length} 個，共 ${stars} 顆星（公開 ${pub.reduce((s, m) => s + m.level, 0)}、隱藏 ${hid.reduce((s, m) => s + starsOf(m), 0)}，隱藏任務是等級 × 2）。`);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('隱藏任務超過 20 顆星（規則上限）。'); }
if (pub.length < 8 || pub.length > 12 || hid.length !== 10) { fail++; console.log('任務數量不符（公開 8–12、隱藏 10）。'); }
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發，隱藏任務互不順便完成。');
