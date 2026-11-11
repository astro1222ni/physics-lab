// 以 Node 執行：node tests/equipotential-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/equipotential-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（容許 ${tol}），得到 ${a}`);
}

/** 不導電長方形紙上兩條線電流源（+1 在 (xa, y0)、−1 在 (xb, y0)）的電位：
 *  對四個邊做鏡像（同號），得到法向導數為零的解析解（無窮級數取到 ±M）。 */
function imageSum(W, H, xa, xb, y0, M) {
  return function (x, y) {
    let s = 0;
    for (let m = -M; m <= M; m++) for (let n = -M; n <= M; n++) {
      for (const [fx, fy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ax = fx * xa + 2 * m * W, ay = fy * y0 + 2 * n * H, bx = fx * xb + 2 * m * W, by = fy * y0 + 2 * n * H;
        s += 0.5 * Math.log(((x - bx) ** 2 + (y - by) ** 2) / ((x - ax) ** 2 + (y - ay) ** 2));
      }
    }
    return s;
  };
}

console.log('equipotential-core');

const V0 = 6;
const solC = C.solve({ type: 'circles', d: 14, a: 0.75, V0: V0 });
const solB = C.solve({ type: 'bars', d: 14, L: 20, V0: V0 });

test('平行長條（邊到邊）：兩極之間電位隨 x 線性下降，E = V0/d 均勻', () => {
  // 正極內緣 x = 8、負極內緣 x = 22
  let m = 0;
  for (let x = 8.2; x <= 21.8; x += 0.37) for (let y = 0; y <= 20; y += 0.53) m = Math.max(m, Math.abs(C.potentialAt(solB, x, y) - V0 * (22 - x) / 14));
  near(m, 0, 1e-5, '線性電位的最大誤差');
  for (const p of [[10, 3], [15, 10], [20, 17]]) {
    const f = C.fieldAt(solB, p[0], p[1]);
    near(f.ex, V0 / 14, 1e-5, 'Ex');
    near(f.ey, 0, 1e-5, 'Ey');
  }
});

test('平行長條：長條背後（外側）整片都和長條等電位', () => {
  for (let y = 0; y <= 20; y += 2.5) {
    near(C.potentialAt(solB, 3, y), V0, 1e-6, '正極背後');
    near(C.potentialAt(solB, 27, y), 0, 1e-6, '負極背後');
    near(C.fieldAt(solB, 3, y).E, 0, 1e-6, '背後沒有電場');
  }
});

test('平行長條：電流 I = V0·L／(R□·d)（R□ = 5 kΩ/□）', () => {
  near(C.currentAcross(solB), V0 * 20 / (C.R_SHEET * 14), 1e-9, '電流');
});

test('兩圓形電極：與不導電長方形紙的線電流源鏡像解析解比較（遠離電極處 ≤ 0.025 V，電流差 < 0.5 %）', () => {
  for (const a of [0.3, 0.75]) {
    const d = 14, s = d / 2, c = Math.sqrt(s * s - a * a); // 線電流源放在阿波羅尼斯點（兩圓的反演點）
    const xa = 15 - d / 2, xb = 15 + d / 2, y0 = 10;
    const f = imageSum(30, 20, 15 - c, 15 + c, y0, 8);
    let pa = 0, pb = 0;
    for (let q = 0; q < 64; q++) {
      const t = 2 * Math.PI * q / 64;
      pa += f(xa + a * Math.cos(t), y0 + a * Math.sin(t)) / 64;
      pb += f(xb + a * Math.cos(t), y0 + a * Math.sin(t)) / 64;
    }
    const Van = function (x, y) { return V0 * (f(x, y) - pb) / (pa - pb); };
    const sol = a === 0.75 ? solC : C.solve({ type: 'circles', d: d, a: a, V0: V0 });
    let far = 0;
    for (let x = 0; x <= 30; x += 0.5) for (let y = 0; y <= 20; y += 0.5) {
      const r = Math.min(Math.hypot(x - xa, y - y0), Math.hypot(x - xb, y - y0));
      if (r > a + 1.5) far = Math.max(far, Math.abs(C.potentialAt(sol, x, y) - Van(x, y)));
    }
    near(far, 0, 0.025, 'a = ' + a + ' 的電位差');
    const Ian = 2 * Math.PI * V0 / (pa - pb) / C.R_SHEET;  // 每個源流出的「通量」2π
    near(C.currentAcross(sol) / Ian, 1, 0.005, 'a = ' + a + ' 的電流比');
  }
});

test('兩圓形電極：紙愈大愈接近無限大平面的對數電位 V = V0/2 + (V0/2)·ln(r2/r1)/ln((s+c)/a)', () => {
  const an = C.twoCircleInfinite(10, 1, V0, 0, 0);
  const diffs = [];
  for (const L of [40, 80]) {
    const sol = C.solve({ type: 'circles', d: 10, a: 1, V0: V0, W: L, H: L }, { h: 0.25 });
    const ref = C.twoCircleInfinite(10, 1, V0, L / 2, L / 2);
    let m = 0;
    for (let x = L / 2 - 10; x <= L / 2 + 10; x += 0.5) for (let y = L / 2 - 10; y <= L / 2 + 10; y += 0.5) {
      if (Math.hypot(x - L / 2 + 5, y - L / 2) < 1.3 || Math.hypot(x - L / 2 - 5, y - L / 2) < 1.3) continue;
      m = Math.max(m, Math.abs(C.potentialAt(sol, x, y) - ref.V(x, y)));
    }
    diffs.push({ m: m, I: C.currentAcross(sol) });
  }
  assert.ok(diffs[1].m < diffs[0].m, '紙變大，與無限大平面的差應變小');
  near(diffs[1].m, 0, 0.08, '80 cm 見方的紙');
  const Iinf = V0 / an.R(C.R_SHEET); // R = (R□/π)·arccosh(d/2a)
  near(diffs[1].I / Iinf, 1, 0.02, '電流與 R = (R□/π)arccosh(d/2a) 比較');
  assert.ok(Math.abs(diffs[1].I / Iinf - 1) < Math.abs(diffs[0].I / Iinf - 1), '紙變大，電流應更接近無限大平面');
});

test('對稱：兩圓的垂直平分線是 V0/2 的等位線，且 V(x) + V(30 − x) = V0、上下對稱', () => {
  for (let y = 0; y <= 20; y += 1.7) near(C.potentialAt(solC, 15, y), V0 / 2, 1e-6, '中線');
  let anti = 0, sym = 0;
  for (let x = 0; x <= 30; x += 0.37) for (let y = 0; y <= 20; y += 0.41) {
    anti = Math.max(anti, Math.abs(C.potentialAt(solC, x, y) + C.potentialAt(solC, 30 - x, y) - V0));
    sym = Math.max(sym, Math.abs(C.potentialAt(solC, x, y) - C.potentialAt(solC, x, 20 - y)));
  }
  near(anti, 0, 1e-5, '反對稱');
  near(sym, 0, 1e-9, '上下對稱');
  const lines = C.contour(solC, V0 / 2);
  lines.forEach(function (l) { l.pts.forEach(function (p) { near(p[0], 15, 1e-3, '中線等位線的 x'); }); });
});

test('最大值原理：紙上電位都在 0 與 V0 之間（三種電極、含不均勻導電度）', () => {
  for (const cfg of [{ type: 'circles', d: 6, a: 0.3, V0: 9 }, { type: 'bars', d: 10, L: 8, V0: 3 }, { type: 'barCircle', d: 12, a: 1, L: 14, V0: 5, sigma: { seed: 11, amp: 0.04 } }]) {
    const s = C.solve(cfg);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < s.V.length; i++) { lo = Math.min(lo, s.V[i]); hi = Math.max(hi, s.V[i]); }
    assert.ok(lo >= -1e-9 && hi <= cfg.V0 + 1e-9, cfg.type + ` 範圍 ${lo}～${hi}`);
  }
});

