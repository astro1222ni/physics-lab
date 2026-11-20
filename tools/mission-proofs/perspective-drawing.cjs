'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),slug='perspective-drawing';
const C=require(path.join(root,'js',slug+'-core.js'));
let missions;
new Function('window',fs.readFileSync(path.join(root,'js/missions',slug+'.js'),'utf8'))({
  LabMission:{register(id,list){assert.equal(id,slug);missions=list;}}});
const html=fs.readFileSync(path.join(root,slug+'.html'),'utf8');
const ranges={};
for(const m of html.matchAll(/<input type="range"[^>]+>/g)){
  const attr=n=>m[0].match(new RegExp(' '+n+'="([^"]+)"'))[1];
  ranges[attr('id')]={min:+attr('min'),max:+attr('max'),dec:+attr('data-decimals'),step:+attr('step')};
}
function state(p,aspect){
  const r=C.view(p,aspect);
  for(const [key,range] of Object.entries(ranges)){
    const v=r.p[key];assert.ok(v>=range.min && v<=range.max && Math.abs(v*10**range.dec-Math.round(v*10**range.dec))<1e-6,key+' 超出介面精度');
  }
  return r;
}
const samples={
  1:[[{yaw:16}],[{yaw:-21}]],
  2:[[{yaw:14,pitch:12}],[{yaw:-20,pitch:18}]],
  3:[[{z:6.7,size:2},{z:9,size:2}],[{z:8,size:2.4},{z:11,size:2.4}]],
  4:[[{yaw:40,fov:112}],[{yaw:-48,fov:116}]],
  5:[[{yaw:8,pitch:51,fov:122}],[{yaw:-12,pitch:52,fov:124}]],
  6:[[{x:-3.65},{}],[{x:-2.9,z:9},{x:-1.5,z:9}]],
  7:[[{size:2.2,z:12.9},{size:2.2,z:7}],[{size:2,z:15},{size:2,z:8}]],
  8:[[{yaw:12,x:-1.5,size:1.4,z:6,fov:94},{yaw:12,x:-3,size:2.8,z:12,fov:94}],[{x:0,size:1,z:5},{x:0,size:2,z:10}]],
  9:[[{size:1.8,z:4.4},{size:1.8,z:13}],[{size:2.2,z:5.6},{size:2.2,z:14}]],
  10:[[{yaw:21,pitch:-16},{yaw:21,pitch:16}],[{yaw:-25,pitch:-13},{yaw:-25,pitch:13}]],
  h1:[[{x:1.15},{x:-2.7}],[{yaw:8,x:.5,fov:88},{yaw:8,x:-2.35,fov:88}]],
  h2:[[{yaw:34,fov:54}],[{yaw:-36,fov:55}]],
  h3:[[{yaw:9,pitch:-16}],[{yaw:-11,pitch:-20}]],
  h4:[[{yaw:0,pitch:52,fov:120}],[{yaw:0,pitch:53,fov:122}]],
  h5:[[{yaw:45,fov:111}],[{yaw:-45,fov:106}]],
  h6:[[{yaw:10,pitch:8,fov:100},{yaw:10,pitch:8,fov:46}],[{yaw:-16,pitch:-11,fov:112},{yaw:-16,pitch:-11,fov:48}]],
  h7:[[{yaw:53,fov:116},{yaw:37,fov:116}],[{yaw:39,fov:112},{yaw:51,fov:112}]],
  h8:[[{pitch:17}],[{pitch:-14,fov:84}]],
  h9:[[{yaw:8,pitch:18},{yaw:8,pitch:-18}],[{yaw:-11,pitch:13},{yaw:-11,pitch:-13}]],
  h10:[[{size:2.1,z:9,x:-2.25},{size:2.8,z:12,x:-3}],[{size:1.6,z:6,x:-1.6},{size:2.4,z:9,x:-2.4}]]
};
const earned=(type,data)=>missions.filter(m=>m.check({type,data},{})).map(m=>m.id);
function traces(r){
  const edges=C.traceable(r), pairs=[];
  for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
    pairs.push(C.trace(edges[i],edges[j],r));
  }
  return pairs;
}
assert.equal(missions.length,20);assert.equal(missions.filter(m=>m.hidden).length,10);
assert.ok(missions.filter(m=>m.hidden && m.level>=7).length>=3);
for(const aspect of [1.22,1.60]){
  const r=state({},aspect),d={...C.measure(r),prior:null,trace:null};
  for(const t of ['preview','recorded','traced'])assert.deepEqual(earned(t,d),[]);
  for(const trace of traces(r))for(const type of ['traced','recorded'])
    assert.deepEqual(earned(type,{...d,trace,families:[2]}),[],'預設構圖描任意兩邊再記錄');
}
for(const m of missions){
  const id=m.id.slice(slug.length+1), event=m.hidden?'traced':'recorded';
  assert.doesNotMatch((m.title??m.riddle).en+(m.desc?.en??''),/\p{Script=Han}/u);
  assert.ok(m.need({seq:()=>0,last:()=>null}).length);
  for(const aspect of [1.22,1.60])for(const [p,old] of samples[id]){
    const r=state(p,aspect),prior=old?C.measure(state(old,aspect)):null;
    const data={...C.measure(r),prior,trace:null};
    if(id==='4'){
      const options=traces(r);
      data.families=[0,2].map(k=>options.find(t=>t.axis===k&&t.onPaper)?.axis);
      assert.deepEqual(data.families,[0,2]);
      data.trace=options.find(t=>t.axis===2&&t.onPaper);data.widthTrace=options.find(t=>t.axis===0&&t.onPaper);
      assert.ok(data.fov>90 && data.horizontalInterior===2);
      assert.equal(earned(event,{...C.measure(state({yaw:45,fov:90},aspect)),prior:null,trace:null}).includes(m.id),false);
    }
    if(id==='5'){
      assert.ok(Math.abs(data.pitch)>=90-data.verticalFov/2);
      const lower=C.measure(state({...p,pitch:Math.sign(data.pitch)*20},aspect));
      assert.equal(earned(event,{...lower,prior:null,trace:null}).includes(m.id),false);
    }
    if(id==='8' || id==='h10'){
      assert.equal(data.pitch,0);assert.equal(prior.pitch,0);
      const k=data.realHeight/prior.realHeight;
      assert.ok(Math.abs(data.x-prior.x*k)<1e-8 && Math.abs(data.z-prior.z*k)<1e-8);
    }
    if(m.hidden) {
      const options=traces(r);
      // 每一對可描邊都查；任何一次描圖至多完成一個隱藏任務。
      for(const trace of options)assert.ok(earned(event,{...data,trace}).length<=1,id+' 連帶');
      data.trace=options.find(trace=>earned(event,{...data,trace}).includes(m.id));
      assert.ok(data.trace,id+' 缺少畫紙上可點選的解：'+JSON.stringify(p)+' 紙幅 '+aspect);
    } else if(['1','2','5','6'].includes(id)) {
      data.trace=traces(r).find(trace=>earned('traced',{...data,trace}).length===0 &&
        earned('recorded',{...data,trace}).includes(m.id));
      assert.ok(data.trace,id+' 需要真實邊線的交點');
      assert.ok(!earned(event,{...data,trace:null}).includes(m.id),'應先描圖再記錄');
    }
    if(['6','h1','h3'].includes(id)){
      assert.ok(!earned(event,{...data,trace:null}).includes(m.id),'只調參數不算實際描線');
      if(id!=='h3')assert.ok(!earned(event,{...data,prior:null}).includes(m.id),'必須有前後兩次狀態');
    }
    if(id==='8' || id==='h10'){
      for(const [now,baseline] of [[{...p,x:p.x===0?.7:old.x},old],[{...p,pitch:8},{...old,pitch:8}]]){
        const wrong=state(now,aspect),oldData=C.measure(state(baseline,aspect));
        const without={...C.measure(wrong),prior:oldData,trace:null};
        const candidates=m.hidden?traces(wrong):[null];
        for(const choice of candidates)assert.ok(!earned(event,{...without,trace:choice}).includes(m.id),'錯誤縮尺不得得星');
      }
    }
    assert.deepEqual(earned(event,data),[m.id],id+' 的證例要單獨完成');
    assert.deepEqual(earned('preview',data),[]);
    if(!m.hidden){
      const need=m.need({seq:t=>t==='recorded'?2:0,last:()=>data});
      assert.ok(need.every(s=>s[0]!==false),id+' 的提示與判定不符');
    }
    console.log(JSON.stringify({id:m.id,level:m.level,aspect,now:p,prior:old??null,edges:data.trace?.ids??null,widthEdges:data.widthTrace?.ids??null,
      heightRatio:data.heightRatio,verticalInside:data.verticalInside,horizontalInside:data.horizontalInside,
      horizontalFov:data.fov,verticalFov:data.verticalFov,minVerticalTilt:90-data.verticalFov/2,horizontalInterior:data.horizontalInterior}));
  }
}
// Replay each reported action sequence, including the following record on the same sketch.
for(const aspect of [1.22,1.6]){
  function replay(p,old){
    const r=state(p,aspect),d={...C.measure(r),prior:old?C.measure(state(old,aspect)):null};
    return {d,options:traces(r)};
  }
  const half=replay({yaw:40,fov:112,x:-1.5,z:6,size:1.4},{yaw:40,fov:112,x:-3,z:12,size:2.8});
  assert.deepEqual(earned('recorded',{...half.d,families:[0,2]}),[slug+'-8']);
  const roads=replay({x:-.9},{});
  const trace=roads.options.find(t=>t.owners.every(o=>o==='street'));
  assert.ok(trace);assert.deepEqual(earned('recorded',{...roads.d,trace}),[],'兩條固定路緣不可代替畫室');
  for(const key of ['h4','h10']){
    const [now,old]=samples[key][0],{d,options}=replay(now,old);
    const trace=options.find(t=>earned('traced',{...d,trace:t}).includes(slug+'-'+key));
    assert.ok(trace);assert.deepEqual(earned('recorded',{...d,trace}),[],'同一成果接著記錄');
  }
  const oldHalf=replay({x:-1.5,z:7,size:1.4},{x:-3,z:14,size:2.8});
  for(const trace of oldHalf.options)assert.ok(!earned('traced',{...oldHalf.d,trace}).includes(slug+'-h10'));
  const hidden=C.view({x:5.15,z:15,size:2.6},aspect);
  assert.equal(C.measure(hidden).heightRatio,null);assert.ok(C.traceable(hidden).every(e=>e.owner!=='A'));
}
// On the reviewer’s exact composition, record after changing the selected pair, in both orders.
for(const aspect of [1.22,1.60]){
  for(const [yaw,id] of [[45,'h5'],[40,'4']]){
    const r=state({yaw,fov:111},aspect),data={...C.measure(r),prior:null,families:[],trace:null};
    const pairs=traces(r),width=pairs.find(t=>t.ids.includes('A-base')&&t.ids.includes('A-eave'));
    const road=pairs.find(t=>t.ids.every(edge=>edge.startsWith('street-')));
    assert.ok(width&&road);
    for(const sequence of [[width,road,width],[road,width,road]]){
      data.families=[];const awards=new Set();
      for(const selected of sequence){
        data.trace=null;
        earned('recorded',data).forEach(a=>awards.add(a));
        data.trace=selected;
        if(!data.families.includes(selected.axis))data.families.push(selected.axis);
        for(const type of ['traced','recorded'])earned(type,data).forEach(a=>awards.add(a));
      }
      assert.deepEqual([...awards],[slug+'-'+id]);
    }
  }
}
const initialSeed=0x35445044;
let seed=initialSeed;
function rand(n){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return Math.floor(seed/4294967296*n);}
function lattice(i,fine){
  return Object.fromEntries(Object.entries(ranges).map(([k,r],j)=>{
    const delta=fine?10**-r.dec:r.step,count=Math.round((r.max-r.min)/delta);
    const tick=(i+j)%19===0?0:(i+j)%19===1?count:rand(count+1);
    return [k,+(r.min+tick*delta).toFixed(r.dec)];
  }));
}
const metrics={slider:0,direct:0,boundary:0,offGrid:{},pairs:0,events:0,maxMissionsPerSequence:0};
const hits={slider:new Set(),direct:new Set(),boundary:new Set()};
function scan(group,now,baseline,aspect,allHistories=false){
  const r=state(now,aspect),data={...C.measure(r),prior:baseline?C.measure(state(baseline,aspect)):null,trace:null,families:[]};
  const pairs=traces(r),available=[0,2].filter(k=>pairs.some(t=>t.axis===k&&t.onPaper));
  // Every rule that reads history uses positive includes(). The maximal reachable history covers
  // every shorter ordering. For boundary cases also replay each exact subset and a cleared pair.
  const histories=allHistories?[[],...available.map(k=>[k]),...(available.length===2?[available]:[])]:[available];
  const reached=new Map();
  for(const families of histories){
    data.families=families;
    for(const trace of [null,...pairs]){
      if(trace?.onPaper&&[0,2].includes(trace.axis)&&!families.includes(trace.axis))continue;
      data.trace=trace;
      for(const type of trace?['traced','recorded']:['recorded']){
        metrics.events++;
        for(const id of earned(type,data)){
          if(!reached.has(id))reached.set(id,{type,edges:trace?.ids,families});
          hits[group].add(id);
        }
      }
    }
  }
  metrics[group]++;metrics.pairs+=pairs.length;metrics.maxMissionsPerSequence=Math.max(reached.size,metrics.maxMissionsPerSequence);
  if(reached.size>1)assert.fail(JSON.stringify({initialSeed,group,aspect,baseline,now,actions:[...reached]}));
  if(group==='direct')for(const [key,r] of Object.entries(ranges)){
    const off=v=>Math.abs((v-r.min)/r.step-Math.round((v-r.min)/r.step))>1e-6;
    if(off(now[key])||(baseline&&off(baseline[key])))metrics.offGrid[key]=(metrics.offGrid[key]||0)+1;
  }
}
for(const [group,fine] of [['slider',false],['direct',true]]){
  for(let i=0;i<20000;i++){
    const aspect=[1.22,1.60][i%2],id=Object.keys(samples)[Math.floor(i/2)%20];
    let baseline=lattice(2*i,fine),now=lattice(2*i+1,fine),withRef=!!(i%3);
    if(i%7===0){const [p,b]=samples[id][rand(2)];now={...C.defaults,...p};baseline={...C.defaults,...b};withRef=!!b;}
    else if(i%5===0)now={...baseline,...Object.fromEntries(Object.entries(now).filter((_,j)=>j===i%6))};
    else if(i%4===0){now.pitch=0;baseline.pitch=0;}
    scan(group,now,withRef?baseline:null,aspect,i<80);
  }
  assert.equal(hits[group].size,20,group+' 必須涵蓋全部題目');
}
for(const key of Object.keys(ranges))assert.ok(metrics.offGrid[key]>0,key+' 必須測直接輸入值');
for(const aspect of [1.22,1.60]){
  for(const [key,r] of Object.entries(ranges)){
    const delta=10**-r.dec;
    for(const v of [r.min,r.min+delta,r.max-delta,r.max])scan('boundary',{...C.defaults,[key]:+v.toFixed(r.dec)},null,aspect,true);
  }
  // 重演審查的直輸值、對稱與紙邊的內外，以及各比較題達標值的兩側。
  scan('boundary',{...C.defaults,x:-2.34,yaw:16.5},null,aspect,true);
  for(const yaw of [-45,45])for(const offset of [-1.2,-1.1,-.2,-.1,0,.1,.2,1.1,1.2])
    for(const fov of [89.9,90,90.1,111])scan('boundary',{...C.defaults,yaw:yaw+offset,fov},null,aspect,true);
  for(const fov of [68,100,122]){
    const tilt=Math.round((90-Math.atan(Math.tan(fov*Math.PI/360)/aspect)*180/Math.PI)*10)/10;
    for(const sign of [-1,1])for(const delta of [-.1,0,.1]){
      const pitch=+(sign*(tilt+delta)).toFixed(1);
      if(pitch>=ranges.pitch.min&&pitch<=ranges.pitch.max)scan('boundary',{...C.defaults,fov,yaw:10,pitch},null,aspect,true);
    }
  }
  const base={...C.defaults,x:-3,z:12,size:3};
  for(const factor of [.48,.5,.52,.60,.80])for(const delta of [-.01,0,.01]){
    const size=+(base.size*factor+delta).toFixed(2);
    const now={...base,size,x:-size,z:+(base.z*factor).toFixed(2)};
    scan('boundary',now,base,aspect,true);
  }
  const other=C.measure(state(base,aspect)).otherHeight;
  for(const ratio of [.97,1.03,1.30]){
    const size=2,threshold=Math.round((1.4*size/(other*ratio)+size/2)*100)/100;
    for(const delta of [-.01,0,.01])scan('boundary',{...C.defaults,size,z:+(threshold+delta).toFixed(2)},{...C.defaults,size,z:14},aspect,true);
  }
  for(const solutions of Object.values(samples))for(const [p,b] of solutions)
    for(const key of Object.keys(ranges))for(const side of [-1,0,1]){
      const now={...C.defaults,...p},r=ranges[key];now[key]=+(now[key]+side*10**-r.dec).toFixed(r.dec);
      if(now[key]>=r.min&&now[key]<=r.max)scan('boundary',now,b?{...C.defaults,...b}:null,aspect,true);
    }
}
console.log(JSON.stringify({seed:initialSeed,...metrics,missionsReached:Object.fromEntries(Object.entries(hits).map(([k,v])=>[k,v.size])),defaultAwards:0}));
console.log('20 題、80 個操作證例與原反例重播通過。每個構圖換邊、清空描線、再記錄所得任務聯集至多一題。');
