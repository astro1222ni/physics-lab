/* 金屬活性序：化學核心的單元測試。用法：node tests/metal-activity-core.test.js */
'use strict';
const M = require('../js/metal-activity-core.js');
let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra != null ? '：' + extra : '')); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const rel = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b));
const tube = (o, env) => M.createTube(Object.assign({ c: 0.1, T: 25, salt: false }, o), env);
const END = 1e7;   // 很久以後（到平衡）

console.log('— 常數 —');
ok(near(M.KN, 0.05916, 2e-5), 'RT ln10 / F = 0.05916 V', M.KN);
ok(near(M.VM, 24.465, 0.002), '25 °C、1 atm 的莫耳體積 24.465 mL/mmol', M.VM);
ok(near(M.arr(50, 298.15), 1, 1e-12), '25 °C 時阿瑞尼士因子 = 1');
ok(M.KNOWN.every((s, i, a) => i === 0 || M.METALS[a[i - 1]].E < M.METALS[s].E), '已知金屬依 E° 由小到大排列（K Ca Na Mg Al Zn Fe Sn Pb Cu Ag）');

console.log('— 置換反應的熱力學 —');
{
  const t = tube({ metal: 'Zn', liquid: 'Cu' });
  ok(near(t.dE, 0.337 + 0.7618, 1e-9), 'Zn + Cu²⁺：ΔE° = 1.0988 V');
  ok(near(t.logK, 2 * 1.0988 / M.KN, 1e-9) && near(t.logK, 37.15, 0.01), 'log K = 2ΔE°/0.05916 = 37.15', t.logK);
  ok(rel(t.eEq, 2.0, 1e-9), '0.10 M × 10 mL 的 Cu²⁺ 完全反應：轉移 2.00 mmol 電子', t.eEq);
  const s = M.at(t, END);
  ok(rel(s.dep, 1.0, 1e-9) && rel(s.nDiss, 1.0, 1e-9), '析出 1.00 mmol Cu、溶解 1.00 mmol Zn（1 : 1）');
  ok(near(s.dm, 1.0 * (63.546 - 65.38), 1e-6), '金屬片質量變化 = 63.546 − 65.38 = −1.83 mg', s.dm);
}
{
  const t = tube({ metal: 'Cu', liquid: 'Ag' }), s = M.at(t, END);
  ok(t.ne === 2 && near(t.logK, 2 * (0.7996 - 0.337) / M.KN, 1e-9), 'Cu + 2Ag⁺：nₑ = 2，log K = 15.64', t.logK);
  ok(rel(s.dep, 1.0, 1e-6) && rel(s.dep, 2 * s.nDiss, 1e-12), '析出 1.00 mmol Ag、溶解 0.50 mmol Cu（2 : 1；K = 10^15.6，剩下的 Ag⁺ 約 3 × 10^−9 M）');
  ok(near(s.dm, 1.0 * 107.8682 - 0.5 * 63.546, 1e-4), '金屬片變重 107.87 − 31.77 = 76.09 mg', s.dm);
}
{
  const t = tube({ metal: 'Mg', liquid: 'Al' }), s = M.at(t, END);
  ok(t.ne === 6 && rel(s.dep, 1.0, 1e-9) && rel(s.nDiss, 1.5, 1e-9), '3Mg + 2Al³⁺：nₑ = 6，1.00 mmol Al³⁺ 消耗 1.50 mmol Mg');
}
{
  const t = tube({ metal: 'Cu', liquid: 'Zn' });
  ok(t.eEq < 1e-30 && !M.observe(t).reacted, 'Cu + Zn²⁺：K ≈ 10^−37，沒有反應', t.eEq);
}
{
  // 錫與鉛：E° 只差 0.0113 V，K = 10^(2 × 0.0113 / 0.05916) ≈ 2.41，兩個方向都停在半路
  const K = Math.pow(10, 2 * (-0.1262 + 0.1375) / M.KN);
  const a = tube({ metal: 'Sn', liquid: 'Pb' }), b = tube({ metal: 'Pb', liquid: 'Sn' });
  const sa = M.at(a, END), sb = M.at(b, END);
  ok(near(K, 2.41, 0.01), 'Sn + Pb²⁺ ⇌ Sn²⁺ + Pb 的 K = 2.41', K);
  ok(rel(sa.ions.Sn / sa.ions.Pb, K, 1e-6), '錫片放進 Pb²⁺：平衡時 [Sn²⁺]/[Pb²⁺] = K', sa.ions.Sn / sa.ions.Pb);
  ok(rel(sb.ions.Sn / sb.ions.Pb, K, 1e-6), '鉛片放進 Sn²⁺（反方向）：平衡時 [Sn²⁺]/[Pb²⁺] 也 = K', sb.ions.Sn / sb.ions.Pb);
  ok(near(sa.ions.Pb, 0.1 / (1 + K), 1e-9) && M.observe(b).reacted, '兩邊都看得到反應（從 Pb²⁺ 那邊轉換 71%、從 Sn²⁺ 那邊 29%）');
}
{
  // 金屬不足：0.40 M Cu²⁺ 4.0 mmol，鋅片只有 2.0 mmol
  const t = tube({ metal: 'Zn', liquid: 'Cu', c: 0.4 }), s = M.at(t, END);
  ok(rel(t.eEq, 4.0, 1e-9) && s.metalLeft < 1e-9 && near(s.ions.Cu, 0.2, 1e-9), '金屬不足：鋅片溶完，Cu²⁺ 剩 0.20 M');
}

