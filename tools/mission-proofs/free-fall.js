/* 任務可達成的證明腳本（自由落體與斜面上的運動）。用法：node tools/mission-proofs/free-fall.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。
 * 做法：只用物理核心 js/free-fall-core.js，照頁面 js/free-fall.js 的方式組出完全相同的事件資料
 * （打點、自動選第 0 點、計數點、尺的讀數誤差、v–t 擬合、碼錶與點數），丟進 js/missions/free-fall.js 的檢查函式。
 * 會用到隨機數的任務（讀數誤差、碼錶反應時間、未知頻率、放手時刻）用許多組隨機數重做，列出成功率。
 * 所有輸入都在 free-fall.html 的滑桿範圍內；標「打字」的值要點數字輸入。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const FF = require(__ROOT + 'js/free-fall-core.js');
const defs = {};
global.window = { FreeFallCore: FF, LabMission: { register: (id, list) => list.forEach(m => { defs[m.id] = m; }) } };
global.LabMission = global.window.LabMission;
require(__ROOT + 'js/missions/free-fall.js');

const G = 9.8, SIGMA = 3e-4, RES = 1e-4, T_POST = 0.3, T_STILL = 0.8, MAX_ROWS = 30, CLEAR_GAP = 0.0012;
const rng = FF.mulberry32(20261111);
const check = (id, type, data) => defs[id].check({ type, data }, {});

// ---------- 介面允許的值（free-fall.html） ----------
const RANGE = {
  h: { min: 1, max: 60, step: 0.5, dec: 2 }, M: { min: 0.2, max: 2, step: 0.05, dec: 3 }, m: { min: 0.05, max: 1, step: 0.01, dec: 3 },
  f: { min: 0, max: 0.3, step: 0.005, dec: 3 }, mu: { min: 0, max: 0.05, step: 0.001, dec: 4 }, kG: { min: 0, max: 20, step: 0.1, dec: 2 },
  n: { min: 1, max: 10, step: 1, dec: 0 }, j0: { min: 1, max: 30, step: 1, dec: 0 }
};
const near = (a, b) => Math.abs(a - b) < 1e-9;
function uiKind(name, v) {
  const r = RANGE[name];
  if (v < r.min - 1e-9 || v > r.max + 1e-9) return 'OUT OF RANGE';
  if (near(Math.round((v - r.min) / r.step) * r.step + r.min, v)) return 'slider';
  if (near(Math.round(v * Math.pow(10, r.dec)) / Math.pow(10, r.dec), v)) return 'typed';
  return 'TOO MANY DECIMALS';
}
const failures = [];
function assertUI(o) {
  for (const k of Object.keys(RANGE)) if (o[k] != null && /OUT|TOO/.test(uiKind(k, o[k]))) failures.push(k + ' = ' + o[k] + ' ' + uiKind(k, o[k]));
}

// ---------- 照頁面組事件資料 ----------
/**
 * 一次斜面或自由落體（頁面的 release → finish → 記錄）。
 * o：{ mode, h（cm）, M, m, ideal, readErr, f, mu, kG, freq（0 = 未知）, fHidden, timerId, tPre（放手前計時器開了幾秒）,
 *      j0（null = 頁面自動選）, n, dtSrc, cal（{ dt, react }，未知頻率或選「步驟①量得的值」時用）, seed, rows（null = 全部記錄） }
 */
function experiment(o) {
  const s = Object.assign({ mode: 'incline', h: 20, M: 0.5, m: 0.2, ideal: true, readErr: true, f: 0.05, mu: 0.01, kG: 0.4, freq: 60, fHidden: 30, timerId: 1, tPre: 0.5, j0: null, n: 4, dtSrc: 'nom', cal: null, seed: 1, rows: null }, o);
  assertUI(s);
  const real = !s.ideal;
  const p = { mode: s.mode, h: s.h / 100, L: FF.L_TRACK, m: s.mode === 'incline' ? s.M : s.m, mu: real && s.mode === 'incline' ? s.mu : 0, f: real ? s.f : 0, k: real ? s.kG / 1000 : 0 };
  const Fz = FF.forces(p);
  const dtTrue = s.freq ? 1 / s.freq : 1 / s.fHidden;
  const mo = FF.makeMotion(p);
  const tape = FF.makeTape(mo, dtTrue, s.tPre, mo.moves ? T_POST : T_STILL);
  const readErr = real && s.readErr;
  let j0 = s.j0;
  if (j0 == null) j0 = mo.moves ? Math.min(30, FF.firstClearDot(tape, CLEAR_GAP)) : 3;
  const pts = mo.moves ? FF.countingPoints(tape, j0, s.n).slice(0, MAX_ROWS) : [];
  const xs = FF.readPoints(pts, readErr ? { sigma: SIGMA, res: RES, seed: s.seed } : null);
  const useCal = s.dtSrc === 'cal' || !s.freq;
  const dtU = useCal ? (s.cal ? s.cal.dt : NaN) : 1 / s.freq;
  const rows = Math.min(s.rows == null ? pts.length : s.rows, pts.length);
  const an = isFinite(dtU) && rows ? FF.analyze(xs.slice(0, rows), s.n * dtU) : null;
  const rec = {
    mode: s.mode, ideal: s.ideal, readErr, h: s.mode === 'incline' ? s.h / 100 : NaN, sin: Fz.sin, mass: p.m, mu: p.mu, f: p.f, k: p.k,
    freq: s.freq, timerId: s.timerId, dtTrue, dtUsed: dtU, dtSrc: useCal ? 'cal' : 'nom', dtErrPct: isFinite(dtU) ? FF.percentError(dtU, dtTrue) : NaN,
    n: s.n, j0, tau: s.n * dtU, rows, avail: pts.length, complete: pts.length >= 3 && rows === pts.length,
    aFit: an && an.vfit ? an.vfit.slope : NaN, intercept: an && an.vfit ? an.vfit.intercept : NaN,
    aMean: an && an.a.length ? an.aMean : NaN, aFirst: an && an.a.length ? an.a[0] : NaN, aLast: an && an.a.length ? an.a[an.a.length - 1] : NaN, nA: an ? an.a.length : 0,
    aQuad: an && an.xfit ? 2 * an.xfit.c2 : NaN, gEst: an && an.vfit ? an.vfit.slope / Fz.sin : NaN,
    errPct: an && an.vfit ? FF.percentError(an.vfit.slope, G * Fz.sin) : NaN,
    aTheory: mo.moves ? mo.g0 : 0, x0: pts.length ? pts[0].x : NaN, clear0: !!(pts.length && pts[0].x >= CLEAR_GAP), runId: 1,
    calReact: !!(s.cal && s.cal.react)
  };
  const run = Object.assign({}, rec, { moved: mo.moves, nStack: tape.nStack, nDots: tape.dots.length, tEnd: mo.tEnd, vEnd: mo.vEnd });
  const point = rec.complete && an && an.vfit ? {
    mode: s.mode, sin: Fz.sin, a: an.vfit.slope, ideal: s.ideal, readErr, mu: p.mu, f: p.f, k: p.k, mass: p.m, h: rec.h,
    freq: s.freq, timerId: s.timerId, dtSrc: rec.dtSrc, calReact: rec.calReact, dtErrPct: rec.dtErrPct, n: s.n, rows
  } : null;
  return { run, rec, point, mo, tape };
}
function summary(points) {
  const f = points.length >= 2 ? FF.fitLine(points.map(q => q.sin), points.map(q => q.a)) : null;
  return { n: points.length, points, slope: f ? f.slope : NaN, intercept: f ? f.intercept : NaN };
}
/** ① 拉一次紙帶（頁面的 calStart → calStop → calFinish）：拉 T 秒；含反應時間時碼錶慢 r1 按下、慢 r2 停止 */
function pull(o) {
  const s = Object.assign({ T: 3, freq: 60, fHidden: 30, react: false, ideal: true, phase: null, r1: null, r2: null, timerId: 1 }, o);
  const dt = s.freq ? 1 / s.freq : 1 / s.fHidden;
  const react = !s.ideal && s.react;
  const phase0 = s.phase == null ? rng() * dt : s.phase;
  const r1 = react ? (s.r1 == null ? 0.1 + 0.2 * rng() : s.r1) : 0, r2 = react ? (s.r2 == null ? 0.1 + 0.2 * rng() : s.r2) : 0;
  const N = FF.dotsInPull(s.T, dt, phase0);
  const Tmeas = FF.stopwatch(s.T, r1, r2);
  const dtm = FF.dtFromCount(Tmeas, N);
  return { T: s.T, Tmeas, N, dt: dtm, dtTrue: dt, errPct: FF.percentError(dtm, dt), freq: s.freq, react, ideal: s.ideal, timerId: s.timerId };
}
function calrec(trials, dtTrue) {
  const mean = trials.reduce((a, q) => a + q.dt, 0) / trials.length;
  const last = trials[trials.length - 1];
  return { data: { n: trials.length, meanDt: mean, dtTrue, errPct: FF.percentError(mean, dtTrue), freq: last.freq, timerId: last.timerId, lastT: last.Tmeas, lastErrPct: last.errPct }, mean, react: trials.every(q => q.react) };
}
const pctOf = (k, n) => (100 * k / n).toFixed(1) + '%';

