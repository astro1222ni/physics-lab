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

// ---------- 11/13 新的隱藏任務 h4–h10 ----------
const DEG = Math.PI / 180;
expect('h4', [angle(100), angle(280), angle(460)], true, '連續停在 100°、280°、460°：tan 都是 ' + Math.tan(100 * DEG).toFixed(3));
expect('h4', [angle(700), angle(520), angle(340)], true, '往回也可以：700°、520°、340°');
expect('h4', [angle(100), angle(280)], false, '只停了兩次');
expect('h4', [angle(100), angle(280), angle(100)], false, '走過去又走回來（方向不一致）');
expect('h4', [angle(100), angle(280), angle(300), angle(480)], false, '中間停到別的角，鏈斷了');
expect('h4', [angle(90), angle(270), angle(450)], false, '90° 的 tan 沒有定義');
expect('h5', [wave(1, 3.14, 0, 0)], true, 'ω = 3.14（打字）：週期 2π／3.14 = ' + (2 * Math.PI / 3.14).toFixed(4));
expect('h5', [wave(1, 3.15, 0, 0)], false, '滑桿只到 ω = 3.15：週期 ' + (2 * Math.PI / 3.15).toFixed(4));
expect('h5', [wave(0, 3.14, 0, 1)], false, 'A = 0 是水平線，沒有週期可言');
{
  const s = TC.superpose(0.966, 0.259);
  expect('h6', [sum(0.966, 0.259)], true, 'a = 0.966、b = 0.259（打字）：r = ' + s.r.toFixed(4) + '、相位 ' + s.phi.toFixed(3) + '°');
}
expect('h6', [sum(1, 0.3)], false, '滑桿格點 a = 1、b = 0.3：r = ' + TC.superpose(1, 0.3).r.toFixed(3));
expect('h6', [sum(0.966, -0.259)], false, '相位 −15°');
expect('h6', [sum(1.932, 0.518)], false, 'r = 2（相位對了，長度不是 1）');
expect('h7', [angle(42.3)], true, 'θ = 42.3°（打字）：θ = ' + (42.3 * DEG).toFixed(4) + ' 弧度，cos θ = ' + Math.cos(42.3 * DEG).toFixed(4));
expect('h7', [angle(42.4)], true, 'θ = 42.4° 也在 ±0.06° 內');
expect('h7', [angle(42)], false, '滑桿整數 42°：cos θ − θ = ' + (Math.cos(42 * DEG) - 42 * DEG).toFixed(4));
expect('h7', [angle(402.3)], false, '402.3°：cos 一樣，但弧度是 7.02');
expect('h8', [wave(0.5, 2, -90, 0.5)], true, 'y = ½ sin(2x − 90°) + ½ = sin²x（滑桿格點就到得了）');
expect('h8', [wave(-0.5, 2, 90, 0.5)], true, 'y = −½ sin(2x + 90°) + ½ 也是同一條');
expect('h8', [wave(0.5, 2, 90, 0.5)], false, 'φ = +90°：那是 cos²x');
expect('h8', [wave(0.5, 2, -90, 0)], false, '少了中線 ½：會沉到水面以下');
{
  const s = TC.superpose(1, 1.272);
  expect('h9', [sum(1, 1.272)], true, 'a = 1、b = 1.272（打字）：1 : ' + (1.272).toFixed(3) + ' : ' + s.r.toFixed(4) + '，√φ = ' + Math.sqrt((1 + Math.sqrt(5)) / 2).toFixed(4) + '、φ = 1.6180');
}
expect('h9', [sum(-1.272, 1)], true, '兩股換邊、帶負號也算');
expect('h9', [sum(1.1, 1.4)], false, '滑桿格點 1.1、1.4：比 ' + (1.4 / 1.1).toFixed(4));
expect('h9', [sum(1, 1.27)], false, '1、1.27：比差 0.002');
{
  // 滑桿格點（0.1）上沒有任何一組做得到
  let hits = 0;
  for (let i = -40; i <= 40; i++) for (let j = -40; j <= 40; j++) if (byId('h9').check(sum(i / 10, j / 10), {})) hits++;
  console.log((hits ? '  ✗ ' : '  ✓ ') + 'h9  a、b 只用滑桿格點（0.1）的 6561 組都做不到，要打字'); if (hits) fail++;
}
expect('h10', [angle(257.5), angle(442.6), angle(624.8)], true, '257.5°、442.6°、624.8°（打字）：tan θ − θ = ' + [257.5, 442.6, 624.8].map(t => (Math.tan(t * DEG) - t * DEG).toFixed(3)).join('、'));
expect('h10', [angle(624.8), angle(257.5), angle(442.6)], true, '先後不拘');
expect('h10', [angle(257.5), angle(442.6)], false, '只找到兩處');
expect('h10', [angle(257), angle(443), angle(625)], false, '滑桿整數角：tan θ − θ = ' + [257, 443, 625].map(t => (Math.tan(t * DEG) - t * DEG).toFixed(2)).join('、'));
{
  // 每一個根附近 0.1° 的格點，至少有一個落在 ±0.06° 內；根本身真的滿足 tan θ = θ
  const ok = [257.4534, 442.6243, 624.7602].every(r => Math.abs(Math.tan(r * DEG) - r * DEG) < 0.01 && Math.abs(Math.round(r * 10) / 10 - r) <= 0.05);
  console.log((ok ? '  ✓ ' : '  ✗ ') + 'h10 三個根 257.4534°、442.6243°、624.7602° 都滿足 tan θ = θ，最近的 0.1° 格點都在 ±0.05° 內'); if (!ok) fail++;
}

