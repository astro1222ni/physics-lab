/* 新任務的逐一事件證明；每個事件只命中自己的任務，預設、上課與還原不命中。 */
'use strict';
const assert=require('assert'),C=require('../../js/current-balance-core.js'),S=require('../../js/current-balance-study-core.js');
function events(){const rows=[1,2,3,4,5].map(len=>({part:1,m:len*.004/100,I1:3,I2:C.balanceI2(len*.004/100,3,false)})),p=C.analyze(rows).p1;
  const study=(n,act,seg,data)=>[n,{type:'study',data:{module:'current-balance',userAction:true,act,seg,...data}}];
  const m=C.balanceMass(1,1.43,false),th=C.eqAngle(C.netTorque({m,I1:1,I2:1.43,s1:1,s2:1,nut:8.4}));
  return [
    [12,{type:'optical-record',data:{recorded:true,optical:true,rest:true,level:true,spotMm:S.optical(th)*1000}}],
    [13,{type:'rice-record',data:{recorded:true,weight:'rice',grains:1,hung:true,currents:true,rest:true,level:true,mg:m*1e6}}],
    study(14,'intro-completed',1,{photoSeen:true,riceSeen:true}),study(15,'predictions-submitted',2,{submitted:2}),study(16,'predictions-perfect',2,{firstCorrect:2,revealed:true}),
    study(17,'concepts-completed',3,{cardsSeen:5,handSeen:true}),study(18,'zero-completed',4,{power:false,hung:false,rest:true,level:true,zeroOff:0}),study(19,'first-recorded',4,{ownN:1,recorded:true,rest:true,level:true,given:false}),
    study(20,'five-recorded',4,{...p,given:false}),study(21,'mu-calculated',4,{...p,answerErr:0}),study(22,'answer-compared',5,{n:p.n,mu0:p.mu0,submitted:2,revealed:true}),study(23,'models-compared',5,{idealSeen:true,realSeen:true,ratio:C.realFactor().ratio}),
    study(24,'example-one-checked',6,{example:1,ownRecord:true,balanced:true,lengthError:Math.abs(C.balanceMass(2,3,false)/C.APP.lambda*100-2.3)}),study(25,'example-two-checked',6,{example:2,linear:true,err:S.inverseFit(S.inverseRows()).mu0/C.MU0-1}),
    study(26,'example-three-checked',6,{example:3,cause:'zero',intercept:C.analyze(S.offsetRows().map(r=>({...r,m:r.m*1e-6}))).p1.line.intercept}),study(27,'quiz-correct',7,{correct:3}),study(28,'quiz-perfect',7,{firstCorrect:3}),
    study(29,'card-exported',8,{n:5,distinctM:5,exported:true,method:'download'}),study(30,'unit-completed',8,{sections:Array(8).fill(true),awarded:Array.from({length:16},(_,i)=>i+14)})
  ];
}
function prove(list,verbose=true){const defs=list.filter(m=>m.study);assert.equal(defs.length,17);assert.equal(defs.reduce((n,m)=>n+m.level,0),78);
  for(const [n,e] of events()){const id='current-balance-'+n,hits=list.filter(m=>m.check(e,{})).map(m=>m.id);assert.deepStrictEqual(hits,[id],id+' 事件不可連帶觸發其他任務');
    assert(!list.find(m=>m.id===id).check({type:e.type,data:{}},{}));
    if(n>=14)for(const bad of [{userAction:false},{teaching:true},{restoring:true},{module:'equipotential'},{seg:0}])assert(!list.find(m=>m.id===id).check({...e,data:{...e.data,...bad}},{}),id+' 不可誤領');
    if(verbose)console.log('✓ '+id+'：做得到、空資料不觸發、事件不連帶完成');}
  for(const type of ['state','power','display','view','study']){const e={type,data:{}};assert.equal(list.filter(m=>(m.study||/-1[23]$/.test(m.id))&&m.check(e,{})).length,0);}
  return true;
}
module.exports={events,prove};
