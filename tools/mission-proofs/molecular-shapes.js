/* 任務可達成的證明腳本。用法：node tools/mission-proofs/molecular-shapes.js
 * 用化學核心模擬頁面（js/molecular-shapes.js）的操作與事件：
 *   快速選單、自己組合（換中心原子、加減鍵結原子與孤對電子）、拖動電子域、搖一搖（郎之萬退火，最多 ANNEAL.rounds 輪）、
 *   改孤對電子的排斥強度、量鍵角、轉視角。電子域穩定時回報 'settle'，選好兩個鍵時回報 'measure'，轉完視角回報 'view'。
 * 確認每個任務都做得到、頁面預設狀態與「只按快速選單」都不會觸發任務。修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const VC = require(__ROOT + 'js/molecular-shapes-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({ mem: {} }, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/molecular-shapes.js');

const LAM0 = VC.MODEL.lam;
const rng = VC.mulberry32(20261112);

// ---------- 模擬頁面（狀態與事件內容和 js/molecular-shapes.js 一致） ----------
function newPage() {
  const pg = { lam: LAM0, preset: 'CH4', custom: false, info: null };
  setSpec(pg, VC.preset('CH4'));
  settle(pg);
  return pg;
}
function rebuild(pg) {
  pg.P = VC.params(pg.lam);
  pg.glob = VC.globalMin(pg.doms, pg.P);
  pg.mob = 7 / VC.stiffness(pg.doms, pg.P);
}
function setSpec(pg, s, U) {
  pg.spec = { center: s.center, ligs: s.ligs.slice(), lp: s.lp };
  pg.doms = VC.domainsOf(pg.spec);
  rebuild(pg);
  pg.U = U ? U.map(VC.unit) : pg.glob.U.slice();
}
function analyze(pg) {
  const a = VC.analyze(pg.spec, pg.doms, pg.U, pg.P, pg.glob);
  a.lpAxial = 0;
  if (a.N === 5) { const ax = VC.axialFlags(pg.U); pg.doms.forEach((d, i) => { if (d.k === 'L' && ax[i]) a.lpAxial++; }); }
  return a;
}
function settle(pg) { pg.U = VC.relax(pg.doms, pg.U, pg.P, { tol: 1e-10 }).U; pg.info = analyze(pg); return pg.info; }
/** 一輪退火（和頁面相同：溫度 T0 × E最低 × e^(−t/τ)，然後過阻尼運動到穩定） */
function annealRound(pg, cfg) {
  let V = pg.U.slice();
  const dt = 1 / 60;
  for (let t = 0; t < cfg.dur; t += dt) {
    V = VC.thermal(V, cfg.T0 * pg.glob.E * Math.exp(-t / cfg.tau), pg.mob, dt, rng);
    V = VC.flow(pg.doms, V, pg.P, dt, { mob: pg.mob, maxRate: 2.4 }).U;
  }
  for (let k = 0; k < 2000; k++) { const r = VC.flow(pg.doms, V, pg.P, dt, { mob: pg.mob, maxRate: 2.4, tail: true }); V = r.U; if (pg.mob * r.gmax < 0.004) break; }
  pg.U = V;
  return settle(pg);
}
/** 自動的變化（快速選單、自己組合、改排斥強度）：穩定後若停在局部最低點，自動再用力搖（一次最多 rounds 輪） */
function autoSettle(pg, first) {
  let info = first ? annealRound(pg, first) : settle(pg);
  for (let k = 0; k < VC.ANNEAL.rounds - 1 && !info.isGlobal; k++) info = annealRound(pg, VC.ANNEAL.hot);
  return info;
}
function base(pg) {
  const i = pg.info;
  return { center: pg.spec.center, ligs: pg.spec.ligs.slice().sort(), lp: pg.spec.lp, m: i.m, n: i.n, N: i.N, key: i.key, axe: i.axe,
    std: i.m + ',' + i.n, isGlobal: i.isGlobal, lam: pg.lam, lamDefault: Math.abs(pg.lam - LAM0) < 1e-9, preset: pg.preset, custom: pg.custom, lpAxial: i.lpAxial || 0 };
}
function settleData(pg, cause, extra) {
  const i = pg.info, d = base(pg);
  return Object.assign(d, { cause, formula: i.formula.text, shape: i.shape, egeom: i.egeom, E: i.E, Eg: i.Eg, angles: i.angles.map(x => x.a),
    polar: i.polar, dip: i.dipole.mag, charge: i.charge, valid: i.valid, dragAngle: 0, fromLocal: false, lpAxial: i.lpAxial }, extra || {});
}