const out = [];
function report(id, ok, how) {
  out.push((ok ? 'OK  ' : 'FAIL') + ' ' + id.padEnd(14) + ' L' + String(defs[id].level).padEnd(3) + how);
  if (!ok) failures.push(id);
}

// ---------- 0. 預設狀態 ----------
// 頁面載入時沒有任何事件；預設設定（斜面 h 20 cm、理想、60 Hz、n 4）放開一次只應完成任務 1
const d0 = experiment({});
const trigRun = Object.keys(defs).filter(id => check(id, 'run', d0.run));
const trigRec1 = Object.keys(defs).filter(id => check(id, 'record', Object.assign({}, d0.rec, experiment({ rows: 1 }).rec)));
console.log('預設放開觸發：', trigRun.join(', ') || '（無）', '｜第一次按記錄觸發：', trigRec1.join(', ') || '（無）');
if (trigRun.join() !== 'free-fall-1') failures.push('default run triggers ' + trigRun.join());
if (trigRec1.length) failures.push('first record triggers ' + trigRec1.join());
const pull0 = pull({ T: 1.5 });
const trigCal = Object.keys(defs).filter(id => check(id, 'calib', pull0));
console.log('預設拉 1.5 s 觸發：', trigCal.join(', ') || '（無）');
if (trigCal.length) failures.push('default pull triggers ' + trigCal.join());

// ---------- 1–4 ----------
report('free-fall-1', check('free-fall-1', 'run', d0.run), '預設：啟動計時器、放開滑車（h 20.0 cm）→ 撞上擋板');
const p2 = pull({ T: 3.4 });
report('free-fall-2', check('free-fall-2', 'calrec', calrec([p2], p2.dtTrue).data), `① 拉 3.4 s（碼錶 ${p2.Tmeas.toFixed(2)} s、N = ${p2.N}）→ 記錄`);
report('free-fall-3', check('free-fall-3', 'record', d0.rec), `預設紙帶按「全部記錄」→ ${d0.rec.rows} 個計數點`);
let e = experiment({ h: 12.24 });
report('free-fall-4', check('free-fall-4', 'record', e.rec), `h = 12.24 cm（打字）、理想 → a = ${e.rec.aFit.toFixed(4)} m/s²（也可含誤差微調）`);
console.log('  反例 h = 12.0 / 12.5 cm：', check('free-fall-4', 'record', experiment({ h: 12 }).rec), check('free-fall-4', 'record', experiment({ h: 12.5 }).rec));

// ---------- 5 剛好滑得動（讀數誤差隨機）----------
{
  let ok = 0, N = 300, ex;
  for (let i = 0; i < N; i++) { ex = experiment({ h: 2.5, ideal: false, mu: 0.01, f: 0.05, M: 0.5, seed: (rng() * 4294967296) >>> 0, tPre: 0.2 + rng() }); if (check('free-fall-5', 'record', ex.rec)) ok++; }
  report('free-fall-5', ok > N * 0.5, `含誤差（預設 μ 0.010、f 0.050 N、M 0.50 kg）、h = 2.5 cm（滑桿）→ 理論 a = ${ex.mo.g0.toFixed(4)}、撞擋板 ${ex.mo.tEnd.toFixed(1)} s，全部記錄成功率 ${pctOf(ok, N)}`);
  console.log('  反例 h = 2.0 cm 滑得動嗎：', experiment({ h: 2, ideal: false }).mo.moves, '｜h = 3.5 cm：', check('free-fall-5', 'record', experiment({ h: 3.5, ideal: false, seed: 3 }).rec));
}

// ---------- 6 碼錶的極限 ----------
{
  let ok = 0, N = 4000;
  for (let i = 0; i < N; i++) if (check('free-fall-6', 'calib', pull({ T: 29.5, ideal: false, react: true }))) ok++;
  let ok10 = 0;
  for (let i = 0; i < N; i++) if (check('free-fall-6', 'calib', pull({ T: 10, ideal: false, react: true }))) ok10++;
  report('free-fall-6', ok > N * 0.5, `含誤差＋反應時間，拉約 30 s（最長 30 s）→ 成功率 ${pctOf(ok, N)}（拉 10 s 只有 ${pctOf(ok10, N)}）`);
}

