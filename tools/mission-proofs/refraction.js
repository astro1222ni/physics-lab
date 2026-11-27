/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/refraction.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
// 用物理核心證明每個任務都做得到（數值都在滑桿範圍與打字精度內：n 到 0.001、角度到 0.01°，或快速按鈕的精確值）
const RC = require(__ROOT + 'js/refraction-core.js');
const DEG = Math.PI / 180;
let list = null;
global.LabMission = { register: (m, l) => { list = l; } }; global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/refraction.js');
// 用虛擬時鐘確認設定停穩後才完成，不必讓證明程式實際等候。
const { mock } = require('node:test');
mock.timers.enable({ apis: ['setTimeout'] });
function settled(mission, event, mem) {
  let completed = mission.check(event, mem);
  LabMission.emit = (type, data) => { if (mission.check({ type, data }, mem)) completed = true; };
  mock.timers.tick(1000);
  return completed;
}
function ev(st) {
  const s = Object.assign({ mode: 'ray', n1: 1, n2: 1.5, th1: 40, nm: 532, nCore: 1.5, nClad: 1.33, thIn: 35 }, st);
  const th1 = s.th1 === 'crit' ? RC.criticalAngle(s.n1, s.n2) : s.th1 === 'brew' ? RC.brewsterAngle(s.n1, s.n2) : s.th1 * DEG;
  const thIn = s.thIn === 'acc' ? Math.min(RC.acceptanceAngle(s.nCore, s.nClad, 1), 89.9 * DEG) : s.thIn * DEG;
  const toDeg = r => r / DEG;
  const a = RC.interfaceInfo(s.n1, s.n2, th1, s.nm);
  const b = RC.fibreInfo(s.nCore, s.nClad, thIn, 1);
  return { type: 'setup', data: {
    mode: s.mode, nm: s.nm, n1: s.n1, n2: s.n2, th1: toDeg(th1), th2: toDeg(a.th2), tir: a.tir,
    crit: toDeg(a.crit), brew: toDeg(a.brew), dev: toDeg(a.dev), R: a.R, T: a.T, Rs: a.Rs, Rp: a.Rp,
    lam1: a.lam1, lam2: a.lam2, v1: a.v1, v2: a.v2, depth: a.depth / s.nm,
    nCore: s.nCore, nClad: s.nClad, thIn: toDeg(thIn), thR: toDeg(b.thR), phi: toDeg(b.phi),
    fCrit: toDeg(b.crit), acc: toDeg(b.acc), NA: b.NA, guided: b.guided, entryT: b.entryT, wallR: b.wallR } };
}
function passing(st, memory = new Map()) {
  const e = ev(st);
  return list.filter(m => {
    if (!memory.has(m.id)) memory.set(m.id, {});
    return settled(m, e, memory.get(m.id));
  }).map(m => m.id);
}
const legacyMemory = new Map();
let bad = 0;
function expect(id, st, note) {
  const p = passing(st); const e = ev(st).data;
  require('node:assert/strict').deepEqual(passing(st, legacyMemory).filter(x => /-h(?:[4-9]|10)$/.test(x)), [], id + ' 累積舊解');
  require('node:assert/strict').deepEqual(p.filter(x => /-h(?:[4-9]|10)$/.test(x)), [], id + ' 舊解');
  const ok = p.includes(id); if (!ok) bad++;
  console.log((ok ? 'OK ' : 'FAIL ') + id.padEnd(15), JSON.stringify(st), note || '', '| th2=' + e.th2.toFixed(3), 'crit=' + e.crit.toFixed(3), 'R=' + e.R.toFixed(4), 'lam2=' + e.lam2.toFixed(2), 'acc=' + e.acc.toFixed(3), '| also:', p.filter(x => x !== id).join(','));
}
function expectNot(id, st, note) { const p = passing(st); const ok = !p.includes(id); if (!ok) bad++; console.log((ok ? 'OK ' : 'FAIL ') + ('not ' + id).padEnd(19), JSON.stringify(st), note || ''); }
console.log('預設狀態通過的任務：', JSON.stringify(passing({})), JSON.stringify(passing({ mode: 'wave' })), JSON.stringify(passing({ mode: 'fibre' })));
if (passing({}).length || passing({ mode: 'wave' }).length || passing({ mode: 'fibre' }).length) bad++;
const tir = list.find(m => m.id === 'refraction-1'), tirMem = {};
if (tir.check(ev({ n1: 1.5, n2: 1, th1: 30 }), tirMem) || !settled(tir, ev({ n1: 1.5, n2: 1, th1: 60 }), tirMem)) bad++;
const fastAngle = ev({ n1: 1.5, n2: 1, th1: 60 });
if (settled(tir, ev({ n1: 1.5, n2: 1, th1: 'crit' }), {})) bad++;
if (!settled(tir, fastAngle, {})) bad++;
expect('refraction-2', { n1: 1.33, n2: 1, th1: 'crit' }, '水→空氣，按「臨界角」');
expect('refraction-2', { n1: 1.5, n2: 1, th1: 41.81 }, '玻璃→空氣，打字 41.81°');
expect('refraction-3', { mode: 'wave', n2: 1.35, nm: 405 }, '藍紫光，n2 = 1.35（滑桿）');
expect('refraction-3', { mode: 'wave', n2: 1.773, nm: 532 }, '綠光，n2 = 1.773（打字）');
expect('refraction-3', { mode: 'wave', n2: 2.167, nm: 650 }, '紅光，n2 = 2.167（打字）');
expectNot('refraction-3', { mode: 'ray', n2: 1.35, nm: 405 }, '光線模式不算');
expect('refraction-4', { n1: 1.414, n2: 1 }, 'n1 = 1.414（打字）');
expect('refraction-4', { n1: 1.88, n2: 1.33 }, '滑桿 1.88／1.33');
expectNot('refraction-4', { n1: 1.41, n2: 1 }, '1.41 → 45.17° 不夠準');
expect('refraction-5', { mode: 'fibre', nCore: 1.5, nClad: 1, thIn: 85 }, '玻璃纖芯、空氣包層');
expect('refraction-5', { mode: 'fibre', nCore: 2.42, nClad: 1.33, thIn: 89.9 }, '鑽石纖芯、水包層');
expectNot('refraction-5', { mode: 'fibre', nCore: 1.5, nClad: 1.33, thIn: 85 }, '預設材料 85° 會漏光');
expect('refraction-6', { th1: 40.9 }, '滑桿 40.9°');
expect('refraction-6', { th1: 40.8 }, '滑桿 40.8°');
expect('refraction-7', { n2: 1.925, th1: 0 }, 'n2 = 1.925（打字）');
expect('refraction-7', { n2: 1.92, th1: 0 }, '滑桿 1.92');
expect('refraction-7', { n1: 1.3, n2: 2.5, th1: 0 }, '1.30 → 2.50（比值 1.923）');
expect('refraction-8', { n2: 1.732, th1: 60 }, '空氣→n = 1.732');
expect('refraction-8', { n2: 1.73, th1: 60 }, '滑桿 1.73');
expectNot('refraction-8', { n2: 1.74, th1: 60 }, '1.74 不夠準');
expectNot('refraction-8', { n2: 1.5, th1: 'brew' }, '空氣→玻璃的布魯斯特角是 56.3°，不是 60°');
expect('refraction-9', { mode: 'fibre', nCore: 1.421, nClad: 1.33, thIn: 'acc' }, 'n芯 = 1.421（打字），按「最大接收角」');
expect('refraction-9', { mode: 'fibre', nCore: 1.421, nClad: 1.33, thIn: 30 }, 'n芯 = 1.421，射入角 30°');
expectNot('refraction-9', { mode: 'fibre', nCore: 1.42, nClad: 1.33, thIn: 'acc' }, '滑桿 1.42 → 29.83° 不夠準');
expect('refraction-10', { n1: 1.5, n2: 1, th1: 41.41 }, '玻璃→空氣 41.41°（打字）');
expect('refraction-10', { n1: 1.33, n2: 1, th1: 48.34 }, '水→空氣 48.34°（打字）');
expectNot('refraction-10', { n1: 1.5, n2: 1, th1: 41.4 }, '滑桿 41.4° → 49.6%');
expectNot('refraction-10', { n1: 1, n2: 1.5, th1: 82.8 }, '空氣→玻璃掠射不算（要光密→光疏）');
expect('refraction-11', { n1: 1.272, n2: 1, th1: 'brew' }, 'n1 = 1.272（打字），按「布魯斯特角」');
expect('refraction-11', { n1: 1.59, n2: 1.25, th1: 'brew' }, '滑桿 1.59／1.25');
expectNot('refraction-11', { n1: 1.27, n2: 1, th1: 'brew' }, '1.27 不夠準');
expect('refraction-12', { n1: 2.25, n2: 1.3, nm: 650, th1: 'brew' }, '紅光 2.25／1.30，按「布魯斯特角」');
expect('refraction-12', { n1: 1.843, n2: 1.064, nm: 532, th1: 30 }, '綠光 1.843／1.064（打字），30°');
expectNot('refraction-12', { n1: 2.25, n2: 1.3, nm: 532, th1: 'brew' }, '綠光時 λ2 = 409 nm');
expect('refraction-h1', { n1: 2.42, n2: 1, th1: 25 }, '鑽石→空氣 25°');
expectNot('refraction-h1', { n1: 2.42, n2: 1, th1: 40 }, '角度太大不算');
expect('refraction-h2', { n1: 1.5, n2: 1.5, th1: 40 }, '上下都是玻璃');
expectNot('refraction-h2', { n1: 1, n2: 1, th1: 40 }, '空氣對空氣不算');
expect('refraction-h3', { mode: 'wave', n1: 1.5, n2: 1, th1: 41.9 }, '玻璃→空氣，略大於臨界角');
expectNot('refraction-h3', { mode: 'wave', n1: 1.5, n2: 1, th1: 'crit' }, '恰在臨界角（按鈕）不算');
expect('refraction-h3', { mode: 'wave', n1: 1.33, n2: 1, th1: 48.8 }, '水→空氣 48.8°（滑桿）');
expectNot('refraction-h3', { mode: 'wave', n1: 1.5, n2: 1, th1: 60 }, '深入全反射區，漸逝波很淺');
console.log('h3 深度 41.9°：', ev({ mode: 'wave', n1: 1.5, n2: 1, th1: 41.9 }).data.depth.toFixed(3), '；60°：', ev({ mode: 'wave', n1: 1.5, n2: 1, th1: 60 }).data.depth.toFixed(3));
// 第一個任務用單獨的計時測試，補上它的達成例。
const assert = require('node:assert/strict');
assert.deepEqual(passing({ n1: 1.5, n2: 1, th1: 60 }).filter(x => /-h(?:[4-9]|10)$/.test(x)), []);
const outward = { n1: 1.2, n2: 1.8, th1: 0 };
const inward = { n1: 1.8, n2: 1.2, th1: 0 };
const threshold = { mode: 'fibre', nCore: 1.45, nClad: 1.05, thIn: 88 };
const wider = { ...threshold, nClad: 1 };
const cases = [
  [[outward, inward], { n2: 1.201 }],
  [{ n2: 1.414, th1: 45 }, { th1: 45.03 }],
  [{ n2: 1.414, th1: 'brew' }, { n2: 1.417 }],
  [[threshold, wider], { nClad: 1.001 }],
  [{ mode: 'wave', n1: 1.5, n2: 1, th1: 44.40 }, { th1: 44.44 }],
  [{ mode: 'fibre', nCore: 1.5, nClad: 1.225, thIn: 48.59 }, { thIn: 48.66 }],
  [{ mode: 'wave', n1: 2.2, n2: 1.1, th1: 'brew' }, { n2: 1.101 }]
];
function hiddenHits(steps) {
  const memory = new Map();
  return [...new Set(steps.flatMap(st => passing(st, memory).filter(x => x.includes('-h'))))];
}
for (const [i, [config, change]] of cases.entries()) {
  const id = 'refraction-h' + (i + 4);
  const steps = Array.isArray(config) ? config : [config];
  if (steps.length > 1) {
    for (const st of steps) assert.deepEqual(hiddenHits([st]), [], id + ' 單獨一步');
  }
  assert.deepEqual(hiddenHits(steps), [id], id);
  assert.deepEqual(hiddenHits([...steps.slice(0, -1), { ...steps.at(-1), ...change }]), [], id + ' near miss');
  console.log('✓', id, JSON.stringify(steps), '近失變更', JSON.stringify(change));
}
// 同向重測、同反射率但不是同一對介質、或入射角差一格，都不能證明互易。
for (const st of [outward, { n1: 2.4, n2: 1.6, th1: 0 }, { ...inward, th1: 0.01 }]) {
  assert.deepEqual(hiddenHits([outward, st]), []);
}
assert.deepEqual(hiddenHits([inward, outward]), ['refraction-h4'], '可以從任一側開始');
assert.deepEqual(hiddenHits([{ n1: 1.5, n2: 1.501, th1: 0 }, { n1: 1.501, n2: 1.5, th1: 0 }]), [], '反光太弱');
// 還未飽和、只改射入角、或兩次顛倒，都不構成數值孔徑越過門檻後的比較。
assert.deepEqual(hiddenHits([{ ...threshold, nClad: 1.051 }, wider]), []);
assert.deepEqual(hiddenHits([threshold, { ...wider, thIn: 88.01 }]), []);
assert.deepEqual(hiddenHits([wider, threshold]), []);
console.log('互易 R =', ev(outward).data.R, ev(inward).data.R);
for (const st of [threshold, wider, { ...wider, nClad: 1.001 }]) {
  const d = ev(st).data;
  console.log('包層', st.nClad, 'NA', d.NA, '最大接收角', d.acc, '側壁全反射', d.guided);
}
mock.timers.reset();
console.log(bad ? '\n有 ' + bad + ' 項不符' : '\n全部符合');
if (bad) process.exitCode = 1;
