/* 任務可達成的證明腳本。用法：node tools/mission-proofs/hess-law.js
 * 用化學核心模擬頁面（js/hess-law.js）的操作與事件：每一幀 1/60 秒、依時間倍率前進，模擬時間每 2 秒記錄一個讀數，
 * 每 0.5 秒送一次 'tick'；「分析」卡按「計算」送 'analyze' 或 'calib'（擬合範圍用頁面的預設：最高點後 30 s 起、長 240 s）。
 * 確認每個任務都做得到、預設狀態不會觸發任務，並量出照建議做法要花多少真實時間。修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const H = require(__ROOT + 'js/hess-law-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/hess-law.js');

const SPEEDS = [1, 5, 20, 60];
const T_MAX = 3600, DT_REC = 2;
let bad = 0;
const done = {};
function freshMissions() { missions.forEach(m => { m.done = false; }); }

// ---------- 模擬頁面（與 js/hess-law.js 的 newRun／advance／tickData／calc 一致） ----------
function newPage() { return { speed: 1, rec: false, acted: true, events: [], wall: 0, results: [], seg: 0, unk: null }; }
function setup(P, o) {
  P.o = Object.assign({ Troom: 25, lid: true, stir: true }, o);
  P.run = H.createRun(P.o);
  P.rows = [[0, H.reading(P.run)]];
  P.nextRec = DT_REC; P.peak = 0; P.rec = false;
}
function advance(P, dt) {
  const run = P.run, target = Math.min(T_MAX, run.t + dt);
  while (run.t < target - 1e-9) {
    const nx = Math.min(target, P.nextRec);
    H.step(run, nx - run.t);
    if (run.t >= P.nextRec - 1e-9) {
      P.rows.push([P.nextRec, H.reading(run)]); P.nextRec += DT_REC;
      if (run.added) P.peak = Math.max(P.peak, Math.abs(H.reading(run) - run.Troom));
    }
  }
  if (run.t >= T_MAX - 1e-9) P.rec = false;
}
function tick(P) {
  const run = P.run, A = run.added ? H.analyze(P.rows, run.tAdd, 0, 0) : null, T0 = A ? A.T0 : run.Troom, r = H.reading(run);
  return { mode: run.mode, kind: run.mode === 'solid' ? run.solid.kind : null, liquid: run.mode === 'solid' ? run.liquid.kind : null,
    added: run.added, recording: P.rec, T0, reading: r, dT: r - T0, Troom: run.Troom, peak: P.peak, t: run.t, tAdd: run.tAdd };
}
function emit(P, type, data) {
  if (!P.acted) return;
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev)) { m.done = true; P.events.push(m.id); } });
}
/** 跑 sec 秒的真實時間；until(P) 為真就提早停 */
function wait(P, sec, until) {
  const frames = Math.round(sec * 60);
  for (let k = 0; k < frames; k++) {
    if (P.rec) advance(P, SPEEDS[P.speed] / 60);
    P.wall += 1 / 60;
    if (k % 30 === 29) emit(P, 'tick', tick(P));
    if (until && until(P)) { emit(P, 'tick', tick(P)); return P.wall; }
  }
  emit(P, 'tick', tick(P));
  return P.wall;
}
/** 記錄到模擬時間 t */
function until(P, t) { P.rec = true; return wait(P, 7200, Q => Q.run.t >= t - 1e-9 || !Q.rec); }
function add(P) { H.add(P.run); P.rec = true; }
/** 頁面的預設擬合範圍 */
function autoFit(P) {
  const A = H.analyze(P.rows, P.run.tAdd, 0, 0), lt = P.rows[P.rows.length - 1][0];
  const ta = Math.min(lt, Math.ceil((A.tExt + 30) / 2) * 2);
  return [ta, Math.min(lt, ta + 240)];
}
function kindOf(run) {
  if (run.mode === 'mix') return 'neut';
  if (run.mode === 'cal') return 'cal';
  if (!H.reference(run)) return 'other';
  if (run.liquid.kind === 'HCl' && run.base) return 'r3';
  return 'dis-' + run.solid.kind;
}
function hessNow(P) {
  const last = k => { for (let i = P.results.length - 1; i >= 0; i--) { const r = P.results[i]; if (r.seg === P.seg && r.kind === k) return r; } return null; };
  const a = last('dis-NaOH'), b = last('neut'), c = last('r3');
  return { h1: a ? a.dH : null, h2: b ? b.dH : null, h3: c ? c.dH : null, e1: a ? a.err : null, e2: b ? b.err : null, e3: c ? c.err : null };
}
/** 「計算」：meth 'ext'／'raw'；C、n 是學生填的；fit 不給就用預設擬合範圍 */
function calc(P, meth, C, n, fit) {
  const run = P.run, f = fit || autoFit(P);
  const A = H.analyze(P.rows, run.tAdd, f[0], f[1]);
  const ok = A.fit && A.fit.n >= 5 && f[1] - f[0] >= 10;
  const dT = meth === 'ext' ? (ok ? A.dText : null) : A.dTraw;
  if (dT == null) throw new Error('擬合範圍的點太少');
  if (run.mode === 'cal') {
    const Cc = H.calibC(run.cal.Vc, run.cal.Vh, run.cal.Th, A.T0, A.T0 + dT);
    emit(P, 'calib', { C: Cc, err: Cc - H.C_CAL, method: meth });
    return { C: Cc, dT };
  }
  const dH = H.dHfrom(H.finalMass(run), C, dT, n), ref = H.reference(run), k = kindOf(run);
  const err = ref ? dH / ref.dH - 1 : null;
  P.results.push({ seg: P.seg, kind: k, dH, err });
  emit(P, 'analyze', { kind: k, method: meth, dH, ref: ref ? ref.dH : null, err, lid: run.lid, stir: run.stir,
    excess: run.mode === 'mix' ? Math.max(run.nb, run.na) / Math.min(run.nb, run.na) : null, revealed: !!(P.unk && P.unk.revealed),
    dTraw: A.dTraw, dText: ok ? A.dText : null, C, n, hess: hessNow(P) });
  return { dH, err, dT, dTraw: A.dTraw, dText: ok ? A.dText : null };
}
function report(name, P, ids) {
  const ok = ids.every(id => P.events.includes(id));
  ids.forEach(id => { if (P.events.includes(id)) done[id] = true; });
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + name + '：' + (P.events.length ? P.events.join('、') : '（沒有任務）'));
  if (!ok) bad++;
}
const pc = x => (x * 100).toFixed(2) + '%';
const sig3 = x => +x.toPrecision(3);
/** 一次完整的實驗：記錄 30 s、加入、記錄到加入後 after 秒（×speed） */
function experiment(P, o, after, speed) {
  setup(P, o); P.speed = speed == null ? 2 : speed;
  until(P, 30); add(P);
  return until(P, 30 + (after || 300));
}

