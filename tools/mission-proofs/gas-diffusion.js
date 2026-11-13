/* 任務可達成的證明腳本。用法：node tools/mission-proofs/gas-diffusion.js
 * 用化學核心模擬頁面（js/gas-diffusion.js）的事件：
 *   擴散：每次按「開始」後白煙環出現時送 'ring'（位置與時間來自 GdCore.ring），earlier 是同一段紀錄中較早的白煙環；
 *   逸散：兩個容器都過半衰時間時送 'effuse'（t½ = τ ln 2，τ = 4V/(A v̄)），earlier 同上；
 *   未知氣體：按「核對答案」送 'answer'（學生只看得到頁面上的讀數：距離比 3 位小數、時間比 4 位小數）。
 * 確認每個任務都做得到、預設狀態（沒有操作）不觸發任何任務、隱藏任務彼此不會順便完成，
 * 並用亂數模擬「像學生亂按」的操作，估計隱藏任務被誤觸的機率。修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const G = require(__ROOT + 'js/gas-diffusion-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/gas-diffusion.js');

const VOL = 1.0;
let bad = 0;
const done = {};
const HIDDEN = missions.filter(m => m.hidden).map(m => m.id);

// ---------- 模擬頁面 ----------
function newPage() { return { acted: true, recs: [], events: [] }; }
function fresh() { missions.forEach(m => { m.done = false; }); }
function emit(P, type, data) {
  if (!P.acted) return;
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev)) { m.done = true; P.events.push(m.id); } });
}
const DEF_D = { base: 'NH3', acid: 'HCl', model: 'graham', L: 100, T: 298 };
const DEF_E = { A: 'H2', B: 'O2', TA: 298, TB: 298, d: 100, P0: 1 };
/** 擴散：按「開始」一直跑到白煙環出現 */
function diff(P, o) {
  o = Object.assign({}, DEF_D, o);
  const r = G.ring(o), unknown = o.acid === 'HX';
  const data = { base: o.base, acid: o.acid, unknown, model: o.model, L: o.L, T: o.T, frac: r.frac, x: r.x, t: r.t, ratio: r.ratio,
    graham: unknown ? null : r.graham, DA: r.DA, DB: r.DB };
  const earlier = P.recs.filter(x => x.kind === 'diff').slice(-40).map(x => x.data);
  P.recs.push({ kind: 'diff', data });
  if (P.unk && unknown) P.unk.nMeas++;
  emit(P, 'ring', Object.assign({ earlier }, data));
  return data;
}
/** 逸散：按「開始」一直跑到兩個容器都降到一半 */
function eff(P, o) {
  o = Object.assign({}, DEF_E, o);
  const MA = G.M(o.A), MB = G.M(o.B);
  const hA = G.effTau(MA, o.TA, o.d, VOL) * Math.LN2, hB = G.effTau(MB, o.TB, o.d, VOL) * Math.LN2;
  const unknown = o.B === 'X';
  const data = { A: o.A, B: o.B, MA, MB: unknown ? null : MB, TA: o.TA, TB: o.TB, d: o.d, P0: o.P0, tA: hA, tB: hB, ratio: hB / hA,
    Kn: Math.min(G.knudsen(o.TA, o.P0, o.d), G.knudsen(o.TB, o.P0, o.d)), unknown };
  const earlier = P.recs.filter(x => x.kind === 'eff').slice(-40).map(x => x.data);
  P.recs.push({ kind: 'eff', data });
  if (P.unk && unknown) P.unk.nMeas++;
  emit(P, 'effuse', Object.assign({ earlier }, data));
  return data;
}
function answer(P, kind, ans) {
  P.unk.tries++;
  const err = Math.abs(ans - G.M(kind)) / G.M(kind);
  if (P.unk.nMeas) emit(P, 'answer', { kind, ans, err, tries: P.unk.tries, nMeas: P.unk.nMeas, revealed: P.unk.revealed });
  return err;
}
function report(label, P, expect) {
  const hit = expect.every(id => P.events.includes(id));
  const extraHidden = P.events.filter(id => HIDDEN.includes(id) && !expect.includes(id));
  const ok = hit && !extraHidden.length;
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + label + ' → ' + (P.events.length ? P.events.join('、') : '（沒有任務）') + (extraHidden.length ? '　← 順便完成了 ' + extraHidden.join('、') : ''));
  if (ok) expect.forEach(id => { done[id] = true; }); else bad++;
}
function notHit(label, P, ids) {
  const hit = ids.filter(id => P.events.includes(id));
  console.log('  ' + (hit.length ? '✗' : '✓') + ' ' + label + (hit.length ? ' → 卻完成了 ' + hit.join('、') : ''));
  if (hit.length) bad++;
}
const r4 = x => Math.round(x * 1e4) / 1e4, r3 = x => Math.round(x * 1e3) / 1e3, pc = e => (100 * e).toFixed(2) + '%';
let P;