// ---------- 7 重一點比較準 ----------
{
  let ok = 0, N = 400, ex;
  for (let i = 0; i < N; i++) { ex = experiment({ mode: 'fall', m: 1, ideal: false, f: 0.05, kG: 0.4, seed: (rng() * 4294967296) >>> 0, tPre: 0.2 + rng() }); if (check('free-fall-7', 'record', ex.rec)) ok++; }
  let okLight = 0;
  for (let i = 0; i < N; i++) if (check('free-fall-7', 'record', experiment({ mode: 'fall', m: 0.2, ideal: false, seed: (rng() * 4294967296) >>> 0 }).rec)) okLight++;
  report('free-fall-7', ok > N * 0.5, `自由落體 m = 1.00 kg（滑桿）、含誤差（f 0.050 N、k 0.40 g/m）→ 理論 a = ${ex.mo.g0.toFixed(4)}、${ex.rec.rows} 點，成功率 ${pctOf(ok, N)}（m = 0.20 kg：${pctOf(okLight, N)}）`);
}

// ---------- 8 空氣阻力現形 ----------
e = experiment({ mode: 'fall', m: 0.05, ideal: false, f: 0.05, kG: 20, n: 3, seed: 11 });
report('free-fall-8', check('free-fall-8', 'record', e.rec), `自由落體 m = 0.05 kg、k = 20 g/m（滑桿）、含誤差、n = 3 → ${e.rec.rows} 點，ā 由 ${e.rec.aFirst.toFixed(2)} 降到 ${e.rec.aLast.toFixed(2)} m/s²`);
console.log('  反例 m = 0.20、k = 0.40：', check('free-fall-8', 'record', experiment({ mode: 'fall', ideal: false, seed: 11 }).rec));

// ---------- 9 伽利略的斜面 ----------
{
  let ok = 0, N = 200, sm;
  for (let i = 0; i < N; i++) {
    const pts = [12, 24, 36, 48, 60].map(h => experiment({ h, ideal: false, mu: 0.01, seed: (rng() * 4294967296) >>> 0 }).point);
    sm = summary(pts.slice(0, 4));
    if (check('free-fall-9', 'summary', sm)) ok++;
  }
  report('free-fall-9', ok > N * 0.5, `含誤差（μ 0.010、f 0.050 N、M 0.50 kg）h = 12、24、36、48 cm 各記錄完一張表 → 斜率 ${sm.slope.toFixed(3)}，成功率 ${pctOf(ok, N)}`);
  const ideal = summary([12, 24, 36, 48].map(h => experiment({ h }).point));
  console.log('  反例（理想）任務 9：', check('free-fall-9', 'summary', ideal), '斜率', ideal.slope.toFixed(4));
}

// ---------- 10 頻率未知的計時器（所有隱藏頻率 22.0–38.0 Hz 都做得到）----------
{
  let worst = 0, bad = 0;
  for (let fh = 22; fh <= 38 + 1e-9; fh = Math.round((fh + 0.1) * 10) / 10) {
    const trials = [pull({ T: 20, freq: 0, fHidden: fh })];
    const cr = calrec(trials, 1 / fh);
    const ex = experiment({ mode: 'fall', m: 0.2, freq: 0, fHidden: fh, cal: { dt: cr.mean, react: cr.react } });
    if (!check('free-fall-10', 'record', ex.rec)) bad++;
    worst = Math.max(worst, Math.abs(ex.rec.errPct));
  }
  report('free-fall-10', bad === 0, `未知頻率（22.0–38.0 Hz 每 0.1 Hz 全試），① 理想拉 20 s 記錄一次，再做理想自由落體 → 最大 |g 誤差| ${worst.toFixed(2)}%`);
}

// ---------- 11 層層誤差下的 g ----------
{
  let ok = 0, N = 300, last;
  for (let i = 0; i < N; i++) {
    const fh = Math.round((22 + 16 * rng()) * 10) / 10;
    const trials = [0, 1, 2, 3, 4].map(() => pull({ T: 29.5, freq: 0, fHidden: fh, ideal: false, react: true }));
    const cr = calrec(trials, 1 / fh);
    last = experiment({ mode: 'fall', m: 1, ideal: false, f: 0.05, kG: 0.4, freq: 0, fHidden: fh, cal: { dt: cr.mean, react: cr.react }, seed: (rng() * 4294967296) >>> 0, tPre: 0.2 + rng() });
    if (check('free-fall-11', 'record', last.rec)) ok++;
  }
  report('free-fall-11', ok > N * 0.3, `未知頻率，① 含反應時間拉 5 次各約 30 s 取平均；自由落體 m = 1.00 kg、f 0.050 N、k 0.40 g/m、讀數誤差 → 成功率 ${pctOf(ok, N)}（最後一次 g 誤差 ${last.rec.errPct.toFixed(2)}%）`);
}

// ---------- 12 用斜率消去摩擦 ----------
{
  let ok = 0, N = 200, sm;
  for (let i = 0; i < N; i++) {
    const fh = Math.round((22 + 16 * rng()) * 10) / 10;
    const trials = [0, 1, 2, 3, 4].map(() => pull({ T: 29.5, freq: 0, fHidden: fh, ideal: false, react: true }));
    const cr = calrec(trials, 1 / fh);
    const pts = [24, 33, 42, 51, 60].map(h => experiment({ h, M: 2, ideal: false, mu: 0.01, f: 0.05, kG: 0.4, freq: 0, fHidden: fh, timerId: 5, cal: { dt: cr.mean, react: cr.react }, seed: (rng() * 4294967296) >>> 0 }).point);
    sm = summary(pts);
    if (check('free-fall-12', 'summary', sm)) ok++;
  }
  report('free-fall-12', ok > N * 0.3, `未知頻率（同上校正 5 次），含所有誤差、M = 2.00 kg，h = 24、33、42、51、60 cm → 斜率 ${sm.slope.toFixed(3)}，成功率 ${pctOf(ok, N)}`);
  const one = summary([24, 33, 42, 51, 60].map(h => experiment({ h, ideal: false, freq: 60, kG: 0.4 }).point));
  console.log('  反例（60 Hz 標示值）任務 12：', check('free-fall-12', 'summary', one));
}

// ---------- 隱藏任務 ----------
e = experiment({ tPre: 100 / 60 + 0.001 });
report('free-fall-h1', check('free-fall-h1', 'run', e.run), `計時器開著等 1.67 s 以上（慢動作 ¼× 約 7 s）再放手 → 起點疊了 ${e.run.nStack} 點`);
e = experiment({ h: 60 });
report('free-fall-h2', check('free-fall-h2', 'record', e.rec), `h = 60 cm（滑桿最大，sinθ = 0.5）、理想 → a = ${e.rec.aFit.toFixed(4)} = g/2`);
{
  const dt = 1 / 20, ph = 0.02;
  const pc = pull({ T: ph + 60.5 * dt, freq: 20, phase: ph });
  let hit = 0;
  for (let i = 0; i < 2000; i++) { const T = 2.9 + 0.3 * rng(); if (check('free-fall-h3', 'calib', pull({ T, freq: 20 }))) hit++; }
  report('free-fall-h3', check('free-fall-h3', 'calib', pc), `① 20 Hz、拉約 3.0 s 時按停止 → N = ${pc.N}（N − 1 = 60）；在 2.9–3.2 s 之間隨手按，成功率 ${pctOf(hit, 2000)}`);
}

