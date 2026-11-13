/* 任務可達成的證明腳本。用法：node tools/mission-proofs/blackbody.js
 * 用真正的任務檢查函式＋物理核心（js/blackbody-core.js，與頁面 js/blackbody.js 用的是同一組函式）產生頁面會送出的事件：
 *   'temp'（放開溫度滑桿、打數字、按參考物體）、'probe'（放開游標或鍵盤移動游標）、'keep'（保留這條曲線）。
 *   1. 每個任務示範一個解（列出操作與量到的數值）；
 *   2. 預設狀態、每一個參考物體按鈕、參考物體兩兩保留（兩種順序）都不會完成隱藏任務；
 *   3. 學生做公開任務時自然會選的數值（整百整千 K、參考物體的溫度、任務的下限值、整數波長）與「先做 A 再做 B」的順序，
 *      逐一當成反例：不可以順便完成隱藏任務；
 *   4. 隱藏任務的示範解不會順便完成其他隱藏任務；
 *   5. 模擬「亂按」（照 tools/playtest.cjs 的動作權重：按鈕 30、滑桿 25〔20% 拉到最小、20% 最大〕、打數字 10、勾選 8、選單 8、
 *      畫布 15〔位置 5–95%，30% 是點一下〕、等 1 秒 4；150 步），20000 輪，算出每個任務被亂按完成的機率（隱藏任務要 ≤ 3%）；
 *   6. 隱藏任務 10 個，等級在 3–10、至少 3 個在 7 級以上。
 * 修改物理核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(__ROOT + 'js/blackbody-core.js');
let list = null;
global.LabMission = { register: (m, l) => { list = l; } }; global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/blackbody.js');
const HIDDEN = list.filter(m => m.hidden).map(m => m.id);
const SHORT = id => id.replace('blackbody-', '');
const NM = 1e-9, LG = Math.log10;
const REF = {}; C.REFS.forEach(r => { REF[r.id] = r.T; });

// ---------------- 頁面模型（與 js/blackbody.js 的 tempData、probeData、keepCurve 相同） ----------------
const sig4 = v => +v.toPrecision(4);
const sliderT = p => sig4(C.T_MIN * Math.pow(C.T_MAX / C.T_MIN, p / 2000));           // 拖曳滑桿
const typedT = v => Math.round(Math.min(C.T_MAX, Math.max(C.T_MIN, v)) * 1000) / 1000;  // 打數字（LabNum：限制範圍、取到小數第 3 位）
function newPage() { return { T: 4000, probe: 2 * C.lamMax(4000), probeT: null, kept: [], rj: false, wien: false, xLog: false, mems: {} }; }
function probeData(pg) {
  const t = pg.T, lam = pg.probe;
  return { T: t, lam: lam / NM, x: C.xOf(lam, t), M: C.exitance(lam, t) * NM, RJ: C.exitanceRJ(lam, t) * NM, W: C.exitanceWien(lam, t) * NM,
    rj: C.ratioRJ(lam, t), wien: C.ratioWien(lam, t), F: C.fracBelow(lam, t), lamMax: C.lamMax(t) / NM, lamNu: C.lamOfNuMax(t) / NM, showRJ: pg.rj, showWien: pg.wien };
}
function tempData(pg, preset) {
  const t = pg.T, c = C.color(t);
  return { T: t, preset: preset || null, lamMax: C.lamMax(t) / NM, lamNu: C.lamOfNuMax(t) / NM, nuMax: C.nuMax(t), M: C.totalExitance(t),
    Mpk: C.peakExitance(t) * NM, vis: C.visFrac(t), duv: c.duv, log10L: c.log10L, showRJ: pg.rj, showWien: pg.wien, probe: probeData(pg) };
}
function evals(pg, ev) {
  const out = [];
  list.forEach(m => { pg.mems[m.id] = pg.mems[m.id] || {}; let ok = false; try { ok = m.check(ev, pg.mems[m.id]); } catch (e) { ok = false; } if (ok) out.push(m.id); });
  return out;
}
// 操作（每個回傳事件或 null）
const A = {
  T: v => pg => { pg.T = typedT(v); return { type: 'temp', data: tempData(pg, null) }; },
  slide: p => pg => { pg.T = sliderT(p); return { type: 'temp', data: tempData(pg, null) }; },
  ref: id => pg => { pg.T = typedT(REF[id]); return { type: 'temp', data: tempData(pg, id) }; },
  probe: nm => pg => { pg.probe = nm * NM; pg.probeT = pg.T; return { type: 'probe', data: probeData(pg) }; },
  probePeak: () => pg => { pg.probe = C.lamMax(pg.T); pg.probeT = pg.T; return { type: 'probe', data: probeData(pg) }; },
  probeNu: () => pg => { pg.probe = C.lamOfNuMax(pg.T); pg.probeT = pg.T; return { type: 'probe', data: probeData(pg) }; },
  keep: () => pg => {
    const t = pg.T, probeNm = pg.probe > 0 && pg.probeT === t ? pg.probe / NM : null;
    const same = pg.kept.filter(k => Math.abs(k.T - t) <= 1e-9 * t)[0];
    if (same) {
      if (probeNm == null || same.probe === probeNm) return null;
      same.probe = probeNm;
      return { type: 'keep', data: { T: t, kept: pg.kept.map(k => Object.assign({}, k)) } };
    }
    pg.kept.push({ T: t, M: C.totalExitance(t), Mpk: C.peakExitance(t) * NM, vis: C.visFrac(t), lamMax: C.lamMax(t) / NM, probe: probeNm });
    if (pg.kept.length > 8) pg.kept.shift();
    return { type: 'keep', data: { T: t, kept: pg.kept.map(k => Object.assign({}, k)) } };
  },
  clear: () => pg => { pg.kept = []; return null; },
  rj: on => pg => { pg.rj = on; return null; },
  wien: on => pg => { pg.wien = on; return null; }
};
function play(steps, pg) {
  pg = pg || newPage();
  const u = new Set();
  let last = [];
  steps.forEach(s => { const ev = s(pg); if (ev) { last = evals(pg, ev); last.forEach(x => u.add(x)); } });
  return { last, union: [...u], pg };
}
let bad = 0;
function expect(id, steps, note) {
  const r = play(steps), ok = r.last.includes(id);
  const extra = r.union.filter(x => x !== id && HIDDEN.includes(x));
  if (!ok || extra.length) bad++;
  console.log((ok && !extra.length ? 'OK   ' : 'FAIL ') + SHORT(id).padEnd(4), note, '| 同時成立：' + (r.union.filter(x => x !== id).map(SHORT).join(',') || '—') +
    (extra.length ? '｜✗ 順便完成隱藏任務 ' + extra.map(SHORT).join(',') : ''));
  return r;
}
/** 一串操作不可以完成任何隱藏任務（反例） */
let nCounter = 0;
function noHidden(steps, note, quiet) {
  const r = play(steps), hit = r.union.filter(x => HIDDEN.includes(x));
  nCounter++;
  if (hit.length) { bad++; console.log('FAIL 反例「' + note + '」完成了隱藏任務 ' + hit.map(SHORT).join(',')); }
  else if (!quiet) console.log('OK   反例 ' + note + ' | 完成：' + (r.union.map(SHORT).join(',') || '—'));
  return r;
}
/** 二分法解 f(x) = 0 */
function solve(f, a, b) { let fa = f(a); for (let i = 0; i < 200; i++) { const m = (a + b) / 2, fm = f(m); if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else b = m; } return (a + b) / 2; }