// ---------- 亂按模擬：新的隱藏任務不可以被誤觸 ----------
{
  let seed = 1113;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = (lo, hi, step) => lo + Math.round(rand() * (hi - lo) / step) * step;
  const round = (v, n) => Math.round(v * Math.pow(10, n)) / Math.pow(10, n);
  const NEW = ['h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10'];
  const hits = {};
  for (let run = 0; run < 2000; run++) {
    missions.forEach(m => { m.mem = {}; m.got = false; });
    let th = 30, W = { A: 1, w: 1, phi: 0, k: 0 }, S = { a: 1.5, b: 1 };
    for (let st = 0; st < 150; st++) {
      const r = rand();
      let e;
      if (r < 0.35) { th = pick(0, 720, 1); e = angle(th); }
      else if (r < 0.42) { th = round(rand() * 720, 1); e = angle(th); }
      else if (r < 0.47) { th = Math.min(720, Math.max(0, th + (rand() < 0.5 ? -1 : 1))); e = angle(th); }
      else if (r < 0.72) {
        const k = ['A', 'w', 'phi', 'k'][Math.floor(rand() * 4)];
        W[k] = k === 'A' ? pick(-3, 3, 0.1) : k === 'w' ? pick(0.25, 4, 0.05) : k === 'phi' ? pick(-180, 180, 5) : pick(-2, 2, 0.1);
        W[k] = round(W[k], 2); e = wave(W.A, W.w, W.phi, W.k);
      } else if (r < 0.77) {
        const k = ['A', 'w', 'phi', 'k'][Math.floor(rand() * 4)];
        W[k] = k === 'A' ? round(rand() * 6 - 3, 2) : k === 'w' ? round(0.25 + rand() * 3.75, 2) : k === 'phi' ? round(rand() * 360 - 180, 1) : round(rand() * 4 - 2, 2);
        e = wave(W.A, W.w, W.phi, W.k);
      } else if (r < 0.94) { S[rand() < 0.5 ? 'a' : 'b'] = round(pick(-4, 4, 0.1), 1); e = sum(S.a, S.b); }
      else { S[rand() < 0.5 ? 'a' : 'b'] = round(rand() * 8 - 4, 3); e = sum(S.a, S.b); }
      missions.forEach(m => { if (!m.got && m.check(e, m.mem)) { m.got = true; const id = m.id.replace('trig-functions-', ''); hits[id] = (hits[id] || 0) + 1; } });
    }
  }
  const worst = NEW.filter(id => (hits[id] || 0) > 30);
  console.log((worst.length ? '  ✗ ' : '  ✓ ') + '亂按 2000 回（每回 150 步）：' + Object.keys(hits).map(k => k + ' ' + hits[k] + ' 次').join('、') + '（新的隱藏任務每個都不到 1.5%）');
  if (worst.length) fail++;
}

// ---------- 做法交叉檢查：每個新任務的做法只完成它自己 ----------
{
  const ways = {
    h4: [angle(100), angle(280), angle(460)],
    h5: [wave(1, 3.14, 0, 0)],
    h6: [sum(0.966, 0.259)],
    h7: [angle(42.3)],
    h8: [wave(0.5, 2, -90, 0.5)],
    h9: [sum(1, 1.272)],
    h10: [angle(257.5), angle(442.6), angle(624.8)]
  };
  const bad = [];
  Object.keys(ways).forEach(id => {
    missions.forEach(m => {
      if (m.id === 'trig-functions-' + id) return;
      m.mem = {}; let got = false;
      ways[id].forEach(e => { got = m.check(e, m.mem) || got; });
      if (got) bad.push(id + ' → ' + m.id.replace('trig-functions-', ''));
    });
  });
  console.log((bad.length ? '  ✗ 做法會連帶完成別的任務：' + bad.join('、') : '  ✓ 新隱藏任務的做法都只完成它自己')); if (bad.length) fail++;
}
{
  const hidL = missions.filter(m => m.hidden).map(m => m.level);
  const ok = hidL.length === 10 && hidL.every(l => l >= 3 && l <= 10) && hidL.filter(l => l >= 7).length >= 3;
  console.log((ok ? '  ✓ ' : '  ✗ ') + '隱藏任務 ' + hidL.length + ' 個，等級 ' + hidL.join('、') + '（7 級以上 ' + hidL.filter(l => l >= 7).length + ' 個）'); if (!ok) fail++;
}

// ---------- 總覽 ----------
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
const starsOf = m => (m.hidden ? 2 : 1) * m.level;   // 隱藏任務星星加倍（與 js/missions.js 的 LabMission.starsOf 相同）
const stars = missions.reduce((s, m) => s + starsOf(m), 0);
console.log(`\n公開 ${pub.length} 個、隱藏 ${hid.length} 個，共 ${stars} 顆星（公開 ${pub.reduce((s, m) => s + m.level, 0)}、隱藏 ${hid.reduce((s, m) => s + starsOf(m), 0)}，隱藏任務是等級 × 2）。`);
if (hid.some(m => starsOf(m) > 20)) { fail++; console.log('隱藏任務超過 20 顆星（規則上限）。'); }
if (fail) { console.log(`有 ${fail} 項不符合。`); process.exit(1); }
console.log('全部任務都證明做得到，預設狀態不觸發。');
