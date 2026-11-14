// 以 Node 執行：node tests/refractive-index-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/refractive-index-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
const DEG = Math.PI / 180;
const rad = (d) => d * DEG;
const deg = (r) => r / DEG;
const NS = [1.333, 1.49, 1.52, 1.62];

console.log('refractive-index-core');

test('材料的公認折射率：水 1.333、壓克力 1.49、冕牌玻璃 1.52', () => {
  const m = {};
  C.MATERIALS.forEach((x) => { m[x.id] = x.n; });
  assert.strictEqual(m.water, 1.333);
  assert.strictEqual(m.acrylic, 1.49);
  assert.strictEqual(m.crown, 1.52);
  assert.ok(Number.isNaN(m.unknown));
});

test('向量折射遵守司乃耳定律 sinθ1 = n sinθ2（空氣→介質、介質→空氣）', () => {
  for (const n of NS) for (let d = 0; d <= 89; d += 1) {
    const u = C.v(Math.sin(rad(d)), -Math.cos(rad(d)));       // 向下入射，法線 (0, 1)
    const r = C.refract(u, C.v(0, 1), 1, n);
    assert.ok(!r.tir);
    close(Math.sin(rad(d)), n * Math.abs(r.u.x), 1e-12, `n=${n} θ=${d}°`);
    assert.ok(r.u.y < 0, '折射光繼續往下');
    close(C.snell(1, n, rad(d)), Math.asin(Math.abs(r.u.x)), 1e-12);
  }
});

test('臨界角：水 48.6°、壓克力 42.2°、冕牌玻璃 41.1°；超過臨界角全反射', () => {
  close(deg(C.criticalAngle(1.333)), 48.61, 0.01);
  close(deg(C.criticalAngle(1.49)), 42.16, 0.01);
  close(deg(C.criticalAngle(1.52)), 41.14, 0.01);
  for (const n of NS) {
    const c = C.criticalAngle(n);
    const below = C.refract(C.v(Math.sin(c - 1e-4), Math.cos(c - 1e-4)), C.v(0, 1), n, 1);
    const above = C.refract(C.v(Math.sin(c + 1e-4), Math.cos(c + 1e-4)), C.v(0, 1), n, 1);
    assert.ok(!below.tir && above.tir, `n=${n}`);
    close(above.u.y, -Math.cos(c + 1e-4), 1e-12, '全反射：反射角等於入射角');
  }
});

test('菲涅耳穿透率：垂直入射 T = 1 − ((n−1)/(n+1))²，接近掠射時趨近 0', () => {
  for (const n of NS) {
    close(C.fresnelT(1, n, 1, 1), 1 - Math.pow((n - 1) / (n + 1), 2), 1e-12);
    const r = C.refract(C.v(Math.sin(rad(89.99)), -Math.cos(rad(89.99))), C.v(0, 1), 1, n);
    assert.ok(r.T < 0.01, `n=${n} 掠射 T=${r.T}`);
  }
  // 由介質射向空氣、恰在臨界角之下：穿透率很小
  const c = C.criticalAngle(1.52);
  const r = C.refract(C.v(Math.sin(c - 1e-5), Math.cos(c - 1e-5)), C.v(0, 1), 1.52, 1);
  assert.ok(r.T < 0.05);
});

test('長方形透明塊（平行兩面）：出射光與入射光平行，側向位移 d = t sin(θ1−θ2)/cosθ2', () => {
  for (const n of NS) for (const t of [2, 6, 8]) for (const d of [5, 20, 35, 50, 65, 75]) {
    const b = C.makeBlock({ shape: 'rect', t: t, w: 40 });
    const th = rad(d);
    const A = C.v(-3 - 10 * Math.sin(th), 10 * Math.cos(th));
    const u = C.v(Math.sin(th), -Math.cos(th));
    const tr = C.trace(b, n, A, u);
    assert.ok(tr.exited && tr.faces.join() === 'top,bottom', `n=${n} t=${t} θ=${d}`);
    close(C.cross(tr.uOut, u), 0, 1e-12, '平行');
    const th2 = C.snell(1, n, th);
    close(C.distToLine(tr.pOut, A, u), C.lateralShift(t, th, th2), 1e-9, '側向位移');
  }
});