let log = true;
const done = {};
function fire(label, type, data) {
  const hits = missions.filter(m => !done[m.id] && m.check({ type, data }, m.mem));
  hits.forEach(m => { done[m.id] = label; });
  if (log) console.log(('  ' + label).padEnd(78), hits.map(m => m.id.replace('molecular-shapes-', '#')).join(', ') || '-');
  return hits;
}
const settleEv = (pg, cause, label, extra) => fire(label, 'settle', settleData(pg, cause, extra));
// ---- 操作 ----
function preset(pg, id, label) {
  pg.preset = id; pg.custom = false;
  const p = VC.preset(id);
  setSpec(pg, p, VC.scatter(VC.domainsOf(p), VC.globalMin(VC.domainsOf(p), VC.params(pg.lam)).U, VC.params(pg.lam), 0.55, rng));
  autoSettle(pg);
  return settleEv(pg, 'preset', label || ('快速選單 ' + id));
}
function built(pg, label) { pg.preset = null; pg.custom = true; rebuild(pg); autoSettle(pg, VC.ANNEAL.build); return settleEv(pg, 'build', label); }
function setCenter(pg, el, label) { pg.spec.center = el; return built(pg, label || ('中心原子換成 ' + el)); }
function addLig(pg, x, label) {
  const nb = pg.spec.ligs.length;
  pg.spec.ligs.push(x);
  pg.doms.splice(nb, 0, { k: 'B', lig: x, bo: VC.LIGANDS[x].bo });
  pg.U.splice(nb, 0, VC.freeDirection(pg.U));
  return built(pg, label || ('＋' + x));
}
function removeLig(pg, x, label) {
  const i = pg.spec.ligs.lastIndexOf(x);
  pg.spec.ligs.splice(i, 1); pg.doms.splice(i, 1); pg.U.splice(i, 1);
  return built(pg, label || ('移除一個 ' + x));
}
function addLP(pg, label) { pg.spec.lp++; pg.doms.push({ k: 'L', lig: null, bo: 0 }); pg.U.push(VC.freeDirection(pg.U)); return built(pg, label || '＋孤對電子'); }
function removeLP(pg, label) { pg.spec.lp--; pg.doms.pop(); pg.U.pop(); return built(pg, label || '−孤對電子'); }
/** 拖動第 i 個電子域到方向 u（拖動中其他電子域被推開），放手後穩定（放手不自動搖） */
function drag(pg, i, u, label) {
  const start = pg.U[i].slice();
  // 和頁面一樣：放在另一個電子域原本的位置 20° 以內就換位（VC.dropSwap）；否則抓著它、其他電子域被推開
  const sw = VC.dropSwap(pg.U, i, VC.unit(u), 20);
  let ang;
  if (sw) { ang = VC.angleDeg(start, u); pg.U = sw.U; }
  else {
    pg.U[i] = VC.unit(u);
    pg.U = VC.relax(pg.doms, pg.U, pg.P, { pin: i, tol: 1e-9 }).U;
    ang = VC.angleDeg(start, pg.U[i]);
  }
  settle(pg);
  return settleEv(pg, 'drag', label + '（拖動 ' + ang.toFixed(1) + '°，' + (pg.info.isGlobal ? '能量最低' : '局部最低') + '）', { dragAngle: ang });
}
function shake(pg, label) {
  const fromLocal = !pg.info.isGlobal;
  let info = annealRound(pg, fromLocal ? VC.ANNEAL.hot : VC.ANNEAL.gentle);
  let n = 1;
  for (; n < VC.ANNEAL.rounds && !info.isGlobal; n++) info = annealRound(pg, VC.ANNEAL.hot);
  return settleEv(pg, 'shake', label + '（' + n + ' 輪，' + (info.isGlobal ? '能量最低' : '仍是局部最低') + '）', { fromLocal });
}
function setLam(pg, lam, label) {
  pg.lam = lam; rebuild(pg); autoSettle(pg);
  return settleEv(pg, 'lam', label || ('孤對電子的排斥強度 = ' + lam));
}
function measure(pg, i, j, label) {
  const d = base(pg);
  d.angle = VC.angleDeg(pg.U[i], pg.U[j]);
  d.ligA = pg.doms[i].lig; d.ligB = pg.doms[j].lig;
  return fire(label + '：' + d.angle.toFixed(2) + '°', 'measure', d);
}
function along(pg, dir) {
  let a = 180;
  pg.doms.forEach((d, i) => { if (d.k === 'B') { const x = VC.angleDeg(pg.U[i], dir); a = Math.min(a, x, 180 - x); } });
  return a;
}
function view(pg, dir, label) { const a = along(pg, dir); return fire(label + '（視線和最近的鍵夾 ' + a.toFixed(2) + '°）', 'view', { along: a, settled: true, m: pg.spec.ligs.length, mode: '3d' }); }
const bondIdx = (pg) => pg.doms.map((d, i) => i).filter(i => pg.doms[i].k === 'B');
const lpIdx = (pg) => pg.doms.map((d, i) => i).filter(i => pg.doms[i].k === 'L');
/** 頁面的預設視角（z 朝上，方位角 −62°、仰角 16°）：視線方向（由分子指向觀看者） */
function defaultBack() {
  const az = 50 * Math.PI / 180, el = 30 * Math.PI / 180;
  const rot = (k, th) => { const c = Math.cos(th), s = Math.sin(th), t = 1 - c, [x, y, z] = k; return [[t * x * x + c, t * x * y - s * z, t * x * z + s * y], [t * x * y + s * z, t * y * y + c, t * y * z - s * x], [t * x * z - s * y, t * y * z + s * x, t * z * z + c]]; };
  const mul = (A, B) => A.map((r, i) => [0, 1, 2].map(j => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j]));
  const R = mul(rot([1, 0, 0], el), mul([[1, 0, 0], [0, 0, 1], [0, -1, 0]], rot([0, 0, 1], az)));
  return R[2];
}

