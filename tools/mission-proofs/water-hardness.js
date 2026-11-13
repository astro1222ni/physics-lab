/* 任務可達成的證明腳本。用法：node tools/mission-proofs/water-hardness.js
 * 用化學核心（js/water-hardness-core.js，頁面用的是同一套）模擬頁面的操作：
 *   工作台：選水樣（benchSet）、「煮沸 10 分鐘」「加洗滌鹼」「通過樹脂」「食鹽水再生」、肥皂試驗「加一滴」；
 *   滴定：錐形瓶裝燒杯裡的水（頁面的 titrWater）、「一滴」「半滴」「打開活栓」、「記錄終點」、未知水樣「核對答案」。
 * 確認每個任務都做得到、預設狀態不觸發任務、隱藏任務照各自的做法不會順便完成別的隱藏任務。修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(__ROOT + 'js/water-hardness-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/water-hardness.js');

const U = K.UNITS_PER_ML;
let bad = 0;
const done = {};

// ---------- 模擬頁面 ----------
function newPage(seed) {
  let s = seed || 7;
  const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const P = { B: K.createBench(), S: K.createSession(rng), o: { mode: 'A', mgEdta: false, Va: 50, cE: 0.01 }, meter: true, events: [] };
  K.newSample(P.S);
  newFlask(P);
  return P;
}
function fresh() { missions.forEach(m => { m.done = false; }); }
function emit(P, type, data) {
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev)) { m.done = true; P.events.push(m.id); } });
}
/** 頁面的 titrWater()：錐形瓶裝燒杯裡的水 */
function water(P) {
  const B = P.B, i = K.benchInfo(B), mys = B.preset === 'mys';
  return { Ca: i.c.Ca, Mg: i.c.Mg, H: i.H, Hca: i.Hca, preset: B.preset, bottle: B.bottle, step: mys ? 0 : B.step, boiled: mys ? 0 : B.boiled, unknown: mys };
}
function newFlask(P) { K.newRun(P.S, Object.assign({}, P.o, { water: water(P) })); }
/** 換水樣（燒杯裡的水換了，錐形瓶也跟著換一瓶） */
function preset(P, name, mg) {
  if (name === 'mys') K.benchSet(P.B, 'mys', P.S.sample);
  else K.benchSet(P.B, name, mg);
  newFlask(P);
}
function custom(P, Ca, Mg, HCO3) { preset(P, 'custom', { Ca: Ca, Mg: Mg, HCO3: HCO3, Na: 10 }); }
function set(P, o) { Object.assign(P.o, o); newFlask(P); }
function treat(P, kind, dose) {
  const d = kind === 'boil' ? K.benchBoil(P.B) : kind === 'soda' ? K.benchSoda(P.B, dose) : kind === 'resin' ? K.benchResin(P.B) : K.benchRegen(P.B);
  if (d) emit(P, 'treat', d);
  newFlask(P);
  return d;
}
function soap(P, n, det) { let d; for (let i = 0; i < n; i++) { d = K.benchSoap(P.B, !!det); emit(P, 'soap', d); } return d; }
function newTube(P, det) { P.B.tube = { drops: 0, detergent: !!det }; }
/** 「一滴」（n = 2）或「半滴」（n = 1）：落下後停下來 */
function drop(P, n) {
  const r = P.S.run;
  if (r.fill >= K.BURETTE_UNITS) r.fill = 0;   // 「補充滴定液」
  if (!K.release(P.S, n)) return false;
  K.land(P.S, n);
  emit(P, 'settle', K.settle(P.S, P.meter));
  return true;
}
/** 打開活栓流出 mL 後關上：每一滴落下、最後才停下來 */
function tap(P, mL) {
  const k = Math.round(mL * U / 2);
  for (let i = 0; i < k; i++) {
    if (P.S.run.fill >= K.BURETTE_UNITS) P.S.run.fill = 0;
    if (!K.release(P.S, 2)) break;
    K.land(P.S, 2);
  }
  emit(P, 'settle', K.settle(P.S, P.meter));
}
/** 流出到總量 V mL（先開活栓到 V − 0.5，再一滴一滴） */
function to(P, V) {
  const r = P.S.run, target = Math.round(V * U);
  if (target - r.out > 20) tap(P, (target - r.out - 20) / U);
  while (r.out < target) drop(P, Math.min(2, target - r.out));
}
/** 照學生的做法找終點：先快加到估計值前 0.5 mL，再一滴一滴到純藍色 */
function toBlue(P, Vguess) {
  const r = P.S.run;
  if (Vguess > 0.6) to(P, Vguess - 0.5);
  let guard = 0;
  while (!(r.eq.rf <= K.BLUE_RF) && guard++ < 4000) drop(P, 1);   // 最後半滴半滴加
}
function endpoint(P) { const d = K.endpoint(P.S, P.meter); emit(P, 'endpoint', d); return d; }
function answer(P, H, Hca) { const d = K.answer(P.S, H, Hca); emit(P, 'answer', d); return d; }
function report(name, P, ids, not) {
  const ok = ids.every(id => P.events.includes(id)) && !(not || []).some(id => P.events.includes(id));
  ids.forEach(id => { if (P.events.includes(id)) done[id] = true; });
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + name + '：' + (P.events.length ? P.events.join('、') : '（沒有任務）'));
  if (!ok) bad++;
}
function noHidden(name, P, allow) {
  const h = P.events.filter(id => /-h\d+$/.test(id) && !(allow || []).includes(id));
  if (h.length) { console.log('  ✗ ' + name + '順便完成了隱藏任務：' + h.join('、')); bad++; }
}
const f1 = x => x.toFixed(1), f2 = x => x.toFixed(2), f3 = x => x.toFixed(3);

