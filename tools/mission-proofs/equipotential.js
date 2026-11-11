/* 任務可達成的證明腳本（等位線與電場：導電紙實驗）。用法：node tools/mission-proofs/equipotential.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。
 * 做法：只用物理核心 js/equipotential-core.js，照頁面 js/equipotential.js 的方式組出完全相同的事件資料
 * （1 V 的數值解乘上電源電壓、電表讀數與誤差、依 N1 分組、排序平滑、電極當等位線、估算電場），
 * 丟進 js/missions/equipotential.js 的檢查函式。「學生」用二分法移動紅探針，直到電表顯示目標讀數才記錄。
 * 含誤差的任務用許多組隨機數重做，列出成功率。所有設定都在 equipotential.html 的滑桿範圍內。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const EC = require(__ROOT + 'js/equipotential-core.js');
const defs = {};
global.window = { EquipotentialCore: EC, LabMission: { register: (id, list) => list.forEach(m => { defs[m.id] = m; }) } };
global.LabMission = global.window.LabMission;
require(__ROOT + 'js/missions/equipotential.js');

const SW = EC.SHEET_W, SH = EC.SHEET_H;
const MARK_SIGMA = 0.05, OFFSET_MAX = 0.015, JITTER_V = 0.008, JITTER_I = 0.15e-6, SIGMA_AMP = 0.04;
const RANGE = { d: [4, 26, 0.5], a: [0.3, 1.5, 0.05], L: [4, 20, 1], V0: [1, 12, 0.5] };
const failures = [];
function assertUI(o) {
  for (const k of Object.keys(RANGE)) {
    const r = RANGE[k], v = o[k];
    if (v == null) continue;
    const ok = v >= r[0] - 1e-9 && v <= r[1] + 1e-9 && Math.abs(Math.round((v - r[0]) / r[2]) * r[2] + r[0] - v) < 1e-9;
    if (!ok) failures.push(k + ' = ' + v + ' 不在滑桿範圍或刻度上');
  }
}

// ---------------------------------------------------------------------
// 照頁面組出的「實驗桌」
// ---------------------------------------------------------------------
const solCache = new Map();
function Lab(o) {
  const s = Object.assign({ type: 'circles', d: 14, a: 0.75, L: 20, V0: 6, noise: false, seed: 1, meter: 'dmm' }, o);
  assertUI(s);
  if (s.type !== 'bars') s.d = Math.min(s.d, SW - 2 * s.a - 1);
  const rnd = EC.rng(1000 + s.seed * 7919);
  const key = [s.type, s.d, s.a, s.L, s.noise ? s.seed : 0].join('|');
  let sol = solCache.get(key);
  if (!sol) {
    const cfg = { type: s.type, d: s.d, a: s.a, L: s.L, V0: 1 };
    if (s.noise) cfg.sigma = { seed: s.seed, amp: SIGMA_AMP };
    sol = EC.solve(cfg);
    solCache.set(key, sol);
  }
  const lab = {
    s: s, sol: sol, rnd: rnd, recs: [], power: true, clip: false, n1: { x: 11.5, y: 5.5 }, n2: { x: 18.5, y: 13.5 },
    drawLines: false, drawField: false,
    offset: s.noise ? (rnd() * 2 - 1) * OFFSET_MAX : 0, jitter: 0, jitterI: 0
  };
  lab.V0eff = function () { return lab.power ? s.V0 : 0; };
  lab.pot = function (x, y) { return lab.V0eff() * EC.potentialAt(sol, x, y); };
  lab.field = function (x, y) { const f = EC.fieldAt(sol, x, y), k = lab.V0eff(); return { ex: f.ex * k, ey: f.ey * k, E: f.E * k }; };
  lab.neg = function () { return sol.els.find(e => e.sign < 0); };
  lab.pos = function () { return sol.els.find(e => e.sign > 0); };
  lab.n1Pos = function () {
    if (lab.clip) { const e = lab.neg(); return e.kind === 'circle' ? { x: e.x, y: e.y } : { x: (e.x0 + e.x1) / 2, y: (e.y0 + e.y1) / 2 }; }
    return lab.n1;
  };
  lab.newJitter = function () {
    if (!s.noise) return;
    lab.jitter = JITTER_V * EC.gauss(rnd);
    lab.jitterI = JITTER_I * EC.gauss(rnd);
  };
  lab.meter = function () {
    const p1 = lab.n1Pos(), p2 = lab.n2;
    const V1 = lab.pot(p1.x, p1.y), V2 = lab.pot(p2.x, p2.y), dV = V2 - V1;
    if (s.meter === 'dmm') {
      const r = EC.dmmReading(dV, s.noise ? { offset: lab.offset, jitter: lab.jitter } : null);
      return { V1, V2, dV, reading: r };
    }
    const I = EC.galvCurrent(dV, s.noise ? { jitterI: lab.jitterI } : null);
    let uA = Math.round(I * 1e7) / 10;
    if (Math.abs(uA) < 0.05) uA = 0;
    return { V1, V2, dV, I, over: Math.abs(I) > EC.GALV_FS, reading: uA * 1e-6 * EC.GALV_R };
  };
  return lab;
}
function elPath(e) {
  const p = [];
  if (e.kind === 'circle') {
    for (let q = 0; q <= 96; q++) { const t = 2 * Math.PI * q / 96; p.push([e.x + e.r * Math.cos(t), e.y + e.r * Math.sin(t)]); }
    return p;
  }
  const c = [[e.x0, e.y0], [e.x1, e.y0], [e.x1, e.y1], [e.x0, e.y1], [e.x0, e.y0]];
  for (let i = 1; i < c.length; i++) {
    const n = 24;
    for (let q = (i === 1 ? 0 : 1); q <= n; q++) p.push([c[i - 1][0] + (c[i][0] - c[i - 1][0]) * q / n, c[i - 1][1] + (c[i][1] - c[i - 1][1]) * q / n]);
  }
  return p;
}
function analysis(lab) {
  const recs = lab.recs;
  const groups = EC.groupRecords(recs.map(r => ({ n1x: r.n1x, n1y: r.n1y, reading: r.reading, V1: r.V1 })));
  groups.forEach((g, n) => {
    g.name = 'L' + (n + 1);
    g.pts = g.idx.map(i => [recs[i].x, recs[i].y]);
    g.trueV = g.idx.map(i => recs[i].V2);
    let span = 0;
    for (let i = 0; i < g.pts.length; i++) for (let j = i + 1; j < g.pts.length; j++) span = Math.max(span, Math.hypot(g.pts[i][0] - g.pts[j][0], g.pts[i][1] - g.pts[j][1]));
    g.span = span;
    g.vRange = g.trueV.length ? Math.max.apply(null, g.trueV) - Math.min.apply(null, g.trueV) : 0;
    if (g.pts.length >= 3) { const o = EC.orderPoints(g.pts); g.closed = o.closed; g.path = EC.smoothPath(o.pts, o.closed, 10); }
    else if (g.pts.length === 2) { g.closed = false; g.path = g.pts.slice(); }
    else g.path = null;
  });
  return groups;
}
function common(lab) {
  const s = lab.s, G = analysis(lab);
  return {
    type: s.type, d: s.d, a: s.a, L: s.L, V0: s.V0, power: lab.power, noise: s.noise, meter: s.meter,
    fullBars: s.type !== 'circles' && s.L >= SH,
    groups: G.map(g => ({ V: g.V, n: g.pts.length, span: g.span, vRange: g.vRange })),
    total: lab.recs.length, drawLines: lab.drawLines, drawField: lab.drawField
  };
}
function probeInfo(lab) {
  const p1 = lab.n1Pos(), p2 = lab.n2, m = lab.meter(), els = lab.sol.els;
  const corner = Math.min(Math.hypot(p2.x, p2.y), Math.hypot(SW - p2.x, p2.y), Math.hypot(p2.x, SH - p2.y), Math.hypot(SW - p2.x, SH - p2.y));
  let behind = false;
  els.forEach(e => {
    if (e.kind !== 'rect') return;
    if (e.sign > 0 && p2.x <= e.x0 - 1 && p2.y >= e.y0 && p2.y <= e.y1) behind = true;
    if (e.sign < 0 && p2.x >= e.x1 + 1 && p2.y >= e.y0 && p2.y <= e.y1) behind = true;
  });
  return {
    x: p2.x, y: p2.y, x1: p1.x, y1: p1.y, clip: lab.clip, reading: m.reading, dV: m.dV, V1: m.V1, V2: m.V2,
    onElectrode: EC.electrodeAt(els, p2.x, p2.y) >= 0, n1OnElectrode: lab.clip || EC.electrodeAt(els, p1.x, p1.y) >= 0,
    dist12: Math.hypot(p2.x - p1.x, p2.y - p1.y), corner, behind,
    E2: lab.field(p2.x, p2.y).E, Ecent: lab.field(SW / 2, SH / 2).E
  };
}
/** 頁面的 record()：傳回事件資料（電源未接通或檢流計超出刻度時傳回 null） */
function record(lab) {
  if (!lab.power) return null;
  const m = lab.meter();
  if (lab.s.meter === 'galv' && m.over) return null;
  const p1 = lab.n1Pos(), p2 = lab.n2;
  const mx = lab.s.noise ? p2.x + MARK_SIGMA * EC.gauss(lab.rnd) : p2.x, my = lab.s.noise ? p2.y + MARK_SIGMA * EC.gauss(lab.rnd) : p2.y;
  const rec = { x: Math.min(SW, Math.max(0, mx)), y: Math.min(SH, Math.max(0, my)), xt: p2.x, yt: p2.y,
    n1x: +p1.x.toFixed(3), n1y: +p1.y.toFixed(3), clip: lab.clip, V1: lab.clip ? 0 : m.V1, V2: m.V2, dV: m.dV, reading: m.reading };
  lab.recs.push(rec);
  const G = analysis(lab);
  const g = G.find(q => q.idx.indexOf(lab.recs.length - 1) >= 0);
  return Object.assign(common(lab), probeInfo(lab), { x: rec.xt, y: rec.yt, mx: rec.x, my: rec.y, reading: rec.reading,
    groupN: g.pts.length, groupV: g.V, groupSpan: g.span, groupVRange: g.vRange });
}
/** 頁面的 estimate()：紅探針在 P */
function estimate(lab, P) {
  if (!lab.power) return null;
  lab.n2 = { x: P[0], y: P[1] };
  const G = analysis(lab), Vp = lab.pot(P[0], P[1]);
  const cands = G.filter(g => g.path && g.pts.length >= 2).map(g => ({ V: g.V, path: g.path }));
  cands.push({ V: lab.s.V0, path: elPath(lab.pos()), el: true });
  cands.push({ V: 0, path: elPath(lab.neg()), el: true });
  let up = null, dn = null;
  cands.forEach(c => {
    if (c.V >= Vp && (!up || c.V < up.V || (c.V === up.V && !c.el))) up = c;
    if (c.V < Vp && (!dn || c.V > dn.V || (c.V === dn.V && !c.el))) dn = c;
  });
  if (!up || !dn || up.V - dn.V < 0.05) return null;
  const r = EC.estimateField(up.path, up.V, dn.path, dn.V, P);
  if (!r) return null;
  const mid = [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2];
  const Ec = lab.field(mid[0], mid[1]).E;
  const dEl = Math.min.apply(null, lab.sol.els.map(q => EC.distToElectrode(q, mid[0], mid[1])));
  const s = lab.s;
  return Object.assign(common(lab), { Eest: r.E, Ecalc: Ec, err: Ec > 0 ? (r.E - Ec) / Ec : NaN, dd: r.dd, dV: r.dV, x: mid[0], y: mid[1], VA: up.V, VB: dn.V,
    usesEl: !!(up.el || dn.el), distEl: dEl, Ecent: lab.field(SW / 2, SH / 2).E, sheet: [s.type, s.d, s.a, s.L, s.V0, s.noise ? s.seed : 0].join('|') });
}
function fieldlines(lab) {
  lab.drawField = true;
  const G = analysis(lab);
  const list = G.filter(g => g.path && g.pts.length >= 3).sort((a, b) => b.pts.length - a.pts.length);
  const kept = [];
  list.forEach(g => { if (!kept.some(k => Math.abs(k.V - g.V) < 0.15)) kept.push(g); });
  kept.sort((a, b) => b.V - a.V);
  const pe = lab.pos(), ne = lab.neg();
  const curves = [{ V: lab.s.V0, path: elPath(pe), isElectrode: true, center: pe.kind === 'circle' ? [pe.x, pe.y] : null }];
  kept.forEach(g => { if (g.V < lab.s.V0 - 0.05 && g.V > 0.05) curves.push({ V: g.V, path: g.path, g: g }); });
  curves.push({ V: 0, path: elPath(ne), isElectrode: true, center: ne.kind === 'circle' ? [ne.x, ne.y] : null });
  const measured = curves.filter(c => !c.isElectrode).map(c => ({ V: c.V, path: c.path }));
  const lines = measured.length ? EC.sketchFieldLines(measured, { els: lab.sol.els, V0: lab.s.V0, nSeeds: 9 }) : [];
  return Object.assign(common(lab), { nCurves: curves.filter(c => c.g && c.g.pts.length >= 4).length, nLines: lines.length });
}

