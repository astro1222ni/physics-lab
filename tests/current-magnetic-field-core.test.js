// 以 Node 執行：node tests/current-magnetic-field-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/current-magnetic-field-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1e-300);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
function near(a, b, abs, msg) { assert.ok(Math.abs(a - b) <= abs, (msg || '') + ` 期望 ${b} ± ${abs}，得到 ${a}`); }
const MU0 = C.MU0, PI = Math.PI;

// ---- 數值工具（只在測試裡用，與核心的算法無關）----
// Gauss–Legendre 20 點
const GL = (function () {
  const n = 20, x = [], w = [];
  for (let i = 1; i <= n; i++) {
    let z = Math.cos(PI * (i - 0.25) / (n + 0.5)), pp = 0;
    for (let it = 0; it < 100; it++) {
      let p1 = 1, p2 = 0;
      for (let j = 1; j <= n; j++) { const p3 = p2; p2 = p1; p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j; }
      pp = n * (z * p1 - p2) / (z * z - 1);
      const z1 = z; z = z1 - p1 / pp;
      if (Math.abs(z - z1) < 1e-15) break;
    }
    x.push(z); w.push(2 / ((1 - z * z) * pp * pp));
  }
  return { x, w };
})();
function integrate(f, a, b, pieces) {
  let s = 0; const h = (b - a) / pieces;
  for (let k = 0; k < pieces; k++) {
    const c = a + (k + 0.5) * h;
    for (let i = 0; i < GL.x.length; i++) s += GL.w[i] * f(c + 0.5 * h * GL.x[i]) * 0.5 * h;
  }
  return s;
}
// 直線電流段（A→B，電流 I）在 P 的磁場：精確公式 μ0I/(4πd)(cosθ1 − cosθ2)
function segB(A, B, I, P) {
  const L = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], ll = Math.hypot(...L);
  const ra = [P[0] - A[0], P[1] - A[1], P[2] - A[2]], rb = [P[0] - B[0], P[1] - B[1], P[2] - B[2]];
  const cr = [L[1] * ra[2] - L[2] * ra[1], L[2] * ra[0] - L[0] * ra[2], L[0] * ra[1] - L[1] * ra[0]];
  const cn = Math.hypot(...cr); if (cn < 1e-18) return [0, 0, 0];
  const d = cn / ll;
  const c1 = (L[0] * ra[0] + L[1] * ra[1] + L[2] * ra[2]) / (ll * Math.hypot(...ra));
  const c2 = (L[0] * rb[0] + L[1] * rb[1] + L[2] * rb[2]) / (ll * Math.hypot(...rb));
  const m = MU0 * I / (4 * PI * d) * (c1 - c2);
  return cr.map(v => m * v / cn);
}
// 圓線圈切成 nSeg 段多邊形，用畢歐–沙伐定律相加（線圈在 xy 平面，軸 z）
function polyLoop(R, I, P, nSeg) {
  let B = [0, 0, 0];
  for (let i = 0; i < nSeg; i++) {
    const t0 = 2 * PI * i / nSeg, t1 = 2 * PI * (i + 1) / nSeg;
    const b = segB([R * Math.cos(t0), R * Math.sin(t0), 0], [R * Math.cos(t1), R * Math.sin(t1), 0], I, P);
    B = B.map((v, j) => v + b[j]);
  }
  return B;
}

console.log('current-magnetic-field-core');

test('常數：μ0 用 CODATA 2022（1.25663706127 × 10^-6），比 4π × 10^-7 小約 1.3 × 10^-10（相對）', () => {
  assert.strictEqual(C.MU0, 1.25663706127e-6);
  const rel = C.MU0 / (4 * PI * 1e-7) - 1;
  assert.ok(rel < -1.0e-10 && rel > -1.6e-10, '相對差 ' + rel);
  close(C.K2, MU0 / (2 * PI), 1e-15);
});

