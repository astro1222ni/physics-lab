/* 任務可達成的證明腳本。用法：node tools/mission-proofs/resonance-tube.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。
 * 這裡照頁面（js/resonance-tube.js）的做法產生事件：水面一次移動 1 mm、讀數取到 1 mm、
 * 「含誤差」時每筆讀數加上標準差 1 mm 的隨機誤差；共鳴位置用「掃描響度找最大」找出，不直接用公式。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(__ROOT + 'js/resonance-tube-core.js');
let defs;
global.LabMission = { register: (m, l) => { defs = l; } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/resonance-tube.js');

// 可重現的亂數（含誤差模式用）
let seed = 20261111;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
function gauss() { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); }

const done = new Set();
let quiet = false;
function emit(type, data) {
  defs.forEach(m => {
    if (!done.has(m.id) && m.check({ type, data }, {})) { done.add(m.id); if (!quiet) console.log('  完成', m.id, 'L' + m.level + (m.hidden ? '（隱藏）' : '')); }
  });
}

// ---------- 頁面的狀態與事件（與 js/resonance-tube.js 相同的算法） ----------
let st;
function fresh() { st = { src: 'fork', f: 512, Tc: 25, d: 0.03, L: 0.40, noisy: false, records: [], sounding: false }; }
const key = () => [st.src, st.f, st.Tc, st.d].join('|');
function setL(L) {
  st.L = Math.round(Math.min(C.L_MAX, Math.max(C.L_MIN, L)) * 1000) / 1000;   // 1 mm 一格
  if (!st.sounding) return;
  const near = C.nearestResonance(st.L, st.f, st.Tc, st.d / 2);
  emit('tuned', { src: st.src, f: st.f, Tc: st.Tc, d: st.d, L: st.L, n: near.n, below: near.below, db: near.db, sounding: true });
}
function strike() { st.sounding = true; emit('strike', { src: st.src, f: st.f }); }
function groupAnalysis(k) {
  const recs = st.records.filter(r => r.key === k);
  if (!recs.length) return null;
  const r0 = recs[0];
  const an = C.analyze(recs.map(r => r.Lread), r0.src === 'mystery' ? NaN : r0.f, r0.Tc, r0.d / 2);
  an.src = r0.src; an.fTrue = r0.f; an.d = r0.d; an.nReadings = recs.length;
  an.noisy = recs.every(r => r.noisy);
  an.perCluster = an.clusters.map(q => q.values.length);
  return an;
}
function allGroups() {
  const keys = [];
  st.records.forEach(r => { if (keys.indexOf(r.key) < 0) keys.push(r.key); });
  return keys.map(groupAnalysis);
}
function lambdaFreqFit() {
  const pts = allGroups().filter(a => a && a.src !== 'mystery' && a.count >= 2 && a.consistent && a.T === st.Tc);
  const fs = new Set(pts.map(a => a.fTrue));
  const v = pts.length ? C.fitThroughOrigin(pts.map(a => 1 / a.fTrue), pts.map(a => a.lambda)) : NaN;
  return { nF: fs.size, v, errPct: (v - C.speedOfSound(st.Tc)) / C.speedOfSound(st.Tc) * 100 };
}
function emitAnalysis() {
  const an = groupAnalysis(key());
  const groups = allGroups().filter(Boolean).map(a => ({ src: a.src, f: a.fTrue, Tc: a.T, d: a.d, count: a.count, ns: a.ns.slice(), consistent: a.consistent,
    v: a.v, errPct: a.errPct, e: a.e, eTheory: a.eTheory, lambda: a.lambda, noisy: a.noisy, perCluster: a.perCluster.slice(), nReadings: a.nReadings }));
  const fit = lambdaFreqFit();
  const data = {
    src: st.src, f: st.f, Tc: st.Tc, d: st.d,
    count: an ? an.count : 0, ns: an ? an.ns.slice() : [], means: an ? an.means.slice() : [], consistent: !!(an && an.consistent),
    nReadings: an ? an.nReadings : 0, perCluster: an ? an.perCluster.slice() : [], noisy: !!(an && an.noisy),
    v: an ? an.v : NaN, errPct: an ? an.errPct : NaN, e: an ? an.e : NaN, eTheory: C.endCorrection(st.d / 2), lambda: an ? an.lambda : NaN,
    vNaive: an ? an.vNaive : NaN, errNaivePct: an ? an.errNaivePct : NaN,
    groups, fitForks: fit.nF, fitV: fit.v, fitErrPct: fit.errPct,
    records: st.records.map(r => ({ src: r.src, f: r.f, Tc: r.Tc, d: r.d, Lread: r.Lread, Ltrue: r.Ltrue, below: r.below, n: r.n }))
  };
  emit('analysis', data);
  return data;
}
function record() {
  const Lread = st.noisy ? C.roundMm(st.L + 0.001 * gauss()) : C.roundMm(st.L);
  const near = C.nearestResonance(st.L, st.f, st.Tc, st.d / 2);
  const rec = { src: st.src, f: st.f, Tc: st.Tc, d: st.d, key: key(), Lread, Ltrue: st.L, db: near.db, below: near.below, n: near.n, noisy: st.noisy };
  st.records.push(rec);
  const an = groupAnalysis(rec.key);
  emit('record', Object.assign({}, rec, { count: st.records.length, clusters: an ? an.count : 0 }));
  return emitAnalysis();
}
function guess(fG) {
  const an = groupAnalysis(key());
  const err = (fG - st.f) / st.f * 100;
  emit('guess', { fTrue: st.f, fGuess: fG, errPct: err, clusters: an ? an.count : 0, consistent: !!(an && an.consistent), Tc: st.Tc });
  return err;
}
/** 學生的做法：在預期位置附近 ±2 cm 一格 1 mm 掃描，停在響度最大處 */
function findPeak(n) {
  const lam = C.wavelength(C.speedOfSound(st.Tc), st.f);
  const guessL = (2 * n - 1) * lam / 4 - C.endCorrection(st.d / 2);
  let best = -Infinity, bestL = NaN;
  for (let mm = Math.round((guessL - 0.02) * 1000); mm <= Math.round((guessL + 0.02) * 1000); mm++) {
    const L = mm / 1000;
    if (L < C.L_MIN || L > C.L_MAX) continue;
    const g = C.gain(L, st.f, st.Tc, st.d / 2);
    if (g > best) { best = g; bestL = L; }
  }
  return bestL;
}
function measure(ns, reps) { let a; ns.forEach(n => { setL(findPeak(n)); for (let i = 0; i < (reps || 1); i++) a = record(); }); return a; }
const log = t => console.log(t);
const pct = x => (x >= 0 ? '+' : '') + x.toFixed(3) + ' %';