// =====================================================================
// 一、公開任務的示範解
// =====================================================================
console.log('一、公開任務（每個示範一個解）');
const pk = t => C.lamMax(t) / NM;
expect('blackbody-1', [A.ref('body')], '按「人體」：λmax = ' + pk(310).toFixed(0) + ' nm（遠紅外線）');
expect('blackbody-2', [A.T(5800)], 'T = 5800 K：λmax = ' + pk(5800).toFixed(1) + ' nm（太陽 5772 K 是 ' + pk(5772).toFixed(1) + ' nm，也在 ±1% 內）');
expect('blackbody-3', [A.ref('body'), A.probePeak()], '按「人體」，游標放在峰：λ = ' + (pk(310) / 1000).toFixed(2) + ' μm');
expect('blackbody-4', [A.T(2.898)], 'T = 2.898 K：λmax = ' + (pk(2.898) / 1e6).toFixed(4) + ' mm');
{
  const r = expect('blackbody-5', [A.T(1000), A.keep(), A.T(2000), A.keep()], '保留 1000 K、2000 K：M 比 16，峰高比 32');
  const k = r.pg.kept; console.log('     M 比 ' + (k[1].M / k[0].M).toFixed(3) + '、峰高比 ' + (k[1].Mpk / k[0].Mpk).toFixed(3));
}
{
  const pg = newPage();
  const r = play([A.ref('sun'), A.rj(true), A.probe(1e7), A.probe(100)], pg);
  const ok = r.last.includes('blackbody-6'), extra = r.union.filter(x => HIDDEN.includes(x));
  if (!ok || extra.length) bad++;
  const d1 = probeData(Object.assign({}, pg, { probe: 1e-2 })), d2 = probeData(Object.assign({}, pg, { probe: 100 * NM }));
  console.log((ok && !extra.length ? 'OK   ' : 'FAIL ') + '6   太陽＋顯示瑞利–金斯：10 mm 處 RJ/P = ' + d1.rj.toFixed(5) + '；100 nm 處 RJ/P = ' + d2.rj.toExponential(2));
}
expect('blackbody-7', [A.ref('sun'), A.probeNu()], '太陽，游標放在 c/νmax = ' + (C.lamOfNuMax(5772) / NM).toFixed(1) + ' nm（λmax = ' + pk(5772).toFixed(1) + ' nm，比值 ' + (C.X5 / C.X3).toFixed(4) + '）');
{
  const o = C.optima();
  console.log('     物理核心：可見光比例最大 ' + (o.visMax * 100).toFixed(4) + '% 在 ' + o.visT.toFixed(1) + ' K；最白 Δuv = ' + o.whiteDuv.toFixed(5) + ' 在 ' + o.whiteT.toFixed(0) + ' K');
  const VIS_MAX = 0.490416;
  if (Math.abs(o.visMax - VIS_MAX) > 2e-6) { bad++; console.log('FAIL 任務檔的 VIS_MAX 與物理核心不一致'); }
  // 可達成的溫度範圍
  const lo = solve(t => C.visFrac(t) - (VIS_MAX - 0.00015), 4000, o.visT), hi = solve(t => C.visFrac(t) - (VIS_MAX - 0.00015), o.visT, 12000);
  console.log('     任務 8 的溫度範圍 ' + lo.toFixed(0) + '–' + hi.toFixed(0) + ' K');
  const wl = solve(t => C.color(t).duv - 0.0035, 5000, o.whiteT), wh = solve(t => C.color(t).duv - 0.0035, o.whiteT, 9000);
  console.log('     任務 9 的溫度範圍 ' + wl.toFixed(0) + '–' + wh.toFixed(0) + ' K');
}
expect('blackbody-8', [A.T(6913)], 'T = 6913 K：可見光比例 ' + (C.visFrac(6913) * 100).toFixed(4) + '%');
expect('blackbody-9', [A.T(6500)], 'T = 6500 K：Δuv = ' + C.color(6500).duv.toFixed(5));
expect('blackbody-10', [A.T(1000), A.keep(), A.T(2000), A.keep(), A.T(3000), A.keep()], '保留 1000、2000、3000 K（M 比 1 : 16 : 81）');
{
  const T11 = C.C2 / (1e-5 * -Math.log(0.1));
  expect('blackbody-11', [A.wien(true), A.T(1000), A.probe(10000), A.T(625)], '維恩、游標 10 μm、T = 625 K：Wien/P = ' + C.ratioWien(1e-5, 625).toFixed(4) + '（理論 ' + T11.toFixed(1) + ' K）');
}
expect('blackbody-12', [500, 1000, 2000, 5000].reduce((a, t) => a.concat([A.T(t), A.probePeak(), A.keep()]), []), '500、1000、2000、5000 K 各自游標對準峰後保留');

