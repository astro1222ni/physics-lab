// 以 Node 執行：node tests/hydrogen-spectrum-core.test.js
'use strict';
const assert = require('assert');
const HC = require('../js/hydrogen-spectrum-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`);
}
function rel(a, b, r, msg) {
  assert.ok(Math.abs(a - b) <= r * Math.abs(b), (msg || '') + ` 期望 ${b}（相對誤差 ${r}），得到 ${a}`);
}

console.log('hydrogen-spectrum-core');

test('常數：R_H = R∞/(1 + me/mp) = 1.09678 × 10^7 m^-1，游離能 13.598 eV，hc = 1239.84 eV·nm', () => {
  rel(HC.R_H, 1.09678e7, 1e-5, 'R_H');
  close(HC.RY_EV, 13.5983, 0.0001, '游離能');
  close(HC.HC_EV_NM, 1239.842, 0.001, 'hc');
  close(HC.energy(1), -13.6, 0.002, 'E1 ≈ −13.6 eV');
  rel(HC.HBAR * 2 * Math.PI, HC.H, 1e-15, 'ħ');
});

test('能階 E_n = −13.6 eV/n²；n → ∞ 時為 0', () => {
  for (let n = 1; n <= 30; n++) rel(HC.energy(n) * n * n, -HC.RY_EV, 1e-14, 'n = ' + n);
  assert.strictEqual(HC.energy(Infinity), 0);
  close(HC.energy(2), -3.40, 0.001);
  close(HC.energy(3), -1.511, 0.001);
  rel(HC.energyJ(1), HC.energy(1) * HC.E_CHARGE, 1e-15);
});

test('芮得柏公式與實驗波長（真空）：Hα、Hβ、Hγ、Hδ、Lyα、Lyβ、Paα', () => {
  // NIST 實測真空波長（含精細結構的平均）；波耳模型與實測只差約 0.01 nm
  const cases = [[3, 2, 656.461, 0.02], [4, 2, 486.269, 0.01], [5, 2, 434.169, 0.01], [6, 2, 410.292, 0.01],
    [2, 1, 121.567, 0.003], [3, 1, 102.572, 0.003], [4, 3, 1875.61, 0.1]];
  cases.forEach(c => close(HC.wavelength(c[0], c[1]), c[2], c[3], c[0] + '→' + c[1]));
  // 1/λ = R_H (1/nf² − 1/ni²)
  for (let ni = 2; ni <= 9; ni++) for (let nf = 1; nf < ni; nf++)
    rel(1e9 / HC.wavelength(ni, nf), HC.R_H * (1 / (nf * nf) - 1 / (ni * ni)), 1e-13);
});

test('空氣中的波長（課本常列的值）：Hα 656.28、Hβ 486.13、Hγ 434.05、Hδ 410.17、Paα 1875.1 nm', () => {
  close(HC.airWavelength(HC.wavelength(3, 2)), 656.28, 0.015, 'Hα');
  close(HC.airWavelength(HC.wavelength(4, 2)), 486.13, 0.015, 'Hβ');
  close(HC.airWavelength(HC.wavelength(5, 2)), 434.05, 0.015, 'Hγ');
  close(HC.airWavelength(HC.wavelength(6, 2)), 410.17, 0.015, 'Hδ');
  close(HC.airWavelength(HC.wavelength(4, 3)), 1875.1, 0.1, 'Paα');
  // 空氣折射率約 1.00028，所以空氣中的波長比真空短約 0.03%
  close(HC.airIndex(589.3) - 1, 2.77e-4, 0.03e-4, 'n_air − 1');
  // 真空紫外線沒有空氣中的值
  assert.ok(isNaN(HC.airWavelength(121.6)));
});

test('光子：ΔE = hf = hc/λ，且 E_i − E_f = ΔE（能量守恆）', () => {
  for (let ni = 2; ni <= 7; ni++) for (let nf = 1; nf < ni; nf++) {
    const t = HC.transition(ni, nf);
    rel(t.E, HC.energy(ni) - HC.energy(nf), 1e-13, '能階差');
    rel(t.E, HC.HC_EV_NM / t.lambda, 1e-12, 'E = hc/λ');
    rel(t.EJ, HC.H * t.f, 1e-12, 'E = hf');
    rel(t.f * t.lambda * 1e-9, HC.C, 1e-12, 'fλ = c');
    assert.ok(t.emission);
    const a = HC.transition(nf, ni);
    assert.ok(!a.emission);
    rel(a.E, t.E, 1e-15, '吸收與發射的光子能量相同');
    close(a.lambda, t.lambda, 1e-12);
  }
  const p = HC.photonFromWavelength(500);
  rel(p.E, 2.4797, 1e-4);
  rel(HC.photonFromEnergy(p.E).lambda, 500, 1e-14);
});

