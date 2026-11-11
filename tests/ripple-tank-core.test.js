// 以 Node 執行：node tests/ripple-tank-core.test.js
'use strict';
const assert = require('assert');
const RC = require('../js/ripple-tank-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}，得到 ${a}（容許 ${tol}）`);
}
function rel(a, b) { return Math.abs(a / b - 1); }
const D = Math.PI / 180;
const T = RC.TANK;

/** 標準水波槽場景（直線起波器在左邊、海綿、水深 8 mm） */
function scene(extra) {
  return Object.assign({ W: T.W, H: T.H, f: 10, h: 0.008, sponge: true, amp: 0.08,
    source: { type: 'bar', x: T.bar, y0: 0, y1: T.H }, solids: [], plate: null }, extra || {});
}
/** 跑到穩定（seconds 秒）再鎖相量測 periods 個週期 */
function steady(sim, seconds, periods) {
  sim.step(Math.round(seconds / sim.dt));
  const L = RC.createLockIn(sim);
  L.run(periods || 5);
  return L;
}

console.log('ripple-tank-core');

// ---------------------------------------------------------------- 色散關係
test('深水重力波極限：σ = 0、kh ≫ 1 時 ω² = g k，v = g/ω', () => {
  const o = { sigma: 0 };
  for (const f of [1, 2, 5]) {
    const h = 3, v = RC.phaseSpeed(f, h, o);
    assert.ok(rel(v, RC.G / (2 * Math.PI * f)) < 1e-6, `f=${f}`);
  }
});

test('淺水極限：σ = 0、kh ≪ 1 時波速 → √(g h)，與頻率無關', () => {
  const o = { sigma: 0 };
  for (const h of [0.002, 0.005, 0.01]) for (const f of [0.05, 0.1]) {
    const v = RC.phaseSpeed(f, h, o);
    assert.ok(rel(v, Math.sqrt(RC.G * h)) < 2e-3, `h=${h} f=${f}：${v} vs ${Math.sqrt(RC.G * h)}`);
  }
});

test('純表面張力波（g = 0、深水）：ω² = σ k³ / ρ', () => {
  const o = { g: 0 };
  for (const f of [20, 50, 100]) {
    const k = RC.waveNumber(f, 1, o);
    close((2 * Math.PI * f) ** 2, RC.SIGMA * k ** 3 / RC.RHO, 1e-6 * (2 * Math.PI * f) ** 2, `f=${f}`);
  }
});

test('waveNumber 是 omegaOf 的反函數', () => {
  for (const f of [5, 7.5, 10, 14, 20]) for (const h of [0.0008, 0.002, 0.005, 0.012]) {
    const k = RC.waveNumber(f, h);
    close(RC.omegaOf(k, h), 2 * Math.PI * f, 1e-9, `f=${f} h=${h}`);
    close(RC.phaseSpeed(f, h), 2 * Math.PI * f / k, 1e-12);
  }
});

test('同一頻率下水愈深、波速愈快、波長愈長；淺水區（壓克力板上方）波速較慢', () => {
  for (const f of [5, 10, 20]) {
    let prev = 0;
    for (let h = 0.0005; h <= 0.02; h += 0.0005) {
      const v = RC.phaseSpeed(f, h);
      assert.ok(v > prev, `f=${f} h=${h}`);
      prev = v;
    }
    assert.ok(RC.phaseSpeed(f, 0.002) < RC.phaseSpeed(f, 0.008));
  }
});

test('水波槽的典型數值：10 Hz、水深 8 mm → λ ≈ 2.34 cm、v ≈ 23.4 cm/s；水深 2 mm → λ ≈ 1.80 cm', () => {
  close(RC.wavelength(10, 0.008) * 100, 2.336, 0.01);
  close(RC.phaseSpeed(10, 0.008) * 100, 23.36, 0.1);
  close(RC.wavelength(10, 0.002) * 100, 1.798, 0.01);
  // 頻率愈高波長愈短（低頻時淺水效應較明顯：v2/v1 較小）
  assert.ok(RC.phaseSpeed(5, 0.002) / RC.phaseSpeed(5, 0.008) < RC.phaseSpeed(20, 0.002) / RC.phaseSpeed(20, 0.008));
});