// =====================================================================
// 二、隱藏任務的示範解（不可順便完成其他隱藏任務）
// =====================================================================
console.log('\n二、隱藏任務（示範解不會順便完成其他隱藏任務）');
expect('blackbody-h1', [A.T(5221), A.probePeak()], 'T = 5221 K：λmax = ' + pk(5221).toFixed(1) + ' nm（人眼最敏感 555 nm），游標對準峰');
expect('blackbody-h2', [A.ref('sun'), A.probe(C.C2 / 5772 / NM)], '太陽，游標放在 hc/kT = ' + (C.C2 / 5772 / NM).toFixed(0) + ' nm（hf = kT，x = 1）');
{
  const lamF = solve(l => C.fracBelow(l, 5772) - 0.5, 400e-9, 2000e-9);
  expect('blackbody-h3', [A.ref('sun'), A.probe(lamF / NM)], '太陽，游標放在 ' + (lamF / NM).toFixed(1) + ' nm（' + (lamF / C.lamMax(5772)).toFixed(4) + ' λmax）：比它短的剛好一半');
}
expect('blackbody-h4', [A.T(1000), A.keep(), A.T(1189.207), A.keep()], '保留 1000 K 與 1189.207 K（2 的 4 次方根倍）：M 比 ' + (Math.pow(1189.207 / 1000, 4)).toFixed(4));
expect('blackbody-h5', [A.T(1000), A.keep(), A.T(3981.07), A.keep()], '保留 1000 K 與 3981.07 K：峰高比 ' + Math.pow(3.98107, 5).toFixed(1));
{
  const T2 = solve(t => C.visFrac(t) - C.visFrac(3000), 7000, 40000);
  expect('blackbody-h6', [A.T(3000), A.keep(), A.T(Math.round(T2)), A.keep()], '保留 3000 K（可見光 ' + (C.visFrac(3000) * 100).toFixed(2) + '%）與 ' + Math.round(T2) + ' K（' + (C.visFrac(Math.round(T2)) * 100).toFixed(2) + '%）');
}
{
  const Te = 5772 * Math.sqrt(6.957e8 / (2 * 1.495978707e11));
  console.log('     地球輻射平衡溫度 T☉ √(R☉/2d) = ' + Te.toFixed(2) + ' K（R☉ = 6.957 × 10^8 m，IAU 2015 B3；d = 1 au）');
  expect('blackbody-h7', [A.ref('sun'), A.keep(), A.T(278.3), A.keep()], '保留太陽與 278.3 K');
}
{
  const xe = solve(x => Math.exp(-x) - (Math.expm1(x) / x - 1), 0.3, 1.5);
  const lam = C.C2 / (xe * 5772);
  expect('blackbody-h8', [A.ref('sun'), A.rj(true), A.wien(true), A.probe(lam / NM)], '太陽，兩種近似都顯示，游標在 x = ' + xe.toFixed(4) + '（' + (lam / NM / 1000).toFixed(2) + ' μm）：兩者都差 ' + (Math.exp(-xe) * 100).toFixed(1) + '%');
}
expect('blackbody-h9', [A.ref('cmb'), A.keep(), A.T(2972.8), A.keep()], '保留宇宙微波背景與 2972.8 K（2.725 × 1090.92 = ' + (2.725 * 1090.92).toFixed(1) + '）');
expect('blackbody-h10', [A.wien(true), A.T(1500), A.probe(51000)], '維恩、T = 1500 K、游標 51 μm：Wien/P = ' + C.ratioWien(51e-6, 1500).toFixed(3));