// ---------- 0. 預設狀態不觸發任務 ----------
freshMissions();
let P = newPage();
setup(P, { mode: 'solid', solid: { kind: 'NaOH', mass: 2 }, liquid: { kind: 'water', V: 100, c: 1 } });
P.rec = true; wait(P, 30);
['mix', 'cal'].forEach(m => { setup(P, m === 'mix' ? { mode: 'mix', mix: { cb: 1, Vb: 50, ca: 1, Va: 50 } } : { mode: 'cal', cal: { Vc: 50, Vh: 50, Th: 60 } }); P.rec = true; wait(P, 10); });
if (P.events.length) { console.log('  ✗ 預設狀態觸發了任務：' + P.events.join('、')); bad++; }
else console.log('  ✓ 三種實驗的預設設定只記錄、不加入，不觸發任務');

// ---------- 1. 同一段實驗：校正 → 溶解 → 中和 → 一步反應（赫斯定律） ----------
freshMissions();
P = newPage();
let w0 = P.wall;
experiment(P, { mode: 'cal', cal: { Vc: 50, Vh: 50, Th: 60 } }, 300);
const cal = calc(P, 'ext');
const Cst = +cal.C.toFixed(1);
report('卡計校正（冷水 50 mL、60 °C 熱水 50 mL，外插）：C = ' + cal.C.toFixed(2) + ' J/K', P, ['hess-law-4']);

