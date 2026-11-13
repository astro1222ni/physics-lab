/* 任務可達成的證明腳本。用法：node tools/mission-proofs/organic-isomers.js
 * 用化學核心模擬頁面（js/organic-isomers.js）的操作與事件：
 *   組分子 → 'mol'（含本次是否做過順反一對 pairDone、同分子式同維納指數的兩種烷 wienerPair、四取代順反 tetraStereo、檢視 view）；
 *   按「收進圖鑑」→ 'collect'；3D 拖「扭轉角」→ 'twist'；照光扭過 90° 放手 → 'photo'（照頁面的做法在格子上鏡射一側）。
 * 每個分子都用核心的列舉結果擺上格子（和學生在格子上組出來的一樣），確認擺得進 12 × 8 的格子。
 * 確認每個任務都做得到、預設狀態不會觸發任務、隱藏任務彼此不會順便完成。修改核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const O = require(__ROOT + 'js/organic-isomers-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/organic-isomers.js');

let bad = 0;
const done = {};
const QMAX = 11, YMAX = 7;
const inGrid = (q, r) => { const y = r + q / 2; return q >= 0 && q <= QMAX && y >= 0 && y <= YMAX; };
function fresh() { missions.forEach(m => { m.done = false; }); }
function emit(Pg, type, data) {
  if (!Pg.acted) return;
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev)) { m.done = true; Pg.events.push(m.id); } });
}
function page() { return { acted: false, events: [], view: '2d', atoms: [], bonds: [], an: null, seenCT: {}, seenW: {}, dex: {} }; }
function toMol(Pg) {
  return {
    atoms: Pg.atoms.map(a => { const p = O.lxy(a.q, a.r), c = O.lcolor(a.q, a.r); return { el: a.el, x: p.x, y: p.y, z: c === 1 ? 0.35 : c === 2 ? -0.35 : 0 }; }),
    bonds: Pg.bonds.map(b => ({ a: b.a, b: b.b, o: b.o }))
  };
}
function emitMol(Pg) {
  const an = Pg.an;
  if (!an.ok) return;
  let pairDone = false, wienerPair = false;
  if (an.stereo.some(s => s.rel) && !an.stereoUndef) { (Pg.seenCT[an.key0] = Pg.seenCT[an.key0] || {})[an.key] = true; pairDone = Object.keys(Pg.seenCT[an.key0]).length >= 2; }
  if (an.cls === 'alkane') { const k = an.ftext + '|' + an.W; (Pg.seenW[k] = Pg.seenW[k] || {})[an.key] = true; wienerPair = Object.keys(Pg.seenW[k]).length >= 2; }
  emit(Pg, 'mol', { en: an.en, formula: an.ftext, cls: an.cls, key: an.key, key0: an.key0, W: an.W, bp: an.bp, n: Pg.atoms.length, view: Pg.view, pairDone, wienerPair, tetraStereo: !!an.tetraStereo });
}
/** 把核心列舉的抽象結構擺上格子（平移到格子裡），當成學生組好的分子 */
function placeS(x) {
  const pos = O.layout(x.S, x.stereo);
  if (!pos) return null;
  const mq = Math.min(...pos.map(p => p.q)), dq = 1 - mq + ((1 - mq) % 2 ? 1 : 0);
  let P = pos.map(p => ({ q: p.q + dq, r: p.r - dq / 2 }));
  const my = Math.min(...P.map(p => p.r + p.q / 2)), dy = Math.round(1 - my);
  P = P.map(p => ({ q: p.q, r: p.r + dy }));
  if (!P.every(p => inGrid(p.q, p.r))) return null;
  return { atoms: x.S.el.map((e, i) => ({ el: e, q: P[i].q, r: P[i].r })), bonds: x.S.e.map(b => ({ a: b[0], b: b[1], o: b[2] })) };
}
const ALL = {};
function isomers(id) {
  if (ALL[id]) return ALL[id];
  const t = O.target(id);
  ALL[id] = O.enumerate(t.C, t.O, t.H, t.scope).map(x => { const m = placeS(x); return { m, an: m ? O.analyze(toMol({ atoms: m.atoms, bonds: m.bonds })) : null }; });
  return ALL[id];
}
function find(C, Oc, H, scope, en) {
  for (const x of O.enumerate(C, Oc, H, scope)) {
    const m = placeS(x);
    if (m && O.analyze(toMol(m)).en === en) return m;
  }
  return null;
}
function build(Pg, m) {
  if (!m) { console.log('  ✗ 擺不上格子'); bad++; return; }
  Pg.acted = true;
  Pg.atoms = m.atoms.map(a => Object.assign({}, a)); Pg.bonds = m.bonds.map(b => Object.assign({}, b));
  Pg.an = O.analyze(toMol(Pg));
  emitMol(Pg);
}
function setView(Pg, v) { Pg.acted = true; Pg.view = v; if (v === '3d') emitMol(Pg); }
function collect(Pg, id) {
  Pg.acted = true;
  const t = O.target(id), L = Pg.dex[id] = Pg.dex[id] || [], N = O.targetCount(id), an = Pg.an;
  if (!an.ok || an.stereoUndef || !O.inTarget(an, t)) return false;
  if (L.includes(an.key)) { emit(Pg, 'collect', { target: id, n: L.length, total: N, complete: L.length >= N, added: false, en: an.en }); return false; }
  L.push(an.key);
  emit(Pg, 'collect', { target: id, n: L.length, total: N, complete: L.length >= N, added: true, en: an.en });
  return true;
}
function collectAll(Pg, id, views) {
  isomers(id).forEach(x => { build(Pg, x.m); (views || []).forEach(v => setView(Pg, v)); collect(Pg, id); });
}
/** 3D：選鍵 k、扭轉 deg 度（照頁面的計算） */
function twist(Pg, k, deg, light) {
  Pg.acted = true;
  const E = O.embed3D(toMol(Pg)), b = Pg.bonds[k];
  const side = O.side3D(E, b.a, b.b);
  if (!side) return null;
  let tn;
  if (b.o === 2) tn = { E: light ? null : O.PI_BOND * Math.sin(deg * Math.PI / 180) ** 2, order: 2, minHH: 999 };
  else { const r = O.twistEnergy(E, b.a, b.b, O.rotateSide(E, b.a, b.b, side, deg), 0, 1); tn = { E: r.E, order: 1, minHH: r.minHH }; }
  emit(Pg, 'twist', { en: Pg.an.en, order: b.o, angle: deg, E: tn.E, eclipsed: tn.order === 1 && tn.minHH < 5, light: !!light });
  return tn;
}
/** 照光翻轉：和頁面 photoFlip 相同，在格子上把雙鍵一端的原子團鏡射 */
function photo(Pg, k) {
  const b = Pg.bonds[k], from = Pg.an.en, G = Pg.an.G;
  const atomAt = (q, r) => Pg.atoms.findIndex(a => a.q === q && a.r === r);
  const tryFlip = (a, c) => {
    const side = O.sideOf(G, a, c);
    if (!side) return null;
    const A = Pg.atoms[a], C = Pg.atoms[c], inS = {}, np = {};
    side.forEach(i => { inS[i] = true; });
    for (const i of side) {
      if (i === c) continue;
      const p = O.lreflect(Pg.atoms[i].q, Pg.atoms[i].r, A.q, A.r, C.q, C.r);
      if (!inGrid(p.q, p.r)) return null;
      const o = atomAt(p.q, p.r);
      if (o >= 0 && !inS[o]) return null;
      np[i] = p;
    }
    return np;
  };
  const np = tryFlip(b.a, b.b) || tryFlip(b.b, b.a);
  if (!np) return null;
  Object.keys(np).forEach(i => { Pg.atoms[+i].q = np[i].q; Pg.atoms[+i].r = np[i].r; });
  Pg.an = O.analyze(toMol(Pg));
  emit(Pg, 'photo', { from, to: Pg.an.en });
  emitMol(Pg);
  return Pg.an.en;
}
function report(msg, Pg, expect) {
  const ok = expect.every(id => Pg.events.includes(id));
  console.log((ok ? '  ✓ ' : '  ✗ ') + msg + '　→ ' + (Pg.events.join('、') || '（無）'));
  if (!ok) bad++;
  Pg.events.forEach(id => { done[id] = true; });
}
const hid = id => /-h\d+$/.test(id);
function reportH(msg, Pg, id) {
  const extra = Pg.events.filter(x => hid(x) && x !== id);
  report(msg + (extra.length ? '　← 順便完成了 ' + extra.join('、') : ''), Pg, [id]);
  if (extra.length) bad++;
}
const chain = n => { const atoms = [], bonds = []; let q = 4, r = 2; for (let i = 0; i < n; i++) { atoms.push({ el: 'C', q, r }); if (i) bonds.push({ a: i - 1, b: i, o: 1 }); const d = i % 2 === 0 ? O.DIRS[5] : O.DIRS[0]; q += d[0]; r += d[1]; } return { atoms, bonds }; };

