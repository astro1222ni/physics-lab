// 以 Node 執行：node tests/heat-engine-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/heat-engine-core.js');

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
const R = C.R, L = 1e-3, kPa = 1e3;

// 可重現的亂數（線性同餘）
let seed = 12345;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }

// 各種循環的參數（SI）
function allCycles() {
  const out = [];
  ['mono', 'di'].forEach(gas => {
    [false, true].forEach(rev => {
      out.push(C.carnot({ n: 1, gas, Th: 600, Tc: 300, VA: 2 * L, rB: 2, reverse: rev }));
      out.push(C.otto({ n: 0.5, gas, r: 8, T1: 300, T3: 1800, V1: 10 * L, reverse: rev }));
      out.push(C.diesel({ n: 1.2, gas, r: 18, rc: 2, T1: 300, V1: 10 * L, reverse: rev }));
      out.push(C.stirling({ n: 1, gas, Th: 900, Tc: 300, Vmin: 2 * L, r: 3, regen: true, reverse: rev }));
      out.push(C.stirling({ n: 1, gas, Th: 900, Tc: 300, Vmin: 2 * L, r: 3, regen: false, reverse: rev }));
      out.push(C.brayton({ n: 0.3, gas, rp: 8, T1: 300, T3: 1400, P1: 100 * kPa, reverse: rev }));
      out.push(C.custom({ n: 1, gas, pts: [{ V: 8 * L, P: 300 * kPa }, { V: 8 * L, P: 700 * kPa }, { V: 20 * L, P: 700 * kPa }, { V: 20 * L, P: 300 * kPa }], reverse: rev }));
      out.push(C.custom({ n: 0.7, gas, pts: [{ V: 3 * L, P: 900 * kPa }, { V: 22 * L, P: 150 * kPa }, { V: 12 * L, P: 80 * kPa }], reverse: rev }));
    });
  });
  return out;
}
/** 沿路徑細分取樣，用梯形法算 ∮P dV（與核心的解析式無關） */
function numericArea(c, k) {
  let s = 0;
  c.segs.forEach(seg => {
    let prev = seg.at(0);
    for (let i = 1; i <= k; i++) { const q = seg.at(i / k); s += (prev.P + q.P) / 2 * (q.V - prev.V); prev = q; }
  });
  return s;
}

// ======================= 常數與氣體 =======================
test('氣體常數 R = N_A k = 8.314 462 618… J/(mol·K)', () => {
  close(R, 8.314462618153240, 1e-15);
  const di = C.gasOf('di'), mo = C.gasOf('mono');
  close(di.gamma, 1.4, 1e-15); close(mo.gamma, 5 / 3, 1e-15);
  close(di.Cp - di.Cv, R, 1e-15, '邁爾關係 C_P − C_V = R');
});

