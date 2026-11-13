/* 任務可達成的證明腳本。用法：node tools/mission-proofs/solution-concentration.js
 * 用化學核心模擬頁面（js/solution-concentration.js）的按鈕：秤量（質量欄可打到 0.001 g）、溶解、冷卻、移入量瓶、洗燒杯、
 * 加水到瓶頸、洗瓶 +1 mL、滴管 +1 滴、吸出多餘、蓋塞搖勻、完成；稀釋模式的吸量管（體積打到 0.01 mL）；濃度換算的滑桿（0.01%）。
 * 「完成」送出 'made'（內容由核心的 madeEvent 產生，和頁面相同），換算滑桿送出 'convert'。
 * 確認：每個任務都做得到、頁面預設狀態不觸發任務、每個隱藏任務的做法不會順便完成另一個隱藏任務；
 * 最後用固定亂數種子模擬大量亂按，統計隱藏任務被意外完成的次數。修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const S = require(__ROOT + 'js/solution-concentration-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/solution-concentration.js');

let bad = 0;
const done = {};
const hiddenIds = missions.filter(m => m.hidden).map(m => m.id);

// ---------- 模擬頁面 ----------
function newPage() {
  missions.forEach(m => { m.done = false; m.mem = {}; });
  return { events: [], seq: 0, last: null, eye: 0, rinsedPip: true };
}
function emit(G, type, data) {
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev, m.mem)) { m.done = true; G.events.push(m.id); } });
}
/** 新的一瓶：o 同 SolCore.newPrep；稀釋用 stockKey（'Cu1'／'Na2'／'OH1'／'last'） */
function bottle(G, o) {
  o = Object.assign({ Vf: 100, target: 0.1 }, o);
  if (o.mode === 'dilute') {
    if (o.stockKey === 'last') o.stock = { sp: G.last.sp, c: G.last.C, chain: G.last.chain };
    else o.stock = Object.assign({ chain: 0 }, S.STOCKS[o.stockKey]);
  }
  if (o.mass != null) o.mass = Math.round(o.mass * 1000) / 1000;
  G.P = S.newPrep(o); G.o = o;
  return G.P;
}
const drop = (G) => S.addWater(G.P, S.DROP, G.eye);
/** 一滴一滴加到「看起來」對齊（看起來的位置在 ±半滴內） */
function fillToMark(G) {
  S.pourToNeck(G.P, G.eye);
  const half = S.DROP * 1000 / (Math.PI * G.P.g.rn * G.P.g.rn) / 2;
  let k = 0;
  while (S.apparent(G.P, G.eye) < -half && k < 2000) { drop(G); k++; }
  return k;
}
function finish(G) {
  if (!G.P.shaken) S.shake(G.P);
  const info = { stock: G.o.mode === 'dilute' ? G.o.stockKey : null, chain: G.o.mode === 'dilute' ? (G.o.stock.chain || 0) + 1 : 0, seq: ++G.seq };
  const d = S.madeEvent(G.P, info);
  emit(G, 'made', d);
  G.last = { sp: G.P.sp, C: d.C, chain: info.chain };
  return d;
}
/** 正確的秤量配製：溶解 → 冷卻 → 移入 → 洗 rinses 次 → 平視定容 → 搖勻 → 完成 */
function weigh(G, solid, mass, Vf, opt) {
  opt = opt || {};
  bottle(G, { mode: 'weigh', solid, mass, Vf, target: opt.target || 0.1, flaskWet: !!opt.wet });
  const r = S.dissolve(G.P); if (!r.ok) throw new Error('溶解失敗 ' + r.why);
  if (!opt.hot) S.cool(G.P);
  S.transfer(G.P);
  for (let i = 0; i < (opt.rinses == null ? 3 : opt.rinses); i++) S.rinse(G.P);
  G.eye = opt.eye || 0;
  fillToMark(G);
  if (opt.before) opt.before(G);
  return finish(G);
}
function dilute(G, stockKey, V1, Vf, opt) {
  opt = opt || {};
  bottle(G, { mode: 'dilute', stockKey, Vf, target: opt.target || 0.1, flaskWet: !!opt.wet });
  S.pipette(G.P, Math.round(V1 * 100) / 100, opt.unrinsed ? false : true);
  G.eye = opt.eye || 0;
  fillToMark(G);
  return finish(G);
}
function convert(G, sp, wPct) {
  const w = Math.round(wPct * 100) / 1e4, p = S.props(sp, w);
  emit(G, 'convert', { sp, w, C: p.C, m: p.m, x: p.x, ppm: p.ppm });
  return p;
}
const pc = x => (x >= 0 ? '+' : '') + (x * 100).toFixed(3) + '%';
function report(name, G, ids, hiddenOnly) {
  const ok = ids.every(id => G.events.includes(id));
  ids.forEach(id => { if (G.events.includes(id)) done[id] = true; });
  // 隱藏任務彼此不連帶：這個做法只能完成它要證明的那一個隱藏任務
  const extraHidden = G.events.filter(id => hiddenIds.includes(id) && !ids.includes(id));
  const indep = !hiddenOnly || extraHidden.length === 0;
  console.log('  ' + (ok && indep ? '✓' : '✗') + ' ' + name + '：' + (G.events.length ? G.events.join('、') : '（沒有任務）') +
    (indep ? '' : '　← 順便完成了 ' + extraHidden.join('、')));
  if (!ok || !indep) bad++;
}
/** 在 [lo, hi] 內以 step 為格子找使 f 最接近 0 的值 */
function scan(lo, hi, step, f) {
  let best = null, bv = Infinity;
  for (let x = lo; x <= hi + 1e-9; x += step) { const v = Math.abs(f(x)); if (v < bv) { bv = v; best = Math.round(x / step) * step; } }
  return best;
}

