/* 散布圖、相關係數與迴歸直線：數學核心的單元測試。用法：node tests/regression-core.test.js */
'use strict';
const R = require('../js/regression-core.js');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || '') + ' 得到 ' + a + '，應為 ' + b + '（容許 ' + tol + '）'); }
function ok(c, msg) { if (!c) throw new Error(msg || '條件不成立'); }

test('手算的小例子：(1, 2)、(2, 3)、(3, 5)、(4, 4)、(5, 6)', function () {
  const s = R.stats([[1, 2], [2, 3], [3, 5], [4, 4], [5, 6]]);
  near(s.mx, 3, 1e-12); near(s.my, 4, 1e-12);
  near(s.Sxx, 10, 1e-12); near(s.Syy, 10, 1e-12); near(s.Sxy, 9, 1e-12);
  near(s.r, 0.9, 1e-12, 'r = 9 / √(10·10)');
  near(s.m, 0.9, 1e-12); near(s.c, 1.3, 1e-12, '截距 4 − 0.9·3');
  near(s.sx, Math.sqrt(2), 1e-12, '母體標準差 √(10/5)');
  near(s.sse, 10 * (1 - 0.81), 1e-12, 'SSE = Syy(1 − r²)');
  near(R.sse([[1, 2], [2, 3], [3, 5], [4, 4], [5, 6]], s.m, s.c), s.sse, 1e-12, '直接算的殘差平方和');
});

test('安斯康姆四重奏：四組的平均、變異數、r、迴歸直線幾乎相同（核對 1973 年論文的數字）', function () {
  ['I', 'II', 'III', 'IV'].forEach(function (k) {
    const s = R.stats(R.ANSCOMBE[k]);
    ok(s.n === 11, k + ' 有 11 個點');
    near(s.mx, 9, 1e-12, k + ' x̄');
    near(s.my, 7.50, 0.005, k + ' ȳ');
    near(s.Sxx / 10, 11, 1e-12, k + ' x 的樣本變異數');
    near(s.Syy / 10, 4.125, 0.005, k + ' y 的樣本變異數');
    near(s.r, 0.816, 0.001, k + ' r');
    near(s.m, 0.500, 0.001, k + ' 斜率');
    near(s.c, 3.00, 0.005, k + ' 截距');
  });
  // 第二組是完美的拋物線（殘差整齊），第三組除了一個點都在直線上，第四組除了一個點 x 都是 8
  ok(R.quadFit(R.ANSCOMBE.II).R2 > 0.9999, '第二組是拋物線');
  ok(R.quadFit(R.ANSCOMBE.IV) === null, '第四組只有兩種 x，二次擬合不成立');
});

test('迴歸直線是殘差平方和最小的直線（隨機資料，與附近的直線比較）', function () {
  const rand = R.rng(7);
  for (let t = 0; t < 200; t++) {
    const pts = []; const n = 3 + Math.floor(rand() * 20);
    for (let i = 0; i < n; i++) pts.push([rand() * 20, rand() * 20]);
    const s = R.stats(pts);
    near(R.sse(pts, s.m, s.c), s.sse, 1e-8 * Math.max(1, s.sse), '公式 Syy(1 − r²)');
    for (let k = 0; k < 6; k++) {
      const dm = (rand() - 0.5) * 0.2, dc = (rand() - 0.5) * 2;
      ok(R.sse(pts, s.m + dm, s.c + dc) >= s.sse - 1e-9, '換別的直線不會更小');
    }
    // 迴歸直線過平均點、殘差和為 0、殘差與 x 不相關
    near(s.m * s.mx + s.c, s.my, 1e-9, '過 (x̄, ȳ)');
    const e = R.residuals(pts, s.m, s.c);
    near(e.reduce(function (a, b) { return a + b; }, 0), 0, 1e-8, '殘差和 0');
    near(e.reduce(function (a, v, i) { return a + v * pts[i][0]; }, 0), 0, 1e-7, 'Σ e·x = 0');
    ok(s.r >= -1 && s.r <= 1, '|r| ≤ 1');
    near(s.m, s.r * s.sy / s.sx, 1e-9, '斜率 = r·sy/sx');
  }
});

test('r 的性質：平移、正的伸縮不變；把 y 變號 r 也變號；x、y 交換 r 不變；標準化後迴歸斜率就是 r', function () {
  const pts = R.preset('default'), r = R.stats(pts).r;
  near(R.stats(pts.map(function (p) { return [3 * p[0] + 1, 0.5 * p[1] - 4]; })).r, r, 1e-12, '線性變換');
  near(R.stats(pts.map(function (p) { return [p[0], -p[1]]; })).r, -r, 1e-12, '變號');
  near(R.stats(pts.map(function (p) { return [p[1], p[0]]; })).r, r, 1e-12, '交換');
  const z = R.zscores(pts), sz = R.stats(z);
  near(sz.mx, 0, 1e-12); near(sz.sx, 1, 1e-12); near(sz.sy, 1, 1e-12);
  near(sz.m, r, 1e-12, '標準化後斜率 = r');
  near(sz.c, 0, 1e-12, '標準化後過原點');
  near(sz.r, r, 1e-12);
});

