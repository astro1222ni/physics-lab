/* 任務可達成的證明腳本（從製作時的暫存資料夾保存下來的快照）。用法：node tools/mission-proofs/specific-heat.js
 * 修改物理核心或任務條件後重跑，確認每個任務仍然做得到、預設狀態不會觸發任務。 */
const __ROOT = require('path').resolve(__dirname, '..', '..') + '/';
const HC = require(__ROOT + 'js/specific-heat-core.js');
const H = HC.enthalpyAt;
function mix(mat, m1, T1, m2, T2, C) {
  const A = HC.makeBody(mat, m1), B = HC.makeBody('h2o', m2, C);
  const HA = H(A, T1, mat === 'h2o' ? 0 : undefined), HB = H(B, T2, 1);
  const e = HC.equilibrium([{ b: A, H: HA }, { b: B, H: HB }]);
  const pa = HC.phaseMasses(A, e.H[0]), pb = HC.phaseMasses(B, e.H[1]);
  return { Tf: e.T, ice: (mat === 'h2o' ? pa[0] : 0) + pb[0], steam: (mat === 'h2o' ? pa[2] : 0) + pb[2], iceA: mat === 'h2o' ? pa[0] : 0 };
}
{
  let missions;
  global.window = { LabMission: { register: (_, list) => { missions = list; } } };
  global.LabMission = window.LabMission;
  require(__ROOT + 'js/missions/specific-heat.js');
  const task = missions.find(m => m.id === 'specific-heat-1');
  const event = T1 => ({ type: 'mix', data: {
    mat: 'al', sub: 'al', m1: 0.2, m2: 0.25, T1, T2: 20, Ccup: 0, stir: true, loss: false,
    ...mix('al', 0.2, T1, 0.25, 20, 0)
  } });
  const measured = event(60);
  measured.data.TA = measured.data.Tf; measured.data.TB = measured.data.Tf;
  if (!task.check(measured, {})) throw Error(task.id);
}
