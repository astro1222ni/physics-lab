/* 同一張決策表的實體桌上地形。顏色與高度均取自 core 在三角切面上的精確分片。 */
import * as THREE from '../vendor/three/three.module.min.js';
import {OrbitControls} from '../vendor/three/OrbitControls.js';

export function makeTerrain(host, initial, moveFlag, T, lost) {
  const D=window.LabDraw, c=D.c;
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;
  const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label',T('可拖旗的權重地形。方向鍵微調旗子，拖空白處轉動或平移。','Draggable weight terrain. Arrow keys nudge the flag. Drag empty space to orbit or pan.'));
  host.prepend(canvas);
  const scene=new THREE.Scene(), cam=new THREE.OrthographicCamera(-5,5,4,-4,.05,80);
  const controls=new OrbitControls(cam,canvas);
  controls.minZoom=.6;controls.maxZoom=4;controls.maxPolarAngle=Math.PI*.465;
  controls.enableDamping=!matchMedia('(prefers-reduced-motion: reduce)').matches;controls.dampingFactor=.16;
  // view3d-nav also uses the perspective camera's distance for its +/- buttons.
  // Translate those moves into orthographic zoom without changing the target.
  const nav=LabView3DNav.attach({THREE,controls,host,canvas,radius:4.5,T});
  const base=new THREE.Group(), relief=new THREE.Group(), pin=new THREE.Group();
  scene.add(base,relief,pin);
  const corners=[[0,-2.4],[-2.9,2.02],[2.9,2.02]], scale=1.65, ground=.24;
  const position=(p,h)=>new THREE.Vector3(p.reduce((n,x,i)=>n+x*corners[i][0],0),ground+h*scale,p.reduce((n,x,i)=>n+x*corners[i][1],0));
  function bary(x,z){const a=(2.02-z)/4.42;return [a,(1-a-x/2.9)/2,(1-a+x/2.9)/2];}
  const hemi=new THREE.HemisphereLight(0xffffff,0x76726a,2.05);
  const sun=new THREE.DirectionalLight(0xfff2db,2.7);sun.position.set(-4,9,4);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:.25,far:24});
  sun.shadow.mapSize.set(1024,1024);sun.shadow.normalBias=.016;sun.shadow.bias=-.0003;scene.add(hemi,sun);
  const mat=(color,opts={})=>new THREE.MeshStandardMaterial({color,roughness:.72,...opts});
  function mesh(parent,geo,material,x=0,y=0,z=0){
    const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  }
  function texture(painter,w,h){
    const a=document.createElement('canvas');a.width=w;a.height=h;painter(a.getContext('2d'),w,h);
    const t=new THREE.CanvasTexture(a);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());return t;
  }
  function disposeGroup(group){
    const materials=new Set(), geometries=new Set();
    group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>{m.map?.dispose();m.dispose();});group.clear();
  }
  function stroke(group,vertices,color,opacity=1){
    const g=new THREE.BufferGeometry().setFromPoints(vertices);
    group.add(new THREE.Line(g,new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity})));
  }
  function desk(){
    disposeGroup(base);
    scene.background=new THREE.Color(D.mix(c['canvas-bg'],c.equi,.10));
    const table=texture((g,w,h)=>{
      g.fillStyle=D.mix(c['canvas-bg'],c.equi,D.dark?.22:.27);g.fillRect(0,0,w,h);
      for(let i=0;i<105;i++){const y=i*h/104+Math.sin(i*1.8)*2;g.beginPath();g.moveTo(0,y);g.bezierCurveTo(w*.36,y+Math.sin(i)*7,w*.68,y-5,w,y+Math.cos(i)*3);
        g.strokeStyle=D.alpha(c.equi,.035+(i%6)*.008);g.lineWidth=1+i%3;g.stroke();}
    },600,390);
    const tableTop=mesh(base,new THREE.PlaneGeometry(65,50),mat('#ffffff',{map:table}),0,-.18);tableTop.rotation.x=-Math.PI/2;
    const cover=mat(D.mix(c.accent,c.text,.35)), page=mat(D.shade(c['canvas-bg'],D.dark?.18:-.09));
    mesh(base,new THREE.BoxGeometry(7.65,.095,5.62),cover,0,-.08,0);
    mesh(base,new THREE.BoxGeometry(7.49,.19,5.45),page,0,.035,0);
    for(let y=0;y<4;y++)stroke(base,[new THREE.Vector3(-3.7,-.02+y*.035,2.73),new THREE.Vector3(3.72,-.02+y*.035,2.73)],D.shade(c.muted,.1),.42);
    const graph=texture((g,w,h)=>{
      g.fillStyle=D.mix(c['canvas-bg'],c.equi,.05);g.fillRect(0,0,w,h);
      for(let x=0;x<w;x+=18){g.strokeStyle=D.alpha(c.muted,x%90===0?.3:.12);g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}
      for(let y=0;y<h;y+=18){g.strokeStyle=D.alpha(c.muted,y%90===0?.3:.12);g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
      g.strokeStyle=D.alpha(c.pos,.55);g.lineWidth=2;g.beginPath();g.moveTo(57,0);g.lineTo(57,h);g.stroke();
    },900,650);
    const paper=mesh(base,new THREE.PlaneGeometry(7.48,5.44),mat('#ffffff',{map:graph}),0,.137,0);paper.rotation.x=-Math.PI/2;
    const metal=mat(D.shade(c.muted,.22),{metalness:.68,roughness:.34});
    for(let i=0;i<8;i++){
      const z=-2.18+i*.62;
      const hole=mesh(base,new THREE.CylinderGeometry(.09,.09,.012,14),mat(D.shade(c.muted,-.38)),-3.49,.143,z);
      const ring=mesh(base,new THREE.TorusGeometry(.19,.034,8,28),metal,-3.61,.18,z);ring.scale.y=.78;hole.receiveShadow=true;
    }
    const pencil=new THREE.Group();pencil.position.set(3.48,.25,-.18);pencil.rotation.y=-.09;base.add(pencil);
    const wood=mat(D.mix(c.equi,'#ffffff',.34)), lacquer=mat(D.mix(c.equi,c.pos,.34)), nib=mat(D.shade(c.field,-.42));
    const barrel=mesh(pencil,new THREE.CylinderGeometry(.078,.078,3.35,6),lacquer);barrel.rotation.x=Math.PI/2;
    const tip=mesh(pencil,new THREE.ConeGeometry(.079,.34,6),wood,0,0,1.84);tip.rotation.x=Math.PI/2;
    const graphite=mesh(pencil,new THREE.ConeGeometry(.027,.11,6),nib,0,0,1.99);graphite.rotation.x=Math.PI/2;
    const ferrule=mesh(pencil,new THREE.CylinderGeometry(.082,.082,.17,16),metal,0,0,-1.74);ferrule.rotation.x=Math.PI/2;
    const eraser=mesh(pencil,new THREE.CylinderGeometry(.073,.073,.17,16),mat(D.shade(c.pos,.42)),0,0,-1.9);eraser.rotation.x=Math.PI/2;
  }
  function flag(){
    disposeGroup(pin);
    const brass=mat(D.shade(c.equi,.2),{metalness:.65,roughness:.31});
    mesh(pin,new THREE.CylinderGeometry(.115,.15,.065,24),brass,0,.045);
    mesh(pin,new THREE.CylinderGeometry(.025,.03,.72,12),brass,0,.4);
    mesh(pin,new THREE.SphereGeometry(.05,12,10),brass,0,.78);
    const cloth=new THREE.BufferGeometry(), coords=[0,.73,0,.23,.67,.06,.45,.63,-.01,0,.48,0,.23,.48,.07,.45,.57,-.01];
    cloth.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));cloth.setIndex([0,3,1,1,3,4,1,4,2,2,4,5]);cloth.computeVertexNormals();
    mesh(pin,cloth,mat(c.pos,{side:THREE.DoubleSide,roughness:.9}));
  }
  const labels=corners.map(()=>{const el=document.createElement('span');el.className='vertex-label';host.append(el);return el;});
  function positionLabels(){
    const w=canvas.clientWidth,h=canvas.clientHeight;
    labels.forEach((el,i)=>{
      const [x,z]=corners[i],p=new THREE.Vector3(x*(i?.9:1),ground+.12,z+(i?.26:-.17)).project(cam);
      const edge=el.offsetWidth/2+4;
      el.style.left=Math.max(edge,Math.min(w-edge,(p.x+1)*w/2))+'px';
      el.style.top=Math.max(12,Math.min(h-12,(1-p.y)*h/2))+'px';
    });
  }
  let faces=[],model=initial,key='',theme=-1;
  function rebuild(){
    disposeGroup(relief);faces=[];
    for(const face of model.facets){
      const pts=face.poly.map(q=>position(q.p,q.h));
      const geometry=new THREE.BufferGeometry().setFromPoints(pts);
      const idx=[];for(let i=1;i<pts.length-1;i++)idx.push(0,i,i+1);
      geometry.setIndex(idx);geometry.computeVertexNormals();
      const faceMat=mat(D.mix(model.inks[face.winner],c.surface,.23),{side:THREE.DoubleSide,roughness:.85});
      const faceMesh=mesh(relief,geometry,faceMat);faces.push(faceMesh);
      let max=0;
      face.poly.forEach((v,i)=>{
        const j=(i+1)%pts.length, next=face.poly[j];max=Math.max(max,v.h);
        if(v.h<1e-8&&next.h<1e-8)stroke(relief,[pts[i].clone().add(new THREE.Vector3(0,.014,0)),pts[j].clone().add(new THREE.Vector3(0,.014,0))],c.text,.9);
        if(v.p.some((x,k)=>x<1e-8&&next.p[k]<1e-8)){
          const lower=pt=>new THREE.Vector3(pt.x,.146,pt.z);
          const wall=new THREE.BufferGeometry().setFromPoints([pts[i],pts[j],lower(pts[j]),lower(pts[i])]);wall.setIndex([0,1,2,0,2,3]);wall.computeVertexNormals();
          mesh(relief,wall,mat(D.shade(model.inks[face.winner],-.28),{side:THREE.DoubleSide}));
        }
      });
      // True iso-margin lines. Every contour is a plane cut of the same analytical facet.
      for(let height=.1;height<max;height+=.1){
        const ends=[];
        face.poly.forEach((a,i)=>{
          const b=face.poly[(i+1)%pts.length];if((a.h<height)===(b.h<height))return;
          ends.push(pts[i].clone().lerp(pts[(i+1)%pts.length],(height-a.h)/(b.h-a.h)).add(new THREE.Vector3(0,.008,0)));
        });
        if(ends.length===2)stroke(relief,ends,D.mix(model.inks[face.winner],c.text,.62),.72);
      }
    }
    model.axes.forEach((name,i)=>{labels[i].textContent=name;});
  }
  let pending=0,dead=false;
  function invalidate(){
    if(dead||document.hidden||pending)return;
    pending=requestAnimationFrame(()=>{pending=0;if(dead||document.hidden)return;controls.update();renderer.render(scene,cam);positionLabels();});
  }
  function update(next){
    model=next;const newKey=JSON.stringify([next.axes,next.facets],(k,v)=>typeof v==='number'?+v.toFixed(8):v);
    if(theme!==next.theme){theme=next.theme;desk();flag();key='';}
    if(key!==newKey){key=newKey;rebuild();}
    pin.position.copy(position(next.bary,next.gap));invalidate();
  }
  function fit(){
    const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const aspect=rect.width/rect.height, half=Math.max(2.97,4.02/aspect);
    cam.left=-half*aspect;cam.right=half*aspect;cam.top=half;cam.bottom=-half;
    cam.updateProjectionMatrix();renderer.setSize(rect.width,rect.height,false);invalidate();
  }
  let lastDistance=0,presetting=false;
  function cameraPreset(top){
    presetting=true;cam.zoom=1;controls.target.set(0,.27,.08);
    cam.position.set(...(top?[0,10,.09]:[2.2,6.45,7.45]));cam.updateProjectionMatrix();controls.update();
    lastDistance=cam.position.distanceTo(controls.target);presetting=false;nav.home();invalidate();
  }
  const cameraChange=()=>{
    const distance=cam.position.distanceTo(controls.target);
    if(!presetting&&lastDistance && Math.abs(distance-lastDistance)>.001){
      cam.zoom=THREE.MathUtils.clamp(cam.zoom*lastDistance/distance,.6,4);cam.updateProjectionMatrix();
    }
    lastDistance=distance;invalidate();
  };
  controls.addEventListener('change',cameraChange);
  const ray=new THREE.Raycaster(), screen=new THREE.Vector2(), plane=new THREE.Plane(new THREE.Vector3(0,1,0),-ground);
  function project(vec,r){const p=vec.clone().project(cam);return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}
  let held=null;
  function down(e){
    if(held||e.button!==0)return;
    const r=canvas.getBoundingClientRect(), foot=project(pin.position,r),tip=project(pin.position.clone().add(new THREE.Vector3(.16,.65,0)),r);
    const dx=tip.x-foot.x,dy=tip.y-foot.y,t=THREE.MathUtils.clamp(((e.clientX-foot.x)*dx+(e.clientY-foot.y)*dy)/(dx*dx+dy*dy||1),0,1);
    if(Math.hypot(e.clientX-foot.x-t*dx,e.clientY-foot.y-t*dy)>23)return;
    held={id:e.pointerId,dx:foot.x-e.clientX,dy:foot.y-e.clientY};controls.enabled=false;
    canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';e.stopImmediatePropagation();e.preventDefault();
  }
  function move(e){
    if(held?.id!==e.pointerId)return;e.stopImmediatePropagation();const r=canvas.getBoundingClientRect();
    screen.set(((e.clientX+held.dx-r.left)/r.width)*2-1,1-((e.clientY+held.dy-r.top)/r.height)*2);
    ray.setFromCamera(screen,cam);const hit=ray.intersectObjects(faces,false)[0]?.point||ray.ray.intersectPlane(plane,new THREE.Vector3());
    if(hit)moveFlag(bary(hit.x,hit.z));
  }
  function up(e){if(held?.id!==e.pointerId)return;held=null;controls.enabled=true;canvas.style.cursor='';e.stopImmediatePropagation();}
  function keymove(e){
    const dir={ArrowUp:1,ArrowLeft:3,ArrowRight:5,ArrowDown:7}[e.key];
    if(dir===undefined||e.shiftKey)return;e.preventDefault();e.stopImmediatePropagation();
    const d=LabVPad.delta(dir,.02),b=model.bary;moveFlag([b[0]+d.y,b[1]-d.x/2-d.y/2,b[2]+d.x/2-d.y/2]);
  }
  const lostContext=e=>{e.preventDefault();if(!dead)lost();};
  canvas.addEventListener('webglcontextlost',lostContext);canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move,true);
  canvas.addEventListener('pointerup',up,true);canvas.addEventListener('pointercancel',up,true);canvas.addEventListener('lostpointercapture',up,true);canvas.addEventListener('keydown',keymove,true);
  const observer=new ResizeObserver(fit);observer.observe(host);document.addEventListener('visibilitychange',invalidate);
  cameraPreset(false);update(initial);fit();
  return {update,cameraPreset,dispose(){
    dead=true;cancelAnimationFrame(pending);observer.disconnect();document.removeEventListener('visibilitychange',invalidate);
    controls.removeEventListener('change',cameraChange);controls.dispose();nav.dispose();canvas.removeEventListener('webglcontextlost',lostContext);
    labels.forEach(el=>el.remove());disposeGroup(base);disposeGroup(relief);disposeGroup(pin);sun.shadow.map?.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();
  }};
}
