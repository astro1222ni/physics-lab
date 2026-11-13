/* 任務可達成的證明腳本。用法：node tools/mission-proofs/fronts.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、不該觸發的不會觸發。
 * 事件的內容與 js/fronts.js 的 snapshot() 相同，全部由 js/fronts-core.js 的 make()、pass() 計算（紀錄每 0.02 小時一筆）。
 * 滑桿：暖氣團氣溫 5–35、露點 −10–30；冷氣團氣溫 −10–30、露點 −25–30（打字精度 0.1）；坡度 1 : 30–400（整數）；
 *   鋒面速度 0–60 km/h（0.5，打字精度 0.1）；爬坡風速 1–20 m/s（0.1）。頁面會夾住：露點 ≤ 氣溫、冷氣團 ≤ 暖氣團 − 1 °C。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const FC = require(ROOT + 'js/fronts-core.js');
const missions = [];
global.window = { FrontCore: FC, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/fronts.js');
const SLUG = 'fronts-';
const byId = id => missions.find(m => m.id === SLUG + id);
const LAT = 25;

// ───── 和頁面相同的事件 ─────
const r1 = v => Math.round(v * 10) / 10;
function clampP(o) {
  const p = Object.assign({}, o);
  p.Tdw = Math.min(p.Tdw, p.Tw); p.Tc = Math.min(p.Tc, r1(p.Tw - 1)); p.Tdc = Math.min(p.Tdc, p.Tc);
  return p;
}
const cache = new Map();
/** 讓鋒面通過：回傳播完時送出的 run 事件 */
function run(mode, o, preset) {
  const p = clampP(o), key = mode + '|' + [p.Tw, p.Tdw, p.Tc, p.Tdc, p.N, p.U, p.V].join('|');
  let ps, f;
  if (cache.has(key)) ({ f, ps } = cache.get(key));
  else { f = FC.make({ type: mode, Tw: p.Tw, Tdw: p.Tdw, Tc: p.Tc, Tdc: p.Tdc, slope: 1 / p.N, U: p.U, V: p.V }); ps = FC.pass(f); cache.set(key, { f, ps }); }
  return { type: 'run', data: {
    mode: mode, chart: 'a', anim: false, preset: preset || '', Tw: p.Tw, Tdw: p.Tdw, Tc: p.Tc, Tdc: p.Tdc, N: p.N, U: p.U, V: p.V,
    w: f.w, zl: f.zl, band: f.sRain, bandHours: f.sRain != null && p.U > 0 ? f.sRain / p.U : null, rain0: f.rain(0.5),
    shear: FC.margulesShear(LAT, (p.Tw + p.Tc) / 2, f.tan, p.Tw - p.Tc), t: ps.tEndRun,
    done: true, total: ps.total, hours: ps.hours, peak: ps.peak, dT: ps.dT, dTd: ps.dTd, dP: ps.dP, pMin: ps.pMin, pMax: ps.pMax,
    wind0: ps.wind0, wind1: ps.wind1, clouds: ps.clouds.join(','), passed: ps.passed, capped: ps.capped, tFront: ps.tFront, tStart: ps.tStart, tEnd: ps.tEndRun,
    max1: ps.max1, max3: ps.max3, max24: ps.max24, tCloud: ps.tCloud, snow: ps.snow } };
}
const DEF = {
  cold: { Tw: 25, Tdw: 20, Tc: 15, Tdc: 9, N: 80, U: 36, V: 10 },
  warm: { Tw: 20, Tdw: 15, Tc: 8, Tdc: 2, N: 150, U: 30, V: 6 },
  stat: { Tw: 28, Tdw: 25, Tc: 24, Tdc: 18, N: 100, U: 5, V: 12 }
};
const PRESETS = {
  cold: { def: DEF.cold, surge: { Tw: 22, Tdw: 17, Tc: 6, Tdc: -4, N: 60, U: 45, V: 14 }, dry: { Tw: 24, Tdw: 8, Tc: 16, Tdc: 2, N: 90, U: 30, V: 8 } },
  warm: { def: DEF.warm, humid: { Tw: 22, Tdw: 20, Tc: 10, Tdc: 5, N: 200, U: 20, V: 8 } },
  stat: { def: DEF.stat, jet: { Tw: 29, Tdw: 26, Tc: 25, Tdc: 19, N: 100, U: 1, V: 18 }, south: { Tw: 28, Tdw: 24, Tc: 23, Tdc: 16, N: 100, U: 15, V: 10 } }
};
// 頁面的預設與預設按鈕要和這裡一致
{ const src = require('fs').readFileSync(ROOT + 'js/fronts.js', 'utf8');
  const want = [['cold', DEF.cold], ['warm', DEF.warm], ['stat', DEF.stat]].map(a => a[0] + ': { Tw: ' + a[1].Tw + ', Tdw: ' + a[1].Tdw + ', Tc: ' + a[1].Tc + ', Tdc: ' + a[1].Tdc + ', N: ' + a[1].N + ', U: ' + a[1].U + ', V: ' + a[1].V + ' }');
  const pre = [];
  for (const m in PRESETS) for (const k in PRESETS[m]) if (k !== 'def') { const q = PRESETS[m][k]; pre.push("id: '" + k + "'", 'p: { Tw: ' + q.Tw + ', Tdw: ' + q.Tdw + ', Tc: ' + q.Tc + ', Tdc: ' + q.Tdc + ', N: ' + q.N + ', U: ' + q.U + ', V: ' + q.V + ' }'); }
  const miss = want.concat(pre).filter(s => src.indexOf(s) < 0);
  var srcOk = !miss.length, srcMiss = miss.join('；'); }

