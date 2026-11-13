/* 任務可達成的證明腳本。用法：node tools/mission-proofs/gibbs-free-energy.js
 * 用化學核心模擬頁面（js/gibbs-free-energy.js）的操作與事件：
 *   選反應、改溫度（滑桿 1 K 一格，打字到 0.01 K）、自訂 ΔH°（0.01 kJ/mol）與 ΔS°（0.1 J/(mol·K)）、
 *   按「記錄這一點」送 'record'（含同一段的較早紀錄 earlier）、「全部清除」開新的一段、未知反應「核對答案」送 'answer'。
 * 確認：每個任務都做得到、預設狀態不觸發任何任務、每個隱藏任務的做法不會順便完成另一個隱藏任務、
 *       每個反應在預設溫度按一次「記錄」不會完成隱藏任務，並用亂數模擬亂按，統計隱藏任務被誤觸的次數。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const C = require(__ROOT + 'js/gibbs-free-energy-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/gibbs-free-energy.js');

let bad = 0;
const done = {};
const hiddenIds = missions.filter(m => m.hidden).map(m => m.id);

// ---------- 模擬頁面 ----------
function newPage() { return { rx: 'vap', T: 298.15, cH: 20, cS: 50, rows: [], seg: 0, mys: null, mysSeq: 0, events: [], fresh: missions.map(m => Object.assign({}, m, { done: false })) }; }
function emit(P, type, data) {
  const ev = { type, data };
  P.fresh.forEach(m => { if (!m.done && m.check(ev)) { m.done = true; P.events.push(m.id); } });
}
function params(P) {
  if (P.rx === 'mys') return { dH: P.mys.dH, dS: P.mys.dS, valid: [C.TMIN, C.TMAX] };
  if (P.rx === 'custom') return { dH: P.cH, dS: P.cS, valid: [C.TMIN, C.TMAX] };
  const d = C.rxData(P.rx); return { dH: d.dH, dS: d.dS, valid: d.valid };
}
const r2 = x => Math.round(x * 100) / 100;
function setT(P, v) { P.T = r2(Math.max(C.TMIN, Math.min(C.TMAX, v))); }
function setRx(P, id) { P.rx = id; }
function custom(P, h, s) { P.rx = 'custom'; P.cH = r2(Math.max(-400, Math.min(400, h))); P.cS = Math.round(Math.max(-400, Math.min(400, s)) * 10) / 10; }
function strip(r) { return { rx: r.rx, mode: r.mode, T: r.T, dH: r.dH, dS: r.dS, dG: r.dG, lnK: r.lnK, log10K: r.log10K, K: r.K, valid: r.valid, seg: r.seg }; }
function record(P) {
  const p = params(P), Tk = P.T;
  const r = { rx: P.rx, mode: P.rx === 'mys' ? 'mys' : P.rx === 'custom' ? 'custom' : 'real', mysId: P.rx === 'mys' ? P.mys.id : null,
    T: Tk, dH: p.dH, dS: p.dS, dG: C.dG(p.dH, p.dS, Tk), lnK: C.lnK(p.dH, p.dS, Tk), log10K: C.log10K(p.dH, p.dS, Tk), valid: Tk >= p.valid[0] - 1e-9 && Tk <= p.valid[1] + 1e-9, seg: P.seg };
  r.K = Math.exp(r.lnK);
  const earlier = P.rows.filter(x => x.seg === P.seg).slice(-60).map(strip);
  P.rows.push(r);
  emit(P, 'record', Object.assign(strip(r), { earlier }));
  return r;
}
function at(P, Tk) { setT(P, Tk); return record(P); }
function clearAll(P) { P.rows = []; P.seg++; }
function startMys(P, m) { P.mys = Object.assign({ id: ++P.mysSeq, revealed: false, tries: 0 }, m || C.makeMystery()); P.rx = 'mys'; }
function answer(P, aH, aS) {
  P.mys.tries++;
  const ts = {};
  P.rows.forEach(r => { if (r.mysId === P.mys.id) ts[r.T.toFixed(2)] = 1; });
  emit(P, 'answer', { errH: Math.abs(aH - P.mys.dH) / Math.abs(P.mys.dH), errS: Math.abs(aS - P.mys.dS) / Math.abs(P.mys.dS), nT: Object.keys(ts).length, tries: P.mys.tries, revealed: P.mys.revealed });
}
/** 學生的做法：由畫面上 3 位有效數字的 K 算 ΔG° = −RT ln K，兩點以上做直線 */
function solveFromRows(P, digits) {
  const pts = P.rows.filter(r => r.mysId === P.mys.id).map(r => ({ T: r.T, dG: -C.R * r.T * C.lnKshown(r.log10K, 3) / 1000 }));
  const f = C.fitLine(pts);
  const k = Math.pow(10, digits == null ? 2 : digits);
  return { dH: Math.round(f.dH * k) / k, dS: Math.round(f.dS * 10) / 10 };
}
function report(name, P, ids, forbid) {
  const ok = ids.every(id => P.events.includes(id)) && !(forbid || []).some(id => P.events.includes(id));
  ids.forEach(id => { if (P.events.includes(id)) done[id] = true; });
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + name + '：' + (P.events.length ? P.events.join('、') : '（沒有任務）'));
  if (!ok) bad++;
  return P.events;
}
const id = n => 'gibbs-free-energy-' + n;