test('側向位移：垂直入射為 0、隨入射角增大、永遠小於厚度 t（掠射時趨近 t）', () => {
  for (const n of NS) {
    let prev = -1;
    for (let d = 0; d < 90; d += 0.5) {
      const th = rad(d), s = C.lateralShift(6, th, C.snell(1, n, th));
      assert.ok(s >= prev - 1e-12 && s < 6);
      prev = s;
    }
    close(C.lateralShift(6, 0, 0), 0, 1e-15);
    const th = rad(89.9999);
    close(C.lateralShift(6, th, C.snell(1, n, th)), 6, 1e-3);
  }
});

test('旋轉的長方形透明塊：兩面仍平行，出射光仍與入射光平行', () => {
  for (const rot of [-1.4, -0.6, 0.8, 1.3]) {
    const b = C.makeBlock({ shape: 'rect', t: 6, w: 30, rot: rad(rot) });
    const u = C.unit(C.v(0.55, -1));
    const tr = C.trace(b, 1.52, C.v(-4, 8), u);
    assert.ok(tr.exited);
    close(C.cross(tr.uOut, u), 0, 1e-12);
  }
});

test('半圓形（平面側入射）：瞄準圓心的光在圓心折射後沿半徑前進，射出圓弧時不再偏折', () => {
  for (const n of NS) for (const rot of [0, rad(1.2), rad(-0.8)]) for (const d of [10, 30, 50, 70]) {
    const b = C.makeBlock({ shape: 'semi', R: 6, rot: rot });
    const nrm = C.toWorld(b, C.v(0, 1));
    const P = C.mul(C.rotate(nrm, rad(d)), 5);              // 在法線左側 d°
    const tr = C.trace(b, n, P, C.sub(C.v(0, 0), P));
    assert.ok(tr.exited && tr.faces.join() === 'flat,arc');
    close(C.len(tr.pts[1]), 0, 1e-9, '入射點是圓心');
    close(C.cross(C.unit(tr.pts[2]), tr.uOut), 0, 1e-9, '沿半徑射出、不偏折');
    const th2 = C.angleBetween(tr.uOut, C.mul(nrm, -1));
    close(Math.sin(rad(d)), n * Math.sin(th2), 1e-9, '司乃耳定律');
  }
});

test('半圓形（弧面側入射）：小於臨界角時由平面射出 sinθ空氣 = n sinθ塊內；大於臨界角全反射', () => {
  for (const n of NS) {
    const b = C.makeBlock({ shape: 'semi', R: 6 });
    const c = C.criticalAngle(n);
    for (const th of [c * 0.3, c * 0.8, c - 0.002]) {
      const P = C.v(-9 * Math.sin(th), -9 * Math.cos(th));
      const tr = C.trace(b, n, P, C.sub(C.v(0, 0), P));
      assert.ok(tr.exited && tr.faces.join() === 'arc,flat', `n=${n}`);
      close(Math.sin(C.angleBetween(tr.uOut, C.v(0, 1))), n * Math.sin(th), 1e-9);
      const info = C.reverseInfo(b, n, P);
      assert.ok(!info.tir); close(info.thMed, th, 1e-9);
    }
    const P = C.v(-9 * Math.sin(c + 0.01), -9 * Math.cos(c + 0.01));
    const tr = C.trace(b, n, P, C.sub(C.v(0, 0), P));
    assert.ok(tr.tir && tr.faces.join() === 'arc,flat,arc', '全反射後由圓弧另一側射出');
    assert.ok(C.reverseInfo(b, n, P).tir);
  }
});

