// 以 Node 執行：node tests/specific-heat-core.test.js
'use strict';
const assert = require('assert');
const HC = require('../js/specific-heat-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  const t = tol * Math.max(Math.abs(a), Math.abs(b), 1);
  assert.ok(Math.abs(a - b) <= t, (msg || '') + ` 期望 ${b}，得到 ${a}`);
}
const S = HC.SUBSTANCES;
const cw = HC.C_WATER, ci = HC.C_ICE, cs = HC.C_STEAM, Lf = HC.L_FUSION, Lv = HC.L_VAPOR;
const body = (s, m, Cx) => HC.makeBody(s, m, Cx);
const water = (m, Cx) => body('h2o', m, Cx);
const H = (b, T, ph) => HC.enthalpyAt(b, T, ph);
const T = (b, h) => HC.temperature(b, h);
const eq2 = (a, ha, b, hb) => HC.equilibrium([{ b: a, H: ha }, { b: b, H: hb }]);

console.log('specific-heat-core');

test('材料資料：水 4186、冰 2100、水蒸氣 2010、鋁 900、鐵 450、銅 385、鉛 128 J/(kg·K)；L_f、L_v', () => {
  assert.strictEqual(cw, 4186); assert.strictEqual(S.h2o.phases[1].c, 4186);
  assert.strictEqual(ci, 2100); assert.strictEqual(cs, 2010);
  assert.strictEqual(S.al.phases[0].c, 900); assert.strictEqual(S.fe.phases[0].c, 450);
  assert.strictEqual(S.cu.phases[0].c, 385); assert.strictEqual(S.pb.phases[0].c, 128);
  assert.strictEqual(Lf, 3.34e5); assert.strictEqual(Lv, 2.26e6);
  assert.deepStrictEqual(S.h2o.trans.map(t => t.T), [0, 100]);
  HC.MYSTERY_IDS.forEach(id => assert.ok(S[id] && S[id].phases[0].c > 100 && S[id].phases[0].rho > 1000));
});

test('焓與溫度互為反函數；顯熱段 dH = mc dT，相變段 ΔH = mL', () => {
  const w = water(0.3, 50);
  for (const t of [-30, -5, -0.001, 0.001, 20, 99.9, 100.5, 140]) close(T(w, H(w, t)), t, 1e-12, 'T(H(T))');
  close(H(w, -10) - H(w, -30), (0.3 * ci + 50) * 20, 1e-12, '冰升溫');
  close(H(w, 0, 1) - H(w, 0, 0), 0.3 * Lf, 1e-12, '熔化');
  close(H(w, 80) - H(w, 20), (0.3 * cw + 50) * 60, 1e-12, '水升溫');
  close(H(w, 100, 2) - H(w, 100, 1), 0.3 * Lv, 1e-12, '汽化');
  close(H(w, 0, 0.25) - H(w, 0, 0), 0.25 * 0.3 * Lf, 1e-12, '部分熔化');
  const st = HC.stateOf(w, H(w, 0, 0.4));
  assert.strictEqual(st.T, 0); close(st.frac[0], 0.6, 1e-12); close(st.frac[1], 0.4, 1e-12);
  const fe = body('fe', 2);
  close(H(fe, 75) - H(fe, 25), 2 * 450 * 50, 1e-12, '鐵 Q = mcΔT');
});

