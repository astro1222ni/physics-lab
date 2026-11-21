'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),C=require(path.join(root,'js/sir-epidemic-core.js'));
const slug='sir-epidemic';
const source=file=>fs.readFileSync(path.join(root,file),'utf8');
let missions;
new Function('window',source('js/missions/'+slug+'.js'))({
  LabMission:{register(id,list){assert.equal(id,slug);missions=list;}}
});
// Each row is [R0, starting immunity %, mask reduction %, airflow reduction %, day].
// A solution gives the observed row first, then its optional saved reference.
const examples={
  1: [[[2.5,0,0,0,45]], [[3,0,0,0,40]]],
  2: [[[1.5,0,0,0,0]], [[1.2,0,0,0,0]]],
  3: [[[2,0,40,40,0]], [[2,0,30,40,0]]],
  4: [[[1.45,0,0,0,34]], [[1.55,0,0,0,31]]],
  5: [[[2.5,0,50,0,45]], [[2,16,20,22,18]]],
  6: [[[2,49,0,0,1]], [[2.5,59,0,0,1]]],
  7: [[[2.5,0,0,0,6], [4,0,0,0,6]], [[3,0,0,0,5], [5,0,0,0,5]]],
  8: [[[2.5,0,0,0,14]], [[3,0,0,0,12]]],
  9: [[[0.8,0,0,0,180], [1,0,0,0,0]], [[0.7,0,0,0,180], [1,0,0,0,0]]],
  10: [[[2.5,0,0,0,17], [4,0,0,0,17]], [[3,0,0,0,15], [4,0,0,0,15]]],
  h1: [[[0.8,0,0,0,44], [0.8,0,0,0,43]], [[0.7,0,0,0,29], [0.7,0,0,0,28]]],
  h2: [[[2.5,0,0,0,17], [2.5,0,0,0,16]], [[3,0,0,0,14], [3,0,0,0,13]]],
  h3: [[[1.5,0,0,0,36], [1.5,0,0,0,29]], [[1.3,0,0,0,41], [1.3,0,0,0,34]]],
  h4: [[[1.4,0,0,0,78], [1.4,0,0,0,77]], [[2.2,0,0,0,21], [2.2,0,0,0,20]]],
  h5: [[[2.5,0,0,0,80], [2.5,0,0,0,4]], [[3,0,0,0,72], [3,0,0,0,3]]],
  h6: [[[2.5,0,30,0,10], [2.5,0,0,30,10]], [[2,0,0,0,10], [2.5,0,20,0,10]]],
  h7: [[[2,0,0,0,25], [3,33,0,0,25]], [[3,33,0,0,23], [2,0,0,0,23]]],
  h8: [[[2.5,0,0,0,18], [1.5,0,0,0,18]], [[3,0,0,0,15], [2,0,0,0,15]]],
  h9: [[[2,0,40,40,1], [2,0,0,0,1]], [[2,0,30,40,1], [2,0,0,0,1]]],
  h10: [[[2.5,0,0,0,17], [2.5,0,0,0,13]], [[3,0,0,0,13], [3,0,0,0,10]]]
};
const keys=['basic','immune','mask','air','day'], html=source(slug+'.html');
const ranges=keys.map(key=>{
  const tag=html.match(new RegExp('<input[^>]+id="'+key+'"[^>]*>'))[0];
  const attr=name=>Number(tag.match(new RegExp(name+'="([^"]+)"'))[1]);
  return {min:attr('min'),max:attr('max'),step:attr('step'),decimals:attr('data-decimals'),value:attr('value')};
});
const runs=new Map();
function measure(row) {
  row.forEach((v,i)=>{
    const r=ranges[i];
    assert.ok(v>=r.min && v<=r.max && v===Number(v.toFixed(r.decimals)),keys[i]);
  });
  const [basic,im,ma,ai,day]=row, key=row.slice(0,4).join(',');
  const params={basic,immune:im/100,mask:ma/100,air:ai/100};
  if(!runs.has(key)) {
    if(runs.size>=128) runs.delete(runs.keys().next().value);
    runs.set(key,C.simulate(params));
  }
  const d=C.measurement(params,runs.get(key),day);
  // A positive whole-school headcount guarantees a class can be inspected.
  return {...d,inspectedClass:d.counts.i>0,comparing:true};
}
const earned=(payload,type='recorded')=>missions.filter(m=>m.check({type,data:payload},{})).map(m=>m.id);
assert.equal(missions.length,20);assert.equal(new Set(missions.map(m=>m.id)).size,20);
const secrets=missions.filter(m=>m.hidden);
assert.equal(secrets.length,10);assert.ok(secrets.filter(m=>m.level>=7).length>=3);
assert.ok(secrets.every(m=>m.level>=3 && m.level<=10));
const defaults=ranges.map(r=>r.value), initial=measure(defaults);
assert.deepEqual(earned({...initial,prior:null}),[]);
assert.deepEqual(earned({...initial,prior:initial}),[]);
const capture=(now,ref)=>earned({...measure(now),prior:ref?measure(ref):null});
assert.deepEqual(capture([1.5,0,0,0,0],[4,0,0,0,0]),[]);
assert.deepEqual(capture([2.5,0,50,0,41],[2.5,0,50,0,40]),[slug+'-h2']);
assert.deepEqual(capture([2.5,0,0,50,41],[2.5,0,50,0,40]),[]);
assert.deepEqual(capture([1.02,0,0,0,5],[1.02,0,0,0,4]),[slug+'-h2']);
assert.deepEqual(capture([2,50,0,0,1]),[]);
// A date and a record click alone never solve the three reviewed tasks.
for(let day=0;day<=180;day++) {
  const d={...measure([...defaults.slice(0,4),day]),inspectedClass:false,comparing:false};
  assert.deepEqual(earned({...d,prior:null}),[]);
  for(const id of ['5','8','h5']) assert.ok(!earned({...d,prior:initial}).includes(slug+'-'+id));
  assert.deepEqual(earned({...d,prior:null},'observed'),[]);
}
assert.deepEqual(capture([2.5,0,0,0,58],[2.5,0,0,0,57]),[slug+'-h1']);
assert.deepEqual(earned({...measure([2.5,0,0,0,58]),prior:measure([2.5,0,0,0,57])},'observed'),[]);
assert.deepEqual(capture([2.5,0,80,80,0]),[]);
assert.deepEqual(capture([2.5,0,80,20,3],[2.5,0,20,80,3]),[slug+'-h6']);
for(const day of [0,1,90,180]) {
  assert.deepEqual(capture([2.5,0,80,50,day],[2.5,0,50,80,day]),[slug+'-h6']);
}
for(const school of [{classes:4,size:20},{classes:16,size:45,varied:true,seed:876}]) {
  const cfg={...initial,school},run=C.simulate(cfg),d=C.measurement(cfg,run,0);
  assert.deepEqual(earned({...d,prior:null}),[]);
  for(const p of run.points) assert.deepEqual(earned(C.measurement(cfg,run,p.day),'observed'),[]);
}
// A rapidly suppressed outbreak has a few uniforms left on day three, but never grew.
assert.deepEqual(capture([2.5,0,80,80,3]),[]);
const awards=(id,now,ref)=>earned({...measure(now),prior:ref?measure(ref):null}).includes(slug+'-'+id);
assert.ok(!awards('2',[2.5,0,80,80,0]));
assert.ok(!awards('5',[2.5,0,0,0,45]));
assert.ok(!awards('5',[2,16,20,22,0]));
assert.ok(!awards('h2',[2.5,0,0,0,17],[2.5,0,0,0,15]));
assert.ok(!awards('h10',[1.2,0,0,0,40],[2.5,0,0,0,40]));
assert.ok(ranges[0].step<=.01);
for (const [row] of examples[4]) {
  const sliderSteps=(row[0]-ranges[0].min)/ranges[0].step;
  assert.ok(Math.abs(Math.round(sliderSteps)-sliderSteps)<1e-9);
}
const results=[];
for(const m of missions) {
  const key=m.id.slice(slug.length+1),solutions=examples[key];
  assert.equal(solutions.length,2);
  assert.notDeepEqual(solutions[0][0].slice(0,4),solutions[1][0].slice(0,4));
  assert.ok(m.need({last:()=>null}).length);
  for(const [now,ref] of solutions) {
    for(const row of [now,ref].filter(Boolean)) row.forEach((v,i)=>{
      const ticks=(v-ranges[i].min)/ranges[i].step;
      assert.ok(Math.abs(ticks-Math.round(ticks))<1e-8,'off-slider witness: '+row);
    });
    const d={...measure(now),prior:ref?measure(ref):null};
    assert.deepEqual(earned(d),[m.id],m.id+' '+JSON.stringify(now));
    for(const type of ['observed','automatic','reference']) assert.deepEqual(earned(d,type),[]);
    if(ref)assert.ok(!earned({...d,prior:null}).includes(m.id));
    const hints=m.need({last:()=>d});
    assert.ok(hints.every(([ok,zh,en])=>ok!==false && !!zh && !!en && !/\p{Script=Han}/u.test(en)));
    assert.doesNotMatch((m.title??m.riddle).en+(m.desc?.en??''),/\p{Script=Han}/u);
    results.push({id:m.id,level:m.level,now,ref:ref||null,day:d.day,counts:d.counts,
      re:d.re,initialRe:d.initialRe,effective:d.effective,infectious:d.i,dailyIncidence:d.dailyIncidence,
      cumulativeInfected:d.cumulativeInfected,dailyNew:d.dailyNew,peak:d.peak,peakDay:d.peakDay,reCrossDay:d.reCrossDay,
      threshold:d.threshold,effectiveThreshold:d.effectiveThreshold,finalInfected:d.finalInfected,finalNonSusceptible:d.finalNonSusceptible});
  }
}
// The reviewer's day-one counterexample and post-peak observation must each earn exactly one award.
for(const basic of [1.998,1.999,2.001,2.002]) assert.deepEqual(capture([basic,49,0,0,1]),[slug+'-6']);
for(const basic of [1.997,2.003]) assert.deepEqual(capture([basic,49,0,0,1]),[]);
const dayOne=[1.02,0,0,0,1], postPeak=[2.5,0,40,0,40];
assert.deepEqual(capture(dayOne),[slug+'-8']);
assert.deepEqual(capture([1.02,0,0,0,0]),[slug+'-2']);
assert.ok(!awards('8',[1.02,0,0,0,4]));
assert.deepEqual(capture(postPeak),[slug+'-5']);
const checkHint=(n,now,ref)=>{
  const d={...measure(now),prior:ref?measure(ref):null};
  const hint=missions.find(m=>m.id===slug+'-'+n).need({last:()=>d});
  assert.ok(hint.some(([ok,zh,en])=>ok===null && zh.includes('記錄讀數') && en.includes('Record readings')));
  return hint;
};
assert.match(JSON.stringify(checkHint(8,dayOne)),/0\.2019600%.*0\.2019019%/);
checkHint(10,...examples[10][0]);

