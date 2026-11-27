/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/capacitor.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
// 用物理核心證明每個任務在滑桿範圍與精度內做得到
const K = require(__ROOT + 'js/capacitor-core.js');
const { mock } = require("node:test");
mock.timers.enable({ apis: ["setTimeout"] });
let defs;
global.LabMission = { emit, register: (m, l) => { defs = l; } }; global.window = { LabMission: global.LabMission };
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
change('kappa', 5); mock.timers.tick(400);
change('f', 0.48); mock.timers.tick(1000);
if (done.has('capacitor-3')) throw Error('短暫經過完整插入位置就完成');
reset();

log('1/4/5: 斷開 → d 2→4 mm（V 加倍、E 不變）'); change('Vb', 12); change('mode', 'Q'); change('d', 0.0038); change('d', 0.004); mock.timers.tick(1000); reset();
log('2: V 固定 d 2→4 mm'); change('d', 0.004); reset();
log('3: V 固定 選玻璃 (f = 100%)'); change('f', 0); change('kappa', 5); change('f', 0.48); change('f', 0.50); change('f', 1); mock.timers.tick(1000); reset();
// 不靠先做另一題：直接把面積調小即可使斷電後的電壓加倍。
done.delete('capacitor-4');
change('mode', 'Q'); change('A', 0.007); change('A', 0.005);
mock.timers.tick(1000);
if (!done.has('capacitor-4')) throw Error('用面積分段調出兩倍電壓應完成');
reset();
log('6: 空氣 A = 113 cm²（打字）、d = 1 mm'); change('A', 0.0113); let s = change('d', 0.001); log('   C = ' + (s.C * 1e12).toFixed(3) + ' pF'); reset();
log('7: 紙 κ = 3.5、f = 40%'); change('kappa', 3.5); s = change('f', 0.40); log('   C/Cair = ' + (s.C / K.cAir(s.A, s.d)).toFixed(4)); reset();
log('8: 空氣 V0 = 9.5 V（滑桿）'); s = change('Vb', 9.5); mock.timers.tick(1000); log('   F = ' + (s.F * 1e6).toFixed(4) + ' μN'); reset();
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