test('地磁（WMM2025）：台灣水平分量 36～38 μT、磁偏角偏西約 4～5°、磁傾角 33～38°；南部水平分量較大', () => {
  assert.ok(C.EARTH.length >= 4);
  C.EARTH.forEach(e => {
    assert.ok(e.H > 35e-6 && e.H < 38e-6, e.id + ' H');
    assert.ok(e.D < -4 && e.D > -5.5, e.id + ' D');
    assert.ok(e.I > 33 && e.I < 38, e.id + ' I');
    near(Math.atan2(e.Z, e.H) / C.DEG, e.I, 0.05, e.id + ' tan I = Z/H');
  });
  assert.ok(C.earth('kaohsiung').H > C.earth('taipei').H);
  assert.strictEqual(C.earth('nowhere').id, 'taipei');
});

test('長直導線：B = μ0 I/(2πr)；與很長的有限導線（畢歐–沙伐精確段公式）一致；B ∝ I、B ∝ 1/r', () => {
  for (const [I, r] of [[1, 0.01], [3.2, 0.025], [5, 0.1]]) {
    const b = segB([0, 0, -500], [0, 0, 500], I, [r, 0, 0]);
    close(Math.hypot(...b), C.wireB(I, r), 1e-6, '長 1000 m 的導線');
    close(C.wireB(I, r), MU0 * I / (2 * PI * r), 1e-15);
  }
  close(C.wireB(2, 0.03) / C.wireB(1, 0.03), 2, 1e-14);
  close(C.wireB(1, 0.02) / C.wireB(1, 0.04), 2, 1e-14);
  // 畢歐–沙伐數值積分（中點法，很多小段）收斂到精確公式
  let s = 0; const n = 200000, Lh = 50, dz = 2 * Lh / n, r = 0.02;
  for (let i = 0; i < n; i++) { const z = -Lh + (i + 0.5) * dz; s += MU0 / (4 * PI) * dz * r / Math.pow(r * r + z * z, 1.5); }
  close(s, C.wireB(1, r), 1e-5, '數值積分');
});

test('安培定律：繞直導線任意封閉路徑 ∮B·dl = μ0 I；不圍住導線時為 0', () => {
  const P = { shape: 'wire', I: 2.5, s: 1 };
  const lineInt = function (cx, cy, a, b) { // 橢圓路徑
    return integrate(t => {
      const x = cx + a * Math.cos(t), y = cy + b * Math.sin(t);
      const B = C.planeField(P, x, y);
      return B.bx * (-a * Math.sin(t)) + B.by * (b * Math.cos(t));
    }, 0, 2 * PI, 40);
  };
  close(lineInt(0, 0, 0.03, 0.03), MU0 * 2.5, 1e-10, '圓');
  close(lineInt(0.01, -0.005, 0.05, 0.02), MU0 * 2.5, 1e-8, '偏心橢圓');
  near(lineInt(0.08, 0, 0.02, 0.03), 0, 1e-15, '沒圍住');
  // 方向：電流射出紙面時，磁場逆時針
  const B = C.planeField(P, 0.02, 0);
  assert.ok(B.by > 0 && Math.abs(B.bx) < 1e-20, '在 +x 處磁場沿 +y（逆時針）');
  const Br = C.planeField(Object.assign({}, P, { s: -1 }), 0.02, 0);
  assert.ok(Br.by < 0, '電流反向，磁場反向');
});

test('圓線圈：中心 μ0NI/(2R)、軸上 μ0NIR²/(2(R²+x²)^{3/2})；與多邊形（畢歐–沙伐）相加一致', () => {
  close(C.coilCenter(50, 0.05, 2), MU0 * 50 * 2 / 0.1, 1e-15);
  close(C.coilField(50, 0.05, 2, 0, 0).Bz, C.coilCenter(50, 0.05, 2), 1e-13);
  for (const z of [0.01, 0.05, -0.12]) close(C.coilField(20, 0.04, 1.5, 0, z).Bz, C.coilAxis(20, 0.04, 1.5, z), 1e-12);
  close(C.coilAxis(1, 0.05, 1, 0.05) / C.coilAxis(1, 0.05, 1, 0), Math.pow(2, -1.5), 1e-13, '在 x = R 處剩 1/(2√2)');
  for (const [rho, z] of [[0.02, 0.01], [0.06, -0.03], [0.045, 0.004], [0.01, 0.2], [0.1, 0]]) {
    const A = C.loopField(0.05, 1, rho, z), P = polyLoop(0.05, 1, [rho, 0, z], 20000);
    close(A.Br, P[0], 2e-5, `Bρ(${rho}, ${z})`);
    close(A.Bz, P[2], 2e-5, `Bz(${rho}, ${z})`);
  }
  // 平面下半部（ρ < 0）：Br 為平面 +y 分量，鏡像對稱
  const up = C.loopField(0.05, 1, 0.03, 0.02), dn = C.loopField(0.05, 1, -0.03, 0.02);
  close(dn.Br, -up.Br, 1e-14); close(dn.Bz, up.Bz, 1e-14);
});