console.log('水的硬度：任務證明');

// ---------- 1. 預設狀態 ----------
fresh();
let P = newPage();
if (P.events.length) { console.log('  ✗ 預設狀態觸發了任務：' + P.events.join('、')); bad++; }
else console.log('  ✓ 預設（自來水、pH 10＋EBT、50.00 mL、0.0100 M）只放著不觸發任務');
// 預設的自來水：加一滴肥皂、換試管
soap(P, 1);
if (P.events.length) { console.log('  ✗ 預設自來水加一滴肥皂不該完成任務：' + P.events.join('、')); bad++; } else console.log('  ✓ 預設自來水加一滴肥皂（沒有泡沫）不觸發任務');

// ---------- 2. 公開任務 ----------
fresh(); P = newPage();
preset(P, 'dist'); soap(P, 1);
report('蒸餾水一滴肥皂就有持久泡沫', P, ['water-hardness-1']);
noHidden('wh-1', P);

fresh(); P = newPage();
preset(P, 'ground'); const sg = soap(P, 6);
report('地下水（' + f1(K.benchInfo(P.B).H) + ' mg/L）加 6 滴肥皂：浮渣 ' + f2(sg.ppt) + ' µmol、沒有泡沫（要 ' + sg.need + ' 滴）', P, ['water-hardness-2']);
noHidden('wh-2', P);

fresh(); P = newPage();
preset(P, 'ground'); const b3 = treat(P, 'boil');
report('地下水煮沸：' + f1(b3.H0) + ' → ' + f1(b3.H) + ' mg/L，水垢 ' + f1(b3.dScale) + ' mg', P, ['water-hardness-3']);
noHidden('wh-3', P);

fresh(); P = newPage();
preset(P, 'ground'); const r4 = treat(P, 'resin');
report('地下水通過樹脂：' + f1(r4.H0) + ' → ' + f2(r4.H) + ' mg/L', P, ['water-hardness-4']);
noHidden('wh-4', P);

fresh(); P = newPage();
toBlue(P, P.S.run.Veq); const e5 = endpoint(P);
report('自來水 pH 10＋EBT：Veq ' + f3(e5.Veq) + ' mL、純藍色終點 ' + f3(e5.Vend) + '（誤差 ' + f3(e5.err) + '）→ ' + f1(e5.Hmeas) + ' mg/L', P, ['water-hardness-5']);
noHidden('wh-5', P);

