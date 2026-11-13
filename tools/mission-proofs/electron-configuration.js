/* 任務可達成的證明腳本。用法：node tools/mission-proofs/electron-configuration.js
 * 用化學核心模擬頁面（js/electron-configuration.js）的操作與事件：
 *   換原子或離子送 'species'（iso = 看過的、電子數相同的粒子種數）；「逐一填入」播完送 'fill'；
 *   「自己填」每放一個或擦掉一個電子送 'build'，同自旋放進同一格送 'pauli'；3D 開啟送 'view3d'。
 * 自己填的做法：照洪德定則一個一個放（先 ↑ 再 ↓），可以先勾「先填好鈍氣核心」。
 * 確認每個任務都做得到、預設狀態不觸發、每個隱藏任務只完成它自己、亂按（像試玩那樣）不會完成隱藏任務。
 * 修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const E = require(__ROOT + 'js/electron-configuration-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/electron-configuration.js');

let bad = 0;
const done = {};
const hid = id => /-h\d+$/.test(id);
function fresh() { missions.forEach(m => { m.done = false; }); }
function page() { return { Z: 8, q: 0, mode: 'auto', acted: false, events: [], seen: new Set(), build: E.emptyBoxes(), core: false, groundSeen: false }; }
function emit(P, type, data) {
  if (!P.acted) return;
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev)) { m.done = true; P.events.push(m.id); } });
}
function iso(P, N) { let c = 0; P.seen.forEach(k => { const a = k.split(','); if (+a[0] - +a[1] === N) c++; }); return c; }
function select(P, Z, q) {
  P.acted = true;
  q = E.clampQ(Z, q || 0);
  if (Z === P.Z && q === P.q) return;
  P.Z = Z; P.q = q;
  P.seen.add(Z + ',' + q);
  const occ = E.config(Z, q), N = Z - q;
  P.build = P.core ? E.boxesOf(E.aufbau(E.buildCore(Z, q))) : E.emptyBoxes(); P.groundSeen = false;
  emit(P, 'species', { Z, q, N, unpaired: E.unpaired(occ), exception: !q && E.isException(Z), noble: E.nobleMatch(occ), iso: iso(P, N) });
}
function setCore(P, on) { P.acted = true; P.core = on; P.build = on ? E.boxesOf(E.aufbau(E.buildCore(P.Z, P.q))) : E.emptyBoxes(); P.groundSeen = false; }
/** 和頁面的 place() 一樣：tool 0 放 ↑、1 放 ↓、2 擦掉 */
function place(P, s, o, tool) {
  P.acted = true;
  const box = P.build[s][o], r0 = E.evaluate(P.build, P.Z, P.q);
  if (tool === 2) { if (box[1]) box[1] = 0; else if (box[0]) box[0] = 0; else return 'none'; }
  else {
    if (box[tool]) { emit(P, 'pauli', { Z: P.Z, q: P.q }); return 'pauli'; }
    if (r0.count >= r0.N) return 'full';
    box[tool] = 1;
  }
  const r = E.evaluate(P.build, P.Z, P.q);
  emit(P, 'build', { Z: P.Z, q: P.q, N: r.N, count: r.count, ground: r.ground, occMatch: r.occMatch, hundOK: r.hundOK, aufbauOK: r.aufbauOK, key: r.key, unpaired: r.unpaired, fromGround: P.groundSeen });
  if (r.ground) P.groundSeen = true;
  return r;
}
/** 照洪德定則把 boxes 目標一個一個放上去（只放還沒有的），傳回放了幾次 */
function buildTo(P, goal) {
  let n = 0;
  goal.forEach((row, s) => {
    const m = row.length;
    for (let k = 0; k < 2 * m; k++) {
      const t = E.slotOf(k, m);
      if (row[t.o][t.spin] && !P.build[s][t.o][t.spin]) { place(P, s, t.o, t.spin); n++; }
    }
  });
  return n;
}
function check(msg, P, expect, only) {
  const ok = expect.every(id => P.events.includes(id)) && (!only || P.events.filter(hid).every(id => expect.includes(id)));
  console.log((ok ? '  ✓ ' : '  ✗ ') + msg + '　→ ' + (P.events.join('、') || '（無）'));
  if (!ok) bad++;
  P.events.forEach(id => { done[id] = true; });
}
const Zof = s => E.SYM.indexOf(s) + 1;