// ---------------------------------------------------------------------
// 學生的操作：沿一條線段移動紅探針，找電表顯示 target 的點（電表跳動時等它顯示目標值再記）
// ---------------------------------------------------------------------
function seek(lab, A, B, target) {
  const f = function (t) {
    lab.n2 = { x: A[0] + (B[0] - A[0]) * t, y: A[1] + (B[1] - A[1]) * t };
    const m = lab.meter();
    return m.dV + lab.offset - target;           // 學生看到的讀數（不含跳動）與目標的差
  };
  const N = 160;
  let t0 = 0, f0 = f(0), t1 = -1;
  for (let i = 1; i <= N; i++) {
    const t = i / N, ft = f(t);
    const inside = EC.electrodeAt(lab.sol.els, lab.n2.x, lab.n2.y) >= 0;
    if (!inside && ft * f0 <= 0 && f0 !== 0) { t1 = t; break; }
    t0 = t; f0 = ft;
  }
  if (t1 < 0) return false;
  let lo = t0, hi = t1, flo = f(lo);
  for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2, fm = f(mid); if (fm * flo <= 0) hi = mid; else { lo = mid; flo = fm; } }
  f((lo + hi) / 2);
  // 拖曳＋方向鍵：位置只到 0.01 cm
  lab.n2 = { x: Math.round(lab.n2.x * 100) / 100, y: Math.round(lab.n2.y * 100) / 100 };
  if (EC.electrodeAt(lab.sol.els, lab.n2.x, lab.n2.y) >= 0) return false;
  for (let k = 0; k < 4; k++) { lab.newJitter(); if (Math.abs(lab.meter().reading - target) < 0.005) break; }
  return true;
}
/** 在目標讀數的等位線上取 n 點：從電極中心往外的射線（朝向另一個電極，±maxDeg 度內均分） */
function traceRadial(lab, target, n, fromNeg, maxDeg, events) {
  const e = fromNeg ? lab.neg() : lab.pos();
  const c = e.kind === 'circle' ? [e.x, e.y] : [fromNeg ? e.x0 : e.x1, (e.y0 + e.y1) / 2];
  const dir = fromNeg ? Math.PI : 0;
  let got = 0;
  for (let k = 0; k < 3 * n && got < n; k++) {
    const q = n === 1 ? 0.5 : (k % n) / (n - 1) + (k >= n ? 0.37 / n : 0);
    const ang = dir + (q * 2 - 1) * maxDeg * Math.PI / 180;
    const R = 40;
    const B = [c[0] + R * Math.cos(ang), c[1] + R * Math.sin(ang)];
    // 線段裁到紙內
    let tmax = 1;
    if (B[0] < 0) tmax = Math.min(tmax, (0 - c[0]) / (B[0] - c[0]));
    if (B[0] > SW) tmax = Math.min(tmax, (SW - c[0]) / (B[0] - c[0]));
    if (B[1] < 0) tmax = Math.min(tmax, (0 - c[1]) / (B[1] - c[1]));
    if (B[1] > SH) tmax = Math.min(tmax, (SH - c[1]) / (B[1] - c[1]));
    const Bc = [c[0] + (B[0] - c[0]) * tmax * 0.999, c[1] + (B[1] - c[1]) * tmax * 0.999];
    if (seek(lab, c, Bc, target)) { const ev = record(lab); if (ev) { events.push(['record', ev]); got++; } }
  }
  return got;
}
/** 在目標讀數的等位線上取點：沿水平線 y = ys 由左往右找 */
function traceRows(lab, target, ys, x0, x1, events) {
  let got = 0;
  ys.forEach(y => { if (seek(lab, [x0, y], [x1, y], target)) { const ev = record(lab); if (ev) { events.push(['record', ev]); got++; } } });
  return got;
}
function fire(events) {
  const hit = new Set();
  const mem = {};
  events.forEach(([type, data]) => {
    Object.keys(defs).forEach(id => { mem[id] = mem[id] || {}; if (defs[id].check({ type, data }, mem[id])) hit.add(id); });
  });
  return hit;
}

