// 以 Node 執行：node tests/photoelectric-core.test.js
'use strict';
const assert = require('assert');
const P = require('../js/photoelectric-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1e-300);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
const h = 6.62607015e-34, e = 1.602176634e-19, c = 299792458, me = 9.1093837015e-31;
const LAMBDAS = [100, 150, 200, 254, 300, 365, 400, 436, 500, 546, 589, 650, 800];
const param = (o) => Object.assign({ lambda: 400, phi: 2.28, P: 60e-6, V: 0 }, o);

console.log('photoelectric-core');

test('常數：hc ≈ 1239.84 eV·nm、h/e ≈ 4.1357e-15 V·s', () => {
  close(P.HC_EV_NM, h * c / e * 1e9, 1e-15);
  close(P.HC_EV_NM, 1239.84198, 1e-8);
  close(P.H_OVER_E, 4.135667696e-15, 1e-9);
});

test('光子：f = c/λ、E = hf = hc/λ（400 nm → 3.0996 eV）', () => {
  for (const L of LAMBDAS) {
    const ph = P.photon(L);
    close(ph.f, c / (L * 1e-9), 1e-15, 'f');
    close(ph.EJ, h * ph.f, 1e-15, 'E (J)');
    close(ph.EeV, h * c / (L * 1e-9) / e, 1e-14, 'E (eV)');
    close(P.wavelengthOf(ph.f), L, 1e-14, 'λ');
  }
  close(P.photonEnergyEV(400), 3.0996, 1e-4);
});

test('K_max = hf − φ（eV），V_s = K_max/e', () => {
  for (const m of P.METALS) for (const L of LAMBDAS) {
    const E = h * c / (L * 1e-9) / e;
    const K = P.kmax(L, m.phi);
    if (E > m.phi) {
      close(K, E - m.phi, 1e-12, m.id + ' ' + L);
      close(P.stoppingVoltage(L, m.phi), (K * e) / e, 1e-14, 'V_s');
      // 停止電壓的能量守恆：e·V_s = ½ m v_max²
      const vmax = Math.sqrt(2 * K * e / me);
      close(e * P.stoppingVoltage(L, m.phi), 0.5 * me * vmax * vmax, 1e-12, 'eV_s = ½mv²');
    } else assert.strictEqual(K, 0);
  }
});

test('截止頻率 f0 = φ/h、截止波長 λ0 = hc/φ；f0·λ0 = c', () => {
  for (const m of P.METALS) {
    close(P.thresholdFrequency(m.phi), m.phi * e / h, 1e-15);
    close(P.thresholdWavelength(m.phi), h * c / (m.phi * e) * 1e9, 1e-14);
    close(P.thresholdFrequency(m.phi) * P.thresholdWavelength(m.phi) * 1e-9, c, 1e-14);
  }
  close(P.thresholdWavelength(2.1), 590.40, 1e-4, '銫');
  close(P.thresholdWavelength(4.3), 288.33, 1e-4, '鋅');
});

test('功函數採課本值：Cs 2.1、K 2.3、Na 2.28、Zn 4.3、Cu 4.7、Pt 5.6 eV', () => {
  const want = { Cs: 2.1, K: 2.3, Na: 2.28, Zn: 4.3, Cu: 4.7, Pt: 5.6 };
  assert.strictEqual(P.METALS.length, 6);
  for (const k in want) assert.strictEqual(P.metal(k).phi, want[k]);
});

test('f < f0 時不論光多強、電壓多大都沒有光電流', () => {
  for (const m of P.METALS) {
    const L0 = P.thresholdWavelength(m.phi);
    for (const L of [L0 + 0.01, L0 + 5, 800]) {
      if (L > 800) continue;
      assert.ok(!P.emits(L, m.phi));
      for (const V of [-5, 0, 5]) for (const Pw of [1e-6, 100e-6, 1]) {
        assert.strictEqual(P.current({ lambda: L, phi: m.phi, P: Pw, V: V }), 0);
      }
    }
    assert.ok(P.emits(L0 - 0.01, m.phi), '剛好高於截止頻率就有光電子');
    assert.ok(P.current({ lambda: L0 - 0.01, phi: m.phi, P: 1e-6, V: 5 }) > 0);
  }
});

test('光子數 N = P/(hf)；飽和電流 I_sat = ηeN ∝ 光強度', () => {
  for (const L of [200, 400, 500]) {
    const N = P.photonRate(60e-6, L);
    close(N, 60e-6 / (h * c / (L * 1e-9)), 1e-14);
    const I1 = P.saturationCurrent(20e-6, L, 2.1), I3 = P.saturationCurrent(60e-6, L, 2.1);
    close(I3 / I1, 3, 1e-14, 'P 變 3 倍');
    close(I1, P.ETA * e * P.photonRate(20e-6, L), 1e-14);
  }
  // 同功率時：N ∝ λ（波長越短，每個光子能量越大，光子越少）
  close(P.saturationCurrent(60e-6, 540, 2.1) / P.saturationCurrent(60e-6, 360, 2.1), 1.5, 1e-14);
  assert.strictEqual(P.saturationCurrent(0, 300, 2.1), 0);
});

test('電流在任何電壓下都與光強度成正比（K_max 與光強度無關）', () => {
  for (const V of [-0.7, -0.3, 0, 0.4, 2, 5]) {
    const a = P.current(param({ V, P: 20e-6 })), b = P.current(param({ V, P: 80e-6 }));
    if (a === 0) { assert.strictEqual(b, 0); continue; }
    close(b / a, 4, 1e-12, 'V = ' + V);
  }
  assert.strictEqual(P.kmax(400, 2.28), P.kmax(400, 2.28), 'K_max 不含 P');
});

test('收集比例 F(v)：與暴力二重積分一致（相對誤差 < 1e-4）', () => {
  const g = P.GEOMETRY, wc = g.Wc / g.d, wa = g.Wa / g.d, N = 1500;
  function brute(v) {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const s = (i + 0.5) / N, c2 = 1 - s * s;
      for (let j = 0; j < N; j++) {
        const k = (j + 0.5) / N; if (k * c2 + v <= 0) continue;
        const D = 2 * Math.sqrt(k) * s / (Math.sqrt(k * c2) + Math.sqrt(k * c2 + v));
        sum += Math.max(0, Math.min(wc / 2, wa / 2 - D) - Math.max(-wc / 2, -wa / 2 - D)) / wc;
      }
    }
    return sum / N / N;
  }
  for (const v of [-0.9, -0.5, -0.1, 0, 0.3, 1, 3]) close(P.collectedFraction(v), brute(v), 1e-4, 'v = ' + v);
});

