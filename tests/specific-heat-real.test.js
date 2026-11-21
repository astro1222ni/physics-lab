'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const HC = require('../js/specific-heat-core.js');
const root = path.resolve(__dirname, '..');
const p = { sub: 'al', m1: 0.2, T1: 100, m2: 0.25, T2: 20, Ccup: 0, stir: true, loss: false };

// 重播實際頁面按鈕和物理時鐘；只替換畫布、音效與後端。
function replay(script, html) {
  const events = [], nodes = new Map();
  let time = 0, frames = [];
  function element(id) {
    if (!nodes.has(id)) {
      const handlers = {};
      nodes.set(id, { id, value: '', dataset: {}, style: {}, checked: false, textContent: '',
        getContext() { return {}; }, getAttribute() {}, setAttribute() {},
        addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
        fire(type) { for (const fn of handlers[type] || []) fn.call(this, { target: this }); },
        querySelector() { return element('tbody'); }
      });
    }
    return nodes.get(id);
  }
  for (const [tag, id] of html.matchAll(/<input id="([^"]+)"[^>]*>/g)) {
    const e = element(id);
    e.value = tag.match(/ value="([^"]+)"/)?.[1] || '';
    e.step = tag.match(/ step="([^"]+)"/)?.[1] || '';
    e.checked = / checked/.test(tag);
  }
  const mission = { emit(type, data) { events.push(JSON.parse(JSON.stringify({ type, data }))); } };
  const window = { HeatCore: HC, LabMission: mission, matchMedia: () => ({ matches: true, addEventListener() {} }), addEventListener() {} };
  const document = { getElementById: element, createElement: element, querySelectorAll: () => [] };
  const math = Object.create(Math);
  math.random = () => 0;
  vm.runInNewContext(script, { window, document, LabMission: mission, Math: math,
    getComputedStyle: () => ({ getPropertyValue: () => '#eeeeee' }),
    performance: { now: () => time }, requestAnimationFrame: fn => frames.push(fn) });
  function tick(n) {
    for (let i = 0; i < n; i++) {
      time += 20;
      const queued = frames;
      frames = [];
      for (const fn of queued) fn(time);
    }
  }
  function click(id) { element(id).fire('click'); }
  click('play'); tick(4000);
  click('modeHeat'); click('play'); tick(5); click('rec'); tick(10); click('rec'); tick(3000);
  click('modeCmp'); click('play'); tick(75); click('play');
  // 補驗舊的穩態與神秘金屬判定事件，新效應維持預設。
  click('modeHeat');
  element('lossH').checked = true; element('hP').value = '150'; element('hT').value = '20';
  element('lossH').fire('change'); click('play'); tick(9000);
  click('modeCal');
  const button = { dataset: { key: 'mys' } };
  element('calMats').closest = () => button;
  click('calMats'); click('play'); tick(3000);
  element('guessC').value = '523'; click('guessBtn');
  return events;
}
const script = fs.readFileSync(path.join(root, 'js/specific-heat.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'specific-heat.html'), 'utf8');
// f3085968 的原版頁面以相同操作、相同 20 ms 時鐘輸出的完整事件序列。
const expected = [
  { type: 'mix', data: {
    mat: "al", sub: "al", mys: false, m1: 0.2, T1: 100, m2: 0.25, T2: 20, Ccup: 0, stir: true,
    loss: false, Tf: 31.740725642070934, TA: 31.783011148364317, TB: 31.733452454175442,
    t: 107.20000000000098, c1: 900, ice0: 0, ice: 0, steam: 0, iceA: 0
  } },
  { type: 'record', data: {
    mat: "h2o", sub: "h2o", mys: false, m: 0.5, P: 1000, T0: -20, loss: false, n: 2,
    p1: {"t":5,"T":-15.238095238095237,"kind":"sens","p":0,"x":0,"n":1},
    p2: {"t":15,"T":-5.714285714285714,"kind":"sens","p":0,"x":0,"n":2}, dt: 10, dT: 9.523809523809522,
    c: 2100.0000000000005, L: 20000
  } },
  { type: 'phase', data: {
    kind: "boil-start", t: 397.3, mat: "h2o", sub: "h2o", mys: false, m: 0.5, P: 1000, T0: -20,
    loss: false
  } },
  { type: 'heated', data: {
    mat: "h2o", sub: "h2o", mys: false, m: 0.5, P: 1000, T0: -20, loss: false, t: 1527.2999999999988,
    reason: "stop"
  } },
  { type: 'pause', data: {
    mode: "cmp", t: 14.999999999999979, Q: 7499.999999999989, n: 6, m: 1, P: 500, T0: 20,
    keys: ["h2o","al","glass","fe","cu","pb"]
  } },
  { type: 'steady', data: {
    mat: "h2o", sub: "h2o", mys: false, m: 0.5, P: 150, T0: 20, loss: true, T: 74.95000000000024,
    Tss: 75, t: 4885.805335079656
  } },
  { type: 'heated', data: {
    mat: "h2o", sub: "h2o", mys: false, m: 0.5, P: 150, T0: 20, loss: true, t: 4885.805335079656,
    reason: "steady"
  } },
  { type: 'mix', data: {
    mat: "mys", sub: "ti", mys: true, m1: 0.2, T1: 100, m2: 0.25, T2: 20, Ccup: 0, stir: true,
    loss: false, Tf: 27.269568239075667, TA: 27.314779686286563, TB: 27.265049254480928,
    t: 93.40000000000079, c1: 523, ice0: 0, ice: 0, steam: 0, iceA: 0
  } },
  { type: 'guess', data: {
    c: 523, cTrue: 523, err: 0, measured: true, id: "ti"
  } }
];
assert.deepEqual(replay(script, html), expected);

function close(actual, expected, tolerance) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
}

// 舊觀察窗 120 秒後仍有顯著熱流；熱源與冷源兩方向都要真的達到室溫。
for (const start of [80, 10, 25]) {
  const sim = HC.calorimeter({ ...p, T1: start, T2: start, Ccup: 100, loss: true });
  HC.mixStep(sim, 120);
  assert.equal(HC.roomEquilibrium(sim), start === 25);
  while (!HC.roomEquilibrium(sim) && sim.t < 30000) HC.mixStep(sim, 10);
  assert.ok(HC.roomEquilibrium(sim));
  const st = HC.mixState(sim);
  assert.ok(Math.abs(st.TA - 25) < 0.05 && Math.abs(st.TB - 25) < 0.05 && Math.abs(st.P) < 0.1);
  close(sim.HA + sim.HB + sim.Qloss, sim.HA0 + sim.HB0, 1e-5);
}
const insulated = HC.calorimeter(p);
assert.equal(HC.roomEquilibrium(insulated), false);
const ideal = HC.inferHeat(p, insulated.eq.T, 0);
assert.equal(ideal.textbook, ideal.corrected);
assert.equal(ideal.difference, 0);
close(ideal.corrected, 900, 1e-10);
for (const [hot, cold] of [[100, 20], [5, 18]]) {
  const setup = { ...p, T1: hot, T2: cold, Ccup: 100, loss: true };
  const sim = HC.calorimeter(setup);
  while (Math.abs(HC.mixState(sim).dT) > 0.05 && sim.t < 30000) HC.mixStep(sim, 0.5);
  const result = HC.mixEstimate(sim, setup, HC.mixState(sim).TB);
  close(result.corrected, 900, 4);
  assert.ok(result.difference > 1);
}
assert.equal(HC.inferHeat(p, p.T1, 0), null);
assert.equal(HC.inferHeat({ ...p, sub: 'h2o' }, 0, 0), null);

// 鉛在 58.88 秒停機，水繼續升溫並汽化；停機後保持最後的焓。
for (const key of ['pb', 'h2o']) {
  const b = HC.makeBody(key, 1), H0 = HC.enthalpyAt(b, 20, 1);
  const Hstop = key === 'pb' ? HC.enthalpyAt(b, 250) : HC.enthalpyAt(b, 100, 2);
  const item = { H0, Hstop, tStop: (Hstop - H0) / 500 };
  close(HC.temperature(b, HC.comparisonHeat(item, 500, 58.88)), key === 'pb' ? 250 : 27.033, 0.01);
  assert.equal(HC.comparisonHeat(item, 500, item.tStop + 100), Hstop);
  if (key === 'h2o') assert.ok(HC.comparisonHeat(item, 500, 100) > HC.comparisonHeat(item, 500, 58.88));
}
for (const tau of [1, 4.3, 10]) {
  let reading = 0;
  for (let i = 1; i <= 100; i++) {
    reading = HC.lagStep(reading, 1, tau / 20, tau);
    close(reading, 1 - Math.exp(-i / 20), 1e-12);
  }
}
assert.equal(HC.lagStep(18, 33, 0.1, 0), 33);
const batch = HC.repeatedMix(p, 5, 42, 0);
assert.deepEqual(batch, HC.repeatedMix(p, 5, 42, 0));
assert.notDeepEqual(batch, HC.repeatedMix(p, 5, 43, 0));
assert.ok(batch.sd > 0);
close(batch.mean, 900, 20);
for (const row of batch.rows) {
  close(row.actual.m1, p.m1, 0.0001); close(row.actual.m2, p.m2, 0.0001);
  close(row.actual.T1, p.T1, 0.2); close(row.actual.T2, p.T2, 0.2);
  assert.equal(row.reading, HC.calorimeter(row.actual).eq.T);
}
const sd = Math.sqrt(batch.rows.reduce((sum, row) => sum + (row.c - batch.mean) ** 2, 0) / 4);
assert.equal(batch.sd, sd);
assert.deepEqual(HC.repeatedMix(p, 1, 1, 0), HC.repeatedMix(p, 1, 876, 0));
console.log('舊版 7 類事件逐欄相同；室溫平衡、各自停機、杯與散熱校正、探針及重複量測全部通過。');
