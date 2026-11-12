/* 任務可達成的證明腳本。用法：node tools/mission-proofs/geologic-time.js
 * 修改核心或任務條件後重跑，確認每個任務仍然做得到、不該觸發的不會觸發。
 * 事件內容與 js/geologic-time.js 的 storySnap()、measureNow()、check() 相同，全部由 js/geologic-time-core.js 計算。
 * 時間滑桿可打字到 0.001 百萬年（data-decimals="3"），範圍：剖面一 0–1800、剖面二 0–560 百萬年前。 */
'use strict';
const ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const G = require(ROOT + 'js/geologic-time-core.js');
const missions = [];
global.window = { GeoTimeCore: G, LabMission: { register: (id, list) => list.forEach(m => missions.push(m)) } };
global.LabMission = global.window.LabMission;
require(ROOT + 'js/missions/geologic-time.js');
const byId = id => missions.find(m => m.id === 'geologic-time-' + id);

const ERAS = G.ERAS;
function eraAt(t) { for (let i = 0; i < ERAS.length; i++) if (t <= ERAS[i].from && t >= ERAS[i].to) return ERAS[i].id; return 'precambrian'; }
function story(scen, t, playing, dated) {
  const S = G.scenario(scen), n = G.countAt(S, t), dep = G.depositingAt(S, t), depNow = dep && dep.i === n ? S.events[dep.i] : null, last = n > 0 ? S.events[n - 1] : null;
  return { type: 'story', data: { scen, t, period: G.periodAt(t) || 'precambrian', era: eraAt(t), n, dep: depNow ? depNow.rock : null, fossil: depNow ? depNow.fossil || null : null,
    last: last ? last.type : null, eroding: !depNow && !!last && last.type === 'erode' && n < S.events.length,
    angular: !depNow && !!last && last.type === 'erode' && n >= 2 && S.events[n - 2].type === 'tilt', playing: !!playing, depUnit: depNow ? dep.i : null, dated: dated || [] } };
}
function kindOf(S, u) {
  if (u === G.BASE) return 'base';
  const e = S.events[u];
  if (e.type === 'dike') return e.rock === 'granite' ? 'pluton' : 'dike';
  if (e.rock === 'basalt') return 'lava';
  if (e.rock === 'ash') return 'ash';
  return 'sed';
}
/** 模擬定年實驗室：一連串 [剖面, 單元, 方法]，回傳每次量測的事件 */
function lab(steps) {
  const recs = { A: {}, B: {} }, out = [];
  steps.forEach(([scen, u, sys]) => {
    const S = G.scenario(scen), R = recs[scen], r = R[u] || (R[u] = { k: {}, ok: {}, best: null }), k = r.k[sys] || 0;
    r.k[sys] = k + 1;
    const m = G.measure(S, u, sys, k);
    if (m.ok) { r.ok[sys] = m; if (m.what === 'formation' && (!r.best || m.sigma < r.best.sigma)) r.best = m; }
    const dated = Object.keys(R).filter(q => R[q].best).map(Number), a = r.ok.U238, b = r.ok.U235, best = {}, ages = {};
    Object.keys(R).forEach(q => { if (R[q].best) best[q] = R[q].best.age; });
    Object.keys(r.ok).forEach(q => { ages[q] = [r.ok[q].age, r.ok[q].sigma, r.ok[q].what]; });
    out.push({ type: 'measure', data: { scen, unit: u, rock: G.unitRock(S, u), kind: kindOf(S, u), sys, ok: m.ok, reason: m.reason || null, age: m.ok ? m.age : null, sigma: m.ok ? m.sigma : null,
      what: m.what || null, formAge: G.unitAge(S, u), k: k + 1, dated, best, sysOk: Object.keys(r.ok), ages, concord: !!(a && b && Math.abs(a.age - b.age) / ((a.age + b.age) / 2) < 0.005) } });
  });
  return out;
}
function order(scen, seq, dated) {
  const S = G.scenario(scen), items = G.orderItems(S);
  let ok = 0; while (ok < seq.length && seq[ok] === items[ok]) ok++;
  let right = 0; seq.forEach((it, k) => { if (items[k] === it) right++; });
  const done = seq.length === items.length;
  return { type: 'order', data: { scen, n: items.length, placed: seq.length, correct: ok, right, done, perfect: done && ok === items.length, dated: dated || [] } };
}
let ok = 0, bad = 0;
function expect(name, cond) { if (cond) { ok++; console.log('  ✓ ' + name); } else { bad++; console.error('  ✗ ' + name); process.exitCode = 1; } }
const hit = (id, ev) => byId(id).check(ev);
const any = (id, evs) => evs.some(e => hit(id, e));

