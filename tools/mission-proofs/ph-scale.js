/* 任務可達成的證明腳本。用法：node tools/mission-proofs/ph-scale.js
 * 用化學核心模擬頁面（js/ph-scale.js）的操作與事件：兩杯的物質、濃度滑桿（log C 到小數第 2 位）、溫度滑桿（整數 °C）、
 * 「測量並記錄」送 'measure'、「加水稀釋 10 倍」送 'dilute'（連續稀釋的次數 k；改物質、濃度或溫度就重新算起）、
 * 未知酸「核對答案」送 'answer'。學生的讀數照頁面顯示的位數（pH 兩位小數、[H3O+] 三位有效數字）。
 * 確認每個任務都做得到、預設狀態不觸發任務、每個隱藏任務都有「只完成它自己」的做法。修改化學核心、頁面事件或任務條件後重跑。 */
'use strict';
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const P = require(__ROOT + 'js/ph-scale-core.js');
let missions = [];
global.LabMission = { register: (m, l) => { missions = l.map(x => Object.assign({}, x)); } };
global.window = { LabMission: global.LabMission };
require(__ROOT + 'js/missions/ph-scale.js');

let bad = 0;
const done = {};
const hid = id => /-h\d+$/.test(id);
const r2 = x => Math.round(x * 100) / 100;

// ---------- 模擬頁面（與 js/ph-scale.js 的 measure／dilute／checkAnswer 一致） ----------
function newPage(rng) {
  missions.forEach(m => { m.done = false; m.mem = {}; });
  return { b: { A: { sp: 'HCl', logC: -2 }, B: { sp: 'CH3COOH', logC: -1 } }, T: 25, unk: P.newUnknown(rng), revealed: false, tries: 0, chain: { A: null, B: null }, events: [] };
}
function sol(pg, id) { const b = pg.b[id]; return P.solution(b.sp, b.logC, pg.T, pg.unk.Ka); }
function emit(pg, type, data) {
  const ev = { type, data };
  missions.forEach(m => { if (!m.done && m.check(ev, m.mem)) { m.done = true; pg.events.push(m.id); } });
}
function setSp(pg, id, sp) { if (pg.b[id].sp !== sp) { pg.b[id].sp = sp; pg.chain[id] = null; } }
function setC(pg, id, lc) { lc = r2(Math.max(-8, Math.min(0, lc))); if (lc !== pg.b[id].logC) { pg.b[id].logC = lc; pg.chain[id] = null; } }
function setT(pg, T) { T = Math.round(T); if (T !== pg.T) { pg.T = T; pg.chain.A = pg.chain.B = null; } }
function measure(pg) {
  const a = sol(pg, 'A'), b = sol(pg, 'B');
  emit(pg, 'measure', { T: pg.T, pKw: a.pKw, neutral: a.neutral, ind: true, beakers: [Object.assign({}, a, { id: 'A' }), Object.assign({}, b, { id: 'B' })] });
  return { A: a, B: b };
}
function dilute(pg, id) {
  const b = pg.b[id];
  if (b.sp === 'water' || b.logC - 1 < -8 - 1e-9) throw new Error('不能再稀釋');
  const before = sol(pg, id), ch = pg.chain[id] || { logC0: before.logC, pH0: before.pH, alpha0: before.alpha, k: 0 };
  b.logC = r2(b.logC - 1);
  const after = sol(pg, id);
  ch.k++; pg.chain[id] = ch;
  emit(pg, 'dilute', { id, sp: b.sp, kind: after.kind, T: pg.T, k: ch.k, logC0: ch.logC0, pH0: ch.pH0, alpha0: ch.alpha0, pHprev: before.pH, alphaPrev: before.alpha,
    logC: after.logC, pH: after.pH, alpha: after.alpha, alphaLim: after.alphaLim, K: after.K, Kw: after.Kw, dpH: after.pH - before.pH });
  return { before, after };
}
function answer(pg, a) { pg.tries++; emit(pg, 'answer', { ans: a, err: Math.abs(a - pg.unk.pKa), revealed: pg.revealed, tries: pg.tries }); }
/** 頁面顯示的讀數：pH 兩位小數、[H3O+] 三位有效數字 */
const shown3 = x => +x.toPrecision(3);
/** 在 log C 的 0.01 格子上找讓 f(log C) 最小的值 */
function scan(lo, hi, f) { let best = null, bv = Infinity; for (let k = Math.round(lo * 100); k <= Math.round(hi * 100); k++) { const lc = k / 100, v = f(lc); if (v < bv) { bv = v; best = lc; } } return best; }

