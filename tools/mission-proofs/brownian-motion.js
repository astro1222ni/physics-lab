/* 任務可達成的證明腳本。用法：node tools/mission-proofs/brownian-motion.js
 * 用真正的任務檢查函式＋物理核心（observe、sedPhoto、sedFit，與頁面 js/brownian-motion.js 用的是同一組函式）產生頁面會送出的事件。
 * 布朗運動有隨機性，所以：
 *   1. 每個任務先用一組固定種子示範一個解（列出設定與量到的數值）；
 *   2. 再用 200 組固定種子重複同樣的「合理操作」，算出成功率；
 *   3. 預設狀態（只載入、自動播放、按一次記錄、切模式）不會完成任何任務；
 *   4. 模擬「亂按」（照 tools/playtest.cjs 的動作權重：按鈕 30、滑桿 25〔20% 拉到最小、20% 最大〕、打數字 10、勾選 8、選單 8、畫布 15、等 1 秒 4；
 *      每步約 0.7 s；改參數會中斷觀察；150 步），2000 輪，算出每個任務被亂按完成的機率；
 *   5. 隱藏任務的示範解不會順便完成其他隱藏任務，公開任務的示範解也不會順便完成隱藏任務；
 *   6. 隱藏任務 10 個，等級在 3–10、至少 3 個在 7 級以上。
 * 修改物理核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(__ROOT + 'js/brownian-motion-core.js');
let list = null;
global.LabMission = { register: (m, l) => { list = l; } }; global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/brownian-motion.js');
const UM = 1e-6;
const HIDDEN = list.filter(m => m.hidden).map(m => m.id);
const ID = n => 'brownian-motion-' + n;

// ---------------- 頁面模型 ----------------
// 顯微鏡：一次觀察的紀錄（與頁面 record() 相同）；沉降：照片累計（與頁面 photo() 相同）
function newPage() { return { rows: [], nextId: 1, sed: null, sedKey: '', counts: null, photos: 0, view: null, mems: {} }; }
function evals(pg, ev) {
  const out = [];
  list.forEach(m => { pg.mems[m.id] = pg.mems[m.id] || {}; let ok = false; try { ok = m.check(ev, pg.mems[m.id]); } catch (e) { ok = false; } if (ok) out.push(m.id); });
  return out;
}
function record(pg, p, seed) {
  const o = C.observe({ liquid: p.liquid || 'water', T: p.T, a: p.a * UM, N: p.N, tObs: p.tObs, seed });
  const row = Object.assign({ id: pg.nextId++ }, o.row);
  pg.rows.push(row);
  return { type: 'record', data: { row, rows: pg.rows.slice(), sed: pg.sed } };
}
function photo(pg, p, r) {
  const key = [p.material, p.a, p.T].join('|');
  const sp = C.sedParams(p.material, p.a * UM, p.T), view = C.sedView(sp.H, p.a * UM);
  if (key !== pg.sedKey) { pg.sedKey = key; pg.counts = new Array(view.layers).fill(0); pg.photos = 0; }
  const ph = C.sedPhoto(sp, view, 1, 1, r);
  ph.counts.forEach((c, i) => { pg.counts[i] += c; });
  pg.photos++;
  const f = C.sedFit(p.material, p.a * UM, p.T, pg.counts, view);
  const d = { material: p.material, a: p.a, T: p.T, dRho: sp.dRho, H: sp.H / UM, Hm: f.fit.H / UM, Hse: f.fit.se / UM, half: f.fit.H / UM * Math.LN2,
    photos: pg.photos, counted: f.counted, kB: f.kB, NA: f.NA, naErr: f.naErr, rows: pg.rows.slice() };
  pg.sed = d;
  return { type: 'photo', data: d };
}
function md(onlyBig, hits) { return { type: 'md', data: { onlyBig, hits, ratio: 100, t: hits / 30 } }; }

/** 一串操作（每項是函式 pg → 事件）；回傳 { last：最後一個事件成立的任務, union：途中成立過的任務 } */
function play(steps) {
  const pg = newPage(), u = new Set();
  let last = [];
  steps.forEach(s => { const ev = s(pg); if (ev) { last = evals(pg, ev); last.forEach(x => u.add(x)); } });
  return { last, union: [...u], pg };
}
let bad = 0;
function expect(id, steps, note) {
  const r = play(steps), ok = r.last.includes(id);
  const extra = r.union.filter(x => x !== id && HIDDEN.includes(x));
  if (!ok || extra.length) bad++;
  console.log((ok && !extra.length ? 'OK   ' : 'FAIL ') + id.replace('brownian-motion-', 'bm-').padEnd(7), note, '| 同時成立：' + (r.union.filter(x => x !== id).map(x => x.replace('brownian-motion-', '')).join(',') || '—') +
    (extra.length ? '｜✗ 順便完成隱藏任務 ' + extra.join(',') : ''));
  return r;
}
function expectNot(id, steps, note) {
  const r = play(steps), ok = !r.union.includes(id);
  if (!ok) bad++;
  console.log((ok ? 'OK   ' : 'FAIL ') + ('不會 ' + id.replace('brownian-motion-', 'bm-')).padEnd(11), note);
}
/** 成功率：同樣的操作換 rep 組種子（種子由 k 決定） */
function rate(id, mk, rep, need) {
  let n = 0, other = 0;
  for (let k = 0; k < rep; k++) {
    const r = play(mk(k));
    if (r.union.includes(id)) n++;
    if (r.union.some(x => x !== id && HIDDEN.includes(x))) other++;
  }
  const p = n / rep;
  if (need != null && p < need) bad++;
  console.log('     ↳ 合理操作的成功率：' + rep + ' 次中 ' + n + ' 次（' + (p * 100).toFixed(1) + '%）' + (need != null ? (p >= need ? '' : '｜✗ 低於 ' + need * 100 + '%') : '') +
    (other ? '；其中 ' + other + ' 次碰巧也完成其他隱藏任務' : ''));
  return p;
}
const R = (p, s) => pg => record(pg, p, s);
const P = (p, r) => pg => photo(pg, p, r);
const mkPhotos = (p, n, seed) => { const r = C.rng(seed); return Array.from({ length: n }, () => P(p, r)); };
const W20 = { liquid: 'water', T: 20, a: 0.5, N: 20, tObs: 10 }; // 預設設定
const w = (o) => Object.assign({}, W20, o);
const f = (x, d) => x.toFixed(d == null ? 3 : d);

