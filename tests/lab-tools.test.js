/* 指引與微調的純行為測試；瀏覽器另驗證實際拖曳、指標與任務隔離。 */
'use strict';
const assert=require('assert'),G=require('../js/stepguide.js'),P=require('../js/vpad.js');
const view={left:0,right:412,top:40,bottom:740},rect=(x,y,w=80,h=44)=>({left:x,top:y,right:x+w,bottom:y+h,width:w,height:h});
assert.equal(G.classify(rect(20,100),view,true),'inside');assert.equal(G.classify(rect(20,-10),view,true),'above');assert.equal(G.classify(rect(20,760),view,true),'below');assert.equal(G.classify(rect(20,100),view,false),'hidden');assert.equal(G.classify(rect(500,100),view,true),'outside');assert.equal(G.classify(rect(20,140),{...view,top:200},true),'above');
for(const step of [.01,.05,.5])for(const [i,x,y] of [[0,-1,1],[1,0,1],[2,1,1],[3,-1,0],[5,1,0],[6,-1,-1],[7,0,-1],[8,1,-1]]){const d=P.delta(i,step);assert.equal(d.x,x*step);assert.equal(d.y,y*step);}
assert.deepStrictEqual(P.position(-20,900,204,240,412,780,true),{x:8,y:532});assert.deepStrictEqual(P.position(15,17,204,240,412,780,true),{x:8,y:8});assert.deepStrictEqual(P.position(180,300,204,240,390,780,false),{x:178,y:300});
let now=0,next=1,count=0;const jobs=new Map(),clock={setTimeout(fn,ms){const id=next++;jobs.set(id,{fn,at:now+ms});return id;},setInterval(fn,ms){const id=next++;jobs.set(id,{fn,at:now+ms,period:ms});return id;},clearTimeout:id=>jobs.delete(id),clearInterval:id=>jobs.delete(id)};
function advance(ms){const end=now+ms;while(true){const a=[...jobs].filter(([id,j])=>j.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!a)break;const [id,j]=a;now=j.at;if(j.period)j.at+=j.period;else jobs.delete(id);j.fn();}now=end;}
const stop=P.repeat(()=>count++,clock);assert.equal(count,1);advance(349);assert.equal(count,1);advance(1);assert.equal(count,2);advance(240);assert.equal(count,5);stop();advance(1000);assert.equal(count,5);assert.equal(jobs.size,0);
console.log('指引可見範圍、三步距八向、邊界吸附、350／80 ms 連發與停止全部通過。');
