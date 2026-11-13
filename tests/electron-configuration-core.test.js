// 以 Node 執行：node tests/electron-configuration-core.test.js
'use strict';
const assert = require('assert');
const E = require('../js/electron-configuration-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const Zof = s => E.SYM.indexOf(s) + 1;
const cfg = (s, q) => E.cfgText(E.config(Zof(s), q || 0), true);
const full = (s, q) => E.cfgText(E.config(Zof(s), q || 0), false);

test('118 個元素的符號、中英文名稱齊全', function () {
  assert.strictEqual(E.N, 118);
  assert.strictEqual(E.SYM.length, 118); assert.strictEqual(E.EN.length, 118); assert.strictEqual(E.ZH.length, 118);
  [[1, 'H', '氫'], [24, 'Cr', '鉻'], [26, 'Fe', '鐵'], [29, 'Cu', '銅'], [46, 'Pd', '鈀'], [64, 'Gd', '釓'], [74, 'W', '鎢'], [103, 'Lr', '鐒'], [118, 'Og', '鿫']]
    .forEach(a => { assert.strictEqual(E.SYM[a[0] - 1], a[1]); assert.strictEqual(E.ZH[a[0] - 1], a[2]); });
});

test('n + l 規則的填入順序：1s 2s 2p 3s 3p 4s 3d 4p 5s 4d 5p 6s 4f 5d 6p 7s 5f 6d 7p，容量 2(2l+1)，合計 118', function () {
  assert.strictEqual(E.SUB.map(s => s.label).join(' '), '1s 2s 2p 3s 3p 4s 3d 4p 5s 4d 5p 6s 4f 5d 6p 7s 5f 6d 7p');
  E.SUB.forEach(s => { assert.strictEqual(s.cap, 2 * (2 * s.l + 1)); assert.strictEqual(s.m, 2 * s.l + 1); });
  assert.strictEqual(E.SUB.reduce((a, s) => a + s.cap, 0), 118);
  // 每一層最多 2n² 個電子（第 1–4 層都在 118 以內放得下完整的一層）
  [1, 2, 3, 4].forEach(n => assert.strictEqual(E.SUB.filter(s => s.n === n).reduce((a, s) => a + s.cap, 0), 2 * n * n));
  // 前後兩個副層：n + l 不減；相同時 n 遞增
  for (let i = 1; i < E.NS; i++) {
    const a = E.SUB[i - 1], b = E.SUB[i];
    assert.ok(a.n + a.l < b.n + b.l || (a.n + a.l === b.n + b.l && a.n < b.n), a.label + ' → ' + b.label);
  }
});

test('鈍氣的組態剛好填滿到 np（照構築原理）', function () {
  assert.strictEqual(full('He'), '1s2');
  assert.strictEqual(full('Ne'), '1s2 2s2 2p6');
  assert.strictEqual(full('Ar'), '1s2 2s2 2p6 3s2 3p6');
  assert.strictEqual(cfg('Kr'), '[Ar] 3d10 4s2 4p6');
  assert.strictEqual(cfg('Xe'), '[Kr] 4d10 5s2 5p6');
  assert.strictEqual(cfg('Rn'), '[Xe] 4f14 5d10 6s2 6p6');
  assert.strictEqual(cfg('Og'), '[Rn] 5f14 6d10 7s2 7p6');
  E.NOBLE.forEach(g => assert.strictEqual(E.nobleMatch(E.config(g, 0)), g));
});

test('一般元素照構築原理（K 4s1、Sc 3d1 4s2、Fe 3d6 4s2、Br、Tc、W、Hg、Lu）', function () {
  assert.strictEqual(cfg('K'), '[Ar] 4s1');
  assert.strictEqual(cfg('Sc'), '[Ar] 3d1 4s2');
  assert.strictEqual(cfg('Fe'), '[Ar] 3d6 4s2');
  assert.strictEqual(cfg('Br'), '[Ar] 3d10 4s2 4p5');
  assert.strictEqual(cfg('Tc'), '[Kr] 4d5 5s2');
  assert.strictEqual(cfg('W'), '[Xe] 4f14 5d4 6s2');
  assert.strictEqual(cfg('Hg'), '[Xe] 4f14 5d10 6s2');
  assert.strictEqual(cfg('Lu'), '[Xe] 4f14 5d1 6s2');
  assert.strictEqual(cfg('Eu'), '[Xe] 4f7 6s2');
});

test('NIST 的 20 個例外（Cr、Cu、Nb、Mo、Ru、Rh、Pd、Ag、La、Ce、Gd、Pt、Au、Ac、Th、Pa、U、Np、Cm、Lr）', function () {
  const want = {
    Cr: '[Ar] 3d5 4s1', Cu: '[Ar] 3d10 4s1', Nb: '[Kr] 4d4 5s1', Mo: '[Kr] 4d5 5s1', Ru: '[Kr] 4d7 5s1', Rh: '[Kr] 4d8 5s1',
    Pd: '[Kr] 4d10', Ag: '[Kr] 4d10 5s1', La: '[Xe] 5d1 6s2', Ce: '[Xe] 4f1 5d1 6s2', Gd: '[Xe] 4f7 5d1 6s2',
    Pt: '[Xe] 4f14 5d9 6s1', Au: '[Xe] 4f14 5d10 6s1', Ac: '[Rn] 6d1 7s2', Th: '[Rn] 6d2 7s2', Pa: '[Rn] 5f2 6d1 7s2',
    U: '[Rn] 5f3 6d1 7s2', Np: '[Rn] 5f4 6d1 7s2', Cm: '[Rn] 5f7 6d1 7s2', Lr: '[Rn] 5f14 7s2 7p1'
  };
  assert.strictEqual(Object.keys(E.EXC).length, 20);
  Object.keys(want).forEach(s => { assert.ok(E.isException(Zof(s)), s); assert.strictEqual(cfg(s), want[s], s); });
  // 構築原理的預測和實際不同
  Object.keys(E.EXC).forEach(z => assert.notStrictEqual(E.key(E.aufbau(+z)), E.key(E.config(+z, 0)), 'Z = ' + z));
  assert.ok(!E.isException(Zof('W')) && !E.isException(Zof('Tc')) && !E.isException(Zof('Fe')));
});

test('每個中性原子與每個可選的離子：電子數 = Z − q，每個副層不超過容量', function () {
  for (let Z = 1; Z <= 118; Z++) {
    const r = E.chargeRange(Z);
    assert.ok(r.min <= 0 && r.max >= 1 && r.max <= 4 && r.min >= -3, 'Z = ' + Z);
    for (let q = r.min; q <= r.max; q++) {
      const occ = E.config(Z, q);
      assert.strictEqual(E.total(occ), Z - q, Z + ' ' + q);
      occ.forEach((k, i) => assert.ok(k >= 0 && k <= E.SUB[i].cap));
    }
  }
});

test('陽離子：過渡金屬先失去 4s；p 區先失去 p 再失去 s；鑭系先失去 6s、5d 再失去 4f', function () {
  assert.strictEqual(cfg('Fe', 2), '[Ar] 3d6');
  assert.strictEqual(cfg('Fe', 3), '[Ar] 3d5');
  assert.strictEqual(cfg('Cu', 1), '[Ar] 3d10');
  assert.strictEqual(cfg('Cu', 2), '[Ar] 3d9');
  assert.strictEqual(cfg('Zn', 2), '[Ar] 3d10');
  assert.strictEqual(cfg('Cr', 3), '[Ar] 3d3');
  assert.strictEqual(cfg('Mn', 2), '[Ar] 3d5');
  assert.strictEqual(cfg('Co', 2), '[Ar] 3d7');
  assert.strictEqual(cfg('Ti', 4), '[Ne] 3s2 3p6');
  assert.strictEqual(cfg('Ga', 3), '[Ar] 3d10');
  assert.strictEqual(cfg('Sn', 2), '[Kr] 4d10 5s2');
  assert.strictEqual(cfg('Sn', 4), '[Kr] 4d10');
  assert.strictEqual(cfg('Pb', 2), '[Xe] 4f14 5d10 6s2');
  assert.strictEqual(cfg('Pd', 2), '[Kr] 4d8');
  assert.strictEqual(cfg('Ag', 1), '[Kr] 4d10');
  assert.strictEqual(cfg('Eu', 3), '[Xe] 4f6');
  assert.strictEqual(cfg('Gd', 3), '[Xe] 4f7');
  assert.strictEqual(cfg('Ce', 4), '[Kr] 4d10 5s2 5p6');
  assert.strictEqual(E.nobleMatch(E.config(Zof('Ce'), 4)), 54);
  assert.strictEqual(full('H', 1), '');
  assert.strictEqual(E.total(E.config(Zof('He'), 2)), 0);
});

test('陰離子：補到下一個鈍氣（H− 像 He、O2− 像 Ne、Cl− 像 Ar、N3− 像 Ne）；金屬與第 13、14 族不給陰離子', function () {
  assert.strictEqual(full('H', -1), '1s2');
  assert.strictEqual(E.nobleMatch(E.config(1, -1)), 2);
  assert.strictEqual(E.nobleMatch(E.config(8, -2)), 10);
  assert.strictEqual(E.nobleMatch(E.config(17, -1)), 18);
  assert.strictEqual(E.nobleMatch(E.config(7, -3)), 10);
  assert.strictEqual(E.nobleMatch(E.config(Zof('Se'), -2)), 36);
  assert.deepStrictEqual(E.chargeRange(Zof('Na')), { min: 0, max: 4 });
  assert.deepStrictEqual(E.chargeRange(Zof('C')), { min: 0, max: 4 });
  assert.deepStrictEqual(E.chargeRange(Zof('O')), { min: -2, max: 4 });
  assert.deepStrictEqual(E.chargeRange(Zof('Ne')), { min: 0, max: 4 });
  assert.deepStrictEqual(E.chargeRange(1), { min: -1, max: 1 });
  assert.deepStrictEqual(E.chargeRange(2), { min: 0, max: 2 });
  assert.strictEqual(E.clampQ(Zof('Na'), -3), 0);
  assert.strictEqual(E.clampQ(Zof('F'), -3), -1);
});

test('與氖等電子（10 個電子）的粒子：Ne、Na+、Mg2+、Al3+、Si4+、F−、O2−、N3−', function () {
  const list = [];
  for (let Z = 1; Z <= 118; Z++) { const r = E.chargeRange(Z); for (let q = r.min; q <= r.max; q++) if (Z - q === 10) list.push(E.SYM[Z - 1] + (q ? q : '')); }
  assert.deepStrictEqual(list.sort(), ['Al3', 'F-1', 'Mg2', 'N-3', 'Na1', 'Ne', 'O-2', 'Si4'].sort());
  list.length = 0;
  ['Ne', 'Na', 'Mg', 'Al', 'Si', 'F', 'O', 'N'].forEach(s => { const Z = Zof(s); assert.strictEqual(E.nobleMatch(E.config(Z, Z - 10)), 10); });
});

test('洪德定則：未成對電子數（N 3、O 2、Cr 6、Mn 5、Fe 4、Cu 1、Zn 0、Gd 8、Fe3+ 5）；中性原子最多的是 Gd 與 Cm（8 個）', function () {
  const u = (s, q) => E.unpaired(E.config(Zof(s), q || 0));
  assert.deepStrictEqual([u('H'), u('He'), u('C'), u('N'), u('O'), u('F'), u('Ne')], [1, 0, 2, 3, 2, 1, 0]);
  assert.deepStrictEqual([u('Cr'), u('Mn'), u('Fe'), u('Co'), u('Ni'), u('Cu'), u('Zn')], [6, 5, 4, 3, 2, 1, 0]);
  assert.deepStrictEqual([u('Fe', 2), u('Fe', 3), u('Cu', 2), u('Zn', 2), u('Gd'), u('Eu'), u('Pd')], [4, 5, 1, 0, 8, 7, 0]);
  let best = 0, who = [];
  for (let Z = 1; Z <= 118; Z++) { const v = E.unpaired(E.config(Z, 0)); if (v > best) { best = v; who = [Z]; } else if (v === best) who.push(Z); }
  assert.strictEqual(best, 8);
  assert.deepStrictEqual(who.map(z => E.SYM[z - 1]), ['Gd', 'Cm']);
  // 第 4 週期的過渡金屬只有 Zn 沒有未成對電子
  const dia = []; for (let Z = 21; Z <= 30; Z++) if (!E.unpaired(E.config(Z, 0))) dia.push(E.SYM[Z - 1]);
  assert.deepStrictEqual(dia, ['Zn']);
  // 軌域圖：氮 2p 三格各一個 ↑
  const b = E.boxesOf(E.config(7, 0));
  assert.deepStrictEqual(b[E.idx(2, 1)], [[1, 0], [1, 0], [1, 0]]);
  assert.deepStrictEqual(E.boxesOf(E.config(8, 0))[E.idx(2, 1)], [[1, 1], [1, 0], [1, 0]]);
});

test('自己填的檢查：基態、違反洪德（太早配對、自旋不平行）、激發態、電子數不對', function () {
  const N7 = E.boxesOf(E.config(7, 0));
  let r = E.evaluate(N7, 7, 0);
  assert.ok(r.ground && r.hundOK && r.aufbauOK && r.count === 7 && r.unpaired === 3);
  // 全部 ↓ 也是基態（自旋平行就好）
  const down = JSON.parse(JSON.stringify(N7)); down[E.idx(2, 1)] = [[0, 1], [0, 1], [0, 1]];
  assert.ok(E.evaluate(down, 7, 0).ground);
  // 太早配對
  const pair = JSON.parse(JSON.stringify(N7)); pair[E.idx(2, 1)] = [[1, 1], [1, 0], [0, 0]];
  r = E.evaluate(pair, 7, 0);
  assert.ok(!r.ground && r.occMatch && !r.hundOK);
  // 自旋不平行
  const anti = JSON.parse(JSON.stringify(N7)); anti[E.idx(2, 1)] = [[1, 0], [0, 1], [1, 0]];
  r = E.evaluate(anti, 7, 0);
  assert.ok(!r.ground && !r.hundOK);
  // 鈉的激發態 1s2 2s2 2p6 3p1
  const na = E.boxesOf(E.config(11, 0)); na[E.idx(3, 0)][0] = [0, 0]; na[E.idx(3, 1)][0] = [1, 0];
  r = E.evaluate(na, 11, 0);
  assert.ok(!r.ground && !r.aufbauOK && r.count === 11 && r.key === '1s2 2s2 2p6 3p1');
  // 少一個電子
  const fe = E.boxesOf(E.config(26, 2)); fe[E.idx(3, 2)][0] = [1, 0];
  r = E.evaluate(fe, 26, 2);
  assert.ok(!r.ground && r.count === 23 && r.N === 24);
  // 鉻：照構築原理（3d4 4s2）填不算基態
  r = E.evaluate(E.boxesOf(E.aufbau(24)), 24, 0);
  assert.ok(!r.ground && r.hundOK);
  assert.ok(E.evaluate(E.boxesOf(E.config(24, 0)), 24, 0).ground);
});

test('逐一填入的步驟：每個元素、每個電荷，從空的軌域圖做完都剛好是基態（照洪德定則）', function () {
  let nsteps = 0;
  for (let Z = 1; Z <= 118; Z++) {
    const r = E.chargeRange(Z);
    for (let q = r.min; q <= r.max; q++) {
      const st = E.steps(Z, q), b = E.emptyBoxes();
      st.forEach(s => {
        if (s.type === 'add') assert.strictEqual(b[s.s][s.o][s.spin], 0, '重複放 ' + Z + ' ' + q);
        if (s.type === 'remove') assert.strictEqual(b[s.s][s.o][s.spin], 1, '拿走空格 ' + Z + ' ' + q);
        E.apply(b, s);
      });
      nsteps += st.length;
      assert.deepStrictEqual(b, E.boxesOf(E.config(Z, q)), Z + ' ' + q);
      assert.ok(E.evaluate(b, Z, q).ground || Z - q === 0, Z + ' ' + q);
    }
  }
  // 鉻：24 次放入＋1 次搬家（4s → 3d）；Pd 搬 2 次；Fe2+ 先放 26 個再拿走 2 個 4s
  const cr = E.steps(24, 0);
  assert.strictEqual(cr.filter(s => s.type === 'add').length, 24);
  const mv = cr.filter(s => s.type === 'move');
  assert.strictEqual(mv.length, 1); assert.strictEqual(E.SUB[mv[0].s].label, '4s'); assert.strictEqual(E.SUB[mv[0].s2].label, '3d');
  assert.strictEqual(E.steps(46, 0).filter(s => s.type === 'move').length, 2);
  const fe2 = E.steps(26, 2).filter(s => s.type === 'remove');
  assert.deepStrictEqual(fe2.map(s => E.SUB[s.s].label), ['4s', '4s']);
  assert.ok(nsteps > 0);
});

test('鈍氣核心簡寫與「先填好鈍氣核心」', function () {
  assert.strictEqual(cfg('Ne'), '[He] 2s2 2p6');
  assert.strictEqual(cfg('Na', 1), '[He] 2s2 2p6');
  assert.strictEqual(cfg('Cl', -1), '[Ne] 3s2 3p6');
  assert.strictEqual(E.buildCore(26, 3), 18);
  assert.strictEqual(E.buildCore(17, -1), 10);
  assert.strictEqual(E.buildCore(1, -1), 0);
  assert.strictEqual(E.buildCore(64, 0), 54);
  assert.strictEqual(E.buildCore(11, 4), 2);
  assert.strictEqual(E.buildCore(103, 0), 86);
  for (let Z = 1; Z <= 118; Z++) { const r = E.chargeRange(Z); for (let q = r.min; q <= r.max; q++) { const g = E.buildCore(Z, q); assert.ok(g <= Z - q); } }
});

test('週期表位置：H 在 Li 上面（第 1 族），He 在第 18 族，每格不重疊；區塊數 s 14、p 36、d 38、f 30', function () {
  const seen = {};
  for (let Z = 1; Z <= 118; Z++) { const q = E.pos(Z), k = q.row + ',' + q.col; assert.ok(!seen[k], Z + ' 與 ' + seen[k] + ' 重疊'); seen[k] = Z; }
  assert.deepStrictEqual([E.pos(1).col, E.pos(3).col, E.pos(11).col, E.pos(2).col, E.pos(5).col, E.pos(6).col], [1, 1, 1, 18, 13, 14]);
  assert.deepStrictEqual([E.pos(1).row, E.pos(3).row], [1, 2]);
  const cnt = { s: 0, p: 0, d: 0, f: 0 };
  for (let Z = 1; Z <= 118; Z++) cnt[E.block(Z)]++;
  assert.deepStrictEqual(cnt, { s: 14, p: 36, d: 38, f: 30 });
  assert.deepStrictEqual([E.valence(7), E.valence(11), E.valence(17), E.valence(26), E.valence(31)], [5, 1, 7, null, 3]);
});

console.log(passed + ' 項通過');
