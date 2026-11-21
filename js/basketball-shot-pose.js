/* Local athlete coordinates in metres: +x towards the target, +y up, +z shooting side.
 * Pelvis and shoes share a ballistic translation. The ball and both palms are
 * constrained before release. Once released the caller supplies the actual ball. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BasketballShotPose = factory();
})(globalThis, function () {
  'use strict';
  const H = 1.80, g = 9.8, rad = Math.PI / 180;
  const lengths = Object.freeze({ thigh: .245*H, shin: .246*H, upper: .186*H,
    fore: .146*H, hand: .108*H, foot: .152*H, trunk: .501 });
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  const mix = (a,b,u) => a+(b-a)*u;
  function ease(a,b,t) {
    const u=clamp((t-a)/(b-a),0,1);
    return u*u*(3-2*u);
  }
  const add=(a,b)=>a.map((v,i)=>v+b[i]), sub=(a,b)=>a.map((v,i)=>v-b[i]);
  const mul=(v,k)=>v.map(x=>x*k), blend=(a,b,u)=>a.map((x,i)=>mix(x,b[i],u));
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const unit=v=>mul(v,1/(Math.hypot(...v)||1));
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  function rotateFromTo(point,from,to) {
    const k=cross(from,to), first=cross(k,point);
    return add(add(point,first),mul(cross(k,first),1/(1+dot(from,to))));
  }
  const turnZ=(p,a)=>[p[0]*Math.cos(a)-p[1]*Math.sin(a),p[0]*Math.sin(a)+p[1]*Math.cos(a),p[2]];
  // These are the wrist crease, palm pad and middle fingertip on a cupped hand.
  // The detailed hand mesh uses the same spherical grip and the same rotation.
  function gripFrame(radius,side) {
    const n=unit(side>0?[-.4,-.7,.59]:[-.21,.03,-.98]);
    const axis=side>0?[1,.10,0]:[.54,.84,0];
    const tangent=unit(sub(axis,mul(n,dot(n,axis))));
    const pad=(along,lift)=>mul(add(mul(n,Math.cos(along/radius)),mul(tangent,Math.sin(along/radius))),radius+lift);
    const wrist=pad(-.078,.023);
    return {from:unit(mul(wrist,-1)),palm:sub(pad(-.021,.024),wrist),finger:sub(pad(.079,.0014),wrist)};
  }
  const grips={shot:[gripFrame(.1225,-1),gripFrame(.1225,1)],throw:[gripFrame(.0485,-1),gripFrame(.0485,1)]};
  function limb(start,target,pole,a,b,maxFlex) {
    const axis=unit(sub(target,start));
    const d=clamp(Math.hypot(...sub(target,start)),Math.sqrt(a*a+b*b+2*a*b*Math.cos(maxFlex*rad)),a+b-.00001);
    const along=(d*d+a*a-b*b)/(2*d);
    const orth=unit(sub(pole,mul(axis,dot(axis,pole))));
    return [add(add(start,mul(axis,along)),mul(orth,Math.sqrt(Math.max(0,a*a-along*along)))),add(start,mul(axis,d))];
  }
  function jumpPlan(p) {
    const soft=p.mode==='throw', standing=soft?2.08:2.13, cap=soft?.92:.85;
    const height=clamp(p.height-standing,0,cap), half=Math.sqrt(2*height/g);
    const apex=Math.min(.022,half*.12);
    return {height,cap,standing,apex,takeoff:apex-half,landing:apex+half};
  }
  const duration=p=>p.mode==='throw'?.8:.7;
  function sample(t,p,tracked,aiming=false) {
    const soft=p.mode==='throw', h=p.height, jump=jumpPlan(p), low=1-ease(.72,1.20,h);
    const angle=p.angle*rad, bearing=(p.bearing||0)*rad, radius=soft?.0485:.1225;
    const air=Math.max(0,jump.height-.5*g*(t-jump.apex)**2);
    const atRelease=Math.max(0,jump.height-.5*g*jump.apex**2);
    const length=duration(p), dip=ease(-length,-.47,t)*(1-ease(-.47,Math.min(-.10,jump.takeoff),t));
    const extend=ease(-.47,Math.min(-.08,jump.takeoff),t);
    const rest=ease(.50,1.02,t), absorb=jump.height>0&&t>jump.landing ?
      Math.sin(Math.PI*clamp((t-jump.landing)/.28,0,1))**2 : 0;
    const upright=ease(.05,1.86,h-atRelease), hipEnd=mix(.456,.949,upright);
    const leanEnd=mix(1.36,.045,upright);
    const hipY=mix(hipEnd-(1-extend)*.045*(1-low)-dip*.145*(1-low),.908,rest)-.11*absorb;
    const lean=mix(leanEnd+.20*dip*(1-low),.08,rest)+.13*absorb;
    const stride=soft?ease(-.64,-.20,t):0;
    const wind=soft?ease(-.76,-.38,t)*(1-ease(-.26,.10,t)):0;
    const hipYaw=soft?-.66*(1-ease(-.37,-.06,t))+.17*ease(-.27,.08,t)*(1-rest):0;
    const yaw=soft?-.94*(1-ease(-.22,0,t))+.27*ease(0,.19,t)*(1-rest):0;
    // At release choose the stance setback from the length of the extended arm.
    // Low releases take the ball from above to keep the wrist clear of the floor.
    const gripAxis=side=>unit([mix(.49,.10,ease(1.65,2.14,h-atRelease)),
      mix(.94,-.95,1-ease(.06,.44,h)), -side*.48]);
    const gripLength=radius+.023, grip=gripAxis(1);
    const dy=h-atRelease-grip[1]*gripLength-hipEnd-lengths.trunk*Math.cos(leanEnd);
    const dz=-grip[2]*gripLength-.185;
    const setback=Math.sqrt(Math.max(.001,.589**2-dy*dy-dz*dz));
    const hipX=-grip[0]*gripLength-setback*(aiming?.55:1)-lengths.trunk*Math.sin(leanEnd);
    const hip=[hipX-(1-extend)*(soft?.16:.05)-.06*dip,hipY+air,0];
    const axis=[Math.sin(lean)*Math.cos(yaw),Math.cos(lean),-Math.sin(lean)*Math.sin(yaw)];
    const trunk=add(hip,mul(axis,lengths.trunk)), neck=add(hip,mul(axis,.609));
    const eyeLevel=neck[1]+.118;
    const aim=tracked||[p.distance||5,soft?h:3.05,0];
    const gazePitch=clamp(Math.atan2(aim[1]-eyeLevel,Math.max(.12,aim[0]-neck[0])),-.58,.62);
    const gazeYaw=clamp(-Math.atan2(aim[2]||0,Math.max(.12,aim[0]-neck[0])),-.78,.78);
    const head=add(neck,[-.118*Math.sin(gazePitch)*Math.cos(gazeYaw),.118*Math.cos(gazePitch),.118*Math.sin(gazePitch)*Math.sin(gazeYaw)]);
    const releaseV=[p.speed*Math.cos(angle),p.speed*Math.sin(angle),0];
    const gather=add(trunk,[.33,-.13,0]), lowered=add(trunk,[.32,-.32,0]);
    const set=add(trunk,soft?[-.25,.17,.25]:[.255,mix(.34,-.28,low),0]);
    let held=blend(blend(gather,lowered,ease(-length,-.47,t)),set,ease(-.46,-.18,t));
    if(soft)held=add(held,[-.12*wind,.045*wind,.065*wind]);
    // The terminal hand path has the exact release tangent. Limit the backswing
    // distance independently of speed so a high speed never lengthens an arm.
    const tau=Math.min(0,t), approach=.070*Math.expm1(tau*p.speed/.070);
    const terminal=[approach*Math.cos(angle),Math.max(0,h+approach*Math.sin(angle)),0];
    held=blend(held,terminal,ease(-.17,0,t));
    if(t>=0)held=[0,h,0];
    const legs=[],arms=[];
    let inHand=held;
    for(const side of [-1,1]) {
      const hipJoint=add(hip,[side*.094*Math.sin(hipYaw),0,side*.094*Math.cos(hipYaw)]);
      const step=soft&&side===-1?stride:0;
      const lift=soft&&side===-1?.072*Math.sin(Math.PI*step):0;
      const ankle=[hipX+(soft?(side<0?-.09+.29*step:-.21):side*.12),.104+air+lift,side*.135];
      const [knee]=limb(hipJoint,ankle,[1,0,side*.10],lengths.thigh,lengths.shin,140);
      const heel=add(ankle,[-.081,-.104,0]),toe=add(heel,[lengths.foot,0,0]);
      legs.push({hip:hipJoint,knee,ankle,heel,toe});
      const shoulder=add(trunk,[side*.185*Math.sin(yaw),0,side*.185*Math.cos(yaw)]);
      const hold=gripAxis(side);
      const follow=ease(0,.105,t);
      const turn=(soft?-.69:-1.26)*follow*(1-rest);
      const handAxis=unit([hold[0]*Math.cos(turn)-hold[1]*Math.sin(turn),
        hold[0]*Math.sin(turn)+hold[1]*Math.cos(turn),hold[2]]);
      let target=sub(held,mul(hold,gripLength));
      if(t>0){
        target[1]+=air-atRelease-.11*absorb;
        const sweep=soft?(side>0?.23:-.12):side>0?.025:-.09;
        target=add(target,[sweep*follow,(soft?-.27:side>0?-.008:-.13)*follow,-side*(soft?.18:.018)*follow]);
        target=blend(target,add(shoulder,[.13,-.49,side*.047]),rest);
      }
      // The free arm points into the stride as the throwing arm cocks.
      if(soft&&side<0)target=blend(target,add(shoulder,[.42,-.06,-.07]),wind);
      const pole=soft?[.04,-.52,side*1.05]:[.38,-1,side*.30];
      const [elbow,wrist]=limb(shoulder,target,pole,lengths.upper,lengths.fore,150);
      if(side===1)inHand=add(wrist,mul(handAxis,gripLength));
      const frame=grips[soft?'throw':'shot'][side>0?1:0];
      const place=q=>add(wrist,turnZ(rotateFromTo(q,frame.from,hold),turn));
      const palm=place(frame.palm),finger=place(frame.finger);
      arms.push({shoulder,elbow,wrist,palm,finger,hold,turn,handAxis});
    }
    const ball=t<0?inHand:t===0?[0,h,0]:tracked||[releaseV[0]*t,h+releaseV[1]*t-.5*g*t*t,0];
    return {hip,trunk,neck,head,legs,arms,ball,releaseV,air,jump,lean,yaw,hipYaw,gazePitch,gazeYaw,bearing};
  }
  // The collision solver starts a finite basketball at radius height. Below
  // that height join the visual release to its path before the first contact.
  function courtHeight(height,y,t,firstContact=1) {
    const delta=.1225-height;
    if(delta<=0)return y;
    const join=Math.min(.12,firstContact*.8);
    return y-delta*(1-ease(0,Math.max(1e-9,join),t));
  }
  function flightPoint(p,a,b,t,firstContact) {
    const dt=b[2]-a[2],u=dt?clamp((t-a[2])/dt,0,1):0;
    const point=blend(a,b,u);
    if(a[2]===0 && dt>0){
      const th=p.angle*rad,correction=u*(1-u)**2;
      // Match the specified initial velocity between the first two sampled points.
      point[0]+=correction*(p.speed*Math.cos(th)*dt-(b[0]-a[0]));
      point[1]+=correction*(p.speed*Math.sin(th)*dt-(b[1]-a[1]));
    }
    if(p.mode==='shot')point[1]=courtHeight(p.height,point[1],t,firstContact);
    return point;
  }
  return {sample,duration,jumpPlan,lengths,courtHeight,flightPoint};
});
