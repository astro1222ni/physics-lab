/* 任務可達成的證明腳本。用法：node tools/mission-proofs/phase-diagram.js
 * 用化學核心的事件追蹤器（PDCore.tracker，頁面 js/phase-diagram.js 用的是同一個）模擬學生的操作：
 *   path(mode, 終點)：路徑按鈕「等壓加熱／等壓冷卻／等溫加壓／等溫減壓」（頁面每一幀一小段，追蹤器看到的相變與一次走完相同）
 *   slider(T 或 P)：拖滑桿或在數字上打字（改 T 是等壓加熱／冷卻、改 P 是等溫加壓／減壓），送 'state'
 *   drag(T, P)：在相圖上拖曳狀態點，送 'state'
 *   preset(物質, T, P)：換物質或按生活例子（瞬間移動，不送任何事件）
 * 證明：每個任務都做得到、預設狀態與只按生活例子不觸發任務、隱藏任務彼此不會順便完成。修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const PD = require(__ROOT + 'js/phase-diagram-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/phase-diagram.js');

const ATM = PD.ATM, S = PD.SUBS;
const K = c => c + 273.15;
let bad = 0;
const doneAll = {};

// ---------- 模擬頁面 ----------
function page(sub, T, P) {
  const p = { sub: sub || 'water', T: T == null ? 298.15 : T, P: P == null ? ATM : P, tr: PD.tracker(), acted: false, done: {}, log: [] };
  p.tr.teleport(p.sub, p.T, p.P);
  missions.forEach(m => { p.done[m.id] = false; });
  return p;
}
function emit(p, type, data) {
  if (!p.acted) return;
  const ev = { type, data };
  missions.forEach(m => { if (!p.done[m.id] && m.check(ev)) { p.done[m.id] = true; p.log.push(m.id); } });
}
function moveTo(p, T, P, mode, via) {
  p.acted = true;
  const r = p.tr.move(p.sub, { T: p.T, P: p.P }, { T, P }, mode);
  p.T = T; p.P = P;
  r.events.forEach(e => emit(p, e.type, e.data));
  if (via) emit(p, 'state', p.tr.state(p.sub, p.T, p.P, via));
  return r;
}
const path = (p, mode, v) => moveTo(p, mode === 'heat' || mode === 'cool' ? v : p.T, mode === 'press' || mode === 'depress' ? v : p.P, mode, 'path');
const sliderT = (p, T) => moveTo(p, T, p.P, T >= p.T ? 'heat' : 'cool', 'slider');
const sliderP = (p, P) => moveTo(p, p.T, P, P >= p.P ? 'press' : 'depress', 'slider');
const drag = (p, T, P) => moveTo(p, T, P, 'drag', 'drag');
function preset(p, sub, T, P) { p.acted = true; p.sub = sub; p.T = T; p.P = P; p.tr.teleport(sub, T, P); }

function report(name, p, ids, forbid) {
  const got = p.log.slice();
  const okIds = ids.every(id => got.includes(id));
  const hiddenGot = got.filter(id => /-h\d+$/.test(id));
  const wantHidden = ids.filter(id => /-h\d+$/.test(id));
  const extraHidden = hiddenGot.filter(id => !wantHidden.includes(id));
  const forb = (forbid || []).filter(id => got.includes(id));
  const ok = okIds && !extraHidden.length && !forb.length;
  ids.forEach(id => { if (got.includes(id)) doneAll[id] = true; });
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + name + '：' + (got.length ? got.join('、') : '（沒有任務）') +
    (extraHidden.length ? '　← 順便完成了別的隱藏任務：' + extraHidden.join('、') : '') + (forb.length ? '　← 不該完成：' + forb.join('、') : ''));
  if (!ok) bad++;
}
const kJ = x => (x / 1000).toFixed(2) + ' kJ/mol';
const pc = x => (x * 100).toFixed(2) + '%';

// ---------- 0. 預設狀態與只按生活例子 ----------
let p = page();
emit(p, 'state', p.tr.state(p.sub, p.T, p.P, 'load'));   // 沒操作：acted 為 false，不送
if (p.log.length) { console.log('  ✗ 預設狀態觸發了任務'); bad++; } else console.log('  ✓ 載入後不操作：沒有事件、沒有任務');
p = page();
[['water', K(25), ATM], ['co2', K(25), ATM], ['iodine', K(25), ATM], ['water', K(100), 2 * ATM], ['water', K(80), 0.612 * ATM], ['co2', K(-78.5), ATM],
  ['water', K(-1), ATM], ['iodine', K(80), ATM], ['co2', K(40), 200 * ATM], ['water', K(-20), 50]].forEach(e => preset(p, e[0], e[1], e[2]));
report('按遍生活例子與換物質（瞬間移動不送事件）', p, []);
// 只在預設的水（25 °C、1 atm）拖一下滑桿：液態水，不會完成任何任務
p = page(); sliderT(p, K(30)); sliderT(p, K(25)); sliderP(p, 1.5 * ATM); sliderP(p, ATM);
report('預設的水 25 °C、1 atm 附近動一動滑桿', p, []);

// ---------- 1. 一般任務 ----------
p = page('water', K(-20), ATM); path(p, 'heat', K(50));
report('水 −20 °C、1 atm 等壓加熱到 50 °C（0 °C 熔化）', p, ['phase-diagram-1']);
p = page('water', K(25), ATM); path(p, 'heat', K(150));
report('水 25 °C、1 atm 等壓加熱（100 °C 沸騰）', p, ['phase-diagram-2']);
p = page('co2', K(-100), ATM); path(p, 'heat', K(25));
report('CO2 −100 °C、1 atm 等壓加熱（−78.5 °C 昇華）', p, ['phase-diagram-3']);
p = page('water', K(25), 0.612 * ATM); path(p, 'heat', K(100));
report('玉山頂 0.612 atm 等壓加熱（' + (PD.Tboil('water', 0.612 * ATM) - 273.15).toFixed(1) + ' °C 沸騰）', p, ['phase-diagram-4']);
p = page('water', K(100), 2 * ATM); path(p, 'heat', K(150));
report('壓力鍋 2 atm 等壓加熱（' + (PD.Tboil('water', 2 * ATM) - 273.15).toFixed(1) + ' °C 沸騰）', p, ['phase-diagram-5']);
p = page('co2', K(25), ATM); sliderP(p, 70 * ATM);
report('CO2 25 °C 加壓到 70 atm（6.43 MPa 液化）', p, ['phase-diagram-6']);
p = page('iodine', K(25), ATM); path(p, 'heat', K(150));
report('碘 25 °C、1 atm 等壓加熱（113.6 °C 熔化）', p, ['phase-diagram-7']);
p = page('water', K(25), ATM); sliderT(p, K(0.01)); sliderP(p, 611.657);
report('水：打字 T = 0.01 °C、P = 0.611657 kPa（三相點）', p, ['phase-diagram-8'], ['phase-diagram-h5']);
p = page('co2', K(25), ATM); sliderT(p, K(-56.56)); sliderP(p, 517.95e3);
report('CO2：打字 T = −56.56 °C、P = 517.95 kPa（三相點；加壓時凝華成乾冰，h3 要在 1 atm 冷卻，不算）', p, ['phase-diagram-8'], ['phase-diagram-h3']);
p = page('water', K(-5), ATM); path(p, 'press', 1e8);
report('水 −5 °C 等溫加壓到 1000 atm（約 590 atm 熔化）', p, ['phase-diagram-9']);
// 兩點式：1 atm 與 2 atm 的沸點
p = page('water', K(25), ATM); path(p, 'heat', K(130)); preset(p, 'water', K(100), 2 * ATM); path(p, 'heat', K(150));
{ const q = p.tr.pair('water', 'vap'); report('水：1 atm 與 2 atm 的沸點，兩點式 ΔH = ' + kJ(q.dH) + '（' + pc(q.dH / 40.65e3 - 1) + '）', p, ['phase-diagram-2', 'phase-diagram-5', 'phase-diagram-10']); }
// 反例：壓力差不到 2 倍、或兩個沸點離 100 °C 太遠
p = page('water', K(25), 0.6 * ATM); path(p, 'heat', K(130)); preset(p, 'water', K(25), ATM); path(p, 'heat', K(130));
{ const q = p.tr.pair('water', 'vap'); report('反例：0.6 atm 與 1 atm（壓力比 1.67）ΔH = ' + kJ(q.dH) + '，不算任務 10', p, ['phase-diagram-2', 'phase-diagram-4'], ['phase-diagram-10']); }
p = page('water', K(10), 0.05 * ATM); path(p, 'heat', K(130)); preset(p, 'water', K(10), 0.2 * ATM); path(p, 'heat', K(130));
{ const q = p.tr.pair('water', 'vap'); report('反例：0.05 atm 與 0.2 atm（33 °C、60 °C）ΔH = ' + kJ(q.dH) + '（' + pc(q.dH / 40.65e3 - 1) + '，汽化熱隨溫度變），不算任務 10', p, ['phase-diagram-4'], ['phase-diagram-10']); }
// 繞過臨界點：CO2 液體 → 加熱到 40 °C（超臨界）→ 減壓到 30 atm（氣體）
p = page('co2', K(20), 80 * ATM); path(p, 'heat', K(40)); path(p, 'depress', 30 * ATM);
report('CO2 20 °C、80 atm 液體 → 等壓加熱到 40 °C → 等溫減壓到 30 atm', p, ['phase-diagram-11']);
p = page('co2', K(20), 80 * ATM); path(p, 'depress', 30 * ATM);
report('反例：直接減壓（會沸騰，不算任務 11）', p, [], ['phase-diagram-11']);
p = page('water', K(25), ATM); sliderT(p, K(373.95)); sliderP(p, 22064e3);
report('水：打字 T = 373.95 °C、P = 22064 kPa（臨界點）', p, ['phase-diagram-12'], ['phase-diagram-h9']);
p = page('water', K(25), ATM); drag(p, K(373.95), 22.3e6);
report('反例：拖到 22.3 MPa（壓力差 1.07%）不算臨界點', p, [], ['phase-diagram-12']);

// ---------- 2. 隱藏任務（每個都單獨做，且不順便完成其他隱藏任務） ----------
p = page('water', K(-30), 100); path(p, 'heat', K(20));
report('h1：水 −30 °C、100 Pa 等壓加熱（冰直接昇華：冷凍乾燥）', p, ['phase-diagram-h1']);
p = page('water', K(120), 3 * ATM); path(p, 'depress', 1 * ATM);
report('h2：水 120 °C、3 atm 等溫減壓（' + (PD.pvap('water', K(120)) / 1e3).toFixed(1) + ' kPa 突沸）', p, ['phase-diagram-h2']);
p = page('water', K(80), 2 * ATM); path(p, 'depress', 0.3 * ATM);
report('反例：80 °C 減壓沸騰（低於 105 °C，不算 h2）', p, [], ['phase-diagram-h2']);
p = page('water', K(100), 2 * ATM); preset(p, 'water', K(100), 2 * ATM); path(p, 'depress', 0.3 * ATM);
report('反例：生活例子「壓力鍋」（100 °C、2 atm）直接減壓，在 100 °C 沸騰（低於 105 °C，不算 h2）', p, [], ['phase-diagram-h2']);
p = page('co2', K(25), ATM); path(p, 'cool', K(-100));
report('h3：CO2 25 °C、1 atm 等壓冷卻（凝華成乾冰）', p, ['phase-diagram-h3']);
p = page('co2', K(-70), 5.5 * ATM); path(p, 'heat', K(0));
report('h4：CO2 −70 °C、5.5 atm 等壓加熱（剛過三相點就熔化，像密封吸管裡的乾冰）', p, ['phase-diagram-h4']);
p = page('water', K(10), 3.5e3); path(p, 'heat', K(50));
report('h5：水 3.5 kPa 等壓加熱（' + (PD.Tboil('water', 3.5e3) - 273.15).toFixed(1) + ' °C 沸騰）', p, ['phase-diagram-h5']);
p = page('water', K(25), 3.5e3); path(p, 'depress', 2.5e3);
report('h5 也可以減壓：水 25 °C 從 3.5 kPa 減到 2.5 kPa', p, ['phase-diagram-h5']);
p = page('co2', K(-52), 20 * ATM); path(p, 'press', 1e8);
report('h6：CO2 −52 °C 等溫加壓（先在 20 atm 是液體，約 ' + (PD.pmelt('co2', K(-52)) / 1e6).toFixed(1) + ' MPa 凝固）', p, ['phase-diagram-h6']);
p = page('iodine', K(120), ATM); path(p, 'press', 1e8);
report('h6 用碘也可以：120 °C 等溫加壓（約 ' + (PD.pmelt('iodine', K(120)) / 1e6).toFixed(1) + ' MPa 凝固）', p, ['phase-diagram-h6']);
p = page('water', K(-10), 1e4); path(p, 'depress', 1);
report('反例：冰減壓昇華（h1 要用加熱）', p, [], ['phase-diagram-h1']);
p = page('co2', K(25), 3 * ATM); path(p, 'cool', K(-100));
report('反例：CO2 在 3 atm 冷卻凝華（h3 要在 1 atm）', p, [], ['phase-diagram-h3']);
p = page('co2', K(-70), 30 * ATM); path(p, 'heat', K(0));
report('反例：CO2 在 30 atm 熔化（h4 要在 6 atm 以下）', p, [], ['phase-diagram-h4']);
p = page('co2', K(-40), 20 * ATM); path(p, 'press', 1e8);
report('反例：CO2 −40 °C 加壓到 84 MPa 才凝固（h6 的 CO2 要在 30 MPa 以內）', p, [], ['phase-diagram-h6']);
p = page('water', K(-5), 900 * ATM); path(p, 'depress', 10 * ATM);
report('h7：水 −5 °C、900 atm（液態）等溫減壓（約 590 atm 結冰）', p, ['phase-diagram-h7']);
// h8：對比狀態 Tr = 0.8、Pr = 0.2（液體區）
p = page('water', K(25), ATM);
sliderT(p, 0.8 * S.water.Tc); sliderP(p, 0.2 * S.water.pc);
preset(p, 'co2', K(25), ATM); sliderT(p, 0.8 * S.co2.Tc); sliderP(p, 0.2 * S.co2.pc);
report('h8：水在 T/Tc = 0.8、P/Pc = 0.2，再把 CO2 放在同樣的比例', p, ['phase-diagram-h8']);
p = page('water', K(25), ATM); sliderT(p, 0.8 * S.water.Tc); sliderP(p, 0.2 * S.water.pc);
preset(p, 'co2', K(25), ATM); sliderT(p, 0.8 * S.co2.Tc); sliderP(p, 0.22 * S.co2.pc);
report('反例：P/Pc 差 10% 不算 h8', p, [], ['phase-diagram-h8']);
// h9：三個臨界點（每一個先從 25 °C 慢慢走過去；h8 只在 T/Tc ≤ 0.95 才算，所以三個臨界點不會順便完成 h8）
p = page('water', K(25), ATM);
sliderP(p, 22064e3); sliderT(p, K(373.95));
preset(p, 'co2', K(25), ATM); sliderP(p, 7377.3e3); sliderT(p, 304.13);
preset(p, 'iodine', K(25), ATM); sliderT(p, K(545.85)); sliderP(p, 11700e3);
report('h9：水、CO2、碘的臨界點都到過', p, ['phase-diagram-12', 'phase-diagram-h9']);
// h10：碘在三相點附近量兩個昇華點與兩個沸點（四個點都在三相點 ±20 K 內）
p = page('iodine', K(60), 5e3); path(p, 'heat', K(130));        // 5 kPa 昇華（約 95 °C）
preset(p, 'iodine', K(60), 10e3); path(p, 'heat', K(130));      // 10 kPa 昇華（約 110 °C）
preset(p, 'iodine', K(100), 13e3); path(p, 'heat', K(160));     // 13 kPa 沸騰（約 115 °C）
preset(p, 'iodine', K(100), 22e3); path(p, 'heat', K(170));     // 22 kPa 沸騰（約 128 °C）
{
  const s = p.tr.pair('iodine', 'sub'), v = p.tr.pair('iodine', 'vap');
  report('h10：碘 5、10 kPa 昇華與 13、22 kPa 沸騰：ΔsubH = ' + kJ(s.dH) + '、ΔvapH = ' + kJ(v.dH) + '、相減 ' + kJ(s.dH - v.dH) + '（ΔfusH 15.52）', p, ['phase-diagram-h10']);
}
p = page('water', K(-40), 150); path(p, 'heat', K(-1)); preset(p, 'water', K(-40), 400); path(p, 'heat', K(-1));
preset(p, 'water', K(-2), 1.0e3); path(p, 'heat', K(30)); preset(p, 'water', K(-2), 2.0e3); path(p, 'heat', K(30));
{
  const s = p.tr.pair('water', 'sub'), v = p.tr.pair('water', 'vap');
  report('h10 用水也可以（但昇華會順便完成 h1）：ΔsubH − ΔvapH = ' + kJ(s.dH - v.dH) + '（ΔfusH 6.01）', p, ['phase-diagram-h1', 'phase-diagram-h10']);
}
p = page('water', K(5), 150); path(p, 'cool', K(-40));            // 凝華（約 −17 °C）
preset(p, 'water', K(5), 400); path(p, 'cool', K(-40));          // 凝華（約 −5 °C）
preset(p, 'water', K(-2), 1.0e3); path(p, 'heat', K(30)); preset(p, 'water', K(-2), 2.0e3); path(p, 'heat', K(30));
{
  const s = p.tr.pair('water', 'sub'), v = p.tr.pair('water', 'vap');
  report('h10 用水、只做凝華（不會完成 h1）：相減 ' + kJ(s.dH - v.dH), p, ['phase-diagram-h10'], ['phase-diagram-h1']);
}
// 反例：離三相點太遠
p = page('iodine', K(0), 10); path(p, 'heat', K(60)); preset(p, 'iodine', K(0), 30); path(p, 'heat', K(60));
preset(p, 'iodine', K(150), 50e3); path(p, 'heat', K(200)); preset(p, 'iodine', K(150), ATM); path(p, 'heat', K(200));
{ const s = p.tr.pair('iodine', 'sub'), v = p.tr.pair('iodine', 'vap'); report('反例：碘在 30 °C 附近昇華、170 °C 附近沸騰（離三相點太遠）：相減 ' + kJ(s.dH - v.dH), p, [], ['phase-diagram-h10']); }

// ---------- 3. 亂走：隨機拖曳 3000 步，看隱藏任務會不會被輕易碰到 ----------
{
  let seed = 1113;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const hit = {};
  for (let run = 0; run < 30; run++) {
    const sub = PD.ORDER[run % 3], s = S[sub];
    p = page(sub, K(25), ATM); p.acted = true;
    for (let k = 0; k < 100; k++) {
      const T = s.Tmin + (s.Tmax - s.Tmin) * rnd(), P = Math.exp(Math.log(s.Pmin) + Math.log(s.Pmax / s.Pmin) * rnd());
      drag(p, T, P);
    }
    p.log.forEach(id => { hit[id] = (hit[id] || 0) + 1; });
  }
  const hid = Object.keys(hit).filter(id => /-h\d+$/.test(id));
  console.log('  · 亂拖 30 輪 × 100 步：完成過的隱藏任務 ' + (hid.length ? hid.map(id => id.replace('phase-diagram-', '') + '×' + hit[id]).join('、') : '無') +
    '（隱藏任務都不接受拖曳造成的相變）');
  if (hid.length || hit['phase-diagram-12'] || hit['phase-diagram-8']) { console.log('  ✗ 亂拖不該完成隱藏任務、三相點、臨界點'); bad++; }
}

// ---------- 總結 ----------
const missing = missions.filter(m => !doneAll[m.id]).map(m => m.id);
const hidden = missions.filter(m => m.hidden);
const lv = hidden.map(m => m.level);
console.log('\n任務 ' + missions.length + ' 個（一般 ' + (missions.length - hidden.length) + '、隱藏 ' + hidden.length + '，隱藏等級 ' + lv.join('、') + '，7 級以上 ' + lv.filter(l => l >= 7).length + ' 個）');
if (hidden.some(m => !m.riddle || m.desc)) { console.log('✗ 隱藏任務要用 riddle、不可以有 desc'); bad++; }
if (missing.length) { console.log('✗ 沒有證明到：' + missing.join('、')); bad++; }
if (bad) { console.log('✗ 有 ' + bad + ' 項沒過'); process.exitCode = 1; } else console.log('✓ 全部任務都證明做得到，預設不觸發，隱藏任務各自獨立。');