test('插針法：C、D 插在真正的出射光上時，眼睛看到 A、B 的像與 C、D 四針重疊（長方形）', () => {
  for (const n of NS) for (const rot of [0, rad(1)]) for (const d of [15, 35, 55]) {
    const b = C.makeBlock({ shape: 'rect', t: 6, w: 12, rot: rot });
    const th = rad(d);
    const B = C.v(-1.5, 1.2), A = C.add(B, C.v(-5 * Math.sin(th), 5 * Math.cos(th)));
    const id = C.idealRect(b, n, A, B, 2, 6, 10);
    const views = [A, B].map((p) => C.viewPin(b, n, p, id.eye, 'top', 'bottom'));
    const look = C.unit(C.sub(id.C, id.eye));
    for (const vw of views) {
      assert.ok(vw.lower.ok && !vw.lower.direct, '透過透明塊看到');
      close(C.signedAngle(look, vw.lower.dir), 0, 1e-7, `n=${n} θ=${d}`);
      assert.ok(Math.abs(C.signedAngle(look, vw.upper)) > 1e-3, '高過透明塊的上段沒有對齊（看起來「斷掉」）');
    }
    close(C.signedAngle(look, C.unit(C.sub(id.D, id.eye))), 0, 1e-12);
    // 眼睛橫移 3 mm：A、B 的像不再重疊
    const side = C.v(look.y, -look.x);
    const eye2 = C.add(id.eye, C.mul(side, 0.3));
    const a = C.viewPin(b, n, A, eye2, 'top', 'bottom').lower.dir, bb = C.viewPin(b, n, B, eye2, 'top', 'bottom').lower.dir;
    assert.ok(Math.abs(C.signedAngle(a, bb)) > 1e-3);
  }
});

test('插針法：半圓形 P′ 插在真正的折射光上時，P 的像與 O、P′ 重疊', () => {
  for (const n of NS) for (const d of [15, 35, 55]) {
    const b = C.makeBlock({ shape: 'semi', R: 6 });
    const P = C.v(-6 * Math.sin(rad(d)), 6 * Math.cos(rad(d)));
    const id = C.idealSemi(b, n, P, 'fwd', 9, 13);
    const vw = C.viewPin(b, n, P, id.eye, 'flat', 'arc');
    const look = C.unit(C.sub(C.v(0, 0), id.eye));
    assert.ok(vw.lower.ok);
    close(C.signedAngle(look, vw.lower.dir), 0, 1e-7);
    close(C.signedAngle(look, C.unit(C.sub(id.P2, id.eye))), 0, 1e-12);
  }
  // 弧面側入射、小於臨界角
  const b = C.makeBlock({ shape: 'semi', R: 6 });
  const P = C.v(-9 * Math.sin(rad(25)), -9 * Math.cos(rad(25)));
  const id = C.idealSemi(b, 1.52, P, 'rev', 5, 9);
  const vw = C.viewPin(b, 1.52, P, id.eye, 'arc', 'flat');
  assert.ok(vw.lower.ok);
  close(C.signedAngle(C.unit(C.mul(id.eye, -1)), vw.lower.dir), 0, 1e-7);
});

test('弧面側入射超過臨界角：眼睛在「O 的折射光方向」上看不到 P 的像通過 O', () => {
  const n = 1.49, b = C.makeBlock({ shape: 'semi', R: 6 });
  const c = C.criticalAngle(n);
  const P = C.v(-9 * Math.sin(c + rad(2)), -9 * Math.cos(c + rad(2)));
  for (const a of [60, 75, 85]) {
    const eye = C.v(8 * Math.sin(rad(a)), 8 * Math.cos(rad(a)));
    const vw = C.viewPin(b, n, P, eye, 'arc', 'flat');
    if (vw.lower.ok) assert.ok(Math.abs(C.signedAngle(C.unit(C.mul(eye, -1)), vw.lower.dir)) > rad(0.5), '看到的像不會與 O 重疊');
  }
});