test('V = 0：F 只由幾何決定（Δ = d tan θ）', () => {
  const g = P.GEOMETRY, N = 200000;
  let sum = 0;
  for (let i = 0; i < N; i++) { const s = (i + 0.5) / N; sum += P.overlapFraction(s / Math.sqrt(1 - s * s), g); }
  close(P.collectedFraction(0), sum / N, 1e-5);
  close(P.lateralDrift(0.37, 0.6, 0), 0.6 / 0.8, 1e-14, 'Δ/d = tan θ');
});

test('停止電壓附近的尾巴：F(−1 + x) → (2/3)x^{3/2}', () => {
  for (const x of [1e-3, 1e-4, 1e-5]) close(P.collectedFraction(-1 + x), (2 / 3) * Math.pow(x, 1.5), 2e-3, 'x = ' + x);
});

test('電流對電壓單調不減；V ≤ −V_s 時為 0，V > −V_s 時大於 0', () => {
  for (const [L, phi] of [[400, 2.28], [250, 2.1], [200, 4.3], [150, 5.6], [580, 2.1]]) {
    const Vs = P.stoppingVoltage(L, phi);
    let prev = -1;
    for (let V = -5; V <= 5.0001; V += 0.01) {
      const I = P.current({ lambda: L, phi, P: 50e-6, V });
      assert.ok(I >= prev - 1e-18, `λ = ${L}、V = ${V.toFixed(2)} 時電流變小`);
      if (V <= -Vs - 1e-9) assert.strictEqual(I, 0, `V = ${V} ≤ −V_s 應為 0`);
      if (V > -Vs + 1e-6) assert.ok(I > 0, `V = ${V} > −V_s 應大於 0`);
      prev = I;
    }
  }
});