test('圓線圈：遠處為磁偶極場 B = μ0 m/(4π r³)·(2cosθ, sinθ)，m = NIπR²', () => {
  const R = 0.05, I = 2, N = 10, m = N * I * PI * R * R;
  for (const th of [0.3, 1.0, 1.4]) {
    const r = 60 * R, rho = r * Math.sin(th), z = r * Math.cos(th);
    const f = C.coilField(N, R, I, rho, z);
    const k = MU0 * m / (4 * PI * r * r * r);
    const Brr = 2 * k * Math.cos(th), Bth = k * Math.sin(th);
    const tol = 2e-3 * Math.hypot(Brr, Bth); // 以 |B| 為準（Bz 在 θ ≈ 55° 附近會趨近 0）
    near(f.Bz, Brr * Math.cos(th) - Bth * Math.sin(th), tol, 'Bz');
    near(f.Br, Brr * Math.sin(th) + Bth * Math.cos(th), tol, 'Bρ');
  }
});

test('圓線圈：∇·B = 0（數值微分），繞導線一圈 ∮B·dl = μ0 N I', () => {
  const N = 30, R = 0.05, I = 2, h = 1e-6;
  for (const [rho, z] of [[0.02, 0.01], [0.07, -0.02], [0.03, 0.06]]) {
    const dr = ((rho + h) * C.coilField(N, R, I, rho + h, z).Br - (rho - h) * C.coilField(N, R, I, rho - h, z).Br) / (2 * h * rho);
    const dz = (C.coilField(N, R, I, rho, z + h).Bz - C.coilField(N, R, I, rho, z - h).Bz) / (2 * h);
    const B = Math.hypot(C.coilField(N, R, I, rho, z).Br, C.coilField(N, R, I, rho, z).Bz);
    assert.ok(Math.abs(dr + dz) * 0.01 < 1e-6 * B, `div B 太大 ${dr + dz}`);
  }
  const P = { shape: 'coil', I: I, s: 1, N: N, R: R };
  const ring = integrate(t => {
    const x = 0.015 * Math.cos(t), y = R + 0.015 * Math.sin(t);
    const B = C.planeField(P, x, y);
    return B.bx * (-0.015 * Math.sin(t)) + B.by * (0.015 * Math.cos(t));
  }, 0, 2 * PI, 60);
  close(ring, MU0 * N * I, 1e-7, '上方導線（電流射出紙面）逆時針');
});

test('Bulirsch 廣義完全橢圓積分 C(kc, p, c, s)：與直接數值積分一致（含 p < 0 分支）', () => {
  for (const [kc, p, c, s] of [[0.3, 1, 1, -1], [0.8, 0.25, 1, 0.5], [0.05, 0.9, 1, 0.95], [1, 1, 1, 1], [0.6, -0.3, 1, 0.2]]) {
    const f = phi => {
      const c2 = Math.cos(phi) ** 2, s2 = Math.sin(phi) ** 2;
      return (c * c2 + s * s2) / ((c2 + p * s2) * Math.sqrt(c2 + kc * kc * s2));
    };
    if (p < 0) continue; // p < 0 時被積函數有極點（主值），只檢查有限
    close(C.cel(kc, p, c, s), integrate(f, 0, PI / 2, 200), 1e-11, `cel(${kc}, ${p}, ${c}, ${s})`);
  }
  assert.ok(isFinite(C.cel(0.6, -0.3, 1, 0.2)));
  close(C.cel(0.5, 1, 1, 1), C.ellipKE(0.75).K, 1e-12, 'C(kc, 1, 1, 1) = K');
});

