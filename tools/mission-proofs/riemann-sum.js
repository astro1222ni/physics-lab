/* 任務可達成的證明腳本。用法：node tools/mission-proofs/riemann-sum.js
 * 用數學核心證明每個任務在滑桿範圍與精度內做得到（事件格式與 js/riemann-sum.js 的 emitNow 相同），並確認預設狀態不會觸發任務。
 * 滑桿：a、b 是 −7 到 7、間隔 0.01（點數字可打到 0.0001，再限制在函數的範圍內）；n 是 1 到 200 的整數。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const R = require(ROOT + 'js/riemann-sum-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/riemann-sum.js');
const byId = id => missions.find(m => m.id === 'riemann-sum-' + id);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;
const PI = Math.PI;

/** 與頁面的 emitNow 相同的事件資料 */
function ev(f, a, b, n, rule, opt) {
  const ab = R.clampAB(f, a, b);
  a = ab[0]; b = ab[1];
  const s = R.all(f, a, b, n), S = rule === 'ul' ? null : s[rule];
  return { type: 'riemann', data: {
    f: f, a: a, b: b, n: n, rule: rule, S: S, I: s.exact, err: S == null ? null : S - s.exact, U: s.upper, L: s.lower,
    left: s.left, right: s.right, mid: s.mid, trap: s.trap, V: R.volSum(f, a, b, n, rule === 'ul' ? 'upper' : rule), Vx: R.volExact(f, a, b),
    view3d: !!(opt && opt.view3d), chal: !!(opt && opt.chal) } };
}
const DEF = ['sq', 0, 2, 6, 'mid'];

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
  const defs = [ev.apply(null, DEF)];
  // 每個函數按下去（預設區間）、每種取法、播放的 n（1、2、4…128 的單一事件）
  R.KEYS.forEach(k => { const d = R.FUNCS[k].def; ['left', 'right', 'mid', 'trap', 'ul'].forEach(r => defs.push(ev(k, d[0], d[1], 6, r))); });
  const hit = missions.filter(m => { return defs.some(e => { m.mem = {}; return m.check(e, m.mem); }); }).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態、六個函數的預設區間配五種取法（n = 6），單一事件都不觸發任務');
}

// ---------- 一般任務 ----------
expect(1, [ev('sq', 0, 2, 100, 'mid')], true, 'n = 100');
expect(2, [ev('sq', 0, 2, 4, 'mid')], true, 'x²、[0, 2]、中點、n = 4，誤差 ' + (R.sum('sq', 0, 2, 4, 'mid') - 8 / 3).toFixed(4));
expect(2, [ev('sq', 0, 2, 3, 'mid')], false, 'n = 3 誤差 ' + (R.sum('sq', 0, 2, 3, 'mid') - 8 / 3).toFixed(4) + ' 不夠');
expect(2, [ev('sq', 0, 2, 4, 'trap')], false, '梯形 n = 4 誤差 ' + (R.sum('sq', 0, 2, 4, 'trap') - 8 / 3).toFixed(4) + ' 不夠');
{
  let n = 1; while (n <= 200 && !(R.sum('sq', 0, 2, n, 'upper') - R.sum('sq', 0, 2, n, 'lower') < 0.1)) n++;
  expect(3, [ev('sq', 0, 2, n, 'ul')], true, 'x²、[0, 2]：n = ' + n + ' 時上和 − 下和 = ' + (R.sum('sq', 0, 2, n, 'upper') - R.sum('sq', 0, 2, n, 'lower')).toFixed(4));
  expect(3, [ev('sq', 0, 2, n - 1, 'ul')], false, 'n = ' + (n - 1) + ' 還不夠');
}
{
  const m4 = byId(4);
  expect(4, [ev('sq', 0, 2, 4, 'mid'), ev('sq', 0, 2, 8, 'mid')], true, '中點 n = 4 → 8，誤差比 ' + (R.shrink('sq', 0, 2, 'mid', 4)).toFixed(3));
  expect(4, [ev('exp', 0, 2, 20, 'trap'), ev('exp', 0, 2, 10, 'trap')], true, '梯形 e^x：先 n = 20 再 n = 10 也算，比 ' + R.shrink('exp', 0, 2, 'trap', 10).toFixed(3));
  expect(4, [ev('sq', 0, 2, 4, 'left'), ev('sq', 0, 2, 8, 'left')], false, '左端點只會減半（比 ' + R.shrink('sq', 0, 2, 'left', 4).toFixed(3) + '）');
  expect(4, [ev('sq', 0, 2, 2, 'mid'), ev('sq', 0, 2, 4, 'mid')], false, '從 n = 2 開始不算');
  expect(4, [ev('sq', 0, 2, 4, 'mid'), ev('sq', 0, 1, 8, 'mid')], false, '中間換了區間不算');
  // 播放（1、2、4、8…）會經過 4 → 8
  expect(4, [1, 2, 4, 8, 16].map(n => ev('sq', 0, 2, n, 'mid')), true, '播放「n 一直加倍」（中點）');
  void m4;
}
expect(5, [ev('sin', 3.1416, 6.2832, 6, 'mid')], true, 'sin x、[3.1416, 6.2832]，積分 ' + R.exact('sin', 3.1416, 6.2832).toFixed(6));
expect(5, [ev('sin', 3.14, 6.28, 6, 'mid')], true, '滑桿格點 [3.14, 6.28]，積分 ' + R.exact('sin', 3.14, 6.28).toFixed(6));
expect(5, [ev('sin', 0, 3.1416, 6, 'mid')], false, '預設 [0, π] 是 +2');
expect(6, [ev('recip', 1, 2.72, 6, 'mid')], true, '1/x、[1, 2.72]（滑桿格點），面積 ' + Math.log(2.72).toFixed(5));
expect(6, [ev('recip', 1, 2.7, 6, 'mid')], false, 'b = 2.7 面積 ' + Math.log(2.7).toFixed(4));
{
  const best = {};
  ['left', 'right', 'mid', 'trap'].forEach(r => { let n = 1; while (n <= 200 && Math.abs(R.sum('semi', -2, 2, n, r) - 2 * PI) > 0.001) n++; best[r] = n; });
  expect(7, [ev('semi', -2, 2, best.mid, 'mid')], true, '半圓、中點 n ≥ ' + best.mid + '（左、右、梯形到 n = 200 都做不到：誤差 ' + (R.sum('semi', -2, 2, 200, 'trap') - 2 * PI).toExponential(2) + '）');
  expect(7, [ev('semi', -2, 2, 200, 'trap')], false, '梯形 n = 200 不夠');
}
expect(8, [{ type: 'view3d', data: { f: 'sq' } }], true, '打開 3D');
{
  let n = 1; while (Math.abs(R.volSum('semi', -2, 2, n, 'mid') - 32 * PI / 3) > 0.05) n++;
  expect(9, [ev('semi', -2, 2, n, 'mid', { view3d: true })], true, '3D、半圓、中點 n = ' + n + '，體積 ' + R.volSum('semi', -2, 2, n, 'mid').toFixed(4) + '（球 ' + (32 * PI / 3).toFixed(4) + '）');
  expect(9, [ev('semi', -2, 2, n, 'mid')], false, '沒開 3D 不算');
  expect(9, [ev('semi', -2, 2, 6, 'mid', { view3d: true })], false, '預設 n = 6 誤差 ' + (R.volSum('semi', -2, 2, 6, 'mid') - 32 * PI / 3).toFixed(3));
}
expect(10, [{ type: 'challenge', data: { time: 30, streak: 1, last3: null } }], true, '答對一題（每題都做得到：見單元測試的 2000 題）');
expect(11, [{ type: 'challenge', data: { time: 30, streak: 3, last3: 100 } }], true, '三題共 100 秒');
expect(11, [{ type: 'challenge', data: { time: 30, streak: 3, last3: 130 } }], false, '三題共 130 秒太慢');

