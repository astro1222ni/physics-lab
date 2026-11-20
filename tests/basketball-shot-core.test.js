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
verify('有效開口小於球徑，即使對準仍碰前框，動畫停在接觸點',()=>{
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
verify('40 個見證、單球與比較跨事件、20,000 組配對互斥、211,001 個站位皆可達',()=>{
  const report=require('../tools/mission-proofs/basketball-shot.cjs').verifyAll();
  assert.equal(report.crossEvents.missions,20);
  assert.equal(report.random.maximumAcrossOrders,1);
});
