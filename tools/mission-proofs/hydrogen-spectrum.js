/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/hydrogen-spectrum.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
// 用物理核心證明每個任務都做得到（模擬頁面會送出的事件）
const HC = require(__ROOT + 'js/hydrogen-spectrum-core.js');
global.window = global;
let list = [];
global.LabMission = { register: (m, l) => { list = l.map(x => Object.assign({ mem: {} }, x)); } };
require(__ROOT + 'js/missions/hydrogen-spectrum.js');
const done = {};
function emit(type, data) { list.forEach(m => { if (!done[m.id] && m.check({ type, data }, m.mem)) done[m.id] = true; }); }
function fresh() { list.forEach(m => m.mem = {}); }
const r4 = x => Math.round(x * 1e4) / 1e4, r3 = x => Math.round(x * 1e3) / 1e3, r2 = x => Math.round(x * 100) / 100;
// 簡化的頁面狀態
let n = 1, K = 0, em = {};
function tap(target) { // 與 js/hydrogen-spectrum.js 的 request 相同邏輯
  if (n === Infinity) { const ph = HC.recombination(K, target); emit('emit', { from: Infinity, to: target, E: ph.E, lambda: ph.lambda, source: 'recomb', K, lines: Object.keys(em) }); n = target; K = 0; return; }
  if (target < n) { const t = HC.transition(n, target); em[n + '-' + target] = 1; const f = n; n = target; emit('emit', { from: f, to: target, E: t.E, lambda: t.lambda, source: 'tap', visible: t.region === 'VIS', lines: Object.keys(em) }); return; }
  fire(target === Infinity ? -HC.energy(n) : HC.energy(target) - HC.energy(n), 'tap');
}
function fire(E, source) {
  const r = HC.absorb(n, E), lam = HC.HC_EV_NM / E;
  if (r.type === 'pass') { emit('pass', { from: n, bare: n === Infinity, E, lambda: lam, visible: lam >= 380 && lam <= 750, source }); return r; }
  if (r.type === 'absorb') { const f = n; n = r.to; emit('absorb', { from: f, to: r.to, E, lambda: lam, source }); return r; }
  const f = n; n = Infinity; K = r.K; emit('ionize', { from: f, E, lambda: lam, K: r.K, source }); return r;
}
function reset() { n = 1; K = 0; em = {}; emit('reset', {}); }
function discharge(Kv, seconds, seed) { // 與 tubeStep 相同：每秒 400 次撞擊、每 0.5 秒回報
  const rand = HC.rng(seed || 1), probs = HC.excitationProbs(Kv), ns = Object.keys(probs).length;
  let imp = 0, exc = 0, ph = 0; const counts = {}; let firstAll = null;
  for (let step = 1; step <= seconds * 2; step++) {
    for (let i = 0; i < 200; i++) { imp++; if (!ns) continue; exc++; HC.cascade(HC.pick(probs, rand), rand).forEach(s => { const k = s[0] + '-' + s[1]; counts[k] = (counts[k] || 0) + 1; ph++; }); }
    emit('discharge', { K: Kv, imp, exc, ph, counts: Object.assign({}, counts), top: 0 });
  }
  return { imp, ph, counts };
}
const say = (id, how) => console.log((done[id] ? '✓ ' : '✗ ') + id + '：' + how);

// 預設狀態不觸發任何任務
discharge(13.4, 6, 3); emit('absorption', { hot: false });
console.log('預設狀態觸發的任務：', Object.keys(done).length ? Object.keys(done) : '無');
fresh(); for (const k in done) delete done[k];

