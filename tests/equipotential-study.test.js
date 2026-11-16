/* 自學題目與物理核心的接合：數值、給定線及領星邊界。 */
'use strict';
const assert=require('assert'),C=require('../js/equipotential-core.js'),S=require('../js/equipotential-study-core.js');
const examples=require('../js/examples/equipotential.js');
const F=S.facts();
assert(Math.abs(F.A-.3273851093860838)<1e-9);
assert(Math.abs(F.B-.7339241481812273)<1e-9);
assert(F.closed1&&F.closed5&&Math.abs(F.edge2-20.25)<.06);
for(const ex of examples){
  const records=S.givenRecords(ex.state,ex.levels),sol=C.solve(ex.state);
  assert(records.length>=ex.levels.length*6);
  for(const r of records){assert(r.given);assert(Math.abs(C.potentialAt(sol,r.x,r.y)-r.V2)<.005);}
}
global.window={LabMission:{register(){}}};global.LabMission=window.LabMission;require('../js/missions/equipotential.js');
const doubled=C.solve({...S.base,V0:12});
assert(Math.abs(C.fieldAt(doubled,15,10).E-2*F.A)<1e-9);
assert(C.contour(doubled,6).every(line=>line.pts.every(p=>Math.abs(p[0]-15)<.001)));
const tasks=window.EquipotentialStudyTasks.taskDefinitions();
assert.equal(tasks.length,17);assert.equal(tasks.reduce((n,m)=>n+m.level,0),78);
const check=(n,data)=>tasks.find(m=>m.id==='equipotential-'+n).check({type:'study',data:{module:'equipotential',userAction:true,...data}});
assert(!check(23,{act:'field-estimated',seg:4,estimated:true,err:.1}));
assert(!check(23,{act:'field-estimated',seg:4,estimated:true,err:NaN}));
assert(check(23,{act:'field-estimated',seg:4,estimated:true,err:.099}));
assert(!check(31,{act:'card-exported',seg:8,ownPoints:6,exported:true,method:'preview'}));
assert(!check(31,{act:'card-exported',seg:8,ownPoints:5,exported:true,method:'download'}));
assert(!check(18,{act:'predictions-submitted',seg:2,submitted:2,firstCorrect:2}));
assert(!check(30,{act:'quiz-completed',seg:7,correct:3,firstCorrect:3}));
assert(!check(32,{act:'unit-completed',seg:8,sections:Array(8).fill(true),awarded:[]}));
console.log('自學數值、三題給定線、78 星與防止誤領邊界全部通過。');