// =====================================================================
// 隱藏任務 h4–h10（11/13 補到 10 個）
// 照頁面模擬一整段操作：每個任務的判定記憶（mem）、a–sinθ 圖累積的點、① 各台計時器的校正紀錄都會留著，
// 像學生一路做下來。事件照頁面的順序送出：放手後 run → 按「全部記錄」record →（完整張表）summary；① 拉完 calib → 記錄 calrec。
// =====================================================================
const ALL = Object.keys(defs);
const HID = ALL.filter(id => defs[id].hidden);
const NEW = HID.filter(id => +id.split('-h')[1] >= 4);
let S = null;
function reset() { S = { mem: {}, done: {}, got: [], runId: 0, summary: [], trials: {} }; ALL.forEach(id => { S.mem[id] = {}; }); }
function fire(type, data) {
  ALL.forEach(id => { if (!S.done[id] && defs[id].check({ type, data }, S.mem[id])) { S.done[id] = true; S.got.push(id); } });
}
/** ① 拉一次紙帶（o 同 pull()）；record: false 表示不按「記錄這一次」 */
function doPull(o) {
  const p = pull(o);
  fire('calib', p);
  if (o.record !== false && p.N >= 2) {
    const tr = S.trials[p.timerId] = S.trials[p.timerId] || [];
    tr.push(p);
    fire('calrec', calrec(tr, p.dtTrue).data);
  }
  return p;
}
/** ②③ 做一次並按「全部記錄」（o 同 experiment()）；Δt 用 ① 時取同一台計時器各次的平均（頁面的 calMean） */
function doRun(o) {
  o = Object.assign({ timerId: 1, freq: 60 }, o);
  const tr = S.trials[o.timerId] || [];
  const useCal = o.dtSrc === 'cal' || o.freq === 0;
  const cal = useCal && tr.length ? { dt: tr.reduce((a, q) => a + q.dt, 0) / tr.length, react: tr.every(q => q.react) } : null;
  const ex = experiment(Object.assign({}, o, { cal }));
  S.runId++;
  ex.run.runId = ex.rec.runId = S.runId;
  fire('run', ex.run);
  if (ex.mo.moves && isFinite(ex.rec.dtUsed)) fire('record', ex.rec);
  if (ex.point) {
    S.summary.push(Object.assign({ runId: S.runId }, ex.point));
    fire('summary', summary(S.summary.map(q => Object.assign({}, q))));
  }
  return ex;
}
/** 依序做一串操作：{ pull: {...} }、{ run: {...} }、{ clear: true }（全部清除） */
function play(steps) {
  const out = [];
  steps.forEach(st => {
    if (st.clear) { S.summary = []; S.trials = {}; } else if (st.pull) out.push(doPull(st.pull)); else out.push(doRun(st.run));
  });
  return out;
}
const hiddenGot = () => S.got.filter(id => HID.includes(id));
const seedOf = () => (rng() * 4294967296) >>> 0;
const fx = (v, d) => (isFinite(v) ? v.toFixed(d) : '—');

