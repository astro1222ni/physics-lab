'use strict';
const assert=require('node:assert/strict');
const P=require('../js/basketball-shot-pose.js'), C=require('../js/basketball-shot-core.js');
const L=P.lengths, rad=Math.PI/180;
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<tol,`${a} differs from ${b}`);
function flex(start,joint,end) {
  const a=dist(start,joint),b=dist(joint,end),d=dist(start,end);
  return Math.acos(Math.max(-1,Math.min(1,(d*d-a*a-b*b)/(2*a*b))))/rad;
}
let samples=0, releases=0;
for(const mode of ['shot','throw']){
  const radius=C.balls[mode].diameter/2;
  for(let i=0;i<=60;i++){
    const h=i/20, p={mode,height:h,speed:3+(i%16),angle:10+(7*i)%71,bearing:i%2?80:-80,distance:6.75};
    const plan=P.jumpPlan(p), cos=Math.cos(p.angle*rad), sin=Math.sin(p.angle*rad);
    const rest=P.sample(1.1,p);
    for(let j=-40;j<=56;j++){
      const t=j*.02,s=P.sample(t,p);samples++;
      near(dist(s.hip,s.trunk),L.trunk);near(dist(s.trunk,s.neck),.609-L.trunk);
      near(dist(s.neck,s.head),.118);
      for(const [k,a] of s.arms.entries()){
        near(dist(a.shoulder,a.elbow),L.upper);near(dist(a.elbow,a.wrist),L.fore);
        near(dist(a.wrist,a.palm),dist(rest.arms[k].wrist,rest.arms[k].palm));
        near(dist(a.palm,a.finger),dist(rest.arms[k].palm,rest.arms[k].finger));
        assert.ok(flex(a.shoulder,a.elbow,a.wrist)<=150.00001);
        if(t<0 && (mode==='shot'||k===1)){
          near(dist(s.ball,a.palm),radius+.024,mode==='shot'&&k===0?.026:1e-7);
          assert.ok(dist(s.ball,a.finger)<radius+.045);
        }
      }
      for(const l of s.legs){
        near(dist(l.hip,l.knee),L.thigh);near(dist(l.knee,l.ankle),L.shin);
        near(dist(l.heel,l.toe),L.foot);near(dist(l.ankle,l.heel),Math.hypot(.081,.104));
        assert.ok(flex(l.hip,l.knee,l.ankle)<=140.00001);
        assert.ok(l.heel[1]>=-1e-8);
      }
      const ballistic=t>=plan.takeoff&&t<=plan.landing?
        Math.sqrt(2*C.g*plan.height)*(t-plan.takeoff)-.5*C.g*(t-plan.takeoff)**2:0;
      near(Math.min(...s.legs.map(l=>l.toe[1])),ballistic);
      if(mode==='shot')near(s.legs[0].heel[1],s.legs[1].heel[1]);
      assert.ok(s.ball.every(Number.isFinite));
    }
    const s=P.sample(0,p);
    assert.deepEqual(s.ball,[0,h,0]);near(s.releaseV[0],p.speed*cos);near(s.releaseV[1],p.speed*sin);
    assert.ok(plan.height<=plan.cap && (!plan.height||plan.apex>0));
    for(const angle of [10,15,30,45,55,70,80])for(const speed of [3,7.333,18]){
      const trial={...p,angle,speed},dt=1e-6,here=P.sample(0,trial).ball;
      const after=P.sample(dt,trial).ball;
      near(Math.atan2(after[1]-h,after[0])/rad,angle,.5);
      if(h>0){
        const before=P.sample(-dt,trial).ball;
        near(Math.atan2(here[1]-before[1],here[0]-before[0])/rad,angle,.5);
      }
      // Exercise the actual interpolation used by both views with the original flight data.
      const r=C.launch(trial),raw=mode==='shot'?r.path.slice(0,2).map(([x,y,z,t])=>[r.distance+x*r.station.c-z*r.station.s,y,t]):r.points.slice(0,2);
      const start=P.flightPoint(trial,...raw,0,r.contacts?.[0]?.t);
      const next=P.flightPoint(trial,...raw,dt,r.contacts?.[0]?.t);
      near(start[0],0);near(start[1],h);near(Math.atan2(next[1]-h,next[0]-start[0])/rad,angle,.5);
      releases++;
    }
  }
}
const p={mode:'shot',height:2.6,speed:8.3,angle:52,bearing:45,distance:6.75};
const poses=[-.7,-.47,-.18,0,.15,.4,1.02].map(t=>P.sample(t,p));
assert.ok(poses[1].hip[1]<poses[0].hip[1] && poses[1].ball[1]<poses[0].ball[1]);
assert.ok(poses[2].ball[1]>poses[2].head[1] && poses[2].arms[1].elbow[1]<poses[2].ball[1]);
assert.ok(poses[3].arms[1].turn===0 && poses[4].arms[1].turn<-.9);
near(poses[4].arms[1].turn,poses[5].arms[1].turn);
assert.ok(poses[6].arms[1].wrist[1]<poses[6].arms[1].shoulder[1]);
const ahead=P.sample(.4,p,[4,4,.3]),below=P.sample(.4,p,[4,.15,-.3]);
assert.ok(ahead.gazePitch>below.gazePitch && ahead.gazeYaw<below.gazeYaw);
const soft={...p,mode:'throw',height:1.6},wind=P.sample(-.25,soft),release=P.sample(0,soft);
assert.ok(wind.ball[0]<wind.arms[1].shoulder[0] && wind.yaw<wind.hipYaw);
assert.ok(release.legs[0].toe[0]>P.sample(-.8,soft).legs[0].toe[0]+.25);
assert.ok(P.sample(0,{...p,height:.3}).hip[1]<P.sample(0,{...p,height:2}).hip[1]);
console.log(`驗證 ${samples} 組姿勢、${releases} 組出手座標與切線，含球心低於球半徑及兩種模式的完整動作。`);