const hits = (id, e) => !!e && byId(id).check(e);
const anyHit = (id, evs) => evs.some(e => hits(id, e));
const lvOf = id => byId(id).level, high = id => lvOf(id) >= 6 || id[0] === 'h';
let ok = 0, bad = 0;
function expect(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label + (extra ? '（' + extra + '）' : '')); }
  else { bad++; console.error('  ✗ ' + label + (extra ? '（' + extra + '）' : '')); }
}
const allIds = missions.map(m => m.id.replace(SLUG, ''));
const hidIds = allIds.filter(id => id[0] === 'h');
const fired = evs => allIds.filter(id => anyHit(id, [].concat(evs)));
const examples = {};
function ex(id, evs, note) { evs = [].concat(evs || []); examples[id] = evs; expect(id + ' 做得到', anyHit(id, evs), note); }
function no(id, evs, note) { expect(id + ' 不觸發：' + note, !anyHit(id, [].concat(evs))); }
const f1 = v => v == null ? '—' : (+v).toFixed(1), f2 = v => v == null ? '—' : (+v).toFixed(2);
/** 在格子上找第一組讓 id 成立、又不觸發其他隱藏任務的設定 */
function find(id, gen) {
  for (const evs of gen()) { const a = [].concat(evs); if (anyHit(id, a) && !hidIds.some(h => h !== id && anyHit(h, a))) return a; }
  return null;
}
const set = (mode, o) => run(mode, Object.assign({}, DEF[mode], o));
const desc = e => { const d = e.data; return d.mode + ' ' + [d.Tw, d.Tdw, d.Tc, d.Tdc].join('/') + ' 1:' + d.N + ' U' + d.U + ' V' + d.V; };

console.log('fronts 任務證明');
expect('一般任務 12 個、隱藏任務 10 個', allIds.length - hidIds.length === 12 && hidIds.length === 10);
{ const lv = hidIds.map(lvOf); expect('隱藏任務等級 3–10、至少 3 個在 7 級以上', lv.every(l => l >= 3 && l <= 10) && lv.filter(l => l >= 7).length >= 3, lv.join(',')); }
expect('證明用的預設值與預設按鈕和 js/fronts.js 一致', srcOk, srcMiss);

