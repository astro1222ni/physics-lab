// 以 Node 執行：node tests/logic-gates-core.test.js
'use strict';
const assert = require('assert');
const L = require('../js/logic-gates-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const X = L.X;

console.log('七種閘');
test('真值表（列 00、01、10、11；NOT 為 A = 0、1）', () => {
  assert.deepStrictEqual(L.truthTable('AND'), [0, 0, 0, 1]);
  assert.deepStrictEqual(L.truthTable('OR'), [0, 1, 1, 1]);
  assert.deepStrictEqual(L.truthTable('NAND'), [1, 1, 1, 0]);
  assert.deepStrictEqual(L.truthTable('NOR'), [1, 0, 0, 0]);
  assert.deepStrictEqual(L.truthTable('XOR'), [0, 1, 1, 0]);
  assert.deepStrictEqual(L.truthTable('XNOR'), [1, 0, 0, 1]);
  assert.deepStrictEqual(L.truthTable('NOT'), [1, 0]);
});
test('和 JavaScript 位元運算對照：AND = a & b、OR = a | b、XOR = a ^ b，加反相的三種互為相反', () => {
  for (let a = 0; a <= 1; a++) for (let b = 0; b <= 1; b++) {
    assert.strictEqual(L.evalGate('AND', a, b), a & b);
    assert.strictEqual(L.evalGate('OR', a, b), a | b);
    assert.strictEqual(L.evalGate('XOR', a, b), a ^ b);
    assert.strictEqual(L.evalGate('NAND', a, b), 1 - (a & b));
    assert.strictEqual(L.evalGate('NOR', a, b), 1 - (a | b));
    assert.strictEqual(L.evalGate('XNOR', a, b), 1 - (a ^ b));
  }
});
test('笛摩根定律：NAND(a, b) = OR(¬a, ¬b)，NOR(a, b) = AND(¬a, ¬b)', () => {
  for (let a = 0; a <= 1; a++) for (let b = 0; b <= 1; b++) {
    assert.strictEqual(L.evalGate('NAND', a, b), L.evalGate('OR', 1 - a, 1 - b));
    assert.strictEqual(L.evalGate('NOR', a, b), L.evalGate('AND', 1 - a, 1 - b));
  }
});
test('三值邏輯：沒接的腳是 X；AND(0, X) = 0、OR(1, X) = 1、NAND(0, X) = 1、NOR(1, X) = 0，其他是 X', () => {
  assert.strictEqual(L.evalGate('AND', 0, X), 0);
  assert.strictEqual(L.evalGate('AND', 1, X), X);
  assert.strictEqual(L.evalGate('OR', 1, X), 1);
  assert.strictEqual(L.evalGate('OR', 0, X), X);
  assert.strictEqual(L.evalGate('NAND', X, 0), 1);
  assert.strictEqual(L.evalGate('NOR', X, 1), 0);
  assert.strictEqual(L.evalGate('XOR', 1, X), X);
  assert.strictEqual(L.evalGate('NOT', X), X);
});
test('只用 NAND 組成的七種閘，真值表和原本的閘相同', () => {
  L.GATE_LIST.forEach(type => {
    const c = L.nandForm(type);
    c.gates.forEach(g => assert.strictEqual(g.type, 'NAND'));
    const y = c.idx.Y;
    const tt = L.GATES[type].arity === 1 ? [0, 1].map(a => L.steady(c, [a])[y])
      : [0, 1, 2, 3].map(r => L.steady(c, [r >> 1, r & 1])[y]);
    assert.deepStrictEqual(tt, L.truthTable(type), type);
  });
});

console.log('加法器');
test('半加器：2C + S = A + B', () => {
  const c = L.halfAdder();
  for (let a = 0; a <= 1; a++) for (let b = 0; b <= 1; b++) {
    const v = L.steady(c, [a, b]);
    assert.strictEqual(2 * v[c.idx.C] + v[c.idx.S], a + b);
  }
});
test('全加器八列：2Cout + S = A + B + Cin；Cout 是多數決、S 是奇偶', () => {
  const c = L.fullAdder();
  for (let r = 0; r < 8; r++) {
    const a = r >> 2 & 1, b = r >> 1 & 1, ci = r & 1;
    const v = L.steady(c, [a, b, ci]);
    assert.strictEqual(2 * v[c.idx.COUT] + v[c.idx.S], a + b + ci, 'row ' + r);
    assert.strictEqual(v[c.idx.COUT], a + b + ci >= 2 ? 1 : 0);
    assert.strictEqual(v[c.idx.S], (a + b + ci) % 2);
  }
});
test('4 位元：全部 16 × 16 × 2 = 512 組輸入，S + 16·Cout = A + B + Cin', () => {
  const c = L.rippleAdder(4);
  for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) for (let ci = 0; ci < 2; ci++) {
    const r = L.adderRead(c, L.steady(c, L.adderInputs(4, a, b, ci)));
    assert.strictEqual(r.s + 16 * r.cout, a + b + ci, `${a}+${b}+${ci}`);
  }
});
test('8 位元：全部 256 × 256 × 2 = 131 072 組輸入，S + 256·Cout = A + B + Cin', () => {
  const c = L.rippleAdder(8);
  for (let a = 0; a < 256; a++) for (let b = 0; b < 256; b++) for (let ci = 0; ci < 2; ci++) {
    const r = L.adderRead(c, L.steady(c, L.adderInputs(8, a, b, ci)));
    if (r.s + 256 * r.cout !== a + b + ci) assert.fail(`${a}+${b}+${ci}`);
  }
});
test('關鍵路徑：n 位元最高位進位的深度是 2n + 1、最高和位元是 2n（n = 1…8）', () => {
  for (let n = 1; n <= 8; n++) {
    const c = L.rippleAdder(n), d = L.depths(c);
    assert.strictEqual(d[c.idx['C' + n]], 2 * n + 1, 'C' + n);
    assert.strictEqual(d[c.idx['S' + (n - 1)]], 2 * n, 'S' + (n - 1));
    assert.strictEqual(Math.max.apply(null, d), 2 * n + 1);
  }
});
test('進位資訊：G／P／K、各位進位與加法器的節點值一致；最長進位傳遞距離', () => {
  const c = L.rippleAdder(4);
  for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) for (let ci = 0; ci < 2; ci++) {
    const info = L.carryInfo(4, a, b, ci), v = L.steady(c, L.adderInputs(4, a, b, ci));
    for (let k = 1; k <= 4; k++) assert.strictEqual(info.carries[k], v[c.idx['C' + k]]);
  }
  assert.strictEqual(L.carryInfo(4, 15, 1, 0).chain, 4);       // 1111 + 0001：第 0 位產生，一路傳到 C4
  assert.strictEqual(L.carryInfo(4, 15, 0, 1).chain, 4);       // 1111 + 0000 + 1：從 Cin 進來
  assert.strictEqual(L.carryInfo(4, 5, 10, 0).chain, 0);       // 0101 + 1010：沒有進位
  assert.strictEqual(L.carryInfo(4, 3, 3, 0).chain, 1);        // 0011 + 0011：每個進位只走一格（等於左移）
  assert.strictEqual(L.carryInfo(8, 255, 1, 0).chain, 8);
  assert.deepStrictEqual(L.carryInfo(4, 9, 7, 0).gpk, ['G', 'P', 'P', 'P']);
});
test('有號溢位 V = C(n) ⊕ C(n−1)，等於「二補數的真正和超出 −2^(n−1)…2^(n−1) − 1」', () => {
  for (const n of [4, 8]) {
    const M = 1 << n;
    for (let a = 0; a < M; a++) for (let b = 0; b < M; b++) {
      const sum = L.signedOf(a, n) + L.signedOf(b, n);
      const out = sum < -(M / 2) || sum > M / 2 - 1 ? 1 : 0;
      if (L.overflowV(n, a, b, 0) !== out) assert.fail(`n=${n} ${a}+${b}`);
    }
  }
  assert.strictEqual(L.signedOf(8, 4), -8);
  assert.strictEqual(L.signedOf(127, 8), 127);
  assert.strictEqual(L.signedOf(128, 8), -128);
});