console.log('一、預設狀態');
{
  // 頁面沒操作時不送任何事件（js/solution-concentration.js 的 userActed 把關），所以任務不可能完成。
  // 再確認：頁面的預設設定（五水硫酸銅 1.000 g、100 mL、目標 0.100 M、平視）照步驟按一遍，以及換算模式的預設（NaCl 5.00%），都不完成隱藏任務。
  const G = newPage();
  weigh(G, 'CuSO4-5H2O', 1.000, 100, { rinses: 0 });
  dilute(G, 'Cu1', 5.00, 100);
  convert(G, 'NaCl', 5.00);
  const hid = G.events.filter(id => hiddenIds.includes(id));
  const pub = G.events.filter(id => !hiddenIds.includes(id) && id !== 'solution-concentration-1');
  if (hid.length || pub.length) { console.log('  ✗ 預設設定完成了：' + G.events.join('、')); bad++; }
  else console.log('  ✓ 預設設定照步驟按一遍只完成任務 1（第一瓶），換算預設值不完成任務');
}

console.log('二、一般任務');
{
  let G = newPage();
  let d = weigh(G, 'NaCl', 0.1 * 0.1 * 58.44, 100);
  report('NaCl 0.584 g → 100 mL：' + d.C.toFixed(5) + ' M', G, ['solution-concentration-1', 'solution-concentration-2']);
  G = newPage();
  d = weigh(G, 'CuSO4-5H2O', 2.497, 100);
  report('CuSO4·5H2O 2.497 g → 100 mL：' + d.C.toFixed(5) + ' M（' + pc(d.eTotal) + '）', G, ['solution-concentration-3']);
  G = newPage();
  d = dilute(G, 'Cu1', 10.00, 100);
  report('1.00 M 原液 10.00 mL → 100 mL：' + d.C.toFixed(5) + ' M', G, ['solution-concentration-4']);
  G = newPage();
  const w5 = scan(5, 6.5, 0.01, w => S.props('NaCl', w / 100).C - 1);
  let p = convert(G, 'NaCl', w5);
  report('換算：NaCl ' + w5.toFixed(2) + '% → ' + p.C.toFixed(4) + ' M', G, ['solution-concentration-5']);
  G = newPage();
  d = weigh(G, 'NaCl', 0.584, 100, { eye: 20 });
  report('俯視 20° 定容（看起來對齊 ' + d.appFill.toFixed(2) + ' mm）：定容誤差 ' + pc(d.eLevel), G, ['solution-concentration-6']);
  G = newPage();
  d = weigh(G, 'NaOH', 2.000, 250, { rinses: 1, hot: true, target: 0.2 });
  report('NaOH 2.000 g → 250 mL（洗 1 次、沒冷卻）：' + d.C.toFixed(5) + ' M（' + pc(d.eTotal) + '）', G, ['solution-concentration-7']);
  // 10 ppm 銅：1.00 M 原液 10.00 mL → 500 mL（0.0200 M），再吸 V mL → 500 mL
  G = newPage();
  dilute(G, 'Cu1', 10.00, 500, { target: 0.02 });
  const c1 = G.last.C;
  const V8 = scan(0.1, 50, 0.01, V => (c1 * V / 500) * 1000 * S.M_CU / S.RHO_W - 10);
  d = dilute(G, 'last', V8, 500, { target: 1.574e-4 });
  report('連續稀釋：10.00 mL → 500 mL、再 ' + V8.toFixed(2) + ' mL → 500 mL：' + d.ppmCu.toFixed(3) + ' ppm', G, ['solution-concentration-8']);
  G = newPage();
  d = weigh(G, 'CuSO4-5H2O', 6.242, 500, { target: 0.05 });
  report('CuSO4·5H2O 6.242 g → 500 mL（洗 3 次）：' + d.C.toFixed(6) + ' M（' + pc(d.eTotal) + '）', G, ['solution-concentration-9']);
  // 10.0% NaOH：100 mL 溶液 = ρ(10%) × 100 = 110.89 g，NaOH = 11.089 g；要冷卻
  G = newPage();
  const m10 = Math.round(0.1 * S.rho('NaOH', 0.1) * 100 * 1000) / 1000;
  d = weigh(G, 'NaOH', m10, 100, { target: 2.772 });
  report('NaOH ' + m10.toFixed(3) + ' g → 100 mL（冷卻、洗 3 次）：' + (d.w * 100).toFixed(3) + '%', G, ['solution-concentration-10']);
}