// ---------- 1. 每個新隱藏任務的解（真的事件餵給真的 check）----------
const unk = (fh, tid) => ({ freq: 0, fHidden: fh, timerId: tid });
const HSOL = {
  'free-fall-h4': [{ run: { mode: 'fall', m: 0.05, ideal: false, f: 0, kG: 0, seed: 21 } }, { run: { mode: 'fall', m: 0.5, ideal: false, f: 0, kG: 0, seed: 22 } }],
  'free-fall-h5': [{ run: { h: 10, M: 0.2, ideal: false, mu: 0.01, f: 0, kG: 0, seed: 26 } }, { run: { h: 10, M: 2, ideal: false, mu: 0.01, f: 0, kG: 0, seed: 27 } }],
  'free-fall-h6': [{ run: { h: 50 } }, { run: { mode: 'fall', m: 0.05, ideal: false, f: 0.3, kG: 20, seed: 23 } }],
  'free-fall-h7': [{ run: { mode: 'fall', m: 0.1, ideal: false, f: 0.05, kG: 5, seed: 24 } }, { run: { mode: 'fall', m: 0.2, ideal: false, f: 0.1, kG: 10, seed: 25 } }],
  'free-fall-h8': [6, 12, 18, 24].map((h, i) => ({ run: { h, ideal: false, mu: 0.02, f: 0, seed: 30 + i } })),
  'free-fall-h9': [20, 40, 60].map((h, i) => ({ run: { h, M: 0.5, ideal: false, mu: 0, f: 0.1, seed: 40 + i } })).concat([{ run: { mode: 'fall', m: 0.5, ideal: false, f: 0.1, seed: 44 } }]),
  'free-fall-h10': [{ run: { h: 1, M: 0.95, ideal: false, mu: 0, f: 0.075, freq: 20, timerId: 7, n: 10, seed: 50 } }]
};
const HOW = {
  'free-fall-h4': o => `含誤差、f = 0、k = 0（滑桿最小），自由落體 m = 0.05 kg 與 0.50 kg 各記錄完整張表 → g = ${fx(o[0].rec.aFit, 3)}、${fx(o[1].rec.aFit, 3)} m/s²`,
  'free-fall-h5': o => `含誤差、f = 0、k = 0、μ = 0.010（預設），h = 10 cm，滑車 M = 0.20 kg 與 2.00 kg（滑桿兩端）→ a = ${fx(o[0].rec.aFit, 4)}、${fx(o[1].rec.aFit, 4)} m/s²（g sinθ = ${fx(G * o[0].rec.sin, 4)}，摩擦吃掉 ${fx(100 * (1 - o[0].mo.g0 / (G * o[0].rec.sin)), 1)}%）`,
  'free-fall-h6': o => `理想斜面 h = 50 cm → a = ${fx(o[0].rec.aFit, 3)}；含誤差自由落體 m = 0.05 kg、f = 0.300 N、k = 20 g/m（三個滑桿都在端點）→ a = ${fx(o[1].rec.aFit, 3)} m/s²`,
  'free-fall-h7': o => `含誤差自由落體 (m, f, k) = (0.10 kg, 0.050 N, 5.0 g/m) 與 (0.20, 0.100, 10.0)：f/m = 0.5 N/kg、k/m = 0.05 /m → a = ${fx(o[0].rec.aFit, 3)}、${fx(o[1].rec.aFit, 3)} m/s²`,
  'free-fall-h8': () => { const sm = summary(S.summary); return `含誤差、μ = 0.020、f = 0，h = 6、12、18、24 cm（sinθ 0.05–0.20）→ a–sinθ 斜率 ${fx(sm.slope, 3)}、x 截距 ${fx(-sm.intercept / sm.slope, 4)}（μ = 0.020）`; },
  'free-fall-h9': o => { const f = FF.fitLine(o.slice(0, 3).map(e => e.point.sin), o.slice(0, 3).map(e => e.point.a)); return `含誤差、μ = 0、f = 0.100 N、M = m = 0.50 kg：斜面 h = 20、40、60 cm 的直線 a = ${fx(f.slope, 3)} sinθ ${fx(f.intercept, 3)}，延長到 sinθ = 1 是 ${fx(f.slope + f.intercept, 3)}；自由落體量得 ${fx(o[3].rec.aFit, 3)} m/s²`; },
  'free-fall-h10': o => `含誤差斜面 h = 1.0 cm、μ = 0、f = 0.075 N、M = 0.95 kg（全是滑桿值）、20 Hz、n = 10 → 理論 a = ${fx(o[0].mo.g0 * 1000, 3)} mm/s²、量得 ${fx(o[0].rec.aFit * 1000, 3)} mm/s²（g/3600 = ${fx(G / 3.6, 3)} mm/s²），滑到擋板要 ${fx(o[0].mo.tEnd, 1)} s`
};
for (const id of NEW) {
  reset();
  const o = play(HSOL[id]);
  report(id, S.done[id], HOW[id](o));
}
// 讀數誤差是隨機的：用許多組亂數重做，列出成功率（h8 的 x 截距、h7 兩次量得的加速度、h10 的慢速紙帶）
{
  const rate = (N, fn) => { let k = 0; for (let i = 0; i < N; i++) if (fn()) k++; return pctOf(k, N); };
  console.log('  h4 成功率（讀數誤差開）：' + rate(200, () => { reset(); play([{ run: { mode: 'fall', m: 0.05, ideal: false, f: 0, kG: 0, seed: seedOf(), tPre: 0.2 + rng() } }, { run: { mode: 'fall', m: 1, ideal: false, f: 0, kG: 0, seed: seedOf(), tPre: 0.2 + rng() } }]); return S.done['free-fall-h4']; }));
  console.log('  h5 成功率（讀數誤差開）：' + rate(200, () => { reset(); play([{ run: { h: 10, M: 0.2, ideal: false, mu: 0.01, f: 0, kG: 0, seed: seedOf(), tPre: 0.2 + rng() } }, { run: { h: 10, M: 2, ideal: false, mu: 0.01, f: 0, kG: 0, seed: seedOf(), tPre: 0.2 + rng() } }]); return S.done['free-fall-h5']; }) + '；關掉讀數誤差必定成功');
  console.log('  h7 成功率（讀數誤差開）：' + rate(200, () => { reset(); play([{ run: { mode: 'fall', m: 0.1, ideal: false, f: 0.05, kG: 5, seed: seedOf(), tPre: 0.2 + rng() } }, { run: { mode: 'fall', m: 0.2, ideal: false, f: 0.1, kG: 10, seed: seedOf(), tPre: 0.2 + rng() } }]); return S.done['free-fall-h7']; }));
  console.log('  h8 成功率（讀數誤差開，h = 6–24 cm）：' + rate(200, () => { reset(); play([6, 12, 18, 24].map(h => ({ run: { h, ideal: false, mu: 0.02, f: 0, seed: seedOf(), tPre: 0.2 + rng() } }))); return S.done['free-fall-h8']; }));
  console.log('  h9 成功率（讀數誤差開）：' + rate(200, () => { reset(); play([20, 40, 60].map(h => ({ run: { h, ideal: false, mu: 0, f: 0.1, seed: seedOf(), tPre: 0.2 + rng() } })).concat([{ run: { mode: 'fall', m: 0.5, ideal: false, f: 0.1, seed: seedOf() } }])); return S.done['free-fall-h9']; }) + '；關掉讀數誤差必定成功');
  console.log('  h10 成功率（讀數誤差開）：20 Hz、n = 10 ' + rate(100, () => { reset(); play([{ run: { h: 1, M: 0.95, ideal: false, mu: 0, f: 0.075, freq: 20, n: 10, seed: seedOf(), tPre: 0.2 + rng() } }]); return S.done['free-fall-h10']; }) +
    '；60 Hz、n = 4 ' + rate(100, () => { reset(); play([{ run: { h: 1, M: 0.95, ideal: false, mu: 0, f: 0.075, seed: seedOf(), tPre: 0.2 + rng() } }]); return S.done['free-fall-h10']; }) + '（點太密、讀數誤差蓋過位移；關掉讀數誤差必定成功）');
}

// ---------- 2. 等級分布 ----------
{
  const lv = HID.map(id => defs[id].level);
  const pass = HID.length === 10 && lv.every(l => l >= 3 && l <= 10) && lv.filter(l => l >= 7).length >= 3;
  console.log((pass ? 'OK  ' : 'FAIL') + ' 隱藏任務 ' + HID.length + ' 個，等級 ' + lv.join('、') + '（7 級以上 ' + lv.filter(l => l >= 7).length + ' 個），總星數 ' + lv.reduce((a, l) => a + 2 * l, 0) + '（星星 = 等級 × 2）');
  if (!pass) failures.push('hidden levels');
}

// ---------- 3. 10 個隱藏任務互不連帶：每個的解只完成它自己 ----------
// h1–h3 用上面的解：h1 = 計時器先開 1.7 s 再放手；h2 = 理想斜面 h = 60 cm；h3 = ① 20 Hz 拉到 N = 61
const SOLO = Object.assign({
  'free-fall-h1': [{ run: { tPre: 100 / 60 + 0.001 } }],
  'free-fall-h2': [{ run: { h: 60 } }],
  'free-fall-h3': [{ pull: { T: 0.02 + 60.5 / 20, freq: 20, phase: 0.02, timerId: 9 } }]
}, HSOL);
for (const id of HID) {
  reset();
  play(SOLO[id]);
  const got = hiddenGot();
  const pass = got.length === 1 && got[0] === id;
  console.log((pass ? 'OK  ' : 'FAIL') + ' ' + id.padEnd(14) + ' 的解只完成隱藏任務：' + (got.join('、') || '（無）'));
  if (!pass) failures.push(id + ' solo ' + got.join());
}
// 依序把 10 個隱藏任務的解一路做下來（共用記憶），每一步只多完成那一個（不會順便完成後面的）
// h8、h9 看的是整張 a–sinθ 圖，做之前要先「全部清除」（圖上留著別的點本來就不會過）；其餘任務不清除
for (const [name, order] of [['照 h1 → h10', HID], ['倒過來 h10 → h1', HID.slice().reverse()]]) {
  reset();
  let ok = true;
  for (const id of order) {
    const before = hiddenGot().length;
    if (id === 'free-fall-h8' || id === 'free-fall-h9') play([{ clear: true }]);
    play(SOLO[id]);
    const now = hiddenGot();
    if (now.length !== before + 1 || now[now.length - 1] !== id) { ok = false; console.log('FAIL 一路做到 ' + id + ' 時完成了 ' + (now.slice(before).join('、') || '（無）')); }
  }
  console.log((ok ? 'OK  ' : 'FAIL') + ' 10 個隱藏任務的解' + name + '一路做（共用判定記憶）：每一步只完成當下那一個');
  if (!ok) failures.push('hidden chain ' + name);
}

