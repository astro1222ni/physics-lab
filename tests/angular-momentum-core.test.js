// 以 Node 執行：node tests/angular-momentum-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/angular-momentum-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
/** 推進到收放完成（或繩斷），傳回事件 */
function runMove(st, rt, u, opt) {
  C.holeStartMove(st, rt, u);
  const evs = [];
  for (let i = 0; i < 200000 && st.phase === 'move'; i++) evs.push.apply(evs, C.holeAdvance(st, 1 / 60, opt));
  return evs;
}
const CASES = [
  { m: 0.5, r0: 1.0, v0: 1.0 }, { m: 0.2, r0: 1.5, v0: 0.3 }, { m: 1, r0: 0.4, v0: 2 }, { m: 0.1, r0: 0.8, v0: 0.6 }
];

console.log('angular-momentum-core');

// ---------------- 模式一：手的收放規劃 ----------------
test('planMove：兩端 r = rs、rt，ṙ = 0；位置、速度連續；等速段速率 = u', () => {
  for (const [rs, rt, u, h] of [[1, 0.5, 0.2, 1], [0.5, 1.6, 0.3, 1], [1.5, 0.2, 0.5, 0.45], [0.3, 1.8, 0.1, 0.2], [1, 0.95, 0.4, 1]]) {
    const pl = C.planMove(rs, rt, u, h);
    const a = C.moveAt(pl, 0), b = C.moveAt(pl, pl.T);
    close(a.r, rs, 1e-14, 'r(0)'); close(b.r, rt, 1e-12, 'r(T)');
    assert.strictEqual(a.rd, 0); assert.strictEqual(b.rd, 0);
    assert.ok(pl.uc <= u + 1e-15, '不超過 u');
    // 段落交界處位置與速度連續
    for (const tb of [pl.t1, pl.t1 + pl.t2]) {
      for (const [p, q] of [[0, 1], [1, 2]]) {
        const k1 = C.phaseKin(pl, p, tb), k2 = C.phaseKin(pl, q, tb);
        if ((p === 0 && Math.abs(tb - pl.t1) < 1e-15) || (p === 1 && Math.abs(tb - pl.t1 - pl.t2) < 1e-15)) {
          close(k1.r, k2.r, 1e-12, '位置連續'); close(k1.rd, k2.rd, 1e-12, '速度連續');
        }
      }
    }
    if (pl.t2 > 0) close(Math.abs(C.moveAt(pl, pl.t1 + pl.t2 / 2).rd), u, 1e-12, '等速段 |ṙ| = u');
    // 單調：收繩時 r 一路變小，放繩時一路變大
    let prev = rs;
    for (let i = 1; i <= 400; i++) { const r = C.moveAt(pl, pl.T * i / 400).r; assert.ok((r - prev) * pl.sgn >= -1e-12, '單調'); prev = r; }
  }
});

test('收放全程繩子保持拉緊（T ≥ 0）：放繩的加速段與收繩的減速段 r̈ ≤ κh²/r³', () => {
  for (const o of CASES) {
    for (const rt of [0.2, 0.6, 1.2, 1.8]) {
      const st = C.holeCreate(o);
      C.holeStartMove(st, rt, 0.5);
      let minRatio = Infinity;
      for (let i = 0; i < 100000 && st.phase === 'move'; i++) {
        C.holeAdvance(st, 0.01, { Tmax: Infinity });
        const k = C.holeKin(st);
        minRatio = Math.min(minRatio, k.T / C.holdTension(o.m, k.h, k.r));
      }
      assert.ok(minRatio >= 0.5 - 1e-6, '張力至少是圓周運動所需的一半：' + minRatio);
    }
  }
});

// ---------------- 模式一：守恆量 ----------------
test('角動量守恆：RK4 積分 rθ̈ + 2ṙθ̇ = 0，連續收放多次後 |ΔL|/L < 1e-9', () => {
  for (const o of CASES) {
    const st = C.holeCreate(o);
    const L0 = C.holeKin(st).L;
    let worst = 0;
    for (const [rt, u] of [[0.5, 0.2], [1.3, 0.35], [0.25, 0.5], [0.9, 0.05], [0.4, 0.27]]) {
      C.holeStartMove(st, rt, u);
      for (let i = 0; i < 200000 && st.phase === 'move'; i++) {
        C.holeAdvance(st, 1 / 37, { Tmax: Infinity });
        worst = Math.max(worst, Math.abs(C.holeKin(st).L - L0) / L0);
      }
    }
    assert.ok(worst < 1e-9, 'L 漂移 ' + worst.toExponential(2));
  }
});

