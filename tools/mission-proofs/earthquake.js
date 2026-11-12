/* 任務可達成的證明腳本。用法：node tools/mission-proofs/earthquake.js
 * 用物理核心（js/earthquake-core.js）照頁面程式（js/earthquake.js）的算法產生事件，確認每個任務都做得到、預設狀態不會觸發任務。
 * 修改物理核心或任務條件後重跑。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const Q = require(ROOT + 'js/earthquake-core.js');
const missions = [];
global.window = { QuakeCore: Q, LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/earthquake.js');
const byId = id => missions.find(m => m.id === 'earthquake-' + id);

let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { ok = !!m.check(e, m.mem); });
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}
function claim(ok, note) { if (!ok) fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + note); }

// ---------- 模式一的事件（與頁面相同） ----------
const DEF1 = { h: 15, x: 60, vp: 6, vs: 3.5, medium: 'liquid' };
function setting1(o) { o = Object.assign({}, DEF1, o); return { vp: o.vp, vs: o.vs, ratio: o.vp / o.vs, nu: Q.poisson(o.vp, o.vs), h: o.h, x: o.x, medium: o.medium }; }
function params1(o) { return { type: 'params1', data: Object.assign({ prev: setting1({}) }, setting1(o)) }; }
function quake1(o) {
  o = Object.assign({}, DEF1, o);
  const a = Q.arrivals(o.x, o.h, o.vp, o.vs);
  return { type: 'quake1', data: { h: o.h, x: o.x, R: a.R, vp: o.vp, vs: o.vs, ratio: o.vp / o.vs, tP: a.tP, tS: a.tS, sp: a.sp, tR: a.tR, medium: o.medium } };
}
function chain(medium) {
  const coP = Q.interfaceCoeffs(2.7, 6, medium === 'liquid' ? 1 : 2.7, medium === 'liquid' ? 1.5 : 6);
  const coS = Q.interfaceCoeffs(2.7, 3.5, medium === 'liquid' ? 1 : 2.7, medium === 'liquid' ? 0 : 3.5);
  return { type: 'chain', data: { medium: medium, vp: 6, vs: 3.5, rP: coP.r, tP: coP.t, rS: coS.r, tS: coS.t } };
}
const vsLimit = vp => vp * Math.sqrt(3) / 2 * 0.999; // 頁面對 VS 的限制（VP/VS > 2/√3）

// ---------- 模式二：照頁面的 stationData／doLocate（判定的是學生在地圖上標的位置） ----------
const city = id => { const c = Q.CITIES.find(c => c.id === id); return Q.toXY(c.lon, c.lat); };
/**
 * 學生在地圖上點的位置：n ≥ 3 且不共線 → 課本作圖，共同弦的交點（Q.chordCenter）；有兩個可能位置 → 兩個交點都點（opts.one 時只點一個）；
 * 再加上點選誤差（隨機方向、距離 0–mk km，預設 1.5 km）。opts.marks 可直接指定標記。
 */
