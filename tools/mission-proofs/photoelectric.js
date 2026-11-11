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
set('lambda', 600); set('lambda', 500);            // m1
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
