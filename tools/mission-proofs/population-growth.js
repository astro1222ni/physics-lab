/* 任務可達成的證明腳本。用法：node tools/mission-proofs/population-growth.js
 * 用族群模型核心（js/population-growth-core.js）照頁面的做法算出 'grow'、'inspect'、'pp'、'comp' 事件（與 js/population-growth.js 相同的計算），
 * 再用任務檔（js/missions/population-growth.js）同一份 check 函式判定。每個任務都給出一組做得到的操作，並檢查預設狀態不會誤觸。
 * 修改核心、頁面的事件或任務條件後重跑。 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const P = require(ROOT + 'js/population-growth-core.js');

const defs = [];
const fakeLM = { register: function (id, list) { list.forEach(m => defs.push(Object.assign({ mem: {} }, m))); } };
new Function('window', 'LabMission', fs.readFileSync(ROOT + 'js/missions/population-growth.js', 'utf8'))({ LabMission: fakeLM }, fakeLM);
const byId = {};
defs.forEach(m => { byId[m.id.replace('population-growth-', '')] = m; });
const check = (id, ev) => byId[id].check(ev, byId[id].mem);
const fresh = id => { byId[id].mem = {}; };

const out = [];
let fail = 0;
function claim(ok, msg) { out.push((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; }
const f = (v, d) => (v == null || !isFinite(v)) ? '—' : v.toFixed(d);

// ---------- 與 js/population-growth.js 相同的計算 ----------
const STOCH_CAP = 3000;
function theoryN(o, t) { return o.model === 'expo' ? P.expo(o.N0, o.r, t) : P.logistic(o.N0, o.r, o.K, t); }
function growEv(o) {
  o = Object.assign({ model: 'expo', stoch: false, r: 0.5, K: 500, N0: 10, tEnd: 30 }, o);
  const Kx = o.model === 'expo' ? Infinity : o.K;
  let t, N, extinct = false, tExt = NaN;
  if (o.stoch) {
    const g = P.gillespie({ N0: o.N0, r: o.r, K: Kx, tEnd: o.tEnd, rand: P.rng(o.seed), cap: isFinite(Kx) ? 1e7 : STOCH_CAP, every: o.tEnd / 1500 });
    t = g.t; N = g.N; extinct = g.extinct; tExt = g.tExtinct;
    const tl = t[t.length - 1], Nl = N[N.length - 1];
    if (!extinct && Nl >= STOCH_CAP && tl < o.tEnd - 1e-9) {
      for (let i = 1; i <= 400; i++) { const tt = tl + (o.tEnd - tl) * i / 400; t.push(tt); N.push(Nl * Math.exp(o.r * (tt - tl))); }
    }
  } else {
    t = []; N = [];
    for (let i = 0; i <= 800; i++) { const tt = o.tEnd * i / 800; t.push(tt); N.push(theoryN(o, tt)); }
  }
  return { type: 'grow', data: {
    model: o.model, stoch: o.stoch, r: o.r, K: o.model === 'logi' ? o.K : null, N0: o.N0, tEnd: o.tEnd,
    Nend: N[N.length - 1], Nmax: Math.max.apply(null, N), extinct: extinct, tExt: extinct ? tExt : null, td: P.doublingTime(o.r)
  } };
}
function inspectEv(o, tt) {
  o = Object.assign({ model: 'logi', stoch: false, r: 0.5, K: 500, N0: 10, tEnd: 30 }, o);
  const N = theoryN(o, tt);
  return { type: 'inspect', data: { model: o.model, stoch: o.stoch, r: o.r, K: o.model === 'logi' ? o.K : null, N0: o.N0, t: tt, N: N, frac: o.model === 'logi' ? N / o.K : null,
    rate: o.model === 'expo' ? P.rateExpo(N, o.r) : P.rateLogistic(N, o.r, o.K), rmax: o.model === 'logi' ? o.r * o.K / 4 : null } };
}
function dev(eq, x, y) { return Math.max(Math.abs(x - eq.x) / eq.x, Math.abs(y - eq.y) / eq.y); }
function ppEv(o) {
  const p = Object.assign({ a: 1, b: 0.02, c: 0.01, d: 0.8, K: Infinity, E: 0 }, o.p || {});
  const x0 = o.x0 == null ? 40 : o.x0, y0 = o.y0 == null ? 20 : o.y0, tEnd = o.tEnd || 60;
  const every = Math.max(0.02, Math.round(tEnd / 1500 / 0.005) * 0.005);
  const sim = P.simulate2(P.lvDeriv, p, x0, y0, tEnd, { h: 0.005, every: every });
  const n = sim.t.length - 1, eq = P.lvEquilibrium(p), T0 = eq.coexist ? P.lvPeriod0(p) : NaN, sum = P.lvSummary(sim);
  let amp = NaN, startDev = NaN, endDev = NaN;
  if (eq.coexist && eq.y > 0) { amp = 0; for (let i = 0; i <= n; i++) amp = Math.max(amp, dev(eq, sim.x[i], sim.y[i])); startDev = dev(eq, x0, y0); endDev = dev(eq, sim.x[n], sim.y[n]); }
  return { type: 'pp', data: {
    a: p.a, b: p.b, c: p.c, d: p.d, K: isFinite(p.K) ? p.K : null, E: p.E, x0: x0, y0: y0, tEnd: tEnd,
    eqx: eq.x, eqy: eq.y, coexist: eq.coexist, T0: T0, period: sum.period, lag: sum.lag, cycles: sum.cycles,
    avgX: sum.avgX, avgY: sum.avgY, amp: amp, startDev: startDev, endDev: endDev, xEnd: sim.x[n], yEnd: sim.y[n],
    key: [p.a, p.b, p.c, p.d].map(v => v.toFixed(4)).join('|')
  } };
}
function compEv(o) {
  const p = Object.assign({ r1: 0.8, r2: 0.8, K1: 500, K2: 400, a12: 0.6, a21: 0.82 }, o.p || {});
  const x0 = o.x0 == null ? 20 : o.x0, y0 = o.y0 == null ? 20 : o.y0, tEnd = o.tEnd || 60;
  const every = Math.max(0.02, Math.round(tEnd / 1500 / 0.005) * 0.005);
  const sim = P.simulate2(P.compDeriv, p, x0, y0, tEnd, { h: 0.005, every: every });
  const n = sim.t.length - 1, oc = P.compOutcome(p), xE = sim.x[n], yE = sim.y[n];
  const inner = oc.eq && oc.eq.x > 0 && oc.eq.y > 0;
  return { type: 'comp', data: {
    r1: p.r1, r2: p.r2, K1: p.K1, K2: p.K2, a12: p.a12, a21: p.a21, x0: x0, y0: y0, tEnd: tEnd,
    kind: oc.kind, eqx: oc.eq ? oc.eq.x : null, eqy: oc.eq ? oc.eq.y : null, xEnd: xE, yEnd: yE,
    startDev: inner ? dev(oc.eq, x0, y0) : NaN, endDev: inner ? dev(oc.eq, xE, yE) : NaN,
    winner: yE < 0.01 * p.K2 && xE > 0.5 * p.K1 ? 1 : xE < 0.01 * p.K1 && yE > 0.5 * p.K2 ? 2 : 0,
    key: [p.r1, p.r2, p.K1, p.K2, p.a12, p.a21].map(v => v.toFixed(4)).join('|')
  } };
}

// ---------- 1 J 型曲線 ----------
{
  const e = growEv({});
  claim(check('1', e), `1 J 型：預設（指數、r = 0.5、N0 = 10、30 天）一按就完成，N 從 10 到 ${f(e.data.Nend, 0)}`);
  fresh('1');
  claim(!check('1', growEv({ model: 'logi' })), '1 J 型：邏輯斯不算');
}
// ---------- 2 S 型曲線 ----------
{
  const e = growEv({ model: 'logi' });
  claim(check('2', e), `2 S 型：邏輯斯、N0 = 10、K = 500、30 天 → ${f(e.data.Nend, 2)}（≥ 475）`);
  claim(!check('2', growEv({ model: 'logi', N0: 60 })), '2 S 型：N0 = 60 > K/10 不算');
  claim(!check('2', growEv({ model: 'logi', r: 0.1 })), `2 S 型：r = 0.1、30 天只到 ${f(growEv({ model: 'logi', r: 0.1 }).data.Nend, 0)}，不算`);
  claim(!check('2', growEv({})), '2 S 型：預設的指數成長不算');
}
// ---------- 3 五天翻一倍 ----------
{
  const r = 0.14;   // 滑桿步長 0.005；ln2/5 = 0.1386
  const e = growEv({ r: r, tEnd: 30 });
  claim(check('3', e), `3 倍增：r = ${r} → Td = ${f(e.data.td, 3)} 天`);
  claim(!check('3', growEv({ r: 0.135 })) && check('3', growEv({ r: 0.14 })) && !check('3', growEv({ r: 0.145 })), `3 倍增：滑桿上只有 r = 0.14（Td = ${f(Math.LN2 / 0.14, 3)}）合格，0.135（${f(Math.LN2 / 0.135, 3)}）、0.145（${f(Math.LN2 / 0.145, 3)}）不合格`);
  claim(!check('3', growEv({})), '3 倍增：預設 r = 0.5 不算');
}
// ---------- 4 此起彼落 ----------
{
  const e = ppEv({});
  claim(check('4', e), `4 循環：預設（起點 (40, 20)、60 天）一按就完成：${e.data.cycles} 個循環、週期 ${f(e.data.period, 2)} 天、延遲 ${f(e.data.lag, 2)} 天`);
  claim(!check('4', ppEv({ x0: 80, y0: 50 })), '4 循環：從平衡點出發不算（不動）');
}
// ---------- 5 成長最快的時刻 ----------
{
  const ti = P.inflectionTime(10, 0.5, 500);
  claim(check('5', inspectEv({}, ti + 0.1)), `5 反曲點：邏輯斯預設，在 t = ${f(ti + 0.1, 2)}（反曲點 ${f(ti, 2)}）檢視 → N/K = ${f(inspectEv({}, ti + 0.1).data.frac, 3)}`);
  claim(!check('5', inspectEv({}, ti + 0.4)), `5 反曲點：t = ${f(ti + 0.4, 2)}（N/K = ${f(inspectEv({}, ti + 0.4).data.frac, 3)}）不算`);
  claim(!check('5', inspectEv({ N0: 250 }, 0)), '5 反曲點：一開始就從 K/2 出發不算');
  // 在 390 px 的圖上一個像素 ≈ 30/330 天，容許的時間範圍有幾個像素寬
  const lo = P.timeToReach(10, 0.5, 500, 0.47 * 500), hi = P.timeToReach(10, 0.5, 500, 0.53 * 500);
  claim(hi - lo > 4 * 30 / 330, `5 反曲點：容許的時間窗 ${f(hi - lo, 3)} 天，約是窄螢幕上 ${f((hi - lo) / (30 / 330), 1)} 個像素`);
}
// ---------- 6 小族群的厄運 ----------
{
  let seed = 1, e = null, tries = 0, ext = 0;
  for (; tries < 200; tries++, seed++) {
    const g = growEv({ stoch: true, N0: 3, r: 0.5, tEnd: 30, seed: seed });
    if (g.data.extinct) { ext++; if (!e) e = g; }
  }
  claim(e && check('6', e), `6 厄運：N0 = 3、r = 0.5，隨機 200 次中滅絕 ${ext} 次（理論 (1/2)^3 = 12.5%）`);
  claim(!check('6', growEv({ stoch: true, N0: 2, r: 0.5, seed: findExtinct(2) })), '6 厄運：N0 = 2 滅絕不算');
  function findExtinct(N0) { for (let s = 1; s < 500; s++) if (growEv({ stoch: true, N0: N0, seed: s }).data.extinct) return s; return 1; }
}
// ---------- 7 靜止的平衡 ----------
{
  const e = ppEv({ x0: 80, y0: 50, tEnd: 10 });
  claim(check('7', e), `7 平衡：起點 (80, 50)、10 天 → 最大偏離 ${f(e.data.amp * 100, 4)}%`);
  const e2 = ppEv({ x0: 81, y0: 50, tEnd: 30 });
  claim(check('7', e2), `7 平衡：起點 (81, 50)（拖曳到附近）→ 最大偏離 ${f(e2.data.amp * 100, 2)}%`);
  claim(!check('7', ppEv({ x0: 83, y0: 50 })), `7 平衡：起點 (83, 50) → ${f(ppEv({ x0: 83, y0: 50 }).data.amp * 100, 2)}% 不算`);
  claim(!check('7', ppEv({ x0: 80, y0: 50, p: { K: 400 } })), '7 平衡：有負荷量時不算');
}
// ---------- 8 量出週期 ----------
{
  const p = { a: 1.5, d: 0.6 };
  const eq = P.lvEquilibrium(Object.assign({ b: 0.02, c: 0.01, E: 0, K: Infinity }, p));
  const e = ppEv({ p: p, x0: Math.round(eq.x * 1.05), y0: Math.round(eq.y), tEnd: 60 });
  claim(check('8', e), `8 週期：a = 1.5、d = 0.6，平衡點 (${f(eq.x, 0)}, ${f(eq.y, 0)})，起點 (${e.data.x0}, ${e.data.y0}) → 最大偏離 ${f(e.data.amp * 100, 1)}%、${e.data.cycles} 個循環，週期 ${f(e.data.period, 3)} 對 T0 = ${f(e.data.T0, 3)}（差 ${f(Math.abs(e.data.period / e.data.T0 - 1) * 100, 2)}%）`);
  claim(!check('8', ppEv({ x0: 82, y0: 50 })), '8 週期：預設的 a、d 不算');
  const big = ppEv({ p: p, x0: 20, y0: 20, tEnd: 80 });
  claim(!check('8', big), `8 週期：大振幅（起點 (20, 20)）週期 ${f(big.data.period, 2)}，比 T0 長 ${f((big.data.period / big.data.T0 - 1) * 100, 1)}%，不算`);
}
// ---------- 9 循環平息了 ----------
{
  const e = ppEv({ p: { K: 400 }, x0: 40, y0: 20, tEnd: 150 });
  claim(check('9', e), `9 收斂：K = 400、起點 (40, 20)、150 天 → 起點偏離 ${f(e.data.startDev * 100, 0)}%，最後 ${f(e.data.endDev * 100, 2)}%`);
  const e60 = ppEv({ p: { K: 400 }, x0: 40, y0: 20, tEnd: 20 });
  claim(!check('9', e60), `9 收斂：只跑 20 天還差 ${f(e60.data.endDev * 100, 1)}%，不算`);
  const e2 = ppEv({ p: { K: 200 }, x0: 40, y0: 20, tEnd: 80 });
  claim(check('9', e2), `9 收斂：K = 200 收斂更快，80 天 → ${f(e2.data.endDev * 100, 2)}%`);
}
// ---------- 10 競爭排斥 ----------
{
  const e0 = compEv({ tEnd: 60 });
  claim(!check('10', e0), `10 排斥：預設（α12 = 0.6、α21 = 0.82）60 天物種 2 還剩 ${f(e0.data.yEnd / 4, 2)}%，一按不會完成`);
  const e = compEv({ tEnd: 120 });
  claim(check('10', e), `10 排斥：預設參數跑 120 天 → (${f(e.data.xEnd, 1)}, ${f(e.data.yEnd, 2)})`);
  const e1 = compEv({ p: { a21: 1.4 }, tEnd: 60 });
  claim(check('10', e1), `10 排斥：或把 α21 調到 1.4，60 天 → (${f(e1.data.xEnd, 1)}, ${f(e1.data.yEnd, 2)})`);
  const e2 = compEv({ p: { a12: 1.5, a21: 0.6 }, tEnd: 60 });
  claim(check('10', e2), `10 排斥：物種 2 獲勝也算 → (${f(e2.data.xEnd, 2)}, ${f(e2.data.yEnd, 1)})`);
  const e3 = compEv({ tEnd: 8 });
  claim(!check('10', e3), `10 排斥：只跑 8 天 → (${f(e3.data.xEnd, 1)}, ${f(e3.data.yEnd, 1)}) 不算`);
}
// ---------- 11 和平共存 ----------
{
  const e = compEv({ p: { a12: 0.5, a21: 0.4 }, x0: 20, y0: 20, tEnd: 60 });
  claim(check('11', e), `11 共存：α12 = 0.5、α21 = 0.4，平衡點 (${f(e.data.eqx, 1)}, ${f(e.data.eqy, 1)})，60 天 → 偏離 ${f(e.data.endDev * 100, 3)}%`);
  claim(!check('11', compEv({ tEnd: 60 })), '11 共存：預設（排斥）不算');
}
// ---------- 12 沃爾泰拉的漁獲之謎 ----------
{
  fresh('12');
  const off = ppEv({ tEnd: 80 }), on = ppEv({ p: { E: 0.3 }, tEnd: 80 });
  claim(!check('12', off), '12 漁獲：只跑一次不捕撈還不算');
  claim(check('12', on), `12 漁獲：E = 0 時平均獵物 ${f(off.data.avgX, 1)}、掠食者 ${f(off.data.avgY, 1)}；E = 0.3 時 ${f(on.data.avgX, 1)}、${f(on.data.avgY, 1)}（理論 ${f(0.8 / 0.01, 0)}→${f(1.1 / 0.01, 0)}、${f(1 / 0.02, 0)}→${f(0.7 / 0.02, 0)}）`);
  fresh('12');
  const on1 = ppEv({ p: { E: 0.1 }, tEnd: 80 });
  check('12', off);
  claim(!check('12', on1), `12 漁獲：E = 0.1 只多 ${f((on1.data.avgX / off.data.avgX - 1) * 100, 1)}%，不算`);
  fresh('12');
  check('12', ppEv({ p: { a: 1.2 }, tEnd: 80 }));
  claim(!check('12', on), '12 漁獲：兩次的 a 不同不算');
  fresh('12');
  check('12', on);
  claim(check('12', off), '12 漁獲：先捕撈、再不捕撈也算');
}
// ---------- h1 掠食者滅絕 ----------
{
  const e = ppEv({ p: { K: 70 }, x0: 40, y0: 20, tEnd: 150 });
  claim(check('h1', e), `h1：K = 70 < d/c = 80 → 掠食者 ${f(e.data.yEnd, 4)}、獵物 ${f(e.data.xEnd, 1)}`);
  claim(!check('h1', ppEv({ p: { K: 70 }, x0: 40, y0: 20, tEnd: 30 })), `h1：只跑 30 天，掠食者還剩 ${f(ppEv({ p: { K: 70 }, x0: 40, y0: 20, tEnd: 30 }).data.yEnd, 2)}，不算`);
  claim(!check('h1', ppEv({ p: { K: 400 } })), 'h1：K = 400 兩者共存，不算');
}
// ---------- h2 先到先贏 ----------
{
  fresh('h2');
  const p = { a12: 1.5, a21: 1.2 };
  const e1 = compEv({ p: p, x0: 300, y0: 50, tEnd: 100 }), e2 = compEv({ p: p, x0: 50, y0: 300, tEnd: 100 });
  claim(!check('h2', e1), `h2：第一次（起點 (300, 50)）物種 ${e1.data.winner} 獲勝，還不算`);
  claim(check('h2', e2), `h2：第二次（起點 (50, 300)）物種 ${e2.data.winner} 獲勝 → 完成`);
  fresh('h2');
  check('h2', e1);
  claim(!check('h2', compEv({ p: p, x0: 400, y0: 60, tEnd: 100 })), 'h2：同一方獲勝兩次不算');
}
// ---------- h3 地球裝不下 ----------
{
  const e = growEv({ r: 0.8, N0: 10, tEnd: 30 });
  claim(check('h3', e), `h3：指數、r = 0.8、30 天 → ${f(e.data.Nmax / 1e9, 1)} × 10^9`);
  claim(!check('h3', growEv({})), `h3：預設 r = 0.5 只到 ${f(growEv({}).data.Nmax / 1e6, 1)} 百萬，不算`);
  claim(!check('h3', growEv({ model: 'logi', K: 1000 })), 'h3：邏輯斯不可能');
  const es = growEv({ stoch: true, r: 0.8, N0: 50, tEnd: 30, seed: 3 });
  claim(check('h3', es), `h3：一隻一隻數時超過 3000 隻改用平均，也到得了 ${f(es.data.Nmax / 1e9, 1)} × 10^9`);
}

// ---------- 預設狀態不會誤觸困難任務 ----------
{
  const dflt = [growEv({}), ppEv({}), compEv({})];
  ['5', '6', '7', '8', '9', '11', '12', 'h1', 'h2', 'h3'].forEach(id => { fresh(id); });
  const hits = ['5', '6', '7', '8', '9', '11', '12', 'h1', 'h2', 'h3'].filter(id => dflt.some(e => check(id, e)));
  claim(hits.length === 0, '預設的三種操作不會完成 L4 以上的任務' + (hits.length ? '（誤觸：' + hits.join('、') + '）' : ''));
}

const total = defs.reduce((s, m) => s + m.level, 0), pub = defs.filter(m => !m.hidden).reduce((s, m) => s + m.level, 0);
out.push(`任務 ${defs.length} 個（公開 ${defs.filter(m => !m.hidden).length}、隱藏 ${defs.filter(m => m.hidden).length}），共 ${total} 顆星（公開 ${pub}）`);
console.log(out.join('\n'));
if (fail) { console.error(fail + ' 項不成立'); process.exitCode = 1; }