test('飽和：V ≥ K_max·(4d/(Wa−Wc))² 時所有光電子都到達陽極，I = I_sat', () => {
  const g = P.GEOMETRY, vFull = Math.pow(4 * g.d / (g.Wa - g.Wc), 2);
  const p = param({ lambda: 500, phi: 2.1 });
  const K = P.kmax(p.lambda, p.phi);
  close(P.current(Object.assign({}, p, { V: K * vFull * 1.0001 })), P.saturationCurrent(p.P, p.lambda, p.phi), 1e-14);
  assert.ok(P.collectedFraction(vFull * 0.999) > 1 - 1e-6);
  assert.ok(P.collectedFraction(1) < 0.99, 'v = 1 時還沒飽和（側向飛出的電子沒被收集）');
  assert.ok(P.current(param({ V: 0 })) < P.current(param({ V: 1 })), 'V > 0 時電流隨 V 增加，趨近飽和');
});

test('單一電子：能量守恆、到達條件與側向位移公式一致', () => {
  const g = P.GEOMETRY;
  for (const V of [-1.5, -0.4, 0, 0.8, 3]) for (const K of [0.2, 0.9, 2.4]) for (const s of [-0.9, -0.3, 0, 0.5, 0.97]) {
    const e0 = { y0: 0.002, K, s };
    const F = P.electronFate(e0, V, g);
    // 能量守恆：½mv² − eV·x/d = K
    for (const t of [0, F.tEnd * 0.3, F.tEnd * 0.8, F.tEnd]) {
      const q = P.electronAt(F, e0, t);
      close(0.5 * me * (q.vx * q.vx + q.vy * q.vy) - e * V * q.x / g.d, K * e, 1e-9, '能量');
    }
    const end = P.electronAt(F, e0, F.tEnd);
    const kn = K * (1 - s * s);
    assert.strictEqual(F.reaches, kn + V > 0, '到達條件 K cos²θ > −eV');
    if (F.reaches) {
      close(end.x, g.d, 1e-9, '到達陽極平面');
      close((end.y - e0.y0) / g.d, P.lateralDrift(K / 1, s, V), 1e-9, 'Δ（以 K=1 eV 為單位）');
      close((end.y - e0.y0) / g.d, P.lateralDrift(K / 2, s, V / 2), 1e-9, 'Δ 只和 V/K 有關');
    } else {
      // 減速時折返：最遠到 x_max = d·K cos²θ/(e|V|)
      if (F.tEnd > 0) {
        assert.ok(Math.abs(end.x) < 1e-12, '回到陰極');
        const mid = P.electronAt(F, e0, F.tEnd / 2);
        close(mid.x, g.d * kn / -V, 1e-9, 'x_max');
      }
    }
  }
});

test('逐步前進（動畫用）與解析解一致：到達陽極的位置、時間與命中與否', () => {
  const g = P.GEOMETRY;
  for (const V of [-1.2, -0.3, 0, 0.5, 4]) for (const K of [0.35, 1.1, 2.5]) for (const s of [-0.95, -0.4, 0, 0.3, 0.8]) {
    const e0 = { y0: -0.004, K, s };
    const F = P.electronFate(e0, V, g);
    let st = P.electronStart(e0), t = 0, ev = null;
    const a = P.accelOf(V, g), dt = 1.3e-10;
    for (let i = 0; i < 100000 && !ev; i++) { const r = P.stepElectron(st, a, dt, g); st = r.st; t += r.t; ev = r.event; }
    if (F.tEnd === 0) continue;
    close(t, F.tEnd, 1e-9, '時間');
    if (F.reaches) {
      assert.strictEqual(ev, F.hit ? 'anode' : 'miss');
      close(st.y, F.yEnd, 1e-9, 'y');
    } else assert.strictEqual(ev, 'cathode');
  }
});

