// 以 Node 執行：node tests/slit-interference-core.test.js
'use strict';
const assert = require('assert');
const SC = require('../js/slit-interference-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, rel, msg) {
  const tol = rel * Math.max(Math.abs(a), Math.abs(b), 1e-30);
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
function near0(v, tol, msg) {
  assert.ok(Math.abs(v) <= tol, (msg || '') + ` 期望 ≈ 0，得到 ${v}`);
}

const nm = 1e-9, um = 1e-6;
// 典型的雙狹縫：λ = 550 nm，a = 40 μm，d = 120 μm，L = 1 m
const P2 = { N: 2, a: 40 * um, d: 120 * um, lambda: 550 * nm, L: 1 };

/** 在 y0 附近以黃金分割搜尋強度的局部極大位置 */
function localMax(p, y0, half) {
  let lo = y0 - half, hi = y0 + half;
  const g = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 200; i++) {
    const x1 = hi - g * (hi - lo), x2 = lo + g * (hi - lo);
    if (SC.intensity(p, x1) > SC.intensity(p, x2)) hi = x2; else lo = x1;
  }
  return (lo + hi) / 2;
}

console.log('slit-interference-core');

test('中央 I(0) = I0（單狹縫、雙狹縫、光柵）', () => {
  for (const N of [1, 2, 3, 5, 10]) {
    close(SC.intensity(Object.assign({}, P2, { N: N }), 0), 1, 1e-15, `N = ${N}`);
  }
});

test('sinθ 使用精確關係 y/√(y² + L²)', () => {
  close(SC.sinTheta(1, 1), Math.SQRT1_2, 1e-15);
  close(SC.sinTheta(0.3, 2), 0.3 / Math.sqrt(0.09 + 4), 1e-15);
  close(SC.yFromSin(SC.sinTheta(0.37, 1.4), 1.4), 0.37, 1e-12, 'yFromSin 是 sinTheta 的反函數');
});

test('單狹縫暗紋：a sinθ = mλ（m ≠ 0）處 I = 0', () => {
  const p = { N: 1, a: 25 * um, d: 25 * um, lambda: 633 * nm, L: 1.5 };
  for (const m of [-4, -3, -2, -1, 1, 2, 3, 4]) {
    const y = SC.yFromSin(m * p.lambda / p.a, p.L);
    near0(SC.intensity(p, y), 1e-20, `m = ${m}`);
    // 暗紋兩側不為零（確實是暗紋而不是整片暗）
    assert.ok(SC.intensity(p, y * 1.2) > 1e-4, `m = ${m} 外側應有亮帶`);
  }
  const darks = SC.singleSlitDarks(p);
  assert.ok(darks.length > 0 && darks.every((d) => d.m !== 0));
  for (const d of darks) near0(SC.intensitySin(p, d.sin), 1e-20);
});

test('單狹縫：大角度時暗紋位置與小角度近似 λL/a 不同（精確公式）', () => {
  const p = { N: 1, a: 2 * 500 * nm, d: 0, lambda: 500 * nm, L: 1 }; // a = 2λ → θ1 = 30°
  const yExact = p.L * Math.tan(Math.PI / 6);
  near0(SC.intensity(p, yExact), 1e-20, '精確暗紋 y = L tan30°');
  assert.ok(SC.intensity(p, p.lambda * p.L / p.a) > 0.01, '小角度近似位置 λL/a 並不是暗紋');
  close(SC.centralWidthExact(p), 2 * yExact, 1e-12);
});

test('單狹縫：兩側亮帶的極大值約為 0.047 I0、0.016 I0', () => {
  const p = { N: 1, a: 40 * um, d: 40 * um, lambda: 550 * nm, L: 1 };
  const y1 = localMax(p, 1.43 * p.lambda * p.L / p.a, 0.3 * p.lambda * p.L / p.a);
  const y2 = localMax(p, 2.46 * p.lambda * p.L / p.a, 0.3 * p.lambda * p.L / p.a);
  close(SC.intensity(p, y1), 0.04719, 1e-3);
  close(SC.intensity(p, y2), 0.01648, 1e-3);
});