// ---------- 0. 預設狀態 ----------
console.log('〔預設狀態〕');
fresh(); P = newPage(); P.acted = false;
diff(P, {}); eff(P, {});
notHit('沒有按「開始」：頁面不送事件，沒有任何任務', P, missions.map(m => m.id));
fresh(); P = newPage();
diff(P, {});
report('預設設定（NH3／HCl、格雷厄姆、100 cm、298 K）按「開始」', P, ['gas-diffusion-1']);
fresh(); P = newPage();
eff(P, {});
report('預設逸散（H2／O2、298 K、100 µm）按「開始」', P, ['gas-diffusion-3']);

// ---------- 1. 擴散的一般任務 ----------
console.log('〔擴散〕');
fresh(); P = newPage();
let d = diff(P, { acid: 'HBr' });
report('NH3／HBr（格雷厄姆）：frac = ' + d.frac.toFixed(4), P, ['gas-diffusion-1', 'gas-diffusion-2']);
fresh(); P = newPage();
d = diff(P, { acid: 'HNO3' });
report('NH3／HNO3（格雷厄姆）：frac = ' + d.frac.toFixed(4), P, ['gas-diffusion-1', 'gas-diffusion-2']);
fresh(); P = newPage();
let a = diff(P, { T: 263 }), b = diff(P, { T: 313 });
report('NH3／HCl 263 K 與 313 K：t = ' + a.t.toFixed(0) + ' s → ' + b.t.toFixed(0) + ' s、frac 相差 ' + Math.abs(a.frac - b.frac).toExponential(1), P, ['gas-diffusion-1', 'gas-diffusion-4']);
fresh(); P = newPage();
a = diff(P, { model: 'air', L: 50 }); b = diff(P, { model: 'air', L: 100 });
report('在空氣中、L = 50 與 100 cm：時間比 ' + (b.t / a.t).toFixed(4), P, ['gas-diffusion-1', 'gas-diffusion-5']);
fresh(); P = newPage();
a = diff(P, { model: 'air', acid: 'HBr' }); b = diff(P, { model: 'air', acid: 'HBr', base: 'CH3NH2' });
report('HBr、在空氣中：NH3 ' + a.frac.toFixed(4) + '、CH3NH2 ' + b.frac.toFixed(4), P, ['gas-diffusion-1', 'gas-diffusion-6']);
fresh(); P = newPage();
a = diff(P, {}); b = diff(P, { model: 'air' });
report('NH3／HCl 兩種模型：' + a.frac.toFixed(4) + ' 對 ' + b.frac.toFixed(4), P, ['gas-diffusion-1', 'gas-diffusion-7']);
// 反例
fresh(); P = newPage();
diff(P, { acid: 'HCl', T: 263 }); diff(P, { acid: 'HCl', T: 290 });
notHit('溫差只有 27 K 不算任務 4', P, ['gas-diffusion-4']);
fresh(); P = newPage();
diff(P, { L: 50 }); diff(P, { L: 100, T: 320 });
notHit('管長 2 倍但溫度也改了，不算任務 5', P, ['gas-diffusion-5']);
fresh(); P = newPage();
diff(P, { acid: 'HCl' }); diff(P, { acid: 'HCl', base: 'CH3NH2' });
const fN = G.ring(Object.assign({}, DEF_D)).frac, fM = G.ring(Object.assign({}, DEF_D, { base: 'CH3NH2' })).frac;
notHit('格雷厄姆模型 HCl：NH3 ' + fN.toFixed(4) + '、CH3NH2 ' + fM.toFixed(4) + '（相差 ' + (fN - fM).toFixed(4) + '）' + (fN - fM >= 0.05 ? '' : '，不到 5% 不算任務 6'), P, fN - fM >= 0.05 ? [] : ['gas-diffusion-6']);
fresh(); P = newPage();
diff(P, { model: 'graham' }); diff(P, { model: 'air', L: 120 });
notHit('兩種模型但管長不同，不算任務 7', P, ['gas-diffusion-7']);
// 任務 2：每個組合的位置
console.log('    （各組合的白煙環位置 frac：');
G.BASES.forEach(bs => G.ACIDS.forEach(ac => {
  const g = G.ring(Object.assign({}, DEF_D, { base: bs, acid: ac })), r = G.ring(Object.assign({}, DEF_D, { base: bs, acid: ac, model: 'air' }));
  console.log('      ' + bs + '／' + ac + '：格雷厄姆 ' + g.frac.toFixed(4) + '、空氣 ' + r.frac.toFixed(4) + '（相差 ' + (g.frac - r.frac).toFixed(4) + '）、298 K 1 m 出現 ' + (g.t / 60).toFixed(1) + '／' + (r.t / 60).toFixed(1) + ' 分）');
}));

