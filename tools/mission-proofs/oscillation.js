/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/oscillation.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
// 用物理核心證明每個任務都做得到（事件格式、轉折點與實測週期的算法與 js/oscillation.js 相同）
'use strict';
const OC = require(__ROOT + 'js/oscillation-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(__ROOT + 'js/missions/oscillation.js');
const byId = id => missions.find(m => m.id === 'oscillation-' + id);
const DEG = Math.PI / 180;
const measured = (turns) => { const n = turns.length; return n >= 3 ? turns[n - 1] - turns[n - 3] : NaN; };

// ---------- 模擬頁面發出的事件 ----------
function springRun(o, nTurns) { // o = { m, k, A, sign, b }
  const p = { m: o.m, k: o.k, b: o.b || 0, x0: (o.sign || 1) * o.A, v0: 0, A: o.A };
  const sol = OC.spring(p), E0 = 0.5 * p.k * p.x0 * p.x0;
  const info = () => ({ mode: 'spring', m: p.m, k: p.k, A: p.A, x0: p.x0, damp: p.b > 0, b: p.b, bc: OC.criticalDamping(p.m, p.k), regime: sol.regime, T0: sol.T0, Td: sol.Td, E0: E0 });
  const evs = [], turns = [0];
  if (sol.omegaD > 0 && sol.regime !== 'over') {
    for (let n = 1; n <= (nTurns || 4); n++) {
      const tt = n * Math.PI / sol.omegaD; turns.push(tt);
      const amp = Math.abs(sol.state(tt).x);
      evs.push({ type: 'turn', data: Object.assign(info(), { n: n, t: tt, amp: amp }) });
      const Tm = measured(turns);
      if (isFinite(Tm)) evs.push({ type: 'period', data: Object.assign(info(), { n: n, t: tt, amp: amp, Tm: Tm }) });
    }
  }
  if (sol.regime !== 'none') evs.push({ type: 'settle', data: Object.assign(info(), { t: OC.springSettleTime(p, 1e-4), crossed: sol.regime === 'under' }) });
  return { evs, sol, p, info, pauseAt: (t) => { const st = sol.state(t); return { type: 'pause', data: Object.assign(info(), { t: t, x: st.x, v: st.v, a: st.a, KE: st.KE, PE: st.PE, E: st.E }) }; } };
}
function pendRun(o, nTurns, wantPause) { // o = { L, g, th0, m, b, sign }
  const p = { L: o.L, g: o.g, m: o.m || 0.5, b: o.b || 0, theta0: (o.sign || 1) * o.th0 };
  const Tex = OC.pendulumPeriod(p.L, p.g, Math.abs(p.theta0)), T0 = OC.smallAnglePeriod(p.L, p.g);
  const s = OC.pendulumInit(p), E0 = OC.pendulumEnergy(p, s).E;
  const info = () => ({ mode: 'pendulum', L: p.L, g: p.g, th0: Math.abs(p.theta0), m: p.m, damp: p.b > 0, b: p.b, T0: T0, Tex: Tex, E0: E0 });
  const evs = [], turns = [0];
  let pause = null;
  const dt = 1 / 60;
  while (turns.length - 1 < (nTurns || 4) && s.t < 400) {
    const before = { th: s.th, om: s.om };
    OC.pendulumAdvance(p, s, dt, { onTurn: (t, th) => {
      turns.push(t);
      const n = turns.length - 1, amp = Math.abs(th) / DEG;
      evs.push({ type: 'turn', data: Object.assign(info(), { n: n, t: t, amp: amp }) });
      const Tm = measured(turns);
      if (isFinite(Tm)) evs.push({ type: 'period', data: Object.assign(info(), { n: n, t: t, amp: amp, Tm: Tm }) });
    } });
    if (wantPause && !pause) { // 在動能第一次 ≥ 位能的那一格暫停（學生看讀數按暫停）
      const e = OC.pendulumEnergy(p, s);
      if (e.KE >= e.PE) pause = { type: 'pause', data: Object.assign(info(), { t: s.t, th: s.th / DEG, om: s.om, al: OC.pendulumAccel(p, s.th, s.om), KE: e.KE, PE: e.PE, E: e.E }) };
    }
  }
  return { evs, pause, Tex, T0, turns };
}
const periods = (run) => run.evs.filter(e => e.type === 'period');
const lastPeriod = (run) => periods(run).pop().data.Tm;

let fail = 0;
function expect(id, events, want, note) {
  const m = byId(id); m.mem = {};
  let ok = false;
  events.forEach(e => { if (!ok) ok = !!m.check(e, m.mem); });
  const pass = ok === want;
  if (!pass) fail++;
  console.log((pass ? '  ✓ ' : '  ✗ ') + String(id).padEnd(3) + (want ? ' 達成：' : ' 不觸發：') + note);
}

// ---------- 預設狀態不觸發任何任務 ----------
{
  const sp = springRun({ m: 0.5, k: 20, A: 0.15 }, 12), pe = pendRun({ L: 1, g: 9.8, th0: 20 }, 12);
  const evs = sp.evs.concat(pe.evs);
  let hit = [];
  missions.forEach(m => { m.mem = {}; if (evs.some(e => m.check(e, m.mem))) hit.push(m.id); });
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join(',')); }
  else console.log('  ✓ 預設狀態（彈簧 0.5 kg、20 N/m、A = 0.15；單擺 1 m、9.8、20°，各跑 6 個週期）不觸發任何任務；彈簧 T = ' + lastPeriod(sp).toFixed(4) + '、單擺 T = ' + lastPeriod(pe).toFixed(4));
}