test('不導電的紙邊：法向導數 ∂V/∂n = 0（電流不會流出紙外）', () => {
  let m = 0;
  for (let x = 1; x <= 29; x += 0.5) {
    const v0 = C.potentialAt(solC, x, 0), v1 = C.potentialAt(solC, x, 0.125), v2 = C.potentialAt(solC, x, 0.25);
    m = Math.max(m, Math.abs((-3 * v0 + 4 * v1 - v2) / 0.25));
  }
  for (let y = 1; y <= 19; y += 0.5) {
    const v0 = C.potentialAt(solC, 0, y), v1 = C.potentialAt(solC, 0.125, y), v2 = C.potentialAt(solC, 0.25, y);
    m = Math.max(m, Math.abs((-3 * v0 + 4 * v1 - v2) / 0.25));
  }
  near(m, 0, 1e-4, '邊上的法向電場（V/cm）');
  // 紙邊的電場沿著紙邊（Ey ≈ 0）
  const f = C.fieldAt(solC, 15, 0);
  assert.ok(Math.abs(f.ey) < 1e-3 * f.E, '下緣中點的 Ey');
});

test('電流守恆：導電度不均勻時，兩極之間每一條直線截面的電流都相同', () => {
  const s = C.solve({ type: 'circles', d: 14, a: 0.75, V0: V0, sigma: { seed: 7, amp: 0.04 } });
  const I = [];
  for (let i = 70; i <= 160; i += 10) I.push(C.currentAcross(s, i));
  const mean = I.reduce(function (a, b) { return a + b; }, 0) / I.length;
  I.forEach(function (v) { near(v / mean, 1, 1e-6, '截面電流'); });
  // 均勻的紙上 V(15, y) = V0/2；不均勻時不再成立（含誤差模式真的會讓線歪掉）
  assert.ok(Math.abs(C.potentialAt(s, 15, 10) - V0 / 2) > 1e-3, '不均勻導電度應改變中線電位');
});