// ---------- 2. 逸散的一般任務 ----------
console.log('〔逸散〕');
fresh(); P = newPage();
let e = eff(P, {});
console.log('    （H2／O2：t½ = ' + e.tA.toFixed(1) + ' s、' + e.tB.toFixed(1) + ' s、比 ' + e.ratio.toFixed(5) + '、Kn = ' + e.Kn.toFixed(1) + '）');
fresh(); P = newPage();
eff(P, { A: 'O2', B: 'H2' });
report('反過來放（O2／H2）也算任務 3', P, ['gas-diffusion-3']);
fresh(); P = newPage();
eff(P, { A: 'He', B: 'Ar', d: 50 }); e = eff(P, { A: 'He', B: 'Ar', d: 150 });
report('He／Ar 孔徑 50 與 150 µm：比值 ' + e.ratio.toFixed(5), P, ['gas-diffusion-8']);
fresh(); P = newPage();
e = eff(P, { A: 'N2', B: 'N2', TA: 600, TB: 280 });
report('N2 兩邊 600 K 與 280 K：比值 ' + e.ratio.toFixed(5) + '、√(T 比) = ' + Math.sqrt(600 / 280).toFixed(5), P, ['gas-diffusion-9']);
fresh(); P = newPage();
eff(P, { A: 'He', B: 'Ar', d: 50 }); eff(P, { A: 'He', B: 'Ar', d: 80 });
notHit('孔徑只差 1.6 倍不算任務 8', P, ['gas-diffusion-8']);
fresh(); P = newPage();
eff(P, { A: 'N2', B: 'N2', TA: 400, TB: 250 });
notHit('溫度比 1.6 不算任務 9', P, ['gas-diffusion-9']);
fresh(); P = newPage();
eff(P, { A: 'H2', B: 'O2', TA: 298, TB: 310 });
notHit('H2／O2 溫度不同不算任務 3', P, ['gas-diffusion-3']);

