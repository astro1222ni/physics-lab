/* 任務可達成的證明腳本。用法：node tools/mission-proofs/ac-generator.js
 * 用物理核心（js/ac-generator-core.js）重現頁面送出的事件，證明每個任務都做得到，
 * 而且每個解答的滑桿值都在 ac-generator.html 的範圍內、精度不超過 data-decimals（對數滑桿用頁面註冊的範圍與精度）；
 * 另外確認：預設狀態、只切換模式或電源、只轉動預設線圈、只記錄預設設定，都不會完成任何任務。
 * 修改物理核心、滑桿範圍或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const fs = require('fs'), vm = require('vm');
const C = require(__ROOT + 'js/ac-generator-core.js');

let missions = [];
let fail = 0;
const LM = { register: (id, list) => { missions = list; } };
vm.runInNewContext(fs.readFileSync(__ROOT + 'js/missions/ac-generator.js', 'utf8'), { window: { LabMission: LM }, LabMission: LM });

// ---- 從 HTML 讀滑桿的範圍、預設值與精度 ----
const html = fs.readFileSync(__ROOT + 'ac-generator.html', 'utf8');
const SL = {};
html.replace(/<input id="(\w+)" type="range"([^>]*)>/g, (m, id, rest) => {
  const a = k => { const r = new RegExp(k + '="([^"]*)"').exec(rest); return r ? r[1] : null; };
  SL[id] = { min: +a('min'), max: +a('max'), step: +a('step'), value: +a('value'), dec: a('data-decimals') == null ? null : +a('data-decimals') };
});
// 對數滑桿：js/ac-generator.js 用 LabNum.register 設定的範圍、精度與預設值（頁面載入時用 LabNum.set 設定）
const LOG = { gR: { min: 1, max: 1e4, dec: 1, value: 20 }, xRL: { min: 1, max: 1e4, dec: 2, value: 50 }, tK2: { min: 1, max: 5000, dec: 1, value: 100 }, tP: { min: 0.1, max: 100, dec: 3, value: 20 } };
const js = fs.readFileSync(__ROOT + 'js/ac-generator.js', 'utf8');
Object.keys(LOG).forEach(id => {
  const L = LOG[id];
  const m = new RegExp("logSlider\\('" + id + "', ([\\d.e]+), ([\\d.e]+), (\\d)\\)").exec(js);
  if (!m || +m[1] !== L.min || +m[2] !== L.max || +m[3] !== L.dec) { fail++; console.log('  ✗ 對數滑桿 ' + id + ' 的註冊和證明腳本不一致'); }
  SL[id] = { min: L.min, max: L.max, value: L.value, dec: L.dec };
});

const bad = msg => { fail++; console.log('  ✗ ' + msg); };
function inRange(id, v) {
  const s = SL[id];
  if (!s) { bad('找不到滑桿 ' + id); return; }
  if (v < s.min - 1e-9 || v > s.max + 1e-9) bad(id + ' = ' + v + ' 超出範圍 ' + s.min + '–' + s.max);
  const dec = s.dec == null ? 2 : s.dec;
  if (Math.abs(Math.round(v * Math.pow(10, dec)) - v * Math.pow(10, dec)) > 1e-6) bad(id + ' = ' + v + ' 的小數位數超過 ' + dec);
}
const round = (v, d) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);

// ---- 頁面狀態（與 js/ac-generator.js 的 genParams／recompute 相同） ----
const IDS = ['gN', 'gB', 'gL', 'gW', 'gF', 'gR', 'gr', 'xV', 'xF', 'xN1', 'xN2', 'xRL', 'tVg', 'tK1', 'tRl', 'tK2', 'tP'];
function defaults() {
  const u = { comm: false, open: false, xsrc: 'ac', vrated: 110, theta: 0, paused: false, revs: 0 };
  IDS.forEach(id => { u[id] = SL[id].value; });
  return u;
}
function setUI(u, ch) {
  Object.keys(ch).forEach(k => { if (IDS.includes(k)) inRange(k, ch[k]); u[k] = ch[k]; });
  return u;
}
const genP = u => ({ N: u.gN, B: u.gB, L: u.gL / 100, w: u.gW / 100, f: u.gF, R: u.open ? Infinity : u.gR, r: u.gr, commutator: u.comm });
function genEv(u) {
  const G = C.gen(genP(u));
  return { type: 'gen', data: Object.assign(C.genReport(G), { mode: 'gen', theta: u.theta, paused: u.paused, revs: u.revs }) };
}
function xfObj(u) {
  if (u.xsrc === 'gen') return C.xf({ N1: u.xN1, N2: u.xN2, RL: u.xRL, source: 'gen', gen: C.gen(Object.assign(genP(u), { commutator: false })) });
  if (u.xsrc === 'dc') return C.xf({ N1: u.xN1, N2: u.xN2, RL: u.xRL, source: 'dc', V1: u.xV });
  return C.xf({ N1: u.xN1, N2: u.xN2, RL: u.xRL, source: 'ac', V1: u.xV, f: u.xF });
}
function xfEv(u) {
  const X = xfObj(u), dcm = u.xsrc === 'dc';
  const o = Object.assign(C.xfReport(X), { mode: 'xf', dcOn: dcm && !!u.dcOn, steady: dcm && !!u.dcOn && !!u.steady, pulsed: dcm && !!u.pulsed });
  if (u.xsrc === 'gen') { const G = C.gen(genP(u)); o.genF = G.f; o.genEpsRms = G.epsRms; o.genR = G.r; }
  return { type: 'xf', data: o };
}
const gridQ = u => C.grid({ Vg: u.tVg * 1e3, k1: u.tK1, Rline: u.tRl, k2: u.tK2, Prated: u.tP * 1e6, Vrated: u.vrated });
const gridEv = u => ({ type: 'grid', data: Object.assign(C.gridReport(gridQ(u)), { mode: 'grid' }) });
function recordEv(rowsU) {
  const rows = rowsU.map(u => Object.assign(C.gridReport(gridQ(u)), { mode: 'grid' }));
  return { type: 'record', data: { mode: 'grid', row: rows[rows.length - 1], rows: rows } };
}
function hits(ev) { return missions.filter(m => { try { return m.check(ev, {}); } catch (e) { return false; } }).map(m => m.id); }
/** 讓用戶電壓剛好是 V 的降壓比（取到滑桿精度） */
function k2Fit(u, V) {
  const k = C.k2For({ Vg: u.tVg * 1e3, k1: u.tK1, Rline: u.tRl, Prated: u.tP * 1e6, Vrated: u.vrated }, V);
  return k == null ? null : round(k, SL.tK2.dec);
}

