'use strict';
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'), slug='supply-demand';
const {market,marketEdit}=require(path.join(root,'js/supply-demand-core.js'));
const html=fs.readFileSync(path.join(root,slug+'.html'),'utf8');
const ranges={};
for(const tag of html.match(/<input type="range"[^>]+>/g)){
  const attr=name=>tag.match(new RegExp(' '+name+'="([^"]+)"'))[1];
  ranges[attr('id')]={min:+attr('min'),max:+attr('max'),step:+attr('step'),digits:+attr('data-decimals'),value:+attr('value')};
}
const defaults=Object.fromEntries(Object.entries(ranges).map(([id,r])=>[id,r.value]));defaults.policy='free';
let missions;
const station={LabMission:{register(s,list){assert.equal(s,slug);missions=list;}}};
new Function('window',fs.readFileSync(path.join(root,'js/missions',slug+'.js'),'utf8'))(station);
const {createRecorder}=station.SupplyDemandEvidence;
const cap=price=>({policy:'ceiling',price}), floor=price=>({policy:'floor',price});
// Each pair lists the saved reference first. It is kept, not recorded, just as in the UI.
const cases={
  1:[{a:80}], 2:[cap(34)], 3:[floor(44)], 4:[{d:2}], 5:[{a:65,...floor(50)}],
  6:[{},{a:66,c:14}], 7:[{},cap(23)], 8:[{},floor(50)],
  9:[{a:81,d:2},{a:81,d:2,...cap(32)}], 10:[cap(33),floor(47)],
  h1:[{},cap(41)], h2:[{a:32,c:32},{a:32,c:40}], h3:[{b:1.5,d:.8},{b:1.2,d:1.2}],
  h4:[floor(59),floor(60)], h5:[cap(33),cap(20)], h6:[{},{a:68,c:28}],
  h7:[{a:80,b:2,c:12,...floor(36)},{a:80,b:2,c:12,...floor(44)}], h8:[cap(30),{a:66,...cap(30)}],
  h9:[{a:68,c:26,b:1.5,d:1},{a:68,c:26,b:1,d:1.5}],
  h10:[{a:70,c:10,d:2,...floor(55)},{a:70,c:10,d:2,...cap(40)}]
};
function measurement(overrides,variant=false){
  const config={...defaults,...overrides};
  for(const [id,r] of Object.entries(ranges)){
    // A second market has different slopes and nominal prices, on the actual typing grid.
    if(variant) config[id]=Number((config[id]*.8).toFixed(r.digits));
    assert.ok(config[id]>=r.min && config[id]<=r.max && config[id]===Number(config[id].toFixed(r.digits)),id+' outside UI');
  }
  return {...config,...market(config)};
}
function withEdit(data) {
  if ('edit' in data) return data;
  return {...data,edit:data.prior ? marketEdit(data.prior,data) : data.policy==='free' ? 'curves' : 'rule'};
}
function earned(data,type='recorded') {
  const event={type,data:withEdit(data)};
  return missions.filter(m=>m.check(event,{})).map(m=>m.id);
}
const ctx=(data,type='recorded')=>({last:k=>k===type?withEdit(data):null,seq:k=>k===type?1:0});
// Exercise the same record book and economic edit classification as the page, independently
// of the single-event predicate scan. View, save, release and clear do not change the market.
function experiment(storage) {
  const qualify=createRecorder(storage);
  let current=measurement({}), prior=null, edit=null;
  return {
    set(config){const next=measurement(config);edit=marketEdit(current,next)||edit;current=next;},
    save(){prior=current;}, release(){prior=null;},
    record(){return earned(qualify({...current,prior,edit}));},
    inspect(type){return earned({...current,prior,edit},type);}
  };
}
assert.equal(missions.length,20);
assert.equal(new Set(missions.map(m=>m.id)).size,20);
assert.equal(missions.filter(m=>m.hidden).length,10);
assert.ok(missions.filter(m=>m.hidden&&m.level>=7).length>=3);
const practice={...measurement(cap(34)),prior:null,edit:'price'};
for(const reason of ['off','login']) {
  station.LabMission.blocker=()=>reason;
  assert.equal(station.SupplyDemandEvidence.record(practice),practice);
}
station.LabMission.blocker=()=>null;
const afterPractice={...practice,prior:measurement({a:54,...cap(34)}),edit:'demand'};
assert.deepEqual(earned(station.SupplyDemandEvidence.record(afterPractice)),[slug+'-h8']);
assert.deepEqual(earned(station.SupplyDemandEvidence.record(practice)),[]);
for(const prior of [null,measurement({})]) for(const event of ['recorded','marketChanged','automatic']){
  assert.deepEqual(earned({...measurement({}),prior},event),[]);
}
const results=[];
function awarded(key, previous, current) {
  return earned({...measurement(current),prior:measurement(previous)}).includes(slug+'-'+key);
}
for(const price of [39.9,40,41.1,110]) assert.equal(awarded('h1',{},cap(price)),false);
assert.ok(awarded('h1',{},cap(41)));
assert.equal(awarded('h2',{},{a:32,c:40}),false);
for(const current of [cap(45),floor(50),{a:20,c:20},{a:10,c:20}]) {
  assert.equal(awarded('h3',{b:1.5},current),false);
}
assert.ok(awarded('h4',floor(59),floor(61)));
for(const [prior,now] of [[47,60],[59.5,59.9],[59.5,61.1],[59.5,110],[60,60.5]]) {
  assert.equal(awarded('h4',floor(prior),floor(now)),false);
}
assert.equal(awarded('7',{},cap(20)),false);
for(const [capPrice,floorPrice] of [[20,60],[33,60],[20,47]]) {
  assert.equal(awarded('10',cap(capPrice),floor(floorPrice)),false);
}
// A typed approximation on the inside of the half-surplus tolerance passes. The outside does not.
const halfMarket={a:80,d:2};
assert.ok(awarded('9',halfMarket,{...halfMarket,...cap(31.6)}));
for(const price of [31.4,32,20]) assert.equal(awarded('9',halfMarket,{...halfMarket,...cap(price)}),false);
assert.equal(awarded('h7',{},floor(54.1)),false);
const receiptsMarket={a:80,b:2,c:12};
for(const price of [36,43,80]) assert.equal(awarded('h7',{...receiptsMarket,...floor(36)},{...receiptsMarket,...floor(price)}),false);
for(const m of missions){
  const key=m.id.slice(slug.length+1), examples=[];
  for(const variant of [false,true]){
    const snapshots=cases[key].map(p=>measurement(p,variant)), now=snapshots.at(-1), prior=snapshots.length>1?snapshots[0]:null;
    if(!variant) for(const snap of snapshots) for(const [id,r] of Object.entries(ranges)) {
      const ticks=(snap[id]-r.min)/r.step;
      assert.ok(Math.abs(ticks-Math.round(ticks))<1e-8,m.id+' first solution must be reachable by sliders');
    }
    const payload={...now,prior};
    assert.deepEqual(earned(payload),[m.id],m.id+' must be independently achievable');
    assert.deepEqual(earned(payload,'marketChanged'),[]);assert.deepEqual(earned(payload,'automatic'),[]);
    if(prior) {assert.ok(!earned({...now,prior:null}).includes(m.id));assert.deepEqual(earned({...prior,prior},'marketChanged'),[]);}
    for(const event of ['marketChanged','recorded']){
      const checklist=m.need(ctx(payload,event));assert.ok(checklist.length);
      assert.ok(checklist.filter(([v])=>v!==null).every(([v])=>v===true),m.id+' checklist disagrees');
      assert.ok(checklist.every(row=>row[1]&&row[2]&&!/\p{Script=Han}/u.test(row[2])));
    }
    if(!m.hidden) assert.ok(m.need(ctx({...measurement({}),prior:null})).some(([ok])=>ok===false));
    assert.doesNotMatch((m.title??m.riddle).en+(m.desc?.en||''),/\p{Script=Han}/u);
    const inputs=s=>s?Object.fromEntries(['policy','a','b','c','d','price'].map(k=>[k,s[k]])):null;
    examples.push({reference:inputs(prior),current:inputs(now),equilibriumPrice:now.equilibriumPrice,traded:now.traded,shortage:now.shortage,excess:now.excess,revenue:now.revenue,referenceRevenue:prior?.revenue??null,consume:now.consume,produce:now.produce,loss:now.loss,surplus:now.surplus,freeSurplus:now.freeSurplus});
  }
  results.push({id:m.id,level:m.level,hidden:!!m.hidden,examples});
}
// Record every registered predicate on the very same immutable pair; never stop at the first hit.
const seed=112003, pairCount=32768, policies=['free','ceiling','floor'];
let stream=seed;
function random(){stream=(Math.imul(stream,1664525)+1013904223)>>>0;return stream/4294967296;}
function pick(xs){return xs[Math.floor(random()*xs.length)];}
const coverage=Object.fromEntries(Object.keys(ranges).map(k=>[k,new Set()]));
function draw(tenth){
  const raw={policy:pick(policies)};
  for(const [k,r] of Object.entries(ranges)){
    const step=tenth?10**-r.digits:r.step;
    const t=random();
    raw[k]=t<.09?r.min:t>.91?r.max:Number((r.min+step*Math.floor(random()*(1+Math.round((r.max-r.min)/step)))).toFixed(r.digits));
  }
  return raw;
}
const scanHits=Object.fromEntries(missions.map(m=>[m.id,0])),intersections=new Map();
for(let i=0;i<missions.length;i++) for(let j=i+1;j<missions.length;j++) intersections.set(missions[i].id+' / '+missions[j].id,0);
let maxHits=0;
function checkPair(prior,current,label) {
  for(const state of [prior,current]) if(state) for(const k of Object.keys(ranges)) coverage[k].add(state[k]);
  const hits=earned({...current,prior});maxHits=Math.max(maxHits,hits.length);
  hits.forEach(k=>scanHits[k]++);
  for(let i=0;i<hits.length;i++)for(let j=i+1;j<hits.length;j++){
    const key=hits[i]+' / '+hits[j];intersections.set(key,intersections.get(key)+1);
  }
  assert.ok(hits.length<=1,JSON.stringify({seed,label,prior,current,hits}));
  return hits;
}
const floorCollision=measurement({a:44,...floor(36)});
assert.deepEqual(checkPair(null,floorCollision,'3/5'),[slug+'-5']);
const capCollision=measurement(cap(34)),capPrior=measurement({a:54,...cap(34)});
assert.deepEqual(checkPair(capPrior,capCollision,'2/h8'),[slug+'-h8']);
assert.deepEqual(checkPair(null,capCollision,'2 alone'),[slug+'-2']);
for(const m of results)for(const e of m.examples)checkPair(e.reference?measurement(e.reference):null,measurement(e.current),m.id);
let sampledOrders=0,qualifyingFirst=0;
function scanOrder(first,second) {
  const record=createRecorder(), initial=earned(record(first)), next=earned(record(second));
  if(initial.length) {
    qualifyingFirst++;
    assert.ok(next.every(id=>id===initial[0]),JSON.stringify({seed,first,second,initial,next}));
  }
  sampledOrders++;
}
for(let i=0;i<pairCount;i++){
  const ref=draw(i%2===0),now=draw(i%2===0),kind=i%8;
  if(kind===1||kind===2||kind===3)for(const k of ['a','b','c','d'])now[k]=ref[k];
  if(kind===2)now.price=Number(pick([ref.a,ref.c,Math.min(110,ref.a+1),Math.max(0,ref.a-1)]).toFixed(ranges.price.digits));
  if(kind===3){const eq=measurement(ref).equilibriumPrice;if(eq!==null)now.price=Math.max(0,Math.min(110,Number((eq+pick([-1,0,.1,1])).toFixed(1))));}
  if(kind===4){now.a=ref.a;now.c=ref.c;now.b=ref.d;now.d=ref.b;}
  if(kind===5){now.c=ref.c;now.b=ref.b;now.d=ref.d;now.price=ref.price;}
  if(kind===6){const m=pick(results),e=pick(m.examples);Object.assign(ref,e.reference||e.current);Object.assign(now,e.current);const k=pick(['a','b','c','d','price']);const r=ranges[k];now[k]=Number(Math.max(r.min,Math.min(r.max,now[k]+pick([-1,0,1])*r.step)).toFixed(r.digits));}
  if(kind===7){now.a=ref.a;now.c=ref.c;now.d=now.b;}
  const current=measurement(now);
  current.edit=pick(['price','rule','demand','supply','curves']);
  const reference=measurement(ref);
  checkPair(reference,current,i);checkPair(null,current,'single '+i);
  const comparison={...current,prior:reference,edit:marketEdit(reference,current)};
  const isolated={...current,prior:null,edit:current.policy==='free'?'demand':'price'};
  scanOrder(comparison,isolated);scanOrder(isolated,comparison);
}
let typedBoundaryPairs=0;
for(const [k,r] of Object.entries(ranges)) {
  const unit=10**-r.digits;
  for(let n=0;n<=Math.round((r.max-r.min)/unit);n++){
    const value=Number((r.min+n*unit).toFixed(r.digits));
    const ref=draw(true),current=measurement({...ref,[k]:value});
    checkPair(measurement(ref),current,'typed '+k+' '+value);
    checkPair(null,current,'typed single '+k+' '+value);
    assert.ok(coverage[k].has(value));typedBoundaryPairs++;
  }
}
const before=measurement({a:54,...cap(34)}),common=measurement(cap(34));
assert.deepEqual(earned({...common,edit:'demand',prior:null}),[]);
assert.deepEqual(earned({...common,edit:'price',prior:null}),[slug+'-2']);
assert.deepEqual(earned({...common,edit:'demand',prior:before}),[slug+'-h8']);
assert.deepEqual(earned({...common,edit:'price',prior:before}),[]);
const crossCases=[];
for(const first of ['2','h8']) {
  let persisted=null;
  const storage={getItem:()=>persisted,setItem:(_,value)=>{persisted=value;}};
  let run=experiment(storage);
  if(first==='h8'){run.set(before);run.save();}
  run.set(common);
  assert.deepEqual(run.record(),[slug+'-'+first]);
  for(const event of ['marketChanged','camera','reference','released','clear'])assert.deepEqual(run.inspect(event),[]);
  run=experiment(storage); // including a reload of this tab
  if(first==='2'){run.set(before);run.save();run.set(common);}
  else {run.set(cap(33));run.release();run.set(common);}
  const after=run.record();
  assert.deepEqual(after,[],first+' must not unlock a second task at the same setting');
  const fresh={a:62,...cap(35)};
  if(first==='2'){run.set({a:55,...cap(35)});run.save();run.set(fresh);}
  else {run.release();run.set({...fresh,...cap(36)});run.set(fresh);}
  assert.deepEqual(run.record(),[slug+'-'+(first==='2'?'h8':'2')]);
  crossCases.push({first,secondAtSameMarket:after,newMarket:run.record()});
}
// Keep each of the 40 witnessed markets on screen, then swap, release or recreate references.
// Try the other 39 recorded routes and a fresh price/curve edit that returns to exactly the same market.
let sequences=0;
const examples=results.flatMap(m=>m.examples.map(e=>({...e,id:m.id})));
for(const original of examples) {
  const run=experiment();
  if(original.reference){run.set(original.reference);run.save();}
  else if(original.id===slug+'-2') run.set({...original.current,policy:'free'});
  run.set(original.current);
  assert.deepEqual(run.record(),[original.id]);
  for(const other of examples){
    run.release();
    if(other.reference){run.set(other.reference);run.save();}
    else {run.set({...original.current,policy:original.current.policy==='free'?'floor':'free'});}
    run.set(original.current);
    for(const event of ['marketChanged','camera','reference'])assert.deepEqual(run.inspect(event),[]);
    const hits=run.record();
    assert.ok(hits.every(id=>id===original.id),JSON.stringify({original,other,hits}));
    sequences++;
  }
}
assert.equal(intersections.size,190);
assert.ok(Object.values(scanHits).every(n=>n>0));
const scan={seed,pairs:pairCount,singleReadings:pairCount,missionPairs:intersections.size,maximumSimultaneous:maxHits,
  defaultAwards:earned({...measurement({}),prior:null}),reviewCases:{'3/5':earned({...floorCollision,prior:null}),'2/h8':earned({...capCollision,prior:capPrior})},
  crossEvents:{orderedWitnessSequences:sequences,sampledOrders,qualifyingFirst,oppositeOrders:crossCases},randomTypedPairs:pairCount/2,typedBoundaryPairs,
  sliderCoverage:Object.fromEntries(Object.entries(ranges).map(([k,r])=>[k,{min:r.min,max:r.max,step:r.step,typedStep:10**-r.digits,verifiedTicks:1+Math.round((r.max-r.min)/r.step),verifiedTypedValues:1+Math.round((r.max-r.min)*10**r.digits)}])),
  intersections:Object.fromEntries(intersections),hits:scanHits};
if(require.main===module){
  if(process.argv.includes('--scan-json'))console.log(JSON.stringify(scan,null,2));
  else if(process.argv.includes('--json'))console.log(JSON.stringify(results,null,2));
  else{results.forEach(r=>console.log('✓ '+r.id+'　兩組獨立解'));console.log('20 題、40 組解。種子 '+seed+'，'+pairCount+' 組前後比較與同數單筆，190 對同筆交集為零。另驗 '+typedBoundaryPairs+' 組逐一鍵入刻度及 '+sequences+' 組跨事件路徑。');}
}