// ---------- 隱藏任務 ----------
expect('h1', [ev('sin', 0, 6.2832, 4, 'left')], true, 'sin x、[0, 6.2832]、左端點 n = 4：左和 ' + R.sum('sin', 0, 6.2832, 4, 'left').toExponential(2) + '、積分 ' + R.exact('sin', 0, 6.2832).toExponential(2));
expect('h1', [ev('sin', 0, 6.28, 3, 'right')], false, '只用滑桿格點 [0, 6.28] 還差一點（右和 ' + R.sum('sin', 0, 6.28, 3, 'right').toFixed(4) + '）：要打字到 6.2832');
expect('h1', [ev('sin', -3.1416, 3.1416, 5, 'right')], true, '[−3.1416, 3.1416]、右端點 n = 5 也行');
expect('h1', [ev('sin', 0, 3.1416, 10, 'left')], false, '[0, π]：左和 = 右和，但誤差 ' + (R.sum('sin', 0, 3.1416, 10, 'left') - 2).toFixed(4));
expect('h1', [ev('sin', 0, 3.1416, 200, 'left')], false, '[0, π]、n = 200 太多段不算');
expect('h1', [ev('sin', 0, 6.2832, 4, 'mid')], false, '中點不算');
// 半圓、x² 對稱區間：左和 = 右和，但誤差大
expect('h1', [ev('sq', -1, 1, 10, 'left')], false, 'x² 在 [−1, 1]：誤差 ' + (R.sum('sq', -1, 1, 10, 'left') - 2 / 3).toFixed(4));
expect('h2', [ev('recip', 1, 2, 6, 'mid'), ev('recip', 3, 6, 6, 'mid')], true, '1/x 在 [1, 2] 與 [3, 6]：面積都是 ln 2');
expect('h2', [ev('recip', 1, 2.72, 6, 'mid'), ev('recip', 2, 5.44, 6, 'mid')], true, '[1, 2.72] 與 [2, 5.44]：' + Math.log(2.72).toFixed(4) + '、' + Math.log(2.72).toFixed(4));
expect('h2', [ev('recip', 1, 2, 6, 'mid'), ev('recip', 1, 2, 30, 'trap')], false, '同一段換取法不算');
expect('h2', [ev('recip', 1, 4, 6, 'mid'), ev('recip', 1.2, 4.8, 6, 'mid')], false, '[1, 4] 與 [1.2, 4.8]：a 只差 0.2 不算');

// ---------- 星星總數 ----------
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const sp = pub.reduce((s, m) => s + starsOf(m), 0), sh = hid.reduce((s, m) => s + starsOf(m), 0);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('  ✗ 隱藏任務超過 20 顆'); }
console.log('\n公開 ' + pub.length + ' 個 ' + sp + ' 顆、隱藏 ' + hid.length + ' 個 ' + sh + ' 顆，共 ' + (sp + sh) + ' 顆。');
console.log(fail ? fail + ' 項失敗' : '全部通過');
if (fail) process.exit(1);
