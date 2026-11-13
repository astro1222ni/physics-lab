/* 任務可達成的證明腳本。用法：node tools/mission-proofs/sediment-transport.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、不該觸發的不會觸發。
 * 事件的內容與 js/sediment-transport.js 的 snapshot() 相同，全部由 js/sediment-transport-core.js 計算。
 * 滑桿可打字的精度：粒徑 0.0001 mm、流速 0.0001 m/s、水深 0.1 m、水溫 0.1 °C、山上流速 0.01 m/s。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const SC = require(ROOT + 'js/sediment-transport-core.js');
const missions = [];
global.window = { SedCore: SC, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/sediment-transport.js');
const SLUG = 'sediment-transport-';
const byId = id => missions.find(m => m.id === SLUG + id);
const RHO = {}; SC.MINERALS.forEach(m => { RHO[m.id] = m.rho; });
const T_BED = 20;

const rd = (v, n) => Math.round(v * Math.pow(10, n)) / Math.pow(10, n);
const DEF = { mode: 'bed', D: 0.2, mineral: 'quartz', shape: 'natural', sample: 'fine', U: 0.2, h: 1, consol: 1, T: 20, U0: 2, chart: 'a', anim: false };
/** 起動流速曲線的最低點（照頁面：先粗找 161 點，再在附近細找） */
function curveMin(o) {
  let best = null;
  for (let i = 0; i <= 160; i++) { const lg = -3 + 5.301 * i / 160, Ue = SC.grain(Object.assign({}, o, { D: Math.pow(10, lg) / 1000 })).Ue; if (!best || Ue < best.Ue) best = { lg: lg, Ue: Ue }; }
  let bl = best.lg, bu = best.Ue;
  for (let i = 0; i <= 100; i++) { const lg = best.lg - 0.05 + 0.1 * i / 100, u = SC.grain(Object.assign({}, o, { D: Math.pow(10, lg) / 1000 })).Ue; if (u < bu) { bu = u; bl = lg; } }
  return { minD: Math.pow(10, bl), minU: bu };
}
function settleOf(d, rho, c2, Tc) {
  const rw = SC.rhoW(Tc), nu = SC.mu(Tc) / rw, R = rho / rw - 1, w = SC.settle(d, R, nu, c2);
  return { w: w, t: 1 / w, Rep: w * d / nu };
}
/** 頁面的狀態 → 事件 */
function ev(o, type) {
  o = Object.assign({}, DEF, o);
  const D = rd(o.D, 4) / 1000, U = rd(o.U, 4), h = rd(o.h, 1), Tc = rd(o.T, 1), U0 = rd(o.U0, 2), C2 = o.shape === 'sphere' ? 0.4 : 1;
  const base = { D: D, h: h, T: T_BED, rhoS: RHO[o.mineral], C2: C2, consol: o.consol };
  const a = SC.fate(base, U, false), b = SC.fate(base, U, true), gr = a.gr;
  const cu = curveMin(base);
  const me = settleOf(D, RHO[o.mineral], C2, Tc), me20 = settleOf(D, RHO[o.mineral], C2, 20);
  const tS = {}, xs = {};
  SC.SAMPLES.forEach(p => { tS[p.id] = settleOf(p.D, SC.RHO_QUARTZ, 1, Tc).t; const q = SC.riverStop({ D: p.D, h: 1, T: T_BED }, U0); xs[p.id] = q.picked ? q.x : -1; });
  const rv = SC.riverStop(Object.assign({}, base, { h: 1 }), U0);
  return { type: type || 'state', data: {
    mode: o.mode, D: D * 1000, mineral: o.mineral, shape: o.shape, sample: o.sample || '', cls: SC.classOf(D).id,
    U: U, h: h, consol: o.consol, bed: a.state, inc: b.state, zone: U > gr.Ue ? 'erode' : U > gr.Ud ? 'transport' : 'deposit',
    Ue: gr.Ue, Ud: gr.Ud, us: a.us, w: gr.w, rouse: a.rouse,
    UeQ: SC.grain({ D: D, h: h, T: T_BED }).Ue, qBed: SC.fate({ D: D, h: h, T: T_BED }, U, false).state, UeH1: SC.grain(Object.assign({}, base, { h: 1 })).Ue,
    UeMin: cu.minU, DMin: cu.minD,
    T: Tc, wS: me.w, t: me.t, t20: me20.t, Rep: me.Rep, tS: tS,
    U0: U0, picked: rv.picked, x: rv.picked ? rv.x : -1, xs: xs,
    chart: o.chart, anim: !!o.anim
  } };
}
const hits = (id, e) => !!e && byId(id).check(e);