console.log('— 守恆 —');
['Zn/Cu/0.1', 'Cu/Ag/0.3', 'Mg/Al/0.07', 'Sn/Pb/0.5', 'Pb/Sn/0.5', 'Fe/Sn/0.2', 'Al/Zn/1'].forEach(k => {
  const p = k.split('/'), t = tube({ metal: p[0], liquid: p[1], c: +p[2], salt: true });
  let worst = 0;
  [0, 30, 200, 800, END].forEach(tt => {
    const s = M.at(t, tt), N = p[1], Mm = p[0];
    const e1 = s.dep * M.METALS[N].z, e2 = s.nDiss * M.METALS[Mm].z;
    const bN = s.ions[N] * M.V + s.dep - t.A, bM = s.metalLeft + s.ions[Mm] * M.V - t.n0;
    worst = Math.max(worst, Math.abs(e1 - e2), Math.abs(bN), Math.abs(bM));
  });
  ok(worst < 1e-9, p[0] + ' 放進 ' + p[1] + ' 離子（' + p[2] + ' M）：電子得失相等、兩種元素的量都守恆', worst);
});
{
  const t = tube({ metal: 'Mg', liquid: 'HCl', c: 0.6 }), s = M.at(t, 300);
  ok(near(s.h2, s.e / 2 * M.VM, 1e-9) && near(s.ions.H * M.V + s.e, 6.0, 1e-9), '鎂與鹽酸：H₂ = e/2 × 24.465 mL，H⁺ 用掉的 = 轉移的電子');
}

console.log('— 酸與水 —');
{
  const t = tube({ metal: 'Mg', liquid: 'HCl', c: 0.1 }), s = M.at(t, END);
  ok(rel(s.h2, 0.5 * M.VM, 1e-6), '鎂與 0.10 M 鹽酸（H⁺ 1.0 mmol）：最多 0.50 mmol H₂ = 12.2 mL', s.h2);
  ok(!M.observe(tube({ metal: 'Cu', liquid: 'HCl', c: 2 })).reacted && !M.observe(tube({ metal: 'Ag', liquid: 'HCl', c: 2 })).reacted, '銅、銀不和鹽酸反應（E° > 0）');
  ok(!M.observe(tube({ metal: 'Pb', liquid: 'HCl', c: 0.1 })).reacted && M.observe(tube({ metal: 'Pb', liquid: 'HCl', c: 1 })).reacted, '鉛和稀鹽酸很慢：0.10 M 看不出來、1.0 M 有少量氣泡');
  const a = tube({ metal: 'Fe', liquid: 'HCl', c: 0.1 }), sa = M.at(a, 600);
  ok(near(sa.pH, -Math.log10((1.0 - sa.e) / 10), 1e-9), 'pH 由剩下的 H⁺ 算', sa.pH);
}
{
  const na = M.at(tube({ metal: 'Na', liquid: 'H2O' }), END);
  ok(near(na.pH, 13.0, 1e-6) && rel(na.h2, 0.5 * M.VM, 1e-6), '1.0 mmol 鈉 + 10 mL 水：[OH⁻] = 0.10 M、pH 13.00、H₂ 12.2 mL', na.pH);
  const ca = M.at(tube({ metal: 'Ca', liquid: 'H2O' }), END);
  const sat = Math.pow(M.KSP.CaOH2 / 4, 1 / 3);
  ok(near(ca.pH, 14 + Math.log10(2 * sat), 1e-6) && ca.ppt.some(p => p.kind === 'CaOH2'), '鈣：Ca(OH)₂ 飽和（溶度積 5.02 × 10^−6）、混濁、pH 12.33', ca.pH);
  const mg = M.at(tube({ metal: 'Mg', liquid: 'H2O', T: 90 }), END);
  ok(near(mg.pH, 14 + Math.log10(2 * Math.pow(M.KSP.MgOH2 / 4, 1 / 3)), 1e-6), '鎂與熱水：Mg(OH)₂ 飽和、pH 10.35（酚酞變紅）', mg.pH);
  ok(!M.observe(tube({ metal: 'Mg', liquid: 'H2O', T: 25 })).reacted && M.observe(tube({ metal: 'Mg', liquid: 'H2O', T: 80 })).reacted, '鎂：冷水看不出反應、80 °C 熱水有反應');
  ok(['Al', 'Zn', 'Fe', 'Sn', 'Pb', 'Cu', 'Ag'].every(m => tube({ metal: m, liquid: 'H2O', T: 95 }).type === 'none'), '鋁以後的金屬放進水裡（到 95 °C）都不反應');
}
{
  // 鈉放進 Cu²⁺：先和水反應，OH⁻ 沉澱出藍色 Cu(OH)₂，不會析出銅
  const t = tube({ metal: 'Na', liquid: 'Cu', c: 0.03 }), s = M.at(t, END), r = M.observe(t);
  ok(s.dep === 0 && near(s.ppt.find(p => p.kind === 'CuOH2').mmol, 0.3, 1e-9) && r.disp === null, '鈉 + Cu²⁺：生成 0.30 mmol Cu(OH)₂、沒有析出銅');
  ok(near(s.pH, 14 + Math.log10((1.0 - 0.6) / 10), 1e-6), '多出來的 OH⁻ 讓溶液變鹼（pH 12.60）', s.pH);
  const t2 = tube({ metal: 'K', liquid: 'HCl', c: 0.05 }), s2 = M.at(t2, END);
  ok(near(s2.pH, 14 + Math.log10(0.5 / 10), 1e-6), '鉀放進鹽酸：OH⁻ 先中和 H⁺，再讓溶液變鹼', s2.pH);
}