function report(name, pg, ids, only) {
  const okAll = ids.every(id => pg.events.includes(id));
  const extraHidden = pg.events.filter(e => hid(e) && !ids.includes(e));
  const ok = okAll && !(only && extraHidden.length);
  ids.forEach(id => { if (pg.events.includes(id)) done[id] = true; });
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + name + '：' + (pg.events.length ? pg.events.join('、') : '（沒有任務）') + (only && extraHidden.length ? '（順便完成了別的隱藏任務）' : ''));
  if (!ok) bad++;
}
const f2 = x => x.toFixed(2), f3 = x => x.toFixed(3);

// ---------- 0. 預設狀態 ----------
console.log('預設狀態');
{
  const pg = newPage();
  const ok = pg.events.length === 0;
  console.log('  ' + (ok ? '✓' : '✗') + ' 只載入頁面、不操作：沒有任何事件，也沒有任務完成');
  if (!ok) bad++;
  measure(pg);
  const h = pg.events.filter(hid);
  console.log('  ' + (!h.length ? '✓' : '✗') + ' 預設狀態直接按「測量並記錄」（A 0.010 M HCl、B 0.10 M 醋酸）：' + (pg.events.join('、') || '沒有') + '，隱藏任務 ' + (h.length ? h.join('、') : '沒有'));
  if (h.length) bad++;
  ['ph-scale-4', 'ph-scale-5', 'ph-scale-8'].forEach(id => { if (pg.events.includes(id)) { console.log('  ✗ 預設狀態就完成了 ' + id); bad++; } });
}

