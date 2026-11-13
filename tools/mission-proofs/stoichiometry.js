/* 任務可達成的證明腳本。用法：node tools/mission-proofs/stoichiometry.js
 * 用化學核心模擬頁面（js/stoichiometry.js）的操作與事件：開始反應 → 跑到反應結束（送 'done'，途中每 0.5 秒送 'tick'）→
 * 對齊液面 → 讀量筒（讀到最小刻度的十分之一，四捨五入）→ 按「計算」（送 'analyze'）。
 * 確認每個任務都做得到、預設狀態不會觸發任務、每個隱藏任務的做法不會順便完成別的隱藏任務。修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const S = require(__ROOT + 'js/stoichiometry-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/stoichiometry.js');

const SPEEDS = [1, 4, 16, 64];
let bad = 0;
const fail = msg => { console.log('  ✗ ' + msg); bad++; };
const okk = msg => console.log('  ✓ ' + msg);

// ---------- 模擬頁面 ----------
const DEF = { m: 0.05, c: 1, V: 10, T: 25, P: 760, cyl: 100, polished: true };
function newPage() {
  const P = { acted: false, seg: 0, runId: 0, aligned: false, done: [], wall: 0 };
  P.mem = {}; missions.forEach(m => { P.mem[m.id] = {}; });
  P.state = {};
  return P;
}
function fresh(P) { P.state = {}; missions.forEach(m => { P.mem[m.id] = {}; }); }
function emit(P, type, data) {
  if (!P.acted) return;
  const ev = { type, data };
  missions.forEach(m => { if (!P.state[m.id] && m.check(ev, P.mem[m.id])) { P.state[m.id] = true; P.done.push(m.id); } });
}
function setup(P, o) {
  P.acted = true;
  P.o = Object.assign({}, DEF, o);
  P.run = S.createRun(P.o);
  S.setAligned(P.run, P.aligned);
  P.runId++;
}
/** 開始反應並跑到結束；speed 為時間倍率的索引；每 0.5 秒（真實時間）送一次 tick */
function runToEnd(P, speed) {
  const r = P.run; S.start(r);
  const sp = SPEEDS[speed == null ? 3 : speed];
  let k = 0;
  while (!r.ended) {
    S.step(r, sp / 60); P.wall += 1 / 60;
    if (++k % 30 === 0) emit(P, 'tick', tick(P));
    if (k > 60 * 3600) throw new Error('跑太久');
  }
  emit(P, 'tick', tick(P));
  const A = r.A, g = S.gas(r);
  emit(P, 'done', { seg: P.seg, runId: P.runId, lim: A.lim, m: r.o.m, c: r.o.c, VHCl: r.o.V, polished: r.o.polished, nMg: A.nMg, nHCl: A.nHCl, ratio: A.ratio,
    T: r.o.T, P: r.o.P, cyl: r.o.cyl, cap: S.CYLINDERS[r.o.cyl].cap, V: g.V, nGas: S.nGas(r), nTheo: A.xiMax, escaped: r.escaped, tEnd: r.tEnd });
}
function tick(P) { const r = P.run, g = S.gas(r); return { seg: P.seg, runId: P.runId, started: r.started, ended: r.ended, t: r.t, V: g.V, escaped: r.escaped, aligned: P.aligned, cap: S.CYLINDERS[r.o.cyl].cap }; }
function align(P, on) { P.aligned = on; S.setAligned(P.run, on); }
/** 讀量筒：估到最小刻度的十分之一 */
function read(P) { const C = S.CYLINDERS[P.run.o.cyl], V = S.gas(P.run).V, q = C.div / 10; return Math.round(V / q) * q; }
function calc(P, lim, vap, reading) {
  const r = P.run, C = S.CYLINDERS[r.o.cyl], g = S.gas(r);
  if (reading == null) reading = read(P);
  const a = S.analyze(r.o, { reading, lim, vap });
  const readErr = Math.abs(reading - g.V) / C.div, onScale = S.onScale(r.o.cyl, g.V);
  const d = { seg: P.seg, runId: P.runId, ended: r.ended, lim: r.A.lim, limPick: lim, reading, Vtrue: g.V, div: C.div, cap: C.cap, readErr, onScale,
    valid: r.ended && !r.escaped && onScale && readErr <= 0.5, aligned: P.aligned, vap, polished: r.o.polished, T: r.o.T, P: r.o.P, Pw: S.vapor(r.o.T),
    m: r.o.m, c: r.o.c, VHCl: r.o.V, nTheo: r.A.xiMax, nHCl: r.A.nHCl, M: a.M, Merr: a.Merr, cHCl: a.cHCl, cErr: a.cErr, Vm: a.Vm, VmErr: a.VmErr, escaped: r.escaped };
  emit(P, 'analyze', d);
  return d;
}
/** 標準做法：設定 → 跑完 → 對齊 → 讀數 → 計算 */
function std(P, o, lim, vap, alignIt) {
  setup(P, o); runToEnd(P); if (alignIt !== false) align(P, true);
  return calc(P, lim || 'Mg', vap !== false);
}

