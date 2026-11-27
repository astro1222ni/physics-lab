'use strict';
const assert = require('node:assert/strict');
const C = require('../js/school-earthquake-evacuation-core');
const proof = require('../tools/mission-proofs/school-earthquake-evacuation.cjs');
const near = (a,b,tol=1e-9) => assert.ok(Math.abs(a-b)<=tol, a+' vs '+b+' (±'+tol+')');
const angle = C.edge('stair',7,1.3);
near(angle.effective,1);near(C.edge('hall',4,2).effective,1.6);near(C.edge('door',1,1).effective,.7);
const shut=C.edge('door',1,.30);near(shut.cap,0);assert.throws(()=>C.pass([0],shut,[0],false),RangeError);
near(angle.specific,1.01);near(C.edge('door',1,1).specific,1.30);near(C.edge('stair',7,1.3,.09,.15).effective,1.06);
near(C.speed(1.4,.53),1.19);near(C.speed(1.08,0),.95);near(C.speed(1.4,.54),1.4*(1-C.A*.54));
assert.ok(C.speed(1.4,1.6)<C.speed(1.4,.6));near(C.speed(1.4,1/C.A),0);
near(C.crowdedFactor(C.CRITICAL_D*.5),1);assert.ok(C.crowdedFactor(C.CRITICAL_D*1.4)<1);
const alertBoundary=Math.sqrt((17*3.5)**2-10**2);
near(C.warning({distance:alertBoundary}).lead,0);assert.equal(C.warning({distance:alertBoundary}).blind,true);
assert.equal(C.warning({distance:alertBoundary+.01}).blind,false);assert.equal(C.warning({distance:alertBoundary-.01}).blind,true);
const early=C.warning({distance:30,depth:40,received:10});near(early.pArrival,50/6);near(early.sArrival,50/3.5);near(early.lead,50/3.5-10);
assert.equal(C.warning({distance:30,depth:40,received:22}).blind,true);near(C.warning({distance:105,depth:0}).lead,13);
function saturated(width) {
  const link=C.edge('stair',7,width),n=400,ready=new Int32Array(n).fill(20),exits=[];
  const r=C.pass([...ready.keys()],link,ready,false,(i,a,b,end)=>exits.push(end*C.DT));
  const analytic=10+link.length/(link.k/2)+n/link.cap;
  near(r.last,analytic,2*C.DT+0.01);
  return 200/(exits[299]-exits[99]);
}
const flow=saturated(1.3);near(flow,angle.cap,.012);near(saturated(2.3)/flow,2,.025);
const refs=[{}, {size:40,west:1,east:2.4,push:true}, {closed:0,routes:Array(6).fill(1)}, {closed:0}, {closed:1,routes:Array(6).fill(1)}];
for(const q of refs) {
  const r=C.simulate(q);
  assert.equal(r.served+r.stalled,r.total);assert.equal(C.amount(r,r.chartEnd),r.served);
  for(let i=1;i<r.curve.length;i++)assert.ok(r.curve[i]>=r.curve[i-1]);
  assert.equal(r.count[0]+r.count[1]+r.stalled,r.total);
  for(let t=0;t<=r.chartEnd;t+=.5){let done=0,travelling=0,waiting=0;const passed=[0,0];
    for(let id=0;id<r.total;id++){
      const stages=r.tracks[id];
      if(!stages.length){waiting++;continue;}
      if(stages.find(s=>s.kind==='lower').end<=t)passed[r.q.routes[id%6]]++;
      if(t>=stages[stages.length-1].end)done++;
      else if(stages.some(s=>s.start<=t&&t<s.end))travelling++;
      else waiting++;
    }
    assert.equal(done,C.amount(r,t));assert.equal(done+travelling+waiting,r.total);
    assert.equal(passed[0],C.amount(r,t,'west'));assert.equal(passed[1],C.amount(r,t,'east'));
  }
  for(let id=0;id<r.total;id++){
    let t=0;for(const s of r.tracks[id]){assert.equal(s.wait,t);assert.ok(s.start>=t&&s.end>=s.start);t=s.end;}
    const p=C.position(r,id,r.chartEnd);assert.equal(p.kind,r.tracks[id].length?'assembled':'room');assert.ok(p.p.every(Number.isFinite));
  }
}
const base=C.simulate({}),pushed=C.simulate({push:true}),widened=C.simulate({corridor:3});
assert.ok(pushed.end>base.end);assert.equal(widened.end,base.end);
assert.ok(C.simulate({east:2.4,routes:Array(6).fill(1)}).end<C.simulate({east:1.2,routes:Array(6).fill(1)}).end);
assert.equal(C.compare(base,pushed).key,'push');assert.equal(C.compare(base,C.simulate({closed:0})),null);
assert.equal(C.compare(base,C.simulate({push:true,depth:30})).changes,2);
near(C.measure(base,0,base.end).slope,base.total/base.end);near(C.measure(base,19,19).slope,0);
assert.deepEqual(C.measure(base,40,60),C.measure(base,60,40));
const field=C.measure(base,40,70,'field'), west=C.measure(base,40,70,'west');
assert.equal(field.capacity,null);near(west.capacity,1.01*(1.5-.30));assert.notEqual(field.slope,west.slope);
for(let c=0;c<6;c++)near(base.classLast[c],Math.max(...base.tracks.filter((v,id)=>id%6===c).map(steps=>steps.at(-1).end)));
// 第 9.1 節：固定種子、人口與移動、班級起點及平台的兩股隊列。
assert.ok(C.warning(C.quakePresets.nearPreset).blind);
near(C.warning(C.quakePresets.farPreset).lead,Math.hypot(120,25)/3.5-20);
const baselineHash=require('node:crypto').createHash('sha256').update(JSON.stringify(proof.defaultSnapshot(),null,2)+'\n').digest('hex');
assert.equal(baselineHash,'e821b5275986d42282ce9a5643550172dde0a82ef754230d8b0dca76eb9d854b');
const advanced={size:37,seed:17,sizesVary:true,speedsVary:true,slowShare:30,delaysVary:true,delay:75,spread:24};
const varied=C.simulate(advanced), repeat=C.simulate(advanced), redraw=C.simulate({...advanced,seed:18});
assert.deepEqual(varied.people,repeat.people);assert.deepEqual(varied.curve,repeat.curve);
assert.notDeepEqual(varied.people.sizes,redraw.people.sizes);assert.notDeepEqual(varied.people.release,redraw.people.release);
assert.notDeepEqual(varied.people.factors,redraw.people.factors);
assert.ok(varied.people.sizes.every(n=>Number.isInteger(n)&&n>=Math.ceil(37*.8)&&n<=Math.floor(37*1.2)));
assert.equal(varied.total,varied.people.sizes.reduce((a,b)=>a+b));assert.equal(varied.served,varied.total);
assert.equal(varied.people.slowCount,Math.round(varied.total*.3));
assert.equal(varied.people.factors.filter(v=>v>=.55&&v<=.75).length,varied.people.slowCount);
assert.ok(varied.people.factors.every(v=>(v>=.55&&v<=.75)||(v>=.85&&v<=1.15)));
assert.ok(varied.people.release.every(t=>t>=0&&t*2===Math.round(t*2)));
for(let id=0;id<varied.total;id++)assert.equal(varied.tracks[id][0].wait,varied.people.release[varied.people.classOf[id]]);
for (let c=0;c<6;c++) assert.equal(varied.firstMove[c],Math.min(...varied.people.groups[c].map(id=>varied.tracks[id][0].start)));
assert.equal(C.simulate({closed:0},false).firstMove[0],null);
const slow=C.simulate({speedsVary:true,seed:17,slowShare:100});
assert.ok(slow.end>C.simulate({speedsVary:true,seed:17,slowShare:0}).end);
assert.deepEqual(C.simulate({delay:1}).curve,base.curve);
const delayed=C.simulate({delay:90});assert.ok(delayed.people.release[0]>0);
near(delayed.end-base.end,delayed.people.release[0]);assert.ok(delayed.people.release.every(x=>x===delayed.people.release[0]));
const origins=[5,1,2,3,4,0], swapped=C.simulate({origins});
assert.equal(C.position(swapped,0,-1).floor,3);assert.equal(C.position(swapped,5,-1).floor,2);
assert.notEqual(swapped.meanDistance,base.meanDistance);assert.notDeepEqual(swapped.classLast,base.classLast);
assert.deepEqual(C.config({origins:[5,5]}).origins,C.defaults.origins);
assert.ok(C.simulate({origins,routes:origins.map(slot=>C.shortest[slot])},false).shortest);
assert.equal(C.compare(base,swapped).key,'origins');assert.equal(C.compare(varied,repeat).changes,0);
for(const mode of ['alternate','lower','upper']){
  const order=[],ready=new Int32Array(6),ids=[0,1,2,3,4,5],people={classOf:ids.slice(),factors:[1,1,1,1,1,1]};
  C.pass(ids,C.edge('stair',1,1.5),ready,false,id=>order.push(id),people,mode,C.defaults.origins);
  assert.deepEqual(order,mode==='alternate'?[0,3,1,4,2,5]:mode==='lower'?[0,1,2,3,4,5]:[3,4,5,0,1,2]);
  const full=C.simulate({...advanced,origins,merge:mode});assert.equal(C.amount(full,full.end),full.total);
  assert.equal(full.count.reduce((a,b)=>a+b),full.total);
}
const small=C.simulate({size:20,push:true}),large=C.simulate({size:40,push:true});
assert.ok(large.densities.corridor[1]>small.densities.corridor[1]&&large.densities.stair[1]>small.densities.stair[1]);
assert.ok(large.densities.stairFlowFactor[1]<small.densities.stairFlowFactor[1]);
assert.ok(C.measure(large,30,75,'east').slope<C.measure(small,30,75,'east').slope);
function corridorDischarge(r){return r.tracks.filter((p,id)=>r.q.routes[r.people.classOf[id]]===1&&p.some(e=>e.kind==='shared'&&e.end>20&&e.end<=40)).length/20;}
assert.ok(corridorDischarge(large)>corridorDischarge(small));
assert.equal(C.amount(varied,varied.end-.5)<varied.total,true);assert.equal(C.amount(varied,varied.end),varied.total);
const proofResult=proof.prove();assert.equal(proofResult.rows.length,20);assert.ok(proofResult.randomPairs>=20000);
console.log('預警邊界、速度與寬度、解析解、逐時守恆、封閉樓梯、成對比較、曲線及 20,000 組任務證明通過。');

