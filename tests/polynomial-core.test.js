/* 多項式函數的圖形：數學核心的單元測試。用法：node tests/polynomial-core.test.js */
'use strict';
const M = require('../js/polynomial-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b); }

test('係數運算：乘法、合成、微分與直接展開一致', function () {
  // (x + 1)^3 = x^3 + 3x^2 + 3x + 1
  const c = M.mul(M.mul([1, 1], [1, 1]), [1, 1]);
  ok(M.same(c, [1, 3, 3, 1]), JSON.stringify(c));
  // (2x − 3)(x² − 1) = 2x³ − 3x² − 2x + 3
  ok(M.same(M.mul([-3, 2], [-1, 0, 1]), [3, -2, -3, 2]));
  // p(x) = x³，p(2x − 4) = 8x³ − 48x² + 96x − 64
  ok(M.same(M.compose([0, 0, 0, 1], [-4, 2]), [-64, 96, -48, 8]));
  ok(M.same(M.deriv([1, -3, 0, 1]), [-3, 0, 3]));
  eq(M.deg([0, 0, 0]), -Infinity); eq(M.deg([1, 2, 0]), 1);
  const R = M.rng(7);
  for (let t = 0; t < 300; t++) {
    const p = [], q = [];
    for (let i = 0; i < 1 + Math.floor(R() * 5); i++) p.push(Math.round((R() * 6 - 3) * 10) / 10);
    for (let i = 0; i < 1 + Math.floor(R() * 4); i++) q.push(Math.round((R() * 6 - 3) * 10) / 10);
    const x = R() * 4 - 2;
    near(M.evalP(M.mul(p, q), x), M.evalP(p, x) * M.evalP(q, x), 1e-9, '乘法');
    near(M.evalP(M.add(p, q), x), M.evalP(p, x) + M.evalP(q, x), 1e-9, '加法');
    near(M.evalP(M.compose(p, [0.3, -1.7]), x), M.evalP(p, 0.3 - 1.7 * x), 1e-9, '合成');
    const h = 1e-5;
    near(M.evalP(M.deriv(p), x), (M.evalP(p, x + h) - M.evalP(p, x - h)) / (2 * h), 1e-5, '微分');
  }
});

test('由根組出多項式：展開後的值等於因式的值；根真的是根；次數 = 重數和（+ 2）', function () {
  const R = M.rng(11);
  for (let t = 0; t < 400; t++) {
    const roots = [];
    const k = 1 + Math.floor(R() * 4);
    for (let i = 0; i < k; i++) roots.push({ x: Math.round((R() * 10 - 5) * 10) / 10, m: 1 + Math.floor(R() * 3) });
    const quad = R() < 0.4 ? { p: Math.round((R() * 6 - 3) * 10) / 10, q: 0.1 + Math.round(R() * 25) / 10 } : null;
    const a = (R() < 0.5 ? -1 : 1) * (0.1 + Math.round(R() * 29) / 10);
    const c = M.fromFactored(a, roots, quad);
    eq(c.length - 1, M.degreeOf(roots, quad), '次數');
    near(c[c.length - 1], a, 1e-12, '領導係數');
    for (let i = 0; i < 6; i++) {
      const x = R() * 10 - 5;
      const v = M.evalFactored(a, roots, quad, x);
      near(M.evalP(c, x), v, 1e-7 * Math.max(1, Math.abs(v)), '值');
    }
    roots.forEach(function (r) { near(M.evalP(c, r.x), 0, 1e-6 * Math.max(1, Math.pow(6, c.length)), '根'); });
  }
  // (x + 2)(x − 1)²：x³ − 3x + 2
  ok(M.same(M.fromFactored(1, [{ x: -2, m: 1 }, { x: 1, m: 2 }], null), [2, -3, 0, 1]));
  // (x − 1)² + 4 = x² − 2x + 5，沒有實根
  ok(M.same(M.fromFactored(1, [], { p: 1, q: 2 }), [5, -2, 1]));
  // 合併：兩個 x = 1 的根合成重數 3
  const mg = M.merge([{ x: 1, m: 2 }, { x: -2, m: 1 }, { x: 1, m: 1 }]);
  eq(mg.length, 2); eq(mg[0].x, -2); eq(mg[1].m, 3);
});

test('兩端走向：首項係數與次數決定 x → ±∞ 的方向', function () {
  const R = M.rng(5);
  for (let t = 0; t < 200; t++) {
    const n = 1 + Math.floor(R() * 6), a = (R() < 0.5 ? -1 : 1) * (0.2 + R() * 2);
    const roots = []; for (let i = 0; i < n; i++) roots.push({ x: R() * 4 - 2, m: 1 });
    const e = M.endBehavior(a, n);
    eq(Math.sign(M.evalFactored(a, roots, null, 1e3)), e.right, '右端');
    eq(Math.sign(M.evalFactored(a, roots, null, -1e3)), e.left, '左端');
  }
});

test('符號圖：每一段的符號和實際取樣一致；奇數重根穿過、偶數重根碰一下就回頭', function () {
  const R = M.rng(23);
  for (let t = 0; t < 400; t++) {
    const roots = [];
    for (let i = 0; i < 1 + Math.floor(R() * 4); i++) roots.push({ x: Math.round((R() * 10 - 5) * 2) / 2, m: 1 + Math.floor(R() * 3) });
    const quad = R() < 0.3 ? { p: 0, q: 1 } : null;
    const a = R() < 0.5 ? -1.5 : 0.7;
    const mg = M.merge(roots);
    M.signChart(a, mg).forEach(function (sg) {
      const lo = isFinite(sg.lo) ? sg.lo : sg.hi - 3, hi = isFinite(sg.hi) ? sg.hi : sg.lo + 3;
      const x = isFinite(lo) && isFinite(hi) ? (lo + hi) / 2 : 0;
      eq(Math.sign(M.evalFactored(a, mg, quad, x)), sg.s, JSON.stringify(mg) + ' 在 ' + x);
    });
  }
  // (x − 1)²(x + 2)：在 1 兩側同號、在 −2 兩側異號
  const s = M.signChart(1, M.merge([{ x: 1, m: 2 }, { x: -2, m: 1 }]));
  eq(s.map(function (g) { return g.s; }).join(','), '-1,1,1');
});

test('解多項式不等式：和逐點檢查一致；邊界、單點、空集合、全體實數', function () {
  const R = M.rng(31);
  const ops = ['>', '>=', '<', '<='];
  const inSol = function (sol, x) {
    return sol.some(function (r) {
      const loOk = r.lc ? x >= r.lo : x > r.lo, hiOk = r.hc ? x <= r.hi : x < r.hi;
      return loOk && hiOk;
    });
  };
  for (let t = 0; t < 300; t++) {
    const roots = [];
    for (let i = 0; i < 1 + Math.floor(R() * 4); i++) roots.push({ x: -4 + Math.floor(R() * 9), m: 1 + Math.floor(R() * 3) });
    const mg = M.merge(roots), a = R() < 0.5 ? -1 : 2, quad = R() < 0.3 ? { p: 1, q: 0.5 } : null;
    const op = ops[Math.floor(R() * 4)];
    const sol = M.solve(op, a, mg);
    for (let x = -6; x <= 6; x += 0.25) {
      const v = M.evalFactored(a, mg, quad, x);
      const truth = op === '>' ? v > 0 : op === '>=' ? v >= 0 : op === '<' ? v < 0 : v <= 0;
      eq(inSol(sol, x), truth, op + ' ' + JSON.stringify(mg) + ' a = ' + a + ' 在 x = ' + x + '：' + M.solKey(sol));
    }
  }
  const S = function (op, a, roots) { return M.solKey(M.solve(op, a, M.merge(roots))); };
  eq(S('<', 1, [{ x: -2, m: 1 }, { x: 3, m: 1 }]), '(-2,3)');
  eq(S('<', 1, [{ x: -2, m: 1 }, { x: 3, m: 1 }, { x: 5, m: 2 }]), '(-2,3)', '(x + 2)(x − 3)(x − 5)² < 0');
  eq(S('>=', 1, [{ x: -2, m: 1 }, { x: 3, m: 1 }, { x: 5, m: 2 }]), '(-∞,-2]U[3,∞)');
  eq(S('<=', 1, [{ x: 1, m: 2 }]), '{1}', '(x − 1)² ≤ 0 只有 x = 1');
  eq(S('<', 1, [{ x: 1, m: 2 }]), '∅');
  eq(S('>', 1, [{ x: 1, m: 2 }]), '(-∞,1)U(1,∞)');
  eq(S('>', 1, []), '(-∞,∞)');
  eq(M.solTex(M.solve('>', 1, [])), '\\mathbb{R}');
  eq(M.solTex(M.solve('<=', 1, [{ x: 1, m: 2 }])), '\\{1\\}');
});

test('勘根：五個題目的實根（數值根代回去是 0）；二分法每一步都保留異號、區間減半、最後收斂到根', function () {
  const want = { w: 1, p: 1, r: 3, q: 4, k: 3 };
  Object.keys(M.PRESETS).forEach(function (k) {
    const c = M.PRESETS[k].c, rs = M.realRoots(c, -3, 3);
    eq(rs.length, want[k], k + ' 的實根個數');
    rs.forEach(function (x) { near(M.evalP(c, x), 0, 1e-9, k + ' 在 ' + x); });
  });
  near(M.realRoots(M.PRESETS.w.c, -3, 3)[0], 2.0945514815, 1e-9, '華里斯的方程');
  near(M.realRoots(M.PRESETS.p.c, -3, 3)[0], 1.3247179572, 1e-9, '塑膠數');
  // x⁴ − 4x² + x + 1 在 [0, 2]：兩端都是正的，裡面卻有兩個根
  const q = M.PRESETS.q.c;
  ok(M.evalP(q, 0) > 0 && M.evalP(q, 2) > 0 && M.realRoots(q, 0, 2).length === 2, '同號區間裡有兩個根');
  // 二分法
  const c = M.PRESETS.w.c;
  let l = 2, r = 3, w = 1;
  for (let i = 0; i < 40; i++) {
    const s = M.bisect(c, l, r);
    ok(M.evalP(c, s.l) * M.evalP(c, s.r) <= 0, '第 ' + i + ' 步沒有異號');
    near(s.r - s.l, w / 2, 1e-15, '區間減半');
    l = s.l; r = s.r; w /= 2;
  }
  near((l + r) / 2, 2.0945514815423265, 1e-11);
  // 中點剛好是根：2x³ − 3x² − 2x + 3 在 [1.2, 1.8]，中點 1.5
  const e = M.bisect(M.PRESETS.r.c, 1.2, 1.8);
  ok(e.exact && e.m === 1.5 && e.l === 1.5 && e.r === 1.5, '中點 1.5 剛好是根');
});

test('平移與伸縮：y = a f(b(x − h)) + k 的值；三次函數的對稱中心；四次的對稱軸', function () {
  const R = M.rng(41);
  for (let t = 0; t < 300; t++) {
    const base = ['cube', 'cubic', 'quart'][t % 3];
    const a = Math.round((R() * 6 - 3) * 10) / 10 || 1, b = Math.round((R() * 6 - 3) * 10) / 10 || -1;
    const h = Math.round((R() * 10 - 5) * 10) / 10, k = Math.round((R() * 10 - 5) * 10) / 10;
    const c = M.transform(base, a, b, h, k);
    for (let i = 0; i < 5; i++) {
      const x = R() * 8 - 4;
      const v = a * M.evalP(M.BASES[base].c, b * (x - h)) + k;
      near(M.evalP(c, x), v, 1e-8 * Math.max(1, Math.abs(v)), base);
    }
    if (M.BASES[base].odd) {
      const cc = M.cubicCenter(c);
      near(cc.x, h, 1e-9, '對稱中心 x'); near(cc.y, k, 1e-7, '對稱中心 y');
      // 點對稱：f(h + d) + f(h − d) = 2k
      for (let i = 0; i < 4; i++) { const d = R() * 3; near(M.evalP(c, h + d) + M.evalP(c, h - d), 2 * k, 1e-6 * Math.max(1, Math.abs(M.evalP(c, h + d)))); }
    } else {
      for (let i = 0; i < 4; i++) { const d = R() * 3; near(M.evalP(c, h + d), M.evalP(c, h - d), 1e-6 * Math.max(1, Math.abs(M.evalP(c, h + d))), '對稱軸 x = h'); }
    }
  }
  // 任意三次函數 y = 2x³ − 6x² + 1：中心 (1, −3)，而且是 y = 2u³ − 6u 平移 (1, −3)
  const cc = M.cubicCenter([1, 0, -6, 2]);
  near(cc.x, 1, 1e-12); near(cc.y, -3, 1e-12);
  ok(M.same(M.compose([1, 0, -6, 2], [1, 1]), [-3, -6, 0, 2]), '移到中心後沒有二次項');
  // x³ 左右翻轉（b = −1）等於上下翻轉（a = −1）
  ok(M.same(M.transform('cube', 1, -1, 0, 0), M.transform('cube', -1, 1, 0, 0)));
});

test('挑戰：2000 題的根是整數、次數 2–4、提示點在曲線上、答案唯一（同樣的根配不同的 a 不會過提示點）', function () {
  const R = M.rng(2024);
  let last = null;
  for (let t = 0; t < 2000; t++) {
    const c = M.genChallenge(R, last);
    ok(c, '出不了題');
    ok(c.n >= 2 && c.n <= 4, '次數 ' + c.n);
    eq(c.roots.reduce(function (s, r) { return s + r.m; }, 0), c.n);
    c.roots.forEach(function (r) { ok(Number.isInteger(r.x) && r.x >= -4 && r.x <= 4, '根 ' + r.x); });
    ok(M.A_CHOICES.indexOf(c.a) >= 0);
    near(M.evalP(c.coef, c.hint.x), c.hint.y, 1e-9, '提示點');
    ok(Math.abs(c.hint.y) >= 1 && Math.abs(c.hint.y) <= 40);
    M.A_CHOICES.forEach(function (a2) { if (a2 !== c.a) ok(Math.abs(M.evalFactored(a2, c.roots, null, c.hint.x) - c.hint.y) > 0.4, '別的 a 也過提示點'); });
    ok(!last || !M.same(c.coef, last.coef), '和上一題相同');
    last = c;
  }
});

test('文字：標準式、因式、解集合的 KaTeX', function () {
  eq(M.polyTex([2, -3, 0, 1]), 'x^{3} - 3x + 2');
  eq(M.polyTex([-0.5, 0, 1, -2]), '-2x^{3} + x^{2} - 0.5');
  eq(M.polyTex([0]), '0');
  eq(M.factoredTex(0.5, [{ x: -2, m: 1 }, { x: 1, m: 2 }], null), '0.5(x + 2)(x - 1)^{2}');
  eq(M.factoredTex(-1, [{ x: 0, m: 3 }], { p: 1, q: 2 }), '-x^{3}\\left[(x - 1)^2 + 4\\right]');
  eq(M.solTex(M.solve('>=', 1, M.merge([{ x: -2, m: 1 }, { x: 3, m: 1 }]))), '(-\\infty,\\ -2] \\cup [3,\\ \\infty)');
});

console.log('\n' + (fail ? fail + ' 項失敗、' : '') + pass + ' 項測試通過。');
if (fail) process.exit(1);