// ---------- 預設狀態不會誤觸 ----------
fresh();
log('預設狀態：L = 40 cm 敲音叉、直接記錄（不在共鳴點）');
strike(); setL(0.40); record(); setL(0.401); record();
if (done.size) { console.log('  錯誤：預設操作就完成了任務', [...done].join(', ')); process.exitCode = 1; }

// ---------- 逐一證明 ----------
fresh(); strike();
log('1：512 Hz、25 °C、內徑 3 cm，水面移到第一共鳴（掃描找最大）'); setL(findPeak(1));
log('2–7：記錄第 1、2、3 個共鳴點');
let a = measure([1, 2]);
log('   v = ' + a.v.toFixed(2) + ' m/s，誤差 ' + pct(a.errPct) + '，e = ' + (a.e * 100).toFixed(2) + ' cm（理論 ' + (a.eTheory * 100).toFixed(2) + ' cm）');
a = measure([3]);
log('   三點：v = ' + a.v.toFixed(2) + ' m/s，誤差 ' + pct(a.errPct));

fresh(); strike();
log('8：同一支 512 Hz，10 °C 與 30 °C 各量兩點');
st.Tc = 10; a = measure([1, 2]); log('   10 °C：誤差 ' + pct(a.errPct) + '，L1 = ' + (findPeak(1) * 100).toFixed(1) + ' cm');
st.Tc = 30; a = measure([1, 2]); log('   30 °C：誤差 ' + pct(a.errPct) + '，L1 = ' + (findPeak(1) * 100).toFixed(1) + ' cm（往下移）');