// =====================================================================
// 三、預設狀態、參考物體按鈕、兩兩保留
// =====================================================================
console.log('\n三、預設狀態與參考物體');
noHidden([], '只載入頁面');
noHidden([A.keep()], '預設 4000 K 直接保留');
const REFIDS = C.REFS.map(r => r.id);
const opts = [[false, false], [true, false], [false, true], [true, true]];
let nr = 0;
REFIDS.forEach(id => opts.forEach(o => {
  const base = [A.rj(o[0]), A.wien(o[1]), A.ref(id)];
  noHidden(base, '按 ' + id, true);
  noHidden(base.concat([A.probePeak()]), id + '＋游標對準峰', true);
  noHidden(base.concat([A.probeNu()]), id + '＋游標放在 c/νmax', true);
  noHidden(base.concat([A.keep()]), id + '＋保留', true);
  [100, 380, 500, 555, 700, 780, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 1e6, 1e7].forEach(nm => noHidden(base.concat([A.probe(nm)]), id + '＋游標 ' + nm + ' nm', true));
  nr += 4 + 15;
}));
console.log('OK   每個參考物體 × 勾選框四種組合 × （單按、對準峰、c/νmax、保留、15 個整數波長）：' + nr + ' 組都沒有完成隱藏任務');
let np = 0;
REFIDS.forEach(a => REFIDS.forEach(b => { if (a !== b) { noHidden([A.ref(a), A.keep(), A.ref(b), A.keep()], a + '→' + b, true); np++; } }));
noHidden(REFIDS.reduce((s, id) => s.concat([A.ref(id), A.keep()]), []), '六個參考物體依序全部保留', true);
noHidden(REFIDS.slice().reverse().reduce((s, id) => s.concat([A.ref(id), A.probePeak(), A.keep()]), []), '六個參考物體由熱到冷、對準峰後保留', true);
console.log('OK   參考物體兩兩保留（兩種順序）' + np + ' 組、全部依序保留：沒有完成隱藏任務');

