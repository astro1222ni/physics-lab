/* 任務可達成的證明腳本。用法：node tools/mission-proofs/action-potential.js
 * 用生物物理核心（js/action-potential-core.js）照頁面的做法算出 'stim' 與 'cable' 事件（與 js/action-potential.js 相同的計算），
 * 再用任務檔（js/missions/action-potential.js）同一份 check 函式判定。每個任務都給出一組做得到的操作，並檢查預設狀態不會誤觸。
 * 修改核心、頁面的事件或任務條件後重跑。 */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/action-potential-core.js');

const defs = [];
const fakeLM = { register: function (id, list) { list.forEach(m => defs.push(Object.assign({ mem: {} }, m))); } };
new Function('window', 'LabMission', fs.readFileSync(ROOT + 'js/missions/action-potential.js', 'utf8'))({ LabMission: fakeLM }, fakeLM);
const byId = {};
defs.forEach(m => { byId[m.id.replace('action-potential-', '')] = m; });
const check = (id, ev) => byId[id].check(ev, byId[id].mem);
const fresh = id => { byId[id].mem = {}; };

const out = [];
let fail = 0;
function claim(ok, msg) { out.push((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; }
const f = (v, d) => (v == null || !isFinite(v)) ? '—' : v.toFixed(d);

// ---------- 與 js/action-potential.js 相同的計算 ----------
const ENV0 = { T: 6.3, kOut: 1, naOut: 1, ttx: 0, tea: 0 };
function envKey(e) { return [e.T.toFixed(2), e.kOut.toFixed(4), e.naOut.toFixed(4), e.ttx.toFixed(3), e.tea.toFixed(3)].join('|'); }
const thrCache = new Map();
function stimEv(o) {
  const e = Object.assign({}, ENV0, o.env || {});
  const P = K.params(e);
  const mode = o.mode || 'single', a1 = o.a1, a2 = o.a2 == null ? 40 : o.a2, dur = o.dur == null ? 0.5 : o.dur, gap = o.gap == null ? 12 : o.gap;
  let stim, tEnd, pulses = [];
  if (mode === 'step') { stim = { step: { t0: 5, amp: a1 } }; tEnd = 120; }
  else {
    const p1 = { t0: 2, dur: dur, amp: a1 };
    if (mode === 'single') { pulses = [p1]; tEnd = 40; }
    else { pulses = [p1, { t0: 2 + gap, dur: dur, amp: a2 }]; tEnd = Math.max(40, 2 + gap + dur + 30); }
    stim = { pulses: pulses };
  }
  const rec = K.simulate(P, stim, tEnd, { every: Math.min(0.02, 0.05 / P.phi) });
  const an = K.analyze(rec);
  const sp = an.spikes;
  let s1 = sp[0] || null, s2 = null;
  if (mode === 'paired') { const t2 = pulses[1].t0; s1 = sp.filter(s => s.t < t2)[0] || null; s2 = sp.filter(s => s.t >= t2)[0] || null; }
  const shape = s1 ? K.spikeShape(rec, s1) : null;
  const key = envKey(e);
  let thr = NaN;
  if (mode !== 'step') { const k = key + '|' + dur.toFixed(5); if (!thrCache.has(k)) thrCache.set(k, K.threshold(P, dur)); thr = thrCache.get(k); }
  const a2alone = mode === 'paired' ? (a2 > 0 && K.fires(P, a2, dur)) : false;
  const t0 = mode === 'step' ? 5 : 2;
  return { type: 'stim', data: {
    mode, a1, a2: mode === 'paired' ? a2 : null, dur: mode === 'step' ? null : dur, gap: mode === 'paired' ? gap : null,
    T: e.T, ttx: e.ttx, tea: e.tea, kOut: e.kOut, naOut: e.naOut, env: key,
    rest: an.rest, n: an.n, fired1: !!s1, fired2: !!s2, peak1: s1 ? s1.peak : null, peak2: s2 ? s2.peak : null,
    rise: an.rise, amp1: shape ? shape.amp : null, halfWidth: shape ? shape.halfWidth : null,
    thr, a2alone, rate: an.rate, lat: s1 ? s1.tPeak - t0 : null
  } };
}
function cableEv(o) {
  const e = Object.assign({}, ENV0, o.env || {});
  const P = K.params(e);
  const diam = o.diam || 476, myelin = !!o.myelin, xs = o.xs || [1], r1 = o.r1 == null ? 3 : o.r1, r2 = o.r2 == null ? 7 : o.r2;
  const cab = K.makeCable({ P, length: 10, diam, myelin });
  xs.forEach(x => cab.stims.push({ x0: Math.max(0, x - 0.05), x1: Math.min(10, x + 0.05), t0: 0.3, dur: 0.5, amp: 1500 }));
  while (true) { K.cableStep(cab); if ((cab.t > 2 && !K.cableActive(cab)) || cab.t >= 40) break; }
  const sum = K.cableSummary(cab);
  const v = K.velocity(cab, r1, r2);
  const single = xs.length === 1;
  const clean = single && Math.abs(r1 - xs[0]) >= 1 && Math.abs(r2 - xs[0]) >= 1 && [r1, r2].every(x => x >= 0.5 && x <= 9.5);
  const reachedFar = single ? (xs[0] < 5 ? sum.right : sum.left) : (sum.left && sum.right);
  let vRef = null;
  if (e.ttx > 0 && clean) vRef = K.measureVelocity({ P: K.params(Object.assign({}, e, { ttx: 0 })), length: 10, diam, myelin, x0: xs[0], x1: r1, x2: r2, stimAmp: 1500, tMax: 40 }).v;
  return { type: 'cable', data: {
    diam, myelin, T: e.T, ttx: e.ttx, tea: e.tea, kOut: e.kOut, naOut: e.naOut, env: envKey(e),
    nStim: xs.length, xs, r1, r2, dist: Math.abs(r2 - r1), v: isFinite(v) ? v : null, clean, reachedFar,
    left: sum.left, right: sum.right, collided: sum.collided, xMeet: sum.collided ? sum.xMeet : null, vRef
  } };
}
const P0 = K.params(ENV0);
const THR = K.threshold(P0, 0.5);

// ---------- 預設狀態不會誤觸「難的」任務 ----------
{
  const ev = stimEv({ a1: 20 });
  const hard = ['5', '6', '7', '10', '11', 'h1', 'h3'].filter(id => { fresh(id); return check(id, ev); });
  const evc = cableEv({});
  const hardC = ['8', '9', '12', 'h2'].filter(id => { fresh(id); return check(id, evc); });
  claim(!hard.length && !hardC.length, '預設的刺激（20 µA/cm²、0.5 ms）與預設的軸突刺激不會觸發難的任務與隱藏任務' + (hard.concat(hardC).length ? '（觸發了 ' + hard.concat(hardC).join('、') + '）' : ''));
}
// 1. 第一個動作電位：預設就會發
{ fresh('1'); const ev = stimEv({ a1: 20 }); claim(check('1', ev), `任務 1：20 µA/cm²、0.5 ms → 峰值 ${f(ev.data.peak1, 1)} mV`); }
// 2. 差一點點
{
  fresh('2'); const ev = stimEv({ a1: 12 }); const no = stimEv({ a1: 2 });
  claim(check('2', ev) && !check('2', no), `任務 2：12 µA/cm²（閾值 ${f(THR, 3)}）→ 上升 ${f(ev.data.rise, 1)} mV、沒有動作電位；2 µA/cm² 只上升 ${f(no.data.rise, 1)} mV 不算`);
}
// 3. 全有全無
{
  fresh('3');
  const a = stimEv({ a1: 14 }), b = stimEv({ a1: 42 });
  const near = stimEv({ a1: 13.5 }), far = stimEv({ a1: 45 });
  fresh('3'); check('3', near); const nearFar = check('3', far); fresh('3');
  const ok1 = !check('3', a), ok2 = check('3', b);
  fresh('3');
  const c = stimEv({ a1: 14, env: { T: 10 } });
  check('3', a);
  const notMixed = !check('3', c) || c.data.env === a.data.env;
  claim(ok1 && ok2 && notMixed && !nearFar, `任務 3：14 與 42 µA/cm² 的峰值 ${f(a.data.peak1, 2)}、${f(b.data.peak1, 2)} mV（差 ${f(Math.abs(a.data.peak1 - b.data.peak1), 2)}）；緊貼閾值的 13.5 與 45 差 ${f(Math.abs(near.data.peak1 - far.data.peak1), 2)} 不算；不同溫度的不能配對`);
}
// 4. 量傳導速度：預設的電極位置就合乎量法
{
  fresh('4');
  const ev = cableEv({});
  const bad = cableEv({ r1: 1.5, r2: 7 });
  claim(check('4', ev) && !check('4', bad), `任務 4：476 µm、S1 = 1、R1 = 3、R2 = 7 cm → ${f(ev.data.v, 2)} m/s；R1 離刺激點只有 0.5 cm 時不算`);
}
// 5. 找到閾值
{
  fresh('5');
  const a = +(THR * 1.015).toFixed(3), b = +(THR * 1.05).toFixed(3);
  const ev = stimEv({ a1: a }), evB = stimEv({ a1: b });
  claim(check('5', ev) && !check('5', evB), `任務 5：閾值 ${f(THR, 3)} µA/cm²；打 ${a}（1.015 倍）成功，${b}（1.05 倍）不算`);
}
// 6. 絕對不反應期
{
  fresh('6');
  const ev = stimEv({ mode: 'paired', a1: 20, a2: 200, gap: 3 });
  const late = stimEv({ mode: 'paired', a1: 20, a2: 200, gap: 15 });
  claim(check('6', ev) && !check('6', late), `任務 6：成對脈衝 20 與 200 µA/cm²（閾值 ${f(200 / THR, 1)} 倍）、間隔 3 ms → 第二個沒有發；間隔 15 ms 就會發（fired2 = ${late.data.fired2}）`);
}
// 7. 頻率編碼
{
  fresh('7');
  const a = stimEv({ mode: 'step', a1: 7 }), b = stimEv({ mode: 'step', a1: 50 });
  check('7', a);
  claim(check('7', b), `任務 7：持續電流 7 → ${f(a.data.rate, 1)} Hz，50 → ${f(b.data.rate, 1)} Hz`);
  fresh('7');
  const c = stimEv({ mode: 'step', a1: 10 });
  check('7', a);
  claim(!check('7', c), `      對照：7 與 10 µA/cm²（${f(c.data.rate, 1)} Hz）相差不到 40 Hz 不算`);
}
// 8. 越粗越快
{
  fresh('8');
  const a = cableEv({ diam: 100 }), b = cableEv({ diam: 476 });
  check('8', a);
  const ok = check('8', b);
  claim(ok, `任務 8：100 µm ${f(a.data.v, 3)} m/s、476 µm ${f(b.data.v, 3)} m/s；速度比 ${f(b.data.v / a.data.v, 4)}，√4.76 = ${f(Math.sqrt(4.76), 4)}`);
  fresh('8');
  const c = cableEv({ diam: 200 });
  check('8', c);
  claim(!check('8', b), '      對照：200 與 476 µm 直徑比不到 4 倍不算');
}
// 9. 跳躍傳導
{
  fresh('9');
  const a = cableEv({ diam: 476 }), b = cableEv({ diam: 476, myelin: true });
  check('9', a);
  claim(check('9', b), `任務 9：476 µm 無髓鞘 ${f(a.data.v, 2)} m/s、有髓鞘 ${f(b.data.v, 2)} m/s（${f(b.data.v / a.data.v, 2)} 倍）`);
}
// 10. 沒有過射
{
  fresh('10');
  const ev = stimEv({ a1: 60, env: { naOut: 0.15 } });
  const no = stimEv({ a1: 60, env: { naOut: 0.3 } });
  claim(check('10', ev) && !check('10', no), `任務 10：細胞外 Na×0.15、60 µA/cm² → 峰值 ${f(ev.data.peak1, 1)} mV、振幅 ${f(ev.data.amp1, 1)} mV；Na×0.3 時峰值 ${f(no.data.peak1, 1)} mV 不算`);
}
// 11. 等很久才發：剛好超過閾值一點點
{
  fresh('11');
  const a = +(THR + 0.005).toFixed(3);
  const ev = stimEv({ a1: a });
  const b = +(THR * 1.02).toFixed(3);
  const evB = stimEv({ a1: b });
  claim(check('11', ev) && !check('11', evB), `任務 11：6.3 °C、0.5 ms、${a} µA/cm²（閾值 + 0.005）→ ${f(ev.data.lat, 2)} ms 才到峰值；1.02 倍閾值（${b}）只要 ${f(evB.data.lat, 2)} ms`);
  const cold = stimEv({ a1: 30, env: { T: 0 } });
  fresh('11');
  claim(!check('11', cold), `      對照：0 °C 不算（任務要求 6.3 °C 以上）；0 °C、30 µA/cm² 到峰值 ${f(cold.data.lat, 2)} ms`);
}
// 12. 傳導的安全係數
{
  fresh('12');
  const ev = cableEv({ env: { ttx: 0.75 } });
  const lite = cableEv({ env: { ttx: 0.5 } });
  const tooMuch = cableEv({ env: { ttx: 0.85 } });
  claim(check('12', ev) && !check('12', lite) && !check('12', tooMuch),
    `任務 12：河豚毒素 75% → ${f(ev.data.v, 2)} m/s，沒有毒素 ${f(ev.data.vRef, 2)} m/s（${f(100 * ev.data.v / ev.data.vRef, 1)}%），仍傳到另一端；50% 時 ${f(100 * lite.data.v / lite.data.vRef, 1)}% 不夠慢；85% 傳導失敗（right = ${tooMuch.data.right}）`);
}
// h1. 陽極斷電興奮
{
  fresh('h1');
  const ev = stimEv({ a1: -20, dur: 5 });
  const weak = stimEv({ a1: -2, dur: 5 });
  claim(check('h1', ev) && !check('h1', weak), `隱藏 1：−20 µA/cm² 過極化 5 ms，放開時引發動作電位（峰值 ${f(ev.data.peak1, 1)} mV）；−2 µA/cm² 不會`);
}
// h2. 對撞
{
  fresh('h2');
  const ev = cableEv({ xs: [1, 9] });
  claim(check('h2', ev), `隱藏 2：S1 = 1、S2 = 9 cm 同時刺激，兩道衝動在 ${f(ev.data.xMeet, 2)} cm 相撞`);
}
// h3. 一個脈衝、一串動作電位
{
  fresh('h3');
  const ev = stimEv({ a1: 20, env: { kOut: 2 } });
  const ev0 = stimEv({ a1: 20 });
  claim(check('h3', ev) && !check('h3', ev0), `隱藏 3：細胞外 K×2、單一 20 µA/cm² 脈衝 → ${ev.data.n} 個動作電位；正常條件只有 ${ev0.data.n} 個`);
}

const pub = defs.filter(m => !m.hidden), hid = defs.filter(m => m.hidden);
const stars = defs.reduce((s, m) => s + m.level, 0);
claim(pub.length >= 8 && pub.length <= 12 && hid.length >= 2 && hid.length <= 3, `任務數：公開 ${pub.length}、隱藏 ${hid.length}，共 ${stars} 顆星`);

console.log(out.join('\n'));
console.log(fail ? `\n有 ${fail} 項沒有通過。` : '\n全部任務都做得到。');
process.exit(fail ? 1 : 0);