let ok = 0, bad = 0;
function expect(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label + (extra ? '（' + extra + '）' : '')); }
  else { bad++; console.error('  ✗ ' + label + (extra ? '（' + extra + '）' : '')); }
}
const allIds = missions.map(m => m.id.replace(SLUG, ''));
const hidIds = allIds.filter(id => id[0] === 'h');
const examples = {};
function ex(id, e, note) { examples[id] = e; expect(id + ' 做得到', hits(id, e), note); }
function no(id, e, note) { expect(id + ' 不觸發：' + note, !hits(id, e)); }
function find(id, gen, avoid) { for (const g of gen()) { const e = ev(g.o, g.type); if (hits(id, e) && !(avoid || []).some(a => hits(a, e))) return { o: g.o, e: e }; } return null; }
const otherHidden = id => hidIds.filter(h => h !== id);
const f2 = v => v.toFixed(2), f3 = v => v.toPrecision(3), f4 = v => v.toPrecision(4);
const fired = e => allIds.filter(id => hits(id, e));
/** 對數掃描（照對數滑桿） */
const lgs = function* (a, b, step) { for (let x = Math.log10(a); x <= Math.log10(b) + 1e-12; x += step) yield Math.pow(10, x); };

console.log('sediment-transport 任務證明');
// 預設狀態：只有「看完一次」的任務
{
  const list = [].concat(fired(ev({})), fired(ev({ mode: 'settle' })), fired(ev({ mode: 'river' })));
  expect('預設狀態（細砂 0.2 mm、0.2 m/s、1 m；20 °C；山上 2 m/s）不觸發任何任務', list.length === 0, list.join(','));
  const r = [fired(ev({}, 'run')), fired(ev({ mode: 'settle' }, 'run')), fired(ev({ mode: 'river' }, 'run'))];
  expect('預設狀態三種動畫各看完一次：只完成任務 1、2、3', r[0].join() === '1' && r[1].join() === '2' && r[2].join() === '3', r.map(x => x.join(',')).join(' / '));
}
// 六種樣本按鈕 × 四種礦物 × 三個模式（預設流速與水溫）：不觸發 4 級以上
{
  const got = {};
  SC.SAMPLES.forEach(s => SC.MINERALS.forEach(m => ['bed', 'settle', 'river'].forEach(md => ['state', 'run'].forEach(tp => {
    fired(ev({ mode: md, D: s.D * 1000, sample: s.id, mineral: m.id }, tp)).forEach(id => { (got[id] = got[id] || []).push(s.id + '/' + m.id + '/' + md); });
  }))));
  const hi = Object.keys(got).filter(id => id[0] === 'h' || byId(id).level >= 4);
  expect('樣本按鈕＋礦物＋模式（預設流速、水深、水溫、山上流速）不會觸發隱藏任務或 4 級以上的任務', hi.length === 0, hi.map(k => k + '：' + got[k].slice(0, 3).join('、')).join('；'));
  console.log('    （會觸發的：' + Object.keys(got).sort().join('、') + '）');
}

// ───── 公開任務 ─────
ex('1', ev({}, 'run'), '預設放一把');
no('1', ev({}), '只調設定');
no('1', ev({ mode: 'river' }, 'run'), '放流不算');
ex('2', ev({ mode: 'settle' }, 'run'), '預設放下顆粒');
no('2', ev({ mode: 'settle' }), '沒放');
ex('3', ev({ mode: 'river' }, 'run'), '預設放流');
no('3', ev({ mode: 'settle' }, 'run'), '沉降不算');