test('群速度：重力波深水 v_g = v/2，毛細波 v_g = 3v/2', () => {
  close(RC.groupSpeed(2, 5, { sigma: 0 }) / RC.phaseSpeed(2, 5, { sigma: 0 }), 0.5, 1e-4);
  close(RC.groupSpeed(80, 1, { g: 0 }) / RC.phaseSpeed(80, 1, { g: 0 }), 1.5, 1e-4);
});

// ---------------------------------------------------------------- 幾何關係
test('司乃耳定律 sinθ1/sinθ2 = v1/v2，與臨界角', () => {
  for (const a of [10, 30, 50, 70]) {
    const t2 = RC.snell(a * D, 0.234, 0.18);
    close(Math.sin(a * D) / Math.sin(t2), 0.234 / 0.18, 1e-12);
    assert.ok(t2 < a * D, '進入淺水（較慢）偏向法線');
  }
  close(RC.criticalAngle(0.18, 0.234), Math.asin(0.18 / 0.234), 1e-12);
  assert.ok(Number.isNaN(RC.snell(60 * D, 0.18, 0.234)), '由淺水射向深水、超過臨界角 → 全反射');
  assert.ok(Number.isNaN(RC.criticalAngle(0.234, 0.18)));
});

test('投影放大率 M = (L + d)/L；平行光 M = 1；L → ∞ 時 M → 1', () => {
  close(RC.magnification(0.5, 0.25), 1.5, 1e-12);
  close(RC.magnification(1, 0.25), 1.25, 1e-12);
  assert.strictEqual(RC.magnification(Infinity, 0.25), 1);
  assert.ok(RC.magnification(1e6, 0.25) - 1 < 1e-6);
});

test('兩點波源的節線數 = 2⌊d/λ + ½⌋，與逐條計數（|Δ| = (n − ½)λ < d）一致', () => {
  for (let d = 0.2; d <= 6; d += 0.137) {
    let n = 0;
    for (let m = 1; (m - 0.5) < d; m++) n += 2;
    assert.strictEqual(RC.nodalLineCount(d, 1), n, `d/λ=${d}`);
    let a = 1;
    for (let m = 1; m <= d; m++) a += 2;
    assert.strictEqual(RC.antinodalLineCount(d, 1), a);
  }
});

test('最小平方法：過原點斜率與一般直線', () => {
  const xs = [1, 2, 3, 4], ys = xs.map((x) => 2.5 * x);
  close(RC.fitThroughOrigin(xs, ys).m, 2.5, 1e-12);
  close(RC.fitThroughOrigin(xs, ys).r2, 1, 1e-12);
  const f = RC.fitLine(xs, xs.map((x) => -0.5 * x + 3));
  close(f.m, -0.5, 1e-12); close(f.b, 3, 1e-12);
  assert.strictEqual(RC.fitLine([1], [2]), null);
});

test('場景幾何：長方塊、圓弧、壓克力板的內外判斷與水深', () => {
  const r = { kind: 'rect', cx: 0.2, cy: 0.1, len: 0.1, thick: 0.01, ang: 90 * D };
  assert.ok(RC.inRect(r, 0.2, 0.14) && !RC.inRect(r, 0.2, 0.16) && !RC.inRect(r, 0.21, 0.1));
  const a = { kind: 'arc', cx: 0, cy: 0, R: 0.1, half: 30 * D, thick: 0.01, ang: 0 };
  assert.ok(RC.inArc(a, 0.1, 0) && RC.inArc(a, 0.1 * Math.cos(25 * D), 0.1 * Math.sin(25 * D)) && !RC.inArc(a, 0.1 * Math.cos(35 * D), 0.1 * Math.sin(35 * D)));
  const sc = scene({ plate: { cx: 0.2, cy: 0.135, w: 0.1, len: 0.6, ang: 0, h2: 0.002 } });
  close(RC.depthAt(sc, 0.2, 0.1), 0.002, 1e-12);
  close(RC.depthAt(sc, 0.1, 0.1), 0.008, 1e-12);
  const tilted = scene({ tiltX: Math.atan(0.01) });
  close(RC.depthAt(tilted, T.W, 0.1) - RC.depthAt(tilted, 0, 0.1), 0.01 * T.W, 1e-12);
});

