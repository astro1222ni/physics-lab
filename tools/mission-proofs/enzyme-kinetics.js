/* 任務可達成的證明腳本。用法：node tools/mission-proofs/enzyme-kinetics.js
 * 用酵素核心（js/enzyme-kinetics-core.js）照頁面的做法算出 'run'、'tscan'、'measure'、'fit'、'guess' 事件（與 js/enzyme-kinetics.js 相同的計算與亂數），
 * 再用任務檔（js/missions/enzyme-kinetics.js）同一份 check 函式判定。每個任務都給出一組做得到的操作、對照組，並檢查預設狀態不會誤觸高等級任務。
 * 修改核心、頁面的事件或任務條件後重跑。 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const E = require(ROOT + 'js/enzyme-kinetics-core.js');

const defs = [];
const fakeLM = { register: function (id, list) { list.forEach(m => defs.push(Object.assign({ mem: {} }, m))); } };
new Function('window', 'LabMission', fs.readFileSync(ROOT + 'js/missions/enzyme-kinetics.js', 'utf8'))({ LabMission: fakeLM }, fakeLM);
const byId = {};
defs.forEach(m => { byId[m.id.replace('enzyme-kinetics-', '')] = m; });
const check = (id, ev) => byId[id].check(ev, byId[id].mem);
const all = ev => defs.filter(m => m.check(ev, {})).map(m => m.id.replace('enzyme-kinetics-', ''));

const out = [];
let fail = 0;
function claim(ok, msg) { out.push((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; }
const f = (v, d) => (v == null || !isFinite(v)) ? '—' : v.toFixed(d);
const mmss = s => s == null ? '沒完成' : Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');

// ---------- 與 js/enzyme-kinetics.js 相同的計算 ----------
const TMAX = 1200, KI_KNOWN = 1;
function runEv(enz, tubes) {
  return { type: 'run', data: { enzyme: enz, tubes: tubes.map(t => { const e = E.endTime(enz, t[0], t[1]); return { T: t[0], pH: t[1], end: e <= TMAX ? e : null }; }) } };
}
const rdesc = ev => ev.data.enzyme + '：' + ev.data.tubes.map(t => f(t.T, 0) + '°/pH ' + f(t.pH, 1) + ' ' + mmss(t.end)).join('、');
function scanEv(enz, pH, taMin, prev) {
  const s = E.scanT(enz, pH, taMin * 60, 0, 80, 1);
  return { type: 'tscan', data: { enzyme: enz, pH: pH, ta: taMin * 60, Topt: s.Topt, prev: prev || [] } };
}
/** 第二部分：和頁面一樣的狀態、亂數與事件 */
function Lab2(seed) {
  const st = { seed: seed, pts: [], nMeas: 0, streak: 0, guessed: false };
  let sample = E.sample(seed), myst = E.mystery(seed);
  const evs = [];
  const keyOf = (inh, I) => inh === 'none' || I <= 0 ? 'none' : inh + '@' + I.toFixed(2);
  function params(inh, I) { return inh === 'mystery' ? { Vmax: sample.Vmax, Km: sample.Km, type: myst.type, I: I, Ki: myst.Ki } : { Vmax: sample.Vmax, Km: sample.Km, type: inh, I: I, Ki: KI_KNOWN }; }
  function series() {
    const map = {};
    st.pts.forEach(p => { (map[p.key] = map[p.key] || { key: p.key, inh: p.key === 'none' ? 'none' : p.inh, pts: [], noise: Infinity }).pts.push(p); map[p.key].noise = Math.min(map[p.key].noise, p.noise); });
    Object.values(map).forEach(s => { s.fit = E.lbFit(s.pts); });
    return map;
  }
  return {
    st: st, truth: () => ({ sample, myst }), evs: evs,
    measure(S, inh, I, noise) {
      if (inh === 'none') I = 0;
      const p = params(inh, I);
      st.nMeas++;
      const r = E.rng(st.seed * 100003 + st.nMeas * 7 + 1);
      const v = E.measure(S, p, noise, r), key = keyOf(inh, I);
      st.pts.push({ S, v, inh, I, key, noise });
      const app = E.apparent(p);
      const res = [{ type: 'measure', data: { S, v, Km: sample.Km, Vmax: sample.Vmax, type: inh === 'mystery' ? myst.type : inh, mystery: inh === 'mystery', I, Ki: p.Ki, noise, appKm: app.Km, appVmax: app.Vmax } }];
      const m = series(), s = m[key], s0 = m.none;
      if (s && s.fit && s.fit.Vmax) res.push({ type: 'fit', data: {
        key, type: key === 'none' ? 'none' : (inh === 'mystery' ? myst.type : inh), mystery: inh === 'mystery', I, n: s.pts.length, noise: s.noise,
        Km: s.fit.Km, Vmax: s.fit.Vmax, slope: s.fit.slope, icpt: s.fit.icpt, trueKm: app.Km, trueVmax: app.Vmax,
        n0: s0 ? s0.pts.length : 0, slope0: s0 && s0.fit ? s0.fit.slope : null, icpt0: s0 && s0.fit ? s0.fit.icpt : null } });
      res.forEach(e => evs.push(e));
      return res;
    },
    series: series,
    guess(type) {
      const m = series();
      const n0 = m.none ? m.none.pts.length : 0;
      let n1 = 0, nz = Infinity;
      Object.values(m).forEach(q => { if (q.inh === 'mystery' && q.key !== 'none') { n1 += q.pts.length; nz = Math.min(nz, q.noise); } if (q.key === 'none') nz = Math.min(nz, q.noise); });
      const ok = type === myst.type, qual = ok && n0 >= 4 && n1 >= 4 && nz >= 0.05 - 1e-9;
      st.streak = ok ? (qual ? st.streak + 1 : st.streak) : 0;
      st.guessed = true;
      const ev = { type: 'guess', data: { correct: ok, n0, n1, noise: isFinite(nz) ? nz : 0, streak: st.streak, guess: type, truth: myst.type } };
      evs.push(ev);
      return ev;
    },
    newEnzyme() { st.seed++; sample = E.sample(st.seed); myst = E.mystery(st.seed); st.pts = []; st.nMeas = 0; st.guessed = false; }
  };
}
const Spos = p => 0.05 * Math.pow(10, p / 200);   // 受質濃度滑桿
const anyOf = (evs, id) => evs.some(e => check(id, e));

