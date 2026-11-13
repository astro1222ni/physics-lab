/* 任務可達成的證明腳本。用法：node tools/mission-proofs/sun-energy.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、不該觸發的不會觸發。
 * 事件的內容與 js/sun-energy.js 的 snapshot() 相同，全部由 js/sun-energy-core.js 計算。
 * 滑桿可打字的精度：半徑 0.001、溫度 1 K、質量 0.001、距離 0.0001 AU、太陽高度 0.1°、τ 0.01、吸收率 0.01、水 1 g、時間 0.1 min、比例 0.1 %。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const SC = require(ROOT + 'js/sun-energy-core.js');
const missions = [];
global.window = { SunCore: SC, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/sun-energy.js');
const SLUG = 'sun-energy-';
const byId = id => missions.find(m => m.id === SLUG + id);
const STAR = {};
SC.STARS.forEach(s => { STAR[s.id] = s; });

const rd = (v, n) => Math.round(v * Math.pow(10, n)) / Math.pow(10, n);
const DEF = { mode: 'flux', star: 'sun', d: 1, h: 60, tau: 0.3, alpha: 0.95, mw: 200, dur: 10, f: 10, recs: [], anim: false, chart: 'a' };
/** 一筆 Langley 紀錄（照頁面：曬完一次就記下 m、τ 與算出的照度） */
function rec(o) { o = Object.assign({}, DEF, o); const r = SC.pan({ S: SC.S0, h: rd(o.h, 1), tau: rd(o.tau, 2), alpha: rd(o.alpha, 2), mw: Math.round(o.mw) / 1000, dur: rd(o.dur, 1) * 60 }); return { m: r.m, tau: rd(o.tau, 2), Iest: r.Iest }; }
/** 頁面的狀態 → 事件。o.star 給代號就套用預設恆星；自己調 R、T、M 時 star 是 ''。o.recs 是之前曬完的紀錄（recs 的設定）。 */
function ev(o, type) {
  o = Object.assign({}, DEF, o);
  let R, T, M;
  if (o.star) { const s = STAR[o.star]; R = s.R; T = s.T; M = s.M; }
  else { R = rd(o.R, 3); T = Math.round(o.T); M = rd(o.M == null ? 1 : o.M, 3); }
  const d = rd(o.d, 4), Lw = SC.lum(R, T), inside = d * SC.AU <= R * SC.RSUN, S = inside ? null : SC.flux(Lw, d);
  const g = { h: rd(o.h, 1), tau: rd(o.tau, 2), alpha: rd(o.alpha, 2), mw: Math.round(o.mw), dur: rd(o.dur, 1) };
  const r = SC.pan({ S: SC.S0, h: g.h, tau: g.tau, alpha: g.alpha, mw: g.mw / 1000, dur: g.dur * 60 });
  let recs = o.recs.map(x => rec(x));
  if (type === 'run' && o.mode === 'ground') recs = recs.concat([{ m: r.m, tau: g.tau, Iest: r.Iest }]);
  recs = recs.slice(-12);
  const same = recs.filter(x => Math.abs(x.tau - g.tau) < 1e-9);
  const f = SC.langley(same.map(x => ({ m: x.m, I: x.Iest })));
  const ms = same.map(x => x.m);
  const fr = rd(o.f, 1) / 100, t = SC.lifetimes(Lw, M, R, fr), fu = SC.fusion(Lw);
  return { type: type || 'state', data: {
    mode: o.mode, star: o.star || '', R: R, T: T, M: M, L: Lw / SC.LSUN, d: d,
    inside: inside, S: S, Srel: S == null ? null : S / SC.S0, lam: SC.wien(T) * 1e9, tLight: SC.lightTime(d),
    nuCm2: inside ? null : SC.nuFlux(Lw, d) * 1e-4,
    h: g.h, tau: g.tau, alpha: g.alpha, mw: g.mw, dur: g.dur,
    m: r.m, Ig: r.Ig, Iest: r.Iest, dT: r.dT, P: r.P, eqFrac: r.dT / (r.P / SC.PAN.K),
    lg: f ? { n: same.length, S0: f.S0, tau: f.tau, r2: f.r2, mMin: Math.min.apply(null, ms), mMax: Math.max.apply(null, ms) } : null, nrec: recs.length,
    f: fr, rate: fu.rate, dm: fu.dm, H: fu.H, tChem: t.chem, tGrav: t.grav, tNuc: t.nuc,
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
/** 對數距離，照滑桿位置 */
const lgd = function* (a, b, step) { for (let x = Math.log10(a); x <= Math.log10(b) + 1e-12; x += step) yield rd(Math.pow(10, x), 4); };

console.log('sun-energy 任務證明');
// 預設狀態與三個模式：只有「看完一次」的任務
{
  const list = [].concat(fired(ev({})), fired(ev({ mode: 'ground' })), fired(ev({ mode: 'fusion' })));
  expect('預設狀態（今天的太陽、1 AU；地面 h 60°、τ 0.3；燒掉 10 %）不觸發任何任務', list.length === 0, list.join(','));
  const r = [fired(ev({}, 'run')), fired(ev({ mode: 'ground' }, 'run')), fired(ev({ mode: 'fusion' }, 'run'))];
  expect('預設狀態三種動畫各看完一次：只完成任務 1、2、3', r[0].join() === '1' && r[1].join() === '2' && r[2].join() === '3', r.map(x => x.join(',')).join(' / '));
}
// 六顆預設恆星在八顆行星的距離（加上冥王星）：不觸發隱藏任務或 4 級以上的任務
{
  const got = {};
  SC.STARS.forEach(s => SC.PLANETS.forEach(p => ['flux', 'fusion'].forEach(m => {
    fired(ev({ mode: m, star: s.id, d: p.a })).concat(fired(ev({ mode: m, star: s.id, d: p.a }, 'run'))).forEach(id => { (got[id] = got[id] || []).push(s.id + '@' + p.id); });
  })));
  const hi = Object.keys(got).filter(id => id[0] === 'h' || +id >= 4);
  expect('六顆預設恆星放在每顆行星的距離，不會觸發隱藏任務或 4 級以上的任務', hi.length === 0, hi.map(k => k + '：' + got[k].slice(0, 3).join('、')).join('；'));
  console.log('    （會觸發的：' + Object.keys(got).sort().join('、') + '）');
}

// ───── 公開任務 ─────
ex('1', ev({}, 'run'), '預設看完一次');
no('1', ev({}), '只調設定');
no('1', ev({ mode: 'fusion' }, 'run'), '核融合動畫不算');
ex('2', ev({ mode: 'ground' }, 'run'), '預設曬完一次');
no('2', ev({ mode: 'ground' }), '沒曬完');
ex('3', ev({ mode: 'fusion' }, 'run'), '預設看完一次');
no('3', ev({ mode: 'ground' }, 'run'), '地面曬完不算');

{
  const r = find('4', function* () { for (const d of lgd(1.9, 2.1, 0.0005)) yield { o: { d: d } }; });
  ex('4', r && r.e, r && (r.e.data.d + ' AU：' + f4(r.e.data.S) + ' W/m²'));
  no('4', ev({ d: 1.524 }), '火星 ' + f4(ev({ d: 1.524 }).data.S) + ' W/m²');
  no('4', ev({ star: 'young', d: 2 }), '45 億年前的太陽');
}
{
  const r = find('5', function* () { for (let T = 3200; T >= 2000; T -= 1) yield { o: { star: '', R: 1, T: T } }; });
  ex('5', r && r.e, r && (r.e.data.T + ' K：' + f4(r.e.data.lam) + ' nm'));
  no('5', ev({ star: 'proxima' }), '比鄰星 ' + f3(ev({ star: 'proxima' }).data.lam) + ' nm');
  no('5', ev({ mode: 'ground', star: '', R: 1, T: 2500 }), '地面模式不算');
}
{
  const r = find('6', function* () { for (let f = 1; f <= 100; f += 0.1) yield { o: { mode: 'fusion', f: f } }; });
  ex('6', r && r.e, r && ('燒掉 ' + rd(r.e.data.f * 100, 1) + ' %：' + f4(r.e.data.tNuc / 1e8) + ' 億年'));
  no('6', ev({ mode: 'fusion' }), '燒掉 10 %：' + f3(ev({ mode: 'fusion' }).data.tNuc / 1e8) + ' 億年');
  no('6', ev({ mode: 'fusion', star: 'young', f: 4.4 }), '45 億年前的太陽');
}
{
  const r = find('7', function* () { for (let h = 60; h >= 2; h -= 0.5) yield { o: { mode: 'ground', h: h }, type: 'run' }; }, ['h4']);
  ex('7', r && r.e, r && ('τ 0.3、h ' + r.e.data.h + '°：m ' + f2(r.e.data.m) + '、地面 ' + f4(r.e.data.Ig) + ' W/m²'));
  if (r) { no('7', ev(r.o), '同樣的設定、沒曬完'); no('7', ev(Object.assign({}, r.o, { tau: 0.31 }), 'run'), 'τ 0.31'); }
}
{
  const r = find('8', function* () { for (let R = 0.2; R <= 0.26; R += 0.001) for (let T = 11544; T <= 13000; T += 1) { const L = SC.lum(rd(R, 3), T) / SC.LSUN; if (Math.abs(L - 1) < 0.02) yield { o: { star: '', R: R, T: T } }; } });
  ex('8', r && r.e, r && ('R ' + r.e.data.R + '、' + r.e.data.T + ' K：L ' + f4(r.e.data.L)));
  no('8', ev({ star: 'sirius' }), '天狼星 A 太亮');
  no('8', ev({ star: '', R: 1, T: 11544 }), '半徑沒縮小：L ' + f3(ev({ star: '', R: 1, T: 11544 }).data.L));
}
{
  const r = find('9', function* () { for (let a = 0.9; a <= 1.0001; a += 0.01) for (let dur = 0.5; dur <= 5; dur += 0.5) yield { o: { mode: 'ground', alpha: a, dur: dur }, type: 'run' }; });
  ex('9', r && r.e, r && ('吸收率 ' + r.e.data.alpha + '、' + r.e.data.dur + ' 分鐘：' + f4(r.e.data.Iest) + ' / ' + f4(r.e.data.Ig)));
  no('9', ev({ mode: 'ground' }, 'run'), '預設：' + f3(ev({ mode: 'ground' }).data.Iest / ev({ mode: 'ground' }).data.Ig * 100) + ' %');
  no('9', ev({ mode: 'ground', alpha: 1, dur: 30 }, 'run'), '全黑但曬 30 分鐘');
}
{
  const r = find('10', function* () { for (const d of lgd(0.8, 0.9, 0.0002)) yield { o: { star: 'young', d: d } }; });
  ex('10', r && r.e, r && (r.e.data.d + ' AU：' + f3(r.e.data.Srel) + ' 倍'));
  no('10', ev({ star: 'young' }), '1 AU：' + f3(ev({ star: 'young' }).data.Srel) + ' 倍');
  no('10', ev({ star: 'sun', d: 0.844 }), '今天的太陽');
}
// Langley：照真正的做法一次一次曬，最後一次是 run 事件
const lgEv = (hs, o) => { o = o || {}; const base = Object.assign({ mode: 'ground' }, o); const recs = hs.slice(0, -1).map(h => Object.assign({}, base, { h: h })); return ev(Object.assign({}, base, { h: hs[hs.length - 1], recs: recs }), 'run'); };
{
  const set = { alpha: 1, dur: 1, mw: 500 };
  const e = lgEv([60, 30, 20], set);
  ex('11', e, '全黑、1 分鐘、h 60°、30°、20°：' + f4(e.data.lg.S0) + ' W/m²、τ ' + e.data.lg.tau.toFixed(3));
  no('11', lgEv([60, 30, 20]), '預設吸收率 0.95、曬 10 分鐘：' + f4(lgEv([60, 30, 20]).data.lg.S0));
  no('11', lgEv([60, 30], set), '只量兩次');
  no('11', lgEv([80, 60, 45], set), 'm 只差 ' + f2(lgEv([80, 60, 45], set).data.lg.mMax - lgEv([80, 60, 45], set).data.lg.mMin));
  const e2 = lgEv([80, 50, 25, 15], set);
  ex('12', e2, 'h 80°、50°、25°、15°：' + f4(e2.data.lg.S0) + ' W/m²、τ ' + e2.data.lg.tau.toFixed(4));
  no('12', lgEv([80, 50, 25, 15], { alpha: 0.98, dur: 1, mw: 500 }), '吸收率 0.98：' + f4(lgEv([80, 50, 25, 15], { alpha: 0.98, dur: 1, mw: 500 }).data.lg.S0));
  no('12', lgEv([60, 30, 20], set), '只量三次');
  // 不同 τ 的紀錄不混在一起
  const mixed = ev({ mode: 'ground', h: 20, alpha: 1, dur: 1, mw: 500, recs: [{ h: 60, tau: 0.2, alpha: 1, dur: 1, mw: 500 }, { h: 30, tau: 0.4, alpha: 1, dur: 1, mw: 500 }] }, 'run');
  expect('不同 τ 的紀錄不混在同一條直線', mixed.data.lg === null);
}

// ───── 隱藏任務 ─────
{
  const r = find('h1', function* () { for (const d of lgd(35, 39, 0.0002)) yield { o: { d: d } }; }, otherHidden('h1'));
  ex('h1', r && r.e, r && (r.e.data.d + ' AU：' + f3(r.e.data.S) + ' W/m²'));
  no('h1', ev({ d: 30.07 }), '海王星 ' + f3(ev({ d: 30.07 }).data.S) + ' W/m²');
  no('h1', ev({ d: 39.48 }), '冥王星 ' + f3(ev({ d: 39.48 }).data.S) + ' W/m²');
}
{
  const r = find('h2', function* () { for (let R = 0.01; R >= 0.005; R -= 0.001) for (let T = 20000; T <= 30000; T += 500) yield { o: { mode: 'fusion', star: '', R: R, T: T, M: 1 } }; }, otherHidden('h2'));
  ex('h2', r && r.e, r && ('R ' + r.e.data.R + '、' + r.e.data.T + ' K、M ' + r.e.data.M + '：L ' + f3(r.e.data.L)));
  if (r) {
    no('h2', ev(Object.assign({}, r.o, { mode: 'flux' })), '在光度模式（看不到質量）');
    no('h2', ev(Object.assign({}, r.o, { M: 2 })), '質量 2 倍太陽，超過錢卓拉塞卡極限');
    no('h2', ev(Object.assign({}, r.o, { T: 9000 })), '溫度不夠高');
  }
}
{
  const r = find('h3', function* () { for (let mw = 50; mw <= 300; mw += 10) for (let dur = 60; dur >= 10; dur -= 0.5) yield { o: { mode: 'ground', mw: mw, dur: dur }, type: 'run' }; }, otherHidden('h3'));
  ex('h3', r && r.e, r && ('水 ' + r.e.data.mw + ' g、' + r.e.data.dur + ' 分鐘：平衡的 ' + f3(r.e.data.eqFrac * 100) + ' %'));
  if (r) no('h3', ev(r.o), '同樣的設定、沒曬完');
  no('h3', ev({ mode: 'ground', mw: 1000, dur: 60 }, 'run'), '水 1 kg、60 分鐘：' + f3(ev({ mode: 'ground', mw: 1000, dur: 60 }).data.eqFrac * 100) + ' %');
}
{
  const r = find('h4', function* () { for (let h = 6; h >= 2; h -= 0.5) for (let tau = 0.05; tau <= 0.2; tau += 0.01) yield { o: { mode: 'ground', h: h, tau: tau } }; }, otherHidden('h4'));
  ex('h4', r && r.e, r && ('h ' + r.e.data.h + '°、τ ' + r.e.data.tau + '：m ' + f3(r.e.data.m) + '、地面 ' + f3(r.e.data.Ig) + ' W/m²'));
  if (r) no('h4', ev(Object.assign({}, r.o, { anim: true })), '曬的動畫播放中');
  no('h4', ev({ mode: 'ground', h: 5 }), 'τ 0.3 太混濁：' + f3(ev({ mode: 'ground', h: 5 }).data.Ig) + ' W/m²');
}
{
  const r = find('h5', function* () { for (const d of lgd(45, 50, 0.0002)) yield { o: { star: 'giant', d: d } }; }, otherHidden('h5'));
  ex('h5', r && r.e, r && (r.e.data.d + ' AU：' + f3(r.e.data.Srel) + ' 倍'));
  no('h5', ev({ star: 'giant', d: 30.07 }), '海王星：' + f3(ev({ star: 'giant', d: 30.07 }).data.Srel) + ' 倍');
}
{
  const r = find('h6', function* () { for (let T = 5200; T <= 5350; T += 1) yield { o: { star: '', R: 1, T: T } }; }, otherHidden('h6'));
  ex('h6', r && r.e, r && (r.e.data.T + ' K：' + f4(r.e.data.lam) + ' nm'));
  no('h6', ev({}), '今天的太陽 ' + f4(ev({}).data.lam) + ' nm');
  no('h6', ev({ star: 'young' }), '45 億年前的太陽 ' + f4(ev({ star: 'young' }).data.lam) + ' nm');
}
{
  const set = { tau: 0.7, alpha: 1, dur: 1, mw: 500 };
  const e = lgEv([70, 35, 25], set);
  examples.h7 = e;
  expect('h7 做得到', hits('h7', e), 'τ 0.7、h 70°、35°、25°：' + f4(e.data.lg.S0) + ' W/m²、τ ' + e.data.lg.tau.toFixed(3) + '；地面最暗 ' + f3(SC.ground(SC.S0, 0.7, 25)) + ' W/m²');
  no('h7', lgEv([70, 35, 25], Object.assign({}, set, { tau: 0.5 })), 'τ 0.5 不夠混濁');
  no('h7', lgEv([70, 35, 25], Object.assign({}, set, { alpha: 0.9 })), '吸收率 0.9：' + f4(lgEv([70, 35, 25], Object.assign({}, set, { alpha: 0.9 })).data.lg.S0));
  const others = hidIds.filter(o => o !== 'h7' && hits(o, e));
  expect('h7 的達成例不會順便完成別的隱藏任務', others.length === 0, others.join(','));
}
{
  const set = { alpha: 1, dur: 1, mw: 500 };
  const e = lgEv([90, 70, 52], set);
  examples.h8 = e;
  expect('h8 做得到', hits('h8', e), 'h 90°、70°、52°：m ' + f3(e.data.lg.mMin) + '–' + f3(e.data.lg.mMax) + '、' + f4(e.data.lg.S0) + ' W/m²');
  no('h8', lgEv([90, 70, 40], set), '有一筆 m ' + f3(SC.airMass(40)));
  no('h8', lgEv([90, 70, 52], { alpha: 0.97, dur: 1, mw: 500 }), '吸收率 0.97');
  no('h8', lgEv([90, 70, 52], { alpha: 1, dur: 20, mw: 500 }), '曬 20 分鐘，散熱太多');
  no('11', e, '只在中午量，m 只差 ' + f2(e.data.lg.mMax - e.data.lg.mMin) + '（任務 11 要差 1）');
}
{
  const r = find('h9', function* () { for (let d = 0.047; d <= 0.05; d += 0.0001) yield { o: { star: 'proxima', d: d } }; }, otherHidden('h9'));
  ex('h9', r && r.e, r && (r.e.data.d + ' AU：' + f3(r.e.data.Srel) + ' 倍'));
  no('h9', ev({ star: 'proxima', d: 0.047 }), '0.047 AU');
  no('h9', ev({ d: 0.0485 }), '今天的太陽在同樣距離');
}
{
  const r = find('h10', function* () { for (const d of lgd(2.4, 2.7, 0.0002)) yield { o: { d: d } }; }, otherHidden('h10'));
  ex('h10', r && r.e, r && (r.e.data.d + ' AU：' + f3(r.e.data.nuCm2) + ' 個/(cm²·s)'));
  no('h10', ev({}), '1 AU：' + f3(ev({}).data.nuCm2));
  no('h10', ev({ star: 'young', d: 2.55 }), '45 億年前的太陽');
}

// 隱藏任務彼此不連帶完成
hidIds.forEach(function (id) {
  if (!examples[id] || id === 'h7') return;
  const others = hidIds.filter(o => o !== id && hits(o, examples[id]));
  expect(id + ' 的達成例不會順便完成別的隱藏任務', others.length === 0, others.join(','));
});
// 動畫播放中：「停在某個狀態」的地面任務（h4、Langley）不算
{
  const e = lgEv([80, 50, 25, 15], { alpha: 1, dur: 1, mw: 500 });
  e.type = 'state'; e.data.anim = true;
  const f = fired(e).filter(id => ['11', '12', 'h4', 'h7', 'h8'].indexOf(id) >= 0);
  expect('地面動畫播放中，Langley 與 h4 都不算', f.length === 0, f.join(','));
}
// 等級分布
{
  const hl = missions.filter(m => m.hidden).map(m => m.level);
  expect('隱藏任務 10 個、等級 3–10、至少 3 個在 7 級以上', hl.length === 10 && Math.min.apply(null, hl) >= 3 && Math.max.apply(null, hl) <= 10 && hl.filter(l => l >= 7).length >= 3, hl.join(','));
  const pub = missions.filter(m => !m.hidden), hidden = missions.filter(m => m.hidden);
  console.log('    公開 ' + pub.length + ' 個 ' + pub.reduce((a, m) => a + m.level, 0) + ' 顆星；隱藏 ' + hidden.length + ' 個 ' + hidden.reduce((a, m) => a + m.level * 2, 0) + ' 顆星');
}

console.log('\n' + ok + ' 項通過' + (bad ? '，' + bad + ' 項失敗' : ''));
if (bad) process.exitCode = 1;