function studentMarks(r, data, opts, seed) {
  if (opts.marks) return opts.marks;
  const rr = Q.rng(seed >>> 0), mk = opts.mk == null ? 1.5 : opts.mk;
  const jit = p => { const a = rr() * 2 * Math.PI, d = rr() * mk; return { x: p.x + d * Math.cos(a), y: p.y + d * Math.sin(a) }; };
  const base = r.candidates.length === 2 ? (opts.one ? [r.candidates[0]] : r.candidates) : [Q.chordCenter(data) || r];
  return base.map(jit);
}
/** 地震 q {x, y, h, seed}；測站 [{x, y}]；opts {errMode, pick(i, which) → 讀數誤差 s, vpc, vsc, manual, revealed, peek, mk, one, marks} */
function locateEv(q, stations, opts) {
  opts = opts || {};
  const err = !!opts.errMode;
  const k = Q.kFactor(opts.vpc || 6, opts.vsc || 3.5);
  const data = stations.map((s, i) => {
    const r = Q.rng((q.seed ^ (i * 2654435761)) >>> 0);
    const ec = err ? (r() * 2 - 1) * 0.03 : 0, ep = err ? (r() * 2 - 1) * 0.004 : 0, es = err ? (r() * 2 - 1) * 0.004 : 0;
    const vp = 6 * (1 + ec + ep), vs = 3.5 * (1 + ec + es);
    const a = Q.arrivals(Math.hypot(s.x - q.x, s.y - q.y), q.h, vp, vs);
    const tp = Math.round((a.tP + (opts.pick ? opts.pick(i, 'p') : 0)) * 100) / 100;
    const ts = Math.round((a.tS + (opts.pick ? opts.pick(i, 's') : 0)) * 100) / 100;
    return { x: s.x, y: s.y, R: k * (ts - tp) };
  });
  const r = Q.locate(data, { collinearKm: 4 });
  const marks = studentMarks(r, data, opts, (opts.seedM == null ? q.seed + 17 : opts.seedM) >>> 0);
  const dq = p => Math.hypot(p.x - q.x, p.y - q.y);
  const hEst = marks.length === 1 ? Q.depthAt(data, marks[0].x, marks[0].y).h : NaN;
  const peek = !!opts.peek, auto = opts.manual === false || peek;
  return {
    type: 'locate', r: r, marks: marks, data: {
      n: stations.length, marks: marks.length, err: Math.min.apply(null, marks.map(dq)), hEst: hEst, hTrue: q.h, depthErr: Math.abs(hEst - q.h),
      candidates: r.candidates.length, pairErr: Q.pairErr(marks, r.candidates), collinear: !!r.collinear,
      manual: opts.manual !== false, auto: auto, peek: peek, revealed: !!opts.revealed, source: 'random', errMode: err, k: k, vpc: opts.vpc || 6, vsc: opts.vsc || 3.5,
      solErr: r.candidates.length === 1 ? dq(r) : Math.min.apply(null, r.candidates.map(dq))
    }
  };
}
function quakeAt(lon, lat, h, seed) { const p = Q.toXY(lon, lat); return { x: p.x, y: p.y, h: h, seed: seed >>> 0, lon: lon, lat: lat }; }
const DEFAULT_ST = ['TPE', 'HUA', 'KHH', 'TXG', 'TTT'].map(city);
/** 讀數誤差：均勻分布在 ±a 秒（固定亂數種子，可重現） */
function pickNoise(a, seed) { const r = Q.rng(seed); const tab = {}; return (i, w) => { const key = i + w; if (!(key in tab)) tab[key] = (r() * 2 - 1) * a; return tab[key]; }; }

// ---------- 模式三 ----------
const shells = Q.buildShells(5);
const br = Q.branches(shells, 1000, 600);
const Z = Q.shadowZonesExact(shells);
function ray3(wave, takeoff) {
  const r = Q.traceRay(shells, Q.pFromTakeoff(shells, takeoff, wave), wave);
  return { type: 'ray3', data: { wave: wave, takeoff: takeoff, phase: r.phase, turnR: r.turnR, deepest: r.deepest, delta: r.delta / Q.DEG, blocked: !!r.blocked } };
}
function station3(deg) {
  const arr = Q.arrivalsAt(br, deg, ['P', 'PKP', 'PKIKP', 'S']);
  return { type: 'station3', data: {
    deg: deg, P: arr.some(a => a.phase === 'P' || a.phase === 'PKP'), S: arr.some(a => a.phase === 'S'), IK: arr.some(a => a.phase === 'PKIKP'),
    inner: true, wave: 'PS', sMax: Z.sMax, pMax: Z.pMax, pkpMin: Z.pkpMin
  } };
}
console.log('陰影區（5 km 殼層）：S 波 ' + Z.sMax.toFixed(2) + '° 以外；P 波 ' + Z.pMax.toFixed(2) + '°–' + Z.pkpMin.toFixed(2) + '°；PKIKP 由 ' + Z.ikMin.toFixed(2) + '° 起');