{
  const r = find('4', function* () { for (const U of lgs(0.25, 0.4, 0.001)) yield { o: { U: U } }; });
  ex('4', r && r.e, r && ('0.2 mm、U ' + f3(r.e.data.U) + '：Ue ' + f3(r.e.data.Ue)));
  no('4', ev({ U: 0.4 }), 'U 0.4 m/s 超過 1.1 倍');
  no('4', ev({ U: 0.33, mineral: 'magnetite' }), '磁鐵礦');
  no('4', ev({ D: 1, U: 0.47 }), '粗砂');
}
{
  const r = find('5', function* () { for (const U of lgs(1, 5, 0.002)) yield { o: { D: 0.002, U: U } }; });
  ex('5', r && r.e, r && ('0.002 mm、U ' + f3(r.e.data.U) + '：Ue ' + f3(r.e.data.Ue)));
  no('5', ev({ D: 0.002, U: 1.2 }), '黏土 U 1.2 m/s（Ue ' + f3(ev({ D: 0.002 }).data.Ue) + '）');
  no('5', ev({ D: 0.02, U: 2 }), '粉砂');
}
{
  const r = find('6', function* () { for (const U of lgs(0.5, 2, 0.002)) yield { o: { D: 20, U: U } }; });
  ex('6', r && r.e, r && ('20 mm、U ' + f3(r.e.data.U) + '：Ud ' + f3(r.e.data.Ud) + '、Ue ' + f3(r.e.data.Ue)));
  no('6', ev({ D: 20, U: 2 }), '20 mm、U 2 m/s：侵蝕');
  no('6', ev({ D: 20, U: 0.5 }), '20 mm、U 0.5 m/s：沉積');
  no('6', ev({ D: 1, U: 0.4 }), '粗砂在搬運區');
}
{
  const r = find('7', function* () { for (const D of lgs(0.1, 0.25, 0.002)) yield { o: { mode: 'settle', mineral: 'gold', D: D }, type: 'run' }; });
  ex('7', r && r.e, r && ('金 ' + f3(r.e.data.D) + ' mm：' + f3(r.e.data.t) + ' 秒；粗砂 ' + f3(r.e.data.tS.coarse) + ' 秒'));
  no('7', ev({ mode: 'settle', mineral: 'gold', D: 0.1 }, 'run'), '0.1 mm 的金比粗砂慢（' + f3(ev({ mode: 'settle', mineral: 'gold', D: 0.1 }).data.t) + ' 秒）');
  no('7', ev({ mode: 'settle', mineral: 'magnetite', D: 0.25 }, 'run'), '磁鐵礦');
  no('7', ev({ mode: 'settle', mineral: 'gold', D: 0.25 }), '沒放下');
}
{
  const r = find('8', function* () { for (let T = 4; T >= 0; T -= 0.5) yield { o: { mode: 'settle', D: 0.02, T: T } }; });
  ex('8', r && r.e, r && (r.e.data.T + ' °C：' + f3(r.e.data.t / r.e.data.t20) + ' 倍'));
  no('8', ev({ mode: 'settle', D: 0.02, T: 5 }), '5 °C');
  no('8', ev({ mode: 'settle', D: 1, T: 0 }), '粗砂在 0 °C（' + f3(ev({ mode: 'settle', D: 1, T: 0 }).data.t / ev({ mode: 'settle', D: 1, T: 0 }).data.t20) + ' 倍）');
}
{
  const r = find('9', function* () { for (let U0 = 0.5; U0 <= 5; U0 += 0.05) yield { o: { mode: 'river', U0: U0 }, type: 'run' }; });
  ex('9', r && r.e, r && ('山上 ' + f2(r.e.data.U0) + ' m/s：細砂 ' + f3(r.e.data.xs.fine) + '、中礫 ' + f3(r.e.data.xs.pebble)));
  no('9', ev({ mode: 'river', U0: 2 }, 'run'), '預設 2 m/s（細砂 ' + f3(ev({ mode: 'river' }).data.xs.fine) + '）');
  no('9', ev({ mode: 'river', U0: 4 }, 'run'), '4 m/s（中礫 ' + f3(ev({ mode: 'river', U0: 4 }).data.xs.pebble) + '）');
  if (r) no('9', ev(r.o), '同樣的設定、沒放流');
}
{
  const r = find('10', function* () { for (let U0 = 0.5; U0 <= 5; U0 += 0.05) yield { o: { mode: 'river', U0: U0 }, type: 'run' }; });
  ex('10', r && r.e, r && ('山上 ' + f2(r.e.data.U0) + ' m/s：粗礫停在 ' + f3(r.e.data.xs.cobble)));
  no('10', ev({ mode: 'river', U0: 2.7 }, 'run'), '2.7 m/s');
}
{
  const r = find('11', function* () { for (const D of lgs(0.1, 0.4, 0.002)) { const e0 = ev({ D: D }); yield { o: { D: D, U: rd(e0.data.Ue, 4) + 0.0001 } }; } });
  ex('11', r && r.e, r && (f3(r.e.data.D) + ' mm、U ' + f4(r.e.data.U) + '：最低點 ' + f4(r.e.data.UeMin) + ' 在 ' + f3(r.e.data.DMin) + ' mm'));
  no('11', ev({ D: 1, U: 0.47 }), '粗砂剛好挖起（' + f3(ev({ D: 1 }).data.Ue / ev({ D: 1 }).data.UeMin) + ' 倍）');
  no('11', ev({ D: 0.2, U: 0.33 }), '細砂 U 0.33 m/s（1.05 倍）');
}
{
  const r = find('12', function* () { for (let h = 0.2; h <= 1; h += 0.1) for (const U of lgs(3, 5, 0.002)) yield { o: { D: 4, h: h, U: U } }; });
  ex('12', r && r.e, r && ('4 mm、h ' + r.e.data.h + '、U ' + f3(r.e.data.U) + '：u* ' + f3(r.e.data.us) + ' > w ' + f3(r.e.data.w)));
  no('12', ev({ D: 4, U: 3 }), '4 mm、h 1、U 3 m/s：推移');
  no('12', ev({ D: 4, h: 0.2, U: 5, mineral: 'coal' }), '煤礫');
}

