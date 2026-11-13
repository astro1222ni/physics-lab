/* 任務可達成的證明腳本。用法：node tools/mission-proofs/population-pyramid.js（約半分鐘）
 * 修改核心或任務條件後重跑，確認每個任務都做得到、預設狀態不會觸發、隱藏任務彼此不會順便完成。
 * 事件 'pop' 的內容由下面的 snap() 產生，和 js/population-pyramid.js 的 snapshot() 用同一套算法
 * （同一個核心 PopCore、同樣的情境、同樣從 2025 年真實人口或穩定人口出發）。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const K = require(ROOT + 'js/population-pyramid-core.js');
const missions = [];
global.window = { PopCore: K, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/population-pyramid.js');
const byId = id => missions.find(m => m.id === 'population-pyramid-' + id);

let ok = 0, bad = 0;
function expect(label, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + label + (extra ? '（' + extra + '）' : '')); }
  else { bad++; console.error('  ✗ ' + label + (extra ? '（' + extra + '）' : '')); }
}
const START = K.BASE_YEAR, END = K.END_YEAR;
const BASE = K.basePop(), BASE_TOTAL = K.indicators(BASE).total;

// ---------- 和頁面相同的快照 ----------
const trajCache = {};
function trajOf(s) {
  const sc = s.mode === 'ndc' ? { mode: 'ndc' } : { mode: 'custom', tfr: s.tfr, e0: s.e0, net: s.mode === 'stable' ? 0 : s.net * 1000, srb: s.srb };
  const key = s.mode + '|' + JSON.stringify(sc);
  if (trajCache[key]) return trajCache[key];
  let start = BASE, r = 0;
  if (s.mode === 'stable') { const st = K.stablePop(sc, BASE_TOTAL); start = st.pop; r = st.r; }
  const traj = K.project(start, sc, END);
  const keys = Object.keys(trajCache); if (keys.length > 300) keys.slice(0, 150).forEach(k => delete trajCache[k]);
  return (trajCache[key] = { traj, inds: traj.map(K.indicators), r });
}
const DEF = { mode: 'ndc', tfr: 0.7, e0: 81.5, net: 0, srb: 107, year: START, past: null, cmp: 'start', cohort: null, cohortFrom: null, running: false };
function snap(o, act) {
  const s = Object.assign({}, DEF, o), T = trajOf(s), i = s.year - START;
  const pop = s.past ? K.pastPop(s.past) : T.traj[i], d = K.indicators(pop), y = s.past || s.year;
  let cmp = null;
  if (s.cmp === 'start') cmp = (s.past || s.year !== START || s.mode === 'stable') ? BASE : null;
  else if (s.cmp === 'ndc' && !s.past) cmp = K.ndcPop(s.year);
  let co = null;
  if (s.cohort != null) {
    const age = y - s.cohort;
    co = { year: s.cohort, age, from: s.cohortFrom, n: age < 0 ? null : age > 100 ? 0 : pop.m[Math.min(age, 100)] + pop.f[Math.min(age, 100)] };
  }
  return { type: 'pop', data: {
    act: act || 'year', running: s.running, mode: s.mode, view: s.past ? 'past' : 'proj', real: !!s.past || (s.year === START && s.mode !== 'stable'),
    year: y, tfr: s.mode === 'ndc' ? (i > 0 ? T.traj[i].tfr : K.DATA.asfr.tfr) : s.tfr,
    e0: s.e0, net: s.mode === 'custom' ? s.net : 0, srb: s.srb,
    total: d.total, total2025: BASE_TOTAL, pct0_14: d.pct0_14, pct65: d.pct65, dep: d.dep,
    depPrev: !s.past && i > 0 ? T.inds[i - 1].dep : null, aging: d.aging, median: d.median,
    sexRatio: d.sexRatio, p100: d.p100, shape: d.shape,
    cmp: s.cmp, cmpDist: cmp ? K.distance(pop, cmp) : null,
    cohort: co ? co.year : null, cohortAge: co ? co.age : null, cohortFrom: co ? co.from : null, cohortN: co ? co.n : null,
    r: s.mode === 'stable' ? T.r : null,
    depMin: s.mode === 'stable' ? K.minDependency(s.e0, s.srb).dep : null
  } };
}
const firing = e => missions.filter(m => m.check(e)).map(m => m.id.replace('population-pyramid-', ''));
const hiddenOf = list => list.filter(x => x[0] === 'h');
const used = {};
function witness(id, e, note) {
  const f = firing(e);
  used[id] = e;
  expect(id + ' 做得到', f.indexOf(id) >= 0, note + '；同時完成：' + (f.filter(x => x !== id).join('、') || '無'));
  return f;
}
const ind = (o, y) => trajOf(Object.assign({}, DEF, o)).inds[y - START];
const TFRS = []; for (let k = 0; k <= 110; k++) TFRS.push(+(0.5 + 0.05 * k).toFixed(2));
const NETS = []; for (let k = -20; k <= 60; k++) NETS.push(5 * k);
const E0S = []; for (let k = 0; k <= 130; k++) E0S.push(30 + 0.5 * k);

console.log('population-pyramid 任務證明\n');

console.log('[預設與一般操作]');
{
  const acts = ['play', 'playstart', 'pause', 'step', 'back', 'year', 'mode', 'param', 'cmp'];
  expect('2025 年、任何操作都不會完成任務', acts.every(a => firing(snap({}, a)).length === 0));
  const modes = ['custom', 'stable'].map(m => firing(snap({ mode: m }, 'mode')));
  expect('只切到「自訂」或「穩定人口」不會完成任務', modes.every(f => f.length === 0), modes.map(f => f.join('、')).join('｜'));
  // 照國發會中推估一路播放到 2125，每一年（播放中與暫停）都不會完成隱藏任務
  const hit = new Set();
  for (let y = START; y <= END; y++) { [true, false].forEach(run => hiddenOf(firing(snap({ year: y, running: run }, run ? 'play' : 'pause'))).forEach(x => hit.add(x))); }
  expect('照國發會中推估播放到 2125 年、每一年暫停，都不會完成隱藏任務', hit.size === 0, [...hit].join('、'));
  const hit2 = new Set();
  for (let y = START; y <= END; y++) hiddenOf(firing(snap({ mode: 'custom', year: y }, 'year'))).forEach(x => hit2.add(x));
  expect('「自訂」預設值播放到 2125 年也不會完成隱藏任務', hit2.size === 0, [...hit2].join('、'));
}

console.log('\n[公開任務]');
{
  witness('1', snap({ year: 2050 }, 'year'), '國發會中推估 2050 年');
  expect('2049 年還不算', !byId('1').check(snap({ year: 2049 }, 'year')));
  expect('看過去的年份不算', !byId('1').check(snap({ past: 2024 }, 'past')));
}
{
  witness('2', snap({ past: 1992 }, 'past'), '看 1992 年');
  expect('2000 年不算', !byId('2').check(snap({ past: 2000 }, 'past')));
}
witness('3', snap({ cohort: 1985, cohortFrom: 40 }, 'cohort'), '2025 年點 40 歲（1985 年出生）');
{
  let y = START + 1;
  while (!(ind({}, y).dep >= 100 && ind({}, y - 1).dep < 100)) y++;
  witness('4', snap({ year: y }, 'year'), '國發會中推估 ' + y + ' 年扶養比 ' + ind({}, y).dep.toFixed(1) + '（前一年 ' + ind({}, y - 1).dep.toFixed(1) + '）');
  expect('播放中經過不算', !byId('4').check(snap({ year: y, running: true }, 'play')));
  expect('晚一年就不算', !byId('4').check(snap({ year: y + 1 }, 'year')));
}
{
  let y = START; while (ind({ mode: 'custom', tfr: 3 }, y).shape !== 'expansive') y++;
  witness('5', snap({ mode: 'custom', tfr: 3, year: y }, 'year'), '總生育率 3，第 ' + y + ' 年變擴張型');
  let any = false; for (let yy = START; yy <= END; yy++) if (ind({}, yy).shape === 'expansive') any = true;
  expect('國發會中推估一百年都不會是擴張型', !any);
}
{
  witness('6', snap({ year: 2050, cmp: 'ndc' }, 'cmp'), '2050 年對照國發會，逐歲差距 ' + (100 * snap({ year: 2050, cmp: 'ndc' }).data.cmpDist).toFixed(1) + '%');
  expect('2045 年國發會沒有公布，不算', !byId('6').check(snap({ year: 2045, cmp: 'ndc' }, 'cmp')));
  expect('2040 年太早，不算', !byId('6').check(snap({ year: 2040, cmp: 'ndc' }, 'cmp')));
}
{
  const t = TFRS.find(t => ind({ mode: 'custom', tfr: t }, 2125).pct65 < 14);
  witness('7', snap({ mode: 'custom', tfr: t, year: 2125 }, 'year'), '總生育率 ' + t + '，2125 年 65 歲以上 ' + ind({ mode: 'custom', tfr: t }, 2125).pct65.toFixed(1) + '%');
}
{
  const o = { mode: 'custom', tfr: 2.1, net: 0 };
  witness('8', snap(Object.assign({ year: 2075 }, o), 'year'), '2075 年人口是 2025 年的 ' + (ind(o, 2075).total / BASE_TOTAL).toFixed(3) + ' 倍');
  expect('有淨遷入就不算', !byId('8').check(snap({ mode: 'custom', tfr: 2.1, net: 5, year: 2075 }, 'year')));
}
{
  const n = NETS.find(n => ind({ mode: 'custom', tfr: 1.0, net: n }, 2075).total >= BASE_TOTAL);
  witness('9', snap({ mode: 'custom', tfr: 1.0, net: n, year: 2075 }, 'year'), '總生育率 1.0、每年淨遷入 ' + n + ' 千人');
  expect('少 5 千人就不夠', !byId('9').check(snap({ mode: 'custom', tfr: 1.0, net: n - 5, year: 2075 }, 'year')));
}
{
  witness('10', snap({ mode: 'stable', tfr: 2.1 }, 'param'), '總生育率 2.1、平均壽命 81.5 歲，每年 ' + (100 * trajOf(Object.assign({}, DEF, { mode: 'stable', tfr: 2.1 })).r).toFixed(3) + '%');
  expect('總生育率 2.05 不算', !byId('10').check(snap({ mode: 'stable', tfr: 2.05 }, 'param')));
}
{
  let w = null;
  for (const e0 of [81.5, 80, 85]) for (const n of [300, 250, 200]) { const t = TFRS.find(t => ind({ mode: 'custom', tfr: t, net: n, e0 }, 2075).dep <= 70); if (t && !w) w = { tfr: t, net: n, e0 }; }
  witness('11', snap(Object.assign({ mode: 'custom', year: 2075 }, w), 'year'), '總生育率 ' + w.tfr + '、淨遷入 ' + w.net + ' 千人、平均壽命 ' + w.e0 + '：扶養比 ' + ind(Object.assign({ mode: 'custom' }, w), 2075).dep.toFixed(1));
  expect('國發會中推估 2075 年做不到', ind({}, 2075).dep > 70, ind({}, 2075).dep.toFixed(1));
}
{
  let w = null;
  outer: for (const t of [1.5, 1.4, 1.3]) for (const e0 of [81.5, 82, 81, 82.5, 80.5, 83, 80]) for (const n of NETS) {
    const v = ind({ mode: 'custom', tfr: t, net: n, e0 }, 2125).total / BASE_TOTAL;
    if (Math.abs(v - 1) < 0.01) { w = { tfr: t, net: n, e0, v }; break outer; }
  }
  witness('12', snap({ mode: 'custom', tfr: w.tfr, net: w.net, e0: w.e0, year: 2125 }, 'year'), '總生育率 ' + w.tfr + '、平均壽命 ' + w.e0 + '、淨遷入 ' + w.net + ' 千人：2125 年是 2025 年的 ' + w.v.toFixed(4) + ' 倍');
}

console.log('\n[隱藏任務]');
{
  witness('h1', snap({ cohort: 1976, cohortFrom: 49 }, 'cohort'), '2025 年點 49 歲（1976 龍年）');
  witness('h1', snap({ past: 1992, cohort: 1988, cohortFrom: 4 }, 'cohort'), '1992 年點 4 歲（1988 龍年）');
  expect('穩定人口的畫面不是真實資料，不算', !byId('h1').check(snap({ mode: 'stable', cohort: 1976, cohortFrom: 49 }, 'cohort')));
  expect('推估的年份不算', !byId('h1').check(snap({ year: 2030, cohort: 2000, cohortFrom: 30 }, 'cohort')));
  expect('前後一年不算', !byId('h1').check(snap({ cohort: 1977, cohortFrom: 48 }, 'cohort')));
}
{
  witness('h2', snap({ cohort: 2010, cohortFrom: 15 }, 'cohort'), '2025 年點 15 歲（2010 虎年）');
  expect('1974（虎年但沒有變少）不算', !byId('h2').check(snap({ cohort: 1974, cohortFrom: 51 }, 'cohort')));
}
{
  let w = null;
  for (const srb of [125, 124, 123, 122, 120]) {
    if (w) break;
    for (let y = START + 1; y <= END; y++) if (Math.abs(ind({ mode: 'custom', srb }, y).sexRatio - 100) <= 0.05) { w = { srb, y }; break; }
  }
  witness('h3', snap({ mode: 'custom', srb: w.srb, year: w.y }, 'year'), '出生性比例 ' + w.srb + '，' + w.y + ' 年性比例 ' + ind({ mode: 'custom', srb: w.srb }, w.y).sexRatio.toFixed(3));
  expect('播放中經過不算', !byId('h3').check(snap({ mode: 'custom', srb: w.srb, year: w.y, running: true }, 'play')));
  let near = 0; for (let y = START + 1; y <= END; y++) if (Math.abs(ind({}, y).sexRatio - 100) <= 0.5) near++;
  expect('國發會中推估的性比例一百年都離 100 很遠', near === 0);
}
{
  witness('h4', snap({ year: 2125, cohort: 2025, cohortFrom: 0 }, 'year'), '2025 年點最下面一條（0 歲），走到 2125 年');
  expect('從 30 歲開始跟不算', !byId('h4').check(snap({ year: 2095, cohort: 1995, cohortFrom: 30 }, 'year')));
  expect('還沒到 100 歲不算', !byId('h4').check(snap({ year: 2124, cohort: 2025, cohortFrom: 0 }, 'year')));
}
{
  const hits = [];
  for (const t of TFRS.filter(t => t <= 1.2)) for (const e of [75, 78, 80, 81.5, 83, 85]) {
    const a = K.indicators(K.stablePop({ tfr: t, e0: e, srb: 107 }).pop).aging;
    if (Math.abs(a - 1000) <= 10) hits.push([t, e, a]);
  }
  const w = hits[0];
  witness('h5', snap({ mode: 'stable', tfr: w[0], e0: w[1] }, 'param'), '總生育率 ' + w[0] + '、平均壽命 ' + w[1] + '：老化指數 ' + w[2].toFixed(1));
  expect('預設的穩定人口（老化指數 ' + ind({ mode: 'stable' }, START).aging.toFixed(0) + '）不算', !byId('h5').check(snap({ mode: 'stable' }, 'param')));
  let all = 0, n = 0;
  for (let k = 0; k < 600; k++) { const t = TFRS[(k * 37) % TFRS.length], e = E0S[(k * 53) % E0S.length]; n++; if (byId('h5').check(snap({ mode: 'stable', tfr: t, e0: e }, 'param'))) all++; }
  expect('隨便選滑桿碰到的機會很小', all / n < 0.02, all + '／' + n);
}
{
  const o = { mode: 'custom', tfr: 0.5, net: -100 };
  let y = START; while (ind(o, y).total > BASE_TOTAL / 2) y++;
  witness('h6', snap(Object.assign({ year: y }, o), 'year'), '總生育率 0.5、每年淨遷出 10 萬人，' + y + ' 年剩一半');
  expect('國發會中推估要到 2076 年，不算', !byId('h6').check(snap({ year: 2076 }, 'year')));
}
{
  const o = { mode: 'custom', tfr: 6, e0: 60 };
  let y = START; while (ind(o, y).median >= 16 || Math.abs(ind(o, y).sexRatio - 100) <= 0.05) y++;
  witness('h7', snap(Object.assign({ year: y }, o), 'year'), '總生育率 6、平均壽命 60，' + y + ' 年中位數 ' + ind(o, y).median.toFixed(1) + ' 歲');
  expect('穩定人口不算（最年輕的也有 17 歲以上）', !byId('h7').check(snap({ mode: 'stable', tfr: 6, e0: 60 }, 'param')));
}
{
  const hits = [];
  for (const t of TFRS) for (const e of E0S) { const r = K.stablePop({ tfr: t, e0: e, srb: 107 }).r; if (r > 0 && Math.abs(Math.log(2) / Math.log(1 + r) - 35) <= 0.25) hits.push([t, e, Math.log(2) / Math.log(1 + r)]); }
  const w = hits[0];
  witness('h8', snap({ mode: 'stable', tfr: w[0], e0: w[1] }, 'param'), '總生育率 ' + w[0] + '、平均壽命 ' + w[1] + '：每 ' + w[2].toFixed(2) + ' 年翻倍');
  expect('滑桿組合裡符合的很少', hits.length / (TFRS.length * E0S.length) < 0.01, hits.length + '／' + TFRS.length * E0S.length);
  expect('只換情境（不是改滑桿）不算', !byId('h8').check(snap({ mode: 'stable', tfr: w[0], e0: w[1] }, 'mode')));
}
{
  const o = { mode: 'custom', e0: 95 };
  let y = START; while (ind(o, y).p100 < 1e5) y++;
  witness('h9', snap(Object.assign({ year: y }, o), 'year'), '平均壽命 95 歲，' + y + ' 年 100 歲以上 ' + Math.round(ind(o, y).p100) + ' 人');
  expect('國發會中推估 2045 年不到 10 萬人', !byId('h9').check(snap({ year: 2045 }, 'year')), Math.round(ind({}, 2045).p100) + ' 人');
}
{
  const m = K.minDependency(81.5, 107);
  const ok10 = TFRS.filter(t => byId('h10').check(snap({ mode: 'stable', tfr: t }, 'param')));
  witness('h10', snap({ mode: 'stable', tfr: ok10[0] }, 'param'), '平均壽命 81.5：扶養比最低在總生育率 ' + m.tfr.toFixed(3) + '（' + m.dep.toFixed(2) + '），滑桿上符合的是 ' + ok10.join('、'));
  expect('滑桿上只有一兩格符合', ok10.length >= 1 && ok10.length <= 2, ok10.length + ' 格');
  expect('不是改滑桿（例如只換情境）不算', !byId('h10').check(snap({ mode: 'stable', tfr: ok10[0] }, 'mode')));
  let all = 0, n = 0;
  for (let k = 0; k < 600; k++) { const t = TFRS[(k * 41) % TFRS.length], e = E0S[(k * 59) % E0S.length]; n++; if (byId('h10').check(snap({ mode: 'stable', tfr: t, e0: e }, 'param'))) all++; }
  expect('隨便選滑桿碰到的機會很小', all / n < 0.03, all + '／' + n);
}

console.log('\n[互不干擾]');
{
  const H = Object.keys(used).filter(x => x[0] === 'h');
  H.forEach(id => { const o = hiddenOf(firing(used[id])).filter(x => x !== id); expect(id + ' 的做法不會順便完成其他隱藏任務', o.length === 0, o.join('、')); });
  const leak = [];
  Object.keys(used).filter(x => x[0] !== 'h').forEach(id => { const h = hiddenOf(firing(used[id])); if (h.length) leak.push(id + '→' + h.join('、')); });
  expect('公開任務的做法不會順便完成隱藏任務', leak.length === 0, leak.join('；'));
}

console.log('\n[隨機操作]');
{
  // 像學生亂玩：隨機情境、隨機滑桿、隨機年份、偶爾看過去、偶爾點長條
  let seed = 2026; const R = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = a => a[Math.floor(R() * a.length)];
  const cnt = {}, tries = 400;
  for (let n = 0; n < tries; n++) {
    const s = { mode: pick(['ndc', 'ndc', 'custom', 'stable']), tfr: pick(TFRS), e0: pick(E0S), net: pick(NETS), srb: pick([95, 100, 105, 107, 110, 115, 120, 125]), cmp: pick(['none', 'start', 'ndc']), year: START, cohort: null, cohortFrom: null };
    const hits = new Set(), look = (o, act) => hiddenOf(firing(snap(Object.assign(s, o), act))).forEach(x => hits.add(x));
    look({}, 'param');
    for (let k = 0; k < 8; k++) {
      const a = R();
      if (a < 0.4) look({ year: Math.min(END, s.year + 1 + Math.floor(R() * 30)), past: null, running: R() < 0.5 }, 'play');
      else if (a < 0.6) { const age = Math.floor(R() * 101), y = s.past || s.year; look({ cohort: y - age, cohortFrom: age }, 'cohort'); }
      else if (a < 0.7) look({ past: pick(K.PAST) }, 'past');
      else look({ past: null, year: START + Math.floor(R() * 101) }, 'year');
    }
    hits.forEach(x => { cnt[x] = (cnt[x] || 0) + 1; });
  }
  const worst = Object.keys(cnt).map(x => x + ' ' + cnt[x]).join('、') || '都沒有';
  // h1、h2 點真實資料的長條本來就可能點中（101 條裡的 4 條、2 條），放寬到 8%；其他低於 2%
  const lim = { h1: 0.08, h2: 0.05 };
  expect('隨機情境與操作亂玩 ' + tries + ' 次，隱藏任務碰巧完成的比例夠低', Object.keys(cnt).every(x => cnt[x] / tries < (lim[x] || 0.02)), worst);
}

const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
console.log('\n合計：' + ok + ' 項通過，' + bad + ' 項失敗');
console.log('公開 ' + pub.length + ' 個（' + pub.reduce((a, m) => a + m.level, 0) + ' 顆星），隱藏 ' + hid.length + ' 個（' + hid.reduce((a, m) => a + 2 * m.level, 0) + ' 顆星）；7 級以上的隱藏任務 ' + hid.filter(m => m.level >= 7).length + ' 個');
if (bad) process.exitCode = 1;
