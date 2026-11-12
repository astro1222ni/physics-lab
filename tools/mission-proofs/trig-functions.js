/* 任務可達成的證明腳本。用法：node tools/mission-proofs/trig-functions.js
 * 用數學核心證明每個任務在滑桿範圍與精度內做得到（事件格式與 js/trig-functions.js 相同），
 * 並確認預設狀態不會觸發任務。修改核心或任務條件後重跑。
 * 滑桿：θ 0–720（整數；點數字可輸入到 0.1°）、A −3～3（0.1；可輸入到 0.01）、ω 0.25–4（0.05；0.01）、
 *       φ −180～180（5°；0.1°）、k −2～2（0.1；0.01）、a、b −4～4（0.1；可輸入到 0.001）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const TC = require(ROOT + 'js/trig-functions-core.js');
const missions = [];
global.window = { LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/trig-functions.js');
const byId = id => missions.find(m => m.id === 'trig-functions-' + id);

// ---------- 與 js/trig-functions.js 相同的事件資料 ----------
function angle(theta, src) {
  const u = TC.unit(theta);
  return { type: 'angle', data: { src: src || 'slider', theta: theta, sin: u.sin, cos: u.cos, tan: u.tan, quadrant: u.quadrant, std: u.std } };
}
function wave(A, w, phi, k, src) {
  const i = TC.waveInfo({ A: A, w: w, phi: phi, k: k });
  return { type: 'wave', data: { src: src || 'slider', A: i.A, w: i.w, phi: i.phi, k: i.k, amp: i.amp, period: i.period, max: i.max, min: i.min, firstMax: i.firstMax } };
}
function sum(a, b, src) {
  const s = TC.superpose(a, b);
  return { type: 'sum', data: { src: src || 'slider', a: s.a, b: s.b, r: s.r, phi: s.phi } };
}
/** 挑戰：依序對準幾題（每題 secs 秒、中間是否換題），產生 match 事件 */
function matches(list) {
  let streak = 0; const times = []; const out = [];
  list.forEach(m => {
    if (m.skip) { streak = 0; return; }
    streak++; times.push(m.secs); if (times.length > 3) times.shift();
    const last3 = streak >= 3 ? times.reduce((s, v) => s + v, 0) : NaN;
    out.push({ type: 'match', data: { streak: streak, secs: m.secs, last3: last3, A: 2, w: 2, phi: 45, k: 1 } });
  });
  return out;
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
  const defaults = [angle(30), wave(1, 1, 0, 0), sum(1.5, 1)];
  const hit = missions.filter(m => { m.mem = {}; return defaults.some(e => m.check(e, m.mem)); }).map(m => m.id);
  if (hit.length) { fail++; console.log('  ✗ 預設狀態觸發了 ' + hit.join('、')); }
  else console.log('  ✓ 預設狀態（θ = 30°；y = sin x；1.5 sin x + cos x）不觸發任何任務');
}

