/* 任務可達成的證明腳本。用法：node tools/mission-proofs/loudness.js
 * 用數學核心（js/loudness-core.js）模擬頁面發出的事件（格式與 js/loudness.js 相同），證明：
 *   1. 每個任務在滑桿範圍與精度內做得到（印出找到的解）；
 *   2. 預設狀態（250 Hz、60 dB；聲源 1 70 dB、聲源 2 64 dB、1 m；80 dBA、2 小時）按播放、比較、鎖定、開關聲源 2、
 *      「用上面的合計」，都不觸發任何任務；
 *   3. 隱藏任務兩兩不連帶：做某個隱藏任務的完整步驟，不會順便完成其他隱藏任務；
 *   4. 亂按模擬（2000 回 × 80 步）：6 級以上的公開任務亂按完成率 < 5%，隱藏任務 < 1%；
 *   5. 任務數量與等級符合規格。
 * 滑桿精度（和頁面相同）：頻率滑桿 0–1000 格（對數，每格約 0.65%，頁面把頻率四捨五入到 0.1 Hz），打字到 0.1 Hz；
 *   聲壓級 −10–130 dB 每格 0.5、打字 0.1；響度級 0–100 phon 每格 0.5、打字 0.1；
 *   聲源 30–110 dB 每格 0.5、打字 0.1；N 1–20；距離 r = 2^(k/4)，k = −4…20（0.5–32 m），打字到 0.01 m；
 *   聲級 70–115 dBA 每格 0.5、打字 0.1；時數 0–12 每格 0.25、打字 0.01。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const L = require(ROOT + 'js/loudness-core.js');
const missions = [];
global.window = { LoudCore: L, LabMission: { register: (id, list) => list.forEach(m => missions.push(Object.assign({ mem: {} }, m))) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/loudness.js');
const byId = id => missions.find(m => m.id === 'loudness-' + id);
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, half = v => Math.round(v * 2) / 2;
const clamp = L.clamp;

// ---------- 和頁面相同的狀態與事件 ----------
function Sim() {
  const st = { f: 250, Lp: 60, phon: 40, locked: false, src: { L1: 70, N: 1, L2: 64, on2: true, r: 1 }, dz: { L: 80, h: 2 } };
  const ev = [];
  const cur = () => L.analyze(st.f, st.Lp);
  const liteP = () => { const a = cur(); return { f: st.f, Lp: st.Lp, phon: a.phon, sone: a.sone, locked: st.locked, audible: a.audible }; };
  const liteS = () => { const m = L.mix(st.src); return { L1: m.L1, N: m.N, L2: m.L2, on2: m.on2, r: m.r, total1: m.total1, totalR: m.totalR }; };
  const liteD = () => ({ L: st.dz.L, h: st.dz.h, T: L.nioshHours(st.dz.L), dose: L.dose(st.dz.L, st.dz.h) });
  let cP = liteP(), cS = liteS(), cD = liteD();
  const clone = o => JSON.parse(JSON.stringify(o));
  function point(via) {
    const a = cur(), prev = cP;
    ev.push({ type: 'point', data: clone(Object.assign(a, { locked: st.locked, target: st.locked ? st.phon : null, via, prev, dLp: st.Lp - prev.Lp })) });
    cP = liteP();
  }
  function sum(via) { ev.push({ type: 'sum', data: clone(Object.assign(L.mix(st.src), { via, prev: cS })) }); cS = liteS(); }
  function dose(via, extra) { ev.push({ type: 'dose', data: clone(Object.assign(liteD(), { via, prev: cD }, extra || {})) }); cD = liteD(); }
  const applyF = f => { st.f = Math.round(L.clampF(f) * 10) / 10; if (st.locked) st.Lp = L.splFromPhon(st.f, st.phon); };
  const changedP = () => !(Math.abs(cP.f - st.f) < 1e-9 && Math.abs(cP.Lp - st.Lp) < 1e-9);
  const api = {
    st, ev, cur,
    /** 頻率滑桿拖到第 p 格 */
    fpos(p) { applyF(L.fFromPos(clamp(Math.round(p), 0, L.FPOS_MAX))); if (changedP()) point('f'); return api; },
    /** 頻率打字（0.1 Hz） */
    ftype(f) { applyF(r1(f)); if (changedP()) point('f'); return api; },
    quick(f) { const g = Math.round(L.clampF(f) * 10) / 10; if (Math.abs(g - st.f) >= 1e-9) { applyF(g); point('quick'); } return api; },
    lp(v, typed) { if (st.locked) return api; st.Lp = clamp(typed ? r1(v) : half(v), L.LP_MIN, L.LP_MAX); if (changedP()) point('lp'); return api; },
    phon(v, typed) { if (!st.locked) return api; st.phon = clamp(typed ? r1(v) : half(v), 0, 100); st.Lp = L.splFromPhon(st.f, st.phon); if (changedP()) point('phon'); return api; },
    lock() { st.locked = !st.locked; if (st.locked) { const a = cur(); st.phon = clamp(a.phon == null ? 0 : a.phon, 0, 100); st.Lp = L.splFromPhon(st.f, st.phon); } point('lock'); return api; },
    play(kind) { const a = cur(); if (a.audible) ev.push({ type: 'play', data: clone(Object.assign(a, { locked: st.locked, target: st.locked ? st.phon : null, kind: kind || 'one' })) }); return api; },
    l1(v, typed) { st.src.L1 = clamp(typed ? r1(v) : half(v), 30, 110); if (st.src.L1 !== cS.L1) sum('l1'); return api; },
    l2(v, typed) { st.src.L2 = clamp(typed ? r1(v) : half(v), 30, 110); if (st.src.L2 !== cS.L2) sum('l2'); return api; },
    n(v) { st.src.N = clamp(Math.round(v), 1, 20); if (st.src.N !== cS.N) sum('n'); return api; },
    k(k) { st.src.r = L.rFromK(clamp(Math.round(k), L.R_KMIN, L.R_KMAX)); if (Math.abs(st.src.r - cS.r) > 1e-9) sum('r'); return api; },
    rtype(r) { st.src.r = clamp(r2(r), L.R_MIN, L.R_MAX); if (Math.abs(st.src.r - cS.r) > 1e-9) sum('r'); return api; },
    on2() { st.src.on2 = !st.src.on2; sum('on2'); return api; },
    dyn(id) { st.src.L1 = L.DYNAMICS.find(d => d.id === id).L; sum('dyn'); return api; },
    lv(v, typed) { st.dz.L = clamp(typed ? r1(v) : half(v), 70, 115); if (st.dz.L !== cD.L) dose('lv'); return api; },
    hrs(v, typed) { st.dz.h = clamp(typed ? r2(v) : Math.round(v * 4) / 4, 0, 12); if (st.dz.h !== cD.h) dose('h'); return api; },
    useSum() { st.dz.L = clamp(r1(L.mix(st.src).totalR), 70, 115); dose('copy', { from: liteS() }); return api; }
  };
  return api;
}
/** 依序把事件送進任務；傳回完成的任務代號 */
function run(evs, list) {
  list = list || missions;
  list.forEach(m => { m.mem = {}; });
  const done = new Set();
  evs.forEach(e => list.forEach(m => { if (!done.has(m.id) && m.check(e, m.mem)) done.add(m.id); }));
  return done;
}
let fail = 0;
function prove(id, sim, msg) {
  const m = byId(id);
  const ok = run(sim.ev, [m]).has(m.id);
  if (!ok) fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + m.id + '（' + m.level + ' 級' + (m.hidden ? '・隱藏' : '') + '）：' + msg);
  return sim;
}
const last = s => s.ev[s.ev.length - 1].data;
const fx = (v, d) => (v == null ? '—' : v.toFixed(d));
const posOf = f => Math.round(L.posFromF(f));
/** 在頻率滑桿的格子裡找第一個讓 cond(f) 成立的格子 */
function findPos(cond, lo, hi) { for (let p = lo || 0; p <= (hi == null ? L.FPOS_MAX : hi); p++) if (cond(L.fFromPos(p), p)) return p; return null; }