const hiddenIds = missions.filter(m => m.hidden).map(m => m.id);
const pubIds = missions.filter(m => !m.hidden).map(m => m.id);

// ---------- 0. 任務檔格式 ----------
console.log('0. 任務檔格式');
if (pubIds.length < 8 || pubIds.length > 12) fail('一般任務數量 ' + pubIds.length); else okk('一般任務 ' + pubIds.length + ' 個');
if (hiddenIds.length !== 10) fail('隱藏任務數量 ' + hiddenIds.length); else okk('隱藏任務 10 個');
const hl = missions.filter(m => m.hidden).map(m => m.level);
if (Math.min.apply(null, hl) < 3 || Math.max.apply(null, hl) > 10 || hl.filter(l => l >= 7).length < 3) fail('隱藏任務等級 ' + hl.join(','));
else okk('隱藏任務等級 ' + hl.join('、') + '（7 級以上 ' + hl.filter(l => l >= 7).length + ' 個）');
missions.forEach(m => {
  if (m.hidden && !(m.riddle && m.riddle.zh && m.riddle.en)) fail(m.id + ' 沒有 riddle');
  if (!m.hidden && !(m.title && m.desc)) fail(m.id + ' 沒有 title／desc');
  const en = m.hidden ? m.riddle.en : m.title.en + m.desc.en;
  if (/[　-鿿＀-￯]/.test(en)) fail(m.id + ' 英文有中文或全形字');
});

// ---------- 1. 預設狀態不觸發 ----------
console.log('1. 預設狀態不觸發任務');
{
  const P = newPage();
  P.o = Object.assign({}, DEF); P.run = S.createRun(P.o);
  for (let i = 0; i < 40; i++) emit(P, 'tick', tick(P));   // 還沒操作：頁面不送事件
  if (P.done.length) fail('預設觸發 ' + P.done.join('、')); else okk('沒操作時不送事件、不觸發');
  // 只按「開始反應」跑完預設、什麼都不調：只會有 1、2 號（入門任務），沒有隱藏任務
  const Q = newPage(); setup(Q, {}); runToEnd(Q, 1);
  const hid = Q.done.filter(x => /-h/.test(x));
  if (hid.length) fail('預設設定跑完觸發隱藏任務 ' + hid.join('、')); else okk('預設設定直接跑完：只完成 ' + (Q.done.join('、') || '（無）'));
  // 預設跑完、沒對齊、亂填讀數 → 不觸發任何計算類任務
  [0, 1, 9999, -5, 1e9, 37].forEach(v => calc(Q, 'Mg', true, v));
  const extra = Q.done.filter(x => !['stoichiometry-1', 'stoichiometry-2'].includes(x));
  if (extra.length) fail('亂填讀數觸發 ' + extra.join('、')); else okk('亂填讀數（0、1、9999、−5、10^9、37）不觸發計算類任務');
}