test('金屬放進水中：T_f = Σmc T / Σmc，且 Σ m c (T_f − T_i) = 0', () => {
  const cases = [['al', 0.2, 100, 0.2, 20], ['fe', 0.31, 100, 0.1, 20], ['cu', 1, 200, 0.05, 90], ['pb', 0.5, 80, 0.3, 10], ['glass', 0.12, -15, 0.4, 60]];
  for (const [id, m1, T1, m2, T2] of cases) {
    const a = body(id, m1), w = water(m2);
    const r = eq2(a, H(a, T1), w, H(w, T2, 1));
    const c1 = S[id].phases[0].c;
    const Tf = HC.mixFormula([{ m: m1, c: c1, T: T1 }, { m: m2, c: cw, T: T2 }]);
    if (Tf > 0 && Tf < 100) {
      close(r.T, Tf, 1e-12, id + ' T_f');
      close(m1 * c1 * (r.T - T1) + m2 * cw * (r.T - T2), 0, 1e-9, id + ' 能量平衡');
    }
    close(r.H[0] + r.H[1], H(a, T1) + H(w, T2, 1), 1e-12, '總焓守恆');
  }
  // 例：0.2 kg 鋁 100 °C + 0.2 kg 水 20 °C → 34.16 °C
  const a = body('al', 0.2), w = water(0.2);
  close(eq2(a, H(a, 100), w, H(w, 20)).T, (0.2 * 900 * 100 + 0.2 * cw * 20) / (0.2 * 900 + 0.2 * cw), 1e-12);
});

test('熱容量相等 → 最後溫度是兩個初溫的平均；量熱杯（水當量）算進水的熱容量', () => {
  const m1 = (0.05 * cw) / 385; // 銅的熱容量 = 0.05 kg 水的熱容量
  const a = body('cu', m1), w = water(0.05);
  close(eq2(a, H(a, 100), w, H(w, 20)).T, 60, 1e-12, '平均');
  // 杯子熱容量 C 等同於質量 C/c_w 的水
  const C = 120, wc = water(0.2, C), wEq = water(0.2 + C / cw);
  const b = body('fe', 0.4);
  close(eq2(b, H(b, 150), wc, H(wc, 18)).T, eq2(b, H(b, 150), wEq, H(wEq, 18)).T, 1e-12, '水當量');
  close(eq2(b, H(b, 150), wc, H(wc, 18)).T, (0.4 * 450 * 150 + (0.2 * cw + C) * 18) / (0.4 * 450 + 0.2 * cw + C), 1e-12);
});

test('極限：樣品質量 → 0 時 T_f → 水溫；水量 → 0 時 T_f → 樣品溫度', () => {
  for (const m of [1e-3, 1e-6, 1e-9]) {
    const a = body('fe', m), w = water(0.3);
    const d = eq2(a, H(a, 180), w, H(w, 30)).T - 30;
    close(d, m * 450 * 150 / (m * 450 + 0.3 * cw), 1e-9, '偏離量 ∝ m');
    const b = body('al', 0.5), w2 = water(m);
    const e = 70 - eq2(b, H(b, 70), w2, H(w2, 10)).T;
    close(e, m * cw * 60 / (0.5 * 900 + m * cw), 1e-9, '偏離量 ∝ m');
  }
  const a = body('fe', 1e-12), w = water(0.3);
  assert.ok(Math.abs(eq2(a, H(a, 180), w, H(w, 30)).T - 30) < 1e-9);
});

test('冰放進水中：完全融化後升溫（解析公式）', () => {
  const mi = 0.05, Ti = -20, mw = 0.3, Tw = 60, C = 80;
  const ice = water(mi), w = water(mw, C);
  const r = eq2(ice, H(ice, Ti, 0), w, H(w, Tw, 1));
  const Tf = ((mw * cw + C) * Tw - mi * (ci * -Ti + Lf)) / ((mw + mi) * cw + C);
  assert.ok(Tf > 0);
  close(r.T, Tf, 1e-12, 'T_f');
  const pm = HC.phaseMasses(ice, r.H[0]);
  close(pm[0], 0, 1e-12, '沒有剩下的冰');
  // 能量平衡：冰吸收 = 水放出
  close(mi * (ci * (0 - Ti) + Lf + cw * Tf), (mw * cw + C) * (Tw - Tf), 1e-9, '吸熱 = 放熱');
});