// ---- 1. 預設狀態不會完成任務 ----
console.log('預設狀態、只切換模式或電源、只轉動預設線圈：');
const dcases = [
  ['發電機預設（播放中、θ = 0°）', genEv(defaults())],
  ['發電機預設，轉完 3 圈', genEv(setUI(defaults(), { revs: 3 }))],
  ['發電機預設，暫停在 θ = 0°', genEv(setUI(defaults(), { paused: true }))],
  ['發電機預設，只換成換向器（未轉完一圈）', genEv(setUI(defaults(), { comm: true }))],
  ['發電機預設，只勾開路（未轉完一圈）', genEv(setUI(defaults(), { open: true }))],
  ['變壓器預設（交流 110 V）', xfEv(defaults())],
  ['變壓器預設，電源換成發電機', xfEv(setUI(defaults(), { xsrc: 'gen' }))],
  ['變壓器預設，電源換成電池（還沒接通）', xfEv(setUI(defaults(), { xsrc: 'dc' }))],
  ['輸電預設（額定 110 V）', gridEv(defaults())],
  ['輸電預設，額定改 220 V', gridEv(setUI(defaults(), { vrated: 220 }))],
  ['輸電預設記錄兩次', recordEv([defaults(), defaults()])]
];
dcases.forEach(c => {
  const h = hits(c[1]);
  if (h.length) bad(c[0] + ' 就完成了 ' + h.join('、')); else console.log('  ✓ ' + c[0] + '：沒有完成任何任務');
});
{
  const G = C.gen(genP(defaults())), X = xfObj(defaults()), Q = gridQ(defaults());
  console.log('  （參考）預設 ε_max = ' + G.epsMax.toFixed(2) + ' V、τ_max = ' + G.tauMax.toFixed(3) + ' N·m；變壓器 V_2 = ' + X.V2.toFixed(1) + ' V；輸電 V_u = ' + Q.Vu.toFixed(1) + ' V、η = ' + (Q.eff * 100).toFixed(1) + '%');
}