console.log('\n=== 預設狀態、只按快速選單、只看不動，都不會觸發任務 ===');
{
  const pg = newPage();
  console.log('  （頁面載入：甲烷自己排好，不回報事件）');
  view(pg, defaultBack(), '預設視角（按「重設視角」）');
  shake(pg, '預設甲烷按「搖一搖（退火）」');
  VC.PRESETS.forEach(p => preset(pg, p.id));
  setLam(pg, 1.2, '甲烷時把排斥強度改成 1.2');
  setLam(pg, LAM0, '再改回預設');
}

console.log('\n=== 1、2、4：拖動、量鍵角 ===');
{
  const pg = newPage();
  preset(pg, 'CH4', '按 CH4');
  const b = bondIdx(pg);
  measure(pg, b[0], b[1], '量 H1–C–H2 → #2');
  const u = VC.rotate(pg.U[b[0]], VC.unit(VC.cross(pg.U[b[0]], pg.U[b[1]])), 35 * Math.PI / 180);
  drag(pg, b[0], u, '把一個 H 拖開 35° 再放手 → #1');
  preset(pg, 'NH3'); measure(pg, 0, 1, '量 NH3 的 H–N–H');
  preset(pg, 'H2O'); measure(pg, 0, 1, '量 H2O 的 H–O–H → #4（CH4 > NH3 > H2O）');
}

