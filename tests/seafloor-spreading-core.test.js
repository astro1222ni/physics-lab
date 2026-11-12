// 以 Node 執行：node tests/seafloor-spreading-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/seafloor-spreading-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const xsOf = (R, n) => { const xs = []; for (let i = 0; i <= n; i++) xs.push(-R + 2 * R * i / n); return xs; };

console.log('seafloor-spreading-core');

test('GTS2012 極性年表：區間不重疊且遞增；布容／松山邊界 0.781 Ma；加拉米佑、奧杜威是正向；年表外為 0', () => {
  let last = -1;
  K.NORMAL.forEach(p => { assert.ok(p[0] > last && p[1] > p[0], JSON.stringify(p)); last = p[1]; });
  assert.strictEqual(K.polarity(0.5), 1);
  assert.strictEqual(K.polarity(0.782), -1);
  assert.strictEqual(K.polarity(1.03), 1);
  assert.strictEqual(K.polarity(1.85), 1);
  assert.strictEqual(K.polarity(2.3), -1);
  assert.strictEqual(K.polarity(3.0), 1);
  assert.strictEqual(K.polarity(5.5), -1);
  assert.strictEqual(K.polarity(8.2), 0);
  const r = K.reversals(K.T_MAX);
  assert.strictEqual(r.length, 2 * K.NORMAL.length - 2, '除了 0 與 8.108 以外每個邊界都是一次反轉');
  assert.ok(r.every((t, i) => i === 0 || t > r[i - 1]));
});

test('GDH1 海底深度與熱流：中洋脊 2600 m、4 Ma 時 3330 m；熱流 ∝ 1/√t；深度反推年齡', () => {
  near(K.depth(0), 2600, 1e-9);
  near(K.depth(4), 3330, 1e-9);
  near(K.heatFlow(1) / K.heatFlow(4), 2, 1e-12);
  near(K.heatFlow(4), 255, 1e-9);
  for (const t of [0.3, 2, 7.5]) near(K.ageFromDepth(K.depth(t)), t, 1e-9);
});

test('薄層磁化的公式：和垂直線偶極子的數值積分一致；無限大均勻板沒有外部磁場', () => {
  const m = 10, a = -3, b = 5, d1 = 2.5, d2 = 3, x = 1.3;
  let s = 0; const N = 1500, Nz = 200;
  for (let i = 0; i < N; i++) for (let j = 0; j < Nz; j++) {
    const xp = a + (b - a) * (i + 0.5) / N, z = d1 + (d2 - d1) * (j + 0.5) / Nz, dx = x - xp, r2 = dx * dx + z * z;
    s += (z * z - dx * dx) / (r2 * r2) * ((b - a) / N) * ((d2 - d1) / Nz);
  }
  near(K.blockField(m, a, b, d1, d2, x), K.MU0_2PI * m * s * 1e9, 1e-4, '中點法數值積分（相對誤差約千萬分之一）');
  near(K.blockField(m, -1e9, 1e9, d1, d2, 0.7), 0, 1e-4, '無限大板（寬二十億公里的殘值）');
  // 正上方的磁場：窄塊 ≈ 細長柱，寬塊中央接近 0（只有邊緣有磁異常）
  assert.ok(K.blockField(m, -500, 500, 2.5, 3, 0) < 0.1 * K.blockField(m, -3, 3, 2.5, 3, 0));
});

test('斜頂磁化層的精確解：和數值積分一致；斜率為 0 時就是平板的 atan 公式', () => {
  const num = (x, a, b, dA, dB) => { let t = 0; const N = 200000; for (let i = 0; i < N; i++) { const xp = a + (b - a) * (i + 0.5) / N, d = dA + (dB - dA) * (xp - a) / (b - a), q = xp - x; t += d / (q * q + d * d); } return t * (b - a) / N; };
  for (const c of [[1, -3, 5, 0.1, 0.4], [10, -3, 5, 0.1, 0.9], [-2, 0, 40, 0.2, 1.5], [3, 2, 3, 0.05, 0.06]]) near(K.G(...c), num(...c), 1e-7, c.join(','));
  near(K.G(0.7, -3, 5, 2.5, 2.5) - K.G(0.7, -3, 5, 3, 3), K.F(5 - 0.7, 2.5, 3) - K.F(-3 - 0.7, 2.5, 3), 1e-12);
});

test('對稱擴張產生左右對稱的磁異常；不對稱擴張時同一個邊界的距離比 = 速率比', () => {
  const P = { uL: 2.5, uR: 2.5, tau: 0, zs: 0 }, xs = xsOf(200, 400);
  const r = K.profile(P, xs, 260);
  for (let i = 0; i <= 400; i++) near(r.B[i], r.B[400 - i], 1e-6);
  const Q = { uL: 1.5, uR: 3, tau: 0, zs: 0 };
  near(K.namedAt(Q, 'brunhes', 1)[1] / K.namedAt(Q, 'brunhes', -1)[1], 2, 1e-12);
  near(K.namedAt(P, 'brunhes', 1)[1], 0.781 * 25, 1e-9, '2.5 cm/yr：布容邊界在 19.5 km');
});

