'use strict';
const assert=require('node:assert/strict');
const K=require('../../js/sexagenary-cycle-core');
const slug='sexagenary-cycle';
let missions;
global.window={LabMission:{register(id,list){assert.equal(id,slug);missions=list;}}};
require('../../js/missions/sexagenary-cycle');
const secret=missions.filter(m=>m.hidden);
function make(act,y,extra={}){
  const d=K.describe(y);
  return {type:'calendar',data:{act,year:y,k:d.k,s:d.s,b:d.b,record:!!d.record,...extra}};
}
const move=(from,to,act='step',extra={})=>make(act,to,{prevYear:from,delta:K.distance(from,to),...extra});
const compare=(a,b,g)=>make('compare',b,{comparison:K.compare(a,b,g)});
const pairing=(s,b,y=K.initial)=>make('pair',y,{pair:K.inspectPair(s,b)});
const cases=[];
function add(id,label,yes,no){cases.push({id:String(id),label,yes,no});}
function years(id,a,b,other,guess=Math.abs(K.distance(a,b))){
  add(id,a+' → '+b+'，預測 '+guess,compare(a,b,guess),compare(a,other,Math.abs(K.distance(a,other))));
}
add(1,'1894 → 1895',move(1894,1895),move(1894,1904));
add(2,'1953 → 1954 甲午',move(1953,1954),move(1952,1953));
add(3,'輸入民國前 1 年 → 1911',move(1894,K.readYear('before',1),'entry',{era:'before'}),move(1894,1911,'entry',{era:'ad'}));
add(4,'查驗甲丑，六十格均無',pairing(0,1),pairing(0,0));
years(5,1984,1994,1996);years(6,1984,1996,1994);years(7,1894,1911,1910);
years(8,1895,1898,1911);years(9,-3,3,18);years(10,1911,1971,2031);
years('h1',1904,1916,1915);years('h2',1905,1915,1916);years('h3',1894,1898,1895);years('h4',1911,1912,1913);
years('h5',-1,1,2);years('h6',-30,31,30);years('h7',1894,1954,2014);years('h8',1984,2014,2013);
years('h9',1854,1974,1914);years('h10',1983,1984,1985);
function random(seed){let s=seed>>>0;return n=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return Math.floor(s/4294967296*n);};}
const near=[-60,-30,-2,-1,1,2,3,4,10,12,30,60,120];
const landmarks=[-1,1,1894,1895,1898,1911,1912,1983,1984,1971];
function shift(y,n){return K.civil(Math.max(K.serial(K.first),Math.min(K.last,K.serial(y)+n)));}
function fullYear(r){return K.civil(K.serial(K.first)+r(6000));}
function scan(){
  const r=random(0x601984), reached=new Set();let maximum=0;
  function inspect(e){const m=secret.filter(x=>x.check(e));maximum=Math.max(maximum,m.length);m.forEach(x=>reached.add(x.id));assert.ok(m.length<=1);}
  // Mix unrestricted dates with short intervals, both era boundaries and documented years.
  for(let n=0;n<32000;n++){
    const a=n%3?landmarks[r(landmarks.length)]:fullYear(r);
    const b=r(4)?shift(a,near[r(near.length)]):fullYear(r);
    inspect(compare(a,b,r(4)?Math.abs(K.distance(a,b)):r(150)));
  }
  assert.equal(reached.size,secret.length);
  return {states:32000,maximum,distinctHidden:reached.size};
}
function randomPlay(){
  const r=random(0x5eed1911), hits=Object.fromEntries(secret.map(m=>[m.id.split('-').at(-1),0]));
  // A player can pin, predict, enter a year, open a record, step, clear, play, check a pair or seek it.
  // Common interval guesses are deliberately overrepresented; never read the answer into the guess.
  const guesses=[1,2,3,4,10,12,17,30,60,120];
  for(let i=0;i<150;i++){
    let y=K.initial,pin=null,p=null,g=null;const found=new Set();
    for(let j=0;j<20;j++){
      const old=y;let e;
      switch(r(11)){
        case 0:pin=y;g=null;e=make('pin',y);break;
        case 1:g=r(4)?guesses[r(guesses.length)]:r(200);break;
        case 2:if(pin!==null&&g!==null)e=compare(pin,y,g);break;
        case 3:y=landmarks[r(landmarks.length)];e=move(old,y,'event');break;
        case 4:y=fullYear(r);e=move(old,y,'entry',{era:r(2)?'bc':'ad'});break;
        case 5:case 6:y=shift(y,[1,10,12,60][r(4)]*(r(2)?1:-1));e=move(old,y);break;
        case 7:p=K.inspectPair(r(10),r(12));e=make('pair',y,{pair:p});break;
        case 8:if(p?.possible){const target=K.nextOccurrence(y,p.matches[0]);if(target<=K.last){y=target;e=move(old,y,'seek');}}break;
        case 9:pin=null;g=null;break;
        default:y=shift(y,1);e=move(old,y,'play');
      }
      if(e)for(const m of secret)if(m.check(e))found.add(m.id.split('-').at(-1));
    }
    found.forEach(id=>hits[id]++);
  }
  for(const n of Object.values(hits))assert.ok(n/150<.02);return hits;
}
function prove(){
  assert.equal(missions.length,20);assert.equal(secret.length,10);
  assert.ok(missions.every(m=>!m.check({type:'calendar',data:{}})&&!m.check(make('initial',K.initial))));
  let checks=1;
  for(const c of cases){
    const m=missions.find(x=>x.id===slug+'-'+c.id);
    assert.ok(m.check(c.yes),m.id+' witness');assert.ok(!m.check(c.no),m.id+' counterexample');
    assert.ok(!m.check({...c.yes,type:'unrelated'}),m.id+' event source');checks+=3;
    if(m.hidden){
      assert.deepEqual(secret.filter(h=>h.check(c.yes)),[m]);
      const q=c.yes.data.comparison;assert.ok(!m.check(compare(q.from,q.to,q.gap+1)));checks+=2;
    }else{
      assert.ok(m.need({last:()=>c.yes.data}).every(([v,zh,en])=>v&&zh&&en));
      assert.ok(m.need({last:()=>c.no.data}).some(row=>!row[0]));checks+=2;
    }
    console.log('✓ '+c.id+' '+c.label+'；反例通過');
  }
  const overlap=scan(),hits=randomPlay();checks+=12;
  console.log('固定種子 '+overlap.states+' 組，最多同時成立 '+overlap.maximum+' 個隱藏任務，涵蓋 '+overlap.distinctHidden+' 個');
  console.log('150 × 20 步，各隱藏任務誤觸輪數 '+JSON.stringify(hits));
  console.log(checks+' 項通過，0 項失敗');
  return {checks,overlap,hits};
}
module.exports={missions,cases,scan,randomPlay,prove};
if(require.main===module)prove();