// ---- 2. 每個任務的解答 ----
console.log('\n每個任務的解答：');
const sol = {};
// 1：ε_max = NBAω = 100 V → f = 100/(2π NBA)
sol['ac-generator-1'] = () => { const f = round(100 / (2 * Math.PI * 100 * 0.2 * 0.02), 2); return { say: '預設線圈，f = ' + f + ' Hz', ev: [genEv(setUI(defaults(), { gF: f }))] }; };
sol['ac-generator-2'] = () => ({ say: '換向器，其餘預設，轉完 1 圈', ev: [genEv(setUI(defaults(), { comm: true, revs: 1 }))] });
sol['ac-generator-3'] = () => ({ say: '交流 110 V，N1 = 200、N2 = 400', ev: [xfEv(setUI(defaults(), { xN2: 400 }))] });
sol['ac-generator-4'] = () => ({ say: '預設，暫停在 θ = 90°', ev: [genEv(setUI(defaults(), { theta: 90, paused: true }))] });
sol['ac-generator-5'] = () => ({ say: '電池，接通開關後等到穩定', ev: [xfEv(setUI(defaults(), { xsrc: 'dc', dcOn: true, pulsed: true, steady: true }))] });
sol['ac-generator-6'] = () => ({ say: 'N = 300、B = 0.5 T，其餘預設', ev: [genEv(setUI(defaults(), { gN: 300, gB: 0.5 }))] });
sol['ac-generator-7'] = () => {
  const u = setUI(defaults(), { gF: 60, gB: 0.25 });
  const G = C.gen(genP(u)), x = 110 / G.epsRms;           // R/(R + r) = V_R/ε_rms
  const R = round(x * u.gr / (1 - x), 1);
  setUI(u, { gR: R });
  return { say: 'f = 60 Hz、B = 0.25 T、r = 2 Ω、R = ' + R + ' Ω', ev: [genEv(u)] };
};
sol['ac-generator-8'] = () => ({ say: '交流 110 V，N1 = 550、N2 = 60、R_L = 6 Ω', ev: [xfEv(setUI(defaults(), { xN1: 550, xN2: 60, xRL: 6 }))] });
sol['ac-generator-9'] = () => {
  const u = setUI(defaults(), { tK1: 15 });
  const k2 = k2Fit(u, 110); setUI(u, { tK2: k2 });
  return { say: 'k1 = 15、k2 = ' + k2, ev: [gridEv(u)] };
};
sol['ac-generator-10'] = () => {
  const a = setUI(defaults(), { tK1: 15 }); setUI(a, { tK2: k2Fit(a, 110) });
  const b = setUI(defaults(), { tK1: 30 }); setUI(b, { tK2: k2Fit(b, 110) });
  return { say: '記錄 k1 = 15、k2 = ' + a.tK2 + '，再記錄 k1 = 30、k2 = ' + b.tK2, ev: [recordEv([a, b])] };
};
sol['ac-generator-11'] = () => ({
  say: '發電機 N = 300、B = 0.5 T、20 × 10 cm、60 Hz、r = 2 Ω；變壓器 N1 = 800、N2 = 220、R_L = 90 Ω',
  ev: [xfEv(setUI(defaults(), { xsrc: 'gen', gN: 300, gB: 0.5, gF: 60, xN1: 800, xN2: 220, xRL: 90 }))]
});
sol['ac-generator-12'] = () => {
  const u = setUI(defaults(), { tVg: 11.5, tK1: 30, tRl: 10, tP: 55, vrated: 220 });
  const k2 = k2Fit(u, 220); setUI(u, { tK2: k2 });
  return { say: 'V_g = 11.5 kV、k1 = 30、R_line = 10 Ω、額定 220 V、55 MW、k2 = ' + k2, ev: [gridEv(u)] };
};
sol['ac-generator-h1'] = () => ({ say: '開路，N = 400、B = 0.5 T，轉完 1 圈', ev: [genEv(setUI(defaults(), { open: true, gN: 400, gB: 0.5, revs: 1 }))] });
sol['ac-generator-h2'] = () => ({ say: '交流 110 V，N1 = N2 = 200', ev: [xfEv(setUI(defaults(), { xN2: 200 }))] });
sol['ac-generator-h3'] = () => ({ say: 'R = r = 2 Ω，其餘預設', ev: [genEv(setUI(defaults(), { gR: 2 }))] });

let pub = 0, hid = 0;
missions.forEach(m => {
  const stars = (m.hidden ? 2 : 1) * m.level;
  if (m.hidden) hid += stars; else pub += stars;
  const f = sol[m.id];
  if (!f) { bad(m.id + ' 沒有解答'); return; }
  const s = f();
  const ok = s.ev.some(ev => m.check(ev, {}));
  const d = s.ev[s.ev.length - 1].data;
  const info = d.epsMax != null ? 'ε_max = ' + d.epsMax.toFixed(2) + ' V、V_R = ' + d.VRrms.toFixed(2) + ' V、τ_max = ' + d.tauMax.toFixed(3) + ' N·m、P_R = ' + d.PR.toFixed(2) + ' W'
    : d.V2 != null ? 'V1 = ' + d.V1.toFixed(2) + ' V、V2 = ' + d.V2.toFixed(2) + ' V、P2 = ' + d.P2.toFixed(1) + ' W、B_core = ' + d.Bcore.toFixed(3) + ' T'
      : d.rows ? d.rows.map(r => 'k1 ' + r.k1 + '：P_u ' + (r.Pu / 1e6).toFixed(3) + ' MW、線損 ' + (r.Ploss / 1e3).toFixed(1) + ' kW').join('；') + '，線損比 ' + (d.rows[1].Ploss / d.rows[0].Ploss).toFixed(4)
        : 'V_L = ' + (d.VL / 1e3).toFixed(1) + ' kV、V_u = ' + d.Vu.toFixed(2) + ' V、P_u = ' + (d.Pu / 1e6).toFixed(2) + ' MW、η = ' + (d.eff * 100).toFixed(3) + '%';
  if (ok) console.log('  ✓ ' + m.id + '（' + m.level + ' 級，' + stars + ' 星' + (m.hidden ? '，隱藏' : '') + '）' + s.say + '　→ ' + info);
  else bad(m.id + ' 的解答沒有完成任務：' + s.say + '　→ ' + info);
});
console.log('\n公開任務 ' + missions.filter(m => !m.hidden).length + ' 個共 ' + pub + ' 顆星；隱藏任務 ' + missions.filter(m => m.hidden).length + ' 個共 ' + hid + ' 顆星（等級 × 2）；合計 ' + (pub + hid) + ' 顆星。');