console.log('布朗運動的任務證明\n');
console.log('一、理論值');
console.log('  水 20 °C、a = 0.5 μm：D = ' + C.D('water', 20, 0.5 * UM).toExponential(4) + ' m²/s；η 甘油 50%／80%（20 °C）= ' + f(C.eta('gly50', 20) * 1e3, 2) + '／' + f(C.eta('gly80', 20) * 1e3, 2) + ' mPa·s');
console.log('  D(80 °C)/D(20 °C)（水）= ' + f(C.D('water', 80, 1) / C.D('water', 20, 1), 4) + '；只看 T 的比 = ' + f(353.15 / 293.15, 4));
console.log('  D(0 °C)/D(25 °C)（水）= ' + f(C.D('water', 0, 1) / C.D('water', 25, 1), 4) + '；D(0)/D(20) = ' + f(C.D('water', 0, 1) / C.D('water', 20, 1), 4));
console.log('  藤黃 a = 0.375 μm、20 °C：H = ' + f(C.sedParams('gamboge', 0.375 * UM, 20).H / UM, 3) + ' μm，濃度減半高度 H ln 2 = ' + f(C.sedParams('gamboge', 0.375 * UM, 20).H / UM * Math.LN2, 3) + ' μm（佩蘭：約 6 μm）');

// ---------------- 二、預設狀態 ----------------
console.log('\n二、預設狀態與單純操作不會完成任何任務');
{
  const base = [
    ['只載入（自動播放的觀察不送事件）', []],
    ['自動播放後按一次記錄（預設設定）', [R(W20, 1)]],
    ['預設設定連按三次「開始觀察／記錄」', [R(W20, 1), R(W20, 2), R(W20, 3)]],
    ['分子視角，沒有打開「只看大顆粒」', [() => md(false, 2000)]],
    ['沉降：預設（藤黃 0.5 μm、20 °C）拍一張', mkPhotos({ material: 'gamboge', a: 0.5, T: 20 }, 1, 9)]
  ];
  base.forEach(([note, steps]) => {
    const r = play(steps), hid = r.union.filter(x => HIDDEN.includes(x)), pub = r.union.filter(x => !HIDDEN.includes(x));
    const okNote = note.startsWith('只載入') || note.startsWith('分子') ? r.union.length === 0 : hid.length === 0;
    if (!okNote) bad++;
    console.log((okNote ? 'OK   ' : 'FAIL ') + note + '：' + (r.union.length ? '公開 ' + (pub.join(',') || '—') + '；隱藏 ' + (hid.join(',') || '—') : '沒有任務'));
  });
  // 預設設定多次記錄：隱藏任務被觸發的機率
  let hit = 0;
  for (let k = 0; k < 2000; k++) { const r = play([R(W20, 50000 + 3 * k), R(W20, 50001 + 3 * k), R(W20, 50002 + 3 * k)]); if (r.union.some(x => HIDDEN.includes(x))) hit++; }
  console.log('     ↳ 預設設定記錄三次：2000 輪中 ' + hit + ' 輪碰巧完成隱藏任務（' + (hit / 20).toFixed(2) + '%）');
}