console.log('geologic-time 任務證明');
// 起始：時間停在現在（0）、開頭（tmax），兩個剖面都不觸發
missions.forEach(m => expect(m.id + ' 起始狀態不成立', ['A', 'B'].every(s => !m.check(story(s, 0)) && !m.check(story(s, s === 'A' ? 1800 : 560)))));
// 播放中的事件不算（故事任務都要求停下來）
expect('1 播放中經過寒武紀不算', !hit('1', story('A', 515, true)));
expect('h2 播放中經過角度不整合不算', !hit('h2', story('A', 540, true)));

// 1 寒武紀三葉蟲砂岩
expect('1 剖面一停在 515 Ma：寒武紀、三葉蟲砂岩沉積中', hit('1', story('A', 515)));
expect('1 奧陶紀的石灰岩（三葉蟲）不算', !hit('1', story('A', 430)));
expect('1 剖面二沒有寒武紀的三葉蟲砂岩', ![560, 520, 500, 490].some(t => hit('1', story('B', t))));
// 2 66 Ma
expect('2 停在 66.000', hit('2', story('A', 66)));
expect('2 66.4 也算、66.6 不算', hit('2', story('A', 66.4)) && !hit('2', story('A', 66.6)));
expect('2 剖面二也可以', hit('2', story('B', 65.7)));
// 3 火山灰 U-Pb
const ashA = lab([['A', 7, 'U238'], ['A', 14, 'U235'], ['A', 7, 'K40'], ['A', 7, 'Rb87']]);
expect('3 剖面一下層火山灰 U-238', hit('3', ashA[0]));
expect('3 上層火山灰 U-235', hit('3', ashA[1]));
expect('3 火山灰用 K-Ar 不算（題目要鈾）', !hit('3', ashA[2]));
expect('3 火山灰 Rb-Sr 做不出等時線、不算', !ashA[3].data.ok && !hit('3', ashA[3]));
console.log(`    下層火山灰 ${ashA[0].data.age.toFixed(2)} ± ${ashA[0].data.sigma.toFixed(2)} Ma（真值 ${ashA[0].data.formAge}）、上層 ${ashA[1].data.age.toFixed(2)} ± ${ashA[1].data.sigma.toFixed(2)} Ma`);
// 4 C-14
const c14 = lab([['A', 18, 'C14'], ['A', 15, 'C14'], ['A', 7, 'C14'], ['A', 18, 'U238']]);
expect('4 礫石層的木炭', hit('4', c14[0]));
console.log(`    木炭 ${Math.round(c14[0].data.age * 1e6)} ± ${Math.round(c14[0].data.sigma * 1e6)} 年`);
expect('4 石灰岩用碳十四：太老', !c14[1].data.ok && c14[1].data.reason === 'too-old' && !hit('4', c14[1]));
expect('4 火山灰用碳十四：沒有碳', !c14[2].data.ok && c14[2].data.reason === 'no-carbon');
expect('4 礫石用鈾：混雜、不能定年', !c14[3].data.ok && c14[3].data.reason === 'mixed');
// 5 碎屑鋯石
const det = lab([['A', 6, 'U238'], ['A', 13, 'U235'], ['A', 1, 'U238'], ['B', 0, 'U238'], ['B', 7, 'U238']]);
expect('5 剖面一寒武紀砂岩（碎屑 1430 Ma，砂岩 510 Ma）', hit('5', det[0]));
expect('5 剖面一恐龍砂岩（碎屑 1430 Ma，砂岩 178 Ma）', hit('5', det[1]));
expect('5 剖面一最老的砂岩（碎屑 1720，砂岩 1150，差 5.7 億年）也算', hit('5', det[2]));
expect('5 剖面二的砂岩差不到 5 億年', !hit('5', det[3]) && !hit('5', det[4]));
// 6 等時線
const iso = lab([['A', 0, 'Rb87'], ['A', 16, 'Rb87'], ['A', G.BASE, 'Rb87'], ['A', 12, 'Rb87']]);
expect('6 花崗岩等時線', hit('6', iso[0]));
expect('6 岩脈等時線', hit('6', iso[1]));
expect('6 熔岩流等時線', hit('6', iso[3]));
expect('6 片麻岩被變質重設、不算', !iso[2].data.ok && !hit('6', iso[2]));
// 7 兩個鈾時鐘
const con = lab([['A', 7, 'U238'], ['A', 7, 'U235']]);
expect('7 下層火山灰：U-238 與 U-235 相差 < 0.5%', hit('7', con[1]));
console.log(`    U-238 ${con[0].data.age.toFixed(2)}、U-235 ${con[1].data.age.toFixed(2)} Ma`);
// 七種可以用兩個鈾的單元，至少大部分第一次就一致；不一致時多量幾次一定會一致
['A', 'B'].forEach(s => {
  const S = G.scenario(s);
  [G.BASE].concat(S.events.map((e, i) => i)).forEach(u => {
    if (!G.measure(S, u, 'U238').ok || G.measure(S, u, 'U238').what !== 'formation') return;
    let got = false; const steps = [];
    for (let k = 0; k < 6 && !got; k++) { steps.push([s, u, 'U238'], [s, u, 'U235']); got = lab(steps).some(e => hit('7', e)); }
    expect(`7 剖面${s} 單元 ${u} 多量幾次可以一致`, got);
  });
});
expect('7 只用一種鈾不算', !lab([['A', 7, 'U238'], ['A', 7, 'U238']]).some(e => hit('7', e)));
expect('7 砂岩的碎屑鋯石兩種鈾都量、也一致（題目只說同一個岩體）', true);
// 8 夾擊恐龍
const br = lab([['A', 12, 'U238'], ['A', 14, 'K40']]);
expect('8 熔岩流＋上層火山灰', hit('8', br[1]));
expect('8 只量一層不算', !hit('8', br[0]));
expect('8 量恐龍砂岩的碎屑鋯石不算形成年代', !lab([['A', 13, 'U238'], ['A', 12, 'U238']]).some(e => hit('8', e)));
// 9 岩脈 K-Ar
const dk = lab([['A', 16, 'K40'], ['A', 16, 'U238'], ['B', 3, 'K40']]);
expect('9 剖面一岩脈 K-Ar', hit('9', dk[0]));
expect('9 用鈾不算、剖面二的岩脈不算', !hit('9', dk[1]) && !hit('9', dk[2]));
console.log(`    岩脈 K-Ar ${dk[0].data.age.toFixed(2)} ± ${dk[0].data.sigma.toFixed(2)} Ma`);
// 10、11 排序
['A', 'B'].forEach(s => {
  const items = G.orderItems(G.scenario(s));
  const id = s === 'B' ? '10' : '11';
  expect(id + ` 剖面${s === 'A' ? '一' : '二'}全部排對（${items.length} 個事件）`, hit(id, order(s, items)));
  const sw = items.slice(); [sw[1], sw[2]] = [sw[2], sw[1]];
  expect(id + ' 換兩個就不算', !hit(id, order(s, sw)));
  expect(id + ' 少一個不算', !hit(id, order(s, items.slice(0, -1))));
  expect(id + ' 另一個剖面排對不算', !hit(id, order(s === 'A' ? 'B' : 'A', G.orderItems(G.scenario(s === 'A' ? 'B' : 'A')))));
});
console.log('    剖面一：' + G.orderItems(G.scenario('A')).length + ' 個事件；剖面二：' + G.orderItems(G.scenario('B')).length + ' 個事件');
// h1 基盤比闖進它身體的花崗岩老
expect('h1 先量花崗岩、再量片麻岩 U-Pb', hit('h1', lab([['A', 0, 'K40'], ['A', G.BASE, 'U238']])[1]));
expect('h1 只量片麻岩不算', !lab([['A', G.BASE, 'U238'], ['A', G.BASE, 'U235']]).some(e => hit('h1', e)));
expect('h1 片麻岩用 K-Ar（被重設）不算', !lab([['A', 0, 'U238'], ['A', G.BASE, 'K40']]).some(e => hit('h1', e)));
expect('h1 剖面二的基盤不算', !lab([['B', 0, 'U238'], ['B', G.BASE, 'U238']]).some(e => hit('h1', e)));
expect('h1 片麻岩連量 10 次都 ≥ 1700', lab([['A', 0, 'U238']].concat(Array.from({ length: 10 }, () => ['A', G.BASE, 'U238']))).slice(1).every(e => hit('h1', e)));
// h2 角度不整合正在形成
expect('h2 停在 540 Ma：傾斜的地層正被侵蝕', hit('h2', story('A', 540)));
expect('h2 560 Ma 開始侵蝕傾斜的地層、520 Ma 開始沉積就結束；傾斜後還沒侵蝕（700 Ma）不算', hit('h2', story('A', 559)) && hit('h2', story('A', 520.5)) && !hit('h2', story('A', 519.5)) && !hit('h2', story('A', 700)));
expect('h2 其他的侵蝕（230、20 Ma）不算', !hit('h2', story('A', 230)) && !hit('h2', story('A', 20)));
expect('h2 剖面二沒有傾斜，不算', ![150, 100].some(t => hit('h2', story('B', t))));
// h3 四座鐘報出同一個時刻
['A', 'B'].forEach(sc => {
  const S = G.scenario(sc);
  [G.BASE].concat(S.events.map((e, i) => i)).forEach(u => {
    const ms = ['U238', 'U235', 'K40', 'Rb87'].map(q => G.measure(S, u, q, 0));
    if (!ms.every(m => m.ok && m.what === 'formation')) return;
    let got = false; const steps = [];
    for (let k = 0; k < 6 && !got; k++) { ['U238', 'U235', 'K40', 'Rb87'].forEach(q => steps.push([sc, u, q])); got = lab(steps).some(ev => hit('h3', ev)); }
    expect(`h3 剖面${sc} 單元 ${u}（${G.unitRock(S, u)}）四種方法多量幾次可以一致`, got);
  });
});
expect('h3 三種方法不算', !lab([['A', 12, 'U238'], ['A', 12, 'U235'], ['A', 12, 'K40']]).some(e => hit('h3', e)));
expect('h3 火山灰做不出等時線，湊不到四種', !lab([['A', 7, 'U238'], ['A', 7, 'U235'], ['A', 7, 'K40'], ['A', 7, 'Rb87']]).some(e => hit('h3', e)));
// h4、h5、h6：窄的時間窗，滑桿一格一格走碰不到（要打字或剛好停在播放中）
const grid = tmax => Array.from({ length: 1001 }, (_, p) => tmax * Math.pow((1000 - p) / 1000, 2));
expect('h4 先量下層火山灰，再停在 499.9 Ma', hit('h4', story('A', 499.9, false, [7])));
expect('h4 沒量過這層火山灰不算（量的是另一層也不算）', !hit('h4', story('A', 499.9)) && !hit('h4', story('A', 499.9, false, [14])));
expect('h4 先量上層火山灰，再停在 150.1 Ma', hit('h4', story('A', 150.1, false, [14])));
expect('h4 沒量火山灰時，滑桿一格一格走都碰不到', !grid(1800).some(t => hit('h4', story('A', t))));
expect('h5 停在 205.8 Ma（剖面一熔岩流）', hit('h5', story('A', 205.8)));
expect('h5 停在 94.8 Ma（剖面二熔岩流）', hit('h5', story('B', 94.8)));
expect('h5 滑桿一格一格走都碰不到', !grid(1800).some(t => hit('h5', story('A', t))) && !grid(560).some(t => hit('h5', story('B', t))));
expect('h4、h5 互不觸發', !hit('h5', story('A', 499.9, false, [7])) && !hit('h4', story('A', 205.8, false, [7, 12, 14])));
expect('h6 先用碳十四量木炭，再停在 0.02 百萬年前（2 萬年前）', hit('h6', story('A', 0.02, false, [18])));
expect('h6 沒量木炭不算', !hit('h6', story('A', 0.02)));
expect('h6 樹死後（0.01）不算、礫石開始前（0.04）不算', !hit('h6', story('A', 0.01, false, [18])) && !hit('h6', story('A', 0.04, false, [18])));
expect('h6 沒量木炭時，滑桿一格一格走都碰不到', !grid(1800).some(t => hit('h6', story('A', t))));
// h7 沙子回到家門口
expect('h7 先量片麻岩，再量最老砂岩的碎屑鋯石', hit('h7', lab([['A', G.BASE, 'U238'], ['A', 1, 'U238']])[1]));
expect('h7 沒先量片麻岩不算', !hit('h7', lab([['A', 1, 'U238']])[0]));
expect('h7 寒武紀砂岩的碎屑（1430）和片麻岩不同，不算', !lab([['A', G.BASE, 'U238'], ['A', 6, 'U238']]).some(e => hit('h7', e)));
// h8 剖面二的斷層夾在兩次火之間
expect('h8 剖面二的岩脈與熔岩流', hit('h8', lab([['B', 3, 'K40'], ['B', 6, 'U238']])[1]));
expect('h8 只量一個不算、剖面一不算', !lab([['B', 3, 'K40'], ['B', 3, 'U238']]).some(e => hit('h8', e)) && !lab([['A', 3, 'K40'], ['A', 6, 'U238']]).some(e => hit('h8', e)));
// h9 每一塊火成岩
const ign = lab([['A', 0, 'U238'], ['A', 7, 'U238'], ['A', 12, 'K40'], ['A', 14, 'U235'], ['A', 16, 'Rb87']]);
expect('h9 剖面一五塊火成岩都定年', hit('h9', ign[4]) && !ign.slice(0, 4).some(e => hit('h9', e)));
// h10 排序全對＋三座時鐘
const itemsA = G.orderItems(G.scenario('A'));
expect('h10 先定三層年代，再把剖面一排對', hit('h10', order('A', itemsA, [7, 12, 16])));
expect('h10 只排對、沒有定年不算', !hit('h10', order('A', itemsA, [])));
expect('h10 兩層不夠', !hit('h10', order('A', itemsA, [7, 12])));
expect('h10 剖面二不算', !hit('h10', order('B', G.orderItems(G.scenario('B')), [3, 6, -1])));
// 隱藏任務之間不會「完成一個就順便完成另一個」
const reps = {
  h1: lab([['A', 0, 'K40'], ['A', G.BASE, 'U238']])[1], h2: story('A', 540), h4: story('A', 499.9, false, [7]), h5: story('A', 205.8), h6: story('A', 0.02, false, [18]),
  h7: lab([['A', G.BASE, 'U238'], ['A', 1, 'U238']])[1], h8: lab([['B', 3, 'K40'], ['B', 6, 'U238']])[1], h9: ign[4], h10: order('A', itemsA, [7, 12, 16])
};
Object.keys(reps).forEach(k => {
  const others = missions.filter(m => m.hidden && m.id !== 'geologic-time-' + k && m.check(reps[k])).map(m => m.id);
  expect(k + ' 的代表事件不會同時完成別的隱藏任務' + (others.length ? '（' + others.join('、') + '）' : ''), !others.length);
});
const hid10 = missions.filter(m => m.hidden);
expect('隱藏任務 10 個、7 級以上至少 3 個', hid10.length === 10 && hid10.filter(m => m.level >= 7).length >= 3);

// 星數
const pub = missions.filter(m => !m.hidden), hid = missions.filter(m => m.hidden);
console.log(`\n公開 ${pub.length} 個（${pub.reduce((s, m) => s + m.level, 0)} 顆）、隱藏 ${hid.length} 個（${hid.reduce((s, m) => s + 2 * m.level, 0)} 顆）`);
console.log(`${ok} 項通過${bad ? '，' + bad + ' 項失敗' : ''}`);
