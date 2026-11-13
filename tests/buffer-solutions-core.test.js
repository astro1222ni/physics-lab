/* buffer-solutions-core.js 的單元測試：node tests/buffer-solutions-core.test.js */
'use strict';
const path = require('path');
const B = require(path.join(__dirname, '..', 'js', 'buffer-solutions-core.js'));

let fail = 0, n = 0;
function ok(cond, name, info) {
  n++;
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.log('  ✗ ' + name + (info != null ? '：' + info : '')); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const f4 = x => (+x).toFixed(4);

console.log('緩衝溶液核心測試');

// 1. 純水與強酸、強鹼
ok(near(B.pH(B.strong(0, 100)), 7, 1e-9), '純水 pH = 7.000');
ok(near(B.pH(B.strong(0.1, 100)), 1, 1e-6), '0.10 M HCl：pH = 1.000');
ok(near(B.pH(B.strong(-0.01, 100)), 12, 1e-6), '0.010 M NaOH：pH = 12.000');
{ // 極稀的強酸：要計入水的解離，[H+] = (c + √(c² + 4Kw))/2
  const c = 1e-8, h = (c + Math.sqrt(c * c + 4e-14)) / 2;
  ok(near(B.pH(B.strong(c, 100)), -Math.log10(h), 1e-9), '1.0e-8 M HCl 的精確解（pH 6.98，不是 8）', f4(B.pH(B.strong(c, 100))));
}

// 2. 單獨的弱酸：與二次方程式的精確解比對
{
  const Ka = 1.8e-5, C = 0.1, h = (-Ka + Math.sqrt(Ka * Ka + 4 * Ka * C)) / 2;
  ok(near(B.pH(B.make('ac', C, 0, 100)), -Math.log10(h), 1e-4), '0.10 M 醋酸 pH = 2.88（二次方程式）', f4(B.pH(B.make('ac', C, 0, 100))));
}

// 3. 緩衝溶液與亨德森公式
{
  const p = B.pH(B.make('ac', 0.1, 0.1, 100));
  ok(near(p, B.pKa('ac'), 0.002), '0.10 M 醋酸＋0.10 M 醋酸鈉：pH ≈ pKa = 4.74', f4(p));
  const s = B.add(B.make('ac', 0.1, 0.1, 100), 1, 0, 1);
  ok(near(B.pH(s), B.pKa('ac') + Math.log10(9 / 11), 0.002), '再加 1.0 mmol HCl：pH ≈ pKa + log(9/11)', f4(B.pH(s)));
  const hh = B.hhPH('ac', 5, 20);
  ok(near(B.pH(B.make('ac', 0.05, 0.2, 100)), hh, 0.002), '比例 4 : 1：與亨德森公式相差 < 0.002');
  ok(near(B.pH(B.make('nh', 0.1, 0.1, 100)), 14 + Math.log10(1.8e-5), 0.002), '氯化銨＋氨各 0.10 M：pH ≈ 14 − pKb = 9.26');
  ok(near(B.pH(B.make('ph', 0.1, 0.1, 100)), B.pKa('ph'), 0.01), '磷酸二氫鈉＋磷酸氫二鈉各 0.10 M：pH ≈ pKa2 = 7.21');
  ok(B.hhPH('ac', 0, 1) === null && B.hhPH('ac', 1, 0) === null, '只有一種成分時亨德森公式不適用（傳回 null）');
}

// 4. 兩性物質：NaH2PO4 的 pH ≈ √(Ka1·Ka2·C/(Ka1 + C))，且幾乎不隨稀釋改變
{
  const K1 = 7.5e-3, K2 = 6.2e-8, C = 0.1, h = Math.sqrt(K1 * K2 * C / (K1 + C));
  const p = B.pH(B.make('ph', C, 0, 100));
  ok(near(p, -Math.log10(h), 0.01), '0.10 M NaH2PO4：pH ≈ 4.68（兩性物質近似式）', f4(p));
  const p4 = B.pH(B.add(B.make('ph', C, 0, 100), 0, 0, 300));
  ok(Math.abs(p4 - p) < 0.05, '0.10 M NaH2PO4 稀釋 4 倍：pH 只改變 < 0.05', f4(p4 - p));
}

// 5. 稀釋：緩衝溶液幾乎不變；弱酸改變約 ½ log f；強酸改變 log f
{
  const b = B.make('ac', 0.1, 0.1, 100), p0 = B.pH(b);
  ok(Math.abs(B.pH(B.add(b, 0, 0, 100)) - p0) < 0.002, '0.10 M 緩衝溶液稀釋 2 倍：pH 改變 < 0.002');
  const a = B.make('ac', 0.1, 0, 50), d = B.pH(B.add(a, 0, 0, 150)) - B.pH(a);
  ok(near(d, 0.5 * Math.log10(4), 0.01), '0.10 M 醋酸稀釋 4 倍：pH 升高約 ½ log 4 = 0.30', f4(d));
  const s = B.strong(0.01, 50), d2 = B.pH(B.add(s, 0, 0, 450)) - B.pH(s);
  ok(near(d2, 1, 1e-4), '0.010 M HCl 稀釋 10 倍：pH 升高 1.00');
  const v = B.make('ac', 1e-4, 1e-4, 50), d3 = B.pH(B.add(v, 0, 0, 75)) - B.pH(v);
  ok(d3 > 0.1, '1.0e-4 M 的稀緩衝溶液稀釋 2.5 倍：pH 改變超過 0.1（亨德森公式失效）', f4(d3));
}

// 6. 電荷平衡與質量平衡
{
  const sols = [B.make('ac', 0.03, 0.2, 80), B.make('ph', 0.2, 0.05, 120), B.make('nh', 0.07, 0.3, 50), B.add(B.make('ph', 0.1, 0.1, 100), 0, 25, 12.5)];
  let worst = 0, sumBad = 0;
  sols.forEach(function (s) {
    const st = B.state(s), S = B.SYSTEMS[s.sys], V = s.V, cT = s.nT / V;
    let pos = st.h + s.Na / V, neg = st.oh + s.Cl / V, sa = 0;
    st.alpha.forEach(function (a, i) { const q = (S.z0 - i) * a * cT; if (q > 0) pos += q; else neg -= q; sa += a; });
    worst = Math.max(worst, Math.abs(pos - neg) / Math.max(pos, neg));
    sumBad = Math.max(sumBad, Math.abs(sa - 1));
  });
  ok(worst < 1e-9, '電荷平衡：正負電荷相差 < 1e-9（相對）', worst.toExponential(2));
  ok(sumBad < 1e-12, '質量平衡：各形式的比例加起來 = 1');
}

// 7. 緩衝容量：公式與數值微分一致；最大值在 pH = pKa，約 2.303·C/4
{
  const s = B.make('ac', 0.08, 0.12, 100), st = B.state(s), dn = 1e-4;
  const p1 = B.pH(B.add(s, 0, dn, 0)), p0 = B.pH(B.add(s, dn, 0, 0));
  const num = (2 * dn / s.V) / (p1 - p0);
  ok(Math.abs(st.beta / num - 1) < 1e-4, 'β 的公式與數值微分一致（醋酸）', st.beta.toFixed(5) + ' / ' + num.toFixed(5));
  const sp = B.make('ph', 0.05, 0.3, 100), stp = B.state(sp);
  const q1 = B.pH(B.add(sp, 0, dn, 0)), q0 = B.pH(B.add(sp, dn, 0, 0));
  const nump = (2 * dn / sp.V) / (q1 - q0);
  ok(Math.abs(stp.beta / nump - 1) < 1e-4, 'β 的公式與數值微分一致（多質子的磷酸）', stp.beta.toFixed(5) + ' / ' + nump.toFixed(5));
  const C = 0.2, bmax = B.beta(B.make('ac', C / 2, C / 2, 100));
  ok(near(bmax, Math.LN10 * C / 4, 0.002), '比例 1 : 1 時 β ≈ 2.303 C/4', bmax.toFixed(4));
  ok(B.beta(B.make('ac', C * 0.3, C * 0.7, 100)) < bmax && B.beta(B.make('ac', C * 0.7, C * 0.3, 100)) < bmax, '總濃度相同時，比例偏離 1 : 1 緩衝容量就變小');
  const b10 = B.beta(B.make('ac', 0.01, 0.01, 100));
  ok(near(bmax / b10, 10, 0.05), '濃度 ÷ 10：pH 相同，緩衝容量也 ÷ 10', (bmax / b10).toFixed(3));
}

// 8. toShift：加入它算出的量，pH 剛好改變指定的值
{
  const s = B.make('ac', 0.1, 0.1, 100);
  const x = B.toShift(s, -1, 1);
  ok(near(B.pH(B.add(s, x, 0, x)) - B.pH(s), -1, 1e-6), 'toShift：加 ' + x.toFixed(3) + ' mmol HCl（1 M）pH 剛好降 1');
  const hh = (10 - 10 * Math.pow(10, -1)) / (1 + Math.pow(10, -1));  // 亨德森估計：(10 − x)/(10 + x) = 0.1
  ok(Math.abs(x - hh) < 0.02, '與亨德森公式的估計 8.18 mmol 相近', x.toFixed(4));
  ok(B.toShift(B.strong(0, 100), -20, 1, 10) === null, '做不到時傳回 null（pH 不可能降 20）');
}

// 9. 中和完：加入和弱酸等量的強鹼 = 共軛鹼的鹽溶液
{
  const s = B.add(B.make('ac', 0.1, 0.1, 100), 0, 10, 0);
  const salt = B.make('ac', 0, 0.2, 100);
  ok(near(B.pH(s), B.pH(salt), 1e-9), '緩衝溶液＋等量 NaOH = 純醋酸鈉溶液（pH 相同）', f4(B.pH(s)));
  ok(B.pH(salt) > 8.5 && B.pH(salt) < 9.3, '0.20 M 醋酸鈉溶液偏鹼（pH 約 9.0）', f4(B.pH(salt)));
}

// 10. 磷酸的其他兩段緩衝區
{
  const s = B.make('ph', 0.1, 0.1, 100);
  const xb = B.toShift(s, B.pKas('ph')[2] - B.pH(s), 2);
  const xa = B.toShift(s, B.pKas('ph')[0] - B.pH(s), 2);
  ok(xb > 15 && xb < 30, '加 NaOH 到 pH = pKa3（' + xb.toFixed(2) + ' mmol，約 10 + 10 + 2 + 過量 OH-）');
  ok(xa > 15 && xa < 30, '加 HCl 到 pH = pKa1（' + xa.toFixed(2) + ' mmol）');
}

// 11. 一次實驗：兩杯加入同樣的東西、對照的設定
{
  const r = B.createRun({ sys: 'ac', CHA: 0.1, CA: 0.1, V0: 100, comp: 'same' });
  ok(near(r.pHc0, r.pH0, 1e-9), '對照「同 pH」：起始 pH 與緩衝溶液相同');
  const w = B.createRun({ sys: 'ac', CHA: 0.1, CA: 0.1, V0: 100, comp: 'water' });
  const res = B.addTo(w, 'acid', 0.05, 1), d = B.addData(w, res, 1);
  ok(near(d.pHc, 3.30, 0.01), '純水加一滴 1.0 M HCl：pH 3.30', f4(d.pHc));
  ok(Math.abs(d.dpH) < 0.005, '緩衝溶液只改變 0.004', f4(d.dpH));
  ok(near(w.buf.V, 100.05, 1e-12) && near(w.cmp.V, 100.05, 1e-12), '兩杯體積都增加 0.05 mL');
  const full = B.addTo(w, 'water', 200, 1);
  ok(full.ok === false && full.reason === 'full', '超過 250 mL 不能再加');
  const d10 = B.createRun({ sys: 'nh', CHA: 0.2, CA: 0.05, V0: 80, comp: 'dil10' });
  ok(near(d10.pHc0, d10.pH0, 0.01), '對照「稀釋 10 倍」：起始 pH 幾乎相同', f4(d10.pHc0 - d10.pH0));
  const m = B.mixData(r);
  ok(near(m.nT0, 20, 1e-12) && near(m.pKa, 4.7447, 1e-3), 'mixData：總莫耳數 20 mmol、pKa 4.74');
  const r2 = B.createRun({ sys: 'ac', CHA: 0.1, CA: 0.1, V0: 100, comp: 'water' });
  B.addTo(r2, 'acid', 2, 1); B.addTo(r2, 'base', 3, 1);
  ok(near(r2.maxAcid, 2, 1e-12) && near(r2.maxBase, 1, 1e-12), '最多淨加入的酸 2 mmol、鹼 1 mmol（先酸後鹼）');
}

// 12. 萬用指示劑顏色
{
  const c1 = B.uiColor(1), c7 = B.uiColor(7), c12 = B.uiColor(12);
  ok(c1[0] > c1[2] && c7[1] > c7[0] && c12[2] > c12[1], '萬用指示劑：pH 1 紅、7 綠、12 紫');
}

console.log(fail ? '\n' + fail + ' / ' + n + ' 項失敗' : '\n全部 ' + n + ' 項通過');
process.exit(fail ? 1 : 0);
