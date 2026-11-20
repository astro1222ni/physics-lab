'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const E=require('../js/learn'),U=require('../js/learn/phy-5-1'),timings=require('../js/learn/phy-5-1-timings');
(async()=>{
  const src='甲[[a]]{{行|航}}乙[[b]]丙';assert.deepEqual(E.parseScript(src),{spoken:'甲航乙丙',display:'甲行乙丙',marks:{a:1,b:3}});
  assert.deepEqual(E.estimate(src),{dur:1.6,marks:{a:.25,b:.75}});
  assert.deepEqual(E.estimate('One two [[go]]three.','en'),{dur:1.754,marks:{go:.769}});
  for(const p of U.pages)for(const [j,lang] of ['zh','en'].entries()){
    const rec=timings[lang][p.id];assert.ok(rec.dur>=.6);
    if(timings.estimated)assert.deepEqual(rec,E.estimate(p.speech[j],lang),p.id+' '+lang);
    assert.deepEqual(Object.keys(E.parseScript(p.speech[0]).marks).sort(),Object.keys(E.parseScript(p.speech[1]).marks).sort());
  }
  for(const [text,value,opts] of [['１２３',123],['−２４２．４',-240,{relative:.01}],['1,200',1200],['3/4',.75],['75%',.75],['1.2e3',1200],['1.2×10^3',1200],['1.2 × 10 ^ −3',.0012],['750 g',.75,{unit:'kg'}],['0.05 V',50,{unit:'mV'}],['10 cm',.1,{unit:'m'}],['-0.24 kJ',-240,{unit:'J'}],['3/4 J',.75,{unit:'J'}]])assert.equal(await E.gradeNumber(text,value,opts),true,text);
  for(const [s,v,opts] of [['240',-240],['-239.99',-240,{unit:'J',relative:0}],['-243',-240,{relative:.01}],['-240 kg',-240,{unit:'J'}],['1/0',1],['1,20',120],['Infinity',9],['',0],['2+2',4],['1e99e9',3]])assert.equal(await E.gradeNumber(s,v,opts),false,s);
  let defs;const context={LabMission:{register:(id,list)=>{assert.equal(id,U.id);defs=list;}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/missions/learn-phy-5-1.js'),'utf8'),context);
  assert.equal(defs.length,25);assert.equal(defs.filter(m=>!m.hidden).reduce((s,m)=>s+m.level,0),54);
  assert.equal(defs[24].hidden,true);assert.equal(defs[24].studyStars,3);
  const {convert}=require('../tools/learn-timings.cjs'), sample={};
  for(const p of U.pages.filter(p=>!/^[57]-/.test(p.id))){
    const rec=E.estimate(p.speech[0]);sample[p.id]={...rec,audio:rec.dur-.6,est:true};
  }
  const converted=convert(sample);
  assert.equal(converted.estimated,false);assert.equal(Object.keys(converted.audio.zh).length,22);
  assert.deepEqual(converted.audio.en,{});assert.equal(convert({}).estimated,true);
  for(const p of U.pages){
    assert.deepEqual(converted.en[p.id],E.estimate(p.speech[1],'en'));
    assert.equal(converted.audio.zh[p.id],sample[p.id]?'audio/study/phy-5-1/'+p.id+'.m4a':undefined);
  }
  assert.throws(()=>convert({'5-1':sample['1-1']}));assert.throws(()=>convert({'1-1':{...sample['1-1'],marks:{}}}));
  defs.forEach((m,i)=>{assert.equal(m.study,true);assert.equal(m.check({type:'learn-progress',data:{}}),false);
    assert.equal(m.check({type:'learn-progress',data:{earned:{[i+1]:true}}}),true);});
  const registry={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/missions/index.js'),'utf8'),registry);
  assert.equal(registry.window.LAB_SUBJECT_OF(U.id),'phy');assert.ok(!registry.window.LAB_LIVE_MODULES.includes(U.id));assert.ok(!registry.window.LAB_MISSION_MODULES.some(x=>x.id===U.id));
  console.log('✓ 雙語對時、標記與念法、數值與單位、25 個學習任務及實驗排除');
})().catch(e=>{console.error(e);process.exitCode=1;});