// ======================= 四種基本過程 =======================
test('等溫膨脹：1 mol、300 K、1 L → 2 L，W = −nRT ln 2 ≈ −1728.95 J', () => {
  const A = C.fromVT(1, 1 * L, 300), B = C.fromVT(1, 2 * L, 300);
  const s = C.segment('isoT', 1, 'di', A, B);
  close(s.W, -R * 300 * Math.log(2), 1e-14);
  near(s.W, -1728.95, 0.01);
  close(s.Q, -s.W, 1e-15); near(s.dU, 0, 1e-12);
  close(s.dS, R * Math.log(2), 1e-12, 'ΔS = nR ln(V2/V1)');
  close(s.Qin, s.Q, 1e-15); assert.strictEqual(s.Qout, 0);
});
test('等容加熱：2 mol 雙原子 300 → 400 K，Q = ΔU = nC_V ΔT ≈ 4157.23 J，W = 0', () => {
  const A = C.fromVT(2, 10 * L, 300), B = C.fromVT(2, 10 * L, 400);
  const s = C.segment('isoV', 2, 'di', A, B);
  assert.strictEqual(s.W, 0);
  close(s.Q, 2 * 2.5 * R * 100, 1e-14); near(s.Q, 4157.23, 0.01);
  close(s.dS, 2 * 2.5 * R * Math.log(4 / 3), 1e-12, 'ΔS = nC_V ln(T2/T1)');
  close(s.B.P / s.A.P, 4 / 3, 1e-14, '給呂薩克：P ∝ T');
});
test('等壓膨脹：單原子 100 kPa、10 → 20 L，W = −PΔV = −1000 J，Q = 2500 J，ΔU = 1500 J', () => {
  const A = C.fromPV(1, 100 * kPa, 10 * L), B = C.fromPV(1, 100 * kPa, 20 * L);
  const s = C.segment('isoP', 1, 'mono', A, B);
  close(s.W, -1000, 1e-14); close(s.Q, 2500, 1e-13); close(s.dU, 1500, 1e-13);
  close(s.dS, 2.5 * R * Math.log(2), 1e-12, 'ΔS = nC_P ln(T2/T1)');
});
test('絕熱膨脹：單原子 300 K、10 → 20 L，T2 = 300 × 2^(−2/3) ≈ 188.99 K，PV^γ 不變、Q = 0', () => {
  const A = C.fromVT(1, 10 * L, 300);
  const T2 = 300 * Math.pow(2, -2 / 3);
  const B = C.fromVT(1, 20 * L, T2);
  near(T2, 188.988, 0.001);
  const s = C.segment('adiabat', 1, 'mono', A, B);
  assert.strictEqual(s.Q, 0);
  close(s.W, 1.5 * R * (T2 - 300), 1e-13); close(s.W, s.dU, 1e-15);
  near(s.dS, 0, 1e-12);
  const g = 5 / 3;
  for (let u = 0; u <= 1; u += 0.125) { const q = s.at(u); close(q.P * Math.pow(q.V, g), A.P * Math.pow(A.V, g), 1e-12, 'PV^γ'); }
});
test('每一段過程都滿足 ΔU = Q + W，且 ΔS 與狀態函數公式一致（隨機 400 段）', () => {
  for (let i = 0; i < 400; i++) {
    const gas = rnd() < 0.5 ? 'mono' : 'di', n = 0.1 + 1.9 * rnd(), G = C.gasOf(gas);
    const A = C.fromVT(n, (0.5 + 24 * rnd()) * L, 200 + 2000 * rnd());
    const kind = C.KINDS[i % 5];
    let B;
    if (kind === 'isoT') B = C.fromVT(n, (0.5 + 24 * rnd()) * L, A.T);
    else if (kind === 'isoV') B = C.fromVT(n, A.V, 200 + 2000 * rnd());
    else if (kind === 'isoP') B = C.fromPV(n, A.P, (0.5 + 24 * rnd()) * L);
    else if (kind === 'adiabat') { const V = (0.5 + 24 * rnd()) * L; B = C.fromVT(n, V, A.T * Math.pow(A.V / V, G.gamma - 1)); }
    else B = C.fromPV(n, (20 + 900 * rnd()) * kPa, (0.5 + 24 * rnd()) * L);
    const s = C.segment(kind, n, gas, A, B);
    close(s.dU, s.Q + s.W, 1e-9, kind + ' ΔU = Q + W');
    close(s.dS, n * G.Cv * Math.log(B.T / A.T) + n * R * Math.log(B.V / A.V), 1e-9, kind + ' ΔS');
    close(s.Qin - s.Qout, s.Q, 1e-9, kind + ' 吸熱 − 放熱 = Q');
    const r = C.reverseSegment(s);
    close(r.Q, -s.Q, 1e-9); close(r.W, -s.W, 1e-9); close(r.Qin, s.Qout, 1e-9, '反向：吸放熱對調');
  }
});

// ======================= 直線段的吸放熱拆分 =======================
/**
 * 細分數值積分（不用核心的 V* 與原函數）：dQ/dV = nC_V dT/dV + P，dT/dV = (P + bV)/(nR)，
 * 中點法細分 N 段、只把正的部分加進吸熱、負的加進放熱（Kahan 補償求和）；回傳 [吸熱, 放熱]
 */