// ---------- 預設狀態不觸發 ----------
fresh();
let Pg = page();
Pg.atoms = chain(4).atoms; Pg.bonds = chain(4).bonds; Pg.an = O.analyze(toMol(Pg));
emitMol(Pg); collect(Pg, 'C5H12');
console.log(Pg.events.length ? '  ✗ 沒有操作就完成了任務：' + Pg.events.join('、') : '  ✓ 沒有操作時不送事件、不完成任務（預設是正丁烷）');
if (Pg.events.length) bad++;
fresh(); Pg = page(); build(Pg, chain(4)); setView(Pg, '3d'); collect(Pg, 'C5H12'); twist(Pg, 1, 60);
if (Pg.events.length) { console.log('  ✗ 預設的正丁烷按一按就完成了：' + Pg.events.join('、')); bad++; } else console.log('  ✓ 預設的正丁烷：切 3D、按「收進圖鑑」、把中間的鍵扭 60°，都不完成任何任務');
// 「產生直鏈」1–8 個碳
fresh(); Pg = page();
for (let n = 1; n <= 8; n++) { build(Pg, chain(n)); setView(Pg, '3d'); setView(Pg, '2d'); }
{ const h = Pg.events.filter(hid); console.log((h.length ? '  ✗ ' : '  ✓ ') + '「產生直鏈」1–8 個碳、各切一次 3D：完成 ' + (Pg.events.join('、') || '（無）') + (h.length ? '（含隱藏任務！）' : '，沒有隱藏任務')); if (h.length) bad++; Pg.events.forEach(id => { done[id] = true; }); }