test('螺線管：閉合解與「許多圓線圈相加」（Gauss–Legendre 積分）一致，管內外、管口、繞線附近都對', () => {
  const N = 400, L = 0.2, R = 0.03, I = 2, n = N / L;
  for (const [rho, z] of [[0, 0], [0.01, 0.05], [0.02, 0.1], [0.045, 0.02], [0.05, 0.12], [0.029, 0.099], [0.1, 0.3], [-0.02, -0.08], [0.031, -0.04]]) {
    const A = C.solenoidField(n, L, R, I, rho, z);
    const Br = integrate(zz => C.loopField(R, n * I, rho, z - zz).Br, -L / 2, L / 2, 400);
    const Bz = integrate(zz => C.loopField(R, n * I, rho, z - zz).Bz, -L / 2, L / 2, 400);
    close(A.Br, Br, 3e-7 + (Math.abs(Br) < 1e-6 ? 1 : 0), `Bρ(${rho}, ${z})`);
    close(A.Bz, Bz, 3e-7, `Bz(${rho}, ${z})`);
  }
  for (const z of [0, 0.05, 0.1, 0.17, -0.3]) close(C.solenoidField(n, L, R, I, 0, z).Bz, C.solenoidAxis(n, L, R, I, z), 1e-11, '軸上');
});

test('螺線管：越細長，中央越接近 μ0nI；管口約剩一半；管外中央很弱', () => {
  const n = 2000, I = 1, R = 0.01;
  const ideal = C.solenoidIdeal(n, I);
  const c40 = C.solenoidAxis(n, 0.4, R, I, 0);
  close(c40 / ideal, 0.4 / Math.sqrt(0.16 + 4 * R * R), 1e-12, '中央 = L/√(L²+4R²)');
  assert.ok(c40 / ideal > 0.998);
  close(C.solenoidAxis(n, 0.4, R, I, 0.2) / c40, Math.sqrt(0.16 + 4 * R * R) / (2 * Math.sqrt(0.16 + R * R)), 1e-12, '管口');
  assert.ok(Math.abs(C.solenoidAxis(n, 0.4, R, I, 0.2) / ideal - 0.5) < 0.002, '管口約一半');
  const out = C.solenoidField(n, 0.4, R, I, 0.02, 0).Bz;
  assert.ok(out < 0 && Math.abs(out) < 0.002 * ideal, '管外中央：反向而且很弱 ' + out / ideal);
  // 線性：B ∝ I、∝ n
  close(C.solenoidField(2 * n, 0.4, R, 3 * I, 0.004, 0.05).Bz, 6 * C.solenoidField(n, 0.4, R, I, 0.004, 0.05).Bz, 1e-12);
});

test('螺線管：安培定律——長方形路徑圍住長度 ℓ 的繞線時 ∮B·dl = μ0 n I ℓ；∇·B = 0', () => {
  const N = 300, L = 0.15, R = 0.02, I = 2, n = N / L;
  const P = { shape: 'solenoid', I: I, s: 1, N: N, L: L, R: R };
  const ell = 0.06, x0 = -0.02, x1 = x0 + ell, y0 = 0.005, y1 = 0.045; // 長方形跨過上方繞線（y = R）
  const seg = (ax, ay, bx, by) => integrate(t => {
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, B = C.planeField(P, x, y);
    return B.bx * (bx - ax) + B.by * (by - ay);
  }, 0, 1, 80);
  const circ = seg(x0, y0, x1, y0) + seg(x1, y0, x1, y1) + seg(x1, y1, x0, y1) + seg(x0, y1, x0, y0);
  close(circ, MU0 * n * I * ell, 2e-6, '圍住繞線（逆向：電流在上方射出紙面）');
  const none = seg(x0, 0.005, x1, 0.005) + seg(x1, 0.005, x1, 0.015) + seg(x1, 0.015, x0, 0.015) + seg(x0, 0.015, x0, 0.005);
  near(none, 0, 1e-6 * MU0 * n * I * ell, '沒圍住');
  const h = 1e-6;
  for (const [rho, z] of [[0.01, 0.07], [0.03, 0.08], [0.012, -0.075]]) {
    const dr = ((rho + h) * C.solenoidField(n, L, R, I, rho + h, z).Br - (rho - h) * C.solenoidField(n, L, R, I, rho - h, z).Br) / (2 * h * rho);
    const dz = (C.solenoidField(n, L, R, I, rho, z + h).Bz - C.solenoidField(n, L, R, I, rho, z - h).Bz) / (2 * h);
    assert.ok(Math.abs(dr + dz) * 0.01 < 1e-6 * C.solenoidIdeal(n, I), 'div B ' + (dr + dz));
  }
});

