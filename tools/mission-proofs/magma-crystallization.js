/* 任務可達成的證明腳本。用法：node tools/mission-proofs/magma-crystallization.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、不該觸發的不會觸發。
 * 事件的內容與 js/magma-crystallization.js 的 snapshot() 相同，全部由 js/magma-crystallization-core.js 計算。
 * 滑桿可打字的精度：岩體半厚 0.01 m、深度 0.1 km、取樣位置 0.01、斑晶比例 1 %、岩漿成分 An 0.1 %、溫度 0.1 °C。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const MC = require(ROOT + 'js/magma-crystallization-core.js');
const missions = [];
global.window = { MagmaCore: MC, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/magma-crystallization.js');
const SLUG = 'magma-crystallization-';
const byId = id => missions.find(m => m.id === SLUG + id);
const PRE = {};
MC.PRESETS.forEach(p => { PRE[p.id] = p; });

const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const DEF = { mode: 'cool', preset: 'penghu', type: 'basalt', a: 4, z: 0, xr: 0, phen: 0, meth: 'eq', an0: 0.6, T: 1520, anim: false, played: false, chart: 'Tt' };
const cache = new Map();
function cool(o) {
  const k = [o.type, o.a, o.z, o.xr, o.phen].join('|');
  if (!cache.has(k)) cache.set(k, MC.cool(o));
  return cache.get(k);
}
/** 頁面的狀態 → 事件（type 'state' 或 'run'）。o.preset 給代號就套用真實岩石；自己調過就是 ''。an0 是 0–1。 */
function ev(o, type) {
  o = Object.assign({}, DEF, o);
  let st;
  if (o.preset) { const p = PRE[o.preset]; st = { type: p.type, a: p.a, z: p.z, xr: p.xr, phen: p.phen }; }
  else st = { type: o.type, a: r2(o.a), z: r1(o.z), xr: r2(o.xr), phen: Math.round(o.phen * 100) / 100 };
  const r = cool(st), c = st.xr === 0 ? r : cool(Object.assign({}, st, { xr: 0 }));
  const an0 = Math.round(o.an0 * 1000) / 1000, Tc = r1(o.T);
  const eq = MC.equilibrium(an0, Tc), fr = MC.fractional(an0, Tc);
  return { type: type || 'state', data: {
    mode: o.mode, preset: o.preset || '', type: st.type, a: st.a, z: st.z, xr: st.xr, phen: st.phen, Tr: r.Tr,
    L: r.L, Lp: r.Lp, Lg: r.Lg, Xp: r.Xp, N: r.N * 1e-6, X: r.X, glass: r.glass, tex: r.tex, rock: r.rock[0],
    tEnd: r.tEnd, tYears: r.tEnd / MC.YEAR, q: r.q, dT50: r.dT50, end: r.end,
    Lc: c.phen > 0 ? c.Lg : c.L, glassC: c.glass, texC: c.tex,
    meth: o.meth, an0: an0 * 100, T: Tc, TL: eq.TL, TS: eq.TS,
    eq: { state: eq.state, xl: eq.xl == null ? null : eq.xl * 100, xs: eq.xs == null ? null : eq.xs * 100, fs: eq.fs },
    fr: { F: fr.F, xl: fr.xl * 100, xs: fr.xs == null ? null : (Tc <= MC.PLAG.TAb ? 0 : fr.xs * 100), core: fr.zones.length ? fr.zones[0].x * 100 : null, mean: fr.mean == null ? null : fr.mean * 100 },
    chart: o.chart, played: !!o.played || type === 'run', anim: !!o.anim
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
/** 在格點上找第一個成立、又不會順便完成 avoid 裡任務的設定 */
function find(id, gen, avoid) { for (const g of gen()) { const e = ev(g.o, g.type); if (hits(id, e) && !(avoid || []).some(a => hits(a, e))) return { o: g.o, e: e }; } return null; }
const otherHidden = id => hidIds.filter(h => h !== id);
const f1 = v => v.toFixed(1), f2 = v => v.toFixed(2), f3 = v => v.toPrecision(3);
const fired = e => allIds.filter(id => hits(id, e));

console.log('magma-crystallization 任務證明');
// 預設狀態：任何一個任務都不觸發
{
  const list = [].concat(fired(ev({})), fired(ev({ mode: 'plag' })), fired(ev({ mode: 'plag', meth: 'frac' })));
  expect('預設狀態（澎湖玄武岩；斜長石 An60、1520 °C，平衡與分離）不觸發任何任務', list.length === 0, list.join(','));
  const fr = fired(ev({}, 'run'));
  expect('預設狀態按「開始冷卻」看完一次：只完成任務 1', fr.length === 1 && fr[0] === '1', fr.join(','));
  const pr = [].concat(fired(ev({ mode: 'plag', T: 1100 }, 'run')), fired(ev({ mode: 'plag', meth: 'frac', T: 1100 }, 'run')));
  expect('預設成分的斜長石降溫動畫播完（平衡、分離）：不觸發任何任務', pr.length === 0, pr.join(','));
}
// 斜長石降溫動畫播放途中（anim）：只有和溫度無關、或本來就是「降到底」的任務會觸發
{
  const got = {};
  for (let an = 0; an <= 1.0001; an += 0.05) for (const meth of ['eq', 'frac']) for (let T = 1560; T >= 1100; T -= 0.5) {
    fired(ev({ mode: 'plag', meth: meth, an0: an, T: T, anim: true })).forEach(id => { got[id] = (got[id] || 0) + 1; });
  }
  const bad1 = Object.keys(got).filter(id => ['9', 'h6', 'h3'].indexOf(id) < 0);
  expect('降溫動畫途中經過（An 0–100、每 0.5 °C）不會順便完成要「停在某個溫度」的任務', bad1.length === 0, bad1.join(',') + '；會觸發的：' + Object.keys(got).join(','));
}
// 八個真實岩石（設定狀態與看完一次）只會觸發低級的公開任務
{
  const got = {};
  MC.PRESETS.forEach(p => { fired(ev({ preset: p.id })).concat(fired(ev({ preset: p.id }, 'run'))).forEach(id => { (got[id] = got[id] || []).push(p.id); }); });
  const hi = Object.keys(got).filter(id => id[0] === 'h' || +id >= 5 && id !== '5');
  expect('八個真實岩石不會觸發隱藏任務或 6 級以上的任務（5「一萬年」是深成岩本來就有的事）', hi.length === 0, hi.map(k => k + '：' + got[k].join('、')).join('；'));
  console.log('    （會觸發的：' + Object.keys(got).map(k => k + '［' + Array.from(new Set(got[k])).join('、') + '］').join('、') + '）');
}

// ───── 公開任務 ─────
ex('1', ev({}, 'run'), '預設看完一次');
no('1', ev({}), '只調設定、沒播');
no('1', ev({ mode: 'plag', T: 1100 }, 'run'), '斜長石動畫播完不算');

ex('2', ev({ preset: 'obsidian' }, 'run'), '黑曜岩：玻璃 ' + f2(ev({ preset: 'obsidian' }).data.glass));
no('2', ev({ preset: 'obsidian' }), '沒播完');
no('2', ev({}, 'run'), '澎湖玄武岩是結晶的');

ex('3', ev({ preset: 'gabbro' }, 'run'), '輝長岩 ' + f1(ev({ preset: 'gabbro' }).data.L) + ' mm');
no('3', ev({}, 'run'), '澎湖玄武岩 ' + f2(ev({}).data.L) + ' mm');
no('3', ev({ preset: '', type: 'andesite', a: 300, z: 5, phen: 0.2 }, 'run'), '有斑晶不算');

{
  const r = find('4', function* () { for (let xr = 0.8; xr <= 1.0001; xr += 0.01) yield { o: { preset: '', type: 'basalt', a: 15, z: 2, xr: xr } }; });
  ex('4', r && r.e, r && ('岩脈 15 m、位置 ' + f2(r.e.data.xr) + '：' + f3(r.e.data.L) + ' mm，中心 ' + f3(r.e.data.Lc) + ' mm'));
  no('4', ev({ preset: '', type: 'basalt', a: 15, z: 2, xr: 0.5 }), '位置 0.5 太靠中心');
  no('4', ev({ preset: '', type: 'rhyolite', a: 10, z: 0, xr: 0.95 }), '流紋岩熔岩流：中心也是玻璃');
}

{
  const r = find('5', function* () { for (let lg = 3; lg <= 3.48; lg += 0.02) for (let z = 0; z <= 15; z += 1) yield { o: { preset: '', type: 'rhyolite', a: Math.pow(10, lg), z: z } }; });
  ex('5', r && r.e, r && ('流紋岩質岩體 ' + f2(r.e.data.a) + ' m、' + r.e.data.z + ' km：' + Math.round(r.e.data.tYears) + ' 年'));
  no('5', ev({ preset: 'granite' }), '花崗岩體預設 ' + Math.round(ev({ preset: 'granite' }).data.tYears) + ' 年');
  no('5', ev({}), '澎湖玄武岩 ' + f3(ev({}).data.tYears * 365.25) + ' 天');
}

{
  const r = find('6', function* () { for (let T = 1351; T <= 1476; T += 0.1) yield { o: { mode: 'plag', meth: 'eq', an0: 0.6, T: T } }; });
  ex('6', r && r.e, r && ('An60、' + f1(r.e.data.T) + ' °C：晶體 ' + f1(r.e.data.eq.fs * 100) + ' %'));
  if (r) {
    no('6', ev(Object.assign({}, r.o, { anim: true })), '降溫動畫途中經過');
    no('6', ev(Object.assign({}, r.o, { meth: 'frac' })), '分離結晶');
  }
}

{
  const r = find('7', function* () { for (let lg = 0; lg <= 2; lg += 0.05) for (let ph = 0.05; ph <= 0.4; ph += 0.05) yield { o: { preset: '', type: 'andesite', a: Math.pow(10, lg), z: 0, phen: ph } }; }, ['h8', 'h4']);
  ex('7', r && r.e, r && ('安山岩 ' + f2(r.e.data.a) + ' m、斑晶 ' + Math.round(r.e.data.phen * 100) + ' %：' + f2(r.e.data.Lp) + ' / ' + f3(r.e.data.Lg) + ' mm'));
  no('7', ev({ preset: 'tatun' }), '直接用大屯火山的預設');
  no('7', ev({ preset: '', type: 'andesite', a: 5, z: 0, phen: 0 }), '沒有斑晶');
}

{
  const r = find('8', function* () { for (let T = 1470; T >= 1119; T -= 1) yield { o: { mode: 'plag', meth: 'frac', an0: 0.6, T: T } }; });
  ex('8', r && r.e, r && ('An60、' + f1(r.e.data.T) + ' °C：核心 An' + f1(r.e.data.fr.core) + '、外層 An' + f1(r.e.data.fr.xs) + '、熔體 ' + f1(r.e.data.fr.F * 100) + ' %'));
  if (r) no('8', ev(Object.assign({}, r.o, { anim: true })), '降溫動畫途中經過');
  no('8', ev({ mode: 'plag', meth: 'frac', an0: 0.6, T: 1100 }), '熔體已經用完');
  no('8', ev({ mode: 'plag', meth: 'eq', an0: 0.6, T: 1300 }), '平衡結晶沒有環帶');
}

{
  const r = find('9', function* () { for (let x = 0; x <= 1; x += 0.001) yield { o: { mode: 'plag', an0: x } }; });
  ex('9', r && r.e, r && ('An' + f1(r.e.data.an0) + '：液相線 ' + f1(r.e.data.TL) + ' °C'));
  no('9', ev({ mode: 'plag' }), 'An60 的液相線 ' + f1(ev({ mode: 'plag' }).data.TL) + ' °C');
}

{
  const r = find('10', function* () { for (let lg = 1; lg <= 2; lg += 0.01) yield { o: { preset: '', type: 'rhyolite', a: Math.pow(10, lg), z: 0, xr: 0 } }; });
  ex('10', r && r.e, r && ('流紋岩 ' + f2(r.e.data.a) + ' m：玻璃 ' + f1(r.e.data.glass * 100) + ' %'));
  no('10', ev({ preset: 'obsidian' }), '黑曜岩全是玻璃');
  if (r) no('10', ev(Object.assign({}, r.o, { z: 0.1 })), '深度不是 0');
}

{
  const TS = MC.solidus(0.6);
  const r = find('11', function* () { for (let T = Math.floor(TS * 10) / 10; T >= 1119; T -= 0.5) yield { o: { mode: 'plag', meth: 'frac', an0: 0.6, T: T } }; });
  ex('11', r && r.e, r && ('An60、' + f1(r.e.data.T) + ' °C（固相線 ' + f1(TS) + ' °C）：還剩熔體 ' + f1(r.e.data.fr.F * 100) + ' %'));
  if (r) {
    no('11', ev(Object.assign({}, r.o, { anim: true })), '降溫動畫途中經過');
    no('11', ev(Object.assign({}, r.o, { meth: 'eq' })), '平衡結晶已經全部凝固');
  }
}

{
  const r = find('12', function* () { for (let lg = 0.5; lg <= 2.5; lg += 0.1) for (let z = 0; z <= 10; z += 1) for (const xr of [1, 0.95, 0.9]) yield { o: { preset: '', type: 'basalt', a: Math.pow(10, lg), z: z, xr: xr }, type: 'run' }; });
  ex('12', r && r.e, r && ('玄武岩 ' + f2(r.e.data.a) + ' m、' + r.e.data.z + ' km、位置 ' + r.e.data.xr + '：過冷 ' + Math.round(r.e.data.dT50) + ' °C、玻璃 ' + f1(r.e.data.glass * 100) + ' %'));
  if (r) {
    no('12', ev(r.o), '同樣的設定、沒有看完冷卻');
    no('12', ev(Object.assign({}, r.o, { phen: 0.2 }), 'run'), '有斑晶');
  }
  no('12', ev({}, 'run'), '澎湖玄武岩過冷 ' + f1(ev({}).data.dT50) + ' °C');
  no('12', ev({ preset: 'pillow' }), '枕狀熔岩外殼是玻璃');
}

// ───── 隱藏任務 ─────
{
  const r = find('h1', function* () { for (let a = 0.27; a <= 0.32; a += 0.001) yield { o: { preset: '', a: a, z: 0 } }; }, otherHidden('h1'));
  ex('h1', r && r.e, r && ('半厚 ' + r.e.data.a + ' m：τ = ' + f3(r.e.data.a * r.e.data.a / 1e-6 / 86400) + ' 天'));
  no('h1', ev({ preset: '', a: 0.3 }), '半厚 0.3 m（τ 1.04 天）');
  no('h1', ev({}), '預設 4 m');
}
{
  const TS = MC.solidus(0.6);
  const r = find('h2', function* () { for (let T = Math.ceil(TS * 10) / 10; T <= TS + 10; T += 0.1) yield { o: { mode: 'plag', meth: 'eq', an0: 0.6, T: T } }; }, otherHidden('h2'));
  ex('h2', r && r.e, r && ('An60、' + f1(r.e.data.T) + ' °C：晶體 ' + f2(r.e.data.eq.fs * 100) + ' %'));
  if (r) {
    no('h2', ev(Object.assign({}, r.o, { anim: true })), '降溫動畫途中經過');
    no('h2', ev(Object.assign({}, r.o, { T: TS - 1 })), '已經完全凝固');
    no('h2', ev(Object.assign({}, r.o, { meth: 'frac' })), '分離結晶');
  }
}
{
  const r = find('h3', function* () { for (let x = 0.9; x <= 1.0001; x += 0.01) yield { o: { mode: 'plag', meth: 'frac', an0: x, T: 1110 } }; }, otherHidden('h3'));
  ex('h3', r && r.e, r && ('An' + f1(r.e.data.an0) + '、' + r.e.data.T + ' °C：外圈 An' + r.e.data.fr.xs));
  no('h3', ev({ mode: 'plag', meth: 'frac', an0: 0.85, T: 1110 }), 'An85 不夠富鈣');
  no('h3', ev({ mode: 'plag', meth: 'eq', an0: 0.95, T: 1110 }), '平衡結晶');
}
{
  const r = find('h4', function* () {
    for (let a = 10; a <= 30; a += 1) for (let ph = 0.05; ph <= 0.4; ph += 0.05) for (const xr of [0, 0.5, 0.9]) yield { o: { preset: '', type: 'rhyolite', a: a, z: 0, xr: xr, phen: ph }, type: 'run' };
  }, otherHidden('h4'));
  ex('h4', r && r.e, r && (r.e.data.type + ' ' + f2(r.e.data.a) + ' m、斑晶 ' + Math.round(r.e.data.phen * 100) + ' %、位置 ' + r.e.data.xr + '：' + r.e.data.tex + '、玻璃 ' + f1(r.e.data.glass * 100) + ' %'));
  if (r) {
    no('h4', ev(r.o), '同樣的設定、沒有看完冷卻');
    no('h4', ev(Object.assign({}, r.o, { a: 5 }), 'run'), '半厚 5 m 太小（只是一顆小岩塊）');
    no('h4', ev(Object.assign({}, r.o, { z: 1 }), 'run'), '不在地表');
  }
  no('h4', ev({ preset: '', type: 'basalt', a: 0.05, z: 0, phen: 0.2 }, 'run'), '玄武岩質的小岩塊');
  no('h4', ev({ preset: 'tatun' }, 'run'), '大屯火山的安山岩石基是結晶的');
  no('h4', ev({ preset: 'obsidian' }), '黑曜岩沒有斑晶');
}
{
  const r = find('h5', function* () { for (let lg = 2; lg <= 3.47; lg += 0.05) for (let z = 0; z <= 15; z += 1) for (const xr of [1, 0.99, 0.95, 0.9]) yield { o: { preset: '', type: 'rhyolite', a: Math.pow(10, lg), z: z, xr: xr } }; }, otherHidden('h5'));
  ex('h5', r && r.e, r && ('流紋岩 ' + f2(r.e.data.a) + ' m、' + r.e.data.z + ' km、位置 ' + r.e.data.xr + '：中心 ' + f2(r.e.data.Lc) + ' mm，這裡玻璃 ' + f1(r.e.data.glass * 100) + ' %'));
  no('h5', ev({ preset: 'granite' }), '花崗岩體中心');
  no('h5', ev({ preset: '', type: 'rhyolite', a: 2000, z: 8, xr: 0.95 }), '深處的花崗岩體邊緣也結晶');
}
{
  const r = find('h6', function* () { for (let x = 0; x <= 1; x += 0.001) for (const meth of ['eq', 'frac']) yield { o: { mode: 'plag', meth: meth, an0: x, T: 1100 }, type: 'run' }; }, otherHidden('h6'));
  ex('h6', r && r.e, r && ('An' + f1(r.e.data.an0) + '：' + f1(r.e.data.TL) + ' → ' + f1(r.e.data.TS) + ' °C，相差 ' + f1(r.e.data.TL - r.e.data.TS) + ' °C'));
  if (r) no('h6', ev(r.o), '同樣的成分、沒有看完降溫');
  no('h6', ev({ mode: 'plag', an0: 0.28, T: 1100 }, 'run'), 'An28 相差 ' + f1(MC.liquidus(0.28) - MC.solidus(0.28)) + ' °C');
  no('h6', ev({ mode: 'plag', T: 1100 }, 'run'), 'An60 相差 ' + f1(ev({ mode: 'plag' }).data.TL - ev({ mode: 'plag' }).data.TS) + ' °C');
}
{
  const r = find('h7', function* () { for (let lg = 3.47; lg >= 2; lg -= 0.05) for (let z = 0; z <= 15; z += 1) for (const xr of [1, 0.99, 0.98]) yield { o: { preset: '', type: 'basalt', a: Math.pow(10, lg), z: z, xr: xr } }; }, otherHidden('h7'));
  ex('h7', r && r.e, r && ('玄武岩 ' + f2(r.e.data.a) + ' m、' + r.e.data.z + ' km、位置 ' + r.e.data.xr + '：中心 ' + f2(r.e.data.Lc) + ' mm ÷ 這裡 ' + f3(r.e.data.L) + ' mm = ' + Math.round(r.e.data.Lc / r.e.data.L)));
  no('h7', ev({ preset: '', type: 'basalt', a: 15, z: 2, xr: 0.95 }), '岩脈的冷凝邊只差幾倍');
}
{
  const r = find('h8', function* () { for (let lg = -1; lg <= 1; lg += 0.05) for (let z = 0; z <= 15; z += 1) for (let ph = 0.05; ph <= 0.4; ph += 0.05) yield { o: { preset: '', type: 'basalt', a: Math.pow(10, lg), z: z, phen: ph }, type: 'run' }; }, otherHidden('h8'));
  ex('h8', r && r.e, r && ('玄武岩 ' + f2(r.e.data.a) + ' m、' + r.e.data.z + ' km、斑晶 ' + Math.round(r.e.data.phen * 100) + ' %：斑晶 ' + f2(r.e.data.Lp) + ' mm、石基 ' + f3(r.e.data.Lg) + ' mm'));
  if (r) {
    no('h8', ev(r.o), '同樣的設定、沒有看完冷卻');
    no('h8', ev(Object.assign({}, r.o, { a: 3 }), 'run'), '半厚 3 m：石基 ' + f3(ev(Object.assign({}, r.o, { a: 3 })).data.Lg) + ' mm，只大 ' + Math.round(ev(Object.assign({}, r.o, { a: 3 })).data.Lp / ev(Object.assign({}, r.o, { a: 3 })).data.Lg) + ' 倍');
  }
  no('h8', ev({ preset: 'tatun' }, 'run'), '大屯火山 ' + f2(ev({ preset: 'tatun' }).data.Lp) + ' mm');
}
{
  const r = find('h9', function* () { for (let lg = 2; lg <= 3.48; lg += 0.02) yield { o: { preset: '', type: 'basalt', a: Math.pow(10, lg), z: 0, xr: 0 } }; }, otherHidden('h9'));
  ex('h9', r && r.e, r && ('玄武岩 ' + f2(r.e.data.a) + ' m、地表：過冷 ' + r.e.data.dT50.toFixed(3) + ' °C'));
  no('h9', ev({}), '澎湖玄武岩過冷 ' + f1(ev({}).data.dT50) + ' °C');
  no('h9', ev({ preset: 'gabbro' }), '輝長岩體在 10 km 深');
}
{
  const r = find('h10', function* () { for (let x = 0.15; x <= 0.3; x += 0.005) { const TL = MC.liquidus(Math.round(x * 1000) / 1000); for (let T = Math.floor(TL * 10) / 10; T >= TL - 3; T -= 0.1) yield { o: { mode: 'plag', meth: 'eq', an0: x, T: T } }; } }, otherHidden('h10'));
  ex('h10', r && r.e, r && ('An' + f1(r.e.data.an0) + '、' + r.e.data.T + ' °C（液相線 ' + f1(r.e.data.TL) + '）：晶體 ' + f2(r.e.data.eq.fs * 100) + ' %、晶體 An' + f1(r.e.data.eq.xs) + '、熔體 An' + f1(r.e.data.eq.xl)));
  if (r) no('h10', ev(Object.assign({}, r.o, { anim: true })), '降溫動畫途中經過');
  no('h10', ev({ mode: 'plag', meth: 'eq', an0: 0.6, T: 1351 }), 'An60、1351 °C（成分差最大，但晶體已經九成九）');
  no('h10', ev({ mode: 'plag', meth: 'eq', an0: 0.6, T: 1475 }), 'An60 剛開始結晶，成分差 ' + f1(ev({ mode: 'plag', meth: 'eq', an0: 0.6, T: 1475 }).data.eq.xs - ev({ mode: 'plag', meth: 'eq', an0: 0.6, T: 1475 }).data.eq.xl) + ' 點');
}

// 隱藏任務彼此不連帶完成
hidIds.forEach(function (id) {
  if (!examples[id]) return;
  const others = hidIds.filter(o => o !== id && hits(o, examples[id]));
  expect(id + ' 的達成例不會順便完成別的隱藏任務', others.length === 0, others.join(','));
});
// 等級分布
{
  const hl = missions.filter(m => m.hidden).map(m => m.level);
  expect('隱藏任務 10 個、等級 3–10、至少 3 個在 7 級以上', hl.length === 10 && Math.min.apply(null, hl) >= 3 && Math.max.apply(null, hl) <= 10 && hl.filter(l => l >= 7).length >= 3, hl.join(','));
  const pub = missions.filter(m => !m.hidden), hidden = missions.filter(m => m.hidden);
  console.log('    公開 ' + pub.length + ' 個 ' + pub.reduce((a, m) => a + m.level, 0) + ' 顆星；隱藏 ' + hidden.length + ' 個 ' + hidden.reduce((a, m) => a + m.level * 2, 0) + ' 顆星');
}

console.log('\n' + ok + ' 項通過' + (bad ? '，' + bad + ' 項失敗' : ''));
if (bad) process.exitCode = 1;
