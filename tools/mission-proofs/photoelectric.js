/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/photoelectric.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
// 用真正的任務檢查函式 + 物理核心模擬頁面事件，證明每個任務都做得到
const PC = require(__ROOT + 'js/photoelectric-core.js');
global.window = { LabMission: { register(id, list) { global.M = list; } } }; global.LabMission = global.window.LabMission;
require(__ROOT + 'js/missions/photoelectric.js');
const done = {};
let st = { metal: 'Na', lambda: 400, Pu: 60, V: 1 }, last = null, stops = [];
const snap = () => { const A = PC.analyze({ lambda: st.lambda, phi: PC.metal(st.metal).phi, P: st.Pu * 1e-6, V: st.V });
  return { metal: st.metal, phi: A.phi, lambda: st.lambda, f: A.f, E: A.EeV, P: st.Pu, V: st.V, I: A.I, Isat: A.Isat, Kmax: A.Kmax, Vs: A.Vs, emits: A.emits, zero: A.zero, collected: A.collected, f0: A.f0 }; };
function emit(type, data, label) { M.forEach(m => { if (done[m.id]) return; m.mem = m.mem || {}; if (m.check({ type, data }, m.mem)) { done[m.id] = label; } }); }
function set(key, v) { st[key === 'P' ? 'Pu' : key] = v; const s = snap(); emit('change', Object.assign({ key, base: last }, s), `${key}=${v}`); last = s; }
function fits() { const out = {}; PC.METALS.forEach(m => { const pts = stops.filter(s => s.metal === m.id); if (!pts.length) return; const fs = new Set(pts.map(p => p.lambda));
  out[m.id] = { n: pts.length, nf: fs.size, fit: PC.millikanFit(pts.map(p => ({ f: p.f, Vs: p.Vs }))), f0True: PC.thresholdFrequency(m.phi) }; }); return out; }
function measure(label) { let n = 0; st.V = 0; while (!snap().zero) { n++; st.V = -n / 100; } set('V', st.V);
  const r = PC.stopCheck({ lambda: st.lambda, phi: PC.metal(st.metal).phi, P: st.Pu * 1e-6, V: st.V }); if (r !== 'ok') throw r;
  const A = snap(); const rec = { metal: st.metal, lambda: st.lambda, f: A.f, Pu: st.Pu, Vs: -st.V, VsTrue: A.Vs };
  const i = stops.findIndex(s => s.metal === rec.metal && s.lambda === rec.lambda && s.Pu === rec.Pu); if (i >= 0) stops.splice(i, 1); stops.push(rec);
  emit('stop', Object.assign(A, { Vs: rec.Vs, VsTrue: rec.VsTrue, records: stops.slice(), fits: fits() }), label + ` Vs=${rec.Vs}`); }
// 預設狀態下的操作不應觸發
set('V', 1.5); set('V', 1); console.log('預設附近觸發：', Object.keys(done));
const { mock } = require('node:test');
mock.timers.enable({ apis: ['Date'], now: 0 });
set('lambda', 750); set('lambda', 600); mock.timers.tick(1000); set('lambda', 500);
mock.timers.reset();            // m1
set('lambda', 600); set('P', 100);                 // m2
set('lambda', 400); set('P', 60); measure('Na400'); // m3
set('V', -0.3); set('P', 20); set('P', 60);        // m4
set('P', 20); measure('Na400 P20'); set('P', 60); measure('Na400 P60'); // m5
set('metal', 'Cs'); set('lambda', 590);            // m6
set('metal', 'Zn'); set('lambda', 197); measure('Zn197'); // m7
set('metal', 'Cs'); set('V', 5); set('lambda', 360); set('lambda', 540); // m8
set('lambda', 360); set('P', 60); set('lambda', 540); set('P', 40); // h3
set('lambda', 500); measure('Cs500'); set('lambda', 400); measure('Cs400'); set('lambda', 300); measure('Cs300'); // m9
set('lambda', 344); measure('Cs344'); set('metal', 'K'); set('lambda', 325.9); measure('K325.9'); // m10
set('metal', 'Na'); for (const L of [500, 350, 250]) { set('lambda', L); measure('Na' + L); } // m11 (Cs, Na, Zn)
set('metal', 'Zn'); for (const L of [280, 230, 180]) { set('lambda', L); measure('Zn' + L); }
set('metal', 'Cs'); set('lambda', 200); set('V', -5);  // h1
set('lambda', 295);                                    // h2
for (const m of M) console.log(m.id.padEnd(18), 'L' + m.level, done[m.id] ? '✓ ' + done[m.id] : '✗');

