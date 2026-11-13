/* 任務可達成的證明腳本。用法：node tools/mission-proofs/humidity-dewpoint.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、不該觸發的不會觸發。
 * 事件的內容與 js/humidity-dewpoint.js 的 snapshot() 相同，全部由 js/humidity-dewpoint-core.js 計算：
 *   乾溼球：溼球從氣溫開始以 τ 趨近平衡溫度，差 0.05 °C 以內算穩定（讀數停在平衡溫度上方 0.0495 °C 以內）。
 *   冷杯子：每幀 1/60 秒、畫面快 5 倍（離冷卻極限 1.5 °C 以內快 20 倍），起霧時送一次 run，
 *     起霧後 60 秒、或確定不會起霧、或 900 秒結束時再送一次。
 *   一天：最低、最高相對溼度取 0–24 時每 0.02 小時的樣本。
 *   滑桿：氣溫 −10–40、相對溼度 5–100 %、海拔 0–4000 m、日均溫 −5–32、日較差 2–16、露點 −20–28；打字精度 0.1（海拔 1）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const HM = require(ROOT + 'js/humidity-dewpoint-core.js');
const missions = [];
global.window = { HumCore: HM, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/humidity-dewpoint.js');
const SLUG = 'humidity-dewpoint-';
const byId = id => missions.find(m => m.id === SLUG + id);

// ───── 和頁面相同的事件 ─────
const SETTLE = 0.05;
function psyRun(T, rh, z, type) {
  const p = HM.pressureAt(z), e = HM.eFromRH(T, rh), Tw = HM.wetBulb(T, e, p, type);
  const Tread = Tw + Math.min(Math.max(0, T - Tw), SETTLE * 0.99);
  return { type: 'run', data: {
    mode: 'psy', chart: 'a', anim: false, T: T, rh: rh, z: z, p: p, type: type, e: e, Td: HM.dewPoint(e), Tw: Tw, Tread: Tread, dT: T - Tread, settled: true,
    rhRead: HM.rhPsy(T, Tread, p, type), rhSea: HM.rhPsy(T, Tread, HM.P0, type), rhWrong: HM.rhPsy(T, Tread, p, 'vent') } };
}
/** 冷杯子：回傳這次冷卻送出的 run 事件（起霧一次、結束一次） */
function cupRuns(T, rh, bath) {
  const e = HM.eFromRH(T, rh), Td = HM.dewPoint(e), Tf = HM.frostPoint(e), B = HM.BATH[bath], c = HM.cupInit(T), out = [];
  const ev = function (kind) {
    const on = c.onset;
    return { type: 'run', data: { mode: 'cup', chart: 'a', anim: false, T: T, rh: rh, e: e, Td: Td, Tf: Tf, bath: bath, Tcup: c.T, t: c.t, fog: c.M >= HM.CUP_M0,
      kind: on ? on.kind : null, fogAt: on ? on.T : null, err: on ? on.T - (on.kind === 'frost' ? Tf : Td) : null, runKind: kind } };
  };
  for (let k = 0; k < 1e6; k++) {
    const had = !!c.onset;
    HM.cupStep(c, B, e, (1 / 60) * 5 * (Math.abs(c.T - B) > 1.5 ? 1 : 4));
    if (!had && c.onset) out.push(ev('onset'));
    const noFog = HM.depositPoint(e) < B - 0.02 && Math.abs(c.T - B) < 0.3;
    if (c.t >= 900 || (c.onset && c.t - c.onset.t >= 60) || noFog) { out.push(ev('end')); break; }
  }
  return out;
}
function dayRun(Tmean, range, Td0, wx) {
  const e0 = HM.esw(Td0); let minRH = 1e9, maxRH = -1, sat = false, frost = false, satAll = true;
  for (let i = 0; i <= 1200; i++) { const s = HM.dayState(i * 0.02, Tmean, range, e0); minRH = Math.min(minRH, s.rh); maxRH = Math.max(maxRH, s.rh); if (s.sat) sat = true; else satAll = false; if (s.frost) frost = true; }
  const dd = HM.dayDew(Tmean, range, e0), s = HM.dayState(12, Tmean, range, e0);
  return { type: 'run', data: { mode: 'day', chart: 'a', anim: false, Tmean: Tmean, range: range, Td0: Td0, h: 12, T: s.T, rh: s.rh, Td: s.Td, sat: s.sat, frost: s.frost,
    minRH: minRH, maxRH: maxRH, satAny: sat, frostAny: frost, satAll: satAll, Tmin: dd.Tmin, tp: dd.tp, frozenDew: Td0 > 0 && dd.Tmin < 0 && sat, wx: wx || '' } };
}

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
const f2 = v => v == null ? '—' : (+v).toFixed(2);
const r1 = v => Math.round(v * 10) / 10;
/** 在格子上找第一組讓 id 成立、又不觸發其他隱藏任務的設定 */
function find(id, gen) {
  for (const evs of gen()) { const a = [].concat(evs); if (anyHit(id, a) && !hidIds.some(h => h !== id && anyHit(h, a))) return a; }
  return null;
}