// ---------- 一般任務 ----------
console.log('一般任務');
let pg, r;
pg = newPage(); r = measure(pg);
report('預設 A 0.010 M HCl，pH ' + f2(r.A.pH), pg, ['ph-scale-1']);
pg = newPage(); setSp(pg, 'B', 'NaOH'); setC(pg, 'B', -2); r = measure(pg);
report('B 換 0.010 M NaOH，pH ' + f2(r.B.pH), pg, ['ph-scale-2']);
pg = newPage(); r = dilute(pg, 'A');
report('A 0.010 M HCl 稀釋 10 倍：pH ' + f2(r.before.pH) + ' → ' + f2(r.after.pH), pg, ['ph-scale-3']);
pg = newPage(); setC(pg, 'B', -2); r = measure(pg);
report('A HCl、B 醋酸都 0.010 M：pH ' + f2(r.A.pH) + ' 與 ' + f2(r.B.pH), pg, ['ph-scale-4']);
pg = newPage(); setSp(pg, 'B', 'NaOH'); setC(pg, 'B', -2); r = measure(pg);
report('A HCl、B NaOH 都 0.010 M：pH 相加 ' + f2(r.A.pH + r.B.pH), pg, ['ph-scale-5']);
{
  pg = newPage();
  const lc2 = Math.max(...Array.from({ length: 401 }, (_, k) => -4 + k / 100).filter(x => P.solution('CH3COOH', r2(x), 25).alpha >= 0.10).map(r2));
  setC(pg, 'B', lc2); r = measure(pg);
  report('B 醋酸 10^' + lc2 + ' M（最濃仍 ≥ 10%）：α = ' + (r.B.alpha * 100).toFixed(2) + '%', pg, ['ph-scale-6']);
}
pg = newPage(); r = dilute(pg, 'B');
report('B 0.10 M 醋酸稀釋 10 倍：pH +' + f3(r.after.pH - r.before.pH), pg, ['ph-scale-7']);
{
  pg = newPage(); setC(pg, 'A', -3);
  const target = P.solution('HCl', -3, 25).pH, lc = scan(-3, 0, x => Math.abs(P.solution('CH3COOH', x, 25).pH - target));
  setC(pg, 'B', lc); r = measure(pg);
  report('A HCl 10^-3 M、B 醋酸 10^' + lc + ' M：pH ' + f3(r.A.pH) + ' 與 ' + f3(r.B.pH), pg, ['ph-scale-8']);
}
{
  pg = newPage(); setSp(pg, 'B', 'NH3');
  const lc = scan(-4, 0, x => Math.abs(P.solution('NH3', x, 25).pH - 11)); setC(pg, 'B', lc); r = measure(pg);
  report('B 氨水 10^' + lc + ' M（' + sciS(Math.pow(10, lc)) + ' M）：pH ' + f3(r.B.pH), pg, ['ph-scale-9']);
}
function sciS(x) { return x.toPrecision(3); }
{
  pg = newPage(); setSp(pg, 'A', 'HF'); setC(pg, 'A', -3);
  const t = P.solution('HF', -3, 25).pH, lc = scan(-3, 0, x => Math.abs(P.solution('CH3COOH', x, 25).pH - t));
  setC(pg, 'B', lc); r = measure(pg);
  report('A HF 10^-3 M、B 醋酸 10^' + lc + ' M：pH ' + f3(r.A.pH) + ' 與 ' + f3(r.B.pH), pg, ['ph-scale-10']);
}
// 未知酸：學生的算法——用 0.10 M 的 HX 讀 [H3O+]（三位有效數字），Ka = [H3O+]([H3O+] − [OH-])/(C − [H3O+] + [OH-])
{
  let s = 11; const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const N = 80; let ok11 = 0, ok12 = 0, ok10 = 0, worst = 0, worst10 = 0, leak = 0;
  for (let k = 0; k < N; k++) {
    // 一般做法：0.10 M、讀 [H3O+]、答到小數第 2 位
    pg = newPage(rng); setSp(pg, 'A', 'HX'); setC(pg, 'A', -1); r = measure(pg);
    const pk = -Math.log10(P.kaFrom(shown3(r.A.h), r.A.C, r.A.Kw));
    answer(pg, r2(pk));
    worst = Math.max(worst, Math.abs(r2(pk) - pg.unk.pKa));
    if (pg.events.includes('ph-scale-11')) ok11++;
    if (pg.events.includes('ph-scale-12')) ok12++;
    if (pg.events.filter(hid).some(e => e !== 'ph-scale-h10')) leak++;
  }
  // 更準的做法（h10）：同一批未知酸，在 10^-3 ～ 1 M 之間挑 [H3O+] 讀數首位數字最大的濃度（三位有效數字的相對誤差最小），答到小數第 3 位
  s = 11;
  for (let k = 0; k < N; k++) {
    pg = newPage(rng); setSp(pg, 'A', 'HX');
    let best = -1, bm = 0;
    for (let lc = -300; lc <= 0; lc += 10) { const h = P.solution('HX', lc / 100, 25, pg.unk.Ka).h, m = shown3(h) / Math.pow(10, Math.floor(Math.log10(shown3(h)))); if (m > bm) { bm = m; best = lc / 100; } }
    setC(pg, 'A', best); r = measure(pg);
    const pk = -Math.log10(P.kaFrom(shown3(r.A.h), r.A.C, r.A.Kw));
    answer(pg, Math.round(pk * 1000) / 1000);
    worst10 = Math.max(worst10, Math.abs(Math.round(pk * 1000) / 1000 - pg.unk.pKa));
    if (pg.events.includes('ph-scale-h10') && !pg.events.filter(hid).some(e => e !== 'ph-scale-h10')) ok10++;
  }
  const okA = ok11 === N, okB = ok12 >= N * 0.9, okC = ok10 >= N * 0.9;
  console.log('  ' + (okA ? '✓' : '✗') + ' 未知酸 ' + N + ' 個：0.10 M、讀 [H3O+] 算 pKa、答到小數第 2 位，第一次核對誤差 ≤ 0.05（ph-scale-11）有 ' + ok11 + ' 個，最差 ' + worst.toFixed(4));
  console.log('  ' + (okB ? '✓' : '✗') + ' 同上，誤差 ≤ 0.01（ph-scale-12）有 ' + ok12 + ' 個');
  if (okA) done['ph-scale-11'] = true; else bad++;
  if (okB) done['ph-scale-12'] = true; else bad++;
  console.log('    （一般做法順便完成 h10 以外的隱藏任務：' + leak + ' 次）');
  console.log('  ' + (okC ? '✓' : '✗') + ' 隱藏 h10：挑 [H3O+] 讀數首位最大的濃度、答到小數第 3 位，誤差 ≤ 0.005 有 ' + ok10 + ' 個，最差 ' + worst10.toFixed(4));
  if (okC) done['ph-scale-h10'] = true; else bad++;
}