// ---------------------------------------------------------------- 數值解
test('數值解：方格與時間步長（一週期整數步、Courant 數 < 1/√2、最短波長至少 10 格）', () => {
  for (const f of [5, 10, 20]) {
    const sim = RC.createSim(scene({ f, plate: { cx: 0.2, cy: 0.135, w: 0.1, len: 0.6, ang: 0, h2: 0.002 } }));
    close(sim.dt * sim.stepsPerPeriod, 1 / f, 1e-12);
    let cmax = 0;
    for (let k = 0; k < sim.c2.length; k++) cmax = Math.max(cmax, Math.sqrt(sim.c2[k]));
    assert.ok(cmax * sim.dt / sim.dx < 1 / Math.SQRT2, `f=${f} Courant ${cmax * sim.dt / sim.dx}`);
    assert.ok(sim.ppw >= 10, `f=${f} 每波長 ${sim.ppw} 格`);
    assert.ok(sim.nx * sim.ny <= 90000 * 1.02);
  }
});

test('數值解：無阻尼、無起波器時，離散能量守恆（蛙跳法）', () => {
  const sim = RC.createSim(scene({ sponge: false, source: { type: 'none' } }), { filter: 0 });
  for (let k = 0; k < sim.sigma.length; k++) { sim.A[k] = sim.solid[k] ? 0 : 2; sim.B[k] = sim.solid[k] ? 0 : 1; sim.Dc[k] = sim.solid[k] ? 0 : 1; }
  // 中央一個高斯水丘
  for (let j = 1; j <= sim.ny; j++) for (let i = 1; i <= sim.nx; i++) {
    const x = sim.xOf(i), y = sim.yOf(j), r2 = ((x - 0.18) ** 2 + (y - 0.13) ** 2) / (0.012 ** 2);
    sim.u[j * sim.NX + i] = sim.up[j * sim.NX + i] = 0.1 * Math.exp(-r2);
  }
  sim.step(1);
  const E0 = RC.discreteEnergy(sim);
  sim.step(800);
  const E1 = RC.discreteEnergy(sim);
  assert.ok(E0 > 0 && rel(E1, E0) < 2e-3, `E0=${E0} E1=${E1}`);
});

test('數值解：深水區平面波的波長等於色散關係的波長（5、10、15 Hz，誤差 < 0.6%）', () => {
  for (const f of [5, 10, 15]) {
    const sim = RC.createSim(scene({ f }));
    const L = steady(sim, 2.2, 5);
    const wv = RC.waveVector(sim, L, { x0: 0.1, x1: 0.26, y0: 0.1, y1: 0.17 });
    assert.ok(rel(wv.lambda, RC.wavelength(f, 0.008)) < 0.006, `f=${f}：${wv.lambda} vs ${RC.wavelength(f, 0.008)}`);
    assert.ok(Math.abs(wv.dir) < 0.3 * D, '直線起波器的波沿 +x 方向前進');
  }
});

