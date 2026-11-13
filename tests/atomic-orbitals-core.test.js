// 以 Node 執行：node tests/atomic-orbitals-core.test.js
'use strict';
const assert = require('assert');
const A = require('../js/atomic-orbitals-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`); }
const ALL = A.list(5);
/** 球面積分 ∫ f dΩ（θ 用高斯–勒讓德不必，細格點中點法就夠準） */
function sphereInt(f, Nt, Np) {
  Nt = Nt || 360; Np = Np || 720;
  let s = 0;
  for (let i = 0; i < Nt; i++) {
    const t = (i + 0.5) * Math.PI / Nt, st = Math.sin(t), ct = Math.cos(t);
    for (let j = 0; j < Np; j++) {
      const p = (j + 0.5) * 2 * Math.PI / Np;
      s += f(st * Math.cos(p), st * Math.sin(p), ct) * st;
    }
  }
  return s * (Math.PI / Nt) * (2 * Math.PI / Np);
}

test('軌域清單：n = 1～4 共 30 個（1 + 4 + 9 + 16）、n ≤ 5 共 46 個；代號可以來回轉換', function () {
  assert.strictEqual(A.list(4).length, 30);
  assert.strictEqual(ALL.length, 46);
  ALL.forEach(o => { const p = A.parse(A.id(o)); assert.deepStrictEqual(p, { n: o.n, l: o.l, key: o.key }); });
  assert.strictEqual(A.parse('2d' + 'xy'), null, '2d 不存在');
  assert.strictEqual(A.parse('1px'), null, '1p 不存在');
  assert.strictEqual(A.text({ n: 3, key: 'dz2' }), '3dz²');
});

test('徑向函數的解析式：1s = 2e^(−r)、2s = (2 − r)e^(−r/2)／(2√2)、2p = r e^(−r/2)／(2√6)、3d = 4r²e^(−r/3)／(81√30)', function () {
  [0, 0.3, 1, 2.5, 7].forEach(r => {
    near(A.R(1, 0, r, 1), 2 * Math.exp(-r), 1e-12, '1s r=' + r);
    near(A.R(2, 0, r, 1), (2 - r) * Math.exp(-r / 2) / (2 * Math.SQRT2), 1e-12, '2s r=' + r);
    near(A.R(2, 1, r, 1), r * Math.exp(-r / 2) / (2 * Math.sqrt(6)), 1e-12, '2p r=' + r);
    near(A.R(3, 2, r, 1), 4 * r * r * Math.exp(-r / 3) / (81 * Math.sqrt(30)), 1e-12, '3d r=' + r);
  });
});

test('核電荷 Z 的縮放：R(n, l, r; Z) = Z^(3/2) R(n, l, Zr; 1)', function () {
  [[1, 0], [2, 1], [3, 2], [4, 3], [3, 0]].forEach(a => [0.2, 1, 3.3].forEach(r => [2, 3].forEach(Z => {
    near(A.R(a[0], a[1], r, Z), Math.pow(Z, 1.5) * A.R(a[0], a[1], Z * r, 1), 1e-10, a.join('') + ' Z=' + Z);
  })));
});

test('徑向歸一化：∫ r²R² dr = 1（n ≤ 5 所有 n、l，Z = 1、2、3）', function () {
  for (let n = 1; n <= 5; n++) for (let l = 0; l < n && l <= 3; l++) [1, 2, 3].forEach(Z => {
    near(A.cumulative(n, l, A.rCut(n, Z), Z), 1, 2e-6, n + A.L_NAMES[l] + ' Z=' + Z);
  });
});

test('角度歸一化與正交：∫Y² dΩ = 1，同一個 l 的不同軌域 ∫Y·Y′ dΩ = 0', function () {
  A.KEYS.forEach(keys => {
    keys.forEach(k => near(sphereInt((x, y, z) => A.Y(k, x, y, z) ** 2, 180, 360), 1, 2e-4, k));
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++)
      near(sphereInt((x, y, z) => A.Y(keys[i], x, y, z) * A.Y(keys[j], x, y, z), 180, 360), 0, 2e-4, keys[i] + '·' + keys[j]);
  });
});

test('不同 n 的徑向函數正交：∫ r² R_ns R_n′s dr = 0（同一個 l）', function () {
  const ov = (n1, n2, l) => { const N = 20000, hi = A.rCut(Math.max(n1, n2), 1), h = hi / N; let s = 0; for (let i = 1; i < N; i++) { const r = i * h; s += r * r * A.R(n1, l, r, 1) * A.R(n2, l, r, 1); } return s * h; };
  near(ov(1, 2, 0), 0, 1e-6, '1s·2s'); near(ov(2, 3, 0), 0, 1e-6, '2s·3s'); near(ov(2, 3, 1), 0, 1e-6, '2p·3p'); near(ov(3, 4, 2), 0, 1e-6, '3d·4d');
});