console.log('humidity-dewpoint 任務證明');
expect('一般任務 12 個、隱藏任務 10 個', allIds.length - hidIds.length === 12 && hidIds.length === 10);
{ const lv = hidIds.map(lvOf); expect('隱藏任務等級 3–10、至少 3 個在 7 級以上', lv.every(l => l >= 3 && l <= 10) && lv.filter(l => l >= 7).length >= 3, lv.join(',')); }

// ───── 預設值 ─────
const P0 = psyRun(25, 0.6, 0, 'vent'), C0 = cupRuns(25, 0.6, 'ice'), D0 = dayRun(20, 10, 13);
ex('1', P0, '預設 25 °C、60 %：溼球 ' + f2(P0.data.Tw) + ' °C');
ex('2', C0, '預設加冰塊：' + f2(C0[0].data.fogAt) + ' °C 起霧（露點 ' + f2(C0[0].data.Td) + '）');
ex('3', D0, '預設一天');
{ const f = fired([P0]).concat(fired(C0), fired([D0])).filter(high); expect('預設的三種量測不觸發 6 級以上與隱藏任務', !f.length, f.join(',')); }
{ const ld = { type: 'state', data: P0.data }; expect('state 事件不判定（只看量完的 run）', !fired([ld]).length); }
{ const e = psyRun(25, 0.6, 0, 'vent'); e.data.settled = false; expect('溼球還沒穩定不判定乾溼球任務', !['1', '4', '7', '10', 'h3', 'h4', 'h5', 'h8'].some(id => hits(id, e))); }