// ---------- 每個任務做得到（以及接近但不算的情況） ----------
expect('1', [angle(90)], true, '把 P 拖到 θ = 90°（或 450°），sin θ = 1');
expect('1', [angle(91)], false, 'θ = 91° 差太多');
expect('2', [{ type: 'rotate3d', data: {} }], true, '3D 檢視拖曳轉動');
expect('3', [angle(30), angle(150)], true, '先停在 30°，再停在 150°');
expect('3', [angle(390), angle(510)], true, '同界角 390°、510° 也算');
expect('3', [angle(30), angle(210)], false, '210° 的 sin 是 −1/2');
expect('4', [angle(420)], true, 'θ = 420° = 360° + 60°');
expect('4', [angle(60)], false, '60° 本身不算（要大於 360°）');
expect('5', [wave(3, 2, 0, 0)], true, 'A = 3、ω = 2（週期 π）');
expect('5', [wave(-3, 2, 45, 1)], true, 'A = −3 也算（振幅是 |A|）');
expect('5', [wave(3, 2.05, 0, 0)], false, 'ω = 2.05：週期 3.065，不是 π');
expect('6', [angle(315)], true, 'θ = 315°：tan = −1、sin < 0');
expect('6', [angle(135)], false, 'θ = 135°：tan = −1 但 sin > 0');
expect('6', [angle(675)], false, 'θ = 675° 超出 0°～360°');
expect('7', [sum(3, 4)], true, 'a = 3、b = 4');
expect('7', [sum(-4, 3)], true, 'a = −4、b = 3');
expect('7', [sum(0, 4)], false, 'a = 0 不算');
expect('8', [wave(2, 1, 30, 0)], true, 'y = 2 sin(x + π/6)：最高點在 π/3');
expect('8', [wave(-2, 1, -150, 0)], true, 'y = −2 sin(x − 5π/6) 也是同一條');
expect('8', [wave(2, 1, 35, 0)], false, 'φ = 35°：最高點在 55°，不是 60°');
expect('9', matches([{ secs: 40 }]), true, '對準一題');
expect('10', [wave(-2, 1, -90, 0)], true, 'y = −2 sin(x − π/2) = 2cos x');
expect('10', [wave(2, 1, 90, 0)], false, 'A = 2（正的）不算');
expect('10', [wave(-2, 1, -95, 0)], false, 'φ = −95°：差 0.17，不是同一條');
// 任務 11：a = 1、b = √3 ≈ 1.732（打字到 0.001）
{
  const s = TC.superpose(1, 1.732);
  console.log('    （a = 1、b = 1.732 → r = ' + s.r.toFixed(5) + '，φ = ' + s.phi.toFixed(4) + '°）');
}
expect('11', [sum(1, 1.732)], true, 'a = 1、b = 1.732（打字）');
expect('11', [sum(1, 1.7)], false, '滑桿只能到 1.7：r = 1.972，不夠準');
expect('11', [sum(-1, -1.732)], false, 'a = −1、b = −1.732：相位 −120°');
expect('12', matches([{ secs: 35 }, { secs: 40 }, { secs: 38 }]), true, '連續三題，共 113 秒');
expect('12', matches([{ secs: 35 }, { secs: 40 }, { skip: true }, { secs: 30 }]), false, '中間換題：連勝中斷');
expect('12', matches([{ secs: 50 }, { secs: 45 }, { secs: 40 }]), false, '三題共 135 秒，超過 120 秒');
expect('12', matches([{ secs: 90 }, { secs: 30 }, { secs: 35 }, { secs: 40 }]), true, '連續四題，最近三題共 105 秒');
expect('h1', [wave(0, 1, 0, 1)], true, 'A = 0、k = 1：一條水平線');
expect('h1', [wave(0, 1, 0, 0)], false, 'A = 0、k = 0：就是 x 軸');
expect('h2', [angle(57.3)], true, 'θ = 57.3°（≈ 1 弧度，打字）');
expect('h2', [angle(57)], false, 'θ = 57°：差 0.3°');
expect('h3', [{ type: 'axis3d', data: { angle: 3 } }], true, '3D 轉到順著 x 軸看過去');

// ---------- 挑戰題一定調得出來：目標的 A、ω、φ、k 都在滑桿的格點上 ----------
{
  let bad = 0;
  let seed = 1;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 3000; i++) {
    const t = TC.randomTarget(rand, { A: 1, w: 1, phi: 0, k: 0 });
    const onGrid = v => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9;
    if (!onGrid(t.A) || !onGrid(t.k) || Math.abs(t.w * 20 - Math.round(t.w * 20)) > 1e-9 || t.phi % 5 !== 0) bad++;
    if (TC.curveGap(t, t, 0, 4 * Math.PI, 800) > 0.05) bad++;
  }
  if (bad) { fail++; console.log('  ✗ 有 ' + bad + ' 個挑戰題不在滑桿格點上'); }
  else console.log('  ✓ 3000 個隨機挑戰題都落在滑桿格點上（拖滑桿就調得出來）');
}

// ---------- 總覽 ----------
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;   // 隱藏任務星星加倍（與 js/missions.js 的 LabMission.starsOf 相同）
const stars = missions.reduce((s, m) => s + starsOf(m), 0);
console.log(`\n公開 ${pub.length} 個、隱藏 ${hid.length} 個，共 ${stars} 顆星（公開 ${pub.reduce((s, m) => s + m.level, 0)}、隱藏 ${hid.reduce((s, m) => s + starsOf(m), 0)}，隱藏任務是等級 × 2）。`);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('隱藏任務超過 20 顆星（規則上限）。'); }
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發。');
