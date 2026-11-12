/* 任務可達成的證明腳本。用法：node tools/mission-proofs/heat-engine.js
 * 用物理核心（js/heat-engine-core.js）重現頁面送出的事件，證明每個任務都做得到，
 * 而且每個解答的滑桿值都在 heat-engine.html 的範圍內、精度不超過 data-decimals；
 * 另外確認：只切換循環種類（預設參數，正轉或逆轉）、只記錄預設循環，都不會完成任何任務。
 * 修改物理核心、滑桿範圍或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const fs = require('fs'), vm = require('vm');
const C = require(__ROOT + 'js/heat-engine-core.js');

let missions = [];
const LM = { register: (id, list) => { missions = list; } };
vm.runInNewContext(fs.readFileSync(__ROOT + 'js/missions/heat-engine.js', 'utf8'), { window: { LabMission: LM }, LabMission: LM });

// ---- 從 HTML 讀滑桿的範圍、預設值與精度 ----
const html = fs.readFileSync(__ROOT + 'heat-engine.html', 'utf8');
const SL = {};
html.replace(/<input id="(\w+)" type="range"([^>]*)>/g, (m, id, rest) => {
  const a = k => { const r = new RegExp(k + '="([^"]*)"').exec(rest); return r ? r[1] : null; };
  SL[id] = { min: +a('min'), max: +a('max'), step: +a('step'), value: +a('value'), dec: a('data-decimals') == null ? null : +a('data-decimals') };
});
const REGEN0 = /<input id="regen" type="checkbox" checked/.test(html);
const REV0 = /<input id="reverse" type="checkbox" checked/.test(html);
const GAS0 = /id="gDi"[^>]*aria-pressed="true"/.test(html) ? 'di' : 'mono';

let fail = 0;
const bad = msg => { fail++; console.log('  ✗ ' + msg); };
/** 確認數值可由滑桿或直接輸入得到（範圍內、小數位數不超過 data-decimals） */
function inRange(id, v) {
  const s = SL[id];
  if (!s) { bad('找不到滑桿 ' + id); return; }
  if (v < s.min - 1e-9 || v > s.max + 1e-9) bad(id + ' = ' + v + ' 超出範圍 ' + s.min + '–' + s.max);
  const dec = s.dec == null ? 2 : s.dec;
  if (Math.abs(Math.round(v * Math.pow(10, dec)) - v * Math.pow(10, dec)) > 1e-6) bad(id + ' = ' + v + ' 的小數位數超過 ' + dec);
}

// ---- 頁面狀態（與 js/heat-engine.js 的 ui() 相同的結構） ----
const MAP = {
  carnot: { Th: 'cTh', Tc: 'cTc', VA: 'cVA', rB: 'cRB' },
  otto: { r: 'oR', T1: 'oT1', T3: 'oT3', V1: 'oV1' },
  diesel: { r: 'dR', rc: 'dRc', T1: 'dT1', V1: 'dV1' },
  stirling: { Th: 'sTh', Tc: 'sTc', Vmin: 'sVmin', r: 'sR' },
  brayton: { rp: 'bRp', T1: 'bT1', T3: 'bT3', P1: 'bP1' }
};
const DEF_CUSTOM = [[8, 300], [8, 700], [20, 700], [20, 300]];
function defaults() {
  const u = { type: 'carnot', gas: GAS0, n: SL.n.value, reverse: REV0, regen: REGEN0, custom: { pts: DEF_CUSTOM.map(a => a.slice()) } };
  Object.keys(MAP).forEach(t => { u[t] = {}; Object.keys(MAP[t]).forEach(k => { u[t][k] = SL[MAP[t][k]].value; }); });
  return u;
}
/** 依「操作」改變頁面狀態，並檢查每個值都拿得到 */
function setUI(u, ch) {
  if (ch.type) u.type = ch.type;
  if (ch.gas) u.gas = ch.gas;
  if (ch.n != null) { inRange('n', ch.n); u.n = ch.n; }
  if (ch.reverse != null) u.reverse = ch.reverse;
  if (ch.regen != null) u.regen = ch.regen;
  if (ch.pts) {
    if (ch.pts.length < 3 || ch.pts.length > 6) bad('自訂頂點數 ' + ch.pts.length);
    ch.pts.forEach(p => {
      if (p[0] < 0.5 || p[0] > 25 || p[1] < 10 || p[1] > 1000) bad('自訂頂點超出範圍：' + p);
      if (Math.abs(Math.round(p[0] * 100) - p[0] * 100) > 1e-6 || p[1] !== Math.round(p[1])) bad('自訂頂點精度（0.01 L、1 kPa）：' + p);
    });
    u.custom = { pts: ch.pts.map(a => a.slice()) };
  }
  Object.keys(MAP).forEach(t => Object.keys(MAP[t]).forEach(k => {
    if (ch[t] && ch[t][k] != null) { inRange(MAP[t][k], ch[t][k]); u[t][k] = ch[t][k]; }
  }));
  // 頁面規則：T_c 一定低於 T_h（至少 1 K）
  ['carnot', 'stirling'].forEach(t => { if (u[t].Tc > u[t].Th - 1) bad(t + ' 的 T_c 不比 T_h 低 1 K'); });
  return u;
}
const cycleEv = u => ({ type: 'cycle', data: Object.assign(C.report(C.fromDisplay(u)), { laps: 1 }) });
function hits(ev) { return missions.filter(m => { try { return m.check(ev, {}); } catch (e) { return false; } }).map(m => m.id); }

