/* 任務可達成的證明腳本。用法：node tools/mission-proofs/conic-sections.js
 * 用數學核心證明每個任務在滑桿範圍與精度內做得到（事件格式與 js/conic-sections.js 相同），
 * 並確認預設狀態、快速切法按鈕都不會觸發任務。修改核心或任務條件後重跑。
 * 滑桿：α 10–70（整數；點數字可輸入到 0.1°）、β 0–90（整數；可輸入到 0.1°）、d 0–3（間隔 0.05；可輸入到 0.01）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const CC = require(ROOT + 'js/conic-sections-core.js');
const missions = [];
global.window = { ConicCore: CC, LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/conic-sections.js');
const byId = id => missions.find(m => m.id === 'conic-sections-' + id);
const DEG = Math.PI / 180;
const f3 = v => (+v).toFixed(3);

// ---------- 與 js/conic-sections.js 相同的事件資料 ----------
function base(s) {
  return {
    alpha: s.alphaDeg, beta: s.betaDeg, d: s.d, type: s.type, family: s.family,
    e: s.e, a: s.a, b: s.b, c: s.c, p: s.p, latus: s.latus, slope: s.slope, phi: s.phi,
    r1: s.spheres[0] ? s.spheres[0].r : NaN, r2: s.spheres[1] ? s.spheres[1].r : NaN, h: s.axisHit
  };
}
const DEFAULT = [30, 55, 2.5];
let committedType = CC.section(30, 55, 2.5).type;
function params(al, be, d, src) {
  const s = CC.section(al, be, d);
  const data = Object.assign(base(s), { src: src || 'slider', prevType: committedType });
  committedType = s.type;
  return { type: 'params', data: data };
}
function measured(s, q) {
  const M = CC.measure(s, q.x, q.y);
  return {
    x: M.x, y: M.y, PF1: M.PF[0], PF2: M.PF.length > 1 ? M.PF[1] : NaN, PD1: M.PD[0], PD2: M.PD.length > 1 ? M.PD[1] : NaN,
    sum: M.sum, diff: M.diff, ratio1: M.ratio[0], ratio2: M.ratio.length > 1 ? M.ratio[1] : NaN
  };
}
function probe(s, par) { return { type: 'probe', data: Object.assign(base(s), { src: 'drag' }, measured(s, CC.pointAt(s, par))) }; }
function mark(s, pars) {
  const rows = pars.map(par => { const m = measured(s, CC.pointAt(s, par)); return { x: m.x, y: m.y, PF1: m.PF1, PF2: m.PF2, sum: m.sum, diff: m.diff, ratio: m.ratio1 }; });
  return { type: 'mark', data: Object.assign(base(s), { n: rows.length, rows: rows }) };
}
/** 頁面「快速切法」按鈕的設定（與 applyPreset 相同） */
function preset(kind, a) {
  if (kind === 'circle') return [a, 90, 2];
  if (kind === 'ellipse') return [a, Math.round(a + (90 - a) * 0.42), 2.5];
  if (kind === 'parabola') return [a, a, 2];
  return [a, Math.round(a * 0.3), 2.5];
}

let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { ok = !!m.check(e, m.mem); });
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}
function reset(type) { committedType = type || CC.section(30, 55, 2.5).type; }

// ---------- 預設狀態與快速切法 ----------
{
  const s = CC.section(30, 55, 2.5);
  let hit = [];
  missions.forEach(m => {
    m.mem = {};
    reset();
    const evs = [params(30, 55, 2.5), probe(s, { br: 1, t: 1.15 }), mark(s, [{ br: 1, t: 1.15 }])];
    if (evs.some(e => m.check(e, m.mem))) hit.push(m.id);
  });
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態（α 30°、β 55°、d 2.5，e = ' + f3(s.e) + '）不觸發任何任務');
  hit = [];
  missions.forEach(m => {
    if (m.id === 'conic-sections-2' || m.id === 'conic-sections-5' || m.id === 'conic-sections-9') return; // 不是 params 事件
    for (let a = 10; a <= 70; a++) {
      ['circle', 'ellipse', 'parabola', 'hyperbola'].forEach(k => {
        m.mem = {}; reset('ellipse');
        const p = preset(k, a);
        if (m.check(params(p[0], p[1], p[2], 'preset'), m.mem)) hit.push(m.id + '@' + k + a);
      });
    }
  });
  if (hit.length) { fail++; console.log('  ✗ 快速切法觸發了 ' + hit.slice(0, 8).join('、')); }
  else console.log('  ✓ 快速切法按鈕（α 10°–70° 全部）不觸發任何任務');
}

