// 以 Node 執行：node tests/esterification-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/esterification-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}（±${tol}），得到 ${a}`); }
const AW = { C: 12.011, H: 1.008, O: 15.999 };
/** 由示性式算莫耳質量（支援括號） */
function molar(f) {
  const tok = f.match(/[A-Z][a-z]?|\d+|\(|\)/g);
  const stack = [0];
  for (let i = 0; i < tok.length; i++) {
    const t = tok[i];
    if (t === '(') stack.push(0);
    else if (t === ')') { let v = stack.pop(); if (/^\d+$/.test(tok[i + 1] || '')) v *= +tok[++i]; stack[stack.length - 1] += v; }
    else if (/^\d+$/.test(t)) continue;
    else { let v = AW[t]; if (/^\d+$/.test(tok[i + 1] || '')) v *= +tok[++i]; stack[stack.length - 1] += v; }
  }
  return stack[0];
}
function runTo(run, tEnd, h) { while (run.t < tEnd - 1e-9) C.step(run, Math.min(h || 30, tEnd - run.t)); return run; }
const ACIDS = Object.keys(C.ACIDS), ALCS = Object.keys(C.ALCS);

test('數據：K(25 °C) = 4.0 → 等莫耳的乙酸＋乙醇恰有 2/3 變成酯（Berthelot 1862）', function () {
  const eq = C.equilibrium({ A: 1, B: 1, E: 0, W: 0 }, 25);
  near(eq.E, 2 / 3, 1e-9);
  near(C.yieldAtRatio(1, C.K(25)), 2 / 3, 1e-12);
});
test('數據：ΔH° 由生成焓算出（乙酸乙酯 −479.86 NIST、水 −285.83、乙酸 −484.3、乙醇 −277.6）≈ −3.8 kJ/mol', function () {
  near((-479.86 - 285.83) - (-484.3 - 277.6), C.DH, 0.05);
});
test('凡特荷夫：ln(K₂/K₁) = −ΔH/R·(1/T₂ − 1/T₁)；放熱，所以溫度越高 K 越小', function () {
  const T1 = 298.15, T2 = 353.15;
  near(Math.log(C.K(80) / C.K(25)), -C.DH * 1000 / C.R * (1 / T2 - 1 / T1), 1e-12);
  assert.ok(C.K(80) < C.K(50) && C.K(50) < C.K(20));
  near(C.K(80), 3.15, 0.01, '80 °C 的 K');
});
test('莫耳質量與示性式一致，質量守恆：酸 + 醇 = 酯 + 水（九種組合）', function () {
  ACIDS.forEach(a => near(C.ACIDS[a].M, molar(C.ACIDS[a].cond), 0.02, a));
  ALCS.forEach(b => near(C.ALCS[b].M, molar(C.ALCS[b].cond), 0.02, b));
  near(C.WATER.M, molar('H2O'), 0.01);
  ACIDS.forEach(a => ALCS.forEach(b => {
    const e = C.ester(a, b);
    near(e.M, molar(e.cond), 0.02, e.en + ' 的莫耳質量');
    near(C.ACIDS[a].M + C.ALCS[b].M, e.M + C.WATER.M, 0.03, e.en + ' 質量守恆');
  }));
  assert.strictEqual(C.ester('acetic', 'isoamyl').zh, '乙酸異戊酯');
  assert.strictEqual(C.ester('butyric', 'ethanol').en, 'ethyl butanoate');
  assert.strictEqual(C.ester('formic', 'methanol').cond, 'HCOOCH3');
});
test('解平衡：Q = K；同一組原子從左邊（酸＋醇）或右邊（酯＋水）出發，到同一個平衡', function () {
  [[0.5, 0.5, 0, 0], [0.3, 0.9, 0.1, 0.4], [1, 0.2, 0, 1.5]].forEach(n0 => {
    const n = { A: n0[0], B: n0[1], E: n0[2], W: n0[3] };
    [20, 50, 80].forEach(T => {
      const eq = C.equilibrium(n, T);
      near(Math.log(C.Q(eq) / C.K(T)), 0, 1e-9, 'ln(Q/K)');
    });
  });
  const f = C.equilibrium({ A: 0.6, B: 0.9, E: 0, W: 0 }, 60), r = C.equilibrium({ A: 0, B: 0.3, E: 0.6, W: 0.6 }, 60);
  ['A', 'B', 'E', 'W'].forEach(k => near(f[k], r[k], 1e-9, k));
});
test('平衡產率的解析式（醇 r 倍）與數值解一致；極限：r → ∞ 產率 → 1、K = 1 等莫耳 → 1/2', function () {
  [0.2, 0.5, 1, 2, 5, 10].forEach(r => {
    const eq = C.equilibrium({ A: 1, B: r, E: 0, W: 0 }, 70);
    near(C.yieldAtRatio(r, C.K(70)), eq.E / Math.min(1, r), 1e-9, 'r = ' + r);
  });
  near(C.yieldAtRatio(1e6, 4), 1, 1e-5);
  near(C.yieldAtRatio(1, 1), 0.5, 1e-12);
  near(C.yieldAtRatio(1, 1 + 1e-9), 0.5, 1e-6);
  // 等莫耳時 x/(1−x) = √K
  near(C.yieldAtRatio(1, 9), 0.75, 1e-12);
});
test('動力學：積分到夠久就到平衡；守恆（酸＋酯、醇＋酯、水－酯 不變）；反應進度 = 生成的酯', function () {
  ACIDS.forEach(a => ALCS.forEach(b => {
    const run = C.createRun({ acid: a, alc: b, A: 0.4, B: 0.7, E: 0.05, W: 0.1, cat: 1.5, T: 75 });
    runTo(run, 6 * 3600, 20);
    const eq = C.equilibrium({ A: 0.4, B: 0.7, E: 0.05, W: 0.1 }, 75);
    near(run.E, eq.E, 2e-4, a + '+' + b);
    near(run.A + run.E, 0.45, 1e-9); near(run.B + run.E, 0.75, 1e-9); near(run.W - run.E, 0.05, 1e-9);
    near(run.xi, run.E - 0.05, 1e-9);
    assert.ok(C.atEquilibrium(run), '判斷已達平衡');
  }));
});
test('數值積分收斂：時間步長 5 s 與 200 s（每一步內部自動細分）的結果相同', function () {
  const o = { acid: 'acetic', alc: 'ethanol', A: 0.5, B: 0.5, E: 0, W: 0, cat: 1, T: 70 };
  const a = runTo(C.createRun(o), 1200, 5), b = runTo(C.createRun(o), 1200, 200);
  near(a.E, b.E, 1e-6);
  // 初速：dξ/dt = k/V·nA·nB
  const r0 = C.createRun(o);
  near(C.rate(r0), C.kRate(r0) / (C.volume(r0) / 1000) * 0.25, 1e-15);
});
test('催化劑只改變速率、不改變平衡；阿瑞尼斯：溫度高 10 °C 速率常數變大', function () {
  const base = { acid: 'acetic', alc: 'ethanol', A: 0.5, B: 0.5, E: 0, W: 0, T: 80 };
  const a = C.createRun(Object.assign({ cat: 0 }, base)), b = C.createRun(Object.assign({ cat: 2 }, base));
  assert.ok(C.kRate(b) > 50 * C.kRate(a), '有催化劑快很多');
  runTo(a, 60 * 86400, 600); runTo(b, 60 * 86400, 600);
  near(a.E, b.E, 1e-4, '平衡相同');
  const r1 = C.createRun(Object.assign({ cat: 1 }, base, { T: 60 })), r2 = C.createRun(Object.assign({ cat: 1 }, base, { T: 70 }));
  const ratio = C.kRate(r2) / C.kRate(r1);
  near(ratio, Math.exp(-C.EC / C.R * (1 / 343.15 - 1 / 333.15)), 0.02, '60 → 70 °C');
  assert.ok(ratio > 1.6 && ratio < 2.0);
});
test('時間尺度：預設（70 °C、濃硫酸 1 mL）約 1 小時到平衡；不加催化劑、80 °C 要好幾天', function () {
  const run = C.createRun({ acid: 'acetic', alc: 'ethanol', A: 0.5, B: 0.5, E: 0, W: 0, cat: 1, T: 70 });
  let teq = null;
  while (run.t < 4 * 3600) { C.step(run, 10); if (teq == null && C.atEquilibrium(run)) teq = run.t; }
  assert.ok(teq > 2400 && teq < 7200, '到平衡 ' + teq + ' s');
  const slow = C.createRun({ acid: 'acetic', alc: 'ethanol', A: 0.5, B: 0.5, E: 0, W: 0, cat: 0, T: 80 });
  runTo(slow, 86400, 600);
  assert.ok(C.yieldOf(slow) < 0.35, '一天後產率 ' + C.yieldOf(slow));
});
test('勒沙特列：平衡時加水 → 酯變少；加醇 → 酯變多；加等量的酸與水，若此時 nA = nW 則完全不移動', function () {
  const run = C.createRun({ acid: 'acetic', alc: 'ethanol', A: 0.5, B: 0.5, E: 0, W: 0, cat: 1, T: 70 });
  runTo(run, 4 * 3600);
  const e0 = run.E;
  C.addSpecies(run, 'W'); runTo(run, run.t + 4 * 3600);
  assert.ok(run.E < e0 - 0.01, '加水後酯變少');
  const e1 = run.E; C.addSpecies(run, 'B'); runTo(run, run.t + 4 * 3600);
  assert.ok(run.E > e1 + 0.01, '加醇後酯變多');
  // nA = nW 的平衡：A 0.8、B 0.5 在 25 °C → E = W = A = 0.4、B = 0.1
  const eq = C.equilibrium({ A: 0.8, B: 0.5, E: 0, W: 0 }, 25);
  near(eq.A, 0.4, 1e-9); near(eq.W, 0.4, 1e-9);
  const n = { A: eq.A + 0.1, B: eq.B, E: eq.E, W: eq.W + 0.1 };
  near(C.solveXi(n, C.K(25)), 0, 1e-12, '不移動');
});
test('溫度：放熱反應，升溫使平衡的酯稍微變少（勒沙特列），但產率只差 1–3 個百分點', function () {
  const lo = C.equilibrium({ A: 0.5, B: 1, E: 0, W: 0 }, 25), hi = C.equilibrium({ A: 0.5, B: 1, E: 0, W: 0 }, 80);
  assert.ok(hi.E < lo.E);
  near(lo.E - hi.E, 0.013, 0.006);
});
test('分子篩吸水：水被移走，產率可超過 K 允許的上限；容量用完就停（不會吸超過 0.222 mol/20 g）', function () {
  const run = C.createRun({ acid: 'acetic', alc: 'ethanol', A: 0.5, B: 0.5, E: 0, W: 0, cat: 1, T: 70 });
  C.addSieves(run); C.addSieves(run); C.addSieves(run); C.addSieves(run);
  runTo(run, 12 * 3600, 60);
  assert.ok(C.yieldOf(run) > 0.95, '產率 ' + C.yieldOf(run));
  near(run.W + run.bound - run.E, 0, 1e-9, '水的守恆（含被吸走的）');
  const one = C.createRun({ acid: 'acetic', alc: 'ethanol', A: 0.5, B: 0.5, E: 0, W: 0, cat: 1, T: 70 });
  C.addSieves(one); runTo(one, 24 * 3600, 120);
  assert.ok(one.bound <= C.SIEVE_CAP + 1e-12);
  near(one.bound, C.SIEVE_CAP, 0.002, '吸滿');
  near(C.SIEVE_CAP, 0.2 * 20 / 18.015, 1e-12);
});
test('一開始就是平衡（Q = K）：長時間後組成不變', function () {
  const run = C.createRun({ acid: 'acetic', alc: 'ethanol', A: 0.25, B: 0.25, E: 0.5, W: 0.5, cat: 1, T: 25 });
  near(C.Q(run), C.K(25), 1e-12);
  runTo(run, 10 * 3600, 60);
  near(run.E, 0.5, 1e-9);
  assert.ok(C.atEquilibrium(run));
});
test('體積與燒瓶：純液體體積相加；液體不超過燒瓶的一半；加料最多到六分滿', function () {
  const run = C.createRun({ acid: 'acetic', alc: 'ethanol', A: 1, B: 1, E: 0, W: 0, cat: 0, T: 25 });
  near(C.volume(run), 60.05 / 1.049 + 46.07 / 0.789, 1e-9);
  assert.strictEqual(run.flask, 250);
  let k = 0; while (C.addSpecies(run, 'W') && k < 1000) k++;
  assert.ok(C.volume(run) <= 0.6 * 250 + 1e-9 && C.volume(run) > 0.6 * 250 - 2);
  near(C.H2SO4_PER_ML, 0.01838, 0.0001, '濃硫酸 18.4 M');
});
test('分液：碳酸鈉中和剩下的酸與硫酸，CO₂ = nA/2 + n(H₂SO₄)；O-18 標記讓酯重 2.004 g/mol', function () {
  const run = C.createRun({ acid: 'acetic', alc: 'ethanol', A: 0.4, B: 0.4, E: 0.2, W: 0.2, cat: 1, T: 25, label: true });
  const w = C.workup(run);
  near(w.co2, 0.2 + C.H2SO4_PER_ML, 1e-12);
  near(C.esterM(run), 88.11 + 2.004, 1e-9);
  near(C.esterM(run, 'alkyl'), 88.11, 1e-9);
  near(C.waterM(run, 'alkyl'), 18.015 + 2.004, 1e-9);
});
test('3D 分子：鍵長、鍵角是給定的值（z-matrix 正確）', function () {
  const ac = C.molecule('acid', 'acetic'), P = i => ac.atoms[i].p;
  near(C.dist(P(0), P(1)), 1.21, 1e-9); near(C.dist(P(0), P(2)), 1.34, 1e-9); near(C.dist(P(2), P(3)), 0.96, 1e-9);
  near(C.angle(P(1), P(0), P(2)), 123, 1e-6); near(C.angle(P(0), P(2), P(3)), 107, 1e-6);
  near(C.angle(P(1), P(0), P(4)), 125, 1e-6);
  ['formic', 'acetic', 'butyric'].forEach(k => {
    const m = C.molecule('acid', k);
    const f = m.atoms.reduce((o, a) => (o[a.el] = (o[a.el] || 0) + 1, o), {});
    near(f.C * AW.C + f.H * AW.H + f.O * AW.O, C.ACIDS[k].M, 0.02, k + ' 原子數');
    m.bonds.forEach(b => assert.ok(C.dist(m.atoms[b.a].p, m.atoms[b.b].p) < 1.6, k + ' 鍵太長'));
  });
  ['methanol', 'ethanol', 'isoamyl'].forEach(k => {
    const m = C.molecule('alc', k);
    const f = m.atoms.reduce((o, a) => (o[a.el] = (o[a.el] || 0) + 1, o), {});
    near(f.C * AW.C + f.H * AW.H + f.O * AW.O, C.ALCS[k].M, 0.02, k + ' 原子數');
    // 不相鍵結的原子不可撞在一起
    for (let i = 0; i < m.atoms.length; i++) for (let j = i + 1; j < m.atoms.length; j++) {
      const bonded = m.bonds.some(b => (b.a === i && b.b === j) || (b.a === j && b.b === i));
      if (!bonded) assert.ok(C.dist(m.atoms[i].p, m.atoms[j].p) > 1.4, k + ' 原子 ' + i + '、' + j + ' 太近');
    }
  });
});
test('機構：醯氧斷裂（真實）→ 標記的氧留在酯裡；烷氧斷裂（假設）→ 標記跑到水裡；產物的鍵長正確、原子守恆', function () {
  ACIDS.forEach(a => ALCS.forEach(b => {
    ['acyl', 'alkyl'].forEach(mode => {
      const m = C.mechanism(a, b, mode);
      assert.strictEqual(m.esterSet.length + m.waterSet.length, m.atoms.length);
      assert.strictEqual(m.waterSet.length, 3);
      const wO = m.waterSet.filter(i => m.atoms[i].el === 'O');
      assert.strictEqual(wO.length, 1);
      m.waterSet.forEach(i => { if (i !== wO[0]) near(C.dist(m.atoms[i].P, m.atoms[wO[0]].P), 0.96, 1e-9, '水的 O–H'); });
      const hs = m.waterSet.filter(i => i !== wO[0]);
      near(C.angle(m.atoms[hs[0]].P, m.atoms[wO[0]].P, m.atoms[hs[1]].P), 104.5, 1e-6, 'H–O–H');
      // 產物的鍵都合理
      m.bondsP.forEach(bd => {
        const d = C.dist(m.atoms[bd.a].P, m.atoms[bd.b].P);
        assert.ok(d > 0.9 && d < 1.6, a + b + mode + ' 產物鍵長 ' + d.toFixed(3));
      });
      // 反應物的鍵都合理
      m.bondsR.forEach(bd => {
        const d = C.dist(m.atoms[bd.a].R, m.atoms[bd.b].R);
        assert.ok(d > 0.9 && d < 1.6, '反應物鍵長');
      });
      if (mode === 'acyl') {
        assert.ok(m.esterSet.indexOf(m.label) >= 0, '標記在酯');
        near(C.dist(m.atoms[0].P, m.atoms[m.iOa].P), 1.34, 1e-9, '酯的 C(=O)–O');
        near(C.dist(m.atoms[m.iOa].P, m.atoms[m.iCa].P), 1.43, 1e-9, 'O–C(烷基)');
        near(C.angle(m.atoms[0].P, m.atoms[m.iOa].P, m.atoms[m.iCa].P), 116, 1e-6, 'C–O–C');
      } else {
        assert.ok(m.waterSet.indexOf(m.label) >= 0, '標記在水');
        near(C.dist(m.atoms[m.iOh].P, m.atoms[m.iCa].P), 1.43, 1e-9);
      }
      // 產物中，酯分子的原子彼此不撞、和水不撞
      for (let i = 0; i < m.atoms.length; i++) for (let j = i + 1; j < m.atoms.length; j++) {
        const bonded = m.bondsP.some(bd => (bd.a === i && bd.b === j) || (bd.a === j && bd.b === i));
        if (!bonded) assert.ok(C.dist(m.atoms[i].P, m.atoms[j].P) > 1.25, a + b + mode + ' 產物原子 ' + i + '、' + j + ' 太近 ' + C.dist(m.atoms[i].P, m.atoms[j].P).toFixed(2));
      }
      // 插值的端點
      const p0 = C.mechAt(m, 0), p1 = C.mechAt(m, 1);
      near(C.dist(p0[0], m.atoms[0].R), 0, 1e-12); near(C.dist(p1[m.label], m.atoms[m.label].P), 0, 1e-12);
    });
  }));
});

console.log(process.exitCode ? '有測試失敗' : '全部 ' + passed + ' 項通過');
