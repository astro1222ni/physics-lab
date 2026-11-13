/* 任務可達成的證明腳本。用法：node tools/mission-proofs/atomic-orbitals.js
 * 用化學核心模擬頁面（js/atomic-orbitals.js）的操作與事件：每個操作照頁面送出 'state'／'cursor'／'probe'／'pin'／'view3d'／'opts3d'／'quiz'，
 * 事件資料和頁面的 snap() 一樣。確認：
 *   1. 預設狀態（沒操作）不送事件、不觸發任務；從預設做一個無關的操作也不觸發隱藏任務。
 *   2. 每個任務都有學生做得到的做法（滑桿範圍、精度、探針的像素精度都考慮進去）。
 *   3. 每個隱藏任務的做法只完成它自己，不會順便完成另一個隱藏任務。
 *   4. 亂按（固定亂數種子）時隱藏任務很少被意外完成（列出來）。
 * 修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const A = require(__ROOT + 'js/atomic-orbitals-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/atomic-orbitals.js');

const LN = A.L_NAMES, DEF_KEY = ['s', 'pz', 'dz2', 'fz3'];
let bad = 0;
const done = {};
const hid = id => /-h\d+$/.test(id);

// ---------- 模擬頁面 ----------
function newPage() {
  return { n: 2, l: 1, key: 'pz', Z: 1, sum: false, plane: 'xz', off: 0, disp: 'dens', v3: false, style: 'iso', pct: 90, cut: false, nodes3: true, plane3: false,
    seen: new Set(), pinned: [], cur: 2, hits: [], hitsFor: '', acted: false, events: [], quiz: { on: false, rev: true, o: null, streak: 0, exact: 0, prev: null },
    half: 0, done: {} };
}
const memo = {};
function cached(k, f) { return k in memo ? memo[k] : (memo[k] = f()); }
function derive(P) {
  const k = A.id(P) + '@' + P.Z;
  P.nodes = cached('n' + k, () => A.radialNodes(P.n, P.l, P.Z));
  if (P.hitsFor !== k) { P.hitsFor = k; P.hits = P.nodes.map(() => false); }
  P.maxD = cached('m' + k + P.sum, () => A.maxDensity({ n: P.n, l: P.l, key: P.key, Z: P.Z }, P.sum));
  P.autoHalf = cached('h' + k, () => Math.max(1.2, Math.round(A.rFrac(P.n, P.l, 0.995, P.Z) * 1.04 * 10) / 10));
  P.half = P.autoHalf;
  P.probeUV = null;   // 頁面的 applyAuto：換軌域、換原子時探針收掉
}
function snap(P) {
  return { id: A.id(P), n: P.n, l: P.l, key: P.key, Z: P.Z, sum: P.sum, plane: P.plane, off: P.off, disp: P.disp,
    blank: A.sliceIsNodal(P.key, P.plane, P.off, P.sum), v3: P.v3, style: P.style, pct: P.pct, cut: P.cut, nodes3: P.nodes3, plane3: P.plane3,
    seen: Array.from(P.seen), pinned: P.pinned.map(p => p.n + LN[p.l] + '@' + p.Z), cur: P.cur, cum: A.cumulative(P.n, P.l, P.cur, P.Z),
    P: A.radialP(P.n, P.l, P.cur, P.Z), nodes: P.nodes.slice(), hits: P.hits.slice(), rMax: cached('r' + P.n + P.l + P.Z, () => A.rMax(P.n, P.l, P.Z)), quiz: P.quiz.on && !P.quiz.rev };
}
function emit(P, type, extra) {
  if (!P.acted) return;
  const ev = { type, data: Object.assign(snap(P), extra || {}) };
  missions.forEach(m => { if (!P.done[m.id] && m.check(ev)) { P.done[m.id] = true; P.events.push(m.id); } });
}
const act = P => { P.acted = true; };
function pick(P, n, l, key) {
  act(P);
  if (P.quiz.on && !P.quiz.rev) { P.quiz.streak = 0; P.quiz.exact = 0; P.quiz.rev = true; }
  if (l >= n) l = n - 1;
  if (!A.ANG[key] || A.ANG[key].l !== l) key = DEF_KEY[l];
  Object.assign(P, { n, l, key });
  if (!P.sum) P.seen.add(A.id(P));
  derive(P); emit(P, 'state');
}
function setZ(P, Z) { act(P); if (Z === P.Z) return; P.Z = Z; derive(P); emit(P, 'state'); }
function setSum(P, v) {
  act(P); const keep = P.probeUV; P.sum = v; if (!v) P.seen.add(A.id(P)); derive(P); P.probeUV = keep;   // 頁面勾加總不收探針
  const ex = {};
  if (keep) {
    const p = A.slicePoint(P.plane, keep[0], keep[1], P.off), r = Math.hypot(p[0], p[1], p[2]);
    if (r > 1e-9) { ex.pAng = Math.abs(A.Y(P.key, p[0], p[1], p[2])) / A.maxAbsY(P.key); ex.pRel = A.density({ n: P.n, l: P.l, key: P.key, Z: P.Z }, p[0], p[1], p[2], P.sum) / P.maxD; }
  }
  emit(P, 'state', ex);
}
function setPlane(P, pl) { act(P); P.plane = pl; emit(P, 'state'); }
/** 切面位置滑桿：−30～30、間隔 0.05 */
function setOff(P, d) { act(P); P.off = Math.round(Math.max(-30, Math.min(30, d)) / 0.05) * 0.05; P.off = +P.off.toFixed(2); emit(P, 'state'); }
function setDisp(P, d) { act(P); P.disp = d; emit(P, 'state'); }
function open3d(P) { act(P); P.v3 = true; emit(P, 'view3d'); }
function opt(P, k, v) { act(P); P[k] = v; emit(P, 'opts3d'); }
function cursor(P, r) {
  act(P);
  P.cur = Math.max(0, Math.min(120, r));
  P.nodes.forEach((rn, i) => { if (Math.abs(P.cur - rn) <= 0.05 / P.Z) P.hits[i] = true; });
  emit(P, 'cursor');
}
function pin(P) {
  act(P);
  if (P.quiz.on && !P.quiz.rev) return;
  if (!P.pinned.some(p => p.n === P.n && p.l === P.l && p.Z === P.Z)) { if (P.pinned.length >= 6) P.pinned.shift(); P.pinned.push({ n: P.n, l: P.l, Z: P.Z }); }
  emit(P, 'pin');
}
function clearAll(P) { act(P); P.pinned.length = 0; }
/** 探針：畫面座標 (u, v) 先依像素量化（畫布 400 px 寬、視野 ±half），再換成 3D 座標 */
function probe(P, u, v, px) {
  act(P);
  const s = (px || 400) / (2 * P.half);
  u = Math.round(u * s) / s; v = Math.round(v * s) / s;
  P.probeUV = [u, v];
  const p = A.slicePoint(P.plane, u, v, P.off), r = Math.hypot(p[0], p[1], p[2]);
  const o = { n: P.n, l: P.l, key: P.key, Z: P.Z };
  const d = A.density(o, p[0], p[1], p[2], P.sum);
  const ps = P.sum ? Math.sqrt(d) : A.psi(o, p[0], p[1], p[2]);
  const theta = r > 1e-9 ? Math.acos(Math.max(-1, Math.min(1, p[2] / r))) * 180 / Math.PI : 0;
  const info = { px: p[0], py: p[1], pz: p[2], pr: r, theta, rel: d / P.maxD, sign: Math.sign(ps) };
  emit(P, 'probe', info);
  return info;
}
function quizStart(P, rand) {
  act(P);
  const o = A.pickQuiz(rand, P.quiz.prev);
  Object.assign(P.quiz, { on: true, rev: false, o, prev: A.id(o) });
  Object.assign(P, { n: o.n, l: o.l, key: o.key, sum: false });
  derive(P);
  const b = A.bestPlane(o.key);
  P.plane = b.plane; P.off = Math.round(b.offsetFrac * A.rMax(o.n, o.l, P.Z) * 100) / 100;
  return o;
}
/** 學生答題：n、副層、（可不選）軌域 */
function quizAnswer(P, an, al, ak) {
  act(P);
  const q = P.quiz, o = q.o;
  const hit = an === o.n && al === o.l, exact = hit && ak === o.key;
  q.streak = hit ? q.streak + 1 : 0; q.exact = exact ? q.exact + 1 : 0; q.rev = true;
  emit(P, 'quiz', { hit, exact, ql: o.l, qn: o.n, qkey: o.key, ansN: an, ansL: al, ansKey: ak || '', streak: q.streak, exactStreak: q.exact });
  return { hit, exact };
}
/** 會數節面的學生：徑向節面 n − l − 1、角節面 l → 一定答對 n、l；看形狀方向也能說出是哪一個軌域（withKey） */
function smartAnswer(P, withKey) { const o = P.quiz.o; return quizAnswer(P, o.n, o.l, withKey ? o.key : ''); }