// ───── 乾溼球 ─────
let e = find('4', function* () { for (let f = 0.6; f >= 0.05; f -= 0.05) yield psyRun(30, f, 0, 'vent'); });
ex('4', e, e && '30 °C、' + Math.round(e[0].data.rh * 100) + ' %：差 ' + f2(e[0].data.dT));
no('4', P0, '預設只差 ' + f2(P0.data.dT));
e = find('7', function* () { for (let T = 25; T <= 40; T += 0.1) for (let f = 0.49; f <= 0.51; f += 0.001) yield psyRun(r1(T), Math.round(f * 1000) / 1000, 0, 'vent'); });
ex('7', e, e && e[0].data.T + ' °C、' + f2(e[0].data.rh * 100) + ' %：讀出 ' + f2(e[0].data.rhRead * 100) + ' %、差 ' + f2(e[0].data.dT));
no('7', psyRun(20, 0.5, 0, 'vent'), '20 °C、50 %（差只有 ' + f2(psyRun(20, 0.5, 0, 'vent').data.dT) + ' °C）');
e = find('10', function* () { for (let z = 2500; z <= 4000; z += 250) yield psyRun(30, 0.2, z, 'vent'); });
ex('10', e, e && '海拔 ' + e[0].data.z + ' m、30 °C、20 %：多 ' + f2((e[0].data.rhRead - e[0].data.rhSea) * 100) + ' %');
no('10', psyRun(30, 0.2, 2400, 'vent'), '海拔 2400 m');
no('10', psyRun(25, 0.95, 4000, 'vent'), '很溼的空氣（溫差小，氣壓影響小）');
e = find('h3', function* () { for (let T = 6; T <= 8; T += 0.5) for (let f = 0.05; f <= 0.6; f += 0.05) yield psyRun(T, f, 0, 'vent'); });
ex('h3', e, e && e[0].data.T + ' °C、' + Math.round(e[0].data.rh * 100) + ' %：溼球 ' + f2(e[0].data.Tw));
no('h3', psyRun(5.9, 0.05, 0, 'vent'), '氣溫 5.9 °C'); no('h3', psyRun(25, 0.05, 0, 'vent'), '25 °C、5 %（溼球 ' + f2(psyRun(25, 0.05, 0, 'vent').data.Tw) + ' °C）');
e = find('h4', function* () { for (let T = 10; T <= 20; T += 1) for (let f = 0.05; f <= 0.3; f += 0.01) yield psyRun(T, Math.round(f * 100) / 100, 0, 'still'); });
ex('h4', e, e && e[0].data.T + ' °C、' + Math.round(e[0].data.rh * 100) + ' %：百葉箱 ' + f2(e[0].data.rhRead * 100) + ' %、誤用通風 ' + f2(e[0].data.rhWrong * 100) + ' %');
no('h4', psyRun(40, 0.05, 0, 'vent'), '通風型（本來就用通風的表）');
no('h4', psyRun(25, 0.6, 0, 'still'), '預設空氣用百葉箱'); no('h4', psyRun(0, 0.05, 0, 'still'), '0 °C、5 %（差很多但太冷）');
ex('h5', psyRun(25, 0.6, 3952, 'vent'), '海拔 3952 m');
no('h5', psyRun(25, 0.6, 3941, 'vent'), '海拔 3941 m'); no('h5', psyRun(25, 0.6, 4000, 'vent'), '滑桿最高 4000 m');
e = find('h8', function* () { for (let f = 0.6; f <= 0.8; f += 0.001) yield psyRun(40, Math.round(f * 1000) / 1000, 0, 'vent'); });
ex('h8', e, e && '40 °C、' + f2(e[0].data.rh * 100) + ' %：溼球 ' + f2(e[0].data.Tw));
no('h8', psyRun(36, 1, 0, 'vent'), '36 °C、100 %（溼球 36、差 0）');
no('h8', psyRun(35.2, 1, 0, 'vent'), '35.2 °C 飽和（溫差不到 2 °C）');

// ───── 冷杯子 ─────
ex('2', C0); no('5', C0, '預設（露點 ' + f2(C0[0].data.Td) + ' °C，先起霧）');
e = find('5', function* () { for (let f = 0.4; f >= 0.05; f -= 0.05) yield cupRuns(10, f, 'salt'); });
ex('5', e, e && '10 °C、' + Math.round(e[0].data.rh * 100) + ' %、冰加鹽：' + f2(e[0].data.fogAt) + ' °C 結霜');
no('5', cupRuns(25, 0.6, 'salt'), '預設空氣加冰加鹽（先起霧才結冰）');
e = find('8', function* () { for (let f = 0.6; f <= 1.001; f += 0.02) yield cupRuns(30, Math.min(1, f), 'ice'); });
ex('8', e, e && '30 °C、' + Math.round(e[0].data.rh * 100) + ' %：露點 ' + f2(e[0].data.Td));
e = find('11', function* () { for (let T = 10; T <= 30; T += 1) for (let f = 0.2; f <= 0.9; f += 0.05) yield cupRuns(T, Math.round(f * 100) / 100, 'cold'); });
ex('11', e, e && e[0].data.T + ' °C、' + Math.round(e[0].data.rh * 100) + ' %、冷水：差 ' + f2(e[0].data.err));
no('11', C0, '預設加冰塊（差 ' + f2(C0[0].data.err) + '）');
// h1：露點在 0–0.5 °C，冰水冷到底也不起霧
{ let hit = null; for (let f = 0.15; f <= 0.3 && !hit; f += 0.001) { const fr = Math.round(f * 1000) / 1000, Td = HM.dewPoint(HM.eFromRH(25, fr)); if (Td >= 0 && Td < 0.45) { const a = cupRuns(25, fr, 'ice'); if (anyHit('h1', a)) hit = a; } }
  ex('h1', hit, hit && '25 °C、' + f2(hit[0].data.rh * 100) + ' %：露點 ' + f2(hit[0].data.Td) + ' °C'); }