// =====================================================================
// 四、做公開任務時自然會選的數值與順序（反例）
// =====================================================================
console.log('\n四、公開任務的自然做法（反例）');
const ROUND = [];
for (let t = 100; t < 1000; t += 50) ROUND.push(t);
for (let t = 1000; t < 10000; t += 100) ROUND.push(t);
for (let t = 10000; t <= 40000; t += 1000) ROUND.push(t);
[2.5, 2.7, 2.725, 2.73, 2.8, 2.9, 2.898, 3, 5, 10, 20, 30, 50, 273, 273.15, 300, 310, 373.15].forEach(t => ROUND.push(t));
// 任務 2、4、8、9 的下限與邊界值
[4955, 4960, 5000, 5737, 5740, 5750, 5772, 5796, 5800, 5850, 5853, 6900, 6910, 6913, 6920, 6500, 6504, 6505, 6400, 6600, 2.84, 2.85, 2.95, 2.96].forEach(t => ROUND.push(t));
let nc = 0;
// 4-1 單一溫度 × 游標在峰、c/νmax、整數波長，勾選框四種
ROUND.forEach(t => opts.forEach(o => {
  const base = [A.rj(o[0]), A.wien(o[1]), A.T(t)];
  noHidden(base.concat([A.probePeak()]), t + ' K 對準峰', true);
  noHidden(base.concat([A.probeNu()]), t + ' K c/νmax', true);
  [500, 1000, 10000, 20000, 50000, 100000, 1e6, 1e7].forEach(nm => noHidden(base.concat([A.probe(nm)]), t + ' K 游標 ' + nm + ' nm', true));
  nc += 10;
}));
console.log('OK   ' + ROUND.length + ' 個整數／邊界溫度 × 勾選框四種 × 10 個游標位置 = ' + nc + ' 組，沒有完成隱藏任務');
// 4-2 任務 5：保留 T 與 2T；任務 10：T、2T、3T（整百整千與參考物體）
let n5 = 0;
const base5 = ROUND.filter(t => t * 3 <= 40000).concat(C.REFS.map(r => r.T).filter(t => t * 3 <= 40000));
base5.forEach(t => {
  noHidden([A.T(t), A.keep(), A.T(2 * t), A.keep()], '任務 5：' + t + '、' + 2 * t, true);
  noHidden([A.T(2 * t), A.keep(), A.T(t), A.keep()], '任務 5（反序）', true);
  noHidden([A.T(t), A.keep(), A.T(2 * t), A.keep(), A.T(3 * t), A.keep()], '任務 10：' + t, true);
  n5 += 3;
});
console.log('OK   任務 5、10 的自然做法（' + base5.length + ' 個起點 × 正反序）' + n5 + ' 組：沒有完成隱藏任務');
// 4-3 任務 12：四個溫度、各自對準峰後保留（常見的整數組合）
const sets12 = [[100, 1000, 2000, 5000], [300, 1000, 3000, 10000], [500, 1000, 2000, 5000], [1000, 2000, 5000, 10000], [1000, 3000, 6000, 10000], [1000, 2000, 4000, 10000],
  [310, 798, 2856, 5772], [798, 2856, 5772, 9845], [310, 2856, 5772, 9845], [2.725, 310, 798, 2856], [1000, 4000, 8000, 16000], [2000, 5000, 10000, 20000], [3000, 6000, 12000, 30000], [400, 1000, 4000, 10000]];