test('磁力線追蹤：圓線圈的磁力線上 ψ = ρA_φ 守恆（相對漂移 < 10^-5），而且是封閉曲線', () => {
  const P = { shape: 'coil', I: 2, s: 1, N: 10, R: 0.05 };
  for (const y0 of [0.01, 0.03, 0.045]) {
    const tr = C.traceLine((x, y) => C.planeField(P, x, y), 0, y0, { ds: 0.0005, maxLen: 9.5, box: [-3, -3, 3, 3],
      avoid: (x, y) => Math.hypot(x, y - P.R) - 0.001 });
    const psi0 = C.loopPsi(P.R, 1, y0, 0);
    let worst = 0;
    tr.pts.forEach(p => { worst = Math.max(worst, Math.abs(C.loopPsi(P.R, 1, p[1], p[0]) / psi0 - 1)); });
    assert.ok(worst < 1e-5, `y0 = ${y0}：ψ 漂移 ${worst}`);
    assert.ok(tr.closed, `y0 = ${y0} 應該是封閉曲線`);
    assert.ok(tr.pts.every(p => p[1] > 0), '線留在上半平面（繞著上方導線）');
  }
  // ψ 與 Bz 的關係：∂ψ/∂ρ = ρ Bz
  const h = 1e-7, r = 0.02, z = 0.01;
  close((C.loopPsi(0.05, 1, r + h, z) - C.loopPsi(0.05, 1, r - h, z)) / (2 * h), r * C.loopField(0.05, 1, r, z).Bz, 1e-6);
});

test('磁力線起點：直導線同心圓等比、數量 ∝ I；剖面起點使中央平面上相鄰線間 ∫B dy 相等；立體起點每條線通量相等', () => {
  const r1 = C.wireRadii(2, 2e-7, 0.004, 0.2), r2 = C.wireRadii(4, 2e-7, 0.004, 0.2);
  assert.ok(r1.length >= 4);
  for (let i = 2; i < r1.length; i++) close(r1[i] / r1[i - 1], r1[1] / r1[0], 1e-12, '等比');
  close(Math.log(r1[1] / r1[0]) * C.K2 * 2, 2e-7, 1e-12, '相鄰兩圓間 ∫B dr = perLine');
  assert.ok(Math.abs(r2.length / r1.length - 2) < 0.25, '電流加倍，線也加倍');
  assert.deepStrictEqual(C.wireRadii(0, 1e-6, 0.004, 0.2), []);
  const P = { shape: 'solenoid', I: 2, s: 1, N: 400, L: 0.3, R: 0.03 };
  const ys = C.midplaneSeeds2D(P, 2e-5, 0.028).filter(y => y > 0).sort((a, b) => a - b);
  assert.ok(ys.length >= 5);
  // 長螺線管內部近乎均勻：起點近乎等距
  for (let i = 2; i < ys.length; i++) close(ys[i] - ys[i - 1], ys[1] - ys[0], 0.02, '等距');
  const d3 = C.diskSeeds3D(P, 2e-7, 0.028, 400);
  assert.ok(d3.seeds.length > 5);
  const tot = integrate(r => Math.abs(C.planeField(P, 0, r).bx) * 2 * PI * r, 0, 0.028, 20);
  close(d3.flux, tot, 1e-4, '總通量');
  // 每條線的通量相等：第 k 個起點圍住的通量 = (k + 0.5) × 每條線
  d3.seeds.slice(0, 6).forEach((s, k) => {
    const inside = integrate(r => Math.abs(C.planeField(P, 0, r).bx) * 2 * PI * r, 0, s.rho, 10);
    close(inside, (k + 0.5) * d3.perLine, 2e-3, '等通量');
  });
});

