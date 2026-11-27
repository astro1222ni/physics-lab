/* 以頁面的輸入單位重建量熱、加熱和相變；每例重播全部相關事件並檢查隱藏任務集合。 */
'use strict';
const assert = require('node:assert/strict');
const HC = require('../../js/specific-heat-core.js');
let missions;
global.window = global;
global.LabMission = { register: (_, list) => { missions = list; } };
require('../../js/missions/specific-heat.js');

function mixing(settings) {
  const d = { mat: 'al', m1: 0.2, T1: 100, m2: 0.25, T2: 20, Ccup: 0, stir: true, loss: false, ...settings };
  d.sub = d.mat === 'ice' ? 'h2o' : d.mat === 'mys' ? HC.MYSTERY_IDS[0] : d.mat;
  d.c1 = HC.SUBSTANCES[d.sub].phases[0].c;
  const sim = HC.calorimeter(d), eq = sim.eq;
  const [pa, pb] = [sim.A, sim.B].map((b, i) => HC.phaseMasses(b, eq.H[i]));
  const tContact = HC.timeToEquilibrium(sim.A, sim.B, sim.HA, sim.HB, sim.k, 0.05);
  HC.mixStep(sim, Math.ceil(tContact * 5) / 5); const actual = HC.mixState(sim);
  return { type: 'mix', data: { ...d, t: sim.t, Tf: eq.T, TA: actual.TA, TB: actual.TB, ice0: d.mat === 'ice' ? d.m1 : 0,
    ice: (d.sub === 'h2o' ? pa[0] : 0) + pb[0], steam: (d.sub === 'h2o' ? pa[2] : 0) + pb[2] } };
}
function waterRun(m, T0, P, loss = false) {
  const b = HC.makeBody('h2o', m), H0 = HC.enthalpyAt(b, T0, T0 <= 0 ? 0 : 1);
  const ke = loss ? HC.KE_BEAKER : 0, Hstop = HC.enthalpyAt(b, 100, 2);
  const settings = { mat: 'h2o', sub: 'h2o', m, T0, P, loss };
  const end = HC.heaterEnd(b, H0, P, ke, HC.T_ENV, Hstop, 0.05, 2e5);
  const point = t => {
    assert.ok(t > 0 && t <= end.t);
    const s = HC.stateOf(b, HC.heatStep(b, H0, P, ke, HC.T_ENV, t).H);
    return { t, T: s.T, kind: s.seg.kind, p: s.seg.p, i: s.seg.i, x: s.x };
  };
  return {
    record(t1, t2) {
      const p1 = point(t1), p2 = point(t2), dt = t2 - t1, dT = p2.T - p1.T;
      return { type: 'record', data: { ...settings, p1, p2, dt, dT, c: dT ? P * dt / (m * dT) : null,
        L: P * dt / m } };
    },
    boiling() {
      const schedule = HC.heatingSchedule(b, H0, P, Hstop);
      const start = schedule.segs.find(s => s.kind === 'lat' && s.i === 1);
      return { type: 'phase', data: { ...settings, kind: 'boil-start', t: start.t0 } };
    },
    steady() {
      assert.equal(end.reason, 'steady');
      return { type: 'steady', data: { ...settings, T: HC.temperature(b, end.H) } };
    }
  };
}
function check(id, events, miss = false) {
  const achieved = missions.filter(m => {
    const mem = {}; return events.some(ev => m.check(ev, mem));
  }).map(m => m.id);
  const target = 'specific-heat-' + id;
  if (!miss) assert.ok(achieved.includes(target), target + ' 未達成');
  const added = k => /-h(?:[4-9]|10)$/.test(k);
  const screened = achieved.filter(k => added(target) ? /-h\d+$/.test(k) : added(k));
  assert.deepEqual(screened, added(target) && !miss ? [target] : []);
  console.log(target, miss ? '近失' : '通過', JSON.stringify(events.map(ev => ev.data)));
}

// 預設未操作沒有 mix；加測用預設參數放入樣品的完整事件。
check(1, [mixing({})]);
check(1, [mixing({ T1: 60 })]);
check(2, [mixing({ T1: 20 })]);
const keys = ['al', 'cu', 'fe'], absorbed = keys.map(key => {
  const body = HC.makeBody(key, 1), H0 = HC.enthalpyAt(body, 20), Hstop = HC.enthalpyAt(body, 250);
  return HC.comparisonHeat({ H0, Hstop, tStop: (Hstop - H0) / 500 }, 500, 40) - H0;
});
assert.ok(absorbed.every(Q => Q === absorbed[0]));
check(3, [{ type: 'pause', data: { mode: 'cmp', n: keys.length, Q: absorbed[0], t: 40, keys } }]);
check(4, [mixing({ mat: 'fe', m1: 0.5, m2: 0.1, T1: 77.21 })]);
check(5, [waterRun(0.5, 20, 1000).record(5, 25)]);
const mystery = mixing({ mat: 'mys' });
const guess = HC.inferHeat(mystery.data, mystery.data.Tf, 0).corrected;
check(6, [mystery, { type: 'guess', data: { measured: true, err: (Math.round(guess) - mystery.data.c1) / mystery.data.c1 } }]);
check(7, [mixing({ mat: 'ice', m1: 0.1, m2: 0.1, T1: 0, T2: 79.8 })]);
check(8, [mixing({ mat: 'cu', m1: 0.544, m2: 0.05 })]);
check(9, [waterRun(0.1, -10, 100).record(22, 354)]);
check(10, [waterRun(0.5, -10, 1289.3).boiling()]);
check(11, [waterRun(0.5, 19, 3000, true).record(1, 12)]);
check(12, [mixing({ mat: 'ice', m1: 0.1, m2: 0.2, T1: -10, T2: 52.35, Ccup: 100 })]);
check('h1', [mixing({ mat: 'ice', m1: 0.5, T1: -20, m2: 0.1, T2: 0 })]);
check('h2', [mixing({ m1: 1, T1: 200, m2: 0.05, T2: 96 })]);
check('h3', [waterRun(0.1, 20, 75, true).steady()]);

const base = { Ccup: 150.7, m1: 0.2, m2: 0.05 };
const examples = [
  miss => [mixing({ Ccup: 100, stir: false }), mixing({ Ccup: miss ? 100.1 : 100 })],
  miss => [mixing({ m2: 0.1, Ccup: miss ? 418.7 : 418.6 })],
  miss => [0.2, miss ? 0.399 : 0.4].map(m1 => mixing({ mat: 'ice', T1: 0, T2: 40, m1, m2: 0.1 })),
  miss => [waterRun(0.1, -5, 300).boiling(), waterRun(0.2, -5, miss ? 599.9 : 600).boiling()],
  miss => [waterRun(0.1, 95, 60, true).record(97, miss ? 200 : 194)],
  miss => [waterRun(0.1, -10, miss ? 75.1 : 75, true).record(60, 150)],
  miss => [mixing({ ...base, T1: 80, T2: 20 }), mixing({ ...base, T1: 100, T2: miss ? 10.1 : 10 })]
];
examples.forEach((demo, i) => { check('h' + (i + 4), demo(false)); check('h' + (i + 4), demo(true), true); });
