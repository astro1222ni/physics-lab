'use strict';
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const C = require(path.join(root, 'js/heat-conduction-core.js'));
const slug = 'heat-conduction';
let missions;
new Function('window', readFileSync(path.join(root, 'js/missions/heat-conduction.js'), 'utf8'))({
  LabMission: { register(id, list) { assert.equal(id, slug); missions = list; } }
});

// 每筆設定都必須落在滑桿或數字輸入框可輸入的格點。
const defaults = { mode: 'series', a: 'copper', b: 'steel', cm: 30, cm2: 4, share: 50, left: 100, right: 20 };
function rod(options = {}, time = 'steady') {
  const ui = { ...defaults, ...options };
  const { cm, cm2, share, ...settings } = ui;
  const grid = (x, min, max, decimals) =>
    assert.ok(x >= min && x <= max && Math.abs(x * 10 ** decimals - Math.round(x * 10 ** decimals)) <= 1e-8);
  grid(cm, 10, 60, 1); grid(cm2, 0.5, 20, 2); grid(share, 20, 80, 1);
  grid(ui.left, 0, 150, 1); grid(ui.right, 0, 150, 1);
  const run = C.createRun({ ...settings, length: cm / 100, area: cm2 / 10000, fraction: share / 100 });
  C.advance(run, time === 'steady' ? run.duration : time);
  return { ui: { ...ui, time }, data: C.measureConduction(run) };
}

function strip(a, b, cm, mm, deltaT) {
  assert.ok([a, b].every(key => key !== 'glass' && Object.hasOwn(C.materials, key)));
  assert.ok(cm >= 10 && cm <= 60 && Number(cm.toFixed(1)) === cm);
  assert.ok(mm >= 0.8 && mm <= 4 && Number(mm.toFixed(2)) === mm);
  assert.ok(deltaT >= -100 && deltaT <= 150 && Number(deltaT.toFixed(1)) === deltaT);
  const length = cm / 100;
  const thickness = mm / 1000;
  return { ui: { mode: 'bimetal', a, b, cm, mm, deltaT },
    data: { mode: 'bimetal', a, b, length, thickness, deltaT, ...C.expansion(a, b, length, thickness, deltaT) } };
}

const transient = { cm: 30, left: 80 };
const shorter = { share: 21.5 };
const twist = { a: 'brass', b: 'steel', cm: 40, cm2: 8 };
const cases = {
  1: [rod({ a: 'aluminum', left: 20, right: 70 })],
  2: [rod({ a: 'aluminum', b: 'aluminum', left: 80 })],
  3: [rod({ mode: 'parallel', a: 'steel' })],
  4: [rod(transient, 3), rod(transient)],
  5: [strip('aluminum', 'steel', 30, 1.5, 60), strip('aluminum', 'steel', 30, 1.5, -60)],
  6: [rod({ a: 'steel', cm: 40, cm2: 6, left: 60 })],
  7: [rod({ mode: 'parallel', a: 'brass', cm2: 6, share: 31.2, left: 80 })],
  8: [rod({ mode: 'parallel', a: 'aluminum', cm2: 2.52, share: 40.5, left: 90, right: 10 })],
  9: [rod({ share: 60 }), rod({ a: 'steel', b: 'copper', share: 40 })],
  10: [strip('aluminum', 'steel', 40, 2.19, 100)],
  h1: [rod({ left: 80, right: 80 }, 2), rod({ left: 80, right: 80 })],
  h2: [strip('aluminum', 'aluminum', 30, 1.5, -60), strip('aluminum', 'aluminum', 30, 1.5, 60)],
  h3: [rod({ mode: 'parallel', b: 'glass', share: 30 }), rod({ mode: 'parallel', b: 'glass', share: 70 })],
  h4: [rod({ a: 'glass', b: 'copper', share: 25 }), rod({ a: 'copper', b: 'glass', share: 75 })],
  h5: [strip('copper', 'brass', 30, 1.5, 55), strip('brass', 'copper', 30, 1.5, 55)],
  h6: [rod({ a: 'aluminum', b: 'brass', share: 66.7, cm2: 5 }),
    rod({ a: 'aluminum', b: 'brass', share: 66.7, cm2: 5, left: 20, right: 100 })],
  h7: [rod({ a: 'steel', b: 'glass', left: 0, right: 40 }, 2), rod({ a: 'steel', b: 'glass', left: 0, right: 40 })],
  h8: [rod(shorter), rod({ mode: 'parallel', ...shorter })],
  h9: [strip('brass', 'steel', 30, 1.25, 50), strip('brass', 'steel', 30, 2.5, 100)],
  h10: [rod({ ...twist, share: 35, left: 29.1, right: 130.3 }),
    rod({ ...twist, share: 60, left: 14.9, right: 99 })]
};