function numericSplit(n, gas, A, B, N) {
  const G = C.gasOf(gas), dV = (B.V - A.V) / N;
  const b = (B.P - A.P) / (B.V - A.V);
  const Pv = V => A.P + b * (V - A.V); // 以端點為基準，避免近乎鉛直的直線相消
  const acc = [[0, 0], [0, 0]];
  const add = (k, x) => { const y = x - acc[k][1], t = acc[k][0] + y; acc[k][1] = (t - acc[k][0]) - y; acc[k][0] = t; };
  for (let i = 0; i < N; i++) {
    const V = A.V + (i + 0.5) * dV, P = Pv(V);
    const dq = (n * G.Cv * (P + b * V) / (n * R) + P) * dV;
    if (dq > 0) add(0, dq); else add(1, -dq);
  }
  return [acc[0][0], acc[1][0]];
}
test('直線段吸放熱拆分：V* 的解析式與細分數值積分相符（相對誤差 1e-9）', () => {
  // 從高壓小體積到低壓大體積：先吸熱後放熱（典型的例子）
  const n = 1, gas = 'di';
  const A = C.fromPV(n, 900 * kPa, 2 * L), B = C.fromPV(n, 100 * kPa, 22 * L);
  const s = C.segment('line', n, gas, A, B);
  assert.strictEqual(s.parts.length, 2, '應拆成兩部分');
  const b = (B.P - A.P) / (B.V - A.V), a = A.P - b * A.V;
  const Vs = -(2.5 + 1) * a / ((2 * 2.5 + 1) * b);
  close(s.parts[0].V1, Vs, 1e-14, 'V*');
  const num = numericSplit(n, gas, A, B, 2000000);
  close(s.Qin, num[0], 1e-9, '吸熱');
  close(s.Qout, num[1], 1e-9, '放熱');
  assert.ok(s.Qin > Math.abs(s.Q), '只看整段 Q 會低估吸熱');
});
test('直線段拆分：隨機 60 段（含單原子、反向、不拆的段）都與數值積分相符', () => {
  for (let i = 0; i < 60; i++) {
    const gas = i % 2 ? 'mono' : 'di', n = 0.2 + 1.8 * rnd();
    const A = C.fromPV(n, (20 + 980 * rnd()) * kPa, (0.5 + 24.5 * rnd()) * L);
    const B = C.fromPV(n, (20 + 980 * rnd()) * kPa, (0.5 + 24.5 * rnd()) * L);
    const s = C.segment('line', n, gas, A, B);
    const num = numericSplit(n, gas, A, B, 2000000);
    const sc = Math.max(s.Qin, s.Qout);
    near(s.Qin, num[0], 1e-9 * sc, '吸熱'); near(s.Qout, num[1], 1e-9 * sc, '放熱');
  }
});
test('直線段的最高溫可以在中間：T 沿線是拋物線', () => {
  const n = 1, A = C.fromPV(n, 900 * kPa, 2 * L), B = C.fromPV(n, 100 * kPa, 22 * L);
  const s = C.segment('line', n, 'di', A, B);
  const b = (B.P - A.P) / (B.V - A.V), a = A.P - b * A.V, Vm = -a / (2 * b);
  close(s.Tmax, Vm * (a + b * Vm) / (n * R), 1e-12);
  assert.ok(s.Tmax > A.T && s.Tmax > B.T, '兩端都不是最高溫');
});