// ---------- 隱藏任務（每一個都要只完成它自己） ----------
console.log('隱藏任務（只完成它自己）');
pg = newPage(); setSp(pg, 'A', 'water'); measure(pg); setT(pg, 95); r = measure(pg);
report('A 純水先在 25 °C 量，接著（只升溫）在 95 °C 量：pH ' + f2(r.A.pH) + '（中性）', pg, ['ph-scale-h1'], true);
pg = newPage(); setC(pg, 'A', -5); dilute(pg, 'A'); dilute(pg, 'A'); r = dilute(pg, 'A');
report('A 10^-5 M HCl（pH 5.00）連續稀釋 3 次到 10^-8 M：pH ' + f3(r.after.pH), pg, ['ph-scale-h2'], true);
pg = newPage(); setC(pg, 'A', 0); setSp(pg, 'B', 'NaOH'); setC(pg, 'B', 0); r = measure(pg);
report('A 1 M HCl、B 1 M NaOH（25 °C）：pH ' + f3(r.A.pH) + ' 與 ' + f3(r.B.pH), pg, ['ph-scale-h3'], true);
pg = newPage(); setSp(pg, 'A', 'HCN'); setC(pg, 'A', -5.5); setSp(pg, 'B', 'water'); r = measure(pg);
report('A 10^-5.5 M HCN、B 純水（25 °C）：近似式 pH ' + f2(r.A.pHapprox) + '（比純水 ' + f2(r.B.pH) + ' 還高），正確 pH ' + f2(r.A.pH), pg, ['ph-scale-h4'], true);
pg = newPage(); setC(pg, 'A', -6); setSp(pg, 'B', 'HF'); setC(pg, 'B', -6); r = measure(pg);
report('A HCl、B HF 都 10^-6 M：pH ' + f3(r.A.pH) + ' 與 ' + f3(r.B.pH), pg, ['ph-scale-h5'], true);
{
  pg = newPage(); setSp(pg, 'B', 'NaOH');
  const ok = x => { const h = P.solution('NaOH', x, 100); return h.pH < 7 && h.oh >= 10 * h.h; };
  const cands = Array.from({ length: 801 }, (_, k) => r2(-8 + k / 100)).filter(ok);
  const lc = cands[Math.floor(cands.length / 2)];
  setC(pg, 'B', lc); const r25 = measure(pg); setT(pg, 100); r = measure(pg);
  report('B NaOH 10^' + lc + ' M：25 °C pH ' + f2(r25.B.pH) + '，加熱到 100 °C pH ' + f2(r.B.pH) + '（[OH-]/[H3O+] = ' + (r.B.oh / r.B.h).toFixed(1) + '；可行範圍 10^' + cands[0] + ' ～ 10^' + cands[cands.length - 1] + ' M）', pg, ['ph-scale-h6'], true);
}
pg = newPage(); setSp(pg, 'A', 'HCN'); setC(pg, 'A', -5); dilute(pg, 'A'); dilute(pg, 'A'); r = dilute(pg, 'A');
report('A 10^-5 M HCN 連續稀釋 3 次到 10^-8 M：α = ' + (r.after.alpha * 100).toFixed(3) + '%（上限 ' + (r.after.alphaLim * 100).toFixed(3) + '%，' + (r.after.alpha / r.after.alphaLim * 100).toFixed(2) + '%）', pg, ['ph-scale-h7'], true);
pg = newPage(); setSp(pg, 'A', 'HClO'); setC(pg, 'A', -5); dilute(pg, 'A'); dilute(pg, 'A'); r = dilute(pg, 'A');
report('（另一解）A 10^-5 M HClO 連續稀釋 3 次到 10^-8 M：α = ' + (r.after.alpha * 100).toFixed(2) + '%（上限 ' + (r.after.alphaLim * 100).toFixed(2) + '%，' + (r.after.alpha / r.after.alphaLim * 100).toFixed(2) + '%）', pg, ['ph-scale-h7'], true);
{
  // h8 的門檻：很弱的酸（開始 α ≤ 0.1%）稀釋 1000 倍後 α 變幾倍——理想 √1000 = 31.62，水的解離會把它壓低
  const ratios = [];
  ['HClO', 'HCN'].forEach(sp => { for (let x = -3; x <= 0.0001; x += 0.05) {
    const a0 = P.solution(sp, x, 25), a3 = P.solution(sp, x - 3, 25);
    if (a0.alpha <= 0.001 && a3.alpha <= 0.02) ratios.push([sp, r2(x), a3.alpha / a0.alpha]);
  } });
  ratios.sort((a, b) => a[2] - b[2]);
  console.log('  （h8 門檻）開始 α ≤ 0.1% 的弱酸稀釋 1000 倍，α 的倍數：最小 ' + ratios[0][2].toFixed(2) + '（' + ratios[0][0] + ' 10^' + ratios[0][1] + ' M）～ 最大 ' + ratios[ratios.length - 1][2].toFixed(2) + '；門檻 28');
}
pg = newPage(); setSp(pg, 'A', 'HCN'); setC(pg, 'A', -1); const r0 = sol(pg, 'A'); dilute(pg, 'A'); dilute(pg, 'A'); r = dilute(pg, 'A');
report('A 0.10 M HCN 連續稀釋 3 次（1000 倍）：α ' + (r0.alpha * 100).toFixed(4) + '% → ' + (r.after.alpha * 100).toFixed(4) + '%（' + (r.after.alpha / r0.alpha).toFixed(2) + ' 倍）', pg, ['ph-scale-h8'], true);
{
  pg = newPage(); setSp(pg, 'A', 'HF');
  const lc = scan(-5, 0, x => Math.abs(P.solution('HF', x, 25).alpha - 0.5)); setC(pg, 'A', lc); r = measure(pg);
  report('A HF 10^' + lc + ' M：α = ' + (r.A.alpha * 100).toFixed(2) + '%，pH ' + f3(r.A.pH) + '，pKa ' + f3(r.A.pK), pg, ['ph-scale-h9'], true);
}