test('線系極限：來曼 91.18 nm、巴耳末 364.70 nm、帕申 820.59 nm；系內波長隨 n_i 遞減趨近極限', () => {
  close(HC.seriesLimit(1), 91.176, 0.002);
  close(HC.seriesLimit(2), 364.705, 0.002);
  close(HC.seriesLimit(3), 820.59, 0.01);
  for (let nf = 1; nf <= 6; nf++) {
    let prev = Infinity;
    for (let ni = nf + 1; ni <= 200; ni++) {
      const l = HC.wavelength(ni, nf);
      assert.ok(l < prev && l > HC.seriesLimit(nf), '遞減且大於極限');
      prev = l;
    }
    rel(HC.wavelength(1e6, nf), HC.seriesLimit(nf), 1e-9, '極限');
    rel(HC.HC_EV_NM / HC.seriesLimit(nf), HC.ionizationEnergy(nf), 1e-12, '系限光子能量 = 該能階的游離能');
  }
});

test('線系名稱與波段：Lyman 全在紫外線、Balmer 前四條在可見光、Paschen 起全在紅外線', () => {
  assert.strictEqual(HC.lineName(3, 2), 'Hα');
  assert.strictEqual(HC.lineName(6, 2), 'Hδ');
  assert.strictEqual(HC.lineName(2, 1), 'Lyα');
  assert.strictEqual(HC.lineName(5, 3), 'Paβ');
  assert.strictEqual(HC.lineName(7, 4), 'Brγ');
  assert.strictEqual(HC.series(2).en, 'Balmer series');
  for (let ni = 2; ni <= 7; ni++) assert.strictEqual(HC.transition(ni, 1).region, 'UV');
  for (let ni = 3; ni <= 7; ni++) assert.strictEqual(HC.transition(ni, 2).region, 'VIS');
  assert.strictEqual(HC.region(HC.seriesLimit(2)), 'UV', '巴耳末系限在紫外線');
  for (let nf = 3; nf <= 6; nf++) for (let ni = nf + 1; ni <= 7; ni++) assert.strictEqual(HC.transition(ni, nf).region, 'IR');
});

test('波耳軌道：r_n = n² × 0.529 Å、v_n = αc/n、L = nħ、2πr = nλ（物質波）', () => {
  close(HC.radius(1) * 1e10, 0.5295, 0.0001, 'r1（Å）');
  close(HC.speed(1) / 1e6, 2.188, 0.001, 'v1（10^6 m/s）');
  close(HC.period(1) * 1e16, 1.521, 0.001, 'T1（10^-16 s）');
  for (let n = 1; n <= 20; n++) {
    rel(HC.radius(n), n * n * HC.radius(1), 1e-14, 'r ∝ n²');
    rel(HC.speed(n), HC.speed(1) / n, 1e-14, 'v ∝ 1/n');
    rel(HC.angularMomentum(n), n * HC.HBAR, 1e-10, 'L = μvr = nħ（CODATA 常數有 11 位有效數字）');
    rel(HC.period(n), n * n * n * HC.period(1), 1e-13, 'T ∝ n³');
    rel(2 * Math.PI * HC.radius(n), n * HC.deBroglie(n), 1e-10, '2πr = nλ');
  }
});

test('能量關係：動能 = −E_n、位能 = 2E_n、E_n = −ke²/(2r_n)', () => {
  const k = 8.9875517923e9;
  for (let n = 1; n <= 10; n++) {
    rel(HC.kinetic(n), -HC.energy(n), 1e-9, '動能');
    rel(HC.potential(n), 2 * HC.energy(n), 1e-14, '位能');
    rel(-k * HC.E_CHARGE * HC.E_CHARGE / (2 * HC.radius(n)) / HC.E_CHARGE, HC.energy(n), 1e-8, '庫侖能量');
    rel(HC.kinetic(n) + HC.potential(n), HC.energy(n), 1e-9, '總能量');
  }
});