function fresh() { const P = newPage(); derive(P); return P; }
function report(label, P, id, opts) {
  opts = opts || {};
  const got = P.events.includes(id);
  const others = P.events.filter(x => hid(x) && x !== id);
  const ok = got && (opts.allowHidden || !others.length);
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + id + '：' + label + (others.length ? '（順便完成的隱藏任務：' + others.join('、') + '）' : '') +
    (P.events.length > 1 ? '〔同時完成：' + P.events.filter(x => x !== id).join('、') + '〕' : ''));
  if (ok) done[id] = true; else bad++;
}

// ---------- 0. 預設狀態 ----------
console.log('0. 預設狀態');
{
  const P = fresh();
  // 沒有操作：頁面不送任何事件（userActed = false）；模擬「自動」重算也一樣
  emit(P, 'state'); emit(P, 'cursor');
  if (P.events.length) { console.log('  ✗ 沒操作就觸發：' + P.events.join('、')); bad++; } else console.log('  ✓ 沒操作不送事件，不觸發任何任務');
  // 從預設做一個操作：預設狀態本身不滿足任何任務
  const singles = [
    ['換顯示方式', Q => setDisp(Q, 'phase')], ['切面位置 0.05', Q => setOff(Q, 0.05)], ['換 xz 切面', Q => setPlane(Q, 'xz')],
    ['游標 2.0', Q => cursor(Q, 2)], ['保留曲線', Q => pin(Q)], ['探針點中間', Q => probe(Q, 0, 0)], ['勾切開一角', Q => opt(Q, 'cut', true)],
    ['等值面 50%', Q => opt(Q, 'pct', 50)], ['探針後加總', Q => { probe(Q, 1, 1); setSum(Q, true); }], ['顯示節面', Q => opt(Q, 'nodes3', false)], ['換 H', Q => setZ(Q, 1)]
  ];
  let anyHidden = [];
  singles.forEach(s => { const Q = fresh(); s[1](Q); const h = Q.events.filter(hid); if (h.length) anyHidden.push(s[0] + '→' + h.join('、')); });
  if (anyHidden.length) { console.log('  ✗ 預設狀態下做一個操作就完成隱藏任務：' + anyHidden.join('；')); bad++; }
  else console.log('  ✓ 預設狀態（2pz、H、xz 切面、游標 2a0）做任何一個操作都不完成隱藏任務');
}