// ---- 3. 反例 ----
console.log('\n反例：');
const counter = [
  ['ac-generator-3', '交流 110 V，N1 = 20、N2 = 40（V_2 對了，但鐵心飽和）', xfEv(setUI(defaults(), { xN1: 20, xN2: 40 }))],
  ['ac-generator-3', '電源換成發電機也不算', xfEv(setUI(defaults(), { xsrc: 'gen', gN: 300, gB: 0.5, gF: 60, xN1: 800, xN2: 220, xRL: 90 }))],
  ['ac-generator-4', '停在 θ = 90° 但沒有暫停（播放中）', genEv(setUI(defaults(), { theta: 90 }))],
  ['ac-generator-4', '暫停在 θ = 85°', genEv(setUI(defaults(), { theta: 85, paused: true }))],
  ['ac-generator-5', '電池接通但還沒穩定', xfEv(setUI(defaults(), { xsrc: 'dc', dcOn: true, pulsed: true, steady: false }))],
  ['ac-generator-6', '同樣 N = 300、B = 0.5 T，但 R = 5 Ω', genEv(setUI(defaults(), { gN: 300, gB: 0.5, gR: 5 }))],
  ['ac-generator-7', '任務 7 的解答改用換向器', (() => { const u = setUI(defaults(), { gF: 60, gB: 0.25 }); const G = C.gen(genP(u)); const x = 110 / G.epsRms; setUI(u, { gR: round(x * 2 / (1 - x), 1), comm: true }); return genEv(u); })()],
  ['ac-generator-7', '開路時 V_R = ε_rms（R 不算數）', genEv(setUI(defaults(), { gF: 60, gB: 0.25, open: true, gN: 83 }))],
  ['ac-generator-8', 'V_2 = 12 V 但 R_L = 12 Ω（P_2 只有 12 W）', xfEv(setUI(defaults(), { xN1: 550, xN2: 60, xRL: 12 }))],
  ['ac-generator-9', 'k1 = 1（電壓到不了 110 V）', gridEv(setUI(defaults(), { tK2: 1 }))],
  ['ac-generator-10', 'k1 加倍但沒有調整 k2（用戶功率變了）', (() => { const a = setUI(defaults(), { tK1: 15 }); setUI(a, { tK2: k2Fit(a, 110) }); const b = setUI(defaults(), { tK1: 30, tK2: a.tK2 }); return recordEv([a, b]); })()],
  ['ac-generator-10', '只記錄一筆', (() => { const a = setUI(defaults(), { tK1: 15 }); setUI(a, { tK2: k2Fit(a, 110) }); return recordEv([a]); })()],
  ['ac-generator-12', '同樣的設定但 R_line = 5 Ω', (() => { const u = setUI(defaults(), { tVg: 11.5, tK1: 30, tRl: 5, tP: 55, vrated: 220 }); setUI(u, { tK2: k2Fit(u, 220) }); return gridEv(u); })()],
  ['ac-generator-h1', '開路但還沒轉完一圈', genEv(setUI(defaults(), { open: true, gN: 400, gB: 0.5 }))],
  ['ac-generator-h2', '直流電源 N1 = N2', xfEv(setUI(defaults(), { xsrc: 'dc', xN2: 200, dcOn: true, pulsed: true, steady: true }))],
  ['ac-generator-h3', 'R = 2.2 Ω、r = 2 Ω（差 10%）', genEv(setUI(defaults(), { gR: 2.2 }))]
];
counter.forEach(c => {
  const m = missions.find(x => x.id === c[0]);
  if (!m) { bad('找不到 ' + c[0]); return; }
  if (m.check(c[2], {})) bad(c[0] + ' 不該完成：' + c[1]); else console.log('  ✓ ' + c[0] + ' 不完成：' + c[1]);
});

console.log(fail ? '\n有 ' + fail + ' 個問題。' : '\n全部通過。');
process.exitCode = fail ? 1 : 0;