// 1 圓：β 拉到 90°
reset(); expect(1, [params(30, 90, 2.5)], true, 'β 從 55° 拉到 90°（滑桿最右端）');
reset(); expect(1, [params(30, 89, 2.5)], false, 'β = 89°（橢圓，e = ' + f3(CC.section(30, 89, 2.5).e) + '）');
reset('circle'); expect(1, [params(30, 90, 2)], false, '本來就是圓，只改 d');
// 2 3D 轉動
expect(2, [{ type: 'rotate3d', data: {} }], true, '在 3D 檢視拖曳轉動視角');
// 3 雙曲線
reset(); expect(3, [params(30, 20, 2.5)], true, 'β 從 55° 拉到 20°（β < α）');
reset(); expect(3, [params(30, 30, 2.5)], false, 'β = 30° = α（拋物線）');
// 4 拋物線：β 必須剛好等於 α
reset(); expect(4, [params(30, 30, 2.5)], true, 'β = α = 30°（整數滑桿就能對準）');
reset(); expect(4, [params(30, 30.1, 2.5)], false, 'β = 30.1°（橢圓，e = ' + CC.section(30, 30.1, 2.5).e.toFixed(5) + '）');
// 5 記錄 4 個分散的點
{
  const s = CC.section(30, 55, 2.5), q = [0, 1.6, 3.1, 4.7].map(t => ({ br: 1, t: t }));
  const ev = mark(s, q);
  expect(5, [ev], true, '預設橢圓上 4 點（PF1 + PF2 = ' + ev.data.rows.map(r => f3(r.sum)).join('、') + '，2a = ' + f3(2 * s.a) + '）');
  expect(5, [mark(s, q.slice(0, 3))], false, '只記 3 點');
  expect(5, [mark(s, [0, 0.05, 0.1, 0.15].map(t => ({ br: 1, t: t })))], false, '4 點擠在一起');
  expect(5, [mark(CC.section(30, 90, 2.5), q)], false, '圓上 4 點');
}
// 6 e = 0.5
reset(); expect(6, [params(20, 62, 2.5)], true, 'α 20°、β 62°：e = cos 62°／cos 20° = ' + CC.section(20, 62, 2.5).e.toFixed(4));
reset(); expect(6, [params(60, 75.5, 2)], true, 'α 60°、β 75.5°（輸入）：e = ' + CC.section(60, 75.5, 2).e.toFixed(4));
reset(); expect(6, [params(20, 61, 2.5)], false, 'α 20°、β 61°：e = ' + CC.section(20, 61, 2.5).e.toFixed(4));
// 7 等軸雙曲線：e = √2，cos β = √2 cos α
reset(); expect(7, [params(60, 45, 2)], true, 'α 60°、β 45°：b／a = ' + (CC.section(60, 45, 2).b / CC.section(60, 45, 2).a).toFixed(5));
reset(); expect(7, [params(60, 44, 2)], false, 'α 60°、β 44°：b／a = ' + (CC.section(60, 44, 2).b / CC.section(60, 44, 2).a).toFixed(4));
// 8 正焦弦 3 = 2 d tan α
{
  const sols = [];
  for (let a = 10; a <= 70; a++) for (let k = 1; k <= 60; k++) { const d = k * 0.05; if (Math.abs(2 * d * Math.tan(a * DEG) - 3) <= 0.02) sols.push('α ' + a + '°、d ' + d.toFixed(2)); }
  console.log('      整數 α、間隔 0.05 的 d 的解：' + sols.join('；'));
  reset(); expect(8, [params(45, 45, 1.5)], true, 'α = β = 45°、d = 1.5：正焦弦 = ' + f3(CC.section(45, 45, 1.5).latus));
  reset(); expect(8, [params(30, 30, 2.6)], true, 'α = β = 30°、d = 2.6：正焦弦 = ' + f3(CC.section(30, 30, 2.6).latus));
  reset(); expect(8, [params(45, 45, 1.55)], false, 'd = 1.55：正焦弦 = ' + f3(CC.section(45, 45, 1.55).latus));
}
// 9 雙曲線上 PF遠 = 2 PF近：近焦點的距離 = 2a（右支 PF1 = e x − a，所以 x = 3a／e）。
//   要讓這一點落在 2D 右圖的範圍內（|x| ≤ 1.45c），需要 e² ≥ 3／1.45，也就是離心率夠大的雙曲線。
{
  const s = CC.section(60, 30, 1.5);
  let lo = 0, hi = 5;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; const m = measured(s, CC.pointAt(s, { br: 1, t: mid })); if (Math.min(m.PF1, m.PF2) < 2 * s.a) lo = mid; else hi = mid; }
  const t = (lo + hi) / 2, m = measured(s, CC.pointAt(s, { br: 1, t: t }));
  const X = 1.45 * s.c, Y = Math.min(Math.max(s.latus / 2 * 1.15, 1.25 * s.b, 0.45 * X), 1.2 * X); // 與 js/conic-sections.js 的 shapeBox 相同
  const inView = Math.abs(m.x) <= X && Math.abs(m.y) <= Y;
  if (!inView) fail++;
  expect(9, [probe(s, { br: 1, t: t })], true, 'α 60°、β 30°、d 1.5（e = ' + f3(s.e) + '）：P = (' + f3(m.x) + ', ' + f3(m.y) + ')，PF1 = ' + f3(m.PF1) + '、PF2 = ' + f3(m.PF2) + '（= 2a、4a）' + (inView ? '，在右圖範圍內' : '，✗ 超出右圖'));
  let a0 = t, a1 = t;
  const ok = tt => { const q = measured(s, CC.pointAt(s, { br: 1, t: tt })); return Math.abs(Math.max(q.PF1, q.PF2) / Math.min(q.PF1, q.PF2) - 2) <= 0.04; };
  while (ok(a0 - 1e-4)) a0 -= 1e-4;
  while (ok(a1 + 1e-4)) a1 += 1e-4;
  const P0 = CC.pointAt(s, { br: 1, t: a0 }), P1 = CC.pointAt(s, { br: 1, t: a1 });
  console.log('      容許範圍沿曲線約 ' + Math.hypot(P1.x - P0.x, P1.y - P0.y).toFixed(3) + ' 單位長（方向鍵一步 0.02）');
  expect(9, [probe(s, { br: -1, t: -t })], true, '左支的對稱點也可以');
  const v = measured(s, CC.pointAt(s, { br: 1, t: 0 }));
  expect(9, [probe(s, { br: 1, t: 0 })], false, '頂點：PF遠／PF近 = ' + f3(Math.max(v.PF1, v.PF2) / Math.min(v.PF1, v.PF2)));
}
// 10 兩個圓錐切出同一個橢圓：b²／a = d tan α，cos²β = cos²α − d sin α cos α／a
{
  let best = null;
  search:
  for (let a1 = 10; a1 <= 60; a1++) for (let b1 = a1 + 1; b1 <= 89; b1++) for (let k1 = 1; k1 <= 60; k1++) {
    const s1 = CC.section(a1, b1, k1 * 0.05);
    if (s1.e < 0.3 || s1.a < 1.2 || s1.a > 3.5) continue; // 示範解挑畫面上看得清楚的橢圓
    for (let a2 = a1 + 10; a2 <= 70; a2 += 1) {
      const d2 = Math.round(s1.b * s1.b / (s1.a * Math.tan(a2 * DEG)) / 0.05) * 0.05;
      if (d2 < 0.05 || d2 > 3) continue;
      const c2 = Math.cos(a2 * DEG) ** 2 - d2 * Math.sin(a2 * DEG) * Math.cos(a2 * DEG) / s1.a;
      if (!(c2 > 0)) continue;
      const b2 = Math.round(Math.acos(Math.sqrt(c2)) / DEG);
      if (b2 <= a2 || b2 > 89) continue;
      const s2 = CC.section(a2, b2, d2);
      const err = Math.max(Math.abs(s2.a / s1.a - 1), Math.abs(s2.b / s1.b - 1));
      if (s2.type === 'ellipse' && s2.e >= 0.3 && err <= 0.01 && (!best || err < best.err)) best = { s1: [a1, b1, k1 * 0.05], s2: [a2, b2, d2], err: err };
      if (best && best.err <= 0.004) break search;
    }
  }
  if (!best) { fail++; console.log('  ✗ 10  找不到整數滑桿的解'); }
  else {
    const s1 = CC.section.apply(null, best.s1), s2 = CC.section.apply(null, best.s2);
    reset(); expect(10, [params.apply(null, best.s1), params.apply(null, best.s2)], true, '（只用滑桿）α ' + best.s1[0] + '°、β ' + best.s1[1] + '°、d ' + best.s1[2].toFixed(2) + ' → a ' + f3(s1.a) + '、b ' + f3(s1.b) +
      '；α ' + best.s2[0] + '°、β ' + best.s2[1] + '°、d ' + best.s2[2].toFixed(2) + ' → a ' + f3(s2.a) + '、b ' + f3(s2.b));
  }
  reset(); expect(10, [params(30, 50, 2), params(30, 50, 2.05)], false, '同一個圓錐（α 相同）只改 d');
  reset(); expect(10, [params(30, 90, 2), params(45, 90, 1.15)], false, '兩個圓（e = 0）');
}
// 11 雙曲線 a = 1、b = 2：d = b²／(a tan α)，cos²β = cos²α + d sin α cos α／a
{
  const sols = [];
  for (let a = 10; a <= 70; a++) for (let be = 0; be < a; be++) for (let k = 1; k <= 60; k++) {
    const s = CC.section(a, be, k * 0.05);
    if (Math.abs(s.a - 1) <= 0.02 && Math.abs(s.b - 2) <= 0.04) sols.push([a, be, k * 0.05, s]);
  }
  console.log('      只用滑桿的解：' + (sols.length ? '共 ' + sols.length + ' 組，例如 ' + sols.slice(0, 5).map(x => 'α ' + x[0] + '°、β ' + x[1] + '°、d ' + x[2].toFixed(2) + '（a ' + f3(x[3].a) + '、b ' + f3(x[3].b) + '）').join('；') : '沒有，需要輸入數字'));
  const typed = [70, 40.1, 1.46];
  const st = CC.section.apply(null, typed);
  reset(); expect(11, [params.apply(null, typed)], true, '（輸入數字）α 70°、β 40.1°、d 1.46 → a ' + f3(st.a) + '、b ' + f3(st.b));
  if (sols.length) { reset(); expect(11, [params(sols[0][0], sols[0][1], sols[0][2])], true, '（只用滑桿）α ' + sols[0][0] + '°、β ' + sols[0][1] + '°、d ' + sols[0][2].toFixed(2)); }
  reset(); expect(11, [params(70, 41, 1.46)], false, 'β 41° → a ' + f3(CC.section(70, 41, 1.46).a) + '、b ' + f3(CC.section(70, 41, 1.46).b));
}
// 12 橢圓 c = 1.5、b = 2（a = 2.5、e = 0.6）：d = 1.6／tan α，cos β = 0.6 cos α
{
  const sols = [];
  for (let a = 10; a <= 70; a++) for (let be = a + 1; be <= 89; be++) for (let k = 1; k <= 60; k++) {
    const s = CC.section(a, be, k * 0.05);
    if (Math.abs(s.c - 1.5) <= 0.02 && Math.abs(s.b - 2) <= 0.02) sols.push([a, be, k * 0.05, s]);
  }
  console.log('      只用滑桿的解：' + (sols.length ? '共 ' + sols.length + ' 組，例如 ' + sols.slice(0, 5).map(x => 'α ' + x[0] + '°、β ' + x[1] + '°、d ' + x[2].toFixed(2) + '（c ' + f3(x[3].c) + '、b ' + f3(x[3].b) + '）').join('；') : '沒有，需要輸入數字'));
  [[30, 58.7, 2.77], [45, 64.9, 1.6], [58, 71.5, 1]].forEach(function (p) {
    const s = CC.section.apply(null, p);
    reset(); expect(12, [params.apply(null, p)], true, '（輸入 β 的小數）α ' + p[0] + '°、β ' + p[1] + '°、d ' + p[2] + ' → c ' + f3(s.c) + '、b ' + f3(s.b));
  });
  reset(); expect(12, [params(45, 66, 1.6)], false, 'β 66° → c ' + f3(CC.section(45, 66, 1.6).c) + '、b ' + f3(CC.section(45, 66, 1.6).b));
}
// 隱藏任務：平面通過頂點（d = 0）的三種退化
reset(); expect('h1', [params(30, 55, 0)], true, 'd 拉到 0，β > α → 一點');
reset(); expect('h2', [params(30, 20, 0)], true, 'd = 0，β < α → 兩條相交直線');
reset(); expect('h3', [params(30, 30, 0)], true, 'd = 0，β = α → 一條直線（平面與圓錐相切於一條母線）');
reset('point'); expect('h1', [params(30, 60, 0)], false, '已經是一點，只改 β');
reset(); expect('h2', [params(30, 20, 0.05)], false, 'd = 0.05（還是雙曲線）');

