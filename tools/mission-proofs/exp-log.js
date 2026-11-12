/* 任務可達成的證明腳本。用法：node tools/mission-proofs/exp-log.js
 * 用數學核心證明每個任務在滑桿範圍與精度內做得到（事件格式與 js/exp-log.js 的 emitNow 相同），並確認預設狀態不會觸發任務。
 * 滑桿：年利率 0–100（點數字可打到 0.01）、年 1–30（0.01）、n 1 到 10^6（整數，可打字）；
 *       底數 a 0.05–5（打到 0.0001）、x −3 到 3（打到 0.001）；C 0.1–1000（打到 0.001）、b 0.2–4（打到 0.001）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const EL = require(ROOT + 'js/exp-log-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/exp-log.js');
const byId = id => missions.find(m => m.id === 'exp-log-' + id);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;

const roundTo = (v, dec) => Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec);
function cEv(r, n, t, cont) {
  const R = r / 100, An = EL.compound(R, n, t), Ae = EL.cont(R, t);
  return { type: 'compound', data: { r: r, n: n, t: t, cont: !!cont, A: cont ? Ae : An, An: An, Ae: Ae } };
}
function iEv(a, x) {
  const y = Math.pow(a, x);
  return { type: 'inverse', data: { a: a, x: x, y: y, meets: EL.meet(a).pts.length, meetX: EL.meet(a).pts.map(p => p[0]), meetY: EL.meet(a).pts.map(p => p[1]), tangent: Math.abs(a - EL.E_1E) <= 0.0005, ln: Math.log(a) } };
}
function sEv(set, C, b) {
  const d = EL.DATASETS[set];
  return { type: 'semilog', data: { set: set, C: C, b: b, rms: d ? EL.rmsLog(d.xs, d.ys, C, b) : null, chal: false } };
}

let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { ok = ok || !!m.check(e, m.mem); });
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}

// ---------- 預設狀態不觸發 ----------
{
  const defs = [cEv(10, 1, 10, false), cEv(10, 1, 10, true), iEv(2, 1), sEv('bacteria', 10, 2), sEv('decay', 10, 2), sEv('free', 10, 2),
    { type: 'play', data: { n: 1, t: 1, r: 10, cont: false } }];
  // 快速按鈕：每季、每月（每天是任務 1 本身）；底數 1/2、2、e、10
  defs.push(cEv(10, 4, 10), cEv(10, 12, 10));
  [0.5, 2, 10].forEach(a => defs.push(iEv(a, 1)));
  const hit = missions.filter(m => !['exp-log-6'].includes(m.id)).filter(m => { m.mem = {}; return defs.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態、快速按鈕（每季、每月、底數 1/2、2、10）、播放 1 年，都不觸發任務');
}

// ---------- 一般任務 ----------
expect(1, [cEv(10, 365, 10)], true, '按「每天」：n = 365');
expect(1, [cEv(10, 365, 10, true)], false, '勾連續複利不算');
{
  // 只靠增加 n：找最小的整數 n
  let n = 1; while (Math.E - EL.compound(1, n, 1) > 1e-4) n++;
  expect(2, [cEv(100, n, 1)], true, 'r = 100%、t = 1、n = ' + n + '（最少的次數），總額 ' + EL.compound(1, n, 1).toFixed(6));
  expect(2, [cEv(100, n - 1, 1)], false, 'n = ' + (n - 1) + ' 還差一點');
  expect(2, [cEv(100, 1e6, 1, true)], false, '勾連續複利不算');
  // 對數滑桿上的位置（間隔 0.5）也拉得到
  let p = 0; while (Math.E - EL.compound(1, EL.nFromPos(p), 1) > 1e-4) p += 0.5;
  console.log('       （滑桿位置 ' + p + '，n = ' + EL.nFromPos(p) + '）');
}
{
  const r = roundTo(100 * (Math.pow(2, 0.1) - 1), 2);
  expect(3, [cEv(r, 1, 10)], true, '年利率打 ' + r + '%，總額 ' + EL.compound(r / 100, 1, 10).toFixed(5));
  expect(3, [cEv(7, 1, 10)], false, '滑桿上的 7% 不夠（' + EL.compound(0.07, 1, 10).toFixed(4) + '）');
  expect(3, [cEv(r, 4, 10)], false, '每季複利不算');
}
expect(4, [{ type: 'play', data: { n: 12, t: 10, r: 10, cont: false } }], true, '每月、10 年，播放完');
expect(4, [{ type: 'play', data: { n: 365, t: 10, r: 10, cont: false } }], false, '每天複利不算');
{
  const x = roundTo(Math.log2(5), 3);
  expect(5, [iEv(2, x)], true, 'a = 2、x 打 ' + x + '，2 的 x 次方 = ' + Math.pow(2, x).toFixed(5));
  // 滑桿間隔 0.01 也做得到
  const xs = roundTo(Math.log2(5), 2);
  expect(5, [iEv(2, xs)], true, '滑桿 x = ' + xs + '，' + Math.pow(2, xs).toFixed(4));
}
expect(6, [iEv(2.72, 1)], true, '底數 2.72（滑桿），ln a = ' + Math.log(2.72).toFixed(5));
expect(6, [iEv(roundTo(Math.E, 4), 1)], true, '按 e 的快速按鈕：2.7183');
expect(6, [iEv(2.7, 1)], false, '2.70 不夠（ln a = ' + Math.log(2.7).toFixed(4) + '）');
expect(7, [iEv(0.5, -2)], true, 'a = 1/2、x = −2：(1/2) 的 −2 次方 = 4');
expect(7, [iEv(2, 2)], false, '2 的 2 次方 = 4 不算（底數要小於 1）');
expect(8, [iEv(1.44, 0)], false, '滑桿上的 1.44 差 ' + (EL.E_1E - 1.44).toFixed(5));
expect(8, [iEv(1.45, 0)], false, '1.45 差 ' + (1.45 - EL.E_1E).toFixed(5));
expect(8, [iEv(1.4447, 0)], true, '打 1.4447（差 ' + Math.abs(1.4447 - EL.E_1E).toFixed(6) + '）');
expect(8, [iEv(1.4445, 0)], true, '打 1.4445 也算（差 ' + Math.abs(1.4445 - EL.E_1E).toFixed(6) + '）');
/** 在滑桿格點附近找最佳的 C、b：C 打到 0.001（三位小數）、b 打到 0.001；也試純滑桿格點（C 位置 0.1、b 0.01） */
function bestOnGrid(set, typed) {
  const d = EL.DATASETS[set], f = EL.fitLog(d.xs, d.ys);
  let best = null;
  const cands = [];
  if (typed) {
    const C = roundTo(f.C, 3), b = roundTo(f.b, 3);
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) cands.push([roundTo(C + i * 0.001, 3), roundTo(b + j * 0.001, 3)]);
  } else {
    const p = Math.round(EL.posFromC(f.C) * 10) / 10, b = roundTo(f.b, 2);
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) cands.push([EL.cFromPos(p + i * 0.1), roundTo(b + j * 0.01, 2)]);
  }
  cands.forEach(c => { const v = EL.rmsLog(d.xs, d.ys, c[0], c[1]); if (!best || v < best.rms) best = { C: c[0], b: c[1], rms: v }; });
  return { fit: f, best: best };
}
{
  const g = bestOnGrid('bacteria', false);
  expect(9, [sEv('bacteria', g.best.C, g.best.b)], true, '細菌：純滑桿 C = ' + g.best.C.toFixed(2) + '、b = ' + g.best.b + '，誤差 ' + g.best.rms.toFixed(4) + '（最佳擬合 ' + g.fit.rms.toFixed(4) + '）');
  expect(9, [sEv('bacteria', 50, 4)], true, '照真實的模型 C = 50、b = 4，誤差 ' + EL.rmsLog(EL.DATASETS.bacteria.xs, EL.DATASETS.bacteria.ys, 50, 4).toFixed(4));
  expect(9, [sEv('decay', g.best.C, g.best.b)], false, '換成衰變資料不算');
}
{
  const g = bestOnGrid('decay', false), t = bestOnGrid('decay', true);
  expect(10, [sEv('decay', g.best.C, g.best.b)], false, '衰變：純滑桿（間隔 0.01）不夠細 C = ' + g.best.C.toFixed(1) + '、b = ' + g.best.b + '，誤差 ' + g.best.rms.toFixed(4) + '（最佳擬合 ' + g.fit.rms.toFixed(4) + '）');
  expect(10, [sEv('decay', t.best.C, t.best.b)], true, '打字 C = ' + t.best.C + '、b = ' + t.best.b + '，誤差 ' + t.best.rms.toFixed(4));
  expect(10, [sEv('decay', 1000, 0.9)], false, 'C = 1000、b = 0.9 太粗（誤差 ' + EL.rmsLog(EL.DATASETS.decay.xs, EL.DATASETS.decay.ys, 1000, 0.9).toFixed(3) + '）');
}
expect(11, [{ type: 'challenge', data: { time: 40, streak: 1, last3: null, rms: 0.01 } }], true, '對準一題（每題都做得到：見單元測試的 2000 題）');
expect(12, [{ type: 'challenge', data: { time: 25, streak: 3, last3: 80, rms: 0.01 } }], true, '連續三題共 80 秒');
expect(12, [{ type: 'challenge', data: { time: 40, streak: 3, last3: 120, rms: 0.01 } }], false, '三題共 120 秒太慢');