// ---------- 3. 未知氣體 ----------
console.log('〔未知氣體〕');
let rs = 7;
const rng = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
const N = 300;
let okX5 = 0, okX1 = 0, okHX = 0, worstX = 0, worstHX = 0;
for (let k = 0; k < N; k++) {
  // X：左邊放 O2，同溫，比值讀到 4 位小數，M_X = 31.998 × 比值²
  fresh(); P = newPage(); P.unk = { tries: 0, nMeas: 0, revealed: false };
  G.newUnknown('X', rng);
  e = eff(P, { A: 'O2', B: 'X' });
  let err = answer(P, 'X', 31.998 * Math.pow(r4(e.ratio), 2));
  worstX = Math.max(worstX, err);
  if (P.events.includes('gas-diffusion-10')) okX5++;
  if (P.events.includes('gas-diffusion-11')) okX1++;
  // HX：格雷厄姆模型，距離比讀到 3 位小數，M_HX = 17.031 × 比值²
  fresh(); P = newPage(); P.unk = { tries: 0, nMeas: 0, revealed: false };
  G.newUnknown('HX', rng);
  d = diff(P, { acid: 'HX' });
  err = answer(P, 'HX', 17.031 * Math.pow(r3(d.ratio), 2));
  worstHX = Math.max(worstHX, err);
  if (P.events.includes('gas-diffusion-12')) okHX++;
}
[['gas-diffusion-10', okX5, '未知氣體 X 誤差 ≤ 5%'], ['gas-diffusion-11', okX1, '未知氣體 X 誤差 ≤ 1%（最差 ' + pc(worstX) + '）'], ['gas-diffusion-12', okHX, '未知酸 HX 誤差 ≤ 3%（最差 ' + pc(worstHX) + '）']].forEach(x => {
  console.log('  ' + (x[1] === N ? '✓' : '✗') + ' ' + N + ' 個隨機未知：' + x[2] + '：' + x[1] + '／' + N);
  if (x[1] === N) done[x[0]] = true; else bad++;
});
fresh(); P = newPage(); P.unk = { tries: 0, nMeas: 0, revealed: false }; G.newUnknown('X', rng);
answer(P, 'X', G.M('X'));
notHit('還沒量就猜中答案，不送事件', P, ['gas-diffusion-10', 'gas-diffusion-11']);
fresh(); P = newPage(); P.unk = { tries: 0, nMeas: 0, revealed: true }; G.newUnknown('X', rng);
eff(P, { A: 'O2', B: 'X' }); answer(P, 'X', G.M('X'));
notHit('揭曉後再答不算', P, ['gas-diffusion-10', 'gas-diffusion-11']);
fresh(); P = newPage(); P.unk = { tries: 0, nMeas: 0, revealed: false }; G.setUnknown('X', 80);
eff(P, { A: 'O2', B: 'X' }); answer(P, 'X', 31.998 * 80 / 31.998 * 1.5);
notHit('答錯（差 50%）不算', P, ['gas-diffusion-10', 'gas-diffusion-11']);