// ---------- 2. 新隱藏任務 ----------
{
  const assert = require('node:assert/strict');
  const inputs = { lambda: [100, 800, 1], P: [0, 100, 1], V: [-5, 5, 2] };
  function play(steps) {
    const state = { metal: 'Na', lambda: 400, P: 60, V: 1 };
    const completed = new Set(), memory = new Map(M.map(m => [m.id, {}]));
    const records = [], readings = [];
    const params = () => ({ lambda: state.lambda, phi: PC.metal(state.metal).phi, P: state.P * 1e-6, V: state.V });
    const read = () => {
      const a = PC.analyze(params());
      return { ...state, phi: a.phi, f: a.f, E: a.EeV, I: a.I, Isat: a.Isat, Kmax: a.Kmax, Vs: a.Vs,
        emits: a.emits, zero: a.zero, collected: a.collected, f0: a.f0 };
    };
    function dispatch(type, data) {
      readings.push({ type, data });
      for (const m of M) {
        if (!completed.has(m.id) && m.check({ type, data }, memory.get(m.id))) completed.add(m.id);
      }
    }
    function change(key, value) {
      if (key === 'metal') {
        assert.ok(PC.METALS.some(m => m.id === value), value);
      } else {
        const [min, max, decimals] = inputs[key];
        assert.ok(value >= min && value <= max && +value.toFixed(decimals) === value, key + '=' + value);
      }
      const base = read();
      state[key] = value;
      dispatch('change', { ...read(), key, base });
    }
    mock.timers.enable({ apis: ['Date'], now: 0 });
    try {
      for (const [key, value] of steps) {
        if (key === 'wait') {
          mock.timers.tick(value);
          continue;
        }
        if (key !== 'record') {
          change(key, value);
          continue;
        }
        // 以頁面允許的 0.01 V 為步長找電流表第一次顯示零的電壓，再輸入該值並按記錄。
        const p = params();
        const firstZero = Array.from({ length: 501 }, (_, n) => -n / 100)
          .find(V => PC.isZeroCurrent(PC.current({ ...p, V })));
        assert.notEqual(firstZero, undefined, '找不到量測範圍內的歸零點');
        change('V', firstZero);
        assert.equal(PC.stopCheck(params()), 'ok', JSON.stringify(state));
        const d = read();
        const point = { metal: d.metal, lambda: d.lambda, f: d.f, Pu: d.P, Vs: -d.V, VsTrue: d.Vs };
        const duplicate = records.findIndex(s => s.metal === point.metal && s.lambda === point.lambda && s.Pu === point.Pu);
        if (duplicate >= 0) records.splice(duplicate, 1);
        records.push(point);
        const fits = {};
        for (const metal of PC.METALS) {
          const pts = records.filter(s => s.metal === metal.id);
          if (!pts.length) continue;
          fits[metal.id] = { n: pts.length, nf: new Set(pts.map(s => s.lambda)).size,
            fit: PC.millikanFit(pts), f0True: PC.thresholdFrequency(metal.phi) };
        }
        dispatch('stop', { ...d, Vs: point.Vs, VsTrue: point.VsTrue, records: records.slice(), fits });
      }
      return { completed, readings };
    } finally {
      mock.timers.reset();
    }
  }

  const record = (...wavelengths) => wavelengths.flatMap(value => [['lambda', value], ['record']]);
  const oldSequence = [
    ['lambda', 750], ['lambda', 600], ['wait', 1000], ['lambda', 500],
    ['lambda', 600], ['P', 100], ['lambda', 400], ['P', 60], ['record'],
    ['V', -0.3], ['P', 20], ['P', 60], ['P', 20], ['record'], ['P', 60], ['record'],
    ['metal', 'Cs'], ['lambda', 590], ['metal', 'Zn'], ...record(197),
    ['metal', 'Cs'], ['V', 5], ['lambda', 360], ['lambda', 540],
    ['lambda', 360], ['P', 60], ['lambda', 540], ['P', 40],
    ...record(500, 400, 300, 344), ['metal', 'K'], ...record(325.9),
    ['metal', 'Na'], ...record(500, 350, 250), ['metal', 'Zn'], ...record(280, 230, 180),
    ['metal', 'Cs'], ['lambda', 200], ['V', -5], ['lambda', 295]
  ];
  const newSolutions = {
    'photoelectric-h4': [['metal', 'Cs'], ['lambda', 365], ['V', 3], ['metal', 'Cu']],
    'photoelectric-h5': [['metal', 'Cs'], ['V', 3], ['lambda', 430], ['P', 0], ['lambda', 630], ['P', 45]],
    'photoelectric-h6': [['lambda', 355.3], ['V', 0.6], ['V', -0.6]],
    'photoelectric-h7': [['metal', 'Zn'], ['V', 4.1], ['lambda', 243.1], ['metal', 'Cu']],
    'photoelectric-h8': [['metal', 'Cs'], ...record(480, 400, 342.9)],
    'photoelectric-h9': [...record(255), ['metal', 'Zn'], ['record']],
    'photoelectric-h10': [['lambda', 440], ['V', -0.27], ['lambda', 368.9], ['V', -0.54]]
  };
  const hidden = M.filter(m => m.hidden);
  const ids = Object.keys(newSolutions);
  const newDone = completed => [...completed].filter(id => ids.includes(id));
  try {
    assert.equal(hidden.length, 10);
    assert.ok(hidden.every(m => Number.isInteger(m.level) && m.level >= 3 && m.level <= 10));
    assert.ok(hidden.filter(m => m.level > 7).length >= 3);
    assert.deepEqual(newDone(play([]).completed), [], '載入後不操作');
    assert.deepEqual(newDone(play([['V', 1.5]]).completed), [], '只改電壓一次');
    for (const [id, steps] of Object.entries(newSolutions)) {
      const { completed, readings } = play(steps);
      console.log(id, '操作（λ: nm、P: μW、V: V）', JSON.stringify(steps),
        '讀數', JSON.stringify(readings.map(({ type, data: d }) => ({
          action: d.key ?? type, metal: d.metal, lambda_nm: d.lambda, f_THz: +(d.f / 1e12).toFixed(3),
          P_uW: d.P, V: d.V, Vs: +d.Vs.toFixed(4), K_eV: +d.Kmax.toFixed(4), I_nA: +(d.I * 1e9).toFixed(4),
          zero: d.zero, emits: d.emits, collected: +d.collected.toFixed(4)
        }))));
      assert.deepEqual([...completed].filter(x => hidden.some(m => m.id === x)), [id], id + ' 隱藏任務互斥');
      done[id] = true;
    }
    const combined = play(oldSequence).completed;
    assert.deepEqual(newDone(combined), [], '依序完成一般任務與 h1–h3');
    assert.deepEqual(M.filter(m => !ids.includes(m.id) && !combined.has(m.id)).map(m => m.id), [],
      '一般任務與 h1–h3 都必須完成');
    console.log('✓ 共 10 個隱藏任務，等級、互斥、預設、單一操作與舊任務連做均通過');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
if (M.some(m => !done[m.id])) process.exitCode = 1;
