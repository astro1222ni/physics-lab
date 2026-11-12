// 以 Node 執行：node tests/trig-functions-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/trig-functions-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（容許 ${tol}），得到 ${a}`);
}
/** 可重現的亂數（mulberry32） */
function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(20261112);
const between = (lo, hi) => lo + (hi - lo) * R();
const DEG = Math.PI / 180;

console.log('單位圓');
test('sin² + cos² = 1（隨機 2000 個角度）', () => {
  for (let i = 0; i < 2000; i++) {
    const u = C.unit(between(-720, 1080));
    close(u.sin * u.sin + u.cos * u.cos, 1, 1e-14);
  }
});
test('90° 的整數倍是精確值（沒有 1e-16 的尾數）', () => {
  const want = { 0: [0, 1], 90: [1, 0], 180: [0, -1], 270: [-1, 0], 360: [0, 1], 450: [1, 0], 540: [0, -1], 720: [0, 1], '-90': [-1, 0] };
  Object.keys(want).forEach(k => {
    const u = C.unit(+k);
    assert.strictEqual(u.sin, want[k][0], k + '° 的 sin');
    assert.strictEqual(u.cos, want[k][1], k + '° 的 cos');
  });
  assert.ok(isNaN(C.unit(90).tan) && isNaN(C.unit(270).tan) && isNaN(C.unit(450).tan), 'tan 90°、270°、450° 沒有定義');
  close(C.unit(180).tan, 0, 0, 'tan 180°');
  close(C.unit(45).tan, 1, 1e-15, 'tan 45°');
});
test('象限、參考角、同界角', () => {
  const cases = [[30, 1, 30], [120, 2, 60], [210, 3, 30], [315, 4, 45], [420, 1, 60], [675, 4, 45], [-30, 4, 30], [90, 0, 90], [180, 0, 0], [0, 0, 0]];
  cases.forEach(c => {
    const u = C.unit(c[0]);
    assert.strictEqual(u.quadrant, c[1], c[0] + '° 的象限');
    close(u.ref, c[2], 1e-9, c[0] + '° 的參考角');
  });
  close(C.unit(420).std, 60, 1e-9);
  close(C.unit(-300).std, 60, 1e-9);
  assert.strictEqual(C.unit(420).turns, 1);
});
test('各象限的正負號（「全、正、切、餘」）', () => {
  for (let i = 0; i < 500; i++) {
    const th = between(0, 360);
    const u = C.unit(th);
    if (u.quadrant === 0) continue;
    const sgn = [u.sin > 0, u.cos > 0, u.tan > 0];
    const want = { 1: [true, true, true], 2: [true, false, false], 3: [false, false, true], 4: [false, true, false] }[u.quadrant];
    assert.deepStrictEqual(sgn, want, th + '°');
  }
});
test('tan θ = sin θ ／ cos θ，且等於直線 x = 1 上的交點高度', () => {
  for (let i = 0; i < 500; i++) {
    const th = between(-89, 89);
    const u = C.unit(th);
    close(u.tan, Math.tan(th * DEG), 1e-12);
    // 半徑延長線 y = (sin/cos)x 與 x = 1 的交點
    close(u.sin / u.cos * 1, u.tan, 1e-12);
  }
});
test('參考角公式：sin(180° − θ) = sin θ、cos(180° − θ) = −cos θ、sin(−θ) = −sin θ、sin(θ + 360°) = sin θ', () => {
  for (let i = 0; i < 500; i++) {
    const th = between(-400, 400);
    close(C.unit(180 - th).sin, C.unit(th).sin, 1e-12);
    close(C.unit(180 - th).cos, -C.unit(th).cos, 1e-12);
    close(C.unit(-th).sin, -C.unit(th).sin, 1e-12);
    close(C.unit(th + 360).sin, C.unit(th).sin, 1e-12);
    close(C.unit(90 - th).sin, C.unit(th).cos, 1e-12);
  }
});

