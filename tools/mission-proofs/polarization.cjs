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

function reflect(n1, n2, inc, analyzer = 0) {
  onGrid(n1, 1, 2.5, 3); onGrid(n2, 1, 2.5, 3);
  onGrid(inc, 0, 89.9, 2); onGrid(analyzer, 0, 180, 2);
  const ui = { mode: 'reflection', n1, n2, inc, analyzer };
  const r = C.fresnel(n1, n2, inc);
  return { ui, data: { ...ui, r, brewster: C.brewsterAngle(n1, n2),
    analyzed: C.reflectedThroughAnalyzer(r, analyzer) } };
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
  h1: [filters([25, 25], 25)],
  h2: [reflect(1.4, 2.2, 0, 20)],
  h3: [reflect(1.25, 1.25, 35)],
  h4: [filters([100, 55, 10], 10)],
  h5: [filters([30, 50, 70], 10)],
  h6: [filters([40, 70], 10), filters([80, 110], 50)],
  h7: [reflect(1.4, 2.2, 37, 45)],
  h8: [reflect(1.125, 1.8, 57.99), reflect(1.375, 2.2, 57.99)],
  h9: [reflect(1.3, 1.8, 58), reflect(1.8, 1.3, 37.77)],
  h10: [filters([0, 1.01, 46]), filters([0, 25.67, 64])]
};

function award(sequence, type = 'recorded') {
  return missions.filter(m => {
    const mem = {};
    return sequence.some(action => m.check({ type, data: action.data }, mem));
  }).map(m => m.id);
}

assert.equal(missions.length, 20);
assert.equal(missions.filter(m => m.hidden).length, 10);
assert.ok(missions.filter(m => m.hidden && m.level >= 7).length >= 3);
assert.deepEqual(award([filters([0, 30]), filters([0, 45, 30]), reflect(1, 1.5, 42)]), [], '預設讀數不應觸發');
assert.deepEqual(award([filters([0, 30]), filters([0, 45, 30]), reflect(1, 1.5, 42)], 'state-changed'), [],
  '依序切換預設模式不應誤觸');
const combinedSequence = [];
for (const m of missions) {
  assert.doesNotMatch((m.hidden ? m.riddle.en : m.title.en + m.desc.en), /\p{Script=Han}/u);
  const sequence = cases[m.id.slice(slug.length + 1)];
  if (sequence.length > 1) assert.deepEqual(award(sequence.slice(0, 1)), [], '比較題需要第二次量測');
  assert.deepEqual(award(sequence), [m.id], '只完成目標任務 ' + m.id);
  assert.deepEqual(award(sequence, 'state-changed'), m.hidden ? [m.id] : [],
    '狀態事件只判定目標隱藏任務 ' + m.id);
  assert.deepEqual(award(sequence, 'automatic'), []);
  assert.deepEqual(award([...combinedSequence, ...sequence.slice(0, -1)]), award(combinedSequence),
    '先前任務的讀數不可替代 ' + m.id + ' 的最後一次量測');
  combinedSequence.push(...sequence);
  const solution = sequence.map(({ ui, data: d }) => ({ ...ui,
    physics: d.mode === 'reflection'
      ? { angleT: d.r.angleT, rs: d.r.rs, rp: d.r.rp, reflected: d.r.reflected, polarization: d.r.polarization, analyzed: d.analyzed }
      : { I: d.intensity, withoutB: d.noMiddle } }));
  console.log(m.id + ' / ' + m.level + ' / ' + JSON.stringify(solution));
}
assert.equal(award(combinedSequence).length, 20);
console.log('✓ 20/20 任務，預設、自動事件與連帶判定檢查通過');