// ---------------- 三、每個任務做得到 ----------------
console.log('\n三、每個任務做得到（示範解＋固定種子重複 200 次的成功率）');
expect(ID(1), [() => md(true, 120), () => md(true, 310)], '只看大顆粒、被撞 310 次');
expect(ID(2), [R(W20, 101)], '預設設定（水 20 °C、0.5 μm、20 顆、10 s）');
rate(ID(2), k => [R(W20, 1000 + k)], 200, 0.9);
{
  const s = w({ N: 50, tObs: 10 }), l = w({ N: 50, tObs: 40 });
  const r = expect(ID(3), [R(s, 201), R(l, 202)], '50 顆，觀察 10 s 與 40 s');
  const rs = r.pg.rows; console.log('     ⟨r²⟩ 末值：' + f(rs[0].msdEnd, 2) + ' 與 ' + f(rs[1].msdEnd, 2) + ' μm²，比值 ' + f(rs[1].msdEnd / rs[0].msdEnd, 2));
  rate(ID(3), k => [R(s, 2000 + 2 * k), R(l, 2001 + 2 * k)], 200, 0.75);
  // 容許值不會太鬆：如果 ⟨r²⟩ 正比於 t²（比值 16）或 √t（比值 2），會落在 3～5.5 的機率
  let fake2 = 0, fake16 = 0;
  for (let k = 0; k < 2000; k++) {
    const a = C.observe({ liquid: 'water', T: 20, a: 0.5 * UM, N: 50, tObs: 10, seed: 70000 + 2 * k }).row, b = C.observe({ liquid: 'water', T: 20, a: 0.5 * UM, N: 50, tObs: 10, seed: 70001 + 2 * k }).row;
    const q = b.msdEnd / a.msdEnd;
    if (q * 2 >= 3 && q * 2 <= 5.5) fake2++;
    if (q * 16 >= 3 && q * 16 <= 5.5) fake16++;
  }
  console.log('     ↳ 不會太鬆：若真正的比值是 2（√t 定律），50 顆時落進 3～5.5 的機率 ' + (fake2 / 20).toFixed(1) + '%；若是 16（t²），' + (fake16 / 20).toFixed(1) + '%');
}
{
  const big = w({ a: 1, N: 30, tObs: 30 }), sm = w({ a: 0.5, N: 30, tObs: 30 });
  expect(ID(4), [R(big, 301), R(sm, 302)], '半徑 1 μm 與 0.5 μm（30 顆、30 s）');
  rate(ID(4), k => [R(big, 3000 + 2 * k), R(sm, 3001 + 2 * k)], 200, 0.9);
}
{
  const a = w({ T: 20, N: 30, tObs: 30 }), b = w({ T: 80, N: 30, tObs: 30 });
  expect(ID(5), [R(a, 401), R(b, 402)], '水 20 °C 與 80 °C（30 顆、30 s）');
  rate(ID(5), k => [R(a, 4000 + 2 * k), R(b, 4001 + 2 * k)], 200, 0.9);
}
{
  const a = w({ N: 20, tObs: 20 }), b = w({ liquid: 'gly80', N: 20, tObs: 20 });
  expect(ID(6), [R(a, 501), R(b, 502)], '20 °C 的水與甘油 80%（20 顆、20 s）');
  rate(ID(6), k => [R(a, 5000 + 2 * k), R(b, 5001 + 2 * k)], 200, 0.9);
}
{
  const p = { material: 'polystyrene', a: 0.5, T: 20 };
  expect(ID(7), mkPhotos(p, 4, 601), '聚苯乙烯 0.5 μm、20 °C，拍 4 張');
  rate(ID(7), k => mkPhotos(p, 4, 6000 + k), 200, 0.75);
  rate(ID(7), k => mkPhotos(p, 8, 6500 + k), 200, 0.9);
  console.log('       （上一行是拍 8 張）');
}
{
  const p = w({ T: 25, N: 50, tObs: 60 });
  expect(ID(8), [R(p, 701)], '水 25 °C、0.5 μm、50 顆、60 s');
  rate(ID(8), k => [R(p, 7000 + k)], 200, 0.9);
  rate(ID(8), k => [R(w({ N: 30, tObs: 30 }), 7500 + k)], 200, 0.5);
  console.log('       （上一行是門檻剛好的 30 顆、30 s）');
}
{
  const a = w({ T: 20, N: 40, tObs: 40 }), b = w({ liquid: 'gly50', T: 20, N: 40, tObs: 40 }), c = w({ liquid: 'gly80', T: 20, N: 40, tObs: 40 });
  const r = expect(ID(9), [R(a, 801), R(b, 802), R(c, 803)], '20 °C 的水、甘油 50%、甘油 80%（各 40 顆、40 s）');
  console.log('     η = ' + r.pg.rows.map(x => f(x.eta, 2)).join('、') + ' mPa·s；k_B = ' + r.pg.rows.map(x => (x.kB * 1e23).toFixed(4)).join('、') + ' × 10^-23');
  rate(ID(9), k => [R(a, 8000 + 3 * k), R(b, 8001 + 3 * k), R(c, 8002 + 3 * k)], 200, 0.9);
}
{
  const p = { material: 'silica', a: 0.3, T: 20 };
  const r = expect(ID(10), mkPhotos(p, 10, 901), '二氧化矽 0.3 μm、20 °C，拍 10 張');
  console.log('     數到 ' + r.pg.sed.counted + ' 顆，H = ' + f(r.pg.sed.Hm, 3) + ' μm（理論 ' + f(r.pg.sed.H, 3) + '），N_A 誤差 ' + f(r.pg.sed.naErr * 100, 2) + '%');
  rate(ID(10), k => mkPhotos(p, 10, 9000 + k), 200, 0.75);
  rate(ID(10), k => mkPhotos(p, 16, 9500 + k), 200, 0.9);
  console.log('       （上一行是拍 16 張）');
}