// ---------- 0. 預設狀態不觸發任務 ----------
console.log('〇、預設狀態');
{
  const P = newPage();
  // 頁面載入、粒子動畫自己跑，都不送事件；任務只看 'record'／'answer'
  report('只載入頁面、不操作', P, []);
  if (P.events.length) bad++;
  // 每個反應在預設溫度（298.15 K）按一次「記錄這一點」：不可完成任何隱藏任務
  const Q = newPage();
  C.ORDER.concat(['custom']).forEach(rx => { setRx(Q, rx); record(Q); });
  const hid = Q.events.filter(e => /-h\d+$/.test(e));
  console.log('  ' + (hid.length ? '✗' : '✓') + ' 十個反應在 298.15 K 各記錄一次：完成 ' + (Q.events.join('、') || '（沒有）') + '；隱藏任務 ' + (hid.length ? hid.join('、') : '0 個'));
  if (hid.length) bad++;
}

// ---------- 一、一般任務 ----------
console.log('一、一般任務');
{
  let P = newPage(); setRx(P, 'vap'); at(P, 380); report('1 水滾了：水的汽化 380 K（ΔG° = ' + C.dG(44.01, 118.8, 380).toFixed(2) + '）', P, [id(1)]);
  P = newPage(); setRx(P, 'nh4cl'); at(P, 298.15); report('2 吸熱也能自發：氯化銨 298.15 K（ΔG° = −7.72）', P, [id(2)]);
  P = newPage(); setRx(P, 'vap'); at(P, 370); report('3 找到轉折溫度：水 370 K（ΔG° = ' + C.dG(44.01, 118.8, 370).toFixed(3) + '）', P, [id(3)]);
  P = newPage(); setRx(P, 'ozone'); at(P, 200); at(P, 1300); report('4 臭氧：200 K 與 1300 K', P, [id(4)]);
  P = newPage(); setRx(P, 'caco3'); at(P, 1120); report('5 石灰窯：1120 K（T* = 1118.48）', P, [id(5)]);
  P = newPage(); setRx(P, 'caco3'); at(P, 1130); report('5 反例：1130 K 超過 T* + 5 K', P, [], [id(5)]);
  P = newPage(); setRx(P, 'haber'); at(P, 400); at(P, 500); report('6 冷熱兩樣情：合成氨 400 K 與 500 K', P, [id(6)]);
  P = newPage(); ['vap', 'haber', 'h2o2', 'ozone'].forEach(rx => { setRx(P, rx); record(P); }); report('7 四種組合：汽化、合成氨、雙氧水、臭氧（298.15 K）', P, [id(7)]);
  P = newPage(); ['vap', 'haber', 'h2o2'].forEach(rx => { setRx(P, rx); record(P); }); clearAll(P); setRx(P, 'ozone'); record(P); report('7 反例：中間按了「全部清除」', P, [], [id(7)]);
  P = newPage(); setRx(P, 'n2o4'); at(P, 325.1); report('8 K = 1：N2O4 打字 325.1 K（ln K = ' + C.lnK(57.12, 175.7, 325.1).toExponential(2) + '）', P, [id(8)]);
  P = newPage(); setRx(P, 'n2o4'); at(P, 325); report('8 只用滑桿 325 K：ln K = ' + C.lnK(57.12, 175.7, 325).toFixed(4) + '（|ln K| > 0.005，要打字微調）', P, [], [id(8)]);
  P = newPage(); custom(P, -50, -100); at(P, 400); at(P, 600); report('9 設計反應：ΔH° −50、ΔS° −100（T* = 500 K），400 K 與 600 K', P, [id(9)]);
  P = newPage(); custom(P, 20, 50); at(P, 300); at(P, 600); report('9 反例：自訂的預設值（＋＋，T* = 400 K）', P, [], [id(9)]);
}