// ---------- 2. 一般任務 ----------
console.log('2. 一般任務的做法');
function prove(id, desc, fn) {
  const P = newPage();
  fn(P);
  if (P.state[id]) okk(id + '：' + desc + (P.lastInfo ? '（' + P.lastInfo + '）' : ''));
  else fail(id + ' 做不到：' + desc);
  return P;
}
prove('stoichiometry-1', '預設設定按開始，×4 倍率', P => { setup(P, {}); runToEnd(P, 1); P.lastInfo = '真實約 ' + P.wall.toFixed(0) + ' 秒'; });
prove('stoichiometry-2', '預設 0.05 g、1 M 10 mL 跑完', P => { setup(P, {}); runToEnd(P); });
prove('stoichiometry-3', '0.05 g、1 M 2 mL', P => { setup(P, { V: 2 }); runToEnd(P); P.lastInfo = '剩鎂 ' + (S.left(P.run).mMg).toFixed(4) + ' g'; });
prove('stoichiometry-4', '預設跑完、對齊、讀到 0.1 mL', P => { std(P, {}); });
prove('stoichiometry-5', '0.0486 g、1 M 4.00 mL（比值 2.0004）', P => { setup(P, { m: 0.0486, V: 4 }); runToEnd(P); P.lastInfo = '反應時間 ' + P.run.tEnd.toFixed(0) + ' s，×64 真實約 ' + P.wall.toFixed(0) + ' 秒（也可按「跳到反應結束」）'; });
prove('stoichiometry-6', '預設、對齊、扣蒸氣壓', P => { const d = std(P, {}); P.lastInfo = 'Vm 誤差 ' + (d.VmErr * 100).toFixed(2) + '%'; });
prove('stoichiometry-7', '0.05 g、1 M，鹽酸 2、3、6、8 mL（轉折點 4.11 mL）', P => { [2, 3, 6, 8].forEach(v => { setup(P, { V: v }); runToEnd(P); }); });
prove('stoichiometry-8', '預設、對齊、扣蒸氣壓', P => { const d = std(P, {}); P.lastInfo = '原子量 ' + d.M.toFixed(3); });
prove('stoichiometry-9', '水溫 35 °C、其餘預設', P => { const d = std(P, { T: 35 }); P.lastInfo = '原子量 ' + d.M.toFixed(3) + '；不扣蒸氣壓會差 ' + (S.vapor(35) / 760 * 100).toFixed(1) + '%'; });
prove('stoichiometry-10', '0.1 g、1 M 5 mL（鹽酸不足），選「鹽酸」', P => { const d = std(P, { m: 0.1, V: 5 }, 'HCl'); P.lastInfo = 'c = ' + d.cHCl.toFixed(4) + ' M'; });
prove('stoichiometry-11', '0.087 g、100 mL 量筒（約 90 mL 氣體）', P => { const d = std(P, { m: 0.087 }); P.lastInfo = '原子量誤差 ' + (d.Merr * 100).toFixed(3) + '%'; });
prove('stoichiometry-12', '5 °C 680 mmHg、20 °C 760 mmHg、35 °C 780 mmHg，0.08 g', P => {
  [[5, 680], [20, 760], [35, 780]].forEach(tp => std(P, { m: 0.08, T: tp[0], P: tp[1] }));
});
// 反例
{
  const P = newPage(); std(P, {}, 'Mg', false);
  if (P.state['stoichiometry-8']) fail('不扣蒸氣壓也算任務 8'); else okk('反例：不扣蒸氣壓（誤差 −3.1%）不算任務 8');
  const Q = newPage(); setup(Q, {}); runToEnd(Q); calc(Q, 'Mg', true);
  if (Q.state['stoichiometry-11']) fail('沒對齊也算任務 11'); else okk('反例：沒對齊液面不算任務 11（原子量誤差 ' + (S.analyze(Q.run.o, { reading: read(Q), lim: 'Mg', vap: true }).Merr * 100).toFixed(2) + '%）');
  const R = newPage(); std(R, { m: 0.1, V: 5 }, 'Mg');
  if (R.state['stoichiometry-8']) fail('鹽酸不足時選鎂也算任務 8'); else okk('反例：鹽酸不足卻選「鎂」，原子量差很多，不算');
  const U = newPage(); std(U, { m: 0.2, c: 3, V: 20 });
  if (U.done.some(x => /-(4|6|8|11)$/.test(x))) fail('溢出還算計算任務'); else okk('反例：0.2 g 鎂在 100 mL 量筒溢出，計算類任務都不算');
}