experiment(P, { mode: 'solid', solid: { kind: 'NaOH', mass: 2 }, liquid: { kind: 'water', V: 100 } }, 300);
let r = calc(P, 'ext', Cst, sig3(2 / 39.997));
report('NaOH 2.00 g 溶於 100 mL 水、外插、C = ' + Cst + '、n = 0.0500：ΔH = ' + r.dH.toFixed(2) + '（誤差 ' + pc(r.err) + '）', P, ['hess-law-1', 'hess-law-6']);

experiment(P, { mode: 'mix', mix: { cb: 1, Vb: 50, ca: 1, Va: 50 } }, 300);
r = calc(P, 'ext', Cst, 0.0500);
report('中和 1 M 50 mL + 1 M 50 mL、外插：ΔH = ' + r.dH.toFixed(2) + '（誤差 ' + pc(r.err) + '）', P, ['hess-law-3', 'hess-law-5', 'hess-law-12']);

experiment(P, { mode: 'solid', solid: { kind: 'NaOH', mass: 2 }, liquid: { kind: 'HCl', V: 100, c: 1 } }, 300);
r = calc(P, 'ext', Cst, 0.0500);
const hs = hessNow(P);
report('NaOH 2.00 g 加入 1 M HCl 100 mL：ΔH = ' + r.dH.toFixed(2) + '（誤差 ' + pc(r.err) + '）；ΔH1 + ΔH2 = ' + (hs.h1 + hs.h2).toFixed(2) + '、ΔH3 = ' + hs.h3.toFixed(2) +
  '（真實時間 ' + (P.wall - w0).toFixed(0) + ' s，×20）', P, ['hess-law-8', 'hess-law-9']);

// 不加卡計（C = 0）、只看最高溫度時的誤差（給學生看的對照）
freshMissions();
P = newPage();
experiment(P, { mode: 'mix', mix: { cb: 1, Vb: 50, ca: 1, Va: 50 } }, 300);
const a0 = calc(P, 'raw', 0, 0.05), a1 = calc(P, 'ext', 0, 0.05);
console.log('    （對照：中和、C = 0：最高溫度法誤差 ' + pc(a0.err) + '、外插 ' + pc(a1.err) + '）');
P = newPage();
experiment(P, { mode: 'solid', solid: { kind: 'NaOH', mass: 2 }, liquid: { kind: 'water', V: 100 } }, 300);
const b0 = calc(P, 'raw', 18, 0.05);
console.log('    （對照：溶解、C = 18、最高溫度法：誤差 ' + pc(b0.err) + '）');
// 赫斯：值不一致時（溶解熱用最高溫度法）不算
freshMissions();
P = newPage();
experiment(P, { mode: 'solid', solid: { kind: 'NaOH', mass: 2 }, liquid: { kind: 'water', V: 100 }, lid: false, stir: false }, 300);
calc(P, 'raw', 0, 0.05);
experiment(P, { mode: 'mix', mix: { cb: 1, Vb: 50, ca: 1, Va: 50 } }, 300); calc(P, 'ext', 18, 0.05);
experiment(P, { mode: 'solid', solid: { kind: 'NaOH', mass: 2 }, liquid: { kind: 'HCl', V: 100, c: 1 } }, 300); calc(P, 'ext', 18, 0.05);
if (P.events.includes('hess-law-9')) { console.log('  ✗ 溶解熱誤差太大時不該完成任務 9'); bad++; } else console.log('  ✓ 溶解熱沒蓋沒攪、C = 0、最高溫度法（誤差 ' + pc(hessNow(P).e1) + '）時不算任務 9');
// 鹽酸不足：沒有參考值
freshMissions();
P = newPage();
experiment(P, { mode: 'solid', solid: { kind: 'NaOH', mass: 4 }, liquid: { kind: 'HCl', V: 50, c: 1 } }, 300);
r = calc(P, 'ext', 18, 0.1);
if (P.events.includes('hess-law-8') || r.err !== null) { console.log('  ✗ HCl 不足時不該有參考值'); bad++; } else console.log('  ✓ NaOH 4 g 加入 0.050 mol HCl：沒有單一參考值，不算任務 8');