// ---------- 二、未知反應 ----------
console.log('二、未知反應（一般任務 10–12）');
{
  let a = 20261113; const rand = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  let ok12 = 0, ok11 = 0, ok10 = 0, worst = 0;
  const N = 300;
  for (let k = 0; k < N; k++) {
    const P = newPage();
    startMys(P, C.makeMystery(rand));
    at(P, 300); at(P, 1300);
    const s = solveFromRows(P);
    worst = Math.max(worst, Math.abs(s.dH / P.mys.dH - 1), Math.abs(s.dS / P.mys.dS - 1));
    answer(P, s.dH, s.dS);
    if (P.events.includes(id(10))) ok10++;
    if (P.events.includes(id(11))) ok11++;
    if (P.events.includes(id(12))) ok12++;
    if (k === 0) report('一個例子：300 K 與 1300 K 各記錄一次，由 K 算 ΔG°、兩點求直線', P, [id(10), id(11), id(12)]);
  }
  const all = ok10 === N && ok11 === N && ok12 === N;
  console.log('  ' + (all ? '✓' : '✗') + ' ' + N + ' 個未知反應照同樣做法：任務 10 ' + ok10 + '、11 ' + ok11 + '、12 ' + ok12 + ' 個完成（最差相對誤差 ' + (worst * 100).toFixed(3) + '%）');
  if (!all) bad++;
  // 反例：揭曉後不算；只量三個溫度不算任務 12
  let P = newPage(); startMys(P, { dH: -80, dS: -150 }); at(P, 300); at(P, 900); P.mys.revealed = true; answer(P, -80, -150); report('反例：揭曉答案後才答對', P, [], [id(10), id(11), id(12)]);
  P = newPage(); startMys(P, { dH: -80, dS: -150 }); at(P, 300); at(P, 600); at(P, 900); answer(P, -80, -150); report('三個溫度：任務 10、11 算，任務 12 不算', P, [id(10), id(11)], [id(12)]);
  P = newPage(); startMys(P, { dH: -80, dS: -150 }); at(P, 300); at(P, 900); answer(P, -84, -150); report('ΔH° 差 5%：任務 10 算、11 不算', P, [id(10)], [id(11), id(12)]);
}

// ---------- 三、隱藏任務：每個做得到，而且不會順便完成別的隱藏任務 ----------
console.log('三、隱藏任務（做法完成後列出所有完成的隱藏任務，只能有它自己）');
function hiddenCase(name, hid, fn) {
  const P = newPage();
  fn(P);
  const got = P.events.filter(e => hiddenIds.includes(e));
  const ok = got.length === 1 && got[0] === hid;
  if (P.events.includes(hid)) done[hid] = true;
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + name + '：隱藏 ' + (got.join('、') || '（沒有）') + (P.events.length > got.length ? '；另完成一般任務 ' + P.events.filter(e => !hiddenIds.includes(e)).join('、') : ''));
  if (!ok) bad++;
}
hiddenCase('h1 冰水裡的冷敷包：氯化銨 275 K（ΔG° = ' + C.dG(14.73, 75.3, 275).toFixed(2) + '）', id('h1'), P => { setRx(P, 'nh4cl'); at(P, 275); });
hiddenCase('h2 同一座爐火：合成氨 700 K（ΔG° > 0）與接觸法 705 K（ΔG° < 0）', id('h2'), P => { setRx(P, 'haber'); at(P, 700); setRx(P, 'so3'); at(P, 705); });
hiddenCase('h3 ΔS° = 0：自訂 ΔH° −40、ΔS° 0，300 K 與 1200 K', id('h3'), P => { custom(P, -40, 0); at(P, 300); at(P, 1200); });
hiddenCase('h4 臭氧 163 K：log K = ' + C.log10K(285.4, -137.8, 163).toFixed(1), id('h4'), P => { setRx(P, 'ozone'); at(P, 163); });
hiddenCase('h5 鏡子：N2O4 在 400 K，再自訂 ΔH° −57.12、ΔS° −175.7 在 400 K', id('h5'), P => { setRx(P, 'n2o4'); at(P, 400); custom(P, -57.12, -175.7); at(P, 400); });
hiddenCase('h6 冰：自訂 ΔH° 6.01、ΔS° 22.0，在 273.15 K', id('h6'), P => { custom(P, 6.01, 22.0); at(P, 273.15); });
hiddenCase('h7 偶合：石灰石 700 K（ΔG° = +67.0），自訂 ΔH° −34、ΔS° +50 在 700 K（ΔG° = −69），總和 −2.0', id('h7'), P => { setRx(P, 'caco3'); at(P, 700); custom(P, -34, 50); at(P, 700); });
hiddenCase('h8 開放的窯：石灰石 797 K（K = ' + Math.exp(C.lnK(179.17, 160.19, 797)).toExponential(2) + '）', id('h8'), P => { setRx(P, 'caco3'); at(P, 797); });
hiddenCase('h9 聖母峰頂：水的汽化 344 K（K = ' + Math.exp(C.lnK(44.01, 118.8, 344)).toFixed(3) + ' bar）', id('h9'), P => { setRx(P, 'vap'); at(P, 344); });
hiddenCase('h10 一半解離：N2O4 打字 329.6 K（K = ' + Math.exp(C.lnK(57.12, 175.7, 329.6)).toFixed(3) + '，α = ' + C.dissociation(Math.exp(C.lnK(57.12, 175.7, 329.6)), 1).toFixed(3) + '）', id('h10'), P => { setRx(P, 'n2o4'); at(P, 329.6); });
// 反例
{
  let P = newPage(); setRx(P, 'ozone'); at(P, 150); report('h4 反例：150 K 低於臭氧的沸點（超出適用範圍）', P, [], [id('h4')]);
  P = newPage(); setRx(P, 'n2o4'); at(P, 400); custom(P, -57.12, -175.7); at(P, 500); report('h5 反例：自訂反應記錄在不同溫度', P, [], [id('h5'), id('h7')]);
  P = newPage(); setRx(P, 'caco3'); at(P, 700); custom(P, -179.17, -160.2); at(P, 700); report('h7 反例：用石灰石的鏡像（是 h5，不算偶合）', P, [id('h5')], [id('h7')]);
  P = newPage(); custom(P, 6.01, 22.0); at(P, 280); report('h6 反例：不在 0 °C', P, [], [id('h6')]);
  P = newPage(); setRx(P, 'haber'); at(P, 700); setRx(P, 'so3'); at(P, 740); report('h2 反例：兩個溫度相差 40 K', P, [], [id('h2')]);
  P = newPage(); setRx(P, 'nh4cl'); at(P, 270); report('h1 反例：270 K 水已結冰（超出適用範圍）', P, [], [id('h1')]);
  P = newPage(); setRx(P, 'vap'); at(P, 298.15); report('h9 反例：25 °C 的蒸氣壓（K = 0.031 bar）', P, [], [id('h9')]);
}