const proofs = {};
function prove(id, note, fn) {
  let r;
  try { r = fn(); } catch (e) { r = { ok: false, info: '錯誤：' + e.message }; }
  const item = { ok: r.ok, note: note + (r.info ? '　' + r.info : '') };
  const prev = proofs[id];
  proofs[id] = prev ? { ok: prev.ok && item.ok, note: prev.note + '；' + item.note } : item;
}

// ---------------------------------------------------------------------
// 預設狀態不觸發任務
// ---------------------------------------------------------------------
(function () {
  const lab = Lab({});
  lab.power = false;
  const ev = [];
  const r0 = record(lab); if (r0) ev.push(['record', r0]);    // 電源未接通：頁面拒絕記錄
  lab.power = true;
  ev.push(['probe', Object.assign(common(lab), probeInfo(lab))]);
  ev.push(['record', record(lab)]);
  ev.push(['lines', common(lab)]);
  ev.push(['fieldlines', fieldlines(lab)]);
  const e = estimate(lab, [18.5, 13.5]); if (e) ev.push(['estimate', e]);
  const hit = fire(ev);
  if (hit.size) failures.push('預設狀態觸發了任務：' + [...hit].join('、'));
  console.log('預設狀態（接通電源、在預設位置記錄、勾選連線與電力線、只用電極估算）：' + (hit.size ? '觸發 ' + [...hit].join('、') : '沒有觸發任何任務'));
})();