test('海綿（吸收層 PML）：正向入射的反射係數 < 2%（5–15 Hz）', () => {
  for (const f of [5, 8, 10, 15]) {
    const sim = RC.createSim(scene({ f }));
    const L = steady(sim, 2.5, 5);
    // 中線上 U(x) = a e^{ikx} + b e^{−ikx}，最小平方求 |b/a|
    const k = RC.waveNumber(f, 0.008);
    let A12r = 0, A12i = 0, n = 0, r1r = 0, r1i = 0, r2r = 0, r2i = 0;
    for (let x = 0.11; x <= 0.27; x += sim.dx) {
      const idx = sim.index(x, T.H / 2), U = L.at(idx), xc = sim.xOf(idx % sim.NX);
      const c = Math.cos(k * xc), s = Math.sin(k * xc);
      n++; A12r += Math.cos(2 * k * xc); A12i -= Math.sin(2 * k * xc);
      r1r += c * U[0] + s * U[1]; r1i += c * U[1] - s * U[0];
      r2r += c * U[0] - s * U[1]; r2i += c * U[1] + s * U[0];
    }
    const det = n * n - (A12r * A12r + A12i * A12i);
    const ar = (n * r1r - (A12r * r2r - A12i * r2i)) / det, ai = (n * r1i - (A12r * r2i + A12i * r2r)) / det;
    const br = (n * r2r - (A12r * r1r + A12i * r1i)) / det, bi = (n * r2i - (A12r * r1i - A12i * r1r)) / det;
    const R = Math.hypot(br, bi) / Math.hypot(ar, ai);
    assert.ok(R < 0.06, `f=${f} 反射係數 ${R.toFixed(3)}`);
  }
});

test('海綿（吸收層 PML）不影響沿槽壁前進的直線波：波前筆直、振幅均勻（5、10 Hz）', () => {
  for (const f of [5, 10]) {
    const sim = RC.createSim(scene({ f }));
    const L = steady(sim, 4, 2);
    const lam = RC.wavelength(f, 0.008);
    for (const x of [0.15, 0.3]) {
      const ph = [], am = [];
      for (let y = 0.035; y <= 0.236; y += 0.02) {
        const U = L.at(sim.index(x, y));
        ph.push(Math.atan2(U[1], U[0])); am.push(Math.hypot(U[0], U[1]));
      }
      const p0 = ph[5];
      const dev = Math.max.apply(null, ph.map(p => Math.abs(RC.wrapPi(p - p0)))) / (2 * Math.PI) * lam;
      assert.ok(dev < 0.0008, `f=${f} x=${x} 波前彎曲 ${(dev * 1000).toFixed(2)} mm`);
      assert.ok(Math.min.apply(null, am) / Math.max.apply(null, am) > 0.95, `f=${f} x=${x} 振幅不均勻`);
    }
  }
});

// 反射與折射用較大的水槽（0.64 m × 0.48 m）與 15 Hz，量測區離障礙物的端點與槽壁夠遠
const BIG = { W: 0.64, H: 0.48 };
const BIGOPT = { maxCells: 400000, ppw: 10 };
function bigScene(extra) {
  return Object.assign(scene(Object.assign({ f: 15 }, BIG)), { source: { type: 'bar', x: 0.04, y0: 0, y1: BIG.H } }, extra || {});
}
const bigRef = (function () {
  const sim = RC.createSim(bigScene(), BIGOPT);
  return { sim: sim, L: steady(sim, 1.9, 4) };
})();

test('數值解：直線波遇到直線障礙物，反射角 = 入射角（20°、35°，誤差 < 0.6°）', () => {
  for (const b of [20, 35]) {
    const cx = 0.41, cy = BIG.H / 2;
    const wall = { kind: 'rect', cx: cx, cy: cy, len: 1.2, thick: 0.012, ang: (90 + b) * D };
    const sim = RC.createSim(bigScene({ solids: [wall] }), BIGOPT);
    const L = steady(sim, 1.9, 4);
    // 扣掉沒有障礙物時的入射波，只留下反射波
    const n = [Math.cos(b * D), Math.sin(b * D)];
    const px = cx - 0.1 * n[0], py = cy - 0.1 * n[1];
    const wv = RC.waveVector(sim, L, { x0: px - 0.04, x1: px + 0.04, y0: py - 0.04, y1: py + 0.04 }, bigRef.L);
    // 反射波與法線（−n）的夾角
    const thr = Math.acos(-(Math.cos(wv.dir) * n[0] + Math.sin(wv.dir) * n[1])) / D;
    close(thr, b, 0.6, `β=${b}°`);
    assert.ok(rel(wv.lambda, RC.wavelength(15, 0.008)) < 0.015, '反射後波長不變');
  }
});

