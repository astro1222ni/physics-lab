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

// Each action can be reproduced with the controls, including their numerical editors.
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

const transient = { cm: 10, left: 80 };
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
  h1: [rod({ b: 'brass', left: 80, right: 80 }, 2)],
  h2: [strip('brass', 'brass', 30, 1.5, -60)],
  h3: [rod({ mode: 'parallel', b: 'glass' })],
  h4: [rod({ a: 'glass', b: 'copper', share: 20 })],
  h5: [strip('copper', 'brass', 30, 1.5, 55)],
  h6: [rod({ a: 'aluminum', b: 'brass', share: 66.7, cm2: 5 }),
    rod({ a: 'aluminum', b: 'brass', share: 66.7, cm2: 5, left: 20, right: 100 })],
  h7: [rod({ a: 'steel', b: 'glass', left: 0, right: 40 }, 2)],
  h8: [rod(shorter), rod({ mode: 'parallel', ...shorter })],
  h9: [strip('brass', 'steel', 30, 1.25, 50), strip('brass', 'steel', 30, 2.5, 100)],
  h10: [rod({ ...twist, share: 35, left: 29.1, right: 130.3 }),
    rod({ ...twist, share: 60, left: 14.9, right: 99 })]
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
assert.deepEqual(award([rod({}, 0), rod({}, 10)]), [], '預設讀數不應觸發');
assert.deepEqual(award([rod({}, 0), rod({}, 200)], 'automatic'), [], '自動播放不應觸發');
assert.deepEqual(award([rod({}, 0), rod({}, 200), rod(), rod({ mode: 'parallel' }),
  strip('aluminum', 'steel', 30, 1.5, 80)], 'state-changed'), [], '預設參數切換與播放到穩態均不應誤觸');
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
    physics: d.mode === 'bimetal' ? { freeAmm: d.freeA * 1000, freeBmm: d.freeB * 1000, curvature: d.curvature, tipMm: d.tip.y * 1000 }
      : { P: d.flow, rates: d.rates, Tj: d.junction, currentTj: d.currentJunction, currentDiff: d.maxGap, ends: d.endFlows } }));
  console.log(m.id + ' / ' + m.level + ' / ' + JSON.stringify(solution));
}
assert.equal(award(combinedSequence).length, 20);
console.log('✓ 20/20 任務，預設、自動事件與連帶判定檢查通過');