test('ω = h/r²（v r = 常數）在收放途中每一刻都成立', () => {
  const o = { m: 0.5, r0: 1.2, v0: 0.9 }, st = C.holeCreate(o), h = o.r0 * o.v0;
  C.holeStartMove(st, 0.3, 0.25);
  for (let i = 0; i < 100000 && st.phase === 'move'; i++) {
    C.holeAdvance(st, 0.013, { Tmax: Infinity });
    close(st.om, h / (st.r * st.r), 1e-9, 'ω');
    close(C.holeKin(st).vt * st.r, h, 1e-9, 'v_t r');
  }
});

test('手作的功 W = ΔK（全程每一刻），且收放結束時 W = ½mh²(1/r2² − 1/r1²)', () => {
  for (const o of CASES) {
    const st = C.holeCreate(o), h = o.r0 * o.v0;
    let K0 = C.holeKin(st).K, worst = 0;
    for (const rt of [0.35, 1.1, 0.6]) {
      const r1 = st.r, W1 = st.W, Kstart = C.holeKin(st).K;
      C.holeStartMove(st, rt, 0.3);
      for (let i = 0; i < 100000 && st.phase === 'move'; i++) {
        C.holeAdvance(st, 0.017, { Tmax: Infinity });
        const k = C.holeKin(st);
        worst = Math.max(worst, Math.abs(k.W - (k.K - K0)) / Math.max(k.K, K0));
      }
      close(st.W - W1, C.moveWork(o.m, h, r1, rt), 1e-9, '解析的功');
      close(st.W - W1, C.holeKin(st).K - Kstart, 1e-9, 'W = ΔK');
    }
    assert.ok(worst < 1e-9, 'W − ΔK 最大相對誤差 ' + worst.toExponential(2));
  }
});

test('等速段的角位置與解析積分 θ = θa + (h/u)(1/r − 1/ra) 相符', () => {
  const o = { m: 0.3, r0: 1.4, v0: 0.7 }, st = C.holeCreate(o), h = o.r0 * o.v0;
  const pl = C.holeStartMove(st, 0.4, 0.2);
  assert.ok(pl.t2 > 0.5, '要有等速段');
  C.holeAdvance(st, pl.t1, { Tmax: Infinity });
  const ra = st.r, tha = st.th;
  C.holeAdvance(st, pl.t2 * 0.8, { Tmax: Infinity });
  const want = tha + (h / pl.uc) * (1 / st.r - 1 / ra); // 收繩：r = ra − u t
  close(st.th, want, 1e-10, 'θ');
});

test('半徑拉成一半：速率 ×2、角速度 ×4、動能 ×4、張力 ×8；拉成 1/3：角速度 ×9', () => {
  const o = { m: 0.5, r0: 1.0, v0: 1.0 }, st = C.holeCreate(o);
  const k0 = C.holeKin(st);
  runMove(st, 0.5, 0.2, { Tmax: Infinity });
  const k1 = C.holeKin(st);
  close(k1.v / k0.v, 2, 1e-9, 'v'); close(k1.om / k0.om, 4, 1e-9, 'ω');
  close(k1.K / k0.K, 4, 1e-9, 'K'); close(k1.T / k0.T, 8, 1e-9, 'T');
  const st2 = C.holeCreate({ m: 0.5, r0: 0.9, v0: 0.5 }), w0 = st2.om;
  runMove(st2, 0.3, 0.3, { Tmax: Infinity });
  close(st2.om / w0, 9, 1e-9, 'ω ×9');
});

test('圓周運動（繩子固定）時張力 = mv²/r，而且不作功', () => {
  for (const o of CASES) {
    const st = C.holeCreate(o);
    C.holeAdvance(st, 3.7);
    const k = C.holeKin(st);
    close(k.T, o.m * o.v0 * o.v0 / o.r0, 1e-12, 'T');
    assert.strictEqual(k.W, 0);
    close(k.v, o.v0, 1e-12, '速率不變');
  }
});