test('不能算的情形：0、1 個點，x 全相同（直線鉛直），y 全相同（r 沒有定義但直線是水平的）', function () {
  ok(R.stats([]).r === null && R.stats([[1, 1]]).r === null);
  const v = R.stats([[3, 1], [3, 5], [3, 9]]);
  ok(v.r === null && v.m === null && v.sse === null, 'x 全相同');
  const h = R.stats([[1, 4], [5, 4], [9, 4]]);
  ok(h.r === null && h.m === 0 && h.c === 4 && h.sse === 0, 'y 全相同');
  ok(R.zscores([[1, 4], [5, 4]]) === null);
  const line = R.stats([[1, 3], [2, 5], [4, 9], [7, 15]]);
  near(line.r, 1, 1e-12, '剛好在直線上 r = 1');
  near(line.sse, 0, 1e-12);
});

test('照指定 r 造資料：r 剛好是指定值、點都在畫面裡；範例按鈕的 r 是 0.8、−0.8、0.1；預設資料 r 約 0.67', function () {
  const rand = R.rng(99);
  [-0.95, -0.5, 0, 0.3, 0.8, 0.99].forEach(function (rho) {
    for (let t = 0; t < 30; t++) {
      const pts = R.makeCloud(rand, rho, { n: 10 + t });
      ok(pts && pts.length === 10 + t, '造得出來');
      near(R.stats(pts).r, rho, 2e-6, 'r = ' + rho);
      ok(pts.every(function (p) { return p[0] >= 0 && p[0] <= 20 && p[1] >= 0 && p[1] <= 20; }), '在範圍內');
    }
  });
  near(R.stats(R.preset('pos')).r, 0.8, 2e-6); near(R.stats(R.preset('neg')).r, -0.8, 2e-6); near(R.stats(R.preset('none')).r, 0.1, 2e-6);
  ok(R.preset('pos').length === 16);
  near(R.stats(R.preset('default')).r, 0.669, 0.001, '預設 r');
  ok(R.preset('nothing').length === 0);
});

test('二次擬合：拋物線上的點 R² = 1、對稱的拋物線 r = 0；直線上的點 a = 0', function () {
  const par = [8, 9, 10, 11, 12].map(function (x) { return [x, 5 + (x - 10) * (x - 10)]; });
  const q = R.quadFit(par);
  near(q.R2, 1, 1e-12); near(q.a, 1, 1e-12);
  near(R.stats(par).r, 0, 1e-12, '對稱拋物線 r = 0');
  near(R.quadFit([[1, 3], [2, 5], [4, 9], [7, 15]]).a, 0, 1e-10, '直線');
  ok(R.quadFit([[1, 1], [2, 2]]) === null, '兩個點');
  // 和一般的解比對
  const x = R.solve3([[2, 1, 1], [1, 3, 2], [1, 0, 0]], [4, 5, 6]);
  near(2 * x[0] + x[1] + x[2], 4, 1e-12); near(x[0] + 3 * x[1] + 2 * x[2], 5, 1e-12); near(x[0], 6, 1e-12);
  ok(R.solve3([[1, 2, 3], [2, 4, 6], [1, 1, 1]], [1, 2, 3]) === null, '奇異矩陣');
});

test('加一個剛好在平均點的點：迴歸直線與 r 都不變（隱藏任務）', function () {
  const pts = R.preset('default'), s = R.stats(pts);
  const s2 = R.stats(pts.concat([[s.mx, s.my]]));
  near(s2.m, s.m, 1e-12); near(s2.c, s.c, 1e-12); near(s2.r, s.r, 1e-12);
  near(s2.mx, s.mx, 1e-12);
  // 偏一點點（0.1）就看得出截距的變化
  const s3 = R.stats(pts.concat([[s.mx, s.my + 0.3]]));
  ok(Math.abs(s3.c - s.c) > 0.02, '偏 0.3 截距變 ' + (s3.c - s.c).toFixed(4));
});

test('挑戰：2000 題的 r 都在 [−0.95, 0.95]、和上一題差 ≥ 0.25、點都在範圍內；猜中判定 ±0.05', function () {
  const rand = R.rng(2024);
  let prev = null;
  for (let t = 0; t < 2000; t++) {
    const ch = R.genChallenge(rand, prev);
    ok(ch, '出得了題');
    ok(ch.r >= -0.951 && ch.r <= 0.951, 'r 範圍 ' + ch.r);
    if (prev) ok(Math.abs(ch.r - prev.r) >= 0.25 - 1e-5, '和上一題差夠多');
    ok(ch.pts.length === ch.n && ch.n >= 10 && ch.n <= 40);
    near(R.stats(ch.pts).r, ch.r, 1e-12);
    ok(R.chalHit(ch, ch.r + 0.05) && R.chalHit(ch, ch.r - 0.049) && !R.chalHit(ch, ch.r + 0.051));
    prev = ch;
  }
});

test('文字與工具：trim、snap、clampPt', function () {
  ok(R.trim(2.50, 2) === '2.5' && R.trim(-0.0001, 2) === '0' && R.trim(3, 2) === '3');
  ok(R.snap(3.26) === 3.5 && R.snap(3.24) === 3 && R.snap(-0.2) === -0);
  const c = R.clampPt([-1, 25]); ok(c[0] === 0 && c[1] === 20);
});

console.log('\n' + (fail ? fail + ' 項失敗、' : '') + pass + ' 項測試通過。');
if (fail) process.exit(1);