// ───── 預設值與預設按鈕 ─────
const C0 = set('cold', {}), W0 = set('warm', {}), S0 = set('stat', {});
ex('1', C0, '預設冷鋒：雨 ' + f1(C0.data.total) + ' mm、氣溫 ' + f1(C0.data.dT) + ' °C、氣壓 +' + f1(C0.data.dP) + ' hPa');
ex('2', W0, '預設暖鋒');
ex('3', S0, '預設梅雨鋒面：' + f1(S0.data.total) + ' mm、24 小時最多 ' + f1(S0.data.max24) + ' mm');
ex('4', W0, '預設暖鋒：卷層雲後 ' + f1(W0.data.tStart - W0.data.tCloud) + ' 小時下雨');
const PR = {}; for (const m in PRESETS) for (const k in PRESETS[m]) PR[m + '-' + k] = run(m, PRESETS[m][k], k);
for (const k in PR) { const f = fired([PR[k]]).filter(high); expect('預設按鈕「' + k + '」不觸發 6 級以上與隱藏任務', !f.length, f.join(',') || ('雨 ' + f1(PR[k].data.total) + ' mm')); }
{ const st = { type: 'state', data: Object.assign({}, C0.data) }; expect('state 事件不判定（只看播完的 run）', !fired([st]).length); }
{ const e = set('stat', { N: 30, U: 1.5, V: 20, Tw: 35, Tdw: 30, Tc: 30, Tdc: 25 }); e.data.done = false; expect('沒播完的紀錄不判定', !fired([e]).length); }

// ───── 一般任務 ─────
ex('5', PR['cold-dry'], '乾冷鋒：雲底 ' + Math.round(PR['cold-dry'].data.zl) + ' m');
no('5', C0, '預設冷鋒有下雨'); no('5', set('cold', { U: 0 }), '速度 0（鋒面沒有通過）');
let e = find('6', function* () { for (let V = 14; V <= 20; V += 1) yield set('cold', { Tw: 35, Tdw: 30, Tc: 25, Tdc: 20, N: 30, V: V, U: 50 }); });
ex('6', e, e && desc(e[0]) + '：1 小時最多 ' + f1(e[0].data.max1) + ' mm');
no('6', C0, '預設冷鋒（1 小時 ' + f1(C0.data.max1) + '、24 小時 ' + f1(C0.data.max24) + ' mm）');
ex('7', PR['cold-surge'], '寒流南下：' + f1(PR['cold-surge'].data.dT) + ' °C');
no('7', C0, '預設冷鋒（' + f1(C0.data.dT) + ' °C）');
e = find('8', function* () { for (let U = 5; U >= 3; U -= 0.5) yield set('stat', { U: U }); });
ex('8', e, e && desc(e[0]) + '：24 小時 ' + f1(e[0].data.max24) + ' mm');
no('8', S0, '預設梅雨鋒面（24 小時 ' + f1(S0.data.max24) + ' mm，差一點）');
ex('9', PR['warm-humid'], '潮溼的暖鋒：下 ' + f1(PR['warm-humid'].data.hours) + ' 小時、最大 ' + f1(PR['warm-humid'].data.peak) + ' mm/h');
no('9', W0, '預設暖鋒（只下 ' + f1(W0.data.hours) + ' 小時）');
e = find('10', function* () { for (let U = 30; U >= 5; U -= 1) yield set('cold', { Tw: 30, Tdw: 27, N: 40, V: 15, U: U }); });
ex('10', e, e && desc(e[0]) + '：' + f1(e[0].data.total) + ' mm');
no('10', C0, '預設冷鋒（' + f1(C0.data.total) + ' mm）');
e = find('11', function* () { for (let V = 12; V <= 20; V += 1) for (let U = 1; U <= 4; U += 0.5) yield set('stat', { Tw: 30, Tdw: 27, Tc: 26, Tdc: 20, V: V, U: U }); });
ex('11', e, e && desc(e[0]) + '：24 小時 ' + f1(e[0].data.max24) + ' mm');
no('11', PR['stat-jet'], '西南氣流增強（24 小時 ' + f1(PR['stat-jet'].data.max24) + ' mm）');
e = find('12', function* () { for (let U = 6; U >= 2; U -= 0.5) yield set('stat', { Tw: 35, Tdw: 30, Tc: 30, Tdc: 25, N: 30, V: 20, U: U }); });
ex('12', e, e && desc(e[0]) + '：24 小時 ' + f1(e[0].data.max24) + ' mm');