// ---------- 1. 一般任務 ----------
console.log('1. 一般任務');
{ const P = fresh(); open3d(P); report('按「3D 立體」', P, 'atomic-orbitals-1'); }
{ const P = fresh(); pick(P, 2, 1, 'px'); pick(P, 2, 1, 'py'); pick(P, 2, 1, 'pz'); report('依序選 2px、2py、2pz', P, 'atomic-orbitals-2'); }
{ const P = fresh(); open3d(P); pick(P, 3, 0, 's'); opt(P, 'cut', true); report('3D、選 3s、勾「切開一角」', P, 'atomic-orbitals-3'); }
{ const P = fresh(); pick(P, 3, 2, 'dxy'); setPlane(P, 'xy'); report('選 3dxy、換 xy 切面（切面位置 0）', P, 'atomic-orbitals-4'); }
{ const P = fresh(); setPlane(P, 'xy'); report('預設 2pz、換 xy 切面：整片 ψ = 0', P, 'atomic-orbitals-5'); }
{
  const P = fresh(); pick(P, 1, 0, 's');
  const rm = A.rMax(1, 0, 1);
  cursor(P, 0.985); const miss = P.done['atomic-orbitals-6'];
  cursor(P, 1.0);
  report('選 1s、游標拖到最高點 r = ' + rm.toFixed(4) + ' a0（0.985 時' + (miss ? '已算' : '還不算') + '）', P, 'atomic-orbitals-6');
}
{
  const P = fresh(); pick(P, 1, 0, 's');
  const r50 = A.rFrac(1, 0, 0.5, 1);
  // 拖曳精度：1s 的圖寬約 4.6 a0、圖 300 px → 每像素 0.015 a0，累積機率每像素約變 0.8%：仍能落在 ±0.5% 內（數字輸入更精確）
  cursor(P, Math.round(r50 / 0.015) * 0.015);
  report('選 1s、游標 r = ' + (Math.round(r50 / 0.015) * 0.015).toFixed(3) + '（r50 = ' + r50.toFixed(4) + '，累積 ' + (A.cumulative(1, 0, P.cur, 1) * 100).toFixed(2) + '%）', P, 'atomic-orbitals-7');
}
{ const P = fresh(); pick(P, 1, 0, 's'); pin(P); pick(P, 2, 0, 's'); pin(P); pick(P, 3, 0, 's'); pin(P); report('保留 1s、2s、3s', P, 'atomic-orbitals-8'); }
{ const P = fresh(); const rand = A.rng32(5); quizStart(P, rand); smartAnswer(P, false); report('認軌域：數節面答出 n 與副層', P, 'atomic-orbitals-9', { allowHidden: true }); }
{ const P = fresh(); setZ(P, 2); pick(P, 1, 0, 's'); cursor(P, 0.5); report('He+、1s、游標 0.500（最可能半徑 ' + A.rMax(1, 0, 2).toFixed(4) + '）', P, 'atomic-orbitals-10'); }
{
  const P = fresh(); pick(P, 3, 0, 's');
  const nd = A.radialNodes(3, 0, 1);
  cursor(P, +nd[0].toFixed(2)); const one = P.done['atomic-orbitals-11'];
  cursor(P, +nd[1].toFixed(2));
  report('3s、游標放到 ' + nd.map(x => x.toFixed(3)).join(' 與 ') + '（只碰一個時' + (one ? '已算' : '還不算') + '）', P, 'atomic-orbitals-11');
}
{
  // 隨機出題，會數節面的學生連續答對 5 題（不選是哪一個軌域：不會順便完成 h10）
  const P = fresh(); const rand = A.rng32(11);
  for (let i = 0; i < 5; i++) { quizStart(P, rand); smartAnswer(P, false); }
  report('認軌域連續答對 5 題（只答 n 與副層）', P, 'atomic-orbitals-12', { allowHidden: true });
  if (P.events.includes('atomic-orbitals-h10')) { console.log('  ✗ 沒選軌域卻完成 h10'); bad++; }
}