test('雙狹縫亮紋：d sinθ = mλ 處（中央包絡線內）干涉因子 = 1、I = 包絡線值，且為局部極大', () => {
  const p = Object.assign({}, P2, { d: 150 * um }); // d/a = 3.75，中央包絡內 m = 0, ±1, ±2, ±3
  for (const m of [-3, -2, -1, 0, 1, 2, 3]) {
    const s = m * p.lambda / p.d;
    close(SC.intensitySin(p, s), SC.singleSlitFactor(s, p.a, p.lambda), 1e-12, `m = ${m}`);
    close(SC.multiSlitFactor(s, p.d, p.lambda, 2), 1, 1e-12);
  }
  // 縫寬遠小於縫距時包絡線幾乎平坦，局部極大就落在 d sinθ = mλ 上
  // （縫寬較大時，包絡線的斜率會把亮紋峰值稍微推向中央，這是真實的物理）
  const q = { N: 2, a: 5 * um, d: 150 * um, lambda: 550 * nm, L: 1 };
  for (const m of [-5, -2, -1, 1, 2, 5]) {
    const y = SC.yFromSin(m * q.lambda / q.d, q.L);
    const yMax = localMax(q, y, 0.4 * SC.fringeSpacing(q));
    assert.ok(Math.abs(yMax - y) < 0.01 * SC.fringeSpacing(q), `m = ${m} 的極大位置偏差過大：${yMax - y}`);
  }
});

test('雙狹縫暗紋：d sinθ = (m + ½)λ 處 I = 0', () => {
  for (const m of [-3, -1, 0, 2, 5]) {
    near0(SC.intensitySin(P2, (m + 0.5) * P2.lambda / P2.d), 1e-24, `m = ${m}`);
  }
});

test('雙狹縫因子 = cos²(π d sinθ / λ)', () => {
  for (const s of [0.0001, 0.0023, 0.017, 0.2, 0.71]) {
    const c = Math.cos(Math.PI * P2.d * s / P2.lambda);
    close(SC.multiSlitFactor(s, P2.d, P2.lambda, 2), c * c, 1e-9, `sinθ = ${s}`);
  }
});

test('缺級：d = 3a 時第 ±3、±6 級亮紋消失', () => {
  assert.strictEqual(SC.missingOrderStep(120 * um, 40 * um), 3);
  assert.strictEqual(SC.missingOrderStep(150 * um, 40 * um), 0);
  assert.strictEqual(SC.missingOrderStep(80 * um, 40 * um), 2);
  for (const m of [-6, -3, 3, 6]) near0(SC.intensitySin(P2, m * P2.lambda / P2.d), 1e-20, `m = ${m}`);
  const orders = SC.brightOrders(P2);
  for (const o of orders) assert.strictEqual(o.missing, o.m !== 0 && o.m % 3 === 0, `m = ${o.m}`);
  assert.ok(orders.find((o) => o.m === 3).I < 1e-20);
  assert.ok(orders.find((o) => o.m === 2).I > 0.1);
  // d/a 不是整數：沒有缺級，第 3 級亮紋仍看得到（雖然較暗）
  const p = Object.assign({}, P2, { d: 130 * um });
  assert.ok(SC.brightOrders(p).every((o) => !o.missing));
  assert.ok(SC.intensitySin(p, 3 * p.lambda / p.d) > 1e-3);
});

test('中央亮帶內的亮紋數：d/a = k 為 2k − 1，否則 2⌊d/a⌋ + 1', () => {
  assert.strictEqual(SC.fringesInCentral(P2), 5);
  assert.strictEqual(SC.fringesInCentral(Object.assign({}, P2, { d: 80 * um })), 3);
  assert.strictEqual(SC.fringesInCentral(Object.assign({}, P2, { d: 150 * um })), 7);
  assert.strictEqual(SC.fringesInCentral(Object.assign({}, P2, { d: 41 * um })), 3);
  // 與直接數數比對
  for (const d of [45, 60, 77, 100, 120, 199, 200, 333]) {
    const p = Object.assign({}, P2, { d: d * um });
    const count = SC.brightOrders(p).filter((o) => Math.abs(o.sin) < p.lambda / p.a && !o.missing).length;
    assert.strictEqual(SC.fringesInCentral(p), count, `d = ${d} μm`);
  }
});

