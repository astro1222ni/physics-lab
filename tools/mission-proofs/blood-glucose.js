/* 任務可達成的證明腳本。用法：node tools/mission-proofs/blood-glucose.js
 * 用核心（js/blood-glucose-core.js）照頁面的做法算出 'glu-day'、'ogtt' 事件（與 js/blood-glucose.js 相同的計算），
 * 再用任務檔（js/missions/blood-glucose.js）同一份 check 函式判定。每個任務都給出一組做得到的操作與對照組，
 * 並檢查三種人、五位病人的預設按鈕不會直接完成高等級任務。修改核心、頁面的事件或任務條件後重跑。 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const B = require(ROOT + 'js/blood-glucose-core.js');

const defs = [];
const fakeLM = { register: function (id, list) { list.forEach(m => defs.push(Object.assign({ mem: {} }, m))); } };
new Function('window', 'LabMission', fs.readFileSync(ROOT + 'js/missions/blood-glucose.js', 'utf8'))({ LabMission: fakeLM }, fakeLM);
const byId = {};
defs.forEach(m => { byId[m.id.replace('blood-glucose-', '')] = m; });
const check = (id, ev) => byId[id].check(ev, {});
const all = ev => defs.filter(m => m.check(ev, {})).map(m => m.id.replace('blood-glucose-', ''));

const out = [];
let fail = 0;
function claim(ok, msg) { out.push((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; }

// ---------- 與 js/blood-glucose.js 相同的事件 ----------
const MEAL_T = [420, 720, 1080, 1320];
const crOf = beta => beta < 0.05 ? B.TYPES.t1.cr : 1;
const BASE = { beta: 1, si: 1, g: [60, 80, 80, 0], basalU: 0, ratio: 0, lead: 0, exT: 17 * 60, exD: 0, exE: 0.6 };
const TYPE = { normal: { beta: 1, si: 1 }, t2: { beta: B.TYPES.t2.beta, si: B.TYPES.t2.si }, t1: { beta: 0, si: B.TYPES.t1.si } };
function dayEv(o) {
  o = Object.assign({}, BASE, o);
  const meals = MEAL_T.map((t, i) => ({ t: t, g: o.g[i] }));
  const bolus = o.ratio > 0 ? meals.filter(m => m.g > 0).map(m => ({ t: ((m.t - o.lead) % 1440 + 1440) % 1440, u: m.g / 10 * o.ratio })) : [];
  const ex = o.exD > 0 && o.exE > 0 ? [{ t: o.exT, dur: o.exD, e: o.exE }] : [];
  const r = B.day({ beta: o.beta, si: o.si, cr: crOf(o.beta), bw: 60, meals: meals, bolus: bolus, basalU: o.basalU, ex: ex });
  const s = r.stats;
  return {
    type: 'glu-day', data: {
      beta: o.beta, si: o.si, type: 'x', meals: o.g.slice(), basalU: o.basalU, ratio: o.ratio, lead: o.lead, exT: o.exT, exD: o.exD, exE: o.exE,
      mean: s.mean, min: s.min, max: s.max, tir: s.tir, tbr: s.tbr, tar: s.tar, a1c: s.a1c, urine: r.urine, fast: r.G[420],
      totalU: o.basalU + bolus.reduce((a, b) => a + b.u, 0), insulin: o.basalU > 0 || o.ratio > 0
    }
  };
}
function ogttEv(beta, si) {
  const r = B.ogtt({ bw: 60, beta: beta, si: si, cr: crOf(beta) }, 75);
  let pk = 0; for (let t = 0; t <= 120; t++) pk = Math.max(pk, r.G[t]);
  return { type: 'ogtt', data: { beta: beta, si: si, g0: r.G[0], g30: r.G[30], g60: r.G[60], g90: r.G[90], g120: r.G[120], peak: pk, dx: B.diagnose(r.G[0], r.G[120]) } };
}
const fmt = e => { const d = e.data; return d.dx ? `空腹 ${d.g0.toFixed(0)}、2 小時 ${d.g120.toFixed(0)}、最高 ${d.peak.toFixed(0)}、${d.dx}` : `平均 ${d.mean.toFixed(0)}、${d.min.toFixed(0)}–${d.max.toFixed(0)}、TIR ${(d.tir * 100).toFixed(1)}%、A1C ${d.a1c.toFixed(2)}、尿糖 ${d.urine.toFixed(1)} g、空腹 ${d.fast.toFixed(0)}`; };

// ---------- 每個任務 ----------
let e;
e = ogttEv(1, 1); claim(check('1', e), '1 健康的人做試驗 → 正常（' + fmt(e) + '）');
e = ogttEv(0.6, 0.6); claim(check('2', e), '2 β 0.6、敏感度 0.6 → 前期（' + fmt(e) + '）');
claim(!check('2', ogttEv(1, 1)), '2 對照：健康的人不是前期');
e = dayEv({ g: [60, 80, 150, 0] }); claim(check('3', e), '3 健康的人晚餐 150 g（' + fmt(e) + '）');
e = dayEv({ g: [60, 80, 200, 0] }); claim(!check('3', e), '3 對照：晚餐 200 g 就超過 180（' + fmt(e) + '）');
e = dayEv({ beta: 0.4, si: 0.5, g: [100, 150, 150, 0] }); claim(check('4', e), '4 β 0.4、敏感度 0.5 的人吃很多（' + fmt(e) + '）');
e = dayEv(TYPE.t2); claim(!check('4', e), '4 對照：第二型預設空腹已超過 126（' + fmt(e) + '）');
e = dayEv(Object.assign({}, TYPE.t1, { g: [0, 0, 0, 0], basalU: 13 })); claim(check('5', e), '5 第一型不吃、長效 13 U（' + fmt(e) + '）');
e = dayEv(Object.assign({}, TYPE.t1, { g: [0, 0, 0, 0], basalU: 15 })); claim(!check('5', e), '5 對照：長效 15 U 太多（' + fmt(e) + '）');
e = dayEv(Object.assign({}, TYPE.t2, { g: [30, 30, 30, 0] })); claim(check('6', e), '6 第二型三餐各 30 g（' + fmt(e) + '）');
e = dayEv(Object.assign({}, TYPE.t2, { g: [60, 80, 80, 0] })); claim(!check('6', e), '6 對照：第二型照常吃（' + fmt(e) + '）');
e = ogttEv(2.2, 0.3); claim(check('7', e), '7 敏感度 0.3、β 2.2 → 正常（' + fmt(e) + '）');
e = ogttEv(1, 0.3); claim(!check('7', e), '7 對照：β 1 就補不過來（' + fmt(e) + '）');
e = dayEv(Object.assign({}, TYPE.t1, { basalU: 14, ratio: 0.65 })); claim(check('8', e), '8 第一型長效 14 U、每 10 g 0.65 U（' + fmt(e) + '）');
e = dayEv(Object.assign({}, TYPE.t1, { basalU: 14 })); claim(!check('8', e), '8 對照：只打長效（' + fmt(e) + '）');
e = dayEv(Object.assign({}, TYPE.t2, { ratio: 2 })); claim(check('9', e), '9 第二型每 10 g 打 2 U（' + fmt(e) + '）');
e = dayEv(Object.assign({}, TYPE.t2, { basalU: 10 })); claim(!check('9', e), '9 對照：只打長效 10 U（' + fmt(e) + '）');
e = dayEv(Object.assign({}, TYPE.t1, { basalU: 11, ratio: 0.8, lead: 15, exT: 600, exD: 60, exE: 0.5 })); claim(check('10', e), '10 第一型運動前減量（' + fmt(e) + '）');
e = dayEv(Object.assign({}, TYPE.t1, { basalU: 14, ratio: 0.65, exT: 780, exD: 60, exE: 0.6 })); claim(!check('10', e), '10 對照：照常打針、午餐後運動 → 低血糖（' + fmt(e) + '）');
e = dayEv(Object.assign({}, TYPE.t1, { g: [60, 80, 150, 0], basalU: 12, ratio: 10 / 12, lead: 30 })); claim(check('11', e), '11 晚餐 150 g、飯前 30 分鐘打（' + fmt(e) + '）');
e = dayEv(Object.assign({}, TYPE.t1, { g: [60, 80, 150, 0], basalU: 12, ratio: 10 / 12, lead: 0 })); claim(!check('11', e), '11 對照：吃飯時才打（' + fmt(e) + '）');
e = dayEv(Object.assign({}, TYPE.t1, { g: [60, 80, 80, 30], basalU: 11, ratio: 0.8, lead: 30, exT: 600, exD: 30, exE: 0.5 })); claim(check('12', e), '12 第一型完美的一天（' + fmt(e) + '）');
e = dayEv(Object.assign({}, TYPE.t1, { g: [60, 80, 80, 30], basalU: 11, ratio: 0.8, lead: 0, exT: 600, exD: 30, exE: 0.5 })); claim(!check('12', e), '12 對照：不提前打（' + fmt(e) + '）');
e = dayEv(Object.assign({}, TYPE.t1, { basalU: 14, ratio: 2 })); claim(check('h1', e), 'h1 速效打太多 → 低於 54（' + fmt(e) + '）');
e = ogttEv(0, 0.6); claim(check('h2', e), 'h2 第一型做試驗（' + fmt(e) + '）');
e = ogttEv(2, 2); claim(check('h3', e), 'h3 β 2、敏感度 2（' + fmt(e) + '）');
claim(!check('h3', ogttEv(1, 1)), 'h3 對照：健康的人最高超過 125');

// ---------- 可行範圍（粗格點掃描，確認高等級任務不是一兩下就做到） ----------
function scan(id, gen) { let n = 0, ok = 0; gen(o => { n++; if (check(id, dayEv(o))) ok++; }); return [ok, n]; }
const t1Grid = (extra, f) => { for (const basalU of [0, 8, 11, 12, 13, 14, 15, 18]) for (const ratio of [0, 0.5, 0.65, 0.8, 1, 1.5]) for (const lead of [0, 15, 30]) f(Object.assign({}, TYPE.t1, { basalU, ratio, lead }, extra)); };
let s = scan('8', f => t1Grid({}, f)); claim(s[0] > 0 && s[0] / s[1] < 0.4, `8 第一型治療格點中可行 ${s[0]}/${s[1]}`);
s = scan('10', f => { for (const exT of [600, 780, 1200]) t1Grid({ exT, exD: 60, exE: 0.5 }, f); }); claim(s[0] > 0 && s[0] / s[1] < 0.2, `10 運動格點中可行 ${s[0]}/${s[1]}`);
s = scan('11', f => t1Grid({ g: [60, 80, 150, 0] }, f)); claim(s[0] > 0 && s[0] / s[1] < 0.15, `11 大餐格點中可行 ${s[0]}/${s[1]}`);
s = scan('12', f => { for (const exT of [600, 900, 1200]) t1Grid({ g: [60, 80, 80, 30], exT, exD: 30, exE: 0.5 }, f); }); claim(s[0] > 0 && s[0] / s[1] < 0.1, `12 完美格點中可行 ${s[0]}/${s[1]}`);

// ---------- 預設按鈕不會直接完成高等級任務 ----------
Object.keys(TYPE).forEach(k => {
  const got = all(dayEv(TYPE[k])).filter(id => byId[id].level >= 4);
  claim(got.length === 0, `「${k}」預設（三餐 60／80／80、不打針）不會直接完成 4 級以上任務` + (got.length ? '：' + got.join(',') : ''));
});
const PATS = { normal: [1, 1], comp: [2.2, 0.4], pre: [0.6, 0.6], t2: [TYPE.t2.beta, TYPE.t2.si], t1: [0, TYPE.t1.si] };
Object.keys(PATS).forEach(k => {
  const got = all(ogttEv(PATS[k][0], PATS[k][1])).filter(id => byId[id].level >= 3);
  claim(got.length === 0 || (k === 't1' && got.join() === 'h2'), `病人「${k}」不會直接完成 3 級以上的公開任務` + (got.length ? '（' + got.join(',') + '）' : ''));
});

console.log(out.join('\n'));
console.log(fail ? `✗ ${fail} 項不成立` : '全部成立');
process.exitCode = fail ? 1 : 0;
