/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/specific-heat.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const HC = require(__ROOT + 'js/specific-heat-core.js');
const H = HC.enthalpyAt;
function mix(mat, m1, T1, m2, T2, C) {
  const A = HC.makeBody(mat, m1), B = HC.makeBody('h2o', m2, C);
  const HA = H(A, T1, mat === 'h2o' ? 0 : undefined), HB = H(B, T2, 1);
  const e = HC.equilibrium([{ b: A, H: HA }, { b: B, H: HB }]);
  const pa = HC.phaseMasses(A, e.H[0]), pb = HC.phaseMasses(B, e.H[1]);
  return { Tf: e.T, ice: (mat === 'h2o' ? pa[0] : 0) + pb[0], steam: (mat === 'h2o' ? pa[2] : 0) + pb[2], iceA: mat === 'h2o' ? pa[0] : 0 };
}
const r = (o) => JSON.stringify(o, (k, v) => typeof v === 'number' ? +v.toFixed(5) : v);
console.log('M4 iron→40:', r(mix('fe', 0.31, 100, 0.1, 20, 0)));
console.log('M7 copper avg: m1=0.544', r(mix('cu', 0.544, 100, 0.05, 20, 0)), ' m1=0.543', r(mix('cu', 0.543, 100, 0.05, 20, 0)));
console.log('M8 just melts: ice 0.1@0, water 0.2@40', r(mix('h2o', 0.1, 0, 0.2, 40, 0)));
console.log('M8 edge 0.199 (ice left?)', r(mix('h2o', 0.1, 0, 0.199, 40, 0)));
console.log('M12 ice 0.05@-20 cup100 water 0.142@40.09', r(mix('h2o', 0.05, -20, 0.142, 40.09, 100)));
console.log('h1 ice grows 0.5@-30 water 0.1@1', r(mix('h2o', 0.5, -30, 0.1, 1, 0)));
console.log('h1 cold iron -20 1kg water 0.05@0', r(mix('fe', 1, -20, 0.05, 0, 0)));
console.log('h2 boil Al 1@200 water 0.05@90', r(mix('al', 1, 200, 0.05, 90, 0)));
console.log('M2 same T: Al 0.2@20 water 0.2@20', r(mix('al', 0.2, 20, 0.2, 20, 0)));
console.log('defaults Al 0.2@100 w 0.2@20', r(mix('al', 0.2, 100, 0.2, 20, 0)));
// M10 boil at 300 s
{ const m = 0.5, T0 = -10, b = HC.makeBody('h2o', m); const Q = H(b, 100, 1) - H(b, T0, 0); const P = Math.round(Q / 300 * 10) / 10;
  const s = HC.heatingSchedule(b, H(b, T0, 0), P, H(b, 100, 2)); console.log('M10 P=', P, 'boil start t=', s.segs[2].t1.toFixed(3)); }
{ const b = HC.makeBody('h2o', 0.2); const s = HC.heatingSchedule(b, H(b, -20, 0), 500, H(b, 100, 2)); console.log('default heater boil start', s.segs[2].t1.toFixed(2), 'total', s.total.toFixed(1)); }
// M11 loss c within 1%: m=1, P=500, record at 20 and 30 °C
{ const m = 1, P = 500, ke = HC.KE_BEAKER, b = HC.makeBody('h2o', m);
  const H0 = H(b, 5, 1);
  const tAt = (Tt) => { let lo = 0, hi = 5000; for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (HC.temperature(b, HC.heatStep(b, H0, P, ke, 25, mid).H) < Tt) lo = mid; else hi = mid; } return hi; };
  for (const [a, c] of [[20, 30], [15, 35], [40, 50], [60, 80]]) { const t1 = tAt(a), t2 = tAt(c); const cm = P * (t2 - t1) / (m * (c - a)); console.log('M11 loss points', a, c, 'c_meas', cm.toFixed(1), ((cm / 4186 - 1) * 100).toFixed(2) + '%'); }
}
// M9 latent: plateau duration
{ const m = 0.2, P = 500; console.log('M9 plateau duration', (m * 3.34e5 / P).toFixed(1), 's'); }
// h3 steady: m=0.05 water P 45 W loss
{ const b = HC.makeBody('h2o', 0.2); const e = HC.heaterEnd(b, H(b, 20, 1), 100, HC.KE_BEAKER, 25, H(b, 100, 2), 0.05); console.log('h3 steady P=100 m=0.2', e.reason, e.t.toFixed(0), 's  Tss', 25 + 100 / 3); }
// mystery: c measurement from calorimeter for each
for (const id of HC.MYSTERY_IDS) { const o = mix(id, 0.5, 100, 0.2, 20, 0); const c = 0.2 * 4186 * (o.Tf - 20) / (0.5 * (100 - o.Tf)); console.log('mystery', id, 'Tf', o.Tf.toFixed(2), 'c from 2-dec Tf', (0.2 * 4186 * (+o.Tf.toFixed(2) - 20) / (0.5 * (100 - +o.Tf.toFixed(2)))).toFixed(1), 'true', HC.SUBSTANCES[id].phases[0].c); }
// timing estimates
for (const [mat, m1, T1, m2, T2, stir] of [['al', 0.2, 100, 0.2, 20, true], ['al', 0.2, 100, 0.2, 20, false], ['h2o', 0.1, -10, 0.2, 40, true], ['pb', 0.01, 100, 1, 20, true], ['h2o', 0.5, -30, 0.1, 1, true], ['fe', 1, 200, 0.05, 20, true]]) {
  const A = HC.makeBody(mat, m1), B = HC.makeBody('h2o', m2); const k = HC.contactK(mat, m1, stir);
  console.log('t_eq', mat, m1, T1, m2, T2, stir, 'k=', k.toFixed(2), 't(0.05)=', HC.timeToEquilibrium(A, B, H(A, T1, 0), H(B, T2, 1), k, 0.05).toFixed(1), 't(0.01)=', HC.timeToEquilibrium(A, B, H(A, T1, 0), H(B, T2, 1), k, 0.01).toFixed(1));
}