const changeMissions = ['h9'];
const ids = missions.map(m => m.id.slice(slug.length + 1));
const hiddenIds = ids.filter(id => id.startsWith('h'));
const negativeCounts = Object.fromEntries(ids.map(id => [id, 0]));
const recorded = action => ({ type: 'recorded', data: action.data });
const changed = action => ({ type: 'state-changed', data: action.data });
const enterMode = action => ({ type: 'state-changed', data: { ...action.data, modeEntry: true } });

// 同一條操作路徑共用任務記憶；不同反例則從空記憶開始。
function verify(name, events, expected, scope = ids) {
  for (const id of scope) {
    const mission = missions[ids.indexOf(id)], memory = {};
    const won = events.some(e => mission.check(e, memory));
    assert.equal(!!won, expected.includes(id), name + '／' + mission.id);
    if (!won) negativeCounts[id]++;
  }
}
function onlyHidden(name, events, expected = []) { verify(name, events, expected, hiddenIds); }

assert.deepEqual(ids, [...Array.from({ length: 10 }, (_, i) => String(i + 1)), ...Array.from({ length: 10 }, (_, i) => 'h' + (i + 1))]);
for (const mission of missions) {
  const id = mission.id.slice(slug.length + 1), path = cases[id];
  assert.doesNotMatch(mission.hidden ? mission.riddle.en : mission.title.en + mission.desc.en, /\p{Script=Han}/u);
  verify('示範解只完成本題', path.map(recorded), [id]);
  if (path.length > 1) verify('需要第二筆觀察', path.slice(0, -1).map(recorded), []);
  verify('自動事件', path.map(a => ({ type: 'automatic', data: a.data })), []);
  verify('單純調參', path.map(changed), changeMissions.includes(id) ? [id] : []);
  if (path.length > 1) verify('清除量測後不能借用舊資料',
    [recorded(path[0]), { type: 'records-cleared', data: {} }, recorded(path.at(-1))], []);
}

const paired = o => [changed(o), recorded(o)];
verify('預設與自然播放', [rod({}, 0), rod({}, 10), rod(), rod({ mode: 'parallel' }),
  strip('aluminum', 'steel', 30, 1.5, 80)].flatMap(paired), []);
for (const share of [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80]) {
  onlyHidden('預設材料與 5 的倍數占比 ' + share, [rod({ share }), rod({ mode: 'parallel', share })].flatMap(paired));
  onlyHidden('舊 h3/h4 的快轉與占比 ' + share, [rod({ mode: 'parallel' }, 0),
    rod({ mode: 'parallel', b: 'glass' }, 0), rod({ mode: 'parallel', b: 'glass', share }),
    rod({ a: 'glass', b: 'copper', share })].flatMap(paired));
}
for (const t of [-100, -60, -40, 0, 50, 55, 60, 80, 100, 150]) {
  onlyHidden('只拖一次溫差 ' + t, [strip('copper', 'brass', 30, 1.5, t), strip('brass', 'brass', 30, 1.5, t)].flatMap(paired));
}
const variants = { 1: [rod({ a: 'steel', b: 'aluminum', left: 20, right: 50 })],
  2: [rod({ a: 'aluminum', b: 'aluminum', left: 20, right: 80 })],
  3: [rod({ mode: 'parallel', a: 'steel', left: 60 })], 4: [rod(transient, 5), rod(transient, 15), rod(transient)],
  5: [...cases[5]].reverse(), 7: [rod({ mode: 'parallel', a: 'brass', cm2: 6, share: 31, left: 80 })],
  10: [strip('aluminum', 'steel', 40, 2.2, 100)] };
for (const [id, path] of Object.entries(variants)) verify('合理近似、對調或任務下限 ' + id, path.map(recorded), [id]);
verify('公開第十題的薄側容差', [recorded(strip('aluminum', 'steel', 40, 2.18, 100))], ['10']);