// 1 往左拉
expect(1, springRun({ m: 0.5, k: 20, A: 0.15, sign: -1 }).evs, true, '拖到 x = −0.15 m 放手，完成一個週期');
expect(1, springRun({ m: 0.5, k: 20, A: 0.15 }).evs, false, 'x0 > 0');
// 2 一秒鐘的振子
for (const [m, k] of [[0.5, 19.7], [1, 39.5], [0.25, 9.9]]) expect(2, springRun({ m, k, A: 0.15 }).evs, true, 'm = ' + m + '、k = ' + k + ' → T = ' + OC.springPeriod(m, k).toFixed(5) + ' s');
// 3 伽利略
{
  const a = pendRun({ L: 1, g: 9.8, th0: 5 }), b = pendRun({ L: 1, g: 9.8, th0: 10 });
  expect(3, a.evs.concat(b.evs), true, 'L = 1、g = 9.8：5° 量到 ' + lastPeriod(a).toFixed(4) + ' s，10° 量到 ' + lastPeriod(b).toFixed(4) + ' s（差 ' + ((lastPeriod(b) / lastPeriod(a) - 1) * 100).toFixed(3) + '%）');
  const c = pendRun({ L: 1, g: 9.8, th0: 20 });
  expect(3, a.evs.concat(c.evs), false, '5° 與 20°（20° 超過 10°）');
}
// 4 大擺角變慢
{
  const a = pendRun({ L: 1, g: 9.8, th0: 70 }), b = pendRun({ L: 1, g: 9.8, th0: 68 });
  expect(4, a.evs, true, '70°：Tm/T0 = ' + (lastPeriod(a) / a.T0).toFixed(4));
  expect(4, b.evs, false, '68°：Tm/T0 = ' + (lastPeriod(b) / b.T0).toFixed(4));
  const c = pendRun({ L: 1, g: 9.8, th0: 90 });
  expect(4, c.evs, true, '預設按鈕 90°：Tm/T0 = ' + (lastPeriod(c) / c.T0).toFixed(4));
}
// 5 同步
{
  const pe = pendRun({ L: 0.25, g: 9.8, th0: 5 }), sp = springRun({ m: 0.5, k: 19.6, A: 0.15 });
  expect(5, sp.evs.concat(pe.evs), true, '單擺 L = 0.25、5°（Tm = ' + lastPeriod(pe).toFixed(4) + '）＋彈簧 m = 0.5、k = 19.6（Tm = ' + lastPeriod(sp).toFixed(4) + '）');
  const sp2 = springRun({ m: 2, k: 19.5, A: 0.15 }), pe2 = pendRun({ L: 1, g: 9.8, th0: 10 });
  expect(5, pe2.evs.concat(sp2.evs), true, '另一解：單擺 1 m、10°（' + lastPeriod(pe2).toFixed(4) + '）＋彈簧 m = 2、k = 19.5 → ' + lastPeriod(sp2).toFixed(4));
}
// 6 彈簧能量各半：x = A/√2 時（ωt = π/4）
{
  const r = springRun({ m: 4, k: 2, A: 0.15 }), w = r.sol.omega0, t = Math.PI / 4 / w;
  expect(6, [r.pauseAt(t)], true, 'm = 4、k = 2：t = T/8 = ' + t.toFixed(3) + ' s（x = A/√2）暫停');
  console.log('      容許時間窗 ±' + (0.02 / w).toFixed(3) + ' s（模擬時間；0.25× 播放時實際 ±' + (0.02 / w / 0.25).toFixed(2) + ' s）');
  expect(6, [r.pauseAt(t * 1.1)], false, '晚 10%');
}
// 7 秒擺
{
  for (const th of [5.3, 8, 10]) { const r = pendRun({ L: 0.99, g: 9.8, th0: th }); expect(7, r.evs, true, 'L = 0.99、θ0 = ' + th + '° → Tm = ' + lastPeriod(r).toFixed(5)); }
  { const ok = []; for (let th = 1; th <= 10 + 1e-9; th = Math.round((th + 0.1) * 10) / 10) { const q = pendRun({ L: 0.99, g: 9.8, th0: th }, 3); if (Math.abs(lastPeriod(q) / 2 - 1) <= 0.001) ok.push(th); } console.log('      L = 0.99 可行的釋放角：' + ok[0] + '° … ' + ok[ok.length - 1] + '°'); }
  const r = pendRun({ L: 0.99, g: 9.8, th0: 3 }); expect(7, r.evs, false, 'θ0 = 3° → Tm = ' + lastPeriod(r).toFixed(5) + '（差 ' + ((lastPeriod(r) / 2 - 1) * 100).toFixed(3) + '%）');
  const r2 = pendRun({ L: 1, g: 9.8, th0: 5 }); expect(7, r2.evs, false, 'L = 1.00、5° → ' + lastPeriod(r2).toFixed(5));
}
// 8 臨界阻尼
{
  const bc = OC.criticalDamping(0.5, 20);
  const ok = [];
  for (let b = 6.2; b <= 6.6 + 1e-9; b = Math.round((b + 0.01) * 100) / 100) {
    const r = springRun({ m: 0.5, k: 20, A: 0.15, b: b });
    const m = byId(8); m.mem = {};
    if (r.evs.some(e => m.check(e, m.mem))) ok.push(b);
  }
  console.log('  ✓ 8   m = 0.5、k = 20（b_c = ' + bc.toFixed(4) + '）：可行的 b = ' + ok[0] + ' … ' + ok[ok.length - 1] + '（共 ' + ok.length + ' 個 0.01 間隔的值）');
  if (!ok.length) fail++;
  const r = springRun({ m: 1, k: 25, A: 0.15, b: 10 });
  expect(8, r.evs, true, 'm = 1、k = 25、b = 10（恰好臨界，類型顯示「臨界阻尼」）停下 t/T = ' + (r.evs.find(e => e.type === 'settle').data.t / r.sol.T0).toFixed(4));
  expect(8, springRun({ m: 0.5, k: 20, A: 0.15, b: 6.32 }).evs, false, 'b = 6.32（欠阻尼，越過平衡點）');
  expect(8, springRun({ m: 0.5, k: 20, A: 0.15, b: 7 }).evs, false, 'b = 7（過阻尼，太慢：t/T = ' + (OC.springSettleTime({ m: 0.5, k: 20, b: 7, A: 0.15 }, 1e-4) / OC.springPeriod(0.5, 20)).toFixed(3) + '）');
}
// 9 大擺角的能量各半
{
  const r = pendRun({ L: 3, g: 1, th0: 90 }, 2, true);
  expect(9, [r.pause], true, 'L = 3、g = 1、θ0 = 90°：在動能剛超過位能的那一格暫停，θ = ' + r.pause.data.th.toFixed(2) + '°（理論 60°），|KE − PE|/E = ' + (Math.abs(r.pause.data.KE - r.pause.data.PE) / r.pause.data.E * 100).toFixed(2) + '%');
  console.log('      容許角度窗約 ±' + (0.04 / (2 * Math.sin(60 * DEG)) / DEG).toFixed(2) + '°；60° 處角速率 ' + (Math.sqrt(1 / 3) / DEG).toFixed(1) + '°/s，0.25× 播放 ' + (Math.sqrt(1 / 3) / DEG / 4).toFixed(1) + '°/s');
  const r2 = pendRun({ L: 1, g: 9.8, th0: 45 }, 2, true);
  expect(9, [r2.pause], false, 'θ0 = 45°（小於 60°）');
}
// 10 擺幅減半
{
  const ok = [];
  for (let b = 0.060; b <= 0.080 + 1e-9; b = Math.round((b + 0.001) * 1000) / 1000) {
    const r = pendRun({ L: 1, g: 9.8, th0: 10, m: 1, b: b }, 20);
    const m = byId(10); m.mem = {};
    if (r.evs.some(e => m.check(e, m.mem))) ok.push(b);
  }
  const r = pendRun({ L: 1, g: 9.8, th0: 10, m: 1, b: 0.069 }, 20);
  const t20 = r.evs.filter(e => e.type === 'turn').pop().data;
  expect(10, r.evs, true, 'L = 1、g = 9.8、θ0 = 10°、m = 1、b = 0.069：第 20 個轉折點擺幅 ' + t20.amp.toFixed(3) + '°（比值 ' + (t20.amp / 10).toFixed(4) + '）；理論 b = 2m·ln2/(10T) = ' + (2 * Math.log(2) / (10 * OC.pendulumPeriod(1, 9.8, 10))).toFixed(4));
  console.log('      m = 1 時可行的 b：' + ok.join(', '));
  const r20 = pendRun({ L: 1, g: 9.8, th0: 20, m: 0.5, b: 0.035 }, 20);
  expect(10, r20.evs, true, '預設 L、g、θ0 = 20°、m = 0.5、b = 0.035：比值 ' + (r20.evs.filter(e => e.type === 'turn').pop().data.amp / 20).toFixed(4));
}
// 11 兩倍的週期
{
  const a = pendRun({ L: 1, g: 9.8, th0: 5 });
  const ok = [];
  for (let th = 158.5; th <= 161 + 1e-9; th = Math.round((th + 0.1) * 10) / 10) {
    const r = pendRun({ L: 1, g: 9.8, th0: th }, 3);
    const m = byId(11); m.mem = {};
    if (a.evs.concat(r.evs).some(e => m.check(e, m.mem))) ok.push(th);
  }
  const r = pendRun({ L: 1, g: 9.8, th0: 159.7 }, 3);
  expect(11, a.evs.concat(r.evs), true, 'L = 1、g = 9.8：5°（' + lastPeriod(a).toFixed(4) + ' s）與 159.7°（' + lastPeriod(r).toFixed(4) + ' s），比值 ' + (lastPeriod(r) / lastPeriod(a)).toFixed(4));
  console.log('      可行的釋放角（0.1° 間隔）：' + ok.join(', '));
}
// 12 火星秒擺＋彈簧
{
  const ok = [];
  for (let th = 19; th <= 22 + 1e-9; th = Math.round((th + 0.1) * 10) / 10) {
    const r = pendRun({ L: 0.37, g: 3.71, th0: th }, 3);
    if (Math.abs(lastPeriod(r) - 2) <= 0.001) ok.push(th);
  }
  const pe = pendRun({ L: 0.37, g: 3.71, th0: 20.4 }), sp = springRun({ m: 1.5, k: 14.8, A: 0.15 });
  expect(12, pe.evs.concat(sp.evs), true, '火星 L = 0.37（T0 = ' + pe.T0.toFixed(4) + ' < 2）、θ0 = 20.4° → Tm = ' + lastPeriod(pe).toFixed(5) + '；彈簧 m = 1.50、k = 14.8 → ' + lastPeriod(sp).toFixed(5));
  console.log('      L = 0.37 可行的釋放角：' + ok.join(', ') + '；L = 0.38 時 T0 = ' + OC.smallAnglePeriod(0.38, 3.71).toFixed(4) + ' 已超過 2 s，做不到');
  const pe2 = pendRun({ L: 0.36, g: 3.71, th0: 33.5 });
  console.log('      另一解 L = 0.36、θ0 = 33.5° → Tm = ' + lastPeriod(pe2).toFixed(5));
  expect(12, pe.evs, false, '只有單擺');
  { const ok = []; for (let k = 2; k <= 100 + 1e-9; k = Math.round((k + 0.1) * 10) / 10) { const m = Math.round(k * 0.1013211836 * 100) / 100; if (m >= 0.1 && m <= 4 && Math.abs(OC.springPeriod(m, k) - 2) <= 0.001) ok.push('(' + m.toFixed(2) + ', ' + k + ')'); }
    console.log('      彈簧（m 打到 0.01、k 打到 0.1）可行的 (m, k)：' + ok.join(' ')); }
  expect(12, pendRun({ L: 0.37, g: 3.71, th0: 20.4 }).evs.concat(springRun({ m: 1, k: 9.9, A: 0.15 }).evs), false, '彈簧 m = 1、k = 9.9（k 只能打到 0.1）→ ' + OC.springPeriod(1, 9.9).toFixed(5) + ' s');
}
// h1 山巔猶豫
{
  const a = pendRun({ L: 1, g: 9.8, th0: 170 }, 3), b = pendRun({ L: 1, g: 9.8, th0: 160 }, 3);
  expect('h1', a.evs, true, '170°：Tm/T0 = ' + (lastPeriod(a) / a.T0).toFixed(3));
  expect('h1', b.evs, false, '160°（預設按鈕）：Tm/T0 = ' + (lastPeriod(b) / b.T0).toFixed(3));
}
// h2 最重的身軀
expect('h2', springRun({ m: 4, k: 2, A: 0.15 }).evs, true, 'm = 4、k = 2 → T = ' + OC.springPeriod(4, 2).toFixed(3) + ' s');
expect('h2', springRun({ m: 4, k: 3, A: 0.15 }).evs, false, 'm = 4、k = 3 → T = ' + OC.springPeriod(4, 3).toFixed(3) + ' s');
// h3 遲遲不肯回家
{
  const r = springRun({ m: 0.1, k: 2, A: 0.15, b: 10 });
  const st = r.evs.find(e => e.type === 'settle').data;
  expect('h3', r.evs, true, 'm = 0.1、k = 2、b = 10（ζ = ' + (10 / OC.criticalDamping(0.1, 2)).toFixed(1) + '）：停下 t = ' + st.t.toFixed(2) + ' s = ' + (st.t / st.T0).toFixed(1) + ' T');
  const r2 = springRun({ m: 0.5, k: 20, A: 0.15, b: 10 });
  expect('h3', r2.evs, false, '預設 m、k 加 b = 10（ζ = 1.58）：' + (r2.evs.find(e => e.type === 'settle').data.t / r2.sol.T0).toFixed(2) + ' T');
}
// ---------- 11/12 檢討：只用滑桿有幾組解、任務文字 ----------
{
  // 2：只用滑桿（m 每 0.1、k 每 1）就有的解
  const ok = [];
  for (let mi = 1; mi <= 40; mi++) for (let k = 2; k <= 100; k++) { const m = mi / 10; if (Math.abs(OC.springPeriod(m, k) - 1) <= 0.002) ok.push(m + '/' + k); }
  console.log((ok.length ? '  ✓ ' : '  ✗ ') + '2   只用滑桿的 (m, k) 解 ' + ok.length + ' 組：' + ok.join(' '));
  if (!ok.length) fail++;
  // h2：只用滑桿的解
  const okh2 = [];
  for (let mi = 1; mi <= 40; mi++) for (let k = 2; k <= 100; k++) { const m = mi / 10; if (OC.springPeriod(m, k) >= 8.5) okh2.push(m + '/' + k); }
  console.log((okh2.length ? '  ✓ ' : '  ✗ ') + 'h2  只用滑桿的 (m, k) 解：' + okh2.join(' '));
  if (!okh2.length) fail++;
  expect('h2', springRun({ m: 3.7, k: 2, A: 0.15 }).evs, true, 'm = 3.7、k = 2 → T = ' + OC.springPeriod(3.7, 2).toFixed(3) + ' s');
  // h3：抽樣（m 每 0.1、k 每 7、b 每 0.25）
  let nh3 = 0;
  for (let mi = 1; mi <= 40; mi++) for (let k = 2; k <= 100; k += 7) for (let bi = 1; bi <= 200; bi += 5) {
    const m = mi / 10, b = bi * 0.05, sol = OC.spring({ m, k, b, x0: 0.15, A: 0.15 });
    if (sol.regime === 'over' && OC.springSettleTime({ m, k, b, x0: 0.15, A: 0.15 }, 1e-4) >= 10 * OC.springPeriod(m, k)) nh3++;
  }
  console.log((nh3 ? '  ✓ ' : '  ✗ ') + 'h3  抽樣（k 每 7、b 每 0.25）就有 ' + nh3 + ' 組可行');
  if (!nh3) fail++;
  // 任務文字：任務面板用 textContent 顯示，不可有 HTML 標籤；英文不可有中文；不可有上下標字元或組合箭頭
  const bad = [];
  missions.forEach(m => {
    [m.title, m.desc, m.riddle].filter(Boolean).forEach(t => {
      if (/<[a-z/]/i.test((t.zh || '') + (t.en || ''))) bad.push(m.id + ' 有 HTML 標籤');
      if (/[\u3400-\u9fff\u3000-\u303f]/.test(t.en || '')) bad.push(m.id + ' 英文有中文字元');
      if (/[\u2070\u2074-\u207f\u2080-\u208f\u20d7]/.test((t.zh || '') + (t.en || ''))) bad.push(m.id + ' 有上下標字元或組合箭頭');
    });
  });
  // h2、h3 的提示句不可直接說出條件
  const h2 = byId('h2').riddle.zh, h3 = byId('h3').riddle.zh;
  if (/[重軟慢]|週期|彈簧/.test(h2)) bad.push('h2 提示句出現禁用字');
  if (/回|越過|不擺/.test(h3)) bad.push('h3 提示句出現禁用字');
  if (bad.length) { fail++; console.log('  ✗ 任務文字：' + bad.join('；')); }
  else console.log('  ✓ 任務文字：沒有 HTML、英文沒有中文、沒有上下標字元；h2、h3 提示句沒有禁用字');
}
console.log(fail ? '\n有 ' + fail + ' 項失敗' : '\n全部通過');
process.exitCode = fail ? 1 : 0;
