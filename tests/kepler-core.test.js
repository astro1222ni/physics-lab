// 以 Node 執行：node tests/kepler-core.test.js
'use strict';
const assert = require('assert');
const K = require('../js/kepler-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
/** 相對誤差比較；ref 給定時以 ref 為尺度（用於本來應為 0 的量） */
function close(a, b, tol, msg, ref) {
  const s = ref != null ? ref : Math.max(Math.abs(a), Math.abs(b));
  assert.ok(Math.abs(a - b) <= tol * s, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}

const MU = K.GM_SUN, AU = K.AU;
const vc1 = K.circularSpeed(MU, AU);
// 各種發射條件：[r0 (AU), φ0, v0 / v圓, α (度), mu 倍數]
const LAUNCHES = [
  [1, 0, 1, 0, 1],          // 圓
  [1, 0.3, 1.18, 0, 1],     // 橢圓（從近日點出發）
  [1.5, 2.1, 0.8, 0, 1],    // 橢圓（從遠日點出發）
  [0.7, -1.2, 1.1, 35, 2],  // 斜向發射的橢圓
  [1.2, 4, 0.95, -60, 0.5], // 大仰角
  [1, 1, Math.SQRT2, 20, 1],// 拋物線（剛好脫離速率）
  [0.5, 0.7, 1.7, 10, 1],   // 雙曲線
  [2, -2.5, 2.5, -40, 3],   // 雙曲線（朝內斜飛）
  [1, 0.4, 1.2, 170, 1],    // 逆行（順時針）橢圓
  [1, 0.4, 0.9999, 0, 1],   // 非常接近圓
  [1, 0, 1.414, 0, 1]       // 非常接近拋物線的橢圓
];
function make(L) {
  const mu = MU * L[4], r0 = L[0] * AU;
  const v0 = L[2] * K.circularSpeed(mu, r0);
  const s = K.launchState(r0, L[1], v0, L[3] * Math.PI / 180);
  return { mu: mu, s: s, el: K.elementsFromState(mu, s.x, s.y, s.vx, s.vy) };
}
function timesFor(el) {
  const T = isFinite(el.T) ? el.T : 2 * Math.PI * Math.sqrt(el.rp * el.rp * el.rp / el.mu);
  return [0, 0.013, 0.21, 0.5, 0.77, 1.3, 2.9, -0.4].map(function (f) { return f * T; });
}

console.log('kepler-core');

test('圓周速率 v = √(GM/r)、脫離速率 = √2 · v圓、地球繞日 ≈ 29.8 km/s', () => {
  close(vc1, 29784.7, 1e-4, '地球公轉速率');
  close(K.escapeSpeed(MU, AU), Math.SQRT2 * vc1, 1e-15, 'v脫 = √2 v圓');
  close(K.circularSpeed(K.GM_EARTH, K.R_EARTH), 7909.8, 1e-4, '第一宇宙速度');
  close(K.escapeSpeed(K.GM_EARTH, K.R_EARTH), 11186, 1e-4, '第二宇宙速度');
});

test('發射狀態：α = 0 時速度垂直於半徑，|v| = v0', () => {
  for (const phi of [0, 0.7, 2, -2.9]) {
    const s = K.launchState(2, phi, 3, 0);
    close(Math.hypot(s.x, s.y), 2, 1e-15, '|r|');
    close(Math.hypot(s.vx, s.vy), 3, 1e-15, '|v|');
    close(s.x * s.vx + s.y * s.vy, 0, 1e-14, 'r·v', 6);
    assert.ok(s.x * s.vy - s.y * s.vx > 0, 'α = 0 為逆時針');
  }
  const s = K.launchState(1, 0, 1, Math.PI / 6);
  close(s.vx, 0.5, 1e-15, 'α = 30° 的徑向分量 v sin α');
});

test('v = √(GM/r) 且水平發射 → e ≈ 0（圓），a = r，T = 2π√(r³/GM)', () => {
  for (const [r, mu] of [[AU, MU], [0.4 * AU, 3 * MU], [7e6, K.GM_EARTH], [4.2164e7, K.GM_EARTH]]) {
    const s = K.launchState(r, 1.1, K.circularSpeed(mu, r), 0);
    const el = K.elementsFromState(mu, s.x, s.y, s.vx, s.vy);
    assert.ok(el.e < 1e-12, 'e = ' + el.e);
    assert.strictEqual(el.type, 'circle');
    close(el.a, r, 1e-12, 'a');
    close(el.T, 2 * Math.PI * Math.sqrt(r * r * r / mu), 1e-12, 'T');
    for (const t of timesFor(el)) close(K.stateAt(el, t).r, r, 1e-12, '距離不變');
  }
});

test('v = √(2GM/r) → 拋物線 e = 1，比能量 = 0，a = ∞', () => {
  for (const alpha of [0, 0.4, -1.1]) {
    const s = K.launchState(AU, 0.5, K.escapeSpeed(MU, AU), alpha);
    const el = K.elementsFromState(MU, s.x, s.y, s.vx, s.vy);
    close(el.e, 1, 1e-12, 'e');
    assert.strictEqual(el.type, 'parabola');
    assert.strictEqual(el.a, Infinity);
    close(el.energy, 0, 1e-12, 'ε', vc1 * vc1);
    // 拋物線上 v² r = 2GM 處處成立
    for (const t of [0, 1e6, 3e7, -2e7]) {
      const q = K.stateAt(el, t);
      close(q.v * q.v * q.r, 2 * MU, 1e-11, 'v² r = 2GM');
    }
  }
});

test('速率分界：v < v脫 為橢圓（ε < 0），v > v脫 為雙曲線（ε > 0）', () => {
  const ve = K.escapeSpeed(MU, AU);
  for (const [f, type] of [[0.6, 'ellipse'], [0.999, 'ellipse'], [1.001, 'hyperbola'], [1.5, 'hyperbola']]) {
    const s = K.launchState(AU, 0, f * ve, 0.2);
    const el = K.elementsFromState(MU, s.x, s.y, s.vx, s.vy);
    assert.strictEqual(el.type, type, 'v = ' + f + ' v脫');
    assert.ok(type === 'ellipse' ? el.energy < 0 && el.e < 1 && el.a > 0 : el.energy > 0 && el.e > 1 && el.a < 0);
  }
});

test('軌道要素 ↔ 狀態來回轉換：t = 0 回到發射狀態，任一時刻反算的要素不變', () => {
  for (const L of LAUNCHES) {
    const m = make(L), el = m.el, V = Math.hypot(m.s.vx, m.s.vy), R = Math.hypot(m.s.x, m.s.y);
    const q0 = K.stateAt(el, 0);
    close(q0.x, m.s.x, 1e-10, 'x0', R); close(q0.y, m.s.y, 1e-10, 'y0', R);
    close(q0.vx, m.s.vx, 1e-10, 'vx0', V); close(q0.vy, m.s.vy, 1e-10, 'vy0', V);
    for (const t of timesFor(el)) {
      const q = K.stateAt(el, t);
      const e2 = K.elementsFromState(m.mu, q.x, q.y, q.vx, q.vy);
      close(e2.e, el.e, 1e-9, 'e', Math.max(el.e, 1e-3));
      close(e2.h, el.h, 1e-10, 'h');
      close(e2.p, el.p, 1e-9, 'p');
      if (el.type !== 'parabola' && el.type !== 'circle' && el.e < 0.9999) {
        close(e2.a, el.a, 1e-9, 'a');
        close(K.wrapPi(e2.omega - el.omega), 0, 1e-8, 'ω', 1);
        // 近心點時刻相同（橢圓相差整數個週期）
        let dt = e2.tp + t - el.tp;
        if (isFinite(el.T)) dt -= Math.round(dt / el.T) * el.T;
        close(dt, 0, 1e-8, 'tp', isFinite(el.T) ? el.T : 1e7);
      }
    }
  }
});

test('克卜勒第三定律：T = 2π√(a³/GM)，T²/a³ = 4π²/GM 與 a、e 無關，只與中心質量有關', () => {
  const ratios = {};
  for (const L of LAUNCHES) {
    const m = make(L), el = m.el;
    if (!(el.e < 1) || el.type === 'parabola') continue;
    close(el.T, 2 * Math.PI * Math.sqrt(el.a * el.a * el.a / m.mu), 1e-13, 'T');
    const k = el.T * el.T / (el.a * el.a * el.a);
    close(k, K.keplerRatio(m.mu), 1e-12, 'T²/a³');
    (ratios[L[4]] = ratios[L[4]] || []).push(k);
  }
  Object.keys(ratios).forEach(function (M) { ratios[M].forEach(function (k) { close(k, ratios[M][0], 1e-12, '同一中心質量'); }); });
  close(ratios[2][0] / ratios[1][0], 0.5, 1e-12, '質量加倍，T²/a³ 減半');
  // 地球繞日：a = 1 AU → T ≈ 365.26 天；地球同步軌道 r = 42 164 km → T ≈ 23.93 h
  close(K.period(MU, AU) / K.DAY, 365.2569, 1e-6, '恆星年');
  close(K.period(K.GM_EARTH, 4.2164e7) / 3600, 23.934, 1e-4, '同步衛星');
  close(K.period(MU, AU) ** 2 / K.YEAR ** 2, 1, 1e-4, 'T²/a³ ≈ 1 年²/AU³');
});

test('解析解是週期性的：stateAt(t + T) = stateAt(t)', () => {
  for (const L of LAUNCHES) {
    const el = make(L).el;
    if (!isFinite(el.T)) continue;
    for (const t of [0, 0.3 * el.T, 5.7 * el.T]) {
      const a = K.stateAt(el, t), b = K.stateAt(el, t + el.T), c = K.stateAt(el, t + 40 * el.T);
      close(b.x, a.x, 1e-9, 'x', el.a); close(b.y, a.y, 1e-9, 'y', el.a);
      close(c.vx, a.vx, 1e-8, 'vx', a.v);
    }
  }
});

test('沿解析解傳播：力學能與角動量守恆（橢圓、拋物線、雙曲線）', () => {
  for (const L of LAUNCHES) {
    const m = make(L), el = m.el;
    const scale = m.mu / Math.hypot(m.s.x, m.s.y);
    for (const t of timesFor(el)) {
      const q = K.stateAt(el, t);
      close(K.specificEnergy(m.mu, q.x, q.y, q.vx, q.vy), el.energy, 1e-10, 'ε', scale);
      close(K.angularMomentum(q.x, q.y, q.vx, q.vy), el.h, 1e-11, 'h');
    }
  }
});

test('活力方程式：v² = GM(2/r − 1/a) 在軌道上每一點成立', () => {
  for (const L of LAUNCHES) {
    const m = make(L), el = m.el;
    for (const t of timesFor(el)) {
      const q = K.stateAt(el, t);
      close(q.v, K.visViva(m.mu, q.r, el.a), 1e-10, 'v');
    }
  }
});

test('近日點與遠日點：r_p = a(1 − e)、r_a = a(1 + e)，v_p r_p = v_a r_a = h', () => {
  for (const L of LAUNCHES) {
    const m = make(L), el = m.el;
    if (!(el.e < 0.999) || el.type === 'circle') continue;
    close(el.rp, el.a * (1 - el.e), 1e-11, 'r_p'); close(el.ra, el.a * (1 + el.e), 1e-11, 'r_a');
    const qp = K.stateAt(el, el.tp), qa = K.stateAt(el, el.tp + el.T / 2);
    close(qp.r, el.rp, 1e-11, '近日點距離'); close(qa.r, el.ra, 1e-11, '遠日點距離');
    close(qp.v * qp.r, Math.abs(el.h), 1e-11, 'v_p r_p'); close(qa.v * qa.r, Math.abs(el.h), 1e-11, 'v_a r_a');
    close(qp.x * qp.vx + qp.y * qp.vy, 0, 1e-9, '近日點速度垂直於半徑', qp.r * qp.v);
  }
});

test('克卜勒第二定律：相等時間掃過相等面積（幾何面積 = |h|Δt/2，12 塊總和 = πab）', () => {
  for (const L of LAUNCHES) {
    const el = make(L).el;
    if (isFinite(el.T)) {
      const dt = el.T / 12, areas = [];
      for (let k = 0; k < 12; k++) areas.push(K.fanArea(el, el.tp + k * dt, el.tp + (k + 1) * dt, 600));
      const exact = K.sweptArea(el, 0, dt);
      areas.forEach(function (A, k) { close(A, exact, 2e-5, '第 ' + (k + 1) + ' 塊'); });
      close(areas.reduce(function (s, x) { return s + x; }, 0), K.ellipseArea(el), 2e-5, 'πab');
    } else {
      const dt = 2 * Math.PI * Math.sqrt(el.rp ** 3 / el.mu) / 12;
      for (const k of [-3, 0, 2]) close(K.fanArea(el, el.tp + k * dt, el.tp + (k + 1) * dt, 600), K.sweptArea(el, 0, dt), 2e-5, '開放軌道');
    }
  }
});

test('克卜勒方程式的解：極端離心率的殘差趨近於 0', () => {
  for (const e of [0, 0.3, 0.9, 0.99, 0.999999]) {
    for (const M of [-3.1, -1, -1e-6, 0, 1e-8, 0.5, 2, 3.14159, 12.3]) {
      const E = K.solveKeplerE(M, e);
      close(E - e * Math.sin(E), M, 1e-13, 'e = ' + e + ', M = ' + M, Math.max(1, Math.abs(M)));
    }
  }
  for (const e of [1 + 1e-7, 1.01, 2, 8]) {
    for (const M of [-500, -2, 0, 1e-5, 3, 1e4]) {
      const H = K.solveKeplerH(M, e);
      close(e * Math.sinh(H) - H, M, 1e-12, 'e = ' + e + ', M = ' + M, Math.max(1, Math.abs(M)));
    }
  }
  for (const B of [-1e6, -3, 0, 0.1, 50, 1e9]) {
    const D = K.solveBarker(B);
    close(D + D * D * D / 3, B, 1e-12, 'Barker', Math.max(1, Math.abs(B)));
  }
});

test('與獨立的數值積分（RK4，小步長）比較：解析解滿足 a = −GM r/r³', () => {
  for (const L of [LAUNCHES[1], LAUNCHES[3], LAUNCHES[5], LAUNCHES[6], LAUNCHES[8]]) {
    const m = make(L), el = m.el;
    const Tend = 0.35 * (isFinite(el.T) ? el.T : 2 * Math.PI * Math.sqrt(el.rp ** 3 / el.mu));
    let y = [m.s.x, m.s.y, m.s.vx, m.s.vy];
    const f = function (s) { const r3 = Math.pow(Math.hypot(s[0], s[1]), 3); return [s[2], s[3], -m.mu * s[0] / r3, -m.mu * s[1] / r3]; };
    const N = 20000, h = Tend / N;
    for (let i = 0; i < N; i++) {
      const k1 = f(y), k2 = f(y.map((v, j) => v + h / 2 * k1[j])), k3 = f(y.map((v, j) => v + h / 2 * k2[j])), k4 = f(y.map((v, j) => v + h * k3[j]));
      y = y.map((v, j) => v + h / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    }
    const q = K.stateAt(el, Tend), R = Math.hypot(m.s.x, m.s.y);
    close(q.x, y[0], 1e-8, 'x', R); close(q.y, y[1], 1e-8, 'y', R);
    close(q.vx, y[2], 1e-8, 'vx', q.v); close(q.vy, y[3], 1e-8, 'vy', q.v);
  }
});

test('逆行發射（α > 90°）：h < 0，順時針繞行', () => {
  const el = make(LAUNCHES[8]).el;
  assert.ok(el.h < 0 && el.dir === -1);
  const a = K.stateAt(el, 0), b = K.stateAt(el, el.T * 0.01);
  assert.ok(a.x * b.y - a.y * b.x < 0, '角度遞減');
});

test('撞擊中心天體：撞擊時 r = R 且正在下降；近心點在表面外則不會撞', () => {
  const mu = K.GM_EARTH, R = K.R_EARTH;
  for (const [r0, f, alpha] of [[8e6, 0.8, 0], [7e6, 0.95, 0.3], [9e6, 0.6, -0.5], [7.5e6, 1.6, -1.2]]) {
    const s = K.launchState(r0, 0.4, f * K.circularSpeed(mu, r0), alpha);
    const el = K.elementsFromState(mu, s.x, s.y, s.vx, s.vy);
    const tc = K.crashTime(el, R);
    assert.ok(tc != null && tc > 0, '會撞');
    const q = K.stateAt(el, tc);
    close(q.r, R, 1e-9, '撞擊時 r = R');
    assert.ok(q.x * q.vx + q.y * q.vy < 0, '正在下降');
    // 撞擊前一直在表面外
    for (let i = 1; i < 50; i++) assert.ok(K.stateAt(el, tc * i / 50).r > R * (1 - 1e-12), '撞擊前在表面外');
  }
  const s = K.launchState(7e6, 0, K.circularSpeed(mu, 7e6), 0);
  assert.strictEqual(K.crashTime(K.elementsFromState(mu, s.x, s.y, s.vx, s.vy), R), null, '圓軌道不會撞');
  const s2 = K.launchState(8e6, 0, 1.5 * K.circularSpeed(mu, 8e6), 0.6); // 朝外飛的雙曲線
  assert.strictEqual(K.crashTime(K.elementsFromState(mu, s2.x, s2.y, s2.vx, s2.vy), R), null, '朝外脫離不會撞');
});

test('通過近日點的次數：每個週期一次；開放軌道最多一次', () => {
  const el = make(LAUNCHES[2]).el; // 從遠日點出發：半個週期後第一次通過近日點
  assert.strictEqual(K.periapsisPassages(el, 0, 0.49 * el.T), 0);
  assert.strictEqual(K.periapsisPassages(el, 0, 0.51 * el.T), 1);
  assert.strictEqual(K.periapsisPassages(el, 0, 3.51 * el.T), 4);
  close(K.nextPeriapsis(el, 0), el.T / 2, 1e-9);
  const e1 = make(LAUNCHES[1]).el; // 從近日點出發：發射瞬間不算
  assert.strictEqual(K.periapsisPassages(e1, 0, 0.99 * e1.T), 0);
  assert.strictEqual(K.periapsisPassages(e1, 0.99 * e1.T, 1.01 * e1.T), 1);
  const hy = make(LAUNCHES[7]).el; // 朝內斜飛的雙曲線：之後通過近日點一次
  assert.ok(hy.tp > 0);
  assert.strictEqual(K.periapsisPassages(hy, 0, hy.tp * 0.5), 0);
  assert.strictEqual(K.periapsisPassages(hy, 0, hy.tp * 1.5), 1);
  assert.strictEqual(K.periapsisPassages(hy, hy.tp * 1.5, hy.tp * 100), 0);
});

test('畫軌道的真近點角範圍：雙曲線限制在漸近線以內，端點 r = rMax', () => {
  const hy = make(LAUNCHES[6]).el, rMax = 5 * AU;
  const rg = K.nuRange(hy, rMax);
  close(K.positionAtNu(hy, rg[1]).r, rMax, 1e-9, 'r(ν2)');
  assert.ok(rg[1] < Math.acos(-1 / hy.e));
  const el = make(LAUNCHES[1]).el;
  assert.deepStrictEqual(K.nuRange(el, 100 * AU), [-Math.PI, Math.PI]);
  assert.strictEqual(K.nuRange(el, 0.1 * AU), null);
  // positionAtNu 與 stateAt 一致
  const q = K.stateAt(el, 0.37 * el.T), P = K.positionAtNu(el, q.nu);
  close(P.x, q.x, 1e-10, 'x', AU); close(P.y, q.y, 1e-10, 'y', AU);
});

console.log(process.exitCode ? '有測試失敗' : '全部 ' + passed + ' 項通過');