fresh(); P = newPage();
const s6 = treat(P, 'soda', 200);
report('自來水加 200 mg/L 洗滌鹼：Ca ' + f1(s6.Ca0) + ' → ' + f2(s6.Ca) + '、Mg ' + f2(s6.Mg0) + ' → ' + f2(s6.Mg) + ' mg/L', P, ['water-hardness-6']);
noHidden('wh-6', P);

fresh(); P = newPage();
preset(P, 'mineral'); set(P, { mode: 'B' });
toBlue(P, P.S.run.Veq); const e7 = endpoint(P);
report('礦泉水 pH 12：Veq ' + f3(e7.Veq) + ' mL、終點 ' + f3(e7.Vend) + '（誤差 ' + f3(e7.err) + '）→ 鈣硬度 ' + f1(e7.Hmeas) + ' mg/L', P, ['water-hardness-7']);
noHidden('wh-7', P);

fresh(); P = newPage();
// 自來水 (Ca+Mg) = 1.2479 mmol/L：水樣 80.13 mL（打字輸入）、0.0100 M → Veq ≈ 10.00 mL
set(P, { Va: 80.13 });
toBlue(P, P.S.run.Veq); const e8 = endpoint(P);
report('自來水 80.13 mL：Veq ' + f3(e8.Veq) + ' mL、終點 ' + f3(e8.Vend), P, ['water-hardness-8']);
noHidden('wh-8', P);

fresh(); P = newPage();
preset(P, 'ground'); treat(P, 'resin');               // 用掉 3.40 mmol
preset(P, 'ground'); const r9a = treat(P, 'resin');   // 漏過
treat(P, 'regen');
preset(P, 'tap'); const r9 = treat(P, 'resin');
report('地下水兩杯讓樹脂漏過（剩 ' + f2(r9a.H) + ' mg/L）、再生、自來水 → ' + f2(r9.H) + ' mg/L', P, ['water-hardness-9'], []);
noHidden('wh-9', P, ['water-hardness-h4']);

// 未知水樣：多組亂數，每種模式只滴一瓶
{
  let ok10 = 0, ok11 = 0, ok12 = 0, worst = 0;
  const N = 30;
  for (let k = 0; k < N; k++) {
    fresh(); P = newPage(1000 + k * 37);
    preset(P, 'mys');
    set(P, { mode: 'A', Va: 100 });
    toBlue(P, P.S.sample.H / 100.09 / 1000 * 100 / 0.01 * 0.95);   // 學生先粗滴一瓶估計也可以；這裡用答案的 95% 當作開活栓的位置
    const ea = endpoint(P);
    set(P, { mode: 'B', Va: 100 });
    toBlue(P, P.S.sample.Hca / 100.09 / 1000 * 100 / 0.01 * 0.95);
    const eb = endpoint(P);
    const d = answer(P, ea.Hmeas, eb.Hmeas);
    worst = Math.max(worst, Math.abs(d.errH), Math.abs(d.errCa));
    if (P.events.includes('water-hardness-10')) ok10++;
    if (P.events.includes('water-hardness-11')) ok11++;
    if (P.events.includes('water-hardness-12')) ok12++;
    if (P.events.some(id => /-h\d+$/.test(id))) { console.log('  ✗ 未知水樣 ' + k + ' 順便完成了隱藏任務：' + P.events.join('、')); bad++; }
  }
  const ok = ok10 === N && ok11 === N && ok12 >= N * 0.9;
  console.log('  ' + (ok ? '✓' : '✗') + ' 未知水樣 ' + N + ' 組（水樣 100.00 mL，每種一瓶）：總硬度 2% 內 ' + ok10 + ' 組、兩個都 2% 內 ' + ok11 + ' 組、兩個都 1% 內 ' + ok12 + ' 組（最大誤差 ' + (worst * 100).toFixed(2) + '%）');
  if (ok) { done['water-hardness-10'] = done['water-hardness-11'] = done['water-hardness-12'] = true; } else bad++;
}
fresh(); P = newPage();
preset(P, 'mys'); P.S.sample.revealed = true;
answer(P, P.S.sample.H, P.S.sample.Hca);
if (P.events.length) { console.log('  ✗ 揭曉答案後不該完成任務'); bad++; } else console.log('  ✓ 揭曉答案後填正確答案不算任務');

