/* 遞迴數列與蛛網圖：數學核心的單元測試。用法：node tests/recursive-sequence-core.test.js */
'use strict';
const M = require('../js/recursive-sequence-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b); }
const R = M.rng(5);
const pick = function (lo, hi, st) { return Math.round((lo + R() * (hi - lo)) / st) * st; };

test('一次式：逐步迭代 = 公式解 L + (a_1 − L)p^(n−1)；|p| < 1 收斂到 L、p > 1 離開 L、p = 1 是等差', function () {
  for (let t = 0; t < 3000; t++) {
    const p = pick(-1.5, 1.5, 0.05), q = pick(-5, 5, 0.1), a1 = pick(-10, 10, 0.1), n = 1 + Math.floor(R() * 60);
    const ts = M.iterate('lin', { p: p, q: q }, a1, n);
    eq(ts.length, n);
    near(ts[n - 1], M.linTerm(p, q, a1, n), 1e-7 * Math.max(1, Math.abs(ts[n - 1])), '公式解 p = ' + p);
    const fp = M.fixedPoints('lin', { p: p, q: q });
    if (p !== 1) { eq(fp.length, 1); near(p * fp[0].x + q, fp[0].x, 1e-9, '不動點'); eq(fp[0].stable, Math.abs(p) < 1); }
    else ok(fp.length === 0, 'p = 1 沒有不動點');
  }
  near(M.iterate('lin', { p: 0.5, q: 2 }, 0, 60)[59], 4, 1e-12, '0.5x + 2 收斂到 4');
  const sp = M.iterate('lin', { p: -0.5, q: 3 }, 0, 6); // L = 2：0, 3, 1.5, 2.25, 1.875, 2.0625
  ok(sp[1] > 2 && sp[2] < 2 && sp[3] > 2 && sp[4] < 2, '負的 p 在 L 的兩邊跳');
  near(M.linTerm(1.5, -2, 5, 11) - 4, Math.pow(1.5, 10), 1e-9, 'p = 1.5 離開 L = 4');
  eq(M.linTerm(1, 1, -9, 10), 0, '等差 −9, −8, …, 0');
});

test('其他五種遞迴的不動點：f(L) = L，穩定性由 |f′(L)| 決定，穩定的確實吸得過去', function () {
  const cases = [
    ['sqrt', { c: 6 }, [3]], ['sqrt', { c: 2 }, [2]], ['sqrt', { c: 1 }, [M.PHI]], ['sqrt', { c: 0 }, [0, 1]],
    ['cf', { k: 1 }, [-1 / M.PHI, M.PHI]], ['cf', { k: 2 }, [-1, 2]], ['cos', {}, [M.DOTTIE]],
    ['bab', { b: 2 }, [-Math.SQRT2, Math.SQRT2]], ['bab', { b: 10 }, [-Math.sqrt(10), Math.sqrt(10)]],
    ['logi', { r: 2.8 }, [0, 1 - 1 / 2.8]], ['logi', { r: 4 }, [0, 0.75]]
  ];
  cases.forEach(function (c) {
    const fp = M.fixedPoints(c[0], c[1]);
    eq(fp.length, c[2].length, c[0] + ' 不動點個數');
    fp.forEach(function (o, i) {
      near(o.x, c[2][i], 1e-12, c[0] + ' 不動點');
      near(M.F[c[0]].f(o.x, c[1]), o.x, 1e-12, c[0] + ' f(L) = L');
      if (o.stable) {
        const ts = M.iterate(c[0], c[1], o.x + 0.01, 400);
        near(ts[ts.length - 1], o.x, 1e-9, c[0] + ' 穩定的不動點吸得過去');
      }
    });
  });
  near(Math.cos(M.DOTTIE), M.DOTTIE, 1e-15, 'cos 的不動點');
  ok(!M.fixedPoints('cf', { k: 1 })[0].stable && M.fixedPoints('cf', { k: 1 })[1].stable, '1 + 1/x：−1/φ 推開、φ 吸住');
  // 從任何非零起點，1 + 1/x 都收斂到 φ（除非剛好落在 −1/φ）
  near(M.iterate('cf', { k: 1 }, -7.3, 60)[59], M.PHI, 1e-12, '連分數');
  near(M.iterate('sqrt', { c: 2 }, 0, 12)[11], 2, 1e-6, '√(2 + √(2 + …)) = 2');
  // 巴比倫法二次收斂：從 1 開始第 5 項才第一次到 10^−6
  const b = M.iterate('bab', { b: 2 }, 1, 6);
  near(b[1], 1.5, 1e-15); near(b[2], 17 / 12, 1e-15); near(b[3], 577 / 408, 1e-15);
  ok(M.firstWithin(b.slice(0, 5), Math.SQRT2, 1e-6) && !M.firstWithin(b.slice(0, 4), Math.SQRT2, 1e-6) && !M.firstWithin(b, Math.SQRT2, 1e-6), '巴比倫法第 5 項');
  // 沒有定義時停下
  eq(M.iterate('sqrt', { c: 1 }, -5, 10).length, 1, '√(−4) 沒有定義');
  eq(M.iterate('cf', { k: 1 }, -1, 10).length, 2, '−1 → 1 + 1/(−1) = 0 → 下一項分母 0');
});

test('邏輯斯諦：週期加倍 1 → 2 → 4 → 8，3.83 附近有週期 3，r = 4 混沌但 0.75 不動', function () {
  eq(M.logiPeriod(2.8, 0.2), 1); eq(M.logiPeriod(3.2, 0.2), 2); eq(M.logiPeriod(3.5, 0.2), 4); eq(M.logiPeriod(3.55, 0.2), 8);
  eq(M.logiPeriod(3.83, 0.2), 3); eq(M.logiPeriod(3.84, 0.2), 3);
  eq(M.logiPeriod(3.7, 0.2), 0, '3.7 混沌'); eq(M.logiPeriod(4, 0.2), 0, '4 混沌');
  eq(M.logiPeriod(4, 0.75), 1, 'r = 4、0.75 是不動點');
  eq(M.logiPeriod(0.5, 0.3), 1, 'r < 1 走到 0');
  // 理論區間：週期 2 在 3 < r < 1 + √6，週期 4 在 1 + √6 < r < 3.5441
  [3.05, 3.2, 3.3, 3.4, 3.44].forEach(function (r) { eq(M.logiPeriod(r, 0.37), 2, 'r = ' + r); });
  [3.46, 3.5, 3.54].forEach(function (r) { eq(M.logiPeriod(r, 0.37), 4, 'r = ' + r); });
  [3.55, 3.56].forEach(function (r) { eq(M.logiPeriod(r, 0.37), 8, 'r = ' + r); });
  // r = 4 的三點循環 sin²(π/7) → sin²(2π/7) → sin²(3π/7)
  const s = function (k) { return Math.pow(Math.sin(k * Math.PI / 7), 2); };
  near(4 * s(1) * (1 - s(1)), s(2), 1e-12); near(4 * s(2) * (1 - s(2)), s(3), 1e-12); near(4 * s(3) * (1 - s(3)), s(1), 1e-12);
  // 打字到小數第 4 位（0.1883）走一圈還在 0.002 以內；滑桿刻度 0.19、0.61、0.95 都不行
  const loop = function (a) { const t = M.iterate('logi', { r: 4 }, a, 4); return Math.abs(t[3] - t[0]); };
  ok(loop(0.1883) < 0.002 && loop(0.6113) < 0.002 && loop(0.9505) < 0.002, '打字可以');
  ok(loop(0.19) > 0.002 && loop(0.61) > 0.002 && loop(0.95) > 0.002, '刻度不行');
  // 蝴蝶效應：差 0.001，20 項後差很多
  const u = M.iterate('logi', { r: 4 }, 0.2, 40), v = M.iterate('logi', { r: 4 }, 0.201, 40);
  let far = 0;
  for (let k = 14; k < 40; k++) if (Math.abs(u[k] - v[k]) >= 0.5) far++;
  ok(Math.abs(u[4] - v[4]) < 0.05 && far >= 5, '0.2 與 0.201：前 5 項幾乎一樣，第 15 到 40 項有 ' + far + ' 項差 0.5 以上');
});

test('費氏型：比值趨近 φ；起始比剛好 −1/φ 時是等比、越來越小；正方形拼圖每塊剛好貼齊', function () {
  const f = M.fibTerms(1, 1, 12);
  eq(f.join(','), '1,1,2,3,5,8,13,21,34,55,89,144');
  const l = M.fibTerms(2, 1, 30);
  near(l[29] / l[28], M.PHI, 1e-10, '盧卡斯數');
  const g = M.fibTerms(10, -6.18, 12);
  for (let k = 2; k < 12; k++) near(g[k] / g[k - 1], -0.618, 0.001 * Math.pow(2.7, k), '−1/φ 附近');
  ok(Math.abs(g[11]) < Math.abs(g[0]), '越來越小');
  for (let t = 0; t < 300; t++) {
    const a1 = pick(0.5, 10, 0.5), a2 = pick(0.5, 10, 0.5), n = 2 + Math.floor(R() * 14);
    const T = M.tiling(a1, a2, n), ts = M.fibTerms(a1, a2, n);
    eq(T.squares.length, Math.max(0, n - 2));
    // 面積：起始長方形 + 所有正方形 = 外框
    const area = a1 * a2 + T.squares.reduce(function (s, q) { return s + q.s * q.s; }, 0);
    const bw = T.box.x1 - T.box.x0, bh = T.box.y1 - T.box.y0;
    near(area, bw * bh, 1e-6 * area, '面積拼滿');
    if (n >= 3) { const lo = Math.min(bw, bh), hi = Math.max(bw, bh); near(lo, ts[n - 2], 1e-9, '外框短邊'); near(hi, ts[n - 1], 1e-9, '外框長邊'); }
    // 螺線連續：每一段的終點是下一段的起點，而且都在圓上
    T.squares.forEach(function (q, i) {
      near(Math.hypot(q.arc.from[0] - q.arc.cx, q.arc.from[1] - q.arc.cy), q.s, 1e-9, '起點在圓上');
      near(Math.hypot(q.arc.to[0] - q.arc.cx, q.arc.to[1] - q.arc.cy), q.s, 1e-9, '終點在圓上');
      if (i) { near(q.arc.from[0], T.squares[i - 1].arc.to[0], 1e-9); near(q.arc.from[1], T.squares[i - 1].arc.to[1], 1e-9); }
    });
  }
  ok(M.tiling(-1, 2, 5) === null && M.tiling(1, 0, 5) === null, '有非正數的項就不拼');
});

test('科學記號與第一次進到誤差範圍', function () {
  ok(M.sci(12345) === null);
  eq(M.sci(Math.pow(1.5, 99)).e, 17);
  ok(M.firstWithin([5, 4.5, 4.2, 4.05], 4, 0.1) && !M.firstWithin([5, 4.5, 4.2, 4.05, 4.01], 4, 0.1));
});

test('挑戰 3000 題：前 6 項在 ±40 內、前三項唯一決定 p 與 q、答案都在滑桿刻度上', function () {
  const G = M.rng(3); let last = null;
  const seen = {};
  for (let t = 0; t < 3000; t++) {
    const c = M.genChallenge(G, last);
    ok(c, '出得了題');
    ok(c.check.every(function (v) { return Math.abs(v) <= 40; }));
    const s = c.shown, p = (s[2] - s[1]) / (s[1] - s[0]), q = s[1] - p * s[0];
    near(p, c.p, 1e-9, '由前三項算 p'); near(q, c.q, 1e-9, '由前三項算 q');
    ok(Number.isInteger(c.q) && Number.isInteger(c.a1) && M.P_CHOICES.indexOf(c.p) >= 0);
    ok(!last || !(last.p === c.p && last.q === c.q && last.a1 === c.a1));
    seen[c.p] = 1; last = c;
  }
  eq(Object.keys(seen).length, M.P_CHOICES.length, '六種 p 都出現');
});

console.log('\n' + (fail ? fail + ' 項失敗、' : '') + pass + ' 項測試通過。');
if (fail) process.exit(1);