// ---------- 4. 隱藏任務 ----------
console.log('〔隱藏任務〕');
fresh(); P = newPage(); e = eff(P, { A: 'N2', B: 'CO' });
report('h1：N2／CO 同溫，比值 ' + e.ratio.toFixed(6), P, ['gas-diffusion-h1']);
fresh(); P = newPage(); e = eff(P, { A: 'CO2', B: 'N2O' });
report('h1：CO2／N2O 同溫，比值 ' + e.ratio.toFixed(6), P, ['gas-diffusion-h1']);
fresh(); P = newPage(); e = eff(P, { A: 'H2', B: 'D2' });
report('h2：H2／D2 同溫，比值 ' + e.ratio.toFixed(5) + '（√2 = 1.41421）', P, ['gas-diffusion-h2']);
fresh(); P = newPage(); e = eff(P, { A: 'N2', B: 'Ar' });
report('h3：N2／Ar 同溫（瑞利與拉姆齊），比值 ' + e.ratio.toFixed(5), P, ['gas-diffusion-h3']);
fresh(); P = newPage(); d = diff(P, { base: 'NH3', acid: 'HI', L: 150, T: 263 });
report('h4：NH3／HI、150 cm、263 K：' + (d.t / 60).toFixed(1) + ' 分', P, ['gas-diffusion-1', 'gas-diffusion-2', 'gas-diffusion-h4']);
fresh(); P = newPage(); e = eff(P, { A: 'H2', B: 'UF6b' });
report('h5：H2／UF6（U-238）同溫，比值 ' + e.ratio.toFixed(3), P, ['gas-diffusion-h5']);
fresh(); P = newPage(); diff(P, { acid: 'HI' }); diff(P, { acid: 'HI', model: 'air' });
report('h6：NH3／HI 兩種模型', P, ['gas-diffusion-1', 'gas-diffusion-2', 'gas-diffusion-7', 'gas-diffusion-h6']);
fresh(); P = newPage(); e = eff(P, { A: 'UF6a', B: 'UF6b' });
report('h7：UF6 兩種同位素同溫，比值 ' + e.ratio.toFixed(5), P, ['gas-diffusion-h7']);
// h8：N2（28.014）與 O2（31.998）：T_B = T_A × M_B/M_A
const TB8 = Math.round(280 * 31.998 / 28.014 * 10) / 10;
fresh(); P = newPage(); e = eff(P, { A: 'N2', B: 'O2', TA: 280, TB: TB8 });
report('h8：N2 280 K、O2 ' + TB8 + ' K（滑桿 0.1 K），比值 ' + e.ratio.toFixed(5), P, ['gas-diffusion-h8']);
// h9：L 100 → 120 cm，T 從 263 K 調到讓時間相同（t ∝ L²/T^1.75）
const T9 = Math.round(263 * Math.pow(1.44, 1 / 1.75) * 10) / 10;
fresh(); P = newPage(); a = diff(P, { L: 100, T: 263 }); b = diff(P, { L: 120, T: T9 });
report('h9：100 cm 263 K（' + a.t.toFixed(0) + ' s）與 120 cm ' + T9 + ' K（' + b.t.toFixed(0) + ' s）', P, ['gas-diffusion-1', 'gas-diffusion-h9']);
fresh(); P = newPage(); diff(P, { base: 'CH3NH2', acid: 'HCl', L: 80, T: 300 }); d = diff(P, { base: 'CH3NH2', acid: 'HCl', model: 'air', L: 80, T: 300 });
report('h10：CH3NH2／HCl 先格雷厄姆（0.5200）、同管同溫再在空氣中，frac = ' + d.frac.toFixed(4) + '（甲胺比較輕，環卻偏向甲胺端）', P, ['gas-diffusion-1', 'gas-diffusion-7', 'gas-diffusion-h10']);
fresh(); P = newPage(); diff(P, { base: 'CH3NH2', acid: 'HCl', model: 'air' });
notHit('h10：只做空氣中的 CH3NH2／HCl（沒有先和格雷厄姆比）不算', P, ['gas-diffusion-h10']);
fresh(); P = newPage(); diff(P, { base: 'CH3NH2', acid: 'HCl', L: 100 }); diff(P, { base: 'CH3NH2', acid: 'HCl', model: 'air', L: 90 });
notHit('h10：兩種模型但管長不同不算', P, ['gas-diffusion-h10']);
// 隱藏任務的反例
fresh(); P = newPage(); eff(P, { A: 'N2', B: 'CO', TA: 298, TB: 300 });
notHit('N2／CO 溫度不同不算 h1', P, ['gas-diffusion-h1']);
fresh(); P = newPage(); eff(P, { A: 'N2', B: 'N2' });
notHit('同一種氣體（比值 1）不算 h1、h8', P, ['gas-diffusion-h1', 'gas-diffusion-h8']);
fresh(); P = newPage(); eff(P, { A: 'He', B: 'D2' });
notHit('He／D2（莫耳質量幾乎相同）不算 h1、h2', P, ['gas-diffusion-h1', 'gas-diffusion-h2']);
fresh(); P = newPage(); eff(P, { A: 'N2', B: 'Ar', TA: 298, TB: 330 });
notHit('N2／Ar 溫度不同不算 h3', P, ['gas-diffusion-h3']);
fresh(); P = newPage(); eff(P, { A: 'He', B: 'UF6b' });
notHit('He／UF6 比值 ' + Math.sqrt(G.M('UF6b') / G.M('He')).toFixed(2) + '，不到 10 不算 h5', P, ['gas-diffusion-h5']);
fresh(); P = newPage(); eff(P, { A: 'H2', B: 'UF6b', TA: 250, TB: 600 });
notHit('H2／UF6 溫度不同不算 h5', P, ['gas-diffusion-h5']);
fresh(); P = newPage(); eff(P, { A: 'UF6a', B: 'UF6b', TA: 298, TB: 300 });
notHit('UF6 兩種同位素溫度不同不算 h7', P, ['gas-diffusion-h7']);
fresh(); P = newPage(); eff(P, { A: 'N2', B: 'O2', TA: 280, TB: TB8 + 2 });
notHit('h8 差 2 K（比值 ' + Math.sqrt(31.998 * 280 / (28.014 * (TB8 + 2))).toFixed(5) + '）不算', P, ['gas-diffusion-h8']);
fresh(); P = newPage(); diff(P, { L: 100, T: 263 }); diff(P, { L: 110, T: 300 });
notHit('h9 管長只差 10% 不算', P, ['gas-diffusion-h9']);
fresh(); P = newPage(); diff(P, { L: 100 }); diff(P, { L: 100, model: 'air' });
notHit('同一管長的兩種模型（時間不同）不算 h9', P, ['gas-diffusion-h9']);
fresh(); P = newPage(); diff(P, { base: 'CH3NH2', acid: 'HCl', model: 'graham' });
notHit('CH3NH2／HCl 在格雷厄姆模型（frac = ' + G.ring(Object.assign({}, DEF_D, { base: 'CH3NH2' })).frac.toFixed(4) + '）不算 h10', P, ['gas-diffusion-h10']);
fresh(); P = newPage(); ['HBr', 'HNO3', 'HCl'].forEach(ac => { diff(P, { acid: ac }); diff(P, { acid: ac, model: 'air' }); });
notHit('HBr、HNO3、HCl 兩種模型都做：相差不到 0.09，不算 h6', P, ['gas-diffusion-h6']);
fresh(); P = newPage(); diff(P, { base: 'CH3NH2', acid: 'HBr' }); diff(P, { base: 'CH3NH2', acid: 'HBr', model: 'air' });
notHit('CH3NH2／HBr 兩種模型相差 0.098，但不是最重的酸，不算 h6', P, ['gas-diffusion-h6']);
fresh(); P = newPage(); diff(P, { acid: 'HI' }); diff(P, { acid: 'HI', model: 'air', T: 343 });
notHit('h6 要同一管長、同一溫度，兩次溫度不同不算', P, ['gas-diffusion-h6']);
fresh(); P = newPage(); diff(P, { acid: 'HI', L: 149, T: 263 });
notHit('h4：管長 149 cm 不算（要一臂半，150 cm）', P, ['gas-diffusion-h4']);
// h4 用預設以外但不到 1 小時的最慢組合
fresh(); P = newPage(); d = diff(P, { base: 'CH3NH2', acid: 'HI', L: 100, T: 263 });
notHit('h4：CH3NH2／HI、100 cm、263 K 只要 ' + (d.t / 60).toFixed(1) + ' 分，不算', P, ['gas-diffusion-h4']);