test('厄斯特：導線南北向在磁針上方、電流向北 → 磁針偏西；在下方偏東；電流反向就反過來（右手定則）', () => {
  const base = { I: 3, s: 1, alpha: 0, above: true, h: 0.03, d: 0, BH: 36.18e-6, earth: true };
  const f = C.oerstedField(base);
  assert.ok(f.thetaEq < -1, '上方、向北 → 偏西 ' + f.thetaEq);
  assert.ok(C.oerstedField(Object.assign({}, base, { above: false })).thetaEq > 1, '下方 → 偏東');
  assert.ok(C.oerstedField(Object.assign({}, base, { s: -1 })).thetaEq > 1, '電流向南 → 偏東');
  close(f.BIh, C.wireB(3, 0.03), 1e-13, '正下方時導線磁場全是水平的');
  near(f.BIz, 0, 1e-20);
  // 正切法：tan θ = B導線 / BH
  close(Math.tan(Math.abs(f.thetaEq) * C.DEG), C.wireB(3, 0.03) / 36.18e-6, 1e-12);
  // B導線 = BH 時偏 45°
  const I45 = 36.18e-6 * 0.03 / C.K2;
  near(Math.abs(C.oerstedField(Object.assign({}, base, { I: I45 })).thetaEq), 45, 1e-9);
  // 東西向導線：導線磁場與地磁平行，磁針不偏（或反轉 180°）
  near(C.oerstedField(Object.assign({}, base, { alpha: 90 })).thetaEq, 0, 1e-9, '加強');
  const back = C.oerstedField(Object.assign({}, base, { alpha: 90, s: -1, I: 5, h: 0.02 }));
  near(Math.abs(back.thetaEq), 180, 1e-9, '反向而且比地磁大 → 指向南方');
  // 抵消：B導線 = BH 且反向 → 合磁場為零
  near(C.oerstedField(Object.assign({}, base, { alpha: 90, s: -1, I: I45 })).Bh, 0, 1e-18, '抵消');
  // 磁針側移：只剩水平分量 h/√(h²+d²) 倍，其餘是鉛直分量
  const side = C.oerstedField(Object.assign({}, base, { d: 0.04 }));
  close(side.BIh, C.wireB(3, 0.05) * 0.03 / 0.05, 1e-12);
  close(Math.abs(side.BIz), C.wireB(3, 0.05) * 0.04 / 0.05, 1e-12);
  // 忽略地磁：磁針完全沿導線磁場（±90°）
  near(Math.abs(C.oerstedField(Object.assign({}, base, { earth: false })).thetaEq), 90, 1e-9);
});

test('磁針轉動：RK4 無阻尼時能量漂移 < 10^-9；小角度週期 = 2π/√((m/J)B)；有阻尼會停在平衡方向', () => {
  const N = C.NEEDLE, Bx = 20e-6, By = 36.18e-6, eq = Math.atan2(Bx, By);
  const st = { phi: 0, om: 0 };
  const E0 = C.needleEnergy(st, Bx, By);
  let worst = 0;
  for (let i = 0; i < 6000; i++) { C.stepNeedle(st, Bx, By, 0.01, { damp: false }); worst = Math.max(worst, Math.abs(C.needleEnergy(st, Bx, By) - E0)); }
  assert.ok(worst < 1e-9 * Math.abs(E0), '能量漂移 ' + worst / Math.abs(E0));
  // 小角度週期（臺北地磁 → 1.6 s）
  close(C.needlePeriod(N.Bref), 1.6, 1e-12);
  const s2 = { phi: 0.01, om: 0 };
  let t = 0, last = s2.phi, crosses = [];
  for (let i = 0; i < 4000; i++) {
    C.stepNeedle(s2, 0, N.Bref, 0.001, { damp: false }); t += 0.001;
    if (last > 0 && s2.phi <= 0) crosses.push(t - 0.001 * s2.phi / (s2.phi - last));
    last = s2.phi;
  }
  close(crosses[1] - crosses[0], 1.6, 2e-4, '週期');
  // 有阻尼：20 s 後停在平衡方向
  const s3 = { phi: 0, om: 0 };
  for (let i = 0; i < 2000; i++) C.stepNeedle(s3, Bx, By, 0.01);
  near(s3.phi, eq, 1e-6);
  // 磁場越強擺得越快：週期 ∝ 1/√B
  close(C.needlePeriod(4 * N.Bref), 0.8, 1e-12);
});

