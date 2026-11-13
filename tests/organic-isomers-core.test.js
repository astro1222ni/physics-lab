// 以 Node 執行：node tests/organic-isomers-core.test.js
'use strict';
const assert = require('assert');
const O = require('../js/organic-isomers-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + (e && e.stack || e)); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`); }
/** 抽象結構 → 擺上格子 → 頁面用的分子（含起始的上下交錯 z） */
function build(S, st) {
  const pos = O.layout(S, st);
  assert.ok(pos, '擺不上格子：' + JSON.stringify(S));
  return {
    atoms: S.el.map(function (e, i) { const p = O.lxy(pos[i].q, pos[i].r), c = O.lcolor(pos[i].q, pos[i].r); return { el: e, x: p.x, y: p.y, z: c === 1 ? 0.35 : c === 2 ? -0.35 : 0 }; }),
    bonds: S.e.map(function (b) { return { a: b[0], b: b[1], o: b[2] }; })
  };
}
/** 直接用格子座標組分子：atoms [[q, r, el]]、bonds [[a, b, o]] */
function grid(atoms, bonds) {
  return { atoms: atoms.map(function (a) { const p = O.lxy(a[0], a[1]); return { el: a[2] || 'C', x: p.x, y: p.y }; }), bonds: bonds.map(function (b) { return { a: b[0], b: b[1], o: b[2] || 1 }; }) };
}
function names(t) { return O.enumerate(t.C, t.O, t.H, t.scope).map(function (x) { return O.analyze(build(x.S, x.stereo)).en; }).sort(); }

test('烷類結構異構物數目：C1–C10 = 1, 1, 1, 2, 3, 5, 9, 18, 35, 75（OEIS A000602）', function () {
  const want = [1, 1, 1, 2, 3, 5, 9, 18, 35, 75];
  for (let n = 1; n <= 10; n++) assert.strictEqual(O.enumerate(n, 0, 2 * n + 2, 'alkane').length, want[n - 1], 'C' + n + 'H' + (2 * n + 2));
});
test('含順反的數目：C4H8 烯 4、全部 6；C5H10 烯 6；C6H12 烯 17（13 種結構＋4 對順反）；C3H6 2；C4H6 9 種', function () {
  assert.strictEqual(O.enumerate(4, 0, 8, 'ene').length, 4);
  assert.strictEqual(O.enumerate(4, 0, 8, 'hc').length, 6);
  assert.strictEqual(O.enumerate(5, 0, 10, 'ene').length, 6);
  assert.strictEqual(O.enumerate(6, 0, 12, 'ene').length, 17);
  assert.strictEqual(O.enumerate(3, 0, 6, 'hc').length, 2);
  // C4H6：1-丁炔、2-丁炔、1,2-丁二烯、1,3-丁二烯、環丁烯、兩種甲基環丙烯、亞甲基環丙烷、雙環丁烷
  assert.strictEqual(O.enumerate(4, 0, 6, 'hc').length, 9);
  // 不算順反時 C6H12 烯類是 13 種
  const keys0 = new Set(O.enumerate(6, 0, 12, 'ene').map(function (x) { return O.canonical(O.toG(x.S), []); }));
  assert.strictEqual(keys0.size, 13);
});
test('含氧：C2H6O 2、C3H8O 3、C4H10O 7（4 醇＋3 醚）、C5H12O 14；醛酮 C3H6O 2、C4H8O 3、C5H10O 7', function () {
  assert.strictEqual(O.enumerate(2, 1, 6, 'any').length, 2);
  assert.strictEqual(O.enumerate(3, 1, 8, 'any').length, 3);
  assert.strictEqual(O.enumerate(4, 1, 10, 'any').length, 7);
  assert.strictEqual(O.enumerate(5, 1, 12, 'any').length, 14);
  assert.strictEqual(O.enumerate(3, 1, 6, 'carbonyl').length, 2);
  assert.strictEqual(O.enumerate(4, 1, 8, 'carbonyl').length, 3);
  assert.strictEqual(O.enumerate(5, 1, 10, 'carbonyl').length, 7);
  const c4 = names(O.target('C4H10O'));
  assert.deepStrictEqual(c4, ['1-butanol', '1-methoxypropane', '2-butanol', '2-methoxypropane', '2-methyl-1-propanol', '2-methyl-2-propanol', 'ethoxyethane']);
});
test('圖鑑題目的數目與每一個的名稱、沸點都有（任務用的 14 題）', function () {
  const want = { C4H10: 2, C5H12: 3, C6H14: 5, C7H16: 9, C8H18: 18, C3H6: 2, 'C4H8-ene': 4, C4H8: 6, 'C5H10-ene': 6, C2H6O: 2, C3H8O: 3, C4H10O: 7, C3H6O: 2, C4H8O: 3 };
  O.TARGETS.forEach(function (t) {
    assert.strictEqual(O.targetCount(t.id), want[t.id], t.id);
    const nm = names(t);
    assert.strictEqual(new Set(nm).size, nm.length, t.id + ' 名稱不可重複');
    nm.forEach(function (n) { assert.ok(n, t.id + ' 有沒命名的'); assert.ok(O.BP[n] != null, '缺沸點：' + n); });
  });
  assert.deepStrictEqual(names(O.target('C6H14')), ['2,2-dimethylbutane', '2,3-dimethylbutane', '2-methylpentane', '3-methylpentane', 'hexane']);
});
test('同一個分子不同畫法 → 同一個標準化字串；不同分子 → 不同', function () {
  // 2-甲基丁烷的兩種畫法：甲基朝上在左邊第二個碳、或朝下在右邊第二個碳
  const a = grid([[0, 0], [1, -1], [2, -1], [3, -2], [1, -2]], [[0, 1], [1, 2], [2, 3], [1, 4]]);
  const b = grid([[5, 0], [4, 0], [3, 1], [2, 1], [3, 2]], [[0, 1], [1, 2], [2, 3], [2, 4]]);
  const A = O.analyze(a), B = O.analyze(b);
  assert.strictEqual(A.en, '2-methylbutane');
  assert.strictEqual(A.key, B.key);
  // 原子編號順序打亂也一樣
  const perm = [3, 0, 4, 1, 2];
  const c = { atoms: perm.map(function (i) { return a.atoms[i]; }), bonds: a.bonds.map(function (x) { return { a: perm.indexOf(x.a), b: perm.indexOf(x.b), o: x.o }; }) };
  assert.strictEqual(O.analyze(c).key, A.key);
  // 「彎彎的正戊烷」還是戊烷
  const bent = grid([[0, 0], [0, 1], [1, 1], [2, 0], [2, -1]], [[0, 1], [1, 2], [2, 3], [3, 4]]);
  assert.strictEqual(O.analyze(bent).en, 'pentane');
  assert.notStrictEqual(O.analyze(bent).key, A.key);
});
test('順反由平面座標判斷：同側 = 順、兩側 = 反；畫成 180° 時順反未定', function () {
  // C0–C1=C2–C3：C1→C2 沿 330°（方向 5）
  const cis = grid([[0, 0], [1, 0], [2, -1], [2, -2]], [[0, 1], [1, 2, 2], [2, 3]]);
  const trans = grid([[0, 0], [1, 0], [2, -1], [3, -1]], [[0, 1], [1, 2, 2], [2, 3]]);
  const straight = grid([[0, 0], [1, 0], [2, -1], [3, -2]], [[0, 1], [1, 2, 2], [2, 3]]);
  assert.strictEqual(O.analyze(cis).en, 'cis-2-butene');
  assert.strictEqual(O.analyze(cis).name.zh, '順-2-丁烯');
  assert.strictEqual(O.analyze(trans).en, 'trans-2-butene');
  assert.strictEqual(O.analyze(trans).name.zh, '反-2-丁烯');
  assert.notStrictEqual(O.analyze(cis).key, O.analyze(trans).key);
  assert.strictEqual(O.analyze(cis).key0, O.analyze(trans).key0, '不看順反時是同一個結構');
  assert.ok(O.analyze(straight).stereoUndef);
  assert.strictEqual(O.analyze(straight).en, null);
  // 1-丁烯沒有順反（一端是 CH2）；2-甲基丙烯也沒有（一端兩個甲基）
  const b1 = grid([[0, 0], [1, 0], [2, -1], [3, -1]], [[0, 1, 2], [1, 2], [2, 3]]);
  assert.strictEqual(O.analyze(b1).stereo.length, 0);
  assert.strictEqual(O.analyze(b1).en, '1-butene');
  const ib = grid([[0, 0], [1, 0], [2, -1], [1, 1]], [[0, 1], [1, 2, 2], [1, 3]]);
  assert.strictEqual(O.analyze(ib).en, '2-methylpropene');
  assert.strictEqual(O.analyze(ib).stereo.length, 0);
});
test('順反用主鏈判斷：3-甲基-2-戊烯；四取代的 3,4-二甲基-3-己烯也有順反', function () {
  const L = O.enumerate(6, 0, 12, 'ene').map(function (x) { return O.analyze(build(x.S, x.stereo)).en; });
  assert.ok(L.indexOf('cis-3-methyl-2-pentene') >= 0 && L.indexOf('trans-3-methyl-2-pentene') >= 0);
  const M = O.enumerate(8, 0, 16, 'ene').map(function (x) { return O.analyze(build(x.S, x.stereo)); });
  const tet = M.filter(function (a) { return a.tetraStereo; }).map(function (a) { return a.en; }).sort();
  assert.ok(tet.indexOf('cis-3,4-dimethyl-3-hexene') >= 0 && tet.indexOf('trans-3,4-dimethyl-3-hexene') >= 0, tet.join(','));
  M.filter(function (a) { return a.tetraStereo; }).forEach(function (a) { assert.ok(/^(cis|trans)-/.test(a.en)); });
});
test('命名：中文簡單的取代基先寫、英文照字母；多重鍵、醇、醚、醛、酮、環、苯', function () {
  const nm = {};
  [[8, 0, 18, 'alkane'], [5, 0, 10, 'hc'], [4, 0, 6, 'hc'], [5, 1, 12, 'any'], [5, 1, 10, 'carbonyl'], [5, 0, 8, 'hc']].forEach(function (q) {
    O.enumerate(q[0], q[1], q[2], q[3]).forEach(function (x) {
      const pos = O.layout(x.S, x.stereo);
      if (!pos) return;
      const a = O.analyze(build(x.S, x.stereo));
      if (a.name.ok) nm[a.en] = a.name.zh;
    });
  });
  const want = {
    '3-ethyl-2-methylpentane': '2-甲基-3-乙基戊烷', '3-ethyl-3-methylpentane': '3-甲基-3-乙基戊烷',
    '2,2,4-trimethylpentane': '2,2,4-三甲基戊烷', '2,2,3,3-tetramethylbutane': '2,2,3,3-四甲基丁烷',
    '1,1-dimethylcyclopropane': '1,1-二甲基環丙烷', 'ethylcyclopropane': '乙基環丙烷', 'cyclopentane': '環戊烷',
    '2-butyne': '2-丁炔', '1,3-butadiene': '1,3-丁二烯', '1,2-butadiene': '1,2-丁二烯',
    '2-methyl-1,3-butadiene': '2-甲基-1,3-丁二烯',
    '2-methoxy-2-methylpropane': '2-甲基-2-甲氧基丙烷', '2-methyl-2-butanol': '2-甲基-2-丁醇', '3-pentanol': '3-戊醇',
    '3-methyl-2-butanone': '3-甲基-2-丁酮', '2,2-dimethylpropanal': '2,2-二甲基丙醛', '3-pentanone': '3-戊酮'
  };
  Object.keys(want).forEach(function (k) { assert.strictEqual(nm[k], want[k], k); });
  // 苯（凱庫勒式）與環己烷
  const benz = grid([[1, 0], [2, -1], [3, -1], [3, 0], [2, 1], [1, 1]], [[0, 1, 2], [1, 2], [2, 3, 2], [3, 4], [4, 5, 2], [5, 0]]);
  assert.strictEqual(O.analyze(benz).name.zh, '苯');
  const hex = grid([[1, 0], [2, -1], [3, -1], [3, 0], [2, 1], [1, 1]], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]]);
  assert.strictEqual(O.analyze(hex).en, 'cyclohexane');
  // 醚的俗名
  const et = O.analyze(grid([[0, 0], [1, -1], [2, -1, 'O'], [3, -2], [4, -2]], [[0, 1], [1, 2], [2, 3], [3, 4]]));
  assert.strictEqual(et.en, 'ethoxyethane');
  assert.deepStrictEqual(et.common, { zh: '二乙醚', en: 'diethyl ether' });
  const me = O.analyze(grid([[0, 0], [1, -1, 'O'], [2, -1], [3, -2]], [[0, 1], [1, 2], [2, 3]]));
  assert.strictEqual(me.name.zh, '甲氧基乙烷');
  assert.deepStrictEqual(me.common, { zh: '甲乙醚', en: 'ethyl methyl ether' });
  // 甲烷、乙烯、乙炔、甲醇、甲醛
  assert.strictEqual(O.analyze(grid([[0, 0]], [])).en, 'methane');
  assert.strictEqual(O.analyze(grid([[0, 0], [1, 0]], [[0, 1, 2]])).name.zh, '乙烯');
  assert.strictEqual(O.analyze(grid([[0, 0], [1, 0]], [[0, 1, 3]])).name.zh, '乙炔');
  assert.strictEqual(O.analyze(grid([[0, 0], [1, 0, 'O']], [[0, 1]])).name.zh, '甲醇');
  assert.strictEqual(O.analyze(grid([[0, 0], [1, 0, 'O']], [[0, 1, 2]])).name.zh, '甲醛');
});
test('示性式與分子式：2-甲基丁烷 CH3CH(CH3)CH2CH3、1-丁烯 CH2=CHCH2CH3、乙醇 CH3CH2OH、丙酮 CH3COCH3', function () {
  const want = { '2-methylbutane': 'CH3CH(CH3)CH2CH3', '1-butene': 'CH2=CHCH2CH3', 'ethanol': 'CH3CH2OH', 'propanone': 'CH3COCH3', 'propanal': 'CH3CH2CHO', 'methoxymethane': 'CH3OCH3', 'trans-2-butene': 'CH3CH=CHCH3' };
  const all = [].concat(O.enumerate(5, 0, 12, 'alkane'), O.enumerate(4, 0, 8, 'ene'), O.enumerate(2, 1, 6, 'any'), O.enumerate(3, 1, 6, 'carbonyl'));
  let hit = 0;
  all.forEach(function (x) {
    const a = O.analyze(build(x.S, x.stereo));
    if (want[a.en]) { assert.strictEqual(a.cond, want[a.en], a.en); hit++; }
    // 分子式守恆：H = 4C + 2O − 2 × 鍵級總和
    let so = 0;
    x.S.e.forEach(function (b) { so += b[2]; });
    assert.strictEqual(a.formula.H, 4 * a.formula.C + 2 * a.formula.O - 2 * so);
    assert.strictEqual(a.dou, (2 * a.formula.C + 2 - a.formula.H) / 2);
  });
  assert.strictEqual(hit, 7);
  assert.strictEqual(O.analyze(grid([[0, 0], [1, 0], [2, -1], [2, 0]], [[0, 1], [1, 2], [1, 3]])).fhtml, 'C<sub>4</sub>H<sub>10</sub>');
});
test('沸點：同分子式的烷類，支鏈越多沸點越低（直鏈最高、最分支的最低）；醇比同分子式的醚高很多', function () {
  [5, 6, 7, 8].forEach(function (n) {
    const L = O.enumerate(n, 0, 2 * n + 2, 'alkane').map(function (x) { return O.analyze(build(x.S, x.stereo)); });
    const straight = L.filter(function (a) { return a.en === ['', '', '', '', '', 'pentane', 'hexane', 'heptane', 'octane'][n]; })[0];
    L.forEach(function (a) { assert.ok(a.bp <= straight.bp, a.en + ' 不應高於直鏈'); });
  });
  assert.ok(O.BP['2,2-dimethylpropane'] < O.BP['2-methylbutane'] && O.BP['2-methylbutane'] < O.BP['pentane']);
  assert.ok(O.BP['ethanol'] - O.BP['methoxymethane'] > 100, '乙醇比二甲醚高 100 °C 以上（氫鍵）');
  assert.ok(O.BP['cis-2-butene'] > O.BP['trans-2-butene'], '順-2-丁烯有微弱極性，沸點稍高');
  // 維納指數與沸點：C5 完全同序；C6 以後大致同序，碳數越多越鬆（3-甲基戊烷 W 31 > 2-甲基戊烷 32 的沸點是例外，Wiener 1947 另加極性數修正）
  const rankCorr = function (L) {
    const r = function (k) { const s = L.slice().sort(function (a, b) { return a[k] - b[k]; }); return L.map(function (x) { return s.indexOf(x); }); };
    const a = r('W'), b = r('bp'), n = L.length;
    let d2 = 0; for (let i = 0; i < n; i++) d2 += (a[i] - b[i]) * (a[i] - b[i]);
    return 1 - 6 * d2 / (n * (n * n - 1));
  };
  [5, 6, 7, 8].forEach(function (n) {
    const L = O.enumerate(n, 0, 2 * n + 2, 'alkane').map(function (x) { return O.analyze(build(x.S, x.stereo)); });
    const rho = rankCorr(L);
    assert.ok(n === 5 ? rho === 1 : rho > (n === 8 ? 0.4 : 0.6), 'C' + n + ' 等級相關 ' + rho.toFixed(2));
  });
  // 維納指數：正戊烷 20、異戊烷 18、新戊烷 16
  assert.strictEqual(O.analyze(grid([[0, 0], [1, 0], [2, -1], [1, -1], [1, 1]], [[0, 1], [1, 2], [1, 3], [1, 4]])).W, 16);
});
test('抽象結構 → 格子 → 分析，標準化字串一致（擺放保留順反）', function () {
  O.TARGETS.forEach(function (t) {
    O.enumerate(t.C, t.O, t.H, t.scope).forEach(function (x) {
      const a = O.analyze(build(x.S, x.stereo));
      assert.strictEqual(a.key, x.key, t.id + ' ' + a.en);
      assert.ok(O.inTarget(a, t), t.id + ' 範圍判斷');
    });
  });
  // 範圍：環丁烷不是 C4H8 烯類；乙醇不是醛酮
  const cb = O.analyze(grid([[0, 0], [1, 0], [1, 1], [0, 1]], [[0, 1], [1, 2], [2, 3], [3, 0]]));
  assert.strictEqual(cb.en, 'cyclobutane');
  assert.ok(O.inTarget(cb, O.target('C4H8')) && !O.inTarget(cb, O.target('C4H8-ene')));
});
test('價數與錯誤：碳超過 4 個鍵、O–O、斷成兩塊、沒有碳都會回報', function () {
  const five = grid([[1, 0], [0, 0], [2, -1], [1, -1], [1, 1], [2, 0]], [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]]);
  assert.strictEqual(O.analyze(five).err, 'valence');
  assert.strictEqual(O.analyze(grid([[0, 0], [1, 0, 'O'], [2, -1, 'O']], [[0, 1], [1, 2]])).err, 'oo');
  assert.strictEqual(O.analyze(grid([[0, 0], [3, 0]], [])).err, 'split');
  assert.strictEqual(O.analyze({ atoms: [], bonds: [] }).err, 'empty');
  assert.strictEqual(O.analyze(grid([[0, 0, 'O']], [])).err, 'noC');
});
test('3D：鍵長、sp3 四面體角 109.5°、雙鍵共平面、三鍵直線、乙烷錯開式、丁烷反式、環己烷椅式', function () {
  function get(t, en) { const x = O.enumerate(t[0], t[1], t[2], t[3]).filter(function (y) { return O.layout(y.S, y.stereo) && O.analyze(build(y.S, y.stereo)).en === en; })[0]; return { x: x, E: O.embed3D(build(x.S, x.stereo)) }; }
  const dist = function (A, i, j) { return Math.hypot(A[i].x - A[j].x, A[i].y - A[j].y, A[i].z - A[j].z); };
  const ang = function (A, i, c, j) { const u = [A[i].x - A[c].x, A[i].y - A[c].y, A[i].z - A[c].z], v = [A[j].x - A[c].x, A[j].y - A[c].y, A[j].z - A[c].z]; return Math.acos((u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / Math.hypot(u[0], u[1], u[2]) / Math.hypot(v[0], v[1], v[2])) * 180 / Math.PI; };
  const eth = O.embed3D(grid([[0, 0], [1, 0]], [[0, 1]]));
  near(dist(eth.atoms, 0, 1), 1.54, 0.03, 'C–C');
  eth.bonds.filter(function (b) { return b.a === 0 && b.b > 1; }).forEach(function (b) { near(dist(eth.atoms, 0, b.b), 1.09, 0.03, 'C–H'); near(ang(eth.atoms, 1, 0, b.b), 109.5, 3, 'H–C–C'); });
  const tw = O.twistEnergy(eth, 0, 1, eth.atoms, 0, 1);
  near(tw.E, 0, 0.3, '錯開式能量最低'); near(tw.minHH, 60, 5, '錯開式 H–H 二面角 60°');
  const P = O.rotateSide(eth, 0, 1, O.side3D(eth, 0, 1), 60);
  near(O.twistEnergy(eth, 0, 1, P, 60, 1).E, 12, 0.5, '乙烷重疊式 12 kJ/mol');
  near(O.twistEnergy(eth, 0, 1, P, 90, 2), O.PI_BOND, 1e-9, '雙鍵扭 90° 要打斷 π 鍵');
  const bu = get([4, 0, 10, 'alkane'], 'butane');
  const ch = [0, 1, 2, 3];
  const G = O.toG(bu.x.S);
  const ends = ch.filter(function (i) { return G.nb[i].length === 1; });
  const path = [ends[0]];
  while (path.length < 4) path.push(G.nb[path[path.length - 1]].map(function (e) { return e.j; }).filter(function (j) { return path.indexOf(j) < 0; })[0]);
  near(Math.abs(O.dihedral(bu.E.atoms, path[0], path[1], path[2], path[3])), 180, 5, '丁烷反式');
  const cis = get([4, 0, 8, 'ene'], 'cis-2-butene'), tr = get([4, 0, 8, 'ene'], 'trans-2-butene');
  [cis, tr].forEach(function (o, k) {
    const g = O.toG(o.x.S), en = [0, 1, 2, 3].filter(function (i) { return g.nb[i].length === 1; });
    const p = [en[0]];
    while (p.length < 4) p.push(g.nb[p[p.length - 1]].map(function (e) { return e.j; }).filter(function (j) { return p.indexOf(j) < 0; })[0]);
    near(Math.abs(O.dihedral(o.E.atoms, p[0], p[1], p[2], p[3])), k ? 180 : 0, 3, k ? '反式' : '順式');
    near(ang(o.E.atoms, p[0], p[1], p[2]), 120, 6, 'sp2 鍵角約 120°');
  });
  const by = get([4, 0, 6, 'hc'], '2-butyne');
  const g2 = O.toG(by.x.S), mid = [0, 1, 2, 3].filter(function (i) { return g2.nb[i].length === 2; });
  const tri = g2.nb[mid[0]].map(function (e) { return e.j; });
  near(ang(by.E.atoms, tri[0], mid[0], tri[1]), 180, 3, 'sp 直線');
  const HQ = [[1, 0], [2, -1], [3, -1], [3, 0], [2, 1], [1, 1]];
  const hm = grid(HQ, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]]);
  hm.atoms.forEach(function (a, i) { const c = O.lcolor(HQ[i][0], HQ[i][1]); a.z = c === 1 ? 0.35 : c === 2 ? -0.35 : 0; });
  const hx = O.embed3D(hm);
  for (let k = 0; k < 6; k++) {
    const d = O.dihedral(hx.atoms, k, (k + 1) % 6, (k + 2) % 6, (k + 3) % 6);
    near(Math.abs(d), 55, 10, '椅式環己烷的環內二面角約 ±55°');
    if (k) assert.ok(Math.sign(d) !== Math.sign(O.dihedral(hx.atoms, k - 1, k, (k + 1) % 6, (k + 2) % 6)), '正負交替');
  }
});
test('格子：六個方向、鏡射落在格點、三色著色相鄰不同色', function () {
  O.DIRS.forEach(function (d) { const p = O.lxy(d[0], d[1]); near(Math.hypot(p.x, p.y), 1, 1e-12); assert.notStrictEqual(O.lcolor(d[0], d[1]), O.lcolor(0, 0)); });
  const r = O.lreflect(0, 1, 0, 0, 1, 0);
  const p = O.lxy(r.q, r.r);
  const back = O.lxy(0, 1), a = O.lxy(1, 0);
  near(Math.hypot(p.x - back.x, p.y - back.y) > 0 ? Math.abs((a.x) * (p.y + back.y) / 2 - (a.y) * (p.x + back.x) / 2) : 1, 0, 1e-9, '中點在鏡射線上');
});

console.log(passed + ' 項通過');