console.log('— 鋁的保護膜與速率 —');
{
  const a = M.observe(tube({ metal: 'Al', liquid: 'Cu' })), b = M.observe(tube({ metal: 'Al', liquid: 'Cu', salt: true }));
  ok(!a.reacted && b.reacted, '鋁片 + Cu²⁺：沒有 Cl⁻ 看不出反應；加一小撮食鹽就析出銅');
  ok(M.observe(tube({ metal: 'Al', liquid: 'Sn' })).reacted === false && tube({ metal: 'Al', liquid: 'Sn', salt: true }).tau > 0, '誘導期只在有 Cl⁻ 時出現');
  const t = tube({ metal: 'Al', liquid: 'Cu', salt: true });
  ok(M.rate(t, 0) === 0 && M.rate(t, 60) > 0, '有 Cl⁻ 的鋁一開始速率為 0（保護膜還沒破）');
}
{
  const t = tube({ metal: 'Fe', liquid: 'Cu' });
  ok(near(M.extent(t, 100), t.eEq * (1 - Math.exp(-t.lam * 100)), 1e-12), '一階趨近：e(t) = eEq(1 − e^−λt)');
  ok(rel(M.extent(t, t.tRec), 0.99 * t.eEq, 1e-9), '完成 99% 時記錄', t.tRec);
  const hot = tube({ metal: 'Fe', liquid: 'Cu', T: 60 });
  ok(hot.lam > 4 * t.lam && hot.lam < 6 * t.lam, '35 kJ/mol：60 °C 比 25 °C 快約 4.9 倍', hot.lam / t.lam);
  ok(M.observe(t).atEq && M.observe(tube({ metal: 'Sn', liquid: 'Pb' })).atEq, '錫、鉛在 20 分鐘內到達平衡（誤差 ≤ 2%）');
}
{
  const s = M.at(tube({ metal: 'Cu', liquid: 'Ag', c: 0.1, salt: true }), END);
  ok(near(s.ppt[0].mmol, M.CL_SALT, 1e-6) && s.ppt[0].kind === 'AgCl' && rel(s.dep, 1.0 - M.CL_SALT, 1e-6), '加食鹽的 AgNO₃：先沉澱 0.20 mmol AgCl，剩下的 Ag⁺ 才被銅置換');
}

