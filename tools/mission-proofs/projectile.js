/* 任務可達成的證明腳本（拋體運動）。用法：node tools/mission-proofs/projectile.js
 * 修改物理核心或任務條件後重跑，確認每個任務（公開 12 個、隱藏 3 個）仍然做得到、預設狀態不會觸發任務，
 * 並檢查新任務 11、12 不該通過的情況、在滑桿精度下有幾組解。
 * 做法：只用物理核心 js/projectile-core.js，照頁面 js/projectile.js 的方式模擬一次發射
 * （每格 1/60 s 呼叫 PC.advance、落地時 land() 回報 'landed'），組出完全相同的事件資料，
 * 丟進 js/missions/projectile.js 的檢查函式。所有輸入都在 projectile.html 的滑桿範圍內，
 * 標「打字」的值要點數字輸入（v0、h0、g 到小數 2 位，θ 到 1 位，k/m 到 4 位），其餘滑桿直接拉得到。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const PC = require(__ROOT + 'js/projectile-core.js');
const missions = [];
global.window = { ProjectileCore: PC, LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(__ROOT + 'js/missions/projectile.js');

// ---------- 介面允許的值（projectile.html） ----------
const near = (a, b) => Math.abs(a - b) < 1e-9;
const onStep = (v, min, step) => near(Math.round((v - min) / step) * step + min, v);
const decOK = (v, dec) => near(Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec), v);
const K_SLIDER = []; // 阻力係數滑桿：位置 −3 ～ −0.5（間隔 0.01），k/m = 10^位置 取 3 位有效數字（頁面的 kOf）
for (let i = -300; i <= -50; i++) K_SLIDER.push(Number(Math.pow(10, i / 100).toPrecision(3)));
const RANGE = {
  v0: { min: 1, max: 50, step: 0.5, dec: 2 },
  theta: { min: 0, max: 90, step: 1, dec: 1 },
  h0: { min: 0, max: 50, step: 0.5, dec: 2 },
  g: { min: 1, max: 25, step: 0.01, dec: 2 }
};
const G_BUTTONS = [9.8, 1.62, 3.71];
/** 檢查輸入是否為介面做得到的值；傳回 'slider'（滑桿或按鈕）、'typed'（要打字）或錯誤訊息 */
function uiKind(name, v) {
  if (name === 'k') {
    if (K_SLIDER.some(x => near(x, v))) return 'slider';
    return v >= 0.001 - 1e-12 && v <= 0.3162 + 1e-12 && decOK(v, 4) ? 'typed' : 'k/m = ' + v + ' 超出介面範圍';
  }
  const r = RANGE[name];
  if (!(v >= r.min - 1e-12 && v <= r.max + 1e-12)) return name + ' = ' + v + ' 超出滑桿範圍';
  if (name === 'g' && G_BUTTONS.some(x => near(x, v))) return 'slider';
  if (onStep(v, r.min, r.step)) return 'slider';
  return decOK(v, r.dec) ? 'typed' : name + ' = ' + v + ' 超過打字精度';
}