test('冰放進水中：部分融化，T_f = 0 °C，剩冰量符合解析', () => {
  const mi = 0.2, Ti = -10, mw = 0.2, Tw = 30;
  const ice = water(mi), w = water(mw);
  const r = eq2(ice, H(ice, Ti, 0), w, H(w, Tw, 1));
  assert.strictEqual(r.T, 0);
  const melted = (mw * cw * Tw - mi * ci * (0 - Ti)) / Lf;
  assert.ok(melted > 0 && melted < mi);
  const ices = HC.phaseMasses(ice, r.H[0])[0] + HC.phaseMasses(w, r.H[1])[0];
  close(ices, mi - melted, 1e-12, '剩下的冰');
});

test('冰剛好全部融化：T_f = 0 °C 且沒有冰', () => {
  const mi = 0.1, mw = Lf * mi / (cw * 40); // 0 °C 的冰，40 °C 的水
  const ice = water(mi), w = water(mw);
  const r = eq2(ice, H(ice, 0, 0), w, H(w, 40, 1));
  close(r.T, 0, 1e-9);
  const ices = HC.phaseMasses(ice, r.H[0])[0] + HC.phaseMasses(w, r.H[1])[0];
  close(ices, 0, 1e-9, '冰');
});

test('很冷的冰放進 0 °C 附近的水：冰完全不融，杯中的水反而部分結冰', () => {
  const mi = 0.5, Ti = -30, mw = 0.1, Tw = 1;
  const ice = water(mi), w = water(mw);
  const r = eq2(ice, H(ice, Ti, 0), w, H(w, Tw, 1));
  assert.strictEqual(r.T, 0);
  const frozen = (mi * ci * 30 - mw * cw * Tw) / Lf;
  const ices = HC.phaseMasses(ice, r.H[0])[0] + HC.phaseMasses(w, r.H[1])[0];
  close(ices, mi + frozen, 1e-12, '冰變多');
  // 極冷、極多的冰：全部結冰並降到 0 °C 以下
  const big = water(1), w2 = water(0.05);
  const r2 = eq2(big, H(big, -30, 0), w2, H(w2, 0, 1));
  const Tf = (1 * ci * -30 + 0.05 * Lf) / ((1 + 0.05) * ci); // 水結冰放出 mL_f
  assert.ok(Tf < 0);
  close(r2.T, Tf, 1e-12, '全部結冰後的溫度');
});

test('很熱的金屬放進少量的水：水沸騰，T_f = 100 °C，汽化量符合解析', () => {
  const a = body('al', 1), w = water(0.05);
  const r = eq2(a, H(a, 200), w, H(w, 90, 1));
  assert.strictEqual(r.T, 100);
  const vap = (1 * 900 * 100 - 0.05 * cw * 10) / Lv;
  close(HC.phaseMasses(w, r.H[1])[2], vap, 1e-12, '汽化的水');
});

test('加熱曲線：每一段的時間 = Q / P（冰升溫、熔化、水升溫、沸騰）', () => {
  const m = 0.2, P = 500;
  const w = water(m);
  const sch = HC.heatingSchedule(w, H(w, -20, 0), P, H(w, 100, 2));
  const d = sch.segs.map(s => s.t1 - s.t0);
  assert.deepStrictEqual(sch.segs.map(s => s.kind), ['sens', 'lat', 'sens', 'lat']);
  close(d[0], m * ci * 20 / P, 1e-12, '冰升溫');
  close(d[1], m * Lf / P, 1e-12, '熔化');
  close(d[2], m * cw * 100 / P, 1e-12, '水升溫');
  close(d[3], m * Lv / P, 1e-12, '沸騰');
  close(sch.total, m * (ci * 20 + Lf + cw * 100 + Lv) / P, 1e-12, '總時間');
  assert.deepStrictEqual([sch.segs[1].T0, sch.segs[1].T1, sch.segs[3].T0, sch.segs[3].T1], [0, 0, 100, 100]);
});