// ---------- 3. 隱藏任務：每個都做得到，而且不會順便完成別的隱藏任務 ----------
console.log('3. 隱藏任務的做法（各自從新的頁面開始）');
function proveH(id, desc, fn) {
  const P = newPage();
  fn(P);
  const hid = P.done.filter(x => hiddenIds.includes(x));
  if (!P.state[id]) fail(id + ' 做不到：' + desc);
  else if (hid.length !== 1) fail(id + ' 的做法也完成了 ' + hid.filter(x => x !== id).join('、'));
  else okk(id + '：' + desc + (P.lastInfo ? '（' + P.lastInfo + '）' : '') + '；只完成這一個隱藏任務');
}
proveH('stoichiometry-h1', '鎂 0.0243 g（1.000 mmol）', P => { std(P, { m: 0.0243 }); P.lastInfo = 'n = ' + (0.0243 / S.M_MG * 1000).toFixed(4) + ' mmol'; });
proveH('stoichiometry-h2', '水溫 0 °C、760 mmHg', P => { std(P, { T: 0 }); });
proveH('stoichiometry-h3', '水溫 40 °C、700 mmHg（水蒸氣占 7.9%）', P => { std(P, { T: 40, P: 700 }); });
proveH('stoichiometry-h4', '0.03 g：先不對齊讀一次，再對齊讀一次', P => {
  setup(P, { m: 0.03 }); runToEnd(P); const a = calc(P, 'Mg', true); align(P, true); const b = calc(P, 'Mg', true);
  P.lastInfo = (a.Vtrue).toFixed(2) + ' → ' + b.Vtrue.toFixed(2) + ' mL';
});
proveH('stoichiometry-h5', '1 M 3 mL 鹽酸，鎂 0.06 g 與 0.10 g', P => { std(P, { m: 0.06, V: 3 }, 'HCl'); std(P, { m: 0.1, V: 3 }, 'HCl'); });
{
  // h6：沒磨亮（原子量偏大 2.04%）＋不扣蒸氣壓（偏小 Pw/P），找抵消的溫度
  let best = null;
  for (let t = 0; t <= 40; t += 0.5) { const e = (1 / 0.98) * (1 - S.vapor(t) / 760) - 1; if (!best || Math.abs(e) < Math.abs(best.e)) best = { t, e }; }
  proveH('stoichiometry-h6', '鎂帶沒磨亮、不扣蒸氣壓、水溫 ' + best.t + ' °C', P => { const d = std(P, { T: best.t, polished: false }, 'Mg', false); P.lastInfo = '原子量 ' + d.M.toFixed(3) + '，誤差 ' + (d.Merr * 100).toFixed(2) + '%'; });
}
{
  // h7：100 mL 量筒剛好裝滿：鎂的質量取到 0.0001 g
  const n = S.molForVolume(99.9, 25, 760), m = Math.round(n * S.M_MG * 1e4) / 1e4;
  proveH('stoichiometry-h7', '鎂 ' + m.toFixed(4) + ' g、25 °C、760 mmHg、100 mL 量筒', P => { const d = std(P, { m }); P.lastInfo = 'V = ' + d.Vtrue.toFixed(3) + ' mL'; });
}
{
  // h8：同樣的鎂，10 °C 700 mmHg 與 25 °C，調大氣壓使體積相同
  const k = 283.15 / (700 - S.vapor(10)), P2 = Math.round((298.15 / k + S.vapor(25)) * 10) / 10;
  proveH('stoichiometry-h8', '0.05 g：10 °C 700 mmHg，再 25 °C ' + P2 + ' mmHg', P => {
    const a = std(P, { T: 10, P: 700 }); const b = std(P, { T: 25, P: P2 }); P.lastInfo = a.Vtrue.toFixed(3) + ' 與 ' + b.Vtrue.toFixed(3) + ' mL';
  });
}
proveH('stoichiometry-h9', '0.08 g、760 mmHg，水溫 5、20、35 °C，都對齊、扣蒸氣壓', P => {
  [5, 20, 35].forEach(t => std(P, { m: 0.08, T: t }));
  const pts = [5, 20, 35].map(t => { const V = S.gasState(100, 0.08 / S.M_MG, t, 760, true).V; return [t, V * (760 - S.vapor(t)) / 760]; });
  const a = (pts[2][1] - pts[0][1]) / 30, b = pts[0][1] - a * 5;
  P.lastInfo = '外插到體積 0：' + (-b / a).toFixed(1) + ' °C';
});
proveH('stoichiometry-h10', '0.19 g、1 M 20 mL、250 mL 量筒（約 196 mL）、對齊、扣蒸氣壓、讀到 0.2 mL', P => { const d = std(P, { m: 0.19, V: 20, cyl: 250 }); P.lastInfo = 'V = ' + d.Vtrue.toFixed(2) + ' mL，誤差 ' + (d.Merr * 100).toFixed(3) + '%'; });
{
  const P = newPage(); std(P, { m: 0.087 });
  if (P.state['stoichiometry-h10']) fail('h10：90 mL 也算'); else okk('反例：h10 在 100 mL 量筒（90 mL）就算讀得很準也不算，要大量氣體');
}