// ───── 隱藏任務 ─────
{
  const r = find('h1', function* () { for (const U of lgs(0.5, 3, 0.002)) yield { o: { D: 20, mineral: 'coal', U: U } }; }, otherHidden('h1'));
  ex('h1', r && r.e, r && ('煤 20 mm、U ' + f3(r.e.data.U) + '：煤 Ue ' + f3(r.e.data.Ue) + '、石英 Ue ' + f3(r.e.data.UeQ)));
  no('h1', ev({ D: 20, U: 2 }), '石英 20 mm U 2 m/s');
  no('h1', ev({ D: 20, mineral: 'coal', U: 2 }), '煤 U 2 m/s：石英也挖得動');
}
{
  const r = find('h2', function* () { for (const D of lgs(0.1, 2, 0.01)) for (const U of lgs(0.5, 5, 0.01)) yield { o: { D: D, mineral: 'gold', U: U } }; }, otherHidden('h2'));
  ex('h2', r && r.e, r && ('金 ' + f3(r.e.data.D) + ' mm、U ' + f3(r.e.data.U) + '：金 Ue ' + f3(r.e.data.Ue) + '、石英 ' + r.e.data.qBed));
  no('h2', ev({ D: 0.2, mineral: 'gold', U: 0.4 }), '石英細砂只是推移');
  no('h2', ev({ D: 0.2, mineral: 'magnetite', U: 0.6 }), '磁鐵礦');
}
{
  const r = find('h3', function* () { for (const U of lgs(2, 5, 0.002)) yield { o: { D: 0.002, consol: 4, U: U } }; }, otherHidden('h3'));
  ex('h3', r && r.e, r && ('壓實黏土、U ' + f3(r.e.data.U) + '：Ue ' + f3(r.e.data.Ue)));
  no('h3', ev({ D: 0.002, U: 2 }), '鬆散的黏土');
  no('h3', ev({ D: 0.002, consol: 4, U: 2.5 }), '壓實黏土、U 2.5 m/s');
}
{
  const r = find('h4', function* () { for (const D of lgs(0.004, 0.06, 0.01)) yield { o: { D: D, U: 0.01 } }; }, otherHidden('h4'));
  ex('h4', r && r.e, r && (f3(r.e.data.D) + ' mm、U 0.01 m/s：u* ' + f3(r.e.data.us) + ' > w ' + f3(r.e.data.w)));
  no('h4', ev({ D: 0.02, U: 0.02 }), 'U 0.02 m/s');
  no('h4', ev({ D: 0.2, U: 0.01 }), '細砂沉積');
}
{
  const r = find('h5', function* () { for (const D of lgs(0.05, 0.2, 0.0005)) yield { o: { mode: 'settle', D: D } }; }, otherHidden('h5'));
  ex('h5', r && r.e, r && (f3(r.e.data.D) + ' mm：Re ' + f3(r.e.data.Rep)));
  no('h5', ev({ mode: 'settle' }), '0.2 mm（Re ' + f3(ev({ mode: 'settle' }).data.Rep) + '）');
  if (r) no('h5', ev(Object.assign({}, r.o, { mode: 'bed' })), '河床模式');
}
{
  const r = find('h6', function* () { for (const D of lgs(0.05, 0.6, 0.001)) yield { o: { mode: 'settle', mineral: 'magnetite', D: D } }; }, otherHidden('h6'));
  ex('h6', r && r.e, r && ('磁鐵礦 ' + f3(r.e.data.D) + ' mm：' + f3(r.e.data.t) + ' 秒；細砂 ' + f3(r.e.data.tS.fine) + ' 秒'));
  const r2 = find('h6', function* () { for (const D of lgs(0.2, 1, 0.001)) yield { o: { mode: 'settle', mineral: 'coal', D: D } }; }, otherHidden('h6'));
  expect('h6 也可以用煤（比細砂粗）', !!r2, r2 && ('煤 ' + f3(r2.e.data.D) + ' mm'));
  no('h6', ev({ mode: 'settle', mineral: 'magnetite', D: 0.2 }), '磁鐵礦 0.2 mm（快太多）');
  no('h6', ev({ mode: 'settle', D: 0.2 }), '石英本身');
}
{
  const r = find('h7', function* () { for (let h = 8; h <= 10; h += 0.1) for (const D of lgs(0.1, 10, 0.05)) { const e0 = ev({ D: D, h: h }); yield { o: { D: D, h: h, U: (e0.data.UeH1 + e0.data.Ue) / 2 } }; } }, otherHidden('h7'));
  ex('h7', r && r.e, r && (f3(r.e.data.D) + ' mm、h ' + r.e.data.h + '、U ' + f3(r.e.data.U) + '：Ue ' + f3(r.e.data.Ue) + '、1 m 時 ' + f3(r.e.data.UeH1)));
  if (r) { no('h7', ev(Object.assign({}, r.o, { h: 1 })), '同樣的流速在 1 m'); no('h7', ev(Object.assign({}, r.o, { h: 7.9 })), '水深 7.9 m'); }
}
{
  const r = find('h8', function* () { for (const D of lgs(0.02, 0.06, 0.0005)) yield { o: { mode: 'river', D: D }, type: 'run' }; }, otherHidden('h8'));
  ex('h8', r && r.e, r && (f3(r.e.data.D) + ' mm：停在 ' + f3(r.e.data.x)));
  no('h8', ev({ mode: 'river', D: 0.02 }, 'run'), '0.02 mm 帶進海裡');
  no('h8', ev({ mode: 'river', D: 0.2 }, 'run'), '細砂停在 78 %');
}
{
  const r = find('h9', function* () { for (let U0 = 2; U0 <= 5; U0 += 0.05) for (const D of lgs(0.5, 5, 0.01)) yield { o: { mode: 'river', mineral: 'gold', D: D, U0: U0 }, type: 'run' }; }, otherHidden('h9'));
  ex('h9', r && r.e, r && ('金 ' + f3(r.e.data.D) + ' mm、山上 ' + f2(r.e.data.U0) + '：金停在 ' + f3(r.e.data.x) + '、中礫 ' + f3(r.e.data.xs.pebble)));
  no('h9', ev({ mode: 'river', mineral: 'gold', D: 0.2, U0: 3 }, 'run'), '0.2 mm 的金比中礫遠');
  no('h9', ev({ mode: 'river', D: 30, U0: 3 }, 'run'), '石英 30 mm');
}
{
  const r = find('h10', function* () { for (const U of lgs(2.5, 5, 0.002)) yield { o: { D: 150, U: U } }; }, otherHidden('h10'));
  ex('h10', r && r.e, r && ('150 mm、U ' + f3(r.e.data.U) + '：Ue ' + f3(r.e.data.Ue)));
  no('h10', ev({ D: 100, U: 4 }), '100 mm');
  no('h10', ev({ D: 150, U: 2.5 }), 'U 2.5 m/s 不動');
}