// ---------- 11/13 新增的隱藏任務 h4–h10 ----------
/** 沿曲線用方向鍵走（和頁面的 stepP 一樣：每步約 0.02 單位長），從 par0 走 n 步，每步回傳 probe 事件 */
function walkP(s, par0, n, dir) {
  const out = []; let par = { br: par0.br, t: par0.t };
  const pt = q => (s.type === 'parabola' ? CC.pointAt(s, { br: 1, t: q.t * 2 * s.p }) : CC.pointAt(s, q));
  for (let i = 0; i < n; i++) {
    const q = pt(par), h = 1e-4, q2 = pt({ br: par.br, t: par.t + h });
    const speed = Math.hypot(q2.x - q.x, q2.y - q.y) / h || 1;
    par = { br: par.br, t: par.t + 0.02 * (dir || 1) / speed };
    if (s.type === 'ellipse') par.t = Math.atan2(Math.sin(par.t), Math.cos(par.t));
    const P2 = pt(par);
    out.push({ type: 'probe', data: Object.assign(base(s), { src: 'key' }, measured(s, P2)) });
  }
  return out;
}
/** 在 α、β 只打到小數第 1 位的格點上，找離心率落在 [lo, hi] 的橢圓 */
function findE(lo, hi) {
  for (let A = 100; A <= 700; A++) for (let B = A + 1; B < 900; B++) {
    const s = CC.section(A / 10, B / 10, 2);
    if (s.type === 'ellipse' && s.e >= lo && s.e <= hi) return [A / 10, B / 10, s.e];
  }
  return null;
}
{
  // h4 雙曲線兩支各記兩點
  const s = CC.section(30, 10, 2);
  reset();
  expect('h4', [params(30, 10, 2), mark(s, [{ br: 1, t: 0 }, { br: 1, t: 1 }, { br: -1, t: 0 }, { br: -1, t: -1 }])], true, 'α = 30°、β = 10°、d = 2 的雙曲線：右支記 2 點、左支記 2 點，每一點 |PF1 − PF2| 都是 2a = ' + f3(2 * s.a));
  expect('h4', [mark(s, [{ br: 1, t: 0 }, { br: 1, t: 1 }, { br: 1, t: -1 }, { br: -1, t: 0 }])], false, '左支只記 1 點');
  expect('h4', [mark(s, [{ br: 1, t: 0 }, { br: 1, t: 0.05 }, { br: -1, t: 0 }, { br: -1, t: 0.05 }])], false, '兩點擠在一起（不夠分散）');
  const se = CC.section(30, 55, 2.5);
  expect('h4', [mark(se, [{ br: 1, t: 0 }, { br: 1, t: 1 }, { br: 1, t: 3 }, { br: 1, t: 4 }])], false, '橢圓不算');
  // h5 拋物線正焦弦端點
  const sp = CC.section(30, 30, 2);
  expect('h5', [probe(sp, { br: 1, t: 2 * sp.p }), probe(sp, { br: 1, t: -2 * sp.p })], true, 'α = β = 30°、d = 2 的拋物線，P = (p, ±2p) = (' + f3(sp.p) + ', ±' + f3(2 * sp.p) + ')：PF = PD = 2p');
  expect('h5', [probe(sp, { br: 1, t: 2 * sp.p })], false, '只站了一端');
  const w5 = walkP(sp, { br: 1, t: 0.8 }, 40).filter(e => Math.abs(e.data.x - sp.p) <= 0.02 * sp.p && Math.abs(Math.abs(e.data.y) - 2 * sp.p) <= 0.02 * sp.p);
  console.log((w5.length ? '  ✓ ' : '  ✗ ') + 'h5  只用方向鍵（每步約 0.02）從預設位置走，有 ' + w5.length + ' 步落在範圍內'); if (!w5.length) fail++;
  expect('h5', [probe(sp, { br: 1, t: 1.6 * sp.p })], false, '預設位置 y = 1.6p');
  expect('h5', [probe(sp, { br: 1, t: 0 })], false, '頂點');
  // h6 三兄弟
  reset();
  expect('h6', [params(30, 30, 2.5), params(30, 30.1, 2.5), params(30, 29.9, 2.5)], true, 'α = 30°、d = 2.5：β = 30°（拋物線）、30.1°（橢圓 e = ' + CC.section(30, 30.1, 2.5).e.toFixed(4) + '）、29.9°（雙曲線 e = ' + CC.section(30, 29.9, 2.5).e.toFixed(4) + '），正焦弦都是 2d tan α = ' + f3(2 * 2.5 * Math.tan(30 * DEG)));
  ['30.1', '29.9'].forEach(b => { const x = CC.section(30, +b, 2.5); if (Math.abs(x.latus - CC.section(30, 30, 2.5).latus) > 1e-9) { fail++; console.log('  ✗ h6 正焦弦不相等 ' + b); } });
  reset();
  expect('h6', [params(30, 30, 2.5), params(30, 31, 2.5), params(30, 29, 2.5)], false, 'β = 31°、29°：e 離 1 太遠（' + CC.section(30, 31, 2.5).e.toFixed(4) + '、' + CC.section(30, 29, 2.5).e.toFixed(4) + '）');
  reset();
  expect('h6', [params(30, 30, 2.5), params(30, 30.1, 2.5), params(30, 29.9, 2)], false, '中途改了 d');
  // h7 正方形
  const s7 = CC.section(45, 60, 2), s7b = CC.section(30, 52.2, 2);
  expect('h7', [probe(s7, { br: 1, t: Math.PI / 2 })], true, 'α = 45°、β = 60°：e = cos 60° ／ cos 45° = √2／2，b = c = ' + f3(s7.b) + '；P 站在短軸端點');
  expect('h7', [probe(s7b, { br: 1, t: -Math.PI / 2 })], true, 'α = 30°、β = 52.2°：b／c = ' + (s7b.b / s7b.c).toFixed(4) + '；P 站在下面的短軸端點');
  const w7 = walkP(s7, { br: 1, t: 1.15 }, 150).filter(e => byId('h7').check(e, {}));
  console.log((w7.length ? '  ✓ ' : '  ✗ ') + 'h7  只用方向鍵從預設位置走，有 ' + w7.length + ' 步落在短軸端點的範圍內'); if (!w7.length) fail++;
  expect('h7', [probe(s7, { br: 1, t: 1.15 })], false, '正方形的橢圓，但 P 不在短軸端點');
  expect('h7', [probe(CC.section(30, 55, 2.5), { br: 1, t: Math.PI / 2 })], false, '預設切法 b／c = ' + (CC.section(30, 55, 2.5).b / CC.section(30, 55, 2.5).c).toFixed(3) + '（不是正方形）');
  // h8 地球與哈雷彗星
  const E = findE(0.0162, 0.0172), Hl = findE(0.966, 0.968);
  if (!E || !Hl) { fail++; console.log('  ✗ h8 找不到格點上的例子'); }
  else {
    reset();
    expect('h8', [params(E[0], E[1], 2), params(Hl[0], Hl[1], 2)], true, '地球：α = ' + E[0] + '°、β = ' + E[1] + '°，e = ' + E[2].toFixed(5) + '；哈雷彗星：α = ' + Hl[0] + '°、β = ' + Hl[1] + '°，e = ' + Hl[2].toFixed(4));
    reset();
    expect('h8', [params(Hl[0], Hl[1], 2), params(E[0], E[1], 2)], true, '先哈雷再地球也可以');
    reset();
    expect('h8', [params(E[0], E[1], 2)], false, '只有地球');
    reset();
    expect('h8', [params(E[0], E[1], 2, 'preset'), params(Hl[0], Hl[1], 2)], false, '快速切法不算');
  }
  // h9 焦點直角
  const s9 = CC.section(30, 46, 2.5);
  const ang = (e) => { const d = e.data, c = Math.max(-1, Math.min(1, (d.PF1 * d.PF1 + d.PF2 * d.PF2 - 4 * d.c * d.c) / (2 * d.PF1 * d.PF2))); return Math.acos(c) / DEG; };
  const okAng = e => Math.abs(ang(e) - 90) <= 1 && Math.abs(e.data.x) >= 0.1 * e.data.a;
  const w9 = walkP(s9, { br: 1, t: 1.15 }, 400).filter(okAng);
  { const m = byId('h9'); m.mem = {}; let g = false; walkP(s9, { br: 1, t: 1.15 }, 2000).forEach(e => { g = m.check(e, m.mem) || g; }); console.log((g ? '  ✓ ' : '  ✗ ') + 'h9  達成：沿橢圓走一圈，在兩個象限都碰到直角'); if (!g) fail++; }
  console.log((w9.length ? '  ✓ ' : '  ✗ ') + 'h9  α = 30°、β = 46°（e = ' + s9.e.toFixed(4) + '）：只用方向鍵沿橢圓走 400 步，有 ' + w9.length + ' 步看兩焦點成 90° ± 1°（例如 ' + (w9[0] ? f3(ang(w9[0])) + '°' : '—') + '）'); if (!w9.length) fail++;
  { const t = Math.asin(Math.sqrt(Math.max(0, s9.c * s9.c - s9.b * s9.b)) / Math.sqrt(s9.a * s9.a - s9.b * s9.b) || 0); }
  expect('h9', [probe(s9, { br: 1, t: Math.PI / 2 })], false, '短軸端點（角度 ' + f3(ang(probe(s9, { br: 1, t: Math.PI / 2 }))) + '°，也不是直角）');
  const s9b = CC.section(45, 60, 2);
  expect('h9', [probe(s9b, { br: 1, t: Math.PI / 2 })], false, 'b = c 的橢圓在短軸端點剛好直角，但那是 h7 的正方形，不算');
  // h10 3-4-5
  const s10 = CC.section(30, 51.8, 2.5);
  const ok10 = e => { const d = e.data; return Math.abs(Math.max(d.PF1, d.PF2) / Math.min(d.PF1, d.PF2) - 4 / 3) <= 0.01 && Math.abs(ang(e) - 90) <= 1; };
  const w10 = walkP(s10, { br: 1, t: 1.15 }, 400).filter(ok10);
  { const m = byId('h10'); m.mem = {}; let g = false; walkP(s10, { br: 1, t: 1.15 }, 2000).forEach(e => { g = m.check(e, m.mem) || g; }); console.log((g ? '  ✓ ' : '  ✗ ') + 'h10 達成：沿橢圓走一圈，在兩個象限都碰到 3-4-5'); if (!g) fail++; }
  console.log((w10.length ? '  ✓ ' : '  ✗ ') + 'h10 α = 30°、β = 51.8°（e = ' + s10.e.toFixed(4) + '，5／7 = 0.7143）：只用方向鍵沿橢圓走 400 步，有 ' + w10.length + ' 步的 PF1 : PF2 ≈ 3 : 4 而且成直角（例如 ' + (w10[0] ? f3(w10[0].data.PF1) + '、' + f3(w10[0].data.PF2) + '、' + f3(2 * s10.c) : '—') + '）'); if (!w10.length) fail++;
  const w10b = (() => { const m = byId('h10'); m.mem = {}; return walkP(s9, { br: 1, t: 1.15 }, 400).filter(e => m.check(e, m.mem)); })();
  console.log((w10b.length ? '  ✗ ' : '  ✓ ') + 'h10 不觸發：e = ' + s9.e.toFixed(4) + ' 的橢圓走一圈都做不到 3-4-5'); if (w10b.length) fail++;
}

