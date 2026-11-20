(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PerspectiveDrawingCore = factory();
})(globalThis, function () {
  'use strict';
  const RAD = Math.PI / 180, EPS = 1e-9, NEAR = 0.045;
  // 右手世界座標：+x 向右，+y 向上，正面看向 −z。滑桿 z 顯示沿街的正距離。
  const FOCAL_LENGTH = 1, FRAME_DEPTH = 1.9;
  const defaults = { yaw: 0, pitch: 0, x: -2.35, z: 7.8, size: 2.6, fov: 68 };
  const fixed = { id: 'B', x: 3.45, z: -10.8, w: 3.25, h: 4.55, style: 'ochre' };
  const axes = [[1,0,0], [0,1,0], [0,0,-1]];
  const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const sub = (a,b) => a.map((v,i) => v-b[i]);
  const mix = (a,b,t) => a.map((v,i) => v + (b[i]-v)*t);
  function camera(yaw,pitch) {
    const sy = Math.sin(yaw*RAD), cy = Math.cos(yaw*RAD);
    const sp = Math.sin(pitch*RAD), cp = Math.cos(pitch*RAD);
    return { eye:[0,1.6,0], right:[cy,0,sy], up:[-sy*sp,cp,cy*sp], forward:[sy*cp,sp,-cy*cp] };
  }
  function project(v,cam,point=true) {
    const ray = point ? sub(v,cam.eye) : v, depth = dot(ray,cam.forward);
    if (point ? depth < NEAR-1e-10 : Math.abs(depth)<EPS) return null;
    return [FOCAL_LENGTH*dot(ray,cam.right)/depth, FOCAL_LENGTH*dot(ray,cam.up)/depth];
  }
  function onPlane(cam,uv,depth=FOCAL_LENGTH) {
    return cam.eye.map((e,i) => e+depth*(cam.forward[i]+(uv[0]*cam.right[i]+uv[1]*cam.up[i])/FOCAL_LENGTH));
  }
  function groundAt(cam,uv,height=0) {
    const ray = sub(onPlane(cam,uv),cam.eye);
    if (Math.abs(ray[1]) < EPS) return null;
    const t = (height-cam.eye[1])/ray[1];
    return t*FOCAL_LENGTH>=NEAR ? onPlane(cam,uv,t*FOCAL_LENGTH) : null;
  }
  function box(x,z,size,height) {
    const s=size/2;
    const floor=[[x-s,0,z+s],[x+s,0,z+s],[x+s,0,z-s],[x-s,0,z-s]];
    return floor.concat(floor.map(([px,,pz])=>[px,height,pz]));
  }
  function paper(fov,aspect) {
    const u=FOCAL_LENGTH*Math.tan(fov*RAD/2), v=u/aspect;
    return {u,v,aspect,horizontalFov:fov,verticalFov:2*Math.atan(v/FOCAL_LENGTH)/RAD,focalLength:FOCAL_LENGTH};
  }
  const inside = (p,s) => !!p && Math.abs(p[0])<=s.u+EPS && Math.abs(p[1])<=s.v+EPS;
  function projectSegment(a,b,cam) {
    const da=dot(sub(a,cam.eye),cam.forward), db=dot(sub(b,cam.eye),cam.forward);
    if(da<NEAR && db<NEAR)return [];
    if(da>=NEAR && db>=NEAR)return [project(a,cam),project(b,cam)];
    const cut=mix(a,b,(NEAR-da)/(db-da));
    return da<NEAR ? [project(cut,cam),project(b,cam)] : [project(a,cam),project(cut,cam)];
  }
  function projectShape(points,cam,closed) {
    if(!closed && points.length===2)return projectSegment(points[0],points[1],cam);
    const depths=points.map(p=>dot(sub(p,cam.eye),cam.forward));
    if (depths.every(z=>z>=NEAR)) return points.map(p=>project(p,cam));
    if (depths.every(z=>z<NEAR)) return [];
    const clipped=[];
    for (let i=0;i<points.length;i++) {
      const j=(i+1)%points.length;
      if (depths[i]>=NEAR) clipped.push(points[i]);
      if ((closed || j!==0) && (depths[i]>=NEAR)!==(depths[j]>=NEAR))
        clipped.push(mix(points[i],points[j],(NEAR-depths[i])/(depths[j]-depths[i])));
    }
    return clipped.map(p=>project(p,cam));
  }
  // 在紙的四條邊上裁線，可同時處理線段、射線和無限長直線。
  function clipLine(a,b,s,lo=0,hi=1) {
    for (let i=0;i<2;i++) {
      const lim=i===0?s.u:s.v, d=b[i]-a[i];
      if (Math.abs(d)<EPS) { if (Math.abs(a[i])>lim) return null; continue; }
      const k=(-lim-a[i])/d, l=(lim-a[i])/d;
      lo=Math.max(lo,Math.min(k,l)); hi=Math.min(hi,Math.max(k,l));
    }
    return lo+EPS<hi ? [mix(a,b,lo),mix(a,b,hi)] : null;
  }
  function intersection(a,b,c,d) {
    const u=sub(b,a),v=sub(d,c),w=sub(c,a);
    const cross=(p,q)=>p[0]*q[1]-p[1]*q[0];
    const n=Math.hypot(...u),m=Math.hypot(...v),den=cross(u,v);
    if (n<EPS || m<EPS) return {kind:'point'};
    if (Math.abs(den)<EPS*n*m) return {kind:Math.abs(cross(w,u))<EPS*n?'coincident':'parallel'};
    return {kind:'finite',uv:mix(a,b,cross(w,v)/den)};
  }
  function studioLot(p) {
    return {id:'A',x:p.x,z:-p.z,w:p.size,h:p.size*1.4,style:'studio'};
  }
  // Each front-facing wall or roof casts a convex shadow cone from the fixed eye.
  // Intersect a world segment with its side planes and the plane behind the face.
  const cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const eyePosition=[0,1.6,0];
  function shadowFaces(lot){
    const wall=box(lot.x,lot.z,lot.w,lot.h), top=box(lot.x,lot.z,lot.w*.73,lot.h*1.13).slice(4);
    const faces=[];
    function face(v,insidePoint=[lot.x,lot.h*.5,lot.z]){
      let normal=cross3(sub(v[1],v[0]),sub(v[2],v[0]));
      const opposite=insidePoint?dot(normal,sub(insidePoint,v[0]))>0:dot(normal,sub(eyePosition,v[0]))<0;
      if(opposite)normal=normal.map(x=>-x);
      if(dot(normal,sub(eyePosition,v[0]))<=EPS)return;
      const middle=v.reduce((a,p)=>a.map((x,j)=>x+p[j]/v.length),[0,0,0]);
      const planes=v.map((p,i)=>{
        let n=cross3(sub(p,eyePosition),sub(v[(i+1)%v.length],eyePosition));
        if(dot(n,sub(middle,eyePosition))<0)n=n.map(x=>-x);
        return [n,dot(n,eyePosition)];
      });
      const back=normal.map(x=>-x);
      planes.unshift([back,dot(back,v[0])+1e-7*Math.hypot(...back)]);
      faces.push(planes);
    }
    for(let i=0;i<4;i++){
      const j=(i+1)%4;
      face([wall[i],wall[j],wall[j+4],wall[i+4]]);
      face([wall[i+4],wall[j+4],top[j],top[i]]);
    }
    face(top);
    const {x,z,w,h}=lot,front=z+w/2;
    // The shop awning, dormer and chimney project beyond the opaque wall / hip roof.
    const l=x-.47*w,r=x+.076*w,tip=front+.16*w,back=front+.015*w;
    face([[l,.381*h,back],[r,.381*h,back],[r,.329*h,tip],[l,.329*h,tip]],null);
    face([[l,.329*h,tip],[r,.329*h,tip],[r,.296*h,tip],[l,.296*h,tip]],null);
    if(lot.id==='A'){
      const a=x-.16*w,b=x+.16*w,f=front-.014*w,k=front-.18*w,y=h*1.003,peak=h*1.168;
      face([[a,y,f],[b,y,f],[x,peak,f]],null);
      for(const side of [a,b])face([[side,y,f],[x,peak,f],[x,peak,k],[side,y,k]],null);
    }
    if(lot.id==='B'){
      const cx=x+.26*w,cz=z+.025*w;
      for(const [bottom,height,span] of [[1.10,1.24,.136],[1.24,1.269,.17]]){
        const q=box(cx,cz,w*span,h*height),middle=[cx,h*(height+bottom)/2,cz];
        for(let i=0;i<4;i++)q[i][1]=bottom*h;
        for(let i=0;i<4;i++){const j=(i+1)%4;face([q[i],q[j],q[j+4],q[i+4]],middle);}
        face(q.slice(4),middle);
      }
      const sign=(u,y)=>[x-w*.5-u*w,h*y,front-.11*w];
      face([sign(.045,.503),sign(.21,.503),sign(.21,.383),sign(.045,.383)],null);
    }
    return faces;
  }
  const faceCache=new WeakMap();
  function blockers(lot){
    if(!faceCache.has(lot))faceCache.set(lot,shadowFaces(lot));
    return faceCache.get(lot);
  }
  function visibleRanges(a,b,faces){
    const delta=sub(b,a),hidden=[];
    for(const planes of faces){
      let lo=0,hi=1;
      for(const [n,d] of planes){
        const start=dot(n,a)-d,rate=dot(n,delta);
        if(Math.abs(rate)<EPS){if(start<0){hi=-1;break;}}
        else if(rate>0)lo=Math.max(lo,-start/rate);
        else hi=Math.min(hi,-start/rate);
        if(hi<=lo)break;
      }
      if(hi>lo+EPS)hidden.push([lo,hi]);
    }
    let from=0;const visible=[];
    for(const [lo,hi] of hidden.sort((i,j)=>i[0]-j[0])){
      if(lo>from+EPS)visible.push([from,lo]);
      from=Math.max(from,hi);
    }
    if(from<1-EPS)visible.push([from,1]);
    return visible;
  }
  function exposed(a,b,cam,faces){
    return visibleRanges(a,b,faces).map(([lo,hi])=>projectSegment(mix(a,b,lo),mix(a,b,hi),cam)).filter(line=>line.length===2);
  }
  function projectBuilding(lot,cam,sheet,faces) {
    const points=box(lot.x,lot.z,lot.w,lot.h), projected=points.map(p=>project(p,cam));
    const front=cam.eye[2]>=lot.z?[0,1]:[3,2];
    front.sort((a,b)=>Math.abs(points[a][0]-cam.eye[0])-Math.abs(points[b][0]-cam.eye[0]));
    let measuredEdge=null,apparent=null,status='outside';
    for(const i of front){
      const a=points[i],b=points[i+4],line=projectSegment(a,b,cam);
      if(line.length!==2 || !clipLine(...line,sheet))continue;
      const spans=exposed(a,b,cam,faces);
      if(!spans.some(s=>clipLine(...s,sheet))){status='occluded';continue;}
      measuredEdge=i;apparent=spans.reduce((sum,s)=>sum+Math.hypot(...sub(...s)),0);
      status=apparent+1e-6<Math.hypot(...sub(...line))?'partial':'visible';break;
    }
    return {id:lot.id,lot,points,projected,measuredEdge,apparent,status};
  }
  function view(input,aspect=1.5,buildings) {
    const p={...defaults,...input},cam=camera(p.yaw,p.pitch),sheet=paper(p.fov,aspect);
    const sceneLots=buildings??[studioLot(p),...lots], faces=sceneLots.flatMap(blockers);
    const models=sceneLots.map(lot=>projectBuilding(lot,cam,sheet,faces));
    const a=models.find(b=>b.id==='A'), b=models.find(b=>b.id==='B');
    const vanishing=axes.map(axis=>project(axis,cam,false));
    const horizon=Math.abs(Math.cos(p.pitch*RAD))<EPS?null:-FOCAL_LENGTH*Math.tan(p.pitch*RAD);
    return {p,cam,sheet,faces,buildings:models,points:a?.points??[],projected:a?.projected??[],
      projectedB:b?.projected??[],apparent:a?.apparent??null,otherHeight:b?.apparent??null,
      vanishing,horizon,count:vanishing.filter(Boolean).length};
  }
  function frameTargets(r) {
    const targets=[];
    for(const b of r.buildings.filter(b=>b.id==='A' || b.id==='B')){
      const rightSide=b.lot.x<r.cam.eye[0];
      const front=b.lot.z<=r.cam.eye[2] ? [0,1] : [3,2];
      const near=front[rightSide?1:0],far=front[rightSide?0:1];
      for(const corner of [near+4,far+4,near,far]){
        const uv=b.projected[corner],vertex=b.points[corner];
        if(inside(uv,r.sheet) && visibleRanges(vertex,vertex,r.faces).length && dot(sub(vertex,r.cam.eye),r.cam.forward)>FRAME_DEPTH){
          targets.push({key:b.id+corner,owner:b.id,corner,vertex,uv,hit:onPlane(r.cam,uv,FRAME_DEPTH)});
        }
      }
    }
    return targets;
  }
  function measure(r) {
    const [vx,vy,vz]=r.vanishing;
    const strictInside=v=>v && Math.abs(v[0])<r.sheet.u-EPS && Math.abs(v[1])<r.sheet.v-EPS;
    return {...r.p,vanishing:r.vanishing,horizon:r.horizon,count:r.count,apparent:r.apparent,
      otherHeight:r.otherHeight,realHeight:r.buildings.find(b=>b.id==='A')?.lot.h??null,
      visibilityA:r.buildings.find(b=>b.id==='A')?.status,visibilityB:r.buildings.find(b=>b.id==='B')?.status,
      fixedHeight:r.buildings.find(b=>b.id==='B')?.lot.h??null,
      heightRatio:r.otherHeight>0 && r.apparent!=null ? r.apparent/r.otherHeight : null,
      horizontalInside:Number(inside(vx,r.sheet))+Number(inside(vz,r.sheet)),
      horizontalInterior:[vx,vz].filter(strictInside).length,
      verticalInside:inside(vy,r.sheet),verticalFov:r.sheet.verticalFov,halfHeight:r.sheet.v,anchor:r.projected[0]??null};
  }

  // 街景圖元保留世界座標，兩個檢視使用同一份面、輪廓與可描邊。
  function pack(id,center) { return {id,center,shapes:[],edges:[]}; }
  function shape(g,v,mat,outline='ink',weight=0.8,normal=null) {
    g.shapes.push({v,mat,outline,weight,normal});
  }
  function building(b) {
    const g=pack(b.id,[b.x,0,b.z]), w=b.w, h=b.h, s=w/2;
    const corners=box(b.x,b.z,w,h);
    const walls=[
      {n:[0,0,1],at:(u,y,t)=>[b.x+u*w,y*h,b.z+s+t]},
      {n:[1,0,0],at:(u,y,t)=>[b.x+s+t,y*h,b.z-u*w]},
      {n:[0,0,-1],at:(u,y,t)=>[b.x-u*w,y*h,b.z-s-t]},
      {n:[-1,0,0],at:(u,y,t)=>[b.x-s-t,y*h,b.z+u*w]}
    ];
    walls.forEach(({n,at},side)=>{
      let layer=0;
      const face=(uv,mat,stroke='ink',weight=.7)=>{
        const t=layer++*.00018*w;
        shape(g,uv.map(([u,y])=>at(u,y,t)),mat,stroke,weight,n);
      };
      const rect=(l,y,r,top,mat,stroke,weight)=>face([[l,y],[r,y],[r,top],[l,top]],mat,stroke,weight);
      const line=(a,b,ink='hatch')=>face([a,b],null,ink,.55);
      const facade=side===0, columnCount=facade?3:2;
      rect(-.5,0,.5,1,b.style,'ink',1.3);
      rect(-.5,0,.5,.085,'stone');
      for (let i=0;i<6;i++) {
        const y=.12+i*.135;
        rect(-.5,y,-.455,y+.082,'trim','hatch',.45);
        rect(.455,y,.5,y+.082,'trim','hatch',.45);
      }
      for (let k=0;k<columnCount;k++) {
        const u=(k+.5)/columnCount-.5;
        for (const y of [.46,.735]) {
          rect(u-.093,y-.02,u+.093,y+.176,'trim','hatch');
          rect(u-.070,y,u+.070,y+.145,'glass','ink');
          face([[u-.065,y+.13],[u-.065,y+.098],[u+.025,y+.142],[u-.020,y+.142]],'glint',null);
          line([u,y],[u,y+.145],'trim'); line([u-.068,y+.084],[u+.068,y+.084],'trim');
          rect(u-.101,y-.028,u+.101,y-.003,'stone','ink',.5);
        }
      }
      rect(-.5,.683,.5,.703,'trim','hatch',.55);
      if (facade) {
        rect(-.43,.08,.01,.345,'trim');
        rect(-.405,.10,-.017,.319,'glass');
        if(b.id==='B'){
          for(let j=0;j<9;j++){
            const l=-.392+j*.040, top=.152+.012*(j*7%5);
            rect(l,.112,l+.029,top,['awning','stone','brick'][j%3],'hatch',.42);
          }
          line([-.405,.205],[-.017,.205],'trim');
          for(let j=0;j<5;j++){
            const l=-.37+j*.062;
            rect(l,.21,l+.045,.255+.011*(j%3),'ochre','hatch',.42);
          }
        } else if(b.id==='A'){
          face([[-.372,.13],[-.311,.269],[-.249,.13]],'wood',null);
          rect(-.365,.166,-.259,.252,'trim','hatch');
          face([[-.357,.172],[-.325,.218],[-.307,.192],[-.295,.206],[-.267,.172]],'studio',null);
          face([[-.160,.126],[-.122,.228],[-.072,.126]],'wood',null);
          rect(-.167,.146,-.077,.21,'ochre','trim');
        }
        for (const u of [-.30,-.16]) line([u,.10],[u,.319],'trim');
        const door=[[.13,.015],[.397,.015],[.397,.246]];
        for(let i=0;i<=10;i++){const a=i*Math.PI/10;door.push([.2635+.1335*Math.cos(a),.246+.083*Math.sin(a)]);}
        face(door,'door','trim',1.0);
        rect(.165,.057,.357,.223,'glass','trim');
        line([.262,.058],[.262,.221],'trim');
        line([.146,.247],[.383,.247],'trim');
        for(const u of [.176,.2635,.351])line([.2635,.247],[u,.301],'stone');
        rect(.369,.119,.380,.146,'brass',null);
        for(let i=0;i<7;i++) {
          const l=-.47+i*.078;
          shape(g,[at(l,.381,.015*w),at(l+.078,.381,.015*w),at(l+.078,.329,.16*w),at(l,.329,.16*w)],
            i%2?'trim':b.id==='B'?'brick':'awning','hatch',.6,n);
          shape(g,[at(l,.329,.16*w),at(l+.078,.329,.16*w),at(l+.078,.296,.16*w),at(l,.296,.16*w)],
            i%2?'stone':b.id==='B'?'brick':'awning','hatch',.5,n);
        }
      } else {
        for (const u of [-.25,.25]) rect(u-.075,.13,u+.075,.33,'glass','trim');
      }
      rect(-.512,.932,.512,.961,'stone','ink');
      rect(-.527,.963,.527,1,'trim','ink',1);
    });
    const roofRise=.13*h, ridge=box(b.x,b.z,w*.73,h+roofRise);
    for(let i=0;i<4;i++){
      const j=(i+1)%4, low=corners[i+4],next=corners[j+4],hi=ridge[i+4],end=ridge[j+4];
      const n=walls[i].n.map((v,k)=>k===1?.135*w/roofRise:v);
      shape(g,[low,next,end,hi],'roof','ink',1.15,n);
      for(let t=.1;t<1;t+=.1) shape(g,[mix(low,next,t),mix(hi,end,t)],null,'roofLine',.6,n);
    }
    shape(g,ridge.slice(4),'roofTop','ink',.85,[0,1,0]);
    if(b.id==='A' || b.id==='B'){
      const front=b.z+s;
      // 天窗的小山牆與煙囪賦予兩棟街屋不同的輪廓。
      if(b.id==='A'){
        const frontOfDormer=front-.014*w, backOfDormer=front-.18*w;
        const l=b.x-.16*w, c=b.x, rr=b.x+.16*w, sill=h*1.003, crest=h*1.168;
        shape(g,[[l,sill,frontOfDormer],[rr,sill,frontOfDormer],[c,crest,frontOfDormer]],'trim','ink',1.05,[0,0,1]);
        for(const edge of [l,rr])shape(g,[[edge,sill,frontOfDormer],[c,crest,frontOfDormer],
          [c,crest,backOfDormer],[edge,sill,backOfDormer]],'roof','ink',.8,[Math.sign(edge-c),.7,0]);
        const round=[];
        for(let k=0;k<20;k++){const a=k*Math.PI/10;round.push([c+.074*w*Math.cos(a),h*1.061+.074*w*Math.sin(a),frontOfDormer+.01]);}
        shape(g,round,'glass','ink',.95,[0,0,1]);
        shape(g,[[c,h*1.061-.073*w,frontOfDormer+.012],[c,h*1.061+.073*w,frontOfDormer+.012]],null,'trim',.7,[0,0,1]);
      } else {
        const x=b.x+.26*w,z=b.z+.025*w, half=.068*w;
        for(const [bottom,top,span,mat] of [[h*1.10,h*1.24,half,'brick'],[h*1.24,h*1.269,half*1.25,'stone']]){
          const q=box(x,z,2*span,top);for(let i=0;i<4;i++)q[i][1]=bottom;
          for(let i=0;i<4;i++){const j=(i+1)%4;shape(g,[q[i],q[j],q[j+4],q[i+4]],mat,'ink',.7,walls[i].n);}
          shape(g,q.slice(4),'roofTop','ink',.6,[0,1,0]);
        }
        const left=b.x-s,at=(u,y)=>[left-u*w,h*y,front-.11*w];
        shape(g,[at(0,.54),at(.20,.54),at(.16,.58)],null,'iron',1.5);
        shape(g,[at(.08,.54),at(.08,.503)],null,'iron',1);
        shape(g,[at(.177,.54),at(.177,.503)],null,'iron',1);
        shape(g,[at(.045,.503),at(.21,.503),at(.21,.383),at(.045,.383)],'door','brass',1.4);
        shape(g,[at(.063,.472),at(.121,.456),at(.121,.409),at(.063,.425)],'trim',null);
        shape(g,[at(.128,.456),at(.190,.473),at(.190,.425),at(.128,.409)],'trim',null);
      }
    }
    // 寬、高、深各用實際的牆邊；深邊取靠眼睛的一側。
    g.edges=wallEdges(b,corners);
    return g;
  }
  function wallEdges(b,corners=box(b.x,b.z,b.w,b.h)){
    const edges=[];
    const side=b.x<0?1:0;
    const edge=(name,axis,i,j)=>edges.push({id:b.id+'-'+name,owner:b.id,name,axis,a:corners[i],b:corners[j]});
    edge('base',0,0,1); edge('eave',0,4,5);
    edge('left',1,0,4); edge('right',1,1,5);
    edge('sideBase',2,side,side?2:3); edge('sideEave',2,side+4,side?6:7);
    return edges;
  }
  // 模型地磚和眼點遠景共用街寬、標高、止端；兩側的接縫也用同一個鋪面節距。
  const street=Object.freeze({near:-2.9,far:-30,side:9,road:1.43,curb:.07,grade:-.075,pitch:1.68,extent:145});
  function ground() {
    const g=pack('street',[0,0,-12]);
    const tile=(x1,z1,x2,z2,y,mat,stroke)=>shape(g,[[x1,y,z1],[x2,y,z1],[x2,y,z2],[x1,y,z2]],mat,stroke);
    const {near:start,far:end,road,side,curb,grade,pitch}=street;
    tile(-side,start,-road,end,0,'walk',null);
    tile(road,start,side,end,0,'walk',null);
    tile(-road,start,road,end,grade,'road',null);
    for(const x of [-road-curb,road]) tile(x,start,x+curb,end,.002,'curb','hatch');
    for(let z=start-.18;z>-29.3;z-=pitch) {
      tile(-.033,z,.033,z-.72,-.072,'stripe',null);
      for(const sign of [-1,1]) shape(g,[[sign*1.5,.002,z],[sign*8.8,.002,z]],null,'paving',.65);
    }
    for(const sign of [-1,1]){
      for(const x of [2.05,2.8,4.2,5.8]) shape(g,[[sign*x,.002,start],[sign*x,.002,end]],null,'paving',.55);
      const side=sign*1.43;
      shape(g,[[side,0,start],[side,0,end],[side,-.075,end],[side,-.075,start]],'stone','hatch',.6);
      g.edges.push({id:'street-'+(sign<0?'west':'east'),owner:'street',name:sign<0?'west':'east',axis:2,
        a:[side,0,start],b:[side,0,end]});
    }
    return g;
  }
  function lamp(x,z) {
    const g=pack('lamp',[x,0,z]);
    // 同心的鑄鐵底座、燈罩與頂帽，全部共用一條鉛直軸。
    const bands=[[0,.13],[.11,.13],[.16,.085],[.28,.07],[.32,.046],[2.05,.036],[2.11,.09],[2.18,.10],[2.45,.17],[2.49,.19],[2.61,.045],[2.67,.015]];
    for(let k=1;k<bands.length;k++) for(let i=0;i<6;i++) {
      const ring=(j,p)=>[x+bands[j][1]*Math.cos(p*Math.PI/3),bands[j][0],z+bands[j][1]*Math.sin(p*Math.PI/3)];
      const a=(i+.5)*Math.PI/3;
      shape(g,[ring(k-1,i),ring(k-1,i+1),ring(k,i+1),ring(k,i)],
        k===8?'lampGlass':'iron','iron',.55,[Math.cos(a),0,Math.sin(a)]);
    }
    return g;
  }
  function extendedGround(){
    const g=pack('eye-ground',[0,0,0]),{near,far,road,side,curb,grade,pitch,extent}=street;
    const tile=(x1,x2,front,back,y,material)=>shape(g,[[x1,y,front],[x2,y,front],[x2,y,back],[x1,y,back]],material,null);
    for(const [front,back] of [[extent,near],[far,-extent]]){
      tile(-road,road,front,back,grade,'road');
      for(const sign of [-1,1]){
        tile(sign*road,sign*extent,front,back,0,'walk');
        tile(sign*road,sign*(road+curb),front,back,.002,'curb');
        shape(g,[[sign*road,0,front],[sign*road,0,back],[sign*road,grade,back],[sign*road,grade,front]],'stone',null);
      }
    }
    for(const sign of [-1,1])tile(sign*side,sign*extent,near,far,0,'walk');
    for(let i=-21;i<=38;i++){
      const z=near-.18-i*pitch;
      if(z>near||z<far)tile(-.033,.033,z,z-.72,grade+.003,'stripe');
      for(const sign of [-1,1]){
        const x=z>near||z<far?road+curb:side;
        shape(g,[[sign*x,.002,z],[sign*28,.002,z]],null,'paving',.55);
      }
    }
    for(const sign of [-1,1]){
      for(const x of [2.05,2.8,4.2,5.8,9.8,14.2,20.6])for(const [front,back] of [[31,near],[far,-65],...(x>side?[[near,far]]:[])]){
        shape(g,[[sign*x,.002,front],[sign*x,.002,back]],null,'paving',.55);
      }
    }
    return g;
  }
  const lots=[fixed,
    {id:'C',x:-4.1,z:-13.1,w:3.5,h:3.7,style:'stone'},
    {id:'D',x:4.15,z:-16.6,w:3.8,h:4.6,style:'brick'},
    {id:'E',x:-3.55,z:-18.5,w:3.7,h:5.1,style:'ochre'},
    {id:'F',x:3.5,z:-22.6,w:3.5,h:3.8,style:'stone'},
    {id:'G',x:-3.15,z:-24.3,w:2.7,h:4.4,style:'brick'},
    {id:'H',x:1.9,z:-28,w:2.6,h:5.2,style:'ochre'}];
  const streetscape=[ground(),...lots.map(building),...[[1.73,-5.8],[-1.7,-10.6],[1.7,-14.2],[-1.7,-19.9],[1.72,-24.7]].map(p=>lamp(...p))];
  function mainBuilding(p){return building(studioLot(p));}
  function traceable(r,main) {
    const edges=[...streetscape[0].edges,...r.buildings.filter(b=>b.id==='A'||b.id==='B').flatMap(b=>
      b.id==='A'&&main?main.edges:wallEdges(b.lot,b.points))];
    return edges.flatMap(e=>{
      const line=projectSegment(e.a,e.b,r.cam);
      if(line.length!==2)return [];
      const segments=exposed(e.a,e.b,r.cam,r.faces).map(s=>clipLine(...s,r.sheet))
        .filter(s=>s && Math.hypot(...sub(...s))>.012*r.sheet.u);
      const segment=segments.reduce((long,s)=>!long || Math.hypot(...sub(...s))>Math.hypot(...sub(...long))?s:long,null);
      return segment?[{...e,line,segments,segment}]:[];
    });
  }
  function edgeDistance(edge,q){
    const [a,b]=edge.line,dir=sub(b,a),length=dot2(dir,dir);
    if(length<EPS*EPS)return Infinity;
    const t=Math.max(0,Math.min(1,dot2(sub(q,a),dir)/length)),foot=mix(a,b,t);
    for(const [lo,hi] of edge.segments){
      if(dot2(sub(foot,lo),sub(foot,hi))<=EPS*EPS)return Math.hypot(...sub(q,foot));
    }
    return Infinity;
  }
  function dot2(a,b){return a[0]*b[0]+a[1]*b[1];}
  function trace(a,b,r) {
    if(!a || !b || a.id===b.id) return null;
    const result=intersection(...a.line,...b.line);
    const shared=[a.a,a.b].some(p=>[b.a,b.b].some(q=>Math.hypot(...sub(p,q))<EPS)&&visibleRanges(p,p,r.faces).length>0);
    return {...result,axis:a.axis===b.axis?a.axis:null,shared,owners:[a.owner,b.owner],
      onPaper:inside(result.uv,r.sheet),ids:[a.id,b.id]};
  }
  return { defaults,fixed,FOCAL_LENGTH,FRAME_DEPTH,NEAR,camera,project,projectSegment,projectShape,onPlane,groundAt,box,view,measure,frameTargets,paper,inside,clipLine,
    visibleRanges,intersection,mix,dot,sub,street,extendedGround,streetscape,mainBuilding,traceable,edgeDistance,trace };
});