// ---------- 預設狀態不觸發 ----------
fresh();
let P = page();
emit(P, 'species', { Z: 8, q: 0, N: 8, unpaired: 2, exception: false, noble: 0, iso: 1 });
emit(P, 'build', { Z: 8, q: 0, N: 8, count: 0, ground: false });
console.log(P.events.length ? '  ✗ 沒有操作就完成了任務：' + P.events.join('、') : '  ✓ 沒有操作時不送事件、不完成任務');
if (P.events.length) bad++;
// 只切到「自己填」、按「清空重填」、勾核心，什麼都還沒放：不完成任何任務
fresh(); P = page(); P.acted = true; setCore(P, true); setCore(P, false);
if (P.events.length) { console.log('  ✗ 只切換就完成了：' + P.events.join('、')); bad++; } else console.log('  ✓ 只切換模式、勾核心不完成任何任務');

// ---------- 公開任務 ----------
fresh(); P = page(); P.acted = true;
emit(P, 'fill', { Z: 8, q: 0, N: 8 });
check('預設的氧按「逐一填入」播完', P, ['electron-configuration-1']);
fresh(); P = page(); P.acted = true; emit(P, 'view3d', {});
check('切換到 3D 立體', P, ['electron-configuration-2']);
fresh(); P = page(); place(P, 0, 0, 0); const pa = place(P, 0, 0, 0);
check('自己填：1s 放 ↑ 後再放一次 ↑（' + pa + '）', P, ['electron-configuration-3']);
fresh(); P = page(); select(P, 19, 0);
check('選鉀（' + E.cfgText(E.config(19, 0), true) + '）', P, ['electron-configuration-4']);
fresh(); P = page(); select(P, 7, 0); let n = buildTo(P, E.boxesOf(E.config(7, 0)));
check('選氮、自己填 ' + n + ' 個電子（2p 三格各一個 ↑）', P, ['electron-configuration-5'], true);
{
  // 洪德錯誤的氮不算
  fresh(); P = page(); select(P, 7, 0);
  buildTo(P, E.boxesOf(E.config(6, 0))); place(P, E.idx(2, 1), 0, 1);
  const ok = !P.events.includes('electron-configuration-5');
  console.log((ok ? '  ✓ ' : '  ✗ ') + '氮的 2p 第三個電子拿去配對（違反洪德）不算任務 5');
  if (!ok) bad++;
}
fresh(); P = page(); select(P, 11, 1);
check('選 Na+（' + E.cfgText(E.config(11, 1), true) + '，和 Ne 一樣）', P, ['electron-configuration-6']);
fresh(); P = page(); select(P, 17, -1);
check('選 Cl−（和 Ar 一樣）', P, ['electron-configuration-6']);
{
  fresh(); P = page(); select(P, 10, 0);
  const ok = !P.events.includes('electron-configuration-6');
  console.log((ok ? '  ✓ ' : '  ✗ ') + '選氖原子本身（電荷 0）不算任務 6');
  if (!ok) bad++;
}
fresh(); P = page(); select(P, 30, 0);
check('選鋅（第 4 週期過渡金屬中唯一未成對 0：' + [21, 22, 23, 24, 25, 26, 27, 28, 29, 30].map(z => E.SYM[z - 1] + E.unpaired(E.config(z, 0))).join(' ') + '）', P, ['electron-configuration-7']);
fresh(); P = page(); select(P, 24, 0);
check('選鉻（' + E.cfgText(E.config(24, 0), true) + '）', P, ['electron-configuration-8']);
fresh(); P = page(); select(P, 24, 0); setCore(P, true); n = buildTo(P, E.boxesOf(E.config(24, 0)));
check('選鉻、勾核心、自己填 ' + n + ' 個（3d 五個 ↑、4s 一個 ↑）', P, ['electron-configuration-9'], true);
{
  fresh(); P = page(); select(P, 24, 0); setCore(P, true); buildTo(P, E.boxesOf(E.aufbau(24)));
  const ok = !P.events.includes('electron-configuration-9');
  console.log((ok ? '  ✓ ' : '  ✗ ') + '鉻照構築原理填（3d4 4s2）不算任務 9');
  if (!ok) bad++;
}
fresh(); P = page(); select(P, 26, 2); setCore(P, true); n = buildTo(P, E.boxesOf(E.config(26, 2)));
check('選鐵、電荷 +2、勾核心、自己填 ' + n + ' 個（3d6，4s 空）', P, ['electron-configuration-10'], true);
{
  fresh(); P = page(); select(P, 26, 2); setCore(P, true); buildTo(P, E.boxesOf(E.aufbau(24)));
  const ok = !P.events.includes('electron-configuration-10');
  console.log((ok ? '  ✓ ' : '  ✗ ') + 'Fe2+ 填成 3d4 4s2（照 24 個電子的構築原理）不算任務 10');
  if (!ok) bad++;
}
fresh(); P = page(); select(P, 10, 0); select(P, 11, 1); select(P, 12, 2); select(P, 9, -1);
check('依序選 Ne、Na+、Mg2+、F−（iso = ' + iso(P, 10) + '）', P, ['electron-configuration-11']);
{
  fresh(); P = page(); select(P, 10, 0); select(P, 11, 1); select(P, 12, 2); select(P, 13, 0);
  const ok = !P.events.includes('electron-configuration-11');
  console.log((ok ? '  ✓ ' : '  ✗ ') + '只看過 3 種（Ne、Na+、Mg2+）不算任務 11');
  if (!ok) bad++;
}
fresh(); P = page(); select(P, 64, 0);
check('選釓（' + E.cfgText(E.config(64, 0), true) + '，未成對 ' + E.unpaired(E.config(64, 0)) + '，全表最多；Cm 也是 8）', P, ['electron-configuration-12']);

