// 以 Node 執行：node tests/standing-waves-core.test.js
'use strict';
const assert = require('assert');
const SW = require('../js/standing-waves-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
function range(a, b, n) { const out = []; for (let i = 0; i <= n; i++) out.push(a + (b - a) * i / n); return out; }

const SHAPES = ['sine', 'gauss', 'tri'];
const PA = (o) => Object.assign({ L: 2, v: 2, w: 0.4, A: 3, shape: 'sine', end: 'fixed' }, o);
const PB = (o) => Object.assign({ L: 2, v: 2, f: 0.5, a: 1, rho: 0.7, end: 'fixed' }, o);

console.log('standing-waves-core');

// ---------------- 模式 A：脈波 ----------------

test('疊加原理：繩子位移 = 入射 + 反射（每一點、每一時刻）', () => {
  for (const shape of SHAPES) for (const end of ['fixed', 'free']) {
    const p = PA({ shape, end });
    for (const t of range(0, 2.5, 25)) for (const x of range(0, p.L, 40)) {
      const r = SW.pulseAt(p, x, t);
      close(r.sum, r.inc + r.ref, 1e-15, `${shape}/${end}`);
      close(r.inc, SW.pulseShape(shape, x - SW.pulseX0(p) - p.v * t, p.w, p.A), 1e-15, '入射波 g(x − x0 − vt)');
    }
  }
});

test('脈波形狀：高度 A、底寬 w，不對稱三角形前緣陡', () => {
  for (const shape of SHAPES) {
    let max = 0;
    for (const s of range(-0.3, 0.3, 6000)) max = Math.max(max, SW.pulseShape(shape, s, 0.4, 3));
    close(max, 3, 1e-6, shape + ' 高度');
    assert.ok(SW.pulseShape(shape, 0.21, 0.4, 3) < 0.04 * 3, shape + ' 底寬外幾乎為 0');
  }
  close(SW.pulseShape('tri', 0.1, 0.4, 3), 3, 1e-14, '峰值在 w/4');
  assert.strictEqual(SW.pulseShape('tri', -0.2, 0.4, 3), 0);
  assert.strictEqual(SW.pulseShape('sine', 0.2, 0.4, 3), 0);
});

test('固定端：端點位移永遠為 0', () => {
  for (const shape of SHAPES) {
    const p = PA({ shape, end: 'fixed' });
    for (const t of range(0, 2.4, 240)) close(SW.pulseAt(p, p.L, t).sum, 0, 1e-14, `${shape} t=${t}`);
  }
});

test('自由端：繩形對端點左右對稱（∂y/∂x = 0），端點位移 = 2 × 入射位移；固定端則反對稱', () => {
  for (const shape of SHAPES) {
    const p = PA({ shape, end: 'free' }), q = PA({ shape, end: 'fixed' });
    for (const t of range(0.8, 1.4, 60)) for (const h of [1e-4, 0.01, 0.07, 0.15]) {
      close(SW.pulseAt(p, p.L - h, t).sum, SW.pulseAt(p, p.L + h, t).sum, 1e-12, `${shape} 偶對稱`);
      close(SW.pulseAt(q, q.L - h, t).sum, -SW.pulseAt(q, q.L + h, t).sum, 1e-12, `${shape} 奇對稱`);
    }
    for (const t of range(0.8, 1.4, 60)) {
      const r = SW.pulseAt(p, p.L, t);
      close(r.sum, 2 * r.inc, 1e-14, '端點位移加倍');
      // 平滑形狀直接以差分檢查斜率
      if (shape === 'gauss') {
        const sl = (SW.pulseAt(p, p.L, t).sum - SW.pulseAt(p, p.L - 1e-6, t).sum) / 1e-6;
        assert.ok(Math.abs(sl) < 1e-3 * p.A / p.w, '端點斜率 ' + sl);
      }
    }
  }
});

test('固定端反射波倒立、自由端反射波正立（反射後脈波的極值）', () => {
  for (const shape of SHAPES) for (const end of ['fixed', 'free']) {
    const p = PA({ shape, end });
    const tm = SW.pulseTimes(p);
    const t = (tm.tEnd + tm.tGone) / 2 - 0.1; // 反射脈波完整地在繩上
    let mn = 0, mx = 0;
    for (const x of range(0, p.L, 4000)) { const y = SW.pulseAt(p, x, t).sum; mn = Math.min(mn, y); mx = Math.max(mx, y); }
    if (end === 'fixed') { close(mn, -p.A, 2e-3, shape + ' 倒立'); close(mx, 0, 1e-9, '沒有正位移'); }
    else { close(mx, p.A, 2e-3, shape + ' 正立'); close(mn, 0, 1e-9, '沒有負位移'); }
  }
});

test('反射脈波左右鏡射：不對稱脈波的陡邊仍在前進方向（向左）', () => {
  const p = PA({ shape: 'tri', end: 'free' });
  const tm = SW.pulseTimes(p), t = tm.tEnd + 0.2;
  const xc = 2 * p.L - SW.pulseX0(p) - p.v * t;   // 反射脈波中心
  // 峰值在中心左側 w/4（前緣在左），且形狀等於入射形狀的鏡像
  let best = -1, bx = 0;
  for (const x of range(xc - 0.3, xc + 0.3, 6000)) { const y = SW.pulseAt(p, x, t).ref; if (y > best) { best = y; bx = x; } }
  close(bx, xc - p.w / 4, 1e-3, '峰值位置');
  for (const d of range(-0.25, 0.25, 50)) close(SW.pulseAt(p, xc + d, t).ref, SW.pulseShape('tri', -d, p.w, p.A), 1e-12, '鏡像');
});

test('能量守恆：反射前後 ∫(∂y/∂x)² dx 相同；面積 ∫y dx 固定端變號、自由端不變', () => {
  for (const shape of SHAPES) for (const end of ['fixed', 'free']) {
    const p = PA({ shape, end, L: 3 });
    const tm = SW.pulseTimes(p);
    const integ = (t) => {
      const N = 30000, dx = p.L / N; let E = 0, S = 0;
      for (let i = 0; i < N; i++) {
        const x = (i + 0.5) * dx;
        const y1 = SW.pulseAt(p, x - dx / 2, t).sum, y2 = SW.pulseAt(p, x + dx / 2, t).sum;
        E += ((y2 - y1) / dx) ** 2 * dx;
        S += SW.pulseAt(p, x, t).sum * dx;
      }
      return { E, S };
    };
    const before = integ(tm.tStart - 0.3), after = integ(tm.tEnd + 0.3);
    close(after.E, before.E, 2e-3, `${shape}/${end} 能量`);
    close(after.S, (end === 'fixed' ? -1 : 1) * before.S, 2e-4, `${shape}/${end} 面積`);
  }
});

test('脈波時刻：中心抵達端點 t = (L − x0)/v；反射後離開畫面 t = (2L − x0 + w/2)/v', () => {
  const p = PA({ L: 2.5, v: 1.25, w: 0.5 });
  const tm = SW.pulseTimes(p);
  close(tm.tHit, (2.5 + 0.25) / 1.25, 1e-14);
  close(tm.tGone, (5 + 0.25 + 0.25) / 1.25, 1e-14);
  for (const x of range(0, p.L, 100)) close(SW.pulseAt(p, x, tm.tGone).sum, 0, 1e-12, '離開後繩子靜止');
});

// ---------------- 模式 B：連續波 ----------------

test('共振頻率：固定–固定 f_n = nv/2L；固定–自由 f = (2n − 1)v/4L（只有奇數倍頻）', () => {
  for (const [v, L] of [[2, 2], [3.3, 1.7], [0.5, 3]]) {
    for (let n = 1; n <= 6; n++) {
      close(SW.harmonicFreq('fixed', n, v, L), n * v / (2 * L), 1e-14);
      close(SW.harmonicFreq('free', n, v, L), (2 * n - 1) * v / (4 * L), 1e-14);
      close(SW.harmonicFreq('fixed', n, v, L) / SW.fundamental('fixed', v, L), n, 1e-13, '整數倍');
      close(SW.harmonicFreq('free', n, v, L) / SW.fundamental('free', v, L), 2 * n - 1, 1e-13, '奇數倍');
    }
    // 固定–固定的基頻是固定–自由的 2 倍；對應的波長 2L 與 4L
    close(SW.fundamental('fixed', v, L), 2 * SW.fundamental('free', v, L), 1e-14);
    close(SW.wavelength(v, SW.fundamental('fixed', v, L)), 2 * L, 1e-14, 'λ1 = 2L');
    close(SW.wavelength(v, SW.fundamental('free', v, L)), 4 * L, 1e-14, 'λ1 = 4L');
  }
  const h = SW.harmonics('free', 2, 2, 4);
  assert.deepStrictEqual(h.map((x) => x.m), [1, 3, 5, 7]);
});

test('鏡像級數的閉合形式 = 逐項相加，並滿足 F(τ) = a sin ωτ − ρsF(τ − Tr)', () => {
  for (const end of ['fixed', 'free']) for (const f of [0.37, 0.5, 1.25, 2.9]) {
    const p = PB({ end, f }), Tr = SW.roundTrip(p), s = SW.reflectSign(end);
    for (const tau of range(-1, 25, 260)) {
      close(SW.drivenF(p, tau), SW.drivenFSeries(p, tau), 1e-10, `${end} f=${f} τ=${tau}`);
      if (tau >= 0) {
        const rhs = p.a * Math.sin(2 * Math.PI * f * tau) - p.rho * s * SW.drivenF(p, tau - Tr);
        close(SW.drivenF(p, tau), rhs, 1e-10, '遞迴關係');
      }
    }
  }
});

test('波動方程式 y_tt = v² y_xx（波前以外的區域，以差分驗證）', () => {
  for (const end of ['fixed', 'free']) {
    const p = PB({ end, f: 0.83, v: 2.2, L: 1.6 }), h = 1e-3;
    for (const t of [3.17, 5.71, 9.03]) for (const x of [0.13, 0.52, 0.97, 1.41]) {
      const y = (xx, tt) => SW.drivenAt(p, xx, tt).sum;
      const ytt = (y(x, t + h) - 2 * y(x, t) + y(x, t - h)) / (h * h);
      const yxx = (y(x + h, t) - 2 * y(x, t) + y(x - h, t)) / (h * h);
      close(ytt, p.v * p.v * yxx, 2e-3, `${end} x=${x} t=${t}`);
    }
  }
});

test('連續波的反射端：固定端 y(L) = 0；自由端繩形對端點對稱（∂y/∂x = 0）', () => {
  for (const f of [0.5, 0.71, 1.9]) {
    const pf = PB({ f, end: 'fixed' }), pF = PB({ f, end: 'free' });
    for (const t of range(0, 20, 200)) {
      close(SW.drivenAt(pf, pf.L, t).sum, 0, 1e-12, '固定端');
      for (const h of [1e-4, 0.05, 0.3]) close(SW.drivenAt(pF, pF.L - h, t).sum, SW.drivenAt(pF, pF.L + h, t).sum, 1e-10, '自由端對稱');
    }
    const t = 15.3, h = 1e-6;
    const sl = (SW.drivenAt(pF, pF.L, t).sum - SW.drivenAt(pF, pF.L - h, t).sum) / h;
    assert.ok(Math.abs(sl) < 1e-3, '自由端斜率 ' + sl);
  }
});

test('固定端反射波反相、自由端同相：在 x = L 處反射波 = ∓ 入射波', () => {
  for (const t of range(0.5, 12, 50)) {
    const a = SW.drivenAt(PB({ end: 'fixed', f: 0.9 }), 2, t);
    close(a.ref, -a.inc, 1e-12, '固定端');
    const b = SW.drivenAt(PB({ end: 'free', f: 0.9 }), 2, t);
    close(b.ref, b.inc, 1e-12, '自由端');
  }
});

test('共振時的穩定振幅 A = a/(1 − ρ)，是共振曲線的極大值', () => {
  for (const end of ['fixed', 'free']) for (let n = 1; n <= 6; n++) {
    const fn = SW.harmonicFreq(end, n, 2, 2);
    const p = PB({ end, f: fn });
    close(SW.steadyAmplitude(p), p.a / (1 - p.rho), 1e-10, `${end} n=${n}`);
    close(SW.gain(end, fn, 2, 2, 0.7), 1 / 0.3, 1e-10, '共振增益');
    for (const d of [-0.02, -0.005, 0.005, 0.02]) assert.ok(SW.gain(end, fn * (1 + d), 2, 2, 0.7) < 1 / 0.3, '偏離共振振幅變小');
    // 共振之間的最小值 1/(1 + ρ)
    const fmid = end === 'free' ? fn + 2 / (4 * 2) : fn + 2 / (4 * 2);
    close(SW.gain(end, fmid, 2, 2, 0.7), 1 / 1.7, 1e-10, '兩個共振之間');
  }
});

test('振幅隨往返次數增加，長時間後趨近穩定振幅', () => {
  for (const end of ['fixed', 'free']) for (const f of [0.5, 0.75, 1.3]) {
    const p = PB({ end, f }), Tr = SW.roundTrip(p);
    close(SW.drivenAmplitudeAt(p, 0.1), p.a, 1e-14, '第一次往返之前振幅 = a');
    close(SW.drivenAmplitudeAt(p, 200 * Tr), SW.steadyAmplitude(p), 1e-12, '穩定振幅');
    // 振幅 = 正弦波 F 的實際最大值
    let mx = 0;
    for (const tau of range(200 * Tr, 200 * Tr + 1 / f, 4000)) mx = Math.max(mx, Math.abs(SW.drivenF(p, tau)));
    close(mx, SW.steadyAmplitude(p), 1e-5, '|F| 的最大值');
  }
  const p = PB({ end: 'fixed', f: 0.5 });
  let prev = 0;
  for (let k = 0; k < 10; k++) { const A = SW.drivenAmplitudeAt(p, k * SW.roundTrip(p) + 0.01); assert.ok(A > prev, '共振時振幅一直增加'); prev = A; }
});

test('穩定駐波包絡線 2A|sin kx|：從固定端量起的波節 x = kλ/2 不動、波腹振幅 2A', () => {
  for (const end of ['fixed', 'free']) for (let n = 1; n <= 6; n++) {
    const p = PB({ end, f: SW.harmonicFreq(end, n, 2, 2) });
    const A = SW.steadyAmplitude(p), lam = SW.wavelength(p.v, p.f), k = 2 * Math.PI / lam;
    const t0 = 300 * SW.roundTrip(p), T = 1 / p.f;
    const ts = range(t0, t0 + T, 64);
    for (const x of range(0, p.L, 37)) {
      let mx = 0;
      for (const t of ts) mx = Math.max(mx, Math.abs(SW.drivenAt(p, x, t).sum));
      close(mx, SW.envelope(p, x, A), 1e-3, `${end} n=${n} x=${x}`);
      // 由振盪器端（x = 0，固定）量起也是 2A|sin kx|
      close(SW.envelope(p, x, A), 2 * A * Math.abs(Math.sin(k * x)), 1e-9, '2A|sin kx|');
    }
    // 波節：位移一直為 0；波節之間相距 λ/2；從 x = 0 量起 x = jλ/2
    const pts = SW.standingPoints(p);
    for (const xn of pts.nodes) {
      for (const t of ts) close(SW.drivenAt(p, xn, t).sum, 0, 1e-6 * A, '波節不動');
      const j = xn / (lam / 2);
      close(j, Math.round(j), 1e-9, '波節在 x = jλ/2');
    }
    for (const xa of pts.antinodes) {
      let mx = 0;
      for (const t of ts) mx = Math.max(mx, Math.abs(SW.drivenAt(p, xa, t).sum));
      close(mx, 2 * A, 1e-3, '波腹振幅 2A');
    }
    const c = SW.modeCounts(end, n);
    assert.strictEqual(pts.nodes.length, c.nodes, `${end} n=${n} 波節數`);
    assert.strictEqual(pts.antinodes.length, c.antinodes, `${end} n=${n} 波腹數`);
  }
});

test('駐波的每一點同相（或反相）振動：y(x, t) = 包絡 × 同一個時間函數', () => {
  const p = PB({ end: 'fixed', f: SW.harmonicFreq('fixed', 3, 2, 2) });
  const t0 = 300 * SW.roundTrip(p), k = SW.waveNumber(p);
  for (const t of range(t0, t0 + 2, 20)) {
    const ref = SW.drivenAt(p, p.L / 6 / 2, t).sum / Math.sin(k * (p.L / 12));
    for (const x of [0.11, 0.29, 0.77, 1.21, 1.9]) close(SW.drivenAt(p, x, t).sum, ref * Math.sin(k * x), 1e-6);
  }
});

test('固定端量起的波節位置：任意頻率的穩定狀態都在 x = L − jλ/2', () => {
  for (const f of [0.43, 0.81, 1.37]) {
    const p = PB({ end: 'fixed', f }), lam = p.v / f, A = SW.steadyAmplitude(p);
    const pts = SW.standingPoints(p), t0 = 300 * SW.roundTrip(p);
    pts.nodes.forEach((xn, j) => {
      close(xn, Math.max(0, p.L - j * lam / 2), 1e-12);
      if (xn > 0) for (const t of range(t0, t0 + 1 / f, 16)) close(SW.drivenAt(p, xn, t).sum, 0, 1e-6 * A, '波節');
    });
  }
});

test('共振時振盪器端 x = 0 在穩定後也是波節；偏離共振時則不是', () => {
  for (const end of ['fixed', 'free']) {
    const p = PB({ end, f: SW.harmonicFreq(end, 2, 2, 2) }), t0 = 300 * SW.roundTrip(p);
    for (const t of range(t0, t0 + 2, 30)) close(SW.drivenAt(p, 0, t).sum, 0, 1e-8, '共振：x = 0 不動');
    const q = PB({ end, f: SW.harmonicFreq(end, 2, 2, 2) * 1.1 });
    let mx = 0;
    for (const t of range(t0, t0 + 3, 300)) mx = Math.max(mx, Math.abs(SW.drivenAt(q, 0, t).sum));
    assert.ok(mx > 0.2 * q.a, '非共振：x = 0 會動 ' + mx);
  }
});

test('最接近的共振與判定', () => {
  const r1 = SW.nearestHarmonic(PB({ f: 1.5 }));
  assert.strictEqual(r1.n, 3); assert.ok(r1.resonant);
  const r2 = SW.nearestHarmonic(PB({ f: 1.6 }));
  assert.strictEqual(r2.n, 3); assert.ok(!r2.resonant);
  const r3 = SW.nearestHarmonic(PB({ end: 'free', f: 1.25 })); // v/4L = 0.25 → 5 倍 = 第 3 個共振
  assert.strictEqual(r3.n, 3); assert.strictEqual(r3.m, 5); assert.ok(r3.resonant);
  assert.strictEqual(SW.nearestHarmonic(PB({ f: 0.05 })).n, 1);
});

test('極限：ρ = 0（振盪器完全吸收）時只有一次反射，穩定振幅 = a', () => {
  const p = PB({ rho: 0, f: 0.9 });
  close(SW.steadyAmplitude(p), p.a, 1e-14);
  for (const t of range(0, 30, 61)) close(SW.drivenF(p, t), p.a * Math.sin(2 * Math.PI * 0.9 * t), 1e-12);
});

console.log(`  共 ${passed} 項通過`);