// ───── 隱藏任務 ─────
e = find('h1', function* () { for (let d = 15; d <= 18; d = r1(d + 0.1)) yield set('warm', { Tdw: r1(20 - d) }); });
ex('h1', e, e && desc(e[0]) + '：雲底 ' + Math.round(e[0].data.zl) + ' m、雲 ' + e[0].data.clouds);
no('h1', PR['cold-dry'], '乾冷鋒（冷鋒，不是暖鋒的高層雲）');
no('h1', set('warm', { Tdw: -10 }), '暖空氣露點 −10 °C（雲底 ' + Math.round(set('warm', { Tdw: -10 }).data.zl) + ' m，太高）');
e = find('h2', function* () { for (let Tc = 7; Tc <= 11; Tc = r1(Tc + 0.5)) yield set('cold', { Tw: 22, Tdw: 18, Tc: Tc, Tdc: Tc - 6 }); });
ex('h2', e, e && desc(e[0]) + '：降 ' + f1(-e[0].data.dT) + ' °C 到 ' + f1(e[0].data.Tw + e[0].data.dT) + ' °C');
no('h2', PR['cold-surge'], '寒流南下（降到 ' + f1(PR['cold-surge'].data.Tw + PR['cold-surge'].data.dT) + ' °C）');
no('h2', set('cold', { Tw: 15, Tdw: 12, Tc: 9, Tdc: 3 }), '15 → 9 °C（只降 6 °C）');
e = find('h3', function* () { for (let d = 7.5; d <= 8.5; d = r1(d + 0.1)) yield set('cold', { Tdw: r1(25 - d) }); });
ex('h3', e, e && desc(e[0]) + '：雲底 ' + f1(e[0].data.zl) + ' m');
no('h3', C0, '預設冷鋒（雲底 ' + Math.round(C0.data.zl) + ' m）');
e = find('h4', function* () { for (let U = 45; U <= 55; U = r1(U + 0.5)) yield set('warm', { U: U }); });
ex('h4', e, e && desc(e[0]) + '：卷層雲後 ' + f2(e[0].data.tStart - e[0].data.tCloud) + ' 小時下雨');
no('h4', W0, '預設暖鋒（' + f2(W0.data.tStart - W0.data.tCloud) + ' 小時）');
e = find('h5', function* () { for (let U = 30; U >= 10; U -= 1) yield set('cold', { Tw: 35, Tdw: 30, Tc: 25, Tdc: 20, N: 30, V: 20, U: U }); });
ex('h5', e, e && desc(e[0]) + '：3 小時 ' + f1(e[0].data.max3) + '、24 小時 ' + f1(e[0].data.max24) + ' mm');
{ const a = set('cold', { Tw: 35, Tdw: 30, Tc: 25, Tdc: 20, N: 30, V: 20, U: 5 }); no('h5', a, '同樣的冷鋒走 5 km/h（24 小時 ' + f1(a.data.max24) + ' mm，是一整天的豪雨）'); }
e = find('h6', function* () { for (let Tc = -2; Tc <= 0; Tc = r1(Tc + 0.5)) yield set('cold', { Tw: 12, Tdw: 10, Tc: Tc, Tdc: r1(Tc - 3), V: 14 }); });
ex('h6', e, e && desc(e[0]) + '：雪 ' + f1(e[0].data.snow) + ' / ' + f1(e[0].data.total) + ' mm');
{ const a = set('cold', { Tw: 12, Tdw: 10, Tc: -5, Tdc: -8, V: 14 }); no('h6', a, '冷氣團 −5 °C（雪 ' + f1(a.data.snow) + ' mm，但不是剛好冷到）'); }
no('h6', set('cold', { Tw: 12, Tdw: 10, Tc: 0.5, Tdc: -3, V: 14 }), '冷氣團 0.5 °C（下雨不下雪）');
e = find('h7', function* () { for (let U = 2.5; U <= 4; U += 0.5) for (const N of [80, 100, 150]) yield set('stat', { Tw: 35, Tdw: 30, Tc: 30, Tdc: 25, U: U, N: N, V: 20 }); });
ex('h7', e, e && desc(e[0]) + '：下 ' + f1(e[0].data.hours) + ' 小時、' + f1(e[0].data.total) + ' mm、24 小時最多 ' + f1(e[0].data.max24) + ' mm');
no('h7', PR['stat-jet'], '西南氣流增強（' + f1(PR['stat-jet'].data.hours) + ' 小時：鋒面太晚到）');
{ const a = set('stat', { N: 400 }); no('h7', a, '預設梅雨、坡度 1:400（下 ' + f1(a.data.hours) + ' 小時，但 24 小時只有 ' + f1(a.data.max24) + ' mm）'); }
e = find('h8', function* () { for (let U = 12; U >= 3; U -= 0.5) yield set('cold', { Tw: 30, Tdw: 27, Tc: 22, Tdc: 16, N: 60, V: 14, U: U }); });
ex('h8', e, e && desc(e[0]) + '：24 小時 ' + f1(e[0].data.max24) + ' mm');
no('h8', C0, '預設冷鋒');
e = find('h9', function* () { for (let Tc = 0; Tc >= -2; Tc = r1(Tc - 0.1)) yield set('warm', { Tw: 20, Tdw: 18, Tc: Tc, Tdc: r1(Tc - 1), N: 60, V: 15 }); });
ex('h9', e, e && desc(e[0]) + '：雪 ' + f1(e[0].data.snow) + '、雨 ' + f1(e[0].data.total - e[0].data.snow) + ' mm');
{ const a = set('warm', { Tw: 20, Tdw: 18, Tc: -6, Tdc: -7, N: 60, V: 15 }); no('h9', a, '冷氣團 −6 °C（雪 ' + f1(a.data.snow) + '、雨 ' + f1(a.data.total - a.data.snow) + ' mm）'); }
e = find('h10', function* () { for (let U = 3; U >= 2; U = r1(U - 0.1)) yield set('stat', { Tw: 35, Tdw: 30, Tc: 30, Tdc: 25, N: 30, V: 20, U: U }); });
ex('h10', e, e && desc(e[0]) + '：' + f1(e[0].data.total) + ' mm、下 ' + f1(e[0].data.hours) + ' 小時、' + f1(e[0].data.tEnd) + ' 小時走完');
no('h10', PR['stat-jet'], '西南氣流增強（' + f1(PR['stat-jet'].data.total) + ' mm，但 72 小時還沒走完）');
{ const a = set('stat', { Tw: 35, Tdw: 30, Tc: 30, Tdc: 25, N: 30, V: 20, U: 1 }); no('h10', a, '同樣的鋒面走 1 km/h（' + f1(a.data.total) + ' mm，72 小時還沒走完）'); }