// ---------- 預設 ----------
{
  const ev = runEv('amylase', Array(5).fill([37, 6.8]));
  const got = all(ev);
  claim(got.join() === '1', '預設五支 37 °C、pH 6.8 按「開始反應」只完成 1 號（得到：' + (got.join('、') || '無') + '）');
}

// ---------- 一・試管 ----------
{
  const ev = runEv('amylase', [[37, 4.8], [37, 5.8], [37, 6.8], [37, 7.8], [37, 8.8]]);
  claim(check('2', ev), '2 口水的最適 pH：' + rdesc(ev));
  const c = runEv('amylase', [[37, 6.8], [37, 6.9], [37, 7.0], [20, 6.8], [20, 6.8]]);
  claim(!check('2', c), '2 對照：pH 只差 0.1，不算三個不同 pH');
  const c2 = runEv('pepsin', [[37, 1.5], [37, 2], [37, 2.5], [37, 3.5], [37, 4.5]]);
  claim(!check('2', c2), '2 對照：要用唾液澱粉酶');
}
{
  const ev = runEv('amylase', [[80, 6.8], [37, 6.8], [37, 6.8], [37, 6.8], [37, 6.8]]);
  claim(check('3', ev), '3 煮過就不行：' + rdesc(ev));
  const c = runEv('amylase', [[50, 6.8], [37, 6.8], [37, 6.8], [37, 6.8], [37, 6.8]]);
  claim(!check('3', c), '3 對照：50 °C 不算煮過');
}
{
  const ev = runEv('pepsin', [[37, 2], [37, 7], [37, 2], [37, 2], [37, 2]]);
  claim(check('4', ev), '4 胃裡的酵素：' + rdesc(ev));
  claim(!check('4', runEv('trypsin', [[37, 2], [37, 7], [37, 8], [37, 8], [37, 8]])), '4 對照：胰蛋白酶不算');
}
for (const enz of ['amylase', 'pepsin', 'trypsin']) {
  const o = E.optPH(enz);
  const ev = runEv(enz, [[5, o], [20, o], [40, o], [50, o], [65, o]]);
  claim(check('8', ev), '8 冷了慢、熱了壞（' + enz + '）：' + rdesc(ev));
}
{
  claim(!check('8', runEv('amylase', [[5, 6.8], [20, 6.8], [40, 6.8], [50, 6.8], [55, 6.8]])), '8 對照：最熱只有 55 °C');
  claim(!check('8', runEv('amylase', [[5, 6.8], [20, 6.8], [40, 5.8], [50, 6.8], [65, 6.8]])), '8 對照：pH 不一樣');
}
{
  const ev = runEv('trypsin', [[37, 2], [37, 8], [37, 8], [37, 8], [37, 8]]);
  claim(check('h1', ev), 'h1 走錯地方：' + rdesc(ev));
  claim(!check('h1', runEv('trypsin', [[37, 5], [37, 8], [37, 8], [37, 8], [37, 8]])), 'h1 對照：pH 5 不算胃酸');
}
// 10：最適溫度隨測量時間移動
for (const enz of ['amylase', 'pepsin', 'trypsin']) {
  const o = E.optPH(enz);
  const a = scanEv(enz, o, 1), b = scanEv(enz, o, 60, [{ enzyme: enz, pH: o, ta: 60, Topt: a.data.Topt }]);
  claim(check('10', b), `10 最適溫度會移動（${enz}）：每點 1 分鐘 ${f(a.data.Topt, 1)} °C、60 分鐘 ${f(b.data.Topt, 1)} °C`);
}
{
  const a = scanEv('amylase', 6.8, 1), b = scanEv('amylase', 6.8, 8, [{ enzyme: 'amylase', pH: 6.8, ta: 60, Topt: a.data.Topt }]);
  claim(!check('10', b), '10 對照：1 分鐘與 8 分鐘差不到 10 倍（' + f(a.data.Topt, 1) + ' vs ' + f(b.data.Topt, 1) + ' °C）');
  const c = scanEv('amylase', 6.8, 2), d = scanEv('amylase', 6.8, 20, [{ enzyme: 'amylase', pH: 6.8, ta: 120, Topt: c.data.Topt }]);
  out.push('  10 參考：2 與 20 分鐘 ' + f(c.data.Topt, 1) + ' / ' + f(d.data.Topt, 1) + ' °C（' + (check('10', d) ? '算' : '不算') + '）');
}

