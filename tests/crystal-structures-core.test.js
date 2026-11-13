/* 「晶體結構與堆積」化學核心的單元測試：node tests/crystal-structures-core.test.js */
'use strict';
const C = require('../js/crystal-structures-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(x, y, tol, msg) { if (!(Math.abs(x - y) <= tol)) throw new Error((msg || '') + ' 得到 ' + x + '，應為 ' + y + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg); }
const S2 = Math.SQRT2, S3 = Math.sqrt(3);

console.log('晶體結構與堆積：化學核心');

test('每個晶胞的原子數（角 1/8、稜 1/4、面 1/2、六角柱的角 1/6）', function () {
  const want = { sc: { m: 1 }, bcc: { m: 2 }, fcc: { m: 4 }, hcp: { m: 6 }, nacl: { a: 4, c: 4 }, cscl: { a: 1, c: 1 }, zns: { a: 4, c: 4 }, diamond: { m: 8 } };
  C.ORDER.forEach(function (s) {
    const z = {};
    C.cellAtoms(s, C.CA_IDEAL, 1).forEach(function (a) { z[a.sp] = (z[a.sp] || 0) + a.frac; });
    Object.keys(want[s]).forEach(function (sp) { near(z[sp], want[s][sp], 1e-9, s + ' ' + sp); });
    near(Object.keys(z).reduce(function (t, k) { return t + z[k]; }, 0) / (C.STRUCTS[s].kind === 'ionic' ? 2 : 1), C.STRUCTS[s].Z, 1e-9, s + ' Z');
  });
  // 2×2×2 的區域是 8 倍；六角柱外接圓半徑 2、高 2c 是 4 × 2 = 8 倍
  near(C.cellAtoms('fcc', null, 2).reduce(function (t, a) { return t + a.frac; }, 0), 32, 1e-9, 'fcc 2×2×2');
  near(C.cellAtoms('hcp', C.CA_IDEAL, 2).reduce(function (t, a) { return t + a.frac; }, 0), 48, 1e-9, 'hcp n=2');
  // 面心立方晶胞：8 個角、6 個面心；六方最密：12 個角、2 個面心、3 個在內部
  const f = C.cellAtoms('fcc', null, 1);
  ok(f.filter(function (a) { return a.role === 'corner'; }).length === 8 && f.filter(function (a) { return a.role === 'face'; }).length === 6, 'fcc 角與面心的數目');
  const h = C.cellAtoms('hcp', C.CA_IDEAL, 1);
  ok(h.filter(function (a) { return a.role === 'corner'; }).length === 12 && h.filter(function (a) { return a.role === 'face'; }).length === 2 &&
    h.filter(function (a) { return a.role === 'inside'; }).length === 3, 'hcp 角 12、面 2、內部 3');
});

test('堆積率的解析值：π/6、√3π/8、π/(3√2)、鑽石 √3π/16', function () {
  near(C.crystal('Po').pf, Math.PI / 6, 1e-12, 'sc');
  near(C.crystal('Fe').pf, S3 * Math.PI / 8, 1e-12, 'bcc');
  near(C.crystal('Cu').pf, Math.PI / (3 * S2), 1e-12, 'fcc');
  near(C.crystal('Si').pf, S3 * Math.PI / 16, 1e-12, 'diamond');
  // 理想六方最密（假想：把銅改排成六方最密）與面心立方一樣密
  near(C.crystal('Cu', 'hcp').pf, Math.PI / (3 * S2), 1e-12, '理想 hcp');
  near(C.crystal('Cu', 'hcp').c / C.crystal('Cu', 'hcp').a, Math.sqrt(8 / 3), 1e-12, '理想 c/a');
  // 硬球不可能比最密堆積更密：所有物質的堆積率 ≤ 74.05%
  C.MAT_ORDER.forEach(function (k) { ok(C.crystal(k).pf <= Math.PI / (3 * S2) + 1e-12, k + ' 的堆積率超過最密堆積'); });
});

test('半徑與晶格常數：a = 2r、√3a = 4r、√2a = 4r', function () {
  near(C.crystal('Po').r, 335.2 / 2, 1e-9);
  near(C.crystal('Fe').r, S3 * 286.65 / 4, 1e-9);
  near(C.crystal('Cu').r, S2 * 361.49 / 4, 1e-9);
  near(C.crystal('Cu').r, 127.8, 0.05, '銅的金屬半徑約 128 pm');
  near(C.crystal('Fe').r, 124.1, 0.05, '鐵的金屬半徑約 124 pm');
  near(C.crystal('C').r * 2, 154.5, 0.1, '鑽石的 C−C 鍵長約 154 pm');
  // 離子：Na–Cl 距離 = a/2；Cs–Cl 距離 = √3a/2
  const n = C.crystal('NaCl');
  near(n.rc + n.ra, 564.02 / 2, 1e-9, 'NaCl 相切');
  near(n.rc / n.ra, 102 / 181, 1e-12, 'Shannon 半徑比');
  const c = C.crystal('CsCl');
  near(c.rc + c.ra, S3 * 412.3 / 2, 1e-9, 'CsCl 相切');
  // 陰離子彼此不重疊
  ['NaCl', 'KCl', 'MgO'].forEach(function (k) { const x = C.crystal(k); ok(2 * x.ra < x.a / S2, k + ' 陰離子重疊'); });
  ['CsCl', 'CsI'].forEach(function (k) { const x = C.crystal(k); ok(2 * x.ra < x.a, k + ' 陰離子重疊'); });
  ok(2 * C.crystal('ZnS').ra < 540.93 / S2, 'ZnS 陰離子重疊');
});

test('由晶格常數算出的密度與實測密度相差不到 1%（數據彼此一致）', function () {
  C.MAT_ORDER.forEach(function (k) {
    const x = C.crystal(k);
    if (x.rhoExp == null) return;
    ok(Math.abs(x.rhoErr) < 0.01, k + '：算出 ' + x.rho.toFixed(4) + '，實測 ' + x.rhoExp);
  });
  near(C.crystal('Cu').rho, 4 * 63.546 / (C.NA * Math.pow(361.49e-10, 3)), 1e-9, '銅的密度公式');
  near(C.crystal('Mg').rho, 6 * 24.305 / (C.NA * 1.5 * S3 * 320.94e-10 * 320.94e-10 * 521.05e-10), 1e-9, '鎂（六角柱）');
});

test('配位數：6、8、12、12、6、8、4、4；配位多面體', function () {
  const want = { sc: [6, 8], bcc: [8, 6], fcc: [12, 14], hcp: [12, 14], nacl: [6, 8], cscl: [8, 6], zns: [4, 4], diamond: [4, 4] };
  C.ORDER.forEach(function (s) {
    const ca = C.crystal(C.DEFAULT_MAT[s]).ca;
    C.cellAtoms(s, ca, 1).forEach(function (a) {
      const nb = C.neighbors(s, ca, a.p, a.sp);
      ok(nb.list.length === want[s][0], s + ' ' + a.sp + ' 配位數 ' + nb.list.length);
    });
    const a = C.cellAtoms(s, ca, 1)[0];
    const h = C.hull(C.neighbors(s, ca, a.p, a.sp).list.map(function (q) { return q.p; }));
    ok(h.length === want[s][1], s + ' 多面體面數 ' + h.length);
  });
  // 鋅：同一層 6 個 266.5 pm、上下層 6 個 291.3 pm
  const zn = C.crystal('Zn'), nb = C.neighbors('hcp', zn.ca, [0, 0, 0], 'm');
  near(nb.d1 * zn.a, 266.49, 1e-6); near(nb.d2 * zn.a, Math.sqrt(266.49 * 266.49 / 3 + 494.68 * 494.68 / 4), 1e-6);
  // 體心立方的第二近鄰（6 個，距離 a）不算進配位數
  ok(C.neighbors('bcc', null, [0.5, 0.5, 0.5], 'm').list.every(function (q) { return Math.abs(q.d - S3 / 2) < 1e-9; }), 'bcc 只算 √3a/2');
});

test('空隙：數目與能容納的球半徑比（0.732、0.155、0.291、0.414、0.225）', function () {
  const want = { sc: { cube: 1 }, bcc: { oct: 6, tet: 12 }, fcc: { oct: 4, tet: 8 }, hcp: { oct: 6, tet: 12 } };
  const ratio = { cube: S3 - 1, oct: S2 - 1, tet: Math.sqrt(1.5) - 1 };
  C.METALS.forEach(function (s) {
    const r = s === 'hcp' ? 0.5 : C.STRUCTS[s].rFromA(1);
    Object.keys(want[s]).forEach(function (t) {
      const v = C.voidSites(s, C.CA_IDEAL, 1, t, r);
      near(v.reduce(function (x, y) { return x + y.frac; }, 0), want[s][t], 1e-9, s + ' ' + t + ' 個數');
      v.forEach(function (q) { near(q.rr / r, C.VOID_INFO[s][t].ratio, 1e-9, s + ' ' + t + ' 半徑比'); });
      if (s !== 'bcc') near(C.VOID_INFO[s][t].ratio, ratio[t], 1e-12);
    });
  });
  near(C.VOID_INFO.bcc.oct.ratio, 0.1547, 1e-4); near(C.VOID_INFO.bcc.tet.ratio, 0.2910, 1e-4);
  // 面心立方：八面體空隙被 6 個原子圍住，四面體空隙被 4 個
  ok(C.voidSites('fcc', null, 1, 'oct', S2 / 4).every(function (v) { return v.nn === 6; }), 'oct 6');
  ok(C.voidSites('fcc', null, 1, 'tet', S2 / 4).every(function (v) { return v.nn === 4; }), 'tet 4');
  // 氯化鈉＝氯離子的面心立方，鈉離子填滿全部八面體空隙；閃鋅礦的鋅離子填一半的四面體空隙
  const oct = C.voidSites('fcc', null, 1, 'oct', S2 / 4).map(function (v) { return v.p.join(','); }).sort();
  const na = C.cellAtoms('nacl', null, 1).filter(function (a) { return a.sp === 'c'; }).map(function (a) { return a.p.join(','); }).sort();
  ok(oct.join(';') === na.join(';'), 'Na+ 位置 = 八面體空隙');
  const tet = C.voidSites('fcc', null, 1, 'tet', S2 / 4).map(function (v) { return v.p.join(','); });
  const zn = C.cellAtoms('zns', null, 1).filter(function (a) { return a.sp === 'c'; });
  ok(zn.length === 4 && zn.every(function (a) { return tet.indexOf(a.p.join(',')) >= 0; }), 'Zn2+ 在四面體空隙');
});

test('最密堆積層：面心立方沿體對角線是 ABC、六方最密是 AB', function () {
  const L = C.cellAtoms('fcc', null, 1).map(function (a) { return C.layerOf('fcc', a.p); });
  ok(L.indexOf(0) >= 0 && L.indexOf(1) >= 0 && L.indexOf(2) >= 0, 'fcc 三種層都有');
  // 同一層的原子在同一個 (111) 平面上
  C.cellAtoms('fcc', null, 2).forEach(function (a) {
    const k = Math.round(a.p[0] + a.p[1] + a.p[2]);
    near(a.p[0] + a.p[1] + a.p[2], k, 1e-9);
  });
  const H = C.cellAtoms('hcp', C.CA_IDEAL, 1);
  ok(H.filter(function (a) { return C.layerOf('hcp', a.p, C.CA_IDEAL) === 1; }).length === 3, 'hcp 中間層 3 個');
  ok(C.layerOf('bcc', [0, 0, 0]) === -1, 'bcc 沒有最密層');
  // 相鄰兩個 (111) 層的距離 a/√3 = 層距 2r√(2/3)（r = √2a/4）
  near(1 / S3, C.H_CLOSE * S2 / 4, 1e-12);
});

test('疊疊看：判定、堆積率、配位數', function () {
  const I = C.stackInfo;
  ok(I('ABAB').type === 'hcp' && I('ACACA').type === 'hcp' && I('BCBC').type === 'hcp', 'hcp');
  ok(I('ABCABC').type === 'ccp' && I('ACBACB').type === 'ccp', 'ccp');
  ok(I('ABACABAC').type === 'dhcp' && I('ABACABAC').hc === 'hchchc', 'dhcp');
  ok(I('ABCBABCA').type === 'mixed', 'mixed');
  ok(I('AAAA').type === 'sh' && I('ABBA').type === 'loose' && I('A').type === 'few' && I('AB').type === 'few', '其他');
  near(I('ABCBA').pf, Math.PI / (3 * S2), 1e-12, '任何最密排列都是 74.05%');
  near(I('ACBCABAC').pf, Math.PI / (3 * S2), 1e-12);
  near(I('AAAA').pf, Math.PI / (3 * S3), 1e-12, '簡單六方 60.46%');
  ok(I('ABCAB').cnMid === 12 && I('AAA').cnMid === 8 && I('ABB').cnMid === 10, '配位數');
  near(I('AB').height, 2 + 2 * Math.sqrt(2 / 3), 1e-12, '兩層高度');
  // 層的位置：B、C 都落在 A 層三個原子的凹處（到三個原子的距離都是 2r/√3）
  ['B', 'C'].forEach(function (k) {
    const p = C.POS[k];
    [[0, 0], [2, 0], [1, S3], [3, S3], [2, 2 * S3]].filter(function (q) { return Math.hypot(q[0] - p[0], q[1] - p[1]) < 1.2; })
      .forEach(function (q) { near(Math.hypot(q[0] - p[0], q[1] - p[1]), 2 / S3, 1e-12, k); });
  });
});

test('假想排法：同一種原子換排法，密度比 = 堆積率比（簡單立方 ÷ 面心立方 = 1/√2）', function () {
  ['Cu', 'Fe', 'Mg', 'Au'].forEach(function (k) {
    const r = C.crystal(k).r;
    C.METALS.forEach(function (s) {
      const x = C.crystal(k, s);
      near(x.r, r, 1e-9, k + '→' + s + ' 半徑不變');
    });
    near(C.crystal(k, 'sc').rho / C.crystal(k, 'fcc').rho, 1 / S2, 1e-12, k);
    if (C.MATS[k].s !== 'hcp') near(C.crystal(k, 'hcp').rho, C.crystal(k, 'fcc').rho, 1e-9, k + ' 兩種最密一樣重（理想 c/a）');
  });
  // 鐵在 912 °C 由 α（體心立方）變成 γ（面心立方）：體積縮小約 1%
  const a = C.crystal('Fe912'), g = C.crystal('Fe916');
  const va = a.V / 2, vg = g.V / 4;
  ok(vg < va && va / vg - 1 > 0.008 && va / vg - 1 < 0.012, '每個原子的體積 α ' + va.toFixed(0) + '、γ ' + vg.toFixed(0) + ' pm³');
});

test('動手算：答案由題目給的數字算出、可以重現', function () {
  C.MAT_ORDER.forEach(function (k) {
    ['rho', 'r', 'NA'].forEach(function (t) {
      if (!C.quizAllowed(t, k)) return;
      const q = C.quiz(t, k), g = q.given;
      const V = (g.c ? 1.5 * S3 * g.a * g.a * g.c : g.a * g.a * g.a) * 1e-30;
      if (t === 'rho') near(q.ans, g.Z * g.M / (C.NA * V), 1e-9, k);
      if (t === 'NA') { near(q.ans, g.Z * g.M / (g.rho * V), 1e17, k); ok(Math.abs(q.ans / C.NA - 1) < 0.01, k + ' N_A'); }
      if (t === 'r') ok(Math.abs(q.ans / C.crystal(k).r - 1) < 0.01, k + ' r ' + q.ans);
    });
  });
  // 用矽（亞佛加厥計畫的完美矽球）算 N_A：誤差不到 0.01%
  ok(Math.abs(C.quiz('NA', 'Si').ans / C.NA - 1) < 1e-4, '矽 N_A');
  ok(!C.quizAllowed('r', 'NaCl') && !C.quizAllowed('r', 'Ti') && C.quizAllowed('r', 'Zn') && !C.quizAllowed('NA', 'Fe912') && C.quizAllowed('NA', 'Si'), '題型限制（離子晶體、c/a 太小的六方不出半徑；沒有實測密度的不出 N_A）');
  near(C.relErr(101, 100), 0.01, 1e-12);
});

test('截面：落在截面上的原子與接觸線長度', function () {
  const R = { sc: 0.5, bcc: S3 / 4, fcc: S2 / 4, hcp: 0.5, diamond: S3 / 8 };
  Object.keys(R).forEach(function (s) {
    const P = C.SECTIONS[s];
    const L = Math.hypot(P.contact[1][0] - P.contact[0][0], P.contact[1][1] - P.contact[0][1]);
    const atoms = C.sectionAtoms(s, C.CA_IDEAL, R[s]);
    // 接觸線上排滿的原子直徑總和 = 線長
    const on = atoms.filter(function (a) {
      if (Math.abs(a.h) > 1e-9) return false;
      const t = ((a.u - P.contact[0][0]) * (P.contact[1][0] - P.contact[0][0]) + (a.w - P.contact[0][1]) * (P.contact[1][1] - P.contact[0][1])) / (L * L);
      const du = P.contact[0][0] + t * (P.contact[1][0] - P.contact[0][0]) - a.u, dw = P.contact[0][1] + t * (P.contact[1][1] - P.contact[0][1]) - a.w;
      return t > -1e-9 && t < 1 + 1e-9 && Math.hypot(du, dw) < 1e-9;
    });
    near((on.length - 1) * 2 * R[s], L, 1e-9, s + ' 接觸線');
  });
  // 截面：面心立方 (100) 面上 5 個原子（4 角 + 面心）
  ok(C.sectionAtoms('fcc', null, S2 / 4).filter(function (a) { return a.u > -1e-9 && a.u < 1 + 1e-9 && a.w > -1e-9 && a.w < 1 + 1e-9 && Math.abs(a.h) < 1e-9; }).length === 5, 'fcc 面上 5 個');
});

console.log(fail ? '\n' + fail + ' 項失敗，' + pass + ' 項通過' : '\n全部 ' + pass + ' 項通過');
process.exit(fail ? 1 : 0);
