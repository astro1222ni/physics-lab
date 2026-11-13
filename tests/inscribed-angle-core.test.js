/* 圓周角與圓冪：數學核心的單元測試。用法：node tests/inscribed-angle-core.test.js */
'use strict';
const M = require('../js/inscribed-angle-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b); }
let seed = 7;
const rand = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('圓周角定理：∠APB = 所對弧的一半；同弧上的 P 角度都一樣；直徑所對的是 90°', function () {
  for (let t = 0; t < 3000; t++) {
    const R = 0.5 + rand() * 5, a = rand() * 360, b = rand() * 360, p = rand() * 360;
    const r = M.inscribed(R, a, b, p);
    if (!r.ok) continue;
    near(r.ins, r.arc / 2, 1e-7, '圓周角 = 弧／2');
    // 圓心角（弧不超過 180° 時就是 ∠AOB）
    if (r.arc < 180) near(M.angleAt([0, 0], r.A, r.B), r.arc, 1e-7, '∠AOB = 弧');
    // 同一段弧上另一點
    const lo = r.side === 1 ? a : b, span = M.ccw(lo, r.side === 1 ? b : a);
    const q = M.inscribed(R, a, b, lo + span * (0.05 + 0.9 * rand()));
    near(q.ins, r.ins, 1e-7, '同弧圓周角相等');
  }
  near(M.inscribed(3, 10, 190, 77).ins, 90, 1e-9, '直徑 → 90°');
  near(M.inscribed(3, 10, 190, 300).ins, 90, 1e-9, '直徑另一側 → 90°');
  // 兩側的圓周角互補
  const x = M.inscribed(2, 20, 130, 60), y = M.inscribed(2, 20, 130, 250);
  near(x.ins + y.ins, 180, 1e-9, '兩側互補');
  near(x.arc + y.arc, 360, 1e-9, '兩段弧合起來 360°');
  ok(!M.inscribed(2, 20, 20, 60).ok && !M.inscribed(2, 20, 50, 20).ok, '重合的點不算');
});

test('圓內接四邊形：對角互補、托勒密等式、弧長加總 360°；交叉（不依序）的不算', function () {
  let n = 0;
  for (let t = 0; t < 3000; t++) {
    const R = 0.5 + rand() * 5, base = rand() * 360;
    const g = [rand(), rand(), rand(), rand()].map(x => 0.1 + x), s = g[0] + g[1] + g[2] + g[3];
    let acc = 0;
    const ts = g.map(x => { const v = base + acc; acc += x * 360 / s; return v; });
    if (rand() < 0.5) ts.reverse();
    const q = M.quad(R, ts);
    ok(q.ok, '依序繞一圈應該算');
    near(q.ang[0] + q.ang[2], 180, 1e-7, '∠A + ∠C');
    near(q.ang[1] + q.ang[3], 180, 1e-7, '∠B + ∠D');
    near(q.ptolemy, 0, 1e-7 * R * R, '托勒密');
    near(q.arcs.reduce((x, y) => x + y, 0), 360, 1e-7, '弧長加總');
    // 每個角 = 對面那兩段弧的一半
    near(q.ang[0], (q.arcs[1] + q.arcs[2]) / 2, 1e-7, '∠A = 弧 BCD／2');
    // 對角線交點在兩條對角線上，相交弦定理
    const X = q.X;
    near(M.dist(q.P[0], X) * M.dist(X, q.P[2]), M.dist(q.P[1], X) * M.dist(X, q.P[3]), 1e-7 * R * R, 'XA·XC = XB·XD');
    near(M.dist(q.P[0], X) * M.dist(X, q.P[2]), -M.power(R, X), 1e-7 * R * R, '= R^2 − OX^2');
    // 對角線夾角 = 兩段對弧和的一半
    const ang = (q.arcs[0] + q.arcs[2]) / 2;
    near(q.diagAng, Math.min(ang, 180 - ang) === ang ? ang : q.diagAng, 1e-6, '對角線夾角');
    near(Math.min(q.diagAng, 180 - q.diagAng), Math.min(ang, 180 - ang), 1e-6, '對角線夾角 = 對弧和／2');
    n++;
  }
  ok(n > 2000);
  ok(!M.quad(2, [0, 180, 90, 270]).ok, '交叉的四點不算');
  ok(!M.quad(2, [0, 0, 90, 270]).ok, '重合的點不算');
});

test('圓冪：過 Q 的任一直線都有 QX·QY = |OQ^2 − R^2|；切線長的平方也一樣', function () {
  for (let t = 0; t < 3000; t++) {
    const R = 0.5 + rand() * 5, Q = [(rand() - 0.5) * 4 * R, (rand() - 0.5) * 4 * R], th = rand() * 180;
    const L = M.lineCircle(R, Q, th), pw = M.power(R, Q);
    near(L.d, Math.abs(Q[0] * Math.sin(th * M.D2R) - Q[1] * Math.cos(th * M.D2R)), 1e-9, '圓心到直線的距離');
    if (L.d < R - 1e-6) {
      ok(L.n === 2, '兩個交點');
      near(Math.hypot(L.X[0], L.X[1]), R, 1e-9 * R, 'X 在圓上'); near(Math.hypot(L.Y[0], L.Y[1]), R, 1e-9 * R, 'Y 在圓上');
      near(M.dist(Q, L.X) * M.dist(Q, L.Y), Math.abs(pw), 1e-8 * R * R, 'QX·QY');
      near(L.prod, Math.abs(pw), 1e-8 * R * R, 'prod');
      near(L.chord, 2 * Math.sqrt(R * R - L.d * L.d), 1e-8 * R, '弦長');
    } else if (L.d > R + 1e-6) ok(L.n === 0, '沒有交點');
    if (pw > 0) {
      const T = M.tangents(R, Q);
      T.forEach(p => {
        near(Math.hypot(p[0], p[1]), R, 1e-9 * R, '切點在圓上');
        near(p[0] * (Q[0] - p[0]) + p[1] * (Q[1] - p[1]), 0, 1e-8 * R * R, 'OT ⊥ QT');
        near(M.dist(Q, p) * M.dist(Q, p), pw, 1e-8 * R * R, 'QT^2 = 圓冪');
      });
    } else ok(M.tangents(R, Q) === null, '圓內沒有切線');
  }
  // 割線方向剛好是切線方向時只有一個交點
  const R = 2, Q = [4, 0], T = M.tangents(R, Q)[0];
  const th = Math.atan2(T[1] - Q[1], T[0] - Q[0]) / M.D2R;
  const L = M.lineCircle(R, Q, th);
  ok(L.n === 1, '切線只有一個交點');
  near(L.prod, 12, 1e-9, '切線：QT^2 = 16 − 4');
});

test('調和、可外切、箏形、正多邊形頂點的判定', function () {
  // 正方形：箏形、調和、可外切
  const sq = M.quad(3, [10, 100, 190, 280]);
  near(sq.kite, 0, 1e-12); near(sq.harm, 0, 1e-12); near(sq.pitot, 0, 1e-12);
  near(M.polyDev(sq.arcs, 4), 0, 1e-9, '正方形是正四邊形');
  // 箏形（A、C 是直徑兩端，B、D 對稱）：調和也可外切
  const kt = M.quad(2, [0, 70, 180, 290]);
  near(kt.kite, 0, 1e-12, '箏形'); near(kt.harm, 0, 1e-12, '箏形是調和'); near(kt.pitot, 0, 1e-12, '箏形可外切');
  // 正五邊形的四個頂點
  const p5 = M.quad(1, [0, 72, 144, 216]);
  near(M.polyDev(p5.arcs, 5), 0, 1e-9);
  // 對角線／邊 = 黃金比
  near(p5.diag[0] / p5.side[0], (1 + Math.sqrt(5)) / 2, 1e-12, '黃金比');
  ok(Math.abs(p5.harm) > 0.1 && Math.abs(p5.pitot) > 0.1 && p5.kite > 0.1, '正五邊形四頂點不是調和、不可外切、不是箏形');
  // 正七邊形：1／a = 1／b + 1／c
  const u = 360 / 7, p7 = M.quad(1, [0, u, 3 * u, 4 * u]);
  near(M.polyDev(p7.arcs, 7), 0, 1e-9);
  const a = 2 * Math.sin(Math.PI / 7), b = 2 * Math.sin(2 * Math.PI / 7), c = 2 * Math.sin(3 * Math.PI / 7);
  near(1 / a, 1 / b + 1 / c, 1e-12, '七邊形恆等式');
  near(p7.side[0], a, 1e-12); near(p7.side[1], b, 1e-12);
  ok(M.polyDev(M.quad(1, [0, 70, 144, 216]).arcs, 5) > 1.9, '差 2° 就不是');
  // 一般四邊形：調和與皮托都不是 0
  const g = M.quad(2, [0, 50, 170, 260]);
  ok(Math.abs(g.harm) > 0.01 && Math.abs(g.pitot) > 0.01);
});

test('挑戰題：答案合理、答案算法正確、答錯會判錯', function () {
  const seen = {};
  for (let t = 0; t < 3000; t++) {
    const g = M.challenge(rand);
    seen[g.type] = (seen[g.type] || 0) + 1;
    ok(isFinite(g.answer) && g.answer > 0, '答案是正數');
    ok(M.answerOK(g.answer, g), '標準答案判對');
    ok(!M.answerOK(g.answer + (g.unit === 'deg' ? 1 : 0.1 * g.answer), g), '答錯判錯');
    if (g.type === 'ins') { const r = M.inscribed(g.fig.R, g.fig.a, g.fig.b, g.fig.p); near(g.answer, g.given.cen / 2, 1e-7); near(r.arc, g.given.cen, 1e-7); }
    if (g.type === 'cen') { ok(g.answer <= 180, '圓心角不出優角'); near(g.answer, 2 * g.given.ins, 1e-5); }
    if (g.type === 'quad') { const q = M.quad(g.fig.R, g.fig.ts); ok(q.ok); near(q.ang['ABCD'.indexOf(g.ask)], g.answer, 0.02, '對角互補'); }
    if (g.type === 'chord') near(g.given.QA * g.given.QB, g.given.QC * g.answer, 1e-9);
    if (g.type === 'secant') { near(g.given.QA * g.given.QB, g.given.QC * g.answer, 1e-9); ok(g.answer > g.given.QC); }
    if (g.type === 'tangent') near(g.answer * g.answer, g.given.QA * g.given.QB, 1e-9);
    // 長度題的圖：點都在圓上、長度就是題目給的、Q 在圓內（相交弦）或圓外
    const F = M.chalFig(g);
    if (F) {
      const on = p => near(Math.hypot(p[0], p[1]), F.R, 1e-9 * F.R, g.type + ' 點在圓上');
      const L = [[g.given.QA, g.given.QB], [g.given.QC, g.answer]];
      F.lines.forEach((l, i) => { on(l.X); on(l.Y); near(M.dist(F.Q, l.X), L[i][0], 1e-9, g.type + ' QX'); near(M.dist(F.Q, l.Y), L[i][1], 1e-9, g.type + ' QY'); });
      ok(g.type === 'chord' ? M.power(F.R, F.Q) < 0 : M.power(F.R, F.Q) > 0, '圓內／圓外');
      if (F.T) { on(F.T); near(M.dist(F.Q, F.T), g.answer, 1e-9, '切線長'); }
      if (F.lines[1]) ok(M.dist(F.lines[0].X, F.lines[1].X) > 0.05 * F.R, '兩條線分得開');
    }
  }
  ['ins', 'cen', 'quad', 'chord', 'secant', 'tangent'].forEach(k => ok(seen[k] > 300, k + ' 題出現 ' + seen[k] + ' 次'));
});

console.log((fail ? '有 ' + fail + ' 項失敗' : '全部 ' + pass + ' 項通過'));
process.exit(fail ? 1 : 0);