// Submit each real witness through the same casebook as the page. Seek a second,
// independently valid award after a date, reference or view change on the same setup.
let eventPairs=0, competingPairs=0;
const payload=(row,ref)=>({...measure(row),prior:ref?measure(ref):null});
function submit(book,d) {
  const candidates=earned({...d,caseMission:null});
  const owner=book.record(d,candidates);
  return earned({...d,caseMission:owner});
}
const caseReport=[];
for(const m of missions) for(const [row,ref] of examples[m.id.slice(slug.length+1)]) {
  const book=C.casebook(), first=payload(row,ref);
  assert.deepEqual(submit(book,first),[m.id]);
  const competitors=new Set();
  for(const other of missions) for(const [later,otherRef] of examples[other.id.slice(slug.length+1)]) {
    // Keep the current setup even when the other mission's witness used different parameters.
    const nextRow=[...row.slice(0,4),later[4]], references=[otherRef,null,row];
    for(const r of references) {
      const d=payload(nextRow,r);
      const theoretical=earned(d);
      if(theoretical.some(id=>id!==m.id)) {competingPairs++;competitors.add(theoretical[0]);}
      // Switching the display, clearing and replacing a reference are observable events, not new cases.
      for(const type of ['observed','reference','view']) assert.deepEqual(earned({...d,caseMission:book.owner(d)},type),[]);
      assert.ok(submit(book,d).every(id=>id===m.id));
      eventPairs++;
    }
  }
  caseReport.push({first:m.id,setup:row.slice(0,4),prevented:[...competitors]});
}
const reuse=C.casebook();
assert.deepEqual(submit(reuse,payload(dayOne)),[slug+'-8']);
const crossing=payload([1.02,0,0,0,5],[1.02,0,0,0,4]);
assert.deepEqual(earned(crossing),[slug+'-h2']);
assert.deepEqual(submit(reuse,crossing),[]);
assert.deepEqual(submit(reuse,payload(postPeak)),[slug+'-5']);
assert.deepEqual(submit(C.casebook(reuse.entries()),crossing),[]);
assert.ok(competingPairs>0);
// Cross every witness with every other witness at the same day and across
// adjacent days. Include ripening/decaying tails and both sides of Re = 1.
const samples=[...new Map(Object.values(examples).flat(2).map(row=>[row.slice(0,4).join(','),row.slice(0,4)])).values()];
let crosschecks=0;
for(const a of samples)for(const b of samples)for(const day of [0,1,5,9,13,14,16,17,21,25,32,40,60,180]) {
  const d=measure([...a,day]);
  for(const before of new Set([0,Math.max(0,day-1),day])) {
    const payload={...d,prior:measure([...b,before])};
    assert.ok(earned(payload).length<=1,JSON.stringify({a,b,day,before,earned:earned(payload)}));
    crosschecks++;
  }
}
// Deliberately sample both independent scenarios and correlated actions that a pupil
// can take: revisit a day, bracket a crossing or change one control on the saved date.
const seed=0x53495233;
let rng=seed;
function integer(max) {
  rng=(Math.imul(1664525,rng)+1013904223)>>>0;
  return Math.floor(rng/0x100000000*(max+1));
}
const boundaries=ranges.map(()=>new Set());
const offStep=ranges.map(()=>0);
function draw(i,fine) {
  const r=ranges[i],unit=fine?10**(-r.decimals):r.step,steps=Math.round((r.max-r.min)/unit);
  const edge=integer(15),k=edge===0?0:edge===1?steps:edge===2?1:edge===3?steps-1:integer(steps);
  const value=Number((r.min+k*unit).toFixed(r.decimals));
  const tick=(value-r.min)/r.step; if(Math.abs(tick-Math.round(tick))>1e-8) offStep[i]++;
  if(k===0||k===steps) boundaries[i].add(value);
  return value;
}
const pairs=40000;
for(let n=0;n<pairs;n++) {
  const fine=n>=pairs/2;
  const before=keys.map((_,i)=>draw(i,fine));
  let after=keys.map((_,i)=>draw(i,fine));
  const ref=measure(before);
  switch(n%6) {
    case 0: break;
    case 1: after[4]=before[4];break;
    case 2: after=[after[0],...before.slice(1)];break;
    case 3: after=[...before.slice(0,4),after[4]];break;
    case 4: after=[...before.slice(0,4),Math.min(180,before[4]+1)];break;
    case 5:
      if(ref.reCrossDay!==null) {
        after=[...before.slice(0,4),Math.ceil(ref.reCrossDay)];
        before[4]=after[4]-1;
      } else {after[4]=before[4];after[1]=before[1];}
      break;
  }
  const current=measure(after);
  for(const prior of [measure(before),null]) {
    const hits=earned({...current,prior});
    assert.ok(hits.length<=1,JSON.stringify({seed,n,before:prior?before:null,after,hits}));
  }
}
assert.ok(boundaries.every((bound,i)=>bound.has(ranges[i].min)&&bound.has(ranges[i].max)));
assert.ok(offStep.slice(0,4).every(n=>n>0));
// Exercise school identity at the same resolution as the UI: use real simulations
// for whole days, class-local starts, no mixing, equal and uneven enrolment.
const schoolRuns=[];
for(const cfg of [{classes:4,size:20},{classes:11,size:34,varied:true,seed:5},{classes:16,size:45,varied:true,seed:739}]) {
  for(const mixing of [0,.078,.5]) for(const origin of [-1,1]) {
    for(const [basic,immune,mask,air] of [[2.5,0,0,0],[2,.16,.20,.22],[1.5,0,.1,.15]]) {
      const settings={basic,immune,mask,air,school:cfg,mixing,origin};
      const run=C.simulate(settings);
      schoolRuns.push(day=>C.measurement(settings,run,day));
    }
  }
}
for(let k=0;k<20000;k++) {
  const now=schoolRuns[integer(schoolRuns.length-1)], other=schoolRuns[integer(schoolRuns.length-1)];
  const day=integer(180), prior=k%3===0?null:(k%3===1?now:other)(integer(1)?day:Math.max(day-1,0));
  const d={...now(day),prior,comparing:!!integer(1)};
  assert.ok(earned(d).length<=1,JSON.stringify({k,day,hits:earned(d)}));
  assert.deepEqual(earned(d,'observed'),[]);
}
const scan={schoolChecks:20000,schoolRuns:schoolRuns.length,seed,pairs,nativePairs:pairs/2,manualPairs:pairs/2,offStep,eventPairs,competingPairs,caseReport,singleRecords:pairs,checksPerRecord:missions.length,boundaries:boundaries.map(a=>[...a].sort((a,b)=>a-b))};
if(process.argv.includes('--json')) console.log(JSON.stringify({results,crosschecks,scan},null,2));
else {
  for(const m of missions)console.log(m.id+'　等級 '+m.level+'　兩組手機滑桿解各自單獨完成');
  console.log('另通過 '+schoolRuns.length+' 組非標準校況的 20,000 筆掃描、預設 181 天選日、只播放、交換兩項防治和第 57→58 天點名。');
  console.log('通過 20 題、40 組單獨解、預設與非記錄事件零觸發。全題互斥：固定種子 '+seed+'，'+pairs+' 組基準配對、'+pairs+' 筆單獨記錄、'+crosschecks+' 組見證交叉比較，另驗 '+eventPairs+' 組連續記錄（其中 '+competingPairs+' 組第二次原本符合不同題）。');
}