test('量測（長方形，理想插針）：θ1、θ2 與 sinθ1/sinθ2 = n、θ3 = θ2、θ4 = θ1、AB ∥ CD', () => {
  for (const n of NS) for (const d of [10, 30, 50, 65]) for (const sgn of [-1, 1]) {
    const b = C.makeBlock({ shape: 'rect', t: 6, w: 30 });
    const th = rad(d);
    const B = C.v(-1.2 * sgn, 1.5), A = C.add(B, C.v(sgn * -5 * Math.sin(th), 5 * Math.cos(th)));
    const id = C.idealRect(b, n, A, B, 2, 7);
    const m = C.measureRect(b, A, B, id.C, id.D);
    assert.ok(m.ok && m.crossed);
    assert.strictEqual(m.side, -sgn);
    close(m.th1, th, 1e-9); close(Math.sin(m.th1) / Math.sin(m.th2), n, 1e-9);
    close(m.th3, m.th2, 1e-9); close(m.th4, m.th1, 1e-9);
    close(m.parallel, 0, 1e-9);
    close(m.shift, C.lateralShift(6, m.th1, m.th2), 1e-9);
    const e = C.alignError(b, n, 'rect', { A: A, B: B, C: id.C, D: id.D });
    close(e.ang, 0, 1e-9); close(e.off, 0, 1e-9);
  }
});

test('量測（半圓形，理想插針）：x1/x2 = sinθ1/sinθ2 = n', () => {
  for (const n of NS) for (const k of [1, 2, 3, 4, 5]) {
    const b = C.makeBlock({ shape: 'semi', R: 6 });
    const P = C.v(-k, Math.sqrt(36 - k * k));                // 講義的 P1 ～ P5：距法線 1 ～ 5 cm
    const id = C.idealSemi(b, n, P, 'fwd', 8.5);
    const m = C.measureSemi(b, P, id.P2, 'fwd');
    assert.ok(m.ok);
    close(m.x1, k, 1e-9);
    close(m.x1 / m.x2, n, 1e-9);
    close(Math.sin(m.th1) / Math.sin(m.th2), n, 1e-9);
  }
});

test('系統誤差：透明塊轉 1° 沒對準 L，左右入射偏差正負相反，平均後幾乎抵消', () => {
  const n = 1.52, rot = rad(1);
  const b = C.makeBlock({ shape: 'rect', t: 6, rot: rot });
  const errs = {};
  for (const sgn of [-1, 1]) {
    const th = rad(45);
    const B = C.v(-1 * sgn, 1.5), A = C.add(B, C.v(sgn * -5 * Math.sin(th), 5 * Math.cos(th)));
    const id = C.idealRect(b, n, A, B, 2, 7);
    const m = C.measureRect(b, A, B, id.C, id.D);
    errs[sgn] = C.pctError(Math.sin(m.th1) / Math.sin(m.th2), n);
  }
  assert.ok(Math.abs(errs[-1]) > 1 && Math.abs(errs[1]) > 1, '單側偏差超過 1%');
  assert.ok(errs[-1] * errs[1] < 0, '左右正負相反');
  assert.ok(Math.abs(errs[-1] + errs[1]) / 2 < 0.1, '平均後小於 0.1%');
});

test('讀數：量角器取到 1° 或 0.5°、直尺取到 0.01 cm；不加誤差時結果固定', () => {
  assert.strictEqual(C.readAngle(34.26, 1, 0), 34);
  assert.strictEqual(C.readAngle(34.26, 0.5, 0), 34.5);
  assert.strictEqual(C.readAngle(34.74, 0.5, 0), 34.5);
  assert.strictEqual(C.readAngle(34.76, 0.5, 0), 35);
  assert.strictEqual(C.readLength(2.8049, 0.01, 0), 2.8);
  const r = C.rng(7);
  let s = 0, s2 = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) { const g = C.gauss(r); s += g; s2 += g * g; }
  close(s / N, 0, 0.06, '平均'); close(s2 / N, 1, 0.08, '變異數');
  const a = C.rng(42), b = C.rng(42);
  for (let i = 0; i < 5; i++) assert.strictEqual(a(), b());
  for (let i = 0; i < 200; i++) {
    const x = C.unknownN(r);
    assert.ok(x >= C.UNKNOWN_RANGE[0] && x <= C.UNKNOWN_RANGE[1]);
    const e = Math.abs(C.systematicRot(r)) / DEG;
    assert.ok(e >= 0.6 - 1e-9 && e <= 1.4 + 1e-9);
  }
});