// ---------- 二・神秘酵素 ----------
{
  // 5：在 Km 附近量
  const L = Lab2(1), Km = L.truth().sample.Km;
  let pos = 0; while (Spos(pos + 1) <= Km) pos++;
  const p = Math.abs(Spos(pos) / Km - 1) < Math.abs(Spos(pos + 1) / Km - 1) ? pos : pos + 1;
  const evs = L.measure(Spos(p), 'none', 0, 0.03);
  claim(check('5', evs[0]), '5 一半的速度：第 1 號酵素 Km = ' + f(Km, 3) + ' mM，滑桿停在 ' + f(Spos(p), 3) + ' mM（差 ' + f(100 * Math.abs(Spos(p) / Km - 1), 1) + '%）');
  claim(!check('5', L.measure(Km * 2, 'none', 0, 0.03)[0]), '5 對照：2 倍 Km 不算');
}
{
  // 6：5 個點、誤差 3%
  const L = Lab2(1);
  [0.25, 0.5, 1, 2.5, 5, 10, 25].forEach(S => L.measure(S, 'none', 0, 0.03));
  const ok = L.evs.find(e => check('6', e));
  claim(!!ok, '6 雙倒數：誤差 3%，' + (ok ? ok.data.n + ' 個點得 Km ' + f(ok.data.Km, 3) + '（答案 ' + f(ok.data.trueKm, 3) + '）、Vmax ' + f(ok.data.Vmax, 2) + '（答案 ' + f(ok.data.trueVmax, 2) + '）' : '找不到'));
  const L0 = Lab2(1);
  [0.25, 0.5, 1, 2.5, 5].forEach(S => L0.measure(S, 'none', 0, 0));
  claim(!anyOf(L0.evs, '6'), '6 對照：誤差 0% 不算');
}
{
  // 7：競爭型、[I] = 2 Ki、[S] = 50 mM
  const L = Lab2(1);
  const ev = L.measure(50, 'competitive', 2, 0.03)[0];
  claim(check('7', ev), '7 把對手擠走：[I] = 2 mM（Ki = 1）、[S] = 50 mM，v = ' + f(ev.data.v, 2) + '，Vmax = ' + f(ev.data.Vmax, 2));
  let ok7 = 0; for (let sd = 1; sd <= 100; sd++) { const q = E.sample(sd); if (E.rate(50, { Vmax: q.Vmax, Km: q.Km, type: 'competitive', I: 2, Ki: 1 }) >= 0.8 * q.Vmax) ok7++; }
  out.push('  7 參考：不算誤差，100 個神秘酵素有 ' + ok7 + ' 個在 [S] = 50 mM 時做得到（其餘換一個酵素）');
  claim(!check('7', L.measure(5, 'competitive', 2, 0)[0]), '7 對照：[S] = 5 mM 時被抑制得太多');
  claim(!check('7', L.measure(50, 'noncompetitive', 2, 0.03)[0]), '7 對照：非競爭型怎樣都到不了');
}
{
  // h2：非競爭型、[I] = Ki、[S] ≥ 20 Km
  const L = Lab2(1);
  const ev = L.measure(50, 'noncompetitive', 1, 0.03)[0];
  claim(check('h2', ev), 'h2 卡住的鎖：非競爭型 [I] = Ki、[S] = 50 mM（' + f(50 / ev.data.Km, 0) + ' 倍 Km），v 只有 Vmax 的 ' + f(100 * ev.data.v / ev.data.Vmax, 0) + '%');
  claim(!check('h2', L.measure(50, 'competitive', 1, 0.03)[0]), 'h2 對照：競爭型受質多就回來');
}
{
  // h3：反競爭型兩條平行線
  const L = Lab2(1), S = [0.3, 0.6, 1.2, 2.5, 5, 10];
  S.forEach(s => L.measure(s, 'none', 0, 0.02));
  S.forEach(s => L.measure(s, 'uncompetitive', 2, 0.02));
  const ok = L.evs.find(e => check('h3', e));
  claim(!!ok, 'h3 平行線：誤差 2%，' + (ok ? '斜率比 ' + f(ok.data.slope / ok.data.slope0, 3) + '、截距比 ' + f(ok.data.icpt / ok.data.icpt0, 2) : '找不到'));
  const L2 = Lab2(1);
  S.forEach(s => L2.measure(s, 'none', 0, 0.02));
  S.forEach(s => L2.measure(s, 'competitive', 2, 0.02));
  claim(!anyOf(L2.evs, 'h3'), 'h3 對照：競爭型的線交在縱軸，不平行');
}
{
  // 11：誤差 3%、6 點以內、Km 與 Vmax 都在 5% 內。找第一個做得到的酵素與一組濃度
  const sets = [[0.5, 1, 2, 5, 10, 25], [1, 2, 4, 8, 16, 32], [0.8, 1.6, 3.2, 6.4, 12.8, 25.6], [2, 4, 8, 16, 32, 50]];
  let found = null, tries = 0;
  for (let seed = 1; seed <= 40 && !found; seed++) for (const set of sets) {
    tries++;
    const L = Lab2(seed);
    set.forEach(S => L.measure(S, 'none', 0, 0.03));
    const e = L.evs.find(x => check('11', x));
    if (e) { found = { seed, set, e }; break; }
  }
  claim(!!found, '11 省著量：' + (found ? '第 ' + found.seed + ' 號酵素、[S] = ' + found.set.join('、') + ' mM：' + found.e.data.n + ' 點得 Km ' + f(found.e.data.Km, 3) + '（' + f(found.e.data.trueKm, 3) + '）、Vmax ' + f(found.e.data.Vmax, 2) + '（' + f(found.e.data.trueVmax, 2) + '）' : '找不到') + '（試了 ' + tries + ' 組）');
  // 成功率
  let okN = 0, n = 0;
  for (let seed = 1; seed <= 100; seed++) { n++; const L = Lab2(seed); const Km = L.truth().sample.Km; [0.5, 1, 2, 4, 8, 16].map(k => k * Km / 2).forEach(S => L.measure(Math.min(50, S), 'none', 0, 0.03)); if (L.evs.some(x => check('11', x))) okN++; }
  out.push('  11 參考：知道 Km 大概在哪裡、量 0.25–8 倍 Km 六點，100 個酵素有 ' + okN + ' 個一次成功');
}
{
  // 9、12：每個神秘酵素沒加、加神秘抑制劑各量 6 點，用 classify 判斷再猜；誤差 5%
  const L = Lab2(1), S = [0.4, 0.8, 1.6, 3.2, 6.4, 12.8];
  let n9 = null, n12 = null, right = 0, total = 0;
  for (let k = 0; k < 30 && !(n9 && n12); k++) {
    S.forEach(s => L.measure(s, 'none', 0, 0.05));
    S.forEach(s => L.measure(s, 'mystery', 2, 0.05));
    const m = L.series();
    const g = E.classify(m.none.fit, m['mystery@2.00'].fit);
    const guessT = ['competitive', 'noncompetitive', 'uncompetitive'].includes(g) ? g : 'competitive';
    const ev = L.guess(guessT);
    total++; if (ev.data.correct) right++;
    if (!n9 && check('9', ev)) n9 = L.st.seed;
    if (!n12 && check('12', ev)) n12 = L.st.seed;
    L.newEnzyme();
  }
  claim(!!n9, '9 揭穿抑制劑：第 ' + n9 + ' 號酵素，各 6 點、誤差 5%，比較兩條線就猜對');
  claim(!!n12, '12 三連勝：誤差 5%、每次各 6 點，到第 ' + n12 + ' 號酵素連續猜對三次（這段猜了 ' + total + ' 次，對 ' + right + ' 次）');
  const L3 = Lab2(1);
  [1, 2, 4].forEach(s => L3.measure(s, 'none', 0, 0.05));
  [1, 2, 4].forEach(s => L3.measure(s, 'mystery', 2, 0.05));
  const ev3 = L3.guess(L3.truth().myst.type);
  claim(ev3.data.correct && !check('9', ev3), '9 對照：各只有 3 點就猜，對了也不算');
  const L4 = Lab2(1);
  S.forEach(s => L4.measure(s, 'none', 0, 0.02)); S.forEach(s => L4.measure(s, 'mystery', 2, 0.02));
  const ev4 = L4.guess(L4.truth().myst.type);
  claim(ev4.data.streak === 0 && !check('12', ev4), '12 對照：誤差 2% 時猜對不累計連勝');
}

// ---------- 星星 ----------
const stars = m => m.hidden ? m.level * 2 : m.level;
const pub = defs.filter(m => !m.hidden), hid = defs.filter(m => m.hidden);
out.push(`任務 ${defs.length} 個（公開 ${pub.length}、隱藏 ${hid.length}），共 ${defs.reduce((a, m) => a + stars(m), 0)} 顆星（公開 ${pub.reduce((a, m) => a + stars(m), 0)}，隱藏 ${hid.reduce((a, m) => a + stars(m), 0)}）`);
console.log(out.join('\n'));
if (fail) { console.error(fail + ' 項不成立'); process.exitCode = 1; }