// ---------- 四、亂按：統計隱藏任務被誤觸 ----------
console.log('四、亂按模擬（換反應、滑桿隨機值／最小／最大、記錄、全部清除、自訂滑桿隨機值）');
{
  let a = 1112; const rand = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const RXS = C.ORDER.concat(['custom']);
  const RUNS = 2000, STEPS = 150;
  const hit = {};
  for (let k = 0; k < RUNS; k++) {
    const P = newPage();
    for (let s = 0; s < STEPS; s++) {
      const u = rand();
      if (u < 0.2) setRx(P, RXS[Math.floor(rand() * RXS.length)]);
      else if (u < 0.45) { const w = rand(); setT(P, w < 0.15 ? C.TMIN : w < 0.3 ? C.TMAX : Math.round(C.TMIN + rand() * (C.TMAX - C.TMIN))); }
      else if (u < 0.55 && P.rx === 'custom') { const w = rand(), v = w < 0.15 ? -400 : w < 0.3 ? 400 : Math.round((-400 + 800 * rand()) * 2) / 2; if (rand() < 0.5) P.cH = v; else P.cS = v; }
      else if (u < 0.85) record(P);
      else if (u < 0.9) clearAll(P);
    }
    P.events.filter(e => hiddenIds.includes(e)).forEach(e => { hit[e] = (hit[e] || 0) + 1; });
  }
  const list = Object.keys(hit).map(k => k.replace('gibbs-free-energy-', '') + ' ' + hit[k] + ' 次').join('、');
  console.log('  ' + RUNS + ' 回 × ' + STEPS + ' 步（比試玩的亂按頻繁得多：每步約 3 成按「記錄」）：隱藏任務誤觸 ' + (list || '0 次'));
  // 只當參考：試玩實際的頁面亂按另外跑 tools/playtest.cjs
}

// ---------- 結果 ----------
const missing = missions.map(m => m.id).filter(x => !done[x]);
console.log('\n共 ' + missions.length + ' 個任務（一般 ' + missions.filter(m => !m.hidden).length + '、隱藏 ' + hiddenIds.length + '）；' +
  (missing.length ? '沒有證明到：' + missing.join('、') : '全部證明做得到') + '；失敗 ' + bad + ' 項。');
if (missing.length || bad) process.exitCode = 1;