// ---------------------------------------------------------------------
// 各任務
// ---------------------------------------------------------------------
function only(events, id) { return fire(events).has(id); }

prove('equipotential-1', '兩圓、N1 在預設位置 (11.5, 5.5)，N2 沿 y = 15 找零讀數', () => {
  const lab = Lab({}), ev = [];
  traceRows(lab, 0, [15], 0.5, 29.5, ev);
  return { ok: only(ev, 'equipotential-1'), info: '讀數 ' + ev[0][1].reading + ' V、相距 ' + ev[0][1].dist12.toFixed(1) + ' cm' };
});
prove('equipotential-1', '（檢流計也可以）', () => {
  const lab = Lab({ meter: 'galv' }), ev = [];
  traceRows(lab, 0, [15], 0.5, 29.5, ev);
  return { ok: only(ev, 'equipotential-1') };
});
prove('equipotential-2', '兩圓、V0 = 6 V、N1 夾負極、沿 y = 4 找 3.00 V', () => {
  const lab = Lab({}), ev = [];
  lab.clip = true;
  traceRows(lab, 3, [4], 9, 21, ev);
  return { ok: only(ev, 'equipotential-2'), info: '讀數 ' + ev[0][1].reading };
});
prove('equipotential-3', '兩圓、N1 夾負極、2.00 V 的線沿 y = 2、5、8、12、15、18 取 6 點', () => {
  const lab = Lab({}), ev = [];
  lab.clip = true;
  traceRows(lab, 2, [2, 5, 8, 12, 15, 18], 15, 29.5, ev);
  const last = ev[ev.length - 1][1];
  return { ok: only(ev, 'equipotential-3'), info: '跨距 ' + last.groupSpan.toFixed(1) + ' cm、電位差 ' + last.groupVRange.toFixed(4) + ' V' };
});
prove('equipotential-4', '兩圓、N1 夾負極、2、3、4 V 各 4 點，勾選畫電力線', () => {
  const lab = Lab({}), ev = [];
  lab.clip = true;
  [2, 3, 4].forEach(v => traceRows(lab, v, [3, 7, 13, 17], 8.8, 21.2, ev));
  const f = fieldlines(lab);
  ev.push(['fieldlines', f]);
  return { ok: only(ev, 'equipotential-4'), info: '量測線 ' + f.nCurves + ' 條、電力線 ' + f.nLines + ' 條' };
});
prove('equipotential-5', '兩圓、V0 = 4 V、N1 夾負極、1、2、3 V 各 4 點（射線取點）', () => {
  const lab = Lab({ V0: 4 }), ev = [];
  lab.clip = true;
  traceRadial(lab, 1, 4, true, 70, ev);
  traceRows(lab, 2, [3, 7, 13, 17], 8.8, 21.2, ev);
  traceRadial(lab, 3, 4, false, 70, ev);
  return { ok: only(ev, 'equipotential-5'), info: '各組 ' + ev[ev.length - 1][1].groups.map(g => g.V.toFixed(2) + '×' + g.n).join('、') };
});
prove('equipotential-6', '平行長條 L = 20、N1 夾負極、4 V 與 2 V 各 5 點，紅探針在 (15, 10) 估算', () => {
  const lab = Lab({ type: 'bars', L: 20 }), ev = [];
  lab.clip = true;
  [4, 2].forEach(v => traceRows(lab, v, [2, 6, 10, 14, 18], 8, 22, ev));
  const e = estimate(lab, [15, 10]); ev.push(['estimate', e]);
  return { ok: only(ev, 'equipotential-6'), info: '誤差 ' + (e.err * 100).toFixed(2) + ' %' };
});
prove('equipotential-7', '兩圓、N1 夾負極、4 V 與 3 V 各 5 點，紅探針在 (13.5, 10) 估算', () => {
  const lab = Lab({}), ev = [];
  lab.clip = true;
  [4, 3].forEach(v => traceRows(lab, v, [4, 7, 10, 13, 16], 8.8, 21.2, ev));
  const e = estimate(lab, [13.5, 10]); ev.push(['estimate', e]);
  return { ok: only(ev, 'equipotential-7'), info: '誤差 ' + (e.err * 100).toFixed(2) + ' %、離電極 ' + e.distEl.toFixed(1) + ' cm' };
});
prove('equipotential-8', '平行長條 L = 8、N1 夾負極、4 V 與 2 V 各 11 點（延伸到長條外），估算 (15, 10) 與 (15, 17.5)', () => {
  const lab = Lab({ type: 'bars', L: 8 }), ev = [];
  lab.clip = true;
  [4, 2].forEach(v => traceRows(lab, v, [0.5, 2, 3.5, 5, 7.5, 10, 12.5, 15, 16.5, 18, 19.5], 5, 25, ev));
  const c = estimate(lab, [15, 10]), e = estimate(lab, [15, 17.5]);
  ev.push(['estimate', c], ['estimate', e]);
  return { ok: only(ev, 'equipotential-8'), info: '中央 ' + c.Eest.toFixed(3) + '（誤差 ' + (c.err * 100).toFixed(1) + ' %）、端點 ' + e.Eest.toFixed(3) + '（誤差 ' + (e.err * 100).toFixed(1) + ' %）、比值 ' + (e.Eest / c.Eest).toFixed(2) };
});
prove('equipotential-9', '兩圓、N1 夾負極、5.8 V 與 5.4 V 各 7 點（緊貼正極，用精細拖曳），紅探針在正極右側估算', () => {
  const lab = Lab({}), ev = [];
  lab.clip = true;
  traceRadial(lab, 5.8, 7, false, 80, ev);
  traceRadial(lab, 5.4, 7, false, 80, ev);
  const pe = lab.pos();
  let best = null;
  for (let x = pe.x + 1.0; x <= pe.x + 4; x += 0.1) {
    const e = estimate(lab, [x, 10]);
    if (e && !e.usesEl && e.Ecalc >= 2.5 * e.Ecent) { best = e; break; }
  }
  ev.push(['estimate', best]);
  return { ok: only(ev, 'equipotential-9'), info: '電場 ' + best.Ecalc.toFixed(3) + ' V/cm＝中心的 ' + (best.Ecalc / best.Ecent).toFixed(1) + ' 倍、誤差 ' + (best.err * 100).toFixed(1) + ' %' };
});