test('吸收：只吸收能量剛好等於能階差的光子，其他穿過；超過游離能則游離', () => {
  // 剛好等於能階差
  for (let n = 1; n <= 6; n++) for (let m = n + 1; m <= 7; m++) {
    const E = HC.energy(m) - HC.energy(n);
    const r = HC.absorb(n, E);
    assert.strictEqual(r.type, 'absorb', n + '→' + m);
    assert.strictEqual(r.to, m);
    assert.strictEqual(HC.absorb(n, E + 0.004).to, m, '在容許誤差內');
  }
  // 差了一點就穿過
  assert.strictEqual(HC.absorb(1, 10.0).type, 'pass');
  assert.strictEqual(HC.absorb(1, 10.0).nearest.to, 2);
  assert.strictEqual(HC.absorb(1, 12.7486 + 0.006).type, 'pass');
  assert.strictEqual(HC.absorb(1, 2.55).type, 'pass', '可見光打不動基態');
  assert.strictEqual(HC.absorb(2, 2.55).to, 4, '同一個光子可以被 n = 2 的原子吸收');
  // 游離
  const ion = HC.absorb(1, 15);
  assert.strictEqual(ion.type, 'ionize');
  close(ion.K, 15 - 13.5983, 1e-4, '多出的能量變成動能');
  assert.strictEqual(HC.absorb(2, 3.5).type, 'ionize');
  close(HC.absorb(1, 13.6).K, 0.0017, 0.0001);
  // 課本近似值（13.6 eV）算出的能量也在容許範圍內
  for (let m = 2; m <= 7; m++) assert.strictEqual(HC.absorb(1, 13.6 * (1 - 1 / (m * m))).to, m);
  // 更高的能階（n ≥ 8）也會吸收
  assert.strictEqual(HC.absorb(1, HC.energy(9) - HC.energy(1)).to, 9);
  assert.strictEqual(HC.absorb(1, HC.energy(40) - HC.energy(1)).to, 40);
  // 游離能附近：容許誤差內的能量不會「掉到縫裡」
  for (let d = 0; d < 0.012; d += 0.0001) {
    const r = HC.absorb(1, HC.RY_EV - d);
    assert.ok(r.type !== 'pass', '差 ' + d.toFixed(4) + ' eV 應被吸收');
  }
  // 只剩質子時，光子一律穿過
  assert.strictEqual(HC.absorb(Infinity, 13.6).type, 'pass');
  assert.ok(HC.absorb(Infinity, 1.89).bare);
});

test('復合：動能 K 的自由電子被捕獲到 n，放出 K + |E_n| 的光子', () => {
  close(HC.recombination(0, 2).lambda, HC.seriesLimit(2), 1e-9, 'K = 0 時恰為系限');
  const K = HC.transition(3, 2).E - HC.ionizationEnergy(3);
  close(HC.recombination(K, 3).lambda, HC.wavelength(3, 2), 1e-9, '與 Hα 同色的復合光子');
  close(K, -HC.energy(6), 1e-12, '1/4 − 2/9 = 1/36');
  // 能量守恆：先游離（光子 E）再捕獲到原能階，放出的光子能量 = E
  const E = 14.2, n = 1;
  const r = HC.absorb(n, E);
  close(HC.recombination(r.K, n).E, E, 1e-12);
});

