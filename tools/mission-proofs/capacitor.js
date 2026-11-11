/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/capacitor.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
// 用物理核心證明每個任務在滑桿範圍與精度內做得到
const K = require(__ROOT + 'js/capacitor-core.js');
let defs;
global.LabMission = { register: (m, l) => { defs = l; } }; global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/capacitor.js');
const mem = {}; defs.forEach(m => mem[m.id] = {});
function fresh() { return { A: 0.01, d: 0.002, Vb: 10, kappa: 1, f: 1, mode: 'V', Qfix: 0 }; }
let st = fresh();
const eq = () => K.solve({ A: st.A, d: st.d, kappa: st.kappa, f: st.kappa > 1 ? st.f : 0 }, st.mode, st.mode === 'V' ? st.Vb : st.Qfix);
const snap = () => { const s = eq(); return { C: s.C, Q: s.Q, V: s.V, E: s.E, U: s.U, F: s.F, A: s.A, d: s.d, kappa: s.kappa, f: s.f, Vb: st.Vb, mode: st.mode, airOnly: s.airOnly }; };
const done = new Set();
function emit(type, data) { defs.forEach(m => { if (!done.has(m.id) && m.check({ type, data }, mem[m.id])) { done.add(m.id); console.log('  完成', m.id, 'L' + m.level); } }); }
function change(key, v) {
  const base = snap();
  if (key === 'mode') { if (v === 'Q') st.Qfix = eq().Q; st.mode = v; } else st[key] = v;
  const s = eq();
  emit('change', { key, mode: st.mode, A: s.A, d: s.d, Vb: st.Vb, kappa: s.kappa, f: s.f, C: s.C, Cair: K.cAir(s.A, s.d), Q: s.Q, V: s.V, E: s.E, U: s.U, F: s.F, airOnly: s.airOnly, base });
  return s;
}
function reset() { st = fresh(); emit('reset', {}); }
const log = (t) => console.log(t);

log('1/4/5: 斷開 → d 2→4 mm（V 加倍、E 不變）'); change('mode', 'Q'); change('d', 0.004); reset();
log('2: V 固定 d 2→4 mm'); change('d', 0.004); reset();
log('3: V 固定 選玻璃 (f = 100%)'); change('kappa', 5); reset();
log('6: 空氣 A = 113 cm²（打字）、d = 1 mm'); change('A', 0.0113); let s = change('d', 0.001); log('   C = ' + (s.C * 1e12).toFixed(3) + ' pF'); reset();
log('7: 紙 κ = 3.5、f = 40%'); change('kappa', 3.5); s = change('f', 0.40); log('   C/Cair = ' + (s.C / K.cAir(s.A, s.d)).toFixed(4)); reset();
log('8: 空氣 V0 = 9.5 V（滑桿）'); s = change('Vb', 9.5); log('   F = ' + (s.F * 1e6).toFixed(4) + ' μN'); reset();
log('9: 斷開 → d 2→6 mm'); change('mode', 'Q'); s = change('d', 0.006); reset();
log('10: 空氣斷開 → 玻璃 → d 2→10 mm'); change('mode', 'Q'); change('kappa', 5); s = change('d', 0.010); log('   V = ' + s.V.toFixed(4)); reset();
log('11: V0 = 12 V、d = 5 mm、雲母 κ = 6、A = 200 cm²、f = 27%'); change('Vb', 12); change('d', 0.005); change('A', 0.02); change('f', 0.27); s = change('kappa', 6); log('   Q = ' + (s.Q * 1e9).toFixed(5) + ' nC');
log('   另解 A = 100 cm²、f = 74%'); change('A', 0.01); s = change('f', 0.74); log('   Q = ' + (s.Q * 1e9).toFixed(5) + ' nC'); reset();
log('12: 空氣斷開 → 水 κ = 80、f = 11.4%（打字）'); change('mode', 'Q'); change('f', 0.114); s = change('kappa', 80); log('   V/V0 = ' + (s.V / 10).toFixed(5));
log('   （滑桿整數 11%、12% 不行：）'); [0.11, 0.12].forEach(f => { const C = K.capacitance({ A: 0.01, d: 0.002, kappa: 80, f }); log('   f = ' + f + ' → V/V0 = ' + (K.cAir(0.01, 0.002) / C).toFixed(4)); }); reset();
log('h1: V0 = 20 V、水 κ = 80（f = 100%）、A = 70.6 cm²（打字）、d = 1 mm'); change('Vb', 20); change('kappa', 80); change('d', 0.001); s = change('A', 0.00706); log('   U = ' + (s.U * 1e6).toFixed(5) + ' μJ'); reset();
log('h2: 斷開 → d 2→4 mm（V 變 20 V）→ 電池 20 V → 接上'); change('mode', 'Q'); change('d', 0.004); change('Vb', 20); change('mode', 'V'); reset();
log('h3: V0 = 20 V、水、d = 1 mm、A = 400 cm² → 斷開 → 空氣、d = 10 mm、A = 50 cm²');
change('Vb', 20); change('kappa', 80); change('d', 0.001); change('A', 0.04); change('mode', 'Q'); change('kappa', 1); change('d', 0.01); s = change('A', 0.005); log('   V = ' + (s.V / 1000).toFixed(1) + ' kV'); reset();
log('預設狀態下的單一無關操作不會誤觸：'); const before = done.size; change('A', 0.011); reset();
log('全部 ' + defs.length + ' 個任務，完成 ' + done.size + '；未完成：' + defs.filter(m => !done.has(m.id)).map(m => m.id).join(', '));