// ---------- 2. 外插找回散失的熱 ----------
freshMissions();
P = newPage();
experiment(P, { mode: 'solid', solid: { kind: 'NaOH', mass: 2 }, liquid: { kind: 'water', V: 100 }, lid: false, stir: false }, 600);
r = calc(P, 'ext', 18, 0.05);
report('NaOH 2 g、不蓋、不攪拌：最高讀數 ΔT = ' + r.dTraw.toFixed(2) + '、外插 ΔT = ' + r.dText.toFixed(3) + '（比值 ' + (r.dText / r.dTraw).toFixed(3) + '，ΔH 誤差 ' + pc(r.err) + '）', P, ['hess-law-7']);

// ---------- 3. 吸熱 ----------
freshMissions();
P = newPage();
experiment(P, { mode: 'solid', solid: { kind: 'NH4NO3', mass: 5 }, liquid: { kind: 'water', V: 100 } }, 300);
r = calc(P, 'ext', 18, sig3(5 / 80.043));
report('NH4NO3 5.00 g 溶於 100 mL 水：ΔT = ' + r.dT.toFixed(2) + '、ΔH = ' + r.dH.toFixed(2) + '（誤差 ' + pc(r.err) + '）', P, ['hess-law-2']);

// ---------- 4. 限量試劑 ----------
freshMissions();
P = newPage();
experiment(P, { mode: 'mix', mix: { cb: 1, Vb: 50, ca: 1, Va: 75 } }, 300);
r = calc(P, 'ext', 18, 0.0500);
report('NaOH 1 M 50 mL + HCl 1 M 75 mL（1.5 倍）、n = 0.0500：ΔH = ' + r.dH.toFixed(2) + '（誤差 ' + pc(r.err) + '）', P, ['hess-law-10']);
freshMissions();
P = newPage();
experiment(P, { mode: 'mix', mix: { cb: 1, Vb: 50, ca: 1, Va: 75 } }, 300);
r = calc(P, 'ext', 18, 0.0750);
if (P.events.includes('hess-law-10')) { console.log('  ✗ n 用過量的 HCl 不該完成任務 10'); bad++; } else console.log('  ✓ n 誤用過量試劑 0.0750 mol（誤差 ' + pc(r.err) + '）不算任務 10');