test('導電度起伏在 ±6 % 以內、平均約為 1', () => {
  const sig = C.sigmaField({ sigma: { seed: 7, amp: 0.04 } });
  let lo = 9, hi = 0, sum = 0, n = 0;
  for (let x = 0; x <= 30; x += 0.25) for (let y = 0; y <= 20; y += 0.25) { const v = sig(x, y); lo = Math.min(lo, v); hi = Math.max(hi, v); sum += v; n++; }
  assert.ok(lo > 0.94 && hi < 1.06, `範圍 ${lo}～${hi}`);
  near(sum / n, 1, 0.01, '平均');
  assert.strictEqual(C.sigmaField({}), null, '理想時沒有起伏');
});

test('線性：電源電壓加倍，各點電位與電場都加倍', () => {
  const s2 = C.solve({ type: 'circles', d: 14, a: 0.75, V0: 2 * V0 });
  for (const p of [[5, 5], [12, 14], [20, 9], [28, 19]]) {
    near(C.potentialAt(s2, p[0], p[1]), 2 * C.potentialAt(solC, p[0], p[1]), 1e-6, '電位');
    near(C.fieldAt(s2, p[0], p[1]).E, 2 * C.fieldAt(solC, p[0], p[1]).E, 1e-6, '電場');
  }
});

test('網格收斂：h = 0.125 cm 與 h = 0.0625 cm 的電位差 < 0.01 V、電流差 < 0.3 %', () => {
  const cfg = { type: 'barCircle', d: 14, a: 0.75, L: 14, V0: V0 };
  const s1 = C.solve(cfg), s2 = C.solve(cfg, { h: 0.0625 });
  let m = 0;
  for (let x = 0; x <= 30; x += 0.5) for (let y = 0; y <= 20; y += 0.5) {
    const r = Math.min.apply(null, s2.els.map(function (e) { return C.distToElectrode(e, x, y); }));
    if (r < 0.2) continue;
    m = Math.max(m, Math.abs(C.potentialAt(s1, x, y) - C.potentialAt(s2, x, y)));
  }
  near(m, 0, 0.01, '電位差');
  near(C.currentAcross(s1) / C.currentAcross(s2), 1, 0.003, '電流比');
});

test('電場方向：由正極指向負極，且與等位線垂直', () => {
  const f = C.fieldAt(solC, 15, 10);
  assert.ok(f.ex > 0 && Math.abs(f.ey) < 1e-6, '兩圓中點的電場向 +x');
  // 在 3 V 以外的等位線上取點：等位線切線與電場的夾角接近 90°
  const l = C.contour(solC, 4).sort(function (a, b) { return b.pts.length - a.pts.length; })[0].pts;
  let worst = 0;
  for (let i = 5; i < l.length - 5; i += 7) {
    const tx = l[i + 1][0] - l[i - 1][0], ty = l[i + 1][1] - l[i - 1][1];
    const e = C.fieldAt(solC, l[i][0], l[i][1]);
    if (e.E < 1e-3) continue;
    worst = Math.max(worst, Math.abs(tx * e.ex + ty * e.ey) / (Math.hypot(tx, ty) * e.E));
  }
  near(worst, 0, 0.03, 'cos(夾角)');
});

test('電流線：從正極出發都落在負極上，各條分到相等的電流', () => {
  const sl = C.streamlines(solC, 14);
  assert.strictEqual(sl.length, 14);
  sl.forEach(function (l) { assert.strictEqual(l.end, 'electrode', '電流線終點'); });
  const ne = solC.els.find(function (e) { return e.sign < 0; });
  sl.forEach(function (l) {
    const p = l.pts[l.pts.length - 1];
    near(C.distToElectrode(ne, p[0], p[1]), 0, 0.05, '終點在負極邊上');
  });
});