// ---------- 預設狀態 ----------
{
  const evs = [quake1({}), params1({}), station3(60), ray3('P', 20), ray3('S', 20)];
  missions.forEach(m => {
    m.mem = {};
    if (evs.some(e => m.check(e, m.mem))) { fail++; console.log('  ✗ 預設狀態觸發了 ' + m.id); }
  });
  console.log('  ✓ 預設狀態（未操作；自動播放不發事件）不觸發任何任務：預設 S−P = ' + quake1({}).data.sp.toFixed(3) + ' s、VP/VS = ' + (6 / 3.5).toFixed(4));
}

// 1 過不了水的 S 波
expect(1, [chain('liquid')], true, '長條右半段是水：S 波 r = ' + chain('liquid').data.rS + '、透射 ' + chain('liquid').data.tS);
expect(1, [chain('solid')], false, '右半段是岩石（S 波直接穿過）');
// 2 相差 5 秒
expect(2, [quake1({ x: 39 })], true, 'h = 15、Δ = 39 km：S−P = ' + quake1({ x: 39 }).data.sp.toFixed(3) + ' s');
expect(2, [quake1({ h: 2, x: 42 })], true, 'h = 2、Δ = 42 km：S−P = ' + quake1({ h: 2, x: 42 }).data.sp.toFixed(3) + ' s');
expect(2, [quake1({ x: 41 })], false, 'Δ = 41 km：S−P = ' + quake1({ x: 41 }).data.sp.toFixed(3) + ' s');
// 3 典型的岩石
expect(3, [params1({ vp: 6.05 })], true, 'VP = 6.05、VS = 3.5 → ' + (6.05 / 3.5).toFixed(4));
expect(3, [params1({ vp: 6.5, vs: 3.75 })], true, 'VP = 6.5、VS = 3.75 → ' + (6.5 / 3.75).toFixed(4));
expect(3, [params1({ vp: 6.1 })], false, 'VP = 6.1 → ' + (6.1 / 3.5).toFixed(4));

// 4 兩站不夠（預設測站 A 臺北、B 花蓮，集集一帶的地震）：學生把兩個交點都點出來
const qChi = quakeAt(120.82, 23.85, 8, 12345);
{
  const ev = locateEv(qChi, DEFAULT_ST.slice(0, 2));
  expect(4, [ev], true, '2 站（臺北、花蓮）→ 兩個交點，兩個標記各差 1.5 km 以內（配對後最大 ' + ev.data.pairErr.toFixed(2) + ' km）');
  expect(4, [locateEv(qChi, DEFAULT_ST.slice(0, 2), { mk: 9.5 })], true, '點得比較隨便（各差 9.5 km 以內）也算');
  expect(4, [locateEv(qChi, DEFAULT_ST.slice(0, 2), { one: true })], false, '只標一個點');
  const c = ev.r.candidates;
  expect(4, [locateEv(qChi, DEFAULT_ST.slice(0, 2), { marks: [c[0], { x: c[0].x + 3, y: c[0].y }] })], false, '兩個標記都點在同一個交點附近');
  expect(4, [locateEv(qChi, DEFAULT_ST.slice(0, 2), { peek: true })], false, '確認前就看了電腦解');
  expect(4, [locateEv(qChi, DEFAULT_ST.slice(0, 3))], false, '3 站（不共線）→ 一個答案');
}