// ---------- 4. 公開任務的示範解（含學生常選的各種自然數值與順序）不會順便完成新的隱藏任務 ----------
const pullsReact = (fh, tid, k) => Array.from({ length: k }, () => ({ pull: { T: 29.5, freq: 0, fHidden: fh, timerId: tid, ideal: false, react: true } }));
const PUB = {
  'free-fall-1': [[{ run: {} }], [{ run: { mode: 'fall' } }], [{ run: { tPre: 1.5 } }]],
  'free-fall-2': [[{ pull: { T: 3.4 } }], [{ pull: { T: 3, ideal: false, react: true } }], [{ pull: { T: 5, freq: 50 } }], [{ pull: { T: 10, freq: 20 } }]],
  'free-fall-3': [[{ run: {} }], [{ run: { mode: 'fall', n: 2 } }], [{ run: { h: 40, n: 2 } }], [{ run: { freq: 50, n: 5 } }]],
  'free-fall-4': [[{ run: { h: 12 } }, { run: { h: 12.5 } }, { run: { h: 12.24 } }], [{ run: { h: 12.5, ideal: false, readErr: false, mu: 0, f: 0, kG: 0 } }],
    [{ run: { h: 13.5, ideal: false, seed: 61 } }, { run: { h: 14, ideal: false, seed: 62 } }]],
  'free-fall-5': [[2.5, 3, 3.5, 4].map(h => ({ run: { h, ideal: false, seed: 70 + h * 2 } })),
    [{ run: { h: 3.5, ideal: false, mu: 0.02, seed: 71 } }, { run: { h: 4, ideal: false, mu: 0.02, seed: 72 } }],
    [{ run: { h: 2, ideal: false, M: 2, seed: 73 } }, { run: { h: 2.5, ideal: false, M: 1, seed: 74 } }, { run: { h: 2, ideal: false, M: 0.5, f: 0, seed: 75 } }],
    [{ run: { h: 2.5, ideal: false, mu: 0.01, f: 0, M: 0.5, seed: 76 } }, { run: { h: 1.5, ideal: false, mu: 0.01, f: 0, M: 0.5, seed: 77 } }]],
  'free-fall-6': [[{ pull: { T: 29.5, ideal: false, react: true, record: false } }], [{ pull: { T: 29.5, ideal: false, react: true } }, { pull: { T: 20, ideal: false, react: true } }]],
  'free-fall-7': [[{ run: { mode: 'fall', m: 1, ideal: false, seed: 80 } }], [{ run: { mode: 'fall', m: 0.5, ideal: false, seed: 81 } }, { run: { mode: 'fall', m: 1, ideal: false, seed: 82 } }],
    [{ run: { mode: 'fall', m: 0.2, ideal: false, seed: 83 } }, { run: { mode: 'fall', m: 1, ideal: false, f: 0.05, kG: 0.4, n: 2, seed: 84 } }]],
  'free-fall-8': [[{ run: { mode: 'fall', m: 0.05, ideal: false, kG: 20, n: 3, seed: 90 } }], [{ run: { mode: 'fall', m: 0.05, ideal: false, kG: 20, seed: 91 } }],
    [{ run: { mode: 'fall', m: 0.05, ideal: false, kG: 20, f: 0.1, n: 2, seed: 92 } }], [{ run: { mode: 'fall', m: 0.1, ideal: false, kG: 20, n: 2, seed: 93 } }, { run: { mode: 'fall', m: 0.05, ideal: false, kG: 10, n: 3, seed: 94 } }]],
  'free-fall-9': [[12, 24, 36, 48].map(h => ({ run: { h, ideal: false, seed: 100 + h } })), [10, 20, 30, 40, 50, 60].map(h => ({ run: { h, ideal: false, seed: 101 + h } })),
    [10, 20, 30, 40].map(h => ({ run: { h, ideal: false, mu: 0.02, seed: 102 + h } })), [20, 30, 40, 50, 60].map(h => ({ run: { h, ideal: false, f: 0, seed: 103 + h } })),
    [{ clear: true }].concat([15, 30, 45, 60].map(h => ({ run: { h, ideal: false, mu: 0.01, f: 0, kG: 0, seed: 104 + h } })))],
  'free-fall-10': [[{ pull: { T: 20, ...unk(30, 2) } }, { run: { mode: 'fall', ...unk(30, 2) } }], [{ pull: { T: 3, ...unk(23.7, 3) } }, { run: { mode: 'fall', ...unk(23.7, 3) } }],
    [{ pull: { T: 10, ...unk(37.2, 4) } }, { pull: { T: 10, ...unk(37.2, 4) } }, { run: { mode: 'fall', m: 1, ...unk(37.2, 4) } }]],
  'free-fall-11': [pullsReact(27.4, 5, 5).concat([{ run: { mode: 'fall', m: 1, ideal: false, ...unk(27.4, 5), seed: 110 } }])],
  'free-fall-12': [pullsReact(33.1, 6, 5).concat([24, 33, 42, 51, 60].map(h => ({ run: { h, M: 2, ideal: false, ...unk(33.1, 6), seed: 120 + h } })))]
};
{
  let bad = 0, n = 0;
  for (const id of Object.keys(PUB)) {
    PUB[id].forEach((steps, k) => {
      reset();
      play(steps);
      n++;
      const got = hiddenGot();
      if (got.length) { bad++; console.log('FAIL ' + id + ' 的第 ' + (k + 1) + ' 組示範解順便完成了 ' + got.join('、')); }
    });
  }
  console.log((bad ? 'FAIL' : 'OK  ') + ' 12 個公開任務、共 ' + n + ' 組示範解（整數、5 的倍數、任務下限值、不同計時器與 n）逐一做：沒有順便完成任何隱藏任務');
  if (bad) failures.push('public demos complete hidden');
  // 一路做下來（共用記憶、a–sinθ 圖不清除）：照任務順序、倒過來、以及「先做 A 再做 B」的常見接法
  const ORDERS = {
    '任務 1 → 12 一路做': Object.keys(PUB),
    '任務 12 → 1 倒過來做': Object.keys(PUB).reverse(),
    '先 8 再 7（k 留在 20 g/m 直接把 m 調到 1）': null,
    '先 9 再 8、再 5（a–sinθ 圖一直累積）': ['free-fall-9', 'free-fall-8', 'free-fall-5'],
    '先 2（含反應時間）再 3、4（理想、Δt 用標示值）': ['free-fall-2', 'free-fall-3', 'free-fall-4'],
    '先 5 再 9（μ 0.020、f 0 的緩坡留在圖上）': ['free-fall-5', 'free-fall-9']
  };
  for (const name of Object.keys(ORDERS)) {
    reset();
    if (ORDERS[name]) ORDERS[name].forEach(id => PUB[id].forEach(steps => play(steps)));
    else play([{ run: { mode: 'fall', m: 0.05, ideal: false, kG: 20, n: 3, seed: 130 } }, { run: { mode: 'fall', m: 1, ideal: false, kG: 20, seed: 131 } }, { run: { mode: 'fall', m: 1, ideal: false, kG: 0.4, seed: 132 } }]);
    const got = hiddenGot().filter(id => NEW.includes(id));
    console.log((got.length ? 'FAIL' : 'OK  ') + ' ' + name + ' → 完成的新隱藏任務：' + (got.join('、') || '（無）'));
    if (got.length) failures.push(name);
  }
}

