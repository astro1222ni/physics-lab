'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..'), slug = 'basketball-shot';
const C = require(path.join(root, 'js/basketball-shot-core.js'));
const page = fs.readFileSync(path.join(root, slug+'.html'), 'utf8');
const defaults = {mode:'shot',drag:false}, limits = {};
for (const id of ['speed','angle','height','distance']) {
  const input = page.match(new RegExp('<input[^>]*type="range"[^>]*id="'+id+'"[^>]*>'))[0];
  const attr = name => Number(input.match(new RegExp('\\b'+name+'="([^"]+)"'))[1]);
  defaults[id] = attr('value');
  limits[id] = {min:attr('min'),max:attr('max'),decimals:attr('data-decimals'),step:attr('step')};
}
let missions;
new Function('window', fs.readFileSync(path.join(root,'js/missions/'+slug+'.js'),'utf8'))({
  BasketballShotCore:C,
  LabMission: {register(id,defs){ assert.equal(id,slug); missions=defs; }}
});
// Two independent witnesses per assignment. In a pair the current ball comes first.
const examples = {
  '1': [[{mode: "throw", speed: 9, angle: 35}], [{mode: "throw", height: 2.4, speed: 9, angle: 28}]],
  '2': [[{angle: 41, speed: 6.75}], [{angle: 52, speed: 5.62}]],
  '3': [[{speed: 7.31}], [{angle: 67, speed: 8.03}]],
  '4': [[{angle: 57, speed: 7.32}], [{distance: 3.7, angle: 60, speed: 7.03}]],
  '5': [[{angle: 44, speed: 7.81}], [{angle: 67, speed: 8.51}]],
  '6': [[{mode:'throw',height:1.2,speed:7,angle:39.0},{mode:'throw',height:1.2,speed:7,angle:24}], [{mode:'throw',height:1.2,speed:7,angle:40.0},{mode:'throw',height:1.2,speed:7,angle:27}]],
  '7': [[{angle: 62, speed: 7.59}, {angle: 50, speed: 7.29}], [{angle: 69, speed: 8.28}, {angle: 50, speed: 7.29}]],
  '8': [[{mode: "throw", height: 1.2, speed: 16, angle: 40, drag: true}, {mode: "throw", height: 1.2, speed: 16, angle: 40}], [{mode: "throw", height: 1.2, speed: 17, angle: 32, drag: true}, {mode: "throw", height: 1.2, speed: 17, angle: 32}]],
  '9': [[{mode: "throw", height: 0, speed: 7, angle: 62}, {mode: "throw", height: 0, speed: 7, angle: 28}], [{mode: "throw", height: 0, speed: 9, angle: 62}, {mode: "throw", height: 0, speed: 9, angle: 28}]],
  '10': [centrePair(4.23,2.2,.004),centrePair(2.3,1.2,.012)],
  'h1': [[{angle: 29, speed: 9.43}], [{angle: 32, speed: 8.75}]],
  'h2': [[{speed: 8.55, height: 1.2, distance: 3.2, angle: 52.28}], [{speed: 9.12, height: 1.2, distance: 3.7, angle: 50.61}]],
  'h3': [[{angle: 27, speed: 10}], [{distance: 2.65, height: 2.3, angle: 31, speed: 7.46}]],
  'h4': [[{height: 2.7, angle: 53.67, speed: 6.8}, {height: 2.7, angle: 41, speed: 6.8}], [{distance: 3.7, height: 2.7, angle: 53.29, speed: 6.38}, {distance: 3.7, height: 2.7, angle: 42, speed: 6.38}]],
  'h5': [[{angle: 44, speed: 7.81}, {angle: 50, speed: 7.29}], [{angle: 67, speed: 8.51}, {angle: 72, speed: 8.76}]],
  'h6': [[{height: 2.45, angle: 50, speed: 6.91}, {angle: 50, speed: 7.29}], [{height: 2.45, angle: 65, speed: 7.61}, {angle: 65, speed: 7.82}]],
  'h7': [[{mode: "throw", height: 1.2, speed: 13, angle: 42.14, drag: true}, {mode: "throw", height: 1.2, speed: 13, angle: 43.13}], [{mode: "throw", height: 1.2, speed: 15, angle: 42.34, drag: true}, {mode: "throw", height: 1.2, speed: 15, angle: 43.58}]],
  'h8': [[{mode: "throw", height: 1.2, speed: 9.23, angle: 28, drag: true}, {mode: "throw", height: 1.2, speed: 9, angle: 28}], [{mode: "throw", height: 1.2, speed: 11.4, angle: 28, drag: true}, {mode: "throw", height: 1.2, speed: 11, angle: 28}]],
  'h9': [[{mode: "throw", height: 1.2, speed: 7, angle: 62}, {mode: "throw", height: 1.2, speed: 7, angle: 28}], [{mode: "throw", height: 1.2, speed: 9, angle: 62}, {mode: "throw", height: 1.2, speed: 9, angle: 28}]],
  'h10': [7,9].map((speed,i)=>{const p={mode:'throw',height:1.2,speed,angle:[30.66,36.56][i]};return [p,{...p,height:.3}];})
};
function measure(changes) {
  const p={...defaults,...changes};
  for(const [key,rule] of Object.entries(limits)){
    assert.ok(p[key]>=rule.min && p[key]<=rule.max && Number(p[key].toFixed(rule.decimals))===p[key],key);
  }
  return C.measurement(p,C.launch(p),p.mode==='throw'?C.bestRange(p):null);
}
function awarded(data,type='recorded') {return missions.filter(m=>m.check({type,data},{})).map(m=>m.id);}
function release(measurement,trialRole){
  return Object.freeze({...measurement,trialRole});
}
function compare(current,reference){
  return {...current,prior:reference};
}
function investigation(current,reference){
  return compare(release(current,'comparison'),release(reference,'reference'));
}
function recordSequence(entries,expected){
  const earned=new Set(),events=[];
  for(const [action,data] of entries){
    const matches=awarded(data),newAwards=matches.filter(id=>!earned.has(id));
    for(const id of matches)earned.add(id);
    events.push({action,matches,newAwards});
  }
  assert.deepEqual([...earned],expected,JSON.stringify(events));
  assert.deepEqual(events.slice(1).flatMap(event=>event.newAwards),[]);
  return events;
}
function verifyEventOrders(current,reference,describe){
  const independent=release(current,'single'), independentReference=release(reference,'single');
  const trial=release(current,'comparison'), baseline=release(reference,'reference');
  const compared=awarded(compare(trial,baseline));
  const reversed=awarded(investigation(reference,current));
  const geometryWinners=[...new Set([...compared,...reversed])];
  if(geometryWinners.length>1)assert.fail(JSON.stringify({case:describe(),compared,reversed}));
  const single=awarded(independent),singleRef=awarded(independentReference);
  if(single.length>1||singleRef.length>1)assert.fail(JSON.stringify({case:describe(),single,singleRef}));
  const wrongRoles=[
    trial,baseline,
    compare(independent,baseline),compare(trial,independentReference),
    compare(independent,independentReference),compare(baseline,trial)
  ];
  for(const candidate of wrongRoles){
    const awardedAgain=awarded(candidate);
    if(awardedAgain.length)assert.fail(JSON.stringify({case:describe(),current:candidate.trialRole,
      reference:candidate.prior?.trialRole,awardedAgain}));
  }
  const replayed=awarded(compare(trial,baseline));
  assert.deepEqual(replayed,compared);
  return {single,singleRef,compared,reversed};
}
function verifyConditions() {
  const has=(id,now,ref)=>awarded(ref?investigation(measure(now),measure(ref)):release(measure(now),'single')).includes(slug+'-'+id);
  const flat={mode:'throw',height:0,speed:9,angle:28},high={...flat,angle:62};
  assert.equal(limits.height.min,0);
  assert.ok(has('9',high,flat));
  for(const change of [{height:.01},{drag:true},{mode:'shot'}]){
    assert.ok(!has('9',{...high,...change},{...flat,...change}));
  }
  const [centred,baseline]=examples['10'][1],d=measure(centred);
  assert.ok(d.rimHit && !d.scored);
  assert.ok(has('10',centred,baseline)&&!has('10',centred)&&!has('10',{...centred,drag:true},baseline));
  assert.deepEqual(awarded(release(measure({mode:'throw',height:.70,speed:9.53,angle:40.66}),'single')),[slug+'-1']);
  assert.deepEqual(awarded(release(measure({height:2.60,distance:6.75,speed:8.41,angle:46.91}),'single')),[slug+'-3']);
  for(const extra of [.002,.045])assert.ok(has('10',...centrePair(4.23,2.20,extra)));
  const [highArc,lowArc]=examples['7'][0], [fastCurve,slowCurve]=examples.h4[0];
  assert.ok(has('7',highArc,lowArc)&&!has('7',lowArc,highArc)&&!has('h4',highArc,lowArc));
  assert.ok(has('h4',slowCurve,fastCurve)&&!has('7',fastCurve,slowCurve));
  const inside=measure({angle:29,speed:9.43}),outside=measure({angle:29,speed:9.45});
  assert.equal(inside.rimHit.side,'front');assert.equal(outside.rimHit.side,'front');
  assert.ok(inside.opening<2*C.ballRadius&&outside.opening<2*C.ballRadius);
  assert.ok(Math.abs(inside.crossing.x-inside.distance)<C.rimRadius-C.ballRadius);
  assert.ok(Math.abs(outside.crossing.x-outside.distance)>C.rimRadius-C.ballRadius);
  assert.ok(awarded(release(inside,'single')).includes(slug+'-h1'));
  assert.ok(!awarded(release(outside,'single')).includes(slug+'-h1'));
  const [drag,ideal]=examples.h7[0];
  assert.ok(has('h7',ideal,drag)&&!has('h7',drag));
  assert.ok(!has('h7',{...ideal,drag:true},ideal)); // Only the drag switch changed.
  assert.ok(!has('h7',{...drag,angle:30},ideal)&&!has('h7',drag,{...ideal,angle:30}));
}
function verify() {
  assert.equal(missions.length,20);
  assert.equal(new Set(missions.map(m=>m.id)).size,20);
  assert.equal(missions.filter(m=>m.hidden).length,10);
  assert.ok(missions.filter(m=>m.hidden&&m.level>=7).length>=3);
  for(const d of [measure({}),measure({mode:'throw',speed:11,angle:38,height:1.6})]){
    assert.deepEqual(awarded(release(d,'single')),[]);
    assert.deepEqual(awarded(investigation(d,d)),[]);
  }
  verifyConditions();
  const report=[];
  for(const m of missions){
    const key=m.id.slice(slug.length+1), witnesses=examples[key];
    assert.equal(witnesses.length,2);
    assert.notDeepEqual(witnesses[0][0],witnesses[1][0]);
    assert.doesNotMatch((m.title??m.riddle).en+(m.desc?.en??''),/\p{Script=Han}/u);
    for(const [now,reference] of witnesses){
      const prior=reference?measure(reference):null, current=measure(now);
      const d=prior?investigation(current,prior):release(current,'single');
      assert.deepEqual(awarded(d),[m.id],m.id+' 連帶判定');
      for(const type of ['preview','release','reference','clear'])assert.deepEqual(awarded(d,type),[]);
      if(prior)assert.ok(!awarded({...d,prior:null}).includes(m.id));
      if(!m.hidden){
        assert.ok(m.need({last:()=>d}).every(([ok])=>ok===true));
        assert.ok(m.need({last:()=>null}).some(([ok])=>ok!==true));
      }
      report.push({id:m.id,level:m.level,trialRole:d.trialRole,now:{...defaults,...now},prior:prior?{...defaults,...reference}:null,
        outcome:d.outcome,entry:d.crossing?.angle,margin:d.margin,range:d.R,peak:d.H,best:d.bestAngle,opening:d.opening});
    }
    console.log('✓ '+m.id+' · '+m.level+' 級 · 兩組獨立解');
  }
  console.log('20/20 題、40/40 組獨立解；投籃與擲遠預設、重複基準、自動事件皆未觸發。');
  return report;
}
// Invert the vacuum trajectory, then quantize to values accepted by the actual controls.
function centrePair(distance,height,extra=.003) {
  const speed=Number((Math.ceil(C.minimumSpeed(distance,height).speed*1000)/1000+extra).toFixed(3));
  const v2=speed*speed, rise=C.rimHeight-height;
  const tangent=(v2+Math.sqrt(v2*v2-C.g*(C.g*distance*distance+2*rise*v2)))/(C.g*distance);
  const angle=Number((Math.atan(tangent)*180/Math.PI).toFixed(2));
  const now={mode:'shot',drag:false,height,distance,speed,angle};
  return [now,{...now,speed:Number((speed-.105).toFixed(3))}];
}
function scanPositions(){
  let count=0, hits=0, maxError=0, worst=null;
  for(let hi=Math.round(limits.height.min*100);hi<=limits.height.max*100;hi++)
    for(let di=Math.round(limits.distance.min*100);di<=limits.distance.max*100;di++){
      const [now,ref]=centrePair(di/100,hi/100);
      const prior=measure(ref), current=measure(now);
      const result=awarded(investigation(current,prior));
      assert.deepEqual(result,[slug+'-10'],JSON.stringify({now,ref,result}));
      const error=Math.abs(current.crossing.x-now.distance);
      if(error>maxError){maxError=error;worst=now;}
      if(current.rimHit)hits++;
      count++;
    }
  assert.equal(count,211001);
  return {count,rimHits:hits,maxErrorMetres:maxError,worst};
}
function scanWitnessPairs(){
  const settings=new Map();
  function add(params){
    const complete={...defaults,...params};
    const key=[complete.mode,complete.drag,...Object.keys(limits).map(name=>complete[name])].join('/');
    if(!settings.has(key))settings.set(key,{params:complete,measurement:measure(complete)});
  }
  for(const witnesses of Object.values(examples))for(const pair of witnesses)for(const params of pair)add(params);
  const softball={mode:'throw',drag:false,height:1.2,speed:5},optimum={...softball,angle:35.67},mirror={...softball,angle:54.33};
  add(optimum);add(mirror);
  const reciprocal=verifyEventOrders(measure(optimum),measure(mirror),()=>({optimum,mirror}));
  assert.deepEqual(reciprocal.compared,[slug+'-6']);assert.deepEqual(reciprocal.reversed,[]);
  const [bank,direct]=examples.h5[0];
  const glass=verifyEventOrders(measure(bank),measure(direct),()=>({bank,direct}));
  assert.deepEqual(glass.single,[slug+'-5']);assert.deepEqual(glass.compared,[slug+'-h5']);assert.deepEqual(glass.reversed,[]);
  const [centre,slow]=examples['10'][0];
  const nearThreshold={...defaults,height:2.6,distance:6.75,speed:8.41,angle:46.91};
  const justSlower={...nearThreshold,speed:8.31};
  add(nearThreshold);add(justSlower);
  const threshold=verifyEventOrders(measure(nearThreshold),measure(justSlower),()=>({nearThreshold,justSlower}));
  assert.deepEqual(threshold.single,[slug+'-3']);assert.deepEqual(threshold.compared,[slug+'-10']);
  assert.deepEqual(awarded(investigation(measure(centre),measure(slow))),[slug+'-10']);
  const sequences={};
  for(const [label,final,first,soloId,pairedId] of [
    ['打板',bank,direct,'5','h5'],['框心',nearThreshold,justSlower,'3','10']
  ]){
    const solo=release(measure(final),'single'),reference=release(measure(first),'reference');
    const trial=release(measure(final),'comparison');
    sequences[label]={
      singleFirst:recordSequence([['記錄獨立出手',solo],['拿原單球與基準比較',compare(solo,reference)],
        ['拿原單球當作基準',compare(trial,solo)],['重播並記錄原單球',solo]],[slug+'-'+soloId]),
      compareFirst:recordSequence([['比較兩次控制試擲',compare(trial,reference)],['單獨記錄本球',trial],
        ['單獨記錄基準',reference],['兩球換位',compare(reference,trial)],['重播並比較',compare(trial,reference)]],[slug+'-'+pairedId])
    };
  }
  const boundaryValues={};
  for(const [key,rule] of Object.entries(limits)){
    const fineStep=10**(-rule.decimals);
    boundaryValues[key]=[rule.min,Number((rule.min+fineStep).toFixed(rule.decimals)),
      Number((rule.max-fineStep).toFixed(rule.decimals)),rule.max];
    for(const value of boundaryValues[key])for(const mode of ['shot','throw'])for(const drag of [false,true])add({mode,drag,[key]:value});
  }
  const observed=new Set();let pairs=0;
  for(const current of settings.values())for(const reference of settings.values()){
    const result=verifyEventOrders(current.measurement,reference.measurement,()=>({current:current.params,reference:reference.params}));
    for(const ids of Object.values(result))for(const id of ids)observed.add(id);
    if(current===reference)assert.deepEqual(result.compared,[]);
    pairs++;
  }
  assert.equal(observed.size,missions.length);
  return {settings:settings.size,pairs,missions:observed.size,wrongRoleChecks:pairs*6,reverseChecks:pairs,
    replayChecks:pairs,boundaryValues,regressions:{glass,threshold,reciprocal},sequences};
}
function scanPairs(){
  const seed=0x1120ba57;let word=seed;
  const rand=()=>{word^=word<<13;word^=word>>>17;word^=word<<5;return (word>>>0)/4294967296;};
  const pick=n=>Math.floor(rand()*n), keys=Object.keys(limits), totals={};
  const coverage=Object.fromEntries(keys.map(key=>[key,{minimum:0,maximum:0,offSliderGrid:0}]));
  let maximumConcurrent=0,maximumAcrossOrders=0;
  function sample(){
    const p={mode:pick(2)?'shot':'throw',drag:!!pick(2)};
    for(const key of keys){
      const r=limits[key],bin=pick(10),step=bin%2?r.step:10**-r.decimals;
      p[key]=bin===0?r.min:bin===1?r.max:Number((r.min+step*pick(1+Math.round((r.max-r.min)/step))).toFixed(r.decimals));
    }
    return p;
  }
  for(let i=0;i<20000;i++){
    let now=sample(),prev=sample();
    // Include correlated classroom trials as well as independent pairs and boundary values.
    switch(i%8){
      case 1: prev={...now,angle:prev.angle};break;
      case 2: prev={...now,speed:prev.speed};break;
      case 3: prev={...now,height:prev.height};break;
      case 4: prev={...now,drag:!now.drag,angle:prev.angle};break;
      case 5: prev={...now,angle:Number((90-now.angle).toFixed(2))};break;
      case 6: [now,prev]=centrePair(now.distance,now.height);break;
      case 7: prev={...now,drag:!now.drag,speed:prev.speed};break;
    }
    const cur=measure(now),ref=measure(prev);
    const checked=verifyEventOrders(cur,ref,()=>({seed:seed.toString(16),i,now,prev}));
    maximumAcrossOrders=Math.max(maximumAcrossOrders,new Set([...checked.compared,...checked.reversed]).size);
    for(const ids of [checked.single,checked.compared]){
      maximumConcurrent=Math.max(maximumConcurrent,ids.length);
      for(const id of ids)totals[id]=(totals[id]||0)+1;
    }
    for(const sample of [now,prev])for(const key of keys){
      const rule=limits[key],position=(sample[key]-rule.min)/rule.step;
      if(sample[key]===rule.min)coverage[key].minimum++;
      if(sample[key]===rule.max)coverage[key].maximum++;
      if(Math.abs(position-Math.round(position))>1e-7)coverage[key].offSliderGrid++;
    }
  }
  for(const key of keys){
    assert.ok(coverage[key].minimum>0&&coverage[key].maximum>0,key);
    if(limits[key].step>10**(-limits[key].decimals))assert.ok(coverage[key].offSliderGrid>0,key);
  }
  return {seed:'0x'+seed.toString(16),pairs:20000,singles:40000,wrongRoleChecks:20000*6,reverseChecks:20000,
    replayChecks:20000,maximumConcurrent,maximumAcrossOrders,coverage,totals};
}
function verifyAll(){
  const witnesses=verify(),crossEvents=scanWitnessPairs(),random=scanPairs(),positions=scanPositions();
  console.log(JSON.stringify({crossEvents,random,positions}));
  return {witnesses,crossEvents,random,positions};
}
if(require.main===module){
  const report=verifyAll();
  if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2));
}
module.exports={verify,verifyAll,examples,defaults,missions};