// ---------- 隱藏任務：每一個只完成它自己 ----------
const HID = [
  ['electron-configuration-h1', 9, -1, 'F−（[He] 2s2 2p6）'],
  ['electron-configuration-h2', 29, 0, 'Cu（3d10 4s1）'],
  ['electron-configuration-h4', 26, 3, 'Fe3+（3d5）'],
  ['electron-configuration-h5', 46, 0, 'Pd（4d10，5s 空）'],
  ['electron-configuration-h6', 64, 0, 'Gd（4f7 5d1 6s2）'],
  ['electron-configuration-h7', 82, 2, 'Pb2+（6s2 留著）'],
  ['electron-configuration-h8', 74, 0, 'W（5d4 6s2，不像 Cr、Mo）'],
  ['electron-configuration-h9', 103, 0, 'Lr（7s2 7p1）'],
  ['electron-configuration-h10', 24, 3, 'Cr3+（3d3，紅寶石）']
];
HID.forEach(h => {
  [false, true].forEach(core => {
    fresh(); P = page(); select(P, h[1], h[2]); setCore(P, core);
    const k = buildTo(P, E.boxesOf(E.config(h[1], h[2])));
    check('自己填 ' + h[3] + (core ? '（勾核心）' : '（從空的開始）') + '：' + k + ' 次', P, [h[0]], true);
  });
});
// h3：鈉的激發態 1s2 2s2 2p6 3p1，要先填出基態再讓 3s 電子跳上去
fresh(); P = page(); select(P, 11, 0); setCore(P, true); place(P, E.idx(3, 0), 0, 0); place(P, E.idx(3, 0), 0, 2); place(P, E.idx(3, 1), 0, 0);
check('選鈉、勾核心、3s 放 ↑（基態）→ 擦掉 → 3p 放 ↑', P, ['electron-configuration-h3'], true);
fresh(); P = page(); select(P, 11, 0); buildTo(P, E.boxesOf(E.config(11, 0))); place(P, E.idx(3, 0), 0, 2); place(P, E.idx(3, 1), 1, 1);
check('鈉從空的填好基態（11 次），再擦掉 3s、在 3p 放一個 ↓', P, ['electron-configuration-h3'], true);
{
  // 沒先填出基態就直接放到 3p、鈉的基態本身、放到 4s 的激發態、清空重填後才放 3p：都不算 h3
  const cases = [];
  fresh(); let Q = page(); select(Q, 11, 0); setCore(Q, true); place(Q, E.idx(3, 1), 0, 0); cases.push(Q);
  fresh(); Q = page(); select(Q, 11, 0); buildTo(Q, E.boxesOf(E.config(11, 0))); cases.push(Q);
  fresh(); Q = page(); select(Q, 11, 0); setCore(Q, true); place(Q, E.idx(3, 0), 0, 0); place(Q, E.idx(3, 0), 0, 2); place(Q, E.idx(4, 0), 0, 0); cases.push(Q);
  fresh(); Q = page(); select(Q, 11, 0); setCore(Q, true); place(Q, E.idx(3, 0), 0, 0); setCore(Q, true); place(Q, E.idx(3, 1), 0, 0); cases.push(Q);
  const ok = cases.every(c => !c.events.includes('electron-configuration-h3'));
  console.log((ok ? '  ✓ ' : '  ✗ ') + '沒先填出基態就放 3p、鈉的基態、跳到 4s、清空重填後才放 3p：都不算 h3');
  if (!ok) bad++;
}
// 例外元素照構築原理填、離子照「填 N 個電子」都不算對應的隱藏任務
{
  const wrong = [[29, 0, E.aufbau(29)], [46, 0, E.aufbau(46)], [64, 0, E.aufbau(64)], [103, 0, E.aufbau(103)], [26, 3, E.aufbau(23)], [82, 2, E.parseCfg('[Xe]4f14 5d10 6p2')], [9, -1, E.parseCfg('[He]2s2 2p5 3s1')], [24, 3, E.aufbau(21)], [74, 0, E.parseCfg('[Xe]4f14 5d5 6s1')]];
  let leak = [];
  wrong.forEach(w => { fresh(); const Q = page(); select(Q, w[0], w[1]); setCore(Q, true); buildTo(Q, E.boxesOf(w[2])); leak = leak.concat(Q.events.filter(hid)); });
  console.log((leak.length ? '  ✗ ' : '  ✓ ') + '常見的錯誤填法（照構築原理、或 W 填成 5d5 6s1）不完成隱藏任務' + (leak.length ? '：' + leak.join('、') : ''));
  if (leak.length) bad++;
}