// ---------- 2. 隱藏任務（每個只完成自己） ----------
console.log('2. 隱藏任務');
{
  const P = fresh(); setPlane(P, 'xy'); pick(P, 3, 2, 'dz2');
  const pr = probe(P, 4.2, 4.2);
  report('xy 切面、選 3dz²、探針點中間的環 r = ' + pr.pr.toFixed(2) + '（ψ ' + (pr.sign < 0 ? '< 0' : '> 0') + '，最大值的 ' + (pr.rel * 100).toFixed(1) + '%）', P, 'atomic-orbitals-h1');
}
{ const P = fresh(); pick(P, 3, 0, 's'); pin(P); pick(P, 3, 1, 'pz'); pin(P); pick(P, 3, 2, 'dz2'); pin(P); report('保留 3s、3p、3d（同一個 n 能量相同）', P, 'atomic-orbitals-h2'); }
{
  const P = fresh(); pick(P, 3, 2, 'dxy'); setPlane(P, 'xy'); probe(P, 6, 0); setSum(P, true);
  report('3dxy 的 xy 切面、探針點在 x 軸（角節面）r = 6、勾「整個副層加總」：那裡被補滿', P, 'atomic-orbitals-h3');
  const Q = fresh(); pick(Q, 4, 3, 'fz3'); probe(Q, 8 * Math.sin(Math.acos(Math.sqrt(3 / 5))), 8 * Math.sqrt(3 / 5)); setSum(Q, true);
  console.log('    （4fz³ 探針放在圓錐節面 θ = 39.2°、r = 8 再加總：' + (Q.done['atomic-orbitals-h3'] ? '算' : '不算') + '）');
}
{
  const P = fresh(); pick(P, 1, 0, 's'); cursor(P, 0);
  const pr = probe(P, 0.0, 0.0);
  report('1s、游標拉到 0、探針點原子核（|ψ|² = 最大值的 ' + (pr.rel * 100).toFixed(1) + '%，徑向分布 0）', P, 'atomic-orbitals-h4');
  // 像素精度：1s 視野 ±' + half，400 px 的畫布點到最接近中心的像素
  const Q = fresh(); pick(Q, 1, 0, 's'); cursor(Q, 0.02);
  const s = 400 / (2 * Q.half), pr2 = probe(Q, 0.6 / s, -0.4 / s);
  console.log('    （像素精度：視野 ±' + Q.half + ' a0 時一個像素 = ' + (1 / s).toFixed(3) + ' a0，點在中心像素旁 rel = ' + (pr2.rel * 100).toFixed(1) + '%，' + (Q.done['atomic-orbitals-h4'] ? '算' : '不算') + '）');
}
{
  const P = fresh(); pick(P, 3, 2, 'dz2'); setDisp(P, 'phase');
  // 在 xz 切面上沿著虛線（圓錐節面）點：r = 8 a0、θ = 54.74°，依 400 px 畫布的像素量化
  const th = Math.acos(1 / Math.sqrt(3)), pr = probe(P, 8 * Math.sin(th), 8 * Math.cos(th));
  report('3dz²、波函數正負、探針點在虛線上 r = ' + pr.pr.toFixed(2) + '、θ = ' + pr.theta.toFixed(2) + '°', P, 'atomic-orbitals-h5');
  const Q = fresh(); pick(Q, 3, 2, 'dz2'); const p2 = probe(Q, 8 * Math.sin(th + 0.03), 8 * Math.cos(th + 0.03));
  console.log('    （偏 1.7°：θ = ' + p2.theta.toFixed(2) + '°，' + (Q.done['atomic-orbitals-h5'] ? '算' : '不算') + '）');
}
{
  const P = fresh(); pick(P, 2, 0, 's'); pin(P); pick(P, 2, 1, 'pz'); pin(P); pick(P, 2, 0, 's');
  const pk = A.radialPeaks(2, 0, 1)[0];
  cursor(P, +pk.toFixed(2));
  report('保留 2s、2p，回 2s 把游標放在內層小峰 r = ' + pk.toFixed(3) + ' a0', P, 'atomic-orbitals-h6');
}
{
  const P = fresh(); pick(P, 1, 0, 's');
  const r90 = A.rFrac(1, 0, 0.9, 1);
  cursor(P, +r90.toFixed(2));
  report('1s、游標 r = ' + r90.toFixed(2) + ' a0：累積 ' + (A.cumulative(1, 0, P.cur, 1) * 100).toFixed(2) + '%', P, 'atomic-orbitals-h7');
}
{ const P = fresh(); setZ(P, 2); pick(P, 2, 0, 's'); cursor(P, 1.0); report('He+、2s、游標放在徑向節面 r = ' + A.radialNodes(2, 0, 2)[0].toFixed(3) + ' a0', P, 'atomic-orbitals-h8'); }
{
  // 出題直到出現 f 軌域；只答 n 與副層（不選軌域：不會順便完成 h10）
  const P = fresh(); const rand = A.rng32(21); let k = 0;
  for (;;) { const o = quizStart(P, rand); k++; if (o.l === 3) { smartAnswer(P, false); break; } smartAnswer(P, false); }
  report('認軌域第 ' + k + ' 題出現 f，答對 n 與副層', P, 'atomic-orbitals-h9');
}
{
  // 連續 3 題都說出是哪一個軌域；找一段沒有 f 的題目（才不會順便完成 h9）
  let seed = 1, P, list;
  for (; seed < 200; seed++) {
    const rand = A.rng32(seed); list = [];
    for (let i = 0; i < 3; i++) list.push(A.pickQuiz(rand, list.length ? A.id(list[list.length - 1]) : null));
    if (list.every(o => o.l < 3)) break;
  }
  P = fresh(); const rand = A.rng32(seed);
  for (let i = 0; i < 3; i++) { quizStart(P, rand); smartAnswer(P, true); }
  report('認軌域連續 3 題全對（題目 ' + list.map(o => A.text(o)).join('、') + '）', P, 'atomic-orbitals-h10');
}