sets12.forEach(s => {
  noHidden(s.reduce((a, t) => a.concat([A.T(t), A.probePeak(), A.keep()]), []), '任務 12：' + s.join('、'), true);
  noHidden(s.slice().reverse().reduce((a, t) => a.concat([A.T(t), A.probePeak(), A.keep()]), []), '任務 12（反序）', true);
});
console.log('OK   任務 12 的常見組合 ' + sets12.length * 2 + ' 組：沒有完成隱藏任務');
// 4-4 任務 6：顯示瑞利–金斯，長波與短波（整數波長、各參考物體與整數溫度）
let n6 = 0;
[310, 798, 1000, 2856, 3000, 5000, 5772, 6000, 9845, 10000].forEach(t => [[1e7, 100], [1e6, 200], [1e7, 50], [5e6, 300], [1e7, 10]].forEach(p => {
  [false, true].forEach(w => { noHidden([A.rj(true), A.wien(w), A.T(t), A.probe(p[0]), A.probe(p[1])], '任務 6：' + t + ' K', true); n6++; });
}));
console.log('OK   任務 6 的自然做法 ' + n6 + ' 組：沒有完成隱藏任務');
// 4-5 任務 11：先放游標 10 μm 再調溫度（從各參考物體出發，逐步調到 625 K）
let n11 = 0;
REFIDS.concat(['T1000', 'T600', 'T700']).forEach(start => {
  const st0 = start[0] === 'T' ? A.T(+start.slice(1)) : A.ref(start);
  const seq = [A.wien(true), st0, A.probe(10000)];
  [2000, 1500, 1000, 800, 700, 650, 630, 625, 620, 600, 610, 624].forEach(t => seq.push(A.T(t)));
  noHidden(seq, '任務 11 由 ' + start, true); n11++;
  const seq2 = [A.wien(true), A.rj(true), st0, A.probe(10000)];
  for (let p = 1200; p >= 800; p -= 20) seq2.push(A.slide(p));
  noHidden(seq2, '任務 11 拖曳滑桿由 ' + start, true); n11++;
});
console.log('OK   任務 11 的調溫度過程 ' + n11 + ' 組（打數字、拖曳滑桿）：沒有完成隱藏任務');
// 4-6 一個學生依序做完全部公開任務（不清除保留的曲線）
{
  const all = [A.ref('body'), A.ref('body'), A.probePeak(), A.T(5800), A.T(2.898), A.T(1000), A.keep(), A.T(2000), A.keep(), A.T(3000), A.keep(),
    A.rj(true), A.ref('sun'), A.probe(1e7), A.probe(100), A.probeNu(), A.T(6913), A.T(6500), A.rj(false), A.wien(true), A.T(1000), A.probe(10000), A.T(625),
    A.T(500), A.probePeak(), A.keep(), A.T(1000), A.probePeak(), A.keep(), A.T(2000), A.probePeak(), A.keep(), A.T(5000), A.probePeak(), A.keep()];
  const r = noHidden(all, '依序做完公開任務 1–12（不清除）');
  const pub = list.filter(m => !m.hidden).map(m => m.id), miss = pub.filter(x => !r.union.includes(x));
  if (miss.length) { bad++; console.log('FAIL 依序做完卻沒完成 ' + miss.map(SHORT).join(',')); }
}
console.log('     反例共 ' + nCounter + ' 組');

// =====================================================================
// 五、隱藏任務彼此不連帶
// =====================================================================
console.log('\n五、隱藏任務之間不連帶（每個示範解只完成自己）— 已在第二節檢查');