test('數值解：直線波斜射進入淺水區，遵守司乃耳定律（30°、45°，誤差 < 0.8°），淺水區波長 = 色散關係', () => {
  for (const a of [30, 45]) {
    const plate = { cx: 0.38, cy: BIG.H / 2, w: 0.26, len: 1.4, ang: a * D, h2: 0.002 };
    const sim = RC.createSim(bigScene({ plate: plate }), BIGOPT);
    const L = steady(sim, 1.9, 4);
    const wv = RC.waveVector(sim, L, { x0: 0.34, x1: 0.42, y0: BIG.H / 2 - 0.05, y1: BIG.H / 2 + 0.05 });
    const v1 = RC.phaseSpeed(15, 0.008), v2 = RC.phaseSpeed(15, 0.002);
    const th2 = (a * D - wv.dir) / D;
    close(th2, RC.snell(a * D, v1, v2) / D, 0.8, `α=${a}°`);
    assert.ok(rel(wv.lambda, RC.wavelength(15, 0.002)) < 0.012, `淺水區波長 ${wv.lambda} vs ${RC.wavelength(15, 0.002)}`);
  }
});

test('數值解：凹面圓弧把直線波會聚在 R/2 附近（15 Hz、R = 14 cm，誤差 < 10%）', () => {
  const R = 0.14, vx = 0.31, half = Math.asin(0.08 / R);
  const arc = { kind: 'arc', cx: vx - R, cy: T.H / 2, R: R, half: half, thick: 0.008, ang: 0 };
  const sim = RC.createSim(scene({ f: 15, solids: [arc] }));
  const L = steady(sim, 2.2, 5);
  let best = 0, bx = 0;
  for (let x = 0.1; x < vx - 0.01; x += 0.001) {
    const a = L.at(sim.index(x, T.H / 2)), A = Math.hypot(a[0], a[1]);
    if (A > best) { best = A; bx = x; }
  }
  assert.ok(Math.abs((vx - bx) / (R / 2) - 1) < 0.1, `會聚點距頂點 ${(vx - bx).toFixed(3)} m，R/2 = ${R / 2}`);
  assert.ok(best > 2.5 * 0.08, '焦點附近振幅明顯變大');
});

test('數值解：兩個同相點波源，節線（|Δ| = λ/2）上的振幅遠小於腹線（Δ = 0）', () => {
  const d = 0.06, f = 10, lam = RC.wavelength(f, 0.008);
  const sx = 0.1, sy = T.H / 2;
  const sim = RC.createSim(scene({ f, source: { type: 'pair', x: sx, y: sy, d: d } }));
  const L = steady(sim, 2.2, 5);
  // 距離中點 r = 0.15 m 的圓上找 |PS1 − PS2| = λ/2 的點（節線）與中垂線上的點（腹線）
  function amp(x, y) { const a = L.at(sim.index(x, y)); return Math.hypot(a[0], a[1]); }
  function delta(th) { const x = sx + 0.15 * Math.cos(th), y = sy + 0.15 * Math.sin(th); return Math.hypot(x - sx, y - sy + d / 2) - Math.hypot(x - sx, y - sy - d / 2); }
  let lo = 0, hi = Math.PI / 2;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (delta(m) < lam / 2) lo = m; else hi = m; }
  const thN = lo;
  const aNode = amp(sx + 0.15 * Math.cos(thN), sy + 0.15 * Math.sin(thN));
  const aAnti = amp(sx + 0.15, sy);
  assert.ok(aNode < 0.25 * aAnti, `節線 ${aNode.toFixed(4)}、腹線 ${aAnti.toFixed(4)}`);
  assert.strictEqual(RC.nodalLineCount(d, lam), 6);
});