// ---------- 一般任務 ----------
fresh(); Pg = page(); build(Pg, chain(3));
report('產生 3 個碳的直鏈：丙烷', Pg, ['organic-isomers-1']);
fresh(); Pg = page(); build(Pg, find(4, 0, 10, 'alkane', '2-methylpropane'));
report('組出 2-甲基丙烷（沸點 ' + O.BP['2-methylpropane'] + ' °C）', Pg, ['organic-isomers-2']);
{
  const c5 = isomers('C5H12').map(x => x.an).sort((a, b) => a.bp - b.bp);
  fresh(); Pg = page(); build(Pg, find(5, 0, 12, 'alkane', c5[0].en));
  report('C5H12 沸點最低的是 ' + c5[0].en + '（' + c5.map(a => a.en + ' ' + a.bp).join('、') + ' °C）', Pg, ['organic-isomers-3']);
}
fresh(); Pg = page(); collectAll(Pg, 'C5H12');
report('圖鑑 C5H12 收齊 ' + O.targetCount('C5H12') + ' 種', Pg, ['organic-isomers-4']);
// 同一個分子換畫法再收：不加
{
  fresh(); Pg = page();
  build(Pg, chain(5)); collect(Pg, 'C5H12');
  const bent = { atoms: [{ el: 'C', q: 2, r: 2 }, { el: 'C', q: 3, r: 2 }, { el: 'C', q: 4, r: 1 }, { el: 'C', q: 4, r: 0 }, { el: 'C', q: 5, r: -1 }], bonds: [0, 1, 2, 3].map(i => ({ a: i, b: i + 1, o: 1 })) };
  build(Pg, bent);
  const added = collect(Pg, 'C5H12');
  console.log((Pg.an.en === 'pentane' && !added ? '  ✓ ' : '  ✗ ') + '把戊烷畫成彎的再收：判斷為同一個分子（' + Pg.an.en + '），圖鑑不增加');
  if (Pg.an.en !== 'pentane' || added) bad++;
}
fresh(); Pg = page();
build(Pg, find(4, 0, 8, 'ene', 'cis-2-butene'));
const pair1 = Pg.events.slice();
build(Pg, find(4, 0, 8, 'ene', 'trans-2-butene'));
report('先組順-2-丁烯（' + (pair1.join('、') || '無任務') + '）再組反-2-丁烯', Pg, ['organic-isomers-5']);
fresh(); Pg = page(); build(Pg, find(4, 0, 8, 'ene', 'cis-2-butene')); build(Pg, find(4, 0, 8, 'ene', '1-butene')); build(Pg, find(4, 0, 8, 'ene', 'cis-2-butene'));
{ const ok = !Pg.events.includes('organic-isomers-5'); console.log((ok ? '  ✓ ' : '  ✗ ') + '順-2-丁烯組兩次、中間夾 1-丁烯：不算一對順反'); if (!ok) bad++; }
fresh(); Pg = page(); collectAll(Pg, 'C2H6O');
report('圖鑑 C2H6O 收齊：' + isomers('C2H6O').map(x => x.an.en + ' ' + x.an.bp + ' °C').join('、'), Pg, ['organic-isomers-6']);
fresh(); Pg = page(); collectAll(Pg, 'C6H14');
report('圖鑑 C6H14 收齊 ' + O.targetCount('C6H14') + ' 種', Pg, ['organic-isomers-7']);
{
  fresh(); Pg = page();
  build(Pg, find(4, 0, 8, 'ene', 'cis-2-butene')); setView(Pg, '3d');
  const k = Pg.bonds.findIndex(b => b.o === 2);
  const dark = twist(Pg, k, 90, false);
  const to = photo(Object.assign(Pg, {}), k);
  report('順-2-丁烯、3D、選 C=C（不照光扭到 90°：' + dark.E.toFixed(0) + ' kJ/mol = ' + (dark.E / O.RT298).toFixed(0) + ' RT）；勾照光扭到 150° 放手 → ' + to, Pg, ['organic-isomers-8']);
  twist(Pg, k, 150, true);
}
// 不照光時頁面會把雙鍵彈回、不翻轉；照光但沒超過 90° 也彈回：不送 'photo'
fresh(); Pg = page();
build(Pg, find(4, 0, 8, 'hc', 'cis-2-butene')); setView(Pg, '3d');
twist(Pg, Pg.bonds.findIndex(b => b.o === 2), 90, false); twist(Pg, Pg.bonds.findIndex(b => b.o === 2), 80, true);
{ const ok = !Pg.events.includes('organic-isomers-8'); console.log((ok ? '  ✓ ' : '  ✗ ') + '只扭雙鍵、沒有照光扭過 90° 放手：不算任務 8'); if (!ok) bad++; }
fresh(); Pg = page(); collectAll(Pg, 'C4H8');
report('圖鑑 C4H8（全部，含環與順反）收齊 ' + O.targetCount('C4H8') + ' 種：' + isomers('C4H8').map(x => x.an.en).join('、'), Pg, ['organic-isomers-9']);
fresh(); Pg = page(); collectAll(Pg, 'C4H10O');
report('圖鑑 C4H10O 收齊 ' + O.targetCount('C4H10O') + ' 種', Pg, ['organic-isomers-10']);
fresh(); Pg = page(); collectAll(Pg, 'C7H16');
report('圖鑑 C7H16 收齊 ' + O.targetCount('C7H16') + ' 種', Pg, ['organic-isomers-11']);
fresh(); Pg = page(); collectAll(Pg, 'C8H18');
report('圖鑑 C8H18 收齊 ' + O.targetCount('C8H18') + ' 種', Pg, ['organic-isomers-12']);
// 每一題都要擺得上格子
O.TARGETS.forEach(t => {
  const miss = isomers(t.id).filter(x => !x.m).length;
  if (miss) { console.log('  ✗ ' + t.id + ' 有 ' + miss + ' 個異構物擺不上 12 × 8 的格子'); bad++; }
});
console.log('  ✓ 14 個圖鑑題目（共 ' + O.TARGETS.reduce((s, t) => s + O.targetCount(t.id), 0) + ' 個分子）都擺得上 12 × 8 的格子');