// 隱藏任務兩兩不連帶
{
  const pairs = [];
  hidIds.forEach(id => { const e = examples[id]; if (!e) return; otherHidden(id).forEach(o => { if (hits(o, e)) pairs.push(id + '→' + o); }); });
  expect('每個隱藏任務的解法都不會順便完成別的隱藏任務', pairs.length === 0, pairs.join('、'));
}
// 每個任務都有解法
expect('22 個任務都找到解法', allIds.every(id => examples[id]), allIds.filter(id => !examples[id]).join(','));
// 等級分布
{
  const hid = missions.filter(m => m.hidden), lv = hid.map(m => m.level);
  expect('隱藏任務 10 個、等級 3–10、至少 3 個 7 級以上', hid.length === 10 && Math.min.apply(null, lv) >= 3 && Math.max.apply(null, lv) <= 10 && lv.filter(l => l >= 7).length >= 3, lv.join(','));
  expect('公開任務 12 個、等級 1–10', missions.filter(m => !m.hidden).length === 12);
  console.log('    公開星星 ' + missions.filter(m => !m.hidden).reduce((s, m) => s + m.level, 0) + '、隱藏星星 ' + hid.reduce((s, m) => s + 2 * m.level, 0));
}
console.log('sediment-transport：' + ok + ' 項通過' + (bad ? '，' + bad + ' 項失敗' : ''));
if (bad) process.exitCode = 1;
