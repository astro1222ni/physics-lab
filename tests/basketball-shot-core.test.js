'use strict';
const assert = require('node:assert/strict');
const C = require('../js/basketball-shot-core.js');
const base={mode:'shot',speed:7.3,angle:55,height:2,distance:4.23,drag:false};
const run=over=>C.launch({...base,...over});
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<tol,'expected '+a+' ≈ '+b);
const rad=Math.PI/180, g=C.g;
function verify(label,fn){fn();console.log('✓ '+label);}

verify('球場尺寸與兩球的迎風截面積',()=>{
  near(C.court.freeThrow,4.23);near(4.60-C.court.boardOffset,C.court.freeThrow,.006);
  near(C.court.threePoint,6.75);near(C.rimHeight,3.05);near(C.rimRadius*2,.45);
  near(C.court.boardHeight,1.05);near(C.court.boardWidth,1.8);
  near(C.airDensity,1.2);near(C.balls.shot.cd,.50);near(C.balls.throw.cd,.35);
  near(C.dragPerMass(C.balls.shot),.02281138294738637,1e-14);
  near(C.dragPerMass(C.balls.throw),.0081676861951336,1e-14);
  near(C.dragPerMass({...C.balls.throw,diameter:.194}),4*C.dragPerMass(C.balls.throw));
});
verify('無阻力擲遠的解析射程、互補角與力學能守恆',()=>{
  for(const a of [13,33,45,67,80]){
    const p={mode:'throw',speed:12,height:0,angle:a},r=run(p);
    near(r.R,144*Math.sin(2*a*rad)/g);near(r.R,run({...p,angle:90-a}).R);near(r.vLand,12);
    near(r.T,24*Math.sin(a*rad)/g);near(r.H,(12*Math.sin(a*rad))**2/(2*g));
    near(C.bestRange(p).theta,45);
  }
  const high=run({mode:'throw',height:2.3,angle:43,speed:11});
  near(high.vLand**2/2,121/2+g*2.3);
});
verify('壘球阻力的數值射程與最佳角由相同係數得到',()=>{
  const P=require('../js/projectile-core.js'), p={...base,mode:'throw',speed:15,angle:41,height:1.7,drag:true};
  const r=C.launch(p),best=C.bestRange(p),ideal=C.bestRange({...p,drag:false});
  const ref=P.predict({v0:15,theta:41,h0:1.7,g,k:C.dragPerMass(C.balls.throw)});
  near(r.R,ref.R);assert.ok(r.R<run({...p,drag:false}).R);assert.ok(best.theta<ideal.theta&&ideal.theta<45);
  near(best.R,run({...p,angle:best.theta}).R,1e-7);
  for(const step of [-1,1])assert.ok(run({...p,angle:best.theta+step}).R<best.R);
});
verify('板前無阻力軌跡、下降角與短徑符合解析解',()=>{
  const d=run({}),vx=base.speed*Math.cos(55*rad),vy=base.speed*Math.sin(55*rad);
  const t=(vy+Math.sqrt(vy*vy-2*g*(3.05-base.height)))/g;
  assert.equal(d.outcome,'swish');near(d.crossing.x,vx*t);
  near(d.crossing.vx,vx);near(d.crossing.vy,vy-g*t);near(d.crossing.y,C.rimHeight);
  near(d.crossing.angle,Math.atan2(g*t-vy,vx)/rad);near(d.opening,.45*Math.sin(d.crossing.angle*rad));
  near(d.R,vx*d.T);assert.ok(d.margin>0);assert.deepEqual(d.events.map(e=>e.type),['net']);
  assert.equal(run({speed:3,angle:10}).crossing,null);
});
verify('有阻力的入框速度獨立用四倍細步長重算',()=>{
  const P=require('../js/projectile-core.js'),p={...base,speed:7.65,drag:true};
  const cross=run(p).crossing;
  const q={v0:p.speed,theta:p.angle,h0:p.height,g,k:.5*1.2*.50*Math.PI*(.245/2)**2/.62};
  let ref=P.initialState(q);
  while(ref.t+1/960<cross.t)ref=P.rk4(q,ref,1/960);
  ref=P.rk4(q,ref,cross.t-ref.t);
  for(const key of ['x','y','vx','vy'])near(cross[key],ref[key],2e-8);
  near(cross.angle,Math.atan2(-ref.vy,Math.abs(ref.vx))/rad,2e-7);
});
verify('有效開口小於球徑，即使對準仍碰前框，舊版診斷止於接觸點',()=>{
  const r=run({speed:9.41,angle:29});
  assert.ok(Math.abs(r.crossing.x-base.distance)<.028&&r.opening<.245);
  assert.equal(r.rimHit.side,'front');near(r.rimHit.t,r.T);
  near(Math.hypot(r.rimHit.x-(base.distance-C.rimRadius),r.rimHit.y-C.rimHeight),C.ballRadius,2e-9);
  near(r.points.at(-1)[2],r.T);assert.ok(r.T<r.crossing.t);assert.equal(r.scored,false);
});
verify('打板瞬間法向反向、切向連續，動能損失僅來自水平分量',()=>{
  for(const drag of [false,true]){
    const r=run({speed:drag?8.17:7.81,angle:44,drag}),b=r.board;
    assert.ok(b);near(b.x,base.distance+C.court.boardOffset-C.ballRadius);near(b.vxOut,-.75*b.vxIn);near(b.vyOut,b.vyIn);
    near((b.vxIn**2+b.vyIn**2-b.vxOut**2-b.vyOut**2)/2,(1-.75**2)*b.vxIn**2/2);
    const i=r.points.findIndex(pt=>Math.abs(pt[2]-b.t)<1e-9);
    assert.ok(i>0&&i<r.points.length-1);assert.ok(r.points[i-1][0]<b.x&&r.points[i+1][0]<b.x);
    if(!drag){assert.equal(r.outcome,'bank');assert.deepEqual(r.events.map(x=>x.type),['board','net']);assert.ok(r.crossing.t>b.t);
      near(r.crossing.vx,b.vxOut);near(r.crossing.vy,b.vyOut-g*(r.crossing.t-b.t));
      assert.ok(r.crossing.vx<0&&r.crossing.angle>0&&r.crossing.angle<90);
      near(r.crossing.angle,Math.atan2(-r.crossing.vy,Math.abs(b.vxOut))/rad);
      near(r.vLand**2/2,base.height*g+7.81**2/2-(1-.75**2)*b.vxIn**2/2);}
  }
  assert.equal(run({angle:75,speed:13}).board,null);
  assert.equal(run({angle:10,speed:8}).board,null);
  const back=run({speed:7.45});assert.equal(back.rimHit.side,'back');assert.equal(back.board,null);
});
verify('球心須離籃板上下緣至少一個半徑，邊界外不發出打板事件',()=>{
  const lower=C.court.boardBottom+C.ballRadius,upper=C.court.boardBottom+C.court.boardHeight-C.ballRadius;
  for(const edge of [lower,upper])assert.equal(C.onBoardFace(edge),true);
  assert.equal(C.onBoardFace(lower-.00001),false);assert.equal(C.onBoardFace(upper+.00001),false);
  assert.equal(C.onBoardFace(lower+.00001),true);assert.equal(C.onBoardFace(upper-.00001),true);
  const height=1.2,angle=52,a=angle*rad,x=base.distance+C.court.boardOffset-C.ballRadius;
  function aimedAt(y){
    const speed=Math.sqrt(g*x*x/(2*Math.cos(a)**2*(height+x*Math.tan(a)-y)));
    return run({height,angle,speed});
  }
  const contact=aimedAt(upper-.00001);
  near(contact.board.y,upper-.00001);near(contact.board.x,x);
  assert.ok(contact.events.some(e=>e.type==='board'));
  for(const y of [lower-.00001,upper+.00001,3.86])assert.ok(aimedAt(y).events.every(e=>e.type!=='board'));
});
verify('最小速率的切線角可到框心，低於此速率無實數解',()=>{
  assert.equal(C.measurement({...base,drag:true},run({drag:true})).minimum,null);
  for(const d of [2.6,4.23,6.75])for(const h of [.2,1.7,2.7]){
    const m=C.minimumSpeed(d,h),dy=C.rimHeight-h,a=m.angle*rad;
    near(h+d*Math.tan(a)-g*d*d/(2*m.speed**2*Math.cos(a)**2),C.rimHeight);
    near(m.angle,45+.5*Math.atan2(dy,d)/rad);
    const slow=m.speed-.01;assert.ok(slow**4-g*(g*d*d+2*dy*slow**2)<0);
  }
});
verify('邊界設定的時間、有界幾何、事件順序與末端一致',()=>{
  for(const mode of ['shot','throw'])for(const speed of [3,18])for(const angle of [10,80])
    for(const height of [0,3])for(const distance of [2,9])for(const drag of [false,true]){
      const r=run({mode,speed,angle,height,distance,drag}),pts=r.points;
      assert.ok(r.T>0&&r.H>=height&&pts.every(v=>v.every(Number.isFinite)));
      assert.ok(pts.every((v,i)=>!i||v[2]>pts[i-1][2]));
      near(r.R,pts.at(-1)[0]);near(r.T,pts.at(-1)[2]);assert.ok(r.tApex<=r.T+1e-8);
      assert.ok(r.events.every((e,i)=>e.t<=r.T+1e-8&&(!i||e.t>=r.events[i-1].t)));
    }
});

