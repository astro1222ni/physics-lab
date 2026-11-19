'use strict';
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const C = require(path.join(root, 'js/polarization-core.js'));
const slug = 'polarization';
let missions;
new Function('window', readFileSync(path.join(root, 'js/missions/polarization.js'), 'utf8'))({
  LabMission: { register(id, list) { assert.equal(id, slug); missions = list; } }
});

const onGrid = (x, min, max, decimals) =>
  assert.ok(x >= min && x <= max && Number(x.toFixed(decimals)) === x);

function filters(angles, sourceAngle = null) {
  assert.ok(angles.length === 2 || angles.length === 3);
  angles.forEach(a => onGrid(a, 0, 180, 2));
  if (sourceAngle !== null) onGrid(sourceAngle, 0, 180, 2);
  const mode = angles.length === 2 ? 'two' : 'three';
  return { ui: { mode, angles, sourceAngle },
    data: { mode, angles, sourceAngle, ...C.transmit(angles, sourceAngle),
      noMiddle: C.transmit([angles[0], angles.at(-1)], sourceAngle).intensity } };
}

function reflect(n1, n2, inc, analyzer = 0, incidentPol = 'unpolarized') {
  onGrid(n1, 1, 2.5, 3); onGrid(n2, 1, 2.5, 3);
  onGrid(inc, 0, 89.9, 2); onGrid(analyzer, 0, 180, 2);
  const ui = { mode: 'reflection', n1, n2, inc, analyzer, incidentPol };
  const r = C.fresnel(n1, n2, inc);
  return { ui, data: { ...ui, r, powers: C.beamPowers(r, incidentPol), brewster: C.brewsterAngle(n1, n2),
    analyzed: C.reflectedThroughAnalyzer(r, analyzer, incidentPol) } };
}

const cases = {
  1: [filters([0, 90])],
  2: [filters([0, 45])],
  3: [filters([0, 30, 90])],
  4: [filters([60, 60], 30)],
  5: [filters([0, 54.33])],
  6: [reflect(1, 1.5, 56.31)],
  7: [reflect(1.5, 1, 41.80), reflect(1.5, 1, 41.85)],
  8: [filters([0, 10, 60]), filters([0, 50, 60])],
  9: [reflect(1.2, 1.8, 56.31), reflect(1.2, 1.8, 56.31, 90)],
  10: [reflect(1.3, 2, 37.63), reflect(1.3, 2, 37.63, 73.22)],
  h1: [filters([25, 25], 25), filters([65, 65], 65)],
  h2: [reflect(1, 1.5, 0, 0, 's'), reflect(1, 1.5, 0, 0, 'p')],
  h3: [reflect(1.25, 1.25, 35), reflect(1.25, 1.25, 70)],
  h4: [filters([90, 45, 0], 0), filters([90, 70, 0], 0)],
  h5: [filters([30, 70], 10), filters([30, 50, 70], 10)],
  h6: [filters([40, 70], 10), filters([80, 110], 50)],
  h7: [reflect(1, 1.5, 37, 135), reflect(1, 1.5, 37, 45)],
  h8: [reflect(1, 1.5, 56.31, 0, 's'), reflect(1.2, 1.8, 56.31, 0, 's')],
  h9: [reflect(1.3, 1.8, 58), reflect(1.8, 1.3, 37.77)],
  h10: [filters([0, 1.01, 46]), filters([0, 25.67, 64])]
};

const changeMissions = ['h6', 'h9'];
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
verify('預設模式', [filters([0, 30]), filters([0, 45, 30]), reflect(1, 1.5, 42)].flatMap(paired), []);
const presets = [[1, 1.5], [1.5, 1], [1, 1.333], [1.333, 1], [1, 2.417]];
for (const angle of [0, 5, 20, 30, 35, 40, 41.8, 42, 45, 50, 55, 56.3, 60, 65, 75, 85, 89.9]) {
  onlyHidden('生活介質預設依序切換 ' + angle, presets.flatMap(([a, b]) => paired(reflect(a, b, angle))));
  onlyHidden('同介質的一次滑桿 ' + angle, [reflect(1, 1.5, 42), reflect(1.5, 1.5, angle)].flatMap(paired));
}
for (const angle of [0, 5, 15, 25, 30, 45, 55, 60, 75, 90, 135, 150, 175, 180]) {
  onlyHidden('換成線偏振／只拖一片 ' + angle, [filters([0, 30]), filters([0, 30], 0), filters([0, angle], 0)].flatMap(paired));
  onlyHidden('只改光源的等價軸 ' + angle, [filters([30, 60], angle), filters([30, 60], 180 - angle)].flatMap(paired));
}
onlyHidden('h6 舊漏洞，光源 0°→180°、兩片完全不動', [filters([30,60],0), filters([30,60],180)].flatMap(paired));
verify('h6 異角組合跨越零度仍為剛體旋轉', [filters([30, 60],165),filters([75,105],30)].map(changed), ['h6']);
const variants = {
  1: [filters([45, 135])], 2: [filters([0, 135])], 4: [filters([0, 180], 30)],
  6: [reflect(1, 1.5, 56.3, 180)], 7: [reflect(1.5, 1, 41.9, 180), reflect(1.5, 1, 41.7, 180)],
  8: [...cases[8]].reverse(), 9: [reflect(1.2, 1.8, 56.31, 180), reflect(1.2, 1.8, 56.31, 90)],
  10: [reflect(1.3, 2, 37.6, 180), reflect(1.3, 2, 37.6, 73.3)]
};
for (const [id, path] of Object.entries(variants)) verify('等價軸、滑桿格點或反序 ' + id, path.map(recorded), [id]);