console.log('一、每個任務都做得到');
{ const s = Sim().quick(1000); prove('1', s, '按「1 k」（聲壓級維持預設 60 dB）→ ' + fx(last(s).phon, 2) + ' phon'); }
{ const s = Sim().fpos(250).lp(20); const d = last(s); prove('2', s, '頻率滑桿第 250 格（' + fx(d.f, 1) + ' Hz）、聲壓級 20 dB：聽閾 ' + fx(d.thr, 1) + ' dB，聽不到'); }
{ const s = Sim().l2(70); prove('3', s, '聲源 2 從 64 調到 70 dB（和聲源 1 一樣）→ 多 ' + fx(last(s).incOne, 2) + ' dB，約 ' + fx(last(s).loudRatio, 2) + ' 倍響'); }
{ const s = Sim().lv(94); prove('4', s, '聲級 94 dBA → 每天 ' + fx(last(s).T, 2) + ' 小時'); }
{ const s = Sim().lock().phon(40).fpos(250); const d = last(s); prove('5', s, '鎖定、響度級 40 phon、頻率第 250 格（' + fx(d.f, 1) + ' Hz）→ ' + fx(d.Lp, 2) + ' dB'); }
{ const s = Sim().lock().phon(60).fpos(250).play('cmp'); const d = last(s); prove('6', s, '鎖定 60 phon、100 Hz、「先 1 kHz 再這個頻率」：' + fx(d.lp1k, 1) + ' dB 對 ' + fx(d.Lp, 1) + ' dB'); }
{ const s = Sim().k(4).k(8); const d = last(s); prove('7', s, '距離 2 m → 4 m：' + fx(d.prev.totalR, 2) + ' → ' + fx(d.totalR, 2) + ' dB（' + fx(d.totalR - d.prev.totalR, 2) + ' dB）'); }
{
  const m40 = L.contourMin(40);
  const p = findPos(f => L.splFromPhon(f, 40) - m40.Lp <= 0.2, posOf(1500));
  const p2 = findPos(f => L.splFromPhon(f, 40) - m40.Lp > 0.2, p);
  const s = Sim().lock().phon(40).fpos(p);
  prove('8', s, '鎖定 40 phon：最低點 ' + fx(m40.f, 0) + ' Hz、' + fx(m40.Lp, 2) + ' dB；滑桿第 ' + p + '–' + (p2 - 1) + ' 格（' + fx(L.fFromPos(p), 0) + '–' + fx(L.fFromPos(p2 - 1), 0) + ' Hz）都在 0.2 dB 內');
}
{ const s = Sim().hrs(2).lv(91); prove('9', s, '2 小時、91 dBA → 劑量 ' + fx(last(s).dose, 2) + '%'); }
{ const s = Sim().lock().fpos(posOf(50)).phon(20).phon(40); const d = last(s); prove('10', s, '鎖定、頻率第 ' + posOf(50) + ' 格（' + fx(d.f, 1) + ' Hz）、20 → 40 phon：聲壓級 ' + fx(d.prev.Lp, 2) + ' → ' + fx(d.Lp, 2) + ' dB（只加 ' + fx(d.dLp, 2) + ' dB）'); }
{
  const s = Sim().on2().l1(109).k(16); const d = last(s);
  const s2 = Sim().on2().l1(110).rtype(17.78);
  prove('11', s, '聲源 2 關、聲源 1 109 dB、距離第 16 格（' + fx(d.r, 0) + ' m）→ ' + fx(d.totalR, 2) + ' dB；也可以 110 dB、打字 17.78 m → ' + fx(last(s2).totalR, 3) + ' dB');
}
{
  const s = Sim().lock().quick(1000).phon(80).phon(50).fpos(posOf(50)).phon(80).phon(50);
  prove('12', s, '鎖定；1 kHz 80 → 50 phon 降 ' + fx(L.splFromPhon(1000, 80) - L.splFromPhon(1000, 50), 2) + ' dB；50 Hz（第 ' + posOf(50) + ' 格）80 → 50 phon 只降 ' + fx(-last(s).dLp, 2) + ' dB');
}
const hiddenSol = {};
hiddenSol.h1 = prove('h1', Sim().quick(1000).lp(2.4, true), '按「1 k」、聲壓級打字 2.4 dB（1 kHz 的聽閾）→ ' + fx(L.analyze(1000, 2.4).phon, 2) + ' phon');
hiddenSol.h2 = prove('h2', Sim().on2().l2(60).on2(), '關掉聲源 2、把它調到 60 dB 再打開（聲源 1 70 dB）→ 合計 ' + fx(L.sumDb([70, 60]), 2) + ' dB（只多 ' + fx(L.sumDb([70, 60]) - 70, 2) + ' dB）');
hiddenSol.h3 = prove('h3', Sim().l2(70).on2().n(10), '先把聲源 2 調成和聲源 1 一樣（70 dB，+3 dB），再關掉聲源 2、N 從 1 改成 10 → +' + fx(L.nSame(70, 10) - 70, 2) + ' dB，響度 ×2');
{
  const p = posOf(3400), f = L.fFromPos(p);
  hiddenSol.h4 = prove('h4', Sim().fpos(p).lp(-4), '頻率第 ' + p + ' 格（' + fx(f, 0) + ' Hz，聽閾 ' + fx(L.threshold(f), 2) + ' dB）、聲壓級 −4 dB → ' + fx(L.analyze(f, -4).phon, 2) + ' phon，聽得到');
}
hiddenSol.h5 = prove('h5', Sim().l1(82).l2(82), '兩個聲源都 82 dB → 合計 ' + fx(L.sumDb([82, 82]), 3) + ' dB，剛好 8 小時');
{ const s = Sim().quick(1000).lp(70); const d = last(s); hiddenSol.h6 = prove('h6', s, '1 kHz、60 → 70 dB：' + fx(d.prev.sone, 3) + ' → ' + fx(d.sone, 3) + ' sone'); }
{
  const s = Sim().fpos(0).lock().phon(40).phon(50); const d = last(s);
  hiddenSol.h7 = prove('h7', s, '頻率滑桿最左（20 Hz）、鎖定、40 → 50 phon：只加 ' + fx(d.dLp, 2) + ' dB，響度 ' + fx(d.prev.sone, 2) + ' → ' + fx(d.sone, 2) + ' sone');
}
{
  const s = Sim().on2().n(4).k(4); const d = last(s);
  hiddenSol.h8 = prove('h8', s, '聲源 2 關；N 1 → 4（1 m）、距離 1 → 2 m：' + fx(L.mix({ L1: 70, N: 1, on2: false, r: 1 }).totalR, 3) + ' dB 與 ' + fx(d.totalR, 3) + ' dB 一樣');
}
{
  const mx = L.contourMax(40);
  const p = findPos(f => f >= 7000 && mx.Lp - L.splFromPhon(f, 40) <= 0.1, posOf(7000));
  const p2 = findPos(f => mx.Lp - L.splFromPhon(f, 40) > 0.1, p);
  const pv = posOf(L.contourMin(40).f);
  hiddenSol.h9 = prove('h9', Sim().lock().phon(40).fpos(pv).fpos(p), '鎖定 40 phon、先到谷底（第 ' + pv + ' 格）；小山頂在 ' + fx(mx.f, 0) + ' Hz、' + fx(mx.Lp, 2) + ' dB；滑桿第 ' + p + '–' + (p2 - 1) + ' 格（' + fx(L.fFromPos(p), 0) + '–' + fx(L.fFromPos(p2 - 1), 0) + ' Hz）都在 0.1 dB 內');
}
{
  const pm = posOf(3400), fm = L.fFromPos(pm);
  const s = Sim().fpos(0).lp(78.5, true).fpos(pm).lp(L.threshold(fm), true).fpos(1000).lp(12.3, true);
  hiddenSol.h10 = prove('h10', s, '20 Hz 打字 78.5 dB、' + fx(fm, 0) + ' Hz 打字 ' + fx(r1(L.threshold(fm)), 1) + ' dB、12.5 kHz 打字 12.3 dB：三點都在聽閾上（約 ' + fx(L.PHON_AT_THRESHOLD, 1) + ' phon）');
}

