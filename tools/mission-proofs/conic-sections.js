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

console.log(fail ? '\n有 ' + fail + ' 項失敗' : '\n全部通過');
process.exitCode = fail ? 1 : 0;
