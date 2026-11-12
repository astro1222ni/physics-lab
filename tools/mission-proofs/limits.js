/* 任務可達成的證明腳本。用法：node tools/mission-proofs/limits.js
 * 用數學核心證明每個任務在滑桿範圍與打字精度內做得到（事件格式與 js/limits.js 的 emitSeq／emitFunc／emitSeries 相同），並確認預設狀態不會觸發任務。
 * 滑桿：ε 是 0.001 到 1（打字到小數第 3 位）、N 是 1 到 2000 的整數、r 是 −1.2 到 1.2；
 * 函數的 ε 同上、δ 是 0.001 到 2（小數第 4 位）、放大 1 到 1000 倍；級數 a 是 −3 到 3、r 是 −1.2 到 1.2（小數第 2 位）、n 是 1 到 60。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const M = require(ROOT + 'js/limits-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/limits.js');
const byId = id => missions.find(m => m.id === 'limits-' + id);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;
const dec = (v, d) => Math.abs(v * Math.pow(10, d) - Math.round(v * Math.pow(10, d))) < 1e-6;

function seqEv(seq, eps, N, r) {
  if (!(eps >= 0.001 && eps <= 1 && dec(eps, 3))) throw new Error('ε 超出範圍或精度：' + eps);
  if (!(N >= 1 && N <= 2000 && N === Math.round(N))) throw new Error('N 超出範圍：' + N);
  const sp = Object.assign({}, M.SEQS[seq]);
  if (sp.kind === 'geo') sp.r = r == null ? 0.8 : r;
  const lim = M.limit(sp);
  return { type: 'seq', data: { seq: seq, eps: eps, N: N, Nmin: lim.conv ? M.Nmin(sp, eps) : null, conv: lim.conv } };
}
function funcEv(fn, eps, delta, zoom, squeeze) {
  if (!(eps >= 0.001 && eps <= 1 && dec(eps, 3))) throw new Error('ε 超出範圍或精度');
  if (!(delta >= 0.001 && delta <= 2 && dec(delta, 4))) throw new Error('δ 超出範圍或精度：' + delta);
  zoom = zoom || 1;
  if (!(zoom >= 1 && zoom <= 1000)) throw new Error('放大超出範圍');
  const dmax = M.deltaMax(fn, eps);
  return { type: 'func', data: { fn: fn, eps: eps, delta: delta, dmax: dmax, ok: dmax != null && delta <= dmax * (1 + 1e-9), zoom: zoom, squeeze: !!squeeze && (fn === 'xsin' || fn === 'sinc') } };
}
function seriesEv(a, r, n) {
  if (!(Math.abs(a) <= 3 && dec(a, 2) && Math.abs(r) <= 1.2 && dec(r, 2) && n >= 1 && n <= 60)) throw new Error('級數超出範圍');
  return { type: 'series', data: { a: a, r: r, n: n, Sn: M.partial(a, r, n), Sinf: M.sumInf(a, r) } };
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
  const evs = [seqEv('recip', 0.2, 1), funcEv('hole', 0.2, 0.5), seriesEv(1, 0.5, 6)];
  const hit = missions.filter(m => evs.some(e => { m.mem = {}; return m.check(e, m.mem); })).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態（1/n、ε = 0.2、N = 1；函數 ε = 0.2、δ = 0.5；級數 1、0.5、6 項）不觸發任務');
}

// ---------- 數列 ----------
expect(1, [seqEv('recip', 0.1, 1)], true, '1/n、ε = 0.1');
expect(1, [seqEv('osc', 0.05, 1)], false, '發散的數列不算');
expect(2, [seqEv('recip', 0.01, 101)], true, '1/n、ε = 0.01、N = 101（1/100 = 0.01 不小於 ε）');
expect(2, [seqEv('recip', 0.01, 100), seqEv('recip', 0.01, 102)], false, 'N = 100 太小、102 不是最小');
{
  const N = M.Nmin(M.SEQS.alt, 0.05);
  expect(3, [seqEv('alt', 0.05, N)], true, '(−1)^n/n、ε = 0.05、N = ' + N);
}
{
  const N = M.Nmin(M.SEQS.e, 0.01);
  expect(4, [seqEv('e', 0.01, N)], true, '(1 + 1/n)^n、ε = 0.01、N = ' + N + '（e − a_' + (N - 1) + ' = ' + M.err(M.SEQS.e, N - 1).toFixed(5) + '、e − a_' + N + ' = ' + M.err(M.SEQS.e, N).toFixed(5) + '）');
  expect(4, [seqEv('e', 0.02, M.Nmin(M.SEQS.e, 0.02))], false, 'ε = 0.02 不算');
}
expect(5, [seqEv('osc', 0.2, 1)], true, '(−1)^n、ε = 0.2');
expect(5, [seqEv('geo', 0.5, 1, 1.1)], true, 'r^n、r = 1.1');
expect(5, [seqEv('geo', 0.5, 1, 1), seqEv('osc', 1, 1)], false, 'r = 1 會收斂、ε = 1 不算');
{
  const N = M.Nmin(M.SEQS.recip, 0.001);
  expect('h2', [seqEv('recip', 0.001, N)], true, '1/n、ε = 0.001、N = ' + N);
  const Ne = M.Nmin(M.SEQS.e, 0.001);
  expect('h2', [seqEv('e', 0.001, Ne)], true, '(1 + 1/n)^n、ε = 0.001、N = ' + Ne + '（在 N 的滑桿範圍 2000 以內）');
  expect('h2', [seqEv('recip', 0.002, M.Nmin(M.SEQS.recip, 0.002))], false, 'ε = 0.002 不算（N = 501）');
}

// ---------- 函數 ----------
{
  expect(6, [funcEv('hole', 0.1, 0.1)], true, '(x² − 1)/(x − 1)、ε = 0.1、δ = 0.1 = δ_max');
  expect(6, [funcEv('hole', 0.1, 0.09), funcEv('hole', 0.1, 0.11)], false, 'δ = 0.09 不夠大（差 10%）、0.11 太大');
  const dm = M.deltaMax('sinc', 0.01), d = Math.floor(dm * 1e4) / 1e4;
  expect(7, [funcEv('sinc', 0.01, d)], true, 'sin x / x、ε = 0.01、δ_max = ' + dm.toFixed(6) + '，打 δ = ' + d);
  expect(7, [funcEv('sinc', 0.01, Math.round(dm * 1.02 * 1e4) / 1e4), funcEv('sinc', 0.02, Math.floor(M.deltaMax('sinc', 0.02) * 1e4) / 1e4)], false, 'δ 超過 2% 不行、ε = 0.02 不算');
}
expect(8, [{ type: 'approach', data: { fn: 'sign', side: 'left' } }, { type: 'approach', data: { fn: 'sign', side: 'right' } }], true, '|x|/x 從左右各逼近一次');
expect(8, [{ type: 'approach', data: { fn: 'sign', side: 'left' } }, { type: 'approach', data: { fn: 'hole', side: 'right' } }], false, '另一邊換了函數不算');
expect(9, [funcEv('xsin', 0.2, 0.5, 100, true)], true, 'x sin(1/x)、夾擠線、放大 100 倍');
expect(9, [funcEv('xsin', 0.2, 0.5, 99, true), funcEv('sinc', 0.2, 0.5, 200, true), funcEv('xsin', 0.2, 0.5, 200, false)], false, '99 倍、換函數、沒開夾擠都不算');

// ---------- 級數 ----------
expect(10, [seriesEv(1.5, -0.5, 10)], true, 'a = 1.5、r = −0.5：1.5 / 1.5 = 1');
expect(10, [seriesEv(0.5, 0.5, 10), seriesEv(1, -1, 10)], false, '正公比、r = −1 都不算');
expect('h1', [seriesEv(0.9, 0.1, 5)], true, '0.9 + 0.09 + 0.009 + …');
expect('h1', [seriesEv(0.9, 0.2, 5)], false, 'r = 0.2 不算');

// ---------- 挑戰 ----------
expect(11, [{ type: 'challenge', data: { time: 20, streak: 1, last3: null } }], true, '答對一題');
expect(12, [{ type: 'challenge', data: { time: 25, streak: 3, last3: 80 } }], true, '連續三題 80 秒');
expect(12, [{ type: 'challenge', data: { time: 40, streak: 3, last3: 91 } }], false, '超過 90 秒不算');
{
  const R = M.rng(2024); let bad = 0;
  for (let t = 0; t < 1000; t++) { const c = M.genChallenge(R, null); if (!c || c.N !== M.Nmin(c.spec, c.eps) || c.N > 80) bad++; }
  if (bad) { fail++; console.log('  ✗ 挑戰有 ' + bad + ' 題不合格'); } else console.log('  ✓ 1000 題挑戰的答案都在畫面顯示的 100 項以內');
}

const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const sp = pub.reduce((s, m) => s + starsOf(m), 0), sh = hid.reduce((s, m) => s + starsOf(m), 0);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('  ✗ 隱藏任務超過 20 顆'); }
console.log('\n公開 ' + pub.length + ' 個 ' + sp + ' 顆、隱藏 ' + hid.length + ' 個 ' + sh + ' 顆，共 ' + (sp + sh) + ' 顆。');
console.log(fail ? fail + ' 項失敗' : '全部通過');
if (fail) process.exit(1);
