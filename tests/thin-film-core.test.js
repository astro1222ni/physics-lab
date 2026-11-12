// 以 Node 執行：node tests/thin-film-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/thin-film-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, rel, msg) {
  const tol = rel * Math.max(Math.abs(a), Math.abs(b), 1e-30);
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
function near(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`);
}
const DEG = Math.PI / 180;
const nm = 1e-9, um = 1e-6, mm = 1e-3;

// 直接把膜內多次反射的光逐道相加（複數），與艾里公式獨立比對
function seriesR(n1, n2, n3, d, lam, cos1, pol, terms) {
  const c2 = C.cosRefr(n1, n2, cos1), c3 = C.cosRefr(n1, n3, cos1);
  const f12 = C.fresnel(n1, cos1, n2, c2), f21 = C.fresnel(n2, c2, n1, cos1), f23 = C.fresnel(n2, c2, n3, c3);
  const k = pol === 's' ? 'rs' : 'rp', kt = pol === 's' ? 'ts' : 'tp';
  const r12 = f12[k], t12 = f12[kt], t21 = f21[kt], r21 = f21[k], r23 = f23[k];
  const delta = 4 * Math.PI * n2 * d * c2 / lam;
  let re = r12, im = 0;
  let amp = t12 * r23 * t21;               // 第二道：進膜、膜底反射、出膜
  for (let j = 1; j <= terms; j++) {
    re += amp * Math.cos(j * delta); im += amp * Math.sin(j * delta);
    amp *= r21 * r23;                      // 每多來回一次：膜頂（由內）反射 × 膜底反射
  }
  return re * re + im * im;
}

console.log('thin-film-core');

test('菲涅耳：正入射 r = (n1 − n2)/(n1 + n2)，射向光密介質時 r < 0（反射多 π 相位）', () => {
  const f = C.fresnel(1, 1, 1.52, 1);
  close(f.rs, (1 - 1.52) / 2.52, 1e-14);
  close(f.ts, 2 / 2.52, 1e-14);
  assert.ok(f.rs < 0, '空氣 → 玻璃要有半波損失');
  const g = C.fresnel(1.52, 1, 1, 1);
  assert.ok(g.rs > 0, '玻璃 → 空氣沒有半波損失');
  close(g.rs, -f.rs, 1e-14, 'r21 = −r12');
  close(Math.abs(f.rp), Math.abs(f.rs), 1e-14, '正入射時 |rp| = |rs|');
});

test('司乃耳定律 n1 sinθ1 = n2 sinθ2；光密 → 光疏超過臨界角回傳 NaN', () => {
  for (const th of [0, 10, 30, 45, 60, 80]) {
    const c1 = Math.cos(th * DEG), c2 = C.cosRefr(1, 1.33, c1);
    close(1.33 * Math.sqrt(1 - c2 * c2), Math.sin(th * DEG), 1e-12, th + '°');
  }
  assert.ok(Number.isNaN(C.cosRefr(1.52, 1, Math.cos(50 * DEG))), '玻璃 → 空氣 50° 全反射');
});

test('單一界面能量守恆：r² + (n2 cosθ2 / n1 cosθ1) t² = 1（s、p）', () => {
  for (const [n1, n2] of [[1, 1.33], [1, 1.52], [1.52, 1], [1.33, 1.6]]) {
    for (const th of [0, 20, 40, 55]) {
      const c1 = Math.cos(th * DEG), c2 = C.cosRefr(n1, n2, c1);
      if (Number.isNaN(c2)) continue;
      const f = C.fresnel(n1, c1, n2, c2), k = n2 * c2 / (n1 * c1);
      close(f.rs * f.rs + k * f.ts * f.ts, 1, 1e-13, `s ${n1}→${n2} ${th}°`);
      close(f.rp * f.rp + k * f.tp * f.tp, 1, 1e-13, `p ${n1}→${n2} ${th}°`);
    }
  }
});

test('多光束（艾里公式）能量守恆 R + T = 1：肥皂膜、空氣間隙、增透膜，各種角度與偏振', () => {
  const cases = [[1, 1.33, 1], [1.52, 1, 1.52], [1.52, 1.33, 1.52], [1, 1.38, 1.52], [1.52, 1.7, 1.52]];
  for (const [a, b, c] of cases) {
    for (const th of [0, 25, 50]) {
      const L = C.layer(a, b, c, Math.cos(th * DEG));
      if (Number.isNaN(L.cos2) || Number.isNaN(L.cos3)) continue;
      for (const d of [0, 37, 123.4, 480, 2500]) {
        for (const lam of [400, 532, 700]) {
          close(L.Rs(d, lam) + L.Ts(d, lam), 1, 1e-12, `s ${a}|${b}|${c} ${th}° d=${d}`);
          close(L.Rp(d, lam) + L.Tp(d, lam), 1, 1e-12, `p ${a}|${b}|${c} ${th}° d=${d}`);
          close(L.R(d, lam) + L.T(d, lam), 1, 1e-12, '自然光');
        }
      }
    }
  }
});

test('艾里公式 = 把無限多道反射光逐道相加（獨立的級數計算）', () => {
  for (const [a, b, c, th] of [[1, 1.33, 1, 0], [1, 1.33, 1, 40], [1.52, 1, 1.52, 0], [1, 1.38, 1.52, 30]]) {
    const L = C.layer(a, b, c, Math.cos(th * DEG));
    for (const d of [55, 300, 777]) {
      close(L.Rs(d, 589), seriesR(a, b, c, d, 589, Math.cos(th * DEG), 's', 400), 1e-10, `s ${a}|${b}|${c} d=${d}`);
      close(L.Rp(d, 589), seriesR(a, b, c, d, 589, Math.cos(th * DEG), 'p', 400), 1e-10, `p ${a}|${b}|${c} d=${d}`);
    }
  }
});

test('半波損失：上下都是同一種介質時，厚度 0 的反射率為 0（肥皂膜頂端、牛頓環中心是暗的）', () => {
  for (const [a, b] of [[1, 1.33], [1.52, 1], [1.52, 1.33], [1, 1.6]]) {
    const L = C.layer(a, b, a);
    assert.strictEqual(L.flips, 1, '恰好一次半波損失');
    near(L.R(0, 500), 0, 1e-15, `${a}|${b}|${a}`);
    close(L.T(0, 500), 1, 1e-14, '厚度 0 全部透射');
    near(L.Rmin, 0, 1e-15);
  }
  // 斜射也一樣
  const L = C.layer(1, 1.33, 1, Math.cos(45 * DEG));
  near(L.R(0, 500), 0, 1e-15, '45°');
  // 上下不同介質（增透膜）時，厚度 0 等於裸玻璃的反射率
  const AR = C.layer(1, 1.38, 1.52);
  close(AR.R(0, 550), Math.pow(0.52 / 2.52, 2), 1e-12, '厚度 0 = 裸玻璃');
});

test('亮紋與暗紋條件（一次半波損失）：2nd = (m + ½)λ 最亮、2nd = mλ 全暗', () => {
  const L = C.layer(1, 1.33, 1), lam = 589;
  for (let m = 0; m < 6; m++) {
    const dB = (m + 0.5) * lam / (2 * 1.33), dD = m * lam / (2 * 1.33);
    close(L.R(dB, lam), L.Rmax, 1e-12, '亮紋 m = ' + m);
    near(L.R(dD, lam), 0, 1e-14, '暗紋 m = ' + m);
    // 亮紋處是局部極大
    assert.ok(L.R(dB + 2, lam) < L.R(dB, lam) && L.R(dB - 2, lam) < L.R(dB, lam));
  }
  close(L.Rmax, Math.pow(2 * 0.33 / 2.33 / (1 + Math.pow(0.33 / 2.33, 2)), 2), 1e-12, 'Rmax = [2r/(1 + r²)]²');
  // 增透膜（兩次半波損失）：條件對調，λ/4 厚時反射最小
  const AR = C.layer(1, 1.38, 1.52);
  assert.strictEqual(AR.flips, 2);
  const q = 550 / (4 * 1.38);
  close(AR.R(q, 550), AR.Rmin, 1e-12, '四分之一波長膜反射最小');
  assert.ok(AR.R(q, 550) < 0.013 && AR.R(q, 550) < AR.R(0, 550) / 3, '增透效果');
  near(C.reflPhaseCycles(2, 1), 2.5, 1e-15);
  near(C.reflPhaseCycles(2, 2), 2, 1e-15);
});

test('斜看：光程差 2nd cosθt，亮紋往較厚處移（第一亮紋 d = λ/(4n cosθt)）', () => {
  for (const th of [0, 30, 60]) {
    const c1 = Math.cos(th * DEG), L = C.layer(1, 1.33, 1, c1);
    const d1 = 532 / (4 * 1.33 * L.cos2);
    close(L.path(d1), 532 / 2, 1e-12, '光程差 = λ/2');
    close(L.R(d1, 532), L.Rmax, 1e-12, th + '° 第一亮紋');
    near(L.R(2 * d1, 532), 0, 1e-14, th + '° 第一暗紋');
  }
});

test('布魯斯特角 tanθ = n：p 偏振完全不反射（任何厚度）', () => {
  const n = 1.33, L = C.layer(1, n, 1, Math.cos(Math.atan(n)));
  near(L.rp12, 0, 1e-15); near(L.rp23, 0, 1e-15);
  for (const d of [0, 100, 333, 1000]) near(L.Rp(d, 550), 0, 1e-15, 'd = ' + d);
  assert.ok(L.Rs(100, 550) > 0.05, 's 偏振照常反射');
});

test('雙光束近似：極值位置與多光束相同，差距只有 r⁴ 的量級', () => {
  for (const [a, b] of [[1, 1.33], [1.52, 1]]) {
    const M = C.layer(a, b, a), Tw = C.layer(a, b, a, 1, 'two');
    const r = Math.abs(M.rs12);
    for (let d = 0; d <= 1200; d += 7) {
      near(Tw.R(d, 600), M.R(d, 600), 5 * Math.pow(r, 4), `${a}|${b} d=${d}`);
      near(Tw.R(d, 600) + Tw.T(d, 600), 1, 5 * Math.pow(r, 4), '雙光束只差 r⁴');
    }
    // 雙光束在厚度 0 不完全是 0，而是 r⁶
    close(Tw.R(0, 600), Math.pow(r, 6), 1e-10, '雙光束 R(0) = r⁶');
    // 等振幅近似 R ≈ 4r² sin²(δ/2)：亮紋處約 4r²
    close(Tw.Rmax, Math.pow(r + (1 - r * r) * r, 2), 1e-12);
  }
});

test('空氣劈：暗紋間距 Δx = λL/(2nD)（由反射率的零點實際量出來比對）', () => {
  for (const p of [{ D: 20 * um, L: 0.1, n: 1, lambda: 589 * nm }, { D: 55.5 * um, L: 0.072, n: 1.33, lambda: 450 * nm }]) {
    const w = C.wedge(p), Lg = C.layer(1.52, p.n, 1.52);
    close(w.dx, p.lambda * p.L / (2 * p.n * p.D), 1e-14);
    // 由 x 處的間隙算 R，找出前 6 個零點
    const zeros = [];
    const step = w.dx / 400;
    for (let x = step; zeros.length < 6; x += step) {
      const R0 = Lg.R(C.wedgeGap(x - step, p), p.lambda), R1 = Lg.R(C.wedgeGap(x, p), p.lambda), R2 = Lg.R(C.wedgeGap(x + step, p), p.lambda);
      if (R1 < R0 && R1 <= R2) zeros.push(x);
    }
    for (let i = 1; i < zeros.length; i++) near(zeros[i] - zeros[i - 1], w.dx, 2 * step, '相鄰暗紋間距');
    close(C.wedgeDarkX(3, p), 3 * w.dx, 1e-12);
    assert.strictEqual(w.darkCount, Math.floor(2 * p.n * p.D / p.lambda) + 1);
    close(C.wireFromSpacing(w.dx, p.L, p.n, p.lambda), p.D, 1e-12, '由間距反推細線直徑');
  }
  // 充水後間距變為 1/1.33
  const a = C.wedge({ D: 30 * um, L: 0.1, n: 1, lambda: 589 * nm }), b = C.wedge({ D: 30 * um, L: 0.1, n: 1.33, lambda: 589 * nm });
  close(b.dx, a.dx / 1.33, 1e-12, '充水');
  // 接觸線（間隙 0）是暗紋
  near(C.layer(1.52, 1, 1.52).R(C.wedgeGap(0, { D: 1, L: 1 }), 500), 0, 1e-15);
});

test('牛頓環：暗環精確半徑處 R = 0；近似 r_m = √(mλR/n) 與精確值相差小於 10 ppm', () => {
  for (const p of [{ R: 1, lambda: 589 * nm, n: 1, e: 0 }, { R: 0.35, lambda: 650 * nm, n: 1.33, e: 0 }, { R: 4.2, lambda: 450 * nm, n: 1, e: 0 }]) {
    const Lg = C.layer(1.52, p.n, 1.52);
    for (let m = 1; m <= 20; m++) {
      const r = C.darkRingRadius(m, p);
      near(Lg.R(C.lensGap(r, p.R, 0), p.lambda), 0, 1e-12, '暗環 m = ' + m);
      close(r, C.darkRingApprox(m, p), 1e-5, '近似公式（差 ≈ t/4R）');
      const rb = C.brightRingRadius(m, p);
      close(Lg.R(C.lensGap(rb, p.R, 0), p.lambda), Lg.Rmax, 1e-9, '亮環 m = ' + m);
    }
    near(C.darkRingRadius(0, p), 0, 1e-15, '中心暗點');
  }
});

test('牛頓環：r² 對 m 為直線，斜率 λR/n；中心抬高 e 時斜率不變、截距 −2eR', () => {
  const ms = [1, 2, 3, 4, 5, 6, 7, 8];
  for (const e of [0, 120 * nm, 333 * nm]) {
    const p = { R: 1.5, lambda: 532 * nm, n: 1.33, e: e };
    const k0 = Math.ceil(2 * p.n * e / p.lambda); // 第一個存在的暗環
    const mm2 = ms.map(m => m + k0);
    const r2 = mm2.map(m => Math.pow(C.darkRingRadius(m, p), 2));
    const f = C.fitLine(mm2, r2);
    close(f.slope, p.lambda * p.R / p.n, 2e-6, '斜率 e = ' + e);
    close(f.intercept, -2 * e * p.R, 1e-5 + (e ? 0 : 1), '截距');
    close(f.r2, 1, 1e-9);
  }
});

test('牛頓環：e = λ/(4n) 時中心由暗變亮；透射光與反射光互補（T = 1 − R，中心為亮點）', () => {
  const Lg = C.layer(1.52, 1, 1.52), lam = 589;
  close(Lg.R(C.lensGap(0, 1, 0) * 1e9 + lam / 4, lam), Lg.Rmax, 1e-12, '中心抬高 λ/4');
  close(Lg.T(0, lam), 1, 1e-14, '透射中心最亮');
  for (const t of [0, 100, 222, 589, 1000]) close(Lg.T(t, lam), 1 - Lg.R(t, lam), 1e-13, '互補 t = ' + t);
  close(Lg.Tmin, 1 - Lg.Rmax, 1e-13, '透射光的對比很低');
});

test('CIE 1931 配色表與 D65：81 點（380–780 nm，每 5 nm）、ȳ(555) = 1、等能白光 ∫x̄ ≈ ∫ȳ ≈ ∫z̄', () => {
  for (const t of [C.CMF_X, C.CMF_Y, C.CMF_Z, C.D65]) assert.strictEqual(t.length, 81);
  close(C.cmf(555)[1], 1, 1e-12);
  close(C.d65(560), 100, 1e-12);
  const sum = t => t.reduce((s, v) => s + v, 0);
  close(sum(C.CMF_X), sum(C.CMF_Y), 0.005, 'Σx̄ = Σȳ');
  close(sum(C.CMF_Z), sum(C.CMF_Y), 0.005, 'Σz̄ = Σȳ');
  close(C.cmf(557.5)[1], (1 + 0.995) / 2, 1e-12, '線性內插');
  assert.strictEqual(C.cmf(300)[0], 0);
});

test('白光：完全反射（R = 1）顯示為白色 (1, 1, 1)，色度 = D65 白點 (0.3127, 0.3290)', () => {
  const c = C.xyzColor(C.spectrumXYZ(() => 1));
  for (const v of c.lin) near(v, 1, 0.002);
  close(c.Y, 1, 1e-12);
  near(c.x, 0.3127, 0.0005); near(c.y, 0.3290, 0.0005);
  // 5 nm 取樣與 1 nm 取樣的結果幾乎一樣
  const c5 = C.xyzColor(C.spectrumXYZ(() => 1, C.whiteSpectrum(5)));
  near(c5.x, c.x, 0.0003); near(c5.y, c.y, 0.0003);
});

test('白光：厚度 0 為黑（半波損失）、很薄時灰黑；很厚時各色互相抵消而趨向白色', () => {
  const L = C.layer(1, 1.33, 1);
  const c0 = C.filmColor(L, 0);
  assert.deepStrictEqual(c0.srgb, [0, 0, 0], '厚度 0 全黑');
  assert.ok(C.filmColor(L, 8).Y < 0.03, '8 nm（黑膜）仍幾乎全黑');
  // 很厚的膜：用 0.25 nm 細取樣，色度接近白點、亮度接近「強度直接相加」的值
  const fine = C.whiteSpectrum(0.25);
  for (const t of [20000, 50000]) {
    const c = C.filmColor(L, t, { spec: fine });
    near(c.x, 0.3127, 0.01, t + ' nm 的 x'); near(c.y, 0.3290, 0.01, t + ' nm 的 y');
    close(c.Y, L.Rincoh / L.Rmax, 0.04, '亮度 → 不同調相加');
    const h = C.hsv(c.srgb); assert.ok(h.s < 0.12, '飽和度很低（灰白）：' + h.s);
  }
  // 第一級的顏色很鮮豔
  assert.ok(C.hsv(C.filmColor(L, 240).srgb).s > 0.6, '240 nm 鮮豔');
});

test('白光查表 colorTable 與逐點精確積分 filmColor 一致', () => {
  const L = C.layer(1, 1.33, 1);
  const tab = C.colorTable(L, 1500, 1);
  for (const t of [0, 50, 137, 240, 601, 1200]) {
    const c = C.filmColor(L, t);
    for (let k = 0; k < 3; k++) near(tab.lin[3 * t + k], c.lin[k], 1e-5, `t = ${t}`);
  }
  // 透射＋增強對比：與反射互補
  const Lg = C.layer(1.52, 1, 1.52);
  const R = C.colorTable(Lg, 600, 2), T = C.colorTable(Lg, 600, 2, { which: 'T', enhance: true });
  for (let j = 0; j < R.n; j += 17) close(R.Y[j] + T.Y[j], 1, 1e-6, '增強後 Y_R + Y_T = 1');
  const T0 = C.colorTable(Lg, 10, 1, { which: 'T' });
  close(T0.Y[0], 1, 1e-9, '透射中心白亮');
});

test('單色光顏色：紅 650、綠 532、藍 450、鈉黃 589 nm 的色相', () => {
  const hueOf = nmv => C.hsv(C.monoLinear(nmv).map(C.toSrgb8)).h;
  const h650 = hueOf(650), h532 = hueOf(532), h450 = hueOf(450), h589 = hueOf(589);
  assert.ok(h650 < 15 || h650 > 345, '紅 ' + h650);
  assert.ok(h532 > 90 && h532 < 150, '綠 ' + h532);
  assert.ok(h450 > 215 && h450 < 260, '藍 ' + h450);
  assert.ok(h589 > 25 && h589 < 55, '鈉黃 ' + h589);
  for (const w of [380, 450, 589, 750]) close(Math.max.apply(null, C.monoLinear(w)), 1, 1e-12, '最大分量 = 1');
});

test('色域對應：保持亮度 Y，最小分量變成 0', () => {
  const c = [0.9, 0.35, -0.2], Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], m = C.gamutMap(c, Y);
  close(0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2], Y, 1e-12, '亮度不變');
  near(Math.min.apply(null, m), 0, 1e-12);
  assert.deepStrictEqual(C.gamutMap([0.2, 0.3, 0.4], 0.28), [0.2, 0.3, 0.4], '色域內不變');
});

test('肥皂膜：楔形厚度 h = h底·z，排液 h(t) = h0/√(1 + t/τ)（越來越薄、長時間 ∝ t^(−½)）', () => {
  near(C.soapThickness(0, 900), 0, 0); close(C.soapThickness(0.5, 900), 450, 1e-15); close(C.soapThickness(2, 900), 900, 1e-15);
  close(C.drain(1000, 0, 10), 1000, 1e-15);
  assert.ok(C.drain(1000, 5, 10) < 1000 && C.drain(1000, 50, 10) < C.drain(1000, 5, 10));
  close(C.drain(1000, 1e6, 10) / C.drain(1000, 4e6, 10), 2, 1e-5, '時間 4 倍 → 厚度一半');
});

test('最小平方法直線：完全在線上時斜率、截距、r² 精確', () => {
  const f = C.fitLine([1, 2, 3, 4], [3.5, 5.5, 7.5, 9.5]);
  close(f.slope, 2, 1e-14); close(f.intercept, 1.5, 1e-14); close(f.r2, 1, 1e-14);
  assert.ok(Number.isNaN(C.fitLine([1], [2]).slope));
  assert.ok(Number.isNaN(C.fitLine([2, 2], [1, 3]).slope));
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗項目' : ''));