// ---------------- 模式一：鬆手與繩斷 ----------------
test('鬆手後：等速直線運動、L 不變、r⊥ = L/(mv) 不變、r 一直變大', () => {
  for (const o of CASES) {
    const st = C.holeCreate(o);
    C.holeAdvance(st, 0.77);
    const k0 = C.holeKin(st);
    C.holeRelease(st);
    const pts = [];
    for (let i = 0; i < 40; i++) {
      C.holeAdvance(st, 0.05);
      const k = C.holeKin(st);
      pts.push([k.x, k.y]);
      close(k.vx, k0.vx, 1e-12, 'vx 不變'); close(k.vy, k0.vy, 1e-12, 'vy 不變');
      close(k.L, k0.L, 1e-12, 'L 不變'); close(k.rperp, k0.L / (o.m * k0.v), 1e-12, 'r⊥');
      assert.strictEqual(k.T, 0);
    }
    // 共線：三點面積為 0
    for (let i = 2; i < pts.length; i++) assert.ok(Math.abs(C.polyArea([pts[0], pts[i - 1], pts[i]])) < 1e-12, '直線');
    close(C.holeKin(st).rperp, o.r0, 1e-12, '從圓周鬆手：r⊥ = 原來的半徑');
    assert.ok(C.holeKin(st).r > o.r0, 'r 變大');
  }
});

test('等時間掃過等面積：鬆手後的直線與收繩的螺線都是 dA/dt = L/(2m)', () => {
  // 直線：每 0.2 s 的三角形面積相等
  const st = C.holeCreate({ m: 0.4, r0: 0.7, v0: 1.1 });
  C.holeAdvance(st, 0.3);
  C.holeRelease(st);
  const rate = C.holeKin(st).arealRate;
  let prev = [C.holeKin(st).x, C.holeKin(st).y];
  for (let i = 0; i < 8; i++) {
    C.holeAdvance(st, 0.2);
    const cur = [C.holeKin(st).x, C.holeKin(st).y];
    close(C.polyArea([[0, 0], prev, cur]), rate * 0.2, 1e-12, '三角形面積');
    prev = cur;
  }
  // 收繩中的螺線：用細分的多邊形量面積
  const s2 = C.holeCreate({ m: 0.4, r0: 1.4, v0: 0.6 }), rate2 = C.holeKin(s2).arealRate;
  C.holeStartMove(s2, 0.3, 0.25);
  for (let j = 0; j < 6; j++) {
    const poly = [[0, 0]];
    for (let i = 0; i <= 400; i++) { if (i) C.holeAdvance(s2, 0.25 / 400, { Tmax: Infinity }); const k = C.holeKin(s2); poly.push([k.x, k.y]); }
    close(C.polyArea(poly), rate2 * 0.25, 2e-6, '螺線扇形面積');
  }
});

test('繩斷：張力超過 Tmax 的瞬間斷開（張力 = Tmax），之後沿當時速度直線飛出', () => {
  const o = { m: 0.5, r0: 1.0, v0: 1.0 }, st = C.holeCreate(o), h = 1;
  const rs = C.snapRadius(o.m, h, 30);
  close(C.holdTension(o.m, h, rs), 30, 1e-12, 'snapRadius');
  const evs = runMove(st, 0.15, 0.2);
  const snap = evs.find(e => e.type === 'snap');
  assert.ok(snap, '要斷');
  close(snap.T, 30, 1e-6, '斷的時候張力 = 30 N');
  assert.strictEqual(st.phase, 'free');
  assert.ok(st.free.r > 0.15 && Math.abs(st.free.r - rs) < 0.02, '大約在 ' + rs.toFixed(3) + ' m 斷：' + st.free.r);
  close(C.holeKin(st).L, o.m * h, 1e-9, '斷後 L 不變');
  // 不會斷的情況
  const s2 = C.holeCreate(o);
  assert.ok(!runMove(s2, 0.5, 0.2).some(e => e.type === 'snap'), '拉到 0.5 m 不會斷');
});

test('aimAngle 與 freeClosest：在算出的角度鬆手，直線剛好通過目標', () => {
  for (const [r, px, py] of [[1, -1.5, 1.1], [0.4, -1.5, 1.1], [0.7, 1.8, 0.2], [1.2, 0.1, -1.9]]) {
    const th = C.aimAngle(r, px, py);
    const st = C.holeCreate({ m: 0.3, r0: r, v0: 0.8, theta0: th });
    C.holeRelease(st);
    const q = C.freeClosest(st.free, px, py);
    assert.ok(q.miss < 1e-9, '命中 miss = ' + q.miss);
    close(q.tau * 0.8, Math.sqrt(px * px + py * py - r * r), 1e-9, '切線長');
  }
  assert.ok(isNaN(C.aimAngle(1, 0.5, 0.5)), '圓內的點沒有解');
});