console.log('\n二、預設狀態不觸發任何任務');
{
  const s = Sim();
  s.play().play('cmp').lock().lock().on2().on2().useSum().play();
  const done = run(s.ev);
  if (done.size) { fail++; console.log('  ✗ 預設狀態就完成了：' + Array.from(done).join('、')); }
  else console.log('  ✓ 預設（250 Hz、60 dB、聲源 70／64 dB、1 m、80 dBA、2 小時）播放、比較、鎖定又解除、開關聲源 2、「用上面的合計」：沒有任務完成');
  const one = [['按「1 k」以外的常用頻率', Sim().quick(500).quick(2000)], ['力度 ff', Sim().dyn('ff')], ['N = 2', Sim().n(2)], ['距離加到 1.19 m', Sim().k(1)], ['時數 3', Sim().hrs(3)]];
  one.forEach(([n, s2]) => {
    const d = run(s2.ev.concat(s2.play().ev.slice(-1)));
    if (d.size) { fail++; console.log('  ✗ 只' + n + '就完成：' + Array.from(d).join('、')); }
    else console.log('  ✓ 只' + n + '再播放：沒有任務完成');
  });
}

console.log('\n三、隱藏任務兩兩不連帶');
{
  const hidden = missions.filter(m => m.hidden);
  let bad = 0;
  hidden.forEach(h => {
    const key = h.id.replace('loudness-', '');
    const done = run(hiddenSol[key].ev, hidden);
    const extra = Array.from(done).filter(id => id !== h.id);
    if (extra.length) { bad++; console.log('  ✗ ' + h.id + ' 的解也完成了 ' + extra.join('、')); }
    else console.log('  ✓ ' + h.id + ' 的解不會完成其他隱藏任務');
  });
  if (bad) fail++;
}