// ---- 1. 預設狀態、只切換種類、只按逆向、只記錄預設循環：不會完成任務 ----
console.log('預設狀態（' + GAS0 + '）與只切換種類：');
['carnot', 'otto', 'diesel', 'stirling', 'brayton', 'custom'].forEach(t => {
  [false, true].forEach(rev => {
    const u = setUI(defaults(), { type: t, reverse: rev });
    const ev = cycleEv(u), rec = { type: 'record', data: { row: ev.data, rows: [ev.data] } };
    const h = hits(ev).concat(hits(rec));
    const d = ev.data;
    const desc = d.engine ? 'η ' + (d.eta * 100).toFixed(2) + '%，W ' + d.Wout.toFixed(0) + ' J' : 'K_R ' + d.KR.toFixed(2);
    if (h.length) bad(t + (rev ? '（逆向）' : '') + ' 預設就完成了 ' + h.join('、')); else console.log('  ✓ ' + t + (rev ? '（逆向）' : '') + '：' + desc + '，沒有完成任何任務');
  });
});
// 換成另一種氣體時（也是使用者的操作）會完成哪些任務：只列出，供參考
['carnot', 'otto', 'diesel', 'stirling', 'brayton', 'custom'].forEach(t => {
  const u = setUI(defaults(), { type: t, gas: GAS0 === 'di' ? 'mono' : 'di' });
  const h = hits(cycleEv(u));
  if (h.length) console.log('  （參考）' + t + ' 只換氣體會完成：' + h.join('、'));
});

