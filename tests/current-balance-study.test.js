/* 解析式、極限、抽樣、接線對稱與領星邊界；給定數據不當成實測。 */
'use strict';
const assert=require('assert'),C=require('../js/current-balance-core.js'),S=require('../js/current-balance-study-core.js');
const near=(a,b,tol=1e-10)=>assert(Math.abs(a-b)<tol,`${a} 與 ${b} 不符`);
near(C.balanceMass(1,1,false)*1e6,15.387392589011232,1e-8);
near(C.balanceMass(2,3,false)/C.balanceMass(1,1,false),6);
// 題目指定的 61 mg 必須也出現在可操作器材，不可只在給定資料表正確。
const exampleTwo=require('../js/examples/current-balance.js')[1].state;
near(C.APP.lambda*exampleTwo.len/100*1e6,61);
near(C.balanceMass(exampleTwo.I1,exampleTwo.I2,false)*1e6,61,.005);
near(S.optical(0),0);for(const angle of [-1e-4,1e-4])near(S.optical(angle),S.opticalSmall(angle),1e-10);
near(S.optical(.01),-S.optical(-.01));near(S.opticalSmall(.0005/C.APP.rTip)/.0005,4/C.APP.rTip);
assert(S.earthRatio(2.5)*100>.27&&S.earthRatio(2.5)*100<.29);assert(Number.isNaN(S.earthRatio(0)));
near(S.rice(1,()=>0)[0],20e-6);near(S.rice(1,()=>1)[0],24e-6);
const sample=S.rice(1001,(()=>{let i=0;return ()=>i++/1000;})());near(sample.reduce((n,m)=>n+m,0)/sample.length,22e-6);
for(const s1 of [-1,1])for(const s2 of [-1,1]){const h=S.hand(s1,s2);assert.deepStrictEqual(h.F,[0,-s1*s2,0]);assert.equal(h.I[0]*h.B[2],-h.F[1]);}
near(S.wiringMean(S.wiring(2,3,7e-6)),C.balanceMass(2,3,false));
const inv=S.inverseFit(S.inverseRows());near(inv.mu0,C.MU0);near(inv.intercept,0);assert(S.inverseRows().every(r=>r.given&&r.I1<=4&&r.I2<=5));
const offset=C.analyze(S.offsetRows().map(r=>({...r,m:r.m*1e-6}))).p1;near(offset.line.slope/C.APP.n,C.MU0);assert(Math.abs(offset.line.intercept)>.0003);
let list;global.window={LabMission:{register(_,a){list=a;}}};global.LabMission=window.LabMission;require('../js/missions/current-balance.js');
require('../tools/mission-proofs/current-balance-new.cjs').prove(list,false);
const task=n=>list.find(m=>m.id==='current-balance-'+n),event=(act,seg,data)=>({type:'study',data:{module:'current-balance',userAction:true,act,seg,...data}});
assert(!task(21).check(event('mu-calculated',4,{n:5,distinctM:5,err:NaN,answerErr:0})));
assert(!task(21).check(event('mu-calculated',4,{n:5,distinctM:5,err:.05,answerErr:0})));
assert(!task(29).check(event('card-exported',8,{n:5,distinctM:5,exported:true,method:'preview'})));
assert(!task(30).check(event('unit-completed',8,{sections:Array(8).fill(true),awarded:[]})));
assert(!task(12).check({type:'optical-record',data:{recorded:true,optical:true,rest:true,level:true,spotMm:2.001}}));
assert(!task(13).check({type:'rice-record',data:{recorded:true,weight:'rice',grains:2,hung:true,currents:true,rest:true,level:true}}));
for(const m of list.filter(m=>!m.hidden)){assert(m.title.zh&&m.title.en&&m.desc.zh&&m.desc.en);assert(!/[\u3400-\u9fff]/.test(m.title.en+m.desc.en));}
console.log('電流天平自學：解析量、光槓桿、地磁、米粒、接線、範例與 78 星邊界全部通過。');