test('加熱器逐步模擬（絕熱）：斜率 = P/(mc)，相變點的時間與解析一致', () => {
  const m = 0.4, P = 800, w = water(m);
  let h = H(w, -10, 0), t = 0;
  const marks = [];
  for (let i = 0; i < 4000; i++) {
    const r = HC.heatStep(w, h, P, 0, 25, 0.37);
    r.pts.forEach(p => marks.push(t + p.dt));
    close(r.Qloss, 0, 1e-9, '絕熱沒有散失');
    h = r.H; t += 0.37;
    if (T(w, h) >= 50) break;
  }
  close(marks[0], m * ci * 10 / P, 1e-9, '開始熔化');
  close(marks[1], m * (ci * 10 + Lf) / P, 1e-9, '熔化結束');
  // 斜率
  const a = HC.heatStep(w, H(w, 20, 1), P, 0, 25, 10);
  close((T(w, a.H) - 20) / 10, P / (m * cw), 1e-12, '水的斜率');
  const fe = body('fe', 1.5), b = HC.heatStep(fe, H(fe, 20), P, 0, 25, 30);
  close((T(fe, b.H) - 20) / 30, P / (1.5 * 450), 1e-12, '鐵的斜率');
});

test('加熱器＋散熱：趨近穩定溫度 T_ss = T_env + P/k_e，與解析指數解一致，能量簿記守恆', () => {
  const m = 0.3, P = 90, ke = 3, w = water(m);
  const C = m * cw, Tss = 25 + P / ke; // 55 °C < 100 °C
  const r = HC.heatStep(w, H(w, 20, 1), P, ke, 25, 600);
  close(T(w, r.H), Tss + (20 - Tss) * Math.exp(-600 * ke / C), 1e-12, '指數解');
  close(r.Qin, P * 600, 1e-12);
  close(r.Qin - r.Qloss, r.H - H(w, 20, 1), 1e-9, 'Q_in = ΔH + Q_loss');
  const end = HC.heaterEnd(w, H(w, 20, 1), P, ke, 25, H(w, 100, 2), 0.05);
  assert.strictEqual(end.reason, 'steady');
  close(end.t, C / ke * Math.log((Tss - 20) / 0.05), 1e-6, '到達穩定的時間');
  // 功率夠大時會沸騰，沸騰時溫度固定在 100 °C
  const end2 = HC.heaterEnd(w, H(w, 20, 1), 2000, ke, 25, H(w, 100, 2), 0.05);
  assert.strictEqual(end2.reason, 'stop');
  const tBoil = C / ke * Math.log((25 + 2000 / ke - 20) / (25 + 2000 / ke - 100));
  close(end2.t, tBoil + m * Lv / (2000 - ke * 75), 1e-6, '沸騰完的時間');
});

test('兩物體接觸（無散熱）：能量精確守恆，溫差以 τ = C_A C_B / (k (C_A + C_B)) 指數衰減', () => {
  const a = body('cu', 0.4), w = water(0.25, 40), k = 6;
  const CA = 0.4 * 385, CB = 0.25 * cw + 40, tau = CA * CB / (k * (CA + CB));
  let ha = H(a, 150), hb = H(w, 15, 1);
  const E0 = ha + hb, d0 = 135;
  let t = 0;
  for (let i = 0; i < 200; i++) {
    const r = HC.pairStep(a, w, ha, hb, k, 0.731);
    ha = r.HA; hb = r.HB; t += 0.731;
    close(ha + hb, E0, 1e-13, '總焓');
    close(T(a, ha) - T(w, hb), d0 * Math.exp(-t / tau), 1e-9, 'ΔT(t)');
  }
  // 步長無關：一大步 = 很多小步
  const big = HC.pairStep(a, w, H(a, 150), H(w, 15, 1), k, 146.2);
  close(big.HA, ha, 1e-10, '一步與多步相同');
  // 最後到達解析的平衡溫度
  const far = HC.pairStep(a, w, H(a, 150), H(w, 15, 1), k, 60 * tau);
  const Tf = (CA * 150 + CB * 15) / (CA + CB);
  close(T(a, far.HA), Tf, 1e-10); close(T(w, far.HB), Tf, 1e-10);
  // 熱流方向：熱的放熱、冷的吸熱
  assert.ok(far.Q > 0);
});