// ---------- 3. 隱藏任務 ----------
fresh(); P = newPage();
custom(P, 160, 30, 200); newTube(P, true); soap(P, 1, true);
if (P.events.includes('water-hardness-h1')) { console.log('  ✗ 沒先用肥皂對照，不該完成 h1'); bad++; } else console.log('  ✓ 523 mg/L 直接用清潔劑起泡（沒先用肥皂）不算 h1');
fresh(); P = newPage();
custom(P, 160, 30, 200); newTube(P, false); soap(P, 10); newTube(P, true); soap(P, 1, true);
report('h1：Ca 160、Mg 30 mg/L（' + f1(K.benchInfo(P.B).H) + ' mg/L）肥皂 10 滴只有浮渣，換合成清潔劑一滴就有泡沫', P, ['water-hardness-h1', 'water-hardness-2']);
noHidden('h1 的做法', P, ['water-hardness-h1']);

fresh(); P = newPage();
custom(P, 80, 10, 0); const b2 = treat(P, 'boil');
report('h2：Ca 80、Mg 10、HCO3 0 mg/L 煮沸：' + f1(b2.H0) + ' → ' + f1(b2.H) + ' mg/L', P, ['water-hardness-h2']);
noHidden('h2 的做法', P, ['water-hardness-h2']);

fresh(); P = newPage();
custom(P, 0, 30, 100); set(P, { mode: 'B' });
drop(P, 2); const e3 = endpoint(P);
report('h3：只有 Mg 30 mg/L 的水在 pH 12：第一滴就是' + (e3.blue ? '純藍色' : '?') + '，終點 ' + f2(e3.Vend) + ' mL', P, ['water-hardness-h3']);
noHidden('h3 的做法', P, ['water-hardness-h3']);

fresh(); P = newPage();
preset(P, 'mineral'); treat(P, 'resin');
preset(P, 'mineral'); const r4h = treat(P, 'resin');
report('h4：兩杯礦泉水通過樹脂，第二杯容量用完：Ca ' + f2(r4h.Ca) + '、Mg ' + f2(r4h.Mg) + ' mg/L', P, ['water-hardness-h4']);
noHidden('h4 的做法', P, ['water-hardness-h4']);

fresh(); P = newPage();
custom(P, 80, 0, 200);   // 純 Ca 2.00 mmol/L，50 mL → Veq 10.0 mL
let r = P.S.run;
to(P, 9.5);
const e5h = endpoint(P);
report('h5：純 Ca、沒有 Mg–EDTA，Veq ' + f2(r.Veq) + ' mL，在 9.50 mL（指示劑結合 ' + (e5h.rf * 100).toFixed(0) + '%，紫色）就記錄', P, ['water-hardness-h5']);
noHidden('h5 的做法', P, ['water-hardness-h5']);

fresh(); P = newPage();
custom(P, 80, 0, 200); set(P, { mgEdta: true });
r = P.S.run; toBlue(P, r.Veq); const e6h = endpoint(P);
report('h6：純 Ca＋Mg–EDTA：純藍色在 ' + f3(e6h.Vend) + ' mL（誤差 ' + f3(e6h.err) + '）', P, ['water-hardness-h6']);
noHidden('h6 的做法', P, ['water-hardness-h6']);

fresh(); P = newPage();
// 真正的 H ≈ 298.3：純藍色的終點比當量點多約 0.05 mL，算出約 300 mg/L
custom(P, 80, 23.9, 300);
r = P.S.run; toBlue(P, r.Veq); const e7h = endpoint(P);
report('h7：Ca 80、Mg 23.9 mg/L（' + f1(r.p.water.H) + ' mg/L）：終點算出 ' + f1(e7h.Hmeas) + ' mg/L', P, ['water-hardness-h7']);
noHidden('h7 的做法', P, ['water-hardness-h7']);