// ---------- 隱藏任務 ----------
fresh(); Pg = page(); build(Pg, find(3, 1, 6, 'carbonyl', 'propanone'));
reportH('組出丙酮（去光水的主成分，沸點 ' + O.BP.propanone + ' °C）', Pg, 'organic-isomers-h1');
fresh(); Pg = page(); build(Pg, find(4, 0, 6, 'hc', '2-butyne')); setView(Pg, '3d');
{
  const E = O.embed3D(toMol(Pg)), C = E.atoms.map((a, i) => i).filter(i => E.atoms[i].el === 'C');
  const ang = (i, j, k) => { const a = E.atoms[i], b = E.atoms[j], c = E.atoms[k]; const u = [a.x - b.x, a.y - b.y, a.z - b.z], v = [c.x - b.x, c.y - b.y, c.z - b.z]; return Math.acos((u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / Math.hypot(...u) / Math.hypot(...v)) * 180 / Math.PI; };
  const sp = Pg.bonds.filter(b => b.o === 3)[0];
  const outer = [sp.a, sp.b].map(x => Pg.bonds.filter(b => (b.a === x || b.b === x) && b !== sp).map(b => b.a === x ? b.b : b.a)[0]);
  reportH('組出 2-丁炔、切到 3D（四個碳排成直線：' + ang(outer[0], sp.a, sp.b).toFixed(0) + '°、' + ang(sp.a, sp.b, outer[1]).toFixed(0) + '°）', Pg, 'organic-isomers-h2');
}
fresh(); Pg = page(); build(Pg, chain(2)); setView(Pg, '3d');
{ const st = twist(Pg, 0, 30); const ec = twist(Pg, 0, 60); reportH('乙烷、3D、把 C–C 扭 60°：重疊式（30° 時 ' + st.E.toFixed(1) + '、60° 時 ' + ec.E.toFixed(1) + ' kJ/mol = ' + (ec.E / O.RT298).toFixed(1) + ' RT）', Pg, 'organic-isomers-h3'); }
{
  // 丁烷的中間鍵扭到兩個甲基重疊：不算 h3（謎語指的是乙烷）
  fresh(); Pg = page(); build(Pg, chain(4)); setView(Pg, '3d');
  let mx = 0; for (let d = 0; d <= 360; d += 5) { const r = twist(Pg, 1, d); mx = Math.max(mx, r.E); }
  const ok = !Pg.events.includes('organic-isomers-h3');
  console.log((ok ? '  ✓ ' : '  ✗ ') + '正丁烷中間的鍵轉一整圈（最高 ' + mx.toFixed(1) + ' kJ/mol）：不算 h3');
  if (!ok) bad++;
}
fresh(); Pg = page(); build(Pg, find(5, 0, 8, 'hc', '2-methyl-1,3-butadiene'));
reportH('組出 2-甲基-1,3-丁二烯（異戊二烯，天然橡膠的單體）', Pg, 'organic-isomers-h4');
fresh(); Pg = page();
{
  const hexa = { atoms: O.DIRS.map(d => ({ el: 'C', q: 5 + d[0], r: 1 + d[1] })), bonds: [0, 1, 2, 3, 4, 5].map(i => ({ a: i, b: (i + 1) % 6, o: 1 })) };
  build(Pg, hexa); setView(Pg, '3d');
  const E = O.embed3D(toMol(Pg)), dh = [0, 1, 2, 3, 4, 5].map(i => O.dihedral(E.atoms, i, (i + 1) % 6, (i + 2) % 6, (i + 3) % 6));
  reportH('六個碳圍成六邊形、切到 3D：環己烷（二面角 ' + dh.map(x => x.toFixed(0)).join('、') + '°，椅式）', Pg, 'organic-isomers-h5');
  fresh(); const P2 = page(); build(P2, hexa);
  const ok = !P2.events.includes('organic-isomers-h5');
  console.log((ok ? '  ✓ ' : '  ✗ ') + '只在 2D 組出環己烷：不算 h5（要看到立體的椅子）');
  if (!ok) bad++;
}
{
  const c7 = isomers('C7H16').map(x => x.an), byW = {};
  c7.forEach(a => { (byW[a.W] = byW[a.W] || []).push(a.en); });
  const ties = Object.keys(byW).filter(w => byW[w].length > 1).map(w => 'W ' + w + '：' + byW[w].join(' 與 '));
  fresh(); Pg = page(); build(Pg, find(7, 0, 16, 'alkane', '2,2-dimethylpentane')); build(Pg, find(7, 0, 16, 'alkane', '2,3-dimethylpentane'));
  reportH('組出 2,2-二甲基戊烷再組 2,3-二甲基戊烷（C7H16 維納指數相同的：' + ties.join('；') + '；C4–C6 沒有）', Pg, 'organic-isomers-h6');
  ['C4H10', 'C5H12', 'C6H14'].forEach(id => { const W = isomers(id).map(x => x.an.W); if (new Set(W).size !== W.length) { console.log('  ✗ ' + id + ' 有相同的維納指數'); bad++; } });
}
fresh(); Pg = page();
{
  const ben = { atoms: O.DIRS.map(d => ({ el: 'C', q: 5 + d[0], r: 1 + d[1] })), bonds: [0, 1, 2, 3, 4, 5].map(i => ({ a: i, b: (i + 1) % 6, o: i % 2 ? 2 : 1 })) };
  build(Pg, ben);
  reportH('六邊形的環、單雙鍵交替：苯（凱庫勒的夢）', Pg, 'organic-isomers-h7');
}
fresh(); Pg = page(); build(Pg, find(8, 0, 18, 'alkane', '2,2,4-trimethylpentane'));
reportH('組出 2,2,4-三甲基戊烷（異辛烷，辛烷值 100 的標準）', Pg, 'organic-isomers-h8');
fresh(); Pg = page();
{
  const m = find(8, 0, 16, 'ene', 'cis-3,4-dimethyl-3-hexene') || find(8, 0, 16, 'hc', 'cis-3,4-dimethyl-3-hexene');
  build(Pg, m);
  reportH('組出順-3,4-二甲基-3-己烯（雙鍵兩端的碳都沒有氫，仍有順反）', Pg, 'organic-isomers-h9');
  fresh(); const P2 = page(); build(P2, find(5, 0, 10, 'ene', '2-methyl-2-butene')); build(P2, find(6, 0, 12, 'ene', '2,3-dimethyl-2-butene') || chain(2));
  const ok = !P2.events.includes('organic-isomers-h9');
  console.log((ok ? '  ✓ ' : '  ✗ ') + '2-甲基-2-丁烯、2,3-二甲基-2-丁烯（四取代但沒有順反）：不算 h9');
  if (!ok) bad++;
}
fresh(); Pg = page(); build(Pg, find(8, 0, 18, 'alkane', '2,2,3,3-tetramethylbutane'));
reportH('組出 2,2,3,3-四甲基丁烷（沸點 ' + O.BP['2,2,3,3-tetramethylbutane'] + ' °C，熔點 ' + O.MP['2,2,3,3-tetramethylbutane'] + ' °C：18 種辛烷中唯一室溫是固體）', Pg, 'organic-isomers-h10');

// ---------- 把每一題的異構物都組一遍、2D 與 3D 各一次、全部收進圖鑑：會順便完成哪些隱藏任務 ----------
{
  const hits = {};
  O.TARGETS.forEach(t => { fresh(); const P3 = page(); collectAll(P3, t.id, ['3d', '2d']); P3.events.filter(hid).forEach(id => { (hits[id] = hits[id] || []).push(t.id); }); });
  console.log('    （把 14 題的異構物全部組過並收齊時順便完成的隱藏任務：' + (Object.keys(hits).sort().map(k => k.replace('organic-isomers-', '') + '←' + hits[k].join('/')).join('、') || '無') + '；這些是圖鑑裡本來就有的分子，學生要自己收集到那一題才會碰到）');
}

// ---------- 總結 ----------
const missing = missions.filter(m => !done[m.id]).map(m => m.id);
console.log(missing.length ? '  ✗ 沒有證明到的任務：' + missing.join('、') : '  ✓ ' + missions.length + ' 個任務都證明做得到');
if (missing.length) bad++;
const hidden = missions.filter(m => m.hidden);
const lv = hidden.map(m => m.level);
const okLv = hidden.length === 10 && lv.every(l => l >= 3 && l <= 10) && lv.filter(l => l >= 7).length >= 3 && hidden.every(m => m.riddle && m.riddle.zh && m.riddle.en);
console.log((okLv ? '  ✓ ' : '  ✗ ') + '隱藏任務 ' + hidden.length + ' 個，等級 ' + lv.join('、') + '（7 級以上 ' + lv.filter(l => l >= 7).length + ' 個），都有中英文謎語');
if (!okLv) bad++;
const pub = missions.filter(m => !m.hidden);
const cjk = /[　-〿㐀-鿿＀-￯]/;
const enBad = missions.filter(m => [m.title && m.title.en, m.desc && m.desc.en, m.riddle && m.riddle.en].some(s => s && cjk.test(s))).map(m => m.id);
console.log((enBad.length ? '  ✗ 英文有中文或全形字：' + enBad.join('、') : '  ✓ 英文的標題、說明、謎語都沒有中文或全形標點'));
if (enBad.length) bad++;
console.log('    （公開 ' + pub.length + ' 個 ' + pub.reduce((s, m) => s + m.level, 0) + ' 顆星、隱藏 ' + hidden.length + ' 個 ' + hidden.reduce((s, m) => s + m.level * 2, 0) + ' 顆星）');
if (bad) { console.log('失敗 ' + bad + ' 項'); process.exitCode = 1; }