test('接觸傳熱經過相變：冰水混合的能量守恆，最後等於解析平衡（四種情況）', () => {
  const cases = [
    { mi: 0.05, Ti: -20, mw: 0.3, Tw: 60, C: 50 },  // 全部融化後升溫
    { mi: 0.2, Ti: -10, mw: 0.2, Tw: 30, C: 0 },    // 部分融化
    { mi: 0.5, Ti: -30, mw: 0.1, Tw: 1, C: 0 },     // 水部分結冰
    { mi: 0.3, Ti: -25, mw: 0.05, Tw: 0, C: 0 }     // 冰升溫但未到 0 °C
  ];
  for (const c of cases) {
    const ice = water(c.mi), w = water(c.mw, c.C);
    const k = HC.contactK('h2o', c.mi, true);
    const h0a = H(ice, c.Ti, 0), h0b = H(w, c.Tw, 1);
    const sim = HC.createMix({ A: { s: 'h2o', m: c.mi, T: c.Ti, phase: 0 }, B: { m: c.mw, T: c.Tw, phase: 1, Ccup: c.C }, k: k });
    for (let i = 0; i < 3000; i++) {
      HC.mixStep(sim, 2.5);
      close(sim.HA + sim.HB, h0a + h0b, 1e-12, '總焓');
    }
    const e = eq2(ice, h0a, w, h0b);
    close(T(ice, sim.HA), e.T, 1e-6, 'T_A → T_f'); close(T(w, sim.HB), e.T, 1e-6, 'T_B → T_f');
    const iceNow = HC.phaseMasses(ice, sim.HA)[0] + HC.phaseMasses(w, sim.HB)[0];
    const iceEq = HC.phaseMasses(ice, e.H[0])[0] + HC.phaseMasses(w, e.H[1])[0];
    close(iceNow, iceEq, 1e-6, '冰的總量');
  }
});

test('接觸傳熱讓水沸騰：停在 100 °C，汽化量等於解析', () => {
  const sim = HC.createMix({ A: { s: 'al', m: 1, T: 200 }, B: { m: 0.05, T: 90, phase: 1 }, k: HC.contactK('al', 1, true) });
  const E0 = sim.HA + sim.HB;
  for (let i = 0; i < 400; i++) HC.mixStep(sim, 5);
  close(sim.HA + sim.HB, E0, 1e-12);
  close(HC.temperature(sim.A, sim.HA), 100, 1e-6);
  close(HC.phaseMasses(sim.B, sim.HB)[2], (900 * 100 - 0.05 * cw * 10) / Lv, 1e-6);
});