// 5 三站定震央：預設的 3 站，游標讀數誤差 ±0.1 s，學生在共同弦交點附近點（誤差 1.5 km 以內），隨機 300 個地震
{
  let ok = 0, worst = 0;
  const rr = Q.rng(2024);
  for (let n = 0; n < 300; n++) {
    const g = Q.randomQuake(rr), q = quakeAt(g.lon, g.lat, g.h, (rr() * 4294967296) >>> 0);
    const ev = locateEv(q, DEFAULT_ST.slice(0, 3), { pick: pickNoise(0.1, n + 1) });
    if (byId(5).check(ev, {})) ok++;
    worst = Math.max(worst, ev.data.err);
  }
  claim(ok === 300, '5  達成：預設 3 站（臺北、花蓮、高雄）、游標讀數誤差 ±0.1 s、點選誤差 1.5 km：300 個隨機地震中 ' + ok + ' 個在 10 km 內（最差 ' + worst.toFixed(2) + ' km）');
  expect(5, [locateEv(qChi, DEFAULT_ST.slice(0, 3), { pick: pickNoise(0.1, 7) })], true, '集集一帶，讀數誤差 ±0.1 s');
  expect(5, [locateEv(qChi, DEFAULT_ST.slice(0, 3), { manual: false })], false, '用了自動判讀');
  expect(5, [locateEv(qChi, DEFAULT_ST.slice(0, 3), { peek: true })], false, '確認前就看了電腦解（算看答案）');
  expect(5, [locateEv(qChi, DEFAULT_ST.slice(0, 3), { revealed: true })], false, '真實震央已顯示');
  expect(5, [locateEv(qChi, DEFAULT_ST.slice(0, 3), { marks: [{ x: qChi.x + 12, y: qChi.y }] })], false, '標記點在離真實震央 12 km 的地方');
  const two = locateEv(qChi, DEFAULT_ST.slice(0, 3), { marks: [{ x: qChi.x, y: qChi.y }, { x: qChi.x + 30, y: qChi.y }] });
  expect(5, [two], false, '三站卻標了兩個點');
}
// 6 鏡子裡的震央：3 站排成南北一直線（容許偏離 4 km），學生點出兩個鏡像交點
{
  const line = [{ x: 0, y: -80 }, { x: 3, y: 0 }, { x: 0, y: 80 }];
  const ev = locateEv(qChi, line);
  expect(6, [ev], true, '測站 (0, −80)、(3, 0)、(0, 80) km（中間站偏 3 km）→ 共線、兩個交點，學生兩點配對後最大差 ' + ev.data.pairErr.toFixed(2) + ' km');
  expect(6, [locateEv(qChi, line, { one: true })], false, '只標一個點');
  expect(6, [locateEv(qChi, line, { peek: true })], false, '確認前就看了電腦解');
  expect(6, [locateEv(qChi, [{ x: 0, y: -80 }, { x: 8, y: 0 }, { x: 0, y: 80 }])], false, '中間站偏 8 km → 不算共線（只有一個答案）');
}
// 7 有雜訊的真實世界：含誤差、預設 3 站、讀數誤差 ±0.2 s、點選誤差 1.5 km
{
  let ok = 0, worst = 0;
  const rr = Q.rng(77);
  for (let n = 0; n < 300; n++) {
    const g = Q.randomQuake(rr), q = quakeAt(g.lon, g.lat, g.h, (rr() * 4294967296) >>> 0);
    const ev = locateEv(q, DEFAULT_ST.slice(0, 3), { errMode: true, pick: pickNoise(0.2, n + 11) });
    if (byId(7).check(ev, {})) ok++;
    worst = Math.max(worst, ev.data.err);
  }
  claim(ok >= 255, '7  達成：含誤差、預設 3 站、讀數誤差 ±0.2 s、點選誤差 1.5 km：300 個隨機地震中 ' + ok + ' 個在 20 km 內（最差 ' + worst.toFixed(1) + ' km；三個圓的誤差大時，三條共同弦的交點會偏掉）');
  let ok4 = 0;
  const r4 = Q.rng(77);
  for (let n = 0; n < 300; n++) {
    const g = Q.randomQuake(r4), q = quakeAt(g.lon, g.lat, g.h, (r4() * 4294967296) >>> 0);
    if (byId(7).check(locateEv(q, DEFAULT_ST.slice(0, 4), { errMode: true, pick: pickNoise(0.2, n + 11) }), {})) ok4++;
  }
  claim(ok4 >= 270, '7  達成：同樣 300 個地震改用 4 站（加臺中）：' + ok4 + ' 個在 20 km 內');
  const q = quakeAt(121.0, 23.6, 20, 99);
  expect(7, [locateEv(q, DEFAULT_ST, { errMode: true, pick: pickNoise(0.2, 5) })], true, '含誤差、5 站、讀數 ±0.2 s');
  expect(7, [locateEv(q, DEFAULT_ST, { errMode: false, pick: pickNoise(0.2, 5) })], false, '沒有打開含誤差');
}
// 8 連深度一起定：深度 ≥ 15 km 的隨機地震；先用預設 3 站粗定位（學生標一個點），再把 4 站移到這個標記周圍 20 km（其中一站在標記上），
//   讀數誤差 ±0.05 s，第二次再標一次；深度由第二次的標記推算 h = √(平均(d² − Δ²))
function closeIn(q, opts) {
  const first = locateEv(q, DEFAULT_ST.slice(0, 3), Object.assign({}, opts, { pick: pickNoise(0.1, q.seed % 1000 + 3), seedM: q.seed + 1 }));
  const m = first.marks[0];
  const st = [{ x: m.x, y: m.y }, { x: m.x + 20, y: m.y }, { x: m.x - 10, y: m.y + 17 }, { x: m.x - 10, y: m.y - 17 }];
  return locateEv(q, st, Object.assign({}, opts, { pick: pickNoise(0.05, q.seed % 1000 + 9), seedM: q.seed + 2 }));
}
{
  let ok = 0, tot = 0, worst = 0;
  const rr = Q.rng(808);
  while (tot < 300) {
    const g = Q.randomQuake(rr); if (g.h < 15) continue;
    tot++;
    const q = quakeAt(g.lon, g.lat, g.h, (rr() * 4294967296) >>> 0);
    const ev = closeIn(q, {});
    if (byId(8).check(ev, {})) ok++;
    worst = Math.max(worst, ev.data.depthErr);
  }
  claim(ok === tot, '8  達成：先粗定位、再把 4 站移到標記附近（一站在標記上、三站在 20 km 外）再標一次，讀數 ±0.05 s、點選誤差 1.5 km：' + tot + ' 個深度 ≥ 15 km 的地震中 ' + ok + ' 個成功（深度誤差最差 ' + worst.toFixed(2) + ' km）');
  const q = quakeAt(121.2, 23.9, 25, 4242);
  const ev = locateEv(q, DEFAULT_ST.slice(0, 3), { pick: pickNoise(0.05, 1) });
  expect(8, [ev], ev.data.err <= 10 && ev.data.depthErr <= 4, '只用預設 3 站：震央差 ' + ev.data.err.toFixed(2) + ' km、推算深度差 ' + ev.data.depthErr.toFixed(2) + ' km（測站離得遠，標記差一點深度就差很多）');
  expect(8, [locateEv(quakeAt(121.2, 23.9, 10, 4242), DEFAULT_ST.slice(0, 3))], false, '深度只有 10 km 的地震不算');
  const qq = quakeAt(121.2, 23.9, 25, 4243), ok8 = closeIn(qq, {});
  expect(8, [ok8], true, '例：121.2°E、23.9°N、深 25 km → 震央差 ' + ok8.data.err.toFixed(2) + ' km、推算深度 ' + ok8.data.hEst.toFixed(2) + ' km');
  expect(8, [closeIn(qq, { peek: true })], false, '同一個例子但確認前看了電腦解');
}
// 9 步步逼近：含誤差、4 站移近（同上），第二次點得更仔細（點選誤差 0.5 km）
{
  let ok = 0, worstE = 0, worstH = 0;
  const rr = Q.rng(909), N = 400;
  for (let n = 0; n < N; n++) {
    const g = Q.randomQuake(rr), q = quakeAt(g.lon, g.lat, g.h, (rr() * 4294967296) >>> 0);
    const ev = closeIn(q, { errMode: true, mk: 0.5 });
    if (byId(9).check(ev, {})) ok++;
    worstE = Math.max(worstE, ev.data.err); worstH = Math.max(worstH, ev.data.depthErr);
  }
  claim(ok >= N * 0.6, '9  達成：含誤差，先粗定位、再把 4 站移到標記附近，讀數 ±0.05 s、點選誤差 0.5 km：' + N + ' 個隨機地震中 ' + ok + ' 個（' + (100 * ok / N).toFixed(0) + '%）震央與深度都在 3 km 內（最差 ' + worstE.toFixed(2) + '、' + worstH.toFixed(2) + ' km）；沒達成就換一個地震再試');
  const q = quakeAt(121.0, 23.6, 20, 99);
  const ev = closeIn(q, { errMode: true, mk: 0.5 });
  expect(9, [ev], true, '例：121.0°E、23.6°N、深 20 km（種子 99）→ 震央差 ' + ev.data.err.toFixed(2) + ' km、深度差 ' + ev.data.depthErr.toFixed(2) + ' km');
  const far = locateEv(q, DEFAULT_ST, { errMode: true, pick: pickNoise(0.05, 3), mk: 0.5 });
  expect(9, [far], false, '同一個地震只用預設 5 站（太遠）：震央差 ' + far.data.err.toFixed(2) + ' km、深度差 ' + far.data.depthErr.toFixed(2) + ' km');
}