test('電表：三用電表取到 0.01 V；檢流計 I = ΔV／R', () => {
  assert.strictEqual(C.dmmReading(1.234), 1.23);
  assert.strictEqual(C.dmmReading(-0.0049), 0);
  assert.ok(!Object.is(C.dmmReading(-0.0049), -0), '不會顯示 −0.00');
  near(C.galvCurrent(0.5), 0.5 / C.GALV_R, 1e-15, '電流');
  near(C.dmmReading(2, { offset: 0.012, jitter: 0 }), 2.01, 1e-12, '零點偏差');
});

test('作圖分析：依 N1 位置分組、排序點、由兩條等位線估算電場（誤差 < 3 %）', () => {
  // 在計算的等位線上取點、打亂次序，模擬學生記錄
  const recs = [];
  [2, 3, 4].forEach(function (v, k) {
    const l = C.contour(solC, v).sort(function (a, b) { return b.pts.length - a.pts.length; })[0].pts;
    for (let i = 0; i < 7; i++) {
      const p = l[Math.floor((i + 0.5) * l.length / 7)];
      recs.push({ n1x: 5 + k, n1y: 3, reading: 0, V1: v, x: p[0], y: p[1] });
    }
  });
  recs.sort(function () { return 0.5 - ((recs.length * 7919) % 13) / 13; });
  const groups = C.groupRecords(recs);
  assert.strictEqual(groups.length, 3, '三組');
  groups.forEach(function (g) { assert.strictEqual(g.idx.length, 7); });
  const paths = {};
  groups.forEach(function (g) {
    const o = C.orderPoints(g.idx.map(function (i) { return [recs[i].x, recs[i].y]; }));
    paths[Math.round(g.V)] = C.smoothPath(o.pts, o.closed, 10);
  });
  const P = [16.5, 10];
  const r = C.estimateField(paths[3], 3, paths[2], 2, P);
  const mid = [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2];
  near(r.E / C.fieldAt(solC, mid[0], mid[1]).E, 1, 0.03, '估算／計算');
  near(r.dV, 1, 1e-12, 'ΔV');
});

test('畫電力線：由量到的等位線畫出的電力線從正極畫到負極，與等位線垂直、方向與電場相同', () => {
  const measured = [5, 4, 3, 2, 1].map(function (v) {
    return { V: v, path: C.contour(solC, v).sort(function (a, b) { return b.pts.length - a.pts.length; })[0].pts };
  });
  const lines = C.sketchFieldLines(measured, { els: solC.els, V0: V0, nSeeds: 9 });
  assert.strictEqual(lines.length, 9, '9 條電力線');
  const pe = solC.els[0], ne = solC.els[1];
  let worst = 1;
  lines.forEach(function (l) {
    const a = l[0], b = l[l.length - 1];
    assert.ok(C.distToElectrode(pe, a[0], a[1]) < 0.1, '起點在正極');
    assert.ok(C.distToElectrode(ne, b[0], b[1]) < 0.1, '終點在負極');
    for (let i = 5; i < l.length - 5; i += 5) {
      const x = l[i][0], y = l[i][1];
      if (Math.min(C.distToElectrode(pe, x, y), C.distToElectrode(ne, x, y)) < 1) continue;
      const tx = l[i + 1][0] - l[i - 1][0], ty = l[i + 1][1] - l[i - 1][1], e = C.fieldAt(solC, x, y);
      worst = Math.min(worst, (tx * e.ex + ty * e.ey) / (Math.hypot(tx, ty) * e.E));
    }
  });
  assert.ok(worst > 0.97, '線的方向與計算的電場夾角的 cos 最小值 ' + worst.toFixed(3));
  assert.deepStrictEqual(C.sketchFieldLines([], { els: solC.els, V0: V0 }), [], '沒有量測線就不畫');
});

test('求解速度：一般設定 1 秒內解完（網頁上拖滑桿要即時）', () => {
  for (const cfg of [{ type: 'circles', d: 20, a: 1.2, V0: 6 }, { type: 'bars', d: 6, L: 9, V0: 6 }, { type: 'barCircle', d: 7, a: 0.5, L: 11, V0: 6 }]) {
    const s = C.solve(cfg);
    assert.ok(s.ms < 1000, cfg.type + ' 用了 ' + s.ms + ' ms');
    assert.ok(s.res < 1e-8 * cfg.V0, '殘差 ' + s.res);
  }
});

console.log(`\n${passed} 項通過`);