// ---------- 5. 未知固體（200 個） ----------
let rs = 11;
const rng = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
let ok11 = 0, worst = 0, firstOk = 0;
const N = 200;
for (let k = 0; k < N; k++) {
  freshMissions();
  P = newPage();
  const u = H.newUnknown(rng);
  P.unk = { revealed: false };
  // 學生的做法：先用 5 g 溶於 100 mL 水；溫差小於 3 °C 就改用 8 g 溶於 50 mL 水再做一次
  experiment(P, { mode: 'solid', solid: { kind: 'X', mass: 5 }, liquid: { kind: 'water', V: 100 } }, 300);
  r = calc(P, 'ext', 18, sig3(5 / u.M));
  if (Math.abs(r.err) <= 0.03) firstOk++;
  if (Math.abs(r.dT) < 3) {
    experiment(P, { mode: 'solid', solid: { kind: 'X', mass: 8 }, liquid: { kind: 'water', V: 50 } }, 300);
    r = calc(P, 'ext', 18, sig3(8 / u.M));
  }
  worst = Math.max(worst, Math.abs(r.err));
  if (P.events.includes('hess-law-11')) ok11++;
}
console.log('  ' + (ok11 === N ? '✓' : '✗') + ' 未知固體 ' + N + ' 個：照做法都在 3% 以內的有 ' + ok11 + ' 個（第一次 5 g 就成功 ' + firstOk + ' 個；最差誤差 ' + pc(worst) + '）');
if (ok11 === N) done['hess-law-11'] = true; else bad++;
// 揭曉後不算
freshMissions();
P = newPage(); H.newUnknown(rng); P.unk = { revealed: true };
experiment(P, { mode: 'solid', solid: { kind: 'X', mass: 8 }, liquid: { kind: 'water', V: 50 } }, 300);
calc(P, 'ext', 18, sig3(8 / H.SOLIDS.X.M));
if (P.events.includes('hess-law-11')) { console.log('  ✗ 揭曉後不該完成任務 11'); bad++; } else console.log('  ✓ 揭曉答案後再量不算任務 11');

// ---------- 6. 隱藏任務 ----------
freshMissions();
P = newPage();
experiment(P, { mode: 'solid', solid: { kind: 'NH4NO3', mass: 8 }, liquid: { kind: 'water', V: 50 }, Troom: 15 }, 120);
report('室溫 15 °C、NH4NO3 8 g 溶於 50 mL 水：最低讀數 ' + Math.min.apply(null, P.rows.map(x => x[1])).toFixed(1) + ' °C', P, ['hess-law-h1']);

freshMissions();
P = newPage();
experiment(P, { mode: 'solid', solid: { kind: 'NaOH', mass: 8 }, liquid: { kind: 'HCl', V: 50, c: 2 }, Troom: 30 }, 120);
report('室溫 30 °C、NaOH 8 g 加入 2 M HCl 50 mL：最高讀數 ' + Math.max.apply(null, P.rows.map(x => x[1])).toFixed(1) + ' °C', P, ['hess-law-h2']);
// 熱水校正不算
freshMissions();
P = newPage();
experiment(P, { mode: 'cal', cal: { Vc: 25, Vh: 100, Th: 80 } }, 60);
if (P.events.includes('hess-law-h2')) { console.log('  ✗ 熱水校正不該完成隱藏任務 2'); bad++; } else console.log('  ✓ 卡計校正（80 °C 熱水）不算隱藏任務 2');

freshMissions();
P = newPage();
setup(P, { mode: 'solid', solid: { kind: 'NaOH', mass: 4 }, liquid: { kind: 'water', V: 100 }, lid: false }); P.speed = 3;
until(P, 10); add(P);
w0 = P.wall;
let w = wait(P, 120, Q => Q.events.includes('hess-law-h3') || !Q.rec);
report('NaOH 4 g、不蓋杯蓋、×60 一直記錄到回到室溫：峰值 ' + P.peak.toFixed(1) + ' °C、t = ' + P.run.t.toFixed(0) + ' s（真實時間 ' + (w - w0).toFixed(0) + ' s）', P, ['hess-law-h3']);

// ---------- 總結 ----------
const missing = missions.filter(m => !done[m.id]).map(m => m.id);
console.log(missing.length ? '  ✗ 沒有證明到的任務：' + missing.join('、') : '  ✓ ' + missions.length + ' 個任務都證明做得到');
if (missing.length) bad++;
const stars = missions.reduce((a, m) => a + (m.hidden ? m.level * 2 : m.level), 0);
console.log('    （公開 ' + missions.filter(m => !m.hidden).reduce((a, m) => a + m.level, 0) + ' 顆星、隱藏 ' + missions.filter(m => m.hidden).reduce((a, m) => a + m.level * 2, 0) + ' 顆星，共 ' + stars + ' 顆）');
if (bad) { console.log('失敗 ' + bad + ' 項'); process.exitCode = 1; }