// ======================= 循環：已知效率 =======================
test('卡諾：η = 1 − T_c/T_h，W_out = nR(T_h − T_c) ln(V_B/V_A)，Q_in = nRT_h ln(V_B/V_A)', () => {
  ['mono', 'di'].forEach(gas => {
    const c = C.carnot({ n: 1, gas, Th: 600, Tc: 300, VA: 2 * L, rB: 2 });
    close(c.eta, 0.5, 1e-12); close(c.etaC, 0.5, 1e-12); close(c.ratio, 1, 1e-12);
    close(c.Wout, R * 300 * Math.log(2), 1e-12);
    close(c.Qin, R * 600 * Math.log(2), 1e-12);
    close(c.Qout, R * 300 * Math.log(2), 1e-12);
    assert.strictEqual(c.Tmax, 600); assert.strictEqual(c.Tmin, 300);
  });
  close(C.etaCarnot(1200, 300), 0.75, 1e-15);
});
test('奧圖：η = 1 − r^(1−γ)，與最高溫 T3 無關；單原子比雙原子高', () => {
  [2, 5.66, 8, 14].forEach(r => ['mono', 'di'].forEach(gas => [1.05, 2, 3].forEach(k => {
    const T3 = k * 300 * Math.pow(r, C.gasOf(gas).gamma - 1); // 高於壓縮後的 T2
    const c = C.otto({ n: 1, gas, r, T1: 300, T3, V1: 10 * L });
    close(c.eta, C.etaOtto(r, C.gasOf(gas).gamma), 1e-12, `r=${r} ${gas} T3=${T3}`);
  })));
  close(C.etaOtto(8, 1.4), 1 - Math.pow(8, -0.4), 1e-15);
  near(C.etaOtto(8, 1.4), 0.5647, 1e-4);
  assert.ok(C.otto({ n: 1, gas: 'mono', r: 8, T1: 300, T3: 1800, V1: 10 * L }).eta > C.otto({ n: 1, gas: 'di', r: 8, T1: 300, T3: 1800, V1: 10 * L }).eta);
});
test('狄塞爾：η = 1 − r^(1−γ)(r_c^γ − 1)/[γ(r_c − 1)]；同壓縮比時比奧圖低', () => {
  [10, 18, 22].forEach(r => [1.2, 2, 4].forEach(rc => ['mono', 'di'].forEach(gas => {
    const g = C.gasOf(gas).gamma;
    const c = C.diesel({ n: 1, gas, r, rc, T1: 300, V1: 10 * L });
    close(c.eta, C.etaDiesel(r, rc, g), 1e-12, `r=${r} rc=${rc}`);
    assert.ok(c.eta < C.etaOtto(r, g), '同壓縮比：狄塞爾 < 奧圖');
  })));
  near(C.etaDiesel(18, 2, 1.4), 0.6316, 1e-4);
});
test('布雷頓：η = 1 − r_p^((1−γ)/γ)；r_p = r^γ 時與奧圖效率相同', () => {
  [2, 8, 20].forEach(rp => ['mono', 'di'].forEach(gas => {
    const g = C.gasOf(gas).gamma;
    const c = C.brayton({ n: 1, gas, rp, T1: 300, T3: 1400, P1: 100 * kPa });
    close(c.eta, C.etaBrayton(rp, g), 1e-12);
  }));
  close(C.etaBrayton(Math.pow(5, 1.4), 1.4), C.etaOtto(5, 1.4), 1e-12);
});
test('史特林：開回熱器時效率等於卡諾效率；關掉時較低，符合解析式', () => {
  ['mono', 'di'].forEach(gas => {
    const G = C.gasOf(gas), p = { n: 1, gas, Th: 900, Tc: 300, Vmin: 2 * L, r: 3 };
    const on = C.stirling(Object.assign({ regen: true }, p)), off = C.stirling(Object.assign({ regen: false }, p));
    close(on.eta, 1 - 300 / 900, 1e-12, '回熱器開：η = η_C');
    const lnr = Math.log(3), exp = R * lnr * 600 / (R * 900 * lnr + G.Cv * 600);
    close(off.eta, exp, 1e-12, '回熱器關');
    assert.ok(off.eta < on.eta);
    close(on.Qinternal, G.Cv * 600, 1e-12, '回熱器存放的熱 nC_V(T_h − T_c)');
    close(on.Wout, off.Wout, 1e-12, '淨功一樣');
  });
});