console.log('特殊角的精確值');
test('15° 的倍數（−360°～720°）：sin、cos、tan 的精確值與 Math.sin 相符', () => {
  for (let d = -360; d <= 720; d += 15) {
    const s = C.exactSin(d), c = C.exactCos(d), t = C.exactTan(d);
    close(s.value, Math.sin(d * DEG), 1e-14, d + '° 的 sin');
    close(c.value, Math.cos(d * DEG), 1e-14, d + '° 的 cos');
    if (C.mod360(d) === 90 || C.mod360(d) === 270) assert.ok(t.undefined, d + '° 的 tan 應沒有定義');
    else close(t.value, Math.tan(d * DEG), 1e-12, d + '° 的 tan');
  }
});
test('精確值的寫法', () => {
  assert.strictEqual(C.exactSin(30).tex, '\\frac{1}{2}');
  assert.strictEqual(C.exactSin(210).tex, '-\\frac{1}{2}');
  assert.strictEqual(C.exactCos(150).text, '−√3/2');
  assert.strictEqual(C.exactTan(165).text, '−(2 − √3)');
  assert.strictEqual(C.exactTan(165).tex, '-\\left(2-\\sqrt{3}\\right)');
  assert.strictEqual(C.exactSin(195).text, '−(√6 − √2)/4');
  assert.strictEqual(C.exactSin(180).text, '0');
  assert.strictEqual(C.exactSin(17), null);
});
test('π 的分數', () => {
  const want = { 0: '0', 30: '\\frac{\\pi}{6}', 45: '\\frac{\\pi}{4}', 90: '\\frac{\\pi}{2}', 135: '\\frac{3\\pi}{4}', 180: '\\pi', 360: '2\\pi', 420: '\\frac{7\\pi}{3}', '-90': '-\\frac{\\pi}{2}', 15: '\\frac{\\pi}{12}', 330: '\\frac{11\\pi}{6}' };
  Object.keys(want).forEach(k => assert.strictEqual(C.piTex(+k), want[k], k + '°'));
  assert.strictEqual(C.piText(-135), '−3π/4');
  assert.strictEqual(C.piText(720), '4π');
  assert.strictEqual(C.piTex(10), null);
  // 分數的值正確
  for (let d = -720; d <= 720; d += 15) { const f = C.piFraction(d); close(f.num / f.den * Math.PI, d * DEG, 1e-12); }
});