// 亂按模擬：拉 α、β、d（滑桿格點或打小數）、快速切法、沿曲線移動 P（拖曳或方向鍵）、記下這一點
{
  let seed = 1113; const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const ri = n => Math.floor(rand() * n);
  const hid = missions.filter(m => /-h(4|5|6|7|8|9|10)$/.test(m.id));
  const all = missions.filter(m => !/-(2)$/.test(m.id));
  const runs = 2000, steps = 150, cnt = {};
  for (let r = 0; r < runs; r++) {
    let al = 30, be = 55, d = 2.5, s = CC.section(al, be, d), par = { br: 1, t: 1.15 }, rows = [];
    reset();
    all.forEach(m => { m.mem = {}; m.got = false; });
    for (let t = 0; t < steps; t++) {
      const u = rand(); const evs = [];
      if (u < 0.5) {
        const which = ri(3); const typed = rand() < 0.25;
        if (which === 0) al = typed ? Math.round((10 + rand() * 60) * 10) / 10 : 10 + ri(61);
        else if (which === 1) be = typed ? Math.round(rand() * 900) / 10 : ri(91);
        else d = typed ? Math.round(rand() * 300) / 100 : ri(61) * 0.05;
        const prev = s; s = CC.section(al, be, d); rows = [];
        if (prev.family !== s.family) par = s.family === 'hyperbola' ? { br: 1, t: 0.75 } : s.family === 'parabola' ? { br: 1, t: 0.8 } : { br: 1, t: 1.15 };
        evs.push(params(al, be, d, 'slider'));
      } else if (u < 0.55) {
        const kinds = ['circle', 'ellipse', 'parabola', 'hyperbola']; const pr = preset(kinds[ri(4)], al);
        [al, be, d] = pr; s = CC.section(al, be, d); rows = []; evs.push(params(al, be, d, 'preset'));
      } else if (u < 0.85) {
        if (s.degenerate) continue;
        if (rand() < 0.5) par = { br: s.type === 'hyperbola' && rand() < 0.5 ? -1 : 1, t: s.type === 'ellipse' || s.type === 'circle' ? rand() * 2 * Math.PI - Math.PI : rand() * 4 - 2 };
        else { const w = walkP(s, par, 1 + ri(5), rand() < 0.5 ? 1 : -1); const last = w[w.length - 1]; evs.push(last); par = null; }
        if (par) { const q = s.type === 'parabola' ? CC.pointAt(s, { br: 1, t: par.t * 2 * s.p }) : CC.pointAt(s, par); evs.push({ type: 'probe', data: Object.assign(base(s), { src: 'drag' }, measured(s, q)) }); }
        else { const last = evs[0].data; par = s.type === 'parabola' ? { br: 1, t: last.y / (2 * s.p) } : CC.nearest(s, last.x, last.y).par; }
      } else if (u < 0.95) {
        if (s.degenerate || !par) continue;
        const q = s.type === 'parabola' ? CC.pointAt(s, { br: 1, t: par.t * 2 * s.p }) : CC.pointAt(s, par);
        const m = measured(s, q); rows.push({ x: m.x, y: m.y, PF1: m.PF1, PF2: m.PF2, sum: m.sum, diff: m.diff, ratio: m.ratio1 });
        evs.push({ type: 'mark', data: Object.assign(base(s), { n: rows.length, rows: rows.slice() }) });
      } else continue;
      evs.forEach(e => all.forEach(m => { if (!m.got && m.check(e, m.mem)) { m.got = true; cnt[m.id] = (cnt[m.id] || 0) + 1; } }));
    }
  }
  const lines = Object.keys(cnt).map(x => x.replace('conic-sections-', '') + ' ' + cnt[x] + ' 次');
  const worst = Math.max(0, ...hid.map(m => cnt[m.id] || 0));
  const ok = worst <= runs * 0.015;
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + '亂按 ' + runs + ' 回（每回 ' + steps + ' 步）：' + (lines.join('、') || '都沒有完成') + '（新的隱藏任務每回都不到 1.5%）');
}