// ---------- 不會太容易：反例 ----------
console.log('反例（不該完成）');
function none(name, pg, ids) {
  const hit = ids.filter(id => pg.events.includes(id));
  console.log('  ' + (!hit.length ? '✓' : '✗') + ' ' + name + (hit.length ? '：卻完成了 ' + hit.join('、') : ''));
  if (hit.length) bad++;
}
pg = newPage(); setSp(pg, 'A', 'water'); setT(pg, 95); measure(pg);
none('純水直接在 95 °C 量（沒先在室溫量過）不算 h1', pg, ['ph-scale-h1']);
pg = newPage(); setSp(pg, 'A', 'water'); measure(pg); setT(pg, 60); measure(pg); setT(pg, 95); measure(pg);
none('純水 25 °C、60 °C、95 °C 各量一次（上一次不是室溫）不算 h1', pg, ['ph-scale-h1']);
pg = newPage(); setSp(pg, 'A', 'water'); measure(pg); setSp(pg, 'A', 'HCl'); measure(pg); setSp(pg, 'A', 'water'); setT(pg, 95); measure(pg);
none('純水室溫量過、中間換別的物質量過，再換回純水加熱量，不算 h1', pg, ['ph-scale-h1']);
pg = newPage(); setSp(pg, 'A', 'water'); measure(pg); setC(pg, 'B', -3); setT(pg, 95); measure(pg);
none('純水室溫量過，加熱時順便改了 B 杯濃度（不是只改溫度），不算 h1', pg, ['ph-scale-h1']);
pg = newPage(); setC(pg, 'A', -8); measure(pg);
none('直接把鹽酸滑到 10^-8 M 量（沒有一路稀釋）不算 h2', pg, ['ph-scale-h2']);
pg = newPage(); setSp(pg, 'B', 'NaOH'); setC(pg, 'B', -5.5); setT(pg, 100); measure(pg);
none('稀 NaOH 直接在 100 °C 量（沒先在室溫量過）不算 h6', pg, ['ph-scale-h6']);
pg = newPage(); setSp(pg, 'A', 'HCN'); setC(pg, 'A', -8); measure(pg);
none('HCN 直接滑到 10^-8 M 量不算 h7（要一路稀釋）', pg, ['ph-scale-h7']);
pg = newPage(); setSp(pg, 'A', 'HCN'); setC(pg, 'A', -5); measure(pg);
none('只量 10^-5 M HCN、旁邊不是純水，不算 h4', pg, ['ph-scale-h4']);
pg = newPage(); setSp(pg, 'A', 'HCN'); setC(pg, 'A', -5.5); setSp(pg, 'B', 'water'); setT(pg, 60); measure(pg);
none('同樣的 HCN＋純水，但在 60 °C 量，不算 h4', pg, ['ph-scale-h4']);
pg = newPage(); setC(pg, 'A', -8); setSp(pg, 'B', 'CH3COOH'); setC(pg, 'B', -8); measure(pg);
none('HCl、醋酸都 10^-8 M（兩杯都被水壓到 pH 7 附近）不算 h5', pg, ['ph-scale-h5']);
pg = newPage(); setSp(pg, 'A', 'HCN'); setC(pg, 'A', -6); dilute(pg, 'A'); dilute(pg, 'A');
none('HCN 10^-6 M 只稀釋 2 次到 10^-8 M，不算 h7', pg, ['ph-scale-h7']);
pg = newPage(); setSp(pg, 'A', 'HCN'); setC(pg, 'A', -1); dilute(pg, 'A'); dilute(pg, 'A');
none('HCN 0.10 M 只稀釋 2 次（100 倍），不算 h8', pg, ['ph-scale-h8']);
pg = newPage(); setSp(pg, 'A', 'CH3COOH'); setC(pg, 'A', -1); dilute(pg, 'A'); dilute(pg, 'A');
none('醋酸 0.10 M 稀釋 100 倍（開始時 α 已超過 0.1%）不算 h8', pg, ['ph-scale-h8']);
pg = newPage(); setSp(pg, 'A', 'CH3COOH'); setC(pg, 'A', 0); dilute(pg, 'A'); dilute(pg, 'A'); dilute(pg, 'A');
none('醋酸 1 M 稀釋 1000 倍（開始時 α 0.42%）不算 h8', pg, ['ph-scale-h8']);
pg = newPage(); setSp(pg, 'A', 'HClO'); setC(pg, 'A', -2); dilute(pg, 'A'); dilute(pg, 'A'); dilute(pg, 'A');
none('HClO 0.010 M 稀釋 1000 倍（開始時 α 0.2%）不算 h8', pg, ['ph-scale-h8']);
pg = newPage(); answer(pg, 1); answer(pg, 2); answer(pg, 3); answer(pg, pg.unk.pKa);
none('亂猜三次後第四次才答對：不算 ph-scale-12、h10', pg, ['ph-scale-12', 'ph-scale-h10']);
pg = newPage(); pg.revealed = true; answer(pg, pg.unk.pKa);
none('揭曉以後再答不算', pg, ['ph-scale-11', 'ph-scale-12', 'ph-scale-h10']);