verify('框口投影保留球心前後偏移，打板後視線反向',()=>{
  for(const vx of [-3,3])for(const dx of [-.12,0,.12]){
    const q=C.entryProjection({x:4+dx,vx,vy:-4},4);
    near(q.opening,.45*.8);near(q.offset,dx*Math.sign(vx)*.8);
  }
  assert.equal(C.entryProjection(null,4),null);
  const nearRim=run({speed:7.32,angle:57});
  assert.ok(nearRim.scored&&nearRim.margin<.003&&Math.abs(nearRim.viewOffset)>.025);
  const hit=run({speed:9.43,angle:29});
  assert.ok(hit.rimHit&&hit.crossing.t>hit.rimHit.t);near(hit.margin,0);
});
verify('可達高度包絡線與最低速率相切，門檻兩側可分辨',()=>{
  for(const height of [0,1.25,2.2,3])for(const distance of [2,4.23,6.75,9]){
    const min=C.minimumSpeed(distance,height);
    near(C.heightEnvelope(min.speed,distance,height),C.rimHeight);
    assert.ok(C.heightEnvelope(min.speed-.001,distance,height)<C.rimHeight);
    assert.ok(C.heightEnvelope(min.speed+.001,distance,height)>C.rimHeight);
  }
});
verify('正面逐欄重播 v1 快照，含五種結果與打板資料',()=>{
  const snap=require('./fixtures/basketball-shot-v1.json');
  assert.ok(snap.rows.length>=2000&&Object.keys(snap.counts).length===5);
  function compare(actual,expected,label){
    if(typeof expected==='number')assert.ok(Math.abs(actual-expected)<=1e-9,label+' '+actual+' / '+expected);
    else if(expected&&typeof expected==='object'){
      assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected).sort(),label);
      for(const k of Object.keys(expected))compare(actual[k],expected[k],label+'.'+k);
    }else assert.equal(actual,expected,label);
  }
  for(const [distance,speed,angle,height,drag,...values] of snap.rows){
    const r=run({distance,speed,angle,height,drag:!!drag,bearing:0});
    snap.keys.forEach((k,i)=>compare(r[k],values[i],k));
  }
});
verify('薄殼球碰撞含自旋的總動能不增，無阻力飛行段機械能守恆',()=>{
  const r=run({bearing:45}),x0=r.path[0],p=r.station;
  const vx=base.speed*Math.cos(base.angle*rad),vy=base.speed*Math.sin(base.angle*rad);
  for(const [x,y,z,t] of r.path.filter(q=>q[3]<r.contacts[0].t)){
    near(x,x0[0]+vx*p.c*t,1e-9);near(z,x0[2]-vx*p.s*t,1e-9);
    near(g*y+(vx**2+(vy-g*t)**2)/2,g*base.height+base.speed**2/2,1e-9);
  }
  for(const over of [{},{angle:44,speed:7.81},{speed:7.24},{bearing:45,speed:7.81,angle:44}]){
    for(const c of run(over).contacts)assert.ok(c.energyOut<=c.energyIn+1e-9,c.type);
  }
});
verify('從球底 1.80 m 無旋落下，第一次反彈高度符合 FIBA 球底規格',()=>{
  const r=run({speed:0,height:1.80+C.ballRadius,spinHz:0}),floor=r.contacts.filter(c=>c.type==='floor');
  const apex=Math.max(...r.path.filter(q=>q[3]>floor[0].t&&q[3]<floor[1].t).map(q=>q[1]))-C.ballRadius;
  assert.ok(apex>=1.035&&apex<=1.085);near(apex,1.06,.0001);
});
verify('入網後水平速率下降，球穿出網底後才碰地',()=>{
  const r=run({}),net=r.contacts.find(e=>e.type==='net'),idx=r.path.findIndex(q=>q[3]>net.t&&q[1]<C.rimHeight-.40);
  const b=r.path[idx],a=r.path[idx-1];
  assert.ok(r.final.made&&idx>1&&r.contacts.find(e=>e.type==='floor').t>b[3]);
  assert.ok(Math.hypot(b[0]-a[0],b[2]-a[2])/(b[3]-a[3])<.60*net.horizontalIn);
});
verify('往上穿入網底時開始受阻，這次穿越不算得分',()=>{
  const r=run({distance:2,speed:9.1842428,angle:55,height:.5});
  const first=r.contacts[0];
  assert.equal(first.type,'net');
  near(first.y,C.rimHeight-.40,1e-9);
  const i=r.path.findIndex(point=>point[3]>=first.t);
  const [entry,a,b]=r.path.slice(i,i+3);
  assert.ok(a[1]>entry[1]&&b[1]>a[1]);
  assert.ok((b[0]-a[0])/(b[3]-a[3])<first.horizontalIn);
  assert.equal(r.final.made,false);
});
verify('從板後擦過上緣依邊線法向反彈，出界球在延伸一公尺處結束',()=>{
  const r=run({distance:3.23,bearing:40,speed:7.915,angle:67.96,height:2.64});
  const board=r.contacts[0];
  assert.equal(board.type,'board');
  assert.ok(board.x>C.court.boardOffset&&board.y>C.court.boardBottom+C.court.boardHeight);
  near(C.boardGap(board),0,1e-9);
  assert.equal(r.final.reason,'out');near(r.final.restAt[0],2.575,1e-9);
});
verify('斜向打板偏離投籃平面，左右站位的接觸、終局與世界軌跡互為鏡像',()=>{
  for(const angle of [15,45,80]){
    const p={bearing:angle,speed:7.81,angle:44},a=run(p),b=run({...p,bearing:-angle});
    assert.equal(a.final.how,b.final.how);assert.equal(a.path.length,b.path.length);
    assert.deepEqual(a.contacts.map(e=>e.type),b.contacts.map(e=>e.type));
    for(let i=0;i<a.path.length;i++){const q=a.path[i],w=b.path[i];near(q[0],w[0]);near(q[1],w[1]);near(q[2],-w[2]);near(q[3],w[3]);}
    if(angle===45){
      assert.ok(a.contacts.some(e=>e.type==='board'));
      assert.ok(a.path.some(([x,,z])=>Math.abs(x*a.station.s+z*a.station.c)>.2));
    }
  }
  near(C.station(9,80).z,7.3);near(C.station(9,-80).z,-7.3);
});
verify('1,200 組固定種子三維出手，逐點檢查框板距離、碰撞能量與結束條件',()=>{
  let seed=0x13179a3;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<1200;i++){
    const p={bearing:(rand()*2-1)*80,distance:2+7*rand(),angle:10+70*rand(),height:3*rand(),speed:3+15*rand(),drag:i%2===0};
    const r=run(p);assert.ok(Number.isFinite(r.final.tEnd)&&r.final.tEnd>0);
    const end=r.path.at(-1);near(end[3],r.final.tEnd);near(end[0],r.final.restAt[0]);near(end[2],r.final.restAt[1]);
    if(r.final.reason==='out')near(Math.min(2.575-end[0],end[0]+13.425,8.5-Math.abs(end[2])),0,1e-9);
    for(const [x,y,z] of r.path){
      const d={x,y,z};assert.ok(C.rimGap(d)>=-.001&&C.boardGap(d)>=-.001&&y>=C.ballRadius-.001,JSON.stringify({p,d}));
    }
    for(const c of r.contacts)assert.ok(c.energyOut<=c.energyIn+1e-9);
    assert.ok(r.contacts.length===0||r.final.tEnd<=r.contacts[0].t+6.00001);
  }
});

verify('44 個見證、單球與比較跨事件、20,000 組配對互斥、211,001 個站位皆可達',()=>{
  const report=require('../tools/mission-proofs/basketball-shot.cjs').verifyAll();
  assert.equal(report.crossEvents.missions,22);
  assert.equal(report.random.maximumAcrossOrders,1);
});