console.log('單位閘延遲的事件驅動模擬');
test('一個閘：輸入在 t = 0 改變，輸出在 t = 1 改變，穩定時間 1', () => {
  const c = L.gateCircuit('AND');
  const sim = L.simulate(c, [0, 1], [1, 1]);
  assert.strictEqual(sim.settle, 1);
  assert.deepStrictEqual(sim.hist[c.idx.Y], [[1, 1]]);
  assert.strictEqual(L.valueAt(sim, c.idx.Y, 0), 0);
  assert.strictEqual(L.valueAt(sim, c.idx.Y, 1), 1);
  const none = L.simulate(c, [1, 1], [1, 1]);
  assert.strictEqual(none.settle, 0);
  assert.strictEqual(none.events, 0);
});
test('事件驅動和「每一步重算所有閘」的同步模擬逐時刻相同（全加器全部 64 種轉換、4 位元 3000 組亂數轉換）', () => {
  const check = (c, o, n) => {
    const sim = L.simulate(c, o, n);
    const frames = L.simulateSync(c, o, n, sim.settle + 3);
    for (let t = 0; t < frames.length; t++) for (let i = 0; i < c.names.length; i++) {
      if (L.valueAt(sim, i, t) !== frames[t][i]) assert.fail(`t=${t} ${c.names[i]}`);
    }
    assert.deepStrictEqual(sim.final, L.steady(c, n));
  };
  const fa = L.fullAdder();
  for (let o = 0; o < 8; o++) for (let n = 0; n < 8; n++) check(fa, [o >> 2 & 1, o >> 1 & 1, o & 1], [n >> 2 & 1, n >> 1 & 1, n & 1]);
  const c = L.rippleAdder(4), r = L.rng(42);
  for (let k = 0; k < 3000; k++) {
    const pick = () => L.adderInputs(4, r() * 16 | 0, r() * 16 | 0, r() < 0.5 ? 1 : 0);
    check(c, pick(), pick());
  }
});
test('穩定時間不超過關鍵路徑；4 位元所有單一開關的轉換，最慢正好是 2n + 1 = 9', () => {
  const c = L.rippleAdder(4);
  let max = 0;
  for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) for (let ci = 0; ci < 2; ci++) {
    const o = L.adderInputs(4, a, b, ci);
    for (let k = 0; k < 9; k++) {
      const n = o.slice(); n[k] ^= 1;
      const s = L.simulate(c, o, n).settle;
      assert.ok(s <= 9);
      max = Math.max(max, s);
    }
  }
  assert.strictEqual(max, 9);
  // A = 1110 → 1111、B = 0000、Cin = 1：P0 在 t = 1 變 1，進位依序在 t = 3、5、7、9 到達 C1…C4
  const sim = L.simulate(c, L.adderInputs(4, 14, 0, 1), L.adderInputs(4, 15, 0, 1));
  assert.strictEqual(sim.settle, 9);
  [1, 2, 3, 4].forEach(k => assert.deepStrictEqual(sim.hist[c.idx['C' + k]], [[2 * k + 1, 1]]));
});
test('8 位元：A0 由 0 變 1（A = 11111110、B = 0、Cin = 1）要 17 個閘延遲', () => {
  const c = L.rippleAdder(8);
  const sim = L.simulate(c, L.adderInputs(8, 254, 0, 1), L.adderInputs(8, 255, 0, 1));
  assert.strictEqual(sim.settle, 17);
});
test('突波：全加器 A 由 1 變 0（B = Cin = 1），Cout 在 t = 2 掉成 0、t = 3 又回到 1', () => {
  const c = L.fullAdder();
  const sim = L.simulate(c, [1, 1, 1], [0, 1, 1]);
  assert.deepStrictEqual(sim.hist[c.idx.COUT], [[2, 0], [3, 1]]);
  assert.ok(L.glitchy(sim, c.idx.COUT));
  assert.ok(!L.glitchy(sim, c.idx.S));
});
test('傳輸延遲模型的進位振盪：4 位元 A 由 15 變 0（B = 15、Cin = 1），C4 來回變 8 次後停在 1', () => {
  const c = L.rippleAdder(4);
  const sim = L.simulate(c, L.adderInputs(4, 15, 15, 1), L.adderInputs(4, 0, 15, 1));
  assert.strictEqual(L.flips(sim, c.idx.C4), 8);
  assert.strictEqual(sim.final[c.idx.C4], 1);
  assert.strictEqual(sim.settle, 9);
});