// 沿用上一題的控制值；切源、切模式、逐一調數字均各送一次狀態事件。
function publicRoute(order, examples, reverseFields) {
  const ui = { mode: 'two', source: false, sourceAngle: 0, A: 0, B: 45, C: 30,
    n1: 1, n2: 1.5, inc: 42, analyzer: 0, incidentPol: 'unpolarized' };
  const events = [];
  const current = () => ui.mode === 'reflection' ? reflect(ui.n1, ui.n2, ui.inc, ui.analyzer, ui.incidentPol) :
    filters(ui.mode === 'two' ? [ui.A, ui.C] : [ui.A,ui.B,ui.C], ui.source ? ui.sourceAngle : null);
  for (const id of order) for (const action of examples[id]) {
    const goal = action.ui;
    if (ui.mode !== goal.mode) { ui.mode = goal.mode; events.push(enterMode(current())); }
    const fields = ui.mode === 'reflection' ? { n1: goal.n1, n2: goal.n2, inc: goal.inc, analyzer: goal.analyzer, incidentPol: goal.incidentPol } :
      { source: goal.sourceAngle !== null, ...(goal.sourceAngle !== null ? { sourceAngle: goal.sourceAngle } : {}),
        A: goal.angles[0], ...(ui.mode === 'three' ? { B: goal.angles[1] } : {}), C: goal.angles.at(-1) };
    const keys = Object.keys(fields);
    for (const key of reverseFields ? keys.reverse() : keys) {
      if (ui[key] === fields[key]) continue;
      ui[key] = fields[key]; events.push(changed(current()));
    }
    events.push(recorded(current()));
  }
  return events;
}
const publicIds = ids.filter(id => !id.startsWith('h'));
for (const order of [publicIds, [...publicIds].reverse(), ['6','9','7','10','1','4','2','3','8','5']]) {
  for (const alt of [false, true]) verify('公開十題連做，含每個中繼態 ' + order.join('/'),
    publicRoute(order, alt ? { ...cases, ...variants } : cases, alt), publicIds);
}
// 正反向起步 × 先改角度或先換介質；兩個折射率分別手調或用一鍵對調。
for (const reverse of [false, true]) for (const angleFirst of [false, true]) {
  const [first, last] = reverse ? [...cases.h9].reverse() : cases.h9;
  const a = first.ui, b = last.ui, angle = angleFirst ? b.inc : a.inc;
  const mid = reflect(b.n1, a.n2, angle);
  const wait = angleFirst ? reflect(a.n1, a.n2, b.inc) : reflect(b.n1, b.n2, a.inc);
  const events = angleFirst ? [changed(first), changed(wait), changed(mid)] : [changed(first), changed(mid), changed(wait)];
  onlyHidden('h9 中繼不得提早完成', events);
  verify('h9 四種逐步調參 ' + [reverse, angleFirst], [...events, changed(last)], ['h9']);
  verify('h9 四種介質成組切換 ' + [reverse, angleFirst], [changed(first), changed(wait), changed(last)], ['h9']);
}
verify('空氣玻璃光路也可逆', [reflect(1,1.5,45), reflect(1.5,1,28.13)].map(changed), ['h9']);
onlyHidden('幾乎匹配的介質互換但角度未動', [reflect(1.499,1.5,30),reflect(1.5,1.499,30)].flatMap(paired));
onlyHidden('只進入反射、切介質與角度，沒有第一筆斜射觀察', [
  enterMode(reflect(1,1.5,42)), changed(reflect(1.5,1,42)), changed(reflect(1.5,1,26.49))]);
const misses = {
  h1: [cases.h1[0], filters([45,45],45)],
  h2: [cases.h2[0], reflect(1,1.5,5,0,'p')],
  h3: [cases.h3[0], reflect(1.25,1.25,60)],
  h4: [cases.h4[0], filters([90,55,0],0)],
  h5: [cases.h5[0], filters([30,68,70],10)],
  h6: [cases.h6[0], filters([80,110],49)],
  h7: [cases.h7[0], reflect(1,1.5,42,45)],
  h8: [cases.h8[0], reflect(1.2,1.81,56.31,0,'s')],
  h9: [cases.h9[0], reflect(1.8,1.3,38)],
  h10: [cases.h10[0], filters([0,25,64])]
};
for (const [id, path] of Object.entries(misses)) onlyHidden(id + ' 相近但物理條件不成立', path.flatMap(paired));
for (const id of ids) {
  const m = missions[ids.indexOf(id)];
  console.log(m.id + '／等級 ' + m.level + '／星數 ' + (m.hidden ? 2 : 1) * m.level +
    '／通過反例 ' + negativeCounts[id] + '／正解 ' + JSON.stringify(cases[id].map(a => a.ui)));
}
console.log('通過 20/20 題，含隱藏互斥、公開連做、日常操作與 h9 四種逐步操作順序。');
