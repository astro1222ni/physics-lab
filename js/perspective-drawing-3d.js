// 杜勒的拉線繪圖機。幾何、眼點與相機直接使用核心的右手世界座標。
export function makeViewer({THREE,OrbitControls,host,paperCanvas,navHost,T,getMarks,onLost,onRigState}) {
  const C=window.PerspectiveDrawingCore, D=window.LabDraw;
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  const canvas=renderer.domElement;
  canvas.tabIndex=0;canvas.setAttribute('role','img');
  canvas.setAttribute('aria-label',T('杜勒畫框、眼點與街角視線','Dürer frame, fixed eye and sight lines to the street'));
  host.append(canvas);
  const scale=1/16, tableHeight=.76;
  const model=new THREE.Group();model.name='tabletop-model';model.scale.setScalar(scale);model.position.y=tableHeight;
  const scene=new THREE.Scene(), side=new THREE.PerspectiveCamera(35,1,.008,14);
  const eyeCamera=new THREE.PerspectiveCamera(50,1,C.NEAR*scale,10);
  const controls=new OrbitControls(side,canvas);
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  controls.enableDamping=!motion.matches;controls.dampingFactor=.14;controls.minDistance=.14;controls.maxDistance=4.25;
  const nav=window.LabView3DNav.attach({THREE,controls,host:navHost,canvas,radius:1.5,T});
  const navBar=navHost.querySelector('.v3nav');
  const hemi=new THREE.HemisphereLight(0xfff4da,0x88766b,1.85);
  const sun=new THREE.DirectionalLight(0xffefdb,2.5);
  sun.position.set(-1.05,2.8,.85);sun.target.position.set(0,tableHeight,-.58);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-1.65,right:1.65,top:1.65,bottom:-1.65,near:.05,far:6});
  sun.shadow.normalBias=.0012;sun.shadow.bias=-.00038;
  const town=new THREE.Group(),studio=new THREE.Group(),bench=new THREE.Group(),rig=new THREE.Group();
  const distance=new THREE.Group();distance.name='eye-environment';model.add(distance);
  town.name='fixed-street';studio.name='studio-A';model.add(town,studio,bench,rig);scene.add(model,hemi,sun,sun.target);
  const V=p=>new THREE.Vector3(...p);
  const mid=(a,b)=>a.clone().lerp(b,.5);
  let cur,colors,mainObject,rigKey='',sceneKey='',targets=[],targetIndex=0,boardClosed=false,drawGuides=true;
  const ink=document.createElement('canvas');ink.className='rig-ink';ink.setAttribute('aria-hidden','true');host.append(ink);
  const pen=ink.getContext('2d');let markerMounts=[];
  let eyeMode=false,showSketch=false,disposed=false,frame=0,sheetMesh=null;
  const sketch=new THREE.CanvasTexture(paperCanvas);
  sketch.colorSpace=THREE.SRGBColorSpace;sketch.generateMipmaps=false;sketch.minFilter=THREE.LinearFilter;
  const labels=[T('釘環眼點','Wall eyelet'),T('十字滑線','Crosshairs'),T('打點板','Marking board')].map(msg=>{
    const el=document.createElement('span');el.textContent=msg;
    Object.assign(el.style,{position:'absolute',pointerEvents:'none',font:'600 calc(13px * var(--fs, 1)) system-ui',
      color:'var(--text)',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'6px',
      padding:'1px 5px',whiteSpace:'nowrap',lineHeight:'1.2',zIndex:1});host.append(el);return el;});
  let mounts=[];
  function clear(group) {
    const mats=new Set(),maps=new Set();
    group.traverse(o=>{o.geometry?.dispose();if(o.material)mats.add(o.material);});
    mats.forEach(m=>{if(m.map && m.map!==sketch)maps.add(m.map);m.dispose();});
    maps.forEach(t=>t.dispose());group.clear();
  }
  function mat(color,extra={}){return new THREE.MeshStandardMaterial({color,roughness:.78,...extra});}
  function solid(group,geometry,material,pos){
    const o=new THREE.Mesh(geometry,material);o.position.copy(pos);o.castShadow=true;o.receiveShadow=true;group.add(o);return o;
  }
  function block(group,dims,center,m){return solid(group,new THREE.BoxGeometry(...dims),m,V(center));}
  const up=new THREE.Vector3(0,1,0);
  function bar(group,a,b,radius,material,square=false) {
    const axis=b.clone().sub(a),len=axis.length();
    const g=square?new THREE.BoxGeometry(radius*2,len,radius*2):new THREE.CylinderGeometry(radius,radius,len,12);
    const o=solid(group,g,material,mid(a,b));o.quaternion.setFromUnitVectors(up,axis.normalize());return o;
  }
  function dot(group,p,r,m){return solid(group,new THREE.SphereGeometry(r,16,10),m,p);}
  function woodTexture(){
    const tile=document.createElement('canvas');tile.width=256;tile.height=64;const g=tile.getContext('2d');
    g.fillStyle='#ae784a';g.fillRect(0,0,256,64);
    for(let k=0;k<84;k++){
      const y=(k*17.51)%68-2;g.beginPath();
      for(let x=0;x<=256;x+=4){
        const v=y+Math.sin(x*.029+k)*1.1+Math.sin(x*.074+k*.4)*.45;
        if(x)g.lineTo(x,v);else g.moveTo(x,v);
      }
      g.strokeStyle=k%3?'rgba(68,34,22,.17)':'rgba(255,224,178,.27)';g.lineWidth=k%3?.55:1;g.stroke();
    }
    const tex=new THREE.CanvasTexture(tile);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    tex.colorSpace=THREE.SRGBColorSpace;return tex;
  }
  // 將靜態素描面合併成一個網格。調取景時只移動畫框，移動畫室時只重建 A。
  function architecture(group,objects,pal,castShadow=true){
    const pos=[],rgb=[],linePos=[],lineRgb=[],shadowVertices=[];
    const colorCache=new Map();
    const ink=k=>{if(!colorCache.has(k))colorCache.set(k,new THREE.Color(pal[k]));return colorCache.get(k);};
    function vertex(to,cs,p,c){to.push(...p);cs.push(c.r,c.g,c.b);}
    for(const obj of objects)for(const s of obj.shapes){
      if(castShadow && s.mat){
        const shell=obj.id==='lamp'||['roof','roofTop','awning'].includes(s.mat)||
          (s.v.length===4&&s.v[0][1]===0&&s.v[1][1]===0&&s.v[2][1]>2);
        if(shell)for(let i=1;i<s.v.length-1;i++)for(const p of [s.v[0],s.v[i],s.v[i+1]]){
          // Keep the casting shell just behind the painted facade and its window reveals.
          shadowVertices.push(...p.map((x,j)=>x-(s.normal?.[j]||0)*.022));
        }
      }
      if(s.mat)for(let i=1;i<s.v.length-1;i++)for(const p of [s.v[0],s.v[i],s.v[i+1]])
        vertex(pos,rgb,p,ink(s.mat));
      // Raised stone sills, cornices and casings have a front, a return and a cast shadow.
      const horizontal=s.v.length===4&&s.v[2][1]-s.v[0][1]<.20;
      if(s.normal && s.normal[1]===0 && horizontal && ['trim','stone'].includes(s.mat)){
        const depth=s.mat==='stone'?.065:.033,front=s.v.map(p=>p.map((v,j)=>v+s.normal[j]*depth));
        const c=ink(s.mat),side=c.clone().multiplyScalar(.79);
        for(const j of [0,1,2,0,2,3])vertex(pos,rgb,front[j],c);
        for(let j=0;j<4;j++){const k=(j+1)%4;
          for(const p of [s.v[j],s.v[k],front[k],s.v[j],front[k],front[j]])vertex(pos,rgb,p,side);
        }
      }
      if(s.normal&&s.normal[1]===0&&['glass','door'].includes(s.mat)&&s.v.length>=4){
        const center=s.v.reduce((a,p)=>a.map((x,j)=>x+p[j]/s.v.length),[0,0,0]);
        const rim=s.v.map(p=>p.map((x,j)=>x+s.normal[j]*.045));
        const aperture=rim.map(p=>p.map((x,j)=>x+(center[j]+s.normal[j]*.045-x)*.075));
        const casing=ink(s.mat==='glass'?'wood':'stone'),reveal=casing.clone().multiplyScalar(.67);
        for(let i=0;i<rim.length;i++){
          const j=(i+1)%rim.length;
          for(const p of [rim[i],rim[j],aperture[j],rim[i],aperture[j],aperture[i]])vertex(pos,rgb,p,casing);
          for(const p of [s.v[i],s.v[j],rim[j],s.v[i],rim[j],rim[i]])vertex(pos,rgb,p,reveal);
        }
      }
      if(s.outline)for(let i=0;i<s.v.length-(s.mat?0:1);i++){
        vertex(linePos,lineRgb,s.v[i],ink(s.outline));
        vertex(linePos,lineRgb,s.v[(i+1)%s.v.length],ink(s.outline));
      }
    }
    const geometry=(points,colors)=>{
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return g;};
    const g=geometry(pos,rgb);g.computeVertexNormals();
    const m=mat(0xffffff,{vertexColors:true,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
    const surf=new THREE.Mesh(g,m);surf.receiveShadow=true;group.add(surf);
    if(shadowVertices.length){
      const shell=new THREE.BufferGeometry();shell.setAttribute('position',new THREE.Float32BufferAttribute(shadowVertices,3));
      const caster=new THREE.Mesh(shell,new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false,side:THREE.DoubleSide}));
      caster.castShadow=true;group.add(caster);
    }
    group.add(new THREE.LineSegments(geometry(linePos,lineRgb),new THREE.LineBasicMaterial({
      vertexColors:true,transparent:true,opacity:D.dark?.32:.40,depthWrite:false
    })));
  }
  function eyeEnvironment(pal){
    architecture(distance,[C.extendedGround()],pal,false);
    // 屋脊在原有街廓以外。兩排遠房的尺度沿用街景公尺，和地面一同作 1:16 轉換。
    const horizon=new THREE.Color(D.dark?'#857f78':'#e4d7c7');
    const facades=['#9d8b79','#89918b','#ab9278','#829196'].map(c=>new THREE.Color(c).lerp(horizon,.32));
    const verts=[],tints=[];
    function face(points,color){
      for(let i=1;i<points.length-1;i++)for(const p of [points[0],points[i],points[i+1]]){
        verts.push(...p);tints.push(color.r,color.g,color.b);
      }
    }
    function house(x,z,w,h,d,i){
      const left=x-w/2,right=x+w/2,front=z+d/2,back=z-d/2,wall=facades[i%4];
      const shade=wall.clone().multiplyScalar(.82),roof=shade.clone().lerp(horizon,.25);
      const ridge=h+w*(.12+.035*(i%3));
      face([[left,0,front],[right,0,front],[right,h,front],[left,h,front]],wall);
      face([[left,0,back],[right,0,back],[right,h,back],[left,h,back]],shade);
      for(const edge of [left,right])face([[edge,0,back],[edge,0,front],[edge,h,front],[edge,ridge,z],[edge,h,back]],shade);
      for(const edge of [front,back])face([[left,h,edge],[right,h,edge],[right,ridge,z],[left,ridge,z]],roof);
      const glass=wall.clone().multiplyScalar(.57);
      for(const edge of [left-.015,right+.015]){
        const trim=wall.clone().lerp(horizon,.45);
        face([[edge,h-.22,back],[edge,h-.22,front],[edge,h-.08,front],[edge,h-.08,back]],trim);
        for(let y=1.1;y<h-.7;y+=1.75)for(let v=back+.5;v<front-.8;v+=1.4){
          face([[edge,y,v],[edge,y,v+.55],[edge,y+.77,v+.55],[edge,y+.77,v]],glass);
        }
      }
      if(i%3===1){
        const a=x+w*.19,b=a+.46,y=ridge+.55,v=z+.18;
        face([[a,ridge-.4,v],[b,ridge-.4,v],[b,y,v],[a,y,v]],shade);
        face([[a,ridge-.4,v],[a,ridge-.4,v-.34],[a,y,v-.34],[a,y,v]],roof);
      }
      for(const edge of [front+.015,back-.015])for(let y=1.2;y<h-.6;y+=1.75)for(let u=left+.65;u<right-.7;u+=1.55){
        face([[u,y,edge],[u+.50,y,edge],[u+.50,y+.64,edge],[u,y+.64,edge]],glass);
      }
    }
    for(const side of [-1,1]){
      for(let i=0;i<11;i++)house(side*(4.1+i%3*.65),-35-i*5.8,3.5+(i%3)*.5,3.2+(i*7%8)*.48,4.1,i+1);
      for(let i=0;i<18;i++)house(side*(17+(i*5%7)),34-i*5.4,4+(i%3)*.6,3.1+(i*3%7)*.65,4.2,i+3);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(tints,3));
    const houses=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}));houses.name='distant-rooflines';distance.add(houses);
    // 天穹跟世界的鉛直方向對齊，鏡頭仰俯時，霧色帶仍停在真正的地平。
    const sky=new THREE.Mesh(new THREE.SphereGeometry(139,48,24),new THREE.ShaderMaterial({
      uniforms:{rim:{value:horizon},upper:{value:new THREE.Color(D.dark?'#394b60':'#82a9c8')}},
      vertexShader:'varying float elevation; void main(){elevation=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`uniform vec3 rim,upper; varying float elevation;
        void main(){gl_FragColor=vec4(mix(rim,upper,smoothstep(-.035,.65,elevation)),1.);
        #include <colorspace_fragment>
        }`,
      side:THREE.BackSide,depthWrite:false
    }));
    sky.position.y=1.6;sky.name='eye-sky';sky.renderOrder=-2;distance.add(sky);
  }
  function furniture(){
    const wood=mat(D.dark?0x936c4c:0xc19167,{map:woodTexture(),roughness:.68}),iron=mat(0x474f50,{metalness:.48});
    const brass=mat(0xe2a94d,{metalness:.55,roughness:.29});
    // Logical dimensions below are street metres. At 1:16 this worktop is 1.20 × 2.00 m, 0.76 m high.
    wood.map.repeat.set(3,2);
    const top=block(bench,[19.2,.55,32],[0,-.38,-14.55],wood);top.name='worktop';
    const rim=mat(0x65402b,{roughness:.56}),foot=mat(0x464b48,{metalness:.48});
    for(const x of [-9.28,9.28])block(bench,[.42,.68,31.7],[x,-.73,-14.55],rim);
    for(const z of [1.15,-30.23])block(bench,[18.5,.68,.42],[0,-.73,z],rim);
    for(const x of [-8.8,8.8])for(const z of [1.05,-30.08]){
      block(bench,[.55,.045,.55],[x,-.079,z],iron);
      solid(bench,new THREE.CylinderGeometry(.08,.08,.035,12),brass,V([x,-.045,z]));
    }
    for(const x of [-8.6,8.6])for(const z of [.42,-29.5]){
      block(bench,[.82,11.3,.82],[x,-6.39,z],wood);
      block(bench,[.89,.28,.89],[x,-12.03,z],foot);
    }
    for(const x of [-8.6,8.6])block(bench,[.40,.75,30],[x,-8.6,-14.55],wood);
    for(const z of [.42,-29.5])block(bench,[17.2,.85,.47],[0,-2,z],wood);
    const floor=mat(D.dark?0x504e46:0xa49b88),plaster=mat(D.dark?0x757875:0xcac4b2);
    block(bench,[100,.3,106],[0,-12.32,-18],floor);
    block(bench,[100,43,.45],[0,8.9,-43],plaster);
    block(bench,[.45,43,86],[-25,8.9,-10],plaster);
    const sash=mat(D.dark?0x575b54:0x827654),daylight=mat(D.dark?0xa8beb0:0xd0e2dc,{emissive:0xaac6b9,emissiveIntensity:.22});
    block(bench,[16,12,.36],[-9,10,-42.65],sash);
    for(const x of [-12.62,-5.38])for(const y of [7.2,12.8])block(bench,[6.84,5.14,.16],[x,y,-42.40],daylight);
    block(bench,[17,.48,1.04],[-9,3.83,-42.38],wood);
    for(let i=0;i<8;i++)block(bench,[.035,6,.20],[-24.75,-8.9,8-i*5.3],rim);
    block(bench,[.18,.25,86],[-24.65,-5.65,-10],wood);
    const brick=mat(D.dark?0x956b55:0xb87f64);
    block(bench,[.23,2.08,1.08],[-.37,1.04,.27],plaster);
    block(bench,[.28,.07,1.13],[-.37,2.09,.27],wood);
    for(let row=0;row<3;row++)for(let col=0;col<2;col++)
      block(bench,[.018,.16,.24],[-.247,.29+row*.19,.16+col*.27+(row%2)*.095],brick);
    block(bench,[.035,.32,.22],[-.238,1.6,0],iron);
    for(const y of [1.49,1.71])dot(bench,V([-.211,y,0]),.027,brass);
    bar(bench,V([-.23,1.60,0]),V([-.09,1.60,0]),.027,iron);
    const ring=solid(bench,new THREE.TorusGeometry(.086,.022,12,32),brass,V([0,1.6,0]));
    ring.name='wall-eyelet';
    // 拉線越過釘環並由鉛錘拉緊。
    bar(bench,V([0,1.60,0]),V([-.071,1.12,.075]),.009,iron);
    solid(bench,new THREE.ConeGeometry(.062,.13,12),brass,V([-.071,1.07,.075])).rotation.z=Math.PI;
    bar(bench,V([-.66,.035,.82]),V([-1.64,.035,.6]),.027,wood);
    bar(bench,V([-1.64,.035,.6]),V([-1.75,.035,.572]),.016,iron);
  }
  function surface(corners,material){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(corners.flatMap(v=>v.toArray()),3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();
    const o=new THREE.Mesh(g,material);rig.add(o);return o;
  }
  function instrument(guides){
    clear(rig);
    const {cam,sheet:s}=cur, depth=C.FRAME_DEPTH, k=depth/s.focalLength;
    const P=(u,v)=>V(C.onPlane(cam,[u,v],depth));
    const corners=[P(-s.u,-s.v),P(s.u,-s.v),P(s.u,s.v),P(-s.u,s.v)];
    const wood=mat(0xe2b37b,{map:woodTexture(),roughness:.58}),brass=mat(0xffbd58,{roughness:.34,metalness:.42}),
      iron=mat(0x495150,{roughness:.5,metalness:.5});
    for(let i=0;i<4;i++){
      bar(rig,corners[i],corners[(i+1)%4],.052,wood,true);
      dot(rig,corners[i],.066,brass);
    }
    for(const u of [-s.u,s.u]){
      const pivot=P(u,0),foot=pivot.clone();foot.y=.08;
      bar(rig,foot,pivot,.043,iron);block(rig,[.40,.11,.40],[foot.x,.05,foot.z],wood);
      dot(rig,pivot,.074,brass);
    }
    for(let i=1;i<12;i++){
      const u=s.u*(i/6-1);bar(rig,P(u,-s.v),P(u,-s.v+.027),.007,brass);
    }
    const target=targets[targetIndex],uv=target?.uv??[0,0];
    const cordH=new THREE.MeshBasicMaterial({color:D.dark?0x94deda:0x226f72});
    const cordV=new THREE.MeshBasicMaterial({color:D.dark?0xffaa8c:0xa83e2a});
    const horizontal=bar(rig,P(-s.u,uv[1]),P(s.u,uv[1]),.011,cordH);
    const vertical=bar(rig,P(uv[0],-s.v),P(uv[0],s.v),.011,cordV);
    horizontal.name='sliding-horizontal';vertical.name='sliding-vertical';
    for(const [u,v] of [[-s.u,uv[1]],[s.u,uv[1]],[uv[0],-s.v],[uv[0],s.v]]){
      dot(rig,P(u,v),.045,brass);
    }
    if(target){
      if(!boardClosed){
        const thread=new THREE.MeshBasicMaterial({color:D.dark?0xffd389:0x92521a});
        const ray=bar(rig,V(cam.eye),V(target.vertex),.013,thread);
        ray.castShadow=false;ray.name='sight-thread';
      }
      const cross=dot(rig,V(target.hit),.049,brass);
      cross.userData.corner=target.corner;cross.userData.owner=target.owner;cross.userData.guide=guides;
    }

    // 畫板右側鉸鏈的局部 x、y 與紙面平行。打點永遠存成紙面座標，開闔不改點位。
    const hinge=new THREE.Group();rig.add(hinge);hinge.position.copy(P(s.u,0));
    hinge.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(cam.right),V(cam.up),V(cam.forward).negate()));
    for(const v of [-s.v*.68,s.v*.68])bar(rig,P(s.u,v-.065),P(s.u,v+.065),.044,iron);
    const leaf=new THREE.Group();hinge.add(leaf);leaf.name='hinged-marking-board';
    leaf.rotation.y=boardClosed?0:-105*Math.PI/180;
    const width=2*s.u*k,height=2*s.v*k;
    // 紙朝街景一側貼在實心板上。板往街景方向翻開，開口與打點面可並排觀察。
    block(leaf,[width+.05,height+.05,.067],[-width/2,0,.036],wood);
    const paperMaterial=mat(D.dark?0xddc9a1:0xffebc8,{emissive:0x57452d,emissiveIntensity:.24,roughness:.92});
    const page=solid(leaf,new THREE.PlaneGeometry(width,height),paperMaterial,V([-width/2,0,.001]));
    page.rotation.y=Math.PI;page.name='opaque-drawing-paper';page.castShadow=false;
    for(const x of [-width+.015,-.015])block(leaf,[.025,height,.01],[x,0,-.002],wood);
    const graphite=mat(0x514239);
    markerMounts=[];
    for(const [key,q] of getMarks()){
      if(!C.inside(q,s))continue;
      const at=V([(q[0]-s.u)*k,q[1]*k,0]);
      const mark=solid(leaf,new THREE.CircleGeometry(.033,16),graphite,at);
      mark.rotation.y=Math.PI;mark.userData.transfer=key;markerMounts.push(mark);mark.castShadow=false;
      const rim=solid(leaf,new THREE.RingGeometry(.054,.065,24),graphite,at);
      rim.rotation.y=Math.PI;rim.castShadow=false;
    }
    // 專供眼點核對的素描疊圖。旁觀時木框是中空的，只有兩條滑線跨過開口。
    sheetMesh=surface(corners,new THREE.MeshBasicMaterial({map:sketch,side:THREE.DoubleSide,toneMapped:false,fog:false,depthTest:false,depthWrite:false,transparent:true,opacity:.40}));
    sheetMesh.name='eye-only-comparison';sheetMesh.renderOrder=5;
    leaf.updateWorldMatrix(true,false);
    mounts=[V([0,1.75,0]),P(uv[0],uv[1]),leaf.localToWorld(V([-width*.52,height*.36,0])).sub(model.position).divideScalar(scale)];
    onRigState({available:targets.length,target:target?{owner:target.owner,corner:target.corner}:null,closed:boardClosed,dots:getMarks().size});
    layers();
    pointCamera();
  }
  function layers(){
    renderer.shadowMap.needsUpdate=true;
    bench.visible=!eyeMode;distance.visible=eyeMode;
    town.visible=studio.visible=true;
    for(const o of rig.children){
      if(o===sheetMesh)o.visible=eyeMode && showSketch;
      else {
        const mark=o.userData.corner!=null;
        o.visible=!eyeMode || (!showSketch && mark && o.userData.guide);
        if(mark)o.scale.setScalar(eyeMode?.28:1);
      }
    }
  }
  function pointCamera(){
    if(!cur)return;
    const {cam,sheet}=cur;
    eyeCamera.position.copy(V(cam.eye).multiplyScalar(scale).add(model.position));eyeCamera.up.copy(V(cam.up));
    eyeCamera.lookAt(eyeCamera.position.clone().add(V(cam.forward)));
    eyeCamera.fov=sheet.verticalFov;eyeCamera.aspect=sheet.aspect;eyeCamera.updateProjectionMatrix();
  }
  function preset(toEye){
    eyeMode=toEye;controls.enabled=!eyeMode;navBar.hidden=eyeMode;
    if(!toEye){
      const aspect=(host.clientWidth||1)/(host.clientHeight||1);
      controls.target.copy(V([.10,1.65,-3.7]).multiplyScalar(scale).add(model.position));
      side.position.copy(controls.target).add(new THREE.Vector3(8.1,4.9,8.6).multiplyScalar(scale*(aspect<1.38?1.14:1)));
      controls.update();nav.home();
    }
    pointCamera();layers();
    request();
  }
  function paint(){
    frame=0;if(disposed || document.hidden)return;
    if(!eyeMode)controls.update();
    const w=host.clientWidth,h=host.clientHeight;if(!w || !h)return;
    const pixelRatio=renderer.getPixelRatio();
    if(canvas.width!==Math.floor(w*pixelRatio) || canvas.height!==Math.floor(h*pixelRatio)){
      renderer.setSize(w,h,false);side.aspect=w/h;side.updateProjectionMatrix();
    }
    // 初次畫布剛好 300×150 時也要設好相機比例。
    if(side.aspect!==w/h){side.aspect=w/h;side.updateProjectionMatrix();}
    renderer.render(scene,eyeMode?eyeCamera:side);
    paintMarks(w,h,pixelRatio);
  }
  function paintMarks(w,h,dpr){
    if(ink.width!==canvas.width||ink.height!==canvas.height){ink.width=canvas.width;ink.height=canvas.height;}
    pen.setTransform(dpr,0,0,dpr,0,0);pen.clearRect(0,0,w,h);
    labels.forEach(el=>el.hidden=true);
    const camera=eyeMode?eyeCamera:side;
    const screen=(v,clip=true)=>{const p=v.clone().project(camera);return (!clip||(Math.abs(p.x)<=1&&Math.abs(p.y)<=1))&&p.z>=-1&&p.z<=1?[(p.x+1)*w/2,(1-p.y)*h/2]:null;};
    const at=(v,clip=true)=>screen(v.clone().multiplyScalar(scale).add(model.position),clip);
    const target=targets[targetIndex],cross=target&&at(V(target.hit));
    const outline='#192a2b',ivory='#fff4d8',markColor='#e28a45';
    function glyph(p,mark,factor=1){
      pen.save();pen.translate(...p);pen.scale(factor,factor);
      pen.beginPath();pen.arc(0,0,6,0,2*Math.PI);pen.lineWidth=3.8;pen.strokeStyle=outline;pen.stroke();
      pen.lineWidth=1.8;pen.strokeStyle=ivory;pen.stroke();
      if(mark){pen.beginPath();pen.arc(0,0,3.8,0,2*Math.PI);pen.fillStyle=markColor;pen.fill();}
      else{pen.beginPath();pen.moveTo(-8,0);pen.lineTo(8,0);pen.moveTo(0,-8);pen.lineTo(0,8);
        pen.strokeStyle=outline;pen.lineWidth=3;pen.stroke();pen.strokeStyle=ivory;pen.lineWidth=1.2;pen.stroke();}
      pen.restore();
    }
    const dots=[];
    if(!eyeMode)for(const mark of markerMounts){
      const world=mark.getWorldPosition(new THREE.Vector3());
      const normal=new THREE.Vector3(0,0,1).applyQuaternion(mark.getWorldQuaternion(new THREE.Quaternion()));
      if(normal.dot(side.position.clone().sub(world))<=0)continue;
      const p=screen(world);if(p)dots.push(p);
    }
    if(!eyeMode){
      const focus=!boardClosed&&dots.length?dots[dots.length-1]:cross;
      if(focus){
        const size=w<440?64:86,dx=w-size-7,dy=7;
        pen.save();pen.beginPath();pen.rect(dx,dy,size,size);pen.clip();
        pen.drawImage(canvas,dx+size/2-focus[0]*2,dy+size/2-focus[1]*2,w*2,h*2);
        glyph([dx+size/2,dy+size/2],focus!==cross,2);pen.restore();
        pen.strokeStyle=outline;pen.lineWidth=3;pen.strokeRect(dx,dy,size,size);
        pen.strokeStyle=ivory;pen.lineWidth=1;pen.strokeRect(dx,dy,size,size);
        const labelPx=13*window.LabSettings.get('fs');pen.font='bold '+(labelPx*.75)+'pt system-ui';
        pen.fillStyle=outline;pen.fillRect(dx+1,dy+size-labelPx-5,pen.measureText('2×').width+8,labelPx+4);
        pen.fillStyle=ivory;pen.fillText('2×',dx+5,dy+size-5);
      }
      const boxes=[];
      const cords=target?[[[-cur.sheet.u,target.uv[1]],[cur.sheet.u,target.uv[1]]],[[target.uv[0],-cur.sheet.v],[target.uv[0],cur.sheet.v]]].map(line=>line.map(q=>at(V(C.onPlane(cur.cam,q,C.FRAME_DEPTH)),false))):[];
      if(target&&!boardClosed)cords.push([at(V(cur.cam.eye),false),at(V(target.vertex),false)]);
      function crosses(rect,line){
        if(!line.every(Boolean))return false;
        const [x,y,r,b]=rect,center=[(x+r)/2,(y+b)/2];
        return !!C.clipLine(...line.map(p=>C.sub(p,center)),{u:(r-x)/2+2,v:(b-y)/2+2});
      }
      [1,0,2].forEach(i=>{
        const el=labels[i],p=mounts[i]&&at(mounts[i]);if(!p || (i===1&&!target))return;
        el.hidden=false;const ew=el.offsetWidth,eh=el.offsetHeight;
        const candidates=[[20,-32],[20,16],[-ew-20,-32],[-ew-20,16],[12,-58],[-ew-14,45],[20,42],[-ew-16,-65]];
        const rect=candidates.map(([dx,dy])=>{const x=Math.min(w-ew-3,Math.max(3,p[0]+dx)),y=Math.min(h-eh-4,Math.max(4,p[1]+dy));return [x,y,x+ew,y+eh];})
          .find(b=>!boxes.some(a=>a[0]<b[2]+3&&a[2]>b[0]-3&&a[1]<b[3]+3&&a[3]>b[1]-3)&&!cords.some(l=>crosses(b,l))&&
            !(b[2]>w-100&&b[1]<100)&&!(b[0]<100&&b[3]>h-55));
        if(!rect){el.hidden=true;return;}
        boxes.push(rect);el.style.left=rect[0]+'px';el.style.top=rect[1]+'px';
        const end=[Math.max(rect[0],Math.min(p[0],rect[2])),Math.max(rect[1],Math.min(p[1],rect[3]))];
        pen.beginPath();pen.moveTo(...p);pen.lineTo(...end);pen.strokeStyle=ivory;pen.lineWidth=2.4;pen.stroke();pen.strokeStyle=outline;pen.lineWidth=1;pen.stroke();
      });
    }
    if(cross&&(!eyeMode||drawGuides))glyph(cross,false);
    dots.forEach(p=>glyph(p,true));
    ink.dataset.crossDiameter=cross?'16':'0';ink.dataset.dotDiameter=dots.length?'12':'0';
  }
  function request(){if(!disposed && !frame && !document.hidden)frame=requestAnimationFrame(paint);}
  function sync(r,main,pal,guides){
    cur=r;drawGuides=guides;
    if(pal!==colors){
      colors=pal;clear(town);clear(bench);clear(distance);eyeEnvironment(pal);
      architecture(town,[C.streetscape[0]],pal,false);
      architecture(town,C.streetscape.slice(1),pal);furniture();
      const bg=D.mix(pal.sky,D.c.surface,.32);scene.background=new THREE.Color(bg);scene.fog=new THREE.Fog(bg,4.2,10);
      hemi.intensity=D.dark?1.27:1.65;sun.intensity=D.dark?1.63:2.0;mainObject=null;rigKey='';
    }
    if(main!==mainObject){clear(studio);architecture(studio,[main],pal);mainObject=main;}
    const framing=[...Object.values(r.p),r.sheet.aspect].join('|');
    if(framing!==sceneKey){
      sceneKey=framing;targets=C.frameTargets(r);targetIndex=0;boardClosed=false;
    }
    const key=framing+'|'+guides;
    if(key!==rigKey){rigKey=key;instrument(guides);}
    sketch.needsUpdate=true;request();
  }
  function rebuildRig(){instrument(drawGuides);request();}
  function nextCorner(){
    if(!targets.length || boardClosed)return;
    targetIndex=(targetIndex+1)%targets.length;rebuildRig();
  }
  function toggleBoard(){
    const t=targets[targetIndex];if(!t)return;
    boardClosed=!boardClosed;
    if(boardClosed)getMarks(true).set(t.key,t.uv.slice());
    rebuildRig();
  }
  function refreshMarks(){boardClosed=false;rebuildRig();}
  const resize=new ResizeObserver(request);resize.observe(host);
  const visibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else request();};
  const reduced=()=>{controls.enableDamping=!motion.matches;request();};
  const lost=e=>{e.preventDefault();if(!disposed)onLost();};
  controls.addEventListener('change',request);document.addEventListener('visibilitychange',visibility);
  motion.addEventListener('change',reduced);canvas.addEventListener('webglcontextlost',lost);
  return {preset,sync,nextCorner,toggleBoard,refreshMarks,overlay(value){showSketch=value;layers();request();},
    paperChanged(){if(eyeMode){sketch.needsUpdate=true;request();}},dispose(){
    disposed=true;cancelAnimationFrame(frame);resize.disconnect();canvas.removeEventListener('webglcontextlost',lost);
    motion.removeEventListener('change',reduced);document.removeEventListener('visibilitychange',visibility);
    controls.removeEventListener('change',request);nav.dispose();controls.dispose();
    [rig,studio,town,bench,distance].forEach(clear);sketch.dispose();sun.shadow.dispose();renderer.dispose();renderer.forceContextLoss();
    labels.forEach(el=>el.remove());ink.remove();canvas.remove();
  }};
}