// 做法交叉檢查：最後完成的那幾個事件只完成它自己（「變成某種曲線」的任務 1、3、4 是走到那種曲線的前提，不算）
{
  const s4 = CC.section(30, 10, 2), sp = CC.section(30, 30, 2), s9 = CC.section(30, 46, 2.5), s10 = CC.section(30, 51.8, 2.5);
  const E = findE(0.0162, 0.0172), Hl = findE(0.966, 0.968);
  const first = (s, id) => { const m = byId(id); m.mem = {}; return walkP(s, { br: 1, t: 1.15 }, 2000).filter(e => m.check(e, m.mem)).length ? walkP(s, { br: 1, t: 1.15 }, 2000) : []; };
  const ways = {
    h4: () => { reset(); return [params(30, 10, 2), mark(s4, [{ br: 1, t: 0 }, { br: 1, t: 1 }, { br: -1, t: 0 }, { br: -1, t: -1 }])]; },
    h5: () => { reset('parabola'); return [probe(sp, { br: 1, t: 2 * sp.p }), probe(sp, { br: 1, t: -2 * sp.p })]; },
    h6: () => { reset(); return [params(30, 30, 2.5), params(30, 30.1, 2.5), params(30, 29.9, 2.5)]; },
    h7: () => [probe(CC.section(45, 60, 2), { br: 1, t: Math.PI / 2 })],
    h8: () => { reset('ellipse'); return [params(E[0], E[1], 2), params(Hl[0], Hl[1], 2)]; },
    h9: () => first(s9, 'h9'),
    h10: () => first(s10, 'h10')
  };
  const bad = [];
  Object.keys(ways).forEach(h => {
    const evs = ways[h]();
    const got = missions.filter(m => { m.mem = {}; let g = false; evs.forEach(e => { g = m.check(e, m.mem) || g; }); return g; }).map(m => m.id.replace('conic-sections-', '')).filter(x => !/^(1|3|4)$/.test(x));
    if (got.length !== 1 || got[0] !== h) bad.push(h + ' → ' + got.join('、'));
  });
  if (bad.length) { fail++; console.log('  ✗ 做法會連帶完成別的任務：' + bad.join('；')); }
  else console.log('  ✓ 新隱藏任務的做法都只完成它自己（任務 1、3、4「變成某種曲線」是前提，不算）');
}
{
  const hid = missions.filter(m => m.hidden);
  const lv = hid.map(m => m.level);
  const ok = hid.length === 10 && lv.every(l => l >= 3 && l <= 10) && lv.filter(l => l >= 7).length >= 3;
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + '隱藏任務 ' + hid.length + ' 個，等級 ' + lv.join('、') + '（7 級以上 ' + lv.filter(l => l >= 7).length + ' 個）');
}
{
  const starsOf = m => (m.hidden ? 2 : 1) * m.level;
  const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
  console.log('\n公開 ' + pub.length + ' 個、隱藏 ' + hid.length + ' 個，共 ' + missions.reduce((t, m) => t + starsOf(m), 0) + ' 顆星（公開 ' + pub.reduce((t, m) => t + m.level, 0) + '、隱藏 ' + hid.reduce((t, m) => t + starsOf(m), 0) + '）。');
  if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('隱藏任務超過 20 顆星。'); }
}

console.log(fail ? '\n有 ' + fail + ' 項失敗' : '\n全部通過');
process.exitCode = fail ? 1 : 0;