console.log('萬用閘拼圖');
test('拼圖電路：沒接好的腳讓輸出是 X（tt = null）；只算輸出用到的閘', () => {
  const r0 = L.buildUniversal('NAND', [[null, null], [null, null], [null, null]]);
  assert.strictEqual(r0.tt, null);
  const r1 = L.buildUniversal('NAND', [['A', 'B'], [null, 'A'], [0, 0]]);
  assert.deepStrictEqual(r1.tt, [0, 0, 0, 1]);          // AND：第 2 個閘沒接好但沒用到
  assert.deepStrictEqual(r1.cone, [0, 2]);
  assert.strictEqual(r1.count, 2);
  assert.strictEqual(r1.depth, 2);
  const r2 = L.buildUniversal('NAND', [['A', 'A'], ['A', 0]]);
  assert.deepStrictEqual(r2.tt, [1, 1, 1, 1]);          // NAND(A, ¬A) 永遠是 1
  const r3 = L.buildUniversal('NOR', [['A', 'A'], ['B', 'B'], [0, 1]]);
  assert.deepStrictEqual(r3.tt, [0, 0, 0, 1]);          // OR 的 NAND 接法換成 NOR 變成 AND（笛摩根對偶）
  const r4 = L.buildUniversal('NAND', [['A', 'B'], ['A', 0], ['B', 0], [1, 2]]);
  assert.strictEqual(r4.mask, L.TARGETS.XOR);
});
test('窮舉最少閘數（NAND）：NOT 1、AND 2、OR 3、NOR 4、XOR 4、XNOR 5；常數 1 與「等於 A」都是 2', () => {
  const want = { NOT: 1, AND: 2, OR: 3, NAND: 1, NOR: 4, XOR: 4, XNOR: 5 };
  Object.keys(want).forEach(k => assert.strictEqual(L.minGates('NAND', L.TARGETS[k], 6).k, want[k], k));
  assert.strictEqual(L.minGates('NAND', 15, 6).k, 2);
  assert.strictEqual(L.minGates('NAND', 12, 6).k, 2);
  assert.strictEqual(L.minGates('NAND', 0, 6).k, 3);
});
test('窮舉最少閘數（NOR，與 NAND 對偶）：NOT 1、OR 2、AND 3、NAND 4、XNOR 4、XOR 5', () => {
  const want = { NOT: 1, OR: 2, AND: 3, NOR: 1, NAND: 4, XNOR: 4, XOR: 5 };
  Object.keys(want).forEach(k => assert.strictEqual(L.minGates('NOR', L.TARGETS[k], 6).k, want[k], k));
  assert.strictEqual(L.minGates('NOR', 0, 6).k, 2);
  assert.strictEqual(L.minGates('NOR', 15, 6).k, 3);
});
test('窮舉找到的接法，用拼圖電路重算真值表也對', () => {
  ['NAND', 'NOR'].forEach(type => Object.keys(L.TARGETS).forEach(k => {
    const m = L.minGates(type, L.TARGETS[k], 6);
    const r = L.buildUniversal(type, m.conns);
    assert.strictEqual(r.mask, L.TARGETS[k], type + ' ' + k);
    assert.strictEqual(r.count, m.k);
  }));
});
test('真值表遮罩與 16 種函數的名稱一一對應', () => {
  for (let m = 0; m < 16; m++) {
    assert.strictEqual(L.ttMask(L.maskTT(m)), m);
    assert.ok(L.FUNCS[m] && L.FUNCS[m].tex);
  }
  L.GATE_LIST.forEach(g => { if (L.GATES[g].arity === 2) assert.strictEqual(L.ttMask(L.truthTable(g)), L.TARGETS[g]); });
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗。' : '。'));