fresh(); P = newPage();
custom(P, 10, 50, 500); const b8 = treat(P, 'boil');
report('h8：Ca 10、Mg 50、HCO3 500 mg/L 煮沸：Mg ' + f1(b8.Mg0) + ' → ' + f2(b8.Mg) + ' mg/L', P, ['water-hardness-h8']);
noHidden('h8 的做法', P, ['water-hardness-h8']);

fresh(); P = newPage();
// 自來水 Ca 36 mg/L = 0.8982 mmol/L → Na2CO3 95.2 mg/L
const dose9 = Math.round(36 / 40.078 * 105.99 * 10) / 10;
const s9 = treat(P, 'soda', dose9);
report('h9：自來水加 ' + dose9 + ' mg/L 洗滌鹼（' + f3(s9.add) + ' mmol 對 Ca ' + f3(s9.nCa0) + ' mmol）：Ca 剩 ' + f2(s9.Ca) + ' mg/L', P, ['water-hardness-h9']);
noHidden('h9 的做法', P, ['water-hardness-h9']);

fresh(); P = newPage();
preset(P, 'ground');
r = P.S.run; toBlue(P, r.Veq); const e10a = endpoint(P);
treat(P, 'boil');
r = P.S.run; toBlue(P, r.Veq); const e10b = endpoint(P);
report('h10：地下水煮沸前 ' + f1(e10a.Hmeas) + '、煮沸後 ' + f1(e10b.Hmeas) + ' mg/L', P, ['water-hardness-h10']);
noHidden('h10 的做法', P, ['water-hardness-h10']);