// ---------- 照頁面的方式發射一次 ----------
const DEFAULT = { v0: 20, theta: 45, h0: 0, g: 9.8, k: 0.01, drag: false }; // 頁面的初始 state（k 滑桿預設位置 −2 → 0.01）
let launches = 0;
/** o：要改的滑桿值（其餘取預設）。傳回 land() 會回報的 'landed' 事件 */
function launch(o) {
  const st = Object.assign({}, DEFAULT, o);
  const p = { v0: st.v0, theta: st.theta, h0: st.h0, g: st.g, k: st.drag ? st.k : 0 }; // 頁面的 params()
  const pred = PC.predict(p), opt = PC.optimalAngle(p); // 頁面的 compute()
  const s = PC.initialState(p), trail = [[s.x, s.y, 0]];
  let n = 0;
  while (!PC.advance(p, s, 1 / 60, { trail: trail })) { if (++n > 1e6) throw new Error('沒有落地'); } // 每格 1/60 s（1 倍速）
  let H = 0;
  trail.forEach(pt => { if (pt[1] > H) H = pt[1]; });
  launches++;
  return {
    type: 'landed', data: {
      v0: p.v0, theta: p.theta, h0: p.h0, g: p.g, k: p.k, drag: p.k > 0,
      R: s.x, H: Math.max(H, pred.H), T: s.t, vImpact: Math.hypot(s.vx, s.vy),
      optTheta: opt ? opt.theta : null, n: launches
    }, input: st
  };
}
function feed(events) {
  const got = [];
  events.forEach(ev => missions.forEach(m => { if (!m.done && m.check(ev, m.mem)) { m.done = true; got.push(m.id); } }));
  return got;
}
function reset() { missions.forEach(m => { m.done = false; m.mem = {}; }); launches = 0; }
const f = (x, d) => (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toString();
/** 一發的輸入與結果（只列出與預設不同的設定；打字輸入的值加註） */
function describe(ev) {
  const st = ev.input, d = ev.data, parts = [];
  const tag = (name, v) => uiKind(name, v) === 'typed' ? '（打字）' : '';
  parts.push('v0 = ' + st.v0 + tag('v0', st.v0), 'θ = ' + st.theta + '°' + tag('theta', st.theta));
  if (st.h0) parts.push('h0 = ' + st.h0 + tag('h0', st.h0));
  if (st.g !== 9.8) parts.push('g = ' + st.g + tag('g', st.g));
  if (st.drag) parts.push('阻力 k/m = ' + st.k + tag('k', st.k));
  return parts.join('、') + ' → R = ' + f(d.R, 3) + ' m、T = ' + f(d.T, 3) + ' s';
}

let ok = true;
// ---------- 0. 預設狀態 ----------
// 不操作就沒有事件；用預設值連按兩次「發射」只完成 projectile-1（發射一次讓球落地，本來就是這樣設計）
reset();
{
  const got = feed([launch({}), launch({})]);
  const pass = got.length === 1 && got[0] === 'projectile-1';
  ok = ok && pass;
  console.log((pass ? '✓ ' : '✗ ') + '預設值（v0 = 20、θ = 45°、h0 = 0、g = 9.8、無阻力）連發兩次 → 只完成 ' + (got.join('、') || '（無）'));
}

// ---------- 1. 每個任務的解 ----------
const SOL = {
  'projectile-1': [{}],
  'projectile-2': [{ v0: 32 }],
  'projectile-3': [{ theta: 0, h0: 20, v0: 10 }, { theta: 0, h0: 20, v0: 25 }],
  'projectile-4': [{ theta: 30 }, { theta: 60 }],
  'projectile-5': [{ v0: 20, h0: 40, theta: 30 }],
  'projectile-6': [{ h0: 20, v0: 21.5, theta: 8 }],
  'projectile-7': [{ g: 1.62, theta: 30, v0: 13.68 }],
  'projectile-8': [{ drag: true, v0: 20 }, { v0: 17.5 }],
  'projectile-9': [{ h0: 20, theta: 18 }, { h0: 20, theta: 51 }],
  'projectile-10': [{ drag: true, k: 0.00501, v0: 45.5, theta: 34 }],
  'projectile-11': [{ theta: 76 }],
  'projectile-12': [{}, { h0: 10, v0: 17.72, theta: 37.1 }],
  'projectile-h1': [{ theta: 90 }],
  'projectile-h2': [{ g: 1.62, v0: 50 }],
  'projectile-h3': [{ v0: 49, theta: 90 }],
  'projectile-h4': [{ theta: 0, h0: 10, v0: 14 }],
  'projectile-h5': [{ theta: 0, h0: 10, v0: 5 }, { theta: 0, h0: 40, v0: 5 }],
  'projectile-h6': [{ v0: 29.98 }, { v0: 29.98, drag: true, k: 0.0162 }],
  'projectile-h7': [{ v0: 30, drag: true, k: 0.05, theta: 35.7 }],
  'projectile-h8': [{ v0: 22.26, h0: 20, drag: true, k: 0.01 }],
  'projectile-h9': [{ v0: 16 }, { v0: 6.5, g: 1.62 }],
  'projectile-h10': [{ v0: 40, drag: true, k: 0.02, theta: 20 }, { v0: 40, drag: true, k: 0.02, theta: 55.7 }]
};
const NOTE = {
  'projectile-5': evs => '（最佳仰角 ' + f(evs[0].data.optTheta, 2) + '°）',
  'projectile-8': evs => '（相差 ' + f((evs[1].data.R / evs[0].data.R - 1) * 100, 2) + '%）',
  'projectile-9': evs => '（相差 ' + f((evs[1].data.R / evs[0].data.R - 1) * 100, 2) + '%）',
  'projectile-11': evs => '（H = ' + f(evs[0].data.H, 3) + ' m，R/H − 1 = ' + f((evs[0].data.R / evs[0].data.H - 1) * 100, 2) + '%）',
  'projectile-12': evs => '（R 相差 ' + f((evs[1].data.R / evs[0].data.R - 1) * 100, 3) + '%、T 相差 ' + f((evs[1].data.T / evs[0].data.T - 1) * 100, 3) + '%）',
  'projectile-h4': evs => '（2 h0 = ' + f(2 * evs[0].data.h0, 1) + ' m）',
  'projectile-h5': evs => '（T 比 = ' + f(evs[1].data.T / evs[0].data.T, 5) + '）',
  'projectile-h6': evs => '（R 比 = ' + f(evs[1].data.R / evs[0].data.R, 5) + '）',
  'projectile-h7': evs => '（最佳仰角 ' + f(evs[0].data.optTheta, 3) + '°）',
  'projectile-h8': evs => '（落地速率 ' + f(evs[0].data.vImpact, 4) + ' m/s，比出手 ' + f((evs[0].data.vImpact / evs[0].data.v0 - 1) * 100, 3) + '%）',
  'projectile-h9': evs => '（R 相差 ' + f((evs[1].data.R / evs[0].data.R - 1) * 100, 3) + '%、H 相差 ' + f((evs[1].data.H / evs[0].data.H - 1) * 100, 3) + '%、T 比 ' + f(evs[1].data.T / evs[0].data.T, 3) + '）',
  'projectile-h10': evs => '（R 相差 ' + f((evs[1].data.R / evs[0].data.R - 1) * 100, 3) + '%、兩角和 ' + f(evs[0].data.theta + evs[1].data.theta, 1) + '°、最佳仰角 ' + f(evs[0].data.optTheta, 2) + '°）'
};
for (const m of missions) {
  const runs = SOL[m.id];
  if (!runs) { ok = false; console.log('✗ ' + m.id.padEnd(14) + ' ' + String(m.level).padStart(2) + '★  沒有提供解'); continue; }
  const bad = [];
  runs.forEach(o => Object.keys(o).forEach(k => { if (k !== 'drag') { const u = uiKind(k, o[k]); if (u !== 'slider' && u !== 'typed') bad.push(u); } }));
  reset();
  const evs = runs.map(launch);
  const pass = !bad.length && feed(evs).includes(m.id);
  ok = ok && pass;
  console.log((pass ? '✓ ' : '✗ ') + m.id.padEnd(14) + ' ' + String(m.level).padStart(2) + '★' + (m.hidden ? '（隱藏）' : '') + '  ' +
    evs.map(describe).join('；') + (NOTE[m.id] ? NOTE[m.id](evs) : '') + (bad.length ? '  ' + bad.join('；') : ''));
}

// ---------- 2. 另一組解（只用滑桿，不必打字）與不該通過的情況 ----------
function only(id, runs, want, note) {
  reset();
  const evs = runs.map(launch);
  const got = feed(evs).includes(id);
  const pass = got === want;
  ok = ok && pass;
  console.log((pass ? '✓ ' : '✗ ') + id.padEnd(14) + (want ? ' 也可以：' : ' 不該通過：') + evs.map(describe).join('；') + (note ? '（' + note + '）' : ''));
}
only('projectile-12', [{ v0: 5, theta: 60, h0: 32 }, { v0: 2.5, theta: 0, h0: 45 }], true, '只用滑桿');
only('projectile-11', [{ theta: 76, v0: 35, g: 3.71 }], true, '換初速、換火星，角度一樣是 76°');
only('projectile-11', [{ theta: 75 }], false, 'R/H = 4 cot 75° ≈ 1.072');
only('projectile-11', [{ theta: 76, h0: 5 }], false, '要從地面發射');
only('projectile-12', [{}, { h0: 10, v0: 20, theta: 45 }], false, '只換高度：時間、落點都不同');
only('projectile-12', [{ h0: 10, v0: 17.72, theta: 37.1 }, { h0: 10, v0: 17.72, theta: 37.1 }], false, '同一個高度發兩次一模一樣的');
only('projectile-12', [{ h0: 2, v0: 20, theta: 45 }, { h0: 10, v0: 18.22, theta: 39.1 }], false, '落點與時間都相同，但高度只差 8 m');
only('projectile-12', [{}, { drag: true, k: 0.00501, h0: 10, v0: 17.72, theta: 37.1 }], false, '有空氣阻力');

// ---------- 3. 新任務在滑桿精度下的解有多少（不打字；判斷鬆緊用） ----------
{
  let n11 = [];
  for (let th = 0; th <= 90; th++) { const r = PC.ideal({ v0: 20, theta: th, h0: 0, g: 9.8 }); if (r.R >= 1 && Math.abs(r.R - r.H) <= 0.005 * Math.max(r.R, r.H)) n11.push(th); }
  console.log('  projectile-11 滑桿上的整數仰角只有 ' + n11.join('、') + '°（與初速、重力無關；打字到 0.1° 時 75.9° 也行）');
  // projectile-12：g = 9.8，第一發用預設值（20 m/s、45°、地面），第二發高度 10–50 m 只用滑桿
  const a = PC.ideal({ v0: 20, theta: 45, h0: 0, g: 9.8 });
  let n12 = 0;
  for (let h = 10; h <= 50; h += 0.5) for (let v = 1; v <= 50; v += 0.5) for (let th = 0; th <= 90; th++) {
    const b = PC.ideal({ v0: v, theta: th, h0: h, g: 9.8 });
    if (Math.abs(b.R - a.R) <= 0.003 * Math.max(a.R, b.R) && Math.abs(b.T - a.T) <= 0.003 * Math.max(a.T, b.T)) n12++;
  }
  console.log('  projectile-12 第一發用預設值時，第二發只用滑桿的解有 ' + n12 + ' 組（要打字微調初速與仰角，或兩發都重新設計）');
}

// ---------- 4. 隱藏任務 h4–h10（11/13 補到 10 個）：彼此不連帶、公開任務的示範解不會順便完成 ----------
const HID = missions.filter(m => m.hidden).map(m => m.id);
const hiddenOf = got => got.filter(id => HID.includes(id));
console.log('  —— 隱藏任務 ' + HID.length + ' 個，總星數 ' + missions.filter(m => m.hidden).reduce((a, m) => a + 2 * m.level, 0) + '（星星 = 等級 × 2）；等級 ' + missions.filter(m => m.hidden).map(m => m.level).join('、'));
{
  const lv = missions.filter(m => m.hidden).map(m => m.level);
  const pass = HID.length === 10 && lv.every(l => l >= 3 && l <= 10) && lv.filter(l => l >= 7).length >= 3;
  ok = ok && pass;
  console.log((pass ? '✓ ' : '✗ ') + '隱藏任務 10 個、等級都在 3–10、7 級以上 ' + lv.filter(l => l >= 7).length + ' 個');
}
// 每個隱藏任務的解只完成它自己（不連帶完成別的隱藏任務）。
// 已上線的 h1（R ≈ 0、T > 3 s）與 h3（T = 10 s）判定不動：上面 h3 的解（θ = 90°）兩個都會完成，這裡改用不是 90° 的解
const SOLO = { 'projectile-h3': [{ v0: 50, theta: 78.5 }] };
for (const id of HID) {
  reset();
  const got = hiddenOf(feed((SOLO[id] || SOL[id]).map(launch)));
  const pass = got.length === 1 && got[0] === id;
  ok = ok && pass;
  console.log((pass ? '✓ ' : '✗ ') + id.padEnd(14) + ' 的解只完成隱藏任務：' + (got.join('、') || '（無）') + (SOLO[id] ? '（' + SOLO[id].map(o => 'v0 = ' + o.v0 + '、θ = ' + o.theta + '°（打字）').join('；') + '）' : ''));
}
// 每個公開任務的示範解都不會順便完成隱藏任務（h1 原本就由 θ = 90° 觸發，公開示範解都不用 90°）
{
  let allPass = true;
  for (const m of missions.filter(m => !m.hidden)) {
    reset();
    const got = hiddenOf(feed(SOL[m.id].map(launch)));
    if (got.length) { allPass = false; console.log('✗ ' + m.id + ' 的示範解順便完成了 ' + got.join('、')); }
  }
  ok = ok && allPass;
  if (allPass) console.log('✓ 12 個公開任務的示範解逐一做，都沒有順便完成任何隱藏任務');
}
// 全部公開示範解連續做完（共用判定記憶，像學生一路做下來）也不會完成任何隱藏任務
{
  reset();
  const got = hiddenOf(feed(missions.filter(m => !m.hidden).flatMap(m => SOL[m.id].map(launch))));
  const pass = !got.length;
  ok = ok && pass;
  console.log((pass ? '✓ ' : '✗ ') + '12 個公開示範解一路連續做完 → 完成的隱藏任務：' + (got.join('、') || '（無）'));
}

// ---------- 5. 新隱藏任務的反例（預設設定、一般任務常見設定都不會完成） ----------
only('projectile-h4', [{ theta: 0, h0: 20, v0: 10 }], false, '任務 3 的設定：R = 20.2 m，不是 2 h0');
only('projectile-h4', [{ theta: 0, h0: 10, v0: 14.5 }], false, '差 0.5 m/s：R = 20.7 m');
only('projectile-h4', [{ theta: 5, h0: 10, v0: 14 }], false, '要水平拋出');
only('projectile-h5', [{ theta: 0, h0: 20, v0: 10 }, { theta: 0, h0: 20, v0: 25 }], false, '任務 3 的解：同一高度，時間相同');
only('projectile-h5', [{ theta: 0, h0: 10, v0: 5 }, { theta: 0, h0: 20, v0: 5 }], false, '高度 2 倍只換來 √2 倍的時間');
only('projectile-h5', [{ theta: 0, h0: 10, v0: 5 }, { theta: 0, h0: 40, v0: 5, g: 1.62 }], false, '換了星球');
only('projectile-h6', [{ drag: true, v0: 20 }, { v0: 17.5 }], false, '任務 8 的解：初速不同');
only('projectile-h6', [{ v0: 30 }, { v0: 30, drag: true, k: 0.01 }], false, '阻力預設值 0.01：只少了 ' + f(100 - launch({ v0: 30, drag: true, k: 0.01 }).data.R / launch({ v0: 30 }).data.R * 100, 1) + '%');
only('projectile-h6', [{ v0: 30 }, { v0: 30, drag: true, k: 0.0158 }], false, '滑桿上相鄰的 0.0158：R 比 ' + f(launch({ v0: 30, drag: true, k: 0.0158 }).data.R / launch({ v0: 30 }).data.R, 4));
only('projectile-h7', [{ drag: true }], false, '預設 45° 加阻力：最佳仰角 ' + f(launch({ drag: true }).data.optTheta, 2) + '°');
only('projectile-h7', [{ drag: true, k: 0.00501, v0: 45.5, theta: 34 }], false, '任務 10 的解');
only('projectile-h7', [{ v0: 30, drag: true, k: 0.05, theta: 36 }], false, '滑桿整數 36°：差 0.34°');
only('projectile-h7', [{ v0: 20, drag: true, k: 0.01, theta: 43 }], false, '最佳仰角 42.98° > 40°（阻力太小，看不出偏離 45°）');
only('projectile-h8', [{ v0: 22.26, h0: 20 }], false, '沒有阻力：落地一定比較快');
only('projectile-h8', [{ v0: 22, h0: 20, drag: true, k: 0.01 }], false, '滑桿 22 m/s：差 ' + f((launch({ v0: 22, h0: 20, drag: true, k: 0.01 }).data.vImpact / 22 - 1) * 100, 2) + '%');
only('projectile-h8', [{ v0: 20, drag: true }], false, '地面發射加阻力：落地一定比較慢');
only('projectile-h9', [{ g: 1.62, theta: 30, v0: 13.68 }, { theta: 30, v0: 13.68 }], false, '任務 7 的解再在地球打一次：初速沒換');
only('projectile-h9', [{ v0: 16 }, { v0: 6.5, g: 1.62, theta: 46 }], false, '仰角不同');
only('projectile-h9', [{ v0: 16 }, { v0: 13, g: 7 }], false, 'g 只差 1.4 倍');
only('projectile-h10', [{ theta: 30 }, { theta: 60 }], false, '任務 4 的解（無阻力，兩角和 90°）');
only('projectile-h10', [{ v0: 40, drag: true, k: 0.02, theta: 20 }, { v0: 40, drag: true, k: 0.02, theta: 56 }], false, '滑桿整數 56°：差 ' + f((launch({ v0: 40, drag: true, k: 0.02, theta: 56 }).data.R / launch({ v0: 40, drag: true, k: 0.02, theta: 20 }).data.R - 1) * 100, 2) + '%');
only('projectile-h10', [{ v0: 40, drag: true, k: 0.005, theta: 30 }, { v0: 40, drag: true, k: 0.005, theta: 57.7 }], false, '阻力 0.005 < 0.01');

// ---------- 6. 亂按模擬：像試玩一樣隨機改滑桿（常落在最小、最大值）、隨機開關阻力與換星球，連發 30 次 ----------
{
  const rnd = (function (s) { return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })(20261113);
  const pickIn = (r, edge) => { const u = rnd(); if (u < edge) return r.min; if (u < 2 * edge) return r.max; return Math.round((r.min + rnd() * (r.max - r.min)) / r.step) * r.step + 0; };
  const NEW = HID.filter(id => +id.split('-h')[1] >= 4);
  const hits = {};
  let shots = 0;
  const SEQ = 120, PER = 30;
  for (let q = 0; q < SEQ; q++) {
    reset();
    let st = Object.assign({}, DEFAULT);
    const evs = [];
    for (let i = 0; i < PER; i++) {
      const nCh = 1 + Math.floor(rnd() * 2);
      for (let c = 0; c < nCh; c++) {
        const w = rnd();
        if (w < 0.22) st.v0 = Math.max(1, pickIn(RANGE.v0, 0.15));
        else if (w < 0.44) st.theta = pickIn(RANGE.theta, 0.15);
        else if (w < 0.6) st.h0 = pickIn(RANGE.h0, 0.15);
        else if (w < 0.72) st.g = rnd() < 0.7 ? G_BUTTONS[Math.floor(rnd() * 3)] : Math.round(pickIn(RANGE.g, 0.15) * 100) / 100;
        else if (w < 0.86) st.drag = !st.drag;
        else st.k = K_SLIDER[rnd() < 0.3 ? (rnd() < 0.5 ? 0 : K_SLIDER.length - 1) : Math.floor(rnd() * K_SLIDER.length)];
      }
      st.v0 = Math.round(st.v0 * 2) / 2; st.h0 = Math.round(st.h0 * 2) / 2;
      evs.push(launch(Object.assign({}, st)));
      shots++;
    }
    feed(evs).filter(id => NEW.includes(id)).forEach(id => { hits[id] = (hits[id] || 0) + 1; });
  }
  const bad = Object.keys(hits);
  ok = ok && !bad.length;
  console.log((bad.length ? '✗ ' : '✓ ') + '亂按模擬 ' + SEQ + ' 輪、共 ' + shots + ' 發：新隱藏任務 h4–h10 被誤觸 ' + (bad.map(id => id + ' ×' + hits[id]).join('、') || '0 次'));
}

console.log(ok ? '全部任務都可達成' : '有任務無法達成');
process.exitCode = ok ? 0 : 1;
