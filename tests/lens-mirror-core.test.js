// 以 Node 執行：node tests/lens-mirror-core.test.js
'use strict';
const assert = require('assert');
const LM = require('../js/lens-mirror-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}

const IDS = ['convex-lens', 'concave-lens', 'concave-mirror', 'convex-mirror'];
const FS = [5, 7.5, 10, 12.5, 20];
const PS = [1, 3.3, 4, 6, 9.9, 10.1, 15, 20, 25, 33, 45];
const HS = [1, 3, 5.5, 8];

console.log('lens-mirror-core');

test('焦距正負號：凸透鏡、凹面鏡 f > 0；凹透鏡、凸面鏡 f < 0；平面鏡 f = ∞', () => {
  assert.strictEqual(LM.signedFocal('convex-lens', 10), 10);
  assert.strictEqual(LM.signedFocal('concave-mirror', 10), 10);
  assert.strictEqual(LM.signedFocal('concave-lens', 10), -10);
  assert.strictEqual(LM.signedFocal('convex-mirror', 10), -10);
  assert.strictEqual(LM.signedFocal('plane-mirror', 10), Infinity);
});

test('成像公式 1/p + 1/q = 1/f（四種元件、多組 p 與 f）', () => {
  for (const id of IDS) for (const fa of FS) for (const p of PS) {
    const s = LM.solve(id, fa, p, 2);
    if (s.atInfinity) continue;
    close(1 / p + 1 / s.q, 1 / s.f, 1e-12, `${id} f=${fa} p=${p}`);
    close(s.invP + s.invQ, s.invF, 1e-12, '驗算欄位');
  }
});

test('放大率 m = −q/p = h′/h', () => {
  for (const id of IDS) for (const fa of FS) for (const p of PS) for (const h of HS) {
    const s = LM.solve(id, fa, p, h);
    if (s.atInfinity) continue;
    close(s.m, -s.q / p, 1e-12, `${id} m`);
    close(s.hImg, s.m * h, 1e-12, 'h′');
    // 另一種寫法：m = f/(f − p)
    close(s.m, s.f / (s.f - p), 1e-10, 'm = f/(f − p)');
  }
});

test('像的位置：透鏡實像在另一側（x = q）、面鏡實像在鏡前（x = −q）', () => {
  const a = LM.solve('convex-lens', 10, 30, 2);
  close(a.q, 15, 1e-12); close(a.xImg, 15, 1e-12);
  const b = LM.solve('concave-mirror', 10, 30, 2);
  close(b.q, 15, 1e-12); close(b.xImg, -15, 1e-12);
  const c = LM.solve('concave-lens', 10, 10, 2);       // q = −5，虛像在物體同側
  close(c.q, -5, 1e-12); close(c.xImg, -5, 1e-12);
  const d = LM.solve('convex-mirror', 10, 10, 2);      // q = −5，虛像在鏡後
  close(d.q, -5, 1e-12); close(d.xImg, 5, 1e-12);
});

test('平面鏡：q = −p、m = +1，虛像在鏡後等距處', () => {
  for (const p of PS) {
    const s = LM.solve('plane-mirror', 10, p, 3);
    close(s.q, -p, 1e-12); close(s.m, 1, 1e-12); close(s.xImg, p, 1e-12);
    assert.ok(!s.real && s.upright && s.size === 'same');
    assert.strictEqual(s.case, 'plane');
  }
});

test('主光線（出射光直線）兩兩交於成像公式的像點（含虛像的反向延長線）', () => {
  let checked = 0;
  for (const id of IDS.concat(['plane-mirror'])) for (const fa of FS) for (const p of PS) for (const h of [1, 5]) {
    const s = LM.solve(id, fa, p, h);
    const rays = LM.principalRays(id, fa, p, h);
    assert.ok(rays.length >= 2, '至少兩條主光線');
    for (let i = 0; i < rays.length; i++) for (let j = i + 1; j < rays.length; j++) {
      const X = LM.intersectOut(rays[i], rays[j]);
      if (s.atInfinity) { assert.strictEqual(X, null, '像在無窮遠：出射光互相平行'); continue; }
      assert.ok(X, `${id} p=${p} 光線應相交`);
      close(X.x, s.xImg, 1e-9, `${id} f=${fa} p=${p} ${rays[i].key}×${rays[j].key} x`);
      close(X.y, s.hImg, 1e-9, `${id} f=${fa} p=${p} ${rays[i].key}×${rays[j].key} y`);
      // 實像：交點在出射光的前進方向（t > 0）；虛像：在反向延長線上（t < 0）
      if (s.real) assert.ok(X.t > 0, '實像由實際光線交會');
      else assert.ok(X.t < 0, '虛像由反向延長線交會');
      checked++;
    }
  }
  assert.ok(checked > 500);
});

test('主光線的定義：平行主軸的光經過 F′（或其延長線）、經光心直進、經 F 的光平行射出、經 C 原路返回', () => {
  for (const id of IDS) for (const fa of [8, 12]) for (const p of [5, 15, 30]) {
    const s = LM.solve(id, fa, p, 4);
    const rays = LM.principalRays(id, fa, p, 4);
    const r = {};
    rays.forEach((x) => { r[x.key] = x; });
    // 平行光：入射水平，出射直線經過 via 點（透鏡 F′：x = f；面鏡 F：x = −f）
    close(r.parallel.slopeIn, 0, 1e-15);
    const v = r.parallel.via;
    close(v.x, s.element.kind === 'lens' ? s.f : -s.f, 1e-12);
    const tx = (v.x - r.parallel.xh) / r.parallel.outDir[0];
    close(r.parallel.yh + r.parallel.outDir[1] * tx, 0, 1e-12, '平行光出射線經過焦點');
    // 經 F：入射線經過 (−f, 0)，出射水平
    if (r.focal) {
      const t = (-s.f - r.focal.x0) / r.focal.inDir[0];
      close(r.focal.y0 + r.focal.inDir[1] * t, 0, 1e-12, '入射線經過 F');
      close(r.focal.outDir[1], 0, 1e-12, '經 F 的光平行主軸射出');
    }
    if (r.center) {
      close(r.center.yh, 0, 1e-15);
      close(r.center.outDir[0], r.center.inDir[0], 1e-15); close(r.center.outDir[1], r.center.inDir[1], 1e-15);
    }
    if (r.radius) {
      close(r.radius.outDir[0], -r.radius.inDir[0], 1e-12, '經 C 原路反射');
      close(r.radius.outDir[1], -r.radius.inDir[1], 1e-12, '經 C 原路反射');
    }
    // 面鏡反射光往左、透鏡出射光往右
    rays.forEach((x) => assert.ok(s.element.kind === 'lens' ? x.outDir[0] > 0 : x.outDir[0] < 0));
  }
});

test('面鏡：射向鏡頂的光對稱反射（入射角 = 反射角）', () => {
  for (const id of ['concave-mirror', 'convex-mirror', 'plane-mirror']) {
    const ray = LM.traceRay(id, 10, 17, 3, 0);
    close(ray.outDir[0], -ray.inDir[0], 1e-14);
    close(ray.outDir[1], ray.inDir[1], 1e-14);
  }
});

test('多條光線（任意打在元件上的光線）都交於同一個像點', () => {
  for (const id of IDS.concat(['plane-mirror'])) for (const [fa, p] of [[10, 25], [10, 20], [10, 14], [10, 6], [15, 40], [6, 2]]) {
    const s = LM.solve(id, fa, p, 3);
    const fan = LM.fanRays(id, fa, p, 3, 12, 9);
    for (const r of fan) {
      if (Math.abs(r.yh - 3) < 1e-12 && s.atInfinity) continue;
      // 出射直線在 x = xImg 的高度
      const t = (s.xImg - r.xh) / r.outDir[0];
      close(r.yh + r.outDir[1] * t, s.hImg, 1e-9, `${id} p=${p} yHit=${r.yh}`);
    }
  }
});

test('會聚元件的課本成像表（凸透鏡、凹面鏡）', () => {
  for (const id of ['convex-lens', 'concave-mirror']) for (const fa of [5, 10, 17.5]) {
    const f = fa;
    const chk = (p, cs, real, upright, size, qCheck) => {
      const s = LM.solve(id, fa, p, 2);
      assert.strictEqual(s.case, cs, `${id} p=${p} 情況`);
      assert.strictEqual(s.real, real, `${id} p=${p} 虛實`);
      assert.strictEqual(s.upright, upright, `${id} p=${p} 正倒`);
      assert.strictEqual(s.size, size, `${id} p=${p} 大小`);
      if (qCheck) assert.ok(qCheck(s.q), `${id} p=${p} 像距範圍 q=${s.q}`);
    };
    chk(3 * f, 'beyond2F', true, false, 'reduced', (q) => q > f && q < 2 * f);
    chk(2.01 * f, 'beyond2F', true, false, 'reduced', (q) => q > f && q < 2 * f);
    chk(2 * f, 'at2F', true, false, 'same', (q) => q === 2 * f);
    chk(1.5 * f, 'between', true, false, 'magnified', (q) => q > 2 * f);
    chk(1.01 * f, 'between', true, false, 'magnified', (q) => q > 2 * f);
    chk(0.5 * f, 'insideF', false, true, 'magnified', (q) => q < 0);
    chk(0.99 * f, 'insideF', false, true, 'magnified', (q) => q < 0);
    const s = LM.solve(id, fa, f, 2);
    assert.strictEqual(s.case, 'atF');
    assert.ok(s.atInfinity && !s.real && !s.upright && s.size === 'infinite', '物在焦點：像在無窮遠');
    const at2 = LM.solve(id, fa, 2 * f, 2);
    close(at2.m, -1, 1e-15, 'p = 2f 時 m = −1');
  }
});

test('發散元件（凹透鏡、凸面鏡）：任何物距都成虛像、正立、縮小，且 |q| < |f|、|q| < p', () => {
  for (const id of ['concave-lens', 'convex-mirror']) for (const fa of FS) for (const p of PS) {
    const s = LM.solve(id, fa, p, 2);
    assert.strictEqual(s.case, 'diverging');
    assert.ok(!s.real && s.upright && s.size === 'reduced', `${id} p=${p}`);
    assert.ok(s.q < 0 && Math.abs(s.q) < fa && Math.abs(s.q) < p);
    assert.ok(s.m > 0 && s.m < 1);
  }
});

test('極限情況：p → ∞ 時 q → f；p → 0 時 q → −p、m → 1；p → f⁺ 時 q → +∞，p → f⁻ 時 q → −∞', () => {
  for (const id of IDS) {
    const s = LM.solve(id, 10, 1e7, 1);
    close(s.q, s.f, 1e-5, `${id} 遠物成像在焦點`);
    const n = LM.solve(id, 10, 1e-4, 1);
    close(n.q, -1e-4, 1e-4, `${id} 物貼近元件`);
    close(n.m, 1, 1e-4);
  }
  assert.ok(LM.solve('convex-lens', 10, 10.001, 1).q > 1e4);
  assert.ok(LM.solve('convex-lens', 10, 9.999, 1).q < -1e4);
});

test('物在焦點（會聚）：主光線出射互相平行，像在無窮遠', () => {
  for (const id of ['convex-lens', 'concave-mirror']) {
    const rays = LM.principalRays(id, 10, 10, 3);
    assert.ok(rays.length >= 2);
    for (let i = 1; i < rays.length; i++) {
      close(rays[i].outDir[0], rays[0].outDir[0], 1e-12); close(rays[i].outDir[1], rays[0].outDir[1], 1e-12);
    }
    assert.ok(!rays.some((r) => r.key === 'focal'), '經 F 的光線退化（垂直主軸）不畫');
  }
  // 凹面鏡物在 C：經 C 的光線退化，改用射向鏡頂的光線
  const keys = LM.principalRays('concave-mirror', 10, 20, 3).map((r) => r.key);
  assert.deepStrictEqual(keys, ['parallel', 'focal', 'vertex']);
});

test('可逆性：像與物互換位置（共軛點），1/p + 1/q 不變', () => {
  for (const [f, p] of [[10, 25], [10, 15], [8, 40]]) {
    const q = LM.imageDistance(p, f);
    close(LM.imageDistance(q, f), p, 1e-12);
  }
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗項目' : ''));