console.log('\n四、隱藏任務');
{
  const c = w({ T: 0, N: 30, tObs: 30 }), h = w({ T: 25, N: 30, tObs: 30 });
  expect(ID('h1'), [R(c, 1101), R(h, 1102)], '水 0 °C 與 25 °C（30 顆、30 s）');
  rate(ID('h1'), k => [R(c, 11000 + 2 * k), R(h, 11001 + 2 * k)], 200, 0.75);
  expectNot(ID('h1'), [R(w({ T: 0, N: 50, tObs: 60 }), 1103), R(w({ T: 20, N: 50, tObs: 60 }), 1104)], '0 °C 與 20 °C（理論比 0.521）');
}
{
  // D(100 °C, a2) = D(20 °C, a1) → a2/a1 = (373.15/293.15)(1.002/0.282)
  const k = (373.15 / 293.15) * (1.002 / 0.282), hot = w({ T: 100, a: +(0.5 * k).toFixed(3), N: 40, tObs: 40 }), cold = w({ T: 20, a: 0.5, N: 40, tObs: 40 });
  expect(ID('h2'), [R(cold, 1201), R(hot, 1202)], '水 20 °C、0.5 μm 與 100 °C、' + hot.a + ' μm（40 顆、40 s）');
  rate(ID('h2'), j => [R(cold, 12000 + 2 * j), R(hot, 12001 + 2 * j)], 200, 0.8);
}
{
  // H = a：藤黃，標高 = 半徑的半徑 a* = (kT/((4/3)π Δρ g))^(1/4)
  const T = 20, sp = C.sedParams('gamboge', 1e-6, T), astar = Math.pow(C.KB * (T + C.T0) / ((4 / 3) * Math.PI * sp.dRho * C.G), 0.25) / UM;
  const a = +astar.toFixed(3);
  expect(ID('h3'), mkPhotos({ material: 'gamboge', a, T }, 1, 1301), '藤黃、20 °C、a = ' + a + ' μm（H/a = ' + f(C.sedParams('gamboge', a * UM, T).H / (a * UM), 4) + '），拍 1 張');
}
{
  const p = w({ liquid: 'gly80', T: 20, a: 5, N: 20, tObs: 60 });
  const r = expect(ID('h4'), [R(p, 1401)], '甘油 80%、20 °C、5 μm、60 s');
  console.log('     方均根位移 ' + f(Math.sqrt(r.pg.rows[0].msdEnd), 3) + ' μm，半徑的 1/10 = 0.5 μm');
  rate(ID('h4'), k => [R(p, 14000 + k)], 200, 0.9);
  expectNot(ID('h4'), [R(w({ a: 5, tObs: 60 }), 1402)], '水裡 5 μm 看 60 s：方均根位移超過 0.5 μm');
}
{
  // 甘油 50% 100 °C 與水 T：D 相同 → 找 T
  let Tw = 0;
  for (let T = 0; T <= 100; T += 0.5) if (Math.abs(C.D('water', T, 1) / C.D('gly50', 100, 1) - 1) < Math.abs(C.D('water', Tw, 1) / C.D('gly50', 100, 1) - 1)) Tw = T;
  const a = w({ T: Tw, N: 40, tObs: 60 }), b = w({ liquid: 'gly50', T: 100, N: 40, tObs: 60 });
  expect(ID('h5'), [R(a, 1501), R(b, 1502)], '水 ' + Tw + ' °C 與甘油 50% 100 °C（理論比 ' + f(C.D('water', Tw, 1) / C.D('gly50', 100, 1), 4) + '；40 顆、60 s）');
  rate(ID('h5'), k => [R(a, 15000 + 2 * k), R(b, 15001 + 2 * k)], 200, 0.75);
}
{
  const d = w({ T: 20, a: 0.5, N: 50, tObs: 60 }), s = { material: 'polystyrene', a: 0.5, T: 20 };
  expect(ID('h6'), [R(d, 1601)].concat(mkPhotos(s, 25, 1602)), '同一顆粒（0.5 μm、20 °C）：擴散 50 顆 60 s；沉降（聚苯乙烯）拍 25 張');
  rate(ID('h6'), k => [R(d, 16000 + k)].concat(mkPhotos(s, 25, 16500 + k)), 200, 0.5);
  rate(ID('h6'), k => [R(d, 17000 + 2 * k), R(d, 17001 + 2 * k)].concat(mkPhotos(s, 40, 17500 + k)), 200, 0.6);
  console.log('       （上一行：擴散記兩筆、沉降拍 40 張）');
}
{
  const p = { material: 'gamboge', a: 0.375, T: 20 };
  const r = expect(ID('h7'), mkPhotos(p, 3, 1701), '藤黃、直徑 0.75 μm、20 °C，拍 3 張');
  console.log('     減半高度 ' + f(r.pg.sed.half, 2) + ' μm');
  rate(ID('h7'), k => mkPhotos(p, 3, 18000 + k), 200, 0.8);
}
{
  // 尾端事件：50 顆一次觀察，至少一顆 r² ≥ 8·4Dt 的機率 = 1 − (1 − e^-8)^50
  let seed = 1801, tries = 0, found = null;
  while (!found && tries < 2000) { tries++; const o = C.observe({ liquid: 'water', T: 20, a: 0.5 * UM, N: 50, tObs: 1, seed }); if (o.row.tail >= 8) found = seed; else seed++; }
  expect(ID('h8'), [R(w({ N: 50, tObs: 1 }), found)], '50 顆、1 s，重複觀察到第 ' + tries + ' 次（種子 ' + found + '）');
  const p1 = 1 - Math.pow(1 - Math.exp(-8), 50), p20 = 1 - Math.pow(1 - Math.exp(-8), 20);
  let n = 0; for (let k = 0; k < 20000; k++) if (C.observe({ liquid: 'water', T: 20, a: 0.5 * UM, N: 50, tObs: 1, seed: 200000 + k }).row.tail >= 8) n++;
  console.log('     ↳ 每記錄一次（50 顆）成功的機率：理論 ' + (p1 * 100).toFixed(2) + '%、模擬 20000 次 ' + (n / 200).toFixed(2) + '%；平均要記錄 ' + Math.round(1 / p1) + ' 次；預設 20 顆時每次 ' + (p20 * 100).toFixed(2) + '%');
  // 尾端事件出現在預設設定（20 顆、10 s）或 50 顆但看太久（10 s）的記錄裡，都不算：要刻意快速大量擲骰
  const lucky = (o) => { let sd = 400000; for (let k = 0; k < 40000; k++, sd++) if (C.observe(Object.assign({ liquid: 'water', T: 20, a: 0.5 * UM, seed: sd }, o)).row.tail >= 8) return sd; return null; };
  const sDef = lucky({ N: 20, tObs: 10 }), s50 = lucky({ N: 50, tObs: 10 });
  expectNot(ID('h8'), [R(w({}), sDef)], '預設 20 顆 10 s，碰巧出現尾端事件（種子 ' + sDef + '）');
  expectNot(ID('h8'), [R(w({ N: 50 }), s50)], '50 顆但觀察 10 s，碰巧出現尾端事件（種子 ' + s50 + '）');
}
{
  const a = w({ T: 20, N: 30, tObs: 30 }), b = w({ liquid: 'gly80', T: 40, N: 30, tObs: 30 });
  expect(ID('h9'), [R(a, 1901), R(b, 1902)], '水 20 °C 與甘油 80% 40 °C（理論比 ' + f(C.D('gly80', 40, 1) / C.D('water', 20, 1), 3) + '）');
  rate(ID('h9'), k => [R(a, 19000 + 2 * k), R(b, 19001 + 2 * k)], 200, 0.9);
  expectNot(ID('h9'), [R(w({ T: 20 }), 1903), R(w({ liquid: 'gly50', T: 100, tObs: 20 }), 1904)], '甘油 50% 100 °C（比水 20 °C 還快）');
  expectNot(ID('h9'), [R(w({ T: 20, N: 40, tObs: 40 }), 1905), R(w({ liquid: 'gly50', T: 60, N: 40, tObs: 40 }), 1906)], '甘油 50% 60 °C（理論比 ' + f(C.D('gly50', 60, 1) / C.D('water', 20, 1), 3) + '，沒有掉到一半）');
}
{
  const one = w({ N: 1, tObs: 60 }), many = w({ N: 50, tObs: 2 });
  expect(ID('h10'), [R(one, 2001), R(many, 2002)], '一顆看 60 s 與 50 顆看 2 s');
  rate(ID('h10'), k => [R(one, 20000 + 2 * k), R(many, 20001 + 2 * k)], 200, 0.6);
}