// 還原頁面行為：換模式、材質、數字會重設時間，暫停或快轉後才記錄。
function publicRoute(order, examples, reverseFields) {
  const ui = { ...defaults, mm: 1.5, deltaT: 80 };
  const selections = { rod: ['copper', 'steel'], strip: ['aluminum', 'steel'] };
  const events = [];
  function sample(time = 0) {
    const [a, b] = selections[ui.mode === 'bimetal' ? 'strip' : 'rod'];
    const { mm, deltaT, ...dims } = ui;
    return ui.mode === 'bimetal' ? strip(a, b, ui.cm, mm, deltaT) : rod({ ...dims, a, b }, time);
  }
  for (const id of order) for (const action of examples[id]) {
    const target = action.ui;
    if (ui.mode !== target.mode) { ui.mode = target.mode; events.push(enterMode(sample())); }
    const slots = selections[ui.mode === 'bimetal' ? 'strip' : 'rod'];
    const keys = Object.keys(target).filter(k => k !== 'mode' && k !== 'time');
    for (const key of reverseFields ? keys.reverse() : keys) {
      if (key === 'a' || key === 'b') {
        const i = key === 'a' ? 0 : 1;
        if (slots[i] === target[key]) continue;
        slots[i] = target[key];
      } else {
        if (ui[key] === target[key]) continue;
        ui[key] = target[key];
      }
      events.push(changed(sample()));
    }
    const result = sample(target.time);
    events.push(changed(result), recorded(result));
  }
  return events;
}
const publicIds = ids.filter(id => !id.startsWith('h'));
for (const order of [publicIds, [...publicIds].reverse(), ['6','7','8','1','2','3','4','9','10','5']]) {
  for (const alt of [false, true]) {
    const evs = publicRoute(order, alt ? { ...cases, ...variants } : cases, alt);
    verify('公開十題連做，含每個中繼態 ' + order.join('/'), evs, publicIds);
  }
}
for (const reverse of [false, true]) for (const tempFirst of [false, true]) {
  const [first, last] = reverse ? [...cases.h9].reverse() : cases.h9;
  const a = first.ui, b = last.ui;
  const mid = strip(a.a, a.b, a.cm, tempFirst ? a.mm : b.mm, tempFirst ? b.deltaT : a.deltaT);
  verify('h9 中繼態不能提早得星', [changed(first), changed(mid), recorded(mid)], []);
  verify('h9 含中繼態的逐步操作 ' + [reverse, tempFirst], [changed(first), changed(mid), recorded(mid), changed(last)], ['h9']);
}
verify('負溫差與另一組材料也能等曲率', [strip('aluminum','copper',35,1,-40), strip('aluminum','copper',35,2,-80)].map(changed), ['h9']);
verify('兩個串並聯對稱根都成立', [rod({ share: 78.5 }), rod({ mode: 'parallel', share: 78.5 })].map(recorded), ['h8']);
onlyHidden('進入預設雙層、把厚度與溫度拖到自然格點，不把進入模式當作量測', [
  enterMode(strip('aluminum','steel',30,1.5,80)), changed(strip('aluminum','steel',30,2.8,80)),
  changed(strip('aluminum','steel',30,2.8,150))]);
verify('窄支路在 B 也能實驗分流', [rod({mode:'parallel', a:'glass', b:'copper', share:30}),
  rod({mode:'parallel', a:'glass', b:'copper', share:70})].map(recorded), ['h3']);
const misses = {
  h1: [cases.h1[0], rod({ left: 85, right: 85 })],
  h2: [cases.h2[0], strip('aluminum','aluminum',30,1.5,55)],
  h3: [cases.h3[0], rod({ mode: 'parallel', b: 'glass', share: 65 })],
  h4: [cases.h4[0], rod({ a: 'copper', b: 'glass', share: 70 })],
  h5: [cases.h5[0], strip('brass','copper',30,1.5,60)],
  h6: [cases.h6[0], rod({ a: 'aluminum', b: 'brass', share: 66.7, cm2: 5, left: 20, right: 90 })],
  h7: [cases.h7[0], rod({ a: 'steel', b: 'glass', left: 0, right: 45 })],
  h8: [rod({ share: 20 }), rod({ mode: 'parallel', share: 20 })],
  h9: [cases.h9[0], strip('brass','steel',30,2.5,95)],
  h10: [cases.h10[0], rod({ ...twist, share: 60, left: 15, right: 110 })]
};
for (const [id, path] of Object.entries(misses)) onlyHidden(id + ' 相近但物理條件不成立', path.flatMap(paired));
for (const id of ids) {
  const m = missions[ids.indexOf(id)];
  console.log(m.id + '／等級 ' + m.level + '／星數 ' + (m.hidden ? 2 : 1) * m.level +
    '／通過反例 ' + negativeCounts[id] + '／正解 ' + JSON.stringify(cases[id].map(a => a.ui)));
}
console.log('通過 20/20 題，含隱藏互斥、公開連做、日常操作與 h9 四種逐步操作順序。');