mock.timers.reset();
// ---------- 2. 新隱藏任務 ----------
{
  const assert = require('node:assert/strict');
  // 與頁面一致的打字輸入範圍、精度與單位換算。
  const inputs = { A: [50, 400, 1, 1e-4], d: [1, 10, 2, 1e-3], Vb: [1, 20, 2, 1],
    k: [1, 100, 2, 1], f: [0, 100, 1, 0.01] };
  function play(steps) {
    let state = fresh();
    const completed = new Set(), memory = new Map(defs.map(m => [m.id, {}]));
    const readings = [];
    const read = () => ({
      ...K.solve({ ...state, f: state.kappa > 1 ? state.f : 0 }, state.mode,
        state.mode === 'V' ? state.Vb : state.Qfix),
      Vb: state.Vb, Cair: K.cAir(state.A, state.d)
    });
    function dispatch(type, data) {
      for (const m of defs) {
        if (!completed.has(m.id) && m.check({ type, data }, memory.get(m.id))) completed.add(m.id);
      }
    }
    const previousEmit = LabMission.emit;
    mock.timers.enable({ apis: ['setTimeout'] });
    LabMission.emit = dispatch;
    try {
      for (const [key, value] of steps) {
        if (key === 'reset') {
          state = fresh();
          dispatch('reset', {});
          continue;
        }
        const base = read();
        if (key === 'mode') {
          assert.ok(['Q', 'V'].includes(value) && value !== state.mode);
          // 接著電池時先等充放電結束，再斷開，保留當下的平衡電荷。
          if (value === 'Q') state.Qfix = base.Q;
          state.mode = value;
        } else {
          const [min, max, decimals, scale] = inputs[key];
          assert.ok(value >= min && value <= max && +value.toFixed(decimals) === value, key + '=' + value);
          state[key === 'k' ? 'kappa' : key] = value * scale;
        }
        const data = { ...read(), key, base };
        dispatch('change', data);
        readings.push(data);
        mock.timers.tick(1000);
      }
      mock.timers.tick(1000);
      return { completed, readings };
    } finally {
      LabMission.emit = previousEmit;
      mock.timers.reset();
    }
  }

  const oldSolutions = {
    'capacitor-1': [['mode', 'Q']],
    'capacitor-2': [['d', 4]],
    'capacitor-3': [['f', 0], ['k', 5], ['f', 1], ['f', 100]],
    'capacitor-4': [['mode', 'Q'], ['d', 4]],
    'capacitor-5': [['mode', 'Q'], ['d', 4]],
    'capacitor-6': [['A', 113], ['d', 1]],
    'capacitor-7': [['k', 3.5], ['f', 40]],
    'capacitor-8': [['Vb', 9.5]],
    'capacitor-9': [['mode', 'Q'], ['d', 6]],
    'capacitor-10': [['mode', 'Q'], ['k', 5], ['d', 10]],
    'capacitor-11': [['Vb', 12], ['d', 5], ['A', 200], ['f', 27], ['k', 6], ['A', 100], ['f', 74]],
    'capacitor-12': [['mode', 'Q'], ['f', 11.4], ['k', 80]],
    'capacitor-h1': [['Vb', 20], ['k', 80], ['d', 1], ['A', 70.6]],
    'capacitor-h2': [['mode', 'Q'], ['d', 4], ['Vb', 20], ['mode', 'V']],
    'capacitor-h3': [['Vb', 20], ['k', 80], ['d', 1], ['A', 400], ['mode', 'Q'], ['k', 1], ['d', 10], ['A', 50]]
  };
  const newSolutions = {
    'capacitor-h4': [['k', 5], ['f', 16.7]],
    'capacitor-h5': [['d', 2.4], ['Vb', 8], ['d', 3.6], ['Vb', 12]],
    'capacitor-h6': [['k', 3.5], ['f', 62], ['k', 6], ['f', 31]],
    'capacitor-h7': [['A', 150], ['mode', 'Q'], ['A', 100], ['A', 225]],
    'capacitor-h8': [['d', 3.2], ['d', 2], ['mode', 'Q'], ['d', 3.2]],
    'capacitor-h9': [['d', 2.4], ['A', 90], ['mode', 'Q'], ['A', 225], ['d', 6]],
    'capacitor-h10': [['k', 3.5], ['f', 60], ['A', 120], ['d', 3], ['mode', 'Q'],
      ['k', 5], ['f', 12.5], ['A', 200], ['d', 4.5]]
  };
  const hidden = defs.filter(m => m.hidden);
  const ids = Object.keys(newSolutions);
  const newDone = completed => [...completed].filter(id => ids.includes(id));
  try {
    assert.equal(hidden.length, 10);
    assert.ok(hidden.every(m => Number.isInteger(m.level) && m.level >= 3 && m.level <= 10));
    assert.ok(hidden.filter(m => m.level > 7).length >= 3);
    assert.deepEqual(newDone(play([]).completed), [], '載入後不操作');
    assert.deepEqual(newDone(play([['A', 110]]).completed), [], '只改面積一次');
    for (const [id, steps] of Object.entries(newSolutions)) {
      const { completed, readings } = play(steps);
      console.log(id, '操作（A: cm²、d: mm、Vb: V、k: κ、f: %）', JSON.stringify(steps),
        '讀數', JSON.stringify(readings.map(d => ({
          C_pF: +(d.C * 1e12).toFixed(3), Q_nC: +(d.Q * 1e9).toFixed(5),
          V: +d.V.toFixed(3), E_V_m: +d.E.toFixed(1), U_nJ: +(d.U * 1e9).toFixed(3),
          F_uN: d.F == null ? null : +(d.F * 1e6).toFixed(3)
        }))));
      assert.deepEqual([...completed].filter(x => hidden.some(m => m.id === x)), [id], id + ' 隱藏任務互斥');
      done.add(id);
    }
    const combined = play(Object.values(oldSolutions).flatMap(steps => [...steps, ['reset']])).completed;
    assert.deepEqual(newDone(combined), [], '依序完成一般任務與 h1–h3');
    assert.deepEqual(defs.filter(m => !ids.includes(m.id) && !combined.has(m.id)).map(m => m.id), [],
      '一般任務與 h1–h3 都必須完成');
    console.log('✓ 共 10 個隱藏任務，等級、互斥、預設、單一操作與舊任務連做均通過');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
if (done.size !== defs.length) process.exitCode = 1;