// 10 被外核擋下
expect(10, [ray3('S', 10)], true, 'S 波出射角 10° → ' + ray3('S', 10).data.phase);
expect(10, [ray3('S', 20)], false, 'S 波出射角 20°（在地函中轉回地表，Δ = ' + ray3('S', 20).data.delta.toFixed(1) + '°）');
// 11 S 波陰影區的邊界
expect(11, [station3(103)], true, 'Δ = 103°（S 收不到；邊界 ' + Z.sMax.toFixed(2) + '°）');
expect(11, [station3(104.5)], true, 'Δ = 104.5°');
expect(11, [station3(102.5)], false, 'Δ = 102.5°（還收得到 S：' + station3(102.5).data.S + '）');
expect(11, [station3(106)], false, 'Δ = 106°（離邊界超過 2°）');
// 12 雷曼的發現
expect(12, [station3(130)], true, 'Δ = 130°：P ' + station3(130).data.P + '、S ' + station3(130).data.S + '、PKIKP ' + station3(130).data.IK);
expect(12, [station3(110)], false, 'Δ = 110°：PKIKP 還沒出現（由 ' + Z.ikMin.toFixed(1) + '° 起）');
expect(12, [station3(150)], false, 'Δ = 150°：PKP 又收得到了');
// h1 擦過核幔界面
{
  const a = ray3('P', 13.4).data, b = ray3('P', 13.5).data, c = ray3('P', 13.3).data;
  expect('h1', [ray3('P', 13.4)], true, 'P 波出射角 13.4°：在地函底部 r = ' + a.turnR.toFixed(1) + ' km 轉回（離核幔界面 ' + (a.turnR - 3480).toFixed(1) + ' km）');
  expect('h1', [ray3('P', 13.5)], false, '13.5°：離界面 ' + (b.turnR - 3480).toFixed(1) + ' km');
  expect('h1', [ray3('P', 13.3)], false, '13.3°：進了外核（' + c.phase + '）');
}
// h2 負的帕松比
expect('h2', [params1({ vp: 4, vs: 3 })], true, 'VP = 4、VS = 3（≤ 上限 ' + vsLimit(4).toFixed(2) + '）→ ν = ' + Q.poisson(4, 3).toFixed(3));
expect('h2', [params1({ vp: 5, vs: 3.5 })], false, 'VP = 5、VS = 3.5 → ν = ' + Q.poisson(5, 3.5).toFixed(3));
// h3 地球的另一端
expect('h3', [station3(180)], true, 'Δ = 180°：PKIKP ' + station3(180).data.IK);
expect('h3', [station3(179)], false, 'Δ = 179°');

console.log(fail ? '\n有 ' + fail + ' 項失敗' : '\n全部通過');
process.exitCode = fail ? 1 : 0;