// ───── 滑桿端點的組合 ─────
{ const badc = []; let n = 0;
  for (const mode of ['cold', 'warm', 'stat']) for (const Tw of [5, 35]) for (const Tdw of [-10, 30]) for (const Tc of [-10, 30]) for (const Tdc of [-25, 30])
    for (const N of [30, 400]) for (const U of [0, 60]) for (const V of [1, 20]) {
      n++; const a = run(mode, { Tw, Tdw, Tc, Tdc, N, U, V }), x = fired([a]).filter(high);
      if (x.length) badc.push(desc(a) + ':' + x.join(','));
    }
  expect('滑桿端點的 ' + n + ' 種組合都不觸發 6 級以上與隱藏任務', !badc.length, badc.slice(0, 6).join('；')); }
// 也從各預設出發，一次把一個滑桿推到端點：不可碰巧完成隱藏任務（一般任務本來就該靠把滑桿推到底來完成）
{ const badc = []; let n = 0; const R = { Tw: [5, 35], Tdw: [-10, 30], Tc: [-10, 30], Tdc: [-25, 30], N: [30, 400], U: [0, 60], V: [1, 20] };
  for (const m in PRESETS) for (const k in PRESETS[m]) for (const key in R) for (const v of R[key]) {
    n++; const a = run(m, Object.assign({}, PRESETS[m][k], { [key]: v })), x = fired([a]).filter(id => id[0] === 'h');
    if (x.length) badc.push(m + '-' + k + ' ' + key + '=' + v + ':' + x.join(','));
  }
  expect('從預設按鈕出發把一個滑桿推到端點（' + n + ' 種）都不觸發隱藏任務', !badc.length, badc.slice(0, 6).join('；')); }

// ───── 隱藏任務彼此不連帶 ─────
hidIds.forEach(id => { const evs = examples[id]; if (!evs) return; const f = fired(evs).filter(x => x[0] === 'h' && x !== id); expect(id + ' 的例子不連帶完成其他隱藏任務', !f.length, f.join(',')); });

console.log(`\nfronts：${ok} 項通過、${bad} 項失敗`);
if (bad) process.exitCode = 1;