console.log('\n四、亂按模擬（2000 回 × 80 步；滑桿拖到隨機格子，其中兩成拖到最左或最右）');
{
  let seed = 20261113;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pickI = n => Math.floor(rnd() * n);
  const rr = (lo, hi) => rnd() < 0.2 ? (rnd() < 0.5 ? lo : hi) : lo + rnd() * (hi - lo);
  const QF = [63, 125, 250, 500, 1000, 2000, 4000, 8000], DY = ['pp', 'p', 'mp', 'mf', 'f', 'ff'];
  const counts = {};
  for (let r = 0; r < 2000; r++) {
    const s = Sim();
    for (let k = 0; k < 80; k++) {
      const a = pickI(20);
      if (a <= 2) s.fpos(rr(0, L.FPOS_MAX));
      else if (a === 3) s.quick(QF[pickI(QF.length)]);
      else if (a === 4 || a === 5) s.lp(rr(L.LP_MIN, L.LP_MAX));
      else if (a === 6 || a === 7) s.phon(rr(0, 100));
      else if (a === 8) s.lock();
      else if (a === 9) s.play(rnd() < 0.5 ? 'one' : 'cmp');
      else if (a === 10) s.l1(rr(30, 110));
      else if (a === 11) s.l2(rr(30, 110));
      else if (a === 12) s.n(rr(1, 20));
      else if (a === 13) s.k(rr(L.R_KMIN, L.R_KMAX));
      else if (a === 14) s.on2();
      else if (a === 15) s.dyn(DY[pickI(DY.length)]);
      else if (a === 16) s.lv(rr(70, 115));
      else if (a === 17) s.hrs(rr(0, 12));
      else if (a === 18) s.useSum();
      else s.play();
    }
    run(s.ev).forEach(id => { counts[id] = (counts[id] || 0) + 1; });
  }
  const pct = id => (counts[id] || 0) / 2000 * 100;
  console.log('  ' + missions.map(m => m.id + (m.hidden ? '（隱藏 ' : '（') + m.level + ' 級）' + pct(m.id).toFixed(2) + '%').join('\n  '));
  const risky = missions.filter(m => !m.hidden && m.level >= 6 && pct(m.id) >= 5);
  const riskyH = missions.filter(m => m.hidden && pct(m.id) >= 1);
  if (risky.length) { fail++; console.log('  ✗ 6 級以上的公開任務亂按完成率超過 5%：' + risky.map(m => m.id).join('、')); }
  else console.log('  ✓ 6 級以上的公開任務亂按完成率都不到 5%');
  if (riskyH.length) { fail++; console.log('  ✗ 隱藏任務亂按完成率超過 1%：' + riskyH.map(m => m.id).join('、')); }
  else console.log('  ✓ 隱藏任務亂按完成率都不到 1%');
}