console.log('\n=== 3、8、5、h1：自己組合 ===');
{
  const pg = newPage();
  preset(pg, 'CH4', '按 CH4（非極性，記下來）');
  setCenter(pg, 'N', '中心原子換成 N（NH4+，非極性離子）');
  removeLig(pg, 'H', '移除一個 H（N 接 3 個 H、沒有孤對電子：電荷 +2，不合理）');
  addLP(pg, '＋孤對電子 → NH3 → #3');
  const p2 = newPage();
  preset(p2, 'CH4', '按 CH4');
  removeLig(p2, 'H', '移除一個 H（CH3+）');
  addLig(p2, 'Cl', '＋Cl → CH3Cl（極性）→ #8');
  const p3 = newPage();
  preset(p3, 'CH4', '按 CH4');
  ['F', 'F', 'F', 'F'].forEach(x => { removeLig(p3, 'H'); });
  ['F', 'F', 'F'].forEach(x => { addLig(p3, x); });
  addLig(p3, 'F', '＋F → 自己組的 CF4（非極性，第一種）');
  removeLig(p3, 'F'); removeLig(p3, 'F'); addLig(p3, 'O', '＋=O → COF2（極性）');
  const p4 = newPage();
  preset(p4, 'CO2', '按 CO2');
  removeLig(p4, 'O'); addLig(p4, 'O', '移除 =O 再加回 =O → 自己組的 CO2（非極性，第二種）');
  preset(p4, 'BF3'); removeLig(p4, 'F'); addLig(p4, 'F', '自己組的 BF3（非極性，第三種）→ #5');
  preset(p4, 'SF6'); removeLig(p4, 'F'); addLig(p4, 'F', '自己組的 SF6（非極性）');
  preset(p4, 'XeF4'); removeLig(p4, 'F'); addLig(p4, 'F', '自己組的 XeF4（有孤對電子、非極性）→ #7、h1');
}

console.log('\n=== 6、9：蹺蹺板形的赤道與軸向 ===');
{
  const pg = newPage();
  preset(pg, 'SF4', '按 SF4');
  const b = bondIdx(pg);
  // 赤道上的兩個 F：和孤對電子大約 120° 的兩個（軸向的 F 和孤對電子大約 90°）
  const lp = pg.U[lpIdx(pg)[0]];
  const eq = b.filter(i => VC.angleDeg(pg.U[i], lp) > 105);
  measure(pg, eq[0], eq[1], '量 SF4 赤道上的 F–S–F → #6');
  // 把孤對電子拖到其中一個軸向 F 的位置
  const ax = b.filter(i => VC.angleDeg(pg.U[i], lp) < 105);
  drag(pg, lpIdx(pg)[0], pg.U[ax[0]], '把孤對電子拖到軸向 F 的位置，放手');
  console.log('    孤對電子在軸向：' + pg.info.lpAxial + '，能量比最低多 ' + (pg.info.E - pg.info.Eg).toFixed(5));
  shake(pg, '按「搖一搖（退火）」→ #9');
}

console.log('\n=== 10：調出水的實驗值 ===');
{
  const pg = newPage();
  preset(pg, 'H2O', '按 H2O（預設的鍵角 ' + VC.bondAngles(VC.domainsOf(VC.preset('H2O')), VC.globalMin(VC.domainsOf(VC.preset('H2O')), VC.params(LAM0)).U)[0].a.toFixed(3) + '°）');
  const angAt = l => { const d = VC.domainsOf(VC.preset('H2O')); return VC.bondAngles(d, VC.globalMin(d, VC.params(l)).U)[0].a; };
  let lo = 0.5, hi = LAM0;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (angAt(m) > 104.5) lo = m; else hi = m; }
  const lam = Math.round((lo + hi) / 2 * 1000) / 1000;
  console.log('    λ = ' + lam.toFixed(3) + ' 時 ' + angAt(lam).toFixed(3) + '°；滑桿的格子 ' + [0.66, 0.67, 0.68].map(l => l + ' → ' + angAt(l).toFixed(3) + '°').join('、'));
  setLam(pg, 0.68, '滑桿拉到 0.68');
  setLam(pg, lam, '輸入 ' + lam.toFixed(3) + ' → #10');
}