no('h1', cupRuns(25, 0.05, 'ice'), '25 °C、5 %（露點 ' + f2(HM.dewPoint(HM.eFromRH(25, 0.05))) + ' °C，乾到不行，不是差一點點）');
no('h1', cupRuns(25, 0.6, 'cold'), '預設空氣用冷水');
// h7：冷水只比露點低一點點
e = find('h7', function* () { for (let f = 0.295; f <= 0.31; f += 0.001) yield cupRuns(25, Math.round(f * 1000) / 1000, 'cold'); });
ex('h7', e, e && '25 °C、' + f2(e[0].data.rh * 100) + ' %：露點 ' + f2(e[0].data.Td) + '、差 ' + f2(e[0].data.err));
{ const a = cupRuns(25, 0.6, 'cold'); no('h7', a, '預設空氣用冷水（差 ' + f2(a[0].data.err) + '）'); }
// h9：冰加鹽，霜點只比 −9 °C 高一點點
e = find('h9', function* () { for (let f = 0.22; f <= 0.24; f += 0.001) yield cupRuns(10, Math.round(f * 1000) / 1000, 'salt'); });
ex('h9', e, e && '10 °C、' + f2(e[0].data.rh * 100) + ' %：霜點 ' + f2(e[0].data.Tf) + '、差 ' + f2(e[0].data.err));
{ const a = cupRuns(10, 0.3, 'salt'); no('h9', a, '10 °C、30 % 加冰加鹽（差 ' + f2(a[0].data.err) + '）'); }

// ───── 一天 ─────
const WX = [['clear', 18, 12, 12.5], ['cloudy', 20, 3, 16], ['humid', 29, 7, 25], ['frost', 3, 14, -4], ['desert', 25, 16, -5]];
const W = {}; WX.forEach(w => { W[w[0]] = dayRun(w[1], w[2], w[3], w[0]); });
ex('6', W.clear, '晴朗的秋夜');
no('6', W.frost, '寒流過後（結的是霜）'); no('6', W.cloudy, '陰天（最低 18.5 °C，露點 16）');
e = find('9', function* () { for (let Tm = 4; Tm <= 12; Tm += 0.5) yield dayRun(Tm, 16, -10); });
ex('9', e, e && '日均溫 ' + e[0].data.Tmean + '、日較差 16、露點 −10：' + f2(e[0].data.maxRH / e[0].data.minRH) + ' 倍');
no('9', W.desert, '沙漠（' + f2(W.desert.data.maxRH / W.desert.data.minRH) + ' 倍）');
// 12：最低溫剛好碰到露點
{ const Td0 = 12; let hit = null; for (let Tm = 17.9; Tm <= 18.3 && !hit; Tm = r1(Tm + 0.1)) { const a = dayRun(Tm, 12, Td0); if (hits('12', a)) hit = a; }
  ex('12', hit, hit && '日均溫 ' + hit.data.Tmean + '、日較差 12、露點 12：最低 ' + f2(hit.data.Tmin) + '、開始結露 ' + f2(hit.data.tp)); }