// ---------- 3. 反例 ----------
console.log('3. 反例');
{
  const cases = [
    ['3dz² 在 xz 切面（不是 xy）', 'atomic-orbitals-h1', P => { pick(P, 3, 2, 'dz2'); }],
    ['xy 切面但切面位置 0.5', 'atomic-orbitals-h1', P => { pick(P, 3, 2, 'dz2'); setOff(P, 0.5); setPlane(P, 'xy'); probe(P, 4.2, 4.2); }],
    ['3dz² 的 xy 切面只看不點', 'atomic-orbitals-h1', P => { pick(P, 3, 2, 'dz2'); setPlane(P, 'xy'); }],
    ['3dz² 的 xy 切面點在環的淡處 r = 1.5', 'atomic-orbitals-h1', P => { pick(P, 3, 2, 'dz2'); setPlane(P, 'xy'); probe(P, 1.5, 0); }],
    ['3d 副層加總但沒放探針', 'atomic-orbitals-h3', P => { pick(P, 3, 2, 'dxy'); setSum(P, true); }],
    ['3dxy 探針點在葉片上再加總', 'atomic-orbitals-h3', P => { pick(P, 3, 2, 'dxy'); setPlane(P, 'xy'); probe(P, 4.2, 4.2); setSum(P, true); }],
    ['3dxy 探針點在節面但離核太近 r = 0.5', 'atomic-orbitals-h3', P => { pick(P, 3, 2, 'dxy'); setPlane(P, 'xy'); probe(P, 0.5, 0); setSum(P, true); }],
    ['3dxy 在 xy 切面位置 0.5（四葉草要過原子核）', 'atomic-orbitals-4', P => { pick(P, 3, 2, 'dxy'); setOff(P, 0.5); setPlane(P, 'xy'); }],
    ['2p 副層加總（不是 d、f）', 'atomic-orbitals-h3', P => { setSum(P, true); }],
    ['保留 3s、3p、2d? 不存在 → 3s、3p、4d', 'atomic-orbitals-h2', P => { pick(P, 3, 0, 's'); pin(P); pick(P, 3, 1, 'pz'); pin(P); pick(P, 4, 2, 'dz2'); pin(P); }],
    ['保留 1s(H)、2s(He+)、3s(H)：不同原子', 'atomic-orbitals-8', P => { pick(P, 1, 0, 's'); pin(P); setZ(P, 2); pick(P, 2, 0, 's'); pin(P); setZ(P, 1); pick(P, 3, 0, 's'); pin(P); }],
    ['1s 探針在原子核，游標在 1 a0', 'atomic-orbitals-h4', P => { pick(P, 1, 0, 's'); cursor(P, 1); probe(P, 0, 0); }],
    ['2s 探針在原子核（不是 1s）', 'atomic-orbitals-h4', P => { pick(P, 2, 0, 's'); cursor(P, 0); probe(P, 0, 0); }],
    ['3dz² 探針在 θ = 54.7° 但離核 1 a0（太近）', 'atomic-orbitals-h5', P => { pick(P, 3, 2, 'dz2'); P.half = 2; const t = Math.acos(1 / Math.sqrt(3)); probe(P, Math.sin(t), Math.cos(t)); }],
    ['2s 內層小峰但沒保留 2p', 'atomic-orbitals-h6', P => { pick(P, 2, 0, 's'); pin(P); cursor(P, 0.76); }],
    ['H 的 2s 節面 2 a0（不是 He+）', 'atomic-orbitals-h8', P => { pick(P, 2, 0, 's'); cursor(P, 2); }],
    ['He+ 的 2s 游標在 2 a0', 'atomic-orbitals-h8', P => { setZ(P, 2); pick(P, 2, 0, 's'); cursor(P, 2); }],
    ['2s 累積 90%（不是 1s）', 'atomic-orbitals-h7', P => { pick(P, 2, 0, 's'); cursor(P, A.rFrac(2, 0, 0.9, 1)); }],
    ['H 的 1s 游標 0.5（He+ 才對）', 'atomic-orbitals-10', P => { pick(P, 1, 0, 's'); cursor(P, 0.5); }]
  ];
  cases.forEach(c => {
    const P = fresh(); c[2](P);
    const ok = !P.events.includes(c[1]);
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + c[0] + '：' + (ok ? '不算 ' + c[1] : '竟然完成 ' + c[1]));
    if (!ok) bad++;
  });
  // 看答案、自己換軌域要讓連勝歸零
  const P = fresh(); const rand = A.rng32(9);
  quizStart(P, rand); smartAnswer(P, true); quizStart(P, rand); smartAnswer(P, true);
  quizStart(P, rand); pick(P, 1, 0, 's'); quizStart(P, rand); smartAnswer(P, true);
  const ok = !P.events.includes('atomic-orbitals-h10') && P.quiz.exact === 1;
  console.log('  ' + (ok ? '✓' : '✗') + ' 連對 2 題後自己換軌域：連勝歸零，第 3 題不算 h10');
  if (!ok) bad++;
}