test('小角度：亮紋間距與 λL/d 吻合', () => {
  const p = { N: 2, a: 2 * um, d: 100 * um, lambda: 500 * nm, L: 1 };
  const dy = SC.fringeSpacing(p);
  close(dy, 5e-3, 1e-12, 'λL/d = 5 mm');
  const y1 = localMax(p, dy, 0.3 * dy);
  const y2 = localMax(p, 2 * dy, 0.3 * dy);
  close(y1, dy, 1e-3, '第 1 級亮紋');
  close(y2 - y1, dy, 1e-3, '第 1、2 級間距');
  // 暗紋 d sinθ = (m + ½)λ 不受包絡線影響，間距同樣是 λL/d
  const dark = (m) => SC.yFromSin((m + 0.5) * p.lambda / p.d, p.L);
  close(dark(1) - dark(0), dy, 1e-4, '暗紋間距');
  // 精確位置 y = L tan(asin(mλ/d))
  const o = SC.brightOrders(p).find((q) => q.m === 1);
  close(o.y, p.L * Math.tan(Math.asin(p.lambda / p.d)), 1e-12);
  close(SC.centralWidth(p), 2 * p.lambda * p.L / p.a, 1e-15);
});

test('強度永遠在 [0, I0] 之間，且左右對稱', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let i = 0; i < 20000; i++) {
    const a = (2 + rnd() * 98) * um;
    const p = { N: 1 + Math.floor(rnd() * 10), a: a, d: a + rnd() * 400 * um, lambda: (380 + rnd() * 370) * nm, L: 0.3 + rnd() * 3 };
    const y = (rnd() - 0.5) * 2;
    const I = SC.intensity(p, y);
    assert.ok(I >= 0 && I <= 1 + 1e-12 && isFinite(I), `I = ${I}，參數 ${JSON.stringify(p)}，y = ${y}`);
    close(SC.intensity(p, -y), I, 1e-9, '對稱性');
    assert.ok(I <= SC.envelope(p, y) + 1e-12, '不可超過單狹縫包絡線');
  }
});

test('N 狹縫光柵：主極大在 d sinθ = mλ，兩主極大之間有 N − 1 個暗紋', () => {
  for (const N of [3, 4, 6, 10]) {
    const p = { N: N, a: 10 * um, d: 50 * um, lambda: 600 * nm, L: 1 };
    for (const m of [-2, -1, 0, 1, 2, 7]) {
      const s = m * p.lambda / p.d;
      close(SC.multiSlitFactor(s, p.d, p.lambda, N), 1, 1e-9, `N = ${N}, m = ${m}`);
      // 主極大附近略偏一點仍接近 1（不是 0/0 的數值問題）
      assert.ok(SC.multiSlitFactor(s + 1e-12, p.d, p.lambda, N) > 0.999999);
    }
    for (let j = 1; j < N; j++) {
      near0(SC.multiSlitFactor((1 + j / N) * p.lambda / p.d, p.d, p.lambda, N), 1e-20, `N = ${N}, j = ${j}`);
    }
    // 次極大明顯比主極大暗
    const sSec = (1.5 / N) * p.lambda / p.d;
    assert.ok(SC.multiSlitFactor(sSec, p.d, p.lambda, N) < 0.25, `N = ${N} 次極大`);
  }
});

test('N 狹縫：N 越大主極大越窄（第一個暗紋在 sinθ = λ/(Nd)）', () => {
  const base = { a: 10 * um, d: 50 * um, lambda: 600 * nm, L: 1 };
  let prev = Infinity;
  for (const N of [2, 3, 5, 10]) {
    const p = Object.assign({ N: N }, base);
    const sZero = p.lambda / (N * p.d);
    near0(SC.multiSlitFactor(sZero, p.d, p.lambda, N), 1e-20);
    assert.ok(sZero < prev);
    prev = sZero;
  }
});