console.log('正弦波 y = A sin(ωx + φ) + k');
test('振幅、週期、最大最小值、中線', () => {
  const w = C.waveInfo({ A: -2, w: 1.5, phi: 30, k: 1 });
  close(w.amp, 2, 0); close(w.period, 2 * Math.PI / 1.5, 1e-15); close(w.max, 3, 0); close(w.min, -1, 0);
  // 取樣確認最大最小值
  let mx = -Infinity, mn = Infinity;
  for (let i = 0; i <= 20000; i++) { const y = C.waveY(w, i / 20000 * w.period); mx = Math.max(mx, y); mn = Math.min(mn, y); }
  close(mx, 3, 1e-6); close(mn, -1, 1e-6);
});
test('週期性：y(x + 2π/ω) = y(x)', () => {
  for (let i = 0; i < 300; i++) {
    const p = { A: between(-3, 3), w: between(0.25, 4), phi: between(-180, 180), k: between(-2, 2) };
    const x = between(0, 20), T = 2 * Math.PI / p.w;
    close(C.waveY(p, x + T), C.waveY(p, x), 1e-11);
  }
});
test('第一個最大值：位置正確、是最大值、而且是 x ≥ 0 的第一個', () => {
  for (let i = 0; i < 1000; i++) {
    const p = { A: (R() < 0.5 ? -1 : 1) * between(0.1, 3), w: between(0.25, 4), phi: between(-180, 180), k: between(-2, 2) };
    const x = C.firstMax(p, 0), info = C.waveInfo(p);
    assert.ok(x >= -1e-12 && x < info.period + 1e-9, '在第一個週期內');
    close(C.waveY(p, x), info.max, 1e-12);
  }
  close(C.firstMax({ A: 2, w: 1, phi: 30, k: 0 }, 0), Math.PI / 3, 1e-14, 'y = 2sin(x + π/6) 的最大值在 π/3');
  close(C.firstMax({ A: -2, w: 1, phi: -150, k: 0 }, 0), Math.PI / 3, 1e-14, 'y = −2sin(x − 5π/6) 也是');
  close(C.firstMax({ A: 1, w: 1, phi: 90, k: 0 }, 0), 0, 1e-14, 'cos x 的最大值在 0');
  assert.ok(isNaN(C.firstMax({ A: 0, w: 1, phi: 0, k: 1 }, 0)));
});
test('第一個往上穿過中線的位置', () => {
  for (let i = 0; i < 500; i++) {
    const p = { A: (R() < 0.5 ? -1 : 1) * between(0.1, 3), w: between(0.25, 4), phi: between(-180, 180), k: between(-2, 2) };
    const x = C.firstRise(p, 0);
    close(C.waveY(p, x), p.k, 1e-12);
    assert.ok(C.waveY(p, x + 1e-4) > p.k, '之後在中線上方');
  }
});
test('A < 0 與 φ ± 180° 是同一條曲線：normalize 前後重合', () => {
  for (let i = 0; i < 300; i++) {
    const p = { A: between(-3, 3), w: between(0.25, 4), phi: between(-540, 540), k: between(-2, 2) };
    const n = C.normalize(p);
    assert.ok(n.A >= 0 && n.phi > -180 - 1e-9 && n.phi <= 180 + 1e-9);
    assert.ok(C.curveGap(p, n, 0, 30, 500) < 1e-12);
  }
  // 2 cos x = −2 sin(x − π/2)
  assert.ok(C.curveGap({ A: -2, w: 1, phi: -90, k: 0 }, { A: 2, w: 1, phi: 90, k: 0 }, 0, 20, 500) < 1e-12);
});
test('同一個 ω 時曲線最大差距的解析解（R + |Δk|）與取樣一致', () => {
  for (let i = 0; i < 300; i++) {
    const w = between(0.5, 4);
    const p = { A: between(-3, 3), w: w, phi: between(-180, 180), k: between(-2, 2) };
    const q = { A: between(-3, 3), w: w, phi: between(-180, 180), k: between(-2, 2) };
    // 兩個 sin 差的極值與 Δk 同號的那一側會疊加，所以最大差距 = R + |Δk|
    close(C.curveGap(p, q, 0, 2 * 2 * Math.PI / w, 40000), C.gapSameW(p, q), 1e-6);
  }
});
test('方程式的寫法', () => {
  assert.strictEqual(C.waveTex({ A: 2, w: 1.5, phi: 30, k: 1 }), 'y = 2\\sin\\left(1.5x + \\frac{\\pi}{6}\\right) + 1');
  assert.strictEqual(C.waveTex({ A: 1, w: 1, phi: 0, k: 0 }), 'y = \\sin x');
  assert.strictEqual(C.waveTex({ A: -1, w: 2, phi: -90, k: -0.5 }), 'y = -\\sin\\left(2x - \\frac{\\pi}{2}\\right) - 0.5');
  assert.strictEqual(C.waveTex({ A: 0, w: 2, phi: 0, k: 1.5 }), 'y = 1.5');
  assert.strictEqual(C.waveTex({ A: 3, w: 1, phi: 50, k: 0 }), 'y = 3\\sin\\left(x + 0.873\\right)');
});