// h9 反例：不扣蒸氣壓，外插的溫度差很多
{
  const P = newPage();
  [5, 20, 35].forEach(t => std(P, { m: 0.08, T: t }, 'Mg', false));
  if (P.state['stoichiometry-h9']) fail('不扣蒸氣壓也算 h9'); else okk('反例：h9 不扣蒸氣壓外插得到約 ' + (function () {
    const p = [5, 35].map(t => [t, S.gasState(100, 0.08 / S.M_MG, t, 760, true).V]); const a = (p[1][1] - p[0][1]) / 30; return (p[0][0] - p[0][1] / a).toFixed(0);
  })() + ' °C，不算');
}
// h4 反例：讀數亂填
{
  const P = newPage(); setup(P, { m: 0.03 }); runToEnd(P); calc(P, 'Mg', true, 50); align(P, true); calc(P, 'Mg', true, 20);
  if (P.state['stoichiometry-h4']) fail('h4 亂填讀數也算'); else okk('反例：h4 讀數不合理時不算');
}

// ---------- 4. 試玩式亂按：隨機設定＋跑完＋計算時亂填讀數，不可完成隱藏任務 ----------
console.log('4. 隨機操作（2000 次）不會意外完成隱藏任務');
{
  let seed = 1113;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = (lo, hi, step) => { const r = rnd(); const v = r < 0.2 ? lo : r < 0.4 ? hi : lo + Math.round(rnd() * (hi - lo) / step) * step; return v; };
  const P = newPage();
  let hit = [];
  for (let i = 0; i < 2000; i++) {
    setup(P, { m: pick(0.01, 0.2, 0.001), c: pick(0.1, 6, 0.05), V: pick(1, 50, 0.5), T: pick(0, 40, 0.5), P: pick(600, 800, 1), cyl: [25, 100, 250][Math.floor(rnd() * 3)], polished: rnd() < 0.7 });
    if (rnd() < 0.5) align(P, !P.aligned);
    S.start(P.run); S.setTime(P.run, P.run.tEnd + 1);
    const vals = ['', '0', '-1', '1e9', '9999', String(Math.round(rnd() * 300))];
    const v = parseFloat(vals[Math.floor(rnd() * vals.length)]);
    if (v > 0 && v <= 1000) calc(P, rnd() < 0.5 ? 'Mg' : 'HCl', rnd() < 0.5, v);
  }
  hit = P.done.filter(x => hiddenIds.includes(x));
  if (hit.length) fail('隨機操作完成了 ' + hit.join('、')); else okk('沒有完成任何隱藏任務');
}

console.log(bad ? '\n有 ' + bad + ' 項沒有通過' : '\n全部通過');
process.exit(bad ? 1 : 0);