test('支點摩擦：磁針停在平衡方向 ±卡住範圍內；卡住範圍在臺北地磁下為 0.15°，磁場越強越小', () => {
  near(C.deadBand(C.NEEDLE.Bref), 0.15, 1e-9);
  assert.ok(C.deadBand(2 * C.NEEDLE.Bref) < 0.08);
  for (const [Bx, By] of [[0, 36.18e-6], [36e-6, 36.18e-6], [-50e-6, 36.18e-6]]) {
    const eq = Math.atan2(Bx, By) / C.DEG, db = C.deadBand(Math.hypot(Bx, By));
    for (const phi0 of [-30, 0, 20, 70]) {
      const st = { phi: phi0 * C.DEG, om: 0 };
      for (let i = 0; i < 3000; i++) C.stepNeedle(st, Bx, By, 0.01, { friction: true });
      assert.ok(Math.abs(st.om) < 1e-9, '停下來');
      assert.ok(Math.abs(C.wrapDeg(st.phi / C.DEG - eq)) <= db + 1e-6, `停在 ${st.phi / C.DEG}，平衡 ${eq}，範圍 ${db}`);
    }
  }
});

test('正切法分析：精確數據還原 BH；正反向電流平均可消去刻度盤零點的偏差', () => {
  const BH = 36.6e-6, rows = [];
  const e0 = 1.7; // 刻度盤零點偏差（deg）
  for (const [I, r] of [[1, 3], [2, 3], [3, 3], [2, 2], [4, 5]]) {
    const th = Math.atan(C.wireB(I, r / 100) / BH) / C.DEG;
    rows.push({ I: I, r: r, theta: th, s: 1, above: false });
  }
  const A = C.tangentAnalysis(rows, BH);
  near(A.err, 0, 1e-12, '沒有偏差');
  assert.strictEqual(A.n, 5); assert.strictEqual(A.nI, 4); assert.strictEqual(A.nR, 3);
  close(A.rRatio, 2.5, 1e-12);
  const biased = [];
  rows.forEach(r => { biased.push(Object.assign({}, r, { theta: r.theta + e0 })); biased.push(Object.assign({}, r, { s: -1, theta: -r.theta + e0 })); });
  const B = C.tangentAnalysis(biased, BH);
  assert.strictEqual(B.nPair, 5);
  near(B.errPair, 0, 1e-12, '正反平均消去零點偏差');
  assert.ok(Math.abs(B.err) > 1e-4, '只用單向讀數會有偏差');
  const one = C.tangentAnalysis(biased.filter(r => r.s > 0), BH);
  assert.ok(Math.abs(one.err) > 0.03, '只有同一方向：零點偏差 1.7° 造成超過 3% 的誤差');
});

test('擬合：通過原點與一般直線', () => {
  close(C.fitOrigin([1, 2, 3], [2, 4, 6]), 2, 1e-15);
  const l = C.fitLine([0, 1, 2, 3], [1, 3, 5, 7]);
  close(l.slope, 2, 1e-14); close(l.intercept, 1, 1e-14);
  assert.strictEqual(C.fitLine([1], [1]), null);
});

console.log(`\n${passed} 項通過${process.exitCode ? '，有失敗' : ''}`);