// ---------- 掃過所有原子與離子（只換、不自己填）：不完成隱藏任務 ----------
{
  fresh(); P = page();
  for (let Z = 1; Z <= 118; Z++) { const r = E.chargeRange(Z); for (let q = r.min; q <= r.max; q++) select(P, Z, q); }
  const h = P.events.filter(hid);
  console.log((h.length ? '  ✗ ' : '  ✓ ') + '把 118 個元素的每個電荷都選一遍：隱藏任務 ' + (h.length ? h.join('、') : '一個都沒完成') + '；公開完成 ' + P.events.length + ' 個');
  if (h.length) bad++;
}

// ---------- 像試玩那樣亂按：隨機換元素、電荷、工具、核心，在看得到的格子上亂點 ----------
{
  let a = 1113;
  const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  let hits = 0; const which = {};
  const RUNS = 2000, STEPS = 150;
  for (let run = 0; run < RUNS; run++) {
    fresh(); P = page(); P.acted = true;
    let tool = 0;
    for (let k = 0; k < STEPS; k++) {
      const x = rnd();
      if (x < 0.06) select(P, rnd() < 0.3 ? pick([1, 118]) : 1 + Math.floor(rnd() * 118), P.q);
      else if (x < 0.1) { const r = E.chargeRange(P.Z); select(P, P.Z, rnd() < 0.5 ? pick([r.min, r.max]) : r.min + Math.floor(rnd() * (r.max - r.min + 1))); }
      else if (x < 0.15) tool = Math.floor(rnd() * 3);
      else if (x < 0.17) setCore(P, !P.core);
      else {
        // 只點畫面上看得到的列（到目標或已放的最高列所在週期段的下一段）
        const hi = Math.max(E.highest(E.config(P.Z, P.q)), E.highest(P.build.map(r => r.reduce((s, o) => s + o[0] + o[1], 0))));
        const s = Math.floor(rnd() * Math.min(E.NS, hi + 4)), o = Math.floor(rnd() * E.SUB[s].m);
        place(P, s, o, tool);
      }
    }
    const h = P.events.filter(hid);
    if (h.length) { hits++; h.forEach(id => { which[id] = (which[id] || 0) + 1; }); }
  }
  console.log((hits ? '  ✗ ' : '  ✓ ') + '亂按 ' + RUNS + ' 回（每回 ' + STEPS + ' 步）：完成隱藏任務的回數 ' + hits + (hits ? '（' + JSON.stringify(which) + '）' : ''));
  if (hits) bad++;
}

// ---------- 總結 ----------
const missing = missions.filter(m => !done[m.id]).map(m => m.id);
console.log(missing.length ? '  ✗ 沒有證明到的任務：' + missing.join('、') : '  ✓ ' + missions.length + ' 個任務都證明做得到');
if (missing.length) bad++;
const hidden = missions.filter(m => m.hidden);
console.log('    （公開 ' + missions.filter(m => !m.hidden).length + ' 個 ' + missions.filter(m => !m.hidden).reduce((a, m) => a + m.level, 0) + ' 顆星；隱藏 ' + hidden.length + ' 個，等級 ' + hidden.map(m => m.level).join('、') +
  '，7 級以上 ' + hidden.filter(m => m.level >= 7).length + ' 個，' + hidden.reduce((a, m) => a + m.level * 2, 0) + ' 顆星）');
if (hidden.length !== 10 || hidden.filter(m => m.level >= 7).length < 3 || hidden.some(m => m.level < 3 || m.level > 10 || !m.riddle || !m.riddle.zh || !m.riddle.en)) { console.log('  ✗ 隱藏任務數量、等級或謎語不合規定'); bad++; }
if (bad) { console.log('失敗 ' + bad + ' 項'); process.exitCode = 1; }
