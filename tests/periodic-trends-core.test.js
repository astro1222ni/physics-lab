// 以 Node 執行：node tests/periodic-trends-core.test.js
'use strict';
const assert = require('assert');
const P = require('../js/periodic-trends-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`); }
const Zof = s => P.EL.findIndex(e => e && e.sym === s);

test('118 個元素，符號與原子序對應正確，中文名稱齊全', function () {
  assert.strictEqual(P.N, 118);
  const syms = 'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca'.split(' ');
  syms.forEach((s, i) => assert.strictEqual(P.EL[i + 1].sym, s));
  [[26, 'Fe', '鐵'], [29, 'Cu', '銅'], [47, 'Ag', '銀'], [79, 'Au', '金'], [80, 'Hg', '汞'], [92, 'U', '鈾'], [118, 'Og', '鿫']].forEach(a => {
    assert.strictEqual(P.EL[a[0]].sym, a[1]); assert.strictEqual(P.EL[a[0]].zh, a[2]);
  });
  for (let Z = 1; Z <= 118; Z++) assert.ok(P.EL[Z].zh && P.EL[Z].zh.length >= 1, 'Z = ' + Z);
});
test('照真正的週期表排：每格不重疊；H 在第 1 族、He 在第 18 族；B 在第 13 族（不在 Be 旁邊）；鑭系錒系在下方兩列', function () {
  const seen = {};
  for (let Z = 1; Z <= 118; Z++) { const q = P.pos(Z), k = q.row + ',' + q.col; assert.ok(!seen[k], Z + ' 與 ' + seen[k] + ' 重疊'); seen[k] = Z; }
  const g = s => P.pos(Zof(s)).group, p = s => P.pos(Zof(s)).period;
  assert.deepStrictEqual([g('H'), p('H'), g('He'), p('He')], [1, 1, 18, 1]);
  assert.deepStrictEqual([g('Li'), g('Be'), g('B'), g('C'), g('Ne')], [1, 2, 13, 14, 18]);
  assert.deepStrictEqual([g('Na'), g('Al'), g('Cl'), g('Ar')], [1, 13, 17, 18]);
  assert.deepStrictEqual([g('K'), g('Sc'), g('Zn'), g('Ga'), g('Kr')], [1, 3, 12, 13, 18]);
  assert.deepStrictEqual([g('Cs'), g('Ba'), g('Hf'), g('Au'), g('Hg'), g('Rn')], [1, 2, 4, 11, 12, 18]);
  assert.deepStrictEqual([g('Fr'), g('Ra'), g('Rf'), g('Og')], [1, 2, 4, 18]);
  // 氫的下面是鋰、鋰的下面是鈉（不可排成碳）
  assert.strictEqual(P.groupMembers(1).slice(0, 4).map(Z => P.EL[Z].sym).join(' '), 'H Li Na K');
  assert.strictEqual(P.groupMembers(14).map(Z => P.EL[Z].sym).join(' '), 'C Si Ge Sn Pb Fl');
  assert.strictEqual(P.groupMembers(18).length, 7);
  [57, 71, 89, 103].forEach(Z => assert.ok(P.pos(Z).f && P.block(Z) === 'f'));
  assert.deepStrictEqual([P.pos(57).row, P.pos(57).col, P.pos(71).col, P.pos(89).row], [9, 3, 17, 10]);
  assert.strictEqual(P.periodMembers(3).map(Z => P.EL[Z].sym).join(' '), 'Na Mg Al Si P S Cl Ar');
  assert.strictEqual(P.periodMembers(6).length, 18 - 1);   // 第 6 週期主表 17 格＋鑭系 15 個在下方
});
test('區塊：s（第 1、2 族與 He）、p（13–18 族）、d（3–12 族）、f（鑭系、錒系）', function () {
  const n = { s: 0, p: 0, d: 0, f: 0 };
  for (let Z = 1; Z <= 118; Z++) n[P.block(Z)]++;
  assert.deepStrictEqual(n, { s: 14, p: 36, d: 38, f: 30 });
  assert.strictEqual(P.block(2), 's');
});
test('電子組態：118 個元素的電子總數都等於原子序；鉻、銅的例外；鈉 2,8,1', function () {
  for (let Z = 1; Z <= 118; Z++) assert.strictEqual(P.subshells(Z).reduce((a, s) => a + s[2], 0), Z, 'Z = ' + Z);
  const has = (Z, n, l, c) => P.subshells(Z).some(s => s[0] === n && s[1] === l && s[2] === c);
  assert.ok(has(24, 3, 2, 5) && has(24, 4, 0, 1), '鉻 3d5 4s1');
  assert.ok(has(29, 3, 2, 10) && has(29, 4, 0, 1), '銅 3d10 4s1');
  assert.deepStrictEqual(P.shells(11), [2, 8, 1]);
  assert.deepStrictEqual(P.shells(20), [2, 8, 8, 2]);
  assert.deepStrictEqual(P.shells(36), [2, 8, 18, 8]);
  assert.ok(P.EL[110].predicted && !P.EL[29].predicted);
});
test('價電子數等於主族的族數個位（1、2、13–18 族）；過渡元素沒有單一值', function () {
  for (let Z = 1; Z <= 118; Z++) {
    const b = P.block(Z);
    if (b === 'd' || b === 'f') { assert.strictEqual(P.valence(Z), null); continue; }
    const g = P.pos(Z).group;
    assert.strictEqual(P.valence(Z), Z === 2 ? 2 : g <= 2 ? g : g - 10, 'Z = ' + Z);
  }
});
test('史萊特規則的有效核電荷：Na 2.20、Cl 6.10、F 5.20；同週期向右增加 0.65', function () {
  near(P.slaterZeff(11), 2.20, 1e-9); near(P.slaterZeff(17), 6.10, 1e-9); near(P.slaterZeff(9), 5.20, 1e-9);
  near(P.slaterZeff(1), 1, 1e-9); near(P.slaterZeff(2), 1.70, 1e-9);
  for (let Z = 3; Z < 10; Z++) near(P.slaterZeff(Z + 1) - P.slaterZeff(Z), 0.65, 1e-9);
});
test('數據核對（NIST／CRC 常見值）：游離能 H 1312、Na 495.8、He 2372 kJ/mol；電負度 F 3.98、Cl 3.16；W 熔點 3422 °C；共價半徑 C 75 pm', function () {
  near(P.EL[1].IE, 1312.0, 0.5); near(P.EL[11].IE, 495.8, 0.2); near(P.EL[2].IE, 2372.3, 0.5); near(P.EL[18].IE, 1520.6, 0.5);
  near(P.EL[9].EN, 3.98, 0); near(P.EL[17].EN, 3.16, 0); near(P.EL[55].EN, 0.79, 0);
  near(P.value(74, 'mp'), 3422, 1); near(P.value(80, 'mp'), -38.83, 0.05);
  near(P.EL[6].r, 75, 0); near(P.EL[1].r, 32, 0); near(P.EL[55].r, 232, 0);
  near(P.F_KJ, 6.02214076e23 * 1.602176634e-19 / 1000, 1e-8);
});
test('趨勢：第 3 週期原子半徑由左到右變小、第 1 族由上到下變大；第 2 週期游離能整體增加', function () {
  const r3 = P.periodMembers(3).map(Z => P.EL[Z].r);
  for (let i = 1; i < r3.length - 1; i++) assert.ok(r3[i] < r3[i - 1], '第 3 週期半徑 ' + r3);
  const r1 = P.groupMembers(1).slice(1).filter(Z => P.EL[Z].r != null).map(Z => P.EL[Z].r);
  for (let i = 1; i < r1.length; i++) assert.ok(r1[i] > r1[i - 1], '第 1 族半徑 ' + r1);
  assert.ok(P.EL[10].IE > P.EL[3].IE * 3.5);
  const en17 = P.groupMembers(17).filter(Z => P.EL[Z].EN != null).map(Z => P.EL[Z].EN);
  for (let i = 1; i < en17.length; i++) assert.ok(en17[i] < en17[i - 1], '鹵素電負度 ' + en17);
});
test('游離能的例外：IE(B) < IE(Be)、IE(O) < IE(N)、IE(Al) < IE(Mg)、IE(S) < IE(P)', function () {
  [[5, 4], [8, 7], [13, 12], [16, 15]].forEach(a => assert.ok(P.EL[a[0]].IE < P.EL[a[1]].IE, a.join('<')));
});
test('極值：電負度最大 F、第一游離能最大 He、原子半徑最大 Cs；金屬中電負度最大的是金；室溫液體 Hg 與 Br', function () {
  assert.strictEqual(P.extremes('EN').max, 9);
  assert.strictEqual(P.extremes('IE').max, 2);
  assert.strictEqual(P.extremes('r').max, 55);
  assert.strictEqual(P.extremes('EN', P.isMetal).max, 79);
  const liq = []; for (let Z = 1; Z <= 118; Z++) if (P.EL[Z].state === 'l') liq.push(P.EL[Z].sym);
  assert.deepStrictEqual(liq, ['Br', 'Hg']);
  assert.ok(P.isMetal(80) && !P.isMetal(35));
});
test('猜猜看：候選是 s、p 區主族元素（不含氫與超重元素），有該性質的數據；誤差是相對誤差', function () {
  P.GAME_PROPS.forEach(prop => {
    const c = P.candidates(prop);
    assert.ok(c.length >= 30, prop + ' ' + c.length);
    c.forEach(Z => { assert.ok(P.value(Z, prop) != null); assert.ok(['s', 'p'].includes(P.block(Z))); assert.ok(Z > 1 && Z <= 86); });
  });
  assert.ok(!P.candidates('EN').includes(10), '氖沒有電負度');
  let a = 5; const r = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  for (let k = 0; k < 200; k++) { const Z = P.pick('IE', r, 11); assert.ok(Z !== 11 && P.candidates('IE').includes(Z)); }
  near(P.guessErr(110, 100), 0.1, 1e-12); near(P.guessErr(-90, -100), 0.1, 1e-12);
});

console.log(passed + ' 項通過');