// ---------- 5. 亂按：隱藏任務被誤觸的機率 ----------
console.log('〔亂按〕');
let rr = 12345;
const rnd = () => { rr = (rr * 48271) % 2147483647; return rr / 2147483647; };
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const stepRound = (lo, hi, st) => Math.round((lo + rnd() * (hi - lo)) / st) * st;
const hitCount = {};
const TRIALS = 2000;
for (let k = 0; k < TRIALS; k++) {
  fresh(); P = newPage();
  // 每位「學生」各做 6 次：一半擴散、一半逸散，設定是滑桿上的隨機位置（溫度、管長取整數，孔徑取 5 的倍數）
  for (let j = 0; j < 6; j++) {
    if (rnd() < 0.5) diff(P, { base: pick(G.BASES), acid: pick(G.ACIDS), model: pick(['graham', 'air']), L: stepRound(30, 150, 1), T: stepRound(263, 343, 1) });
    else eff(P, { A: pick(G.EFF), B: pick(G.EFF), TA: rnd() < 0.7 ? 298 : stepRound(250, 600, 1), TB: rnd() < 0.7 ? 298 : stepRound(250, 600, 1), d: stepRound(10, 200, 5) });
  }
  P.events.filter(id => HIDDEN.includes(id)).forEach(id => { hitCount[id] = (hitCount[id] || 0) + 1; });
}
const lines = HIDDEN.map(id => id.replace('gas-diffusion-', '') + ' ' + (100 * (hitCount[id] || 0) / TRIALS).toFixed(1) + '%');
console.log('    （' + TRIALS + ' 位學生各亂做 6 次，隱藏任務被碰到的比例：' + lines.join('、') + '）');
const worstH = Math.max.apply(null, HIDDEN.map(id => (hitCount[id] || 0) / TRIALS));
console.log('  ' + (worstH <= 0.03 ? '✓' : '✗') + ' 亂按碰到任何一個隱藏任務的比例都不超過 3%（最高 ' + (100 * worstH).toFixed(1) + '%；h1、h3、h5 是選對組合就成立的發現型任務）');
if (worstH > 0.03) bad++;