// ---------------- 五、公開任務的示範解不會順便完成隱藏任務 ----------------
console.log('\n五、公開任務的示範解（200 組種子）會不會順便完成隱藏任務');
{
  const sets = [
    ['m3', k => [R(w({ N: 50 }), 30000 + 2 * k), R(w({ N: 50, tObs: 40 }), 30001 + 2 * k)]],
    ['m4', k => [R(w({ a: 1, N: 30, tObs: 30 }), 31000 + 2 * k), R(w({ N: 30, tObs: 30 }), 31001 + 2 * k)]],
    ['m5', k => [R(w({ N: 30, tObs: 30 }), 32000 + 2 * k), R(w({ T: 80, N: 30, tObs: 30 }), 32001 + 2 * k)]],
    ['m6', k => [R(w({ tObs: 20 }), 33000 + 2 * k), R(w({ liquid: 'gly80', tObs: 20 }), 33001 + 2 * k)]],
    ['m9', k => [R(w({ N: 40, tObs: 40 }), 34000 + 3 * k), R(w({ liquid: 'gly50', N: 40, tObs: 40 }), 34001 + 3 * k), R(w({ liquid: 'gly80', N: 40, tObs: 40 }), 34002 + 3 * k)]],
    ['m10', k => mkPhotos({ material: 'silica', a: 0.3, T: 20 }, 10, 35000 + k)]
  ];
  sets.forEach(([name, mk]) => {
    const cnt = {};
    for (let k = 0; k < 200; k++) play(mk(k)).union.filter(x => HIDDEN.includes(x)).forEach(x => { cnt[x] = (cnt[x] || 0) + 1; });
    const ks = Object.keys(cnt);
    if (ks.length) bad++;
    console.log((ks.length ? 'FAIL ' : 'OK   ') + name.padEnd(4) + (ks.length ? ks.map(x => x.replace('brownian-motion-', '') + ' ' + cnt[x] + '/200').join('、') : '不會順便完成隱藏任務'));
  });
}