test('散熱選項：H_A + H_B + Q_loss 守恆；與兩物體＋環境的線性解析解一致；最後趨近室溫', () => {
  const k = 5, ke = HC.KE_CUP, Tenv = 25;
  const sim = HC.createMix({ A: { s: 'fe', m: 0.5, T: 120 }, B: { m: 0.2, T: 30, phase: 1, Ccup: 30 }, k: k, ke: ke, Tenv: Tenv });
  const E0 = sim.HA + sim.HB;
  const CA = 0.5 * 450, CB = 0.2 * cw + 30;
  // 解析：y = (T_A − Tenv, T_B − Tenv)，dy/dt = M y，M = [[−k/CA, k/CA], [k/CB, −(k+ke)/CB]]
  const a = -k / CA, b = k / CA, c = k / CB, d = -(k + ke) / CB;
  const tr = a + d, det = a * d - b * c, disc = Math.sqrt(tr * tr / 4 - det);
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  const y0 = [120 - Tenv, 30 - Tenv];
  const exact = (t) => {
    // y(t) = e^{Mt} y0（以特徵值展開：e^{Mt} = (e^{l1 t}(M − l2 I) − e^{l2 t}(M − l1 I)) / (l1 − l2)）
    const e1 = Math.exp(l1 * t), e2 = Math.exp(l2 * t);
    const m11 = (e1 * (a - l2) - e2 * (a - l1)) / (l1 - l2), m12 = (e1 - e2) * b / (l1 - l2);
    const m21 = (e1 - e2) * c / (l1 - l2), m22 = (e1 * (d - l2) - e2 * (d - l1)) / (l1 - l2);
    return [Tenv + m11 * y0[0] + m12 * y0[1], Tenv + m21 * y0[0] + m22 * y0[1]];
  };
  let maxErr = 0;
  for (let i = 1; i <= 600; i++) {
    HC.mixStep(sim, 1 / 3);
    close(sim.HA + sim.HB + sim.Qloss, E0, 1e-12, '能量簿記');
    if (i % 30 === 0) {
      const ex = exact(sim.t), st = HC.mixState(sim);
      maxErr = Math.max(maxErr, Math.abs(st.TA - ex[0]), Math.abs(st.TB - ex[1]));
    }
  }
  assert.ok(maxErr < 2e-3, '與解析解的誤差 ' + maxErr + ' °C');
  // 有散熱時，混合後的溫度低於無散熱的 T_f（熱水溫度高於室溫）
  const Tf = (CA * 120 + CB * 30) / (CA + CB);
  assert.ok(HC.mixState(sim).TB < Tf);
  assert.ok(sim.Qloss > 0);
  // 很久以後兩者都回到室溫，散失的熱量 = 初始焓 − 室溫時的焓
  HC.mixStep(sim, 40000);
  const st = HC.mixState(sim);
  close(st.TA, Tenv, 1e-6); close(st.TB, Tenv, 1e-6);
  close(sim.Qloss, E0 - H(sim.A, Tenv) - H(sim.B, Tenv), 1e-9);
});

test('達到熱平衡的時間：ΔT 降到 tol 的時間 = τ ln(ΔT0/tol)', () => {
  const a = body('al', 0.2), w = water(0.2), k = 10;
  const CA = 180, CB = 0.2 * cw, tau = CA * CB / (k * (CA + CB));
  const t = HC.timeToEquilibrium(a, w, H(a, 100), H(w, 20, 1), k, 0.05);
  close(t, tau * Math.log(80 / 0.05), 1e-9);
  assert.strictEqual(HC.timeToEquilibrium(a, w, H(a, 20), H(w, 20, 1), k, 0.05), 0, '同溫：沒有熱流');
});

test('熱量分段：冰從 −20 °C 到 30 °C 的水 = mc冰ΔT + mL + mc水ΔT，總和 = ΔH', () => {
  const m = 0.15, w = water(m);
  const parts = HC.decompose(w, H(w, -20, 0), H(w, 30, 1));
  assert.deepStrictEqual(parts.map(p => p.kind), ['sens', 'lat', 'sens']);
  close(parts[0].Q, m * ci * 20, 1e-12); close(parts[1].Q, m * Lf, 1e-12); close(parts[2].Q, m * cw * 30, 1e-12);
  const back = HC.decompose(w, H(w, 30, 1), H(w, -20, 0));
  close(back.reduce((s, p) => s + p.Q, 0), -(m * (ci * 20 + Lf + cw * 30)), 1e-12, '反方向為負');
  assert.strictEqual(back[0].kind, 'sens'); assert.strictEqual(back[0].p, 1);
});

test('接觸熱導 k = hA：攪拌讓 k 變大，但不改變最後溫度', () => {
  const k1 = HC.contactK('fe', 0.3, false), k2 = HC.contactK('fe', 0.3, true);
  assert.ok(k2 > k1 && k1 > 0);
  close(k2 / k1, HC.H_STIR / HC.H_STILL, 1e-12);
  // 同質量時密度小的樣品體積大、表面積大
  assert.ok(HC.contactK('al', 0.3, true) > HC.contactK('pb', 0.3, true));
  const mk = (k) => { const s = HC.createMix({ A: { s: 'fe', m: 0.3, T: 100 }, B: { m: 0.2, T: 20 }, k: k }); HC.mixStep(s, 5000); return HC.mixState(s).TB; };
  close(mk(k1), mk(k2), 1e-9);
});

console.log(`\n${passed} 項通過`);