console.log('三、隱藏任務（每個做法只能完成它自己的隱藏任務）');
{
  let G = newPage();
  let d = weigh(G, 'CuSO4-5H2O', 2.497, 100, { wet: true });
  report('h1 量瓶裡原本有水、其餘正確：' + pc(d.eTotal), G, ['solution-concentration-h1'], true);

  // 3.50% 食鹽水：100 mL 量瓶，溶液 ρ(3.5%)×100 g
  G = newPage();
  const ms = Math.round(0.035 * S.rho('NaCl', 0.035) * 100 * 1000) / 1000;
  d = weigh(G, 'NaCl', ms, 100);
  report('h2 NaCl ' + ms.toFixed(3) + ' g → 100 mL：' + (d.w * 100).toFixed(3) + '%', G, ['solution-concentration-h2'], true);

  G = newPage();
  bottle(G, { mode: 'weigh', solid: 'NaCl', mass: 0.584, Vf: 100, target: 0.1 });
  S.dissolve(G.P); S.cool(G.P); S.transfer(G.P); S.rinse(G.P); S.rinse(G.P); S.rinse(G.P);
  G.eye = 0; fillToMark(G);
  S.addWater(G.P, S.SQUIRT, 0);              // 洗瓶多擠了 1 mL，加過頭
  S.drawOut(G.P, 0);                          // 用滴管吸回刻度線
  d = finish(G);
  report('h3 加過頭 1 mL 再吸出：定容誤差 ' + pc(d.eLevel), G, ['solution-concentration-h3'], true);

  G = newPage();
  weigh(G, 'CuSO4-5H2O', 2.497, 100);
  d = weigh(G, 'CuSO4', 1.596, 100);
  report('h4 五水 2.497 g 與無水 1.596 g 各配 100 mL：' + G.last.C.toFixed(5) + ' M', G, ['solution-concentration-h4'], true);

  // m = M：先在換算找出 ρ(1 − w) = 1 的組成（NaOH 約 7.9%），再用 100 mL 量瓶配：NaOH = w·ρ·100 g
  G = newPage();
  const w5 = scan(7, 9, 0.01, w => S.props('NaOH', w / 100).m / S.props('NaOH', w / 100).C - 1) / 100;
  const m5 = Math.round(w5 * S.rho('NaOH', w5) * 100 * 1000) / 1000;
  d = weigh(G, 'NaOH', m5, 100, { target: 2.15 });
  report('h5 換算找到 NaOH ' + (w5 * 100).toFixed(2) + '%，秤 ' + m5.toFixed(3) + ' g → 100 mL（冷卻）：M = ' + d.C.toFixed(4) + '、m = ' + d.molal.toFixed(4), G, ['solution-concentration-h5'], true);

  G = newPage();
  dilute(G, 'Cu1', 1.00, 500, { target: 0.002 });
  dilute(G, 'last', 1.00, 500, { target: 4e-6 });
  d = dilute(G, 'last', 1.00, 100, { target: 4e-8 });
  report('h6 連續稀釋三次（1 → 500、1 → 500、1 → 100 mL）：' + d.ppmCu.toFixed(4) + ' ppm', G, ['solution-concentration-h6'], true);

  // 1.000 mol/kg NaCl：w = 58.44/1058.44，100 mL 溶液 ρ·100 g，NaCl = w·ρ·100（秤到 0.001 g）
  G = newPage();
  const wm = S.wFromMolal('NaCl', 1), mm = Math.round(wm * S.rho('NaCl', wm) * 100 * 1000) / 1000;
  d = weigh(G, 'NaCl', mm, 100, { target: 0.98 });
  report('h7 NaCl ' + mm.toFixed(3) + ' g → 100 mL：' + d.molal.toFixed(4) + ' mol/kg', G, ['solution-concentration-h7'], true);

  // 兩個錯誤抵消：沒洗燒杯（約 −2.5%），故意多秤一點補回來
  G = newPage();
  const tgt = 0.1, Vf = 100, M = 249.68;
  const base = weigh(newPage(), 'CuSO4-5H2O', tgt * Vf / 1000 * M, Vf, { rinses: 0, target: tgt });
  const m8 = Math.round(tgt * Vf / 1000 * M / (1 + base.eProc) * 1000) / 1000;
  d = weigh(G, 'CuSO4-5H2O', m8, Vf, { rinses: 0, target: tgt });
  report('h8 沒洗燒杯（' + pc(d.eLoss) + '）＋多秤到 ' + m8.toFixed(3) + ' g（' + pc(d.eAmount) + '）：總誤差 ' + pc(d.eTotal), G, ['solution-concentration-h8'], true);

  G = newPage();
  d = weigh(G, 'NaCl', 0.900, 100, { target: 0.154 });
  report('h9 NaCl 0.900 g → 100 mL：' + d.gL.toFixed(3) + ' g/L', G, ['solution-concentration-h9'], true);

  G = newPage();
  d = weigh(G, 'NaOH', 6.000, 100, { hot: true, target: 1.5 });
  report('h10 NaOH 6.000 g 溶解後不冷卻就定容（' + d.Tfill.toFixed(1) + ' °C）：溫度誤差 ' + pc(d.eTemp), G, ['solution-concentration-h10'], true);
}