test('最佳直線：過原點的斜率 = Σxy/Σx²；一般直線的斜率與截距', () => {
  const xs = [0.2, 0.35, 0.5, 0.6], ys = xs.map((x) => 1.52 * x);
  const f = C.fitOrigin(xs, ys);
  close(f.m, 1.52, 1e-12); close(f.se, 0, 1e-12);
  const g = C.fitLine(xs, ys.map((y) => y + 0.03));
  close(g.m, 1.52, 1e-12); close(g.c, 0.03, 1e-12); close(g.r2, 1, 1e-12);
  const h = C.fitOrigin([0.1, 0.2, 0.3], [0.16, 0.29, 0.46]);
  close(h.m, (0.016 + 0.058 + 0.138) / (0.01 + 0.04 + 0.09), 1e-12);
  assert.ok(h.se > 0);
  close(C.pctError(1.5352, 1.52), 1, 1e-9);
});

test('透明塊的範圍判斷與輪廓', () => {
  const b = C.makeBlock({ shape: 'rect', t: 6 });
  assert.ok(C.inside(b, C.v(0, -3)) && !C.inside(b, C.v(0, 0.5)) && !C.inside(b, C.v(7, -3)));
  const s = C.makeBlock({ shape: 'semi', R: 6 });
  assert.ok(C.inside(s, C.v(0, -5.9)) && !C.inside(s, C.v(4.5, -4.5)) && !C.inside(s, C.v(0, 1)));
  assert.strictEqual(C.outline(b).length, 4);
  assert.ok(C.segmentHits(b, C.v(-3, 4), C.v(3, -10)) && !C.segmentHits(b, C.v(-3, 4), C.v(-3, 1)));
});

test('長方形插針不限順序：A、B 誰近誰遠、C、D 誰近誰遠，量到的角度都一樣', () => {
  for (const t of [4, 6]) {
    for (const rot of [0, rad(1.5)]) {
      const b = C.makeBlock({ shape: 'rect', t: t, rot: rot });
      for (const n of NS) {
        for (const [A, B] of [[C.v(-5, 8), C.v(-2, 3)], [C.v(4, 7), C.v(1.5, 2)], [C.v(-1, 9), C.v(-0.5, 4)]]) {
          const id = C.idealRect(b, n, A, B, 2, 6);
          const id2 = C.idealRect(b, n, B, A, 2, 6);
          assert.ok(id && id2, '理想插針要追得到出射光');
          close(C.len(C.sub(id.C, id2.C)), 0, 1e-9, 'A、B 對調，出射光不變');
          const ref = C.measureRect(b, A, B, id.C, id.D);
          assert.ok(ref.ok);
          for (const [p, q, r, s] of [[A, B, id.C, id.D], [B, A, id.C, id.D], [A, B, id.D, id.C], [B, A, id.D, id.C]]) {
            const m = C.measureRect(b, p, q, r, s);
            assert.ok(m.ok, '任何順序都要量得到');
            close(m.th1, ref.th1, 1e-9); close(m.th2, ref.th2, 1e-9); close(m.th4, ref.th4, 1e-9);
            const ir = C.incRay(b, p, q);
            const tr = C.trace(b, n, ir.p, ir.u);
            assert.deepStrictEqual(tr.faces, ['top', 'bottom'], '從上表面進、下表面出');
            const al = C.alignError(b, n, 'rect', { A: p, B: q, C: r, D: s });
            assert.ok(al && al.ang < 1e-9 && al.off < 1e-9, '對準誤差為 0');
          }
        }
      }
    }
  }
});

console.log(`\n${passed} 項測試通過`);