// ======================= 守恆量 =======================
test('任何循環（含逆向、自訂）：ΣΔU = 0、ΣΔS = 0、ΣQ = W_out', () => {
  allCycles().forEach(c => {
    const sc = Math.max(c.Qin, c.Qout, c.Qinternal);
    near(c.dU, 0, 1e-12 * sc, c.type + ' ΔU');
    near(c.dS, 0, 1e-12 * sc / c.Tmin, c.type + ' ΔS');
    near(c.Q, c.Wout, 1e-12 * sc, c.type + ' ΣQ = W_out');
    near(c.Qin - c.Qout, c.Wout, 1e-12 * sc, c.type + ' Q_in − Q_out = W_out');
    // 頂點首尾相接
    c.segs.forEach((s, i) => { const nx = c.segs[(i + 1) % c.segs.length]; close(s.B.V, nx.A.V, 1e-12); close(s.B.P, nx.A.P, 1e-12); });
  });
});
test('淨功＝P–V 圖上圍成的有號面積（曲線循環細分 4000 段的梯形面積相對誤差 < 1e-6）', () => {
  allCycles().forEach(c => { close(numericArea(c, 4000), c.Wout, 1e-6, c.type); });
});
test('自訂多邊形：淨功與鞋帶公式完全一致；順時針為熱機、逆時針為冰箱', () => {
  const pts = [{ V: 8 * L, P: 300 * kPa }, { V: 8 * L, P: 700 * kPa }, { V: 20 * L, P: 700 * kPa }, { V: 20 * L, P: 300 * kPa }];
  const c = C.custom({ n: 1, gas: 'di', pts });
  close(c.Wout, C.shoelace(pts), 1e-13); close(c.Wout, 400 * kPa * 12 * L, 1e-13, '長方形面積 4800 J');
  assert.ok(c.engine);
  const ccw = C.custom({ n: 1, gas: 'di', pts: pts.slice().reverse() });
  close(ccw.Wout, -4800, 1e-13); assert.ok(ccw.fridge);
  assert.deepStrictEqual(c.segs.map(s => s.kind), ['isoV', 'isoP', 'isoV', 'isoP']);
});
test('自交的「8 字形」：兩個小迴圈一正一負，淨功是有號面積的和', () => {
  // (2,200) → (12,800) → (12,200) → (2,800)：在 V = 7 L 交叉一次
  const pts = [{ V: 2 * L, P: 200 * kPa }, { V: 12 * L, P: 800 * kPa }, { V: 12 * L, P: 200 * kPa }, { V: 2 * L, P: 800 * kPa }];
  const c = C.custom({ n: 1, gas: 'di', pts });
  assert.strictEqual(c.crossings, 1);
  const lp = C.loops(pts);
  assert.strictEqual(lp.length, 2);
  assert.ok(lp[0].area * lp[1].area < 0, '一正一負');
  near(lp[0].area + lp[1].area, c.Wout, 1e-9);
  near(c.Wout, 0, 1e-9, '對稱的 8 字形淨功為 0');
  assert.ok(c.Qin > 1000, '但仍有吸熱：Q_in = ' + c.Qin.toFixed(1) + ' J');
  close(numericArea(c, 1000), c.Wout + 1e-300, 1, '');
  // 不對稱的 8 字形
  const p2 = [{ V: 2 * L, P: 200 * kPa }, { V: 14 * L, P: 800 * kPa }, { V: 14 * L, P: 200 * kPa }, { V: 2 * L, P: 600 * kPa }];
  const c2 = C.custom({ n: 1, gas: 'di', pts: p2 });
  close(C.loops(p2).reduce((s, l) => s + l.area, 0), c2.Wout, 1e-12);
  assert.strictEqual(C.crossings(pts.slice(0, 3)), 0, '三角形不會自交');
});

// ======================= 逆向運轉 =======================
test('逆向卡諾：K_R = T_c/(T_h − T_c)、K_HP = T_h/(T_h − T_c)，剛好等於卡諾上限', () => {
  const c = C.carnot({ n: 1, gas: 'di', Th: 360, Tc: 300, VA: 2 * L, rB: 2, reverse: true });
  assert.ok(c.fridge && !c.engine);
  close(c.KR, 5, 1e-12); close(c.KHP, 6, 1e-12);
  close(c.KRC, 5, 1e-12); close(c.KHPC, 6, 1e-12);
  close(c.KHP, c.KR + 1, 1e-12, 'K_HP = K_R + 1');
  const f = C.carnot({ n: 1, gas: 'di', Th: 360, Tc: 300, VA: 2 * L, rB: 2 });
  close(c.Qin, f.Qout, 1e-12, '冰箱從冷處吸的熱 = 熱機排給冷處的熱');
  close(c.Wout, -f.Wout, 1e-12);
});
test('逆向史特林：開回熱器等於卡諾上限；所有逆向循環 K_R ≤ 上限（有定義時）', () => {
  const on = C.stirling({ n: 1, gas: 'di', Th: 400, Tc: 300, Vmin: 2 * L, r: 3, regen: true, reverse: true });
  close(on.KR, 3, 1e-12); close(on.KRC, 3, 1e-12);
  const off = C.stirling({ n: 1, gas: 'di', Th: 400, Tc: 300, Vmin: 2 * L, r: 3, regen: false, reverse: true });
  assert.ok(Number.isNaN(off.KRC), '關掉回熱器：吸熱與放熱的溫度範圍重疊，找不到能搭配的冷、熱庫');
  allCycles().filter(c => c.fridge && isFinite(c.KRC)).forEach(c => assert.ok(c.KR <= c.KRC * (1 + 1e-12), c.type));
});