console.log('\n=== 11：兩種不同的鍵結原子、仍然非極性 ===');
{
  const pg = newPage();
  preset(pg, 'SF6', '按 SF6');
  removeLig(pg, 'F'); addLig(pg, 'Cl', '換一個 F 為 Cl（SF5Cl，極性）');
  removeLig(pg, 'F'); addLig(pg, 'Cl', '再換一個（SF4Cl2，看兩個 Cl 在哪裡）');
  const cl = pg.doms.map((d, i) => i).filter(i => pg.doms[i].lig === 'Cl');
  console.log('    兩個 Cl 的夾角 ' + VC.angleDeg(pg.U[cl[0]], pg.U[cl[1]]).toFixed(1) + '°，' + (pg.info.polar ? '極性' : '非極性'));
  if (pg.info.polar) {
    // 把第二個 Cl 拖到第一個 Cl 的正對面（原本在那裡的 F 被推開）
    const opp = pg.U[cl[0]].map(x => -x);
    drag(pg, cl[1], opp, '把一個 Cl 拖到另一個 Cl 的正對面 → #11');
  }
}

console.log('\n=== 12：13 種 AXmEn 全部自己組 ===');
{
  const pg = newPage();
  // 每一種：從快速選單出發，移除一個鍵結原子再加回來（變成「自己組合」）
  [['BeCl2', 'Cl'], ['BF3', 'F'], ['SO2', 'O'], ['CH4', 'H'], ['NH3', 'H'], ['H2O', 'H'], ['PCl5', 'Cl'], ['SF4', 'F'], ['ClF3', 'F'], ['XeF2', 'F'], ['SF6', 'F'], ['BrF5', 'F'], ['XeF4', 'F']].forEach(([id, x]) => {
    log = false; preset(pg, id); removeLig(pg, x); log = true;
    const p = VC.preset(id);
    addLig(pg, x, '自己組的 ' + id + '（' + VC.axe(p.ligs.length, p.lp) + '）' + (id === 'BrF5' ? ' → #12（AX4E2 前面組 XeF4 時已收集）' : ''));
  });
}

console.log('\n=== h2：沿著鍵的方向看 ===');
{
  const pg = newPage();
  preset(pg, 'NH3', '按 NH3');
  view(pg, pg.U[bondIdx(pg)[0]].map(x => x * 1), '把視角轉到一個 N–H 鍵的延長線上 → h2');
}

console.log('\n=== h3：帶電、有孤對電子，形狀仍然對稱 ===');
{
  const pg = newPage();
  preset(pg, 'ClF3', '按 ClF3');
  removeLig(pg, 'F', '移除一個 F（ClF2+）');
  addLP(pg, '＋孤對電子（ClF2−：3 對孤對電子）');
  // 自動補搖是機率性的：還停在局部最低點時，學生會照狀態列的提示按「搖一搖（退火）」
  if (!pg.info.isGlobal) shake(pg, '狀態列說還在局部最低點，按「搖一搖（退火）」→ 直線形 → h3');
  else console.log('  （已經是能量最低的直線形）→ h3');
}

console.log('\n=== 結果 ===');
let ok = true;
missions.forEach(m => {
  const got = done[m.id];
  if (!got) ok = false;
  console.log((got ? '  ✓ ' : '  ✗ ') + m.id.padEnd(22) + ' ★' + String(m.level).padEnd(3) + (m.title ? m.title.zh : '（隱藏）' + m.riddle.zh) + (got ? '' : '　← 沒有達成'));
});
const wrong = Object.keys(done).filter(id => /預設|快速選單|再改回/.test(done[id]));
if (wrong.length) { ok = false; console.log('  ✗ 預設操作或只按快速選單就誤觸：' + wrong.map(id => id + '（' + done[id] + '）').join(', ')); }
console.log(ok ? '\n全部任務都做得到，預設狀態與只按快速選單都不會觸發。' : '\n有任務沒有達成或被誤觸。');
process.exit(ok ? 0 : 1);