console.log('— 由實驗結果排活性序 —');
{
  const recs = [];
  const add = (metal, liquid, o) => { const r = M.observe(tube(Object.assign({ metal, liquid }, o || {}))); r.id = recs.length + 1; recs.push(r); return r; };
  add('Mg', 'Al'); add('Zn', 'Fe'); add('Fe', 'Sn'); add('Sn', 'Pb'); add('Pb', 'Cu'); add('Cu', 'Ag');
  const alNo = add('Al', 'Zn');             // 沒加鹽：保護膜讓它「看起來不反應」
  let j = M.judge(['Mg', 'Al', 'Zn', 'Fe', 'Sn', 'Pb', 'Cu', 'Ag'], recs);
  ok(j.ok && !j.supported && j.pairs[1].ev.length === 0, '正確的順序，但「鋁 > 鋅」還沒有證據');
  ok(j.conflicts.length === 1 && j.conflicts[0].ids[0] === alNo.id, '沒加鹽的鋁片給了錯誤的證據（鋅 > 鋁），會列為矛盾');
  add('Al', 'Zn', { salt: true });
  j = M.judge(['Mg', 'Al', 'Zn', 'Fe', 'Sn', 'Pb', 'Cu', 'Ag'], recs);
  ok(j.ok && j.supported, '加鹽重做之後，八種金屬每一對相鄰的都有證據');
  ok(!M.judge(['Mg', 'Zn', 'Al', 'Fe'], recs).ok, '鋅排在鋁前面是錯的');
  ok(M.judge(['Pb', 'Sn'], recs).ok && M.judge(['Pb', 'Sn'], recs).supported, '錫、鉛哪個在前都算對（K ≈ 2.4）');
  ok(M.judge(['K', 'Na', 'Ca'], []).ok && M.judge(['K', 'Ca', 'Na'], []).ok && !M.judge(['Na', 'K', 'Ca'], []).ok, '鈉、鈣都算對；鉀一定在最前面');
}
{
  const recs = [];
  const add = (metal, liquid, o) => { const r = M.observe(tube(Object.assign({ metal, liquid }, o || {}))); r.id = recs.length + 1; recs.push(r); return r; };
  add('K', 'H2O'); add('Na', 'H2O'); add('Ca', 'H2O'); add('Mg', 'H2O');
  const ev = M.evidence(recs);
  const has = (a, b, k) => ev.some(e => e.a === a && e.b === b && e.kind === k);
  ok(has('K', 'Na', 'vigor') && has('Na', 'Ca', 'vigor') && has('Ca', 'Mg', 'water'), '和冷水：鉀比鈉快、鈉比鈣快（劇烈程度），鈣反應而鎂不反應');
  add('Zn', 'HCl'); add('Cu', 'HCl');
  ok(M.evidence(recs).some(e => e.a === 'Zn' && e.b === 'Cu' && e.kind === 'acid'), '鋅和鹽酸反應、銅不反應：鋅 > 氫 > 銅');
  const n = M.observe(tube({ metal: 'Na', liquid: 'Cu' }));
  ok(n.disp === null, '鈉放進 Cu²⁺ 不算置換的證據（它是和水反應）');
}
{
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let good = true;
  for (let k = 0; k < 200; k++) {
    const u = M.newUnknown(rnd), v = [u.X, u.Y, u.Z];
    if (new Set(v).size !== 3 || v.some(x => M.UNK_POOL.indexOf(x) < 0)) good = false;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (Math.abs(v[i] - v[j]) < 0.25) good = false;
  }
  ok(good, '未知金屬：三個不同的 E°，彼此至少差 0.25 V（置換一定完全或完全不反應）');
  const env = { unk: { X: -0.6, Y: 0.15, Z: -1.2 } };
  const r1 = M.observe(M.createTube({ metal: 'Z', liquid: 'X', c: 0.1, T: 25 }, env)), r2 = M.observe(M.createTube({ metal: 'X', liquid: 'Y', c: 0.1, T: 25 }, env));
  r1.id = 1; r2.id = 2;
  const j = M.judge(['Z', 'X', 'Y'], [r1, r2], env);
  ok(r1.reacted && r2.reacted && j.ok && j.supported, '兩支試管（Z 放進 X²⁺、X 放進 Y²⁺）就排出 Z > X > Y');
}
{
  const s = M.pptSolve(0.1, 0.02, 1, M.KSP.AgCl);
  ok(near(s, 0.02, 1e-8), 'AgCl 幾乎完全沉澱', s);
  const p = M.pptSolve(0.1, 0.02, 2, M.KSP.PbCl2);
  ok(near((0.1 - p) * Math.pow(0.02 - 2 * p, 2), M.KSP.PbCl2, 1e-12), 'PbCl₂ 沉澱到剛好飽和');
}

console.log(fail ? '失敗 ' + fail + ' 項（通過 ' + pass + ' 項）' : '全部通過（' + pass + ' 項）');
if (fail) process.exitCode = 1;