reset(); tap(3); tap(2); say('hydrogen-spectrum-1', '點 n = 3（吸收），再點 n = 2（放出 Hα 656.47 nm）');
emit('absorption', { hot: false }); emit('absorption', { hot: true }); say('hydrogen-spectrum-2', '白光吸收：冷 → 熱');
reset(); tap(4); tap(3); tap(2); tap(1); say('hydrogen-spectrum-3', '點 n = 4，再依序點 3、2、1（0.661 + 1.889 + 10.199 = 12.749 eV）');
reset(); [3, 4, 5, 6].forEach(u => { tap(u); tap(2); }); say('hydrogen-spectrum-4', '點 3→2、4→2、5→2、6→2');
reset(); discharge(11.0, 2, 5); say('hydrogen-spectrum-5', '放電管 K = 11.000 eV（10.199 ≤ K < 12.087），約 0.5 秒就超過 200 個光子');
reset(); fire(12.75, 'gun'); say('hydrogen-spectrum-6', '射入 12.75 eV（或 λ = ' + r2(HC.HC_EV_NM / 12.7486) + ' nm），1 → 4；n = 4 時 12.7486 eV');
reset(); let rr = fire(13.6, 'gun'); say('hydrogen-spectrum-7', '射入 13.6 eV（K = ' + r4(rr.K) + ' eV），或 λ = 91.15 nm');
reset(); fire(r4(HC.transition(4, 2).E), 'gun'); tap(2); fire(r4(HC.transition(4, 2).E), 'gun'); say('hydrogen-spectrum-8', '射入 2.5497 eV（Hβ 486.27 nm）穿過基態；點 n = 2 後再射一次 → 2 → 4');
reset(); discharge(12.10, 3, 7); say('hydrogen-spectrum-9', '放電管 K = 12.100 eV（門檻 ' + r4(HC.energy(3) - HC.energy(1)) + ' eV）');
reset(); const d10 = discharge(13.28, 6, 9); say('hydrogen-spectrum-10', '放電管 K = 13.280 eV（範圍 13.221–13.320），6 秒內 Hδ ' + (d10.counts['6-2'] || 0) + ' 個');
reset(); const ladder = [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]].map(p => r4(HC.energy(p[1]) - HC.energy(p[0])));
ladder.forEach(E => fire(E, 'gun')); say('hydrogen-spectrum-11', '依序射入 ' + ladder.join('、') + ' eV');
// 用 13.6 eV 的課本值也做得到
fresh(); delete done['hydrogen-spectrum-11']; reset(); [10.2, 1.889, 0.661, 0.306, 0.166, 0.1].forEach(E => fire(E, 'gun')); say('hydrogen-spectrum-11', '（課本值 10.2、1.889、0.661、0.306、0.166、0.1 eV 也可以）');
const Kneed = HC.transition(3, 2).E - HC.ionizationEnergy(3);
reset(); fire(r3(HC.ionizationEnergy(1) + Kneed), 'gun'); tap(3); say('hydrogen-spectrum-12', '射入 ' + r3(HC.ionizationEnergy(1) + Kneed) + ' eV 游離基態（K = ' + r4(Kneed) + ' eV），再點 n = 3 → 復合光子 ' + r2(HC.recombination(r3(HC.ionizationEnergy(1) + Kneed) - HC.ionizationEnergy(1), 3).lambda) + ' nm');
[4, 5, 6, 7].forEach(m => { const k = HC.transition(3, 2).E - HC.ionizationEnergy(m); console.log('   另解：捕獲到 n = ' + m + '，需 K = ' + r4(k) + ' eV（射入 ' + r3(HC.ionizationEnergy(1) + k) + ' eV）'); });
reset(); tap(Infinity); fire(1.89, 'gun'); say('hydrogen-spectrum-h1', '游離後再射入任何光子（只剩質子，光子穿過）');
reset(); fire(r4(HC.energy(3) - HC.energy(1)), 'gun'); tap(1); say('hydrogen-spectrum-h2', '自己射入 12.0874 eV（1 → 3），再點 n = 1 放回同樣的光子');
reset(); discharge(9.5, 3, 11); say('hydrogen-spectrum-h3', '放電管 K = 9.5 eV（< 10.2 eV）跑 2.5 秒以上：1000 次撞擊、0 個光子');
console.log('完成', Object.keys(done).length, '/', list.length);
