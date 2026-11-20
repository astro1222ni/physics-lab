'use strict';
const assert=require('node:assert/strict');
const C=require('../js/learn/phy-5-1-core');
const close=(v,expected,e=1e-7)=>assert.ok(Math.abs(v-expected)<e,`${v} vs ${expected}`);
const rough={angle:C.angle43,surface:'rough',direction:1};
const ice={angle:90,surface:'ice',direction:1};
const f=C.forces(C.angle43);
close(f.parallel,40);close(f.perpendicular,30);close(f.normal,70);close(f.friction,-40);
function run(s,ctl,duration,step=1/60) {
  let t=0;
  while(t<duration-1e-10){
    const dt=Math.min(step,duration-t);s=C.advance(s,ctl,dt);t+=dt;
    const net=s.WF+s.Wf+s.WN+s.Wg,change=s.K-s.initialK;
    assert.ok(Math.abs(net-change)/Math.max(1,Math.abs(change))<.005,'每一步作功與動能變化');
  }
  return s;
}
close(C.forces(C.angle125).a,0);close(C.forces(0).friction,-400/7);
assert.equal(C.timeToDistance(C.initial(),ice,Infinity),Infinity);
const horizontalStop=run(C.initial(),{...rough,angle:0},4);close(horizontalStop.v,0);close(horizontalStop.x,.7);
const straight=run(C.initial(),rough,10);
close(straight.x,10);close(straight.WF,400);close(straight.Wf,-400);close(straight.WN,0);close(straight.Wg,0);
const out=run(C.initial(),rough,5),back=run(C.reverse(out),{...rough,direction:-1},5);
close(out.WF,200);close(back.x,0);close(back.distance,10);close(back.WF,400);close(back.Wf,-400);
const glide=run(C.initial(),ice,10);close(glide.WF,0);close(glide.Wf,0);close(glide.v,1);close(glide.K,5);
for(const dt of [1/120,1/30,.17,1]) {
  const s=run(C.initial(),{...ice,angle:0},2,dt);close(s.v,11);close(s.x,12);
  const stop=run(C.initial(),{...rough,angle:90},10,dt);close(stop.v,0);close(stop.K,0);
  close(C.advance(stop,rough,2).x,stop.x);
  const reverseFast=C.reverse(s);close(reverseFast.v,-s.v);close(reverseFast.K,s.K);
  const restart=run(C.initial(),rough,1,dt);close(restart.v,1);
}
close(C.timeToDistance(C.initial(),rough,10),10);
const e=C.examples();assert.deepEqual([e.hand,e.gravity,e.net],[60,-60,0]);
close(e.backpackK,3.6);close(e.backpackWg,-40);close(e.dU,40);
const a=C.answers();assert.deepEqual([a.angle,a.cart,a.ratio,a.bucket,a.trip,a.bike],[90,-240,4,2,1,1]);
console.log('✓ 行李箱各力、停車、掉頭、冰面、逐步功能定理、範例與隨堂題');