// ---------- 4. 亂按 ----------
console.log('4. 亂按（只列出來）');
{
  const rand = A.rng32(1113), R = () => rand();
  const tally = {};
  const RUNS = 200, STEPS = 150;
  for (let run = 0; run < RUNS; run++) {
    const P = fresh();
    for (let s = 0; s < STEPS; s++) {
      const k = Math.floor(R() * 12);
      if (k === 0) { const n = 1 + Math.floor(R() * 5); pick(P, n, Math.min(P.l, n - 1), P.key); }
      else if (k === 1) { const l = Math.floor(R() * 4); if (l < P.n) pick(P, P.n, l, DEF_KEY[l]); }
      else if (k === 2) { const ks = A.KEYS[P.l]; pick(P, P.n, P.l, ks[Math.floor(R() * ks.length)]); }
      else if (k === 3) setZ(P, 1 + Math.floor(R() * 3));
      else if (k === 4) setPlane(P, ['xz', 'xy', 'yz'][Math.floor(R() * 3)]);
      else if (k === 5) setOff(P, [-30, 30, 0, (R() * 60 - 30)][Math.floor(R() * 4)]);
      else if (k === 6) cursor(P, [0, 120, R() * 120, R() * 10][Math.floor(R() * 4)]);
      else if (k === 7) probe(P, (R() * 2 - 1) * P.half, (R() * 2 - 1) * P.half);
      else if (k === 8) pin(P);
      else if (k === 9) setSum(P, R() < 0.5);
      else if (k === 10) opt(P, ['cut', 'nodes3', 'plane3'][Math.floor(R() * 3)], R() < 0.5);
      else if (k === 11) { if (R() < 0.3) clearAll(P); else open3d(P); }
    }
    P.events.forEach(id => { tally[id] = (tally[id] || 0) + 1; });
  }
  const hs = Object.keys(tally).filter(hid).sort();
  console.log('    ' + RUNS + ' 次、每次 ' + STEPS + ' 步：' + Object.keys(tally).sort().map(id => id.replace('atomic-orbitals-', '') + ' ' + tally[id]).join('、'));
  console.log('    （亂按會完成的隱藏任務：' + (hs.length ? hs.map(id => id.replace('atomic-orbitals-', '') + ' ' + (tally[id] / RUNS * 100).toFixed(0) + '%').join('、') : '沒有') + '）');
}

// ---------- 總結 ----------
const missing = missions.filter(m => !done[m.id]).map(m => m.id);
console.log(missing.length ? '  ✗ 沒有證明到的任務：' + missing.join('、') : '  ✓ ' + missions.length + ' 個任務都證明做得到');
if (missing.length) bad++;
const hl = missions.filter(m => m.hidden).map(m => m.level);
console.log('    （隱藏任務 ' + hl.length + ' 個，等級 ' + hl.join('、') + '，7 級以上 ' + hl.filter(x => x >= 7).length + ' 個；公開 ' +
  missions.filter(m => !m.hidden).reduce((a, m) => a + m.level, 0) + ' 顆星、隱藏 ' + missions.filter(m => m.hidden).reduce((a, m) => a + m.level * 2, 0) + ' 顆星）');
if (bad) { console.log('失敗 ' + bad + ' 項'); process.exitCode = 1; } else console.log('全部通過');