console.log('\n五、任務數量與等級');
{
  const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
  const checks = [
    [pub.length >= 10 && pub.length <= 12, '公開任務 ' + pub.length + ' 個（等級 ' + pub.map(m => m.level).join('、') + '）'],
    [hid.length === 10, '隱藏任務 ' + hid.length + ' 個（等級 ' + hid.map(m => m.level).join('、') + '，星星 = 等級 × 2）'],
    [hid.every(m => m.level >= 3 && m.level <= 10), '隱藏任務等級都在 3–10'],
    [hid.filter(m => m.level >= 7).length >= 3, '隱藏任務 7 級以上有 ' + hid.filter(m => m.level >= 7).length + ' 個'],
    [Object.values(hid.reduce((o, m) => { o[m.level] = (o[m.level] || 0) + 1; return o; }, {})).every(n => n <= 2), '同一級的隱藏任務最多 2 個'],
    [pub.every(m => m.title && m.title.zh && m.title.en && m.desc && m.desc.zh && m.desc.en), '公開任務都有中英標題與說明'],
    [hid.every(m => m.riddle && m.riddle.zh && m.riddle.en && !m.title && !m.desc), '隱藏任務只有中英謎語'],
    [new Set(missions.map(m => m.id)).size === missions.length && missions.every(m => /^loudness-(h?\d+)$/.test(m.id)), '代號不重複、格式正確'],
    [missions.every(m => !/[\u2070-\u209F\u20D0-\u20FF]/.test(JSON.stringify([m.title, m.desc, m.riddle]))), '沒有 Unicode 上下標或組合字元']
  ];
  checks.forEach(c => { if (!c[0]) fail++; console.log((c[0] ? '  ✓ ' : '  ✗ ') + c[1]); });
}

console.log(fail ? '\n有 ' + fail + ' 項沒有通過。' : '\n全部任務都證明做得到，預設狀態不觸發，隱藏任務互不連帶、亂按不誤觸。');
process.exit(fail ? 1 : 0);