// ---------- 5. 新隱藏任務的反例（預設設定、一般任務常見設定都不會完成）----------
function only(id, steps, note) {
  reset();
  play(steps);
  const got = S.done[id];
  console.log((got ? 'FAIL' : 'OK  ') + ' ' + id.padEnd(14) + ' 不該通過：' + note);
  if (got) failures.push(id + ' counterexample: ' + note);
}
only('free-fall-h4', [{ run: { mode: 'fall', m: 0.05 } }, { run: { mode: 'fall', m: 1 } }], '理想模式 m = 0.05 與 1.00 kg（不必動手就沒有阻力，不算）');
only('free-fall-h4', [{ run: { mode: 'fall', m: 0.05, ideal: false, seed: 1 } }, { run: { mode: 'fall', m: 1, ideal: false, seed: 2 } }], '含誤差但 f、k 用預設值 0.050 N、0.40 g/m');
only('free-fall-h4', [{ run: { mode: 'fall', m: 0.1, ideal: false, f: 0, kG: 0 } }, { run: { mode: 'fall', m: 0.5, ideal: false, f: 0, kG: 0 } }], '真空但質量只差 5 倍');
only('free-fall-h4', [{ run: { mode: 'fall', m: 0.05, ideal: false, f: 0, kG: 0.4 } }, { run: { mode: 'fall', m: 1, ideal: false, f: 0, kG: 0.4 } }], 'f = 0 但空氣阻力還在');
only('free-fall-h5', [{ run: { h: 10, M: 0.2 } }, { run: { h: 10, M: 2 } }], '理想模式（沒有摩擦，不算）');
only('free-fall-h5', [{ run: { h: 10, M: 0.2, ideal: false, seed: 1 } }, { run: { h: 10, M: 2, ideal: false, seed: 2 } }], '含誤差但 f、k 用預設值：紙帶摩擦不按重量收費，重的比較快');
only('free-fall-h5', [{ run: { h: 10, M: 0.5, ideal: false, mu: 0.01, f: 0, kG: 0 } }, { run: { h: 10, M: 2, ideal: false, mu: 0.01, f: 0, kG: 0 } }], '質量只差 4 倍');
only('free-fall-h5', [{ run: { h: 40, M: 0.2, ideal: false, mu: 0.01, f: 0, kG: 0 } }, { run: { h: 40, M: 2, ideal: false, mu: 0.01, f: 0, kG: 0 } }], '坡太陡，摩擦只吃掉 ' + fx(100 * 0.01 * Math.sqrt(1 - 1 / 9) * 3, 1) + '%（看不出摩擦）');
only('free-fall-h5', [{ run: { h: 10, M: 0.2, ideal: false, mu: 0.01, f: 0, kG: 0 } }, { run: { h: 12, M: 2, ideal: false, mu: 0.01, f: 0, kG: 0 } }], '高度差不同');
only('free-fall-h6', [{ run: { h: 60 } }].concat(PUB['free-fall-8'][0]), '理想斜面 h = 60 cm（4.9 m/s²）對任務 8 的自然解（' + fx(experiment({ mode: 'fall', m: 0.05, ideal: false, kG: 20, n: 3, seed: 90 }).rec.aFit, 2) + ' m/s²）');
only('free-fall-h6', [{ run: { h: 36 } }, { run: { mode: 'fall', m: 0.05, ideal: false, f: 0.3, kG: 20, seed: 23 } }], '理想斜面 h = 36 cm（2.94 m/s²）贏不過最慢的落體');
only('free-fall-h6', [{ run: { h: 60 } }, { run: { mode: 'fall', m: 0.05, ideal: false, f: 0.1, kG: 20, seed: 24 } }], '任務 8 的設定把 f 調到 0.100 N：落體還是比斜面快');
only('free-fall-h7', [PUB['free-fall-8'][0][0], { run: { mode: 'fall', m: 0.1, ideal: false, kG: 20, n: 3, seed: 5 } }], '任務 8 的解再把 m 加倍（k 已在最大，k/m 只剩一半）');
only('free-fall-h7', [{ run: { mode: 'fall', m: 0.1, ideal: false, f: 0.05, kG: 5 } }, { run: { mode: 'fall', m: 0.2, ideal: false, f: 0.05, kG: 10 } }], 'k/m 相同但 f 沒有跟著加倍');
only('free-fall-h7', [{ run: { mode: 'fall', m: 0.2, ideal: false, f: 0.05, kG: 0.4 } }, { run: { mode: 'fall', m: 0.4, ideal: false, f: 0.1, kG: 0.8 } }], '比例都對，但 k/m = 0.002 /m，空氣阻力可忽略');
only('free-fall-h8', PUB['free-fall-9'][0], '任務 9 的解（μ 0.010、f 0.050 N）');
only('free-fall-h8', [6, 12, 18, 24].map(h => ({ run: { h, ideal: false, mu: 0.02, f: 0.05 } })), 'μ = 0.020 但紙帶摩擦還在：x 截距 = μ + f/(Mg)');
only('free-fall-h8', [3, 6, 12, 18].map(h => ({ run: { h, ideal: false, mu: 0.01, f: 0 } })), 'μ 用預設值 0.010');
only('free-fall-h8', [6, 18, 30, 42].map(h => ({ run: { h, ideal: false, mu: 0.02, f: 0 } })), '坡太陡（sinθ 到 0.35）');
only('free-fall-h9', PUB['free-fall-9'][0].concat([{ run: { mode: 'fall', m: 0.5, ideal: false, seed: 7 } }]), '任務 9 的解再加一點自由落體（μ 0.010）');
only('free-fall-h9', [20, 40, 60].map(h => ({ run: { h, ideal: false, mu: 0, f: 0.1, M: 0.5 } })).concat([{ run: { mode: 'fall', m: 0.2, ideal: false, f: 0.1 } }]), '重物比滑車輕（f/m 不同）：落點掉到線下 3%');
only('free-fall-h9', [20, 40, 60].map(h => ({ run: { h, ideal: false, mu: 0, f: 0, kG: 0 } })).concat([{ run: { mode: 'fall', ideal: false, f: 0, kG: 0 } }]), '所有摩擦都歸零：直線過原點（和理想一樣，不算）');
only('free-fall-h9', [20, 40, 60].map(h => ({ run: { h } })).concat([{ run: { mode: 'fall' } }]), '理想模式');
only('free-fall-h10', PUB['free-fall-5'][0], '任務 5 的解（a = 6 mm/s² 左右）');
only('free-fall-h10', [{ run: { h: 1, M: 1, ideal: false, mu: 0, f: 0.075, freq: 20, n: 10, readErr: false } }], '滑桿上相鄰的 M = 1.00 kg：a = ' + fx(FF.forces({ mode: 'incline', h: 0.01, m: 1, mu: 0, f: 0.075, k: 0.0004 }).g0 * 1000, 2) + ' mm/s²');
{
  // h10：任務 5 學生常用的組合（h 滑桿 1–60 cm、μ 0.010–0.050、f 0／0.050／0.100 N、M 0.2／0.5／1／1.5／2 kg）都不在 g/3600 ± 3%
  let nat = 0, grid = 0;
  for (let h = 1; h <= 60; h += 0.5) for (const mu of [0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05]) for (const f of [0, 0.05, 0.1]) for (const M of [0.2, 0.5, 1, 1.5, 2]) {
    const g0 = FF.forces({ mode: 'incline', h: h / 100, m: M, mu, f, k: 0 }).g0;
    if (Math.abs(g0 / (G / 3600) - 1) <= 0.03) nat++;
  }
  for (let hi = 0; hi <= 118; hi++) for (let mi = 0; mi <= 50; mi++) for (let fi = 0; fi <= 60; fi++) for (let Mi = 0; Mi <= 36; Mi++) {
    const g0 = FF.forces({ mode: 'incline', h: (1 + hi * 0.5) / 100, m: 0.2 + Mi * 0.05, mu: mi * 0.001, f: fi * 0.005, k: 0 }).g0;
    if (Math.abs(g0 / (G / 3600) - 1) <= 0.03) grid++;
  }
  console.log((nat ? 'FAIL' : 'OK  ') + ' free-fall-h10  任務 5 的常見組合在 g/3600 ± 3% 內的有 ' + nat + ' 組；只用滑桿（h、μ、f、M 全格點約 1370 萬組）有 ' + grid + ' 組解');
  if (nat) failures.push('h10 natural');
}