// ---------- 4. 反例 ----------
fresh(); P = newPage();
preset(P, 'ground'); newTube(P, true); soap(P, 1, true);
if (P.events.includes('water-hardness-h1')) { console.log('  ✗ 地下水（340 mg/L）用清潔劑不該完成 h1'); bad++; } else console.log('  ✓ 地下水（340 mg/L）用清潔劑起泡（' + (P.events.join('、') || '沒有任務') + '）不算 h1');
fresh(); P = newPage();
preset(P, 'tap'); treat(P, 'boil'); treat(P, 'boil'); treat(P, 'boil');
if (P.events.some(id => /-h\d+$/.test(id))) { console.log('  ✗ 自來水連煮三次不該完成隱藏任務：' + P.events.join('、')); bad++; } else console.log('  ✓ 自來水連煮三次（' + (P.events.join('、') || '沒有任務') + '）不完成隱藏任務');
fresh(); P = newPage();
preset(P, 'ground'); treat(P, 'resin'); treat(P, 'resin');
if (P.events.includes('water-hardness-h4')) { console.log('  ✗ 同一杯地下水通過兩次不該完成 h4'); bad++; } else console.log('  ✓ 同一杯地下水通過樹脂兩次（' + (P.events.join('、') || '沒有任務') + '）不算 h4');
fresh(); P = newPage();
preset(P, 'ground'); treat(P, 'resin'); preset(P, 'ground'); const rg = treat(P, 'resin');
if (P.events.includes('water-hardness-h4')) { console.log('  ✗ 第二杯地下水（Ca 也漏）不該完成 h4'); bad++; } else console.log('  ✓ 第二杯地下水讓樹脂用完：Ca 也漏出 ' + f1(rg.Ca) + ' mg/L，不算 h4');
fresh(); P = newPage();
custom(P, 80, 0, 200); r = P.S.run; toBlue(P, r.Veq); endpoint(P);
if (P.events.includes('water-hardness-h5') || P.events.includes('water-hardness-h6')) { console.log('  ✗ 純 Ca 等到純藍色才記錄不該完成 h5／h6'); bad++; } else console.log('  ✓ 純 Ca 沒有 Mg–EDTA、等到純藍色（' + f3(r.endpoint) + ' mL）才記錄（' + (P.events.join('、') || '沒有任務') + '）不算 h5、h6');
fresh(); P = newPage();
preset(P, 'tap'); set(P, { mgEdta: true }); r = P.S.run; toBlue(P, r.Veq); endpoint(P);
if (P.events.includes('water-hardness-h6')) { console.log('  ✗ 有 Mg 的自來水加 Mg–EDTA 不該完成 h6'); bad++; } else console.log('  ✓ 自來水加 Mg–EDTA（' + (P.events.join('、') || '沒有任務') + '）不算 h6');
fresh(); P = newPage();
preset(P, 'tap'); treat(P, 'soda', 600);
if (P.events.includes('water-hardness-h9')) { console.log('  ✗ 洗滌鹼過量不該完成 h9'); bad++; } else console.log('  ✓ 自來水加 600 mg/L 洗滌鹼（' + (P.events.join('、') || '沒有任務') + '）不算 h9');
fresh(); P = newPage();
preset(P, 'ground'); r = P.S.run; toBlue(P, r.Veq); endpoint(P);
preset(P, 'ground'); treat(P, 'boil'); r = P.S.run; toBlue(P, r.Veq); endpoint(P);
if (P.events.includes('water-hardness-h10')) { console.log('  ✗ 兩杯不同的水不該完成 h10'); bad++; } else console.log('  ✓ 煮沸前後量的是不同杯的地下水（' + (P.events.join('、') || '沒有任務') + '）不算 h10');
fresh(); P = newPage();
to(P, 30);
if (P.events.some(id => /-h\d+$/.test(id))) { console.log('  ✗ 預設一路加到 30 mL 不該完成隱藏任務：' + P.events.join('、')); bad++; } else console.log('  ✓ 預設一路加到 30 mL（' + (P.events.join('、') || '沒有任務') + '）不完成隱藏任務');
fresh(); P = newPage();
['dist', 'soft', 'tap', 'ground', 'mineral'].forEach(function (name) {
  preset(P, name); soap(P, 20); newTube(P, true); soap(P, 3, true); newTube(P, false);
  set(P, { mode: 'A' }); r = P.S.run; toBlue(P, r.Veq); endpoint(P);
  set(P, { mode: 'B' }); r = P.S.run; toBlue(P, r.Veq); endpoint(P);
  set(P, { mode: 'A' });
  treat(P, 'boil'); treat(P, 'soda', 200); treat(P, 'resin');
});
if (P.events.some(id => /-h\d+$/.test(id))) { console.log('  ✗ 五種預設水樣照一般做法走一遍不該完成隱藏任務：' + P.events.join('、')); bad++; } else console.log('  ✓ 五種預設水樣各做肥皂、清潔劑、兩種滴定、三種軟化（' + P.events.join('、') + '）不完成隱藏任務');

// ---------- 總結 ----------
const missing = missions.filter(m => !done[m.id]).map(m => m.id);
console.log(missing.length ? '  ✗ 沒有證明到的任務：' + missing.join('、') : '  ✓ ' + missions.length + ' 個任務都證明做得到');
if (missing.length) bad++;
const lv = missions.filter(m => m.hidden).map(m => m.level);
if (lv.length !== 10 || lv.filter(x => x >= 7).length < 3 || Math.min.apply(null, lv) < 3) { console.log('  ✗ 隱藏任務的數量或等級不合規定'); bad++; }
missions.filter(m => m.hidden).forEach(m => { if (!m.riddle || !m.riddle.zh || !m.riddle.en) { console.log('  ✗ ' + m.id + ' 沒有 riddle'); bad++; } });
console.log('    （公開 ' + missions.filter(m => !m.hidden).length + ' 個 ' + missions.filter(m => !m.hidden).reduce((a, m) => a + m.level, 0) + ' 顆星、隱藏 10 個 ' + missions.filter(m => m.hidden).reduce((a, m) => a + m.level * 2, 0) + ' 顆星）');
if (bad) { console.log('失敗 ' + bad + ' 項'); process.exitCode = 1; }