test('波長 → sRGB：顏色合理且數值在 0–255', () => {
  for (let w = 380; w <= 750; w += 1) {
    const c = SC.wavelengthToRGB(w);
    assert.ok(c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255), `${w} nm → ${c}`);
    assert.ok(Math.max.apply(null, c) > 0, `${w} nm 不應是黑色`);
  }
  const red = SC.wavelengthToRGB(650), green = SC.wavelengthToRGB(532), blue = SC.wavelengthToRGB(460);
  assert.ok(red[0] === 255 && red[1] === 0 && red[2] === 0, '650 nm 為紅色');
  assert.ok(green[1] === 255 && green[2] === 0 && green[0] < 160, '532 nm 以綠色為主');
  assert.ok(blue[2] === 255 && blue[0] === 0, '460 nm 以藍色為主');
  const violet = SC.wavelengthToRGB(400);
  assert.ok(violet[2] > violet[1] && violet[0] > 0, '400 nm 為紫色（藍 + 紅）');
  assert.deepStrictEqual(SC.wavelengthToRGB(300), [0, 0, 0]);
  assert.strictEqual(SC.colorName(532), '綠光');
  assert.strictEqual(SC.colorName(650), '紅光');
  assert.strictEqual(SC.colorName(405), '紫光');
});

test('sRGB 與線性亮度互為反函數', () => {
  for (let c = 0; c <= 255; c++) assert.strictEqual(SC.linearToSrgb(SC.srgbToLinear(c)), c);
});

// ---------------- 白光 ----------------
const SPEC = SC.whiteSpectrum(75, 380, 750, 6500);

test('白光光譜：75 個波長、權重和為 1、白平衡後 Σ w·rgb = (1, 1, 1)', () => {
  assert.strictEqual(SPEC.n, 75);
  close(SPEC.nm[0], 380, 1e-12); close(SPEC.nm[74], 750, 1e-12);
  let sw = 0; const c = [0, 0, 0];
  for (let i = 0; i < SPEC.n; i++) {
    assert.ok(SPEC.w[i] > 0 && SPEC.r[i] >= 0 && SPEC.g[i] >= 0 && SPEC.b[i] >= 0);
    sw += SPEC.w[i]; c[0] += SPEC.w[i] * SPEC.r[i]; c[1] += SPEC.w[i] * SPEC.g[i]; c[2] += SPEC.w[i] * SPEC.b[i];
  }
  close(sw, 1, 1e-12);
  c.forEach((v) => close(v, 1, 1e-12));
  // 紅端以 R 為主、藍端以 B 為主
  assert.ok(SPEC.r[64] > SPEC.g[64] && SPEC.r[64] > SPEC.b[64], '700 nm 偏紅');
  assert.ok(SPEC.b[14] > SPEC.r[14] && SPEC.b[14] > SPEC.g[14], '450 nm 偏藍');
});

test('白光：遞推計算與逐一波長直接相加一致', () => {
  for (const N of [1, 2, 3, 10]) {
    const p = { N: N, a: 37 * um, d: 113 * um, L: 1 };
    for (let k = 0; k < 400; k++) {
      const s = (k % 2 ? -1 : 1) * Math.pow(k / 400, 2) * 0.6;
      let I = 0, R = 0;
      for (let i = 0; i < SPEC.n; i++) {
        const v = SPEC.w[i] * SC.intensitySin(Object.assign({ lambda: SPEC.lambda[i] }, p), s);
        I += v; R += v * SPEC.r[i];
      }
      const c = SC.whiteAtSin(p, s, SPEC);
      assert.ok(Math.abs(c[0] - Math.min(1, I)) < 1e-9 && Math.abs(c[1] - Math.min(1, R)) < 1e-9, `N = ${N}, s = ${s}: ${c[0]} vs ${I}`);
    }
  }
});

test('白光：中央 y = 0 光強最大（= 1）且顏色為中性白（R = G = B）', () => {
  for (const N of [1, 2, 5, 10]) {
    const p = Object.assign({}, P2, { N: N });
    const c = SC.whiteAt(p, 0, SPEC);
    close(c[0], 1, 1e-12, `N = ${N} I`);
    close(c[1], 1, 1e-9, `N = ${N} R`); close(c[2], 1, 1e-9, `N = ${N} G`); close(c[3], 1, 1e-9, `N = ${N} B`);
    for (let y = -0.05; y <= 0.05; y += 1e-5) {
      if (Math.abs(y) < 1e-9) continue;
      assert.ok(SC.whiteAt(p, y, SPEC)[0] < 1, `N = ${N}, y = ${y}`);
    }
  }
});