// ---------- 隨機亂按：隱藏任務多常被誤觸 ----------
{
  let s = 1113; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  // 試玩（tools/playtest.cjs）每一步從頁面上約 35 個可操作元件隨機挑一個：18 個物質按鈕、2 個濃度滑桿、溫度滑桿、2 個稀釋、
  // 測量、核對、揭曉、換一個，其餘（音效、指示劑、2D／3D、圖表分頁、全部清除…）不影響任務。滑桿常被拉到最小或最大。
  function mash(weights, RUNS, STEPS) {
    const cnt = {};
    const tot = weights.reduce((a, b) => a + b, 0);
    for (let run = 0; run < RUNS; run++) {
      pg = newPage(rnd);
      for (let k = 0; k < STEPS; k++) {
        let u = rnd() * tot, j = 0;
        while (u > weights[j]) { u -= weights[j]; j++; }
        const id = rnd() < 0.5 ? 'A' : 'B';
        if (j === 0) setSp(pg, id, P.ORDER[Math.floor(rnd() * P.ORDER.length)]);
        else if (j === 1) setC(pg, id, rnd() < 0.4 ? (rnd() < 0.5 ? -8 : 0) : -8 + 8 * rnd());
        else if (j === 2) setT(pg, rnd() < 0.4 ? (rnd() < 0.5 ? 25 : 100) : 25 + 75 * rnd());
        else if (j === 3) { if (pg.b[id].sp !== 'water' && pg.b[id].logC - 1 >= -8) dilute(pg, id); }
        else if (j === 4) measure(pg);
        else if (j === 5) answer(pg, rnd() < 0.3 ? 4.2 : 1 + 8 * rnd());
        else if (j === 6) pg.revealed = true;
        else if (j === 7) { pg.unk = P.newUnknown(rnd); pg.revealed = false; pg.tries = 0; }
      }
      pg.events.filter(hid).forEach(e => { cnt[e] = (cnt[e] || 0) + 1; });
    }
    return Object.keys(cnt).sort().map(k => k + ' ' + (cnt[k] / RUNS * 100).toFixed(RUNS >= 2000 ? 2 : 1) + '%').join('、') || '沒有';
  }
  // 回數可用環境變數 MASH_RUNS 加大（例如 5000），比例比較穩
  const RUNS = Math.max(100, parseInt(process.env.MASH_RUNS, 10) || 500);
  console.log('  （參考）像試玩那樣亂按 ' + RUNS + ' 回、每回 150 步，隱藏任務被誤觸的比例：' + mash([18, 2, 1, 2, 1, 1, 1, 1, 8], RUNS, 150));
  console.log('  （參考）更密集的亂按（測量、稀釋、滑桿的機率各放大好幾倍）300 回：' + mash([4, 4, 2, 3, 4, 1, 0.3, 0.3, 0], 300, 150));
}

// ---------- 總結 ----------
const missing = missions.filter(m => !done[m.id]).map(m => m.id);
console.log(missing.length ? '  ✗ 沒有證明到的任務：' + missing.join('、') : '  ✓ ' + missions.length + ' 個任務都證明做得到');
if (missing.length) bad++;
const lv = missions.filter(m => m.hidden).map(m => m.level);
const okLv = lv.length === 10 && lv.every(l => l >= 3 && l <= 10) && lv.filter(l => l >= 7).length >= 3;
console.log('  ' + (okLv ? '✓' : '✗') + ' 隱藏任務 ' + lv.length + ' 個，等級 ' + lv.join('、') + '（7 級以上 ' + lv.filter(l => l >= 7).length + ' 個）');
if (!okLv) bad++;
console.log('    （公開 ' + missions.filter(m => !m.hidden).reduce((a, m) => a + m.level, 0) + ' 顆星、隱藏 ' + missions.filter(m => m.hidden).reduce((a, m) => a + m.level * 2, 0) + ' 顆星）');
if (bad) { console.log('失敗 ' + bad + ' 項'); process.exitCode = 1; }
else console.log('全部通過');