no('12', W.clear, '晴朗的秋夜（低 ' + f2(W.clear.data.tp - W.clear.data.Tmin) + ' °C）');
no('12', dayRun(18.5, 12, 12), '最低溫 12.5 °C 比露點高（沒有露水）');
ex('h2', dayRun(20, 4, 22.2), '日均溫 20、日較差 4、露點 22.2');
no('h2', dayRun(20, 4, 23), '露點 23（比最高溫高 1 °C，不是剛好）');
no('h2', dayRun(20, 16, 28), '最高溫和露點都是 28（差 0）');
e = find('h6', function* () { for (let Td0 = 0.5; Td0 <= 5; Td0 += 0.5) for (let Tm = 2; Tm <= 7; Tm += 0.5) yield dayRun(Tm, 12, Td0); });
ex('h6', e, e && '日均溫 ' + e[0].data.Tmean + '、日較差 12、露點 ' + e[0].data.Td0);
no('h6', dayRun(-5, 10, 13), '日均溫 −5、露點 13（整天飽和，不是先露後冰）');
no('h6', W.frost, '寒流過後（露點 −4，直接結霜）');
e = find('h10', function* () { for (let Tm = 4; Tm <= 7; Tm = r1(Tm + 0.1)) for (let Td0 = -6; Td0 <= -1; Td0 += 0.5) yield dayRun(Tm, 16, Td0); });
ex('h10', e, e && '日均溫 ' + e[0].data.Tmean + '、日較差 16、露點 ' + e[0].data.Td0 + '：最低溼度 ' + f2(e[0].data.minRH * 100) + ' %');
no('h10', W.frost, '寒流過後（最低溼度 ' + f2(W.frost.data.minRH * 100) + ' %）');

// ───── 預設天氣與滑桿端點組合 ─────
WX.forEach(w => { const f = fired([W[w[0]]]).filter(high); expect('按「' + w[0] + '」不觸發 6 級以上與隱藏任務', !f.length, f.join(',')); });
{ const badc = []; [-10, 1, 25, 40].forEach(T => [0.05, 0.6, 1].forEach(f => [0, 4000].forEach(z => ['vent', 'still'].forEach(t => { const x = fired([psyRun(T, f, z, t)]).filter(high); if (x.length) badc.push(T + '/' + f + '/' + z + '/' + t + ':' + x.join(',')); }))));
  expect('乾溼球滑桿端點的組合都不觸發 6 級以上與隱藏任務', !badc.length, badc.join('；')); }
{ const badc = []; [-10, 25, 40].forEach(T => [0.05, 0.6, 1].forEach(f => ['cold', 'ice', 'salt'].forEach(b => { const x = fired(cupRuns(T, f, b)).filter(high); if (x.length) badc.push(T + '/' + f + '/' + b + ':' + x.join(',')); })));
  expect('冷杯子滑桿端點的組合都不觸發 6 級以上與隱藏任務', !badc.length, badc.join('；')); }
{ const badc = []; [-5, 20, 32].forEach(m => [2, 10, 16].forEach(r => [-20, 13, 28].forEach(t => { const x = fired([dayRun(m, r, t)]).filter(high); if (x.length) badc.push(m + '/' + r + '/' + t + ':' + x.join(',')); })));
  expect('一天的滑桿端點的組合都不觸發 6 級以上與隱藏任務', !badc.length, badc.join('；')); }
{ const e1 = dayRun(20, 10, 13); e1.data.anim = true; e1.type = 'state'; expect('播放中的 state 不判定', !fired([e1]).length); }

// ───── 隱藏任務彼此不連帶 ─────
hidIds.forEach(id => { const evs = examples[id]; if (!evs) return; const f = fired(evs).filter(x => x[0] === 'h' && x !== id); expect(id + ' 的例子不連帶完成其他隱藏任務', !f.length, f.join(',')); });

console.log(`\nhumidity-dewpoint：${ok} 項通過、${bad} 項失敗`);
if (bad) process.exitCode = 1;