test('躍遷機率表（NIST）與精確的徑向積分一致（誤差 < 0.01%）', () => {
  // 獨立重算：A(nl→n′l′) = (4αω³/3c²)·(l_>/(2l+1))·|⟨n′l′|r|nl⟩|²，以統計權重平均成 n → n′
  function lag(k, a, x) {
    if (k === 0) return 1;
    let L0 = 1, L1 = 1 + a - x;
    for (let i = 1; i < k; i++) { const L2 = ((2 * i + 1 + a - x) * L1 - (i + a) * L0) / (i + 1); L0 = L1; L1 = L2; }
    return L1;
  }
  const RMAX = 300, N = 60000, dr = RMAX / N, cache = {};
  function R(n, l) {
    const key = n + ',' + l;
    if (cache[key]) return cache[key];
    const v = new Float64Array(N + 1);
    let s = 0;
    for (let i = 0; i <= N; i++) { const x = 2 * i * dr / n; v[i] = Math.pow(x, l) * Math.exp(-x / 2) * lag(n - l - 1, 2 * l + 1, x); }
    for (let i = 0; i <= N; i++) { const r = i * dr, w = (i === 0 || i === N) ? 1 : (i % 2 ? 4 : 2); s += w * v[i] * v[i] * r * r; }
    const k = 1 / Math.sqrt(s * dr / 3);
    for (let i = 0; i <= N; i++) v[i] *= k;
    return (cache[key] = v);
  }
  function radial(n, l, n2, l2) {
    const a = R(n, l), b = R(n2, l2);
    let s = 0;
    for (let i = 0; i <= N; i++) { const r = i * dr, w = (i === 0 || i === N) ? 1 : (i % 2 ? 4 : 2); s += w * a[i] * b[i] * r * r * r; }
    return s * dr / 3 * HC.A_H;
  }
  for (let n = 2; n <= 7; n++) for (let m = 1; m < n; m++) {
    const w = HC.transition(n, m).E * HC.E_CHARGE / HC.HBAR;
    let tot = 0;
    for (let l = 0; l < n; l++) for (const l2 of [l - 1, l + 1]) {
      if (l2 < 0 || l2 >= m) continue;
      const I = radial(n, l, m, l2);
      tot += (2 * l + 1) * 4 / 3 * HC.ALPHA * w * w * w / (HC.C * HC.C) * Math.max(l, l2) / (2 * l + 1) * I * I;
    }
    rel(HC.einsteinA(n, m), tot / (n * n), 1e-4, 'A(' + n + '→' + m + ')');
  }
});

test('振子強度：由 A 換算的 f(1→n) 符合精確公式（f12 = 0.4162、f13 = 0.0791）', () => {
  close(HC.lymanF(2), 0.41620, 0.00001);
  close(HC.lymanF(3), 0.07910, 0.00001);
  for (let n = 2; n <= 7; n++) rel(HC.oscillatorStrength(1, n), HC.lymanF(n), 0.002, 'f(1→' + n + ')');
  close(HC.oscillatorStrength(2, 3), 0.6407, 0.001, 'Hα 的 f23');
});

test('分支比總和為 1；n = 2 只能掉到 n = 1；平均壽命 τ = 1/ΣA', () => {
  for (let n = 2; n <= 7; n++) {
    const b = HC.branching(n);
    let s = 0;
    for (let k = 1; k < n; k++) { assert.ok(b[k] > 0); s += b[k]; }
    close(s, 1, 1e-12, 'n = ' + n);
    rel(HC.lifetime(n), 1 / HC.totalA(n), 1e-15);
  }
  close(HC.branching(2)[1], 1, 0);
  close(HC.branching(3)[2], 0.4417, 0.0001, 'n = 3 → 2 的機率（Hα）');
  close(HC.lifetime(2) * 1e9, 2.128, 0.001, 'τ2（ns）');
  assert.strictEqual(HC.lifetime(1), Infinity, '基態不會衰變');
});

test('激發門檻：電子動能 < 10.2 eV 無法激發；12.09 eV 起才有 n = 3（Hα）', () => {
  assert.deepStrictEqual(HC.excitationProbs(10.19), {});
  assert.deepStrictEqual(Object.keys(HC.excitationProbs(10.2)), ['2']);
  assert.deepStrictEqual(Object.keys(HC.excitationProbs(12.08)), ['2']);
  assert.deepStrictEqual(Object.keys(HC.excitationProbs(12.09)), ['2', '3']);
  assert.deepStrictEqual(Object.keys(HC.excitationProbs(13.3)).map(Number), [2, 3, 4, 5, 6]);
  assert.deepStrictEqual(Object.keys(HC.excitationProbs(13.5)).map(Number), [2, 3, 4, 5, 6, 7]);
  const p = HC.excitationProbs(12.5);
  close(p[2] + p[3], 1, 1e-12);
  rel(p[3] / p[2], HC.lymanF(3) / HC.lymanF(2), 1e-12, '機率 ∝ 振子強度');
});

