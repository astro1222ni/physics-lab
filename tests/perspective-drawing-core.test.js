'use strict';
const assert=require('node:assert/strict');
const THREE=require('../vendor/three/three.module.min.js');
const C=require('../js/perspective-drawing-core.js');
const near=(a,b,eps=1e-9)=>assert.ok(Number.isFinite(a) && Math.abs(a-b)<eps,`${a} 與 ${b} 不相等`);
const eq=(a,b)=>a.forEach((x,i)=>near(x,b[i]));
let n=0;
function test(name,fn){fn();console.log('✓ '+name);n++;}
test('平視正面只有沿街方向的有限消失點',()=>{
  const r=C.view({});assert.equal(r.count,1);assert.equal(r.vanishing[0],null);assert.equal(r.vanishing[1],null);eq(r.vanishing[2],[0,0]);
  near(r.apparent,1.4*r.p.size/(r.p.z-r.p.size/2));
  near(r.otherHeight,C.fixed.h/(-C.fixed.z-C.fixed.w/2));near(r.horizon,0);
});
test('轉頭、仰俯與視平線的解析解，含正負轉向及高仰角',()=>{
  for(const yaw of [-65,-45,-12,15,45,65])for(const pitch of [-68,-20,0,13,68]){
    const r=C.view({yaw,pitch}),y=yaw*Math.PI/180,p=pitch*Math.PI/180;
    near(r.vanishing[0][0],1/Math.tan(y)/Math.cos(p));near(r.vanishing[2][0],-Math.tan(y)/Math.cos(p));
    near(r.horizon,-Math.tan(p));near(r.vanishing[0][1],r.horizon);near(r.vanishing[2][1],r.horizon);
    assert.equal(r.count,pitch?3:2);
    if(pitch){near(r.vanishing[1][0],0);near(r.vanishing[1][1],1/Math.tan(p));}
    for(const axis of [r.cam.right,r.cam.up,r.cam.forward])near(C.dot(axis,axis),1);
    near(C.dot(r.cam.forward,r.cam.up),0);near(C.dot(r.cam.right,r.cam.up),0);
  }
  assert.equal(C.view({yaw:0,pitch:25}).vanishing[0],null);
});
test('每條世界視線穿框的位置與紙上角點一致，畫框比例亦符合水平視野',()=>{
  for(const yaw of [-31,0,33])for(const pitch of [-28,0,24])for(const aspect of [1.22,1.6,2.15]){
    const r=C.view({yaw,pitch},aspect);near(r.sheet.u/r.sheet.v,aspect);
    for(const v of [...r.points,...C.box(C.fixed.x,C.fixed.z,C.fixed.w,C.fixed.h)]){
      const q=C.project(v,r.cam);if(!q)continue;
      const hit=C.onPlane(r.cam,q,1.9);
      const t=1.9/C.dot(C.sub(v,r.cam.eye),r.cam.forward);
      eq(hit,C.mix(r.cam.eye,v,t));eq(C.project(hit,r.cam),q);
      near(C.dot(C.sub(hit,r.cam.eye),r.cam.forward),1.9);
    }
    const foot=[r.p.x,0,-r.p.z],q=C.project(foot,r.cam);
    if(q)eq(C.groundAt(r.cam,q),foot);
  }
  assert.equal(C.groundAt(C.camera(0,0),[0,0]),null);
});
test('眼後的點不可見，跨越近裁切面的道路仍能投影',()=>{
  const cam=C.camera(0,0);
  assert.equal(C.project([0,1,1],cam),null);
  assert.deepEqual(C.projectShape([[1,0,4],[-1,0,2]],cam,false),[]);
  const seg=C.projectShape([[.1,0,1],[.1,0,-2]],cam,false);
  assert.equal(seg.length,2);assert.ok(seg.every(q=>q.every(Number.isFinite)));eq(seg[1],[.05,-.8]);
  const poly=C.projectShape([[-1,0,1],[1,0,1],[1,0,-2],[-1,0,-2]],cam,true);assert.equal(poly.length,4);
  assert.equal(C.measure(C.view({yaw:65,x:-6,z:4})).apparent,null);
});
test('相同方向不受位置、尺寸與焦距影響，縮尺可抵銷距離',()=>{
  const r=C.view({yaw:22,pitch:13}),m=C.view({yaw:22,pitch:13,x:2,z:17,size:1.1,fov:113});
  assert.deepEqual(r.vanishing,m.vanishing);assert.notEqual(r.apparent,m.apparent);
  near(C.view({size:1.3,z:6}).apparent,C.view({size:2.6,z:12}).apparent);
  near(C.view({z:11.2,size:1.6}).apparent/C.view({z:6,size:1.6}).apparent,.5);
  near(C.measure(C.view({size:2,z:-2*C.fixed.z/C.fixed.w})).heightRatio,1);
});
test('兩個水平消失點及第三點能進入實際紙幅，畫紙邊界算在紙內',()=>{
  for(const aspect of [1.22,1.60]){
    assert.equal(C.measure(C.view({yaw:45,fov:102},aspect)).horizontalInside,2);
    assert.equal(C.measure(C.view({yaw:20,pitch:62,fov:110},aspect)).verticalInside,true);
  }
  const s={u:1,v:.75};
  assert.ok(C.inside([1,-.75],s));assert.equal(C.inside([1.01,0],s),false);
  assert.deepEqual(C.clipLine([-2,0],[3,0],s),[[-1,0],[1,0]]);
  assert.equal(C.clipLine([0,2],[1,2],s),null);
});
test('描圖從選取的兩條投影線求交，能區分平行、重合與真實牆角',()=>{
  assert.equal(C.intersection([0,0],[0,1],[1,0],[1,1]).kind,'parallel');
  assert.equal(C.intersection([0,0],[0,1],[0,2],[0,3]).kind,'coincident');
  assert.equal(C.intersection([0,0],[0,0],[0,2],[0,3]).kind,'point');
  for(const p of [{yaw:11,pitch:8},{yaw:-11,pitch:-7},{yaw:0,pitch:0}]){
    const r=C.view(p),edges=C.traceable(r,C.mainBuilding(r.p));
    assert.ok(edges.length>=8);
    for(const e of edges){
      assert.ok(e.segment.every(q=>C.inside(q,r.sheet)));
      for(const other of edges){
        if(e.id===other.id)continue;
        const t=C.trace(e,other,r);
        if(t.axis!=null && t.kind==='finite')eq(t.uv,r.vanishing[t.axis]);
        if(t.axis!=null && !r.vanishing[t.axis])assert.ok(['parallel','coincident'].includes(t.kind));
        if(t.shared && t.kind==='finite'){
          const vertex=[e.a,e.b].find(a=>[other.a,other.b].some(b=>a.every((v,i)=>v===b[i])));
          eq(t.uv,C.project(vertex,r.cam));
        }
      }
    }
  }
});
test('可描的實際 A、B 牆邊與量測樓高使用同一組頂點',()=>{
  const r=C.view({}),a=C.mainBuilding(r.p),b=C.streetscape.find(g=>g.id==='B');
  for(const [building,corners] of [[a,r.projected],[b,r.projectedB]]){
    const edge=building.edges.find(e=>e.name==='left');eq(C.project(edge.a,r.cam),corners[0]);eq(C.project(edge.b,r.cam),corners[4]);
  }
});
test('直接給 three.js 世界點：左右不鏡射，原生相機矩陣與兩種紙幅的像素座標相同',()=>{
  for(const [w,h] of [[390,320],[1280,800]])for(const yaw of [-31,0,22])for(const pitch of [-26,0,18]){
    const r=C.view({yaw,pitch,fov:104},w/h);
    const cam=new THREE.PerspectiveCamera(r.sheet.verticalFov,w/h,C.NEAR,120);
    cam.position.set(0,1.6,0);
    cam.rotation.set(THREE.MathUtils.degToRad(pitch),THREE.MathUtils.degToRad(-yaw),0,'YXZ');
    cam.updateMatrixWorld(true);
    const back=new THREE.Vector3(...r.cam.forward).negate();
    near(new THREE.Vector3(...r.cam.right).cross(new THREE.Vector3(...r.cam.up)).dot(back),1);
    for(const model of r.buildings)for(const v of model.points){
      assert.ok(v[2]<0);
      const q=C.project(v,r.cam);if(!q)continue;
      const ndc=new THREE.Vector3(...v).project(cam);
      near((1+ndc.x)*w/2,(1+q[0]/r.sheet.u)*w/2,1e-7);
      near((1-ndc.y)*h/2,(1-q[1]/r.sheet.v)*h/2,1e-7);
    }
  }
  const r=C.view({});eq(r.cam.forward,[0,0,-1]);
  assert.ok(C.project([-2,1.6,-8],r.cam)[0]<0 && C.project([2,1.6,-8],r.cam)[0]>0);
});
test('極點視平線、跨近平面兩種線序、近平面端點及全部在眼後',()=>{
  for(const pitch of [-90,-90+1e-9,90-1e-9,90])assert.equal(C.view({pitch}).horizon,null);
  assert.ok(Number.isFinite(C.view({pitch:89.999}).horizon));
  const cam=C.camera(0,0),a=[.004,1.6,.06],b=[.02,1.7,-.15];
  const expected=C.project(C.mix(a,b,(C.NEAR+.06)/.21),cam);
  const ab=C.projectSegment(a,b,cam),ba=C.projectSegment(b,a,cam);
  eq(ab[0],expected);eq(ab[1],C.project(b,cam));eq(ab[0],ba[1]);eq(ab[1],ba[0]);
  assert.equal(C.projectSegment([0,1.6,1],[1,2,2],cam).length,0);
  eq(C.projectSegment([0,1.6,-C.NEAR],b,cam)[0],[0,0]);
});
test('多棟建築各自投影，每棟取可見前稜，左、右牆角可互換',()=>{
  const lots=[{id:'L',x:-1.5,z:-9,w:2,h:4},{id:'R',x:2,z:-9,w:2,h:3},
    {id:'Outside',x:35,z:-8,w:1,h:2}];
  const r=C.view({},1.6,lots);
  assert.equal(r.buildings.length,3);assert.equal(r.buildings[0].measuredEdge,1);assert.equal(r.buildings[1].measuredEdge,0);
  near(r.buildings[0].apparent,.5);near(r.buildings[1].apparent,.375);
  assert.equal(r.buildings[2].apparent,null);assert.equal(C.view({}).buildings.length,8);
  // 窄視野朝右：較近的左稜已不在畫紙，另一條前稜仍可量測。
  const subset=C.view({yaw:27,fov:14},1.25,[{id:'A',x:2,z:-8,w:2,h:3}]);
  assert.equal(subset.buildings[0].measuredEdge,1);assert.ok(subset.apparent>0);
});
test('水平兩點嚴格入紙與第三點剛好到紙邊的解析門檻',()=>{
  for(const aspect of [1.22,1.60]){
    const m=f=>C.measure(C.view({yaw:45,fov:f},aspect));
    assert.ok(m(89.9).horizontalInterior<2);assert.equal(m(90).horizontalInterior,0);
    assert.equal(m(90).horizontalInside,2);assert.equal(m(90.1).horizontalInterior,2);
    const sheet=C.paper(110,aspect),limit=90-sheet.verticalFov/2;
    for(const sign of [-1,1]){
      const at=p=>C.measure(C.view({yaw:15,pitch:sign*p,fov:110},aspect)).verticalInside;
      assert.equal(at(limit-.02),false);assert.equal(at(limit),true);assert.equal(at(limit+.02),true);
    }
  }
});
test('等比縮小地面位置：平視時紙高相同，牆腳高低可變；仰視或漏縮橫距會有偏差',()=>{
  const before={yaw:20,pitch:0,x:-3,z:12,size:2.8,fov:92},after={...before,x:-1.5,z:6,size:1.4};
  const first=C.view(before),second=C.view(after);
  assert.ok([first,second].every(v=>v.buildings[0].status==='visible'));
  assert.equal(C.view({...before,x:3}).buildings[0].status,'partial');
  near(first.apparent,second.apparent);near(first.projected[0][0],second.projected[0][0]);
  assert.ok(Math.abs(first.projected[0][1]-second.projected[0][1])>.05);
  assert.ok(Math.abs(C.view({...after,x:-3}).apparent-first.apparent)>.01);
  assert.ok(Math.abs(C.view({...after,pitch:12}).apparent-C.view({...before,pitch:12}).apparent)>.008);
});
test('拉線、兩條滑線和闔板共用穿框點；所選的角點位在框後',()=>{
  for(const params of [{},{pitch:15,yaw:-12,fov:89},{pitch:-20,yaw:23,fov:100}]){
    const r=C.view(params),targets=C.frameTargets(r);assert.ok(targets.length>1);
    for(const t of targets){
      const d=C.dot(C.sub(t.vertex,r.cam.eye),r.cam.forward);
      eq(t.hit,C.mix(r.cam.eye,t.vertex,C.FRAME_DEPTH/d));
      eq(C.project(t.hit,r.cam),t.uv);assert.ok(d>C.FRAME_DEPTH && C.inside(t.uv,r.sheet));
      const corner=C.onPlane(r.cam,[r.sheet.u,0],C.FRAME_DEPTH),v=C.sub(t.hit,corner),k=C.FRAME_DEPTH/r.sheet.focalLength;
      near(C.dot(v,r.cam.right),(t.uv[0]-r.sheet.u)*k);near(C.dot(v,r.cam.up),t.uv[1]*k);
    }
  }
});
test('B 完整遮住 A 的兩條前稜時，量測、可描邊與打點皆排除 A',()=>{
  const r=C.view({yaw:0,pitch:0,fov:68,x:5.15,z:15,size:2.6});
  assert.equal(C.measure(r).visibilityA,'occluded');
  assert.equal(C.measure(r).heightRatio,null);
  assert.ok(!C.traceable(r).some(e=>e.owner==='A'));
  assert.ok(!C.frameTargets(r).some(t=>t.owner==='A'));
});
test('局部遮擋只量露出的段；描線與量測使用同一段，遮住的牆腳不可打點',()=>{
  const r=C.view({x:3.6,z:11,size:3.4}), a=r.buildings[0];
  assert.equal(a.status,'partial');
  const edge=C.traceable(r).find(e=>e.id==='A-left');
  assert.ok(edge && edge.segments.length===1);
  assert.ok(a.apparent<.1*Math.hypot(...C.sub(...edge.line)));
  assert.ok(Math.abs(Math.hypot(...C.sub(...edge.segment))-a.apparent)<1e-8);
  const hiddenFoot=edge.line[0];
  assert.ok(Math.min(...edge.segment.map(p=>Math.hypot(...C.sub(p,hiddenFoot))))>a.apparent);
  assert.ok(!C.frameTargets(r).some(t=>t.key==='A0'));
});
test('狹窄的前棟把一條水平稜分成兩段，遮擋中央無法點選',()=>{
  const box=(id,x,z,w,h)=>({id,x,z,w,h,style:'stone'});
  const r=C.view({},1.6,[box('A',0,-12,6,3),box('B',0,-7,1,3)]);
  const p=[-3,0,-9],q=[3,0,-9],spans=C.visibleRanges(p,q,r.faces);
  assert.equal(spans.length,2);assert.ok(spans[0][1]<.5&&spans[1][0]>.5);
  assert.equal(spans[0][0],0);assert.equal(spans[1][1],1);
  const seam=C.traceable(r).find(e=>e.id==='A-base');
  assert.equal(seam.segments.length,2);
  assert.equal(C.edgeDistance(seam,C.mix(...seam.line,.5)),Infinity);
  assert.ok(C.edgeDistance(seam,C.mix(...seam.segments[0],.5))<1e-10);
});
test('廣角街景地面在桌上模型前後與左右接合，整個街廓各有一層實體鋪面',()=>{
  const street=C.street,ground=C.streetscape[0],outer=C.extendedGround();
  const hits=(obj,x,z)=>obj.shapes.filter(s=>{
    if(!['walk','road'].includes(s.mat))return false;
    const xx=s.v.map(p=>p[0]),zz=s.v.map(p=>p[2]);
    return x>Math.min(...xx)&&x<Math.max(...xx)&&z>Math.min(...zz)&&z<Math.max(...zz);
  });
  for(const z of [12,street.near+.001,street.near-.001,-16,street.far+.001,street.far-.001,-100]){
    for(const x of [-24,-9.001,-8.999,-1.44,-1.42,0,1.42,1.44,8.999,9.001,24]){
      const tiles=[...hits(ground,x,z),...hits(outer,x,z)];
      assert.equal(tiles.length,1);const road=Math.abs(x)<street.road;
      assert.equal(tiles[0].mat,road?'road':'walk');near(tiles[0].v[0][1],road?street.grade:0);
    }
  }
  assert.deepEqual(outer.edges,[]); // 延伸布景沒有可選取的教學稜線。
});
console.log('perspective-drawing 核心驗算 '+n+' 組通過');