test('白光：總光強在 [0, 1] 之間且左右對稱，顏色通道也在 [0, 1]', () => {
  for (const N of [1, 2, 3, 10]) {
    const p = Object.assign({}, P2, { N: N, a: 20 * um, d: 75 * um, L: 0.8 });
    for (let y = 0; y <= 0.3; y += 3.7e-5) {
      const a = SC.whiteAt(p, y, SPEC), b = SC.whiteAt(p, -y, SPEC);
      for (let k = 0; k < 4; k++) {
        assert.ok(a[k] >= 0 && a[k] <= 1, `N = ${N}, y = ${y}, ch ${k} = ${a[k]}`);
        close(b[k], a[k], 1e-9, `對稱 N = ${N}, y = ${y}`);
      }
      close(SC.whiteIntensity(p, y, SPEC), a[0], 1e-12);
    }
  }
});

test('白光雙狹縫：第 1 級亮紋紅端比紫端離中央更遠（內緣偏藍、外緣偏紅）', () => {
  // 單一波長的第 1 級亮紋位置（局部極大）
  const yv = localMax(Object.assign({}, P2, { lambda: 400 * nm }), SC.yFromSin(400 * nm / P2.d, 1), 0.5e-3);
  const yr = localMax(Object.assign({}, P2, { lambda: 700 * nm }), SC.yFromSin(700 * nm / P2.d, 1), 0.5e-3);
  assert.ok(yr > yv * 1.6, `紅 ${yr}、紫 ${yv}`);
  // 白光顏色：第 1 級範圍內 R 通道的峰值位置比 B 通道外側
  let yR = 0, yB = 0, mR = -1, mB = -1;
  for (let y = 2.4e-3; y <= 6.4e-3; y += 1e-6) {
    const c = SC.whiteAt(P2, y, SPEC);
    if (c[1] > mR) { mR = c[1]; yR = y; }
    if (c[3] > mB) { mB = c[3]; yB = y; }
  }
  assert.ok(yR > yB + 1e-3, `R 峰 ${yR}、B 峰 ${yB}`);
  // 第 1 級內緣偏藍、外緣偏紅
  const inner = SC.whiteAt(P2, 3.2e-3, SPEC), outer = SC.whiteAt(P2, 5.6e-3, SPEC);
  assert.ok(inner[3] > inner[1], '內緣 B > R');
  assert.ok(outer[1] > outer[3], '外緣 R > B');
});

test('白光光柵：第 1 級主亮紋位置符合 d sinθ = λ（400 nm 與 700 nm）', () => {
  const p = { N: 10, a: 20 * um, d: 75 * um, L: 1 };
  const ys = {};
  for (const w of [400, 700]) {
    const q = Object.assign({}, p, { lambda: w * nm });
    const y = localMax(q, SC.yFromSin(w * nm / p.d, p.L), 0.2e-3);
    // 單狹縫包絡線的斜率讓峰值稍微偏向中央（< 0.2%）；干涉因子本身在 d sinθ = λ 恰為 1
    close(p.d * SC.sinTheta(y, p.L), w * nm, 2e-3, `${w} nm`);
    close(SC.multiSlitFactor(w * nm / p.d, p.d, w * nm, p.N), 1, 1e-12);
    ys[w] = y;
  }
  assert.ok(ys[700] > ys[400]);
  // 白光總和中，兩個位置的顏色分別偏紫與偏紅
  const cv = SC.whiteAt(p, ys[400], SPEC), cr = SC.whiteAt(p, ys[700], SPEC);
  assert.ok(cv[3] > cv[2] && cr[1] > cr[2] && cr[1] > cr[3]);
  // 第 2 級紅端越過第 3 級紫端：光譜重疊
  assert.ok(2 * 700 * nm / p.d > 3 * 400 * nm / p.d);
});

test('白光包絡線：中央為 1、對稱、不小於白光總光強', () => {
  const p = Object.assign({}, P2, { N: 5 });
  close(SC.whiteEnvelope(p, 0, SPEC), 1, 1e-12);
  for (let y = 1e-4; y < 0.04; y += 3.3e-4) {
    const e = SC.whiteEnvelope(p, y, SPEC);
    close(SC.whiteEnvelope(p, -y, SPEC), e, 1e-12);
    assert.ok(SC.whiteAt(p, y, SPEC)[0] <= e + 1e-12);
  }
});

console.log(`\n${passed} 項通過`);
