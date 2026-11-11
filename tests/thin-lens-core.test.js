// 以 Node 執行：node tests/thin-lens-core.test.js
'use strict';
const assert = require('assert');
const TL = require('../js/thin-lens-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}

const FS = [10, 15, 20, 12.3, -10, -15, -20, -17.6];
const PS = [3, 7.5, 10, 14, 20, 25, 30, 41.7, 60, 85];

console.log('thin-lens-core');

test('成像公式 1/p + 1/q = 1/f，放大率 m = −q/p', () => {
  for (const f of FS) for (const p of PS) {
    const s = TL.solve(p, f);
    if (s.atInfinity) continue;
    close(1 / p + 1 / s.q, 1 / f, 1e-12, `f=${f} p=${p}`);
    close(s.m, -s.q / p, 1e-12);
    close(s.m, f / (f - p), 1e-10, 'm = f/(f − p)');
    close(TL.focalFrom(p, s.q), f, 1e-10, 'f = pq/(p + q)');
  }
});

test('凸透鏡：p > f 成倒立實像，p < f 成正立放大虛像，p = f 像在無窮遠；p = 2f 等大', () => {
  const a = TL.solve(30, 10); assert.ok(a.real && !a.upright && a.size === 'reduced'); close(a.q, 15, 1e-12);
  const b = TL.solve(20, 10); assert.ok(b.real && b.size === 'same'); close(b.q, 20, 1e-12); close(b.m, -1, 1e-12);
  const c = TL.solve(15, 10); assert.ok(c.real && c.size === 'magnified'); close(c.q, 30, 1e-12);
  const d = TL.solve(5, 10); assert.ok(!d.real && d.upright && d.size === 'magnified'); close(d.q, -10, 1e-12);
  const e = TL.solve(10, 10); assert.ok(e.atInfinity);
});

test('凹透鏡：永遠成正立縮小虛像，像在透鏡與焦點之間（|q| < |f|、|q| < p）', () => {
  for (const f of [-10, -15, -20]) for (const p of PS) {
    const s = TL.solve(p, f);
    assert.ok(!s.real && s.upright && s.size === 'reduced', `f=${f} p=${p}`);
    assert.ok(Math.abs(s.q) < Math.abs(f) && Math.abs(s.q) < p);
  }
});

test('共軛位置：D ≥ 4f 時有兩個物距，互為對方的像距；D = 4f 只有一個；D < 4f 沒有', () => {
  for (const f of [10, 15, 20, 12.3]) for (const D of [4 * f, 4.5 * f, 60, 90]) {
    const c = TL.conjugates(D, f);
    if (D < 4 * f) { assert.strictEqual(c, null); continue; }
    close(c.p1 + c.p2, D, 1e-12);
    close(TL.imageDistance(c.p1, f), c.p2, 1e-9, '第一個位置的像距 = 第二個物距');
    close(TL.imageDistance(c.p2, f), c.p1, 1e-9);
    close(TL.besselF(D, c.d), f, 1e-12, '貝索法還原焦距');
    if (D === 4 * f) close(c.p1, c.p2, 1e-9);
  }
  assert.strictEqual(TL.conjugates(39.9, 10), null);
});

test('p + q 的最小值是 4f（發生在 p = q = 2f）', () => {
  for (const f of [10, 15, 20]) {
    let min = Infinity, at = 0;
    for (let p = f + 0.01; p < 10 * f; p += 0.01) { const q = TL.imageDistance(p, f); if (p + q < min) { min = p + q; at = p; } }
    close(min, 4 * f, 1e-6); close(at, 2 * f, 2e-3);
  }
});

test('像屏上的模糊圈：在像的位置為 0，與離焦距離成正比；平行光時等於透鏡直徑', () => {
  const D = 2 * TL.LENS_R;
  for (const q of [12, 20, 45]) {
    assert.strictEqual(TL.blurDiameter(q, q), 0);
    close(TL.blurDiameter(q, q + 1), D / q, 1e-12);
    close(TL.blurDiameter(q, q - 2), 2 * D / q, 1e-12);
    close(TL.blurDiameter(q, 0), D, 1e-12, '緊貼透鏡時就是透鏡大小');
  }
  close(TL.blurDiameter(Infinity, 30), D, 1e-12);
  close(TL.blurDiameter(-7.5, 10), D * 17.5 / 7.5, 1e-12, '虛像：光錐由左方發散');
});

test('理想透鏡：同一物點經過透鏡任何位置的光線，都通過（或反向延長通過）像點', () => {
  for (const f of FS) for (const p of [7.5, 25, 41.7]) for (const obj of [[0, 0], [0.8, -1.2], [-1.5, 0.4]]) {
    const s = TL.solve(p, f);
    if (s.atInfinity) continue;
    const img = [s.m * obj[0], s.m * obj[1]];
    for (const L of [[0.3, 0], [-2, 1], [1.7, 1.7], [0, -2.4]]) {
      const u = TL.outSlope(f, p, obj, L, 0);
      // 出射光線 L + u·x 在 x = q 處的位置
      close(L[0] + u[0] * s.q, img[0], 1e-9, `f=${f} p=${p} s`);
      close(L[1] + u[1] * s.q, img[1], 1e-9, `f=${f} p=${p} y`);
    }
  }
});

test('透過透鏡看：眼睛看到物點的方向恰為指向像點的方向（實像、虛像都成立）', () => {
  for (const f of FS) for (const p of [7.5, 25, 41.7]) for (const d of [15, 40, 70]) {
    const s = TL.solve(p, f);
    if (s.atInfinity || Math.abs(d - s.q) < 1) continue;
    for (const obj of [[0, 0], [0.6, 1.2]]) for (const eye of [[0, 0], [1.5, 0], [-0.7, 0.3]]) {
      const v = TL.viewThroughLens(f, p, d, obj, eye, 100, 0);
      const dist = d - s.q;
      close(v.a[0], (s.m * obj[0] - eye[0]) / dist, 1e-9, `f=${f} p=${p} d=${d}`);
      close(v.a[1], (s.m * obj[1] - eye[1]) / dist, 1e-9);
    }
  }
});

test('視差：參考物在像的位置時，頭怎麼擺都沒有視差；不在時視差與頭的位移成正比', () => {
  for (const f of [10, -10, -20, 15]) {
    const xO = 20, xL = 50;
    const s = TL.solve(xL - xO, f);
    const xI = xL + s.q, xE = TL.eyeX(xL, s.q);
    for (const sE of [-2, -0.5, 0.7, 2]) {
      close(TL.parallax(xE, xI, xI, sE), 0, 1e-15);
      // 與「透過透鏡看」的方向一致
      const v = TL.viewThroughLens(f, xL - xO, xE - xL, [0, 0], [sE, 0], 100, 0);
      const rod = TL.viewDirect(xE - (xI - 1), [0, 0], [sE, 0]);
      close(v.a[0] - rod[0], TL.parallax(xE, xI, xI - 1, sE), 1e-9, '與直接計算相符');
      close(TL.parallax(xE, xI, xI - 1, 2 * sE), 2 * TL.parallax(xE, xI, xI - 1, sE), 1e-12);
    }
  }
});

test('視差的判讀（課本規則）：參考物比像近 → 與頭反向；比像遠 → 與頭同向', () => {
  const xE = 65, xI = 42.5;
  assert.strictEqual(TL.parallaxSense(xE, xI, 45), 'against');   // 參考物較近眼睛
  assert.strictEqual(TL.parallaxSense(xE, xI, 38), 'with');      // 參考物較遠
  assert.strictEqual(TL.parallaxSense(xE, xI, xI), 'none');
  // 頭向右（sE > 0）：參考物較近時，參考物相對於像向左移 → 像在參考物右邊（parallax > 0）
  assert.ok(TL.parallax(xE, xI, 45, 1) > 0);
  assert.ok(TL.parallax(xE, xI, 38, 1) < 0);
  close(TL.parallaxOffset(xE, xI, 45, 2), 2 * 2.5 / 22.5, 1e-12);
});

test('眼睛的位置：虛像時在透鏡後 15 cm；實像時至少在實像後 25 cm；擺頭幅度 0.3–2 cm', () => {
  assert.strictEqual(TL.eyeX(50, -7.5), 65);
  assert.strictEqual(TL.eyeX(50, 15), 90);
  assert.strictEqual(TL.eyeX(50, Infinity), 65);
  for (const q of [-7.5, -30, 15, 60]) {
    const xE = TL.eyeX(50, q), A = TL.swingAmp(50, q, xE);
    assert.ok(A >= 0.3 && A <= 2);
    // 擺到最大時，像的中心仍在鏡框內
    const v = TL.viewThroughLens(q > 0 ? 1 / (1 / 30 + 1 / q) : 1 / (1 / 30 + 1 / q), 30, xE - 50, [0, 0], [A, 0], TL.LENS_R, 0);
    assert.ok(v.visible, `q=${q}`);
  }
});

test('插針法：觀測點、A、B 與像共線時，AB 延長線與主軸交於像（虛像與實像）', () => {
  for (const f of [-10, -15, -20, 10]) for (const p of [6, 12, 20, 28]) {
    const s = TL.solve(p, f);
    if (s.atInfinity) continue;
    const I = [s.q, 0];
    for (const E of [[20, -6], [25, 9], [14, 3]]) {
      if (Math.abs(E[0] - s.q) < 1) continue; // 眼睛恰在實像上：看不清（無解）
      // 由 E 看 P 的像：視線經過透鏡上的 L，再指向像
      const c = TL.pinCrossing(f, p, E, 2.5, 2.5, 2.5, 0);
      const Lp = [0, c.L[0]];
      close(TL.lineAxis(Lp, E), s.q, 1e-9, `f=${f} p=${p} 視線指向像`);
      const A = [Lp[0] + 0.35 * (E[0] - Lp[0]), Lp[1] + 0.35 * (E[1] - Lp[1])];
      const B = [Lp[0] + 0.75 * (E[0] - Lp[0]), Lp[1] + 0.75 * (E[1] - Lp[1])];
      close(TL.lineAxis(A, B), I[0], 1e-9);
      close(TL.apparentImageX(f, p, E, 2.5, 2.5, 0), s.q, 1e-9);
    }
  }
  assert.strictEqual(TL.lineAxis([3, 2], [8, 2]), null, '平行主軸時沒有交點');
});

test('球面像差（含誤差）：觀測點越偏離主軸，看起來的像位置偏差越大；凸凹透鏡的屈光力都變強', () => {
  for (const f of [-10, -15, 10]) {
    // 方格紙上看得到的像：凹透鏡 p = 20；凸透鏡用焦點內的物（p = 6，虛像在 −15 cm），視線都要穿過直徑 5 cm 的透鏡
    const p = f > 0 ? 6 : 20, q = TL.solve(p, f).q, c = TL.saCoef(f);
    const near = TL.apparentImageX(f, p, [20, -2], 2.5, 2.5, c);
    const E = [20, f > 0 ? -5 : -7];
    assert.ok(Math.abs(TL.pinCrossing(f, p, E, 2.5, 2.5, 2.5, c).L[0]) < TL.LENS_R, '視線穿過透鏡');
    const far = TL.apparentImageX(f, p, E, 2.5, 2.5, c);
    assert.ok(Math.abs(far - q) > Math.abs(near - q), `f=${f}`);
    // 等效焦距變短 → 由看起來的像位置算出的 |f| 比真值小
    const fApp = TL.focalFrom(p, far);
    assert.ok(Math.abs(fApp) < Math.abs(f), `f=${f} 得 ${fApp}`);
    assert.ok(Math.abs(fApp - f) / Math.abs(f) < 0.06, '偏差在合理範圍');
  }
  close(TL.apparentImageX(-10, 20, [20, 0.0001], 2.5, 2.5, TL.saCoef(-10)), TL.solve(20, -10).q, 1e-4, '沿主軸看沒有偏差');
});

test('最佳直線：精確數據的 1/q 對 1/p 斜率為 −1，兩個截距都是 1/f', () => {
  for (const f of [10, 13.7, -12.4]) {
    const rows = (f > 0 ? [15, 20, 25, 35, 50] : [8, 15, 22, 30]).map(p => ({ p, q: TL.imageDistance(p, f) }));
    const a = TL.analyze(rows, f);
    close(a.slope, -1, 1e-10);
    close(a.fY, f, 1e-10); close(a.fX, f, 1e-10); close(a.fFit, f, 1e-10);
    close(a.meanF, f, 1e-10); close(a.fFixed, f, 1e-10);
    close(a.errFit, 0, 1e-9); assert.strictEqual(a.n, rows.length);
    a.rows.forEach(r => { close(r.ip + r.iq, 1 / f, 1e-12); close(r.m, -r.q / r.p, 1e-12); });
  }
  const one = TL.analyze([{ p: 30, q: 15 }], 10);
  assert.ok(!one.fit); close(one.meanF, 10, 1e-12);
});

test('linFit 與已知直線、相關係數', () => {
  const f = TL.linFit([0, 1, 2, 3], [1, 3, 5, 7]);
  close(f.a, 1, 1e-12); close(f.b, 2, 1e-12); close(f.r, 1, 1e-12);
  assert.strictEqual(TL.linFit([1], [2]), null);
  assert.strictEqual(TL.linFit([2, 2], [1, 3]), null);
});

test('透鏡光心偏離臺座標線 δ：p、q 讀數有系統誤差，但共軛法（貝索法）不受影響', () => {
  const f = 12.5, xO = 5, xS = 75, D = xS - xO, dl = 0.4;
  const c = TL.conjugates(D, f);
  // 真正的透鏡光心在 xO + p1、xO + p2；臺座標線讀數比光心少 δ
  const rows = [c.p1, c.p2].map(pt => { const xL = xO + pt - dl; return { p: xL - xO, q: xS - xL }; });
  const a = TL.analyze(rows, f);
  assert.ok(Math.abs(a.rows[0].f - f) > 0.05 && Math.abs(a.rows[1].f - f) > 0.05, '每一列單獨算都有偏差');
  const b = TL.findConjugate(rows, 0.15, 2);
  assert.ok(b);
  close(b.f, f, 1e-9, '貝索法不受 δ 影響');
});

test('bench()：讀數與真實值、像屏模糊圈、參考物誤差', () => {
  const b = TL.bench({ f: 10, xO: 5, xL: 35, xS: 50 });
  close(b.pTrue, 30, 1e-12); close(b.q, 15, 1e-12); close(b.xI, 50, 1e-12);
  close(b.blur, 0, 1e-12); close(b.qRead, 15, 1e-12);
  const c = TL.bench({ f: -10, xO: 20, xL: 50, xR: 43 });
  close(c.q, -7.5, 1e-12); close(c.xI, 42.5, 1e-12); close(c.rodErr, 0.5, 1e-12); close(c.qRead, -7, 1e-12);
  assert.strictEqual(c.xE, 65);
  const d = TL.bench({ f: 10, xO: 5, xL: 35, xS: 50, dL: 0.3 });
  close(d.pTrue, 30.3, 1e-12); close(d.pRead, 30, 1e-12); assert.ok(d.blur > 0);
});

test('讀數：讀到 1 mm；含誤差時偏差不超過 1 mm；亂數可重現；神秘透鏡焦距在範圍內', () => {
  close(TL.round1(12.345), 12.3, 1e-12); close(TL.round1(-7.55), -7.6, 1e-12);
  const r1 = TL.rng(42), r2 = TL.rng(42);
  for (let i = 0; i < 50; i++) assert.strictEqual(r1(), r2());
  const r = TL.rng(7);
  for (let i = 0; i < 2000; i++) {
    const x = TL.round1(r() * 100);
    const y = TL.readScale(x, r);
    assert.ok(Math.abs(y - x) <= 0.1 + 1e-9);
    close(y * 10, Math.round(y * 10), 1e-9);
  }
  for (let i = 0; i < 500; i++) {
    const a = TL.mysteryF(r, 1), b = TL.mysteryF(r, -1);
    assert.ok(a >= 11 && a <= 19 && b <= -11 && b >= -19);
    const d = TL.lensOffset(r);
    assert.ok(Math.abs(d) >= 0.2 - 1e-9 && Math.abs(d) <= 0.5 + 1e-9);
  }
});

test('像屏照度 ∝ 1/m²：等大為 1，放大 2 倍時剩 1/4', () => {
  close(TL.relBrightness(-1), 1, 1e-12); close(TL.relBrightness(-2), 0.25, 1e-12); close(TL.relBrightness(0.5), 4, 1e-12);
});

test('器材清單與符號：四種凸透鏡、四種凹透鏡（各含一個神秘透鏡）', () => {
  assert.strictEqual(TL.LENSES.length, 8);
  assert.strictEqual(TL.LENSES.filter(l => l.sign > 0).length, 4);
  assert.strictEqual(TL.LENSES.filter(l => l.mystery).length, 2);
  TL.LENSES.forEach(l => { if (l.f) assert.strictEqual(Math.sign(l.f), l.sign); });
});

console.log(`${passed} 個測試通過`);