test('串級：每條路徑都回到基態，光子能量總和 = 能階差；每次激發剛好一個來曼光子', () => {
  const rand = HC.rng(7);
  for (let i = 0; i < 3000; i++) {
    const n0 = 2 + Math.floor(rand() * 6);
    const path = HC.cascade(n0, rand);
    assert.strictEqual(path[path.length - 1][1], 1, '回到基態');
    let s = 0, prev = n0;
    path.forEach(st => { assert.strictEqual(st[0], prev); assert.ok(st[1] < st[0]); s += HC.transition(st[0], st[1]).E; prev = st[1]; });
    close(s, HC.energy(n0) - HC.energy(1), 1e-10, '能量守恆');
  }
  [10.5, 12.3, 12.9, 13.1, 13.25, 13.45].forEach(K => {
    const probs = HC.excitationProbs(K), ex = HC.expectedPhotons(probs);
    let lyman = 0, energySum = 0, expectE = 0;
    Object.keys(ex).forEach(k => {
      const [a, b] = k.split('-').map(Number);
      if (b === 1) lyman += ex[k];
      energySum += ex[k] * HC.transition(a, b).E;
    });
    Object.keys(probs).forEach(n => { expectE += probs[n] * (HC.energy(+n) - HC.energy(1)); });
    close(lyman, 1, 1e-12, '每次激發一個來曼光子（K = ' + K + '）');
    close(energySum, expectE, 1e-10, '平均能量守恆');
  });
});

test('蒙地卡羅串級的光子數符合精確期望值（固定亂數種子，誤差 < 4σ）', () => {
  const K = 13.45, probs = HC.excitationProbs(K), ex = HC.expectedPhotons(probs);
  const rand = HC.rng(12345), M = 200000, cnt = {};
  for (let i = 0; i < M; i++) HC.cascade(HC.pick(probs, rand), rand).forEach(st => { const k = st[0] + '-' + st[1]; cnt[k] = (cnt[k] || 0) + 1; });
  Object.keys(ex).forEach(k => {
    const mean = ex[k] * M, sd = Math.sqrt(mean);
    assert.ok(Math.abs((cnt[k] || 0) - mean) < 4 * sd + 1, k + ` 期望 ${mean.toFixed(1)}，得到 ${cnt[k]}`);
  });
  // Hα 主要來自 n = 3（及更高能階串級下來的部分）
  assert.ok(ex['3-2'] > ex['4-2'] && ex['4-2'] > ex['5-2'] && ex['5-2'] > ex['6-2'], '巴耳末線由 Hα 到 Hδ 漸弱');
});

test('顏色：Hα 紅、Hβ 青藍、Hγ 藍紫、Hδ 紫；紫外線與紅外線不給顏色（畫面用假色）', () => {
  const c = l => HC.wavelengthToRGB(l);
  const a = c(656.47), b = c(486.27), g = c(434.17), d = c(410.29);
  assert.ok(a[0] > 200 && a[1] < 60 && a[2] < 60, 'Hα 紅 ' + a);
  assert.ok(b[2] > b[0] && b[1] > b[0] + 80, 'Hβ 青藍 ' + b);
  assert.ok(g[2] > 200 && g[0] > g[1], 'Hγ 藍紫 ' + g);
  assert.ok(d[2] > d[1] && d[0] > d[1] + 40, 'Hδ 紫 ' + d);
  assert.ok(c(397.1)[0] > 40, '397 nm 仍是紫色（有紅色成分）');
  const gr = c(530); assert.ok(gr[1] > gr[0] && gr[1] > gr[2], '綠');
  const y = c(580); assert.ok(y[0] > 200 && y[1] > 120 && y[2] < 60, '黃');
  assert.strictEqual(c(121.6), null);
  assert.strictEqual(c(1875), null);
  // 放電管的混合色：紅（Hα）＋青藍（Hβ）＋紫 → 粉紫色
  const ex = HC.expectedPhotons(HC.excitationProbs(13.45));
  const mix = HC.mixColor(Object.keys(ex).map(k => { const [p, q] = k.split('-').map(Number); const t = HC.transition(p, q); return { lambda: t.lambda, power: ex[k] * t.E }; }));
  assert.ok(mix.rgb[0] > 200 && mix.rgb[2] > 120 && mix.rgb[1] < mix.rgb[2], '粉紫 ' + mix.rgb);
  assert.strictEqual(HC.mixColor([{ lambda: 121.6, power: 1 }]), null, '只有紫外線：看不見');
});

console.log(`\n${passed} 項通過`);