// 含誤差：許多組隨機數
function noisyRate(id, n, build) {
  let ok = 0, errs = [];
  for (let seed = 1; seed <= n; seed++) {
    const r = build(seed);
    if (r.ev && only(r.ev, id)) ok++;
    if (r.err != null) errs.push(r.err);
  }
  return { ok: ok > 0, info: '成功 ' + ok + '/' + n + (errs.length ? '，|誤差| 中位數 ' + (errs.map(Math.abs).sort((a, b) => a - b)[Math.floor(errs.length / 2)] * 100).toFixed(1) + ' %' : '') };
}
prove('equipotential-10', '含誤差、兩圓、N1 夾負極、3.5 V 與 2.5 V 各 7 點，紅探針在 (15, 10) 估算', () => noisyRate('equipotential-10', 30, seed => {
  const lab = Lab({ noise: true, seed: seed }), ev = [];
  lab.clip = true;
  [3.5, 2.5].forEach(v => traceRows(lab, v, [2, 5, 8, 10, 12, 15, 18], 8.8, 21.2, ev));
  const e = estimate(lab, [15, 10]);
  if (e) ev.push(['estimate', e]);
  return { ev, err: e ? e.err : null };
}));
prove('equipotential-11', '含誤差、兩圓、N1 夾負極、1–5 V 各 6 點，畫電力線，紅探針在 (15, 10) 估算', () => noisyRate('equipotential-11', 20, seed => {
  const lab = Lab({ noise: true, seed: seed }), ev = [];
  lab.clip = true;
  traceRadial(lab, 1, 6, true, 75, ev);
  [2, 3, 4].forEach(v => traceRows(lab, v, [2, 5, 8, 12, 15, 18], 8.8, 21.2, ev));
  traceRadial(lab, 5, 6, false, 75, ev);
  ev.push(['fieldlines', fieldlines(lab)]);
  const e = estimate(lab, [15, 10]);
  if (e) ev.push(['estimate', e]);
  return { ev, err: e ? e.err : null };
}));
prove('equipotential-12', '含誤差、長條與圓（L = 14）、N1 夾負極、1–5 V 各 6 點，紅探針在 (15, 10) 估算', () => noisyRate('equipotential-12', 20, seed => {
  const lab = Lab({ noise: true, seed: seed, type: 'barCircle', L: 14 }), ev = [];
  lab.clip = true;
  traceRadial(lab, 1, 6, true, 75, ev);
  [2, 3, 4, 5].forEach(v => traceRows(lab, v, [4, 6.5, 9, 11, 13.5, 16], 8.1, 29.5, ev));
  const e = estimate(lab, [15, 10]);
  if (e) ev.push(['estimate', e]);
  return { ev, err: e ? e.err : null };
}));
prove('equipotential-h1', '平行長條 L = 20，紅探針放在正極長條左邊 (3, 10) 記錄', () => {
  const lab = Lab({ type: 'bars', L: 20 }), ev = [];
  lab.n2 = { x: 3, y: 10 };
  ev.push(['record', record(lab)]);
  return { ok: only(ev, 'equipotential-h1'), info: '讀數 ' + ev[0][1].reading + ' V' };
});
prove('equipotential-h2', '兩圓，N1 在 (15, 0.5)，N2 沿 y = 19.5 找零讀數', () => {
  const lab = Lab({}), ev = [];
  lab.n1 = { x: 15, y: 0.5 };
  traceRows(lab, 0, [19.5], 9, 21, ev);
  return { ok: only(ev, 'equipotential-h2'), info: '相距 ' + ev[0][1].dist12.toFixed(1) + ' cm' };
});
prove('equipotential-h3', '兩圓，紅探針放在紙角 (0.5, 0.5) 記錄', () => {
  const lab = Lab({}), ev = [];
  lab.n2 = { x: 0.5, y: 0.5 };
  ev.push(['record', record(lab)]);
  const d = ev[0][1];
  return { ok: only(ev, 'equipotential-h3'), info: '電場＝中心的 ' + (d.E2 / d.Ecent * 100).toFixed(1) + ' %' };
});

// ---------------------------------------------------------------------
// 結果
// ---------------------------------------------------------------------
console.log('');
const ids = Object.keys(defs);
let bad = 0;
ids.forEach(id => {
  const p = proofs[id];
  const m = defs[id];
  const name = m.hidden ? '（隱藏）' : m.title.zh;
  if (!p) { bad++; console.log('✗ ' + id + ' ' + name + '：沒有證明'); return; }
  if (!p.ok) bad++;
  console.log((p.ok ? '✓ ' : '✗ ') + id + '（' + m.level + ' 星）' + name + '：' + p.note);
});
if (failures.length) { console.log('\n問題：\n  ' + failures.join('\n  ')); bad++; }
console.log(bad ? '\n有 ' + bad + ' 項沒有通過。' : '\n' + ids.length + ' 個任務都做得到，預設狀態不會觸發任務。');
process.exit(bad ? 1 : 0);
