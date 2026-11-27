/* 本站 20 題的手機可操作見證；直接執行或由 npm test 呼叫。 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../../js/career-decision-balance-core.js');
const slug = 'career-decision-balance';
let missions;
new Function('LabMission',fs.readFileSync(path.join(__dirname,'../../js/missions',slug+'.js'),'utf8'))({register:(_,list)=>{missions=list;}});
const axes = [0,1,2], kinds = ['score','chance','map','probe','explore','compare','plan'];
// If two submissions measure the same thing, cite incompatible results, including the
// baseline and evidence histories. For different submissions a single event has one type.
function exclusionProofs() {
  const reasons = {
    '1/h1':'有效考量數分別至少二項與恰一項。',
    '1/h2':'領先至少 0.20 分，與前兩名分差在平手容差之內互斥。',
    'h1/h2':'第一名唯一與最高分恰有兩人互斥。',
    '2/h3':'最近可翻盤的考量必有內部交點，三組同分的這條截線沒有翻盤點。',
    '2/h4':'最近可翻盤的考量必有內部交點，全段同一學群領先時沒有翻盤點。',
    'h3/h4':'同一項的三組評分全同與分數有差互斥。',
    '3/h5':'三比例和為一，全距至多 0.02 時，最大值至多 (1 + 2 × 0.02) / 3，低於 0.45。',
    '3/h6':'領先者勝率低於 0.60 與該學群全勝互斥。',
    'h5/h6':'全勝時三個比例全距為一，大於 0.02。',
    '4/8':'比對同一基準，前後不同學群單獨領先與同一學群單獨領先互斥。',
    '4/h7':'只調一項有正的占比變化，等比例縮放時所有占比相同。',
    '4/h9':'比對同一基準，更換首名與保持同一首名互斥。',
    '8/h7':'重新配置須有占比改變，全體等比例縮放則占比完全相同。',
    '8/h9':'多項相對改動與只調一項、其餘等比互斥。',
    'h7/h9':'全部占比維持原值與單項占比確有改變互斥。',
    '5/6':'同一學群的勝率不變與至少上升八個百分點互斥。',
    '5/7':'第七題須親存探索前的機率，跨過 80% 且提升量大於不變容差，第五題要求所有比例均在容差內。',
    '5/9':'同一組權重比對有活動與無活動，同一學群領先與不同學群領先互斥。',
    '5/h8':'不變的勝率無法下降八個百分點。',
    '6/7':'探索後勝率低於 80% 與至少 80% 互斥。',
    '6/9':'原本第一名維持與換成其他學群單獨領先互斥。',
    '6/h8':'同一領先學群的勝率上升至少八個百分點與下降至少八個百分點互斥。',
    '7/9':'固定相同權重與原始評分作基準，原本第一名維持與換人互斥。',
    '7/h8':'原本領先者從門檻下升到門檻上，與該學群機率下降互斥。',
    '9/h8':'探索後更換首名與維持同一學群單獨領先互斥。'
  };
  const pairs=[];
  for(let i=0;i<missions.length;i++)for(const b of missions.slice(i+1)){
    const a=missions[i], key=[a,b].map(m=>m.id.slice(slug.length+1)).join('/');
    const reason=a.readingType===b.readingType ? reasons[key] :
      '一次只提交一種量測。兩題分別須提交 '+a.readingType+' 與 '+b.readingType+'，同一判定不能同時採用兩段歷程。';
    assert(reason,'缺逐對證明 '+key);
    pairs.push({pair:key,group:a.hidden===b.hidden?(a.hidden?'hidden':'public'):'mixed',reason});
  }
  for(const [group,n] of [['public',45],['hidden',45],['mixed',100]])assert.equal(pairs.filter(p=>p.group===group).length,n);
  return pairs;
}
// Replay a recipe in the same order as the controls: save the baseline before changing
// the weights, compare exploration with the no-activity case, and read the chances
// before finishing a decision note. Edits and previews never submit a measurement.
function replayWitness(mission,r) {
  const type=mission.readingType, defaults=C.profiles[r.profile].weights;
  let raw=defaults, ids=[], baseline=null, savedView='score', sawChances=false;
  const sequence=['開啟案例'];
  function reading() {
    if(type==='compare'&&!baseline)return null;
    if((type==='explore'||type==='plan')&&!ids.length)return null;
    if(type==='plan'&&!sawChances)return null;
    const now=C.analyze(r.profile,raw,ids);
    const before=type==='compare'?baseline:type==='explore'||type==='plan'?C.analyze(r.profile,raw):now;
    return Object.assign(C.observation(now,before,r.k,axes,!!ids.length||!C.same(raw,defaults)),
      C.readingHistory(now,baseline,r.k,savedView));
  }
  const initial=reading();
  assert(!initial||!mission.check({type,data:initial}),mission.id+' 預設不能完成');
  if(mission.id===slug+'-7'){
    raw=r.raw;savedView='chance';baseline=C.analyze(r.profile,raw);
    sequence.push('設定見證權重，在未排活動的機率圖留作基準');
  }
  for(const id of r.ids)ids=C.addActivity(ids,id);
  assert.deepEqual(ids,r.ids);
  if(ids.length)sequence.push('依序加入見證活動');
  if(mission.id===slug+'-h4'){
    raw=axes.concat(3,4,5).map(i=>i===r.k?10:0);baseline=C.analyze(r.profile,raw,ids);
    sequence.push('讓見證考量獨占，記下首名並留作基準，再恢復見證權重');
  }
  if(type==='compare'){
    raw=r.baseRaw;assert.equal(reading(),null);
    baseline=C.analyze(r.profile,raw,ids);sequence.push('設定基準權重並儲存');
  }
  raw=r.raw;sequence.push('設定目前權重');
  if(type==='probe')sequence.push('選擇見證考量');
  if(type==='plan'){
    assert.equal(reading(),null);
    sawChances=true;sequence.push('檢視模擬首名比例');
  }
  const data=reading();assert(data);
  if(mission.id===slug+'-7' || mission.id===slug+'-h4'){
    baseline=null;assert(!mission.check({type,data:reading()}),'缺少先前的讀圖基準');
  }
  for(const other of ['input','change','reset','preview-'+type,...kinds.filter(k=>k!==type)])
    assert(!mission.check({type:other,data}),mission.id+' 只改值或做其他判讀不能授星');
  const hits=missions.filter(m=>m.check({type,data})).map(m=>m.id);
  assert.deepEqual(hits,[mission.id],JSON.stringify({mission:mission.id,r,sequence,hits}));
  sequence.push('提交 '+type);return sequence;
}
function verify(count = 20000) {
  const witnesses = new Map(), alternatives = new Map(), empiricalKeys = new Map();
  let checked = 0;
  function judge(type,d,recipe) {
    assert(Object.values(d).every(Number.isFinite),'任務只傳有限數值');
    const hits = missions.filter(m=>m.check({type,data:d}));
    assert(hits.length<=1,JSON.stringify({type,recipe,hits:hits.map(m=>m.id),d}));
    if (hits.length) {
      const id=hits[0].id, key=JSON.stringify([recipe.profile,C.normalize(recipe.raw).map(v=>+v.toFixed(5)),recipe.ids.slice().sort(),
        type==='compare'?C.normalize(recipe.baseRaw).map(v=>+v.toFixed(5)):null,type==='probe'?recipe.k:null]);
      if (!witnesses.has(id)) {witnesses.set(id,{type,...recipe});empiricalKeys.set(id,key);}
      else if (!alternatives.has(id) && key!==empiricalKeys.get(id)) alternatives.set(id,{type,...recipe});
      for(const other of ['change','preview-'+type,'reset'])assert(!hits[0].check({type:other,data:d}),'尚未提交指定判讀 '+id);
    }
    checked++;
    return hits.length;
  }
  function trial(p,raw,ids,baseRaw,k,types=kinds) {
    const now = C.analyze(p,raw,ids), baseline = C.analyze(p,baseRaw,ids);
    const bare = ids.length?C.analyze(p,raw):now;
    const revised = ids.length>0 || !C.same(C.profiles[p].weights,raw);
    const d = C.observation(now,baseline,k,axes,revised);
    const e = {...C.observation(now,bare,k,axes,revised),...C.readingHistory(now,bare,k,'chance')};
    // 只需計算獨占該考量時的解析排名。選出的兩組見證會重播完整的基準計算。
    const vertex={profile:p,w:raw.map((_,i)=>+(i===k)),ids,rank:C.ranking(now.model.mean.map(row=>row[k]))};
    const probe={...d,...C.readingHistory(now,vertex,k,'score')};
    const recipe = {profile:p,raw,ids,baseRaw,k};
    for (const type of types) judge(type,(type==='explore'||type==='plan')?e:type==='probe'?probe:d,recipe);
  }
  for (let p=0;p<3;p++) {
    const raw=C.profiles[p].weights, a=C.analyze(p,raw);
    for (let k=0;k<6;k++) {
      const d=C.observation(a,a,k,axes,false);
      for (const type of kinds) assert.equal(judge(type,d,{profile:p}),0,'預設誤觸');
    }
  }
  const init=C.profiles[0].weights;
  trial(0,[5,0,0,0,0,0],[],init,0);
  trial(0,[0,7,0,0,0,0],[],init,1);
  trial(0,[5,5,5,0,0,0],[],init,0);
  trial(0,[4,4,4,0,4,0],[],init,4);
  trial(0,init.map(v=>v/2),[],init,4);
  trial(0,[6,5,5,4,8,3],[],init,4);
  trial(0,[6,6,5,4,3,3],[],init,1);
  // UI 的「移到交界」保留完整精度，可在兩個學群的精確交界讀值。
  const start=C.analyze(0,init);
  const at=start.pivots[0].at;
  trial(0,C.sliderUnits(C.redistribute(start.w,0,at),C.sum(init)),[],init,0);
  const next=start.pivots[1].at;
  trial(0,C.sliderUnits(C.redistribute(start.w,1,next),C.sum(init)),[],init,1);
  for(const raw of [[8,2,0,0,0,0],[0,5,7,0,0,0]])trial(0,raw,[3],init,4);
  trial(0,[5,5,5,0,0,0],[3],init,4);
  // 從簡單整數權重開始，證明不需鍵盤輸入長小數即可找到探索解。
  const plans = [];
  for (let mask=0;mask<32;mask++) {
    const ids=C.activities.map((_,i)=>i).filter(i=>mask & (1<<i));
    if (C.hours(ids)<=20) plans.push(ids);
  }
  for(let p=0;p<3;p++) for(const ids of plans) {
    const base=C.profiles[p].weights;
    for(let k=0;k<6;k++) {
      const raw=base.slice(); raw[k]=Math.max(0,raw[k]-2);
      trial(p,raw,ids,base,k);
    }
  }
  let seed=0x61a7b329;
  const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  const pick=n=>Math.floor(random()*n);
  for(let n=0;n<count;n++) {
    const p=pick(3), k=pick(6), base=Array.from({length:6},()=>pick(11));
    if(!C.sum(base)) base[0]=1;
    const raw=base.slice();
    if(n%4===0) for(let j=0;j<6;j++) raw[j]=pick(11);
    else if(n%4===1) raw.forEach((v,i)=>{raw[i]=v/2;});
    else raw[k]=pick(11);
    if(!C.sum(raw)) raw[k]=1;
    trial(p,raw,plans[pick(plans.length)],base,k);
  }
  assert.equal(missions.length,20);
  assert.deepEqual(missions.filter(m=>!witnesses.has(m.id)).map(m=>m.id),[],'缺少可操作見證');
  assert.deepEqual(missions.filter(m=>!alternatives.has(m.id)).map(m=>m.id),[],'缺少不同的第二解');
  const histories=Object.fromEntries(missions.map(m=>[m.id,
    [witnesses.get(m.id),alternatives.get(m.id)].map(r=>replayWitness(m,r))]));
  // 在新自由度下也逐對驗證。每種設定都使用探索前後的真實讀數。
  const advanced=[];
  for(const settings of [{trials:200},{fixed:true},{sigma:{'0,1':0}},
    {floor:5},{floor:3.65},{fields:[17,14,9],trials:20000,seed:1729},
    {fields:[3,8,16],seed:431},{trials:20000,seed:73}]){
    const before=C.analyze(0,init,[],settings), now=C.analyze(0,init,[0],settings);
    let pairs=0, awards=0;
    for(const type of kinds){
      const data=C.observation(now,before,1,axes,true);
      assert(Object.values(data).every(Number.isFinite));
      const hit=missions.map(m=>m.check({type,data}));
      for(let i=0;i<hit.length;i++)for(let j=i+1;j<hit.length;j++){
        assert(!(hit[i]&&hit[j]),missions[i].id+' / '+missions[j].id);pairs++;
      }
      if(!now.missionReady || !before.missionReady)assert(!hit.some(Boolean));
      awards+=hit.filter(Boolean).length;
    }
    advanced.push({settings,pairs,awards});
  }
  return {count,checked,advanced,witnesses:Object.fromEntries(missions.map(m=>[m.id,witnesses.get(m.id)])),
    alternatives:Object.fromEntries(missions.map(m=>[m.id,alternatives.get(m.id)])),histories,pairs:exclusionProofs()};
}
if(require.main===module) {
  const result=verify();
  console.log(JSON.stringify(result,null,2));
}
module.exports={verify};
