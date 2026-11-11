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
