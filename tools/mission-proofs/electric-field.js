/* 舊的 .cjs 仍是一般任務與 h1–h3 的可達證明。本入口另檢查新、舊解的交集。 */
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const legacy = require('node:child_process').spawnSync(process.execPath, [path.join(__dirname, 'electric-field.cjs')], {
  stdio: 'inherit', windowsHide: true
});
assert.equal(legacy.status, 0, '既有證明失敗');

const FC = require('../../js/field-core.js');
let missions;
global.LabMission = { register: (_, defs) => { missions = defs; } };
global.window = { LabMission };
require('../../js/missions/electric-field.js');

function trial(qA, qB, sep, x, y, q = 1, m = 1) {
  return { qA, qB, sep, x, y, q, m };
}
// 座標 cm；頁面的間距滑桿將兩場源水平對稱放在 (6,4) 兩側。
function events(s) {
  const { qA, qB, sep, x, y, q, m } = s;
  const [xA, yA, xB, yB] = s.coords || [6 - sep / 2, 4, 6 + sep / 2, 4];
  const charges = [{ x: xA, y: yA, q: qA }, { x: xB, y: yB, q: qB }];
  const data = { qA, qB, xA, yA, xB, yB, d: Math.hypot(xB - xA, yB - yA), x, y, q, m,
    ...FC.probeInfo(charges, x, y) };
  const probe = { x, y, q, m, vx: 0, vy: 0 };
  const evs = [{ type: 'probe', data: { ...data, key: 'probe' } },
    { type: 'release', data: { ...data, V0: data.V, total0: FC.energy(charges, probe).total } }];
  // 連同釋放後的舊隱藏任務事件一起核對；頁面每趟最多發出一次 return。
  let maxDist = 0, returned = false;
  for (let frame = 0; frame < 1800; frame++) {
    const stop = FC.advance(charges, probe, 1 / 60, { bounds: { x0: 0, x1: 12, y0: 0, y1: 8 }, stopRadius: 0.3 });
    const dist = Math.hypot(probe.x - x, probe.y - y);
    maxDist = Math.max(dist, maxDist);
    if (!returned && maxDist >= 1 && dist < 0.15) {
      evs.push({ type: 'return', data: { qA, qB, q, m, clean: true } });
      returned = true;
    }
    if (stop) {
      evs.push({ type: 'end', data: { qA, qB, q, m, clean: true, reason: stop.reason,
        v: 100 * Math.hypot(probe.vx, probe.vy) } });
      break;
    }
  }
  return evs;
}
function hits(steps, defs) {
  const stream = steps.flatMap(events);
  return defs.filter(m => {
    const mem = {};
    return stream.some(e => m.check(e, mem));
  }).map(m => m.id);
}
const hidden = missions.filter(m => m.hidden);
const added = hidden.filter(m => /-h(?:[4-9]|10)$/.test(m.id));
const singlePreset = { ...trial(3, 0, 0, 8, 4), coords: [6, 4, 10.5, 1.5] };
const dipole = (x, y, q, m) => trial(3, -3, 4, x, y, q, m);
// 舊證明有些解只要放置。即使在這些解的位置再多按釋放，也不得取得新任務。
const previous = [
  [dipole(6, 6)], [trial(3, 3, 4, 6, 6)], [trial(4, -2, 4, 6, 6)], [singlePreset],
  [dipole(4.5, 4)], [singlePreset], [dipole(10, 4, -1)], [trial(3, 3, 9, 6, 4)],
  [trial(4, -2, 4, 9.333, 6.667)], [dipole(3.3, 6.8)], [dipole(2, 6, 1, 4), dipole(2, 6, 1, 1)],
  [dipole(5, 5, 0.1, 5)], [trial(4, -2, 2, 11.83, 4)],
  [dipole(3, 4), dipole(3, 4, 2.75)], [trial(1, -1, 6, 2.515, 6.85)], [trial(4, -2, 4, 9.333, 1.333)],
  [trial(3, 3, 4, 6, 6, -1)], [trial(5, -5, 1, 6, 6)], [trial(5, -5, 4, 4.75, 4, 3, 0.2)]
];
for (const steps of previous) assert.deepEqual(hits(steps, added), [], JSON.stringify(steps));
// 第 6 題的舊證明沿 x = 3.3 搜尋第一個可行 y；連搜尋範圍內每個候選都核對。
for (let i = 660; i <= 700; i++) assert.deepEqual(hits([dipole(3.3, i / 100)], added), []);
assert.deepEqual(hits(previous.flat(), added), [], '依序做完所有舊解');
assert.deepEqual(hits([dipole(6, 6)], hidden), [], '預設釋放');

const cases = [
  [[trial(2, 0, 4, 5, 4), trial(2, 0, 4, 6, 4)], { x: 6.1 }],
  [[trial(2, 0, 4, 6, 5), trial(-2, 0, 4, 6, 5)], { qA: -1.99 }],
  [[trial(4, 1, 6, 7, 4)], { x: 7.1 }],
  [[trial(3, -1, 4, 7, 4)], { x: 7.1 }],
  [[trial(2, 2, 4, 6, 5.4)], { y: 5.5 }],
  [[trial(2, -2, 4, 6, 7.5)], { y: 7.6 }],
  [[trial(2.25, -1, 2, 11, 4)], { x: 11.2 }]
];
for (const [i, [steps, change]] of cases.entries()) {
  const id = 'electric-field-h' + (4 + i);
  assert.deepEqual(hits(steps, hidden), [id], id);
  assert.deepEqual(hits([...steps.slice(0, -1), { ...steps.at(-1), ...change }], hidden), [], id + ' near miss');
  console.log('✓', id, JSON.stringify(steps), '近失變更', JSON.stringify(change));
}
