'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const slug = 'school-earthquake-evacuation';
const C = require('../../js/' + slug + '-core.js');
const missions = [];
const mock = { register: (id, values) => { assert.equal(id,slug); missions.push(...values); } };
new Function('window','LabMission',fs.readFileSync(path.join(__dirname,'../../js/missions',slug+'.js'),'utf8'))({LabMission:mock},mock);

function prove() {
  const found = new Map();
  const alternatives=new Map(), events=[...new Set(missions.map(m=>m.needOn[0]))];
  let evaluations = 0, max = 0, seed = 20261120, pairs = 0;
  let randomConfigurations = 0, randomPairs = 0;
  const random = n => { seed = (Math.imul(1664525,seed)+1013904223)>>>0; return Math.floor(seed/4294967296*n); };
  const routes = mask => C.classes.map((_,i)=>(mask>>i)&1);
  const summary = q => {
    const a=C.config(q);return Object.fromEntries(Object.keys(C.defaults).filter(k=>JSON.stringify(a[k])!==JSON.stringify(C.defaults[k])).map(k=>[k,a[k]]));
  };
  function check(type,data,makeCase) {
    evaluations++;
    const hits=missions.filter(m=>m.check({type,data:{...data,observed:true}},{}));
    max=Math.max(max,hits.length);
    if(hits.length>1)assert.fail(JSON.stringify({type,data,counterexample:makeCase(),ids:hits.map(m=>m.id)}));
    if(!hits.length)return;
    const id=hits[0].id;
    if(found.has(id)&&alternatives.has(id))return;
    const entry={...makeCase(),event:type,data};
    if(!found.has(id))found.set(id,entry);
    else {
      const prior=found.get(id);
      if((type==='roll'||type==='stairs')&&JSON.stringify([prior.q.routes,prior.q.closed])===JSON.stringify([entry.q.routes,entry.q.closed]))return;
      if(JSON.stringify([prior.q,prior.cursor,prior.base,prior.time,prior.channel])!==JSON.stringify([entry.q,entry.cursor,entry.base,entry.time,entry.channel]))alternatives.set(id,entry);
    }
  }
  assert.equal(missions.length,20);
  const defaultState={...C.facts(C.simulate({},false)),...C.warning(C.defaults),observed:false};
  for(const m of missions){
    assert.ok(!m.check(defaultState,{}),m.id+' 預設狀態直接觸發');
    for(const type of events)assert.ok(!m.check({type,data:defaultState},{}),m.id+' 未做指定觀測即觸發');
  }
  // Actual UI events require three voluntary protective actions or recording a completed drill.
  function shelter(q,t) {
    const a=C.warning(q);
    check('shelter',{lead:a.lead,margin:a.lead-t,blind:a.blind,shaking:t>=a.lead&&t<a.lead+q.shaking},()=>({q:summary(q),time:t}));
  }
  function record(r,a,b) {
    if(!r.complete)return;
    const d=C.facts(r);
    for(const event of ['roll','stairs','floors'])check(event,d,()=>({q:summary(r.q)}));
    const m={...d,...C.measure(r,a,b)};
    for(const event of ['measure','intervals'])check(event,m,()=>({q:summary(r.q),cursor:[a,b]}));
    for(const channel of ['west','east'])check('stairFlow',{...d,...C.measure(r,a,b,channel)},()=>({q:summary(r.q),cursor:[a,b],channel}));
  }
  function comparison(base,next) {
    const data=C.compare(base,next);if(!data)return;pairs++;
    check('comparison',data,()=>({base:summary(base.q),q:summary(next.q)}));
  }
  const base=C.simulate({},false);
  shelter(base.q,2);shelter(C.config({distance:20}),2);
  shelter(C.config({distance:120,received:20}),3);shelter(C.config({distance:38,depth:20}),3);
  record(base,40,70);record(base,0,10);record(base,base.end,base.chartEnd);
  record(base,4,17);record(base,base.end+3,base.chartEnd-1);
  for(let a=20;a<65;a+=2)for(let b=a+20;b<100;b+=4)record(base,a,b);
  for(const q of [{closed:0,routes:routes(63)},{closed:1,routes:routes(0)},{routes:routes(0)},{door:2.8},{corridor:3},{push:true},{size:40}]) {
    const r=C.simulate(q,false);record(r,30,60);comparison(base,r);
  }
  const smaller=C.simulate({size:28},false);
  for(const q of [{corridor:3.2},{door:2.6}])comparison(smaller,C.simulate({...smaller.q,...q},false));
  // Prefer compact, reproducible phone witnesses (one-decimal widths; six binary class buttons).
  for(const west of [1.5,1.2,1.8,2.1])for(const east of [1.5,1.2,1.8,2.1]){
    const reference=C.simulate({west,east,routes:C.shortest},false);
    comparison(reference,C.simulate({...reference.q,east:2.4},false));
    for(let mask=0;mask<64;mask++){
      const r=C.simulate({west,east,routes:routes(mask)},false);record(r,40,68);comparison(reference,r);comparison(r,reference);
      comparison(r,C.simulate({...r.q,push:true},false));
    }
  }
  while(randomPairs<20000){
    randomConfigurations++;
    const q=C.config({size:20+random(21),west:(10+random(15))/10,east:(10+random(15))/10,
      corridor:(12+random(29))/10,door:(10+random(21))/10,distance:10+random(141),depth:random(61),received:10+random(13),shaking:5+random(56),
      closed:random(6)?-1:random(2),routes:routes(random(64)),push:!!random(2)});
    // Include blocked plans in coverage. Complete two thirds of the closure scenarios.
    if(q.closed>=0&&random(3))q.routes.fill(1-q.closed);
    // Separate streams preserve an identical cohort for a one-variable comparison.
    q.seed=random(0x10000000);q.sizesVary=!!random(2);q.speedsVary=!!random(2);q.delaysVary=!!random(2);
    q.delay=random(121);q.spread=random(61);q.slowShare=random(101);
    q.merge=['arrival','alternate','lower','upper'][random(4)];
    const roomA=random(6),roomB=random(6);
    [q.origins[roomA],q.origins[roomB]]=[q.origins[roomB],q.origins[roomA]];
    const r=C.simulate(q,false);
    let a=random(r.chartEnd*2+1)/2,b=random(r.chartEnd*2+1)/2;
    record(r,a,b);shelter(q,random(Math.ceil(C.warning(q).lead+q.shaking)*2)/2);
    const next={...q,routes:[...q.routes]};
    switch(random(8)){
      case 0:next.routes=routes(random(64));break;
      case 1:next.push=!q.push;break;
      case 2:next.west=(10+random(15))/10;break;
      case 3:next.east=(10+random(15))/10;break;
      case 4:next.corridor=(12+random(29))/10;break;
      case 5:next.door=(10+random(21))/10;break;
      case 6:next.size=20+random(21);break;
      default:next.size=20+random(21);next.routes=routes(random(64));
    }
    const altered=C.simulate(next,false);
    comparison(r,altered);
    if(r.complete&&altered.complete)randomPairs++;
  }
  const missing=missions.filter(m=>!found.has(m.id));assert.equal(missing.length,0,'無可操作解 '+missing.map(m=>m.id));
  assert.equal(alternatives.size,20,'每題至少兩組解');
  const pairwise=provePairs(events);
  const rows=missions.map(m=>({id:m.id,level:m.level,hidden:!!m.hidden,...found.get(m.id),second:alternatives.get(m.id)}));
  return {seed:20261120,randomConfigurations,randomPairs,pairedComparisons:pairs,evaluations,defaultHits:0,maxSimultaneous:max,pairwise,rows};
}
// Exhaust the truth partitions, rather than using random samples to argue disjointness.
// Rows are observationally equivalent whenever every predicate in this event has the same truth value.
// Comparison is ordered: gain = -delta/baseTime; a shortest baseline cannot have a shorter successor.
function provePairs(events){
  const states=Object.fromEntries(events.map(e=>[e,[]]));
  function add(type,data){states[type].push({type,data:{...data,observed:true}});}
  for(const blind of [false,true])for(const margin of [-1,0,1])for(const shaking of [false,true])
    if(!blind||margin<=0)add('shelter',{blind,lead:blind?0:10,margin,shaking});
  for(const closed of [false,true])for(const used of [1,2])for(const complete of [false,true])for(const end of [145,200,230,231])
    if(!closed||used===1)add('roll',{closed,used,complete,end});
  for(const used of [1,2])for(const closed of [false,true])for(const stairGap of [0,.5,5,5.5])for(const peak of [1,2])
    add('stairs',{used,closed,stairGap,peak});
  for(const firstGap of [-1,0,1])for(const floorGap of [-1,0,5,6])add('floors',{firstGap,floorGap});
  for(const dt of [0,4.5,5,9.5,10,19.5,20,21])for(const n0 of [0,1,120])for(const n1 of [0,1,120]){
    if(n1<n0)continue;
    for(const equal of [false,true])for(const channel of ['field','west','east'])
      for(const error of [0,.05,.051]){
        const datum={dt,n0,n1,total:120,slope:dt?(n1-n0)/dt:0,equal,channel,error};
        add(channel==='field'?'measure':'stairFlow',datum);add('intervals',datum);
      }
  }
  for(const key of ['',...Object.keys(C.defaults)])
    for(const gain of [-.25,0,.05,.10,.15,.20,.25])for(const widthDelta of [-1,0,1])
      for(const priorShortest of [false,true])for(const meanDelta of [-1,0,1])for(const added of [false,true]){
        if(key==='routes'&&priorShortest&&meanDelta<0)continue;
        add('comparison',{key,gain,delta:-gain*100,widthDelta,priorShortest,meanDelta,pushAdded:key==='push'&&added});
      }
  const pairs=[];
  for(let i=0;i<missions.length;i++)for(let j=i+1;j<missions.length;j++){
    const a=missions[i],b=missions[j],ea=a.needOn[0],eb=b.needOn[0];
    const evidence=ea===eb?states[ea]:[];
    const overlap=evidence.find(ev=>a.check(ev,{})&&b.check(ev,{}));
    assert.ok(!overlap,JSON.stringify({a:a.id,b:b.id,overlap}));
    pairs.push({a:a.id,b:b.id,group:a.hidden===b.hidden?(a.hidden?'隱藏':'一般'):(!a.hidden&&!b.hidden?'一般':'跨組'),
      proof:ea===eb?'窮舉該事件條件的全部真假分區':'每次觀測只發出單一事件',ea,eb,partitions:evidence.length});
  }
  assert.equal(pairs.length,190);return pairs;
}
// 舊版快照刻意保留當時的欄位表，新控制另外做功能測試。
function defaultSnapshot() {
  const keys=['size','west','east','corridor','door','distance','depth','received','shaking','closed','push','routes'];
  function readings(r) {
    return {inputs:Object.fromEntries(keys.map(k=>[k,r.q[k]])),warning:C.warning(r.q),
      end:r.end,chartEnd:r.chartEnd,served:r.served,total:r.total,stalled:r.stalled,complete:r.complete,
      classLast:r.classLast,first:r.first,last:r.last,capacities:r.capacities,count:r.count,meanDistance:r.meanDistance,
      curve:[...r.curve],exitCurves:r.exitCurves.map(row=>[...row])};
  }
  const r=C.simulate({},false), data={...C.facts(r),...C.warning(r.q),observed:false};
  const examples=require('../../js/examples/'+slug+'.js');
  return {預設:readings(r),任務:missions.map(m=>{
    const ev={type:m.needOn[0],data};
    return {id:m.id,level:m.level,事件輸入:ev,直接代入:m.check(data,{}),未觀測:m.check(ev,{})};
  }),範例:examples.map(e=>({編號:e.n,初始設定:e.state,讀數:readings(C.simulate(e.state,false))}))};
}
if(require.main===module&&process.argv.includes('--snapshot'))console.log(JSON.stringify(defaultSnapshot(),null,2));
else if(require.main===module){const result=prove();if(process.argv.includes('--json'))console.log(JSON.stringify(result,null,2));
  else {for(const row of result.rows)console.log(row.id+' Lv.'+row.level+' '+row.event+' '+JSON.stringify({baseline:row.base,settings:row.q,cursors:row.cursor}));
    console.log('20 題可單獨完成；固定種子 '+result.randomConfigurations+' 組，'+result.pairedComparisons+' 次有效配對，'+result.evaluations+' 次判定，預設 0 題，同時最多 '+result.maxSimultaneous+' 題。');}}
module.exports={prove,missions,defaultSnapshot};