test('中途改變電壓：分段精確解滿足能量守恆（板間電位能 −eVx/d）', () => {
  const g = P.GEOMETRY;
  let st = P.electronStart({ y0: 0, K: 1.5, s: 0.2 });
  const step = (V, dt) => { const r = P.stepElectron(st, P.accelOf(V, g), dt, g); st = r.st; return r; };
  step(-0.5, 2e-9);
  const E1 = 0.5 * me * (st.vx ** 2 + st.vy ** 2) - e * (-0.5) * st.x / g.d;
  close(E1, 1.5 * e, 1e-9);
  step(2, 1e-9);
  const E2 = 0.5 * me * (st.vx ** 2 + st.vy ** 2) - e * 2 * st.x / g.d;
  // 在 V 改變的瞬間，動能不變、電位能跳變：E2 = K(切換時) − e·2·x(切換時)/d + …，只需檢查第二段內守恆
  const r = step(2, 3e-10);
  if (!r.event) close(0.5 * me * (st.vx ** 2 + st.vy ** 2) - e * 2 * st.x / g.d, E2, 1e-9);
});

test('隨機抽樣的電子：到達陽極的比例 ≈ F(V/K_max)（蒙地卡羅）', () => {
  let seed = 12345; // mulberry32
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const g = P.GEOMETRY, Kmax = 1.2;
  for (const V of [-0.6, 0, 0.6]) {
    let hit = 0; const N = 40000;
    for (let i = 0; i < N; i++) {
      const e0 = { y0: (rnd() - 0.5) * g.Wc, K: rnd() * Kmax, s: rnd() * 2 - 1 };
      if (P.electronFate(e0, V, g).hit) hit++;
    }
    const F = P.collectedFraction(V / Kmax), sigma = Math.sqrt(F * (1 - F) / N);
    assert.ok(Math.abs(hit / N - F) < 4 * sigma, `V = ${V}：${hit / N} vs ${F}`);
  }
});

test('密立坎圖：V_s 對 f 的直線斜率 = h/e，f 軸截距 = f0，V 軸截距 = −φ', () => {
  for (const m of P.METALS) {
    const L0 = P.thresholdWavelength(m.phi);
    const pts = [0.95, 0.8, 0.7, 0.6].map(r => r * L0).filter(L => L >= 100 && P.stoppingVoltage(L, m.phi) <= 5)
      .map(L => ({ f: P.frequency(L), Vs: P.stoppingVoltage(L, m.phi) }));
    assert.ok(pts.length >= 2);
    const F = P.millikanFit(pts);
    close(F.slope, h / e, 1e-10, m.id + ' 斜率');
    close(F.h, h, 1e-10, m.id + ' h');
    close(F.f0, P.thresholdFrequency(m.phi), 1e-10, m.id + ' f0');
    close(F.phi, m.phi, 1e-10, m.id + ' φ');
  }
  assert.strictEqual(P.millikanFit([{ f: 1e15, Vs: 1 }]), null);
});

test('記錄停止電壓的檢查：只有在電流剛好歸零的電壓才接受', () => {
  const p = param({ lambda: 300, phi: 2.1, P: 60e-6 });
  const Vs = P.stoppingVoltage(p.lambda, p.phi); // 2.0328 V
  // 由 0 往負方向每 0.01 V 找第一個電流歸零的電壓
  let V = 0;
  while (!P.isZeroCurrent(P.current(Object.assign({}, p, { V })))) V = Math.round((V - 0.01) * 100) / 100;
  assert.strictEqual(P.stopCheck(Object.assign({}, p, { V })), 'ok');
  assert.ok(Math.abs(-V - Vs) < 0.02, `測得 ${-V}、理論 ${Vs}`);
  assert.strictEqual(P.stopCheck(Object.assign({}, p, { V: V + 0.01 })), 'notZero');
  assert.strictEqual(P.stopCheck(Object.assign({}, p, { V: -4 })), 'notEdge');
  assert.strictEqual(P.stopCheck(Object.assign({}, p, { lambda: 700 })), 'noEmission');
  assert.strictEqual(P.stopCheck(Object.assign({}, p, { P: 0 })), 'noLight');
  assert.strictEqual(P.stopCheck(Object.assign({}, p, { lambda: 120, V: -5 })), 'outOfRange');
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗項目' : ''));