test('磁條帶：中洋脊上方（布容正向期）為正異常；深度越深、感測器越高，磁異常越弱越平滑', () => {
  const xs = xsOf(150, 600), P = { uL: 2.5, uR: 2.5, tau: 0, zs: 0 };
  const sea = K.profile(P, xs, 200).B, deep = K.profile(Object.assign({}, P, { zs: 2.3 }), xs, 200).B;
  assert.ok(sea[300] > 100, '海面 ' + sea[300]);
  const amp = B => Math.max.apply(null, B) - Math.min.apply(null, B);
  assert.ok(amp(deep) > 2.5 * amp(sea), '深拖的振幅大很多 ' + amp(deep) + ' / ' + amp(sea));
  // 慢速擴張時海面量不到加拉米佑，深拖量得到（峰數變多）
  const S = { uL: 1, uR: 1, tau: 0, zs: 0 }, xs2 = xsOf(80, 800);
  const n0 = K.peaks(xs2, K.profile(S, xs2, 100).B, 50, 0, 26), n1 = K.peaks(xs2, K.profile(Object.assign({}, S, { zs: 2.4 }), xs2, 100).B, 50, 0, 26);
  assert.ok(n1 > n0, '深拖峰數 ' + n1 + ' > 海面 ' + n0);
});

test('換算成年齡後，不同擴張速率的磁極反轉位置完全一樣（距離 = 速率 × 年齡）', () => {
  // 把距離換成年齡後，兩種速率的反轉位置完全一樣
  [1, 4].forEach(u => {
    const P = { uL: u, uR: u, tau: 0, zs: 0 };
    K.elements(P, 1, u * 80).forEach(e => { assert.ok(Math.abs(e.a / (u * 10) - e.age0) < 1e-9 && Math.abs(e.b / (u * 10) - e.age1) < 1e-9); });
  });
});

test('時間回放：τ Ma 前，離脊 x 的地殼形成於 τ + |x|/u 前；早於 8.108 Ma 的地殼不在年表內', () => {
  const P = { uL: 2, uR: 2, tau: 1, zs: 0 };
  const c = K.crustAt(P, 10);
  near(c.age, 0.5, 1e-12); near(c.born, 1.5, 1e-12);
  assert.strictEqual(c.pol, -1, '1.5 Ma 前是松山反向期');
  assert.strictEqual(K.crustAt({ uL: 2, uR: 2, tau: 0, zs: 0 }, 5).pol, 1);
  assert.ok(!K.crustAt(P, 150).inRecord && K.crustAt(P, 150).pol === 0);
  // τ = 0.9 Ma 前（加拉米佑之前？0.9 在松山反向期）中洋脊正在產生反向地殼
  assert.strictEqual(K.crustAt({ uL: 2, uR: 2, tau: 0.9, zs: 0 }, 0).pol, -1);
  assert.strictEqual(K.crustAt({ uL: 2, uR: 2, tau: 1.03, zs: 0 }, 0).pol, 1);
});

test('分段：一側的段首尾相接、涵蓋到指定距離，每段深度隨年齡增加', () => {
  const P = { uL: 3, uR: 3, tau: 0, zs: 0 };
  const els = K.elements(P, 1, 200);
  near(els[0].a, 0, 1e-12);
  for (let i = 1; i < els.length; i++) { near(els[i].a, els[i - 1].b, 1e-9); near(els[i].dA, els[i - 1].dB, 1e-12, '頂面連續、沒有台階'); assert.ok(els[i].dB > els[i].dA); }
  near(els[0].dA, 2.6, 1e-12); near(els[els.length - 1].dB, K.depth(200 / 30) / 1000, 1e-12);
  near(els[els.length - 1].b, 200, 1e-9);
  const L = K.elements(P, -1, 200);
  near(L[0].b, 0, 1e-12); near(L[L.length - 1].a, -200, 1e-9);
});

test('亞期分辨（固定解析度）：加拉米佑在海面要 1.5 cm/yr 以上，慢速脊要深拖；卡布山（只有 1.2 萬年）一定要貼近海床', () => {
  const R = (u, zs, a, b, prom) => K.resolved({ uL: u, uR: u, tau: 0, zs: zs }, a, b, prom, 1);
  assert.ok(R(2, 0, 0.988, 1.072, 30) && !R(1, 0, 0.988, 1.072, 30), '加拉米佑：2 cm/yr 海面看得到、1 cm/yr 看不到');
  assert.ok(R(1, 1.5, 0.988, 1.072, 30), '1 cm/yr 深拖 1.5 km 看得到');
  assert.ok(!R(2, 0, 1.173, 1.185, 20) && R(2, 2, 1.173, 1.185, 20), '卡布山：2 cm/yr 只有深拖看得到');
  assert.ok(!R(1, 2, 1.173, 1.185, 20) && R(1, 2.5, 1.173, 1.185, 20), '卡布山：1 cm/yr 要貼到 2.5 km');
  assert.strictEqual(R(2, 0, 0.988, 1.072, 30), K.resolved({ uL: 2, uR: 2, tau: 0, zs: 0 }, 0.988, 1.072, 30, -1), '左右對稱');
  assert.ok(!K.resolved({ uL: 2, uR: 2, tau: 1.1, zs: 2 }, 0.988, 1.072, 30, 1), '還沒形成');
});

console.log(`\n${passed} 項通過${process.exitCode ? '（有失敗）' : ''}`);