console.log('四、反例（不該完成）');
{
  let G = newPage();
  let d = weigh(G, 'CuSO4-5H2O', 1.596, 100);
  const ok1 = !G.events.includes('solution-concentration-3');
  console.log('  ' + (ok1 ? '✓' : '✗') + ' 五水硫酸銅用無水的莫耳質量算（1.596 g）：' + d.C.toFixed(4) + ' M，不算任務 3');
  if (!ok1) bad++;
  G = newPage();
  d = weigh(G, 'NaCl', 0.584, 100, { eye: -20 });
  const ok2 = !G.events.includes('solution-concentration-6');
  console.log('  ' + (ok2 ? '✓' : '✗') + ' 仰視定容（偏低 ' + pc(d.eLevel) + '）不算任務 6');
  if (!ok2) bad++;
  G = newPage();
  bottle(G, { mode: 'weigh', solid: 'NaCl', mass: 0.584, Vf: 100 });
  S.dissolve(G.P); S.cool(G.P); S.transfer(G.P); S.rinse(G.P); S.rinse(G.P); S.rinse(G.P); fillToMark(G);
  S.shake(G.P); fillToMark(G); d = finish(G);
  const ok3 = !G.events.includes('solution-concentration-h8') && d.eAfter < -0.001;
  console.log('  ' + (ok3 ? '✓' : '✗') + ' 搖勻後又補水到刻度線（' + pc(d.eAfter) + '）只有一個錯誤，不算 h8');
  if (!ok3) bad++;
  G = newPage();
  weigh(G, 'CuSO4-5H2O', 2.497, 100); weigh(G, 'CuSO4-5H2O', 2.497, 100);
  const ok4 = !G.events.includes('solution-concentration-h4');
  console.log('  ' + (ok4 ? '✓' : '✗') + ' 兩瓶都用五水硫酸銅、濃度相同：不算 h4');
  if (!ok4) bad++;
}

