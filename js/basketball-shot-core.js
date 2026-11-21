(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./projectile-core.js'));
  else root.BasketballShotCore = factory(root.ProjectileCore);
})(globalThis, function (P) {
  'use strict';
  const g = 9.8, rad = Math.PI / 180;
  const rimHeight = 3.05, rimRadius = .225, airDensity = 1.2;
  const court = { freeThrow: 4.23, threePoint: 6.75, boardOffset: .375, boardBottom: 2.90,
    boardWidth: 1.80, boardHeight: 1.05, restitution: .75 };
  const balls = { shot: { mass: .62, diameter: .245, cd: .50 }, throw: { mass: .19, diameter: .097, cd: .35 } };
  const ballRadius = balls.shot.diameter / 2;
  function dragPerMass(ball) {
    const radius = ball.diameter / 2;
    return .5 * airDensity * ball.cd * Math.PI * radius ** 2 / ball.mass;
  }
  function params(p, mode) {
    return { v0: p.speed, theta: p.angle, h0: p.height, g, k: p.drag ? dragPerMass(balls[mode]) : 0 };
  }
  function onBoardFace(y) {
    return y >= court.boardBottom + ballRadius && y <= court.boardBottom + court.boardHeight - ballRadius;
  }
  // Envelope of vacuum trajectories through the point (distance, rimHeight).
  function minimumSpeed(distance, height) {
    const rise = rimHeight - height;
    return { speed: Math.sqrt(g * (Math.hypot(distance, rise) + rise)),
      angle: 45 + Math.atan2(rise, distance) / (2 * rad) };
  }
  function heightEnvelope(speed, distance, height) {
    const v2=speed*speed;
    return height+v2/(2*g)-g*distance*distance/(2*v2);
  }
  function entryProjection(crossing,distance) {
    if(!crossing)return null;
    const sine=-crossing.vy/Math.hypot(crossing.vx,crossing.vy);
    return {opening:2*rimRadius*sine,offset:(crossing.x-distance)*Math.sign(crossing.vx)*sine};
  }
  function step(p, s, dt) {
    if (p.k) return P.rk4(p, s, dt);
    return { t: s.t + dt, x: s.x + dt * s.vx, y: s.y + dt * (s.vy - g * dt / 2),
      vx: s.vx, vy: s.vy - g * dt };
  }
  function rootTime(p, start, dt, before) {
    let lo = 0, hi = dt;
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      if (before(step(p, start, mid))) lo = mid; else hi = mid;
    }
    return step(p, start, hi);
  }
  function bestRange(p) { return P.optimalAngle(params(p, 'throw')); }

  function shot(p) {
    const q = params(p, 'shot'), boardX = p.distance + court.boardOffset - ballRadius;
    let s = P.initialState(q), apex = s, firstRim = null, crossing = null, board = null;
    let clearance = Infinity;
    const points = [[s.x, s.y, 0]];
    // Continue a diagnostic path past a rim contact to answer "was the centre aimed
    // correctly?" These legacy points belong to the first-approach measurements.
    function segment(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, dt = b.t - a.t;
      let top = null;
      if (a.vy > 0 && b.vy <= 0) {
        top = rootTime(q, a, dt, z => z.vy > 0);
        if (top.y > rimHeight && b.y <= rimHeight) crossing = descending(top, b);
      }
      if (a.y >= rimHeight && b.y <= rimHeight && dy < 0) crossing = descending(a, b);
      for (const side of [-1, 1]) {
        const x = p.distance + side * rimRadius;
        const den = dx * dx + dy * dy;
        if (!den) continue;
        const u = Math.min(1, Math.max(0, ((x - a.x) * dx + (rimHeight - a.y) * dy) / den));
        let gap = Math.hypot(a.x + dx * u - x, a.y + dy * u - rimHeight) - ballRadius;
        let closestTime = dt * u;
        if (gap < .14) {
          const approaching = z => (z.x - x) * z.vx + (z.y - rimHeight) * z.vy < 0;
          const closest = !approaching(a) ? a : approaching(b) ? b : rootTime(q, a, dt, approaching);
          closestTime = closest.t - a.t;
          gap = Math.hypot(closest.x - x, closest.y - rimHeight) - ballRadius;
        }
        clearance = Math.min(clearance, gap);
        if (gap > 0 || firstRim) continue;
        const hit = rootTime(q, a, closestTime, z => Math.hypot(z.x - x, z.y - rimHeight) > ballRadius);
        firstRim = { ...hit, side: side < 0 ? 'front' : 'back' };
        points.push([hit.x, hit.y, hit.t]);
      }
      if (top && (!firstRim || top.t <= firstRim.t) && top.y > apex.y) apex = top;
      if (!firstRim) {
        points.push([b.x, b.y, b.t]);
        if (b.y > apex.y) apex = b;
      } else if (firstRim.y > apex.y) apex = firstRim;
    }
    function descending(a, b) {
      const h = rootTime(q, a, b.t - a.t, z => z.y > rimHeight);
      return { ...h, angle: Math.atan2(-h.vy, Math.abs(h.vx)) / rad };
    }
    const dt = 1 / 240;
    while (s.t < 8) { // Longest supported flight is under four seconds.
      let end = step(q, s, dt);
      if (!board && s.vx > 0 && s.x <= boardX && end.x >= boardX) {
        const hit = rootTime(q, s, dt, z => z.x < boardX);
        if (onBoardFace(hit.y)) {
          segment(s, hit);
          const out = { ...hit, vx: -court.restitution * hit.vx };
          board = { t: hit.t, x: hit.x, y: hit.y, vxIn: hit.vx, vyIn: hit.vy, vxOut: out.vx, vyOut: out.vy };
          end = step(q, out, end.t - hit.t);
          s = out;
        }
      }
      if (end.y <= 0 && end.vy < 0) {
        end = rootTime(q, s, end.t - s.t, z => z.y > 0);
        end.y = 0;
        segment(s, end); s = end; break;
      }
      segment(s, end); s = end;
    }
    const end = firstRim || s;
    if (board && board.t > end.t) board = null;
    const scored = !firstRim && !!crossing && Math.abs(crossing.x - p.distance) < rimRadius;
    const bank = scored && board !== null && board.t < crossing.t;
    const events = [];
    if (board) events.push({ type: 'board', t: board.t });
    if (scored) events.push({ type: 'net', t: crossing.t });
    if (firstRim) events.push({ type: 'rim', t: firstRim.t });
    events.sort((a, b) => a.t - b.t);
    const projection=entryProjection(crossing,p.distance);
    return { method: q.k ? 'numeric' : 'analytic', points, T: end.t, R: end.x, H: apex.y, tApex: apex.t,
      vLand: firstRim ? null : Math.hypot(end.vx, end.vy), vxLand: firstRim ? null : end.vx,
      vyLand: firstRim ? null : end.vy, crossing, opening:projection?.opening??null,viewOffset:projection?.offset??null,
      margin:firstRim?0:clearance, rimHit: firstRim, board, scored, bank, events,
      outcome: scored ? (bank ? 'bank' : 'swish') : firstRim ? firstRim.side : 'miss' };
  }
  const dt = 1 / 240;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const rebound = {floor: Math.sqrt(1.06 / 1.80), rim: .55, board: court.restitution, net: .12};
  const friction = {floor: .45, rim: .50, board: .60, net: .10};
  function station(distance, bearing = 0) {
    const limit = Math.min(80, Math.asin(Math.min(1, 7.3 / distance)) / rad);
    const actual = clamp(bearing, -limit, limit), c = Math.cos(actual * rad), s = Math.sin(actual * rad);
    return {bearing: actual, c, s, x: -distance * c, z: distance * s};
  }
  // With gravity and isotropic drag the horizontal heading stays constant in free flight.
  function advance(q, a, h) {
    if (!q.k) return {...a, t:a.t+h, x:a.x+a.vx*h, z:a.z+a.vz*h,
      y:a.y+(a.vy-g*h/2)*h, vy:a.vy-g*h};
    const u = Math.hypot(a.vx,a.vz), b = step(q,{x:0,y:a.y,t:a.t,vx:u,vy:a.vy},h);
    const cx = u ? a.vx/u : 0, cz = u ? a.vz/u : 0;
    return {...a,t:b.t,x:a.x+cx*b.x,z:a.z+cz*b.x,y:b.y,vx:cx*b.vx,vz:cz*b.vx,vy:b.vy};
  }
  const speed = a => Math.hypot(a.vx,a.vy,a.vz);
  const inertia = 2/3 * ballRadius**2; // I/m
  const energy = a => (speed(a)**2 + inertia*(a.wx**2+a.wy**2+a.wz**2))*balls.shot.mass/2;
  function impulse(a, n, e, mu) {
    const [x,y,z] = n, r = ballRadius;
    const vn = a.vx*x + a.vy*y + a.vz*z;
    if (vn >= 0) return a;
    // Surface slip at arm -r*n. J/m is capped by both Coulomb friction and sticking.
    const sx = a.vx-vn*x-r*(a.wy*z-a.wz*y), sy = a.vy-vn*y-r*(a.wz*x-a.wx*z),
      sz = a.vz-vn*z-r*(a.wx*y-a.wy*x);
    const jn = -(1+e)*vn, factor = -Math.min(1/(1+r*r/inertia),mu*jn/(Math.hypot(sx,sy,sz)||1));
    const jx=sx*factor, jy=sy*factor, jz=sz*factor;
    return {...a,vx:a.vx+jn*x+jx,vy:a.vy+jn*y+jy,vz:a.vz+jn*z+jz,
      wx:a.wx-r*(y*jz-z*jy)/inertia,wy:a.wy-r*(z*jx-x*jz)/inertia,wz:a.wz-r*(x*jy-y*jx)/inertia};
  }
  function rimGap(a) {return Math.hypot(Math.hypot(a.x,a.z)-rimRadius,a.y-rimHeight)-ballRadius;}
  function boardVector(a) {
    return [a.x-court.boardOffset,a.y-clamp(a.y,court.boardBottom,court.boardBottom+court.boardHeight),
      a.z-clamp(a.z,-court.boardWidth/2,court.boardWidth/2)];
  }
  const boardGap = a => Math.hypot(...boardVector(a))-ballRadius;
  const floorGap = a => a.y-ballRadius;
  const netDepth = .40, netRadius = y => rimRadius-.10*clamp((rimHeight-y)/netDepth,0,1);
  const netGap = a => Math.hypot(a.x,a.z)-netRadius(a.y);
  // Court limits include one metre of run-off beyond the four boundary lines.
  const boundaryGap = a => Math.min(2.575-a.x, a.x+13.425, 8.5-Math.abs(a.z));
  const normalized = v => {const m=Math.hypot(...v)||1;return v.map(x=>x/m);};
  function normal(type,a) {
    if(type==='floor')return [0,1,0];
    if(type==='board')return normalized(boardVector(a));
    const radius=Math.hypot(a.x,a.z)||1, x=a.x/radius, z=a.z/radius;
    if(type==='net')return normalized([x,-.25,z]);
    return normalized([a.x-x*rimRadius,a.y-rimHeight,a.z-z*rimRadius]);
  }
  function bisect(limit, fn) {
    let low=0, high=limit;
    for(let i=0;i<32;i++){const mid=(low+high)/2;if(fn(mid)>0)low=mid;else high=mid;}
    return high;
  }
  // The swept-distance bound also catches a grazing contact between two positive endpoints.
  function collisionTime(a,b,h,gap,at) {
    const from=gap(a),to=gap(b);
    if (from>0 && to<=0)return bisect(h,t=>gap(at(t)));
    if(from<1e-9 && to<from)return 0;
    if(Math.min(from,to)>(Math.max(speed(a),speed(b))+g*h)*h/2 || from<=0)return Infinity;
    let l=0,r=h;
    for(let i=0;i<18;i++){
      const u=(2*l+r)/3,v=(l+2*r)/3;
      if(gap(at(u))<gap(at(v)))r=v;else l=u;
    }
    const closest=(l+r)/2;
    return gap(at(closest))<=0?bisect(closest,t=>gap(at(t))):Infinity;
  }
  function roll(a,h){
    // During sustained ground contact the support supplies g*h of normal impulse per unit mass.
    const slipX=a.vx+ballRadius*a.wz, slipZ=a.vz-ballRadius*a.wx, slip=Math.hypot(slipX,slipZ);
    const f=Math.min(1/(1+ballRadius**2/inertia),friction.floor*g*h/(slip||1));
    const jx=-f*slipX,jz=-f*slipZ, vx=a.vx+jx,vz=a.vz+jz;
    const drag=Math.max(0,1-.85*h/(Math.hypot(vx,vz)||1));
    return {...a,t:a.t+h,y:ballRadius,vy:0,x:a.x+(a.vx+vx*drag)*h/2,z:a.z+(a.vz+vz*drag)*h/2,
      vx:vx*drag,vz:vz*drag,wx:(a.wx-ballRadius*jz/inertia)*drag,
      wz:(a.wz+ballRadius*jx/inertia)*drag,wy:a.wy*drag};
  }
  function simulate(p, spot, diagnostic=false) {
    const q=params(p,'shot'), v=p.speed*Math.cos(p.angle*rad), spin=2*Math.PI*(p.spinHz??2.5);
    let a={x:spot.x,y:diagnostic?p.height:Math.max(ballRadius,p.height),z:spot.z,t:0,
      vx:v*spot.c,vy:p.speed*Math.sin(p.angle*rad),vz:-v*spot.s,wx:spin*spot.s,wy:0,wz:spin*spot.c};
    const path=[],contacts=[], spins=[], points=[], events=[];
    let firstRim=null,board=null,crossing=null,apex=a,clearance=Infinity;
    let clearedAt=Infinity,made=false,inNet=false,rolled=false,enteredFromAbove=false,firstTime=Infinity,reason='time';
    const along=b=>p.distance+b.x*spot.c-b.z*spot.s;
    const planar=b=>({x:along(b),y:b.y,t:b.t,vx:b.vx*spot.c-b.vz*spot.s,vy:b.vy,
      lateral:b.x*spot.s+b.z*spot.c,worldX:b.x,worldZ:b.z,worldVx:b.vx,worldVz:b.vz});
    function sample(b){
      if(diagnostic){if(!firstRim)points.push([along(b),b.y,b.t]);}
      else if(path.at(-1)?.[3]!==b.t)path.push([b.x,b.y,b.z,b.t]);
    }
    function addContact(type,b,out){
      firstTime=Math.min(firstTime,b.t);
      contacts.push({type,t:b.t,x:b.x,y:b.y,z:b.z,speedIn:speed(b),speedOut:speed(out),
        horizontalIn:Math.hypot(b.vx,b.vz),energyIn:energy(b),energyOut:energy(out)});
      spins.push([b.t,out.wx,out.wy,out.wz]);
    }
    sample(a);spins.push([0,a.wx,a.wy,a.wz]);
    while(a.t<Math.min(10,firstTime+6)-1e-10){
      let left=Math.min(dt,firstTime+6-a.t);
      while(left>1e-10){
        if(rolled){
          let end=roll(a,left);
          if(boundaryGap(end)<=0){
            end=roll(a,bisect(left,t=>boundaryGap(roll(a,t))));
            reason='out';
          }
          a=end;sample(a);spins.push([a.t,a.wx,a.wy,a.wz]);break;
        }
        const at=t=>advance(q,a,t);
        let b=at(left),hit=null,h=left;
        function consider(type,gap){
          const t=collisionTime(a,b,left,gap,at);
          if(t<=h){h=t;hit=type;}
        }
        if(Math.min(a.y,b.y)<4.10&&Math.max(a.y,b.y)>2.74&&Math.min(Math.abs(a.x-.375),Math.abs(b.x-.375))<.22&&Math.abs(a.z)<1.13&&(!diagnostic||!board))consider('board',boardGap);
        if(Math.abs(a.y-rimHeight)<.25&&Math.hypot(a.x,a.z)<.45&&(!diagnostic||!firstRim))consider('rim',rimGap);
        if(diagnostic){
          if(b.y<=0&&b.vy<0){const t=bisect(left,t=>at(t).y);if(t<h){h=t;hit='end';}}
        }else if(!rolled && b.y<=ballRadius && b.vy<0)consider('floor',floorGap);
        if(!diagnostic){
          if(boundaryGap(b)<=0)consider('outside',boundaryGap);
          const bottom=rimHeight-netDepth;
          if(!inNet&&Math.max(a.y,b.y)>=bottom&&Math.min(a.y,b.y)<=rimHeight&&Math.hypot(a.x,a.z)<.40){
            const fromTop=a.y>=rimHeight&&b.y<rimHeight;
            const fromBottom=a.y<=bottom&&b.y>bottom;
            if(fromTop||fromBottom){
              const t=bisect(left,fromTop?t=>at(t).y-rimHeight:t=>bottom-at(t).y);
              if(t<h&&netGap(at(t))<0){h=t;hit=fromTop?'mouth-top':'mouth-bottom';}
            }
            if(netGap(a)>0&&netGap(b)<=0){
              const t=bisect(left,t=>netGap(at(t)));
              const y=at(t).y;
              if(t<h&&y>=bottom&&y<=rimHeight){h=t;hit='net';}
            }
          }
        }
        if(hit)b=at(h);
        if(!firstRim&&diagnostic){
          if(a.vy>0&&b.vy<=0){const top=at(bisect(h,t=>at(t).vy));if(top.y>apex.y)apex=top;}
          if(b.y>apex.y)apex=b;
          clearance=Math.min(clearance,rimGap(b));
          if(rimGap(b)<.15){
            let l=0,r=h;
            for(let i=0;i<14;i++){const u=(2*l+r)/3,w=(l+2*r)/3;if(rimGap(at(u))<rimGap(at(w)))r=w;else l=u;}
            clearance=Math.min(clearance,rimGap(at((l+r)/2)));
          }
        }
        if(diagnostic&&a.y>=rimHeight&&b.y<rimHeight&&b.vy<0){
          const cross=at(bisect(h,t=>at(t).y-rimHeight));
          crossing={...planar(cross),angle:Math.atan2(-cross.vy,Math.hypot(cross.vx,cross.vz))/rad};
        }
        sample(b);
        if(hit==='outside'){a=b;reason='out';break;}
        if(hit==='mouth-top'||hit==='mouth-bottom'){
          inNet=true;enteredFromAbove=hit==='mouth-top';
          addContact('net',b,b);a=b;left-=h;continue;
        }
        if(diagnostic&&hit==='end'){a=b;break;}
        if(hit){
          const n=normal(hit,b);
          if(hit==='rim'&&!firstRim)firstRim={...planar(b),side:along(b)<p.distance?'front':'back'};
          if(!diagnostic||hit==='board'){
            let out=impulse(b,n,rebound[hit],hit==='board'&&!contacts.length?0:friction[hit]);
            if(hit==='board'&&!board)board={...planar(b),vxIn:planar(b).vx,vyIn:b.vy,vxOut:planar(out).vx,vyOut:out.vy};
            if(hit==='floor'&&out.vy<.30){rolled=true;out.vy=0;}
            addContact(hit,b,out);
            // Move a fraction of a micron outside the contact manifold before consuming the remainder.
            b={...out,x:b.x+n[0]*1e-7,y:b.y+n[1]*1e-7,z:b.z+n[2]*1e-7};
          }
        }
        if(!diagnostic&&inNet&&h>0){
          const radial=Math.hypot(b.x,b.z);
          if(enteredFromAbove&&b.y<rimHeight-ballRadius&&radial<rimRadius){made=true;clearedAt=Math.min(clearedAt,b.t);}
          if(b.y<rimHeight-netDepth||b.y>rimHeight+.001||radial>rimRadius)inNet=false;
          else if(radial<=netRadius(b.y)){
            const damp=Math.exp(-12*h);
            b.vx=b.vx*damp-6*b.x*(1-damp);b.vz=b.vz*damp-6*b.z*(1-damp);
            b.vy*=Math.exp(-1.8*h);
          }
        }
        a=b;left-=Math.max(h,1e-9);
      }
      if(diagnostic){if(a.y<=1e-8&&a.vy<0)break;}
      else {
        if(rolled&&speed(a)<.05){reason='rest';break;}
        if(reason==='out')break;
      }
    }
    if(diagnostic){
      const end=firstRim||planar(a);
      if(board&&board.t>end.t)board=null;
      const scored=!firstRim&&!!crossing&&Math.hypot(crossing.worldX,crossing.worldZ)<rimRadius;
      const bank=scored&&!!board&&board.t<crossing.t;
      if(board)events.push({type:'board',t:board.t});
      if(scored)events.push({type:'net',t:crossing.t});
      if(firstRim)events.push({type:'rim',t:firstRim.t});
      const opening=crossing?2*rimRadius*Math.sin(crossing.angle*rad):null;
      const projected=crossing?(crossing.worldX*crossing.worldVx+crossing.worldZ*crossing.worldVz)/
        (Math.hypot(crossing.worldVx,crossing.worldVz)||1):0;
      return {method:q.k?'numeric':'analytic',points,T:end.t,R:end.x,H:apex.y,tApex:apex.t,
        vLand:firstRim?null:speed(a),vxLand:firstRim?null:end.vx,vyLand:firstRim?null:end.vy,
        crossing,opening,viewOffset:crossing?projected*opening/(2*rimRadius):null,
        margin:firstRim?0:clearance,rimHit:firstRim,board,scored,bank,events,
        outcome:scored?(bank?'bank':'swish'):firstRim?firstRim.side:'miss'};
    }
    const beforeBasket=contacts.filter(c=>c.t<=clearedAt);
    const rim=beforeBasket.some(c=>c.type==='rim'),glass=beforeBasket.some(c=>c.type==='board');
    const how=made?(rim?(glass?'bank-rim-in':'rim-in'):glass?'bank':'swish'):
      firstRim?'rim-out':board?'board-out':'airball';
    return {path,contacts,spins,final:{made,how,restAt:[a.x,a.z],tEnd:a.t,reason}};
  }
  // Keep impact cusps and local extrema even when the screen needs far fewer samples.
  function displayPath(result,limit) {
    const pts=result.path, stride=Math.max(1,Math.floor(pts.length/limit));
    const hits=new Set(result.contacts.map(e=>e.t));
    return pts.filter((q,i)=>i===0||i===pts.length-1||i%stride===0||hits.has(q[3])||
      (q[1]-pts[i-1][1])*(pts[i+1][1]-q[1])<0);
  }
  function launch(p) {
    if (p.mode !== 'throw') {
      p={...p}; // Bind the lazy physical continuation to this release.
      const spot=station(p.distance,p.bearing);
      const result=spot.bearing===0?shot(p):simulate(p,spot,true);
      let physical;
      for(const key of ['path','contacts','spins','final'])Object.defineProperty(result,key,{
        enumerable:true,get(){physical??=simulate(p,spot);return physical[key];}
      });
      return Object.assign(result,{bearing:spot.bearing,station:spot,distance:p.distance});
    }
    const r = P.predict(params(p, 'throw'));
    return { ...r, landingAngle: Math.atan2(-r.vyLand, r.vxLand) / rad, outcome: 'land',
      events: [], scored: false, margin: null, crossing: null, opening: null, board: null, rimHit: null, bank: false };
  }
  function measurement(p, result, best) {
    const r={};
    for(const key of Object.keys(result)){
      if(!['points','events','path','contacts','spins','final'].includes(key))r[key]=result[key];
    }
    return { ...p, ...r, get final(){return result.final;}, get firstContact(){return result.contacts?.[0]?.type;}, bestAngle: best?.theta ?? null, bestRange: best?.R ?? null,
      envelope:p.mode==='shot'&&!p.drag?heightEnvelope(p.speed,p.distance,p.height):null,
      minimum: p.mode === 'shot' && !p.drag ? minimumSpeed(p.distance, p.height) : null };
  }
  return { launch, displayPath, station, rimGap, boardGap, impulse, rebound, bestRange, minimumSpeed, heightEnvelope, entryProjection, measurement, dragPerMass, onBoardFace,
    court, balls, rimHeight, rimRadius, ballRadius, airDensity, g };
});