test('徑向節面：數目 = n − l − 1；2s 在 2a0、3s 在 (9 ± 3√3)/2 a0、3p 在 6a0；He+ 的 2s 縮成 1a0', function () {
  for (let n = 1; n <= 5; n++) for (let l = 0; l < n && l <= 3; l++) {
    const nd = A.radialNodes(n, l, 1);
    assert.strictEqual(nd.length, n - l - 1, n + A.L_NAMES[l]);
    nd.forEach(r => near(A.R(n, l, r, 1), 0, 1e-9, n + A.L_NAMES[l] + ' 節面上 R = 0'));
  }
  near(A.radialNodes(2, 0, 1)[0], 2, 1e-6);
  const n3 = A.radialNodes(3, 0, 1);
  near(n3[0], (9 - 3 * Math.sqrt(3)) / 2, 1e-6); near(n3[1], (9 + 3 * Math.sqrt(3)) / 2, 1e-6);
  near(A.radialNodes(3, 1, 1)[0], 6, 1e-6);
  near(A.radialNodes(2, 0, 2)[0], 1, 1e-6);
});

test('角節面：數目 = l（dz² 的上下兩個圓錐算 2 個）；平面與圓錐上 Y = 0；dz² 的圓錐與 z 軸夾 54.74°（cos²θ = 1/3）', function () {
  Object.keys(A.ANG).forEach(k => {
    const a = A.ANG[k];
    assert.strictEqual(a.nodes.length, a.l, k);
    a.nodes.forEach(nd => {
      for (let t = 0; t < 40; t++) {
        let p;
        if (nd.type === 'plane') {
          // 平面上任取一點：與法線垂直的兩個向量組合
          const nn = nd.n, ref = Math.abs(nn[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
          const u = [nn[1] * ref[2] - nn[2] * ref[1], nn[2] * ref[0] - nn[0] * ref[2], nn[0] * ref[1] - nn[1] * ref[0]];
          const v = [nn[1] * u[2] - nn[2] * u[1], nn[2] * u[0] - nn[0] * u[2], nn[0] * u[1] - nn[1] * u[0]];
          const s = Math.cos(t * 0.7), c = Math.sin(t * 0.7 + 0.3);
          p = [s * u[0] + c * v[0], s * u[1] + c * v[1], s * u[2] + c * v[2]];
        } else {
          const ph = t * 0.37, th = nd.theta;
          p = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
        }
        near(A.Y(k, p[0], p[1], p[2]), 0, 1e-12, k + ' ' + nd.zh);
      }
    });
  });
  near(A.ANG.dz2.nodes[0].theta * 180 / Math.PI, 54.7356, 1e-3);
  near(A.ANG.dz2.nodes[1].theta * 180 / Math.PI, 180 - 54.7356, 1e-3);
  near(A.ANG.fz3.nodes[1].theta * 180 / Math.PI, 39.2315, 1e-3);
  near(A.ANG.fxz2.nodes[1].theta * 180 / Math.PI, 63.4349, 1e-3);
});

test('整片切面都是節面：2pz 的 xy 切面（過原子核）是，偏離原子核或其他切面就不是；s 與副層加總永遠不是', function () {
  assert.ok(A.sliceIsNodal('pz', 'xy', 0));
  assert.ok(!A.sliceIsNodal('pz', 'xy', 0.5));
  assert.ok(!A.sliceIsNodal('pz', 'xz', 0));
  assert.ok(A.sliceIsNodal('px', 'yz', 0) && A.sliceIsNodal('py', 'xz', 0));
  assert.ok(A.sliceIsNodal('dxy', 'xz', 0) && A.sliceIsNodal('dxy', 'yz', 0) && !A.sliceIsNodal('dxy', 'xy', 0));
  assert.ok(!A.sliceIsNodal('dz2', 'xy', 0) && !A.sliceIsNodal('dx2y2', 'xz', 0));
  assert.ok(A.sliceIsNodal('fxyz', 'xy', 0) && A.sliceIsNodal('fxyz', 'xz', 0) && A.sliceIsNodal('fxyz', 'yz', 0));
  assert.ok(!A.sliceIsNodal('s', 'xy', 0));
  assert.ok(!A.sliceIsNodal('pz', 'xy', 0, true));
  // 切面上取點驗證 |ψ| = 0
  for (let u = -5; u <= 5; u += 0.5) for (let v = -5; v <= 5; v += 0.5) {
    const p = A.slicePoint('xy', u, v, 0);
    near(A.psi({ n: 2, l: 1, key: 'pz', Z: 1 }, p[0], p[1], p[2]), 0, 1e-15);
  }
});

test('最可能半徑：1s = a0（波耳半徑）、2p = 4a0、3d = 9a0、4f = 16a0（l = n − 1 時 = n²a0/Z）；He+ 1s = a0/2', function () {
  near(A.rMax(1, 0, 1), 1, 1e-6); near(A.rMax(2, 1, 1), 4, 1e-6); near(A.rMax(3, 2, 1), 9, 1e-5); near(A.rMax(4, 3, 1), 16, 1e-5);
  near(A.rMax(1, 0, 2), 0.5, 1e-6); near(A.rMax(1, 0, 3), 1 / 3, 1e-6);
  near(A.rMax(2, 0, 1), 3 + Math.sqrt(5), 1e-5, '2s 外層峰');
  const pk = A.radialPeaks(2, 0, 1);
  assert.strictEqual(pk.length, 2);
  near(pk[0], 3 - Math.sqrt(5), 1e-4, '2s 內層小峰'); near(pk[1], 3 + Math.sqrt(5), 1e-4);
  assert.strictEqual(A.radialPeaks(3, 0, 1).length, 3, '3s 有三個峰');
  near(A.rMax(1, 0, 1) * A.A0_PM, 52.92, 0.01, '1s 最可能半徑 52.9 pm');
});

test('平均半徑 ⟨r⟩ = [3n² − l(l+1)]/(2Z) 與數值積分一致', function () {
  for (let n = 1; n <= 5; n++) for (let l = 0; l < n && l <= 3; l++) [1, 2].forEach(Z => {
    const hi = A.rCut(n, Z), N = 20000, h = hi / N;
    let s = 0;
    for (let i = 1; i < N; i++) { const r = i * h; s += r * A.radialP(n, l, r, Z); }
    near(s * h, A.meanR(n, l, Z), 1e-5 * A.meanR(n, l, Z), n + A.L_NAMES[l] + ' Z=' + Z);
  });
  near(A.meanR(1, 0, 1), 1.5, 1e-12); near(A.meanR(2, 1, 1), 5, 1e-12);
});

test('累積機率：1s 解析式 1 − e^(−2r)(1 + 2r + 2r²)；一半在 1.337a0 以內、九成在 2.661a0 以內', function () {
  [0.2, 0.5, 1, 1.5, 2, 3, 5].forEach(r => near(A.cumulative(1, 0, r, 1), 1 - Math.exp(-2 * r) * (1 + 2 * r + 2 * r * r), 1e-9, 'r=' + r));
  near(A.rFrac(1, 0, 0.5, 1), 1.3370, 1e-3);
  near(A.rFrac(1, 0, 0.9, 1), 2.6612, 1e-3);
  // 2s：節面以內的機率（解析值 1 − e^(−2)·(1 + 2 + 2 + 0)… 用數值與表互相核對）
  const t = A.radialTable(2, 0, 1, 40, 4000);
  near(A.lookup(t, t.C, 2), A.cumulative(2, 0, 2, 1), 1e-6, '徑向表的累積與辛普森一致');
  near(A.cumulative(2, 0, 2, 1), 1 - Math.exp(-2) * 7, 1e-8, '2s 節面以內 = 1 − 7e^(−2) = 5.27%');
});

test('能量只和 n 有關：E1 = −13.61 eV = −1312.7 kJ/mol；E2 = E1/4；He+ 是 Z² = 4 倍', function () {
  near(A.energyEV(1, 1), -13.6057, 1e-4);
  near(A.energyKJ(1, 1), -1312.75, 0.05);
  near(A.energyEV(2, 1), A.energyEV(1, 1) / 4, 1e-12);
  near(A.energyEV(1, 2), 4 * A.energyEV(1, 1), 1e-12);
  near(A.energyEV(2, 1) - A.energyEV(1, 1), 10.204, 1e-3, '巴耳末系前一階：來曼 α 光子 10.20 eV');
});

test('|Y| 的最大值：s = 1/(2√π)、pz = √(3/4π)、dz² = √(5/π)/2；|ψ|² 最大值 = max R² × max Y²', function () {
  near(A.maxAbsY('s'), 0.2820948, 1e-6);
  near(A.maxAbsY('pz'), 0.4886025, 1e-6);
  near(A.maxAbsY('dz2'), 0.6307831, 1e-6);
  near(A.maxAbsY('dxy'), 0.5462742, 1e-6);
  near(A.maxDensity({ n: 1, l: 0, key: 's', Z: 1 }), 1 / Math.PI, 1e-9, '1s 原子核處 |ψ|² = 1/π');
});

test('副層加總是球形（Unsöld 定理）：Σ Y² = (2l+1)/(4π)', function () {
  A.KEYS.forEach((keys, l) => {
    for (let t = 0; t < 30; t++) {
      const z = Math.cos(t * 0.31), s = Math.sqrt(1 - z * z), ph = t * 1.13;
      const x = s * Math.cos(ph), y = s * Math.sin(ph);
      near(keys.reduce((a, k) => a + A.Y(k, x, y, z) ** 2, 0), (2 * l + 1) / (4 * Math.PI), 1e-12, 'l=' + l);
    }
  });
  const o = { n: 3, l: 2, key: 'dxy', Z: 1 };
  near(A.density(o, 1, 2, 0.5, true), A.R(3, 2, Math.hypot(1, 2, 0.5), 1) ** 2 / (4 * Math.PI), 1e-15);
});

test('90% 等值面：1s 的 |ψ| = c 就是半徑 2.661a0 的球；2pz、3dz²、4fxyz 用抽樣核對包住的機率', function () {
  const o1 = { n: 1, l: 0, key: 's', Z: 1 };
  const iso = A.isoLevel(o1, 0.9);
  near(iso.c, A.R(1, 0, 2.6612, 1) * A.maxAbsY('s'), 0.01 * iso.c);
  near(iso.rOut, 2.6612, 0.03);
  const rand = A.rng32(42);
  [{ n: 2, l: 1, key: 'pz', Z: 1 }, { n: 3, l: 2, key: 'dz2', Z: 1 }, { n: 4, l: 3, key: 'fxyz', Z: 2 }, { n: 3, l: 0, key: 's', Z: 1 }].forEach(o => {
    [0.5, 0.9].forEach(f => {
      const c = A.isoLevel(o, f).c, S = A.sample(o, 40000, rand);
      let k = 0;
      for (let i = 0; i < 40000; i++) if (Math.abs(A.psi(o, S.pos[3 * i], S.pos[3 * i + 1], S.pos[3 * i + 2])) > c) k++;
      near(k / 40000, f, 0.012, A.id(o) + ' ' + f * 100 + '%');
    });
  });
  // 副層加總：等值面是球殼
  const os = { n: 2, l: 1, key: 'pz', Z: 1 }, is = A.isoLevel(os, 0.9, true);
  assert.ok(is.c > 0 && is.rOut > 4);
});

test('抽樣（機率雲）：平均半徑 ≈ ⟨r⟩；2pz 的 ⟨z²⟩/⟨r²⟩ = 3/5、z > 0 的點 ψ 為正；1s 的點有一半在 1.337a0 以內', function () {
  const rand = A.rng32(7);
  const o = { n: 2, l: 1, key: 'pz', Z: 1 }, S = A.sample(o, 60000, rand);
  let sr = 0, sz2 = 0, sr2 = 0, bad = 0;
  for (let i = 0; i < 60000; i++) {
    const x = S.pos[3 * i], y = S.pos[3 * i + 1], z = S.pos[3 * i + 2], r2 = x * x + y * y + z * z;
    sr += Math.sqrt(r2); sz2 += z * z; sr2 += r2;
    if ((z > 0) !== (S.sign[i] > 0)) bad++;
  }
  near(sr / 60000, 5, 0.06, '⟨r⟩');
  near(sz2 / sr2, 0.6, 0.01, '⟨z²⟩/⟨r²⟩');
  assert.strictEqual(bad, 0, '正負號與 z 的正負一致');
  const S1 = A.sample({ n: 1, l: 0, key: 's', Z: 1 }, 40000, rand);
  let k = 0;
  for (let i = 0; i < 40000; i++) if (Math.hypot(S1.pos[3 * i], S1.pos[3 * i + 1], S1.pos[3 * i + 2]) < 1.337) k++;
  near(k / 40000, 0.5, 0.01);
  // He+：點雲縮小一半
  const S2 = A.sample({ n: 1, l: 0, key: 's', Z: 2 }, 30000, rand);
  let s2 = 0; for (let i = 0; i < 30000; i++) s2 += Math.hypot(S2.pos[3 * i], S2.pos[3 * i + 1], S2.pos[3 * i + 2]);
  near(s2 / 30000, 0.75, 0.015);
});

test('測驗抽題與最佳切面：不連續出同一題；最佳切面不會整片是節面', function () {
  const rand = A.rng32(3);
  let prev = null;
  for (let i = 0; i < 300; i++) { const o = A.pickQuiz(rand, prev); assert.notStrictEqual(A.id(o), prev); assert.ok(o.n <= 4); prev = A.id(o); }
  A.list(4).forEach(o => {
    const b = A.bestPlane(o.key), off = b.offsetFrac * A.rMax(o.n, o.l, 1);
    assert.ok(!A.sliceIsNodal(o.key, b.plane, off), A.id(o));
  });
});

console.log(process.exitCode ? '有測試失敗' : '全部 ' + passed + ' 項通過');