console.log('五、亂按模擬（固定種子，每局 60 個隨機操作，滑桿取隨機值）');
{
  let seed = 1113;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const count = {};
  const N = 3000;
  for (let ep = 0; ep < N; ep++) {
    const G = newPage();
    let o = { mode: 'weigh', solid: 'CuSO4-5H2O', mass: 1, Vf: 100, target: 0.1, flaskWet: false, stockKey: 'Cu1' };
    let V1 = 5;
    const fresh = () => bottle(G, Object.assign({}, o));
    fresh();
    for (let k = 0; k < 60; k++) {
      const a = Math.floor(rnd() * 17);
      const P = G.P;
      if (a === 0) { o.mode = pick(['weigh', 'dilute']); fresh(); }
      else if (a === 1) { o.solid = pick(['CuSO4-5H2O', 'CuSO4', 'NaCl', 'NaOH']); fresh(); }
      else if (a === 2) { o.mass = Math.round(rnd() * 60 * 100) / 100; fresh(); }
      else if (a === 3) { o.Vf = pick([50, 100, 250, 500]); fresh(); }
      else if (a === 4) { o.target = Math.pow(10, -6 + rnd() * 6.3); fresh(); }
      else if (a === 5) { o.flaskWet = !o.flaskWet; fresh(); }
      else if (a === 6) { o.stockKey = pick(['Cu1', 'Na2', 'OH1'].concat(G.last ? ['last'] : [])); if (o.mode === 'dilute') fresh(); }
      else if (a === 7) { G.eye = Math.round(-30 + rnd() * 60); }
      else if (a === 8) { V1 = Math.round((0.1 + rnd() * 49.9) * 100) / 100; }
      else if (a === 9) { if (P.mode === 'weigh') { S.dissolve(P); } else S.pipette(P, V1, rnd() < 0.5); }
      else if (a === 10) S.cool(P);
      else if (a === 11) { S.transfer(P); }
      else if (a === 12) S.rinse(P);
      else if (a === 13) S.pourToNeck(P, G.eye);
      else if (a === 14) S.addWater(P, rnd() < 0.5 ? S.SQUIRT : S.DROP, G.eye);
      else if (a === 15) S.drawOut(P, G.eye);
      else if (a === 16) { if (P.shaken) { finish(G); fresh(); } else S.shake(P); }
      if (rnd() < 0.05) convert(G, pick(['NaCl', 'NaOH', 'CuSO4']), Math.round(rnd() * 2640) / 100);
    }
    G.events.forEach(id => { count[id] = (count[id] || 0) + 1; });
  }
  const hid = hiddenIds.filter(id => count[id]);
  console.log('  ' + N + ' 局中，一般任務被亂按完成的局數：' + missions.filter(m => !m.hidden && count[m.id]).map(m => m.id.replace('solution-concentration-', '#') + ' ' + count[m.id]).join('、'));
  console.log('  ' + (hid.length ? '△' : '✓') + ' 隱藏任務被亂按完成：' + (hid.length ? hid.map(id => id.replace('solution-concentration-', '') + ' ' + count[id] + ' 局').join('、') : '0'));
}

const missing = missions.filter(m => !done[m.id]).map(m => m.id);
console.log('\n' + (missing.length ? '✗ 沒有證明到：' + missing.join('、') : '✓ 全部 ' + missions.length + ' 個任務都證明做得到'));
if (missing.length) bad++;
if (bad) { console.log('✗ 有 ' + bad + ' 項沒通過'); process.exitCode = 1; }
else console.log('✓ 全部通過');
