// 以 Node 執行：node tests/faraday-core.test.js
'use strict';
const assert = require('assert');
const F = require('../js/faraday-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1e-300);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
function absClose(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}，得到 ${a}（容許 ${tol}）`);
}
/** Simpson 積分 */
function simpson(f, a, b, n) {
  n = n || 2000; if (n % 2) n++;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return s * h / 3;
}
const A = { a: 0.03, N: 100, R: 10, flipped: false };
const P = (o) => Object.assign({}, A, o);

console.log('faraday-core');

// ---------- 模式 A：磁通量 ----------
test('單一線圈的磁通量 = 兩磁極磁場對線圈面積的數值積分（磁鐵在線圈外）', () => {
  for (const [xm, a, fl] of [[-0.15, 0.03, false], [0.2, 0.05, true], [-0.08, 0.02, false], [0.1, 0.04, false]]) {
    const P0 = F.poles(xm, fl);
    // B = Φ0/(4π) · r̂/r²（N 為 +、S 為 −），在 x = 0 的圓盤上積分 Bx
    const Bx = (rho) => [[P0.xN, 1], [P0.xS, -1]].reduce((s, q) => {
      const dx = 0 - q[0], r = Math.hypot(dx, rho);
      return s + q[1] * F.MAG.Phi0 / (4 * Math.PI) * dx / (r * r * r);
    }, 0);
    const num = simpson((rho) => 2 * Math.PI * rho * Bx(rho), 0, a, 4000);
    close(F.loopFlux(xm, 0, a, fl), num, 1e-7, `xm=${xm}`);
  }
});

test('磁鐵穿過線圈時：磁極磁場的積分再加上磁鐵內部的 Φ0，結果與解析式相同且連續', () => {
  const a = 0.03, xm = 0.01; // 線圈 (x=0) 夾在兩極之間
  const P0 = F.poles(xm, false);
  const Bx = (rho) => [[P0.xN, 1], [P0.xS, -1]].reduce((s, q) => {
    const dx = 0 - q[0], r = Math.hypot(dx, rho);
    return s + q[1] * F.MAG.Phi0 / (4 * Math.PI) * dx / (r * r * r);
  }, 0);
  const num = simpson((rho) => 2 * Math.PI * rho * Bx(rho), 0, a, 4000) + F.MAG.Phi0;
  close(F.loopFlux(xm, 0, a, false), num, 1e-7);
  // N 極穿過線圈平面的前後，磁通量連續
  const xc = -F.MAG.d;
  absClose(F.loopFlux(xc - 1e-7, 0, a, false), F.loopFlux(xc + 1e-7, 0, a, false), 1e-8);
});

test('遠處極限：Φ → μ0 m a²/(2d³)（磁偶極在軸上的磁場乘以面積）', () => {
  const a = 0.03, d = 3.0;
  const m_mu0 = F.MAG.Phi0 * 2 * F.MAG.d; // μ0 m = μ0 q · (兩極距離)
  const dip = m_mu0 * a * a / (2 * d * d * d);
  close(F.loopFlux(-d, 0, a, false), dip, 2e-3);
});

test('每匝平均磁通量 Φ̄ = 對 N 匝取平均（數值積分）', () => {
  for (const [xm, a, fl] of [[-0.12, 0.03, false], [0.005, 0.025, true], [0.07, 0.05, false]]) {
    const h = F.COIL.len / 2;
    const avg = simpson((xl) => F.loopFlux(xm, xl, a, fl), -h, h, 2000) / F.COIL.len;
    close(F.coilFlux(xm, a, fl), avg, 1e-8);
  }
});

test('dΦ̄/dx 解析式 = 數值微分', () => {
  for (const x of [-0.2, -0.06, -0.01, 0.03, 0.11]) {
    const h = 1e-6;
    const fd = (F.coilFlux(x + h, 0.03, false) - F.coilFlux(x - h, 0.03, false)) / (2 * h);
    close(F.coilFluxSlope(x, 0.03, false), fd, 1e-6);
  }
});

test('線圈套住磁鐵正中央時磁通量最大，且此時 ε = 0', () => {
  const phiC = F.coilFlux(0, 0.03, false);
  for (const x of [-0.1, -0.03, -0.001, 0.001, 0.05]) assert.ok(F.coilFlux(x, 0.03, false) < phiC);
  absClose(F.coilState(0, 0.8, A).eps, 0, 1e-15);
});

// ---------- 法拉第定律 ----------
test('ε = −N dΦ/dt：沿等速通過與振盪的路徑做數值微分', () => {
  const p = P({ N: 230, a: 0.035 });
  for (const t of [0.05, 0.2, 0.31, 0.44, 0.6]) {
    const h = 1e-6, v = 0.5;
    const phi = (tt) => F.coilFlux(F.passState(tt, v, 1).x, p.a, p.flipped);
    const fd = -p.N * (phi(t + h) - phi(t - h)) / (2 * h);
    close(F.coilState(F.passState(t, v, 1).x, v, p).eps, fd, 1e-6, `pass t=${t}`);
  }
  for (const t of [0.1, 0.37, 0.8, 1.3]) {
    const h = 1e-6, f = 0.9;
    const phi = (tt) => F.coilFlux(F.oscState(tt, f).x, p.a, p.flipped);
    const fd = -p.N * (phi(t + h) - phi(t - h)) / (2 * h);
    const s = F.oscState(t, f);
    close(F.coilState(s.x, s.v, p).eps, fd, 1e-6, `osc t=${t}`);
  }
});

test('ε 與匝數 N、速率 v 成正比；I = ε/R', () => {
  const x = -0.05;
  const e1 = F.coilState(x, 0.4, P({ N: 100 })).eps;
  close(F.coilState(x, 0.4, P({ N: 300 })).eps, 3 * e1, 1e-12);
  close(F.coilState(x, 1.2, P({ N: 100 })).eps, 3 * e1, 1e-12);
  const s = F.coilState(x, 0.4, P({ R: 25 }));
  close(s.I, s.eps / 25, 1e-14);
});

// ---------- 冷次定律 ----------
test('冷次定律：N 極接近時，線圈面向磁鐵的一端感應出 N 極（互相排斥）', () => {
  for (const x of [-0.2, -0.1, -0.05]) {
    const s = F.coilState(x, +0.5, A); // 由左往右接近，N 極在前
    assert.ok(s.phi > 0, '磁通量向 +x');
    assert.ok(s.dphi > 0, '磁通量增加');
    assert.ok(s.eps < 0, 'ε < 0');
    assert.strictEqual(F.nearPole(s.I, x), 'N');
    assert.strictEqual(F.coilPoles(s.I).left, 'N');
  }
});
test('冷次定律：N 極遠離時，面向磁鐵的一端感應出 S 極（互相吸引）', () => {
  const s = F.coilState(-0.1, -0.5, A); // 磁鐵在左側、往左離開
  assert.strictEqual(F.nearPole(s.I, -0.1), 'S');
});
test('冷次定律：S 極接近時，面向磁鐵的一端感應出 S 極', () => {
  const s = F.coilState(-0.1, 0.5, P({ flipped: true }));
  assert.strictEqual(F.nearPole(s.I, -0.1), 'S');
  const r = F.coilState(0.1, -0.5, A); // 未翻轉、從右邊接近：前端是 S 極
  assert.strictEqual(F.nearPole(r.I, 0.1), 'S');
});
test('冷次定律：線圈對磁鐵的力永遠阻礙運動，且 F·v = −I²R（機械功全部變成熱）', () => {
  for (const [x, v] of [[-0.08, 0.6], [0.05, 0.6], [0.05, -1.1], [-0.02, -0.3]]) {
    const s = F.coilState(x, v, A);
    assert.ok(s.force * v < 0, '阻礙運動');
    close(s.force * v, -s.I * s.I * A.R, 1e-12);
    close(s.power, s.I * s.I * A.R, 1e-12);
  }
});
test('翻轉磁鐵或反向運動（同一位置）都使 ε 反向', () => {
  for (const x of [-0.12, -0.03, 0.04]) {
    const e = F.coilState(x, 0.7, A).eps;
    close(F.coilState(x, 0.7, P({ flipped: true })).eps, -e, 1e-12, '翻轉');
    close(F.coilState(x, -0.7, A).eps, -e, 1e-12, '反向');
  }
});
test('從磁鐵那側看：N 極接近時電流為逆時針；只翻轉磁鐵則變為順時針', () => {
  const s = F.coilState(-0.08, 0.5, A);
  assert.strictEqual(F.circulation(s.I, -0.08), 'ccw');
  const t = F.coilState(-0.08, 0.5, P({ flipped: true }));
  assert.strictEqual(F.circulation(t.I, -0.08), 'cw');
});
test('等速通過：第一個脈衝的正負只由磁極決定（從哪一邊進來都一樣）', () => {
  assert.strictEqual(F.passSummary(A, 0.5, 1).firstSign, -1);
  assert.strictEqual(F.passSummary(A, 0.5, -1).firstSign, -1);
  assert.strictEqual(F.passSummary(P({ flipped: true }), 0.5, 1).firstSign, 1);
});

// ---------- 電量 ----------
test('通過檢流計的電量 q = ∫I dt = −NΔΦ/R，與速率無關；整趟通過的淨電量為 0', () => {
  for (const v of [0.1, 0.5, 1.7]) {
    const T = F.passDuration(v);
    const I = (t) => { const s = F.passState(t, v, 1); return F.coilState(s.x, s.v, A).I; };
    const qHalf = simpson(I, 0, T / 2, 6000);
    const qAll = simpson(I, 0, T, 12000);
    const sum = F.passSummary(A, v, 1);
    close(qHalf, sum.qHalf, 1e-6, `v=${v}`);
    absClose(qAll, 0, 1e-5 * Math.abs(sum.qHalf));
  }
  close(F.passSummary(A, 0.1, 1).qHalf, F.passSummary(A, 1.9, 1).qHalf, 1e-12, '與速率無關');
});
test('峰值電動勢 = N v max|dΦ̄/dx|，與取樣比對', () => {
  const v = 0.73, s = F.passSummary(A, v, 1);
  let m = 0;
  for (let i = 0; i <= 200000; i++) { const x = -0.22 + 0.44 * i / 200000; m = Math.max(m, Math.abs(F.coilState(x, v, A).eps)); }
  close(s.epsPeak, m, 1e-7);
});

// ---------- 磁力線 ----------
test('磁力線由 N 極出發、回到 S 極，且沿線磁通函數不變（相鄰兩線之間磁通量相等）', () => {
  const lines = F.fieldLines(7);
  assert.strictEqual(lines.length, 7);
  lines.forEach((ln, k) => {
    close(ln.level, F.MAG.Phi0 * (k + 1) / 8, 1e-12);
    const end = ln.pts[ln.pts.length - 1];
    assert.ok(Math.hypot(end[0] + F.MAG.d, end[1]) < 0.006, '終點在 S 極');
    for (let i = 0; i < ln.pts.length; i += 7) {
      const q = ln.pts[i];
      close(F.streamFn(q[0], q[1], 0, false), ln.level, 2e-3, `第 ${k + 1} 條`);
    }
  });
});

// ---------- 模式 B：導體棒 ----------
const B0 = { sub: 'const', B: 0.8, Bsign: -1, L: 0.5, R: 2, m: 0.2, v0: 1.5, F: 0, x0: 0.3 };
const PB = (o) => Object.assign({}, B0, o);
test('ε = BLv、I = ε/R、F = BIL、Φ = BLx', () => {
  for (const t of [0, 0.1, 0.5]) {
    const s = F.rodState(t, B0);
    close(Math.abs(s.eps), 0.8 * 0.5 * 1.5, 1e-14);
    close(s.I, s.eps / 2, 1e-14);
    close(Math.abs(s.Fb), 0.8 * Math.abs(s.I) * 0.5, 1e-14);
    close(Math.abs(s.phi), 0.8 * 0.5 * s.x, 1e-14);
    close(s.eps, -(F.rodState(t + 1e-6, B0).phi - F.rodState(t - 1e-6, B0).phi) / 2e-6, 1e-6, 'ε = −dΦ/dt');
  }
});
test('方向：磁場入紙面、棒向右 → 逆時針電流；磁場出紙面 → 順時針；磁力向左', () => {
  const s = F.rodState(0.2, B0);
  assert.strictEqual(F.rodCirculation(s.I), 'ccw');
  assert.ok(s.Fb < 0);
  assert.strictEqual(F.rodCirculation(F.rodState(0.2, PB({ Bsign: 1 })).I), 'cw');
  assert.ok(F.rodState(0.2, PB({ Bsign: 1 })).Fb < 0, '磁場反向，磁力仍阻礙運動');
});
test('等速拉動：外力 = B²L²v/R，外力的功率 = I²R', () => {
  const s = F.rodState(0.7, B0);
  close(s.Fext, 0.64 * 0.25 * 1.5 / 2, 1e-14);
  close(s.Fext * s.v, s.P, 1e-12);
  close(s.work, s.heat, 1e-12);
});
test('放開後 v = v0 e^(−t/τ)，τ = mR/(B²L²)（與數值積分 m dv/dt = −B²L²v/R 比對）', () => {
  const p = PB({ sub: 'release', v0: 2.4 });
  const tau = p.m * p.R / (p.B * p.B * p.L * p.L);
  close(F.rodDerived(p).tau, tau, 1e-14);
  // RK4
  let v = p.v0, x = p.x0, t = 0;
  const dt = 1e-4, k = p.B * p.B * p.L * p.L / p.R;
  const acc = (vv) => -k * vv / p.m;
  for (let i = 0; i < 30000; i++) {
    const k1 = acc(v), k2 = acc(v + k1 * dt / 2), k3 = acc(v + k2 * dt / 2), k4 = acc(v + k3 * dt);
    const l1 = v, l2 = v + k1 * dt / 2, l3 = v + k2 * dt / 2, l4 = v + k3 * dt;
    v += dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4);
    x += dt / 6 * (l1 + 2 * l2 + 2 * l3 + l4);
    t += dt;
    if (i % 5000 === 4999) {
      const s = F.rodState(t, p);
      close(s.v, v, 1e-8, `v(${t.toFixed(2)})`);
      close(s.x, x, 1e-8, `x(${t.toFixed(2)})`);
      close(s.v, p.v0 * Math.exp(-t / tau), 1e-12);
    }
  }
  // 滑行距離 → v0 τ
  close(F.rodState(60 * tau, p).x - p.x0, p.v0 * tau, 1e-12);
  // 速度減半的時間 = τ ln 2
  close(F.rodState(tau * Math.LN2, p).v, p.v0 / 2, 1e-12);
});
test('能量：∫I²R dt = ½ m v0²（數值積分），任意時刻 熱 + 動能 = 初動能', () => {
  const p = PB({ sub: 'release', v0: 2.4 });
  const tau = F.rodDerived(p).tau;
  const heatNum = simpson((t) => F.rodState(t, p).P, 0, 40 * tau, 20000);
  close(heatNum, 0.5 * p.m * p.v0 * p.v0, 1e-8);
  for (const t of [0.1, 0.5, 2]) {
    const s = F.rodState(t, p);
    close(s.heat + s.KE, 0.5 * p.m * p.v0 * p.v0, 1e-12);
    close(s.heat, simpson((u) => F.rodState(u, p).P, 0, t, 4000), 1e-9, `Q(${t})`);
  }
});
test('定力拉動：終端速度 vt = FR/(B²L²)；外力作功 = 動能增加 + 焦耳熱', () => {
  for (const v0 of [0, 3]) {
    const p = PB({ sub: 'force', F: 0.6, v0: v0 });
    const vt = 0.6 * p.R / (p.B * p.B * p.L * p.L);
    close(F.rodDerived(p).vt, vt, 1e-14);
    const tau = F.rodDerived(p).tau;
    close(F.rodState(40 * tau, p).v, vt, 1e-12);
    for (const t of [0.05, 0.4, 1.5]) {
      const s = F.rodState(t, p);
      close(s.work, s.KE - 0.5 * p.m * v0 * v0 + s.heat, 1e-11);
      close(s.heat, simpson((u) => F.rodState(u, p).P, 0, t, 4000), 1e-9);
    }
    // 終端速度時：外力功率 = 電阻的熱功率
    const s = F.rodState(40 * tau, p);
    close(s.Fext * s.v, s.P, 1e-9);
  }
});
test('到達軌道末端的時刻（二分法）', () => {
  const p = PB({ sub: 'release', v0: 2.4 });
  const t = F.rodTimeTo(1.0, p);
  close(F.rodState(t, p).x, 1.0, 1e-10);
  assert.strictEqual(F.rodTimeTo(p.x0 + p.v0 * F.rodDerived(p).tau + 0.01, p), Infinity, '放開後滑不到的位置（超過 x0 + v0τ）');
  close(F.rodTimeTo(2.0, B0), (2.0 - 0.3) / 1.5, 1e-9);
});

console.log(`  共 ${passed} 項通過`);