// ---------------- 模式二：旋轉平台 ----------------
const PP = { Mb: 60, md: 2 };
test('I = ½M_bR_b² + ½M_pR_p² + 2m r²，只由質量分布決定（與轉速無關）', () => {
  const I = C.platformI(PP, 0.75);
  close(I.body, 0.5 * 60 * 0.15 * 0.15, 1e-14, '人體圓柱');
  close(I.plat, 0.5 * 8 * 0.35 * 0.35, 1e-14, '平台圓盤');
  close(I.dumb, 2 * 2 * 0.75 * 0.75, 1e-14, '啞鈴');
  close(I.total, I.body + I.plat + I.dumb, 1e-14);
  // 同樣的姿勢，轉速不同：I 相同；用同一個 L、不同的 ω 算 armChange 時 I 也只看 r
  for (const L of [0.5, 3, 20]) {
    const a = C.armChange(PP, L, 0.75, 0.2);
    close(a.I1, C.platformI(PP, 0.75).total, 1e-14); close(a.I2, C.platformI(PP, 0.2).total, 1e-14);
  }
  close(C.platformI({ Mb: 60, md: 0 }, 0.9).total, C.platformI({ Mb: 60, md: 0 }, 0.2).total, 1e-15, '沒有啞鈴：I 與手臂位置無關');
});

test('收手：ω2/ω1 = I1/I2，L 不變，ΔK = ½L²(1/I2 − 1/I1) > 0；伸手相反', () => {
  for (const [md, rOut, rIn, w1] of [[2, 0.75, 0.2, 2], [5, 0.9, 0.15, 1], [0.5, 0.5, 0.3, 4]]) {
    const p = { Mb: 60, md: md }, L = C.platformI(p, rOut).total * w1;
    const a = C.armChange(p, L, rOut, rIn);
    close(a.w2 / a.w1, a.I1 / a.I2, 1e-13, 'ω 比');
    close(a.I2 * a.w2, L, 1e-13, 'L');
    close(a.W, a.Wformula, 1e-12, 'ΔK 公式');
    assert.ok(a.W > 0, '收手動能增加');
    const b = C.armChange(p, L, rIn, rOut);
    close(b.W, -a.W, 1e-12, '伸手動能減少同樣多');
  }
});

test('手臂移動途中：五次曲線兩端靜止；平台轉角 = ∫L/I dt（Simpson 與細分梯形一致）；肌肉作功 = ΔK', () => {
  const p = { Mb: 60, md: 3 }, r0 = 0.8, r1 = 0.2, dur = C.armDuration(r0, r1);
  assert.ok(C.armAt(r0, r1, dur, 0).rd === 0);
  assert.ok(C.armAt(r0, r1, dur, dur).rd === 0);
  close(C.armAt(r0, r1, dur, dur).r, r1, 1e-15);
  const L = 4;
  const sim = C.spinAngle(p, L, r0, r1, dur, 0, dur, 256);
  let trap = 0; const N = 200000;
  for (let i = 0; i < N; i++) {
    const t0 = dur * i / N, t1 = dur * (i + 1) / N;
    trap += 0.5 * (L / C.platformI(p, C.armAt(r0, r1, dur, t0).r).total + L / C.platformI(p, C.armAt(r0, r1, dur, t1).r).total) * (t1 - t0);
  }
  close(sim, trap, 1e-9, "轉角");
  const e0 = C.spinEnergy(p, L, r0, 0), e1 = C.spinEnergy(p, L, r1, 0);
  close(e1.total - e0.total, C.armChange(p, L, r0, r1).W, 1e-12, '功');
});

test('鬆開啞鈴：人的 ω 不變；啞鈴沿切線等速飛出，總角動量守恆', () => {
  const p = { Mb: 60, md: 2 }, r = 0.6, w = 3, phi = 0.4;
  const Iall = C.platformI(p, r).total, Iperson = C.platformI(p, r, true).total;
  const L = Iall * w;
  const db = C.dumbbellRelease(phi, r, w);
  let Ld = 0;
  db.forEach(function (d) {
    close(Math.hypot(d.x, d.y), r, 1e-14, '啞鈴在半徑 r');
    close(Math.hypot(d.vx, d.vy), w * r, 1e-14, '速率 ωr');
    close(d.x * d.vx + d.y * d.vy, 0, 1e-14, '切線方向');
    Ld += p.md * (d.x * d.vy - d.y * d.vx);
  });
  close(Iperson * w + Ld, L, 1e-13, '人＋兩個啞鈴的 L = 原來的 L');
  // 飛行中啞鈴的角動量不變
  const d = db[0], t = 0.7;
  close(p.md * ((d.x + d.vx * t) * d.vy - (d.y + d.vy * t) * d.vx), p.md * (d.x * d.vy - d.y * d.vx), 1e-13);
});