// ---------- 6. 亂按模擬：像試玩一樣隨機換模式、計時器、理想／含誤差、拉滑桿（常落在端點）、拉紙帶、全部記錄、全部清除 ----------
{
  const rnd = FF.mulberry32(20261113);
  const pick = (name, edge) => { const r = RANGE[name], u = rnd(); if (u < edge) return r.min; if (u < 2 * edge) return r.max; return +(r.min + Math.round(rnd() * (r.max - r.min) / r.step) * r.step).toFixed(4); };
  const hits = {};
  let runs = 0, pulls = 0;
  const SEQ = 150, PER = 40;
  for (let q = 0; q < SEQ; q++) {
    reset();
    const st = { mode: 'incline', h: 20, M: 0.5, m: 0.2, ideal: true, readErr: true, react: true, f: 0.05, mu: 0.01, kG: 0.4, n: 4, freq: 60, fHidden: 30, timerId: 1, dtSrc: 'nom' };
    for (let i = 0; i < PER; i++) {
      const w = rnd();
      if (w < 0.08) st.mode = rnd() < 0.5 ? 'incline' : 'fall';
      else if (w < 0.14) st.ideal = !st.ideal;
      else if (w < 0.18) { st.freq = [60, 50, 20, 0][Math.floor(rnd() * 4)]; if (!st.freq) st.fHidden = Math.round((22 + 16 * rnd()) * 10) / 10; st.timerId++; }
      else if (w < 0.22) st.dtSrc = st.dtSrc === 'cal' ? 'nom' : 'cal';
      else if (w < 0.24) st.readErr = !st.readErr;
      else if (w < 0.26) st.react = !st.react;
      else if (w < 0.50) { const k = ['h', 'M', 'm', 'f', 'mu', 'kG', 'n'][Math.floor(rnd() * 7)]; st[k] = pick(k, 0.15); }
      else if (w < 0.62) { pulls++; doPull({ T: rnd() < 0.3 ? 0.05 + 0.5 * rnd() : 0.5 + 8 * rnd(), freq: st.freq, fHidden: st.fHidden, timerId: st.timerId, ideal: st.ideal, react: st.react, record: rnd() < 0.7 }); }
      else if (w < 0.97) { runs++; doRun(Object.assign({}, st, { seed: (rnd() * 4294967296) >>> 0, tPre: 0.1 + 1.2 * rnd(), rows: rnd() < 0.75 ? null : Math.floor(rnd() * 6) })); }
      else { S.summary = []; S.trials = {}; }
    }
    S.got.filter(id => NEW.includes(id)).forEach(id => { hits[id] = (hits[id] || 0) + 1; });
  }
  const bad = Object.keys(hits);
  console.log((bad.length ? 'FAIL' : 'OK  ') + ' 亂按模擬 ' + SEQ + ' 輪（每輪 ' + PER + ' 個操作，共放手 ' + runs + ' 次、拉紙帶 ' + pulls + ' 次）：新隱藏任務 h4–h10 被誤觸 ' + (bad.map(id => id + ' ×' + hits[id]).join('、') || '0 次'));
  if (bad.length) failures.push('random clicks: ' + bad.join());
}

// ---------- 英文文字不可有中文 ----------
const CJK = /[　-鿿＀-￯]/;
for (const id of Object.keys(defs)) {
  const m = defs[id];
  for (const t of [m.title, m.desc, m.riddle]) if (t && CJK.test(t.en)) failures.push(id + ' has CJK in English text');
  if (!/^free-fall-(\d+|h\d+)$/.test(id)) failures.push('bad id ' + id);
  if (!(m.level >= 1 && m.level <= 10)) failures.push('bad level ' + id);
}

console.log(out.join('\n'));
const normal = Object.keys(defs).filter(id => !defs[id].hidden).length, hidden = Object.keys(defs).length - normal;
console.log(`任務 ${normal} 個＋隱藏 ${hidden} 個`);
if (failures.length) { console.log('失敗：', failures.join('；')); process.exit(1); }
console.log('全部任務都做得到。');