fresh(); strike();
log('9：25 °C 用 384、512、768 Hz 各量兩點，λ–1/f 斜率');
[384, 512, 768].forEach(f => { st.f = f; a = measure([1, 2]); });
log('   λ–1/f：' + a.fitForks + ' 支，v = ' + a.fitV.toFixed(2) + ' m/s，誤差 ' + pct(a.fitErrPct));

fresh(); strike();
log('10：神秘音叉（以 300–900 Hz 中的 357.3、653.3、891.7 Hz 為例），量兩點 → f = v/λ（v 用室溫理論值）');
[357.3, 653.3, 891.7].forEach(f => {
  fresh(); strike(); st.src = 'mystery'; st.f = f;
  const lamP = C.wavelength(C.speedOfSound(st.Tc), f);
  // 學生不知道 f：先把水面由管口往下掃，找到第一、第二個響度最大處
  const n2 = 2;
  setL(findPeak(1)); record(); setL(findPeak(n2)); record();
  const an = groupAnalysis(key());
  const fG = Math.round(C.speedOfSound(st.Tc) / an.lambda * 10) / 10;
  const err = guess(fG);
  log('   f = ' + f + ' Hz：λ = ' + (an.lambda * 100).toFixed(2) + ' cm（真 ' + (lamP * 100).toFixed(2) + '），推算 ' + fG + ' Hz，誤差 ' + pct(err));
});

fresh(); strike();
log('11：512 Hz、25 °C，內徑 1.6 cm 與 4.0 cm 各量兩點');
[0.016, 0.04].forEach(d => { st.d = d; a = measure([1, 2]); const g = a.groups.find(x => x.d === d); log('   d = ' + d * 100 + ' cm：e = ' + (g.e * 100).toFixed(2) + ' cm，理論 ' + (g.eTheory * 100).toFixed(2) + ' cm'); });

fresh(); strike(); st.noisy = true;
log('12：含誤差，512 Hz 三個共鳴點、每點量 3 次');
a = measure([1, 2, 3], 3);
log('   v = ' + a.v.toFixed(2) + ' m/s，誤差 ' + pct(a.errPct) + '，每點 ' + a.perCluster.join('/') + ' 次');
// 成功率（蒙地卡羅）：同樣的做法重複 2000 次
{
  quiet = true;
  let ok2 = 0, ok3 = 0;
  for (let t = 0; t < 2000; t++) {
    fresh(); st.noisy = true; st.sounding = true;
    const d2 = measure([1, 2], 3);
    if (Math.abs(d2.errPct) <= 0.3) ok2++;
    fresh(); st.noisy = true; st.sounding = true;
    const d3 = measure([1, 2, 3], 3);
    if (Math.abs(d3.errPct) <= 0.3) ok3++;
  }
  quiet = false;
  log('   成功率：兩點各 3 次 ' + (ok2 / 20).toFixed(1) + ' %，三點各 3 次 ' + (ok3 / 20).toFixed(1) + ' %');
}

fresh(); strike();
log('h1：440 Hz 的第 3 個共鳴（水面放到 90 cm 以下）');
st.f = 440; setL(findPeak(3)); log('   L3 = ' + (st.L * 100).toFixed(1) + ' cm'); record();

fresh(); strike();
log('h2：室溫 0 °C，512 Hz 量兩點');
st.Tc = 0; a = measure([1, 2]); log('   誤差 ' + pct(a.errPct));

fresh(); strike();
log('h3：25 °C、內徑 3 cm：384 Hz 的第 2 共鳴與 640 Hz 的第 3 共鳴在同一處');
st.f = 384; setL(findPeak(2)); const L384 = st.L; record();
st.f = 640; setL(findPeak(3)); log('   ' + (L384 * 100).toFixed(1) + ' cm 與 ' + (st.L * 100).toFixed(1) + ' cm'); record();

const miss = defs.filter(m => !done.has(m.id)).map(m => m.id);
log('全部 ' + defs.length + ' 個任務，完成 ' + done.size + (miss.length ? '；未完成：' + miss.join(', ') : '。'));
if (miss.length) process.exitCode = 1;