test('對稱的雙手姿勢：手臂往前轉時 α̇ 的角動量左右抵消（L 只看 2m r²ω）', () => {
  const p = { Mb: 60, md: 2 }, r = 0.5, w = 2, ad = 0.8, a = C.armForward(r);
  // 右手在 φ+α、左手在 φ+π−α；角速度分別 ω+α̇、ω−α̇
  const Lr = p.md * r * r * (w + ad), Ll = p.md * r * r * (w - ad);
  close(Lr + Ll, 2 * p.md * r * r * w, 1e-14);
  assert.ok(a > 0 && a < Math.PI / 2);
  close(C.armForward(0.9), 0, 1e-15, '完全伸直時往兩側');
});

// ---------------- 模式三：兩盤相合 ----------------
test('兩盤相合：ω_f = (I1ω1 + I2ω2)/(I1 + I2)，滑動期間 L 每一刻都不變', () => {
  for (const p of [{ M1: 2, R1: 0.2, w1: 8, M2: 1, R2: 0.2, w2: 0, mu: 0.1 }, { M1: 1, R1: 0.25, w1: 5, M2: 3, R2: 0.12, w2: -6, mu: 0.3 }]) {
    const c = C.coupleResult(p);
    close(c.wf, (c.I1 * p.w1 + c.I2 * p.w2) / (c.I1 + c.I2), 1e-14);
    for (let i = 0; i <= 50; i++) {
      const s = c.tLock * 1.3 * i / 50, q = C.coupleAt(p, s);
      close(c.I1 * q.w1 + c.I2 * q.w2, c.L, 1e-12, 'L(t)');
    }
    const end = C.coupleAt(p, c.tLock * 1.01);
    assert.ok(end.locked); close(end.w1, c.wf, 1e-14); close(end.w2, c.wf, 1e-14);
    close(C.coupleAt(p, c.tLock * (1 - 1e-12)).w1, c.wf, 1e-9, '鎖定時刻兩盤轉速剛好相同');
  }
});

test('動能損失 = ½·I1I2/(I1+I2)·(ω1−ω2)² = 摩擦生熱；上盤原本靜止時損失比例 = I2/(I1+I2)', () => {
  const p = { M1: 2, R1: 0.2, w1: 8, M2: 1, R2: 0.2, w2: 0, mu: 0.1 };
  const c = C.coupleResult(p);
  close(c.loss, c.lossFormula, 1e-12, '損失公式');
  close(C.coupleAt(p, c.tLock).Q, c.loss, 1e-12, '生熱 = 損失');
  close(c.frac, c.I2 / (c.I1 + c.I2), 1e-12, '比例');
  // 相同的轉動慣量：剛好損失一半
  const q = C.coupleResult({ M1: 2, R1: 0.2, w1: 6, M2: 2, R2: 0.2, w2: 0, mu: 0.2 });
  close(q.frac, 0.5, 1e-14, '一半');
  close(q.wf, 3, 1e-14, '轉速減半');
});

test('最後的狀態與摩擦係數無關，只是 μ 越大越快一起轉（t ∝ 1/μ）；反向轉動可以剛好停住', () => {
  const base = { M1: 2, R1: 0.2, w1: 8, M2: 1, R2: 0.15, w2: 0 };
  const a = C.coupleResult(Object.assign({ mu: 0.1 }, base)), b = C.coupleResult(Object.assign({ mu: 0.4 }, base));
  close(a.wf, b.wf, 1e-14); close(a.loss, b.loss, 1e-14);
  close(a.tLock / b.tLock, 4, 1e-12, '時間 ∝ 1/μ');
  close(a.tau, 2 / 3 * 0.1 * 1 * 9.80665 * 0.15, 1e-14, 'τ = ⅔μMgR');
  const st = C.coupleResult({ M1: 2, R1: 0.2, w1: 6, M2: 3, R2: 0.2, w2: -4, mu: 0.2 });
  close(st.wf, 0, 1e-14, 'I1ω1 = −I2ω2 → 停住');
  close(st.frac, 1, 1e-14, '動能全部變成熱');
});

test('常數：g 用 SI 標準值 9.80665 m/s²；落下時間 √(2h/g)', () => {
  assert.strictEqual(C.G0, 9.80665);
  close(C.dropTime(0.05), Math.sqrt(0.1 / 9.80665), 1e-15);
});

console.log(passed + ' 項通過');