// ======================= 第二定律 =======================
test('第二定律：隨機 1000 個自訂多邊形（3–6 個頂點，可自交），熱機效率都 ≤ 卡諾效率，冰箱 K_R ≤ 上限', () => {
  let eng = 0, fr = 0, maxRatio = 0;
  for (let i = 0; i < 1000; i++) {
    const m = 3 + Math.floor(rnd() * 4);
    const pts = [];
    for (let k = 0; k < m; k++) pts.push({ V: (0.5 + 24.5 * rnd()) * L, P: (10 + 990 * rnd()) * kPa });
    const c = C.custom({ n: 0.1 + 1.9 * rnd(), gas: rnd() < 0.5 ? 'mono' : 'di', pts, reverse: rnd() < 0.3 });
    if (c.engine) { eng++; assert.ok(c.eta <= c.etaC * (1 + 1e-12), `η = ${c.eta} > η_C = ${c.etaC}`); maxRatio = Math.max(maxRatio, c.ratio); }
    if (c.fridge && isFinite(c.KRC)) { fr++; assert.ok(c.KR <= c.KRC * (1 + 1e-12)); }
    near(c.dS, 0, 1e-9 * Math.max(c.Qin, 1) / c.Tmin);
  }
  assert.ok(eng > 300, '有足夠的熱機樣本');
  assert.ok(maxRatio < 1, '多邊形達不到卡諾效率，最高 η/η_C = ' + maxRatio.toFixed(3));
});

// ======================= 極限 =======================
test('極限：r → 1 時奧圖、狄塞爾、布雷頓效率 → 0；T_c → T_h 時卡諾效率 → 0', () => {
  near(C.otto({ n: 1, gas: 'di', r: 1 + 1e-7, T1: 300, T3: 1000, V1: 10 * L }).eta, 0, 1e-6);
  near(C.brayton({ n: 1, gas: 'di', rp: 1 + 1e-7, T1: 300, T3: 1000, P1: 100 * kPa }).eta, 0, 1e-6);
  near(C.etaDiesel(1 + 1e-6, 1 + 1e-7, 1.4), 0, 1e-5);
  const c = C.carnot({ n: 1, gas: 'di', Th: 300 + 1e-6, Tc: 300, VA: 2 * L, rB: 2 });
  near(c.etaC, 0, 1e-8); near(c.eta, 0, 1e-8);
  // 狄塞爾截止比 → 1 時趨近奧圖
  close(C.etaDiesel(18, 1 + 1e-6, 1.4), C.etaOtto(18, 1.4), 1e-6);
  // 冰箱：T_h → T_c 時 K_R → ∞
  assert.ok(C.carnot({ n: 1, gas: 'di', Th: 301, Tc: 300, VA: 2 * L, rB: 2, reverse: true }).KR > 299);
});
test('奧圖的 T3 低於壓縮後溫度 T2：淨功變負（不再是熱機），能量帳仍然守恆', () => {
  const c = C.otto({ n: 1, gas: 'di', r: 8, T1: 300, T3: 600, V1: 10 * L });
  assert.ok(c.Wout < 0 && c.fridge);
  near(c.dU, 0, 1e-9); near(c.Q, c.Wout, 1e-9);
});

console.log(`\n${passed} 項通過${process.exitCode ? '，有失敗' : ''}`);