// ---------- 總結 ----------
const missing = missions.filter(m => !done[m.id]).map(m => m.id);
console.log(missing.length ? '  ✗ 沒有證明到的任務：' + missing.join('、') : '  ✓ ' + missions.length + ' 個任務都證明做得到');
if (missing.length) bad++;
const lv = missions.filter(m => m.hidden).map(m => m.level);
const hiOk = lv.length === 10 && Math.min.apply(null, lv) >= 3 && Math.max.apply(null, lv) <= 10 && lv.filter(x => x >= 7).length >= 3;
console.log('  ' + (hiOk ? '✓' : '✗') + ' 隱藏任務 ' + lv.length + ' 個，等級 ' + lv.join('、') + '（7 級以上 ' + lv.filter(x => x >= 7).length + ' 個）');
if (!hiOk) bad++;
const pub = missions.filter(m => !m.hidden);
const pubOk = pub.length >= 8 && pub.length <= 12 && pub.every(m => m.level >= 1 && m.level <= 10 && m.title && m.desc) && missions.filter(m => m.hidden).every(m => m.riddle && m.riddle.zh && m.riddle.en && !m.desc);
console.log('  ' + (pubOk ? '✓' : '✗') + ' 一般任務 ' + pub.length + ' 個都有標題與說明；隱藏任務只有謎語（riddle）');
if (!pubOk) bad++;
const stars = missions.reduce((s, m) => s + (m.hidden ? m.level * 2 : m.level), 0);
console.log('    （公開 ' + pub.reduce((s, m) => s + m.level, 0) + ' 顆星、隱藏 ' + missions.filter(m => m.hidden).reduce((s, m) => s + m.level * 2, 0) + ' 顆星，共 ' + stars + ' 顆）');
if (bad) { console.log('失敗 ' + bad + ' 項'); process.exitCode = 1; }