// ---------------- 六、亂按（模擬自動試玩）----------------
console.log('\n六、亂按 150 步（模擬 tools/playtest.cjs 的動作權重），2000 輪');
{
  const NUMS = ['0', '-5', '-0.0001', '99999999', '3.14159265358979', '1e9', '0.000001'];
  const SL = {
    T: { min: 0, max: 100, step: 0.5, dec: 1 }, tObs: { min: 1, max: 60, step: 1, dec: 0 }, N: { min: 1, max: 50, step: 1, dec: 0 },
    a: { log: true, min: 0.1, max: 5, dec: 3 }, ratio: { min: 50, max: 200, step: 10, dec: 0 }
  };
  const posVal = (k, u) => { const s = SL[k]; if (s.log) return +(s.min * Math.pow(s.max / s.min, u)).toFixed(s.dec); const v = s.min + u * (s.max - s.min); return Math.round(v / s.step) * s.step; };
  const typed = (k, txt) => { const s = SL[k]; let v = parseFloat(txt); if (!isFinite(v)) return null; v = Math.max(s.min, Math.min(s.max, v)); return +v.toFixed(s.dec); };
  const SPEEDS = [1, 5, 20];
  const counts = {}; list.forEach(m => { counts[m.id] = 0; });
  let anyHidden = 0, runsDone = 0, recs = 0, photos = 0;
  const ROUNDS = 2000;
  for (let round = 0; round < ROUNDS; round++) {
    const rr = C.rng(900000 + round);
    const pg = newPage();
    const st = { mode: 'micro', liquid: 'water', T: 20, a: 0.5, tObs: 10, N: 20, speed: 5, material: 'gamboge', onlyBig: false, trails: false, view3d: false,
      runEnd: 0, running: true, runDone: false, recorded: false, seedN: 1, auto: true, hits: 0, mdT: 0, paused: false };
    let t = 0;
    const done = new Set();
    const fire = ev => evals(pg, ev).forEach(x => done.add(x));
    const startRun = () => { st.running = true; st.runDone = false; st.recorded = false; st.auto = false; st.runEnd = t + st.tObs / st.speed + 0.2; st.seedN++; };
    const abort = () => { st.running = false; st.runDone = false; st.recorded = false; };
    st.runEnd = 1.5 + st.tObs / st.speed; // 載入時自動播放一次
    const advance = dt => {
      const t1 = t + dt;
      if (st.mode === 'micro' && st.running && t1 >= st.runEnd) { st.running = false; st.runDone = true; runsDone++; }
      if (st.mode === 'md' && st.onlyBig && !st.paused) {
        const h0 = st.hits; st.hits += 30 * dt; // 撞擊頻率約每秒 30 次（頁面的預設播放速度）
        if (Math.floor(st.hits / 30) > Math.floor(h0 / 30)) fire(md(true, Math.floor(st.hits)));
      }
      t = t1;
    };
    const buttons = () => {
      const b = ['mMD', 'mMicro', 'mSed', 'view2d', 'view3d', 'sound', 'clear'];
      if (st.mode === 'micro') b.push('start', 'record', 'sp1', 'sp5', 'sp20');
      if (st.mode === 'sed') b.push('photo');
      if (st.mode === 'md') b.push('pause', 'slow');
      return b;
    };
    const ranges = () => st.mode === 'micro' ? ['T', 'a', 'tObs', 'N'] : st.mode === 'sed' ? ['T', 'a'] : ['ratio', 'T'];
    const setParam = (k, v) => {
      if (v == null) return;
      if (k === 'ratio') { st.hits = 0; return; }
      if (st[k] === v) return;
      st[k] = v;
      if (st.mode === 'micro') abort();
    };
    advance(1.5);
    for (let s = 1; s <= 150; s++) {
      if (s === 40 || s === 75) { advance(s === 40 ? 4.3 : 0.5); continue; }
      const W = { button: 30, range: 25, num: 10, check: 8, select: 8, canvas: 15, wait: 4 };
      const kinds = Object.keys(W).filter(k => !(k === 'select' && st.mode === 'md'));
      let x = rr.next() * kinds.reduce((a, k) => a + W[k], 0), kind = kinds[kinds.length - 1];
      for (const k of kinds) { if ((x -= W[k]) < 0) { kind = k; break; } }
      let dt = 0.7;
      if (kind === 'wait') dt = 1.12;
      else if (kind === 'button') {
        const bs = buttons(), b = bs[Math.floor(rr.next() * bs.length)];
        if (b === 'mMD' || b === 'mMicro' || b === 'mSed') { const m = b === 'mMD' ? 'md' : b === 'mMicro' ? 'micro' : 'sed'; if (m !== st.mode) { st.mode = m; abort(); st.hits = 0; } }
        else if (b === 'start') startRun();
        else if (b === 'record' && st.mode === 'micro' && st.runDone && !st.recorded) {
          st.recorded = true; recs++;
          fire(record(pg, { liquid: st.liquid, T: st.T, a: st.a, N: st.N, tObs: st.tObs }, 1e6 * round + st.seedN));
        } else if (b === 'photo') { photos++; fire(photo(pg, { material: st.material, a: st.a, T: st.T }, rr)); }
        else if (b === 'clear') { pg.rows = []; pg.sed = null; pg.sedKey = ''; }
        else if (b === 'sp1' || b === 'sp5' || b === 'sp20') st.speed = +b.slice(2);
        else if (b === 'pause') st.paused = !st.paused;
      } else if (kind === 'range' || kind === 'num') {
        const rs = ranges(), k = rs[Math.floor(rr.next() * rs.length)];
        if (kind === 'range') { const m = rr.next(); setParam(k, m < 0.2 ? posVal(k, 0) : m < 0.4 ? posVal(k, 1) : posVal(k, 0.02 + 0.96 * rr.next())); }
        else setParam(k, typed(k, NUMS[Math.floor(rr.next() * NUMS.length)]));
      } else if (kind === 'check') {
        if (st.mode === 'md') { st.onlyBig = !st.onlyBig; st.hits = 0; } else if (st.mode === 'micro') st.trails = !st.trails;
      } else if (kind === 'select') {
        if (st.mode === 'micro') setParam('liquid', ['water', 'gly50', 'gly80'][Math.floor(rr.next() * 3)]);
        else if (st.mode === 'sed') st.material = ['gamboge', 'polystyrene', 'silica'][Math.floor(rr.next() * 3)];
      }
      advance(dt);
    }
    done.forEach(x => { counts[x]++; });
    if ([...done].some(x => HIDDEN.includes(x))) anyHidden++;
  }
  console.log('  平均每輪：完成觀察 ' + (runsDone / ROUNDS).toFixed(1) + ' 次、記錄 ' + (recs / ROUNDS).toFixed(1) + ' 筆、拍照 ' + (photos / ROUNDS).toFixed(1) + ' 張');
  list.forEach(m => {
    const p = counts[m.id] / ROUNDS;
    const lim = m.hidden ? 0.03 : 1;
    if (p > lim) bad++;
    if (m.hidden || p > 0) console.log('  ' + (p > lim ? '✗ ' : '  ') + m.id.replace('brownian-motion-', 'bm-').padEnd(7) + (m.hidden ? '隱藏 ' : '公開 ') + String(m.level).padStart(2) + ' 級：' + (p * 100).toFixed(2) + '%');
  });
  const ph = anyHidden / ROUNDS;
  console.log('  亂按一輪完成任何一個隱藏任務的機率：' + (ph * 100).toFixed(2) + '%');
  if (ph > 0.05) bad++;
}

// ---------------- 七、等級分布 ----------------
{
  const hs = list.filter(m => m.hidden), lv = hs.map(m => m.level), hi = lv.filter(l => l >= 7).length, uniq = new Set(lv).size;
  const ok = hs.length === 10 && lv.every(l => l >= 3 && l <= 10) && hi >= 3 && uniq >= 5;
  if (!ok) bad++;
  const pub = list.filter(m => !m.hidden);
  console.log('\n' + (ok ? 'OK   ' : 'FAIL ') + '隱藏任務 ' + hs.length + ' 個，等級 ' + lv.join(',') + '；7 級以上 ' + hi + ' 個；共 ' + uniq + ' 種等級');
  console.log('     公開任務 ' + pub.length + ' 個，等級 ' + pub.map(m => m.level).join(',') + '，共 ' + pub.reduce((s, m) => s + m.level, 0) + ' 顆星；隱藏任務共 ' + hs.reduce((s, m) => s + 2 * m.level, 0) + ' 顆星（等級 × 2）');
}

console.log(bad ? '\n' + bad + ' 項失敗' : '\n全部通過：每個任務都做得到，預設狀態不會觸發任務，亂按完成隱藏任務的機率都在 3% 以下。');
process.exit(bad ? 1 : 0);