// ---------- 隱藏任務 ----------
{ const p = EL.meet(0.05).pts; console.log('       （a = 0.05 的交點 x：' + p.map(q => q[0].toFixed(4)).join('、') + '）');
  expect('h1', [iEv(0.05, 0.14)], true, '底數 0.05（滑桿最小值）、P 的 x = 0.14（滑桿格點）：在交點 (' + p[0][0].toFixed(3) + ', ' + p[0][1].toFixed(3) + ') 上');
  expect('h1', [iEv(0.05, 0.66)], true, 'x = 0.66：另一個交點');
  expect('h1', [iEv(0.05, 0), iEv(0.05, 1), iEv(0.05, 0.35)], false, '只把底數拉到最小、或 P 停在 y = x 上的交點不算'); }
expect('h1', [iEv(0.07, 0)], false, '0.07 只有 ' + EL.meet(0.07).pts.length + ' 個');
expect('h2', [iEv(1, 0)], true, '底數 1');
expect('h3', [iEv(1.4447, 2.718)], true, 'a = 1.4447、x = 2.718：P = (2.718, ' + Math.pow(1.4447, 2.718).toFixed(4) + ') 在 y = x 上');
expect('h3', [iEv(1.4447, 1)], false, 'x = 1 不在切點');

// ---------- 星星總數 ----------
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const sp = pub.reduce((s, m) => s + starsOf(m), 0), sh = hid.reduce((s, m) => s + starsOf(m), 0);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('  ✗ 隱藏任務超過 20 顆'); }
console.log('\n公開 ' + pub.length + ' 個 ' + sp + ' 顆、隱藏 ' + hid.length + ' 個 ' + sh + ' 顆，共 ' + (sp + sh) + ' 顆。');
console.log(fail ? fail + ' 項失敗' : '全部通過');
if (fail) process.exit(1);