test('投影：波峰（∇²u < 0，向上凸）在白紙上是亮紋（I > 1），波谷是暗紋（I < 1）', () => {
  const sim = RC.createSim(scene({ source: { type: 'none' }, sponge: false }));
  const k = RC.waveNumber(10, 0.008);
  for (let j = 1; j <= sim.ny; j++) for (let i = 1; i <= sim.nx; i++) sim.u[j * sim.NX + i] = 0.05 * Math.cos(k * sim.xOf(i));
  const I = RC.intensity(sim, null, RC.kappaOf(0.25), new Float32Array(sim.NX * sim.NY));
  const jm = Math.round(sim.ny / 2);
  for (let i = 5; i < sim.nx - 5; i++) {
    const c = Math.cos(k * sim.xOf(i));
    if (c > 0.9) assert.ok(I[jm * sim.NX + i] > 1.05, '波峰 → 亮');
    if (c < -0.9) assert.ok(I[jm * sim.NX + i] < 0.95, '波谷 → 暗');
  }
  // 弱波時 I ≈ 1 − κ∇²u
  const kap = RC.kappaOf(0.25), small = 0.001;
  for (let j = 1; j <= sim.ny; j++) for (let i = 1; i <= sim.nx; i++) sim.u[j * sim.NX + i] = small * Math.cos(k * sim.xOf(i));
  RC.intensity(sim, null, kap, I);
  const i0 = Math.round(sim.nx / 2), lapAnalytic = -small * 1e-3 * (2 - 2 * Math.cos(k * sim.dx)) / (sim.dx * sim.dx) * Math.cos(k * sim.xOf(i0));
  close(I[jm * sim.NX + i0], 1 - kap * lapAnalytic, 2e-4);
});

test('閃頻取樣：同一相位（每隔一個週期）取到的水面相同；起波器可以關掉', () => {
  const sim = RC.createSim(scene({ source: { type: 'point', x: 0.15, y: 0.13 } }));
  sim.step(sim.stepsPerPeriod * 30); // 穩定
  const N = sim.NX * sim.NY, a = new Float32Array(N), b = new Float32Array(N);
  sim.snapshot(a, sim.t);
  sim.step(sim.stepsPerPeriod);
  sim.snapshot(b, sim.t);
  let diff = 0, mag = 0;
  for (let k = 0; k < N; k++) { diff = Math.max(diff, Math.abs(a[k] - b[k])); mag = Math.max(mag, Math.abs(a[k])); }
  assert.ok(diff < 0.02 * mag, `差 ${diff} / ${mag}`);
  sim.setDriving(false);
  const s0 = sim.src[0];
  sim.step(3);
  const v = sim.u[s0];
  sim.step(1);
  assert.ok(v !== sim.drive(sim.t), '關掉後波源格子自由運動');
});

test('移動障礙物（setGeometry）不改變方格與時間步長，水面保留、障礙物裡的水面為 0', () => {
  const bar = { kind: 'rect', cx: 0.25, cy: 0.135, len: 0.12, thick: 0.012, ang: 100 * D };
  const sim = RC.createSim(scene({ solids: [bar] }));
  sim.step(300);
  const nx = sim.nx, dt = sim.dt, k = sim.index(0.12, 0.13), before = sim.u[k];
  const moved = Object.assign({}, bar, { cx: 0.2 });
  sim.setGeometry(scene({ solids: [moved] }));
  assert.strictEqual(sim.nx, nx); assert.strictEqual(sim.dt, dt);
  assert.strictEqual(sim.u[k], before);
  assert.strictEqual(sim.u[sim.index(0.2, 0.135)], 0);
});

console.log(`ripple-tank-core：${passed} 項通過`);