// =====================================================================
// 六、亂按（模擬 tools/playtest.cjs）
// =====================================================================
console.log('\n六、亂按模擬');
{
  // 畫布：寬 790 px，圖區 62–774；線性波長軸 [0, 4 λmax]，對數 10 nm – 10 mm
  const CW = 790, X0 = 62, X1 = 774;
  function pxToLam(pg, px) {
    const u = Math.min(1, Math.max(0, (px - X0) / (X1 - X0)));
    if (pg.xLog) return Math.pow(10, -8 + 6 * u);
    const r1 = 4 * C.lamMax(pg.T);
    return Math.max(r1 * 1e-4, u * r1);
  }
  // mulberry32（固定種子，結果可重現）
  let seed = 12345;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const TYPED = ['0', '-5', '-0.0001', '99999999', '3.14159265358979', '1e9', '0.000001'];
  const BUTTONS = ['ref:cmb', 'ref:body', 'ref:draper', 'ref:lamp', 'ref:sun', 'ref:sirius', 'xLin', 'xLog', 'yLin', 'yLog', 'keep', 'clear', 'view2d', 'view3d', 'reset'];
  const ROUNDS = 20000, STEPS = 150;
  const counts = {}; list.forEach(m => { counts[m.id] = 0; });
  let anyHidden = 0, keeps = 0, probes = 0;
  for (let r = 0; r < ROUNDS; r++) {
    const pg = newPage(), done = new Set();
    const fire = ev => { if (ev) evals(pg, ev).forEach(x => done.add(x)); };
    for (let s = 0; s < STEPS; s++) {
      const w = rnd() * 100;
      if (w < 30) {
        const b = BUTTONS[Math.floor(rnd() * BUTTONS.length)];
        if (b.startsWith('ref:')) fire(A.ref(b.slice(4))(pg));
        else if (b === 'xLin') pg.xLog = false;
        else if (b === 'xLog') pg.xLog = true;
        else if (b === 'keep') { const ev = A.keep()(pg); if (ev) keeps++; fire(ev); }
        else if (b === 'clear') pg.kept = [];
      } else if (w < 55) {
        const q = rnd(), p = q < 0.2 ? 0 : q < 0.4 ? 2000 : Math.floor(rnd() * 2001);
        fire(A.slide(p)(pg));
      } else if (w < 65) {
        fire(A.T(parseFloat(TYPED[Math.floor(rnd() * TYPED.length)]))(pg));
      } else if (w < 73) {
        if (rnd() < 0.5) pg.rj = !pg.rj; else pg.wien = !pg.wien;
      } else if (w < 81) {
        // 本頁沒有下拉選單
      } else if (w < 96) {
        const px = CW * (0.05 + 0.9 * rnd());
        const click = rnd() < 0.3;
        const end = click ? px : Math.min(CW, Math.max(0, px + (rnd() - 0.5) * CW * 0.6));
        pg.probe = pxToLam(pg, end); pg.probeT = pg.T; probes++;
        fire({ type: 'probe', data: probeData(pg) });
      }
    }
    done.forEach(x => { counts[x]++; });
    if ([...done].some(x => HIDDEN.includes(x))) anyHidden++;
  }
  console.log('  平均每輪：保留 ' + (keeps / ROUNDS).toFixed(1) + ' 次、放游標 ' + (probes / ROUNDS).toFixed(1) + ' 次');
  list.forEach(m => {
    const p = counts[m.id] / ROUNDS;
    const lim = m.hidden ? 0.03 : 1;
    if (p > lim) bad++;
    if (m.hidden || p > 0) console.log('  ' + (p > lim ? '✗ ' : '  ') + SHORT(m.id).padEnd(4) + (m.hidden ? '隱藏 ' : '公開 ') + String(m.level).padStart(2) + ' 級：' + (p * 100).toFixed(2) + '%');
  });
  const ph = anyHidden / ROUNDS;
  console.log('  亂按一輪完成任何一個隱藏任務的機率：' + (ph * 100).toFixed(2) + '%');
  if (ph > 0.05) bad++;
}

// =====================================================================
// 七、等級分布
// =====================================================================
{
  const hs = list.filter(m => m.hidden), lv = hs.map(m => m.level), hi = lv.filter(l => l >= 7).length, uniq = new Set(lv).size;
  const ok = hs.length === 10 && lv.every(l => l >= 3 && l <= 10) && hi >= 3 && uniq >= 5;
  if (!ok) bad++;
  const pub = list.filter(m => !m.hidden);
  console.log('\n' + (ok ? 'OK   ' : 'FAIL ') + '隱藏任務 ' + hs.length + ' 個，等級 ' + lv.join(',') + '；7 級以上 ' + hi + ' 個；共 ' + uniq + ' 種等級');
  console.log('     公開任務 ' + pub.length + ' 個，等級 ' + pub.map(m => m.level).join(',') + '，共 ' + pub.reduce((s, m) => s + m.level, 0) + ' 顆星；隱藏任務共 ' + hs.reduce((s, m) => s + 2 * m.level, 0) + ' 顆星（等級 × 2）');
}

console.log(bad ? '\n' + bad + ' 項失敗' : '\n全部通過：每個任務都做得到，預設狀態、參考物體與公開任務的自然做法都不會觸發隱藏任務，亂按完成隱藏任務的機率都在 3% 以下。');
process.exit(bad ? 1 : 0);