// ---- 2. 每個任務的解答 ----
const SOL = {
  'heat-engine-1': { say: '卡諾 T_h 800 K、T_c 300 K', steps: [{ type: 'carnot', carnot: { Th: 800, Tc: 300 } }] },
  'heat-engine-2': { say: '奧圖、雙原子、壓縮比 10', steps: [{ type: 'otto', otto: { r: 10 } }] },
  'heat-engine-3': { say: '卡諾 T_h 1200 K、T_c 300 K（溫度比 4）', steps: [{ type: 'carnot', carnot: { Th: 1200, Tc: 300 } }] },
  'heat-engine-4': { say: '布雷頓、雙原子、壓力比 12', steps: [{ type: 'brayton', brayton: { rp: 12 } }] },
  'heat-engine-5': { say: '卡諾 n 1 mol、T_h 600 K、T_c 427 K、V2/V1 = 2', steps: [{ type: 'carnot', n: 1, carnot: { Th: 600, Tc: 427, rB: 2 } }] },
  'heat-engine-6': { say: '卡諾逆向 T_h 358 K、T_c 300 K', steps: [{ type: 'carnot', reverse: true, carnot: { Th: 358, Tc: 300 } }] },
  'heat-engine-7': { say: '記錄奧圖 r 12，再記錄狄塞爾 r 12（同為雙原子）', steps: [{ type: 'otto', otto: { r: 12 }, record: true }, { type: 'diesel', diesel: { r: 12 }, record: true }] },
  'heat-engine-8': { say: '史特林預設、勾回熱器記錄一次，取消回熱器再記錄一次', steps: [{ type: 'stirling', regen: true, record: true }, { type: 'stirling', regen: false, record: true }] },
  'heat-engine-9': { say: '記錄奧圖 r 5，再記錄布雷頓 r_p 9.5（雙原子）', steps: [{ type: 'otto', otto: { r: 5 }, record: true }, { type: 'brayton', brayton: { rp: 9.5 }, record: true }] },
  'heat-engine-10': { say: '記錄奧圖 r 8、T1 300 K、T3 1910 K，再記錄狄塞爾 r 18、r_c 2、T1 300 K', steps: [{ type: 'otto', otto: { r: 8, T1: 300, T3: 1910 }, record: true }, { type: 'diesel', diesel: { r: 18, rc: 2, T1: 300 }, record: true }] },
  'heat-engine-11': { say: '自訂、雙原子、n 0.71：頂點 (5.7 L, 210 kPa)、(3.3, 1000)、(7.4, 1000)、(25, 80)', steps: [{ type: 'custom', n: 0.71, pts: [[5.7, 210], [3.3, 1000], [7.4, 1000], [25, 80]] }] },
  'heat-engine-12': { say: '奧圖、單原子、n 2、r 14、T1 200 K、T3 1360 K', steps: [{ type: 'otto', gas: 'mono', n: 2, otto: { r: 14, T1: 200, T3: 1360 } }] },
  'heat-engine-h1': { say: '自訂 8 字形（蝴蝶結）：(4, 300)、(14, 900)、(14, 300)、(4, 900)', steps: [{ type: 'custom', pts: [[4, 300], [14, 900], [14, 300], [4, 900]] }] },
  'heat-engine-h2': { say: '卡諾逆向 T_h 305 K、T_c 300 K', steps: [{ type: 'carnot', reverse: true, carnot: { Th: 305, Tc: 300 } }] },
  'heat-engine-h3': { say: '自訂：把預設長方形的頂點 2、4 拖成逆時針 (8,300)→(20,300)→(20,700)→(8,700)', steps: [{ type: 'custom', pts: [[8, 300], [20, 300], [20, 700], [8, 700]] }] }
};
console.log('\n每個任務的解答：');
let pub = 0, hid = 0;
missions.forEach(m => {
  if (m.hidden) hid += m.level; else pub += m.level;
  const s = SOL[m.id];
  if (!s) { bad(m.id + ' 沒有解答'); return; }
  const u = defaults(), rows = [];
  let ok = false, info = '';
  s.steps.forEach(st => {
    setUI(u, st);
    const ev = cycleEv(u), d = ev.data;
    info = d.engine ? 'η ' + (d.eta * 100).toFixed(3) + '%，η/η_C ' + (d.ratio * 100).toFixed(2) + '%，W ' + d.Wout.toFixed(1) + ' J，Q_in ' + d.Qin.toFixed(0) + ' J，T ' + d.Tmin.toFixed(0) + '–' + d.Tmax.toFixed(0) + ' K'
      : 'K_R ' + d.KR.toFixed(3) + '，W ' + d.Wout.toFixed(1) + ' J';
    if (hits(ev).indexOf(m.id) >= 0) ok = true;
    if (st.record) {
      rows.push(d);
      if (hits({ type: 'record', data: { row: d, rows: rows.slice() } }).indexOf(m.id) >= 0) ok = true;
    }
  });
  if (ok) console.log('  ✓ ' + m.id + '（' + m.level + ' 星' + (m.hidden ? '，隱藏' : '') + '）' + s.say + '　→ ' + info);
  else bad(m.id + ' 解答不成立：' + s.say + '　→ ' + info);
});
console.log('\n公開任務 ' + missions.filter(m => !m.hidden).length + ' 個共 ' + pub + ' 顆星；隱藏任務 ' + missions.filter(m => m.hidden).length + ' 個共 ' + hid + ' 顆星；合計 ' + (pub + hid) + ' 顆星。');

// ---- 3. 比較任務的反例：條件不符時不應完成 ----
console.log('\n反例：');
function neg(id, say, steps) {
  const u = defaults(), rows = [];
  let hit = false;
  steps.forEach(st => {
    setUI(u, st);
    const ev = cycleEv(u);
    if (hits(ev).indexOf(id) >= 0) hit = true;
    if (st.record) { rows.push(ev.data); if (hits({ type: 'record', data: { row: ev.data, rows: rows.slice() } }).indexOf(id) >= 0) hit = true; }
  });
  if (hit) bad(id + ' 不該完成：' + say); else console.log('  ✓ ' + id + ' 不完成：' + say);
}
neg('heat-engine-7', '奧圖 r 12（雙原子）與狄塞爾 r 18', [{ type: 'otto', otto: { r: 12 }, record: true }, { type: 'diesel', diesel: { r: 18 }, record: true }]);
neg('heat-engine-7', '壓縮比相同但氣體不同', [{ type: 'otto', otto: { r: 12 }, record: true }, { type: 'diesel', gas: 'mono', diesel: { r: 12 }, record: true }]);
neg('heat-engine-8', '回熱器開、關但體積比不同', [{ type: 'stirling', regen: true, record: true }, { type: 'stirling', regen: false, stirling: { r: 4 }, record: true }]);
neg('heat-engine-10', '最高溫差太多（奧圖 T3 1800、狄塞爾預設）', [{ type: 'otto', record: true }, { type: 'diesel', record: true }]);
neg('heat-engine-12', '史特林加回熱器（本來就等於卡諾）', [{ type: 'stirling', regen: true, n: 2, stirling: { Th: 1200, Tc: 300, r: 8 } }]);
neg('heat-engine-h3', '自訂預設長方形（順時針）', [{ type: 'custom' }]);
neg('heat-engine-h1', '自訂長方形（沒有交叉）', [{ type: 'custom' }]);

console.log(fail ? '\n有 ' + fail + ' 個問題。' : '\n全部通過。');
process.exitCode = fail ? 1 : 0;