console.log('疊合 a sin x + b cos x = r sin(x + φ)');
test('和角公式：隨機 a、b、x 都相等', () => {
  for (let i = 0; i < 2000; i++) {
    const a = between(-4, 4), b = between(-4, 4), x = between(-10, 10);
    const s = C.superpose(a, b);
    close(C.sumY(a, b, x), s.r * Math.sin(x + s.phi * DEG), 1e-12);
    close(s.r * Math.cos(s.phi * DEG), a, 1e-12);
    close(s.r * Math.sin(s.phi * DEG), b, 1e-12);
  }
});
test('3、4、5 與 1、√3、2', () => {
  close(C.superpose(3, 4).r, 5, 1e-15);
  close(C.superpose(1, Math.sqrt(3)).phi, 60, 1e-12);
  close(C.superpose(1, Math.sqrt(3)).r, 2, 1e-15);
  close(C.superpose(-1, 0).phi, 180, 1e-12);
  close(C.superpose(0, -2).phi, -90, 1e-12);
});
test('最大值 r 出現在 x = 90° − φ', () => {
  for (let i = 0; i < 500; i++) {
    const a = between(-4, 4), b = between(-4, 4), s = C.superpose(a, b);
    close(C.sumY(a, b, s.maxAt), s.r, 1e-12);
  }
});

console.log('螺旋線與挑戰題');
test('螺旋線的影子：側面是正弦波、正面是半徑 |A| 的圓', () => {
  for (let i = 0; i < 300; i++) {
    const p = { A: between(-3, 3), w: between(0.25, 4), phi: between(-180, 180), k: between(-2, 2) };
    const x = between(0, 13);
    const h = C.helix(p, x);
    close(h[2], C.waveY(p, x), 1e-12);
    close(Math.hypot(h[1], h[2] - p.k), Math.abs(p.A), 1e-12);
  }
});
test('隨機目標：都在滑桿格點上、看得到完整週期、和目前的曲線不同', () => {
  const r2 = rng(7);
  const cur = { A: 1, w: 1, phi: 0, k: 0 };
  for (let i = 0; i < 2000; i++) {
    const t = C.randomTarget(r2, cur);
    assert.ok(C.TARGET_A.indexOf(t.A) >= 0 && C.TARGET_W.indexOf(t.w) >= 0 && C.TARGET_K.indexOf(t.k) >= 0, '格點');
    assert.ok(t.phi % 15 === 0 && t.phi > -180 && t.phi <= 180, 'φ 是 15° 的倍數');
    assert.ok(2 * Math.PI / t.w <= 2 * Math.PI + 1e-12, '一個週期 ≤ 2π');
    assert.ok(t.A + Math.abs(t.k) <= 3.5, '在畫面內');
    assert.ok(C.curveGap(t, cur, 0, 4 * Math.PI, 600) >= 0.6, '和目前的曲線明顯不同');
    // 滑桿的範圍：A −3～3（0.1）、ω 0.25～4（0.05）、φ −180～180（5°）、k −2～2（0.1）
    assert.ok(Math.abs(t.A) <= 3 && t.w >= 0.25 && t.w <= 4 && Math.abs(t.k) <= 2);
  }
});

test('方程式的純文字：π 的分數、負號、省略 1 與 0', () => {
  assert.strictEqual(C.waveText({ A: 1, w: 1, phi: 0, k: 0 }), 'y = sin x');
  assert.strictEqual(C.waveText({ A: 2, w: 1.5, phi: 45, k: 0.5 }), 'y = 2 sin(1.5x + π/4) + 0.5');
  assert.strictEqual(C.waveText({ A: -1, w: 2, phi: -90, k: -1 }), 'y = −sin(2x − π/2) − 1');
  assert.strictEqual(C.waveText({ A: 3, w: 1, phi: 50, k: 0 }), 'y = 3 sin(x + 0.873)');
  assert.strictEqual(C.waveText({ A: 0, w: 1, phi: 0, k: -1.5 }), 'y = −1.5');
});

console.log(`\n${passed} 項測試通過${process.exitCode ? '，有失敗' : ''}。`);
